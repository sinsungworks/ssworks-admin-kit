import { describe, expect, it } from 'vitest'
import { DEFAULT_IP_ACCESS_MESSAGES as M } from './ip-access.js'
import {
  CORE_SCOPE_CATALOG,
  parseScopeChoice,
  prefillScopeChoice,
  resolveIpScopeCatalog,
  scopeChoiceItems,
  scopeChoiceKey,
  scopeChoiceLabel,
  wholeScopeKey,
} from './ip-scope-choices.js'

const shipping = { type: 'shippingToken', label: '출고 토큰', wholeLabel: '모든 출고 USB' }
const apiKey = { type: 'apiKey', label: 'API 키' }
const catalog = resolveIpScopeCatalog(['user', 'team', 'global'], [shipping, apiKey])

describe('선택지 키(확장 범위 스펙 X11)', () => {
  it('키 ↔ 범위 · 대상 없음', () => {
    expect(wholeScopeKey('shippingToken')).toBe('shippingToken:*')
    expect(parseScopeChoice('shippingToken:*')).toEqual({ scopeType: 'shippingToken', whole: true })
    expect(parseScopeChoice('shippingToken')).toEqual({ scopeType: 'shippingToken', whole: false })
    expect(parseScopeChoice('global')).toEqual({ scopeType: 'global', whole: true })
    expect(parseScopeChoice('team')).toEqual({ scopeType: 'team', whole: false })
    expect(scopeChoiceKey('shippingToken', null)).toBe('shippingToken:*')
    expect(scopeChoiceKey('shippingToken', 7n)).toBe('shippingToken')
    expect(scopeChoiceKey('global', null)).toBe('global')
    expect(scopeChoiceKey('team', null)).toBe('team')
  })

  it('이름 — 코어 문구 · 쓰는 쪽 label · wholeLabel · 없으면 「<label> 전체」 · 모르는 범위는 그대로', () => {
    expect(scopeChoiceLabel('user', M, catalog)).toBe(M.scopeUser)
    expect(scopeChoiceLabel('shippingToken', M, catalog)).toBe('출고 토큰')
    expect(scopeChoiceLabel('shippingToken:*', M, catalog)).toBe('모든 출고 USB')
    expect(scopeChoiceLabel('apiKey:*', M, catalog)).toBe(M.scopeWhole('API 키'))
    expect(scopeChoiceLabel('goneScope', M, catalog)).toBe('goneScope')
    expect(scopeChoiceLabel('goneScope:*', M, catalog)).toBe('goneScope')
  })
})

describe('선택지 목록', () => {
  it('만들기(all) — 코어 평가 순서 뒤에 확장 범위 · wholeLabel 없는 범위는 하나', () => {
    expect(scopeChoiceItems(M, catalog, 'all').map((item) => item.value)).toEqual([
      'user',
      'team',
      'global',
      'shippingToken',
      'shippingToken:*',
      'apiKey',
    ])
  })

  it('🔴 수정 — 코어 규칙은 코어만 · 확장 규칙은 그 범위만(X2)', () => {
    expect(scopeChoiceItems(M, catalog, 'core').map((item) => item.value)).toEqual([
      'user',
      'team',
      'global',
    ])
    expect(
      scopeChoiceItems(M, catalog, { extra: 'shippingToken' }).map((item) => item.value),
    ).toEqual(['shippingToken', 'shippingToken:*'])
  })

  it('지금 값이 목록 밖이면 그 자리에 남긴다 — 코어 층(3i S2) · wholeLabel 없는 범위 전체', () => {
    const narrow = resolveIpScopeCatalog(['user', 'global'], [apiKey])
    expect(scopeChoiceItems(M, narrow, 'core', 'team').map((item) => item.value)).toEqual([
      'user',
      'team',
      'global',
    ])
    expect(
      scopeChoiceItems(M, narrow, { extra: 'apiKey' }, 'apiKey:*').map((item) => item.value),
    ).toEqual(['apiKey', 'apiKey:*'])
  })

  it('코어만 쓰는 화면은 지금과 같다', () => {
    expect(scopeChoiceItems(M, CORE_SCOPE_CATALOG, 'all').map((item) => item.value)).toEqual([
      'user',
      'team',
      'global',
    ])
  })
})

describe('카탈로그 검증 · 미리 채움', () => {
  it('🔴 setup 에서 던진다 — 이름 규칙 밖 · 코어 이름 · 겹침 · focus 가 확장 범위 밖', () => {
    expect(() => resolveIpScopeCatalog(['global'], [{ type: 'Bad', label: 'x' }])).toThrow(
      'extraScopes',
    )
    expect(() => resolveIpScopeCatalog(['global'], [{ type: 'user', label: 'x' }])).toThrow(
      'extraScopes',
    )
    expect(() =>
      resolveIpScopeCatalog(['global'], [shipping, { ...shipping, label: 'y' }]),
    ).toThrow('extraScopes')
    expect(() => resolveIpScopeCatalog(['global'], [shipping], { scopeType: 'apiKey' })).toThrow(
      'focus',
    )
  })

  it('prefillScopeChoice — 고를 수 있는 선택지 키 · 아니면 null(스펙 §5-5)', () => {
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: 7n }, catalog)).toBe(
      'shippingToken',
    )
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: null }, catalog)).toBe(
      'shippingToken:*',
    )
    expect(prefillScopeChoice({ scopeType: 'apiKey', scopeRefNo: null }, catalog)).toBeNull()
    expect(prefillScopeChoice({ scopeType: 'goneScope', scopeRefNo: 1n }, catalog)).toBeNull()
    expect(prefillScopeChoice({ scopeType: 'user', scopeRefNo: 3n }, catalog)).toBe('user')
    expect(prefillScopeChoice({ scopeType: 'global', scopeRefNo: 3n }, catalog)).toBeNull()
    expect(prefillScopeChoice({ scopeType: 'team', scopeRefNo: null }, catalog)).toBeNull()
    expect(
      prefillScopeChoice(
        { scopeType: 'team', scopeRefNo: 4n },
        resolveIpScopeCatalog(['user', 'global']),
      ),
    ).toBeNull()
    const focused = resolveIpScopeCatalog(['user', 'team', 'global'], [shipping], {
      scopeType: 'shippingToken',
      scopeRefNo: 7n,
    })
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: 7n }, focused)).toBe(
      'shippingToken',
    )
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: null }, focused)).toBe(
      'shippingToken:*',
    )
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: 8n }, focused)).toBeNull()
    expect(prefillScopeChoice({ scopeType: 'user', scopeRefNo: 3n }, focused)).toBeNull()
  })
})
