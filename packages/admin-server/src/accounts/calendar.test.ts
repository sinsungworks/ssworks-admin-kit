import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIME_ZONE,
  addDays,
  dateIn,
  effectiveResignAt,
  TIMESTAMP_MAX,
  TIMESTAMP_MIN,
  fitsTimestampColumn,
  fromDateColumn,
  resolveTimeZone,
  startOfDayIn,
  toDateColumn,
  todayIn,
} from './calendar.js'

const iso = (date: Date) => date.toISOString()

describe('todayIn · dateIn', () => {
  it('🔴 UTC 15:00 = KST 자정 — 경계 앞뒤', () => {
    expect(todayIn('Asia/Seoul', new Date('2026-10-31T14:59:59Z'))).toBe('2026-10-31')
    expect(todayIn('Asia/Seoul', new Date('2026-10-31T15:00:00Z'))).toBe('2026-11-01')
    expect(todayIn('UTC', new Date('2026-10-31T15:00:00Z'))).toBe('2026-10-31')
    expect(dateIn(new Date('2026-03-08T04:59:59Z'), 'America/New_York')).toBe('2026-03-07')
  })
})

describe('startOfDayIn · effectiveResignAt', () => {
  it('Asia/Seoul — 스펙 §5-1 표 그대로', () => {
    expect(iso(effectiveResignAt('2026-10-31', 'Asia/Seoul'))).toBe('2026-10-31T15:00:00.000Z')
    expect(iso(startOfDayIn('2026-11-02', 'Asia/Seoul'))).toBe('2026-11-01T15:00:00.000Z')
  })

  it('America/New_York — 서머타임 시작 · 끝 앞뒤', () => {
    expect(iso(startOfDayIn('2026-03-08', 'America/New_York'))).toBe('2026-03-08T05:00:00.000Z')
    expect(iso(startOfDayIn('2026-03-09', 'America/New_York'))).toBe('2026-03-09T04:00:00.000Z')
    expect(iso(startOfDayIn('2026-11-01', 'America/New_York'))).toBe('2026-11-01T04:00:00.000Z')
    expect(iso(startOfDayIn('2026-11-02', 'America/New_York'))).toBe('2026-11-02T05:00:00.000Z')
  })

  it('🔴 0시가 없는 날은 그날의 첫 순간(B15) — 0시에 시계를 되돌리는 날도 그날의 0시', () => {
    // 2018-11-04 0시에 서머타임 시작(0시 → 1시) — 그날의 첫 순간은 현지 01:00 = 03:00Z(§14 R1-5)
    expect(iso(startOfDayIn('2018-11-04', 'America/Sao_Paulo'))).toBe('2018-11-04T03:00:00.000Z')
    // 2019-02-17 0시에 서머타임 끝(0시 → 전날 23시) — 그날 0시는 한 번, 03:00Z
    expect(iso(startOfDayIn('2019-02-17', 'America/Sao_Paulo'))).toBe('2019-02-17T03:00:00.000Z')
  })

  it('달 · 해 · 윤일 넘김', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(iso(effectiveResignAt('2026-12-31', 'Asia/Seoul'))).toBe('2026-12-31T15:00:00.000Z')
    expect(iso(effectiveResignAt('2028-02-28', 'UTC'))).toBe('2028-02-29T00:00:00.000Z')
  })
})

describe('fitsTimestampColumn', () => {
  it('🔴 TIMESTAMP 범위 경계 — 1970-01-01 00:00:01Z ~ 2038-01-19 03:14:07Z(최종 리뷰 F1)', () => {
    expect(fitsTimestampColumn(TIMESTAMP_MIN)).toBe(true)
    expect(fitsTimestampColumn(TIMESTAMP_MAX)).toBe(true)
    expect(fitsTimestampColumn(new Date(TIMESTAMP_MIN.getTime() - 1))).toBe(false)
    expect(fitsTimestampColumn(new Date(TIMESTAMP_MAX.getTime() + 1))).toBe(false)
    expect(fitsTimestampColumn(startOfDayIn('1970-01-01', 'Asia/Seoul'))).toBe(false)
    expect(fitsTimestampColumn(startOfDayIn('1970-01-02', 'Asia/Seoul'))).toBe(true)
    expect(fitsTimestampColumn(effectiveResignAt('2038-01-18', 'Asia/Seoul'))).toBe(true)
    expect(fitsTimestampColumn(effectiveResignAt('2038-01-19', 'Asia/Seoul'))).toBe(false)
  })
})

describe('toDateColumn · fromDateColumn', () => {
  it('🔴 날짜 열에는 그날 UTC 자정 Date(B3) — 오가도 같은 날짜', () => {
    expect(iso(toDateColumn('2028-02-29'))).toBe('2028-02-29T00:00:00.000Z')
    expect(fromDateColumn(toDateColumn('2028-02-29'))).toBe('2028-02-29')
    expect(fromDateColumn(new Date('2026-01-05T00:00:00.000Z'))).toBe('2026-01-05')
  })
})

describe('resolveTimeZone', () => {
  it('없으면 Asia/Seoul, IANA 이름은 그대로', () => {
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE)
    expect(DEFAULT_TIME_ZONE).toBe('Asia/Seoul')
    for (const zone of ['UTC', 'Asia/Seoul', 'America/Argentina/Buenos_Aires', 'Etc/GMT+9']) {
      expect(resolveTimeZone(zone)).toBe(zone)
    }
  })

  it('🔴 오프셋 표기 · 약어 · 모르는 이름 · 문자열 아님은 멈춘다(B15 — Node 의 Intl 은 +09:00 을 받는다, §14 R1-5)', () => {
    for (const value of ['+09:00', 'KST', 'Asia/Seoull', ' Asia/Seoul', '', 9, null]) {
      expect(() => resolveTimeZone(value), String(value)).toThrow(
        'timeZone 은 IANA 시간대 이름이어야 한다',
      )
    }
  })
})
