import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import {
  TEAM_NAME_MAX_LENGTH,
  flattenTeamTree,
  moveTargets,
  type AdminTeamCreate,
  type AdminTeamMove,
  type AdminTeamNode,
  type AdminTeamRename,
  type TeamMoveTarget,
  type TeamTreeRow,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { toFieldErrors } from '../api/field-errors.js'
import type {
  TeamAction,
  TeamCommitSource,
  TeamEdit,
  TeamEditTarget,
  TeamMoveSource,
} from '../components/team/team-tree.js'
import { useWriteFlow, type ConfirmDialogBindings } from './useWriteFlow.js'

// 팀 트리의 조회 · 쓰기 흐름 — `TeamTree` · `TeamMoveDialog` · `ConfirmDialog` 에 `v-bind` 할 바인딩을 낸다.
//
// 정본: hangang-home apps/admin/src/pages/org/teams.vue(응답 경합 · 쓰기 한 곳 · 실패해도 재조회 · 삭제 뒤 선택 해제 ·
//       재인증 없음) + ssworks-axion-admin packages/frontend/src/components/team/TeamTree.vue(드래그 이동 확인 · 원위치)
// 바꾼 점:
//  ① 페이지에 흩어진 상태를 composable 하나로. 확인 관문은 3a `useWriteFlow` 를 쓴다.
//  ② 동작은 어댑터에 준 것만 생긴다(3c ④-A1 과 같은 규칙, 3d 스펙 D12).
//  ③ 드래그 확인은 상위 팀이 바뀔 때만(3d ③). 취소 · 실패면 `resetKey` 를 올려 트리가 놓기 전 모양으로 돌아간다 —
//     axion 은 트리를 서버에서 다시 읽어 펼침이 처음으로 돌아갔다.
//  ④ 만들기 · 이름 바꾸기는 노드 안 입력칸(3d ⑦) — 그 상태(`edit`)를 여기서 가진다. 실패 문구는 입력칸 아래(D11).
//  ⑤ 성공 문구는 `onDone` 으로 화면에 맡긴다(기본 문구를 실어 준다). hangang 의 `VAlert` 알림을 버렸다.
//  ⑥ 재인증 · revision 은 없다 — 세 곳 모두 팀 쓰기에 없다.

export type TeamDoneAction = 'create' | 'rename' | 'remove' | 'move' | 'reparent'

export interface TeamDoneEvent {
  action: TeamDoneAction
  /** create 응답에 번호가 없으면 null */
  teamNo: bigint | null
  teamName: string
  /** 기본 문구 — 화면이 그대로 토스트로 띄우면 된다 */
  message: string
}

export interface TeamDialogText {
  title: string
  message: string
  confirmLabel: string
}

export interface TeamMessages {
  created: (teamName: string) => string
  renamed: (teamName: string) => string
  removed: (teamName: string) => string
  moved: (teamName: string) => string
  reparented: (teamName: string, parentTeamName: string | null) => string
  removeConfirm: (teamName: string, descendantCount: number) => TeamDialogText
  moveConfirm: (teamName: string, parentTeamName: string | null) => TeamDialogText
  nameRequired: string
  nameTooLong: (max: number) => string
  saveFailed: string
}

export interface UseTeamTreeOptions {
  load: () => Promise<readonly AdminTeamNode[]>
  create?: (body: AdminTeamCreate) => Promise<unknown>
  rename?: (teamNo: bigint, body: AdminTeamRename) => Promise<unknown>
  remove?: (teamNo: bigint) => Promise<unknown>
  move?: (move: AdminTeamMove) => Promise<unknown>
  /** 게터 — 호출 시점마다 평가한다(3c §11 R6). 기본 `() => true` */
  canWrite?: () => boolean
  canAct?: (node: AdminTeamNode, action: TeamAction) => boolean
  /** 최상위 만들기 · 옮기기 · 사이 놓기. 기본 false */
  topLevel?: boolean
  onDone?: (event: TeamDoneEvent) => void | Promise<void>
  messages?: Partial<TeamMessages>
  /** 기본 true */
  immediate?: boolean
}

/** `<TeamTree v-bind="tree" />` — props 와 리스너 이름은 컴포넌트 그대로 */
export interface TeamTreeBindings {
  nodes: readonly AdminTeamNode[]
  modelValue: bigint | null
  'onUpdate:modelValue': (teamNo: bigint | null) => void
  canWrite: boolean
  busy: boolean
  loading: boolean
  loadFailed: boolean
  topLevel: boolean
  canAct: (node: AdminTeamNode, action: TeamAction) => boolean
  edit: TeamEdit | null
  resetKey: number
  onMove: (move: AdminTeamMove, source: TeamMoveSource) => void
  onReparent: (teamNo: bigint) => void
  onRemove: (teamNo: bigint) => void
  onEditStart: (target: TeamEditTarget) => void
  onEditInput: (name: string) => void
  onEditCommit: (source: TeamCommitSource) => void
  onEditCancel: () => void
  onReload: () => void
}

/** `<TeamMoveDialog v-bind="moveDialog" />` */
export interface TeamMoveDialogBindings {
  modelValue: boolean
  'onUpdate:modelValue': (open: boolean) => void
  teamName: string
  targets: readonly TeamMoveTarget[]
  submitting: boolean
  onConfirm: (parentTeamNo: bigint | null) => void
}

export interface TeamTreeController {
  nodes: Readonly<Ref<readonly AdminTeamNode[]>>
  rows: ComputedRef<TeamTreeRow[]>
  loading: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<unknown>>
  reload: () => Promise<void>
  /** 쓰기 가능 — 페이지가 바깥에서 고를 수도 있다 */
  selected: Ref<bigint | null>
  selectedRow: ComputedRef<TeamTreeRow | null>
  submitting: Readonly<Ref<boolean>>
  tree: ComputedRef<TeamTreeBindings>
  moveDialog: ComputedRef<TeamMoveDialogBindings>
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  /** 페이지의 "최상위 팀 추가" 버튼용(topLevel 일 때 null) */
  startCreate: (parentTeamNo: bigint | null) => void
}

const DEFAULT_MESSAGES: TeamMessages = {
  created: (teamName) => `「${teamName}」을(를) 만들었습니다.`,
  renamed: (teamName) => `팀 이름을 「${teamName}」(으)로 바꿨습니다.`,
  removed: (teamName) => `「${teamName}」을(를) 지웠습니다.`,
  moved: (teamName) => `「${teamName}」의 순서를 바꿨습니다.`,
  reparented: (teamName, parentTeamName) =>
    parentTeamName == null
      ? `「${teamName}」을(를) 최상위로 옮겼습니다.`
      : `「${teamName}」을(를) 「${parentTeamName}」 아래로 옮겼습니다.`,
  removeConfirm: (teamName, descendantCount) => ({
    title: '팀 삭제',
    message: `${
      descendantCount > 0
        ? `「${teamName}」과(와) 그 아래 팀 ${descendantCount}개를 함께 지웁니다.`
        : `「${teamName}」을(를) 지웁니다.`
    } 소속 계정이 있으면 지울 수 없습니다.`,
    confirmLabel: '삭제',
  }),
  moveConfirm: (teamName, parentTeamName) => ({
    title: '팀 옮기기',
    message: `「${teamName}」을(를) ${
      parentTeamName == null ? '최상위로' : `「${parentTeamName}」 아래로`
    } 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다.`,
    confirmLabel: '옮기기',
  }),
  nameRequired: '팀 이름을 입력하세요.',
  nameTooLong: (max) => `팀 이름은 ${max}자 이하로 정하세요.`,
  saveFailed: '저장하지 못했습니다.',
}

type Gate = { gate: 'none' } | { gate: 'confirm'; reversible: boolean; text: TeamDialogText }

function teamNoOf(result: unknown): bigint | null {
  if (result == null || typeof result !== 'object' || !('teamNo' in result)) return null
  const teamNo = (result as { teamNo?: unknown }).teamNo
  return typeof teamNo === 'bigint' ? teamNo : null
}

/** setup 안에서 부른다. 확인 다이얼로그는 반환된 `confirmDialog` 를 `<ConfirmDialog v-bind>` 로 붙인다. */
export function useTeamTree(options: UseTeamTreeOptions): TeamTreeController {
  const flow = useWriteFlow()
  const messages: TeamMessages = { ...DEFAULT_MESSAGES, ...options.messages }
  const canWrite = (): boolean => options.canWrite?.() ?? true
  const topLevel = options.topLevel ?? false

  // ── 조회 ──────────────────────────────────────────────────────────

  const nodes = shallowRef<readonly AdminTeamNode[]>([])
  const loading = ref(false)
  const loadError = shallowRef<unknown>(null)
  const selected = ref<bigint | null>(null)
  const edit = ref<TeamEdit | null>(null)
  const resetKey = ref(0)
  /** 🔴 응답 경합 — 쓰기 뒤 재조회와 첫 조회가 겹치면 먼저 보낸 느린 응답이 나중에 와서 이긴다(gise · hangang). */
  let loadSeq = 0

  const rows = computed(() => flattenTeamTree(nodes.value))
  const rowByNo = computed(() => new Map(rows.value.map((row) => [row.teamNo, row])))
  const nodeByNo = computed(() => {
    const map = new Map<bigint, AdminTeamNode>()
    const walk = (list: readonly AdminTeamNode[]): void =>
      list.forEach((node) => {
        map.set(node.teamNo, node)
        walk(node.children)
      })
    walk(nodes.value)
    return map
  })
  const selectedRow = computed(() =>
    selected.value == null ? null : (rowByNo.value.get(selected.value) ?? null),
  )

  /** 조회 뒤 정리 — 사라진 팀을 가리키는 선택 · 입력칸을 걷는다(스펙 §4-4-2 #2) */
  function tidy(): void {
    if (selected.value != null && !rowByNo.value.has(selected.value)) selected.value = null
    const current = edit.value
    if (current == null) return
    const target = current.kind === 'rename' ? current.teamNo : current.parentTeamNo
    if (target != null && !rowByNo.value.has(target)) edit.value = null
  }

  /** 이 호출의 결과가 적용됐을 때만 true — 늦은 응답으로 버려졌거나 실패면 false */
  async function load(): Promise<boolean> {
    const seq = ++loadSeq
    loading.value = true
    loadError.value = null
    try {
      const result = await options.load()
      if (seq !== loadSeq) return false
      nodes.value = result
      tidy()
      return true
    } catch (error) {
      if (seq !== loadSeq) return false
      // 트리는 그대로 둔다 — 화면이 마지막 성공 결과를 보인 채 위에 한 줄로 알린다
      loadError.value = error
      return false
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  async function reload(): Promise<void> {
    await load()
  }

  const busy = computed(() => loading.value || flow.submitting.value)

  // ── 판정 ──────────────────────────────────────────────────────────

  function hasAdapter(action: TeamAction): boolean {
    if (action === 'addChild') return options.create != null
    if (action === 'rename') return options.rename != null
    if (action === 'remove') return options.remove != null
    return options.move != null
  }

  function canAct(node: AdminTeamNode, action: TeamAction): boolean {
    return hasAdapter(action) && (options.canAct?.(node, action) ?? true)
  }

  // ── 쓰기 ──────────────────────────────────────────────────────────

  /** 결과와 함께 요청이 실제로 나갔는지(관문 취소 · 진행 중 막힘이 아닌지)를 돌려준다 — 재조회는 나갔을 때만(D10) */
  async function write(
    gate: Gate,
    action: () => Promise<unknown>,
  ): Promise<{ ok: boolean; attempted: boolean; result: unknown }> {
    let attempted = false
    let result: unknown
    const run = async () => {
      attempted = true
      result = await action()
    }
    const ok =
      gate.gate === 'confirm'
        ? await flow.run({
            gate: 'confirm',
            reversible: gate.reversible,
            title: gate.text.title,
            message: gate.text.message,
            confirmLabel: gate.text.confirmLabel,
            action: run,
          })
        : await flow.run({ action: run })
    return { ok, attempted, result }
  }

  async function done(
    action: TeamDoneAction,
    teamNo: bigint | null,
    teamName: string,
    message: string,
  ): Promise<void> {
    await options.onDone?.({ action, teamNo, teamName, message })
  }

  const parentNameOf = (teamNo: bigint | null): string | null =>
    teamNo == null ? null : (nodeByNo.value.get(teamNo)?.teamName ?? null)

  async function moveTeam(move: AdminTeamMove, source: TeamMoveSource): Promise<void> {
    const doMove = options.move
    const node = nodeByNo.value.get(move.teamNo)
    // 끌어 놓은 모양은 이미 바뀌었다 — 요청을 안 보내면 원위치시킨다
    const rollback = () => {
      if (source === 'drag') resetKey.value += 1
    }
    if (doMove == null || node == null || !canWrite() || !canAct(node, 'move')) return rollback()
    const reparent = (rowByNo.value.get(move.teamNo)?.parentTeamNo ?? null) !== move.parentTeamNo
    if (reparent) {
      // 받는 쪽도 다시 본다 — 하위 팀 추가와 같은 판정(addChild ↔ create)
      const parentNode = move.parentTeamNo == null ? null : nodeByNo.value.get(move.parentTeamNo)
      const receivable =
        move.parentTeamNo == null ? topLevel : parentNode != null && canAct(parentNode, 'addChild')
      if (!receivable) return rollback()
    }
    const parentName = parentNameOf(move.parentTeamNo)
    // 🔴 확인은 상위 팀이 바뀌는 드래그에만 — 하위 팀과 소속 인원이 통째로 다른 팀 밑으로 간다(3d ③)
    const gate: Gate =
      source === 'drag' && reparent
        ? {
            gate: 'confirm',
            reversible: true,
            text: messages.moveConfirm(node.teamName, parentName),
          }
        : { gate: 'none' }
    const { ok, attempted } = await write(gate, () => doMove(move))
    if (!attempted) return rollback()
    if (!ok) rollback()
    if (source === 'drag' && ok) {
      // 🔴 성공한 드래그 뒤 재조회가 실패하면 트리는 놓은 모양 그대로인데 판정 기준(nodes)은 옛 모양이다 — 맞춰 다시 그린다
      const applied = await load()
      if (!applied) resetKey.value += 1
    } else {
      await reload()
    }
    if (!ok) return
    await done(
      reparent ? 'reparent' : 'move',
      move.teamNo,
      node.teamName,
      reparent ? messages.reparented(node.teamName, parentName) : messages.moved(node.teamName),
    )
  }

  async function removeTeam(teamNo: bigint): Promise<void> {
    const doRemove = options.remove
    const node = nodeByNo.value.get(teamNo)
    if (doRemove == null || node == null || !canWrite() || !canAct(node, 'remove')) return
    const count = rowByNo.value.get(teamNo)?.descendantCount ?? 0
    const { ok, attempted } = await write(
      { gate: 'confirm', reversible: false, text: messages.removeConfirm(node.teamName, count) },
      () => doRemove(teamNo),
    )
    if (!attempted) return
    await reload()
    if (ok) await done('remove', teamNo, node.teamName, messages.removed(node.teamName))
  }

  // ── 옮기기 대화상자 ───────────────────────────────────────────────

  const moving = ref<bigint | null>(null)
  const moveOpen = ref(false)

  function openReparent(teamNo: bigint): void {
    const node = nodeByNo.value.get(teamNo)
    if (node == null || busy.value || !canWrite() || !canAct(node, 'move')) return
    moving.value = teamNo
    moveOpen.value = true
  }

  async function confirmReparent(parentTeamNo: bigint | null): Promise<void> {
    const teamNo = moving.value
    const doMove = options.move
    const node = teamNo == null ? undefined : nodeByNo.value.get(teamNo)
    if (teamNo == null || node == null || doMove == null || !canWrite()) return
    if (!canAct(node, 'move')) return
    const allowed = moveTargets(nodes.value, teamNo, {
      topLevel,
      canReceive: (target) => canAct(target, 'addChild'),
    }).map((target) => target.parentTeamNo)
    if (!allowed.includes(parentTeamNo)) return
    const move: AdminTeamMove = { teamNo, parentTeamNo, beforeTeamNo: null }
    const parentName = parentNameOf(parentTeamNo)
    const { ok, attempted } = await write({ gate: 'none' }, () => doMove(move))
    if (!attempted) return
    moveOpen.value = false
    await reload()
    if (ok)
      await done('reparent', teamNo, node.teamName, messages.reparented(node.teamName, parentName))
  }

  // ── 노드 안 입력칸 ────────────────────────────────────────────────

  function startEdit(target: TeamEditTarget): void {
    if (edit.value != null || busy.value || !canWrite()) return
    if (target.kind === 'rename') {
      const node = nodeByNo.value.get(target.teamNo)
      if (node == null || !canAct(node, 'rename')) return
      edit.value = {
        kind: 'rename',
        teamNo: target.teamNo,
        name: node.teamName,
        pending: false,
        error: null,
      }
      return
    }
    if (target.parentTeamNo == null) {
      if (!topLevel || options.create == null) return
    } else {
      const parent = nodeByNo.value.get(target.parentTeamNo)
      if (parent == null || !canAct(parent, 'addChild')) return
    }
    edit.value = {
      kind: 'create',
      parentTeamNo: target.parentTeamNo,
      name: '',
      pending: false,
      error: null,
    }
  }

  function inputEdit(name: string): void {
    if (edit.value != null && !edit.value.pending) edit.value.name = name
  }

  function cancelEdit(): void {
    if (edit.value != null && !edit.value.pending) edit.value = null
  }

  async function commitEdit(source: TeamCommitSource): Promise<void> {
    const current = edit.value
    if (current == null || current.pending) return
    const name = current.name.trim()
    if (current.kind === 'rename' && name === nodeByNo.value.get(current.teamNo)?.teamName) {
      edit.value = null
      return
    }
    if (name === '') {
      // 바깥 누르기 + 빈 이름은 "그만둔다" 로 읽는다 — Enter 는 저장하려는 뜻이라 문구로 알린다
      if (source === 'blur') edit.value = null
      else current.error = messages.nameRequired
      return
    }
    if (name.length > TEAM_NAME_MAX_LENGTH) {
      current.error = messages.nameTooLong(TEAM_NAME_MAX_LENGTH)
      return
    }
    if (!canWrite()) {
      edit.value = null
      return
    }
    // 열 때와 같은 판정을 저장 순간에 다시 본다
    let allowed: boolean
    if (current.kind === 'rename') {
      const node = nodeByNo.value.get(current.teamNo)
      allowed = node != null && canAct(node, 'rename')
    } else if (current.parentTeamNo == null) {
      allowed = topLevel && options.create != null
    } else {
      const parent = nodeByNo.value.get(current.parentTeamNo)
      allowed = parent != null && canAct(parent, 'addChild')
    }
    if (!allowed) {
      edit.value = null
      return
    }
    let call: (() => Promise<unknown>) | null = null
    if (current.kind === 'rename' && options.rename != null) {
      const rename = options.rename
      const teamNo = current.teamNo
      call = () => rename(teamNo, { teamName: name })
    } else if (current.kind === 'create' && options.create != null) {
      const create = options.create
      const parentTeamNo = current.parentTeamNo
      call = () => create({ teamName: name, parentTeamNo })
    }
    if (call == null) {
      edit.value = null
      return
    }
    const invoke = call

    current.pending = true
    current.error = null
    let failure: string | null = null
    try {
      const { ok, attempted, result } = await write({ gate: 'none' }, async () => {
        try {
          return await invoke()
        } catch (error) {
          // 🔴 입력칸 아래에 보인다 — 지연 전역 토스트보다 먼저(동기 구간에서) 처리됨으로 표시한다(3a 규약 · 스펙 D11)
          if (error instanceof ApiError) {
            error.handled = true
            failure = toFieldErrors(error).teamName?.[0] ?? (error.message || messages.saveFailed)
          }
          throw error
        }
      })
      current.pending = false
      // 다른 쓰기가 진행 중이었다 — 요청이 안 나갔으니 입력칸을 그대로 둔다
      if (!attempted) return
      if (!ok) {
        current.error = failure ?? messages.saveFailed
        await reload()
        return
      }
      edit.value = null
      await reload()
      if (current.kind === 'rename') {
        await done('rename', current.teamNo, name, messages.renamed(name))
      } else {
        await done('create', teamNoOf(result), name, messages.created(name))
      }
    } finally {
      current.pending = false
    }
  }

  // ── 바인딩 ────────────────────────────────────────────────────────

  const tree = computed<TeamTreeBindings>(() => ({
    nodes: nodes.value,
    modelValue: selected.value,
    'onUpdate:modelValue': (teamNo) => {
      selected.value = teamNo
    },
    canWrite: canWrite(),
    busy: busy.value,
    loading: loading.value,
    loadFailed: loadError.value != null,
    topLevel,
    canAct,
    edit: edit.value,
    resetKey: resetKey.value,
    onMove: (move, source) => {
      void moveTeam(move, source)
    },
    onReparent: openReparent,
    onRemove: (teamNo) => {
      void removeTeam(teamNo)
    },
    onEditStart: startEdit,
    onEditInput: inputEdit,
    onEditCommit: (source) => {
      void commitEdit(source)
    },
    onEditCancel: cancelEdit,
    onReload: () => {
      void reload()
    },
  }))

  const moveDialog = computed<TeamMoveDialogBindings>(() => {
    const teamNo = moving.value
    const node = teamNo == null ? undefined : nodeByNo.value.get(teamNo)
    return {
      modelValue: moveOpen.value,
      'onUpdate:modelValue': (open) => {
        if (!open && flow.submitting.value) return
        moveOpen.value = open
      },
      teamName: node?.teamName ?? '',
      targets:
        teamNo == null || node == null
          ? []
          : moveTargets(nodes.value, teamNo, {
              topLevel,
              canReceive: (target) => canAct(target, 'addChild'),
            }),
      submitting: flow.submitting.value,
      onConfirm: (parentTeamNo) => {
        void confirmReparent(parentTeamNo)
      },
    }
  })

  if (options.immediate !== false) void reload()

  return {
    nodes,
    rows,
    loading,
    loadError,
    reload,
    selected,
    selectedRow,
    submitting: flow.submitting,
    tree,
    moveDialog,
    confirmDialog: flow.confirmDialog,
    startCreate: (parentTeamNo) => startEdit({ kind: 'create', parentTeamNo }),
  }
}
