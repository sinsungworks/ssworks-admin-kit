import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { AdminUploadsModule } from '../uploads/uploads.module.js'
import { AdminMediaModule } from './media.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
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
        uploads: { storage: new MemoryObjectStorage(), sweep: false },
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminMediaModule 배선(스펙 U5)', () => {
  it('🔴 접두사 밖 · 공개 — /media/… 는 쿠키 없이 닿고, 키 모양이 아니면 DB 를 읽지 않고 404 + no-store', async () => {
    const server = (
      await boot([AdminAuthModule, AdminUploadsModule, AdminMediaModule])
    ).getHttpServer()
    const response = await request(server).get('/media/legal/2026/11/short.webp')
    expect(response.status).toBe(404)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.body).toMatchObject({ success: false, code: 'ERR_UPLOAD_NOT_FOUND' })
    expect((await request(server).get('/admin/media/legal/2026/11/short.webp')).status).toBe(404)
  })

  it('🔴 AdminUploadsModule 없이는 뜨지 않는다', async () => {
    await expect(boot([AdminAuthModule, AdminMediaModule], { uploads: undefined })).rejects.toThrow(
      'AdminMediaModule 은 AdminUploadsModule 이 있어야 한다',
    )
  })
})
