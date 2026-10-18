import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import { ApiError } from '../api/error.js'

// 서버 검색 자동완성의 공통 흐름 — 감사 행위자(3f) · IP 대상 사용자(3g)가 같은 규칙을 쓴다(3f 스펙 C8). 패키지 내부용.
//
// 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue `requestSeq`(늦은 응답 버림)
// 바꾼 점: 디바운스 · 빈 검색어 생략 · 같은 검색어 생략 · 실패를 처리됨으로(칸이 문구를 보인다 — C7) · 스코프 해제 정리.

export const REMOTE_SEARCH_DEBOUNCE_MS = 300

export interface RemoteSearch<T> {
  items: Readonly<Ref<readonly T[]>>
  searching: Readonly<Ref<boolean>>
  failed: Readonly<Ref<boolean>>
  /** 검색어가 바뀔 때 부른다(`VAutocomplete` 의 `update:search`) */
  search: (keyword: string) => void
}

export function useRemoteSearch<T>(
  fetch: (keyword: string) => Promise<readonly T[]>,
): RemoteSearch<T> {
  const items = shallowRef<readonly T[]>([])
  const searching = ref(false)
  const failed = ref(false)
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let lastKeyword: string | null = null

  async function run(keyword: string, mine: number): Promise<void> {
    try {
      const result = await fetch(keyword)
      if (mine !== seq || disposed) return
      items.value = result
    } catch (error) {
      // 🔴 칸이 문구를 보인다 — 전역 토스트로 두 번 알리지 않는다. catch 의 동기 구간에서 세운다(ApiError.handled).
      // 🔴 버린 요청의 실패도 처리됨으로 — 칸은 새 요청의 결과를 보이고, 버린 실패가 전역 토스트로 뜨면 지금 화면과 어긋난 알림이다.
      if (error instanceof ApiError) error.handled = true
      if (mine !== seq || disposed) return
      items.value = []
      failed.value = true
      // 같은 검색어를 다시 알리면 다시 부른다(재시도)
      lastKeyword = null
    } finally {
      if (mine === seq && !disposed) searching.value = false
    }
  }

  function search(keyword: string): void {
    const trimmed = keyword.trim()
    // VAutocomplete 는 포커스 · 선택 때 같은 검색어를 여러 번 알린다
    if (trimmed === lastKeyword) return
    lastKeyword = trimmed
    clearTimeout(timer)
    timer = undefined
    // 🔴 순번은 빈 검색어에서도 올린다 — 날아오던 응답이 비운 목록을 다시 채우지 못하게
    const mine = ++seq
    failed.value = false
    if (trimmed === '') {
      items.value = []
      searching.value = false
      return
    }
    searching.value = true
    timer = setTimeout(() => {
      timer = undefined
      if (!disposed) void run(trimmed, mine)
    }, REMOTE_SEARCH_DEBOUNCE_MS)
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      clearTimeout(timer)
    })
  }

  return { items, searching, failed, search }
}
