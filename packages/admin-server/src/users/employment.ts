import type { Transaction } from 'kysely'
import { fromDateColumn, toDateColumn } from '../accounts/calendar.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { AdminDatabase } from '../database/types.js'
import { fieldError, userConflict } from './errors.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(퇴사 · 퇴사일 정정 · 재입사 · 치유 · 문구) + kim5257-crm-v5
//       (활성 구간 ≤ 1 — 0006 장 주석: DB 는 부분 UNIQUE 가 없어 서비스가 지킨다)
// 바꾼 점: 날짜는 'YYYY-MM-DD' 로 비교하고 열에는 UTC 자정 Date 로 쓴다(B3). recordedTimezone 은 늘 'UTC'(B2 — 2a 장 주석).
// 🔴 구간 읽기는 모두 FOR UPDATE(§14 R5-6 · R7-2) — 대상 사용자 잠금을 기다린 사이 커밋된 구간을 본다.

/** 🔴 2a 장 주석 그대로 — "기록 시점 프로세스 TZ. 패키지는 항상 UTC"(assertUtcTimezone). 기준 시간대는 감사 meta 가 남긴다 */
export const RECORDED_TIMEZONE = 'UTC'

export interface LockedPeriod {
  periodNo: bigint
  joinDate: string
  resignDate: string | null
}

function toPeriod(row: { periodNo: bigint; joinAt: Date; resignAt: Date | null }): LockedPeriod {
  return {
    periodNo: row.periodNo,
    joinDate: fromDateColumn(row.joinAt),
    resignDate: row.resignAt === null ? null : fromDateColumn(row.resignAt),
  }
}

/** 마지막 구간 둘 — [마지막, 직전](입사일 · 번호 내림차순) */
export async function lockLatestPeriods(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
): Promise<LockedPeriod[]> {
  const rows = await trx
    .selectFrom('userEmploymentPeriods')
    .select(['periodNo', 'joinAt', 'resignAt'])
    .where('userNo', '=', userNo)
    .orderBy('joinAt', 'desc')
    .orderBy('periodNo', 'desc')
    .limit(2)
    .forUpdate()
    .execute()
  return rows.map(toPeriod)
}

/** 새 활성 구간. 🔴 최초 입사 · 치유 행은 createdBy null, 재입사 행만 행위자(B2 — 2a 장 주석) */
export async function insertPeriod(
  trx: Transaction<AdminDatabase>,
  input: { userNo: bigint; joinDate: string; reason: string | null; createdBy: bigint | null },
): Promise<LockedPeriod> {
  const result = await trx
    .insertInto('userEmploymentPeriods')
    .values({
      userNo: input.userNo,
      joinAt: toDateColumn(input.joinDate),
      resignAt: null,
      reason: input.reason,
      recordedTimezone: RECORDED_TIMEZONE,
      createdBy: input.createdBy,
    })
    .executeTakeFirstOrThrow()
  if (result.insertId === undefined) {
    throw new Error('userEmploymentPeriods INSERT 가 insertId 를 돌려주지 않았다.')
  }
  return { periodNo: result.insertId, joinDate: input.joinDate, resignDate: null }
}

/** 입사일 정정 — 마지막 구간만. 직전 퇴사일 다음 날부터 이번 퇴사일까지(400 joinDate), 구간 없음 409 */
export async function correctJoinDate(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
  joinDate: string,
): Promise<void> {
  const [last, previous] = await lockLatestPeriods(trx, userNo)
  if (last === undefined) throw userConflict(ACCOUNT_MESSAGES.noPeriodForJoin)
  const afterPrevious = previous?.resignDate == null || joinDate > previous.resignDate
  const notAfterOwnResign = last.resignDate === null || joinDate <= last.resignDate
  if (!afterPrevious || !notAfterOwnResign) {
    throw fieldError('joinDate', ACCOUNT_MESSAGES.joinDateOutOfRange)
  }
  await trx
    .updateTable('userEmploymentPeriods')
    .set({ joinAt: toDateColumn(joinDate) })
    .where('periodNo', '=', last.periodNo)
    .execute()
}
