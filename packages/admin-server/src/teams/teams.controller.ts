import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common'
import {
  CoreAuditActions,
  CoreAuditTargets,
  adminTeamCreateSchema,
  adminTeamMoveBodySchema,
  adminTeamRenameSchema,
} from '@ssworks/admin-shared'
import type { AdminTeamCreate, AdminTeamMoveBody, AdminTeamRename } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditDiff, attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import {
  AdminTeamsService,
  TEAM_AUDIT_FIELDS,
  TEAM_MOVE_AUDIT_FIELDS,
  TEAM_RENAME_AUDIT_FIELDS,
} from './teams.service.js'

// 정본: hangang-home apps/api/src/modules/teams/teams.controller.ts(라우트 · @Audit org.team.* · 'tree' 정적 경로)
// 바꾼 점: 권한은 슬롯(2c ① P1) — 트리는 teams.read ∨ users.read(⑥ P1, 사용자 폼의 팀 고르기). 다섯 라우트만(3d §9 — 평면
//   목록 · 단건은 화면이 쓰지 않는다). 응답은 트리 { items } · 만들기 201 { teamNo } · 나머지 {}(공통 5). 이동은 기준 형제
//   번호(3d ⑤ O3 — hangang 은 숫자 displayOrder). 삭제 감사는 함께 지운 하위 팀을 meta.descendants 로 남긴다(⑦ A1).
// 🔴 재인증 · revision 이 없다(3d §9) — reauth: true 여도 본문에 currentPassword 를 받지 않는다.

@Controller('teams')
export class AdminTeamsController {
  constructor(private readonly teams: AdminTeamsService) {}

  /** 루트 여럿, 없으면 []. 🔴 users.read 도 연다(⑥ P1) — 맵에 없는 슬롯은 거짓(2d B13) */
  @RequirePermissionSlot('teams.read', 'users.read')
  @Get('tree')
  tree() {
    return this.teams.tree()
  }

  @RequirePermissionSlot('teams.manage')
  @Audit({ action: CoreAuditActions.TEAM_CREATE, targetType: CoreAuditTargets.TEAM })
  @Post()
  async create(
    @Body(new ZodValidationPipe(adminTeamCreateSchema)) body: AdminTeamCreate,
    @Req() req: Request,
  ) {
    const { teamNo } = await this.teams.create(body)
    attachAuditTarget(req, teamNo)
    attachAuditDiff(
      req,
      null,
      { teamName: body.teamName, parentTeamNo: body.parentTeamNo },
      TEAM_AUDIT_FIELDS,
    )
    return { teamNo }
  }

  /** 'move' 를 ':teamNo' 보다 먼저 선언한다 — 경로 모양이 달라 겹치지 않지만, 읽는 사람이 헷갈리지 않게 */
  @RequirePermissionSlot('teams.manage')
  @Audit({ action: CoreAuditActions.TEAM_MOVE, targetType: CoreAuditTargets.TEAM })
  @Patch(':teamNo/move')
  async move(
    @Param('teamNo', ParseBigIntPipe) teamNo: bigint,
    @Body(new ZodValidationPipe(adminTeamMoveBodySchema)) body: AdminTeamMoveBody,
    @Req() req: Request,
  ) {
    const { before, after } = await this.teams.move(teamNo, body)
    attachAuditDiff(req, before, after, TEAM_MOVE_AUDIT_FIELDS)
    return {}
  }

  @RequirePermissionSlot('teams.manage')
  @Audit({ action: CoreAuditActions.TEAM_UPDATE, targetType: CoreAuditTargets.TEAM })
  @Patch(':teamNo')
  async rename(
    @Param('teamNo', ParseBigIntPipe) teamNo: bigint,
    @Body(new ZodValidationPipe(adminTeamRenameSchema)) body: AdminTeamRename,
    @Req() req: Request,
  ) {
    const { before } = await this.teams.rename(teamNo, body)
    attachAuditDiff(req, before, { teamName: body.teamName }, TEAM_RENAME_AUDIT_FIELDS)
    return {}
  }

  @RequirePermissionSlot('teams.manage')
  @Audit({ action: CoreAuditActions.TEAM_DELETE, targetType: CoreAuditTargets.TEAM })
  @Delete(':teamNo')
  async remove(@Param('teamNo', ParseBigIntPipe) teamNo: bigint, @Req() req: Request) {
    const { before, descendants } = await this.teams.remove(teamNo)
    attachAuditDiff(req, before, null, TEAM_AUDIT_FIELDS)
    if (descendants.length > 0) attachAuditMeta(req, { descendants })
    return {}
  }
}
