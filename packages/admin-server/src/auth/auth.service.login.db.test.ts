import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  addToTeam,
  createAuthKit,
  fakeRequest,
  seedRole,
  seedTeam,
  seedUser,
  type AuthKit,
} from '../test-support/auth.js'
import { AdminAuthService } from './auth.service.js'
import { AUTH_MESSAGES } from './errors.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'
import { hashPassword } from './password.js'
import { hashRefreshToken } from './refresh-token.js'

let t: TestDatabase
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db, { roleName: '관리자', permissions: ['user:read'] })
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

async function counters(kit: AuthKit, userNo: bigint) {
  const credential = await kit.repo.findCredentialByNo(userNo)
  return { loginFailCount: credential!.loginFailCount, lockUntil: credential!.lockUntil }
}

const later = (ms: number) => new Date(Date.now() + ms)

describe('login', () => {
  it('성공 — 토큰 둘 · 세션 행(loginAt = lastAccessAt · expireAt = loginAt + 7일 · UA · IP) · login.success', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo })
    const tokens = await kit.service.login(
      { userId: user.userId, password: user.password },
      fakeRequest({ ip: '10.1.2.3', userAgent: 'Chrome/140' }),
    )
    const claims = kit.tokens.verify(tokens.accessToken, new Date())
    expect(claims.userNo).toBe(user.userNo)
    expect(await kit.store.findByRefreshHash(hashRefreshToken(tokens.refreshToken))).toMatchObject({
      sessionNo: claims.sessionNo,
      userNo: user.userNo,
      isRevoked: false,
    })
    const row = await t.db
      .selectFrom('sessions')
      .select(['userAgent', 'ipAddress', 'loginAt', 'lastAccessAt', 'expireAt'])
      .where('sessionNo', '=', claims.sessionNo)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ userAgent: 'Chrome/140', ipAddress: '10.1.2.3' })
    expect(row.lastAccessAt.getTime()).toBe(row.loginAt.getTime())
    expect(row.expireAt.getTime() - row.loginAt.getTime()).toBe(kit.config.refreshTtlMs)
    expect(kit.events.types()).toEqual(['login.success'])
    expect(kit.events.events[0]).toEqual({
      type: 'login.success',
      userNo: user.userNo,
      sessionNo: claims.sessionNo,
    })
  })

  it('🔴 없는 아이디 — 401 ERR_LOGIN_FAILED, 정책을 부르지 않는다, login.fail(userNo null)', async () => {
    const kit = createAuthKit(t)
    const error = await rejection(
      kit.service.login({ userId: 'ghost', password: 'x' }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    expect(kit.policy.calls).toHaveLength(0)
    expect(kit.events.events).toEqual([
      { type: 'login.fail', userId: 'ghost', userNo: null, loginFailCount: null },
    ])
  })

  it('틀린 비밀번호 — 카운터 +1 · 401 · login.fail(갱신 뒤 카운트)', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo })
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 1, lockUntil: null })
    expect(kit.events.events).toEqual([
      { type: 'login.fail', userId: user.userId, userNo: user.userNo, loginFailCount: 1 },
    ])
  })

  it('🔴 5회째 잠기고, 맞은 비밀번호도 같은 401 — 카운터는 그대로(F1)', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo })
    for (let i = 0; i < 5; i += 1) {
      await rejection(kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()))
    }
    const locked = await counters(kit, user.userNo)
    expect(locked.loginFailCount).toBe(5)
    expect(locked.lockUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000)

    const error = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    // IP 는 비밀번호보다 먼저 — 여섯 번 모두 물었다(2f-2a 스펙 A1)
    expect(kit.policy.calls).toHaveLength(6)
    expect(await counters(kit, user.userNo)).toEqual(locked)
    expect(kit.events.types().at(-1)).toBe('login.blocked:locked')
  })

  it('🔴 잠긴 계정 + 퇴사 + 맞은 비밀번호 — 퇴사 403 이 아니라 401(잠김이 먼저)', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, {
      roleNo,
      resignAt: later(-60_000),
      loginFailCount: 5,
      lockUntil: later(60_000),
    })
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
  })

  it('🔴 동시 틀린 비밀번호 8건은 8로 세고 잠근다(F2)', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo })
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        rejection(kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest())),
      ),
    )
    for (const error of results) expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    const state = await counters(kit, user.userNo)
    expect(state.loginFailCount).toBe(8)
    expect(state.lockUntil!.getTime()).toBeGreaterThan(Date.now())
  })

  it('🔴 잠긴 동안의 틀린 비밀번호는 401 이고 잠금을 늘리지 않는다', async () => {
    const kit = createAuthKit(t)
    const lockUntil = new Date(Math.floor(later(60_000).getTime() / 1000) * 1000)
    const user = await seedUser(t.db, { roleNo, loginFailCount: 5, lockUntil })
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 6, lockUntil })
  })

  it('잠금이 끝났으면 — 틀리면 1부터, 맞으면 성공하고 카운터 0', async () => {
    const kit = createAuthKit(t)
    const a = await seedUser(t.db, { roleNo, loginFailCount: 5, lockUntil: later(-2000) })
    await rejection(kit.service.login({ userId: a.userId, password: 'wrong' }, fakeRequest()))
    expect(await counters(kit, a.userNo)).toEqual({ loginFailCount: 1, lockUntil: null })

    const b = await seedUser(t.db, { roleNo, loginFailCount: 5, lockUntil: later(-2000) })
    await kit.service.login({ userId: b.userId, password: b.password }, fakeRequest())
    expect(await counters(kit, b.userNo)).toEqual({ loginFailCount: 0, lockUntil: null })
  })

  it('🔴 퇴사 계정 — 틀린 비밀번호는 401(존재를 흘리지 않는다), 맞으면 403 · 카운터를 되돌리지 않는다(2f-2a 스펙 §6 #3)', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo, resignAt: later(-60_000) })
    const wrong = await rejection(
      kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
    )
    expect(wrong.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    const right = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(right.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
    expect(right.message).toBe(AUTH_MESSAGES.resigned)
    expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 1, lockUntil: null })
    expect(kit.policy.calls).toHaveLength(2)
    expect(kit.events.types()).toEqual(['login.fail', 'login.blocked:resigned'])
  })

  it('퇴사 효력 시각이 미래면 로그인된다(스펙 ④ R1)', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo, resignAt: later(24 * 3600 * 1000) })
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })

  it('🔴 정책이 거부하면 비밀번호를 보지 않고 같은 401 — details 없음 · 세션 없음 · 대표 팀을 넘긴다(2f-2a 스펙 ② I1)', async () => {
    const kit = createAuthKit(t)
    kit.policy.allow = false
    const user = await seedUser(t.db, { roleNo })
    const teamNo = await seedTeam(t.db, `IP팀-${user.userNo}`)
    await addToTeam(t.db, teamNo, user.userNo)
    const error = await rejection(
      kit.service.login(
        { userId: user.userId, password: user.password },
        fakeRequest({ ip: '203.0.113.9' }),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    expect(error.details).toBeUndefined()
    expect(kit.policy.calls).toEqual([
      { clientIp: '203.0.113.9', userNo: user.userNo, teamNos: [teamNo] },
    ])
    expect(kit.events.types()).toEqual(['login.blocked:ip'])
    const sessions = await t.db
      .selectFrom('sessions')
      .select('sessionNo')
      .where('userNo', '=', user.userNo)
      .execute()
    expect(sessions).toHaveLength(0)
  })

  it('🔴 막힌 주소 + 퇴사 + 맞은 비밀번호 — 퇴사 403 이 아니라 IP 먼저의 같은 401(스펙 §9-2)', async () => {
    const kit = createAuthKit(t)
    kit.policy.allow = false
    const user = await seedUser(t.db, { roleNo, resignAt: later(-60_000) })
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    expect(error.details).toBeUndefined()
    expect(kit.events.types()).toEqual(['login.blocked:ip'])
    const sessions = await t.db
      .selectFrom('sessions')
      .select('sessionNo')
      .where('userNo', '=', user.userNo)
      .execute()
    expect(sessions).toHaveLength(0)
  })

  it('🔴 막힌 주소 + 잠김 + 맞은 비밀번호 — 같은 401 · 이벤트는 ip · 카운터 그대로(스펙 §9-2)', async () => {
    const kit = createAuthKit(t)
    kit.policy.allow = false
    const lockUntil = new Date(Math.floor(later(60_000).getTime() / 1000) * 1000)
    const user = await seedUser(t.db, { roleNo, loginFailCount: 5, lockUntil })
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    expect(error.details).toBeUndefined()
    expect(kit.events.types()).toEqual(['login.blocked:ip'])
    expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 5, lockUntil })
  })

  it('정책이 없으면 IP 판정을 건너뛴다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const user = await seedUser(t.db, { roleNo })
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('refreshToken')
  })

  it('강제 변경 계정도 로그인된다', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo, isPasswordChangeRequired: true })
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })

  it('🔴 이벤트 기록기가 던져도 로그인은 성공한다(스펙 B8)', async () => {
    const kit = createAuthKit(t)
    kit.events.failWith = new Error('감사 DB 다운')
    const user = await seedUser(t.db, { roleNo })
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })

  it('🔴 비밀번호의 앞뒤 공백 · 한글은 다듬지 않고 그대로 비교한다 — Review Focus 2', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo, password: ' 한글 비번 ' })
    await expect(
      kit.service.login({ userId: user.userId, password: ' 한글 비번 ' }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: '한글 비번' }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
  })

  it('🔴 막힌 주소의 틀린 비밀번호 다섯은 세지 않는다 — 바깥에서 계정을 잠글 수 없다(2f-2a 스펙 §6 #2)', async () => {
    const kit = createAuthKit(t)
    kit.policy.allow = false
    const user = await seedUser(t.db, { roleNo })
    for (let i = 0; i < 5; i += 1) {
      const error = await rejection(
        kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
      )
      expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    }
    expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 0, lockUntil: null })
    kit.policy.allow = true
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })

  it('🔴 막힌 주소의 맞은 비밀번호는 카운터를 되돌리지 않는다(2f-2a 스펙 §6 #3)', async () => {
    const kit = createAuthKit(t)
    kit.policy.allow = false
    const user = await seedUser(t.db, { roleNo, loginFailCount: 3 })
    await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 3, lockUntil: null })
  })

  it('🔴 검증한 해시가 잠근 행과 다르면(그사이 초기화 · 본인 변경) 401 — 세션을 만들지 않고 세지 않는다(2f-2a 스펙 A3)', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo, loginFailCount: 2 })
    // 같은 비밀번호의 다른 해시 — 검증은 지나고 잠근 행의 해시와는 다르다(초기화가 그사이 커밋된 것과 같다)
    const otherHash = await hashPassword(user.password)
    class StaleRepository extends KyselyAuthRepository {
      override async findCredentialByUserId(userId: string) {
        const row = await super.findCredentialByUserId(userId)
        return row == null ? null : { ...row, passwordHash: otherHash }
      }
    }
    const service = new AdminAuthService(
      kit.config,
      new StaleRepository(t.db),
      kit.store,
      kit.tokens,
      t.db,
      kit.policy,
      kit.events,
    )
    const error = await rejection(
      service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 2, lockUntil: null })
    expect(kit.events.events).toEqual([
      { type: 'login.fail', userId: user.userId, userNo: user.userNo, loginFailCount: 2 },
    ])
    const sessions = await t.db
      .selectFrom('sessions')
      .select('sessionNo')
      .where('userNo', '=', user.userNo)
      .execute()
    expect(sessions).toHaveLength(0)
  })

  it('정책이 없으면(IP 모듈 없음) 로그인 401 문구는 loginFailed', async () => {
    const kit = createAuthKit(t, { policy: false })
    const user = await seedUser(t.db, { roleNo })
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
    )
    expect(error.message).toBe(AUTH_MESSAGES.loginFailed)
  })
})

describe('authenticate', () => {
  async function loggedIn(kit: AuthKit, input: Parameters<typeof seedUser>[1] = { roleNo }) {
    const user = await seedUser(t.db, input)
    const tokens = await kit.service.login(
      { userId: user.userId, password: user.password },
      fakeRequest(),
    )
    const claims = kit.tokens.verify(tokens.accessToken, new Date())
    return { user, tokens, sessionNo: claims.sessionNo }
  }

  it('주체 — 역할 권한 · 세션 번호', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await loggedIn(kit)
    expect(await kit.service.authenticate(tokens.accessToken, fakeRequest())).toEqual({
      userNo: user.userNo,
      sessionNo,
      userId: user.userId,
      userName: expect.any(String),
      roleNo,
      roleName: '관리자',
      teamNo: null,
      teamName: null,
      permissions: ['user:read'],
      isPasswordChangeRequired: false,
    })
  })

  it('🔴 강제 변경 계정은 권한이 [](gise)', async () => {
    const kit = createAuthKit(t)
    const { tokens } = await loggedIn(kit, { roleNo, isPasswordChangeRequired: true })
    expect(await kit.service.authenticate(tokens.accessToken, fakeRequest())).toMatchObject({
      permissions: [],
      isPasswordChangeRequired: true,
    })
  })

  it('토큰이 없으면 401 ERR_COMMON_UNAUTHORIZED', async () => {
    const kit = createAuthKit(t)
    const error = await rejection(kit.service.authenticate(undefined, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED)
  })

  it('폐기된 세션 · 다른 사용자의 토큰 — 401 ERR_INVALID_TOKEN', async () => {
    const kit = createAuthKit(t)
    const a = await loggedIn(kit)
    await kit.store.revoke(a.sessionNo, 'terminated', new Date())
    const revoked = await rejection(kit.service.authenticate(a.tokens.accessToken, fakeRequest()))
    expect(revoked.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(revoked.message).toBe(AUTH_MESSAGES.sessionInvalid)

    const b = await loggedIn(kit)
    const forged = kit.tokens.sign({ userNo: a.user.userNo, sessionNo: b.sessionNo })
    const mismatch = await rejection(kit.service.authenticate(forged, fakeRequest()))
    expect(mismatch.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
  })

  it('세션 만료 — 401 ERR_SESSION_EXPIRED', async () => {
    const kit = createAuthKit(t)
    const { tokens, sessionNo } = await loggedIn(kit)
    await t.db
      .updateTable('sessions')
      .set({ expireAt: later(-2000) })
      .where('sessionNo', '=', sessionNo)
      .execute()
    const error = await rejection(kit.service.authenticate(tokens.accessToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_SESSION_EXPIRED)
    expect(error.message).toBe(AUTH_MESSAGES.sessionExpired)
  })

  it('로그인 뒤 퇴사 효력이 지나면 403 ERR_RESIGNED_USER', async () => {
    const kit = createAuthKit(t)
    const { user, tokens } = await loggedIn(kit)
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(kit.service.authenticate(tokens.accessToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
  })

  it('정책이 거부하면 403 ERR_IP_NOT_ALLOWED + access.blocked:ip', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await loggedIn(kit)
    kit.policy.allow = false
    const error = await rejection(
      kit.service.authenticate(tokens.accessToken, fakeRequest({ ip: '198.51.100.7' })),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
    expect(error.details).toEqual({ clientIp: '198.51.100.7' })
    expect(kit.events.events.at(-1)).toEqual({
      type: 'access.blocked',
      reason: 'ip',
      userNo: user.userNo,
      sessionNo,
    })
  })
})
