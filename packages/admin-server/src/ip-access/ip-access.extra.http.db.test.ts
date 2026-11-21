import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  IP_ACCESS_SCHEMA_MESSAGES,
  adminIpRuleItemSchema,
  adminIpRuleListSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readJsonColumn } from '../database/json.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import {
  PROBE_SCOPE,
  createProbeTokens,
  probeScope,
  resetIpRules,
  seedIpRule,
  seedProbeToken,
} from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'

// 확장 범위의 라우트 계약(확장 범위 스펙 §4 · §6). 🔴 슬롯은 그대로다(R7 없음) — ipAccess.manage 보유자가 쓴다.
// 🔴 supertest 의 요청 주소는 정규화 뒤 127.0.0.1 이다.

const IP_PATH = '/admin/ip-access'

let t: TestDatabase
let app: NestExpressApplication
let manager: SeededUser
let member: SeededUser
let token: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  await createProbeTokens(t.db)
  token = await seedProbeToken(t.db, '작업대 1')
  const managerRole = await seedRole(t.db, {
    roleName: '확장 IP 담당',
    permissions: ['setting.ipAccess:read', 'setting.ipAccess:write'],
  })
  const memberRole = await seedRole(t.db, { roleName: '확장 구성원', permissions: [] })
  manager = await seedUser(t.db, { roleNo: managerRole, userId: 'xip-manager' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'xip-member' })
  app = await bootAdminApp(
    { ...testDbServer(), database: t.name, connectionLimit: 4 },
    { ipAccess: { extraScopes: [probeScope()] } },
  )
})

afterAll(async () => {
  await app?.close()
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
  const rows = await t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', action)
    .orderBy('logNo', 'desc')
    .execute()
  return rows.map((row) => ({ ...row, meta: readJsonColumn(row.meta) }))
}

describe('라우트로 확장 범위를 쓴다', () => {
  it('만들기 201 → 목록(스키마 통과 · 대상 이름) → 감사 after', async () => {
    const agent = await signIn(manager)
    const created = await sendJson(agent.post(IP_PATH), {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '203.0.113.7/32',
      description: '출고장',
    }).expect(201)
    const { item } = adminIpRuleItemSchema.parse(data(created))
    expect(item).toMatchObject({ scopeType: PROBE_SCOPE, scopeRefNo: token, scopeName: '작업대 1' })
    const list = adminIpRuleListSchema.parse(data(await agent.get(IP_PATH).expect(200)))
    expect(list.items.map((rule) => rule.scopeType)).toEqual(['global', 'global', PROBE_SCOPE])
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_CREATE)
    expect(
      JSON.stringify(row?.meta, (_key, value) =>
        typeof value === 'bigint' ? String(value) : value,
      ),
    ).toContain(PROBE_SCOPE)
  })

  it('수정 · 삭제 — revision · 감사 before', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const agent = await signIn(manager)
    const updated = await sendJson(agent.patch(`${IP_PATH}/${ruleNo}`), {
      cidr: '10.1.0.0/16',
      revision: 0,
    }).expect(200)
    expect(adminIpRuleItemSchema.parse(data(updated)).item.revision).toBe(1)
    await sendJson(agent.delete(`${IP_PATH}/${ruleNo}`), { revision: 1 }).expect(200)
    expect(await auditRows(CoreAuditActions.IP_ACCESS_DELETE)).toHaveLength(1)
  })

  it('🔴 슬롯은 그대로 — 권한 없는 사람은 403', async () => {
    expectError(
      await sendJson((await signIn(member)).post(IP_PATH), {
        scopeType: PROBE_SCOPE,
        scopeRefNo: token,
        cidr: '10.0.0.0/8',
      }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})

describe('400 · 404', () => {
  it('모르는 범위 · 형식 밖 이름 · 대상 없음', async () => {
    const agent = await signIn(manager)
    for (const [body, issue] of [
      [
        { scopeType: 'goneScope', scopeRefNo: 1n, cidr: '10.0.0.0/8' },
        ['scopeType', IP_ACCESS_MESSAGES.unknownScopeType],
      ],
      [
        { scopeType: 'Bad!', scopeRefNo: 1n, cidr: '10.0.0.0/8' },
        ['scopeType', IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid],
      ],
      [
        { scopeType: PROBE_SCOPE, scopeRefNo: 999_999n, cidr: '10.0.0.0/8' },
        ['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTarget],
      ],
    ] as const) {
      const body400 = expectError(
        await sendJson(agent.post(IP_PATH), body),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(issues(body400.details)).toEqual([issue])
    }
  })

  it('🔴 갈래를 넘는 수정 400', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const body = expectError(
      await sendJson((await signIn(manager)).patch(`${IP_PATH}/${ruleNo}`), {
        scopeType: 'global',
        scopeRefNo: null,
        revision: 0,
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issues(body.details)).toEqual([['scopeType', IP_ACCESS_MESSAGES.scopeTypeLocked]])
  })

  it('🔴 미리보기는 코어만 — 확장 scopeType 400 · 확장 규칙 번호 404', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const agent = await signIn(manager)
    expectError(
      await agent.get(`${IP_PATH}/preview`).query({
        op: 'create',
        scopeType: PROBE_SCOPE,
        scopeRefNo: String(token),
        cidr: '10.0.0.0/8',
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expectError(
      await agent.get(`${IP_PATH}/preview`).query({ op: 'delete', ruleNo: String(ruleNo) }),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
  })
})

describe('🔴 R3a — 로그인', () => {
  it('확장 규칙(관리자 userNo 와 같은 번호 · 범위 전체)이 관리자 로그인을 막지 않는다', async () => {
    for (const scopeRefNo of [member.userNo, null]) {
      await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo, cidr: '192.0.2.0/24' })
    }
    await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ userId: member.userId, password: member.password })
      .expect(200)
  })

  it('확장 범위 0.0.0.0/0 만 있으면 관리자는 들어오지 못한다(코어 층 없음 — 기본 거부)', async () => {
    await resetIpRules(t.db, [{ scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' }])
    await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ userId: member.userId, password: member.password })
      .expect(401)
  })
})
