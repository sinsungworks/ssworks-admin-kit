import { Logger } from '@nestjs/common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { seedUpload, testUploadsConfig } from '../test-support/uploads.js'
import { EncodeGate } from './encode.js'
import { newUploadKey } from './keys.js'
import { SWEEP_BATCH, markExpiredUploads, purgeDeletedUploads } from './sweep.js'
import { AdminUploadsService } from './uploads.service.js'

// 정리 잡(스펙 U11) — 지움 표시 · 객체/행 삭제 · 묶음 · 멱등. 스케줄 · 겹침 방지는 uploads.module.test.ts.

const HOUR = 3_600_000
let t: TestDatabase
let me: SeededUser
let storage: MemoryObjectStorage

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, { roleName: '정리', permissions: [] })
  me = await seedUser(t.db, { roleNo: role, userId: 'sweep-me' })
})

beforeEach(async () => {
  await t.db.deleteFrom('uploads').execute()
  storage = new MemoryObjectStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await t?.drop()
})

const keysOf = async () =>
  (await t.db.selectFrom('uploads').select('storageKey').orderBy('uploadNo').execute()).map(
    (r) => r.storageKey,
  )
const deletedKeys = async () =>
  (
    await t.db
      .selectFrom('uploads')
      .select('storageKey')
      .where('deletedAt', 'is not', null)
      .orderBy('uploadNo')
      .execute()
  ).map((r) => r.storageKey)

/** 지움 표시 행 n 개를 한 문장으로 — 묶음 경계 테스트(시드 하나씩은 느리다) */
async function seedDeletedRows(n: number): Promise<void> {
  const now = new Date()
  await t.db
    .insertInto('uploads')
    .values(
      Array.from({ length: n }, () => ({
        storageKey: newUploadKey('legal', now),
        purpose: 'legal',
        uploadedByUserNo: me.userNo,
        bytes: 100,
        width: 8,
        height: 8,
        refType: null,
        refId: null,
        attachedAt: null,
        deletedAt: now,
      })),
    )
    .execute()
}

describe('markExpiredUploads(스펙 U11 ①)', () => {
  it('미첨부 · 미삭제 · 보관 초과만 지움 표시 — 갓 올린 것 · 첨부된 것은 그대로, 이미 지운 것은 다시 세지 않는다', async () => {
    const now = new Date()
    const old = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      createdAt: new Date(now.getTime() - 25 * HOUR),
    })
    const fresh = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      createdAt: new Date(now.getTime() - 23 * HOUR),
    })
    const attached = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'legalDocument',
      refId: 1n,
      createdAt: new Date(now.getTime() - 48 * HOUR),
    })
    const already = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      deletedAt: new Date(now.getTime() - 1000),
      createdAt: new Date(now.getTime() - 48 * HOUR),
    })
    expect(await markExpiredUploads(t.db, 24, now)).toBe(1)
    const marked = await deletedKeys()
    expect(marked).toContain(old.key)
    expect(marked).toContain(already.key)
    expect(marked).not.toContain(fresh.key)
    expect(marked).not.toContain(attached.key)
    expect(await markExpiredUploads(t.db, 24, now)).toBe(0)
  })
})

describe('purgeDeletedUploads(스펙 U11 ②)', () => {
  it('지움 표시 행 — 객체 삭제 뒤 행 삭제, 객체 없는 행도 삭제, 저장소 오류 행은 세고 남긴다(다음 회차)', async () => {
    const a = await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    const b = await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    const c = await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    const live = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    await storage.put(a.key, Buffer.from('a'), 'image/webp')
    await storage.put(c.key, Buffer.from('c'), 'image/webp')
    await storage.put(live.key, Buffer.from('l'), 'image/webp')
    storage.failNext('delete') // 첫 delete(a — uploadNo 순) 가 던진다
    const failures: string[] = []
    const first = await purgeDeletedUploads(t.db, storage, (key) => failures.push(key))
    expect(first).toEqual({ deleted: 2, failed: 1 })
    expect(failures).toEqual([a.key])
    expect(await keysOf()).toEqual([a.key, live.key])
    expect(storage.objects.has(a.key)).toBe(true)
    expect(storage.objects.has(b.key)).toBe(false)
    expect(storage.objects.has(c.key)).toBe(false)
    expect(storage.objects.has(live.key)).toBe(true)

    const second = await purgeDeletedUploads(t.db, storage, () => {})
    expect(second).toEqual({ deleted: 1, failed: 0 })
    expect(await keysOf()).toEqual([live.key])
    expect(storage.objects.has(a.key)).toBe(false)
  })

  it('limit 묶음 — uploadNo 순으로 limit 개만', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    }
    expect(await purgeDeletedUploads(t.db, storage, () => {}, 2)).toEqual({ deleted: 2, failed: 0 })
    expect((await keysOf()).length).toBe(1)
  })

  it('🔴 실패한 행이 limit 안의 뒤 행을 막지 않는다 — 계속 실패하는 행은 남고 나머지는 회차마다 지워진다', async () => {
    const stuck = await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    const failures: string[] = []
    const onFailure = (key: string) => {
      failures.push(key)
    }
    storage.failNext('delete') // 회차마다 첫 delete(stuck — uploadNo 가 가장 작다)가 던진다
    expect(await purgeDeletedUploads(t.db, storage, onFailure, 2)).toEqual({
      deleted: 1,
      failed: 1,
    })
    storage.failNext('delete')
    expect(await purgeDeletedUploads(t.db, storage, onFailure, 2)).toEqual({
      deleted: 1,
      failed: 1,
    })
    expect(failures).toEqual([stuck.key, stuck.key])
    expect(await keysOf()).toEqual([stuck.key])
  })
})

describe('AdminUploadsService.sweep', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })

  it('둘을 이어 돌리고 건수를 돌려준다 — 두 번 돌려도 같은 끝 상태(멱등)', async () => {
    const service = new AdminUploadsService(t.db, testUploadsConfig(storage), new EncodeGate())
    const now = new Date()
    await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      createdAt: new Date(now.getTime() - 30 * HOUR),
    })
    await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    expect(await service.sweep(now)).toEqual({ marked: 1, deleted: 1, failed: 0 })
    expect(await service.sweep(now)).toEqual({ marked: 0, deleted: 0, failed: 0 })
    expect((await keysOf()).length).toBe(1)
  })

  it('묶음이 가득 지워지면 한 회차에 다음 묶음까지 — 실패가 섞인 묶음에서 멈추고 다음 회차가 잇는다', async () => {
    const service = new AdminUploadsService(t.db, testUploadsConfig(storage), new EncodeGate())
    const total = SWEEP_BATCH + SWEEP_BATCH / 2
    await seedDeletedRows(total)
    expect(await service.sweep()).toEqual({ marked: 0, deleted: total, failed: 0 })
    expect(await keysOf()).toEqual([])

    await seedDeletedRows(total)
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    storage.failNext('delete') // 첫 묶음에 실패 하나 — deleted < SWEEP_BATCH 라 이 회차는 거기서 멈춘다
    expect(await service.sweep()).toEqual({
      marked: 0,
      deleted: SWEEP_BATCH - 1,
      failed: 1,
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('업로드 객체 삭제 실패(legal/')
    expect(await service.sweep()).toEqual({
      marked: 0,
      deleted: total - (SWEEP_BATCH - 1),
      failed: 0,
    })
    expect(await keysOf()).toEqual([])
  })
})
