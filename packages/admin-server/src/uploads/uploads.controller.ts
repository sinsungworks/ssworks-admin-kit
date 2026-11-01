import { Controller, Delete, Param, Post, Query, Req } from '@nestjs/common'
import {
  CoreAuditActions,
  CoreAuditTargets,
  isUploadKey,
  uploadPurposeOf,
  uploadPurposeQuerySchema,
} from '@ssworks/admin-shared'
import type { AdminUploadCreated, UploadPurposeQuery } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { RequireUploadPurpose } from '../auth/upload-purpose.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { uploadNotFound } from './errors.js'
import { AdminUploadsService } from './uploads.service.js'

// 정본: ssworks-ringside apps/api/src/uploads/uploads.controller.ts(POST — 원시 본문 · purpose 쿼리)
// 바꾼 점(스펙 §4-2): 본문은 미들웨어가 아니라 서비스가 스트림으로 읽는다(read-body.ts). release 대신 DELETE 키 하나. 권한은
//   @RequireUploadPurpose(용도 → 권한). 감사 둘(upload.create · upload.delete) — meta 에 바이트 · 본문은 싣지 않는다.
// 🔴 DELETE 경로는 키의 네 조각이다 — Express 5(path-to-regexp v8)는 `:key(*)` 정규식 파라미터를 지원하지 않는다. 가드는
//    POST 는 query.purpose, DELETE 는 params.purpose 로 용도를 읽고 **둘 다 오면 403** 이다(핸들러와 다른 값을 볼 수 없게).
// 🔴 가드가 먼저다 — 모르는 · 형식 밖 용도는 400 이 아니라 403 이다(스펙 U6). 쿼리 파이프의 400 은 가드를 지난 뒤 잘못된 모양(배열 등)에만.

@Controller('uploads')
export class AdminUploadsController {
  constructor(private readonly uploads: AdminUploadsService) {}

  /** 201 `{ key, url, width, height, bytes }` — 본문은 원시 이미지 바이트(image/jpeg · png · webp · gif) */
  @RequireUploadPurpose()
  @Audit({ action: CoreAuditActions.UPLOAD_CREATE, targetType: CoreAuditTargets.UPLOAD })
  @Post()
  async create(
    @Query(new ZodValidationPipe(uploadPurposeQuerySchema)) query: UploadPurposeQuery,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ): Promise<AdminUploadCreated> {
    const created = await this.uploads.create(admin.userNo, query.purpose, req)
    attachAuditTarget(req, created.uploadNo)
    attachAuditMeta(req, {
      key: created.body.key,
      purpose: query.purpose,
      bytes: created.body.bytes,
      width: created.body.width,
      height: created.body.height,
    })
    return created.body
  }

  /** 본인 · 미첨부만 지움 표시 → `data: null`. 그 밖은 404(사유를 가르지 않는다) */
  @RequireUploadPurpose()
  @Audit({ action: CoreAuditActions.UPLOAD_DELETE, targetType: CoreAuditTargets.UPLOAD })
  @Delete(':purpose/:yyyy/:mm/:file')
  async remove(
    @Param('purpose') purpose: string,
    @Param('yyyy') yyyy: string,
    @Param('mm') mm: string,
    @Param('file') file: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ): Promise<null> {
    const key = `${purpose}/${yyyy}/${mm}/${file}`
    if (!isUploadKey(key)) throw uploadNotFound()
    const removed = await this.uploads.remove(admin.userNo, key)
    attachAuditTarget(req, removed.uploadNo)
    attachAuditMeta(req, { key, purpose: uploadPurposeOf(key) })
    return null
  }
}
