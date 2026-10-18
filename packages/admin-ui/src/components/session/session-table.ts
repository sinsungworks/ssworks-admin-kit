import type { AdminSession, AdminSessionListItem } from '@ssworks/admin-shared'

// SessionTable 의 행 타입. 날짜 표기는 `utils/format-date-time.ts`.
//
// 정본: ssworks-gise-home apps/admin/src/types/session.ts
// 바꾼 점: 행 모양을 admin-shared 세션 스키마에서 파생한다 — 관리자 목록 행이면 사용자 필드가 있다.
//          3h — 표 문구 타입 · 기본값(`messages` 부분 덮어쓰기, C2 · ringside 보고 §3).

/** 내 세션 행(`AdminSession`) 또는 관리자 목록 행(`AdminSessionListItem`) */
export type SessionTableRow = AdminSession &
  Partial<Pick<AdminSessionListItem, 'userNo' | 'userId' | 'userName'>>

/** 접근 이름 함수가 받는 값 — 표가 이미 셈한 것 */
export interface SessionLabelView {
  /** `describeUserAgent` 결과 */
  device: string
  /** `formatDate` 를 거친 마지막 활동 시각 */
  lastAccessAt: string
  showUser: boolean
  /** 그 행 버튼의 병합된 문구 */
  button: string
}

/**
 * 표 문구. `SessionTable` 의 `messages` 또는 `useSessions({ messages })` 로 일부만 덮는다(C2).
 * 함수 키는 메서드 꼴(bivariant)이다 — 쓰는 쪽이 자기 행 타입으로 적어도 된다.
 */
export interface SessionTableMessages {
  userColumn: string
  deviceColumn: string
  ipColumn: string
  loginAtColumn: string
  lastAccessAtColumn: string
  expireAtColumn: string
  /** 현재 세션 칩 */
  currentDevice: string
  /** 현재 세션 행의 동작 칸 안내 */
  currentDeviceNote: string
  revokeButton: string
  revokeButtonLabel(row: SessionTableRow, view: SessionLabelView): string
  revokeUserButton: string
  /** 🔴 기본값은 `view.button` 을 쓴다 — 버튼 문구를 바꾸면 접근 이름이 따라온다(3h S4) */
  revokeUserButtonLabel(row: SessionTableRow, view: SessionLabelView): string
}

/**
 * 기본 문구 — `index.ts` 로 내보내지 않는다(C2). 3h 전에 `SessionTable` 에 박혀 있던 글자 그대로다.
 * `useSessions` 가 확인 창 제목의 기본값으로 `revokeUserButton` 을 읽는다.
 */
export const DEFAULT_SESSION_TABLE_MESSAGES: SessionTableMessages = {
  userColumn: '사용자',
  deviceColumn: '기기',
  ipColumn: 'IP',
  loginAtColumn: '로그인',
  lastAccessAtColumn: '마지막 활동',
  expireAtColumn: '만료',
  currentDevice: '이 기기',
  currentDeviceNote: '이 기기는 로그아웃으로 끝냅니다.',
  revokeButton: '끝내기',
  revokeButtonLabel: (row, view) =>
    `${view.showUser && row.userName ? `${row.userName} · ` : ''}${view.device} 세션 끝내기 (마지막 활동 ${view.lastAccessAt})`,
  revokeUserButton: '사용자 전체 끊기',
  revokeUserButtonLabel: (row, view) => `${row.userName ?? ''}(${row.userId ?? ''}) ${view.button}`,
}
