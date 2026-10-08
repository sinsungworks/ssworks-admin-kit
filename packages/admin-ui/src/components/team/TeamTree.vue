<script setup lang="ts">
  import { computed, nextTick, ref, shallowRef, watch } from 'vue'
  import {
    VAlert,
    VBtn,
    VList,
    VListItem,
    VMenu,
    VProgressLinear,
    VTextField,
  } from 'vuetify/components'
  import { Draggable } from '@he-tree/vue'
  import {
    filterTeamTree,
    findTeamPlacement,
    flattenTeamTree,
    moveTargets,
    siblingMove,
    sortTeamTree,
    type AdminTeamMove,
    type AdminTeamNode,
    type TeamPlacement,
  } from '@ssworks/admin-shared'
  import PanelLayout from '../ui/PanelLayout.vue'
  import TeamNameInput from './TeamNameInput.vue'
  import {
    DEFAULT_TEAM_TREE_MESSAGES,
    HE_TREE_I18N,
    type TeamAction,
    type TeamCommitSource,
    type TeamEdit,
    type TeamEditTarget,
    type TeamMoveSource,
    type TeamTreeMessages,
  } from './team-tree.js'

  // 팀 트리 — 표시와 이벤트만. 서버를 모른다(조회 · 쓰기 · 확인은 `useTeamTree`).
  //
  // 정본: hangang-home apps/admin/src/components/org/TeamTree.vue(emit 전용 · 두 겹 잠금 · 선택은 읽기 · 부모 포함 검색)
  //       + ssworks-axion-admin packages/frontend/src/components/team/TeamTree.vue · TeamTreeNode.vue(he-tree 드래그 ·
  //       드롭 시점 좌표 · 편집 중 검색 끔 · 입력칸 `@keydown.stop`)
  // 바꾼 점:
  //  - VList 평탄화 대신 he-tree `Draggable` 로 그린다(3d ① R1) — 접기 · 펼치기와 `role="tree"` · `aria-level` 이 따라온다.
  //    드래그는 `draggable` 로 켠다(기본 꺼짐 = hangang 동작: ↑↓ 버튼, 형제 순서만).
  //  - 만들기 · 이름 바꾸기는 노드 안 입력칸(3d ⑦). 입력칸 상태(`edit`)는 부모가 가진다.
  //  - 행마다 ↑↓ + ⋮ 메뉴(하위 팀 추가 · 이름 바꾸기 · 옮기기 · 삭제). 접근 이름에 팀 이름을 넣는다 — hangang 은 모든
  //    행의 버튼이 같은 라벨이었다. `data-team-*` 속성을 버렸다(테스트는 접근 이름 · `aria-level` 로 찾는다).
  //  - 첫째의 ↑ · 막내의 ↓ 는 비활성(hangang 은 눌러도 아무 일이 없었다).
  //
  // 🔴 이 컴포넌트는 서버를 안 부른다. 잠금은 화면이 버튼을 못 누르게 하는 선까지이고, 요청의 성공 · 실패 · 재조회는
  //    전부 부르는 쪽이 진다(hangang).
  // 🔴 `nodes` 를 고치지 않는다. he-tree 는 끌어 놓을 때 받은 배열을 제자리에서 바꾼다 — 정렬한 내부 사본을 넘기고,
  //    원위치는 사본을 `nodes` 에서 다시 만드는 것이다(스펙 D2).

  const props = withDefaults(
    defineProps<{
      nodes: readonly AdminTeamNode[]
      canWrite?: boolean
      busy?: boolean
      loading?: boolean
      loadFailed?: boolean
      draggable?: boolean
      /**
       * 행의 ↑↓(형제 순서) 버튼. 기본 true. 끄면 형제 순서는 드래그로만 바뀐다 — 🔴 키보드로는 바꿀 길이 없어진다
       * (Alt+화살표는 막혀 있고 옮기기는 상위 팀 아래 맨 끝으로만 보낸다, 3d R13).
       */
      showOrderButtons?: boolean
      /** 최상위 사이에 놓기 · 최상위 초안 행 */
      topLevel?: boolean
      /** 메서드 꼴(bivariant). 기본은 모두 허용 */
      canAct?(node: AdminTeamNode, action: TeamAction): boolean
      edit?: TeamEdit | null
      /** 바뀌면 내부 사본을 `nodes` 에서 다시 만든다 — 드래그 원위치 신호 */
      resetKey?: number
      messages?: Partial<TeamTreeMessages>
    }>(),
    {
      // 🔴 권한 가드 fail-closed 규약 — 바인딩 없이 쓰면 잠겨 있다
      canWrite: false,
      busy: false,
      loading: false,
      loadFailed: false,
      draggable: false,
      showOrderButtons: true,
      topLevel: false,
      canAct: undefined,
      edit: null,
      resetKey: 0,
      messages: () => ({}),
    },
  )

  const selected = defineModel<bigint | null>({ default: null })

  const emit = defineEmits<{
    move: [move: AdminTeamMove, source: TeamMoveSource]
    reparent: [teamNo: bigint]
    remove: [teamNo: bigint]
    'edit-start': [target: TeamEditTarget]
    'edit-input': [name: string]
    'edit-commit': [source: TeamCommitSource]
    'edit-cancel': []
    reload: []
  }>()

  defineSlots<{
    badge?(props: { node: AdminTeamNode }): unknown
  }>()

  const text = computed<TeamTreeMessages>(() => ({
    ...DEFAULT_TEAM_TREE_MESSAGES,
    ...props.messages,
  }))
  const inputLabels = computed(() => ({
    input: text.value.nameInput,
    save: text.value.save,
    cancel: text.value.cancel,
  }))

  // ── 판정 ──────────────────────────────────────────────────────────

  /** 검색으로 가지가 잘린 사본이 아니라 원래 팀을 `canAct` 에 넘기려고 — 번호로 되짚는다 */
  const nodeByNo = computed(() => {
    const map = new Map<bigint, AdminTeamNode>()
    const walk = (list: readonly AdminTeamNode[]): void =>
      list.forEach((node) => {
        map.set(node.teamNo, node)
        walk(node.children)
      })
    walk(props.nodes)
    return map
  })
  const allowed = (node: AdminTeamNode, action: TeamAction): boolean =>
    props.canAct?.(nodeByNo.value.get(node.teamNo) ?? node, action) ?? true
  /** 🔴 쓰기 잠금 — 버튼의 `:disabled` 와 핸들러 첫 줄이 같이 본다(hangang 두 겹 방어 — `:disabled` 는 마우스만 막는다) */
  const locked = computed(() => !props.canWrite || props.busy || props.edit != null)
  const query = ref<string | null>('')
  const searchText = computed(() => (query.value ?? '').trim())
  /** 🔴 검색 중에는 순서를 못 바꾼다 — 걸러진 화면에서 숨은 형제와 자리가 바뀐다(스펙 D9) */
  const moveLocked = computed(() => locked.value || searchText.value !== '')
  const dragOn = computed(() => props.draggable && !moveLocked.value)
  /** 형제 경계 — ↑↓ 비활성 판정 */
  const rowByNo = computed(
    () => new Map(flattenTeamTree(props.nodes).map((row) => [row.teamNo, row])),
  )

  function hasSibling(node: AdminTeamNode, direction: 'up' | 'down'): boolean {
    const row = rowByNo.value.get(node.teamNo)
    return direction === 'up' ? row?.prevSiblingTeamNo != null : row?.nextSiblingTeamNo != null
  }

  function canReparent(node: AdminTeamNode): boolean {
    if (!allowed(node, 'move')) return false
    return (
      moveTargets(props.nodes, node.teamNo, {
        topLevel: props.topLevel,
        canReceive: (target) => allowed(target, 'addChild'),
      }).length > 0
    )
  }

  // ── 내부 사본 ─────────────────────────────────────────────────────

  interface TeamItem {
    team: AdminTeamNode
    children: TreeItem[]
  }
  interface DraftItem {
    draft: true
    children: TreeItem[]
  }
  type TreeItem = TeamItem | DraftItem
  /** he-tree 의 노드 상태 중 여기서 쓰는 것만 — `@he-tree/tree-utils` 의 `Stat` 을 들이지 않는다(스펙 D14) */
  interface HeStat {
    data: TreeItem
    parent: HeStat | null
    children: HeStat[]
    open: boolean
  }

  const isDraft = (item: TreeItem): item is DraftItem => 'draft' in item
  /** he-tree 자리 표시(`placeholderData`)는 팀도 초안도 아니다 */
  const isTeamItem = (item: TreeItem): item is TeamItem => 'team' in item

  function buildItems(
    nodes: readonly AdminTeamNode[],
    draftParent: bigint | null | undefined,
  ): TreeItem[] {
    return nodes.map((team) => {
      const children = buildItems(team.children, draftParent)
      if (draftParent === team.teamNo) children.push({ draft: true, children: [] })
      return { team, children }
    })
  }

  function toNodes(items: readonly TreeItem[]): AdminTeamNode[] {
    return items.flatMap((item) =>
      isDraft(item) ? [] : [{ ...item.team, children: toNodes(item.children) }],
    )
  }

  const items = shallowRef<TreeItem[]>([])
  /** 🔴 접은 팀 번호 — he-tree 는 배열이 바뀌면 펼침을 처음으로 되돌린다. 재조회 · 원위치 뒤에도 접힌 채 두려고 여기서 기억한다(스펙 D3) */
  const closed = new Set<bigint>()
  const body = ref<HTMLElement | null>(null)
  /** 입력칸을 열 때 · 다시 그린 뒤 쓰던 사람에게 포커스를 돌려줄 때 */
  const focusInput = ref<false | 'select' | 'end'>(false)

  const editKey = computed(() => {
    const edit = props.edit
    if (edit == null) return ''
    return edit.kind === 'rename' ? `rename:${edit.teamNo}` : `create:${edit.parentTeamNo ?? 'top'}`
  })

  function rebuild(): void {
    const edit = props.edit
    const draftParent = edit?.kind === 'create' ? edit.parentTeamNo : undefined
    // 초안 행이 접힌 가지에 숨지 않게 — 상위 팀부터 맨 위 조상까지 모두 펼친다
    let at: bigint | null = draftParent ?? null
    while (at != null) {
      closed.delete(at)
      at = rowByNo.value.get(at)?.parentTeamNo ?? null
    }
    const base =
      searchText.value === ''
        ? sortTeamTree(props.nodes)
        : filterTeamTree(props.nodes, searchText.value)
    const next = buildItems(base, draftParent)
    if (draftParent === null) next.push({ draft: true, children: [] })
    items.value = next
  }

  /** ↑↓ 로 옮긴 직후 — 재조회가 오면 포커스를 그 팀의 버튼으로 돌려준다 */
  let pendingFocus: { teamNo: bigint; direction: 'up' | 'down' } | null = null

  /** ↑↓ 뒤 재조회가 오면 옮긴 팀의 같은 방향 버튼으로(가장자리라 꺼졌으면 반대 방향, 그것도 꺼졌으면 그 팀의 행으로) */
  function restoreFocus(): void {
    const target = pendingFocus
    pendingFocus = null
    const root = body.value
    const name = target == null ? undefined : rowByNo.value.get(target.teamNo)?.teamName
    if (target == null || root == null || name == null) return
    const labelOf = (direction: 'up' | 'down') =>
      direction === 'up' ? text.value.up(name) : text.value.down(name)
    const find = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.getAttribute('aria-label') === label,
      )
    const other = target.direction === 'up' ? 'down' : 'up'
    for (const direction of [target.direction, other] as const) {
      const button = find(labelOf(direction))
      if (button != null && !button.disabled) {
        button.focus()
        return
      }
    }
    find(labelOf(target.direction))?.closest<HTMLElement>('[role="treeitem"]')?.focus()
  }

  watch(
    () => [props.nodes, searchText.value, props.resetKey, editKey.value] as const,
    (current, previous) => {
      const key = current[3]
      if (pendingFocus != null && current[0] !== previous?.[0]) void nextTick(restoreFocus)
      if (key !== '' && key !== previous?.[3]) {
        focusInput.value = props.edit?.kind === 'rename' ? 'select' : 'end'
      } else if (
        body.value?.contains(document.activeElement) === true &&
        document.activeElement?.matches('input[name="teamName"]') === true
      ) {
        // 다시 그리면 입력칸이 새로 생길 수 있다 — 쓰던 사람의 포커스를 돌려준다
        focusInput.value = 'end'
      }
      rebuild()
    },
    { immediate: true },
  )

  /**
   * 🔴 행이 순서 번호가 아니라 팀을 따라가야 재조회 뒤 포커스 · 열린 메뉴가 옆 팀으로 넘어가지 않는다.
   * 🔴 he-tree 는 끄는 동안 자기 자리 표시(`placeholderData`, 빈 객체)를 목록에 끼워 이 함수에 넘긴다 — 팀으로 읽으면
   *    던지고, 렌더가 멈춰 자리 표시가 안 보인다(브라우저 확인에서 발견).
   */
  const nodeKeyOf = (stat: HeStat): string => {
    if (isDraft(stat.data)) return 'draft'
    return isTeamItem(stat.data) ? String(stat.data.team.teamNo) : 'drag-placeholder'
  }

  function statHandler<S extends HeStat>(stat: S): S {
    const item = stat.data
    stat.open = isDraft(item) || searchText.value !== '' || !closed.has(item.team.teamNo)
    return stat
  }

  function remember(stat: HeStat): void {
    if (isDraft(stat.data) || searchText.value !== '') return
    if (stat.open) closed.delete(stat.data.team.teamNo)
    else closed.add(stat.data.team.teamNo)
  }

  function toggle(stat: HeStat): void {
    stat.open = !stat.open
    remember(stat)
  }

  const isRenaming = (item: TreeItem): boolean =>
    !isDraft(item) && props.edit?.kind === 'rename' && props.edit.teamNo === item.team.teamNo

  // ── 이벤트 ────────────────────────────────────────────────────────

  function onClickNode(stat: HeStat): void {
    // 선택은 읽기 동작이다 — canWrite · busy 로 막지 않는다(hangang)
    if (isDraft(stat.data)) return
    selected.value = stat.data.team.teamNo
  }

  function onMove(node: AdminTeamNode, direction: 'up' | 'down'): void {
    if (moveLocked.value || !allowed(node, 'move')) return
    const move = siblingMove(props.nodes, node.teamNo, direction)
    if (move == null) return
    const active = document.activeElement
    pendingFocus =
      active?.closest('.team-tree__acts') != null ? { teamNo: node.teamNo, direction } : null
    emit('move', move, 'button')
  }

  function onAddChild(node: AdminTeamNode): void {
    if (locked.value || !allowed(node, 'addChild')) return
    emit('edit-start', { kind: 'create', parentTeamNo: node.teamNo })
  }

  function onRename(node: AdminTeamNode): void {
    if (locked.value || !allowed(node, 'rename')) return
    emit('edit-start', { kind: 'rename', teamNo: node.teamNo })
  }

  function onReparent(node: AdminTeamNode): void {
    if (locked.value || !canReparent(node)) return
    emit('reparent', node.teamNo)
  }

  function onRemove(node: AdminTeamNode): void {
    if (locked.value || !allowed(node, 'remove')) return
    emit('remove', node.teamNo)
  }

  // ── 드래그 ────────────────────────────────────────────────────────

  let dragging: ({ teamNo: bigint } & TeamPlacement) | null = null
  /**
   * 끄는 팀 — he-tree 가 놓일 자리에 끼우는 자리 표시 안에 그 행을 옅게 그린다(미리보기). he-tree 는 끄는 동안 원래 행을
   * 숨기므로 무엇이 어디로 가는지가 이 한 줄에 보인다. 드래그가 끝나면 자리 표시가 사라지므로 비우지 않아도 남지 않는다.
   */
  const ghost = shallowRef<AdminTeamNode | null>(null)

  function onBeforeDragStart(stat: HeStat): void {
    if (isDraft(stat.data)) return
    ghost.value = stat.data.team
    const teamNo = stat.data.team.teamNo
    const from = findTeamPlacement(toNodes(items.value), teamNo)
    dragging = from == null ? null : { teamNo, ...from }
  }

  const eachDraggable = (stat: HeStat): boolean =>
    !isDraft(stat.data) && allowed(stat.data.team, 'move')

  /** 그 팀 아래로 넣을 수 있는가 — 같은 상위 팀 안의 순서 바꾸기는 하위 팀 추가 허용과 무관하다 */
  const eachDroppable = (stat: HeStat): boolean => {
    if (isDraft(stat.data)) return false
    if (dragging != null && stat.data.team.teamNo === dragging.parentTeamNo) return true
    return allowed(stat.data.team, 'addChild')
  }

  const rootDroppable = (): boolean => props.topLevel || dragging?.parentTeamNo === null

  function onChange(): void {
    const from = dragging
    dragging = null
    if (from == null) return
    const to = findTeamPlacement(toNodes(items.value), from.teamNo)
    if (to == null) return
    // 🔴 제자리면 아무것도 내지 않는다 — axion 은 `after-drop` 을 써서 제자리 드롭에도 확인창을 띄웠다(스펙 D8)
    if (to.parentTeamNo === from.parentTeamNo && to.beforeTeamNo === from.beforeTeamNo) return
    emit('move', { teamNo: from.teamNo, ...to }, 'drag')
  }

  /**
   * 🔴 he-tree 의 Alt+화살표 이동은 확인과 "못 옮기는 팀" 잠금을 건너뛴다 — 캡처 단계에서 가로챈다(스펙 D7).
   *    he-tree 의 Alt+화살표 이동은 드래그가 켜졌을 때만 동작한다 — 꺼져 있으면 브라우저의 Alt+←/→(뒤로 · 앞으로)를 막지 않는다.
   */
  function onKeydownCapture(event: KeyboardEvent): void {
    if (!dragOn.value) return
    if (!event.altKey || !event.key.startsWith('Arrow')) return
    if ((event.target as HTMLElement | null)?.closest('input') != null) return
    event.preventDefault()
    event.stopPropagation()
  }
</script>

<template>
  <PanelLayout class="team-tree" scrollable>
    <template #top>
      <div class="team-tree__top">
        <VTextField
          v-model="query"
          autocomplete="off"
          clearable
          density="compact"
          :disabled="edit != null"
          hide-details
          :label="text.searchLabel"
          name="teamSearch"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
        />
      </div>
      <VProgressLinear v-if="loading" color="primary" indeterminate />
      <VAlert
        v-if="loadFailed && nodes.length > 0"
        class="team-tree__alert"
        density="compact"
        type="error"
        variant="tonal"
      >
        {{ text.loadFailed }}
        <template #append>
          <VBtn size="small" variant="text" @click="emit('reload')">{{ text.retry }}</VBtn>
        </template>
      </VAlert>
    </template>

    <div ref="body" class="team-tree__body" @keydown.capture="onKeydownCapture">
      <div v-if="loadFailed && nodes.length === 0" class="team-tree__empty" role="alert">
        <span>{{ text.loadFailed }}</span>
        <VBtn size="small" variant="text" @click="emit('reload')">{{ text.retry }}</VBtn>
      </div>
      <div v-else-if="items.length === 0 && !loading" class="team-tree__empty">
        {{ searchText === '' ? text.empty : text.noResult }}
      </div>
      <Draggable
        v-else
        :aria-label="text.treeLabel"
        :disable-drag="!dragOn"
        :disable-drop="!dragOn"
        :each-draggable="eachDraggable"
        :each-droppable="eachDroppable"
        :i18n="HE_TREE_I18N"
        :indent="20"
        :model-value="items"
        :node-key="nodeKeyOf"
        :root-droppable="rootDroppable"
        :stat-handler="statHandler"
        tree-line
        :tree-line-offset="10"
        @before-drag-start="onBeforeDragStart"
        @change="onChange"
        @click:node="onClickNode"
        @close:node="remember"
        @open:node="remember"
      >
        <!-- 놓일 자리 미리보기 — 끄는 팀의 행을 옅게. 버튼은 없고, 위치는 he-tree 의 화면 낭독기 안내가 알리므로 숨긴다 -->
        <template #placeholder>
          <div v-if="ghost" aria-hidden="true" class="team-tree__row team-tree__row--ghost">
            <span v-if="ghost.children.length > 0" class="team-tree__gap team-tree__mark">▸</span>
            <span v-else class="team-tree__gap" />
            <span class="team-tree__name">{{ ghost.teamName }}</span>
            <slot name="badge" :node="ghost" />
          </div>
        </template>
        <template #default="{ node: item, stat }">
          <div v-if="isDraft(item)" class="team-tree__row team-tree__row--draft">
            <span class="team-tree__gap" />
            <TeamNameInput
              v-if="edit"
              :error="edit.error"
              :focus="focusInput"
              :labels="inputLabels"
              :name="edit.name"
              :pending="edit.pending"
              @cancel="emit('edit-cancel')"
              @commit="emit('edit-commit', $event)"
              @focused="focusInput = false"
              @input="emit('edit-input', $event)"
            />
          </div>
          <div
            v-else
            class="team-tree__row"
            :class="{ 'team-tree__row--selected': item.team.teamNo === selected }"
          >
            <button
              v-if="stat.children.length > 0"
              :aria-expanded="stat.open"
              :aria-label="text.toggle(item.team.teamName, stat.open)"
              class="team-tree__toggle"
              tabindex="-1"
              type="button"
              @click.stop="toggle(stat)"
            >
              <span aria-hidden="true">{{ stat.open ? '▾' : '▸' }}</span>
            </button>
            <span v-else class="team-tree__gap" />
            <TeamNameInput
              v-if="edit && isRenaming(item)"
              :error="edit.error"
              :focus="focusInput"
              :labels="inputLabels"
              :name="edit.name"
              :pending="edit.pending"
              @cancel="emit('edit-cancel')"
              @commit="emit('edit-commit', $event)"
              @focused="focusInput = false"
              @input="emit('edit-input', $event)"
            />
            <template v-else>
              <span class="team-tree__name">{{ item.team.teamName }}</span>
              <slot name="badge" :node="item.team" />
              <!-- 🔴 버튼의 클릭 · 키는 트리로 올리지 않는다 — 누른 버튼이 선택까지 바꾸면 두 가지 일을 한 것으로 읽히고(hangang),
                   he-tree 루트가 Enter · Space 를 가로채면 버튼이 키보드로 안 눌린다(스펙 D6) -->
              <span class="team-tree__acts" @click.stop @keydown.stop>
                <template v-if="showOrderButtons">
                  <VBtn
                    :aria-label="text.up(item.team.teamName)"
                    :disabled="
                      moveLocked || !allowed(item.team, 'move') || !hasSibling(item.team, 'up')
                    "
                    icon="mdi-arrow-up"
                    size="x-small"
                    variant="text"
                    @click="onMove(item.team, 'up')"
                  />
                  <VBtn
                    :aria-label="text.down(item.team.teamName)"
                    :disabled="
                      moveLocked || !allowed(item.team, 'move') || !hasSibling(item.team, 'down')
                    "
                    icon="mdi-arrow-down"
                    size="x-small"
                    variant="text"
                    @click="onMove(item.team, 'down')"
                  />
                </template>
                <VMenu location="bottom end">
                  <template #activator="{ props: activator }">
                    <VBtn
                      v-bind="activator"
                      :aria-label="text.menu(item.team.teamName)"
                      :disabled="locked"
                      icon="mdi-dots-vertical"
                      size="x-small"
                      variant="text"
                    />
                  </template>
                  <VList density="compact">
                    <VListItem
                      :disabled="!allowed(item.team, 'addChild')"
                      :title="text.addChild"
                      @click="onAddChild(item.team)"
                    />
                    <VListItem
                      :disabled="!allowed(item.team, 'rename')"
                      :title="text.rename"
                      @click="onRename(item.team)"
                    />
                    <VListItem
                      :disabled="!canReparent(item.team)"
                      :title="text.reparent"
                      @click="onReparent(item.team)"
                    />
                    <VListItem
                      base-color="error"
                      :disabled="!allowed(item.team, 'remove')"
                      :title="text.remove"
                      @click="onRemove(item.team)"
                    />
                  </VList>
                </VMenu>
              </span>
            </template>
          </div>
        </template>
      </Draggable>
    </div>
  </PanelLayout>
</template>

<style scoped>
  .team-tree__top {
    padding: 12px 12px 8px;
  }

  .team-tree__alert {
    margin: 0 12px 8px;
  }

  .team-tree__body {
    padding: 4px 0 12px;
  }

  .team-tree__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 16px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .team-tree__row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 36px;
    padding-right: 8px;
    border-radius: 4px;
  }

  .team-tree__row--selected {
    background: rgba(var(--v-theme-primary), 0.12);
  }

  .team-tree__row--selected .team-tree__name {
    font-weight: 600;
    color: rgb(var(--v-theme-primary));
  }

  .team-tree__toggle,
  .team-tree__gap {
    flex: none;
    width: 22px;
    height: 22px;
  }

  .team-tree__toggle {
    padding: 0;
    color: inherit;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: 4px;
  }

  .team-tree__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .team-tree__acts {
    display: flex;
    flex: none;
    gap: 2px;
    margin-left: auto;
  }

  /* he-tree 기본 CSS 중 필요한 것 — 소비자가 he-tree CSS 를 import 하지 않게 여기로 옮겼다(스펙 D15). 색은 Vuetify 토큰. */
  .team-tree__body :deep(.tree-node--with-tree-line) {
    position: relative;
  }

  .team-tree__body :deep(.tree-line) {
    position: absolute;
    background-color: rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .team-tree__body :deep(.tree-vline) {
    top: 0;
    bottom: 0;
    width: 1px;
  }

  .team-tree__body :deep(.tree-hline) {
    top: 50%;
    width: 10px;
    height: 1px;
  }

  .team-tree__body :deep(.tree-node:focus-visible) {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }

  /* 자리 표시 높이는 실제 행(36px)에 맞춘다 — 끄는 동안 줄 높이가 덜 출렁인다 */
  .team-tree__body :deep(.he-tree-drag-placeholder) {
    box-sizing: border-box;
    width: 100%;
    min-height: 36px;
    background: rgba(var(--v-theme-primary), 0.08);
    border: 1px dashed rgb(var(--v-theme-primary));
    border-radius: 4px;
  }

  .team-tree__row--ghost {
    min-height: 34px;
    opacity: 0.45;
    pointer-events: none;
  }

  .team-tree__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .team-tree__body :deep(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  @media (forced-colors: active) {
    .team-tree__body :deep(.tree-node:focus-visible) {
      outline-color: Highlight;
    }

    .team-tree__body :deep(.tree-line) {
      background-color: CanvasText;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .team-tree__body :deep(.he-tree),
    .team-tree__body :deep(.he-tree *) {
      transition: none !important;
    }
  }
</style>
