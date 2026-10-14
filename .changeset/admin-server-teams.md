---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0010_team_tree_lock` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0010_team_tree_lock'` — 모든 장 필수, 이미 돌린 DB 는 `kysely migrate` 한 번). 팀 모듈을 쓰면 `AdminServerModule` 옵션의 `permissions` 에 슬롯 `'teams.read'` · `'teams.manage'` 를 잇고 `AdminTeamsModule` 을 import 한다.

admin-server 팀(Phase 2 PR 2e-1): `AdminTeamsModule` — `/admin/teams` 다섯 라우트(트리 — 루트 여럿 · `teams.read` ∨ `users.read`, 만들기 201 `{ teamNo }`, 이름 바꾸기, 이동 — 기준 형제 번호 `{ parentTeamNo, beforeTeamNo }` · 서버가 받는 형제 묶음을 다시 매김, 삭제 — 하위 팀째). 순환 이동 400 `ERR_TEAM_MOVE_CYCLE`, 소속 있는 삭제 409 `ERR_TEAM_HAS_MEMBERS` + `memberCount`, 이름 중복 409 `ERR_DUPLICATE_TEAM_NAME`. 팀 쓰기는 `guard_locks` 행 `teamTree` 로 직렬화된다. 사용자 수정이 같은 팀으로 다시 저장하면 소속을 건드리지 않는다(배정 시각 유지). 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: 오류 코드 `ERR_TEAM_HAS_MEMBERS`(409) · `ERR_TEAM_MOVE_CYCLE`(400), 코어 감사 액션에 팀 넷(`org.team.create` · `update` · `delete` · `move`)과 대상 `team`.
