// 인증 오류 문구 — 서비스 · 가드 · 테스트가 이 표 하나를 본다(스펙 §5 · §14 R6). 코드 · 상태는 admin-shared 코어 표.

export const AUTH_MESSAGES = {
  accessExpired: '접근 토큰이 만료되었습니다.',
  accessInvalid: '유효하지 않은 접근 토큰입니다.',
} as const
