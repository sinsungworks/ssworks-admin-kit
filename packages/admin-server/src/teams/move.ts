// 정본: 없음 — hangang 은 클라이언트가 순서 값을 보냈고(형제 ±1 시프트) 순환 검사가 없었다. 3d ⑤ O3 의 기준 형제 번호를 서버가
//   받는 형제 묶음의 0..n-1 다시 매김으로 푼다(2e 스펙 ⑤ O1 · B8). closure 쌍은 앱이 셈한다(④ C1 · B6 — 자기 행에 기대지 않는다).

export interface SiblingOrder {
  teamNo: bigint
  displayOrder: number
}

export interface TeamMovePlan {
  /** 🔴 같은 상위 팀이고 팀 순서가 그대로 — 쓰지 않는다(빈 번호여도 다시 매기지 않는다 · 감사 before = after) */
  unchanged: boolean
  /** 대상의 새 displayOrder(제자리면 지금 값) */
  targetOrder: number
  /** displayOrder 가 바뀌는 행(대상 포함) */
  updates: SiblingOrder[]
}

export interface ClosureLink {
  teamNo: bigint
  /** 기준 팀에서의 깊이 — 기준 자신은 0 */
  depth: number
}

export interface ClosureRow {
  ancestorNo: bigint
  descendantNo: bigint
  depth: number
}

/** (displayOrder, teamNo) 오름차순 — 트리 응답 · 형제 잠금 읽기와 같은 순서 */
export function compareOrder(a: SiblingOrder, b: SiblingOrder): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
  return a.teamNo < b.teamNo ? -1 : a.teamNo > b.teamNo ? 1 : 0
}

/**
 * @param siblings 받는 상위 팀의 지금 자식 — 대상 제외, (displayOrder, teamNo) 순
 * @param target 대상의 지금 번호 · 값
 * @param beforeTeamNo 이 형제 앞에 둔다. null = 끝. 🔴 siblings 안에 있어야 한다(부르는 쪽이 먼저 400)
 * @param sameParent 상위 팀이 그대로인가 — 그러면 지금 순서(대상 포함)와 같을 때 제자리
 */
export function planTeamMove(
  siblings: readonly SiblingOrder[],
  target: SiblingOrder,
  beforeTeamNo: bigint | null,
  sameParent: boolean,
): TeamMovePlan {
  const index =
    beforeTeamNo === null
      ? siblings.length
      : siblings.findIndex((sibling) => sibling.teamNo === beforeTeamNo)
  if (index < 0) {
    throw new Error(
      'planTeamMove: beforeTeamNo 가 받는 형제가 아니다 — 부르는 쪽이 먼저 400 을 낸다',
    )
  }
  const order = [...siblings.slice(0, index), target, ...siblings.slice(index)]
  if (sameParent) {
    const current = [...siblings, target].sort(compareOrder)
    if (current.every((sibling, i) => sibling.teamNo === order[i]?.teamNo)) {
      return { unchanged: true, targetOrder: target.displayOrder, updates: [] }
    }
  }
  const updates = order.flatMap((sibling, i) =>
    sibling.displayOrder === i ? [] : [{ teamNo: sibling.teamNo, displayOrder: i }],
  )
  return { unchanged: false, targetOrder: index, updates }
}

/** 새 조상(새 상위 팀 깊이 0 ∪ 그 조상) × 서브트리(대상 깊이 0 ∪ 자손) — 깊이 a.depth + d.depth + 1 (B6) */
export function closurePairs(
  ancestors: readonly ClosureLink[],
  subtree: readonly ClosureLink[],
): ClosureRow[] {
  return ancestors.flatMap((ancestor) =>
    subtree.map((descendant) => ({
      ancestorNo: ancestor.teamNo,
      descendantNo: descendant.teamNo,
      depth: ancestor.depth + descendant.depth + 1,
    })),
  )
}
