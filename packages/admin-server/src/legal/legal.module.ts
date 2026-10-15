import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_LEGAL_CONFIG, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminLegalController } from './legal.controller.js'
import { AdminLegalService } from './legal.service.js'
import { resolveLegalConfig } from './options.js'

// 정본: ssworks-gise-home apps/api/src/modules/legal/legal.module.ts
// 바꾼 점: 패키지 기능 모듈(2e 스펙 §4-4) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다. 공개 조회
//   컨트롤러(gise public-legal)는 내지 않는다 — 쓰는 쪽 몫(공통 14). 카탈로그 · reauth 를 읽지 않는다.
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 종류 옵션은 이 모듈의 provider 다 — 없음 · 형식 밖은 그 팩토리가 기동에서 멈춘다(B14). 주입형 파이프(legal.body.ts)는
//    providers 에 적지 않는다(`@Body(클래스)` 를 Nest 가 모듈 안에서 만든다).
// 🔴 장 0011_legal_documents(표 + guardLocks 행 legalPublish)가 있어야 돈다 — 없으면 발행마다 500(lockGuardRow). 스텁 검사가
//    먼저 막는다(모든 장 필수 — 2c ⑨ M1).

@Module({
  controllers: [AdminLegalController],
  providers: [
    {
      provide: ADMIN_LEGAL_CONFIG,
      useFactory: (options: AdminServerOptions) => resolveLegalConfig(options, 'AdminLegalModule'),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminLegalService,
  ],
})
export class AdminLegalModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminLegalModule')
    assertPermissionSlots(
      this.options.permissions,
      ['legal.read', 'legal.publish'],
      'AdminLegalModule',
    )
  }
}
