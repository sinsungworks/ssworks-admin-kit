// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ApiError } from '../api/error.js'
import { bindQueryCodecs, queryCodec, withDefault, type QuerySyncBinding } from './query-codec.js'
import { useServerTable, type ServerTable } from './useServerTable.js'

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

async function setup(
  initial: string,
  urlSyncOverride?: QuerySyncBinding,
  fetchImpl: () => Promise<{ items: never[]; total: number }> = async () => ({
    items: [],
    total: 0,
  }),
) {
  const filter = ref<{ q: string }>({ q: '' })
  const fetch = vi.fn(fetchImpl)
  let table!: ServerTable<never>
  const List = defineComponent({
    setup() {
      table = useServerTable<never, { q?: string }>({
        fetch,
        sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
        filters: () => ({ q: filter.value.q || undefined }),
        urlSync:
          urlSyncOverride ?? bindQueryCodecs(filter, { q: withDefault(queryCodec.string(), '') }),
      })
      return () => h('div')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/list', component: List },
      { path: '/other', component: { render: () => h('div') } },
    ],
  })
  await router.push(initial)
  await router.isReady()
  wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { filter, fetch, router, table: () => table }
}

describe('useServerTable — urlSync', () => {
  it('🔴 첫 URL 에서 복원하고 조회는 1번 — 쪽 · 크기 · 정렬 · 필터', async () => {
    const { fetch } = await setup('/list?page=3&size=50&sort=userId:asc&q=x')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith({
      page: 3,
      itemsPerPage: 50,
      sortBy: ['userId'],
      sortOrder: ['asc'],
      filter: { q: 'x' },
    })
  })

  it('상태를 URL 에 싣고 기본값은 뺀다', async () => {
    const { router, table } = await setup('/list')
    table().page.value = 2
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/list?page=2')
    table().page.value = 1
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/list')
    table().sortBy.value = [{ key: 'userId', order: 'asc' }]
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'userId:asc' })
    table().itemsPerPage.value = 50
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'userId:asc', size: '50' })
  })

  it('필터를 바꾸면 URL 에 싣고 쪽 키는 사라진다(1쪽)', async () => {
    const { router, table, filter } = await setup('/list?page=3')
    filter.value = { q: '김' }
    await flushPromises()
    expect(table().page.value).toBe(1)
    expect(router.currentRoute.value.query).toEqual({ q: '김' })
  })

  it('🔴 URL 에서 복원할 때는 1쪽으로 되돌리지 않는다 — 조회 1번, 복원한 쪽 그대로', async () => {
    const { router, table, fetch } = await setup('/list')
    fetch.mockClear()
    await router.push('/list?page=4&q=y')
    await flushPromises()
    expect(table().page.value).toBe(4)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ page: 4, filter: { q: 'y' } }))
  })

  it('틀린 URL 값은 기본값 — 문자 쪽, 상한 넘는 크기, 목록 밖 정렬 키', async () => {
    const { fetch } = await setup('/list?page=abc&size=1000&sort=password:asc')
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        itemsPerPage: 20,
        sortBy: ['joinAt'],
        sortOrder: ['desc'],
      }),
    )
  })

  it('반복된 표 키는 첫 값을 쓴다 — 화면이 깨지지 않는다', async () => {
    const { fetch } = await setup('/list?page=2&page=5')
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('🔴 필터 키가 표 키(page·size·sort)와 겹치면 console.error 후 표 값이 이긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { router, table } = await setup('/list', {
      read: () => {},
      toQuery: () => ({ page: '99' }),
    })
    table().page.value = 2
    await flushPromises()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('page'))
    expect(router.currentRoute.value.query.page).toBe('2')
  })
})

describe('useServerTable — urlSync 의 임시 total', () => {
  const failing = async (): Promise<never> => {
    throw new ApiError('서버 오류', { status: 500, code: 'ERR_COMMON_INTERNAL', raw: null })
  }

  it('🔴 첫 복원(1쪽)은 total 을 올리지 않는다 — 첫 조회가 실패해도 "1 중 1-1" 이 남지 않는다', async () => {
    const { table } = await setup('/list', undefined, failing)
    expect(table().error.value).toBeInstanceOf(ApiError)
    expect(table().total.value).toBe(0)
  })

  it('🔴 첫 복원(깊은 쪽)도 total 을 올리지 않는다 — 첫 조회가 실패해도 지어낸 개수가 남지 않고 쪽은 그대로', async () => {
    const { table } = await setup('/list?page=5', undefined, failing)
    expect(table().total.value).toBe(0)
    expect(table().page.value).toBe(5)
  })

  it('🔴 1쪽으로의 인바운드 복원은 total 을 올리지 않는다 — 조회가 없으면 빈 목록이 그대로 0건', async () => {
    const { router, table, fetch } = await setup('/list?q=zzz')
    fetch.mockClear()
    await router.push('/list?q=zzz&page=1')
    await flushPromises()
    expect(fetch).not.toHaveBeenCalled()
    expect(table().total.value).toBe(0)
  })
})
