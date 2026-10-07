// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import type { AdminTeamNode } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import TeamMoveDialog from '../components/team/TeamMoveDialog.vue'
import TeamTree from '../components/team/TeamTree.vue'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import { useTeamTree, type TeamTreeController, type UseTeamTreeOptions } from './useTeamTree.js'

// 정본: hangang-home apps/admin/src/pages/org/teams.render.test.ts(쓰기 넷 · 실패해도 재조회 · 삭제 뒤 선택 해제 ·
//       재인증 없음)를 실제 TeamTree · ConfirmDialog · TeamMoveDialog 에 붙여 잰다. 3열 사용자 폼 쪽은 템플릿 몫이라 없다.

installVisualViewport()

const n = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  children: AdminTeamNode[] = [],
): AdminTeamNode => ({ teamNo: BigInt(teamNo), teamName, displayOrder, children })

const TREE = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [
    n(3, '관리본부', 5, [n(7, '인사팀', 0)]),
    n(2, '영업본부', 0, [n(6, '분당지점', 9), n(4, '강남지점', 0), n(5, '판교지점', 5)]),
  ]),
]
/** 영업본부 서브트리가 사라진 트리 */
const WITHOUT_SALES = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [n(3, '관리본부', 5, [n(7, '인사팀', 0)])]),
]

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(options: Partial<UseTeamTreeOptions> = {}) {
  wrapper?.unmount()
  let teams!: TeamTreeController
  wrapper = mount(
    defineComponent({
      setup() {
        teams = useTeamTree({ load: vi.fn(async () => TREE()), ...options })
        return () =>
          h('div', [
            h(TeamTree as Component, teams.tree.value),
            h(TeamMoveDialog as Component, teams.moveDialog.value),
            h(ConfirmDialog as Component, teams.confirmDialog.value),
          ])
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return teams
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const apiError = (message: string, code: string, status: number, details?: unknown) =>
  new ApiError(message, { status, code, details, raw: null })

const activeDialog = () =>
  document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)

async function clickInDialog(text: string) {
  const target = buttonByText(text, activeDialog())
  expect(target, `가드 — 다이얼로그에 "${text}" 버튼이 있다`).toBeTruthy()
  target!.click()
  await flushPromises()
}

const node = (teams: TeamTreeController, teamNo: bigint) => {
  const walk = (list: readonly AdminTeamNode[]): AdminTeamNode | undefined =>
    list.reduce<AdminTeamNode | undefined>(
      (found, item) => found ?? (item.teamNo === teamNo ? item : walk(item.children)),
      undefined,
    )
  return walk(teams.nodes.value)!
}

describe('useTeamTree — 조회', () => {
  it('처음에 불러와 트리에 넘긴다', async () => {
    const load = vi.fn(async () => TREE())
    const teams = await setup({ load })
    expect(load).toHaveBeenCalledTimes(1)
    expect(teams.tree.value.nodes).toEqual(TREE())
    expect(teams.rows.value.map((r) => r.teamName)).toEqual([
      '한강투자그룹',
      '영업본부',
      '강남지점',
      '판교지점',
      '분당지점',
      '관리본부',
      '인사팀',
    ])
    expect(teams.loading.value).toBe(false)
  })

  it('immediate: false 면 부르지 않는다', async () => {
    const load = vi.fn(async () => TREE())
    await setup({ load, immediate: false })
    expect(load).not.toHaveBeenCalled()
  })

  it('🔴 늦게 온 옛 응답은 버린다', async () => {
    const first = deferred<AdminTeamNode[]>()
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(WITHOUT_SALES())
    const teams = await setup({ load })
    await teams.reload()
    first.resolve(TREE())
    await flushPromises()
    expect(teams.nodes.value).toEqual(WITHOUT_SALES())
  })

  it('재조회가 실패해도 트리는 남고 loadFailed 가 켜진다', async () => {
    const load = vi.fn().mockResolvedValueOnce(TREE()).mockRejectedValueOnce(new Error('네트워크'))
    const teams = await setup({ load })
    await teams.reload()
    expect(teams.nodes.value).toEqual(TREE())
    expect(teams.tree.value.loadFailed).toBe(true)
    expect(teams.loadError.value).toBeInstanceOf(Error)
  })

  it('selectedRow 는 고른 팀의 행이다', async () => {
    const teams = await setup()
    teams.selected.value = 5n
    expect(teams.selectedRow.value?.teamName).toBe('판교지점')
  })

  it('고른 팀이 재조회 뒤 없으면 선택을 해제한다(D13)', async () => {
    const load = vi.fn().mockResolvedValueOnce(TREE()).mockResolvedValueOnce(WITHOUT_SALES())
    const teams = await setup({ load })
    teams.selected.value = 5n
    await teams.reload()
    expect(teams.selected.value).toBeNull()
    expect(teams.selectedRow.value).toBeNull()
  })

  it('입력칸 대상이 재조회 뒤 없으면 입력칸을 닫는다', async () => {
    const load = vi.fn().mockResolvedValueOnce(TREE()).mockResolvedValueOnce(WITHOUT_SALES())
    const teams = await setup({ load, rename: vi.fn() })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    expect(teams.tree.value.edit).not.toBeNull()
    await teams.reload()
    expect(teams.tree.value.edit).toBeNull()
  })
})

describe('useTeamTree — 판정', () => {
  it('어댑터를 주지 않은 동작은 생기지 않는다(D12)', async () => {
    const teams = await setup({ rename: vi.fn() })
    const pangyo = node(teams, 5n)
    expect(teams.tree.value.canAct(pangyo, 'rename')).toBe(true)
    expect(teams.tree.value.canAct(pangyo, 'move')).toBe(false)
    expect(teams.tree.value.canAct(pangyo, 'remove')).toBe(false)
    expect(teams.tree.value.canAct(pangyo, 'addChild')).toBe(false)
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
  })

  it('소비자 canAct 를 함께 본다', async () => {
    const teams = await setup({ move: vi.fn(), canAct: (team) => team.teamNo !== 5n })
    expect(teams.tree.value.canAct(node(teams, 5n), 'move')).toBe(false)
    expect(teams.tree.value.canAct(node(teams, 4n), 'move')).toBe(true)
  })

  it('🔴 canWrite 는 부를 때마다 평가한다 — 비반응 플래그도 따른다', async () => {
    let allowed = true
    const move = vi.fn(async () => {})
    const teams = await setup({ move, rename: vi.fn(), canWrite: () => allowed })
    allowed = false
    teams.tree.value.onMove({ teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'button')
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    await flushPromises()
    expect(move).not.toHaveBeenCalled()
    expect(teams.tree.value.edit).toBeNull()
  })
})

describe('useTeamTree — ↑↓ · 드래그', () => {
  it('↑↓ 는 확인 없이 요청 → 재조회 → onDone(move)', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    await setup({ load, move, onDone })
    button('「판교지점」 위로')!.click()
    await flushPromises()
    expect(move).toHaveBeenCalledWith({ teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 4n })
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({
      action: 'move',
      teamNo: 5n,
      teamName: '판교지점',
      message: '「판교지점」의 순서를 바꿨습니다.',
    })
  })

  it('실패해도 재조회하고 onDone 은 없다', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {
      throw apiError('잠금 경합', 'ERR_COMMON_CONFLICT', 409)
    })
    const onDone = vi.fn()
    await setup({ load, move, onDone })
    button('「판교지점」 위로')!.click()
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('드래그 · 같은 상위 팀 — 확인 없이 요청', async () => {
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ move, onDone })
    teams.tree.value.onMove({ teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'drag')
    await flushPromises()
    expect(document.querySelector('.v-overlay--active')).toBeNull()
    expect(move).toHaveBeenCalledWith({ teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 4n })
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ action: 'move', teamNo: 6n }))
  })

  it('드래그 · 다른 상위 팀 — 확인 문구 → 확인하면 요청 → onDone(reparent)', async () => {
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ move, onDone })
    teams.tree.value.onMove({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null }, 'drag')
    await flushPromises()
    expect(activeDialog().textContent).toContain(
      '「판교지점」을(를) 「관리본부」 아래로 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다.',
    )
    expect(activeDialog().textContent).toContain('이 작업은 되돌릴 수 있습니다.')
    expect(move).not.toHaveBeenCalled()
    await clickInDialog('옮기기')
    expect(move).toHaveBeenCalledWith({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null })
    expect(onDone).toHaveBeenCalledWith({
      action: 'reparent',
      teamNo: 5n,
      teamName: '판교지점',
      message: '「판교지점」을(를) 「관리본부」 아래로 옮겼습니다.',
    })
  })

  it('🔴 확인을 취소하면 요청 · 재조회 없이 resetKey 만 오른다(원위치)', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {})
    const teams = await setup({ load, move })
    const before = teams.tree.value.resetKey
    teams.tree.value.onMove({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null }, 'drag')
    await flushPromises()
    await clickInDialog('취소')
    expect(move).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledTimes(1)
    expect(teams.tree.value.resetKey).toBe(before + 1)
  })

  it('드래그가 실패하면 resetKey 가 오르고 재조회한다', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {
      throw apiError('실패', 'ERR_COMMON_CONFLICT', 409)
    })
    const teams = await setup({ load, move })
    const before = teams.tree.value.resetKey
    teams.tree.value.onMove({ teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'drag')
    await flushPromises()
    expect(teams.tree.value.resetKey).toBe(before + 1)
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('useTeamTree — 옮기기 대화상자', () => {
  it('메뉴의 옮기기가 대화상자를 열고 선택지를 낸다', async () => {
    const teams = await setup({ move: vi.fn() })
    teams.tree.value.onReparent(5n)
    expect(teams.moveDialog.value.modelValue).toBe(true)
    expect(teams.moveDialog.value.teamName).toBe('판교지점')
    expect(teams.moveDialog.value.targets.map((t) => t.parentTeamNo)).toEqual([1n, 4n, 6n, 3n, 7n])
  })

  it('고르면 맨 끝으로 요청 → 닫기 → 재조회 → onDone(reparent)', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ load, move, onDone })
    teams.tree.value.onReparent(5n)
    teams.moveDialog.value.onConfirm(3n)
    await flushPromises()
    expect(move).toHaveBeenCalledWith({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null })
    expect(teams.moveDialog.value.modelValue).toBe(false)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ message: '「판교지점」을(를) 「관리본부」 아래로 옮겼습니다.' }),
    )
  })

  it('topLevel 이면 최상위가 맨 앞이고, 고르면 최상위로 옮겼다고 알린다', async () => {
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ move, onDone, topLevel: true })
    teams.tree.value.onReparent(5n)
    expect(teams.moveDialog.value.targets[0]!.parentTeamNo).toBeNull()
    teams.moveDialog.value.onConfirm(null)
    await flushPromises()
    expect(move).toHaveBeenCalledWith({ teamNo: 5n, parentTeamNo: null, beforeTeamNo: null })
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ message: '「판교지점」을(를) 최상위로 옮겼습니다.' }),
    )
  })

  it('canAct(…, addChild) 가 거짓인 팀은 선택지에서 빠진다', async () => {
    const teams = await setup({
      move: vi.fn(),
      canAct: (team, action) => !(team.teamNo === 3n && action === 'addChild'),
    })
    teams.tree.value.onReparent(5n)
    expect(teams.moveDialog.value.targets.map((t) => t.parentTeamNo)).not.toContain(3n)
  })
})

describe('useTeamTree — 삭제', () => {
  it('확인(하위 팀 수 · 소속 계정 안내) → 요청 → 재조회 → onDone(remove)', async () => {
    const load = vi.fn(async () => TREE())
    const remove = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ load, remove, onDone })
    teams.tree.value.onRemove(2n)
    await flushPromises()
    expect(activeDialog().textContent).toContain(
      '「영업본부」과(와) 그 아래 팀 3개를 함께 지웁니다. 소속 계정이 있으면 지울 수 없습니다.',
    )
    await clickInDialog('삭제')
    expect(remove).toHaveBeenCalledWith(2n)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({
      action: 'remove',
      teamNo: 2n,
      teamName: '영업본부',
      message: '「영업본부」을(를) 지웠습니다.',
    })
  })

  it('하위 팀이 없으면 「…」을(를) 지웁니다', async () => {
    const teams = await setup({ remove: vi.fn() })
    teams.tree.value.onRemove(4n)
    await flushPromises()
    expect(activeDialog().textContent).toContain(
      '「강남지점」을(를) 지웁니다. 소속 계정이 있으면 지울 수 없습니다.',
    )
  })

  it('취소면 요청 · 재조회가 없다', async () => {
    const load = vi.fn(async () => TREE())
    const remove = vi.fn(async () => {})
    const teams = await setup({ load, remove })
    teams.tree.value.onRemove(2n)
    await flushPromises()
    await clickInDialog('취소')
    expect(remove).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('삭제 실패는 전역 토스트에 맡긴다 — handled 로 표시하지 않는다', async () => {
    const error = apiError('소속 계정이 있어 지울 수 없습니다.', 'ERR_TEAM_HAS_MEMBERS', 409)
    const load = vi.fn(async () => TREE())
    const remove = vi.fn(async () => {
      throw error
    })
    const onDone = vi.fn()
    const teams = await setup({ load, remove, onDone })
    teams.tree.value.onRemove(2n)
    await flushPromises()
    await clickInDialog('삭제')
    expect(error.handled).toBe(false)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('지운 팀을 고르고 있었으면 선택을 해제한다', async () => {
    const load = vi.fn().mockResolvedValueOnce(TREE()).mockResolvedValueOnce(WITHOUT_SALES())
    const teams = await setup({ load, remove: vi.fn(async () => {}) })
    teams.selected.value = 5n
    teams.tree.value.onRemove(2n)
    await flushPromises()
    await clickInDialog('삭제')
    expect(teams.selected.value).toBeNull()
  })
})

describe('useTeamTree — 노드 안 입력칸', () => {
  it('하위 팀 추가 — Enter → create(앞뒤 공백 제거) → 닫기 → 재조회 → onDone(create, 응답 번호)', async () => {
    const load = vi.fn(async () => TREE())
    const create = vi.fn(async () => ({ teamNo: 99n }))
    const onDone = vi.fn()
    const teams = await setup({ load, create, onDone })
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    expect(teams.tree.value.edit).toMatchObject({ kind: 'create', parentTeamNo: 2n, name: '' })
    teams.tree.value.onEditInput('  영업4팀 ')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(create).toHaveBeenCalledWith({ teamName: '영업4팀', parentTeamNo: 2n })
    expect(teams.tree.value.edit).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({
      action: 'create',
      teamNo: 99n,
      teamName: '영업4팀',
      message: '「영업4팀」을(를) 만들었습니다.',
    })
  })

  it('만들기 응답에 번호가 없으면 teamNo: null', async () => {
    const onDone = vi.fn()
    const teams = await setup({ create: vi.fn(async () => undefined), onDone })
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    teams.tree.value.onEditInput('영업4팀')
    teams.tree.value.onEditCommit('button')
    await flushPromises()
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', teamNo: null }))
  })

  it('이름 바꾸기 — 그대로면 요청 없이 닫는다', async () => {
    const rename = vi.fn(async () => {})
    const teams = await setup({ rename })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    expect(teams.tree.value.edit).toMatchObject({ kind: 'rename', name: '판교지점' })
    teams.tree.value.onEditCommit('blur')
    await flushPromises()
    expect(rename).not.toHaveBeenCalled()
    expect(teams.tree.value.edit).toBeNull()
  })

  it('이름 바꾸기 — 바꾸면 rename → onDone(rename)', async () => {
    const rename = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ rename, onDone })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    teams.tree.value.onEditInput('판교센터')
    teams.tree.value.onEditCommit('blur')
    await flushPromises()
    expect(rename).toHaveBeenCalledWith(5n, { teamName: '판교센터' })
    expect(onDone).toHaveBeenCalledWith({
      action: 'rename',
      teamNo: 5n,
      teamName: '판교센터',
      message: '팀 이름을 「판교센터」(으)로 바꿨습니다.',
    })
  })

  it('빈 이름 — 바깥 누르기면 요청 없이 닫고, Enter 면 오류를 보이고 열어 둔다', async () => {
    const create = vi.fn(async () => {})
    const teams = await setup({ create })
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    teams.tree.value.onEditCommit('blur')
    expect(teams.tree.value.edit).toBeNull()
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    teams.tree.value.onEditInput('   ')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({ error: '팀 이름을 입력하세요.' })
    expect(create).not.toHaveBeenCalled()
  })

  it('64자를 넘으면 오류', async () => {
    const create = vi.fn(async () => {})
    const teams = await setup({ create })
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    teams.tree.value.onEditInput('가'.repeat(65))
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({ error: '팀 이름은 64자 이하로 정하세요.' })
    expect(create).not.toHaveBeenCalled()
  })

  it('🔴 저장 실패는 입력칸 아래 — handled 로 표시해 토스트를 막고, 글자를 두고, 재조회한다(D11)', async () => {
    const error = apiError('이미 같은 이름의 팀이 있습니다.', 'ERR_DUPLICATE_TEAM_NAME', 409)
    const load = vi.fn(async () => TREE())
    const rename = vi.fn(async () => {
      throw error
    })
    const onDone = vi.fn()
    const teams = await setup({ load, rename, onDone })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    teams.tree.value.onEditInput('영업본부')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({
      name: '영업본부',
      pending: false,
      error: '이미 같은 이름의 팀이 있습니다.',
    })
    expect(error.handled).toBe(true)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('검증 오류면 teamName 필드 문구를 쓴다', async () => {
    const error = apiError('입력값을 확인하세요', 'ERR_COMMON_VALIDATION', 400, {
      issues: [{ path: ['teamName'], message: '팀 이름에 쓸 수 없는 글자가 있습니다.' }],
    })
    const teams = await setup({
      rename: vi.fn(async () => {
        throw error
      }),
    })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    teams.tree.value.onEditInput('판교/1')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({ error: '팀 이름에 쓸 수 없는 글자가 있습니다.' })
    expect(error.handled).toBe(true)
  })

  it('저장 중에는 입력 · 취소 · 다시 저장을 받지 않는다', async () => {
    const pending = deferred<void>()
    const rename = vi.fn(() => pending.promise)
    const teams = await setup({ rename })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    teams.tree.value.onEditInput('판교센터')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({ pending: true })
    teams.tree.value.onEditInput('딴 이름')
    teams.tree.value.onEditCancel()
    teams.tree.value.onEditCommit('enter')
    expect(teams.tree.value.edit).toMatchObject({ name: '판교센터', pending: true })
    expect(rename).toHaveBeenCalledTimes(1)
    pending.resolve()
    await flushPromises()
    expect(teams.tree.value.edit).toBeNull()
  })

  it('startCreate(null) 은 topLevel 일 때만 최상위 초안을 연다', async () => {
    const create = vi.fn(async () => {})
    let teams = await setup({ create })
    teams.startCreate(null)
    expect(teams.tree.value.edit).toBeNull()
    teams = await setup({ create, topLevel: true })
    teams.startCreate(null)
    expect(teams.tree.value.edit).toMatchObject({ kind: 'create', parentTeamNo: null })
  })

  it('잠겨 있으면 입력칸을 열지 않는다', async () => {
    const teams = await setup({ rename: vi.fn(), canWrite: () => false })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    expect(teams.tree.value.edit).toBeNull()
  })
})
