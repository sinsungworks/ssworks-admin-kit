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

| export                                                                                                                                                                                          | 설명                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `createAdminUi` · `useAdminUi` · `ADMIN_UI_KEY` · `AdminUserInfo` · `AdminUiOptions` · `AdminUiContext` · `AdminUiPlugin`                                                                       | 셸이 호스트 앱에서 읽는 것(사용자·로그아웃·사이트명·IP 차단·표 설정)의 전부. `app.use()` 가 provide. 게터 주입   |
| `AdminShell` · `AdminShellMenuProps` · `AdminShellAppBarProps`                                                                                                                                  | 앱바 + 드로어 메뉴 + `RouterView`. 슬롯 `drawer` `app-bar` `banner` `default` `overlays` + 전달 슬롯(아래)       |
| `AuthShell`                                                                                                                                                                                     | 앱바·메뉴 없는 인증 전 화면 껍데기. 슬롯 `brand`                                                                 |
| `AppBar` · `AppBarMenuItem`                                                                                                                                                                     | 사용자 메뉴·로그아웃이 있는 앱바. 슬롯 `brand` `actions` `user-info` `user-menu`(`{ user, logout }`)             |
| `MainMenu` · `MainMenuItem`                                                                                                                                                                     | 권한으로 걸러 그리는 사이드 메뉴. `groupMode: 'subheader' \| 'collapsible'`                                      |
| `IpBlockedDialog`                                                                                                                                                                               | IP 차단 안내. 🔴 `App.vue` 최상위에 둔다(로그인 화면에서도 떠야 한다)                                            |
| `MenuNode` · `filterMenu` · `buildMenu` · `flattenRoutes` · `assertParentAnyPermissionsCoverChildren`                                                                                           | 메뉴 파생 — 출처는 라우트 `meta` 하나. 선언 없음 = 공개                                                          |
| `AdminRouteMeta` · `defineAdminRoute`                                                                                                                                                           | 라우트 `meta` 타입과 항등 헬퍼                                                                                   |
| `createAdminGuard` · `AdminGuardDeps`                                                                                                                                                           | 전역 `beforeEach`. deps 주입, 기본 fail-closed                                                                   |
| `createTitleGuard` · `installChunkRecovery` · `safeRedirect`                                                                                                                                    | `afterEach` 문서 제목 · 청크 404 복구(1회 새로고침) · 오픈 리다이렉트 방어                                       |
| `createApiClient` · `ApiClientOptions` · `ApiClient` · `ApiError`                                                                                                                               | axios 팩토리. 봉투 벗김 · bigint · 401 갱신(공유 Promise) · `onAuthFailure`/`onError` 콜백                       |
| `createAppStore` · `SessionNotEstablishedError` · `AppStoreOptions` · `AppStoreState` · `AppStoreActions`                                                                                       | 세션 pinia 스토어 팩토리(`initialize` · `login` · `logout` · `clearSession` · `refresh`)                         |
| `useDirtyGuard` · `DirtyGuardOptions` · `useTableSelection`                                                                                                                                     | 이탈 확인 · 대량 표 선택(Set + 반전 선택)                                                                        |
| `useServerTable` · `ServerTable` · `ServerTableOptions` · `ServerTableParams`                                                                                                                   | 서버 페이징 목록 — 조회 1번 · 늦은 응답 무시 · 필터/쪽 크기 변경 시 1쪽 · 정렬 보정 · bigint `total` · `urlSync` |
| `useQuerySyncedFilter` · `QuerySyncOptions` · `queryCodec` · `withDefault` · `bindQueryCodecs` · `QueryCodec` · `DefaultedQueryCodec` · `QueryCodecSpec` · `QuerySyncBinding` · `RawQueryValue` | 목록 상태 ↔ URL 쿼리. 타이밍 핵심(`read`·`toQuery`) + 선택형 코덱(기본 6종 · 커스텀)                             |
| `useWriteFlow` · `WriteFlow` · `WriteRunOptions` · `ConfirmDialogBindings` · `ReauthDialogBindings`                                                                                             | 쓰기 관문(확인 · 재인증) · busy · 오류 분류. 다이얼로그는 `v-bind="confirmDialog"`                               |
| `toFieldErrors`                                                                                                                                                                                 | `ERR_COMMON_VALIDATION` 의 `details.issues` → 필드 키별 메시지(`'members.0.name'`)                               |
| `PermissionMatrix` · `assertMatrixCoversPermissions` · `PermissionMatrixCategory` · `PermissionMatrixColumn` · `PermissionMatrixRow`                                                            | 자원 행 × 액션 열 권한 격자(`v-model` = 권한 키 배열) · 카탈로그 누락 검사. 아래 "역할 · 설정"                   |
| `useRoleEditor` · `RoleEditor` · `RoleEditorApi` · `RoleEditorOptions` · `RoleEditorAction` · `RoleDialogText` · `RoleForm` · `RoleWriteContext` · `PermissionMatrixBindings`                   | 역할 편집 headless 상태 · 규칙(목록 · 선택 · 폼 · 함의 · 권한 상승 방지 · revision 충돌 · 관문)                  |
| `SettingsShell`                                                                                                                                                                                 | 설정 2단 셸 — 라우트 직속 자식 `meta` 에서 파생한 좌측 메뉴 + `RouterView`. 부모로 들어오면 허용된 첫 자식으로   |

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
  // 🔴 onError 는 한 매크로태스크 뒤에 불리고, 호출처가 화면에 직접 보인 오류(`error.handled`)는
  //    오지 않는다 — useWriteFlow 의 재인증 실패 · 필드 오류 · 충돌 안내가 토스트로 또 뜨지 않는다.
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

`assertParentAnyPermissionsCoverChildren` 은 `meta.anyPermissions` 를 **선언한** 레코드만 검사한다(그 값을 상속하는 후손의 `permissions` 를 덮어야 한다). 선언 없는 `setupLayouts` 래퍼·폴더 노드는 건너뛰므로 파일 기반 라우팅에서도 쓸 수 있다.

## 목록 · 쓰기

```ts
const applied = ref({ userId: '', teamNo: undefined as bigint | undefined })
const { page, itemsPerPage, sortBy, items, total, loading, isFiltered, reload } = useServerTable({
  fetch: (params) => api.get<Paginated<UserRow>>('/users', { params }),
  sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
  filters: () => ({ userId: applied.value.userId || undefined, teamNo: applied.value.teamNo }),
  urlSync: bindQueryCodecs(applied, {
    userId: withDefault(queryCodec.string(), ''),
    teamNo: queryCodec.bigint(),
  }),
})

const { run, submitting, fieldErrors, confirmDialog, reauthDialog } = useWriteFlow()
function resign(no: bigint) {
  void run({
    gate: 'reauth',
    message: '이 계정을 퇴사 처리합니다.',
    action: ({ currentPassword }) => api.post(`/users/${no}/resign`, { currentPassword }),
    onSuccess: () => reload(),
  })
}

function saveUser() {
  void run({
    action: () => api.post('/users', form.value),
    // 폼이 그리는 키. 검증 오류의 키가 전부 여기 있을 때만 처리됨(전역 토스트 없음)
    fields: ['userId', 'userName'],
    onSuccess: () => reload(),
  })
}
```

```vue
<DataTableBody
  v-model:page="page"
  v-model:items-per-page="itemsPerPage"
  v-model:sort-by="sortBy"
  :headers="headers"
  :items="items"
  :items-length="total"
  :loading="loading"
>
  <template #no-data><EmptyState :filtered="isFiltered" title="아직 없습니다" filtered-title="조건에 맞는 항목이 없습니다" /></template>
</DataTableBody>
<VTextField v-model="form.userId" label="아이디" :error-messages="fieldErrors.userId" />
<VBtn :disabled="submitting" @click="resign(no)">퇴사 처리</VBtn>
<ConfirmDialog v-bind="confirmDialog" />
<ReauthDialog v-bind="reauthDialog" />
```

- 반환값은 ref 묶음이다 — 구조 분해해서 템플릿에 건다(템플릿은 최상위 바인딩만 언래핑한다).
- 표는 "적용된" 필터만 본다. 입력값과 적용값을 나눠 Enter · 버튼으로 적용한다.
- `urlSync` 를 쓰는 화면은 동적 세그먼트 상세 라우트(`/users/:id`)가 아니어야 한다 — 같은 컴포넌트가 재사용돼 URL 감시가 꺼진다.
- 목록이 중첩 자식 라우트(`/users` 아래 `/users/:id` 드로어) 밑에서도 마운트된 채 남는 구조라면 상태와 URL 이 어긋날 수 있다 — 그런 화면에서는 `urlSync` 를 피하거나 쓰지 않는다.
- 🔴 검증 오류는 `fields` 가 키를 **전부** 덮을 때만 처리됨으로 표시돼 전역 토스트가 뜨지 않는다. 하나라도 밖이면(루트 `''` · 중첩 경로 포함) 전역 토스트가 알린다 — `fields` 를 안 주면 늘 그렇다. `fieldErrors` 는 어느 경우든 채운다. 키는 정확히 일치해야 한다(`permissions` 는 `permissions.3` 을 덮지 않는다).
- 재인증 관문의 `currentPassword` 검증 오류는 재인증 다이얼로그 안에 보이고, 다이얼로그는 열린 채 남는다.
- 서버는 revision 충돌에 `ERR_COMMON_REVISION_CONFLICT`, 검증 실패에 `ERR_COMMON_VALIDATION` + `details.issues[{ path: (string|number)[], message }]` 를 보낸다.

## 역할 · 설정

```ts
const categories: PermissionMatrixCategory[] = [
  {
    id: 'org',
    label: '조직',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'write', label: '편집' },
    ],
    rows: [
      { resource: 'org.users', label: '직원' },
      { resource: 'org.roles', label: '역할' },
    ],
  },
]

const {
  roles,
  selected,
  select,
  startCreate,
  form,
  matrix,
  canToggleAll,
  conflicted,
  canSave,
  save,
  remove,
  move,
  canMove,
  submitting,
  fieldErrors,
  confirmDialog,
  reauthDialog,
} = useRoleEditor({
  api: rolesApi, // list · create · update · remove · move — 프로젝트 API 어댑터
  permissions: permissions.ALL_PERMISSION_VALUES,
  canWrite: () => check.hasPermission(PERMISSIONS.ORG_ROLES_WRITE),
  implies: { 'org.users:write': ['org.users:read'], 'org.roles:write': ['org.roles:read'] },
  reauth: true,
  fields: ['roleName', 'isDefault'], // 폼이 그리는 키 — 이 키의 검증 오류만 처리됨(기본 ['roleName'])
  onSelfRoleSaved: async () => {
    await appStore.refresh()
    if (!check.hasPermission(PERMISSIONS.ORG_ROLES_READ)) await router.replace('/403')
  },
})
```

```vue
<VTextField
  v-model="form.roleName"
  label="역할 이름"
  name="roleName"
  :error-messages="fieldErrors.roleName"
/>
<VSwitch v-model="form.isDefault" label="기본 역할" :error-messages="fieldErrors.isDefault" />
<VSwitch v-model="form.isAll" :disabled="!canToggleAll" label="전체 권한" />
<VAlert
  v-if="conflicted"
  type="warning"
>다른 사람이 먼저 바꿨습니다. 역할을 다시 선택하면 최신 값으로 열립니다.</VAlert>
<PermissionMatrix v-bind="matrix" :categories="categories" />
<VBtn :disabled="!canSave" :loading="submitting" @click="onSave">저장</VBtn>
<ConfirmDialog v-bind="confirmDialog" />
<ReauthDialog v-bind="reauthDialog" />
```

- 템플릿 테스트에서 `assertMatrixCoversPermissions(categories, permissions.ALL_PERMISSION_VALUES)` 를 부른다 — 권한을 카탈로그에 더하고 매트릭스에 안 넣으면 그 권한은 화면에서 줄 길이 없다.
- 🔴 전체 권한은 매트릭스 행이 아니라 `form.isAll` 스위치다. `categories` 에 `'*'` 행을 만들지 않는다.
- 어댑터 `list()` 는 전량을 `displayOrder` 오름차순으로 준다 — 쪽을 나누는 서버면 끝까지 받아 이어 붙인다.
- 수정 · 삭제 본문에는 `revision` 이 실린다. 서버는 불일치에 409 `ERR_COMMON_REVISION_CONFLICT` 를 보낸다. 이동은 `revision` 과 무관하고 재인증도 없다.
- 성공 문구는 `save()` · `remove()` · `move()` 가 `true` 를 돌려줄 때 화면이 띄운다. 처리 안 된 실패는 전역 `onError` 가 알린다.
- 저장 검증 오류 중 `fields`(기본 `['roleName']`) 에 든 키만 처리됨이다 — 폼이 `isDefault` · `permissions` 오류를 그리면 `fields` 에 더한다. 나머지는 `fieldErrors` 에 채워지고 전역 토스트도 뜬다.
- `isDirty` 를 `useDirtyGuard` 에 이으면 다른 역할로 옮길 때 경고할 수 있다.
- 관문 문구의 용어(직책 · 권한 그룹)는 `dialogText` 로 바꾼다.

#### `PermissionMatrix` props · 슬롯

| prop / 슬롯                      | 내용                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `v-model`                        | 체크된 권한 키 배열. 칸 키는 `자원:액션`(`'org.users:read'`)                       |
| `categories`                     | 카테고리마다 열(액션) × 행(자원) 표 하나                                           |
| `permissions`                    | 유효 권한 목록(카탈로그). 칸 키가 여기 없으면 그 칸은 비활성 · 미체크              |
| `disabled`                       | 기본 `false`. 칸 전부 비활성                                                       |
| `canPick`                        | `(permission) => boolean`. false 인 칸은 비활성(권한 상승 방지)                    |
| `#row-extra="{ row, category }"` | 행 끝 열 — scope 선택 상자 같은 프로젝트 몫. 슬롯을 주지 않으면 열이 생기지 않는다 |

### 설정 셸

```ts
defineAdminRoute<Permission>({
  path: '/settings',
  component: () => import('./pages/settings.vue'), // <SettingsShell />
  meta: { anyPermissions: [P.SETTING_READ, P.ORG_ROLES_READ] }, // 🔴 자식 권한의 합집합 이상
  children: [
    { path: 'site', component: SitePage, meta: { title: '사이트', permissions: [P.SETTING_READ] } },
    {
      path: 'roles',
      component: RolesPage,
      meta: { title: '역할', permissions: [P.ORG_ROLES_READ], menu: { icon: 'mdi-account-key' } },
    },
  ],
})
```

| prop / 슬롯     | 내용                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `check`         | `PermissionCheck`. 생략하면 `useAdminUi().user()?.permissions`(게터)로 판정 |
| `forbiddenPath` | 허용된 자식이 없을 때 갈 곳. 기본 `'/403'`(가드 기본값과 같음)              |
| `menuWidth`     | 메뉴 pane 너비. 기본 `'240px'`                                              |
| default 슬롯    | 기본 내용 `<RouterView />`. 전환 효과 등으로 감쌀 자리                      |

- 메뉴는 직속 자식의 `meta` 에서 만든다(인덱스 `path: ''` · `:id` 자식 제외, 제목은 `meta.menu.title` → `meta.title`, 순서는 `meta.menu.order` → 선언 순서). 부모로 들어오면 권한이 있는 첫 자식으로 보내고, 없으면 `forbiddenPath`(기본 `/403`).
- 🔴 부모의 `anyPermissions` 가 자식 권한을 덮지 않으면 가드가 셸을 열기 전에 막는다 — 라우트 테스트에서 `assertParentAnyPermissionsCoverChildren(routes)` 를 부른다.
- 설정 자식은 사이드바에 올리지 않는다(`buildMenu` 의 `depth: 1` 기본값).
- 자식 페이지는 자기 루트에서 `ColumnPane` 을 낸다 — 셸의 메뉴 pane 옆에 나란히 붙는다.
