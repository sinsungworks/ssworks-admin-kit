import { CommonErrorCodes, adminUploadCreatedSchema, isUploadKey } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { failure } from '../test-support/errors.js'
import { pngImage } from '../test-support/images.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { imageRequest, seedUpload, testUploadsConfig } from '../test-support/uploads.js'
import { EncodeGate } from './encode.js'
import { AdminUploadsService } from './uploads.service.js'

let t: TestDatabase
let me: SeededUser
let other: SeededUser
let storage: MemoryObjectStorage
let service: AdminUploadsService
let png: Buffer

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, { roleName: '업로드', permissions: [] })
  me = await seedUser(t.db, { roleNo: role, userId: 'upload-me' })
  other = await seedUser(t.db, { roleNo: role, userId: 'upload-other' })
  storage = new MemoryObjectStorage()
  service = new AdminUploadsService(t.db, testUploadsConfig(storage), new EncodeGate())
  png = await pngImage(8, 6)
})

afterAll(async () => {
  await t?.drop()
})

const count = async () =>
  Number(
    (
      await t.db
        .selectFrom('uploads')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow()
    ).n,
  )

describe('create(스펙 U3)', () => {
  it('재인코딩 → PUT → INSERT — 응답 모양 · url 은 mediaPath + 키 · 객체와 행이 있다', async () => {
    const created = await service.create(me.userNo, 'legal', imageRequest(png))
    expect(adminUploadCreatedSchema.parse(created.body)).toEqual(created.body)
    expect(isUploadKey(created.body.key)).toBe(true)
    expect(created.body.url).toBe(`/media/${created.body.key}`)
    expect(created.body).toMatchObject({ width: 8, height: 6 })
    expect(storage.objects.get(created.body.key)?.contentType).toBe('image/webp')
    const row = await t.db
      .selectFrom('uploads')
      .selectAll()
      .where('uploadNo', '=', created.uploadNo)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      storageKey: created.body.key,
      purpose: 'legal',
      uploadedByUserNo: me.userNo,
      bytes: created.body.bytes,
      refType: null,
      deletedAt: null,
    })
  })

  it('415 · 413 은 본문 읽기에서 — 행 · 객체가 생기지 않는다', async () => {
    const before = storage.objects.size
    const rows = await count()
    expect(
      (await failure(service.create(me.userNo, 'legal', imageRequest(png, 'text/plain')))).code,
    ).toBe(CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    const small = new AdminUploadsService(
      t.db,
      testUploadsConfig(storage, { policy: { maxBytes: 10 } }),
      new EncodeGate(),
    )
    expect((await failure(small.create(me.userNo, 'legal', imageRequest(png)))).code).toBe(
      CommonErrorCodes.ERR_UPLOAD_TOO_LARGE,
    )
    expect(storage.objects.size).toBe(before)
    expect(await count()).toBe(rows)
  })

  it('🔴 사람당 미첨부 상한 409 — 첨부된 것 · 지움 표시는 세지 않는다', async () => {
    const limited = new AdminUploadsService(
      t.db,
      testUploadsConfig(storage, { policy: { maxPendingPerUser: 1 } }),
      new EncodeGate(),
    )
    await seedUpload(t.db, { uploadedByUserNo: other.userNo, refType: 'legalDocument', refId: 1n })
    await seedUpload(t.db, { uploadedByUserNo: other.userNo, deletedAt: new Date() })
    await limited.create(other.userNo, 'legal', imageRequest(png))
    const error = await failure(limited.create(other.userNo, 'legal', imageRequest(png)))
    expect(error.code).toBe(CommonErrorCodes.ERR_UPLOAD_LIMIT)
    expect(error.details).toEqual({ limit: 1 })
  })

  it('🔴 저장소 PUT 실패는 503 — 행이 생기지 않는다', async () => {
    storage.failNext('put')
    const before = await count()
    expect((await failure(service.create(me.userNo, 'legal', imageRequest(png)))).code).toBe(
      CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
    )
    expect(await count()).toBe(before)
  })

  it('🔴 INSERT 실패(없는 사용자 — FK)는 PUT 한 객체를 지우고 원래 오류를 던진다', async () => {
    const objects = storage.objects.size
    const rows = await count()
    const error = await failure(service.create(999_999n, 'legal', imageRequest(png)))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
    expect(storage.objects.size).toBe(objects)
    expect(await count()).toBe(rows)
  })

  it('🔴 INSERT 실패 뒤 객체 정리마저 실패해도 원래 오류가 나간다(503 이 아니다 · 정리 실패는 로그)', async () => {
    const rows = await count()
    storage.failNext('delete')
    const error = await failure(service.create(999_999n, 'legal', imageRequest(png)))
    expect(error.code).not.toBe(CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE)
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
    expect(await count()).toBe(rows)
  })

  it('모르는 용도는 400 ERR_COMMON_VALIDATION — 행 · 객체가 생기지 않는다(가드 뒤 방어)', async () => {
    const objects = storage.objects.size
    const rows = await count()
    const error = await failure(service.create(me.userNo, 'nope', imageRequest(png)))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(storage.objects.size).toBe(objects)
    expect(await count()).toBe(rows)
  })
})

describe('remove(스펙 U4)', () => {
  it('본인 미첨부를 지움 표시 — 객체는 그대로(정리 잡이)', async () => {
    const created = await service.create(me.userNo, 'legal', imageRequest(png))
    expect(await service.remove(me.userNo, created.body.key)).toEqual({
      uploadNo: created.uploadNo,
    })
    const row = await t.db
      .selectFrom('uploads')
      .select('deletedAt')
      .where('uploadNo', '=', created.uploadNo)
      .executeTakeFirstOrThrow()
    expect(row.deletedAt).toBeInstanceOf(Date)
    expect(storage.objects.has(created.body.key)).toBe(true)
  })

  it('🔴 404 — 남의 것 · 첨부됨 · 이미 지움 · 없는 키 · 키 모양 아님', async () => {
    const mine = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const attached = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    const deleted = await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    for (const [actor, key] of [
      [other.userNo, mine.key],
      [me.userNo, attached.key],
      [me.userNo, deleted.key],
      [me.userNo, 'legal/2026/11/' + 'Q'.repeat(32) + '.webp'],
      [me.userNo, 'not-a-key'],
    ] as const) {
      expect((await failure(service.remove(actor, key))).code, key).toBe(
        CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
      )
    }
  })
})

describe('isServable · open(중계가 쓴다)', () => {
  it('첨부됨 · 미삭제만 참, 객체 스트림 · 저장소 오류 503', async () => {
    const pending = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const attached = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    const gone = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'legalDocument',
      refId: 1n,
      deletedAt: new Date(),
    })
    expect(await service.isServable(pending.key)).toBe(false)
    expect(await service.isServable(attached.key)).toBe(true)
    expect(await service.isServable(gone.key)).toBe(false)
    await storage.put(attached.key, Buffer.from('webp'), 'image/webp')
    expect((await service.open(attached.key))?.contentLength).toBe(4)
    expect(await service.open(pending.key)).toBeNull()
    storage.failNext('get')
    expect((await failure(service.open(attached.key))).code).toBe(
      CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
    )
  })
})
