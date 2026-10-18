# admin-kit 0.5.0 보고 — ringside 관리자 조립에서 나온 것 (2026-10-18)

ringside(링사이드) 관리자 레인이 킷 0.5.0을 README · 템플릿 `kim5257-project-template` `preset/admin` 배선대로 조립하고 브라우저로 확인하다 나온 것이다. ringside는 `node_modules`를 고치거나 킷 코드를 복사하지 않았다. 고칠 곳은 킷 저장소(README · 패키지)와 템플릿이다.

| # | 무엇 | 종류 | 고칠 곳 | 급한 정도 |
| --- | --- | --- | --- | --- |
| 1 | Vuetify CSS 레이어 순서가 뒤집혀 `<button>` VBtn이 `size` · 굵기를 잃는다 | 결함(배선 안내) | admin-ui README "Vuetify 프리셋" · 템플릿 `index.html` | 🔴 높음 — 모든 화면 |
| 2 | 템플릿 `settings.vue`의 `64px`가 킷 프리셋 앱바(48px)와 어긋나고, README "설정 셸"에 부모 높이 요구가 없다 | 문서 · 템플릿 | admin-ui README "설정 셸" · 템플릿 `pages/settings.vue` | 중간 |
| 3 | `SessionTable`의 "사용자" 열 · "사용자 전체 끊기" 버튼 문구를 바꿀 방법이 없다 | 빠진 기능 | admin-ui `SessionTable` | 낮음 |
| 4 | `PermissionMatrix`가 카테고리마다 표를 따로 그려 열 위치가 어긋난다 | 보기 | admin-ui `PermissionMatrix` | 낮음 |

환경(모두 같다): `@ssworks/admin-ui` · `admin-shared` · `admin-server` 0.5.0, Vuetify 4.2.4, Vue 3.5.44, Vite 8.3.4, Chrome 155(Windows). `createAdminVuetify()`는 옵션 없이 부른다.

## 1. 🔴 Vuetify CSS 레이어 순서가 뒤집힌다

### 재현

1. README "Vuetify 프리셋"대로 `plugins/vuetify.ts`를 둔다 — 템플릿 `preset/admin`과 같다.

   ```ts
   import { createAdminVuetify } from '@ssworks/admin-ui'
   import '@mdi/font/css/materialdesignicons.css'
   import 'vuetify/styles'

   export default createAdminVuetify()
   ```

2. `main.ts`도 템플릿과 같은 순서다 — `@/api/client`(admin-ui의 `createApiClient`) → `@/plugins` → `@/router` → … → `@ssworks/admin-ui/style.css`.
3. `DataTablePanel`의 `#header-actions`에 버튼 둘을 둔다.

   ```vue
   <VBtn prepend-icon="mdi-refresh" variant="text" @click="reload">새로 고침</VBtn>
   <VBtn prepend-icon="mdi-plus" to="/users/new">운영자 추가</VBtn>
   ```

### 기대 · 실제

| 버튼 | 그려지는 태그 | 기대 | 실제 |
| --- | --- | --- | --- |
| 새로 고침(`@click`, size default) | `<button>` | 14px · 500 | **22px · 400**(부모 `VCardTitle` 크기를 받음) |
| 운영자 추가(`to`, size default) | `<a>` | 14px · 500 | 14px · 500 |
| 퇴사 처리(`@click`, `size="small"`, 표 행 안) | `<button>` | 12px · 500 | **14px · 400** |
| 편집(`to`, `size="small"`, 표 행 안) | `<a>` | 12px · 500 | 12px · 500 |

`--v-btn-size` 변수는 네 버튼 모두 기대값(0.875rem · 0.75rem)인데, `<button>`만 그 값을 쓰지 않는다. 같은 화면의 `<button>` VBtn 전부가 `font-weight` 500 → 400, `line-height` · `letter-spacing`도 기대와 다르다(앱바 아이콘 · 사용자 메뉴 · 적용 · 조건 지우기 · 쪽 넘김 버튼 포함). 입력 칸(`input`)은 바뀌지 않았다.

### 원인

- admin-ui 엔트리(`dist/index.js`)가 `vuetify/components`에서 VAlert · VAppBar · VBtn … 을 import한다. 그 부품 JS가 자기 CSS(`@layer vuetify-components { … }`)를 들인다.
- 앱이 admin-ui를 처음 import하는 시점(`main.ts`의 `@/api/client`, 늦어도 `plugins/vuetify.ts` 첫 줄)이 `import 'vuetify/styles'`보다 앞선다. 그래서 부품 CSS가 `vuetify/styles`(레이어 순서 선언 `@layer vuetify-core { @layer reset, base }` …)보다 먼저 문서에 들어간다.
- 캐스케이드 레이어 순서는 처음 나타난 순서로 정해진다. 결과는 `vuetify-components` → `vuetify-core` 순이 되어, reset 레이어의 `button, input, optgroup, select, textarea { font: inherit; font-size: inherit }`가 `.v-btn--size-default { font-size: var(--v-btn-size) }`를 이긴다. `<a>`는 그 reset 선택자에 걸리지 않아 멀쩡하다.
- 개발 서버: 스타일시트 0번이 `VApp.css`(`vuetify-components`), `vuetify/styles`(`main.css`)는 116번째다.
- 운영 빌드도 같다: `dist/index.html`의 첫 link `VSpacer-*.css`가 `vuetify-components`로 시작하고, `vuetify-core`는 세 번째 link `index-*.css`에서야 나온다.

### 처방과 검증

Vuetify 문서(Styles › CSS Layers)가 이 경우를 다룬다 — Vuetify 스타일시트는 어떤 순서로든 들어올 수 있으니, 다른 스타일시트보다 먼저 레이어 순서를 선언하라고 한다(`public/layers.css`를 `index.html`의 `<head>` 맨 앞에서 link).

```css
/* public/layers.css */
@layer vuetify-core {
  @layer reset, base;
}
@layer vuetify-components;
@layer vuetify-overrides;
@layer vuetify-utilities {
  @layer theme-base, typography, helpers, theme-background, theme-foreground;
}
@layer vuetify-final {
  @layer transitions, trumps;
}
```

```html
<head>
  <link rel="stylesheet" href="/layers.css" />
  …
</head>
```

이 선언을 개발 화면의 `<head>` 맨 앞에 끼워 넣고 다시 재면 기대값으로 돌아온다(파일은 바꾸지 않고 페이지에서만 확인했다).

| 버튼 | 선언 전 | 선언 후 |
| --- | --- | --- |
| 새로 고침 | 22px | 14px |
| 퇴사 처리 · 비밀번호 초기화(`small`) | 14px | 12px |
| 모든 `<button>` VBtn의 굵기 | 400 | 500 |

### 킷에 바라는 것

1. admin-ui README "Vuetify 프리셋"에 🔴 항목: admin-ui가 `vuetify/components`를 들이므로 import 순서로는 레이어 순서가 보장되지 않는다 — 앱 `index.html`에서 레이어 순서를 먼저 선언한다. import 순서를 바꾸는 방법(`vuetify/styles`를 `main.ts` 첫 줄로)은 운영 빌드의 청크 순서까지 보장하는지 확인하지 않았고, Vuetify 문서도 그 방법 대신 선언을 권한다.
2. 템플릿 `preset/admin`에 `public/layers.css`와 `index.html` link.
3. (선택) 레이어 선언 파일을 킷이 내보내면(예: `@ssworks/admin-ui/layers.css`) 프로젝트마다 Vuetify 레이어 이름을 베끼지 않아도 된다. 다만 `<head>` 맨 앞 link라 번들러를 거치지 않는 경로가 필요하다.
4. 킷 데모 · 시각 테스트가 있다면 `<button>` VBtn의 글자 크기 단언 하나로 되돌아옴을 막을 수 있다.

ringside는 아직 레이어 선언을 넣지 않았다(킷 안내가 정해지면 같은 모양으로 넣는다).

## 2. 설정 셸 높이 — README에 요구가 없고, 템플릿의 `64px`가 프리셋과 어긋난다

- `SettingsShell`은 부모가 정한 높이(definite height)를 받아야 한다. 이 요구는 템플릿 `pages/settings.vue` 머리 주석에만 있고, admin-ui README "설정 셸"(props 표 · 목록)에는 없다.
- 템플릿은 `.settings { height: calc(100dvh - 64px) }`로 앱바 높이를 64px로 박아 둔다. `createAdminVuetify()`의 compact density에서 앱바는 48px이다(`--v-layout-top: 48px`, `v-toolbar--density-compact`). 그대로 옮기면 셸이 16px 짧아 화면 아래에 빈 띠가 남는다.
- ringside는 `height: calc(100dvh - var(--v-layout-top, 64px))`로 고쳐 확인했다 — 뷰포트 1304px에서 셸 1256px로 꼭 맞는다.

바라는 것: README "설정 셸"에 부모 높이 요구와 `--v-layout-top`을 쓰는 예를 적고, 템플릿 `settings.vue`도 같은 식으로 바꾼다.

## 3. `SessionTable` 문구를 바꿀 방법이 없다

- 재현: `<SessionTable v-bind="all.table.value" show-user show-login-at>`(README "관리자 전체 목록" 예시 그대로).
- 실제: 열 제목 "사용자", 행 버튼 "사용자 전체 끊기", 그 aria-label "`이름(아이디)` 사용자 전체 끊기"가 `SessionTable` 안에 고정돼 있다. 확인 대화상자 문구는 `useSessions({ messages })`(`SessionMessages`)로 바꿀 수 있는데, 표 쪽에는 prop도 슬롯도 없다.
- 기대: 프로젝트 용어로 바꿀 수 있다. ringside는 운영 계정을 "운영자"라 부르고, 서비스 회원(`members`)과 헷갈리지 않게 "사용자"를 피한다. 대화상자 문구만 바꾸면 버튼과 대화상자 제목이 서로 다른 말을 쓰게 된다.
- 제안: `SessionTable`에 문구 prop(예: `labels: { user, revokeUser }`, aria-label도 이 값으로)을 두거나, `useSessions`의 `messages`가 표 문구까지 맡게 한다.

## 4. `PermissionMatrix` 카테고리끼리 열이 어긋난다

- 재현: 카테고리 셋(행 이름 길이가 다르고, 열은 각각 읽기 · 편집 / 읽기 · 끊기 / 읽기 · 편집).
- 실제: 카테고리마다 `v-table`이 따로 있고 `table-layout: auto` · `colgroup` 없음이라, 같은 순번 열이 카테고리마다 다른 자리에 선다. 뷰포트 2558px에서 첫 액션 열(읽기)의 왼쪽 끝이 1557px · 1395px · 1952px였다.
- 기대: 카테고리를 넘어 같은 순번 열이 한 줄로 선다 — 위아래로 훑으며 체크 상태를 비교하기 쉽다.
- 제안: 첫 열(자원) 너비를 고정하고 액션 열을 같은 너비로 두거나(`table-layout: fixed` + `colgroup`), 열 너비 prop을 둔다.

## 결함 아님으로 정리한 것(참고)

- 내 계정 비밀번호 변경에서 현재 비밀번호를 틀리면 `login_fail_count`가 오르고 감사 행은 없다 — admin-server README "로그인 판정 · 강제 변경 · 재인증"에 정해진 동작(로그인 · 비밀번호 변경 · 재인증이 한 카운터)이라 보고하지 않는다.
- 퇴사한 계정에도 "비밀번호 초기화"가 켜져 있는 것은 페이지 코드(템플릿 `users.vue`)의 선택이고, 퇴사 예정(아직 근무 중)인 사람에게는 필요하다.
