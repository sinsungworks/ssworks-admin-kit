import {
  SetMetadata,
  createParamDecorator,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import {
  ALLOW_PASSWORD_CHANGE,
  ANY_PERMISSIONS,
  IS_PUBLIC,
  IS_SELF_ONLY,
  REQUIRED_PERMISSIONS,
} from '../tokens.js'
import { AUTH_MESSAGES } from './errors.js'
import { getAdminPrincipal, type AdminPrincipal } from './principal.js'

// 정본: hangang-home apps/api/src/core/decorators/{public,self-only,require-permissions,require-any-permissions,
//       current-user}.decorator.ts
// 바꾼 점: 메타 키에 admin-kit: 접두. @CurrentUser → @CurrentAdmin(req.admin — 스펙 ⑦ N1). 권한 인자는 string 이다 —
//   프로젝트 권한 유니온으로 좁히려면 쓰는 쪽이 감싼다. @Cookies 는 옮기지 않았다(컨트롤러가 readCookie 로 읽는다).

/**
 * 관리자 인증 · 권한 가드를 건너뛴다. 🔴 가드는 앱 전역이다(스펙 ② G1) — 관리자 라우트에서는 로그인 · 갱신 · 로그아웃
 * 뿐이고, 회원 · 공개 · 헬스체크 컨트롤러는 클래스에 붙인다.
 */
export function Public(): CustomDecorator<string> {
  return SetMetadata(IS_PUBLIC, true)
}

/** 🔴 "인증만 요구한다" 는 명시 선언이다. 부재가 아니라 이 선언이 통과다(hangang). */
export function SelfOnly(): CustomDecorator<string> {
  return SetMetadata(IS_SELF_ONLY, true)
}

/** AND — 나열한 권한을 모두 가져야 통과한다. `'*'` 는 정확 일치로 전부다. */
export function RequirePermissions(...permissions: string[]): CustomDecorator<string> {
  return SetMetadata(REQUIRED_PERMISSIONS, permissions)
}

/** OR — 나열한 권한 중 하나라도 있으면 통과한다. */
export function RequireAnyPermissions(...permissions: string[]): CustomDecorator<string> {
  return SetMetadata(ANY_PERMISSIONS, permissions)
}

/** 내부 — 강제 변경 계정에도 연다. `me` · `password` 에만 붙인다. 공개하지 않는다(index 에 없다). */
export function AllowDuringPasswordChange(): CustomDecorator<string> {
  return SetMetadata(ALLOW_PASSWORD_CHANGE, true)
}

/** 인증 가드가 채운 주체. 🔴 없으면 401 — @Public 라우트에서 잘못 쓰면 조용히 undefined 가 되는 대신 드러난다. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminPrincipal => {
    const principal = getAdminPrincipal(ctx.switchToHttp().getRequest<Request>())
    if (principal == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }
    return principal
  },
)
