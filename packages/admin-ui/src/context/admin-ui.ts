import { inject, type App, type InjectionKey } from 'vue'
import {
  ADMIN_LIST_MAX_PAGE_SIZE,
  DEFAULT_ITEMS_PER_PAGE_OPTIONS,
} from '../components/table/data-table.js'

/**
 * 관리자 셸이 호스트 앱에서 읽는 것의 전부.
 *
 * 정본: kim5257-crm-v5 · ssworks-axion-admin · ssworks-gise-home · hangang-home 의 `stores/app.ts`.
 * 네 프로젝트가 `AppBar`·`MainMenu`·`IpBlockedDialog`·`layouts/default.vue` 에서 실제로 읽던 필드만
 * 남겼다(`docs/phase0-reports/fe-layout-ui.md` §3-1). 바꾼 점: 스토어를 직접 import 하던 것을
 * 게터 주입으로 바꿨다 — 패키지는 스토어 파일을 모른다.
 *
 * `createToast` 와 같은 모양이다 — 플러그인 객체 자체가 API 이고 `app.use()` 가 provide 한다.
 */

export interface AdminUserInfo {
  userId: string
  userName: string
  permissions: readonly string[]
  teamName?: string
  roleName?: string
}

export interface AdminUiOptions<TUser extends AdminUserInfo = AdminUserInfo> {
  siteName?: string
  /** 현재 사용자. 스토어 게터를 넘긴다 — 패키지는 스토어 파일을 모른다. */
  user: () => TUser | null
  logout: () => Promise<void>
  /** 로그아웃 뒤 이동. 생략하면 `router.replace(loginPath)`. */
  afterLogout?: () => void | Promise<void>
  loginPath?: string
  ipBlocked?: () => { blocked: boolean; ip?: string }
  table?: { itemsPerPageOptions?: readonly number[]; maxPageSize?: number }
}

export interface AdminUiContext<TUser extends AdminUserInfo = AdminUserInfo> {
  readonly siteName: string
  /** 🔴 호출 시점마다 평가된다 — 값을 캐시하지 않는다. 로그인·로그아웃이 반응형으로 따라와야 한다. */
  user: () => TUser | null
  logout: () => Promise<void>
  afterLogout?: () => void | Promise<void>
  readonly loginPath: string
  ipBlocked: () => { blocked: boolean; ip?: string }
  readonly table: {
    readonly itemsPerPageOptions: readonly number[]
    readonly maxPageSize: number
  }
}

export interface AdminUiPlugin<
  TUser extends AdminUserInfo = AdminUserInfo,
> extends AdminUiContext<TUser> {
  install(app: App): void
}

export const ADMIN_UI_KEY: InjectionKey<AdminUiContext> = Symbol('admin-ui:context')

export function createAdminUi<TUser extends AdminUserInfo = AdminUserInfo>(
  options: AdminUiOptions<TUser>,
): AdminUiPlugin<TUser> {
  const plugin: AdminUiPlugin<TUser> = {
    siteName: options.siteName ?? '',
    user: options.user,
    logout: options.logout,
    afterLogout: options.afterLogout,
    loginPath: options.loginPath ?? '/login',
    ipBlocked: options.ipBlocked ?? (() => ({ blocked: false })),
    table: {
      itemsPerPageOptions: options.table?.itemsPerPageOptions ?? DEFAULT_ITEMS_PER_PAGE_OPTIONS,
      maxPageSize: options.table?.maxPageSize ?? ADMIN_LIST_MAX_PAGE_SIZE,
    },
    install(app) {
      app.provide(ADMIN_UI_KEY, plugin)
    },
  }
  return plugin
}

/**
 * 셸 컴포넌트가 호스트의 사용자·로그아웃에 닿는 유일한 문.
 * 🔴 `app.use(createAdminUi(...))` 가 먼저 돼 있어야 한다. 아니면 던진다 — 사용자 없이 조용히
 *    빈 메뉴가 그려지는 상태가 이 함수가 막으려는 구멍이다.
 */
export function useAdminUi<TUser extends AdminUserInfo = AdminUserInfo>(): AdminUiContext<TUser> {
  const ctx = inject(ADMIN_UI_KEY, null)
  if (ctx == null) {
    throw new Error(
      'useAdminUi(): createAdminUi() 플러그인이 설치되지 않았다 — app.use(createAdminUi(...))',
    )
  }
  return ctx as unknown as AdminUiContext<TUser>
}

/**
 * 컨텍스트가 없어도 되는 컴포넌트(표 등)용. 던지지 않고 `null` 을 돌려준다.
 */
export function useOptionalAdminUi(): AdminUiContext | null {
  return inject(ADMIN_UI_KEY, null) as AdminUiContext | null
}
