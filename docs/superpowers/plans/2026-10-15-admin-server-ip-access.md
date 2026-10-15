# admin-server IP 접근 제어 (Phase 2 PR 2f-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2f-1 스펙대로 `AdminIpAccessModule` 을 만든다 — `/admin/ip-access` 다섯 라우트(목록 · 미리보기 · 만들기 · 수정 · 삭제), 장 `0012_ip_access_rules` + global 허용 두 행 시드, user > team > global 평가(가장 가까운 층 하나 · 기본 거부 · IPv4 · IPv6)가 로그인 · 매 요청 · refresh 를 막는다. 클라이언트 IP 출처는 코어 옵션 `clientIp`. 전권자 잔존 셈은 IP 모듈이 있으면 "적용 층이 global 인" 전권자만 세고, IP 쓰기 셋 · 사용자 `teamNo` 변경이 잔존 지점이 된다. 요청자 자신을 막는 규칙 변경은 409, 규칙이 가리키는 팀의 삭제도 409 다.

**Architecture:** 순수 파서 · 층 판정 · 평가 · 스키마는 admin-shared `ip-access.ts`(화면과 서버가 같은 파서). 서버는 전역 `AdminIpAccessModule` 이 `ADMIN_ACCESS_POLICY`(2b 가 만든 자리 — 요청마다 규칙을 비잠금으로 읽음)와 내부 표시 토큰 `IP_ACCESS_ENABLED` 를 낸다. 역할 · 사용자 서비스가 그 토큰을 `@Optional()` 로 받아 `withSuperAdminSurvival(trx, steps, { ipAware })` 에 넘긴다. IP 쓰기는 잔존 가드 행(첫 문장) → 잠금 단계(대상 규칙 · 가리키는 팀/사용자 행 FOR UPDATE) → 셈 → 쓰기 → 자기 잠금 판정(같은 트랜잭션에서 규칙을 다시 읽어 요청자를 평가) → 후 셈이다.

**Tech Stack:** NestJS 12.1 (ESM · NodeNext) · Kysely 0.29 + MariaDB 11.4 · zod 4 · vitest 4 · supertest · TypeScript 5.9

**Spec:** `docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md` 전부 — §1 · §2-1 ①~⑦ · §2-2 #1~#5 · §2-3 P1~P15 · §4 · §5-1~§5-7 · §6 · §8 · §9 · §10 · §11 · §13 · **§14 R1(이 플랜 전 실측)**. 정본은 `../hangang-home` 의 IP 파일(스펙 §3). 어긋나면 스펙이 이긴다. 직전 PR 2e-2 플랜 `docs/superpowers/plans/2026-10-15-admin-server-legal.md`(모듈 · 장 · 경합 테스트 모양), 잔존 잠금 단계는 2d-3 플랜 `docs/superpowers/plans/2026-10-15-admin-server-accounts-cleanup.md`.

**구현자 규칙(모든 Task):** 테스트를 먼저 만들고 **구현 전에 돌려 RED 를 보고서에 붙인다**(실패 메시지 몇 줄 · 명령과 출력). 그다음 구현 · GREEN · 커밋. 🔴 표시가 붙은 잠금 · 순서 테스트는 구현 뒤에 해당 줄을 일부러 되돌려 RED 를 한 번 더 보고(보고서에 명령 · 출력을 적고) 되돌린다. 실험이 RED 를 내지 않으면 이유와 함께 적는다. 리뷰어는 이 플랜의 해당 Task 와 Global Constraints 를 **먼저 다 읽고** 리뷰한다.

## Global Constraints

- ESM 전용 · `module: NodeNext`. 내부 상대 import 는 `.js` 확장자. `console.log` 금지(`Logger.warn` · `error` 만).
- `admin-server/src` 는 `import type` 분리 규칙의 예외다(DI 메타데이터) — 단 데코레이터가 붙은 시그니처에 쓰는 **인터페이스 · 타입 별칭은 `import type`**(TS1272: `AdminPrincipal` · `ResolvedIpAccessConfig` · `AdminIpRuleCreateBody` · `AdminIpPreviewQuery` · `Request` …), DI 로 받는 **클래스는 일반 import**(`AdminReauthService` · `AdminIpAccessService`).
- 정본에서 옮긴 파일은 머리 주석에 `정본:` · `바꾼 점:` · `🔴` 를 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 🔴 **IP 쓰기 순서**(스펙 §5-3 · P6 · P7): 재인증(옵션)은 트랜잭션 밖 → `runWriteTransaction` → `withSuperAdminSurvival(trx, { lock, write }, { ipAware: true })`. `lock` 에는 **잠금 읽기와 판정만**(`lockRule` · `revision` · 병합 범위 판정 · `lockScopeRef`), `write` 에는 INSERT · UPDATE · DELETE → `assertNotSelfLockout`(규칙 전량 비잠금 다시 읽기 → 요청자 평가 → 거부면 409) → 결과 행 읽기. 🔴 잠금 단계에 비잠금 SELECT 를 두지 않는다 — 스냅샷 격리 ON 에서 1020 이 된다(§14 R1-②).
- 🔴 **`ipAccessRules` 를 잠그는 곳은 IP 쓰기의 대상 행(`lockRule`)뿐이다.** 정책(매 인증) · 잔존 셈 · 팀 삭제 셈 · 미리보기 · 자기 잠금 판정은 비잠금이다. 평가에 필요한 세 열 읽기는 `ipRuleSetQuery` 하나다.
- 🔴 **층 판정은 admin-shared `applicableIpLayer` · `evaluateIpAccess` 하나다.** 정책 · 잔존 셈 · 미리보기 · 자기 잠금이 같은 함수를 쓴다. 대표 팀은 `MIN(teamNo)`(인증 `findPrincipal` 과 같은 규칙) — 정책은 `AdminAccessContext.teamNos`, 셈은 서브쿼리, 미리보기는 `buildLockoutCandidates` 가 같은 값을 고른다.
- 🔴 **`ipAware` 는 토큰 `IP_ACCESS_ENABLED` 유무로만 정한다**(P3) — 규칙 표 · 행의 유무가 아니다. IP 서비스는 늘 `true` 를 넘긴다.
- 🔴 **기본 거부**: `evaluateIpAccess` 는 층이 없거나 주소가 `null` 이면 `false`. 장의 시드(global `0.0.0.0/0` · `::/0`) 덕에 모듈을 import 해도 아무도 잠기지 않는다 — 계열이 다르면 매칭하지 않으므로 두 행이다.
- 🔴 정규식에 백슬래시 문자 클래스(`\d` 등)를 쓰지 않는다 — `[0-9]` 로 적는다(아래 도구 규칙).
- 이름: 슬롯 `'ipAccess.read'` · `'ipAccess.manage'`, 감사 액션 `setting.ipAccess.create` "IP 규칙 추가" · `setting.ipAccess.update` "IP 규칙 수정" · `setting.ipAccess.delete` "IP 규칙 삭제", 대상 `ipAccessRule` "IP 규칙", 오류 코드 `ERR_TEAM_HAS_IP_RULES`(409), 장 `0012_ip_access_rules`, 표 `ip_access_rules`, 인덱스 `idx_ip_access_rules_scope`, 토큰 `ADMIN_IP_ACCESS_CONFIG` · `IP_ACCESS_ENABLED`, 라우트 `@Controller('ip-access')`, 코어 옵션 `clientIp: 'req.ip' | 'x-real-ip'`(타입 `AdminClientIpSource`).
- 문구(한 곳씩):
  - admin-shared `IP_ACCESS_SCHEMA_MESSAGES`: `cidr` = `IPv4 · IPv6 CIDR 형식이 아닙니다. 예: 203.0.113.0/24, 2001:db8::/32` · `scopeRefRequired` = `팀 · 사용자 규칙은 대상을 골라야 합니다.` · `scopeRefForbidden` = `전체 규칙에는 대상을 두지 않습니다.` · `previewField` = `이 미리보기에는 이 칸이 필요합니다.`
  - admin-server `ip-access/errors.ts` 의 `IP_ACCESS_MESSAGES`: `ruleNotFound` = `IP 규칙을 찾을 수 없습니다.`(404 `ERR_COMMON_NOT_FOUND`) · `ruleRevisionMismatch` = `다른 관리자가 먼저 이 규칙을 바꿨습니다. 새로 불러온 내용을 확인하세요.`(409 `ERR_COMMON_REVISION_CONFLICT`) · `selfLockout` = `이 변경을 저장하면 지금 접속한 위치에서 로그인할 수 없게 됩니다.`(409 `ERR_COMMON_CONFLICT` + `details.clientIp`) · `noScopeTeam` = `대상 팀을 찾을 수 없습니다.` · `noScopeUser` = `대상 사용자를 찾을 수 없습니다.`(400 칸 오류 `scopeRefNo`)
  - `TEAM_MESSAGES.teamHasIpRules` = `이 팀(하위 팀 포함)을 가리키는 IP 규칙이 있어 지울 수 없습니다. 규칙을 먼저 지우세요.`(409 `ERR_TEAM_HAS_IP_RULES` + `details.ruleCount`)
  - `ACCOUNT_MESSAGES.lastSuperAdmin`(넓힘) = `이 변경 뒤에는 어디서든 로그인할 수 있는 전체 권한 관리자가 한 명도 남지 않습니다. 먼저 다른 관리자에게 전체 권한 역할을 주거나 접속 IP 제한을 푸세요.`
  - `clientIp` 옵션 오류 = `clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.`
- 테스트: 단위 · DB 없는 HTTP 는 `*.test.ts`(`pnpm check`), 실 MariaDB 는 `*.db.test.ts`(Docker 컨테이너 `admin-kit-test-db` 가 떠 있어야 한다). 🔴 DB 테스트 하나만 돌리는 명령은 `pnpm --filter @ssworks/admin-server test:db <이름>` — `--` 를 넣으면 거르지 않는다. 단위는 `pnpm --filter @ssworks/admin-server test <이름>` · `pnpm --filter @ssworks/admin-shared test <이름>`. lint 는 **루트 `pnpm lint`**, 타입은 `pnpm --filter <패키지> typecheck`, 전체는 `pnpm check` · `pnpm test:db`.
- 🔴 `pnpm test:db` 는 한 번에 하나만 돌린다 — 겹치면 공유 DB 서버의 DDL 부하로 거짓 실패한다.
- 🔴 테스트 본문(`it`)에서 `createTestDatabase()` 를 부르지 않는다 — `beforeAll` · `afterAll`(hookTimeout 60초)에서. 전역 `testTimeout` 은 올리지 않는다.
- 🔴 **규칙은 DB 전역 상태다.** 규칙을 바꾸는 DB 테스트 파일은 `beforeEach(() => resetIpRules(t.db))`(Task 9 의 도우미 — 시드 두 행만 남긴다)로 시작 상태를 맞춘다. 🔴 잔존 셈은 DB 전역 상태(전권자 수)에 달렸다 — `seedRole(t.db)` 의 기본 권한은 `['*']` 이므로 늘 `permissions` 를 명시한다. 이름 · 아이디는 `utf8mb4_unicode_ci` 다 — 대소문자 · 끝 공백만으로 가르지 않는다.
- 🔴 원시 연결(`mariadb.createConnection`)은 `try/finally` 로 롤백 · 종료한다(`whileHeld` · `underHeld` 가 한다). 기다리는 동안 거부될 수 있는 프로미스는 `settle` 로 바로 받아 둔다. 원시 SQL 의 식별자는 snake_case 다(`guard_locks` · `ip_access_rules` · `user_no`). 스냅샷 Kysely 는 `await snapshotKysely(t, on)` 으로 만들고 `finally` 에서 `destroy()` 한다.
- 🔴 경합 테스트는 **공개 서비스 메서드**를 거친다. 잠금 대기는 `whileHeld`(STATUS 폴링)로 보고 **`reached` 를 단언한다**(Task 1). `information_schema.innodb_trx` 는 쓰지 않는다.
- 테스트 코드도 린트를 통과한다(쓰이지 않는 변수 · import 없음). 같은 범위의 지역 변수 이름을 겹쳐 쓰지 않는다. bigint 가 든 HTTP 본문은 `stringifyJSON` 으로 보낸다(`sendJson`).
- admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server 가 본다(`dist/` import).
- 셸: Windows(Git Bash) · Linux 양쪽. 🔴 출력을 `/dev/null` 로 보내지 않는다(Windows 에 `NUL` 파일이 생긴다) — 출력 억제 자체를 하지 않는다. 파일을 python · sed 로 다시 쓰지 않는다(LF). pnpm 설치는 짧은 `%TEMP%` 경로에서 한다.
- 🔴 도구 입력의 백슬래시 이스케이프는 JSON 으로 풀린다 — 새 코드 · 테스트에 백슬래시를 쓰지 않는다(줄바꿈은 `String.fromCharCode(10)`, 따옴표가 겹치면 템플릿 리터럴). 기존 파일의 백슬래시가 든 줄을 고쳤다면 `node -e` 와 `charCodeAt` 으로 그 자리 바이트를 확인한다.
- 플랜의 코드 블록은 prettier 를 거치지 않았다 — 커밋 전에 바꾼 파일에 `pnpm exec prettier --write <파일…>` 을 돌린다. 긴 마크다운은 두 번 돌리고 `--check` 한다.
- 커밋: 한국어 conventional commits. 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `gh pr merge` · `pnpm release` · `npm publish` · `pnpm stage approve` 는 하지 않는다.

## Review Focus

스펙이 함의하지만 스펙의 테스트 목록이 재지 않는, 사람이 먼저 부딪힐 입력 다섯. 각 줄의 테스트를 담당 Task 에 넣었다.

1. **호스트 비트가 남은 CIDR(`203.0.113.9/24`)** — 관리자가 자기 주소에 `/24` 를 붙여 적는다. 거부하지 않고 네트워크 `203.0.113.0/24` 처럼 매칭한다(프리픽스 비트만 비교). → Task 2 "호스트 비트".
2. **대문자 · 축약이 섞인 IPv6(`2001:DB8::1` ↔ `2001:db8:0:0::/32`)** — 표기만 다르고 같은 주소면 매칭한다. → Task 2 "IPv6 표기".
3. **앞뒤 공백이 붙은 CIDR(`10.0.0.0/8`)** — 스키마가 떼고 저장하며 평가가 통과한다(복사 · 붙여넣기). → Task 2 스키마 · Task 12 HTTP "공백".
4. **다른 관리자가 방금 지운 규칙의 수정 미리보기(`op=update&ruleNo=<지운 번호>`)** — "바뀌는 것 없음" 이 아니라 404 다(화면이 낡았다는 사실을 숨기지 않는다). → Task 8 `nextRulesOf` · Task 12 HTTP "지운 규칙 미리보기".
5. **두 팀에 걸친 계정에서 큰 번호 팀에만 팀 규칙이 있을 때** — 대표 팀(작은 번호)에 규칙이 없으므로 그 사람은 global 층이다. 정책 · 잔존 셈 · 미리보기가 같은 답을 낸다. → Task 5 셈 · Task 9 정책 · Task 8 미리보기.

## 파일 구조

| 파일                                                                                                                                                                                                                                                                                                                           | 책임                                                                       | Task |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---- |
| `test-support/concurrency.ts` · `concurrency.db.test.ts` · `teams/teams.guard.db.test.ts` · `legal/legal.guard.db.test.ts` · `roles/roles.index.db.test.ts`                                                                                                                                                                    | `underHeld` · `holdGuard` · `whileHeld` 의 `reached` · 연결 정리           | 1    |
| `packages/admin-shared/src/ip-access.ts`(새) · `ip-access.test.ts`(새) · `audit.ts` · `audit.test.ts` · `error-codes.ts` · `error-codes.test.ts` · `index.ts`                                                                                                                                                                  | 파서 · 평가 · 범위 판정 · 스키마 · 카탈로그 · 오류 코드                    | 2    |
| (새) `database/migrations/0012_ip_access_rules.ts` · `migrations/index.ts` · `ddl.test.ts` · `index.test.ts` · `migrations.db.test.ts` · (새) `database/tables/ip-access-rules.ts` · `database/types.ts` · `runner.ts`                                                                                                         | 장 · 표 타입                                                               | 3    |
| `auth/request-meta.ts` · `.test.ts` · `auth/options.ts` · `options.test.ts` · `auth/admin-auth.module.ts` · `auth/auth.service.ts` · `audit/options.ts` · `options.test.ts` · `audit/audit.module.ts` · `audit/entry.ts` · `entry.test.ts` · `audit/audit.interceptor.ts` · `audit/auth-events.ts` · `options.ts` · `index.ts` | `clientIp` 출처                                                            | 4    |
| (새) `ip-access/rule-set.ts` · `accounts/super-admin.ts` · `super-admin.db.test.ts` · (새) `super-admin.ip.db.test.ts` · `accounts/errors.ts` · `tokens.ts` · `roles/roles.service.ts` · `users/users.service.ts` · `users/users.team.db.test.ts`                                                                              | IP 를 아는 잔존 셈 · 표시 토큰 · 사용자 `teamNo` 잔존                      | 5    |
| `auth/auth.service.ts` · `auth.service.refresh.db.test.ts`                                                                                                                                                                                                                                                                     | refresh · 유예 발급의 IP 검사                                              | 6    |
| `teams/teams.service.ts` · `teams/errors.ts` · `teams/teams.delete.db.test.ts`                                                                                                                                                                                                                                                 | 규칙이 가리키는 팀 삭제 409                                                | 7    |
| (새) `ip-access/errors.ts` · `preview.ts` · `preview.test.ts` · `queries.ts` · `queries.test.ts`                                                                                                                                                                                                                               | 문구 · 미리보기 판정(순수) · 목록 · 미리보기 쿼리                          | 8    |
| (새) `ip-access/options.ts` · `rule-locks.ts` · `ip-access.service.ts` · `ip-access.policy.ts` · `ip-access.service.db.test.ts` · `ip-access.survival.db.test.ts` · (새) `test-support/ip-access.ts` · `tokens.ts`                                                                                                             | 설정 · 잠금 읽기 · 서비스(목록 · 미리보기 · CRUD) · 정책                   | 9    |
| (새) `ip-access/ip-access.race.db.test.ts`                                                                                                                                                                                                                                                                                     | 가드 직접 관찰 · 팀 삭제 경합 양쪽 · IP 쓰기 직렬화 · 스냅샷 ON            | 10   |
| (새) `ip-access/ip-access.body.ts` · `ip-access.controller.ts` · `ip-access.module.ts` · `ip-access.module.test.ts` · `auth/permission-slots.ts` · `.test.ts` · `admin-server.module.ts` · `index.ts` · `test-support/accounts.ts` · `test-support/admin-app.ts`                                                               | 파이프 · 다섯 라우트 · 전역 모듈 · 슬롯 둘 · 배선 · 테스트 앱              | 11   |
| (새) `ip-access/ip-access.http.db.test.ts` · `ip-access.auth.db.test.ts`                                                                                                                                                                                                                                                       | HTTP 계약 §6 전 행 · 감사 diff · 인증 연결(로그인 · 가드 · refresh · 헤더) | 12   |
| `packages/admin-server/README.md` · `.changeset/admin-server-ip-access.md` · 스펙 §13 대상 문서 · 스펙 §14 · `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`                                                                                                                                                             | 문서 · 릴리스 · 쓰는 쪽 스모크                                             | 13   |

(Task 1 · 3~13 의 경로는 `packages/admin-server/src/` 부터 적는다. Task 2 는 `packages/admin-shared/src/`.)

**플랜 전 실측(스펙 §14 R1 에 적었다):** (b) 팀 삭제 ∥ 규칙 쓰기는 팀 행에서 줄을 선다 — 규칙 쪽이 먼저면 팀 삭제가 기다린 뒤 규칙 셈 1(→ 409), 팀 삭제가 먼저면 규칙 쪽 참조 잠금이 기다린 뒤 행 없음(→ 400), ON · OFF 같고 1020 이 없다. (a) 대상 사용자의 로그인 실패를 쥔 동안 "가드 → 참조 잠금 → 셈 → INSERT" 는 기다렸다 성공, "가드 → 셈 → 참조 잠금" 은 ON 에서 1020(RED 모양). (c) `MIN(teamNo)` 대표 팀 서브쿼리는 소속 둘이면 작은 번호(bigint), 무소속이면 `null`. (e) `X-Real-IP` 중복은 `'a, b'` 한 문자열, 듀얼스택 listen 의 IPv4 는 `'::ffff:127.0.0.1'`(supertest 도 이 모양 — 정규화 뒤 `'127.0.0.1'`).

**권장 모델(Subagent-driven):** 구현 — Task 1 · 3 · 7 haiku(명세 확정 1~2파일 · 한 함수), 나머지 sonnet. 리뷰 — Task 5 · 9 · 10(잔존 · 서비스 · 경합) opus, 나머지 sonnet. 최종 whole-branch 리뷰 opus.

---

### Task 1: 경합 도우미 — `underHeld` · `holdGuard` · `whileHeld` 의 `reached` · 연결 정리

**Files:**

- Modify: `test-support/concurrency.ts`(머리 주석 한 줄 · `whileHeld` · 새 `holdGuard` · `underHeld` · `UnderHeld`)
- Modify: `test-support/concurrency.db.test.ts`(기대값 셋 · 새 테스트)
- Modify: `teams/teams.guard.db.test.ts` · `legal/legal.guard.db.test.ts` · `roles/roles.index.db.test.ts`(복사본을 도우미로)

**Interfaces:**

- Produces: `holdGuard(lockName: string): (connection: Connection) => Promise<unknown>` · `underHeld<T>(t: TestDatabase, hold: (connection: Connection) => Promise<unknown>, run: () => Promise<T>, options?: { timeoutMs?: number }): Promise<UnderHeld<T>>` · `interface UnderHeld<T> { waited: boolean; result: Settled<T> }` · `whileHeld(...)` 의 반환 `Promise<Settled<T> & { reached: boolean }>`. Task 10 이 셋 다 쓴다.

- [ ] **Step 1: 테스트를 고친다**

`test-support/concurrency.db.test.ts`:

① import 줄 `import { lockWaitsIn, sleep, snapshotKysely, whileHeld } from './concurrency.js'` 를 바꾼다:

```ts
import {
  holdGuard,
  lockWaitsIn,
  sleep,
  snapshotKysely,
  underHeld,
  whileHeld,
} from './concurrency.js'
```

② `describe('whileHeld')` 의 첫 세 `it` 의 기대값을 바꾼다 — 각각:

```ts
expect(result).toEqual({ ok: true, value: 'held-1', reached: true })
```

```ts
expect(result).toEqual({ ok: true, value: before, reached: false })
```

```ts
expect(result).toEqual({ ok: true, value: 'held-3', reached: false })
```

③ 넷째 `it`('waiters …')의 `if (!result.ok) throw result.error` 바로 위에 한 줄을 더한다:

```ts
expect(result.reached).toBe(true)
```

④ `describe('lockWaitsIn')` 바로 위에 더한다:

```ts
describe('underHeld', () => {
  it('🔴 run 이 쥔 행을 기다리면 waited true — 풀린 뒤 커밋된 값을 본다', async () => {
    const { waited, result } = await underHeld(t, holdWith('under-1'), lockedRead)
    expect(waited).toBe(true)
    expect(result).toEqual({ ok: true, value: 'under-1' })
  })

  it('기다리지 않는 run 은 waited false — 쥔 쪽 커밋 전 값을 읽었다', async () => {
    const before = await plainRead()
    const { waited, result } = await underHeld(t, holdWith('under-2'), plainRead)
    expect(waited).toBe(false)
    expect(result).toEqual({ ok: true, value: before })
    expect(await plainRead()).toBe('under-2')
  })

  it('holdGuard — 가드 행 하나를 쥔다(그 행의 잠금 읽기가 기다린다)', async () => {
    const { waited, result } = await underHeld(t, holdGuard('heldProbe'), lockedRead)
    expect(waited).toBe(true)
    if (!result.ok) throw result.error
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db concurrency`
Expected: FAIL — `holdGuard` · `underHeld` 가 export 되지 않았다(SyntaxError 또는 `is not a function`), `whileHeld` 기대값에 `reached` 가 없다.

- [ ] **Step 3: `concurrency.ts` 를 고친다**

① 머리 주석의 마지막 줄(`//   경합을 재지 못하는 거짓 결과가 없다. 🔴 information_schema.innodb_trx 는 …`) 다음에 한 줄을 더한다:

```ts
// 2f-1(스펙 P15): 잠금을 쥔 채 관찰하는 루프(teams.guard · legal.guard · roles.index 의 복사본)를 underHeld 로 모았고, whileHeld 가
//   대기에 닿았는지(reached)를 돌려준다 — 경합 테스트가 경합 창에 닿았음을 단언한다. 관찰 연결이 열리다 실패해도 쥔 연결을 닫는다.
```

② `whileHeld` 함수 전체(JSDoc 포함)를 바꾼다:

```ts
/**
 * 원시 연결이 트랜잭션을 열고 `hold` 로 잠금 · 쓰기를 쥔 채 `during()` 을 시작한다. 같은 데이터베이스에서 `waiters` 개의 연결이
 * 잠금을 기다리기 시작하면 — 또는 `during()` 이 기다리지 않고 끝나면, 또는 `timeoutMs` 가 지나면 — 그 트랜잭션을 커밋하고
 * `during()` 의 결과와 대기에 닿았는지(`reached`)를 돌려준다. 🔴 실패해도 롤백 · 종료한다 — 쥔 잠금이 남으면 afterAll 의
 * DROP DATABASE 가 막힌다. 관찰 연결이 열리다 실패해도 쥔 연결을 닫는다.
 */
export async function whileHeld<T>(
  t: TestDatabase,
  hold: (connection: Connection) => Promise<unknown>,
  during: () => Promise<T>,
  options: WhileHeldOptions = {},
): Promise<Settled<T> & { reached: boolean }> {
  const waiters = options.waiters ?? 1
  const deadline = Date.now() + (options.timeoutMs ?? 5000)
  const connection = await openRaw(t)
  let observer: Connection | undefined
  try {
    observer = await openRaw(t)
    await connection.beginTransaction()
    await hold(connection)
    let finished = false
    let reached = false
    const pending = settle(during()).then((result) => {
      finished = true
      return result
    })
    while (!finished && Date.now() < deadline) {
      if ((await lockWaitsIn(observer, t.name)) >= waiters) {
        reached = true
        break
      }
      await sleep(POLL_MS)
    }
    await connection.commit()
    return { ...(await pending), reached }
  } finally {
    await connection.rollback().catch(() => undefined)
    await connection.end()
    await observer?.end()
  }
}

/** 가드 행 하나를 FOR UPDATE 로 쥔다 — `underHeld` · `whileHeld` 의 hold 로 쓴다 */
export function holdGuard(lockName: string): (connection: Connection) => Promise<unknown> {
  return (connection) =>
    connection.query('select lock_name from guard_locks where lock_name = ? for update', [lockName])
}

export interface UnderHeld<T> {
  /** run 이 잠금 대기에 들어갔는가 */
  waited: boolean
  result: Settled<T>
}

/**
 * 원시 연결이 `hold` 로 잠금을 쥔 채 `run` 을 시작한다 — `run` 이 잠금 대기에 들어갔는지(`waited`)와, 쥔 트랜잭션을 커밋한 뒤의
 * 결과. `whileHeld` 와 달리 "기다리지 않았다" 도 답이다 — 쓰기가 가드를 잡는지(true) · 읽기가 가드를 안 잡는지(false)를 잰다.
 * 🔴 관찰 연결이 열리다 실패해도 쥔 연결을 닫는다(2e-2 최종 리뷰 — 옛 복사본은 holder 를 남겼다).
 */
export async function underHeld<T>(
  t: TestDatabase,
  hold: (connection: Connection) => Promise<unknown>,
  run: () => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<UnderHeld<T>> {
  const deadline = Date.now() + (options.timeoutMs ?? 2500)
  const holder = await openRaw(t)
  let observer: Connection | undefined
  try {
    observer = await openRaw(t)
    await holder.beginTransaction()
    await hold(holder)
    let finished = false
    const pending = settle(run()).then((result) => {
      finished = true
      return result
    })
    let waited = false
    while (!finished && !waited && Date.now() < deadline) {
      waited = (await lockWaitsIn(observer, t.name)) > 0
      if (!waited) await sleep(POLL_MS)
    }
    await holder.commit()
    return { waited, result: await pending }
  } finally {
    await holder.rollback().catch(() => undefined)
    await holder.end()
    await observer?.end()
  }
}
```

- [ ] **Step 4: 복사본 셋을 도우미로 바꾼다**

① `teams/teams.guard.db.test.ts` — import 머리 여섯 줄을 바꾼다:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { holdGuard, underHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminTeamsService } from './teams.service.js'
```

`async function underHeldGuard(…) { … }` 전체(JSDoc 포함)를 지우고, 테스트 본문의 `await underHeldGuard(write)` 를 `await underHeld(t, holdGuard('teamTree'), write)` 로 바꾼다.

② `legal/legal.guard.db.test.ts` — import 머리 일곱 줄을 바꾼다:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { holdGuard, underHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminLegalService } from './legal.service.js'
```

`async function underHeldGuard<T>(…) { … }` 전체를 지우고, 본문의 `underHeldGuard(` 세 곳을 `underHeld(t, holdGuard('legalPublish'), ` 로 바꾼다(예: `await underHeld(t, holdGuard('legalPublish'), () => service.publish(…))`, `await underHeld(t, holdGuard('legalPublish'), read)`).

③ `roles/roles.index.db.test.ts` — import 머리 여덟 줄을 바꾼다:

```ts
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { accountsConfig, testPrincipal } from '../test-support/accounts.js'
import { seedRole } from '../test-support/auth.js'
import { underHeld, type UnderHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminRolesService } from './roles.service.js'
```

`async function underHeldRole(…) { … }` 전체를 지우고 그 자리에 둔다:

```ts
/** 원시 연결이 held 행만 쥔 채 write 를 시작한다 — 도우미 underHeld 에 held 행 잠금을 넘긴다 */
function underHeldRole(write: () => Promise<unknown>): Promise<UnderHeld<unknown>> {
  return underHeld(
    t,
    (connection: Connection) =>
      connection.query('select role_no from roles where role_no = ? for update', [held]),
    write,
  )
}
```

(세 파일 모두 쓰이지 않게 된 import 가 남으면 `pnpm lint` 가 잡는다 — 지운다.)

- [ ] **Step 5: GREEN**

```bash
pnpm --filter @ssworks/admin-server test:db concurrency
pnpm --filter @ssworks/admin-server test:db teams.guard
pnpm --filter @ssworks/admin-server test:db legal.guard
pnpm --filter @ssworks/admin-server test:db roles.index
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: 모두 PASS. `whileHeld` 를 쓰는 다른 테스트(11 파일)는 `result.ok` · `result.value` 만 읽어 그대로다 — `pnpm test:db` 전량은 Task 5 Step 7 에서 돈다.

- [ ] **Step 6: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/test-support/concurrency.ts packages/admin-server/src/test-support/concurrency.db.test.ts packages/admin-server/src/teams/teams.guard.db.test.ts packages/admin-server/src/legal/legal.guard.db.test.ts packages/admin-server/src/roles/roles.index.db.test.ts
git add packages/admin-server/src/test-support/concurrency.ts packages/admin-server/src/test-support/concurrency.db.test.ts packages/admin-server/src/teams/teams.guard.db.test.ts packages/admin-server/src/legal/legal.guard.db.test.ts packages/admin-server/src/roles/roles.index.db.test.ts
git commit -m "test(admin-server): 경합 도우미 — underHeld · holdGuard 로 관찰 루프 모음, whileHeld reached · 연결 정리" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: admin-shared — IP 파서 · 평가 · 범위 판정 · 스키마 · 카탈로그 · 오류 코드

**Files:**

- Create: `packages/admin-shared/src/ip-access.ts`
- Create: `packages/admin-shared/src/ip-access.test.ts`
- Modify: `packages/admin-shared/src/audit.ts`(머리 주석 · 액션 셋 · 대상 · 라벨)
- Modify: `packages/admin-shared/src/audit.test.ts`(개수 · 대상 목록 · 새 테스트 · `defineAuditCatalog` 개수)
- Modify: `packages/admin-shared/src/error-codes.ts` · `error-codes.test.ts`
- Modify: `packages/admin-shared/src/index.ts`

**Interfaces:**

- Produces(admin-shared 공개 — 서버 Task 3~12 가 쓴다):
  - 타입 `IpScopeType = 'global' | 'team' | 'user'` · `IpRule { scopeType; scopeRefNo: bigint | null; cidr: string }` · `IpSubject { userNo: bigint; teamNos: readonly bigint[] }` · `IpScope { scopeType; scopeRefNo: bigint | null }` · `ParsedCidr` · `IpLockoutStatus = 'locked' | 'passes' | 'unknown'`.
  - 함수 `normalizeIp(ip: string): string` · `isValidIp(ip: string): boolean` · `parseCidr(cidr: string): ParsedCidr | null` · `isValidCidr(cidr: string): boolean` · `ipInCidr(ip: string, cidr: string): boolean` · `ipLayerRules(layer, rules, subject): IpRule[]` · `applicableIpLayer(rules: readonly IpRule[], subject: IpSubject): IpScopeType | null` · `evaluateIpAccess(ip: string | null, rules: readonly IpRule[], subject: IpSubject): boolean` · `ipScopeProblem(scope: IpScope): string | null` · `isValidIpScope(scope: IpScope): boolean`.
  - 상수 `IP_SCOPE_TYPES` · `IP_CIDR_MAX_LENGTH`(43) · `IP_RULE_DESCRIPTION_MAX_LENGTH`(200) · `IP_PREVIEW_OPS` · `IP_ACCESS_SCHEMA_MESSAGES`.
  - 스키마 · 타입: `ipScopeTypeSchema` · `ipCidrSchema` · `adminIpRuleSchema`/`AdminIpRule` · `adminIpRuleListSchema`/`AdminIpRuleList` · `adminIpRuleItemSchema`/`AdminIpRuleItem` · `adminIpRuleCreateSchema`/`AdminIpRuleCreate` · `adminIpRuleUpdateSchema`/`AdminIpRuleUpdate` · `adminIpRuleRemoveSchema`/`AdminIpRuleRemove` · `adminIpPreviewQuerySchema`/`AdminIpPreviewQuery` · `adminIpPreviewItemSchema`/`AdminIpPreviewItem` · `adminIpPreviewSchema`/`AdminIpPreview` · `ipLockoutStatusSchema`.
  - `CoreAuditActions.IP_ACCESS_CREATE` · `IP_ACCESS_UPDATE` · `IP_ACCESS_DELETE` · `CoreAuditTargets.IP_ACCESS_RULE` · `CommonErrorCodes.ERR_TEAM_HAS_IP_RULES`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-shared/src/ip-access.test.ts`(새):

```ts
import { describe, expect, it } from 'vitest'
import {
  IP_ACCESS_SCHEMA_MESSAGES,
  adminIpPreviewQuerySchema,
  adminIpRuleCreateSchema,
  adminIpRuleUpdateSchema,
  applicableIpLayer,
  evaluateIpAccess,
  ipCidrSchema,
  ipInCidr,
  ipScopeProblem,
  isValidCidr,
  isValidIp,
  isValidIpScope,
  normalizeIp,
  parseCidr,
  type IpRule,
  type IpSubject,
} from './ip-access.js'

// 정본: hangang-home apps/api/src/core/utils/request-ip.util.test.ts · modules/ip-access/ip-evaluation.test.ts ·
//       ip-access.dto.test.ts — 헤더 순서(getClientIp) 테스트는 옮기지 않는다(서버 clientIpOf 가 잰다).

const subject: IpSubject = { userNo: 1n, teamNos: [10n] }
const rule = (
  scopeType: IpRule['scopeType'],
  cidr: string,
  scopeRefNo: bigint | null = null,
): IpRule => ({ scopeType, scopeRefNo, cidr })

describe('normalizeIp · isValidIp', () => {
  it('IPv4-mapped 를 IPv4 로, IPv6 루프백을 127.0.0.1 로', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9')
    expect(normalizeIp('::FFFF:203.0.113.9')).toBe('203.0.113.9')
    expect(normalizeIp('::1')).toBe('127.0.0.1')
    expect(normalizeIp('0:0:0:0:0:0:0:1')).toBe('127.0.0.1')
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1')
  })

  it('🔴 주소 하나로 읽히는 것만 — 쉼표로 이어 붙은 중복 헤더 · 빈 값 · 글자는 거짓', () => {
    expect(isValidIp('203.0.113.9')).toBe(true)
    expect(isValidIp('::ffff:127.0.0.1')).toBe(true)
    expect(isValidIp('2001:db8::1')).toBe(true)
    expect(isValidIp('1.2.3.4, 5.6.7.8')).toBe(false)
    expect(isValidIp('2001:db8::1, ::2')).toBe(false)
    expect(isValidIp('')).toBe(false)
    expect(isValidIp('localhost')).toBe(false)
    expect(isValidIp('010.0.0.1')).toBe(false)
  })
})

describe('ipInCidr — IPv4', () => {
  it('전역 허용이 모든 v4 를 통과시킨다', () => {
    expect(ipInCidr('203.0.113.9', '0.0.0.0/0')).toBe(true)
  })

  it('프리픽스 경계를 정확히 본다', () => {
    expect(ipInCidr('192.168.1.255', '192.168.1.0/24')).toBe(true)
    expect(ipInCidr('192.168.2.0', '192.168.1.0/24')).toBe(false)
    expect(ipInCidr('10.0.0.255', '10.0.0.0/23')).toBe(true)
    expect(ipInCidr('10.0.1.255', '10.0.0.0/23')).toBe(true)
    expect(ipInCidr('10.0.2.0', '10.0.0.0/23')).toBe(false)
  })

  it('/32 는 한 주소만', () => {
    expect(ipInCidr('203.0.113.9', '203.0.113.9/32')).toBe(true)
    expect(ipInCidr('203.0.113.10', '203.0.113.9/32')).toBe(false)
  })

  it('Review Focus 1 — 호스트 비트가 남은 CIDR 도 네트워크처럼 매칭한다', () => {
    expect(isValidCidr('203.0.113.9/24')).toBe(true)
    expect(ipInCidr('203.0.113.200', '203.0.113.9/24')).toBe(true)
    expect(ipInCidr('203.0.114.1', '203.0.113.9/24')).toBe(false)
  })

  it('잘못된 표기를 거부한다', () => {
    expect(ipInCidr('203.0.113.9', '203.0.113.9')).toBe(false)
    expect(ipInCidr('203.0.113.9', '203.0.113.9/33')).toBe(false)
    expect(ipInCidr('256.0.0.1', '0.0.0.0/0')).toBe(false)
    expect(ipInCidr('010.0.0.1', '0.0.0.0/0')).toBe(false)
  })
})

describe('ipInCidr — IPv6', () => {
  it('전역 허용 · 축약 · /128', () => {
    expect(ipInCidr('2001:db8::1', '::/0')).toBe(true)
    expect(ipInCidr('2001:db8::1', '2001:db8::/32')).toBe(true)
    expect(ipInCidr('2001:db9::1', '2001:db8::/32')).toBe(false)
    expect(ipInCidr('2001:db8::1', '2001:db8::1/128')).toBe(true)
    expect(ipInCidr('2001:db8::2', '2001:db8::1/128')).toBe(false)
  })

  it('Review Focus 2 — 대문자 · 축약이 섞인 표기도 같은 주소다', () => {
    expect(ipInCidr('2001:DB8::1', '2001:db8:0:0::/32')).toBe(true)
    expect(ipInCidr('2001:db8:0:0:0:0:0:1', '2001:DB8::1/128')).toBe(true)
  })

  it('🔴 계열이 다르면 매칭하지 않는다 — 시드가 0.0.0.0/0 과 ::/0 두 행인 이유', () => {
    expect(ipInCidr('203.0.113.9', '::/0')).toBe(false)
    expect(ipInCidr('2001:db8::1', '0.0.0.0/0')).toBe(false)
  })

  it('🔴 ::1 은 0.0.0.0/0 에 매칭되고 ::/0 에는 안 된다 — 루프백 정규화의 귀결(hangang)', () => {
    expect(ipInCidr('::1', '0.0.0.0/0')).toBe(true)
    expect(ipInCidr('::1', '::/0')).toBe(false)
  })

  it('존 인덱스(%eth0)를 버린다', () => {
    expect(ipInCidr('fe80::1%eth0', 'fe80::/10')).toBe(true)
  })
})

describe('ipInCidr — v4-mapped CIDR(hangang R16)', () => {
  it('v4-mapped CIDR 이 같은 주소의 v4-mapped · 순수 v4 IP 를 통과시킨다', () => {
    expect(ipInCidr('::ffff:203.0.113.9', '::ffff:203.0.113.0/120')).toBe(true)
    expect(ipInCidr('::ffff:203.0.113.9', '::ffff:203.0.114.0/120')).toBe(false)
    expect(ipInCidr('203.0.113.9', '::ffff:203.0.113.0/120')).toBe(true)
  })

  it('🔴 96 미만 프리픽스는 v4 로 표현할 수 없어 거부한다', () => {
    expect(ipInCidr('203.0.113.9', '::ffff:0.0.0.0/64')).toBe(false)
    expect(isValidCidr('::ffff:0.0.0.0/64')).toBe(false)
  })
})

describe('isValidCidr — 검증과 평가가 같은 파서(hangang R30)', () => {
  it('프리픽스가 없거나 숫자가 아니거나 범위를 넘으면 거부한다', () => {
    for (const bad of [
      '203.0.113.0',
      '2001:db8::',
      '203.0.113.0/',
      '203.0.113.0/ab',
      '203.0.113.0/33',
      '2001:db8::/129',
    ]) {
      expect(isValidCidr(bad), bad).toBe(false)
    }
  })

  it('네트워크 주소가 IP 가 아니면 거부한다', () => {
    for (const bad of [
      '203.0.113/24',
      '203.0.113.256/24',
      '010.0.0.0/8',
      '2001:db8:::1/64',
      '',
      '그냥 글자/24',
    ]) {
      expect(isValidCidr(bad), bad).toBe(false)
    }
  })

  it('🔴 통과한 것은 평가에서 반드시 파싱된다 — 자기 네트워크 주소를 통과시킨다', () => {
    for (const cidr of ['0.0.0.0/0', '203.0.113.0/24', '10.0.0.0/8', '2001:db8::/32', '::/0']) {
      expect(isValidCidr(cidr), cidr).toBe(true)
      expect(parseCidr(cidr), cidr).not.toBeNull()
    }
    expect(isValidCidr('::ffff:203.0.113.0/120')).toBe(true)
  })
})

describe('층 · 평가', () => {
  it('🔴 규칙이 하나도 없으면 거부한다(기본 거부)', () => {
    expect(evaluateIpAccess('203.0.113.9', [], subject)).toBe(false)
    expect(applicableIpLayer([], subject)).toBeNull()
  })

  it('🔴 주소가 null 이면 거부한다(fail-closed) — 전역 허용이 있어도', () => {
    expect(evaluateIpAccess(null, [rule('global', '0.0.0.0/0')], subject)).toBe(false)
  })

  it('전역 허용만 있으면 통과한다', () => {
    expect(evaluateIpAccess('203.0.113.9', [rule('global', '0.0.0.0/0')], subject)).toBe(true)
    expect(evaluateIpAccess('2001:db8::1', [rule('global', '::/0')], subject)).toBe(true)
  })

  it('🔴 가장 가까운 층 하나만 — user 규칙이 있으면 global 을 안 본다', () => {
    const rules = [rule('global', '0.0.0.0/0'), rule('user', '10.0.0.0/8', 1n)]
    expect(applicableIpLayer(rules, subject)).toBe('user')
    expect(evaluateIpAccess('203.0.113.9', rules, subject)).toBe(false)
    expect(evaluateIpAccess('10.1.2.3', rules, subject)).toBe(true)
  })

  it('user 가 없으면 team, team 도 없으면 global — 팀 층은 이 사람의 팀에만', () => {
    const rules = [rule('global', '0.0.0.0/0'), rule('team', '10.0.0.0/8', 10n)]
    expect(applicableIpLayer(rules, subject)).toBe('team')
    expect(evaluateIpAccess('203.0.113.9', rules, subject)).toBe(false)
    expect(evaluateIpAccess('203.0.113.9', rules, { userNo: 1n, teamNos: [99n] })).toBe(true)
    expect(evaluateIpAccess('203.0.113.9', rules, { userNo: 1n, teamNos: [] })).toBe(true)
  })

  it('다른 사람의 user 규칙은 이 사람의 층을 만들지 않는다', () => {
    const rules = [rule('global', '0.0.0.0/0'), rule('user', '10.0.0.0/8', 99n)]
    expect(applicableIpLayer(rules, subject)).toBe('global')
  })

  it('같은 층에 여럿이면 하나라도 맞으면 통과 · 계열이 다른 규칙만 있으면 그 층에서 거부', () => {
    const rules = [rule('user', '10.0.0.0/8', 1n), rule('user', '203.0.113.0/24', 1n)]
    expect(evaluateIpAccess('203.0.113.9', rules, subject)).toBe(true)
    expect(evaluateIpAccess('203.0.113.9', [rule('global', '::/0')], subject)).toBe(false)
  })

  it('모르는 scopeType(옛 행 · 직접 넣은 값)은 어느 층에도 걸리지 않는다', () => {
    const odd = { scopeType: 'role', scopeRefNo: 1n, cidr: '10.0.0.0/8' } as unknown as IpRule
    expect(applicableIpLayer([odd, rule('global', '0.0.0.0/0')], subject)).toBe('global')
  })
})

describe('범위 판정', () => {
  it('global 은 대상이 없어야 하고 team · user 는 있어야 한다', () => {
    expect(ipScopeProblem({ scopeType: 'global', scopeRefNo: null })).toBeNull()
    expect(ipScopeProblem({ scopeType: 'global', scopeRefNo: 1n })).toBe(
      IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden,
    )
    expect(ipScopeProblem({ scopeType: 'team', scopeRefNo: null })).toBe(
      IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired,
    )
    expect(isValidIpScope({ scopeType: 'user', scopeRefNo: 3n })).toBe(true)
    expect(isValidIpScope({ scopeType: 'user', scopeRefNo: null })).toBe(false)
  })
})

describe('스키마', () => {
  it('Review Focus 3 — CIDR 의 앞뒤 공백을 떼고 검증한다 · 형식 오류는 한 문구', () => {
    expect(ipCidrSchema.parse(' 10.0.0.0/8 ')).toBe('10.0.0.0/8')
    const failed = ipCidrSchema.safeParse('203.0.113.0')
    expect(failed.success).toBe(false)
    expect(failed.error?.issues.map((issue) => issue.message)).toEqual([
      IP_ACCESS_SCHEMA_MESSAGES.cidr,
    ])
    expect(ipCidrSchema.safeParse('').success).toBe(false)
    expect(ipCidrSchema.safeParse('1'.repeat(44)).success).toBe(false)
  })

  it('만들기 — 설명의 빈 문자열은 null, 범위 불변식은 스키마가 아니라 판정 함수 몫(refine 없음)', () => {
    expect(
      adminIpRuleCreateSchema.parse({
        scopeType: 'global',
        scopeRefNo: null,
        cidr: '0.0.0.0/0',
        description: '  ',
      }),
    ).toEqual({ scopeType: 'global', scopeRefNo: null, cidr: '0.0.0.0/0', description: null })
    // 🔴 refine 이 없어야 서버가 재인증 칸을 extend 한다(zod 4)
    expect(() =>
      adminIpRuleCreateSchema.extend({ currentPassword: adminIpRuleCreateSchema.shape.cidr }),
    ).not.toThrow()
    expect(
      adminIpRuleCreateSchema.safeParse({ scopeType: 'global', scopeRefNo: 1n, cidr: '0.0.0.0/0' })
        .success,
    ).toBe(true)
  })

  it('수정 — revision 만 필수, null 설명은 지우기', () => {
    expect(adminIpRuleUpdateSchema.parse({ revision: 0 })).toEqual({ revision: 0 })
    expect(adminIpRuleUpdateSchema.safeParse({ cidr: '10.0.0.0/8' }).success).toBe(false)
    expect(adminIpRuleUpdateSchema.parse({ revision: 2, description: null })).toEqual({
      revision: 2,
      description: null,
    })
  })

  it('미리보기 쿼리 — op 없음은 지금 상태, 쿼리 문자열의 번호는 bigint 로', () => {
    expect(adminIpPreviewQuerySchema.parse({})).toEqual({})
    expect(
      adminIpPreviewQuerySchema.parse({
        op: 'create',
        scopeType: 'team',
        scopeRefNo: '12',
        cidr: '10.0.0.0/8',
      }),
    ).toEqual({ op: 'create', scopeType: 'team', scopeRefNo: 12n, cidr: '10.0.0.0/8' })
    expect(adminIpPreviewQuerySchema.parse({ op: 'delete', ruleNo: '3' })).toEqual({
      op: 'delete',
      ruleNo: 3n,
    })
  })

  it('미리보기 쿼리 — op 별 빠진 칸 · 범위 불변식은 그 칸의 오류', () => {
    const paths = (input: unknown) =>
      adminIpPreviewQuerySchema
        .safeParse(input)
        .error?.issues.map((issue) => [issue.path.join('.'), issue.message])
    expect(paths({ op: 'update' })).toEqual([
      ['ruleNo', IP_ACCESS_SCHEMA_MESSAGES.previewField],
      ['scopeType', IP_ACCESS_SCHEMA_MESSAGES.previewField],
      ['cidr', IP_ACCESS_SCHEMA_MESSAGES.previewField],
    ])
    expect(paths({ op: 'delete' })).toEqual([['ruleNo', IP_ACCESS_SCHEMA_MESSAGES.previewField]])
    expect(paths({ op: 'create', scopeType: 'user', cidr: '10.0.0.0/8' })).toEqual([
      ['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired],
    ])
    expect(paths({ op: 'create', scopeType: 'global', scopeRefNo: '1', cidr: '::/0' })).toEqual([
      ['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden],
    ])
    expect(adminIpPreviewQuerySchema.safeParse({ ruleNo: '-1' }).success).toBe(false)
  })
})
```

`packages/admin-shared/src/audit.test.ts`:

① 첫 `it` 을 통째로 바꾼다:

```ts
it('🔴 액션 33 · 대상 6 · 라벨이 하나씩 — 개수는 이 테스트가 고정한다(산문의 개수는 낡는다)', () => {
  expect(Object.values(CoreAuditActions)).toHaveLength(33)
  expect(Object.values(CoreAuditTargets)).toEqual([
    'user',
    'session',
    'role',
    'team',
    'legalDocument',
    'ipAccessRule',
  ])
  expect(Object.keys(CORE_AUDIT_ACTION_LABELS).sort()).toEqual(
    [...Object.values(CoreAuditActions)].sort(),
  )
  expect(Object.keys(CORE_AUDIT_TARGET_LABELS).sort()).toEqual([
    'ipAccessRule',
    'legalDocument',
    'role',
    'session',
    'team',
    'user',
  ])
})
```

② `it('약관 액션(2e-2) — …')` 블록 다음(같은 `describe('코어 카탈로그')` 안)에 더한다:

```ts
it('IP 액션(2f-1) — setting.ipAccess.* 셋 · 대상 ipAccessRule 과 라벨', () => {
  expect(CoreAuditActions.IP_ACCESS_CREATE).toBe('setting.ipAccess.create')
  expect(CoreAuditActions.IP_ACCESS_UPDATE).toBe('setting.ipAccess.update')
  expect(CoreAuditActions.IP_ACCESS_DELETE).toBe('setting.ipAccess.delete')
  expect(CoreAuditTargets.IP_ACCESS_RULE).toBe('ipAccessRule')
  expect(coreAuditCatalog.labelOf('setting.ipAccess.create')).toBe('IP 규칙 추가')
  expect(coreAuditCatalog.labelOf('setting.ipAccess.update')).toBe('IP 규칙 수정')
  expect(coreAuditCatalog.labelOf('setting.ipAccess.delete')).toBe('IP 규칙 삭제')
  expect(coreAuditCatalog.targetLabelOf('ipAccessRule')).toBe('IP 규칙')
})
```

③ `describe('defineAuditCatalog')` 의 첫 `it` 에서 두 단언을 바꾼다:

```ts
expect(catalog.ACTION_VALUES).toHaveLength(34)
expect(catalog.TARGET_VALUES).toEqual([
  'user',
  'session',
  'role',
  'team',
  'legalDocument',
  'ipAccessRule',
  'post',
])
```

`packages/admin-shared/src/error-codes.test.ts` — `it('팀 전용 코드(2e) — …')` 블록 다음에 더한다:

```ts
it('IP 규칙이 가리키는 팀(2f-1) — 409 ERR_TEAM_HAS_IP_RULES', () => {
  expect(CommonErrorCodes.ERR_TEAM_HAS_IP_RULES).toBe('ERR_TEAM_HAS_IP_RULES')
  expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_TEAM_HAS_IP_RULES]).toBe(409)
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-shared test ip-access audit error-codes`
Expected: FAIL — `./ip-access.js` 가 없다, `expected [ …30 items… ] to have a length of 33`, `ERR_TEAM_HAS_IP_RULES` 가 `undefined`.

- [ ] **Step 3: `ip-access.ts` 를 쓴다**

`packages/admin-shared/src/ip-access.ts`(새):

```ts
import { z } from 'zod'
import { queryBigIntSchema } from './audit.js'

// IP 접근 제어 계약 — Phase 2 서버(@ssworks/admin-server AdminIpAccessModule)와 쓰는 쪽 IP 화면이 같은 파서 · 평가 · 모양을 본다.
//
// 정본: hangang-home apps/api/src/core/utils/request-ip.util.ts(normalizeIp · 파서 · ipInCidr — R16 · R30) +
//       apps/api/src/modules/ip-access/ip-evaluation.ts(층 · 평가) · ip-access.dto.ts(범위 불변식 · 미리보기 쿼리)
// 바꾼 점:
//  - 프레임워크 무의존 패키지로 옮겼다 — 화면의 CIDR 검증이 서버 평가와 같은 파서를 쓴다(2f-1 스펙 P1).
//  - getClientIp(헤더 순서)는 옮기지 않는다 — 클라이언트 IP 의 출처는 서버 코어 옵션 clientIp 다(2f-1 스펙 ④ C1).
//  - evaluateIpAccess 가 null 주소를 받는다 — 모르면 거부(fail-closed).
//  - 범위 불변식은 함수(ipScopeProblem)로 낸다 — 객체 스키마에 refine 을 걸면 서버가 재인증 칸을 extend 할 수 없다(zod 4).
//  - 미리보기 쿼리는 판별 합집합 대신 평평한 객체 + superRefine — 빠진 칸이 그 칸의 오류로 나온다.
//  - 정규식에 백슬래시 문자 클래스를 쓰지 않는다(저장소 규칙) — [0-9] 로 적는다.
// 🔴 CIDR 을 읽는 곳은 parseCidr 하나다(hangang R30). 검증과 평가가 다른 파서를 쓰면 "저장은 됐는데 아무도 안 통과하는" 규칙이
//    생긴다 — ipInCidr 은 잘못된 문자열에 예외 대신 false 를 낸다.
// 🔴 기본 거부 · 가장 가까운 층 하나(user → team → global). 앞 층에 규칙이 하나라도 있으면 뒤는 보지 않는다 — user 규칙 한 줄이
//    global 허용을 통째로 지운다. 그래서 서버가 자기 잠금 · 잔존을 검사한다.

export type IpScopeType = 'global' | 'team' | 'user'

export const IP_SCOPE_TYPES = ['global', 'team', 'user'] as const satisfies readonly IpScopeType[]

export interface IpRule {
  scopeType: IpScopeType
  /** global 이면 null. team · user 의 번호(다형 참조) */
  scopeRefNo: bigint | null
  cidr: string
}

export interface IpSubject {
  userNo: bigint
  /** 🔴 대표 팀 하나(가장 작은 teamNo) 또는 빈 배열 — 서버 인증과 같은 팀을 넘긴다 */
  teamNos: readonly bigint[]
}

export interface IpScope {
  scopeType: IpScopeType
  scopeRefNo: bigint | null
}

export interface ParsedCidr {
  /** 정규화된 네트워크 주소 — 길이 4(IPv4) 또는 16(IPv6) */
  net: Uint8Array
  /** net 의 계열 기준 프리픽스(v4-mapped 표기는 96 을 뺀 값) */
  prefix: number
}

const IPV4_OCTET = /^(0|[1-9][0-9]{0,2})$/
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/
const PREFIX_DIGITS = /^[0-9]{1,3}$/

/** `::ffff:a.b.c.d` → `a.b.c.d`, IPv6 루프백 → `127.0.0.1`. 🔴 서버의 세션 · 감사 · 정책이 이 값을 같이 쓴다 */
export function normalizeIp(ip: string): string {
  const unmapped = ip.replace(/^::ffff:/i, '')
  if (unmapped === '::1' || unmapped === '0:0:0:0:0:0:0:1') return '127.0.0.1'
  return unmapped
}

function parseIpv4(ip: string): Uint8Array | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const out = new Uint8Array(4)
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i] ?? ''
    // 🔴 선행 0 을 거부한다 — '010' 을 8진수로 읽는 구현이 있어 판정이 갈린다(hangang)
    if (!IPV4_OCTET.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    out[i] = value
  }
  return out
}

/** 마지막 그룹이 IPv4 표기(`::ffff:1.2.3.4`)면 16비트 그룹 둘로 편다 */
function expandEmbeddedIpv4(groups: string[]): string[] | null {
  const last = groups[groups.length - 1]
  if (last === undefined || !last.includes('.')) return groups
  const v4 = parseIpv4(last)
  if (v4 === null) return null
  const [a = 0, b = 0, c = 0, d = 0] = v4
  return [...groups.slice(0, -1), ((a << 8) | b).toString(16), ((c << 8) | d).toString(16)]
}

function parseIpv6(ip: string): Uint8Array | null {
  let text = ip
  const zone = text.indexOf('%')
  if (zone >= 0) text = text.slice(0, zone)
  const gap = text.indexOf('::')
  if (gap !== text.lastIndexOf('::')) return null
  const split = (part: string): string[] => (part === '' ? [] : part.split(':'))
  const head = expandEmbeddedIpv4(gap >= 0 ? split(text.slice(0, gap)) : split(text))
  const tail = expandEmbeddedIpv4(gap >= 0 ? split(text.slice(gap + 2)) : [])
  if (head === null || tail === null) return null
  const total = head.length + tail.length
  if (gap >= 0 ? total > 8 : total !== 8) return null
  const groups =
    gap >= 0 ? [...head, ...Array.from({ length: 8 - total }, () => '0'), ...tail] : head
  const out = new Uint8Array(16)
  for (let i = 0; i < 8; i += 1) {
    const group = groups[i] ?? ''
    if (!IPV6_GROUP.test(group)) return null
    const value = parseInt(group, 16)
    out[i * 2] = value >> 8
    out[i * 2 + 1] = value & 0xff
  }
  return out
}

function parseIp(ip: string): Uint8Array | null {
  return ip.includes(':') ? parseIpv6(ip) : parseIpv4(ip)
}

/** 주소 하나로 읽히는가(정규화 뒤). 쉼표로 이어 붙은 값 · 빈 값 · 이름은 거짓 */
export function isValidIp(ip: string): boolean {
  return parseIp(normalizeIp(ip)) !== null
}

function prefixMatches(a: Uint8Array, b: Uint8Array, prefix: number): boolean {
  const fullBytes = prefix >> 3
  const restBits = prefix & 7
  for (let i = 0; i < fullBytes; i += 1) if (a[i] !== b[i]) return false
  if (restBits === 0) return true
  const mask = (0xff << (8 - restBits)) & 0xff
  return ((a[fullBytes] ?? 0) & mask) === ((b[fullBytes] ?? 0) & mask)
}

/**
 * CIDR 하나를 읽는다. 형식이 아니면 null.
 * 🔴 net 도 주소처럼 normalizeIp 를 지난다(hangang R16) — `::ffff:203.0.113.0/120` 같은 v4-mapped 표기가 v4 로 접힌 주소와
 *    계열이 어긋나 조용히 아무것도 매칭하지 않던 자리다. 접히면 프리픽스에서 96 을 빼고, 96 미만이면 v4 로 표현할 수 없어 거부한다.
 */
export function parseCidr(cidr: string): ParsedCidr | null {
  const slash = cidr.lastIndexOf('/')
  if (slash < 0) return null
  const prefixText = cidr.slice(slash + 1)
  if (!PREFIX_DIGITS.test(prefixText)) return null
  const rawNet = cidr.slice(0, slash)
  const normalizedNet = normalizeIp(rawNet)
  const folded = rawNet.includes(':') && !normalizedNet.includes(':')
  let prefix = Number(prefixText)
  if (folded) {
    if (prefix < 96) return null
    prefix -= 96
  }
  const net = parseIp(normalizedNet)
  if (net === null) return null
  if (prefix > net.length * 8) return null
  return { net, prefix }
}

/** 저장해도 되는 CIDR 인가 — 🔴 ipInCidr 과 같은 파서다 */
export function isValidCidr(cidr: string): boolean {
  return parseCidr(cidr) !== null
}

/** 주소가 CIDR 에 드는가. 🔴 계열이 다르면 늘 false — `::/0` 이 IPv4 를 통과시키지 않는다 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr)
  if (parsed === null) return false
  const address = parseIp(normalizeIp(ip))
  if (address === null || parsed.net.length !== address.length) return false
  return prefixMatches(address, parsed.net, parsed.prefix)
}

/** 🔴 가까운 순서. 앞 층에 규칙이 하나라도 있으면 뒤는 보지 않는다 */
const LAYERS: readonly IpScopeType[] = ['user', 'team', 'global']

/** 이 사람에게 걸리는 그 층의 규칙 */
export function ipLayerRules(
  layer: IpScopeType,
  rules: readonly IpRule[],
  subject: IpSubject,
): IpRule[] {
  switch (layer) {
    case 'user':
      return rules.filter((rule) => rule.scopeType === 'user' && rule.scopeRefNo === subject.userNo)
    case 'team':
      return rules.filter(
        (rule) =>
          rule.scopeType === 'team' &&
          rule.scopeRefNo !== null &&
          subject.teamNos.includes(rule.scopeRefNo),
      )
    case 'global':
      return rules.filter((rule) => rule.scopeType === 'global')
  }
}

/**
 * 이 사람에게 실제로 적용되는 층 하나. 걸리는 규칙이 없으면 null(= 기본 거부).
 * 🔴 판정을 두 번 적지 않는다 — 서버의 정책 · 잔존 셈 · 미리보기 · 자기 잠금이 이 함수를 쓴다(hangang A1).
 */
export function applicableIpLayer(
  rules: readonly IpRule[],
  subject: IpSubject,
): IpScopeType | null {
  for (const layer of LAYERS) {
    if (ipLayerRules(layer, rules, subject).length > 0) return layer
  }
  return null
}

/** 이 주소로 이 사람이 들어올 수 있는가. 🔴 주소가 null 이거나 층이 없으면 false */
export function evaluateIpAccess(
  ip: string | null,
  rules: readonly IpRule[],
  subject: IpSubject,
): boolean {
  if (ip === null) return false
  const layer = applicableIpLayer(rules, subject)
  if (layer === null) return false
  return ipLayerRules(layer, rules, subject).some((rule) => ipInCidr(ip, rule.cidr))
}

export const IP_ACCESS_SCHEMA_MESSAGES = Object.freeze({
  cidr: 'IPv4 · IPv6 CIDR 형식이 아닙니다. 예: 203.0.113.0/24, 2001:db8::/32',
  scopeRefRequired: '팀 · 사용자 규칙은 대상을 골라야 합니다.',
  scopeRefForbidden: '전체 규칙에는 대상을 두지 않습니다.',
  previewField: '이 미리보기에는 이 칸이 필요합니다.',
})

/**
 * 범위 불변식 — global 이면 대상이 없고, team · user 면 있다. 어기면 문구, 아니면 null.
 * 🔴 서버의 만들기 파이프와 수정의 **병합 결과**가 같은 함수로 본다(hangang R30 — PATCH 가 scopeType 만 바꿔 죽은 행을 만든다).
 */
export function ipScopeProblem(scope: IpScope): string | null {
  if (scope.scopeType === 'global') {
    return scope.scopeRefNo === null ? null : IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden
  }
  return scope.scopeRefNo === null ? IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired : null
}

export function isValidIpScope(scope: IpScope): boolean {
  return ipScopeProblem(scope) === null
}

/** IPv6 CIDR 최대 43자 — 장 0012 의 cidr 열 폭 */
export const IP_CIDR_MAX_LENGTH = 43
export const IP_RULE_DESCRIPTION_MAX_LENGTH = 200

export const ipScopeTypeSchema = z.enum(IP_SCOPE_TYPES)

/** 🔴 앞뒤 공백을 뗀 뒤 같은 파서로 본다(Review Focus 3) — 형식 오류는 한 문구 */
export const ipCidrSchema = z
  .string()
  .trim()
  .max(IP_CIDR_MAX_LENGTH)
  .refine(isValidCidr, { message: IP_ACCESS_SCHEMA_MESSAGES.cidr })

/** 이 규칙이 왜 있는가. 빈 문자열은 null 로 */
const descriptionSchema = z
  .string()
  .trim()
  .max(IP_RULE_DESCRIPTION_MAX_LENGTH)
  .nullable()
  .transform((value) => (value === '' ? null : value))

/** 🔴 Phase 0 §4 "쓰기 보호는 revision 기본". 수정 · 삭제 성공마다 서버가 올린다 */
const revisionSchema = z.number().int().min(0)

export const adminIpRuleSchema = z.object({
  ruleNo: z.bigint(),
  scopeType: ipScopeTypeSchema,
  scopeRefNo: z.bigint().nullable(),
  /** 팀 이름 · 사용자 이름. global 이거나 대상이 지워졌으면 null */
  scopeName: z.string().nullable(),
  /** 사용자 규칙의 로그인 아이디. 그 밖은 null */
  scopeUserId: z.string().nullable(),
  cidr: z.string(),
  description: z.string().nullable(),
  revision: revisionSchema,
  createAt: z.iso.datetime(),
  updateAt: z.iso.datetime(),
})

export const adminIpRuleListSchema = z.object({ items: z.array(adminIpRuleSchema) })

/** 만들기 201 · 수정 200 의 응답 */
export const adminIpRuleItemSchema = z.object({ item: adminIpRuleSchema })

/** 🔴 refine 을 걸지 않는다 — 범위 불변식은 ipScopeProblem 이 본다(서버 파이프가 재인증 칸을 extend 한 뒤 건다) */
export const adminIpRuleCreateSchema = z.object({
  scopeType: ipScopeTypeSchema,
  scopeRefNo: z.bigint().nullable(),
  cidr: ipCidrSchema,
  description: descriptionSchema.optional(),
})

/** 부분 갱신. 🔴 revision 만 필수다. scopeRefNo: null 은 "대상 없음", 생략은 "그대로" — 병합 결과는 서버가 본다 */
export const adminIpRuleUpdateSchema = z.object({
  scopeType: ipScopeTypeSchema.optional(),
  scopeRefNo: z.bigint().nullable().optional(),
  cidr: ipCidrSchema.optional(),
  description: descriptionSchema.optional(),
  revision: revisionSchema,
})

export const adminIpRuleRemoveSchema = z.object({ revision: revisionSchema })

export const IP_PREVIEW_OPS = ['create', 'update', 'delete'] as const

/**
 * 미리보기 쿼리(`GET /admin/ip-access/preview`). op 가 없으면 지금 상태다. create · update 는 바뀔 규칙 전체
 * (scopeType · scopeRefNo · cidr), update · delete 는 대상 ruleNo 를 받는다.
 */
export const adminIpPreviewQuerySchema = z
  .object({
    op: z.enum(IP_PREVIEW_OPS).optional(),
    ruleNo: queryBigIntSchema.optional(),
    scopeType: ipScopeTypeSchema.optional(),
    scopeRefNo: queryBigIntSchema.optional(),
    cidr: ipCidrSchema.optional(),
  })
  .superRefine((query, ctx) => {
    const need = (key: 'ruleNo' | 'scopeType' | 'cidr', present: boolean): void => {
      if (!present) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: IP_ACCESS_SCHEMA_MESSAGES.previewField,
        })
      }
    }
    if (query.op === 'update' || query.op === 'delete') need('ruleNo', query.ruleNo !== undefined)
    if (query.op === 'create' || query.op === 'update') {
      need('scopeType', query.scopeType !== undefined)
      need('cidr', query.cidr !== undefined)
      if (query.scopeType !== undefined) {
        const problem = ipScopeProblem({
          scopeType: query.scopeType,
          scopeRefNo: query.scopeRefNo ?? null,
        })
        if (problem !== null)
          ctx.addIssue({ code: 'custom', path: ['scopeRefNo'], message: problem })
      }
    }
  })

/** locked = 이 규칙으로는 못 들어온다 · passes = 활성 세션 주소 하나라도 통과 · unknown = 층은 있는데 주소를 아는 세션이 0 */
export const ipLockoutStatusSchema = z.enum(['locked', 'passes', 'unknown'])

const countSchema = z.number().int().min(0)

export const adminIpPreviewItemSchema = z.object({
  userNo: z.bigint(),
  userId: z.string(),
  userName: z.string(),
  layerBefore: ipScopeTypeSchema.nullable(),
  layerAfter: ipScopeTypeSchema.nullable(),
  statusBefore: ipLockoutStatusSchema,
  statusAfter: ipLockoutStatusSchema,
  /** 🔴 변경 전에 안 잠겨 있던 사람만 참 */
  becomesLocked: z.boolean(),
  /** 이 사람에게 적용되는 층 · CIDR 집합이 달라지는가(상태가 그대로여도 참일 수 있다) */
  ruleSetChanged: z.boolean(),
  activeSessionCount: countSchema,
  blockedSessionCount: countSchema,
  unknownIpSessionCount: countSchema,
})

export const adminIpPreviewSchema = z.object({
  /** 요청자의 지금 주소(서버 clientIp 출처) */
  clientIp: z.string().nullable(),
  /** 🔴 저장 때 자기 잠금이 쓰는 바로 그 판정 — false 면 저장이 409 다 */
  clientPasses: z.boolean(),
  summary: z.object({
    total: countSchema,
    newlyLocked: countSchema,
    alreadyLocked: countSchema,
    unknown: countSchema,
    /** 🔴 items 전원의 blockedSessionCount 합 — "이 변경이 끊는 기기 수" 가 아니라 거부되는 활성 세션 수 */
    blockedSessions: countSchema,
    ruleSetChangedOnly: countSchema,
  }),
  items: z.array(adminIpPreviewItemSchema),
})

export type IpLockoutStatus = z.infer<typeof ipLockoutStatusSchema>
export type AdminIpRule = z.infer<typeof adminIpRuleSchema>
export type AdminIpRuleList = z.infer<typeof adminIpRuleListSchema>
export type AdminIpRuleItem = z.infer<typeof adminIpRuleItemSchema>
export type AdminIpRuleCreate = z.infer<typeof adminIpRuleCreateSchema>
export type AdminIpRuleUpdate = z.infer<typeof adminIpRuleUpdateSchema>
export type AdminIpRuleRemove = z.infer<typeof adminIpRuleRemoveSchema>
export type AdminIpPreviewQuery = z.infer<typeof adminIpPreviewQuerySchema>
export type AdminIpPreviewItem = z.infer<typeof adminIpPreviewItemSchema>
export type AdminIpPreview = z.infer<typeof adminIpPreviewSchema>
```

- [ ] **Step 4: 카탈로그 · 오류 코드 · index 를 고친다**

`packages/admin-shared/src/audit.ts`:

① 머리 주석 `바꾼 점:` 첫 항목의 `· 약관(2e-2). IP 액션은 2f 가 더한다.` 를 `· 약관(2e-2) · IP(2f-1).` 로 바꾼다(그 줄의 나머지는 그대로).

② `CoreAuditActions` 의 `LEGAL_PUBLISH: 'setting.legal.publish',` 다음 줄에 더한다:

```ts
  IP_ACCESS_CREATE: 'setting.ipAccess.create',
  IP_ACCESS_UPDATE: 'setting.ipAccess.update',
  IP_ACCESS_DELETE: 'setting.ipAccess.delete',
```

③ `CoreAuditTargets` 의 `LEGAL_DOCUMENT: 'legalDocument',` 다음 줄에 `  IP_ACCESS_RULE: 'ipAccessRule',` 를 더한다.

④ `CORE_AUDIT_ACTION_LABELS` 의 `'setting.legal.publish': '약관 발행',` 다음 줄에 더한다:

```ts
  'setting.ipAccess.create': 'IP 규칙 추가',
  'setting.ipAccess.update': 'IP 규칙 수정',
  'setting.ipAccess.delete': 'IP 규칙 삭제',
```

⑤ `CORE_AUDIT_TARGET_LABELS` 의 `legalDocument: '약관',` 다음 줄에 `  ipAccessRule: 'IP 규칙',` 를 더한다.

`packages/admin-shared/src/error-codes.ts`:

① `ERR_TEAM_MOVE_CYCLE: 'ERR_TEAM_MOVE_CYCLE',` 다음 줄에 더한다:

```ts
  /** IP 규칙이 가리키는 팀(하위 팀 포함)이라 지울 수 없다 — `details.ruleCount`(규칙 수). 규칙을 먼저 지운다(2f-1) */
  ERR_TEAM_HAS_IP_RULES: 'ERR_TEAM_HAS_IP_RULES',
```

② `COMMON_ERROR_STATUS` 의 `[CommonErrorCodes.ERR_TEAM_MOVE_CYCLE]: 400,` 다음 줄에 `  [CommonErrorCodes.ERR_TEAM_HAS_IP_RULES]: 409,` 를 더한다.

`packages/admin-shared/src/index.ts` 끝(약관 export 블록 다음)에 더한다:

```ts
export {
  IP_SCOPE_TYPES,
  IP_CIDR_MAX_LENGTH,
  IP_RULE_DESCRIPTION_MAX_LENGTH,
  IP_PREVIEW_OPS,
  IP_ACCESS_SCHEMA_MESSAGES,
  normalizeIp,
  isValidIp,
  parseCidr,
  isValidCidr,
  ipInCidr,
  ipLayerRules,
  applicableIpLayer,
  evaluateIpAccess,
  ipScopeProblem,
  isValidIpScope,
  ipScopeTypeSchema,
  ipCidrSchema,
  adminIpRuleSchema,
  adminIpRuleListSchema,
  adminIpRuleItemSchema,
  adminIpRuleCreateSchema,
  adminIpRuleUpdateSchema,
  adminIpRuleRemoveSchema,
  adminIpPreviewQuerySchema,
  ipLockoutStatusSchema,
  adminIpPreviewItemSchema,
  adminIpPreviewSchema,
  type IpScopeType,
  type IpRule,
  type IpSubject,
  type IpScope,
  type ParsedCidr,
  type IpLockoutStatus,
  type AdminIpRule,
  type AdminIpRuleList,
  type AdminIpRuleItem,
  type AdminIpRuleCreate,
  type AdminIpRuleUpdate,
  type AdminIpRuleRemove,
  type AdminIpPreviewQuery,
  type AdminIpPreviewItem,
  type AdminIpPreview,
} from './ip-access.js'
```

- [ ] **Step 5: GREEN · 빌드**

```bash
pnpm --filter @ssworks/admin-shared test
pnpm --filter @ssworks/admin-shared typecheck
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server test audit
pnpm --filter @ssworks/admin-ui typecheck
pnpm lint
```

Expected: 모두 PASS. 🔴 `ipCidrSchema.safeParse('')` 가 두 이슈(최소 길이 없음 — refine 하나)인지 한 이슈인지는 단언하지 않는다(`success` 만). `describe('미리보기 쿼리 — op 별 빠진 칸 …')` 의 순서 단언이 다르게 나오면(superRefine 이슈 순서) 실측 순서를 보고서에 적고 순서 무관 비교(`expect.arrayContaining` + 길이)로 바꾼다.

- [ ] **Step 6: 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/ip-access.ts packages/admin-shared/src/ip-access.test.ts packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts packages/admin-shared/src/error-codes.ts packages/admin-shared/src/error-codes.test.ts packages/admin-shared/src/index.ts
git add packages/admin-shared/src/ip-access.ts packages/admin-shared/src/ip-access.test.ts packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts packages/admin-shared/src/error-codes.ts packages/admin-shared/src/error-codes.test.ts packages/admin-shared/src/index.ts
git commit -m "feat(admin-shared): IP 파서 · 층 평가 · 범위 판정 · 규칙 · 미리보기 스키마, 감사 액션 setting.ipAccess.* · 오류 코드 ERR_TEAM_HAS_IP_RULES" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 장 `0012_ip_access_rules` · 표 타입

**Files:**

- Create: `database/migrations/0012_ip_access_rules.ts` · `database/tables/ip-access-rules.ts`
- Modify: `database/migrations/index.ts` · `database/types.ts` · `runner.ts`
- Modify: `database/migrations/ddl.test.ts` · `index.test.ts` · `migrations.db.test.ts`

**Interfaces:**

- Consumes: admin-shared `IpScopeType`(Task 2 — 빌드된 `dist/`).
- Produces: `AdminDatabase.ipAccessRules: AdminIpAccessRulesTable`(열 `ruleNo` · `scopeType: IpScopeType` · `scopeRefNo: bigint | null` · `cidr` · `description: string | null` · `revision` · `createAt` · `updateAt`), 장 id `'0012_ip_access_rules'`, 진입점 `@ssworks/admin-server/migrations/0012_ip_access_rules`(exports 맵의 `./migrations/*` 가 덮는다). 시드 두 행(global `0.0.0.0/0` · `::/0`).

- [ ] **Step 1: 테스트를 고친다**

`database/migrations/ddl.test.ts`:

① import 줄 `import * as legalDocuments from './0011_legal_documents.js'` 다음에 `import * as ipAccessRules from './0012_ip_access_rules.js'` 를 더하고, `CHAPTERS` 배열 끝(`['0011_legal_documents', legalDocuments],` 다음)에 `  ['0012_ip_access_rules', ipAccessRules],` 를 더한다.

② 파일 끝에 더한다:

```ts
describe('0012_ip_access_rules', () => {
  it('표 · 인덱스 · 시드 두 행 — 열 정의 원문(2f-1 스펙 §4 · ③ D1)', async () => {
    const statements = await capture((db) => ipAccessRules.up(db))
    expect(statements).toHaveLength(3)
    const [table = '', index, seed = ''] = statements
    expect(table).toMatch(/^create table `ip_access_rules`/)
    for (const fragment of [
      '`rule_no` bigint unsigned primary key auto_increment',
      '`scope_type` varchar(16) collate ascii_bin not null',
      '`scope_ref_no` bigint unsigned comment',
      '`cidr` varchar(43) collate ascii_bin not null',
      '`description` varchar(200) comment',
      '`revision` integer unsigned default 0 not null',
    ]) {
      expect(table).toContain(fragment)
    }
    expect(index).toBe(
      'create index `idx_ip_access_rules_scope` on `ip_access_rules` (`scope_type`, `scope_ref_no`)',
    )
    expect(seed).toMatch(/^insert into `ip_access_rules`/)
  })

  it('🔴 scopeType 에 CHECK · ENUM · FK 가 없다 — 다형 참조, 입구는 zod(hangang)', async () => {
    const [table = ''] = await capture((db) => ipAccessRules.up(db))
    const outside = outsideQuotes(table).toLowerCase()
    expect(outside).not.toContain('check')
    expect(outside).not.toContain('enum')
    expect(outside).not.toContain('foreign key')
  })

  it('🔴 updateAt 에 ON UPDATE 가 없다 — revision 이 오르는 쓰기가 같이 쓴다(2d ⑧ U1 과 같다)', async () => {
    const [table = ''] = await capture((db) => ipAccessRules.up(db))
    const start = table.indexOf('`update_at`')
    expect(table.slice(start).toLowerCase()).toContain('default current_timestamp')
    expect(table.slice(start).toLowerCase()).not.toContain('on update')
  })

  it('down 은 표를 버린다', async () => {
    expect(await capture((db) => ipAccessRules.down(db))).toEqual(['drop table `ip_access_rules`'])
  })
})
```

`database/migrations/index.test.ts`:

① `it('0001~0011 순서', …)` 의 이름을 `'0001~0012 순서'` 로 바꾸고, 기대 배열 끝(`'0011_legal_documents',` 다음)에 `      '0012_ip_access_rules',` 를 더한다.

② `'🔴 순서 어긋남 …'` 테스트의 기대 문자열 두 곳을 고친다 — `0011_legal_documents / 맞는 순서` 를 `0011_legal_documents, 0012_ip_access_rules / 맞는 순서` 로, 마지막 조각 `'0008_audit_logs, 0009_guard_locks, 0010_team_tree_lock, 0011_legal_documents',` 를 `'0008_audit_logs, 0009_guard_locks, 0010_team_tree_lock, 0011_legal_documents, 0012_ip_access_rules',` 로.

③ `'🔴 빠진 장을 모아 한 번에 던진다'` 테스트 끝(`toThrow('빠진 장 0011_legal_documents')` 줄 다음)에 더한다:

```ts
expect(() => assertAdminMigrationStubs(dir)).toThrow('빠진 장 0012_ip_access_rules')
```

`database/migrations/migrations.db.test.ts`:

① `CORE_TABLES` 의 `'guard_locks',` 다음 줄에 `  'ip_access_rules',` 를 더한다.

② `it('collation · NULL · ON UPDATE · 타입을 스키마에서 잰다', …)` 의 약관 장 단언 묶음 끝(그 `it` 의 마지막 단언 다음)에 더한다:

```ts
// IP 장(2f-1 스펙 §4)
expect(column('ip_access_rules', 'scope_type').collationName).toBe('ascii_bin')
expect(column('ip_access_rules', 'scope_type').columnType).toBe('varchar(16)')
expect(column('ip_access_rules', 'cidr').collationName).toBe('ascii_bin')
expect(column('ip_access_rules', 'cidr').columnType).toBe('varchar(43)')
expect(column('ip_access_rules', 'scope_ref_no').columnType).toBe('bigint(20) unsigned')
expect(column('ip_access_rules', 'scope_ref_no').isNullable).toBe('YES')
expect(column('ip_access_rules', 'description').isNullable).toBe('YES')
expect(column('ip_access_rules', 'update_at').extra.toLowerCase()).not.toContain('on update')
```

③ 인덱스 이름 배열의 `'idx_legal_documents_kind_published',` 다음 줄에 `      'idx_ip_access_rules_scope',` 를 더한다.

④ 파일 끝(`describe` 안 마지막 `it` 다음)에 더한다:

```ts
it('0012 — global 허용 두 행이 시드된다(2f-1 스펙 ③ D1, 계열마다 한 행)', async () => {
  const rows = await t.db
    .selectFrom('ipAccessRules')
    .select(['scopeType', 'scopeRefNo', 'cidr', 'revision'])
    .orderBy('ruleNo')
    .execute()
  expect(rows).toEqual([
    { scopeType: 'global', scopeRefNo: null, cidr: '0.0.0.0/0', revision: 0 },
    { scopeType: 'global', scopeRefNo: null, cidr: '::/0', revision: 0 },
  ])
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test ddl index` · `pnpm --filter @ssworks/admin-server test:db migrations`
Expected: FAIL — `./0012_ip_access_rules.js` 가 없다, `ADMIN_MIGRATIONS` 에 0012 가 없다, `ip_access_rules` 표가 없다.

- [ ] **Step 3: 장 · 표 타입을 쓴다**

`database/migrations/0012_ip_access_rules.ts`(새):

```ts
import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/007_ip_access_rules.migration.ts(+ 부트스트랩 시드의 global 허용 두 행)
// 바꾼 점:
//  - revision 을 더했다 — Phase 0 §4 #4 쓰기 보호(2f-1 스펙 2-2 #2). updateAt 에 ON UPDATE 를 두지 않는다(장 0002 정정과 같다).
//  - cidr · scopeType 은 ascii_bin(hangang ascii_ci) — DB 는 비교 · 정렬 · UNIQUE 에 쓰지 않는다. CIDR 을 읽는 것은 admin-shared
//    parseCidr 하나다.
//  - global 허용 두 행을 장이 넣는다(2f-1 스펙 ③ D1) — hangang 은 부트스트랩 시드였다. 평가가 기본 거부라 모듈을 import 한 순간
//    아무도 못 들어오는 일이 없게. 장 0009 가 가드 행을 시드하는 것과 같다. 인자 타입 Kysely<unknown>(2a R2).
// 🔴 scopeType 에 ENUM · CHECK 를 두지 않는다 — 값을 더할 때 ALTER 가 필요하고 ENUM 정렬은 선언 순서다(hangang). 입구는 zod.
// 🔴 scopeRefNo 는 다형 참조라 FK 가 없다 — 팀 삭제는 가리키는 규칙이 있으면 409(2f-1 스펙 ⑤ T1), 사용자는 패키지에 삭제 경로가
//    없다.
// 🔴 0.0.0.0/0 과 ::/0 은 두 행이어야 한다 — 계열이 다르면 매칭하지 않는다(::/0 이 IPv4 를 통과시키지 않는다).

type IpAccessRules = {
  ipAccessRules: {
    scopeType: string
    scopeRefNo: bigint | null
    cidr: string
    description: string | null
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('ipAccessRules')
    .addColumn('ruleNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('scopeType', 'varchar(16)', (col) =>
      col.notNull().modifyFront(ASCII_BIN).modifyEnd(comment("'global' | 'team' | 'user'")),
    )
    .addColumn('scopeRefNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('global 이면 NULL. 다형 참조라 FK 가 없다')),
    )
    .addColumn('cidr', 'varchar(43)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('IPv4 · IPv6 CIDR(최대 43자). admin-shared parseCidr 가 읽는다')),
    )
    .addColumn('description', 'varchar(200)', (col) =>
      col.modifyEnd(comment('이 규칙이 왜 있는가')),
    )
    .addColumn('revision', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('낙관적 잠금. 수정마다 오른다')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updateAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxIpAccessRulesScope')
    .on('ipAccessRules')
    .columns(['scopeType', 'scopeRefNo'])
    .execute()

  await db
    .withTables<IpAccessRules>()
    .insertInto('ipAccessRules')
    .values([
      {
        scopeType: 'global',
        scopeRefNo: null,
        cidr: '0.0.0.0/0',
        description: '기본 허용(IPv4) — 지우거나 좁히기 전에 미리보기를 본다',
      },
      {
        scopeType: 'global',
        scopeRefNo: null,
        cidr: '::/0',
        description: '기본 허용(IPv6) — 지우거나 좁히기 전에 미리보기를 본다',
      },
    ])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('ipAccessRules').execute()
}
```

`database/tables/ip-access-rules.ts`(새):

```ts
import type { IpScopeType } from '@ssworks/admin-shared'
import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/ip-access-rules.table.ts
// 바꾼 점: revision 을 더했다. updateAt 은 revision 이 오르는 쓰기가 current_timestamp 로 같이 쓴다(장 0002 users 와 같다).

export interface AdminIpAccessRulesTable {
  ruleNo: Generated<bigint>
  /** 🔴 `'global' | 'team' | 'user'` — ENUM 이 아니다(장 주석). 모르는 값은 어느 층에도 걸리지 않는다 */
  scopeType: IpScopeType
  /** 🔴 다형 참조라 FK 가 없다 — global 이면 null */
  scopeRefNo: bigint | null
  /** IPv4 · IPv6 CIDR(최대 43자) — admin-shared `parseCidr` 가 읽는다 */
  cidr: string
  description: string | null
  revision: Generated<number>
  createAt: ColumnType<Date, never, never>
  /** 🔴 ON UPDATE 없음 — 수정 쓰기가 `current_timestamp` 로 같이 쓴다 */
  updateAt: ColumnType<Date, never, Date>
}
```

`database/types.ts`:

① import 묶음에 `import type { AdminIpAccessRulesTable } from './tables/ip-access-rules.js'` 를 더한다(알파벳 순 — `guard-locks` 다음).

② 머리 주석 `코어 10키만.` 을 `코어 11키만.` 으로 바꾼다.

③ `AdminDatabase` 의 `legalDocuments: AdminLegalDocumentsTable` 다음 줄에 `  ipAccessRules: AdminIpAccessRulesTable` 를 더한다.

④ 아래 `export type { … }` 의 `AdminGuardLocksTable,` 다음 줄에 `  AdminIpAccessRulesTable,` 를 더한다.

`runner.ts` — `export type { … } from './database/types.js'` 의 `AdminLegalDocumentsTable,` 다음 줄에 `  AdminIpAccessRulesTable,` 를 더한다.

`database/migrations/index.ts`:

① import 줄 `import * as legalDocuments from './0011_legal_documents.js'` 다음에 `import * as ipAccessRules from './0012_ip_access_rules.js'` 를 더한다.

② `ADMIN_MIGRATIONS` 끝에 `  '0012_ip_access_rules',` 를, `CHAPTERS` 끝에 `  '0012_ip_access_rules': ipAccessRules,` 를 더한다.

- [ ] **Step 4: GREEN**

```bash
pnpm --filter @ssworks/admin-server test ddl index runner-graph
pnpm --filter @ssworks/admin-server test:db migrations
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: 모두 PASS. `ddl.test.ts` 의 장 공통 테스트(앞쪽 `describe` — 모든 장에 TABLE_OPTIONS 등)도 0012 를 지난다. 🔴 `'`revision` integer unsigned default 0 not null'` 조각이 다르게 컴파일되면(예: `int`) 실측 문장을 보고서에 붙이고 그 조각을 실측대로 고친다 — 다른 단언은 고치지 않는다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/database/migrations/0012_ip_access_rules.ts packages/admin-server/src/database/tables/ip-access-rules.ts packages/admin-server/src/database/types.ts packages/admin-server/src/runner.ts packages/admin-server/src/database/migrations/index.ts packages/admin-server/src/database/migrations/ddl.test.ts packages/admin-server/src/database/migrations/index.test.ts packages/admin-server/src/database/migrations/migrations.db.test.ts
git add packages/admin-server/src/database
git add packages/admin-server/src/runner.ts
git commit -m "feat(admin-server): 장 0012_ip_access_rules — 규칙 표 · 범위 인덱스 · global 허용 두 행 시드, 표 타입" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 클라이언트 IP 출처 — 코어 옵션 `clientIp`

**Files:**

- Modify: `auth/request-meta.ts`(전체) · `auth/request-meta.test.ts`(전체)
- Modify: `auth/options.ts` · `auth/options.test.ts` · `auth/admin-auth.module.ts` · `auth/auth.service.ts`
- Modify: `audit/options.ts` · `audit/options.test.ts` · `audit/audit.module.ts` · `audit/entry.ts` · `audit/entry.test.ts` · `audit/audit.interceptor.ts` · `audit/auth-events.ts`
- Modify: `options.ts` · `index.ts`

**Interfaces:**

- Consumes: admin-shared `normalizeIp` · `isValidIp`(Task 2).
- Produces: `type AdminClientIpSource = 'req.ip' | 'x-real-ip'` · `resolveClientIpSource(value: unknown): AdminClientIpSource` · `clientIpOf(req: Request, source: AdminClientIpSource): string | null` · `requestMetaOf(req: Request, source: AdminClientIpSource): RequestMeta`(모두 `auth/request-meta.ts`). `ResolvedAuthConfig.clientIp` · `ResolvedAuditConfig.clientIp` · `AdminServerOptions.clientIp?`. `requestFieldsOf(req, clientIp)` · `buildAuditEntry(req, principal, options, outcome, secretKeys, clientIp)`. Task 6 · 9 가 `requestMetaOf` · `clientIpOf` 를 쓴다.

- [ ] **Step 1: 테스트를 쓴다**

`auth/request-meta.test.ts` 를 통째로 바꾼다:

```ts
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { clientIpOf, requestMetaOf, resolveClientIpSource } from './request-meta.js'

function req(input: { ip?: string; userAgent?: unknown; realIp?: string | string[] }) {
  const headers: Record<string, unknown> = {}
  if (input.userAgent !== undefined) headers['user-agent'] = input.userAgent
  if (input.realIp !== undefined) headers['x-real-ip'] = input.realIp
  return { ip: input.ip, headers } as unknown as Request
}

describe('resolveClientIpSource(2f-1 스펙 ④ C1)', () => {
  it("기본은 'req.ip' · 'x-real-ip' 는 그대로", () => {
    expect(resolveClientIpSource(undefined)).toBe('req.ip')
    expect(resolveClientIpSource('req.ip')).toBe('req.ip')
    expect(resolveClientIpSource('x-real-ip')).toBe('x-real-ip')
  })

  it('🔴 모르는 값은 기동에서 멈춘다 — 오타가 조용히 req.ip 로 떨어지지 않게', () => {
    for (const bad of ['X-Real-IP', 'x-forwarded-for', '', null, 1]) {
      expect(() => resolveClientIpSource(bad)).toThrow(
        "clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.",
      )
    }
  })
})

describe("clientIpOf — 'req.ip'", () => {
  it('req.ip 를 정규화한다 — IPv4-mapped · IPv6 루프백', () => {
    expect(clientIpOf(req({ ip: '10.0.0.1' }), 'req.ip')).toBe('10.0.0.1')
    expect(clientIpOf(req({ ip: '::ffff:127.0.0.1' }), 'req.ip')).toBe('127.0.0.1')
    expect(clientIpOf(req({ ip: '::1' }), 'req.ip')).toBe('127.0.0.1')
    expect(clientIpOf(req({ ip: '2001:db8::7' }), 'req.ip')).toBe('2001:db8::7')
  })

  it('없거나 비거나 주소가 아니면 null(유닉스 소켓 뒤 — req.ip 가 비는 배포)', () => {
    expect(clientIpOf(req({}), 'req.ip')).toBeNull()
    expect(clientIpOf(req({ ip: '' }), 'req.ip')).toBeNull()
    expect(clientIpOf(req({ ip: 'not-an-ip' }), 'req.ip')).toBeNull()
  })

  it('🔴 X-Real-IP 를 보지 않는다 — 엣지 없이 노출된 서버에서 헤더 한 줄로 위조할 수 없다', () => {
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '203.0.113.7' }), 'req.ip')).toBe('10.0.0.1')
  })
})

describe("clientIpOf — 'x-real-ip'", () => {
  it('헤더가 있으면 그 값(정규화), 없으면 req.ip', () => {
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '203.0.113.7' }), 'x-real-ip')).toBe(
      '203.0.113.7',
    )
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '::ffff:203.0.113.7' }), 'x-real-ip')).toBe(
      '203.0.113.7',
    )
    expect(clientIpOf(req({ ip: '10.0.0.1' }), 'x-real-ip')).toBe('10.0.0.1')
  })

  it('🔴 중복 헤더(Node 가 쉼표로 잇는다 · §14 R1-④) · 배열 · 형식 오류 · 빈 값은 null — 앞쪽을 고르면 위조 값을 고른다', () => {
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '1.2.3.4, 5.6.7.8' }), 'x-real-ip')).toBeNull()
    expect(
      clientIpOf(req({ ip: '10.0.0.1', realIp: ['1.2.3.4', '5.6.7.8'] }), 'x-real-ip'),
    ).toBeNull()
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: 'garbage' }), 'x-real-ip')).toBeNull()
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '' }), 'x-real-ip')).toBeNull()
  })
})

describe('requestMetaOf', () => {
  it('clientIp 와 User-Agent 문자열 — 없거나 비면 null', () => {
    expect(requestMetaOf(req({ ip: '10.0.0.1', userAgent: 'UA/1' }), 'req.ip')).toEqual({
      clientIp: '10.0.0.1',
      userAgent: 'UA/1',
    })
    expect(requestMetaOf(req({}), 'req.ip')).toEqual({ clientIp: null, userAgent: null })
    expect(requestMetaOf(req({ ip: '', userAgent: '' }), 'req.ip')).toEqual({
      clientIp: null,
      userAgent: null,
    })
  })
})
```

`auth/options.test.ts` — 첫 `describe` 안 끝에 더한다:

```ts
it("clientIp — 기본 'req.ip' · 'x-real-ip' · 모르는 값은 기동에서 멈춘다(2f-1 ④ C1)", () => {
  const auth = { jwtSecret: 'x'.repeat(32) }
  expect(resolveAuthConfig(auth, undefined).clientIp).toBe('req.ip')
  expect(resolveAuthConfig(auth, undefined, undefined, 'x-real-ip').clientIp).toBe('x-real-ip')
  expect(() => resolveAuthConfig(auth, undefined, undefined, 'X-Real-IP')).toThrow(
    "clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.",
  )
})
```

`audit/options.test.ts` — `describe('resolveAuditConfig')` 안 끝에 더한다:

```ts
it("clientIp — 기본 'req.ip' · 'x-real-ip' · 모르는 값은 멈춘다(2f-1 ④ C1)", () => {
  expect(resolveAuditConfig(undefined).clientIp).toBe('req.ip')
  expect(resolveAuditConfig(undefined, 'x-real-ip').clientIp).toBe('x-real-ip')
  expect(() => resolveAuditConfig(undefined, 'xff')).toThrow(
    "clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.",
  )
})
```

`audit/entry.test.ts`:

① `requestFieldsOf(` 세 호출에 둘째 인자 `'req.ip'` 를 더한다 — `requestFieldsOf(fakeRequest())` → `requestFieldsOf(fakeRequest(), 'req.ip')`, `requestFieldsOf(fakeRequest({ … }),)` → `requestFieldsOf(fakeRequest({ … }), 'req.ip')`, `requestFieldsOf(fakeRequest({ ip: undefined, headers: {} }))` → `requestFieldsOf(fakeRequest({ ip: undefined, headers: {} }), 'req.ip')`.

② `buildAuditEntry(` 네 호출 모두 마지막 인자 줄 `secretKeySet(),` 다음에 `'req.ip',` 줄을 더한다.

③ `describe('requestFieldsOf')` 안 끝에 더한다:

```ts
it("clientIp 출처 — 'x-real-ip' 는 헤더, 둘 다 정규화한다(2f-1 P10)", () => {
  expect(
    requestFieldsOf(
      fakeRequest({ headers: { 'user-agent': 'UA/1', 'x-real-ip': '::ffff:203.0.113.7' } }),
      'x-real-ip',
    ).ip,
  ).toBe('203.0.113.7')
  expect(requestFieldsOf(fakeRequest({ ip: '::ffff:10.0.0.1' }), 'req.ip').ip).toBe('10.0.0.1')
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test request-meta options entry`
Expected: FAIL — `clientIpOf` · `resolveClientIpSource` 가 없다, `clientIp` 가 `undefined`, `requestFieldsOf` 의 정규화 단언 실패.

- [ ] **Step 3: `request-meta.ts` 를 바꾼다**

`auth/request-meta.ts` 를 통째로 바꾼다:

```ts
import { isValidIp, normalizeIp } from '@ssworks/admin-shared'
import type { Request } from 'express'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.controller.ts `sessionMeta` +
//       hangang-home apps/api/src/core/utils/request-ip.util.ts `getClientIp`(정규화 · X-Real-IP)
// 바꾼 점:
//  - 없으면 null(gise 는 '0.0.0.0').
//  - 출처를 코어 옵션 clientIp 로 고른다(2f-1 스펙 ④ C1 · P10). hangang 의 헤더 순서(X-Real-IP → XFF[0] → X-Remote-IP →
//    소켓)는 무조건 믿었다 — 엣지 프록시(set_real_ip_from) 없이 노출되면 헤더 한 줄로 IP 제한을 우회한다. 기본은 'req.ip'
//    (Express trust proxy — 쓰는 쪽 main.ts 몫).
//  - 두 출처 모두 normalizeIp 를 지나고 주소 하나로 읽혀야 한다 — 아니면 null. IP 정책은 null 을 거부한다(fail-closed).
// 🔴 세션 행 · 감사 · IP 정책이 이 값 하나를 본다.

/** 코어 옵션 `clientIp` — 클라이언트 IP 를 읽는 곳 */
export type AdminClientIpSource = 'req.ip' | 'x-real-ip'

export interface RequestMeta {
  clientIp: string | null
  userAgent: string | null
}

/** 🔴 기동에서 멈춘다 — 오타가 조용히 'req.ip' 로 떨어지면 엣지 뒤 배포가 모든 요청을 엣지 주소로 본다 */
export function resolveClientIpSource(value: unknown): AdminClientIpSource {
  if (value === undefined) return 'req.ip'
  if (value === 'req.ip' || value === 'x-real-ip') return value
  throw new Error("clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.")
}

function addressOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const normalized = normalizeIp(raw.trim())
  return isValidIp(normalized) ? normalized : null
}

/**
 * - `'req.ip'`: Express 의 `req.ip`.
 * - `'x-real-ip'`: 헤더가 있으면 그 값만. 🔴 배열 · 쉼표로 이어 붙은 값(중복 헤더 — Node 가 `'a, b'` 로 잇는다, 2f-1 스펙
 *   §14 R1-④) · 형식 오류 · 빈 값은 null — 앞쪽을 고르면 위조 값을 고른다. 헤더가 없으면 `req.ip`.
 */
export function clientIpOf(req: Request, source: AdminClientIpSource): string | null {
  if (source === 'x-real-ip') {
    const header = req.headers['x-real-ip']
    if (header !== undefined) return addressOf(header)
  }
  return addressOf(req.ip)
}

export function requestMetaOf(req: Request, source: AdminClientIpSource): RequestMeta {
  const userAgent = req.headers['user-agent']
  return {
    clientIp: clientIpOf(req, source),
    userAgent: typeof userAgent === 'string' && userAgent.length > 0 ? userAgent : null,
  }
}
```

- [ ] **Step 4: 설정 · 부르는 곳을 고친다**

`options.ts`(코어):

① import 묶음에 `import type { AdminClientIpSource } from './auth/request-meta.js'` 를 더한다.

② `AdminServerOptions` 의 `legal?: AdminLegalOptions` 다음에 더한다:

```ts
  /**
   * 클라이언트 IP 의 출처(2f-1 스펙 ④ C1). 기본 `'req.ip'` — Express `trust proxy`(쓰는 쪽 main.ts)를 따른다. 엣지 프록시가
   * `X-Real-IP` 를 덮어쓰면 `'x-real-ip'`(헤더가 없으면 req.ip). 🔴 엣지 없이 노출된 서버에 `'x-real-ip'` 를 쓰면 헤더 한 줄로
   * IP 접근 제어를 우회한다. 세션 행 · 감사 · IP 정책이 같은 값을 본다. 두 값 밖이면 기동에서 멈춘다.
   */
  clientIp?: AdminClientIpSource
```

`auth/options.ts`:

① import 묶음에 `import { resolveClientIpSource, type AdminClientIpSource } from './request-meta.js'` 를 더한다.

② `ResolvedAuthConfig` 의 `permissions: Readonly<AdminPermissionMap>` 다음 줄에 더한다:

```ts
/** 코어 옵션 clientIp(2f-1 ④ C1) — 세션 행 · 이벤트 · IP 정책이 보는 클라이언트 IP 의 출처 */
clientIp: AdminClientIpSource
```

③ `resolveAuthConfig` 시그니처의 `permissions?: AdminPermissionMap,` 다음 줄에 `  clientIp?: unknown,` 를 더하고, 반환 객체의 `permissions: resolvePermissionMap(permissions),` 다음 줄에 `    clientIp: resolveClientIpSource(clientIp),` 를 더한다.

`auth/admin-auth.module.ts` — `resolveAuthConfig(options.auth, options.passwordPolicy, options.permissions)` 를 `resolveAuthConfig(options.auth, options.passwordPolicy, options.permissions, options.clientIp)` 로 바꾼다.

`auth/auth.service.ts`:

① 머리 주석 `바꾼 점:` 의 마지막 항목 다음에 한 줄을 더한다:

```ts
//  - 클라이언트 IP 는 코어 옵션 clientIp 출처(config.clientIp)로 읽는다(2f-1 스펙 ④ C1).
```

② `requestMetaOf(req)` 세 곳(로그인 IP 판정 · 매 요청 IP 판정 · `newSession`)을 모두 `requestMetaOf(req, this.config.clientIp)` 로 바꾼다.

`audit/options.ts`:

① import 묶음에 `import { resolveClientIpSource, type AdminClientIpSource } from '../auth/request-meta.js'` 를 더한다.

② `ResolvedAuditConfig` 의 `secretKeys: ReadonlySet<string>` 다음 줄에 더한다:

```ts
/** 코어 옵션 clientIp(2f-1 ④ C1) — 감사 행 ip 의 출처. 인증과 같은 해석 */
clientIp: AdminClientIpSource
```

③ `resolveAuditConfig(options: AdminAuditOptions | undefined)` 를 `resolveAuditConfig(options: AdminAuditOptions | undefined, clientIp?: unknown)` 로 바꾸고, 반환 객체의 `secretKeys: secretKeySet(extra),` 다음 줄에 `    clientIp: resolveClientIpSource(clientIp),` 를 더한다.

`audit/audit.module.ts` — `resolveAuditConfig(options.audit)` 를 `resolveAuditConfig(options.audit, options.clientIp)` 로 바꾼다.

`audit/entry.ts`:

① `import { requestMetaOf } from '../auth/request-meta.js'` 를 `import { requestMetaOf, type AdminClientIpSource } from '../auth/request-meta.js'` 로 바꾼다.

② `export function requestFieldsOf(req: Request): AuditRequestFields {` 를 `export function requestFieldsOf(req: Request, clientIp: AdminClientIpSource): AuditRequestFields {` 로, 그 첫 줄 `const meta = requestMetaOf(req)` 를 `const meta = requestMetaOf(req, clientIp)` 로 바꾼다.

③ `buildAuditEntry` 시그니처의 `secretKeys: ReadonlySet<string>,` 다음 줄에 `  clientIp: AdminClientIpSource,` 를 더하고, 본문의 `...requestFieldsOf(req),` 를 `...requestFieldsOf(req, clientIp),` 로 바꾼다.

`audit/audit.interceptor.ts` — `buildAuditEntry(req, principal, meta, outcome(), this.config.secretKeys)` 를 `buildAuditEntry(req, principal, meta, outcome(), this.config.secretKeys, this.config.clientIp)` 로 바꾼다.

`audit/auth-events.ts` — `...requestFieldsOf(req),` 를 `...requestFieldsOf(req, this.config.clientIp),` 로 바꾼다.

`index.ts` — `export type { AdminAuthOptions, AdminAuthCookieOptions } from './auth/options.js'` 다음 줄에 더한다:

```ts
export type { AdminClientIpSource } from './auth/request-meta.js'
```

- [ ] **Step 5: GREEN**

```bash
pnpm --filter @ssworks/admin-server test
pnpm --filter @ssworks/admin-server test:db auth.service.login
pnpm --filter @ssworks/admin-server test:db audit
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: 모두 PASS. 서비스 테스트의 `fakeRequest` 주소(`10.1.2.3` 등 일반 IPv4)는 정규화로 바뀌지 않는다(§14 R1-④).

- [ ] **Step 6: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth/request-meta.ts packages/admin-server/src/auth/request-meta.test.ts packages/admin-server/src/auth/options.ts packages/admin-server/src/auth/options.test.ts packages/admin-server/src/auth/admin-auth.module.ts packages/admin-server/src/auth/auth.service.ts packages/admin-server/src/audit/options.ts packages/admin-server/src/audit/options.test.ts packages/admin-server/src/audit/audit.module.ts packages/admin-server/src/audit/entry.ts packages/admin-server/src/audit/entry.test.ts packages/admin-server/src/audit/audit.interceptor.ts packages/admin-server/src/audit/auth-events.ts packages/admin-server/src/options.ts packages/admin-server/src/index.ts
git add packages/admin-server/src/auth packages/admin-server/src/audit packages/admin-server/src/options.ts packages/admin-server/src/index.ts
git commit -m "feat(admin-server): 코어 옵션 clientIp — req.ip 기본 · x-real-ip(중복 · 형식 오류는 null), 세션 · 감사 · 인증이 같은 정규화 값" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: IP 를 아는 잔존 셈 · 표시 토큰 · 사용자 `teamNo` 잔존

**Files:**

- Create: `ip-access/rule-set.ts` · `accounts/super-admin.ip.db.test.ts` · `test-support/ip-access.ts`
- Modify: `accounts/super-admin.ts` · `accounts/super-admin.db.test.ts` · `accounts/errors.ts` · `tokens.ts`
- Modify: `roles/roles.service.ts` · `users/users.service.ts`

**Interfaces:**

- Consumes: admin-shared `applicableIpLayer`(Task 2), 표 `ipAccessRules`(Task 3), `holdGuard` · `underHeld`(Task 1).
- Produces:
  - `ipRuleSetQuery(db: Kysely<AdminDatabase>)` — `ip-access/rule-set.ts`, `select scopeType, scopeRefNo, cidr from ipAccessRules`(비잠금). Task 9 정책 · 자기 잠금이 쓴다.
  - `interface SurvivalCount { ipAware: boolean }` · `countSuperAdmins(trx, count: SurvivalCount): Promise<number>` · `withSuperAdminSurvival<L, T>(trx, steps: LockedWrite<L, T>, count: SurvivalCount): Promise<T>` — Task 9 IP 서비스가 `{ ipAware: true }` 로 부른다.
  - `IP_ACCESS_ENABLED`(tokens.ts — 내부 심볼). Task 11 모듈이 `true` 로 낸다.
  - 생성자: `new AdminRolesService(db, config, reauthService?, ipAccess?: boolean)` · `new AdminUsersService(db, config, sessions, reauthService?, ipAccess?: boolean)`.
  - `test-support/ip-access.ts`: `SEED_IP_RULES` · `resetIpRules(db, rules?)` · `seedIpRule(db, input): Promise<bigint>` · `ipRulesOf(db)`. Task 9 가 이 파일에 더한다.

- [ ] **Step 1: 테스트 도우미와 실패하는 테스트를 쓴다**

`test-support/ip-access.ts`(새):

```ts
import type { IpScopeType } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 테스트 전용 — IP 규칙 시드 · 초기화(2f-1). 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 🔴 규칙은 DB 전역 상태다 — 규칙을 바꾸는 테스트 파일은 beforeEach 로 resetIpRules 를 부른다.

export interface IpRuleSeed {
  scopeType: IpScopeType
  scopeRefNo?: bigint | null
  cidr: string
  description?: string | null
}

/** 장 0012 의 시드와 같은 두 행 */
export const SEED_IP_RULES: readonly IpRuleSeed[] = Object.freeze([
  { scopeType: 'global', cidr: '0.0.0.0/0' },
  { scopeType: 'global', cidr: '::/0' },
])

export async function seedIpRule(db: Kysely<AdminDatabase>, input: IpRuleSeed): Promise<bigint> {
  const result = await db
    .insertInto('ipAccessRules')
    .values({
      scopeType: input.scopeType,
      scopeRefNo: input.scopeRefNo ?? null,
      cidr: input.cidr,
      description: input.description ?? null,
    })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

/** 규칙을 모두 지우고 rules(기본 — 장의 시드 두 행)만 넣는다. 넣은 번호를 차례로 돌려준다 */
export async function resetIpRules(
  db: Kysely<AdminDatabase>,
  rules: readonly IpRuleSeed[] = SEED_IP_RULES,
): Promise<bigint[]> {
  await db.deleteFrom('ipAccessRules').execute()
  const ruleNos: bigint[] = []
  for (const rule of rules) ruleNos.push(await seedIpRule(db, rule))
  return ruleNos
}

/** 지금 규칙 — ruleNo 순 */
export function ipRulesOf(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('ipAccessRules')
    .select(['ruleNo', 'scopeType', 'scopeRefNo', 'cidr', 'description', 'revision'])
    .orderBy('ruleNo')
    .execute()
}
```

`accounts/super-admin.db.test.ts`:

① import 줄 다음(파일 머리 주석 위)에 상수를 더한다:

```ts
/** 이 파일은 IP 모듈 없는 셈을 잰다(2f-1 — IP 를 아는 셈은 super-admin.ip.db.test.ts) */
const NO_IP = { ipAware: false } as const
```

② `const count = (db: TestDatabase['db']) => db.transaction().execute((trx) => countSuperAdmins(trx))` 를 `const count = (db: TestDatabase['db']) => db.transaction().execute((trx) => countSuperAdmins(trx, NO_IP))` 로 바꾼다.

③ `withSuperAdminSurvival(trx, {` 로 시작하는 다섯 호출 모두 두 번째 인자(객체 리터럴)를 닫는 `}` 뒤에 `, NO_IP` 를 더한다 — 예: `withSuperAdminSurvival(trx, { lock: …, write: … }, NO_IP)`.

`accounts/super-admin.ip.db.test.ts`(새):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { AdminRolesService } from '../roles/roles.service.js'
import { accountsConfig, testPrincipal, usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { holdGuard, underHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { resetIpRules, seedIpRule } from '../test-support/ip-access.js'
import { AdminUsersService } from '../users/users.service.js'
import { ACCOUNT_MESSAGES } from './errors.js'
import { GUARD_LOCK_SUPER_ADMIN, countSuperAdmins } from './super-admin.js'

// IP 를 아는 잔존 셈(2f-1 스펙 ② R1 · P3 · P4 · P5 — hangang A1). 셈은 재직 ∧ '*' ∧ 적용 층이 global. 🔴 셈은 DB 전역 상태라
// 시나리오 테스트는 retireStars 로 이 파일의 전권자를 모두 퇴사시키고 시작한다. 규칙은 beforeEach 로 시드 두 행만 남긴다.

let t: TestDatabase
let star: bigint
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
  star = await seedRole(t.db, { roleName: 'ip-star', permissions: ['*'] })
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

const count = (ipAware: boolean) =>
  t.db.transaction().execute((trx) => countSuperAdmins(trx, { ipAware }))

/** 이 파일의 전권자(star 역할)를 모두 퇴사시킨다 — 시나리오가 "마지막 전권자" 에서 시작하게 */
async function retireStars(): Promise<void> {
  await t.db
    .updateTable('users')
    .set({ resignAt: new Date(Date.now() - 60_000) })
    .where('roleNo', '=', star)
    .where('resignAt', 'is', null)
    .execute()
}

async function failure(promise: Promise<unknown>): Promise<BusinessError> {
  const error = await promise.then(
    () => {
      throw new Error('실패를 기대했다')
    },
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BusinessError)
  return error as BusinessError
}

const users = (ipAware: boolean) =>
  new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined, ipAware)

const teamsOf = async (userNo: bigint) =>
  (
    await t.db
      .selectFrom('teamUserMap')
      .select('teamNo')
      .where('userNo', '=', userNo)
      .orderBy('teamNo')
      .execute()
  ).map((row) => row.teamNo)

describe('countSuperAdmins — ipAware', () => {
  it('🔴 적용 층이 global 인 전권자만 센다 — user 규칙 · 대표 팀의 팀 규칙에 묶인 전권자는 빼고, 무소속은 센다', async () => {
    const beforeIp = await count(true)
    const beforePlain = await count(false)
    const fencedTeam = await seedTeam(t.db, 'cnt-fenced')
    const openTeam = await seedTeam(t.db, 'cnt-open')
    const farTeam = await seedTeam(t.db, 'cnt-far')
    await seedUser(t.db, { roleNo: star, userId: 'cnt-free' })
    const pinned = await seedUser(t.db, { roleNo: star, userId: 'cnt-pinned' })
    const teamed = await seedUser(t.db, { roleNo: star, userId: 'cnt-teamed' })
    // Review Focus 5 — 두 팀에 걸쳤고 큰 번호 팀에만 팀 규칙: 대표 팀(작은 번호)에는 규칙이 없으니 global 이다
    const split = await seedUser(t.db, { roleNo: star, userId: 'cnt-split' })
    await addToTeam(t.db, fencedTeam, teamed.userNo)
    await addToTeam(t.db, openTeam, split.userNo)
    await addToTeam(t.db, farTeam, split.userNo)
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: pinned.userNo, cidr: '10.0.0.0/8' })
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: fencedTeam, cidr: '10.0.0.0/8' })
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: farTeam, cidr: '10.0.0.0/8' })
    expect((await count(true)) - beforeIp).toBe(2)
    expect((await count(false)) - beforePlain).toBe(4)
  })

  it('🔴 global 규칙이 하나도 없으면 IP 를 아는 셈은 0 — IP 모듈이 없는 셈은 규칙을 보지 않는다(P3)', async () => {
    await seedUser(t.db, { roleNo: star, userId: 'cnt-none' })
    await resetIpRules(t.db, [])
    expect(await count(true)).toBe(0)
    expect(await count(false)).toBeGreaterThan(0)
  })
})

describe('사용자 수정의 teamNo — 잔존 지점(P5)', () => {
  it('🔴 teamNo 만 바꾸는 수정도 잔존 가드를 잡는다', async () => {
    const plain = await seedRole(t.db, { roleName: 'tn-plain', permissions: [] })
    const user = await seedUser(t.db, { roleNo: plain, userId: 'tn-guard' })
    const team = await seedTeam(t.db, 'tn-guard-team')
    const { waited, result } = await underHeld(t, holdGuard(GUARD_LOCK_SUPER_ADMIN), () =>
      users(false).update(user.userNo, { teamNo: team, revision: 0 }, root),
    )
    expect(waited).toBe(true)
    if (!result.ok) throw result.error
  })

  it('🔴 시나리오 B — 마지막 도달 가능 전권자를 팀 규칙이 있는 팀으로 옮기면 409, 소속 그대로 · IP 모듈이 없으면 된다', async () => {
    await retireStars()
    const last = await seedUser(t.db, { roleNo: star, userId: 'tn-last' })
    const fenced = await seedTeam(t.db, 'tn-fenced')
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: fenced, cidr: '10.0.0.0/8' })
    const error = await failure(
      users(true).update(last.userNo, { teamNo: fenced, revision: 0 }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await teamsOf(last.userNo)).toEqual([])
    const done = await users(false).update(last.userNo, { teamNo: fenced, revision: 0 }, root)
    expect(done.item.teamNo).toBe(fenced)
  })
})

describe('역할 서비스 — 토큰이 있으면 IP 를 아는 셈(P3)', () => {
  it('🔴 도달 가능한 마지막 전권자의 역할에서 * 를 빼면 409 — user 규칙에 묶인 다른 전권자는 세지 않는다', async () => {
    await retireStars()
    const solo = await seedRole(t.db, { roleName: 'rl-solo', permissions: ['*'] })
    await seedUser(t.db, { roleNo: solo, userId: 'rl-free' })
    const pinned = await seedUser(t.db, { roleNo: star, userId: 'rl-pinned' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: pinned.userNo, cidr: '10.0.0.0/8' })
    const roles = (ipAware: boolean) =>
      new AdminRolesService(t.db, accountsConfig(), undefined, ipAware)
    const error = await failure(roles(true).update(solo, { permissions: [], revision: 0 }, root))
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    // 토큰이 없으면 pinned 도 센다(2 → 1) — 된다
    await roles(false).update(solo, { permissions: [], revision: 0 }, root)
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db super-admin`
Expected: FAIL — `countSuperAdmins` 둘째 인자가 무시돼 `count(true)` 가 4 증가, `teamNo` 만 바꾸는 수정이 가드를 기다리지 않는다(`waited` false), 시나리오 B 가 200, 역할 수정이 성공.

- [ ] **Step 3: 규칙 읽기 · 토큰 · 셈을 고친다**

`ip-access/rule-set.ts`(새):

```ts
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts loadRules(평가에 필요한 세 열)
// 바꾼 점: 쿼리 하나로 둔다 — IP 정책(매 인증) · 잔존 셈 · 자기 잠금 판정이 같은 모양을 읽는다(2f-1 스펙 P2 · P4 · P6).
// 🔴 비잠금 읽기다. 여기에 FOR UPDATE 를 붙이지 않는다 — 인증 hot path 가 서로를 막고, 잔존 셈의 잠금은 교착 배치다(hangang).

export function ipRuleSetQuery(db: Kysely<AdminDatabase>) {
  return db.selectFrom('ipAccessRules').select(['scopeType', 'scopeRefNo', 'cidr'])
}
```

`tokens.ts` — `ADMIN_LEGAL_CONFIG` 정의 다음에 더한다:

```ts
/**
 * 내부 — IP 접근 제어 모듈이 있다는 표시(값 true, 2f-1 스펙 P3). `AdminIpAccessModule`(전역)이 낸다. 역할 · 사용자 서비스가
 * `@Optional()` 로 받아 잔존 셈이 IP 층을 보게 한다. index 에 내지 않는다.
 */
export const IP_ACCESS_ENABLED = Symbol('IP_ACCESS_ENABLED')
```

`accounts/errors.ts` — `lastSuperAdmin:` 의 문구를 바꾼다:

```ts
  lastSuperAdmin:
    '이 변경 뒤에는 어디서든 로그인할 수 있는 전체 권한 관리자가 한 명도 남지 않습니다. 먼저 다른 관리자에게 전체 권한 역할을 주거나 접속 IP 제한을 푸세요.',
```

`accounts/super-admin.ts`:

① import 묶음을 바꾼다:

```ts
import { BusinessError, CommonErrorCodes, applicableIpLayer } from '@ssworks/admin-shared'
import { sql, type SqlBool, type Transaction } from 'kysely'
import { lockGuardRow } from '../database/guard-locks.js'
import type { AdminDatabase } from '../database/types.js'
import { ipRuleSetQuery } from '../ip-access/rule-set.js'
import { ACCOUNT_MESSAGES } from './errors.js'
```

② 머리 주석 `바꾼 점:` 의 첫 항목 `//  - 셈은 재직(resignAt IS NULL) ∧ 역할에 '*'. IP 층(applicableIpLayer — "어디서든 로그인할 수 있는")은 2f 가 더한다.` 를 바꾼다:

```ts
//  - 셈은 재직(resignAt IS NULL) ∧ 역할에 '*'. IP 접근 제어 모듈이 있으면(표시 토큰) 그 위에 적용 층이 global(2f-1 스펙 ② R1 ·
//    P4 — hangang countReachableSuperAdmins · A1). user · team 층에 묶인 전권자는 "어디서든 로그인해 권한을 되돌린다" 를
//    보증하지 못한다. CIDR 이 그 사람의 주소를 통과시키는지는 보지 않는다 — "주소로 좁혀졌는가" 만 본다.
```

③ `export async function countSuperAdmins(…)` 함수 전체를 바꾸고, 그 위에 `SurvivalCount` 를 둔다:

```ts
/**
 * 셈의 갈래(2f-1 스펙 P3 · P4). `ipAware` 는 IP 접근 제어 모듈의 표시 토큰(IP_ACCESS_ENABLED)이 있을 때만 참이다.
 * 🔴 규칙 표의 유무로 가르지 않는다 — 장은 모두 필수라 표는 늘 있다. 모듈을 안 쓰는 소비자가 시드를 지워도 셈이 0 으로
 *    떨어져 잔존이 조용히 꺼지면 안 된다.
 */
export interface SurvivalCount {
  ipAware: boolean
}

/** 재직(퇴사 예정도 뺀다) · 역할에 '*' 가 있는 사용자 수 — ipAware 면 그중 적용 층이 global 인 사람만 */
export async function countSuperAdmins(
  trx: Transaction<AdminDatabase>,
  count: SurvivalCount,
): Promise<number> {
  if (!count.ipAware) {
    const row = await trx
      .selectFrom('users as u')
      .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
      .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
      .where('u.resignAt', 'is', null)
      .where(sql<SqlBool>`json_contains(${sql.ref('r.permissions')}, '"*"')`)
      .executeTakeFirstOrThrow()
    return Number(row.n)
  }
  // 🔴 대표 팀 = 가장 작은 teamNo — 인증(kysely-auth.repository findPrincipal)과 같은 규칙이다. 정책이 고르는 층과 셈이 고르는
  //    층이 갈리면 보증한 사람과 실제로 로그인하는 사람이 달라진다. LEFT JOIN — 무소속 전권자도 센다(팀 층이 안 걸릴 뿐).
  const rows = await trx
    .selectFrom('users as u')
    .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
    .leftJoin(
      (eb) =>
        eb
          .selectFrom('teamUserMap')
          .select((sub) => ['teamUserMap.userNo', sub.fn.min('teamUserMap.teamNo').as('teamNo')])
          .groupBy('teamUserMap.userNo')
          .as('primaryTeam'),
      (join) => join.onRef('primaryTeam.userNo', '=', 'u.userNo'),
    )
    .select(['u.userNo', 'primaryTeam.teamNo'])
    .where('u.resignAt', 'is', null)
    .where(sql<SqlBool>`json_contains(${sql.ref('r.permissions')}, '"*"')`)
    .execute()
  if (rows.length === 0) return 0
  // 🔴 비잠금 — 셈과 같은 읽기 뷰다. IP 쓰기는 모두 이 센티넬을 잡으므로 뷰 뒤에 바뀌는 규칙이 없다(2f-1 스펙 §5-3).
  const rules = await ipRuleSetQuery(trx).execute()
  return rows.filter(
    (row) =>
      applicableIpLayer(rules, {
        userNo: row.userNo,
        teamNos: row.teamNo == null ? [] : [row.teamNo],
      }) === 'global',
  ).length
}
```

④ `withSuperAdminSurvival` 를 바꾼다(JSDoc 의 첫 줄은 그대로):

```ts
/**
 * 잔존을 줄일 수 있는 쓰기를 감싼다 — 센티넬(첫 문장) → lock() → 전 셈 → write(locked) → 후 셈 → 판정(던지면 롤백)
 * 🔴 호출자는 트랜잭션의 첫 호출로 부른다 — 앞선 SELECT(revision 확인 등)가 읽기 뷰를 먼저 열면 셈이 낡는다
 * 🔴 count 는 부르는 쪽이 정한다 — 역할 · 사용자는 표시 토큰 유무, IP 쓰기는 늘 { ipAware: true }(2f-1 스펙 P3)
 */
export async function withSuperAdminSurvival<L, T>(
  trx: Transaction<AdminDatabase>,
  steps: LockedWrite<L, T>,
  count: SurvivalCount,
): Promise<T> {
  await lockSuperAdminGuard(trx)
  const locked = await steps.lock()
  const before = await countSuperAdmins(trx, count)
  const result = await steps.write(locked)
  assertSuperAdminSurvives(before, await countSuperAdmins(trx, count))
  return result
}
```

- [ ] **Step 4: 역할 · 사용자 서비스가 토큰을 받는다**

`roles/roles.service.ts`:

① `../tokens.js` import 에 `IP_ACCESS_ENABLED` 를, `../accounts/super-admin.js` import 에 `type SurvivalCount` 를 더한다.

② 생성자의 `@Optional() private readonly reauthService?: AdminReauthService,` 다음 줄에 더한다:

```ts
    // 🔴 IP 접근 제어 모듈이 있으면 잔존 셈이 IP 층을 본다(2f-1 스펙 P3) — 전역 모듈의 표시 토큰, 없으면 undefined
    @Optional() @Inject(IP_ACCESS_ENABLED) private readonly ipAccess?: boolean,
```

③ 클래스 안(생성자 다음)에 더한다:

```ts
  private get survival(): SurvivalCount {
    return { ipAware: this.ipAccess === true }
  }
```

④ `withSuperAdminSurvival(trx, steps)` 를 `withSuperAdminSurvival(trx, steps, this.survival)` 로, `remove` 의 `withSuperAdminSurvival(trx, {` … `})` 호출의 두 번째 인자 뒤에 `, this.survival` 를 더한다.

`users/users.service.ts`:

① `../tokens.js` import 에 `IP_ACCESS_ENABLED` 를, `../accounts/super-admin.js` import 에 `type SurvivalCount` 를 더한다.

② 생성자의 `@Optional() private readonly reauthService?: AdminReauthService,` 다음 줄에 역할 서비스와 같은 두 줄(주석 + `@Optional() @Inject(IP_ACCESS_ENABLED) private readonly ipAccess?: boolean,`)을, 생성자 다음에 같은 `survival` 게터를 더한다.

③ `update` 의 감싸는 조건을 바꾼다:

```ts
// 🔴 역할 · 팀을 바꾸는 수정은 잔존을 줄일 수 있다(§5-3 · 2f-1 스펙 P5 — 팀 규칙이 있는 팀으로 옮기면 global 층을 잃는다).
//    IP 모듈 유무와 무관하게 감싼다 — 갈래를 줄인다(없으면 판정이 늘 통과).
const before =
  body.roleNo === undefined && body.teamNo === undefined
    ? await steps.write(await steps.lock())
    : await withSuperAdminSurvival(trx, steps, this.survival)
```

(옛 두 줄 주석 `// 🔴 역할을 바꾸는 수정만 잔존을 줄일 수 있다 — …` 는 지운다.)

④ `resign` 의 `withSuperAdminSurvival(trx, {` … `})` 호출의 두 번째 인자 뒤에 `, this.survival` 를 더한다.

- [ ] **Step 5: GREEN**

```bash
pnpm --filter @ssworks/admin-server test:db super-admin
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 6: 🔴 RED 를 한 번 더 본다**

① `users.service.ts` 의 조건에서 `&& body.teamNo === undefined` 를 잠시 지우고 `pnpm --filter @ssworks/admin-server test:db super-admin.ip` — "teamNo 만 바꾸는 수정도 잔존 가드" · "시나리오 B" 가 FAIL 하는지 본다. 되돌린다.

② `countSuperAdmins` 의 `if (!count.ipAware)` 를 잠시 `if (true)` 로 바꾸고 같은 명령 — "적용 층이 global 인 전권자만" · 역할 서비스 테스트가 FAIL 하는지 본다. 되돌린다.

- [ ] **Step 7: 전량**

```bash
pnpm --filter @ssworks/admin-server test
pnpm test:db
```

Expected: 모두 PASS. 🔴 사용자 수정이 `teamNo` 만으로 가드를 잡게 됐다 — `users.snapshot` · `users.team` · `users.write` 의 경합 테스트가 그대로 초록인지 본다(스펙 §12 (c)). 깨지면 그 테스트가 무엇을 재는지 보고서에 적고, 기대값이 "가드를 잡지 않는다" 에 기댄 것이면 이 Task 의 설계(P5)대로 기대값을 고친다.

- [ ] **Step 8: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/ip-access/rule-set.ts packages/admin-server/src/tokens.ts packages/admin-server/src/accounts/errors.ts packages/admin-server/src/accounts/super-admin.ts packages/admin-server/src/accounts/super-admin.db.test.ts packages/admin-server/src/accounts/super-admin.ip.db.test.ts packages/admin-server/src/test-support/ip-access.ts packages/admin-server/src/roles/roles.service.ts packages/admin-server/src/users/users.service.ts
git add packages/admin-server/src/ip-access/rule-set.ts packages/admin-server/src/tokens.ts packages/admin-server/src/accounts packages/admin-server/src/test-support/ip-access.ts packages/admin-server/src/roles/roles.service.ts packages/admin-server/src/users/users.service.ts
git commit -m "feat(admin-server): IP 를 아는 전권자 잔존 셈 — 표시 토큰 IP_ACCESS_ENABLED · 대표 팀 층 판정 · 사용자 teamNo 변경도 잔존 지점" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: refresh · 유예 발급의 IP 검사

**Files:**

- Modify: `auth/auth.service.ts`
- Modify: `auth/auth.service.refresh.db.test.ts`

**Interfaces:**

- Consumes: `requestMetaOf(req, this.config.clientIp)`(Task 4), `AdminAccessPolicy`(2b — 이 Task 에서는 테스트 하네스의 `SwitchablePolicy`).
- Produces: `refresh()` 가 퇴사 검사 뒤 · 회전 전에, 유예 발급(`reuseOfRotated` 의 grace 갈래)이 퇴사 검사 뒤 · 새 세션 INSERT 전에 정책을 묻는다. 거부면 `access.blocked`(`reason: 'ip'`, `sessionNo` = 회전 대상 행) → 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp`. 회전 대상 행은 그대로 둔다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`auth/auth.service.refresh.db.test.ts`:

① import 줄 `import { createTestDatabase, type TestDatabase } from '../test-support/db.js'` 다음에 이미 있는 `../test-support/auth.js` import 묶음에 `addToTeam` · `seedTeam` 을 더한다(알파벳 순).

② 파일 끝(`describe('logout')` 앞)에 더한다:

```ts
describe('refresh — IP(2f-1 스펙 P11)', () => {
  it('🔴 정책이 거부하면 회전 전에 403 ERR_IP_NOT_ALLOWED + clientIp · access.blocked — 행은 그대로, 허용되면 다시 회전한다', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    const team = await seedTeam(t.db, 'refresh-ip-team')
    await addToTeam(t.db, team, user.userNo)
    kit.policy.allow = false
    const error = await rejection(
      kit.service.refresh(tokens.refreshToken, fakeRequest({ ip: '::ffff:198.51.100.9' })),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
    expect(error.details).toEqual({ clientIp: '198.51.100.9' })
    expect(kit.policy.calls.at(-1)).toEqual({
      clientIp: '198.51.100.9',
      userNo: user.userNo,
      teamNos: [team],
    })
    expect(kit.events.events.at(-1)).toEqual({
      type: 'access.blocked',
      reason: 'ip',
      userNo: user.userNo,
      sessionNo,
    })
    expect((await kit.store.findByNo(sessionNo))?.isRevoked).toBe(false)
    kit.policy.allow = true
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    expect((await kit.store.findByNo(sessionNo))?.revokedReason).toBe('rotated')
  })

  it('🔴 유예 발급도 막는다 — 새 세션을 만들지 않는다', async () => {
    const kit = createAuthKit(t)
    const { user, tokens } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    const live = await liveSessions(user.userNo)
    kit.policy.allow = false
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
    expect(await liveSessions(user.userNo)).toEqual(live)
  })

  it('퇴사가 IP 보다 먼저다 — 퇴사 403 이면 정책을 묻지 않는다(로그인 · 가드와 같은 순서)', async () => {
    const kit = createAuthKit(t)
    const { user, tokens } = await login(kit)
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const calls = kit.policy.calls.length
    kit.policy.allow = false
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
    expect(kit.policy.calls.length).toBe(calls)
  })

  it('정책이 없으면(IP 모듈 없음) 묻지 않고 회전한다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const { tokens } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    expect(kit.policy.calls).toEqual([])
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db auth.service.refresh`
Expected: FAIL — 거부 정책에서도 회전이 성공한다(`거부되지 않았다`), 유예 발급이 새 세션을 만든다.

- [ ] **Step 3: 구현한다**

`auth/auth.service.ts`:

① `refresh` 의 `await this.assertActive(row.userNo, now)` 다음 줄에 더한다:

```ts
await this.assertAllowedForRefresh(row, req)
```

② `reuseOfRotated` 의 grace 갈래 `await this.assertActive(row.userNo, now)` 다음 줄에 같은 줄을 더한다.

③ `assertActive` 메서드 다음에 더한다:

```ts
  /**
   * 회전 · 유예 발급 전 IP(2f-1 스펙 P11) — 막힌 주소에서 새 토큰을 찍어 내지 않는다. 퇴사 검사 뒤다(로그인 · 가드와 같은 순서).
   * 🔴 회전 대상 행은 그대로 둔다 — 같은 토큰을 허용된 주소에서 다시 보내면 회전한다. 대표 팀은 가드와 같은 findPrincipal.
   */
  private async assertAllowedForRefresh(row: AdminSessionRow, req: Request): Promise<void> {
    if (this.accessPolicy == null) return
    const principal = await this.repo.findPrincipal(row.userNo)
    const { clientIp } = requestMetaOf(req, this.config.clientIp)
    const allowed = await this.accessPolicy.allows({
      clientIp,
      userNo: row.userNo,
      teamNos: principal?.teamNo == null ? [] : [principal.teamNo],
    })
    if (allowed) return
    await this.emit(
      { type: 'access.blocked', reason: 'ip', userNo: row.userNo, sessionNo: row.sessionNo },
      req,
    )
    throw ipNotAllowed(clientIp)
  }
```

④ 머리 주석 `바꾼 점:` 끝(Task 4 가 더한 줄 다음)에 한 줄을 더한다:

```ts
//  - refresh · 유예 발급에도 IP 를 본다(2f-1 스펙 P11) — hangang 은 refresh 가 @Public 이라 막힌 주소에서도 회전했다.
```

- [ ] **Step 4: GREEN · 회전 경합 회귀**

```bash
pnpm --filter @ssworks/admin-server test:db auth.service.refresh
pnpm --filter @ssworks/admin-server test:db auth
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS — 🔴 `describe('refresh — 동시 회전 경합(P1, 결정적 재현)')` 이 그대로 초록이다(주체 읽기는 회전 전 비잠금 읽기라 `holdRotation` 과 엇갈리지 않는다 — 스펙 §12 (d)).

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth/auth.service.ts packages/admin-server/src/auth/auth.service.refresh.db.test.ts
git add packages/admin-server/src/auth/auth.service.ts packages/admin-server/src/auth/auth.service.refresh.db.test.ts
git commit -m "feat(admin-server): refresh · 유예 발급에도 IP 정책 — 막힌 주소에서 새 토큰을 내지 않는다(access.blocked · 403)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 규칙이 가리키는 팀의 삭제 409

**Files:**

- Modify: `teams/teams.service.ts`(`remove`)
- Modify: `teams/errors.ts`
- Modify: `teams/teams.delete.db.test.ts`

**Interfaces:**

- Consumes: 표 `ipAccessRules`(Task 3), `seedIpRule`(Task 5 `test-support/ip-access.ts`), `CommonErrorCodes.ERR_TEAM_HAS_IP_RULES`(Task 2).
- Produces: `teamHasIpRules(ruleCount: number): BusinessError` · `TEAM_MESSAGES.teamHasIpRules`. 팀 삭제가 소속 409 뒤에 규칙 셈 → 409 `ERR_TEAM_HAS_IP_RULES` + `{ ruleCount }`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`teams/teams.delete.db.test.ts`:

① import 묶음에 `import { seedIpRule } from '../test-support/ip-access.js'` 를 더한다.

② `describe('삭제')` 안 끝에 더한다:

```ts
it('🔴 서브트리 팀을 가리키는 IP 규칙이 있으면 409 ERR_TEAM_HAS_IP_RULES + ruleCount, 아무것도 지우지 않는다(2f-1 ⑤ T1)', async () => {
  const top = await create('dl-ip-top', null)
  const sub = await create('dl-ip-sub', top)
  await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: sub, cidr: '10.0.0.0/8' })
  await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: top, cidr: '192.168.0.0/16' })
  const error = await failure(service.remove(top))
  expect(error.code).toBe(CommonErrorCodes.ERR_TEAM_HAS_IP_RULES)
  expect(error.message).toBe(TEAM_MESSAGES.teamHasIpRules)
  expect(error.details).toEqual({ ruleCount: 2 })
  expect(await existing([top, sub])).toEqual([top, sub])
})

it('소속 409 가 먼저다 — 소속과 규칙이 둘 다 있으면 ERR_TEAM_HAS_MEMBERS', async () => {
  const both = await create('dl-ip-both', null)
  const member = await seedUser(t.db, { roleNo, userId: 'dl-ip-member' })
  await addToTeam(t.db, both, member.userNo)
  await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: both, cidr: '10.0.0.0/8' })
  const error = await failure(service.remove(both))
  expect(error.code).toBe(CommonErrorCodes.ERR_TEAM_HAS_MEMBERS)
})

it('다른 팀 · global · user 규칙은 막지 않는다', async () => {
  const free = await create('dl-ip-free', null)
  const other = await create('dl-ip-other', null)
  await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: other, cidr: '10.0.0.0/8' })
  await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: free, cidr: '10.0.0.0/8' })
  expect((await service.remove(free)).before.teamName).toBe('dl-ip-free')
})
```

(🔴 마지막 테스트의 user 규칙은 `scopeRefNo` 가 우연히 팀 번호와 같은 사용자 번호다 — `scopeType = 'team'` 조건이 막는지 잰다.)

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db teams.delete`
Expected: FAIL — 첫 테스트에서 삭제가 성공한다(`실패를 기대했다`), `TEAM_MESSAGES.teamHasIpRules` 가 `undefined`.

- [ ] **Step 3: 구현한다**

`teams/errors.ts`:

① `TEAM_MESSAGES` 의 `moveCycle: …,` 앞(`teamHasMembers` 다음)에 더한다:

```ts
  teamHasIpRules:
    '이 팀(하위 팀 포함)을 가리키는 IP 규칙이 있어 지울 수 없습니다. 규칙을 먼저 지우세요.',
```

② `teamHasMembers` 함수 다음에 더한다:

```ts
/** ruleCount 는 서브트리 팀을 가리키는 IP 규칙 수(2f-1 ⑤ T1) — 규칙 삭제는 IP 모듈의 자기 잠금 · 잔존 · 감사를 지난다 */
export function teamHasIpRules(ruleCount: number): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_TEAM_HAS_IP_RULES, TEAM_MESSAGES.teamHasIpRules, {
    ruleCount,
  })
}
```

`teams/teams.service.ts`:

① `./errors.js` import 에 `teamHasIpRules` 를 더한다.

② `remove` 의 `if (memberCount > 0) throw teamHasMembers(memberCount)` 다음에 더한다:

```ts
// 🔴 IP 규칙 셈(2f-1 스펙 ⑤ T1 · P9) — 소속 셈과 같은 읽기 뷰(서브트리 팀 행을 X 로 쥔 뒤)라 기다리는 사이 커밋된 규칙을
//    본다. 규칙 쓰기는 가리키는 팀 행을 먼저 잠그므로(rule-locks lockScopeRef) 지금은 새 규칙이 생길 수 없다(§14 R1-①).
//    🔴 FOR UPDATE 로 세지 않는다 — 팀 쓰기는 ipAccessRules 를 잠그지 않는다(전역 잠금 순서 §5-5).
const rules = await trx
  .selectFrom('ipAccessRules')
  .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
  .where('scopeType', '=', 'team')
  .where('scopeRefNo', 'in', teamNos)
  .executeTakeFirstOrThrow()
const ruleCount = Number(rules.n)
if (ruleCount > 0) throw teamHasIpRules(ruleCount)
```

- [ ] **Step 4: GREEN**

```bash
pnpm --filter @ssworks/admin-server test:db teams
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/teams/teams.service.ts packages/admin-server/src/teams/errors.ts packages/admin-server/src/teams/teams.delete.db.test.ts
git add packages/admin-server/src/teams/teams.service.ts packages/admin-server/src/teams/errors.ts packages/admin-server/src/teams/teams.delete.db.test.ts
git commit -m "feat(admin-server): IP 규칙이 가리키는 팀(서브트리)의 삭제 409 ERR_TEAM_HAS_IP_RULES + ruleCount" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 문구 · 미리보기 판정(순수) · 목록 · 미리보기 쿼리

**Files:**

- Create: `ip-access/errors.ts` · `ip-access/preview.ts` · `ip-access/preview.test.ts` · `ip-access/queries.ts` · `ip-access/queries.test.ts`

**Interfaces:**

- Consumes: admin-shared `applicableIpLayer` · `evaluateIpAccess` · `ipLayerRules` · `ipScopeProblem` · 타입(Task 2), `validationError`(2a).
- Produces:
  - `ip-access/errors.ts`: `IP_ACCESS_MESSAGES` · `ruleNotFound()` · `ruleRevisionConflict()` · `selfLockout(clientIp: string | null)` · `scopeRefError(message: string)` · `assertIpScope(scope: IpScope): void`.
  - `ip-access/preview.ts`: `interface IdentifiedIpRule extends IpRule { ruleNo: bigint }` · `interface IpLockoutCandidate { userNo; userId; userName; teamNos: readonly bigint[]; sessionIps: readonly (string | null)[] }` · `type IpLockoutPreview = Pick<AdminIpPreview, 'summary' | 'items'>` · `stripRuleNo` · `judgeIpLockout` · `previewIpLockout(candidates, currentRules, nextRules): IpLockoutPreview` · `buildLockoutCandidates(users, teamMappings, sessions): IpLockoutCandidate[]` · `nextRulesOf(current: readonly IdentifiedIpRule[], query: AdminIpPreviewQuery): IpRule[]`(없는 ruleNo 는 404).
  - `ip-access/queries.ts`: `ruleViewQuery(db)` · `identifiedRulesQuery(db)` · `activeUsersQuery(db, now)` · `teamMappingsQuery(db, userNos)` · `activeSessionsQuery(db, userNos, now)` — 모두 비잠금.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`ip-access/preview.test.ts`(새):

```ts
import { BusinessError, CommonErrorCodes, type IpRule } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import {
  buildLockoutCandidates,
  judgeIpLockout,
  nextRulesOf,
  previewIpLockout,
  type IdentifiedIpRule,
  type IpLockoutCandidate,
} from './preview.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-evaluation.test.ts(judgeIpLockout · buildLockoutCandidates ·
//       previewIpLockout) — 판정은 admin-shared 함수다(로그인과 같은 판정).

const subject = { userNo: 1n, teamNos: [10n] }
const rule = (
  scopeType: IpRule['scopeType'],
  cidr: string,
  scopeRefNo: bigint | null = null,
): IpRule => ({ scopeType, scopeRefNo, cidr })
const candidateOf = (
  userNo: bigint,
  userId: string,
  overrides: Partial<IpLockoutCandidate> = {},
): IpLockoutCandidate => ({
  userNo,
  userId,
  userName: `${userId} 님`,
  teamNos: [],
  sessionIps: [],
  ...overrides,
})

describe('judgeIpLockout', () => {
  it('🔴 층이 없으면 주소와 무관하게 locked — 주소 미상 세션도 거부 확정', () => {
    const judged = judgeIpLockout([], { userNo: 1n, teamNos: [] }, ['203.0.113.9', null])
    expect(judged).toEqual({
      layer: null,
      status: 'locked',
      blockedSessionCount: 2,
      unknownIpSessionCount: 1,
    })
  })

  it('통과하는 세션이 하나라도 있으면 passes — 거부되는 세션은 따로 센다', () => {
    const judged = judgeIpLockout([rule('global', '203.0.113.0/24')], subject, [
      '10.1.2.3',
      '203.0.113.9',
    ])
    expect(judged).toMatchObject({ layer: 'global', status: 'passes', blockedSessionCount: 1 })
  })

  it('🔴 층은 있는데 주소를 아는 세션이 0 이면 unknown — 잠겼다고 단정하지 않는다', () => {
    const rules = [rule('global', '203.0.113.0/24')]
    expect(judgeIpLockout(rules, subject, [null, null])).toMatchObject({
      status: 'unknown',
      blockedSessionCount: 0,
      unknownIpSessionCount: 2,
    })
    expect(judgeIpLockout(rules, subject, []).status).toBe('unknown')
  })

  it('🔴 v6 세션을 v4 규칙이 통과시키지 않는다', () => {
    const onlyV4 = [rule('global', '0.0.0.0/0')]
    expect(judgeIpLockout(onlyV4, subject, ['2001:db8::1']).status).toBe('locked')
    expect(
      judgeIpLockout([...onlyV4, rule('global', '::/0')], subject, ['2001:db8::1']).status,
    ).toBe('passes')
  })
})

describe('buildLockoutCandidates', () => {
  const users = [
    { userNo: 1n, userId: 'a-admin', userName: '가' },
    { userNo: 2n, userId: 'b-admin', userName: '나' },
  ]

  it('🔴 계정당 팀 하나 — 가장 작은 teamNo(로그인과 같은 대표 팀)', () => {
    const candidates = buildLockoutCandidates(
      users,
      [
        { userNo: 1n, teamNo: 30n },
        { userNo: 1n, teamNo: 10n },
        { userNo: 1n, teamNo: 20n },
      ],
      [],
    )
    expect(candidates[0]?.teamNos).toEqual([10n])
  })

  it('팀 · 세션이 없는 계정도 남는다 · 세션 주소를 계정별로 모은다(null 포함)', () => {
    const candidates = buildLockoutCandidates(
      users,
      [{ userNo: 1n, teamNo: 10n }],
      [
        { userNo: 1n, ipAddress: '203.0.113.9' },
        { userNo: 1n, ipAddress: null },
      ],
    )
    expect(candidates).toHaveLength(2)
    expect(candidates[0]?.sessionIps).toEqual(['203.0.113.9', null])
    expect(candidates[1]).toMatchObject({ teamNos: [], sessionIps: [] })
  })

  it('Review Focus 5 — 큰 번호 팀에만 팀 규칙이면 global 층이다', () => {
    const [candidate] = buildLockoutCandidates(
      [users[0]!],
      [
        { userNo: 1n, teamNo: 20n },
        { userNo: 1n, teamNo: 10n },
      ],
      [{ userNo: 1n, ipAddress: '203.0.113.9' }],
    )
    const rules = [rule('global', '0.0.0.0/0'), rule('team', '10.0.0.0/8', 20n)]
    expect(judgeIpLockout(rules, candidate!, candidate!.sessionIps)).toMatchObject({
      layer: 'global',
      status: 'passes',
    })
  })
})

describe('previewIpLockout', () => {
  const currentRules = [rule('global', '0.0.0.0/0'), rule('user', '10.0.0.0/8', 2n)]
  const nextRules = [rule('user', '10.0.0.0/8', 2n)]
  const newly = candidateOf(1n, 'a-newly', { sessionIps: ['203.0.113.9'] })
  const already = candidateOf(2n, 'b-already', { sessionIps: ['203.0.113.9'] })

  it('🔴 becomesLocked 는 변경 전에 안 잠겨 있던 사람만 · 층의 전후', () => {
    const { items, summary } = previewIpLockout([newly, already], currentRules, nextRules)
    const byId = Object.fromEntries(items.map((item) => [item.userId, item]))
    expect(byId['a-newly']).toMatchObject({
      statusBefore: 'passes',
      statusAfter: 'locked',
      becomesLocked: true,
      layerBefore: 'global',
      layerAfter: null,
    })
    expect(byId['b-already']).toMatchObject({
      statusBefore: 'locked',
      statusAfter: 'locked',
      becomesLocked: false,
    })
    expect(summary).toMatchObject({ total: 2, newlyLocked: 1, alreadyLocked: 1 })
  })

  it('🔴 items 는 등급 순 — 다섯이 각각 다른 등급, 아이디 알파벳 순과 어긋나게', () => {
    const rules = [
      rule('global', '0.0.0.0/0'),
      rule('user', '10.0.0.0/8', 2n),
      rule('user', '10.0.0.0/8', 4n),
    ]
    const next = [
      rule('global', '10.0.0.0/8'),
      rule('user', '10.0.0.0/8', 2n),
      rule('user', '10.0.0.0/8', 4n),
    ]
    const { items } = previewIpLockout(
      [
        candidateOf(5n, 'b-passes', { sessionIps: ['10.1.2.3'] }),
        candidateOf(4n, 'x-unknown', { sessionIps: [null] }),
        candidateOf(2n, 'a-already', { sessionIps: ['203.0.113.9'] }),
        candidateOf(3n, 'm-silent', { sessionIps: [null] }),
        candidateOf(1n, 'z-newly', { sessionIps: ['203.0.113.9'] }),
      ],
      rules,
      next,
    )
    const order = items.map((item) => item.userId)
    expect(order).toEqual(['z-newly', 'm-silent', 'a-already', 'x-unknown', 'b-passes'])
    // 🔴 공허 가드 — 알파벳 순서가 기대 순서와 달라야 정렬을 잰다
    expect([...order].sort()).not.toEqual(order)
  })

  it('같은 등급 안에서는 userId 오름차순', () => {
    const second = candidateOf(9n, 'z-newly', { sessionIps: ['203.0.113.9'] })
    const { items } = previewIpLockout([second, newly], currentRules, nextRules)
    expect(items.map((item) => item.userId)).toEqual(['a-newly', 'z-newly'])
  })

  it('🔴 blockedSessions 는 items 전원의 합 — 여전히 passes 인 사람이 잃는 세션도 센다', () => {
    const two = [
      candidateOf(1n, 'a-desk', { sessionIps: ['203.0.113.9', '10.1.2.3'] }),
      candidateOf(2n, 'b-desk', { sessionIps: ['203.0.113.10', '10.1.2.4'] }),
    ]
    const { items, summary } = previewIpLockout(
      two,
      [rule('global', '0.0.0.0/0')],
      [rule('global', '203.0.113.0/24')],
    )
    expect(summary.newlyLocked).toBe(0)
    expect(summary.blockedSessions).toBe(2)
    expect(summary.blockedSessions).toBe(
      items.reduce((sum, item) => sum + item.blockedSessionCount, 0),
    )
    expect(summary.ruleSetChangedOnly).toBe(2)
  })

  it('🔴 ruleSetChanged — unknown→unknown · locked→locked · 층만 바뀜 · 한쪽만 층 없음은 참', () => {
    const offline = candidateOf(1n, 'a-offline')
    expect(
      previewIpLockout([offline], [rule('global', '0.0.0.0/0')], [rule('global', '203.0.113.0/24')])
        .items[0]?.ruleSetChanged,
    ).toBe(true)
    const stuck = candidateOf(1n, 'a-stuck', { sessionIps: ['203.0.113.9'] })
    expect(
      previewIpLockout([stuck], [rule('user', '10.0.0.0/8', 1n)], [rule('user', '10.1.0.0/16', 1n)])
        .items[0],
    ).toMatchObject({ statusBefore: 'locked', statusAfter: 'locked', ruleSetChanged: true })
    const moved = candidateOf(1n, 'a-moved', { sessionIps: ['10.1.2.3'] })
    expect(
      previewIpLockout(
        [moved],
        [rule('global', '10.0.0.0/8')],
        [rule('global', '10.0.0.0/8'), rule('user', '10.0.0.0/8', 1n)],
      ).items[0],
    ).toMatchObject({ layerBefore: 'global', layerAfter: 'user', ruleSetChanged: true })
    expect(
      previewIpLockout([offline], [], [rule('global', '0.0.0.0/0')]).items[0]?.ruleSetChanged,
    ).toBe(true)
  })

  it('순서 · 중복만 바뀐 것 · 나에게 안 걸리는 층의 변경은 ruleSetChanged 가 아니다', () => {
    const anyone = candidateOf(1n, 'a-any', { sessionIps: ['203.0.113.9'] })
    expect(
      previewIpLockout(
        [anyone],
        [rule('global', '0.0.0.0/0'), rule('global', '10.0.0.0/8')],
        [rule('global', '10.0.0.0/8'), rule('global', '0.0.0.0/0'), rule('global', '0.0.0.0/0')],
      ).items[0]?.ruleSetChanged,
    ).toBe(false)
    expect(
      previewIpLockout(
        [anyone],
        [rule('global', '0.0.0.0/0'), rule('user', '10.0.0.0/8', 99n)],
        [rule('global', '0.0.0.0/0'), rule('user', '192.168.0.0/16', 99n)],
      ).summary.ruleSetChangedOnly,
    ).toBe(0)
  })

  it('🔴 v4 global 만 지우면 v4 세션 관리자만 새로 잠긴다 — 층은 그대로 global', () => {
    const { items, summary } = previewIpLockout(
      [
        candidateOf(1n, 'a-v4', { sessionIps: ['203.0.113.9'] }),
        candidateOf(2n, 'b-v6', { sessionIps: ['2001:db8::1'] }),
      ],
      [rule('global', '0.0.0.0/0'), rule('global', '::/0')],
      [rule('global', '::/0')],
    )
    expect(summary.newlyLocked).toBe(1)
    expect(items[0]).toMatchObject({ userId: 'a-v4', layerAfter: 'global', statusAfter: 'locked' })
  })

  it('summary 세 갈래가 items 의 사후 상태와 맞는다', () => {
    const unknown = candidateOf(3n, 'c-unknown')
    const { items, summary } = previewIpLockout([newly, already, unknown], currentRules, nextRules)
    expect(summary.newlyLocked + summary.alreadyLocked).toBe(
      items.filter((item) => item.statusAfter === 'locked').length,
    )
    expect(summary.unknown).toBe(items.filter((item) => item.statusAfter === 'unknown').length)
    expect(summary.total).toBe(items.length)
  })
})

describe('nextRulesOf', () => {
  const current: IdentifiedIpRule[] = [
    { ruleNo: 1n, scopeType: 'global', scopeRefNo: null, cidr: '0.0.0.0/0' },
    { ruleNo: 2n, scopeType: 'global', scopeRefNo: null, cidr: '::/0' },
  ]

  it('op 없음 · create · update · delete', () => {
    expect(nextRulesOf(current, {})).toEqual([
      { scopeType: 'global', scopeRefNo: null, cidr: '0.0.0.0/0' },
      { scopeType: 'global', scopeRefNo: null, cidr: '::/0' },
    ])
    expect(
      nextRulesOf(current, { op: 'create', scopeType: 'user', scopeRefNo: 7n, cidr: '10.0.0.0/8' }),
    ).toHaveLength(3)
    expect(
      nextRulesOf(current, {
        op: 'update',
        ruleNo: 1n,
        scopeType: 'global',
        cidr: '10.0.0.0/8',
      })[0],
    ).toEqual({ scopeType: 'global', scopeRefNo: null, cidr: '10.0.0.0/8' })
    expect(nextRulesOf(current, { op: 'delete', ruleNo: 2n })).toEqual([
      { scopeType: 'global', scopeRefNo: null, cidr: '0.0.0.0/0' },
    ])
  })

  it('🔴 Review Focus 4 — 없는 ruleNo 의 update · delete 는 404(낡은 화면을 숨기지 않는다)', () => {
    for (const query of [
      { op: 'delete' as const, ruleNo: 9n },
      { op: 'update' as const, ruleNo: 9n, scopeType: 'global' as const, cidr: '::/0' },
    ]) {
      let caught: unknown
      try {
        nextRulesOf(current, query)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(BusinessError)
      expect((caught as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_NOT_FOUND)
    }
  })
})
```

`ip-access/queries.test.ts`(새):

```ts
import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { adminKyselyPlugins } from '../database/kysely.js'
import type { AdminDatabase } from '../database/types.js'
import {
  activeSessionsQuery,
  activeUsersQuery,
  identifiedRulesQuery,
  ruleViewQuery,
  teamMappingsQuery,
} from './queries.js'
import { ipRuleSetQuery } from './rule-set.js'

// 🔴 미리보기 · 목록 쿼리를 컴파일된 SQL 로 잰다(hangang ip-access.preview.test.ts) — 틀리면 화면은 그럴듯한데 사람이 목록에서
//    조용히 빠진다. 앱과 같은 플러그인(CamelCasePlugin)을 건다.

const db = new Kysely<AdminDatabase>({
  dialect: {
    createAdapter: () => new MysqlAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new MysqlIntrospector(kysely),
    createQueryCompiler: () => new MysqlQueryCompiler(),
  },
  plugins: adminKyselyPlugins(),
})
const now = new Date('2026-10-15T00:00:00.000Z')

describe('미리보기 쿼리(P12)', () => {
  it('🔴 오늘 로그인할 수 있는 사용자 — resignAt 은 효력 시각, 팀 배정 조건이 없다', () => {
    const compiled = activeUsersQuery(db, now).compile()
    expect(compiled.sql).toContain('from `users`')
    expect(compiled.sql).toContain('(`resign_at` is null or `resign_at` > ?)')
    expect(compiled.sql).not.toContain('team_user_map')
    expect(compiled.parameters).toEqual([now])
  })

  it('활성 세션 — 폐기 안 됨 ∧ 만료 안 됨', () => {
    const compiled = activeSessionsQuery(db, [1n, 2n], now).compile()
    expect(compiled.sql).toContain('from `sessions`')
    expect(compiled.sql).toContain('`user_no` in (?, ?)')
    expect(compiled.sql).toContain('`is_revoked` = ?')
    expect(compiled.sql).toContain('`expire_at` > ?')
  })

  it('팀 배정은 전량 — 대표 팀은 buildLockoutCandidates 가 고른다', () => {
    expect(teamMappingsQuery(db, [1n]).compile().sql).toBe(
      'select `user_no`, `team_no` from `team_user_map` where `user_no` in (?)',
    )
  })
})

describe('규칙 읽기', () => {
  it('🔴 잠금이 없다 — 정책(매 인증) · 미리보기 · 목록', () => {
    for (const query of [ipRuleSetQuery(db), identifiedRulesQuery(db), ruleViewQuery(db)]) {
      expect(query.compile().sql.toLowerCase()).not.toContain('for update')
    }
  })

  it('목록 — 범위별 대상 이름 LEFT JOIN · 정렬 scopeType → ruleNo', () => {
    const sql = ruleViewQuery(db).compile().sql
    expect(sql).toContain(
      'left join `teams` as `t` on `t`.`team_no` = `r`.`scope_ref_no` and `r`.`scope_type` = ?',
    )
    expect(sql).toContain(
      'left join `users` as `u` on `u`.`user_no` = `r`.`scope_ref_no` and `r`.`scope_type` = ?',
    )
    expect(sql).toContain('order by `r`.`scope_type`, `r`.`rule_no`')
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test preview queries`
Expected: FAIL — `./preview.js` · `./queries.js` 가 없다.

- [ ] **Step 3: 구현한다**

`ip-access/errors.ts`(새):

```ts
import {
  BusinessError,
  CommonErrorCodes,
  ipScopeProblem,
  type IpScope,
} from '@ssworks/admin-shared'
import { validationError } from '../http/validation.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts · ip-evaluation.ts 의 문구(규칙 없음 · 자기 잠금 409)
// 바꾼 점: 한 표에 모은다(2d ACCOUNT_MESSAGES 와 같은 방식). 자기 잠금은 details.clientIp(hangang actorIp). 대상 없음은 404 가
//   아니라 칸 오류 400 scopeRefNo — 사용자 만들기의 없는 팀(400 teamNo)과 같은 모양이다. 범위 불변식 문구는 admin-shared
//   IP_ACCESS_SCHEMA_MESSAGES(화면과 같은 문구).

export const IP_ACCESS_MESSAGES = Object.freeze({
  ruleNotFound: 'IP 규칙을 찾을 수 없습니다.',
  ruleRevisionMismatch: '다른 관리자가 먼저 이 규칙을 바꿨습니다. 새로 불러온 내용을 확인하세요.',
  selfLockout: '이 변경을 저장하면 지금 접속한 위치에서 로그인할 수 없게 됩니다.',
  noScopeTeam: '대상 팀을 찾을 수 없습니다.',
  noScopeUser: '대상 사용자를 찾을 수 없습니다.',
})

export function ruleNotFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, IP_ACCESS_MESSAGES.ruleNotFound)
}

export function ruleRevisionConflict(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    IP_ACCESS_MESSAGES.ruleRevisionMismatch,
  )
}

/** 🔴 409 다 — 권한이 없어서가 아니라 요청이 자기모순이라서(hangang). 화면이 주소를 보여 주게 clientIp 를 싣는다 */
export function selfLockout(clientIp: string | null): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, IP_ACCESS_MESSAGES.selfLockout, {
    clientIp,
  })
}

/** 400 ERR_COMMON_VALIDATION + issues[{ path: ['scopeRefNo'] }] */
export function scopeRefError(message: string): BusinessError {
  return validationError([{ path: ['scopeRefNo'], code: 'custom', message }], message)
}

/** 범위 불변식(global ⇔ 대상 없음) — 만들기 본문 · 수정의 병합 결과가 같은 함수로 본다(hangang R30) */
export function assertIpScope(scope: IpScope): void {
  const problem = ipScopeProblem(scope)
  if (problem !== null) throw scopeRefError(problem)
}
```

`ip-access/preview.ts`(새):

```ts
import {
  applicableIpLayer,
  evaluateIpAccess,
  ipLayerRules,
  type AdminIpPreview,
  type AdminIpPreviewItem,
  type AdminIpPreviewQuery,
  type IpLockoutStatus,
  type IpRule,
  type IpScopeType,
  type IpSubject,
} from '@ssworks/admin-shared'
import { ruleNotFound } from './errors.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-evaluation.ts(judgeIpLockout · appliedRuleFingerprint · lockoutGrade ·
//       previewIpLockout · buildLockoutCandidates) + ip-access.service.ts nextRulesOf
// 바꾼 점:
//  - 층 · 평가는 admin-shared 함수다 — 로그인이 쓰는 바로 그 판정이다(hangang R30).
//  - nextRulesOf 는 평평한 쿼리(op · ruleNo · scopeType · scopeRefNo · cidr — admin-shared 스키마)를 받는다.
//  - 응답의 clientIp · clientPasses(hangang actorIp · actorPasses)는 서비스가 붙인다.
// 🔴 여기는 읽기다 — 아무것도 막지 않는다. 막는 것은 서버의 자기 잠금 · 잔존이고, 이 판정이 틀려도 조용하다 — 계약 테스트가
//    유일한 방어선이다(hangang). 판정을 다시 적지 않는다.

export interface IdentifiedIpRule extends IpRule {
  ruleNo: bigint
}

export interface IpLockoutCandidate {
  userNo: bigint
  userId: string
  userName: string
  /** 🔴 로그인 판정과 같은 대표 팀 하나(가장 작은 teamNo) 또는 빈 배열 — 전부 실으면 로그인과 다른 층을 고른다 */
  teamNos: readonly bigint[]
  /** 활성 세션의 접속 주소. null 은 주소가 남지 않은 세션 */
  sessionIps: readonly (string | null)[]
}

export interface IpLockoutJudgement {
  layer: IpScopeType | null
  status: IpLockoutStatus
  /** 이 규칙이 거부한다고 증명되는 활성 세션 수 */
  blockedSessionCount: number
  /** 주소가 없어 판정할 수 없는 활성 세션 수 */
  unknownIpSessionCount: number
}

export type IpLockoutPreview = Pick<AdminIpPreview, 'summary' | 'items'>

export function stripRuleNo(rule: IdentifiedIpRule): IpRule {
  return { scopeType: rule.scopeType, scopeRefNo: rule.scopeRefNo, cidr: rule.cidr }
}

/**
 * 한 사람이 이 규칙 아래 어떻게 되는가.
 * 🔴 층이 없으면 세션을 보기도 전에 locked — 기본 거부라 어떤 주소로도 못 들어온다. 이것을 unknown 으로 내면 가장 위험한
 *    변경(global 허용 삭제)을 미리보기가 삼킨다. 그때는 주소를 모르는 세션도 거부가 확정이다.
 */
export function judgeIpLockout(
  rules: readonly IpRule[],
  subject: IpSubject,
  sessionIps: readonly (string | null)[],
): IpLockoutJudgement {
  const layer = applicableIpLayer(rules, subject)
  const unknownIpSessionCount = sessionIps.filter((ip) => ip === null).length
  if (layer === null) {
    return {
      layer,
      status: 'locked',
      blockedSessionCount: sessionIps.length,
      unknownIpSessionCount,
    }
  }
  const known = sessionIps.filter((ip): ip is string => ip !== null)
  const passing = known.filter((ip) => evaluateIpAccess(ip, rules, subject)).length
  return {
    layer,
    // 주소를 아는 세션이 0 이면 잠겼다고 단정하지 않는다 — 그 사람이 어디서 접속할지 모른다. 층은 살아 있다
    status: known.length === 0 ? 'unknown' : passing > 0 ? 'passes' : 'locked',
    blockedSessionCount: known.length - passing,
    unknownIpSessionCount,
  }
}

/**
 * 🔴 이 사람에게 적용되는 규칙 집합의 지문 — 층 이름 + 그 층의 CIDR 집합(중복 · 순서 무관). 층 이름을 빼면
 *    `global 10/8` → `user 10/8` 이 같아진다. 층이 없으면 '(none)'. 구분자는 층 이름에도 CIDR 에도 없는 공백이다.
 */
function appliedRuleFingerprint(rules: readonly IpRule[], subject: IpSubject): string {
  const layer = applicableIpLayer(rules, subject)
  if (layer === null) return '(none)'
  const cidrs = [...new Set(ipLayerRules(layer, rules, subject).map((rule) => rule.cidr))].sort()
  return [layer, ...cidrs].join(' ')
}

/**
 * 🔴 정렬 등급 — 관리자는 목록 맨 위만 보고 저장한다. 0 이 가장 위험하다. ruleSetChanged + unknown(1)이 alreadyLocked(2)
 *    보다 위다 — 이 변경으로 허용 주소가 달라졌는데 결과를 못 보는 사람이 가장 위험한 침묵이다(hangang).
 */
function lockoutGrade(item: AdminIpPreviewItem): number {
  if (item.becomesLocked) return 0
  if (item.ruleSetChanged && item.statusAfter === 'unknown') return 1
  if (item.statusBefore === 'locked' && item.statusAfter === 'locked') return 2
  if (item.statusAfter === 'unknown') return 3
  return 4
}

/** 재직 관리자 전원에 대해 변경 전후를 대조한다. 🔴 전권자만이 아니다 — 일반 관리자가 잠기는 것을 막는 서버 가드는 없다 */
export function previewIpLockout(
  candidates: readonly IpLockoutCandidate[],
  currentRules: readonly IpRule[],
  nextRules: readonly IpRule[],
): IpLockoutPreview {
  const items = candidates.map((candidate): AdminIpPreviewItem => {
    const subject: IpSubject = { userNo: candidate.userNo, teamNos: candidate.teamNos }
    const before = judgeIpLockout(currentRules, subject, candidate.sessionIps)
    const after = judgeIpLockout(nextRules, subject, candidate.sessionIps)
    return {
      userNo: candidate.userNo,
      userId: candidate.userId,
      userName: candidate.userName,
      layerBefore: before.layer,
      layerAfter: after.layer,
      statusBefore: before.status,
      statusAfter: after.status,
      // 🔴 after 가 locked 인 것만 보면 이미 잠긴 사람이 "새로 잠긴다" 로 세어진다 — 관리자가 화면을 믿지 않게 된다
      becomesLocked: before.status !== 'locked' && after.status === 'locked',
      ruleSetChanged:
        appliedRuleFingerprint(currentRules, subject) !==
        appliedRuleFingerprint(nextRules, subject),
      activeSessionCount: candidate.sessionIps.length,
      blockedSessionCount: after.blockedSessionCount,
      unknownIpSessionCount: after.unknownIpSessionCount,
    }
  })
  items.sort((a, b) => {
    const grade = lockoutGrade(a) - lockoutGrade(b)
    if (grade !== 0) return grade
    // 🔴 localeCompare 를 쓰지 않는다 — 로케일에 따라 화면과 계약이 다른 배열을 본다. 아이디는 ASCII 다
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
  })
  return {
    summary: {
      total: items.length,
      newlyLocked: items.filter((item) => item.becomesLocked).length,
      alreadyLocked: items.filter(
        (item) => item.statusBefore === 'locked' && item.statusAfter === 'locked',
      ).length,
      unknown: items.filter((item) => item.statusAfter === 'unknown').length,
      // 🔴 전원의 합이다 — passes 인 사람의 다른 기기도 다음 요청에서 403 이다. 새로 잠기는 사람만 세면 가장 흔한 축소가 0
      blockedSessions: items.reduce((sum, item) => sum + item.blockedSessionCount, 0),
      ruleSetChangedOnly: items.filter((item) => item.ruleSetChanged && !item.becomesLocked).length,
    },
    items,
  }
}

/**
 * DB 행 셋(계정 · 팀 배정 · 활성 세션)을 평가 대상으로 묶는다.
 * 🔴 팀은 가장 작은 teamNo 하나 — 인증 findPrincipal 이 고르는 그 행이다. 🔴 팀 · 세션이 없는 계정도 남는다.
 */
export function buildLockoutCandidates(
  users: readonly { userNo: bigint; userId: string; userName: string }[],
  teamMappings: readonly { userNo: bigint; teamNo: bigint }[],
  sessions: readonly { userNo: bigint; ipAddress: string | null }[],
): IpLockoutCandidate[] {
  const primaryTeamOf = new Map<bigint, bigint>()
  for (const row of teamMappings) {
    const current = primaryTeamOf.get(row.userNo)
    if (current === undefined || row.teamNo < current) primaryTeamOf.set(row.userNo, row.teamNo)
  }
  const sessionIpsOf = new Map<bigint, (string | null)[]>()
  for (const row of sessions) {
    const list = sessionIpsOf.get(row.userNo) ?? []
    list.push(row.ipAddress)
    sessionIpsOf.set(row.userNo, list)
  }
  return users.map((user) => {
    const teamNo = primaryTeamOf.get(user.userNo)
    return {
      userNo: user.userNo,
      userId: user.userId,
      userName: user.userName,
      teamNos: teamNo === undefined ? [] : [teamNo],
      sessionIps: sessionIpsOf.get(user.userNo) ?? [],
    }
  })
}

/** create · update 의 바뀔 규칙 — 쿼리 스키마가 scopeType · cidr 을 요구한다(여기 오면 있다) */
function proposedRule(query: AdminIpPreviewQuery): IpRule {
  if (query.scopeType === undefined || query.cidr === undefined) {
    throw new Error('미리보기 쿼리 스키마가 create · update 에 scopeType · cidr 를 요구한다')
  }
  return { scopeType: query.scopeType, scopeRefNo: query.scopeRefNo ?? null, cidr: query.cidr }
}

/**
 * 쿼리가 말하는 변경을 적용한 뒤의 규칙 전량. 아무것도 안 쓴다.
 * 🔴 없는 ruleNo 는 404 다 — "바뀌는 것 없음" 으로 떨어뜨리면 지워진 규칙을 지우려는 관리자가 "아무도 안 잠긴다" 를 보고
 *    저장한다(Review Focus 4).
 */
export function nextRulesOf(
  current: readonly IdentifiedIpRule[],
  query: AdminIpPreviewQuery,
): IpRule[] {
  if (query.op === undefined) return current.map(stripRuleNo)
  if (query.op === 'create') return [...current.map(stripRuleNo), proposedRule(query)]
  if (!current.some((rule) => rule.ruleNo === query.ruleNo)) throw ruleNotFound()
  if (query.op === 'delete') {
    return current.filter((rule) => rule.ruleNo !== query.ruleNo).map(stripRuleNo)
  }
  return current.map((rule) =>
    rule.ruleNo === query.ruleNo ? proposedRule(query) : stripRuleNo(rule),
  )
}
```

`ip-access/queries.ts`(새):

```ts
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts activeAdminsQuery · activeSessionsQuery ·
//       teamMappingsQuery · findAll
// 바꾼 점:
//  - 재직 조건은 resignAt IS NULL OR resignAt > now — 우리 resignAt 은 효력 시각이다(2b ④ R1). hangang 은 날짜 cutoff.
//  - 🔴 팀 배정 조건(EXISTS teamUserMap)을 뺐다 — 우리 인증은 무소속 계정도 통과시킨다(빈 teamNos, 2f-1 스펙 P12).
//  - 목록은 대상 이름을 범위별 LEFT JOIN 으로 싣는다(P13).
// 🔴 모듈 수준 함수다 — DB 없이 컴파일된 SQL 을 단위 테스트가 잰다. 🔴 모두 비잠금이다(ipAccessRules 를 잠그는 곳은 IP 쓰기의
//    대상 행뿐 — rule-locks lockRule).

/** 목록 · 단건 보기. 정렬 scopeType(문자 순 = global · team · user) → ruleNo */
export function ruleViewQuery(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('ipAccessRules as r')
    .leftJoin('teams as t', (join) =>
      join.onRef('t.teamNo', '=', 'r.scopeRefNo').on('r.scopeType', '=', 'team'),
    )
    .leftJoin('users as u', (join) =>
      join.onRef('u.userNo', '=', 'r.scopeRefNo').on('r.scopeType', '=', 'user'),
    )
    .select([
      'r.ruleNo',
      'r.scopeType',
      'r.scopeRefNo',
      't.teamName',
      'u.userName',
      'u.userId',
      'r.cidr',
      'r.description',
      'r.revision',
      'r.createAt',
      'r.updateAt',
    ])
    .orderBy('r.scopeType')
    .orderBy('r.ruleNo')
}

/** 미리보기의 지금 규칙 — 시뮬레이션이 대상을 지목하는 ruleNo 포함. 🔴 잠금 없음(화면이 칠 때마다 부른다) */
export function identifiedRulesQuery(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('ipAccessRules')
    .select(['ruleNo', 'scopeType', 'scopeRefNo', 'cidr'])
    .orderBy('ruleNo')
}

/** 오늘 로그인할 수 있는 사용자 전원. 🔴 전권자만이 아니다 — 일반 관리자가 잠기는 것을 막는 서버 가드는 없다 */
export function activeUsersQuery(db: Kysely<AdminDatabase>, now: Date) {
  return db
    .selectFrom('users')
    .select(['userNo', 'userId', 'userName'])
    .where((eb) => eb.or([eb('resignAt', 'is', null), eb('resignAt', '>', now)]))
    .orderBy('userId')
}

/** 팀 배정 전량 — 대표 팀(가장 작은 teamNo)은 buildLockoutCandidates 가 고른다. 🔴 빈 userNos 로 부르지 않는다(IN () 구문 오류) */
export function teamMappingsQuery(db: Kysely<AdminDatabase>, userNos: readonly bigint[]) {
  return db.selectFrom('teamUserMap').select(['userNo', 'teamNo']).where('userNo', 'in', userNos)
}

/** 활성 세션 — 폐기 안 됨 ∧ 만료 안 됨. ipAddress 가 null 이면 "판정 불가" 다. 🔴 빈 userNos 로 부르지 않는다 */
export function activeSessionsQuery(
  db: Kysely<AdminDatabase>,
  userNos: readonly bigint[],
  now: Date,
) {
  return db
    .selectFrom('sessions')
    .select(['userNo', 'ipAddress'])
    .where('userNo', 'in', userNos)
    .where('isRevoked', '=', false)
    .where('expireAt', '>', now)
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm --filter @ssworks/admin-server test preview queries
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS. 🔴 `queries.test.ts` 의 SQL 조각이 실측과 다르면(따옴표 · 괄호 · 연산자 위치) 실측 문장을 보고서에 붙이고 **같은 뜻**(재직 조건 · 팀 배정 조건 없음 · 폐기 · 만료 조건 · 잠금 없음 · LEFT JOIN 조건 · 정렬)을 재는 조각으로 고친다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/ip-access/errors.ts packages/admin-server/src/ip-access/preview.ts packages/admin-server/src/ip-access/preview.test.ts packages/admin-server/src/ip-access/queries.ts packages/admin-server/src/ip-access/queries.test.ts
git add packages/admin-server/src/ip-access/errors.ts packages/admin-server/src/ip-access/preview.ts packages/admin-server/src/ip-access/preview.test.ts packages/admin-server/src/ip-access/queries.ts packages/admin-server/src/ip-access/queries.test.ts
git commit -m "feat(admin-server): IP 문구 · 미리보기 판정(hangang 이식 — 층 · 등급 · 지문) · 목록 · 미리보기 쿼리" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: IP 서비스 — 설정 · 잠금 읽기 · 목록 · 미리보기 · 만들기 · 수정 · 삭제 · 정책

**Files:**

- Create: `ip-access/options.ts` · `ip-access/rule-locks.ts` · `ip-access/ip-access.service.ts` · `ip-access/ip-access.policy.ts`
- Create: `ip-access/ip-access.service.db.test.ts` · `ip-access/ip-access.survival.db.test.ts`
- Modify: `tokens.ts` · `test-support/ip-access.ts`

**Interfaces:**

- Consumes: `withSuperAdminSurvival(trx, steps, { ipAware: true })`(Task 5) · `ipRuleSetQuery`(Task 5) · `reauthenticate`(2d) · `clientIpOf`(Task 4) · Task 8 의 errors · preview · queries.
- Produces:
  - `ADMIN_IP_ACCESS_CONFIG`(tokens) · `ResolvedIpAccessConfig { reauth: boolean; clientIp: AdminClientIpSource }` · `resolveIpAccessConfig(options: Pick<AdminServerOptions, 'reauth' | 'clientIp'>)`.
  - `lockRule(trx, ruleNo): Promise<LockedRule>` · `lockScopeRef(trx, scope: IpScope): Promise<void>`.
  - `AdminIpAccessService` — `clientIpOf(req)` · `list(): Promise<{ items: AdminIpRuleView[] }>` · `preview(query, principal, clientIp): Promise<AdminIpPreviewView>` · `create(body, principal, clientIp): Promise<{ item: AdminIpRuleView }>` · `update(ruleNo, body, principal, clientIp): Promise<{ item; before: IpRuleAuditView; after: IpRuleAuditView }>` · `remove(ruleNo, body, principal, clientIp): Promise<{ before: IpRuleAuditView }>`. 타입 `AdminIpRuleCreateBody` · `AdminIpRuleUpdateBody` · `AdminIpRuleRemoveBody` · `AdminIpRuleView` · `IpRuleAuditView` · `AdminIpPreviewView`, 상수 `IP_RULE_AUDIT_FIELDS`.
  - `IpAccessPolicy implements AdminAccessPolicy`(생성자 `(db: Kysely<AdminDatabase>)`).
  - `test-support/ip-access.ts` 에 `ipAccessConfig(reauth?, clientIp?)` · `seedSessionFrom(db, userNo, ipAddress)`.
  - Task 10 · 11 · 12 가 위 모두를 쓴다.

- [ ] **Step 1: 테스트 도우미를 더한다**

`test-support/ip-access.ts`:

① import 묶음을 바꾼다:

```ts
import { randomBytes } from 'node:crypto'
import type { IpScopeType } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminClientIpSource } from '../auth/request-meta.js'
import { AdminSessionStore } from '../auth/session.store.js'
import type { AdminDatabase } from '../database/types.js'
import type { ResolvedIpAccessConfig } from '../ip-access/options.js'
```

② 파일 끝에 더한다:

```ts
/** IP 서비스 설정 — 재인증 기본 꺼짐 · 출처 req.ip */
export function ipAccessConfig(
  reauth = false,
  clientIp: AdminClientIpSource = 'req.ip',
): ResolvedIpAccessConfig {
  return Object.freeze({ reauth, clientIp })
}

/** 주소가 남은 살아 있는 세션 하나(하루 뒤 만료) — 미리보기 시드 */
export function seedSessionFrom(
  db: Kysely<AdminDatabase>,
  userNo: bigint,
  ipAddress: string | null,
): Promise<bigint> {
  const now = new Date()
  return new AdminSessionStore(db).create({
    userNo,
    refreshTokenHash: randomBytes(32).toString('hex'),
    userAgent: null,
    ipAddress,
    loginAt: now,
    now,
    expireAt: new Date(now.getTime() + 86_400_000),
  })
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`ip-access/ip-access.service.db.test.ts`(새):

```ts
import { BusinessError, CommonErrorCodes, IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AdminReauthService } from '../auth/reauth.service.js'
import { FakeReauth, testPrincipal } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  ipAccessConfig,
  ipRulesOf,
  resetIpRules,
  seedIpRule,
  seedSessionFrom,
} from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { IpAccessPolicy } from './ip-access.policy.js'
import { AdminIpAccessService } from './ip-access.service.js'

// IP 서비스(2f-1 스펙 §5-3 · §5-6 · §5-7 · §6). 🔴 규칙은 DB 전역 상태 — beforeEach 로 시드 두 행만 남긴다. 요청자(actor)는
// 일반 관리자(전권 아님)라 잔존 셈에 걸리지 않는다 — 잔존은 ip-access.survival.db.test.ts.

let t: TestDatabase
let service: AdminIpAccessService
let plain: bigint
let actor: SeededUser
let other: SeededUser
const ACTOR_IP = '203.0.113.9'

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminIpAccessService(t.db, ipAccessConfig(), undefined)
  plain = await seedRole(t.db, { roleName: 'svc-plain', permissions: [] })
  actor = await seedUser(t.db, { roleNo: plain, userId: 'svc-actor', userName: '규칙 담당' })
  other = await seedUser(t.db, { roleNo: plain, userId: 'svc-other', userName: '다른 사람' })
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

const me = () => testPrincipal(actor.userNo, ['setting.ipAccess:write'])

async function failure(promise: Promise<unknown>): Promise<BusinessError> {
  const error = await promise.then(
    () => {
      throw new Error('실패를 기대했다')
    },
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BusinessError)
  return error as BusinessError
}

const issueOf = (error: BusinessError) =>
  (error.details as { issues: { path: unknown[]; message: string }[] }).issues.map((issue) => [
    issue.path.join('.'),
    issue.message,
  ])

describe('목록', () => {
  it('시드 두 행 · 정렬 global → team → user · 대상 이름 · 아이디 · ISO 시각', async () => {
    const team = await seedTeam(t.db, 'svc-list-team')
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: actor.userNo, cidr: '203.0.113.0/24' })
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8' })
    const { items } = await service.list()
    expect(
      items.map((item) => [item.scopeType, item.cidr, item.scopeName, item.scopeUserId]),
    ).toEqual([
      ['global', '0.0.0.0/0', null, null],
      ['global', '::/0', null, null],
      ['team', '10.0.0.0/8', 'svc-list-team', null],
      ['user', '203.0.113.0/24', '규칙 담당', 'svc-actor'],
    ])
    expect(items[0]?.createAt).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/)
    expect(items[0]?.revision).toBe(0)
  })
})

describe('만들기', () => {
  it('item 을 돌려준다 — revision 0 · 설명 · 대상 이름', async () => {
    const team = await seedTeam(t.db, 'svc-create-team')
    const { item } = await service.create(
      { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8', description: '사무실' },
      me(),
      ACTOR_IP,
    )
    expect(item).toMatchObject({
      scopeType: 'team',
      scopeRefNo: team,
      scopeName: 'svc-create-team',
      cidr: '10.0.0.0/8',
      description: '사무실',
      revision: 0,
    })
    expect(await ipRulesOf(t.db)).toHaveLength(3)
  })

  it('가리키는 팀 · 사용자가 없으면 400 scopeRefNo · 범위 불변식 위반도 400', async () => {
    const noTeam = await failure(
      service.create(
        { scopeType: 'team', scopeRefNo: 999_999n, cidr: '10.0.0.0/8' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(noTeam.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(issueOf(noTeam)).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTeam]])
    const noUser = await failure(
      service.create(
        { scopeType: 'user', scopeRefNo: 999_999n, cidr: '10.0.0.0/8' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(issueOf(noUser)).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeUser]])
    const forbidden = await failure(
      service.create({ scopeType: 'global', scopeRefNo: 1n, cidr: '10.0.0.0/8' }, me(), ACTOR_IP),
    )
    expect(issueOf(forbidden)).toEqual([
      ['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden],
    ])
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('🔴 자기 잠금 — 요청자 주소를 막는 규칙은 409 + clientIp, 쓰지 않는다', async () => {
    const error = await failure(
      service.create(
        { scopeType: 'user', scopeRefNo: actor.userNo, cidr: '10.0.0.0/8' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(IP_ACCESS_MESSAGES.selfLockout)
    expect(error.details).toEqual({ clientIp: ACTOR_IP })
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('남만 막는 규칙은 된다 · 주소를 모르는 요청자(null)는 늘 자기 잠금이다(fail-closed)', async () => {
    await service.create(
      { scopeType: 'user', scopeRefNo: other.userNo, cidr: '10.0.0.0/8' },
      me(),
      ACTOR_IP,
    )
    const error = await failure(
      service.create({ scopeType: 'global', scopeRefNo: null, cidr: '10.0.0.0/8' }, me(), null),
    )
    expect(error.details).toEqual({ clientIp: null })
  })
})

describe('수정', () => {
  it('revision 409 · 없는 규칙 404', async () => {
    const [v4] = await resetIpRules(t.db)
    const stale = await failure(
      service.update(v4!, { cidr: '0.0.0.0/0', revision: 5 }, me(), ACTOR_IP),
    )
    expect(stale.code).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
    expect(stale.message).toBe(IP_ACCESS_MESSAGES.ruleRevisionMismatch)
    const missing = await failure(service.update(999_999n, { revision: 0 }, me(), ACTOR_IP))
    expect(missing.code).toBe(CommonErrorCodes.ERR_COMMON_NOT_FOUND)
    expect(missing.message).toBe(IP_ACCESS_MESSAGES.ruleNotFound)
  })

  it('🔴 병합 결과의 범위 불변식 — global 행에 scopeType 만 user 로 보내면 400, 그대로', async () => {
    const [v4] = await resetIpRules(t.db)
    const error = await failure(
      service.update(v4!, { scopeType: 'user', revision: 0 }, me(), ACTOR_IP),
    )
    expect(issueOf(error)).toEqual([['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired]])
    expect((await ipRulesOf(t.db))[0]).toMatchObject({ scopeType: 'global', revision: 0 })
  })

  it('성공 — revision + 1 · before · after · 대상 바꾸기(global → team)', async () => {
    const [, v6] = await resetIpRules(t.db)
    const team = await seedTeam(t.db, 'svc-update-team')
    const result = await service.update(
      v6!,
      { scopeType: 'team', scopeRefNo: team, description: '바뀜', revision: 0 },
      me(),
      ACTOR_IP,
    )
    expect(result.item).toMatchObject({ scopeType: 'team', scopeRefNo: team, revision: 1 })
    // resetIpRules 의 시드 행은 설명이 없다(장의 시드 문구가 아니다)
    expect(result.before).toEqual({
      scopeType: 'global',
      scopeRefNo: null,
      cidr: '::/0',
      description: null,
    })
    expect(result.after).toEqual({
      scopeType: 'team',
      scopeRefNo: team,
      cidr: '::/0',
      description: '바뀜',
    })
  })

  it('🔴 자기 잠금 — v4 global 을 요청자 밖으로 좁히면 409, revision 그대로', async () => {
    const [v4] = await resetIpRules(t.db)
    const error = await failure(
      service.update(v4!, { cidr: '10.0.0.0/8', revision: 0 }, me(), ACTOR_IP),
    )
    expect(error.message).toBe(IP_ACCESS_MESSAGES.selfLockout)
    expect((await ipRulesOf(t.db))[0]).toMatchObject({ cidr: '0.0.0.0/0', revision: 0 })
  })
})

describe('삭제', () => {
  it('🔴 요청자 계열(v4)의 global 을 지우면 자기 잠금 409 — 다른 계열(v6)은 지워진다 · before', async () => {
    const [v4, v6] = await resetIpRules(t.db)
    const error = await failure(service.remove(v4!, { revision: 0 }, me(), ACTOR_IP))
    expect(error.message).toBe(IP_ACCESS_MESSAGES.selfLockout)
    const { before } = await service.remove(v6!, { revision: 0 }, me(), ACTOR_IP)
    expect(before).toMatchObject({ scopeType: 'global', cidr: '::/0' })
    expect((await ipRulesOf(t.db)).map((row) => row.cidr)).toEqual(['0.0.0.0/0'])
  })

  it('revision 409 · 없는 규칙 404', async () => {
    const [v4] = await resetIpRules(t.db)
    expect((await failure(service.remove(v4!, { revision: 1 }, me(), ACTOR_IP))).code).toBe(
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    expect((await failure(service.remove(999_999n, { revision: 0 }, me(), ACTOR_IP))).code).toBe(
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
  })
})

describe('재인증(reauth 켬)', () => {
  it('currentPassword 가 틀리면 403 ERR_REAUTH_REQUIRED — 트랜잭션 전에 멈춘다', async () => {
    const reauth = new FakeReauth()
    const guarded = new AdminIpAccessService(
      t.db,
      ipAccessConfig(true),
      reauth as unknown as AdminReauthService,
    )
    const error = await failure(
      guarded.create(
        { scopeType: 'global', scopeRefNo: null, cidr: '10.0.0.0/8', currentPassword: 'wrong' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_REAUTH_REQUIRED)
    await guarded.create(
      {
        scopeType: 'global',
        scopeRefNo: null,
        cidr: '203.0.113.0/24',
        currentPassword: 'right-password',
      },
      me(),
      ACTOR_IP,
    )
    expect(reauth.calls).toEqual(['wrong', 'right-password'])
  })
})

describe('미리보기', () => {
  it('op 없음 — 지금 상태 · 요청자 통과', async () => {
    await seedSessionFrom(t.db, actor.userNo, ACTOR_IP)
    const preview = await service.preview({}, me(), ACTOR_IP)
    expect(preview.clientIp).toBe(ACTOR_IP)
    expect(preview.clientPasses).toBe(true)
    expect(preview.items.find((item) => item.userId === 'svc-actor')).toMatchObject({
      statusBefore: 'passes',
      statusAfter: 'passes',
      becomesLocked: false,
    })
  })

  it('🔴 create — 요청자를 막는 규칙이면 clientPasses false · 그 사람 becomesLocked(저장은 409 다)', async () => {
    await seedSessionFrom(t.db, actor.userNo, ACTOR_IP)
    const preview = await service.preview(
      { op: 'create', scopeType: 'user', scopeRefNo: actor.userNo, cidr: '10.0.0.0/8' },
      me(),
      ACTOR_IP,
    )
    expect(preview.clientPasses).toBe(false)
    expect(preview.items[0]).toMatchObject({ userId: 'svc-actor', becomesLocked: true })
  })

  it('🔴 Review Focus 4 — 지운 규칙의 update 미리보기는 404', async () => {
    const error = await failure(
      service.preview(
        { op: 'update', ruleNo: 999_999n, scopeType: 'global', cidr: '::/0' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_NOT_FOUND)
  })

  it('퇴사자는 빠지고 퇴사 예정자 · 무소속 계정은 남는다(P12)', async () => {
    await seedUser(t.db, {
      roleNo: plain,
      userId: 'svc-gone',
      resignAt: new Date(Date.now() - 60_000),
    })
    await seedUser(t.db, {
      roleNo: plain,
      userId: 'svc-leaving',
      resignAt: new Date(Date.now() + 86_400_000),
    })
    const ids = (await service.preview({}, me(), ACTOR_IP)).items.map((item) => item.userId)
    expect(ids).toContain('svc-leaving')
    expect(ids).toContain('svc-other')
    expect(ids).not.toContain('svc-gone')
  })

  it('Review Focus 5 — 큰 번호 팀에만 팀 규칙이면 그 사람은 global 층이다', async () => {
    const small = await seedTeam(t.db, 'svc-rf5-small')
    const big = await seedTeam(t.db, 'svc-rf5-big')
    const split = await seedUser(t.db, { roleNo: plain, userId: 'svc-rf5' })
    await addToTeam(t.db, small, split.userNo)
    await addToTeam(t.db, big, split.userNo)
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: big, cidr: '10.0.0.0/8' })
    const item = (await service.preview({}, me(), ACTOR_IP)).items.find(
      (row) => row.userId === 'svc-rf5',
    )
    expect(item?.layerBefore).toBe('global')
  })
})

describe('정책(ADMIN_ACCESS_POLICY 구현)', () => {
  it('시드만 있으면 v4 · v6 통과 · null 은 거부 · user 규칙이 global 을 지운다', async () => {
    const policy = new IpAccessPolicy(t.db)
    const context = { userNo: actor.userNo, teamNos: [] }
    expect(await policy.allows({ ...context, clientIp: '198.51.100.1' })).toBe(true)
    expect(await policy.allows({ ...context, clientIp: '2001:db8::1' })).toBe(true)
    expect(await policy.allows({ ...context, clientIp: null })).toBe(false)
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: actor.userNo, cidr: '10.0.0.0/8' })
    expect(await policy.allows({ ...context, clientIp: '198.51.100.1' })).toBe(false)
    expect(await policy.allows({ ...context, clientIp: '10.9.9.9' })).toBe(true)
  })
})
```

`ip-access/ip-access.survival.db.test.ts`(새):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { ipAccessConfig, ipRulesOf, resetIpRules, seedIpRule } from '../test-support/ip-access.js'
import { AdminUsersService } from '../users/users.service.js'
import { AdminIpAccessService } from './ip-access.service.js'

// IP 쓰기의 잔존(2f-1 스펙 ② R1 · §9-2 s1 · s3 · s4 · s5 — s2 는 accounts/super-admin.ip.db.test.ts). 🔴 셈은 DB 전역 상태라
// 테스트마다 retireStars 로 전권자를 모두 퇴사시키고 시작한다. 요청자는 일반 관리자(전권 아님)다.

let t: TestDatabase
let star: bigint
let service: AdminIpAccessService
let requester: bigint
const REQUESTER_IP = '203.0.113.9'
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
  star = await seedRole(t.db, { roleName: 'sv-star', permissions: ['*'] })
  const plain = await seedRole(t.db, { roleName: 'sv-plain', permissions: [] })
  requester = (await seedUser(t.db, { roleNo: plain, userId: 'sv-requester' })).userNo
  service = new AdminIpAccessService(t.db, ipAccessConfig(), undefined)
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
  await t.db
    .updateTable('users')
    .set({ resignAt: new Date(Date.now() - 60_000) })
    .where('roleNo', '=', star)
    .where('resignAt', 'is', null)
    .execute()
})

const me = () => testPrincipal(requester, ['setting.ipAccess:write'])

async function failure(promise: Promise<unknown>): Promise<BusinessError> {
  const error = await promise.then(
    () => {
      throw new Error('실패를 기대했다')
    },
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BusinessError)
  return error as BusinessError
}

describe('IP 쓰기의 잔존', () => {
  it('🔴 (s1) 시나리오 A — 마지막 도달 가능 전권자에게 user 규칙이면 409, 쓰지 않는다 · 전권자가 둘이면 된다', async () => {
    const last = await seedUser(t.db, { roleNo: star, userId: 'sv-a-last' })
    const error = await failure(
      service.create(
        { scopeType: 'user', scopeRefNo: last.userNo, cidr: '10.0.0.0/8' },
        me(),
        REQUESTER_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await ipRulesOf(t.db)).toHaveLength(2)
    await seedUser(t.db, { roleNo: star, userId: 'sv-a-second' })
    await service.create(
      { scopeType: 'user', scopeRefNo: last.userNo, cidr: '10.0.0.0/8' },
      me(),
      REQUESTER_IP,
    )
  })

  it('🔴 (s3) 마지막 global 행 삭제 — 요청자는 user 규칙으로 살아 있어도 잔존 409', async () => {
    await seedUser(t.db, { roleNo: star, userId: 'sv-c-star' })
    const [v4, v6] = await resetIpRules(t.db, [
      { scopeType: 'global', cidr: '0.0.0.0/0' },
      { scopeType: 'global', cidr: '::/0' },
      { scopeType: 'user', scopeRefNo: requester, cidr: '203.0.113.0/24' },
    ])
    await service.remove(v6!, { revision: 0 }, me(), REQUESTER_IP)
    const error = await failure(service.remove(v4!, { revision: 0 }, me(), REQUESTER_IP))
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect((await ipRulesOf(t.db)).map((row) => row.cidr)).toContain('0.0.0.0/0')
  })

  it('(s4) 이미 0(전권자 전원이 user 규칙) — 다른 IP 쓰기가 막히지 않는다', async () => {
    const pinned = await seedUser(t.db, { roleNo: star, userId: 'sv-d-pinned' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: pinned.userNo, cidr: '10.0.0.0/8' })
    const team = await seedTeam(t.db, 'sv-d-team')
    await service.create(
      { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8' },
      me(),
      REQUESTER_IP,
    )
  })

  it('🔴 (s5) IP 모듈 없음 — 규칙을 다 지운 DB 에서도 셈이 재직 ∧ * 라 마지막 전권자 퇴사가 409(토큰이 있으면 이미 0 이라 통과)', async () => {
    const lastPlain = await seedUser(t.db, { roleNo: star, userId: 'sv-e-last' })
    await resetIpRules(t.db, [])
    const users = (ipAware: boolean) =>
      new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined, ipAware)
    const error = await failure(
      users(false).resign(lastPlain.userNo, { resignDate: '2030-01-31' }, root),
    )
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    await users(true).resign(lastPlain.userNo, { resignDate: '2030-01-31' }, root)
  })
})
```

- [ ] **Step 3: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db ip-access`
Expected: FAIL — `./ip-access.service.js` · `./ip-access.policy.js` · `../ip-access/options.js` 가 없다.

- [ ] **Step 4: 설정 · 잠금 읽기 · 정책을 쓴다**

`tokens.ts` — `IP_ACCESS_ENABLED` 정의 다음에 더한다:

```ts
/** 내부 — 해석된 IP 설정(`ResolvedIpAccessConfig` — reauth · clientIp). `AdminIpAccessModule` 이 코어 옵션으로 만든다(2f-1) */
export const ADMIN_IP_ACCESS_CONFIG = Symbol('ADMIN_IP_ACCESS_CONFIG')
```

`ip-access/options.ts`(새):

```ts
import { resolveClientIpSource, type AdminClientIpSource } from '../auth/request-meta.js'
import type { AdminServerOptions } from '../options.js'

// 정본: 없음 — 2f-1 스펙 2-2 #2 · #3. IP 모듈은 자기 옵션이 없다(phase0 ipAccess 옵션 다섯은 고정 동작). 코어 옵션 둘만 읽는다.

export interface ResolvedIpAccessConfig {
  /** 켜면 IP 쓰기가 본문 currentPassword 로 재인증한다 — 역할 · 사용자와 같은 스위치(코어 reauth) */
  readonly reauth: boolean
  /** 자기 잠금 · 미리보기가 보는 요청자 주소의 출처 — 인증과 같은 해석 */
  readonly clientIp: AdminClientIpSource
}

/** 🔴 기동에서 멈춘다: reauth 가 boolean 이 아님, clientIp 가 두 값 밖 */
export function resolveIpAccessConfig(
  options: Pick<AdminServerOptions, 'reauth' | 'clientIp'>,
): ResolvedIpAccessConfig {
  if (options.reauth !== undefined && typeof options.reauth !== 'boolean') {
    throw new Error('reauth 는 true · false 여야 한다.')
  }
  return Object.freeze({
    reauth: options.reauth === true,
    clientIp: resolveClientIpSource(options.clientIp),
  })
}
```

`ip-access/rule-locks.ts`(새):

```ts
import type { IpScope, IpScopeType } from '@ssworks/admin-shared'
import type { Transaction } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { IP_ACCESS_MESSAGES, ruleNotFound, scopeRefError } from './errors.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts lockAllRules · assertScopeRefExists
// 바꾼 점:
//  - 규칙 전 구간 FOR UPDATE(hangang R31) 대신 대상 규칙 한 행만 잠근다 — IP 쓰기는 모두 잔존 가드 행을 첫 문장으로 잡아
//    서로 직렬화된다(2f-1 스펙 §5-3).
//  - 가리키는 팀 · 사용자 행을 FOR UPDATE 로 잠근다(P7) — hangang 은 비잠금 존재 확인이었다. 없으면 400 scopeRefNo.
// 🔴 둘 다 잠금 단계(셈 앞)에서 부른다 — 셈이 읽기 뷰를 연 뒤에 잠그면 스냅샷 격리 ON 에서 그 사이 바뀐 행이 1020 이다
//    (§14 R1-②). 🔴 팀 행 잠금이 팀 삭제와 줄을 세운다 — 규칙이 먼저면 삭제가 409, 삭제가 먼저면 여기서 400(§14 R1-①).

export interface LockedRule {
  ruleNo: bigint
  scopeType: IpScopeType
  scopeRefNo: bigint | null
  cidr: string
  description: string | null
  revision: number
}

/** 대상 규칙 — FOR UPDATE. 없으면 404 */
export async function lockRule(
  trx: Transaction<AdminDatabase>,
  ruleNo: bigint,
): Promise<LockedRule> {
  const row = await trx
    .selectFrom('ipAccessRules')
    .select(['ruleNo', 'scopeType', 'scopeRefNo', 'cidr', 'description', 'revision'])
    .where('ruleNo', '=', ruleNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw ruleNotFound()
  return row
}

/** 가리키는 팀 · 사용자 행 — FOR UPDATE. 없으면 400 scopeRefNo. global(대상 없음)은 잠글 것이 없다 */
export async function lockScopeRef(trx: Transaction<AdminDatabase>, scope: IpScope): Promise<void> {
  const refNo = scope.scopeRefNo
  if (scope.scopeType === 'global' || refNo === null) return
  if (scope.scopeType === 'team') {
    const team = await trx
      .selectFrom('teams')
      .select('teamNo')
      .where('teamNo', '=', refNo)
      .forUpdate()
      .executeTakeFirst()
    if (team === undefined) throw scopeRefError(IP_ACCESS_MESSAGES.noScopeTeam)
    return
  }
  const user = await trx
    .selectFrom('users')
    .select('userNo')
    .where('userNo', '=', refNo)
    .forUpdate()
    .executeTakeFirst()
  if (user === undefined) throw scopeRefError(IP_ACCESS_MESSAGES.noScopeUser)
}
```

`ip-access/ip-access.policy.ts`(새):

```ts
import { Inject, Injectable } from '@nestjs/common'
import { evaluateIpAccess } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminAccessContext, AdminAccessPolicy } from '../auth/hooks.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import { ipRuleSetQuery } from './rule-set.js'

// 정본: hangang-home apps/api/src/core/guards/auth.guard.ts · modules/auth/auth.service.ts(로그인 IP 게이팅) +
//       ip-access.service.ts loadRules
// 바꾼 점: 2b 가 만든 ADMIN_ACCESS_POLICY 자리를 채운다 — boolean 만 돌려주고 403 은 인증 서비스가 던진다(2b B7).
// 🔴 매 인증 요청이 부른다 — 잠금 없이 규칙 전량(세 열)을 읽는다. 캐시하지 않는다(2f-1 스펙 P2 · ⑥ A) — 인스턴스가 여럿이면
//    다른 인스턴스가 낡은 규칙으로 통과시키는 창이 생긴다.

@Injectable()
export class IpAccessPolicy implements AdminAccessPolicy {
  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  async allows(context: AdminAccessContext): Promise<boolean> {
    const rules = await runQuery(() => ipRuleSetQuery(this.db).execute())
    return evaluateIpAccess(context.clientIp, rules, {
      userNo: context.userNo,
      teamNos: context.teamNos,
    })
  }
}
```

- [ ] **Step 5: 서비스를 쓴다**

`ip-access/ip-access.service.ts`(새):

```ts
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  evaluateIpAccess,
  type AdminIpPreviewQuery,
  type AdminIpRuleCreate,
  type AdminIpRuleRemove,
  type AdminIpRuleUpdate,
  type IpScope,
  type IpScopeType,
  type IpSubject,
} from '@ssworks/admin-shared'
import type { Request } from 'express'
import { sql, type Kysely, type Transaction } from 'kysely'
import { reauthenticate } from '../accounts/reauth.js'
import { withSuperAdminSurvival, type SurvivalCount } from '../accounts/super-admin.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { clientIpOf } from '../auth/request-meta.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_IP_ACCESS_CONFIG, KYSELY } from '../tokens.js'
import { assertIpScope, ruleRevisionConflict, selfLockout } from './errors.js'
import type { ResolvedIpAccessConfig } from './options.js'
import {
  buildLockoutCandidates,
  nextRulesOf,
  previewIpLockout,
  stripRuleNo,
  type IpLockoutPreview,
} from './preview.js'
import {
  activeSessionsQuery,
  activeUsersQuery,
  identifiedRulesQuery,
  ruleViewQuery,
  teamMappingsQuery,
} from './queries.js'
import { lockRule, lockScopeRef, type LockedRule } from './rule-locks.js'
import { ipRuleSetQuery } from './rule-set.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts(목록 · 미리보기 · 만들기 · 수정 · 삭제)
// 바꾼 점:
//  - 쓰기 셋은 withSuperAdminSurvival(…, { ipAware: true }) 안이다 — 잔존 가드 행이 첫 문장, 잠금 단계(대상 규칙 · 가리키는
//    팀/사용자 행) → 셈 → 쓰기 → 후 셈(2f-1 스펙 §5-3). hangang 은 규칙 전 구간 FOR UPDATE → 가드의 2단 잠금이었다.
//  - 🔴 자기 잠금은 쓴 뒤의 결과 상태로 판정한다(P6) — 같은 트랜잭션에서 규칙을 다시 읽어 요청자를 평가한다. hangang 의 "다음
//    규칙 시뮬레이션" 은 미리보기에만 남는다.
//  - 재인증은 코어 reauth 옵션(hangang 은 늘), 규칙 행에 revision(Phase 0 §4 #4).
//  - 감사 diff 는 컨트롤러가 커밋 뒤에 붙인다 — 409 로 롤백된 변경을 after 로 남기지 않는다(hangang I3).
// 🔴 재인증은 트랜잭션 밖이다 — argon2 가 가드 행을 쥔 채 돌면 모든 잔존 쓰기가 그 뒤에 줄을 선다(hangang Task 12).

export type AdminIpRuleCreateBody = AdminIpRuleCreate & { currentPassword?: string }
export type AdminIpRuleUpdateBody = AdminIpRuleUpdate & { currentPassword?: string }
export type AdminIpRuleRemoveBody = AdminIpRuleRemove & { currentPassword?: string }

/** 목록 · 응답의 행 — admin-shared adminIpRuleSchema 와 같은 모양(시각은 ISO 문자열) */
export type AdminIpRuleView = {
  ruleNo: bigint
  scopeType: IpScopeType
  scopeRefNo: bigint | null
  scopeName: string | null
  scopeUserId: string | null
  cidr: string
  description: string | null
  revision: number
  createAt: string
  updateAt: string
}

/** 감사 before · after — 규칙 행 전체가 변경 대상이다(hangang I3) */
export type IpRuleAuditView = {
  scopeType: IpScopeType
  scopeRefNo: bigint | null
  cidr: string
  description: string | null
}

export const IP_RULE_AUDIT_FIELDS = ['scopeType', 'scopeRefNo', 'cidr', 'description'] as const

export type AdminIpPreviewView = IpLockoutPreview & {
  clientIp: string | null
  clientPasses: boolean
}

/** 🔴 IP 쓰기는 늘 IP 를 아는 셈이다 — 토큰 유무와 무관(P3) */
const IP_WRITE: SurvivalCount = Object.freeze({ ipAware: true })

type RuleViewRow = {
  ruleNo: bigint
  scopeType: IpScopeType
  scopeRefNo: bigint | null
  teamName: string | null
  userName: string | null
  userId: string | null
  cidr: string
  description: string | null
  revision: number
  createAt: Date
  updateAt: Date
}

function toRuleView(row: RuleViewRow): AdminIpRuleView {
  return {
    ruleNo: row.ruleNo,
    scopeType: row.scopeType,
    scopeRefNo: row.scopeRefNo,
    scopeName:
      row.scopeType === 'team' ? row.teamName : row.scopeType === 'user' ? row.userName : null,
    scopeUserId: row.scopeType === 'user' ? row.userId : null,
    cidr: row.cidr,
    description: row.description,
    revision: row.revision,
    createAt: row.createAt.toISOString(),
    updateAt: row.updateAt.toISOString(),
  }
}

function auditViewOf(rule: IpRuleAuditView): IpRuleAuditView {
  return {
    scopeType: rule.scopeType,
    scopeRefNo: rule.scopeRefNo,
    cidr: rule.cidr,
    description: rule.description,
  }
}

/** 요청자 — 주체의 userNo · 대표 팀(인증이 고른 팀) */
function subjectOf(principal: AdminPrincipal): IpSubject {
  return { userNo: principal.userNo, teamNos: principal.teamNo === null ? [] : [principal.teamNo] }
}

async function readRuleView(db: Kysely<AdminDatabase>, ruleNo: bigint): Promise<AdminIpRuleView> {
  return toRuleView(
    await ruleViewQuery(db).where('r.ruleNo', '=', ruleNo).executeTakeFirstOrThrow(),
  )
}

/**
 * 🔴 쓴 뒤의 결과 상태로 판정한다(P6) — 같은 트랜잭션이라 자기 쓰기가 보인다. 거부면 던져 롤백한다. 가드 뒤 비잠금 읽기라
 *    다른 IP 쓰기의 커밋을 모두 본다(IP 쓰기끼리는 가드에서 줄을 선다).
 */
async function assertNotSelfLockout(
  trx: Transaction<AdminDatabase>,
  clientIp: string | null,
  actor: IpSubject,
): Promise<void> {
  const rules = await ipRuleSetQuery(trx).execute()
  if (!evaluateIpAccess(clientIp, rules, actor)) throw selfLockout(clientIp)
}

@Injectable()
export class AdminIpAccessService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_IP_ACCESS_CONFIG) private readonly config: ResolvedIpAccessConfig,
    // 🔴 @Optional — AdminAuthModule 이 빠진 앱이 DI 해석 오류가 아니라 모듈 기동 검사의 문구로 멈추게(2c R2 와 같은 이유)
    @Optional() private readonly reauthService?: AdminReauthService,
  ) {}

  /** 요청자 주소 — 인증 · 감사와 같은 출처(코어 옵션 clientIp) */
  clientIpOf(req: Request): string | null {
    return clientIpOf(req, this.config.clientIp)
  }

  async list(): Promise<{ items: AdminIpRuleView[] }> {
    const rows = await runQuery(() => ruleViewQuery(this.db).execute())
    return { items: rows.map(toRuleView) }
  }

  /** 🔴 잠금 · 트랜잭션 · 감사 · 재인증이 없다 — 읽은 순간의 스냅숏이라 저장이 409 일 수 있다 */
  async preview(
    query: AdminIpPreviewQuery,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<AdminIpPreviewView> {
    // 🔴 now 를 한 번만 — 쿼리마다 new Date() 면 경계에 걸친 퇴사 · 만료가 서로 다르게 판정된다(hangang)
    const now = new Date()
    const current = await runQuery(() => identifiedRulesQuery(this.db).execute())
    const next = nextRulesOf(current, query)
    const users = await runQuery(() => activeUsersQuery(this.db, now).execute())
    const userNos = users.map((user) => user.userNo)
    // 🔴 빈 IN () 은 구문 오류다 — 사용자가 없는 저장소가 실재한다(hangang)
    const mappings =
      userNos.length === 0
        ? []
        : await runQuery(() => teamMappingsQuery(this.db, userNos).execute())
    const sessions =
      userNos.length === 0
        ? []
        : await runQuery(() => activeSessionsQuery(this.db, userNos, now).execute())
    const preview = previewIpLockout(
      buildLockoutCandidates(users, mappings, sessions),
      current.map(stripRuleNo),
      next,
    )
    return {
      clientIp,
      // 🔴 저장 때 자기 잠금이 쓰는 바로 그 판정이다 — false 면 저장은 409 다
      clientPasses: evaluateIpAccess(clientIp, next, subjectOf(principal)),
      ...preview,
    }
  }

  async create(
    body: AdminIpRuleCreateBody,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<{ item: AdminIpRuleView }> {
    const scope: IpScope = { scopeType: body.scopeType, scopeRefNo: body.scopeRefNo }
    assertIpScope(scope)
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = subjectOf(principal)
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(
        trx,
        {
          // 🔴 잠금 읽기만(2d-3 C2) — 가리키는 팀 · 사용자 행
          lock: () => lockScopeRef(trx, scope),
          write: async () => {
            const inserted = await trx
              .insertInto('ipAccessRules')
              .values({
                scopeType: scope.scopeType,
                scopeRefNo: scope.scopeRefNo,
                cidr: body.cidr,
                description: body.description ?? null,
              })
              .executeTakeFirstOrThrow()
            const ruleNo = inserted.insertId as bigint
            await assertNotSelfLockout(trx, clientIp, actor)
            return { item: await readRuleView(trx, ruleNo) }
          },
        },
        IP_WRITE,
      ),
    )
  }

  async update(
    ruleNo: bigint,
    body: AdminIpRuleUpdateBody,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<{ item: AdminIpRuleView; before: IpRuleAuditView; after: IpRuleAuditView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = subjectOf(principal)
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(
        trx,
        {
          // 🔴 잠금 읽기 · 판정만 — 대상 규칙 → revision → 병합 결과 불변식 → 병합 결과의 참조 행
          lock: async (): Promise<{ target: LockedRule; scope: IpScope }> => {
            const target = await lockRule(trx, ruleNo)
            if (body.revision !== target.revision) throw ruleRevisionConflict()
            // 🔴 병합 결과가 판정 대상이다(hangang R30) — global 행에 scopeType: 'user' 만 보내면 어느 층에도 안 걸리는 행이 된다
            const scope: IpScope = {
              scopeType: body.scopeType ?? target.scopeType,
              scopeRefNo: body.scopeRefNo !== undefined ? body.scopeRefNo : target.scopeRefNo,
            }
            assertIpScope(scope)
            await lockScopeRef(trx, scope)
            return { target, scope }
          },
          write: async ({ target, scope }) => {
            await trx
              .updateTable('ipAccessRules')
              .set((eb) => ({
                scopeType: scope.scopeType,
                scopeRefNo: scope.scopeRefNo,
                ...(body.cidr === undefined ? {} : { cidr: body.cidr }),
                ...(body.description === undefined ? {} : { description: body.description }),
                revision: eb('revision', '+', 1),
                updateAt: sql<Date>`current_timestamp`,
              }))
              .where('ruleNo', '=', ruleNo)
              .execute()
            await assertNotSelfLockout(trx, clientIp, actor)
            const item = await readRuleView(trx, ruleNo)
            return { item, before: auditViewOf(target), after: auditViewOf(item) }
          },
        },
        IP_WRITE,
      ),
    )
  }

  async remove(
    ruleNo: bigint,
    body: AdminIpRuleRemoveBody,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<{ before: IpRuleAuditView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = subjectOf(principal)
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(
        trx,
        {
          lock: async () => {
            const target = await lockRule(trx, ruleNo)
            if (body.revision !== target.revision) throw ruleRevisionConflict()
            return target
          },
          write: async (target) => {
            await trx.deleteFrom('ipAccessRules').where('ruleNo', '=', ruleNo).execute()
            await assertNotSelfLockout(trx, clientIp, actor)
            // 🔴 지운 규칙은 감사의 before 로만 복원된다
            return { before: auditViewOf(target) }
          },
        },
        IP_WRITE,
      ),
    )
  }
}
```

- [ ] **Step 6: GREEN**

```bash
pnpm --filter @ssworks/admin-server test:db ip-access
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS(`ip-access.service` · `ip-access.survival`).

- [ ] **Step 7: 🔴 RED 를 한 번 더 본다**

① `assertNotSelfLockout(trx, clientIp, actor)` 세 줄을 잠시 지우고 `pnpm --filter @ssworks/admin-server test:db ip-access.service` — 자기 잠금 넷이 FAIL 하는지 본다. 되돌린다.

② `IP_WRITE` 를 잠시 `{ ipAware: false }` 로 바꾸고 `pnpm --filter @ssworks/admin-server test:db ip-access.survival` — (s1) · (s3) 이 FAIL 하는지 본다. 되돌린다.

③ `update` 의 `scope` 병합에서 `assertIpScope(scope)` 를 잠시 지우고 `pnpm --filter @ssworks/admin-server test:db ip-access.service` — "병합 결과의 범위 불변식" 이 FAIL 하는지 본다. 되돌린다.

- [ ] **Step 8: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/tokens.ts packages/admin-server/src/test-support/ip-access.ts packages/admin-server/src/ip-access/options.ts packages/admin-server/src/ip-access/rule-locks.ts packages/admin-server/src/ip-access/ip-access.policy.ts packages/admin-server/src/ip-access/ip-access.service.ts packages/admin-server/src/ip-access/ip-access.service.db.test.ts packages/admin-server/src/ip-access/ip-access.survival.db.test.ts
git add packages/admin-server/src/tokens.ts packages/admin-server/src/test-support/ip-access.ts packages/admin-server/src/ip-access
git commit -m "feat(admin-server): IP 서비스 — 목록 · 미리보기 · 만들기 · 수정 · 삭제(잔존 가드 · 결과 상태 자기 잠금 · revision) · ADMIN_ACCESS_POLICY 구현" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 경합 — 가드 직접 관찰 · 팀 삭제 양쪽 순서 · IP 쓰기 직렬화 · 스냅샷 ON

**Files:**

- Create: `ip-access/ip-access.race.db.test.ts`

**Interfaces:**

- Consumes: `underHeld` · `holdGuard` · `whileHeld`(`reached`) · `settle` · `snapshotKysely`(Task 1), `AdminIpAccessService`(Task 9), `AdminTeamsService`(2e-1), `resetIpRules` · `ipAccessConfig` · `ipRulesOf`(Task 5 · 9).

- [ ] **Step 1: 테스트를 쓴다**

`ip-access/ip-access.race.db.test.ts`(새):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GUARD_LOCK_SUPER_ADMIN } from '../accounts/super-admin.js'
import { AdminTeamsService } from '../teams/teams.service.js'
import { TEAM_MESSAGES } from '../teams/errors.js'
import { testPrincipal } from '../test-support/accounts.js'
import { seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import {
  holdGuard,
  settle,
  snapshotKysely,
  underHeld,
  whileHeld,
} from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { ipAccessConfig, ipRulesOf, resetIpRules } from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { AdminIpAccessService } from './ip-access.service.js'

// 🔴 IP 쓰기의 잠금(2f-1 스펙 §5-3 · §5-4 · §5-5 · §9-2 r1~r3). 공개 서비스 메서드를 거친다 — 부품을 따로 부르면 순서 회귀를
//    못 잡는다. 요청자는 일반 관리자라 잔존 셈은 늘 이미 0 이다(전권자 없음 — 잔존은 통과, 가드는 그대로 잡는다).

let t: TestDatabase
let a: SeededUser
let b: SeededUser
const A_IP = '10.1.2.3'
const B_IP = '192.168.1.2'

beforeAll(async () => {
  t = await createTestDatabase()
  const plain = await seedRole(t.db, { roleName: 'race-plain', permissions: [] })
  a = await seedUser(t.db, { roleNo: plain, userId: 'race-a' })
  b = await seedUser(t.db, { roleNo: plain, userId: 'race-b' })
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

const principal = (user: SeededUser) => testPrincipal(user.userNo, ['setting.ipAccess:write'])
const service = (db: TestDatabase['db'] = t.db) =>
  new AdminIpAccessService(db, ipAccessConfig(), undefined)

function codeOf(error: unknown): string | undefined {
  return error instanceof BusinessError ? error.code : undefined
}

describe('🔴 IP 쓰기 셋은 잔존 가드 행을 잡는다 — 읽기는 잡지 않는다', () => {
  it('만들기 · 수정 · 삭제는 가드를 쥔 동안 기다리고, 목록 · 미리보기는 기다리지 않는다', async () => {
    const [v4, v6] = await resetIpRules(t.db)
    const writes: [string, () => Promise<unknown>][] = [
      [
        'create',
        () =>
          service().create(
            { scopeType: 'global', scopeRefNo: null, cidr: '172.16.0.0/12' },
            principal(a),
            A_IP,
          ),
      ],
      [
        'update',
        () => service().update(v6!, { description: '가드', revision: 0 }, principal(a), A_IP),
      ],
      ['remove', () => service().remove(v6!, { revision: 1 }, principal(a), A_IP)],
    ]
    for (const [name, write] of writes) {
      const { waited, result } = await underHeld(t, holdGuard(GUARD_LOCK_SUPER_ADMIN), write)
      expect(waited, name).toBe(true)
      if (!result.ok) throw result.error
    }
    for (const [name, read] of [
      ['list', () => service().list()],
      ['preview', () => service().preview({ op: 'delete', ruleNo: v4! }, principal(a), A_IP)],
    ] as const) {
      const { waited, result } = await underHeld(t, holdGuard(GUARD_LOCK_SUPER_ADMIN), read)
      expect(waited, name).toBe(false)
      if (!result.ok) throw result.error
    }
  })
})

describe.each([
  ['ON', true],
  ['OFF', false],
] as const)('스냅샷 격리 %s', (label, snapshot) => {
  it('🔴 (r1a) 팀 삭제가 팀 행을 먼저 쥠 → 그 팀 규칙 만들기가 기다렸다 400 scopeRefNo(1020 없음)', async () => {
    const team = await seedTeam(t.db, `race-r1a-${label}`)
    const db = await snapshotKysely(t, snapshot)
    try {
      const result = await whileHeld(
        t,
        async (connection: Connection) => {
          await holdGuard('teamTree')(connection)
          await connection.query('select team_no from teams where team_no = ? for update', [team])
          await connection.query('delete from teams where team_no = ?', [team])
        },
        () =>
          service(db).create(
            { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8' },
            principal(a),
            A_IP,
          ),
      )
      expect(result.reached).toBe(true)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(codeOf(result.error)).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect((result.error as BusinessError).message).toBe(IP_ACCESS_MESSAGES.noScopeTeam)
    } finally {
      await db.destroy()
    }
  })

  it('🔴 (r1b) 규칙 쓰기가 팀 행을 먼저 쥠 → 팀 삭제가 기다렸다 그 규칙을 세어 409', async () => {
    const team = await seedTeam(t.db, `race-r1b-${label}`)
    const db = await snapshotKysely(t, snapshot)
    try {
      const result = await whileHeld(
        t,
        async (connection: Connection) => {
          await holdGuard(GUARD_LOCK_SUPER_ADMIN)(connection)
          await connection.query('select team_no from teams where team_no = ? for update', [team])
          await connection.query(
            "insert into ip_access_rules (scope_type, scope_ref_no, cidr) values ('team', ?, '10.0.0.0/8')",
            [team],
          )
        },
        () => new AdminTeamsService(db).remove(team),
      )
      expect(result.reached).toBe(true)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(codeOf(result.error)).toBe(CommonErrorCodes.ERR_TEAM_HAS_IP_RULES)
      expect((result.error as BusinessError).message).toBe(TEAM_MESSAGES.teamHasIpRules)
    } finally {
      await db.destroy()
    }
  })
})

describe('🔴 (r2) IP 쓰기끼리 가드에서 줄을 선다', () => {
  it('각자는 자기 잠금을 통과하는 삭제 둘(서로를 살리는 global 행) — 뒤의 쪽이 409, 행 하나가 남는다', async () => {
    const [toA, toB] = await resetIpRules(t.db, [
      { scopeType: 'global', cidr: '10.0.0.0/8' },
      { scopeType: 'global', cidr: '192.168.0.0/16' },
    ])
    // A(10.x)는 B 의 행을, B(192.168.x)는 A 의 행을 지운다 — 각자는 자기 행이 남아 통과한다. 둘 다 커밋되면 둘 다 잠긴다
    const result = await whileHeld(
      t,
      holdGuard(GUARD_LOCK_SUPER_ADMIN),
      () =>
        Promise.all([
          settle(service().remove(toB!, { revision: 0 }, principal(a), A_IP)),
          settle(service().remove(toA!, { revision: 0 }, principal(b), B_IP)),
        ]),
      { waiters: 2 },
    )
    expect(result.reached).toBe(true)
    if (!result.ok) throw result.error
    const outcomes = result.value
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1)
    const failed = outcomes.find((outcome) => !outcome.ok)
    expect(failed && !failed.ok ? (failed.error as BusinessError).message : '').toBe(
      IP_ACCESS_MESSAGES.selfLockout,
    )
    expect(await ipRulesOf(t.db)).toHaveLength(1)
  })
})

describe('🔴 (r3) 스냅샷 격리 ON — 참조 잠금이 읽기 뷰보다 먼저다', () => {
  it('대상 사용자의 로그인 실패가 행을 쥔 동안 그 사용자 규칙 만들기가 기다렸다 성공한다(1020 없음)', async () => {
    const db = await snapshotKysely(t, true)
    try {
      const result = await whileHeld(
        t,
        async (connection: Connection) => {
          await connection.query(
            'select login_fail_count from users where user_no = ? for update',
            [b.userNo],
          )
          await connection.query(
            'update users set login_fail_count = login_fail_count + 1 where user_no = ?',
            [b.userNo],
          )
        },
        () =>
          service(db).create(
            { scopeType: 'user', scopeRefNo: b.userNo, cidr: '10.0.0.0/8' },
            principal(a),
            A_IP,
          ),
      )
      expect(result.reached).toBe(true)
      if (!result.ok) throw result.error
      expect(result.value.item).toMatchObject({ scopeType: 'user', scopeRefNo: b.userNo })
    } finally {
      await db.destroy()
    }
  })
})
```

- [ ] **Step 2: GREEN**

```bash
pnpm --filter @ssworks/admin-server test:db ip-access.race
pnpm lint
```

Expected: PASS. (이 Task 는 Task 9 의 구현을 잰다 — 새 코드가 없다. 처음 돌렸을 때 FAIL 이면 구현이 스펙과 어긋난 것이다: 보고서에 출력을 붙이고 Task 9 의 해당 줄을 스펙대로 고친다.)

- [ ] **Step 3: 🔴 RED 를 본다**

① `ip-access.service.ts` 의 `remove` 를 잠시 `return runWriteTransaction(this.db, async (trx) => { const steps = { lock: …, write: … }; return steps.write(await steps.lock()) })` 모양(가드 없이 같은 두 단계)으로 바꾸고 `pnpm --filter @ssworks/admin-server test:db ip-access.race` — (r2) 가 FAIL(둘 다 성공 · 행 0) 하고 첫 `describe` 의 remove `waited` 가 false 인지 본다. 되돌린다.

② `create` 의 잠금 단계를 잠시 비우고(`lock: async () => undefined`) `write` 의 INSERT 앞에 `await lockScopeRef(trx, scope)` 를 둔다(셈 뒤 참조 잠금) — 같은 명령에서 (r3) 이 FAIL(`409 ERR_COMMON_CONFLICT` — 1020) 하는지 본다(§14 R1-②). 되돌린다.

③ `teams.service.ts` 의 규칙 셈 블록을 잠시 지우고 같은 명령 — (r1b) ON · OFF 가 FAIL(삭제 성공) 하는지 본다. 되돌린다.

- [ ] **Step 4: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/ip-access/ip-access.race.db.test.ts
git add packages/admin-server/src/ip-access/ip-access.race.db.test.ts
git commit -m "test(admin-server): IP 쓰기 경합 — 가드 관찰 · 팀 삭제 양쪽 순서(ON · OFF) · 쓰기 직렬화 · 스냅샷 ON 참조 잠금" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: 파이프 · 다섯 라우트 · 전역 모듈 · 슬롯 둘 · 배선 · 테스트 앱

**Files:**

- Create: `ip-access/ip-access.body.ts` · `ip-access/ip-access.controller.ts` · `ip-access/ip-access.module.ts` · `ip-access/ip-access.module.test.ts`
- Modify: `auth/permission-slots.ts` · `auth/permission-slots.test.ts` · `admin-server.module.ts` · `index.ts`
- Modify: `test-support/accounts.ts`(카탈로그 키 둘) · `test-support/admin-app.ts`(슬롯 · 모듈 · `clientIp` 옵션)

**Interfaces:**

- Consumes: `AdminIpAccessService` · `IpAccessPolicy` · `resolveIpAccessConfig` · `IP_RULE_AUDIT_FIELDS` · 본문 타입(Task 9), `IP_ACCESS_ENABLED` · `ADMIN_IP_ACCESS_CONFIG` · `ADMIN_ACCESS_POLICY`(tokens), admin-shared 스키마 · 액션(Task 2).
- Produces: `AdminIpAccessModule`(index 공개, `@Global()`, `ADMIN_ACCESS_POLICY` · `IP_ACCESS_ENABLED` 를 export), `@Controller('ip-access')` 다섯 라우트, 슬롯 `'ipAccess.read'` · `'ipAccess.manage'`, `bootAdminApp(db, { clientIp?: AdminClientIpSource })`, `TEST_PERMISSIONS['ipAccess.read' | 'ipAccess.manage']`, `TEST_CATALOG` 의 `setting.ipAccess:read` · `setting.ipAccess:write`. Task 12 가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`auth/permission-slots.test.ts` — `it('슬롯은 열하나 …')` 를 바꾼다:

```ts
it('슬롯은 열셋 — 2c 셋 + 역할 둘(2d-1) + 사용자 둘(2d-2) + 팀 둘(2e-1) + 약관 둘(2e-2) + IP 둘(2f-1)', () => {
  expect(ADMIN_PERMISSION_SLOTS).toEqual([
    'sessions.read',
    'sessions.manage',
    'auditLogs.read',
    'roles.read',
    'roles.manage',
    'users.read',
    'users.manage',
    'teams.read',
    'teams.manage',
    'legal.read',
    'legal.publish',
    'ipAccess.read',
    'ipAccess.manage',
  ])
})
```

`ip-access/ip-access.module.test.ts`(새):

```ts
import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { ADMIN_ACCESS_POLICY, IP_ACCESS_ENABLED } from '../tokens.js'
import { IpAccessPolicy } from './ip-access.policy.js'
import { AdminIpAccessModule } from './ip-access.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = {
  'ipAccess.read': 'setting.ipAccess:read',
  'ipAccess.manage': 'setting.ipAccess:write',
}

const apps: { close(): Promise<void> }[] = []

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
})

async function boot(imports: ModuleMetadata['imports'], options: Partial<AdminServerOptions> = {}) {
  const app = await createHttpApp({
    imports: [
      AdminServerModule.forRoot({
        db: unreachable,
        auth: { jwtSecret: TEST_JWT_SECRET },
        permissions: PERMISSIONS,
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminIpAccessModule 배선', () => {
  it('뜨면 다섯 라우트가 /admin/ip-access 아래에 있고 쿠키 없이는 401(가드가 DB · 파이프에 닿기 전에 끝난다)', async () => {
    const server = (await boot([AdminAuthModule, AdminIpAccessModule])).getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/ip-access'],
      ['get', '/admin/ip-access/preview'],
      ['post', '/admin/ip-access'],
      ['patch', '/admin/ip-access/1'],
      ['delete', '/admin/ip-access/1'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 전역으로 정책 · 표시 토큰을 낸다 — 인증 서비스 · 역할 · 사용자 서비스가 import 순서와 무관하게 받는다', async () => {
    const app = await boot([AdminIpAccessModule, AdminAuthModule])
    expect(app.get(ADMIN_ACCESS_POLICY)).toBeInstanceOf(IpAccessPolicy)
    expect(app.get(IP_ACCESS_ENABLED)).toBe(true)
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminIpAccessModule])).rejects.toThrow(
      'AdminIpAccessModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 IP 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminIpAccessModule], { permissions: {} })).rejects.toThrow(
      'AdminIpAccessModule 의 권한 슬롯이 이어지지 않았다: ipAccess.read, ipAccess.manage',
    )
  })

  it('🔴 clientIp 오타는 기동에서 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminIpAccessModule], {
        clientIp: 'X-Real-IP' as unknown as AdminServerOptions['clientIp'],
      }),
    ).rejects.toThrow("clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.")
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test permission-slots ip-access.module`
Expected: FAIL — 슬롯 목록에 IP 둘이 없다, `./ip-access.module.js` 가 없다.

- [ ] **Step 3: 파이프 · 컨트롤러 · 모듈을 쓴다**

`ip-access/ip-access.body.ts`(새):

```ts
import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import {
  adminIpRuleCreateSchema,
  adminIpRuleRemoveSchema,
  adminIpRuleUpdateSchema,
  ipScopeProblem,
} from '@ssworks/admin-shared'
import { currentPasswordField } from '../accounts/reauth-body.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_IP_ACCESS_CONFIG } from '../tokens.js'
import type {
  AdminIpRuleCreateBody,
  AdminIpRuleRemoveBody,
  AdminIpRuleUpdateBody,
} from './ip-access.service.js'
import type { ResolvedIpAccessConfig } from './options.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.dto.ts(cidr · 범위 불변식 · 재인증 칸) + admin-shared IP 스키마
// 바꾼 점: 재인증 칸이 런타임 옵션(reauth)에 달려 주입형 파이프로 만든다(역할 · 사용자와 같은 방식, 2d B5). 범위 불변식은 extend
//   뒤에 superRefine 으로 건다 — admin-shared 스키마에 refine 이 있으면 extend 가 던진다(zod 4). 수정의 불변식은 병합 결과라
//   서비스가 본다. `@Body(클래스)` 로 넘기면 Nest 가 모듈 안에서 만든다 — 모듈 providers 에 적지 않는다.

@Injectable()
export class IpRuleCreateBodyPipe implements PipeTransform<unknown, AdminIpRuleCreateBody> {
  private readonly pipe: ZodValidationPipe<AdminIpRuleCreateBody>

  constructor(@Inject(ADMIN_IP_ACCESS_CONFIG) config: ResolvedIpAccessConfig) {
    this.pipe = new ZodValidationPipe(
      adminIpRuleCreateSchema
        .extend({ currentPassword: currentPasswordField(config.reauth) })
        .superRefine((body, ctx) => {
          const problem = ipScopeProblem(body)
          if (problem !== null) {
            ctx.addIssue({ code: 'custom', path: ['scopeRefNo'], message: problem })
          }
        }),
    )
  }

  transform(value: unknown): AdminIpRuleCreateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class IpRuleUpdateBodyPipe implements PipeTransform<unknown, AdminIpRuleUpdateBody> {
  private readonly pipe: ZodValidationPipe<AdminIpRuleUpdateBody>

  constructor(@Inject(ADMIN_IP_ACCESS_CONFIG) config: ResolvedIpAccessConfig) {
    this.pipe = new ZodValidationPipe(
      adminIpRuleUpdateSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminIpRuleUpdateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class IpRuleRemoveBodyPipe implements PipeTransform<unknown, AdminIpRuleRemoveBody> {
  private readonly pipe: ZodValidationPipe<AdminIpRuleRemoveBody>

  constructor(@Inject(ADMIN_IP_ACCESS_CONFIG) config: ResolvedIpAccessConfig) {
    this.pipe = new ZodValidationPipe(
      adminIpRuleRemoveSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminIpRuleRemoveBody {
    return this.pipe.transform(value)
  }
}
```

`ip-access/ip-access.controller.ts`(새):

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import {
  CoreAuditActions,
  CoreAuditTargets,
  adminIpPreviewQuerySchema,
} from '@ssworks/admin-shared'
import type { AdminIpPreviewQuery } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditDiff, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import {
  IpRuleCreateBodyPipe,
  IpRuleRemoveBodyPipe,
  IpRuleUpdateBodyPipe,
} from './ip-access.body.js'
import { AdminIpAccessService, IP_RULE_AUDIT_FIELDS } from './ip-access.service.js'
import type {
  AdminIpRuleCreateBody,
  AdminIpRuleRemoveBody,
  AdminIpRuleUpdateBody,
} from './ip-access.service.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.controller.ts(다섯 라우트 · 미리보기는 :write · 재인증 본문)
// 바꾼 점: 권한은 슬롯(ipAccess.read · ipAccess.manage), 응답은 만들기 201 { item } · 수정 { item } · 삭제 {}, 수정 · 삭제 본문에
//   revision, 미리보기 응답 clientIp · clientPasses(hangang actorIp · actorPasses). 감사 diff 는 서비스가 커밋한 뒤에 붙인다 —
//   409 로 롤백된 쓰기의 감사 행 meta 는 null 이다.

@Controller('ip-access')
export class AdminIpAccessController {
  constructor(private readonly rules: AdminIpAccessService) {}

  @RequirePermissionSlot('ipAccess.read')
  @Get()
  list() {
    return this.rules.list()
  }

  /** 🔴 manage 슬롯이다 — 남의 접속 주소와 요청자 자신의 IP 를 내보인다(hangang). 잠금 · 감사 · 재인증 없음 */
  @RequirePermissionSlot('ipAccess.manage')
  @Get('preview')
  preview(
    @Query(new ZodValidationPipe(adminIpPreviewQuerySchema)) query: AdminIpPreviewQuery,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    return this.rules.preview(query, admin, this.rules.clientIpOf(req))
  }

  @RequirePermissionSlot('ipAccess.manage')
  @Audit({ action: CoreAuditActions.IP_ACCESS_CREATE, targetType: CoreAuditTargets.IP_ACCESS_RULE })
  @Post()
  async create(
    @Body(IpRuleCreateBodyPipe) body: AdminIpRuleCreateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item } = await this.rules.create(body, admin, this.rules.clientIpOf(req))
    attachAuditTarget(req, item.ruleNo)
    attachAuditDiff(req, null, item, IP_RULE_AUDIT_FIELDS)
    return { item }
  }

  @RequirePermissionSlot('ipAccess.manage')
  @Audit({ action: CoreAuditActions.IP_ACCESS_UPDATE, targetType: CoreAuditTargets.IP_ACCESS_RULE })
  @Patch(':ruleNo')
  async update(
    @Param('ruleNo', ParseBigIntPipe) ruleNo: bigint,
    @Body(IpRuleUpdateBodyPipe) body: AdminIpRuleUpdateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, after } = await this.rules.update(
      ruleNo,
      body,
      admin,
      this.rules.clientIpOf(req),
    )
    attachAuditDiff(req, before, after, IP_RULE_AUDIT_FIELDS)
    return { item }
  }

  /** 🔴 지운 규칙은 감사 before 로만 복원된다 */
  @RequirePermissionSlot('ipAccess.manage')
  @Audit({ action: CoreAuditActions.IP_ACCESS_DELETE, targetType: CoreAuditTargets.IP_ACCESS_RULE })
  @Delete(':ruleNo')
  async remove(
    @Param('ruleNo', ParseBigIntPipe) ruleNo: bigint,
    @Body(IpRuleRemoveBodyPipe) body: AdminIpRuleRemoveBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { before } = await this.rules.remove(ruleNo, body, admin, this.rules.clientIpOf(req))
    attachAuditDiff(req, before, null, IP_RULE_AUDIT_FIELDS)
    return {}
  }
}
```

`ip-access/ip-access.module.ts`(새):

```ts
import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import {
  ADMIN_ACCESS_POLICY,
  ADMIN_IP_ACCESS_CONFIG,
  ADMIN_SERVER_OPTIONS,
  IP_ACCESS_ENABLED,
} from '../tokens.js'
import { AdminIpAccessController } from './ip-access.controller.js'
import { IpAccessPolicy } from './ip-access.policy.js'
import { AdminIpAccessService } from './ip-access.service.js'
import { resolveIpAccessConfig } from './options.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.module.ts
// 바꾼 점: 패키지 기능 모듈 — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다. 옵션이 없다(import 하면
//   켜진다, 2f-1 스펙 2-2 #3). 2b 의 ADMIN_ACCESS_POLICY 자리와 잔존 셈의 표시 토큰 IP_ACCESS_ENABLED 를 낸다.
// 🔴 전역이다 — AdminAuthService 의 @Optional() ADMIN_ACCESS_POLICY · 역할 · 사용자 서비스의 @Optional() IP_ACCESS_ENABLED 가
//    import 순서와 상관없이 받는다(2c 감사 모듈의 ADMIN_AUTH_EVENTS 와 같다).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 장 0012_ip_access_rules 가 있어야 돈다 — 없으면 인증 요청마다 500. 스텁 검사가 먼저 막는다(모든 장 필수).

@Global()
@Module({
  controllers: [AdminIpAccessController],
  providers: [
    {
      provide: ADMIN_IP_ACCESS_CONFIG,
      useFactory: (options: AdminServerOptions) => resolveIpAccessConfig(options),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminIpAccessService,
    { provide: ADMIN_ACCESS_POLICY, useClass: IpAccessPolicy },
    { provide: IP_ACCESS_ENABLED, useValue: true },
  ],
  exports: [ADMIN_ACCESS_POLICY, IP_ACCESS_ENABLED],
})
export class AdminIpAccessModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminIpAccessModule')
    assertPermissionSlots(
      this.options.permissions,
      ['ipAccess.read', 'ipAccess.manage'],
      'AdminIpAccessModule',
    )
  }
}
```

- [ ] **Step 4: 슬롯 · 배선 · 테스트 앱을 고친다**

`auth/permission-slots.ts`:

① `AdminPermissionSlot` 의 JSDoc 을 `/** 2c 의 셋 + 2d 의 역할 둘 · 사용자 둘 + 2e-1 의 팀 둘 + 2e-2 의 약관 둘 + 2f-1 의 IP 둘 — 유니온이 늘어나는 것은 하위 호환이다 */` 로 바꾸고, 유니온 끝(`| 'legal.publish'` 다음)에 `  | 'ipAccess.read'` · `  | 'ipAccess.manage'` 두 줄을 더한다.

② `ADMIN_PERMISSION_SLOTS` 배열 끝(`'legal.publish',` 다음)에 `  'ipAccess.read',` · `  'ipAccess.manage',` 를 더한다.

`admin-server.module.ts`:

① import 묶음 끝에 `import { AdminIpAccessModule } from './ip-access/ip-access.module.js'` 를 더한다.

② `ADMIN_ROUTE_MODULES` 의 `AdminLegalModule,` 다음 줄에 `  AdminIpAccessModule,` 를 더한다.

`index.ts` — 파일 끝에 더한다:

```ts
// IP 접근 제어(PR 2f-1)
export { AdminIpAccessModule } from './ip-access/ip-access.module.js'
```

(`AdminIpAccessRulesTable` 은 Task 3 에서 `runner.ts` → `export * from './runner.js'` 로 이미 나간다. `AdminClientIpSource` 는 Task 4.)

`test-support/accounts.ts` — `TEST_CATALOG` 의 첫 인자 끝(`LEGAL_PUBLISH: 'setting.legal:publish',` 다음)에 두 줄을, `implies` 끝(`'setting.legal:publish': ['setting.legal:read'],` 다음)에 한 줄을 더한다:

```ts
    IP_ACCESS_READ: 'setting.ipAccess:read',
    IP_ACCESS_WRITE: 'setting.ipAccess:write',
```

```ts
      'setting.ipAccess:write': ['setting.ipAccess:read'],
```

`test-support/admin-app.ts`:

① import 묶음에 `import type { AdminClientIpSource } from '../auth/request-meta.js'` 와 `import { AdminIpAccessModule } from '../ip-access/ip-access.module.js'` 를 더한다.

② 머리 주석 `(2c · 2d 역할 · 사용자 · 2e-1 팀 · 2e-2 약관)` 을 `(2c · 2d 역할 · 사용자 · 2e-1 팀 · 2e-2 약관 · 2f-1 IP)` 로 바꾼다.

③ `TEST_PERMISSIONS` 끝(`'legal.publish': 'setting.legal:publish',` 다음)에 더한다:

```ts
  'ipAccess.read': 'setting.ipAccess:read',
  'ipAccess.manage': 'setting.ipAccess:write',
```

④ `AdminAppOptions` 끝에 더한다:

```ts
  /** 클라이언트 IP 출처(2f-1 ④ C1). 기본 req.ip — supertest 는 ::ffff:127.0.0.1(정규화 뒤 127.0.0.1) */
  clientIp?: AdminClientIpSource
```

⑤ `AdminServerModule.forRoot({ … })` 의 `legal: { kinds: TEST_LEGAL_KINDS },` 다음 줄에 `          ...(options.clientIp === undefined ? {} : { clientIp: options.clientIp }),` 를 더하고, `imports` 의 `AdminLegalModule,` 다음 줄에 `        AdminIpAccessModule,` 를 더한다.

- [ ] **Step 5: GREEN · 모든 HTTP 테스트가 IP 모듈과 함께 돈다**

```bash
pnpm --filter @ssworks/admin-server test
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
pnpm test:db
```

Expected: 모두 PASS. 🔴 이제 모든 `bootAdminApp` 테스트가 IP 모듈과 함께 돈다 — 매 인증 요청이 규칙을 읽고(시드 두 행이라 통과), 잔존 셈이 IP 를 안다(시드가 global 이라 셈이 같다). 깨지는 테스트가 있으면 보고서에 출력을 붙이고 원인(규칙을 지우는 테스트가 다른 파일과 DB 를 나누는지 등)을 적는다.

- [ ] **Step 6: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/ip-access/ip-access.body.ts packages/admin-server/src/ip-access/ip-access.controller.ts packages/admin-server/src/ip-access/ip-access.module.ts packages/admin-server/src/ip-access/ip-access.module.test.ts packages/admin-server/src/auth/permission-slots.ts packages/admin-server/src/auth/permission-slots.test.ts packages/admin-server/src/admin-server.module.ts packages/admin-server/src/index.ts packages/admin-server/src/test-support/accounts.ts packages/admin-server/src/test-support/admin-app.ts
git add packages/admin-server/src/ip-access packages/admin-server/src/auth/permission-slots.ts packages/admin-server/src/auth/permission-slots.test.ts packages/admin-server/src/admin-server.module.ts packages/admin-server/src/index.ts packages/admin-server/src/test-support/accounts.ts packages/admin-server/src/test-support/admin-app.ts
git commit -m "feat(admin-server): AdminIpAccessModule — /admin/ip-access 다섯 라우트 · 슬롯 ipAccess.read · ipAccess.manage · 전역 정책 · 표시 토큰 · 배선" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: 실 MariaDB HTTP 계약 · 인증 연결

**Files:**

- Create: `ip-access/ip-access.http.db.test.ts` · `ip-access/ip-access.auth.db.test.ts`

**Interfaces:**

- Consumes: `bootAdminApp(db, { reauth?, clientIp? })`(Task 11), `resetIpRules` · `seedIpRule` · `ipRulesOf`(Task 5), admin-shared 스키마(Task 2).

- [ ] **Step 1: HTTP 계약 테스트를 쓴다**

`ip-access/ip-access.http.db.test.ts`(새):

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  IP_ACCESS_SCHEMA_MESSAGES,
  adminIpPreviewSchema,
  adminIpRuleItemSchema,
  adminIpRuleListSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TEAM_MESSAGES } from '../teams/errors.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { ipRulesOf, resetIpRules, seedIpRule } from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'

// 실 MariaDB 의 IP HTTP 계약(2f-1 스펙 §6 · §9-2). 🔴 supertest 는 듀얼스택 listen 이라 요청 주소가 ::ffff:127.0.0.1 — 정규화
// 뒤 127.0.0.1 이다(§14 R1-④). 🔴 규칙은 beforeEach 로 시드 두 행만 남긴다 — 요청자를 막는 규칙이 다음 테스트의 로그인을
// 막지 않게. bigint 가 든 본문은 stringifyJSON 으로 보낸다.

const IP_PATH = '/admin/ip-access'
const LOCAL = '127.0.0.1'
const ROW_KEYS = [
  'cidr',
  'createAt',
  'description',
  'revision',
  'ruleNo',
  'scopeName',
  'scopeRefNo',
  'scopeType',
  'scopeUserId',
  'updateAt',
]

let t: TestDatabase
let app: NestExpressApplication
let reauthApp: NestExpressApplication
let manager: SeededUser
let reader: SeededUser
let member: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  const managerRole = await seedRole(t.db, {
    roleName: 'IP 담당',
    permissions: [
      'setting.ipAccess:read',
      'setting.ipAccess:write',
      'org.teams:read',
      'org.teams:write',
    ],
  })
  const readerRole = await seedRole(t.db, {
    roleName: 'IP 조회',
    permissions: ['setting.ipAccess:read'],
  })
  const memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  manager = await seedUser(t.db, {
    roleNo: managerRole,
    userId: 'ip-manager',
    userName: '규칙 담당',
  })
  reader = await seedUser(t.db, { roleNo: readerRole, userId: 'ip-reader' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'ip-member' })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  reauthApp = await bootAdminApp(connection, { reauth: true })
})

afterAll(async () => {
  await app?.close()
  await reauthApp?.close()
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

type Agent = ReturnType<typeof request.agent>
type Pending = ReturnType<Agent['post']>

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

function sendJson(pending: Pending, body: unknown): Pending {
  return pending.set('Content-Type', 'application/json').send(stringifyJSON(body))
}

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

const issues = (details: unknown) =>
  (details as { issues: { path: unknown[]; message: string }[] }).issues.map((issue) => [
    issue.path.join('.'),
    issue.message,
  ])

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function auditRows(action: string) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', action)
    .orderBy('logNo', 'desc')
    .execute()
}

describe('목록 · 슬롯', () => {
  it('read 슬롯 — 봉투 · 행 키 · 시드 두 행, 권한 없는 사람은 403', async () => {
    const response = await (await signIn(reader)).get(IP_PATH).expect(200)
    const list = adminIpRuleListSchema.parse(data(response))
    expect(list.items.map((item) => item.cidr)).toEqual(['0.0.0.0/0', '::/0'])
    expect(Object.keys(list.items[0] as object).sort()).toEqual(ROW_KEYS)
    expectError(
      await (await signIn(member)).get(IP_PATH),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})

describe('쓰기', () => {
  it('만들기 201 { item } · Review Focus 3 공백 · 감사 행(대상 번호 · after 만)', async () => {
    const agent = await signIn(manager)
    const team = await seedTeam(t.db, 'http-team')
    const response = await sendJson(agent.post(IP_PATH), {
      scopeType: 'team',
      scopeRefNo: team,
      cidr: ' 10.0.0.0/8 ',
      description: '사무실',
    }).expect(201)
    const { item } = adminIpRuleItemSchema.parse(data(response))
    expect(item).toMatchObject({ scopeName: 'http-team', cidr: '10.0.0.0/8', revision: 0 })
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_CREATE)
    expect(row).toMatchObject({
      targetType: 'ipAccessRule',
      targetRefNo: item.ruleNo,
      statusCode: 201,
    })
    expect(row?.meta).toEqual({
      before: {},
      after: {
        scopeType: 'team',
        scopeRefNo: String(team),
        cidr: '10.0.0.0/8',
        description: '사무실',
      },
    })
  })

  it('검증 400 — CIDR 형식 · 범위 불변식(파이프) · 없는 팀(서비스)', async () => {
    const agent = await signIn(manager)
    const bad = await sendJson(agent.post(IP_PATH), {
      scopeType: 'global',
      scopeRefNo: null,
      cidr: '203.0.113.0',
    })
    expect(issues(expectError(bad, 400, CommonErrorCodes.ERR_COMMON_VALIDATION).details)).toEqual([
      ['cidr', IP_ACCESS_SCHEMA_MESSAGES.cidr],
    ])
    const forbidden = await sendJson(agent.post(IP_PATH), {
      scopeType: 'global',
      scopeRefNo: 1n,
      cidr: '10.0.0.0/8',
    })
    expect(
      issues(expectError(forbidden, 400, CommonErrorCodes.ERR_COMMON_VALIDATION).details),
    ).toEqual([['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden]])
    const missing = await sendJson(agent.post(IP_PATH), {
      scopeType: 'team',
      scopeRefNo: 999_999n,
      cidr: '10.0.0.0/8',
    })
    expect(
      issues(expectError(missing, 400, CommonErrorCodes.ERR_COMMON_VALIDATION).details),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTeam]])
  })

  it('수정 { item } · 감사 before · after · revision 409 · 없는 규칙 404', async () => {
    const agent = await signIn(manager)
    const [, v6] = await resetIpRules(t.db)
    const response = await sendJson(agent.patch(`${IP_PATH}/${v6}`), {
      description: '바뀐 설명',
      revision: 0,
    }).expect(200)
    expect(adminIpRuleItemSchema.parse(data(response)).item).toMatchObject({
      description: '바뀐 설명',
      revision: 1,
    })
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_UPDATE)
    expect(row).toMatchObject({ targetRefNo: v6, statusCode: 200 })
    expect(row?.meta).toMatchObject({
      before: { description: null },
      after: { description: '바뀐 설명' },
    })
    expectError(
      await sendJson(agent.patch(`${IP_PATH}/${v6}`), { description: 'x', revision: 0 }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      IP_ACCESS_MESSAGES.ruleRevisionMismatch,
    )
    expectError(
      await sendJson(agent.patch(`${IP_PATH}/999999`), { revision: 0 }),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
      IP_ACCESS_MESSAGES.ruleNotFound,
    )
  })

  it('삭제 {} · 감사 before 만(지운 규칙의 복원 자리)', async () => {
    const agent = await signIn(manager)
    const extra = await seedIpRule(t.db, { scopeType: 'global', cidr: '172.16.0.0/12' })
    const response = await sendJson(agent.delete(`${IP_PATH}/${extra}`), { revision: 0 }).expect(
      200,
    )
    expect(data(response)).toEqual({})
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_DELETE)
    expect(row).toMatchObject({ targetRefNo: extra, statusCode: 200 })
    expect(row?.meta).toEqual({
      before: { scopeType: 'global', scopeRefNo: null, cidr: '172.16.0.0/12', description: null },
      after: {},
    })
  })

  it('🔴 자기 잠금 409 + details.clientIp 127.0.0.1 — 쓰지 않고, 감사 행은 409 · meta null', async () => {
    const agent = await signIn(manager)
    const response = await sendJson(agent.post(IP_PATH), {
      scopeType: 'user',
      scopeRefNo: manager.userNo,
      cidr: '10.0.0.0/8',
    })
    const body = expectError(
      response,
      409,
      CommonErrorCodes.ERR_COMMON_CONFLICT,
      IP_ACCESS_MESSAGES.selfLockout,
    )
    expect(body.details).toEqual({ clientIp: LOCAL })
    expect(await ipRulesOf(t.db)).toHaveLength(2)
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_CREATE)
    expect(row).toMatchObject({ statusCode: 409, meta: null })
  })

  it('팀 삭제 409 ERR_TEAM_HAS_IP_RULES + ruleCount 봉투', async () => {
    const agent = await signIn(manager)
    const team = await seedTeam(t.db, 'http-ruled-team')
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8' })
    const body = expectError(
      await agent.delete(`/admin/teams/${team}`),
      409,
      CommonErrorCodes.ERR_TEAM_HAS_IP_RULES,
      TEAM_MESSAGES.teamHasIpRules,
    )
    expect(body.details).toEqual({ ruleCount: 1 })
  })
})

describe('미리보기', () => {
  it('clientIp · clientPasses · 요청자를 막는 create · read 슬롯 403', async () => {
    const agent = await signIn(manager)
    const now = adminIpPreviewSchema.parse(data(await agent.get(`${IP_PATH}/preview`).expect(200)))
    expect(now).toMatchObject({ clientIp: LOCAL, clientPasses: true })
    const blocking = adminIpPreviewSchema.parse(
      data(
        await agent
          .get(`${IP_PATH}/preview`)
          .query({
            op: 'create',
            scopeType: 'user',
            scopeRefNo: String(manager.userNo),
            cidr: '10.0.0.0/8',
          })
          .expect(200),
      ),
    )
    expect(blocking.clientPasses).toBe(false)
    expect(blocking.items[0]).toMatchObject({ userId: 'ip-manager', becomesLocked: true })
    expectError(
      await (await signIn(reader)).get(`${IP_PATH}/preview`),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('🔴 Review Focus 4 — 지운 규칙의 update 미리보기 404 · 빠진 칸 400', async () => {
    const agent = await signIn(manager)
    expectError(
      await agent
        .get(`${IP_PATH}/preview`)
        .query({ op: 'update', ruleNo: '999999', scopeType: 'global', cidr: '::/0' }),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
    const missing = expectError(
      await agent.get(`${IP_PATH}/preview`).query({ op: 'delete' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issues(missing.details)).toEqual([['ruleNo', IP_ACCESS_SCHEMA_MESSAGES.previewField]])
  })
})

describe('재인증(reauth 켠 앱)', () => {
  it('currentPassword 빠짐 400 · 틀림 403 ERR_REAUTH_REQUIRED · 맞으면 201', async () => {
    const agent = await signIn(manager, reauthApp)
    const rule = { scopeType: 'global', scopeRefNo: null, cidr: '172.16.0.0/12' }
    const missing = expectError(
      await sendJson(agent.post(IP_PATH), rule),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issues(missing.details).map(([path]) => path)).toEqual(['currentPassword'])
    expectError(
      await sendJson(agent.post(IP_PATH), { ...rule, currentPassword: 'wrong-password' }),
      403,
      CommonErrorCodes.ERR_REAUTH_REQUIRED,
    )
    await sendJson(agent.post(IP_PATH), { ...rule, currentPassword: manager.password }).expect(201)
  })
})
```

- [ ] **Step 2: 인증 연결 테스트를 쓴다**

`ip-access/ip-access.auth.db.test.ts`(새):

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import { CommonErrorCodes, CoreAuditActions, errorRespSchema } from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bootAdminApp } from '../test-support/admin-app.js'
import { addToTeam, seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { resetIpRules, seedIpRule } from '../test-support/ip-access.js'

// 실 MariaDB 의 인증 연결(2f-1 스펙 §5-1 · P10 · P11). 요청 주소는 정규화 뒤 127.0.0.1. 🔴 규칙은 beforeEach 로 시드 두 행만
// 남긴다.

let t: TestDatabase
let app: NestExpressApplication
let realIpApp: NestExpressApplication
let plain: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  plain = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  realIpApp = await bootAdminApp(connection, { clientIp: 'x-real-ip' })
})

afterAll(async () => {
  await app?.close()
  await realIpApp?.close()
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

function login(target: NestExpressApplication, user: SeededUser, realIp?: string | string[]) {
  const pending = request.agent(target.getHttpServer()).post('/admin/auth/login')
  if (realIp !== undefined) pending.set('X-Real-IP', realIp)
  return pending.send({ userId: user.userId, password: user.password })
}

function expectBlocked(response: Response, clientIp: string | null) {
  expect(response.status).toBe(403)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
  expect(body.details).toEqual({ clientIp })
}

async function lastAudit(action: string, userNo: bigint) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', action)
    .where('actorUserNo', '=', userNo)
    .orderBy('logNo', 'desc')
    .executeTakeFirst()
}

describe('로그인', () => {
  it('🔴 막힌 주소 — 비밀번호가 맞은 뒤 403 + clientIp · 감사 auth.login.blocked.ip, 틀린 비밀번호는 여전히 401', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-blocked' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: user.userNo, cidr: '10.0.0.0/8' })
    expectBlocked(await login(app, user), '127.0.0.1')
    expect(await lastAudit(CoreAuditActions.AUTH_LOGIN_BLOCKED_IP, user.userNo)).toMatchObject({
      ip: '127.0.0.1',
      statusCode: 403,
    })
    const wrong = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ userId: user.userId, password: 'wrong-password' })
    expect(wrong.status).toBe(401)
  })

  it('Review Focus 5 — 두 팀에 걸친 계정은 대표 팀(작은 번호)의 규칙만 본다', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-split' })
    const small = await seedTeam(t.db, 'auth-small')
    const big = await seedTeam(t.db, 'auth-big')
    await addToTeam(t.db, small, user.userNo)
    await addToTeam(t.db, big, user.userNo)
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: big, cidr: '10.0.0.0/8' })
    expect((await login(app, user)).status).toBe(200)
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: small, cidr: '10.0.0.0/8' })
    expectBlocked(await login(app, user), '127.0.0.1')
  })
})

describe('가드 · refresh', () => {
  it('🔴 로그인 뒤 규칙이 생기면 다음 요청 · refresh 가 403(access.blocked) — 세션은 끊지 않아 규칙을 풀면 다시 된다', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-later' })
    const agent = request.agent(app.getHttpServer())
    await agent
      .post('/admin/auth/login')
      .send({ userId: user.userId, password: user.password })
      .expect(200)
    await agent.get('/admin/auth/me').expect(200)
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: user.userNo, cidr: '10.0.0.0/8' })
    expectBlocked(await agent.get('/admin/auth/me'), '127.0.0.1')
    expectBlocked(await agent.post('/admin/auth/refresh'), '127.0.0.1')
    expect(await lastAudit(CoreAuditActions.AUTH_ACCESS_BLOCKED_IP, user.userNo)).toMatchObject({
      statusCode: 403,
    })
    const live = await t.db
      .selectFrom('sessions')
      .select('sessionNo')
      .where('userNo', '=', user.userNo)
      .where('isRevoked', '=', false)
      .execute()
    expect(live).toHaveLength(1)
    await resetIpRules(t.db)
    await agent.get('/admin/auth/me').expect(200)
  })
})

describe("clientIp 'x-real-ip'", () => {
  it('헤더 주소가 판정 · 세션 행 · 감사 행에 같이 쓰인다', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-xri' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: user.userNo, cidr: '10.0.0.0/8' })
    expect((await login(realIpApp, user, '10.1.2.3')).status).toBe(200)
    const session = await t.db
      .selectFrom('sessions')
      .select('ipAddress')
      .where('userNo', '=', user.userNo)
      .orderBy('sessionNo', 'desc')
      .executeTakeFirstOrThrow()
    expect(session.ipAddress).toBe('10.1.2.3')
    expect(await lastAudit(CoreAuditActions.AUTH_LOGIN_SUCCESS, user.userNo)).toMatchObject({
      ip: '10.1.2.3',
    })
    expectBlocked(await login(realIpApp, user, '203.0.113.9'), '203.0.113.9')
  })

  it('🔴 중복 헤더(쉼표로 이어짐)는 null — 막힌다 · 기본 req.ip 앱은 헤더를 보지 않는다', async () => {
    const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-xri-dup' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: user.userNo, cidr: '10.0.0.0/8' })
    expectBlocked(await login(realIpApp, user, ['10.1.2.3', '203.0.113.9']), null)
    expectBlocked(await login(app, user, '10.1.2.3'), '127.0.0.1')
  })
})
```

- [ ] **Step 3: 돌린다**

```bash
pnpm --filter @ssworks/admin-server test:db ip-access.http
pnpm --filter @ssworks/admin-server test:db ip-access.auth
pnpm lint
```

Expected: PASS. (이 Task 는 Task 4 · 6 · 9 · 11 의 구현을 HTTP 로 잰다 — 새 코드가 없다.) 🔴 처음부터 PASS 이므로 RED 를 한 번 본다: `test-support/admin-app.ts` 에서 `AdminIpAccessModule,` 줄을 잠시 지우고 `ip-access.auth` 를 돌려 로그인 · 가드 테스트가 FAIL(200) 하는지 본다. 되돌린다. supertest 가 배열 헤더를 한 줄씩 보내지 않아 중복 헤더 단언이 다르게 나오면(`'10.1.2.3'` 하나만 도착) 출력을 보고서에 붙이고, 그 단언을 `.set('X-Real-IP', '10.1.2.3, 203.0.113.9')`(이어 붙은 모양 — Node 가 만드는 그 값)로 바꾼다.

- [ ] **Step 4: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/ip-access/ip-access.http.db.test.ts packages/admin-server/src/ip-access/ip-access.auth.db.test.ts
git add packages/admin-server/src/ip-access/ip-access.http.db.test.ts packages/admin-server/src/ip-access/ip-access.auth.db.test.ts
git commit -m "test(admin-server): IP HTTP 계약 — §6 전 행 · 감사 diff · 미리보기 · 재인증, 인증 연결 — 로그인 · 가드 · refresh · x-real-ip" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: 쓰는 쪽 스모크 · README · changeset · 진행 문서

**Files:**

- Modify: `packages/admin-server/README.md`
- Create: `.changeset/admin-server-ip-access.md`
- Modify: `docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md`(§14 R2) · `2026-10-13-admin-server-auth-design.md` · `2026-10-14-admin-server-users-roles-design.md` · `2026-10-14-admin-server-teams-legal-design.md` · `2026-10-08-admin-server-foundation-design.md`(각 §14 한 줄 — 스펙 §13)
- Modify: `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`
- Create(저장소 밖): `$TEMP/akss/` 아래 앱 파일들

- [ ] **Step 1: README 를 고친다**

`packages/admin-server/README.md`:

① 둘째 단락의 `코어 스키마 11장(PR 2a · 2c · 2d-1 · 2e-1 · 2e-2)` 을 `코어 스키마 12장(PR 2a · 2c · 2d-1 · 2e-1 · 2e-2 · 2f-1)` 으로, `약관(PR 2e-2)이다. IP 접근 제어는 다음 PR 에서 붙는다` 를 `약관(PR 2e-2), IP 접근 제어(PR 2f-1)이다. 인증 경로 정리 · 첫 발행 준비는 다음 PR(2f-2)이다` 로.

② 장 표의 ``| `0011_legal_documents` …`` 행 다음에 행을 더한다:

```md
| `0012_ip_access_rules` | `ip_access_rules` + global 허용 두 행(`0.0.0.0/0` · `::/0`) |
```

③ "### 시드 · IP 자리" 의 둘째 항목 끝 `` `ADMIN_ACCESS_POLICY`(IP 판정)는 IP 접근 제어(2f)가 채운다. `` 를 `` `ADMIN_ACCESS_POLICY`(IP 판정)는 `AdminIpAccessModule` 이 채운다(아래 "IP 접근 제어"). `` 로 바꾸고, 그 절 끝에 항목을 더한다:

```md
- 🔴 **클라이언트 IP 의 출처**는 코어 옵션 `clientIp` 다. 기본 `'req.ip'` — Express `trust proxy` 를 따른다(엣지 뒤면 `app.set('trust proxy', 1)` 등). 엣지 프록시(nginx `set_real_ip_from` + `proxy_set_header X-Real-IP`)가 `X-Real-IP` 를 덮어쓰면 `clientIp: 'x-real-ip'` — 헤더가 없으면 `req.ip`, 중복 · 형식 오류면 주소 없음(IP 정책이 막는다). 🔴 엣지 없이 노출된 서버에 `'x-real-ip'` 를 쓰면 헤더 한 줄로 IP 제한을 우회한다. 유닉스 소켓 뒤(`req.ip` 가 빈다)는 `'x-real-ip'` 를 쓴다. 세션 행 · 감사 행 · IP 정책이 같은 정규화 값(`::ffff:a.b.c.d` → `a.b.c.d`, `::1` → `127.0.0.1`)을 본다.
```

④ "### 로그인 판정 · 강제 변경 · 재인증" 의 둘째 항목(`퇴사:` 로 시작하는 줄)의 첫 문장(`… 403 ERR_RESIGNED_USER` 로 끝나는 문장) 뒤에 이 문장을 이어 쓴다:

```md
IP 접근 제어를 켜면 로그인 · 매 요청 · 갱신이 퇴사 다음에 IP 를 본다(막히면 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp`).
```

⑤ "## 권한 슬롯" 예시 객체의 `'legal.publish': …` 줄 다음에 두 줄을 더한다:

```ts
      'ipAccess.read': 'setting.ipAccess:read', // GET /ip-access
      'ipAccess.manage': 'setting.ipAccess:write', // GET /ip-access/preview · POST · PATCH · DELETE /ip-access…
```

⑥ "## 사용자 · 계정" 의 **동시 쓰기 재시도** 항목 앞에 항목을 더한다:

```md
- **전권자 잔존과 IP**: IP 접근 제어를 쓰면 "마지막 전체 권한 관리자" 를 셀 때 **어디서든 로그인할 수 있는**(적용 층이 global 인) 사람만 센다. 그래서 역할 변경 · 퇴사에 더해 **팀 변경**(`teamNo`)도 그 사람을 팀 규칙이 있는 팀으로 옮겨 마지막 도달 가능 전권자를 없애면 409 다. 이미 전권자 전원이 주소로 묶인 조직은 막지 않는다("있었는데 0 이 되는" 변경만 막는다).
```

⑦ "## 팀" 의 **지우기** 항목 끝에 이 문장을 더한다:

```md
서브트리 팀을 가리키는 IP 규칙이 있으면 409 `ERR_TEAM_HAS_IP_RULES` + `details.ruleCount` — 규칙을 먼저 지운다("IP 접근 제어").
```

⑧ "## 약관" 절 다음, "## admin-ui 와 맞물리기" **앞**에 절을 더한다:

````md
## IP 접근 제어

관리자의 접속 위치를 제한한다. 규칙은 **사용자 > 팀 > 전체** 층이고, **가장 가까운 층 하나만** 본다 — 그 사람에게 사용자 규칙이 하나라도 있으면 팀 · 전체 규칙은 보지 않는다. 걸리는 규칙이 하나도 없으면 막는다(기본 거부). 장 `0012` 가 전체 허용 두 행(`0.0.0.0/0` · `::/0` — 계열이 다르면 매칭하지 않아 둘이다)을 넣으므로 모듈을 붙여도 아무도 잠기지 않는다.

```ts
imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      // …
      permissions: {
        // …
        'ipAccess.read': 'setting.ipAccess:read',
        'ipAccess.manage': 'setting.ipAccess:write',
      },
      clientIp: 'x-real-ip', // 엣지 프록시가 X-Real-IP 를 덮어쓸 때만(위 "시드 · IP 자리")
    }),
  }),
  AdminAuthModule,
  AdminIpAccessModule, // 옵션 없음 — import 하면 켜진다
]
```

마이그레이션 폴더에 스텁 한 줄을 더한다(모든 장 필수):

```ts
// src/database/migrations/012_admin_ip_access_rules.migration.ts
export { up, down } from '@ssworks/admin-server/migrations/0012_ip_access_rules'
```

| 라우트                            | 슬롯              | 본문 → 응답                                                                                                                          | 감사                                      |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `GET /admin/ip-access`            | `ipAccess.read`   | → `{ items }` 전량 — 정렬 전체 · 팀 · 사용자 → 번호, 행에 `scopeName`(팀 · 사용자 이름) · `scopeUserId`                              | —                                         |
| `GET /admin/ip-access/preview`    | `ipAccess.manage` | 쿼리 `op?`(create · update · delete) · `ruleNo` · `scopeType` · `scopeRefNo` · `cidr` → `{ clientIp, clientPasses, summary, items }` | —                                         |
| `POST /admin/ip-access`           | `ipAccess.manage` | `{ scopeType, scopeRefNo, cidr, description? }` → 201 `{ item }`                                                                     | `setting.ipAccess.create`(after)          |
| `PATCH /admin/ip-access/:ruleNo`  | `ipAccess.manage` | `{ revision, scopeType?, scopeRefNo?, cidr?, description? }` → `{ item }`                                                            | `setting.ipAccess.update`(before · after) |
| `DELETE /admin/ip-access/:ruleNo` | `ipAccess.manage` | `{ revision }` → `{}`                                                                                                                | `setting.ipAccess.delete`(before)         |

- **판정**: 로그인(비밀번호 · 잠김 · 퇴사 다음) · 매 요청 · 토큰 갱신이 IP 를 본다. 막히면 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp` — admin-ui `IpBlockedDialog` 가 읽는 값이다. 감사 행 `auth.login.blocked.ip` · `auth.access.blocked.ip`. 규칙을 바꿔도 세션은 끊지 않는다 — 막힌 주소의 요청이 403 을 받고, 규칙을 풀면 같은 세션이 다시 된다.
- **팀 규칙**은 그 사람의 **대표 팀**(가장 작은 팀 번호) 하나에만 걸린다(로그인 · 잔존 · 미리보기가 같은 팀을 본다). 하위 팀으로 내려가지 않는다.
- **CIDR**: IPv4 · IPv6, 프리픽스가 꼭 있어야 한다(`203.0.113.0/24` · `2001:db8::/32`). 앞뒤 공백은 뗀다. 호스트 비트가 남은 표기(`203.0.113.9/24`)는 네트워크처럼 매칭한다. 화면도 admin-shared `ipCidrSchema` · `isValidCidr` 로 같은 파서를 쓴다.
- **자기 잠금**: 저장하면 **요청자의 지금 주소**가 막히는 변경은 409 `ERR_COMMON_CONFLICT` + `details.clientIp`(쓰지 않는다). 남만 막는 변경은 막지 않는다 — 저장 전에 **미리보기**로 누가 잠기는지 본다(`becomesLocked` · 등급순 정렬 · `blockedSessions`). 미리보기는 읽은 순간의 스냅숏이라 저장이 409 일 수 있다.
- **전권자 잔존**: 마지막 "어디서든 로그인할 수 있는 전체 권한 관리자" 를 없애는 규칙 변경(그 사람에게 사용자 규칙 · 마지막 전체 규칙 삭제 …)은 409 `lastSuperAdmin`.
- **쓰기 보호**: 수정 · 삭제는 `revision`(409 `ERR_COMMON_REVISION_CONFLICT`). `reauth: true` 면 본문 `currentPassword`. 가리키는 팀 · 사용자가 없으면 400 `issues[scopeRefNo]`. 전체 규칙에 대상을 두거나 팀 · 사용자 규칙에 대상을 빼면 400 `issues[scopeRefNo]`.
- **팀 삭제**는 그 팀(하위 팀 포함)을 가리키는 규칙이 있으면 409 `ERR_TEAM_HAS_IP_RULES` — 규칙을 먼저 지운다.
- **동시 쓰기**: IP 쓰기는 `guard_locks` 행 `superAdminSurvival` 에서 역할 · 사용자의 잔존 쓰기와 함께 하나씩 돈다 — 두 관리자가 각자 통과하는 변경을 동시에 넣어도 뒤의 쪽이 자기 잠금 409 로 걸린다. 드문 잠금 충돌은 409 `ERR_COMMON_CONFLICT`("다시 시도해 주세요") — 다시 보내면 된다.
- **캐시 없음**: 매 인증 요청이 규칙 표를 읽는다(세션 · 주체 · 규칙 — DB 왕복 셋). 규칙 변경은 다음 요청부터 모든 인스턴스에 걸린다.
````

⑨ "## admin-ui 와 맞물리기" 의 IP 차단 문장은 그대로 둔다.

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-ip-access.md`(새):

```md
---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0012_ip_access_rules` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0012_ip_access_rules'` — 🔴 모든 장 필수, global 허용 두 행이 시드된다). IP 접근 제어를 쓰면 `permissions` 에 슬롯 `'ipAccess.read'` · `'ipAccess.manage'` 를 잇고 `AdminIpAccessModule` 을 import 한다(역할 · 사용자 모듈을 쓰면 두 키도 `permissionCatalog` 안이어야 한다). 엣지 프록시가 `X-Real-IP` 를 덮어쓰면 코어 옵션 `clientIp: 'x-real-ip'`(아니면 `app.set('trust proxy', …)` 로 `req.ip` 를 맞춘다). 세션 · 감사의 IP 는 이제 정규화 값이다(`::ffff:127.0.0.1` → `127.0.0.1`). 사용자 수정의 `teamNo` 변경이 마지막 전권자에서 409 일 수 있고, IP 규칙이 가리키는 팀의 삭제는 409 `ERR_TEAM_HAS_IP_RULES` 다. refresh 가 막힌 주소에서 403 `ERR_IP_NOT_ALLOWED` 다. 쓰는 쪽 감사 카탈로그가 `setting.ipAccess.*` · `ipAccessRule`(또는 키 `IP_ACCESS_*` · `IP_ACCESS_RULE`)을 이미 정의했다면 겹침 검사가 던진다.

admin-server IP 접근 제어(Phase 2 PR 2f-1): `AdminIpAccessModule` — `/admin/ip-access` 다섯 라우트(목록 · 미리보기 · 만들기 201 `{ item }` · 수정 `{ item }` · 삭제 `{}`). 평가는 사용자 > 팀 > 전체 중 가장 가까운 층 하나 · 기본 거부 · IPv4 · IPv6, 로그인 · 매 요청 · refresh 가 막힌 주소에 403. 요청자 자신을 막는 변경은 409 `ERR_COMMON_CONFLICT` + `clientIp`, 마지막 도달 가능 전권자를 없애는 변경은 409. 전권자 잔존 셈은 IP 모듈이 있으면 적용 층이 global 인 사람만 센다. 코어 옵션 `clientIp`(`'req.ip'` 기본 · `'x-real-ip'`). 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: IP 파서 · 평가(`normalizeIp` · `isValidIp` · `parseCidr` · `isValidCidr` · `ipInCidr` · `applicableIpLayer` · `evaluateIpAccess` · `ipScopeProblem`), 규칙 · 미리보기 스키마(`ipCidrSchema` · `adminIpRule*Schema` · `adminIpPreview*Schema`), 코어 감사 액션 `setting.ipAccess.create` · `update` · `delete`("IP 규칙 추가 · 수정 · 삭제") · 대상 `ipAccessRule`("IP 규칙"), 오류 코드 `ERR_TEAM_HAS_IP_RULES`(409).
```

- [ ] **Step 3: tarball 을 만들고 스모크 앱을 쓴다**

```bash
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server build
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
mkdir -p "$TEMP/akss/src/migrations"
pnpm --filter @ssworks/admin-shared pack --pack-destination "$TEMP/akss"
pnpm --filter @ssworks/admin-server pack --pack-destination "$TEMP/akss"
ls "$TEMP/akss"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "package/dist/ip-access/.*[.]js$"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "package/dist/database/migrations/0012_ip_access_rules[.]js$"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "test-support|[.]test[.]js" || echo "테스트 파일 없음"
```

Expected: tarball 둘, `dist/ip-access/*.js` · `0012_ip_access_rules.js` 가 보이고 마지막 줄은 `테스트 파일 없음`.

🔴 이 단계의 폴더는 **포그라운드** 명령으로 만든다(백그라운드 작업이 저장소 밖에 만든 파일이 남지 않은 일이 있었다). `$TEMP/akss/package.json` · `tsconfig.json` · `.env` · `kysely.config.ts` · `src/main.ts` · `src/seed.ts` 는 2e-2 플랜 Task 8 Step 3 과 같다 — 그대로 옮겨 쓰고 tarball 이름만 `ls` 결과로 맞춘다. 스텁은 2e-2 의 열하나에 하나를 더한 열둘이다:

```ts
// $TEMP/akss/src/migrations/012_admin_ip_access_rules.ts
export { up, down } from '@ssworks/admin-server/migrations/0012_ip_access_rules'
```

`$TEMP/akss/src/app.module.ts` — 2e-2 의 파일에서 바꾼다: import 에 `AdminIpAccessModule` 을 더하고, 카탈로그에 `IP_ACCESS_READ: 'setting.ipAccess:read'` · `IP_ACCESS_WRITE: 'setting.ipAccess:write'` 를, `permissions` 에 `'ipAccess.read': 'setting.ipAccess:read'` · `'ipAccess.manage': 'setting.ipAccess:write'` 를, 옵션에 `clientIp: process.env.SMOKE_CLIENT_IP === 'x-real-ip' ? 'x-real-ip' : 'req.ip'` 를, `imports` 의 `AdminLegalModule,` 다음에 `AdminIpAccessModule,` 를 더한다.

`$TEMP/akss/check.mjs` — 2e-2 플랜의 도우미(`send` · `show` · `bigint` · `waitForServer` · `login`) 그대로, 본문을 바꾼다:

```js
await waitForServer()
const admin = await login('admin', 'smoke-pass-1234')
const write = (method, path, body) => send(path, { method, cookie: admin, body })
const read = (path) => send(path, { cookie: admin })

show('ip-list', await read('/admin/ip-access'))
show('ip-preview-now', await read('/admin/ip-access/preview'))
show(
  'ip-create-global',
  await write('POST', '/admin/ip-access', {
    scopeType: 'global',
    scopeRefNo: null,
    cidr: '10.0.0.0/8',
    description: '사무실',
  }),
)
show(
  'ip-preview-block-me',
  await read('/admin/ip-access/preview?op=create&scopeType=user&scopeRefNo=1&cidr=10.0.0.0%2F8'),
)
show(
  'ip-self-lockout',
  await write('POST', '/admin/ip-access', {
    scopeType: 'user',
    scopeRefNo: 'BigInt(1)',
    cidr: '10.0.0.0/8',
  }),
)
show(
  'ip-bad-cidr',
  await write('POST', '/admin/ip-access', {
    scopeType: 'global',
    scopeRefNo: null,
    cidr: '10.0.0.0',
  }),
)
show(
  'audit-logs',
  await read('/admin/audit-logs?itemsPerPage=20&filter%5Baction%5D=setting.ipAccess'),
)
```

🔴 시나리오 대조: 시드 계정 `admin` 의 userNo 가 1 이다(2d-2 시드 — 다르면 `ip-list` 뒤에 `/admin/auth/me` 로 읽어 바꾼다). `scopeRefNo` 는 본문에서 `"BigInt(1)"` 래퍼로 보낸다(서버 리바이버가 bigint 로 푼다). 스모크 서버는 `127.0.0.1` 로 듣는다 — 사용자 규칙 `10.0.0.0/8` 은 요청자를 막으니 자기 잠금 409 다. 본문 · 쿼리에 백슬래시가 없다.

- [ ] **Step 4: 설치 · 빌드 · 마이그레이션 · 시드**

```bash
cd "$TEMP/akss"
pnpm install
pnpm build
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists akss; create database akss"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akss -e "select scope_type, scope_ref_no, cidr from ip_access_rules order by rule_no; show create table ip_access_rules"
```

Expected: 설치 성공 · 마이그레이션 12장 · 시드 성공. `ip_access_rules` 두 행(global `0.0.0.0/0` · `::/0`), `scope_type` · `cidr` 가 `CHARACTER SET ascii COLLATE ascii_bin`, FK 없음.

- [ ] **Step 5: 기동 · 요청**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected(본문은 줄여 적는다):

- `ip-list 200 {…"items":[{…"cidr":"0.0.0.0/0"…},{…"cidr":"::/0"…}]}`
- `ip-preview-now 200 {…"clientIp":"127.0.0.1","clientPasses":true,…}`
- `ip-create-global 201 {…"item":{…"cidr":"10.0.0.0/8","revision":0…}}`
- `ip-preview-block-me 200 {…"clientPasses":false…}`
- `ip-self-lockout 409 {…"code":"ERR_COMMON_CONFLICT","message":"이 변경을 저장하면 지금 접속한 위치에서 로그인할 수 없게 됩니다.","details":{"clientIp":"127.0.0.1"}}`
- `ip-bad-cidr 400 {…"path":["cidr"],…"message":"IPv4 · IPv6 CIDR 형식이 아닙니다. 예: 203.0.113.0/24, 2001:db8::/32"…}`
- `audit-logs 200 {…}` — `setting.ipAccess.create` 둘(201 · 409)과 실패 행 meta `null`.

이어서 `SMOKE_CLIENT_IP=x-real-ip` 로 다시 띄워(`TZ=UTC SMOKE_CLIENT_IP=x-real-ip node dist/main.js`) `curl -s -H "X-Real-IP: 198.51.100.7" -H "Content-Type: application/json" -d '{"userId":"admin","password":"smoke-pass-1234"}' http://127.0.0.1:4100/api/admin/auth/login` 를 보내고, `select ip_address from sessions order by session_no desc limit 1` 이 `198.51.100.7` 인지 본다.

셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
```

- [ ] **Step 7: 스펙 · 진행 문서를 고친다**

① `docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md` §14 끝에 더한다:

```md
- **R2 — 플랜이 더한 작은 결정(2026-10-15, 2f-1 플랜).** ① 범위 불변식 문구 둘(`scopeRefRequired` · `scopeRefForbidden`)과 미리보기 빠진 칸 문구는 admin-shared `IP_ACCESS_SCHEMA_MESSAGES` 에 둔다(화면과 같은 문구) — §6 의 `IP_ACCESS_MESSAGES` 는 서버 문구 다섯(규칙 없음 · revision · 자기 잠금 · 대상 팀 · 대상 사용자)이다. 판정 함수는 `ipScopeProblem`(문구 또는 null) + `isValidIpScope`. ② 팀 삭제 문구는 `TEAM_MESSAGES.teamHasIpRules`(팀 문구 표). ③ `clientIp` 해석은 인증(`ResolvedAuthConfig.clientIp`) · 감사(`ResolvedAuditConfig.clientIp`) · IP 모듈(`ResolvedIpAccessConfig.clientIp`)이 같은 `resolveClientIpSource` 로 각자 한다 — 코어 토큰을 따로 두지 않는다. ④ 만들기 응답은 `{ item }`(역할의 `{ roleNo }` 와 다르다 — 화면이 revision · 대상 이름을 바로 쓴다). ⑤ 테스트 앱 `bootAdminApp` 이 IP 모듈을 늘 붙인다 — 모든 HTTP 테스트가 IP 판정 · IP 를 아는 잔존과 함께 돈다. ⑥ 잔존 (s2) 시나리오 B 는 `accounts/super-admin.ip.db.test.ts` 에 둔다(사용자 서비스의 셈 갈래와 같이). ⑦ `decorator-metadata.test.ts` 는 고치지 않는다(새 생성자를 재는 테스트가 아니다 — 모듈 테스트가 전역 주입을 잰다).
```

② 스펙 §13 의 정정 넷 — 각 문서 §14 끝에 한 줄씩 더한다:

- `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` §14: `- **R(2f-1) — IP 접근 제어(2026-10-15, docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md).** refresh · 유예 발급이 퇴사 뒤 · 회전 전에 IP 를 본다(P11 — §5 refresh 흐름 "퇴사 → 회전" 이 "퇴사 → IP → 회전"). 세션 메타 clientIp 는 코어 옵션 clientIp 출처의 정규화 값이다(P10 — "req.ip ?? null" 대신). §11 "IP 평가 · request-ip.util · trust proxy → 2f" 를 그 문서가 닫는다.`
- `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` §14: `- **R(2f-1) — IP 를 아는 잔존(2026-10-15, 2f-1 스펙).** IP 모듈이 있으면 잔존 셈은 재직 ∧ '*' ∧ 적용 층 global(② R1 · P4). 잔존 지점에 IP 쓰기 셋 · 사용자 teamNo 변경(P5)을 더했다. 문구 lastSuperAdmin 을 "어디서든 로그인할 수 있는 …" 으로 넓혔다.`
- `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md` §14: `- **R(2f-1) — IP(2026-10-15, 2f-1 스펙).** §5-1 전역 잠금 순서에 ipAccessRules(teamUserMap · userEmploymentPeriods 뒤, sessions 앞). "2f 메모"(가드 행 둘의 고정 순서)는 생기지 않았다 — 팀 쓰기는 소속을 바꾸지 않아 잔존이 필요 없다(2f-1 스펙 §5-5). 팀 삭제에 IP 규칙 셈 → 409 ERR_TEAM_HAS_IP_RULES(⑤ T1).`
- `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §14(없으면 문서 끝 정정 절): `- **R(2f) — 2f 를 둘로(2026-10-15).** §1 지도의 2f 행이 2f-1 IP 접근 제어(feat/admin-server-ip-access)와 2f-2 인증 경로 이월 · 첫 발행 준비로 나뉘었다(2f-1 스펙 ① S1).`

③ `docs/01-phase0.md`:

- §8 표의 admin-server 행(또는 Phase 2 진행 행)에 `2f-1 IP 접근 제어 완료(장 0012 · AdminIpAccessModule · clientIp 옵션 · IP 를 아는 잔존)` 를 더한다(그 행의 기존 서식대로).
- §3 옵션 표의 ``| `ipAccess: { enabled, layers, inheritTeamAncestors:false, ipv6:true, seedRules }` …`` 행 첫 칸 뒤에 `→ 2f-1: 옵션 없음 — import 하면 켜짐 · 층 셋 고정 · 조상 상속 없음 · IPv6 항상 · 시드는 장 0012` 를 붙인다.
- 끝의 `다음: Phase 2 PR 2f — IP 접근 제어 · 인증 경로 이월(…)` 줄을 `다음: Phase 2 PR 2f-2 — 인증 경로 이월(rotate 잠금 순서 · 로그인 TOCTOU) · 첫 발행 준비(DB TLS · socketPath · peer 하한 · TS2536)(HANDOFF "다음 플랜").` 로 바꾼다.

④ `docs/HANDOFF.md`:

- "지금 상태" 표의 `@ssworks/admin-shared` 행 끝 문장 앞에 `PR 2f-1 이 IP 파서 · 평가 · 규칙 · 미리보기 스키마와 감사 액션 setting.ipAccess.* · 대상 ipAccessRule · 오류 코드 ERR_TEAM_HAS_IP_RULES 를 더했다.` 를 더하고 테스트 수를 이 브랜치의 `pnpm --filter @ssworks/admin-shared test` 결과로 고친다.
- `@ssworks/admin-server` 행의 PR 2e-2 문장 뒤에 `**PR 2f-1**(IP 접근 제어 — AdminIpAccessModule 다섯 라우트 · 장 0012 + global 허용 시드 · 코어 옵션 clientIp · IP 를 아는 잔존 · 사용자 teamNo 잔존 · refresh IP 검사 · 팀 삭제 409 · 경합 도우미 정리)은 구현 완료 · main 에 로컬 병합 — **main push 는 사람이 한다**.` 를 더하고 테스트 수(`pnpm --filter @ssworks/admin-server test` · `test:db`)를 이 브랜치 결과로 고친다.
- "검증" 행 끝에 `PR 2f-1 은 Windows 에서 pnpm check · pnpm test:db 초록, 쓰는 쪽 스모크($TEMP/akss — 새 DB · 스텁 12 → 시드 → 기동 → 규칙 목록 · 미리보기 · 만들기 · 자기 잠금 409 · 잘못된 CIDR 400 → 감사 행 → x-real-ip 로 다시 띄워 세션 IP)를 통과했다.` 를 더한다.
- "다음 플랜" 행을 바꾼다: `Phase 2 PR 2f-2 — 브레인스토밍부터(새 브랜치): 2d-2 이월 3(rotate 잠금 순서 users 먼저 FOR SHARE · 로그인 TOCTOU), 첫 발행 전 AdminDbConnection 의 TLS(ssl) · socketPath, admin-server peer @ssworks/admin-shared 하한, admin-shared pagination.d.ts TS2536 3건, 그다음 확인용 앱 실서버 확인 · 첫 발행(결정 ⑥ V1). 직전 PR 2f-1: 플랜 docs/superpowers/plans/2026-10-15-admin-server-ip-access.md`
- "PR 2a 최종 리뷰가 넘긴 것" 의 `첫 push 뒤 사람이: CI db 잡을 필수(required) 검사로 건다.` 끝에 ` → **완료(2026-10-15)**: main ruleset "main 필수 검사 (check · db)" — admin 우회 허용.` 을 더한다.
- "PR 2b 가 넘긴 것" 의 `2f: ADMIN_ACCESS_POLICY 구현과 clientIp 출처(trust proxy · X-Real-IP 우선).` 끝에 ` → **2f-1 에서 닫음**(IpAccessPolicy · 코어 옵션 clientIp — X-Real-IP 는 옵션으로만).` 을 더한다.
- "PR 2e-2 최종 리뷰가 넘긴 것" 의 테스트 도우미 항목 끝에 ` → **2f-1 에서 닫음**(underHeld · holdGuard · whileHeld reached).` 을 더하고, `첫 발행 전: admin-server peer …` 항목은 그대로 둔다(2f-2).
- "발행 전에 사람이 해야 하는 것" 에 `- 0.3.0 은 2026-10-15 사람이 로컬 2FA 로 따로 발행했다(CI 스테이징 실패분). PR #3(0.4.0) 머지 전에 npm Trusted Publisher(admin-shared · admin-ui)를 확인한다.` 를 더한다(이미 같은 뜻의 줄이 있으면 그 줄을 고친다).
- 새 항목 `- **PR 2f-1 최종 리뷰가 넘긴 것(2026-10-15)**` 을 "알려진 미확인 · 보류" 끝에 두고, 최종 리뷰 뒤에 채운다(리뷰 전에는 `- (최종 리뷰 뒤에 채운다)` 한 줄).

⑤ `CLAUDE.md`:

- 머리 표의 `admin-server` 행 성격 칸 `(… · 2e-2 약관 완료)` 를 `(… · 2e-2 약관 · 2f-1 IP 접근 제어 완료)` 로.
- "진행 상태와 다음 단계" 표: `**Phase 2 PR 2f — IP 접근 제어 · 인증 경로 이월**` 행을 `Phase 2 PR 2f-1 — IP 접근 제어(`AdminIpAccessModule`· 장 0012 · clientIp · IP 를 아는 잔존)` · `완료` · `스펙 docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md · 플랜 docs/superpowers/plans/2026-10-15-admin-server-ip-access.md` 로 바꾸고, 그 아래에 `**Phase 2 PR 2f-2 — 인증 경로 이월 · 첫 발행 준비**` · `**다음**` · `HANDOFF "다음 플랜"` 행을 더한다.
- "### `@ssworks/admin-server` (Phase 2)" 끝에 항목을 더한다: `- IP 쓰기(만들기 · 수정 · 삭제)는 `withSuperAdminSurvival(trx, { lock, write }, { ipAware: true })`안이다 — 잠금 단계는 대상 규칙 · 가리키는 팀/사용자 행 FOR UPDATE, 자기 잠금은 쓴 뒤 같은 트랜잭션에서 규칙을 다시 읽어 판정한다.`ipAccessRules`를 잠그는 곳은 IP 쓰기의 대상 행뿐이다(정책 · 셈 · 팀 삭제 셈 · 미리보기는 비잠금). 층 판정은 admin-shared`applicableIpLayer`·`evaluateIpAccess`하나, 대표 팀은`MIN(teamNo)`. 잔존 셈의 `ipAware`는 표시 토큰`IP_ACCESS_ENABLED`유무로만 정한다. 클라이언트 IP 는 코어 옵션`clientIp`를`requestMetaOf(req, source)` 로 읽는다.`

- [ ] **Step 8: 문서 서식 · 전량 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md .changeset/admin-server-ip-access.md docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md docs/superpowers/specs/2026-10-13-admin-server-auth-design.md docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md
pnpm exec prettier --write packages/admin-server/README.md docs/HANDOFF.md docs/01-phase0.md CLAUDE.md
pnpm exec prettier --check packages/admin-server/README.md .changeset/admin-server-ip-access.md docs CLAUDE.md
pnpm check
pnpm test:db
git add packages/admin-server/README.md .changeset/admin-server-ip-access.md docs CLAUDE.md
git commit -m "docs: PR 2f-1 IP 접근 제어 — README IP 절 · clientIp · 잔존, changeset, 스펙 정정, 진행 문서, 다음은 2f-2" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: `pnpm check` · `pnpm test:db` 초록. 테스트 수를 HANDOFF 에 적은 값과 맞춘다(다르면 고쳐 다시 커밋).

---

## 스펙 대조표 (자체 검토)

| 스펙                                               | Task                                |
| -------------------------------------------------- | ----------------------------------- |
| ① S1 범위 · 테스트 도우미 당김(P15)                | 1                                   |
| ② R1 IP 를 아는 잔존 · P3 토큰 · P4 셈 · P5 teamNo | 5 · 9(s1 · s3 · s4 · s5) · 11(토큰) |
| ③ D1 기본 거부 + 시드                              | 2(평가) · 3(장)                     |
| ④ C1 · P10 clientIp                                | 4 · 11(옵션 기동 검사) · 12(헤더)   |
| ⑤ T1 · P9 팀 삭제 409                              | 7 · 10(r1) · 12(HTTP)               |
| ⑥ A 전역 모듈 · P1 admin-shared · P2 정책          | 2 · 9 · 11                          |
| ⑦ refresh IP(P11) · 결과 상태 자기 잠금(P6)        | 6 · 9 · 12                          |
| P7 참조 행 잠금 · P8 범위 불변식                   | 9 · 10(r1 · r3) · 11(파이프)        |
| P12 미리보기 · P13 목록 · P14 문구                 | 8 · 9 · 12                          |
| §5-5 전역 잠금 순서 · §5-3 가드 직렬화             | 10(가드 관찰 · r2) · 13(스펙 정정)  |
| §6 오류 표 전 행                                   | 7 · 9 · 11 · 12                     |
| §9-1 단위 · §9-2 실 MariaDB · §9-3 리뷰 초점       | 1~12 · Global Constraints           |
| §10 changeset · README · 진행 문서 · 스모크        | 13                                  |
| §11 비범위(2f-2 · 화면 · 캐시 …)                   | 손대지 않음 — 13 HANDOFF 다음 플랜  |
| §13 선행 문서 정정                                 | 13 Step 7                           |
| §14 R1 실측                                        | 플랜 머리 "플랜 전 실측" · 10 RED   |
