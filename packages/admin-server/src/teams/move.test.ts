import { findTeamPlacement, siblingMove, type AdminTeamNode } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { closurePairs, compareOrder, planTeamMove, type SiblingOrder } from './move.js'

const node = (teamNo: number, displayOrder: number): AdminTeamNode => ({
  teamNo: BigInt(teamNo),
  teamName: `t${teamNo}`,
  displayOrder,
  children: [],
})

const sib = (teamNo: number, displayOrder: number): SiblingOrder => ({
  teamNo: BigInt(teamNo),
  displayOrder,
})

/** 받는 형제(대상 제외)를 서버와 같은 순으로 */
const siblingsOf = (nodes: readonly AdminTeamNode[], exclude: bigint): SiblingOrder[] =>
  nodes
    .filter((n) => n.teamNo !== exclude)
    .map((n) => sib(Number(n.teamNo), n.displayOrder))
    .sort(compareOrder)

/** 계획을 적용한 뒤의 형제 순서(번호) */
function orderAfter(
  siblings: readonly SiblingOrder[],
  target: SiblingOrder,
  plan: ReturnType<typeof planTeamMove>,
): bigint[] {
  const values = new Map([...siblings, target].map((s) => [s.teamNo, s.displayOrder]))
  for (const update of plan.updates) values.set(update.teamNo, update.displayOrder)
  return [...values.entries()]
    .map(([teamNo, displayOrder]) => ({ teamNo, displayOrder }))
    .sort(compareOrder)
    .map((s) => s.teamNo)
}

describe('planTeamMove — 같은 상위 팀(3d siblingMove 가 낸 요청)', () => {
  const nodes = [node(1, 0), node(2, 1), node(3, 2)]

  it('위로 — 앞 형제 앞으로 정확히 한 칸', () => {
    const move = siblingMove(nodes, 3n, 'up')
    expect(move).toEqual({ teamNo: 3n, parentTeamNo: null, beforeTeamNo: 2n })
    const siblings = siblingsOf(nodes, 3n)
    const plan = planTeamMove(siblings, sib(3, 2), move?.beforeTeamNo ?? null, true)
    expect(plan).toEqual({
      unchanged: false,
      targetOrder: 1,
      updates: [sib(3, 1), sib(2, 2)],
    })
    expect(orderAfter(siblings, sib(3, 2), plan)).toEqual([1n, 3n, 2n])
  })

  it('아래로 — 그다음 형제 앞으로', () => {
    const move = siblingMove(nodes, 1n, 'down')
    expect(move?.beforeTeamNo).toBe(3n)
    const siblings = siblingsOf(nodes, 1n)
    const plan = planTeamMove(siblings, sib(1, 0), 3n, true)
    expect(orderAfter(siblings, sib(1, 0), plan)).toEqual([2n, 1n, 3n])
    expect(plan.updates).toEqual([sib(2, 0), sib(1, 1)])
  })

  it('끝으로(beforeTeamNo null)', () => {
    const siblings = siblingsOf(nodes, 1n)
    const plan = planTeamMove(siblings, sib(1, 0), null, true)
    expect(orderAfter(siblings, sib(1, 0), plan)).toEqual([2n, 3n, 1n])
    expect(plan.targetOrder).toBe(2)
  })

  it('🔴 제자리면 쓰지 않는다 — 빈 번호(10 · 20 · 30)여도 다시 매기지 않는다', () => {
    const gaps = [node(1, 10), node(2, 20), node(3, 30)]
    expect(planTeamMove(siblingsOf(gaps, 3n), sib(3, 30), null, true)).toEqual({
      unchanged: true,
      targetOrder: 30,
      updates: [],
    })
    expect(planTeamMove(siblingsOf(gaps, 1n), sib(1, 10), 2n, true).unchanged).toBe(true)
  })

  it('🔴 동률(hangang 기본값 0 이 여럿) — 위로가 한 칸만 움직이고 묶음이 0..n-1 이 된다(Review Focus 1)', () => {
    const ties = [node(1, 0), node(2, 0), node(3, 0)]
    const move = siblingMove(ties, 3n, 'up')
    expect(move?.beforeTeamNo).toBe(2n)
    const siblings = siblingsOf(ties, 3n)
    const plan = planTeamMove(siblings, sib(3, 0), 2n, true)
    expect(orderAfter(siblings, sib(3, 0), plan)).toEqual([1n, 3n, 2n])
    expect(plan.updates).toEqual([sib(3, 1), sib(2, 2)])
  })

  it('빈 번호에서 아래로 — 그 묶음이 0..n-1 로 다시 매겨진다', () => {
    const gaps = [node(1, 10), node(2, 20), node(3, 30)]
    const siblings = siblingsOf(gaps, 1n)
    const plan = planTeamMove(siblings, sib(1, 10), 3n, true)
    expect(orderAfter(siblings, sib(1, 10), plan)).toEqual([2n, 1n, 3n])
    expect(plan.updates).toEqual([sib(2, 0), sib(1, 1), sib(3, 2)])
  })

  it('드래그로 바뀐 사본의 자리(findTeamPlacement)를 그대로 재현한다', () => {
    const dragged = [node(3, 2), node(1, 0), node(2, 1)]
    const placement = findTeamPlacement(dragged, 3n)
    expect(placement).toEqual({ parentTeamNo: null, beforeTeamNo: 1n })
    const siblings = siblingsOf(nodes, 3n)
    const plan = planTeamMove(siblings, sib(3, 2), placement?.beforeTeamNo ?? null, true)
    expect(orderAfter(siblings, sib(3, 2), plan)).toEqual([3n, 1n, 2n])
  })
})

describe('planTeamMove — 다른 상위 팀', () => {
  it('끝으로 — 새 형제 다음 번호', () => {
    const siblings = [sib(10, 0), sib(11, 1)]
    expect(planTeamMove(siblings, sib(5, 7), null, false)).toEqual({
      unchanged: false,
      targetOrder: 2,
      updates: [sib(5, 2)],
    })
  })

  it('기준 형제 앞으로', () => {
    const siblings = [sib(10, 0), sib(11, 1)]
    const plan = planTeamMove(siblings, sib(5, 7), 11n, false)
    expect(plan.targetOrder).toBe(1)
    expect(plan.updates).toEqual([sib(5, 1), sib(11, 2)])
  })

  it('빈 묶음이면 0(3d — 형제가 없으면 0)', () => {
    expect(planTeamMove([], sib(5, 7), null, false)).toEqual({
      unchanged: false,
      targetOrder: 0,
      updates: [sib(5, 0)],
    })
  })

  it('같은 자리 값이어도 상위 팀이 바뀌면 제자리가 아니다', () => {
    expect(planTeamMove([], sib(5, 0), null, false)).toEqual({
      unchanged: false,
      targetOrder: 0,
      updates: [],
    })
  })

  it('🔴 형제가 아닌 beforeTeamNo 는 결함이다 — 던진다(부르는 쪽이 먼저 400)', () => {
    expect(() => planTeamMove([sib(10, 0)], sib(5, 0), 99n, false)).toThrow(
      'beforeTeamNo 가 받는 형제가 아니다',
    )
  })
})

describe('closurePairs', () => {
  it('새 조상 × 서브트리 — 깊이 a.depth + d.depth + 1', () => {
    const pairs = closurePairs(
      [
        { teamNo: 1n, depth: 0 },
        { teamNo: 2n, depth: 1 },
      ],
      [
        { teamNo: 5n, depth: 0 },
        { teamNo: 6n, depth: 1 },
        { teamNo: 7n, depth: 2 },
      ],
    )
    expect(pairs).toEqual([
      { ancestorNo: 1n, descendantNo: 5n, depth: 1 },
      { ancestorNo: 1n, descendantNo: 6n, depth: 2 },
      { ancestorNo: 1n, descendantNo: 7n, depth: 3 },
      { ancestorNo: 2n, descendantNo: 5n, depth: 2 },
      { ancestorNo: 2n, descendantNo: 6n, depth: 3 },
      { ancestorNo: 2n, descendantNo: 7n, depth: 4 },
    ])
  })

  it('최상위로 옮기면(조상 없음) 넣을 쌍이 없다', () => {
    expect(closurePairs([], [{ teamNo: 5n, depth: 0 }])).toEqual([])
  })
})
