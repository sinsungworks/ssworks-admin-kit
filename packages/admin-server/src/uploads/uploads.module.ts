import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
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
// 🔴 장 0013_uploads 가 있어야 돈다 — 스텁 검사가 먼저 막는다(모든 장 필수).

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
    // 앱마다 한 문 — useValue 면 모듈 정의 시점의 한 인스턴스를 한 프로세스의 모든 앱이 나눈다
    { provide: EncodeGate, useFactory: () => new EncodeGate() },
    AdminUploadsService,
  ],
  exports: [ADMIN_UPLOADS_CONFIG, AdminUploadsService],
})
export class AdminUploadsModule
  implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AdminUploadsModule.name)
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_UPLOADS_CONFIG) private readonly config: ResolvedUploadsConfig,
    private readonly uploads: AdminUploadsService,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminUploadsModule')
  }

  /** 정리 잡(스펙 U11) — 주기마다 sweep. unref 라 프로세스를 붙들지 않는다. 겹쳐 돌아도 멱등 */
  onApplicationBootstrap(): void {
    if (this.config.sweepIntervalMs === null) return
    this.timer = setInterval(() => {
      void this.uploads.sweep().catch((error: unknown) => {
        this.logger.warn(
          `업로드 정리 실패 — ${error instanceof Error ? error.message : String(error)}`,
        )
      })
    }, this.config.sweepIntervalMs)
    this.timer.unref()
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}
