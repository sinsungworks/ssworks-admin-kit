import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  adminSessionListItemSchema,
  adminSessionRevokeResultSchema,
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
import { SESSION_MESSAGES } from './errors.js'

// 실 MariaDB 의 세션 HTTP 계약(2c 스펙 §9-3) — admin-ui useSessions · SessionTable 이 기대는 모양 그대로.

let t: TestDatabase
let app: NestExpressApplication
let managerRole: bigint
let memberRole: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  managerRole = await seedRole(t.db, {
    roleName: '세션 관리자',
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
const listSchema = createPaginatedRespSchema(adminSessionListItemSchema)

function expectError(response: Response, status: number, code: string, message?: string): void {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
}

async function signIn(user: SeededUser): Promise<Agent> {
  const agent = request.agent(server())
  const login = await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
  expect(login.status).toBe(200)
  return agent
}

async function currentSessionNo(agent: Agent): Promise<bigint> {
  const response = await agent.get('/admin/sessions/me').expect(200)
  const current = mineSchema.parse(data(response)).items.find((item) => item.isCurrent)
  if (current === undefined) throw new Error('지금 세션이 없다')
  return current.sessionNo
}

describe('내 세션', () => {
  it('🔴 행이 adminSessionSchema 로 읽히고 isCurrent 는 그 요청의 세션에만', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const first = await signIn(user)
    const second = await signIn(user)
    const fromFirst = mineSchema.parse(
      data(await first.get('/admin/sessions/me').expect(200)),
    ).items
    expect(fromFirst).toHaveLength(2)
    expect(fromFirst.filter((item) => item.isCurrent)).toHaveLength(1)
    expect(await currentSessionNo(first)).not.toBe(await currentSessionNo(second))
  })
})

describe('전체 목록', () => {
  it('행이 adminSessionListItemSchema 로 — 검색어 · userNo 필터, 권한 없는 계정은 403', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole, userId: 'mgr-list' })
    const target = await seedUser(t.db, {
      roleNo: memberRole,
      userId: 'list-target',
      userName: '목록대상',
    })
    const managerAgent = await signIn(manager)
    const targetAgent = await signIn(target)

    const byKeyword = listSchema.parse(
      data(
        await managerAgent
          .get('/admin/sessions')
          .query({ 'filter[keyword]': '목록대' })
          .expect(200),
      ),
    )
    expect(byKeyword.items.map((item) => item.userId)).toEqual(['list-target'])
    expect(byKeyword.items[0]).toMatchObject({
      userNo: target.userNo,
      userName: '목록대상',
      isCurrent: false,
    })

    const byUser = listSchema.parse(
      data(
        await managerAgent
          .get('/admin/sessions')
          .query({ 'filter[userNo]': String(manager.userNo) })
          .expect(200),
      ),
    )
    expect(byUser.items.map((item) => [item.userId, item.isCurrent])).toEqual([['mgr-list', true]])

    expectError(
      await targetAgent.get('/admin/sessions'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('🔴 빈 filter[userNo]= 는 0번 사용자가 아니라 400(Review Focus 3)', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: managerRole }))
    expectError(
      await agent.get('/admin/sessions').query({ 'filter[userNo]': '' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
  })

  it('쪽이 넘치면 빈 items 와 전체 개수', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole })
    const agent = await signIn(manager)
    const page = listSchema.parse(
      data(
        await agent
          .get('/admin/sessions')
          .query({ page: '99', 'filter[userNo]': String(manager.userNo) })
          .expect(200),
      ),
    )
    expect(page).toMatchObject({ items: [], total: 1n, page: 99 })
  })
})

describe('내 세션 끊기', () => {
  it('🔴 지금 세션은 400, 내 다른 세션은 끊기고 그 기기는 다음 요청이 401, 다시 끊으면 404', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const here = await signIn(user)
    const there = await signIn(user)
    const hereNo = await currentSessionNo(here)
    const thereNo = await currentSessionNo(there)

    expectError(
      await here.delete(`/admin/sessions/me/${hereNo}`),
      400,
      CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
      SESSION_MESSAGES.currentSession,
    )
    const done = await here.delete(`/admin/sessions/me/${thereNo}`).expect(200)
    expect(done.body).toEqual({ success: true, data: {} })
    expect((await there.get('/admin/auth/me')).status).toBe(401)
    expectError(
      await here.delete(`/admin/sessions/me/${thereNo}`),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
      SESSION_MESSAGES.notFound,
    )
  })

  it('🔴 남의 세션과 없는 세션은 같은 404 본문 — 남의 세션은 그대로 산다', async () => {
    const mine = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    const theirs = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    const theirNo = await currentSessionNo(theirs)

    const foreign = await mine.delete(`/admin/sessions/me/${theirNo}`)
    const missing = await mine.delete('/admin/sessions/me/999999999')
    expectError(foreign, 404, CommonErrorCodes.ERR_COMMON_NOT_FOUND, SESSION_MESSAGES.notFound)
    expect(missing.body).toEqual(foreign.body)
    expect((await theirs.get('/admin/auth/me')).status).toBe(200)
  })
})

describe('관리자 끊기', () => {
  it('하나 끝내기 — 지금 세션 400, 남의 세션 200 {}, 두 번째는 404', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: managerRole }))
    const victim = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    const mineNo = await currentSessionNo(agent)
    const victimNo = await currentSessionNo(victim)

    expectError(
      await agent.delete(`/admin/sessions/${mineNo}`),
      400,
      CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
      SESSION_MESSAGES.currentSession,
    )
    expect((await agent.delete(`/admin/sessions/${victimNo}`).expect(200)).body).toEqual({
      success: true,
      data: {},
    })
    expectError(
      await agent.delete(`/admin/sessions/${victimNo}`),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
    expect((await victim.get('/admin/auth/me')).status).toBe(401)
  })

  it('사용자 전체 — { revokedCount }, 없는 사용자 404, 본인이면 지금 세션까지 끊긴다', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole })
    const target = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(manager)
    await signIn(target)
    await signIn(target)

    expect(
      adminSessionRevokeResultSchema.parse(
        data(await agent.delete(`/admin/sessions/user/${target.userNo}`).expect(200)),
      ),
    ).toEqual({ revokedCount: 2 })
    expectError(
      await agent.delete('/admin/sessions/user/999999999'),
      404,
      CommonErrorCodes.ERR_NO_USER,
      SESSION_MESSAGES.noUser,
    )
    expect(
      adminSessionRevokeResultSchema.parse(
        data(await agent.delete(`/admin/sessions/user/${manager.userNo}`).expect(200)),
      ),
    ).toEqual({ revokedCount: 1 })
    expect((await agent.get('/admin/auth/me')).status).toBe(401)
  })

  it('슬롯에 이은 키가 없는 계정은 끊기 라우트 403', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    expectError(await agent.delete('/admin/sessions/1'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expectError(
      await agent.delete('/admin/sessions/user/1'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})

describe('다른 세션 모두', () => {
  it('지금 세션만 남기고 끊는다 — 끊을 것이 없으면 0', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const here = await signIn(user)
    await signIn(user)
    await signIn(user)

    expect(
      adminSessionRevokeResultSchema.parse(
        data(await here.post('/admin/sessions/me/revoke-others').expect(200)),
      ),
    ).toEqual({ revokedCount: 2 })
    expect(
      adminSessionRevokeResultSchema.parse(
        data(await here.post('/admin/sessions/me/revoke-others').expect(200)),
      ),
    ).toEqual({ revokedCount: 0 })
    expect(
      mineSchema.parse(data(await here.get('/admin/sessions/me').expect(200))).items,
    ).toHaveLength(1)
  })
})
