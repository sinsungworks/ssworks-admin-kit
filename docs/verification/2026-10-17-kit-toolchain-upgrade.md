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

### 2-4. Pinia 4

## 3. 실 DB — MariaDB 11.4 · 12.3

## 4. 발행물 비교 (V3)

## 5. changeset 드라이런 (V4)

## 6. 소비 앱 스모크 (V5 · V6)

## 7. 템플릿 preset/admin (V7)

## 8. ringside 에 고칠 것

## 9. 정리 · 남은 것
