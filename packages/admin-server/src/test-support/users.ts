import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import { fromDateColumn, toDateColumn } from '../accounts/calendar.js'
import { AdminSessionStore } from '../auth/session.store.js'
import type { AdminDatabase } from '../database/types.js'

// 테스트 전용 — 재직 이력 · 팀 계층 · 세션 시드와 읽기(2d-2). 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).

export async function seedPeriod(
  db: Kysely<AdminDatabase>,
  input: {
    userNo: bigint
    joinDate: string
    resignDate?: string | null
    reason?: string | null
    createdBy?: bigint | null
  },
): Promise<bigint> {
  const result = await db
    .insertInto('userEmploymentPeriods')
    .values({
      userNo: input.userNo,
      joinAt: toDateColumn(input.joinDate),
      resignAt: input.resignDate == null ? null : toDateColumn(input.resignDate),
      reason: input.reason ?? null,
      recordedTimezone: 'UTC',
      createdBy: input.createdBy ?? null,
    })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

/** 팀 계층 한 줄 — 팀 모듈(2e) 전이라 손으로 넣는다. 🔴 자기 행(depth 0)은 넣지 않을 수 있다(§14 R6-3) */
export async function seedClosure(
  db: Kysely<AdminDatabase>,
  ancestorNo: bigint,
  descendantNo: bigint,
  depth: number,
): Promise<void> {
  await db.insertInto('teamClosure').values({ ancestorNo, descendantNo, depth }).execute()
}

export interface PeriodRow {
  joinDate: string
  resignDate: string | null
  reason: string | null
  recordedTimezone: string
  createdBy: bigint | null
}

/** 그 사용자의 재직 구간 — 입사일 · 번호 오름차순 */
export async function periodsOf(db: Kysely<AdminDatabase>, userNo: bigint): Promise<PeriodRow[]> {
  const rows = await db
    .selectFrom('userEmploymentPeriods')
    .select(['joinAt', 'resignAt', 'reason', 'recordedTimezone', 'createdBy'])
    .where('userNo', '=', userNo)
    .orderBy('joinAt')
    .orderBy('periodNo')
    .execute()
  return rows.map((row) => ({
    joinDate: fromDateColumn(row.joinAt),
    resignDate: row.resignAt === null ? null : fromDateColumn(row.resignAt),
    reason: row.reason,
    recordedTimezone: row.recordedTimezone,
    createdBy: row.createdBy,
  }))
}

/** users 행의 쓰기 관련 열 */
export function userRow(db: Kysely<AdminDatabase>, userNo: bigint) {
  return db
    .selectFrom('users')
    .select([
      'userName',
      'roleNo',
      'joinAt',
      'resignAt',
      'revision',
      'updateAt',
      'createAt',
      'password',
      'isPasswordChangeRequired',
      'loginFailCount',
      'lockUntil',
    ])
    .where('userNo', '=', userNo)
    .executeTakeFirstOrThrow()
}

/** 살아 있는 세션 하나 — 하루 뒤 만료 */
export function seedSession(db: Kysely<AdminDatabase>, userNo: bigint): Promise<bigint> {
  const now = new Date()
  return new AdminSessionStore(db).create({
    userNo,
    refreshTokenHash: randomBytes(32).toString('hex'),
    userAgent: null,
    ipAddress: null,
    loginAt: now,
    now,
    expireAt: new Date(now.getTime() + 86_400_000),
  })
}

export async function liveSessionCount(db: Kysely<AdminDatabase>, userNo: bigint): Promise<number> {
  const row = await db
    .selectFrom('sessions')
    .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
    .where('userNo', '=', userNo)
    .where('isRevoked', '=', false)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}
