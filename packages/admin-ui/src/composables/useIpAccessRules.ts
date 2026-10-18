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
import { CommonErrorCodes } from '@ssworks/admin-shared'
import type {
  AdminIpPreview,
  AdminIpPreviewItem,
  AdminIpPreviewQuery,
  AdminIpRule,
  AdminIpRuleCreate,
  AdminIpRuleRemove,
  AdminIpRuleUpdate,
  AdminTeamNode,
} from '@ssworks/admin-shared'
import { ApiError, toApiError } from '../api/error.js'
import {
  DEFAULT_IP_ACCESS_MESSAGES,
  IP_RULE_FORM_FIELDS,
  changedItemsOf,
  conflictAlertText,
  emptyIpRuleForm,
  flattenTeamPaths,
  formScopeTitle,
  gateMessage,
  ipRuleFormProblems,
  lockedItemsOf,
  removesGlobalAllow,
  ruleScopeTitle,
  ruleToForm,
  sameIpRuleForm,
  scopeTypeItems,
  toCreateBody,
  toUpdateBody,
  userOptionTitle,
  type IpAccessAlert,
  type IpAccessMessages,
  type IpPreviewView,
  type IpRuleForm,
  type IpSelectItem,
  type IpUserOption,
  type IpWriteContext,
} from '../components/ip-access/ip-access.js'
import { useOptionalAdminUi } from '../context/admin-ui.js'
import { useIpPreview } from './useIpPreview.js'
import { useRemoteSearch } from './useRemoteSearch.js'
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
  /** 고친 값이 있으면 버릴지 묻는다(I21). 취소 · 막힘이면 false */
  openCreate: () => Promise<boolean>
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
  const scopeItems = scopeTypeItems(messages)
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

  const rules = shallowRef<readonly R[]>([])
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
      rules.value = items
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
    return rules.value.find((item) => item.ruleNo === ruleNo)
  }

  // ── 알림 ──────────────────────────────────────────────────────────

  const alerts = shallowRef<readonly IpAccessAlert[]>([])

  function pushAlert(kind: IpAccessAlert['kind'], text: string): void {
    if (alerts.value.some((alert) => alert.kind === kind && alert.text === text)) return
    alerts.value = [...alerts.value, { kind, text }]
  }

  // ── 편집 상태 · 미리보기 ───────────────────────────────────────────

  const editing: ShallowRef<R | 'new' | null> = shallowRef<R | 'new' | null>(null)
  const form = ref<IpRuleForm>(emptyIpRuleForm())
  /** 연 순간의 폼 — 고친 값 판정의 기준(I21) */
  let baseline: IpRuleForm = emptyIpRuleForm()
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
    if (deleting != null) preview.setTarget({ op: 'delete', ruleNo: deleting.ruleNo })
    else if (current === null) preview.setTarget({ op: null })
    else if (current === 'new') preview.setTarget({ op: 'create', form: { ...form.value } })
    else preview.setTarget({ op: 'update', ruleNo: current.ruleNo, form: { ...form.value } })
  }

  // ── 대상 후보 ──────────────────────────────────────────────────────

  /** `team:4` · `user:3` → 칸에 보일 글자. 규칙 행 · 팀 트리 · 검색 결과에서 모은다 */
  const knownTargets = new Map<string, string>()

  function rememberTarget(rule: AdminIpRule): void {
    if (rule.scopeType === 'global' || rule.scopeRefNo == null || rule.scopeName == null) return
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
          if (mine !== teamSeq || disposed) return
          // 칸 아래 문구로 보인다 — 전역 토스트로 두 번 알리지 않는다(C7)
          if (error instanceof ApiError) error.handled = true
          teamsFailed.value = true
        },
      )
      .finally(() => {
        if (mine === teamSeq && !disposed) teamsLoading.value = false
      })
  }

  const userSearch = options.searchUsers != null ? useRemoteSearch(options.searchUsers) : null
  const canUsers = (): boolean => userSearch != null && (options.canSearchUsers?.() ?? true)

  /** 지금 대상이 후보에 없어도 칸이 이름을 보이게 맨 앞에 둔다 */
  function withCurrent(items: IpSelectItem[], scopeType: 'team' | 'user'): IpSelectItem[] {
    const refNo = form.value.scopeRefNo.trim()
    if (
      form.value.scopeType !== scopeType ||
      refNo === '' ||
      items.some((item) => item.value === refNo)
    ) {
      return items
    }
    return [
      { value: refNo, title: knownTargets.get(`${scopeType}:${refNo}`) ?? `#${refNo}` },
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

  function setEditor(next: R | 'new' | null): void {
    editing.value = next
    form.value = next === null || next === 'new' ? emptyIpRuleForm() : ruleToForm(next)
    baseline = { ...form.value }
    clientErrors.value = {}
    flow.clearFieldErrors()
    if (next !== null && next !== 'new') rememberTarget(next)
    syncTarget()
    if (next !== null) loadTeams()
  }

  async function openCreate(): Promise<boolean> {
    // 🔴 첫 줄 가드 — :disabled 는 마우스만 막는다
    if (!options.canManage() || busy.value) return false
    if (!(await askDiscard())) return false
    alerts.value = []
    setEditor('new')
    return true
  }

  async function openEdit(rule: R): Promise<boolean> {
    if (!options.canManage() || busy.value) return false
    if (!(await askDiscard())) return false
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
    // 🔴 범위를 바꾸면 대상을 비운다(I19) — 팀 번호가 사용자 번호로, 본 적 없는 번호가 남지 않게
    form.value = next.scopeType !== form.value.scopeType ? { ...next, scopeRefNo: '' } : { ...next }
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
    if (value.scopeType === 'global') return null
    return knownTargets.get(`${value.scopeType}:${value.scopeRefNo.trim()}`) ?? null
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
          scope: formScopeTitle(submitted, targetTitleOf(submitted), messages),
          cidr,
          irreversible: false,
          globalRemoval: target !== 'new' && removesGlobalAllow(target.cidr, cidr),
          view: snapshot,
        },
        messages,
      )
      let attempted = false
      let conflicted = false
      const send = (ctx: IpWriteContext): Promise<unknown> => {
        // 🔴 확인 순간에 다시 본다 — 창이 열린 사이 권한이 회수됐으면 보내지 않는다(스펙 §4-3 · 3e D10).
        //    attempted 가 거짓으로 남아 아래에서 false — 패널 · onDone 을 건드리지 않는다
        if (!options.canManage()) return Promise.resolve(undefined)
        attempted = true
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
      if (ok) {
        // ⑦ 🔴 만들기는 재조회가 반영되지 않아도 닫는다 — 채운 폼을 남기면 같은 규칙을 또 만든다(useRoleEditor R8)
        setEditor(null)
        if (snapshot.state !== 'ready') pushAlert('warning', messages.savedWithoutPreview)
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
            messages.revisionConflict(ruleScopeTitle(fresh, messages), fresh.cidr),
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
          scope: ruleScopeTitle(rule, messages),
          cidr: rule.cidr,
          irreversible: reauth,
          globalRemoval: removesGlobalAllow(rule.cidr, null),
          view: snapshot,
        },
        messages,
      )
      let attempted = false
      let conflicted = false
      const send = (ctx: IpWriteContext): Promise<unknown> => {
        // 🔴 확인 순간에 다시 본다(저장과 같음)
        if (!options.canManage()) return Promise.resolve(undefined)
        attempted = true
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
      if (ok) {
        await options.onDone?.({ action: 'remove', rule })
        return true
      }
      if (conflicted && applied) {
        const fresh = findRule(rule.ruleNo)
        pushAlert(
          'warning',
          fresh == null
            ? messages.ruleGone
            : messages.revisionConflict(ruleScopeTitle(fresh, messages), fresh.cidr),
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
    if (deleting != null) return removesGlobalAllow(deleting.cidr, null)
    const current = editing.value
    return (
      current !== null &&
      current !== 'new' &&
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
    scopeItems,
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
