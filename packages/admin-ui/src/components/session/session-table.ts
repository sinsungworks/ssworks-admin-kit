import type { AdminSession, AdminSessionListItem } from '@ssworks/admin-shared'

// SessionTable 의 행 타입과 날짜 표기.
//
// 정본: ssworks-gise-home apps/admin/src/types/session.ts
// 바꾼 점: 행 모양을 admin-shared 세션 스키마에서 파생한다 — 관리자 목록 행이면 사용자 필드가 있다.

/** 내 세션 행(`AdminSession`) 또는 관리자 목록 행(`AdminSessionListItem`) */
export type SessionTableRow = AdminSession &
  Partial<Pick<AdminSessionListItem, 'userNo' | 'userId' | 'userName'>>

const pad = (value: number) => String(value).padStart(2, '0')

/** 브라우저 현지 시각 `YYYY-MM-DD HH:mm`. 형식이 틀린 값은 원문 그대로(gise). 패키지 내부용. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
