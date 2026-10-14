import type { Transaction } from 'kysely'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { AdminDatabase } from '../database/types.js'
import { fieldError, noUser } from './errors.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(대상 FOR UPDATE · 팀 지우고 넣기 — axion 과 같음) +
//       ssworks-gise-home account-policy.ts 의 판정 입력(대상의 역할 권한)
// 바꾼 점: 대상은 users ⋈ roles 를 함께 잠근다(B8 — 판정하는 동안 대상 역할의 권한이 바뀌지 않게, §14 R1-3b). 줄 역할 ·
//   팀도 잠근다.
// 🔴 사용자 쓰기 안의 결정 읽기는 모두 FOR UPDATE 다(2d 스펙 §14 R5-6 · R7-1 · R7-2) — 잔존으로 감싼 쓰기는 셈이 읽기 뷰를
//    먼저 열어, 비잠금 읽기는 잠금을 기다린 사이 커밋된 쓰기를 못 본다(11.4 기본). 잠금 읽기는 늘 최신 행을 본다.
//    단 스냅샷 격리 ON 에서 읽기 뷰가 이미 열린 뒤(잔존 셈 뒤) 그 행이 바뀌었으면 1020 → 409 다시 시도로 끝난다.

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
