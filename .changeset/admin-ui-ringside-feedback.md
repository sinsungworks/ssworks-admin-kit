---
'@ssworks/admin-ui': minor
---

ringside 보고 반영(PR #3h)

- 🔴 **Vuetify CSS 레이어 순서** — `@ssworks/admin-ui/vite` 의 `vuetifyLayerOrder()` 를 더했다. admin-ui 가 `vuetify/components` 를 import 해서 부품 CSS 가 `vuetify/styles` 의 레이어 순서 선언보다 먼저 들어가, reset 레이어가 `<button>` VBtn 의 `size` · 굵기를 이겼다(22px · 400). **쓰는 쪽은 `vite.config` 의 `plugins` 에 `vuetifyLayerOrder()` 를 넣는다(순서 무관)** — `index.html` 은 고치지 않는다(README 「Vuetify 프리셋」).
- `SessionTable` 문구 — `messages` prop(부분 덮어쓰기)과 `useSessions({ messages })` 의 표 문구 키(`userColumn` · `revokeUserButton` …)를 더했다. `table` 바인딩이 그대로 싣고, "사용자 전체 끊기" 확인 창 제목 · 접근 이름의 기본값은 `revokeUserButton` 을 따른다. 공개 타입 `SessionTableMessages` · `SessionLabelView`. 기본 문구는 그대로다.
- 타입 — `SessionMessages<R>` 가 `SessionTableMessages`(필수 키 12개)를 확장하고 `SessionTableBindings<R>` 에 필수 `messages` 가 생겼다. `SessionMessages<R>` 를 전부 적어 쓰거나 바인딩 객체를 손으로 만드는 코드(테스트 대역 등)는 컴파일이 깨진다. 옵션 `messages` 는 그대로 `Partial` 이라 보통의 사용은 영향이 없다.
- `PermissionMatrix` — 카테고리마다 `<table>` 을 그리던 것을 `<table>` 하나 + 카테고리마다 `<tbody>`(첫 줄이 카테고리 머리 줄)로 바꿨다. 같은 순번 열이 카테고리를 넘어 한 줄로 선다. props · 슬롯은 그대로다 — **표 단위로 DOM 을 재는 테스트(`querySelectorAll('table')` · `thead th`)는 고친다.**
- README 「설정 셸」 — 부모 높이 요구와 `calc(100dvh - var(--v-layout-top, 64px))` 예시.
