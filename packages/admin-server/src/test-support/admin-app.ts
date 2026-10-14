import type { NestExpressApplication } from '@nestjs/platform-express'
import { defineAuditCatalog } from '@ssworks/admin-shared'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminDbConnection } from '../database/connection.js'
import { AdminSessionsModule } from '../sessions/sessions.module.js'
import { AuditProbeModule } from './audit-probe.js'
import { TEST_JWT_SECRET } from './auth.js'
import { createHttpApp } from './http.js'

// 테스트 전용 — 인증 · 감사 · 세션까지 붙인 앱(2c). 운영 main.ts 와 같은 배선(configureAdminApp). 🔴 빌드에서 빠진다.

export const TEST_PERMISSIONS = Object.freeze({
  'sessions.read': 'org.users:read',
  'sessions.manage': 'org.users:write',
  'auditLogs.read': 'setting.auditLog:read',
})

/** 프로브 라우트의 액션 — 쓰는 쪽 카탈로그 병합을 그대로 탄다 */
export const TEST_AUDIT_CATALOG = defineAuditCatalog({
  actions: { PROBE_WRITE: 'probe.write' },
  targets: { PROBE: 'probe' },
  labels: { 'probe.write': '프로브 쓰기' },
  targetLabels: { probe: '프로브' },
})

export function bootAdminApp(db: AdminDbConnection): Promise<NestExpressApplication> {
  return createHttpApp({
    imports: [
      AdminServerModule.forRoot({
        db,
        auth: { jwtSecret: TEST_JWT_SECRET },
        permissions: TEST_PERMISSIONS,
        audit: { catalog: TEST_AUDIT_CATALOG, secretKeys: ['apiKey'] },
      }),
      AdminAuthModule,
      AdminAuditModule,
      AdminSessionsModule,
      AuditProbeModule,
    ],
  })
}
