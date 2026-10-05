import { describe, expect, it } from 'vitest'
import {
  impliedClosure,
  orderedPermissions,
  samePermissionList,
  togglePermission,
} from './role-permissions.js'

// 정본: hangang-home apps/admin/src/pages/settings/roles-messages.ts 의 sortPermissions · togglePermission ·
//       samePermissionSet 규칙을 권한 키 단위 함의로 옮겨 못박는다.

const CATALOG = [
  'org.users:read',
  'org.users:write',
  'org.users:delete',
  'org.roles:read',
  'org.roles:write',
  'log:read',
  '*',
]
const IMPLIES = {
  'org.users:write': ['org.users:read'],
  'org.users:delete': ['org.users:write'],
  'org.roles:write': ['org.roles:read'],
}

describe('orderedPermissions', () => {
  it('카탈로그 순서로 거른다', () => {
    expect(orderedPermissions(CATALOG, ['log:read', 'org.users:read'])).toEqual([
      'org.users:read',
      'log:read',
    ])
  })

  it("🔴 '*' 와 카탈로그 밖 키를 버린다 — 매트릭스 모델에 '*' 가 들어오는 길을 막는다", () => {
    expect(orderedPermissions(CATALOG, ['*', 'gone:read', 'log:read'])).toEqual(['log:read'])
  })
})

describe('impliedClosure', () => {
  it('함의를 연쇄로 펼치고 자기 자신은 뺀다', () => {
    expect(impliedClosure(IMPLIES, 'org.users:delete')).toEqual([
      'org.users:write',
      'org.users:read',
    ])
  })

  it('함의가 없으면 빈 배열이다', () => {
    expect(impliedClosure(IMPLIES, 'log:read')).toEqual([])
  })

  it('순환이 있어도 멈춘다', () => {
    expect(impliedClosure({ a: ['b'], b: ['a'] }, 'a')).toEqual(['b'])
  })
})

describe('togglePermission', () => {
  it('🔴 켜면 함의 대상까지 값에 써 넣는다 — 결과는 카탈로그 순서', () => {
    expect(togglePermission(CATALOG, IMPLIES, ['log:read'], 'org.users:delete', true)).toEqual([
      'org.users:read',
      'org.users:write',
      'org.users:delete',
      'log:read',
    ])
  })

  it('🔴 끄면 그것을 함의하는 키까지 끈다 — 끄는 방향은 implies 에서 유도한다', () => {
    const all = ['org.users:read', 'org.users:write', 'org.users:delete', 'log:read']
    expect(togglePermission(CATALOG, IMPLIES, all, 'org.users:read', false)).toEqual(['log:read'])
    expect(togglePermission(CATALOG, IMPLIES, all, 'org.users:delete', false)).toEqual([
      'org.users:read',
      'org.users:write',
      'log:read',
    ])
  })

  it('함의가 없으면 그 키 하나만 바꾼다', () => {
    expect(togglePermission(CATALOG, IMPLIES, [], 'log:read', true)).toEqual(['log:read'])
    expect(togglePermission(CATALOG, IMPLIES, ['log:read'], 'log:read', false)).toEqual([])
  })

  it("카탈로그 밖 키와 '*' 는 함의로도 만들지 않는다", () => {
    expect(
      togglePermission(CATALOG, { 'log:read': ['log:export', '*'] }, [], 'log:read', true),
    ).toEqual(['log:read'])
  })
})

describe('samePermissionList', () => {
  it('길이와 순서까지 같아야 같다', () => {
    expect(samePermissionList(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(samePermissionList(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(samePermissionList(['a'], ['a', 'b'])).toBe(false)
    expect(samePermissionList([], [])).toBe(true)
  })
})
