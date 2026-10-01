# HANDOFF — 2026-10-01

Cowork 세션에서 Claude Code 로 넘기는 인계 문서. 새 세션은 이 파일 → `CLAUDE.md` → 현재 플랜 순으로 읽는다.

## 지금 상태

| 항목                    | 상태                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 저장소                  | `main` 에 첫 커밋. 원격 `origin` = `https://github.com/sinsungworks/ssworks-admin-kit.git`(확인됨). **push 는 아직** — 사람이 한다                                                                                                                                        |
| `@ssworks/admin-shared` | Phase 1 완료. 54 테스트. `tsc` 빌드                                                                                                                                                                                                                                       |
| `@ssworks/admin-ui`     | Phase 1 **PR #1**(프리미티브·다이얼로그·표·토스트·Vuetify 프리셋·권한 훅) · **PR #2**(셸·메뉴·가드·API 클라이언트·스토어·composable) 구현 완료 — PR #2 는 `main` 에 로컬 병합. 348 테스트. vite lib 빌드. 패킹 tarball 을 별도 Vite+vuetify 앱에서 typecheck·build 검증함 |
| `@ssworks/admin-server` | 골격만. `private: true` 라 발행되지 않음. Phase 2                                                                                                                                                                                                                         |
| 검증                    | 컨테이너(Linux, Node 22)와 Windows(Node 24) 양쪽에서 `pnpm check`·`format:check` 초록(PR #1 시점 142 테스트). Windows 첫 실행에서 새 체크아웃 결함 하나를 고쳤다(아래)                                                                                                    |
| 문서                    | `docs/00-admin-common-review.md`(방안 검토) · `docs/01-phase0.md`(정본·확장점·A/B/X·프로토콜 결정·§8 진행) · `docs/phase0-reports/`(대조 보고 5편)                                                                                                                        |
| 다음 플랜               | PR #3 — `docs/phase0-reports/fe-pages.md` §2 (플랜은 아직 없다). 직전 PR #2: `docs/superpowers/plans/2026-10-01-admin-ui-shell.md` · 스펙 `docs/superpowers/specs/2026-10-01-admin-ui-shell-design.md`                                                                    |

## 첫 세션에서 할 일 (순서대로)

1. ~~**설치·검증**~~ — **완료(2026-10-01).** 예상했던 경로 구분자·개행 문제는 없었다. 실제로 깨진 것은 Windows 와 무관한 **새 체크아웃 결함**: admin-ui 가 admin-shared 를 `dist/` 로 import 하는데 `check` 는 build 보다 typecheck·test 가 먼저라, `dist/` 가 없는 새 체크아웃(CI 포함)에서 "Cannot find module '@ssworks/admin-shared'" 로 실패했다. 컨테이너는 이전 빌드의 `dist/` 가 남아 있어 가려졌다. root `prepare` 가 install 직후 admin-shared 를 빌드하게 고쳤다. 같이 `.codegraph/` 를 `.gitignore` 에 올렸다.
2. ~~**원격·첫 커밋**~~ — **완료(2026-10-01).** `repository.url`(`https://github.com/sinsungworks/ssworks-admin-kit.git`)이 맞다고 확인됐고 `origin` 으로 연결했다. 남은 것은 `git push -u origin main` — `.claude/settings.json` 이 `git push` 를 막으니 사람이 한다.
3. ~~**PR #2 착수**~~ — **완료 · `main` 에 로컬 병합**(브랜치 `feat/admin-ui-shell`, 플랜 `docs/superpowers/plans/2026-10-01-admin-ui-shell.md` Task 1~10). 다음은 사람이: `git push -u origin main` — CI 가 돌고, release 워크플로가 Version Packages PR 을 연다(npm 스코프·`NPM_TOKEN` 이 준비되기 전에는 그 PR 을 머지하지 않는다). 그 뒤 **PR #3**(`docs/phase0-reports/fe-pages.md` §2)로 간다.

## 발행 전에 사람이 해야 하는 것

- npm 에 `@ssworks` 조직(스코프)이 있어야 한다. 없으면 만들거나 `@kim5257` 로 바꾼다(세 `package.json` 의 `name` 과 `.changeset/config.json` 의 `linked` 목록).
- GitHub 저장소 시크릿 `NPM_TOKEN`(automation 토큰). 그래야 `release.yml` 이 Version Packages PR → 발행까지 간다.

## 결정 사항 (바꾸려면 `docs/01-phase0.md` §4 를 먼저 고친다)

- 응답 봉투 `{success:true,data}` / `{success:false,code,message,details?}`
- bigint 는 `"BigInt(n)"` 래퍼 + Date 직렬화 (gise B9 이스케이프 코덱)
- 쓰기 보호: revision 기본 on, 재인증(`currentPassword`) 옵션
- 인증: refresh 토큰 해시 저장 + 회전
- 권한 가드 fail-closed, 빈 권한 인자는 false, `'*'` 는 정확 일치
- 에러 코드 `ERR_COMMON_*` 명명, 상태표 단일, `ERR_ACCOUNT_LOCKED` 423
- 라우트 prefix `admin/`, 권한 카탈로그는 객체 주입(axion 형)
- **패키지는 `RouteMeta` 를 증강하지 않는다**(crm·gise·hangang 이 `env.d.ts` 에서 이미 증강)

## 알려진 미확인·보류

- crm `utils/queryCodec.ts`, gise `api/error.ts`, axion `utils/route-permission.ts` 는 Phase 0 추출본에 없었다. `useQuerySyncedFilter`·`useFieldErrors` 는 PR #3 에서 원본을 읽고 확정.
- `vite-plugin-dts` 가 빌드의 92%(≈9초)를 차지한다. 느려지면 `bundleTypes` 대신 `vue-tsc --declaration` 경로를 검토.
- Vuetify 4.2.x 에서 테스트했다. hangang 주석은 4.1.11 기준이다(`VBtn :loading` 동작 · `VDataTableFooter -1` 기본값) — 올릴 때 `docs/phase0-reports/fe-layout-ui.md` §5-4 의 목록을 다시 센다.

## 작업 폴더 밖에 남은 것

- `../_phase0/` — Phase 0 보고서 원본과 전달용 tar. 저장소 `docs/` 에 복사됐으니 지워도 된다.
