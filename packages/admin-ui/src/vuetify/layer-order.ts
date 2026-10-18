// Vuetify CSS 레이어 순서 선언 — vite.ts 의 플러그인이 <head> 맨 앞에 넣는다.
//
// 정본: Vuetify 4.2.6 lib/styles/main.css 머리(= lib/styles/generic/_layers.scss)
// 바꾼 점: 문자열 상수로 옮겼다. 내용은 그대로다(PR #3h 스펙 L3).
//
// 🔴 손으로 고치지 않는다. 킷이 Vuetify 를 올려 vite.test.ts 의 대조가 빨개지면, 설치된 vuetify 의
//    lib/styles/main.css 머리(규칙이 든 첫 블록 앞까지)를 다시 옮긴다.
// 🔴 공개하지 않는다 — @ssworks/admin-ui/vite 의 플러그인만 공개다. 이 파일은 아무것도 import 하지 않는다.

export const VUETIFY_LAYER_ORDER = `@layer vuetify-core {
  @layer reset, base;
}
@layer vuetify-components;
@layer vuetify-overrides;
@layer vuetify-utilities {
  @layer theme-base;
  @layer typography;
  @layer helpers;
  @layer theme-background;
  @layer theme-foreground;
}
@layer vuetify-final {
  @layer transitions, trumps;
}`
