import { Inject, Injectable } from '@nestjs/common'
import type { SortCondition } from '@ssworks/admin-shared'
import { sql, type Kysely, type SqlBool, type Transaction } from 'kysely'
import { likeContains } from '../database/like.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase, AdminSessionRevokeReason } from '../database/types.js'
import { KYSELY } from '../tokens.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.repository.ts(세션 메서드 · 호출부가 주는 revokedAt) +
//       hangang-home modules/auth/auth.service.ts `issueSession`(메타를 폭으로 자른 뒤 INSERT · A6) · 폐기 조건절(R34)
// 바꾼 점:
//  - 🔴 회전이 한 트랜잭션이다(스펙 B3) — 정본 둘은 폐기 · INSERT · 링크를 따로 보내 INSERT 가 죽으면 그 기기가 되돌릴 수
//    없이 로그아웃됐다.
//  - 메타를 코드 포인트 단위로 자른다 — UTF-16 으로 자르면 이모지 서로게이트 반쪽이 남는다.
//  - 패키지 내부다(스펙 ⑤ A1) — 교체 대상이 아니다. 2c 가 목록 · 조건부 폐기를 더했다(2c 스펙 §5-6) — gise
//    listLiveSessionsOfUser · revokeOwnOtherSessionsInTransaction + axion activeSessionsQuery(검색).
//  - 2f-2a(스펙 A12): 회전 · 로그인 확정 · 유예 발급이 users 잠금과 같은 트랜잭션에 세션을 쓴다 — rotate 는 받은 트랜잭션 위에서만,
//    create 는 trx 를 받을 수 있다. 트랜잭션은 인증 서비스가 연다(users 를 세션보다 먼저 — 2d R10-3).

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

export type AdminSessionSortColumn = 'lastAccessAt' | 'loginAt' | 'expireAt'

/** 목록 행 — 세션 라우트가 isCurrent 를 붙여 낸다. 🔴 refreshTokenHash 는 어느 목록 select 에도 없다(hangang) */
export interface AdminSessionMeta {
  sessionNo: bigint
  userAgent: string | null
  ipAddress: string | null
  loginAt: Date
  lastAccessAt: Date
  expireAt: Date
}

export interface AdminSessionListRow extends AdminSessionMeta {
  userNo: bigint
  userId: string
  userName: string
}

/** 세션 끊기의 권한 상승 검사 대상(2d 스펙 §5-5). permissions 는 역할 열 그대로 — readPermissionsColumn 으로 읽는다 */
export interface AdminSessionTarget {
  userNo: bigint
  roleNo: bigint
  permissions: unknown
}

export interface LiveSessionQuery {
  now: Date
  /** 앞뒤 공백을 뗀 검색어 — 비었으면 넘기지 않는다(조건 없음) */
  keyword?: string
  userNo?: bigint
  sort: readonly SortCondition<AdminSessionSortColumn>[]
  offset: number
  limit: number
}

const META_COLUMNS = [
  's.sessionNo',
  's.userAgent',
  's.ipAddress',
  's.loginAt',
  's.lastAccessAt',
  's.expireAt',
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

  /** 🔴 `trx` 를 주면 그 트랜잭션 위에서 쓴다 — 로그인 확정 · 유예 발급이 users 잠금과 한 트랜잭션에 넣는다(2f-2a 스펙 A12) */
  create(input: NewSessionInput, trx?: Transaction<AdminDatabase>): Promise<bigint> {
    // 트랜잭션 안이면 runQuery 로 감싸지 않는다 — runWriteTransaction 이 드라이버 오류를 바꾼다.
    return trx ? insertSession(trx, input) : runQuery(() => insertSession(this.db, input))
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
   * 🔴 받은 트랜잭션 위에서: 옛 행 조건부 폐기 → 새 행 INSERT → 옛 행 링크(스펙 B3 — 한 트랜잭션). 스스로 트랜잭션을 열지
   * 않는다 — 인증 서비스가 users 공유 잠금을 첫 문장으로 잡은 트랜잭션을 넘긴다(2f-2a 스펙 A7 — 2d R10-3 교착). 조건부 UPDATE 가
   * 0행이면 null — 다른 요청이 먼저 회전했거나 초기화 · 퇴사 · 로그아웃이 먼저 끊었다(P1). InnoDB UPDATE 는 잠금 읽기라 진 쪽은
   * 이긴 쪽 커밋까지 기다렸다가 0행을 받는다(스펙 §14 R1-4). 🔴 호출부는 null 뒤의 재조회를 이 트랜잭션 밖에서 한다(스펙 §14 R2).
   */
  async rotate(
    trx: Transaction<AdminDatabase>,
    old: { sessionNo: bigint; loginAt: Date },
    next: Omit<NewSessionInput, 'loginAt'>,
  ): Promise<bigint | null> {
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

  /**
   * 🔴 그 사용자의 살아 있는 행만 바꾼다 — 'rotated' · 'terminated' 사유는 사후 분석 정보라 남긴다(hangang R34).
   * `liveOnly` 면 이미 만료된 행도 건드리지 않는다 — 세션 라우트의 끊은 개수에 죽은 행을 세지 않는다(2c 스펙 B9).
   */
  async revokeAllOfUser(
    userNo: bigint,
    reason: AdminSessionRevokeReason,
    now: Date,
    options: {
      exceptSessionNo?: bigint
      trx?: Transaction<AdminDatabase>
      liveOnly?: boolean
    } = {},
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
      if (options.liveOnly === true) query = query.where('expireAt', '>', now)
      return query.executeTakeFirst()
    }
    const result = options.trx ? await run(options.trx) : await runQuery(() => run(this.db))
    return Number(result.numUpdatedRows)
  }

  /**
   * 살아 있는 세션 전체 목록(2c 스펙 §5-6) — 사용자 JOIN · 검색어 · 사용자 필터 · 정렬 · 쪽.
   * "살아 있음" = isRevoked = false AND expireAt > now. 🔴 코어 users 의 userId · userName 을 직접 JOIN 한다(2c 스펙 B4).
   */
  listLive(query: LiveSessionQuery): Promise<{ rows: AdminSessionListRow[]; total: bigint }> {
    return runQuery(async () => {
      let base = this.db
        .selectFrom('sessions as s')
        .innerJoin('users as u', 'u.userNo', 's.userNo')
        .where('s.isRevoked', '=', false)
        .where('s.expireAt', '>', query.now)
      if (query.keyword) {
        const pattern = likeContains(query.keyword)
        base = base.where((eb) =>
          eb.or([
            sql<SqlBool>`${sql.ref('u.userId')} like ${pattern} escape '!'`,
            sql<SqlBool>`${sql.ref('u.userName')} like ${pattern} escape '!'`,
          ]),
        )
      }
      if (query.userNo != null) base = base.where('s.userNo', '=', query.userNo)

      const counted = await base
        .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
        .executeTakeFirstOrThrow()
      let rows = base.select([...META_COLUMNS, 's.userNo', 'u.userId', 'u.userName'])
      for (const { column, order } of query.sort) rows = rows.orderBy(`s.${column}`, order)
      const result = await rows
        .orderBy('s.sessionNo', 'desc')
        .limit(query.limit)
        .offset(query.offset)
        .execute()
      return { rows: result, total: BigInt(counted.n) }
    })
  }

  /** 그 사용자의 살아 있는 세션 전량(3c §10 — 상한 없음), 마지막 활동 내림차순 */
  listLiveOfUser(userNo: bigint, now: Date): Promise<AdminSessionMeta[]> {
    return runQuery(() =>
      this.db
        .selectFrom('sessions as s')
        .select(META_COLUMNS)
        .where('s.userNo', '=', userNo)
        .where('s.isRevoked', '=', false)
        .where('s.expireAt', '>', now)
        .orderBy('s.lastAccessAt', 'desc')
        .orderBy('s.sessionNo', 'desc')
        .execute(),
    )
  }

  /**
   * 살아 있는 세션 하나를 'terminated' 로 끊는다(2c 세션 라우트). `userNo` 를 주면 그 사용자의 것만이다.
   * 🔴 조건부 UPDATE 한 문장이다 — 남의 · 없는 · 끝난 · 방금 회전한 세션이 모두 같은 0 이 된다(존재를 드러내지 않는다,
   *    2c 스펙 공통 3). 회전과 겹치면 InnoDB 잠금 읽기가 가른다.
   */
  async revokeLive(
    sessionNo: bigint,
    now: Date,
    options: { userNo?: bigint } = {},
  ): Promise<number> {
    const result = await runQuery(() => {
      let query = this.db
        .updateTable('sessions')
        .set({ isRevoked: true, revokedReason: 'terminated', revokedAt: now })
        .where('sessionNo', '=', sessionNo)
        .where('isRevoked', '=', false)
        .where('expireAt', '>', now)
      if (options.userNo != null) query = query.where('userNo', '=', options.userNo)
      return query.executeTakeFirst()
    })
    return Number(result.numUpdatedRows)
  }

  /** 살아 있는 세션의 주인과 그 역할 권한. 끝났거나 없으면 null(2d 스펙 §5-5 — 2c ⑪ D1) */
  async findLiveOwner(sessionNo: bigint, now: Date): Promise<AdminSessionTarget | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('sessions as s')
        .innerJoin('users as u', 'u.userNo', 's.userNo')
        .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
        .select(['s.userNo', 'u.roleNo', 'r.permissions'])
        .where('s.sessionNo', '=', sessionNo)
        .where('s.isRevoked', '=', false)
        .where('s.expireAt', '>', now)
        .executeTakeFirst(),
    )
    return row ?? null
  }

  /** 사용자와 그 역할 권한. 없으면 null */
  async findUserTarget(userNo: bigint): Promise<AdminSessionTarget | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('users as u')
        .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
        .select(['u.userNo', 'u.roleNo', 'r.permissions'])
        .where('u.userNo', '=', userNo)
        .executeTakeFirst(),
    )
    return row ?? null
  }
}
