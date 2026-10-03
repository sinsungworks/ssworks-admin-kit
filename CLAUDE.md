# CLAUDE.md

이 파일은 Claude Code 가 이 저장소를 다룰 때 참고하는 가이드입니다.

> **처음 들어온 세션은 `docs/HANDOFF.md` 부터 읽는다.** 지금 상태, 첫 세션에서 할 일, 현재 플랜이 거기 있다.

## 이 저장소가 무엇인가

관리자 페이지 공통 코드를 npm 패키지로 꺼낸 **pnpm 모노레포**다. 소비자는 신규 웹 서비스의 관리자 앱(Vue 3 + Vuetify 4 SPA)과 API(NestJS + Kysely)다. 네 참조 프로젝트(kim5257-crm-v5 · ssworks-axion-admin · ssworks-gise-home · hangang-home)에 복사-수정으로 퍼져 있던 코드가 출처다.

| 경로                    | 패키지                  | 성격                                                               |
| ----------------------- | ----------------------- | ------------------------------------------------------------------ |
| `packages/admin-shared` | `@ssworks/admin-shared` | 프레임워크 무의존. 브라우저·NestJS 양쪽이 import 한다              |
| `packages/admin-ui`     | `@ssworks/admin-ui`     | Vue 3 + Vuetify 4 컴포넌트·composable. vue·vuetify 는 peer         |
| `packages/admin-server` | `@ssworks/admin-server` | NestJS 11 모듈 (Phase 2 — 골격만)                                  |
| `docs/`                 | —                       | 검토·Phase 0 대조 보고. **설계 근거는 코드 주석과 이 폴더에 있다** |

## 명령어

```bash
pnpm install
pnpm check                              # lint → typecheck → test → build
pnpm test / pnpm test:watch             # vitest (워크스페이스 전체)
pnpm --filter @ssworks/admin-ui test    # 패키지 하나
pnpm lint:fix && pnpm format
pnpm changeset                          # 공개 API 변경 시 반드시
```

`admin-ui` 는 `@ssworks/admin-shared` 를 **`dist/` 로** import 한다(소스가 아니다). 그래서 root `prepare` 가 `pnpm install` 직후 admin-shared 를 빌드한다 — 없으면 새 체크아웃·CI 에서 typecheck·test 가 "Cannot find module" 로 깨진다. **admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야** admin-ui 쪽에 보인다.

## 실행 환경

이 저장소는 **Windows(주 작업 PC) 와 Linux(CI · Cowork 컨테이너) 양쪽**에서 개발한다.

- **크로스 플랫폼 도구 우선**: `pnpm`·`node`·`npx`·vitest 처럼 양쪽에서 같은 명령을 쓴다. `rm`·`cp`·`mv`·`cat`·`grep`·`find`·`touch` 같은 Unix 명령 대신 전용 도구(Glob · Grep · Read · Edit · Write)를 쓴다.
- **`/dev/null` 금지 (CRITICAL)**: Windows 에서 `> /dev/null`·`2>/dev/null` 은 출력을 버리지 않고 작업 디렉터리에 **`NUL` 이라는 실제 파일**을 만든다. 출력 억제 자체를 피한다. 저장소 루트에 `NUL` 이 보이면 그 결과이니 지운다(`.gitignore` 에 올려 두었다).
- **개행은 LF**: `.gitattributes` 가 `eol=lf` 를 강제한다. 파일을 python 등으로 다시 쓰지 않는다(개행이 뒤집힌다). prettier `--check` 가 체크아웃 직후 빨갛다면 `git add --renormalize .`.
- **npm 스크립트의 글롭·인용부호**: Windows `cmd.exe` 는 작은따옴표를 인용부호로 보지 않는다. `package.json` scripts 에 `'./packages/*'` 같은 글롭을 넣지 않는다 — `pnpm -r` 로 충분하다.
- 참조 프로젝트는 이 저장소의 **형제 폴더**다: `../hangang-home` · `../ssworks-gise-home` · `../ssworks-axion-admin` · `../kim5257-crm-v5` · `../kim5257-project-template`. 읽기만 한다 — 그쪽 파일을 고치지 않는다.

## Claude Code 도구

- `.claude/settings.json`: 저장소 공용 허용 목록. `pnpm`·`git`(push 제외)·`vitest` 는 묻지 않는다. **`git push` · `pnpm release` · `npm publish` 는 거부** — 발행은 release 워크플로, push 는 사람이.
- `/check` — `pnpm check` 를 돌리고 실패만 요약. `/port <참조 파일>` — 참조 프로젝트 파일을 패키지 규약으로 옮기는 절차. `/smoke` — 패킹 tarball 을 임시 소비 앱에서 typecheck·build.
- 플랜·스펙은 superpowers 규약으로 `docs/superpowers/{plans,specs}/YYYY-MM-DD-<name>.md` 에 둔다. 플랜은 `executing-plans` 또는 `subagent-driven-development` 로 Task 단위로 실행한다.
- 커밋 메시지: 한국어 conventional commits(`feat(admin-ui): …`), 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`.

## 패키지 경계 — 무엇을 어디에 두는가

- **A (패키지)**: 프로젝트마다 **같아야 하는 것**. 레이아웃 프리미티브, 다이얼로그, 표, 토스트, 권한 판정, 가드, 인증 서비스, 조직 모듈.
- **B (템플릿 — 이 저장소 밖, `kim5257-project-template` `preset/admin`)**: 프로젝트마다 **달라야 마땅한 것**. 테마 색, 메뉴, 권한 카탈로그 내용, 페이지 조립, `main.ts`, `App.vue`, `RouteMeta` 증강.
- **X (제외)**: 특정 프로젝트 도메인(CRM 스케줄, axion 파트너, gise 참석자 …).

의심되면 **B 로 내린다.** 네 프로젝트 요구를 전부 옵션으로 흡수하려 들지 않는다 (`docs/01-phase0.md` §5 리스크).

## 코드 규약

### 공통

- 포맷: prettier — 세미콜론 없음, 작은따옴표, 100자, `vueIndentScriptAndStyle`. `pnpm format` 으로 맞춘다.
- import 는 `import type` 을 분리한다(eslint `consistent-type-imports`). 단 `admin-server/src` 는 NestJS DI 메타데이터 때문에 예외.
- 내부 상대 import 는 `.js` 확장자를 쓴다(`./data-table.js`). `.vue` 는 그대로.
- `console.log` 금지(라이브러리가 소비자 콘솔을 더럽힌다). `warn`·`error` 만.
- 정본에서 가져온 파일은 머리 주석에 **출처**(`정본: hangang-home apps/admin/src/...`)와 **바꾼 점**을 적는다. 네 프로젝트가 그렇게 해 왔고, 그 주석이 이 저장소의 설계 기록이다.
- `🔴` 로 시작하는 주석은 "지우면 사고가 나는 이유" 다. 코드를 바꿀 때 그 주석이 아직 참인지 먼저 본다.

### `@ssworks/admin-shared`

- `vue`·`vuetify`·`@nestjs/*`·`node:*`·`axios` 를 import 하지 않는다 (eslint 가 막는다).
- 카탈로그(권한·에러 코드·scope)는 **팩토리**로 제공하고 내용은 소비자가 넘긴다. 패키지가 권한 키를 하드코딩하지 않는다.
- 결정된 프로토콜(`docs/01-phase0.md` §4): 응답 봉투 `{success, data}` / `{success:false, code, message, details?}`, bigint 는 `"BigInt(n)"` 래퍼, 쓰기 보호는 revision 기본·재인증 옵션, 권한 가드 fail-closed, 빈 권한 인자는 false.

### `@ssworks/admin-ui`

- SFC 는 **Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import** 한다. 소비자의 auto-import 에 기대지 않는다.
- 스타일은 순수 CSS `<style scoped>` (sass 없음). 빌드하면 `dist/style.css` 하나로 모인다.
- 전역 CSS(`vuetify/styles`, `@mdi/font`)는 패키지가 import 하지 않는다 — 소비자의 `plugins/vuetify.ts` 몫.
- 스토어·라우터를 import 하지 않는다. 필요한 것은 props·provide/inject·게터 주입으로 받는다(`createUsePermission(granted)` · `createToast()`).
- `v-model` 은 기본 `modelValue` 하나. `v-model:show` 같은 이름 있는 모델은 쓰지 않는다(페이지·정렬 같은 복수 모델은 예외).
- `:loading` 은 클릭을 안 막는다. 제출 버튼은 항상 `:disabled` 와 한 벌이다.
- Boolean prop 에 `undefined` 기본값을 주지 않는다(Vue 가 false 로 캐스팅한다). 3상태가 필요하면 `boolean | 'auto'` 처럼 문자열을 섞는다.
- 테스트: `src/**/*.test.ts`. DOM 이 필요하면 파일 머리에 `// @vitest-environment happy-dom`. 오버레이(VDialog·VSnackbar)를 여는 테스트는 `installVisualViewport()` 를 모듈 최상단에서 부른다. 색·높이는 못 잰다 — 구조·클래스·문구·속성을 잰다. 테스트 전용 `data-testid` 를 심지 않는다 — 사람이 읽는 글자와 `name` 으로 찾는다.

### `@ssworks/admin-server` (Phase 2)

- ESM 전용, `module: NodeNext`, 데코레이터 메타데이터 켬.
- 코어 테이블 타입은 `AdminDatabase` 로 export 하고 소비자가 `interface Database extends AdminDatabase` 로 확장한다.
- 사용자 테이블 컬럼 차이는 `AUTH_REPOSITORY` 교체로 흡수한다. 컬럼 매핑 옵션을 만들지 않는다.

## 변경 흐름

1. 브랜치에서 작업 → `pnpm check` 초록.
2. 공개 API 가 바뀌면 `pnpm changeset` (patch/minor/major 와 소비자가 고칠 것을 적는다).
3. PR → CI → `main` 머지 → release 워크플로가 Version Packages PR 을 연다 → 머지하면 npm 에 **스테이징** → 사람이 `pnpm stage approve` 로 2FA 승인해야 공개(`.changeset/README.md`).

## 진행 상태와 다음 단계

| 단계                                                                                                 | 상태                      | 문서                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 — 정본·확장점·A/B/X·프로토콜 결정                                                            | 완료                      | `docs/01-phase0.md`                                                                                                                      |
| Phase 1 PR #1 — admin-shared · admin-ui 프리미티브                                                   | 완료(142 테스트)          | `docs/01-phase0.md` §8                                                                                                                   |
| Phase 1 PR #2 — 셸·내비게이션·가드·API 클라이언트·스토어                                             | 완료(admin-ui 348 테스트) | 스펙 `docs/superpowers/specs/2026-10-01-admin-ui-shell-design.md` · 플랜 `docs/superpowers/plans/2026-10-01-admin-ui-shell.md`           |
| Phase 1 PR #3a — `useServerTable` · `useQuerySyncedFilter`(+코덱) · `useWriteFlow` · `toFieldErrors` | 완료                      | 스펙 `docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md` · 플랜 `docs/superpowers/plans/2026-10-03-admin-ui-list-write.md` |
| **Phase 1 PR #3b~3e — 역할·설정 / 계정·세션 / 조직(he-tree) / 약관(CodeMirror)**                     | **다음**                  | 위 스펙 §2-1 · `docs/phase0-reports/fe-pages.md` §2                                                                                      |
| Phase 2 — admin-server                                                                               | 대기                      | `docs/01-phase0.md` §2-3 · §3-2, `docs/phase0-reports/be-*.md`                                                                           |
| 템플릿 `kim5257-project-template` `preset/admin` + `.claude/skills/admin-scaffold`                   | 대기                      | `docs/00-admin-common-review.md` §3                                                                                                      |

`docs/01-phase0.md` §8 표를 단계가 끝날 때마다 갱신한다.
