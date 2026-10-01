# @ssworks/admin-ui

관리자 페이지 공통 **Vue 3 + Vuetify 4** 컴포넌트와 composable.

```bash
pnpm add @ssworks/admin-ui @ssworks/admin-shared vue vuetify
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
