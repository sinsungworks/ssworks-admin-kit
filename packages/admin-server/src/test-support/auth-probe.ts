import { Body, Controller, Get, HttpCode, Module, Post, type DynamicModule } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import {
  CurrentAdmin,
  Public,
  RequireAnyPermissions,
  RequirePermissions,
  SelfOnly,
} from '../auth/decorators.js'
import type { AdminAccessPolicy, AdminAuthEventSink } from '../auth/hooks.js'
import type { AdminAuthOptions } from '../auth/options.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import type { AdminDbConnection } from '../database/connection.js'
import { ADMIN_ACCESS_POLICY, ADMIN_AUTH_EVENTS } from '../tokens.js'
import { TEST_JWT_SECRET } from './auth.js'
import { createHttpApp, type HttpAppOptions } from './http.js'

// 테스트 전용 — 인증 가드 · 데코레이터를 HTTP 로 잰다. 🔴 빌드에서 빠진다(tsconfig.build.json).
// 이 모듈은 AdminAuthModule 과 다른 모듈이다 — 앱 전역 가드(스펙 ② G1)가 쓰는 쪽 모듈에도 걸리는지 잰다.

@Controller('authprobe')
export class AuthProbeController {
  constructor(private readonly reauth: AdminReauthService) {}

  @Public()
  @Get('public')
  open() {
    return { ok: true }
  }

  @Get('undeclared')
  undeclared() {
    return { ok: true }
  }

  @SelfOnly()
  @Get('self')
  self(@CurrentAdmin() admin: AdminPrincipal) {
    return { userId: admin.userId, sessionNo: admin.sessionNo }
  }

  @RequirePermissions('user:read')
  @Get('users')
  users() {
    return { ok: true }
  }

  @RequireAnyPermissions('team:read', 'role:read')
  @Get('any')
  any() {
    return { ok: true }
  }

  @SelfOnly()
  @HttpCode(200)
  @Post('reauth')
  async reauthCheck(@CurrentAdmin() admin: AdminPrincipal, @Body() body: { password?: unknown }) {
    await this.reauth.verify(admin, typeof body.password === 'string' ? body.password : '')
    return { ok: true }
  }
}

// AdminAuthModule 을 import 하지 않는다 — 전역 모듈이라 AdminReauthService 가 그대로 주입된다(최종 리뷰 F3).
@Module({ controllers: [AuthProbeController] })
export class AuthProbeModule {}

@Module({})
class AuthHooksTestModule {}

/** 2c · 2f 가 할 일 — 전역 모듈이 ADMIN_ACCESS_POLICY · ADMIN_AUTH_EVENTS 를 내보낸다 */
export function authHooksModule(hooks: {
  policy?: AdminAccessPolicy
  events?: AdminAuthEventSink
}): DynamicModule {
  const providers = [
    ...(hooks.policy ? [{ provide: ADMIN_ACCESS_POLICY, useValue: hooks.policy }] : []),
    ...(hooks.events ? [{ provide: ADMIN_AUTH_EVENTS, useValue: hooks.events }] : []),
  ]
  return {
    module: AuthHooksTestModule,
    global: true,
    providers,
    exports: providers.map((provider) => provider.provide),
  }
}

export interface AuthAppOptions {
  db: AdminDbConnection
  auth?: Partial<AdminAuthOptions>
  policy?: AdminAccessPolicy
  events?: AdminAuthEventSink
  override?: HttpAppOptions['override']
}

/** 코어 + 인증 + 프로브 + 훅 — 운영 main.ts 와 같은 배선(configureAdminApp)으로 띄운다 */
export function bootAuthApp(options: AuthAppOptions): Promise<NestExpressApplication> {
  return createHttpApp(
    {
      imports: [
        AdminServerModule.forRoot({
          db: options.db,
          auth: { jwtSecret: TEST_JWT_SECRET, ...options.auth },
        }),
        AdminAuthModule,
        AuthProbeModule,
        authHooksModule({ policy: options.policy, events: options.events }),
      ],
    },
    options.override ? { override: options.override } : {},
  )
}
