import 'reflect-metadata'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it, vi } from 'vitest'
import { AdminAuthGuard } from './auth.guard.js'
import type { AdminAuthService } from './auth.service.js'
import { Public } from './decorators.js'
import { resolveAuthConfig } from './options.js'
import type { AdminPrincipal } from './principal.js'

class Routes {
  @Public()
  open() {}

  closed() {}
}

const routes = new Routes()
const config = resolveAuthConfig({ jwtSecret: 's'.repeat(32) }, undefined)

const principal = { userNo: 1n, sessionNo: 10n, userId: 'u' } as unknown as AdminPrincipal

function setup() {
  const authenticate = vi.fn(async () => principal)
  const guard = new AdminAuthGuard(
    new Reflector(),
    { authenticate } as unknown as AdminAuthService,
    config,
  )
  return { guard, authenticate }
}

function context(method: 'open' | 'closed', type: string, req: object = {}): ExecutionContext {
  return {
    getType: () => type,
    getHandler: () => routes[method],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext
}

describe('AdminAuthGuard', () => {
  it.each(['rpc', 'ws'])('🔴 %s 컨텍스트는 인증 없이 통과(스펙 §14 R4)', async (type) => {
    const { guard, authenticate } = setup()
    await expect(guard.canActivate(context('closed', type))).resolves.toBe(true)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('🔴 GraphQL 같은 그 밖의 비HTTP 컨텍스트는 401 — 인증을 부르지 않는다(스펙 §14 R10)', async () => {
    const { guard, authenticate } = setup()
    const error = await guard
      .canActivate(context('open', 'graphql'))
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('HTTP 의 @Public 핸들러는 인증 없이 통과', async () => {
    const { guard, authenticate } = setup()
    await expect(guard.canActivate(context('open', 'http'))).resolves.toBe(true)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('HTTP 는 액세스 쿠키로 인증하고 req.admin 에 주체를 둔다', async () => {
    const { guard, authenticate } = setup()
    const req: { cookies: Record<string, string>; admin?: AdminPrincipal } = {
      cookies: { [config.cookies.accessName]: 'token-value' },
    }
    await expect(guard.canActivate(context('closed', 'http', req))).resolves.toBe(true)
    expect(authenticate).toHaveBeenCalledWith('token-value', req)
    expect(req.admin).toBe(principal)
  })
})
