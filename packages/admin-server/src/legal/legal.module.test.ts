import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { AdminLegalModule } from './legal.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = { 'legal.read': 'setting.legal:read', 'legal.publish': 'setting.legal:publish' }
const LEGAL = { kinds: ['TERMS', 'PRIVACY'] }

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
        legal: LEGAL,
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminLegalModule 배선', () => {
  it('뜨면 네 라우트가 /admin/legal-documents 아래에 있고 쿠키 없이는 401(가드가 DB · 파이프에 닿기 전에 끝난다)', async () => {
    const server = (await boot([AdminAuthModule, AdminLegalModule])).getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/legal-documents/current?kind=TERMS'],
      ['get', '/admin/legal-documents/current'],
      ['get', '/admin/legal-documents?kind=TERMS'],
      ['get', '/admin/legal-documents/1'],
      ['post', '/admin/legal-documents'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 수정 · 삭제 라우트가 없다 — PATCH · PUT · DELETE 는 404(append-only, 공통 11)', async () => {
    const server = (await boot([AdminAuthModule, AdminLegalModule])).getHttpServer()
    for (const method of ['patch', 'put', 'delete'] as const) {
      const response = await request(server)[method]('/admin/legal-documents/1')
      expect(response.status, method).toBe(404)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminLegalModule])).rejects.toThrow(
      'AdminLegalModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 약관 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminLegalModule], { permissions: {} })).rejects.toThrow(
      'AdminLegalModule 의 권한 슬롯이 이어지지 않았다: legal.read, legal.publish',
    )
  })

  it('🔴 legal 옵션이 없거나 형식 밖이면 기동에서 멈춘다(B14 · §5-8)', async () => {
    await expect(boot([AdminAuthModule, AdminLegalModule], { legal: undefined })).rejects.toThrow(
      'AdminLegalModule 은 legal 옵션이 있어야 한다',
    )
    await expect(
      boot([AdminAuthModule, AdminLegalModule], {
        legal: { kinds: ['TERMS', 'TERMS', 'bad kind'] },
      }),
    ).rejects.toThrow(
      `AdminLegalModule 의 legal 옵션이 맞지 않다 — legal.kinds 에 겹친 종류: TERMS / legal.kinds[2] — 영숫자 · '_' 1~32자가 아니다: "bad kind"`,
    )
  })

  it('permissionCatalog 없이도 뜬다 — 약관 모듈은 카탈로그를 읽지 않는다(§4-4)', async () => {
    await expect(boot([AdminAuthModule, AdminLegalModule])).resolves.toBeDefined()
  })

  it('감사 모듈과 함께 뜬다 — 약관 @Audit 액션이 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminLegalModule], {
        permissions: { ...PERMISSIONS, 'auditLogs.read': 'setting.auditLog:read' },
      }),
    ).resolves.toBeDefined()
  })
})
