import { computed, onMounted, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue'
import type { LocationQueryRaw } from 'vue-router'
import { DEFAULT_ITEMS_PER_PAGE } from '@ssworks/admin-shared'
import { ApiError, toApiError } from '../api/error.js'
import { ADMIN_LIST_MAX_PAGE_SIZE, type AdminTableSort } from '../components/table/data-table.js'
import {
  queryCodec,
  withDefault,
  type QuerySyncBinding,
  type RawQueryValue,
} from './query-codec.js'
import { stableQueryKey, useQuerySyncedFilter } from './useQuerySyncedFilter.js'

// 정본: hangang-home apps/admin/src/pages/org/users.vue (목록 상태 · seq 가드 · 정렬 보정 · isFiltered)
// 바꾼 점:
//  - 페이지 로컬 ref 묶음을 composable 하나로. 조회는 `fetch` 어댑터, 필터는 "적용된 값" 게터로 받는다.
//  - URL 동기화(gise `useRouteQuerySync`)를 `urlSync` 옵션으로 품는다 — 복원이 감시보다 먼저인 순서를
//    여기서 보장하고, 복원 중에는 1쪽 되돌리기를 건너뛴다(crm `onInbound` 가 생긴 이유).
//  - 오류 문구 해석은 하지 않는다 — 알림은 `createApiClient` 의 전역 `onError` 몫이다.

export interface ServerTableParams<TFilter> {
  page: number
  itemsPerPage: number
  sortBy: string[]
  sortOrder: ('asc' | 'desc')[]
  filter: TFilter
}

export interface ServerTableOptions<TRow, TFilter extends object> {
  /** `params` 는 admin-shared `createQuerySchema` 가 읽는 모양 그대로 — GET 파라미터로 그대로 보낸다. */
  fetch: (params: ServerTableParams<TFilter>) => Promise<{ items: TRow[]; total: number | bigint }>
  /** 🔴 필수 — 생략을 허용하면 정렬이 조용히 빠진다(crm). 정렬 없는 표는 `false`. */
  sort: { keys: readonly string[]; default: AdminTableSort } | false
  /** "적용된" 필터 값(평평한 객체). 바뀌면 1쪽으로 돌아가고 다시 조회한다. 기본 `() => ({})`. */
  filters?: () => TFilter
  /** 기본: `filters()` 에 `undefined`·`null`·`''`·빈 배열이 아닌 값이 하나라도 있으면 true. */
  isFiltered?: () => boolean
  /** 기본 20(`DEFAULT_ITEMS_PER_PAGE`). 1..100 으로 자른다. */
  itemsPerPage?: number
  /**
   * 켜면 쪽 · 크기 · 정렬은 표가 `page` · `size` · `sort` 로, 필터는 이것이 URL 과 맞춘다.
   * `bindQueryCodecs(...)` 결과나 손으로 쓴 `{ read, toQuery }`.
   */
  urlSync?: QuerySyncBinding
  /** 기본 true — onMounted 에서 첫 조회. */
  immediate?: boolean
}

export interface ServerTable<TRow> {
  page: Ref<number>
  itemsPerPage: Ref<number>
  sortBy: Ref<AdminTableSort[]>
  items: Ref<TRow[]>
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<ApiError | null>
  isFiltered: ComputedRef<boolean>
  reload: () => Promise<void>
  /** `urlSync` 가 없으면 즉시 resolve. */
  flushUrl: () => Promise<void>
}

/** 표가 URL 에 쓰는 키. 필터 키가 이것과 겹치면 안 된다. */
const TABLE_URL_KEYS = ['page', 'size', 'sort'] as const

function clampItemsPerPage(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 1) return fallback
  return Math.min(value, ADMIN_LIST_MAX_PAGE_SIZE)
}

function isEmptyFilterValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** 🔴 `JSON.stringify` 를 쓰지 않는다 — bigint 필터 값에서 던진다. 값을 문자열로 맞춘 비교 문자열. */
function filterKeyOf(filter: object): string {
  return stableQueryKey(filter as LocationQueryRaw)
}

/**
 * 서버 페이징 목록. setup 안에서 부르고, 반환값을 구조 분해해 `DataTableBody` 에 그대로 건다.
 *
 * 지키는 것(hangang 🔴 · crm 🔴):
 * 1. 요청 조건은 `computed` 하나, 감시도 하나 — 쪽 · 정렬 · 필터가 한 틱에 같이 바뀌어도 조회는 1번.
 * 2. 늦게 온 응답은 버린다(seq).
 * 3. 필터 · 쪽 크기가 바뀌면 같은 틱에 1쪽으로 — 단 URL 에서 복원할 때는 아니다.
 * 4. `urlSync` 의 초기 복원은 아래 감시들보다 먼저 한다.
 */
export function useServerTable<TRow, TFilter extends object = Record<string, never>>(
  options: ServerTableOptions<TRow, TFilter>,
): ServerTable<TRow> {
  const sort = options.sort
  const defaultItemsPerPage = clampItemsPerPage(
    options.itemsPerPage ?? DEFAULT_ITEMS_PER_PAGE,
    DEFAULT_ITEMS_PER_PAGE,
  )
  const filters = options.filters ?? (() => ({}) as TFilter)
  const defaultSort = (): AdminTableSort[] => (sort === false ? [] : [{ ...sort.default }])

  /** 🔴 키가 허용 목록 밖이거나 비었으면(같은 헤더 세 번째 클릭) 기본 정렬. 한 열만 본다(hangang). */
  function normalizeSort(value: readonly AdminTableSort[]): AdminTableSort[] {
    if (sort === false) return []
    const head = value[0]
    if (head && sort.keys.includes(head.key) && (head.order === 'asc' || head.order === 'desc')) {
      return [{ key: head.key, order: head.order }]
    }
    return defaultSort()
  }

  const page = ref(1)
  const itemsPerPage = ref(defaultItemsPerPage)
  const sortBy = ref<AdminTableSort[]>(defaultSort())
  const items = shallowRef<TRow[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = shallowRef<ApiError | null>(null)

  // ── URL 동기화 — 🔴 아래 감시들보다 먼저. 초기 복원이 감시에 관측되면 첫 요청이 2번 나간다.
  /** URL 에서 상태를 되채우는 중 — 이 동안의 필터·크기 변경은 1쪽 되돌리기를 하지 않는다. */
  let restoring = false
  let flushUrl: () => Promise<void> = () => Promise.resolve()
  const urlSync = options.urlSync
  if (urlSync) {
    const pageCodec = withDefault(queryCodec.int({ min: 1 }), 1)
    const sizeCodec = withDefault(
      queryCodec.int({ min: 1, max: ADMIN_LIST_MAX_PAGE_SIZE }),
      defaultItemsPerPage,
    )
    const decodeSort = (raw: RawQueryValue): AdminTableSort[] => {
      const value = Array.isArray(raw) ? raw[0] : raw
      const match = typeof value === 'string' ? /^(.+):(asc|desc)$/.exec(value) : null
      if (!match) return defaultSort()
      return normalizeSort([{ key: match[1] as string, order: match[2] as 'asc' | 'desc' }])
    }
    const encodeSort = (value: readonly AdminTableSort[]): string | undefined => {
      const head = normalizeSort(value)[0]
      const fallback = defaultSort()[0]
      if (!head) return undefined
      if (fallback && head.key === fallback.key && head.order === fallback.order) return undefined
      return `${head.key}:${head.order}`
    }

    flushUrl = useQuerySyncedFilter({
      read(query) {
        restoring = true
        try {
          page.value = pageCodec.decode(query.page)
          itemsPerPage.value = sizeCodec.decode(query.size)
          sortBy.value = decodeSort(query.sort)
          urlSync.read(query)
        } finally {
          restoring = false
        }
      },
      toQuery() {
        const filterQuery = urlSync.toQuery()
        const clash = TABLE_URL_KEYS.filter((key) => filterQuery[key] !== undefined)
        if (clash.length > 0) {
          // 🔴 던지지 않는다 — 라이브러리 빌드에서 `import.meta.env.DEV` 는 빌드 시점 상수라 소비 앱의
          //    개발 모드를 모른다. 배포에서 던지면 화면이 백지가 된다. 표 값이 이긴다.
          console.error(`[useServerTable] urlSync 의 필터 키가 표 키와 겹친다: ${clash.join(', ')}`)
        }
        return {
          ...filterQuery,
          page: pageCodec.encode(page.value),
          size: sizeCodec.encode(itemsPerPage.value),
          sort: encodeSort(sortBy.value),
        }
      },
    }).flushUrl
  }

  // ── 정렬 보정 — ref 자체를 되돌려 라벨 · 화살표 · 요청이 한 값을 본다(hangang).
  watch(
    sortBy,
    (value) => {
      const normalized = normalizeSort(value)
      const same =
        normalized.length === value.length &&
        normalized.every((s, i) => s.key === value[i]?.key && s.order === value[i]?.order)
      if (!same) sortBy.value = normalized
    },
    { flush: 'sync' },
  )

  // ── 쪽 크기 자르기 · 필터/쪽 크기 변경 → 1쪽. 🔴 같은 틱(sync)에 처리해야 조회가 1번이다.
  watch(
    itemsPerPage,
    (value) => {
      const clamped = clampItemsPerPage(value, defaultItemsPerPage)
      if (clamped !== value) itemsPerPage.value = clamped
    },
    { flush: 'sync' },
  )
  const filterKey = computed(() => filterKeyOf(filters()))
  watch(
    [filterKey, itemsPerPage],
    () => {
      // 🔴 URL 복원 중에는 되돌리지 않는다 — 복원한 쪽 번호가 같은 틱에 1로 덮인다.
      if (!restoring) page.value = 1
    },
    { flush: 'sync' },
  )

  const params = computed<ServerTableParams<TFilter>>(() => {
    const sorted = normalizeSort(sortBy.value)
    return {
      page: page.value,
      itemsPerPage: itemsPerPage.value,
      sortBy: sorted.map((s) => s.key),
      sortOrder: sorted.map((s) => s.order),
      filter: filters(),
    }
  })
  /** 🔴 객체가 아니라 문자열을 감시한다 — `computed` 는 매번 새 객체라 정렬 되돌리기만으로도 다시 조회한다. */
  const requestKey = computed(() => {
    const p = params.value
    return [
      p.page,
      p.itemsPerPage,
      p.sortBy.join(','),
      p.sortOrder.join(','),
      filterKeyOf(p.filter),
    ].join('|')
  })

  const isFiltered = computed(() =>
    options.isFiltered
      ? options.isFiltered()
      : Object.values(filters()).some((value) => !isEmptyFilterValue(value)),
  )

  let seq = 0
  async function load(): Promise<void> {
    const mine = ++seq
    loading.value = true
    error.value = null
    try {
      const result = await options.fetch(params.value)
      if (mine !== seq) return
      items.value = result.items
      // 🔴 `total` 이 bigint 일 수 있다. `DataTableBody.itemsLength` 는 number — 그대로 넘기면 타입은
      //    통과하는데 표가 조용히 틀린다(hangang).
      total.value = Number(result.total)
    } catch (caught) {
      if (mine !== seq) return
      if (!(caught instanceof ApiError)) {
        console.error('[useServerTable] fetch 가 ApiError 가 아닌 예외를 던졌다', caught)
      }
      items.value = []
      total.value = 0
      error.value = toApiError(caught)
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  watch(requestKey, () => {
    void load()
  })
  if (options.immediate !== false) {
    onMounted(() => {
      void load()
    })
  }

  return {
    page,
    itemsPerPage,
    sortBy,
    items,
    total,
    loading,
    error,
    isFiltered,
    reload: load,
    flushUrl: () => flushUrl(),
  }
}
