import { Controller, Get, Module, type DynamicModule } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { defineErrorCodes } from '@ssworks/admin-shared'
import { Kysely } from 'kysely'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { AdminServerModule, buildAdminServerModule } from './admin-server.module.js'
import type { AdminServerOptions } from './options.js'
import { createHttpApp } from './test-support/http.js'
import { ProbeModule } from './test-support/probe.js'
import { ADMIN_SERVER_OPTIONS, KYSELY } from './tokens.js'

const db = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const projectErrors = defineErrorCodes(
  { ERR_PROJECT_GONE: 'ERR_PROJECT_GONE' },
  { ERR_PROJECT_GONE: 410 },
)

@Controller('other')
class OtherController {
  @Get()
  get() {
    return 'other'
  }
}

@Module({ controllers: [OtherController] })
class OtherModule {}

/** KYSELY 를 가짜로 바꿔 띄운다 — HTTP 계약 테스트에는 DB 가 필요 없다 */
async function boot(module: DynamicModule, extra: DynamicModule['imports'] = [], configure = true) {
  const kysely = { destroy: vi.fn(async () => undefined) }
  const app = await createHttpApp(
    { imports: [module, ...(extra ?? [])] },
    { configure, override: (builder) => builder.overrideProvider(KYSELY).useValue(kysely) },
  )
  return { app, kysely }
}

describe('forRoot', () => {
  it('봉투 · 필터를 전역으로 걸고 errorCodes 로 상태를 정한다', async () => {
    const { app } = await boot(AdminServerModule.forRoot({ db, errorCodes: projectErrors }), [
      ProbeModule,
    ])
    try {
      const server = app.getHttpServer()
      expect((await request(server).get('/probe/nothing').expect(200)).body).toEqual({
        success: true,
        data: null,
      })
      await request(server).get('/probe/business/ERR_PROJECT_GONE').expect(410)
      expect(app.get(ADMIN_SERVER_OPTIONS)).toEqual({ db, errorCodes: projectErrors })
    } finally {
      await app.close()
    }
  })

  it('앱을 닫으면 KYSELY 를 destroy 한다', async () => {
    const { app, kysely } = await boot(AdminServerModule.forRoot({ db }))
    await app.close()
    expect(kysely.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('forRootAsync', () => {
  it('useFactory 가 imports · inject 로 옵션을 만든다', async () => {
    const CONFIG = Symbol('CONFIG')
    @Module({
      providers: [{ provide: CONFIG, useValue: { db, errorCodes: projectErrors } }],
      exports: [CONFIG],
    })
    class ConfigStubModule {}

    const { app } = await boot(
      AdminServerModule.forRootAsync({
        imports: [ConfigStubModule],
        inject: [CONFIG],
        useFactory: (config: AdminServerOptions) => config,
      }),
      [ProbeModule],
    )
    try {
      await request(app.getHttpServer()).get('/probe/business/ERR_PROJECT_GONE').expect(410)
    } finally {
      await app.close()
    }
  })
})

describe('KYSELY 팩토리', () => {
  it('🔴 options.db 로 만든 Kysely — 닿지 않는 DB 여도 닫을 때 오류가 새지 않는다', async () => {
    const leaks: unknown[] = []
    const onLeak = (error: unknown) => leaks.push(error)
    process.on('unhandledRejection', onLeak)
    process.on('uncaughtException', onLeak)
    try {
      const ref = await Test.createTestingModule({
        imports: [AdminServerModule.forRoot({ db })],
      }).compile()
      expect(ref.get(KYSELY)).toBeInstanceOf(Kysely)
      await ref.close()
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(leaks).toEqual([])
    } finally {
      process.off('unhandledRejection', onLeak)
      process.off('uncaughtException', onLeak)
    }
  })
})

describe('routePrefix', () => {
  const optionsProvider = { provide: ADMIN_SERVER_OPTIONS, useValue: { db } }

  it('목록의 모듈에 붙이고 목록 밖 모듈은 그대로 — 기본은 admin', async () => {
    const { app } = await boot(buildAdminServerModule({}, optionsProvider, [], [ProbeModule]), [
      ProbeModule,
      OtherModule,
    ])
    try {
      const server = app.getHttpServer()
      await request(server).get('/admin/probe/nothing').expect(200)
      await request(server).get('/probe/nothing').expect(404)
      await request(server).get('/other').expect(200)
    } finally {
      await app.close()
    }
  })

  it('다른 prefix', async () => {
    const { app } = await boot(
      buildAdminServerModule({ routePrefix: 'manage' }, optionsProvider, [], [ProbeModule]),
      [ProbeModule],
    )
    try {
      await request(app.getHttpServer()).get('/manage/probe/nothing').expect(200)
    } finally {
      await app.close()
    }
  })

  it("'' 이면 붙이지 않는다", async () => {
    const { app } = await boot(
      buildAdminServerModule({ routePrefix: '' }, optionsProvider, [], [ProbeModule]),
      [ProbeModule],
    )
    try {
      await request(app.getHttpServer()).get('/probe/nothing').expect(200)
    } finally {
      await app.close()
    }
  })
})

describe('🔴 부팅 검사', () => {
  it('configureAdminApp 을 부르지 않으면 init 에서 멈춘다', async () => {
    await expect(boot(AdminServerModule.forRoot({ db }), [], false)).rejects.toThrow(
      'configureAdminApp',
    )
  })

  it('HTTP 어댑터가 없는 컨텍스트(스크립트)는 검사하지 않는다', async () => {
    const ref = await Test.createTestingModule({ imports: [AdminServerModule.forRoot({ db })] })
      .overrideProvider(KYSELY)
      .useValue({ destroy: async () => undefined })
      .compile()
    await expect(ref.init()).resolves.toBeDefined()
    await ref.close()
  })
})
