import { describe, expect, it } from 'vitest'
import { planRoleMove } from './move.js'

describe('planRoleMove — hangang 구간 재번호 + 자르기', () => {
  it('아래로: from < order ≤ to 를 한 칸 당긴다', () => {
    expect(planRoleMove(1, 3, 1, 5)).toEqual({
      from: 1,
      to: 3,
      shift: { delta: -1, min: 2, max: 3 },
    })
  })

  it('위로: to ≤ order < from 을 한 칸 민다', () => {
    expect(planRoleMove(4, 2, 1, 5)).toEqual({
      from: 4,
      to: 2,
      shift: { delta: 1, min: 2, max: 3 },
    })
  })

  it('같은 자리는 쓰기 없음', () => {
    expect(planRoleMove(2, 2, 1, 5)).toEqual({ from: 2, to: 2, shift: null })
  })

  it('🔴 범위 밖 목표는 [가장 작은 값, 가장 큰 값] 으로 자른다 — 구멍을 만들지 않는다(Review Focus 3)', () => {
    expect(planRoleMove(2, 99, 1, 5)).toEqual({
      from: 2,
      to: 5,
      shift: { delta: -1, min: 3, max: 5 },
    })
    expect(planRoleMove(3, 0, 1, 5)).toEqual({
      from: 3,
      to: 1,
      shift: { delta: 1, min: 1, max: 2 },
    })
  })
})
