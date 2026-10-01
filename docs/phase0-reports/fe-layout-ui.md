# Phase 0 대조 보고 — 레이아웃 · UI/공용 컴포넌트

대상 루트(프론트 src):

| 약칭 | 경로 | 비고 |
|---|---|---|
| **crm** | `kim5257-crm-v5/apps/base/frontend/src` (앱) + `kim5257-crm-v5/packages/frontend-core/src` (공유 lib) | 상류(原). hangang·axion이 여기서 포팅 |
| **axion** | `ssworks-axion-admin/packages/frontend/src` | crm 사본 + 브랜드 락업 + 다크 단일 테마 |
| **gise** | `ssworks-gise-home/apps/admin/src` | 독자 구현(레이아웃 인라인, 컴포넌트 평면 폴더) |
| **hangang** | `hangang-home/apps/admin/src` | crm 사본을 명시 import·순수 CSS·테스트 동반으로 정리 |
| **tmpl** | `kim5257-project-template/packages/frontend/src` | 뼈대만(참고) |

모든 판단은 아래 파일을 실제로 읽은 결과다. 줄 수는 `wc -l`.

---

## 1. 역할별 대조표

등급: **동일**(포맷 외 차이 없음) · **거의동일**(수 줄 차이) · **유사**(구조 같고 기능 가감) · **상이**(독자 구현) · **없음**

### 1-1. 앱 부트스트랩 (App.vue / main.ts / plugins)

| 역할 | crm | axion | gise | hangang | tmpl | 등급 |
|---|---|---|---|---|---|---|
| App.vue | 11줄 `<VApp><RouterView/></VApp>` + `useDynamicBranding()` (`@crm/frontend-core/composables/useDynamicBranding.ts` — **파일 발췌본에 없음**) | 22줄 동일 골격 + 전역 CSS(다크 보더 색 `--v-border-color: 45,58,80`, outlined 카드 배경 surface) | 6줄 골격 + `<AppToast/>` | 37줄 `route.meta.layout==='auth'`로 레이아웃을 **직접 선택**(`<component :is>`), `<IpBlockedDialog/>`를 최상위에 | 9줄 골격 | 유사 |
| main.ts | 35줄 `registerPlugins` + `unfonts.css` + pretendard CSS | 24줄 `registerPlugins` + pretendard + `@/styles/typography.css` | 21줄 `registerPlugins` + `onAuthFailure()`로 `/login` 리다이렉트 | 68줄 `registerPlugins` 없이 pinia→vuetify→router 순 직접 등록, `router.isReady().then(mount)` | 23줄 `registerPlugins` + `unfonts.css` | 유사 |
| plugins/index.ts | 24줄 vuetify→heTree→echarts→router→pinia | 19줄 vuetify→pinia→router | 8줄 vuetify→pinia→router | **없음**(main.ts 인라인) | 19줄 vuetify→pinia→router | 거의동일 |
| plugins/vuetify.ts | 46줄 `ko` 로케일, `defaultTheme:'system'`, **색 정의 0개**, defaults(global compact/hideDetails:true, VField/VTextField/VSelect outlined, VBtn primary/flat) | 72줄 `defaultTheme:'dark'` 단일 다크 팔레트 14색, defaults에 VTextarea/VAutocomplete 추가 | 55줄 `system` + light/dark 브랜드 팔레트(wine/ivory), `global.autocomplete:'off'`, VTextarea/VAutocomplete 추가 | 156줄 `system` + Vuetify 기본 팔레트 명시, **`hideDetails:'auto'`**, outlined 대상 10종(VCombobox/VFileInput/VNumberInput/VDateInput/VColorInput 추가) | 19줄 `system`만 | 유사 |

핵심 차이 요약
- 등록 순서: crm/axion/gise/tmpl은 router를 pinia보다 먼저(crm) 또는 뒤(axion/gise/tmpl)에 등록. hangang은 "router 첫 항해의 `beforeEach`가 `useAppStore()`를 부르므로 pinia가 먼저"라고 주석으로 근거를 남김(`hangang-home/apps/admin/src/main.ts:11-14`). 패키지 `createAdminApp()` 헬퍼를 만들면 이 순서를 고정할 수 있다.
- `hideDetails`: crm/axion/gise는 `true`(검증 문구가 안 보임), hangang은 `'auto'`(`plugins/vuetify.ts:82-90`에 근거). 패키지 기본값은 `'auto'`가 맞다.
- 테마 색: 4개 프로젝트가 전부 다르다(0개 / 다크 14색 / 브랜드 light+dark / Vuetify 기본). → 테마는 반드시 주입 옵션.

### 1-2. 레이아웃 (layouts/default.vue, layouts/auth.vue)

| 역할 | crm | axion | gise | hangang | tmpl | 등급 |
|---|---|---|---|---|---|---|
| default 레이아웃 | 48줄. `useLocalStorage('rail_menu')`(@vueuse), `useDisplay().mdAndDown`로 rail/overlay 판정, `<VMain><MainMenu v-model:show :rail/><AppBar @click:nav/><RouterView/><IpBlockedDialog/><ScheduleReminderListener/></VMain>`. 죽은 코드 `watch(display.smAndDown, ()=>{})` 존재 | 44줄. 같은 로직, `localStorage` 직접 사용(키 `rail_menu`), MainMenu/AppBar를 **VMain 밖**에 두고 `<VMain><SuspensionBanner/><RouterView/></VMain>` | 88줄. **MainMenu·AppBar를 인라인**으로 그림. `VNavigationDrawer` + `VListGroup`(접이식 그룹) + `isPending` 항목은 disabled+'준비 중' 칩. `drawer = ref(!display.mobile)`. AppBar에 loginId·비밀번호 변경·로그아웃 버튼 | 56줄. crm에서 ScheduleReminderListener·IpBlockedDialog·죽은 watch 제거, `ref+watch`로 localStorage 저장(키 `hg_admin_rail_menu`) | 14줄 VAppBar 제목만 | crm≈axion≈hangang **거의동일**, gise **상이** |
| auth 레이아웃 | 20줄 `<VMain><VAppBar flat/><VContainer class="h-100 d-flex justify-center align-center"><RouterView/></VContainer></VMain>` | 11줄 `<VApp><VMain class="d-flex align-center justify-center"><RouterView/></VMain></VApp>` (**VApp 중첩** — App.vue에도 VApp) | 7줄 `<VMain><VContainer style="min-height:100vh" …>` | 14줄 crm과 동일(빈 VAppBar 포함) | 없음 | 거의동일 |
| public 레이아웃 | 없음 | 11줄 `<VApp><VMain><RouterView/></VMain></VApp>` | 없음 | 없음 | 없음 | axion 전용 |

레이아웃 선택 메커니즘: crm/axion/gise는 `vite-plugin-vue-layouts-next`(`virtual:generated-layouts` + `vue-router/auto-routes`), hangang은 `App.vue`에서 `route.meta.layout` 판정. 패키지는 레이아웃 **컴포넌트**만 제공하고 선택 메커니즘은 프로젝트에 맡겨야 한다.

### 1-3. 레이아웃 컴포넌트 (components/layout/*)

| 역할 | crm | axion | gise | hangang | 등급 |
|---|---|---|---|---|---|
| AppBar | 123줄. emit `click:nav`. 제목=`route.meta.title`. 우측: `AttendanceCheckMenu` + `NotificationBell` + 아바타 메뉴(사용 매뉴얼 `/doc/`, APK 다운로드(`mobileAppApi`·`systemSettings.deviceCallEnabled`), 내 정보 `/mypage`, 로그아웃 `appStore.logout()`). auto-import 의존(`useRouter`, `computed`, `storeToRefs` 미import) | 82줄. crm에서 출결·알림·APK·매뉴얼 제거. 명시 import. 내 정보 `/mypage`, 로그아웃 `appStore.logout()`(스토어가 라우팅) | 인라인(`layouts/default.vue:66-73`). `<VAppBarTitle>기세녀 관리자</VAppBarTitle>` 고정, loginId 텍스트, 비밀번호 변경·로그아웃 텍스트 버튼(`data-test="app-bar-password"`) | 110줄. 제목 `{{ SITE_NAME }} · {{ title }}`(`constants.ts`), 아바타 메뉴에 **팀/역할 항목**(`userInfo.teamName/roleName`) 추가, 내 계정 `/account`, 로그아웃 후 **컴포넌트가** `router.replace('/login')` | crm→axion→hangang **유사**(공통 골격 동일), gise **상이** |
| MainMenu | 58줄. `defineModel('show')`, prop `rail`. `mainMenu`(`@/data/main_menu.ts`) + `usePermission()`으로 `permission`/`anyPermissions` 필터, 빈 그룹 제거. `is-last` prop = "마지막 아닌 최상위 leaf" | 83줄. crm + `partnerOnly` 필터 + `#prepend` 슬롯에 **BrandLockup/BrandSymbol**(rail이면 심볼만, 48px 헤더) | 인라인(`layouts/default.vue:37-64`). `filterMainMenu(MAIN_MENU, permissions)`, `VListGroup` 접이식, `isPending` | 52줄. 메뉴를 **라우트 표에서 파생**(`router/menu.ts`의 `MENU`, `filterMenu(MENU, check)`), prop 이름 `divider`로 통일 | 유사 |
| MainMenuItem | 52줄. 재귀. `menuItem.to != null`이면 leaf(VListItem+조건부 VDivider) else 그룹(VListSubheader(rail 아닐 때)+재귀). `is-last` prop이 부모마다 뜻이 다름 | 52줄. crm과 **동일**(포맷만) | 없음 | 60줄. `isGroup()` 타입가드, `divider` prop, 그룹 안 그룹 불가(2단 고정), 재귀 시 `rail` 전달(crm은 미전달 — 버그) | crm=axion 동일, hangang 개선 |
| BrandLockup / BrandSymbol / brand-geometry.ts | 없음 | 94/62/89줄. ATLAS 로고 인라인 SVG. CSS 변수 `--brand-accent`/`--brand-fg`로 색 덮기 가능 | 없음 | 없음 | axion 전용(X) |
| SuspensionBanner | 없음 | 47줄. `appStore.suspension` + `window 'account-suspended'` 이벤트 → VAlert + VSnackbar | 없음 | 없음 | axion 전용(X) |
| NotificationBell / ScheduleReminderListener | 317/323줄 (crm 앱) | 없음 | 없음 | 없음 | crm 전용(X, 본 보고 범위 밖) |

### 1-4. UI 레이아웃 프리미티브 (components/ui/*)

| 역할 | crm (frontend-core) | axion | hangang | gise | 등급 |
|---|---|---|---|---|---|
| CardLayout | 30줄. prop `fillHeight`. `VCard variant="outlined"` + 보더 색/두께 통일 CSS | 30줄. **동일**(들여쓰기·`props.` 접두만) | 43줄. 동일 + **`VCard` 명시 import**(`vuetify/components`), SCSS→CSS | 없음 | 동일 |
| PanelLayout | 65줄. prop `scrollable`. 슬롯 `top`/default/`bottom`. scrollable이면 content `min-height:0` + inner `position:absolute; overflow-y:auto; display:flex; flex-direction:column` | 63줄. **inner의 `display:flex; flex-direction:column` 2줄이 빠짐**(diff 확인) | 80줄. crm과 동일(CSS화). `height:100%` 전제·VContainer 금지 주석 | 없음 | 거의동일 |
| ColumnLayout | 34줄. props `gap`, `divider`(`:deep(.column-pane + .column-pane)` border-left) | 34줄. 동일 | 36줄. **`divider` prop 제거**(사용처 0건 근거) | 없음 | 거의동일 |
| ColumnPane | 76줄. props `width`(→`flex:0 0 w`, 없으면 `flex:1`), `scrollable`. 자신이 `VCard outlined`. 슬롯 top/default/bottom | 76줄. 동일 | 81줄. 동일 + VCard 명시 import, CSS화 | 없음 | 동일 |
| ui/index.ts, column-layout/index.ts | 1줄+2줄 (`export * from './column-layout'`; ColumnLayout/ColumnPane named export). **CardLayout/PanelLayout은 index에 없음** — auto-import 전제 | 동일 | 없음(직접 경로 import) | 없음 | 동일 |

경로 차이: crm/axion은 `ui/column-layout/{ColumnLayout,ColumnPane}.vue`, hangang은 `ui/{ColumnLayout,ColumnPane}.vue` 평면.

### 1-5. 공용 컴포넌트 (components/common/* 및 gise/hangang 대응물)

| 역할 | crm | axion | gise | hangang | 등급 |
|---|---|---|---|---|---|
| BaseDialog | 96줄 (frontend-core). `defineModel('show')`, props `title/message/maxWidth=540/type:'ok'\|'yesno'`, emit `confirm/cancel`, 슬롯 `title/default/actions`. 닫기 버튼 `color="third"`(**테마에 없는 색**) | 97줄. 동일하되 닫기 버튼 `color="secondary" variant="text"` | 37줄. **상이**: props `title(필수)/maxWidth=600/persistent=true`, `VCard :title`, 슬롯 default/actions만, `data-test="dialog-card"`, emit 없음 | 없음(각 다이얼로그가 VDialog 직접 사용) | crm≈axion 거의동일, gise 상이 |
| ConfirmDialog | 없음(BaseDialog `type="yesno"`로 대체) | 없음 | 72줄. BaseDialog 래핑. props `title/message/confirmLabel='삭제'/confirmColor='error'/pending/blockedReason`. blocked면 확정 버튼 **숨김**. `data-test` 3종 | 80줄. VDialog 직접. props `title/message/reversible(필수)/submitting`. `defineModel()`(이름 없음), 되돌림 가능 여부 VAlert 문구, 확인 버튼 `:disabled && :loading` 한 벌 | 상이 |
| AppToast + useToast | 없음 | 없음 | 14줄 + 58줄. 모듈 싱글턴 `toastState`(reactive), 색별 timeout(success 3s/error 6s/warning 5s/info 4s), `useToast().success/error/warning/info/dismiss`. `App.vue`에 `<AppToast/>` 1개 | 없음(화면별 알림) | gise 전용 |
| PasswordField | 22줄 (crm 앱). `defineModel`, eye 토글, `v-bind="$attrs"`, `autocomplete="off"`. `ref` auto-import | 23줄. 동일 + `ref` 명시 import | 없음 | 21줄. 동일 + `ref` 명시 import | **동일** |
| IpBlockedDialog | 60줄 (crm 앱). `appStore.ipBlocked/blockedIp`, 로그아웃=`appStore.logout()`. 문구 'CRM' | 없음 | 없음 | 73줄. 문구 '관리자', 로그아웃 후 `router.replace('/login')`. App.vue 최상위 배치 | 거의동일 |
| ReauthDialog | 없음 | 없음 | 없음 | 141줄. props `message/title/submitting/error`, emit `confirm:[password]`, `PasswordField name="currentPassword"`, 열릴 때마다 비움 | hangang 전용 |
| EmptyState | 없음 | 없음 | 없음 | 67줄. props `filtered/canCreate/title/filteredTitle/createLabel`, emit `create` | hangang 전용 |
| DataTablePanel / DataTableBody / data-table-panel.ts | (frontend-core `DataTable.vue` 559줄 — `@tanstack/vue-virtual` 가상 스크롤, 별개 설계) | 없음 | `SessionTable.vue` 114줄 (도메인 특화 VDataTable) | 127/65/76줄. `VDataTableServer` 래퍼(generic `TItem`), v-model `page/itemsPerPage/sortBy`, 슬롯 `header-actions/filters` + 열 슬롯 투과, `AdminTableHeader/AdminTableSort` 타입, `DEFAULT_ITEMS_PER_PAGE_OPTIONS=[10,20,50,100]`(-1 제외), `formatSortLabel()` | 상이(hangang 것이 범용) |
| TemporaryPasswordDialog | 없음 | 없음 | 78줄. props `modelValue/password/mode`, 클립보드 복사+toast | 없음 | gise 전용 |
| ResetPasswordField / ViewField / DateField / PhoneField | 73/51/59/26줄 (crm 앱). DateField=`@vuepic/vue-datepicker`, PhoneField=`maska` | DateField 36줄(VMenu+VDatePicker, 문자열 모델), PhoneField 68줄(커서 보존 포맷), MarkdownView 29줄+util 33줄 | 없음 | 없음 | 상이(같은 이름·다른 구현) |
| usePermission | 31줄 (frontend-core). `hasPermission(AND)/hasAnyPermission(OR)/getScope`, `PERMISSIONS.ALL` 단락, `@crm/shared` 타입 | 28줄. 동일(`@axion-admin/shared`) | 24줄. `@gise/shared`의 `hasPermission/hasAnyPermission` 함수에 위임, getScope 없음 | 44줄. crm에서 getScope 제거, `PermissionCheck` 인터페이스 export | 거의동일(스토어·shared 의존이 걸림돌) |

### 1-6. 테스트 자산

| 프로젝트 | 본 범위 테스트 파일 |
|---|---|
| crm | **없음**(frontend-core에 vitest 설정은 있으나 layout/ui/common 테스트 파일 0건) |
| axion | `components/common/MarkdownView.spec.ts`(68줄)만. 레이아웃/ui 테스트 없음 |
| gise | 본 범위 컴포넌트 테스트 없음(`data-test` 속성은 광범위하게 부착됨 → 페이지 테스트가 이를 사용) |
| hangang | `components/ui/layout.render.test.ts`(126줄, PanelLayout/CardLayout/ColumnLayout/ColumnPane), `components/ui/button-size.test.ts`(113줄, 소스 스캔), `components/common/confirm-dialog.render.test.ts`(145), `reauth-dialog.render.test.ts`(236), `empty-state.render.test.ts`(114), `data-table-body.render.test.ts`(87), `data-table-panel.render.test.ts`(245), `composables/usePermission.test.ts`(73). 전부 `@vue/test-utils` + `happy-dom` + `createVuetify({components})` 전역 등록 |

→ 테스트가 있는 사본은 **hangang뿐**이다.

---

## 2. 정본 후보

| 역할 | 정본 | 이유 | 흡수할 개선점 |
|---|---|---|---|
| CardLayout / PanelLayout / ColumnLayout / ColumnPane | **hangang** `hangang-home/apps/admin/src/components/ui/*.vue` | 명시 import(`vuetify/components`)로 auto-import 없이 동작, 순수 CSS(sass 의존 제거), 렌더 테스트 동반. 내용은 crm과 동일 | crm의 `ColumnLayout.divider` prop 복원(hangang은 사용처 0건이라 뺐지만 패키지는 옵션으로 두는 편이 안전). axion PanelLayout의 inner flex 누락은 **버그로 보고 crm/hangang 쪽을 채택** |
| default 레이아웃 | **hangang** `layouts/default.vue` | 죽은 코드 제거, @vueuse 의존 제거, 도메인 컴포넌트(IpBlocked·Reminder) 분리 | localStorage 키를 옵션화(crm/axion `rail_menu`, hangang `hg_admin_rail_menu`). axion처럼 VMain 안에 배너 슬롯 필요. gise의 `VListGroup` 접이식·`isPending` 칩은 메뉴 옵션으로 흡수 |
| auth 레이아웃 | **crm/hangang**(동일) | 가장 단순 | axion의 VApp 중첩은 채택하지 않음 |
| AppBar | **hangang** `components/layout/AppBar.vue` 골격 + **crm** 슬롯 구조 | hangang이 사이트명·팀/역할 표시·로그아웃 후 라우팅을 컴포넌트에서 처리(스토어가 router를 모르게 함) | crm/axion의 추가 항목(알림, 출결, APK, 매뉴얼)은 **슬롯**으로, gise의 텍스트 버튼(비밀번호 변경)은 `menuItems` 옵션으로 |
| MainMenu / MainMenuItem | **hangang** | `divider` prop 의미 통일, `isGroup` 타입가드, 재귀에 `rail` 전달(crm/axion은 재귀 시 `rail` 누락) | 메뉴 소스는 hangang의 라우트 파생(`router/menu.ts`)이 아니라 **prop/inject로 받는 배열**로 일반화. axion의 `#prepend` 브랜드 슬롯 흡수. gise `VListGroup`/`isPending`은 옵션 |
| BaseDialog | **crm/axion** 골격(`title/default/actions` 슬롯, `type ok\|yesno`) + **gise**의 `persistent=true` 기본 | 슬롯이 가장 풍부 | 닫기 버튼 색 `third`→`secondary`(axion). `persistent` prop 추가(gise). `data-test` 속성(gise) |
| ConfirmDialog | **hangang** `components/common/ConfirmDialog.vue` | 테스트 동반, `:disabled+:loading` 한 벌 | gise의 `blockedReason`(확정 버튼 숨김)·`confirmLabel/confirmColor`를 옵션으로. `reversible` 필수 여부는 논의 필요(hangang은 필수, gise는 개념 없음) |
| Toast | **gise** `composables/useToast.ts` + `components/AppToast.vue` | 유일한 구현, 설계 단순 | 없음. 색별 timeout을 옵션으로 덮어쓸 수 있게 |
| PasswordField | **hangang**(=axion) | 세 사본 동일, 명시 import | 없음 |
| IpBlockedDialog | **hangang** | 문구 중립, 로그아웃 후 라우팅 | 문구·리다이렉트 경로·스토어 접근을 주입 |
| ReauthDialog / EmptyState / DataTablePanel / DataTableBody | **hangang**(유일) | 테스트 동반, 범용 설계 | DataTable의 `DEFAULT_ITEMS_PER_PAGE_OPTIONS`·`ADMIN_LIST_MAX_PAGE_SIZE`는 옵션화 |
| plugins/vuetify.ts | **hangang** `defaults` + **gise** 테마 구조 | hangang의 outlined 10종·`hideDetails:'auto'`가 가장 완전 | 테마 팔레트는 프로젝트 주입. `global.autocomplete:'off'`(gise)는 검토 후 채택 |
| usePermission | **hangang** | `PermissionCheck` 인터페이스 export, 테스트 있음 | crm/axion의 `getScope`는 옵션(scopes 있는 프로젝트만). 스토어 결합은 주입으로 끊어야 함(§5) |

---

## 3. 확장점 목록 (패키지 설계안)

### 3-1. 전역 주입 — `provide/inject` 컨텍스트 (`AdminUiContext`)
레이아웃 컴포넌트 4종(AppBar/MainMenu/IpBlockedDialog/default 레이아웃)이 공통으로 스토어에 요구하는 것은 아래뿐이다(4개 프로젝트 `stores/app.ts` 확인):

| 필드 | 사용처 | 근거 |
|---|---|---|
| `userInfo: { userId, userName, permissions, teamName?, roleName?, loginId? }` | AppBar 아바타 메뉴, MainMenu 필터 | crm/axion `userId/userName`, hangang `+teamName/roleName`, gise `loginId` |
| `logout(): Promise<void>` | AppBar, IpBlockedDialog | 전부 |
| `ipBlocked / blockedIp` | IpBlockedDialog | crm, hangang |
| 로그아웃 후 이동 | hangang/gise는 컴포넌트가 `router.replace('/login')`, crm/axion은 스토어가 처리 | `afterLogout?: () => void` 콜백 또는 `loginPath` 옵션 |

→ `createAdminUi({ useUser: () => {...}, logout, loginPath, siteName, ... })` 플러그인으로 provide하고, 컴포넌트는 `inject`만 한다. 스토어 파일을 패키지가 import하지 않는다.

### 3-2. AppBar
| 확장점 | 형태 | 흡수하는 차이 |
|---|---|---|
| 제목 | prop `title?: string` (기본 `route.meta.title`), prop `siteName?: string` (있으면 `siteName · title`) | hangang `SITE_NAME`, gise 고정 제목 |
| 브랜드 영역 | slot `brand` (제목 앞) | axion 락업(현재는 MainMenu prepend에 있으나 앱바에도 둘 수 있게) |
| 우측 액션 | slot `actions` (VSpacer 뒤, 아바타 앞) | crm `AttendanceCheckMenu`, `NotificationBell` |
| 사용자 메뉴 항목 | prop `menuItems: { icon, title, to?\|onClick, visible? }[]` + slot `user-menu` (전체 교체) | crm 매뉴얼/APK, hangang 내 계정 `/account`, crm 내 정보 `/mypage` |
| 사용자 정보 블록 | slot `user-info`(기본: 아바타+userName/userId, 옵션으로 team/role 행) prop `showTeamRole` | hangang 팀/역할 행 |
| 로그아웃 | inject `logout` + `afterLogout` | §3-1 |
| 텍스트 버튼 변형 | slot `actions`로 해결(gise `비밀번호 변경`·`로그아웃` 텍스트 버튼) | gise |
| emit | `click:nav` 유지 | 전부 동일 |

### 3-3. MainMenu / MainMenuItem
| 확장점 | 형태 | 흡수하는 차이 |
|---|---|---|
| 메뉴 데이터 | prop `items: MenuNode[]` (필수) — 패키지가 `MenuNode = { id, title, icon?, to?, children?, permission?, anyPermissions?, disabled?, badge? }` 타입 정의 | crm/axion `data/main_menu.ts`, gise `MAIN_MENU`(`children`), hangang `router/menu.ts`(`children`, 라우트 파생). 프로젝트가 어떤 방식으로 만들든 **결과 배열만** 넘김 |
| 권한 필터 | prop `check?: PermissionCheck` (inject 기본값: 컨텍스트 `userInfo.permissions` + `'*'` 규칙), 또는 prop `filter?: (node) => boolean` | axion `partnerOnly`, gise `isPending` 같은 프로젝트별 축 |
| 그룹 렌더 방식 | prop `groupMode: 'subheader' \| 'collapsible'` | crm/axion/hangang=VListSubheader, gise=VListGroup |
| 비활성 항목 | `MenuNode.disabled` + `badge`(칩 텍스트) | gise `isPending`+'준비 중' 칩 |
| 드로어 헤더 | slot `prepend` (VNavigationDrawer `#prepend`), slot props `{ rail }` | axion BrandLockup/BrandSymbol 전환 |
| 드로어 푸터 | slot `append` | (미래) |
| 구분선 | `MainMenuItem` prop `divider`(hangang 의미: "이 노드 뒤에") | crm/axion `is-last` 이중 의미 폐기 |
| 재귀 깊이 | 2단 고정(hangang) 또는 무제한(crm) — `rail`은 재귀에 반드시 전달 | crm/axion 버그 수정 |

### 3-4. default 레이아웃 (`AdminShell`)
| 확장점 | 형태 |
|---|---|
| rail 저장 키 | prop `railStorageKey` (기본 `admin_rail_menu`) |
| 메뉴/앱바 교체 | slot `drawer`, slot `app-bar` (기본은 패키지 MainMenu/AppBar), AppBar·MainMenu의 props를 `appBarProps`/`menuProps`로 통과 |
| 본문 위 배너 | slot `banner` (VMain 안, RouterView 앞) — axion `SuspensionBanner` |
| 전역 오버레이 | slot `overlays` (IpBlockedDialog, ScheduleReminderListener 등) — 단, hangang처럼 App.vue 최상위에 두는 편이 로그인 화면도 덮으므로 **권장 위치는 App.vue** |
| 본문 래퍼 | prop `container: boolean`(gise `VContainer fluid`) — 단 PanelLayout 사용 페이지는 VContainer 금지(hangang 주석) → 기본 `false` |

### 3-5. Vuetify 플러그인 팩토리
`createAdminVuetify({ themes?, defaultTheme?, defaults?, locale? })` — hangang의 `defaults` 10종 + `hideDetails:'auto'`를 기본으로 깔고, `themes`는 deep merge. 프로젝트별 팔레트(axion 다크 14색, gise wine/ivory)는 그대로 인자로 전달.

### 3-6. 다이얼로그 / 토스트
- BaseDialog: props `title/message/maxWidth/type/persistent(기본 true)`, slots `title/default/actions`, emit `confirm/cancel`, 닫기 버튼 색 prop `closeColor='secondary'`.
- ConfirmDialog: props `title/message/confirmLabel/confirmColor/submitting(=pending)/blockedReason/reversible?`. `reversible` 미지정 시 되돌림 문구 생략(hangang 규약은 프로젝트 lint로 강제).
- Toast: `createToast({ timeouts? })` + `<AdminToast location?>`; 상태는 패키지 모듈 싱글턴이 아니라 **plugin install 시 생성해 provide** (앱 2개 이상 마운트/테스트 격리 대비).
- IpBlockedDialog: props `message?`, inject `ipBlocked/blockedIp/logout/afterLogout`.

### 3-7. 테이블
DataTablePanel/DataTableBody: `itemsPerPageOptions` 기본값과 상한을 `createAdminUi({ table: { itemsPerPageOptions, maxPageSize } })`로 주입. `AdminTableHeader/AdminTableSort` 타입 export.

---

## 4. A/B/X 배정

A = `@ssworks/admin-ui`에서 import · B = 템플릿에 복사되어 프로젝트 소유 · X = 도메인 특화 제외

| 파일(정본 기준 경로) | 배정 | 이유 |
|---|---|---|
| `hangang-home/apps/admin/src/components/ui/CardLayout.vue` | **A** | 4사본 동일, 테스트 있음 |
| `hangang-home/apps/admin/src/components/ui/PanelLayout.vue` | **A** | 동일 |
| `hangang-home/apps/admin/src/components/ui/ColumnLayout.vue` (+crm `divider`) | **A** | 동일 |
| `hangang-home/apps/admin/src/components/ui/ColumnPane.vue` | **A** | 동일 |
| `kim5257-crm-v5/packages/frontend-core/src/components/ui/index.ts`, `column-layout/index.ts` | **A**(패키지 index로 흡수) | 배럴 |
| `hangang-home/apps/admin/src/components/layout/AppBar.vue` | **A** (슬롯화 후) | 골격 동일, 차이는 슬롯/옵션으로 흡수 가능 |
| `hangang-home/apps/admin/src/components/layout/MainMenu.vue`, `MainMenuItem.vue` | **A** (items prop화 후) | 동일 |
| `hangang-home/apps/admin/src/layouts/default.vue` → `AdminShell` | **A** | 동일 |
| `hangang-home/apps/admin/src/layouts/auth.vue` → `AuthShell` | **A** | 3사본 거의동일 |
| `layouts/default.vue`, `layouts/auth.vue` (프로젝트 파일) | **B** | `<AdminShell>`/`<AuthShell>`을 감싸 슬롯을 채우는 3~10줄 파일. 레이아웃 플러그인(`virtual:generated-layouts`)이 이 경로를 요구 |
| `App.vue` | **B** | 레이아웃 선택 방식·전역 오버레이·전역 CSS(axion)가 프로젝트마다 다름 |
| `main.ts` | **B** | 폰트 import, `onAuthFailure`(gise), `router.isReady`(hangang) 등 프로젝트 관심사. 단 `createAdminApp()` 헬퍼는 A |
| `plugins/index.ts` | **B** | 프로젝트 플러그인(echarts, he-tree) 등록 |
| `plugins/vuetify.ts` | **B** (A의 `createAdminVuetify` 호출) | 테마 팔레트가 프로젝트 소유 |
| `data/main_menu.ts` / `router/menu.ts` | **B** | 메뉴 내용은 도메인. 타입 `MenuNode`만 A |
| `constants.ts`(SITE_NAME) | **B** | 프로젝트 값 |
| `components/common/BaseDialog.vue` (crm/axion 정본) | **A** | 범용 |
| `components/common/ConfirmDialog.vue` (hangang) | **A** | 범용, 테스트 |
| `composables/useToast.ts` + `AppToast.vue` (gise) | **A** | 범용 |
| `components/common/PasswordField.vue` | **A** | 3사본 동일 |
| `components/common/ReauthDialog.vue` (hangang) | **A** | 재인증은 관리자 공통 관심사(hangang 12화면). PasswordField 의존만 |
| `components/common/EmptyState.vue` (hangang) | **A** | 범용 |
| `components/common/DataTablePanel.vue`, `DataTableBody.vue`, `data-table-panel.ts` (hangang) | **A** | 범용 서버 페이지네이션. 상한은 옵션 |
| `components/common/IpBlockedDialog.vue` (hangang) | **A** (문구·경로 옵션화) | crm/hangang 동일 기능. IP 차단 없는 프로젝트는 안 쓰면 됨 |
| `composables/usePermission.ts` | **A** (컨텍스트 주입형) | 4사본 로직 동일. `getScope`는 옵션 |
| `components/TemporaryPasswordDialog.vue` (gise) | **A 후보(보류)** | 임시 비밀번호 1회 표시는 관리자 공통 패턴이나 현재 1사본. BaseDialog+useToast만 의존해 옮기기 쉬움 |
| `components/SessionTable.vue` (gise) | **X** | `@/types/session`, `@/utils/user-agent` 의존, 세션 API 형태 특화 |
| `components/layout/BrandLockup.vue`, `BrandSymbol.vue`, `brand-geometry.ts` (axion) | **X** | ATLAS 로고 |
| `components/layout/SuspensionBanner.vue` (axion) | **X** | 파트너 정지 도메인 |
| `components/layout/NotificationBell.vue`, `ScheduleReminderListener.vue` (crm) | **X** | CRM 알림/일정 |
| `components/common/ResetPasswordField.vue`, `ViewField.vue`, `DateField.vue`, `PhoneField.vue` (crm) | **X**(본 범위) | `usersApi`, `@vuepic/vue-datepicker`, `maska` 의존. ViewField/PhoneField는 별도 "폼 필드" 분석에서 재검토 |
| `components/common/DateField.vue`, `PhoneField.vue`, `MarkdownView.vue` (axion) | **X**(본 범위) | `@/utils/datetime`, `@/utils/phone`, `markdown-it` 의존 |
| `kim5257-crm-v5/packages/frontend-core/src/components/common/DataTable.vue` | **X**(본 범위) | 가상 스크롤 테이블, `useTableSelection` 의존. 별도 판단 |
| `hangang-home/apps/admin/src/components/ui/button-size.test.ts` | **B** | 프로젝트 소스 스캔 규칙 |
| hangang `*.render.test.ts` 7종 + `usePermission.test.ts` | **A** | 패키지 테스트로 이관 |

---

## 5. 패키지화 시 걸림돌

### 5-1. auto-import 의존 (unplugin-auto-import / unplugin-vue-components / vite-plugin-vuetify)
| 프로젝트 | vue API auto-import | 컴포넌트 auto-import | 근거 |
|---|---|---|---|
| crm | 있음(`ref/computed/watch/useRouter/storeToRefs` 미import — `layouts/default.vue`, `components/layout/AppBar.vue`, `PasswordField.vue`) | 있음(`MainMenu`, `AppBar`, `IpBlockedDialog`, `NotificationBell`, `AttendanceCheckMenu`, `ViewField`, `BaseDialog` 미import) | `apps/base/frontend/package.json`: unplugin-auto-import ^20, unplugin-vue-components ^29 |
| axion | 없음(명시 import) | 프로젝트 컴포넌트는 명시 import, V* 는 vite-plugin-vuetify | package.json에 unplugin-* 없음 |
| gise | 명시 import | `AppToast`는 미import(unplugin-vue-components) | package.json unplugin-auto-import/vue-components 있음 |
| hangang | 명시 import | V* 는 vite-plugin-vuetify(빌드) + 테스트는 `createVuetify({components})` 전역 등록. CardLayout/ColumnPane은 `vuetify/components` 명시 import | 파일 주석(`CardLayout.vue:5-9`) |

→ 패키지 소스는 **vue API·Vuetify 컴포넌트·내부 컴포넌트를 전부 명시 import** 해야 한다. crm 사본은 그대로 못 쓴다(hangang 사본이 이미 이 조건을 충족). Vuetify 컴포넌트를 패키지 안에서 `vuetify/components`로 명시 import하면 소비 프로젝트의 tree-shaking(vite-plugin-vuetify)과 무관하게 동작한다.

### 5-2. 상대경로·alias import
| 패턴 | 예 |
|---|---|
| `@/stores/app`, `../../stores/app.js` | axion AppBar/MainMenu, hangang AppBar/MainMenu/IpBlockedDialog, gise default.vue |
| `@crm/frontend-core/stores/app.ts`, `@crm/frontend-core/composables/usePermission.ts` | crm AppBar/MainMenu/IpBlockedDialog |
| `@/data/main_menu.ts`, `../../router/menu.js` | crm/axion MainMenu(Item), hangang MainMenu(Item) |
| `../../constants.js` | hangang AppBar |
| `@/utils/partner-billing.ts` | axion SuspensionBanner |
| `@/composables/useToast` | gise AppToast/TemporaryPasswordDialog |

→ 스토어·메뉴·상수 의존은 §3-1 컨텍스트 주입으로 끊는다. 패키지 내부는 상대경로만.

### 5-3. shared 패키지 scope alias
`usePermission.ts`가 `@crm/shared` / `@axion-admin/shared` / `@gise/shared` / `@hangang/shared`에서 `Permission` 타입과 `PERMISSIONS.ALL`(`'*'`)을 가져온다. gise는 `hasPermission/hasAnyPermission` 함수 자체를 shared에서 가져온다. → 패키지는 `Permission = string` 제네릭 + `allPermission: string = '*'` 옵션으로 두고 프로젝트 shared에 의존하지 않는다.

### 5-4. Vuetify / Vue / Router 버전 (package.json 실측)
| | vue | vuetify | vue-router | pinia | vite | 스타일 |
|---|---|---|---|---|---|---|
| crm app / core | ^3.5.21 | ^4.0.5 | ^4.5.1 | ^3.0.3 | ^7.1.5 | sass-embedded |
| axion | ^3.5.30 | ^4.0.2 | **^5.0.3** | ^3.0.4 | ^8.0.0 | sass-embedded |
| gise | ^3.5.21 | ^4.0.5 | ^4.5.1 | ^3.0.3 | ^8.2.0 | 없음 |
| hangang | ^3.5.21 | ^4.0.5 | ^4.5.1 | ^3.0.3 | ^7.1.5 | 없음(순수 CSS) |
| tmpl | ^3.5.30 | ^4.0.2 | **^5.0.3** | ^3.0.4 | ^8.0.0 | sass-embedded |

- Vuetify는 전부 4.x — peerDependency `vuetify: ^4.0.0`으로 통일 가능. hangang 주석이 `vuetify@4.1.11` 설치본 기준의 `VBtn :loading` 동작·`VDataTableFooter -1` 기본값을 언급하므로 패키지 테스트는 4.1.x 이상에서 검증.
- **vue-router 4 vs 5 혼재**(axion/tmpl은 5). 패키지는 `useRoute/useRouter/RouterView`만 쓰므로 `^4 || ^5` peer로 둘 수 있으나, `route.meta.title` 타입 확장(`RouteMeta` 모듈 보강)은 프로젝트가 소유해야 한다.
- gise/hangang은 sass 파이프라인이 없다 → 패키지 SFC 스타일은 **순수 CSS**(hangang 사본 그대로). 배포 시 CSS를 별도 파일로 뽑을지(소비자가 `import '@ssworks/admin-ui/style.css'`) SFC 그대로 배포할지 결정 필요.

### 5-5. 라우터/레이아웃 플러그인 결합
- crm/axion/gise: `vite-plugin-vue-layouts-next` + `unplugin-vue-router`(`vue-router/auto-routes`, `typed-router.d.ts`). `layouts/default.vue` 파일 **경로 자체가 계약**이므로 패키지는 `AdminShell` 컴포넌트를 주고 프로젝트가 `layouts/default.vue`(B)에서 감싼다.
- hangang: 파일 라우팅·레이아웃 플러그인 없음, `App.vue`가 `meta.layout`으로 선택. 같은 `AdminShell`로 대응 가능.
- `route.meta.title`을 AppBar가 직접 읽는다(전 사본). typed-router 유무와 무관하게 `RouteMeta` 보강은 프로젝트 몫이며, 패키지는 `title` prop으로도 받을 수 있게 한다(§3-2).

### 5-6. 테마 색 `third`
crm `BaseDialog.vue:47`이 `color="third"`를 쓰는데 crm `plugins/vuetify.ts`는 색을 정의하지 않는다(hangang 주석 `plugins/vuetify.ts:9-13`이 같은 지적). 정본은 axion의 `secondary + variant="text"`.

### 5-7. 전역 CSS 보정
axion `App.vue`가 다크 보더 색과 outlined 카드 배경을 전역 `<style>`로 덮는다. 패키지 CardLayout/ColumnPane은 `--v-border-color`에 의존하므로 이런 전역 보정은 프로젝트 소유(B)로 두고 패키지는 건드리지 않는다.

### 5-8. 로그아웃 후 라우팅 책임
crm/axion은 스토어 `logout()`이 내부에서 `router.replace()`까지 하고, hangang/gise는 컴포넌트가 한다(hangang `AppBar.vue:772-773` 근거: 스토어가 router를 import하면 import만으로 DOM 의존이 생김). 패키지는 후자 방식을 채택하고 `afterLogout` 콜백/`loginPath` 옵션으로 흡수한다.

### 5-9. 토스트 싱글턴
gise `useToast.ts`의 `toastState`는 모듈 스코프 싱글턴이다. 패키지로 옮기면 테스트 간 상태 누수·다중 앱 인스턴스 문제가 있어 plugin install 시 생성·provide하는 형태로 바꿔야 한다.

### 5-10. 테스트 환경
hangang 테스트는 `// @vitest-environment happy-dom` + `@vue/test-utils` + `createVuetify({ components })`. 패키지에 이 조합을 devDependency로 가져오면 hangang 테스트 8종을 거의 그대로 이관할 수 있다(경로·`divider` prop 관련 1건은 수정).
