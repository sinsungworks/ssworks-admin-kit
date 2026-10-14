import { BusinessError, CommonErrorCodes, type ValidationIssue } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { accountsConfig } from '../test-support/accounts.js'
import { RoleCreateBodyPipe, RoleRemoveBodyPipe, RoleUpdateBodyPipe } from './roles.body.js'

function issues(run: () => unknown): ValidationIssue[] {
  try {
    run()
  } catch (error) {
    if (error instanceof BusinessError) {
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      return (error.details as { issues: ValidationIssue[] }).issues
    }
    throw error
  }
  throw new Error('던지지 않았다')
}

describe('역할 본문 파이프', () => {
  it('🔴 모르는 권한 키는 [permissions, i] 에 짧은 문구 — 카탈로그 값을 나열하지 않는다(§14 R1-7)', () => {
    const pipe = new RoleCreateBodyPipe(accountsConfig())
    expect(
      issues(() =>
        pipe.transform({
          roleName: 'r',
          isDefault: false,
          permissions: ['org.users:read', 'bogus'],
        }),
      ),
    ).toEqual([
      { path: ['permissions', 1], code: 'custom', message: ACCOUNT_MESSAGES.unknownPermission },
    ])
  })

  it("'*' 는 카탈로그 값이다", () => {
    const pipe = new RoleCreateBodyPipe(accountsConfig())
    expect(pipe.transform({ roleName: 'r', isDefault: false, permissions: ['*'] })).toMatchObject({
      permissions: ['*'],
    })
  })

  it('재인증 끔 — 보낸 currentPassword 는 무엇이든 버린다', () => {
    const pipe = new RoleCreateBodyPipe(accountsConfig(false))
    expect(
      pipe.transform({ roleName: 'r', isDefault: false, permissions: [], currentPassword: 12 }),
    ).toEqual({ roleName: 'r', isDefault: false, permissions: [] })
    expect(pipe.transform({ roleName: 'r', isDefault: false, permissions: [] })).toEqual({
      roleName: 'r',
      isDefault: false,
      permissions: [],
    })
  })

  it('🔴 재인증 켬 — 빠짐 · 빈 값은 currentPassword 필드 오류(Review Focus 5, 3b D8 재인증 창)', () => {
    const pipe = new RoleRemoveBodyPipe(accountsConfig(true))
    for (const body of [{ revision: 0 }, { revision: 0, currentPassword: '' }]) {
      expect(issues(() => pipe.transform(body))).toEqual([
        expect.objectContaining({
          path: ['currentPassword'],
          message: ACCOUNT_MESSAGES.currentPasswordRequired,
        }),
      ])
    }
    expect(pipe.transform({ revision: 0, currentPassword: 'pw' })).toEqual({
      revision: 0,
      currentPassword: 'pw',
    })
  })

  it('수정 본문 — revision 만 필수, 나머지는 선택(3b §4-1)', () => {
    const pipe = new RoleUpdateBodyPipe(accountsConfig())
    expect(pipe.transform({ revision: 2 })).toEqual({ revision: 2 })
    expect(issues(() => pipe.transform({ roleName: 'x' }))[0]?.path).toEqual(['revision'])
    expect(issues(() => pipe.transform({ revision: 0, permissions: ['nope'] }))[0]?.path).toEqual([
      'permissions',
      0,
    ])
  })
})
