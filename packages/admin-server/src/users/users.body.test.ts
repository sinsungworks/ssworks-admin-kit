import { BusinessError, CommonErrorCodes, type ValidationIssue } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { usersConfig } from '../test-support/accounts.js'
import {
  UserCreateBodyPipe,
  UserReauthBodyPipe,
  UserResignBodyPipe,
  UserUpdateBodyPipe,
} from './users.body.js'

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

const CURRENT_PASSWORD_ISSUE = [
  expect.objectContaining({
    path: ['currentPassword'],
    message: ACCOUNT_MESSAGES.currentPasswordRequired,
  }),
]

describe('사용자 본문 파이프', () => {
  it('만들기 — 아이디 · 이름 앞뒤 공백을 뗀다(Review Focus 2) · roleNo 는 bigint · 날짜는 달력 날짜', () => {
    const pipe = new UserCreateBodyPipe(usersConfig())
    expect(
      pipe.transform({ userId: ' Kim ', userName: ' 김사원 ', roleNo: 2n, teamNo: null }),
    ).toEqual({ userId: 'Kim', userName: '김사원', roleNo: 2n, teamNo: null })
    expect(
      issues(() => pipe.transform({ userId: 'a', userName: 'a', roleNo: 2, teamNo: null })).map(
        (issue) => issue.path,
      ),
    ).toEqual([['roleNo']])
    expect(
      issues(() =>
        pipe.transform({
          userId: 'a',
          userName: 'a',
          roleNo: 2n,
          teamNo: null,
          joinDate: '2026-02-30',
        }),
      ),
    ).toEqual([{ path: ['joinDate'], code: 'custom', message: '없는 날짜입니다.' }])
  })

  it('🔴 재인증 켬 — 빠짐 · 빈 값은 currentPassword 칸 오류, 본문이 아예 없어도(Review Focus 3)', () => {
    const create = new UserCreateBodyPipe(usersConfig(true))
    expect(
      issues(() => create.transform({ userId: 'a', userName: 'a', roleNo: 2n, teamNo: null })),
    ).toEqual(CURRENT_PASSWORD_ISSUE)
    const bare = new UserReauthBodyPipe(usersConfig(true))
    expect(issues(() => bare.transform(undefined))).toEqual(CURRENT_PASSWORD_ISSUE)
    expect(issues(() => bare.transform({ currentPassword: '' }))).toEqual(CURRENT_PASSWORD_ISSUE)
    expect(bare.transform({ currentPassword: 'pw' })).toEqual({ currentPassword: 'pw' })
  })

  it('재인증 끔 — 보낸 currentPassword 는 버린다 · 본문 없는 쓰기는 {}', () => {
    const resign = new UserResignBodyPipe(usersConfig(false))
    expect(
      resign.transform({ resignDate: '2026-10-31', currentPassword: 'x' }).currentPassword,
    ).toBeUndefined()
    const bare = new UserReauthBodyPipe(usersConfig(false))
    expect(bare.transform(undefined)).toEqual({})
    expect(bare.transform({ currentPassword: 'x' }).currentPassword).toBeUndefined()
  })

  it('수정 — revision 이 빠지면 revision 칸 오류', () => {
    const pipe = new UserUpdateBodyPipe(usersConfig())
    expect(issues(() => pipe.transform({ userName: 'a' })).map((issue) => issue.path)).toEqual([
      ['revision'],
    ])
  })
})
