import type { PermissionCheck } from '@ssworks/admin-shared'
import type { NavigationGuardWithThis, RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import type { AdminRouteMeta } from './route-meta.js'

/**
 * 전역 `beforeEach` 가드 팩토리. 스토어·라우터 파일을 import 하지 않고 getter 를 주입받는다.
 *
 * 정본: hangang-home `router/guard.ts`(`resolveGuard` 의 순서·fail-closed) + gise-home
 * `router/guards.ts`(`createAuthGuard` 의 deps 주입·403/password 분기) + axion `auth-guard.ts`
 * (`/intro` → `onUnauthorizedHome`).
 * 바꾼 점: (1) 권한 판정을 `PermissionCheck` 로 받는다(메뉴 필터와 같은 판정기 — 메뉴는 보이는데
 * 라우트는 403 이 안 생긴다). (2) `to.meta` 는 vue-router 의 `RouteMeta` 를 `AdminRouteMeta<P>` 로
 * 캐스팅해 읽는다 — `declare module 'vue-router'` 증강을 하지 않는다. (3) 자기 자신으로는
 * 리다이렉트하지 않는다(아래).
 */
export interface AdminGuardDeps<P extends string> {
  /** 인증 스토어가 아직 초기화되지 않았으면 초기화한다. 멱등해야 한다. 내비게이션마다 1회 기다린다. */
  ensureInitialized: () => Promise<void>
  isAuthorized: () => boolean
  /**
   * 인증은 됐으나 권한이 없어(`/auth/me` 가 403) 인가되지 않은 상태인가. 미로그인과 같게 다루면
   * 오류 메시지 없는 `/login` 루프가 된다 — forbidden 으로 보낸다.
   */
  isPermissionDenied?: () => boolean
  /** 본인이 비밀번호를 바꿔야 하는 계정인가. */
  isPasswordChangeRequired?: () => boolean
  check: PermissionCheck<P>
  paths?: { login?: string; forbidden?: string; passwordChange?: string; home?: string }
  /** 기본 `true` — `isPublic`·`selfOnly`·`permissions`·`anyPermissions` 가 전무하면 forbidden. */
  failClosed?: boolean
  /** 미인증 사용자가 `paths.home` 에 오면 갈 곳(axion `/intro`). undefined 면 로그인으로. */
  onUnauthorizedHome?: () => RouteLocationRaw | void
}

/**
 * 🔴 **가드가 부재를 통과로 해석하면 안 된다.** `failClosed`(기본) 에서 `meta` 에 `isPublic`·
 *    `selfOnly`·`permissions`·`anyPermissions` 중 아무 표시도 없으면 **거부한다.** 라우트를 하나
 *    더 얹으며 `meta` 를 빠뜨리면 권한 검사를 통과하는 게 아니라 이 자리에서 막힌다. 서버
 *    쪽 "권한 데코레이터 없이 이식한 컨트롤러" 와 같은 모양의 사고를 막는다.
 *
 * 🔴 **순서를 바꾸지 말 것** — 초기화 → `needNonAuth` → 미인증 리다이렉트 → 비밀번호 변경 →
 *    명시 선언 검사 → 권한. 명시 선언 검사를 미인증 리다이렉트보다 앞에 두면 로그인 안 한 사람이
 *    `/403` 으로 간다.
 *
 * 🔴 **자기 자신으로는 리다이렉트하지 않는다.** 계산한 목적지의 path 가 `to.path` 와 같으면
 *    통과시킨다. 소비자가 `/login` 에 `isPublic` 을 빠뜨리거나 `/403` 에 meta 를 안 달아도
 *    `/login`·`/403`·`/password` 가 무한 루프에 빠지지 않는다. (`/password` 는 한 걸음 더:
 *    비밀번호 변경이 필요한 계정에게는 meta 와 무관하게 통과시킨다.)
 */
export function createAdminGuard<P extends string>(
  deps: AdminGuardDeps<P>,
): NavigationGuardWithThis<undefined> {
  const login = deps.paths?.login ?? '/login'
  const forbidden = deps.paths?.forbidden ?? '/403'
  const passwordChange = deps.paths?.passwordChange ?? '/password'
  const home = deps.paths?.home ?? '/'
  const failClosed = deps.failClosed ?? true

  return async function adminGuard(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
    await deps.ensureInitialized()

    const meta = to.meta as AdminRouteMeta<P>
    /** 목적지가 이미 거기면 통과, 아니면 이동. */
    const go = (path: string, location: RouteLocationRaw = { path }): true | RouteLocationRaw =>
      to.path === path ? true : location

    const authorized = deps.isAuthorized()

    // ① 이미 로그인했으면 로그인 화면에 들이지 않는다.
    if (meta.needNonAuth && authorized) return go(home)

    // ② 미인증 — 공개가 아니면 로그인(또는 권한 없음) 으로.
    if (!authorized && !meta.isPublic) {
      // 🔴 인증은 됐는데 권한이 0개인 상태다. 로그인으로 보내면 같은 자리를 맴돌 뿐이다.
      if (deps.isPermissionDenied?.()) return go(forbidden)

      if (to.path === home && deps.onUnauthorizedHome) {
        const target = deps.onUnauthorizedHome()
        if (target !== undefined) return target
      }
      return go(login, { path: login, query: { redirect: to.fullPath } })
    }

    // ③ 변경이 필요한 계정은 passwordChange 밖으로 못 나간다. 그 화면 자신은 통과한다.
    if (authorized && deps.isPasswordChangeRequired?.()) {
      return go(passwordChange, { path: passwordChange, query: { redirect: to.fullPath } })
    }

    // ④ 🔴 명시 선언 검사 — fail-closed.
    if (
      failClosed &&
      !meta.isPublic &&
      !meta.selfOnly &&
      !meta.permissions?.length &&
      !meta.anyPermissions?.length
    ) {
      return go(forbidden)
    }

    // ⑤ 권한 — permissions(AND) · anyPermissions(OR).
    if (meta.permissions?.length && !deps.check.hasPermission(...meta.permissions)) {
      return go(forbidden)
    }
    if (meta.anyPermissions?.length && !deps.check.hasAnyPermission(...meta.anyPermissions)) {
      return go(forbidden)
    }

    return true
  }
}
