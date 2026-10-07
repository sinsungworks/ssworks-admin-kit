// @ssworks/admin-ui — Vue 3 + Vuetify 4 관리자 공통 UI.
//
// 🔴 소비 프로젝트는 CSS 를 직접 들여온다:
//    import '@ssworks/admin-ui/style.css'
//    (vuetify/styles · @mdi/font 는 프로젝트의 plugins/vuetify.ts 가 import 한다)

// ── 레이아웃 프리미티브 ─────────────────────────────────────────────────
export { default as CardLayout } from './components/ui/CardLayout.vue'
export { default as PanelLayout } from './components/ui/PanelLayout.vue'
export { default as ColumnLayout } from './components/ui/ColumnLayout.vue'
export { default as ColumnPane } from './components/ui/ColumnPane.vue'

// ── 공용 다이얼로그 · 필드 ─────────────────────────────────────────────
export { default as BaseDialog } from './components/common/BaseDialog.vue'
export { default as ConfirmDialog } from './components/common/ConfirmDialog.vue'
export { default as ReauthDialog } from './components/common/ReauthDialog.vue'
export { default as EmptyState } from './components/common/EmptyState.vue'
export { default as PasswordField } from './components/common/PasswordField.vue'

// ── 서버 페이지네이션 표 ───────────────────────────────────────────────
export { default as DataTablePanel } from './components/table/DataTablePanel.vue'
export { default as DataTableBody } from './components/table/DataTableBody.vue'
export {
  ADMIN_LIST_MAX_PAGE_SIZE,
  DEFAULT_ITEMS_PER_PAGE_OPTIONS,
  formatSortLabel,
  type AdminTableHeader,
  type AdminTableSort,
} from './components/table/data-table.js'

// ── 토스트 ────────────────────────────────────────────────────────────
export { default as AdminToast } from './toast/AdminToast.vue'
export {
  createToast,
  useToast,
  TOAST_KEY,
  DEFAULT_TOAST_TIMEOUT_MS,
  type ToastApi,
  type ToastColor,
  type ToastPlugin,
  type ToastState,
  type CreateToastOptions,
} from './toast/toast.js'

// ── Vuetify 프리셋 ────────────────────────────────────────────────────
export {
  createAdminVuetify,
  buildAdminVuetifyOptions,
  ADMIN_VUETIFY_DEFAULTS,
  ADMIN_VUETIFY_GLOBAL_DEFAULTS,
  ADMIN_VUETIFY_FIELD_DEFAULTS,
  ADMIN_VUETIFY_BUTTON_DEFAULTS,
  type AdminVuetifyOptions,
} from './vuetify/createAdminVuetify.js'

// ── 권한 ──────────────────────────────────────────────────────────────
export { createUsePermission } from './permission/createUsePermission.js'
export type { PermissionCheck } from '@ssworks/admin-shared'

// ── 역할 · 설정 ───────────────────────────────────────────────────────
export { default as PermissionMatrix } from './components/permission/PermissionMatrix.vue'
export {
  assertMatrixCoversPermissions,
  type PermissionMatrixCategory,
  type PermissionMatrixColumn,
  type PermissionMatrixRow,
} from './components/permission/permission-matrix.js'
export {
  useRoleEditor,
  type RoleEditor,
  type RoleEditorApi,
  type RoleEditorOptions,
  type RoleEditorAction,
  type RoleDialogText,
  type RoleForm,
  type RoleWriteContext,
  type PermissionMatrixBindings,
} from './composables/useRoleEditor.js'
export { default as SettingsShell } from './layout/SettingsShell.vue'

// ── 컨텍스트 (셸 → 호스트 앱) ────────────────────────────────────────
export {
  createAdminUi,
  useAdminUi,
  ADMIN_UI_KEY,
  type AdminUserInfo,
  type AdminUiOptions,
  type AdminUiContext,
  type AdminUiPlugin,
} from './context/admin-ui.js'

// ── 메뉴 ──────────────────────────────────────────────────────────────
export { default as MainMenu } from './menu/MainMenu.vue'
export { default as MainMenuItem } from './menu/MainMenuItem.vue'
export {
  filterMenu,
  buildMenu,
  flattenRoutes,
  assertParentAnyPermissionsCoverChildren,
  type MenuNode,
} from './menu/menu.js'

// ── 레이아웃 셸 ───────────────────────────────────────────────────────
export { default as AppBar, type AppBarMenuItem } from './layout/AppBar.vue'
export {
  default as AdminShell,
  type AdminShellMenuProps,
  type AdminShellAppBarProps,
} from './layout/AdminShell.vue'
export { default as AuthShell } from './layout/AuthShell.vue'
export { default as IpBlockedDialog } from './components/common/IpBlockedDialog.vue'

// ── 라우터 ────────────────────────────────────────────────────────────
export { defineAdminRoute, type AdminRouteMeta } from './router/route-meta.js'
export { createAdminGuard, type AdminGuardDeps } from './router/guard.js'
export { createTitleGuard } from './router/title-guard.js'
export { installChunkRecovery } from './router/recovery.js'
export { safeRedirect } from './router/safe-redirect.js'

// ── API 클라이언트 ────────────────────────────────────────────────────
export { createApiClient, type ApiClientOptions, type ApiClient } from './api/client.js'
export { ApiError } from './api/error.js'
export { toFieldErrors } from './api/field-errors.js'

// ── 세션 스토어 ───────────────────────────────────────────────────────
export {
  createAppStore,
  SessionNotEstablishedError,
  type AppStoreOptions,
  type AppStoreState,
  type AppStoreActions,
} from './store/app-store.js'

// ── composable ────────────────────────────────────────────────────────
export { useDirtyGuard, type DirtyGuardOptions } from './composables/useDirtyGuard.js'
export { useTableSelection } from './composables/useTableSelection.js'
export { useQuerySyncedFilter, type QuerySyncOptions } from './composables/useQuerySyncedFilter.js'
export {
  queryCodec,
  withDefault,
  bindQueryCodecs,
  type QueryCodec,
  type DefaultedQueryCodec,
  type QueryCodecSpec,
  type QuerySyncBinding,
  type RawQueryValue,
} from './composables/query-codec.js'
export {
  useServerTable,
  type ServerTable,
  type ServerTableOptions,
  type ServerTableParams,
} from './composables/useServerTable.js'
export {
  useWriteFlow,
  type WriteFlow,
  type WriteRunOptions,
  type ConfirmDialogBindings,
  type ReauthDialogBindings,
} from './composables/useWriteFlow.js'

// ── 세션 · 비밀번호 ───────────────────────────────────────────────────
export { copyText, type CopyResult } from './utils/copy-text.js'
export { default as SessionTable } from './components/session/SessionTable.vue'
export { type SessionTableRow } from './components/session/session-table.js'
export {
  useSessions,
  type Sessions,
  type UseSessionsOptions,
  type SessionTableBindings,
  type SessionMessages,
  type SessionDialogText,
  type SessionAction,
  type SessionRevokedEvent,
} from './composables/useSessions.js'
export { default as TemporaryPasswordDialog } from './components/password/TemporaryPasswordDialog.vue'
export { default as PasswordChangeForm } from './components/password/PasswordChangeForm.vue'

// ── 조직 ──────────────────────────────────────────────────────────────
export { default as TeamTree } from './components/team/TeamTree.vue'
export {
  type TeamAction,
  type TeamEdit,
  type TeamEditTarget,
  type TeamCommitSource,
  type TeamMoveSource,
  type TeamTreeMessages,
} from './components/team/team-tree.js'
