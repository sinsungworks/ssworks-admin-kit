import { DEFAULT_MEDIA_PATH, DEFAULT_UPLOAD_POLICY, collectUploadKeys } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { uploadLimit, uploadNotFound } from './errors.js'

// 정본: ssworks-ringside packages/db/src/uploads/attach.ts attachUploadsIn(키 모으기 · 잠금 · 판정 · 한 UPDATE · 빠진 키 지움 표시)
// 바꾼 점(스펙 U8 · U9):
//  - 첨부(attachUploads)와 빠진 키 지움(syncUploads)을 가른다 — 약관은 append-only 라 앞 판의 그림을 지우면 안 된다.
//  - "이미 같은 refType 에 첨부됨" 은 통과(약관 새 판이 앞 판 그림을 다시 쓴다). refId 는 첫 첨부 그대로.
//  - 잘못된 키는 사유를 가르지 않고 404 하나(열거 방어). ringside 는 400 + details.keys.
//  - 읽기는 `storageKey IN (...) ORDER BY uploadNo FOR UPDATE` 하나 — 비잠금 선행 읽기가 없다(스냅샷 격리 ON 에서 1020).
// 🔴 트랜잭션 안에서, 자기 문서 행을 먼저 잠근 뒤 부른다 — `uploads` 가 잠금 순서의 마지막이다(스펙 §5-6).

export interface AttachUploadsInput {
  /** 저장하려는 본문(Markdown) — 키는 collectUploadKeys 로 모은다 */
  markdown: string
  /** 이 본문의 용도 — 키의 용도와 같아야 한다 */
  purpose: string
  /** 첨부 대상 종류 — 감사 대상 이름과 같은 값(CoreAuditTargets.LEGAL_DOCUMENT …) */
  refType: string
  refId: bigint
  /** 본문을 쓰는 관리자 — 미첨부 키는 이 사람이 올린 것이어야 한다 */
  actorUserNo: bigint
}

export interface AttachUploadsOptions {
  /** 본문에 적힌 공개 경로(옵션 uploads.mediaPath). 기본 DEFAULT_MEDIA_PATH */
  mediaPath?: string
  /** 본문당 장수(정책 maxPerBody). 기본 DEFAULT_UPLOAD_POLICY.maxPerBody */
  maxPerBody?: number
  now?: Date
}

export interface AttachUploadsResult {
  /** 이번에 붙인 수(이미 붙어 있던 것은 세지 않는다) */
  attached: number
  /** 본문의 우리 키 — 처음 나온 순서 */
  keys: string[]
}

export interface SyncUploadsResult extends AttachUploadsResult {
  /** 이 문서에 붙어 있었는데 본문에서 빠져 지움 표시한 수 */
  detached: number
}

/**
 * 본문 속 우리 키를 문서에 붙인다. 키마다 ① 존재 · 미삭제 · 같은 용도 ② 미첨부면 본인이 올린 것, 첨부됐으면 같은 refType —
 * 아니면 404 로 **저장 전체가 실패**한다(트랜잭션 롤백). 본문당 장수 초과는 409(잠그기 전에).
 */
export async function attachUploads(
  trx: Kysely<AdminDatabase>,
  input: AttachUploadsInput,
  options: AttachUploadsOptions = {},
): Promise<AttachUploadsResult> {
  const keys = collectUploadKeys(input.markdown, options.mediaPath ?? DEFAULT_MEDIA_PATH)
  if (keys.length === 0) return { attached: 0, keys }
  const maxPerBody = options.maxPerBody ?? DEFAULT_UPLOAD_POLICY.maxPerBody
  if (keys.length > maxPerBody) throw uploadLimit(maxPerBody)

  const rows = await trx
    .selectFrom('uploads')
    .select(['uploadNo', 'storageKey', 'purpose', 'uploadedByUserNo', 'refType', 'deletedAt'])
    .where('storageKey', 'in', keys)
    .orderBy('uploadNo')
    .forUpdate()
    .execute()
  const byKey = new Map(rows.map((row) => [row.storageKey, row]))
  const toAttach: bigint[] = []
  for (const key of keys) {
    const row = byKey.get(key)
    if (row === undefined || row.deletedAt !== null || row.purpose !== input.purpose) {
      throw uploadNotFound()
    }
    if (row.refType === null) {
      if (row.uploadedByUserNo !== input.actorUserNo) throw uploadNotFound()
      toAttach.push(row.uploadNo)
    } else if (row.refType !== input.refType) {
      throw uploadNotFound()
    }
  }
  if (toAttach.length > 0) {
    await trx
      .updateTable('uploads')
      .set({ refType: input.refType, refId: input.refId, attachedAt: options.now ?? new Date() })
      .where('uploadNo', 'in', toAttach)
      .execute()
  }
  return { attached: toAttach.length, keys }
}

/**
 * 제자리 수정 문서용 — attachUploads 뒤, 같은 refType · refId 에 붙어 있는데 본문에서 빠진 키를 지움 표시한다(객체는 정리 잡이).
 * 🔴 약관(append-only)은 쓰지 않는다. 같은 그림을 두 문서에 적었다가 한쪽에서 빼면 다른 쪽 그림도 깨진다 — README(각각 올린다).
 */
export async function syncUploads(
  trx: Kysely<AdminDatabase>,
  input: AttachUploadsInput,
  options: AttachUploadsOptions = {},
): Promise<SyncUploadsResult> {
  const result = await attachUploads(trx, input, options)
  const inBody = new Set(result.keys)
  const current = await trx
    .selectFrom('uploads')
    .select(['uploadNo', 'storageKey'])
    .where('refType', '=', input.refType)
    .where('refId', '=', input.refId)
    .where('deletedAt', 'is', null)
    .orderBy('uploadNo')
    .forUpdate()
    .execute()
  const gone = current.filter((row) => !inBody.has(row.storageKey)).map((row) => row.uploadNo)
  if (gone.length > 0) {
    await trx
      .updateTable('uploads')
      .set({ deletedAt: options.now ?? new Date() })
      .where('uploadNo', 'in', gone)
      .execute()
  }
  return { ...result, detached: gone.length }
}
