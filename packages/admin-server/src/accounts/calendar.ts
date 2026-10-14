// 정본: hangang-home packages/shared/src/utils/site-time.ts(기준 시간대의 오늘 · Intl 형식기 캐시 · isValidTimeZone)
// 바꾼 점:
//  - 인증 쪽 날짜 비교를 옮기지 않는다 — 인증은 효력 시각(resignAt ≤ now) 하나다(2d 스펙 ⑤ Z1). 날짜 → 효력 시각 계산은
//    여기 한 곳(startOfDayIn · effectiveResignAt)만 지난다.
//  - 0시가 없는 날(서머타임이 0시에 시작 — America/Sao_Paulo 2018-11-04)은 그날의 첫 순간(B15). 오프셋 표기(`+09:00`)는
//    Node 의 Intl 이 받아들이므로 IANA 모양 정규식이 거부한다(§14 R1-5).
// 🔴 날짜 열(DATE)에는 그날의 UTC 자정 Date 를 넘긴다(B3) — 프로세스 TZ = UTC(assertUtcTimezone)라 드라이버가 그 날짜로
//    쓰고 읽는다(§14 R1-5). 테이블 타입(Date)을 바꾸지 않는다.

/** 기준 시간대 기본값(⑤ TZ1) — 네 정본이 모두 KST 서비스다 */
export const DEFAULT_TIME_ZONE = 'Asia/Seoul'

/** `UTC` 또는 `Area/City`(…/…) — 오프셋 표기 · 약어(KST)는 거부. 슬래시가 들어 RegExp 생성자로 쓴다 */
const IANA_TIME_ZONE = new RegExp('^(UTC|[A-Za-z]+(/[A-Za-z0-9_+-]+)+)$')

const formatters = new Map<string, Intl.DateTimeFormat>()

/** 🔴 hourCycle h23 — en-US 의 24시 표기(자정 = 24)가 끼면 날짜가 하루 밀린다 */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** 그 순간의 그 시간대 벽시계 */
function wallClock(instant: Date, timeZone: string): WallClock {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  }
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

function formatDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

function dateParts(date: string): [number, number, number] {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number)
  return [year, month, day]
}

/** 순간 → 그 시간대의 날짜 'YYYY-MM-DD' */
export function dateIn(instant: Date, timeZone: string): string {
  const clock = wallClock(instant, timeZone)
  return formatDate(clock.year, clock.month, clock.day)
}

/** 기준 시간대의 오늘 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dateIn(now, timeZone)
}

/** 'YYYY-MM-DD' 에 days 일을 더한다(달 · 해 · 윤일 넘김) */
export function addDays(date: string, days: number): string {
  const [year, month, day] = dateParts(date)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** 그 순간의 벽시계를 UTC 로 읽은 값 − 그 순간(초 단위) = 그 시간대의 오프셋(ms) */
function offsetAt(epochMs: number, timeZone: string): number {
  const clock = wallClock(new Date(epochMs), timeZone)
  const asUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  )
  return asUtc - Math.floor(epochMs / 1000) * 1000
}

/**
 * 그날 0시(기준 시간대)의 UTC 순간. 오프셋을 두 번 보정한다 — 서머타임 경계 앞뒤에서 맞는다(§14 R1-5).
 * 🔴 0시가 없는 날(서머타임이 0시에 시작)은 그날의 첫 순간을 돌려준다(B15). 후보 둘 중 그 날짜인 것만 고르고, 0시 정각이
 *    있으면 그것, 없으면 이른 것.
 */
export function startOfDayIn(date: string, timeZone: string): Date {
  const [year, month, day] = dateParts(date)
  const midnight = Date.UTC(year, month - 1, day)
  const first = midnight - offsetAt(midnight, timeZone)
  const second = midnight - offsetAt(first, timeZone)
  const sameDay = [first, second].filter(
    (candidate) => dateIn(new Date(candidate), timeZone) === date,
  )
  const exact = sameDay.find((candidate) => {
    const clock = wallClock(new Date(candidate), timeZone)
    return clock.hour === 0 && clock.minute === 0 && clock.second === 0
  })
  if (exact !== undefined) return new Date(exact)
  if (sameDay.length > 0) return new Date(Math.min(...sameDay))
  // 하루 넘게 뛰는 오프셋은 없다 — 닿으면 계산이 틀린 것이다
  throw new Error(`${timeZone} 에서 ${date} 의 시작 시각을 셈할 수 없다.`)
}

/** 퇴사일 D 의 효력 시각 = 기준 시간대 D + 1 일 0시(⑤ Z1 — "퇴사일 당일까지 근무"). 🔴 효력 시각은 이 함수만 셈한다 */
export function effectiveResignAt(date: string, timeZone: string): Date {
  return startOfDayIn(addDays(date, 1), timeZone)
}

/** 'YYYY-MM-DD' → 그날 UTC 자정 Date — DATE 열에 넘기는 값(B3) */
export function toDateColumn(date: string): Date {
  const [year, month, day] = dateParts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

/** DATE 열에서 읽은 Date → 'YYYY-MM-DD'(쓸 때 UTC 자정이었다) */
export function fromDateColumn(value: Date): string {
  return formatDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
}

/**
 * 코어 옵션 `timeZone` 을 푼다. 없으면 'Asia/Seoul'. Intl(ICU) 가 내는 이름을 돌려준다 —
 * 대개 정규 이름이고 일부는 옛 이름이다(ICU 판에 따라 다르다: `'Asia/Kolkata'` → `'Asia/Calcutta'`). `'asia/seoul'` → `'Asia/Seoul'`,
 * `'US/Eastern'` → `'America/New_York'`(2d-3 스펙 ⑤ N1). 셈 · 감사 meta 가 한 표기를 쓴다.
 * 🔴 기동에서 멈춘다: IANA 모양이 아님(`+09:00` · `KST`) · Intl 이 모르는 이름(B15).
 * 🔴 링크 이름의 정규 이름은 ICU 판마다 다를 수 있다 — 거부하지 않고 바꿔 둔다(Node 를 올려도 기동이 깨지지 않게).
 */
export function resolveTimeZone(value: unknown): string {
  if (typeof value === 'undefined') return DEFAULT_TIME_ZONE
  if (typeof value === 'string' && IANA_TIME_ZONE.test(value)) {
    try {
      return formatterFor(value).resolvedOptions().timeZone
    } catch {
      // Intl 이 모르는 이름 — 아래 문구로 멈춘다
    }
  }
  throw new Error(
    `timeZone 은 IANA 시간대 이름이어야 한다(예: 'Asia/Seoul' · 'UTC' — '+09:00' 같은 오프셋 표기는 안 된다). 받은 값: ${String(value)}`,
  )
}

/**
 * MariaDB TIMESTAMP 열이 담는 순간의 범위 — 11.4 LTS 기준(11.5+ 는 상한이 2106 이지만 보수적으로 둔다).
 * 🔴 users.joinAt · resignAt 은 TIMESTAMP 다. 날짜 계약(1000~9999년)보다 좁다 — 쓰기 전에 이 범위를 본다(최종 리뷰).
 */
export const TIMESTAMP_MIN = new Date('1970-01-01T00:00:01.000Z')
export const TIMESTAMP_MAX = new Date('2038-01-19T03:14:07.000Z')

export function fitsTimestampColumn(instant: Date): boolean {
  const time = instant.getTime()
  return time >= TIMESTAMP_MIN.getTime() && time <= TIMESTAMP_MAX.getTime()
}
