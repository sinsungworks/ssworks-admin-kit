import {
  Inject,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type Provider,
  type Type,
} from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR, HttpAdapterHost, RouterModule } from '@nestjs/core'
import { bigintJsonReplacer } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { createAdminKysely } from './database/kysely.js'
import { AdminEnvelopeInterceptor } from './http/envelope.interceptor.js'
import { AdminExceptionFilter } from './http/exception.filter.js'
import type {
  AdminServerAsyncOptions,
  AdminServerOptions,
  AdminServerStaticOptions,
} from './options.js'
import { ADMIN_SERVER_OPTIONS, KYSELY } from './tokens.js'

// 정본: hangang-home apps/api/src/app.module.ts(전역 필터 · 가드를 DI 로) · gise database.module.ts(onModuleDestroy)
// 바꾼 점: 패키지 코어 모듈이다 — 기능 모듈은 쓰는 쪽 app.module.ts(B)가 골라 import 한다(Phase 2 결정 ④ R2).

/**
 * 패키지가 아는 기능 모듈 — `routePrefix` 를 붙일 대상. 쓰는 쪽이 import 하지 않은 모듈은 `RouterModule` 이 건너뛴다
 * (`@nestjs/core` router-module.js 실측).
 * 🔴 여기 오는 모듈 파일은 이 파일을 import 하지 않는다(순환) — 토큰은 tokens.ts 에서 가져온다.
 * 2a 에는 기능 모듈이 없다. 2b 부터 붙는다.
 */
const ADMIN_ROUTE_MODULES: readonly Type[] = []

const DEFAULT_ROUTE_PREFIX = 'admin'

const BOOT_CHECK_MESSAGE =
  'configureAdminApp(app) 을 app.init() · listen() 전에 불러야 한다 — Express json replacer 가 admin-shared ' +
  'bigintJsonReplacer 가 아니다(bigint 를 담은 응답이 500 이 된다). admin-shared 가 두 벌 설치돼 있어도 이렇게 보인다.'

@Module({})
export class AdminServerModule implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<unknown>,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  static forRoot(options: AdminServerOptions & AdminServerStaticOptions): DynamicModule {
    const { routePrefix, ...resolved } = options
    return buildAdminServerModule(
      { routePrefix },
      { provide: ADMIN_SERVER_OPTIONS, useValue: resolved },
      [],
      ADMIN_ROUTE_MODULES,
    )
  }

  /** 기본 경로 — env 를 부팅 뒤에 읽는다(ESM 은 import 를 먼저 평가해 `forRoot` 인자가 `loadDotEnv()` 보다 먼저 돈다). */
  static forRootAsync(options: AdminServerAsyncOptions): DynamicModule {
    return buildAdminServerModule(
      { routePrefix: options.routePrefix },
      {
        provide: ADMIN_SERVER_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      options.imports ?? [],
      ADMIN_ROUTE_MODULES,
    )
  }

  /**
   * 🔴 `configureAdminApp` 을 빠뜨린 앱은 bigint 응답이 조용히 500 이 된다(gise 실측) — 기동에서 멈춘다.
   *    HTTP 어댑터가 없는 컨텍스트(스크립트 · 마이그레이션 보조)는 보지 않는다.
   */
  onApplicationBootstrap(): void {
    const instance = this.adapterHost.httpAdapter?.getInstance?.() as
      { get?: (key: string) => unknown } | undefined
    if (typeof instance?.get !== 'function') return
    if (instance.get('json replacer') !== bigintJsonReplacer) throw new Error(BOOT_CHECK_MESSAGE)
  }

  /** 🔴 풀은 생성 즉시 연결을 시도하고 재시도 타이머를 남긴다(gise) — 쓰는 쪽 main.ts 가 enableShutdownHooks() 를 부른다. */
  async onModuleDestroy(): Promise<void> {
    await this.db.destroy()
  }
}

/** 내부 빌더 — 테스트는 `routeModules` 에 프로브 모듈을 넘긴다. 공개 API 가 아니다(index 에 없다). */
export function buildAdminServerModule(
  staticOptions: AdminServerStaticOptions,
  optionsProvider: Provider,
  imports: NonNullable<ModuleMetadata['imports']>,
  routeModules: readonly Type[],
): DynamicModule {
  const routePrefix = staticOptions.routePrefix ?? DEFAULT_ROUTE_PREFIX
  const routerImports =
    routePrefix === '' || routeModules.length === 0
      ? []
      : [RouterModule.register(routeModules.map((module) => ({ path: routePrefix, module })))]
  return {
    module: AdminServerModule,
    global: true,
    imports: [...imports, ...routerImports],
    providers: [
      optionsProvider,
      {
        provide: KYSELY,
        useFactory: (options: AdminServerOptions) => createAdminKysely(options.db),
        inject: [ADMIN_SERVER_OPTIONS],
      },
      { provide: APP_FILTER, useClass: AdminExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: AdminEnvelopeInterceptor },
    ],
    exports: [ADMIN_SERVER_OPTIONS, KYSELY],
  }
}
