import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common'
import { CoreAuditActions, CoreAuditTargets, adminRoleMoveSchema } from '@ssworks/admin-shared'
import type { AdminRoleMove } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditDiff, attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import { RoleCreateBodyPipe, RoleRemoveBodyPipe, RoleUpdateBodyPipe } from './roles.body.js'
import { AdminRolesService, ROLE_AUDIT_FIELDS } from './roles.service.js'
import type {
  AdminRoleCreateBody,
  AdminRoleRemoveBody,
  AdminRoleUpdateBody,
} from './roles.service.js'

// 정본: hangang-home apps/api/src/modules/roles/roles.controller.ts(다섯 라우트 · @Audit · 재인증 본문 · 이동 분리)
// 바꾼 점: 권한은 슬롯(2c ① P1), 목록은 전량(3b §9), 응답은 만들기 { roleNo } · 수정 { item } · 이동 · 삭제 {}(§2-2 공통 10),
//   DELETE 본문에 revision(3b — hangang 은 재인증만).

@Controller('roles')
export class AdminRolesController {
  constructor(private readonly roles: AdminRolesService) {}

  /** 전량 · displayOrder 순(3b §9). 2d-2 가 users.read 를 더한다(⑪ L1 — 사용자 폼의 역할 고르기) */
  @RequirePermissionSlot('roles.read')
  @Get()
  list() {
    return this.roles.list()
  }

  @RequirePermissionSlot('roles.manage')
  @Audit({ action: CoreAuditActions.ROLE_CREATE, targetType: CoreAuditTargets.ROLE })
  @Post()
  async create(
    @Body(RoleCreateBodyPipe) body: AdminRoleCreateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { roleNo, after } = await this.roles.create(body, admin)
    attachAuditTarget(req, roleNo)
    attachAuditDiff(req, null, after, ROLE_AUDIT_FIELDS)
    return { roleNo }
  }

  /** 🔴 재인증 · revision 없음(3b D1). 목표값은 이웃의 displayOrder(admin-ui useRoleEditor) */
  @RequirePermissionSlot('roles.manage')
  @Audit({ action: CoreAuditActions.ROLE_MOVE, targetType: CoreAuditTargets.ROLE })
  @Patch(':roleNo/move')
  async move(
    @Param('roleNo', ParseBigIntPipe) roleNo: bigint,
    @Body(new ZodValidationPipe(adminRoleMoveSchema)) body: AdminRoleMove,
    @Req() req: Request,
  ) {
    attachAuditMeta(req, await this.roles.move(roleNo, body.displayOrder))
    return {}
  }

  @RequirePermissionSlot('roles.manage')
  @Audit({ action: CoreAuditActions.ROLE_UPDATE, targetType: CoreAuditTargets.ROLE })
  @Patch(':roleNo')
  async update(
    @Param('roleNo', ParseBigIntPipe) roleNo: bigint,
    @Body(RoleUpdateBodyPipe) body: AdminRoleUpdateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, after } = await this.roles.update(roleNo, body, admin)
    attachAuditDiff(req, before, after, ROLE_AUDIT_FIELDS)
    return { item }
  }

  @RequirePermissionSlot('roles.manage')
  @Audit({ action: CoreAuditActions.ROLE_DELETE, targetType: CoreAuditTargets.ROLE })
  @Delete(':roleNo')
  async remove(
    @Param('roleNo', ParseBigIntPipe) roleNo: bigint,
    @Body(RoleRemoveBodyPipe) body: AdminRoleRemoveBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { before } = await this.roles.remove(roleNo, body, admin)
    attachAuditDiff(req, before, null, ROLE_AUDIT_FIELDS)
    return {}
  }
}
