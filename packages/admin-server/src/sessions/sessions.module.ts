import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import { AdminSessionStore } from '../auth/session.store.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminSessionsController } from './sessions.controller.js'
import { AdminSessionsService } from './sessions.service.js'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.module.ts
// 바꾼 점: 패키지 기능 모듈(2c 스펙 ⑩ MD1) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다.
// 🔴 AdminSessionStore 를 자기 provider 로 둔다(무상태 — KYSELY 만 받는다). AdminAuthModule 의 것을 export 받으면 인증
//    모듈이 빠진 앱이 DI 해석 오류로 멈춰 이유가 안 보인다 — 여기서는 onModuleInit 의 문구로 멈춘다(2c 스펙 §14 R2).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.

@Module({
  controllers: [AdminSessionsController],
  providers: [AdminSessionStore, AdminSessionsService],
})
export class AdminSessionsModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminSessionsModule')
    assertPermissionSlots(
      this.options.permissions,
      ['sessions.read', 'sessions.manage'],
      'AdminSessionsModule',
    )
  }
}
