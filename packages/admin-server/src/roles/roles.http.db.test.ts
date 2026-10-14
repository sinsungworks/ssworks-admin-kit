import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminRoleSchema,
  errorRespSchema,
  parseJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'

// 실 MariaDB 의 역할 HTTP 계약(2d 스펙 §9-3 [1]) — admin-ui useRoleEditor 가 기대는 3b §9 그대로.
// 🔴 이 파일은 잔존 셈을 잰다 — 전체 권한 사용자는 boss 하나뿐이다. seedRole 은 늘 permissions 를 명시한다.

let t: TestDatabase
let app: NestExpressApplication
let guarded: NestExpressApplication
let bossRole: bigint
let boss: SeededUser
let manager: SeededUser
let member: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  bossRole = await seedRole(t.db, { roleName: '최고 관리자', permissions: ['*'] })
  const managerRole = await seedRole(t.db, {
    roleName: '역할 관리자',
    permissions: ['org.roles:read', 'org.roles:write', 'org.users:read'],
  })
  const memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  boss = await seedUser(t.db, { roleNo: bossRole, userId: 'boss' })
  manager = await seedUser(t.db, { roleNo: managerRole, userId: 'role-manager' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'member' })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  guarded = await bootAdminApp(connection, { reauth: true })
})

afterAll(async () => {
  await app?.close()
  await guarded?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data
const listSchema = z.object({ items: z.array(adminRoleSchema) })
const itemSchema = z.object({ item: adminRoleSchema })
const createdSchema = z.object({ roleNo: z.bigint() })
// AdminRoleView 의 키 전부(admin-shared adminRoleSchema) — 봉투 data 의 키 집합을 정확히 잰다
const ROLE_KEYS = ['displayOrder', 'isDefault', 'permissions', 'revision', 'roleName', 'roleNo']

/** 성공 봉투 { success: true, data } 를 풀고 data 의 키 집합이 정확히 keys 인지 잰다 */
function envelope(response: Response, keys: string[]): Record<string, unknown> {
  const body = parseJSON<{ success: boolean; data: Record<string, unknown> }>(response.text)
  expect(body.success).toBe(true)
  expect(Object.keys(body.data).sort()).toEqual([...keys].sort())
  return body.data
}

function expectRoleKeys(item: unknown) {
  expect(Object.keys(item as Record<string, unknown>).sort()).toEqual(ROLE_KEYS)
}

async function failCount(user: SeededUser): Promise<number> {
  const row = await t.db
    .selectFrom('users')
    .select('loginFailCount')
    .where('userNo', '=', user.userNo)
    .executeTakeFirstOrThrow()
  return row.loginFailCount
}

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function roles(agent: Agent) {
  const response = await agent.get('/admin/roles').expect(200)
  const body = envelope(response, ['items'])
  for (const item of body.items as unknown[]) expectRoleKeys(item)
  return listSchema.parse(data(response)).items
}

async function roleNamed(agent: Agent, roleName: string) {
  const found = (await roles(agent)).find((role) => role.roleName === roleName)
  if (found === undefined) throw new Error(`역할 없음: ${roleName}`)
  return found
}

async function create(agent: Agent, body: Record<string, unknown>): Promise<bigint> {
  const response = await agent.post('/admin/roles').send(body).expect(201)
  envelope(response, ['roleNo'])
  return createdSchema.parse(data(response)).roleNo
}

describe('목록', () => {
  it('전량 · displayOrder 순 · adminRoleSchema 로 읽힌다 — roles.read 없는 계정은 403', async () => {
    const items = await roles(await signIn(boss))
    expect(items.map((item) => item.roleName)).toContain('최고 관리자')
    const orders = items.map((item) => item.displayOrder)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
    expectError(
      await (await signIn(member)).get('/admin/roles'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('🔴 users.read 만 있어도 목록을 읽는다(⑪ L1 — 사용자 폼의 역할 고르기)', async () => {
    const readerRole = await seedRole(t.db, {
      roleName: 'http-user-reader',
      permissions: ['org.users:read'],
    })
    const reader = await seedUser(t.db, { roleNo: readerRole, userId: 'user-reader' })
    const items = await roles(await signIn(reader))
    expect(items.map((item) => item.roleName)).toContain('http-user-reader')
  })
})

describe('만들기', () => {
  it("201 { roleNo } · 정규화(함의 · 카탈로그 순서 · '*' 접기)", async () => {
    const agent = await signIn(boss)
    const posts = await create(agent, {
      roleName: 'http-posts',
      isDefault: false,
      permissions: ['board.posts:delete'],
    })
    const all = await create(agent, {
      roleName: 'http-all',
      isDefault: false,
      permissions: ['org.users:read', '*'],
    })
    const items = await roles(agent)
    expect(items.find((item) => item.roleNo === posts)?.permissions).toEqual([
      'board.posts:read',
      'board.posts:write',
      'board.posts:delete',
    ])
    expect(items.find((item) => item.roleNo === all)?.permissions).toEqual(['*'])
  })

  it('빈 권한 역할도 만든다(Review Focus 4)', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, {
      roleName: 'http-empty',
      isDefault: false,
      permissions: [],
    })
    expect((await roles(agent)).find((item) => item.roleNo === roleNo)?.permissions).toEqual([])
  })

  it('모르는 권한 키는 400 issues [permissions, i]', async () => {
    const body = expectError(
      await (await signIn(boss)).post('/admin/roles').send({
        roleName: 'http-bogus',
        isDefault: false,
        permissions: ['org.users:read', 'bogus'],
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(body.details).toEqual({
      issues: [
        { path: ['permissions', 1], code: 'custom', message: ACCOUNT_MESSAGES.unknownPermission },
      ],
    })
  })

  it('넓은 권한은 403 + details.outside', async () => {
    const body = expectError(
      await (
        await signIn(manager)
      )
        .post('/admin/roles')
        .send({ roleName: 'http-wide', isDefault: false, permissions: ['setting.auditLog:read'] }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.higherRoleToEdit,
    )
    expect(body.details).toEqual({ outside: ['setting.auditLog:read'] })
  })

  it('🔴 이름 중복 — 대소문자 · 끝 공백만 달라도 400 issues roleName(Review Focus 1, B1)', async () => {
    const agent = await signIn(boss)
    await create(agent, { roleName: 'Http-Dup', isDefault: false, permissions: [] })
    for (const roleName of ['http-dup', 'Http-Dup ']) {
      const body = expectError(
        await agent.post('/admin/roles').send({ roleName, isDefault: false, permissions: [] }),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(body.details).toEqual({
        issues: [
          { path: ['roleName'], code: 'custom', message: ACCOUNT_MESSAGES.duplicateRoleName },
        ],
      })
    }
  })
})

describe('수정', () => {
  it('revision 이 다르면 409, 맞으면 { item } 의 revision + 1', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, { roleName: 'http-rev', isDefault: false, permissions: [] })
    expectError(
      await agent.patch(`/admin/roles/${roleNo}`).send({ revision: 7, roleName: 'http-rev2' }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      ACCOUNT_MESSAGES.roleRevisionMismatch,
    )
    const updated = await agent
      .patch(`/admin/roles/${roleNo}`)
      .send({ revision: 0, roleName: 'http-rev2', permissions: ['org.users:write'] })
      .expect(200)
    expectRoleKeys(envelope(updated, ['item']).item)
    const { item } = itemSchema.parse(data(updated))
    expect(item).toMatchObject({
      roleName: 'http-rev2',
      permissions: ['org.users:read', 'org.users:write'],
      revision: 1,
    })
  })

  it('🔴 permissions 없는 본문은 넓은 역할의 이름도 고친다(3b §9), 있으면 403', async () => {
    const agent = await signIn(manager)
    const wide = await create(await signIn(boss), {
      roleName: 'http-wide-role',
      isDefault: false,
      permissions: ['*'],
    })
    await agent
      .patch(`/admin/roles/${wide}`)
      .send({ revision: 0, roleName: 'http-wide-role2' })
      .expect(200)
    const denied = expectError(
      await agent
        .patch(`/admin/roles/${wide}`)
        .send({ revision: 1, permissions: ['org.users:read'] }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.higherRoleToEdit,
    )
    // 판정은 현재 권한(['*'])이 먼저다(judgeAccountCommand) — 보내려던 키가 아니라 대상 역할이 못 덮인다
    expect(denied.details).toEqual({ outside: ['*'] })
  })

  it('기본 역할은 하나 — 켜면 다른 기본 역할이 꺼지고 그 revision 이 오른다(⑫ D1)', async () => {
    const agent = await signIn(boss)
    const first = await create(agent, {
      roleName: 'http-default-1',
      isDefault: true,
      permissions: [],
    })
    const second = await create(agent, {
      roleName: 'http-default-2',
      isDefault: false,
      permissions: [],
    })
    await agent.patch(`/admin/roles/${second}`).send({ revision: 0, isDefault: true }).expect(200)
    const items = await roles(agent)
    expect(items.filter((item) => item.isDefault).map((item) => item.roleNo)).toEqual([second])
    expect(items.find((item) => item.roleNo === first)).toMatchObject({
      isDefault: false,
      revision: 1,
    })
  })

  it('🔴 마지막 전체 권한 재직자(boss)의 역할에서 * 를 빼면 409 — 그대로 남는다', async () => {
    const agent = await signIn(boss)
    const current = await roleNamed(agent, '최고 관리자')
    expectError(
      await agent
        .patch(`/admin/roles/${bossRole}`)
        .send({ revision: current.revision, permissions: ['org.roles:read'] }),
      409,
      CommonErrorCodes.ERR_COMMON_CONFLICT,
      ACCOUNT_MESSAGES.lastSuperAdmin,
    )
    expect((await roleNamed(agent, '최고 관리자')).permissions).toEqual(['*'])
  })

  it('옛 키 — 목록은 그대로 보이고, 다시 보내면 400, 빼고 보내면 빠진다(Review Focus 2)', async () => {
    const agent = await signIn(boss)
    const stale = await seedRole(t.db, {
      roleName: 'http-stale',
      permissions: ['old.key:read', 'org.users:read'],
    })
    expect((await roleNamed(agent, 'http-stale')).permissions).toEqual([
      'old.key:read',
      'org.users:read',
    ])
    const resent = expectError(
      await agent
        .patch(`/admin/roles/${stale}`)
        .send({ revision: 0, permissions: ['old.key:read', 'org.users:read'] }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(resent.details).toEqual({
      issues: [
        { path: ['permissions', 0], code: 'custom', message: ACCOUNT_MESSAGES.unknownPermission },
      ],
    })
    await agent
      .patch(`/admin/roles/${stale}`)
      .send({ revision: 0, permissions: ['org.users:read'] })
      .expect(200)
    expect((await roleNamed(agent, 'http-stale')).permissions).toEqual(['org.users:read'])
  })

  it('🔴 revision 이 빠진 수정 · 삭제는 400 issues revision — 역할은 그대로', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, {
      roleName: 'http-norev',
      isDefault: false,
      permissions: [],
    })
    const before = await roleNamed(agent, 'http-norev')
    for (const response of [
      await agent.patch(`/admin/roles/${roleNo}`).send({ roleName: 'http-norev2' }),
      await agent.delete(`/admin/roles/${roleNo}`).send({}),
    ]) {
      const body = expectError(response, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
      const issues = (body.details as { issues: { path: unknown[] }[] }).issues
      expect(issues.map((issue) => issue.path)).toEqual([['revision']])
    }
    expect(await roleNamed(agent, 'http-norev')).toEqual(before)
  })

  it('재인증 끔 — 보낸 currentPassword 는 버린다(비교하지 않는다 · 카운터 그대로)', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, {
      roleName: 'http-reauth-off',
      isDefault: false,
      permissions: [],
      currentPassword: 'anything',
    })
    await agent
      .patch(`/admin/roles/${roleNo}`)
      .send({ revision: 0, roleName: 'http-reauth-off2', currentPassword: '' })
      .expect(200)
    expect((await roleNamed(agent, 'http-reauth-off2')).revision).toBe(1)
    expect(await failCount(boss)).toBe(0)
  })

  it('없는 역할 404 · 숫자가 아닌 경로 400', async () => {
    const agent = await signIn(boss)
    expectError(
      await agent.patch('/admin/roles/999999').send({ revision: 0, roleName: 'x' }),
      404,
      CommonErrorCodes.ERR_NO_ROLE,
      ACCOUNT_MESSAGES.noRole,
    )
    expectError(
      await agent.patch('/admin/roles/abc').send({ revision: 0, roleName: 'x' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
  })
})

describe('이동 · 삭제', () => {
  it('🔴 이웃 자리로 구간 재번호 · revision 그대로 · {} — 범위 밖은 맨 끝', async () => {
    const agent = await signIn(boss)
    const one = await create(agent, { roleName: 'http-mv-1', isDefault: false, permissions: [] })
    await create(agent, { roleName: 'http-mv-2', isDefault: false, permissions: [] })
    const three = await create(agent, { roleName: 'http-mv-3', isDefault: false, permissions: [] })
    const target = (await roles(agent)).find((item) => item.roleNo === one)?.displayOrder
    expect(
      (await agent.patch(`/admin/roles/${three}/move`).send({ displayOrder: target }).expect(200))
        .body,
    ).toEqual({ success: true, data: {} })
    const moved = (await roles(agent)).filter((item) => item.roleName.startsWith('http-mv-'))
    expect(moved.map((item) => item.roleName)).toEqual(['http-mv-3', 'http-mv-1', 'http-mv-2'])
    expect(moved.map((item) => item.revision)).toEqual([0, 0, 0])

    await agent.patch(`/admin/roles/${three}/move`).send({ displayOrder: 999_999 }).expect(200)
    const items = await roles(agent)
    expect(items.at(-1)?.roleName).toBe('http-mv-3')
  })

  it('DELETE 본문 { revision } → {} · 쓰는 중 409 IN_USE · revision 409', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, { roleName: 'http-del', isDefault: false, permissions: [] })
    expectError(
      await agent.delete(`/admin/roles/${roleNo}`).send({ revision: 4 }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    expect(
      (await agent.delete(`/admin/roles/${roleNo}`).send({ revision: 0 }).expect(200)).body,
    ).toEqual({
      success: true,
      data: {},
    })
    const current = await roleNamed(agent, '최고 관리자')
    expectError(
      await agent.delete(`/admin/roles/${bossRole}`).send({ revision: current.revision }),
      409,
      CommonErrorCodes.ERR_COMMON_IN_USE,
      ACCOUNT_MESSAGES.roleInUse,
    )
  })
})

describe('재인증(reauth: true)', () => {
  // 틀린 재인증 한 번은 실패 카운터에 센다(2b B2) — 단언이 먼저 실패해도 다음 테스트가 잠금에 걸리지 않게 되돌린다.
  afterEach(async () => {
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 0 })
      .where('userNo', '=', boss.userNo)
      .execute()
  })

  it('🔴 수정 · 삭제도 묻는다 — 빠짐 · 빈 값 400 currentPassword(카운터 그대로 · 역할 그대로) · 맞음 200', async () => {
    const agent = await signIn(boss, guarded)
    const roleNo = await create(agent, {
      roleName: 'reauth-write',
      isDefault: false,
      permissions: [],
      currentPassword: boss.password,
    })
    const before = await roleNamed(agent, 'reauth-write')
    for (const response of [
      await agent.patch(`/admin/roles/${roleNo}`).send({ revision: 0, roleName: 'reauth-write2' }),
      await agent
        .patch(`/admin/roles/${roleNo}`)
        .send({ revision: 0, roleName: 'reauth-write2', currentPassword: '' }),
      await agent.delete(`/admin/roles/${roleNo}`).send({ revision: 0 }),
    ]) {
      const body = expectError(response, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect(body.details).toEqual({
        issues: [
          expect.objectContaining({
            path: ['currentPassword'],
            message: ACCOUNT_MESSAGES.currentPasswordRequired,
          }),
        ],
      })
      expect(await failCount(boss)).toBe(0)
      expect(await roleNamed(agent, 'reauth-write')).toEqual(before)
    }
    await agent
      .patch(`/admin/roles/${roleNo}`)
      .send({ revision: 0, roleName: 'reauth-write2', currentPassword: boss.password })
      .expect(200)
    expect((await roleNamed(agent, 'reauth-write2')).revision).toBe(1)
  })

  it('🔴 빠짐 · 빈 값 400 currentPassword(카운터 그대로) · 틀림 403 · 맞음 201 — 이동은 묻지 않는다', async () => {
    const agent = await signIn(boss, guarded)
    for (const extra of [{}, { currentPassword: '' }]) {
      const body = expectError(
        await agent
          .post('/admin/roles')
          .send({ roleName: 'reauth-http', isDefault: false, permissions: [], ...extra }),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(body.details).toEqual({
        issues: [
          expect.objectContaining({
            path: ['currentPassword'],
            message: ACCOUNT_MESSAGES.currentPasswordRequired,
          }),
        ],
      })
    }
    const counter = await t.db
      .selectFrom('users')
      .select('loginFailCount')
      .where('userNo', '=', boss.userNo)
      .executeTakeFirstOrThrow()
    expect(counter.loginFailCount).toBe(0)

    expectError(
      await agent.post('/admin/roles').send({
        roleName: 'reauth-http',
        isDefault: false,
        permissions: [],
        currentPassword: 'wrong',
      }),
      403,
      CommonErrorCodes.ERR_REAUTH_REQUIRED,
    )
    const response = await agent
      .post('/admin/roles')
      .send({
        roleName: 'reauth-http',
        isDefault: false,
        permissions: [],
        currentPassword: boss.password,
      })
      .expect(201)
    const roleNo = createdSchema.parse(data(response)).roleNo
    await agent.patch(`/admin/roles/${roleNo}/move`).send({ displayOrder: 1 }).expect(200)
  })
})

describe('감사', () => {
  async function auditRows(action: string, targetRefNo: bigint) {
    return t.db
      .selectFrom('auditLogs')
      .selectAll()
      .where('action', '=', action)
      .where('targetRefNo', '=', targetRefNo)
      .orderBy('logNo', 'asc')
      .execute()
  }

  it('기본 역할을 켜서 꺼진 역할은 meta.clearedDefaults 로 남는다(§14 R5-3) — 꺼진 것이 없으면 키도 없다', async () => {
    const agent = await signIn(boss)
    const first = await create(agent, {
      roleName: 'audit-default-1',
      isDefault: true,
      permissions: [],
    })
    const second = await create(agent, {
      roleName: 'audit-default-2',
      isDefault: true,
      permissions: [],
    })
    const [created] = await auditRows(CoreAuditActions.ROLE_CREATE, second)
    expect(created?.meta).toMatchObject({ clearedDefaults: [String(first)] })

    await agent.patch(`/admin/roles/${first}`).send({ revision: 1, isDefault: true }).expect(200)
    const [updated] = await auditRows(CoreAuditActions.ROLE_UPDATE, first)
    expect(updated?.meta).toMatchObject({ clearedDefaults: [String(second)] })

    const plain = await create(agent, {
      roleName: 'audit-plain',
      isDefault: false,
      permissions: [],
    })
    const [plainRow] = await auditRows(CoreAuditActions.ROLE_CREATE, plain)
    expect(Object.keys(plainRow?.meta as Record<string, unknown>)).not.toContain('clearedDefaults')
  })

  it('만들기 · 수정 · 이동 · 삭제가 행으로 — 대상 role · diff · meta', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, {
      roleName: 'audit-role',
      isDefault: false,
      permissions: ['org.users:write'],
    })
    await agent
      .patch(`/admin/roles/${roleNo}`)
      .send({ revision: 0, roleName: 'audit-role2' })
      .expect(200)
    await agent.patch(`/admin/roles/${roleNo}/move`).send({ displayOrder: 1 }).expect(200)
    await agent.delete(`/admin/roles/${roleNo}`).send({ revision: 1 }).expect(200)

    const [created] = await auditRows(CoreAuditActions.ROLE_CREATE, roleNo)
    expect(created).toMatchObject({ targetType: 'role', actorUserNo: boss.userNo, statusCode: 201 })
    expect(created?.meta).toEqual({
      before: {},
      after: {
        roleName: 'audit-role',
        isDefault: false,
        permissions: ['org.users:read', 'org.users:write'],
      },
    })
    const [updated] = await auditRows(CoreAuditActions.ROLE_UPDATE, roleNo)
    expect(updated?.meta).toMatchObject({
      before: { roleName: 'audit-role' },
      after: { roleName: 'audit-role2' },
    })
    const [moved] = await auditRows(CoreAuditActions.ROLE_MOVE, roleNo)
    expect(moved?.meta).toMatchObject({ to: 1 })
    const [removed] = await auditRows(CoreAuditActions.ROLE_DELETE, roleNo)
    expect(removed?.meta).toMatchObject({ before: { roleName: 'audit-role2' }, after: {} })
  })

  it('🔴 재인증 켬 — 감사 행 meta 원문에 currentPassword 값이 없다(2c 최종 리뷰 F1)', async () => {
    const agent = await signIn(boss, guarded)
    const response = await agent
      .post('/admin/roles')
      .send({
        roleName: 'audit-reauth',
        isDefault: false,
        permissions: [],
        currentPassword: boss.password,
      })
      .expect(201)
    const roleNo = createdSchema.parse(data(response)).roleNo
    await agent
      .patch(`/admin/roles/${roleNo}`)
      .send({ revision: 0, roleName: 'audit-reauth2', currentPassword: boss.password })
      .expect(200)
    await agent
      .delete(`/admin/roles/${roleNo}`)
      .send({ revision: 1, currentPassword: boss.password })
      .expect(200)
    for (const action of [
      CoreAuditActions.ROLE_CREATE,
      CoreAuditActions.ROLE_UPDATE,
      CoreAuditActions.ROLE_DELETE,
    ]) {
      const [row] = await auditRows(action, roleNo)
      expect(row, action).toBeDefined()
      const raw = JSON.stringify(row?.meta)
      expect(raw).not.toContain(boss.password)
      expect(raw).not.toContain('currentPassword')
    }
  })
})
