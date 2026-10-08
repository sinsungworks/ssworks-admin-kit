import type { AdminSession, AdminSessionListItem } from '@ssworks/admin-shared'

// SessionTable 의 행 타입. 날짜 표기는 `utils/format-date-time.ts`.
//
// 정본: ssworks-gise-home apps/admin/src/types/session.ts
// 바꾼 점: 행 모양을 admin-shared 세션 스키마에서 파생한다 — 관리자 목록 행이면 사용자 필드가 있다.

/** 내 세션 행(`AdminSession`) 또는 관리자 목록 행(`AdminSessionListItem`) */
export type SessionTableRow = AdminSession &
  Partial<Pick<AdminSessionListItem, 'userNo' | 'userId' | 'userName'>>
