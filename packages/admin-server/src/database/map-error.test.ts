import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { mapError } from './map-error.js'

function driverError(code: string): Error {
  return Object.assign(new Error(`driver ${code}`), { code, errno: 1 })
}

describe('mapError', () => {
  it.each([
    ['ER_DUP_ENTRY', CommonErrorCodes.ERR_COMMON_DUPLICATED, '이미 존재하는 값입니다.'],
    [
      'ER_ROW_IS_REFERENCED_2',
      CommonErrorCodes.ERR_COMMON_IN_USE,
      '다른 데이터가 참조하고 있어 처리할 수 없습니다.',
    ],
    ['ER_NO_REFERENCED_ROW_2', CommonErrorCodes.ERR_COMMON_BAD_REQUEST, '참조 대상이 없습니다.'],
    [
      'ER_LOCK_DEADLOCK',
      CommonErrorCodes.ERR_COMMON_CONFLICT,
      '동시 처리 충돌입니다. 다시 시도해 주세요.',
    ],
    [
      'ER_LOCK_WAIT_TIMEOUT',
      CommonErrorCodes.ERR_COMMON_TIMEOUT,
      '처리가 지연되고 있습니다. 다시 시도해 주세요.',
    ],
    [
      'ETIMEDOUT',
      CommonErrorCodes.ERR_COMMON_TIMEOUT,
      '처리가 지연되고 있습니다. 다시 시도해 주세요.',
    ],
    ['ECONNREFUSED', CommonErrorCodes.ERR_COMMON_UNAVAILABLE, '데이터베이스에 연결할 수 없습니다.'],
    [
      'ER_GET_CONNECTION_TIMEOUT',
      CommonErrorCodes.ERR_COMMON_UNAVAILABLE,
      '데이터베이스에 연결할 수 없습니다.',
    ],
  ])('%s → %s', (driverCode, code, message) => {
    const original = driverError(driverCode)
    const mapped = mapError(original)
    expect(mapped).toBeInstanceOf(BusinessError)
    expect(mapped.code).toBe(code)
    expect(mapped.message).toBe(message)
    expect(mapped.details).toBeUndefined()
    // 🔴 원본은 cause 로만 — 응답에는 실리지 않고 5xx 로그로 간다
    expect(mapped.cause).toBe(original)
  })

  it.each([
    ['일반 오류', new Error('x')],
    ['문자열', 'boom'],
    ['null', null],
    ['프로토타입 키를 code 로 가진 객체', { code: 'toString' }],
  ])('모르는 오류(%s)는 ERR_COMMON_INTERNAL, 원본은 cause', (_label, original) => {
    const mapped = mapError(original)
    expect(mapped.code).toBe(CommonErrorCodes.ERR_COMMON_INTERNAL)
    expect(mapped.message).toBe('일시적인 오류가 발생했습니다.')
    expect(mapped.cause).toBe(original)
  })

  it('BusinessError 는 그대로 돌려준다', () => {
    const error = new BusinessError(CommonErrorCodes.ERR_NO_TEAM, '팀이 없습니다.')
    expect(mapError(error)).toBe(error)
  })
})
