import { BusinessError, CommonErrorCodes, validationDetailsSchema } from '@ssworks/admin-shared'
import type { ArgumentMetadata } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ParseBigIntPipe, ZodValidationPipe } from './pipes.js'

function rejection(fn: () => unknown): BusinessError {
  try {
    fn()
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('던지지 않았다')
}

const schema = z.object({
  name: z.string().min(2),
  count: z.coerce.number().int().default(1),
  members: z.array(z.object({ name: z.string().min(1, '이름을 입력하세요.') })).default([]),
})

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema)

  it('성공하면 파싱 결과(기본값 · coerce 적용)를 돌려준다', () => {
    expect(pipe.transform({ name: '홍길', count: '3' })).toEqual({
      name: '홍길',
      count: 3,
      members: [],
    })
  })

  it('실패는 ERR_COMMON_VALIDATION + 배열 path', () => {
    const error = rejection(() => pipe.transform({ name: 'a', members: [{ name: '' }] }))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    const details = validationDetailsSchema.parse(error.details)
    expect(details.issues.map((issue) => issue.path)).toEqual([['name'], ['members', 0, 'name']])
  })

  it('기본 문구는 한국어, 스키마에 적은 문구가 이긴다', () => {
    const error = rejection(() => pipe.transform({ name: 'a', members: [{ name: '' }] }))
    const [first, second] = validationDetailsSchema.parse(error.details).issues
    expect(first?.message).toMatch(/[가-힣]/)
    expect(second?.message).toBe('이름을 입력하세요.')
  })

  it('🔴 보낸 원문을 싣지 않는다', () => {
    const secretPipe = new ZodValidationPipe(z.object({ password: z.string().min(20) }))
    const error = rejection(() => secretPipe.transform({ password: 'p@ss-secret' }))
    expect(JSON.stringify(error.details)).not.toContain('p@ss-secret')
  })
})

describe('ParseBigIntPipe', () => {
  const pipe = new ParseBigIntPipe()
  const meta: ArgumentMetadata = { type: 'param', data: 'teamNo' }

  it.each([
    ['12', 12n],
    ['0', 0n],
    ['007', 7n],
    ['18446744073709551615', 18446744073709551615n],
  ])('%s → %s', (raw, expected) => {
    expect(pipe.transform(raw, meta)).toBe(expected)
  })

  it.each(['-1', '1.5', 'abc', '', ' 7', '7 ', '1e3', '18446744073709551616'])(
    '%j 는 400 + path [teamNo]',
    (raw) => {
      const error = rejection(() => pipe.transform(raw, meta))
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect(validationDetailsSchema.parse(error.details).issues[0]?.path).toEqual(['teamNo'])
    },
  )

  it('문자열이 아니면 거부한다', () => {
    expect(rejection(() => pipe.transform(12, meta)).code).toBe(
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
  })

  it('매개변수 이름이 없으면 위치 종류를 path 로', () => {
    const error = rejection(() => pipe.transform('x', { type: 'query' }))
    expect(validationDetailsSchema.parse(error.details).issues[0]?.path).toEqual(['query'])
  })
})
