/// <reference types="vitest" />
import { describe, expect, it } from 'vitest'
import type { AdminTeamNode } from './teams.js'
import {
  TEAM_BRANCH_MARK,
  TEAM_INDENT_UNIT,
  filterTeamTree,
  findTeamPlacement,
  flattenTeamTree,
  indentTeamName,
  moveTargets,
  siblingMove,
  sortTeamTree,
  toDisplayOrderMove,
} from './team-tree.js'

const n = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  children: AdminTeamNode[] = [],
): AdminTeamNode => ({ teamNo: BigInt(teamNo), teamName, displayOrder, children })

/** 서버가 형제를 뒤집어 보낸 모양 — 정렬을 시험한다. 영업본부 아래 순서 값에 빈 번호(0 · 5 · 9)가 있다(hangang). */
const TREE = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [
    n(3, '관리본부', 5, [n(7, '인사팀', 0)]),
    n(2, '영업본부', 0, [n(6, '분당지점', 9), n(4, '강남지점', 0), n(5, '판교지점', 5)]),
    n(9, '시스템 관리', 9),
  ]),
]

const names = (nodes: AdminTeamNode[]) => flattenTeamTree(nodes).map((row) => row.teamName)
const rowOf = (teamNo: bigint) => flattenTeamTree(TREE()).find((row) => row.teamNo === teamNo)!

describe('sortTeamTree', () => {
  it('모든 단계의 형제를 displayOrder 오름차순으로 정렬한다', () => {
    const sorted = sortTeamTree(TREE())
    expect(sorted[0]!.children.map((c) => c.teamName)).toEqual([
      '영업본부',
      '관리본부',
      '시스템 관리',
    ])
    expect(sorted[0]!.children[0]!.children.map((c) => c.teamName)).toEqual([
      '강남지점',
      '판교지점',
      '분당지점',
    ])
  })

  it('같은 값이면 받은 순서를 지킨다', () => {
    expect(
      sortTeamTree([n(1, '가', 3), n(2, '나', 3), n(3, '다', 1)]).map((x) => x.teamName),
    ).toEqual(['다', '가', '나'])
  })

  it('🔴 입력을 바꾸지 않는다 — 결과는 사본이다(D1)', () => {
    const input = TREE()
    const before = structuredClone(input)
    const sorted = sortTeamTree(input)
    expect(input).toEqual(before)
    expect(sorted[0]).not.toBe(input[0])
  })
})

describe('flattenTeamTree', () => {
  it('정렬한 뒤 깊이 우선으로 펼친다', () => {
    const rows = flattenTeamTree(TREE())
    expect(rows.map((r) => r.teamName)).toEqual([
      '한강투자그룹',
      '영업본부',
      '강남지점',
      '판교지점',
      '분당지점',
      '관리본부',
      '인사팀',
      '시스템 관리',
    ])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2, 2, 1, 2, 1])
  })

  it('상위 팀 번호 · 이름을 단다 — 루트는 null', () => {
    expect(rowOf(5n)).toMatchObject({ parentTeamNo: 2n, parentTeamName: '영업본부' })
    expect(rowOf(1n)).toMatchObject({ parentTeamNo: null, parentTeamName: null })
  })

  it('하위 팀 수는 자기를 뺀 전부다', () => {
    expect(rowOf(1n).descendantCount).toBe(7)
    expect(rowOf(2n).descendantCount).toBe(3)
    expect(rowOf(3n).descendantCount).toBe(1)
    expect(rowOf(4n).descendantCount).toBe(0)
  })

  it('앞뒤 형제 번호 — 가장자리 · 루트는 null', () => {
    expect(rowOf(5n)).toMatchObject({ prevSiblingTeamNo: 4n, nextSiblingTeamNo: 6n })
    expect(rowOf(4n).prevSiblingTeamNo).toBeNull()
    expect(rowOf(6n).nextSiblingTeamNo).toBeNull()
    expect(rowOf(1n)).toMatchObject({ prevSiblingTeamNo: null, nextSiblingTeamNo: null })
  })

  it('루트가 여럿이면 차례로 펼친다', () => {
    const rows = flattenTeamTree([n(1, 'A', 1), n(2, 'B', 0)])
    expect(rows.map((r) => r.teamName)).toEqual(['B', 'A'])
    expect(rows[0]!.nextSiblingTeamNo).toBe(1n)
  })

  it('빈 배열이면 []', () => {
    expect(flattenTeamTree([])).toEqual([])
  })
})

describe('filterTeamTree — 부모 포함 검색(hangang R17)', () => {
  it('일치한 팀과 그 조상만 남긴다', () => {
    expect(names(filterTeamTree(TREE(), '판교'))).toEqual(['한강투자그룹', '영업본부', '판교지점'])
  })

  it('🔴 부모가 일치해도 일치하지 않은 자식은 따라오지 않는다', () => {
    expect(names(filterTeamTree(TREE(), '영업'))).toEqual(['한강투자그룹', '영업본부'])
  })

  it('형제 여럿이 일치해도 부모는 한 번, 순서는 정렬 순서', () => {
    expect(names(filterTeamTree(TREE(), '지점'))).toEqual([
      '한강투자그룹',
      '영업본부',
      '강남지점',
      '판교지점',
      '분당지점',
    ])
    expect(names(filterTeamTree(TREE(), '관리'))).toEqual([
      '한강투자그룹',
      '관리본부',
      '시스템 관리',
    ])
  })

  it('대소문자를 무시하고 앞뒤 공백을 지운다', () => {
    expect(names(filterTeamTree([n(1, 'Sales Team', 0)], '  SALES '))).toEqual(['Sales Team'])
  })

  it('빈 검색어면 정렬한 전체, 아무것도 안 맞으면 []', () => {
    expect(names(filterTeamTree(TREE(), '  '))).toHaveLength(8)
    expect(filterTeamTree(TREE(), '없는팀')).toEqual([])
  })
})

describe('findTeamPlacement — 주어진 순서 그대로', () => {
  it('정렬하지 않는다 — 드래그로 바뀐 사본의 자리를 읽는 함수다', () => {
    expect(findTeamPlacement(TREE(), 2n)).toEqual({ parentTeamNo: 1n, beforeTeamNo: 9n })
    expect(findTeamPlacement(TREE(), 3n)).toEqual({ parentTeamNo: 1n, beforeTeamNo: 2n })
    expect(findTeamPlacement(TREE(), 6n)).toEqual({ parentTeamNo: 2n, beforeTeamNo: 4n })
  })

  it('막내 · 최상위 · 없는 번호', () => {
    expect(findTeamPlacement(TREE(), 9n)).toEqual({ parentTeamNo: 1n, beforeTeamNo: null })
    expect(findTeamPlacement(TREE(), 1n)).toEqual({ parentTeamNo: null, beforeTeamNo: null })
    expect(findTeamPlacement(TREE(), 99n)).toBeNull()
  })
})

describe('siblingMove — ↑↓ 의 이동 요청', () => {
  it('↑ 는 바로 앞 형제 앞으로', () => {
    expect(siblingMove(TREE(), 5n, 'up')).toEqual({
      teamNo: 5n,
      parentTeamNo: 2n,
      beforeTeamNo: 4n,
    })
  })

  it('↓ 는 바로 뒤 형제 뒤로 — 그다음 형제 앞, 없으면 맨 끝(null)', () => {
    expect(siblingMove(TREE(), 4n, 'down')).toEqual({
      teamNo: 4n,
      parentTeamNo: 2n,
      beforeTeamNo: 6n,
    })
    expect(siblingMove(TREE(), 5n, 'down')).toEqual({
      teamNo: 5n,
      parentTeamNo: 2n,
      beforeTeamNo: null,
    })
    expect(siblingMove(TREE(), 2n, 'down')).toEqual({
      teamNo: 2n,
      parentTeamNo: 1n,
      beforeTeamNo: 9n,
    })
  })

  it('첫째 ↑ · 막내 ↓ · 하나뿐인 루트 · 없는 번호는 null', () => {
    expect(siblingMove(TREE(), 4n, 'up')).toBeNull()
    expect(siblingMove(TREE(), 6n, 'down')).toBeNull()
    expect(siblingMove(TREE(), 1n, 'up')).toBeNull()
    expect(siblingMove(TREE(), 1n, 'down')).toBeNull()
    expect(siblingMove(TREE(), 99n, 'up')).toBeNull()
  })
})

describe('moveTargets — 옮기기 선택지', () => {
  it('🔴 자기 · 자기 하위 팀(순환) · 지금 상위 팀을 빼고 조직도 순서 · 들여쓰기로', () => {
    expect(moveTargets(TREE(), 2n)).toEqual([
      { parentTeamNo: 3n, teamName: '관리본부', title: '└ 관리본부', depth: 1 },
      { parentTeamNo: 7n, teamName: '인사팀', title: '　└ 인사팀', depth: 2 },
      { parentTeamNo: 9n, teamName: '시스템 관리', title: '└ 시스템 관리', depth: 1 },
    ])
    expect(moveTargets(TREE(), 5n).map((t) => t.parentTeamNo)).toEqual([1n, 4n, 6n, 3n, 7n, 9n])
  })

  it('canReceive 가 거짓인 팀을 뺀다', () => {
    const targets = moveTargets(TREE(), 5n, { canReceive: (node) => node.teamNo !== 9n })
    expect(targets.map((t) => t.parentTeamNo)).toEqual([1n, 4n, 6n, 3n, 7n])
  })

  it('topLevel 이면 맨 앞에 최상위 — 이미 최상위인 팀에는 없다', () => {
    const targets = moveTargets(TREE(), 5n, { topLevel: true })
    expect(targets[0]).toEqual({ parentTeamNo: null, teamName: null, title: '최상위', depth: 0 })
    expect(targets).toHaveLength(7)
    expect(moveTargets(TREE(), 1n, { topLevel: true })).toEqual([])
  })

  it('없는 번호면 []', () => {
    expect(moveTargets(TREE(), 99n)).toEqual([])
  })
})

describe('toDisplayOrderMove — 순서 값을 받는 기존 서버(hangang)용', () => {
  it('같은 상위 팀 · 앞으로 — 그 형제의 값, parentTeamNo 키 없음', () => {
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 4n }),
    ).toStrictEqual({ displayOrder: 0 })
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 5n }),
    ).toStrictEqual({ displayOrder: 5 })
  })

  it('🔴 같은 상위 팀 · 뒤로 — 기준 형제 바로 앞 형제의 값(빈 번호가 있어도 ±1 이 아니다)', () => {
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 4n, parentTeamNo: 2n, beforeTeamNo: 6n }),
    ).toStrictEqual({ displayOrder: 5 })
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: null }),
    ).toStrictEqual({ displayOrder: 9 })
  })

  it('제자리면 null', () => {
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 4n, parentTeamNo: 2n, beforeTeamNo: 5n }),
    ).toBeNull()
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: null }),
    ).toBeNull()
  })

  it('다른 상위 팀 — 기준 형제의 값, 맨 끝이면 최댓값 + 1, 형제가 없으면 0', () => {
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: 7n }),
    ).toStrictEqual({ parentTeamNo: 3n, displayOrder: 0 })
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null }),
    ).toStrictEqual({ parentTeamNo: 3n, displayOrder: 1 })
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 9n, beforeTeamNo: null }),
    ).toStrictEqual({ parentTeamNo: 9n, displayOrder: 0 })
  })

  it('킷 이벤트가 만들지 않는 요청은 던진다', () => {
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 99n, parentTeamNo: 2n, beforeTeamNo: null }),
    ).toThrow()
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: 4n }),
    ).toThrow()
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 5n }),
    ).toThrow()
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: null, beforeTeamNo: null }),
    ).toThrow()
  })

  it('🔴 자기 하위 팀 밑으로 옮기는 요청(순환)은 던진다', () => {
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 2n, parentTeamNo: 4n, beforeTeamNo: null }),
    ).toThrow()
  })
})

describe('indentTeamName', () => {
  it('깊이 0 이면 이름 그대로, 1 이면 └ 만', () => {
    expect(indentTeamName('팀', 0)).toBe('팀')
    expect(indentTeamName('팀', -1)).toBe('팀')
    expect(indentTeamName('팀', 1)).toBe('└ 팀')
  })

  it('🔴 들여쓰기는 U+3000 · 표시는 U+2514 U+0020 — U+0020 은 HTML 공백 접기로 깊이가 뭉개진다', () => {
    expect([...TEAM_INDENT_UNIT].map((c) => c.codePointAt(0))).toEqual([0x3000])
    expect([...TEAM_BRANCH_MARK].map((c) => c.codePointAt(0))).toEqual([0x2514, 0x20])
    expect([...indentTeamName('팀', 3)].slice(0, 4).map((c) => c.codePointAt(0))).toEqual([
      0x3000, 0x3000, 0x2514, 0x20,
    ])
    expect(indentTeamName('팀', 3)).not.toBe(indentTeamName('팀', 7))
  })
})
