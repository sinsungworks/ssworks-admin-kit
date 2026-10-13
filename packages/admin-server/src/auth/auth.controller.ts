import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { ADMIN_AUTH_CONFIG } from '../tokens.js'
import { ChangePasswordBodyPipe, LoginBodyPipe } from './auth.pipes.js'
import type { AdminChangePasswordBody, AdminLoginBody } from './auth.pipes.js'
import { AdminAuthService } from './auth.service.js'
import { clearAuthCookies, readCookie, setAuthCookies } from './cookies.js'
import { AllowDuringPasswordChange, CurrentAdmin, Public, SelfOnly } from './decorators.js'
import type { ResolvedAuthConfig } from './options.js'
import { toAdminMe } from './principal.js'
import type { AdminMe, AdminPrincipal } from './principal.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.controller.ts(@Public 로그인 · 갱신 · 로그아웃, 쿠키는 늘 지움)
//       + hangang-home modules/auth/auth.controller.ts(@HttpCode(200))
// 바꾼 점: 본문 { ok: true } 대신 반환값 없음(→ data: null, 2a F4). 로그아웃은 @Public(hangang 은 @SelfOnly) — 액세스
//   토큰이 만료돼도 쿠키가 지워져야 한다. 경로는 AdminServerModule 의 RouterModule 이 /admin 을 붙인다.

@Controller('auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
  ) {}

  /** 🔴 토큰은 httpOnly 쿠키로만 나간다 — 본문에 담으면 SPA 가 localStorage 에 넣을 여지가 생긴다(gise). */
  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(LoginBodyPipe) body: AdminLoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    setAuthCookies(req, res, this.config, await this.auth.login(body, req))
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const tokens = await this.auth.refresh(readCookie(req, this.config.cookies.refreshName), req)
    setAuthCookies(req, res, this.config, tokens)
  }

  /**
   * 🔴 @Public 이다 — 액세스 토큰이 만료된 상태에서도 성공해야 쿠키가 지워진다. 주체 대신 refresh 쿠키가 세션을 지목한다.
   * 🔴 폐기가 실패해도(DB 오류) 쿠키는 지운다 — 브라우저 상태는 깨끗해져야 한다(gise).
   */
  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    try {
      await this.auth.logout(readCookie(req, this.config.cookies.refreshName), req)
    } finally {
      clearAuthCookies(req, res, this.config)
    }
  }

  /** 🔴 @SelfOnly — 권한 없는 계정이 여기서 403 이면 SPA 가 조용한 리디렉트 루프에 빠진다(gise). 강제 변경 계정도 연다. */
  @SelfOnly()
  @AllowDuringPasswordChange()
  @Get('me')
  me(@CurrentAdmin() admin: AdminPrincipal): AdminMe {
    return toAdminMe(admin)
  }

  @SelfOnly()
  @AllowDuringPasswordChange()
  @Patch('password')
  async changePassword(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body(ChangePasswordBodyPipe) body: AdminChangePasswordBody,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword(admin, body, req)
  }
}
