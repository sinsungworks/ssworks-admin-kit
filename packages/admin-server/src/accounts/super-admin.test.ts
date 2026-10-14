import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from './errors.js'
import { assertSuperAdminSurvives } from './super-admin.js'

describe('assertSuperAdminSurvives', () => {
  it('🔴 있었는데 0 이 되면 409 — 이미 0 인 저장소는 마비시키지 않는다(hangang · gise)', () => {
    let caught: unknown
    try {
      assertSuperAdminSurvives(1, 0)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(BusinessError)
    expect((caught as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect((caught as BusinessError).message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(() => assertSuperAdminSurvives(0, 0)).not.toThrow()
    expect(() => assertSuperAdminSurvives(2, 1)).not.toThrow()
    expect(() => assertSuperAdminSurvives(1, 1)).not.toThrow()
    expect(() => assertSuperAdminSurvives(1, 2)).not.toThrow()
  })
})
