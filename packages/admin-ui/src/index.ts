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
