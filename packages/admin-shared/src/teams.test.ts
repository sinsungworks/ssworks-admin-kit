import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  TEAM_NAME_MAX_LENGTH,
  adminTeamCreateResultSchema,
  adminTeamCreateSchema,
  adminTeamMoveBodySchema,
  adminTeamMoveSchema,
  adminTeamNodeSchema,
  adminTeamRenameSchema,
  adminTeamTreeSchema,
  teamNameSchema,
  type AdminTeamNode,
} from './teams.js'

const NODE: AdminTeamNode = {
  teamNo: 1n,
  teamName: '한강투자그룹',
  displayOrder: 0,
  children: [{ teamNo: 2n, teamName: '영업본부', displayOrder: 0, children: [] }],
}

describe('teamNameSchema', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(teamNameSchema.parse('  영업1팀 ')).toBe('영업1팀')
  })

  it('공백뿐이면 거부하고 문구를 낸다', () => {
    const result = teamNameSchema.safeParse('   ')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('팀 이름을 입력하세요.')
  })

  it('64자까지 받고 65자는 거부한다', () => {
    expect(TEAM_NAME_MAX_LENGTH).toBe(64)
    expect(teamNameSchema.safeParse('가'.repeat(64)).success).toBe(true)
    const result = teamNameSchema.safeParse('가'.repeat(65))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('팀 이름은 64자 이하로 정하세요.')
  })
})

describe('adminTeamNodeSchema', () => {
  it('재귀 노드를 받는다', () => {
    expect(adminTeamNodeSchema.parse(NODE)).toEqual(NODE)
  })

  it('teamNo 는 bigint 다', () => {
    expect(adminTeamNodeSchema.safeParse({ ...NODE, teamNo: 1 }).success).toBe(false)
  })

  it('자식의 모양도 검사한다', () => {
    expect(adminTeamNodeSchema.safeParse({ ...NODE, children: [{ teamNo: 2n }] }).success).toBe(
      false,
    )
  })

  it('추론 타입과 AdminTeamNode 가 서로 대입된다(타입 검사가 잰다)', () => {
    const inferred: z.infer<typeof adminTeamNodeSchema> = NODE
    const back: AdminTeamNode = adminTeamNodeSchema.parse(inferred)
    expect(back).toEqual(NODE)
  })
})

describe('adminTeamTreeSchema', () => {
  it('루트가 여럿일 수 있고 비어도 된다', () => {
    expect(adminTeamTreeSchema.parse({ items: [NODE, NODE] }).items).toHaveLength(2)
    expect(adminTeamTreeSchema.parse({ items: [] }).items).toEqual([])
  })

  it('단일 루트 모양({ item })은 받지 않는다 — 어댑터가 [item] 으로 감싼다', () => {
    expect(adminTeamTreeSchema.safeParse({ item: NODE }).success).toBe(false)
  })
})

describe('만들기 · 이름 바꾸기', () => {
  it('만들기 — parentTeamNo 는 null(최상위)을 받고, 생략은 받지 않는다', () => {
    expect(adminTeamCreateSchema.parse({ teamName: ' 영업4팀 ', parentTeamNo: null })).toEqual({
      teamName: '영업4팀',
      parentTeamNo: null,
    })
    expect(adminTeamCreateSchema.safeParse({ teamName: '영업4팀' }).success).toBe(false)
  })

  it('만들기 응답은 새 번호', () => {
    expect(adminTeamCreateResultSchema.parse({ teamNo: 9n })).toEqual({ teamNo: 9n })
  })

  it('이름 바꾸기 본문은 이름 하나', () => {
    expect(adminTeamRenameSchema.parse({ teamName: '영업1팀' })).toEqual({ teamName: '영업1팀' })
    expect(adminTeamRenameSchema.safeParse({ teamName: '' }).success).toBe(false)
  })
})

describe('이동(기준 형제 번호)', () => {
  it('parentTeamNo · beforeTeamNo 는 null 을 받는다', () => {
    const move = { teamNo: 5n, parentTeamNo: null, beforeTeamNo: null }
    expect(adminTeamMoveSchema.parse(move)).toEqual(move)
  })

  it('본문 스키마에는 teamNo 가 없다 — 경로로 간다', () => {
    const body = adminTeamMoveBodySchema.parse({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: 7n })
    expect(body).toEqual({ parentTeamNo: 3n, beforeTeamNo: 7n })
  })
})
