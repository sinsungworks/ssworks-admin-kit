import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { CoreAuditActions, CoreAuditTargets } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditDiff, attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import { REHIRE_AUDIT_FIELDS, RESIGN_AUDIT_FIELDS, USER_AUDIT_FIELDS } from './user-view.js'
import {
  UserCreateBodyPipe,
  UserReauthBodyPipe,
  UserRehireBodyPipe,
  UserResignBodyPipe,
  UserResignDateBodyPipe,
  UserUpdateBodyPipe,
} from './users.body.js'
import { adminUserListQuerySchema } from './users.query.js'
import type { AdminUserListQuery } from './users.query.js'
import { AdminUsersService } from './users.service.js'
import type {
  AdminUserCreateBody,
  AdminUserReauthBody,
  AdminUserRehireBody,
  AdminUserResignBody,
  AdminUserResignDateBody,
  AdminUserUpdateBody,
} from './users.service.js'

// 정본: hangang-home apps/api/src/modules/users/users.controller.ts(라우트 · @Audit · 퇴사 · 재입사 · 퇴사일 분리) +
//       ssworks-gise-home 계정 컨트롤러(초기화 · 잠금 해제 · 생성 응답의 임시 비밀번호)
// 바꾼 점: 권한은 슬롯(2c ① P1). 응답은 만들기 201 { item, temporaryPassword } · 수정 · 퇴사 · 퇴사일 · 재입사 { item } ·
//   초기화 { temporaryPassword } · 잠금 해제 {}(§2-2 공통 10). 상태를 바꾸는 POST 는 200 이다(생성이 아니다).
// 🔴 임시 비밀번호는 응답에만 — attachAuditMeta · attachAuditDiff 에 넘기지 않는다(공통 11). 넘겨도 감사 소독이 가리지만
//    이것이 1차 방어선이다.

@Controller('users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /** 서버 페이징 · 팀(하위 팀) · 상태 · 검색어 — 3d TeamUserList 어댑터가 부른다 */
  @RequirePermissionSlot('users.read')
  @Get()
  list(@Query(new ZodValidationPipe(adminUserListQuerySchema)) query: AdminUserListQuery) {
    return this.users.list(query)
  }

  @RequirePermissionSlot('users.read')
  @Get(':userNo/employment-periods')
  periods(@Param('userNo', ParseBigIntPipe) userNo: bigint) {
    return this.users.periods(userNo)
  }

  @RequirePermissionSlot('users.read')
  @Get(':userNo')
  async findOne(@Param('userNo', ParseBigIntPipe) userNo: bigint) {
    return { item: await this.users.findOne(userNo) }
  }

  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_CREATE, targetType: CoreAuditTargets.USER })
  @Post()
  async create(
    @Body(UserCreateBodyPipe) body: AdminUserCreateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, temporaryPassword } = await this.users.create(body, admin)
    attachAuditTarget(req, item.userNo)
    attachAuditDiff(req, null, item, USER_AUDIT_FIELDS)
    return { item, temporaryPassword }
  }

  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_UPDATE, targetType: CoreAuditTargets.USER })
  @Patch(':userNo')
  async update(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserUpdateBodyPipe) body: AdminUserUpdateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before } = await this.users.update(userNo, body, admin)
    attachAuditDiff(req, before, item, USER_AUDIT_FIELDS)
    return { item }
  }

  /** 퇴사일 당일까지 근무한다 — 지금 막으려면 어제 날짜(⑤ Z1) */
  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_RESIGN, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post(':userNo/resign')
  async resign(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserResignBodyPipe) body: AdminUserResignBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, meta } = await this.users.resign(userNo, body, admin)
    attachAuditDiff(req, before, item, RESIGN_AUDIT_FIELDS)
    attachAuditMeta(req, meta)
    return { item }
  }

  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_RESIGN_DATE_UPDATE, targetType: CoreAuditTargets.USER })
  @Patch(':userNo/resign-date')
  async correctResignDate(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserResignDateBodyPipe) body: AdminUserResignDateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, meta } = await this.users.correctResignDate(userNo, body, admin)
    attachAuditDiff(req, before, item, RESIGN_AUDIT_FIELDS)
    attachAuditMeta(req, meta)
    return { item }
  }

  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_REHIRE, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post(':userNo/rehire')
  async rehire(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserRehireBodyPipe) body: AdminUserRehireBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, meta } = await this.users.rehire(userNo, body, admin)
    attachAuditDiff(req, before, item, REHIRE_AUDIT_FIELDS)
    attachAuditMeta(req, meta)
    return { item }
  }

  /** 🔴 임시 비밀번호는 응답에만 — 감사 meta 는 끊은 세션 수뿐 */
  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_PASSWORD_RESET, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post(':userNo/password-reset')
  async resetPassword(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserReauthBodyPipe) body: AdminUserReauthBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { temporaryPassword, revokedCount } = await this.users.resetPassword(userNo, body, admin)
    attachAuditMeta(req, { revokedCount })
    return { temporaryPassword }
  }

  /** 잠기지 않아도 200(B16). 감사 meta 는 풀기 전 값 */
  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_UNLOCK, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post(':userNo/unlock')
  async unlock(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserReauthBodyPipe) body: AdminUserReauthBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    attachAuditMeta(req, await this.users.unlock(userNo, body, admin))
    return {}
  }
}
