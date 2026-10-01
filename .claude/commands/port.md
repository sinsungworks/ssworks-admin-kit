---
description: 참조 프로젝트(../hangang-home 등)의 파일을 이 패키지로 옮깁니다. 명시 import · 의존 주입 · 정본 헤더 · 테스트 동반 규약을 적용합니다.
---

인자로 받은 참조 파일 `$ARGUMENTS` 를 이 저장소의 패키지로 옮겨줘.

## 절차

1. **정본 확인** — `docs/01-phase0.md` §1 정본 확정표와 `docs/phase0-reports/` 에서 그 역할의 정본이 어느 프로젝트인지, 다른 사본에서 흡수할 개선점이 무엇인지 먼저 읽는다. 인자로 받은 파일이 정본이 아니면 정본 경로를 제안하고 멈춘다.
2. **읽기** — 정본 파일과 같은 역할의 다른 사본(crm-v5 · axion · gise · hangang)을 전부 읽는다. 참조 프로젝트는 `../<project>/` 에 있다(이 저장소와 형제 폴더).
3. **옮기기** — 패키지 규약(`CLAUDE.md` 코드 규약)을 적용한다:
   - Vuetify 컴포넌트는 `vuetify/components` 에서 명시 import. vue API 도 명시 import.
   - `@/stores/*` · `@<scope>/shared` · `../router` 같은 프로젝트 의존은 props · provide/inject · 게터 주입으로 끊는다.
   - `v-model:show` → 기본 `modelValue`. 문구는 prop 으로 덮어쓸 수 있게 한다(기본값은 한국어 원문).
   - 머리 주석에 `정본: <project> <path>` 와 바꾼 점을 적는다. 원문의 🔴 주석은 아직 참이면 그대로 둔다.
   - 스타일은 순수 CSS `<style scoped>`.
4. **테스트** — 정본에 테스트가 있으면 `*.test.ts` 로 함께 옮긴다(`// @vitest-environment happy-dom`, `src/test/setup.ts` 의 `vuetify`·`installVisualViewport`·`buttonByText` 사용). 없으면 공개 계약(props · emit · 슬롯 · 문구)별로 새로 쓴다.
5. **export** — `src/index.ts` 에 더하고 README 표에 한 줄 적는다.
6. `pnpm check` 가 초록인지 확인하고, 공개 API 가 늘었으니 `.changeset/` 에 항목을 더한다(기존 미발행 changeset 이 있으면 그 파일에 줄을 더한다).
