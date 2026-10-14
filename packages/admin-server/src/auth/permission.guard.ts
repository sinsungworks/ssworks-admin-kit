import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
  BusinessError,
  CommonErrorCodes,
  hasAnyPermission,
  hasPermission,
} from '@ssworks/admin-shared'
import type { Request } from 'express'
import {
  ADMIN_AUTH_CONFIG,
  ALLOW_PASSWORD_CHANGE,
  ANY_PERMISSIONS,
  IS_PUBLIC,
  IS_SELF_ONLY,
  PERMISSION_SLOT,
  REQUIRED_PERMISSIONS,
} from '../tokens.js'
import { AUTH_MESSAGES } from './errors.js'
import type { ResolvedAuthConfig } from './options.js'
import type { AdminPermissionSlot } from './permission-slots.js'
import { getAdminPrincipal } from './principal.js'

// 정본: hangang-home apps/api/src/core/guards/permission.guard.ts(fail-closed · @SelfOnly 명시 통과 · AND/OR)
// 바꾼 점:
//  - 🔴 권한 선언이 @SelfOnly 보다 먼저다(스펙 §14 R3). hangang 은 @SelfOnly 면 곧바로 통과시켜, 클래스 @SelfOnly +
//    메서드 @RequirePermissions 가 권한 검사 없이 열렸다.
//  - 강제 변경 계정은 허용 표시가 있는 라우트만(gise — 권한을 빈 배열로 보는 것만으로는 @SelfOnly 라우트가 열린다).
//  - 판정은 admin-shared hasPermission · hasAnyPermission('*' 정확 일치 — 화면과 같은 함수).
//  - failClosed: false 과도기 옵션(Phase 0 §4 #5). rpc · ws 만 통과, 그 밖의 비HTTP 는 401(스펙 §14 R4 · R10).
//  - 패키지 라우트의 권한 슬롯(2c 스펙 ① P1)은 권한 선언과 같은 층이다 — 슬롯 · @RequirePermissions 가 함께면 AND.

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const type = context.getType<string>()
    // 🔴 쿠키 인증을 할 수 없는 마이크로서비스 · WebSocket 만 지나친다(스펙 §14 R4). 그 밖의 비HTTP 컨텍스트(GraphQL 등 — HTTP 위에서
    //    쿠키를 싣고 온다)는 막는다 — 통과시키면 전역 가드가 통째로 열린다(최종 리뷰 F4).
    if (type === 'rpc' || type === 'ws') return true
    if (type !== 'http') {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }
    const targets = [context.getHandler(), context.getClass()]
    const flag = (key: string): boolean =>
      this.reflector.getAllAndOverride<boolean | undefined>(key, targets) === true

    if (flag(IS_PUBLIC)) return true

    const principal = getAdminPrincipal(context.switchToHttp().getRequest<Request>())
    if (principal == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }

    if (principal.isPasswordChangeRequired && !flag(ALLOW_PASSWORD_CHANGE)) {
      throw new BusinessError(
        CommonErrorCodes.ERR_PASSWORD_CHANGE_REQUIRED,
        AUTH_MESSAGES.passwordChangeRequired,
      )
    }

    const slot = this.reflector.getAllAndOverride<AdminPermissionSlot | undefined>(
      PERMISSION_SLOT,
      targets,
    )
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS,
      targets,
    )
    const anyOf = this.reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSIONS, targets)
    const hasRequired = required != null && required.length > 0
    const hasAnyOf = anyOf != null && anyOf.length > 0

    if (slot != null || hasRequired || hasAnyOf) {
      if (slot != null) {
        // 🔴 이어지지 않은 슬롯은 '*' 도 막는다 — 기동 검사(assertPermissionSlots)를 피한 조합의 방어선이다(2c 스펙 §4-1).
        const key = this.config.permissions[slot]
        if (key == null || !hasPermission(principal.permissions, key)) throw forbidden()
      }
      if (hasRequired && !hasPermission(principal.permissions, ...required)) throw forbidden()
      if (hasAnyOf && !hasAnyPermission(principal.permissions, ...anyOf)) throw forbidden()
      return true
    }

    if (flag(IS_SELF_ONLY)) return true

    // 🔴 여기가 fail-closed 다. 선언이 없는 라우트는 잠그는 것을 잊은 라우트다 — hangang 은 상류 22곳에 데코레이터가
    //    0건이었다. 부재를 통과로 읽으면 그 라우트가 로그인한 누구에게나 열린다. '*' 도 막는다.
    if (!this.config.failClosed) return true
    throw new BusinessError(
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      AUTH_MESSAGES.noPermissionDeclared,
      { reason: 'no-permission-declared' },
    )
  }
}

function forbidden(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_FORBIDDEN, AUTH_MESSAGES.forbidden)
}
