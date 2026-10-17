# 킷 버전 상향 검증 (2026-10-17)

스펙 `docs/superpowers/specs/2026-10-17-kit-toolchain-upgrade-design.md` · 플랜 `docs/superpowers/plans/2026-10-17-kit-toolchain-upgrade.md` · 브랜치 `chore/kit-toolchain-upgrade`

## 0. 요약

**결정**: 킷을 ringside 기준선으로 올린다 — admin-ui peer `pinia ^4.0.0`(`@vue/devtools-api` 는 peer 가 아니라 dev 에만), 저장소 도구 TypeScript 6.0.3 · Vitest 5.0.5 · ESLint 10.12.0(`^10.12.0`) · typescript-eslint 8.71.2, 실 DB 테스트 MariaDB 11.4 + 12.3 매트릭스. 릴리스는 changeset 하나(`.changeset/pinia-4-toolchain.md`)로 세 패키지 모두 0.5.0(admin-ui minor · 나머지 patch, `fixed` 묶음). 공개 API 는 바뀌지 않았다.

**바뀐 버전**: typescript 5.9.3 → 6.0.3 · vitest 4.1.11 → 5.0.5 · eslint 9.39.5 → 10.12.0 · @eslint/js → 10.0.1 · typescript-eslint → 8.71.2 · pinia(dev) 3 → 4.1.0 · @vue/devtools-api(dev) 8.2.1 추가 · 루트 engines.node `>=22.13.0`. 나머지 devDeps 는 범위 안 최신(잠금 파일만).

**통과한 검증**:

- V1 기준선 → 상향 후 `pnpm check`: 단위 1749 / 152 파일, 전후 같다(§1 · §2).
- V2 실 DB: MariaDB 11.4 · 12.3 모두 468 / 48 파일 통과(§3).
- V3 발행물 비교: admin-shared 같음 · admin-ui 표기만 · admin-server 주석 한 줄, "의미 있음" 차이 없음(§4).
- V4 changeset: 드라이런은 권한 계층에 막혀 `changeset status --verbose` 로 대신 — 셋 다 0.5.0, major 없음(§5).
- V5 소비 앱 스모크(브라우저): TS 6.0.3 · TS 5.9.3 모두 `@ssworks/*` d.ts 오류 0, TS2882 없음, Pinia 3 소비자는 peer 경고, devtools-api 누락은 설치가 알림(§6).
- V6 서버 스모크: TS 6.0.3 · NodeNext · `skipLibCheck: false` 오류 0, 진입점 셋 해석(§6-6).
- V7 템플릿 `preset/admin`: ⓐ `73de2be`(도구 상향) · ⓑ `997a81f`(킷 0.5.0, 잠금 파일 없음) 로컬 커밋, tarball clone 에서 lint · typecheck · test · build 초록(§7).

**고친 킷 결함**: 없음. 소스 · 테스트 · tsconfig 변경 없음. 예외는 ESLint 10 `preserve-caught-error` 의 줄 단위 끄기 하나(§2-2).

**사람이 할 일**(스펙 §10 순서):

1. 브랜치 push → PR. **머지 전에** main ruleset 필수 검사 `db` → `db (11.4)` · `db (12.3)`.
2. PR 머지 → release 워크플로가 Version Packages PR(0.5.0)을 연다.
3. 🔴 **Version Packages PR 머지 전에 admin-server Trusted Publisher 등록**(스펙 §10-3) — 안 하면 admin-server 스테이징만 OIDC 로 실패한다. 이 PR 에서 §5 의 기대도 확인한다(로컬 드라이런을 건너뛰었다): 버전 0.5.0 ×3 · 1.0.0 없음 · admin-ui peer `@ssworks/admin-shared: ^0` + `pinia: ^4.0.0` · admin-server peer `@ssworks/admin-shared: >=0.4.0 <1.0.0` · CHANGELOG 셋의 `## 0.5.0`.
4. Version Packages PR 머지 → 셋 스테이징 → `pnpm stage list` → `pnpm stage approve <id>` ×3 → `git pull && pnpm changeset tag && git push --tags`.
5. `.changeset/README.md` 5단계: 세 패키지 provenance 확인(admin-server 는 첫 OIDC 확인).
6. 템플릿 `preset/admin`: **0.5.0 이 공개된 뒤에** §7-4 절차(설치 · 검증 · 잠금 파일 + 바뀐 `typed-router.d.ts` amend) 후 push. 그 전에는 ⓐ `73de2be` · ⓑ `997a81f` 를 push 하지 않는다.
7. ringside 문서를 §8 의 18행대로 고친다. 0.5.0 핀은 stage approve 로 공개된 뒤에 올린다.
8. (10/27 뒤 별도 작업) Node 26 — `.nvmrc` 26 · CI · 로컬 검증.

## 1. 기준선 (상향 전 — TS 5.9.3 · vitest 4.1.11 · eslint 9.39.5 · Windows · Node 24.21)

기준선 수는 vitest 4.1.11 에서 쟀고, TS 6 로 올리기 전에 범위 안 갱신으로 4.1.12 가 됐다(§2-1).

| 층                    | admin-shared  | admin-ui      | admin-server  | 합계            |
| --------------------- | ------------- | ------------- | ------------- | --------------- |
| 단위(`pnpm test`)     | 266 / 16 파일 | 886 / 63 파일 | 597 / 73 파일 | 1749 / 152 파일 |
| 실 DB 11.4(`test:db`) | —             | —             | 468 / 48 파일 | 468             |

테스트 DB 11.4 의 데이터베이스(정리 확인용): information_schema · mysql · performance_schema · sys

## 2. 도구 상향 — 고친 것

### 2-1. TypeScript 6.0.3

| 파일 | 오류 | 고친 것 | 발행물 영향 |
| ---- | ---- | ------- | ----------- |
| (없음) | typecheck · build · check:dts · test(1749) · lint 모두 첫 시도에 초록 | 소스 · tsconfig 변경 없음 | 없음 |

범위 안 갱신(prettier 3.9.10 · typescript-eslint 8.71.2 · vitest 4.1.11 → 4.1.12 — 기준선은 4.1.11 에서 쟀고 TS 6 전에 4.1.12 로 올렸다)은 잠금 파일만 바뀌었고 pnpm check 초록. pnpm install 의 peer 경고 없음(eslint 9.39.5 deprecated 안내만).

### 2-2. eslint 10 · typescript-eslint 8.71

eslint 10.12.0(범위 ^10.12.0 — 10.13.0 은 2026-10-16 공개라 pnpm 12 기본 minimumReleaseAge 1일 안이어서 받지 않는다. 예외 목록을 두지 않는다) · @eslint/js 10.0.1 · typescript-eslint 8.71.2 · 루트 engines.node >=22.13.0. `eslint.config.js` 는 그대로(폐기 API 없음).

| 규칙                  | 건수 | 고친 방법                                                                                                                                         |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preserve-caught-error` | 1    | admin-server `database/connection.ts` readCaFile — 거짓 양성 취급, 그 줄에만 disable. 원본 오류 메시지가 CA 파일 경로를 담아 `cause` 를 달지 않는 것이 의도(🔴 주석) |

`http/*.ts` 의 `cause` 는 5xx 로그(`reason`)로만 가고 응답 본문은 `code` · `message` · `details` 만이다 — 이번 변경은 cause 를 더하지 않았다.
`pnpm check` · `pnpm format:check` 초록(152 파일 · 1749 테스트).

### 2-3. vitest 5

`vitest` `^4.1.10` → `^5.0.5` (설치 5.0.5, 4.1.12 에서). 첫 실행에서 실패 0 — 새 기본값(모의 함수 초기화 · await 안 한 단언 · 호이스팅 · happy-dom)에 걸린 테스트가 없어 테스트 · 설정 변경 없음. `.vitest/` 부산물도 없음.

| 범주                                     | 실패 파일 수 |
| ---------------------------------------- | -----------: |
| 모의 함수 기본 초기화                    |            0 |
| await 하지 않은 비동기 단언              |            0 |
| 호이스팅 위치                            |            0 |
| `toThrow("")` · 제목 `$` · pretty-format |            0 |
| happy-dom window 변경                    |            0 |

| 패키지       | 파일 | 전(4.1) | 후(5.0.5) |
| ------------ | ---: | ------: | --------: |
| admin-shared |   16 |     266 |       266 |
| admin-ui     |   63 |     886 |       886 |
| admin-server |   73 |     597 |       597 |
| 합계         |  152 |    1749 |      1749 |

### 2-4. Pinia 4

admin-ui peer `pinia` `^3.0.0` → `^4.0.0`, devDependencies `pinia` `^3.0.4` → `^4.1.0`, devDependencies `@vue/devtools-api` `^8.2.1` 추가(peer 에는 넣지 않는다). README 설치 줄 · peer 표를 Pinia 4 · devtools-api 8 로 고쳤고, changeset `.changeset/pinia-4-toolchain.md`(admin-ui minor · admin-shared · admin-server patch)를 더했다.

| 패키지 | 버전 |
| ------ | ---- |
| `pinia` (admin-ui devDependencies) | 4.1.0 |
| `@vue/devtools-api` (admin-ui devDependencies) | 8.2.1 |

`pnpm --filter @ssworks/admin-ui list pinia @vue/devtools-api` 출력 그대로. `pnpm install` 출력에 pinia peer 경고 없음(끝부분 확인). 소스는 바뀌지 않았다.

admin-ui 단위 테스트(`pnpm --filter @ssworks/admin-ui test`): 886 / 63 파일 통과, 실패 0 — 기준선과 같다(`store/app-store.test.ts` · `wiring.integration.test.ts` 포함).

## 3. 실 DB — MariaDB 11.4 · 12.3

- 11.4 (vitest 5.0.5 뒤): 468 통과 / 48 파일, 실패 0 — 기준선과 같다.

서버 사실(`select version(), @@global…` 실측):

| 항목                           | 11.4 (`admin-kit-test-db` · 33306) | 12.3 (`admin-kit-test-db-12` · 33307) |
| ------------------------------ | ---------------------------------- | ------------------------------------- |
| 버전                           | 11.4.13                            | 12.3.3                                |
| `innodb_snapshot_isolation`    | 0 (OFF)                            | 1 (ON)                                |
| `have_ssl`                     | YES                                | YES                                   |
| `character_set_server`         | utf8mb4                            | utf8mb4                               |
| `collation_server`             | utf8mb4_uca1400_ai_ci              | utf8mb4_uca1400_ai_ci                 |
| `transaction_isolation`(전역)  | REPEATABLE-READ                    | REPEATABLE-READ                       |

12.3 첫 실행(`vitest.db.config.ts`, 수정 없이): 468 통과 / 48 파일, 실패 0 — 12.3 에서만 깨지는 테스트 없음, 킷 결함 없음, 테스트 수정 없음(테스트 이름의 `11.4` 만 버전 중립으로 바꿨다).
문서대로 차례로 다시 돌린 결과: 12.3(`ADMIN_TEST_DB_URL=…33307 pnpm test:db`) 468 / 48 파일 통과 · 11.4(`pnpm test:db`) 468 / 48 파일 통과 — 두 버전 모두 `db114-before.json` 과 수가 같다. 20초 타임아웃 흔들림 없음.

## 4. 발행물 비교 (V3)

`dist-before`(e543f87, TS 5.9.3) 와 `dist-after`(TS 6.0.3 · 갱신된 vite 8.3.4 · rolldown 1.2.14 · vue-tsc 3.3.13)를 `.map` 제외로 비교했다. 세 패키지 모두 파일 목록이 같다(사라짐 0 · 새로 0).

| 패키지       | 파일 | 바뀜 | 분류        | 내용                                                                                                                                                                                                                                                                                    |
| ------------ | ---- | ---- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admin-shared | 36   | 0    | 같음        | 바이트까지 같다                                                                                                                                                                                                                                                                         |
| admin-ui     | 70   | 8    | 표기만      | d.ts 7곳: 슬롯 임시 이름 `__VLS_n` 번호 이동(BaseDialog · CardLayout · ColumnPane) · 유니온 항 순서(`number \| string` ↔ `string \| number` 등) · `PermissionCheck` → `PermissionCheck<string>`(제네릭 기본값이 `string` 이라 같은 타입). `index.js` 1 파일 6곳: 번들러가 `if … return` 을 `else if` · 삼항으로 다시 쓴 제어 흐름 표기(분기 뒤에 이어지는 코드 없음 — 같은 동작) |
| admin-server | 282  | 1    | 주석만      | `database/connection.js` 에 eslint-disable 주석 한 줄(Task 4 의 `preserve-caught-error` 예외). 코드는 같다                                                                                                                                                                              |

"의미 있음" 차이 없음 — export 증감 · 타입 확대/축소 · 런타임 변경 없음. 소비자에게 깨지는 변경 없음. 원인 도구: TS 6(유니온 정렬 · 제네릭 기본값 펼침) · vue-tsc 3.3.13(임시 이름 번호) · rolldown 1.2.14(제어 흐름 표기).

## 5. changeset 드라이런 (V4)

**한계:** 로컬 `changeset version` 드라이런(worktree)은 돌리지 못했다 — 권한 계층이 막았다(`pnpm version-packages` 는 `.claude/settings.json` deny, `pnpm exec changeset version` 은 auto mode 분류기가 거부). 사용자가 `changeset status` 로 대신하기로 정했다. peer 재작성(`workspace:` → 범위)과 CHANGELOG 제목은 Version Packages PR 에서 확인한다.

`pnpm changeset status --verbose`:

```
Packages to be bumped at minor
- @ssworks/admin-ui 0.5.0         (.changeset/pinia-4-toolchain.md)
- @ssworks/admin-shared 0.5.0     (.changeset/pinia-4-toolchain.md)
- @ssworks/admin-server 0.5.0     (.changeset/pinia-4-toolchain.md)
Running release would release NO packages as a major
```

세 패키지 모두 0.5.0 이고 major 는 없다.

기대: `fixed` 가 세 패키지를 묶으므로 admin-shared · admin-server 의 patch changeset 도 0.5.0 이 된다. Version Packages PR 에서 확인할 것 — 버전 0.5.0 ×3 · 1.0.0 없음 · admin-ui peer `@ssworks/admin-shared: ^0` 과 `pinia: ^4.0.0` · admin-server peer `@ssworks/admin-shared: >=0.4.0 <1.0.0` · CHANGELOG 셋 각각 `## 0.5.0` 제목.

tarball(`pnpm build` 뒤 `pnpm --filter … pack`, 킷 본 체크아웃, `AK5/tgz`): package.json 버전이 릴리스 전까지 0.4.1 이라 파일 이름은 `-0.4.1.tgz` 다(내용은 0.5.0 이 실을 것).

| 파일                           | 포장된 peerDependencies                                                         |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `ssworks-admin-shared-0.4.1.tgz` | `zod ^4.0.0`                                                                    |
| `ssworks-admin-ui-0.4.1.tgz`     | `@ssworks/admin-shared ^0` · `pinia ^4.0.0` · vue · vuetify 등 (`@vue/devtools-api` 없음) |
| `ssworks-admin-server-0.4.1.tgz` | `@ssworks/admin-shared >=0.4.0 <1.0.0` · nestjs 12 · kysely 0.29 등              |

## 6. 소비 앱 스모크 (V5 · V6)

앱은 저장소 밖(`AK5/smoke-ui` · `AK5/smoke-server`)에 두고 §5 의 tarball(`-0.4.1.tgz` 셋)을 `file:` 로 설치했다. 첫 실행은 전역 pnpm 10.33.3 으로 **잘못** 돌았다(스모크 앱에 `packageManager` 가 없었다). 두 앱의 package.json 에 `"packageManager": "pnpm@12.8.1"` 을 더하고 node_modules · 잠금 파일을 지운 뒤 pnpm 12.8.1 로 6-1 · 6-4 · 6-5 · 6-6 을 다시 돌렸다(6-2 · 6-3 은 패키지 매니저와 무관). 아래 결과는 12.8.1 기준이고 10.33.3 과 다른 점은 각 절에 적는다. `allowBuilds: { vue-demi: false }` 는 12.8.1 에서 `ERR_PNPM_IGNORED_BUILDS` 없이 설치됐다(서버 앱도 오류 없음). 설치 버전: pinia 4.1.0 · @vue/devtools-api 8.2.1 · vue 3.5.44 · vue-router 5.4.0 · vuetify 4.2.6 · vite 8.3.4 · vue-tsc 3.3.13 · typescript 6.0.3 / 5.9.3 · @nestjs/\* 12.1.3 · kysely 0.29.6 · @types/node 24.19.2. 의존 하한은 조정하지 않았다(최소 릴리스 나이 거부 없음).

### 6-1. 브라우저 앱 — TS 6.0.3 · vue-tsc · `skipLibCheck: false`

`tsc -v` = `Version 6.0.3`, vue-tsc exit=2(제3자 d.ts 오류; pnpm 12.8.1 재실행도 개수 동일, `vite build` 도 성공), 출처별:

```
typescript TS2687: 1     (lib.dom.d.ts 'finished' — TS 자체)
vuetify TS2344: 693
vuetify TS2687: 1
vuetify TS2308: 1
KIT+APP OK (0)
```

`@ssworks/*` · 앱 출처 오류 0 (`@ts-expect-error` 도 쓰였다 — 카탈로그 밖 권한은 타입 오류). vuetify 는 CLAUDE.md 가 적은 기존 문제다. `vite build` 성공(`dist/index.html` 생성, `✓ built in 2.99s`, 청크 500 kB 경고만 — `import * as AdminUi` 때문).

### 6-2. Review Focus 4 — TS 6 기본값 side-effect import

`noUncheckedSideEffectImports` 를 적지 않은 tsconfig 에서 `grep -c "TS2882\|TS2307" smoke-ui-ts6.txt` = `0`. `@ssworks/admin-ui/style.css` · `vuetify/styles` · `@mdi/font/...css` 모두 해석된다.

### 6-3. Review Focus 3 — TS 5.9.3 소비자

`tsc -v` = `Version 5.9.3`, 같은 설정(`skipLibCheck: false`)으로 vue-tsc:

```
typescript TS2687: 1
vuetify TS2344: 693
vuetify TS2687: 1
vuetify TS2308: 1
KIT+APP OK (0)
```

TS 6 결과와 같다. `@ssworks/*` d.ts 오류 0.

### 6-4. Review Focus 1 — Pinia 3 소비자

pnpm 12.8.1 의 `pnpm add pinia@3.0.4` 출력(경고 한 줄만 나오고 상세는 `pnpm peers check` 로 본다):

```
[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.
```

`pnpm peers check`(exit 1):

```
Issues with peer dependencies found

✕ unmet peer pinia
  Installed: 3.0.4
  Wanted:
    ^4.0.0:
      @ssworks/admin-ui@0.4.1
```

경고가 나오고 설치는 막히지 않는다. pnpm 10.33.3 은 같은 내용을 설치 출력에 바로 풀어 썼다(`✕ unmet peer pinia@^4.0.0: found 3.0.4`). 4.1.0 으로 되돌린 뒤 `pnpm peers check` = `No peer dependency issues found`.

### 6-5. Review Focus 2 — `@vue/devtools-api` 를 빠뜨린 Pinia 4 앱

Pinia 4.1.0 의 peer 는 `@vue/devtools-api ^8.2.1` 이고 `optional: false` 다. `autoInstallPeers: false` 로 두고 `pnpm remove @vue/devtools-api` 만 하면 경고도 빌드 오류도 **없다**: `vue-router` 5.4.0 이 같은 패키지를 의존으로 끌고 와서 peer 가 충족된다(`pnpm why` 로 확인 — vue-router 가 있는 한 `node_modules/@vue` 가 최상위에 없어도 해석된다). `vite build` 성공. pnpm 12.8.1 에서 잠금 파일 · node_modules 를 지우고 새로 설치해도 같다(`autoInstallPeers: false`, 설치 경고 없음, `pnpm peers check` = `No peer dependency issues found`, `✓ built`).

vue-router 도 함께 빼서(앱이 router 를 안 쓰는 경우) 재현하면 pnpm 10.33.3 은:

```
 WARN  Issues with peer dependencies found
.
├─┬ pinia 4.1.0
│ └── ✕ missing peer @vue/devtools-api@^8.2.1
└─┬ @ssworks/admin-ui 0.4.1
  └── ✕ missing peer vue-router@"^4.5 || ^5"
Peer dependencies that should be installed:
  @vue/devtools-api@^8.2.1
  vue-router@"^4.5 || ^5"
```

그리고 `vite build` 는 실패한다:

```
Error: [vite]: Rolldown failed to resolve import "@vue/devtools-api" from ".../node_modules/.pnpm/pinia@4.1.0_.../node_modules/pinia/dist/pinia.js".
```

pnpm 12.8.1(잠금 파일 · node_modules 삭제 뒤 새 설치)은 설치 때 한 줄 경고(`Issues with peer dependencies found. Run "pnpm peers check"`)를 내고 `pnpm peers check`(exit 1) 가 둘 다 짚는다:

```
✕ missing peer @vue/devtools-api
  Wanted:
    ^8.2.1:
      pinia@4.1.0

✕ missing peer vue-router
  Wanted:
    "^4.5 || ^5":
      @ssworks/admin-ui@0.4.1
```

`vite build` 는 두 버전 모두 실패한다. 12.8.1 에서는 앱 코드가 먼저 `vue-router` 를 import 해(`Rolldown failed to resolve import "vue-router" from src/router.ts`) 그 오류가 먼저 보인다. devtools-api 의 해석 실패 자체는 10.33.3 쪽 출력이 보여 준다. 참고: 12.8.1 에서 `pnpm remove` 로만 줄이면(잠금 파일 유지) 경고가 나오지 않는다 — 새 설치에서만 나온다.

즉 설치가 빠진 peer 를 알리고(경고), 빌드가 그 결과를 확인해 준다 — README 의 "함께 설치" 문장의 근거다. vue-router 5 를 쓰는 앱은 hoisting 으로 우연히 충족될 뿐이니(router 가 끌어오는 경우도 있다) README · changeset 의 "함께 설치" 안내는 그대로 맞다. 스모크는 원상 복구했다(`@vue/devtools-api` 8.2.1 · vue-router ^5.4.0 추가, `autoInstallPeers` 줄 삭제, 빌드 성공).

### 6-6. 서버 앱 — TS 6.0.3 · NodeNext · `skipLibCheck: false`

pnpm 12.8.1 로 새로 설치(오류 · 경고 없음). `tsc -v` = `Version 6.0.3`, `tsc --noEmit` exit=0, 출처별 `{}` — `KIT+APP OK (0)`. `.` · `./runner` · `./migrations/0012_ip_access_rules` 세 진입점과 `AdminDatabase` 확장이 해석된다. 제3자 d.ts 오류도 없다.

## 7. 템플릿 preset/admin (V7)

### 7-1. 커밋 ⓐ — 도구 상향 (킷 0.4.1 유지)

템플릿 `preset/admin` `73de2be`(`9355035` 위, push 안 함). 시작 기준선은 초록: shared 6 · frontend 7 테스트(backend 는 테스트 없음).

- 올린 것: typescript `~6.0.3`(루트 · backend · frontend · shared) · eslint `^10.12.0`(설치 10.13.0 — 신규 릴리스 대기 때문에 하한만 10.12.0) · @eslint/js `^10.0.1` · typescript-eslint · plugin · parser `^8.71.2` · eslint-config-vuetify `^4.7.2` · vitest `^5.0.5`(frontend · shared) · vue-tsc `^3.3.13`. 설치 확인: TS 6.0.3 · vitest 5.0.5 · eslint-config-vuetify 4.7.2 · vue-tsc 3.3.13. eslint-config-vuetify 는 eslint 10 에서 설정 오류 없음.
- 지운 것: `baseUrl` 두 줄(frontend `tsconfig.app.json` · shared `tsconfig.json`). `CLAUDE.md` 의 TypeScript 5.9 → 6.0.
- 도구가 깬 것을 템플릿 코드에서 고침(규칙 끄기 · `ignoreDeprecations` 없음):
  - shared `tsc -p tsconfig.build.json`: TS5011 — TS 6 은 `rootDir` 기본이 tsconfig 폴더라 `dist` 배치가 달라진다. `tsconfig.build.json` 에 `"rootDir": "./src"` (`dist/index.js` 위치 유지).
  - frontend `vue-tsc`: TS2882 — `import 'vuetify/styles'`(`noUncheckedSideEffectImports` 기본 켜짐, 타입 선언 없음). `src/vuetify-styles.d.ts` 에 `declare module 'vuetify/styles'`.
  - frontend lint: eslint-config-vuetify 4.7 의 `vue/padding-line-between-tags` 68건(빈 줄만) — 템플릿 규약대로 `pnpm lint:fix`, 13개 `.vue` 에 빈 줄 추가(+68 줄 · 삭제 0).
- 상향 뒤 lint · typecheck · test(shared 6 · frontend 7, 줄지 않음) · build · format:check 모두 초록. `pnpm install --frozen-lockfile` 성공(Review Focus 5, 템플릿 쪽).

### 7-2. 커밋 ⓑ — 킷 0.5.0 · Pinia 4 (최종 `997a81f` — package.json ×3 + CLAUDE.md + `typed-router.d.ts`, 잠금 파일 없음)

템플릿 `preset/admin` 최종 ⓑ 는 `997a81f`(`73de2be` 위, push 안 함, 잠금 파일 없음) — 7-3b 에서 amend 했다. 아래는 처음 `08398be` 의 내용이다.

- `frontend`: `@ssworks/admin-shared` · `@ssworks/admin-ui` `0.5.0`, `pinia` `^4.1.0`, `@vue/devtools-api` `^8.2.1` 추가. `backend`: `@ssworks/admin-server` · `@ssworks/admin-shared` `0.5.0`. `shared`: `@ssworks/admin-shared` `0.5.0`. `CLAUDE.md` 두 줄(0.5.0 · Pinia 4 / devtools-api 8 안내). 새 코어 장이 없어 스텁은 더하지 않았다.

### 7-3. clone 검증 (tarball)

임시 clone(`AK5/tpl`, `preset/admin` ⓑ 위)에 `pnpm-workspace.yaml` `overrides` 로 세 `@ssworks/*` 를 `AK5/tgz/ssworks-admin-{shared,ui,server}-0.4.1.tgz` 에 붙였다. 사람 결정으로 드라이런을 생략해 package.json 버전이 0.4.1 인 채 내용이 0.5.0 이 싣는 것이므로 파일 이름이 `-0.4.1.tgz` 다. pnpm 10.33.0 이 `pnpm-workspace.yaml` 의 `overrides` 를 받아 루트 `package.json` 으로 옮기지 않았다.

- `pnpm install --no-frozen-lockfile` 성공(18.1s). `pnpm list`: frontend `@ssworks/admin-shared@0.4.1` · `@ssworks/admin-ui@0.4.1`(file: tarball — 템플릿 선언은 0.5.0, 예상된 불일치) · `@vue/devtools-api@8.2.1` · `pinia@4.1.0`; backend `@ssworks/admin-server@0.4.1` · `@ssworks/admin-shared@0.4.1`(같은 tarball).
- peer 경고(7-3b 에서 해소): admin-ui 의 pinia 경고는 없다. 남은 것은 `vue-router 5.0.4` 의 `unmet peer pinia@^3.0.4: found 4.1.0`(vue-router 의 선택 peer 가 아직 Pinia 4 를 안 담음 — 킷 밖) 과 `unplugin-fonts` 의 vite 8 peer(기존). 그 밖에 Windows 의 sass bin 생성 경고(`.EXE`).
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm test` 0(shared 6 · frontend 7 통과, 7-1 과 같음) · `pnpm build` 0(오류 없음, 500 kB 청크 경고만).
- clone 은 지웠다(`ak5` 에 `tpl` 없음).

### 7-3b. ⓑ 보정 — vue ^3.5.34 · vue-router ^5.2.0 (최종 ⓑ = `997a81f`)

7-3 의 첫 검증(`08398be`)에서 `vue-router 5.0.4` 가 `unmet peer pinia@^3.0.4: found 4.1.0` 을 냈다. vue-router 의 선택 peer 가 `pinia: ^3.0.4 || ^4.0.2` 로 넓어진 첫 버전이 5.2.0 이고 그 버전은 `vue: ^3.5.34 || ^4.0.0` 를 요구한다. 그래서 템플릿 frontend 의 하한을 `vue ^3.5.34` · `vue-router ^5.2.0` 으로 올렸다.

- 새 설치는 vue-router 5.4.0 을 받는데, 저장소에 커밋된 `typed-router.d.ts`(옛 형식)로는 `route.params.userNo` 가 `string | string[]` 로 보여 `vue-tsc` 가 `users.[userNo].vue` 에서 TS2345 두 건으로 실패했다. `vite build` 가 파일을 새 형식(`_ParamParsers` · `RouteNamedMap` · `pathParamNames`)으로 다시 쓰면 통과한다. 그래서 다시 생성한 `typed-router.d.ts` 를 ⓑ 에 함께 커밋했다(생성 파일, 템플릿 규약상 커밋 대상). `08398be` 를 amend 해 `997a81f` 가 됐다(잠금 파일 없음, push 안 함).
- 새 clone 재검증(같은 `-0.4.1.tgz` overrides, pnpm 10.33.0): 설치 성공. peer 경고는 `unplugin-fonts` 의 vite 8 하나뿐(기존) — pinia · vue · vue-router 경고 없음. 해석: `pinia 4.1.0` · `vue 3.5.44` · `vue-router 5.4.0`. lint 0 · typecheck 0 · test 0(shared 6 · frontend 7) · build 0. 빌드가 `typed-router.d.ts` 를 더는 바꾸지 않는다. clone 은 지웠다.
- 한계: 하한 5.2.0 자체에서의 typecheck 는 돌려 보지 않았다(잠금 파일 없이 새로 받으면 5.4.0).

### 7-4. 릴리스 뒤 절차 (0.5.0 공개 후)

1. 템플릿 `preset/admin` 에서 `pnpm install`(0.5.0 이 npm 에 보여야 한다 — 첫 반영이 늦을 수 있다).
2. `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` 가 모두 초록인지 본다(테스트 shared 6 · frontend 7).
3. `git status` 에서 `packages/frontend/src/typed-router.d.ts` 가 바뀌었으면(새로 만든 잠금 파일이 더 새 vue-router 를 풀 수 있다) `pnpm-lock.yaml` 과 함께 stage 한다.
4. `git add pnpm-lock.yaml && git commit --amend --no-edit`(ⓑ 에 잠금 파일을 합친다. 3 의 `typed-router.d.ts` 도 같이).
5. 그다음에야 push(사람). 그 전에는 push 하지 않는다.

## 8. ringside 에 고칠 것

- **읽은 ringside**: `sinsungworks/ssworks-ringside` 최신 커밋 `c39df68` (2026-10-14T06:20:54Z). `gh api` GET 만. 훑은 문서 `CLAUDE.md` · `docs/summary.md` · `docs/ringside-dev-plan.html` · `docs/ringside-development-plan.html`.
- **위치 표기**: `dev` = `ringside-dev-plan.txt:<줄>`(HTML 을 텍스트로 푼 것의 줄 번호 — 내려받은 HTML 은 `AK5/ringside/`), `plan` = `ringside-development-plan.txt:<줄>`, `CLAUDE.md:<줄>` · `summary.md:<줄>` 은 원문 줄.
- **키워드 적중**: 141줄(`AK5/ringside/hits.txt`). 그중 킷 현재와 어긋나는 것만 아래 18행에 모았다. 같은 문장이 여러 곳에 있으면 한 행에 위치를 모았다.
- **킷 사실(근거 약어)**: 진행표 = 킷 `CLAUDE.md` 진행표 · npm = `@ssworks/*` 0.4.1 공개(admin-server 는 2026-10-16 첫 발행), 0.5.0 은 아직 안 나갔다(Version Packages PR 머지 + `pnpm stage approve` 뒤).

| #   | 파일 · 위치                                                                                                          | 지금 문장                                                                                                                       | 고칠 내용                                                                                                                                                                                                                                                  | 근거                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | 기획서 14.1 표 admin-server 행 `dev:1376`                                                                            | "킷 Phase 2 진행 — 2a(기반·코어 스키마 7장)만 완료, 미발행"                                                                     | "Phase 2 완료(2a~2f) — npm 공개, 0.5.0 예정(세 패키지 같은 번호)". 같은 행의 "2b 인증 · 2c 세션·감사 · 2d 사용자·역할이 링사이드 Phase 1 관리자 로그인의 선행 조건"은 "이미 끝났다 — 선행 조건 아님"                                                         | 킷 CLAUDE.md 진행표 · npm                                               |
| 2   | 기획서 R17 제목 · 시나리오 · 대응 `dev:891,895,901` · 14.1 `dev:1380` · 14.5 `dev:1470` · 15.4 `dev:1548`            | "관리자 킷 의존 (미발행 0.x, Phase 2 미완)" · "admin-server 2b~2d가 늦어지면 관리자 로그인 자체가 없다" · "미발행 동안은 workspace 링크 또는 git 의존으로 붙이고" · "@ssworks/admin-server / workspace / git / 미발행 / 킷 Phase 2 끝까지" · "미발행·0.x API" | "0.x 의존"으로 줄이고 "미완"과 "일정 지연" 시나리오는 지운다(남는 위험은 0.x API 변경뿐). admin-server 는 npm 에서 `0.5.0` 정확 핀으로 설치(workspace/git 아님). "킷 2b~2d를 Phase 1 첫 3주에 병행하고 … 모의 인증으로 먼저" 대응은 불필요 — 킷을 조립만 하면 된다 | 진행표 · npm(admin-server 0.4.1, 2026-10-16)                              |
| 3   | `CLAUDE.md:50` · 기획서 기술 스택 줄 `dev:18` · 15.4 `dev:1546` · 14.1 표머리 `dev:1370`                              | "`admin-shared`·`admin-ui` 0.3(Pinia 4 상향 후 0.4) + `admin-server`(미발행, workspace/git)" · "ssworks-admin-kit 0.3" · "0.3.0 (→ Pinia 4 상향 후 0.4.0)" · "상태 (0.3.0, 2026-10-09 main)" | 셋 모두 `0.5.0`(세 패키지 같은 번호, 캐럿 없는 정확 핀)으로. Pinia 4 상향은 0.4.0 이 아니라 0.5.0 에 실린다. 14.1 표머리의 "(0.3.0, 2026-10-09 main)" 은 "(0.5.0)"                                                                                | 킷 버전 계획 fixed 0.5.0(스펙 §2-1)                                     |
| 4   | 14.1 표 admin-shared · admin-ui 행 `dev:1372,1374` · 15.4 `dev:1546` · 15.7 `dev:1576` · 개발 일정 `dev:1208`         | "npm 0.2.0 공개, 0.3.0 스테이징(승인 필요)" · "0.3.0은 스테이징 상태 — pnpm stage approve 필요" · "0.3.0 스테이지 승인(pnpm stage approve)" · "0.3.0 발행 승인" | "npm 0.4.1 공개, 0.5.0 릴리스 예정". 0.3.0 승인은 끝났다 — 15.7 해당 항목과 `dev:1208` 의 "0.3.0 발행 승인" 삭제. (0.5.0 도 스테이징 → 사람의 `stage approve` 뒤에야 공개된다 — 핀은 공개 확인 뒤에 올린다)                                              | npm 0.4.1 · 킷 CLAUDE.md 「변경 흐름」                                  |
| 5   | 15.6 Pinia 4 `dev:1566` · 15.7 `dev:1580` · 15.4 pinia `dev:1554`                                                    | "admin-ui의 peer를 ^4로 올리고 @vue/devtools-api v8을 peer에 더한다(changeset minor → 0.4.0)" · "admin-ui peer pinia ^4 + @vue/devtools-api ^8, changeset minor" | "admin-ui peer 는 `pinia ^4.0.0`. `@vue/devtools-api` 는 admin-ui peer 가 아니다 — Pinia 4 가 `^8.2.1` 을 스스로 요구하니, 소비 앱이 `pinia@^4 @vue/devtools-api@^8` 을 설치한다(링사이드는 이미 계획). 릴리스는 0.4.0 이 아니라 0.5.0". 링사이드 pinia 4.0.3 은 `^4.0.0` 안이다(킷은 4.1.0 으로 시험) | 킷 admin-ui package.json peer · 스펙 §2-1 · Task 7 소비 앱 스모크       |
| 6   | 15.6 마지막 · 15.5 `dev:1560` · 15.7 `dev:1578` · 개발 일정 `dev:1208`                                               | "킷은 vitest 4 · eslint 9 · TS 5.9라서 상향을 함께 한다" · "TypeScript 6.0.3 · vitest 5 · eslint 10 · typescript-eslint 8.71 상향" | 끝났다 — 킷은 TS 6.0.3 · vitest 5.0.5 · eslint 10.12.0 · typescript-eslint 8.71.2(링사이드 15.5 와 같은 계열). 15.5 문장은 "킷도 같은 버전" 으로 바꾸고 15.7 의 해당 항목은 삭제. eslint 는 10.13.0 이 pnpm 12 minimumReleaseAge(1일) 안이라 `^10.12.0`                | 킷 package.json · 스펙 §2-1                                             |
| 7   | 15.6 "Node 26 · MariaDB 12.3 전환" `dev:1572` · 15.1 MariaDB 행 `dev:1490` · 15.7 `dev:1582` · `dev:1208`            | "둘 다 킷이 테스트한 버전(24, 11.4)보다 위다. 킷의 pnpm check와 pnpm test:db를 Node 26 · mariadb:12.3 컨테이너로 돌려 초록을 확인한 뒤 올린다" · "킷 테스트 DB를 11.4 → 12.3으로 올려 확인" · "db:test:up 이미지 mariadb:12.3, .nvmrc 26 (10/27 이후)" | MariaDB 12.3 은 끝났다: 킷 CI `db` 잡이 MariaDB 11.4 · 12.3 매트릭스(468 테스트 둘 다 초록)이고 11.4 도 계속 지원한다 — "11.4 → 12.3 교체"가 아니라 "둘 다 검증". Node 26 은 아직이다: 킷은 Node 24 에서만 확인했고 `.nvmrc 26` 은 26 LTS(10/27) 뒤. 15.6 문장은 "MariaDB 12.3 확인 완료, Node 26 은 10/27 뒤 킷 확인 대기"로 | 킷 CI · 검증 기록 · 스펙 §2-1                                           |
| 8   | 14.5 `dev:1476` · 15.7 `dev:1584`                                                                                    | "AdminDbConnection에 TLS 옵션이 아직 없다 — 관리형 MariaDB가 TLS를 요구하면 킷에 먼저 추가한다" · "AdminDbConnection TLS 옵션 (관리형 MariaDB 대비, 14.5)" | 있다(0.4.0 부터). env `DB_SSL=true` · `DB_SSL_CA`(검증하는 TLS 둘만) 와 `socketPath` 를 `adminPoolConfig` 하나가 받는다. 14.5 항목은 "TLS 는 `DB_SSL`·`DB_SSL_CA` 로 켠다" 로, 15.7 항목은 삭제                                                       | 킷 CLAUDE.md 「admin-server」 · 0.4.0                                   |
| 9   | 14.5 `dev:1478` · 기술 스택 표 admin SPA 행 `dev:439`                                                                | "템플릿 preset/admin과 스킬이 아직 없다 — 첫 조립은 수동이고" · "14절. 템플릿 preset/admin이 아직 없어 수동 조립"               | 템플릿 `kim5257-project-template` 의 `preset/admin` 과 `.claude/skills/admin-scaffold` 가 있다(생성 앱 · 스킬 시험 두 바퀴 통과, 킷 결함 0). 단 템플릿 push 는 사람 몫이라 push 뒤에 "있다"로 쓴다. "수동 조립" 대신 "preset/admin 에서 시작". 마지막 "킷 Phase 3" 도 끝(Phase 3 완료, 다음은 Phase 4 = 링사이드) | 킷 CLAUDE.md 진행표 · 템플릿 CLAUDE.md                                  |
| 10  | 코어 장 수 — 기획서 7절 표 `dev:677` · 9절 결정 11 `dev:1320` · 14.2 `dev:1386` · `CLAUDE.md:39`/`:66` · 5절 `dev:462` | "관리자 킷 코어 마이그레이션 0001~0007" · "운영자 테이블은 킷 코어 7장" · "audit_logs·ip_access_rules·legal_documents 장은 킷 2c·2e·2f에서 추가" · "킷 스텁 0001~0007" · "킷 코어 스텁 순서는 assertAdminMigrationStubs로 검사" | 코어는 12장 `0001_roles` … `0012_ip_access_rules`(0008_audit_logs · 0009_guard_locks · 0010_team_tree_lock · 0011_legal_documents · 0012_ip_access_rules 포함). "나중에 추가" 문장은 삭제 — 이미 코어에 있다. 스텁은 12장 모두 필요하다(켜지 않는 팀 · 약관 장 0003~0006 · 0011 포함 — 빠진 장은 `빠진 장 <id>` 로 migrate 가 시작 전에 멈춘다). `assertAdminMigrationStubs` 이름은 맞다 | `ADMIN_MIGRATIONS` 12개(`database/migrations/index.ts`) · 템플릿 「킷 올리기」3 |
| 11  | 프로젝트 장 번호 — `dev:462` · `dev:1386` · `CLAUDE.md:39`                                                          | "마이그레이션(킷 스텁 0001~0007 + P1 0008~ + P2 0030~)" · "같은 마이그레이션 폴더(코어 스텁 0001~0007 + P1 0008~ + P2 0030~ …)" | 🔴 번호 이름을 쓰지 않는다. P1 `0008~` 은 코어 `0008_audit_logs`~`0012` 와 이름이 겹친다. 프로젝트 장은 타임스탬프 이름(`migrate:make`)으로 — 번호로 이름 지으면 이미 적용된 DB 에서 코어 새 장이 그 앞에 정렬되어 Kysely 가 "corrupted migrations" 로 멈춘다. "P1 0008~ · P2 0030~" 구획은 타임스탬프 + 레인 접두로 대체. 킷이 장을 더하면 스텁 한 줄을 `admin_<장 이름>` 으로 | 템플릿 CLAUDE.md 「킷 올리기」3 · `migrations/index.ts` 머리 주석       |
| 12  | 결정 11 `dev:1320` · 14.1 admin-server 행 `dev:1376`                                                                 | "2e 팀은 비활성" · "2e 팀은 teams.enabled:false로 미룸"                                                                         | `teams.enabled` 옵션은 킷에 없다. 팀을 빼는 방법은 `AdminTeamsModule` 을 `imports` 에 넣지 않는 것 — 그러면 `teams.read/manage` 슬롯도 필요 없다. (테이블 `teams` · `team_closure` · `team_user_map` 은 코어 장이라 어차피 생긴다)                          | 킷 `AdminTeamsModule`(`teams.module.ts`) · 스펙 §8 항목 4               |
| 13  | 14.1 admin-server 행 `dev:1376` · 개발 일정 `dev:1206` · 결정 11 `dev:1320` · 14.3 `dev:1420`                        | "2f IP 접근 제어는 Phase 1 C 레인 후반" · "관리자 킷 2b 인증 · 2c 세션·감사 · 2d 사용자·역할 (병행, 2~3주) · 2f IP 접근 제어" · "2f IP는 Phase 1" | 킷 쪽 작업이 아니라 링사이드의 조립 작업이다: `AdminIpAccessModule` import + 슬롯 둘 + `clientIp` 출처 확인(게이트웨이 뒤면 `x-real-ip`/realip — 틀리면 전원 차단). 일정 줄은 "킷 이식 2~3주"가 아니라 "킷 조립(템플릿 기준)"으로                       | 킷 진행표 2f-1 · 템플릿 「IP 접근 제어 켜기」                           |
| 14  | 개발 계획서 일정 `plan:158` · 위험 `plan:231,345` · `plan:191` · `summary.md:20,46` · `CLAUDE.md:74` · 기획서 `dev:1206` | "공통 관리자 킷 작업 종료, 관리자 로그인·권한이 선다" · "인증·권한·감사 로그는 공통 관리자 킷을 재사용해 첫 3주에 병행으로 끝낸다" · "공통 관리자 킷 작업 지연 / 킷 범위를 인증·권한까지로 줄이고 나머지는 Phase 2로" · "기반 점검 — 킷 2b~2d 종료" · "관리자 (킷 2b~2d 첫 3주)" · "C 관리자(킷 2b~2d 선행)" | 킷 2b~2d 는 레인 안에서 만드는 일이 아니라 끝난 선행 조건이다. C 레인 첫 3주는 "킷 이식"이 아니라 "킷 조립 + 링사이드 관리자 모듈(권한 카탈로그 · 슬롯 맵)"로 쓰고, 위험 행 "공통 관리자 킷 작업 지연"은 삭제하거나 "0.5.0 공개 승인 지연(사람의 stage approve)"으로 바꾼다. 감사 전 금지 규칙(`CLAUDE.md:67`, `dev:1472`)은 유효하되 "(킷 2c)" 는 "AdminAuditModule 을 켠 뒤"로 | 킷 진행표(2b~2f 완료)                                                   |
| 15  | 기획서 8절 API 표 `dev:807`                                                                                          | "GET /admin/audit-logs, /admin/users, /admin/roles, /admin/sessions, /admin/ip-rules"                                           | IP 접근 제어 경로는 `ip-rules` 가 아니라 `ip-access`(`@Controller('ip-access')`). 킷 라우트 조각: `audit-logs` · `users` · `roles` · `sessions` · `teams` · `legal-documents` · `ip-access` · `auth`(`login` `refresh` `logout` `me` `password` — `dev:783` 은 맞다)  | 킷 `*.controller.ts`                                                    |
| 16  | 기획서 14.4 권한 카탈로그 초안 `dev:1442-1466`                                                                       | `AUDIT_READ: 'audit:read'` · `ORG_USERS_WRITE: 'org.users:write'` · `ORG_ROLES_WRITE: 'org.roles:write'` 만 킷 몫                | 14.3 이 켜는 킷 모듈(운영자 · 역할 · 세션 · 감사 · IP)에 슬롯 9개가 필요한데 키는 셋뿐. 빠진 슬롯: `sessions.read` · `sessions.manage` · `users.read` · `roles.read` · `ipAccess.read` · `ipAccess.manage`. 제안 키와 규칙은 아래 「권한 슬롯 대조」                | `ADMIN_PERMISSION_SLOTS` · `assertPermissionSlots` 호출 7곳              |
| 17  | 14.4 `dev:1458` 주석 · 14.2 권한 문장 `dev:1388` · `dev:807` 의 "audit:read, org.*"                                  | "ORG_USERS_WRITE … // 킷 운영자 관리" · "프론트 가드·메뉴·백엔드 @RequirePermissions가 같은 객체를 쓴다" · "audit:read, org.*" | 킷 패키지 라우트는 `@RequirePermissions` 가 아니라 **슬롯**(`sessions.read` …)을 선언하고, 키는 `AdminServerOptions.permissions` 로 이어진다. 링사이드 자체 라우트(admin-api 모듈)만 `@RequirePermissions`. 8절 표의 권한 열 `org.*` 는 정확한 키(`org.users:read` …)로 | `permission-slots.ts` 머리 주석 · 킷 CLAUDE.md 「admin-server」            |
| 18  | 14.4 `dev:1445` `definePermissions({…})`                                                                             | 함의(`implies`) 없음(선택이지만 권장 — `implies?:`, 기본 `{}`)                                                                  | 읽기 키를 만들면 `definePermissions(…, { implies })` 로 쓰기 → 읽기 함의를 준다(`'org.users:write': ['org.users:read']`). 킷이 서버 정규화(`permissionCatalog`)와 역할 편집기에 같은 표를 쓴다 — 함의가 없으면 쓰기 키만 가진 역할이 읽기 라우트에서 403 이 된다                | 템플릿 `shared/src/admin/permissions.ts` IMPLIES                        |

### 권한 슬롯 대조 (Task 10 Step 4)

1. 모듈마다 기동에 필요한 슬롯(각 모듈 `onModuleInit` 의 `assertPermissionSlots` — 안 이어지면 빠진 것을 모아 한 번에 던진다. 모르는 슬롯 이름이나 빈 키도 기동에서 멈춘다):

   | 모듈                | 슬롯                                   | 링사이드 14.3          |
   | ------------------- | -------------------------------------- | ---------------------- |
   | `AdminSessionsModule` | `sessions.read` · `sessions.manage`  | 켠다                   |
   | `AdminAuditModule`  | `auditLogs.read`                       | 켠다(슬롯 하나뿐)      |
   | `AdminRolesModule`  | `roles.read` · `roles.manage`          | 켠다                   |
   | `AdminUsersModule`  | `users.read` · `users.manage`          | 켠다                   |
   | `AdminIpAccessModule` | `ipAccess.read` · `ipAccess.manage`  | 켠다(2f)               |
   | `AdminTeamsModule`  | `teams.read` · `teams.manage`          | 끈다(결정 11) — 불필요 |
   | `AdminLegalModule`  | `legal.read` · `legal.publish`         | 문서에 없음 — 켜지 않는다면 불필요 |

   `AdminAuthModule` 자체는 슬롯이 없다. 켜는 5모듈 합계 슬롯 9개(sessions 2 + audit 1 + roles 2 + users 2 + ipAccess 2).

2. 슬롯 둘이 같은 키를 가리켜도 되는가: 기술적으로 된다 — `resolvePermissionMap` 은 비어 있지 않은 문자열인지만 보고 중복을 막지 않는다. 그러나 `read` 와 `manage` 를 한 키로 잇으면 읽기 권한자가 쓰기까지 하므로 권하지 않는다(쓰기 가드가 읽기 키로 풀린다). 서로 다른 모듈의 읽기 슬롯 둘이 한 키를 공유하는 것(예: 세션과 감사 읽기를 한 키로)은 문제없다. 또 `roles.read` 는 역할 목록 라우트에서 `roles.read` ∨ `users.read`("하나라도")로 판정한다 — 운영자 화면의 역할 선택에 `users.read` 만 있어도 목록이 열린다.

3. 14.4 초안이 덮는 것과 빠진 것(켜는 5모듈 슬롯 9개 중 덮는 것 3개):

   | 슬롯                  | 14.4 초안 키                              | 상태     | 제안 키(리소스:동작 규약, 템플릿 이름과 맞춤) |
   | --------------------- | ----------------------------------------- | -------- | --------------------------------------------- |
   | `auditLogs.read`      | `AUDIT_READ: 'audit:read'`                | 덮음     | (그대로, 또는 템플릿 `settings.auditLog:read`) |
   | `users.manage`        | `ORG_USERS_WRITE: 'org.users:write'`      | 덮음     | —                                             |
   | `roles.manage`        | `ORG_ROLES_WRITE: 'org.roles:write'`      | 덮음     | —                                             |
   | `users.read`          | 없음                                      | **빠짐** | `ORG_USERS_READ: 'org.users:read'`            |
   | `roles.read`          | 없음                                      | **빠짐** | `ORG_ROLES_READ: 'org.roles:read'`            |
   | `sessions.read`       | 없음                                      | **빠짐** | `SESSIONS_READ: 'sessions:read'`              |
   | `sessions.manage`     | 없음                                      | **빠짐** | `SESSIONS_WRITE: 'sessions:write'`            |
   | `ipAccess.read`       | 없음                                      | **빠짐** | `IP_ACCESS_READ: 'settings.ipAccess:read'`    |
   | `ipAccess.manage`     | 없음                                      | **빠짐** | `IP_ACCESS_WRITE: 'settings.ipAccess:write'`  |

   함께 줄 함의: `org.users:write → org.users:read` · `org.roles:write → org.roles:read` · `sessions:write → sessions:read` · `settings.ipAccess:write → settings.ipAccess:read`. 팀·약관을 나중에 켜면 슬롯 4개가 더 필요하다(`teams.*` · `legal.*`) — 카탈로그에 "Phase 2 권한은 처음부터"라는 규칙(14.2)을 따르려면 미리 키만 두고 모듈은 import 하지 않아도 된다(안 쓰는 슬롯은 `permissions` 에 있어도 무해하다, 이름이 목록 안이기만 하면 된다). 위 키 이름은 제안일 뿐이고 링사이드의 `'리소스:동작'` 규칙과 14.4 의 기존 이름(`audit:read`)을 우선한다.

## 9. 정리 · 남은 것

**지운 것**

- 12.3 테스트 컨테이너 `admin-kit-test-db-12`(`pnpm db:test:down:12.3`). `docker ps -a --filter name=admin-kit-test-db` 에 `admin-kit-test-db mariadb:11.4 Up` 한 줄만 남았다.
- 임시 작업 폴더 `AK5`(`C:/Users/kim52/AppData/Local/Temp/ak5` — 기준선 · tarball · 스모크 앱 · ringside 내려받기 · 임시 clone). 지운 뒤 `ak5 없음`.
- worktree 는 남은 것이 없다(`git worktree list` 에 본 체크아웃 하나). 저장소 루트에 `NUL` 없음.

**남긴 것**

- 이미지 `mariadb:12.3`(다음 `db:test:up:12.3` 용) · 기존 11.4 컨테이너 `admin-kit-test-db`(33306) — 지우거나 멈추지 않았다.
- 11.4 의 데이터베이스는 §1 과 같다: information_schema · mysql · performance_schema · sys(남은 테스트 DB 없음, drop 한 것 없음).

**넘긴 것**

- Node 26(`.nvmrc` · CI · 로컬 검증) — 26 LTS(10/27) 뒤.
- `globals` 17 · `happy-dom` 21 · `@changesets/cli` 3 메이저.
- 템플릿의 pnpm 12 · Node 26.
- 템플릿 ⓑ 의 잠금 파일(+ 바뀐 `typed-router.d.ts`) amend — 0.5.0 공개 뒤(§7-4). 하한 vue-router 5.2.0 자체에서의 typecheck 는 안 돌렸다(§7-3b).
- 이 브랜치에서 새로 찾은 킷 결함은 없다. 실서버 확인이 넘긴 결함 둘(기본 정렬 열 오름차순 · 조회 실패 직후 빈 상태)은 그대로 열려 있다.
- 로컬 `changeset version` 드라이런 — 권한 계층이 막아 Version Packages PR 에서 확인(§5).
