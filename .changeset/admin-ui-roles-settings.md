---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

PR #3b — 역할 · 설정.

- admin-shared 새 스키마: `adminRoleSchema` · `adminRoleCreateSchema` · `adminRoleUpdateSchema` · `adminRoleMoveSchema` · `adminRoleRemoveSchema` 와 각 타입. 🔴 수정 · 삭제 본문에 `revision` 이 필수다. 이동은 `revision` 을 싣지도 올리지도 않는다.
- admin-ui 새 API: `PermissionMatrix` · `assertMatrixCoversPermissions` · `useRoleEditor` · `SettingsShell`, 앱 스토어 `refresh()`.
- `useWriteFlow` 의 `run({ fields })`: 검증 오류는 키가 전부 `fields` 안일 때만 처리됨(전역 토스트 없음)이다. `fields` 를 안 주면 `fieldErrors` 는 채우되 전역 토스트도 뜬다 — 폼을 그리는 쓰기는 `fields` 를 넘길 것. 재인증 관문의 `currentPassword` 오류는 다이얼로그 안에 보인다.
- 서버 계약: 역할 목록은 전량 · `displayOrder` 오름차순, revision 불일치는 409 `ERR_COMMON_REVISION_CONFLICT`, 이동 목표는 이웃의 `displayOrder` 이고 서버가 구간을 재번호한다.
