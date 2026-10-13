import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { ADMIN_AUTH_CONFIG, IS_PUBLIC } from '../tokens.js'
import { AdminAuthService } from './auth.service.js'
import { AUTH_MESSAGES } from './errors.js'
import { readCookie } from './cookies.js'
import type { ResolvedAuthConfig } from './options.js'
import { setAdminPrincipal } from './principal.js'

// 정본: hangang-home apps/api/src/core/guards/auth.guard.ts
// 바꾼 점: 판정(JWT · 세션 · 사용자 · 퇴사 · IP)을 AdminAuthService.authenticate 로 옮겼다 — 가드는 쿠키를 읽고 주체를
//   req.admin 에 둔다. rpc · ws 만 통과, 그 밖의 비HTTP 는 401(스펙 §14 R4 · R10). apiKey 경로 · 사이트 시간대는 없다.

/** 🔴 앱 전역(APP_GUARD — 스펙 ② G1). 관리자 밖 라우트는 @Public 으로 뺀다. AdminPermissionGuard 보다 먼저 돈다. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AdminAuthService,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const type = context.getType<string>()
    // 🔴 쿠키 인증을 할 수 없는 마이크로서비스 · WebSocket 만 지나친다(스펙 §14 R4). 그 밖의 비HTTP 컨텍스트(GraphQL 등 — HTTP 위에서
    //    쿠키를 싣고 온다)는 막는다 — 통과시키면 전역 가드가 통째로 열린다(최종 리뷰 F4).
    if (type === 'rpc' || type === 'ws') return true
    if (type !== 'http') {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic === true) return true

    const req = context.switchToHttp().getRequest<Request>()
    const principal = await this.auth.authenticate(
      readCookie(req, this.config.cookies.accessName),
      req,
    )
    setAdminPrincipal(req, principal)
    return true
  }
}
