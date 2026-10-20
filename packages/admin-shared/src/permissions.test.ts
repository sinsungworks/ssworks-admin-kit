import { describe, expect, it, expectTypeOf } from 'vitest'
import {
  ALL_PERMISSION,
  coversPermissions,
  createPermissionCheck,
  definePermissions,
  hasAnyPermission,
  hasPermission,
  type PermissionOf,
} from './permissions.js'

// hangang-home `composables/usePermission.test.ts` 의 5 케이스를 옮기되 "빈 인자 AND=true" 는
// 패키지 규칙(fail-closed, gise)으로 갱신했다.

const catalog = definePermissions(
  {
    BOARD_POSTS_READ: 'board.posts:read',
    BOARD_POSTS_WRITE: 'board.posts:write',
    ORG_USERS_READ: 'org.users:read',
    ORG_ROLES_WRITE: 'org.roles:write',
  },
  { extraValues: ['db.edit.phone', 'db.edit.memo'] as const },
)

type Permission = PermissionOf<typeof catalog>

describe('definePermissions — 카탈로그 모양', () => {
  it("ALL: '*' 가 자동으로 들어가고 정본 배열에도 있다", () => {
    expect(catalog.PERMISSIONS.ALL).toBe('*')
    expect(catalog.ALL_PERMISSION_VALUES).toContain('*')
    expect(catalog.PERMISSIONS.BOARD_POSTS_READ).toBe('board.posts:read')
  })

  it('정본 배열 = 카탈로그 값 + extraValues + *', () => {
    expect([...catalog.ALL_PERMISSION_VALUES]).toEqual([
      'board.posts:read',
      'board.posts:write',
      'org.users:read',
      'org.roles:write',
      'db.edit.phone',
      'db.edit.memo',
      '*',
    ])
  })

  it('타입: PermissionOf 가 카탈로그 값·extraValues·* 의 유니온이다', () => {
    expectTypeOf<Permission>().toEqualTypeOf<
      | 'board.posts:read'
      | 'board.posts:write'
      | 'org.users:read'
      | 'org.roles:write'
      | 'db.edit.phone'
      | 'db.edit.memo'
      | '*'
    >()
  })

  it('isPermission / toPermissions 는 정본 배열 기준으로 좁히고 걸러낸다', () => {
    expect(catalog.isPermission('org.users:read')).toBe(true)
    expect(catalog.isPermission('db.edit.memo')).toBe(true)
    expect(catalog.isPermission('org.users:delete')).toBe(false)
    // 카탈로그에서 제거된 옛 문자열이 DB 에 남아도 응답 검증이 던지지 않게 걸러낸다
    expect(catalog.toPermissions(['org.users:read', 'ghost:read', '*'])).toEqual([
      'org.users:read',
      '*',
    ])
  })

  it('zod 스키마는 정본 배열의 폐집합이다', () => {
    expect(catalog.permissionListSchema.parse(['board.posts:read', '*'])).toEqual([
      'board.posts:read',
      '*',
    ])
    expect(() => catalog.permissionListSchema.parse(['board.posts:delete'])).toThrow()
  })

  it("🔴 'ALL' 키를 다른 값으로 넘기면 거부한다 — '*' 는 패키지가 예약한다", () => {
    expect(() => definePermissions({ ALL: 'all' })).toThrow(/ALL/)
    expect(() => definePermissions({ ALL: '*' })).not.toThrow()
  })

  it('🔴 값이 중복되면 거부한다 — 두 상수가 같은 문자열을 가리키면 카탈로그 화면이 한 칸을 두 번 그린다', () => {
    expect(() => definePermissions({ A: 'x:read', B: 'x:read' })).toThrow(/중복/)
  })
})

describe('hasPermission / hasAnyPermission — 규칙은 네 프로젝트와 같다', () => {
  it('hasPermission 은 나열한 권한을 전부 가져야 참이다 (AND)', () => {
    const granted = ['board.posts:read']
    expect(hasPermission(granted, 'board.posts:read')).toBe(true)
    expect(hasPermission(granted, 'board.posts:read', 'board.posts:write')).toBe(false)
  })

  it('hasAnyPermission 은 하나만 있어도 참이다 (OR)', () => {
    const granted = ['board.posts:read']
    expect(hasAnyPermission(granted, 'board.posts:read', 'org.users:read')).toBe(true)
    expect(hasAnyPermission(granted, 'org.users:read', 'org.roles:write')).toBe(false)
  })

  it("🔴 '*' 하나면 둘 다 단락한다 — 최고관리자가 새 화면을 못 보면 안 된다", () => {
    const granted = [ALL_PERMISSION]
    expect(hasPermission(granted, 'org.roles:write', 'org.users:read')).toBe(true)
    expect(hasAnyPermission(granted, 'board.posts:write')).toBe(true)
  })

  it("🔴 '*' 는 접두 와일드카드가 아니다 — 서버 가드와 같은 규칙이다", () => {
    expect(hasPermission(['content.pages:read'], 'content.pages:write')).toBe(false)
    expect(hasPermission(['content.*'], 'content.pages:read')).toBe(false)
  })

  it('권한이 하나도 없으면 전부 거짓이다', () => {
    expect(hasPermission([], 'board.posts:read')).toBe(false)
    expect(hasAnyPermission([], 'board.posts:read')).toBe(false)
  })

  it('🔴 인자가 없으면 AND·OR 둘 다 거짓이다 (fail-closed) — 빈 선언이 "전부 통과" 로 읽히면 안 된다', () => {
    // 상류 crm·axion·hangang 은 `[].every()` 가 참이라 AND 가 통과했다. 패키지는 gise 규칙이다.
    expect(hasPermission(['board.posts:read'])).toBe(false)
    expect(hasAnyPermission(['board.posts:read'])).toBe(false)
    // '*' 보유자는 빈 인자도 참 — 단락이 먼저다
    expect(hasPermission(['*'])).toBe(true)
  })
})

describe('coversPermissions — 지배 판정', () => {
  it("'*' 는 무엇이든 덮는다", () => {
    expect(coversPermissions(['*'], ['org.roles:write', 'board.posts:read'])).toBe(true)
  })

  it('target 전부를 가져야 덮는다 — 역할 편집에서 권한 상승을 막는 판정이다', () => {
    expect(coversPermissions(['org.users:read', 'org.roles:write'], ['org.users:read'])).toBe(true)
    expect(coversPermissions(['org.users:read'], ['org.users:read', 'org.roles:write'])).toBe(false)
  })

  it("'*' 가 없는 사람은 '*' 를 덮지 못한다", () => {
    expect(coversPermissions(['org.users:read'], ['*'])).toBe(false)
  })

  it('빈 target 은 참이다', () => {
    expect(coversPermissions([], [])).toBe(true)
  })
})

describe('createPermissionCheck / catalog.createCheck — 지연 평가 판정기', () => {
  it('granted 를 호출 시점마다 다시 읽는다 — 로그인 전후가 같은 판정기로 갈린다', () => {
    let granted: string[] = []
    const check = createPermissionCheck<Permission>(() => granted)

    expect(check.hasPermission('board.posts:read')).toBe(false)
    granted = ['board.posts:read']
    expect(check.hasPermission('board.posts:read')).toBe(true)
  })

  it('catalog.createCheck 는 카탈로그 타입으로 좁혀진 판정기를 낸다', () => {
    const check = catalog.createCheck(() => ['org.users:read'])
    expect(check.hasAnyPermission('org.users:read', 'org.roles:write')).toBe(true)
    expectTypeOf(check.hasPermission)
      .parameter(0)
      .toEqualTypeOf<
        | 'board.posts:read'
        | 'board.posts:write'
        | 'org.users:read'
        | 'org.roles:write'
        | 'db.edit.phone'
        | 'db.edit.memo'
      >()
  })
})

describe('definePermissions — implies · normalize(2d 스펙 ① C1)', () => {
  const posts = definePermissions(
    {
      POSTS_READ: 'board.posts:read',
      POSTS_WRITE: 'board.posts:write',
      POSTS_DELETE: 'board.posts:delete',
      USERS_READ: 'org.users:read',
    },
    {
      implies: {
        'board.posts:write': ['board.posts:read'],
        'board.posts:delete': ['board.posts:write'],
      },
    },
  )

  it('연쇄 함의를 펼치고 카탈로그 순서로 낸다', () => {
    expect(posts.normalize(['board.posts:delete'])).toEqual([
      'board.posts:read',
      'board.posts:write',
      'board.posts:delete',
    ])
    expect(posts.normalize(['org.users:read', 'board.posts:write'])).toEqual([
      'board.posts:read',
      'board.posts:write',
      'org.users:read',
    ])
  })

  it("🔴 '*' 가 섞이면 정확히 ['*'] 하나 — 키 목록으로 펼치지 않는다(hangang 왕복 항등)", () => {
    expect(posts.normalize(['board.posts:read', '*'])).toEqual(['*'])
    expect(posts.normalize(['*'])).toEqual(['*'])
  })

  it('중복은 접고 카탈로그 밖 키는 버린다 · 빈 배열은 빈 배열', () => {
    expect(posts.normalize(['org.users:read', 'org.users:read', 'nope:read'])).toEqual([
      'org.users:read',
    ])
    expect(posts.normalize([])).toEqual([])
  })

  it('순환 함의에서 멈춘다', () => {
    const cyclic = definePermissions(
      { A: 'a:read', B: 'b:read' },
      { implies: { 'a:read': ['b:read'], 'b:read': ['a:read'] } },
    )
    expect(cyclic.normalize(['b:read'])).toEqual(['a:read', 'b:read'])
  })

  it('implies 는 검증된 얼린 표 — 없으면 {}', () => {
    expect(posts.implies).toEqual({
      'board.posts:write': ['board.posts:read'],
      'board.posts:delete': ['board.posts:write'],
    })
    expect(Object.isFrozen(posts.implies)).toBe(true)
    expect(definePermissions({ A: 'a:read' }).implies).toEqual({})
  })

  it('extraValues 도 함의의 키 · 값이 될 수 있다', () => {
    const withExtra = definePermissions(
      { A: 'a:read' },
      { extraValues: ['db.edit.x'] as const, implies: { 'db.edit.x': ['a:read'] } },
    )
    expect(withExtra.normalize(['db.edit.x'])).toEqual(['a:read', 'db.edit.x'])
  })

  it("🔴 카탈로그 밖 키 · 값, '*', 자기 자신은 정의할 때 던진다 — 문제를 모아 한 번에", () => {
    const base = { A: 'a:read', B: 'b:read' } as const
    expect(() => definePermissions(base, { implies: { 'x:read': ['a:read'] } as never })).toThrow(
      '함의 키가 카탈로그 밖이다: x:read',
    )
    expect(() => definePermissions(base, { implies: { 'a:read': ['x:read'] } as never })).toThrow(
      '함의 값이 카탈로그 밖이다: a:read → x:read',
    )
    expect(() => definePermissions(base, { implies: { 'a:read': ['*'] } as never })).toThrow(
      '함의 값이 카탈로그 밖이다: a:read → *',
    )
    expect(() => definePermissions(base, { implies: { '*': ['a:read'] } as never })).toThrow(
      '함의 키가 카탈로그 밖이다: *',
    )
    expect(() => definePermissions(base, { implies: { 'a:read': ['a:read'] } })).toThrow(
      '자기 자신을 함의한다: a:read',
    )
    expect(() => definePermissions(base, { implies: { 'x:read': ['y:read'] } as never })).toThrow(
      '함의 키가 카탈로그 밖이다: x:read / 함의 값이 카탈로그 밖이다: x:read → y:read',
    )
  })
})

describe('definePermissions — fullAccessOnly(2g F1 · F2)', () => {
  const base = {
    IP_READ: 'setting.ipAccess:read',
    IP_WRITE: 'setting.ipAccess:write',
    USERS_READ: 'org.users:read',
    USERS_WRITE: 'org.users:write',
  } as const

  it('기본은 빈 배열 · 얼림', () => {
    const plain = definePermissions(base)
    expect(plain.fullAccessOnly).toEqual([])
    expect(Object.isFrozen(plain.fullAccessOnly)).toBe(true)
  })

  it('카탈로그 순서 · 중복 없이 얼린다 — 표시된 키가 일반 키를 함의하는 것은 된다', () => {
    const marked = definePermissions(base, {
      implies: { 'setting.ipAccess:write': ['setting.ipAccess:read'] },
      fullAccessOnly: ['org.users:write', 'setting.ipAccess:write', 'org.users:write'],
    })
    expect(marked.fullAccessOnly).toEqual(['setting.ipAccess:write', 'org.users:write'])
    expect(Object.isFrozen(marked.fullAccessOnly)).toBe(true)
  })

  it("🔴 카탈로그 밖 키 · '*' 는 정의할 때 던진다", () => {
    expect(() => definePermissions(base, { fullAccessOnly: ['x:write'] as never })).toThrow(
      '전권 전용 키가 카탈로그 밖이다: x:write',
    )
    expect(() => definePermissions(base, { fullAccessOnly: ['*'] as never })).toThrow(
      '전권 전용 키가 카탈로그 밖이다: *',
    )
  })

  it('🔴 표시 없는 키의 함의 닫힘에 표시된 키가 있으면 던진다 — 직접 · 연쇄', () => {
    expect(() =>
      definePermissions(base, {
        implies: { 'org.users:write': ['setting.ipAccess:write'] },
        fullAccessOnly: ['setting.ipAccess:write'],
      }),
    ).toThrow('표시 없는 키가 전권 전용 키를 함의한다: org.users:write → setting.ipAccess:write')
    expect(() =>
      definePermissions(base, {
        implies: {
          'org.users:write': ['org.users:read'],
          'org.users:read': ['setting.ipAccess:write'],
        },
        fullAccessOnly: ['setting.ipAccess:write'],
      }),
    ).toThrow('표시 없는 키가 전권 전용 키를 함의한다: org.users:read → setting.ipAccess:write')
  })

  it('순환 함의에서도 멈춘다 — 표시된 키끼리의 순환은 된다', () => {
    const cyclic = definePermissions(base, {
      implies: {
        'setting.ipAccess:write': ['setting.ipAccess:read'],
        'setting.ipAccess:read': ['setting.ipAccess:write'],
      },
      fullAccessOnly: ['setting.ipAccess:read', 'setting.ipAccess:write'],
    })
    expect(cyclic.fullAccessOnly).toEqual(['setting.ipAccess:read', 'setting.ipAccess:write'])
  })

  it('🔴 표시 없는 키가 낀 순환에서도 멈추고 던진다 — impliedBy 의 seen 가드를 지나간다', () => {
    expect(() =>
      definePermissions(base, {
        implies: {
          'org.users:read': ['setting.ipAccess:write'],
          'setting.ipAccess:write': ['org.users:read'],
        },
        fullAccessOnly: ['setting.ipAccess:write'],
      }),
    ).toThrow('표시 없는 키가 전권 전용 키를 함의한다: org.users:read → setting.ipAccess:write')
  })

  it('표시 없는 키끼리만의 순환은 표시된 키와 무관하면 던지지 않고 멈춘다', () => {
    const unrelated = definePermissions(base, {
      implies: {
        'org.users:read': ['org.users:write'],
        'org.users:write': ['org.users:read'],
      },
      fullAccessOnly: ['setting.ipAccess:write'],
    })
    expect(unrelated.fullAccessOnly).toEqual(['setting.ipAccess:write'])
  })
})
