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
import { AdminRolesModule } from './roles.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = { 'roles.read': 'org.roles:read', 'roles.manage': 'org.roles:write' }

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

describe('AdminRolesModule 배선', () => {
  it('뜨면 다섯 라우트가 /admin/roles 아래에 있고 쿠키 없이는 401', async () => {
    const app = await boot([AdminAuthModule, AdminRolesModule])
    const server = app.getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/roles'],
      ['post', '/admin/roles'],
      ['patch', '/admin/roles/1'],
      ['patch', '/admin/roles/1/move'],
      ['delete', '/admin/roles/1'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminRolesModule])).rejects.toThrow(
      'AdminRolesModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 permissionCatalog 가 없으면 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminRolesModule], { permissionCatalog: undefined }),
    ).rejects.toThrow('AdminRolesModule 은 permissionCatalog 옵션이 있어야 한다')
  })

  it('🔴 슬롯 맵의 키가 카탈로그 밖이면 멈춘다(B12)', async () => {
    await expect(
      boot([AdminAuthModule, AdminRolesModule], {
        permissions: { 'roles.read': 'org.role:read', 'roles.manage': 'org.roles:write' },
      }),
    ).rejects.toThrow(
      'permissions 의 키가 permissionCatalog 에 없다(오타?): roles.read → org.role:read',
    )
  })

  it('🔴 역할 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminRolesModule], { permissions: {} })).rejects.toThrow(
      'AdminRolesModule 의 권한 슬롯이 이어지지 않았다: roles.read, roles.manage',
    )
  })

  it('감사 모듈과 함께 뜬다 — 역할 라우트의 @Audit 이 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminRolesModule], {
        permissions: { ...PERMISSIONS, 'auditLogs.read': 'setting.auditLog:read' },
      }),
    ).resolves.toBeDefined()
  })
})
