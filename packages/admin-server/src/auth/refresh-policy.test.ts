import { describe, expect, it } from 'vitest'
import {
  CLOCK_SKEW_TOLERANCE_MS,
  isWithinRefreshGrace,
  judgeRotatedReuse,
  type RotatedSessionView,
  type SuccessorSessionView,
} from './refresh-policy.js'

const revokedAt = new Date('2026-10-13T00:00:00.000Z')
const after = (ms: number) => new Date(revokedAt.getTime() + ms)

describe('isWithinRefreshGrace', () => {
  it('경과가 −5000 ~ graceMs 면 창 안이다(양 끝 포함)', () => {
    expect(isWithinRefreshGrace(revokedAt, after(0), 30_000)).toBe(true)
    expect(isWithinRefreshGrace(revokedAt, after(30_000), 30_000)).toBe(true)
    expect(isWithinRefreshGrace(revokedAt, after(30_001), 30_000)).toBe(false)
    expect(isWithinRefreshGrace(revokedAt, after(-CLOCK_SKEW_TOLERANCE_MS), 30_000)).toBe(true)
    expect(isWithinRefreshGrace(revokedAt, after(-CLOCK_SKEW_TOLERANCE_MS - 1), 30_000)).toBe(false)
  })

  it('🔴 시계 오차 하한은 5초로 고정이다 — 넓히면 시계가 앞선 서버가 쓴 행에서 탐지가 꺼진다(gise)', () => {
    expect(CLOCK_SKEW_TOLERANCE_MS).toBe(5000)
  })

  it('revokedAt 이 null 이거나 graceMs 가 0 이면 창 밖', () => {
    expect(isWithinRefreshGrace(null, after(0), 30_000)).toBe(false)
    expect(isWithinRefreshGrace(revokedAt, after(0), 0)).toBe(false)
  })
})

describe('judgeRotatedReuse', () => {
  const now = after(1000)
  const rotated: RotatedSessionView = { userNo: 1n, revokedAt, replacedBySessionNo: 20n }
  const successor: SuccessorSessionView = {
    sessionNo: 20n,
    userNo: 1n,
    isRevoked: false,
    expireAt: after(60_000),
  }

  it('창 안이고 후계가 살아 있으면 grace', () => {
    expect(judgeRotatedReuse(rotated, successor, now, 30_000)).toBe('grace')
  })

  it('창 밖이면 reuse', () => {
    expect(judgeRotatedReuse(rotated, successor, after(30_001), 30_000)).toBe('reuse')
  })

  it('graceMs 가 0 이면 늘 reuse', () => {
    expect(judgeRotatedReuse(rotated, successor, now, 0)).toBe('reuse')
  })

  it('🔴 replacedBySessionNo 가 null 이면 후계가 없는 것 — reuse(스펙 B4, fail-closed)', () => {
    expect(
      judgeRotatedReuse({ ...rotated, replacedBySessionNo: null }, successor, now, 30_000),
    ).toBe('reuse')
  })

  it('후계 없음 · 번호 다름 · 다른 사용자 · 폐기 · 만료(같은 순간 포함)면 reuse', () => {
    expect(judgeRotatedReuse(rotated, null, now, 30_000)).toBe('reuse')
    expect(judgeRotatedReuse(rotated, { ...successor, sessionNo: 21n }, now, 30_000)).toBe('reuse')
    expect(judgeRotatedReuse(rotated, { ...successor, userNo: 2n }, now, 30_000)).toBe('reuse')
    expect(judgeRotatedReuse(rotated, { ...successor, isRevoked: true }, now, 30_000)).toBe('reuse')
    expect(judgeRotatedReuse(rotated, { ...successor, expireAt: now }, now, 30_000)).toBe('reuse')
  })
})
