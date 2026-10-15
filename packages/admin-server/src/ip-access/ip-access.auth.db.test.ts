import type { NestExpressApplication } from '@nestjs/platform-express'
import { CommonErrorCodes, CoreAuditActions, errorRespSchema } from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bootAdminApp } from '../test-support/admin-app.js'
import { AUTH_MESSAGES } from '../auth/errors.js'
import { addToTeam, seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { resetIpRules, seedIpRule } from '../test-support/ip-access.js'

// 실 MariaDB 의 인증 연결(2f-1 스펙 §5-1 · P10 · P11). 요청 주소는 정규화 뒤 127.0.0.1. 🔴 규칙은 beforeEach 로 시드 두 행만
// 남긴다.

let t: TestDatabase
let app: NestExpressApplication
let realIpApp: NestExpressApplication
let plain: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  plain = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  realIpApp = await bootAdminApp(connection, { clientIp: 'x-real-ip' })
})

afterAll(async () => {
  await app?.close()
  await realIpApp?.close()
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

function login(target: NestExpressApplication, user: SeededUser, realIp?: string | string[]) {
  const pending = request.agent(target.getHttpServer()).post('/admin/auth/login')
  // superagent 의 타입은 문자열만 받지만 Node 는 배열 헤더를 한 줄씩 보낸다 — 중복 헤더 재현용 단언.
  if (realIp !== undefined) pending.set('X-Real-IP', realIp as string)
  return pending.send({ userId: user.userId, password: user.password })
}

function expectBlocked(response: Response, clientIp: string | null) {
  expect(response.status).toBe(403)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
  expect(body.details).toEqual({ clientIp })
}

/** 🔴 막힌 로그인은 비밀번호를 보지 않고 틀린 비밀번호와 같은 401 이다(2f-2a 스펙 ② I1) — 주소를 싣지 않는다 */
function expectLoginBlocked(response: Response) {
  expect(response.status).toBe(401)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
  expect(body.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
  expect(body.details).toBeUndefined()
}

async function failCountOf(userNo: bigint): Promise<number> {
  const row = await t.db
    .selectFrom('users')
    .select('loginFailCount')
    .where('userNo', '=', userNo)
    .executeTakeFirstOrThrow()
  return row.loginFailCount
}

async function lastAudit(action: string, userNo: bigint) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', action)
    .where('actorUserNo', '=', userNo)
    .orderBy('logNo', 'desc')
    .executeTakeFirst()
}

describe('로그인', () => {
  it('🔴 막힌 주소 — 비밀번호를 보지 않고 401 · 감사 auth.login.blocked.ip(401), 틀린 비밀번호도 세지 않는다', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-blocked' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: user.userNo, cidr: '10.0.0.0/8' })
    expectLoginBlocked(await login(app, user))
    expect(await lastAudit(CoreAuditActions.AUTH_LOGIN_BLOCKED_IP, user.userNo)).toMatchObject({
      ip: '127.0.0.1',
      statusCode: 401,
      errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
    })
    const wrong = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ userId: user.userId, password: 'wrong-password' })
    expectLoginBlocked(wrong)
    expect(await failCountOf(user.userNo)).toBe(0)
  })

  it('Review Focus 5 — 두 팀에 걸친 계정은 대표 팀(작은 번호)의 규칙만 본다', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-split' })
    const small = await seedTeam(t.db, 'auth-small')
    const big = await seedTeam(t.db, 'auth-big')
    await addToTeam(t.db, small, user.userNo)
    await addToTeam(t.db, big, user.userNo)
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: big, cidr: '10.0.0.0/8' })
    expect((await login(app, user)).status).toBe(200)
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: small, cidr: '10.0.0.0/8' })
    expectLoginBlocked(await login(app, user))
  })
})

describe('가드 · refresh', () => {
  it('🔴 로그인 뒤 규칙이 생기면 다음 요청 · refresh 가 403(access.blocked) — 세션은 끊지 않아 규칙을 풀면 다시 된다', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-later' })
    const agent = request.agent(app.getHttpServer())
    await agent
      .post('/admin/auth/login')
      .send({ userId: user.userId, password: user.password })
      .expect(200)
    await agent.get('/admin/auth/me').expect(200)
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: user.userNo, cidr: '10.0.0.0/8' })
    expectBlocked(await agent.get('/admin/auth/me'), '127.0.0.1')
    expectBlocked(await agent.post('/admin/auth/refresh'), '127.0.0.1')
    expect(await lastAudit(CoreAuditActions.AUTH_ACCESS_BLOCKED_IP, user.userNo)).toMatchObject({
      statusCode: 403,
    })
    const live = await t.db
      .selectFrom('sessions')
      .select('sessionNo')
      .where('userNo', '=', user.userNo)
      .where('isRevoked', '=', false)
      .execute()
    expect(live).toHaveLength(1)
    await resetIpRules(t.db)
    await agent.get('/admin/auth/me').expect(200)
  })
})

describe("clientIp 'x-real-ip'", () => {
  it('헤더 주소가 판정 · 세션 행 · 감사 행에 같이 쓰인다', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-xri' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: user.userNo, cidr: '10.0.0.0/8' })
    expect((await login(realIpApp, user, '10.1.2.3')).status).toBe(200)
    const session = await t.db
      .selectFrom('sessions')
      .select('ipAddress')
      .where('userNo', '=', user.userNo)
      .orderBy('sessionNo', 'desc')
      .executeTakeFirstOrThrow()
    expect(session.ipAddress).toBe('10.1.2.3')
    expect(await lastAudit(CoreAuditActions.AUTH_LOGIN_SUCCESS, user.userNo)).toMatchObject({
      ip: '10.1.2.3',
    })
    expectLoginBlocked(await login(realIpApp, user, '203.0.113.9'))
    expect((await lastAudit(CoreAuditActions.AUTH_LOGIN_BLOCKED_IP, user.userNo))?.ip).toBe(
      '203.0.113.9',
    )
  })

  it('Review Focus 4 — 🔴 중복 헤더(쉼표로 이어짐)는 주소 없음 — 401 · 감사 ip null, 기본 req.ip 앱은 헤더를 보지 않는다', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-xri-dup' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: user.userNo, cidr: '10.0.0.0/8' })
    expectLoginBlocked(await login(realIpApp, user, ['10.1.2.3', '203.0.113.9']))
    expect((await lastAudit(CoreAuditActions.AUTH_LOGIN_BLOCKED_IP, user.userNo))?.ip).toBeNull()
    expectLoginBlocked(await login(app, user, '10.1.2.3'))
    expect((await lastAudit(CoreAuditActions.AUTH_LOGIN_BLOCKED_IP, user.userNo))?.ip).toBe(
      '127.0.0.1',
    )
  })
})
