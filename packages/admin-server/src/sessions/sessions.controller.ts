import { Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import { CoreAuditActions, CoreAuditTargets } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin, SelfOnly } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import { AdminSessionsService } from './sessions.service.js'
import { adminSessionListQuerySchema } from './sessions.query.js'
import type { AdminSessionListQuery } from './sessions.query.js'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.controller.ts(경로 · @Audit 세 코드) + gise
//       admin-me.controller.ts(POST me/revoke-others · @HttpCode(200))
// 바꾼 점: 권한은 슬롯(2c 스펙 ① P1), "다른 세션 모두" 를 더했다(session.revoke.others). 경로는 RouterModule 이 /admin 을
//   붙인다. 🔴 `DELETE me/others` 로 두지 않는다 — `DELETE me/:sessionNo` 와 겹쳐 'others' 가 번호 파싱 400 이 된다.

@Controller('sessions')
export class AdminSessionsController {
  constructor(private readonly sessions: AdminSessionsService) {}

  /** 전체 목록 — 서버 페이징 · 마지막 활동 내림차순 · 검색어(3c §9) */
  @RequirePermissionSlot('sessions.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(adminSessionListQuerySchema)) query: AdminSessionListQuery,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.sessions.list(query, admin)
  }

  /** 내 세션 — 전량 { items }(3c §10) */
  @SelfOnly()
  @Get('me')
  mine(@CurrentAdmin() admin: AdminPrincipal) {
    return this.sessions.listMine(admin)
  }

  @SelfOnly()
  @Audit({ action: CoreAuditActions.SESSION_REVOKE_OTHERS, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post('me/revoke-others')
  async revokeOthers(@CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    const revokedCount = await this.sessions.revokeOthers(admin)
    attachAuditTarget(req, admin.userNo)
    attachAuditMeta(req, { revokedCount })
    return { revokedCount }
  }

  @SelfOnly()
  @Audit({ action: CoreAuditActions.SESSION_REVOKE_SELF, targetType: CoreAuditTargets.SESSION })
  @Delete('me/:sessionNo')
  async revokeMine(
    @Param('sessionNo', ParseBigIntPipe) sessionNo: bigint,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    await this.sessions.revokeMine(sessionNo, admin)
    return {}
  }

  @RequirePermissionSlot('sessions.manage')
  @Audit({ action: CoreAuditActions.SESSION_REVOKE_USER, targetType: CoreAuditTargets.USER })
  @Delete('user/:userNo')
  async revokeUser(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const revokedCount = await this.sessions.revokeUser(userNo, admin)
    attachAuditMeta(req, { revokedCount })
    return { revokedCount }
  }

  @RequirePermissionSlot('sessions.manage')
  @Audit({ action: CoreAuditActions.SESSION_REVOKE, targetType: CoreAuditTargets.SESSION })
  @Delete(':sessionNo')
  async revoke(
    @Param('sessionNo', ParseBigIntPipe) sessionNo: bigint,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    await this.sessions.revoke(sessionNo, admin)
    return {}
  }
}
