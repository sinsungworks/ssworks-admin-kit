// 날짜 기본 표기 — `SessionTable` · `LegalDocumentEditor` · `AuditLogViewer` 가 함께 쓴다(3e 스펙 D21 · 3f 스펙 C5).
// 패키지 내부용(index 에서 내보내지 않는다).
//
// 정본: ssworks-gise-home apps/admin/src/types/session.ts 의 표기(3c 에서 session-table.ts 에 두었던 것을 옮겼다)
// 바꾼 점: 초 옵션 — 감사 로그는 같은 분 안의 순서를 읽어야 한다(hangang `formatLocalDateTime(…, { seconds: true })`).

const pad = (value: number) => String(value).padStart(2, '0')

export interface FormatDateTimeOptions {
  /** 기본 false. true 면 `YYYY-MM-DD HH:mm:ss` */
  seconds?: boolean
}

/** 브라우저 현지 시각 `YYYY-MM-DD HH:mm`(초 옵션이면 `:ss` 까지). 형식이 틀린 값은 원문 그대로(gise). */
export function formatDateTime(iso: string, options: FormatDateTimeOptions = {}): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const minutes = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return options.seconds === true ? `${minutes}:${pad(date.getSeconds())}` : minutes
}
