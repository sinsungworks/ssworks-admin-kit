import { IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { resolveIpAccessConfig, type AdminIpScopeTarget } from './options.js'
import { isKnownScopeType, ruleScopeProblem, sameScopeFamily } from './scope-check.js'

const target: AdminIpScopeTarget = {
  async lock() {
    return true
  },
  async names() {
    return new Map()
  },
}
const config = resolveIpAccessConfig({
  ipAccess: {
    extraScopes: [
      { type: 'shippingToken', target },
      { type: 'apiKey', wholeScope: false, target },
    ],
  },
})

describe('범위 판정(scope-check — 스펙 §4-2 · X2)', () => {
  it('isKnownScopeType — 코어 셋 ∪ 등록된 이름', () => {
    expect(
      ['global', 'team', 'user', 'shippingToken', 'apiKey'].every((t) =>
        isKnownScopeType(config, t),
      ),
    ).toBe(true)
    expect(isKnownScopeType(config, 'gone')).toBe(false)
    expect(isKnownScopeType(resolveIpAccessConfig({}), 'shippingToken')).toBe(false)
  })

  it('코어는 ipScopeProblem 그대로', () => {
    expect(ruleScopeProblem(config, { scopeType: 'global', scopeRefNo: null })).toBeNull()
    expect(ruleScopeProblem(config, { scopeType: 'global', scopeRefNo: 1n })).toEqual({
      path: 'scopeRefNo',
      message: IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden,
    })
    expect(ruleScopeProblem(config, { scopeType: 'team', scopeRefNo: null })).toEqual({
      path: 'scopeRefNo',
      message: IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired,
    })
  })

  it('확장 — 대상 하나 · 범위 전체(wholeScope) · 꺼진 범위 전체 · 모르는 범위', () => {
    expect(ruleScopeProblem(config, { scopeType: 'shippingToken', scopeRefNo: 7n })).toBeNull()
    expect(ruleScopeProblem(config, { scopeType: 'shippingToken', scopeRefNo: null })).toBeNull()
    expect(ruleScopeProblem(config, { scopeType: 'apiKey', scopeRefNo: null })).toEqual({
      path: 'scopeRefNo',
      message: IP_ACCESS_MESSAGES.wholeScopeOff,
    })
    expect(ruleScopeProblem(config, { scopeType: 'gone', scopeRefNo: 1n })).toEqual({
      path: 'scopeType',
      message: IP_ACCESS_MESSAGES.unknownScopeType,
    })
  })

  it('🔴 sameScopeFamily — 코어끼리 · 같은 확장 범위만', () => {
    expect(sameScopeFamily('global', 'user')).toBe(true)
    expect(sameScopeFamily('team', 'shippingToken')).toBe(false)
    expect(sameScopeFamily('shippingToken', 'global')).toBe(false)
    expect(sameScopeFamily('shippingToken', 'apiKey')).toBe(false)
    expect(sameScopeFamily('shippingToken', 'shippingToken')).toBe(true)
  })
})
