// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Component } from 'vue'
import { VBtn } from 'vuetify/components'
import { Draggable } from '@he-tree/vue'
import type { AdminTeamNode } from '@ssworks/admin-shared'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import TeamTree from './TeamTree.vue'
import type { TeamEdit } from './team-tree.js'

// 정본: hangang-home apps/admin/src/components/org/team-tree.render.test.ts(평탄화 순서 · 두 겹 잠금 · 부모 포함 검색)
//       — 깊이는 `data-team-depth` 대신 he-tree 의 `aria-level` 로, 버튼은 팀 이름이 든 접근 이름으로 찾는다.

installVisualViewport()

const n = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  children: AdminTeamNode[] = [],
): AdminTeamNode => ({ teamNo: BigInt(teamNo), teamName, displayOrder, children })

/** 서버가 형제를 뒤집어 보낸 모양 — 정렬해서 그려야 한다 */
const TREE = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [
    n(3, '관리본부', 5, [n(7, '인사팀', 0)]),
    n(2, '영업본부', 0, [n(6, '분당지점', 9), n(4, '강남지점', 0), n(5, '판교지점', 5)]),
  ]),
]
const ALL = ['한강투자그룹', '영업본부', '강남지점', '판교지점', '분당지점', '관리본부', '인사팀']

const renaming = (over: Partial<Extract<TeamEdit, { kind: 'rename' }>> = {}): TeamEdit => ({
  kind: 'rename',
  teamNo: 5n,
  name: '판교지점',
  pending: false,
  error: null,
  ...over,
})
const creating = (parentTeamNo: bigint | null): TeamEdit => ({
  kind: 'create',
  parentTeamNo,
  name: '',
  pending: false,
  error: null,
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  wrapper = mount(TeamTree as Component, {
    attachTo: document.body,
    props: { nodes: TREE(), canWrite: true, ...props },
    slots,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

const names = () =>
  [...document.querySelectorAll('.team-tree__name')].map((e) => (e.textContent ?? '').trim())
const levels = () =>
  [...document.querySelectorAll('[role="treeitem"]')].map((e) => e.getAttribute('aria-level'))
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const input = () => document.querySelector<HTMLInputElement>('input[name="teamName"]')
const nameEl = (team: string) =>
  [...document.querySelectorAll<HTMLElement>('.team-tree__name')].find(
    (e) => (e.textContent ?? '').trim() === team,
  )!
const treeItemOf = (team: string) => nameEl(team).closest<HTMLElement>('[role="treeitem"]')!

async function openMenu(team: string) {
  button(`「${team}」 메뉴`)!.click()
  await flushPromises()
  await nextTick()
}
const menuItem = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('.v-overlay--active .v-list-item')].find(
    (e) => (e.textContent ?? '').trim() === title,
  )

function key(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

interface HeStatLike {
  data: { team?: AdminTeamNode; draft?: true }
}
interface HeTreeVm {
  statsFlat: HeStatLike[]
  move(stat: HeStatLike, parent: HeStatLike | null, index: number): boolean
  add(data: unknown): HeStatLike
  getStat(data: unknown): HeStatLike
  ignoreUpdate(fn: () => void): void
  placeholderData: unknown
}

/** he-tree 의 끌어 놓기를 흉내 낸다 — 인스턴스 move() 는 change 를 내지 않아(Task 1 계약) 직접 내보낸다 */
async function dragTo(team: string, parent: string, index: number) {
  const tree = wrapper!.findComponent(Draggable)
  const vm = tree.vm as unknown as HeTreeVm
  const stat = (name: string) => vm.statsFlat.find((s) => s.data.team?.teamName === name)!
  tree.vm.$emit('before-drag-start', stat(team))
  vm.move(stat(team), stat(parent), index)
  tree.vm.$emit('change')
  await flushPromises()
}

/** 끄는 중 놓을 자리 위 — he-tree 가 dragover 에서 하는 그대로 자리 표시를 끼워 그 자리로 옮긴다(놓지는 않는다) */
async function hoverAt(team: string, parent: string, index: number) {
  const tree = wrapper!.findComponent(Draggable)
  const vm = tree.vm as unknown as HeTreeVm
  const stat = (name: string) => vm.statsFlat.find((s) => s.data.team?.teamName === name)!
  tree.vm.$emit('before-drag-start', stat(team))
  vm.ignoreUpdate(() => {
    vm.add(vm.placeholderData)
    vm.move(vm.getStat(vm.placeholderData), stat(parent), index)
  })
  await flushPromises()
}
const placeholder = () => document.querySelector<HTMLElement>('.he-tree-drag-placeholder')

describe('TeamTree — 그리기', () => {
  it('displayOrder 로 정렬해 깊이 우선으로 그리고, 깊이는 aria-level 로 잰다', async () => {
    await setup()
    expect(names()).toEqual(ALL)
    expect(levels()).toEqual(['1', '2', '3', '3', '3', '2', '3'])
    expect(document.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('팀 트리')
  })

  it('🔴 nodes 를 고치지 않는다(D2)', async () => {
    const nodes = TREE()
    const before = structuredClone(nodes)
    await setup({ nodes, draggable: true })
    await dragTo('판교지점', '관리본부', 0)
    expect(nodes).toEqual(before)
  })

  it('행을 누르면 고른다 — 잠겨 있어도(선택은 읽기 동작)', async () => {
    await setup({ canWrite: false, busy: true })
    nameEl('판교지점').click()
    await flushPromises()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[5n]])
  })

  it('고른 행에 표시가 붙는다', async () => {
    await setup({ modelValue: 5n })
    expect(
      document.querySelector('.team-tree__row--selected .team-tree__name')?.textContent?.trim(),
    ).toBe('판교지점')
  })

  it('#badge 슬롯이 이름 옆에 그려진다', async () => {
    await setup(
      {},
      {
        badge: ({ node }: { node: AdminTeamNode }) =>
          node.teamNo === 2n ? h('span', { class: 'chip' }, '본부') : null,
      },
    )
    expect([...document.querySelectorAll('.chip')].map((e) => e.textContent)).toEqual(['본부'])
  })
})

describe('TeamTree — 잠금 · 버튼 · 메뉴', () => {
  it('↑↓ 는 형제 순서 이동을 낸다', async () => {
    await setup()
    button('「판교지점」 위로')!.click()
    button('「판교지점」 아래로')!.click()
    expect(wrapper!.emitted('move')).toEqual([
      [{ teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'button'],
      [{ teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: null }, 'button'],
    ])
  })

  it('첫째의 ↑ · 막내의 ↓ · 하나뿐인 루트는 비활성', async () => {
    await setup()
    expect(button('「강남지점」 위로')!.disabled).toBe(true)
    expect(button('「분당지점」 아래로')!.disabled).toBe(true)
    expect(button('「한강투자그룹」 위로')!.disabled).toBe(true)
    expect(button('「강남지점」 아래로')!.disabled).toBe(false)
  })

  it('🔴 canWrite 가 거짓이면 쓰기 버튼이 잠기고, 비활성을 우회해 눌러도 아무것도 안 낸다', async () => {
    await setup({ canWrite: false })
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
    expect(button('「판교지점」 메뉴')!.disabled).toBe(true)
    const up = wrapper!
      .findAllComponents(VBtn)
      .find((b) => b.attributes('aria-label') === '「판교지점」 위로')!
    up.vm.$emit('click', new MouseEvent('click'))
    await flushPromises()
    expect(wrapper!.emitted('move')).toBeUndefined()
  })

  it('busy 도 같은 잠금이다', async () => {
    await setup({ busy: true })
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
    expect(button('「판교지점」 메뉴')!.disabled).toBe(true)
  })

  it.each([
    ['하위 팀 추가', 'edit-start', [{ kind: 'create', parentTeamNo: 5n }]],
    ['이름 바꾸기', 'edit-start', [{ kind: 'rename', teamNo: 5n }]],
    ['옮기기', 'reparent', [5n]],
    ['삭제', 'remove', [5n]],
  ] as const)('메뉴 「%s」 가 %s 를 낸다', async (title, event, payload) => {
    await setup()
    await openMenu('판교지점')
    menuItem(title)!.click()
    await flushPromises()
    expect(wrapper!.emitted(event)).toEqual([payload])
  })

  it('canAct 가 거짓인 동작은 비활성이다', async () => {
    await setup({
      canAct: (node: AdminTeamNode, action: string) => !(node.teamNo === 5n && action === 'move'),
    })
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
    expect(button('「강남지점」 아래로')!.disabled).toBe(false)
    await openMenu('판교지점')
    expect(menuItem('옮기기')!.classList.contains('v-list-item--disabled')).toBe(true)
    expect(menuItem('이름 바꾸기')!.classList.contains('v-list-item--disabled')).toBe(false)
  })

  it('🔴 ↑↓ 뒤 재조회가 와도 포커스는 옮긴 팀의 버튼에 남는다 — 옆 팀 버튼이 되지 않는다', async () => {
    await setup()
    const up = button('「판교지점」 위로')!
    up.focus()
    up.click()
    const moved: AdminTeamNode[] = [
      n(1, '한강투자그룹', 0, [
        n(3, '관리본부', 5, [n(7, '인사팀', 0)]),
        n(2, '영업본부', 0, [n(6, '분당지점', 9), n(4, '강남지점', 1), n(5, '판교지점', 0)]),
      ]),
    ]
    await wrapper!.setProps({ nodes: moved })
    await flushPromises()
    // 판교지점이 맨 위가 되어 ↑ 는 꺼졌다 — 같은 팀의 ↓ 로
    expect(document.activeElement?.getAttribute('aria-label')).toBe('「판교지점」 아래로')
  })

  it('canAct 는 검색으로 가지가 잘린 사본이 아니라 원래 팀을 받는다', async () => {
    await setup({
      canAct: (node: AdminTeamNode, action: string) =>
        !(action === 'remove' && node.children.length > 0),
    })
    await wrapper!.find('input[name="teamSearch"]').setValue('영업')
    await flushPromises()
    await openMenu('영업본부')
    expect(menuItem('삭제')!.classList.contains('v-list-item--disabled')).toBe(true)
  })

  it('옮겨 갈 상위 팀이 없으면 옮기기가 비활성이다', async () => {
    await setup({ nodes: [n(1, '본사', 0)] })
    await openMenu('본사')
    expect(menuItem('옮기기')!.classList.contains('v-list-item--disabled')).toBe(true)
  })
})

describe('TeamTree — 검색 · 펼침', () => {
  it('일치한 팀과 그 조상만 보인다', async () => {
    await setup()
    await wrapper!.find('input[name="teamSearch"]').setValue('판교')
    await flushPromises()
    expect(names()).toEqual(['한강투자그룹', '영업본부', '판교지점'])
  })

  it('🔴 검색 중에는 ↑↓ 가 잠긴다 — 숨은 형제와 자리가 바뀐다(D9)', async () => {
    await setup()
    await wrapper!.find('input[name="teamSearch"]').setValue('지점')
    await flushPromises()
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
    expect(button('「판교지점」 메뉴')!.disabled).toBe(false)
  })

  it('결과가 없으면 문구, 검색어를 지우면 전체로', async () => {
    await setup()
    const search = wrapper!.find('input[name="teamSearch"]')
    await search.setValue('없는팀')
    await flushPromises()
    expect(document.body.textContent).toContain('검색 결과가 없습니다.')
    await search.setValue('')
    await flushPromises()
    expect(names()).toEqual(ALL)
  })

  it('🔴 접은 팀은 nodes 가 새로 와도 · resetKey 가 바뀌어도 접혀 있다(D3)', async () => {
    await setup()
    button('「영업본부」 접기')!.click()
    await flushPromises()
    expect(names()).toEqual(['한강투자그룹', '영업본부', '관리본부', '인사팀'])
    await wrapper!.setProps({ nodes: TREE() })
    await flushPromises()
    expect(names()).toEqual(['한강투자그룹', '영업본부', '관리본부', '인사팀'])
    await wrapper!.setProps({ resetKey: 1 })
    await flushPromises()
    expect(names()).toEqual(['한강투자그룹', '영업본부', '관리본부', '인사팀'])
    expect(button('「영업본부」 펼치기')).not.toBeNull()
  })
})

describe('TeamTree — 조회 상태', () => {
  it('트리가 비었는데 조회가 실패했으면 그 자리에 문구와 다시 시도', async () => {
    await setup({ nodes: [], loadFailed: true })
    expect(document.body.textContent).toContain('팀을 불러오지 못했습니다.')
    buttonByText('다시 시도')!.click()
    expect(wrapper!.emitted('reload')).toHaveLength(1)
  })

  it('트리가 있는데 재조회가 실패했으면 트리는 두고 위에 한 줄', async () => {
    await setup({ loadFailed: true })
    expect(names()).toEqual(ALL)
    expect(document.querySelector('.team-tree__alert')?.textContent).toContain(
      '팀을 불러오지 못했습니다.',
    )
  })

  it('팀이 없으면 문구', async () => {
    await setup({ nodes: [] })
    expect(document.body.textContent).toContain('팀이 없습니다.')
  })
})

describe('TeamTree — 노드 안 입력칸', () => {
  it('이름 바꾸기 — 그 행 이름 자리에 입력칸이 열리고 포커스', async () => {
    await setup({ edit: renaming() })
    expect(input()!.value).toBe('판교지점')
    expect(document.activeElement).toBe(input())
    expect(names()).not.toContain('판교지점')
  })

  it('하위 팀 추가 — 접혀 있던 상위 팀을 펼치고 맨 끝에 초안 행', async () => {
    await setup()
    button('「영업본부」 접기')!.click()
    await flushPromises()
    await wrapper!.setProps({ edit: creating(2n) })
    await flushPromises()
    const items = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    const draft = items.findIndex((e) => e.querySelector('input[name="teamName"]') != null)
    expect(items[draft - 1]!.textContent).toContain('분당지점')
    expect(items[draft]!.getAttribute('aria-level')).toBe('3')
    expect(document.activeElement).toBe(input())
  })

  it('입력은 edit-input 으로 올린다', async () => {
    await setup({ edit: renaming() })
    await wrapper!.find('input[name="teamName"]').setValue('판교')
    expect(wrapper!.emitted('edit-input')?.at(-1)).toEqual(['판교'])
  })

  it('Enter · ✓ · 바깥 누르기는 저장 — 출처와 함께', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await setup({ edit: renaming() })
    key(input()!, { key: 'Enter' })
    button('저장')!.click()
    input()!.dispatchEvent(new FocusEvent('blur'))
    expect(wrapper!.emitted('edit-commit')).toEqual([['enter'], ['button'], ['blur']])
  })

  it('🔴 ✕ 는 누르는 순간 포커스를 빼앗지 않고, 취소만 낸다(D5)', async () => {
    await setup({ edit: renaming() })
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    button('취소')!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    button('취소')!.click()
    expect(wrapper!.emitted('edit-cancel')).toHaveLength(1)
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('🔴 Esc 로 취소한 뒤의 포커스 빠짐은 저장이 아니다(D5)', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await setup({ edit: renaming() })
    key(input()!, { key: 'Escape' })
    input()!.dispatchEvent(new FocusEvent('blur'))
    expect(wrapper!.emitted('edit-cancel')).toHaveLength(1)
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('🔴 창 전환으로 포커스를 잃으면 저장하지 않는다(D5)', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await setup({ edit: renaming() })
    input()!.dispatchEvent(new FocusEvent('blur'))
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('🔴 한글 조합 중 Enter 는 저장이 아니다', async () => {
    await setup({ edit: renaming() })
    key(input()!, { key: 'Enter', isComposing: true })
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('저장 중이면 읽기 전용 · ✓ ✕ 비활성 · 바깥 누르기도 저장 안 함', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await setup({ edit: renaming({ pending: true }) })
    expect(input()!.readOnly).toBe(true)
    expect(button('저장')!.disabled).toBe(true)
    expect(button('취소')!.disabled).toBe(true)
    input()!.dispatchEvent(new FocusEvent('blur'))
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('🔴 재조회로 형제가 끼어들어도 입력칸은 그대로 — 글자 · 오류 · 포커스가 남고 저장이 새로 나가지 않는다', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await setup({ edit: renaming({ name: '판교2', error: '이미 같은 이름의 팀이 있습니다.' }) })
    const old = input()!
    // 판교지점 앞에 형제가 생겨도 행이 팀을 따라가므로 입력칸은 제자리에서 고쳐진다
    const shifted = TREE()
    shifted[0]!.children[1]!.children.push(n(8, '가산지점', 3))
    await wrapper!.setProps({ nodes: shifted })
    await flushPromises()
    expect(input()).toBe(old)
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
    expect(input()!.value).toBe('판교2')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      '이미 같은 이름의 팀이 있습니다.',
    )
    expect(document.activeElement).toBe(input())
  })

  it('🔴 저장 중에는 Esc · Enter 를 받지 않는다 — 실패 뒤 바깥 누르기는 다시 저장한다', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await setup({ edit: renaming({ pending: true }) })
    key(input()!, { key: 'Escape' })
    key(input()!, { key: 'Enter' })
    expect(wrapper!.emitted('edit-cancel')).toBeUndefined()
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
    await wrapper!.setProps({
      edit: renaming({ pending: false, error: '이미 같은 이름의 팀이 있습니다.' }),
    })
    input()!.dispatchEvent(new FocusEvent('blur'))
    expect(wrapper!.emitted('edit-commit')).toEqual([['blur']])
  })

  it('✓ · ✕ 는 Tab 순서에 없고, 입력칸 묶음 안을 눌러도 포커스가 입력칸에 남으며 키는 트리로 가지 않는다', async () => {
    await setup({ edit: renaming() })
    expect(button('저장')!.getAttribute('tabindex')).toBe('-1')
    expect(button('취소')!.getAttribute('tabindex')).toBe('-1')
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.querySelector('.team-name-input__count')!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    const onInput = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    input()!.dispatchEvent(onInput)
    expect(onInput.defaultPrevented).toBe(false)
    const space = key(button('저장')!, { key: ' ' })
    expect(space.defaultPrevented).toBe(false)
    expect(wrapper!.emitted('update:modelValue')).toBeUndefined()
  })

  it('🔴 입력칸의 Space 는 트리로 올라가지 않는다 — he-tree 가 가로채면 공백이 안 먹는다(D6)', async () => {
    await setup({ edit: renaming() })
    const event = key(input()!, { key: ' ' })
    expect(event.defaultPrevented).toBe(false)
    expect(wrapper!.emitted('update:modelValue')).toBeUndefined()
  })

  it('입력칸이 열려 있으면 다른 쓰기 버튼이 잠긴다', async () => {
    await setup({ edit: renaming() })
    expect(button('「강남지점」 아래로')!.disabled).toBe(true)
    expect(button('「강남지점」 메뉴')!.disabled).toBe(true)
  })

  it('입력칸이 열려 있으면 검색이 잠긴다 — 걸러진 화면이 열린 입력칸을 가리지 않게', async () => {
    await setup({ edit: renaming() })
    expect(document.querySelector<HTMLInputElement>('input[name="teamSearch"]')!.disabled).toBe(
      true,
    )
  })

  it('🔴 하위 팀 추가는 접힌 조상까지 모두 펼친다 — 초안 행이 접힌 가지에 숨지 않는다', async () => {
    await setup()
    button('「한강투자그룹」 접기')!.click()
    await flushPromises()
    await wrapper!.setProps({ edit: creating(2n) })
    await flushPromises()
    expect(input()).not.toBeNull()
  })
})

describe('TeamTree — 드래그', () => {
  it('draggable · 잠금 · 검색 · 입력칸에 따라 he-tree 드래그를 켜고 끈다', async () => {
    const tree = () => wrapper!.findComponent(Draggable)
    await setup()
    expect(tree().props('disableDrag')).toBe(true)
    await wrapper!.setProps({ draggable: true })
    expect(tree().props('disableDrag')).toBe(false)
    await wrapper!.setProps({ busy: true })
    expect(tree().props('disableDrag')).toBe(true)
    await wrapper!.setProps({ busy: false, edit: renaming() })
    expect(tree().props('disableDrag')).toBe(true)
    await wrapper!.setProps({ edit: null })
    await wrapper!.find('input[name="teamSearch"]').setValue('지점')
    expect(tree().props('disableDrag')).toBe(true)
  })

  it('같은 상위 팀 안에서 순서를 바꾸면 move(…, drag)', async () => {
    await setup({ draggable: true })
    await dragTo('분당지점', '영업본부', 0)
    expect(wrapper!.emitted('move')).toEqual([
      [{ teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'drag'],
    ])
  })

  it('다른 상위 팀 아래로 놓으면 그 자리', async () => {
    await setup({ draggable: true })
    await dragTo('판교지점', '관리본부', 1)
    expect(wrapper!.emitted('move')).toEqual([
      [{ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null }, 'drag'],
    ])
  })

  it('🔴 제자리에 놓으면 아무것도 내지 않는다(D8)', async () => {
    await setup({ draggable: true })
    await dragTo('강남지점', '영업본부', 0)
    expect(wrapper!.emitted('move')).toBeUndefined()
  })

  it('resetKey 가 바뀌면 놓기 전 모양으로 돌아간다', async () => {
    await setup({ draggable: true })
    await dragTo('판교지점', '관리본부', 1)
    expect(names()).not.toEqual(ALL)
    await wrapper!.setProps({ resetKey: 1 })
    await flushPromises()
    expect(names()).toEqual(ALL)
  })

  it('canAct(…, move) 가 거짓인 팀은 끌 수 없다', async () => {
    await setup({
      draggable: true,
      canAct: (node: AdminTeamNode, action: string) => !(node.teamNo === 5n && action === 'move'),
    })
    const tree = wrapper!.findComponent(Draggable)
    const vm = tree.vm as unknown as HeTreeVm
    const eachDraggable = tree.props('eachDraggable') as (stat: HeStatLike) => boolean
    const stat = (name: string) => vm.statsFlat.find((s) => s.data.team?.teamName === name)!
    expect(eachDraggable(stat('판교지점'))).toBe(false)
    expect(eachDraggable(stat('강남지점'))).toBe(true)
  })

  it('🔴 Alt+화살표는 가로챈다 — he-tree 키보드 이동은 확인 · 잠금을 건너뛴다(D7)', async () => {
    await setup({ draggable: true })
    key(treeItemOf('분당지점'), { key: 'ArrowUp', altKey: true })
    await flushPromises()
    expect(names()).toEqual(ALL)
    expect(wrapper!.emitted('move')).toBeUndefined()
  })

  it('드래그가 꺼져 있으면 Alt+화살표를 막지 않는다 — 브라우저의 뒤로 · 앞으로', async () => {
    await setup()
    const event = key(treeItemOf('분당지점'), { key: 'ArrowLeft', altKey: true })
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('TeamTree — 드래그 미리보기', () => {
  it('🔴 he-tree 가 자리 표시를 끼워도 그린다 — 행 키가 자리 표시를 팀으로 읽지 않는다', async () => {
    await setup({ draggable: true })
    await hoverAt('판교지점', '관리본부', 1)
    expect(placeholder()).not.toBeNull()
    expect(names()).toEqual(expect.arrayContaining(ALL))
  })

  it('놓일 자리에 끄는 팀의 행을 옅게 그린다', async () => {
    await setup({ draggable: true })
    await hoverAt('판교지점', '관리본부', 1)
    const ghost = placeholder()!.querySelector('.team-tree__row--ghost')
    expect(ghost).not.toBeNull()
    expect(ghost!.querySelector('.team-tree__name')?.textContent?.trim()).toBe('판교지점')
    expect(ghost!.textContent).not.toContain('▸')
  })

  it('하위 팀이 있는 팀이면 접힌 표시가 붙는다 — 가지째 옮겨진다', async () => {
    await setup({ draggable: true })
    await hoverAt('영업본부', '관리본부', 1)
    const ghost = placeholder()!.querySelector('.team-tree__row--ghost')!
    expect(ghost.querySelector('.team-tree__name')?.textContent?.trim()).toBe('영업본부')
    expect(ghost.textContent).toContain('▸')
  })

  it('#badge 슬롯도 그 팀으로 그린다', async () => {
    await setup(
      { draggable: true },
      {
        badge: ({ node }: { node: AdminTeamNode }) =>
          h('span', { class: 'chip' }, `칩:${node.teamName}`),
      },
    )
    await hoverAt('판교지점', '관리본부', 1)
    expect(placeholder()!.textContent).toContain('칩:판교지점')
  })

  it('미리보기에는 버튼이 없고 화면 낭독기에서 숨는다 — 위치는 he-tree 가 알린다', async () => {
    await setup({ draggable: true })
    await hoverAt('판교지점', '관리본부', 1)
    const ghost = placeholder()!.querySelector('.team-tree__row--ghost')!
    expect(ghost.getAttribute('aria-hidden')).toBe('true')
    expect(placeholder()!.querySelectorAll('button')).toHaveLength(0)
  })
})
