# HANDOFF — 2026-10-01

Cowork 세션에서 Claude Code 로 넘기는 인계 문서. 새 세션은 이 파일 → `CLAUDE.md` → 현재 플랜 순으로 읽는다.

## 지금 상태

| 항목                    | 상태                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 저장소                  | `main` 에 첫 커밋. 원격 `origin` = `https://github.com/sinsungworks/ssworks-admin-kit.git`. **push 완료(2026-10-02)**, CI 초록. pnpm 12. Version Packages PR #1 머지 → 0.2.0. 첫 발행은 로컬 수동, 이후 Trusted Publishing                                                                                                                                                                                           |
| `@ssworks/admin-shared` | Phase 1 완료. 54 테스트. `tsc` 빌드                                                                                                                                                                                                                                                                                                                                                                                  |
| `@ssworks/admin-ui`     | Phase 1 **PR #1**(프리미티브·다이얼로그·표·토스트·Vuetify 프리셋·권한 훅) · **PR #2**(셸·메뉴·가드·API 클라이언트·스토어·composable) 구현 완료 — PR #2 는 `main` 에 로컬 병합. **PR #3a**(`useServerTable` · `useQuerySyncedFilter`+코덱 · `useWriteFlow` · `toFieldErrors`)는 `feat/admin-ui-list-write` 에서 구현 완료. 429 테스트. vite lib 빌드. 패킹 tarball 을 별도 Vite+vuetify 앱에서 typecheck·build 검증함 |
| `@ssworks/admin-server` | 골격만. `private: true` 라 발행되지 않음. Phase 2                                                                                                                                                                                                                                                                                                                                                                    |
| 검증                    | 컨테이너(Linux, Node 22)와 Windows(Node 24) 양쪽에서 `pnpm check`·`format:check` 초록(PR #1 시점 142 테스트). Windows 첫 실행에서 새 체크아웃 결함 하나를 고쳤다(아래)                                                                                                                                                                                                                                               |
| 문서                    | `docs/00-admin-common-review.md`(방안 검토) · `docs/01-phase0.md`(정본·확장점·A/B/X·프로토콜 결정·§8 진행) · `docs/phase0-reports/`(대조 보고 5편)                                                                                                                                                                                                                                                                   |
| 다음 플랜               | PR #3b(역할·설정 — `PermissionMatrix` · `useRoleEditor` · `SettingsShell`). 직전 PR #3a: 스펙 `docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md` · 플랜 `docs/superpowers/plans/2026-10-03-admin-ui-list-write.md`                                                                                                                                                                                    |

## 첫 세션에서 할 일 (순서대로)

1. ~~**설치·검증**~~ — **완료(2026-10-01).** 예상했던 경로 구분자·개행 문제는 없었다. 실제로 깨진 것은 Windows 와 무관한 **새 체크아웃 결함**: admin-ui 가 admin-shared 를 `dist/` 로 import 하는데 `check` 는 build 보다 typecheck·test 가 먼저라, `dist/` 가 없는 새 체크아웃(CI 포함)에서 "Cannot find module '@ssworks/admin-shared'" 로 실패했다. 컨테이너는 이전 빌드의 `dist/` 가 남아 있어 가려졌다. root `prepare` 가 install 직후 admin-shared 를 빌드하게 고쳤다. 같이 `.codegraph/` 를 `.gitignore` 에 올렸다.
2. ~~**원격·첫 커밋**~~ — **완료(2026-10-01).** `repository.url`(`https://github.com/sinsungworks/ssworks-admin-kit.git`)이 맞다고 확인됐고 `origin` 으로 연결했다. 남은 것은 `git push -u origin main` — `.claude/settings.json` 이 `git push` 를 막으니 사람이 한다.
3. ~~**PR #2 착수**~~ — **완료 · `main` 에 로컬 병합**(브랜치 `feat/admin-ui-shell`, 플랜 `docs/superpowers/plans/2026-10-01-admin-ui-shell.md` Task 1~10). push 완료(2026-10-02). release 워크플로가 연 Version Packages PR #1 이 처음엔 **1.0.0** 을 내놨다 — peer `workspace:^` 가 0.x 에서 minor 를 못 덮어 changesets 가 major 로 올린 것. 0.x 를 유지하기로 하고 `fixed` · peer `workspace:^0` · `onlyUpdatePeerDependentsWhenOutOfRange` 로 고쳤다(0.2.0, 근거는 `.changeset/README.md`). PR #1 은 머지돼 세 패키지가 0.2.0 이 됐다. 이어서 pnpm 12 로 올렸다(`.npmrc` 설정 → `pnpm-workspace.yaml`). 그 뒤 PR #3 은 3a~3e 로 나눴다 — **PR #3a 완료**, 다음은 **PR #3b**(`docs/phase0-reports/fe-pages.md` §2).

## 발행 전에 사람이 해야 하는 것

- ~~npm `@ssworks` 스코프~~ — 확보(2026-10-02).
- **토큰 시크릿(`NPM_TOKEN`)은 쓰지 않는다 — npm Trusted Publishing(OIDC).** Bypass 2FA granular 토큰은 2027-01 부터 직접 발행이 막힌다(스테이징 + 2FA 승인만 남음, [GitHub changelog 2026-07-31](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/)). Trusted Publisher 는 이미 있는 패키지에만 등록할 수 있어서, 0.2.0 은 사람이 로컬에서 2FA 로 발행했다(2026-10-02).
- **CI 는 스테이징만 한다**(Trusted Publisher 의 "Allow npm publish" 끔). 공개는 사람이 `pnpm stage approve` 로 2FA 승인 — 절차·이유는 `.changeset/README.md` 와 `scripts/stage-release.mjs`. changesets 의 `changeset publish` 는 `pnpm publish`(직접 공개)만 불러서 쓰지 않는다([pnpm #13183](https://github.com/pnpm/pnpm/issues/13183)). 첫 CI 스테이징(다음 버전)에서 OIDC 인증·provenance 가 실제로 되는지 확인할 것.
- ~~저장소 Settings → Actions → "Allow GitHub Actions to create and approve pull requests"~~ — 켜 둠(2026-10-02). 꺼져 있으면 release 가 PR 생성에서 실패한다.

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

- crm `utils/queryCodec.ts`, gise `api/error.ts`, axion `utils/route-permission.ts` 는 Phase 0 추출본에 없었다. `useQuerySyncedFilter`·`useFieldErrors` 는 PR #3a 에서 원본을 읽고 확정(완료).
- `vite-plugin-dts` 가 빌드의 92%(≈9초)를 차지한다. 느려지면 `bundleTypes` 대신 `vue-tsc --declaration` 경로를 검토.
- Vuetify 4.2.x 에서 테스트했다. hangang 주석은 4.1.11 기준이다(`VBtn :loading` 동작 · `VDataTableFooter -1` 기본값) — 올릴 때 `docs/phase0-reports/fe-layout-ui.md` §5-4 의 목록을 다시 센다.

## 작업 폴더 밖에 남은 것

- `../_phase0/` — Phase 0 보고서 원본과 전달용 tar. 저장소 `docs/` 에 복사됐으니 지워도 된다.
