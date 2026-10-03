import { describe, expect, it, expectTypeOf } from 'vitest'
import {
  BusinessError,
  CommonErrorCodes,
  COMMON_ERROR_STATUS,
  defineErrorCodes,
  isBusinessError,
  type ErrorCodeOf,
} from './error-codes.js'

describe('CommonErrorCodes — 코어 코드 표', () => {
  it('값은 키와 같다 (hangang 명명) — 로그의 코드 문자열로 소스를 바로 찾는다', () => {
    for (const [key, value] of Object.entries(CommonErrorCodes)) {
      expect(value).toBe(key)
    }
  })

  it('모든 코어 코드에 HTTP 상태가 있다', () => {
    for (const code of Object.values(CommonErrorCodes)) {
      expect(COMMON_ERROR_STATUS[code], code).toBeGreaterThanOrEqual(400)
    }
  })

  // 🔴 401 은 프론트 클라이언트의 토큰 갱신 트리거다. 갱신해도 안 풀리는 거부가 401 이면
  //    갱신 → 401 → 갱신 루프가 된다.
  it('🔴 잠금·퇴사·IP 차단·재인증 실패는 401 이 아니다', () => {
    for (const code of [
      CommonErrorCodes.ERR_ACCOUNT_LOCKED,
      CommonErrorCodes.ERR_RESIGNED_USER,
      CommonErrorCodes.ERR_IP_NOT_ALLOWED,
      CommonErrorCodes.ERR_REAUTH_REQUIRED,
      CommonErrorCodes.ERR_PASSWORD_CHANGE_REQUIRED,
    ]) {
      expect(COMMON_ERROR_STATUS[code], code).not.toBe(401)
    }
  })

  it('토큰 계열은 401 이다 — 갱신 트리거', () => {
    for (const code of [
      CommonErrorCodes.ERR_INVALID_TOKEN,
      CommonErrorCodes.ERR_EXPIRED_TOKEN,
      CommonErrorCodes.ERR_SESSION_EXPIRED,
      CommonErrorCodes.ERR_REFRESH_REUSED,
    ]) {
      expect(COMMON_ERROR_STATUS[code], code).toBe(401)
    }
  })

  it('revision 충돌은 전용 코드다 — 409, ERR_COMMON_CONFLICT 와 다른 값', () => {
    expect(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT).toBe('ERR_COMMON_REVISION_CONFLICT')
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT]).toBe(409)
    expect(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT).not.toBe(
      CommonErrorCodes.ERR_COMMON_CONFLICT,
    )
  })
})

describe('defineErrorCodes — 프로젝트 코드 병합', () => {
  const errors = defineErrorCodes(
    { ERR_NO_POST: 'ERR_NO_POST', STORAGE_NOT_CONFIGURED: 'STORAGE_NOT_CONFIGURED' },
    { ERR_NO_POST: 404, STORAGE_NOT_CONFIGURED: 503, ERR_ACCOUNT_LOCKED: 403 },
  )

  it('코어 + 프로젝트 코드를 한 표로 낸다', () => {
    expect(errors.ErrorCodes.ERR_NO_POST).toBe('ERR_NO_POST')
    expect(errors.ErrorCodes.ERR_COMMON_NOT_FOUND).toBe('ERR_COMMON_NOT_FOUND')
    expect(errors.isErrorCode('STORAGE_NOT_CONFIGURED')).toBe(true)
    expect(errors.isErrorCode('ERR_GHOST')).toBe(false)
  })

  it('프로젝트 상태를 쓰고, 코어 상태를 덮어쓸 수 있다', () => {
    expect(errors.httpStatusFor('ERR_NO_POST')).toBe(404)
    expect(errors.httpStatusFor('STORAGE_NOT_CONFIGURED')).toBe(503)
    expect(errors.httpStatusFor('ERR_ACCOUNT_LOCKED')).toBe(403)
    expect(errors.httpStatusFor('ERR_COMMON_CONFLICT')).toBe(409)
  })

  it('표에 없는 값은 4xx 를 지어내지 않고 500 이다', () => {
    expect(errors.httpStatusFor('ERR_GHOST')).toBe(500)
  })

  it('타입: ErrorCodeOf 가 코어·프로젝트 코드의 유니온이다', () => {
    expectTypeOf<'ERR_NO_POST'>().toMatchTypeOf<ErrorCodeOf<typeof errors>>()
    expectTypeOf<'ERR_COMMON_NOT_FOUND'>().toMatchTypeOf<ErrorCodeOf<typeof errors>>()
  })

  it('🔴 코어 코드와 키가 겹치면 거부한다', () => {
    expect(() =>
      defineErrorCodes({ ERR_NO_USER: 'ERR_NO_USER_2' }, { ERR_NO_USER_2: 404 }),
    ).toThrow(/겹친다/)
  })

  it('🔴 상태 없는 프로젝트 코드는 런타임에서도 거부한다 — 타입을 우회한 호출 방어', () => {
    expect(() => defineErrorCodes({ ERR_X: 'ERR_X' }, {} as unknown as { ERR_X: number })).toThrow(
      /ERR_X/,
    )
  })
})

describe('BusinessError', () => {
  it('code · details 를 들고, cause 는 따로 둔다', () => {
    const cause = new Error('driver')
    const err = new BusinessError('ERR_COMMON_CONFLICT', '충돌', { revision: 3 }, { cause })
    expect(err.code).toBe('ERR_COMMON_CONFLICT')
    expect(err.message).toBe('충돌')
    expect(err.details).toEqual({ revision: 3 })
    expect(err.cause).toBe(cause)
    expect(err.name).toBe('BusinessError')
    expect(isBusinessError(err)).toBe(true)
    expect(isBusinessError(new Error('x'))).toBe(false)
  })

  it('message 를 생략하면 code 가 message 다', () => {
    expect(new BusinessError('ERR_NO_USER').message).toBe('ERR_NO_USER')
  })
})
