import {
  Global,
  Logger,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type Provider,
  type OnModuleInit,
  type Type,
} from '@nestjs/common'
import { APP_GUARD, ModulesContainer } from '@nestjs/core'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import type { AdminServerOptions } from '../options.js'
import {
  ADMIN_AUTH_CONFIG,
  ADMIN_SERVER_OPTIONS,
  AUTH_REPOSITORY,
  CUSTOM_AUTH_REPOSITORY,
  KYSELY,
} from '../tokens.js'
import { AdminAccessTokenService } from './access-token.service.js'
import { AdminAuthController } from './auth.controller.js'
import { AdminAuthGuard } from './auth.guard.js'
import type { AdminAuthRepository } from './auth.repository.js'
import { AdminAuthService } from './auth.service.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'
import { resolveAuthConfig, type ResolvedAuthConfig } from './options.js'
import { AdminPermissionGuard } from './permission.guard.js'
import { AdminReauthService } from './reauth.service.js'
import { AdminSessionStore } from './session.store.js'

// 정본: hangang-home apps/api/src/app.module.ts(APP_GUARD AuthGuard → PermissionGuard) · modules/auth/auth.module.ts
// 바꾼 점: 패키지 기능 모듈이다(전역 · AppModule 에서 한 번만 — 두 번이면 기동 거부, 최종 리뷰 F3) — 쓰는 쪽 app.module.ts 가 import 한다(2a ④ R2). 값은 코어 옵션의 auth ·
//   passwordPolicy 에서 읽고, 리포지토리 교체만 withRepository 로 받는다(스펙 ⑥ O1). JwtModule 을 쓰지 않는다(Task 4).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 하므로
//    반대 방향은 순환이다. 토큰은 tokens.ts 에서(2a F3).

const providers: Provider[] = [
  {
    provide: ADMIN_AUTH_CONFIG,
    useFactory: (options: AdminServerOptions): ResolvedAuthConfig => {
      const config = resolveAuthConfig(options.auth, options.passwordPolicy)
      if (!config.failClosed) {
        new Logger('AdminAuthModule').warn(
          'auth.failClosed 가 false 다 — 권한 선언이 없는 라우트가 인증만으로 통과한다(이식 과도기 옵션).',
        )
      }
      return config
    },
    inject: [ADMIN_SERVER_OPTIONS],
  },
  {
    // 🔴 교체는 CUSTOM_AUTH_REPOSITORY 가 있을 때만 — 같은 토큰을 정적 · 동적 메타데이터에 두 번 두고 덮어쓰기 순서에
    //    기대지 않는다(스펙 B6, §14 R1-3 실측).
    provide: AUTH_REPOSITORY,
    useFactory: (custom: AdminAuthRepository | undefined, db: Kysely<AdminDatabase>) =>
      custom ?? new KyselyAuthRepository(db),
    inject: [{ token: CUSTOM_AUTH_REPOSITORY, optional: true }, KYSELY],
  },
  AdminAccessTokenService,
  AdminSessionStore,
  AdminAuthService,
  AdminReauthService,
  // 본문 파이프(LoginBodyPipe · ChangePasswordBodyPipe)는 @Body(클래스) 로 넘겨 Nest 가 이 모듈 안에서 만든다 — 여기
  // 적지 않는다.
  // 🔴 앱 전역(스펙 ② G1). 등록 순서가 실행 순서다 — 인증이 주체를 채운 뒤 권한을 판정한다.
  { provide: APP_GUARD, useClass: AdminAuthGuard },
  { provide: APP_GUARD, useClass: AdminPermissionGuard },
]

@Global()
@Module({
  controllers: [AdminAuthController],
  providers,
  exports: [AdminReauthService, AUTH_REPOSITORY],
})
export class AdminAuthModule implements OnModuleInit {
  constructor(private readonly modules: ModulesContainer) {}

  /** 🔴 두 번 등록되면 가드 · 라우트가 둘이 되고 하나는 기본 리포지토리로 돈다(최종 리뷰 F3) — 기동에서 멈춘다. */
  onModuleInit(): void {
    const count = [...this.modules.values()].filter(
      (ref) => ref.metatype === AdminAuthModule,
    ).length
    if (count > 1) {
      throw new Error(
        'AdminAuthModule 이 두 번 등록됐다 — AppModule 에서 한 번만 import 한다(AdminAuthModule 과 AdminAuthModule.withRepository 를 함께 쓰지 않는다). 전역 모듈이라 다른 모듈은 import 하지 않아도 AdminReauthService 를 주입받는다.',
      )
    }
  }

  /**
   * 사용자 테이블 컬럼이 코어와 다른 프로젝트 — `AdminAuthRepository` 구현을 넘긴다. 그 클래스가 기대는 provider 의
   * 모듈은 `imports` 로 넘긴다. 🔴 컬럼 매핑 옵션은 만들지 않는다(2a §1-4 #5).
   */
  static withRepository(
    repository: Type<AdminAuthRepository>,
    options: { imports?: ModuleMetadata['imports'] } = {},
  ): DynamicModule {
    return {
      module: AdminAuthModule,
      global: true,
      imports: options.imports ?? [],
      providers: [{ provide: CUSTOM_AUTH_REPOSITORY, useClass: repository }],
    }
  }
}
