import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely, Transaction } from 'kysely'
import { actorOf, judgeAccountCommand } from '../accounts/account-command.js'
import { isDuplicateOf } from '../accounts/duplicate.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import { permissionsOrEmpty } from '../accounts/permissions-column.js'
import { reauthenticate } from '../accounts/reauth.js'
import {
  withSuperAdminSurvival,
  type LockedWrite,
  type SurvivalCount,
} from '../accounts/super-admin.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { validationError } from '../http/validation.js'
import { ADMIN_ACCOUNTS_CONFIG, IP_ACCESS_ENABLED, KYSELY } from '../tokens.js'
import { planRoleMove } from './move.js'

// 정본: hangang-home apps/api/src/modules/roles/roles.service.ts(목록 · 만들기 · 수정 · 이동 구간 재번호 · 쓰는 중 409 ·
//       잔존 · 재인증) + ssworks-gise-home revision · 판정 + ssworks-axion-admin 기본 역할 배타
// 바꾼 점:
//  - 목록은 전량(3b §9 — hangang 은 쪽을 나눴다). 권한은 저장된 그대로 낸다(2d 스펙 B6).
//  - 정규화는 카탈로그 normalize(① C1), 권한 상승은 지배 판정(② E1 — hangang 은 새 집합만 봤다).
//  - 수정 · 삭제는 revision(gise). 이동은 revision 을 받지도 올리지도 않는다(3b D1).
//  - 기본 역할은 하나 — 만들기에서도 끈다(axion 은 수정에서만 껐다, ⑫ D1). 끈 역할 번호를 돌려준다 — 감사 meta
//    clearedDefaults(§14 R5-3).
//  - 이름 중복은 제약 이름으로 가려 400 roleName 필드 오류(B1 — hangang 은 사전 검사였고 경합 때 일반 코드로 샜다).
//  - 수정의 응답 item · 감사 after 는 같은 트랜잭션에서 읽는다(§14 R5-2 — 커밋 뒤에 읽으면 그 사이 남의 쓰기가 섞였다).
//  - 잔존으로 감싼 수정 · 삭제는 잠금 단계(역할 · 다른 기본 역할 잠금 · 판정 · revision) 뒤에 셈한다(2d-3 스펙 ① A · C3) —
//    역할 이동이 그 사이 역할 행을 바꿔도 ON 에서 1020 이 아니다.
//  - 새 역할의 displayOrder 는 끝 행 + 1 — 인덱스 끝 행과 그 위 틈을 FOR UPDATE 로 읽는다(§14 R5-5 · R7-4 — 동시 만들기가
//    같은 값을 받으면 이동으로도 못 가른다. 2d-3 스펙 C6 — 다른 역할 행은 잠그지 않는다).
// 🔴 재인증(argon2)은 트랜잭션 밖 · 권한 가드 뒤(2b §4-7).

export type AdminRoleView = {
  roleNo: bigint
  roleName: string
  displayOrder: number
  isDefault: boolean
  permissions: string[]
  revision: number
}

/** 감사 diff 의 모양 — 타입 별칭이라 `Record<string, unknown>` 자리에 들어간다 */
export type RoleAuditView = {
  roleName: string
  isDefault: boolean
  permissions: readonly string[]
}

export const ROLE_AUDIT_FIELDS = ['roleName', 'isDefault', 'permissions'] as const

export interface AdminRoleCreateBody {
  roleName: string
  isDefault: boolean
  permissions: string[]
  currentPassword?: string
}

export interface AdminRoleUpdateBody {
  revision: number
  roleName?: string
  isDefault?: boolean
  permissions?: string[]
  currentPassword?: string
}

export interface AdminRoleRemoveBody {
  revision: number
  currentPassword?: string
}

const ROLE_COLUMNS = [
  'roleNo',
  'roleName',
  'permissions',
  'displayOrder',
  'isDefault',
  'revision',
] as const

type RoleRow = {
  roleNo: bigint
  roleName: string
  permissions: unknown
  displayOrder: number
  isDefault: boolean
  revision: number
}

/** 역할 수정의 잠금 단계가 쓰기 단계에 넘기는 것 */
type RoleUpdateLock = { row: RoleRow; current: string[]; clearing: bigint[] }

type RoleUpdateResult = { before: RoleAuditView; clearedDefaults: bigint[] }

@Injectable()
export class AdminRolesService {
  private readonly logger = new Logger('AdminRolesService')

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_ACCOUNTS_CONFIG) private readonly config: ResolvedAccountsConfig,
    // 🔴 @Optional — AdminAuthModule 이 빠진 앱이 DI 해석 오류가 아니라 모듈 기동 검사의 문구로 멈추게(2c R2 와 같은 이유)
    @Optional() private readonly reauthService?: AdminReauthService,
    // 🔴 IP 접근 제어 모듈이 있으면 잔존 셈이 IP 층을 본다(2f-1 스펙 P3) — 전역 모듈의 표시 토큰, 없으면 undefined
    @Optional() @Inject(IP_ACCESS_ENABLED) private readonly ipAccess?: boolean,
  ) {}

  private get survival(): SurvivalCount {
    return { ipAware: this.ipAccess === true }
  }

  async list(): Promise<{ items: AdminRoleView[] }> {
    const rows = await runQuery(() =>
      this.db
        .selectFrom('roles')
        .select(ROLE_COLUMNS)
        .orderBy('displayOrder', 'asc')
        .orderBy('roleNo', 'asc')
        .execute(),
    )
    return { items: rows.map((row) => this.view(row)) }
  }

  async create(
    body: AdminRoleCreateBody,
    principal: AdminPrincipal,
  ): Promise<{ roleNo: bigint; after: RoleAuditView; clearedDefaults: bigint[] }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const next = this.config.catalog.normalize(body.permissions)
    judgeAccountCommand(actorOf(principal), { kind: 'role.create', next })
    // 만들기는 잔존을 늘리기만 한다 — 센티넬을 잡지 않는다(§5-3).
    const created = await this.guardRoleName(() =>
      runWriteTransaction(this.db, async (trx) => {
        const clearedDefaults = body.isDefault ? await lockOtherDefaults(trx, null) : []
        await clearDefaults(trx, clearedDefaults)
        // 🔴 FOR UPDATE — 동시 만들기 둘이 같은 끝 값을 읽으면 순서 값이 겹친다(§14 R5-5 · R7-4). 🔴 idx_roles_display_order 의
        //    끝 행과 그 위 틈(supremum)만 잠그고 다른 역할 행은 잠그지 않는다(2d-3 스펙 C6). 두 만들기의 읽기가 서로의 INSERT 앞에
        //    겹치면 한쪽은 교착(1213 → 409, 다시 시도)으로 끝난다 — 순서 값은 겹치지 않는다(2d-3 스펙 §14 R3).
        //    다만 순서 맨 끝 역할의 삭제 · 이동 · 기본 켜기와 겹쳐도 같다 — 끝 행 잠금이 그 역할의 PK 행을 기다린다(§14 R4).
        //    MAX(…) 는 옵티마이저가 "optimized away" 로 읽어 잠금이 그 동작에 기댄다(2d-3 스펙 §14 R1-8)
        const top = await trx
          .selectFrom('roles')
          .select('displayOrder')
          .orderBy('displayOrder', 'desc')
          .limit(1)
          .forUpdate()
          .executeTakeFirst()
        const result = await trx
          .insertInto('roles')
          .values({
            roleName: body.roleName,
            permissions: JSON.stringify(next),
            isDefault: body.isDefault,
            displayOrder: (top?.displayOrder ?? 0) + 1,
          })
          .executeTakeFirstOrThrow()
        if (result.insertId === undefined) {
          throw new Error('roles INSERT 가 insertId 를 돌려주지 않았다.')
        }
        return { roleNo: result.insertId, clearedDefaults }
      }),
    )
    return {
      ...created,
      after: { roleName: body.roleName, isDefault: body.isDefault, permissions: next },
    }
  }

  async update(
    roleNo: bigint,
    body: AdminRoleUpdateBody,
    principal: AdminPrincipal,
  ): Promise<{
    item: AdminRoleView
    before: RoleAuditView
    after: RoleAuditView
    clearedDefaults: bigint[]
  }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const next =
      body.permissions === undefined ? undefined : this.config.catalog.normalize(body.permissions)
    const actor = actorOf(principal)
    return this.guardRoleName(() =>
      runWriteTransaction(this.db, async (trx) => {
        const steps: LockedWrite<RoleUpdateLock, RoleUpdateResult> = {
          // 🔴 잠금 읽기 · 판정만(2d-3 스펙 C2 · C3). 다른 기본 역할도 여기서 잠근다 — 남이 이 역할 잠금 없이 바꾸는 행이라 셈(읽기
          //    뷰) 뒤에 잠그면 스냅샷 격리 ON 에서 1020 이다.
          lock: async () => {
            const row = await lockRole(trx, roleNo)
            const current = this.permissionsOf(row)
            // 🔴 판정이 revision 보다 먼저다 — 권한 없는 사람에게 revision 상태를 드러내지 않는다(2d 스펙 B7).
            judgeAccountCommand(actor, { kind: 'role.update', current, next })
            if (body.revision !== row.revision) {
              throw new BusinessError(
                CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
                ACCOUNT_MESSAGES.roleRevisionMismatch,
              )
            }
            const clearing =
              body.isDefault === true && !row.isDefault ? await lockOtherDefaults(trx, roleNo) : []
            return { row, current, clearing }
          },
          write: async ({ row, current, clearing }) => {
            await clearDefaults(trx, clearing)
            await trx
              .updateTable('roles')
              .set((eb) => ({
                ...(body.roleName === undefined ? {} : { roleName: body.roleName }),
                ...(body.isDefault === undefined ? {} : { isDefault: body.isDefault }),
                ...(next === undefined ? {} : { permissions: JSON.stringify(next) }),
                revision: eb('revision', '+', 1),
              }))
              .where('roleNo', '=', roleNo)
              .execute()
            return {
              before: { roleName: row.roleName, isDefault: row.isDefault, permissions: current },
              clearedDefaults: clearing,
            }
          },
        }
        // 🔴 권한을 바꾸는 수정만 잔존을 줄일 수 있다 — 센티넬이 트랜잭션의 첫 문장이 되게 감싼다(§5-3).
        const { before, clearedDefaults } =
          next === undefined
            ? await steps.write(await steps.lock())
            : await withSuperAdminSurvival(trx, steps, this.survival)
        // 🔴 같은 트랜잭션에서 읽는다 — 응답 · 감사 after 가 이 쓰기의 결과다(§14 R5-2)
        const item = this.view(await findRole(trx, roleNo))
        return {
          item,
          before,
          after: {
            roleName: item.roleName,
            isDefault: item.isDefault,
            permissions: item.permissions,
          },
          clearedDefaults,
        }
      }),
    )
  }

  /** 🔴 재인증 · revision 없음(3b D1 — 순서는 내용이 아니다). 대상 행을 잠그고 구간을 옮긴다 */
  async move(roleNo: bigint, displayOrder: number): Promise<{ from: number; to: number }> {
    return runWriteTransaction(this.db, async (trx) => {
      const row = await lockRole(trx, roleNo)
      const range = await trx
        .selectFrom('roles')
        .select((eb) => [eb.fn.min('displayOrder').as('lo'), eb.fn.max('displayOrder').as('hi')])
        .executeTakeFirstOrThrow()
      const plan = planRoleMove(
        row.displayOrder,
        displayOrder,
        Number(range.lo ?? row.displayOrder),
        Number(range.hi ?? row.displayOrder),
      )
      const shift = plan.shift
      if (shift !== null) {
        await trx
          .updateTable('roles')
          .set((eb) => ({ displayOrder: eb('displayOrder', shift.delta > 0 ? '+' : '-', 1) }))
          .where('displayOrder', '>=', shift.min)
          .where('displayOrder', '<=', shift.max)
          .where('roleNo', '!=', roleNo)
          .execute()
        await trx
          .updateTable('roles')
          .set({ displayOrder: plan.to })
          .where('roleNo', '=', roleNo)
          .execute()
      }
      return { from: plan.from, to: plan.to }
    })
  }

  async remove(
    roleNo: bigint,
    body: AdminRoleRemoveBody,
    principal: AdminPrincipal,
  ): Promise<{ before: RoleAuditView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = actorOf(principal)
    // 🔴 쓰는 중 검사가 먼저라 잔존은 지금은 닿지 않는 방어선이다(hangang · 2d 스펙 B11). 쓰는 중 검사가 무언가 놓쳐도
    //    FK restrict 가 받친다 — mapError 가 같은 409 ERR_COMMON_IN_USE 로 바꾼다(2a F15).
    const before = await runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(
        trx,
        {
          // 🔴 잠금 읽기 · 판정만(2d-3 스펙 C2 · C3)
          lock: async () => {
            const row = await lockRole(trx, roleNo)
            const current = this.permissionsOf(row)
            judgeAccountCommand(actor, { kind: 'role.delete', current })
            if (body.revision !== row.revision) {
              throw new BusinessError(
                CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
                ACCOUNT_MESSAGES.roleRevisionMismatch,
              )
            }
            return { row, current }
          },
          // 🔴 쓰는 중 검사는 비잠금이라 쓰기 단계다(셈 뒤). 역할 행을 X 로 쥐었으므로 그 역할을 새로 배정하는 쓰기
          //    (lockGrantRole · FK S 검사)는 커밋하지 못한다 — 셈이 연 뷰에서 못 본 배정이 없다(2d-3 스펙 §5-2).
          write: async ({ row, current }) => {
            const used = await trx
              .selectFrom('users')
              .select('userNo')
              .where('roleNo', '=', roleNo)
              .limit(1)
              .executeTakeFirst()
            if (used !== undefined) {
              throw new BusinessError(
                CommonErrorCodes.ERR_COMMON_IN_USE,
                ACCOUNT_MESSAGES.roleInUse,
              )
            }
            await trx.deleteFrom('roles').where('roleNo', '=', roleNo).execute()
            return { roleName: row.roleName, isDefault: row.isDefault, permissions: current }
          },
        },
        this.survival,
      ),
    )
    return { before }
  }

  private async guardRoleName<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (isDuplicateOf(error, 'uq_roles_role_name')) {
        throw validationError(
          [{ path: ['roleName'], code: 'custom', message: ACCOUNT_MESSAGES.duplicateRoleName }],
          ACCOUNT_MESSAGES.duplicateRoleName,
        )
      }
      throw error
    }
  }

  private permissionsOf(row: { roleNo: bigint; permissions: unknown }): string[] {
    return permissionsOrEmpty(row, this.logger)
  }

  private view(row: RoleRow): AdminRoleView {
    return {
      roleNo: row.roleNo,
      roleName: row.roleName,
      displayOrder: row.displayOrder,
      isDefault: row.isDefault,
      permissions: this.permissionsOf(row),
      revision: row.revision,
    }
  }
}

async function lockRole(trx: Transaction<AdminDatabase>, roleNo: bigint): Promise<RoleRow> {
  const row = await trx
    .selectFrom('roles')
    .select(ROLE_COLUMNS)
    .where('roleNo', '=', roleNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw noRole()
  return row
}

/** 트랜잭션 안의 보기 읽기 — 자기 쓰기가 보인다 */
async function findRole(trx: Transaction<AdminDatabase>, roleNo: bigint): Promise<RoleRow> {
  const row = await trx
    .selectFrom('roles')
    .select(ROLE_COLUMNS)
    .where('roleNo', '=', roleNo)
    .executeTakeFirst()
  if (row === undefined) throw noRole()
  return row
}

/**
 * ⑫ D1 — 다른 기본 역할을 잠그고 번호를 돌려준다. 역할 수정에서는 잠금 단계다(2d-3 스펙 C4) — 그 역할은 남이 이 역할 잠금 없이
 * 바꾸는 행이다. 끈 역할 번호는 감사 meta clearedDefaults(§14 R5-3).
 */
async function lockOtherDefaults(
  trx: Transaction<AdminDatabase>,
  except: bigint | null,
): Promise<bigint[]> {
  let found = trx.selectFrom('roles').select('roleNo').where('isDefault', '=', true).forUpdate()
  if (except !== null) found = found.where('roleNo', '!=', except)
  return (await found.execute()).map((row) => row.roleNo)
}

/** ⑫ D1 — 그 역할들의 기본 표시를 끄고 revision 을 올린다(내용이 바뀌었다 — 그 역할을 열어 둔 편집자는 409 를 받는다) */
async function clearDefaults(trx: Transaction<AdminDatabase>, roleNos: bigint[]): Promise<void> {
  if (roleNos.length === 0) return
  await trx
    .updateTable('roles')
    .set((eb) => ({ isDefault: false, revision: eb('revision', '+', 1) }))
    .where('roleNo', 'in', roleNos)
    .execute()
}

function noRole(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_ROLE, ACCOUNT_MESSAGES.noRole)
}
