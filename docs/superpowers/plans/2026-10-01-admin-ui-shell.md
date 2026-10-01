# admin-ui 셸 · 내비게이션 · 프론트 인프라 Implementation Plan (Phase 1 PR #2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@ssworks/admin-ui` 에 셸(`AdminShell`/`AuthShell`) · `AppBar` · `MainMenu` · `createAdminUi` 컨텍스트 · 라우터 가드/메뉴 파생 · `createApiClient` · `createAppStore` 를 넣어, 관리자 앱의 `App.vue`·`main.ts`·`layouts/*`·`router/index.ts`·`stores/app.ts` 가 각각 10~30줄의 얇은 래퍼로 줄어들게 한다.

**Architecture:** 컴포넌트는 스토어·라우터 파일을 import 하지 않는다 — `createAdminUi()` 플러그인이 provide 한 컨텍스트(`user()`·`logout()`·`ipBlocked()`)만 `inject` 한다(PR #1 의 `createToast` 와 같은 모양). 가드·메뉴·API 클라이언트·스토어는 전부 **의존성 주입 팩토리**(gise 방식)다. `RouteMeta` 는 증강하지 않고 `AdminRouteMeta<P>` 타입만 낸다.

**Tech Stack:** Vue 3.5 · Vuetify 4 · vue-router 4/5(peer) · pinia 3(optional peer) · axios 1(optional peer) · vitest 4 + happy-dom · vite 8 lib build + vite-plugin-dts

**Spec:** `docs/superpowers/specs/2026-10-01-admin-ui-shell-design.md`

## Global Constraints

- 🔴 **정본은 `docs/01-phase0.md` §1 표가 정한다.** 참조 프로젝트는 이 저장소의 형제 폴더(`../hangang-home` · `../ssworks-gise-home` · `../ssworks-axion-admin` · `../kim5257-crm-v5`)에 있다. 옮긴 파일 머리에 `정본: <project> <path>` 와 바꾼 점을 적는다. `/port` 커맨드가 그 절차다.
- 🔴 **SFC 는 Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import 한다.** vue API 도 명시 import. auto-import 에 기대지 않는다.
- 🔴 **패키지 소스에서 `declare module 'vue-router'` 를 쓰지 않는다.** crm·gise·hangang 이 `env.d.ts` 에서 `RouteMeta.permissions?: Permission[]` 로 증강하고 있어 충돌한다. `AdminRouteMeta<P>` 타입 + `defineAdminRoute()` 헬퍼만.
- 🔴 **`createApiClient` 기본값은 `envelope: 'success-data'` · `bigint: true`** (결정 1·3). hangang 정본은 둘 다 없는 쪽이었다 — 테스트를 옮길 때 그 기본 경로를 **추가**한다.
- 🔴 **`createAdminGuard` 기본값은 `failClosed: true`**. `filterMenu` 는 "선언 없음 = 공개" 이고 `hasPermission()` 을 빈 인자로 부르지 않는다(빈 인자는 false 다).
- 🔴 **Boolean prop 에 `undefined` 기본값 금지**(Vue 가 false 로 캐스팅). 3상태는 `boolean | 'auto'`.
- 🔴 **`:loading` 은 클릭을 안 막는다.** 제출 버튼은 `:disabled` 와 한 벌.
- `v-model` 은 기본 `modelValue`. 복수 모델(`page`·`sortBy`)만 이름을 붙인다.
- 테스트: `src/**/*.test.ts`. DOM 이 필요하면 파일 머리 `// @vitest-environment happy-dom`. 오버레이를 여는 테스트는 `installVisualViewport()` 를 모듈 최상단에서. 공용 헬퍼는 `packages/admin-ui/src/test/setup.ts`.
- 테스트 명령: `pnpm --filter @ssworks/admin-ui exec vitest run <파일명 일부>`. 전체는 `pnpm check`.
- 새 peer(`vue-router`·`pinia`·`axios`)는 `packages/admin-ui/package.json` 의 `peerDependencies` + `devDependencies` 양쪽에, `pinia`·`axios` 는 `peerDependenciesMeta` optional. `vite.config.ts` 의 `rollupOptions.external` 에 셋을 더한다.
- `pnpm check` 가 초록이 아니면 Task 를 끝내지 않는다. 각 Task 끝에 커밋(한국어 conventional commits, 끝 줄 `Co-Authored-By`).
- 🔴 **`git push` · `pnpm release` 금지**(`.claude/settings.json` 이 막는다). 발행은 release 워크플로의 몫.
- 파일은 LF(`.gitattributes`). Windows 에서 `/dev/null` 리다이렉트 금지(`NUL` 파일이 생긴다).

## Review Focus

1. **메뉴와 가드가 같은 판정기를 쓰는가** — `MainMenu` 의 기본 `check` 와 `createAdminGuard` 의 `check` 가 같은 `PermissionCheck` 인스턴스를 받을 수 있어야 한다. 갈리면 "메뉴는 보이는데 라우트는 403". → Task 2·5 테스트가 같은 카탈로그로 양쪽을 돌린다.
2. **스토어 ↔ 라우터 ↔ API 순환이 0인가** — 패키지 소스 어디에도 `useRouter()` 를 모듈 스코프에서 부르거나 스토어 파일을 import 하는 곳이 없어야 한다. 가드는 deps, 클라이언트는 콜백, 컴포넌트는 inject. → Task 10 의 import 그래프 검사 테스트.
3. **봉투 + bigint 기본 경로** — `api.get()` 이 `{success:true,data:{userNo:"BigInt(1)"}}` 를 받아 `{userNo: 1n}` 을 돌려주는가, 실패 `{success:false,code}` 가 `ApiError.code` 로 오는가. → Task 7.
4. **갱신 경쟁** — 동시 401 셋이 `refreshPath` 를 **한 번만** 부르고, 갱신 실패 시 셋 다 reject + `onAuthFailure` 1회인가. → Task 7 (hangang M7 · gise refreshInFlight 케이스).
5. **ReauthDialog 때와 같은 함정** — `AppBar` 로그아웃 뒤 이동 책임이 컴포넌트에 있는가(스토어가 라우팅하지 않는다). → Task 3 테스트가 `afterLogout` 호출을 잰다.
6. **fail-closed 가 기능을 죽이지 않는가** — `isPublic`·`selfOnly` 라우트가 통과하고, `/login`·`/403`·`/password` 자체가 가드에 막히지 않는가. → Task 5 양성 대조.

---

## File Structure

| 파일                                                                               | 책임                                                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `packages/admin-ui/src/context/admin-ui.ts`                                        | `createAdminUi` · `useAdminUi` · `ADMIN_UI_KEY` · `AdminUserInfo` · `AdminUiOptions`                  |
| `packages/admin-ui/src/menu/menu.ts`                                               | `MenuNode` · `filterMenu` · `buildMenu` · `flattenRoutes` · `assertParentAnyPermissionsCoverChildren` |
| `packages/admin-ui/src/menu/MainMenu.vue` · `MainMenuItem.vue`                     | 드로어 메뉴                                                                                           |
| `packages/admin-ui/src/layout/AppBar.vue`                                          | 앱바                                                                                                  |
| `packages/admin-ui/src/layout/AdminShell.vue` · `AuthShell.vue`                    | 셸                                                                                                    |
| `packages/admin-ui/src/components/common/IpBlockedDialog.vue`                      | IP 차단 안내(PR #1 누락분)                                                                            |
| `packages/admin-ui/src/router/route-meta.ts`                                       | `AdminRouteMeta<P>` · `defineAdminRoute`                                                              |
| `packages/admin-ui/src/router/guard.ts`                                            | `createAdminGuard`                                                                                    |
| `packages/admin-ui/src/router/title-guard.ts` · `recovery.ts` · `safe-redirect.ts` | 부속                                                                                                  |
| `packages/admin-ui/src/api/client.ts` · `api/error.ts`                             | `createApiClient` · `ApiError`                                                                        |
| `packages/admin-ui/src/store/app-store.ts`                                         | `createAppStore` · `SessionNotEstablishedError`                                                       |
| `packages/admin-ui/src/composables/useDirtyGuard.ts` · `useTableSelection.ts`      | 범용 composable                                                                                       |
| `packages/admin-ui/src/index.ts`                                                   | export                                                                                                |
| `packages/admin-ui/README.md` · `.changeset/*.md`                                  | 문서·버전                                                                                             |

---

### Task 1: `createAdminUi` 컨텍스트

**Files:**

- Create: `packages/admin-ui/src/context/admin-ui.ts`
- Test: `packages/admin-ui/src/context/admin-ui.test.ts`

- [ ] 참조 읽기: 네 프로젝트 `stores/app.ts` 에서 `AppBar`·`MainMenu`·`IpBlockedDialog`·`layouts/default.vue` 가 실제로 읽는 필드(`docs/phase0-reports/fe-layout-ui.md` §3-1 표). 그 이상을 컨텍스트에 넣지 않는다.
- [ ] 테스트 먼저: `createAdminUi()` 가 플러그인이고 `useAdminUi()` 가 같은 객체를 돌려준다 · 플러그인 없이 `useAdminUi()` 는 `/createAdminUi/` 로 던진다 · `user()` 게터가 호출 시점마다 평가된다 · `loginPath` 기본 `'/login'` · `table.itemsPerPageOptions` 기본이 `DEFAULT_ITEMS_PER_PAGE_OPTIONS`.
- [ ] 구현: `createToast` 와 같은 모양(플러그인 객체 = API). `ADMIN_UI_KEY: InjectionKey<AdminUiContext>`.
- [ ] `DataTablePanel`/`DataTableBody` 의 `itemsPerPageOptions` 기본값을 "prop → 컨텍스트 → 상수" 순으로 해석하도록 바꾼다(컨텍스트 없으면 지금과 동일). 기존 표 테스트가 그대로 초록이어야 한다.
- [ ] `pnpm --filter @ssworks/admin-ui exec vitest run admin-ui` 초록 → 커밋 `feat(admin-ui): createAdminUi 컨텍스트`.

### Task 2: 메뉴 모델 · `MainMenu` · `MainMenuItem`

**Files:**

- Create: `packages/admin-ui/src/menu/menu.ts`, `MainMenu.vue`, `MainMenuItem.vue`
- Test: `packages/admin-ui/src/menu/menu.test.ts`, `main-menu.render.test.ts`

- [ ] 참조 읽기: `../hangang-home/apps/admin/src/router/menu.ts`(+`menu.test.ts`), `components/layout/MainMenu.vue`·`MainMenuItem.vue`; axion `MainMenu.vue` 의 `#prepend` 브랜드 자리; gise `layouts/default.vue:37-64` 의 `VListGroup`·`isPending`.
- [ ] `menu.ts` 테스트 먼저(순수 함수): `filterMenu` — 선언 없는 노드는 통과, `permissions` AND, `anyPermissions` OR, 자식이 전부 걸러진 그룹은 사라짐, `'*'` 단락; `buildMenu` — `meta.menu` 있는 라우트만, `groups` 순서 · 그룹 안은 `order` → 선언 순서, 항목의 `permissions`가 그 라우트 meta 와 **글자 그대로 같다**(hangang `menu.test.ts:34`), `depth:'all'` 이면 children 라우트도; `flattenRoutes`; `assertParentAnyPermissionsCoverChildren` — 부모 `anyPermissions` ⊇ 자식 `permissions` 합집합 아니면 throw.
- [ ] `menu.ts` 구현. `MenuNode<P>` 는 스펙 §3-2.
- [ ] 렌더 테스트 먼저: `items` 를 그리고 권한으로 걸러진다(컨텍스트 `user().permissions` 기본 / `check` prop 우선) · `groupMode='subheader'` 는 `VListSubheader`, `'collapsible'` 은 `VListGroup` · `disabled`+`badge` 가 칩으로 · `divider` 가 그 노드 **뒤**에 · `rail` 이 재귀 자식에도 전달된다(crm/axion 버그 회귀) · `#prepend` 슬롯이 `{ rail }` 을 받는다.
- [ ] `MainMenu.vue`(`defineModel<boolean>()` = drawer show, props `items/check/filter/groupMode/rail`) · `MainMenuItem.vue` 구현. 명시 import.
- [ ] 초록 → 커밋 `feat(admin-ui): MainMenu · 메뉴 파생(buildMenu/filterMenu)`.

### Task 3: `AppBar`

**Files:**

- Create: `packages/admin-ui/src/layout/AppBar.vue`
- Test: `packages/admin-ui/src/layout/app-bar.render.test.ts`

- [ ] 참조 읽기: `../hangang-home/apps/admin/src/components/layout/AppBar.vue`, axion `AppBar.vue`, crm `AppBar.vue`(우측 액션 두 개), gise `layouts/default.vue:66-73`.
- [ ] 테스트 먼저: 제목 = `title` prop → `route.meta.title` 순, `siteName` 이 있으면 `사이트 · 제목` · `user-info` 기본이 `userName`/`userId` 이고 `showTeamRole` 이면 팀/역할 행 · `menuItems` 가 아바타 메뉴에 그려지고 `visible:false` 는 안 그려짐 · `#actions` 슬롯 자리 · 로그아웃 클릭 → `logout()` 뒤 `afterLogout()`(없으면 `router.replace(loginPath)`) · `@click:nav` emit. 라우터는 `createRouter({ history: createMemoryHistory(), routes })` 로 테스트 안에서 만든다.
- [ ] 구현. `useAdminUi()`·`useRoute()`·`useRouter()` 만 쓴다. 명시 import(`VAppBar`·`VAppBarNavIcon`·`VMenu`·`VList*`·`VAvatar`…).
- [ ] 초록 → 커밋 `feat(admin-ui): AppBar`.

### Task 4: `AdminShell` · `AuthShell` · `IpBlockedDialog`

**Files:**

- Create: `packages/admin-ui/src/layout/AdminShell.vue`, `AuthShell.vue`, `packages/admin-ui/src/components/common/IpBlockedDialog.vue`
- Test: `packages/admin-ui/src/layout/shell.render.test.ts`, `components/common/ip-blocked-dialog.render.test.ts`

- [ ] 참조 읽기: hangang `layouts/default.vue`·`auth.vue`, axion `layouts/default.vue`(배너 자리), gise `layouts/default.vue`(VContainer), hangang `components/common/IpBlockedDialog.vue`.
- [ ] 테스트 먼저: `AdminShell` — `MainMenu`·`AppBar` 가 기본으로 그려지고 `#drawer`/`#app-bar` 로 교체된다 · `#banner` 가 `VMain` 안 `RouterView` 앞 · `#overlays` 가 `VMain` 뒤 · rail 상태가 `railStorageKey`(기본 `admin_rail_menu`)로 `localStorage` 에 저장/복원(happy-dom localStorage) · `container` 가 기본 false(PanelLayout 전제). `AuthShell` — 가운데 정렬 `VMain` + `#brand`. `IpBlockedDialog` — `useAdminUi().ipBlocked()` 가 `{blocked:true, ip}` 면 열리고 로그아웃 버튼이 `logout()`→`afterLogout()`.
- [ ] 구현. `useDisplay().mdAndDown` 으로 rail/overlay 판정(hangang). `@vueuse` 를 들이지 않는다 — `ref + watch` 로 저장.
- [ ] 초록 → 커밋 `feat(admin-ui): AdminShell · AuthShell · IpBlockedDialog`.

### Task 5: 라우터 — `AdminRouteMeta` · `createAdminGuard` · 부속

**Files:**

- Create: `packages/admin-ui/src/router/route-meta.ts`, `guard.ts`, `title-guard.ts`, `recovery.ts`, `safe-redirect.ts`
- Test: `packages/admin-ui/src/router/guard.test.ts`, `recovery.test.ts`, `safe-redirect.test.ts`, `title-guard.test.ts`

- [ ] 참조 읽기: `../ssworks-gise-home/apps/admin/src/router/guards.ts`·`safe-redirect.ts`, `../hangang-home/apps/admin/src/router/guard.ts`(+`guard.test.ts`)·`recovery.ts`(+`recovery.test.ts`)·`env.d.ts`(RouteMeta 키 집합), `../ssworks-axion-admin/packages/frontend/src/router/auth-guard.ts`(+`auth-guard.spec.ts` 14 케이스).
- [ ] `guard.test.ts` 먼저 — 순수 함수로 `to` 객체를 만들어 돌린다(라우터 불필요). 케이스: 초기화 전 `ensureInitialized` 1회 · `needNonAuth && authorized → home` · 미인증 + `isPublic` 통과 · 미인증 + 비공개 → `login?redirect=<fullPath>` · 미인증 + `permissionDenied` → forbidden · `isPasswordChangeRequired` → passwordChange(그 화면 자신은 통과) · fail-closed: 선언 전무 → forbidden, `selfOnly` 통과 · AND 실패 → forbidden · OR 하나면 통과 · `'*'` 전부 통과 · `failClosed:false` 면 선언 전무도 통과(crm/axion 과도기) · `onUnauthorizedHome` 이 `/` 미인증을 `/intro` 로 · `paths` 기본값 `/login`·`/403`·`/password`·`/`.
- [ ] `route-meta.ts`(`AdminRouteMeta<P>` · `defineAdminRoute` — 런타임은 항등 함수, 타입만 좁힌다) · `guard.ts` 구현. 🔴 `declare module 'vue-router'` 금지.
- [ ] `title-guard.ts`(gise + crm 동적 제목) · `recovery.ts`(hangang 그대로, 테스트 이관) · `safe-redirect.ts`(gise + 테스트 신규: `//evil`·`\\evil`·`http://` 거부, `/a/b?c=1` 통과, 기본 `/`).
- [ ] 초록 → 커밋 `feat(admin-ui): createAdminGuard · AdminRouteMeta · 라우터 부속`.

### Task 6: 메뉴 ↔ 가드 통합 검사

**Files:**

- Test: `packages/admin-ui/src/menu/menu-guard.integration.test.ts`

- [ ] 같은 `definePermissions` 카탈로그 · 같은 `check` 로 `buildMenu` 결과의 모든 leaf 에 대해 `createAdminGuard` 를 돌려 "메뉴에 보이는 항목은 가드도 통과한다 / 메뉴에 안 보이는 항목은 가드가 403" 을 단언한다(Review Focus 1). 권한 조합 몇 가지(없음 · 일부 · `'*'`)를 돈다.
- [ ] 초록 → 커밋 `test(admin-ui): 메뉴·가드 정합 통합 테스트`.

### Task 7: `createApiClient`

**Files:**

- Create: `packages/admin-ui/src/api/client.ts`, `error.ts`
- Test: `packages/admin-ui/src/api/client.test.ts`
- Modify: `packages/admin-ui/package.json`(axios optional peer + dev), `vite.config.ts`(external)

- [ ] 참조 읽기: `../hangang-home/apps/admin/src/api/client.ts`(+`client.test.ts` 519줄), `../ssworks-gise-home/apps/admin/src/api/client.ts`(`onAuthFailure`·`refreshInFlight`), crm `frontend-core/src/api/client.ts`(`paramsSerializer`), axion `client.ts`(`NO_RETRY_PATHS`).
- [ ] 테스트 먼저(hangang 테스트를 옮기되 어댑터 `axios-mock-adapter` 대신 hangang 이 쓴 방식을 그대로 — 파일을 읽고 따른다): 봉투 벗기기 기본 · `envelope:'none'` · bigint 리바이버/리플레이서 기본 · 실패 봉투 → `ApiError{status,code,message,details}` · `{statusCode,...}` 형도 읽힘 · 401 → 갱신 1회 → 재시도 · 동시 401 셋 → 갱신 **1회** · 갱신 실패 → 대기 전부 reject + `onAuthFailure` 1회 · `noRetryPaths` 는 갱신 안 함 · `refreshPath` 자신의 401 은 갱신 안 함 · `paramsSerializer`(boolean/Date/배열/`filter[key]`) · FormData 는 `Content-Type` 제거 · `onError` 가 모든 실패에 1회.
- [ ] 구현. `ApiError` 는 `error.ts`. 등록 API `client.onAuthFailure(fn)` 도 제공(gise).
- [ ] 초록 → 커밋 `feat(admin-ui): createApiClient`.

### Task 8: `createAppStore`

**Files:**

- Create: `packages/admin-ui/src/store/app-store.ts`
- Test: `packages/admin-ui/src/store/app-store.test.ts`
- Modify: `package.json`(pinia optional peer + dev), `vite.config.ts`(external)

- [ ] 참조 읽기: `../hangang-home/apps/admin/src/stores/app.ts`(+`app.test.ts`)·`session-error.ts`, `../ssworks-gise-home/apps/admin/src/stores/app.ts`(`permissionDenied`·`authError`), axion `stores/app.ts`(+spec, `{redirect:false}` 우회가 왜 필요했는지).
- [ ] 테스트 먼저(`setActivePinia(createPinia())`): `initialize()` 가 `fetchMe` 성공 → `authorized`·`userInfo`, 401 → 미인증(정상 경로, 삼킴), 403(`isForbidden`) → `permissionDenied` · 두 번 불러도 `fetchMe` 1회 · `login()` 뒤 `initialize` 재호출, 그래도 `!authorized` 면 `SessionNotEstablishedError` · `logout()` 은 API 호출 + `clearSession()` 만(라우팅 단언 없음) · `sanitize` 가 적용된다.
- [ ] 구현(`defineStore(id, setup)`). 라우터 import 0.
- [ ] 초록 → 커밋 `feat(admin-ui): createAppStore`.

### Task 9: `useDirtyGuard` · `useTableSelection`

**Files:**

- Create: `packages/admin-ui/src/composables/useDirtyGuard.ts`, `useTableSelection.ts`
- Test: 각 `*.test.ts`

- [ ] 참조: `../ssworks-gise-home/apps/admin/src/composables/useDirtyGuard.ts`, `../kim5257-crm-v5/packages/frontend-core/src/composables/useTableSelection.ts`.
- [ ] 테스트 먼저 → 구현(의존은 vue·vue-router 뿐). `window.confirm` 문구는 옵션.
- [ ] 초록 → 커밋.

### Task 10: export · 순환 검사 · 문서 · 스모크

**Files:**

- Modify: `packages/admin-ui/src/index.ts`, `README.md`, `.changeset/initial-phase1.md`
- Test: `packages/admin-ui/src/no-cycles.test.ts`

- [ ] `index.ts` 에 Task 1~9 export 추가(이름 충돌 없는지 `vue-tsc`).
- [ ] `no-cycles.test.ts`: `src/**/*.{ts,vue}` 를 읽어 `from '../stores`·`from '@/`·`useRouter()` 모듈 스코프 호출·`declare module 'vue-router'` 가 0건임을 정규식으로 단언(Review Focus 2 · Global Constraints).
- [ ] README 표에 새 export 를 더하고, 템플릿이 쓸 최소 배선 예시(`main.ts` · `App.vue` · `router/index.ts` · `stores/app.ts`)를 적는다.
- [ ] `.changeset/initial-phase1.md` 의 admin-ui 줄에 이 PR 의 export 를 더한다(아직 미발행이면 같은 파일).
- [ ] `/smoke` — 패킹 → 임시 소비 앱에서 모든 export 사용 → `vue-tsc`·`vite build` 통과.
- [ ] `pnpm check` 초록 → 커밋 `feat(admin-ui): 셸·내비게이션·인프라 export · 문서`.

---

## 완료 기준

- `pnpm check` 초록, admin-ui 테스트 ≥ 87 + 이 PR 신규/이관분.
- `/smoke` 통과.
- 패키지 소스에 스토어·라우터 파일 import 0, `declare module 'vue-router'` 0.
- `docs/01-phase0.md` §8 표에 PR #2 완료를 적는다.
