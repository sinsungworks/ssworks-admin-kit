# 검증 — admin-ui PR #3h ringside 보고 반영 (2026-10-18)

스펙 `docs/superpowers/specs/2026-10-18-admin-ui-ringside-feedback-design.md` §8.

## 1. 저장소

- `pnpm check`: 초록(exit 0) — 테스트 167 파일 · 2003 테스트 통과(`pnpm test`)
- `pnpm format:check`: 통과(`All matched files use Prettier code style!`)
- `dist/`(admin-ui): 최상위 `.js` 는 `index.js` · `vite.js`, `vite.d.ts` 있음(`vuetify/layer-order.d.ts` 도 있음)

## 2. 스모크(`$LOCALAPPDATA/Temp/aksh`)

- tarball: `ssworks-admin-shared-0.7.0.tgz` · `ssworks-admin-ui-0.7.0.tgz`
- vue-tsc(`vite.config.ts` 포함): 통과(출력 없음) · vite build: 통과(두 번 — 플러그인 있음 · `NO_LAYERS=1` 없음) · peer 경고: 없음(`pnpm peers check` → `No peer dependency issues found`)
- 앱은 `@ssworks/admin-ui` · `@ssworks/admin-shared` 를 `import * as` 로 받아 export 전체를 타입 검사 · 번들에 넣었다(export 하나씩 쓰는 컴포넌트는 만들지 않았다)
- pnpm 12 `ERR_PNPM_IGNORED_BUILDS`(vue-demi 빌드 스크립트)는 설치 자체와 무관하게 나왔다 — 의존은 설치됐고 무시했다
- head 첫 스타일(`check-head.mjs`):
  - `dist/index.html → <style>@layer vuetify-core {   @layer reset, bas`
  - `dist/measure.html → <style>@layer vuetify-core {   @layer reset, bas`
  - `dist-noplugin/measure.html → <link rel="stylesheet" crossorigin href="/assets`

## 3. 실브라우저(Chrome 155.0.8059.79, 1600×1000)

| 버튼             | 태그   | 개발 서버    | 빌드         | 빌드(플러그인 없음) |
| ---------------- | ------ | ------------ | ------------ | ------------------- |
| 새로 고침        | button | 14px · 500   | 14px · 500   | 22px · 400          |
| 운영자 추가      | a      | 14px · 500   | 14px · 500   | 14px · 500          |
| 퇴사 처리(small) | button | 12px · 500   | 12px · 500   | 14px · 400          |
| 편집(small)      | a      | 12px · 500   | 12px · 500   | 12px · 500          |

- 첫 스타일시트: dev · build 는 `<style>@layer vuetify-core {\n  @layer reset, bas`, noplugin 은 `<link rel="stylesheet" crossorigin="" href="/ass`
- 매트릭스 첫 액션 열 왼쪽 끝: 627.140625 · 627.140625 · 627.140625(세 tbody 모두, dev · build · noplugin 같음)
- 설정 셸: `--v-layout-top` 48px · 높이 952 = 뷰포트 1000 − 48(dev · build · noplugin 모두)

## 4. 남은 것

- 없음
