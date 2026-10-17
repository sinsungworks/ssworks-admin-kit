import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { coreAuditCatalog, type AdminAuditLog, type AuditCatalog } from '@ssworks/admin-shared'
import {
  DEFAULT_AUDIT_LOG_MESSAGES,
  actorOptionTitle,
  actorText,
  auditFilterProblem,
  buildActionOptions,
  decodeAuditLogQuery,
  emptyAuditLogDraft,
  encodeAuditLogQuery,
  isEmptyAuditLogDraft,
  mergeActionGroups,
  normalizeAuditLogDraft,
  sameAuditLogDraft,
  targetOptions,
  toAuditFilter,
  type AuditActionGroup,
  type AuditActorOption,
  type AuditFilterItem,
  type AuditLogDraft,
  type AuditLogFilter,
  type AuditLogMessages,
} from '../components/audit/audit-log.js'
import type { QuerySyncBinding } from './query-codec.js'
import { useRemoteSearch } from './useRemoteSearch.js'
import { useServerTable, type ServerTable, type ServerTableParams } from './useServerTable.js'

// 감사 로그 조회의 흐름 — 입력값 · 적용값 · 서버 페이징 · 행위자 검색 · 펼침. `AuditLogViewer` 에 `v-bind` 할 바인딩을 낸다.
//
// 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue(입력/적용 분리 · 같은 조건 재적용 · 검증 실패면 조회 안 함 ·
//       권한 없으면 계정 목록 안 부름 · 펼침 키) + ssworks-gise-home apps/admin/src/composables/useRouteQuerySync.ts(URL)
// 바꾼 점:
//  ① 페이지에 흩어진 상태를 composable 하나로. 목록은 3a `useServerTable` 을 감싼다.
//  ② 행위자 고르기를 계정 100명 목록(hangang)에서 서버 검색(`searchActors`)으로(3f 결정 ② A1).
//  ③ 조회 오류 문구는 해석하지 않는다 — 전역 토스트와 화면 안 알림(C7).

export interface UseAuditLogsOptions<R extends AdminAuditLog = AdminAuditLog> {
  /** 템플릿: (params) => api.get<Paginated<AdminAuditLog>>('/audit-logs', { params }) */
  fetch: (
    params: ServerTableParams<AuditLogFilter>,
  ) => Promise<{ items: R[]; total: number | bigint }>
  /** 기본 coreAuditCatalog. 프로젝트 액션 라벨은 이 카탈로그에서 온다 */
  catalog?: AuditCatalog
  /** 코어 묶음에 더한다. prefix 가 같으면 라벨을 덮어쓴다(A5) */
  actionGroups?: readonly AuditActionGroup[]
  /** 바뀐 항목 이름. 없으면 키 원문 */
  fieldLabels?: Readonly<Record<string, string>>
  searchActors?: (keyword: string) => Promise<readonly AuditActorOption[]>
  /** 게터 — 부를 때마다 평가한다. 기본 () => true */
  canSearchActors?: () => boolean
  /** 기본 false. true 면 actor · action · targetType · targetRefNo · from · to 를 URL 과 맞춘다(A6). vue-router 가 있어야 한다 */
  urlSync?: boolean
  itemsPerPage?: number
  messages?: Partial<AuditLogMessages>
  /** 기본 true */
  immediate?: boolean
}

/** `<AuditLogViewer v-bind="audit.viewer.value" />` — props 와 리스너 이름은 컴포넌트 그대로 */
export interface AuditLogViewerBindings<R> {
  draft: AuditLogDraft
  'onUpdate:draft': (draft: AuditLogDraft) => void
  actorMode: 'search' | 'number'
  actorHint: string | null
  actorItems: readonly AuditFilterItem[]
  actorSearching: boolean
  actorSearchFailed: boolean
  onSearchActors: (keyword: string) => void
  actionItems: readonly AuditFilterItem[]
  targetItems: readonly AuditFilterItem[]
  filterError: string | null
  onApply: () => void
  onReset: () => void
  rows: readonly R[]
  itemsLength: number
  page: number
  itemsPerPage: number
  'onUpdate:page': (page: number) => void
  'onUpdate:itemsPerPage': (size: number) => void
  loading: boolean
  loadFailed: boolean
  onRetry: () => void
  filtered: boolean
  expanded: readonly string[]
  'onUpdate:expanded': (keys: readonly string[]) => void
  onFilterByActor: (row: R) => void
  catalog: AuditCatalog
  fieldLabels: Readonly<Record<string, string>>
  messages: AuditLogMessages
}

export interface AuditLogs<R> {
  /** 입력값 — 칸이 고친다 */
  draft: Readonly<Ref<AuditLogDraft>>
  /** 적용값 — 표 · URL 이 이것만 본다 */
  applied: Readonly<Ref<AuditLogDraft>>
  filterError: Readonly<Ref<string | null>>
  /** 검증 실패면 false(적용 안 함 · filterError) */
  apply: () => boolean
  reset: () => void
  filterByActor: (row: R) => void
  reload: () => Promise<void>
  table: ServerTable<R>
  viewer: ComputedRef<AuditLogViewerBindings<R>>
}

/** setup 안에서 부른다. */
export function useAuditLogs<R extends AdminAuditLog = AdminAuditLog>(
  options: UseAuditLogsOptions<R>,
): AuditLogs<R> {
  const catalog = options.catalog ?? coreAuditCatalog
  const messages: AuditLogMessages = { ...DEFAULT_AUDIT_LOG_MESSAGES, ...options.messages }
  const fieldLabels = options.fieldLabels ?? {}
  const actionItems = buildActionOptions(catalog, mergeActionGroups(options.actionGroups), messages)
  const targetItems = targetOptions(catalog)

  const draft = ref<AuditLogDraft>(emptyAuditLogDraft())
  const applied = ref<AuditLogDraft>(emptyAuditLogDraft())
  const filterError = ref<string | null>(null)
  const expanded = shallowRef<readonly string[]>([])

  // 🔴 `useServerTable` 보다 먼저 만든다 — 그 안에서 초기 복원(`read`)을 동기로 부르고, 그 뒤에 감시를 단다.
  const urlSync: QuerySyncBinding | undefined =
    options.urlSync === true
      ? {
          read(query) {
            const next = decodeAuditLogQuery(query)
            // 복원은 적용값과 입력값 둘 다에 넣는다(A6) — 보이는 칸과 표가 어긋나지 않게
            applied.value = next
            draft.value = { ...next }
            filterError.value = null
            expanded.value = []
          },
          toQuery: () => encodeAuditLogQuery(applied.value),
        }
      : undefined

  const table = useServerTable<R, AuditLogFilter>({
    fetch: options.fetch,
    // 🔴 서버 기본값에 기대지 않고 늘 싣는다(A11). 표 머리 정렬은 표가 막는다.
    sort: { keys: ['createAt'], default: { key: 'createAt', order: 'desc' } },
    filters: () => toAuditFilter(applied.value),
    itemsPerPage: options.itemsPerPage,
    urlSync,
    immediate: options.immediate,
  })

  function commit(next: AuditLogDraft): void {
    const same = sameAuditLogDraft(next, applied.value)
    applied.value = { ...next }
    draft.value = { ...next }
    filterError.value = null
    expanded.value = []
    // 🔴 같은 조건이면 필터 키가 그대로라 `useServerTable` 이 다시 부르지 않는다(A2 · hangang 223). 지금 쪽을 다시 부른다.
    if (same) void table.reload()
  }

  function apply(): boolean {
    const next = normalizeAuditLogDraft(draft.value)
    const problem = auditFilterProblem(next, messages)
    if (problem != null) {
      // 🔴 조회하지 않는다 — 번호 칸의 틀린 값이 400 이 되고 입력값은 그대로 둔다(hangang 185)
      filterError.value = problem
      return false
    }
    commit(next)
    return true
  }

  function reset(): void {
    commit(emptyAuditLogDraft())
  }

  // ── 행위자 ──────────────────────────────────────────────────────────

  const search = options.searchActors != null ? useRemoteSearch(options.searchActors) : null
  /** 🔴 권한 게터가 거짓이면 어댑터를 부르지 않는다 — 403 이 나지 않게(C9 · hangang 101) */
  const canSearch = (): boolean => search != null && (options.canSearchActors?.() ?? true)
  /** 번호 → 이름표. 검색 결과 · "이 사람 기록만" 행에서 모은다(A9) */
  const knownActors = new Map<string, string>()

  function actorTitleOf(value: string): string {
    const known = knownActors.get(value)
    if (known != null) return known
    const row = table.items.value.find(
      (item) => item.actorUserNo != null && String(item.actorUserNo) === value,
    )
    if (row != null && (row.actorUserName != null || row.actorUserId != null)) {
      return actorText(row, messages)
    }
    // 번호로 이름을 찾으려고 부르지 않는다
    return `#${value}`
  }

  const actorItems = computed<AuditFilterItem[]>(() => {
    const items = (search?.items.value ?? []).map((option) => {
      const item = { value: String(option.userNo), title: actorOptionTitle(option, messages) }
      knownActors.set(item.value, item.title)
      return item
    })
    const current = draft.value.actorUserNo
    // 고른 값이 지금 검색 결과에 없어도 칸이 이름을 보이게 한다(A9)
    if (current !== '' && !items.some((item) => item.value === current)) {
      items.unshift({ value: current, title: actorTitleOf(current) })
    }
    return items
  })

  function filterByActor(row: R): void {
    if (row.actorUserNo == null) return
    const value = String(row.actorUserNo)
    knownActors.set(value, actorText(row, messages))
    // 적용값의 행위자만 바꾼다 — 입력 중이던 다른 칸은 적용값으로 돌아간다(A10)
    commit({ ...applied.value, actorUserNo: value })
  }

  // ── 바인딩 ──────────────────────────────────────────────────────────

  const viewer = computed<AuditLogViewerBindings<R>>(() => ({
    draft: draft.value,
    'onUpdate:draft': (next) => {
      draft.value = { ...next }
    },
    actorMode: canSearch() ? 'search' : 'number',
    actorHint: search != null && !canSearch() ? messages.actorNoPermissionHint : null,
    actorItems: actorItems.value,
    actorSearching: search?.searching.value ?? false,
    actorSearchFailed: search?.failed.value ?? false,
    onSearchActors: (keyword) => {
      if (canSearch()) search?.search(keyword)
    },
    actionItems,
    targetItems,
    filterError: filterError.value,
    onApply: () => {
      apply()
    },
    onReset: reset,
    rows: table.items.value,
    itemsLength: table.total.value,
    page: table.page.value,
    itemsPerPage: table.itemsPerPage.value,
    'onUpdate:page': (page) => {
      table.page.value = page
    },
    'onUpdate:itemsPerPage': (size) => {
      table.itemsPerPage.value = size
    },
    loading: table.loading.value,
    loadFailed: table.error.value != null,
    onRetry: () => {
      void table.reload()
    },
    filtered: !isEmptyAuditLogDraft(applied.value),
    expanded: expanded.value,
    'onUpdate:expanded': (keys) => {
      expanded.value = [...keys]
    },
    onFilterByActor: filterByActor,
    catalog,
    fieldLabels,
    messages,
  }))

  return {
    draft,
    applied,
    filterError,
    apply,
    reset,
    filterByActor,
    reload: table.reload,
    table,
    viewer,
  }
}
