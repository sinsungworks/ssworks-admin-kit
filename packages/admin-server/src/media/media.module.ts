import { Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { isModuleRegistered } from '../auth/module-check.js'
import { AdminUploadsModule } from '../uploads/uploads.module.js'
import { AdminMediaController } from './media.controller.js'

// 정본: 없음 — 2h 스펙 U5. 중계만 있는 모듈. AdminUploadsService 는 전역 업로드 모듈이 준다.
// 🔴 ADMIN_ROUTE_MODULES 에 넣지 않는다 — /admin 접두사 밖이어야 공개 웹이 /api/media/... 로 쓴다. 공개 API 가 따로면 이 모듈만
//    (코어 모듈 + AdminUploadsModule 과 함께) 올린다 — 같은 DB · 같은 저장소.
// 🔴 인증 모듈을 요구하지 않는다(@Public 라우트뿐) — 업로드 모듈만 있으면 된다.

@Module({ controllers: [AdminMediaController] })
export class AdminMediaModule implements OnModuleInit {
  constructor(private readonly modules: ModulesContainer) {}

  onModuleInit(): void {
    if (!isModuleRegistered(this.modules, AdminUploadsModule)) {
      throw new Error(
        'AdminMediaModule 은 AdminUploadsModule 이 있어야 한다 — 업로드 행 · 저장소를 그 모듈이 준다. AppModule 에 AdminUploadsModule 을 import 한다.',
      )
    }
  }
}
