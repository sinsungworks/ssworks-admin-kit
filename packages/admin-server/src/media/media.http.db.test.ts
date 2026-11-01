import type { NestExpressApplication } from '@nestjs/platform-express'
import { CommonErrorCodes, adminUploadCreatedSchema, parseJSON } from '@ssworks/admin-shared'
import request, { type Test } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { pngImage } from '../test-support/images.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { seedUpload } from '../test-support/uploads.js'
import { mediaEtag } from './media-http.js'

// 중계 HTTP 계약(스펙 U5 · §9-1) — 업로드 → 미첨부 404 → 첨부(여기서는 DB 직접 — 약관 발행 전구간은 legal 테스트) → 200 · 304 → 지움 → 404 · 저장소 503.

let t: TestDatabase
let app: NestExpressApplication
let storage: MemoryObjectStorage
let publisher: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, {
    roleName: '약관',
    permissions: ['setting.legal:read', 'setting.legal:publish'],
  })
  publisher = await seedUser(t.db, { roleNo: role, userId: 'media-publisher' })
  storage = new MemoryObjectStorage()
  app = await bootAdminApp(
    { ...testDbServer(), database: t.name, connectionLimit: 4 },
    { uploads: { storage } },
  )
})

afterAll(async () => {
  await app?.close()
  await t?.drop()
})

async function signIn(user: SeededUser) {
  const agent = request.agent(app.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

const anonymous = () => request(app.getHttpServer())

/** 바이너리 본문을 Buffer 로 받는다(supertest 기본 파서는 image/webp 를 모른다) */
const binary = (req: Test) =>
  req.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => callback(null, Buffer.concat(chunks)))
  })

describe('GET /media/:purpose/:yyyy/:mm/:file', () => {
  it('🔴 미첨부는 404(no-store) → 첨부되면 200 image/webp + 캐시 · ETag · nosniff · CORP same-site · 본문 동일 → 304', async () => {
    const agent = await signIn(publisher)
    const png = await pngImage(8, 8)
    const created = adminUploadCreatedSchema.parse(
      parseJSON<{ data: unknown }>(
        (
          await agent
            .post('/admin/uploads?purpose=legal')
            .set('Content-Type', 'image/png')
            .send(png)
            .expect(201)
        ).text,
      ).data,
    )
    const pending = await anonymous().get(created.url)
    expect(pending.status).toBe(404)
    expect(pending.headers['cache-control']).toBe('no-store')

    // 첨부(약관 발행이 하는 일을 DB 로 — 전구간은 legal.service.db.test)
    await t.db
      .updateTable('adminUploads')
      .set({ refType: 'legalDocument', refId: 1n, attachedAt: new Date() })
      .where('storageKey', '=', created.key)
      .execute()

    const ok = await binary(anonymous().get(created.url))
    expect(ok.status).toBe(200)
    expect(ok.headers['content-type']).toBe('image/webp')
    expect(ok.headers['cache-control']).toBe('public, max-age=600')
    expect(ok.headers.etag).toBe(mediaEtag(created.key))
    expect(ok.headers['x-content-type-options']).toBe('nosniff')
    expect(ok.headers['cross-origin-resource-policy']).toBe('same-site')
    expect(ok.headers['content-disposition']).toBe('inline')
    expect(Number(ok.headers['content-length'])).toBe(created.bytes)
    expect((ok.body as Buffer).equals(storage.objects.get(created.key)!.body)).toBe(true)

    const cached = await anonymous().get(created.url).set('If-None-Match', mediaEtag(created.key))
    expect(cached.status).toBe(304)
    expect(cached.headers.etag).toBe(mediaEtag(created.key))
    expect(cached.headers['cache-control']).toBe('public, max-age=600')
  })

  it('🔴 지움 표시된 첨부 · 객체 없는 행은 404, 저장소 오류는 503(no-store) · 키 모양 아님 404', async () => {
    const deleted = await seedUpload(t.db, {
      uploadedByUserNo: publisher.userNo,
      refType: 'legalDocument',
      refId: 1n,
      deletedAt: new Date(),
    })
    expect((await anonymous().get(`/media/${deleted.key}`)).status).toBe(404)

    const orphanRow = await seedUpload(t.db, {
      uploadedByUserNo: publisher.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    const missing = await anonymous().get(`/media/${orphanRow.key}`)
    expect(missing.status).toBe(404)
    expect(missing.headers['cache-control']).toBe('no-store')

    await storage.put(orphanRow.key, Buffer.from('webp'), 'image/webp')
    storage.failNext('get')
    const down = await anonymous().get(`/media/${orphanRow.key}`)
    expect(down.status).toBe(503)
    expect(down.headers['cache-control']).toBe('no-store')
    expect(down.body).toMatchObject({ code: CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE })

    expect((await anonymous().get('/media/legal/2026/11/short.webp')).status).toBe(404)
    expect((await anonymous().get(`/media/${orphanRow.key}?x=1`)).status).toBe(200)
  })

  it('🔴 낡은 ETag 는 200, 미첨부 키는 ETag 가 맞아도 304 가 아니라 404(열거 방어 §9-4)', async () => {
    const attached = await seedUpload(t.db, {
      uploadedByUserNo: publisher.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    await storage.put(attached.key, Buffer.from('webp'), 'image/webp')
    const stale = await binary(
      anonymous().get(`/media/${attached.key}`).set('If-None-Match', '"0000000000000000"'),
    )
    expect(stale.status).toBe(200)
    const pending = await seedUpload(t.db, { uploadedByUserNo: publisher.userNo })
    const hidden = await anonymous()
      .get(`/media/${pending.key}`)
      .set('If-None-Match', mediaEtag(pending.key))
    expect(hidden.status).toBe(404)
    expect(hidden.headers['cache-control']).toBe('no-store')
    // Express 가 오류 JSON 본문에 붙이는 약한 ETag 는 있을 수 있다 — 중계 ETag 만 아니면 된다
    expect(hidden.headers.etag).not.toBe(mediaEtag(pending.key))
  })
})
