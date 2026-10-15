import { definePasswordPolicy } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { MIN_JWT_SECRET_LENGTH, resolveAuthConfig } from './options.js'

const secret = 's'.repeat(MIN_JWT_SECRET_LENGTH)

describe('resolveAuthConfig', () => {
  it('기본값', () => {
    const config = resolveAuthConfig({ jwtSecret: secret }, undefined)
    expect(config).toMatchObject({
      jwtSecret: secret,
      accessTtlMs: 900_000,
      refreshTtlMs: 604_800_000,
      refreshGraceMs: 30_000,
      lockout: { maxFailures: 5, lockMs: 900_000 },
      cookies: {
        accessName: 'admin_at',
        refreshName: 'admin_rt',
        refreshPath: '/',
        sameSite: 'lax',
        secure: 'auto',
        domain: undefined,
      },
      failClosed: true,
    })
    expect(config.passwordPolicy.minLength).toBe(8)
    expect(config.passwordPolicy.maxLength).toBe(200)
  })

  it('사용자 값과 정책을 그대로 쓴다', () => {
    const policy = definePasswordPolicy({ minLength: 12 })
    const config = resolveAuthConfig(
      {
        jwtSecret: secret,
        accessTtlMs: 60_000,
        refreshTtlMs: 120_000,
        refreshGraceMs: 0,
        lockout: { maxFailures: 3 },
        cookies: {
          accessName: 'hg_admin_at',
          refreshName: 'hg_admin_rt',
          refreshPath: '/api/admin/auth',
          sameSite: 'strict',
          secure: true,
          domain: 'example.com',
        },
        failClosed: false,
      },
      policy,
    )
    expect(config).toMatchObject({
      accessTtlMs: 60_000,
      refreshTtlMs: 120_000,
      refreshGraceMs: 0,
      lockout: { maxFailures: 3, lockMs: 900_000 },
      cookies: {
        refreshPath: '/api/admin/auth',
        sameSite: 'strict',
        secure: true,
        domain: 'example.com',
      },
      failClosed: false,
    })
    expect(config.passwordPolicy).toBe(policy)
  })

  it.each([
    ['auth 없음', undefined, 'auth.jwtSecret'],
    ['짧은 비밀키', { jwtSecret: 's'.repeat(31) }, 'auth.jwtSecret 은 32자 이상'],
    ['accessTtlMs 0', { jwtSecret: secret, accessTtlMs: 0 }, 'auth.accessTtlMs'],
    ['refreshTtlMs 소수', { jwtSecret: secret, refreshTtlMs: 1.5 }, 'auth.refreshTtlMs'],
    ['refreshGraceMs 음수', { jwtSecret: secret, refreshGraceMs: -1 }, 'auth.refreshGraceMs'],
    [
      'refreshGraceMs ≥ accessTtlMs',
      { jwtSecret: secret, accessTtlMs: 60_000, refreshGraceMs: 60_000 },
      'auth.refreshGraceMs',
    ],
    ['lockout.maxFailures 0', { jwtSecret: secret, lockout: { maxFailures: 0 } }, /maxFailures/],
    ['쿠키 이름 공백', { jwtSecret: secret, cookies: { accessName: 'a b' } }, /accessName/],
    [
      '두 쿠키 이름이 같음',
      { jwtSecret: secret, cookies: { accessName: 'x', refreshName: 'x' } },
      /같다/,
    ],
    [
      'refreshPath 가 / 로 시작하지 않음',
      { jwtSecret: secret, cookies: { refreshPath: 'api' } },
      /refreshPath/,
    ],
  ])('%s → 던진다', (_label, auth, message) => {
    expect(() => resolveAuthConfig(auth, undefined)).toThrow(message)
  })

  it("clientIp — 기본 'req.ip' · 'x-real-ip' · 모르는 값은 기동에서 멈춘다(2f-1 ④ C1)", () => {
    const auth = { jwtSecret: 'x'.repeat(32) }
    expect(resolveAuthConfig(auth, undefined).clientIp).toBe('req.ip')
    expect(resolveAuthConfig(auth, undefined, undefined, 'x-real-ip').clientIp).toBe('x-real-ip')
    expect(() => resolveAuthConfig(auth, undefined, undefined, 'X-Real-IP')).toThrow(
      "clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.",
    )
  })

  it('🔴 오류 메시지에 비밀키 값이 없다', () => {
    const short = 'TOP-SECRET-VALUE'
    try {
      resolveAuthConfig({ jwtSecret: short }, undefined)
      expect.unreachable()
    } catch (error) {
      expect(String(error)).not.toContain(short)
    }
  })
})
