import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import type { SessionTableRow } from '../components/session/session-table.js'
import { useAdminUi } from '../context/admin-ui.js'
import { useServerTable, type ServerTable, type ServerTableOptions } from './useServerTable.js'
import { useWriteFlow, type ConfirmDialogBindings } from './useWriteFlow.js'

// 세션 목록 조회와 세 가지 끊기 동작 — `SessionTable` 에 `v-bind` 할 바인딩을 낸다.
//
// 정본: ssworks-gise-home apps/admin/src/pages/me.vue · components/AccountSessionsDialog.vue(흐름 · 문구표 · 응답 경합)
//       + hangang-home apps/admin/src/pages/org/users.vue "세션 종료"(자기 계정 1인칭 경고)
// 바꾼 점:
//  ① 화면마다 흩어진 상태를 composable 하나로. 확인 관문은 3a `useWriteFlow` 를 쓴다(D5 — 재인증 없음).
//  ② 목록이 전량(`list`)이면 직접, 서버 페이징(`fetch`)이면 `useServerTable` 을 감싼다(관리자 전체 목록).
//  ③ 동작은 어댑터에 준 것만 생긴다(3c 결정 ④-A1). 성공 문구는 `onRevoked` 로 화면에 맡긴다.
//  ④ gise 의 "403/404/409 만 재조회, 500 은 다이얼로그 유지" 를 버렸다 — 요청이 나갔으면 늘 재조회한다(D6).

export interface SessionDialogText {
  title: string
  message: string
  confirmLabel: string
}

export interface SessionMessages<R> {
  revoke: SessionDialogText
  revokeOthers: SessionDialogText
  revokeUser: (row: R) => SessionDialogText
  revokeUserSelf: (row: R) => SessionDialogText
}

export type SessionAction = 'revoke' | 'revokeOthers' | 'revokeUser'

export interface SessionRevokedEvent<R> {
  action: SessionAction
  row?: R
  /** 서버가 준 경우에만. 없으면 화면이 개수를 지어내지 않는다(hangang) */
  revokedCount?: number
}

interface SessionsCommonOptions<R extends SessionTableRow> {
  revoke?: (row: R) => Promise<void>
  revokeOthers?: () => Promise<{ revokedCount?: number } | void>
  revokeUser?: (row: R) => Promise<{ revokedCount?: number } | void>
  /** 게터 — 호출 시점마다 평가한다(axion 처럼 한 번만 읽으면 권한 변화를 못 따른다). 기본 `() => true` */
  canWrite?: () => boolean
  /** 사용자 전체 끊기의 "나 자신" 판정. 기본 `row.userId === useAdminUi().user()?.userId` */
  isSelf?: (row: R) => boolean
  onRevoked?: (event: SessionRevokedEvent<R>) => void | Promise<void>
  /** 내 계정 전체를 끊은 뒤 — 템플릿이 세션을 비우고 로그인으로 보낸다 */
  onSelfSignedOut?: () => void | Promise<void>
  messages?: Partial<SessionMessages<R>>
  /** 기본 true. 다이얼로그 안처럼 열 때 불러야 하면 false + `reload()` */
  immediate?: boolean
}

export type UseSessionsOptions<
  R extends SessionTableRow,
  F extends object = Record<string, never>,
> =
  | (SessionsCommonOptions<R> & { list: () => Promise<readonly R[]> })
  | (SessionsCommonOptions<R> & {
      fetch: ServerTableOptions<R, F>['fetch']
      filters?: ServerTableOptions<R, F>['filters']
      isFiltered?: ServerTableOptions<R, F>['isFiltered']
      urlSync?: ServerTableOptions<R, F>['urlSync']
      itemsPerPage?: number
    })

/** `<SessionTable v-bind="table" show-… />` */
export interface SessionTableBindings<R> {
  sessions: readonly R[]
  itemsLength?: number
  page?: number
  itemsPerPage?: number
  'onUpdate:page'?: (page: number) => void
  'onUpdate:itemsPerPage'?: (size: number) => void
  loading: boolean
  busy: boolean
  canRevoke: boolean
  canRevokeUser: boolean
  onRevoke: (row: R) => void
  onRevokeUser: (row: R) => void
}

export interface Sessions<R> {
  rows: Readonly<Ref<readonly R[]>>
  /** 전량 모드는 `rows.length` */
  total: Readonly<Ref<number>>
  loading: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<unknown>>
  reload: () => Promise<void>
  table: ComputedRef<SessionTableBindings<R>>
  canRevokeOthers: ComputedRef<boolean>
  /** 성공 true · 취소 · 실패 · 막힘 false */
  revokeOthers: () => Promise<boolean>
  submitting: Readonly<Ref<boolean>>
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  /** 서버 페이징 모드에서만 — 필터 · `isFiltered` · `flushUrl` 을 쓸 때 */
  serverTable: ServerTable<R> | null
}

const DEFAULT_MESSAGES: SessionMessages<SessionTableRow> = {
  revoke: {
    title: '세션 끝내기',
    message: '그 브라우저는 즉시 로그아웃되고, 다시 쓰려면 다시 로그인해야 합니다.',
    confirmLabel: '끝내기',
  },
  revokeOthers: {
    title: '다른 세션 모두 끝내기',
    message: '이 기기를 뺀 모든 세션이 즉시 로그아웃됩니다.',
    confirmLabel: '모두 끝내기',
  },
  revokeUser: (row) => ({
    title: '사용자 전체 끊기',
    message: `「${row.userName ?? ''}(${row.userId ?? ''})」의 모든 세션이 즉시 로그아웃됩니다. 그 사람은 다시 로그인해야 합니다.`,
    confirmLabel: '모두 끊기',
  }),
  revokeUserSelf: () => ({
    title: '사용자 전체 끊기',
    message:
      '이 계정은 지금 로그인한 당신 자신입니다. 확인하는 즉시 이 화면에서도 로그아웃되고, 다시 로그인해야 합니다.',
    confirmLabel: '모두 끊기',
  }),
}

/** 응답에 0 이상 정수 `revokedCount` 가 있을 때만 그 값 */
function countOf(result: unknown): number | undefined {
  if (result == null || typeof result !== 'object' || !('revokedCount' in result)) return undefined
  const count = (result as { revokedCount?: unknown }).revokedCount
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : undefined
}

/** setup 안에서 부른다. 확인 다이얼로그는 반환된 `confirmDialog` 를 `<ConfirmDialog v-bind>` 로 붙인다. */
export function useSessions<R extends SessionTableRow, F extends object = Record<string, never>>(
  options: UseSessionsOptions<R, F>,
): Sessions<R> {
  const flow = useWriteFlow()
  const canWrite = options.canWrite ?? (() => true)
  // 기본값을 쓸 때만 컨텍스트를 찾는다 — isSelf 를 주거나 사용자 전체 끊기가 없으면 플러그인 없이도 쓸 수 있다.
  const ui = options.revokeUser != null && options.isSelf == null ? useAdminUi() : null
  const isSelf =
    options.isSelf ??
    ((row: R) => {
      const userId = ui?.user()?.userId
      return userId != null && row.userId === userId
    })
  const messages = { ...DEFAULT_MESSAGES, ...options.messages } as SessionMessages<R>
  const immediate = options.immediate !== false

  // ── 목록 ──────────────────────────────────────────────────────────

  let serverTable: ServerTable<R> | null = null
  let rows: Readonly<Ref<readonly R[]>>
  let total: Readonly<Ref<number>>
  let loading: Readonly<Ref<boolean>>
  let loadError: Readonly<Ref<unknown>>
  let reload: () => Promise<void>

  if ('fetch' in options) {
    const table = useServerTable<R, F>({
      fetch: options.fetch,
      // 네 프로젝트 모두 마지막 활동 내림차순 고정 — 열 머리 정렬이 없다(D3).
      sort: false,
      filters: options.filters,
      isFiltered: options.isFiltered,
      urlSync: options.urlSync,
      itemsPerPage: options.itemsPerPage,
      immediate,
    })
    serverTable = table
    rows = table.items
    total = table.total
    loading = table.loading
    loadError = table.error
    reload = table.reload
  } else {
    const { list } = options
    const listRows = shallowRef<readonly R[]>([])
    const listLoading = ref(false)
    const listError = shallowRef<unknown>(null)
    /** 🔴 응답 경합 — 끊은 뒤 재조회와 첫 조회가 겹치면 먼저 보낸 느린 응답이 나중에 도착해 이긴다(gise · hangang). */
    let loadSeq = 0
    reload = async () => {
      const seq = ++loadSeq
      listLoading.value = true
      listError.value = null
      try {
        const items = await list()
        if (seq !== loadSeq) return
        listRows.value = items
      } catch (error) {
        if (seq !== loadSeq) return
        // 목록은 그대로 둔다 — 화면이 로딩 · 목록 · 실패 · 빈 목록을 가를 수 있게.
        listError.value = error
      } finally {
        if (seq === loadSeq) listLoading.value = false
      }
    }
    rows = listRows
    total = computed(() => listRows.value.length)
    loading = listLoading
    loadError = listError
    if (immediate) void reload()
  }

  const busy = computed(() => loading.value || flow.submitting.value)

  // ── 쓰기 ──────────────────────────────────────────────────────────

  /** 결과와 함께 요청이 실제로 나갔는지(관문 취소가 아닌지)를 돌려준다 — 재조회는 나갔을 때만 한다(D6). */
  async function write(
    text: SessionDialogText,
    action: () => Promise<unknown>,
  ): Promise<{ ok: boolean; attempted: boolean; result: unknown }> {
    let attempted = false
    let result: unknown
    const ok = await flow.run({
      gate: 'confirm',
      // 🔴 끊은 세션은 되살릴 수 없다 — 사용자는 다시 로그인해야 한다(D5).
      reversible: false,
      title: text.title,
      message: text.message,
      confirmLabel: text.confirmLabel,
      action: async () => {
        attempted = true
        result = await action()
      },
    })
    return { ok, attempted, result }
  }

  async function revokeRow(row: R): Promise<boolean> {
    const revoke = options.revoke
    // 🔴 현재 세션은 목록에서 끊지 않는다 — 표가 버튼을 안 그려도 바인딩을 직접 부르는 길까지 막는다(D4).
    if (revoke == null || row.isCurrent || !canWrite()) return false
    const { ok, attempted } = await write(messages.revoke, () => revoke(row))
    if (!attempted) return false
    await reload()
    if (ok) await options.onRevoked?.({ action: 'revoke', row })
    return ok
  }

  async function revokeUserRow(row: R): Promise<boolean> {
    const revokeUser = options.revokeUser
    if (revokeUser == null || !canWrite()) return false
    const self = isSelf(row)
    const text = self ? messages.revokeUserSelf(row) : messages.revokeUser(row)
    const { ok, attempted, result } = await write(text, () => revokeUser(row))
    if (!attempted) return false
    if (ok && self) {
      // 🔴 서버가 지금 세션까지 끊었다 — 재조회는 401 로 실패할 뿐이다. 화면이 세션을 비우고 로그인으로 보낸다.
      await options.onRevoked?.({ action: 'revokeUser', row, revokedCount: countOf(result) })
      await options.onSelfSignedOut?.()
      return true
    }
    await reload()
    if (ok) await options.onRevoked?.({ action: 'revokeUser', row, revokedCount: countOf(result) })
    return ok
  }

  const canRevokeOthers = computed(
    () =>
      options.revokeOthers != null &&
      // 내 세션은 전량 모드다 — 서버 페이징 목록에서 "다른 세션 모두" 는 뜻이 없다.
      serverTable == null &&
      canWrite() &&
      !busy.value &&
      rows.value.some((row) => !row.isCurrent),
  )

  async function revokeOthers(): Promise<boolean> {
    const fn = options.revokeOthers
    if (fn == null || !canRevokeOthers.value) return false
    const { ok, attempted, result } = await write(messages.revokeOthers, () => fn())
    if (!attempted) return false
    await reload()
    if (ok) await options.onRevoked?.({ action: 'revokeOthers', revokedCount: countOf(result) })
    return ok
  }

  const table = computed<SessionTableBindings<R>>(() => {
    const bindings: SessionTableBindings<R> = {
      sessions: rows.value,
      loading: loading.value,
      busy: busy.value,
      canRevoke: options.revoke != null && canWrite(),
      canRevokeUser: options.revokeUser != null && canWrite(),
      onRevoke: (row) => {
        void revokeRow(row)
      },
      onRevokeUser: (row) => {
        void revokeUserRow(row)
      },
    }
    const server = serverTable
    if (server != null) {
      bindings.itemsLength = server.total.value
      bindings.page = server.page.value
      bindings.itemsPerPage = server.itemsPerPage.value
      bindings['onUpdate:page'] = (page) => {
        server.page.value = page
      }
      bindings['onUpdate:itemsPerPage'] = (size) => {
        server.itemsPerPage.value = size
      }
    }
    return bindings
  })

  return {
    rows,
    total,
    loading,
    loadError,
    reload,
    table,
    canRevokeOthers,
    revokeOthers,
    submitting: flow.submitting,
    confirmDialog: flow.confirmDialog,
    serverTable,
  }
}
