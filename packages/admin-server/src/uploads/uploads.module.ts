import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered, isModuleRegistered } from '../auth/module-check.js'
import { AdminLegalModule } from '../legal/legal.module.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_SERVER_OPTIONS, ADMIN_UPLOADS_CONFIG } from '../tokens.js'
import { EncodeGate } from './encode.js'
import { resolveUploadsConfig, type ResolvedUploadsConfig } from './options.js'
import { AdminUploadsController } from './uploads.controller.js'
import { AdminUploadsService } from './uploads.service.js'

// 정본: ssworks-ringside apps/api/src/uploads/uploads.module.ts
// 바꾼 점: 패키지 기능 모듈 — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin 접두사를 붙인다. 전역이다(2h 스펙 U6 · U10) —
//   권한 가드가 ADMIN_UPLOADS_CONFIG 를, 약관 서비스 · 앱 라우트가 AdminUploadsService 를 @Optional()/주입으로 받는다. 정리 잡은
//   모듈이 setInterval 로 돌린다(옵션 sweep — false 면 앱 워커 몫).
// 🔴 @Global() 을 지우면 권한 가드가 설정을 못 봐 @RequireUploadPurpose 라우트가 모두 403 이 되고 약관 발행이 첨부를 건너뛴다(조용히).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 legal 용도 자동 등록은 AdminLegalModule 의 등록 여부(ModulesContainer)로 정한다 — provider 팩토리 시점에 모든 모듈이 스캔돼 있다.
// 🔴 장 0013_admin_uploads 가 있어야 돈다 — 스텁 검사가 먼저 막는다(모든 장 필수).

@Global()
@Module({
  controllers: [AdminUploadsController],
  providers: [
    {
      provide: ADMIN_UPLOADS_CONFIG,
      useFactory: (options: AdminServerOptions, modules: ModulesContainer): ResolvedUploadsConfig =>
        resolveUploadsConfig(
          options,
          isModuleRegistered(modules, AdminLegalModule),
          'AdminUploadsModule',
        ),
      inject: [ADMIN_SERVER_OPTIONS, ModulesContainer],
    },
    { provide: EncodeGate, useFactory: () => new EncodeGate() },
    AdminUploadsService,
  ],
  exports: [ADMIN_UPLOADS_CONFIG, AdminUploadsService],
})
export class AdminUploadsModule
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(AdminUploadsModule.name)
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_UPLOADS_CONFIG) private readonly config: ResolvedUploadsConfig,
    private readonly uploads: AdminUploadsService,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminUploadsModule')
  }

  /** 정리 잡(스펙 U11) — 주기마다 sweep. unref 라 프로세스를 붙들지 않는다. sweep 은 멱등이다 */
  onApplicationBootstrap(): void {
    if (this.config.sweepIntervalMs === null) return
    this.timer = setInterval(() => {
      // 🔴 겹침 방지 — 앞 회차가 끝나기 전에 다음 틱이 오면 건너뛴다(저장소가 느릴 때 풀을 고갈시키지 않게)
      if (this.running) return
      this.running = true
      void this.uploads
        .sweep()
        .catch((error: unknown) => {
          this.logger.warn(
            `업로드 정리 실패 — ${error instanceof Error ? error.message : String(error)}`,
          )
        })
        .finally(() => {
          this.running = false
        })
    }, this.config.sweepIntervalMs)
    this.timer.unref()
  }

  /**
   * 🔴 코어 모듈의 onModuleDestroy 가 Kysely 풀을 닫는다 — onApplicationShutdown 은 그 뒤라 여기서 멈춘다.
   * 앱이 README 순서대로 `AdminServerModule.forRoot(...)` 를 이 모듈보다 먼저 import 하면 타이머가 풀보다 먼저 멈춘다
   * (둘 다 전역이라 거리가 같고 import 순서가 훅 순서를 정한다 — Nest 12 실측, 거꾸로 import 하면 풀이 먼저 닫힌다).
   * 순서가 다르면 `db.destroy()` 도중 틱이 돌 수 있다 — 그 sweep 의 실패는 틱의 catch 가 잡아 경고 한 줄로 남는다(멱등이라 다음 기동이 잇는다).
   */
  onModuleDestroy(): void {
    this.stopSweep()
  }

  /** 안전망 — onModuleDestroy 가 이미 멈췄으면 아무 일도 하지 않는다 */
  onApplicationShutdown(): void {
    this.stopSweep()
  }

  private stopSweep(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}
