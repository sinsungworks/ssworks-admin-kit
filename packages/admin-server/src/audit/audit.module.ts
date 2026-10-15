import {
  Global,
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common'
import {
  APP_INTERCEPTOR,
  DiscoveryModule,
  DiscoveryService,
  ModulesContainer,
  Reflector,
} from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_AUDIT_CONFIG, ADMIN_AUTH_EVENTS, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminAuditLogsController } from './audit-logs.controller.js'
import { AdminAuditLogsService } from './audit-logs.service.js'
import { AdminAuditInterceptor } from './audit.interceptor.js'
import { AdminAuditService } from './audit.service.js'
import { AdminAuditEventSink } from './auth-events.js'
import { collectAuditDeclarations, findAuditProblems } from './catalog-check.js'
import { resolveAuditConfig, type ResolvedAuditConfig } from './options.js'

// 정본: hangang-home apps/api/src/core/audit/audit.module.ts(@Global · APP_INTERCEPTOR) + modules/audit-logs(조회)
// 바꾼 점: 기록 · 조회를 한 모듈로(2c 스펙 ⑩ MD1). 인증 이벤트 sink 를 ADMIN_AUTH_EVENTS 로 낸다(2b 자리). 기동에서 인증
//   모듈 · 권한 슬롯 · 카탈로그 · @Public 선언을 본다(§5-8).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 전역이다 — AdminAuthService 의 @Optional() ADMIN_AUTH_EVENTS 주입이 import 순서와 상관없이 sink 를 받는다(§14 R1-2).

@Global()
@Module({
  imports: [DiscoveryModule],
  controllers: [AdminAuditLogsController],
  providers: [
    {
      provide: ADMIN_AUDIT_CONFIG,
      useFactory: (options: AdminServerOptions): ResolvedAuditConfig =>
        resolveAuditConfig(options.audit, options.clientIp),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminAuditService,
    AdminAuditLogsService,
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
    { provide: ADMIN_AUTH_EVENTS, useClass: AdminAuditEventSink },
  ],
  exports: [ADMIN_AUTH_EVENTS],
})
export class AdminAuditModule implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly modules: ModulesContainer,
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
    @Inject(ADMIN_AUDIT_CONFIG) private readonly config: ResolvedAuditConfig,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminAuditModule')
    assertPermissionSlots(this.options.permissions, ['auditLogs.read'], 'AdminAuditModule')
  }

  /** 🔴 모든 모듈이 컨트롤러를 등록한 뒤라야 쓰는 쪽 컨트롤러까지 훑는다 — onModuleInit 이 아니라 여기다 */
  onApplicationBootstrap(): void {
    const problems = findAuditProblems(
      collectAuditDeclarations(this.discovery, this.reflector),
      this.config.catalog,
    )
    if (problems.length > 0) {
      throw new Error(
        `@Audit 선언이 맞지 않는다 — ${problems.join(' / ')}. 프로젝트 액션은 admin-shared defineAuditCatalog 로 정의해 AdminServerModule 옵션 audit.catalog 로 넘긴다.`,
      )
    }
  }
}
