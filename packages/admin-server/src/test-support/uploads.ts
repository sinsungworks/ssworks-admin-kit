import { Readable } from 'node:stream'
import type { Request } from 'express'
import { sql, type Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { newUploadKey } from '../uploads/keys.js'
import { resolveUploadsConfig, type ResolvedUploadsConfig } from '../uploads/options.js'
import type { MemoryObjectStorage } from './memory-storage.js'

// 테스트 전용 — 업로드 행 시드 · 요청 흉내 · 설정. 🔴 빌드에서 빠진다.

export interface SeedUploadInput {
  purpose?: string
  uploadedByUserNo: bigint | null
  key?: string
  refType?: string | null
  refId?: bigint | null
  deletedAt?: Date | null
  /** 지나간 시각으로 넣는다(정리 테스트) — createdAt 은 Kysely 로 넣을 수 없어 원시 SQL */
  createdAt?: Date
}

/** 저장소를 거치지 않고 행만 — 첨부 · 정리 · 중계 판정 테스트 */
export async function seedUpload(
  db: Kysely<AdminDatabase>,
  input: SeedUploadInput,
): Promise<{ uploadNo: bigint; key: string }> {
  const purpose = input.purpose ?? 'legal'
  const key = input.key ?? newUploadKey(purpose, new Date())
  const attached = input.refType != null
  const result = await db
    .insertInto('uploads')
    .values({
      storageKey: key,
      purpose,
      uploadedByUserNo: input.uploadedByUserNo,
      bytes: 100,
      width: 8,
      height: 8,
      refType: input.refType ?? null,
      refId: attached ? (input.refId ?? 1n) : null,
      attachedAt: attached ? new Date() : null,
      deletedAt: input.deletedAt ?? null,
    })
    .executeTakeFirstOrThrow()
  const uploadNo = result.insertId as bigint
  if (input.createdAt !== undefined) {
    await sql`update uploads set created_at = ${input.createdAt} where upload_no = ${uploadNo}`.execute(
      db,
    )
  }
  return { uploadNo, key }
}

/** 서비스 테스트용 요청 — 본문 조각 · Content-Type */
export function imageRequest(body: Buffer, contentType = 'image/png'): Request {
  return Object.assign(Readable.from([body]), {
    headers: { 'content-type': contentType, 'content-length': String(body.length) },
  }) as unknown as Request
}

/** 메모리 저장소 + 기본 정책(덮기 가능) — 약관 용도 자동 · mediaPath '/media' */
export function testUploadsConfig(
  storage: MemoryObjectStorage,
  overrides: { policy?: Record<string, number>; mediaPath?: string; sweep?: false } = {},
): ResolvedUploadsConfig {
  return resolveUploadsConfig(
    {
      uploads: {
        storage,
        mediaPath: overrides.mediaPath ?? '/media',
        policy: overrides.policy,
        sweep: overrides.sweep,
      },
      permissions: { 'legal.publish': 'setting.legal:publish' },
    },
    true,
    'test',
  )
}
