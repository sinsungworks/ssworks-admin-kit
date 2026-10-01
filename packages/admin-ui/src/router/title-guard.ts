import type { NavigationHookAfter } from 'vue-router'

/**
 * 전역 `afterEach` — `meta.title` 로 문서 타이틀을 세운다. 형식은 `"페이지 | 앱"`.
 *
 * 정본: ssworks-gise-home `apps/admin/src/router/guards.ts` 의 `createTitleGuard`.
 * 바꾼 점: `appTitle` 에 함수를 받아 내비게이션마다 평가한다(crm-v5 의 동적 제목 — 조직명 등).
 * `meta.title` 은 unknown 으로 읽고 문자열만 쓴다(공개 `RouteMeta` 를 증강하지 않기 때문).
 */
export function createTitleGuard(appTitle: string | (() => string)): NavigationHookAfter {
  return (to) => {
    const app = typeof appTitle === 'function' ? appTitle() : appTitle
    const raw: unknown = to.meta.title
    const page = typeof raw === 'string' ? raw.trim() : ''
    document.title = page ? `${page} | ${app}` : app
  }
}
