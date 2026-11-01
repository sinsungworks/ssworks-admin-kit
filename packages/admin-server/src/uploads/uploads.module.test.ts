import { Logger, type ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import { AdminLegalModule } from '../legal/legal.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import type { SweepResult } from './sweep.js'
import { AdminUploadsModule } from './uploads.module.js'
import { AdminUploadsService } from './uploads.service.js'

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
  vi.useRealTimers()
  vi.restoreAllMocks()
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

describe('AdminUploadsModule 정리 주기(스펙 U11)', () => {
  const EMPTY_SWEEP: SweepResult = { marked: 0, deleted: 0, failed: 0 }

  it('정리 주기 — sweep: false 면 타이머가 없고, 켜면 onApplicationBootstrap 에서 걸리고 close 에서 풀린다', async () => {
    const off = await boot([AdminAuthModule, AdminUploadsModule])
    expect((off.get(AdminUploadsModule) as unknown as { timer: unknown }).timer).toBeNull()
    const on = await boot([AdminAuthModule, AdminUploadsModule], {
      uploads: { storage, sweep: { intervalMinutes: 60 } },
    })
    const module = on.get(AdminUploadsModule) as unknown as { timer: unknown }
    expect(module.timer).not.toBeNull()
    await on.close()
    apps.splice(apps.indexOf(on), 1)
    expect(module.timer).toBeNull()
  })

  it('🔴 정리 틱이 겹치면 건너뛴다(running) — sweep 이 끝나기 전 두 번째 틱은 sweep 을 다시 부르지 않는다', async () => {
    // 가짜는 setInterval · clearInterval 만 — 부팅 · 풀의 setTimeout · 마이크로태스크는 그대로 돈다
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const app = await boot([AdminAuthModule, AdminUploadsModule], {
      uploads: { storage, sweep: { intervalMinutes: 1 } },
    })
    const module = app.get(AdminUploadsModule) as unknown as { running: boolean }
    const settles: ((error?: Error) => void)[] = []
    const sweep = vi.spyOn(app.get(AdminUploadsService), 'sweep').mockImplementation(
      () =>
        new Promise<SweepResult>((resolve, reject) => {
          settles.push((error) => (error ? reject(error) : resolve(EMPTY_SWEEP)))
        }),
    )
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    /** finally 까지 — setImmediate 는 가짜가 아니라 마이크로태스크를 다 비운 뒤에 온다 */
    const drain = () => new Promise((resolve) => setImmediate(resolve))

    vi.advanceTimersByTime(60_000)
    expect(sweep).toHaveBeenCalledTimes(1)
    expect(module.running).toBe(true)
    vi.advanceTimersByTime(60_000)
    vi.advanceTimersByTime(60_000)
    expect(sweep).toHaveBeenCalledTimes(1)

    settles[0]?.()
    await drain()
    expect(module.running).toBe(false)
    vi.advanceTimersByTime(60_000)
    expect(sweep).toHaveBeenCalledTimes(2)

    // 실패한 회차도 플래그를 푼다 — 경고 한 줄, 다음 틱은 다시 돈다
    settles[1]?.(new Error('풀 고갈'))
    await drain()
    expect(module.running).toBe(false)
    expect(warn.mock.calls).toEqual([['업로드 정리 실패 — 풀 고갈']])
    vi.advanceTimersByTime(60_000)
    expect(sweep).toHaveBeenCalledTimes(3)
    settles[2]?.()
    await drain()
  })
})
