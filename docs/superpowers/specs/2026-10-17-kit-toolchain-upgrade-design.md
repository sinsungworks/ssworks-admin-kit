# 킷 버전 상향 설계 — ringside 선행 작업 (0.5.0)

작성일: 2026-10-17 · 상태: 구현 완료(2026-10-17 — 발행은 사람) · 선행: `docs/HANDOFF.md` 「킷 상향 준비 메모 (2026-10-17)」, ringside 기획서 `docs/ringside-dev-plan.html` 15.4 · 15.5 · 15.6 · 15.7(2026-10-13 기준선), `.changeset/README.md` 「0.x 동안의 peer 범위」, 템플릿 `kim5257-project-template` `preset/admin` CLAUDE.md 「킷 올리기」

## 1. 목표

첫 사용 프로젝트 ringside 의 계약 고정(**2026-10-30**) 전에, ringside 기준선에 맞춘 킷 릴리스 **0.5.0** 을 낼 준비를 끝낸다. 브랜치 `chore/kit-toolchain-upgrade`. 끝 상태:

- **admin-ui 가 Pinia 4 를 받는다** — peer `pinia ^4.0.0`(Pinia 3 은 더 받지 않는다). 쓰는 쪽은 `pinia@^4` 와 Pinia 4 의 필수 peer `@vue/devtools-api@^8` 을 설치한다.
- **킷이 ringside 와 같은 도구 위에서 초록이다** — TypeScript 6.0.3 · vitest 5 · eslint 10 · typescript-eslint 8.71 에서 `pnpm check`(check:dts 포함)가 초록이다. 발행 dist · d.ts 는 TS 6 으로 만들고, 동작은 바뀌지 않는다(발행물 diff 로 확인).
- **실 DB 테스트가 MariaDB 11.4 와 12.3 양쪽에서 돈다** — CI `db` 잡이 두 버전 매트릭스다. 로컬은 11.4 가 기본이고, 12.3 을 띄우는 스크립트를 따로 둔다.
- **템플릿 `preset/admin` 이 따라 올라간다** — 도구 상향 커밋 하나는 지금 완결한다. 킷 0.5.0 핀 커밋 하나는 릴리스 뒤에 잠금 파일을 채운다.
- **ringside 에 고칠 것 목록**이 나온다(ringside 는 읽기만 한다).

쓰는 쪽이 할 일: admin-ui 를 쓰는 앱은 `pnpm add pinia@^4 @vue/devtools-api@^8`. admin-shared · admin-server 만 쓰는 앱은 없음.

## 2. 결정

### 2-1. 경계 결정 (2026-10-17, 브레인스토밍)

| #              | 확정                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 릴리스 구성  | **한 브랜치 · 0.5.0 하나**(권장안). npm 에 닿는 것은 peer 범위와 TS 6 이 만든 dist · d.ts 뿐이다. 도구 · DB · CI 는 저장소 안의 일이지만, 같은 브랜치에 실어 0.5.0 의 d.ts 가 TS 6 소비자 검증을 거치게 한다                                                                                                                              |
| ② pinia peer   | **`^4.0.0` 만**(사용자 결정 — 권장안은 `^3 \|\| ^4` 였다). 시험할 조합이 하나다. 소비자 입장에서는 깨지는 변경이라 changeset 에 설치 안내를 적고, 템플릿도 Pinia 4 로 함께 올린다                                                                                                                                                         |
| ③ devtools-api | **peer 로 더하지 않는다**(권장안). admin-ui 는 `@vue/devtools-api` 를 import 하지 않는다. 필수 여부는 Pinia 4 자신의 peer(`^8.2.1`, `optional: false`)가 맡는다. admin-ui 가 범위를 따로 들면 Pinia 가 devtools-api 를 올릴 때 어긋난다. 설치 안내에만 함께 적는다. ringside 기획서 15.6 · 15.7 의 "peer 에 더한다" 는 고칠 목록에 넣는다 |
| ④ MariaDB      | **CI 매트릭스 11.4 + 12.3**(권장안). 스냅샷 격리 기본값이 다른 두 서버(11.4 OFF · 12.3 ON)를 매번 잰다. 로컬 `db:test:up` 은 11.4 그대로이고, `db:test:up:12.3`(컨테이너 이름 · 포트 33307)을 더한다                                                                                                                                      |
| ⑤ Node 26      | **이번엔 뺀다**(사용자 결정). Node 24 로만 검증한다. 패키지 engines `>=22` 는 이미 26 을 덮는다. `.nvmrc` 26 과 Node 26 검증은 26 LTS(10/27) 뒤 별도 작업이다                                                                                                                                                                             |
| ⑥ 템플릿 범위  | **도구도 함께 올린다**(사용자 결정). 킷 핀 · Pinia 4 에 더해 TS 6 · eslint 10 · vitest 5 · typescript-eslint 8.71. TS 6 으로 만든 d.ts 를 TS 5.9 소비자가 읽는지는 스모크 앱이 TS 5.9 로 한 번 더 돌아 잰다(§6 V5)                                                                                                                        |
| ⑦ 버전         | **0.5.0 · changeset 하나에 셋**(권장안). admin-ui `minor`, admin-shared · admin-server `patch`. `fixed` 라 셋 다 0.5.0                                                                                                                                                                                                                    |
| ⑧ 접근안       | **A — 필요한 만큼만**(권장안). 명시된 넷과, 그것 때문에 꼭 따라와야 하는 것만 메이저로 올린다. 나머지는 지금 범위 안의 최신으로 잠금 파일만 갱신한다                                                                                                                                                                                      |
| ⑨ 템플릿 커밋  | **두 커밋**(권장안). ⓐ 도구 상향(킷 0.4.1 유지)은 잠금 파일까지 지금 완결한다. ⓑ 킷 0.5.0 + Pinia 4 는 package.json 만 커밋한다. 잠금 파일은 릴리스 뒤 `pnpm install` 로 채워 ⓑ 에 amend 한다(§7)                                                                                                                                         |

### 2-2. 공통 결정

1. **테스트가 재던 의미를 바꾸지 않는다.** 도구의 새 기본값 때문에 깨진 테스트는 새 기본값에 맞춰 고친다. 단언을 지우거나 약하게 하지 않는다(§5).
2. **공개 API 는 peer 범위 하나만 바뀐다.** export · 시그니처 · 런타임 동작은 그대로다. 도구가 진짜 킷 결함을 찾으면 그때 고치고 changeset 에 한 줄 더한다.
3. **릴리스 흐름은 건드리지 않는다.** `@changesets/cli` 3 · `.changeset/config.json` · `release.yml` · `scripts/stage-release.mjs` 는 그대로다.
4. **ringside · 참조 프로젝트는 읽기만 한다.** 템플릿은 `preset/admin` 에서만 쓰고 `master` · `preset/db` · `preset/auth` 는 건드리지 않는다.

## 3. 근거 — 레지스트리 확인값 (2026-10-17 `npm view`)

| 패키지                                                         | 지금(킷)                  | 올릴 값                      | 확인한 사실                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pinia                                                          | peer `^3.0.0` · dev 3.0.4 | peer `^4.0.0` · dev `^4.1.0` | latest 4.1.0(10/14). 4.x 의 peer: `vue ^3.5.11` · `@vue/devtools-api ^8.2.1`(4.1.0 — 4.0.3 은 `^8.1.5`, `optional: false`) · `typescript >=5.6.0`(optional). 3.0.4 는 devtools-api `^7.7.7` 을 일반 의존으로 둔다. Pinia 4 의 깨지는 변경은 ESM 전용 · devtools-api 8 뿐이다(릴리스 노트) |
| @vue/devtools-api                                              | (간접 7.x)                | dev `^8.2.1`                 | latest 8.2.1(7/25)                                                                                                                                                                                                                                                                        |
| typescript                                                     | `~5.9.2`(5.9.3)           | `~6.0.3`                     | 6.x 의 마지막 판이 6.0.3(4/16)이다. latest 는 7.0.2                                                                                                                                                                                                                                       |
| typescript-eslint                                              | `^8.70.0`(8.71.0)         | `^8.71.2`                    | peer `typescript >=4.8.4 <6.1.0` · `eslint ^8.57 \|\| ^9 \|\| ^10` — TS 를 틸드로 묶는 이유                                                                                                                                                                                               |
| eslint                                                         | `^9.39.0`(9.39.5)         | `^10.13.0`                   | engines `^20.19 \|\| ^22.13 \|\| >=24`. `eslint:recommended` 변경 · eslintrc 제거(킷은 이미 flat)                                                                                                                                                                                         |
| @eslint/js                                                     | `^9.39.0`                 | `^10.0.1`                    | peer `eslint ^10`                                                                                                                                                                                                                                                                         |
| vitest                                                         | `^4.1.10`(4.1.11)         | `^5.0.5`                     | engines `^22.12 \|\| ^24 \|\| >=26`. peer `vite ^6.4 \|\| ^7 \|\| ^8`. 깨지는 변경 다수(§5-2)                                                                                                                                                                                             |
| vue-tsc                                                        | `^3.1.1`(3.3.11)          | 범위 안 최신                 | 3.3.13 peer `typescript >=5.0.0`                                                                                                                                                                                                                                                          |
| vite-plugin-dts                                                | `^5.0.0`(5.1.1)           | 범위 안 최신                 | 5.1.2 → unplugin-dts 1.1.2 peer `typescript >=4` · `@vue/language-core ^3.1.5`                                                                                                                                                                                                            |
| eslint-plugin-vue · vue-eslint-parser · eslint-config-prettier | 10.11 · 10.4 · 10.1       | 범위 안 최신                 | 셋 다 eslint 10 을 peer 로 받는다                                                                                                                                                                                                                                                         |
| (참고) Node                                                    | `.nvmrc` 24               | 그대로                       | 24.22.0 LTS · 26.12.0 Current(LTS 10/27)                                                                                                                                                                                                                                                  |
| (참고) MariaDB                                                 | `mariadb:11.4`            | + `mariadb:12.3`             | `12.3` = 12.3.3(10/02) · `11.4` = 11.4.13                                                                                                                                                                                                                                                 |

그대로 두는 메이저: `globals` 16(17 있음) · `happy-dom` 20(21 있음) · `@changesets/cli` 2(3 있음) — §11 후속.

## 4. 변경

### 4-1. 매니페스트

| 자리                        | 바꾼 뒤                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admin-ui `peerDependencies` | `pinia: ^4.0.0`                                                                                                                                                                       |
| admin-ui `devDependencies`  | `pinia ^4.1.0` · `@vue/devtools-api ^8.2.1` — 워크스페이스가 `autoInstallPeers: false` 라 Pinia 4 의 필수 peer 를 직접 둔다                                                           |
| 셋 + 루트 `devDependencies` | `typescript ~6.0.3` · `vitest ^5.0.5`                                                                                                                                                 |
| 루트 `devDependencies`      | `eslint ^10.13.0` · `@eslint/js ^10.0.1` · `typescript-eslint ^8.71.2`. 나머지(eslint-plugin-vue · vue-eslint-parser · eslint-config-prettier · prettier · globals 16)는 범위 안 최신 |
| 패키지 devDeps 의 나머지    | 범위 안 최신(vue-tsc · vite · vite-plugin-dts · @vitejs/plugin-vue · @vue/test-utils · happy-dom 20 · @types/node 24 …)                                                               |
| 루트 `engines.node`         | `>=22.13.0` — eslint 10 · vitest 5 의 하한. 저장소 개발용이다. 패키지 engines(admin-server `>=22`)는 런타임 계약이라 그대로                                                           |

`pnpm-lock.yaml` 은 `pnpm install` 로 다시 만든다. admin-ui `vite.config.ts` 의 external 은 이미 `pinia` 를 포함한다. `@vue/devtools-api` 는 import 하지 않으니 더하지 않는다.

### 4-2. changeset

파일 하나(`.changeset/pinia-4-toolchain.md`):

- `@ssworks/admin-ui`: **minor** — peer `pinia` 를 `^4.0.0` 으로(Pinia 3 은 더 받지 않는다). 쓰는 쪽이 고칠 것: `pnpm add pinia@^4 @vue/devtools-api@^8`(devtools-api 는 Pinia 4 의 필수 peer). admin-ui 코드는 바뀌지 않았다.
- `@ssworks/admin-shared` · `@ssworks/admin-server`: **patch** — TypeScript 6.0.3 으로 빌드한 dist · d.ts. 동작 변경 없음(§6 V3 의 diff 요약 한 줄).
- 도구가 찾은 킷 결함을 고쳤다면 그 패키지 줄에 더한다.

`fixed` 라 셋 다 0.5.0 이 된다. admin-server peer `>=0.4.0 <1.0.0` · admin-ui peer `^0` 은 0.5.0 을 덮으므로 `onlyUpdatePeerDependentsWhenOutOfRange` 아래에서 다시 쓰이지 않는다(V4 로 확인).

### 4-3. CI · 스크립트

- `ci.yml` `db` 잡: `strategy: { fail-fast: false, matrix: { mariadb: ['11.4', '12.3'] } }`, `name: db (${{ matrix.mariadb }})`, `services.mariadb.image: mariadb:${{ matrix.mariadb }}`. Node 는 `.nvmrc` 그대로. `check` 잡은 그대로다.
  - 🔴 검사 이름이 `db (11.4)` · `db (12.3)` 이 된다. main ruleset 의 필수 검사 `db` 는 다시 보고되지 않아 PR 이 대기에 걸린다. **사람이 PR 머지 전에** 필수 검사를 이 둘로 바꾼다(§10). → 구현 뒤 바뀜: 매트릭스를 모으는 `db` 잡을 두고 ruleset 은 그대로(§13 마지막 항목).
- 루트 scripts: `db:test:up:12.3` = `docker run -d --name admin-kit-test-db-12 -e MARIADB_ROOT_PASSWORD=admin-kit-test -p 33307:3306 mariadb:12.3`, `db:test:down:12.3` = `docker rm -f admin-kit-test-db-12`. 기존 `db:test:up` / `db:test:down` 은 그대로다.
- 12.3 에서 돌리는 법: `ADMIN_TEST_DB_URL=mariadb://root:admin-kit-test@127.0.0.1:33307` 을 주고 `pnpm test:db`. env 를 스크립트에 박지 않는다(cmd.exe 와 호환되지 않고 cross-env 가 필요해진다). CLAUDE.md 「명령어」에 bash · PowerShell 쓰는 법을 적는다.

### 4-4. 테스트 이름 · 주석

- `describe` 제목의 "실 MariaDB 11.4" 는 버전 중립인 "실 MariaDB" 로 바꾼다(`migrations.db.test.ts` · `connection.tls.db.test.ts` 등).
- 11.4 에 대해 참인 사실을 적은 주석(FOR SHARE 1064 · TIMESTAMP 범위 · TLS 11.4.1+ · 스냅샷 격리 기본 OFF)은 그대로 둔다. 12.3 에서 다르게 동작하는 것이 실측되면 그 사실을 더한다.
- admin-server README 「테스트」의 `pnpm db:test:up # docker mariadb:11.4` 줄 옆에 12.3 스크립트와 CI 매트릭스를 적는다.

## 5. 도구 상향 원칙

### 5-1. 커밋 순서

앞 단계가 `pnpm check` 초록이 된 뒤 다음으로 간다:

ⓐ TS 6.0.3 → ⓑ eslint 10 · `@eslint/js` 10 · typescript-eslint 8.71.2 → ⓒ vitest 5.0.5(`pnpm test:db` 11.4 포함) → ⓓ Pinia 4 · peer · README · changeset → ⓔ MariaDB 매트릭스 · 스크립트 · 테스트 이름 → 검증 · 문서.

ⓐ 앞에서 TS 5.9 빌드의 dist 를 떠 둔다(V3 기준선).

### 5-2. 깨졌을 때

- **vitest 5** — 새 기본값을 따른다.
  - "테스트 전 모의 함수 초기화"(clearMocks 기본): `beforeAll` · 모듈 최상단에서 심은 `mockReturnValue` 등에 기대던 테스트는 `beforeEach` 로 옮긴다.
  - "await 하지 않은 비동기 단언은 실패": `await` 를 붙인다. 붙이자 실패가 드러나면 킷 결함 후보다 → systematic-debugging.
  - "호이스팅 함수(`vi.mock` 등)가 최상단 밖이면 오류": 최상단으로 옮긴다.
  - `toThrow("")` · 제목 `$` 따옴표 · `-t` 구분자 · loupe → pretty-format 은 해당하는 곳만 고친다.
  - 설정으로 옛 동작을 되살리는 것(`clearMocks: false` 등)은 고칠 곳이 너무 많을 때만 하고, 설정 옆에 이유를 주석으로 적는다.
- **eslint 10** — `recommended` 의 새 규칙이 잡은 것은 코드를 고친다. 규칙을 통째로 끄지 않는다. 거짓 양성이면 그 줄에서만 끄고 이유를 적는다. `tseslint.config()` 가 폐기 경고를 내면 `defineConfig` 로 옮긴다.
  - 🔴 `preserve-caught-error` 류가 catch 안의 새 오류에 `cause` 를 요구하면 더하되, `AdminExceptionFilter`(`resolveErrorResponse`)의 응답 본문 · 로그에 `cause` 가 새지 않는지 확인한다(2a R9 마스킹).
- **TS 6** — 경고 · 새 기본값은 명시 설정으로 대응한다(tsconfig 은 이미 `types` 를 모두 명시하고, 6.0 이 경고하는 `baseUrl` · `moduleResolution: node` · `esModuleInterop: false` · `target: es5` 를 쓰지 않는다). `ignoreDeprecations` 는 쓰지 않는다. 새로 잡힌 타입 오류는 코드를 고친다. 고친 것이 발행 d.ts 를 바꾸면 V3 diff 에 이유를 적는다.
- **진짜 킷 결함**이 드러나면 크기에 맞는 흐름(systematic-debugging → test-driven-development)으로 고치고 changeset 에 더한다. 이 문서 §13 에 적는다.

## 6. 검증 (모두 실제로 돌린다)

| #   | 무엇                          | 어떻게 · 통과 기준                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | `pnpm check` · `format:check` | 올린 도구 위에서 초록. 테스트 수가 상향 전(같은 커밋에서 TS 5.9 · vitest 4 로 센 값)보다 줄지 않는다                                                                                                                                                                                                                                                                                   |
| V2  | `pnpm test:db` × 2            | 11.4(기존 `admin-kit-test-db` · 33306) → 12.3(`admin-kit-test-db-12` · 33307) **차례로**(겹쳐 돌리지 않는다). 둘 다 초록, 테스트 수가 같다                                                                                                                                                                                                                                             |
| V3  | 발행물 비교                   | 상향 전(TS 5.9) · 뒤(TS 6) `dist` 를 세 패키지 모두 임시 폴더에 떠서 diff 한다. 차이를 검증 기록에 분류해 적는다(표기만 · 의미 있음). 의미 있는 차이가 있으면 원인과 판단을 적는다                                                                                                                                                                                                     |
| V4  | changeset 드라이런            | 짧은 `%TEMP%` 경로의 worktree 에서 `pnpm install` → `changeset version` → 셋 다 0.5.0, admin-server peer `>=0.4.0 <1.0.0` · admin-ui peer `^0` 그대로, 1.0.0 없음. 이어서 `pnpm build` → 셋을 pack(V5 · V6 · V7 의 0.5.0 tarball)                                                                                                                                                      |
| V5  | 소비 앱 스모크(브라우저)      | `/smoke` 절차(admin-ui 의 모든 export 를 한 번씩 · `style.css`) + pinia 4.1.0 · `@vue/devtools-api` 8 · TS 6.0.3 · `skipLibCheck: false` → `vue-tsc --noEmit` · `vite build`. 오류를 출처별로 센다 — **`@ssworks/*` d.ts 에서 나온 오류 0** 이 기준이다(Vuetify d.ts 가 `skipLibCheck: false` 에서 깨지는 것은 알려진 제3자 문제라 따로 센다). 같은 앱을 TS 5.9.3 으로 한 번 더 돌린다 |
| V6  | 소비 앱 스모크(서버)          | NodeNext 앱이 `@ssworks/admin-server` 의 `.` · `./runner` · `./migrations/<코어 장 하나>` 를 import → TS 6.0.3 · `skipLibCheck: false` · `@types/node` · `@types/express` 로 `tsc --noEmit` 오류 0                                                                                                                                                                                     |
| V7  | 템플릿                        | §7                                                                                                                                                                                                                                                                                                                                                                                     |

- 임시 폴더 · worktree 는 짧은 `%TEMP%` 경로에 **포그라운드로** 만든다(긴 경로에서는 pnpm 설치가 os error 3 — 메모리). 끝나면 worktree · 임시 폴더 · 12.3 컨테이너 · 테스트 DB 를 지운다. 기존 `admin-kit-test-db` 와 내려받은 이미지는 남긴다.
- 결과는 `docs/verification/2026-10-17-kit-toolchain-upgrade.md` 에 적는다(명령 · 수치 · diff 요약 · 고친 것 · ringside 목록).

## 7. 템플릿 `preset/admin`

**커밋 ⓐ — 도구 상향(킷 0.4.1 유지, 지금 완결)**

- 루트: `eslint ^10.13.0` · `@eslint/js ^10.0.1` · `typescript-eslint` · `@typescript-eslint/eslint-plugin` · `@typescript-eslint/parser` `^8.71.2` · `typescript ~6.0.3`.
- frontend: `typescript ~6.0.3` · `vitest ^5.0.5` · `eslint ^10.13.0` · `eslint-config-vuetify ^4.7.2`(peer `eslint ^9.5 || ^10`) · `vue-tsc` 범위 안 최신. `@vue/tsconfig` 이 TS 6 에서 경고 · 오류를 내면 올린다.
- backend: `typescript ~6.0.3`. shared: `typescript ~6.0.3` · `vitest ^5.0.5`.
- pnpm 10.33 · `.nvmrc` 24 · 나머지는 그대로(접근안 A). 템플릿 CLAUDE.md · README 에 버전이 적혀 있으면 고친다.
- 검증: 템플릿 작업 폴더에서 `pnpm install` → lint · typecheck · test · build(+ format:check). 깨지면 §5 원칙대로 템플릿 코드를 고친다. Pinia 3 · 킷 0.4.1 그대로이니 peer 경고는 없어야 한다.

**커밋 ⓑ — 킷 0.5.0 + Pinia 4 (package.json 만)**

- `@ssworks/admin-shared` · `admin-ui` · `admin-server` 를 쓰는 곳 모두 `0.5.0`(캐럿 없이 — 「킷 올리기」 2). frontend `pinia ^4.1.0` · `@vue/devtools-api ^8.2.1`. 0.5.0 에 새 코어 장은 없으니 스텁도 더하지 않는다(「킷 올리기」 3).
- 검증: 짧은 `%TEMP%` 경로에 템플릿을 clone 해 ⓑ 를 체크아웃한다. `pnpm.overrides`(pnpm 10 — 루트 package.json)로 `@ssworks/*` 를 V4 tarball 에 붙인다(커밋하지 않는다). 그 뒤 `pnpm install` → lint · typecheck · test · build 를 돌리고 clone 을 지운다.
- 🔴 ⓑ 의 잠금 파일은 package.json 과 어긋난 채로 로컬에만 있다. **릴리스(0.5.0 공개) 뒤** 템플릿에서 `pnpm install` → 검사 넷 → `git add pnpm-lock.yaml && git commit --amend --no-edit` → push 한다. 그 전에 push 하면 템플릿으로 만든 앱의 설치가 깨진다. 절차는 HANDOFF 와 §10 에 둔다.

## 8. ringside 에 고칠 것 목록

- **훑는 문서**: ringside `CLAUDE.md` · `docs/summary.md` · `docs/ringside-dev-plan.html` · `docs/ringside-development-plan.html`(`gh api repos/sinsungworks/ssworks-ringside/contents/<경로>` 로 읽기만).
- **낡은 가정 넷**(HANDOFF):
  1. 킷 2b~2d 미완 — Phase 2 끝 · 0.4.1 공개.
  2. admin-server 미발행(workspace · git 의존) — npm 공개.
  3. 코어 장 7개 · "킷 스텁 0001~0007 + P1 0008~" — 코어 12장이다. 프로젝트 장은 타임스탬프 이름이다(번호 이름은 Kysely 정렬에서 충돌 — 템플릿 「킷 올리기」 3).
  4. `teams.enabled:false` — 킷에 없는 옵션이다. `AdminTeamsModule` 을 import 하지 않으면 된다.
- **이번 변경으로 생긴 것**:
  - 버전 표기("0.3 → Pinia 4 상향 후 0.4") → 0.5.0 셋 같은 번호.
  - "@vue/devtools-api v8 을 peer 에 더한다" → 더하지 않는다(설치는 한다).
  - Pinia 권장 핀 4.0.3 ↔ 킷 peer `^4.0.0`(dev 4.1.0 으로 시험).
  - 15.7 의 끝난 항목(0.3.0 승인 · AdminDbConnection TLS).
  - 15.6 "Node 26 · mariadb:12.3 으로 킷 확인" 중 12.3 만 끝남(Node 26 은 10/27 뒤).
  - 14.5 "TLS 옵션 없음 · 템플릿 없음" → 둘 다 있음.
  - 14.4 권한 카탈로그 초안이 켜는 킷 모듈의 슬롯(`ADMIN_PERMISSION_SLOTS` — `sessions.read/manage` · `auditLogs.read` · `roles.read/manage` · `users.read/manage` · `teams.*` · `legal.*` · `ipAccess.*`)을 덮는지.
  - 그 밖에 훑으며 찾은 것.
- **형식**: 항목마다 파일 · 위치(절 · 줄) · 지금 문장 · 고칠 내용 · 근거. 검증 기록의 한 절과 마지막 보고에 둔다.

## 9. 문서 갱신

- 이 스펙 · 플랜 `docs/superpowers/plans/2026-10-17-kit-toolchain-upgrade.md` · 검증 기록 `docs/verification/2026-10-17-kit-toolchain-upgrade.md`.
- `docs/HANDOFF.md`: 지금 상태 · 다음 플랜(Phase 4) · 「킷 상향 준비 메모」를 결과로 바꾼다 · 「발행 전에 사람이 해야 하는 것」에 §10 · 넘긴 것(§11).
- `CLAUDE.md`: 진행표의 「킷 버전 상향」 행을 완료로, Phase 4 를 다음으로. 「명령어」에 12.3 스크립트 · `ADMIN_TEST_DB_URL`. `admin-server` 절의 "CI `db` 잡 필수" 를 두 잡으로.
- `docs/01-phase0.md` §8: 진행 행.
- admin-ui README: 설치 줄 `pinia@^4 @vue/devtools-api@^8`, peer 표의 pinia 줄. admin-server README: 테스트 DB 줄(§4-4).

## 10. 사람이 할 일 (순서대로)

1. `main` push(브랜치는 `main` 에 로컬 fast-forward 로 병합 — 사용자 결정). ruleset 필수 검사(`check` · `db`)는 그대로 — CI `db` 가 매트릭스를 모은다(§13 마지막 항목).
2. push → release 워크플로가 Version Packages PR(0.5.0)을 연다.
3. 🔴 **Version Packages PR 머지 전에 admin-server Trusted Publisher 등록** — npmjs.com → `@ssworks/admin-server` → Settings: Trusted Publisher(GitHub Actions · `sinsungworks` / `ssworks-admin-kit` / `release.yml` · "Allow npm publish" 끔), Publishing access "Require two-factor authentication and disallow tokens". 안 하면 admin-server 스테이징만 OIDC 로 실패한다.
4. Version Packages PR 머지 → release 실행에서 셋 스테이징 → `pnpm stage list`(셋) → `pnpm stage approve <id>` ×3 → `git pull && pnpm changeset tag && git push --tags`.
5. `.changeset/README.md` 5단계: `npm view @ssworks/<패키지>@0.5.0 dist.attestations.provenance.predicateType --prefer-online` — 셋 다 `https://slsa.dev/provenance/v1`. admin-server 는 이것이 첫 OIDC 확인이다(기준선: 0.4.1 은 없음).
6. 템플릿: `preset/admin` 에서 `pnpm install` → lint · typecheck · test · build → 잠금 파일을 ⓑ 에 amend → push.
7. ringside 문서를 목록대로 고친다.
8. (10/27 뒤 별도 작업) Node 26 — `.nvmrc` 26 · CI · 로컬 검증.

## 11. 비범위 · 후속

- Node 26(`.nvmrc` · CI 매트릭스) — 26 LTS(10/27) 뒤.
- `globals` 17 · `happy-dom` 21 · `@changesets/cli` 3 메이저 — 따로.
- 템플릿의 pnpm 12 · Node 26.
- TypeScript 7 — ringside 15.6 과 같이 보류(typescript-eslint peer `<6.1.0`).
- 실서버 확인이 넘긴 결함 둘(기본 정렬 열 오름차순 · 조회 실패 직후 빈 상태) — 그대로 열려 있다.

## 12. 플랜에서 먼저 확인할 위험

1. **TS 6 기본값 변경** — `rootDir` 기본(tsconfig 폴더), `noUncheckedSideEffectImports`(`import 'reflect-metadata'` · CSS import), `types` 기본 `[]`, `strict` 기본. 킷은 대부분 명시하지만 vite-plugin-dts(unplugin-dts)가 d.ts 경로 · 묶음을 바꾸는지 V3 로 본다.
2. **vue-tsc · unplugin-dts 와 TS 6** — Volar 가 TS 6 을 받는지 typecheck · build 로 확인한다. 안 되면 플랜 단계에서 멈추고 묻는다.
3. **Nest 데코레이터 메타데이터** — TS 6 emit 의 `design:paramtypes` 는 `decorator-metadata.test.ts` · DB 없는 HTTP 테스트 · test:db 의 DI 부팅이 잰다.
4. **vitest 5 의 모의 함수 초기화 · await 안 한 단언** — 수정량을 ⓒ 첫 실행에서 센다. 많으면 §5-2 의 설정 대안을 판단한다.
5. **eslint 10 recommended** — 새 규칙이 admin-server 의 catch 재던지기를 잡을 수 있다(§5-2 🔴 cause 마스킹).
6. **MariaDB 12.3** — 전역 스냅샷 격리 ON 을 가정하지 않던 테스트(`concurrency.db.test.ts` 의 `@@global` 읽기 등), `whileHeld` 가 읽는 `SHOW ENGINE INNODB STATUS` 의 잠금 대기 형식, TLS 자체 서명 · 드라이버 지문 검증(`connection.tls.db.test.ts`), 기본 문자 집합 · 정렬 규칙 차이.
7. **템플릿** — `@vue/tsconfig` · `@tsconfig/node22` 가 TS 6 에서 경고하는 옵션을 쓰는지, eslint-config-vuetify 4.7.2 가 eslint 10 위에서 오류 없이 도는지, vitest 5 가 템플릿 테스트에서 위 4 와 같은 수정을 요구하는지.
8. **Windows** — `/dev/null` 금지 · 긴 경로 · LF. 12.3 테스트의 env 는 Git Bash 에서 `ADMIN_TEST_DB_URL=… pnpm test:db` 로 준다.

## 13. 구현 중 정정

- eslint 범위 `^10.12.0`(스펙 §3 · §4-1 의 `^10.13.0` 대신, 킷 · 템플릿 둘 다): 10.13.0(2026-10-16T14:24Z 공개)이 pnpm 12 기본 minimumReleaseAge(1일) 안이었고, 공급망 방어에 영구 예외(`minimumReleaseAgeExclude`)를 두지 않기로 했다. 10.12.0 은 ringside 15.5 기준선이다. 템플릿은 pnpm 10.33 이라 잠금 파일이 10.13.0 으로 풀렸다.
- V4 changeset 드라이런: worktree 의 `changeset version` 은 권한 계층에 막혔다(`.claude/settings.json` deny `pnpm version-packages` → 자동 모드 분류기가 `pnpm exec changeset version` 도 우회로 거부). 사용자 결정으로 `pnpm changeset status --verbose`(셋 다 0.5.0 · major 없음)로 대신했다. peer 재작성 · CHANGELOG 는 Version Packages PR 에서 사람이 본다. tarball 은 HEAD 를 그대로 pack 했다(`ssworks-admin-*-0.4.1.tgz`, 내용은 0.5.0 과 같음).
- 템플릿 커밋 ⓑ 에 frontend `vue ^3.5.34` · `vue-router ^5.2.0` 과 다시 만든 `typed-router.d.ts` 를 더했다. vue-router 5.0.4 의 optional peer 가 `pinia ^3.0.4` 라 Pinia 4 에서 경고가 났다. 5.2.0 이 `^3.0.4 || ^4.0.2` 로 넓힌 첫 판이고 vue ^3.5.34 를 요구한다. vue-router 5.4.0 은 typed-router 생성 형식이 달라 옛 파일로는 TS2345 가 났다. 커밋된 `typed-router.d.ts` 가 5.4.0 출력이고 5.4.0 에서만 typecheck 했으므로 최종 리뷰에서 하한을 `vue-router ^5.4.0` 으로 올렸다(5.2.0 은 Pinia 4 를 받는 첫 판일 뿐) — ⓑ 는 `ddf1d7d`. 새 설치가 이미 Task 9 에서 5.4.0 으로 풀렸으므로 재설치 · 재검증은 하지 않았다.
- 템플릿 ⓐ 의 TS 6 수정 둘: shared `tsconfig.build.json` `rootDir`(TS5011)와 frontend `src/vuetify-styles.d.ts`(TS2882 — 템플릿이 vuetify 4.0.4 로 잠겨 있고, TS 6 기본 `noUncheckedSideEffectImports: true`). 킷 스모크(vuetify 4.2.6)는 오류가 없었다.
- V5 스모크는 처음에 전역 pnpm 10.33.3 으로 돌았다(스모크에 `packageManager` 없음). `packageManager: pnpm@12.8.1` 을 넣고 다시 쟀다.
- 킷 코드는 TS 6 · ESLint 10 · Vitest 5 · MariaDB 12.3 에서 고친 곳이 없었다. 예외는 ESLint 10 `preserve-caught-error` 의 줄 단위 끄기 하나다(`packages/admin-server/src/database/connection.ts` readCaFile — `cause` 를 달면 CA 파일 경로가 로그로 샌다).
- 필수 검사(§4-3 · §10 정정, 사용자 결정 2026-10-17): ruleset 의 필수 검사 이름을 매트릭스 이름 둘로 바꾸는 대신, 매트릭스 잡을 `db-matrix`(검사 이름 `db (11.4)` · `db (12.3)`)로 두고 결과를 모으는 `db` 잡(`needs: db-matrix` · `if: always()` · 결과가 `success` 가 아니면 `exit 1`)을 더했다. ruleset 의 `check` · `db` 는 그대로이고, MariaDB 버전을 더하거나 빼도 ruleset 을 고치지 않는다. `if: always()` 가 없으면 매트릭스 실패 때 `db` 가 건너뛰어지고, 건너뛴 필수 검사는 통과로 친다. 브랜치는 PR 대신 `main` 에 로컬 fast-forward 로 병합했다(사용자 결정).
