import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { AdminRolesModule } from '../roles/roles.module.js'
import { TEST_CATALOG } from '../test-support/accounts.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { AdminUsersModule } from './users.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = { 'users.read': 'org.users:read', 'users.manage': 'org.users:write' }

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

describe('AdminUsersModule 배선', () => {
  it('뜨면 열 라우트가 /admin/users 아래에 있고 쿠키 없이는 401(가드가 DB 에 닿기 전에 끝난다)', async () => {
    const app = await boot([AdminAuthModule, AdminUsersModule])
    const server = app.getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/users'],
      ['get', '/admin/users/1'],
      ['get', '/admin/users/1/employment-periods'],
      ['post', '/admin/users'],
      ['patch', '/admin/users/1'],
      ['post', '/admin/users/1/resign'],
      ['patch', '/admin/users/1/resign-date'],
      ['post', '/admin/users/1/rehire'],
      ['post', '/admin/users/1/password-reset'],
      ['post', '/admin/users/1/unlock'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminUsersModule])).rejects.toThrow(
      'AdminUsersModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 permissionCatalog 가 없으면 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminUsersModule], { permissionCatalog: undefined }),
    ).rejects.toThrow('AdminUsersModule 은 permissionCatalog 옵션이 있어야 한다')
  })

  it('🔴 timeZone 이 IANA 이름이 아니면 멈춘다(B15 — 오프셋 표기 · 오타)', async () => {
    for (const timeZone of ['+09:00', 'Asia/Seoull']) {
      await expect(
        boot([AdminAuthModule, AdminUsersModule], { timeZone }),
        timeZone,
      ).rejects.toThrow('timeZone 은 IANA 시간대 이름이어야 한다')
    }
  })

  it('🔴 사용자 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminUsersModule], { permissions: {} })).rejects.toThrow(
      'AdminUsersModule 의 권한 슬롯이 이어지지 않았다: users.read, users.manage',
    )
  })

  it('역할 · 감사 모듈과 함께 뜬다 — 사용자 @Audit 액션이 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminRolesModule, AdminUsersModule], {
        permissions: {
          ...PERMISSIONS,
          'roles.read': 'org.roles:read',
          'roles.manage': 'org.roles:write',
          'auditLogs.read': 'setting.auditLog:read',
        },
      }),
    ).resolves.toBeDefined()
  })
})
