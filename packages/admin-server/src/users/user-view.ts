import type { Kysely } from 'kysely'
import { dateIn, fromDateColumn } from '../accounts/calendar.js'
import type { AdminDatabase } from '../database/types.js'
import { noUser } from './errors.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(목록 투영 — 역할 · 팀 JOIN) + 2b
//       kysely-auth.repository.ts(대표 팀 R34)
// 바꾼 점:
//  - 팀은 LEFT JOIN — 무소속 계정도 보인다(hangang · crm 은 INNER 라 사라졌다). 대표 팀 = 가장 작은 teamNo(인증과 같은 팀).
//  - 날짜는 마지막 재직 구간에서(B10 — 원천). 구간이 없는 시드 계정은 users.joinAt 의 기준 시간대 날짜.
//  - lockUntil 은 미래일 때만(gise) — 지난 잠금은 잠금이 아니다. 해시 · 실패 카운터는 싣지 않는다.
// 🔴 이 투영은 보기 읽기다(응답 item · 감사 before/after). 판정에 쓰지 않는다 — 판정은 잠금 읽기(user-locks.ts ·
//    employment.ts)로 한다(§14 R5-6).
//    잔존으로 감싼 쓰기(역할을 바꾸는 수정 · 퇴사)에서 쓰기 앞의 보기 읽기는 잔존 셈이 연 읽기 뷰를 쓴다.
//    snapshot isolation OFF(11.4 기본)에서 대상 잠금을 기다린 사이 같은 사용자에 대한 다른 쓰기가 커밋되면,
//    before 는 대상 자신의 열(resignDate · resignAt · revision …)까지 낡을 수 있다. 판정은 이 값을 쓰지 않는다.
//    ON 이면 같은 경합은 409(ER_CHECKREAD)로 끝난다. 자기 쓰기 뒤의 item · after 는 늘 최신이다.
//    구조적 해결(withSuperAdminSurvival 순서를 "센티넬 → 대상 잠금 → 셈" 으로)은 후속이다(HANDOFF).

/** 응답 행 — 타입 별칭이라 감사 diff 의 `Record<string, unknown>` 자리에 들어간다 */
export type AdminUserView = {
  userNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  teamNo: bigint | null
  teamName: string | null
  joinDate: string
  resignDate: string | null
  resignAt: Date | null
  isPasswordChangeRequired: boolean
  lockUntil: Date | null
  revision: number
  createAt: Date
  updateAt: Date
}

/** 만들기 · 수정 감사 diff 의 칸(2d 스펙 §5-6) */
export const USER_AUDIT_FIELDS = [
  'userId',
  'userName',
  'roleNo',
  'roleName',
  'teamNo',
  'teamName',
  'joinDate',
] as const
/** 퇴사 · 퇴사일 정정 */
export const RESIGN_AUDIT_FIELDS = ['resignDate', 'resignAt'] as const
/** 재입사 — 재입사가 지우는 효력 시각까지(§14 R8) */
export const REHIRE_AUDIT_FIELDS = ['joinDate', 'resignDate', 'resignAt'] as const

export interface UserViewRow {
  userNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  teamNo: bigint | null
  teamName: string | null
  joinAt: Date
  periodJoinAt: Date | null
  periodResignAt: Date | null
  resignAt: Date | null
  isPasswordChangeRequired: boolean
  lockUntil: Date | null
  revision: number
  createAt: Date
  updateAt: Date
}

/** 목록 · 단건이 같은 투영을 쓴다(트랜잭션도 받는다 — Transaction 은 Kysely 다) */
export function userViewQuery(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('users as u')
    .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
    .leftJoin('teams as t', (join) =>
      join.on((eb) =>
        eb(
          't.teamNo',
          '=',
          eb
            .selectFrom('teamUserMap as m')
            .select((sub) => sub.fn.min('m.teamNo').as('teamNo'))
            .whereRef('m.userNo', '=', 'u.userNo'),
        ),
      ),
    )
    .leftJoin('userEmploymentPeriods as p', (join) =>
      join.on((eb) =>
        eb(
          'p.periodNo',
          '=',
          eb
            .selectFrom('userEmploymentPeriods as q')
            .select('q.periodNo')
            .whereRef('q.userNo', '=', 'u.userNo')
            .orderBy('q.joinAt', 'desc')
            .orderBy('q.periodNo', 'desc')
            .limit(1),
        ),
      ),
    )
    .select([
      'u.userNo',
      'u.userId',
      'u.userName',
      'u.roleNo',
      'r.roleName',
      't.teamNo',
      't.teamName',
      'u.joinAt',
      'p.joinAt as periodJoinAt',
      'p.resignAt as periodResignAt',
      'u.resignAt',
      'u.isPasswordChangeRequired',
      'u.lockUntil',
      'u.revision',
      'u.createAt',
      'u.updateAt',
    ])
}

export function toUserView(row: UserViewRow, timeZone: string, now: Date): AdminUserView {
  return {
    userNo: row.userNo,
    userId: row.userId,
    userName: row.userName,
    roleNo: row.roleNo,
    roleName: row.roleName,
    teamNo: row.teamNo,
    teamName: row.teamName,
    joinDate:
      row.periodJoinAt === null ? dateIn(row.joinAt, timeZone) : fromDateColumn(row.periodJoinAt),
    resignDate: row.periodResignAt === null ? null : fromDateColumn(row.periodResignAt),
    resignAt: row.resignAt,
    isPasswordChangeRequired: row.isPasswordChangeRequired,
    lockUntil:
      row.lockUntil !== null && row.lockUntil.getTime() > now.getTime() ? row.lockUntil : null,
    revision: row.revision,
    createAt: row.createAt,
    updateAt: row.updateAt,
  }
}

/** 한 사용자의 보기. 없으면 404 ERR_NO_USER */
export async function readUser(
  db: Kysely<AdminDatabase>,
  userNo: bigint,
  timeZone: string,
): Promise<AdminUserView> {
  const row = await userViewQuery(db).where('u.userNo', '=', userNo).executeTakeFirst()
  if (row === undefined) throw noUser()
  return toUserView(row, timeZone, new Date())
}
