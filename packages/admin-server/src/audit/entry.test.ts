import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import type { AdminPrincipal } from '../auth/principal.js'
import { attachAuditMeta, attachAuditTarget } from './audit-bag.js'
import {
  AUDIT_COLUMN_WIDTHS,
  buildAuditEntry,
  clampCodePoints,
  pickTargetRefNo,
  requestFieldsOf,
} from './entry.js'
import { secretKeySet } from './scrub.js'

function fakeRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    method: 'DELETE',
    originalUrl: '/api/admin/sessions/12?keyword=secret',
    params: { sessionNo: '12' },
    ip: '10.0.0.1',
    headers: { 'user-agent': 'UA/1' },
    ...overrides,
  } as unknown as Request
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

describe('clampCodePoints', () => {
  it('🔴 이모지를 코드 포인트로 자른다 — 서로게이트 반쪽이 남지 않는다', () => {
    const clamped = clampCodePoints('😀'.repeat(300), 255)
    expect([...clamped]).toHaveLength(255)
    expect(clamped).toHaveLength(510)
    expect(clampCodePoints('짧다', 255)).toBe('짧다')
  })
})

describe('requestFieldsOf', () => {
  it('쿼리를 뗀 경로 · 메서드 · IP · UA', () => {
    expect(requestFieldsOf(fakeRequest(), 'req.ip')).toEqual({
      method: 'DELETE',
      path: '/api/admin/sessions/12',
      ip: '10.0.0.1',
      userAgent: 'UA/1',
    })
  })

  it('🔴 폭을 넘는 이모지 UA · 경로를 컬럼 폭으로 자른다(Review Focus 1)', () => {
    const fields = requestFieldsOf(
      fakeRequest({
        originalUrl: `/a/${'😀'.repeat(300)}`,
        headers: { 'user-agent': '😀'.repeat(400) },
        method: 'VERYLONGMETHOD',
      }),
      'req.ip',
    )
    expect([...fields.path]).toHaveLength(AUDIT_COLUMN_WIDTHS.path)
    expect([...(fields.userAgent ?? '')]).toHaveLength(AUDIT_COLUMN_WIDTHS.userAgent)
    expect(fields.method).toBe('VERYLONG')
  })

  it('IP · UA 가 없으면 null', () => {
    expect(requestFieldsOf(fakeRequest({ ip: undefined, headers: {} }), 'req.ip')).toMatchObject({
      ip: null,
      userAgent: null,
    })
  })

  it("clientIp 출처 — 'x-real-ip' 는 헤더, 둘 다 정규화한다(2f-1 P10)", () => {
    expect(
      requestFieldsOf(
        fakeRequest({ headers: { 'user-agent': 'UA/1', 'x-real-ip': '::ffff:203.0.113.7' } }),
        'x-real-ip',
      ).ip,
    ).toBe('203.0.113.7')
    expect(requestFieldsOf(fakeRequest({ ip: '::ffff:10.0.0.1' }), 'req.ip').ip).toBe('10.0.0.1')
  })
})

describe('pickTargetRefNo(2c 스펙 B6)', () => {
  it('🔴 핸들러가 붙인 값이 먼저다', () => {
    expect(pickTargetRefNo(fakeRequest(), undefined, 5n)).toBe(5n)
  })

  it('paramKey 가 가리키는 경로 변수 — 읽히지 않으면 다음 갈래', () => {
    const req = fakeRequest({ params: { userNo: '4', sessionNo: '12' } })
    expect(pickTargetRefNo(req, 'userNo', undefined)).toBe(4n)
    expect(
      pickTargetRefNo(fakeRequest({ params: { userNo: 'x', n: '8' } }), 'userNo', undefined),
    ).toBe(8n)
  })

  it('숫자 경로 변수가 정확히 하나일 때만 — 둘이면 고르지 않는다', () => {
    expect(pickTargetRefNo(fakeRequest(), undefined, undefined)).toBe(12n)
    expect(
      pickTargetRefNo(fakeRequest({ params: { a: '1', b: '2' } }), undefined, undefined),
    ).toBeNull()
    expect(pickTargetRefNo(fakeRequest({ params: {} }), undefined, undefined)).toBeNull()
  })

  it('BIGINT UNSIGNED 범위 밖 · 부호 · 공백은 읽지 않는다', () => {
    for (const value of ['18446744073709551616', '-1', ' 1']) {
      expect(
        pickTargetRefNo(fakeRequest({ params: { n: value } }), undefined, undefined),
      ).toBeNull()
    }
  })
})

describe('buildAuditEntry', () => {
  it('주체 · 메타 · 결과 · 가방을 한 행으로', () => {
    const req = fakeRequest()
    attachAuditMeta(req, { revokedCount: 1, token: 't' })
    expect(
      buildAuditEntry(
        req,
        principal,
        { action: 'session.revoke', targetType: 'session' },
        { status: 200, errorCode: null },
        secretKeySet(),
        'req.ip',
      ),
    ).toEqual({
      actorUserNo: 3n,
      sessionNo: 9n,
      action: 'session.revoke',
      targetType: 'session',
      targetRefNo: 12n,
      method: 'DELETE',
      path: '/api/admin/sessions/12',
      statusCode: 200,
      errorCode: null,
      ip: '10.0.0.1',
      userAgent: 'UA/1',
      meta: '{"revokedCount":1,"token":"***"}',
    })
  })

  it('가방이 없으면 meta null, 대상 종류가 없으면 null, 붙인 대상이 이긴다', () => {
    const req = fakeRequest()
    attachAuditTarget(req, 99n)
    const entry = buildAuditEntry(
      req,
      principal,
      { action: 'x' },
      { status: 409, errorCode: 'ERR_COMMON_CONFLICT' },
      secretKeySet(),
      'req.ip',
    )
    expect(entry).toMatchObject({ targetType: null, targetRefNo: 99n, meta: null, statusCode: 409 })
    expect(
      buildAuditEntry(
        fakeRequest(),
        principal,
        { action: 'x' },
        { status: 200, errorCode: null },
        secretKeySet(),
        'req.ip',
      ).meta,
    ).toBeNull()
  })

  it('쓰는 쪽의 긴 오류 코드는 64 로 자른다', () => {
    const entry = buildAuditEntry(
      fakeRequest(),
      principal,
      { action: 'x' },
      { status: 400, errorCode: `ERR_${'X'.repeat(100)}` },
      secretKeySet(),
      'req.ip',
    )
    expect(entry.errorCode).toHaveLength(AUDIT_COLUMN_WIDTHS.errorCode)
  })
})
