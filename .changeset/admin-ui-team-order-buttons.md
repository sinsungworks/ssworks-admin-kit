---
'@ssworks/admin-ui': minor
---

TeamTree 에 `showOrderButtons`(기본 `true`) — 행의 ↑↓(형제 순서) 버튼을 숨긴다.

- 기본값이 지금과 같아 기존 화면은 바뀌지 않는다. `useTeamTree().tree` 바인딩에는 없다 — `draggable` 처럼 화면이 직접 붙인다: `<TeamTree v-bind="teams.tree.value" :show-order-buttons="false" />`.
- 숨기면 ⋮ 메뉴와 드래그는 그대로이고, 형제 순서는 드래그로만 바뀐다. 키보드로는 순서를 바꿀 수 없게 되니 키보드 사용자가 있는 화면에서는 켜 둔다.
