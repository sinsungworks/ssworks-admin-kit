import { Readable } from 'node:stream'
import type { AdminObjectStorage, StoredObject } from '../storage/object-storage.js'

// 테스트 전용 — 메모리 저장소(HTTP · 정리 · 약관 첨부 테스트). `failNext(op)` 는 그 동작을 한 번 던지게 한다. 🔴 빌드에서 빠진다.
// 정본: ssworks-ringside packages/db/src/uploads/storage.ts `MemoryObjectStorage`(list · lastModified 제외)

export type StorageOperation = 'put' | 'get' | 'delete'

export class MemoryObjectStorage implements AdminObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>()
  private readonly failing = new Set<StorageOperation>()

  failNext(operation: StorageOperation): void {
    this.failing.add(operation)
  }

  private check(operation: StorageOperation): void {
    if (this.failing.delete(operation)) {
      throw new Error(`메모리 저장소 — 시험용 실패(${operation})`)
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.check('put')
    this.objects.set(key, { body: Buffer.from(body), contentType })
  }

  async get(key: string): Promise<StoredObject | null> {
    this.check('get')
    const stored = this.objects.get(key)
    if (stored === undefined) return null
    return { body: Readable.from([stored.body]), contentLength: stored.body.length }
  }

  async delete(key: string): Promise<void> {
    this.check('delete')
    this.objects.delete(key)
  }
}
