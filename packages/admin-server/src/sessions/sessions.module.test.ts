import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { AdminSessionsModule } from './sessions.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = {
  'sessions.read': 'org.users:read',
  'sessions.manage': 'org.users:write',
  'auditLogs.read': 'setting.auditLog:read',
}

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
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminSessionsModule 배선', () => {
  it('뜨면 여섯 라우트가 /admin/sessions 아래에 있고 쿠키 없이는 401', async () => {
    const app = await boot([AdminAuthModule, AdminSessionsModule])
    const server = app.getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/sessions'],
      ['get', '/admin/sessions/me'],
      ['delete', '/admin/sessions/1'],
      ['delete', '/admin/sessions/user/1'],
      ['delete', '/admin/sessions/me/1'],
      ['post', '/admin/sessions/me/revoke-others'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로(2c 스펙 §14 R2)', async () => {
    await expect(boot([AdminSessionsModule])).rejects.toThrow(
      'AdminSessionsModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminSessionsModule], { permissions: { 'auditLogs.read': 'x' } }),
    ).rejects.toThrow(
      'AdminSessionsModule 의 권한 슬롯이 이어지지 않았다: sessions.read, sessions.manage',
    )
  })

  it('감사 모듈과 함께 뜬다 — 세션 라우트의 @Audit 이 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminSessionsModule]),
    ).resolves.toBeDefined()
  })
})
