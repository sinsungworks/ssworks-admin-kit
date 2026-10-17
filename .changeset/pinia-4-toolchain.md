---
'@ssworks/admin-ui': minor
'@ssworks/admin-shared': patch
'@ssworks/admin-server': patch
---

**쓰는 쪽이 할 일:** admin-ui 를 쓰는 앱은 `pnpm add pinia@^4 @vue/devtools-api@^8` — admin-ui 의 peer `pinia` 가 `^4.0.0` 이 됐다(Pinia 3 은 더 받지 않는다). `@vue/devtools-api` 는 Pinia 4 의 필수 peer 다(admin-ui 는 import 하지 않아 peer 로 두지 않는다). admin-shared · admin-server 만 쓰는 앱은 할 일 없음.

admin-ui: peer `pinia ^4.0.0`. 코드는 바뀌지 않았다 — Pinia 4 의 변경은 ESM 전용 · devtools-api 8 뿐이다(4.1.0 에서 시험).

admin-shared · admin-server: TypeScript 6.0.3 으로 빌드한 dist · d.ts. 동작 변경 없음. 저장소 도구는 TypeScript 6.0.3 · Vitest 5 · ESLint 10 · typescript-eslint 8.71 이고, 실 DB 테스트는 MariaDB 11.4 · 12.3 두 버전에서 돈다.
