import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminLegalCurrentSchema,
  adminLegalDocumentSchema,
  adminLegalHistorySchema,
  adminLegalPublishResultSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { legalContentHash } from './content-hash.js'
import { LEGAL_MESSAGES } from './errors.js'

// 실 MariaDB 의 약관 HTTP 계약(2e 스펙 §9-3 [2]) — admin-ui useLegalDocuments 가 기대는 3e §9 그대로.
// 🔴 종류는 테스트 앱의 TEST_LEGAL_KINDS(TERMS · PRIVACY) 둘뿐이라 이 파일의 테스트가 같은 종류를 나눠 쓴다 — 발행 기준은
//    늘 그때의 현재본에서 읽고(currentNo), 본문은 테스트마다 다르게 쓴다. PRIVACY 는 첫 describe 가 처음 발행한다.
// 🔴 bigint 가 든 본문은 stringifyJSON 으로 보낸다(supertest 의 .send(object) 는 bigint 에서 던진다).

const DOCUMENT_KEYS = [
  'body',
  'contentHash',
  'kind',
  'legalDocNo',
  'publishedAt',
  'publishedByUserName',
  'publishedByUserNo',
]
const HISTORY_KEYS = DOCUMENT_KEYS.filter((key) => key !== 'body')
const UNKNOWN_KIND = '잘못된 옵션: "TERMS"또는 "PRIVACY" 중 하나여야 합니다'
const LEGAL_PATH = '/admin/legal-documents'

let t: TestDatabase
let app: NestExpressApplication
let big: NestExpressApplication
let publisher: SeededUser
let reader: SeededUser
let member: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  const publisherRole = await seedRole(t.db, {
    roleName: '약관 담당',
    permissions: ['setting.legal:read', 'setting.legal:publish'],
  })
  const readerRole = await seedRole(t.db, {
    roleName: '약관 조회',
    permissions: ['setting.legal:read'],
  })
  const memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  publisher = await seedUser(t.db, {
    roleNo: publisherRole,
    userId: 'legal-publisher',
    userName: '약관 담당자',
  })
  reader = await seedUser(t.db, { roleNo: readerRole, userId: 'legal-reader' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'member' })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  big = await bootAdminApp(connection, { jsonLimit: '4mb' })
})

afterAll(async () => {
  await app?.close()
  await big?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>
type Pending = ReturnType<Agent['post']>

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

function sendJson(pending: Pending, body: unknown): Pending {
  return pending.set('Content-Type', 'application/json').send(stringifyJSON(body))
}

/** 성공 봉투 { success: true, data } 를 풀고 data 의 키 집합이 정확히 keys 인지 잰다 */
function envelope(response: Response, keys: string[]): Record<string, unknown> {
  const body = parseJSON<{ success: boolean; data: Record<string, unknown> }>(response.text)
  expect(body.success).toBe(true)
  expect(Object.keys(body.data).sort()).toEqual([...keys].sort())
  return body.data
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

/** 감사 행에는 bigint 열이 있다 — JSON.stringify 가 던지지 않게 문자열로 */
const plain = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? String(item) : item))

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function currentNo(agent: Agent, kind: string): Promise<bigint | null> {
  const response = await agent.get(`${LEGAL_PATH}/current`).query({ kind }).expect(200)
  return adminLegalCurrentSchema.parse(data(response)).item?.legalDocNo ?? null
}

async function publish(
  agent: Agent,
  kind: string,
  body: string,
): Promise<{ legalDocNo: bigint; contentHash: string }> {
  const baseLegalDocNo = await currentNo(agent, kind)
  const response = await sendJson(agent.post(LEGAL_PATH), { kind, body, baseLegalDocNo }).expect(
    201,
  )
  envelope(response, ['contentHash', 'legalDocNo'])
  return adminLegalPublishResultSchema.parse(data(response))
}

async function auditRowOf(legalDocNo: bigint) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', CoreAuditActions.LEGAL_PUBLISH)
    .where('targetRefNo', '=', legalDocNo)
    .executeTakeFirstOrThrow()
}

async function lastFailedRow(statusCode: number) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', CoreAuditActions.LEGAL_PUBLISH)
    .where('statusCode', '=', statusCode)
    .orderBy('logNo', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow()
}

describe('PRIVACY — 이 파일에서 처음 발행하는 종류', () => {
  it('미발행 현재본 200 { item: null } · 이력 { items: [] } → 첫 발행(baseLegalDocNo: null) 201 → 감사 meta 의 기준 판 null', async () => {
    const agent = await signIn(publisher)
    const empty = await agent.get(`${LEGAL_PATH}/current?kind=PRIVACY`).expect(200)
    expect(envelope(empty, ['item'])).toEqual({ item: null })
    const none = await agent.get(`${LEGAL_PATH}?kind=PRIVACY`).expect(200)
    expect(envelope(none, ['items'])).toEqual({ items: [] })

    const body = '개인정보처리방침 첫 판'
    const created = await publish(agent, 'PRIVACY', body)
    expect(created.contentHash).toBe(legalContentHash(body))
    const row = await auditRowOf(created.legalDocNo)
    expect(row).toMatchObject({
      targetType: 'legalDocument',
      actorUserNo: publisher.userNo,
      statusCode: 201,
      errorCode: null,
    })
    expect(row.meta).toEqual({
      kind: 'PRIVACY',
      baseLegalDocNo: null,
      contentHash: created.contentHash,
      length: body.length,
    })
  })
})

describe('읽기 · 권한', () => {
  it('🔴 legal.read 만으로 읽기 셋 200 · 발행 403(details 없음) — 슬롯 없는 계정은 읽기도 403', async () => {
    const { legalDocNo } = await publish(await signIn(publisher), 'TERMS', '읽기 권한용 판')
    const readerAgent = await signIn(reader)
    await readerAgent.get(`${LEGAL_PATH}/current?kind=TERMS`).expect(200)
    await readerAgent.get(`${LEGAL_PATH}?kind=TERMS`).expect(200)
    await readerAgent.get(`${LEGAL_PATH}/${legalDocNo}`).expect(200)
    const denied = expectError(
      await sendJson(readerAgent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: '권한 없는 판',
        baseLegalDocNo: legalDocNo,
      }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      '권한이 없습니다.',
    )
    expect(denied.details).toBeUndefined()
    expectError(
      await (await signIn(member)).get(`${LEGAL_PATH}/current?kind=TERMS`),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('🔴 모르는 · 빠진 · 배열 · 소문자 종류 400 issues[kind] — 쿼리 둘과 발행 본문(Review Focus 4)', async () => {
    const agent = await signIn(publisher)
    for (const path of [`${LEGAL_PATH}/current`, LEGAL_PATH]) {
      for (const query of ['?kind=REFUND', '', '?kind=TERMS&kind=PRIVACY', '?kind=terms']) {
        const body = expectError(
          await agent.get(`${path}${query}`),
          400,
          CommonErrorCodes.ERR_COMMON_VALIDATION,
        )
        expect(body.details, `${path}${query}`).toEqual({
          issues: [{ path: ['kind'], code: 'invalid_value', message: UNKNOWN_KIND }],
        })
      }
    }
    const published = expectError(
      await sendJson(agent.post(LEGAL_PATH), { kind: 'REFUND', body: 'x', baseLegalDocNo: null }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(published.details)).toEqual([['kind']])
  })

  it('단건 — 없는 번호 404 · 숫자 아닌 번호 400 issues[legalDocNo]', async () => {
    const agent = await signIn(reader)
    expectError(
      await agent.get(`${LEGAL_PATH}/999999999`),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
      LEGAL_MESSAGES.notFound,
    )
    const invalid = expectError(
      await agent.get(`${LEGAL_PATH}/abc`),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(invalid.details)).toEqual([['legalDocNo']])
  })
})

describe('발행 — 3e §9', () => {
  it('201 { legalDocNo, contentHash } → 현재본 · 이력 · 단건 — 키 집합 · admin-shared 스키마 · 해시 = sha256(body)', async () => {
    const agent = await signIn(publisher)
    const body = '이용약관 계약 판'
    const created = await publish(agent, 'TERMS', body)
    expect(created.contentHash).toBe(legalContentHash(body))

    const current = await agent.get(`${LEGAL_PATH}/current?kind=TERMS`).expect(200)
    const currentData = envelope(current, ['item'])
    expect(Object.keys(currentData.item as object).sort()).toEqual(DOCUMENT_KEYS)
    const item = adminLegalCurrentSchema.parse(data(current)).item
    expect(item).toEqual({
      legalDocNo: created.legalDocNo,
      kind: 'TERMS',
      body,
      contentHash: created.contentHash,
      publishedAt: item?.publishedAt,
      publishedByUserNo: publisher.userNo,
      publishedByUserName: '약관 담당자',
    })

    const history = await agent.get(`${LEGAL_PATH}?kind=TERMS`).expect(200)
    const rawItems = envelope(history, ['items']).items as object[]
    // 🔴 이력에 본문이 없다
    for (const raw of rawItems) expect(Object.keys(raw).sort()).toEqual(HISTORY_KEYS)
    const items = adminLegalHistorySchema.parse(data(history)).items
    expect(items[0]?.legalDocNo).toBe(created.legalDocNo)
    for (let i = 1; i < items.length; i += 1) {
      const newer = items[i - 1]
      const older = items[i]
      if (newer === undefined || older === undefined) continue
      expect(newer.publishedAt >= older.publishedAt).toBe(true)
    }

    // 🔴 단건은 문서 그대로 — `{ item }` 이 아니다(3e §9 · admin-ui README api.get<AdminLegalDocument>)
    const single = await agent.get(`${LEGAL_PATH}/${created.legalDocNo}`).expect(200)
    envelope(single, DOCUMENT_KEYS)
    expect(adminLegalDocumentSchema.parse(data(single))).toEqual(item)
  })

  it('🔴 본문에 contentHash 를 실어 보내도 무시한다 — 서버가 셈한 값만(Review Focus 3)', async () => {
    const agent = await signIn(publisher)
    const body = '해시 위조 시도 판'
    const base = await currentNo(agent, 'TERMS')
    const response = await sendJson(agent.post(LEGAL_PATH), {
      kind: 'TERMS',
      body,
      baseLegalDocNo: base,
      contentHash: '0'.repeat(64),
    }).expect(201)
    expect(adminLegalPublishResultSchema.parse(data(response)).contentHash).toBe(
      legalContentHash(body),
    )
  })

  it('🔴 409 둘 — 같은 본문 ERR_COMMON_CONFLICT · 낡은 기준 ERR_COMMON_REVISION_CONFLICT(같은 본문이어도 기준 판이 먼저)', async () => {
    const agent = await signIn(publisher)
    const first = await publish(agent, 'TERMS', '충돌 시험 첫 판')
    expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: '충돌 시험 첫 판',
        baseLegalDocNo: first.legalDocNo,
      }),
      409,
      CommonErrorCodes.ERR_COMMON_CONFLICT,
      LEGAL_MESSAGES.sameContent,
    )
    const second = await publish(agent, 'TERMS', '충돌 시험 둘째 판')
    expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: '충돌 시험 둘째 판',
        baseLegalDocNo: first.legalDocNo,
      }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      LEGAL_MESSAGES.revisionConflict,
    )
    expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: '충돌 시험 새 판',
        baseLegalDocNo: null,
      }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    expect(await currentNo(agent, 'TERMS')).toBe(second.legalDocNo)
  })

  it('🔴 본문 검증 400 issues — 공백만 · 1,000,001자 · baseLegalDocNo 빠짐 · 숫자 기준 판', async () => {
    const agent = await signIn(publisher)
    const blank = expectError(
      await sendJson(agent.post(LEGAL_PATH), { kind: 'TERMS', body: '   ', baseLegalDocNo: null }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(blank.details)).toEqual([['body']])
    const long = expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: 'x'.repeat(1_000_001),
        baseLegalDocNo: null,
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(long.details)).toEqual([['body']])
    const missing = expectError(
      await sendJson(agent.post(LEGAL_PATH), { kind: 'TERMS', body: 'x' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(missing.details)).toEqual([['baseLegalDocNo']])
    const numeric = expectError(
      await agent
        .post(LEGAL_PATH)
        .set('Content-Type', 'application/json')
        .send('{"kind":"TERMS","body":"x","baseLegalDocNo":5}'),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(numeric.details)).toEqual([['baseLegalDocNo']])
  })

  it('🔴 jsonLimit — 1,000,000자 한글 본문(3MB)은 기본 1mb 앱에서 413 봉투, 4mb 앱에서 201 · 같은 본문 왕복 · 감사는 길이만(⑫ J1 · Review Focus 1)', async () => {
    const body = '약'.repeat(1_000_000)
    const small = await signIn(publisher)
    const base = await currentNo(small, 'TERMS')
    expectError(
      await sendJson(small.post(LEGAL_PATH), {
        kind: 'TERMS',
        body,
        baseLegalDocNo: base,
      }),
      413,
      CommonErrorCodes.ERR_COMMON_PAYLOAD_TOO_LARGE,
      '요청 본문이 너무 큽니다.',
    )
    const bigAgent = await signIn(publisher, big)
    const created = await publish(bigAgent, 'TERMS', body)
    expect(created.contentHash).toBe(legalContentHash(body))
    const single = await bigAgent.get(`${LEGAL_PATH}/${created.legalDocNo}`).expect(200)
    const document = adminLegalDocumentSchema.parse(data(single))
    expect(document.body.length).toBe(1_000_000)
    expect(document.body === body).toBe(true)
    const row = await auditRowOf(created.legalDocNo)
    expect(row.meta).toMatchObject({ length: 1_000_000 })
    expect(JSON.stringify(row.meta).length).toBeLessThan(400)
  }, 60_000)
})

describe('감사', () => {
  it('🔴 발행 행 — 대상 legalDocument · 번호 · meta 원문 { kind, baseLegalDocNo, contentHash, length }, 본문 없음(공통 12)', async () => {
    const agent = await signIn(publisher)
    const base = await currentNo(agent, 'TERMS')
    const body = '감사 표식 본문 AUDIT-BODY-MARKER'
    const response = await sendJson(agent.post(LEGAL_PATH), {
      kind: 'TERMS',
      body,
      baseLegalDocNo: base,
    }).expect(201)
    const created = adminLegalPublishResultSchema.parse(data(response))
    const row = await auditRowOf(created.legalDocNo)
    expect(row).toMatchObject({
      action: CoreAuditActions.LEGAL_PUBLISH,
      targetType: 'legalDocument',
      targetRefNo: created.legalDocNo,
      actorUserNo: publisher.userNo,
      statusCode: 201,
      errorCode: null,
    })
    expect(row.meta).toEqual({
      kind: 'TERMS',
      baseLegalDocNo: base === null ? null : String(base),
      contentHash: created.contentHash,
      length: body.length,
    })
    expect(plain(row)).not.toContain('AUDIT-BODY-MARKER')
  })

  it('🔴 실패한 발행(409 · 400)도 행으로 남고 meta 는 null — 본문이 실리지 않는다', async () => {
    const agent = await signIn(publisher)
    const body = '실패 감사 표식 FAIL-BODY-MARKER'
    expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body,
        baseLegalDocNo: 999_999_999n,
      }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    expect(await lastFailedRow(409)).toMatchObject({
      errorCode: CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      targetRefNo: null,
      meta: null,
    })
    expectError(
      await sendJson(agent.post(LEGAL_PATH), { kind: 'REFUND', body, baseLegalDocNo: null }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(await lastFailedRow(400)).toMatchObject({
      errorCode: CommonErrorCodes.ERR_COMMON_VALIDATION,
      meta: null,
    })
    const rows = await t.db
      .selectFrom('auditLogs')
      .selectAll()
      .where('action', '=', CoreAuditActions.LEGAL_PUBLISH)
      .execute()
    expect(plain(rows)).not.toContain('FAIL-BODY-MARKER')
  })
})
