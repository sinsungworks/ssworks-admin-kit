---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

PR #3c — 세션 · 비밀번호.

- admin-shared 새 API: `adminSessionSchema` · `adminSessionListItemSchema` · `adminSessionRevokeResultSchema`, `describeUserAgent()`, `definePasswordPolicy()`(기본 8 · 200자, `changePasswordSchema` 는 새 = 현재를 `newPassword` 경로 오류로), `adminTemporaryPasswordSchema`.
- admin-ui 새 API: `SessionTable` · `useSessions`(전량 · 서버 페이징, 끝내기 · 다른 세션 모두 · 사용자 전체) · `TemporaryPasswordDialog`(`v-model` 이 곧 값) · `PasswordChangeForm` · `copyText`.
- `AdminUserInfo.isPasswordChangeRequired?` — `createAdminGuard({ isPasswordChangeRequired })` 에 잇는다.
- 서버 계약: 세션 행의 `isCurrent` · `lastAccessAt` · `userAgent`, 현재 세션은 목록에서 끊지 못함, 임시 비밀번호 응답 키 `temporaryPassword`, 틀린 현재 비밀번호는 `ERR_COMMON_VALIDATION` + `currentPassword` 경로.
- `PasswordField` 가 호출하는 쪽의 `autocomplete` 를 덮어쓰지 않는다(이전에는 늘 `off` — `ReauthDialog` 의 `current-password` 포함).
