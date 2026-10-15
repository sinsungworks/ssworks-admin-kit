import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common'
import { CoreAuditActions, CoreAuditTargets } from '@ssworks/admin-shared'
import type { AdminLegalPublish } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe } from '../http/pipes.js'
import { LegalKindQueryPipe, LegalPublishBodyPipe } from './legal.body.js'
import type { LegalKindQuery } from './legal.body.js'
import { AdminLegalService } from './legal.service.js'

// 정본: ssworks-gise-home apps/api/src/modules/legal/admin-legal.controller.ts(네 라우트 · 고정 경로를 번호 경로 앞에) +
//       ssworks-axion-admin legal.controller.ts(GET / 이 이력 · 발행 응답)
// 바꾼 점: 권한은 슬롯(2c ① P1 — gise SETTING_LEGAL_READ · PUBLISH 가 그대로 두 슬롯). 현재본은 `current` 경로 + { item | null }
//   (gise 는 GET / 이 현재본 · /history 가 이력이었다 — 3e §9 계약은 axion 처럼 GET / 이 이력). 종류는 옵션 열거(B14).
//   발행 감사 setting.legal.publish(공통 2).
// 🔴 `current` 를 `:legalDocNo` 보다 먼저 선언한다 — 뒤집히면 'current' 가 번호 경로로 잡혀 ParseBigIntPipe 400 이 난다(gise).
// 🔴 수정 · 삭제 라우트가 없다 — append-only(공통 11).
// 🔴 감사 meta 에 본문을 싣지 않는다(공통 12) — 종류 · 기준 판 · 해시 · 길이만. 감사 행은 가방에 붙인 값만 기록하고 요청
//    본문을 담지 않는다(2c 인터셉터).

@Controller('legal-documents')
export class AdminLegalController {
  constructor(private readonly legal: AdminLegalService) {}

  /** 시행본 — 미발행이면 { item: null }(3e D15) */
  @RequirePermissionSlot('legal.read')
  @Get('current')
  current(@Query(LegalKindQueryPipe) query: LegalKindQuery) {
    return this.legal.current(query.kind)
  }

  /** 발행 이력 최신순 전량 — 본문 없음 */
  @RequirePermissionSlot('legal.read')
  @Get()
  history(@Query(LegalKindQueryPipe) query: LegalKindQuery) {
    return this.legal.history(query.kind)
  }

  /** 판 하나(본문 포함) — 문서 그대로(3e §9 — `{ item }` 이 아니다) */
  @RequirePermissionSlot('legal.read')
  @Get(':legalDocNo')
  findOne(@Param('legalDocNo', ParseBigIntPipe) legalDocNo: bigint) {
    return this.legal.findOne(legalDocNo)
  }

  @RequirePermissionSlot('legal.publish')
  @Audit({ action: CoreAuditActions.LEGAL_PUBLISH, targetType: CoreAuditTargets.LEGAL_DOCUMENT })
  @Post()
  async publish(
    @Body(LegalPublishBodyPipe) body: AdminLegalPublish,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const result = await this.legal.publish(body, admin.userNo)
    attachAuditTarget(req, result.legalDocNo)
    attachAuditMeta(req, {
      kind: body.kind,
      baseLegalDocNo: body.baseLegalDocNo,
      contentHash: result.contentHash,
      length: body.body.length,
    })
    return result
  }
}
