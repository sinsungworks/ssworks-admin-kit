import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { ApiError } from '../api/error.js'
import { REMOTE_SEARCH_DEBOUNCE_MS, useRemoteSearch, type RemoteSearch } from './useRemoteSearch.js'

// 정본: hangang-home audit-logs.vue `requestSeq`(응답 경합)를 검색에 옮긴 것을 잰다(3f 스펙 C8).

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let scope: EffectScope

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  scope = effectScope()
})

afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

function setup<T>(fetch: (keyword: string) => Promise<readonly T[]>): RemoteSearch<T> {
  return scope.run(() => useRemoteSearch(fetch))!
}

describe('useRemoteSearch', () => {
  it('300ms 안의 입력은 마지막 것 하나로 부른다 — 앞뒤 공백은 뗀다', async () => {
    const fetch = vi.fn(async (keyword: string) => [keyword])
    const search = setup(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS - 1)
    search.search(' 김운 ')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS - 1)
    expect(fetch).not.toHaveBeenCalled()
    expect(search.searching.value).toBe(true)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('김운')
    expect(search.items.value).toEqual(['김운'])
    expect(search.searching.value).toBe(false)
  })

  it('빈 검색어는 부르지 않고 목록을 비운다', async () => {
    const fetch = vi.fn(async () => ['x'])
    const search = setup(fetch)
    search.search('x')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    search.search('   ')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(search.items.value).toEqual([])
    expect(search.searching.value).toBe(false)
  })

  it('같은 검색어를 다시 알려도 다시 부르지 않는다', async () => {
    const fetch = vi.fn(async () => ['x'])
    const search = setup(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    search.search('김 ')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('🔴 늦게 온 앞 응답은 버린다', async () => {
    const first = deferred<readonly string[]>()
    const second = deferred<readonly string[]>()
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const search = setup<string>(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    search.search('이')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    second.resolve(['이'])
    await flushPromises()
    first.resolve(['김'])
    await flushPromises()
    expect(search.items.value).toEqual(['이'])
    expect(search.searching.value).toBe(false)
  })

  it('실패하면 failed · 목록 비움 · 🔴 처리됨 표시(칸이 문구를 보인다)', async () => {
    const error = new ApiError('x', { status: 500, raw: null })
    const fetch = vi.fn(async () => {
      throw error
    })
    const search = setup<string>(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(search.failed.value).toBe(true)
    expect(search.items.value).toEqual([])
    expect(search.searching.value).toBe(false)
    expect(error.handled).toBe(true)
    // 다음 입력이 실패 표시를 내린다
    search.search('이')
    expect(search.failed.value).toBe(false)
  })

  it('🔴 버린 요청의 실패도 처리됨 — 새 요청의 결과를 보인다', async () => {
    const error = new ApiError('x', { status: 500, raw: null })
    const first = deferred<readonly string[]>()
    const second = deferred<readonly string[]>()
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const search = setup<string>(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    search.search('이')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    second.resolve(['이'])
    await flushPromises()
    first.reject(error)
    await flushPromises()
    expect(error.handled).toBe(true)
    expect(search.items.value).toEqual(['이'])
    expect(search.failed.value).toBe(false)
  })

  it('실패한 검색어를 다시 알리면 다시 부른다', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('x')
    })
    const search = setup<string>(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('해제 뒤에는 부르지 않고, 날아오던 응답도 버린다', async () => {
    const pending = deferred<readonly string[]>()
    const fetch = vi.fn().mockReturnValueOnce(pending.promise)
    const search = setup<string>(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    search.search('이')
    scope.stop()
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    pending.resolve(['김'])
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(search.items.value).toEqual([])
  })
})
