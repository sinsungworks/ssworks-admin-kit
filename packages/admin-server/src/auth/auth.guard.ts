import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ADMIN_AUTH_CONFIG, IS_PUBLIC } from '../tokens.js'
import { AdminAuthService } from './auth.service.js'
import { readCookie } from './cookies.js'
import type { ResolvedAuthConfig } from './options.js'
import { setAdminPrincipal } from './principal.js'

// 정본: hangang-home apps/api/src/core/guards/auth.guard.ts
// 바꾼 점: 판정(JWT · 세션 · 사용자 · 퇴사 · IP)을 AdminAuthService.authenticate 로 옮겼다 — 가드는 쿠키를 읽고 주체를
//   req.admin 에 둔다. HTTP 가 아닌 컨텍스트는 통과(스펙 §14 R4). apiKey 경로 · 사이트 시간대는 없다.

/** 🔴 앱 전역(APP_GUARD — 스펙 ② G1). 관리자 밖 라우트는 @Public 으로 뺀다. AdminPermissionGuard 보다 먼저 돈다. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AdminAuthService,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true
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
