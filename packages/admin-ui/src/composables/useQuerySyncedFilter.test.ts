// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type LocationQuery } from 'vue-router'
import {
  stableQueryKey,
  useQuerySyncedFilter,
  type QuerySyncOptions,
} from './useQuerySyncedFilter.js'

// 정본: kim5257-crm-v5 useQuerySyncedFilter 의 🔴 규칙과 gise useRouteQuerySync 의 동작을 계약으로 못박는다.

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function setup(initial: string, extra: Partial<QuerySyncOptions> = {}) {
  const state = ref({ q: '' })
  const read = vi.fn((query: LocationQuery) => {
    state.value = { q: typeof query.q === 'string' ? query.q : '' }
  })
  const onInbound = vi.fn()
  let flushUrl: () => Promise<void> = () => Promise.resolve()
  const List = defineComponent({
    setup() {
      const sync = useQuerySyncedFilter({
        read,
        toQuery: () => ({ q: state.value.q || undefined }),
        onInbound,
        ...extra,
      })
      flushUrl = sync.flushUrl
      return () => h('div', 'list')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/list', component: List },
      { path: '/other', component: { render: () => h('div', 'other') } },
    ],
  })
  await router.push(initial)
  await router.isReady()
  const replace = vi.spyOn(router, 'replace')
  wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { state, read, onInbound, router, replace, flush: () => flushUrl() }
}

describe('useQuerySyncedFilter', () => {
  it('🔴 초기 복원은 감시 등록보다 먼저 — read 1번, URL 쓰기 · onInbound 없음', async () => {
    const { state, read, onInbound, replace } = await setup('/list?q=abc')
    expect(state.value.q).toBe('abc')
    expect(read).toHaveBeenCalledTimes(1)
    expect(onInbound).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('상태가 바뀌면 router.replace 로 쓴다', async () => {
    const { state, router, replace } = await setup('/list')
    state.value = { q: 'x' }
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/list?q=x')
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('🔴 자기가 쓴 쿼리는 인바운드로 보지 않는다 — read · onInbound 를 다시 부르지 않는다', async () => {
    const { state, read, onInbound } = await setup('/list')
    state.value = { q: 'x' }
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(1)
    expect(onInbound).not.toHaveBeenCalled()
  })

  it('같은 화면에 쿼리만 바뀌어 들어오면 read → onInbound, 그리고 같은 주소를 다시 쓰지 않는다', async () => {
    const { state, read, onInbound, router, replace } = await setup('/list?q=a')
    await router.push('/list?q=b')
    await flushPromises()
    expect(state.value.q).toBe('b')
    expect(read).toHaveBeenCalledTimes(2)
    expect(onInbound).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('🔴 다른 경로로 떠날 때 목적지 쿼리로 상태를 엎지 않는다', async () => {
    const { state, read, router } = await setup('/list?q=keep')
    await router.push('/other?q=dest')
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(1)
    expect(state.value.q).toBe('keep')
  })

  it('debounceMs 동안 모은 변경을 한 번에 쓴다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { state, router, replace } = await setup('/list', { debounceMs: 300 })
    state.value = { q: 'a' }
    await flushPromises()
    state.value = { q: 'ab' }
    await flushPromises()
    vi.advanceTimersByTime(299)
    await flushPromises()
    expect(replace).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query.q).toBe('ab')
  })

  it('🔴 화면이 사라질 때 대기 중인 쓰기를 반영하지 않는다 — 반영하면 목적지 경로에 쓴다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { state, router, replace } = await setup('/list', { debounceMs: 300 })
    state.value = { q: 'late' }
    await flushPromises()
    await router.push('/other')
    await flushPromises()
    vi.advanceTimersByTime(300)
    await flushPromises()
    expect(replace).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/other')
  })

  it('🔴 flushUrl 은 대기 중인 쓰기를 확정하고 기다린다 — 직후의 push 가 취소되지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { state, router, flush, replace } = await setup('/list', { debounceMs: 300 })
    state.value = { q: 'row' }
    await flushPromises()
    await flush()
    expect(router.currentRoute.value.fullPath).toBe('/list?q=row')
    await router.push('/other')
    vi.advanceTimersByTime(300)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/other')
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('router.replace 가 가드 예외로 거부돼도 삼킨다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { state, router } = await setup('/list')
    router.beforeEach((to) => {
      if (to.query.q === 'boom') throw new Error('가드')
    })
    state.value = { q: 'boom' }
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/list')
  })

  it('🔴 toQuery 가 숫자를 돌려줘도 한 번만 쓴다 — URL 의 문자열과 같은 값으로 본다', async () => {
    const count = ref(0)
    const List = defineComponent({
      setup() {
        useQuerySyncedFilter({
          read: (query) => {
            count.value = Number(query.n ?? 0)
          },
          toQuery: () => ({ n: count.value || undefined }),
        })
        return () => h('div')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/list', component: List }],
    })
    await router.push('/list')
    await router.isReady()
    const replace = vi.spyOn(router, 'replace')
    wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
      global: { plugins: [router] },
    })
    count.value = 3
    await flushPromises()
    await flushPromises()
    expect(router.currentRoute.value.query.n).toBe('3')
    expect(replace).toHaveBeenCalledTimes(1)
  })
})

describe('stableQueryKey', () => {
  it('키 순서 · undefined · null · 빈 배열과 무관하고, 값은 문자열로 맞춘다', () => {
    expect(stableQueryKey({ b: '2', a: ['x', 'y'], c: undefined, d: null, e: [] })).toBe(
      stableQueryKey({ a: ['x', 'y'], b: 2 }),
    )
  })

  it('구분자가 값에 있어도 다른 항목과 섞이지 않는다', () => {
    expect(stableQueryKey({ a: 'x,y' })).not.toBe(stableQueryKey({ a: ['x', 'y'] }))
  })
})
