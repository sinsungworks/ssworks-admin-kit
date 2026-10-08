---
'@ssworks/admin-ui': minor
---

확인 창 — `createConfirm` · `<AdminConfirm />` · `useConfirm`. `useDirtyGuard` 의 이탈 확인이 브라우저 기본 창 대신 킷 `ConfirmDialog` 로 뜬다.

- **소비자가 할 일(선택):** `plugins/confirm.ts` 에서 `export const confirm = createConfirm()`, `main.ts` 에 `app.use(confirm)`, `App.vue` 에 `<AdminConfirm />` 한 번(README 최소 배선). 안 하면 지금처럼 브라우저 기본 창이다.
- 이탈 확인 창: 제목 "화면 떠나기" · 기존 문구 · "머물기" / "떠나기". `DirtyGuardOptions.title` 로 제목을 바꾼다. 새로고침 · 탭 닫기 경고는 브라우저 기본 그대로다.
- 앱도 `useConfirm().ask({ title, message, reversible })` → `Promise<boolean>` 으로 쓸 수 있다. 한 번에 하나만 묻는다.
