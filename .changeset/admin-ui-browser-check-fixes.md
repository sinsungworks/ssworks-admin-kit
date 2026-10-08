---
'@ssworks/admin-shared': patch
'@ssworks/admin-ui': patch
---

브라우저 확인(2026-10-08) 수정.

- **`useRoleEditor` 결함 수정:** 수정 저장은 성공했는데 이어지는 재조회가 실패(예: 자기 직책에서 읽기 권한을 꺼 403)하면 `isDirty` 가 참으로 남아, 화면을 떠날 때 `useDirtyGuard` 가 "저장하지 않은 변경 사항" 을 물었다. 이제 비교 기준을 방금 저장한 값으로 맞춘다. 자기 직책 저장 뒤의 재조회 403 은 처리됨으로 표시해 오류 토스트가 깜빡이지 않는다.
- **`TeamUserList` 결함 수정:** 목록이 스스로 스크롤 상자가 되어, 스크롤하기 전에 다음 쪽을 끝까지 다 불렀다(큰 팀이면 모든 쪽을 한꺼번에). 이제 스크롤은 목록 칸 한 곳에서 일어나고 끝에 닿을 때만 다음 쪽을 부른다.
- **토스트 결함 수정:** 떠 있는 토스트를 새 토스트가 바꾸면 남은 시간만큼만 보였다(오류를 띄우고 4초 뒤 다른 오류를 띄우면 2초). 이제 표시 시간을 처음부터 센다.
- **대화상자 포커스:** `BaseDialog` · `ConfirmDialog` · `ReauthDialog`(와 그 위의 대화상자)는 닫히면 연 곳으로 포커스를 돌려준다. `ReauthDialog` 는 열면 비밀번호 칸에 포커스를 둔다 — 누르지 않고 바로 친다.
- **`TemporaryPasswordDialog`:** 복사 버튼이 값 칸 오른쪽 아이콘 버튼(접근 이름 "임시 비밀번호 복사")으로 옮겨졌다. 아래 동작 줄의 "복사" 버튼은 없어지고 "닫기" 만 남는다. 버튼 글자 "복사" 로 찾던 소비자 E2E 테스트는 접근 이름으로 찾도록 고칠 것.
- **admin-shared 타입 결함 수정:** `adminTeamNodeSchema` 의 타입을 `z.ZodType<AdminTeamNode>` 로 적었다. 발행 d.ts 가 재귀를 지워 `AdminTeamTree['items']` 가 `AdminTeamNode[]` 에 들어가지 않던 것(README 의 `useTeamTree` load 예시가 컴파일되지 않음)을 고친다. 노드 스키마의 `.extend()` 같은 객체 메서드는 이제 없다.
