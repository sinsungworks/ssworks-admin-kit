---
'@ssworks/admin-ui': minor
---

PR #3g — IP 접근 제어 관리 화면.

- 소비자가 할 일은 없다(새 peer 없음 · admin-shared 하한 그대로).
- admin-ui 새 API: `useIpAccessRules` · `IpAccessManager`, 타입 `UseIpAccessRulesOptions` · `IpAccessRules` · `IpAccessManagerBindings` · `IpRuleDoneEvent` · `IpRuleForm` · `IpPreviewState` · `IpPreviewView` · `IpUserOption` · `IpWriteContext` · `IpSelectItem` · `IpAccessAlert` · `IpAccessMessages`.
  - 접속 상태와 변경 영향 카드(현재 IP 상시 · 통과 여부 · 새로 잠기는 사람 · 규칙만 바뀌는 사람 · 본인 표시 · 전체 허용 제거 경고).
  - 편집은 표 위 인라인 패널, 대상은 팀 경로 select · 사용자 서버 검색(권한이 없으면 번호 칸).
  - 관문은 미리보기를 마친 뒤 열리고 문구가 최종 영향이다. `reauth` 면 재인증 창, 아니면 확인 창 — 관문 없는 쓰기는 없다.
  - revision 충돌 · 409 자기 잠금(서버 문구 + 주소) · 고친 값 버리기 확인.
- 감사 로그의 행위자 칸이 공용 내부 부품으로 바뀌었다 — 동작은 같다.
- 서버 계약은 그대로다(`/admin/ip-access` 다섯 라우트). 기존 API 동작은 바뀌지 않는다.
