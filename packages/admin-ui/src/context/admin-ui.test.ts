// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { VDataTableServer } from 'vuetify/components'
import { vuetify } from '../test/setup.js'
import DataTablePanel from '../components/table/DataTablePanel.vue'
import {
  ADMIN_LIST_MAX_PAGE_SIZE,
  DEFAULT_ITEMS_PER_PAGE_OPTIONS,
} from '../components/table/data-table.js'
import { createAdminUi, useAdminUi, type AdminUiContext, type AdminUserInfo } from './admin-ui.js'

const noopLogout = async () => {}

function captureContext(plugin?: ReturnType<typeof createAdminUi>) {
  let ctx: AdminUiContext | undefined
  const Probe = defineComponent({
    setup() {
      ctx = useAdminUi()
      return () => h('div')
    },
  })
  mount(Probe, { global: { plugins: plugin ? [plugin] : [] } })
  return ctx
}

describe('createAdminUi — 플러그인 객체 = API', () => {
  it('useAdminUi() 가 플러그인과 같은 객체를 돌려준다', () => {
    const plugin = createAdminUi({ user: () => null, logout: noopLogout })
    expect(captureContext(plugin)).toBe(plugin)
  })

  it('🔴 플러그인 없이 useAdminUi() 는 createAdminUi 를 안내하며 던진다', () => {
    expect(() => captureContext()).toThrow(/createAdminUi/)
  })

  it('user() 게터는 호출 시점마다 평가된다', () => {
    let current: AdminUserInfo | null = null
    const plugin = createAdminUi({ user: () => current, logout: noopLogout })
    expect(plugin.user()).toBeNull()
    current = { userId: '1', userName: '김', permissions: [] }
    expect(plugin.user()?.userName).toBe('김')
  })

  it('loginPath 기본은 /login, 지정하면 그 값', () => {
    expect(createAdminUi({ user: () => null, logout: noopLogout }).loginPath).toBe('/login')
    expect(
      createAdminUi({ user: () => null, logout: noopLogout, loginPath: '/signin' }).loginPath,
    ).toBe('/signin')
  })

  it('table 기본은 상수, 지정하면 덮어쓴다', () => {
    const base = createAdminUi({ user: () => null, logout: noopLogout })
    expect(base.table.itemsPerPageOptions).toBe(DEFAULT_ITEMS_PER_PAGE_OPTIONS)
    expect(base.table.maxPageSize).toBe(ADMIN_LIST_MAX_PAGE_SIZE)
    const custom = createAdminUi({
      user: () => null,
      logout: noopLogout,
      table: { itemsPerPageOptions: [5, 10], maxPageSize: 10 },
    })
    expect(custom.table.itemsPerPageOptions).toEqual([5, 10])
    expect(custom.table.maxPageSize).toBe(10)
  })

  it('ipBlocked 기본은 차단 아님, siteName 은 그대로 전달', () => {
    const plugin = createAdminUi({ user: () => null, logout: noopLogout, siteName: '관리자' })
    expect(plugin.ipBlocked()).toEqual({ blocked: false })
    expect(plugin.siteName).toBe('관리자')
  })

  it('install 은 app.provide 로 설치한다', () => {
    const plugin = createAdminUi({ user: () => null, logout: noopLogout })
    const app = createApp({ render: () => null })
    app.use(plugin)
    expect(app.runWithContext(() => useAdminUi())).toBe(plugin)
  })
})

describe('DataTablePanel — prop → 컨텍스트 → 상수', () => {
  const headers = [{ title: '제목', key: 'title' }]
  const mountPanel = (plugins: unknown[], props: Record<string, unknown> = {}) =>
    mount(DataTablePanel, {
      props: { headers, items: [], itemsLength: 0, ...props },
      global: { plugins: [vuetify, ...plugins] as never[] },
    })
  const optionsOf = (w: ReturnType<typeof mountPanel>) =>
    w.findComponent(VDataTableServer).props('itemsPerPageOptions')

  it('컨텍스트의 itemsPerPageOptions 가 상수를 이긴다', () => {
    const plugin = createAdminUi({
      user: () => null,
      logout: noopLogout,
      table: { itemsPerPageOptions: [5, 10] },
    })
    expect(optionsOf(mountPanel([plugin]))).toEqual([5, 10])
  })

  it('prop 이 컨텍스트를 이긴다', () => {
    const plugin = createAdminUi({
      user: () => null,
      logout: noopLogout,
      table: { itemsPerPageOptions: [5, 10] },
    })
    expect(optionsOf(mountPanel([plugin], { itemsPerPageOptions: [25] }))).toEqual([25])
  })

  it('컨텍스트가 없으면 상수 그대로', () => {
    expect(optionsOf(mountPanel([]))).toEqual([...DEFAULT_ITEMS_PER_PAGE_OPTIONS])
  })
})
