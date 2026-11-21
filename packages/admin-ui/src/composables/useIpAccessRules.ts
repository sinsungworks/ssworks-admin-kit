import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  type ShallowRef,
  type ComputedRef,
  type Ref,
} from 'vue'
import { CommonErrorCodes, isCoreIpScopeType } from '@ssworks/admin-shared'
import type {
  AdminIpPreview,
  AdminIpPreviewItem,
  AdminIpPreviewQuery,
  AdminIpRule,
  AdminIpRuleCreate,
  AdminIpRuleRemove,
  AdminIpRuleUpdate,
  AdminTeamNode,
  IpScopeType,
} from '@ssworks/admin-shared'
import { ApiError, toApiError } from '../api/error.js'
import {
  DEFAULT_IP_ACCESS_MESSAGES,
  IP_RULE_FORM_FIELDS,
  changedItemsOf,
  conflictAlertText,
  defaultIpScope,
  emptyIpRuleForm,
  flattenTeamPaths,
  formScopeTitle,
  gateMessage,
  ipRuleFormProblems,
  lockedItemsOf,
  removesGlobalAllow,
  resolveIpScopes,
  ruleScopeTitle,
  ruleToForm,
  sameIpRuleForm,
  toCreateBody,
  toUpdateBody,
  userOptionTitle,
  withScopeType,
  type IpAccessAlert,
  type IpAccessMessages,
  type IpExtraTargetView,
  type IpPreviewView,
  type IpRuleForm,
  type IpSelectItem,
  type IpUserOption,
  type IpWriteContext,
} from '../components/ip-access/ip-access.js'
import {
  isExtraChoice,
  parseScopeChoice,
  prefillScopeChoice,
  resolveIpScopeCatalog,
  scopeChoiceItems,
  type IpExtraScopeOption,
  type IpRuleFocus,
  type IpRulePrefill,
  type IpScopeCatalog,
  type IpScopeFamily,
  type IpTargetOption,
} from '../components/ip-access/ip-scope-choices.js'
import { useOptionalAdminUi } from '../context/admin-ui.js'
import { useIpPreview } from './useIpPreview.js'
import { useRemoteSearch, type RemoteSearch } from './useRemoteSearch.js'
import {
  useWriteFlow,
  type ConfirmDialogBindings,
  type ReauthDialogBindings,
} from './useWriteFlow.js'

// IP 접근 제어 관리의 흐름 — 목록 · 편집 패널 · 대상 후보 · 미리보기 · 쓰기. `IpAccessManager` 에 `v-bind` 할 바인딩을 낸다.
//
// 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue(목록 · 상시 카드 · 인라인 편집 패널 · 저장 전 스냅숏 ·
//       실패해도 재조회 · 검증이 비밀번호보다 먼저 · 첫 줄 가드) + kim5257-crm-v5 ip_access_control.vue(대상 후보 · 팀 경로)
// 바꾼 점:
//  ① 페이지 상태를 composable 하나로. 미리보기는 `useIpPreview`, 관문은 3a `useWriteFlow`, 사용자 검색은 `useRemoteSearch`.
//  ② 대상을 번호로 치던 칸을 후보 고르기로(④ T1) — 권한 게터가 거짓이면 부르지 않고 번호 칸(C9).
//  ③ 세션 끊기 제안이 없다(⑥ S2). revision 충돌 · 409 자기 잠금 처리가 새로 생겼다(hangang 에 없음).
//  ④ 고친 값 버리기 창을 바인딩으로 낸다 — 킷 `useConfirm` 은 플러그인이 없으면 던진다(I21).
//  - 층 목록 scopes(3i — ringside 보고 §1). 목록 밖 층의 기존 규칙은 고치는 동안만 선택지에 남는다(S2 · S4).
//  - 확장 범위(확장 범위 스펙 §5): extraScopes — 선택지 키(범위 전체 `<이름>:*`) · 쓰는 쪽 대상 검색 · 확장 규칙은 미리보기 대신
//    'unrelated' · 수정은 갈래를 넘지 않는다 · 화면이 모르는 범위의 행은 삭제만.
//  - 한 범위 모드 focus(값 — X12) · 미리 채운 openCreate(prefill)(확장 범위 스펙 §5-3 · §5-5).
//
// 🔴 편집 · 삭제 · 열기는 `busy`(쓰기 진행 중) 동안 막힌다 — 그래서 재조회 중에 다른 규칙을 여는 경합이 생기지 않는다(I24).

export interface IpRuleDoneEvent<R> {
  action: 'create' | 'update' | 'remove'
  rule: R | null
}

export interface UseIpAccessRulesOptions<R extends AdminIpRule = AdminIpRule> {
  /** GET /ip-access → items */
  list: () => Promise<readonly R[]>
  /** GET /ip-access/preview */
  preview: (query: AdminIpPreviewQuery) => Promise<AdminIpPreview>
  create: (body: AdminIpRuleCreate, ctx: IpWriteContext) => Promise<unknown>
  update: (rule: R, body: AdminIpRuleUpdate, ctx: IpWriteContext) => Promise<unknown>
  /** api.del(url, body) — 🔴 두 번째 인자가 본문이다(I16) */
  remove: (rule: R, body: AdminIpRuleRemove, ctx: IpWriteContext) => Promise<unknown>
  /** 게터 — ipAccess.manage. 거짓이면 미리보기 · 쓰기를 부르지 않는다 */
  canManage: () => boolean
  /** 기본 false(서버 기본과 같다). 서버 reauth 옵션과 맞춘다 — false 여도 쓰기는 확인 창을 거친다(I13) */
  reauth?: boolean
  loadTeams?: () => Promise<readonly AdminTeamNode[]>
  /** 게터 — 기본 () => true */
  canLoadTeams?: () => boolean
  searchUsers?: (keyword: string) => Promise<readonly IpUserOption[]>
  /** 게터 — 기본 () => true */
  canSearchUsers?: () => boolean
  /** 기본 item.userId === useAdminUi().user()?.userId — 컨텍스트가 없으면 본인 표시만 빠진다 */
  isSelf?: (item: AdminIpPreviewItem) => boolean
  onDone?: (event: IpRuleDoneEvent<R>) => void | Promise<void>
  /**
   * 기본 ['user', 'team', 'global']. 표시 순서는 늘 사용자 → 팀 → 전체(평가 순서). 팀 모듈(AdminTeamsModule)을 켜지 않은 앱은
   * ['user', 'global'] — 안 주면 "팀" 층이 남고 저장은 늘 400 이다. 🔴 빈 목록 · 모르는 값은 setup 에서 던진다.
   */
  scopes?: readonly IpScopeType[]
  /**
   * 확장 범위(관리자 밖 주체 — 출고 토큰 등). 서버 옵션 ipAccess.extraScopes 와 같은 이름 — 쓰는 쪽이 한 상수에서 만든다.
   * 🔴 이름 규칙 밖 · 코어 이름 · 겹침은 setup 에서 던진다. 확장 규칙도 canManage(= ipAccess.manage)가 쓴다(R7 없음).
   */
  extraScopes?: readonly IpExtraScopeOption[]
  /**
   * 한 범위 모드(R6-1) — 목록을 그 범위(대상을 주면 그 대상 + 범위 전체)로 거르고, 선택지를 그 범위로 좁히고, 대상을 주면
   * 대상 칸을 고정하고, 관리자 접속 카드를 그리지 않는다. 🔴 값이다 — 다른 대상은 쓰는 쪽이 :key 로 다시 만든다(X12).
   * extraScopes 에 있는 범위여야 한다(아니면 setup 에서 던진다).
   */
  focus?: IpRuleFocus
  messages?: Partial<IpAccessMessages>
  /** 기본 true */
  immediate?: boolean
}

/** `<IpAccessManager v-bind="ip.manager.value" />` — props 와 리스너 이름은 컴포넌트 그대로 */
export interface IpAccessManagerBindings<R> {
  rules: readonly R[]
  loading: boolean
  loadFailed: boolean
  onRetry: () => void
  canManage: boolean
  editing: R | 'new' | null
  form: IpRuleForm
  'onUpdate:form': (form: IpRuleForm) => void
  fieldErrors: Readonly<Record<string, readonly string[]>>
  onCidrBlur: () => void
  scopeItems: readonly IpSelectItem[]
  /** 범위 이름을 그리는 카탈로그 — 표 · 편집 패널 */
  scopeCatalog: IpScopeCatalog
  /** 확장 범위 「대상 하나」 선택지일 때만 */
  extraTarget: IpExtraTargetView | null
  onSearchTargets: (keyword: string) => void
  /** 🔴 화면이 모르는 범위의 행은 수정하지 않는다(X8) — 삭제만 */
  canEditRule: (rule: R) => boolean
  /** 한 범위 모드면 거짓 — 관리자 접속 카드를 그리지 않는다 */
  showPreviewCard: boolean
  teamMode: 'select' | 'number'
  teamItems: readonly IpSelectItem[]
  teamsLoading: boolean
  teamsFailed: boolean
  teamHint: string | null
  userMode: 'search' | 'number'
  userItems: readonly IpSelectItem[]
  usersSearching: boolean
  usersFailed: boolean
  userHint: string | null
  onSearchUsers: (keyword: string) => void
  onOpenCreate: () => void
  onOpenEdit: (rule: R) => void
  onCancel: () => void
  onSave: () => void
  onRemove: (rule: R) => void
  submitting: boolean
  busy: boolean
  preview: IpPreviewView
  lockedItems: readonly AdminIpPreviewItem[]
  changedItems: readonly AdminIpPreviewItem[]
  isSelf: (item: AdminIpPreviewItem) => boolean
  globalAllowRemoval: boolean
  alerts: readonly IpAccessAlert[]
  onDismissAlert: (index: number) => void
  confirmDialog: ConfirmDialogBindings
  reauthDialog: ReauthDialogBindings
  discardDialog: ConfirmDialogBindings
  messages: IpAccessMessages
}

export interface IpAccessRules<R> {
  rules: Readonly<Ref<readonly R[]>>
  loading: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<unknown>>
  /** 목록과 카드(현행 · 편집 중이면 그 미리보기)를 다시 부른다 */
  reload: () => Promise<void>
  /** null = 닫힘 · 'new' = 만들기 · R = 그 규칙 수정 */
  editing: Readonly<Ref<R | 'new' | null>>
  form: Readonly<Ref<IpRuleForm>>
  preview: Readonly<Ref<IpPreviewView>>
  /**
   * 고친 값이 있으면 버릴지 묻는다(I21). 취소 · 막힘이면 false. prefill 을 주면 그 값으로 연다(R6c — 다른 화면의 [이 IP 허용]) —
   * 🔴 미리 채운 값은 고친 값이다. 이 화면이 고를 수 없는 선택지면 false.
   */
  openCreate: (prefill?: IpRulePrefill) => Promise<boolean>
  openEdit: (rule: R) => Promise<boolean>
  closeEditor: () => Promise<boolean>
  save: () => Promise<boolean>
  remove: (rule: R) => Promise<boolean>
  submitting: Readonly<Ref<boolean>>
  /** <IpAccessManager v-bind="ip.manager.value" /> — 확인 · 재인증 · 버리기 창도 이 안에 있다 */
  manager: ComputedRef<IpAccessManagerBindings<R>>
}

/** setup 안에서 부른다. */
export function useIpAccessRules<R extends AdminIpRule = AdminIpRule>(
  options: UseIpAccessRulesOptions<R>,
): IpAccessRules<R> {
  const messages: IpAccessMessages = { ...DEFAULT_IP_ACCESS_MESSAGES, ...options.messages }
  // 🔴 setup 첫머리에서 던진다 — 층을 고를 수 없는 화면은 설정 실수다(3i S1)
  const scopes = resolveIpScopes(options.scopes)
  // 🔴 setup 첫머리에서 던진다 — 고를 수 없는 범위는 설정 실수다(확장 범위 스펙 §5-1)
  const catalog = resolveIpScopeCatalog(scopes, options.extraScopes ?? [], options.focus ?? null)
  const newScope = defaultIpScope(scopes)
  const flow = useWriteFlow()
  // 기본값을 쓸 때만 컨텍스트를 찾는다 — 플러그인이 없으면 본인 표시만 빠진다(I6)
  const ui = options.isSelf == null ? useOptionalAdminUi() : null
  const isSelf =
    options.isSelf ??
    ((item: AdminIpPreviewItem) => {
      const userId = ui?.user()?.userId
      return userId != null && userId !== '' && item.userId === userId
    })
  let disposed = false

  // ── 목록 ──────────────────────────────────────────────────────────

  const allRules = shallowRef<readonly R[]>([])
  /** 한 범위 모드면 그 범위만(화면에서 거른다 — 서버 목록 그대로) */
  const rules = computed<readonly R[]>(() => {
    const focus = catalog.focus
    if (focus === null) return allRules.value
    return allRules.value.filter(
      (rule) =>
        rule.scopeType === focus.scopeType &&
        (focus.scopeRefNo === undefined ||
          rule.scopeRefNo === null ||
          rule.scopeRefNo === focus.scopeRefNo),
    )
  })
  const loading = ref(false)
  const loadError = shallowRef<ApiError | null>(null)
  let listSeq = 0

  /** 반영됐으면 true. 🔴 늦은 응답은 버린다(I24). 실패해도 직전 목록은 둔다 */
  async function load(): Promise<boolean> {
    const mine = ++listSeq
    loading.value = true
    loadError.value = null
    try {
      const items = await options.list()
      if (mine !== listSeq || disposed) return false
      allRules.value = items
      for (const item of items) rememberTarget(item)
      return true
    } catch (error) {
      if (mine !== listSeq || disposed) return false
      // 처리됨으로 표시하지 않는다 — 표 위 알림과 전역 토스트가 둘 다 뜬다(C7)
      loadError.value = toApiError(error)
      return false
    } finally {
      if (mine === listSeq && !disposed) loading.value = false
    }
  }

  function findRule(ruleNo: bigint): R | undefined {
    return allRules.value.find((item) => item.ruleNo === ruleNo)
  }

  // ── 알림 ──────────────────────────────────────────────────────────

  const alerts = shallowRef<readonly IpAccessAlert[]>([])

  function pushAlert(kind: IpAccessAlert['kind'], text: string): void {
    if (alerts.value.some((alert) => alert.kind === kind && alert.text === text)) return
    alerts.value = [...alerts.value, { kind, text }]
  }

  // ── 편집 상태 · 미리보기 ───────────────────────────────────────────

  const editing: ShallowRef<R | 'new' | null> = shallowRef<R | 'new' | null>(null)
  /** 새 규칙 폼 — 한 범위 모드면 그 범위(대상이 있으면 그 대상) */
  function emptyForm(): IpRuleForm {
    const focus = catalog.focus
    if (focus === null) return emptyIpRuleForm(newScope)
    return {
      ...emptyIpRuleForm(focus.scopeType),
      scopeRefNo: focus.scopeRefNo === undefined ? '' : String(focus.scopeRefNo),
    }
  }

  /** 🔴 한 범위 모드의 대상은 바꿀 수 없다 — 대상 하나 선택지면 늘 그 대상 */
  function pinFocus(next: IpRuleForm): IpRuleForm {
    const focus = catalog.focus
    if (focus?.scopeRefNo === undefined || next.scopeType !== focus.scopeType) return next
    return { ...next, scopeRefNo: String(focus.scopeRefNo) }
  }

  const form = ref<IpRuleForm>(emptyForm())
  /** 연 순간의 폼 — 고친 값 판정의 기준(I21) */
  let baseline: IpRuleForm = emptyForm()
  const clientErrors = shallowRef<Record<string, string[]>>({})
  const removing = shallowRef<R | null>(null)
  const working = ref(false)
  const busy = computed(() => working.value || flow.submitting.value)
  const isDirty = (): boolean => editing.value !== null && !sameIpRuleForm(form.value, baseline)

  const preview = useIpPreview({
    preview: options.preview,
    canManage: () => options.canManage(),
    onStale: () => {
      void onStale()
    },
    immediate: options.immediate,
  })

  function syncTarget(): void {
    const deleting = removing.value
    const current = editing.value
    if (deleting != null) {
      // 🔴 확장 규칙(모르는 범위 포함)은 관리자 접속과 무관하다 — 미리보기를 부르지 않는다(§5-4)
      preview.setTarget(
        isCoreIpScopeType(deleting.scopeType)
          ? { op: 'delete', ruleNo: deleting.ruleNo }
          : { op: 'unrelated' },
      )
    } else if (current === null) preview.setTarget({ op: null })
    else if (isExtraChoice(form.value.scopeType)) preview.setTarget({ op: 'unrelated' })
    else if (current === 'new') preview.setTarget({ op: 'create', form: { ...form.value } })
    else preview.setTarget({ op: 'update', ruleNo: current.ruleNo, form: { ...form.value } })
  }

  // ── 대상 후보 ──────────────────────────────────────────────────────

  /** `team:4` · `user:3` → 칸에 보일 글자. 규칙 행 · 팀 트리 · 검색 결과에서 모은다 */
  const knownTargets = new Map<string, string>()

  function rememberTarget(rule: AdminIpRule): void {
    if (rule.scopeRefNo == null || rule.scopeName == null) return
    const title =
      rule.scopeType === 'user' && rule.scopeUserId != null
        ? userOptionTitle({ userName: rule.scopeName, userId: rule.scopeUserId })
        : rule.scopeName
    knownTargets.set(`${rule.scopeType}:${rule.scopeRefNo}`, title)
  }

  const canTeams = (): boolean => options.loadTeams != null && (options.canLoadTeams?.() ?? true)
  const teamItems = shallowRef<readonly IpSelectItem[]>([])
  const teamsLoading = ref(false)
  const teamsFailed = ref(false)
  let teamSeq = 0

  /** 편집을 열 때마다 부른다(I20). 🔴 권한 게터가 거짓이면 부르지 않는다(C9) */
  function loadTeams(): void {
    const fetchTree = options.loadTeams
    if (fetchTree == null || !canTeams()) return
    const mine = ++teamSeq
    teamsLoading.value = true
    teamsFailed.value = false
    void fetchTree()
      .then(
        (tree) => {
          if (mine !== teamSeq || disposed) return
          const items = flattenTeamPaths(tree)
          for (const item of items) knownTargets.set(`team:${item.value}`, item.title)
          teamItems.value = items
        },
        (error: unknown) => {
          // 칸 아래 문구로 보인다 — 전역 토스트로 두 번 알리지 않는다(C7)
          // 🔴 버린 요청의 실패도 처리됨으로 — 칸은 새 요청의 결과를 보이고, 버린 실패가 전역 토스트로 뜨면 지금 화면과 어긋난 알림이다.
          if (error instanceof ApiError) error.handled = true
          if (mine !== teamSeq || disposed) return
          teamsFailed.value = true
        },
      )
      .finally(() => {
        if (mine === teamSeq && !disposed) teamsLoading.value = false
      })
  }

  const userSearch = options.searchUsers != null ? useRemoteSearch(options.searchUsers) : null
  const canUsers = (): boolean => userSearch != null && (options.canSearchUsers?.() ?? true)

  /** 지금 대상이 후보에 없어도 칸이 이름을 보이게 맨 앞에 둔다. choiceKey 는 대상이 있는 선택지(team · user · 확장 이름) */
  function withCurrent(items: IpSelectItem[], choiceKey: string): IpSelectItem[] {
    const refNo = form.value.scopeRefNo.trim()
    if (
      form.value.scopeType !== choiceKey ||
      refNo === '' ||
      items.some((item) => item.value === refNo)
    ) {
      return items
    }
    return [
      { value: refNo, title: knownTargets.get(`${choiceKey}:${refNo}`) ?? `#${refNo}` },
      ...items,
    ]
  }

  const teamItemList = computed(() => withCurrent([...teamItems.value], 'team'))
  const userItemList = computed(() => {
    const items = (userSearch?.items.value ?? []).map((option) => {
      const item = { value: String(option.userNo), title: userOptionTitle(option) }
      knownTargets.set(`user:${item.value}`, item.title)
      return item
    })
    return withCurrent(items, 'user')
  })

  // ── 확장 범위 대상 후보 ─────────────────────────────────────────────

  const extraSearches = new Map<string, RemoteSearch<IpTargetOption>>()
  for (const [type, scope] of catalog.extra) {
    if (scope.search != null) extraSearches.set(type, useRemoteSearch(scope.search))
  }
  const canSearchExtra = (type: string): boolean =>
    extraSearches.has(type) && (catalog.extra.get(type)?.canSearch?.() ?? true)

  const extraTarget = computed<IpExtraTargetView | null>(() => {
    const choice = parseScopeChoice(form.value.scopeType)
    const scope = catalog.extra.get(choice.scopeType)
    if (scope === undefined || choice.whole) return null
    const search = extraSearches.get(choice.scopeType)
    const found = (search?.items.value ?? []).map((option) => {
      const item = { value: String(option.refNo), title: option.name }
      knownTargets.set(`${choice.scopeType}:${item.value}`, item.title)
      return item
    })
    const fixed =
      catalog.focus?.scopeRefNo !== undefined && catalog.focus.scopeType === choice.scopeType
    const refNo = form.value.scopeRefNo.trim()
    const searchable = canSearchExtra(choice.scopeType)
    return {
      label: messages.targetLabel(scope.label),
      numberLabel: messages.targetNumberLabel(scope.label),
      mode: fixed ? 'fixed' : searchable ? 'search' : 'number',
      items: withCurrent(found, choice.scopeType),
      searching: search?.searching.value ?? false,
      failed: search?.failed.value ?? false,
      hint: !fixed && search != null && !searchable ? messages.targetNoPermissionHint : null,
      fixedTitle: fixed ? (knownTargets.get(`${choice.scopeType}:${refNo}`) ?? `#${refNo}`) : null,
    }
  })

  // ── 고친 값 버리기 ─────────────────────────────────────────────────

  const discardOpen = ref(false)
  let discardResolve: ((ok: boolean) => void) | null = null

  /** 고친 값이 없으면 바로 true. 있으면 창을 열고 답을 기다린다(I21) */
  function askDiscard(): Promise<boolean> {
    if (!isDirty()) return Promise.resolve(true)
    discardResolve?.(false)
    return new Promise<boolean>((resolve) => {
      discardResolve = resolve
      discardOpen.value = true
    })
  }

  function settleDiscard(ok: boolean): void {
    discardOpen.value = false
    const resolve = discardResolve
    discardResolve = null
    resolve?.(ok)
  }

  const discardDialog = computed<ConfirmDialogBindings>(() => ({
    modelValue: discardOpen.value,
    'onUpdate:modelValue': (open: boolean) => {
      if (!open) settleDiscard(false)
    },
    title: messages.discardTitle,
    message: messages.discardMessage,
    reversible: false,
    submitting: false,
    confirmLabel: messages.discardConfirm,
    onConfirm: () => settleDiscard(true),
  }))

  // ── 편집 열고 닫기 · 폼 ────────────────────────────────────────────

  /** 만들기 = 전부(한 범위 모드면 그 범위) · 수정 = 그 규칙의 갈래(X2) */
  function familyOf(target: R | 'new' | null): IpScopeFamily {
    if (target === null || target === 'new') {
      return catalog.focus === null ? 'all' : { extra: catalog.focus.scopeType }
    }
    return isCoreIpScopeType(target.scopeType) ? 'core' : { extra: target.scopeType }
  }

  /** 🔴 화면이 모르는 범위의 행(옵션에서 지운 범위)은 수정하지 않는다 — 서버도 400 이다(X8) */
  const canEditRule = (rule: AdminIpRule): boolean =>
    isCoreIpScopeType(rule.scopeType) || catalog.extra.has(rule.scopeType)

  function choiceItems() {
    return scopeChoiceItems(messages, catalog, familyOf(editing.value), form.value.scopeType)
  }

  function setEditor(next: R | 'new' | null, seed?: IpRuleForm): void {
    editing.value = next
    form.value =
      next === null ? emptyForm() : next === 'new' ? (seed ?? emptyForm()) : ruleToForm(next)
    // 🔴 만들기의 기준선은 빈 폼 — 미리 채운 값은 고친 값이다(닫을 때 묻는다)
    baseline = next === 'new' ? emptyForm() : { ...form.value }
    clientErrors.value = {}
    flow.clearFieldErrors()
    if (next !== null && next !== 'new') rememberTarget(next)
    syncTarget()
    if (next !== null) loadTeams()
  }

  async function openCreate(prefill?: IpRulePrefill): Promise<boolean> {
    // 🔴 첫 줄 가드 — :disabled 는 마우스만 막는다
    if (!options.canManage() || busy.value) return false
    let seed: IpRuleForm | undefined
    if (prefill !== undefined) {
      const key = prefillScopeChoice(prefill, catalog)
      if (key === null) return false
      seed = {
        scopeType: key,
        scopeRefNo: prefill.scopeRefNo === null ? '' : String(prefill.scopeRefNo),
        cidr: prefill.cidr ?? '',
        description: prefill.description ?? '',
      }
    }
    if (!(await askDiscard())) return false
    // 🔴 확인 순간에 다시 본다 — 묻는 사이 권한이 회수되거나 쓰기가 시작됐을 수 있다
    if (!options.canManage() || busy.value) return false
    alerts.value = []
    if (prefill?.scopeName != null && prefill.scopeRefNo !== null) {
      knownTargets.set(`${prefill.scopeType}:${prefill.scopeRefNo}`, prefill.scopeName)
    }
    setEditor('new', seed)
    return true
  }

  async function openEdit(rule: R): Promise<boolean> {
    if (!options.canManage() || busy.value || !canEditRule(rule)) return false
    if (!(await askDiscard())) return false
    if (!options.canManage() || busy.value || !canEditRule(rule)) return false
    alerts.value = []
    setEditor(rule)
    return true
  }

  async function closeEditor(): Promise<boolean> {
    if (editing.value === null) return true
    if (busy.value) return false
    if (!(await askDiscard())) return false
    setEditor(null)
    return true
  }

  function updateForm(next: IpRuleForm): void {
    if (editing.value === null || busy.value) return
    // 🔴 선택지 밖으로 바꾸는 갱신은 통째로 버린다(3i S4 · X2) — 갈래를 넘거나 목록 밖 층으로 가지 않는다
    if (
      next.scopeType !== form.value.scopeType &&
      !choiceItems().some((item) => item.value === next.scopeType)
    )
      return
    // 🔴 범위를 바꾸면 대상을 비운다(I19) — 팀 번호가 사용자 번호로, 본 적 없는 번호가 남지 않게
    form.value = pinFocus(
      withScopeType({ ...next, scopeType: form.value.scopeType }, next.scopeType),
    )
    clientErrors.value = {}
    flow.clearFieldErrors()
    syncTarget()
  }

  /** CIDR 칸을 떠날 때 형식 오류를 보인다(I19). 빈 칸은 저장 때 */
  function cidrBlur(): void {
    if (editing.value === null || form.value.cidr.trim() === '') return
    const cidr = ipRuleFormProblems(form.value, messages).cidr
    if (cidr != null) clientErrors.value = { ...clientErrors.value, cidr }
  }

  /** 미리보기 404 — 목록을 다시 부르고, 편집 중인 규칙이 사라졌으면 패널을 닫는다(I11) */
  async function onStale(): Promise<void> {
    const applied = await load()
    const current = editing.value
    if (applied && current !== null && current !== 'new' && findRule(current.ruleNo) == null) {
      setEditor(null)
      pushAlert('warning', messages.ruleGone)
    }
  }

  // ── 쓰기 ──────────────────────────────────────────────────────────

  /**
   * 409 ERR_COMMON_CONFLICT(자기 잠금 · 전권자 잔존) — 서버 문구 그대로 + 주소로 빨간 알림.
   * 🔴 처리됨 표시는 이 catch 의 동기 구간에서 — 지연 전역 onError 보다 먼저다. useWriteFlow 를 고치지 않는다(I17).
   */
  function guardConflict(call: () => Promise<unknown>): Promise<unknown> {
    return call().catch((error: unknown) => {
      if (error instanceof ApiError && error.code === CommonErrorCodes.ERR_COMMON_CONFLICT) {
        error.handled = true
        pushAlert('error', conflictAlertText(error, messages))
      }
      throw error
    })
  }

  function targetTitleOf(value: IpRuleForm): string | null {
    const choice = parseScopeChoice(value.scopeType)
    if (choice.whole) return null
    return knownTargets.get(`${choice.scopeType}:${value.scopeRefNo.trim()}`) ?? null
  }

  async function save(): Promise<boolean> {
    const target = editing.value
    // ① 🔴 첫 줄 가드 — :disabled 는 마우스만 막는다
    if (target === null || !options.canManage() || busy.value) return false
    const problems = ipRuleFormProblems(form.value, messages)
    if (Object.keys(problems).length > 0) {
      // ② 🔴 비밀번호를 묻기 전에 멈춘다
      clientErrors.value = problems
      return false
    }
    working.value = true
    alerts.value = []
    try {
      const submitted = { ...form.value }
      // ③ 🔴 관문은 미리보기가 끝난 뒤 — 창 문구를 열 때 고정하므로 기다려야 최종 영향이다(I12)
      const snapshot = await preview.flush()
      if (editing.value !== target || !sameIpRuleForm(form.value, submitted)) return false
      if (snapshot.state === 'stale') return false
      const kind = target === 'new' ? 'create' : 'update'
      const cidr = submitted.cidr.trim()
      const message = gateMessage(
        {
          kind,
          scope: formScopeTitle(submitted, targetTitleOf(submitted), messages, catalog),
          cidr,
          irreversible: false,
          globalRemoval:
            target !== 'new' &&
            isCoreIpScopeType(target.scopeType) &&
            removesGlobalAllow(target.cidr, cidr),
          view: snapshot,
        },
        messages,
      )
      let attempted = false
      let lastSent = false
      let conflicted = false
      const send = (ctx: IpWriteContext): Promise<unknown> => {
        // 🔴 확인 순간에 다시 본다 — 창이 열린 사이 권한이 회수됐으면 보내지 않는다(스펙 §4-3 · 3e D10).
        //    요청마다 lastSent 를 새로 세운다 — 재인증 실패로 창이 남은 뒤 권한이 회수되어 다시 확인하면 attempted 는
        //    이미 참이라, 그것만 보면 보내지 않은 요청을 성공으로 처리한다.
        lastSent = false
        if (!options.canManage()) return Promise.resolve(undefined)
        attempted = true
        lastSent = true
        return guardConflict(() =>
          target === 'new'
            ? options.create(toCreateBody(submitted), ctx)
            : options.update(target, toUpdateBody(submitted, target.revision), ctx),
        )
      }
      const common = {
        title: kind === 'create' ? messages.createTitle : messages.updateTitle,
        message,
        confirmLabel: kind === 'create' ? messages.createConfirm : messages.updateConfirm,
        fields: IP_RULE_FORM_FIELDS,
        onConflict: () => {
          conflicted = true
        },
      }
      // ④ 🔴 관문 없이 나가는 IP 쓰기는 없다 — IP 변경은 사람을 잠근다(I13)
      const ok =
        options.reauth === true
          ? await flow.run({ gate: 'reauth', ...common, action: send })
          : await flow.run({ gate: 'confirm', reversible: true, ...common, action: () => send({}) })
      if (!attempted) return false
      // ⑤ 🔴 요청이 나갔으면 성공이든 실패든 다시 부른다 — 404 는 "목록이 낡았다", 409 는 "상태가 갈렸다"
      const applied = await load()
      if (ok && lastSent) {
        // ⑦ 🔴 만들기는 재조회가 반영되지 않아도 닫는다 — 채운 폼을 남기면 같은 규칙을 또 만든다(useRoleEditor R8)
        setEditor(null)
        if (snapshot.state !== 'ready' && snapshot.state !== 'unrelated') {
          pushAlert('warning', messages.savedWithoutPreview)
        }
        await options.onDone?.({
          action: kind,
          rule: target === 'new' ? null : (findRule(target.ruleNo) ?? target),
        })
        return true
      }
      if (target !== 'new' && applied) {
        const fresh = findRule(target.ruleNo)
        if (fresh == null) {
          setEditor(null)
          pushAlert('warning', messages.ruleGone)
        } else if (conflicted) {
          // 🔴 폼은 둔다 — 편집 대상만 새 행으로(다음 저장은 새 revision · 사용자가 본 뒤 한 번 더 눌러야 덮는다 · I18)
          editing.value = fresh
          rememberTarget(fresh)
          pushAlert(
            'warning',
            messages.revisionConflict(ruleScopeTitle(fresh, messages, catalog), fresh.cidr),
          )
          syncTarget()
        }
      }
      preview.refresh()
      return false
    } finally {
      working.value = false
    }
  }

  async function remove(rule: R): Promise<boolean> {
    if (!options.canManage() || busy.value) return false
    // 🔴 삭제 미리보기가 편집 미리보기 자리를 쓴다 — 고친 값이 있으면 먼저 묻는다(I15)
    if (!(await askDiscard())) return false
    if (!options.canManage() || busy.value) return false
    working.value = true
    alerts.value = []
    try {
      if (editing.value !== null) setEditor(null)
      removing.value = rule
      syncTarget()
      const snapshot = await preview.flush()
      if (removing.value !== rule) return false
      if (snapshot.state === 'stale') {
        pushAlert('warning', messages.ruleGone)
        return false
      }
      const reauth = options.reauth === true
      const message = gateMessage(
        {
          kind: 'remove',
          scope: ruleScopeTitle(rule, messages, catalog),
          cidr: rule.cidr,
          irreversible: reauth,
          globalRemoval: isCoreIpScopeType(rule.scopeType) && removesGlobalAllow(rule.cidr, null),
          view: snapshot,
        },
        messages,
      )
      let attempted = false
      let lastSent = false
      let conflicted = false
      const send = (ctx: IpWriteContext): Promise<unknown> => {
        // 🔴 확인 순간에 다시 본다(저장과 같음) — 요청마다 lastSent 를 새로 세운다(재인증 재시도 때 권한 회수)
        lastSent = false
        if (!options.canManage()) return Promise.resolve(undefined)
        attempted = true
        lastSent = true
        return guardConflict(() => options.remove(rule, { revision: rule.revision }, ctx))
      }
      const common = {
        title: messages.removeTitle,
        message,
        confirmLabel: messages.removeConfirm,
        onConflict: () => {
          conflicted = true
        },
      }
      // 🔴 재인증이면 그 창 하나가 확인을 겸한다 — 문구에 "되돌릴 수 없습니다"(I13 · useRoleEditor 481)
      const ok = reauth
        ? await flow.run({ gate: 'reauth', ...common, action: send })
        : await flow.run({ gate: 'confirm', reversible: false, ...common, action: () => send({}) })
      if (!attempted) return false
      const applied = await load()
      if (ok && lastSent) {
        await options.onDone?.({ action: 'remove', rule })
        return true
      }
      if (conflicted && applied) {
        const fresh = findRule(rule.ruleNo)
        pushAlert(
          'warning',
          fresh == null
            ? messages.ruleGone
            : messages.revisionConflict(ruleScopeTitle(fresh, messages, catalog), fresh.cidr),
        )
      }
      return false
    } finally {
      // 취소 · 실패 · 성공 어느 쪽이든 미리보기는 현행으로 돌아간다
      removing.value = null
      syncTarget()
      working.value = false
    }
  }

  // ── 바인딩 ────────────────────────────────────────────────────────

  const globalAllowRemoval = computed(() => {
    const deleting = removing.value
    if (deleting != null) {
      return isCoreIpScopeType(deleting.scopeType) && removesGlobalAllow(deleting.cidr, null)
    }
    const current = editing.value
    return (
      current !== null &&
      current !== 'new' &&
      isCoreIpScopeType(current.scopeType) &&
      removesGlobalAllow(current.cidr, form.value.cidr.trim())
    )
  })

  const manager = computed<IpAccessManagerBindings<R>>(() => ({
    rules: rules.value,
    loading: loading.value,
    loadFailed: loadError.value != null,
    onRetry: () => {
      void load()
      preview.refresh()
    },
    canManage: options.canManage(),
    editing: editing.value,
    form: form.value,
    'onUpdate:form': updateForm,
    fieldErrors: { ...flow.fieldErrors.value, ...clientErrors.value },
    onCidrBlur: cidrBlur,
    scopeItems: choiceItems(),
    scopeCatalog: catalog,
    extraTarget: extraTarget.value,
    onSearchTargets: (keyword) => {
      const choice = parseScopeChoice(form.value.scopeType)
      if (choice.whole) return
      if (canSearchExtra(choice.scopeType)) extraSearches.get(choice.scopeType)?.search(keyword)
    },
    canEditRule,
    showPreviewCard: catalog.focus === null,
    teamMode: canTeams() ? 'select' : 'number',
    teamItems: teamItemList.value,
    teamsLoading: teamsLoading.value,
    teamsFailed: teamsFailed.value,
    teamHint: options.loadTeams != null && !canTeams() ? messages.teamNoPermissionHint : null,
    userMode: canUsers() ? 'search' : 'number',
    userItems: userItemList.value,
    usersSearching: userSearch?.searching.value ?? false,
    usersFailed: userSearch?.failed.value ?? false,
    userHint: userSearch != null && !canUsers() ? messages.userNoPermissionHint : null,
    onSearchUsers: (keyword) => {
      if (canUsers()) userSearch?.search(keyword)
    },
    onOpenCreate: () => {
      void openCreate()
    },
    onOpenEdit: (rule) => {
      void openEdit(rule)
    },
    onCancel: () => {
      void closeEditor()
    },
    onSave: () => {
      void save()
    },
    onRemove: (rule) => {
      void remove(rule)
    },
    submitting: flow.submitting.value,
    busy: busy.value,
    preview: preview.view.value,
    lockedItems: lockedItemsOf(preview.view.value),
    changedItems: changedItemsOf(preview.view.value),
    isSelf,
    globalAllowRemoval: globalAllowRemoval.value,
    alerts: alerts.value,
    onDismissAlert: (index) => {
      alerts.value = alerts.value.filter((_, i) => i !== index)
    },
    confirmDialog: flow.confirmDialog.value,
    reauthDialog: flow.reauthDialog.value,
    discardDialog: discardDialog.value,
    messages,
  }))

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      settleDiscard(false)
    })
  }

  if (options.immediate !== false) void load()

  return {
    rules,
    loading,
    loadError,
    reload: async () => {
      preview.refresh()
      await load()
    },
    editing,
    form,
    preview: preview.view,
    openCreate,
    openEdit,
    closeEditor,
    save,
    remove,
    submitting: flow.submitting,
    manager,
  }
}
