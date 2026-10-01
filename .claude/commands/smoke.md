---
description: 패키지를 pnpm pack 으로 묶어 임시 소비 앱(Vite + vue + vuetify + vite-plugin-vuetify)에 설치하고 vue-tsc·vite build 를 돌립니다. 발행 형태(exports 맵·d.ts·style.css)를 검증합니다.
---

패키지 발행 형태를 소비자 입장에서 검증해줘.

1. `pnpm build` 뒤 `pnpm --filter @ssworks/admin-shared pack` · `pnpm --filter @ssworks/admin-ui pack` 으로 tarball 을 임시 폴더(OS 임시 디렉터리 아래 `admin-kit-smoke/`)에 만든다.
2. 그 폴더에 최소 Vite 앱을 만든다 — `vue` · `vuetify` · `vite-plugin-vuetify`(autoImport) · `@vitejs/plugin-vue` · `vue-tsc`, 그리고 tarball 둘을 `file:` 로 의존한다.
3. `App.vue` 에서 `@ssworks/admin-ui` 의 **모든 export** 를 한 번씩 쓰는 컴포넌트를 만든다(`import '@ssworks/admin-ui/style.css'` 포함). `definePermissions` 로 카탈로그를 만들고 `createUsePermission<Permission>` 에 타입 인자로 넘겨 타입이 좁혀지는지도 본다.
4. `pnpm install` → `vue-tsc --noEmit` → `vite build`. 셋 다 통과해야 한다.
5. 결과만 보고한다: 통과/실패, 실패면 어느 export 가 어떤 타입·런타임 오류를 냈는지. 임시 폴더는 지운다.
