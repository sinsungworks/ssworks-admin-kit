import { JwtService } from '@nestjs/jwt'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { AdminAccessTokenService } from './access-token.service.js'
import { AUTH_MESSAGES } from './errors.js'
import { resolveAuthConfig } from './options.js'

const secret = 'access-token-test-secret'.padEnd(32, 'x')
const service = new AdminAccessTokenService(
  resolveAuthConfig({ jwtSecret: secret }, undefined, undefined, undefined),
)

function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >
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

describe('AdminAccessTokenService', () => {
  it('bigint 두 클레임을 래퍼 문자열로 싣고 되살린다 · exp − iat 는 accessTtlMs 를 초로 올림', () => {
    const token = service.sign({ userNo: 12n, sessionNo: 34n })
    const payload = payloadOf(token)
    expect(payload.userNo).toBe('BigInt(12)')
    expect(payload.sessionNo).toBe('BigInt(34)')
    expect(Number(payload.exp) - Number(payload.iat)).toBe(900)
    expect(service.verify(token, new Date())).toEqual({ userNo: 12n, sessionNo: 34n })
  })

  it('🔴 exp 와 같은 초부터 만료 — ERR_EXPIRED_TOKEN, 1초 전은 통과', () => {
    const token = service.sign({ userNo: 1n, sessionNo: 2n })
    const exp = Number(payloadOf(token).exp)
    expect(service.verify(token, new Date((exp - 1) * 1000))).toEqual({ userNo: 1n, sessionNo: 2n })
    const error = rejection(() => service.verify(token, new Date(exp * 1000)))
    expect(error.code).toBe(CommonErrorCodes.ERR_EXPIRED_TOKEN)
    expect(error.message).toBe(AUTH_MESSAGES.accessExpired)
  })

  it.each([
    [
      '다른 비밀키',
      () =>
        new JwtService({ secret: 'y'.repeat(32) }).sign({
          userNo: 'BigInt(1)',
          sessionNo: 'BigInt(2)',
        }),
    ],
    [
      'HS512',
      () =>
        new JwtService({ secret }).sign(
          { userNo: 'BigInt(1)', sessionNo: 'BigInt(2)' },
          { algorithm: 'HS512' },
        ),
    ],
    [
      'alg none',
      () =>
        [
          Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
          Buffer.from(JSON.stringify({ userNo: 'BigInt(1)', sessionNo: 'BigInt(2)' })).toString(
            'base64url',
          ),
          '',
        ].join('.'),
    ],
    ['잘린 토큰', () => service.sign({ userNo: 1n, sessionNo: 2n }).slice(0, -3)],
    ['숫자 클레임', () => new JwtService({ secret }).sign({ userNo: 1, sessionNo: 2 })],
    ['클레임 없음', () => new JwtService({ secret }).sign({ hello: 'world' })],
    ['형식이 아님', () => 'not-a-jwt'],
  ])('🔴 %s → ERR_INVALID_TOKEN', (_label, make) => {
    const error = rejection(() => service.verify(make(), new Date()))
    expect(error.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(error.message).toBe(AUTH_MESSAGES.accessInvalid)
  })
})
