import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_CATALOG } from '../test-support/accounts.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { AdminTeamsModule } from './teams.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = { 'teams.read': 'org.teams:read', 'teams.manage': 'org.teams:write' }

const apps: { close(): Promise<void> }[] = []

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
})

async function boot(imports: ModuleMetadata['imports'], options: Partial<AdminServerOptions> = {}) {
  const app = await createHttpApp({
    imports: [
      AdminServerModule.forRoot({
        db: unreachable,
        auth: { jwtSecret: TEST_JWT_SECRET },
        permissions: PERMISSIONS,
        permissionCatalog: TEST_CATALOG,
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminTeamsModule 배선', () => {
  it('뜨면 다섯 라우트가 /admin/teams 아래에 있고 쿠키 없이는 401(가드가 DB 에 닿기 전에 끝난다)', async () => {
    const app = await boot([AdminAuthModule, AdminTeamsModule])
    const server = app.getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/teams/tree'],
      ['post', '/admin/teams'],
      ['patch', '/admin/teams/1'],
      ['patch', '/admin/teams/1/move'],
      ['delete', '/admin/teams/1'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminTeamsModule])).rejects.toThrow(
      'AdminTeamsModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 팀 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminTeamsModule], { permissions: {} })).rejects.toThrow(
      'AdminTeamsModule 의 권한 슬롯이 이어지지 않았다: teams.read, teams.manage',
    )
  })

  it('permissionCatalog 없이도 뜬다 — 팀 모듈은 카탈로그를 읽지 않는다(§4-4)', async () => {
    await expect(
      boot([AdminAuthModule, AdminTeamsModule], { permissionCatalog: undefined }),
    ).resolves.toBeDefined()
  })

  it('감사 모듈과 함께 뜬다 — 팀 @Audit 액션이 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminTeamsModule], {
        permissions: { ...PERMISSIONS, 'auditLogs.read': 'setting.auditLog:read' },
      }),
    ).resolves.toBeDefined()
  })
})
