// 로컬 날짜(`YYYY-MM-DD`) ↔ ISO 경계 — 감사 로그 기간 필터(3f 스펙 A7). 패키지 내부용.
//
// 정본: hangang-home apps/admin/src/utils/local-time.ts `isDateOnly` · `localDayStartIso` · `localNextDayStartIso`
// 바꾼 점: 시간대 인자를 없앴다 — 서버 · DB 는 UTC, 화면은 브라우저 로컬이다(hangang 2026-10-04 원칙). 실제로 없는
//   날짜(`2026-02-30`)를 거부한다 — `new Date` 는 그것을 3월 2일로 넘겨 버린다.

const DATE_ONLY = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/

function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value)
  if (match == null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  // 🔴 넘친 날짜를 거부한다 — 2026-02-30 은 3월 2일이 되고, 0~99 년은 1900 년대가 된다
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** `YYYY-MM-DD` 이고 실제로 있는 날짜인가 */
export function isDateOnly(value: string): boolean {
  return parseDateOnly(value) !== null
}

/** 그날 로컬 0시의 ISO. 형식이 틀리면 null */
export function localDayStartIso(value: string): string | null {
  return parseDateOnly(value)?.toISOString() ?? null
}

/** 다음 날 로컬 0시의 ISO — 서버가 끝을 `<` 로 비교하는 반열림 구간의 끝. 형식이 틀리면 null */
export function localNextDayStartIso(value: string): string | null {
  const date = parseDateOnly(value)
  if (date == null) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString()
}
