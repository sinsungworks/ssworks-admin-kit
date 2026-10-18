import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import type { AdminIpPreview } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { emptyIpRuleForm, type IpRuleForm } from '../components/ip-access/ip-access.js'
import {
  IP_PREVIEW_DEBOUNCE_MS,
  useIpPreview,
  type IpPreviewController,
  type IpPreviewOptions,
} from './useIpPreview.js'

// 정본: hangang-home ip-access.vue 의 previewSeq · null ≠ {} · 404 stale · actorIp 유지를 상태 기계로 옮긴 것을 잰다(3g 스펙 I9–I12).

const result = (clientIp: string | null = '203.0.113.7'): AdminIpPreview => ({
  clientIp,
  clientPasses: true,
  summary: {
    total: 3,
    newlyLocked: 0,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const ready: IpRuleForm = { ...emptyIpRuleForm(), cidr: '203.0.113.0/24' }
type PreviewFn = IpPreviewOptions['preview']

let scope: EffectScope

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  scope = effectScope()
})

afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

function setup(
  preview: PreviewFn,
  over: Partial<Omit<IpPreviewOptions, 'preview'>> = {},
): IpPreviewController {
  return scope.run(() => useIpPreview({ preview, canManage: () => true, ...over }))!
}

describe('useIpPreview', () => {
  it('만들자마자 현행({})을 바로 부르고 clientIp 를 채운다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith({})
    expect(c.view.value).toMatchObject({ state: 'ready', op: null, clientIp: '203.0.113.7' })
  })

  it('immediate: false 면 부르지 않는다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    setup(preview, { immediate: false })
    await flushPromises()
    expect(preview).not.toHaveBeenCalled()
  })

  it('🔴 덜 찬 만들기는 부르지 않는다 — pending-input, 순번을 올려 날아오던 응답이 덮지 못한다', async () => {
    const first = deferred<AdminIpPreview>()
    const preview = vi.fn<PreviewFn>().mockReturnValueOnce(first.promise)
    const c = setup(preview)
    c.setTarget({ op: 'create', form: emptyIpRuleForm() })
    expect(c.view.value.state).toBe('pending-input')
    first.resolve(result())
    await flushPromises()
    expect(c.view.value.state).toBe('pending-input')
    expect(preview).toHaveBeenCalledTimes(1)
  })

  it('편집 질의는 300ms 디바운스 — 그사이 loading · 이전 결과 없음 · clientIp 유지, 같은 키는 다시 안 부른다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'create', form: ready })
    expect(c.view.value).toMatchObject({
      state: 'loading',
      op: 'create',
      result: null,
      clientIp: '203.0.113.7',
    })
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS - 1)
    expect(preview).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(preview).toHaveBeenLastCalledWith({
      op: 'create',
      scopeType: 'global',
      cidr: '203.0.113.0/24',
    })
    expect(c.view.value.state).toBe('ready')
    c.setTarget({ op: 'create', form: { ...ready } })
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('삭제는 바로 부른다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'delete', ruleNo: 12n })
    await flushPromises()
    expect(preview).toHaveBeenLastCalledWith({ op: 'delete', ruleNo: 12n })
  })

  it('🔴 권한 게터가 거짓이면 forbidden — 질의와 상관없이 부르지 않는다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview, { canManage: () => false })
    c.setTarget({ op: 'create', form: ready })
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(preview).not.toHaveBeenCalled()
    expect(c.view.value.state).toBe('forbidden')
  })

  it('403 → forbidden · 404 → stale + onStale · 400 · 500 → failed — 처리됨 표시 · clientIp 유지', async () => {
    const errors = [403, 404, 400, 500].map((status) => new ApiError('x', { status, raw: null }))
    const preview = vi.fn<PreviewFn>().mockResolvedValueOnce(result())
    for (const error of errors) preview.mockRejectedValueOnce(error)
    const onStale = vi.fn()
    const c = setup(preview, { onStale })
    await flushPromises()
    const states: string[] = []
    for (const ruleNo of [1n, 2n, 3n, 4n]) {
      c.setTarget({ op: 'delete', ruleNo })
      await flushPromises()
      states.push(c.view.value.state)
      expect(c.view.value.clientIp).toBe('203.0.113.7')
    }
    expect(states).toEqual(['forbidden', 'stale', 'failed', 'failed'])
    expect(onStale).toHaveBeenCalledTimes(1)
    expect(errors.every((error) => error.handled)).toBe(true)
  })

  it('🔴 404 는 수정 · 삭제 미리보기만 stale — 현행 · 만들기의 404 는 failed (onStale 없음)', async () => {
    const error = new ApiError('x', { status: 404, raw: null })
    const preview = vi.fn<PreviewFn>().mockRejectedValue(error)
    const onStale = vi.fn()
    const c = setup(preview, { onStale })
    await flushPromises()
    expect(c.view.value.state).toBe('failed')
    c.setTarget({ op: 'create', form: ready })
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(c.view.value).toMatchObject({ state: 'failed', op: 'create' })
    expect(onStale).not.toHaveBeenCalled()
    c.setTarget({ op: 'update', ruleNo: 3n, form: ready })
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(c.view.value.state).toBe('stale')
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('🔴 늦게 온 앞 응답은 버린다', async () => {
    const a = deferred<AdminIpPreview>()
    const b = deferred<AdminIpPreview>()
    const preview = vi
      .fn<PreviewFn>()
      .mockResolvedValueOnce(result())
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise)
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'delete', ruleNo: 1n })
    c.setTarget({ op: 'delete', ruleNo: 2n })
    b.resolve(result('198.51.100.2'))
    await flushPromises()
    a.resolve(result('198.51.100.1'))
    await flushPromises()
    expect(c.view.value.clientIp).toBe('198.51.100.2')
  })

  it('🔴 버린 응답의 실패도 처리됨 — 전역 토스트가 뒤늦게 뜨지 않게', async () => {
    const a = deferred<AdminIpPreview>()
    const b = deferred<AdminIpPreview>()
    const preview = vi
      .fn<PreviewFn>()
      .mockResolvedValueOnce(result())
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise)
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'delete', ruleNo: 1n })
    c.setTarget({ op: 'delete', ruleNo: 2n })
    b.resolve(result('198.51.100.2'))
    await flushPromises()
    const error = new ApiError('x', { status: 500, raw: null })
    a.reject(error)
    await flushPromises()
    expect(error.handled).toBe(true)
    expect(c.view.value.state).toBe('ready')
    expect(c.view.value.clientIp).toBe('198.51.100.2')
  })

  it('flush — 디바운스 중이면 바로 부르고 그 결과를 돌려준다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'create', form: ready })
    const flushed = await c.flush()
    expect(preview).toHaveBeenCalledTimes(2)
    expect(flushed.state).toBe('ready')
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('flush — 진행 중이면 그 응답을 기다린다', async () => {
    const pending = deferred<AdminIpPreview>()
    const preview = vi
      .fn<PreviewFn>()
      .mockResolvedValueOnce(result())
      .mockReturnValueOnce(pending.promise)
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'delete', ruleNo: 1n })
    const flushing = c.flush()
    pending.resolve(result())
    expect((await flushing).state).toBe('ready')
  })

  it('refresh — 같은 질의를 다시 부른다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    c.refresh()
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('해제 뒤에는 부르지 않고 날아오던 응답도 버린다', async () => {
    const pending = deferred<AdminIpPreview>()
    const preview = vi.fn<PreviewFn>().mockReturnValueOnce(pending.promise)
    const c = setup(preview)
    c.setTarget({ op: 'create', form: ready })
    scope.stop()
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    pending.resolve(result())
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(1)
    expect(c.view.value.state).not.toBe('ready')
  })
})
