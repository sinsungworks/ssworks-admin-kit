import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { CommonErrorCodes, errorRespSchema } from '@ssworks/admin-shared'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { bootAuthApp } from '../test-support/auth-probe.js'
import { createHttpApp } from '../test-support/http.js'
import { AUTH_REPOSITORY, KYSELY } from '../tokens.js'
import { AdminAuthModule } from './admin-auth.module.js'
import type { AdminAuthRepository } from './auth.repository.js'
import { AUTH_MESSAGES } from './errors.js'

// DB 없는 HTTP 층 — DB 에 닿기 전에 끝나는 경로만 잰다(스펙 §9-2). KYSELY 는 가짜다.

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const fakeKysely = () => ({ destroy: vi.fn(async () => undefined) })

let app: NestExpressApplication

beforeAll(async () => {
  app = await bootAuthApp({
    db: unreachable,
    override: (builder) => builder.overrideProvider(KYSELY).useValue(fakeKysely()),
  })
})

afterAll(async () => {
  await app?.close()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function expectError(body: unknown, code: string, message?: string) {
  const parsed = errorRespSchema.parse(body)
  expect(parsed.code).toBe(code)
  if (message !== undefined) expect(parsed.message).toBe(message)
}

describe('라우트 자리', () => {
  it('/admin/auth/login 에 있고 본문을 검증한다 — 400 · path 배열', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ userId: '', password: 1 })
      .expect(400)
    expectError(response.body, CommonErrorCodes.ERR_COMMON_VALIDATION)
    const paths = (response.body.details.issues as { path: unknown[] }[]).map((issue) => issue.path)
    expect(paths).toEqual(expect.arrayContaining([['userId'], ['password']]))
  })

  it('prefix 없는 /auth/login 은 없다', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({}).expect(404)
  })
})

describe('🔴 앱 전역 가드(스펙 ② G1) — 다른 모듈의 라우트에도 걸린다', () => {
  it('@Public 은 쿠키 없이 200', async () => {
    await request(app.getHttpServer()).get('/authprobe/public').expect(200)
  })

  it('표시 없는 라우트 · /me 는 쿠키 없이 401 ERR_COMMON_UNAUTHORIZED', async () => {
    for (const path of ['/authprobe/undeclared', '/admin/auth/me']) {
      const response = await request(app.getHttpServer()).get(path).expect(401)
      expectError(
        response.body,
        CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
        AUTH_MESSAGES.unauthorized,
      )
    }
  })

  it('🔴 j: 객체 쿠키는 없는 것이다 — 401 ERR_COMMON_UNAUTHORIZED', async () => {
    const response = await request(app.getHttpServer())
      .get('/authprobe/self')
      .set('Cookie', 'admin_at=j:{"userNo":"BigInt(1)"}')
      .expect(401)
    expectError(response.body, CommonErrorCodes.ERR_COMMON_UNAUTHORIZED)
  })

  it('위조 JWT — 401 ERR_INVALID_TOKEN', async () => {
    const forged = new JwtService({ secret: 'z'.repeat(32) }).sign({
      userNo: 'BigInt(1)',
      sessionNo: 'BigInt(1)',
    })
    const response = await request(app.getHttpServer())
      .get('/authprobe/self')
      .set('Cookie', `admin_at=${forged}`)
      .expect(401)
    expectError(response.body, CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.accessInvalid)
  })

  it('만료 JWT — 401 ERR_EXPIRED_TOKEN', async () => {
    const expired = new JwtService({ secret: TEST_JWT_SECRET }).sign({
      userNo: 'BigInt(1)',
      sessionNo: 'BigInt(1)',
      exp: Math.floor(Date.now() / 1000) - 10,
    })
    const response = await request(app.getHttpServer())
      .get('/authprobe/self')
      .set('Cookie', `admin_at=${expired}`)
      .expect(401)
    expectError(response.body, CommonErrorCodes.ERR_EXPIRED_TOKEN, AUTH_MESSAGES.accessExpired)
  })
})

describe('refresh · logout — 쿠키 없이', () => {
  it('refresh 는 401 ERR_COMMON_UNAUTHORIZED', async () => {
    const response = await request(app.getHttpServer()).post('/admin/auth/refresh').expect(401)
    expectError(
      response.body,
      CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
      AUTH_MESSAGES.refreshMissing,
    )
  })

  it('🔴 logout 은 200 data null + 두 쿠키를 같은 Path 로 지운다', async () => {
    const response = await request(app.getHttpServer()).post('/admin/auth/logout').expect(200)
    expect(response.body).toEqual({ success: true, data: null })
    const cookies = response.headers['set-cookie'] as unknown as string[]
    for (const name of ['admin_at', 'admin_rt']) {
      const line = cookies.find((cookie) => cookie.startsWith(`${name}=;`))
      expect(line).toBeDefined()
      expect(line).toContain('Path=/')
      expect(line).toContain('Expires=Thu, 01 Jan 1970')
      expect(line).toContain('HttpOnly')
    }
  })
})

describe('기동 검사', () => {
  const boot = (options: Parameters<typeof AdminServerModule.forRoot>[0]) =>
    createHttpApp(
      { imports: [AdminServerModule.forRoot(options), AdminAuthModule] },
      { override: (builder) => builder.overrideProvider(KYSELY).useValue(fakeKysely()) },
    )

  it.each([
    ['auth 없음', { db: unreachable }, 'auth.jwtSecret'],
    [
      '짧은 비밀키',
      { db: unreachable, auth: { jwtSecret: 'short' } },
      'auth.jwtSecret 은 32자 이상',
    ],
    [
      '같은 쿠키 이름',
      {
        db: unreachable,
        auth: { jwtSecret: TEST_JWT_SECRET, cookies: { accessName: 'x', refreshName: 'x' } },
      },
      '같다',
    ],
  ])('%s → 기동에서 멈춘다', async (_label, options, message) => {
    await expect(boot(options)).rejects.toThrow(message)
  })

  it('failClosed: false 는 경고 한 줄을 남긴다', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn')
    const lenient = await boot({
      db: unreachable,
      auth: { jwtSecret: TEST_JWT_SECRET, failClosed: false },
    })
    try {
      expect(warn.mock.calls.some(([message]) => String(message).includes('failClosed'))).toBe(true)
    } finally {
      await lenient.close()
    }
  })

  it('withRepository — 바꾼 리포지토리가 AUTH_REPOSITORY 가 되고 /admin/auth/* 가 그대로 있다', async () => {
    class MemoryRepository implements AdminAuthRepository {
      async findCredentialByUserId() {
        return null
      }
      async findCredentialByNo() {
        return null
      }
      async findPrincipal() {
        return null
      }
      async saveLoginState() {}
      async changePassword() {
        return 0
      }
    }
    const custom = await createHttpApp(
      {
        imports: [
          AdminServerModule.forRoot({ db: unreachable, auth: { jwtSecret: TEST_JWT_SECRET } }),
          AdminAuthModule.withRepository(MemoryRepository),
        ],
      },
      { override: (builder) => builder.overrideProvider(KYSELY).useValue(fakeKysely()) },
    )
    try {
      expect(custom.get(AUTH_REPOSITORY, { strict: false })).toBeInstanceOf(MemoryRepository)
      await request(custom.getHttpServer()).post('/admin/auth/login').send({}).expect(400)
    } finally {
      await custom.close()
    }
  })
})
