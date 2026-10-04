# @ssworks/admin-ui

## 0.3.0

### Minor Changes

- b6edaa9: PR #3a — 목록 · 쓰기 기반.

  - admin-ui 새 API: `useServerTable` · `useQuerySyncedFilter` · 코덱 층(`queryCodec` · `withDefault` · `bindQueryCodecs`) · `useWriteFlow` · `toFieldErrors`.
  - admin-shared 새 오류 코드 `ERR_COMMON_REVISION_CONFLICT`(409). `ERR_COMMON_CONFLICT` 는 상태 전이 충돌 전용이다 — 서버는 revision 불일치에 새 코드를 보낼 것.
  - **동작 변경:** `createApiClient` 의 `onError` 가 **한 매크로태스크 뒤에** 불리고, 호출처가 `error.handled = true` 로 표시한 오류는 건너뛴다. `onError` 가 거부 직후 동기로 불린다고 기대하던 코드·테스트는 한 틱 기다리도록 고칠 것.
  - `ApiError` 에 `handled: boolean` 필드가 생겼다.

## 0.2.0

### Minor Changes

- 14e4b9f: Phase 1 첫 발행.

  - admin-shared: `definePermissions` · `defineScopes` · `defineErrorCodes` / `BusinessError` · 응답 봉투 스키마 · `createQuerySchema` / `createPaginatedRespSchema` · BigInt JSON 코덱
  - admin-ui: `CardLayout` `PanelLayout` `ColumnLayout` `ColumnPane` · `BaseDialog` `ConfirmDialog` `ReauthDialog` `EmptyState` `PasswordField` · `DataTablePanel` `DataTableBody` · `createToast` / `AdminToast` / `useToast` · `createAdminVuetify` · `createUsePermission`
  - admin-ui (셸·내비게이션·인프라): `createAdminUi` / `useAdminUi` · `AdminShell` `AuthShell` `AppBar` `MainMenu` `MainMenuItem` `IpBlockedDialog` · `filterMenu` `buildMenu` `flattenRoutes` `assertParentAnyPermissionsCoverChildren` · `defineAdminRoute` / `AdminRouteMeta` `createAdminGuard` `createTitleGuard` `installChunkRecovery` `safeRedirect` · `createApiClient` / `ApiError` · `createAppStore` / `SessionNotEstablishedError` · `useDirtyGuard` `useTableSelection`
  - 패키지는 같은 번호로 함께 오른다. admin-ui 의 `@ssworks/admin-shared` peer 범위는 0.x 동안 `^0` 이니 같은 번호끼리 설치한다.
  - admin-ui 새 peer 의존: `vue-router` · `pinia` · `axios` — 셋 다 **필수**. 엔트리가 하나라 `createAppStore`·`createApiClient` 를 안 써도 번들러가 `pinia`·`axios` 를 해석해야 한다. 패키지는 `RouteMeta` 를 증강하지 않는다 — 소비 프로젝트의 `env.d.ts` 가 한다.
