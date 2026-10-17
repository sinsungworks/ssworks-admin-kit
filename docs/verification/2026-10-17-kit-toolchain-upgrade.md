# 킷 버전 상향 검증 (2026-10-17)

스펙 `docs/superpowers/specs/2026-10-17-kit-toolchain-upgrade-design.md` · 플랜 `docs/superpowers/plans/2026-10-17-kit-toolchain-upgrade.md` · 브랜치 `chore/kit-toolchain-upgrade`

## 0. 요약

(Task 11 에서 쓴다)

## 1. 기준선 (상향 전 — TS 5.9.3 · vitest 4.1.11 · eslint 9.39.5 · Windows · Node 24.21)

| 층                    | admin-shared | admin-ui  | admin-server | 합계        |
| --------------------- | ------------ | --------- | ------------ | ----------- |
| 단위(`pnpm test`)     | 266 / 16 파일 | 886 / 63 파일 | 597 / 73 파일 | 1749 / 152 파일 |
| 실 DB 11.4(`test:db`) | —            | —         | 468 / 48 파일 | 468         |

테스트 DB 11.4 의 데이터베이스(정리 확인용): information_schema · mysql · performance_schema · sys

## 2. 도구 상향 — 고친 것

### 2-1. TypeScript 6.0.3

| 파일 | 오류 | 고친 것 | 발행물 영향 |
| ---- | ---- | ------- | ----------- |
| (없음) | typecheck · build · check:dts · test(1749) · lint 모두 첫 시도에 초록 | 소스 · tsconfig 변경 없음 | 없음 |

범위 안 갱신(prettier 3.9.10 · typescript-eslint 8.71.2 · vitest 4.1.12)은 잠금 파일만 바뀌었고 pnpm check 초록. pnpm install 의 peer 경고 없음(eslint 9.39.5 deprecated 안내만).

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
| admin-ui     | 70   | 8    | 표기만      | d.ts 7곳: 슬롯 임시 이름 `__VLS_n` 번호 이동(BaseDialog · CardLayout · ColumnPane) · 유니온 항 순서(`number \| string` ↔ `string \| number` 등) · `PermissionCheck` → `PermissionCheck<string>`(제네릭 기본값이 `string` 이라 같은 타입). `index.js` 1곳: 번들러가 `if … return` 을 `else if` · 삼항으로 다시 쓴 제어 흐름 표기(분기 뒤에 이어지는 코드 없음 — 같은 동작) |
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

즉 설치가 빠진 peer 를 알리고(경고), 빌드가 그 결과를 확인해 준다 — README 의 "함께 설치" 문장의 근거다. vue-router 5 를 쓰는 앱은 우연히 충족되므로 안내 문구는 "router 가 끌어오는 경우도 있다" 정도로 적을 수 있다. 스모크는 원상 복구했다(`@vue/devtools-api` 8.2.1 · vue-router ^5.4.0 추가, `autoInstallPeers` 줄 삭제, 빌드 성공).

### 6-6. 서버 앱 — TS 6.0.3 · NodeNext · `skipLibCheck: false`

pnpm 12.8.1 로 새로 설치(오류 · 경고 없음). `tsc -v` = `Version 6.0.3`, `tsc --noEmit` exit=0, 출처별 `{}` — `KIT+APP OK (0)`. `.` · `./runner` · `./migrations/0012_ip_access_rules` 세 진입점과 `AdminDatabase` 확장이 해석된다. 제3자 d.ts 오류도 없다.

## 7. 템플릿 preset/admin (V7)

## 8. ringside 에 고칠 것

## 9. 정리 · 남은 것
