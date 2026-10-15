import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  addToTeam,
  createAuthKit,
  fakeRequest,
  holdRotation,
  seedRole,
  seedTeam,
  seedUser,
  type AuthKit,
} from '../test-support/auth.js'
import { AUTH_MESSAGES } from './errors.js'
import { hashRefreshToken } from './refresh-token.js'

let t: TestDatabase
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db)
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(promise: Promise<unknown>): Promise<BusinessError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('거부되지 않았다')
}

const later = (ms: number) => new Date(Date.now() + ms)

async function login(kit: AuthKit, input: Parameters<typeof seedUser>[1] = { roleNo }) {
  const user = await seedUser(t.db, input)
  const tokens = await kit.service.login(
    { userId: user.userId, password: user.password },
    fakeRequest(),
  )
  const sessionNo = kit.tokens.verify(tokens.accessToken, new Date()).sessionNo
  return { user, tokens, sessionNo }
}

async function sessionOf(kit: AuthKit, refreshToken: string) {
  return kit.store.findByRefreshHash(hashRefreshToken(refreshToken))
}

async function liveSessions(userNo: bigint): Promise<bigint[]> {
  const rows = await t.db
    .selectFrom('sessions')
    .select('sessionNo')
    .where('userNo', '=', userNo)
    .where('isRevoked', '=', false)
    .execute()
  return rows.map((row) => row.sessionNo)
}

describe('refresh — 회전', () => {
  it('새 토큰 둘 · 옛 행 rotated + 링크 · 새 행이 옛 loginAt 을 옮겨 담는다 · token.refresh', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    const loginAt = new Date('2026-03-04T05:06:07.000Z')
    // loginAt 은 앱 쓰기 타입이 insert 전용이라(UPDATE 는 never) 테스트에서만 원시 값으로 되돌린다.
    await sql`update sessions set login_at = ${loginAt} where session_no = ${sessionNo}`.execute(
      t.db,
    )

    const next = await kit.service.refresh(tokens.refreshToken, fakeRequest())
    expect(next.refreshToken).not.toBe(tokens.refreshToken)
    const fresh = await sessionOf(kit, next.refreshToken)
    expect(fresh).toMatchObject({ userNo: user.userNo, loginAt, isRevoked: false })
    expect(await kit.store.findByNo(sessionNo)).toMatchObject({
      revokedReason: 'rotated',
      replacedBySessionNo: fresh!.sessionNo,
    })
    expect(kit.tokens.verify(next.accessToken, new Date()).sessionNo).toBe(fresh!.sessionNo)
    expect(kit.events.events.at(-1)).toEqual({
      type: 'token.refresh',
      userNo: user.userNo,
      sessionNo: fresh!.sessionNo,
      rotatedFrom: sessionNo,
      grace: false,
    })
  })

  it.each([
    [
      '쿠키 없음',
      undefined,
      CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
      AUTH_MESSAGES.refreshMissing,
    ],
    [
      '모르는 토큰',
      'f'.repeat(128),
      CommonErrorCodes.ERR_INVALID_TOKEN,
      AUTH_MESSAGES.refreshInvalid,
    ],
  ])('%s → 거부', async (_label, token, code, message) => {
    const kit = createAuthKit(t)
    const error = await rejection(kit.service.refresh(token, fakeRequest()))
    expect(error.code).toBe(code)
    expect(error.message).toBe(message)
  })

  it("🔴 'terminated' · 'reuse_detected' 재제시는 401 ERR_INVALID_TOKEN 만 — 다른 세션은 그대로", async () => {
    const kit = createAuthKit(t)
    const first = await login(kit)
    const second = await kit.service.login(
      { userId: first.user.userId, password: first.user.password },
      fakeRequest(),
    )
    await kit.store.revoke(first.sessionNo, 'terminated', new Date())
    const ended = await rejection(kit.service.refresh(first.tokens.refreshToken, fakeRequest()))
    expect(ended.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(ended.message).toBe(AUTH_MESSAGES.refreshEnded)
    expect((await sessionOf(kit, second.refreshToken))?.isRevoked).toBe(false)

    const secondNo = (await sessionOf(kit, second.refreshToken))!.sessionNo
    await kit.store.revoke(secondNo, 'reuse_detected', new Date())
    const detected = await rejection(kit.service.refresh(second.refreshToken, fakeRequest()))
    expect(detected.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
  })

  it('만료된 세션 — 401 ERR_SESSION_EXPIRED', async () => {
    const kit = createAuthKit(t)
    const { tokens, sessionNo } = await login(kit)
    await t.db
      .updateTable('sessions')
      .set({ expireAt: later(-2000) })
      .where('sessionNo', '=', sessionNo)
      .execute()
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_SESSION_EXPIRED)
    expect(error.message).toBe(AUTH_MESSAGES.refreshExpired)
  })

  it('🔴 퇴사 효력이 지났으면 회전 전에 403 — 행은 살아 있는 그대로', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
    expect((await kit.store.findByNo(sessionNo))?.isRevoked).toBe(false)
  })

  it('🔴 강제 변경 · 잠긴 계정의 세션은 회전한다 — 잠금은 비밀번호 대입 방어다', async () => {
    const kit = createAuthKit(t)
    const changing = await login(kit, { roleNo, isPasswordChangeRequired: true })
    await expect(
      kit.service.refresh(changing.tokens.refreshToken, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
    const locked = await login(kit)
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 5, lockUntil: later(10 * 60 * 1000) })
      .where('userNo', '=', locked.user.userNo)
      .execute()
    await expect(
      kit.service.refresh(locked.tokens.refreshToken, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })
})

describe('refresh — 회전된 토큰의 재제시(P2)', () => {
  it('유예창 안 + 후계가 살아 있으면 새 세션을 하나 더 — 후계 · 링크는 그대로, grace true', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    const winner = await kit.service.refresh(tokens.refreshToken, fakeRequest())
    const winnerNo = (await sessionOf(kit, winner.refreshToken))!.sessionNo

    const loser = await kit.service.refresh(tokens.refreshToken, fakeRequest())
    const loserRow = await sessionOf(kit, loser.refreshToken)
    expect(loserRow).toMatchObject({ isRevoked: false, userNo: user.userNo })
    expect(loserRow!.sessionNo).not.toBe(winnerNo)
    expect((await kit.store.findByNo(winnerNo))?.isRevoked).toBe(false)
    expect((await kit.store.findByNo(sessionNo))?.replacedBySessionNo).toBe(winnerNo)
    expect(kit.events.events.at(-1)).toMatchObject({
      type: 'token.refresh',
      grace: true,
      rotatedFrom: sessionNo,
    })
  })

  it('🔴 유예창 밖이면 그 사용자의 살아 있는 세션 전부 reuse_detected + 401 ERR_REFRESH_REUSED — 남의 세션은 그대로', async () => {
    const kit = createAuthKit(t)
    const deviceA = await login(kit)
    const deviceB = await kit.service.login(
      { userId: deviceA.user.userId, password: deviceA.user.password },
      fakeRequest(),
    )
    const stranger = await login(kit)
    await kit.service.refresh(deviceA.tokens.refreshToken, fakeRequest())
    await t.db
      .updateTable('sessions')
      .set({ revokedAt: later(-60_000) })
      .where('sessionNo', '=', deviceA.sessionNo)
      .execute()

    const error = await rejection(kit.service.refresh(deviceA.tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_REFRESH_REUSED)
    expect(error.message).toBe(AUTH_MESSAGES.refreshReused)
    expect(await liveSessions(deviceA.user.userNo)).toEqual([])
    expect((await sessionOf(kit, deviceB.refreshToken))?.revokedReason).toBe('reuse_detected')
    expect((await kit.store.findByNo(deviceA.sessionNo))?.revokedReason).toBe('rotated')
    expect(await liveSessions(stranger.user.userNo)).toEqual([stranger.sessionNo])
    expect(kit.events.events.at(-1)).toEqual({
      type: 'token.reuse',
      userNo: deviceA.user.userNo,
      sessionNo: deviceA.sessionNo,
      revokedCount: 2,
    })
  })

  it('🔴 후계가 로그아웃으로 죽었으면 창 안이어도 재사용이다', async () => {
    const kit = createAuthKit(t)
    const { tokens } = await login(kit)
    const winner = await kit.service.refresh(tokens.refreshToken, fakeRequest())
    await kit.service.logout(winner.refreshToken, fakeRequest())
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_REFRESH_REUSED)
  })

  it('유예창 0 이면 곧바로 재사용이다', async () => {
    const kit = createAuthKit(t, { auth: { refreshGraceMs: 0 } })
    const { tokens } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_REFRESH_REUSED)
  })

  it('🔴 유예 경로에서도 퇴사를 막는다', async () => {
    const kit = createAuthKit(t)
    const { user, tokens } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
  })
})

describe('refresh — 동시 회전 경합(P1, 결정적 재현)', () => {
  async function raced(kit: AuthKit) {
    const { user, tokens, sessionNo } = await login(kit)
    const successor = await kit.store.create({
      userNo: user.userNo,
      refreshTokenHash: hashRefreshToken(`successor-${sessionNo}`),
      userAgent: null,
      ipAddress: null,
      loginAt: new Date(),
      now: new Date(),
      expireAt: later(3600 * 1000),
    })
    const rotate = vi.spyOn(kit.store, 'rotate')
    const hold = await holdRotation(t, sessionNo, successor)
    const pending = kit.service.refresh(tokens.refreshToken, fakeRequest()).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    await new Promise((resolve) => setTimeout(resolve, 300))
    await hold.release()
    const outcome = await pending
    // 🔴 P1 을 지났는지 — 회전 시도가 한 번 있었고 그 결과가 0행(null)이다. P2 였다면 rotate 를 부르지 않는다.
    expect(rotate).toHaveBeenCalledTimes(1)
    expect(await rotate.mock.results[0]!.value).toBeNull()
    return { outcome, user, sessionNo, successor }
  }

  it('유예창 안이면 다시 읽어 grace — 200, 링크는 먼저 이긴 후계 그대로', async () => {
    const kit = createAuthKit(t)
    const { outcome, sessionNo, successor } = await raced(kit)
    expect(outcome).toHaveProperty('value.accessToken')
    expect((await kit.store.findByNo(sessionNo))?.replacedBySessionNo).toBe(successor)
  })

  it('🔴 유예창 0 이면 401 ERR_INVALID_TOKEN 만 — 전량 폐기하지 않는다(hangang)', async () => {
    const kit = createAuthKit(t, { auth: { refreshGraceMs: 0 } })
    const { outcome, user, successor } = await raced(kit)
    expect(outcome).toHaveProperty('error')
    const error = (outcome as { error: BusinessError }).error
    expect(error.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(error.message).toBe(AUTH_MESSAGES.refreshRaced)
    expect(await liveSessions(user.userNo)).toEqual([successor])
  })
})

describe('refresh — IP(2f-1 스펙 P11)', () => {
  it('🔴 정책이 거부하면 회전 전에 403 ERR_IP_NOT_ALLOWED + clientIp · access.blocked — 행은 그대로, 허용되면 다시 회전한다', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    const team = await seedTeam(t.db, 'refresh-ip-team')
    await addToTeam(t.db, team, user.userNo)
    kit.policy.allow = false
    const error = await rejection(
      kit.service.refresh(tokens.refreshToken, fakeRequest({ ip: '::ffff:198.51.100.9' })),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
    expect(error.details).toEqual({ clientIp: '198.51.100.9' })
    expect(kit.policy.calls.at(-1)).toEqual({
      clientIp: '198.51.100.9',
      userNo: user.userNo,
      teamNos: [team],
    })
    expect(kit.events.events.at(-1)).toEqual({
      type: 'access.blocked',
      reason: 'ip',
      userNo: user.userNo,
      sessionNo,
    })
    expect((await kit.store.findByNo(sessionNo))?.isRevoked).toBe(false)
    kit.policy.allow = true
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    expect((await kit.store.findByNo(sessionNo))?.revokedReason).toBe('rotated')
  })

  it('🔴 유예 발급도 막는다 — 새 세션을 만들지 않는다', async () => {
    const kit = createAuthKit(t)
    const { user, tokens } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    const live = await liveSessions(user.userNo)
    kit.policy.allow = false
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
    expect(await liveSessions(user.userNo)).toEqual(live)
  })

  it('퇴사가 IP 보다 먼저다 — 퇴사 403 이면 정책을 묻지 않는다(로그인 · 가드와 같은 순서)', async () => {
    const kit = createAuthKit(t)
    const { user, tokens } = await login(kit)
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const calls = kit.policy.calls.length
    kit.policy.allow = false
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
    expect(kit.policy.calls.length).toBe(calls)
  })

  it('정책이 없으면(IP 모듈 없음) 묻지 않고 회전한다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const { tokens } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    expect(kit.policy.calls).toEqual([])
  })
})

describe('logout', () => {
  it("살아 있는 세션을 'terminated' 로 · logout 이벤트 — 두 번째는 아무것도 안 한다", async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    await kit.service.logout(tokens.refreshToken, fakeRequest())
    expect(await kit.store.findByNo(sessionNo)).toMatchObject({ revokedReason: 'terminated' })
    expect(kit.events.events.at(-1)).toEqual({ type: 'logout', userNo: user.userNo, sessionNo })
    const before = kit.events.events.length
    await kit.service.logout(tokens.refreshToken, fakeRequest())
    expect(kit.events.events).toHaveLength(before)
  })

  it('쿠키 없음 · 모르는 토큰은 아무 일도 없다', async () => {
    const kit = createAuthKit(t)
    await expect(kit.service.logout(undefined, fakeRequest())).resolves.toBeUndefined()
    await expect(kit.service.logout('f'.repeat(128), fakeRequest())).resolves.toBeUndefined()
  })

  it("🔴 회전된 토큰으로 로그아웃해도 'rotated' 사유를 덮지 않는다(gise)", async () => {
    const kit = createAuthKit(t)
    const { tokens, sessionNo } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    await kit.service.logout(tokens.refreshToken, fakeRequest())
    expect((await kit.store.findByNo(sessionNo))?.revokedReason).toBe('rotated')
  })

  it('🔴 로그아웃한 탭의 옛 refresh 는 재사용 탐지가 아니다 — 다른 세션이 살아남는다', async () => {
    const kit = createAuthKit(t)
    const first = await login(kit)
    const other = await kit.service.login(
      { userId: first.user.userId, password: first.user.password },
      fakeRequest(),
    )
    await kit.service.logout(first.tokens.refreshToken, fakeRequest())
    const error = await rejection(kit.service.refresh(first.tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect((await sessionOf(kit, other.refreshToken))?.isRevoked).toBe(false)
  })
})
