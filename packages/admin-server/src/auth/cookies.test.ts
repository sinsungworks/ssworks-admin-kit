import type { Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAuthCookies, isSecureRequest, readCookie, setAuthCookies } from './cookies.js'
import { resolveAuthConfig, type AdminAuthCookieOptions } from './options.js'

function fakeRequest(input: {
  secure?: boolean
  headers?: Record<string, unknown>
  cookies?: unknown
}) {
  return {
    secure: input.secure ?? false,
    headers: input.headers ?? {},
    cookies: input.cookies,
  } as unknown as Request
}

function fakeResponse() {
  const cookie = vi.fn()
  const clearCookie = vi.fn()
  return { res: { cookie, clearCookie } as unknown as Response, cookie, clearCookie }
}

function config(cookies: AdminAuthCookieOptions = {}) {
  return resolveAuthConfig({ jwtSecret: 's'.repeat(32), cookies }, undefined)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isSecureRequest — Secure "auto"', () => {
  it.each([
    ['req.secure', { secure: true }, true],
    ['X-Forwarded-Proto https', { headers: { 'x-forwarded-proto': 'https' } }, true],
    ['여러 값의 첫 값', { headers: { 'x-forwarded-proto': 'https, http' } }, true],
    ['대문자', { headers: { 'x-forwarded-proto': 'HTTPS' } }, true],
    ['첫 값이 http', { headers: { 'x-forwarded-proto': 'http, https' } }, false],
    ['평범한 http', {}, false],
  ])('%s → %s', (_label, input, expected) => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(isSecureRequest(fakeRequest(input))).toBe(expected)
  })

  it('🔴 NODE_ENV=production 이면 http 여도 Secure — 헤더만 믿으면 클라이언트가 벗길 수 있다(hangang)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(isSecureRequest(fakeRequest({}))).toBe(true)
  })
})

describe('setAuthCookies · clearAuthCookies', () => {
  it('두 쿠키 — httpOnly · lax · Path=/ · maxAge 는 각 TTL', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const { res, cookie } = fakeResponse()
    setAuthCookies(fakeRequest({}), res, config(), { accessToken: 'A', refreshToken: 'R' })
    expect(cookie).toHaveBeenCalledWith('admin_at', 'A', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 900_000,
    })
    expect(cookie).toHaveBeenCalledWith('admin_rt', 'R', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 604_800_000,
    })
  })

  it('🔴 clear 는 set 과 같은 속성이다 — path 가 어긋난 clearCookie 를 브라우저는 무시한다(crm 사고)', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const custom = config({ refreshPath: '/api/admin/auth', domain: 'example.com', secure: true })
    const set = fakeResponse()
    const cleared = fakeResponse()
    setAuthCookies(fakeRequest({}), set.res, custom, { accessToken: 'A', refreshToken: 'R' })
    clearAuthCookies(fakeRequest({}), cleared.res, custom)
    for (const [index, name] of ['admin_at', 'admin_rt'].entries()) {
      const { maxAge: _maxAge, ...setOptions } = set.cookie.mock.calls[index]![2] as Record<
        string,
        unknown
      >
      expect(cleared.clearCookie).toHaveBeenCalledWith(name, setOptions)
    }
    expect(set.cookie.mock.calls[1]![2]).toMatchObject({
      path: '/api/admin/auth',
      domain: 'example.com',
      secure: true,
    })
    expect(set.cookie.mock.calls[0]![2]).toMatchObject({ path: '/' })
  })

  it('secure: false 는 production 에서도 Secure 를 빼고, domain 이 없으면 키를 싣지 않는다', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { res, cookie } = fakeResponse()
    setAuthCookies(fakeRequest({}), res, config({ secure: false }), {
      accessToken: 'A',
      refreshToken: 'R',
    })
    expect(cookie.mock.calls[0]![2]).toMatchObject({ secure: false })
    expect(cookie.mock.calls[0]![2]).not.toHaveProperty('domain')
  })
})

describe('readCookie', () => {
  it.each([
    ['문자열', { admin_rt: 'abc' }, 'abc'],
    ['빈 문자열', { admin_rt: '' }, undefined],
    ['🔴 j: 객체(cookie-parser 가 JSON 으로 풀었다)', { admin_rt: { a: 1 } }, undefined],
    ['j: 배열', { admin_rt: [1] }, undefined],
    ['없음', {}, undefined],
    ['req.cookies 자체가 없음', undefined, undefined],
  ])('%s', (_label, cookies, expected) => {
    expect(readCookie(fakeRequest({ cookies }), 'admin_rt')).toBe(expected)
  })
})
