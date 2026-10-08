import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import {
  ALL_PERMISSION,
  coversPermissions,
  type AdminRole,
  type AdminRoleCreate,
  type AdminRoleMove,
  type AdminRoleRemove,
  type AdminRoleUpdate,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { useAdminUi } from '../context/admin-ui.js'
import {
  impliedClosure,
  orderedPermissions,
  samePermissionList,
  togglePermission,
  type ImpliesMap,
} from './role-permissions.js'
import {
  useWriteFlow,
  type ConfirmDialogBindings,
  type ReauthDialogBindings,
} from './useWriteFlow.js'

// 정본: hangang-home apps/admin/src/pages/settings/roles.vue(상태 · 규칙) · roles-messages.ts
//       + ssworks-gise-home 역할 편집의 권한 상승 방지(`coversPermissions` 로 칸 · 행 잠금)와 revision 충돌
// 바꾼 점:
//  ① 화면(2단 · 문구 · VAlert)을 버리고 상태 · 규칙만 headless 로 낸다. 배치는 템플릿(B)이 한다.
//  ② 재인증 고정을 `reauth` 옵션으로. 수정 · 삭제는 `revision` 을 늘 싣는다(3b 스펙 §2-1 — 필수, 끄는 경로 없음).
//  ③ 함의 표(액션 단위 `IMPLIED_BY`)를 `implies` 옵션(권한 키 단위 · 연쇄)으로.
//  ④ 권한 상승 방지를 더했다 — hangang 은 서버 판정만 있었다.
//  ⑤ 메시지 해석(`resolveRolesMessage`)을 버렸다 — 처리 안 된 실패는 `createApiClient` 의 전역 `onError` 가 서버
//     `message` 그대로 알린다. 성공 문구는 `save()` 등이 true 를 돌려주면 화면이 띄운다.
//  ⑥ `total` 잘림 안내를 버렸다 — 어댑터가 전량을 준다.
//  ⑦ 자기 직책 저장 뒤 `/me` 재조회 · 이동을 `onSelfRoleSaved` 훅으로.

export interface RoleWriteContext {
  /** `reauth: true` 일 때만 있다. 본문 · 헤더 중 어디에 실을지는 어댑터가 정한다. */
  currentPassword?: string
}

export interface RoleEditorApi<R extends AdminRole = AdminRole> {
  /**
   * 🔴 전량, `displayOrder` 오름차순. 쪽을 나누는 서버면 어댑터가 끝까지 받아 이어 붙인다 — hangang 은 서버 상한
   *    100건에 잘린 역할이 편집 · 삭제 · 이동 모두 도달 불가가 됐다.
   */
  list(): Promise<readonly R[]>
  /** 새 `roleNo` 를 돌려준다 — 만든 행을 선택하는 데 쓴다. */
  create(body: AdminRoleCreate, ctx: RoleWriteContext): Promise<bigint>
  update(roleNo: bigint, body: AdminRoleUpdate, ctx: RoleWriteContext): Promise<void>
  remove(roleNo: bigint, body: AdminRoleRemove, ctx: RoleWriteContext): Promise<void>
  /**
   * 🔴 재인증 없음 · revision 없음 — 순서는 내용이 아니다(3b 스펙 D1). hangang: 이동 본문에 비밀번호를 실으면 서버가
   *    조용히 떨궈 200 이라, 화면은 재인증했다고 믿는데 서버는 비밀번호를 본 적이 없다.
   */
  move(roleNo: bigint, body: AdminRoleMove): Promise<void>
}

export type RoleEditorAction = 'create' | 'update' | 'remove'

export interface RoleDialogText {
  title?: string
  message: string
}

export interface RoleEditorOptions<P extends string = string, R extends AdminRole = AdminRole> {
  api: RoleEditorApi<R>
  /** 정렬 순서이자 유효 키 목록. 보통 카탈로그의 `ALL_PERMISSION_VALUES`. `'*'` 는 걸러 낸다. */
  permissions: readonly P[]
  /** 쓰기 권한. 게터 — 호출 시점마다 평가한다. */
  canWrite: () => boolean
  /** `{ 'org.users:write': ['org.users:read'] }`. 연쇄를 펼친다. 끄는 방향은 여기서 유도한다. */
  implies?: Partial<Record<P, readonly P[]>>
  /** 기본 false. true 면 만들기 · 수정 · 삭제에 재인증 관문. 🔴 이동은 늘 관문 없음. */
  reauth?: boolean
  /** 기본 `useAdminUi().user()?.permissions ?? []`. */
  actorPermissions?: () => readonly string[]
  /** 기본 `user()?.roleName === role.roleName` — roleName 은 UNIQUE 전제(hangang). */
  isSelf?: (role: R) => boolean
  /** 자기 직책 **수정** 성공 뒤(재조회 · 재선택 뒤). 템플릿이 `store.refresh()` 와 권한 상실 시 이동을 한다. */
  onSelfRoleSaved?: () => void | Promise<void>
  /** 관문 다이얼로그 문구. 기본은 "역할" 용어(스펙 §4-4-3). */
  dialogText?: (action: RoleEditorAction, role: R | null) => RoleDialogText
  /**
   * 저장 폼이 그리는 필드 키. 이 키의 서버 검증 오류만 처리됨(전역 토스트 없음)이다. 기본 `['roleName']` — 폼이
   * `isDefault` · `permissions` 오류도 그리면 더한다.
   */
  fields?: readonly string[]
}

export interface RoleForm {
  roleName: string
  isDefault: boolean
  /** 🔴 전체 권한 — 매트릭스 행이 아니라 독립 스위치다. 켜면 정확히 `['*']` 만 보낸다. */
  isAll: boolean
  /** 매트릭스의 키들. 🔴 `'*'` 가 들어오는 길이 없다(`orderedPermissions`). */
  permissions: string[]
}

/** `<PermissionMatrix v-bind="matrix" :categories="…" />` */
export interface PermissionMatrixBindings {
  modelValue: string[]
  'onUpdate:modelValue': (value: string[]) => void
  permissions: readonly string[]
  disabled: boolean
  canPick: (permission: string) => boolean
}

export interface RoleEditor<R extends AdminRole = AdminRole> {
  roles: Readonly<Ref<readonly R[]>>
  loading: Readonly<Ref<boolean>>
  /** 마지막 목록 조회의 오류. 다음 조회 시작 때 비운다. */
  loadError: Readonly<Ref<unknown>>
  reload: () => Promise<void>

  /** 불러온 원본 스냅샷. `null` 이면 새 역할 모드. */
  selected: Readonly<Ref<R | null>>
  select: (role: R) => void
  startCreate: () => void

  form: Ref<RoleForm>
  matrix: ComputedRef<PermissionMatrixBindings>

  canToggleAll: ComputedRef<boolean>
  permissionsLocked: ComputedRef<boolean>
  isSelfRole: ComputedRef<boolean>
  isDirty: ComputedRef<boolean>
  conflicted: Readonly<Ref<boolean>>
  canSave: ComputedRef<boolean>
  canRemove: ComputedRef<boolean>
  canMove: (role: R, direction: 'up' | 'down') => boolean

  /** 성공 true · 취소 · 실패 · 막힘 false. */
  save: () => Promise<boolean>
  remove: () => Promise<boolean>
  move: (role: R, direction: 'up' | 'down') => Promise<boolean>

  submitting: Readonly<Ref<boolean>>
  fieldErrors: Readonly<Ref<Record<string, string[]>>>
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  reauthDialog: ComputedRef<ReauthDialogBindings>
}

/**
 * `fields` 를 안 줄 때 처리됨으로 볼 저장 검증 오류 키.
 * 🔴 headless 라 템플릿이 무엇을 그리는지 모른다 — 세 키를 박아 두면 `isDefault` · `permissions` 오류를 안 그리는
 *    템플릿에서 오류가 토스트도 필드 문구도 없이 사라진다(최종 리뷰). 확실히 그리는 이름 하나만 기본으로 둔다.
 */
const DEFAULT_SAVE_FIELDS = ['roleName'] as const

function defaultDialogText(action: RoleEditorAction, role: AdminRole | null): RoleDialogText {
  if (action === 'create') return { title: '역할 만들기', message: '새 역할을 만듭니다.' }
  // 🔴 원본(`selected`)의 이름이다 — 폼에서 고친 새 이름이 아니다.
  const name = role?.roleName ?? ''
  if (action === 'update') return { title: '역할 저장', message: `「${name}」 역할을 저장합니다.` }
  return { title: '역할 삭제', message: `「${name}」 역할을 삭제합니다.` }
}

function emptyForm(): RoleForm {
  return { roleName: '', isDefault: false, isAll: false, permissions: [] }
}

/** setup 안에서 부른다. 페이지당 하나 — 다이얼로그 둘과 매트릭스는 반환된 바인딩을 `v-bind` 로 붙인다. */
export function useRoleEditor<P extends string, R extends AdminRole = AdminRole>(
  options: RoleEditorOptions<P, R>,
): RoleEditor<R> {
  const { api } = options
  /** 🔴 매트릭스와 폼이 쓰는 카탈로그 — `'*'` 를 뺀다. 전체 권한은 행이 아니라 `form.isAll` 스위치다. */
  const catalog: readonly string[] = options.permissions.filter((key) => key !== ALL_PERMISSION)
  const implies: ImpliesMap = options.implies ?? {}
  const flow = useWriteFlow()

  // 기본값을 쓸 때만 컨텍스트를 찾는다 — 두 옵션을 다 주면 플러그인 없이도 쓸 수 있다.
  const ui = options.actorPermissions != null && options.isSelf != null ? null : useAdminUi()
  // 🔴 게터로 읽는다 — 값을 캐시하면 `refresh()` 뒤에도 옛 권한으로 판정한다.
  const actor = options.actorPermissions ?? (() => ui?.user()?.permissions ?? [])
  const isSelf =
    options.isSelf ??
    ((role: R) => {
      const name = ui?.user()?.roleName
      return name != null && name === role.roleName
    })

  const roles = shallowRef<readonly R[]>([])
  const loading = ref(false)
  const loadError = shallowRef<unknown>(null)
  /** 🔴 불러온 원본. 자기 직책 판정 · revision 은 폼이 아니라 이것으로 한다. */
  const selected: ShallowRef<R | null> = shallowRef(null)
  const form = ref<RoleForm>(emptyForm())
  /** 선택할 때의 전송값(`built()`). 수정 저장이 `permissions` 를 바뀐 경우에만 싣는 판정에 쓴다. */
  const snapshot = shallowRef<readonly string[]>([])
  const conflicted = ref(false)

  const busy = computed(() => loading.value || flow.submitting.value)

  /** 🔴 전체 권한이면 정확히 `['*']` 다 — 매트릭스 키를 함께 보내지 않는다(hangang). */
  function built(): string[] {
    return form.value.isAll ? [ALL_PERMISSION] : orderedPermissions(catalog, form.value.permissions)
  }

  function applySelection(role: R): void {
    selected.value = role
    form.value = {
      roleName: role.roleName,
      isDefault: role.isDefault,
      isAll: role.permissions.includes(ALL_PERMISSION),
      permissions: orderedPermissions(catalog, role.permissions),
    }
    snapshot.value = built()
  }

  function clearSelection(): void {
    selected.value = null
    form.value = emptyForm()
    snapshot.value = []
  }

  function resetFeedback(): void {
    flow.clearFieldErrors()
    conflicted.value = false
  }

  // ── 목록 ──────────────────────────────────────────────────────────

  /** 🔴 응답 경합 — 쓰기 뒤 재조회와 첫 조회가 겹치면 먼저 보낸 느린 응답이 나중에 도착해 이긴다(hangang). */
  let loadSeq = 0
  let loadedOnce = false

  /**
   * 이 호출의 결과가 `roles` 에 반영됐으면 true. 실패했거나 더 새 조회에 밀렸으면 false.
   * 🔴 쓰기 뒤 재선택은 이 값을 본다 — `roles` 가 쓰기 전 목록 그대로일 수 있다(스펙 §11 R8).
   */
  async function load(): Promise<boolean> {
    const seq = ++loadSeq
    loading.value = true
    loadError.value = null
    try {
      const items = await api.list()
      if (seq !== loadSeq) return false
      roles.value = items
      // 🔴 첫 조회가 성공하면 첫 행을 연다 — 오른쪽이 빈 첫 화면을 피한다(hangang).
      if (!loadedOnce) {
        loadedOnce = true
        const first = items[0]
        if (selected.value == null && first != null) applySelection(first)
      }
      return true
    } catch (error) {
      if (seq !== loadSeq) return false
      // 🔴 목록은 그대로 둔다 — 화면이 로딩 · 목록 · 실패 · 빈 목록 네 갈래를 가를 수 있게.
      loadError.value = error
      return false
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  async function reload(): Promise<void> {
    await load()
  }

  // ── 판정 ──────────────────────────────────────────────────────────

  const permissionsLocked = computed(
    () => selected.value != null && !coversPermissions(actor(), snapshot.value),
  )
  const canToggleAll = computed(
    () => options.canWrite() && !busy.value && actor().includes(ALL_PERMISSION),
  )
  const matrixDisabled = computed(
    () => !options.canWrite() || busy.value || form.value.isAll || permissionsLocked.value,
  )

  /** 🔴 켜면 함께 켜질 키까지 행위자가 가져야 한다 — 아니면 서버의 권한 상승 검사에 걸린다(gise). */
  function canPick(permission: string): boolean {
    return coversPermissions(actor(), [permission, ...impliedClosure(implies, permission)])
  }

  /**
   * 🔴 매트릭스는 칸 하나만 더하거나 뺀 원본을 낸다. 옛 값과 대조해 바뀐 키 하나를 찾아 함의를 값에 써 넣는다
   *    (hangang §7-2 "표시만 하지 말라" — 화면은 부여됐다 하고 저장소는 없다고 하면 안 된다).
   */
  function onMatrixUpdate(next: string[]): void {
    if (matrixDisabled.value) return
    const before = form.value.permissions
    const added = next.find((key) => !before.includes(key))
    const removed = before.find((key) => !next.includes(key))
    const changed = added ?? removed
    if (changed == null || !canPick(changed)) return
    form.value.permissions = togglePermission(catalog, implies, before, changed, added != null)
  }

  const matrix = computed<PermissionMatrixBindings>(() => ({
    // 🔴 전체 권한이면 카탈로그 전체를 넘겨 체크된 채 잠가 보인다. `form.permissions` 는 건드리지 않는다 — 끄면
    //    이전 값이 돌아온다.
    modelValue: form.value.isAll ? [...catalog] : form.value.permissions,
    'onUpdate:modelValue': onMatrixUpdate,
    permissions: catalog,
    disabled: matrixDisabled.value,
    canPick,
  }))

  /** 🔴 폼이 아니라 불러온 원본으로 판정한다 — 폼에서 이름을 고치는 순간 경고가 사라지면 안 된다(hangang §1-4). */
  const isSelfRole = computed(() => selected.value != null && isSelf(selected.value))

  const isDirty = computed(() => {
    const name = form.value.roleName.trim()
    const current = built()
    const role = selected.value
    if (role == null) return name !== '' || form.value.isDefault || current.length > 0
    return (
      name !== role.roleName ||
      form.value.isDefault !== role.isDefault ||
      !samePermissionList(current, snapshot.value)
    )
  })

  /** 🔴 빈 이름 · 변경 없는 저장을 버튼 단계에서 막는다 — hangang 은 둘 다 서버 400 이었다. */
  const canSave = computed(
    () =>
      options.canWrite() &&
      !busy.value &&
      !conflicted.value &&
      form.value.roleName.trim() !== '' &&
      (selected.value == null || isDirty.value),
  )
  const canRemove = computed(() => options.canWrite() && !busy.value && selected.value != null)

  /** 🔴 `indexOf` 가 아니라 `roleNo` 로 찾는다 — 슬롯이 넘기는 행이 `roles` 의 원본 참조라는 보장이 없다(hangang). */
  function neighborOf(role: R, direction: 'up' | 'down'): R | undefined {
    const index = roles.value.findIndex((candidate) => candidate.roleNo === role.roleNo)
    if (index < 0) return undefined
    return roles.value[direction === 'up' ? index - 1 : index + 1]
  }

  function canMove(role: R, direction: 'up' | 'down'): boolean {
    return options.canWrite() && !busy.value && neighborOf(role, direction) != null
  }

  // ── 선택 ──────────────────────────────────────────────────────────

  /**
   * 🔴 선택은 읽기 동작이다 — `canWrite` 로 막지 않는다. 요청이 나가 있는 동안(`submitting`)은 무시한다. 뒤따르는
   *    재조회 중에 한 선택은 받아들인다 — save · remove 가 선택이 그대로일 때만 재선택해 되돌리지 않는다.
   */
  function select(role: R): void {
    if (flow.submitting.value) return
    applySelection(role)
    resetFeedback()
  }

  function startCreate(): void {
    if (!options.canWrite() || busy.value) return
    clearSelection()
    resetFeedback()
  }

  // ── 쓰기 ──────────────────────────────────────────────────────────

  interface WriteStep<T> {
    gate: 'none' | 'confirm' | 'reauth'
    text: RoleDialogText
    action: (ctx: RoleWriteContext) => Promise<T>
    onSuccess?: (result: T) => void
    onConflict?: () => void
    fields?: readonly string[]
  }

  /** 결과와 함께 요청이 실제로 나갔는지(관문 취소가 아닌지)를 돌려준다 — 재조회는 나갔을 때만 한다. */
  async function write<T>(step: WriteStep<T>): Promise<{ ok: boolean; attempted: boolean }> {
    let attempted = false
    const action = (ctx: RoleWriteContext): Promise<T> => {
      attempted = true
      return step.action(ctx)
    }
    const common = { onSuccess: step.onSuccess, onConflict: step.onConflict, fields: step.fields }
    let ok: boolean
    if (step.gate === 'reauth') {
      ok = await flow.run({ gate: 'reauth', ...step.text, ...common, action: (ctx) => action(ctx) })
    } else if (step.gate === 'confirm') {
      // 🔴 이 composable 의 확인 관문은 삭제뿐이다 — 지운 역할을 되살릴 길이 없다.
      ok = await flow.run({
        gate: 'confirm',
        reversible: false,
        ...step.text,
        ...common,
        action: () => action({}),
      })
    } else {
      ok = await flow.run({ ...common, action: () => action({}) })
    }
    return { ok, attempted }
  }

  function dialogText(action: RoleEditorAction, role: R | null): RoleDialogText {
    return options.dialogText?.(action, role) ?? defaultDialogText(action, role)
  }

  function markConflicted(): void {
    conflicted.value = true
  }

  async function save(): Promise<boolean> {
    if (!canSave.value) return false
    const role = selected.value
    // 🔴 요청 전에 잡아 둔다 — 재조회 뒤에는 원본이 바뀐다.
    const wasSelf = isSelfRole.value
    const roleName = form.value.roleName.trim()
    const isDefault = form.value.isDefault
    const permissions = built()
    // 🔴 `permissions` 는 바뀐 경우에만 싣는다. 늘 실으면 서버의 권한 상승 검사가 바뀌었는지와 무관하게 보낸 배열
    //    전부를 행위자와 대조해, 범위 밖 권한을 가진 역할은 이름조차 못 고친다(hangang `samePermissionSet`).
    const permissionsChanged = !samePermissionList(permissions, snapshot.value)
    let createdRoleNo: bigint | null = null
    const { ok, attempted } = await write<bigint | void>({
      gate: options.reauth ? 'reauth' : 'none',
      text: dialogText(role == null ? 'create' : 'update', role),
      fields: options.fields ?? DEFAULT_SAVE_FIELDS,
      onConflict: markConflicted,
      action: (ctx) =>
        role == null
          ? api.create({ roleName, isDefault, permissions }, ctx)
          : api.update(
              role.roleNo,
              {
                roleName,
                isDefault,
                revision: role.revision,
                ...(permissionsChanged ? { permissions } : {}),
              },
              ctx,
            ),
      onSuccess: (result) => {
        if (typeof result === 'bigint') createdRoleNo = result
      },
    })
    if (!attempted) return false
    // 🔴 실패해도 다시 조회한다 — 404 는 "목록이 낡았다", 409 는 "상태가 갈렸다" 이다(hangang).
    const applied = await load()
    // 🔴 실패면 선택 · 폼을 그대로 둔다 — 관리자가 고친 값을 잃지 않는다.
    if (!ok) return false
    // 🔴 자기 직책을 저장해 그 역할의 읽기 권한을 잃으면 재조회가 403 이다. 곧 `onSelfRoleSaved` 가 화면을 옮기는 정상
    //    경로라 처리됨으로 표시한다 — 안 하면 "권한 없음" 오류 토스트가 저장 성공 직후 깜빡인다(스펙 §11 R11).
    //    `catch` 와 같은 마이크로태스크 사슬 안이라 지연 전역 토스트보다 먼저다(3a D3).
    if (!applied && role != null && wasSelf) {
      const error = loadError.value
      if (error instanceof ApiError && error.status === 403) error.handled = true
    }
    // 🔴 재조회 중에 사용자가 다른 행을 골랐으면 아무것도 하지 않는다 — 재조회 중의 클릭은 사용자의 선택이고, 쓰기가
    //    그것을 되돌려서는 안 된다(스펙 §4-4-2 #3). 저장은 성공했으니 아래 훅은 어디에 있든 부른다.
    if (selected.value === role) {
      if (applied) {
        const targetRoleNo = role == null ? createdRoleNo : role.roleNo
        const next = roles.value.find((item) => item.roleNo === targetRoleNo)
        if (next != null) applySelection(next)
        else if (role == null) clearSelection()
      } else if (role == null) {
        // 🔴 재조회가 반영되지 않았다(실패 · 더 새 조회에 밀림) — 만든 행을 찾을 목록이 없다. 채운 "새 역할" 폼을
        //    남기면 한 번 더 눌러 같은 역할을 또 만든다. 선택을 비운다(스펙 §11 R8).
        clearSelection()
        resetFeedback()
      } else {
        // 🔴 수정인데 재조회가 반영되지 않았으면 폼을 그대로 둔다 — 옛 목록으로 재선택하면 방금 저장한 값이 화면에서
        //    되돌아간다(스펙 §11 R8). 다만 비교 기준은 방금 저장한 값으로 맞춘다 — 안 맞추면 저장한 화면이 "변경 있음"
        //    으로 남아 이탈 확인이 오탐한다(§11 R11). revision 은 옛 값 그대로 둔다 — 다시 고쳐 저장하면 409 와
        //    conflicted 배너가 뜬다. 재조회가 들어올 때까지는 그것이 정직한 결과다(R8).
        selected.value = { ...role, roleName, isDefault, permissions } as R
        snapshot.value = permissions
      }
    }
    if (role != null && wasSelf) await options.onSelfRoleSaved?.()
    return true
  }

  async function remove(): Promise<boolean> {
    const role = selected.value
    if (!canRemove.value || role == null) return false
    const { ok, attempted } = await write({
      // 🔴 재인증이면 그 다이얼로그 하나로 — 문구가 확인을 겸한다. 아니면 되돌릴 수 없다는 확인.
      gate: options.reauth ? 'reauth' : 'confirm',
      text: dialogText('remove', role),
      onConflict: markConflicted,
      action: (ctx) => api.remove(role.roleNo, { revision: role.revision }, ctx),
    })
    if (!attempted) return false
    // 🔴 목록에서 지우는 것은 서버 성공 뒤의 재조회다 — 화면이 먼저 지우지 않는다(hangang §7-2 ④).
    const applied = await load()
    if (!ok) return false
    // 🔴 재조회 중에 다른 행을 골랐으면 첫 행으로 뛰지 않는다 — 그 클릭이 이미 피드백을 비웠고, 삭제가 사용자의
    //    선택을 되돌려서는 안 된다(스펙 §4-4-2 #3).
    if (selected.value !== role) return true
    if (!applied) {
      // 🔴 재조회가 반영되지 않았다 — `roles` 는 지운 행이 남은 옛 목록이다. 거기서 고르면 지운 역할(또는 낡은
      //    revision 의 행)이 다시 열린다. 선택을 비운다(스펙 §11 R8).
      clearSelection()
      resetFeedback()
      return true
    }
    const first = roles.value[0]
    if (first != null) applySelection(first)
    else clearSelection()
    resetFeedback()
    return true
  }

  async function move(role: R, direction: 'up' | 'down'): Promise<boolean> {
    // 🔴 이웃 없는 경계(맨 위 · 막내)도 여기서 요청 없이 끝난다.
    const neighbor = neighborOf(role, direction)
    if (!canMove(role, direction) || neighbor == null) return false
    // 🔴 목표값은 「내 순서 ± 1」이 아니라 이웃 행의 `displayOrder` 다. 서버가 구간 재번호라 ±1 은 구멍(삭제가
    //    재번호를 안 한다)이 있으면 200 을 받고도 한 줄도 안 움직인다(hangang).
    const displayOrder = neighbor.displayOrder
    const { ok, attempted } = await write({
      gate: 'none',
      text: { message: '' },
      action: () => api.move(role.roleNo, { displayOrder }),
    })
    if (attempted) await reload()
    return ok
  }

  void reload()

  return {
    roles,
    loading,
    loadError,
    reload,
    selected,
    select,
    startCreate,
    form,
    matrix,
    canToggleAll,
    permissionsLocked,
    isSelfRole,
    isDirty,
    conflicted,
    canSave,
    canRemove,
    canMove,
    save,
    remove,
    move,
    submitting: flow.submitting,
    fieldErrors: flow.fieldErrors,
    confirmDialog: flow.confirmDialog,
    reauthDialog: flow.reauthDialog,
  }
}
