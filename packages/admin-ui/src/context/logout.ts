import { useRouter } from 'vue-router'
import { useAdminUi } from './admin-ui.js'

/**
 * 로그아웃 → 이동. `AppBar` 와 `IpBlockedDialog` 가 같은 순서를 쓴다.
 *
 * 정본: hangang-home apps/admin/src/components/layout/AppBar.vue `onLogout`.
 * 바꾼 점: `appStore.logout()` + `router.replace('/login')` 하드코딩을 `useAdminUi()` 의
 *          `logout` → `afterLogout ?? router.replace(loginPath)` 로 일반화했다.
 *
 * 🔴 스토어는 라우팅하지 않는다. 이동은 여기서 한다. 반드시 `logout()` 이 끝난 **뒤**에 이동한다 —
 *    세션이 안 지워진 채 `/login` 으로 가면 가드가 되돌려 보낸다.
 * setup 중에 불러야 한다(inject 를 캡처한다). 패키지 내부용 — index.ts 로 내보내지 않는다.
 */
export function useAdminLogout(): () => Promise<void> {
  const ctx = useAdminUi()
  const router = useRouter()
  return async () => {
    await ctx.logout()
    if (ctx.afterLogout) {
      await ctx.afterLogout()
    } else {
      await router.replace(ctx.loginPath)
    }
  }
}
