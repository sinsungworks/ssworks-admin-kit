import type { AdminTeamMove, AdminTeamNode } from './teams.js'

// 팀 트리 순수 함수 — 정렬 · 평탄화 · 검색 · 자리 · 이동 계산 · 들여쓰기.
//
// 정본: hangang-home apps/admin/src/pages/org/teams-messages.ts(flattenTeamTree · indentTeamName)
//       + apps/admin/src/components/org/TeamTree.vue(부모 포함 검색 — Ruling R17)
// 바꾼 점:
//  - 🔴 정렬은 `sortTeamTree()` 하나다(3d 스펙 D1). hangang 은 트리(서버 순서를 믿음)와 페이지(다시 정렬)가 따로
//    평탄화해 보이는 이웃과 계산에 쓰는 이웃이 어긋날 수 있었다.
//  - 루트가 여럿인 숲을 받는다(hangang 은 루트 하나 | null).
//  - 이동은 기준 형제 번호(3d ⑤ O3)다. hangang 의 "이웃의 displayOrder" 계산은 기존 서버용 `toDisplayOrderMove()` 로 옮겼다.

export interface TeamTreeRow {
  teamNo: bigint
  teamName: string
  displayOrder: number
  /** 0 = 최상위 */
  depth: number
  parentTeamNo: bigint | null
  parentTeamName: string | null
  /** 자기 제외 */
  descendantCount: number
  prevSiblingTeamNo: bigint | null
  nextSiblingTeamNo: bigint | null
}

export interface TeamMoveTarget {
  /** null = 최상위 */
  parentTeamNo: bigint | null
  /** 원래 이름(검색용). 최상위면 null */
  teamName: string | null
  /** 들여쓴 표시 이름. 최상위면 '최상위' */
  title: string
  depth: number
}

/** 그 팀의 지금 자리 — 상위 팀(최상위면 null)과 바로 뒤 형제(막내면 null) */
export interface TeamPlacement {
  parentTeamNo: bigint | null
  beforeTeamNo: bigint | null
}

export const TEAM_INDENT_UNIT = '　'
export const TEAM_BRANCH_MARK = '└ '

interface Located {
  node: AdminTeamNode
  parent: AdminTeamNode | null
  siblings: readonly AdminTeamNode[]
  index: number
}

function locate(
  list: readonly AdminTeamNode[],
  teamNo: bigint,
  parent: AdminTeamNode | null = null,
): Located | null {
  for (let index = 0; index < list.length; index += 1) {
    const node = list[index]!
    if (node.teamNo === teamNo) return { node, parent, siblings: list, index }
    const found = locate(node.children, teamNo, node)
    if (found) return found
  }
  return null
}

function contains(node: AdminTeamNode, teamNo: bigint): boolean {
  return node.children.some((child) => child.teamNo === teamNo || contains(child, teamNo))
}

/** 모든 단계의 형제를 displayOrder 오름차순(같으면 받은 순서)으로 정렬한 사본. 입력을 바꾸지 않는다. */
export function sortTeamTree(nodes: readonly AdminTeamNode[]): AdminTeamNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => a.node.displayOrder - b.node.displayOrder || a.index - b.index)
    .map(({ node }) => ({ ...node, children: sortTeamTree(node.children) }))
}

/** 정렬한 뒤 깊이 우선으로 펼친다. */
export function flattenTeamTree(nodes: readonly AdminTeamNode[]): TeamTreeRow[] {
  const rows: TeamTreeRow[] = []
  const visit = (
    siblings: readonly AdminTeamNode[],
    depth: number,
    parent: AdminTeamNode | null,
  ): number => {
    let count = 0
    siblings.forEach((node, index) => {
      const at = rows.length
      rows.push({
        teamNo: node.teamNo,
        teamName: node.teamName,
        displayOrder: node.displayOrder,
        depth,
        parentTeamNo: parent?.teamNo ?? null,
        parentTeamName: parent?.teamName ?? null,
        descendantCount: 0,
        prevSiblingTeamNo: siblings[index - 1]?.teamNo ?? null,
        nextSiblingTeamNo: siblings[index + 1]?.teamNo ?? null,
      })
      const descendants = visit(node.children, depth + 1, node)
      rows[at]!.descendantCount = descendants
      count += 1 + descendants
    })
    return count
  }
  visit(sortTeamTree(nodes), 0, null)
  return rows
}

/**
 * 일치한 팀 + 그 조상의 정렬된 사본. 앞뒤 공백을 지우고 대소문자를 무시한 부분 일치.
 * 🔴 부모가 일치해도 일치하지 않은 자식은 따라오지 않는다 — 계약은 "그 노드와 그 조상"이지
 *    "그 노드의 후손 전부"가 아니다(hangang R17).
 */
export function filterTeamTree(nodes: readonly AdminTeamNode[], query: string): AdminTeamNode[] {
  const sorted = sortTeamTree(nodes)
  const needle = query.trim().toLowerCase()
  if (needle === '') return sorted
  const walk = (list: readonly AdminTeamNode[]): AdminTeamNode[] =>
    list.flatMap((node) => {
      const children = walk(node.children)
      return node.teamName.toLowerCase().includes(needle) || children.length > 0
        ? [{ ...node, children }]
        : []
    })
  return walk(sorted)
}

/** 그 팀의 지금 자리. 주어진 배열 순서 그대로 읽는다(정렬하지 않는다 — 드래그로 바뀐 사본을 읽는 함수다). */
export function findTeamPlacement(
  nodes: readonly AdminTeamNode[],
  teamNo: bigint,
): TeamPlacement | null {
  const at = locate(nodes, teamNo)
  if (at == null) return null
  return {
    parentTeamNo: at.parent?.teamNo ?? null,
    beforeTeamNo: at.siblings[at.index + 1]?.teamNo ?? null,
  }
}

/** ↑↓ 의 이동 요청. 첫째의 up · 막내의 down · 없는 번호는 null. */
export function siblingMove(
  nodes: readonly AdminTeamNode[],
  teamNo: bigint,
  direction: 'up' | 'down',
): AdminTeamMove | null {
  const at = locate(sortTeamTree(nodes), teamNo)
  if (at == null) return null
  const parentTeamNo = at.parent?.teamNo ?? null
  if (direction === 'up') {
    const previous = at.siblings[at.index - 1]
    return previous ? { teamNo, parentTeamNo, beforeTeamNo: previous.teamNo } : null
  }
  if (at.index === at.siblings.length - 1) return null
  return { teamNo, parentTeamNo, beforeTeamNo: at.siblings[at.index + 2]?.teamNo ?? null }
}

/**
 * "옮기기" 선택지 — 조직도 순서 · 들여쓴 제목.
 * 🔴 자기 자신 · 자기 하위 팀(순환) · 지금 상위 팀 · `canReceive` 가 거짓인 팀을 뺀다.
 */
export function moveTargets(
  nodes: readonly AdminTeamNode[],
  teamNo: bigint,
  options: { topLevel?: boolean; canReceive?: (node: AdminTeamNode) => boolean } = {},
): TeamMoveTarget[] {
  const sorted = sortTeamTree(nodes)
  const at = locate(sorted, teamNo)
  if (at == null) return []
  const currentParent = at.parent?.teamNo ?? null
  const byNo = new Map<bigint, AdminTeamNode>()
  const index = (list: readonly AdminTeamNode[]) =>
    list.forEach((node) => {
      byNo.set(node.teamNo, node)
      index(node.children)
    })
  index(sorted)

  const targets: TeamMoveTarget[] = []
  if (options.topLevel === true && currentParent !== null) {
    targets.push({ parentTeamNo: null, teamName: null, title: '최상위', depth: 0 })
  }
  for (const row of flattenTeamTree(sorted)) {
    if (row.teamNo === teamNo || row.teamNo === currentParent || contains(at.node, row.teamNo))
      continue
    if (options.canReceive && !options.canReceive(byNo.get(row.teamNo)!)) continue
    targets.push({
      parentTeamNo: row.teamNo,
      teamName: row.teamName,
      title: indentTeamName(row.teamName, row.depth),
      depth: row.depth,
    })
  }
  return targets
}

/**
 * 기준 형제 번호 요청(O3)을 hangang 서버 규칙(형제 순서 값 · 빈 번호 허용 · 이웃 값을 보내면 정확히 한 칸)으로 바꾼다.
 * 같은 상위 팀이면 `parentTeamNo` 를 싣지 않는다(hangang: 생략 = 순서만). 제자리면 null.
 * 킷 이벤트가 만들지 않는 요청(없는 팀 · 그 상위 팀의 자식이 아닌 기준 · 최상위로의 이동 · 순환)은 던진다.
 */
export function toDisplayOrderMove(
  nodes: readonly AdminTeamNode[],
  move: AdminTeamMove,
): { parentTeamNo?: bigint; displayOrder: number } | null {
  const sorted = sortTeamTree(nodes)
  const at = locate(sorted, move.teamNo)
  if (at == null) throw new Error(`toDisplayOrderMove: 팀 ${move.teamNo} 이 트리에 없다`)
  if (move.beforeTeamNo === move.teamNo) {
    throw new Error('toDisplayOrderMove: 자기 자신 앞으로 옮길 수 없다')
  }
  const currentParent = at.parent?.teamNo ?? null

  if (move.parentTeamNo === currentParent) {
    const siblings = at.siblings
    const next = siblings[at.index + 1]?.teamNo ?? null
    if (move.beforeTeamNo === next) return null
    if (move.beforeTeamNo === null)
      return { displayOrder: siblings[siblings.length - 1]!.displayOrder }
    const target = siblings.findIndex((sibling) => sibling.teamNo === move.beforeTeamNo)
    if (target < 0) {
      throw new Error(`toDisplayOrderMove: 팀 ${move.beforeTeamNo} 은 그 상위 팀의 자식이 아니다`)
    }
    // 앞으로 가면 그 형제 자리, 뒤로 가면 기준 형제 바로 앞 형제 자리를 차지한다
    const slot = target < at.index ? siblings[target]! : siblings[target - 1]!
    return { displayOrder: slot.displayOrder }
  }

  if (move.parentTeamNo === null) {
    throw new Error('toDisplayOrderMove: 순서 값 서버는 최상위로의 이동을 표현하지 못한다')
  }
  if (contains(at.node, move.parentTeamNo)) {
    throw new Error('toDisplayOrderMove: 자기 하위 팀 밑으로 옮길 수 없다(순환)')
  }
  const parent = locate(sorted, move.parentTeamNo)
  if (parent == null) throw new Error(`toDisplayOrderMove: 상위 팀 ${move.parentTeamNo} 이 없다`)
  const siblings = parent.node.children
  if (move.beforeTeamNo === null) {
    const last = siblings[siblings.length - 1]
    return { parentTeamNo: move.parentTeamNo, displayOrder: last ? last.displayOrder + 1 : 0 }
  }
  const before = siblings.find((sibling) => sibling.teamNo === move.beforeTeamNo)
  if (before == null) {
    throw new Error(`toDisplayOrderMove: 팀 ${move.beforeTeamNo} 은 그 상위 팀의 자식이 아니다`)
  }
  return { parentTeamNo: move.parentTeamNo, displayOrder: before.displayOrder }
}

/**
 * 평평한 선택 상자 안에서 깊이를 글자로 — 깊이 0 이면 이름, 아니면 U+3000 × (depth − 1) + `└ ` + 이름.
 * 🔴 U+0020 은 HTML 공백 접기로 깊이 3 과 7 이 같아진다(hangang).
 */
export function indentTeamName(teamName: string, depth: number): string {
  if (depth <= 0) return teamName
  return `${TEAM_INDENT_UNIT.repeat(depth - 1)}${TEAM_BRANCH_MARK}${teamName}`
}
