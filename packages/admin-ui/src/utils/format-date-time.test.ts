import { describe, expect, it } from 'vitest'
import { formatDateTime } from './format-date-time.js'

// 시간대와 무관하게 잰다 — 로컬 시각으로 만든 Date 의 ISO 를 넣고 같은 로컬 시각이 나오는지 본다.
const local = (y: number, mo: number, d: number, h: number, mi: number, s: number) =>
  new Date(y, mo - 1, d, h, mi, s).toISOString()

describe('formatDateTime', () => {
  it('기본은 분까지', () => {
    expect(formatDateTime(local(2026, 10, 18, 14, 3, 9))).toBe('2026-10-18 14:03')
  })

  it('seconds 면 초까지 — 모두 두 자리', () => {
    expect(formatDateTime(local(2026, 1, 5, 4, 7, 2), { seconds: true })).toBe(
      '2026-01-05 04:07:02',
    )
  })

  it('형식이 틀린 값은 원문 그대로', () => {
    expect(formatDateTime('not-a-date', { seconds: true })).toBe('not-a-date')
  })
})
