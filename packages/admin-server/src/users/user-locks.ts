import type { Transaction } from 'kysely'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { AdminDatabase } from '../database/types.js'
import { fieldError, noUser } from './errors.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(대상 FOR UPDATE · 팀 지우고 넣기 — axion 과 같음) +
//       ssworks-gise-home account-policy.ts 의 판정 입력(대상의 역할 권한)
// 바꾼 점: 대상은 users ⋈ roles 를 함께 잠근다(B8 — 판정하는 동안 대상 역할의 권한이 바뀌지 않게, §14 R1-3b). 줄 역할 ·
//   팀도 잠근다.
// 🔴 사용자 쓰기 안의 결정 읽기는 모두 FOR UPDATE 다 — 판정이 직렬화되고 늘 최신 행을 본다(2d 스펙 §14 R5-6 · R7-1 · R7-2).
//    잔존으로 감싼 쓰기는 lockUser · lockGrantRole · lockTeam 을 잠금 단계에서, 곧 잔존 셈(읽기 뷰를 여는 읽기) 앞에서
//    잡는다(2d-3 스펙 ① A · C2). 셈 뒤에 잠그는 것은 그 사용자 자신의 팀 소속 · 재직 이력 행뿐이고, 둘은 그 사용자 행 잠금
//    아래서만 바뀐다. 이 잠금을 셈 뒤로 옮기거나 비잠금 읽기로 바꾸면 낡은 읽기(OFF)와 1020 → 409(ON)가 되살아난다
//    (2d-3 스펙 §14 R1).

export interface LockedUser {
  userNo: bigint
  roleNo: bigint
  /** 역할 열 그대로 — permissionsOrEmpty 로 읽는다 */
  permissions: unknown
  joinAt: Date
  resignAt: Date | null
  revision: number
  loginFailCount: number
  lockUntil: Date | null
}

/** 대상 사용자와 그 역할 행을 잠근다. 없으면 404 ERR_NO_USER */
export async function lockUser(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
): Promise<LockedUser> {
  const row = await trx
    .selectFrom('users as u')
    .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
    .select([
      'u.userNo',
      'u.roleNo',
      'r.permissions',
      'u.joinAt',
      'u.resignAt',
      'u.revision',
      'u.loginFailCount',
      'u.lockUntil',
    ])
    .where('u.userNo', '=', userNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw noUser()
  return row
}

/** 줄 역할 — 없으면 본문 칸 오류 400 roleNo(⑬ K1) */
export async function lockGrantRole(
  trx: Transaction<AdminDatabase>,
  roleNo: bigint,
): Promise<{ roleNo: bigint; permissions: unknown }> {
  const row = await trx
    .selectFrom('roles')
    .select(['roleNo', 'permissions'])
    .where('roleNo', '=', roleNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw fieldError('roleNo', ACCOUNT_MESSAGES.noRole)
  return row
}

/** 팀 — 없으면 본문 칸 오류 400 teamNo */
export async function lockTeam(trx: Transaction<AdminDatabase>, teamNo: bigint): Promise<void> {
  const row = await trx
    .selectFrom('teams')
    .select('teamNo')
    .where('teamNo', '=', teamNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw fieldError('teamNo', ACCOUNT_MESSAGES.noTeam)
}

/**
 * 팀 하나로 바꾼다(⑨ T1 — axion 처럼 지우고 넣는다). null 이면 소속을 비운다.
 * 🔴 이미 그 팀 하나(또는 빈 소속에 null)면 쓰지 않는다 — 배정 시각 joinAt 이 그대로이고 gap 잠금이 줄어든다(2e 스펙 B13).
 *    잠금 순서는 users → roles → teams → teamUserMap 그대로다(지금 소속을 FOR UPDATE 로 읽는다 — 2d §14 R5-6).
 */
export async function replaceTeam(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
  teamNo: bigint | null,
): Promise<void> {
  if (teamNo !== null) await lockTeam(trx, teamNo)
  const current = await trx
    .selectFrom('teamUserMap')
    .select('teamNo')
    .where('userNo', '=', userNo)
    .forUpdate()
    .execute()
  const unchanged =
    teamNo === null ? current.length === 0 : current.length === 1 && current[0]?.teamNo === teamNo
  if (unchanged) return
  await trx.deleteFrom('teamUserMap').where('userNo', '=', userNo).execute()
  if (teamNo !== null) await trx.insertInto('teamUserMap').values({ teamNo, userNo }).execute()
}
