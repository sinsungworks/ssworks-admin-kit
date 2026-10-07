---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

PR #3d — 조직(팀 트리 · 팀 인원).

- **소비자가 할 일: `pnpm add @he-tree/vue@^2.10.5`** — admin-ui 의 새 필수 peer 다(엔트리가 하나라 `TeamTree` 를 안 써도 번들러가 해석해야 한다). he-tree CSS 는 import 하지 않아도 된다.
- **pnpm 10 이상이면 `vue-demi` 빌드 스크립트를 명시로 정한다.** he-tree 의 하위 의존 `vue-demi` 의 postinstall 을 pnpm 이 막고, pnpm 12 는 `pnpm install` 이 `ERR_PNPM_IGNORED_BUILDS` 로 멈춘다. `pnpm-workspace.yaml` 에 `allowBuilds:` / `vue-demi: false` 를 둔다(Vue 3 에서는 그 스크립트가 Vue 2 용 파일 전환뿐이라 필요 없다).
- admin-shared 새 API: 팀 스키마(`adminTeamNodeSchema` · `adminTeamTreeSchema` · `adminTeamCreateSchema` · `adminTeamRenameSchema` · `adminTeamMoveSchema` · `adminTeamMoveBodySchema` · `teamNameSchema`, 이름 64자), 트리 함수(`sortTeamTree` · `flattenTeamTree` · `filterTeamTree` · `findTeamPlacement` · `siblingMove` · `moveTargets` · `toDisplayOrderMove` · `indentTeamName`).
- admin-ui 새 API: `TeamTree`(he-tree, 노드 안 입력칸 · `draggable`) · `useTeamTree` · `TeamMoveDialog` · `TeamUserList`(쪽 나눔).
- 서버 계약: 트리 응답 `{ items }`(루트 여럿), 이동 본문은 기준 형제 번호 `{ parentTeamNo, beforeTeamNo }`(서버가 순서 값을 계산, 순환 검사), 소속 계정이 있는 팀 삭제는 `ERR_TEAM_HAS_MEMBERS`. 기존 순서 값 서버는 `toDisplayOrderMove()` 로 맞춘다.
- 기존 API 동작은 바뀌지 않는다.
