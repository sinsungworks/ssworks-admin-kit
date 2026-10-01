---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

Phase 1 첫 발행.

- admin-shared: `definePermissions` · `defineScopes` · `defineErrorCodes` / `BusinessError` · 응답 봉투 스키마 · `createQuerySchema` / `createPaginatedRespSchema` · BigInt JSON 코덱
- admin-ui: `CardLayout` `PanelLayout` `ColumnLayout` `ColumnPane` · `BaseDialog` `ConfirmDialog` `ReauthDialog` `EmptyState` `PasswordField` · `DataTablePanel` `DataTableBody` · `createToast` / `AdminToast` / `useToast` · `createAdminVuetify` · `createUsePermission`
- admin-ui (셸·내비게이션·인프라): `createAdminUi` / `useAdminUi` · `AdminShell` `AuthShell` `AppBar` `MainMenu` `MainMenuItem` `IpBlockedDialog` · `filterMenu` `buildMenu` `flattenRoutes` `assertParentAnyPermissionsCoverChildren` · `defineAdminRoute` / `AdminRouteMeta` `createAdminGuard` `createTitleGuard` `installChunkRecovery` `safeRedirect` · `createApiClient` / `ApiError` · `createAppStore` / `SessionNotEstablishedError` · `useDirtyGuard` `useTableSelection`
- admin-ui 새 peer 의존: `vue-router` · `pinia` · `axios` — 셋 다 **필수**. 엔트리가 하나라 `createAppStore`·`createApiClient` 를 안 써도 번들러가 `pinia`·`axios` 를 해석해야 한다. 패키지는 `RouteMeta` 를 증강하지 않는다 — 소비 프로젝트의 `env.d.ts` 가 한다.
