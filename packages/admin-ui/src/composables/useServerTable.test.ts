// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { ApiError } from '../api/error.js'
import {
  useServerTable,
  type ServerTable,
  type ServerTableOptions,
  type ServerTableParams,
} from './useServerTable.js'

// 정본: hangang-home apps/admin/src/pages/org/users.vue 의 목록 규칙(조회 1번 · seq · 1쪽 · 정렬 보정 ·
//       bigint total · isFiltered)을 계약으로 못박는다.

interface Row {
  id: number
}
interface Filter {
  q?: string
  tags?: string[]
  teamNo?: bigint
}
type Result = { items: Row[]; total: number | bigint }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

function setup(overrides: Partial<ServerTableOptions<Row, Filter>> = {}) {
  const filter = ref<Filter>({})
  const fetch = vi.fn(async (_params: ServerTableParams<Filter>): Promise<Result> => ({
    items: [{ id: 1 }],
    total: 1,
  }))
  let table!: ServerTable<Row>
  wrapper = mount(
    defineComponent({
      setup() {
        table = useServerTable<Row, Filter>({
          fetch,
          sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
          filters: () => filter.value,
          ...overrides,
        })
        return () => h('div')
      },
    }),
  )
  return { filter, fetch, table: () => table }
}

describe('useServerTable — 조회', () => {
  it('마운트하면 한 번 조회한다 — params 는 createQuerySchema 가 읽는 모양', async () => {
    const { fetch, table } = setup()
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith({
      page: 1,
      itemsPerPage: 20,
      sortBy: ['joinAt'],
      sortOrder: ['desc'],
      filter: {},
    })
    expect(table().items.value).toEqual([{ id: 1 }])
    expect(table().total.value).toBe(1)
    expect(table().loading.value).toBe(false)
  })

  it('immediate: false 면 마운트에 조회하지 않고 reload() 로 조회한다', async () => {
    const { fetch, table } = setup({ immediate: false })
    await flushPromises()
    expect(fetch).not.toHaveBeenCalled()
    await table().reload()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('itemsPerPage 옵션이 기본 쪽 크기다', async () => {
    const { fetch } = setup({ itemsPerPage: 50 })
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ itemsPerPage: 50 }))
  })

  it('🔴 쪽과 정렬이 한 틱에 같이 바뀌어도 조회는 1번', async () => {
    const { fetch, table } = setup()
    await flushPromises()
    table().page.value = 3
    table().sortBy.value = [{ key: 'userId', order: 'asc' }]
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 3, sortBy: ['userId'], sortOrder: ['asc'] }),
    )
  })

  it('🔴 늦게 온 앞 응답은 버린다 — 뒤 요청의 결과가 남고 loading 은 뒤 요청이 끝날 때 내린다', async () => {
    const first = deferred<Result>()
    const second = deferred<Result>()
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { table } = setup({ fetch })
    await flushPromises()
    table().page.value = 2
    await flushPromises()
    first.resolve({ items: [{ id: 1 }], total: 1 })
    await flushPromises()
    expect(table().loading.value).toBe(true)
    second.resolve({ items: [{ id: 2 }], total: 2 })
    await flushPromises()
    expect(table().items.value).toEqual([{ id: 2 }])
    expect(table().loading.value).toBe(false)
  })

  it('🔴 total 이 bigint 여도 number 로 바꾼다', async () => {
    const { table } = setup({ fetch: vi.fn(async () => ({ items: [], total: 42n })) })
    await flushPromises()
    expect(table().total.value).toBe(42)
    expect(typeof table().total.value).toBe('number')
  })

  it('🔴 bigint 필터 값으로도 조회한다 — 비교 문자열을 만들다 던지지 않는다', async () => {
    const { fetch, filter } = setup()
    await flushPromises()
    filter.value = { teamNo: 3n }
    await flushPromises()
    expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ filter: { teamNo: 3n } }))
  })
})

describe('useServerTable — 1쪽 되돌리기 · 정렬 보정', () => {
  it('🔴 필터가 바뀌면 1쪽으로 — 조회는 1번', async () => {
    const { fetch, filter, table } = setup()
    await flushPromises()
    table().page.value = 3
    await flushPromises()
    fetch.mockClear()
    filter.value = { q: '김' }
    await flushPromises()
    expect(table().page.value).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ page: 1, filter: { q: '김' } }))
  })

  it('쪽 크기가 바뀌면 1쪽으로 — 1..100 으로 자르고, 정수가 아니면 기본값', async () => {
    const { fetch, table } = setup()
    await flushPromises()
    table().page.value = 4
    await flushPromises()
    fetch.mockClear()
    table().itemsPerPage.value = 50
    await flushPromises()
    expect(table().page.value).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    table().itemsPerPage.value = 500
    await flushPromises()
    expect(table().itemsPerPage.value).toBe(100)
    table().itemsPerPage.value = -1
    await flushPromises()
    expect(table().itemsPerPage.value).toBe(20)
  })

  it('🔴 빈 정렬(같은 헤더 세 번째 클릭) · 목록 밖 키는 기본 정렬로 되돌리고 다시 조회하지 않는다', async () => {
    const { fetch, table } = setup()
    await flushPromises()
    table().sortBy.value = []
    await flushPromises()
    expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
    table().sortBy.value = [{ key: 'password', order: 'asc' }]
    await flushPromises()
    expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('sort: false 면 sortBy · sortOrder 를 빈 배열로 보낸다', async () => {
    const { fetch } = setup({ sort: false })
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ sortBy: [], sortOrder: [] }))
  })
})

describe('useServerTable — 오류 · isFiltered', () => {
  it('실패하면 목록을 비우고(total 은 유지 — R4) error 에 ApiError — 처리 표시는 안 한다, 다음 조회 시작에 비운다', async () => {
    const failure = new ApiError('서버 오류', {
      status: 500,
      code: 'ERR_COMMON_INTERNAL',
      raw: null,
    })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 1 }], total: 1 })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ items: [{ id: 3 }], total: 1 })
    const { table } = setup({ fetch })
    await flushPromises()
    table().page.value = 2
    await flushPromises()
    expect(table().items.value).toEqual([])
    expect(table().total.value).toBe(1)
    expect(table().error.value).toBe(failure)
    expect(failure.handled).toBe(false)
    await table().reload()
    expect(table().error.value).toBeNull()
    expect(table().items.value).toEqual([{ id: 3 }])
  })

  it('ApiError 가 아닌 예외도 ApiError 로 바꾸고 console.error 로 남긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { table } = setup({ fetch: vi.fn().mockRejectedValue(new TypeError('x is undefined')) })
    await flushPromises()
    expect(table().error.value).toBeInstanceOf(ApiError)
    expect(log).toHaveBeenCalled()
  })

  it('isFiltered 기본 — undefined · null · 빈 문자열 · 빈 배열이 아닌 값이 있으면 true', async () => {
    const { filter, table } = setup()
    filter.value = { q: '', tags: [] }
    expect(table().isFiltered.value).toBe(false)
    filter.value = { q: '김' }
    expect(table().isFiltered.value).toBe(true)
  })

  it('isFiltered 옵션이 기본 판정을 대신한다', async () => {
    const { table } = setup({ isFiltered: () => true })
    expect(table().isFiltered.value).toBe(true)
  })
})
