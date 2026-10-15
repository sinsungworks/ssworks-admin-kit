import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import {
  CoreAuditActions,
  CoreAuditTargets,
  adminIpPreviewQuerySchema,
} from '@ssworks/admin-shared'
import type { AdminIpPreviewQuery } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditDiff, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import {
  IpRuleCreateBodyPipe,
  IpRuleRemoveBodyPipe,
  IpRuleUpdateBodyPipe,
} from './ip-access.body.js'
import { AdminIpAccessService, IP_RULE_AUDIT_FIELDS } from './ip-access.service.js'
import type {
  AdminIpRuleCreateBody,
  AdminIpRuleRemoveBody,
  AdminIpRuleUpdateBody,
} from './ip-access.service.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.controller.ts(다섯 라우트 · 미리보기는 :write · 재인증 본문)
// 바꾼 점: 권한은 슬롯(ipAccess.read · ipAccess.manage), 응답은 만들기 201 { item } · 수정 { item } · 삭제 {}, 수정 · 삭제 본문에
//   revision, 미리보기 응답 clientIp · clientPasses(hangang actorIp · actorPasses). 감사 diff 는 서비스가 커밋한 뒤에 붙인다 —
//   409 로 롤백된 쓰기의 감사 행 meta 는 null 이다.

@Controller('ip-access')
export class AdminIpAccessController {
  constructor(private readonly rules: AdminIpAccessService) {}

  @RequirePermissionSlot('ipAccess.read')
  @Get()
  list() {
    return this.rules.list()
  }

  /** 🔴 manage 슬롯이다 — 남의 접속 주소와 요청자 자신의 IP 를 내보인다(hangang). 잠금 · 감사 · 재인증 없음 */
  @RequirePermissionSlot('ipAccess.manage')
  @Get('preview')
  preview(
    @Query(new ZodValidationPipe(adminIpPreviewQuerySchema)) query: AdminIpPreviewQuery,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    return this.rules.preview(query, admin, this.rules.clientIpOf(req))
  }

  @RequirePermissionSlot('ipAccess.manage')
  @Audit({ action: CoreAuditActions.IP_ACCESS_CREATE, targetType: CoreAuditTargets.IP_ACCESS_RULE })
  @Post()
  async create(
    @Body(IpRuleCreateBodyPipe) body: AdminIpRuleCreateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item } = await this.rules.create(body, admin, this.rules.clientIpOf(req))
    attachAuditTarget(req, item.ruleNo)
    attachAuditDiff(req, null, item, IP_RULE_AUDIT_FIELDS)
    return { item }
  }

  @RequirePermissionSlot('ipAccess.manage')
  @Audit({ action: CoreAuditActions.IP_ACCESS_UPDATE, targetType: CoreAuditTargets.IP_ACCESS_RULE })
  @Patch(':ruleNo')
  async update(
    @Param('ruleNo', ParseBigIntPipe) ruleNo: bigint,
    @Body(IpRuleUpdateBodyPipe) body: AdminIpRuleUpdateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, after } = await this.rules.update(
      ruleNo,
      body,
      admin,
      this.rules.clientIpOf(req),
    )
    attachAuditDiff(req, before, after, IP_RULE_AUDIT_FIELDS)
    return { item }
  }

  /** 🔴 지운 규칙은 감사 before 로만 복원된다 */
  @RequirePermissionSlot('ipAccess.manage')
  @Audit({ action: CoreAuditActions.IP_ACCESS_DELETE, targetType: CoreAuditTargets.IP_ACCESS_RULE })
  @Delete(':ruleNo')
  async remove(
    @Param('ruleNo', ParseBigIntPipe) ruleNo: bigint,
    @Body(IpRuleRemoveBodyPipe) body: AdminIpRuleRemoveBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { before } = await this.rules.remove(ruleNo, body, admin, this.rules.clientIpOf(req))
    attachAuditDiff(req, before, null, IP_RULE_AUDIT_FIELDS)
    return {}
  }
}
