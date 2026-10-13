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
