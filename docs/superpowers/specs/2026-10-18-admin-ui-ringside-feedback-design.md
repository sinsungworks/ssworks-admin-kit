# admin-ui ringside 보고 반영 설계 (PR #3h)

작성일: 2026-10-18 · 상태: 확정(구현 전) · 입력: `docs/reports/2026-10-18-ringside-admin-kit-report.md`(ringside 가 킷 0.5.0 을 README · 템플릿 배선대로 조립하다 찾은 네 항목 — 원인은 지난 세션이 0.7.0 기준으로 다시 확인했다) · 선행: PR #3b 스펙(`PermissionMatrix` · `SettingsShell`), PR #3c 스펙(`SessionTable` · `useSessions`), PR #3f · #3g 스펙(`2026-10-18-admin-ui-audit-ip-design.md` — 문구 규약 C2)

## 1. 목표

ringside 보고의 네 항목을 admin-ui minor 한 번으로 반영한다. ringside 가 계약 고정(2026-10-30) 전에 받아 쓸 수 있어야 한다.

| #   | 항목                                                                                 | 이 PR 이 하는 것                                                      |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| R1  | 🔴 Vuetify CSS 레이어 순서가 뒤집혀 `<button>` VBtn 이 `size` · 굵기를 잃는다        | Vite 플러그인 `@ssworks/admin-ui/vite` 의 `vuetifyLayerOrder()`       |
| R2  | `SettingsShell` 은 부모 높이가 필요한데 README 에 없다(템플릿은 앱바 64px 를 박았다) | README 만                                                             |
| R3  | `SessionTable` 의 "사용자" 열 · "사용자 전체 끊기" 버튼 · 그 접근 이름을 못 바꾼다   | `messages` — `useSessions` 한 곳에서 표 · 대화상자 문구를 함께 바꾼다 |
| R4  | `PermissionMatrix` 가 카테고리마다 표를 따로 그려 같은 순번 열이 어긋난다            | 한 표 · 카테고리마다 `<tbody>`                                        |

- **admin-shared · admin-server 는 고치지 않는다.** 템플릿 · ringside 저장소는 읽기만 한다 — 그쪽 반영은 HANDOFF 에 입력으로 남긴다(§7-3).
- 성공 기준: 실브라우저에서 `<button>` VBtn 이 14px · 500(small 12px)으로 돌아온다 · 킷 테스트가 레이어 선언을 설치된 Vuetify 와 대조한다 · 키 둘(`userColumn` · `revokeUserButton`)로 열 · 버튼 · 접근 이름 · 확인 창 제목이 함께 바뀐다 · 카테고리를 넘어 같은 순번 열이 한 줄로 선다 · `pnpm check` 초록 · tarball 스모크 통과.

## 2. 결정

### 2-1. 경계 결정 (2026-10-18)

결정 문서(HTML)로 고른 뒤 설계 절마다 승인받았다. 다섯 가지 모두 권장안이다.

| 결정                      | 확정                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① R1 선언을 내보내는 모양 | **ⓓ Vite 플러그인** — `@ssworks/admin-ui/vite` 의 플러그인이 개발 · 빌드 모두 `<head>` 맨 앞에 레이어 선언 `<style>` 을 넣는다. 선언은 킷 한 곳에 두고 설치된 vuetify 와 대조 테스트한다                                         |
| ② R1 테스트               | **단위 셋 + 스모크** — 선언 대조 · 플러그인 출력 · `./vite` 엔트리 그래프(단위), 빌드 `index.html` 의 head 첫 스타일 · 실브라우저 글자 크기(스모크 · 검증 기록). 빌드 때 대조 경고 · Playwright 자동 테스트는 넣지 않는다        |
| ③ R2 설정 셸 높이         | **README 만** — 부모 높이 요구 · `calc(100dvh - var(--v-layout-top, 64px))` 예시 · PanelLayout 과 잇기 · banner 주의. 코드 변경 없음                                                                                             |
| ④ R3 SessionTable 문구    | **ⓐ** — `useSessions({ messages })` 가 표 문구까지 맡아 `table` 바인딩의 `messages` 로 흘린다. `SessionTable` 도 `messages` prop(부분 · 기본값 병합)이라 따로 써도 된다. 대화상자 제목 · 접근 이름의 기본값은 버튼 문구를 따른다 |
| ⑤ R4 카테고리를 넘는 정렬 | **ⓐ** — `VTable` 하나 · 카테고리마다 `<tbody>`(첫 줄이 카테고리 머리 줄). 열 수는 카테고리 최댓값, 모자란 칸은 빈 칸. 너비 prop 없음. `#row-extra` 열도 한 줄                                                                    |

버린 안과 이유:

- R1 — import 순서 바꾸기(`vuetify/styles` 를 `main.ts` 첫 줄로): 개발 서버는 모듈 평가 순서, 운영 빌드는 청크 CSS 순서를 따른다(보고서: 첫 link 가 `VSpacer-*.css`). Vuetify 문서도 선언을 권한다. ⓐ `public/layers.css` · ⓒ 인라인 `<style>` 안내: 프로젝트마다 사본이 생겨 Vuetify 가 레이어를 바꾸면 따로 고쳐야 한다. ⓑ `layers.css` export: `index.html` 이 `node_modules` 파일을 link 하면 빌드가 그 CSS 를 엔트리 CSS 에 합쳐 vendor 청크 CSS 뒤로 민다 — 복사 단계가 필요해 결국 ⓓ 다.
- R2 — `SettingsShell` `fill` prop · 공용 CSS 클래스: PanelLayout · 팀 화면은 여전히 직접 셈해야 하고 공개 API 가 는다.
- R3 — 컴포넌트 prop 만: 같은 말을 두 곳에서 바꿔야 해 보고서가 짚은 "버튼과 대화상자 제목이 다른 말" 이 사용법으로 남는다. prop 이름은 보고서의 `labels` 대신 킷 관례(`TeamTree` · `TeamUserList` · `LegalDocumentEditor`)인 `messages` 다.
- R4 — 표 여럿 + `table-layout: fixed` + `<colgroup>`: 너비를 짐작해야 해 너비 prop 둘이 사실상 필요하고, 열 수가 다른 카테고리끼리 `#row-extra` 열이 어긋난다.

### 2-2. R1 설계 결정 — 레이어 선언 플러그인

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | 🔴 **원인**: admin-ui 엔트리가 `vuetify/components` 를 import 해서 부품 CSS(`@layer vuetify-components`)가 `vuetify/styles` 의 레이어 순서 선언보다 먼저 문서에 들어간다. 캐스케이드 레이어 순서는 처음 나타난 순서라 `vuetify-components` 가 `vuetify-core` 앞에 서고, reset 의 `button { font: inherit; font-size: inherit }` 이 `.v-btn--size-default { font-size: var(--v-btn-size) }` 를 이긴다. `<a>` VBtn · 입력 칸은 멀쩡하다                                                                      |
| L2  | 플러그인은 `transformIndexHtml` 로 태그 하나 `{ tag: 'style', children: <선언>, injectTo: 'head-prepend' }` 를 낸다. Vite 8.3.4 소스로 확인했다: `head-prepend` 태그는 `<head>` 바로 뒤, 빌드 CSS link 는 `</head>` 바로 앞(`injectToHead(…, prepend = false)`), 개발 서버의 CSS `<style>` 은 head 끝에 붙는다. 그래서 개발 · 빌드 모두 선언이 맨 앞이다. 훅 순서(`order`)는 두지 않는다 — 우리 위에 올 수 있는 것은 다른 플러그인의 `head-prepend` 태그뿐이고, Vuetify 레이어를 선언하지 않는 한 무관하다 |
| L3  | 선언은 Vuetify 4.2.6 `lib/styles/main.css` 머리(= `lib/styles/generic/_layers.scss`)를 그대로 옮긴 문자열 상수다. 보고서 §1 의 선언(쉼표 목록)과 순서가 같다. 상수는 내보내지 않는다 — Vite 밖 번들러는 다루지 않는다(소비자는 템플릿 · ringside · 스모크 모두 Vite)                                                                                                                                                                                                                                       |
| L4  | 🔴 **`src/vite.ts` 는 아무것도 import 하지 않는다.** 소비자의 `vite.config` 가 Node 에서 읽는다 — vue · vuetify · `.vue` · `.css` 를 끌면 설정 로드가 깨진다. `vite` 타입도 import 하지 않는다: `peer-deps.test.ts` 가 src 의 모든 bare import 를 필수 peer 로 요구하고, `vite` 를 peer 로 들이는 것은 이 기능에 비해 무겁다. 반환 타입은 구조 타입 `VuetifyLayerOrderPlugin` 이고 Vite `Plugin` 에 대입되는지는 스모크 vue-tsc 가 잰다                                                                    |
| L5  | 빌드: `vite.config.ts` 의 lib 엔트리를 `{ index: src/index.ts, vite: src/vite.ts }` 로, 출력 이름을 `[엔트리 이름].js` 로. `dist/index.js` · `dist/style.css` 이름은 그대로다. `vite-plugin-dts` 가 `dist/vite.d.ts` 를 낸다. 두 엔트리는 공유 모듈이 없어 공유 청크가 생기지 않는다(빌드 뒤 `dist/` 목록으로 확인)                                                                                                                                                                                        |
| L6  | 플러그인 이름(`name`)은 `'@ssworks/admin-ui:vuetify-layer-order'`. 인자는 없다                                                                                                                                                                                                                                                                                                                                                                                                                             |
| L7  | 킷의 선언은 킷이 시험한 Vuetify(devDependency — 잠금 4.2.6)를 따른다. 소비자가 그보다 새 Vuetify 를 쓰는데 레이어가 바뀌었으면 킷을 올려야 한다 — README 에 적는다. 빌드 때 소비자 Vuetify 와 대조해 경고하는 것은 하지 않는다(결정 ②)                                                                                                                                                                                                                                                                     |
| L8  | CSP: 선언은 인라인 `<style>` 이다. `style-src` 를 좁힌 앱은 해시 또는 nonce 가 필요하다 — Vuetify 테마 `<style>` 도 이미 같은 처지다. README 에 한 줄                                                                                                                                                                                                                                                                                                                                                      |

### 2-3. R3 설계 결정 — SessionTable 문구

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | 표 문구 **전부**를 키로 둔다(C2 — 화면 문구가 모두 `messages` 에 있다): 열 제목 여섯 · "이 기기" 칩 · "이 기기는 로그아웃으로 끝냅니다." · "끝내기"와 그 접근 이름 · "사용자 전체 끊기"와 그 접근 이름. 기본값은 지금 박힌 문구와 **한 글자도 다르지 않다**                                                                                                                    |
| S2  | 새 키에는 대화상자 키(`revoke` · `revokeOthers` · `revokeUser` · `revokeUserSelf`)와 겹치지 않게 접미사를 붙인다: `…Column` · `…Button` · `…ButtonLabel` · `currentDevice…`                                                                                                                                                                                                    |
| S3  | 접근 이름 함수는 `(row, view)` 를 받는다. `view` = `{ device, lastAccessAt, showUser, button }` — `device` 는 `describeUserAgent` 결과, `lastAccessAt` 은 `formatDate` 를 거친 값, `button` 은 그 버튼의 병합된 문구다                                                                                                                                                         |
| S4  | 🔴 **버튼 문구를 바꾸면 따라온다.** `revokeUserButtonLabel` 기본값은 `{이름}({아이디}) {view.button}`, `useSessions` 대화상자 기본값 `revokeUser` · `revokeUserSelf` 의 제목은 병합된 `revokeUserButton` 이다. 그래서 `{ userColumn, revokeUserButton }` 둘이면 열 · 버튼 · 접근 이름 · 확인 창 제목(남 · 본인)이 모두 바뀐다. 쓰는 쪽이 대화상자 키를 직접 주면 그것이 이긴다 |
| S5  | `revokeButtonLabel` 기본값은 지금 그대로 `{이름 · }{기기} 세션 끝내기 (마지막 활동 {시각})` 다(이름은 `showUser` 이고 이름이 있을 때). "세션 끝내기" 는 버튼 문구("끝내기")와 다른 말이라 `view.button` 을 쓰지 않는다                                                                                                                                                         |
| S6  | 기본값 `DEFAULT_SESSION_TABLE_MESSAGES` 는 `session-table.ts` 에 두고 내보내지 않는다(C2). 갖는 곳은 컴포넌트 하나다 — `useSessions` 는 대화상자 제목을 셈하려고 `revokeUserButton` 기본값만 읽는다                                                                                                                                                                            |
| S7  | `table` 바인딩의 `messages` 는 `options.messages ?? {}` 를 그대로 싣는다. 대화상자 키가 섞여 있어도 표는 쓰지 않는다. 🔴 `v-bind` 뒤에 `:messages` 를 따로 주면 바인딩의 것을 **통째로** 덮는다(병합하지 않는다) — README 는 `useSessions` 한 곳에서 바꾸라고 안내한다                                                                                                         |
| S8  | `emptyText` prop · `#no-data` 슬롯은 그대로 둔다(이미 공개). "기기 정보 없음"(빈 User-Agent)은 admin-shared `describeUserAgent` 의 문구라 이 PR 범위 밖이다                                                                                                                                                                                                                    |

### 2-4. R4 설계 결정 — PermissionMatrix 한 표

| #   | 결정                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `VTable` 하나(`density="compact"`, 루트 class `permission-matrix`). 카테고리마다 `<tbody class="permission-matrix__category">`. 카테고리가 0개면 표를 그리지 않는다(지금과 같다)                                                 |
| M2  | 첫 줄은 머리 줄 `<tr class="permission-matrix__head">`: `<th scope="rowgroup">카테고리 라벨</th>` · 열마다 `<th scope="col">열 라벨</th>` · 모자란 열만큼 빈 `<td>` · `#row-extra` 가 있으면 빈 `<th scope="col">`               |
| M3  | 행 줄: `<th scope="row">행 라벨</th>` · 칸마다 `<td>`(VCheckbox) · 모자란 열만큼 빈 `<td>` · `#row-extra` 가 있으면 `<td>`(슬롯)                                                                                                 |
| M4  | 🔴 **모든 줄의 칸 수가 같다** — 1 + 최대 열 수(모든 카테고리 열 수의 최댓값) [+ 1]. 같은 순번 열과 `#row-extra` 열이 구조로 한 줄에 선다. 너비 prop 은 없다                                                                      |
| M5  | 카테고리 라벨은 `scope="col"` 에서 `scope="rowgroup"` 으로 바꾼다 — 그 `<tbody>` 행들의 머리다. 칸의 접근 이름 「행 라벨 열 라벨」 · `name` · 토글 · `disabled` · `canPick` 판정은 그대로다. props · 슬롯 · 타입은 바뀌지 않는다 |
| M6  | scoped CSS: 머리 줄은 thead 처럼 굵기 500 · 보조 글자색, 두 번째 카테고리부터 머리 줄 위 16px 간격(지금 표 사이 간격). 지금의 flex · gap 래퍼는 지운다. 모양은 happy-dom 이 못 재므로 브라우저로 확인한다(§9)                    |
| M7  | DOM 이 바뀐다 — "카테고리마다 `<table>`" → "`<table>` 하나 + 카테고리마다 `<tbody>`". 표 단위로 DOM 을 재는 소비자 테스트는 고쳐야 한다(changeset · HANDOFF 에 적는다)                                                           |

### 2-5. R2 — README 만

- 「설정 셸」에 🔴 항목: `SettingsShell` → `ColumnLayout` · `ColumnPane` 이 모두 `height: 100%` 라 부모가 정한 높이(definite height)를 받아야 한다. 없으면 `scrollable` pane 본문이 0 높이로 접히거나 페이지 전체가 스크롤된다(PanelLayout 과 같다).
- 예시: `<div class="settings"><SettingsShell /></div>` + `.settings { height: calc(100dvh - var(--v-layout-top, 64px)); }`. `--v-layout-top` 은 Vuetify 가 `VMain` 에 인라인으로 다는 앱바 높이다(프리셋 compact 에서 48px — 보고서 §2) — 앱바 높이를 숫자로 박지 않는다. AdminShell `banner` 슬롯에 내용이 있으면 그 높이만큼 넘친다.
- 「레이아웃 프리미티브」의 PanelLayout 행이 이 예시를 가리킨다.

## 3. 공개 API

### 3-1. `@ssworks/admin-ui/vite` (새 서브패스 — `src/vite.ts`)

```ts
export interface VuetifyLayerOrderTag {
  tag: 'style'
  children: string
  injectTo: 'head-prepend'
}

export interface VuetifyLayerOrderPlugin {
  name: string
  transformIndexHtml: () => VuetifyLayerOrderTag[]
}

/** vite.config 의 plugins 에 넣는다. index.html 은 고치지 않는다. */
export function vuetifyLayerOrder(): VuetifyLayerOrderPlugin
```

```ts
// vite.config.ts
import { vuetifyLayerOrder } from '@ssworks/admin-ui/vite'

export default defineConfig({
  plugins: [vuetifyLayerOrder(), vue(), vuetify()],
})
```

`package.json` exports 에 `"./vite": { "types": "./dist/vite.d.ts", "import": "./dist/vite.js" }` 를 더한다.

### 3-2. `SessionTable` · `useSessions`

```ts
// components/session/session-table.ts
export interface SessionLabelView {
  /** describeUserAgent 결과 */
  device: string
  /** formatDate 를 거친 마지막 활동 시각 */
  lastAccessAt: string
  showUser: boolean
  /** 그 행 버튼의 병합된 문구 */
  button: string
}

export interface SessionTableMessages {
  userColumn: string // '사용자'
  deviceColumn: string // '기기'
  ipColumn: string // 'IP'
  loginAtColumn: string // '로그인'
  lastAccessAtColumn: string // '마지막 활동'
  expireAtColumn: string // '만료'
  currentDevice: string // '이 기기'
  currentDeviceNote: string // '이 기기는 로그아웃으로 끝냅니다.'
  revokeButton: string // '끝내기'
  revokeButtonLabel: (row: SessionTableRow, view: SessionLabelView) => string
  revokeUserButton: string // '사용자 전체 끊기'
  revokeUserButtonLabel: (row: SessionTableRow, view: SessionLabelView) => string
}
```

- `SessionTable` prop `messages?: Partial<SessionTableMessages>`(기본 `() => ({})`). 안에서 `{ ...DEFAULT_SESSION_TABLE_MESSAGES, ...props.messages }` 로 병합한다.
- `SessionMessages<R>` 은 `SessionTableMessages` 를 넓힌다(대화상자 키 넷은 그대로). 옵션 `messages?: Partial<SessionMessages<R>>` 는 그대로라 쓰는 쪽은 깨지지 않는다.
- `SessionTableBindings<R>` 에 `messages: Partial<SessionTableMessages>` 를 더한다.

```ts
const all = useSessions({
  fetch,
  revoke,
  revokeUser,
  messages: { userColumn: '운영자', revokeUserButton: '운영자 전체 끊기' },
})
```

```vue
<SessionTable v-bind="all.table.value" show-user show-login-at />
<ConfirmDialog v-bind="all.confirmDialog.value" />
```

### 3-3. `PermissionMatrix`

props · 슬롯 · 타입 그대로. DOM 만 바뀐다(§2-4).

### 3-4. `index.ts`

- 더함: `type SessionTableMessages` · `type SessionLabelView`(`./components/session/session-table.js`).
- `vuetifyLayerOrder` 는 `index.ts` 에서 내보내지 않는다 — `./vite` 서브패스로만.

## 4. 의존성

- 새 의존 없음. `vite` 는 devDependency 그대로이고 peer 로 올리지 않는다(L4).
- admin-shared peer 하한(`>=0.4.0 <1.0.0`) 그대로 — 새 export 를 쓰지 않는다.

## 5. 파일

| 파일                                                               | 변경                                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/admin-ui/src/vite.ts`                                    | 새 파일 — 선언 상수 · `vuetifyLayerOrder` · 타입 둘                                                                                  |
| `packages/admin-ui/src/vite.test.ts`                               | 새 파일 — 선언 대조 · 플러그인 출력 · 엔트리 그래프                                                                                  |
| `packages/admin-ui/vite.config.ts`                                 | lib 엔트리 둘 · 출력 이름                                                                                                            |
| `packages/admin-ui/package.json`                                   | exports `./vite`                                                                                                                     |
| `packages/admin-ui/src/components/session/session-table.ts`        | `SessionLabelView` · `SessionTableMessages` · `DEFAULT_SESSION_TABLE_MESSAGES`(내부)                                                 |
| `packages/admin-ui/src/components/session/SessionTable.vue`        | `messages` prop · 문구를 병합 값에서                                                                                                 |
| `packages/admin-ui/src/composables/useSessions.ts`                 | `SessionMessages` 넓힘 · 대화상자 제목 기본값 · `table.messages`                                                                     |
| `packages/admin-ui/src/components/permission/PermissionMatrix.vue` | 한 표 · `<tbody>` · 빈 칸 · scoped CSS                                                                                               |
| `packages/admin-ui/src/index.ts`                                   | 타입 둘                                                                                                                              |
| 테스트 셋                                                          | `session-table.render.test.ts` · `useSessions.render.test.ts` · `permission-matrix.render.test.ts`                                   |
| `packages/admin-ui/README.md`                                      | 「Vuetify 프리셋」 · 「레이아웃 프리미티브」 · 「설정 셸」 · 「관리자 전체 목록」 · PermissionMatrix 표 · export 표 · Peer 의존 문단 |
| `.changeset/*.md`                                                  | admin-ui minor                                                                                                                       |
| `CLAUDE.md` · `docs/01-phase0.md` · `docs/HANDOFF.md`              | 진행 문서(§7)                                                                                                                        |
| `docs/verification/2026-10-18-admin-ui-ringside-feedback.md`       | 검증 기록(§8)                                                                                                                        |

## 6. 테스트 계약

### 6-1. `src/vite.test.ts` (node 환경)

- 테스트 전용 파서 `layerOrder(css): string[]` — 맨 앞의 `@layer` 문(`@layer a, b;` · `@layer a { @layer b, c; }` 의 블록 안 문 포함)만 읽어 처음 나타난 순서의 점 표기 목록으로 편다. 규칙이 든 첫 블록(예: `@layer vuetify-final.transitions { @keyframes … }`)에서 멈춘다. 쉼표 목록과 문 여럿(`@layer theme-base; @layer typography;`)을 같게 본다.
- 🔴 **선언 대조**: 킷 선언과 설치된 `vuetify/styles`(`createRequire(import.meta.url).resolve('vuetify/styles')` → `lib/styles/main.css`) 머리를 같은 파서로 편 목록이 같다. 기대 목록을 테스트에 손으로 적지 않는다 — 대조가 목적이다.
- 탐지기가 살아 있다: Vuetify 쪽 목록이 `vuetify-core.reset` · `vuetify-components` 를 품고 `vuetify-core.reset` 이 `vuetify-components` 보다 앞이다.
- 파서 자체: 보고서 §1 의 쉼표 형식과 4.2.6 의 문 여럿 형식이 같은 목록이 된다 · 규칙 블록에서 멈춘다.
- 플러그인 출력: `transformIndexHtml()` 이 태그 하나 · `tag: 'style'` · `injectTo: 'head-prepend'` · `children` 이 선언 그대로. `name` 이 L6.
- 🔴 **엔트리 그래프**: `src/vite.ts` 에서 상대 import 를 따라가도 바깥 패키지 · `.vue` · `.css` 가 0개다(admin-server `runner-graph.test.ts` 와 같은 방식 — 소스를 따라간다. `pnpm check` 는 build 보다 test 가 먼저라 `dist` 를 볼 수 없다). 대조: `src/index.ts` 그래프는 `vue` 를 끌어온다(탐지기가 살아 있다).

### 6-2. `session-table.render.test.ts`

- 기존 테스트는 고치지 않고 초록이다 — 기본 문구가 그대로라는 증거다.
- `messages` 일부만 덮으면 그 키만 바뀌고 나머지는 기본값이다(열 제목 · 칩 · 안내 · 버튼).
- `revokeUserButton` 만 바꾸면 버튼 글자와 접근 이름(`이름(아이디) 운영자 전체 끊기`)이 함께 바뀐다.
- 접근 이름 함수가 `view` 를 받는다 — `device` · `lastAccessAt`(formatDate 를 거침) · `showUser` · `button`.

### 6-3. `useSessions.render.test.ts`

- `messages: { userColumn, revokeUserButton }` 가 `table` 바인딩을 거쳐 표의 열 제목 · 버튼에 그려진다.
- 같은 두 키로 확인 창 제목이 남 · 본인 모두 `revokeUserButton` 을 따른다. 본문 · 확정 버튼 문구는 기본값 그대로다.
- `revokeUser` 대화상자 문구를 직접 주면 그것이 이긴다.
- `messages` 를 안 주면 `table.messages` 는 빈 객체다.

### 6-4. `permission-matrix.render.test.ts`

- "카테고리마다 표 하나" → `<table>` 하나 · 카테고리마다 `<tbody>` · 머리 줄의 `th[scope=rowgroup]` 가 카테고리 라벨, `th[scope=col]` 이 열 라벨 · 행 머리 `th[scope=row]` 가 행 라벨.
- 🔴 새 테스트: 열 수 2 · 4 인 카테고리를 섞어도 모든 `<tr>` 의 칸 수가 같다(5). `#row-extra` 를 주면 모두 6 이고 슬롯 내용이 늘 마지막 칸이다.
- `#row-extra` 열 수 테스트 둘은 머리 줄 칸 수로 바꾼다. 접근 이름 · 비활성 · `'*'` · 토글 · `canPick` 테스트는 그대로다.

## 7. 릴리스 · 문서

### 7-1. changeset (`@ssworks/admin-ui` minor — `fixed` 라 세 패키지 0.8.0 예상)

- `@ssworks/admin-ui/vite` 의 `vuetifyLayerOrder()` — 🔴 쓰는 쪽은 `vite.config` 의 `plugins` 맨 앞에 넣는다. `index.html` 은 고치지 않는다. 넣지 않으면 `<button>` VBtn 이 `size` · 굵기를 잃는다.
- `SessionTable` `messages` prop · `useSessions` 표 문구 키 · 공개 타입 `SessionTableMessages` · `SessionLabelView`.
- `PermissionMatrix` DOM: 카테고리마다 `<table>` → `<table>` 하나 + 카테고리마다 `<tbody>`. 표 단위로 DOM 을 재는 테스트는 고친다.
- README 「설정 셸」 높이 안내.

### 7-2. README (`packages/admin-ui/README.md`)

- 「Vuetify 프리셋」: 🔴 항목(L1 원인 한 줄 · import 순서로는 못 고침) · `vite.config` 예시 · `index.html` 은 손대지 않음 · CSP 한 줄(L8) · 킷 선언은 킷이 시험한 Vuetify 를 따름(L7).
- 「Peer 의존」 문단의 "서브패스 export 로 가르지 않는 대가다" 에 한 줄: `./vite` 는 Node 쪽 빌드 설정용이라 예외다.
- 「레이아웃 프리미티브」 PanelLayout 행 · 「설정 셸」(§2-5).
- 「관리자 전체 목록」: §3-2 예시 · 키 표 · S7 🔴.
- export 표의 `SessionTable` · `useSessions` 행에 새 타입, PermissionMatrix props 표의 `categories` 설명("한 표에 카테고리마다 머리 줄 + 행. 같은 순번 열이 카테고리를 넘어 한 줄. 열이 적은 카테고리는 끝 칸이 빔").

### 7-3. 진행 문서

- `CLAUDE.md` 진행표에 3h 행(완료 시) · `docs/01-phase0.md` §8.
- `docs/HANDOFF.md`
  - 「지금 상태」 표를 2026-10-18 로 — 제목 날짜 · admin-ui 행(3f · 3g · 3h, 0.6.0 · 0.7.0 Version Packages 머지 — 공개 여부는 플랜 실행 때 `npm view` 로 확인) · 검증 행 · 다음 플랜.
  - 「PR #3h 가 넘긴 것」:
    - **ringside 적용법**: ① 킷을 0.8.0 으로 올리고 `vite.config` 에 `vuetifyLayerOrder()`(index.html 은 그대로) ② 설정 셸 부모 `height: calc(100dvh - var(--v-layout-top, 64px))` ③ `useSessions({ messages: { userColumn: '운영자', revokeUserButton: '운영자 전체 끊기' } })` ④ PermissionMatrix 는 코드 변경 없음 — DOM 을 재는 테스트만 확인. pnpm 12 최소 공개 기간(1일) — 승인 하루 뒤 설치, 자동으로 붙은 예외는 커밋하지 않음.
    - **템플릿 세션 입력**: 0.x 핀 상향 · `vite.config.mts` 에 플러그인 · `settings.vue:26` · `teams.vue:130` 의 64px → `var(--v-layout-top, 64px)` · 감사 로그 · IP 접근 제어 페이지(「PR #3f/#3g 가 넘긴 것」) · PermissionMatrix DOM 을 재는 템플릿 테스트 확인.

## 8. 검증

- `pnpm check` 초록(lint → typecheck → test → build → check:dts) · `pnpm format:check`.
- 빌드 뒤 `dist/` 에 `index.js` · `vite.js` · `vite.d.ts` · `style.css` 가 있고 공유 청크가 없다(L5).
- `/smoke` — 짧은 `%TEMP%\aksh` 경로(긴 경로 문제). 모든 export 를 쓰고 `vite.config` 에 `vuetifyLayerOrder()` 를 넣어 `vue-tsc` · `vite build`. `dist/index.html` 의 `<head>` 첫 스타일 요소(`<style>` 또는 `<link rel=stylesheet>`)가 선언인지 본다.
- 개발 서버(`vite`)에서도 `document.styleSheets[0]` 이 선언인지 본다 — 보고서가 재현한 곳이 개발 서버다(스타일시트 0번이 `VApp.css`). L2 의 개발 서버 주장은 이것으로 잰다.
- 실브라우저(`vite preview`): `DataTablePanel` `#header-actions` 의 `<button>` VBtn(default) · 표 행의 `size="small"` `<button>` VBtn · `<a>` VBtn 의 계산된 글자 크기 · 굵기를 플러그인 있는 빌드와 뺀 빌드로 잰다(보고서 §1 표와 같은 꼴). 매트릭스는 카테고리마다 첫 액션 열 왼쪽 끝이 같은지, 설정 셸은 셸 높이 = 뷰포트 − 앱바인지 함께 잰다.
- 측정 도구: 이 세션에 브라우저 도구가 있으면 그것으로, 없으면 임시 앱에서 `playwright-core` + 설치된 Chrome(`channel: 'chrome'`) 스크립트로 — 저장소에 의존을 더하지 않는다.
- 결과는 `docs/verification/2026-10-18-admin-ui-ringside-feedback.md` 에 남긴다.

## 9. 리뷰 중점 (테스트가 못 잡는 것)

- 매트릭스 머리 줄이 thead 처럼 보이는지 · 카테고리 사이 간격 · 빈 칸의 테두리(라이트 · 다크).
- `<button>` VBtn 이 앱 전체(앱바 아이콘 · 사용자 메뉴 · 쪽 넘김)에서 기대 크기인지 — 스모크 앱 한 화면으로 대표한다.
- 플러그인을 넣고도 다른 `head-prepend` 플러그인이 Vuetify 레이어를 선언하는 경우는 없는지(L2).

## 10. 비범위

- admin-shared · admin-server, 템플릿 · ringside 저장소(읽기만).
- Node 26.
- 3g 후속 셋 · `useServerTable` dispose 가드 · 실서버 확인이 넘긴 결함 둘(기본 정렬 열 오름차순 · 조회 실패 직후 빈 상태).
- Vite 밖 번들러 · 빌드 때 소비자 Vuetify 대조 경고 · Playwright 시각 회귀 테스트(결정 ②).
- `describeUserAgent` 문구("기기 정보 없음" — admin-shared).
