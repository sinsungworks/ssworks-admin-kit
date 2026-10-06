import { describe, expect, it } from 'vitest'
import { adminTemporaryPasswordSchema, definePasswordPolicy } from './passwords.js'

describe('definePasswordPolicy', () => {
  it('기본은 8자 이상 200자 이하다(3c 결정 ⑧-L2)', () => {
    const policy = definePasswordPolicy()
    expect(policy.minLength).toBe(8)
    expect(policy.maxLength).toBe(200)
    expect(policy.lengthMessage).toBe('비밀번호는 8자 이상 200자 이하로 정하세요.')
    expect(policy.sameAsCurrentMessage).toBe('새 비밀번호가 현재 비밀번호와 같습니다.')
  })

  it('프로젝트가 숫자를 바꾸면 문구도 따라간다', () => {
    const policy = definePasswordPolicy({ minLength: 12, maxLength: 64 })
    expect(policy.lengthMessage).toBe('비밀번호는 12자 이상 64자 이하로 정하세요.')
  })

  it('잘못된 정책은 정의할 때 던진다 — 설정 실수를 첫 실행에서 드러낸다', () => {
    expect(() => definePasswordPolicy({ minLength: 0 })).toThrow('minLength')
    expect(() => definePasswordPolicy({ minLength: 1.5 })).toThrow('minLength')
    expect(() => definePasswordPolicy({ minLength: 10, maxLength: 9 })).toThrow('maxLength')
  })

  it('passwordSchema 는 길이 경계를 지키고 위반이면 정책 문구를 낸다', () => {
    const { passwordSchema, lengthMessage } = definePasswordPolicy()
    const short = passwordSchema.safeParse('a'.repeat(7))
    expect(short.success).toBe(false)
    expect(short.error?.issues[0]?.message).toBe(lengthMessage)
    expect(passwordSchema.safeParse('a'.repeat(8)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(200)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(201)).success).toBe(false)
  })

  it('🔴 changePasswordSchema — 새 = 현재면 경로 newPassword 의 검증 오류다(3c 결정 ⑦-W1)', () => {
    const { changePasswordSchema, sameAsCurrentMessage } = definePasswordPolicy()
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old-pass-1', newPassword: 'new-pass-1' })
        .success,
    ).toBe(true)
    const same = changePasswordSchema.safeParse({
      currentPassword: 'same-pass-1',
      newPassword: 'same-pass-1',
    })
    expect(same.success).toBe(false)
    expect(same.error?.issues[0]?.path).toEqual(['newPassword'])
    expect(same.error?.issues[0]?.message).toBe(sameAsCurrentMessage)
  })

  it('changePasswordSchema — 현재 비밀번호는 비면 안 되고, 새 비밀번호 길이 위반은 newPassword 경로다', () => {
    const { changePasswordSchema } = definePasswordPolicy()
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'new-pass-1' }).success,
    ).toBe(false)
    const short = changePasswordSchema.safeParse({
      currentPassword: 'old-pass-1',
      newPassword: 'short',
    })
    expect(short.error?.issues[0]?.path).toEqual(['newPassword'])
  })

  it('현재 비밀번호 상한은 정책 최대보다 낮추지 않는다(최소 256) — 정책을 줄여도 옛 긴 비밀번호로 바꿀 수 있다', () => {
    const { changePasswordSchema } = definePasswordPolicy({ minLength: 8, maxLength: 64 })
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'a'.repeat(256),
        newPassword: 'new-pass-1',
      }).success,
    ).toBe(true)
  })
})

describe('adminTemporaryPasswordSchema', () => {
  it('temporaryPassword 하나 — 빈 값은 거부한다', () => {
    expect(adminTemporaryPasswordSchema.parse({ temporaryPassword: 'Ab3dEf7hJk9mNp2q' })).toEqual({
      temporaryPassword: 'Ab3dEf7hJk9mNp2q',
    })
    expect(adminTemporaryPasswordSchema.safeParse({ temporaryPassword: '' }).success).toBe(false)
  })
})
