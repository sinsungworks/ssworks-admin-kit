import { describe, expect, it, expectTypeOf } from 'vitest'
import { SCOPES, defineScopes, scopeCovers } from './scopes.js'

const scopes = defineScopes(['org.users', 'org.teams', 'db.assigned'] as const)

describe('defineScopes — crm-v5 expandScopes 규칙', () => {
  it("'*' 가 전 리소스에 퍼지고, 개별 지정이 그것을 이긴다", () => {
    expect(scopes.expandScopes({ '*': 'all' })).toEqual({
      'org.users': 'all',
      'org.teams': 'all',
      'db.assigned': 'all',
    })
    expect(scopes.expandScopes({ '*': 'own', 'db.assigned': 'all' })).toEqual({
      'org.users': 'own',
      'org.teams': 'own',
      'db.assigned': 'all',
    })
  })

  it('아무것도 없으면 기본 범위(own)다 — 넓은 쪽이 아니라 좁은 쪽으로 떨어진다', () => {
    expect(scopes.expandScopes({})).toEqual({
      'org.users': 'own',
      'org.teams': 'own',
      'db.assigned': 'own',
    })
    expect(scopes.resolveScope({}, 'org.users')).toBe('own')
  })

  it('기본 범위를 바꿀 수 있다', () => {
    const teamDefault = defineScopes(['a'] as const, { defaultScope: SCOPES.TEAM })
    expect(teamDefault.expandScopes({})).toEqual({ a: 'team' })
  })

  it('정의되지 않은 리소스 키는 스키마가 거부한다 — 개명 전 orphan 키가 저장되지 않게', () => {
    expect(scopes.rawScopesSchema.parse({ '*': 'all', 'org.users': 'team' })).toEqual({
      '*': 'all',
      'org.users': 'team',
    })
    expect(() => scopes.rawScopesSchema.parse({ subscription: 'all' })).toThrow()
    expect(() => scopes.rawScopesSchema.parse({ 'org.users': 'everything' })).toThrow()
  })

  it('타입: 리소스 유니온으로 좁혀진다', () => {
    expectTypeOf(scopes.expandScopes({})).toEqualTypeOf<
      Record<'org.users' | 'org.teams' | 'db.assigned', 'own' | 'team' | 'all'>
    >()
    expect(scopes.isScopeResource('org.users')).toBe(true)
    expect(scopes.isScopeResource('nope')).toBe(false)
  })
})

describe('scopeCovers', () => {
  it('all ≥ team ≥ own', () => {
    expect(scopeCovers('all', 'own')).toBe(true)
    expect(scopeCovers('team', 'team')).toBe(true)
    expect(scopeCovers('own', 'team')).toBe(false)
  })
})
