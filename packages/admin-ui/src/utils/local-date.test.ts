import { describe, expect, it } from 'vitest'
import { isDateOnly, localDayStartIso, localNextDayStartIso } from './local-date.js'

// 시간대와 무관하게 잰다 — 기대값을 같은 로컬 달력의 `new Date(y, m - 1, d)` 로 만든다.
const localMidnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

describe('isDateOnly', () => {
  it('YYYY-MM-DD 이고 실제로 있는 날짜만 참', () => {
    expect(isDateOnly('2026-10-18')).toBe(true)
    expect(isDateOnly('2028-02-29')).toBe(true)
  })

  it.each([
    '',
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-2-3',
    ' 2026-10-18',
    '2026-10-18T00:00',
    '20261018',
    '0050-01-01',
  ])('%j 는 거짓', (value) => {
    expect(isDateOnly(value)).toBe(false)
  })
})

describe('localDayStartIso · localNextDayStartIso', () => {
  it('그날 로컬 0시', () => {
    expect(localDayStartIso('2026-10-18')).toBe(localMidnight(2026, 10, 18))
  })

  it('다음 날 로컬 0시 — 반열림 끝', () => {
    expect(localNextDayStartIso('2026-10-18')).toBe(localMidnight(2026, 10, 19))
  })

  it('월말 · 연말 · 윤일을 넘긴다', () => {
    expect(localNextDayStartIso('2026-10-31')).toBe(localMidnight(2026, 11, 1))
    expect(localNextDayStartIso('2026-12-31')).toBe(localMidnight(2027, 1, 1))
    expect(localNextDayStartIso('2028-02-29')).toBe(localMidnight(2028, 3, 1))
  })

  it('형식이 틀리면 null', () => {
    expect(localDayStartIso('2026-02-30')).toBeNull()
    expect(localNextDayStartIso('')).toBeNull()
  })
})
