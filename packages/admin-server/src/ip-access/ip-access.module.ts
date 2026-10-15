import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import {
  ADMIN_ACCESS_POLICY,
  ADMIN_IP_ACCESS_CONFIG,
  ADMIN_SERVER_OPTIONS,
  IP_ACCESS_ENABLED,
} from '../tokens.js'
import { AdminIpAccessController } from './ip-access.controller.js'
import { IpAccessPolicy } from './ip-access.policy.js'
import { AdminIpAccessService } from './ip-access.service.js'
import { resolveIpAccessConfig } from './options.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.module.ts
// 바꾼 점: 패키지 기능 모듈 — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다. 옵션이 없다(import 하면
//   켜진다, 2f-1 스펙 2-2 #3). 2b 의 ADMIN_ACCESS_POLICY 자리와 잔존 셈의 표시 토큰 IP_ACCESS_ENABLED 를 낸다.
// 🔴 전역이다 — AdminAuthService 의 @Optional() ADMIN_ACCESS_POLICY · 역할 · 사용자 서비스의 @Optional() IP_ACCESS_ENABLED 가
//    import 순서와 상관없이 받는다(2c 감사 모듈의 ADMIN_AUTH_EVENTS 와 같다).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 장 0012_ip_access_rules 가 있어야 돈다 — 없으면 인증 요청마다 500. 스텁 검사가 먼저 막는다(모든 장 필수).

@Global()
@Module({
  controllers: [AdminIpAccessController],
  providers: [
    {
      provide: ADMIN_IP_ACCESS_CONFIG,
      useFactory: (options: AdminServerOptions) => resolveIpAccessConfig(options),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminIpAccessService,
    { provide: ADMIN_ACCESS_POLICY, useClass: IpAccessPolicy },
    { provide: IP_ACCESS_ENABLED, useValue: true },
  ],
  exports: [ADMIN_ACCESS_POLICY, IP_ACCESS_ENABLED],
})
export class AdminIpAccessModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminIpAccessModule')
    assertPermissionSlots(
      this.options.permissions,
      ['ipAccess.read', 'ipAccess.manage'],
      'AdminIpAccessModule',
    )
  }
}
