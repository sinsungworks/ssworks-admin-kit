import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  evaluateIpAccess,
  type AdminIpPreviewQuery,
  type AdminIpRuleCreate,
  type AdminIpRuleRemove,
  type AdminIpRuleUpdate,
  type IpScope,
  type IpScopeType,
  type IpSubject,
} from '@ssworks/admin-shared'
import type { Request } from 'express'
import { sql, type Kysely, type Transaction } from 'kysely'
import { reauthenticate } from '../accounts/reauth.js'
import { withSuperAdminSurvival, type SurvivalCount } from '../accounts/super-admin.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { clientIpOf } from '../auth/request-meta.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_IP_ACCESS_CONFIG, KYSELY } from '../tokens.js'
import { assertIpScope, ruleRevisionConflict, selfLockout } from './errors.js'
import type { ResolvedIpAccessConfig } from './options.js'
import {
  buildLockoutCandidates,
  nextRulesOf,
  previewIpLockout,
  stripRuleNo,
  type IpLockoutPreview,
} from './preview.js'
import {
  activeSessionsQuery,
  activeUsersQuery,
  identifiedRulesQuery,
  ruleViewQuery,
  teamMappingsQuery,
} from './queries.js'
import { lockRule, lockScopeRef, type LockedRule } from './rule-locks.js'
import { ipRuleSetQuery } from './rule-set.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts(목록 · 미리보기 · 만들기 · 수정 · 삭제)
// 바꾼 점:
//  - 쓰기 셋은 withSuperAdminSurvival(…, { ipAware: true }) 안이다 — 잔존 가드 행이 첫 문장, 잠금 단계(대상 규칙 · 가리키는
//    팀/사용자 행) → 셈 → 쓰기 → 후 셈(2f-1 스펙 §5-3). hangang 은 규칙 전 구간 FOR UPDATE → 가드의 2단 잠금이었다.
//  - 🔴 자기 잠금은 쓴 뒤의 결과 상태로 판정한다(P6) — 같은 트랜잭션에서 규칙을 다시 읽어 요청자를 평가한다. hangang 의 "다음
//    규칙 시뮬레이션" 은 미리보기에만 남는다.
//  - 재인증은 코어 reauth 옵션(hangang 은 늘), 규칙 행에 revision(Phase 0 §4 #4).
//  - 감사 diff 는 컨트롤러가 커밋 뒤에 붙인다 — 409 로 롤백된 변경을 after 로 남기지 않는다(hangang I3).
// 🔴 재인증은 트랜잭션 밖이다 — argon2 가 가드 행을 쥔 채 돌면 모든 잔존 쓰기가 그 뒤에 줄을 선다(hangang Task 12).

export type AdminIpRuleCreateBody = AdminIpRuleCreate & { currentPassword?: string }
export type AdminIpRuleUpdateBody = AdminIpRuleUpdate & { currentPassword?: string }
export type AdminIpRuleRemoveBody = AdminIpRuleRemove & { currentPassword?: string }

/** 목록 · 응답의 행 — admin-shared adminIpRuleSchema 와 같은 모양(시각은 ISO 문자열) */
export type AdminIpRuleView = {
  ruleNo: bigint
  scopeType: IpScopeType
  scopeRefNo: bigint | null
  scopeName: string | null
  scopeUserId: string | null
  cidr: string
  description: string | null
  revision: number
  createAt: string
  updateAt: string
}

/** 감사 before · after — 규칙 행 전체가 변경 대상이다(hangang I3) */
export type IpRuleAuditView = {
  scopeType: IpScopeType
  scopeRefNo: bigint | null
  cidr: string
  description: string | null
}

export const IP_RULE_AUDIT_FIELDS = ['scopeType', 'scopeRefNo', 'cidr', 'description'] as const

export type AdminIpPreviewView = IpLockoutPreview & {
  clientIp: string | null
  clientPasses: boolean
}

/** 🔴 IP 쓰기는 늘 IP 를 아는 셈이다 — 토큰 유무와 무관(P3) */
const IP_WRITE: SurvivalCount = Object.freeze({ ipAware: true })

type RuleViewRow = {
  ruleNo: bigint
  scopeType: IpScopeType
  scopeRefNo: bigint | null
  teamName: string | null
  userName: string | null
  userId: string | null
  cidr: string
  description: string | null
  revision: number
  createAt: Date
  updateAt: Date
}

function toRuleView(row: RuleViewRow): AdminIpRuleView {
  return {
    ruleNo: row.ruleNo,
    scopeType: row.scopeType,
    scopeRefNo: row.scopeRefNo,
    scopeName:
      row.scopeType === 'team' ? row.teamName : row.scopeType === 'user' ? row.userName : null,
    scopeUserId: row.scopeType === 'user' ? row.userId : null,
    cidr: row.cidr,
    description: row.description,
    revision: row.revision,
    createAt: row.createAt.toISOString(),
    updateAt: row.updateAt.toISOString(),
  }
}

function auditViewOf(rule: IpRuleAuditView): IpRuleAuditView {
  return {
    scopeType: rule.scopeType,
    scopeRefNo: rule.scopeRefNo,
    cidr: rule.cidr,
    description: rule.description,
  }
}

/** 요청자 — 주체의 userNo · 대표 팀(인증이 고른 팀) */
function subjectOf(principal: AdminPrincipal): IpSubject {
  return { userNo: principal.userNo, teamNos: principal.teamNo === null ? [] : [principal.teamNo] }
}

async function readRuleView(db: Kysely<AdminDatabase>, ruleNo: bigint): Promise<AdminIpRuleView> {
  return toRuleView(
    await ruleViewQuery(db).where('r.ruleNo', '=', ruleNo).executeTakeFirstOrThrow(),
  )
}

/**
 * 🔴 쓴 뒤의 결과 상태로 판정한다(P6) — 같은 트랜잭션이라 자기 쓰기가 보인다. 거부면 던져 롤백한다. 가드 뒤 비잠금 읽기라
 *    다른 IP 쓰기의 커밋을 모두 본다(IP 쓰기끼리는 가드에서 줄을 선다).
 */
async function assertNotSelfLockout(
  trx: Transaction<AdminDatabase>,
  clientIp: string | null,
  actor: IpSubject,
): Promise<void> {
  const rules = await ipRuleSetQuery(trx).execute()
  if (!evaluateIpAccess(clientIp, rules, actor)) throw selfLockout(clientIp)
}

@Injectable()
export class AdminIpAccessService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_IP_ACCESS_CONFIG) private readonly config: ResolvedIpAccessConfig,
    // 🔴 @Optional — AdminAuthModule 이 빠진 앱이 DI 해석 오류가 아니라 모듈 기동 검사의 문구로 멈추게(2c R2 와 같은 이유)
    @Optional() private readonly reauthService?: AdminReauthService,
  ) {}

  /** 요청자 주소 — 인증 · 감사와 같은 출처(코어 옵션 clientIp) */
  clientIpOf(req: Request): string | null {
    return clientIpOf(req, this.config.clientIp)
  }

  async list(): Promise<{ items: AdminIpRuleView[] }> {
    const rows = await runQuery(() => ruleViewQuery(this.db).execute())
    return { items: rows.map(toRuleView) }
  }

  /** 🔴 잠금 · 트랜잭션 · 감사 · 재인증이 없다 — 읽은 순간의 스냅숏이라 저장이 409 일 수 있다 */
  async preview(
    query: AdminIpPreviewQuery,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<AdminIpPreviewView> {
    // 🔴 now 를 한 번만 — 쿼리마다 new Date() 면 경계에 걸친 퇴사 · 만료가 서로 다르게 판정된다(hangang)
    const now = new Date()
    const current = await runQuery(() => identifiedRulesQuery(this.db).execute())
    const next = nextRulesOf(current, query)
    const users = await runQuery(() => activeUsersQuery(this.db, now).execute())
    const userNos = users.map((user) => user.userNo)
    // 🔴 빈 IN () 은 구문 오류다 — 사용자가 없는 저장소가 실재한다(hangang)
    const mappings =
      userNos.length === 0
        ? []
        : await runQuery(() => teamMappingsQuery(this.db, userNos).execute())
    const sessions =
      userNos.length === 0
        ? []
        : await runQuery(() => activeSessionsQuery(this.db, userNos, now).execute())
    const preview = previewIpLockout(
      buildLockoutCandidates(users, mappings, sessions),
      current.map(stripRuleNo),
      next,
    )
    return {
      clientIp,
      // 🔴 저장 때 자기 잠금이 쓰는 바로 그 판정이다 — false 면 저장은 409 다
      clientPasses: evaluateIpAccess(clientIp, next, subjectOf(principal)),
      ...preview,
    }
  }

  async create(
    body: AdminIpRuleCreateBody,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<{ item: AdminIpRuleView }> {
    const scope: IpScope = { scopeType: body.scopeType, scopeRefNo: body.scopeRefNo }
    assertIpScope(scope)
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = subjectOf(principal)
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(
        trx,
        {
          // 🔴 잠금 읽기만(2d-3 C2) — 가리키는 팀 · 사용자 행
          lock: () => lockScopeRef(trx, scope),
          write: async () => {
            const inserted = await trx
              .insertInto('ipAccessRules')
              .values({
                scopeType: scope.scopeType,
                scopeRefNo: scope.scopeRefNo,
                cidr: body.cidr,
                description: body.description ?? null,
              })
              .executeTakeFirstOrThrow()
            const ruleNo = inserted.insertId as bigint
            await assertNotSelfLockout(trx, clientIp, actor)
            return { item: await readRuleView(trx, ruleNo) }
          },
        },
        IP_WRITE,
      ),
    )
  }

  async update(
    ruleNo: bigint,
    body: AdminIpRuleUpdateBody,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<{ item: AdminIpRuleView; before: IpRuleAuditView; after: IpRuleAuditView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = subjectOf(principal)
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(
        trx,
        {
          // 🔴 잠금 읽기 · 판정만 — 대상 규칙 → revision → 병합 결과 불변식 → 병합 결과의 참조 행
          lock: async (): Promise<{ target: LockedRule; scope: IpScope }> => {
            const target = await lockRule(trx, ruleNo)
            if (body.revision !== target.revision) throw ruleRevisionConflict()
            // 🔴 병합 결과가 판정 대상이다(hangang R30) — global 행에 scopeType: 'user' 만 보내면 어느 층에도 안 걸리는 행이 된다
            const scope: IpScope = {
              scopeType: body.scopeType ?? target.scopeType,
              scopeRefNo: body.scopeRefNo !== undefined ? body.scopeRefNo : target.scopeRefNo,
            }
            assertIpScope(scope)
            await lockScopeRef(trx, scope)
            return { target, scope }
          },
          write: async ({ target, scope }) => {
            await trx
              .updateTable('ipAccessRules')
              .set((eb) => ({
                scopeType: scope.scopeType,
                scopeRefNo: scope.scopeRefNo,
                ...(body.cidr === undefined ? {} : { cidr: body.cidr }),
                ...(body.description === undefined ? {} : { description: body.description }),
                revision: eb('revision', '+', 1),
                updateAt: sql<Date>`current_timestamp`,
              }))
              .where('ruleNo', '=', ruleNo)
              .execute()
            await assertNotSelfLockout(trx, clientIp, actor)
            const item = await readRuleView(trx, ruleNo)
            return { item, before: auditViewOf(target), after: auditViewOf(item) }
          },
        },
        IP_WRITE,
      ),
    )
  }

  async remove(
    ruleNo: bigint,
    body: AdminIpRuleRemoveBody,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<{ before: IpRuleAuditView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = subjectOf(principal)
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(
        trx,
        {
          lock: async () => {
            const target = await lockRule(trx, ruleNo)
            if (body.revision !== target.revision) throw ruleRevisionConflict()
            return target
          },
          write: async (target) => {
            await trx.deleteFrom('ipAccessRules').where('ruleNo', '=', ruleNo).execute()
            await assertNotSelfLockout(trx, clientIp, actor)
            // 🔴 지운 규칙은 감사의 before 로만 복원된다
            return { before: auditViewOf(target) }
          },
        },
        IP_WRITE,
      ),
    )
  }
}
