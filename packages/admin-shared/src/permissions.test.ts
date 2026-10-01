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
