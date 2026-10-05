// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, KeepAlive, type Component, type VNode } from 'vue'
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type Router,
  type RouteRecordRaw,
} from 'vue-router'
import { createPermissionCheck } from '@ssworks/admin-shared'
import { createAdminUi, type AdminUserInfo } from '../context/admin-ui.js'
import { vuetify } from '../test/setup.js'
import SettingsShell from './SettingsShell.vue'

// 정본: hangang-home apps/admin/src/pages/settings/settings.render.test.ts — 자식 meta 파생 · 권한 있는 첫 자식으로
//       보내기 · 재진입 리다이렉트를 실제 vue-router 로 잰다.

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const page = (text: string): Component => ({ render: () => h('p', text) })

const CHILDREN: RouteRecordRaw[] = [
  { path: '', component: page('INDEX') },
  {
    path: 'site',
    component: page('SITE'),
    meta: { title: '사이트', permissions: ['setting:read'] },
  },
  {
    path: 'roles',
    component: page('ROLES'),
    meta: {
      title: '역할',
      permissions: ['org.roles:read'],
      menu: { title: '역할 관리', icon: 'mdi-account-key' },
    },
  },
  {
    path: 'roles/:roleNo',
    component: page('ROLE-DETAIL'),
    meta: { title: '역할 상세', permissions: ['org.roles:read'] },
  },
  { path: 'about', component: page('ABOUT'), meta: { title: '정보' } },
]

interface SetupOptions {
  permissions?: string[]
  children?: RouteRecordRaw[]
  /** setupLayouts 처럼 `path: ''` 래퍼 아래에 셸을 둔다. */
  wrap?: boolean
  basePath?: string
  shellProps?: Record<string, unknown>
  slots?: Record<string, () => unknown>
  start?: string
  /** 루트 `RouterView` 의 페이지를 `KeepAlive` 로 감싼다(템플릿 `App.vue` 의 흔한 배선). */
  keepAlive?: boolean
  /** 최상위에 더할 라우트 — 셸과 같은 컴포넌트를 쓰는 다른 레코드를 만들 때 `shell` 을 받는다. */
  extraRoutes?: (shell: Component) => RouteRecordRaw[]
}

async function setup(options: SetupOptions = {}): Promise<Router> {
  const shell: Component = {
    render: () => h(SettingsShell, options.shellProps ?? {}, options.slots),
  }
  const basePath = options.basePath ?? '/settings'
  const children = options.children ?? CHILDREN
  const settings: RouteRecordRaw = options.wrap
    ? {
        path: basePath,
        component: { render: () => h(RouterView) },
        children: [{ path: '', component: shell, children }],
      }
    : { path: basePath, component: shell, children }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: page('HOME') },
      { path: '/403', component: page('FORBIDDEN') },
      { path: '/denied', component: page('DENIED') },
      { path: '/users', component: page('USERS') },
      settings,
      ...(options.extraRoutes?.(shell) ?? []),
    ],
  })
  const user: AdminUserInfo = {
    userId: 'u',
    userName: '김',
    permissions: options.permissions ?? ['*'],
  }
  const root: Component = options.keepAlive
    ? {
        render: () =>
          h(RouterView, null, {
            default: ({ Component: view }: { Component?: VNode }) =>
              h(KeepAlive, null, { default: () => (view ? h(view) : null) }),
          }),
      }
    : { render: () => h(RouterView) }
  wrapper = mount(root, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router, createAdminUi({ user: () => user, logout: async () => {} })],
    },
  })
  await router.push(options.start ?? '/settings')
  await flushPromises()
  return router
}

const menuTitles = () =>
  [...document.querySelectorAll('.v-list-item-title')].map((el) => el.textContent?.trim())
const menuLinks = () =>
  [...document.querySelectorAll('a.v-list-item')].map((el) => el.getAttribute('href'))

describe('SettingsShell — 메뉴', () => {
  it('직속 자식이 메뉴가 된다 — 인덱스와 동적 세그먼트 자식은 빠지고, 제목은 meta.menu.title → meta.title', async () => {
    await setup({ start: '/settings/about' })
    expect(menuTitles()).toEqual(['사이트', '역할 관리', '정보'])
    expect(menuLinks()).toEqual(['/settings/site', '/settings/roles', '/settings/about'])
    expect(document.querySelector('.mdi-account-key')).not.toBeNull()
  })

  it('권한으로 거른다 — 권한 선언이 없는 자식은 공개다', async () => {
    await setup({ permissions: ['org.roles:read'], start: '/settings/about' })
    expect(menuTitles()).toEqual(['역할 관리', '정보'])
  })

  it('check prop 을 주면 사용자 대신 그것으로 판정한다', async () => {
    await setup({
      shellProps: { check: createPermissionCheck(() => ['setting:read']) },
      start: '/settings/about',
    })
    expect(menuTitles()).toEqual(['사이트', '정보'])
  })

  it('자식 페이지는 셸의 RouterView 에 그려진다', async () => {
    await setup({ start: '/settings/about' })
    expect(document.body.textContent).toContain('ABOUT')
  })

  it('기본 슬롯을 주면 RouterView 대신 그린다', async () => {
    await setup({ start: '/settings/about', slots: { default: () => h('p', 'CUSTOM') } })
    expect(document.body.textContent).toContain('CUSTOM')
    expect(document.body.textContent).not.toContain('ABOUT')
  })
})

describe('SettingsShell — 리다이렉트', () => {
  it('🔴 부모로 들어오면 걸러진 첫 자식으로 replace 한다 — 고정 자식이 아니다', async () => {
    const router = await setup({ permissions: ['org.roles:read'] })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/roles'))
    expect(document.body.textContent).toContain('ROLES')
  })

  it('🔴 자식에서 부모로 다시 들어와도 다시 보낸다 — 셸은 다시 마운트되지 않는다', async () => {
    const router = await setup({ start: '/settings/about' })
    expect(router.currentRoute.value.path).toBe('/settings/about')
    await router.push('/settings')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/site'))
  })

  it('허용된 자식이 없으면 forbiddenPath 로 보낸다 — 기본 /403', async () => {
    const children: RouteRecordRaw[] = [
      { path: 'site', component: page('SITE'), meta: { permissions: ['setting:read'] } },
    ]
    const router = await setup({ permissions: [], children })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/403'))
  })

  it('forbiddenPath 를 바꿀 수 있다', async () => {
    const children: RouteRecordRaw[] = [
      { path: 'site', component: page('SITE'), meta: { permissions: ['setting:read'] } },
    ]
    const router = await setup({
      permissions: [],
      children,
      shellProps: { forbiddenPath: '/denied' },
    })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/denied'))
  })

  it("🔴 setupLayouts 처럼 path '' 래퍼 아래에서도 셸의 레코드를 잡는다", async () => {
    const router = await setup({ wrap: true })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/site'))
    expect(menuTitles()).toEqual(['사이트', '역할 관리', '정보'])
  })
})

describe('SettingsShell — KeepAlive · 인스턴스 재사용', () => {
  it('🔴 KeepAlive 로 비활성인 셸은 남의 경로를 리다이렉트하지 않는다 — 다시 활성되면 리다이렉트한다', async () => {
    const router = await setup({ keepAlive: true, start: '/settings/roles' })
    expect(router.currentRoute.value.path).toBe('/settings/roles')
    await router.push('/users')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/users')
    expect(document.body.textContent).toContain('USERS')
    expect(document.body.textContent).not.toContain('FORBIDDEN')
    await router.push('/settings')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/site'))
  })

  it.each([false, true])(
    '같은 셸 컴포넌트가 다른 레코드를 그리면(인스턴스 재사용) 그 레코드를 따른다 — keepAlive: %s',
    async (keepAlive) => {
      const router = await setup({
        keepAlive,
        start: '/settings/about',
        extraRoutes: (shell) => [
          {
            path: '/preferences',
            component: shell,
            children: [{ path: 'theme', component: page('THEME'), meta: { title: '테마' } }],
          },
        ],
      })
      await router.push('/preferences')
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/preferences/theme'))
      expect(menuTitles()).toEqual(['테마'])
      expect(document.body.textContent).toContain('THEME')
    },
  )
})

describe('SettingsShell — 잘못 쓴 경우', () => {
  it('RouterView 밖에서 쓰면 안내하며 던진다', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: page('HOME') }],
    })
    // VTU 의 mount 는 마운트 중 setup 에서 난 첫 오류를 errorHandler 설정과 무관하게 다시 던진다.
    expect(() =>
      mount(SettingsShell, {
        global: {
          plugins: [vuetify, router, createAdminUi({ user: () => null, logout: async () => {} })],
        },
      }),
    ).toThrow(/RouterView/)
  })

  it('동적 세그먼트가 있는 부모는 경고하고 메뉴를 그리지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await setup({ basePath: '/projects/:id/settings', start: '/projects/1/settings/about' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/projects/:id/settings'))
    expect(menuTitles()).toEqual([])
  })
})
