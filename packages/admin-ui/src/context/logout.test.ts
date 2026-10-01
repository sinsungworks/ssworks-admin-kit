// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createAdminUi, type AdminUiOptions } from './admin-ui.js'
import { useAdminLogout } from './logout.js'

// 정본: 신규. AppBar(hangang) 의 onLogout 과 IpBlockedDialog 가 같은 순서를 쓴다.

async function run(opts: Partial<AdminUiOptions>, calls: string[]) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => h('div') } },
      { path: '/login', component: { render: () => h('div') } },
      { path: '/signin', component: { render: () => h('div') } },
    ],
  })
  const origReplace = router.replace.bind(router)
  router.replace = ((to: Parameters<typeof router.replace>[0]) => {
    calls.push(`replace:${typeof to === 'string' ? to : JSON.stringify(to)}`)
    return origReplace(to)
  }) as typeof router.replace
  await router.push('/')
  await router.isReady()
  let fn!: () => Promise<void>
  const Probe = defineComponent({
    setup() {
      fn = useAdminLogout()
      return () => h('div')
    },
  })
  mount(Probe, {
    global: {
      plugins: [
        router,
        createAdminUi({
          user: () => null,
          logout: async () => {
            await Promise.resolve()
            calls.push('logout')
          },
          ...opts,
        }),
      ],
    },
  })
  await fn()
  await flushPromises()
}

describe('useAdminLogout', () => {
  it('🔴 afterLogout 이 있으면 logout() 이 끝난 뒤에 부르고 router.replace 는 안 부른다', async () => {
    const calls: string[] = []
    await run({ afterLogout: () => void calls.push('after') }, calls)
    expect(calls).toEqual(['logout', 'after'])
  })

  it('🔴 afterLogout 이 없으면 logout 뒤에 router.replace(loginPath)', async () => {
    const calls: string[] = []
    await run({ loginPath: '/signin' }, calls)
    expect(calls).toEqual(['logout', 'replace:/signin'])
  })

  it('loginPath 기본값은 /login', async () => {
    const calls: string[] = []
    await run({}, calls)
    expect(calls).toEqual(['logout', 'replace:/login'])
  })
})
