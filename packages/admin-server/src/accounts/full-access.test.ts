import { BusinessError, CommonErrorCodes, definePermissions } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from './errors.js'
import { assertFullAccessOnly, assertIpManageFullAccessOnly } from './full-access.js'

const KEYS = {
  IP_READ: 'setting.ipAccess:read',
  IP_WRITE: 'setting.ipAccess:write',
  USERS_READ: 'org.users:read',
} as const
const marked = definePermissions(KEYS, {
  implies: { 'setting.ipAccess:write': ['setting.ipAccess:read'] },
  fullAccessOnly: ['setting.ipAccess:write'],
})
const plain = definePermissions(KEYS)

function thrown(run: () => void): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

describe('assertFullAccessOnly(2g F3)', () => {
  it("🔴 '*' 가 아닌 역할에 전권 전용 키가 있으면 400 issues permissions", () => {
    const error = thrown(() =>
      assertFullAccessOnly(marked, ['setting.ipAccess:read', 'setting.ipAccess:write']),
    )
    expect(error).toBeInstanceOf(BusinessError)
    const business = error as BusinessError
    expect(business.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(business.message).toBe(ACCOUNT_MESSAGES.fullAccessOnly)
    expect(business.details).toEqual({
      issues: [{ path: ['permissions'], code: 'custom', message: ACCOUNT_MESSAGES.fullAccessOnly }],
    })
  })

  it("'*' 역할 · 정규화된 ['*', 키] · 표시 없는 키만 · 빈 권한은 지난다", () => {
    expect(() => assertFullAccessOnly(marked, ['*'])).not.toThrow()
    expect(() =>
      assertFullAccessOnly(marked, marked.normalize(['*', 'setting.ipAccess:write'])),
    ).not.toThrow()
    expect(() =>
      assertFullAccessOnly(marked, ['setting.ipAccess:read', 'org.users:read']),
    ).not.toThrow()
    expect(() => assertFullAccessOnly(marked, [])).not.toThrow()
    expect(() => assertFullAccessOnly(plain, ['setting.ipAccess:write'])).not.toThrow()
  })
})

describe('assertIpManageFullAccessOnly(2g F6)', () => {
  const permissions = {
    'ipAccess.read': 'setting.ipAccess:read',
    'ipAccess.manage': 'setting.ipAccess:write',
  }

  it('🔴 IP 모듈이 켜졌고 manage 키가 전권 전용이 아니면 던진다 — 고칠 한 줄을 문구에', () => {
    expect(() => assertIpManageFullAccessOnly(permissions, plain, true)).toThrow(
      "fullAccessOnly: ['setting.ipAccess:write']",
    )
  })

  it("표시돼 있거나 · IP 모듈이 없거나 · 슬롯 키가 '*' 거나 · 슬롯이 없으면 지난다", () => {
    expect(() => assertIpManageFullAccessOnly(permissions, marked, true)).not.toThrow()
    expect(() => assertIpManageFullAccessOnly(permissions, plain, false)).not.toThrow()
    expect(() =>
      assertIpManageFullAccessOnly({ ...permissions, 'ipAccess.manage': '*' }, plain, true),
    ).not.toThrow()
    expect(() => assertIpManageFullAccessOnly({}, plain, true)).not.toThrow()
    expect(() => assertIpManageFullAccessOnly(undefined, plain, true)).not.toThrow()
  })
})
