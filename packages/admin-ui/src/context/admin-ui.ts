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
  /**
   * 임시 비밀번호로 로그인해 새 비밀번호를 정해야 하는가. `/me` 응답에서 온다.
   * `createAdminGuard({ isPasswordChangeRequired: () => store.userInfo?.isPasswordChangeRequired === true })` 로 잇는다.
   */
  isPasswordChangeRequired?: boolean
}

export interface AdminUiOptions<TUser extends AdminUserInfo = AdminUserInfo> {
  siteName?: string
  /** 현재 사용자. 스토어 게터를 넘긴다 — 패키지는 스토어 파일을 모른다. */
  user: () => TUser | null
  /**
   * 세션을 끝낸다. `AppBar`·`IpBlockedDialog` 가 부르고, 끝나면 `afterLogout ?? router.replace(loginPath)`.
   *
   * 🔴 **거부하지 않아야 한다.** 거부하면 뒤 이동이 건너뛰어져 사용자가 그 화면에 남고, 거부는
   *    `@click` 밖으로 새어 처리되지 않은 오류가 된다. 서버 호출이 실패해도 로컬 세션은 비우고
   *    resolve 한다 — `createAppStore().logout` 이 그렇게 한다(실패는 `console.warn`).
   */
  logout: () => Promise<void>
  /** 로그아웃 뒤 이동. 생략하면 `router.replace(loginPath)`. */
  afterLogout?: () => void | Promise<void>
  loginPath?: string
  /**
   * IP 차단 상태 게터. `IpBlockedDialog` 가 읽는다. 패키지는 이 상태를 세우지도 비우지도 않는다 —
   * 보통 `createApiClient({ onError })` 가 IP 차단 에러 코드를 보고 세운다.
   *
   * 🔴 **소비자가 로그인·로그아웃 때 비워야 한다.** 안 비우면 대화상자의 "로그아웃" 을 눌러 로그인
   *    화면으로 가도 대화상자가 그대로 떠 있다. 여전히 차단이면 다음 요청이 다시 세운다.
   */
  ipBlocked?: () => { blocked: boolean; ip?: string }
  table?: { itemsPerPageOptions?: readonly number[]; maxPageSize?: number }
}

export interface AdminUiContext<TUser extends AdminUserInfo = AdminUserInfo> {
  readonly siteName: string
  /** 🔴 호출 시점마다 평가된다 — 값을 캐시하지 않는다. 로그인·로그아웃이 반응형으로 따라와야 한다. */
  user: () => TUser | null
  /** 🔴 거부하지 않는다 — `AdminUiOptions.logout` 참조. */
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
