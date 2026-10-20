// 감사 조회 문구 — 서비스 · 테스트가 이 표 하나를 본다(2c 스펙 §6).
// 2g: 얼린다 — ADMIN_SERVER_DEFAULT_MESSAGES 로 공개된다(http/messages.ts).

export const AUDIT_MESSAGES = Object.freeze({
  periodOrder: '끝 시각은 시작 시각보다 뒤여야 합니다.',
} as const)
