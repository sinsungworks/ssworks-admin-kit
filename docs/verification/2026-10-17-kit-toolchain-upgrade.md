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

### 2-2. eslint 10 · typescript-eslint 8.71

### 2-3. vitest 5

### 2-4. Pinia 4

## 3. 실 DB — MariaDB 11.4 · 12.3

## 4. 발행물 비교 (V3)

## 5. changeset 드라이런 (V4)

## 6. 소비 앱 스모크 (V5 · V6)

## 7. 템플릿 preset/admin (V7)

## 8. ringside 에 고칠 것

## 9. 정리 · 남은 것
