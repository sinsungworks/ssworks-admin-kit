import { Inject, Injectable, Logger } from '@nestjs/common'
import { isUploadKey, uploadUrl, type AdminUploadCreated } from '@ssworks/admin-shared'
import type { Request } from 'express'
import type { Kysely } from 'kysely'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import type { StoredObject } from '../storage/object-storage.js'
import { ADMIN_UPLOADS_CONFIG, KYSELY } from '../tokens.js'
import {
  attachUploads,
  syncUploads,
  type AttachUploadsInput,
  type AttachUploadsResult,
  type SyncUploadsResult,
} from './attach.js'
import { EncodeGate, encodeUpload } from './encode.js'
import { uploadLimit, uploadNotFound, uploadUnavailable } from './errors.js'
import { newUploadKey } from './keys.js'
import type { ResolvedUploadsConfig } from './options.js'
import { readImageBody } from './read-body.js'
import { markExpiredUploads, purgeDeletedUploads, type SweepResult } from './sweep.js'

// 정본: ssworks-ringside apps/api/src/uploads/uploads.service.ts(create — 미첨부 셈 · 재인코딩 문 · PUT · INSERT · 실패 정리)
// 바꾼 점(스펙 U3 · U4 · U12): 회원 → 관리자, 정책 · 저장소가 코어 옵션(ResolvedUploadsConfig), release 대신 remove(키 하나) +
//   정리 잡(sweep.ts), 중계가 쓰는 isServable · open, 앱 라우트 · 약관이 쓰는 attach · sync(정책 · mediaPath 를 채운다).
// 🔴 create 에는 트랜잭션이 없다 — 재인코딩 · 저장소 호출이 잠금을 쥔 채 돌지 않게. INSERT 가 실패하면 PUT 한 객체를 best-effort 로 지운다.
// 🔴 저장소 예외는 여기서 503 으로 바뀐다(logger.warn) — 바깥으로 나가지 않는다.

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface CreatedUpload {
  uploadNo: bigint
  body: AdminUploadCreated
}

@Injectable()
export class AdminUploadsService {
  private readonly logger = new Logger(AdminUploadsService.name)

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_UPLOADS_CONFIG) private readonly config: ResolvedUploadsConfig,
    private readonly gate: EncodeGate,
  ) {}

  /** 해석된 설정 — 컨트롤러 · 약관 서비스가 mediaPath · 정책을 본다 */
  get settings(): ResolvedUploadsConfig {
    return this.config
  }

  /** `POST /uploads` — 스트림 읽기(415 · 413) → 미첨부 상한(409) → 재인코딩 → PUT → INSERT(실패면 객체 삭제) */
  async create(actorUserNo: bigint, purpose: string, req: Request): Promise<CreatedUpload> {
    const policy = this.config.policy
    const input = await readImageBody(req, policy.maxBytes)
    const pending = await runQuery(() => this.pendingCount(actorUserNo))
    if (pending >= policy.maxPendingPerUser) throw uploadLimit(policy.maxPendingPerUser)
    const encoded = await this.gate.run(() => encodeUpload(input, policy))
    const key = newUploadKey(purpose, new Date())
    await this.storageCall('put', () => this.config.storage.put(key, encoded.data, 'image/webp'))
    let uploadNo: bigint
    try {
      const inserted = await runQuery(() =>
        this.db
          .insertInto('uploads')
          .values({
            storageKey: key,
            purpose,
            uploadedByUserNo: actorUserNo,
            bytes: encoded.data.length,
            width: encoded.width,
            height: encoded.height,
            refType: null,
            refId: null,
            attachedAt: null,
            deletedAt: null,
          })
          .executeTakeFirstOrThrow(),
      )
      if (inserted.insertId === undefined) {
        throw new Error('uploads INSERT 가 insertId 를 돌려주지 않았다.')
      }
      uploadNo = inserted.insertId
    } catch (error) {
      await this.config.storage
        .delete(key)
        .catch((reason: unknown) =>
          this.logger.warn(`업로드 행 실패 뒤 객체 정리 실패(${key}) — ${messageOf(reason)}`),
        )
      throw error
    }
    return {
      uploadNo,
      body: {
        key,
        url: uploadUrl(key, this.config.mediaPath),
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.data.length,
      },
    }
  }

  /** `DELETE /uploads/<키>` — 본인 · 미첨부 · 미삭제만 지움 표시(객체는 정리 잡이). 그 밖은 404 */
  async remove(actorUserNo: bigint, key: string): Promise<{ uploadNo: bigint }> {
    if (!isUploadKey(key)) throw uploadNotFound()
    const row = await runQuery(() =>
      this.db
        .selectFrom('uploads')
        .select('uploadNo')
        .where('storageKey', '=', key)
        .where('uploadedByUserNo', '=', actorUserNo)
        .where('refType', 'is', null)
        .where('deletedAt', 'is', null)
        .executeTakeFirst(),
    )
    if (row === undefined) throw uploadNotFound()
    const result = await runQuery(() =>
      this.db
        .updateTable('uploads')
        .set({ deletedAt: new Date() })
        .where('uploadNo', '=', row.uploadNo)
        .where('refType', 'is', null)
        .where('deletedAt', 'is', null)
        .executeTakeFirst(),
    )
    if (Number(result.numUpdatedRows) === 0) throw uploadNotFound()
    return { uploadNo: row.uploadNo }
  }

  /** 앱 쓰기 라우트 · 약관 발행이 트랜잭션 안에서 부른다 — 정책 · mediaPath 를 채운 attachUploads */
  attach(trx: Kysely<AdminDatabase>, input: AttachUploadsInput): Promise<AttachUploadsResult> {
    return attachUploads(trx, input, this.attachOptions())
  }

  /** 제자리 수정 문서용 — 붙이고 빠진 키는 지움 표시 */
  sync(trx: Kysely<AdminDatabase>, input: AttachUploadsInput): Promise<SyncUploadsResult> {
    return syncUploads(trx, input, this.attachOptions())
  }

  /** 중계 — 첨부됨 · 미삭제 행이 있는가. 🔴 미첨부 · 지움 표시는 어떤 경로로도 보이지 않는다 */
  async isServable(key: string): Promise<boolean> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('uploads')
        .select('uploadNo')
        .where('storageKey', '=', key)
        .where('refType', 'is not', null)
        .where('deletedAt', 'is', null)
        .executeTakeFirst(),
    )
    return row !== undefined
  }

  /** 중계 — 객체 스트림(없으면 null). 저장소 오류는 503 */
  open(key: string): Promise<StoredObject | null> {
    return this.storageCall('get', () => this.config.storage.get(key))
  }

  /** 정리 잡(스펙 U11) — 미첨부 보관 초과 지움 표시 → 지움 표시 행의 객체 · 행 삭제(묶음). 멱등 */
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const marked = await runQuery(() =>
      markExpiredUploads(this.db, this.config.policy.pendingTtlHours, now),
    )
    const purged = await purgeDeletedUploads(this.db, this.config.storage, (key, reason) =>
      this.logger.warn(`업로드 객체 삭제 실패(${key}) — ${messageOf(reason)}`),
    )
    const result = { marked, ...purged }
    if (marked > 0 || purged.deleted > 0 || purged.failed > 0) {
      this.logger.log(
        `업로드 정리 — 지움 표시 ${marked} · 삭제 ${purged.deleted} · 실패 ${purged.failed}`,
      )
    }
    return result
  }

  private attachOptions() {
    return { mediaPath: this.config.mediaPath, maxPerBody: this.config.policy.maxPerBody }
  }

  /** 미첨부 · 미삭제 수 — idx_uploads_uploader 범위 */
  private async pendingCount(userNo: bigint): Promise<number> {
    const row = await this.db
      .selectFrom('uploads')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('uploadedByUserNo', '=', userNo)
      .where('refType', 'is', null)
      .where('deletedAt', 'is', null)
      .executeTakeFirstOrThrow()
    return Number(row.n)
  }

  private async storageCall<T>(operation: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      this.logger.warn(`저장소 ${operation} 실패 — ${messageOf(error)}`)
      throw uploadUnavailable()
    }
  }
}
