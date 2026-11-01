import { Controller, Get, Logger, Optional, Param, Req, Res, StreamableFile } from '@nestjs/common'
import { isUploadKey } from '@ssworks/admin-shared'
import type { Request, Response } from 'express'
import { Public } from '../auth/decorators.js'
import { RawResponse } from '../http/envelope.interceptor.js'
import { uploadNotFound } from '../uploads/errors.js'
import { AdminUploadsService } from '../uploads/uploads.service.js'
import {
  MEDIA_CONTROLLER_PATH,
  MEDIA_MAX_AGE_SECONDS,
  etagMatches,
  mediaEtag,
} from './media-http.js'

// 정본: ssworks-ringside apps/api/src/uploads/media.controller.ts(판정 → 304 → 스트림 · 실패 no-store · nosniff)
// 바꾼 점(스펙 2-1 ⑤ · U5): 신원 · 쿠키 · 분석글 판정이 없다 — 첨부된 행만 200, 미첨부 · 지움 표시는 404. 캐시는 늘 public.
//   Cross-Origin-Resource-Policy 는 same-site(ringside same-origin) — api.example.com 의 그림을 www.example.com 이 쓸 수 있게,
//   다른 사이트의 핫링크는 막는다(스펙 정정 — §13).
// 🔴 @Public — 전역 가드를 지나친다. 🔴 @RawResponse — 봉투를 씌우지 않는다(StreamableFile). 실패는 예외 필터가 봉투 JSON 으로.
// 🔴 ADMIN_ROUTE_MODULES 밖이라 접두사가 붙지 않는다 — 앱 전역 접두사(api)만 앞에 온다 → /api/media/...

@Public()
@RawResponse()
@Controller(MEDIA_CONTROLLER_PATH)
export class AdminMediaController {
  private readonly logger = new Logger(AdminMediaController.name)

  // 🔴 @Optional — 업로드 모듈이 없을 때 Nest 의 DI 오류 대신 AdminMediaModule.onModuleInit 의 안내 문구로 멈추게 한다(요청 전에 던진다)
  constructor(@Optional() private readonly uploads: AdminUploadsService) {}

  @Get(':purpose/:yyyy/:mm/:file')
  async get(
    @Param('purpose') purpose: string,
    @Param('yyyy') yyyy: string,
    @Param('mm') mm: string,
    @Param('file') file: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      return await this.serve(`${purpose}/${yyyy}/${mm}/${file}`, req, res)
    } catch (error) {
      // 실패는 캐시하지 않는다 — 첨부되거나 저장소가 돌아오면 바로 보이게
      res.setHeader('Cache-Control', 'no-store')
      throw error
    }
  }

  private async serve(
    key: string,
    req: Request,
    res: Response,
  ): Promise<StreamableFile | undefined> {
    if (!isUploadKey(key)) throw uploadNotFound()
    if (!(await this.uploads.isServable(key))) throw uploadNotFound()
    const etag = mediaEtag(key)
    const cacheControl = `public, max-age=${MEDIA_MAX_AGE_SECONDS}`
    if (etagMatches(req.headers['if-none-match'], etag)) {
      this.setCacheHeaders(res, cacheControl, etag)
      res.status(304)
      return undefined
    }
    const object = await this.uploads.open(key)
    if (object === null) {
      this.logger.warn(`업로드 행은 있는데 객체가 없다(${key})`)
      throw uploadNotFound()
    }
    this.setCacheHeaders(res, cacheControl, etag)
    return new StreamableFile(object.body, {
      type: 'image/webp',
      length: object.contentLength,
      disposition: 'inline',
    }).setErrorHandler((error) => {
      this.logger.warn(`미디어 스트림 오류(${key}) — ${error.message}`)
      if (!res.headersSent) res.status(503)
      res.end()
    })
  }

  private setCacheHeaders(res: Response, cacheControl: string, etag: string): void {
    res.setHeader('Cache-Control', cacheControl)
    res.setHeader('ETag', etag)
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  }
}
