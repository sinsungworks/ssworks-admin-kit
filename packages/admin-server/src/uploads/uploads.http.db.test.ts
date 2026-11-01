import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminUploadCreatedSchema,
  errorRespSchema,
  isUploadKey,
  parseJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GENERIC_5XX_MESSAGE } from '../http/error-response.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { SVG, animatedGif, pngImage } from '../test-support/images.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { seedUpload } from '../test-support/uploads.js'
import { UPLOAD_MESSAGES } from './errors.js'

// 업로드 HTTP 계약(스펙 §4-2 · §9-1) — 실 MariaDB · 메모리 저장소 · 실 sharp. 테스트 앱의 용도: legal(legal.publish) · notice(board.posts:write).
// 🔴 두 앱(app · small)이 한 DB 를 나눈다 — 미첨부 셈은 사람별이라 작은 정책(사람당 1) 테스트는 그 테스트만 쓰는 사람(limited)으로 돈다.

const UPLOADS = '/admin/uploads'
let t: TestDatabase
let app: NestExpressApplication
let small: NestExpressApplication
let storage: MemoryObjectStorage
let publisher: SeededUser
let limited: SeededUser
let reader: SeededUser
let editor: SeededUser
let png: Buffer

beforeAll(async () => {
  t = await createTestDatabase()
  const publisherRole = await seedRole(t.db, {
    roleName: '약관',
    permissions: ['setting.legal:read', 'setting.legal:publish'],
  })
  const readerRole = await seedRole(t.db, { roleName: '조회', permissions: ['setting.legal:read'] })
  const editorRole = await seedRole(t.db, { roleName: '게시', permissions: ['board.posts:write'] })
  publisher = await seedUser(t.db, { roleNo: publisherRole, userId: 'up-publisher' })
  limited = await seedUser(t.db, { roleNo: publisherRole, userId: 'up-limited' })
  reader = await seedUser(t.db, { roleNo: readerRole, userId: 'up-reader' })
  editor = await seedUser(t.db, { roleNo: editorRole, userId: 'up-editor' })
  storage = new MemoryObjectStorage()
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection, { uploads: { storage } })
  small = await bootAdminApp(connection, {
    uploads: { storage, policy: { maxBytes: 200, maxPendingPerUser: 1 } },
  })
  png = await pngImage(8, 8)
})

afterAll(async () => {
  await app?.close()
  await small?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

const upload = (agent: Agent, body: Buffer, purpose = 'legal', type = 'image/png') =>
  agent.post(`${UPLOADS}?purpose=${purpose}`).set('Content-Type', type).send(body)

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

async function auditRows(action: string) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', action)
    .orderBy('logNo', 'desc')
    .execute()
}

describe('POST /admin/uploads', () => {
  it('201 — 봉투 안 { key, url, width, height, bytes } · url 은 /media/<키> · 객체 · 행 · 감사 한 줄(meta 에 바이트 없음)', async () => {
    const agent = await signIn(publisher)
    const response = await upload(agent, png).expect(201)
    const created = adminUploadCreatedSchema.parse(data(response))
    expect(isUploadKey(created.key)).toBe(true)
    expect(created.key.startsWith('legal/')).toBe(true)
    expect(created.url).toBe(`/media/${created.key}`)
    expect(storage.objects.has(created.key)).toBe(true)
    const row = await t.db
      .selectFrom('uploads')
      .selectAll()
      .where('storageKey', '=', created.key)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      purpose: 'legal',
      uploadedByUserNo: publisher.userNo,
      refType: null,
    })
    const [audit] = await auditRows(CoreAuditActions.UPLOAD_CREATE)
    expect(audit).toMatchObject({
      targetType: 'upload',
      targetRefNo: row.uploadNo,
      statusCode: 201,
    })
    expect(audit?.meta).toEqual({
      key: created.key,
      purpose: 'legal',
      bytes: created.bytes,
      width: 8,
      height: 8,
    })
  })

  it('GIF 움짤도 된다', async () => {
    const agent = await signIn(publisher)
    const created = adminUploadCreatedSchema.parse(
      data(await upload(agent, await animatedGif(), 'legal', 'image/gif').expect(201)),
    )
    expect(created.width).toBe(4)
  })

  it('🔴 403 — 용도 권한 없음(legal.read 만) · 모르는 용도 · 형식 밖 용도 · 용도 없음', async () => {
    const agent = await signIn(reader)
    expectError(await upload(agent, png), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    const full = await signIn(publisher)
    expectError(await upload(full, png, 'nope'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expectError(await upload(full, png, 'bad%20kind'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expectError(
      await full.post(UPLOADS).set('Content-Type', 'image/png').send(png),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('앱 용도 notice — board.posts:write 를 가진 사람만', async () => {
    expect((await upload(await signIn(editor), png, 'notice')).status).toBe(201)
    expectError(
      await upload(await signIn(publisher), png, 'notice'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('415 — Content-Type 밖 · 매직 바이트 밖(SVG 를 image/png 로) · Content-Encoding', async () => {
    const agent = await signIn(publisher)
    expectError(
      await upload(agent, png, 'legal', 'text/plain'),
      415,
      CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE,
      UPLOAD_MESSAGES.unsupportedType,
    )
    expectError(await upload(agent, SVG), 415, CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    expectError(
      await upload(agent, png).set('Content-Encoding', 'gzip'),
      415,
      CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE,
    )
  })

  it('413 · 409 — 작은 정책 앱: 장당 200바이트 · 사람당 미첨부 1', async () => {
    const agent = await signIn(limited, small)
    const big = await pngImage(400, 400)
    const tooLarge = expectError(
      await upload(agent, big),
      413,
      CommonErrorCodes.ERR_UPLOAD_TOO_LARGE,
      UPLOAD_MESSAGES.tooLarge,
    )
    expect(tooLarge.details).toEqual({ maxBytes: 200 })
    await upload(agent, png).expect(201)
    const limit = expectError(
      await upload(agent, png),
      409,
      CommonErrorCodes.ERR_UPLOAD_LIMIT,
      UPLOAD_MESSAGES.limit,
    )
    expect(limit.details).toEqual({ limit: 1 })
  })

  it('🔴 저장소 꺼짐 503 — 행이 남지 않고 감사는 실패로 남는다', async () => {
    const agent = await signIn(publisher)
    const countRows = async () =>
      Number(
        (
          await t.db
            .selectFrom('uploads')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .executeTakeFirstOrThrow()
        ).n,
      )
    const before = await countRows()
    storage.failNext('put')
    // 🔴 5xx 는 코어 예외 필터가 문구를 고정 문구로 가린다(코드는 그대로) — UPLOAD_MESSAGES.unavailable 은 로그로만 간다
    expectError(
      await upload(agent, png),
      503,
      CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
      GENERIC_5XX_MESSAGE,
    )
    expect(await countRows()).toBe(before)
    const [audit] = await auditRows(CoreAuditActions.UPLOAD_CREATE)
    expect(audit).toMatchObject({
      statusCode: 503,
      errorCode: CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
    })
  })
})

describe('DELETE /admin/uploads/:purpose/:yyyy/:mm/:file', () => {
  it('본인 미첨부 → 200 data: null · 지움 표시 · 감사 한 줄', async () => {
    const agent = await signIn(publisher)
    const created = adminUploadCreatedSchema.parse(data(await upload(agent, png).expect(201)))
    const response = await agent.delete(`${UPLOADS}/${created.key}`).expect(200)
    expect(parseJSON<{ success: boolean; data: unknown }>(response.text)).toEqual({
      success: true,
      data: null,
    })
    const row = await t.db
      .selectFrom('uploads')
      .select('deletedAt')
      .where('storageKey', '=', created.key)
      .executeTakeFirstOrThrow()
    expect(row.deletedAt).toBeInstanceOf(Date)
    const [audit] = await auditRows(CoreAuditActions.UPLOAD_DELETE)
    expect(audit?.meta).toEqual({ key: created.key, purpose: 'legal' })
  })

  it('🔴 404 — 남의 것 · 첨부됨 · 두 번 지움 · 없는 키 · 키 모양 아님(같은 문구 — 사유를 가르지 않는다)', async () => {
    const mine = await seedUpload(t.db, { uploadedByUserNo: publisher.userNo })
    const theirs = await seedUpload(t.db, { uploadedByUserNo: reader.userNo })
    const attached = await seedUpload(t.db, {
      uploadedByUserNo: publisher.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    const me = await signIn(publisher)
    expectError(
      await me.delete(`${UPLOADS}/${theirs.key}`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
      UPLOAD_MESSAGES.notFound,
    )
    expectError(
      await me.delete(`${UPLOADS}/${attached.key}`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
    )
    await me.delete(`${UPLOADS}/${mine.key}`).expect(200)
    expectError(
      await me.delete(`${UPLOADS}/${mine.key}`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
    )
    expectError(
      await me.delete(`${UPLOADS}/legal/2026/11/${'Q'.repeat(32)}.webp`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
    )
    expectError(
      await me.delete(`${UPLOADS}/legal/2026/11/short.webp`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
    )
  })

  it('🔴 용도 권한이 없으면 404 가 아니라 403(가드가 먼저) · 쿼리와 경로 용도가 둘 다 오면 403(혼동된 대리인)', async () => {
    const theirs = await seedUpload(t.db, { uploadedByUserNo: reader.userNo })
    expectError(
      await (await signIn(reader)).delete(`${UPLOADS}/${theirs.key}`),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
    const noticeKey = await seedUpload(t.db, {
      uploadedByUserNo: publisher.userNo,
      purpose: 'notice',
    })
    expectError(
      await (await signIn(publisher)).delete(`${UPLOADS}/${noticeKey.key}?purpose=legal`),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
    const stillThere = await t.db
      .selectFrom('uploads')
      .select('deletedAt')
      .where('storageKey', '=', noticeKey.key)
      .executeTakeFirstOrThrow()
    expect(stillThere.deletedAt).toBeNull()
  })
})
