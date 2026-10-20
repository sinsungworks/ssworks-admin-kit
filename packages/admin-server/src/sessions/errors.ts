// 세션 라우트 문구 — 서비스 · 테스트가 이 표 하나를 본다(2c 스펙 §6). 코드 · 상태는 admin-shared 코어 표.
// 2g: 얼린다 — ADMIN_SERVER_DEFAULT_MESSAGES 로 공개된다(http/messages.ts).

export const SESSION_MESSAGES = Object.freeze({
  currentSession: '지금 쓰는 세션은 여기서 끝낼 수 없습니다. 로그아웃을 쓰세요.',
  notFound: '세션을 찾을 수 없습니다. 이미 끝났거나 갱신됐을 수 있습니다.',
  noUser: '사용자를 찾을 수 없습니다.',
} as const)
