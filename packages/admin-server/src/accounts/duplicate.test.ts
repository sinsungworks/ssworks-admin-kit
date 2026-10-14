import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { isDuplicateOf } from './duplicate.js'

const driverError = {
  code: 'ER_DUP_ENTRY',
  message: `(conn:7, no: 1062, SQLState: 23000) Duplicate entry 'ADMIN' for key 'uq_roles_role_name'`,
}

describe('isDuplicateOf', () => {
  it('드라이버 오류 · mapError 가 감싼 BusinessError 의 cause 둘 다 제약 이름으로 가른다(§14 R1-6)', () => {
    expect(isDuplicateOf(driverError, 'uq_roles_role_name')).toBe(true)
    const wrapped = new BusinessError(
      CommonErrorCodes.ERR_COMMON_DUPLICATED,
      '이미 존재하는 값입니다.',
      undefined,
      {
        cause: driverError,
      },
    )
    expect(isDuplicateOf(wrapped, 'uq_roles_role_name')).toBe(true)
  })

  it('다른 제약 · 다른 코드 · 객체가 아닌 값은 거짓', () => {
    expect(isDuplicateOf(driverError, 'uq_users_user_id')).toBe(false)
    expect(isDuplicateOf({ ...driverError, code: 'ER_LOCK_DEADLOCK' }, 'uq_roles_role_name')).toBe(
      false,
    )
    expect(isDuplicateOf('ER_DUP_ENTRY', 'uq_roles_role_name')).toBe(false)
    expect(
      isDuplicateOf(new BusinessError(CommonErrorCodes.ERR_NO_ROLE, 'x'), 'uq_roles_role_name'),
    ).toBe(false)
  })
})
