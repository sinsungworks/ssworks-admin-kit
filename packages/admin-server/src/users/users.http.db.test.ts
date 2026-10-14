import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminEmploymentPeriodSchema,
  adminUserCreateResultSchema,
  adminUserSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { addDays, todayIn } from '../accounts/calendar.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AUTH_MESSAGES } from '../auth/errors.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { addToTeam, seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { seedClosure, seedPeriod } from '../test-support/users.js'

// 실 MariaDB 의 사용자 HTTP 계약(2d 스펙 §9-3 [2]) — 쓰는 쪽 사용자 화면(B)과 3c TemporaryPasswordDialog · 3d TeamUserList
// 어댑터가 기대는 모양. 🔴 bigint 가 든 본문은 stringifyJSON 으로 보낸다(supertest 의 .send(object) 는 bigint 에서 던진다).

const TZ = 'Asia/Seoul'
const day = (offset: number) => addDays(todayIn(TZ), offset)

let t: TestDatabase
let app: NestExpressApplication
let guarded: NestExpressApplication
let bossRole: bigint
let staffRole: bigint
let boss: SeededUser
let manager: SeededUser
let member: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  bossRole = await seedRole(t.db, { roleName: '최고 관리자', permissions: ['*'] })
  const managerRole = await seedRole(t.db, {
    roleName: '사용자 관리자',
    permissions: ['org.users:read', 'org.users:write', 'org.roles:read'],
  })
  const memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  staffRole = await seedRole(t.db, { roleName: '직원', permissions: ['org.users:read'] })
  boss = await seedUser(t.db, { roleNo: bossRole, userId: 'boss' })
  manager = await seedUser(t.db, { roleNo: managerRole, userId: 'user-manager' })
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
type Pending = ReturnType<Agent['post']>

// AdminUserView 의 키 전부(admin-shared adminUserSchema)
const USER_KEYS = [
  'createAt',
  'isPasswordChangeRequired',
  'joinDate',
  'lockUntil',
  'resignAt',
  'resignDate',
  'revision',
  'roleName',
  'roleNo',
  'teamName',
  'teamNo',
  'updateAt',
  'userId',
  'userName',
  'userNo',
]

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

/** 성공 봉투 { success: true, data } 를 풀고 data 의 키 집합이 정확히 keys 인지 잰다 */
function envelope(response: Response, keys: string[]): Record<string, unknown> {
  const body = parseJSON<{ success: boolean; data: Record<string, unknown> }>(response.text)
  expect(body.success).toBe(true)
  expect(Object.keys(body.data).sort()).toEqual([...keys].sort())
  return body.data
}

function expectItem(response: Response) {
  const item = envelope(response, ['item']).item as Record<string, unknown>
  expect(Object.keys(item).sort()).toEqual(USER_KEYS)
  return adminUserSchema.parse(item)
}

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

const issuePaths = (details: unknown) =>
  (details as { issues: { path: unknown[] }[] }).issues.map((issue) => issue.path)

function sendJson(pending: Pending, body: unknown): Pending {
  return pending.set('Content-Type', 'application/json').send(stringifyJSON(body))
}

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

function login(userId: string, password: string) {
  return request(app.getHttpServer()).post('/admin/auth/login').send({ userId, password })
}

async function createUser(agent: Agent, body: Record<string, unknown>) {
  const response = await sendJson(agent.post('/admin/users'), body).expect(201)
  return adminUserCreateResultSchema.parse(data(response))
}

/** 활성 구간 하나를 가진 직원 */
async function staff(userId: string): Promise<SeededUser> {
  const user = await seedUser(t.db, { roleNo: staffRole, userId })
  await seedPeriod(t.db, { userNo: user.userNo, joinDate: '2025-01-02' })
  return user
}

async function failCount(userNo: bigint): Promise<number> {
  const row = await t.db
    .selectFrom('users')
    .select('loginFailCount')
    .where('userNo', '=', userNo)
    .executeTakeFirstOrThrow()
  return row.loginFailCount
}

describe('목록 · 단건 · 이력', () => {
  it('봉투 키가 정확하다 · 행은 adminUserSchema · users.read 없으면 403', async () => {
    const agent = await signIn(boss)
    const response = await agent
      .get('/admin/users')
      .query({ 'filter[keyword]': 'boss' })
      .expect(200)
    const body = envelope(response, ['items', 'itemsPerPage', 'page', 'total'])
    for (const item of body.items as Record<string, unknown>[]) {
      expect(Object.keys(item).sort()).toEqual(USER_KEYS)
    }
    const list = z
      .object({ items: z.array(adminUserSchema), total: z.bigint() })
      .parse(data(response))
    expect(list.items.map((item) => item.userId)).toEqual(['boss'])
    expect(list.total).toBe(1n)
    expectError(
      await (await signIn(member)).get('/admin/users'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it("🔴 filter[recursive]=false 는 거짓(하위 팀 제외) · '0' 은 400 issues [filter, recursive](3d TeamUserList)", async () => {
    const parent = await seedTeam(t.db, 'http-parent')
    const child = await seedTeam(t.db, 'http-child')
    await seedClosure(t.db, parent, child, 1)
    const direct = await seedUser(t.db, { roleNo: staffRole, userId: 'http-direct' })
    const nested = await seedUser(t.db, { roleNo: staffRole, userId: 'http-nested' })
    await addToTeam(t.db, parent, direct.userNo)
    await addToTeam(t.db, child, nested.userNo)
    const agent = await signIn(boss)
    const ids = async (recursive: string) =>
      z
        .object({ items: z.array(adminUserSchema) })
        .parse(
          data(
            await agent
              .get('/admin/users')
              .query({
                'filter[teamNo]': String(parent),
                'filter[recursive]': recursive,
                sortBy: 'userId',
                sortOrder: 'asc',
              })
              .expect(200),
          ),
        )
        .items.map((item) => item.userId)
    expect(await ids('false')).toEqual(['http-direct'])
    expect(await ids('true')).toEqual(['http-direct', 'http-nested'])
    const bad = expectError(
      await agent.get('/admin/users').query({ 'filter[recursive]': '0' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(bad.details)).toEqual([['filter', 'recursive']])
  })

  it('단건 { item } · 이력 { items } · 없는 사용자 404 ERR_NO_USER', async () => {
    const user = await staff('http-one')
    const agent = await signIn(boss)
    expect(expectItem(await agent.get(`/admin/users/${user.userNo}`).expect(200)).userId).toBe(
      'http-one',
    )
    const periods = await agent.get(`/admin/users/${user.userNo}/employment-periods`).expect(200)
    envelope(periods, ['items'])
    const parsed = z.object({ items: z.array(adminEmploymentPeriodSchema) }).parse(data(periods))
    expect(parsed.items.map((period) => period.joinDate)).toEqual(['2025-01-02'])
    expectError(
      await agent.get('/admin/users/999999'),
      404,
      CommonErrorCodes.ERR_NO_USER,
      ACCOUNT_MESSAGES.noUser,
    )
    expectError(
      await agent.get('/admin/users/999999/employment-periods'),
      404,
      CommonErrorCodes.ERR_NO_USER,
    )
  })
})

describe('만들기 → 임시 비밀번호 로그인 → 강제 변경', () => {
  it('🔴 201 { item, temporaryPassword } · 그 값으로 로그인하면 /me 가 강제 변경 · 바꾸면 역할 권한', async () => {
    const agent = await signIn(boss)
    const before = todayIn(TZ)
    const response = await sendJson(agent.post('/admin/users'), {
      userId: ' http-new ',
      userName: ' 새 직원 ',
      roleNo: staffRole,
      teamNo: null,
    }).expect(201)
    const body = envelope(response, ['item', 'temporaryPassword'])
    expect(Object.keys(body.item as object).sort()).toEqual(USER_KEYS)
    const created = adminUserCreateResultSchema.parse(data(response))
    expect(created.item).toMatchObject({
      userId: 'http-new',
      userName: '새 직원',
      isPasswordChangeRequired: true,
      revision: 0,
    })
    expect([before, todayIn(TZ)]).toContain(created.item.joinDate)

    const fresh = request.agent(app.getHttpServer())
    await fresh
      .post('/admin/auth/login')
      .send({ userId: 'http-new', password: created.temporaryPassword })
      .expect(200)
    const me = await fresh.get('/admin/auth/me').expect(200)
    expect(me.body.data).toMatchObject({ isPasswordChangeRequired: true, permissions: [] })
    await fresh
      .patch('/admin/auth/password')
      .send({ currentPassword: created.temporaryPassword, newPassword: 'brand-new-pass-1' })
      .expect(200)
    expect((await fresh.get('/admin/auth/me').expect(200)).body.data).toMatchObject({
      isPasswordChangeRequired: false,
      permissions: ['org.users:read'],
    })
  })

  it('🔴 아이디 중복(앞뒤 공백 · 대소문자) 400 userId · 없는 역할 400 roleNo · 넓은 역할 403 details.outside', async () => {
    const agent = await signIn(boss)
    await createUser(agent, { userId: 'http-dup', userName: 'a', roleNo: staffRole, teamNo: null })
    for (const userId of [' HTTP-DUP ', 'http-dup']) {
      const error = expectError(
        await sendJson(agent.post('/admin/users'), {
          userId,
          userName: 'b',
          roleNo: staffRole,
          teamNo: null,
        }),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(error.details, userId).toEqual({
        issues: [{ path: ['userId'], code: 'custom', message: ACCOUNT_MESSAGES.duplicateUserId }],
      })
    }
    const noRole = expectError(
      await sendJson(agent.post('/admin/users'), {
        userId: 'http-norole',
        userName: 'a',
        roleNo: 999_999n,
        teamNo: null,
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(noRole.details).toEqual({
      issues: [{ path: ['roleNo'], code: 'custom', message: ACCOUNT_MESSAGES.noRole }],
    })
    const wide = expectError(
      await sendJson((await signIn(manager)).post('/admin/users'), {
        userId: 'http-wide',
        userName: 'a',
        roleNo: bossRole,
        teamNo: null,
      }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.higherRoleToGrant,
    )
    expect(wide.details).toEqual({ outside: ['*'] })
  })
})

describe('수정', () => {
  it('🔴 revision 이 빠지면 400 issues revision · 다르면 409 · 맞으면 { item } revision + 1', async () => {
    const agent = await signIn(boss)
    const { item } = await createUser(agent, {
      userId: 'http-edit',
      userName: '편집',
      roleNo: staffRole,
      teamNo: null,
    })
    const path = `/admin/users/${item.userNo}`
    const missing = expectError(
      await sendJson(agent.patch(path), { userName: 'x' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(missing.details)).toEqual([['revision']])
    expectError(
      await sendJson(agent.patch(path), { revision: 5, userName: 'x' }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      ACCOUNT_MESSAGES.userRevisionMismatch,
    )
    const updated = expectItem(
      await sendJson(agent.patch(path), { revision: 0, userName: '바뀐 편집' }).expect(200),
    )
    expect(updated).toMatchObject({ userName: '바뀐 편집', revision: 1 })
  })
})

describe('퇴사 · 퇴사일 · 재입사', () => {
  it('🔴 어제로 퇴사 — 그 사용자의 다음 요청은 401(세션이 같은 트랜잭션에서 끊겼다 — §14 R6-1) · 로그인은 403 ERR_RESIGNED_USER', async () => {
    const target = await staff('http-leaver')
    const victim = await signIn(target)
    const agent = await signIn(boss)
    expectItem(
      await sendJson(agent.post(`/admin/users/${target.userNo}/resign`), {
        resignDate: day(-1),
      }).expect(200),
    )
    expectError(await victim.get('/admin/auth/me'), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
    expectError(
      await login('http-leaver', target.password),
      403,
      CommonErrorCodes.ERR_RESIGNED_USER,
      AUTH_MESSAGES.resigned,
    )
  })

  it('미래로 퇴사 — 요청은 그대로, 효력 시각을 DB 에서 과거로 옮기면 다음 요청 403 ERR_RESIGNED_USER', async () => {
    const target = await staff('http-later')
    const victim = await signIn(target)
    const agent = await signIn(boss)
    await sendJson(agent.post(`/admin/users/${target.userNo}/resign`), {
      resignDate: day(30),
    }).expect(200)
    await victim.get('/admin/auth/me').expect(200)
    await t.db
      .updateTable('users')
      .set({ resignAt: new Date(Date.now() - 1000) })
      .where('userNo', '=', target.userNo)
      .execute()
    expectError(await victim.get('/admin/auth/me'), 403, CommonErrorCodes.ERR_RESIGNED_USER)
  })

  it('본인 퇴사 · 재입사 403 selfAccount(details 없음) · 넓은 계정 403 details.outside', async () => {
    const agent = await signIn(manager)
    expectError(
      await sendJson(agent.post(`/admin/users/${manager.userNo}/resign`), { resignDate: day(1) }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.selfAccount,
    )
    const selfRehire = expectError(
      await sendJson(agent.post(`/admin/users/${manager.userNo}/rehire`), { joinDate: day(1) }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.selfAccount,
    )
    expect(selfRehire.details).toBeUndefined()
    const wide = expectError(
      await sendJson(agent.post(`/admin/users/${boss.userNo}/resign`), { resignDate: day(1) }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.higherAccount,
    )
    expect(wide.details).toEqual({ outside: ['*'] })
  })

  it('퇴사일 정정 · 같은 날 재입사 400 · 다음 날 재입사 { item } — 재입사 뒤 로그인된다', async () => {
    const target = await staff('http-return')
    const agent = await signIn(boss)
    await sendJson(agent.post(`/admin/users/${target.userNo}/resign`), {
      resignDate: day(-2),
    }).expect(200)
    const fixed = expectItem(
      await sendJson(agent.patch(`/admin/users/${target.userNo}/resign-date`), {
        resignDate: day(-1),
      }).expect(200),
    )
    expect(fixed.resignDate).toBe(day(-1))
    const same = expectError(
      await sendJson(agent.post(`/admin/users/${target.userNo}/rehire`), { joinDate: day(-1) }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(same.details)).toEqual([['joinDate']])
    const back = expectItem(
      await sendJson(agent.post(`/admin/users/${target.userNo}/rehire`), {
        joinDate: day(0),
      }).expect(200),
    )
    expect(back).toMatchObject({ joinDate: day(0), resignDate: null, resignAt: null })
    await login('http-return', target.password).expect(200)
  })
})

describe('초기화 · 잠금 해제', () => {
  it('🔴 초기화 { temporaryPassword } — 그 값으로 로그인된다 · 대상의 다른 세션은 끊긴다', async () => {
    const target = await staff('http-reset')
    const victim = await signIn(target)
    const agent = await signIn(boss)
    const response = await agent.post(`/admin/users/${target.userNo}/password-reset`).expect(200)
    const body = envelope(response, ['temporaryPassword'])
    expectError(await victim.get('/admin/auth/me'), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
    await login('http-reset', String(body.temporaryPassword)).expect(200)
  })

  it('잠금 해제 {} — 잠긴 계정이 맞은 비밀번호로 로그인된다 · 잠기지 않아도 200(B16)', async () => {
    const target = await seedUser(t.db, {
      roleNo: staffRole,
      userId: 'http-locked',
      loginFailCount: 5,
      lockUntil: new Date(Date.now() + 600_000),
    })
    expect((await login('http-locked', target.password)).status).toBe(401)
    const agent = await signIn(boss)
    expect((await agent.post(`/admin/users/${target.userNo}/unlock`).expect(200)).body).toEqual({
      success: true,
      data: {},
    })
    await login('http-locked', target.password).expect(200)
    await agent.post(`/admin/users/${target.userNo}/unlock`).expect(200)
  })
})

describe('재인증', () => {
  // 틀린 재인증 한 번은 실패 카운터에 센다(2b B2) — 단언이 먼저 실패해도 다음 테스트가 잠금에 걸리지 않게 되돌린다.
  afterEach(async () => {
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 0 })
      .where('userNo', '=', boss.userNo)
      .execute()
  })

  it('🔴 켬 — 쓰기 일곱 라우트 모두 빠짐 · 빈 값 400 currentPassword, 본문 없는 초기화 · 잠금 해제도(Review Focus 3) · 대조 없음', async () => {
    const agent = await signIn(boss, guarded)
    const { item } = await createUser(agent, {
      userId: 'reauth-target',
      userName: '재인증',
      roleNo: staffRole,
      teamNo: null,
      joinDate: day(-10),
      currentPassword: boss.password,
    })
    const base = `/admin/users/${item.userNo}`
    const routes: ['post' | 'patch', string, Record<string, unknown>][] = [
      [
        'post',
        '/admin/users',
        { userId: 'reauth-x', userName: 'a', roleNo: staffRole, teamNo: null },
      ],
      ['patch', base, { revision: 0, userName: 'x' }],
      ['post', `${base}/resign`, { resignDate: day(30) }],
      ['patch', `${base}/resign-date`, { resignDate: day(31) }],
      ['post', `${base}/rehire`, { joinDate: day(40) }],
      ['post', `${base}/password-reset`, {}],
      ['post', `${base}/unlock`, {}],
    ]
    for (const [method, path, body] of routes) {
      for (const extra of [{}, { currentPassword: '' }]) {
        const pending = method === 'post' ? agent.post(path) : agent.patch(path)
        const error = expectError(
          await sendJson(pending, { ...body, ...extra }),
          400,
          CommonErrorCodes.ERR_COMMON_VALIDATION,
        )
        expect(error.details, `${method} ${path}`).toEqual({
          issues: [
            expect.objectContaining({
              path: ['currentPassword'],
              message: ACCOUNT_MESSAGES.currentPasswordRequired,
            }),
          ],
        })
      }
    }
    for (const path of [`${base}/password-reset`, `${base}/unlock`]) {
      const error = expectError(await agent.post(path), 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect(issuePaths(error.details), path).toEqual([['currentPassword']])
    }
    expect(await failCount(boss.userNo)).toBe(0)
    const row = await t.db
      .selectFrom('users')
      .select(['revision', 'resignAt'])
      .where('userNo', '=', item.userNo)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ revision: 0, resignAt: null })
  })

  it('켬 — 틀리면 403 ERR_REAUTH_REQUIRED · 맞으면 된다', async () => {
    const agent = await signIn(boss, guarded)
    const { item } = await createUser(agent, {
      userId: 'reauth-ok',
      userName: 'a',
      roleNo: staffRole,
      teamNo: null,
      currentPassword: boss.password,
    })
    expectError(
      await sendJson(agent.post(`/admin/users/${item.userNo}/unlock`), {
        currentPassword: 'wrong',
      }),
      403,
      CommonErrorCodes.ERR_REAUTH_REQUIRED,
    )
    await sendJson(agent.post(`/admin/users/${item.userNo}/password-reset`), {
      currentPassword: boss.password,
    }).expect(200)
  })

  it('끔 — 보낸 currentPassword 는 버린다(대조 없음 · 카운터 0)', async () => {
    const agent = await signIn(boss)
    const { item } = await createUser(agent, {
      userId: 'reauth-off',
      userName: 'a',
      roleNo: staffRole,
      teamNo: null,
      currentPassword: 'anything',
    })
    await sendJson(agent.post(`/admin/users/${item.userNo}/unlock`), {
      currentPassword: '',
    }).expect(200)
    expect(await failCount(boss.userNo)).toBe(0)
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

  it('쓰기 일곱이 행으로 — 대상 user · diff · meta', async () => {
    const agent = await signIn(boss)
    const { item } = await createUser(agent, {
      userId: 'audit-user',
      userName: '감사',
      roleNo: staffRole,
      teamNo: null,
      joinDate: day(-10),
    })
    const base = `/admin/users/${item.userNo}`
    await sendJson(agent.patch(base), { revision: 0, userName: '감사2' }).expect(200)
    await sendJson(agent.post(`${base}/resign`), { resignDate: day(-1), reason: '이직' }).expect(
      200,
    )
    await sendJson(agent.patch(`${base}/resign-date`), { resignDate: day(-2) }).expect(200)
    await sendJson(agent.post(`${base}/rehire`), { joinDate: day(0) }).expect(200)
    await agent.post(`${base}/password-reset`).expect(200)
    await agent.post(`${base}/unlock`).expect(200)

    const [created] = await auditRows(CoreAuditActions.USER_CREATE, item.userNo)
    expect(created).toMatchObject({ targetType: 'user', actorUserNo: boss.userNo, statusCode: 201 })
    expect(created?.meta).toMatchObject({
      before: {},
      after: { userId: 'audit-user', userName: '감사', roleNo: String(staffRole), teamNo: null },
    })
    const [updated] = await auditRows(CoreAuditActions.USER_UPDATE, item.userNo)
    expect(updated?.meta).toMatchObject({
      before: { userName: '감사' },
      after: { userName: '감사2' },
    })
    const [resigned] = await auditRows(CoreAuditActions.USER_RESIGN, item.userNo)
    expect(resigned).toMatchObject({ statusCode: 200 })
    expect(resigned?.meta).toMatchObject({
      before: { resignDate: null, resignAt: null },
      after: { resignDate: day(-1) },
      reason: '이직',
      revokedCount: 0,
      timeZone: TZ,
    })
    const [fixed] = await auditRows(CoreAuditActions.USER_RESIGN_DATE_UPDATE, item.userNo)
    expect(fixed?.meta).toMatchObject({ after: { resignDate: day(-2) }, timeZone: TZ })
    const [rehired] = await auditRows(CoreAuditActions.USER_REHIRE, item.userNo)
    expect(rehired?.meta).toMatchObject({
      after: { joinDate: day(0), resignDate: null, resignAt: null },
      timeZone: TZ,
    })
    const [reset] = await auditRows(CoreAuditActions.USER_PASSWORD_RESET, item.userNo)
    expect(reset?.meta).toEqual({ revokedCount: 0 })
    const [unlocked] = await auditRows(CoreAuditActions.USER_UNLOCK, item.userNo)
    expect(unlocked?.meta).toEqual({ lockUntil: null, loginFailCount: 0 })
  })

  it('🔴 감사 행 meta 원문에 임시 비밀번호 · currentPassword 의 값과 키가 없다(공통 11 · 2c 최종 리뷰 F1)', async () => {
    const agent = await signIn(boss, guarded)
    const currentPassword = boss.password
    const created = await createUser(agent, {
      userId: 'audit-secret',
      userName: '비밀',
      roleNo: staffRole,
      teamNo: null,
      joinDate: day(-10),
      currentPassword,
    })
    const base = `/admin/users/${created.item.userNo}`
    const reset = await sendJson(agent.post(`${base}/password-reset`), {
      currentPassword,
    }).expect(200)
    const resetPassword = z
      .object({ temporaryPassword: z.string() })
      .parse(data(reset)).temporaryPassword
    await sendJson(agent.patch(base), { revision: 0, userName: '비밀2', currentPassword }).expect(
      200,
    )
    await sendJson(agent.post(`${base}/resign`), { resignDate: day(-1), currentPassword }).expect(
      200,
    )
    await sendJson(agent.patch(`${base}/resign-date`), {
      resignDate: day(-2),
      currentPassword,
    }).expect(200)
    await sendJson(agent.post(`${base}/rehire`), { joinDate: day(0), currentPassword }).expect(200)
    await sendJson(agent.post(`${base}/unlock`), { currentPassword }).expect(200)

    const rows = await t.db
      .selectFrom('auditLogs')
      .select(['action', 'meta'])
      .where('targetRefNo', '=', created.item.userNo)
      .where('action', 'like', 'org.user.%')
      .execute()
    expect(rows).toHaveLength(7)
    for (const row of rows) {
      const raw = JSON.stringify(row.meta)
      expect(raw, row.action).not.toContain(created.temporaryPassword)
      expect(raw, row.action).not.toContain(resetPassword)
      expect(raw, row.action).not.toContain(currentPassword)
      expect(raw, row.action).not.toContain('temporaryPassword')
      expect(raw, row.action).not.toContain('currentPassword')
    }
  })
})
