import type { PermissionCheck } from '@ssworks/admin-shared'
import type { RouteLocationRaw, RouteRecordRaw } from 'vue-router'
import type { AdminRouteMeta } from '../router/route-meta.js'

/**
 * 사이드 메뉴 모델 — **라우트 표에서 파생한다.**
 *
 * 정본: hangang-home `apps/admin/src/router/menu.ts` · `flatten-routes.ts`.
 * 바꾼 점: ① 그룹·라우트 표를 모듈 상수로 들지 않고 `groups` 인자·`routes` 인자로 받는다.
 * ② `Permission` 을 제네릭 `P` 로. ③ entry/group 이분 타입을 `children` 유무로 가르는 단일
 * `MenuNode` 로(스펙 §3-2). ④ `disabled`·`badge`(gise '준비 중')·`divider`(이 노드 뒤)·`order`
 * 추가. ⑤ `depth: 1 | 'all'` — hangang 의 "최상위만 순회" 는 기본값으로 남기고, 파일 기반
 * 라우팅 프로젝트는 `'all'` 로 켠다. `id`·`to` 는 레코드의 `path` 가 아니라 부모에 이은 **전체
 * 경로**다(hangang 은 절대 경로만 써서 필요 없었다). ⑥ `assertParentAnyPermissionsCoverChildren`
 * 추가 — 오류도 전체 경로로 가리킨다.
 *
 * 🔴 출처는 라우트 `meta` 하나다. 메뉴가 자기 권한 키를 따로 들면 둘이 갈릴 때 메뉴는 보이는데
 *    들어가면 403 이 된다. 메뉴는 안내일 뿐이고 방어선은 가드다.
 */

export interface MenuNode<P extends string = string> {
  id: string
  title: string
  icon?: string
  /** 있으면 leaf */
  to?: RouteLocationRaw
  /** 없으면 leaf, 있으면 group */
  children?: MenuNode<P>[]
  /** AND */
  permissions?: P[]
  /** OR */
  anyPermissions?: P[]
  disabled?: boolean
  /** gise '준비 중' 칩 */
  badge?: string
  /** 이 노드 **뒤**에 구분선 (hangang 의미) */
  divider?: boolean
  /** 파일 기반 라우팅에서 선언 순서가 없을 때 */
  order?: number
}

function visible<P extends string>(node: MenuNode<P>, check: PermissionCheck<P>): boolean {
  // 🔴 길이를 먼저 본다. hasPermission()/hasAnyPermission() 은 빈 인자에 false 라
  //    그냥 부르면 "선언 없음 = 공개" 인 항목(대시보드·내 계정)이 통째로 사라진다.
  if (node.permissions != null && node.permissions.length > 0) {
    if (!check.hasPermission(...node.permissions)) return false
  }
  if (node.anyPermissions != null && node.anyPermissions.length > 0) {
    if (!check.hasAnyPermission(...node.anyPermissions)) return false
  }
  return true
}

/**
 * 권한으로 걸러낸 메뉴. 입력을 바꾸지 않는다.
 *
 * `predicate` 는 프로젝트 고유 축(axion `partnerOnly` 등)을 권한과 AND 로 거는 자리다.
 * 🔴 자식이 전부 걸러진 그룹은 머리째 사라진다.
 */
export function filterMenu<P extends string>(
  nodes: readonly MenuNode<P>[],
  check: PermissionCheck<P>,
  predicate?: (node: MenuNode<P>) => boolean,
): MenuNode<P>[] {
  return nodes.flatMap<MenuNode<P>>((node) => {
    if (node.children == null) {
      return visible(node, check) && (predicate?.(node) ?? true) ? [node] : []
    }
    if (!visible(node, check)) return []
    const children = filterMenu(node.children, check, predicate)
    return children.length === 0 ? [] : [{ ...node, children }]
  })
}

/** 라우트 표를 **깊이 우선**으로 편다. 부모가 먼저, 그 자식들이 뒤에 온다. `path` 를 이어 붙이지 않는다. */
export function flattenRoutes(routes: readonly RouteRecordRaw[]): RouteRecordRaw[] {
  const out: RouteRecordRaw[] = []
  for (const route of routes) {
    out.push(route)
    if (route.children != null && route.children.length > 0) {
      out.push(...flattenRoutes(route.children))
    }
  }
  return out
}

/**
 * vue-router 가 레코드를 등록할 때와 같은 규칙으로 전체 경로를 만든다 — `/` 로 시작하면 그대로,
 * `''` 이면 부모 경로, 아니면 부모 경로에 슬래시 하나로 잇는다(부모가 `/` 로 끝나면 덧붙이지 않는다).
 * 패키지 내부용(`SettingsShell` 이 같은 규칙을 쓴다) — index 에서 내보내지 않는다.
 */
export function joinPath(parent: string | undefined, path: string): string {
  if (parent == null || path.startsWith('/')) return path
  if (path === '') return parent
  return parent.endsWith('/') ? `${parent}${path}` : `${parent}/${path}`
}

/** `flattenRoutes` 와 같은 순서로 펴되, 레코드마다 전체 경로를 함께 준다. */
function walkRoutes(
  routes: readonly RouteRecordRaw[],
  parent?: string,
): { route: RouteRecordRaw; fullPath: string }[] {
  return routes.flatMap((route) => {
    const fullPath = joinPath(parent, route.path)
    return [{ route, fullPath }, ...walkRoutes(route.children ?? [], fullPath)]
  })
}

function metaOf<P extends string>(route: RouteRecordRaw): AdminRouteMeta<P> | undefined {
  return route.meta as AdminRouteMeta<P> | undefined
}

/**
 * 라우트 표 → 메뉴 트리.
 *
 * - `meta.menu` 가 있는 라우트만 항목이 된다. `menu.group` 이 있으면 그 그룹 아래로 간다.
 * - 최상위 순서: 그룹 밖 항목은 선언 자리를 지키고, 그룹 머리는 첫 자식이 나온 자리를 차지하되
 *   그 자리들 안에서 `groups` 순서로 배열된다.
 * - 그룹 안 순서: `order` 가 있는 것이 먼저(오름차순), 없는 것은 그 뒤에 선언 순서.
 * - 항목이 하나도 없는 그룹은 만들지 않는다.
 * - `depth` 기본 1 — 최상위 라우트만 본다. 🔴 hangang 의 `/settings` 자식은 인페이지 메뉴와
 *   중복되므로 사이드바에 올리지 않는다. 파일 기반 라우팅 프로젝트는 `'all'`.
 * - 🔴 `id`·`to` 는 부모에 이은 **전체 경로**다. 파일 기반 라우팅(`vue-router/auto-routes` +
 *   `setupLayouts`)은 페이지를 레이아웃 래퍼의 `path: ''` 자식·상대 경로 자식으로 낸다 — 레코드의
 *   `path` 를 그대로 쓰면 `id: ''`·`to: ''` 가 되어 링크가 깨지고 Vue key 가 겹친다.
 */
export function buildMenu<P extends string>(
  routes: readonly RouteRecordRaw[],
  options: {
    groups: readonly { key: string; title: string; icon?: string }[]
    depth?: 1 | 'all'
  },
): MenuNode<P>[] {
  const source =
    options.depth === 'all'
      ? walkRoutes(routes)
      : routes.map((route) => ({ route, fullPath: joinPath(undefined, route.path) }))

  type Slot = MenuNode<P> | { group: string }
  const slots: Slot[] = []
  const grouped = new Map<string, { node: MenuNode<P>; seq: number }[]>()
  let seq = 0

  for (const { route, fullPath } of source) {
    const meta = metaOf<P>(route)
    const menu = meta?.menu
    if (menu == null) continue

    const node: MenuNode<P> = {
      id: fullPath,
      title: menu.title ?? meta?.title ?? fullPath,
      to: fullPath,
      permissions: meta?.permissions,
      anyPermissions: meta?.anyPermissions,
    }
    if (menu.icon != null) node.icon = menu.icon
    if (menu.order != null) node.order = menu.order

    if (menu.group == null) {
      slots.push(node)
      continue
    }
    if (!options.groups.some((g) => g.key === menu.group)) {
      throw new Error(`메뉴 그룹 '${menu.group}' 가 groups 에 없다 (${fullPath})`)
    }
    let list = grouped.get(menu.group)
    if (list == null) {
      list = []
      grouped.set(menu.group, list)
      slots.push({ group: menu.group }) // 🔴 첫 자식이 나온 자리. 아래에서 groups 순서로 다시 채운다.
    }
    list.push({ node, seq: seq++ })
  }

  const groupQueue = options.groups.filter((g) => grouped.has(g.key))
  let next = 0
  return slots.map((slot): MenuNode<P> => {
    if (!('group' in slot)) return slot
    const def = groupQueue[next++]!
    const children = [...grouped.get(def.key)!]
      .sort((a, b) => (a.node.order ?? Infinity) - (b.node.order ?? Infinity) || a.seq - b.seq)
      .map((e) => e.node)
    const group: MenuNode<P> = { id: def.key, title: def.title, children }
    if (def.icon != null) group.icon = def.icon
    return group
  })
}

/**
 * `anyPermissions` 를 **선언한** 레코드 P 는, P 의 `anyPermissions` 를 **상속하는** 후손의
 * `permissions` 합집합을 덮어야 한다(⊇). 아니면 전체 경로로 가리키며 던진다.
 *
 * - `anyPermissions` 가 없거나 빈 레코드는 검사하지 않는다(`setupLayouts` 래퍼·파일 기반 라우팅의
 *   폴더 노드가 그렇다). 그래도 그 자식들은 계속 순회한다 — 더 깊은 레코드가 선언했을 수 있다.
 * - 후손 중 자기 `anyPermissions` 를 선언한 레코드는 서브트리째 P 의 몫에서 뺀다. 그 레코드는 P 로서
 *   따로 검사된다. 선언 없는 후손은 `permissions` 를 P 에 보태고 더 내려간다.
 *
 * 🔴 vue-router 는 `meta` 를 부모→자식으로 **얕게 assign** 한다(`mergeMetaFields`). 자식이
 *    `anyPermissions` 를 선언하지 않으면 부모 것이 그대로 살아 가드가 그것을(OR) 자식 자신의
 *    `permissions`(AND) 위에 더 요구한다. 부모 집합에 자식 권한이 없으면 그 권한만 가진 사용자는
 *    메뉴는 보는데 가드에서 막힌다. 반대로 자기 선언을 가진 자식은 부모 값을 덮으므로 부모와 무관하다.
 *
 * 정본: hangang-home `apps/admin/src/router/route-meta.test.ts`(`/settings` 부모 한 곳). 바꾼 점:
 * 정확히 같음(`===`)이 아니라 **상위집합**(⊇)만 요구한다 · 단일 `/settings` 가 아니라 모든 레코드로
 * 일반화하고 상속 규칙을 따라 후손을 본다.
 */
export function assertParentAnyPermissionsCoverChildren(routes: readonly RouteRecordRaw[]): void {
  const declared = (route: RouteRecordRaw): boolean =>
    (metaOf(route)?.anyPermissions?.length ?? 0) > 0

  // P 의 anyPermissions 를 상속하는 후손들의 permissions.
  const inherited = (route: RouteRecordRaw): string[] =>
    (route.children ?? []).flatMap((child) =>
      declared(child) ? [] : [...(metaOf(child)?.permissions ?? []), ...inherited(child)],
    )

  for (const { route, fullPath } of walkRoutes(routes)) {
    if (!declared(route)) continue
    const needed = new Set(inherited(route))
    const have = new Set(metaOf(route)?.anyPermissions ?? [])
    const missing = [...needed].filter((p) => !have.has(p))
    if (missing.length > 0) {
      throw new Error(
        `라우트 '${fullPath}' 의 anyPermissions 가 자식 권한을 덮지 못한다: ${missing.join(', ')}`,
      )
    }
  }
}
