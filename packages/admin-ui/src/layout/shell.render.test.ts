// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VApp } from 'vuetify/components'
import { createAdminUi } from '../context/admin-ui.js'
import { createAdminVuetify } from '../vuetify/createAdminVuetify.js'
import type { MenuNode } from '../menu/menu.js'
import { buttonByText, installVisualViewport } from '../test/setup.js'
import AdminShell from './AdminShell.vue'
import AuthShell from './AuthShell.vue'

// 정본: 신규(스펙 §2 · §3-3). hangang `layouts/default.vue`·`auth.vue` 를 일반화했다.
// 🔴 레일 상태는 데스크톱 폭에서만 의미가 있다 — 폭을 1920 으로 두고 새 Vuetify 인스턴스를 쓴다.

installVisualViewport() // 사용자 메뉴(VMenu)를 여는 테스트가 있다

let wrapper: VueWrapper | null = null
const originalWidth = window.innerWidth

beforeEach(() => {
  window.innerWidth = 1920
  window.localStorage.clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  window.innerWidth = originalWidth
})

const items: MenuNode[] = [{ id: 'home', title: '홈 메뉴', to: '/' }]

async function mountShell(
  shell: unknown,
  props: Record<string, unknown> = {},
  slots: Record<string, unknown> = {},
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => h('p', 'ROUTE-VIEW') }, meta: { title: '대시보드' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const host = defineComponent({
    render: () =>
      h(VApp, null, {
        default: () => h(shell as never, props, slots as never),
      }),
  })
  wrapper = mount(host, {
    attachTo: document.body,
    global: {
      plugins: [
        createAdminVuetify(),
        router,
        createAdminUi({ user: () => null, logout: async () => {} }),
      ],
    },
  })
  await flushPromises()
  return wrapper
}

const drawer = () => document.querySelector('.v-navigation-drawer')
const main = () => document.querySelector('main.v-main') as HTMLElement

describe('AdminShell — 기본 조립', () => {
  it('MainMenu 와 AppBar 가 기본으로 그려지고 기본 슬롯은 RouterView 다', async () => {
    await mountShell(AdminShell, { menuProps: { items } })
    expect(drawer()).toBeTruthy()
    expect(drawer()!.textContent).toContain('홈 메뉴')
    expect(document.querySelector('header.v-app-bar')).toBeTruthy()
    expect(main().textContent).toContain('ROUTE-VIEW')
    expect(document.querySelector('.v-toolbar-title')?.textContent).toContain('대시보드')
  })

  it('menuProps.items 가 없으면 빈 메뉴로 그린다', async () => {
    await mountShell(AdminShell)
    expect(drawer()).toBeTruthy()
    expect(drawer()!.querySelectorAll('.v-list-item')).toHaveLength(0)
  })

  it('appBarProps 가 AppBar 로 간다', async () => {
    await mountShell(AdminShell, { appBarProps: { title: '직접 제목' } })
    expect(document.querySelector('.v-toolbar-title')?.textContent).toContain('직접 제목')
  })

  it('#drawer · #app-bar 슬롯이 기본 MainMenu · AppBar 를 교체한다', async () => {
    await mountShell(
      AdminShell,
      {},
      { drawer: () => h('i', 'MY-DRAWER'), 'app-bar': () => h('i', 'MY-BAR') },
    )
    expect(document.body.textContent).toContain('MY-DRAWER')
    expect(document.body.textContent).toContain('MY-BAR')
    expect(drawer()).toBeNull()
    expect(document.querySelector('header.v-app-bar')).toBeNull()
  })

  it('#banner 는 VMain 안에서 본문 앞, #overlays 는 VMain 뒤', async () => {
    await mountShell(
      AdminShell,
      {},
      { banner: () => h('i', 'BANNER'), overlays: () => h('i', 'OVERLAY') },
    )
    const text = main().textContent ?? ''
    expect(text).toContain('BANNER')
    expect(text.indexOf('BANNER')).toBeLessThan(text.indexOf('ROUTE-VIEW'))
    expect(text).not.toContain('OVERLAY')
    const overlay = [...document.querySelectorAll('i')].find((e) => e.textContent === 'OVERLAY')
    expect(overlay).toBeTruthy()
    expect(main().compareDocumentPosition(overlay!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('container 는 기본 false(PanelLayout 전제), true 면 VContainer 로 감싼다', async () => {
    await mountShell(AdminShell)
    expect(main().querySelector('.v-container')).toBeNull()
    wrapper?.unmount()
    document.body.innerHTML = ''
    await mountShell(AdminShell, { container: true })
    expect(main().querySelector('.v-container')).toBeTruthy()
  })

  it('기본 슬롯 내용이 있으면 RouterView 대신 그린다', async () => {
    await mountShell(AdminShell, {}, { default: () => h('i', 'CUSTOM-BODY') })
    expect(main().textContent).toContain('CUSTOM-BODY')
    expect(main().textContent).not.toContain('ROUTE-VIEW')
  })
})

describe('AdminShell — 레일 상태 저장', () => {
  const navIcon = () => document.querySelector('.v-app-bar-nav-icon') as HTMLElement
  const isRail = () => drawer()!.classList.contains('v-navigation-drawer--rail')

  it('저장된 true 를 복원한다', async () => {
    window.localStorage.setItem('admin_rail_menu', 'true')
    await mountShell(AdminShell, { menuProps: { items } })
    expect(isRail()).toBe(true)
  })

  it('저장 값이 없으면 펼친 채다', async () => {
    await mountShell(AdminShell, { menuProps: { items } })
    expect(isRail()).toBe(false)
  })

  it('nav 아이콘을 누르면 rail 이 토글되고 기본 키로 저장된다', async () => {
    await mountShell(AdminShell, { menuProps: { items } })
    navIcon().click()
    await flushPromises()
    expect(isRail()).toBe(true)
    expect(window.localStorage.getItem('admin_rail_menu')).toBe('true')
    navIcon().click()
    await flushPromises()
    expect(window.localStorage.getItem('admin_rail_menu')).toBe('false')
  })

  it('railStorageKey 로 키를 바꾼다', async () => {
    await mountShell(AdminShell, { menuProps: { items }, railStorageKey: 'my_rail' })
    navIcon().click()
    await flushPromises()
    expect(window.localStorage.getItem('my_rail')).toBe('true')
    expect(window.localStorage.getItem('admin_rail_menu')).toBeNull()
  })
})

describe('AdminShell — 기본 자식으로 슬롯 전달', () => {
  const navIcon = () => document.querySelector('.v-app-bar-nav-icon') as HTMLElement
  const isRail = () => drawer()!.classList.contains('v-navigation-drawer--rail')
  const appBar = () => document.querySelector('header.v-app-bar') as HTMLElement

  async function openUserMenu() {
    ;(document.querySelector('button[aria-label="사용자 메뉴"]') as HTMLElement).click()
    await flushPromises()
  }

  it('🔴 #app-bar-actions · #menu-prepend 가 기본 AppBar · MainMenu 안에 그려지고 nav 아이콘은 그대로 rail 을 토글한다', async () => {
    await mountShell(
      AdminShell,
      { menuProps: { items } },
      {
        'app-bar-actions': () => h('i', 'MY-ACTIONS'),
        'menu-prepend': ({ rail }: { rail: boolean }) => h('i', `PREPEND rail=${rail}`),
      },
    )
    expect(appBar().textContent).toContain('MY-ACTIONS')
    expect(drawer()!.textContent).toContain('PREPEND rail=false')
    expect(drawer()!.textContent).toContain('홈 메뉴')
    navIcon().click()
    await flushPromises()
    expect(isRail()).toBe(true)
    expect(drawer()!.textContent).toContain('PREPEND rail=true')
  })

  it('#app-bar-brand · #menu-append 도 기본 자식으로 간다', async () => {
    await mountShell(
      AdminShell,
      { menuProps: { items } },
      {
        'app-bar-brand': () => h('i', 'MY-BRAND'),
        'menu-append': ({ rail }: { rail: boolean }) => h('i', `APPEND rail=${rail}`),
      },
    )
    expect(appBar().textContent).toContain('MY-BRAND')
    expect(drawer()!.textContent).toContain('APPEND rail=false')
  })

  it('#app-bar-user-info 는 사용자 정보만 바꾸고 로그아웃 항목은 남는다', async () => {
    await mountShell(AdminShell, {}, { 'app-bar-user-info': () => h('i', 'MY-INFO') })
    await openUserMenu()
    expect(document.body.textContent).toContain('MY-INFO')
    expect(document.body.textContent).toContain('로그아웃')
  })

  it('#app-bar-user-menu 는 사용자 메뉴 전체를 바꾼다', async () => {
    await mountShell(AdminShell, {}, { 'app-bar-user-menu': () => h('i', 'MY-MENU') })
    await openUserMenu()
    expect(document.body.textContent).toContain('MY-MENU')
    expect(document.body.textContent).not.toContain('로그아웃')
  })

  it('#app-bar-user-menu 는 AppBar #user-menu 의 슬롯 props({ user, logout })를 그대로 받는다', async () => {
    await mountShell(
      AdminShell,
      {},
      {
        'app-bar-user-menu': ({ user, logout }: { user: unknown; logout: unknown }) =>
          h('i', `MY-MENU user=${String(user)} logout=${typeof logout}`),
      },
    )
    await openUserMenu()
    expect(document.body.textContent).toContain('MY-MENU user=null logout=function')
  })

  it('전달 슬롯을 안 주면 기본 내용이 그대로다', async () => {
    await mountShell(AdminShell)
    await openUserMenu()
    expect(document.body.textContent).toContain('로그아웃')
  })
})

describe('AdminShell — 교체 슬롯 props', () => {
  const isRail = () => drawer()!.classList.contains('v-navigation-drawer--rail')

  it('🔴 #app-bar 는 { toggleNav } 를 받는다 — 직접 만든 앱바가 기본 메뉴의 rail 을 토글한다', async () => {
    await mountShell(
      AdminShell,
      { menuProps: { items } },
      {
        'app-bar': ({ toggleNav }: { toggleNav: () => void }) =>
          h('button', { onClick: toggleNav }, 'MY-NAV'),
      },
    )
    expect(isRail()).toBe(false)
    buttonByText('MY-NAV')!.click()
    await flushPromises()
    expect(isRail()).toBe(true)
    expect(window.localStorage.getItem('admin_rail_menu')).toBe('true')
  })

  it('🔴 #drawer 는 { show, rail } 을 받는다', async () => {
    window.localStorage.setItem('admin_rail_menu', 'true')
    await mountShell(
      AdminShell,
      {},
      {
        drawer: ({ show, rail }: { show: boolean; rail: boolean }) =>
          h('i', `DRAWER show=${show} rail=${rail}`),
      },
    )
    expect(document.body.textContent).toContain('DRAWER show=true rail=true')
  })

  it('#drawer 의 rail 은 기본 앱바의 nav 아이콘을 따른다', async () => {
    await mountShell(
      AdminShell,
      {},
      { drawer: ({ rail }: { rail: boolean }) => h('i', `DRAWER rail=${rail}`) },
    )
    expect(document.body.textContent).toContain('DRAWER rail=false')
    ;(document.querySelector('.v-app-bar-nav-icon') as HTMLElement).click()
    await flushPromises()
    expect(document.body.textContent).toContain('DRAWER rail=true')
  })

  it('#drawer 의 setShow — 모바일 폭에서 열림을 바꾼다', async () => {
    window.innerWidth = 800
    await mountShell(
      AdminShell,
      {},
      {
        drawer: ({ show, setShow }: { show: boolean; setShow: (v: boolean) => void }) =>
          h('button', { onClick: () => setShow(!show) }, `DRAWER show=${show}`),
      },
    )
    buttonByText('DRAWER show=false')!.click()
    await flushPromises()
    expect(buttonByText('DRAWER show=true')).toBeTruthy()
  })
})

describe('AuthShell', () => {
  it('가운데 정렬 VMain 안에 기본 슬롯(RouterView)을 그리고 #brand 를 둔다', async () => {
    await mountShell(AuthShell, {}, { brand: () => h('i', 'BRAND') })
    expect(main().textContent).toContain('ROUTE-VIEW')
    expect(main().textContent).toContain('BRAND')
    expect(main().querySelector('.d-flex.justify-center.align-center')).toBeTruthy()
    expect(drawer()).toBeNull()
  })
})
