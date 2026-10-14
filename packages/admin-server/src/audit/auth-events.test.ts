import { CommonErrorCodes, CoreAuditActions, defineErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import type { AdminAuthEvent } from '../auth/hooks.js'
import type { AdminServerOptions } from '../options.js'
import type { AdminAuditService } from './audit.service.js'
import { AdminAuditEventSink, auditEntryOfAuthEvent } from './auth-events.js'
import type { AuditInsert } from './entry.js'
import { resolveAuditConfig } from './options.js'

describe('auditEntryOfAuthEvent(2c 스펙 §5-5)', () => {
  const cases: [AdminAuthEvent, Partial<ReturnType<typeof auditEntryOfAuthEvent>>][] = [
    [
      { type: 'login.success', userNo: 3n, sessionNo: 9n },
      {
        action: CoreAuditActions.AUTH_LOGIN_SUCCESS,
        actorUserNo: 3n,
        sessionNo: 9n,
        targetType: 'user',
        targetRefNo: 3n,
        errorCode: null,
        meta: null,
      },
    ],
    [
      { type: 'login.fail', userId: 'nobody', userNo: null, loginFailCount: null },
      {
        action: CoreAuditActions.AUTH_LOGIN_FAIL,
        actorUserNo: null,
        sessionNo: null,
        targetType: null,
        targetRefNo: null,
        errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
        meta: { userId: 'nobody', loginFailCount: null },
      },
    ],
    [
      { type: 'login.fail', userId: 'admin', userNo: 3n, loginFailCount: 2 },
      {
        actorUserNo: 3n,
        targetType: 'user',
        targetRefNo: 3n,
        meta: { userId: 'admin', loginFailCount: 2 },
      },
    ],
    [
      { type: 'login.blocked', reason: 'resigned', userId: 'a', userNo: 3n },
      {
        action: CoreAuditActions.AUTH_LOGIN_BLOCKED_INACTIVE,
        errorCode: CommonErrorCodes.ERR_RESIGNED_USER,
        targetRefNo: 3n,
        meta: { userId: 'a' },
      },
    ],
    [
      { type: 'login.blocked', reason: 'ip', userId: 'a', userNo: 3n },
      {
        action: CoreAuditActions.AUTH_LOGIN_BLOCKED_IP,
        errorCode: CommonErrorCodes.ERR_IP_NOT_ALLOWED,
      },
    ],
    [
      { type: 'login.blocked', reason: 'locked', userId: 'a', userNo: 3n },
      // 🔴 잠긴 동안의 로그인은 실패와 같은 401 이다(2b §14 R7) — 코드도 응답과 같게
      {
        action: CoreAuditActions.AUTH_LOGIN_BLOCKED_LOCKED,
        errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
      },
    ],
    [
      { type: 'token.refresh', userNo: 3n, sessionNo: 10n, rotatedFrom: 9n, grace: false },
      {
        action: CoreAuditActions.AUTH_TOKEN_REFRESH,
        sessionNo: 10n,
        targetType: 'session',
        targetRefNo: 10n,
        errorCode: null,
        meta: { rotatedFrom: 9n, grace: false },
      },
    ],
    [
      { type: 'token.reuse', userNo: 3n, sessionNo: 9n, revokedCount: 2 },
      {
        action: CoreAuditActions.AUTH_TOKEN_REUSE,
        sessionNo: 9n,
        targetRefNo: 9n,
        errorCode: CommonErrorCodes.ERR_REFRESH_REUSED,
        meta: { revokedCount: 2 },
      },
    ],
    [
      { type: 'logout', userNo: 3n, sessionNo: 9n },
      {
        action: CoreAuditActions.AUTH_LOGOUT,
        targetType: 'session',
        targetRefNo: 9n,
        errorCode: null,
      },
    ],
    [
      { type: 'password.change', userNo: 3n, sessionNo: 9n, revokedCount: 1 },
      {
        action: CoreAuditActions.AUTH_PASSWORD_CHANGE,
        targetType: 'user',
        targetRefNo: 3n,
        sessionNo: 9n,
        meta: { revokedCount: 1 },
      },
    ],
    [
      { type: 'access.blocked', reason: 'ip', userNo: 3n, sessionNo: 9n },
      {
        action: CoreAuditActions.AUTH_ACCESS_BLOCKED_IP,
        targetType: 'session',
        errorCode: CommonErrorCodes.ERR_IP_NOT_ALLOWED,
      },
    ],
  ]

  it.each(cases)('%o', (event, expected) => {
    expect(auditEntryOfAuthEvent(event)).toMatchObject(expected)
  })
})

class FakeAudit {
  readonly entries: AuditInsert[] = []
  readonly warnings: string[] = []
  failWith: Error | null = null

  async insert(entry: AuditInsert): Promise<void> {
    if (this.failWith) throw this.failWith
    this.entries.push(entry)
  }

  warn(message: string): void {
    this.warnings.push(message)
  }
}

const req = {
  method: 'POST',
  originalUrl: '/api/admin/auth/login',
  ip: '10.0.0.1',
  headers: { 'user-agent': 'UA/1' },
} as unknown as Request

function sink(audit: FakeAudit, options?: Partial<AdminServerOptions>): AdminAuditEventSink {
  return new AdminAuditEventSink(
    audit as unknown as AdminAuditService,
    resolveAuditConfig(undefined),
    options as AdminServerOptions | undefined,
  )
}

describe('AdminAuditEventSink', () => {
  it('요청 필드 · 상태(응답과 같은 판정) · 접힌 meta 로 한 행', async () => {
    const audit = new FakeAudit()
    await sink(audit).record(
      { type: 'token.refresh', userNo: 3n, sessionNo: 10n, rotatedFrom: 9n, grace: true },
      req,
    )
    await sink(audit).record(
      { type: 'login.fail', userId: 'x', userNo: null, loginFailCount: null },
      req,
    )
    expect(audit.entries[0]).toEqual({
      actorUserNo: 3n,
      sessionNo: 10n,
      action: 'auth.token.refresh',
      targetType: 'session',
      targetRefNo: 10n,
      method: 'POST',
      path: '/api/admin/auth/login',
      statusCode: 200,
      errorCode: null,
      ip: '10.0.0.1',
      userAgent: 'UA/1',
      meta: '{"rotatedFrom":"9","grace":true}',
    })
    expect(audit.entries[1]).toMatchObject({ statusCode: 401, errorCode: 'ERR_LOGIN_FAILED' })
  })

  it('쓰는 쪽이 코어 코드 상태를 덮으면 그 상태로 — 필터가 보내는 값과 같다', async () => {
    const audit = new FakeAudit()
    const errorCodes = defineErrorCodes({}, { ERR_IP_NOT_ALLOWED: 401 })
    await sink(audit, { errorCodes }).record(
      { type: 'access.blocked', reason: 'ip', userNo: 3n, sessionNo: 9n },
      req,
    )
    expect(audit.entries[0]?.statusCode).toBe(401)
  })

  it('🔴 던지지 않는다 — 인증은 계속된다(2b B8)', async () => {
    const audit = new FakeAudit()
    audit.failWith = new Error('boom')
    // insert 는 실제로 던지지 않지만, 던져도 record 는 resolve 하고 경고를 남긴다.
    await expect(
      sink(audit).record({ type: 'logout', userNo: 3n, sessionNo: 9n }, req),
    ).resolves.toBeUndefined()
    expect(audit.warnings[0]).toContain('logout')
  })
})
