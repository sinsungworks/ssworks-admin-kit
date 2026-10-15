import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  IP_ACCESS_SCHEMA_MESSAGES,
  adminIpPreviewSchema,
  adminIpRuleItemSchema,
  adminIpRuleListSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TEAM_MESSAGES } from '../teams/errors.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { ipRulesOf, resetIpRules, seedIpRule } from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'

// 실 MariaDB 의 IP HTTP 계약(2f-1 스펙 §6 · §9-2). 🔴 supertest 는 듀얼스택 listen 이라 요청 주소가 ::ffff:127.0.0.1 — 정규화
// 뒤 127.0.0.1 이다(§14 R1-④). 🔴 규칙은 beforeEach 로 시드 두 행만 남긴다 — 요청자를 막는 규칙이 다음 테스트의 로그인을
// 막지 않게. bigint 가 든 본문은 stringifyJSON 으로 보낸다.

const IP_PATH = '/admin/ip-access'
const LOCAL = '127.0.0.1'
const ROW_KEYS = [
  'cidr',
  'createAt',
  'description',
  'revision',
  'ruleNo',
  'scopeName',
  'scopeRefNo',
  'scopeType',
  'scopeUserId',
  'updateAt',
]

let t: TestDatabase
let app: NestExpressApplication
let reauthApp: NestExpressApplication
let manager: SeededUser
let reader: SeededUser
let member: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  const managerRole = await seedRole(t.db, {
    roleName: 'IP 담당',
    permissions: [
      'setting.ipAccess:read',
      'setting.ipAccess:write',
      'org.teams:read',
      'org.teams:write',
    ],
  })
  const readerRole = await seedRole(t.db, {
    roleName: 'IP 조회',
    permissions: ['setting.ipAccess:read'],
  })
  const memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  manager = await seedUser(t.db, {
    roleNo: managerRole,
    userId: 'ip-manager',
    userName: '규칙 담당',
  })
  reader = await seedUser(t.db, { roleNo: readerRole, userId: 'ip-reader' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'ip-member' })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  reauthApp = await bootAdminApp(connection, { reauth: true })
})

afterAll(async () => {
  await app?.close()
  await reauthApp?.close()
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

type Agent = ReturnType<typeof request.agent>
type Pending = ReturnType<Agent['post']>

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

function sendJson(pending: Pending, body: unknown): Pending {
  return pending.set('Content-Type', 'application/json').send(stringifyJSON(body))
}

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

const issues = (details: unknown) =>
  (details as { issues: { path: unknown[]; message: string }[] }).issues.map((issue) => [
    issue.path.join('.'),
    issue.message,
  ])

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function auditRows(action: string) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', action)
    .orderBy('logNo', 'desc')
    .execute()
}

describe('목록 · 슬롯', () => {
  it('read 슬롯 — 봉투 · 행 키 · 시드 두 행, 권한 없는 사람은 403', async () => {
    const response = await (await signIn(reader)).get(IP_PATH).expect(200)
    const list = adminIpRuleListSchema.parse(data(response))
    expect(list.items.map((item) => item.cidr)).toEqual(['0.0.0.0/0', '::/0'])
    expect(Object.keys(list.items[0] as object).sort()).toEqual(ROW_KEYS)
    expectError(
      await (await signIn(member)).get(IP_PATH),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})

describe('쓰기', () => {
  it('만들기 201 { item } · Review Focus 3 공백 · 감사 행(대상 번호 · after 만)', async () => {
    const agent = await signIn(manager)
    const team = await seedTeam(t.db, 'http-team')
    const response = await sendJson(agent.post(IP_PATH), {
      scopeType: 'team',
      scopeRefNo: team,
      cidr: ' 10.0.0.0/8 ',
      description: '사무실',
    }).expect(201)
    const { item } = adminIpRuleItemSchema.parse(data(response))
    expect(item).toMatchObject({ scopeName: 'http-team', cidr: '10.0.0.0/8', revision: 0 })
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_CREATE)
    expect(row).toMatchObject({
      targetType: 'ipAccessRule',
      targetRefNo: item.ruleNo,
      statusCode: 201,
    })
    expect(row?.meta).toEqual({
      before: {},
      after: {
        scopeType: 'team',
        scopeRefNo: String(team),
        cidr: '10.0.0.0/8',
        description: '사무실',
      },
    })
  })

  it('검증 400 — CIDR 형식 · 범위 불변식(파이프) · 없는 팀(서비스)', async () => {
    const agent = await signIn(manager)
    const bad = await sendJson(agent.post(IP_PATH), {
      scopeType: 'global',
      scopeRefNo: null,
      cidr: '203.0.113.0',
    })
    expect(issues(expectError(bad, 400, CommonErrorCodes.ERR_COMMON_VALIDATION).details)).toEqual([
      ['cidr', IP_ACCESS_SCHEMA_MESSAGES.cidr],
    ])
    const forbidden = await sendJson(agent.post(IP_PATH), {
      scopeType: 'global',
      scopeRefNo: 1n,
      cidr: '10.0.0.0/8',
    })
    expect(
      issues(expectError(forbidden, 400, CommonErrorCodes.ERR_COMMON_VALIDATION).details),
    ).toEqual([['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden]])
    const missing = await sendJson(agent.post(IP_PATH), {
      scopeType: 'team',
      scopeRefNo: 999_999n,
      cidr: '10.0.0.0/8',
    })
    expect(
      issues(expectError(missing, 400, CommonErrorCodes.ERR_COMMON_VALIDATION).details),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTeam]])
  })

  it('수정 { item } · 감사 before · after · revision 409 · 없는 규칙 404', async () => {
    const agent = await signIn(manager)
    const [, v6] = await resetIpRules(t.db)
    const response = await sendJson(agent.patch(`${IP_PATH}/${v6}`), {
      description: '바뀐 설명',
      revision: 0,
    }).expect(200)
    expect(adminIpRuleItemSchema.parse(data(response)).item).toMatchObject({
      description: '바뀐 설명',
      revision: 1,
    })
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_UPDATE)
    expect(row).toMatchObject({ targetRefNo: v6, statusCode: 200 })
    expect(row?.meta).toMatchObject({
      before: { description: null },
      after: { description: '바뀐 설명' },
    })
    expectError(
      await sendJson(agent.patch(`${IP_PATH}/${v6}`), { description: 'x', revision: 0 }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      IP_ACCESS_MESSAGES.ruleRevisionMismatch,
    )
    expectError(
      await sendJson(agent.patch(`${IP_PATH}/999999`), { revision: 0 }),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
      IP_ACCESS_MESSAGES.ruleNotFound,
    )
  })

  it('삭제 {} · 감사 before 만(지운 규칙의 복원 자리)', async () => {
    const agent = await signIn(manager)
    const extra = await seedIpRule(t.db, { scopeType: 'global', cidr: '172.16.0.0/12' })
    const response = await sendJson(agent.delete(`${IP_PATH}/${extra}`), { revision: 0 }).expect(
      200,
    )
    expect(data(response)).toEqual({})
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_DELETE)
    expect(row).toMatchObject({ targetRefNo: extra, statusCode: 200 })
    expect(row?.meta).toEqual({
      before: { scopeType: 'global', scopeRefNo: null, cidr: '172.16.0.0/12', description: null },
      after: {},
    })
  })

  it('🔴 자기 잠금 409 + details.clientIp 127.0.0.1 — 쓰지 않고, 감사 행은 409 · meta null', async () => {
    const agent = await signIn(manager)
    const response = await sendJson(agent.post(IP_PATH), {
      scopeType: 'user',
      scopeRefNo: manager.userNo,
      cidr: '10.0.0.0/8',
    })
    const body = expectError(
      response,
      409,
      CommonErrorCodes.ERR_COMMON_CONFLICT,
      IP_ACCESS_MESSAGES.selfLockout,
    )
    expect(body.details).toEqual({ clientIp: LOCAL })
    expect(await ipRulesOf(t.db)).toHaveLength(2)
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_CREATE)
    expect(row).toMatchObject({ statusCode: 409, meta: null })
  })

  it('팀 삭제 409 ERR_TEAM_HAS_IP_RULES + ruleCount 봉투', async () => {
    const agent = await signIn(manager)
    const team = await seedTeam(t.db, 'http-ruled-team')
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8' })
    const body = expectError(
      await agent.delete(`/admin/teams/${team}`),
      409,
      CommonErrorCodes.ERR_TEAM_HAS_IP_RULES,
      TEAM_MESSAGES.teamHasIpRules,
    )
    expect(body.details).toEqual({ ruleCount: 1 })
  })
})

describe('미리보기', () => {
  it('clientIp · clientPasses · 요청자를 막는 create · read 슬롯 403', async () => {
    const agent = await signIn(manager)
    const now = adminIpPreviewSchema.parse(data(await agent.get(`${IP_PATH}/preview`).expect(200)))
    expect(now).toMatchObject({ clientIp: LOCAL, clientPasses: true })
    const blocking = adminIpPreviewSchema.parse(
      data(
        await agent
          .get(`${IP_PATH}/preview`)
          .query({
            op: 'create',
            scopeType: 'user',
            scopeRefNo: String(manager.userNo),
            cidr: '10.0.0.0/8',
          })
          .expect(200),
      ),
    )
    expect(blocking.clientPasses).toBe(false)
    expect(blocking.items[0]).toMatchObject({ userId: 'ip-manager', becomesLocked: true })
    expectError(
      await (await signIn(reader)).get(`${IP_PATH}/preview`),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('🔴 Review Focus 4 — 지운 규칙의 update 미리보기 404 · 빠진 칸 400', async () => {
    const agent = await signIn(manager)
    expectError(
      await agent
        .get(`${IP_PATH}/preview`)
        .query({ op: 'update', ruleNo: '999999', scopeType: 'global', cidr: '::/0' }),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
    const missing = expectError(
      await agent.get(`${IP_PATH}/preview`).query({ op: 'delete' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issues(missing.details)).toEqual([['ruleNo', IP_ACCESS_SCHEMA_MESSAGES.previewField]])
  })
})

describe('재인증(reauth 켠 앱)', () => {
  it('currentPassword 빠짐 400 · 틀림 403 ERR_REAUTH_REQUIRED · 맞으면 201', async () => {
    const agent = await signIn(manager, reauthApp)
    const rule = { scopeType: 'global', scopeRefNo: null, cidr: '172.16.0.0/12' }
    const missing = expectError(
      await sendJson(agent.post(IP_PATH), rule),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issues(missing.details).map(([path]) => path)).toEqual(['currentPassword'])
    expectError(
      await sendJson(agent.post(IP_PATH), { ...rule, currentPassword: 'wrong-password' }),
      403,
      CommonErrorCodes.ERR_REAUTH_REQUIRED,
    )
    await sendJson(agent.post(IP_PATH), { ...rule, currentPassword: manager.password }).expect(201)
  })
})
