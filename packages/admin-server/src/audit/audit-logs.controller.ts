import { Controller, Get, Query } from '@nestjs/common'
import { adminAuditLogQuerySchema, type AdminAuditLogQuery } from '@ssworks/admin-shared'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { AdminAuditLogsService } from './audit-logs.service.js'

// 정본: hangang-home apps/api/src/modules/audit-logs/audit-logs.controller.ts
// 바꾼 점: 권한은 슬롯 auditLogs.read(2c 스펙 ① P1). 🔴 @Audit 을 붙이지 않는다 — 조회 화면을 여는 것이 로그를 채운다.

@Controller('audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly logs: AdminAuditLogsService) {}

  @RequirePermissionSlot('auditLogs.read')
  @Get()
  list(@Query(new ZodValidationPipe(adminAuditLogQuerySchema)) query: AdminAuditLogQuery) {
    return this.logs.list(query)
  }
}
