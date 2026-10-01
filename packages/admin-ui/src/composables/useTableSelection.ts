// 정본: kim5257-crm-v5 packages/frontend-core/src/composables/useTableSelection.ts
// 바꾼 점: 없음(crm 전용 import 없음 — vue 만 쓴다). 포맷만 이 저장소 prettier 규약으로 맞췄다.
import { readonly, shallowRef, triggerRef } from 'vue'

/**
 * 대량 데이터 테이블의 선택 상태를 Set + shallowRef + 반전 선택 패턴으로 관리.
 * Vuetify v-data-table-server의 내장 선택(reactive Array) 대비 O(1) 조회/토글 성능 제공.
 */
export function useTableSelection<K extends bigint | string | number>() {
  // include: keys가 선택된 ID, exclude: keys가 해제된 ID (반전 선택)
  const mode = shallowRef<'include' | 'exclude'>('include')
  const keys = shallowRef<Set<K>>(new Set())

  /** 특정 키가 선택 상태인지 확인 — O(1) */
  function isSelected(key: K): boolean {
    return mode.value === 'include' ? keys.value.has(key) : !keys.value.has(key)
  }

  /** 특정 키의 선택 상태를 토글 — O(1) */
  function toggle(key: K): void {
    const set = keys.value
    if (set.has(key)) {
      set.delete(key)
    } else {
      set.add(key)
    }
    triggerRef(keys)
  }

  /** 전체 선택 — O(1) */
  function selectAll(): void {
    mode.value = 'exclude'
    keys.value = new Set()
  }

  /** 전체 해제 — O(1) */
  function deselectAll(): void {
    mode.value = 'include'
    keys.value = new Set()
  }

  /** 현재 페이지 기준 전체 토글 — O(pageSize) */
  function toggleAll(currentPageKeys: K[]): void {
    const allSelected = currentPageKeys.length > 0 && currentPageKeys.every((k) => isSelected(k))

    if (allSelected) {
      deselectAll()
    } else {
      selectAll()
    }
  }

  /** 선택된 항목 수 계산 — O(1) */
  function selectedCount(total: number): number {
    return mode.value === 'include' ? keys.value.size : total - keys.value.size
  }

  /** 헤더 체크박스 상태 계산 — O(pageSize) */
  function headerState(currentPageKeys: K[]): {
    checked: boolean
    indeterminate: boolean
  } {
    if (currentPageKeys.length === 0) {
      return { checked: false, indeterminate: false }
    }

    let selectedInPage = 0
    for (const key of currentPageKeys) {
      if (isSelected(key)) {
        selectedInPage++
      }
    }

    const allSelected = selectedInPage === currentPageKeys.length
    const noneSelected = selectedInPage === 0

    return {
      checked: allSelected,
      indeterminate: !allSelected && !noneSelected,
    }
  }

  /**
   * 유효 키 집합으로 선택을 정리 — 목록(roots) 변경 시 사라진 항목의 잔여 선택 제거.
   * include 모드만 정리(exclude는 '전체 선택' 의미라 유지). O(keys).
   */
  function retain(validKeys: K[]): void {
    if (mode.value === 'exclude') {
      return
    }
    const valid = new Set(validKeys)
    let changed = false
    for (const k of keys.value) {
      if (!valid.has(k)) {
        keys.value.delete(k)
        changed = true
      }
    }
    if (changed) {
      triggerRef(keys)
    }
  }

  return {
    mode: readonly(mode),
    keys: readonly(keys),
    isSelected,
    toggle,
    selectAll,
    deselectAll,
    toggleAll,
    selectedCount,
    headerState,
    retain,
  }
}
