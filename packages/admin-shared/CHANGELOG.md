# @ssworks/admin-shared

## 0.3.0

### Minor Changes

- ce1a85f: PR #3e — 약관(법적 문서 편집 · 발행 · 이력).

  - **소비자가 할 일: `pnpm add codemirror @codemirror/state`** — admin-ui 의 새 필수 peer 다. 엔트리가 하나라 약관 화면을 안 써도 번들러가 해석해야 한다. CodeMirror 테마 패키지는 필요 없다(편집기 색은 Vuetify 테마).
  - admin-shared 새 API: `renderMarkdown`(markdown-it `html: false` · `breaks: true` — Enter 한 번이 줄바꿈, 새 의존 `markdown-it`). axion · gise 의 렌더러는 `breaks: false` 였으므로, 그 본문을 옮겨 오면 문단 안의 줄 하나 바꿈이 줄바꿈으로 보인다. 약관 스키마 — `adminLegalDocumentSchema` · `adminLegalHistoryItemSchema` · `adminLegalCurrentSchema` · `adminLegalHistorySchema` · `adminLegalPublishSchema` · `adminLegalPublishResultSchema` · `legalBodySchema` · `LEGAL_BODY_MAX_LENGTH`.
  - admin-ui 새 API: `MarkdownView` · `MarkdownEditor`(CodeMirror) · `useLegalDocuments` · `LegalDocumentEditor`.
  - 서버 계약:
    - 현재본 `{ item | null }`(미발행 = null), 이력 `{ items }`(최신순 전량).
    - 발행 `{ kind, body, baseLegalDocNo }` → `{ legalDocNo, contentHash }`. 해시는 서버만 계산한다.
    - 기준 판이 지금 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`, 본문이 같으면 409 `ERR_COMMON_CONFLICT`.
    - 미발행을 404 로 내는 기존 서버는 어댑터에서 `null` 로 바꾼다(README).
  - 기존 API 동작은 바뀌지 않는다.

- b6edaa9: PR #3a — 목록 · 쓰기 기반.

  - admin-ui 새 API: `useServerTable` · `useQuerySyncedFilter` · 코덱 층(`queryCodec` · `withDefault` · `bindQueryCodecs`) · `useWriteFlow` · `toFieldErrors`.
  - admin-shared 새 오류 코드 `ERR_COMMON_REVISION_CONFLICT`(409). `ERR_COMMON_CONFLICT` 는 상태 전이 충돌 전용이다 — 서버는 revision 불일치에 새 코드를 보낼 것.
  - **동작 변경:** `createApiClient` 의 `onError` 가 **한 매크로태스크 뒤에** 불리고, 호출처가 `error.handled = true` 로 표시한 오류는 건너뛴다. `onError` 가 거부 직후 동기로 불린다고 기대하던 코드·테스트는 한 틱 기다리도록 고칠 것.
  - `ApiError` 에 `handled: boolean` 필드가 생겼다.

- 02c1bdb: PR #3b — 역할 · 설정.

  - admin-shared 새 스키마: `adminRoleSchema` · `adminRoleCreateSchema` · `adminRoleUpdateSchema` · `adminRoleMoveSchema` · `adminRoleRemoveSchema` 와 각 타입. 🔴 수정 · 삭제 본문에 `revision` 이 필수다. 이동은 `revision` 을 싣지도 올리지도 않는다.
  - admin-ui 새 API: `PermissionMatrix` · `assertMatrixCoversPermissions` · `useRoleEditor` · `SettingsShell`, 앱 스토어 `refresh()`. `useRoleEditor` 의 `fields` 옵션(기본 `['roleName']`)은 저장 검증 오류 중 처리됨(전역 토스트 없음)으로 볼 키다 — 폼이 `isDefault` · `permissions` 오류도 그리면 더할 것.
  - `useWriteFlow` 의 `run({ fields })`: 검증 오류는 키가 전부 `fields` 안일 때만 처리됨(전역 토스트 없음)이다. `fields` 를 안 주면 `fieldErrors` 는 채우되 전역 토스트도 뜬다 — 폼을 그리는 쓰기는 `fields` 를 넘길 것. 재인증 관문의 `currentPassword` 오류는 다이얼로그 안에 보인다.
  - 서버 계약: 역할 목록은 전량 · `displayOrder` 오름차순, revision 불일치는 409 `ERR_COMMON_REVISION_CONFLICT`, 이동 목표는 이웃의 `displayOrder` 이고 서버가 구간을 재번호한다.

- 62478d8: PR #3c — 세션 · 비밀번호.

  - admin-shared 새 API: `adminSessionSchema` · `adminSessionListItemSchema` · `adminSessionRevokeResultSchema`, `describeUserAgent()`, `definePasswordPolicy()`(기본 8 · 200자, `changePasswordSchema` 는 새 = 현재를 `newPassword` 경로 오류로), `adminTemporaryPasswordSchema`.
  - admin-ui 새 API: `SessionTable` · `useSessions`(전량 · 서버 페이징, 끝내기 · 다른 세션 모두 · 사용자 전체) · `TemporaryPasswordDialog`(`v-model` 이 곧 값) · `PasswordChangeForm` · `copyText`.
  - `AdminUserInfo.isPasswordChangeRequired?` — `createAdminGuard({ isPasswordChangeRequired })` 에 잇는다.
  - 서버 계약: 세션 행의 `isCurrent` · `lastAccessAt` · `userAgent`, 현재 세션은 목록에서 끊지 못함, 임시 비밀번호 응답 키 `temporaryPassword`, 틀린 현재 비밀번호는 `ERR_COMMON_VALIDATION` + `currentPassword` 경로.
  - `PasswordField` 가 호출하는 쪽의 `autocomplete` 를 덮어쓰지 않는다(이전에는 늘 `off` — `ReauthDialog` 의 `current-password` 포함).

- 81d9ce8: PR #3d — 조직(팀 트리 · 팀 인원).

  - **소비자가 할 일: `pnpm add @he-tree/vue@^2.10.5`** — admin-ui 의 새 필수 peer 다(엔트리가 하나라 `TeamTree` 를 안 써도 번들러가 해석해야 한다). he-tree CSS 는 import 하지 않아도 된다.
  - **pnpm 10 이상이면 `vue-demi` 빌드 스크립트를 명시로 정한다.** he-tree 의 하위 의존 `vue-demi` 의 postinstall 을 pnpm 이 막고, pnpm 12 는 `pnpm install` 이 `ERR_PNPM_IGNORED_BUILDS` 로 멈춘다. `pnpm-workspace.yaml` 에 `allowBuilds:` / `vue-demi: false` 를 둔다(Vue 3 에서는 그 스크립트가 Vue 2 용 파일 전환뿐이라 필요 없다).
  - admin-shared 새 API: 팀 스키마(`adminTeamNodeSchema` · `adminTeamTreeSchema` · `adminTeamCreateSchema` · `adminTeamRenameSchema` · `adminTeamMoveSchema` · `adminTeamMoveBodySchema` · `teamNameSchema`, 이름 64자), 트리 함수(`sortTeamTree` · `flattenTeamTree` · `filterTeamTree` · `findTeamPlacement` · `siblingMove` · `moveTargets` · `toDisplayOrderMove` · `indentTeamName`).
  - admin-ui 새 API: `TeamTree`(he-tree, 노드 안 입력칸 · `draggable`) · `useTeamTree` · `TeamMoveDialog` · `TeamUserList`(쪽 나눔).
  - 서버 계약: 트리 응답 `{ items }`(루트 여럿), 이동 본문은 기준 형제 번호 `{ parentTeamNo, beforeTeamNo }`(서버가 순서 값을 계산, 순환 검사), 소속 계정이 있는 팀 삭제는 `ERR_TEAM_HAS_MEMBERS`. 기존 순서 값 서버는 `toDisplayOrderMove()` 로 맞춘다.
  - 기존 API 동작은 바뀌지 않는다.

### Patch Changes

- 73097db: 브라우저 확인(2026-10-08) 수정.

  - **`useRoleEditor` 결함 수정:** 수정 저장은 성공했는데 이어지는 재조회가 실패(예: 자기 직책에서 읽기 권한을 꺼 403)하면 `isDirty` 가 참으로 남아, 화면을 떠날 때 `useDirtyGuard` 가 "저장하지 않은 변경 사항" 을 물었다. 이제 비교 기준을 방금 저장한 값으로 맞춘다. 자기 직책 저장 뒤의 재조회 403 은 처리됨으로 표시해 오류 토스트가 깜빡이지 않는다.
  - **`TeamUserList` 결함 수정:** 목록이 스스로 스크롤 상자가 되어, 스크롤하기 전에 다음 쪽을 끝까지 다 불렀다(큰 팀이면 모든 쪽을 한꺼번에). 이제 스크롤은 목록 칸 한 곳에서 일어나고 끝에 닿을 때만 다음 쪽을 부른다.
  - **토스트 결함 수정:** 떠 있는 토스트를 새 토스트가 바꾸면 남은 시간만큼만 보였다(오류를 띄우고 4초 뒤 다른 오류를 띄우면 2초). 이제 표시 시간을 처음부터 센다.
  - **대화상자 포커스:** `BaseDialog` · `ConfirmDialog` · `ReauthDialog`(와 그 위의 대화상자)는 닫히면 연 곳으로 포커스를 돌려준다. `ReauthDialog` 는 열면 비밀번호 칸에 포커스를 둔다 — 누르지 않고 바로 친다.
  - **`TemporaryPasswordDialog`:** 복사 버튼이 값 칸 오른쪽 아이콘 버튼(접근 이름 "임시 비밀번호 복사")으로 옮겨졌다. 아래 동작 줄의 "복사" 버튼은 없어지고 "닫기" 만 남는다. 버튼 글자 "복사" 로 찾던 소비자 E2E 테스트는 접근 이름으로 찾도록 고칠 것.
  - **admin-shared 타입 결함 수정:** `adminTeamNodeSchema` 의 타입을 `z.ZodType<AdminTeamNode>` 로 적었다. 발행 d.ts 가 재귀를 지워 `AdminTeamTree['items']` 가 `AdminTeamNode[]` 에 들어가지 않던 것(README 의 `useTeamTree` load 예시가 컴파일되지 않음)을 고친다. 노드 스키마의 `.extend()` 같은 객체 메서드는 이제 없다.

## 0.2.0

### Minor Changes

- 14e4b9f: Phase 1 첫 발행.

  - admin-shared: `definePermissions` · `defineScopes` · `defineErrorCodes` / `BusinessError` · 응답 봉투 스키마 · `createQuerySchema` / `createPaginatedRespSchema` · BigInt JSON 코덱
  - admin-ui: `CardLayout` `PanelLayout` `ColumnLayout` `ColumnPane` · `BaseDialog` `ConfirmDialog` `ReauthDialog` `EmptyState` `PasswordField` · `DataTablePanel` `DataTableBody` · `createToast` / `AdminToast` / `useToast` · `createAdminVuetify` · `createUsePermission`
  - admin-ui (셸·내비게이션·인프라): `createAdminUi` / `useAdminUi` · `AdminShell` `AuthShell` `AppBar` `MainMenu` `MainMenuItem` `IpBlockedDialog` · `filterMenu` `buildMenu` `flattenRoutes` `assertParentAnyPermissionsCoverChildren` · `defineAdminRoute` / `AdminRouteMeta` `createAdminGuard` `createTitleGuard` `installChunkRecovery` `safeRedirect` · `createApiClient` / `ApiError` · `createAppStore` / `SessionNotEstablishedError` · `useDirtyGuard` `useTableSelection`
  - 패키지는 같은 번호로 함께 오른다. admin-ui 의 `@ssworks/admin-shared` peer 범위는 0.x 동안 `^0` 이니 같은 번호끼리 설치한다.
  - admin-ui 새 peer 의존: `vue-router` · `pinia` · `axios` — 셋 다 **필수**. 엔트리가 하나라 `createAppStore`·`createApiClient` 를 안 써도 번들러가 `pinia`·`axios` 를 해석해야 한다. 패키지는 `RouteMeta` 를 증강하지 않는다 — 소비 프로젝트의 `env.d.ts` 가 한다.
