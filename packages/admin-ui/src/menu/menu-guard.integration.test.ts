import { describe, expect, it } from 'vitest'
import type { RouteLocationNormalized, RouteLocationRaw, RouteRecordRaw } from 'vue-router'
import { definePermissions, type PermissionOf } from '@ssworks/admin-shared'
import { createAdminGuard } from '../router/guard.js'
import { defineAdminRoute } from '../router/route-meta.js'
import { buildMenu, filterMenu, flattenRoutes, type MenuNode } from './menu.js'

// 메뉴 ↔ 가드 정합. 같은 `PermissionCheck` 인스턴스를 `filterMenu` 와 `createAdminGuard` 에 넘겼을 때
// "메뉴에 보이는 선언된 항목은 가드도 통과하고, 안 보이는 항목은 가드가 403 으로 막는가" 를 잰다.
// (Plan Review Focus 1: 메뉴는 보이는데 라우트는 403 이 생기면 안 된다.)

const catalog = definePermissions({
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  ROLE_READ: 'role:read',
  LOG_READ: 'log:read',
})
type Perm = PermissionOf<typeof catalog>
const P = catalog.PERMISSIONS

const groups = [{ key: 'admin', title: '관리' }]

const routes: RouteRecordRaw[] = [
  // AND
  defineAdminRoute<Perm>({
    path: '/users',
    component: {},
    meta: { permissions: [P.USER_READ, P.USER_WRITE], menu: { title: '사용자' } },
  }),
  // OR
  defineAdminRoute<Perm>({
    path: '/reports',
    component: {},
    meta: { anyPermissions: [P.LOG_READ, P.ROLE_READ], menu: { title: '리포트' } },
  }),
  // AND + OR
  defineAdminRoute<Perm>({
    path: '/mixed',
    component: {},
    meta: {
      permissions: [P.USER_READ],
      anyPermissions: [P.LOG_READ, P.ROLE_READ],
      menu: { title: '복합' },
    },
  }),
  // selfOnly — 권한 선언 없이 로그인만 하면 된다
  defineAdminRoute<Perm>({
    path: '/me',
    component: {},
    meta: { selfOnly: true, menu: { title: '내 계정' } },
  }),
  // 그룹 — 자식이 권한을 든다
  defineAdminRoute<Perm>({
    path: '/admin/roles',
    component: {},
    meta: { permissions: [P.ROLE_READ], menu: { group: 'admin', title: '역할' } },
  }),
  defineAdminRoute<Perm>({
    path: '/admin/logs',
    component: {},
    meta: { permissions: [P.LOG_READ], menu: { group: 'admin', title: '로그' } },
  }),
  // 선언 없음 — 메뉴와 가드가 일부러 갈리는 자리
  defineAdminRoute<Perm>({
    path: '/about',
    component: {},
    meta: { menu: { title: '소개' } },
  }),
]

const byPath = new Map(flattenRoutes(routes).map((r) => [r.path, r]))

function leavesOf(nodes: readonly MenuNode<Perm>[]): MenuNode<Perm>[] {
  return nodes.flatMap((n) => (n.children != null ? leavesOf(n.children) : [n]))
}

function toLocation(path: string): RouteLocationNormalized {
  return {
    path,
    fullPath: path,
    meta: byPath.get(path)!.meta ?? {},
  } as unknown as RouteLocationNormalized
}

/** 한 grant 에 대해 같은 check 인스턴스를 메뉴와 가드에 쓴다. */
function setup(granted: string[]) {
  const check = catalog.createCheck(() => granted)
  const full = buildMenu<Perm>(routes, { groups })
  const visible = new Set(leavesOf(filterMenu(full, check)).map((n) => n.id))
  const guard = createAdminGuard<Perm>({
    check,
    isAuthorized: () => true,
    ensureInitialized: async () => {},
  })
  const run = async (path: string): Promise<true | RouteLocationRaw | void> =>
    (await guard.call(undefined, toLocation(path), {} as RouteLocationNormalized, () => {})) as
      true | RouteLocationRaw | void
  return { full, visible, run }
}

const grants: [string, string[]][] = [
  ['권한 없음', []],
  ['일부(user:read · role:read)', [P.USER_READ, P.ROLE_READ]],
  ['AND 만 충족(user:read · user:write)', [P.USER_READ, P.USER_WRITE]],
  ["'*'", ['*']],
]

describe.each(grants)('메뉴 ↔ 가드 정합 — %s', (_label, granted) => {
  it('선언된 leaf: 메뉴에 보이면 가드가 통과하고, 안 보이면 가드가 403 이다', async () => {
    const { full, visible, run } = setup(granted)
    const leaves = leavesOf(full).filter((n) => n.id !== '/about')
    // 표가 비어 있어 공허하게 통과하는 것을 막는다.
    expect(leaves.length).toBe(6)

    for (const leaf of leaves) {
      const result = await run(leaf.id)
      if (visible.has(leaf.id)) {
        expect(result, `${leaf.id} 는 보이는데 가드가 막았다`).toBe(true)
      } else {
        expect(result, `${leaf.id} 는 숨겨졌는데 가드가 통과시켰다`).toEqual({ path: '/403' })
      }
    }
  })
})

describe('기대 가시성 — 판정이 한쪽으로 쏠려 공허하지 않은지', () => {
  it('권한 없음: 선언 없는 항목(/me · /about)만 보인다', () => {
    expect([...setup([]).visible].sort()).toEqual(['/about', '/me'])
  })

  it('일부(user:read · role:read): /reports · /mixed · /admin/roles 가 보이고 /users · /admin/logs 는 숨는다', () => {
    const { visible } = setup([P.USER_READ, P.ROLE_READ])
    expect([...visible].sort()).toEqual(['/about', '/admin/roles', '/me', '/mixed', '/reports'])
  })

  it("'*': 전부 보인다", () => {
    expect(setup(['*']).visible.size).toBe(7)
  })

  it('자식이 전부 걸러진 그룹은 머리째 사라지고, 하나라도 남으면 그룹이 남는다', () => {
    const none = filterMenu(
      setup([]).full,
      catalog.createCheck(() => []),
    )
    expect(none.some((n) => n.id === 'admin')).toBe(false)
    const some = filterMenu(
      setup([]).full,
      catalog.createCheck(() => [P.LOG_READ]),
    )
    expect(some.find((n) => n.id === 'admin')?.children?.map((c) => c.id)).toEqual(['/admin/logs'])
  })
})

describe('알려진 비대칭 — 선언 없는 라우트', () => {
  it('메뉴는 "선언 없음 = 공개" 로 보여 주지만 fail-closed 가드는 403 으로 막는다', async () => {
    // 의도된 비대칭이다(스펙 §4 결정 5: "메뉴는 안내, 가드가 방어선").
    // meta.menu 만 있고 permissions·anyPermissions·selfOnly·isPublic 이 전무한 라우트는
    // 메뉴 필터가 공개로 보지만(빈 인자 hasPermission 은 false 라 길이를 먼저 본다),
    // 가드는 부재를 통과로 해석하지 않는다. 메뉴가 더 넓게 보여도 가드가 마지막에 막으므로 안전하다.
    for (const [, granted] of grants) {
      const { visible, run } = setup(granted)
      expect(visible.has('/about')).toBe(true)
      expect(await run('/about')).toEqual({ path: '/403' })
    }
  })
})
