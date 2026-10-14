import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { sql, type SqlBool, type Transaction } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { ACCOUNT_MESSAGES } from './errors.js'

// 정본: hangang-home apps/api/src/core/permissions/monotonicity.ts lockSuperAdminGuard · countReachableSuperAdmins ·
//       assertSuperAdminSurvives
// 바꾼 점:
//  - 셈은 재직(resignAt IS NULL) ∧ 역할에 '*'. IP 층(applicableIpLayer — "어디서든 로그인할 수 있는")은 2f 가 더한다.
//  - '*' 판정은 JSON_CONTAINS — hangang 의 LIKE '%"*"%' 는 문자열 매칭이라 '*' 를 품은 키에 오탐한다(2d 스펙 §14 R1-2).
//  - 잠금 · 전 셈 · 쓰기 · 후 셈 · 판정을 withSuperAdminSurvival 하나로 묶는다 — 부르는 쪽이 순서를 틀리지 않게.
// 🔴 잠금은 트랜잭션의 첫 문장이어야 한다 — InnoDB REPEATABLE READ 는 첫 **비잠금** SELECT 에서 읽기 뷰를 만든다. 그보다
//    먼저 셈을 읽으면 앞서 이 행을 쥐었던 트랜잭션의 커밋을 못 본다(§14 R1-3a 실측).
// 🔴 셈에 FOR UPDATE 를 붙이지 않는다 — 대상 행 잠금과 전 행 스캔이 엇갈려 교착한다(hangang).
// 🔴 한 트랜잭션은 guardLocks 행을 둘 이상 잡지 않는다. 이 함수들은 Transaction 만 받는다 — 트랜잭션 밖에서 부를 수 없게.
// 셈을 늘리기만 하는 쓰기(역할 · 사용자 만들기 · 재입사)는 잠그지 않는다 — 늘어나는 것은 놓쳐도 안전하다.

/** 장 0009 의 시드 행 이름 — 장은 리터럴로 넣는다(같은 값인지는 DB 테스트가 잰다) */
export const GUARD_LOCK_SUPER_ADMIN = 'superAdminSurvival'

export async function lockSuperAdminGuard(trx: Transaction<AdminDatabase>): Promise<void> {
  const row = await trx
    .selectFrom('guardLocks')
    .select('lockName')
    .where('lockName', '=', GUARD_LOCK_SUPER_ADMIN)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) {
    // 🔴 장 0009 가 빠졌다 — 조용히 보호 없이 쓰지 않는다(hangang fail-loud). 스텁 검사가 먼저 막는다.
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_INTERNAL, ACCOUNT_MESSAGES.guardMissing, {
      lockName: GUARD_LOCK_SUPER_ADMIN,
    })
  }
}

/** 재직(퇴사 예정도 뺀다) · 역할에 '*' 가 있는 사용자 수 */
export async function countSuperAdmins(trx: Transaction<AdminDatabase>): Promise<number> {
  const row = await trx
    .selectFrom('users as u')
    .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
    .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
    .where('u.resignAt', 'is', null)
    .where(sql<SqlBool>`json_contains(${sql.ref('r.permissions')}, '"*"')`)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

/** "0 이면 거부" 가 아니라 "있었는데 0 이 되면 거부" — 이미 0 인 저장소를 마비시키지 않는다 */
export function assertSuperAdminSurvives(before: number, after: number): void {
  if (before >= 1 && after < 1) {
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, ACCOUNT_MESSAGES.lastSuperAdmin)
  }
}

/** 잔존을 줄일 수 있는 쓰기를 감싼다 — 센티넬 잠금(첫 문장) → 전 셈 → write → 후 셈 → 판정(던지면 롤백) */
export async function withSuperAdminSurvival<T>(
  trx: Transaction<AdminDatabase>,
  write: () => Promise<T>,
): Promise<T> {
  await lockSuperAdminGuard(trx)
  const before = await countSuperAdmins(trx)
  const result = await write()
  assertSuperAdminSurvives(before, await countSuperAdmins(trx))
  return result
}
