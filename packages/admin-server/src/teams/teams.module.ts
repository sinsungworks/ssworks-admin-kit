import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminTeamsController } from './teams.controller.js'
import { AdminTeamsService } from './teams.service.js'

// 정본: hangang-home apps/api/src/modules/teams/teams.module.ts
// 바꾼 점: 패키지 기능 모듈(2e 스펙 §4-4) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다. 옵션이
//   없다(카탈로그 · reauth 를 읽지 않는다).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 장 0010_team_tree_lock(guardLocks 행 teamTree)이 있어야 쓰기가 돈다 — 없으면 쓰기마다 500(lockGuardRow). 스텁 검사가
//    먼저 막는다(모든 장 필수 — 2c ⑨ M1).

@Module({
  controllers: [AdminTeamsController],
  providers: [AdminTeamsService],
})
export class AdminTeamsModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminTeamsModule')
    assertPermissionSlots(
      this.options.permissions,
      ['teams.read', 'teams.manage'],
      'AdminTeamsModule',
    )
  }
}
