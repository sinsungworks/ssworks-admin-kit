import type { NestExpressApplication } from '@nestjs/platform-express'
import { defineAuditCatalog } from '@ssworks/admin-shared'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminClientIpSource } from '../auth/request-meta.js'
import type { AdminDbConnection } from '../database/connection.js'
import { AdminIpAccessModule } from '../ip-access/ip-access.module.js'
import { AdminLegalModule } from '../legal/legal.module.js'
import { AdminRolesModule } from '../roles/roles.module.js'
import { AdminSessionsModule } from '../sessions/sessions.module.js'
import { AdminTeamsModule } from '../teams/teams.module.js'
import { AdminUsersModule } from '../users/users.module.js'
import { TEST_CATALOG } from './accounts.js'
import { AuditProbeModule } from './audit-probe.js'
import { TEST_JWT_SECRET } from './auth.js'
import { createHttpApp } from './http.js'

// 테스트 전용 — 인증 · 감사 · 세션까지 붙인 앱(2c · 2d 역할 · 사용자 · 2e-1 팀 · 2e-2 약관 · 2f-1 IP). 운영 main.ts 와 같은 배선(configureAdminApp). 🔴 빌드에서 빠진다.

export const TEST_PERMISSIONS = Object.freeze({
  'sessions.read': 'org.users:read',
  'sessions.manage': 'org.users:write',
  'auditLogs.read': 'setting.auditLog:read',
  'roles.read': 'org.roles:read',
  'roles.manage': 'org.roles:write',
  'users.read': 'org.users:read',
  'users.manage': 'org.users:write',
  'teams.read': 'org.teams:read',
  'teams.manage': 'org.teams:write',
  'legal.read': 'setting.legal:read',
  'legal.publish': 'setting.legal:publish',
  'ipAccess.read': 'setting.ipAccess:read',
  'ipAccess.manage': 'setting.ipAccess:write',
})

/** 약관 종류(2e-2) — 쓰는 쪽 카탈로그 예시. HTTP 테스트의 모르는 종류 문구가 이 둘을 나열한다 */
export const TEST_LEGAL_KINDS = Object.freeze(['TERMS', 'PRIVACY'] as const)

/** 프로브 라우트의 액션 — 쓰는 쪽 카탈로그 병합을 그대로 탄다 */
export const TEST_AUDIT_CATALOG = defineAuditCatalog({
  actions: { PROBE_WRITE: 'probe.write' },
  targets: { PROBE: 'probe' },
  labels: { 'probe.write': '프로브 쓰기' },
  targetLabels: { probe: '프로브' },
})

export interface AdminAppOptions {
  /** 역할(2d-1) · 사용자(2d-2) 쓰기의 재인증. 기본 false */
  reauth?: boolean
  /** 사용자 날짜의 기준 시간대. 기본 Asia/Seoul */
  timeZone?: string
  /** JSON 본문 한도(configureAdminApp). 기본 1mb — 약관 4mb 확인(⑫ J1) */
  jsonLimit?: string
  /** 클라이언트 IP 출처(2f-1 ④ C1). 기본 req.ip — supertest 는 ::ffff:127.0.0.1(정규화 뒤 127.0.0.1) */
  clientIp?: AdminClientIpSource
}

export function bootAdminApp(
  db: AdminDbConnection,
  options: AdminAppOptions = {},
): Promise<NestExpressApplication> {
  return createHttpApp(
    {
      imports: [
        AdminServerModule.forRoot({
          db,
          auth: { jwtSecret: TEST_JWT_SECRET },
          permissions: TEST_PERMISSIONS,
          permissionCatalog: TEST_CATALOG,
          reauth: options.reauth ?? false,
          ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
          audit: { catalog: TEST_AUDIT_CATALOG, secretKeys: ['apiKey'] },
          legal: { kinds: TEST_LEGAL_KINDS },
          ...(options.clientIp === undefined ? {} : { clientIp: options.clientIp }),
        }),
        AdminAuthModule,
        AdminAuditModule,
        AdminSessionsModule,
        AdminRolesModule,
        AdminUsersModule,
        AdminTeamsModule,
        AdminLegalModule,
        AdminIpAccessModule,
        AuditProbeModule,
      ],
    },
    options.jsonLimit === undefined ? {} : { jsonLimit: options.jsonLimit },
  )
}
