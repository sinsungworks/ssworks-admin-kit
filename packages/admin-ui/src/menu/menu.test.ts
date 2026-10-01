import { describe, expect, it } from 'vitest'
import { createPermissionCheck } from '@ssworks/admin-shared'
import type { RouteRecordRaw } from 'vue-router'
import {
  assertParentAnyPermissionsCoverChildren,
  buildMenu,
  filterMenu,
  flattenRoutes,
  type MenuNode,
} from './menu.js'

// 정본: hangang-home router/menu.test.ts · flatten-routes.test.ts
// 바꾼 점: 실제 라우트 표·스토어 대신 인라인 라우트로. 판정기는 admin-shared 의 실물을 쓴다.

const checkAs = (granted: string[]) => createPermissionCheck(() => granted)
const stub = () => null

const groups = [
  { key: 'content', title: '콘텐츠' },
  { key: 'org', title: '조직' },
] as const

const routes: RouteRecordRaw[] = [
  { path: '/', component: stub, meta: { title: '대시보드', menu: { icon: 'mdi-home' } } },
  {
    path: '/users',
    component: stub,
    meta: {
      title: '직원',
      permissions: ['org.users:read'],
      menu: { group: 'org', icon: 'mdi-account' },
    },
  },
  {
    path: '/uploads',
    component: stub,
    meta: {
      title: '파일',
      permissions: ['content.uploads:read'],
      menu: { group: 'content', icon: 'mdi-file', order: 2 },
    },
  },
  {
    path: '/pages',
    component: stub,
    meta: {
      title: '페이지',
      permissions: ['content.pages:read', 'content.pages:write'],
      menu: { group: 'content', icon: 'mdi-page', order: 1 },
    },
  },
  { path: '/hidden', component: stub, meta: { title: '메뉴 없음' } },
  { path: '/account', component: stub, meta: { title: '내 계정', menu: { icon: 'mdi-cog' } } },
]

const leaf = (id: string, extra: Partial<MenuNode> = {}): MenuNode => ({
  id,
  title: id,
  to: `/${id}`,
  ...extra,
})

function leafIds(nodes: readonly MenuNode[]): string[] {
  return nodes.flatMap((n) => (n.children ? leafIds(n.children) : [n.id]))
}
function findNode(nodes: readonly MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = n.children ? findNode(n.children, id) : undefined
    if (hit) return hit
  }
  return undefined
}

describe('filterMenu', () => {
  it('🔴 선언이 없는 노드는 통과한다 — 빈 인자 hasPermission() 은 false 라 길이를 먼저 본다', () => {
    const nodes = [leaf('a')]
    expect(filterMenu(nodes, checkAs([]))).toEqual(nodes)
  })

  it('permissions 는 AND 다', () => {
    const nodes = [leaf('a', { permissions: ['x', 'y'] })]
    expect(filterMenu(nodes, checkAs(['x']))).toEqual([])
    expect(filterMenu(nodes, checkAs(['x', 'y']))).toEqual(nodes)
  })

  it('anyPermissions 는 OR 이다', () => {
    const nodes = [leaf('a', { anyPermissions: ['x', 'y'] })]
    expect(filterMenu(nodes, checkAs(['y']))).toEqual(nodes)
    expect(filterMenu(nodes, checkAs(['z']))).toEqual([])
  })

  it('둘 다 선언하면 둘 다 만족해야 한다', () => {
    const nodes = [leaf('a', { permissions: ['x'], anyPermissions: ['y', 'z'] })]
    expect(filterMenu(nodes, checkAs(['x']))).toEqual([])
    expect(filterMenu(nodes, checkAs(['x', 'z']))).toEqual(nodes)
  })

  it('🔴 자식이 전부 걸러진 그룹은 머리째 사라진다', () => {
    const nodes: MenuNode[] = [
      { id: 'g', title: 'G', children: [leaf('a', { permissions: ['x'] })] },
      { id: 'h', title: 'H', children: [leaf('b'), leaf('c', { permissions: ['x'] })] },
    ]
    const out = filterMenu(nodes, checkAs([]))
    expect(out.map((n) => n.id)).toEqual(['h'])
    expect(out[0]?.children?.map((c) => c.id)).toEqual(['b'])
  })

  it("'*' 는 단락해 전부 통과시킨다", () => {
    const nodes: MenuNode[] = [
      { id: 'g', title: 'G', children: [leaf('a', { permissions: ['x', 'y'] })] },
      leaf('b', { anyPermissions: ['z'] }),
    ]
    expect(filterMenu(nodes, checkAs(['*']))).toEqual(nodes)
  })

  it('입력을 바꾸지 않는다', () => {
    const nodes: MenuNode[] = [
      { id: 'g', title: 'G', children: [leaf('a'), leaf('b', { permissions: ['x'] })] },
    ]
    filterMenu(nodes, checkAs([]))
    expect(nodes[0]?.children).toHaveLength(2)
  })

  it('선택 술어(predicate)는 권한과 AND 로 잎에 적용된다', () => {
    const nodes: MenuNode[] = [{ id: 'g', title: 'G', children: [leaf('a'), leaf('b')] }, leaf('c')]
    const out = filterMenu(nodes, checkAs([]), (n) => n.id !== 'a' && n.id !== 'c')
    expect(out.map((n) => n.id)).toEqual(['g'])
    expect(out[0]?.children?.map((c) => c.id)).toEqual(['b'])
  })
})

describe('buildMenu', () => {
  it('meta.menu 가 있는 라우트만 메뉴가 된다', () => {
    expect(leafIds(buildMenu(routes, { groups }))).not.toContain('/hidden')
  })

  it('그룹은 groups 순서, 그룹 밖 항목은 선언 자리를 지킨다', () => {
    // 선언 순서로는 org 가 먼저 나오지만 groups 는 content 가 먼저다.
    const tree = buildMenu(routes, { groups })
    expect(tree.map((n) => n.id)).toEqual(['/', 'content', 'org', '/account'])
    expect(tree[1]?.title).toBe('콘텐츠')
  })

  it('그룹 안은 order → 선언 순서다', () => {
    const tree = buildMenu(routes, { groups })
    expect(tree[1]?.children?.map((c) => c.id)).toEqual(['/pages', '/uploads'])
  })

  it('order 가 없는 항목은 order 가 있는 항목 뒤에 선언 순서로 온다', () => {
    const tree = buildMenu(
      [
        { path: '/a', component: stub, meta: { menu: { group: 'org' } } },
        { path: '/b', component: stub, meta: { menu: { group: 'org', order: 5 } } },
        { path: '/c', component: stub, meta: { menu: { group: 'org' } } },
      ],
      { groups },
    )
    expect(tree[0]?.children?.map((c) => c.id)).toEqual(['/b', '/a', '/c'])
  })

  it('항목이 하나도 없는 그룹은 만들어지지 않는다', () => {
    const tree = buildMenu([routes[0]!], { groups })
    expect(tree.map((n) => n.id)).toEqual(['/'])
  })

  it('🔴 항목의 권한이 그 라우트의 meta 와 글자 그대로 같다', () => {
    const tree = buildMenu(routes, { groups })
    const byPath = new Map(routes.map((r) => [r.path, r]))
    for (const id of leafIds(tree)) {
      const node = findNode(tree, id)
      expect(node?.permissions).toEqual(byPath.get(id)?.meta?.permissions)
      expect(node?.anyPermissions).toEqual(byPath.get(id)?.meta?.anyPermissions)
    }
    expect(findNode(tree, '/pages')?.permissions).toEqual([
      'content.pages:read',
      'content.pages:write',
    ])
  })

  it('제목·아이콘·to 를 옮긴다 — menu.title 이 meta.title 을 이긴다', () => {
    const tree = buildMenu(
      [
        {
          path: '/a',
          component: stub,
          meta: { title: 'A', menu: { icon: 'mdi-a', title: '에이' } },
        },
        { path: '/b', component: stub, meta: { menu: {} } },
      ],
      { groups },
    )
    expect(tree[0]).toMatchObject({ id: '/a', title: '에이', icon: 'mdi-a', to: '/a' })
    expect(tree[1]).toMatchObject({ id: '/b', title: '/b', to: '/b' })
  })

  it('알 수 없는 그룹 키는 던진다', () => {
    expect(() =>
      buildMenu([{ path: '/a', component: stub, meta: { menu: { group: 'nope' } } }], { groups }),
    ).toThrow(/nope/)
  })

  it('🔴 기본(depth 1)은 children 라우트를 안 본다 — depth:"all" 이면 본다', () => {
    const nested: RouteRecordRaw[] = [
      {
        path: '/settings',
        component: stub,
        meta: { title: '설정', menu: { icon: 'mdi-cog' } },
        children: [
          {
            path: '/settings/site',
            component: stub,
            meta: { title: '사이트', menu: { icon: 'mdi-s' } },
          },
        ],
      },
    ]
    expect(buildMenu(nested, { groups }).map((n) => n.id)).toEqual(['/settings'])
    expect(buildMenu(nested, { groups, depth: 'all' }).map((n) => n.id)).toEqual([
      '/settings',
      '/settings/site',
    ])
  })
})

describe("buildMenu — 파일 기반 라우팅(depth: 'all')", () => {
  // vue-router 5 `vue-router/auto-routes` + vite-plugin-vue-layouts-next `setupLayouts()` 가 내는 모양.
  // 최상위 레코드는 레이아웃 래퍼(`meta.isLayout`)이고 페이지는 `path: ''` 자식이다. `'/'` 만 자식도 '/'.
  // `users/index.vue` · `users/[id].vue` · `users/invite.vue` 는 컴포넌트 없는 폴더 노드 아래 상대 경로로 온다.
  const layout = stub
  const fileBased: RouteRecordRaw[] = [
    {
      path: '/',
      component: layout,
      meta: { isLayout: true },
      children: [
        { path: '/', component: stub, meta: { title: '대시보드', menu: { icon: 'mdi-home' } } },
      ],
    },
    {
      path: '/users',
      component: layout,
      meta: { isLayout: true },
      children: [
        {
          path: '',
          children: [
            {
              path: '',
              component: stub,
              meta: { title: '사용자', permissions: ['org.users:read'], menu: { group: 'org' } },
            },
            { path: ':id', component: stub, meta: { title: '사용자 상세' } },
            {
              path: 'invite',
              component: stub,
              meta: { title: '초대', menu: { group: 'org', order: 1 } },
            },
          ],
        },
      ],
    },
    {
      path: '/settings',
      component: layout,
      meta: { isLayout: true },
      children: [
        {
          path: '',
          component: stub,
          meta: { title: '설정', menu: {} },
          children: [{ path: 'site', component: stub, meta: { title: '사이트', menu: {} } }],
        },
      ],
    },
  ]

  function allLeaves(nodes: readonly MenuNode[]): MenuNode[] {
    return nodes.flatMap((n) => (n.children ? allLeaves(n.children) : [n]))
  }

  it("🔴 id·to 는 부모에 이은 전체 경로다 — path '' 자식은 부모 경로, 상대 자식은 parent/child", () => {
    const tree = buildMenu(fileBased, { groups, depth: 'all' })
    expect(tree.map((n) => n.id)).toEqual(['/', 'org', '/settings', '/settings/site'])
    expect(tree[1]?.children?.map((c) => c.id)).toEqual(['/users/invite', '/users'])
    for (const node of allLeaves(tree)) expect(node.to).toBe(node.id)
  })

  it('🔴 빈 id 가 없고 id 가 겹치지 않는다(Vue key 중복 방지)', () => {
    const ids = allLeaves(buildMenu(fileBased, { groups, depth: 'all' })).map((n) => n.id)
    expect(ids).not.toContain('')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('제목이 없으면 전체 경로를 제목으로 쓴다', () => {
    const tree = buildMenu(
      [
        {
          path: '/x',
          component: layout,
          children: [{ path: 'y', component: stub, meta: { menu: {} } }],
        },
      ],
      { groups, depth: 'all' },
    )
    expect(tree[0]).toMatchObject({ id: '/x/y', title: '/x/y', to: '/x/y' })
  })

  it("'/' 부모에 상대 자식을 이어도 슬래시가 겹치지 않는다", () => {
    const tree = buildMenu(
      [
        {
          path: '/',
          component: layout,
          children: [{ path: 'about', component: stub, meta: { menu: {} } }],
        },
        {
          path: '/admin/',
          component: layout,
          children: [{ path: 'logs', component: stub, meta: { menu: {} } }],
        },
      ],
      { groups, depth: 'all' },
    )
    expect(tree.map((n) => n.to)).toEqual(['/about', '/admin/logs'])
  })

  it('알 수 없는 그룹 키 오류는 전체 경로를 적는다', () => {
    expect(() =>
      buildMenu(
        [
          {
            path: '/a',
            component: layout,
            children: [{ path: '', component: stub, meta: { menu: { group: 'nope' } } }],
          },
        ],
        { groups, depth: 'all' },
      ),
    ).toThrow(/nope.*\/a\)/)
  })

  it('기본 depth 1 은 래퍼만 보므로 비어 있다 — 파일 기반 라우팅은 depth: "all" 이 필요하다', () => {
    expect(buildMenu(fileBased, { groups })).toEqual([])
  })
})

describe('flattenRoutes', () => {
  it('깊이 우선으로 편다 — 부모가 먼저, 자식이 뒤. path 를 이어 붙이지 않는다', () => {
    const tree: RouteRecordRaw[] = [
      {
        path: '/a',
        component: stub,
        children: [
          { path: '/a/1', component: stub, children: [{ path: '/a/1/x', component: stub }] },
          { path: '/a/2', component: stub },
        ],
      },
      { path: '/b', component: stub },
    ]
    expect(flattenRoutes(tree).map((r) => r.path)).toEqual(['/a', '/a/1', '/a/1/x', '/a/2', '/b'])
  })
})

describe('assertParentAnyPermissionsCoverChildren', () => {
  const parent = (anyPermissions: string[] | undefined): RouteRecordRaw => ({
    path: '/settings',
    component: stub,
    meta: { anyPermissions },
    children: [
      { path: '/settings/a', component: stub, meta: { permissions: ['a:read'] } },
      { path: '/settings/b', component: stub, meta: { permissions: ['b:read', 'c:read'] } },
    ],
  })

  it('부모 anyPermissions 가 자식 permissions 합집합을 덮으면 통과한다', () => {
    expect(() =>
      assertParentAnyPermissionsCoverChildren([parent(['a:read', 'b:read', 'c:read'])]),
    ).not.toThrow()
  })

  it('🔴 하나라도 빠지면 던진다 — 부모가 숨는데 자식만 열려 있는 상태를 막는다', () => {
    expect(() => assertParentAnyPermissionsCoverChildren([parent(['a:read', 'b:read'])])).toThrow(
      /\/settings.*c:read/,
    )
  })

  it('🔴 anyPermissions 를 선언하지 않은 부모는 검사하지 않는다 — 던지지 않는다', () => {
    expect(() => assertParentAnyPermissionsCoverChildren([parent(undefined)])).not.toThrow()
    expect(() => assertParentAnyPermissionsCoverChildren([parent([])])).not.toThrow()
  })

  it('🔴 setupLayouts 래퍼·폴더 노드는 던지지 않는다', () => {
    const routes: RouteRecordRaw[] = [
      {
        path: '/users',
        component: stub,
        children: [{ path: '', component: stub, meta: { permissions: ['users:read'] } }],
      },
      {
        path: '/admin',
        component: stub,
        children: [
          {
            path: 'roles',
            component: stub,
            children: [
              { path: '', component: stub, meta: { permissions: ['roles:read'] } },
              { path: ':id', component: stub, meta: { permissions: ['roles:write'] } },
            ],
          },
        ],
      },
    ]
    expect(() => assertParentAnyPermissionsCoverChildren(routes)).not.toThrow()
  })

  it('🔴 선언 없는 래퍼 아래 깊은 레코드가 anyPermissions 를 선언하면 그것은 검사한다', () => {
    const routes: RouteRecordRaw[] = [
      {
        path: '/wrap',
        component: stub,
        children: [
          {
            path: 'x',
            component: stub,
            meta: { anyPermissions: ['a:read'] },
            children: [{ path: 'y', component: stub, meta: { permissions: ['b:read'] } }],
          },
        ],
      },
    ]
    expect(() => assertParentAnyPermissionsCoverChildren(routes)).toThrow(
      /라우트 '\/wrap\/x' .*b:read/,
    )
  })

  it('자식이 자기 anyPermissions 를 선언하면 부모가 덮지 않아도 된다(덮어쓰기)', () => {
    const routes: RouteRecordRaw[] = [
      {
        path: '/p',
        component: stub,
        meta: { anyPermissions: ['a:read'] },
        children: [
          { path: 'a', component: stub, meta: { permissions: ['a:read'] } },
          {
            path: 'own',
            component: stub,
            meta: { permissions: ['z:read'], anyPermissions: ['z:read', 'y:read'] },
          },
        ],
      },
    ]
    expect(() => assertParentAnyPermissionsCoverChildren(routes)).not.toThrow()
  })

  it('🔴 덮어쓴 자식도 자기 후손에 대해서는 검사받는다 — 그 서브트리는 부모 몫이 아니다', () => {
    const routes: RouteRecordRaw[] = [
      {
        path: '/p',
        component: stub,
        meta: { anyPermissions: ['a:read'] },
        children: [
          {
            path: 'own',
            component: stub,
            meta: { anyPermissions: ['z:read'] },
            children: [{ path: 'deep', component: stub, meta: { permissions: ['q:read'] } }],
          },
        ],
      },
    ]
    // 부모는 q:read 를 요구받지 않는다 — 자식 own 이 요구받는다.
    expect(() => assertParentAnyPermissionsCoverChildren(routes)).toThrow(
      /라우트 '\/p\/own' .*q:read/,
    )
    expect(() => assertParentAnyPermissionsCoverChildren(routes)).not.toThrow(/라우트 '\/p' /)
  })

  it('🔴 선언 없는 중간 자식 아래 손자의 permissions 도 부모에게 요구된다(상속)', () => {
    const routes: RouteRecordRaw[] = [
      {
        path: '/p',
        component: stub,
        meta: { anyPermissions: ['a:read'] },
        children: [
          {
            path: 'mid',
            component: stub,
            children: [{ path: 'leaf', component: stub, meta: { permissions: ['g:read'] } }],
          },
        ],
      },
    ]
    expect(() => assertParentAnyPermissionsCoverChildren(routes)).toThrow(/라우트 '\/p' .*g:read/)
  })

  it('🔴 오류는 전체 경로로 레코드를 가리킨다 — 상대 경로 자식이어도', () => {
    const routes: RouteRecordRaw[] = [
      {
        path: '/admin',
        component: stub,
        meta: { anyPermissions: ['a:read', 'b:read'] },
        children: [
          {
            path: 'roles',
            component: stub,
            meta: { anyPermissions: ['a:read'] },
            children: [{ path: ':id', component: stub, meta: { permissions: ['b:read'] } }],
          },
        ],
      },
    ]
    expect(() => assertParentAnyPermissionsCoverChildren(routes)).toThrow(
      /라우트 '\/admin\/roles' .*b:read/,
    )
  })

  it('자식에 권한 선언이 없으면 부모에 요구하지 않는다', () => {
    expect(() =>
      assertParentAnyPermissionsCoverChildren([
        { path: '/p', component: stub, children: [{ path: '/p/a', component: stub }] },
      ]),
    ).not.toThrow()
  })
})
