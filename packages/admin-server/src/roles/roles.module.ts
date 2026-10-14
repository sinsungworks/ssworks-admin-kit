import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { resolveAccountsConfig } from '../accounts/options.js'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_ACCOUNTS_CONFIG, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminRolesController } from './roles.controller.js'
import { AdminRolesService } from './roles.service.js'

// 정본: hangang-home apps/api/src/modules/roles/roles.module.ts
// 바꾼 점: 패키지 기능 모듈(2d 스펙 §4-4) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다.
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 해석된 계정 설정은 이 모듈의 provider 다 — 카탈로그 없음 · 슬롯 키 오타는 그 팩토리가 기동에서 멈춘다(B12).

@Module({
  controllers: [AdminRolesController],
  providers: [
    {
      provide: ADMIN_ACCOUNTS_CONFIG,
      useFactory: (options: AdminServerOptions) =>
        resolveAccountsConfig(options, 'AdminRolesModule'),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminRolesService,
  ],
})
export class AdminRolesModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminRolesModule')
    assertPermissionSlots(
      this.options.permissions,
      ['roles.read', 'roles.manage'],
      'AdminRolesModule',
    )
  }
}
