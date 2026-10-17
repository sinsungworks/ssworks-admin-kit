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

## 5. changeset 드라이런 (V4)

## 6. 소비 앱 스모크 (V5 · V6)

## 7. 템플릿 preset/admin (V7)

## 8. ringside 에 고칠 것

## 9. 정리 · 남은 것
