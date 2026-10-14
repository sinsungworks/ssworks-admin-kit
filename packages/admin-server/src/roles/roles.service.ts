import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely, Transaction } from 'kysely'
import { actorOf, judgeAccountCommand } from '../accounts/account-command.js'
import { isDuplicateOf } from '../accounts/duplicate.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import { permissionsOrEmpty } from '../accounts/permissions-column.js'
import { reauthenticate } from '../accounts/reauth.js'
import { withSuperAdminSurvival } from '../accounts/super-admin.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { validationError } from '../http/validation.js'
import { ADMIN_ACCOUNTS_CONFIG, KYSELY } from '../tokens.js'
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
//  - 새 역할의 displayOrder 는 MAX … FOR UPDATE 로 셈한다(§14 R5-5 · R7-4 — 동시 만들기가 같은 값을 받으면 이동으로도 못
//    가른다).
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

@Injectable()
export class AdminRolesService {
  private readonly logger = new Logger('AdminRolesService')

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_ACCOUNTS_CONFIG) private readonly config: ResolvedAccountsConfig,
    // 🔴 @Optional — AdminAuthModule 이 빠진 앱이 DI 해석 오류가 아니라 모듈 기동 검사의 문구로 멈추게(2c R2 와 같은 이유)
    @Optional() private readonly reauthService?: AdminReauthService,
  ) {}

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
        const clearedDefaults = body.isDefault ? await clearOtherDefaults(trx, null) : []
        // 🔴 FOR UPDATE — 동시 만들기 둘이 같은 MAX 를 읽으면 순서 값이 겹친다(§14 R5-5 · R7-4)
        const top = await trx
          .selectFrom('roles')
          .select((eb) => eb.fn.max('displayOrder').as('maxOrder'))
          .forUpdate()
          .executeTakeFirst()
        const result = await trx
          .insertInto('roles')
          .values({
            roleName: body.roleName,
            permissions: JSON.stringify(next),
            isDefault: body.isDefault,
            displayOrder: Number(top?.maxOrder ?? 0) + 1,
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
        const write = async (): Promise<{ before: RoleAuditView; clearedDefaults: bigint[] }> => {
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
          const clearedDefaults =
            body.isDefault === true && !row.isDefault ? await clearOtherDefaults(trx, roleNo) : []
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
            clearedDefaults,
          }
        }
        // 🔴 권한을 바꾸는 수정만 잔존을 줄일 수 있다 — 센티넬이 트랜잭션의 첫 문장이 되게 감싼다(§5-3).
        const { before, clearedDefaults } =
          next === undefined ? await write() : await withSuperAdminSurvival(trx, write)
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
    // 🔴 쓰는 중 검사가 먼저라 잔존은 지금은 닿지 않는 방어선이다(hangang · 2d 스펙 B11). 쓰는 중 검사가 스냅숏 때문에 놓친
    //    배정은 FK restrict 가 받친다 — mapError 가 같은 409 ERR_COMMON_IN_USE 로 바꾼다(2a F15).
    const before = await runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(trx, async () => {
        const row = await lockRole(trx, roleNo)
        const current = this.permissionsOf(row)
        judgeAccountCommand(actor, { kind: 'role.delete', current })
        if (body.revision !== row.revision) {
          throw new BusinessError(
            CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
            ACCOUNT_MESSAGES.roleRevisionMismatch,
          )
        }
        const used = await trx
          .selectFrom('users')
          .select('userNo')
          .where('roleNo', '=', roleNo)
          .limit(1)
          .executeTakeFirst()
        if (used !== undefined) {
          throw new BusinessError(CommonErrorCodes.ERR_COMMON_IN_USE, ACCOUNT_MESSAGES.roleInUse)
        }
        await trx.deleteFrom('roles').where('roleNo', '=', roleNo).execute()
        return { roleName: row.roleName, isDefault: row.isDefault, permissions: current }
      }),
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
 * ⑫ D1 — 다른 기본 역할을 끄고 그 revision 을 올린다(내용이 바뀌었다 — 그 역할을 열어 둔 편집자는 409 를 받는다).
 * 끈 역할 번호를 돌려준다(감사 meta clearedDefaults — §14 R5-3).
 */
async function clearOtherDefaults(
  trx: Transaction<AdminDatabase>,
  except: bigint | null,
): Promise<bigint[]> {
  let found = trx.selectFrom('roles').select('roleNo').where('isDefault', '=', true).forUpdate()
  if (except !== null) found = found.where('roleNo', '!=', except)
  const roleNos = (await found.execute()).map((row) => row.roleNo)
  if (roleNos.length === 0) return []
  await trx
    .updateTable('roles')
    .set((eb) => ({ isDefault: false, revision: eb('revision', '+', 1) }))
    .where('roleNo', 'in', roleNos)
    .execute()
  return roleNos
}

function noRole(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_ROLE, ACCOUNT_MESSAGES.noRole)
}
