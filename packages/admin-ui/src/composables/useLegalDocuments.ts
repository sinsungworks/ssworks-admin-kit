import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  type ComputedRef,
  type Ref,
} from 'vue'
import {
  LEGAL_BODY_MAX_LENGTH,
  type AdminLegalDocument,
  type AdminLegalHistoryItem,
  type AdminLegalPublish,
} from '@ssworks/admin-shared'
import {
  DEFAULT_LEGAL_MESSAGES,
  type LegalKindOption,
  type LegalMessages,
  type LegalPublishBlock,
} from '../components/legal/legal-document.js'
import { useWriteFlow, type ConfirmDialogBindings } from './useWriteFlow.js'

// 약관 화면의 흐름 — 종류 전환(초안 확인) · 현재본 · 이력 · 원문 조회 · 발행(확인 → 저장 → 충돌).
//
// 정본: ssworks-gise-home apps/admin/src/pages/settings/legal.vue(흐름)
//       + ssworks-axion-admin packages/frontend/src/pages/settings/legal.vue(종류가 바뀐 뒤 늦은 응답 버림)
// 바꾼 점:
//  - 페이지에 흩어진 상태를 composable 하나로, API 직접 호출을 어댑터 넷으로(3e ① L1). 화면은 `editor` 바인딩 한 벌이다.
//  - 미발행 판정을 404(`hasCode(error, NOT_FOUND)`) 대신 어댑터의 `null` 로 한다(D15).
//  - 동시 발행 보호 — 발행 본문에 `baseLegalDocNo` 를 싣는다. 409 revision 충돌이면 초안을 지키고 기준만 새 판으로
//    바꾼다(3e ⑤ V2 · D12).
//  - 현재본 응답이 왔을 때 초안이 더러우면 지킨다(D9) — 정본은 늘 덮었다.
//  - 발행이 막힌 이유를 순서대로 낸다(`publishBlock`, D16) — 정본은 버튼만 꺼져 운영자가 이유를 몰랐다.
//
// 🔴 `kind` 를 바꾸는 자리는 `switchKind` 하나이고 초안부터 비운다(D7). 재조회가 실패해도 앞 종류의 본문이 새 탭에
//    남지 않는다 — "이용약관 탭에 개인정보 본문" 상태에서 발행하면 append-only 라 되돌릴 수 없다(gise).
// 🔴 `isDirty = draft !== baseBody`(D8). 이 기준이 없으면 탭마다 확인을 띄우거나(훈련된 무시) 아예 안 띄운다(유실).
// 🔴 확인 순간에 같은 판정을 다시 본다(D10) — 대화상자가 열린 사이 권한 회수 · 재조회 · 종류 전환이 있었을 수 있다.
//    gise 는 두 곳에 같은 조건을 글자 그대로 두었다. 여기는 `publishable()` 한 함수를 두 번 부른다.
// 🔴 발행 성공 즉시 `baseBody = 보낸 본문`, 그다음 재조회(D11). 번호 · 해시 · 발행일은 낙관적으로 채우지 않는다.
// 🔴 초안은 받은 그대로 보관한다(D3) — 고쳐서 돌려주면 한글 조합 중에 편집기 문서가 치환된다.
// 🔴 읽기 실패는 처리됨으로 표시하지 않는다(D13) — 화면 안 경고와 전역 토스트가 둘 다 뜬다(3d useTeamTree 와 같음).

export interface LegalDoneEvent<K extends string = string> {
  action: 'published'
  kind: K
  message: string
}

export interface UseLegalDocumentsOptions<
  K extends string,
  R extends AdminLegalHistoryItem = AdminLegalHistoryItem,
> {
  /** 탭 순서. 비어 있으면 만들 때 Error */
  kinds: readonly LegalKindOption<K>[]
  /** 기본 kinds[0]. 목록에 없으면 console.warn 후 kinds[0] */
  initialKind?: K
  /** null = 미발행(D15) */
  loadCurrent: (kind: K) => Promise<AdminLegalDocument | null>
  /** 최신순 전량 */
  loadHistory: (kind: K) => Promise<readonly R[]>
  loadOne: (legalDocNo: bigint) => Promise<AdminLegalDocument>
  /** 없으면 읽기 전용 */
  publish?: (body: AdminLegalPublish) => Promise<unknown>
  /** 기본 () => true. 요청 · 확인 순간에 다시 부른다(D10). 반응형 게터면 화면 판정도 따라간다 */
  canWrite?: () => boolean
  onDone?: (event: LegalDoneEvent<K>) => void | Promise<void>
  messages?: Partial<LegalMessages>
  /** 기본 true — 만들자마자 첫 종류를 불러온다 */
  immediate?: boolean
}

export interface LegalDetailDialogBindings<R> {
  modelValue: boolean
  row: R | null
  document: AdminLegalDocument | null
  loading: boolean
  failed: boolean
  /** false → 닫기 */
  'onUpdate:modelValue': (open: boolean) => void
  onRetry: () => void
}

/** `<LegalDocumentEditor v-bind="legal.editor.value" />` — props 와 리스너 이름은 컴포넌트 그대로 */
export interface LegalDocumentEditorBindings<K extends string, R> {
  kinds: readonly LegalKindOption<K>[]
  kind: K
  current: AdminLegalDocument | null
  loading: boolean
  loadFailed: boolean
  /** 초안 */
  modelValue: string
  readonly: boolean
  canPublish: boolean
  publishBlock: LegalPublishBlock | null
  submitting: boolean
  conflict: boolean
  history: readonly R[]
  historyLoading: boolean
  historyFailed: boolean
  publishDialog: ConfirmDialogBindings
  discardDialog: ConfirmDialogBindings
  detailDialog: LegalDetailDialogBindings<R>
  onSelectKind: (kind: K) => void
  'onUpdate:modelValue': (value: string) => void
  onPublish: () => void
  onReloadCurrent: () => void
  onReloadHistory: () => void
  onOpenDetail: (row: R) => void
  onDismissConflict: () => void
}

export interface LegalDocumentsController<K extends string, R = AdminLegalHistoryItem> {
  kind: Readonly<Ref<K>>
  current: Readonly<Ref<AdminLegalDocument | null>>
  draft: Readonly<Ref<string>>
  isDirty: ComputedRef<boolean>
  loading: Readonly<Ref<boolean>>
  loadFailed: ComputedRef<boolean>
  history: Readonly<Ref<readonly R[]>>
  historyLoading: Readonly<Ref<boolean>>
  historyFailed: ComputedRef<boolean>
  conflict: Readonly<Ref<boolean>>
  canPublish: ComputedRef<boolean>
  publishBlock: ComputedRef<LegalPublishBlock | null>
  submitting: Readonly<Ref<boolean>>
  selectKind: (kind: K) => void
  setDraft: (value: string) => void
  requestPublish: () => Promise<void>
  /** 현재본 + 이력. 초안이 더러우면 지킨다(D9) */
  reload: () => Promise<void>
  reloadCurrent: () => Promise<void>
  reloadHistory: () => Promise<void>
  openDetail: (row: R) => Promise<void>
  closeDetail: () => void
  dismissConflict: () => void
  editor: ComputedRef<LegalDocumentEditorBindings<K, R>>
}

interface DetailState<R> {
  open: boolean
  row: R | null
  document: AdminLegalDocument | null
  loading: boolean
  failed: boolean
}

export function useLegalDocuments<
  K extends string,
  R extends AdminLegalHistoryItem = AdminLegalHistoryItem,
>(options: UseLegalDocumentsOptions<K, R>): LegalDocumentsController<K, R> {
  const kinds = options.kinds
  if (kinds.length === 0) throw new Error('useLegalDocuments: kinds 가 비어 있다')
  const messages: LegalMessages = { ...DEFAULT_LEGAL_MESSAGES, ...options.messages }
  const canWrite = options.canWrite ?? (() => true)

  const isKind = (value: unknown): value is K => kinds.some((option) => option.value === value)
  const labelOf = (value: K): string =>
    kinds.find((option) => option.value === value)?.label ?? value

  function initialKind(): K {
    const wanted = options.initialKind
    if (wanted === undefined || isKind(wanted)) return wanted ?? kinds[0]!.value
    console.warn(
      `useLegalDocuments: initialKind '${wanted}' 이(가) kinds 에 없어 첫 종류로 시작한다`,
    )
    return kinds[0]!.value
  }

  const kind = ref(initialKind()) as Ref<K>
  const current = shallowRef<AdminLegalDocument | null>(null)
  const currentLoading = ref(false)
  const currentFailed = ref(false)
  const draft = ref('')
  /** 초안의 비교 기준(D8) */
  const baseBody = ref('')
  const history = shallowRef<readonly R[]>([])
  const historyLoading = ref(false)
  const historyFailed = ref(false)
  const conflict = ref(false)
  const detail = shallowRef<DetailState<R>>({
    open: false,
    row: null,
    document: null,
    loading: false,
    failed: false,
  })
  const discard = shallowRef<{ open: boolean; pendingKind: K | null }>({
    open: false,
    pendingKind: null,
  })

  const flow = useWriteFlow()
  let currentSeq = 0
  let historySeq = 0
  let detailSeq = 0
  /** 🔴 화면이 사라진 뒤 도착한 응답은 상태를 바꾸지 않는다 */
  let disposed = false
  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
    })
  }

  const isDirty = computed(() => draft.value !== baseBody.value)

  // ── 불러오기 ──────────────────────────────────────────────────────

  async function loadCurrent(k: K): Promise<void> {
    if (disposed) return
    const seq = ++currentSeq
    currentLoading.value = true
    currentFailed.value = false
    try {
      const document = await options.loadCurrent(k)
      if (disposed || seq !== currentSeq) return
      // 🔴 그 시점에 초안이 더러우면 지키고 기준만 바꾼다(D9) — 충돌 뒤 재조회 · reload() 가 편집을 덮지 않게
      const keep = draft.value !== baseBody.value
      current.value = document
      baseBody.value = document?.body ?? ''
      if (!keep) draft.value = baseBody.value
    } catch {
      if (disposed || seq !== currentSeq) return
      // current · 초안은 그대로 — 화면이 실패 경고 · 잠금을 보인다(D13)
      currentFailed.value = true
    } finally {
      if (seq === currentSeq) currentLoading.value = false
    }
  }

  async function loadHistory(k: K): Promise<void> {
    if (disposed) return
    const seq = ++historySeq
    historyLoading.value = true
    try {
      const items = await options.loadHistory(k)
      if (disposed || seq !== historySeq) return
      history.value = items
      historyFailed.value = false
    } catch {
      if (disposed || seq !== historySeq) return
      // 직전 목록은 남긴다 — 화면이 "최신이 아닐 수 있다" 고 알린다(gise)
      historyFailed.value = true
    } finally {
      if (seq === historySeq) historyLoading.value = false
    }
  }

  async function load(k: K): Promise<void> {
    await Promise.all([loadCurrent(k), loadHistory(k)])
  }

  // ── 판정 ──────────────────────────────────────────────────────────

  /** 발행이 막힌 첫 이유(D16). 발행 중 여부는 보지 않는다 — 확인 순간의 재검사(D10)가 같은 함수를 쓴다 */
  function publishable(): LegalPublishBlock | null {
    if (options.publish == null || !canWrite()) return 'readonly'
    if (currentLoading.value) return 'loading'
    if (currentFailed.value) return 'loadFailed'
    if (draft.value.trim() === '') return 'empty'
    if (draft.value.length > LEGAL_BODY_MAX_LENGTH) return 'tooLong'
    if (draft.value === baseBody.value) return 'unchanged'
    return null
  }

  const publishBlock = computed(publishable)
  const canPublish = computed(() => publishBlock.value === null && !flow.submitting.value)
  /** 편집기 잠금 — 쓸 수 없거나 비교할 본이 없거나(불러오는 중 · 실패) 발행 중일 때. 빈 본문 · 변경 없음은 잠그지 않는다 */
  const editorReadonly = computed(() => {
    const block = publishBlock.value
    return (
      block === 'readonly' || block === 'loading' || block === 'loadFailed' || flow.submitting.value
    )
  })

  // ── 종류 ──────────────────────────────────────────────────────────

  /** 🔴 `kind` 를 바꾸는 유일한 자리 — 초안부터 비운다(D7) */
  function switchKind(next: K): void {
    kind.value = next
    draft.value = ''
    baseBody.value = ''
    current.value = null
    history.value = []
    historyFailed.value = false
    conflict.value = false
    closeDetail()
    void load(next)
  }

  function selectKind(next: K): void {
    if (next === kind.value || !isKind(next) || flow.submitting.value) return
    if (isDirty.value) {
      discard.value = { open: true, pendingKind: next }
      return
    }
    switchKind(next)
  }

  function confirmDiscard(): void {
    const next = discard.value.pendingKind
    discard.value = { open: false, pendingKind: null }
    if (next == null || next === kind.value || flow.submitting.value) return
    switchKind(next)
  }

  function cancelDiscard(): void {
    discard.value = { open: false, pendingKind: null }
  }

  // ── 발행 ──────────────────────────────────────────────────────────

  async function requestPublish(): Promise<void> {
    const doPublish = options.publish
    if (doPublish == null || !canPublish.value) return
    const k = kind.value
    const label = labelOf(k)
    const text = messages.publishConfirm(label)
    let attempted = false
    let sent = ''
    const ok = await flow.run({
      gate: 'confirm',
      reversible: false,
      title: text.title,
      message: text.message,
      confirmLabel: text.confirmLabel,
      action: async () => {
        // 🔴 확인 순간에 다시 본다(D10)
        if (kind.value !== k || publishable() !== null) return
        attempted = true
        sent = draft.value
        await doPublish({
          kind: k,
          body: sent,
          baseLegalDocNo: current.value?.legalDocNo ?? null,
        })
      },
      onConflict: async () => {
        // 409 revision — 다른 관리자가 그사이 발행했다. 초안을 지키고 기준만 새 판으로(D9 · D12). 이 함수가 끝날 때까지
        // useWriteFlow 가 submitting 을 유지하므로 재조회 동안 발행 · 종류 전환이 잠긴다.
        conflict.value = true
        await load(k)
      },
    })
    if (!ok || !attempted) return
    // 🔴 재조회보다 먼저(D11)
    baseBody.value = sent
    conflict.value = false
    await load(k)
    await options.onDone?.({ action: 'published', kind: k, message: messages.published(label) })
  }

  // ── 원문 ──────────────────────────────────────────────────────────

  async function openDetail(row: R): Promise<void> {
    if (disposed) return
    const seq = ++detailSeq
    detail.value = { open: true, row, document: null, loading: true, failed: false }
    try {
      const document = await options.loadOne(row.legalDocNo)
      if (disposed || seq !== detailSeq) return
      detail.value = { ...detail.value, document, loading: false }
    } catch {
      if (disposed || seq !== detailSeq) return
      detail.value = { ...detail.value, failed: true, loading: false }
    }
  }

  /** 닫은 뒤 도착한 응답은 버린다(번호를 올린다). 내용은 남겨 닫히는 동안 깜빡이지 않게 한다 */
  function closeDetail(): void {
    detailSeq += 1
    detail.value = { ...detail.value, open: false, loading: false }
  }

  // ── 그 밖 ─────────────────────────────────────────────────────────

  /** 🔴 받은 그대로(D3) */
  function setDraft(value: string): void {
    draft.value = value
  }

  const reloadCurrent = () => loadCurrent(kind.value)
  const reloadHistory = () => loadHistory(kind.value)
  const reload = () => load(kind.value)
  const dismissConflict = () => {
    conflict.value = false
  }

  const discardDialog = computed<ConfirmDialogBindings>(() => {
    const pending = discard.value.pendingKind
    const text = messages.discardConfirm(
      labelOf(kind.value),
      pending == null ? '' : labelOf(pending),
    )
    return {
      modelValue: discard.value.open,
      'onUpdate:modelValue': (open: boolean) => {
        if (!open) cancelDiscard()
      },
      title: text.title,
      message: text.message,
      confirmLabel: text.confirmLabel,
      // 🔴 초안은 서버 어디에도 없다 — 버리면 되돌릴 방법이 없다(gise)
      reversible: false,
      submitting: false,
      onConfirm: confirmDiscard,
    }
  })

  const editor = computed<LegalDocumentEditorBindings<K, R>>(() => ({
    kinds,
    kind: kind.value,
    current: current.value,
    loading: currentLoading.value,
    loadFailed: currentFailed.value,
    modelValue: draft.value,
    readonly: editorReadonly.value,
    canPublish: canPublish.value,
    publishBlock: publishBlock.value,
    submitting: flow.submitting.value,
    conflict: conflict.value,
    history: history.value,
    historyLoading: historyLoading.value,
    historyFailed: historyFailed.value,
    publishDialog: flow.confirmDialog.value,
    discardDialog: discardDialog.value,
    detailDialog: {
      modelValue: detail.value.open,
      row: detail.value.row,
      document: detail.value.document,
      loading: detail.value.loading,
      failed: detail.value.failed,
      'onUpdate:modelValue': (open: boolean) => {
        if (!open) closeDetail()
      },
      onRetry: () => {
        const row = detail.value.row
        if (row != null) void openDetail(row)
      },
    },
    onSelectKind: selectKind,
    'onUpdate:modelValue': setDraft,
    onPublish: () => {
      void requestPublish()
    },
    onReloadCurrent: () => {
      void reloadCurrent()
    },
    onReloadHistory: () => {
      void reloadHistory()
    },
    onOpenDetail: (row: R) => {
      void openDetail(row)
    },
    onDismissConflict: dismissConflict,
  }))

  if (options.immediate ?? true) void load(kind.value)

  return {
    kind,
    current,
    draft,
    isDirty,
    loading: currentLoading,
    loadFailed: computed(() => currentFailed.value),
    history,
    historyLoading,
    historyFailed: computed(() => historyFailed.value),
    conflict,
    canPublish,
    publishBlock,
    submitting: flow.submitting,
    selectKind,
    setDraft,
    requestPublish,
    reload,
    reloadCurrent,
    reloadHistory,
    openDetail,
    closeDetail,
    dismissConflict,
    editor,
  }
}
