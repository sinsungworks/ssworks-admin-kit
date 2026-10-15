import type { NestExpressApplication } from '@nestjs/platform-express'
import { CommonErrorCodes, errorRespSchema } from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import {
  RecordingEvents,
  SwitchablePolicy,
  seedRole,
  seedUser,
  type SeedUserInput,
} from '../test-support/auth.js'
import { bootAuthApp } from '../test-support/auth-probe.js'
import { AUTH_MESSAGES } from './errors.js'
import { hashRefreshToken } from './refresh-token.js'

// 실 MariaDB 의 HTTP 계약(스펙 §9-3) — admin-ui createApiClient · createAppStore 가 기대는 모양 그대로.

let t: TestDatabase
let app: NestExpressApplication
let readerRole: bigint
let allRole: bigint
const policy = new SwitchablePolicy()
const events = new RecordingEvents()

beforeAll(async () => {
  t = await createTestDatabase()
  readerRole = await seedRole(t.db, { roleName: '열람자', permissions: ['user:read'] })
  allRole = await seedRole(t.db, { roleName: '최고 관리자', permissions: ['*'] })
  app = await bootAuthApp({
    db: { ...testDbServer(), database: t.name, connectionLimit: 4 },
    policy,
    events,
  })
})

afterAll(async () => {
  await app?.close()
  await t?.drop()
})

afterEach(() => {
  policy.allow = true
})

const LOGIN = '/admin/auth/login'
const REFRESH = '/admin/auth/refresh'
const LOGOUT = '/admin/auth/logout'
const ME = '/admin/auth/me'
const PASSWORD = '/admin/auth/password'

const server = () => app.getHttpServer()
const later = (ms: number) => new Date(Date.now() + ms)

function setCookies(response: Response): string[] {
  const header: unknown = response.headers['set-cookie']
  return Array.isArray(header) ? (header as string[]) : []
}

function cookieLine(response: Response, name: string): string {
  const line = setCookies(response).find((item) => item.startsWith(`${name}=`))
  if (line === undefined) throw new Error(`${name} 쿠키가 없다`)
  return line
}

function cookieValue(response: Response, name: string): string {
  return cookieLine(response, name)
    .split(';')[0]!
    .slice(name.length + 1)
}

function expectError(response: Response, status: number, code: string, message?: string): void {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
}

async function signIn(input: SeedUserInput = { roleNo: readerRole }) {
  const user = await seedUser(t.db, input)
  const agent = request.agent(server())
  const login = await agent.post(LOGIN).send({ userId: user.userId, password: user.password })
  expect(login.status).toBe(200)
  return { user, agent, login, refresh: cookieValue(login, 'admin_rt') }
}

describe('로그인 → 쿠키 → /me', () => {
  it('🔴 쿠키 둘(HttpOnly · Path=/ · Lax · http 에서 Secure 없음) · /me 는 AdminUserInfo 의 상위 집합', async () => {
    const { user, agent, login } = await signIn()
    expect(login.body).toEqual({ success: true, data: null })
    for (const name of ['admin_at', 'admin_rt']) {
      const line = cookieLine(login, name)
      expect(line).toContain('HttpOnly')
      expect(line).toContain('Path=/')
      expect(line).toContain('SameSite=Lax')
      expect(line).not.toContain('Secure')
    }
    expect(cookieLine(login, 'admin_at')).toContain('Max-Age=900')
    expect(cookieLine(login, 'admin_rt')).toContain('Max-Age=604800')

    const me = await agent.get(ME).expect(200)
    expect(me.body).toEqual({
      success: true,
      data: {
        userNo: `BigInt(${user.userNo})`,
        userId: user.userId,
        userName: expect.any(String),
        roleNo: `BigInt(${readerRole})`,
        roleName: '열람자',
        permissions: ['user:read'],
        isPasswordChangeRequired: false,
      },
    })
  })

  it('X-Forwarded-Proto: https 면 두 쿠키에 Secure', async () => {
    const user = await seedUser(t.db, { roleNo: readerRole })
    const login = await request(server())
      .post(LOGIN)
      .set('X-Forwarded-Proto', 'https')
      .send({ userId: user.userId, password: user.password })
      .expect(200)
    expect(cookieLine(login, 'admin_at')).toContain('Secure')
    expect(cookieLine(login, 'admin_rt')).toContain('Secure')
  })
})

describe('회전 · 재사용 탐지', () => {
  it('refresh 가 새 쿠키 둘을 주고 새 쿠키로 /me 가 된다', async () => {
    const { agent, login } = await signIn()
    const refreshed = await agent.post(REFRESH).expect(200)
    expect(refreshed.body).toEqual({ success: true, data: null })
    expect(cookieValue(refreshed, 'admin_rt')).not.toBe(cookieValue(login, 'admin_rt'))
    expect(cookieValue(refreshed, 'admin_at')).not.toBe(cookieValue(login, 'admin_at'))
    await agent.get(ME).expect(200)
  })

  it('🔴 끝 상태 — 창 밖의 옛 refresh 는 401 ERR_REFRESH_REUSED 이고 다른 기기까지 끊긴다', async () => {
    const deviceA = await signIn()
    const deviceB = request.agent(server())
    await deviceB
      .post(LOGIN)
      .send({ userId: deviceA.user.userId, password: deviceA.user.password })
      .expect(200)
    await deviceA.agent.post(REFRESH).expect(200)
    await t.db
      .updateTable('sessions')
      .set({ revokedAt: later(-60_000) })
      .where('refreshTokenHash', '=', hashRefreshToken(deviceA.refresh))
      .execute()

    const reused = await request(server())
      .post(REFRESH)
      .set('Cookie', `admin_rt=${deviceA.refresh}`)
    expectError(reused, 401, CommonErrorCodes.ERR_REFRESH_REUSED, AUTH_MESSAGES.refreshReused)
    expectError(await deviceA.agent.get(ME), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
    expectError(await deviceB.get(ME), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
  })

  it('🔴 같은 쿠키로 동시 refresh 두 건 — 둘 다 200(유예창)', async () => {
    const { agent } = await signIn()
    const [a, b] = await Promise.all([agent.post(REFRESH), agent.post(REFRESH)])
    expect([a.status, b.status]).toEqual([200, 200])
    await agent.get(ME).expect(200)
  })

  it('🔴 액세스 쿠키만 사라진 브라우저 — /me 401 → refresh 200 → /me 200 (Review Focus 5)', async () => {
    const { refresh } = await signIn()
    const browser = request.agent(server())
    expectError(
      await browser.get(ME).set('Cookie', `admin_rt=${refresh}`),
      401,
      CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
    )
    await browser.post(REFRESH).set('Cookie', `admin_rt=${refresh}`).expect(200)
    await browser.get(ME).expect(200)
  })
})

describe('로그인 실패 · 잠금 · 퇴사 · 만료', () => {
  it('🔴 틀림 401 × 5 → 맞은 비밀번호도 401 → 잠금이 지나면 200', async () => {
    const user = await seedUser(t.db, { roleNo: readerRole })
    for (let i = 0; i < 5; i += 1) {
      expectError(
        await request(server()).post(LOGIN).send({ userId: user.userId, password: 'wrong-pass' }),
        401,
        CommonErrorCodes.ERR_LOGIN_FAILED,
        AUTH_MESSAGES.loginFailedWithIp,
      )
    }
    expectError(
      await request(server()).post(LOGIN).send({ userId: user.userId, password: user.password }),
      401,
      CommonErrorCodes.ERR_LOGIN_FAILED,
      AUTH_MESSAGES.loginFailedWithIp,
    )
    await t.db
      .updateTable('users')
      .set({ lockUntil: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    await request(server())
      .post(LOGIN)
      .send({ userId: user.userId, password: user.password })
      .expect(200)
  })

  it('🔴 퇴사 효력이 지나면 가드 · refresh · 로그인 모두 403 ERR_RESIGNED_USER', async () => {
    const { user, agent, refresh } = await signIn()
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    expectError(
      await agent.get(ME),
      403,
      CommonErrorCodes.ERR_RESIGNED_USER,
      AUTH_MESSAGES.resigned,
    )
    expectError(
      await request(server()).post(REFRESH).set('Cookie', `admin_rt=${refresh}`),
      403,
      CommonErrorCodes.ERR_RESIGNED_USER,
    )
    expectError(
      await request(server()).post(LOGIN).send({ userId: user.userId, password: user.password }),
      403,
      CommonErrorCodes.ERR_RESIGNED_USER,
    )
  })

  it('세션 expireAt 이 지나면 401 ERR_SESSION_EXPIRED', async () => {
    const { user, agent } = await signIn()
    await t.db
      .updateTable('sessions')
      .set({ expireAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    expectError(await agent.get(ME), 401, CommonErrorCodes.ERR_SESSION_EXPIRED)
  })
})

describe('권한', () => {
  it('열람자 — users 200 · any 403 · self 200 · 선언 없음 403(reason)', async () => {
    const { agent } = await signIn()
    await agent.get('/authprobe/users').expect(200)
    expectError(
      await agent.get('/authprobe/any'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      AUTH_MESSAGES.forbidden,
    )
    await agent.get('/authprobe/self').expect(200)
    const undeclared = await agent.get('/authprobe/undeclared')
    expectError(
      undeclared,
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      AUTH_MESSAGES.noPermissionDeclared,
    )
    expect(undeclared.body.details).toEqual({ reason: 'no-permission-declared' })
  })

  it('🔴 "*" 역할 — users · any 200, 선언 없는 라우트는 여전히 403', async () => {
    const { agent } = await signIn({ roleNo: allRole })
    await agent.get('/authprobe/users').expect(200)
    await agent.get('/authprobe/any').expect(200)
    expectError(
      await agent.get('/authprobe/undeclared'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('🔴 권한 JSON 이 깨진 역할 — 로그인 200 · /me permissions [] · 권한 라우트 403 (Review Focus 4)', async () => {
    const broken = await seedRole(t.db, { permissions: { all: true } })
    const { agent } = await signIn({ roleNo: broken })
    const me = await agent.get(ME).expect(200)
    expect(me.body.data.permissions).toEqual([])
    expectError(await agent.get('/authprobe/users'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })
})

describe('강제 변경', () => {
  it('🔴 /me 200 + permissions [] · 다른 @SelfOnly 403 · refresh 200 · 바꾸면 풀린다', async () => {
    const { user, agent } = await signIn({ roleNo: allRole, isPasswordChangeRequired: true })
    const me = await agent.get(ME).expect(200)
    expect(me.body.data).toMatchObject({ permissions: [], isPasswordChangeRequired: true })
    expectError(
      await agent.get('/authprobe/self'),
      403,
      CommonErrorCodes.ERR_PASSWORD_CHANGE_REQUIRED,
      AUTH_MESSAGES.passwordChangeRequired,
    )
    await agent.post(REFRESH).expect(200)
    await agent
      .patch(PASSWORD)
      .send({ currentPassword: user.password, newPassword: 'brand-new-pass-1' })
      .expect(200)
    const after = await agent.get(ME).expect(200)
    expect(after.body.data).toMatchObject({ permissions: ['*'], isPasswordChangeRequired: false })
    await agent.get('/authprobe/self').expect(200)
  })
})

describe('비밀번호 변경', () => {
  it('🔴 틀린 현재 비밀번호 400 issues[currentPassword] + 카운터 · 새 = 현재 400 newPassword · 짧음 400', async () => {
    const { user, agent } = await signIn()
    const wrong = await agent
      .patch(PASSWORD)
      .send({ currentPassword: 'wrong-current', newPassword: 'brand-new-pass-1' })
    expectError(wrong, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(wrong.body.details.issues).toEqual([
      { path: ['currentPassword'], code: 'custom', message: AUTH_MESSAGES.currentPasswordMismatch },
    ])
    const row = await t.db
      .selectFrom('users')
      .select('loginFailCount')
      .where('userNo', '=', user.userNo)
      .executeTakeFirstOrThrow()
    expect(row.loginFailCount).toBe(1)

    const same = await agent
      .patch(PASSWORD)
      .send({ currentPassword: user.password, newPassword: user.password })
    expectError(same, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect((same.body.details.issues as { path: unknown[] }[]).map((issue) => issue.path)).toEqual([
      ['newPassword'],
    ])

    const short = await agent
      .patch(PASSWORD)
      .send({ currentPassword: user.password, newPassword: 'short' })
    expectError(short, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(short.body.details.issues[0].path).toEqual(['newPassword'])
  })

  it('성공 — 다른 기기 refresh 401 · 현재 세션 유지 · 새 비밀번호로만 로그인', async () => {
    const deviceA = await signIn()
    const credentials = { userId: deviceA.user.userId, password: deviceA.user.password }
    const deviceB = request.agent(server())
    await deviceB.post(LOGIN).send(credentials).expect(200)

    await deviceA.agent
      .patch(PASSWORD)
      .send({ currentPassword: credentials.password, newPassword: 'brand-new-pass-2' })
      .expect(200)
    await deviceA.agent.get(ME).expect(200)
    expectError(await deviceB.post(REFRESH), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
    await request(server())
      .post(LOGIN)
      .send({ userId: credentials.userId, password: 'brand-new-pass-2' })
      .expect(200)
    expectError(
      await request(server()).post(LOGIN).send(credentials),
      401,
      CommonErrorCodes.ERR_LOGIN_FAILED,
    )
  })

  it('잠긴 계정의 변경은 423', async () => {
    const { user, agent } = await signIn()
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 5, lockUntil: later(60_000) })
      .where('userNo', '=', user.userNo)
      .execute()
    expectError(
      await agent
        .patch(PASSWORD)
        .send({ currentPassword: user.password, newPassword: 'brand-new-pass-3' }),
      423,
      CommonErrorCodes.ERR_ACCOUNT_LOCKED,
    )
  })
})

describe('재인증 · 로그아웃', () => {
  it('재인증 — 틀리면 403 ERR_REAUTH_REQUIRED, 맞으면 200', async () => {
    const { user, agent } = await signIn()
    expectError(
      await agent.post('/authprobe/reauth').send({ password: 'wrong' }),
      403,
      CommonErrorCodes.ERR_REAUTH_REQUIRED,
      AUTH_MESSAGES.reauthFailed,
    )
    await agent.post('/authprobe/reauth').send({ password: user.password }).expect(200)
  })

  it('🔴 로그아웃 — 두 쿠키를 지우고, 옛 refresh 는 재사용이 아니라 ERR_INVALID_TOKEN, 다른 기기는 산다', async () => {
    const deviceA = await signIn()
    const deviceB = request.agent(server())
    await deviceB
      .post(LOGIN)
      .send({ userId: deviceA.user.userId, password: deviceA.user.password })
      .expect(200)
    const out = await deviceA.agent.post(LOGOUT).expect(200)
    expect(cookieLine(out, 'admin_at')).toContain('Expires=Thu, 01 Jan 1970')
    expect(cookieLine(out, 'admin_rt')).toContain('Expires=Thu, 01 Jan 1970')
    expectError(
      await request(server()).post(REFRESH).set('Cookie', `admin_rt=${deviceA.refresh}`),
      401,
      CommonErrorCodes.ERR_INVALID_TOKEN,
      AUTH_MESSAGES.refreshEnded,
    )
    await deviceB.get(ME).expect(200)
  })
})

describe('IP 자리(2f)', () => {
  it('🔴 정책이 거부하면 로그인은 비밀번호를 보지 않고 틀린 비밀번호와 같은 401 — details · 쿠키 없음(2f-2a 스펙 ② I1)', async () => {
    const user = await seedUser(t.db, { roleNo: readerRole })
    policy.allow = false
    for (const password of ['wrong-pass', user.password]) {
      const blocked = await request(server()).post(LOGIN).send({ userId: user.userId, password })
      expectError(blocked, 401, CommonErrorCodes.ERR_LOGIN_FAILED, AUTH_MESSAGES.loginFailedWithIp)
      expect(blocked.body.details).toBeUndefined()
      expect(setCookies(blocked)).toEqual([])
    }
  })

  it('로그인 뒤 막히면 가드가 403 + access.blocked:ip 이벤트', async () => {
    const { agent } = await signIn()
    policy.allow = false
    const blocked = await agent.get(ME)
    expectError(blocked, 403, CommonErrorCodes.ERR_IP_NOT_ALLOWED)
    expect(typeof blocked.body.details.clientIp).toBe('string')
    expect(events.types()).toContain('access.blocked:ip')
  })
})
