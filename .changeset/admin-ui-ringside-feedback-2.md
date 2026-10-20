---
'@ssworks/admin-ui': minor
---

ringside 둘째 보고 반영(PR #3i — `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md`).

- `useIpAccessRules({ scopes })` — 층 목록. 팀 모듈(`AdminTeamsModule`)을 켜지 않은 앱은 `scopes: ['user', 'global']` 을 준다(안 주면 "팀" 층이 남고 저장은 늘 400). 표시 순서는 늘 사용자 → 팀 → 전체.
- 기본 문구를 공개한다 — `DEFAULT_SESSION_TABLE_MESSAGES` · `DEFAULT_IP_ACCESS_MESSAGES` · `DEFAULT_AUDIT_LOG_MESSAGES` · `DEFAULT_TEAM_TREE_MESSAGES` · `DEFAULT_TEAM_USER_LIST_MESSAGES` · `DEFAULT_TEAM_MESSAGES` · `DEFAULT_LEGAL_MESSAGES` · `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES` · `CORE_AUDIT_ACTION_GROUPS`. 모두 얼려 있다 — 대입하면 던진다. 덮으려면 펼쳐서 `messages` 로 넘긴다.
- `ReauthDialog` — 설명(`message`)과 안내를 다른 문단으로 그리고, 안내는 `prompt` prop 으로 바꾼다(기본 「현재 비밀번호를 입력하세요.」). 🔴 두 문구를 한 문단 글자로 재던 앱 테스트는 문단별로 고친다.
- 🔴 `useServerTable` — 기본 정렬 열은 헤더로 내림 ↔ 오름을 오간다(그 전에는 기본 열이 오름에 닿지 못했다). 동작 변경: 이미 기본 정렬일 때 `sortBy.value = []` 로 되돌리던 코드는 반대 방향이 된다 — `sortBy.value = [{ ...기본 }]` 으로 바꾼다.
- README: 세로 폼은 칸 사이 `gap: 12px`(프리셋 `hideDetails: 'auto'`) · 「용어 바꾸기」.
