# @ssworks/admin-ui

## 0.8.0

### Minor Changes

- c858dd6: ringside 보고 반영(PR #3h)

  - 🔴 **Vuetify CSS 레이어 순서** — `@ssworks/admin-ui/vite` 의 `vuetifyLayerOrder()` 를 더했다. admin-ui 가 `vuetify/components` 를 import 해서 부품 CSS 가 `vuetify/styles` 의 레이어 순서 선언보다 먼저 들어가, reset 레이어가 `<button>` VBtn 의 `size` · 굵기를 이겼다(22px · 400). **쓰는 쪽은 `vite.config` 의 `plugins` 에 `vuetifyLayerOrder()` 를 넣는다(순서 무관)** — `index.html` 은 고치지 않는다(README 「Vuetify 프리셋」).
  - `SessionTable` 문구 — `messages` prop(부분 덮어쓰기)과 `useSessions({ messages })` 의 표 문구 키(`userColumn` · `revokeUserButton` …)를 더했다. `table` 바인딩이 그대로 싣고, "사용자 전체 끊기" 확인 창 제목 · 접근 이름의 기본값은 `revokeUserButton` 을 따른다. 공개 타입 `SessionTableMessages` · `SessionLabelView`. 기본 문구는 그대로다.
  - 타입 — `SessionMessages<R>` 가 `SessionTableMessages`(필수 키 12개)를 확장하고 `SessionTableBindings<R>` 에 필수 `messages` 가 생겼다. `SessionMessages<R>` 를 전부 적어 쓰거나 바인딩 객체를 손으로 만드는 코드(테스트 대역 등)는 컴파일이 깨진다. 옵션 `messages` 는 그대로 `Partial` 이라 보통의 사용은 영향이 없다.
  - `PermissionMatrix` — 카테고리마다 `<table>` 을 그리던 것을 `<table>` 하나 + 카테고리마다 `<tbody>`(첫 줄이 카테고리 머리 줄)로 바꿨다. 같은 순번 열이 카테고리를 넘어 한 줄로 선다. props · 슬롯은 그대로다 — **표 단위로 DOM 을 재는 테스트(`querySelectorAll('table')` · `thead th`)는 고친다.**
  - README 「설정 셸」 — 부모 높이 요구와 `calc(100dvh - var(--v-layout-top, 64px))` 예시.

## 0.7.0

### Minor Changes

- bab7ec0: PR #3g — IP 접근 제어 관리 화면.

  - 소비자가 할 일은 없다(새 peer 없음 · admin-shared 하한 그대로).
  - admin-ui 새 API: `useIpAccessRules` · `IpAccessManager`, 타입 `UseIpAccessRulesOptions` · `IpAccessRules` · `IpAccessManagerBindings` · `IpRuleDoneEvent` · `IpRuleForm` · `IpPreviewState` · `IpPreviewView` · `IpUserOption` · `IpWriteContext` · `IpSelectItem` · `IpAccessAlert` · `IpAccessMessages`.
    - 접속 상태와 변경 영향 카드(현재 IP 상시 · 통과 여부 · 새로 잠기는 사람 · 규칙만 바뀌는 사람 · 본인 표시 · 전체 허용 제거 경고).
    - 편집은 표 위 인라인 패널, 대상은 팀 경로 select · 사용자 서버 검색(권한이 없으면 번호 칸).
    - 관문은 미리보기를 마친 뒤 열리고 문구가 최종 영향이다. `reauth` 면 재인증 창, 아니면 확인 창 — 관문 없는 쓰기는 없다.
    - revision 충돌 · 409 자기 잠금(서버 문구 + 주소) · 고친 값 버리기 확인.
  - 감사 로그의 행위자 칸이 공용 내부 부품으로 바뀌었다 — 동작은 같다.
  - 서버 계약은 그대로다(`/admin/ip-access` 다섯 라우트). 기존 API 동작은 바뀌지 않는다.

## 0.6.0

### Minor Changes

- d39dbb1: PR #3f — 감사 로그 조회 화면.

  - **소비자가 할 일:** admin-ui 의 peer `@ssworks/admin-shared` 하한이 `>=0.4.0` 이 됐다(감사 카탈로그를 런타임에 쓴다). 세 패키지를 같은 번호로 설치하면 할 일이 없다.
  - admin-ui 새 API: `useAuditLogs` · `AuditLogViewer`, 타입 `UseAuditLogsOptions` · `AuditLogs` · `AuditLogViewerBindings` · `AuditLogDraft` · `AuditLogFilter` · `AuditActorOption` · `AuditActionGroup` · `AuditFilterItem` · `AuditLogMessages`.
    - 입력값/적용값 분리 · 같은 조건 재적용 · 검증 실패면 조회 안 함.
    - 동작 필터 묶음(prefix · 값 끝 점)과 개별(exact).
    - 행위자 서버 검색(`searchActors` + 권한 게터, 없으면 번호 칸) · "이 사람 기록만".
    - 선택 옵션 `urlSync`(`actor` · `action` · `targetType` · `targetRefNo` · `from` · `to`).
    - 펼친 행의 바뀐 항목 diff(가린 값은 이름만) · `fieldLabels`.
  - 서버 계약은 그대로다(`GET /admin/audit-logs`). 기존 API 동작은 바뀌지 않는다.

## 0.5.0

### Minor Changes

- e0ed863: **쓰는 쪽이 할 일:** admin-ui 를 쓰는 앱은 `pnpm add pinia@^4 @vue/devtools-api@^8` — admin-ui 의 peer `pinia` 가 `^4.0.0` 이 됐다(Pinia 3 은 더 받지 않는다). `@vue/devtools-api` 는 Pinia 4 의 필수 peer 다(admin-ui 는 import 하지 않아 peer 로 두지 않는다). admin-shared · admin-server 만 쓰는 앱은 할 일 없음.

  admin-ui: peer `pinia ^4.0.0`. 코드는 바뀌지 않았다 — Pinia 4 의 변경은 ESM 전용 · devtools-api 8 뿐이다(4.1.0 에서 시험).

  세 패키지: 셋 모두 TypeScript 6.0.3 으로 빌드한 dist · d.ts. 동작 변경 없음 — 발행물 차이는 표기뿐이다(admin-ui d.ts 7곳의 유니온 순서 · 슬롯 임시 이름 · `PermissionCheck<string>` 기본값 펼침과 번들 제어 흐름 표기, admin-server 주석 한 줄이고 admin-shared 는 같다). export · 타입 · 런타임 동작은 같다. 저장소 도구는 TypeScript 6.0.3 · Vitest 5 · ESLint 10 · typescript-eslint 8.71 이고, 실 DB 테스트는 MariaDB 11.4 · 12.3 두 버전에서 돈다.

## 0.4.1

### Patch Changes

- 6a034e2: `createApiClient` 의 쿼리 직렬화가 boolean 을 `'1'` · `''` 대신 `'true'` · `'false'` 로 보낸다 — admin-shared `queryBooleanSchema`(admin-server 목록 필터)가 받는 모양이다. 전에는 `TeamUserList` 의 "하위 팀 포함" 같은 boolean 필터가 admin-server 에서 400 이었다.

  쓰는 쪽이 할 일: admin-server 와 `'true'` · `'false'` 를 받는 서버는 없음. 🔴 boolean 쿼리를 `z.coerce.boolean()` 으로 받는 자체 서버는 이제 `'false'` 를 참으로 읽는다(`Boolean('false') === true`) — 400 없이 뒤집힌 목록이 나온다. admin-shared `queryBooleanSchema` 나 `'true'` · `'false'` 를 가리는 스키마로 바꾼다. `'1'` · `''` 만 받던 서버도 `'true'` · `'false'` 를 받게 한다.

## 0.4.0

## 0.3.0

### Minor Changes

- 4d15d2b: 확인 창 — `createConfirm` · `<AdminConfirm />` · `useConfirm`. `useDirtyGuard` 의 이탈 확인이 브라우저 기본 창 대신 킷 `ConfirmDialog` 로 뜬다.

  - **소비자가 할 일(선택):** `plugins/confirm.ts` 에서 `export const confirm = createConfirm()`, `main.ts` 에 `app.use(confirm)`, `App.vue` 에 `<AdminConfirm />` 한 번(README 최소 배선). 안 하면 지금처럼 브라우저 기본 창이다.
  - 이탈 확인 창: 제목 "화면 떠나기" · 기존 문구 · "머물기" / "떠나기". `DirtyGuardOptions.title` 로 제목을 바꾼다. 새로고침 · 탭 닫기 경고는 브라우저 기본 그대로다.
  - 앱도 `useConfirm().ask({ title, message, reversible })` → `Promise<boolean>` 으로 쓸 수 있다. 한 번에 하나만 묻는다.

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

- d2e2384: TeamTree 에 `showOrderButtons`(기본 `true`) — 행의 ↑↓(형제 순서) 버튼을 숨긴다.

  - 기본값이 지금과 같아 기존 화면은 바뀌지 않는다. `useTeamTree().tree` 바인딩에는 없다 — `draggable` 처럼 화면이 직접 붙인다: `<TeamTree v-bind="teams.tree.value" :show-order-buttons="false" />`.
  - 숨기면 ⋮ 메뉴와 드래그는 그대로이고, 형제 순서는 드래그로만 바뀐다. 키보드로는 순서를 바꿀 수 없게 되니 키보드 사용자가 있는 화면에서는 켜 둔다.

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

- b8d2408: TeamTree 드래그 — 자리 표시 결함 수정과 미리보기.

  - **결함 수정:** `draggable` 로 팀을 끌 때 he-tree 가 놓일 자리에 자리 표시를 끼우면, 행 키 함수가 그것을 팀으로 읽다가 던져 렌더가 멈췄다(놓일 자리가 보이지 않고 콘솔에 `TypeError`). 이제 자리 표시를 따로 읽는다.
  - 놓일 자리에 끄는 팀의 행(이름 · `#badge` · 하위 팀이 있으면 ▸)을 옅게 그린다. 버튼은 없고 화면 낭독기에서는 숨는다(위치는 he-tree 가 알린다). 자리 표시 높이를 실제 행 높이(36px)에 맞췄다.
  - 공개 API 는 바뀌지 않는다.

## 0.2.0

### Minor Changes

- 14e4b9f: Phase 1 첫 발행.

  - admin-shared: `definePermissions` · `defineScopes` · `defineErrorCodes` / `BusinessError` · 응답 봉투 스키마 · `createQuerySchema` / `createPaginatedRespSchema` · BigInt JSON 코덱
  - admin-ui: `CardLayout` `PanelLayout` `ColumnLayout` `ColumnPane` · `BaseDialog` `ConfirmDialog` `ReauthDialog` `EmptyState` `PasswordField` · `DataTablePanel` `DataTableBody` · `createToast` / `AdminToast` / `useToast` · `createAdminVuetify` · `createUsePermission`
  - admin-ui (셸·내비게이션·인프라): `createAdminUi` / `useAdminUi` · `AdminShell` `AuthShell` `AppBar` `MainMenu` `MainMenuItem` `IpBlockedDialog` · `filterMenu` `buildMenu` `flattenRoutes` `assertParentAnyPermissionsCoverChildren` · `defineAdminRoute` / `AdminRouteMeta` `createAdminGuard` `createTitleGuard` `installChunkRecovery` `safeRedirect` · `createApiClient` / `ApiError` · `createAppStore` / `SessionNotEstablishedError` · `useDirtyGuard` `useTableSelection`
  - 패키지는 같은 번호로 함께 오른다. admin-ui 의 `@ssworks/admin-shared` peer 범위는 0.x 동안 `^0` 이니 같은 번호끼리 설치한다.
  - admin-ui 새 peer 의존: `vue-router` · `pinia` · `axios` — 셋 다 **필수**. 엔트리가 하나라 `createAppStore`·`createApiClient` 를 안 써도 번들러가 `pinia`·`axios` 를 해석해야 한다. 패키지는 `RouteMeta` 를 증강하지 않는다 — 소비 프로젝트의 `env.d.ts` 가 한다.
