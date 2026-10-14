import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  adminAuditLogSchema,
  adminSessionSchema,
  createPaginatedRespSchema,
  errorRespSchema,
  parseJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { AUDIT_MESSAGES } from './errors.js'

// 실 MariaDB 의 감사 계약(2c 스펙 §9-3) — 세션 끊기 · 쓰는 쪽 라우트 · 실패 요청 · 인증 이벤트가 행이 되고 조회된다.

let t: TestDatabase
let app: NestExpressApplication
let managerRole: bigint
let memberRole: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  managerRole = await seedRole(t.db, {
    roleName: '감사 관리자',
    permissions: ['org.users:read', 'org.users:write', 'setting.auditLog:read'],
  })
  memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  app = await bootAdminApp({ ...testDbServer(), database: t.name, connectionLimit: 4 })
})

afterAll(async () => {
  await app?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>

const server = () => app.getHttpServer()
const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data
const mineSchema = z.object({ items: z.array(adminSessionSchema) })
const logsSchema = createPaginatedRespSchema(adminAuditLogSchema)

function expectError(response: Response, status: number, code: string): void {
  expect(response.status).toBe(status)
  expect(errorRespSchema.parse(response.body).code).toBe(code)
}

async function signIn(user: SeededUser): Promise<Agent> {
  const agent = request.agent(server())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function currentSessionNo(agent: Agent): Promise<bigint> {
  const response = await agent.get('/admin/sessions/me').expect(200)
  const current = mineSchema.parse(data(response)).items.find((item) => item.isCurrent)
  if (current === undefined) throw new Error('지금 세션이 없다')
  return current.sessionNo
}

async function auditRows(where: { actorUserNo?: bigint; action?: string; path?: string }) {
  let query = t.db.selectFrom('auditLogs').selectAll().orderBy('logNo', 'asc')
  if (where.actorUserNo !== undefined) query = query.where('actorUserNo', '=', where.actorUserNo)
  if (where.action !== undefined) query = query.where('action', '=', where.action)
  if (where.path !== undefined) query = query.where('path', '=', where.path)
  return query.execute()
}

describe('세션 끊기 감사', () => {
  it('🔴 끊기 넷이 행으로 — 대상 · 행위자 세션 · meta', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole })
    const target = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(manager)
    const extra = await signIn(manager)
    const agentNo = await currentSessionNo(agent)
    const extraNo = await currentSessionNo(extra)

    await agent.delete(`/admin/sessions/me/${extraNo}`).expect(200)
    await signIn(manager)
    await agent.post('/admin/sessions/me/revoke-others').expect(200)
    const victimNo = await currentSessionNo(await signIn(target))
    await agent.delete(`/admin/sessions/${victimNo}`).expect(200)
    await signIn(target)
    await agent.delete(`/admin/sessions/user/${target.userNo}`).expect(200)

    const rows = (await auditRows({ actorUserNo: manager.userNo })).filter((row) =>
      row.action.startsWith('session.'),
    )
    expect(
      rows.map((row) => [
        row.action,
        row.targetType,
        row.targetRefNo,
        row.statusCode,
        row.sessionNo,
      ]),
    ).toEqual([
      ['session.revoke.self', 'session', extraNo, 200, agentNo],
      ['session.revoke.others', 'user', manager.userNo, 200, agentNo],
      ['session.revoke', 'session', victimNo, 200, agentNo],
      ['session.revoke.user', 'user', target.userNo, 200, agentNo],
    ])
    expect(rows.map((row) => row.meta)).toEqual([
      null,
      { revokedCount: 1 },
      null,
      { revokedCount: 1 },
    ])
    expect(rows[0]?.path).toBe(`/admin/sessions/me/${extraNo}`)
  })

  it('🔴 끊을 것이 없는 "다른 세션 모두" 도 200 { revokedCount: 0 } 과 감사 행(Review Focus 5)', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(user)
    expect(data(await agent.post('/admin/sessions/me/revoke-others').expect(200))).toEqual({
      revokedCount: 0,
    })
    const rows = await auditRows({ actorUserNo: user.userNo, action: 'session.revoke.others' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.meta).toEqual({ revokedCount: 0 })
  })
})

describe('쓰는 쪽 라우트 · 실패 요청', () => {
  it('🔴 meta 의 비밀 키는 대소문자 무시로 *** — 중첩 · 배열 · 쓰는 쪽 키까지, bigint 는 문자열', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(user)
    await agent
      .post('/admin/auditprobe/item/5')
      .send({
        password: 'p',
        Token: 't',
        apiKey: 'k',
        nested: { secret: 's', keep: 1 },
        list: [{ newPassword: 'n' }],
        count: 'BigInt(12)',
      })
      .expect(201)
    const [row] = await auditRows({ actorUserNo: user.userNo, action: 'probe.write' })
    expect(row).toMatchObject({
      targetType: 'probe',
      targetRefNo: 5n,
      statusCode: 201,
      errorCode: null,
      method: 'POST',
      path: '/admin/auditprobe/item/5',
    })
    expect(row?.meta).toEqual({
      password: '***',
      Token: '***',
      apiKey: '***',
      nested: { secret: '***', keep: 1 },
      list: [{ newPassword: '***' }],
      count: '12',
    })
  })

  it('🔴 핸들러에서 던진 실패는 응답과 같은 상태 · 코드로 남는다', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(user)
    expectError(
      await agent.post('/admin/auditprobe/fail'),
      409,
      CommonErrorCodes.ERR_COMMON_CONFLICT,
    )
    const [row] = await auditRows({ actorUserNo: user.userNo, action: 'probe.write' })
    expect(row).toMatchObject({
      statusCode: 409,
      errorCode: 'ERR_COMMON_CONFLICT',
      targetRefNo: null,
    })
  })

  it('@Audit 이 없는 라우트 · 가드가 거부한 요청은 남지 않는다(⑧ F1)', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    await agent.post('/admin/auditprobe/plain').expect(201)
    await request(server()).post('/admin/auditprobe/item/1').send({}).expect(401)
    expect(await auditRows({ path: '/admin/auditprobe/plain' })).toEqual([])
    expect(await auditRows({ path: '/admin/auditprobe/item/1' })).toEqual([])
  })
})

describe('인증 이벤트', () => {
  it('로그인 성공 · 갱신 · 로그아웃, 없는 아이디의 실패가 sink 를 거쳐 행이 된다', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const agent = request.agent(server())
    await agent
      .post('/admin/auth/login')
      .send({ userId: user.userId, password: user.password })
      .expect(200)
    await request(server())
      .post('/admin/auth/login')
      .send({ userId: 'nobody-2c', password: 'x' })
      .expect(401)
    await agent.post('/admin/auth/refresh').expect(200)
    await agent.post('/admin/auth/logout').expect(200)

    const mine = await auditRows({ actorUserNo: user.userNo })
    expect(mine.map((row) => [row.action, row.statusCode, row.errorCode])).toEqual([
      ['auth.login.success', 200, null],
      ['auth.token.refresh', 200, null],
      ['auth.logout', 200, null],
    ])
    expect(mine[1]?.meta).toEqual({ rotatedFrom: String(mine[0]?.sessionNo), grace: false })
    expect(mine[1]?.path).toBe('/admin/auth/refresh')

    const anonymous = (await auditRows({ action: 'auth.login.fail' })).filter(
      (row) => (row.meta as { userId?: string } | null)?.userId === 'nobody-2c',
    )
    expect(anonymous).toHaveLength(1)
    expect(anonymous[0]).toMatchObject({
      actorUserNo: null,
      sessionNo: null,
      targetType: null,
      statusCode: 401,
      errorCode: 'ERR_LOGIN_FAILED',
      meta: { userId: 'nobody-2c', loginFailCount: null },
    })
  })
})

describe('GET /admin/audit-logs', () => {
  it('adminAuditLogSchema 로 읽히고 접두 · 정확 · 행위자 필터, 행위자 아이디가 붙는다', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole })
    const agent = await signIn(manager)
    await signIn(manager)
    await agent.post('/admin/sessions/me/revoke-others').expect(200)

    const filter = {
      'filter[actorUserNo]': String(manager.userNo),
      'filter[action]': 'session.revoke',
    }
    const prefix = logsSchema.parse(
      data(await agent.get('/admin/audit-logs').query(filter).expect(200)),
    )
    expect(prefix.items.map((item) => item.action)).toEqual(['session.revoke.others'])
    expect(prefix.items[0]).toMatchObject({
      actorUserId: manager.userId,
      meta: { revokedCount: 1 },
    })

    const exact = logsSchema.parse(
      data(
        await agent
          .get('/admin/audit-logs')
          .query({ ...filter, 'filter[actionMatch]': 'exact' })
          .expect(200),
      ),
    )
    expect(exact.items).toEqual([])
  })

  it('🔴 거꾸로 기간은 400 + issues[filter.to], 슬롯 키가 없는 계정은 403', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: managerRole }))
    const reversed = await agent.get('/admin/audit-logs').query({
      'filter[from]': '2026-10-02T00:00:00.000Z',
      'filter[to]': '2026-10-01T00:00:00.000Z',
    })
    expectError(reversed, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(errorRespSchema.parse(reversed.body).details).toEqual({
      issues: [{ path: ['filter', 'to'], code: 'custom', message: AUDIT_MESSAGES.periodOrder }],
    })

    const member = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    expectError(await member.get('/admin/audit-logs'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })
})
