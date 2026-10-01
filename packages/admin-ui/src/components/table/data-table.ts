// 정본: hangang-home apps/admin/src/components/common/data-table-panel.ts
//
// SFC 밖에 두는 이유: `<script setup>` 안의 선언은 import 할 수 없어 타입을 못 꺼내고 테스트가
// 원리적으로 불가능하다. 목록 화면들이 아래 두 타입을 그대로 쓴다.
//
// ⚠️ Vuetify 의 `DataTableHeader`·`SortItem` 을 직접 수입하지 않는다. 둘은 `vuetify/lib/...`
//    내부 경로에만 있어 올릴 때 조용히 깨진다 — 아래 두 타입은 그 둘에 **구조적으로 대입 가능한**
//    좁은 부분집합이다.

export interface AdminTableHeader {
  title: string
  key: string
  sortable?: boolean
  align?: 'start' | 'center' | 'end'
  width?: number | string
  nowrap?: boolean
}

export interface AdminTableSort {
  key: string
  order: 'asc' | 'desc'
}

/**
 * 🔴 **목록마다 기본 정렬을 하나 정하고 그것을 화면에 표시한다.** 열 머리의 화살표는 정렬한 뒤에만
 *    보이므로 첫 화면에서는 아무 신호도 없다 — 그 공백을 이 문자열이 메운다.
 *
 * 🔴 **헤더에 없는 `key` 로 정렬 중이면 `key` 를 그대로 보여 준다.** 빈 문자열로 떨어뜨리면
 *    「정렬: 」이 되어 정렬이 없는 것처럼 보이는데 실제로는 걸려 있다.
 */
export function formatSortLabel(
  headers: readonly AdminTableHeader[],
  sortBy: readonly AdminTableSort[],
  labels: { none?: string; prefix?: string; asc?: string; desc?: string } = {},
): string {
  const { none = '정렬 없음', prefix = '정렬', asc = '오름차순', desc = '내림차순' } = labels
  const first = sortBy[0]
  if (first == null) return none
  const title = headers.find((header) => header.key === first.key)?.title ?? first.key
  return `${prefix}: ${title} ${first.order === 'desc' ? desc : asc}`
}

/**
 * 서버가 받는 한 쪽의 최대 개수 — `@ssworks/admin-shared` 의 `DEFAULT_MAX_ITEMS_PER_PAGE` 와
 * 같은 값이다. 서버 상한을 올리는 프로젝트는 `itemsPerPageOptions` prop 으로 선택지를 함께 올린다.
 */
export const ADMIN_LIST_MAX_PAGE_SIZE = 100

/**
 * 쪽당 개수 선택지 — 🔴 **Vuetify 기본값을 물려받으면 안 된다.**
 *
 * Vuetify 의 `VDataTableFooter` 기본값 끝에 `{ value: -1, title: '전체' }` 가 있다. 그것을 고르면
 * `itemsPerPage` 가 -1 이 되고 서버 스키마(`.min(1).max(100)`)가 400 을 낸다 — 관리자가 친 적도
 * 없는 입력에 대해 「입력값을 확인하세요」가 뜬다. 클릭 두 번이면 닿는다. 그래서 이 목록에는 -1 이
 * 없고 상한을 안 넘는다. Vuetify 기본의 25 대신 20 을 쓴다 — 화면들의 기본 쪽당 개수가 20 이다.
 */
export const DEFAULT_ITEMS_PER_PAGE_OPTIONS: readonly number[] = [10, 20, 50, 100]
