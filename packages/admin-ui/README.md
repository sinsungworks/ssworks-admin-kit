# @ssworks/admin-ui

관리자 페이지 공통 **Vue 3 + Vuetify 4** 컴포넌트와 composable.

```bash
pnpm add @ssworks/admin-ui @ssworks/admin-shared vue vuetify vue-router pinia axios
```

```ts
import '@ssworks/admin-ui/style.css' // 소비 프로젝트가 한 번 import
```

## 레이아웃 프리미티브

| 컴포넌트       | 설명                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `CardLayout`   | 옅은 테두리의 outlined 카드. `fillHeight`                                                                       |
| `PanelLayout`  | top / content / bottom 세로 3분할. `scrollable` 이면 content 만 스크롤. **부모가 definite height 를 줘야 한다** |
| `ColumnLayout` | 가로 flex. `gap`, `divider`                                                                                     |
| `ColumnPane`   | `ColumnLayout` 의 열. 자신이 VCard. `width`(없으면 `flex: 1`), `scrollable`                                     |

## 다이얼로그 · 필드

| 컴포넌트        | 설명                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `BaseDialog`    | 범용 껍데기. `type: 'ok' \| 'yesno' \| 'none'`, `persistent` 기본 true, 슬롯 `title/default/actions`  |
| `ConfirmDialog` | 확인. **`reversible` 필수** — 되돌릴 수 있는지를 문구에 적는다. `blockedReason` 이면 확정 버튼이 없다 |
| `ReauthDialog`  | 민감 쓰기 전 본인 비밀번호 재확인. `@confirm(password)`, 입력 `name="currentPassword"`                |
| `EmptyState`    | 「아직 없음」 vs 「검색 0건」을 가른다. `filtered`, `canCreate`                                       |
| `PasswordField` | 눈 토글 비밀번호 입력                                                                                 |

## 서버 페이지네이션 표

`DataTablePanel`(카드+제목+필터+정렬 라벨+표) · `DataTableBody`(표만). `v-model:page` · `v-model:itemsPerPage` · `v-model:sortBy` 를 부모가 갖고 `items`(이 페이지분)와 `itemsLength`(서버 총수)를 갈라 넘긴다. 쪽당 개수 선택지에 `-1` 이 없다.

## 토스트

```ts
app.use(createToast()) // main.ts
const toast = useToast() // 컴포넌트·pinia setup 스토어
toast.error('실패했습니다')
```

`App.vue` 에 `<AdminToast />` 한 번. 플러그인 객체 자체도 API 다(`const toast = createToast(); toast.error(...)`) — API 클라이언트의 onError 처럼 컴포넌트 밖에서 쓸 때.

## Vuetify 프리셋

`createAdminVuetify({ theme, defaults })` — ko 로케일, `density: compact`, `hideDetails: 'auto'`, 필드 10종 outlined, `VBtn` flat primary. 테마 색은 프로젝트가 넘긴다. `vuetify/styles` 와 `@mdi/font` CSS 는 프로젝트의 `plugins/vuetify.ts` 가 import 한다.

## 권한 훅

```ts
export const usePermission = createUsePermission<Permission>(
  () => useAppStore().userInfo?.permissions ?? [],
)
```

반환값(`PermissionCheck`)을 메뉴 필터와 라우트 가드에 그대로 넘긴다 — 판정 규칙이 한 곳이다.

## Peer 의존

| 패키지       | 필수 | 용도                                   |
| ------------ | ---- | -------------------------------------- |
| `vue`        | 예   |                                        |
| `vuetify`    | 예   |                                        |
| `vue-router` | 예   | 셸·가드·메뉴가 라우트 `meta` 를 읽는다 |
| `pinia`      | 예   | `createAppStore`                       |
| `axios`      | 예   | `createApiClient`                      |

🔴 `pinia`·`axios` 도 **필수**다. 엔트리가 하나(`dist/index.js`)라 두 패키지를 최상단에서 import 한다 — `safeRedirect` 하나만 써도 번들러가 `axios` 를 해석하지 못하면 빌드가 깨진다. 서브패스 export 로 가르지 않는 대가다.

패키지는 `RouteMeta` 를 **증강하지 않는다**(`declare module 'vue-router'` 없음). `AdminRouteMeta<Permission>` 타입과 `defineAdminRoute()` 만 준다. `RouteMeta` 증강은 프로젝트의 `env.d.ts` 몫이다.

## 셸 · 내비게이션 · 인프라

| export                                                                                                                    | 설명                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `createAdminUi` · `useAdminUi` · `ADMIN_UI_KEY` · `AdminUserInfo` · `AdminUiOptions` · `AdminUiContext` · `AdminUiPlugin` | 셸이 호스트 앱에서 읽는 것(사용자·로그아웃·사이트명·IP 차단·표 설정)의 전부. `app.use()` 가 provide. 게터 주입 |
| `AdminShell` · `AdminShellMenuProps` · `AdminShellAppBarProps`                                                            | 앱바 + 드로어 메뉴 + `RouterView`. 슬롯 `drawer` `app-bar` `banner` `default` `overlays`                       |
| `AuthShell`                                                                                                               | 앱바·메뉴 없는 인증 전 화면 껍데기. 슬롯 `brand`                                                               |
| `AppBar` · `AppBarMenuItem`                                                                                               | 사용자 메뉴·로그아웃이 있는 앱바                                                                               |
| `MainMenu` · `MainMenuItem`                                                                                               | 권한으로 걸러 그리는 사이드 메뉴. `groupMode: 'subheader' \| 'collapsible'`                                    |
| `IpBlockedDialog`                                                                                                         | IP 차단 안내. 🔴 `App.vue` 최상위에 둔다(로그인 화면에서도 떠야 한다)                                          |
| `MenuNode` · `filterMenu` · `buildMenu` · `flattenRoutes` · `assertParentAnyPermissionsCoverChildren`                     | 메뉴 파생 — 출처는 라우트 `meta` 하나. 선언 없음 = 공개                                                        |
| `AdminRouteMeta` · `defineAdminRoute`                                                                                     | 라우트 `meta` 타입과 항등 헬퍼                                                                                 |
| `createAdminGuard` · `AdminGuardDeps`                                                                                     | 전역 `beforeEach`. deps 주입, 기본 fail-closed                                                                 |
| `createTitleGuard` · `installChunkRecovery` · `safeRedirect`                                                              | `afterEach` 문서 제목 · 청크 404 복구(1회 새로고침) · 오픈 리다이렉트 방어                                     |
| `createApiClient` · `ApiClientOptions` · `ApiClient` · `ApiError`                                                         | axios 팩토리. 봉투 벗김 · bigint · 401 갱신(공유 Promise) · `onAuthFailure`/`onError` 콜백                     |
| `createAppStore` · `SessionNotEstablishedError` · `AppStoreOptions` · `AppStoreState` · `AppStoreActions`                 | 세션 pinia 스토어 팩토리(`initialize` · `login` · `logout` · `clearSession`)                                   |
| `useDirtyGuard` · `DirtyGuardOptions` · `useTableSelection`                                                               | 이탈 확인 · 대량 표 선택(Set + 반전 선택)                                                                      |

스토어·라우터·API 사이에 import 순환이 없다 — 가드는 deps, API 클라이언트는 콜백, 컴포넌트는 inject 로 받는다(`src/no-cycles.test.ts` 가 막는다).

### 최소 배선

```ts
// api/client.ts — 스토어·라우터는 콜백 안에서만 닿는다
import { createApiClient } from '@ssworks/admin-ui'
import { router } from '../router'
import { toast } from '../plugins/toast'
import { useAppStore } from '../stores/app'

export const { api } = createApiClient({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  refreshPath: '/auth/refresh',
  noRetryPaths: ['/auth/login'],
  onAuthFailure: () => {
    useAppStore().clearSession()
    void router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
  },
  onError: (error) => toast.error(error.message),
})
```

```ts
// plugins/toast.ts
import { createToast } from '@ssworks/admin-ui'

export const toast = createToast()
```

```ts
// stores/app.ts
import { ApiError, createAppStore, type AdminUserInfo } from '@ssworks/admin-ui'
import { api } from '../api/client'

export const useAppStore = createAppStore<AdminUserInfo>('app', {
  fetchMe: () => api.get<AdminUserInfo>('/auth/me'),
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  isForbidden: (error) => error instanceof ApiError && error.status === 403,
})
```

```ts
// composables/usePermission.ts
import { createUsePermission } from '@ssworks/admin-ui'
import { useAppStore } from '../stores/app'
import type { Permission } from '../permissions'

export const usePermission = createUsePermission<Permission>(
  () => useAppStore().userInfo?.permissions ?? [],
)
```

```ts
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import {
  createAdminGuard,
  createTitleGuard,
  defineAdminRoute,
  installChunkRecovery,
} from '@ssworks/admin-ui'
import { usePermission } from '../composables/usePermission'
import { useAppStore } from '../stores/app'
import type { Permission } from '../permissions'

export const routes = [
  defineAdminRoute<Permission>({
    path: '/users',
    component: () => import('../pages/UsersPage.vue'),
    meta: { title: '사용자', permissions: ['org.users:read'], menu: { icon: 'mdi-account' } },
  }),
  defineAdminRoute<Permission>({
    path: '/login',
    component: () => import('../pages/LoginPage.vue'),
    meta: { title: '로그인', layout: 'auth', isPublic: true, needNonAuth: true },
  }),
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(
  createAdminGuard<Permission>({
    ensureInitialized: () => useAppStore().initialize(),
    isAuthorized: () => useAppStore().authorized,
    isPermissionDenied: () => useAppStore().permissionDenied,
    check: usePermission(),
  }),
)
router.afterEach(createTitleGuard('My Admin'))
installChunkRecovery(router)
```

```ts
// main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createAdminUi } from '@ssworks/admin-ui'
import '@ssworks/admin-ui/style.css'
import App from './App.vue'
import { toast } from './plugins/toast'
import { vuetify } from './plugins/vuetify'
import { router } from './router'
import { useAppStore } from './stores/app'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(toast)
app.use(
  createAdminUi({
    siteName: 'My Admin',
    user: () => useAppStore().userInfo, // 호출 시점마다 평가된다 — 값을 캐시하지 않는다
    logout: () => useAppStore().logout(),
  }),
)
app.mount('#app')
```

```vue
<!-- App.vue — 🔴 IpBlockedDialog 는 여기. default 레이아웃에만 두면 로그인 화면에서 안 뜬다 -->
<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import { VApp } from 'vuetify/components'
  import { AdminToast, IpBlockedDialog } from '@ssworks/admin-ui'
  import AuthLayout from './layouts/auth.vue'
  import DefaultLayout from './layouts/default.vue'

  const route = useRoute()
  const layout = computed(() => (route.meta.layout === 'auth' ? AuthLayout : DefaultLayout))
</script>

<template>
  <VApp>
    <component :is="layout" />
    <AdminToast />
    <IpBlockedDialog />
  </VApp>
</template>
```

```vue
<!-- layouts/default.vue -->
<script setup lang="ts">
  import { AdminShell, buildMenu } from '@ssworks/admin-ui'
  import { routes } from '../router'
  import type { Permission } from '../permissions'

  const items = buildMenu<Permission>(routes, { groups: [{ key: 'org', title: '조직' }] })
</script>

<template>
  <AdminShell :menu-props="{ items }" :app-bar-props="{ showTeamRole: true }" />
</template>
```

`layouts/auth.vue` 는 `<AuthShell />` 하나다.
