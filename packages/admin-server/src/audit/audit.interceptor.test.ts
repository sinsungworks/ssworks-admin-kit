import 'reflect-metadata'
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BusinessError, CommonErrorCodes, defineErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { lastValueFrom, of, throwError } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { setAdminPrincipal, type AdminPrincipal } from '../auth/principal.js'
import type { AdminServerOptions } from '../options.js'
import { Audit } from './audit.decorator.js'
import { AdminAuditInterceptor } from './audit.interceptor.js'
import type { AdminAuditService } from './audit.service.js'
import type { AuditInsert } from './entry.js'
import { resolveAuditConfig } from './options.js'

class Routes {
  @Audit({ action: 'session.revoke', targetType: 'session' })
  revoke() {}

  plain() {}
}

class FakeAudit {
  readonly entries: AuditInsert[] = []
  readonly warnings: string[] = []
  calls = 0
  failWith: Error | null = null
  gate: Promise<void> | null = null

  async insert(entry: AuditInsert): Promise<void> {
    this.calls += 1
    if (this.gate) await this.gate
    if (this.failWith) throw this.failWith
    this.entries.push(entry)
  }

  warn(message: string): void {
    this.warnings.push(message)
  }
}

const principal: AdminPrincipal = {
  userNo: 3n,
  sessionNo: 9n,
  userId: 'admin',
  userName: '관리자',
  roleNo: 1n,
  roleName: '역할',
  teamNo: null,
  teamName: null,
  permissions: ['*'],
  isPasswordChangeRequired: false,
}

function request(withPrincipal = true): Request {
  const req = {
    method: 'DELETE',
    originalUrl: '/api/admin/sessions/12',
    params: { sessionNo: '12' },
    ip: '10.0.0.1',
    headers: { 'user-agent': 'UA/1' },
  } as unknown as Request
  if (withPrincipal) setAdminPrincipal(req, principal)
  return req
}

function context(
  method: keyof Routes,
  req: Request,
  statusCode = 200,
  type = 'http',
): ExecutionContext {
  return {
    getType: () => type,
    getHandler: () => Routes.prototype[method],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode }) }),
  } as unknown as ExecutionContext
}

const ok = (value: unknown): CallHandler => ({ handle: () => of(value) })
const fail = (error: unknown): CallHandler => ({ handle: () => throwError(() => error) })

function interceptor(
  audit: FakeAudit,
  options?: Partial<AdminServerOptions>,
): AdminAuditInterceptor {
  return new AdminAuditInterceptor(
    new Reflector(),
    audit as unknown as AdminAuditService,
    resolveAuditConfig(undefined),
    options as AdminServerOptions | undefined,
  )
}

describe('AdminAuditInterceptor', () => {
  it('HTTP 가 아니거나 @Audit 이 없으면 기록하지 않는다', async () => {
    const audit = new FakeAudit()
    await lastValueFrom(
      interceptor(audit).intercept(context('revoke', request(), 200, 'rpc'), ok(1)),
    )
    await lastValueFrom(interceptor(audit).intercept(context('plain', request()), ok(1)))
    expect(audit.calls).toBe(0)
  })

  it('성공은 res.statusCode 로 — POST 201', async () => {
    const audit = new FakeAudit()
    const value = await lastValueFrom(
      interceptor(audit).intercept(context('revoke', request(), 201), ok({ a: 1 })),
    )
    expect(value).toEqual({ a: 1 })
    expect(audit.entries).toHaveLength(1)
    expect(audit.entries[0]).toMatchObject({
      action: 'session.revoke',
      targetRefNo: 12n,
      statusCode: 201,
      errorCode: null,
      actorUserNo: 3n,
      sessionNo: 9n,
    })
  })

  it('🔴 실패는 필터와 같은 상태 · 코드로 남기고 원래 예외를 그대로 다시 던진다', async () => {
    const audit = new FakeAudit()
    const error = new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, '없음')
    await expect(
      lastValueFrom(interceptor(audit).intercept(context('revoke', request()), fail(error))),
    ).rejects.toBe(error)
    expect(audit.entries[0]).toMatchObject({ statusCode: 404, errorCode: 'ERR_COMMON_NOT_FOUND' })
  })

  it('맨 Error 는 500 · ERR_COMMON_INTERNAL, 프로젝트 코드는 errorCodes 의 상태', async () => {
    const audit = new FakeAudit()
    await expect(
      lastValueFrom(
        interceptor(audit).intercept(context('revoke', request()), fail(new Error('x'))),
      ),
    ).rejects.toThrow('x')
    expect(audit.entries[0]).toMatchObject({ statusCode: 500, errorCode: 'ERR_COMMON_INTERNAL' })

    const errorCodes = defineErrorCodes({ ERR_NO_POST: 'ERR_NO_POST' }, { ERR_NO_POST: 410 })
    await expect(
      lastValueFrom(
        interceptor(audit, { errorCodes }).intercept(
          context('revoke', request()),
          fail(new BusinessError('ERR_NO_POST', '없음')),
        ),
      ),
    ).rejects.toBeInstanceOf(BusinessError)
    expect(audit.entries[1]).toMatchObject({ statusCode: 410, errorCode: 'ERR_NO_POST' })
  })

  it('🔴 기록이 던져도 응답은 그대로 — 두 번 기록하지 않는다', async () => {
    const audit = new FakeAudit()
    audit.failWith = new Error('db down')
    const value = await lastValueFrom(
      interceptor(audit).intercept(context('revoke', request()), ok('done')),
    )
    expect(value).toBe('done')
    expect(audit.calls).toBe(1)
    expect(audit.warnings[0]).toContain('db down')
  })

  it('🔴 기록을 기다린 뒤에 값을 낸다(hangang I2)', async () => {
    const audit = new FakeAudit()
    let release: () => void = () => {}
    audit.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let emitted = false
    const pending = lastValueFrom(
      interceptor(audit).intercept(context('revoke', request()), ok('v')),
    ).then((value) => {
      emitted = true
      return value
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(emitted).toBe(false)
    release()
    await expect(pending).resolves.toBe('v')
    expect(audit.entries).toHaveLength(1)
  })

  it('주체가 없으면(@Public) 기록하지 않는다', async () => {
    const audit = new FakeAudit()
    await lastValueFrom(interceptor(audit).intercept(context('revoke', request(false)), ok(1)))
    expect(audit.calls).toBe(0)
  })
})
