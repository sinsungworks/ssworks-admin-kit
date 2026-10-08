import { CommonErrorCodes, validationDetailsSchema } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { koreanZodErrors, toValidationIssues, validationError } from './validation.js'

describe('toValidationIssues', () => {
  it('🔴 path 는 배열 그대로, 키는 path · code · message 셋뿐(input 없음)', () => {
    const schema = z.object({ members: z.array(z.object({ name: z.string().min(1) })) })
    const result = schema.safeParse({ members: [{ name: '' }] })
    const issues = toValidationIssues(result.error!.issues)
    expect(issues).toEqual([
      { path: ['members', 0, 'name'], code: 'too_small', message: expect.any(String) },
    ])
    expect(Object.keys(issues[0]!)).toEqual(['path', 'code', 'message'])
  })

  it('🔴 보낸 원문(input)을 싣지 않는다 — 비밀번호가 되돌아 나간다', () => {
    const result = z.object({ password: z.string().min(20) }).safeParse({ password: 'p@ss-secret' })
    expect(JSON.stringify(toValidationIssues(result.error!.issues))).not.toContain('p@ss-secret')
  })

  it('symbol 키는 문자열로', () => {
    const issue = {
      code: 'custom',
      path: [Symbol('k')],
      message: 'm',
      input: 'secret',
    } as z.core.$ZodIssue
    expect(toValidationIssues([issue])).toEqual([
      { path: ['Symbol(k)'], code: 'custom', message: 'm' },
    ])
  })
})

describe('validationError', () => {
  it('ERR_COMMON_VALIDATION + details.issues — admin-shared 스키마로 읽힌다', () => {
    const error = validationError([
      { path: ['currentPassword'], message: '현재 비밀번호가 맞지 않습니다.' },
    ])
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(error.message).toBe('요청 형식이 올바르지 않습니다.')
    expect(validationDetailsSchema.parse(error.details)).toEqual({
      issues: [{ path: ['currentPassword'], message: '현재 비밀번호가 맞지 않습니다.' }],
    })
  })

  it('메시지를 바꿀 수 있다', () => {
    expect(validationError([], '다시 확인하세요.').message).toBe('다시 확인하세요.')
  })
})

describe('koreanZodErrors', () => {
  it('한국어 기본 문구, 스키마 문구가 이긴다, 같은 인스턴스', () => {
    const plain = z.string().safeParse(1, { error: koreanZodErrors() })
    expect(plain.error?.issues[0]?.message).toMatch(/[가-힣]/)
    const custom = z.string().min(2, '두 글자 이상').safeParse('a', { error: koreanZodErrors() })
    expect(custom.error?.issues[0]?.message).toBe('두 글자 이상')
    expect(koreanZodErrors()).toBe(koreanZodErrors())
  })
})
