import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import { AdminLegalModule } from '../legal/legal.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { AdminUploadsModule } from './uploads.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = {
  'legal.read': 'setting.legal:read',
  'legal.publish': 'setting.legal:publish',
  'auditLogs.read': 'setting.auditLog:read',
}
const storage = new MemoryObjectStorage()
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
        legal: { kinds: ['TERMS'] },
        uploads: { storage, sweep: false },
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminUploadsModule 배선(스펙 U7 · §4-2)', () => {
  it('뜨면 두 라우트가 /admin/uploads 아래에 있고 쿠키 없이는 401(가드가 본문 · DB 에 닿기 전에 끝난다)', async () => {
    const server = (await boot([AdminAuthModule, AdminUploadsModule])).getHttpServer()
    expect(
      (
        await request(server)
          .post('/admin/uploads?purpose=legal')
          .set('Content-Type', 'image/png')
          .send(Buffer.from('x'))
      ).status,
    ).toBe(401)
    expect(
      (await request(server).delete('/admin/uploads/legal/2026/11/' + 'A'.repeat(32) + '.webp'))
        .status,
    ).toBe(401)
    expect((await request(server).get('/admin/uploads')).status).toBe(404)
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다', async () => {
    await expect(boot([AdminUploadsModule])).rejects.toThrow(
      'AdminUploadsModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 uploads 옵션이 없으면 기동에서 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminUploadsModule], { uploads: undefined }),
    ).rejects.toThrow('AdminUploadsModule 은 uploads 옵션이 있어야 한다')
  })

  it('약관 모듈이 있으면 legal 용도가 자동 — 앱이 같은 이름을 적으면 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminLegalModule, AdminUploadsModule]),
    ).resolves.toBeDefined()
    await expect(
      boot([AdminAuthModule, AdminLegalModule, AdminUploadsModule], {
        uploads: { storage, sweep: false, purposes: { legal: { slot: 'legal.publish' } } },
      }),
    ).rejects.toThrow('legal 용도는 AdminLegalModule 이 자동으로 등록한다')
  })

  it('약관 모듈이 없으면 앱이 legal 용도를 적어도 된다(다른 권한으로)', async () => {
    await expect(
      boot([AdminAuthModule, AdminUploadsModule], {
        uploads: { storage, sweep: false, purposes: { legal: { permissions: ['x:y'] } } },
      }),
    ).resolves.toBeDefined()
  })

  it('🔴 mediaPath · 슬롯 오류는 기동에서', async () => {
    await expect(
      boot([AdminAuthModule, AdminUploadsModule], {
        uploads: { storage, sweep: false, mediaPath: '/api/files' },
      }),
    ).rejects.toThrow("uploads.mediaPath 는 '/media' 로 끝나는 경로여야 한다")
    await expect(
      boot([AdminAuthModule, AdminUploadsModule], {
        uploads: { storage, sweep: false, purposes: { notice: { slot: 'teams.manage' } } },
      }),
    ).rejects.toThrow('슬롯 teams.manage 가 permissions 에 이어지지 않았다')
  })

  it('감사 모듈과 함께 뜬다 — upload.create · upload.delete 가 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminUploadsModule]),
    ).resolves.toBeDefined()
  })
})
