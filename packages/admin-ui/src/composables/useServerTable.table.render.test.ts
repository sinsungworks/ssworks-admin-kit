// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ApiError } from '../api/error.js'
import DataTableBody from '../components/table/DataTableBody.vue'
import { vuetify } from '../test/setup.js'
import { bindQueryCodecs, queryCodec, withDefault } from './query-codec.js'
import { useServerTable, type ServerTable, type ServerTableParams } from './useServerTable.js'

// 🔴 VDataTableServer 는 `page > ceil(itemsLength / itemsPerPage)` 이면 자기 쪽으로 page 를 되돌린다.
//    useServerTable 만 따로 보는 테스트는 이 되돌리기를 못 본다 — README 배선 그대로 실물 DataTableBody 에
//    붙여, 오류 시 total · URL 복원 시 낡은 total 이 쪽 번호를 덮지 않는지 못박는다(최종 리뷰 F1).

type Row = { userId: string }
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ userId: `u${i}` }))

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function setup(
  initial: string,
  fetchImpl: (params: ServerTableParams<{ q: string | undefined }>) => Promise<{
    items: Row[]
    total: number
  }>,
) {
  const filter = ref({ q: '' })
  const fetch = vi.fn(fetchImpl)
  let table!: ServerTable<Row>
  const List = defineComponent({
    setup() {
      table = useServerTable<Row, { q: string | undefined }>({
        fetch,
        sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
        filters: () => ({ q: filter.value.q || undefined }),
        urlSync: bindQueryCodecs(filter, { q: withDefault(queryCodec.string(), '') }),
      })
      const { page, itemsPerPage, sortBy, items, total, loading } = table
      return () =>
        h(DataTableBody, {
          headers: [{ title: 'ID', key: 'userId' }],
          items: items.value,
          itemsLength: total.value,
          loading: loading.value,
          page: page.value,
          'onUpdate:page': (value: number) => (page.value = value),
          itemsPerPage: itemsPerPage.value,
          'onUpdate:itemsPerPage': (value: number) => (itemsPerPage.value = value),
          sortBy: sortBy.value,
          'onUpdate:sortBy': (value) => (sortBy.value = value),
        })
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/list', component: List }],
  })
  await router.push(initial)
  await router.isReady()
  wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router, vuetify] },
    attachTo: document.body,
  })
  await flushPromises()
  return { fetch, router, table }
}

const pagesOf = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.map((call) => (call[0] as ServerTableParams<unknown>).page)

describe('useServerTable + DataTableBody (실물 배선)', () => {
  it('S1: 3쪽에서 조회가 실패해도 3쪽에 머문다 — 조회 1번, URL 의 page=3 유지', async () => {
    let fail = false
    const { fetch, router, table } = await setup('/list?page=3', async () => {
      if (fail)
        throw new ApiError('down', { status: 503, code: 'ERR_COMMON_UNAVAILABLE', raw: null })
      return { items: rows(20), total: 137 }
    })
    expect(pagesOf(fetch)).toEqual([3])
    fail = true
    await table.reload()
    await flushPromises()
    await flushPromises()
    expect(pagesOf(fetch)).toEqual([3, 3])
    expect(table.page.value).toBe(3)
    expect(table.error.value).not.toBeNull()
    expect(router.currentRoute.value.query.page).toBe('3')
  })

  it('S2: 필터로 총계가 작아진 뒤 ?page=5 를 복원해도 5쪽이 산다 — 5쪽 조회 1번', async () => {
    const { fetch, router, table } = await setup('/list?q=kim', async (params) =>
      params.filter.q ? { items: rows(15), total: 15 } : { items: rows(20), total: 137 },
    )
    expect(table.total.value).toBe(15)
    await router.push('/list?page=5')
    await flushPromises()
    await flushPromises()
    expect(pagesOf(fetch)).toEqual([1, 5])
    expect(table.page.value).toBe(5)
    expect(table.total.value).toBe(137)
    expect(router.currentRoute.value.query.page).toBe('5')
  })
})
