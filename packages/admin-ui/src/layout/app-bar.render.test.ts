// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VLayout } from 'vuetify/components'
import { createAdminUi, type AdminUiOptions, type AdminUserInfo } from '../context/admin-ui.js'
import { installVisualViewport, vuetify } from '../test/setup.js'
import AppBar from './AppBar.vue'

// 정본: 신규(스펙 §3-3). hangang AppBar 에는 렌더 테스트가 없었다.
// 🔴 스토어는 라우팅하지 않는다 — 로그아웃 뒤 이동은 AppBar 가 한다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

const me: AdminUserInfo = {
  userId: 'kim01',
  userName: '김관리',
  permissions: [],
  teamName: '운영팀',
  roleName: '관리자',
}

interface Opts {
  props?: Record<string, unknown>
  slots?: Record<string, unknown>
  ui?: Partial<AdminUiOptions>
  path?: string
}

async function mountBar(opts: Opts = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => h('div') }, meta: { title: '대시보드' } },
      { path: '/bad', component: { render: () => h('div') }, meta: { title: 42 } },
      { path: '/login', component: { render: () => h('div') } },
      { path: '/account', component: { render: () => h('div') } },
    ],
  })
  await router.push(opts.path ?? '/')
  await router.isReady()
  const host = defineComponent({
    render: () =>
      h(VLayout, null, {
        default: () => h(AppBar as Component, opts.props ?? {}, (opts.slots ?? {}) as never),
      }),
  })
  wrapper = mount(host, {
    attachTo: document.body,
    global: {
      plugins: [
        vuetify,
        router,
        createAdminUi({ user: () => me, logout: async () => {}, ...opts.ui }),
      ],
    },
  })
  return { router, wrapper }
}

async function openMenu() {
  const trigger = document.querySelector('button[aria-label="사용자 메뉴"]') as HTMLElement
  trigger.click()
  await flushPromises()
}

const titleText = () => document.body.querySelector('.v-toolbar-title')?.textContent?.trim()

function item(text: string): HTMLElement {
  return [...document.querySelectorAll('.v-list-item')].find((e) =>
    (e.textContent ?? '').includes(text),
  ) as HTMLElement
}

describe('AppBar — 제목', () => {
  it('title prop 이 route.meta.title 보다 앞선다', async () => {
    await mountBar({ props: { title: '직접' } })
    expect(titleText()).toBe('직접')
  })

  it('title 이 없으면 route.meta.title', async () => {
    await mountBar()
    expect(titleText()).toBe('대시보드')
  })

  it('문자열이 아닌 meta.title 은 무시한다', async () => {
    await mountBar({ path: '/bad' })
    expect(titleText()).toBe('')
  })

  it('siteName prop 이 있으면 `사이트 · 제목`', async () => {
    await mountBar({ props: { siteName: '내 사이트' } })
    expect(titleText()).toBe('내 사이트 · 대시보드')
  })

  it('siteName prop 이 없으면 createAdminUi 의 siteName 으로 대체', async () => {
    await mountBar({ ui: { siteName: '플러그인 사이트' } })
    expect(titleText()).toBe('플러그인 사이트 · 대시보드')
  })

  it('siteName prop 이 플러그인 siteName 을 이긴다', async () => {
    await mountBar({ props: { siteName: 'prop' }, ui: { siteName: 'plugin' } })
    expect(titleText()).toBe('prop · 대시보드')
  })
})

describe('AppBar — 슬롯 · 이벤트', () => {
  it('@click:nav', async () => {
    const { wrapper } = await mountBar()
    ;(document.querySelector('.v-app-bar-nav-icon') as HTMLElement).click()
    expect(wrapper.findComponent(AppBar).emitted('click:nav')).toHaveLength(1)
  })

  it('#brand · #actions 슬롯 자리', async () => {
    await mountBar({
      slots: { brand: () => h('i', 'BRAND'), actions: () => h('i', 'ACTIONS') },
    })
    expect(document.body.textContent).toContain('BRAND')
    expect(document.body.textContent).toContain('ACTIONS')
  })
})

describe('AppBar — 사용자 메뉴', () => {
  it('user-info 기본은 userName/userId, 팀/역할 행은 showTeamRole 일 때만', async () => {
    await mountBar()
    await openMenu()
    expect(document.body.textContent).toContain('김관리')
    expect(document.body.textContent).toContain('kim01')
    expect(document.body.textContent).not.toContain('운영팀')
    wrapper?.unmount()
    document.body.innerHTML = ''
    await mountBar({ props: { showTeamRole: true } })
    await openMenu()
    expect(document.body.textContent).toContain('운영팀')
    expect(document.body.textContent).toContain('관리자')
  })

  it('#user-info 슬롯이 기본 정보를 대체한다', async () => {
    await mountBar({ slots: { 'user-info': () => h('i', 'CUSTOM-INFO') } })
    await openMenu()
    expect(document.body.textContent).toContain('CUSTOM-INFO')
    expect(document.body.textContent).not.toContain('kim01')
  })

  it('menuItems 를 그리고 visible:false 는 그리지 않는다', async () => {
    await mountBar({
      props: {
        menuItems: [
          { title: '내 계정', icon: 'mdi-card-account-details', to: '/account' },
          { title: '숨김', visible: false },
          { title: '보임', visible: true },
        ],
      },
    })
    await openMenu()
    expect(document.body.textContent).toContain('내 계정')
    expect(document.body.textContent).toContain('보임')
    expect(document.body.textContent).not.toContain('숨김')
  })

  it('menuItems 의 onClick 은 호출된다', async () => {
    const onClick = vi.fn()
    await mountBar({ props: { menuItems: [{ title: '도움말', onClick }] } })
    await openMenu()
    item('도움말').click()
    await flushPromises()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('menuItems 의 to 는 이동한다', async () => {
    const { router } = await mountBar({
      props: { menuItems: [{ title: '내 계정', to: '/account' }] },
    })
    await openMenu()
    item('내 계정').click()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/account')
  })

  it('#user-menu 슬롯은 메뉴 전체를 교체한다(로그아웃 항목 없음)', async () => {
    await mountBar({ slots: { 'user-menu': () => h('i', 'WHOLE') } })
    await openMenu()
    expect(document.body.textContent).toContain('WHOLE')
    expect(document.body.textContent).not.toContain('로그아웃')
  })
})

describe('AppBar — 로그아웃', () => {
  it('🔴 logout() 이 끝난 뒤 afterLogout() 을 부른다', async () => {
    const calls: string[] = []
    await mountBar({
      ui: {
        logout: async () => {
          await Promise.resolve()
          calls.push('logout')
        },
        afterLogout: () => void calls.push('after'),
      },
    })
    await openMenu()
    item('로그아웃').click()
    await flushPromises()
    expect(calls).toEqual(['logout', 'after'])
  })

  it('🔴 afterLogout 이 없으면 router.replace(loginPath)', async () => {
    const calls: string[] = []
    const { router } = await mountBar({
      ui: { logout: async () => void calls.push('logout'), loginPath: '/login' },
      path: '/account',
    })
    await openMenu()
    item('로그아웃').click()
    await flushPromises()
    expect(calls).toEqual(['logout'])
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
