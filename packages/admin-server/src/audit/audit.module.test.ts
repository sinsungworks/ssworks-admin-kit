import { Controller, Module, Post, type ModuleMetadata } from '@nestjs/common'
import { defineAuditCatalog } from '@ssworks/admin-shared'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import { Public, SelfOnly } from '../auth/decorators.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { ADMIN_AUTH_EVENTS } from '../tokens.js'
import { Audit } from './audit.decorator.js'
import { AdminAuditModule } from './audit.module.js'
import { AdminAuditEventSink } from './auth-events.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = {
  'sessions.read': 'org.users:read',
  'sessions.manage': 'org.users:write',
  'auditLogs.read': 'setting.auditLog:read',
}

@Controller('badaction')
class BadActionController {
  @SelfOnly()
  @Audit({ action: 'nope.action' })
  @Post()
  write() {
    return {}
  }
}

@Public()
@Controller('publicaudit')
class PublicAuditController {
  @Audit({ action: 'session.revoke' })
  @Post()
  write() {
    return {}
  }
}

@Controller('projectaudit')
class ProjectAuditController {
  @SelfOnly()
  @Audit({ action: 'probe.write' })
  @Post()
  write() {
    return {}
  }
}

@Module({ controllers: [BadActionController] })
class BadActionModule {}

@Module({ controllers: [PublicAuditController] })
class PublicAuditModule {}

@Module({ controllers: [ProjectAuditController] })
class ProjectAuditModule {}

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

describe('AdminAuditModule 배선', () => {
  it('뜨면 ADMIN_AUTH_EVENTS 가 sink 이고 조회 라우트는 쿠키 없이 401', async () => {
    const app = await boot([AdminAuthModule, AdminAuditModule])
    expect(app.get(ADMIN_AUTH_EVENTS, { strict: false })).toBeInstanceOf(AdminAuditEventSink)
    const response = await request(app.getHttpServer()).get('/admin/audit-logs')
    expect(response.status).toBe(401)
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다', async () => {
    await expect(boot([AdminAuditModule])).rejects.toThrow(
      'AdminAuditModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 auditLogs.read 슬롯이 없으면 뜨지 않는다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule], { permissions: { 'sessions.read': 'x' } }),
    ).rejects.toThrow('AdminAuditModule 의 권한 슬롯이 이어지지 않았다: auditLogs.read')
  })

  it('🔴 카탈로그에 없는 액션을 단 @Audit 이 있으면 뜨지 않는다 — 쓰는 쪽 컨트롤러까지 훑는다', async () => {
    await expect(boot([AdminAuthModule, AdminAuditModule, BadActionModule])).rejects.toThrow(
      "BadActionController.write: 카탈로그에 없는 액션 'nope.action'",
    )
  })

  it('🔴 @Public 라우트의 @Audit 은 뜨지 않는다(B11)', async () => {
    await expect(boot([AdminAuthModule, AdminAuditModule, PublicAuditModule])).rejects.toThrow(
      'PublicAuditController.write: @Public 라우트의 @Audit 은 기록되지 않는다',
    )
  })

  it('프로젝트 카탈로그를 넘기면 그 액션으로 뜬다', async () => {
    const catalog = defineAuditCatalog({
      actions: { PROBE_WRITE: 'probe.write' },
      labels: { 'probe.write': '프로브' },
    })
    await expect(
      boot([AdminAuthModule, AdminAuditModule, ProjectAuditModule], { audit: { catalog } }),
    ).resolves.toBeDefined()
  })
})
