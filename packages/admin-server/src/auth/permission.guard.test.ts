import 'reflect-metadata'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import {
  AllowDuringPasswordChange,
  Public,
  RequireAnyPermissions,
  RequirePermissions,
  SelfOnly,
} from './decorators.js'
import { AUTH_MESSAGES } from './errors.js'
import { resolveAuthConfig } from './options.js'
import { AdminPermissionGuard } from './permission.guard.js'
import { RequirePermissionSlot } from './permission-slots.js'
import type { AdminPrincipal } from './principal.js'

class Routes {
  @Public()
  open() {}

  @SelfOnly()
  self() {}

  undeclared() {}

  @RequirePermissions('user:read', 'user:write')
  both() {}

  @RequireAnyPermissions('team:read', 'role:read')
  any() {}

  @RequirePermissions('user:read')
  @RequireAnyPermissions('team:read', 'role:read')
  mixed() {}

  @SelfOnly()
  @AllowDuringPasswordChange()
  me() {}
}

@SelfOnly()
class SelfOnlyRoutes {
  plain() {}

  @RequirePermissions('audit:read')
  audit() {}
}

function principal(permissions: string[], isPasswordChangeRequired = false): AdminPrincipal {
  return {
    userNo: 1n,
    sessionNo: 10n,
    userId: 'u',
    userName: '사용자',
    roleNo: 1n,
    roleName: '역할',
    teamNo: null,
    teamName: null,
    permissions,
    isPasswordChangeRequired,
  }
}

function context(
  target: object,
  method: string,
  admin: AdminPrincipal | undefined,
  type = 'http',
): ExecutionContext {
  const handler = (target as Record<string, unknown>)[method] as () => void
  return {
    getType: () => type,
    getHandler: () => handler,
    getClass: () => (target as { constructor: unknown }).constructor,
    switchToHttp: () => ({ getRequest: () => ({ admin }) }),
  } as unknown as ExecutionContext
}

function guard(failClosed = true): AdminPermissionGuard {
  return new AdminPermissionGuard(
    new Reflector(),
    resolveAuthConfig({ jwtSecret: 's'.repeat(32), failClosed }, undefined, undefined, undefined),
  )
}

function rejection(run: () => unknown): BusinessError {
  try {
    run()
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('던지지 않았다')
}

const routes = new Routes()
const selfOnlyRoutes = new SelfOnlyRoutes()

class SlotRoutes {
  @RequirePermissionSlot('sessions.read')
  read() {}

  @RequirePermissionSlot('auditLogs.read')
  unmapped() {}

  @RequirePermissionSlot('sessions.manage')
  @RequirePermissions('user:write')
  both() {}

  @RequirePermissionSlot('roles.read', 'sessions.read')
  either() {}

  @RequirePermissionSlot('roles.manage', 'auditLogs.read')
  eitherUnmapped() {}
}

@SelfOnly()
class SelfOnlySlotRoutes {
  @RequirePermissionSlot('sessions.read')
  read() {}
}

const slotRoutes = new SlotRoutes()
const selfOnlySlotRoutes = new SelfOnlySlotRoutes()

function slotGuard(): AdminPermissionGuard {
  return new AdminPermissionGuard(
    new Reflector(),
    resolveAuthConfig(
      { jwtSecret: 's'.repeat(32) },
      undefined,
      {
        'sessions.read': 'org.users:read',
        'sessions.manage': 'org.users:write',
      },
      undefined,
    ),
  )
}

describe('AdminPermissionGuard', () => {
  it('🔴 rpc · ws 컨텍스트만 통과(스펙 §14 R4 · R10)', () => {
    expect(guard().canActivate(context(routes, 'undeclared', undefined, 'rpc'))).toBe(true)
    expect(guard().canActivate(context(routes, 'undeclared', undefined, 'ws'))).toBe(true)
  })

  it('🔴 GraphQL 같은 그 밖의 비HTTP 컨텍스트는 401(스펙 §14 R10)', () => {
    let error: unknown
    try {
      guard().canActivate(context(routes, 'open', undefined, 'graphql'))
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED)
  })

  it('@Public 은 주체 없이 통과', () => {
    expect(guard().canActivate(context(routes, 'open', undefined))).toBe(true)
  })

  it('주체가 없으면 401', () => {
    const error = rejection(() => guard().canActivate(context(routes, 'self', undefined)))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED)
    expect(error.message).toBe(AUTH_MESSAGES.unauthorized)
  })

  it('🔴 강제 변경 계정은 허용 표시가 있는 라우트만 — 권한 판정보다 먼저', () => {
    const changing = principal(['*'], true)
    expect(guard().canActivate(context(routes, 'me', changing))).toBe(true)
    for (const method of ['self', 'both', 'undeclared']) {
      const error = rejection(() => guard().canActivate(context(routes, method, changing)))
      expect(error.code).toBe(CommonErrorCodes.ERR_PASSWORD_CHANGE_REQUIRED)
      expect(error.message).toBe(AUTH_MESSAGES.passwordChangeRequired)
    }
  })

  it('@SelfOnly 는 인증만으로 통과', () => {
    expect(guard().canActivate(context(routes, 'self', principal([])))).toBe(true)
  })

  it('🔴 선언이 없으면 403 + reason — fail-closed. "*" 도 막는다', () => {
    for (const granted of [[], ['*']]) {
      const error = rejection(() =>
        guard().canActivate(context(routes, 'undeclared', principal(granted))),
      )
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
      expect(error.message).toBe(AUTH_MESSAGES.noPermissionDeclared)
      expect(error.details).toEqual({ reason: 'no-permission-declared' })
    }
  })

  it('failClosed: false 면 선언 없는 라우트가 인증만으로 통과', () => {
    expect(guard(false).canActivate(context(routes, 'undeclared', principal([])))).toBe(true)
  })

  it('AND — 전부 가져야 한다, "*" 는 정확 일치로 전부', () => {
    expect(() => guard().canActivate(context(routes, 'both', principal(['user:read'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
    expect(
      guard().canActivate(context(routes, 'both', principal(['user:read', 'user:write']))),
    ).toBe(true)
    expect(guard().canActivate(context(routes, 'both', principal(['*'])))).toBe(true)
    // 'user:*' 는 접두 와일드카드가 아니다
    expect(() => guard().canActivate(context(routes, 'both', principal(['user:*'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
  })

  it('OR — 하나라도', () => {
    expect(guard().canActivate(context(routes, 'any', principal(['role:read'])))).toBe(true)
    expect(() => guard().canActivate(context(routes, 'any', principal(['user:read'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
  })

  it('AND · OR 가 함께면 둘 다 통과해야 한다', () => {
    expect(() => guard().canActivate(context(routes, 'mixed', principal(['user:read'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
    expect(() => guard().canActivate(context(routes, 'mixed', principal(['team:read'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
    expect(
      guard().canActivate(context(routes, 'mixed', principal(['user:read', 'team:read']))),
    ).toBe(true)
  })

  it('🔴 클래스 @SelfOnly 여도 메서드의 권한 선언은 지켜진다(스펙 §14 R3)', () => {
    expect(guard().canActivate(context(selfOnlyRoutes, 'plain', principal([])))).toBe(true)
    expect(() => guard().canActivate(context(selfOnlyRoutes, 'audit', principal([])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
    expect(guard().canActivate(context(selfOnlyRoutes, 'audit', principal(['audit:read'])))).toBe(
      true,
    )
  })
})

describe('AdminPermissionGuard — 권한 슬롯(2c 스펙 ① P1)', () => {
  it('맵이 이은 키를 가진 주체는 통과, 없으면 403', () => {
    expect(
      slotGuard().canActivate(context(slotRoutes, 'read', principal(['org.users:read']))),
    ).toBe(true)
    const error = rejection(() =>
      slotGuard().canActivate(context(slotRoutes, 'read', principal(['user:read']))),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(AUTH_MESSAGES.forbidden)
  })

  it("'*' 는 이어진 슬롯을 통과한다", () => {
    expect(slotGuard().canActivate(context(slotRoutes, 'read', principal(['*'])))).toBe(true)
  })

  it("🔴 이어지지 않은 슬롯은 '*' 도 403 — 기동 검사를 피한 조합의 방어선", () => {
    const error = rejection(() =>
      slotGuard().canActivate(context(slotRoutes, 'unmapped', principal(['*']))),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })

  it('🔴 슬롯은 클래스 @SelfOnly 보다 먼저다', () => {
    const error = rejection(() =>
      slotGuard().canActivate(context(selfOnlySlotRoutes, 'read', principal([]))),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })

  it('슬롯과 @RequirePermissions 는 AND', () => {
    expect(() =>
      slotGuard().canActivate(context(slotRoutes, 'both', principal(['org.users:write']))),
    ).toThrow(BusinessError)
    expect(
      slotGuard().canActivate(
        context(slotRoutes, 'both', principal(['org.users:write', 'user:write'])),
      ),
    ).toBe(true)
  })

  it('슬롯 여럿은 "하나라도"(2d 스펙 B13) — 이어진 슬롯 하나만 가져도 통과', () => {
    expect(
      slotGuard().canActivate(context(slotRoutes, 'either', principal(['org.users:read']))),
    ).toBe(true)
    expect(() =>
      slotGuard().canActivate(context(slotRoutes, 'either', principal(['user:read']))),
    ).toThrow(BusinessError)
  })

  it("🔴 이어지지 않은 슬롯은 '*' 에게도 거짓 — 여럿이 다 이어지지 않으면 403", () => {
    const error = rejection(() =>
      slotGuard().canActivate(context(slotRoutes, 'eitherUnmapped', principal(['*']))),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })

  it('셋째 인자가 없으면 슬롯 맵은 비어 있다(2b 호출부 그대로)', () => {
    expect(
      resolveAuthConfig({ jwtSecret: 's'.repeat(32) }, undefined, undefined, undefined).permissions,
    ).toEqual({})
  })
})
