# admin-ui 셸 · 내비게이션 · 프론트 인프라 설계 (Phase 1 PR #2)

작성일: 2026-10-01 · 상태: 확정(구현 전) · 선행: `docs/01-phase0.md` §2-2 · §3-1, `docs/phase0-reports/fe-layout-ui.md` §3, `docs/phase0-reports/fe-infra.md` §3

## 1. 목표

PR #1 이 넣은 프리미티브(레이아웃·다이얼로그·표·토스트·Vuetify 프리셋·권한 훅) 위에, 관리자 앱 하나가 **로그인 → 셸 → 메뉴 → 권한 가드 → API 호출**까지 패키지 코드만으로 서도록 나머지 인프라를 넣는다. 이 PR 이 끝나면 템플릿(`kim5257-project-template` `preset/admin`)의 `App.vue` · `main.ts` · `layouts/*.vue` · `router/index.ts` · `stores/app.ts` 가 각각 10~30줄의 얇은 래퍼가 된다.

범위 밖(PR #3): `PermissionMatrix` · `TeamTree` · `SessionTable` · `useServerTable` · `useWriteFlow` · `useRoleEditor` · 페이지 템플릿.

## 2. 정본과 흡수 목록

| 산출물                                                       | 정본                                                                                    | 흡수할 것                                                                                                                                                                                                                                   | 버릴 것                                                                                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `installAdminUi` 컨텍스트                                    | (신규) — 네 프로젝트 `stores/app.ts` 에서 레이아웃 컴포넌트가 실제로 읽는 필드만        | `userInfo{userId,userName,permissions,teamName?,roleName?,loginId?}` · `logout()` · `ipBlocked/blockedIp`(crm·hangang)                                                                                                                      | 스토어 파일 import                                                                                                                                                                    |
| `MainMenu` · `MainMenuItem`                                  | hangang `apps/admin/src/components/layout/MainMenu*.vue`                                | axion `#prepend` 브랜드 슬롯, gise `VListGroup` 접이식 + `isPending` 칩, crm/axion 의 재귀 `rail` 누락 버그 수정(hangang 이 이미 고침)                                                                                                      | `@/data/main_menu` · `router/menu.ts` 직접 import(→ `items` prop), `is-last` 이중 의미 prop                                                                                           |
| `AppBar`                                                     | hangang `components/layout/AppBar.vue`                                                  | crm 우측 액션(알림·출결)을 `#actions` 슬롯으로, hangang 팀/역할 행, gise 텍스트 버튼은 `menuItems`/`#actions`                                                                                                                               | `/mypage`·`/account` 하드코딩, 스토어 import, `useSystemSettingsStore`                                                                                                                |
| `AdminShell` · `AuthShell`                                   | hangang `layouts/default.vue` · `layouts/auth.vue`                                      | axion `SuspensionBanner` 자리(`#banner`), gise `VContainer` 옵션                                                                                                                                                                            | 죽은 `watch`, `@vueuse` 의존, `IpBlockedDialog`·`ScheduleReminderListener` 내장(→ `#overlays` 또는 App.vue)                                                                           |
| `createAdminGuard`                                           | gise `router/guards.ts`(`createAuthGuard(deps)`)                                        | hangang `guard.ts` 의 fail-closed 명시 선언 검사(`isPublic`/`needNonAuth`/`selfOnly`/`permissions`/`anyPermissions` 전무 → 403), gise `permissionDenied`→403 · `isPasswordChangeRequired`→`/password`, axion `onUnauthorizedHome`(`/intro`) | 경로 문자열 하드코딩, 스토어·라우터 import, axion `PUBLIC_AUTH_ROUTES` 배열 방식                                                                                                      |
| `createTitleGuard` · `installChunkRecovery` · `safeRedirect` | gise `createTitleGuard` · hangang `router/recovery.ts` · gise `router/safe-redirect.ts` | crm 의 동적 제목(`() => string`)                                                                                                                                                                                                            | —                                                                                                                                                                                     |
| `buildMenu` · `filterMenu` · `flattenRoutes`                 | hangang `router/menu.ts` · `flatten-routes.ts`                                          | 파일 기반 라우팅용 `order` 필드, `depth: 1 \| 'all'`, `groups` 주입                                                                                                                                                                         | 최상위 고정 순회(hangang 요구 2.2 사정)                                                                                                                                               |
| `AdminRouteMeta<P>` · `defineAdminRoute`                     | hangang `env.d.ts` 의 증강 키 집합                                                      | —                                                                                                                                                                                                                                           | **패키지의 `declare module 'vue-router'` 증강** — crm·gise·hangang 이 `apps/*/env.d.ts` 에서 `permissions?: Permission[]` 로 이미 증강한다. 패키지가 `string[]` 로 증강하면 선언 충돌 |
| `createApiClient`                                            | hangang `api/client.ts`(+519줄 테스트)                                                  | gise `onAuthFailure()` 콜백 등록(순환 0) · `refreshInFlight` 공유 Promise, crm `paramsSerializer`, axion `NO_RETRY_PATHS`, crm/hangang IP 차단 훅(→ `onError`)                                                                              | `useSSE` 헤더, 스토어·라우터 동적 import, axion `validateStatus: () => true`                                                                                                          |
| `createAppStore<TMe>`                                        | hangang `stores/app.ts`(+테스트)                                                        | gise `permissionDenied`(401/403 구분) · `SessionNotEstablishedError`(Secure 쿠키 http 수신), gise `sanitize`(`toPermissions` 필터)                                                                                                          | 스토어 안 라우팅(crm) · SSE · systemSettings 호출                                                                                                                                     |
| `useDirtyGuard` · `useTableSelection`                        | gise `useDirtyGuard.ts` · crm `useTableSelection.ts`                                    | —                                                                                                                                                                                                                                           | `useQuerySyncedFilter`(crm, `queryCodec` 미확인 → 보류) · `useUserPreferences`(API 결합 → B)                                                                                          |

## 3. 공개 API

### 3-1. 컨텍스트

```ts
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
  loginPath?: string // '/login'
  ipBlocked?: () => { blocked: boolean; ip?: string }
  table?: { itemsPerPageOptions?: readonly number[]; maxPageSize?: number }
}

export const ADMIN_UI_KEY: InjectionKey<AdminUiContext>
export function createAdminUi<TUser>(options: AdminUiOptions<TUser>): AdminUiPlugin // app.use(...)
export function useAdminUi<TUser = AdminUserInfo>(): AdminUiContext<TUser> // inject, 없으면 throw
```

`createToast` 와 같은 모양(플러그인 객체 = API). `AppBar` · `MainMenu` · `AdminShell` · `IpBlockedDialog` 는 `useAdminUi()` 만 부른다.

### 3-2. 메뉴

```ts
export interface MenuNode<P extends string = string> {
  id: string
  title: string
  icon?: string
  to?: RouteLocationRaw // 있으면 leaf
  children?: MenuNode<P>[] // 없으면 group
  permissions?: P[] // AND
  anyPermissions?: P[] // OR
  disabled?: boolean
  badge?: string // gise '준비 중' 칩
  divider?: boolean // 이 노드 **뒤**에 구분선 (hangang 의미)
  order?: number // 파일 기반 라우팅에서 선언 순서가 없을 때
}

export function filterMenu<P extends string>(
  nodes: readonly MenuNode<P>[],
  check: PermissionCheck<P>,
): MenuNode<P>[]
// 🔴 permissions·anyPermissions 가 둘 다 없으면 통과(메뉴는 "선언 없음 = 공개"). 길이를 먼저 본다 —
//    hasPermission() 은 빈 인자에 false 라 그냥 부르면 전부 사라진다.

export function buildMenu<P extends string>(
  routes: readonly RouteRecordRaw[],
  options: {
    groups: readonly { key: string; title: string; icon?: string }[]
    depth?: 1 | 'all' // 기본 1 — 최상위 라우트의 meta.menu 만
  },
): MenuNode<P>[]
export function flattenRoutes(routes: readonly RouteRecordRaw[]): RouteRecordRaw[]
export function assertParentAnyPermissionsCoverChildren(routes: readonly RouteRecordRaw[]): void
```

`<MainMenu :items :check? :filter? groupMode="subheader|collapsible" :rail v-model="show">` — `check` 를 안 주면 `useAdminUi().user().permissions` 로 판정. 슬롯 `prepend`(`{ rail }`) · `append`.

### 3-3. AppBar · 셸

```ts
// <AppBar :title? :site-name? :menu-items? :show-team-role? @click:nav>
export interface AppBarMenuItem {
  icon?: string
  title: string
  to?: RouteLocationRaw
  onClick?: () => void
  visible?: boolean
}
// 슬롯: brand · actions · user-info · user-menu(전체 교체)
// 제목: props.title ?? route.meta.title. siteName 이 있으면 `${siteName} · ${title}`.
// 로그아웃: useAdminUi().logout() → afterLogout ?? router.replace(loginPath)

// <AdminShell rail-storage-key="admin_rail_menu" :container=false>
//   슬롯 drawer · app-bar(기본 MainMenu/AppBar; `menuProps`·`appBarProps` 로 통과) · banner · overlays · default(RouterView)
// <AuthShell> — 가운데 정렬 VMain. 슬롯 default(RouterView) · brand
```

레이아웃 **선택** 메커니즘(`vite-plugin-vue-layouts-next` 의 `layouts/default.vue` 경로 계약, hangang 의 `App.vue` `meta.layout` 분기)은 프로젝트 몫이다. 템플릿의 `layouts/default.vue` 는 `<AdminShell><RouterView/></AdminShell>` 한 줄이다.

### 3-4. 라우터

```ts
export interface AdminRouteMeta<P extends string = string> {
  title?: string
  layout?: 'auth' | 'default'
  isPublic?: boolean
  needNonAuth?: boolean
  selfOnly?: boolean
  permissions?: P[]
  anyPermissions?: P[]
  menu?: { group?: string; icon?: string; order?: number; title?: string }
}
export function defineAdminRoute<P extends string>(
  route: RouteRecordRaw & { meta?: AdminRouteMeta<P> },
): RouteRecordRaw

export function createAdminGuard<P extends string>(deps: {
  ensureInitialized: () => Promise<void>
  isAuthorized: () => boolean
  isPermissionDenied?: () => boolean // gise: /auth/me 가 403 → forbidden 으로
  isPasswordChangeRequired?: () => boolean // gise: 강제 비밀번호 변경 화면으로
  check: PermissionCheck<P>
  paths?: { login?: string; forbidden?: string; passwordChange?: string; home?: string }
  failClosed?: boolean // 기본 true — 명시 선언이 없으면 forbidden
  onUnauthorizedHome?: () => RouteLocationRaw | void // axion '/intro'
}): NavigationGuardWithThis<undefined>

export function createTitleGuard(appTitle: string | (() => string)): NavigationHookAfter
export function installChunkRecovery(router: Router, storage?: Storage): void
export function safeRedirect(value: unknown, fallback = '/'): string // '//'·'\' 차단
```

가드 순서(gise+hangang 병합): `ensureInitialized` → `needNonAuth && authorized → home` → `!isPublic && !authorized → (permissionDenied ? forbidden : login?redirect=)` → `isPasswordChangeRequired && to !== passwordChange → passwordChange` → `failClosed && 선언 전무 → forbidden` → `permissions`(AND) / `anyPermissions`(OR) 실패 → forbidden.

### 3-5. API 클라이언트

```ts
export function createApiClient(options: {
  baseURL: string
  refreshPath?: string                        // '/auth/refresh'
  noRetryPaths?: string[]                     // ['/auth/login']
  envelope?: 'success-data' | 'none'          // 🔴 기본 'success-data' (결정 1)
  bigint?: boolean                            // 기본 true — parseJSON / stringifyJSON (결정 3)
  onAuthFailure?: () => void                  // 갱신 실패. 등록 API `client.onAuthFailure(fn)` 도 제공
  onError?: (error: ApiError) => void         // IP 차단·정지 계정 훅
}): { axios: AxiosInstance; api: { get/post/patch/put/del }; onAuthFailure(fn): void }

export class ApiError extends Error { status?: number; code?: string; details?: unknown; raw: unknown }
```

- 성공 봉투는 `api.*` 가 벗겨 `data` 만 돌려준다. `envelope: 'none'` 이면 본문 그대로.
- 실패는 `ApiError` 로 정규화해 reject — `{success:false,code,message,details?}` 와 `{statusCode,code,...}` 둘 다 읽는다(과도기).
- 401 → `refreshPath` 1회(공유 Promise 로 합류) → 원 요청 재시도(`_retry`). 갱신 자신이 실패하면 대기 요청 전부 reject + `onAuthFailure`.
- `paramsSerializer`: boolean → `'1'/''`, Date → ISO, 배열, 중첩 `filter[key]`(crm).
- FormData 본문은 `Content-Type` 을 지워 브라우저가 boundary 를 붙이게 한다(hangang).

### 3-6. 스토어

```ts
export function createAppStore<TMe extends AdminUserInfo>(
  id: string,
  options: {
    fetchMe: () => Promise<TMe>
    login: (credentials: { userId: string; password: string }) => Promise<unknown>
    logout: () => Promise<void>
    isForbidden?: (error: unknown) => boolean // 403 → permissionDenied
    sanitize?: (me: TMe) => TMe // toPermissions 필터
  },
)
// defineStore(id, () => ({ initialized, authorized, userInfo, permissionDenied, initialize, login, logout, clearSession }))
export class SessionNotEstablishedError extends Error {}
```

스토어는 라우팅하지 않는다. `logout()` 은 API 호출 + `clearSession()` 만; 이동은 `AppBar`/가드가 한다.

## 4. 결정 반영

| 결정(`docs/01-phase0.md` §4) | 이 PR 에서                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1 봉투 `{success,data}`      | `createApiClient` 기본 `envelope: 'success-data'`                                                          |
| 3 bigint 래퍼 + Date         | `createApiClient` 기본 `bigint: true`(`@ssworks/admin-shared` 코덱)                                        |
| 5 fail-closed                | `createAdminGuard` 기본 `failClosed: true`; `filterMenu` 는 "선언 없음 = 공개"(메뉴는 안내, 가드가 방어선) |
| RouteMeta 증강 금지          | `AdminRouteMeta<P>` 타입 + `defineAdminRoute` 헬퍼. 증강 파일은 템플릿 소유                                |

## 5. 의존성

`peerDependencies` 추가: `vue-router ^4.5 || ^5`(AdminShell·가드·메뉴), `pinia ^3`(createAppStore — `peerDependenciesMeta.optional`), `axios ^1.7`(createApiClient — optional). 서브패스 export 로 가르지 않는다 — 한 엔트리에서 tree-shaking 에 맡긴다(전부 ESM, sideEffects 는 CSS/vue 뿐).

## 6. 테스트 계약 (이관 목록)

| 출처                                                      | 대상                                                    | 비고                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| hangang `router/guard.test.ts`                            | `createAdminGuard`                                      | 순수 함수 케이스 그대로 + gise 403/password 분기 추가                    |
| axion `router/auth-guard.spec.ts`(14 케이스)              | `createAdminGuard`                                      | `/intro` → `onUnauthorizedHome` 으로                                     |
| hangang `router/menu.test.ts` · `flatten-routes.test.ts`  | `buildMenu` · `filterMenu` · `flattenRoutes`            | "항목의 권한이 그 라우트의 meta 와 글자 그대로 같다"                     |
| hangang `router/route-meta.test.ts` 중 패키지화 가능 부분 | `assertParentAnyPermissionsCoverChildren`               | 원문 정규식 파싱 부분은 템플릿(B)에 남긴다                               |
| hangang `router/recovery.test.ts`                         | `installChunkRecovery`                                  | —                                                                        |
| gise `router/safe-redirect` 동작                          | `safeRedirect`                                          | 신규                                                                     |
| hangang `api/client.test.ts`(519줄)                       | `createApiClient`                                       | 봉투 벗기기·bigint 기본 경로를 **추가** — hangang 은 둘 다 없는 쪽이었다 |
| hangang `stores/app.test.ts` · axion `stores/app.spec.ts` | `createAppStore`                                        | 라우팅 단언은 제거(스토어가 라우팅하지 않는다)                           |
| (신규)                                                    | `AppBar` · `MainMenu` · `AdminShell` · `AuthShell` 렌더 | 슬롯 자리 · 메뉴 필터 · 로그아웃 후 `afterLogout` 호출 · rail 저장 키    |

## 7. 비범위·보류

- `useQuerySyncedFilter`(crm) — `utils/queryCodec.ts` 가 추출본에 없어 PR #3 에서 원본 확인 후.
- `useFieldErrors`(gise) — `validationDetailsSchema` 계약으로 PR #3.
- `IpBlockedDialog` — PR #1 에서 빠졌다. 이 PR 에서 `useAdminUi().ipBlocked` 를 읽는 형태로 넣는다.

## 8. 구현 중 정정 (2026-10-01)

최종 리뷰(14e4b9f..e54c5ec)에서 나온 결정. 위 본문과 어긋나면 이 절이 이긴다.

- **R12 — `pinia`·`axios` 는 필수 peer 다.** §5 의 "optional" 과 "한 엔트리 + tree-shaking" 은 서로 맞지 않는다. 빌드된 `dist/index.js` 가 두 패키지를 최상단에서 import 하므로, `axios` 가 없는 소비자는 `safeRedirect` 하나만 써도 `vite build` 가 "failed to resolve import axios" 로 깨진다. 한 엔트리 결정을 지키고 `peerDependenciesMeta.optional` 을 뺐다. 네 참조 프로젝트는 이미 둘 다 설치돼 있다.
- **R13 — `buildMenu` 의 `id`·`to` 는 전체 경로다.** 템플릿은 vue-router 5 auto-routes + `setupLayouts` 를 쓰고, 그 결과는 `{ path: '/users', component: Layout, children: [{ path: '', meta, component: Page }] }` 다. 레코드의 `path` 를 그대로 쓰면 `depth: 'all'` 이 `id: ''`·`to: ''` 를 낸다(깨진 링크, Vue key 중복). 순회하면서 vue-router 와 같은 규칙(`/` 로 시작 → 그대로, `''` → 부모 경로, 그 밖 → `부모/자식`)으로 이어 쓴다. 절대 경로만 쓰는 손 라우트 표는 결과가 같다. `flattenRoutes` 의 계약("path 를 이어 붙이지 않는다")은 그대로 두고, `assertParentAnyPermissionsCoverChildren` 의 오류 문구만 전체 경로로 바꿨다.
- **R14 — `AdminShell` 은 슬롯을 기본 자식에 전달하고, 교체 슬롯에 props 를 준다.** §2 가 흡수하기로 한 crm `#actions`·axion `#prepend` 브랜드는 R5 의 `menuProps`·`appBarProps` 통과만으로는 닿지 않는다 — 기본 `AppBar`·`MainMenu` 를 통째로 바꿔야 했고, 셸의 `showMenu`·`railMenu`·`onClickNav` 가 비공개라 nav 토글을 잃었다. 전달 슬롯 `menu-prepend`·`menu-append`(→ MainMenu `prepend`·`append`, `{ rail }`) · `app-bar-brand`·`app-bar-actions`·`app-bar-user-info`·`app-bar-user-menu`(→ AppBar 같은 이름 슬롯, 슬롯 props 그대로)를 받았을 때만 건넨다. 교체 슬롯은 `#drawer` `{ show, rail, setShow }` · `#app-bar` `{ toggleNav }` 를 받는다. `defineSlots` 로 타입을 적는다.
- **R15 — 킷 확인 창(`createConfirm` · `<AdminConfirm />` · `useConfirm`)으로 이탈 확인을 묻는다(2026-10-08, 브라우저 확인 2장에서 요청 — "브라우저 기본 alert 는 UX 를 해친다").** `useDirtyGuard` 는 gise 원본대로 `window.confirm` 이었다(가드에서 대화상자의 답을 기다리는 상태 기계를 두지 않으려고). 이제 `createToast` 와 같은 모양의 플러그인이 앱 하나에 확인 창 하나를 두고, `App.vue` 의 `<AdminConfirm />` 이 킷 `ConfirmDialog` 로 그린다. 가드는 `ask()` 의 Promise 를 기다린다(vue-router 비동기 가드). 문구는 제목 "화면 떠나기" · 기존 `message` · "머물기" / 빨간 "떠나기"(`reversible: false` — 저장하지 않은 변경이 사라진다). 🔴 플러그인이 없거나 `<AdminConfirm />` 이 마운트돼 있지 않으면 `window.confirm` 으로 떨어진다 — 자리 수를 세어, 아무도 그리지 않는 창을 기다리며 이동이 영원히 멈추는 것을 막는다. 열린 채 마지막 자리가 떠나면 열린 물음은 `false`. 한 번에 하나 — 겹치면 앞의 물음은 `false`. `beforeunload` 는 브라우저가 모양 · 문구를 못 바꾸게 막아 그대로다. 페이지마다 대화상자를 붙이는 안(바인딩 반환)은 고르지 않았다 — 페이지가 그리기를 잊으면 이동이 멈춘다.
