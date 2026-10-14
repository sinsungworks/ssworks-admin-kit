import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Transaction } from 'kysely'
import type { AdminDatabase } from './types.js'

// 정본: 2d accounts/super-admin.ts lockSuperAdminGuard(hangang-home core/permissions/monotonicity.ts lockSuperAdminGuard)
// 바꾼 점: 잠금 이름을 인자로 받는다 — 잔존(2d) · 팀 트리(2e-1) · 약관 발행(2e-2)이 함께 쓴다(2e 스펙 B2).
// 🔴 행 하나가 직렬화 지점 하나다. 한 트랜잭션은 guardLocks 행을 둘 이상 잡지 않는다(0009 장 주석) — 2f 가 둘을 잡아야 하면
//    이름의 고정 순서를 그때 정한다(2e 스펙 §5-1).
// 🔴 부르는 쪽은 트랜잭션의 첫 문장으로 부른다 — 앞선 비잠금 SELECT 가 읽기 뷰를 먼저 열면 그 뒤 셈 · 읽기가 낡고, 스냅샷 격리
//    ON 에서는 잠금 읽기가 1020 을 만난다(2d 스펙 §14 R1-3a · 2e §14 R1-7).

/** 장 0010 의 시드 행 이름 — 장은 리터럴로 넣는다(같은 값인지는 guard-locks.db.test.ts 가 잰다) */
export const GUARD_LOCK_TEAM_TREE = 'teamTree'

export const GUARD_MESSAGES = Object.freeze({
  missing: '동시성 보호 설정이 없어 처리할 수 없습니다.',
})

export async function lockGuardRow(
  trx: Transaction<AdminDatabase>,
  lockName: string,
): Promise<void> {
  const row = await trx
    .selectFrom('guardLocks')
    .select('lockName')
    .where('lockName', '=', lockName)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) {
    // 🔴 장이 빠졌다 — 조용히 보호 없이 쓰지 않는다(hangang fail-loud). 스텁 검사가 먼저 막는다.
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_INTERNAL, GUARD_MESSAGES.missing, {
      lockName,
    })
  }
}
