import type { RouteRecordRaw } from 'vue-router'

/**
 * 관리자 라우트 `meta` 의 모양.
 *
 * 정본: hangang-home `env.d.ts` 의 `RouteMeta` 증강 키 집합(crm·gise·hangang 이 같은 키를 쓴다).
 * 바꾼 점: `declare module 'vue-router'` 증강을 **하지 않는다.** 세 프로젝트가 이미
 * `apps/*\/env.d.ts` 에서 `permissions?: Permission[]` 로 증강하는데, 패키지가 `string[]` 로
 * 증강하면 같은 키의 선언이 충돌한다. 그래서 타입 + 헬퍼만 주고 증강은 템플릿(B) 몫으로 둔다.
 */
export interface AdminRouteMeta<P extends string = string> {
  title?: string
  layout?: 'auth' | 'default'
  isPublic?: boolean
  needNonAuth?: boolean
  selfOnly?: boolean
  /** AND */
  permissions?: P[]
  /** OR */
  anyPermissions?: P[]
  menu?: { group?: string; icon?: string; order?: number; title?: string }
}

/**
 * 라우트 선언의 `meta` 를 `AdminRouteMeta<P>` 로 좁히는 헬퍼. 런타임에는 항등이다.
 * 🔴 값을 바꾸거나 복사하지 않는다 — 가드·메뉴가 같은 객체의 `meta` 를 읽는다.
 */
export function defineAdminRoute<P extends string>(
  route: RouteRecordRaw & { meta?: AdminRouteMeta<P> },
): RouteRecordRaw {
  return route
}
