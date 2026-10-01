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
| `AdminShell` · `AdminShellMenuProps` · `AdminShellAppBarProps`                                                            | 앱바 + 드로어 메뉴 + `RouterView`. 슬롯 `drawer` `app-bar` `banner` `default` `overlays` + 전달 슬롯(아래)     |
| `AuthShell`                                                                                                               | 앱바·메뉴 없는 인증 전 화면 껍데기. 슬롯 `brand`                                                               |
| `AppBar` · `AppBarMenuItem`                                                                                               | 사용자 메뉴·로그아웃이 있는 앱바. 슬롯 `brand` `actions` `user-info` `user-menu`(`{ user, logout }`)           |
| `MainMenu` · `MainMenuItem`                                                                                               | 권한으로 걸러 그리는 사이드 메뉴. `groupMode: 'subheader' \| 'collapsible'`                                    |
| `IpBlockedDialog`                                                                                                         | IP 차단 안내. 🔴 `App.vue` 최상위에 둔다(로그인 화면에서도 떠야 한다)                                          |
| `MenuNode` · `filterMenu` · `buildMenu` · `flattenRoutes` · `assertParentAnyPermissionsCoverChildren`                     | 메뉴 파생 — 출처는 라우트 `meta` 하나. 선언 없음 = 공개                                                        |
| `AdminRouteMeta` · `defineAdminRoute`                                                                                     | 라우트 `meta` 타입과 항등 헬퍼                                                                                 |
| `createAdminGuard` · `AdminGuardDeps`                                                                                     | 전역 `beforeEach`. deps 주입, 기본 fail-closed                                                                 |
| `createTitleGuard` · `installChunkRecovery` · `safeRedirect`                                                              | `afterEach` 문서 제목 · 청크 404 복구(1회 새로고침) · 오픈 리다이렉트 방어                                     |
| `createApiClient` · `ApiClientOptions` · `ApiClient` · `ApiError`                                                         | axios 팩토리. 봉투 벗김 · bigint · 401 갱신(공유 Promise) · `onAuthFailure`/`onError` 콜백                     |
| `createAppStore` · `SessionNotEstablishedError` · `AppStoreOptions` · `AppStoreState` · `AppStoreActions`                 | 세션 pinia 스토어 팩토리(`initialize` · `login` · `logout` · `clearSession`)                                   |
| `useDirtyGuard` · `DirtyGuardOptions` · `useTableSelection`                                                               | 이탈 확인 · 대량 표 선택(Set + 반전 선택)                                                                      |

#### `AdminShell` 슬롯

| 슬롯                                                                            | 받는 props                         | 하는 일                                                                               |
| ------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| `drawer`                                                                        | `{ show, rail, setShow }`          | 기본 `MainMenu` 를 통째로 바꾼다                                                      |
| `app-bar`                                                                       | `{ toggleNav }`                    | 기본 `AppBar` 를 통째로 바꾼다. `toggleNav` = nav 아이콘(모바일 열림 · 데스크톱 레일) |
| `menu-prepend` · `menu-append`                                                  | `{ rail }`                         | 기본 `MainMenu` 의 `prepend` · `append` 로 간다(브랜드 로고 자리)                     |
| `app-bar-brand` · `app-bar-actions` · `app-bar-user-info` · `app-bar-user-menu` | `AppBar` 의 해당 슬롯 props 그대로 | 기본 `AppBar` 의 `brand` · `actions` · `user-info` · `user-menu` 로 간다              |
| `banner` · `default` · `overlays`                                               | —                                  | `VMain` 안 본문 앞 · 본문(기본 `RouterView`) · `VMain` 뒤                             |

기본 메뉴·앱바를 살린 채 일부만 바꿀 때는 전달 슬롯을 쓴다 — `#app-bar` 로 통째로 바꾸면 nav 토글을 직접 이어야 한다.

```vue
<AdminShell :menu-props="{ items }">
  <template #app-bar-actions><NotificationBell /></template>
  <template #menu-prepend="{ rail }"><BrandLogo :compact="rail" /></template>
</AdminShell>
```

스토어·라우터·API 사이에 import 순환이 없다 — 가드는 deps, API 클라이언트는 콜백, 컴포넌트는 inject 로 받는다(`src/no-cycles.test.ts` 가 막는다).

### 최소 배선

import 방향은 `main.ts → router → stores → api → (plugins/toast · state/ip-block)` 한 줄이다. 🔴 `api/client.ts` 는 라우터도 스토어도 import 하지 않는다 — 하면 `api → router → store → api` 순환이 된다. 라우터·스토어가 필요한 콜백(`onAuthFailure`)은 `main.ts` 에서 `client.onAuthFailure()` 로 단다. 아래 배선은 `src/wiring.integration.test.ts` 가 패키지 실물로 돌린다.

```ts
// plugins/toast.ts
import { createToast } from '@ssworks/admin-ui'

export const toast = createToast()
```

```ts
// state/ip-block.ts — IpBlockedDialog 가 읽는 플래그. 앱 모듈을 import 하지 않는다(순환 0).
import { reactive } from 'vue'

export const ipBlock = reactive({ blocked: false, ip: '' })

export function resetIpBlock(): void {
  ipBlock.blocked = false
  ipBlock.ip = ''
}
```

```ts
// api/client.ts — 🔴 라우터·스토어를 import 하지 않는다
import { createApiClient } from '@ssworks/admin-ui'
import { toast } from '../plugins/toast'
import { ipBlock } from '../state/ip-block'

export const client = createApiClient({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  refreshPath: '/auth/refresh',
  noRetryPaths: ['/auth/login'],
  onError: (error) => {
    // IP 차단은 토스트가 아니라 App.vue 의 IpBlockedDialog 가 알린다. 코드는 프로젝트의 에러 카탈로그 것.
    if (error.code === 'ERR_IP_NOT_ALLOWED') {
      ipBlock.blocked = true
      ipBlock.ip = (error.details as { clientIp?: string } | undefined)?.clientIp ?? ''
      return
    }
    // 🔴 401 은 토스트하지 않는다. 갱신까지 실패한 401 은 "로그인 필요" 라는 정상 경로다 — 안 거르면
    //    로그인 화면에 처음 올 때마다(`/auth/me` 401) 오류 토스트가 뜨고, 비밀번호를 틀리면 로그인
    //    화면 문구와 토스트로 두 번 알린다. 401 뒤의 이동은 main.ts 의 onAuthFailure 와 가드 몫이다.
    if (error.status === 401) return
    toast.error(error.message)
  },
})

export const { api } = client
```

```ts
// stores/app.ts
import { ApiError, createAppStore, type AdminUserInfo } from '@ssworks/admin-ui'
import { api } from '../api/client'
import { resetIpBlock } from '../state/ip-block'

export const useAppStore = createAppStore<AdminUserInfo>('app', {
  fetchMe: () => api.get<AdminUserInfo>('/auth/me'),
  // 🔴 IP 차단 플래그는 로그인·로그아웃 때 비운다(hangang 스토어가 그랬다). 안 비우면 대화상자의
  //    "로그아웃" 을 눌러 로그인 화면으로 가도 대화상자가 그대로 떠 있다. 여전히 차단이면 다음
  //    요청의 onError 가 다시 세운다.
  login: async (credentials) => {
    resetIpBlock()
    await api.post('/auth/login', credentials)
  },
  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      resetIpBlock()
    }
  },
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
  // 가드가 권한 없음으로 보내는 곳(기본 `paths.forbidden`). 인증은 됐고 권한만 없는 상태로 오는 화면이다.
  defineAdminRoute<Permission>({
    path: '/403',
    component: () => import('../pages/ForbiddenPage.vue'),
    meta: { title: '접근 권한 없음', layout: 'auth', selfOnly: true },
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
import { START_LOCATION } from 'vue-router'
import { createAdminUi } from '@ssworks/admin-ui'
import '@ssworks/admin-ui/style.css'
import App from './App.vue'
import { client } from './api/client'
import { toast } from './plugins/toast'
import { vuetify } from './plugins/vuetify'
import { router } from './router'
import { ipBlock } from './state/ip-block'
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
    // 🔴 거부하면 안 된다 — 거부하면 로그아웃 뒤 이동이 건너뛰어진다. createAppStore().logout 은
    //    서버 호출이 실패해도 세션을 비우고 resolve 한다.
    logout: () => useAppStore().logout(),
    ipBlocked: () => ipBlock,
  }),
)

// 갱신까지 실패 = 로그아웃 상태. api/client.ts 가 라우터·스토어를 모르도록 여기서 잇는다(gise main.ts).
client.onAuthFailure(() => {
  useAppStore().clearSession()
  const current = router.currentRoute.value
  // 🔴 첫 내비게이션 중(START_LOCATION)에는 이동하지 않는다 — 미인증 첫 진입은 정상 경로라 가드가
  //    /login 으로 보낸다. 여기서 또 보내면 진행 중인 내비게이션을 기다리는 체인과 엉켜
  //    `/login?redirect=/` 가 생기거나 isReady() 가 안 풀려 화면이 백지가 된다(hangang api/client.ts).
  //    이미 로그인 화면이면 그대로 둔다.
  if (current === START_LOCATION || current.path === '/login') return
  void router.replace({ path: '/login', query: { redirect: current.fullPath } })
})

app.mount('#app')
```

```vue
<!-- App.vue — 🔴 IpBlockedDialog 는 여기(AdminShell #overlays 가 아니다). default 레이아웃 안에만 두면
     로그인 화면에서 안 뜬다 -->
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

#### 파일 기반 라우팅이면 `depth: 'all'`

`vue-router/auto-routes` + `setupLayouts()`(vite-plugin-vue-layouts-next)는 최상위 레코드를 레이아웃 래퍼(`{ path: '/users', component: Layout, children: [{ path: '', meta, component: Page }] }`)로 낸다. 기본 `depth: 1` 은 그 래퍼만 보므로 메뉴가 비어 있다 — **`depth: 'all'`** 을 켠다. 메뉴의 `id`·`to` 는 레코드의 `path` 가 아니라 부모에 이은 전체 경로(`''` → 부모 경로, `invite` → `/users/invite`)다.

```ts
import { routes } from 'vue-router/auto-routes'

const items = buildMenu<Permission>(routes, { groups, depth: 'all' }) // setupLayouts(routes) 를 넘겨도 같다
```

`assertParentAnyPermissionsCoverChildren` 은 부모 레코드가 곧 메뉴 부모인 손 라우트 표용이다. `setupLayouts` 래퍼·폴더 노드는 `meta` 가 없어서 자식이 권한을 선언하면 던진다.
