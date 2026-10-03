import { onUnmounted, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery, type LocationQueryRaw } from 'vue-router'
import type { QuerySyncBinding } from './query-codec.js'

// 정본: ssworks-gise-home apps/admin/src/composables/useRouteQuerySync.ts (콜백 모양 · 비교 문자열)
//       + kim5257-crm-v5 packages/frontend-core/src/composables/useQuerySyncedFilter.ts 의 🔴 규칙
// 바꾼 점:
//  - crm 의 코덱 선언형 인자를 `read`·`toQuery` 콜백으로 바꿨다. 코덱은 `bindQueryCodecs` 가 콜백을
//    만들어 준다(선택형 층).
//  - gise 의 `isRestoring` 은 뺐다 — 복원 중 1쪽 되돌리기를 막는 일은 `useServerTable` 이 내부에서 한다.
//  - crm 의 필터·정렬·extra 3분할과 필수 `sort` 옵션은 뺐다. 정렬은 `useServerTable` 몫이다.
//  - 쓰기에도 경로 가드를 걸었다 — 떠나는 중의 쓰기는 목적지에 간다.

export interface QuerySyncOptions extends QuerySyncBinding {
  /** 뒤로·앞으로 가기 등 외부 요인으로 복원된 직후 1회. 🔴 초기 복원에서는 부르지 않는다(crm: 소비처
   *  클로저가 setup 아래쪽 바인딩을 읽어 TDZ 로 죽는다). */
  onInbound?: () => void
  /** 상태 변경 → URL 쓰기 지연(ms). 기본 0. */
  debounceMs?: number
}

/**
 * 쿼리 비교용 안정 문자열 — 키 정렬, `undefined`·`null`·빈 배열 제외, 값은 문자열로, 키·값은
 * `encodeURIComponent`. 🔴 `JSON.stringify` 를 쓰지 않는다 — 키 순서와 타입 표기(`2` vs `"2"`)에 따라
 * 같은 쿼리가 다른 문자열이 되고, bigint 에서는 던진다.
 */
export function stableQueryKey(query: LocationQuery | LocationQueryRaw): string {
  return Object.entries(query)
    .map(([key, value]) => {
      const list = (Array.isArray(value) ? value : [value]).filter((item) => item != null)
      return [key, list.map((item) => String(item))] as const
    })
    .filter(([, values]) => values.length > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(
      ([key, values]) =>
        `${encodeURIComponent(key)}=${values.map((value) => encodeURIComponent(value)).join(',')}`,
    )
    .join('&')
}

/**
 * 목록 화면 상태 ↔ URL 쿼리. setup 안에서 부른다.
 *
 * 지키는 것(crm 🔴):
 * 1. 초기 복원은 감시 등록보다 앞 줄에서 한다 — 뒤집으면 화면은 같은데 첫 요청만 2배가 된다.
 * 2. URL 쓰기는 멱등하다 — 조립 결과가 지금 주소와 같으면 쓰지 않는다. 쓰기 ↔ 감시 루프를 끊는다.
 * 3. 자기 화면 경로의 쿼리만 본다.
 */
export function useQuerySyncedFilter(options: QuerySyncOptions): {
  flushUrl: () => Promise<void>
} {
  const route = useRoute()
  const router = useRouter()

  /**
   * 마운트된 경로. vue-router 는 finalizeNavigation 에서 currentRoute 를 먼저 갱신하고 언마운트는 그
   * 결과다 — 다른 경로로 가면 **떠나는 화면의 감시가 목적지 쿼리로 먼저 깨어난다.** 그때 자기 상태를
   * 기본값으로 엎지 않도록 경로가 다르면 무시한다.
   *
   * ⚠️ 알려진 한계(crm 그대로, 의도된 것): setup 에서 한 번 잡고 다시 갱신하지 않는다. 동적 세그먼트만
   * 바뀌는 상세 라우트(`/users/:id`)는 컴포넌트를 재사용하므로 `route.path !== ownPath` 가 영구 참이 되어
   * 인바운드 감시가 조용히 꺼진다. 그런 라우트에서는 쓰지 않는다.
   */
  const ownPath = route.path
  const debounceMs = options.debounceMs ?? 0

  // ── 1. 초기 복원 — 감시 등록 전(setup 동기). onInbound 는 부르지 않는다.
  options.read(route.query)

  /**
   * 이 composable 이 마지막으로 쓴 쿼리의 안정 문자열. 인바운드 감시가 자기 쓰기를 무시하는 데 쓴다.
   * ⚠️ 슬롯이 **하나**라는 것은 "동시에 떠 있는 내 쓰기는 최대 1건" 이라는 전제다. 지금은 성립한다 —
   * 내비게이션이 매크로태스크 경계를 넘지 않는다. 전역 라우터 가드에 진짜 비동기 대기(권한 재조회 등)가
   * 생기면 두 쓰기가 겹쳐 첫 완료가 외부 변경으로 오인된다. 가드를 비동기로 바꿀 때 이 지점을 함께 본다.
   */
  let lastWritten = stableQueryKey(route.query)
  let timer: ReturnType<typeof setTimeout> | undefined
  /** 진행 중인 확정 쓰기(flushUrl). 살아 있는 동안 감시발 쓰기를 건너뛴다. */
  let inFlight: Promise<void> | null = null

  function writeUrl(): Promise<void> {
    if (route.path !== ownPath) return Promise.resolve()
    const next = options.toQuery()
    const key = stableQueryKey(next)
    if (key === stableQueryKey(route.query)) return Promise.resolve() // 같은 주소 — 쓰지 않는다
    lastWritten = key
    // 취소 · 중복 · 리다이렉트는 reject 가 아니라 실패 "값" 으로 resolve 된다(vue-router 4). 가드 예외만
    // reject 이므로 그것만 삼킨다.
    return router.replace({ query: next }).then(
      () => {},
      () => {},
    )
  }

  function syncUrl(): void {
    // 🔴 flushUrl 이 확정 쓰기 중이면 건너뛴다 — vue-router 의 pendingLocation 슬롯(1개)을 다투면 앞
    //    쓰기가 취소되고, 이어지는 push 가 뒤 쓰기까지 취소한다.
    if (inFlight) return
    void writeUrl()
  }

  async function flushUrl(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    const pending = writeUrl()
    inFlight = pending
    try {
      await pending
    } finally {
      inFlight = null
    }
  }

  // ── 2. 화면 → URL
  watch(
    () => stableQueryKey(options.toQuery()),
    () => {
      if (debounceMs <= 0) {
        syncUrl()
        return
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        syncUrl()
      }, debounceMs)
    },
  )

  // 🔴 언마운트 때 대기 중인 쓰기를 확정하지 **않는다.** 그 시점의 replace 는 이미 목적지 경로에 쓴다
  //    (crm 이 시도했다가 되돌렸다). 타이머만 정리한다.
  onUnmounted(() => clearTimeout(timer))

  // ── 3. URL → 화면(뒤로·앞으로 가기, 같은 화면으로의 링크)
  watch(
    () => route.query,
    (query) => {
      if (route.path !== ownPath) return
      const key = stableQueryKey(query)
      if (key === lastWritten) return
      lastWritten = key
      options.read(query)
      options.onInbound?.()
    },
  )

  return { flushUrl }
}
