import { describe, expect, it } from 'vitest'
import { buildTeamTree, type TeamTreeRow } from './tree.js'

const row = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  parentTeamNo: number | null,
): TeamTreeRow => ({
  teamNo: BigInt(teamNo),
  teamName,
  displayOrder,
  parentTeamNo: parentTeamNo === null ? null : BigInt(parentTeamNo),
})

/** 이름 · 자식만 — 'R1(A(a),B)' 꼴 */
const shape = (nodes: ReturnType<typeof buildTeamTree>['items']): string =>
  nodes
    .map((node) =>
      node.children.length === 0 ? node.teamName : `${node.teamName}(${shape(node.children)})`,
    )
    .join(',')

describe('buildTeamTree', () => {
  it('빈 목록은 [] · 경고 없음', () => {
    expect(buildTeamTree([])).toEqual({ items: [], warnings: [] })
  })

  it('루트가 여럿 · 깊이 · 노드 모양(teamNo · teamName · displayOrder · children)', () => {
    const { items, warnings } = buildTeamTree([
      row(1, 'R1', 0, null),
      row(2, 'A', 0, 1),
      row(4, 'a', 0, 2),
      row(3, 'R2', 1, null),
    ])
    expect(warnings).toEqual([])
    expect(shape(items)).toBe('R1(A(a)),R2')
    expect(items[1]).toEqual({ teamNo: 3n, teamName: 'R2', displayOrder: 1, children: [] })
  })

  it('형제는 받은 행 순서 그대로(쿼리가 displayOrder · teamNo 순으로 준다)', () => {
    const { items } = buildTeamTree([
      row(1, 'P', 0, null),
      row(9, 'first', 0, 1),
      row(5, 'second', 1, 1),
    ])
    expect(shape(items)).toBe('P(first,second)')
  })

  it('깊이 1 조상이 둘(손상)이면 작은 번호를 상위 팀으로 쓰고 경고한다', () => {
    const { items, warnings } = buildTeamTree([
      row(1, 'P1', 0, null),
      row(2, 'P2', 1, null),
      row(5, 'X', 0, 1),
      row(5, 'X', 0, 2),
    ])
    expect(shape(items)).toBe('P1(X),P2')
    expect(warnings).toEqual([
      '팀 5 의 상위 팀(closure 깊이 1 행)이 둘 이상이다 — 작은 번호 1 을 쓴다',
    ])
  })

  it('🔴 상위 팀이 목록에 없거나 순환이면 경고하고 내지 않는다 — 끝난다', () => {
    const { items, warnings } = buildTeamTree([
      row(1, 'R', 0, null),
      row(7, 'orphan', 0, 99),
      row(10, 'p', 0, 11),
      row(11, 'q', 0, 10),
    ])
    expect(shape(items)).toBe('R')
    expect(warnings).toEqual([
      '팀 7 의 상위 팀 99 가 목록에 없다 — 내지 않는다',
      '팀 10 이 루트에서 닿지 않는다(closure 순환) — 내지 않는다',
      '팀 11 이 루트에서 닿지 않는다(closure 순환) — 내지 않는다',
    ])
  })
})
