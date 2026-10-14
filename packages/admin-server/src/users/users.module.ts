import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { resolveUsersConfig } from '../accounts/options.js'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import { AdminSessionStore } from '../auth/session.store.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_ACCOUNTS_CONFIG, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminUsersController } from './users.controller.js'
import { AdminUsersService } from './users.service.js'

// 정본: hangang-home apps/api/src/modules/users/users.module.ts
// 바꾼 점: 패키지 기능 모듈(2d 스펙 §4-4) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다.
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 AdminSessionStore 를 자기 provider 로 둔다(퇴사 · 초기화의 세션 폐기 — 2c R2 와 같은 이유). 해석된 설정(카탈로그 · reauth ·
//    기준 시간대)은 이 모듈의 provider 다 — 카탈로그 없음 · 슬롯 키 오타 · 잘못된 timeZone 은 그 팩토리가 기동에서 멈춘다
//    (B12 · B15).

@Module({
  controllers: [AdminUsersController],
  providers: [
    {
      provide: ADMIN_ACCOUNTS_CONFIG,
      useFactory: (options: AdminServerOptions) => resolveUsersConfig(options, 'AdminUsersModule'),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminSessionStore,
    AdminUsersService,
  ],
})
export class AdminUsersModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminUsersModule')
    assertPermissionSlots(
      this.options.permissions,
      ['users.read', 'users.manage'],
      'AdminUsersModule',
    )
  }
}
