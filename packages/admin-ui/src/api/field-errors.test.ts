import { describe, expect, it } from 'vitest'
import { ApiError } from './error.js'
import { toFieldErrors } from './field-errors.js'

const validation = (details: unknown) =>
  new ApiError('검증', { status: 400, code: 'ERR_COMMON_VALIDATION', details, raw: null })

describe('toFieldErrors', () => {
  it('path 배열을 . 으로 이은 키로 모은다', () => {
    const error = validation({
      issues: [
        { path: ['userId'], message: '필수입니다' },
        { path: ['members', 0, 'name'], message: '너무 깁니다', code: 'too_big' },
      ],
    })
    expect(toFieldErrors(error)).toEqual({
      userId: ['필수입니다'],
      'members.0.name': ['너무 깁니다'],
    })
  })

  it('같은 키의 메시지는 순서대로 쌓는다', () => {
    const error = validation({
      issues: [
        { path: ['password'], message: '8자 이상' },
        { path: ['password'], message: '숫자 포함' },
      ],
    })
    expect(toFieldErrors(error)).toEqual({ password: ['8자 이상', '숫자 포함'] })
  })

  it('루트 path [] 는 빈 문자열 키', () => {
    expect(toFieldErrors(validation({ issues: [{ path: [], message: '본문이 비었다' }] }))).toEqual(
      {
        '': ['본문이 비었다'],
      },
    )
  })

  it('🔴 gise 식 점 연결 문자열 path 는 계약 위반 — {} (틀린 키를 조용히 만들지 않는다)', () => {
    expect(toFieldErrors(validation({ issues: [{ path: 'a.b', message: 'm' }] }))).toEqual({})
  })

  it('다른 코드 · details 없음 · ApiError 아님 → {} (던지지 않는다)', () => {
    const conflict = new ApiError('x', {
      code: 'ERR_COMMON_CONFLICT',
      details: { issues: [{ path: ['a'], message: 'm' }] },
      raw: null,
    })
    expect(toFieldErrors(conflict)).toEqual({})
    expect(toFieldErrors(validation(undefined))).toEqual({})
    expect(toFieldErrors(new Error('x'))).toEqual({})
    expect(toFieldErrors(null)).toEqual({})
  })

  it('🔴 상속 키 이름의 path 도 던지지 않고 제 키로 담는다 — constructor · __proto__', () => {
    const error = validation({
      issues: [
        { path: ['constructor'], message: 'a' },
        { path: ['__proto__'], message: 'b' },
      ],
    })
    const result = toFieldErrors(error)
    expect(() => toFieldErrors(error)).not.toThrow()
    expect(Object.getOwnPropertyDescriptor(result, 'constructor')?.value).toEqual(['a'])
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toEqual(['b'])
    expect(Object.keys(Object.prototype)).toEqual([])
  })
})
