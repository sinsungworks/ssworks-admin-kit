import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { ADMIN_ACCESS_POLICY, IP_ACCESS_ENABLED } from '../tokens.js'
import { IpAccessPolicy } from './ip-access.policy.js'
import { AdminIpAccessModule } from './ip-access.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = {
  'ipAccess.read': 'setting.ipAccess:read',
  'ipAccess.manage': 'setting.ipAccess:write',
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

describe('AdminIpAccessModule 배선', () => {
  it('뜨면 다섯 라우트가 /admin/ip-access 아래에 있고 쿠키 없이는 401(가드가 DB · 파이프에 닿기 전에 끝난다)', async () => {
    const server = (await boot([AdminAuthModule, AdminIpAccessModule])).getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/ip-access'],
      ['get', '/admin/ip-access/preview'],
      ['post', '/admin/ip-access'],
      ['patch', '/admin/ip-access/1'],
      ['delete', '/admin/ip-access/1'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 전역으로 정책 · 표시 토큰을 낸다 — 인증 서비스 · 역할 · 사용자 서비스가 import 순서와 무관하게 받는다', async () => {
    const app = await boot([AdminIpAccessModule, AdminAuthModule])
    expect(app.get(ADMIN_ACCESS_POLICY)).toBeInstanceOf(IpAccessPolicy)
    expect(app.get(IP_ACCESS_ENABLED)).toBe(true)
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminIpAccessModule])).rejects.toThrow(
      'AdminIpAccessModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 IP 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminIpAccessModule], { permissions: {} })).rejects.toThrow(
      'AdminIpAccessModule 의 권한 슬롯이 이어지지 않았다: ipAccess.read, ipAccess.manage',
    )
  })

  it('🔴 clientIp 오타는 기동에서 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminIpAccessModule], {
        clientIp: 'X-Real-IP' as unknown as AdminServerOptions['clientIp'],
      }),
    ).rejects.toThrow("clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.")
  })
})
