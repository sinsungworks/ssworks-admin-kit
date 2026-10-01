// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createAdminUi, type AdminUiOptions } from '../../context/admin-ui.js'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import IpBlockedDialog from './IpBlockedDialog.vue'

// 정본: hangang-home apps/admin/src/components/common/IpBlockedDialog.vue (렌더 테스트는 신규)
// 🔴 이 대화상자는 App.vue / `#overlays` 에 둔다 — 로그인 화면에서도 떠야 한다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountDialog(ui: Partial<AdminUiOptions> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/login', component: { render: () => null } },
    ],
  })
  await router.push('/')
  await router.isReady()
  wrapper = mount(IpBlockedDialog, {
    attachTo: document.body,
    global: {
      plugins: [
        vuetify,
        router,
        createAdminUi({ user: () => null, logout: async () => {}, ...ui }),
      ],
    },
  })
  await flushPromises()
  return router
}

describe('IpBlockedDialog', () => {
  it('차단이 아니면 열리지 않는다', async () => {
    await mountDialog({ ipBlocked: () => ({ blocked: false }) })
    expect(wrapper!.exists(), '가드 — 마운트됨').toBe(true)
    expect(document.body.textContent).not.toContain('접근이 차단되었습니다')
  })

  it('차단이면 열리고 IP 를 보여준다', async () => {
    await mountDialog({ ipBlocked: () => ({ blocked: true, ip: '1.2.3.4' }) })
    expect(document.body.textContent).toContain('접근이 차단되었습니다')
    expect(document.body.textContent).toContain('1.2.3.4')
  })

  it('IP 를 모르면 `확인 불가`', async () => {
    await mountDialog({ ipBlocked: () => ({ blocked: true }) })
    expect(document.body.textContent).toContain('확인 불가')
  })

  it('🔴 logout() 이 끝난 뒤 afterLogout() 을 부른다', async () => {
    const calls: string[] = []
    await mountDialog({
      ipBlocked: () => ({ blocked: true, ip: '1.2.3.4' }),
      logout: async () => {
        await Promise.resolve()
        calls.push('logout')
      },
      afterLogout: () => void calls.push('after'),
    })
    buttonByText('로그아웃')!.click()
    await flushPromises()
    expect(calls).toEqual(['logout', 'after'])
  })

  it('afterLogout 이 없으면 loginPath 로 replace', async () => {
    const router = await mountDialog({
      ipBlocked: () => ({ blocked: true }),
      loginPath: '/login',
    })
    buttonByText('로그아웃')!.click()
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
  })

  it('🔴 로그아웃 진행 중에는 버튼이 disabled 다(:loading 은 클릭을 안 막는다)', async () => {
    let release!: () => void
    let count = 0
    await mountDialog({
      ipBlocked: () => ({ blocked: true }),
      logout: () =>
        new Promise<void>((r) => {
          count++
          release = r
        }),
    })
    buttonByText('로그아웃')!.click()
    await flushPromises()
    expect(buttonByText('로그아웃')!.disabled).toBe(true)
    buttonByText('로그아웃')!.click()
    expect(count).toBe(1)
    release()
    await flushPromises()
  })
})
