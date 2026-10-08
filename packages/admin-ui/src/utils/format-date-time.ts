// 날짜 기본 표기 — `SessionTable` · `LegalDocumentEditor` 가 함께 쓴다(3e 스펙 D21). 패키지 내부용(index 에서 내보내지 않는다).
//
// 정본: ssworks-gise-home apps/admin/src/types/session.ts 의 표기(3c 에서 session-table.ts 에 두었던 것을 옮겼다)

const pad = (value: number) => String(value).padStart(2, '0')

/** 브라우저 현지 시각 `YYYY-MM-DD HH:mm`. 형식이 틀린 값은 원문 그대로(gise). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
