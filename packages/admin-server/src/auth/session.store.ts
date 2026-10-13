import { Inject, Injectable } from '@nestjs/common'
import type { Kysely, Transaction } from 'kysely'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase, AdminSessionRevokeReason } from '../database/types.js'
import { KYSELY } from '../tokens.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.repository.ts(세션 메서드 · 호출부가 주는 revokedAt) +
//       hangang-home modules/auth/auth.service.ts `issueSession`(메타를 폭으로 자른 뒤 INSERT · A6) · 폐기 조건절(R34)
// 바꾼 점:
//  - 🔴 회전이 한 트랜잭션이다(스펙 B3) — 정본 둘은 폐기 · INSERT · 링크를 따로 보내 INSERT 가 죽으면 그 기기가 되돌릴 수
//    없이 로그아웃됐다.
//  - 메타를 코드 포인트 단위로 자른다 — UTF-16 으로 자르면 이모지 서로게이트 반쪽이 남는다.
//  - 패키지 내부다(스펙 ⑤ A1) — 교체 대상이 아니다. 2c 가 목록 메서드를 더한다.

export interface AdminSessionRow {
  sessionNo: bigint
  userNo: bigint
  loginAt: Date
  expireAt: Date
  isRevoked: boolean
  revokedReason: AdminSessionRevokeReason | null
  revokedAt: Date | null
  replacedBySessionNo: bigint | null
}

export interface NewSessionInput {
  userNo: bigint
  /** sha256 hex — 원문을 넘기지 않는다 */
  refreshTokenHash: string
  userAgent: string | null
  ipAddress: string | null
  /** 첫 로그인 시각 — 회전은 옛 값을 옮겨 담는다(2a F14) */
  loginAt: Date
  /** 이 요청의 시각 — lastAccessAt 이 된다 */
  now: Date
  expireAt: Date
}

/** 0007 장의 컬럼 폭 */
export const SESSION_USER_AGENT_MAX = 512
export const SESSION_IP_ADDRESS_MAX = 45

const SESSION_COLUMNS = [
  'sessionNo',
  'userNo',
  'loginAt',
  'expireAt',
  'isRevoked',
  'revokedReason',
  'revokedAt',
  'replacedBySessionNo',
] as const

/** 🔴 자르지 않으면 회전 중 INSERT 가 죽는다(hangang A6). 코드 포인트 단위 — 서로게이트 반쪽을 남기지 않는다. */
function clamp(value: string | null, max: number): string | null {
  if (value == null) return null
  const points = [...value]
  return points.length <= max ? value : points.slice(0, max).join('')
}

async function insertSession(db: Kysely<AdminDatabase>, input: NewSessionInput): Promise<bigint> {
  const result = await db
    .insertInto('sessions')
    .values({
      userNo: input.userNo,
      refreshTokenHash: input.refreshTokenHash,
      userAgent: clamp(input.userAgent, SESSION_USER_AGENT_MAX),
      ipAddress: clamp(input.ipAddress, SESSION_IP_ADDRESS_MAX),
      loginAt: input.loginAt,
      lastAccessAt: input.now,
      expireAt: input.expireAt,
    })
    .executeTakeFirstOrThrow()
  if (result.insertId === undefined)
    throw new Error('sessions INSERT 가 insertId 를 돌려주지 않았다.')
  return result.insertId
}

@Injectable()
export class AdminSessionStore {
  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  create(input: NewSessionInput): Promise<bigint> {
    return runQuery(() => insertSession(this.db, input))
  }

  async findByRefreshHash(refreshTokenHash: string): Promise<AdminSessionRow | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('sessions')
        .select(SESSION_COLUMNS)
        .where('refreshTokenHash', '=', refreshTokenHash)
        .executeTakeFirst(),
    )
    return row ?? null
  }

  async findByNo(sessionNo: bigint): Promise<AdminSessionRow | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('sessions')
        .select(SESSION_COLUMNS)
        .where('sessionNo', '=', sessionNo)
        .executeTakeFirst(),
    )
    return row ?? null
  }

  /**
   * 🔴 한 트랜잭션: 옛 행 조건부 폐기 → 새 행 INSERT → 옛 행 링크. 조건부 UPDATE 가 0행이면 null — 다른 요청이 먼저
   * 회전했다(P1). InnoDB UPDATE 는 잠금 읽기라 진 쪽은 이긴 쪽 커밋까지 기다렸다가 0행을 받는다(스펙 §14 R1-4).
   * 🔴 호출부는 null 뒤의 재조회를 이 트랜잭션 밖에서 한다(스펙 §14 R2).
   */
  rotate(
    old: { sessionNo: bigint; loginAt: Date },
    next: Omit<NewSessionInput, 'loginAt'>,
  ): Promise<bigint | null> {
    return runWriteTransaction(this.db, async (trx) => {
      const revoked = await trx
        .updateTable('sessions')
        .set({ isRevoked: true, revokedReason: 'rotated', revokedAt: next.now })
        .where('sessionNo', '=', old.sessionNo)
        .where('isRevoked', '=', false)
        .executeTakeFirst()
      if (revoked.numUpdatedRows === 0n) return null

      const sessionNo = await insertSession(trx, { ...next, loginAt: old.loginAt })
      // 최초 후계만 기록한다 — 유예창 판정이 그것을 본다(gise).
      await trx
        .updateTable('sessions')
        .set({ replacedBySessionNo: sessionNo })
        .where('sessionNo', '=', old.sessionNo)
        .where('replacedBySessionNo', 'is', null)
        .execute()
      return sessionNo
    })
  }

  /** 살아 있을 때만 폐기한다 — 🔴 이미 폐기된 행의 사유를 덮지 않는다('rotated' 를 덮으면 재사용 탐지가 꺼진다, gise). */
  async revoke(sessionNo: bigint, reason: AdminSessionRevokeReason, now: Date): Promise<number> {
    const result = await runQuery(() =>
      this.db
        .updateTable('sessions')
        .set({ isRevoked: true, revokedReason: reason, revokedAt: now })
        .where('sessionNo', '=', sessionNo)
        .where('isRevoked', '=', false)
        .executeTakeFirst(),
    )
    return Number(result.numUpdatedRows)
  }

  /** 🔴 그 사용자의 살아 있는 행만 바꾼다 — 'rotated' · 'terminated' 사유는 사후 분석 정보라 남긴다(hangang R34). */
  async revokeAllOfUser(
    userNo: bigint,
    reason: AdminSessionRevokeReason,
    now: Date,
    options: { exceptSessionNo?: bigint; trx?: Transaction<AdminDatabase> } = {},
  ): Promise<number> {
    const run = (db: Kysely<AdminDatabase>) => {
      let query = db
        .updateTable('sessions')
        .set({ isRevoked: true, revokedReason: reason, revokedAt: now })
        .where('userNo', '=', userNo)
        .where('isRevoked', '=', false)
      if (options.exceptSessionNo != null) {
        query = query.where('sessionNo', '!=', options.exceptSessionNo)
      }
      return query.executeTakeFirst()
    }
    const result = options.trx ? await run(options.trx) : await runQuery(() => run(this.db))
    return Number(result.numUpdatedRows)
  }
}
