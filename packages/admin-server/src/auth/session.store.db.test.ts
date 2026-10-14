import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { holdRotation, seedRole, seedUser } from '../test-support/auth.js'
import { createRefreshToken, hashRefreshToken } from './refresh-token.js'
import { AdminSessionStore, type NewSessionInput } from './session.store.js'

let t: TestDatabase
let store: AdminSessionStore
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  store = new AdminSessionStore(t.db)
  roleNo = await seedRole(t.db)
})

afterAll(async () => {
  await t?.drop()
})

/** 초 단위로 잘린 시각 — datetime · timestamp 컬럼은 초에서 잘린다(스펙 §14 R5) */
function second(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000)
}

function input(userNo: bigint, overrides: Partial<NewSessionInput> = {}): NewSessionInput {
  const now = second(new Date())
  return {
    userNo,
    refreshTokenHash: hashRefreshToken(createRefreshToken()),
    userAgent: 'UA/1',
    ipAddress: '10.0.0.1',
    loginAt: now,
    now,
    expireAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
    ...overrides,
  }
}

describe('create · find', () => {
  it('넣은 값 그대로 읽는다 — 해시 · 번호로', async () => {
    const user = await seedUser(t.db, { roleNo })
    const fields = input(user.userNo, { loginAt: second(new Date('2026-01-01T00:00:00.000Z')) })
    const sessionNo = await store.create(fields)
    const row = await store.findByRefreshHash(fields.refreshTokenHash)
    expect(row).toEqual({
      sessionNo,
      userNo: user.userNo,
      loginAt: fields.loginAt,
      expireAt: fields.expireAt,
      isRevoked: false,
      revokedReason: null,
      revokedAt: null,
      replacedBySessionNo: null,
    })
    expect(await store.findByNo(sessionNo)).toEqual(row)
    expect(await store.findByRefreshHash(hashRefreshToken('nope'))).toBeNull()
  })

  it('🔴 이모지가 든 600자 User-Agent 를 코드 포인트 512자로 자르고 IP 를 45자로 자른다 — Review Focus 3', async () => {
    const user = await seedUser(t.db, { roleNo })
    const userAgent = '🙂'.repeat(600)
    const sessionNo = await store.create(
      input(user.userNo, { userAgent, ipAddress: '1'.repeat(60) }),
    )
    const row = await t.db
      .selectFrom('sessions')
      .select(['userAgent', 'ipAddress'])
      .where('sessionNo', '=', sessionNo)
      .executeTakeFirstOrThrow()
    expect([...(row.userAgent ?? '')]).toHaveLength(512)
    expect(row.userAgent).toBe('🙂'.repeat(512))
    expect(row.ipAddress).toBe('1'.repeat(45))
  })
})

describe('rotate', () => {
  it('옛 행을 rotated 로 · 새 행은 옛 loginAt 을 옮겨 담고 · 옛 행이 새 행을 가리킨다', async () => {
    const user = await seedUser(t.db, { roleNo })
    const loginAt = second(new Date('2026-02-02T02:02:02.000Z'))
    const oldNo = await store.create(input(user.userNo, { loginAt }))
    const now = second(new Date())
    const next = input(user.userNo, { now })
    const newNo = await store.rotate({ sessionNo: oldNo, loginAt }, next)
    expect(newNo).not.toBeNull()
    expect(await store.findByNo(oldNo)).toMatchObject({
      isRevoked: true,
      revokedReason: 'rotated',
      revokedAt: now,
      replacedBySessionNo: newNo,
    })
    expect(await store.findByNo(newNo!)).toMatchObject({
      userNo: user.userNo,
      loginAt,
      isRevoked: false,
      replacedBySessionNo: null,
    })
  })

  it('이미 폐기된 행은 0행 — null', async () => {
    const user = await seedUser(t.db, { roleNo })
    const oldNo = await store.create(input(user.userNo))
    await store.revoke(oldNo, 'terminated', new Date())
    expect(
      await store.rotate({ sessionNo: oldNo, loginAt: new Date() }, input(user.userNo)),
    ).toBeNull()
  })

  it('🔴 INSERT 가 실패하면 옛 행도 되돌아간다 — 한 트랜잭션(스펙 B3)', async () => {
    const user = await seedUser(t.db, { roleNo })
    const taken = input(user.userNo)
    await store.create(taken)
    const oldNo = await store.create(input(user.userNo))
    const error = await store
      .rotate(
        { sessionNo: oldNo, loginAt: new Date() },
        input(user.userNo, { refreshTokenHash: taken.refreshTokenHash }),
      )
      .then(
        () => undefined,
        (caught: unknown) => caught,
      )
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_DUPLICATED)
    expect(await store.findByNo(oldNo)).toMatchObject({ isRevoked: false, revokedReason: null })
  })

  it('🔴 다른 연결이 커밋 전에 옛 행을 잡고 있으면 기다렸다가 0행 — P1(스펙 §14 R1-4)', async () => {
    const user = await seedUser(t.db, { roleNo })
    const oldNo = await store.create(input(user.userNo))
    const successorNo = await store.create(input(user.userNo))
    const hold = await holdRotation(t, oldNo, successorNo)
    const pending = store.rotate({ sessionNo: oldNo, loginAt: new Date() }, input(user.userNo))
    await new Promise((resolve) => setTimeout(resolve, 300))
    await hold.release()
    expect(await pending).toBeNull()
    expect(await store.findByNo(oldNo)).toMatchObject({
      revokedReason: 'rotated',
      replacedBySessionNo: successorNo,
    })
  })
})

describe('revoke · revokeAllOfUser', () => {
  it('revoke 는 살아 있을 때만 — 이미 폐기된 행의 사유를 덮지 않는다', async () => {
    const user = await seedUser(t.db, { roleNo })
    const sessionNo = await store.create(input(user.userNo))
    expect(await store.revoke(sessionNo, 'terminated', new Date())).toBe(1)
    expect(await store.revoke(sessionNo, 'reuse_detected', new Date())).toBe(0)
    expect(await store.findByNo(sessionNo)).toMatchObject({ revokedReason: 'terminated' })
  })

  it('🔴 revokeAllOfUser 는 그 사용자의 살아 있는 행만 바꾼다 — rotated · terminated 사유와 남의 세션은 그대로(hangang R34)', async () => {
    const user = await seedUser(t.db, { roleNo })
    const other = await seedUser(t.db, { roleNo })
    const rotatedOld = await store.create(input(user.userNo))
    const live = await store.rotate(
      { sessionNo: rotatedOld, loginAt: new Date() },
      input(user.userNo),
    )
    const ended = await store.create(input(user.userNo))
    await store.revoke(ended, 'terminated', new Date())
    const liveTwo = await store.create(input(user.userNo))
    const othersLive = await store.create(input(other.userNo))

    expect(await store.revokeAllOfUser(user.userNo, 'reuse_detected', new Date())).toBe(2)
    expect((await store.findByNo(rotatedOld))?.revokedReason).toBe('rotated')
    expect((await store.findByNo(ended))?.revokedReason).toBe('terminated')
    expect((await store.findByNo(live!))?.revokedReason).toBe('reuse_detected')
    expect((await store.findByNo(liveTwo))?.revokedReason).toBe('reuse_detected')
    expect((await store.findByNo(othersLive))?.isRevoked).toBe(false)
  })

  it('exceptSessionNo 는 남기고 trx 위에서도 돈다', async () => {
    const user = await seedUser(t.db, { roleNo })
    const keep = await store.create(input(user.userNo))
    const drop = await store.create(input(user.userNo))
    const count = await t.db.transaction().execute((trx) =>
      store.revokeAllOfUser(user.userNo, 'terminated', new Date(), {
        exceptSessionNo: keep,
        trx,
      }),
    )
    expect(count).toBe(1)
    expect((await store.findByNo(keep))?.isRevoked).toBe(false)
    expect((await store.findByNo(drop))?.revokedReason).toBe('terminated')
  })
})

const DESC = [{ column: 'lastAccessAt', order: 'desc' }] as const

describe('listLive(2c 스펙 §5-6)', () => {
  it('🔴 살아 있는 행만 — 폐기 · 만료 · expireAt 이 지금과 같은 행은 빠진다(Review Focus 4)', async () => {
    const user = await seedUser(t.db, { roleNo, userId: 'live-only' })
    const now = second(new Date())
    const live = await store.create(input(user.userNo))
    const revoked = await store.create(input(user.userNo))
    await store.revoke(revoked, 'terminated', now)
    await store.create(input(user.userNo, { expireAt: new Date(now.getTime() - 1000) }))
    await store.create(input(user.userNo, { expireAt: now }))

    const { rows, total } = await store.listLive({
      now,
      userNo: user.userNo,
      sort: DESC,
      offset: 0,
      limit: 20,
    })
    expect(rows.map((row) => row.sessionNo)).toEqual([live])
    expect(total).toBe(1n)
    expect(rows[0]).toMatchObject({
      userNo: user.userNo,
      userId: 'live-only',
      userAgent: 'UA/1',
      ipAddress: '10.0.0.1',
    })
    // 🔴 refresh 토큰 해시는 어느 목록에도 나가지 않는다(hangang)
    expect(rows[0]).not.toHaveProperty('refreshTokenHash')
  })

  it('🔴 검색어 — 아이디 · 이름 부분일치, % _ ! 는 글자 그대로, 대소문자 무시(Review Focus 2)', async () => {
    const now = second(new Date())
    for (const [userId, userName] of [
      ['kw%1', '가'],
      ['kwx1', '나'],
      ['kw_1', '다'],
      ['kwy1', '라'],
      ['kw!1', '마'],
      ['KWZ9', '홍길동'],
    ] as const) {
      const user = await seedUser(t.db, { roleNo, userId, userName })
      await store.create(input(user.userNo))
    }
    const ids = async (keyword: string) =>
      (await store.listLive({ now, keyword, sort: DESC, offset: 0, limit: 100 })).rows
        .map((row) => row.userId)
        .sort()

    expect(await ids('%')).toEqual(['kw%1'])
    expect(await ids('_')).toEqual(['kw_1'])
    expect(await ids('!')).toEqual(['kw!1'])
    expect(await ids('kwz')).toEqual(['KWZ9'])
    expect(await ids('길동')).toEqual(['KWZ9'])
  })

  it('정렬 · 같은 값은 sessionNo 내림차순 · 쪽 · 전체 개수', async () => {
    const user = await seedUser(t.db, { roleNo })
    const base = second(new Date())
    const earlier = new Date(base.getTime() - 60_000)
    const older = await store.create(input(user.userNo, { now: earlier, loginAt: earlier }))
    const tieA = await store.create(input(user.userNo, { now: base }))
    const tieB = await store.create(input(user.userNo, { now: base }))
    const list = (order: 'asc' | 'desc', offset = 0, limit = 10) =>
      store.listLive({
        now: base,
        userNo: user.userNo,
        sort: [{ column: 'lastAccessAt', order }],
        offset,
        limit,
      })

    expect((await list('desc')).rows.map((row) => row.sessionNo)).toEqual([tieB, tieA, older])
    expect((await list('asc')).rows.map((row) => row.sessionNo)).toEqual([older, tieB, tieA])
    const page = await list('desc', 1, 1)
    expect(page.rows.map((row) => row.sessionNo)).toEqual([tieA])
    expect(page.total).toBe(3n)
  })
})

describe('listLiveOfUser', () => {
  it('그 사용자의 살아 있는 행만, 마지막 활동 내림차순', async () => {
    const me = await seedUser(t.db, { roleNo })
    const other = await seedUser(t.db, { roleNo })
    const now = second(new Date())
    const a = await store.create(input(me.userNo, { now: new Date(now.getTime() - 1000) }))
    const b = await store.create(input(me.userNo, { now }))
    await store.create(input(other.userNo))
    const dead = await store.create(input(me.userNo))
    await store.revoke(dead, 'terminated', now)

    expect((await store.listLiveOfUser(me.userNo, now)).map((row) => row.sessionNo)).toEqual([b, a])
  })
})

describe('revokeLive', () => {
  it('🔴 살아 있는 행만 terminated 로 — 남의 것 · 두 번째 · 만료는 0', async () => {
    const me = await seedUser(t.db, { roleNo })
    const other = await seedUser(t.db, { roleNo })
    const now = second(new Date())
    const mine = await store.create(input(me.userNo))

    expect(await store.revokeLive(mine, now, { userNo: other.userNo })).toBe(0)
    expect(await store.revokeLive(mine, now, { userNo: me.userNo })).toBe(1)
    expect(await store.revokeLive(mine, now)).toBe(0)
    expect(await store.findByNo(mine)).toMatchObject({
      isRevoked: true,
      revokedReason: 'terminated',
      revokedAt: now,
    })

    const expired = await store.create(input(me.userNo, { expireAt: now }))
    expect(await store.revokeLive(expired, now)).toBe(0)
    expect((await store.findByNo(expired))?.isRevoked).toBe(false)
  })
})

describe('revokeAllOfUser — liveOnly(2c 스펙 B9)', () => {
  it('만료된 행은 세지도 바꾸지도 않고 exceptSessionNo 는 남긴다', async () => {
    const me = await seedUser(t.db, { roleNo })
    const now = second(new Date())
    const keep = await store.create(input(me.userNo))
    const other = await store.create(input(me.userNo))
    const expired = await store.create(
      input(me.userNo, { expireAt: new Date(now.getTime() - 1000) }),
    )

    expect(
      await store.revokeAllOfUser(me.userNo, 'terminated', now, {
        exceptSessionNo: keep,
        liveOnly: true,
      }),
    ).toBe(1)
    expect((await store.findByNo(other))?.revokedReason).toBe('terminated')
    expect((await store.findByNo(keep))?.isRevoked).toBe(false)
    expect((await store.findByNo(expired))?.isRevoked).toBe(false)
  })
})
