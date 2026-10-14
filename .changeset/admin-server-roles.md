---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 스텁 한 줄을 더한다 — `export { up, down } from '@ssworks/admin-server/migrations/0009_guard_locks'`(🔴 모든 장이 필수다). 역할 모듈을 쓰면 `AdminServerModule` 옵션에 `permissionCatalog`(admin-shared `definePermissions()` 결과 — 함의 표는 `{ implies }`)와 슬롯 `'roles.read'` · `'roles.manage'` 를 더하고 `AdminRolesModule` 을 import 한다. 슬롯 맵의 키는 카탈로그 안이어야 한다(기동에서 멈춘다). `@Audit` 인자 타입 이름이 `AuditOptions` → `AuditDeclaration` 으로 바뀌었다. 남의 세션 끊기(`DELETE /sessions/:sessionNo` · `/sessions/user/:userNo`)는 이제 그 사람의 역할 권한을 덮어야 한다(아니면 403).

admin-server 역할 · 판정(Phase 2 PR 2d-1): `AdminRolesModule` — `/admin/roles` 다섯 라우트(전량 목록 · 만들기 `{ roleNo }` · 수정 `{ item }` · 이동 · 삭제, revision 409 · 이동은 revision 없음 · 기본 역할 하나 · 이름 중복은 `roleName` 필드 오류 · 쓰는 중 409). 권한 정규화(`'*'` 접기 · 함의 · 카탈로그 순서), 지배 판정(403 `details.outside`), 전권자 잔존(장 `0009_guard_locks` 센티넬 · 409), 선택 재인증(`reauth`). 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: `definePermissions(catalog, { implies })` — 카탈로그의 `implies`(검증된 함의 표 · admin-ui `useRoleEditor({ implies })` 에 그대로) · `normalize(list)`. 코어 감사 액션에 역할 넷(`org.role.create` · `update` · `delete` · `move`)과 대상 `role`.
