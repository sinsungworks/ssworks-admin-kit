import type { AdminTeamNode } from '@ssworks/admin-shared'

// 정본: hangang-home apps/api/src/modules/teams/teams.service.ts findAll(teams ⟕ closure 깊이 1 의 평면 목록) · buildTree
// 바꾼 점: 루트가 여럿이다(3d §9 — hangang 은 단일 루트를 depth 0 자기 행으로 골랐다). 자기 행에 기대지 않는다(2e 스펙 ④ C1 —
//   상위 팀은 깊이 1 조상뿐). closure 가 손상됐으면 경고를 모아 내고 루트에서 닿는 팀만 낸다(B9).
// 🔴 무한 반복이 없다 — 각 팀은 상위 팀이 하나뿐이라(둘이면 작은 번호 하나로 줄인다) 루트에서 자식으로 내려가는 길에는 순환이
//    끼지 않는다. 순환에 든 팀은 루트에서 닿지 않아 내지 않는다.

export interface TeamTreeRow {
  teamNo: bigint
  teamName: string
  displayOrder: number
  /** 깊이 1 조상. null = 최상위 */
  parentTeamNo: bigint | null
}

export interface TeamTreeBuild {
  items: AdminTeamNode[]
  warnings: string[]
}

/** 🔴 행 순서 그대로 자식을 붙인다 — 쿼리가 (displayOrder, teamNo, parentTeamNo) 순으로 준다(형제 순서 = 3d sortTeamTree) */
export function buildTeamTree(rows: readonly TeamTreeRow[]): TeamTreeBuild {
  const nodes = new Map<bigint, AdminTeamNode>()
  const parentOf = new Map<bigint, bigint | null>()
  const warnings: string[] = []
  for (const row of rows) {
    if (nodes.has(row.teamNo)) {
      const kept = parentOf.get(row.teamNo) ?? null
      const smaller =
        kept === null || (row.parentTeamNo !== null && row.parentTeamNo < kept)
          ? row.parentTeamNo
          : kept
      parentOf.set(row.teamNo, smaller)
      warnings.push(
        `팀 ${row.teamNo} 의 상위 팀(closure 깊이 1 행)이 둘 이상이다 — 작은 번호 ${String(smaller)} 을 쓴다`,
      )
      continue
    }
    nodes.set(row.teamNo, {
      teamNo: row.teamNo,
      teamName: row.teamName,
      displayOrder: row.displayOrder,
      children: [],
    })
    parentOf.set(row.teamNo, row.parentTeamNo)
  }

  const items: AdminTeamNode[] = []
  const orphans = new Set<bigint>()
  for (const [teamNo, node] of nodes) {
    const parent = parentOf.get(teamNo) ?? null
    if (parent === null) {
      items.push(node)
      continue
    }
    const parentNode = nodes.get(parent)
    if (parentNode === undefined) {
      orphans.add(teamNo)
      warnings.push(`팀 ${teamNo} 의 상위 팀 ${parent} 가 목록에 없다 — 내지 않는다`)
      continue
    }
    parentNode.children.push(node)
  }

  const reached = new Set<bigint>()
  const walk = (node: AdminTeamNode): void => {
    reached.add(node.teamNo)
    for (const child of node.children) walk(child)
  }
  for (const root of items) walk(root)
  for (const teamNo of nodes.keys()) {
    if (!reached.has(teamNo) && !orphans.has(teamNo)) {
      warnings.push(`팀 ${teamNo} 이 루트에서 닿지 않는다(closure 순환) — 내지 않는다`)
    }
  }
  return { items, warnings }
}
