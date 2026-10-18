import { computed, getCurrentScope, onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import type { AdminIpPreview, AdminIpPreviewQuery } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import {
  previewQueryKey,
  previewQueryOf,
  type IpPreviewState,
  type IpPreviewTarget,
  type IpPreviewView,
} from '../components/ip-access/ip-access.js'

// IP 변경 영향 미리보기의 상태 기계 — 질의 · 디바운스 · 순번 · flush(3g 스펙 I9–I12). 패키지 내부용.
//
// 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue `previewQuery` · `loadPreview` · `previewSeq`
// 바꾼 점:
//  - 페이지 안 상태를 composable 하나로 떼어 따로 잰다.
//  - 편집 질의에 300ms 디바운스(hangang 은 없었다) — 현행 · 삭제는 바로.
//  - 400 을 "입력 중"이 아니라 failed 로 — 킷은 화면 · 서버가 같은 CIDR 파서라 400 은 계약 어긋남이다(I11).
//  - 🔴 `flush()` — 관문을 열기 전에 미리보기를 끝낸다(I12). hangang 은 창을 먼저 열고 그 안 문구가 바뀌었다.

export const IP_PREVIEW_DEBOUNCE_MS = 300

export interface IpPreviewOptions {
  preview: (query: AdminIpPreviewQuery) => Promise<AdminIpPreview>
  /** 게터 — 거짓이면 질의와 상관없이 forbidden 이고 부르지 않는다(I10) */
  canManage: () => boolean
  /** 404 — 대상 규칙이 이미 지워졌다. 목록을 다시 부르는 자리 */
  onStale?: () => void
  /** 기본 true — 만들 때 현행을 부른다 */
  immediate?: boolean
}

export interface IpPreviewController {
  view: Readonly<Ref<IpPreviewView>>
  target: Readonly<Ref<IpPreviewTarget>>
  setTarget: (target: IpPreviewTarget) => void
  /** 디바운스 중이면 바로 부르고, 진행 중이면 그 응답을 기다려 그때의 view 를 돌려준다 */
  flush: () => Promise<IpPreviewView>
  /** 같은 질의를 다시 부른다(목록을 다시 부른 뒤) */
  refresh: () => void
}

export function useIpPreview(options: IpPreviewOptions): IpPreviewController {
  const target = shallowRef<IpPreviewTarget>({ op: null })
  const view = shallowRef<IpPreviewView>({
    state: 'loading',
    op: null,
    result: null,
    clientIp: null,
  })
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { query: AdminIpPreviewQuery; mine: number } | null = null
  let current: Promise<void> | null = null
  let disposed = false

  /** 🔴 clientIp 는 한 번 받으면 뒤의 실패로 지우지 않는다(I2) */
  function show(
    state: IpPreviewState,
    result: AdminIpPreview | null,
    clientIp = view.value.clientIp,
  ): void {
    view.value = { state, op: target.value.op, result, clientIp }
  }

  async function run(query: AdminIpPreviewQuery, mine: number): Promise<void> {
    try {
      const result = await options.preview(query)
      if (mine !== seq || disposed) return
      show('ready', result, result.clientIp)
    } catch (error) {
      if (mine !== seq || disposed) return
      // 🔴 카드가 문구로 보인다 — 전역 토스트로 두 번 알리지 않는다(C7). catch 의 동기 구간에서 세운다.
      if (error instanceof ApiError) error.handled = true
      const status = error instanceof ApiError ? error.status : undefined
      if (status === 403) {
        show('forbidden', null)
      } else if (status === 404) {
        show('stale', null)
        options.onStale?.()
      } else {
        show('failed', null)
      }
    }
  }

  function start(query: AdminIpPreviewQuery, mine: number): Promise<void> {
    const promise: Promise<void> = run(query, mine).finally(() => {
      if (current === promise) current = null
    })
    current = promise
    return promise
  }

  function schedule(): void {
    clearTimeout(timer)
    timer = undefined
    pending = null
    // 🔴 어느 갈래든 순번을 올린다 — 날아오던 응답이 새 상태를 덮지 못하게(I11)
    const mine = ++seq
    if (!options.canManage()) {
      show('forbidden', null)
      return
    }
    const query = previewQueryOf(target.value)
    if (query === null) {
      show('pending-input', null)
      return
    }
    // 🔴 이전 결과를 남기지 않는다 — 입력과 어긋난 영향이 보이면 그것을 믿고 저장한다(I11)
    show('loading', null)
    const op = target.value.op
    if (op === 'create' || op === 'update') {
      pending = { query, mine }
      timer = setTimeout(() => {
        timer = undefined
        const next = pending
        pending = null
        if (next !== null && !disposed) void start(next.query, next.mine)
      }, IP_PREVIEW_DEBOUNCE_MS)
    } else {
      void start(query, mine)
    }
  }

  const key = computed(() =>
    options.canManage() ? previewQueryKey(previewQueryOf(target.value)) : 'forbidden',
  )
  // 🔴 질의 문자열 하나만 본다(I10). sync 라야 setTarget 바로 뒤의 flush 가 새 질의를 본다.
  watch(key, schedule, { flush: 'sync' })

  if (options.immediate !== false) schedule()

  async function flush(): Promise<IpPreviewView> {
    if (pending !== null) {
      clearTimeout(timer)
      timer = undefined
      const next = pending
      pending = null
      await start(next.query, next.mine)
    } else if (current !== null) {
      await current
    }
    return view.value
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      clearTimeout(timer)
    })
  }

  return {
    view,
    target,
    setTarget: (next) => {
      target.value = next
    },
    flush,
    refresh: schedule,
  }
}
