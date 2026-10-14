# admin-server 팀 (Phase 2 PR 2e-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@ssworks/admin-server` 에 팀 관리(`AdminTeamsModule` — 트리 · 만들기 · 이름 바꾸기 · 이동 · 하위 팀째 지우기)를 더한다. 쓰는 쪽은 장 스텁 한 줄(`0010_team_tree_lock`) · 팀 슬롯 둘 · `AdminTeamsModule` import 로 admin-ui `useTeamTree` 를 실서버에 붙인다. 2d-2 가 넘긴 이월 셋(잠금 대기 폴링 · `replaceTeam` 같은 팀 건너뛰기 · `lockTeam` 회귀 테스트)을 함께 닫는다.

**Architecture:** 팀 쓰기 넷은 guardLocks 행 `teamTree` 를 트랜잭션 첫 문장에서 `FOR UPDATE` 로 잡아 하나씩 돈다 — 겹치지 않는 행을 잠근 이동 둘이 순환을 만드는 길을 막는다. 쓰기 안의 읽기는 모두 잠금 읽기이고, 예외는 삭제의 소속 셈 하나다(서브트리 팀 행을 X 로 쥔 뒤 첫 비잠금 읽기 — 사용자 쓰기와 교착하지 않는다). closure 는 앱이 셈한 쌍으로 지우고 넣으며 자기 행(depth 0)을 쓰되 기대지 않는다. 이동은 받는 형제 묶음을 0..n-1 로 다시 매긴다.

**Tech Stack:** NestJS 12.1 (ESM · NodeNext) · Kysely 0.29 + MariaDB 11.4 · zod 4 · vitest 4 · supertest · TypeScript 5.9

**Spec:** `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md` — 경계 결정 ⓪~⑫ · 이월 아홉 건(§2-1) · 공통 1~15(§2-2) · 설계 B1~B13(§2-3) · §4-1 · §4-3 · §4-4 · §4-5 · §4-7 · §5-1~§5-6 · §5-8 · §6 · §9 [1] · §14 R1(실측). 이 플랜은 그 스펙의 **[1]**(2e-1)이다. 어긋나면 스펙이 이긴다. 직전 PR 2d-2 플랜: `docs/superpowers/plans/2026-10-14-admin-server-users.md`.

**구현자 규칙(모든 Task):** 테스트를 먼저 만들고 **구현 전에 돌려 RED 를 보고서에 붙인다**(실패 메시지 몇 줄). 그다음 구현 · GREEN · 커밋. 🔴 표시가 붙은 잠금 · 순서 테스트는 구현 뒤에 해당 줄을 일부러 바꿔 RED 를 한 번 더 보고(보고서에 적고) 되돌린다. 리뷰어는 이 플랜의 해당 Task 와 Global Constraints 를 **먼저 다 읽고** 리뷰한다.

## Global Constraints

- ESM 전용 · `module: NodeNext`. 내부 상대 import 는 `.js` 확장자. `console.log` 금지(`Logger.warn` · `error` 만).
- `admin-server/src` 는 `import type` 분리 규칙의 예외다(DI 메타데이터) — 단 데코레이터가 붙은 시그니처(생성자 · 핸들러 매개변수)에 쓰는 **인터페이스 · 타입 별칭은 `import type`**(TS1272), DI 로 받는 **클래스는 일반 import**.
- 정본에서 옮긴 파일은 머리 주석에 `정본:` 과 `바꾼 점:` 을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 패키지는 권한 키를 하드코딩하지 않는다 — 슬롯 이름만: `'teams.read'` · `'teams.manage'`(이 PR), 2c · 2d 의 `'sessions.read'` · `'sessions.manage'` · `'auditLogs.read'` · `'roles.read'` · `'roles.manage'` · `'users.read'` · `'users.manage'`. `GET /teams/tree` 는 `teams.read` ∨ `users.read`(⑥ P1).
- 🔴 **잠금 순서**(스펙 B1 · §5-1) — 전역 하나: `superAdminSurvival(가드) → users → roles → teamTree(가드) → teams → teamClosure → teamUserMap · userEmploymentPeriods → sessions`. 한 트랜잭션은 이 순서의 부분열만 잡는다. 팀 쓰기는 users · roles 를 잠그지 않고, 사용자 쓰기는 `teamTree` · `teamClosure` 를 잠그지 않는다. 한 트랜잭션은 guardLocks 행을 둘 이상 잡지 않는다.
- 🔴 **팀 쓰기 넷(만들기 · 이름 바꾸기 · 이동 · 삭제)은 `lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)` 가 트랜잭션의 첫 문장이다**(① G1 · B5). 그 앞에 어떤 SELECT 도 두지 않는다 — 비잠금 SELECT 는 읽기 뷰를 먼저 연다(스냅샷 격리 ON 의 1020, 삭제 셈의 낡은 읽기).
- 🔴 **팀 쓰기 안의 읽기는 모두 잠금 읽기(`.forUpdate()`)다**(B3). 예외는 하나 — 삭제의 소속 셈은 **비잠금**이고 그 트랜잭션의 **첫 비잠금 읽기**다(② D1 · B4). 그 앞에 비잠금 읽기를 두면 기다리는 사이 커밋된 소속을 못 보고 `DELETE teams` 의 CASCADE 가 그 소속을 조용히 지운다(스펙 §14 R1-1 실측).
- 🔴 **closure 자기 행(depth 0)에 기대지 않는다**(④ C1). 만들기는 자기 행을 넣는다. 읽기 · 이동 · 삭제는 "대상 ∪ `depth > 0` 행" 으로 센다 — 대상은 따로 넣는다. 상위 팀 = 깊이 1 조상.
- **순서 값**(⑤ O1): 만들기 = 형제 `MAX + 1`(형제가 없으면 0). 이동 = 받는 형제(대상 제외, (`displayOrder`, `teamNo`) 순)에 대상을 `beforeTeamNo` 앞(`null` 이면 끝)에 끼워 0..n-1 로 다시 매긴다 — 바뀐 행만 UPDATE. 같은 상위 팀이고 팀 순서가 그대로면 제자리(쓰지 않는다). 트리 응답의 형제는 (`displayOrder`, `teamNo`) 순.
- **이동 검사 순서**(B10): 트랜잭션 밖 `beforeTeamNo === teamNo` 400 → 가드 → 대상(404) → 지금 상위 · 옛 조상 · 서브트리 → 상위 팀이 서브트리 안이면 400 순환 → 상위 팀(404) → 받는 형제 → `beforeTeamNo` 가 형제가 아니면 400 → 계획 → closure → 형제 UPDATE.
- **팀 쓰기는 재인증 · revision 이 없다**(공통 3). `reauth: true` 여도 `currentPassword` 를 받지 않는다.
- 오류(정확히 이 글자 — `teams/errors.ts` 의 `TEAM_MESSAGES`):
  - `팀을 찾을 수 없습니다.` — 404 `ERR_NO_TEAM`(경로의 팀)
  - `상위 팀을 찾을 수 없습니다.` — 404 `ERR_NO_TEAM`(만들기 · 이동의 상위 팀)
  - `이미 있는 팀 이름입니다.` — 409 `ERR_DUPLICATE_TEAM_NAME`(제약 `uq_teams_name` — 사전 검사 없음)
  - `이 팀이나 하위 팀에 소속된 계정이 있어 지울 수 없습니다. 계정을 먼저 다른 팀으로 옮기세요.` — 409 `ERR_TEAM_HAS_MEMBERS` + `details.memberCount`(계정 수 — `count(distinct userNo)`, 퇴사자 포함)
  - `팀을 자기 자신이나 하위 팀 아래로 옮길 수 없습니다.` — 400 `ERR_TEAM_MOVE_CYCLE`
  - `기준 팀이 옮겨 갈 상위 팀의 하위 팀이 아닙니다.` — 400 `ERR_COMMON_VALIDATION` `issues[{ path: ['beforeTeamNo'] }]`
  - `옮길 팀 자신을 기준 팀으로 고를 수 없습니다.` — 400 `ERR_COMMON_VALIDATION` `issues[{ path: ['beforeTeamNo'] }]`
  - 가드 행 없음 — 500 `ERR_COMMON_INTERNAL`(응답은 2a 고정 문구), 오류 메시지 `동시성 보호 설정이 없어 처리할 수 없습니다.` + `details.lockName`(`database/guard-locks.ts` 의 `GUARD_MESSAGES.missing`)
- 감사 액션(admin-shared `CoreAuditActions`, 대상 `team` "팀"): `org.team.create` "팀 생성" · `org.team.update` "팀 수정" · `org.team.delete` "팀 삭제" · `org.team.move` "팀 이동". 만들기 = 대상 번호 + diff after `{ teamName, parentTeamNo }`, 이름 = diff `{ teamName }`, 이동 = diff `{ parentTeamNo, displayOrder }`(제자리면 before = after), 삭제 = diff before `{ teamName, parentTeamNo }` + 하위 팀이 있을 때만 `meta.descendants: [{ teamNo, teamName }]`.
- 응답(공통 5): 트리 `{ items }` · 만들기 201 `{ teamNo }` · 이름 · 이동 · 삭제 `{}`.
- admin-shared 스키마에 객체 수준 `.refine()` 을 걸지 않는다(3b §11 R1). admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server 가 새 export 를 본다.
- 테스트: 단위 · DB 없는 HTTP 는 `*.test.ts`(`pnpm check`), 실 MariaDB 는 `*.db.test.ts`(Docker 컨테이너 `admin-kit-test-db` 가 떠 있어야 한다). 🔴 DB 테스트 하나만 돌리는 명령은 `pnpm --filter @ssworks/admin-server test:db <이름>` — `--` 를 넣으면 거르지 않는다. 단위는 `pnpm --filter <패키지> test <이름>`. lint 는 **루트 `pnpm lint`**(패키지에 lint 스크립트가 없다), 타입은 `pnpm --filter <패키지> typecheck`, 전체는 `pnpm check` · `pnpm test:db`.
- 🔴 DB 테스트는 앞 테스트의 잔여에 기대지 않는다 — 테스트마다 자기 시드 · 고유 이름을 쓴다. 🔴 **팀 이름은 대소문자 · 끝 공백만으로 가르지 않는다** — `teamName` 은 `utf8mb4_unicode_ci`(PAD SPACE)라 `'X-A'` 와 `'X-a'` 는 같은 이름이다(스펙 §14 R1-7, 프로브가 걸렸다). `seedRole(t.db)` 의 기본 권한은 `['*']` — 늘 `permissions` 를 명시한다.
- 🔴 원시 연결(`mariadb.createConnection`)은 `try/finally` 로 롤백 · 종료한다(`test-support/concurrency.ts` 의 `whileHeld` 가 한다). 기다리는 동안 거부될 수 있는 프로미스는 `settle` 로 바로 받아 둔다. 원시 SQL 의 식별자는 snake_case 다(`team_user_map` · `team_closure` · `guard_locks` — CamelCasePlugin 은 원시 연결을 거치지 않는다).
- 🔴 경합 테스트는 **공개 서비스 메서드**를 거친다(부품을 따로 부르면 순서 회귀를 못 잡는다). `whileHeld` 는 Task 1 이후 같은 데이터베이스의 잠금 대기를 보면 곧바로 커밋한다 — 고정 대기에 기대지 않는다.
- 의도한 `Logger.warn` 은 `vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)` 로 가두고 단언한다.
- 테스트 코드도 린트를 통과한다(쓰이지 않는 변수 · import 없음). bigint 가 든 본문은 supertest `.send(object)` 가 던지므로 admin-shared `stringifyJSON` 으로 보낸다(Task 9 `sendJson`).
- 셸: Windows(Git Bash) · Linux 양쪽. 🔴 출력을 `/dev/null` 로 보내지 않는다(Windows 에 `NUL` 파일이 생긴다) — 출력 억제 자체를 하지 않는다. 파일을 python · sed 로 다시 쓰지 않는다(LF). pnpm 설치는 짧은 `%TEMP%` 경로에서 한다.
- 🔴 도구 입력의 백슬래시 이스케이프는 JSON 으로 풀린다 — 새 코드 · 테스트에 백슬래시를 쓰지 않는다(정규식은 `[0-9]` 같은 문자 클래스, 줄바꿈 문자는 `String.fromCharCode(10)`). 백슬래시가 든 줄을 고쳤다면 `node -e` 와 `charCodeAt` 으로 그 자리 바이트를 확인한다.
- 플랜의 코드 블록은 prettier 를 거치지 않았다 — 커밋 전에 바꾼 파일에 `pnpm exec prettier --write <파일…>` 을 돌린다(줄 바꿈만 바뀐다). 마지막 Task 의 `pnpm format:check` 가 지킨다.
- 커밋: 한국어 conventional commits. 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `gh pr merge` · `pnpm release` · `npm publish` · `pnpm stage approve` 는 하지 않는다.

## Review Focus

스펙이 함의하지만 다른 테스트가 재지 않는, 사람이 가장 먼저 부딪힐 입력 다섯. 각 줄의 테스트를 담당 Task 에 넣었다.

1. **동률 · 빈 번호가 있는 시드 형제 사이의 ↑↓**(hangang 기본값 0 이 여럿, 10 · 20 · 30 같은 빈 번호) — admin-ui `siblingMove` 가 낸 요청대로 정확히 한 칸 움직이고, 한 번 움직인 묶음은 0..n-1 이 된다. → Task 6 "동률".
2. **앞뒤 공백 · 대소문자만 다른 팀 이름**(`' 영업팀 '` → `'영업팀'`, `'SALES'` vs `'sales'`) — 공백을 떼고 저장하고 409 `ERR_DUPLICATE_TEAM_NAME`. 자기 이름을 대소문자만 바꿔 다시 저장하면 통과. → Task 5 "중복", Task 9 HTTP.
3. **쓰는 쪽이 손으로 넣은 closure(자기 행 없음)** 위에서 하위 팀 만들기 · 이동 · 삭제 · 트리 — 패키지 결과가 같다. → Task 5 · 6 · 7 "자기 행 없는 시드".
4. **퇴사자만 남은 하위 팀째 지우기 · 두 팀에 걸친 한 계정** — 409 이고 `memberCount` 는 계정 수(1). → Task 7 "소속".
5. **최상위로 옮기기와 루트 사이 순서**(`parentTeamNo: null`, `beforeTeamNo` = 다른 루트) — 루트가 여럿인 트리에서 그 루트 앞에 선다. → Task 6 "최상위".

## 파일 구조

| 파일                                                                                                                                                                                         | 책임                                                                | Task |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---- |
| `packages/admin-server/src/test-support/lock-wait.ts` · `concurrency.ts` · `users/users.snapshot.db.test.ts`                                                                                 | STATUS 잠금 대기 파싱 · `whileHeld` 폴링 · 스냅샷 세션 단언(이월 4) | 1    |
| `packages/admin-shared/src/error-codes.ts` · `audit.ts`                                                                                                                                      | 팀 오류 코드 둘 · 팀 감사 액션 넷 · 대상 `team`                     | 2    |
| `packages/admin-server/src/database/guard-locks.ts` · `accounts/super-admin.ts` · `accounts/errors.ts` · `migrations/0010_team_tree_lock.ts` · `migrations/index.ts`                         | `lockGuardRow` · 가드 이름 · 장 0010                                | 3    |
| `packages/admin-server/src/teams/errors.ts` · `tree.ts` · `move.ts`                                                                                                                          | 문구 · 오류 만들기 · 트리 조립 · 이동 계획 · closure 쌍 — 순수      | 4    |
| `packages/admin-server/src/teams/team-locks.ts` · `teams.service.ts` · `test-support/teams.ts`                                                                                               | 잠금 읽기 조각 · 트리 · 만들기 · 이름 바꾸기 · 시드 도우미          | 5    |
| `packages/admin-server/src/teams/teams.service.ts`                                                                                                                                           | 이동 · 경합(b1 · b2 · c1 · s1)                                      | 6    |
| `packages/admin-server/src/teams/teams.service.ts` · `users/user-locks.ts`                                                                                                                   | 삭제 · 경합(a1 · a2) · `replaceTeam` 같은 팀 건너뛰기               | 7    |
| `packages/admin-server/src/teams/teams.controller.ts` · `teams.module.ts` · `auth/permission-slots.ts` · `admin-server.module.ts` · `index.ts` · `test-support/accounts.ts` · `admin-app.ts` | 다섯 라우트 · 모듈 · 슬롯 둘 · 배선                                 | 8    |
| `packages/admin-server/src/teams/teams.http.db.test.ts`                                                                                                                                      | 실 MariaDB HTTP 계약 · 감사 행                                      | 9    |
| `packages/admin-server/README.md` · `.changeset/admin-server-teams.md` · `docs/*` · `CLAUDE.md`                                                                                              | 문서 · 릴리스 · 스모크                                              | 10   |

**플랜 작성 중 확인한 것(스펙 §14 R1 에 이미 적었다):** 삭제 경합 · 이동 · 이름 UNIQUE · 스냅샷 1020 · Kysely 모양 실측, `innodb_trx` 폴링 불가와 STATUS 대안(R1-6). 프로브가 뜬 STATUS 출력 형식(절 머리 = 대시 줄 · 대문자 제목 · 대시 줄, 트랜잭션 블록 = `---TRANSACTION …` 으로 시작, 대기 블록에 `LOCK WAIT …` 줄과 `MariaDB thread id N`)이 Task 1 의 파서 · 단위 테스트 표본이다.

**권장 모델(Subagent-driven):** 구현 — Task 2 haiku(명세 확정 2파일 + 테스트), 나머지 sonnet. 리뷰 — Task 1 · 5 · 6 · 7(잠금 · 동시성 · closure) opus, 나머지 sonnet. 최종 whole-branch 리뷰 opus.

---

### Task 1: `whileHeld` 잠금 대기 폴링 · 스냅샷 세션 단언(이월 4)

**Files:**

- Create: `packages/admin-server/src/test-support/lock-wait.ts`
- Create: `packages/admin-server/src/test-support/lock-wait.test.ts`
- Modify: `packages/admin-server/src/test-support/concurrency.ts`(전체 교체)
- Create: `packages/admin-server/src/test-support/concurrency.db.test.ts`
- Modify: `packages/admin-server/src/users/users.snapshot.db.test.ts`(`snapshotKysely` 두 곳에 `await`)

**Interfaces:**

- Consumes: `TestDatabase`(`test-support/db.ts`), `testDbServer()`(`test-support/db-url.ts`), `adminPoolConfig` · `adminKyselyPlugins`.
- Produces:
  - `lockWaitThreadIds(status: string): string[]` — `SHOW ENGINE INNODB STATUS` 의 TRANSACTIONS 절에서 `LOCK WAIT` 블록의 thread id.
  - `lockWaitsIn(observer: Connection, database: string): Promise<number>`
  - `whileHeld<T>(t, hold, during, options?: { waiters?: number; timeoutMs?: number }): Promise<Settled<T>>` — 같은 데이터베이스에서 `waiters`(기본 1)개가 잠금을 기다리면 곧바로 커밋. 기다리지 않고 `during` 이 끝나도, `timeoutMs`(기본 5000)가 지나도 커밋.
  - 🔴 `snapshotKysely(t, snapshot): Promise<Kysely<AdminDatabase>>` — **이제 async**. 돌려주기 전에 풀의 연결 둘이 그 세션 값인지 단언한다.
  - `sleep` · `settle` · `Settled<T>` 는 그대로.

- [ ] **Step 1: 파서 단위 테스트를 쓴다**

`packages/admin-server/src/test-support/lock-wait.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { lockWaitThreadIds } from './lock-wait.js'

// 표본은 플랜 전 프로브가 뜬 MariaDB 11.4.13 출력을 줄인 것이다(2e 스펙 §14 R1-6). 🔴 교착 절에도 LOCK WAIT 와 thread id 가
// 남는다 — TRANSACTIONS 절만 읽어야 한다.
const NEWLINE = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)

const LINES = [
  '=====================================',
  '2026-10-14 11:57:20 0x7d09743af6c0 INNODB MONITOR OUTPUT',
  '=====================================',
  '------------------------',
  'LATEST DETECTED DEADLOCK',
  '------------------------',
  '2026-10-14 11:57:15 0x75095bfb46c0',
  '*** (1) TRANSACTION:',
  'TRANSACTION 207600, ACTIVE 0 sec inserting',
  'LOCK WAIT 3 lock struct(s), heap size 1128, 2 row lock(s)',
  'MariaDB thread id 6167, OS thread handle 1, query id 1 172.17.0.1 root Update',
  '------------',
  'TRANSACTIONS',
  '------------',
  'Trx id counter 207643',
  'LIST OF TRANSACTIONS FOR EACH SESSION:',
  '---TRANSACTION (0x7d09901b0c80), not started',
  '0 lock struct(s), heap size 1128, 0 row lock(s)',
  '---TRANSACTION 207642, ACTIVE 0 sec starting index read',
  'mysql tables in use 1, locked 1',
  'LOCK WAIT 2 lock struct(s), heap size 1128, 1 row lock(s)',
  'MariaDB thread id 6221, OS thread handle 137479560963776, query id 154452 172.17.0.1 root Statistics',
  'select * from t where id = 1 for update',
  '------- TRX HAS BEEN WAITING 207633 us FOR THIS LOCK TO BE GRANTED:',
  'RECORD LOCKS space id 8951 page no 3 n bits 320 index PRIMARY of table `akst`.`t` trx id 207642 lock_mode X locks rec but not gap waiting',
  '',
  '------------------',
  '---TRANSACTION 207641, ACTIVE 0 sec',
  '2 lock struct(s), heap size 1128, 1 row lock(s)',
  'MariaDB thread id 6220, OS thread handle 137479558198976, query id 154450 172.17.0.1 root ',
  '--------',
  'FILE I/O',
  '--------',
  'Pending flushes (fsync): 0',
]

describe('lockWaitThreadIds', () => {
  it('🔴 TRANSACTIONS 절의 대기 블록만 — 교착 절의 지난 대기 · 돌고 있는 트랜잭션은 뺀다', () => {
    expect(lockWaitThreadIds(LINES.join(NEWLINE))).toEqual(['6221'])
  })

  it('CRLF 줄바꿈도 읽는다', () => {
    expect(lockWaitThreadIds(LINES.join(CRLF))).toEqual(['6221'])
  })

  it('MySQL 표기(MySQL thread id)도 · 대기가 여럿이면 모두', () => {
    const lines = LINES.map((line) =>
      line.replace('MariaDB thread id 6220', 'MySQL thread id 6220'),
    )
    const index = lines.indexOf('2 lock struct(s), heap size 1128, 1 row lock(s)')
    lines.splice(index, 0, 'LOCK WAIT 2 lock struct(s), heap size 1128, 1 row lock(s)')
    expect(lockWaitThreadIds(lines.join(NEWLINE))).toEqual(['6221', '6220'])
  })

  it('TRANSACTIONS 절이 없으면 빈 배열', () => {
    expect(lockWaitThreadIds('')).toEqual([])
    expect(lockWaitThreadIds(LINES.slice(0, 11).join(NEWLINE))).toEqual([])
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test lock-wait`
Expected: FAIL — `Failed to resolve import "./lock-wait.js"`.

- [ ] **Step 3: 파서를 쓴다**

`packages/admin-server/src/test-support/lock-wait.ts`:

```ts
// 테스트 전용 — SHOW ENGINE INNODB STATUS 출력에서 행 잠금을 기다리는 스레드를 고른다(2e 스펙 이월 4 · §14 R1-6).
// 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 🔴 information_schema.innodb_trx(· innodb_lock_waits)를 쓰지 않는다 — InnoDB 가 서버 전역 캐시로 내고 마지막 읽기에서
//    0.1초가 지나지 않으면 새로 고치지 않는다. 병렬로 도는 테스트 파일이 서로의 폴링을 막고, 앞 테스트의 낡은 캐시가
//    "대기 중" 으로 보여 너무 일찍 커밋한다(프로브 실측). STATUS 는 캐시 없이 그 순간을 낸다.
// 🔴 TRANSACTIONS 절만 읽는다 — LATEST DETECTED DEADLOCK 절에 지난 교착의 thread id 와 LOCK WAIT 글자가 남는다.

const NEWLINE = String.fromCharCode(10)
const DASHES = /^-{4,}$/
const TITLE = /^[A-Z][A-Z0-9 /]*$/
const THREAD = /thread id ([0-9]+)/

/** 절 머리(대시 줄 · 대문자 제목 · 대시 줄)로 절을 나누고, TRANSACTIONS 절의 `LOCK WAIT` 트랜잭션 블록의 thread id 를 낸다 */
export function lockWaitThreadIds(status: string): string[] {
  const lines = status.split(NEWLINE).map((line) => line.trimEnd())
  const ids: string[] = []
  let inTransactions = false
  let block: string[] = []
  const flush = (): void => {
    if (block.some((line) => line.startsWith('LOCK WAIT'))) {
      const id = THREAD.exec(block.join(NEWLINE))?.[1]
      if (id !== undefined) ids.push(id)
    }
    block = []
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const title = lines[index + 1] ?? ''
    if (DASHES.test(line) && TITLE.test(title) && DASHES.test(lines[index + 2] ?? '')) {
      if (inTransactions) flush()
      inTransactions = title === 'TRANSACTIONS'
      index += 2
      continue
    }
    if (!inTransactions) continue
    if (line.startsWith('---TRANSACTION ')) flush()
    block.push(line)
  }
  if (inTransactions) flush()
  return ids
}
```

- [ ] **Step 4: 단위 GREEN**

Run: `pnpm --filter @ssworks/admin-server test lock-wait`
Expected: PASS(4 tests).

- [ ] **Step 5: `whileHeld` · 스냅샷 DB 테스트를 쓴다**

`packages/admin-server/src/test-support/concurrency.db.test.ts`:

```ts
import { sql } from 'kysely'
import { createConnection, type Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lockWaitsIn, sleep, snapshotKysely, whileHeld } from './concurrency.js'
import { createTestDatabase, type TestDatabase } from './db.js'
import { testDbServer } from './db-url.js'

// whileHeld 자체의 계약(2e 스펙 §9-3 [1] 이월 4). 행 하나(guardLocks 의 시험 행)를 원시 연결이 쥐고 푼다.

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
  await t.db
    .insertInto('guardLocks')
    .values({ lockName: 'heldProbe', description: 'start' })
    .execute()
})

afterAll(async () => {
  await t?.drop()
})

const holdWith = (value: string) => (connection: Connection) =>
  connection.query("update guard_locks set description = ? where lock_name = 'heldProbe'", [value])

const lockedRead = () =>
  t.db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('guardLocks')
      .select('description')
      .where('lockName', '=', 'heldProbe')
      .forUpdate()
      .executeTakeFirstOrThrow()
    return row.description
  })

const plainRead = async () =>
  (
    await t.db
      .selectFrom('guardLocks')
      .select('description')
      .where('lockName', '=', 'heldProbe')
      .executeTakeFirstOrThrow()
  ).description

describe('whileHeld', () => {
  it('🔴 during 이 잠금을 기다리기 시작하면 곧바로 커밋한다 — 기다린 뒤 커밋된 값을 본다', async () => {
    const started = Date.now()
    const result = await whileHeld(t, holdWith('held-1'), lockedRead)
    expect(result).toEqual({ ok: true, value: 'held-1' })
    // 대기를 못 보면 기본 5초 뒤에야 커밋한다
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('기다리지 않는 during 은 끝나는 대로 커밋한다 — 커밋 전 값을 읽었다', async () => {
    const started = Date.now()
    const result = await whileHeld(t, holdWith('held-2'), plainRead)
    expect(result).toEqual({ ok: true, value: 'held-1' })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(await plainRead()).toBe('held-2')
  })

  it('시간 초과면 커밋한 뒤 during 을 기다린다', async () => {
    const result = await whileHeld(
      t,
      holdWith('held-3'),
      async () => {
        await sleep(600)
        return plainRead()
      },
      { timeoutMs: 150 },
    )
    expect(result).toEqual({ ok: true, value: 'held-3' })
  })

  it('waiters — 그만큼이 다 기다릴 때까지 커밋하지 않는다', async () => {
    const result = await whileHeld(
      t,
      holdWith('held-4'),
      async () => {
        const started = Date.now()
        const first = lockedRead().then(() => Date.now() - started)
        await sleep(300)
        const second = lockedRead().then(() => Date.now() - started)
        return Promise.all([first, second])
      },
      { waiters: 2 },
    )
    if (!result.ok) throw result.error
    // 첫째는 둘째가 기다리기 시작한(300ms 뒤) 다음에야 풀렸다
    expect(result.value[0]).toBeGreaterThanOrEqual(250)
  })
})

describe('lockWaitsIn', () => {
  it('🔴 다른 데이터베이스(병렬 테스트 파일)의 대기는 세지 않는다', async () => {
    const other = await createTestDatabase()
    const open = (database: string) =>
      createConnection({ ...testDbServer(), database, timezone: 'Z' })
    const holder = await open(other.name)
    const waiter = await open(other.name)
    const observer = await open(t.name)
    try {
      await other.db
        .insertInto('guardLocks')
        .values({ lockName: 'otherProbe', description: 'x' })
        .execute()
      await holder.beginTransaction()
      await holder.query(
        "select lock_name from guard_locks where lock_name = 'otherProbe' for update",
      )
      await waiter.beginTransaction()
      const pending = waiter
        .query("select lock_name from guard_locks where lock_name = 'otherProbe' for update")
        .catch(() => undefined)
      let seen = 0
      for (let i = 0; i < 40 && seen === 0; i += 1) {
        seen = await lockWaitsIn(observer, other.name)
        if (seen === 0) await sleep(25)
      }
      expect(seen).toBe(1)
      expect(await lockWaitsIn(observer, t.name)).toBe(0)
      await holder.commit()
      await pending
    } finally {
      await holder.rollback().catch(() => undefined)
      await waiter.rollback().catch(() => undefined)
      for (const connection of [holder, waiter, observer]) await connection.end()
      await other.drop()
    }
  })
})

describe('snapshotKysely', () => {
  it('🔴 ON · OFF 를 연결마다 걸고, 돌려주기 전에 단언한다 — 전역 값은 그대로', async () => {
    const globalOf = async () =>
      Number(
        (await sql<{ v: number }>`select @@global.innodb_snapshot_isolation as v`.execute(t.db))
          .rows[0]?.v,
      )
    const before = await globalOf()
    for (const snapshot of [true, false]) {
      const db = await snapshotKysely(t, snapshot)
      try {
        const row = await sql<{
          v: number
        }>`select @@session.innodb_snapshot_isolation as v`.execute(db)
        expect(Number(row.rows[0]?.v)).toBe(snapshot ? 1 : 0)
      } finally {
        await db.destroy()
      }
    }
    expect(await globalOf()).toBe(before)
  })
})
```

- [ ] **Step 6: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db concurrency`
Expected: FAIL — `lockWaitsIn` 이 export 되지 않았다(`does not provide an export named 'lockWaitsIn'`).

- [ ] **Step 7: `concurrency.ts` 를 바꾼다**

`packages/admin-server/src/test-support/concurrency.ts` 전체:

```ts
import { MariadbDialect } from '@kim5257/kysely-mariadb-dialect'
import { Kysely, sql } from 'kysely'
import { createConnection, createPool, type Connection } from 'mariadb'
import { adminPoolConfig } from '../database/connection.js'
import { adminKyselyPlugins } from '../database/kysely.js'
import type { AdminDatabase } from '../database/types.js'
import type { TestDatabase } from './db.js'
import { testDbServer } from './db-url.js'
import { lockWaitThreadIds } from './lock-wait.js'

// 테스트 전용 — 경합 재현. 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 다른 트랜잭션이 행을 쥔 채로 있는 동안 서비스 메서드(공개 경로)를 부르고, 그 메서드가 잠금을 기다리기 시작하면 쥔 트랜잭션을
// 커밋한다 — 잠금 순서 · 읽기 뷰 회귀를 결정적으로 잰다(2d 스펙 §14 R7). 부품을 따로 부르면 순서 회귀를 못 잡는다.
// 바꾼 점(2e 스펙 이월 4 · §14 R1-6): 300ms 고정 대기 대신 잠금 대기를 본다 — 느린 CI 에서 서비스가 잠금에 닿기 전에 커밋해
//   경합을 재지 못하는 거짓 결과가 없다. 🔴 information_schema.innodb_trx 는 서버 전역 캐시라 쓰지 않는다(lock-wait.ts).

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

/** 🔴 기다리는 동안 거부돼도 "처리되지 않은 거부" 로 터지지 않게 바로 받아 둔다 */
export function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

const POLL_MS = 25
const SNAPSHOT_POOL_SIZE = 2

function openRaw(t: TestDatabase): Promise<Connection> {
  return createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
}

/**
 * 이 데이터베이스에서 행 잠금을 기다리는 연결 수 — SHOW ENGINE INNODB STATUS 의 대기 thread id ∩ processlist 의
 * `db = database`. 🔴 PROCESS 권한이 필요하다(로컬 컨테이너 · CI 모두 root).
 */
export async function lockWaitsIn(observer: Connection, database: string): Promise<number> {
  const rows = (await observer.query('show engine innodb status')) as { Status?: string }[]
  const ids = lockWaitThreadIds(rows[0]?.Status ?? '')
  if (ids.length === 0) return 0
  const found = (await observer.query(
    'select count(*) as n from information_schema.processlist where db = ? and id in (?)',
    [database, ids],
  )) as { n: bigint | number }[]
  return Number(found[0]?.n ?? 0)
}

export interface WhileHeldOptions {
  /** 같은 데이터베이스에서 이만큼의 연결이 잠금을 기다리면 커밋한다. 기본 1 */
  waiters?: number
  /** 이 시간 안에 대기를 못 보면 그래도 커밋한다. 기본 5000ms */
  timeoutMs?: number
}

/**
 * 원시 연결이 트랜잭션을 열고 `hold` 로 잠금 · 쓰기를 쥔 채 `during()` 을 시작한다. 같은 데이터베이스에서 `waiters` 개의 연결이
 * 잠금을 기다리기 시작하면 — 또는 `during()` 이 기다리지 않고 끝나면, 또는 `timeoutMs` 가 지나면 — 그 트랜잭션을 커밋하고
 * `during()` 의 결과를 돌려준다. 🔴 실패해도 롤백 · 종료한다 — 쥔 잠금이 남으면 afterAll 의 DROP DATABASE 가 막힌다.
 */
export async function whileHeld<T>(
  t: TestDatabase,
  hold: (connection: Connection) => Promise<unknown>,
  during: () => Promise<T>,
  options: WhileHeldOptions = {},
): Promise<Settled<T>> {
  const waiters = options.waiters ?? 1
  const deadline = Date.now() + (options.timeoutMs ?? 5000)
  const connection = await openRaw(t)
  const observer = await openRaw(t)
  try {
    await connection.beginTransaction()
    await hold(connection)
    let finished = false
    const pending = settle(during()).then((result) => {
      finished = true
      return result
    })
    while (!finished && Date.now() < deadline) {
      if ((await lockWaitsIn(observer, t.name)) >= waiters) break
      await sleep(POLL_MS)
    }
    await connection.commit()
    return await pending
  } finally {
    await connection.rollback().catch(() => undefined)
    await connection.end()
    await observer.end()
  }
}

/**
 * innodb_snapshot_isolation 을 이 풀의 연결마다 켠(끈) Kysely — MariaDB 11.6.2+ 의 기본(ON)을 11.4 에서 잰다(2d §14 R7-8).
 * 🔴 SET GLOBAL 을 쓰지 않는다 — 테스트 파일은 같은 서버에서 병렬로 돈다. 다 쓰면 destroy() 한다.
 * 🔴 돌려주기 전에 풀의 연결 둘을 동시에 붙잡아 세션 값을 단언한다(풀 데우기 — 2e 이월 4). initSql 이 빠진 연결이 섞이면
 *    ON 을 잰다고 믿은 테스트가 OFF 를 잰다.
 */
export async function snapshotKysely(
  t: TestDatabase,
  snapshot: boolean,
): Promise<Kysely<AdminDatabase>> {
  const db = new Kysely<AdminDatabase>({
    dialect: new MariadbDialect({
      pool: createPool({
        ...adminPoolConfig({
          ...testDbServer(),
          database: t.name,
          connectionLimit: SNAPSHOT_POOL_SIZE,
        }),
        initSql: `set session innodb_snapshot_isolation = ${snapshot ? 'ON' : 'OFF'}`,
      }),
    }),
    plugins: adminKyselyPlugins(),
  })
  try {
    const values = await sessionSnapshotValues(db, SNAPSHOT_POOL_SIZE)
    const expected = snapshot ? 1 : 0
    if (values.some((value) => value !== expected)) {
      throw new Error(
        `innodb_snapshot_isolation 세션 값이 ${expected} 이 아니다: ${values.join(', ')}`,
      )
    }
    return db
  } catch (error) {
    await db.destroy()
    throw error
  }
}

/** 풀의 연결 n 개를 동시에 붙잡고(서로를 기다린다) 각자의 세션 값을 읽는다 */
async function sessionSnapshotValues(
  db: Kysely<AdminDatabase>,
  connections: number,
): Promise<number[]> {
  let arrived = 0
  let release: () => void = () => undefined
  const together = new Promise<void>((resolve) => {
    release = resolve
  })
  return Promise.all(
    Array.from({ length: connections }, () =>
      db.connection().execute(async (connection) => {
        const result = await sql<{
          value: number | bigint | string
        }>`select @@session.innodb_snapshot_isolation as value`.execute(connection)
        arrived += 1
        if (arrived === connections) release()
        await together
        return Number(result.rows[0]?.value)
      }),
    ),
  )
}
```

- [ ] **Step 8: 스냅샷 테스트의 호출 둘을 고친다**

`packages/admin-server/src/users/users.snapshot.db.test.ts` 의 `const db = snapshotKysely(t, true)` 와 `const db = snapshotKysely(t, false)` 를 각각 `const db = await snapshotKysely(t, true)` · `const db = await snapshotKysely(t, false)` 로 바꾼다(그 밖은 그대로).

- [ ] **Step 9: GREEN — 새 테스트와 기존 경합 테스트 넷**

Run:

```bash
pnpm --filter @ssworks/admin-server test:db concurrency
pnpm --filter @ssworks/admin-server test:db snapshot
pnpm --filter @ssworks/admin-server test:db roles.order
pnpm --filter @ssworks/admin-server test:db employment
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: 모두 PASS. 기존 `whileHeld` 호출 넷(`roles.order` · `users.employment` · `users.snapshot` 둘)은 인자를 바꾸지 않았고 그대로 초록이다 — 그 테스트들의 `during` 은 잠금을 기다리므로 이제 대기를 본 즉시 커밋된다.

🔴 RED 한 번 더: `lockWaitsIn` 의 `show engine innodb status` 를 `select count(*) as n from information_schema.innodb_trx where trx_state = 'LOCK WAIT'` 로 바꾸고(id 거르기는 빼고 `Number(rows[0].n)` 을 돌려준다) `concurrency` 를 두세 번 돌린다 — "다른 데이터베이스" 테스트가 실패하거나 첫 테스트가 2초를 넘는다(캐시). 보고서에 적고 되돌린다.

- [ ] **Step 10: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/test-support/lock-wait.ts packages/admin-server/src/test-support/lock-wait.test.ts packages/admin-server/src/test-support/concurrency.ts packages/admin-server/src/test-support/concurrency.db.test.ts packages/admin-server/src/users/users.snapshot.db.test.ts
git add packages/admin-server/src/test-support/lock-wait.ts packages/admin-server/src/test-support/lock-wait.test.ts packages/admin-server/src/test-support/concurrency.ts packages/admin-server/src/test-support/concurrency.db.test.ts packages/admin-server/src/users/users.snapshot.db.test.ts
git commit -m "test(admin-server): whileHeld 가 잠금 대기를 보고 커밋한다 — STATUS 파싱 · 스냅샷 세션 단언(2e 이월 4)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: admin-shared — 팀 오류 코드 둘 · 팀 감사 액션 넷

**Files:**

- Modify: `packages/admin-shared/src/error-codes.ts` · `error-codes.test.ts`
- Modify: `packages/admin-shared/src/audit.ts` · `audit.test.ts`

**Interfaces:**

- Produces: `CommonErrorCodes.ERR_TEAM_HAS_MEMBERS`(409) · `CommonErrorCodes.ERR_TEAM_MOVE_CYCLE`(400), `CoreAuditActions.TEAM_CREATE` = `'org.team.create'` · `TEAM_UPDATE` = `'org.team.update'` · `TEAM_DELETE` = `'org.team.delete'` · `TEAM_MOVE` = `'org.team.move'`, `CoreAuditTargets.TEAM` = `'team'`.

- [ ] **Step 1: 테스트를 고친다(RED)**

`packages/admin-shared/src/error-codes.test.ts` — `describe('CommonErrorCodes — 코어 코드 표', …)` 안 마지막 `it` 뒤에 더한다:

```ts
it('팀 전용 코드(2e) — 소속 있는 삭제 409 · 순환 이동 400(hangang 의 ERR_COMMON_CONFLICT 를 나눈다)', () => {
  expect(CommonErrorCodes.ERR_TEAM_HAS_MEMBERS).toBe('ERR_TEAM_HAS_MEMBERS')
  expect(CommonErrorCodes.ERR_TEAM_MOVE_CYCLE).toBe('ERR_TEAM_MOVE_CYCLE')
  expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_TEAM_HAS_MEMBERS]).toBe(409)
  expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_TEAM_MOVE_CYCLE]).toBe(400)
})
```

`packages/admin-shared/src/audit.test.ts`:

① 첫 `it` 을 바꾼다:

```ts
it('🔴 액션 29 · 대상 4 · 라벨이 하나씩 — 개수는 이 테스트가 고정한다(산문의 개수는 낡는다)', () => {
  expect(Object.values(CoreAuditActions)).toHaveLength(29)
  expect(Object.values(CoreAuditTargets)).toEqual(['user', 'session', 'role', 'team'])
  expect(Object.keys(CORE_AUDIT_ACTION_LABELS).sort()).toEqual(
    [...Object.values(CoreAuditActions)].sort(),
  )
  expect(Object.keys(CORE_AUDIT_TARGET_LABELS).sort()).toEqual(['role', 'session', 'team', 'user'])
})
```

② `it('사용자 액션(2d-2) …')` 뒤에 더한다:

```ts
it('팀 액션(2e-1) — hangang 이름 org.team.* 와 라벨', () => {
  expect([
    CoreAuditActions.TEAM_CREATE,
    CoreAuditActions.TEAM_UPDATE,
    CoreAuditActions.TEAM_DELETE,
    CoreAuditActions.TEAM_MOVE,
  ]).toEqual(['org.team.create', 'org.team.update', 'org.team.delete', 'org.team.move'])
  expect(coreAuditCatalog.labelOf('org.team.create')).toBe('팀 생성')
  expect(coreAuditCatalog.labelOf('org.team.update')).toBe('팀 수정')
  expect(coreAuditCatalog.labelOf('org.team.delete')).toBe('팀 삭제')
  expect(coreAuditCatalog.labelOf('org.team.move')).toBe('팀 이동')
  expect(coreAuditCatalog.targetLabelOf('team')).toBe('팀')
})
```

③ `describe('defineAuditCatalog')` 의 첫 `it` 에서 `toHaveLength(26)` 을 `toHaveLength(30)` 으로, `toEqual(['user', 'session', 'role', 'post'])` 를 `toEqual(['user', 'session', 'role', 'team', 'post'])` 로 바꾼다.

Run: `pnpm --filter @ssworks/admin-shared test`
Expected: FAIL — `ERR_TEAM_HAS_MEMBERS` 가 `undefined`, 액션 25 ≠ 29 등.

- [ ] **Step 2: 코드를 더한다**

`packages/admin-shared/src/error-codes.ts`:

`CommonErrorCodes` 의 `ERR_DUPLICATE_TEAM_NAME: 'ERR_DUPLICATE_TEAM_NAME',` 다음 줄에:

```ts
  /** 하위 팀까지 포함해 소속 계정이 있어 팀을 지울 수 없다 — `details.memberCount`(계정 수) */
  ERR_TEAM_HAS_MEMBERS: 'ERR_TEAM_HAS_MEMBERS',
  /** 팀을 자기 자신 · 하위 팀 아래로 옮기려 했다 — 클라이언트가 막지 못한 요청(400) */
  ERR_TEAM_MOVE_CYCLE: 'ERR_TEAM_MOVE_CYCLE',
```

`COMMON_ERROR_STATUS` 의 `[CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME]: 409,` 다음 줄에:

```ts
  [CommonErrorCodes.ERR_TEAM_HAS_MEMBERS]: 409,
  [CommonErrorCodes.ERR_TEAM_MOVE_CYCLE]: 400,
```

`packages/admin-shared/src/audit.ts`:

① 머리 주석의 ``//  - 코어 액션은 인증 · 세션(2c) · 역할 · 사용자(2d). 팀 · IP 액션은 2e · 2f 가 더한다. 프로젝트 액션은 `defineAuditCatalog`.`` 줄을 바꾼다:

```ts
//  - 코어 액션은 인증 · 세션(2c) · 역할 · 사용자(2d) · 팀(2e-1). 약관 · IP 액션은 2e-2 · 2f 가 더한다. 프로젝트 액션은 `defineAuditCatalog`.
```

② `CoreAuditActions` 의 `USER_UNLOCK: 'org.user.unlock',` 다음 줄에:

```ts
  TEAM_CREATE: 'org.team.create',
  TEAM_UPDATE: 'org.team.update',
  TEAM_DELETE: 'org.team.delete',
  TEAM_MOVE: 'org.team.move',
```

③ `CoreAuditTargets` 를 바꾼다:

```ts
export const CoreAuditTargets = {
  USER: 'user',
  SESSION: 'session',
  ROLE: 'role',
  TEAM: 'team',
} as const
```

④ `CORE_AUDIT_ACTION_LABELS` 의 `'org.user.unlock': '잠금 해제',` 다음 줄에:

```ts
  'org.team.create': '팀 생성',
  'org.team.update': '팀 수정',
  'org.team.delete': '팀 삭제',
  'org.team.move': '팀 이동',
```

⑤ `CORE_AUDIT_TARGET_LABELS` 의 `role: '역할',` 다음 줄에 `team: '팀',`.

- [ ] **Step 3: GREEN · 빌드**

```bash
pnpm --filter @ssworks/admin-shared test
pnpm --filter @ssworks/admin-shared typecheck
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server test
```

Expected: 모두 PASS. admin-server 단위 테스트는 코어 카탈로그를 쓰는 감사 모듈 테스트까지 초록이다(액션이 늘기만 했다).

- [ ] **Step 4: 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/error-codes.ts packages/admin-shared/src/error-codes.test.ts packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts
git add packages/admin-shared/src/error-codes.ts packages/admin-shared/src/error-codes.test.ts packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts
git commit -m "feat(admin-shared): 팀 오류 코드 ERR_TEAM_HAS_MEMBERS · ERR_TEAM_MOVE_CYCLE · 팀 감사 액션 org.team.* · 대상 team" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 가드 행 잠금 함수 하나로 · 장 `0010_team_tree_lock`

**Files:**

- Create: `packages/admin-server/src/database/guard-locks.ts`
- Create: `packages/admin-server/src/database/guard-locks.db.test.ts`
- Modify: `packages/admin-server/src/accounts/super-admin.ts` · `accounts/errors.ts` · `accounts/super-admin.db.test.ts`
- Create: `packages/admin-server/src/database/migrations/0010_team_tree_lock.ts`
- Modify: `packages/admin-server/src/database/migrations/index.ts` · `index.test.ts` · `ddl.test.ts`

**Interfaces:**

- Produces:
  - `GUARD_LOCK_TEAM_TREE = 'teamTree'`
  - `GUARD_MESSAGES = { missing: '동시성 보호 설정이 없어 처리할 수 없습니다.' }`
  - `lockGuardRow(trx: Transaction<AdminDatabase>, lockName: string): Promise<void>` — 행이 없으면 500 `ERR_COMMON_INTERNAL` `GUARD_MESSAGES.missing` + `details.lockName`.
  - 장 `0010_team_tree_lock`(시드 한 줄), `ADMIN_MIGRATIONS` 열 개.
- 바뀌지 않는 것: `lockSuperAdminGuard(trx)` · `GUARD_LOCK_SUPER_ADMIN` · `withSuperAdminSurvival` 의 동작과 문구.

- [ ] **Step 1: 테스트를 쓴다 · 고친다(RED)**

`packages/admin-server/src/database/guard-locks.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GUARD_LOCK_SUPER_ADMIN } from '../accounts/super-admin.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { GUARD_LOCK_TEAM_TREE, GUARD_MESSAGES, lockGuardRow } from './guard-locks.js'

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

describe('guardLocks 시드 행', () => {
  it('🔴 장의 리터럴과 이름 상수가 같다 — 잔존(0009) · 팀 트리(0010)', async () => {
    const rows = await t.db
      .selectFrom('guardLocks')
      .select('lockName')
      .orderBy('lockName')
      .execute()
    expect(rows).toEqual([{ lockName: GUARD_LOCK_SUPER_ADMIN }, { lockName: GUARD_LOCK_TEAM_TREE }])
  })
})

describe('lockGuardRow', () => {
  it('행이 있으면 잡고 끝난다', async () => {
    await expect(
      t.db.transaction().execute((trx) => lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)),
    ).resolves.toBeUndefined()
  })

  it('🔴 행이 없으면 500 ERR_COMMON_INTERNAL + details.lockName — 조용히 보호 없이 쓰지 않는다', async () => {
    const error = await t.db
      .transaction()
      .execute((trx) => lockGuardRow(trx, 'noSuchLock'))
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_INTERNAL)
    expect((error as BusinessError).message).toBe(GUARD_MESSAGES.missing)
    expect((error as BusinessError).details).toEqual({ lockName: 'noSuchLock' })
  })
})
```

`packages/admin-server/src/accounts/super-admin.db.test.ts`:

- `describe('센티넬 행')` 의 단언을 그 행만 보게 바꾼다(이제 guardLocks 에 행이 둘이다):

```ts
it('장의 리터럴과 잠금 함수의 이름이 같다', async () => {
  expect(
    await t.db
      .selectFrom('guardLocks')
      .select('lockName')
      .where('lockName', '=', GUARD_LOCK_SUPER_ADMIN)
      .execute(),
  ).toEqual([{ lockName: GUARD_LOCK_SUPER_ADMIN }])
})
```

- "센티넬 행이 없으면 500" 테스트에서 `await u.db.deleteFrom('guardLocks').execute()` 를 `await u.db.deleteFrom('guardLocks').where('lockName', '=', GUARD_LOCK_SUPER_ADMIN).execute()` 로, `expect((error as BusinessError).message).toBe(ACCOUNT_MESSAGES.guardMissing)` 를 `expect((error as BusinessError).message).toBe(GUARD_MESSAGES.missing)` 로 바꾸고, import 에 `import { GUARD_MESSAGES } from '../database/guard-locks.js'` 를 더한다. 그 뒤 `ACCOUNT_MESSAGES` 를 다른 곳에서 쓰지 않으면 그 import 를 지운다(`pnpm lint` 가 알려 준다).

`packages/admin-server/src/database/migrations/index.test.ts`:

① 첫 `it` 을 바꾼다:

```ts
it('0001~0010 순서', () => {
  expect(ADMIN_MIGRATIONS).toEqual([
    '0001_roles',
    '0002_users',
    '0003_teams',
    '0004_team_closure',
    '0005_team_user_map',
    '0006_user_employment_periods',
    '0007_sessions',
    '0008_audit_logs',
    '0009_guard_locks',
    '0010_team_tree_lock',
  ])
})
```

② ``const all = ADMIN_MIGRATIONS.map((id, index) => ({ id, file: `00${index + 1}_admin.ts` }))`` 를 바꾼다 — 🔴 열 번째 장에서 `0010_admin.ts` 가 `001_admin.ts` 와 `002_admin.ts` 사이로 정렬된다:

```ts
const all = ADMIN_MIGRATIONS.map((id, index) => ({
  id,
  file: `${String(index + 1).padStart(3, '0')}_admin.ts`,
}))
```

③ "순서 어긋남" 테스트의 기대 문자열 두 군데에서 `0009_guard_locks` 뒤에 `, 0010_team_tree_lock` 을 더한다:

```ts
expect(findStubProblems(swapped)).toEqual([
  '파일 이름 순서가 장 순서와 다르다 — 지금: 0002_users, 0001_roles, 0003_teams, 0004_team_closure, ' +
    '0005_team_user_map, 0006_user_employment_periods, 0007_sessions, 0008_audit_logs, 0009_guard_locks, 0010_team_tree_lock / 맞는 순서: 0001_roles, ' +
    '0002_users, 0003_teams, 0004_team_closure, 0005_team_user_map, 0006_user_employment_periods, 0007_sessions, ' +
    '0008_audit_logs, 0009_guard_locks, 0010_team_tree_lock',
])
```

④ `writeStubs` 의 파일 이름도 세 자리로(같은 정렬 이유):

```ts
function writeStubs(ids: readonly string[]): void {
  ids.forEach((id, index) => {
    writeFileSync(
      join(dir, `${String(index + 1).padStart(3, '0')}_admin_${id.slice(5)}.migration.ts`),
      `export { up, down } from '@ssworks/admin-server/migrations/${id}'\n`,
    )
  })
}
```

(위 `'\n'` 은 이미 있는 줄이다 — 그 줄은 그대로 두고 이름 식만 바꾼다.)

`packages/admin-server/src/database/migrations/ddl.test.ts`: import 에 `import * as teamTreeLock from './0010_team_tree_lock.js'` 를, `CHAPTERS` 끝에 `['0010_team_tree_lock', teamTreeLock],` 를 더하고, `describe('0009_guard_locks')` 뒤에 더한다:

```ts
describe('0010_team_tree_lock', () => {
  it('guardLocks 에 시드 한 줄 — 표를 만들지 않는다(2e 스펙 ⑪ A1)', async () => {
    const statements = await capture((db) => teamTreeLock.up(db))
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^insert into `guard_locks`/)
  })

  it('down 은 그 행만 지운다', async () => {
    const statements = await capture((db) => teamTreeLock.down(db))
    expect(statements).toEqual(['delete from `guard_locks` where `lock_name` = ?'])
  })
})
```

Run: `pnpm --filter @ssworks/admin-server test migrations` · `pnpm --filter @ssworks/admin-server test:db guard-locks`
Expected: FAIL — `./0010_team_tree_lock.js` · `./guard-locks.js` 를 찾지 못한다.

- [ ] **Step 2: 가드 잠금 함수를 쓴다**

`packages/admin-server/src/database/guard-locks.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Transaction } from 'kysely'
import type { AdminDatabase } from './types.js'

// 정본: 2d accounts/super-admin.ts lockSuperAdminGuard(hangang-home core/permissions/monotonicity.ts lockSuperAdminGuard)
// 바꾼 점: 잠금 이름을 인자로 받는다 — 잔존(2d) · 팀 트리(2e-1) · 약관 발행(2e-2)이 함께 쓴다(2e 스펙 B2).
// 🔴 행 하나가 직렬화 지점 하나다. 한 트랜잭션은 guardLocks 행을 둘 이상 잡지 않는다(0009 장 주석) — 2f 가 둘을 잡아야 하면
//    이름의 고정 순서를 그때 정한다(2e 스펙 §5-1).
// 🔴 부르는 쪽은 트랜잭션의 첫 문장으로 부른다 — 앞선 비잠금 SELECT 가 읽기 뷰를 먼저 열면 그 뒤 셈 · 읽기가 낡고, 스냅샷 격리
//    ON 에서는 잠금 읽기가 1020 을 만난다(2d 스펙 §14 R1-3a · 2e §14 R1-7).

/** 장 0010 의 시드 행 이름 — 장은 리터럴로 넣는다(같은 값인지는 guard-locks.db.test.ts 가 잰다) */
export const GUARD_LOCK_TEAM_TREE = 'teamTree'

export const GUARD_MESSAGES = Object.freeze({
  missing: '동시성 보호 설정이 없어 처리할 수 없습니다.',
})

export async function lockGuardRow(
  trx: Transaction<AdminDatabase>,
  lockName: string,
): Promise<void> {
  const row = await trx
    .selectFrom('guardLocks')
    .select('lockName')
    .where('lockName', '=', lockName)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) {
    // 🔴 장이 빠졌다 — 조용히 보호 없이 쓰지 않는다(hangang fail-loud). 스텁 검사가 먼저 막는다.
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_INTERNAL, GUARD_MESSAGES.missing, {
      lockName,
    })
  }
}
```

`packages/admin-server/src/accounts/super-admin.ts` — `lockSuperAdminGuard` 를 바꾸고 import 를 정리한다:

```ts
import { lockGuardRow } from '../database/guard-locks.js'
```

```ts
export async function lockSuperAdminGuard(trx: Transaction<AdminDatabase>): Promise<void> {
  await lockGuardRow(trx, GUARD_LOCK_SUPER_ADMIN)
}
```

(`BusinessError` · `CommonErrorCodes` 는 `assertSuperAdminSurvives` 가 계속 쓴다. 머리 주석의 🔴 셋은 그대로 둔다.)

`packages/admin-server/src/accounts/errors.ts` — `guardMissing: '동시성 보호 설정이 없어 처리할 수 없습니다.',` 줄을 지운다(문구는 `GUARD_MESSAGES.missing` 하나).

- [ ] **Step 3: 장을 쓴다**

`packages/admin-server/src/database/migrations/0010_team_tree_lock.ts`:

```ts
import type { Kysely } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/migrations/013_guard_lock_super_admin_seed.migration.ts(시드 한 줄 장)
// 바꾼 점: 팀 트리 직렬화 행(2e 스펙 ① G1 · ⑪ A1). 인자 타입 Kysely<unknown>(2a R2).
// 🔴 이름은 상수 import 없이 리터럴이다 — 장은 한 번 적용되면 고정이다. database/guard-locks.ts 의 GUARD_LOCK_TEAM_TREE 와
//    같은 값인지는 guard-locks.db.test.ts 가 잰다.
// 🔴 0009 를 고치지 않고 새 장으로 넣는다 — 이미 장을 돌린 DB 도 migrate 한 번으로 따라온다(⑪ A1).

type GuardLocks = { guardLocks: { lockName: string; description: string } }

export async function up(db: Kysely<unknown>): Promise<void> {
  await db
    .withTables<GuardLocks>()
    .insertInto('guardLocks')
    .values({
      lockName: 'teamTree',
      description:
        '팀 트리 구조를 바꾸는 쓰기(만들기 · 이름 바꾸기 · 이동 · 삭제)를 직렬화한다. 각 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다',
    })
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db
    .withTables<GuardLocks>()
    .deleteFrom('guardLocks')
    .where('lockName', '=', 'teamTree')
    .execute()
}
```

`packages/admin-server/src/database/migrations/index.ts`:

- import 줄 `import * as guardLocks from './0009_guard_locks.js'` 다음에 `import * as teamTreeLock from './0010_team_tree_lock.js'`.
- `ADMIN_MIGRATIONS` 의 `'0009_guard_locks',` 다음에 `'0010_team_tree_lock',`.
- `CHAPTERS` 의 `'0009_guard_locks': guardLocks,` 다음에 `'0010_team_tree_lock': teamTreeLock,`.

- [ ] **Step 4: GREEN**

```bash
pnpm --filter @ssworks/admin-server test migrations
pnpm --filter @ssworks/admin-server test:db guard-locks
pnpm --filter @ssworks/admin-server test:db super-admin
pnpm --filter @ssworks/admin-server test:db migrations
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: 모두 PASS. `migrations.db.test.ts` 는 `ADMIN_MIGRATIONS.length` 로 세므로 열 장 up → down → up 이 그대로 초록이다(새 표가 없어 `CORE_TABLES` 도 그대로). `runner-graph.test.ts` 도 초록(새 장은 `kysely` 만 import).

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/database/guard-locks.ts packages/admin-server/src/database/guard-locks.db.test.ts packages/admin-server/src/accounts/super-admin.ts packages/admin-server/src/accounts/errors.ts packages/admin-server/src/accounts/super-admin.db.test.ts packages/admin-server/src/database/migrations/0010_team_tree_lock.ts packages/admin-server/src/database/migrations/index.ts packages/admin-server/src/database/migrations/index.test.ts packages/admin-server/src/database/migrations/ddl.test.ts
git add packages/admin-server/src/database/guard-locks.ts packages/admin-server/src/database/guard-locks.db.test.ts packages/admin-server/src/accounts/super-admin.ts packages/admin-server/src/accounts/errors.ts packages/admin-server/src/accounts/super-admin.db.test.ts packages/admin-server/src/database/migrations/0010_team_tree_lock.ts packages/admin-server/src/database/migrations/index.ts packages/admin-server/src/database/migrations/index.test.ts packages/admin-server/src/database/migrations/ddl.test.ts
git commit -m "feat(admin-server): 가드 행 잠금 lockGuardRow 하나로 · 장 0010_team_tree_lock(팀 트리 직렬화 행)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 팀 순수 함수 — 문구 · 트리 조립 · 이동 계획 · closure 쌍

**Files:**

- Create: `packages/admin-server/src/teams/errors.ts`
- Create: `packages/admin-server/src/teams/tree.ts` · `tree.test.ts`
- Create: `packages/admin-server/src/teams/move.ts` · `move.test.ts`

**Interfaces:**

- Produces:
  - `TEAM_MESSAGES`(Global Constraints 의 일곱 문구), `noTeam()` · `noParentTeam()` · `duplicateTeamName()` · `teamHasMembers(memberCount: number)` · `moveCycle()` · `beforeTeamError(message: string)` — 모두 `BusinessError`.
  - `TeamTreeRow = { teamNo: bigint; teamName: string; displayOrder: number; parentTeamNo: bigint | null }`, `buildTeamTree(rows: readonly TeamTreeRow[]): { items: AdminTeamNode[]; warnings: string[] }`.
  - `SiblingOrder = { teamNo: bigint; displayOrder: number }`, `compareOrder(a, b): number`, `TeamMovePlan = { unchanged: boolean; targetOrder: number; updates: SiblingOrder[] }`, `planTeamMove(siblings, target, beforeTeamNo, sameParent): TeamMovePlan`.
  - `ClosureLink = { teamNo: bigint; depth: number }`, `ClosureRow = { ancestorNo: bigint; descendantNo: bigint; depth: number }`, `closurePairs(ancestors, subtree): ClosureRow[]`.

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/teams/tree.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildTeamTree, type TeamTreeRow } from './tree.js'

const row = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  parentTeamNo: number | null,
): TeamTreeRow => ({
  teamNo: BigInt(teamNo),
  teamName,
  displayOrder,
  parentTeamNo: parentTeamNo === null ? null : BigInt(parentTeamNo),
})

/** 이름 · 자식만 — 'R1(A(a),B)' 꼴 */
const shape = (nodes: ReturnType<typeof buildTeamTree>['items']): string =>
  nodes
    .map((node) =>
      node.children.length === 0 ? node.teamName : `${node.teamName}(${shape(node.children)})`,
    )
    .join(',')

describe('buildTeamTree', () => {
  it('빈 목록은 [] · 경고 없음', () => {
    expect(buildTeamTree([])).toEqual({ items: [], warnings: [] })
  })

  it('루트가 여럿 · 깊이 · 노드 모양(teamNo · teamName · displayOrder · children)', () => {
    const { items, warnings } = buildTeamTree([
      row(1, 'R1', 0, null),
      row(2, 'A', 0, 1),
      row(4, 'a', 0, 2),
      row(3, 'R2', 1, null),
    ])
    expect(warnings).toEqual([])
    expect(shape(items)).toBe('R1(A(a)),R2')
    expect(items[1]).toEqual({ teamNo: 3n, teamName: 'R2', displayOrder: 1, children: [] })
  })

  it('형제는 받은 행 순서 그대로(쿼리가 displayOrder · teamNo 순으로 준다)', () => {
    const { items } = buildTeamTree([
      row(1, 'P', 0, null),
      row(9, 'first', 0, 1),
      row(5, 'second', 1, 1),
    ])
    expect(shape(items)).toBe('P(first,second)')
  })

  it('깊이 1 조상이 둘(손상)이면 작은 번호를 상위 팀으로 쓰고 경고한다', () => {
    const { items, warnings } = buildTeamTree([
      row(1, 'P1', 0, null),
      row(2, 'P2', 1, null),
      row(5, 'X', 0, 1),
      row(5, 'X', 0, 2),
    ])
    expect(shape(items)).toBe('P1(X),P2')
    expect(warnings).toEqual([
      '팀 5 의 상위 팀(closure 깊이 1 행)이 둘 이상이다 — 작은 번호 1 을 쓴다',
    ])
  })

  it('🔴 상위 팀이 목록에 없거나 순환이면 경고하고 내지 않는다 — 끝난다', () => {
    const { items, warnings } = buildTeamTree([
      row(1, 'R', 0, null),
      row(7, 'orphan', 0, 99),
      row(10, 'p', 0, 11),
      row(11, 'q', 0, 10),
    ])
    expect(shape(items)).toBe('R')
    expect(warnings).toEqual([
      '팀 7 의 상위 팀 99 가 목록에 없다 — 내지 않는다',
      '팀 10 이 루트에서 닿지 않는다(closure 순환) — 내지 않는다',
      '팀 11 이 루트에서 닿지 않는다(closure 순환) — 내지 않는다',
    ])
  })
})
```

`packages/admin-server/src/teams/move.test.ts`:

```ts
import { findTeamPlacement, siblingMove, type AdminTeamNode } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { closurePairs, compareOrder, planTeamMove, type SiblingOrder } from './move.js'

const node = (teamNo: number, displayOrder: number): AdminTeamNode => ({
  teamNo: BigInt(teamNo),
  teamName: `t${teamNo}`,
  displayOrder,
  children: [],
})

const sib = (teamNo: number, displayOrder: number): SiblingOrder => ({
  teamNo: BigInt(teamNo),
  displayOrder,
})

/** 받는 형제(대상 제외)를 서버와 같은 순으로 */
const siblingsOf = (nodes: readonly AdminTeamNode[], exclude: bigint): SiblingOrder[] =>
  nodes
    .filter((n) => n.teamNo !== exclude)
    .map((n) => sib(Number(n.teamNo), n.displayOrder))
    .sort(compareOrder)

/** 계획을 적용한 뒤의 형제 순서(번호) */
function orderAfter(
  siblings: readonly SiblingOrder[],
  target: SiblingOrder,
  plan: ReturnType<typeof planTeamMove>,
): bigint[] {
  const values = new Map([...siblings, target].map((s) => [s.teamNo, s.displayOrder]))
  for (const update of plan.updates) values.set(update.teamNo, update.displayOrder)
  return [...values.entries()]
    .map(([teamNo, displayOrder]) => ({ teamNo, displayOrder }))
    .sort(compareOrder)
    .map((s) => s.teamNo)
}

describe('planTeamMove — 같은 상위 팀(3d siblingMove 가 낸 요청)', () => {
  const nodes = [node(1, 0), node(2, 1), node(3, 2)]

  it('위로 — 앞 형제 앞으로 정확히 한 칸', () => {
    const move = siblingMove(nodes, 3n, 'up')
    expect(move).toEqual({ teamNo: 3n, parentTeamNo: null, beforeTeamNo: 2n })
    const siblings = siblingsOf(nodes, 3n)
    const plan = planTeamMove(siblings, sib(3, 2), move?.beforeTeamNo ?? null, true)
    expect(plan).toEqual({
      unchanged: false,
      targetOrder: 1,
      updates: [sib(3, 1), sib(2, 2)],
    })
    expect(orderAfter(siblings, sib(3, 2), plan)).toEqual([1n, 3n, 2n])
  })

  it('아래로 — 그다음 형제 앞으로', () => {
    const move = siblingMove(nodes, 1n, 'down')
    expect(move?.beforeTeamNo).toBe(3n)
    const siblings = siblingsOf(nodes, 1n)
    const plan = planTeamMove(siblings, sib(1, 0), 3n, true)
    expect(orderAfter(siblings, sib(1, 0), plan)).toEqual([2n, 1n, 3n])
    expect(plan.updates).toEqual([sib(2, 0), sib(1, 1)])
  })

  it('끝으로(beforeTeamNo null)', () => {
    const siblings = siblingsOf(nodes, 1n)
    const plan = planTeamMove(siblings, sib(1, 0), null, true)
    expect(orderAfter(siblings, sib(1, 0), plan)).toEqual([2n, 3n, 1n])
    expect(plan.targetOrder).toBe(2)
  })

  it('🔴 제자리면 쓰지 않는다 — 빈 번호(10 · 20 · 30)여도 다시 매기지 않는다', () => {
    const gaps = [node(1, 10), node(2, 20), node(3, 30)]
    expect(planTeamMove(siblingsOf(gaps, 3n), sib(3, 30), null, true)).toEqual({
      unchanged: true,
      targetOrder: 30,
      updates: [],
    })
    expect(planTeamMove(siblingsOf(gaps, 1n), sib(1, 10), 2n, true).unchanged).toBe(true)
  })

  it('🔴 동률(hangang 기본값 0 이 여럿) — 위로가 한 칸만 움직이고 묶음이 0..n-1 이 된다(Review Focus 1)', () => {
    const ties = [node(1, 0), node(2, 0), node(3, 0)]
    const move = siblingMove(ties, 3n, 'up')
    expect(move?.beforeTeamNo).toBe(2n)
    const siblings = siblingsOf(ties, 3n)
    const plan = planTeamMove(siblings, sib(3, 0), 2n, true)
    expect(orderAfter(siblings, sib(3, 0), plan)).toEqual([1n, 3n, 2n])
    expect(plan.updates).toEqual([sib(3, 1), sib(2, 2)])
  })

  it('빈 번호에서 아래로 — 그 묶음이 0..n-1 로 다시 매겨진다', () => {
    const gaps = [node(1, 10), node(2, 20), node(3, 30)]
    const siblings = siblingsOf(gaps, 1n)
    const plan = planTeamMove(siblings, sib(1, 10), 3n, true)
    expect(orderAfter(siblings, sib(1, 10), plan)).toEqual([2n, 1n, 3n])
    expect(plan.updates).toEqual([sib(2, 0), sib(1, 1), sib(3, 2)])
  })

  it('드래그로 바뀐 사본의 자리(findTeamPlacement)를 그대로 재현한다', () => {
    const dragged = [node(3, 2), node(1, 0), node(2, 1)]
    const placement = findTeamPlacement(dragged, 3n)
    expect(placement).toEqual({ parentTeamNo: null, beforeTeamNo: 1n })
    const siblings = siblingsOf(nodes, 3n)
    const plan = planTeamMove(siblings, sib(3, 2), placement?.beforeTeamNo ?? null, true)
    expect(orderAfter(siblings, sib(3, 2), plan)).toEqual([3n, 1n, 2n])
  })
})

describe('planTeamMove — 다른 상위 팀', () => {
  it('끝으로 — 새 형제 다음 번호', () => {
    const siblings = [sib(10, 0), sib(11, 1)]
    expect(planTeamMove(siblings, sib(5, 7), null, false)).toEqual({
      unchanged: false,
      targetOrder: 2,
      updates: [sib(5, 2)],
    })
  })

  it('기준 형제 앞으로', () => {
    const siblings = [sib(10, 0), sib(11, 1)]
    const plan = planTeamMove(siblings, sib(5, 7), 11n, false)
    expect(plan.targetOrder).toBe(1)
    expect(plan.updates).toEqual([sib(5, 1), sib(11, 2)])
  })

  it('빈 묶음이면 0(3d — 형제가 없으면 0)', () => {
    expect(planTeamMove([], sib(5, 7), null, false)).toEqual({
      unchanged: false,
      targetOrder: 0,
      updates: [sib(5, 0)],
    })
  })

  it('같은 자리 값이어도 상위 팀이 바뀌면 제자리가 아니다', () => {
    expect(planTeamMove([], sib(5, 0), null, false)).toEqual({
      unchanged: false,
      targetOrder: 0,
      updates: [],
    })
  })

  it('🔴 형제가 아닌 beforeTeamNo 는 결함이다 — 던진다(부르는 쪽이 먼저 400)', () => {
    expect(() => planTeamMove([sib(10, 0)], sib(5, 0), 99n, false)).toThrow(
      'beforeTeamNo 가 받는 형제가 아니다',
    )
  })
})

describe('closurePairs', () => {
  it('새 조상 × 서브트리 — 깊이 a.depth + d.depth + 1', () => {
    const pairs = closurePairs(
      [
        { teamNo: 1n, depth: 0 },
        { teamNo: 2n, depth: 1 },
      ],
      [
        { teamNo: 5n, depth: 0 },
        { teamNo: 6n, depth: 1 },
        { teamNo: 7n, depth: 2 },
      ],
    )
    expect(pairs).toEqual([
      { ancestorNo: 1n, descendantNo: 5n, depth: 1 },
      { ancestorNo: 1n, descendantNo: 6n, depth: 2 },
      { ancestorNo: 1n, descendantNo: 7n, depth: 3 },
      { ancestorNo: 2n, descendantNo: 5n, depth: 2 },
      { ancestorNo: 2n, descendantNo: 6n, depth: 3 },
      { ancestorNo: 2n, descendantNo: 7n, depth: 4 },
    ])
  })

  it('최상위로 옮기면(조상 없음) 넣을 쌍이 없다', () => {
    expect(closurePairs([], [{ teamNo: 5n, depth: 0 }])).toEqual([])
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test teams`
Expected: FAIL — `./tree.js` · `./move.js` 를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/teams/errors.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { validationError } from '../http/validation.js'

// 정본: hangang-home apps/api/src/modules/teams/teams.service.ts 의 문구(팀을 찾을 수 없습니다 · 중복) + ssworks-axion-admin
//       teams.service.ts '상위 팀을 찾을 수 없습니다.'
// 바꾼 점: 한 표에 모은다(2d ACCOUNT_MESSAGES 와 같은 방식). 소속 있는 삭제 · 순환은 전용 코드다(3d §9 — hangang 은
//   ERR_COMMON_CONFLICT 하나에 뜻이 셋이라 화면이 문구에 기댔다). 이름 중복은 409 ERR_DUPLICATE_TEAM_NAME(⑧ N1 — 3d §9 계약).

export const TEAM_MESSAGES = Object.freeze({
  noTeam: '팀을 찾을 수 없습니다.',
  noParentTeam: '상위 팀을 찾을 수 없습니다.',
  duplicateTeamName: '이미 있는 팀 이름입니다.',
  teamHasMembers:
    '이 팀이나 하위 팀에 소속된 계정이 있어 지울 수 없습니다. 계정을 먼저 다른 팀으로 옮기세요.',
  moveCycle: '팀을 자기 자신이나 하위 팀 아래로 옮길 수 없습니다.',
  beforeNotSibling: '기준 팀이 옮겨 갈 상위 팀의 하위 팀이 아닙니다.',
  beforeIsSelf: '옮길 팀 자신을 기준 팀으로 고를 수 없습니다.',
})

export function noTeam(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_TEAM, TEAM_MESSAGES.noTeam)
}

export function noParentTeam(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_TEAM, TEAM_MESSAGES.noParentTeam)
}

export function duplicateTeamName(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME,
    TEAM_MESSAGES.duplicateTeamName,
  )
}

/** memberCount 는 계정 수(두 팀에 걸친 계정도 1) — 퇴사자 포함(③ M1) */
export function teamHasMembers(memberCount: number): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_TEAM_HAS_MEMBERS, TEAM_MESSAGES.teamHasMembers, {
    memberCount,
  })
}

export function moveCycle(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_TEAM_MOVE_CYCLE, TEAM_MESSAGES.moveCycle)
}

/** 기준 형제 위반 — 400 ERR_COMMON_VALIDATION + issues[{ path: ['beforeTeamNo'] }] */
export function beforeTeamError(message: string): BusinessError {
  return validationError([{ path: ['beforeTeamNo'], code: 'custom', message }], message)
}
```

`packages/admin-server/src/teams/tree.ts`:

```ts
import type { AdminTeamNode } from '@ssworks/admin-shared'

// 정본: hangang-home apps/api/src/modules/teams/teams.service.ts findAll(teams ⟕ closure 깊이 1 의 평면 목록) · buildTree
// 바꾼 점: 루트가 여럿이다(3d §9 — hangang 은 단일 루트를 depth 0 자기 행으로 골랐다). 자기 행에 기대지 않는다(2e 스펙 ④ C1 —
//   상위 팀은 깊이 1 조상뿐). closure 가 손상됐으면 경고를 모아 내고 루트에서 닿는 팀만 낸다(B9).
// 🔴 무한 반복이 없다 — 각 팀은 상위 팀이 하나뿐이라(둘이면 작은 번호 하나로 줄인다) 루트에서 자식으로 내려가는 길에는 순환이
//    끼지 않는다. 순환에 든 팀은 루트에서 닿지 않아 내지 않는다.

export interface TeamTreeRow {
  teamNo: bigint
  teamName: string
  displayOrder: number
  /** 깊이 1 조상. null = 최상위 */
  parentTeamNo: bigint | null
}

export interface TeamTreeBuild {
  items: AdminTeamNode[]
  warnings: string[]
}

/** 🔴 행 순서 그대로 자식을 붙인다 — 쿼리가 (displayOrder, teamNo, parentTeamNo) 순으로 준다(형제 순서 = 3d sortTeamTree) */
export function buildTeamTree(rows: readonly TeamTreeRow[]): TeamTreeBuild {
  const nodes = new Map<bigint, AdminTeamNode>()
  const parentOf = new Map<bigint, bigint | null>()
  const warnings: string[] = []
  for (const row of rows) {
    if (nodes.has(row.teamNo)) {
      const kept = parentOf.get(row.teamNo) ?? null
      const smaller =
        kept === null || (row.parentTeamNo !== null && row.parentTeamNo < kept)
          ? row.parentTeamNo
          : kept
      parentOf.set(row.teamNo, smaller)
      warnings.push(
        `팀 ${row.teamNo} 의 상위 팀(closure 깊이 1 행)이 둘 이상이다 — 작은 번호 ${String(smaller)} 을 쓴다`,
      )
      continue
    }
    nodes.set(row.teamNo, {
      teamNo: row.teamNo,
      teamName: row.teamName,
      displayOrder: row.displayOrder,
      children: [],
    })
    parentOf.set(row.teamNo, row.parentTeamNo)
  }

  const items: AdminTeamNode[] = []
  const orphans = new Set<bigint>()
  for (const [teamNo, node] of nodes) {
    const parent = parentOf.get(teamNo) ?? null
    if (parent === null) {
      items.push(node)
      continue
    }
    const parentNode = nodes.get(parent)
    if (parentNode === undefined) {
      orphans.add(teamNo)
      warnings.push(`팀 ${teamNo} 의 상위 팀 ${parent} 가 목록에 없다 — 내지 않는다`)
      continue
    }
    parentNode.children.push(node)
  }

  const reached = new Set<bigint>()
  const walk = (node: AdminTeamNode): void => {
    reached.add(node.teamNo)
    for (const child of node.children) walk(child)
  }
  for (const root of items) walk(root)
  for (const teamNo of nodes.keys()) {
    if (!reached.has(teamNo) && !orphans.has(teamNo)) {
      warnings.push(`팀 ${teamNo} 이 루트에서 닿지 않는다(closure 순환) — 내지 않는다`)
    }
  }
  return { items, warnings }
}
```

(위 "깊이 1 조상이 둘" 테스트의 행 순서에서 첫 행의 상위 팀 1 이 남는다 — 경고 문구의 `작은 번호 1`.)

`packages/admin-server/src/teams/move.ts`:

```ts
// 정본: 없음 — hangang 은 클라이언트가 순서 값을 보냈고(형제 ±1 시프트) 순환 검사가 없었다. 3d ⑤ O3 의 기준 형제 번호를 서버가
//   받는 형제 묶음의 0..n-1 다시 매김으로 푼다(2e 스펙 ⑤ O1 · B8). closure 쌍은 앱이 셈한다(④ C1 · B6 — 자기 행에 기대지 않는다).

export interface SiblingOrder {
  teamNo: bigint
  displayOrder: number
}

export interface TeamMovePlan {
  /** 🔴 같은 상위 팀이고 팀 순서가 그대로 — 쓰지 않는다(빈 번호여도 다시 매기지 않는다 · 감사 before = after) */
  unchanged: boolean
  /** 대상의 새 displayOrder(제자리면 지금 값) */
  targetOrder: number
  /** displayOrder 가 바뀌는 행(대상 포함) */
  updates: SiblingOrder[]
}

export interface ClosureLink {
  teamNo: bigint
  /** 기준 팀에서의 깊이 — 기준 자신은 0 */
  depth: number
}

export interface ClosureRow {
  ancestorNo: bigint
  descendantNo: bigint
  depth: number
}

/** (displayOrder, teamNo) 오름차순 — 트리 응답 · 형제 잠금 읽기와 같은 순서 */
export function compareOrder(a: SiblingOrder, b: SiblingOrder): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
  return a.teamNo < b.teamNo ? -1 : a.teamNo > b.teamNo ? 1 : 0
}

/**
 * @param siblings 받는 상위 팀의 지금 자식 — 대상 제외, (displayOrder, teamNo) 순
 * @param target 대상의 지금 번호 · 값
 * @param beforeTeamNo 이 형제 앞에 둔다. null = 끝. 🔴 siblings 안에 있어야 한다(부르는 쪽이 먼저 400)
 * @param sameParent 상위 팀이 그대로인가 — 그러면 지금 순서(대상 포함)와 같을 때 제자리
 */
export function planTeamMove(
  siblings: readonly SiblingOrder[],
  target: SiblingOrder,
  beforeTeamNo: bigint | null,
  sameParent: boolean,
): TeamMovePlan {
  const index =
    beforeTeamNo === null
      ? siblings.length
      : siblings.findIndex((sibling) => sibling.teamNo === beforeTeamNo)
  if (index < 0) {
    throw new Error(
      'planTeamMove: beforeTeamNo 가 받는 형제가 아니다 — 부르는 쪽이 먼저 400 을 낸다',
    )
  }
  const order = [...siblings.slice(0, index), target, ...siblings.slice(index)]
  if (sameParent) {
    const current = [...siblings, target].sort(compareOrder)
    if (current.every((sibling, i) => sibling.teamNo === order[i]?.teamNo)) {
      return { unchanged: true, targetOrder: target.displayOrder, updates: [] }
    }
  }
  const updates = order.flatMap((sibling, i) =>
    sibling.displayOrder === i ? [] : [{ teamNo: sibling.teamNo, displayOrder: i }],
  )
  return { unchanged: false, targetOrder: index, updates }
}

/** 새 조상(새 상위 팀 깊이 0 ∪ 그 조상) × 서브트리(대상 깊이 0 ∪ 자손) — 깊이 a.depth + d.depth + 1 (B6) */
export function closurePairs(
  ancestors: readonly ClosureLink[],
  subtree: readonly ClosureLink[],
): ClosureRow[] {
  return ancestors.flatMap((ancestor) =>
    subtree.map((descendant) => ({
      ancestorNo: ancestor.teamNo,
      descendantNo: descendant.teamNo,
      depth: ancestor.depth + descendant.depth + 1,
    })),
  )
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm --filter @ssworks/admin-server test teams
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS(트리 5 · 이동 15 내외). 🔴 RED 한 번 더: `planTeamMove` 의 `if (sameParent) { … }` 블록을 지우면 "제자리면 쓰지 않는다" 가 실패한다(빈 번호 10 · 20 · 30 을 0..2 로 다시 매긴다). 보고서에 적고 되돌린다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/teams/errors.ts packages/admin-server/src/teams/tree.ts packages/admin-server/src/teams/tree.test.ts packages/admin-server/src/teams/move.ts packages/admin-server/src/teams/move.test.ts
git add packages/admin-server/src/teams/errors.ts packages/admin-server/src/teams/tree.ts packages/admin-server/src/teams/tree.test.ts packages/admin-server/src/teams/move.ts packages/admin-server/src/teams/move.test.ts
git commit -m "feat(admin-server): 팀 문구 · 트리 조립 · 이동 계획(받는 형제 다시 매김) · closure 쌍 — 순수 함수" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 팀 잠금 읽기 · 서비스(트리 · 만들기 · 이름 바꾸기)

**Files:**

- Create: `packages/admin-server/src/teams/team-locks.ts`
- Create: `packages/admin-server/src/teams/teams.service.ts`
- Create: `packages/admin-server/src/test-support/teams.ts`
- Create: `packages/admin-server/src/teams/teams.service.db.test.ts`

**Interfaces:**

- Consumes: Task 3 `lockGuardRow` · `GUARD_LOCK_TEAM_TREE`, Task 4 전부, 2d `isDuplicateOf`, 2a `runQuery` · `runWriteTransaction` · `KYSELY`, Task 1 `whileHeld` · `settle`.
- Produces:
  - `team-locks.ts`: `LockedTeam = { teamNo: bigint; teamName: string; displayOrder: number; parentTeamNo: bigint | null }`, `lockTeamRow(trx, teamNo): Promise<LockedTeam>`(404 `noTeam`), `lockParentTeam(trx, teamNo): Promise<void>`(404 `noParentTeam`), `lockAncestors(trx, teamNo): Promise<ClosureLink[]>`(깊이 > 0, 깊이 순), `lockDescendants(trx, teamNo): Promise<(ClosureLink & { teamName: string })[]>`(깊이 > 0, 깊이 · 순서 · 번호 순, 팀 행도 잠금), `lockSiblings(trx, parentTeamNo: bigint | null, exclude: bigint | null): Promise<SiblingOrder[]>`.
  - `AdminTeamsService`(생성자 `(@Inject(KYSELY) db: Kysely<AdminDatabase>)`): `tree(): Promise<{ items: AdminTeamNode[] }>`, `create(body: AdminTeamCreate): Promise<{ teamNo: bigint }>`, `rename(teamNo: bigint, body: AdminTeamRename): Promise<{ before: { teamName: string } }>`. Task 6 · 7 이 `move` · `remove` 를 더한다.
  - 감사 필드 상수 `TEAM_AUDIT_FIELDS = ['teamName', 'parentTeamNo'] as const` · `TEAM_RENAME_AUDIT_FIELDS = ['teamName'] as const` · `TEAM_MOVE_AUDIT_FIELDS = ['parentTeamNo', 'displayOrder'] as const` 와 타입 별칭 `TeamAuditView = { teamName: string; parentTeamNo: bigint | null }` · `TeamPlacement = { parentTeamNo: bigint | null; displayOrder: number }`(🔴 타입 별칭이라 `attachAuditDiff` 의 `Record<string, unknown>` 자리에 들어간다).
  - `test-support/teams.ts`: `ClosureTuple`, `closureOf(db, descendants)`, `closure(...[a, d, depth])`, `outline(nodes)`, `seedTeamUnder(db, { teamName, parentTeamNo, displayOrder?, selfRow? })`, `displayOrders(db, teamNos)`.

- [ ] **Step 1: 시드 도우미를 쓴다**

`packages/admin-server/src/test-support/teams.ts`:

```ts
import type { AdminTeamNode } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 테스트 전용 — 팀 시드(쓰는 쪽 시드 흉내)와 closure · 트리 읽기(2e-1). 🔴 빌드에서 빠진다(tsconfig.build.json 의
// test-support 제외).

export interface ClosureTuple {
  ancestorNo: bigint
  descendantNo: bigint
  depth: number
}

const compareBig = (a: bigint, b: bigint): number => (a < b ? -1 : a > b ? 1 : 0)

export function compareClosure(a: ClosureTuple, b: ClosureTuple): number {
  return (
    compareBig(a.descendantNo, b.descendantNo) ||
    a.depth - b.depth ||
    compareBig(a.ancestorNo, b.ancestorNo)
  )
}

/** 그 팀들을 자손으로 가진 closure 행 전부 — (descendantNo, depth, ancestorNo) 순 */
export async function closureOf(
  db: Kysely<AdminDatabase>,
  descendants: readonly bigint[],
): Promise<ClosureTuple[]> {
  if (descendants.length === 0) return []
  const rows = await db
    .selectFrom('teamClosure')
    .select(['ancestorNo', 'descendantNo', 'depth'])
    .where('descendantNo', 'in', descendants)
    .execute()
  return rows.sort(compareClosure)
}

/** 기대 closure — [조상, 자손, 깊이] 를 closureOf 와 같은 순으로 */
export function closure(...rows: [bigint, bigint, number][]): ClosureTuple[] {
  return rows
    .map(([ancestorNo, descendantNo, depth]) => ({ ancestorNo, descendantNo, depth }))
    .sort(compareClosure)
}

/** 트리를 깊이 우선 경로로 — ['R1', 'R1/A', 'R1/A/a', 'R2'] */
export function outline(nodes: readonly AdminTeamNode[], prefix = ''): string[] {
  return nodes.flatMap((node) => {
    const path = prefix === '' ? node.teamName : `${prefix}/${node.teamName}`
    return [path, ...outline(node.children, path)]
  })
}

/**
 * 쓰는 쪽이 손으로 넣은 팀(시드 흉내). 상위 팀 = 깊이 1 행, 그 위 조상은 상위 팀의 depth > 0 행에서 센다.
 * 🔴 selfRow(기본 true)로 자기 행(depth 0)을 넣을지 고른다 — 패키지가 자기 행에 기대지 않는지 잰다(④ C1).
 */
export async function seedTeamUnder(
  db: Kysely<AdminDatabase>,
  input: {
    teamName: string
    parentTeamNo: bigint | null
    displayOrder?: number
    selfRow?: boolean
  },
): Promise<bigint> {
  const inserted = await db
    .insertInto('teams')
    .values({ teamName: input.teamName, displayOrder: input.displayOrder ?? 0 })
    .executeTakeFirstOrThrow()
  const teamNo = inserted.insertId as bigint
  if (input.selfRow ?? true) {
    await db
      .insertInto('teamClosure')
      .values({ ancestorNo: teamNo, descendantNo: teamNo, depth: 0 })
      .execute()
  }
  if (input.parentTeamNo !== null) {
    const ancestors = await db
      .selectFrom('teamClosure')
      .select(['ancestorNo', 'depth'])
      .where('descendantNo', '=', input.parentTeamNo)
      .where('depth', '>', 0)
      .execute()
    await db
      .insertInto('teamClosure')
      .values([
        { ancestorNo: input.parentTeamNo, descendantNo: teamNo, depth: 1 },
        ...ancestors.map((a) => ({
          ancestorNo: a.ancestorNo,
          descendantNo: teamNo,
          depth: a.depth + 1,
        })),
      ])
      .execute()
  }
  return teamNo
}

/** 그 팀들의 [번호, displayOrder] — 번호 순 */
export async function displayOrders(
  db: Kysely<AdminDatabase>,
  teamNos: readonly bigint[],
): Promise<[bigint, number][]> {
  const rows = await db
    .selectFrom('teams')
    .select(['teamNo', 'displayOrder'])
    .where('teamNo', 'in', teamNos)
    .orderBy('teamNo')
    .execute()
  return rows.map((row) => [row.teamNo, row.displayOrder])
}
```

- [ ] **Step 2: 서비스 DB 테스트를 쓴다**

`packages/admin-server/src/teams/teams.service.db.test.ts`:

```ts
import { Logger } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { settle, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { closure, closureOf, displayOrders, outline, seedTeamUnder } from '../test-support/teams.js'
import { TEAM_MESSAGES } from './errors.js'
import { AdminTeamsService } from './teams.service.js'

// 팀 서비스 — 트리 · 만들기 · 이름 바꾸기(2e 스펙 §5-2 ~ §5-4 · §9-3 [1]). 이름은 테스트마다 접두어로 가른다(🔴 대소문자만
// 다른 이름은 ci 콜레이션에서 같은 이름이다).

let t: TestDatabase
let service: AdminTeamsService

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminTeamsService(t.db)
})

afterAll(async () => {
  await t?.drop()
})

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

const pathsOf = async (prefix: string) =>
  outline((await service.tree()).items).filter((path) => path.startsWith(prefix))

describe('트리', () => {
  it('빈 저장소는 { items: [] } — 이 파일의 첫 테스트', async () => {
    expect(await service.tree()).toEqual({ items: [] })
  })

  it('루트 여럿 · 깊이 · 형제는 (displayOrder, teamNo) 순', async () => {
    const r1 = (await service.create({ teamName: 'tr-R1', parentTeamNo: null })).teamNo
    await service.create({ teamName: 'tr-R2', parentTeamNo: null })
    const a = (await service.create({ teamName: 'tr-A', parentTeamNo: r1 })).teamNo
    await service.create({ teamName: 'tr-B', parentTeamNo: r1 })
    await service.create({ teamName: 'tr-leaf', parentTeamNo: a })
    expect(await pathsOf('tr-')).toEqual([
      'tr-R1',
      'tr-R1/tr-A',
      'tr-R1/tr-A/tr-leaf',
      'tr-R1/tr-B',
      'tr-R2',
    ])
  })

  it('🔴 자기 행 없는 시드에서도 같은 트리(④ C1 · Review Focus 3)', async () => {
    const s1 = await seedTeamUnder(t.db, { teamName: 'sd-S1', parentTeamNo: null, selfRow: false })
    await seedTeamUnder(t.db, { teamName: 'sd-S2', parentTeamNo: s1, selfRow: false })
    expect(await pathsOf('sd-')).toEqual(['sd-S1', 'sd-S1/sd-S2'])
  })

  it('closure 가 손상되면(순환) 경고하고 닿는 팀만 낸다(B9)', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const p = await seedTeamUnder(t.db, { teamName: 'cy-p', parentTeamNo: null })
    const q = await seedTeamUnder(t.db, { teamName: 'cy-q', parentTeamNo: p })
    await t.db
      .insertInto('teamClosure')
      .values({ ancestorNo: q, descendantNo: p, depth: 1 })
      .execute()
    try {
      expect(await pathsOf('cy-')).toEqual([])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('closure 순환'))
    } finally {
      warn.mockRestore()
      await t.db.deleteFrom('teams').where('teamNo', 'in', [p, q]).execute()
    }
  })
})

describe('만들기', () => {
  it('최상위 · 하위 · 손자 — closure 에 자기 행과 조상 쌍, 순서는 형제 MAX + 1(없으면 0)', async () => {
    const root = (await service.create({ teamName: 'mk-root', parentTeamNo: null })).teamNo
    const first = (await service.create({ teamName: 'mk-first', parentTeamNo: root })).teamNo
    const second = (await service.create({ teamName: 'mk-second', parentTeamNo: root })).teamNo
    const grand = (await service.create({ teamName: 'mk-grand', parentTeamNo: first })).teamNo
    expect(await displayOrders(t.db, [first, second, grand])).toEqual([
      [first, 0],
      [second, 1],
      [grand, 0],
    ])
    expect(await closureOf(t.db, [root, first, grand])).toEqual(
      closure(
        [root, root, 0],
        [first, first, 0],
        [root, first, 1],
        [grand, grand, 0],
        [first, grand, 1],
        [root, grand, 2],
      ),
    )
  })

  it('최상위 형제도 MAX + 1 — 루트 둘의 순서가 이어진다', async () => {
    const a = (await service.create({ teamName: 'mk-rootA', parentTeamNo: null })).teamNo
    const b = (await service.create({ teamName: 'mk-rootB', parentTeamNo: null })).teamNo
    const orders = (await displayOrders(t.db, [a, b])).map(([, order]) => order)
    expect(orders[1]).toBe((orders[0] ?? 0) + 1)
  })

  it('🔴 자기 행 없는 상위 팀 아래에도 조상 쌍을 맞게 만든다(④ C1)', async () => {
    const p0 = await seedTeamUnder(t.db, { teamName: 'mk-p0', parentTeamNo: null, selfRow: false })
    const p1 = await seedTeamUnder(t.db, { teamName: 'mk-p1', parentTeamNo: p0, selfRow: false })
    const made = (await service.create({ teamName: 'mk-under', parentTeamNo: p1 })).teamNo
    expect(await closureOf(t.db, [made])).toEqual(
      closure([made, made, 0], [p1, made, 1], [p0, made, 2]),
    )
  })

  it('없는 상위 팀은 404 ERR_NO_TEAM 상위 팀 문구', async () => {
    const error = await failure(service.create({ teamName: 'mk-orphan', parentTeamNo: 999_999n }))
    expect(error.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(error.message).toBe(TEAM_MESSAGES.noParentTeam)
  })

  it('🔴 이름 중복은 409 ERR_DUPLICATE_TEAM_NAME — 대소문자 · 끝 공백만 달라도(Review Focus 2)', async () => {
    await service.create({ teamName: 'mk-Dup', parentTeamNo: null })
    for (const teamName of ['mk-dup', 'MK-DUP', 'mk-Dup ']) {
      const error = await failure(service.create({ teamName, parentTeamNo: null }))
      expect(error.code, teamName).toBe(CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME)
      expect(error.message).toBe(TEAM_MESSAGES.duplicateTeamName)
    }
  })

  it('🔴 동시 만들기 둘(같은 상위 팀)은 가드에서 줄을 서 순서 값이 겹치지 않는다(c2)', async () => {
    const parent = (await service.create({ teamName: 'mk-race', parentTeamNo: null })).teamNo
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query(
          "select lock_name from guard_locks where lock_name = 'teamTree' for update",
        ),
      () =>
        Promise.all([
          settle(service.create({ teamName: 'mk-race-1', parentTeamNo: parent })),
          settle(service.create({ teamName: 'mk-race-2', parentTeamNo: parent })),
        ]),
      { waiters: 2 },
    )
    if (!result.ok) throw result.error
    const made = result.value.map((outcome) => {
      if (!outcome.ok) throw outcome.error
      return outcome.value.teamNo
    })
    const orders = (await displayOrders(t.db, made)).map(([, order]) => order).sort((x, y) => x - y)
    expect(orders).toEqual([0, 1])
  })
})

describe('이름 바꾸기', () => {
  it('바꾸고 before 를 돌려준다 — 자기 이름을 대소문자만 바꿔 다시 저장해도 통과', async () => {
    const teamNo = (await service.create({ teamName: 'rn-Name', parentTeamNo: null })).teamNo
    expect(await service.rename(teamNo, { teamName: 'rn-name' })).toEqual({
      before: { teamName: 'rn-Name' },
    })
    const row = await t.db
      .selectFrom('teams')
      .select('teamName')
      .where('teamNo', '=', teamNo)
      .executeTakeFirstOrThrow()
    expect(row.teamName).toBe('rn-name')
  })

  it('없는 팀 404 · 남의 이름 409', async () => {
    const missing = await failure(service.rename(999_998n, { teamName: 'rn-x' }))
    expect(missing.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(missing.message).toBe(TEAM_MESSAGES.noTeam)
    await service.create({ teamName: 'rn-taken', parentTeamNo: null })
    const mine = (await service.create({ teamName: 'rn-mine', parentTeamNo: null })).teamNo
    const taken = await failure(service.rename(mine, { teamName: 'RN-TAKEN' }))
    expect(taken.code).toBe(CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME)
  })
})
```

- [ ] **Step 3: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db teams.service`
Expected: FAIL — `./teams.service.js` 를 찾지 못한다.

- [ ] **Step 4: 잠금 읽기 조각을 쓴다**

`packages/admin-server/src/teams/team-locks.ts`:

```ts
import type { Transaction } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { noParentTeam, noTeam } from './errors.js'
import type { ClosureLink, SiblingOrder } from './move.js'

// 정본: hangang-home apps/api/src/modules/teams/team-closure.service.ts(subtreeTeamNos · 조상 복사 · 깊이 1 = 상위 팀) ·
//       teams.service.ts(형제 구간)
// 바꾼 점: 팀 쓰기의 읽기는 모두 잠금 읽기다(2e 스펙 B3 — 예외는 삭제의 소속 셈 하나). 자기 행에 기대지 않는다(④ C1) — 대상은
//   부르는 쪽이 따로 넣고, closure 는 depth > 0 만 읽는다. hangang 은 비잠금 · 자기 행 의존이었다.
// 🔴 이 조각들보다 lockGuardRow(trx, GUARD_LOCK_TEAM_TREE) 가 먼저, 트랜잭션의 첫 문장이어야 한다(① G1).

type Trx = Transaction<AdminDatabase>

export interface LockedTeam {
  teamNo: bigint
  teamName: string
  displayOrder: number
  /** 깊이 1 조상. null = 최상위 */
  parentTeamNo: bigint | null
}

/** 대상 팀과 그 상위 팀 — 없으면 404 ERR_NO_TEAM */
export async function lockTeamRow(trx: Trx, teamNo: bigint): Promise<LockedTeam> {
  const row = await trx
    .selectFrom('teams as t')
    .leftJoin('teamClosure as p', (join) =>
      join.onRef('p.descendantNo', '=', 't.teamNo').on('p.depth', '=', 1),
    )
    .select(['t.teamNo', 't.teamName', 't.displayOrder', 'p.ancestorNo as parentTeamNo'])
    .where('t.teamNo', '=', teamNo)
    .orderBy('p.ancestorNo')
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw noTeam()
  return { ...row, parentTeamNo: row.parentTeamNo ?? null }
}

/** 상위 팀(만들기 · 이동의 받는 쪽) — 없으면 404 ERR_NO_TEAM 상위 팀 문구 */
export async function lockParentTeam(trx: Trx, teamNo: bigint): Promise<void> {
  const row = await trx
    .selectFrom('teams')
    .select('teamNo')
    .where('teamNo', '=', teamNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw noParentTeam()
}

/** 조상(깊이 > 0, 깊이 순) — 자기 행은 읽지 않는다 */
export async function lockAncestors(trx: Trx, teamNo: bigint): Promise<ClosureLink[]> {
  const rows = await trx
    .selectFrom('teamClosure')
    .select(['ancestorNo', 'depth'])
    .where('descendantNo', '=', teamNo)
    .where('depth', '>', 0)
    .orderBy('depth')
    .forUpdate()
    .execute()
  return rows.map((row) => ({ teamNo: row.ancestorNo, depth: row.depth }))
}

/** 자손(깊이 > 0) — 깊이 · 순서 · 번호 순. 팀 행도 함께 잠근다(삭제 · 이동의 서브트리) */
export async function lockDescendants(
  trx: Trx,
  teamNo: bigint,
): Promise<(ClosureLink & { teamName: string })[]> {
  const rows = await trx
    .selectFrom('teamClosure as c')
    .innerJoin('teams as t', 't.teamNo', 'c.descendantNo')
    .select(['t.teamNo', 't.teamName', 'c.depth'])
    .where('c.ancestorNo', '=', teamNo)
    .where('c.depth', '>', 0)
    .orderBy('c.depth')
    .orderBy('t.displayOrder')
    .orderBy('t.teamNo')
    .forUpdate()
    .execute()
  return rows.map((row) => ({ teamNo: row.teamNo, teamName: row.teamName, depth: row.depth }))
}

/** 상위 팀의 자식 — (displayOrder, teamNo) 순, exclude 제외. parentTeamNo null = 최상위(깊이 1 조상이 없는 팀) */
export async function lockSiblings(
  trx: Trx,
  parentTeamNo: bigint | null,
  exclude: bigint | null,
): Promise<SiblingOrder[]> {
  const rows =
    parentTeamNo === null
      ? await trx
          .selectFrom('teams as t')
          .leftJoin('teamClosure as p', (join) =>
            join.onRef('p.descendantNo', '=', 't.teamNo').on('p.depth', '=', 1),
          )
          .select(['t.teamNo', 't.displayOrder'])
          .where('p.ancestorNo', 'is', null)
          .orderBy('t.displayOrder')
          .orderBy('t.teamNo')
          .forUpdate()
          .execute()
      : await trx
          .selectFrom('teamClosure as c')
          .innerJoin('teams as t', 't.teamNo', 'c.descendantNo')
          .select(['t.teamNo', 't.displayOrder'])
          .where('c.ancestorNo', '=', parentTeamNo)
          .where('c.depth', '=', 1)
          .orderBy('t.displayOrder')
          .orderBy('t.teamNo')
          .forUpdate()
          .execute()
  return rows
    .filter((row) => row.teamNo !== exclude)
    .map((row) => ({ teamNo: row.teamNo, displayOrder: row.displayOrder }))
}
```

- [ ] **Step 5: 서비스를 쓴다(트리 · 만들기 · 이름 바꾸기)**

`packages/admin-server/src/teams/teams.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AdminTeamCreate, AdminTeamNode, AdminTeamRename } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { isDuplicateOf } from '../accounts/duplicate.js'
import { GUARD_LOCK_TEAM_TREE, lockGuardRow } from '../database/guard-locks.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import { duplicateTeamName } from './errors.js'
import { closurePairs, type ClosureLink } from './move.js'
import { lockAncestors, lockParentTeam, lockSiblings, lockTeamRow } from './team-locks.js'
import { buildTeamTree } from './tree.js'

// 정본: hangang-home apps/api/src/modules/teams/teams.service.ts(트리 · 만들기 · 이름 · 이동 · 삭제 · A3 잠금 뒤 셈) ·
//       team-closure.service.ts(자기 행 + 상위 조상 복사 · reparent) + ssworks-axion-admin 존재 검증(G12)
// 바꾼 점:
//  - 루트가 여럿이다(3d §9 — hangang 은 단일 루트 · parentTeamNo 필수). 트리는 평면 목록을 메모리에서 조립한다(B9).
//  - 🔴 팀 쓰기 넷은 guardLocks 행 teamTree 를 트랜잭션 첫 문장에서 잡는다(① G1) — 겹치지 않는 행을 잠근 이동 둘이 순환을
//    만드는 길을 막는다. 이름 바꾸기도 잡는다(B5 — 팀 행을 바꾸는 쓰기가 모두 줄을 서서 스냅샷 격리 ON 의 1020 이 없다).
//  - 쓰기 안의 읽기는 모두 잠금 읽기(B3). closure 는 앱이 셈한 쌍으로 넣는다(④ C1 · B6 — 자기 행에 기대지 않는다).
//  - 이름 중복은 사전 검사 없이 제약 uq_teams_name 으로 가려 409(⑧ N1 · B12 — hangang 은 사전 검사였고 경합 때 일반 코드로 샜다).
//  - 상위 팀이 없으면 404(hangang 은 조용히 고아를 만들었다).

export type TeamAuditView = { teamName: string; parentTeamNo: bigint | null }
export type TeamPlacement = { parentTeamNo: bigint | null; displayOrder: number }

export const TEAM_AUDIT_FIELDS = ['teamName', 'parentTeamNo'] as const
export const TEAM_RENAME_AUDIT_FIELDS = ['teamName'] as const
export const TEAM_MOVE_AUDIT_FIELDS = ['parentTeamNo', 'displayOrder'] as const

@Injectable()
export class AdminTeamsService {
  private readonly logger = new Logger('AdminTeamsService')

  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  /** 루트 여럿 · 형제는 (displayOrder, teamNo) 순(공통 6). 상위 팀 = 깊이 1 조상 — 자기 행이 필요 없다 */
  async tree(): Promise<{ items: AdminTeamNode[] }> {
    const rows = await runQuery(() =>
      this.db
        .selectFrom('teams as t')
        .leftJoin('teamClosure as p', (join) =>
          join.onRef('p.descendantNo', '=', 't.teamNo').on('p.depth', '=', 1),
        )
        .select(['t.teamNo', 't.teamName', 't.displayOrder', 'p.ancestorNo as parentTeamNo'])
        .orderBy('t.displayOrder')
        .orderBy('t.teamNo')
        .orderBy('p.ancestorNo')
        .execute(),
    )
    const { items, warnings } = buildTeamTree(
      rows.map((row) => ({ ...row, parentTeamNo: row.parentTeamNo ?? null })),
    )
    if (warnings.length > 0)
      this.logger.warn(`팀 트리의 closure 가 손상됐다 — ${warnings.join(' / ')}`)
    return { items }
  }

  /** 상위 팀 아래(없으면 최상위) 맨 끝 — 형제 MAX + 1, 없으면 0(⑤ O1) */
  async create(body: AdminTeamCreate): Promise<{ teamNo: bigint }> {
    return this.guardName(() =>
      runWriteTransaction(this.db, async (trx) => {
        // 🔴 첫 문장(① G1)
        await lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)
        const parentTeamNo = body.parentTeamNo
        let ancestors: ClosureLink[] = []
        if (parentTeamNo !== null) {
          await lockParentTeam(trx, parentTeamNo)
          ancestors = [
            { teamNo: parentTeamNo, depth: 0 },
            ...(await lockAncestors(trx, parentTeamNo)),
          ]
        }
        const siblings = await lockSiblings(trx, parentTeamNo, null)
        const displayOrder = siblings.reduce(
          (top, sibling) => Math.max(top, sibling.displayOrder + 1),
          0,
        )
        const inserted = await trx
          .insertInto('teams')
          .values({ teamName: body.teamName, displayOrder })
          .executeTakeFirstOrThrow()
        const teamNo = inserted.insertId
        if (teamNo === undefined) throw new Error('teams INSERT 가 insertId 를 돌려주지 않았다.')
        await trx
          .insertInto('teamClosure')
          .values([
            { ancestorNo: teamNo, descendantNo: teamNo, depth: 0 },
            ...closurePairs(ancestors, [{ teamNo, depth: 0 }]),
          ])
          .execute()
        return { teamNo }
      }),
    )
  }

  async rename(teamNo: bigint, body: AdminTeamRename): Promise<{ before: { teamName: string } }> {
    return this.guardName(() =>
      runWriteTransaction(this.db, async (trx) => {
        // 🔴 첫 문장(B5 — 이름 바꾸기도 줄을 선다)
        await lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)
        const row = await lockTeamRow(trx, teamNo)
        await trx
          .updateTable('teams')
          .set({ teamName: body.teamName })
          .where('teamNo', '=', teamNo)
          .execute()
        return { before: { teamName: row.teamName } }
      }),
    )
  }

  /** 이름 UNIQUE 위반을 409 ERR_DUPLICATE_TEAM_NAME 으로(B12 — 제약 이름은 DB 의 snake_case, 2a R3) */
  private async guardName<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (isDuplicateOf(error, 'uq_teams_name')) throw duplicateTeamName()
      throw error
    }
  }
}
```

- [ ] **Step 6: GREEN**

```bash
pnpm --filter @ssworks/admin-server test:db teams.service
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS. 🔴 RED 한 번 더(둘): ① `create` 의 `lockGuardRow` 줄과 `lockSiblings` 의 `.forUpdate()` 둘을 함께 지우면 "동시 만들기 둘" 이 같은 순서 값 또는 교착 409 로 실패한다(하나만 지우면 다른 하나가 줄을 세운다). ② `tree()` 의 `.on('p.depth', '=', 1)` 을 지우면 자기 행 · 조상 행이 상위 팀으로 읽혀 "루트 여럿" 이 실패한다. 보고서에 적고 되돌린다.

- [ ] **Step 7: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/teams/team-locks.ts packages/admin-server/src/teams/teams.service.ts packages/admin-server/src/test-support/teams.ts packages/admin-server/src/teams/teams.service.db.test.ts
git add packages/admin-server/src/teams/team-locks.ts packages/admin-server/src/teams/teams.service.ts packages/admin-server/src/test-support/teams.ts packages/admin-server/src/teams/teams.service.db.test.ts
git commit -m "feat(admin-server): 팀 서비스 — 트리(루트 여럿) · 만들기(가드 · 자기 행 · 조상 쌍) · 이름 바꾸기(409 uq_teams_name)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 이동 — 검사 순서 · closure 다시 쓰기 · 형제 다시 매김 · 경합(b1 · b2 · c1 · s1)

**Files:**

- Modify: `packages/admin-server/src/teams/teams.service.ts`(`move` 를 더한다)
- Create: `packages/admin-server/src/teams/teams.move.db.test.ts`

**Interfaces:**

- Consumes: Task 4 `planTeamMove` · `closurePairs` · `moveCycle` · `beforeTeamError` · `TEAM_MESSAGES`, Task 5 `lockTeamRow` · `lockAncestors` · `lockDescendants` · `lockParentTeam` · `lockSiblings` · `TeamPlacement`, 2d-2 `AdminUsersService.list` · `adminUserListQuerySchema`.
- Produces: `AdminTeamsService.move(teamNo: bigint, body: AdminTeamMoveBody): Promise<{ before: TeamPlacement; after: TeamPlacement }>` — 제자리면 `after` 가 `before` 와 같고 쓰기가 없다.

- [ ] **Step 1: 이동 DB 테스트를 쓴다**

`packages/admin-server/src/teams/teams.move.db.test.ts`:

```ts
import {
  BusinessError,
  CommonErrorCodes,
  siblingMove,
  type AdminTeamNode,
} from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedUser } from '../test-support/auth.js'
import { settle, snapshotKysely, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { closure, closureOf, displayOrders, outline, seedTeamUnder } from '../test-support/teams.js'
import { adminUserListQuerySchema } from '../users/users.query.js'
import { AdminUsersService } from '../users/users.service.js'
import { TEAM_MESSAGES } from './errors.js'
import { AdminTeamsService } from './teams.service.js'

// 팀 이동(2e 스펙 §5-5 · B6 · B8 · B10 · §9-3 [1]). 🔴 팀 이름은 대소문자만으로 가르지 않는다(ci 콜레이션).

let t: TestDatabase
let service: AdminTeamsService

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminTeamsService(t.db)
})

afterAll(async () => {
  await t?.drop()
})

async function create(teamName: string, parentTeamNo: bigint | null): Promise<bigint> {
  return (await service.create({ teamName, parentTeamNo })).teamNo
}

function findNode(nodes: readonly AdminTeamNode[], teamNo: bigint): AdminTeamNode | undefined {
  for (const node of nodes) {
    if (node.teamNo === teamNo) return node
    const found = findNode(node.children, teamNo)
    if (found !== undefined) return found
  }
  return undefined
}

/** 그 상위 팀(null = 최상위)의 자식 이름 — 트리 순 */
async function childrenOf(parentTeamNo: bigint | null): Promise<string[]> {
  const items = (await service.tree()).items
  const nodes = parentTeamNo === null ? items : (findNode(items, parentTeamNo)?.children ?? [])
  return nodes.map((node) => node.teamName)
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

const issuePath = (error: BusinessError) =>
  (error.details as { issues: { path: unknown[] }[] }).issues[0]?.path

describe('같은 상위 팀', () => {
  it('기준 앞 · 끝 · 제자리 — before · after 를 돌려주고 제자리는 쓰지 않는다', async () => {
    const p = await create('sm-P', null)
    const s1 = await create('sm-1', p)
    const s2 = await create('sm-2', p)
    const s3 = await create('sm-3', p)
    expect(await service.move(s3, { parentTeamNo: p, beforeTeamNo: s2 })).toEqual({
      before: { parentTeamNo: p, displayOrder: 2 },
      after: { parentTeamNo: p, displayOrder: 1 },
    })
    expect(await childrenOf(p)).toEqual(['sm-1', 'sm-3', 'sm-2'])
    await service.move(s1, { parentTeamNo: p, beforeTeamNo: null })
    expect(await childrenOf(p)).toEqual(['sm-3', 'sm-2', 'sm-1'])
    expect(await displayOrders(t.db, [s1, s2, s3])).toEqual([
      [s1, 2],
      [s2, 1],
      [s3, 0],
    ])
    expect(await service.move(s1, { parentTeamNo: p, beforeTeamNo: null })).toEqual({
      before: { parentTeamNo: p, displayOrder: 2 },
      after: { parentTeamNo: p, displayOrder: 2 },
    })
  })

  it('🔴 동률 · 빈 번호 시드에서 siblingMove 대로 정확히 한 칸 — 그 묶음이 0..n-1 이 된다(Review Focus 1)', async () => {
    const p = await seedTeamUnder(t.db, { teamName: 'tie-P', parentTeamNo: null })
    const a = await seedTeamUnder(t.db, { teamName: 'tie-first', parentTeamNo: p })
    const b = await seedTeamUnder(t.db, { teamName: 'tie-second', parentTeamNo: p })
    const c = await seedTeamUnder(t.db, { teamName: 'tie-third', parentTeamNo: p })
    const up = siblingMove((await service.tree()).items, c, 'up')
    if (up === null) throw new Error('위로 갈 수 있어야 한다')
    await service.move(c, { parentTeamNo: up.parentTeamNo, beforeTeamNo: up.beforeTeamNo })
    expect(await childrenOf(p)).toEqual(['tie-first', 'tie-third', 'tie-second'])
    expect(await displayOrders(t.db, [a, b, c])).toEqual([
      [a, 0],
      [b, 2],
      [c, 1],
    ])

    const q = await seedTeamUnder(t.db, { teamName: 'gap-P', parentTeamNo: null })
    const x = await seedTeamUnder(t.db, { teamName: 'gap-x', parentTeamNo: q, displayOrder: 10 })
    const y = await seedTeamUnder(t.db, { teamName: 'gap-y', parentTeamNo: q, displayOrder: 20 })
    const z = await seedTeamUnder(t.db, { teamName: 'gap-z', parentTeamNo: q, displayOrder: 30 })
    const down = siblingMove((await service.tree()).items, x, 'down')
    if (down === null) throw new Error('아래로 갈 수 있어야 한다')
    await service.move(x, { parentTeamNo: down.parentTeamNo, beforeTeamNo: down.beforeTeamNo })
    expect(await childrenOf(q)).toEqual(['gap-y', 'gap-x', 'gap-z'])
    expect(await displayOrders(t.db, [x, y, z])).toEqual([
      [x, 1],
      [y, 0],
      [z, 2],
    ])
  })
})

describe('다른 상위 팀', () => {
  it('깊이 2 서브트리 — closure 전체가 기대 쌍과 같다 · 받는 쪽 끝 · 떠난 쪽은 빈 번호', async () => {
    const r1 = await create('mv-R1', null)
    const r2 = await create('mv-R2', null)
    const keep = await create('mv-keep', r1)
    const mid = await create('mv-mid', r1)
    const leaf = await create('mv-leaf', mid)
    const deep = await create('mv-deep', leaf)
    const z = await create('mv-z', r2)
    expect(await service.move(mid, { parentTeamNo: r2, beforeTeamNo: null })).toEqual({
      before: { parentTeamNo: r1, displayOrder: 1 },
      after: { parentTeamNo: r2, displayOrder: 1 },
    })
    expect(await closureOf(t.db, [mid, leaf, deep])).toEqual(
      closure(
        [mid, mid, 0],
        [r2, mid, 1],
        [leaf, leaf, 0],
        [mid, leaf, 1],
        [r2, leaf, 2],
        [deep, deep, 0],
        [leaf, deep, 1],
        [mid, deep, 2],
        [r2, deep, 3],
      ),
    )
    expect(await childrenOf(r1)).toEqual(['mv-keep'])
    expect(await childrenOf(r2)).toEqual(['mv-z', 'mv-mid'])
    expect(await displayOrders(t.db, [keep, z])).toEqual([
      [keep, 0],
      [z, 0],
    ])
  })

  it('기준 형제 앞으로 — 받는 묶음이 다시 매겨진다', async () => {
    const from = await create('bf-from', null)
    const to = await create('bf-to', null)
    const moving = await create('bf-moving', from)
    const first = await create('bf-first', to)
    const second = await create('bf-second', to)
    await service.move(moving, { parentTeamNo: to, beforeTeamNo: second })
    expect(await childrenOf(to)).toEqual(['bf-first', 'bf-moving', 'bf-second'])
    expect(await displayOrders(t.db, [moving, first, second])).toEqual([
      [moving, 1],
      [first, 0],
      [second, 2],
    ])
  })

  it('🔴 최상위로 — 다른 루트 바로 앞에 서고 closure 에 바깥 조상이 없다(Review Focus 5)', async () => {
    const root = await create('top-root', null)
    const after = await create('top-after', null)
    const child = await create('top-child', root)
    const grand = await create('top-grand', child)
    await service.move(child, { parentTeamNo: null, beforeTeamNo: after })
    const roots = await childrenOf(null)
    expect(roots.indexOf('top-child')).toBe(roots.indexOf('top-after') - 1)
    expect(await closureOf(t.db, [child, grand])).toEqual(
      closure([child, child, 0], [grand, grand, 0], [child, grand, 1]),
    )
    expect(await childrenOf(root)).toEqual([])
  })
})

describe('검사(B10)', () => {
  it('🔴 자기 자신 · 하위 팀 아래로는 400 ERR_TEAM_MOVE_CYCLE — closure 는 그대로', async () => {
    const top = await create('cy-top', null)
    const sub = await create('cy-sub', top)
    const before = await closureOf(t.db, [top, sub])
    for (const parentTeamNo of [top, sub]) {
      const error = await failure(service.move(top, { parentTeamNo, beforeTeamNo: null }))
      expect(error.code).toBe(CommonErrorCodes.ERR_TEAM_MOVE_CYCLE)
      expect(error.message).toBe(TEAM_MESSAGES.moveCycle)
    }
    expect(await closureOf(t.db, [top, sub])).toEqual(before)
  })

  it('기준 팀이 받는 쪽 자식이 아니면 · 대상 자신이면 400 issues beforeTeamNo', async () => {
    const p = await create('bv-P', null)
    const other = await create('bv-other', null)
    const moving = await create('bv-moving', p)
    const stranger = await create('bv-stranger', other)
    const notSibling = await failure(
      service.move(moving, { parentTeamNo: p, beforeTeamNo: stranger }),
    )
    expect(notSibling.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(notSibling.message).toBe(TEAM_MESSAGES.beforeNotSibling)
    expect(issuePath(notSibling)).toEqual(['beforeTeamNo'])
    const self = await failure(service.move(moving, { parentTeamNo: p, beforeTeamNo: moving }))
    expect(self.message).toBe(TEAM_MESSAGES.beforeIsSelf)
    expect(issuePath(self)).toEqual(['beforeTeamNo'])
  })

  it('없는 대상 404 팀 문구 · 없는 상위 팀 404 상위 팀 문구', async () => {
    const missing = await failure(
      service.move(999_997n, { parentTeamNo: null, beforeTeamNo: null }),
    )
    expect(missing.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(missing.message).toBe(TEAM_MESSAGES.noTeam)
    const team = await create('nf-team', null)
    const noParent = await failure(
      service.move(team, { parentTeamNo: 999_996n, beforeTeamNo: null }),
    )
    expect(noParent.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(noParent.message).toBe(TEAM_MESSAGES.noParentTeam)
  })
})

describe('자기 행 없는 시드', () => {
  it('🔴 손으로 넣은 closure(자기 행 없음)에서도 이동이 맞다 — 자기 행을 만들지도 않는다(④ C1 · Review Focus 3)', async () => {
    const q0 = await seedTeamUnder(t.db, { teamName: 'ns-Q0', parentTeamNo: null, selfRow: false })
    const q1 = await seedTeamUnder(t.db, { teamName: 'ns-Q1', parentTeamNo: q0, selfRow: false })
    const q2 = await seedTeamUnder(t.db, { teamName: 'ns-Q2', parentTeamNo: q1, selfRow: false })
    const q3 = await seedTeamUnder(t.db, { teamName: 'ns-Q3', parentTeamNo: null, selfRow: false })
    await service.move(q1, { parentTeamNo: q3, beforeTeamNo: null })
    expect(await closureOf(t.db, [q1, q2])).toEqual(closure([q3, q1, 1], [q1, q2, 1], [q3, q2, 2]))
    expect(outline((await service.tree()).items).filter((path) => path.startsWith('ns-'))).toEqual([
      'ns-Q0',
      'ns-Q3',
      'ns-Q3/ns-Q1',
      'ns-Q3/ns-Q1/ns-Q2',
    ])
  })
})

describe('경합', () => {
  /** 원시 연결이 가드를 쥐고 mid · leaf 를 from 아래에서 to 아래로 옮기는 중(closure 미커밋) */
  const movingUnder =
    (mid: bigint, leaf: bigint, from: bigint, to: bigint) => async (connection: Connection) => {
      await connection.query(
        "select lock_name from guard_locks where lock_name = 'teamTree' for update",
      )
      await connection.query(
        'delete from team_closure where descendant_no in (?, ?) and ancestor_no in (?)',
        [mid, leaf, from],
      )
      await connection.query(
        'insert into team_closure (ancestor_no, descendant_no, depth) values (?, ?, 1), (?, ?, 2)',
        [to, mid, to, leaf],
      )
    }

  it('🔴 (b1) 이동 중의 하위 팀 만들기는 기다렸다가 새 조상으로 closure 를 만든다', async () => {
    const r1 = await create('b1-R1', null)
    const r2 = await create('b1-R2', null)
    const mid = await create('b1-mid', r1)
    const leaf = await create('b1-leaf', mid)
    const result = await whileHeld(t, movingUnder(mid, leaf, r1, r2), () =>
      service.create({ teamName: 'b1-new', parentTeamNo: leaf }),
    )
    if (!result.ok) throw result.error
    const made = result.value.teamNo
    expect(await closureOf(t.db, [made])).toEqual(
      closure([made, made, 0], [leaf, made, 1], [mid, made, 2], [r2, made, 3]),
    )
  })

  it('(b2) 같은 상황의 사용자 목록(하위 팀 포함)은 커밋 전 옛 집합 · 뒤 새 집합 — 섞이지 않는다', async () => {
    const r1 = await create('b2-R1', null)
    const r2 = await create('b2-R2', null)
    const mid = await create('b2-mid', r1)
    const leaf = await create('b2-leaf', mid)
    const roleNo = await seedRole(t.db, { roleName: 'b2-role', permissions: [] })
    const onMid = await seedUser(t.db, { roleNo, userId: 'b2-on-mid' })
    const onLeaf = await seedUser(t.db, { roleNo, userId: 'b2-on-leaf' })
    await addToTeam(t.db, mid, onMid.userNo)
    await addToTeam(t.db, leaf, onLeaf.userNo)
    const users = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db))
    const under = async (teamNo: bigint) =>
      (
        await users.list(
          adminUserListQuerySchema.parse({
            itemsPerPage: 100,
            filter: { teamNo: String(teamNo), recursive: 'true' },
          }),
        )
      ).items
        .map((user) => user.userId)
        .sort()
    const result = await whileHeld(t, movingUnder(mid, leaf, r1, r2), async () => ({
      r1: await under(r1),
      r2: await under(r2),
    }))
    if (!result.ok) throw result.error
    expect(result.value).toEqual({ r1: ['b2-on-leaf', 'b2-on-mid'], r2: [] })
    expect(await under(r1)).toEqual([])
    expect(await under(r2)).toEqual(['b2-on-leaf', 'b2-on-mid'])
  })

  it('🔴 (c1) 겹치지 않는 행을 잠그는 이동 둘(왼쪽 → 오른쪽 자식 아래, 오른쪽 → 왼쪽 자식 아래)은 하나만 된다 — 순환이 없다', async () => {
    const root = await create('c1-root', null)
    const left = await create('c1-left', root)
    const leftChild = await create('c1-left-child', left)
    const right = await create('c1-right', root)
    const rightChild = await create('c1-right-child', right)
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query(
          "select lock_name from guard_locks where lock_name = 'teamTree' for update",
        ),
      () =>
        Promise.all([
          settle(service.move(left, { parentTeamNo: rightChild, beforeTeamNo: null })),
          settle(service.move(right, { parentTeamNo: leftChild, beforeTeamNo: null })),
        ]),
      { waiters: 2 },
    )
    if (!result.ok) throw result.error
    const outcomes = result.value
      .map((outcome) => (outcome.ok ? 'ok' : String((outcome.error as BusinessError).code)))
      .sort()
    expect(outcomes).toEqual([CommonErrorCodes.ERR_TEAM_MOVE_CYCLE, 'ok'])
    const rows = await closureOf(t.db, [left, leftChild, right, rightChild])
    expect(rows.filter((row) => row.ancestorNo === row.descendantNo && row.depth > 0)).toEqual([])
    expect(
      outline((await service.tree()).items).filter((path) => path.startsWith('c1-')),
    ).toHaveLength(5)
  })

  it('🔴 (s1) 스냅샷 격리 ON — 가드를 기다린 이동은 그사이 이름이 바뀐 형제를 다시 매겨도 1020 이 아니다(B5)', async () => {
    const p = await create('s1-P', null)
    const first = await create('s1-first', p)
    const second = await create('s1-second', p)
    const snapshotDb = await snapshotKysely(t, true)
    try {
      const onSnapshot = new AdminTeamsService(snapshotDb)
      const result = await whileHeld(
        t,
        async (connection) => {
          await connection.query(
            "select lock_name from guard_locks where lock_name = 'teamTree' for update",
          )
          await connection.query('update teams set team_name = ? where team_no = ?', [
            's1-first-renamed',
            first,
          ])
        },
        () => onSnapshot.move(second, { parentTeamNo: p, beforeTeamNo: first }),
      )
      if (!result.ok) throw result.error
      expect(await childrenOf(p)).toEqual(['s1-second', 's1-first-renamed'])
    } finally {
      await snapshotDb.destroy()
    }
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db teams.move`
Expected: FAIL — `service.move is not a function`.

- [ ] **Step 3: `move` 를 더한다**

`packages/admin-server/src/teams/teams.service.ts`:

① import 를 바꾼다:

```ts
import type {
  AdminTeamCreate,
  AdminTeamMoveBody,
  AdminTeamNode,
  AdminTeamRename,
} from '@ssworks/admin-shared'
```

```ts
import { TEAM_MESSAGES, beforeTeamError, duplicateTeamName, moveCycle } from './errors.js'
import { closurePairs, planTeamMove, type ClosureLink } from './move.js'
import {
  lockAncestors,
  lockDescendants,
  lockParentTeam,
  lockSiblings,
  lockTeamRow,
} from './team-locks.js'
```

② `rename` 다음에 메서드를 더한다:

```ts
  /**
   * 기준 형제 앞(null 이면 끝)으로 — 받는 형제 묶음을 0..n-1 로 다시 매긴다(⑤ O1 · B8). 상위 팀이 바뀌면 closure 를 앱이 셈한
   * 쌍으로 다시 쓴다(B6). 검사 순서는 B10. 🔴 재인증 · revision 이 없다(3d §9).
   */
  async move(
    teamNo: bigint,
    body: AdminTeamMoveBody,
  ): Promise<{ before: TeamPlacement; after: TeamPlacement }> {
    if (body.beforeTeamNo === teamNo) throw beforeTeamError(TEAM_MESSAGES.beforeIsSelf)
    return runWriteTransaction(this.db, async (trx) => {
      // 🔴 첫 문장(① G1) — 서브트리 · 상위 팀 · 형제 읽기가 모두 앞선 팀 쓰기의 커밋 뒤를 본다
      await lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)
      const target = await lockTeamRow(trx, teamNo)
      const oldAncestors = await lockAncestors(trx, teamNo)
      // 🔴 대상은 따로 넣는다 — closure 자기 행에 기대지 않는다(④ C1)
      const subtree: ClosureLink[] = [
        { teamNo, depth: 0 },
        ...(await lockDescendants(trx, teamNo)).map((link) => ({
          teamNo: link.teamNo,
          depth: link.depth,
        })),
      ]
      const parentTeamNo = body.parentTeamNo
      // 🔴 자기 자신 · 하위 팀 아래로는 못 간다 — hangang 에 없던 검사(3d §9). 받아들이면 closure 가 순환 · 고립된다
      if (parentTeamNo !== null && subtree.some((link) => link.teamNo === parentTeamNo)) {
        throw moveCycle()
      }
      let newAncestors: ClosureLink[] = []
      if (parentTeamNo !== null) {
        await lockParentTeam(trx, parentTeamNo)
        newAncestors = [
          { teamNo: parentTeamNo, depth: 0 },
          ...(await lockAncestors(trx, parentTeamNo)),
        ]
      }
      const siblings = await lockSiblings(trx, parentTeamNo, teamNo)
      const beforeTeamNo = body.beforeTeamNo
      if (beforeTeamNo !== null && !siblings.some((sibling) => sibling.teamNo === beforeTeamNo)) {
        throw beforeTeamError(TEAM_MESSAGES.beforeNotSibling)
      }
      const sameParent = parentTeamNo === target.parentTeamNo
      const plan = planTeamMove(
        siblings,
        { teamNo, displayOrder: target.displayOrder },
        beforeTeamNo,
        sameParent,
      )
      const before: TeamPlacement = {
        parentTeamNo: target.parentTeamNo,
        displayOrder: target.displayOrder,
      }
      if (plan.unchanged) return { before, after: before }
      if (!sameParent) {
        // 옛 바깥 조상 × 서브트리를 지우고 새 조상 × 서브트리를 넣는다. 서브트리 안 쌍(자기 행 포함)은 그대로 둔다(B6)
        const oldAncestorNos = oldAncestors.map((link) => link.teamNo)
        if (oldAncestorNos.length > 0) {
          await trx
            .deleteFrom('teamClosure')
            .where(
              'descendantNo',
              'in',
              subtree.map((link) => link.teamNo),
            )
            .where('ancestorNo', 'in', oldAncestorNos)
            .execute()
        }
        const rows = closurePairs(newAncestors, subtree)
        if (rows.length > 0) await trx.insertInto('teamClosure').values(rows).execute()
      }
      for (const update of plan.updates) {
        await trx
          .updateTable('teams')
          .set({ displayOrder: update.displayOrder })
          .where('teamNo', '=', update.teamNo)
          .execute()
      }
      return { before, after: { parentTeamNo, displayOrder: plan.targetOrder } }
    })
  }
```

- [ ] **Step 4: GREEN**

```bash
pnpm --filter @ssworks/admin-server test:db teams
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS(`teams.service` · `teams.move`). 🔴 RED 한 번 더(셋, 하나씩): ① `move` 의 `lockGuardRow` 줄을 지우면 (c1) 이 `ERR_TEAM_MOVE_CYCLE` 하나가 아니라 교착 409(`ERR_COMMON_CONFLICT`) 이거나 둘 다 성공해 순환이 남는다. ② `lockGuardRow` 줄 **앞에** `await trx.selectFrom('teams').select('teamNo').where('teamNo', '=', teamNo).execute()` 를 두면 (s1) 이 409(원인 1020)다. ③ 순환 검사 `if` 를 지우면 "자기 자신 · 하위 팀" 이 실패한다. 보고서에 적고 되돌린다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/teams/teams.service.ts packages/admin-server/src/teams/teams.move.db.test.ts
git add packages/admin-server/src/teams/teams.service.ts packages/admin-server/src/teams/teams.move.db.test.ts
git commit -m "feat(admin-server): 팀 이동 — 순환 400 · 기준 형제 400 · closure 다시 쓰기 · 받는 형제 다시 매김 · 가드 경합" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 삭제 — 잠금 뒤 소속 셈 · 경합(a1 · a2) · `replaceTeam` 같은 팀 건너뛰기

**Files:**

- Modify: `packages/admin-server/src/teams/teams.service.ts`(`remove` 를 더한다)
- Create: `packages/admin-server/src/teams/teams.delete.db.test.ts`
- Modify: `packages/admin-server/src/users/user-locks.ts`(`replaceTeam`)
- Create: `packages/admin-server/src/users/users.team.db.test.ts`

**Interfaces:**

- Consumes: Task 4 `teamHasMembers`, Task 5 `lockTeamRow` · `lockDescendants` · `TeamAuditView`, 2d-2 `AdminUsersService.create` · `update`.
- Produces: `AdminTeamsService.remove(teamNo: bigint): Promise<{ before: TeamAuditView; descendants: { teamNo: bigint; teamName: string }[] }>`. `replaceTeam(trx, userNo, teamNo)` 의 시그니처는 그대로.

- [ ] **Step 1: 삭제 · 소속 테스트를 쓴다**

`packages/admin-server/src/teams/teams.delete.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedUser } from '../test-support/auth.js'
import { whileHeld, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { closureOf, seedTeamUnder } from '../test-support/teams.js'
import { AdminUsersService } from '../users/users.service.js'
import { TEAM_MESSAGES } from './errors.js'
import { AdminTeamsService } from './teams.service.js'

// 팀 삭제(2e 스펙 §5-6 · ② D1 · ③ M1 · B4 · B7 · §9-3 [1]).

let t: TestDatabase
let service: AdminTeamsService
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminTeamsService(t.db)
  roleNo = await seedRole(t.db, { roleName: 'dl-role', permissions: [] })
})

afterAll(async () => {
  await t?.drop()
})

async function create(teamName: string, parentTeamNo: bigint | null): Promise<bigint> {
  return (await service.create({ teamName, parentTeamNo })).teamNo
}

const existing = async (teamNos: bigint[]) =>
  (
    await t.db
      .selectFrom('teams')
      .select('teamNo')
      .where('teamNo', 'in', teamNos)
      .orderBy('teamNo')
      .execute()
  ).map((row) => row.teamNo)

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

describe('삭제', () => {
  it('하위 팀째 지우고 closure 를 정리한다 — before · 하위 팀 목록(깊이 · 순서 순)', async () => {
    const root = await create('dl-root', null)
    const target = await create('dl-target', root)
    const c1 = await create('dl-c1', target)
    const c2 = await create('dl-c2', target)
    const grand = await create('dl-grand', c1)
    const keep = await create('dl-keep', root)
    expect(await service.remove(target)).toEqual({
      before: { teamName: 'dl-target', parentTeamNo: root },
      descendants: [
        { teamNo: c1, teamName: 'dl-c1' },
        { teamNo: c2, teamName: 'dl-c2' },
        { teamNo: grand, teamName: 'dl-grand' },
      ],
    })
    expect(await existing([target, c1, c2, grand])).toEqual([])
    expect(await closureOf(t.db, [target, c1, c2, grand])).toEqual([])
    expect(await existing([root, keep])).toEqual([root, keep])
  })

  it('하위 팀이 없으면 descendants 는 [] · 최상위 팀의 parentTeamNo 는 null', async () => {
    const lone = await create('dl-lone', null)
    expect(await service.remove(lone)).toEqual({
      before: { teamName: 'dl-lone', parentTeamNo: null },
      descendants: [],
    })
  })

  it('🔴 퇴사자만 소속된 하위 팀 · 두 팀에 걸친 한 계정 — 409 memberCount 1, 아무것도 지우지 않는다(③ M1 · Review Focus 4)', async () => {
    const top = await create('dl-top', null)
    const sub1 = await create('dl-sub1', top)
    const sub2 = await create('dl-sub2', top)
    const resigned = await seedUser(t.db, {
      roleNo,
      userId: 'dl-resigned',
      resignAt: new Date(Date.now() - 86_400_000),
    })
    await addToTeam(t.db, sub1, resigned.userNo)
    await addToTeam(t.db, sub2, resigned.userNo)
    const error = await failure(service.remove(top))
    expect(error.code).toBe(CommonErrorCodes.ERR_TEAM_HAS_MEMBERS)
    expect(error.message).toBe(TEAM_MESSAGES.teamHasMembers)
    expect(error.details).toEqual({ memberCount: 1 })
    expect(await existing([top, sub1, sub2])).toEqual([top, sub1, sub2])
  })

  it('없는 팀 404', async () => {
    const error = await failure(service.remove(999_995n))
    expect(error.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(error.message).toBe(TEAM_MESSAGES.noTeam)
  })

  it('🔴 자기 행 없는 시드도 대상까지 지운다(④ C1 · B7 — hangang 은 자기 행이 없으면 대상이 남았다)', async () => {
    const parent = await seedTeamUnder(t.db, {
      teamName: 'dn-parent',
      parentTeamNo: null,
      selfRow: false,
    })
    const child = await seedTeamUnder(t.db, {
      teamName: 'dn-child',
      parentTeamNo: parent,
      selfRow: false,
    })
    await service.remove(parent)
    expect(await existing([parent, child])).toEqual([])
  })
})

describe('경합', () => {
  it('🔴 (a1) 소속을 넣는 중인 팀의 조상을 지우면 기다렸다가 그 소속을 보고 409 — 소속이 남는다(② D1)', async () => {
    const parent = await create('a1-parent', null)
    const child = await create('a1-child', parent)
    const user = await seedUser(t.db, { roleNo, userId: 'a1-joining' })
    const result = await whileHeld(
      t,
      async (connection) => {
        await connection.query('select team_no from teams where team_no = ? for update', [child])
        await connection.query('insert into team_user_map (team_no, user_no) values (?, ?)', [
          child,
          user.userNo,
        ])
      },
      () => service.remove(parent),
    )
    if (result.ok) throw new Error('409 를 기대했다')
    expect((result.error as BusinessError).code).toBe(CommonErrorCodes.ERR_TEAM_HAS_MEMBERS)
    expect((result.error as BusinessError).details).toEqual({ memberCount: 1 })
    expect(
      await t.db
        .selectFrom('teamUserMap')
        .select('teamNo')
        .where('userNo', '=', user.userNo)
        .execute(),
    ).toEqual([{ teamNo: child }])
  })

  it('🔴 (a2) 지우는 중인 팀으로의 사용자 만들기 · 수정은 기다렸다가 400 issues teamNo(이월 8 — lockTeam 의 forUpdate)', async () => {
    const goneForCreate = await create('a2-gone-create', null)
    const goneForUpdate = await create('a2-gone-update', null)
    const member = await seedUser(t.db, { roleNo, userId: 'a2-member' })
    const users = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db))
    const root = testPrincipal(900n, ['*'])
    const deleting = (teamNo: bigint) => async (connection: Connection) => {
      await connection.query(
        "select lock_name from guard_locks where lock_name = 'teamTree' for update",
      )
      await connection.query('select team_no from teams where team_no = ? for update', [teamNo])
      await connection.query('delete from teams where team_no in (?)', [teamNo])
    }
    const expectTeamField = (result: Settled<unknown>) => {
      if (result.ok) throw new Error('400 을 기대했다')
      const error = result.error as BusinessError
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect((error.details as { issues: { path: unknown[] }[] }).issues[0]?.path).toEqual([
        'teamNo',
      ])
    }
    expectTeamField(
      await whileHeld(t, deleting(goneForCreate), () =>
        users.create(
          { userId: 'a2-new', userName: '새 계정', roleNo, teamNo: goneForCreate },
          root,
        ),
      ),
    )
    expectTeamField(
      await whileHeld(t, deleting(goneForUpdate), () =>
        users.update(member.userNo, { revision: 0, teamNo: goneForUpdate }, root),
      ),
    )
  })
})
```

`packages/admin-server/src/users/users.team.db.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminUsersService } from './users.service.js'

// 사용자 팀 소속 쓰기(replaceTeam) — 같은 팀이면 건너뛴다(2e 스펙 B13 · 이월 6).

let t: TestDatabase
let service: AdminUsersService
let roleNo: bigint
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db))
  roleNo = await seedRole(t.db, { roleName: 'ut-role', permissions: [] })
})

afterAll(async () => {
  await t?.drop()
})

const membership = (userNo: bigint) =>
  t.db
    .selectFrom('teamUserMap')
    .select(['teamNo', 'joinAt'])
    .where('userNo', '=', userNo)
    .orderBy('teamNo')
    .execute()

describe('replaceTeam', () => {
  it('🔴 같은 팀으로 다시 저장해도 배정 시각(joinAt)이 그대로다(B13)', async () => {
    const team = await seedTeam(t.db, 'ut-same')
    const user = await seedUser(t.db, { roleNo, userId: 'ut-same-user' })
    const assigned = new Date('2026-01-02T03:04:05.000Z')
    await t.db
      .insertInto('teamUserMap')
      .values({ teamNo: team, userNo: user.userNo, joinAt: assigned })
      .execute()
    await service.update(user.userNo, { revision: 0, teamNo: team }, root)
    expect(await membership(user.userNo)).toEqual([{ teamNo: team, joinAt: assigned }])
  })

  it('두 팀 소속에 그중 한 팀을 주면 하나로 줄어든다', async () => {
    const a = await seedTeam(t.db, 'ut-two-a')
    const b = await seedTeam(t.db, 'ut-two-b')
    const user = await seedUser(t.db, { roleNo, userId: 'ut-two-user' })
    await t.db
      .insertInto('teamUserMap')
      .values([
        { teamNo: a, userNo: user.userNo },
        { teamNo: b, userNo: user.userNo },
      ])
      .execute()
    await service.update(user.userNo, { revision: 0, teamNo: a }, root)
    expect((await membership(user.userNo)).map((row) => row.teamNo)).toEqual([a])
  })

  it('빈 소속에 null 이면 아무것도 쓰지 않고 통과한다', async () => {
    const user = await seedUser(t.db, { roleNo, userId: 'ut-none-user' })
    await service.update(user.userNo, { revision: 0, teamNo: null }, root)
    expect(await membership(user.userNo)).toEqual([])
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run:

```bash
pnpm --filter @ssworks/admin-server test:db teams.delete
pnpm --filter @ssworks/admin-server test:db users.team
```

Expected: `teams.delete` FAIL — `service.remove is not a function`(경합 a2 는 이미 초록일 수 있다 — 2d-2 의 `lockTeam` 이 `forUpdate` 다). `users.team` 의 첫 테스트 FAIL — `joinAt` 이 지금 시각으로 바뀌었다(지우고 넣는다).

- [ ] **Step 3: `remove` 를 더한다**

`packages/admin-server/src/teams/teams.service.ts`:

① errors import 에 `teamHasMembers` 를 더한다:

```ts
import {
  TEAM_MESSAGES,
  beforeTeamError,
  duplicateTeamName,
  moveCycle,
  teamHasMembers,
} from './errors.js'
```

② `move` 다음에 메서드를 더한다:

```ts
  /**
   * 하위 팀째 지운다 — 서브트리에 소속 계정이 있으면 409(퇴사자 포함 · ③ M1). closure · 소속은 FK CASCADE(B7). 🔴 대상은 따로
   * 넣는다 — 자기 행에 기대지 않는다(④ C1).
   */
  async remove(
    teamNo: bigint,
  ): Promise<{ before: TeamAuditView; descendants: { teamNo: bigint; teamName: string }[] }> {
    return runWriteTransaction(this.db, async (trx) => {
      // 🔴 첫 문장(① G1)
      await lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)
      const target = await lockTeamRow(trx, teamNo)
      const descendants = await lockDescendants(trx, teamNo)
      const teamNos = [teamNo, ...descendants.map((link) => link.teamNo)]
      // 🔴 비잠금 셈 — 이 트랜잭션의 첫 비잠금 읽기다(② D1 · B4). 소속을 더하는 길은 모두 그 팀 행을 먼저 잡는다(사용자 쓰기의
      //    lockTeam X, 그 밖의 INSERT 는 FK 검사의 S) — 서브트리 팀 행을 X 로 쥔 지금은 새 소속이 생길 수 없고, 지금 여는
      //    읽기 뷰는 기다리는 사이 커밋된 소속을 본다. 이 앞에 비잠금 읽기를 두면 읽기 뷰가 먼저 열려 셈이 0 을 보고
      //    DELETE 의 CASCADE 가 그 소속을 조용히 지운다(스펙 §14 R1-1 — hangang A3 가 막으려던 것). FOR UPDATE 로 세면
      //    teamUserMap 구간의 gap 잠금이 사용자 팀 변경과 엇갈려 교착한다(R1-3 — ② D2 를 고르지 않았다).
      const counted = await trx
        .selectFrom('teamUserMap')
        .select((eb) => eb.fn.count<number | string | bigint>('userNo').distinct().as('n'))
        .where('teamNo', 'in', teamNos)
        .executeTakeFirstOrThrow()
      const memberCount = Number(counted.n)
      if (memberCount > 0) throw teamHasMembers(memberCount)
      await trx.deleteFrom('teams').where('teamNo', 'in', teamNos).execute()
      return {
        before: { teamName: target.teamName, parentTeamNo: target.parentTeamNo },
        descendants: descendants.map((link) => ({ teamNo: link.teamNo, teamName: link.teamName })),
      }
    })
  }
```

- [ ] **Step 4: `replaceTeam` 이 같은 팀을 건너뛰게 한다**

`packages/admin-server/src/users/user-locks.ts` 의 `replaceTeam` 을 바꾼다(주석 · 시그니처 위 한 줄 포함):

```ts
/**
 * 팀 하나로 바꾼다(⑨ T1 — axion 처럼 지우고 넣는다). null 이면 소속을 비운다.
 * 🔴 이미 그 팀 하나(또는 빈 소속에 null)면 쓰지 않는다 — 배정 시각 joinAt 이 그대로이고 gap 잠금이 줄어든다(2e 스펙 B13).
 *    잠금 순서는 users → roles → teams → teamUserMap 그대로다(지금 소속을 FOR UPDATE 로 읽는다 — 2d §14 R5-6).
 */
export async function replaceTeam(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
  teamNo: bigint | null,
): Promise<void> {
  if (teamNo !== null) await lockTeam(trx, teamNo)
  const current = await trx
    .selectFrom('teamUserMap')
    .select('teamNo')
    .where('userNo', '=', userNo)
    .forUpdate()
    .execute()
  const unchanged =
    teamNo === null ? current.length === 0 : current.length === 1 && current[0]?.teamNo === teamNo
  if (unchanged) return
  await trx.deleteFrom('teamUserMap').where('userNo', '=', userNo).execute()
  if (teamNo !== null) await trx.insertInto('teamUserMap').values({ teamNo, userNo }).execute()
}
```

- [ ] **Step 5: GREEN — 사용자 테스트까지**

```bash
pnpm --filter @ssworks/admin-server test:db teams
pnpm --filter @ssworks/admin-server test:db users
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: 모두 PASS. 🔴 RED 한 번 더(셋, 하나씩): ① `remove` 의 소속 셈을 `lockDescendants` **앞으로** 옮기면 (a1) 이 200 이 되고 소속이 사라진다(`teamUserMap` 이 `[]`). ② `user-locks.ts` `lockTeam` 의 `.forUpdate()` 를 지우면 (a2) 가 400 `ERR_COMMON_BAD_REQUEST`(FK 위반 — `issues` 없음)로 실패한다. ③ `replaceTeam` 의 `if (unchanged) return` 을 지우면 B13 첫 테스트가 실패한다. 보고서에 적고 되돌린다.

- [ ] **Step 6: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/teams/teams.service.ts packages/admin-server/src/teams/teams.delete.db.test.ts packages/admin-server/src/users/user-locks.ts packages/admin-server/src/users/users.team.db.test.ts
git add packages/admin-server/src/teams/teams.service.ts packages/admin-server/src/teams/teams.delete.db.test.ts packages/admin-server/src/users/user-locks.ts packages/admin-server/src/users/users.team.db.test.ts
git commit -m "feat(admin-server): 팀 삭제 — 하위 팀째 · 잠금 뒤 소속 셈 409 · 경합, replaceTeam 같은 팀 건너뛰기(이월 6 · 8)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 컨트롤러 다섯 라우트 · `AdminTeamsModule` · 슬롯 둘 · 배선

**Files:**

- Modify: `packages/admin-server/src/auth/permission-slots.ts` · `permission-slots.test.ts`
- Create: `packages/admin-server/src/teams/teams.controller.ts` · `teams.module.ts` · `teams.module.test.ts`
- Modify: `packages/admin-server/src/admin-server.module.ts` · `index.ts`
- Modify: `packages/admin-server/src/test-support/accounts.ts` · `test-support/admin-app.ts`

**Interfaces:**

- Consumes: Task 5~7 `AdminTeamsService` 전부 · `TEAM_AUDIT_FIELDS` · `TEAM_RENAME_AUDIT_FIELDS` · `TEAM_MOVE_AUDIT_FIELDS`, Task 2 `CoreAuditActions.TEAM_*` · `CoreAuditTargets.TEAM`.
- Produces: `AdminTeamsModule`(index 에서 낸다), 슬롯 `'teams.read'` · `'teams.manage'`, 테스트 앱 `bootAdminApp` 이 팀 모듈을 싣고 `TEST_PERMISSIONS` 에 팀 슬롯 둘(`org.teams:read` · `org.teams:write`)을 잇는다.

- [ ] **Step 1: 모듈 · 슬롯 테스트를 쓴다(RED)**

`packages/admin-server/src/teams/teams.module.test.ts`:

```ts
import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_CATALOG } from '../test-support/accounts.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { AdminTeamsModule } from './teams.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = { 'teams.read': 'org.teams:read', 'teams.manage': 'org.teams:write' }

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
        permissionCatalog: TEST_CATALOG,
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminTeamsModule 배선', () => {
  it('뜨면 다섯 라우트가 /admin/teams 아래에 있고 쿠키 없이는 401(가드가 DB 에 닿기 전에 끝난다)', async () => {
    const app = await boot([AdminAuthModule, AdminTeamsModule])
    const server = app.getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/teams/tree'],
      ['post', '/admin/teams'],
      ['patch', '/admin/teams/1'],
      ['patch', '/admin/teams/1/move'],
      ['delete', '/admin/teams/1'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminTeamsModule])).rejects.toThrow(
      'AdminTeamsModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 팀 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminTeamsModule], { permissions: {} })).rejects.toThrow(
      'AdminTeamsModule 의 권한 슬롯이 이어지지 않았다: teams.read, teams.manage',
    )
  })

  it('permissionCatalog 없이도 뜬다 — 팀 모듈은 카탈로그를 읽지 않는다(§4-4)', async () => {
    await expect(
      boot([AdminAuthModule, AdminTeamsModule], { permissionCatalog: undefined }),
    ).resolves.toBeDefined()
  })

  it('감사 모듈과 함께 뜬다 — 팀 @Audit 액션이 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminTeamsModule], {
        permissions: { ...PERMISSIONS, 'auditLogs.read': 'setting.auditLog:read' },
      }),
    ).resolves.toBeDefined()
  })
})
```

`packages/admin-server/src/auth/permission-slots.test.ts` — `expect(ADMIN_PERMISSION_SLOTS).toEqual([…])` 의 목록 끝(`'users.manage',` 다음)에 `'teams.read',` · `'teams.manage',` 를 더한다.

Run: `pnpm --filter @ssworks/admin-server test teams.module` · `pnpm --filter @ssworks/admin-server test permission-slots`
Expected: FAIL — `./teams.module.js` 를 찾지 못한다 · 슬롯 목록이 다르다.

- [ ] **Step 2: 슬롯 둘을 더한다**

`packages/admin-server/src/auth/permission-slots.ts`:

```ts
/** 2c 의 셋 + 2d 의 역할 둘 · 사용자 둘 + 2e-1 의 팀 둘. 2e-2 · 2f 가 늘린다 — 유니온이 늘어나는 것은 하위 호환이다 */
export type AdminPermissionSlot =
  | 'sessions.read'
  | 'sessions.manage'
  | 'auditLogs.read'
  | 'roles.read'
  | 'roles.manage'
  | 'users.read'
  | 'users.manage'
  | 'teams.read'
  | 'teams.manage'

export const ADMIN_PERMISSION_SLOTS: readonly AdminPermissionSlot[] = Object.freeze([
  'sessions.read',
  'sessions.manage',
  'auditLogs.read',
  'roles.read',
  'roles.manage',
  'users.read',
  'users.manage',
  'teams.read',
  'teams.manage',
])
```

- [ ] **Step 3: 컨트롤러 · 모듈을 쓴다**

`packages/admin-server/src/teams/teams.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common'
import {
  CoreAuditActions,
  CoreAuditTargets,
  adminTeamCreateSchema,
  adminTeamMoveBodySchema,
  adminTeamRenameSchema,
} from '@ssworks/admin-shared'
import type { AdminTeamCreate, AdminTeamMoveBody, AdminTeamRename } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditDiff, attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import {
  AdminTeamsService,
  TEAM_AUDIT_FIELDS,
  TEAM_MOVE_AUDIT_FIELDS,
  TEAM_RENAME_AUDIT_FIELDS,
} from './teams.service.js'

// 정본: hangang-home apps/api/src/modules/teams/teams.controller.ts(라우트 · @Audit org.team.* · 'tree' 정적 경로)
// 바꾼 점: 권한은 슬롯(2c ① P1) — 트리는 teams.read ∨ users.read(⑥ P1, 사용자 폼의 팀 고르기). 다섯 라우트만(3d §9 — 평면
//   목록 · 단건은 화면이 쓰지 않는다). 응답은 트리 { items } · 만들기 201 { teamNo } · 나머지 {}(공통 5). 이동은 기준 형제
//   번호(3d ⑤ O3 — hangang 은 숫자 displayOrder). 삭제 감사는 함께 지운 하위 팀을 meta.descendants 로 남긴다(⑦ A1).
// 🔴 재인증 · revision 이 없다(3d §9) — reauth: true 여도 본문에 currentPassword 를 받지 않는다.

@Controller('teams')
export class AdminTeamsController {
  constructor(private readonly teams: AdminTeamsService) {}

  /** 루트 여럿, 없으면 []. 🔴 users.read 도 연다(⑥ P1) — 맵에 없는 슬롯은 거짓(2d B13) */
  @RequirePermissionSlot('teams.read', 'users.read')
  @Get('tree')
  tree() {
    return this.teams.tree()
  }

  @RequirePermissionSlot('teams.manage')
  @Audit({ action: CoreAuditActions.TEAM_CREATE, targetType: CoreAuditTargets.TEAM })
  @Post()
  async create(
    @Body(new ZodValidationPipe(adminTeamCreateSchema)) body: AdminTeamCreate,
    @Req() req: Request,
  ) {
    const { teamNo } = await this.teams.create(body)
    attachAuditTarget(req, teamNo)
    attachAuditDiff(
      req,
      null,
      { teamName: body.teamName, parentTeamNo: body.parentTeamNo },
      TEAM_AUDIT_FIELDS,
    )
    return { teamNo }
  }

  /** 🔴 'move' 를 ':teamNo' 보다 먼저 선언한다(경로가 다르지만 읽는 사람이 헷갈리지 않게 — hangang 'tree' 주석과 같은 뜻) */
  @RequirePermissionSlot('teams.manage')
  @Audit({ action: CoreAuditActions.TEAM_MOVE, targetType: CoreAuditTargets.TEAM })
  @Patch(':teamNo/move')
  async move(
    @Param('teamNo', ParseBigIntPipe) teamNo: bigint,
    @Body(new ZodValidationPipe(adminTeamMoveBodySchema)) body: AdminTeamMoveBody,
    @Req() req: Request,
  ) {
    const { before, after } = await this.teams.move(teamNo, body)
    attachAuditDiff(req, before, after, TEAM_MOVE_AUDIT_FIELDS)
    return {}
  }

  @RequirePermissionSlot('teams.manage')
  @Audit({ action: CoreAuditActions.TEAM_UPDATE, targetType: CoreAuditTargets.TEAM })
  @Patch(':teamNo')
  async rename(
    @Param('teamNo', ParseBigIntPipe) teamNo: bigint,
    @Body(new ZodValidationPipe(adminTeamRenameSchema)) body: AdminTeamRename,
    @Req() req: Request,
  ) {
    const { before } = await this.teams.rename(teamNo, body)
    attachAuditDiff(req, before, { teamName: body.teamName }, TEAM_RENAME_AUDIT_FIELDS)
    return {}
  }

  @RequirePermissionSlot('teams.manage')
  @Audit({ action: CoreAuditActions.TEAM_DELETE, targetType: CoreAuditTargets.TEAM })
  @Delete(':teamNo')
  async remove(@Param('teamNo', ParseBigIntPipe) teamNo: bigint, @Req() req: Request) {
    const { before, descendants } = await this.teams.remove(teamNo)
    attachAuditDiff(req, before, null, TEAM_AUDIT_FIELDS)
    if (descendants.length > 0) attachAuditMeta(req, { descendants })
    return {}
  }
}
```

`packages/admin-server/src/teams/teams.module.ts`:

```ts
import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminTeamsController } from './teams.controller.js'
import { AdminTeamsService } from './teams.service.js'

// 정본: hangang-home apps/api/src/modules/teams/teams.module.ts
// 바꾼 점: 패키지 기능 모듈(2e 스펙 §4-4) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다. 옵션이
//   없다(카탈로그 · reauth 를 읽지 않는다).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 장 0010_team_tree_lock(guardLocks 행 teamTree)이 있어야 쓰기가 돈다 — 없으면 쓰기마다 500(lockGuardRow). 스텁 검사가
//    먼저 막는다(모든 장 필수 — 2c ⑨ M1).

@Module({
  controllers: [AdminTeamsController],
  providers: [AdminTeamsService],
})
export class AdminTeamsModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminTeamsModule')
    assertPermissionSlots(
      this.options.permissions,
      ['teams.read', 'teams.manage'],
      'AdminTeamsModule',
    )
  }
}
```

- [ ] **Step 4: 배선한다**

`packages/admin-server/src/admin-server.module.ts`: `import { AdminUsersModule } from './users/users.module.js'` 다음 줄에 `import { AdminTeamsModule } from './teams/teams.module.js'`(import 정렬은 lint 가 고친다면 그대로 따른다), `ADMIN_ROUTE_MODULES` 의 `AdminUsersModule,` 다음에 `AdminTeamsModule,`.

`packages/admin-server/src/index.ts`: `export { AdminUsersModule } from './users/users.module.js'` 다음 줄에 빈 줄과 `export { AdminTeamsModule } from './teams/teams.module.js'`.

`packages/admin-server/src/test-support/accounts.ts` — `TEST_CATALOG` 의 첫 인자 끝(`POSTS_DELETE: 'board.posts:delete',` 다음)에 `TEAMS_READ: 'org.teams:read',` · `TEAMS_WRITE: 'org.teams:write',`, `implies` 끝에 `'org.teams:write': ['org.teams:read'],`.

`packages/admin-server/src/test-support/admin-app.ts`:

- 머리 주석 `// 테스트 전용 — 인증 · 감사 · 세션까지 붙인 앱(2c · 2d 역할 · 사용자).` 를 `// 테스트 전용 — 인증 · 감사 · 세션까지 붙인 앱(2c · 2d 역할 · 사용자 · 2e-1 팀).` 로.
- `TEST_PERMISSIONS` 끝(`'users.manage': 'org.users:write',` 다음)에 `'teams.read': 'org.teams:read',` · `'teams.manage': 'org.teams:write',`.
- import 에 `import { AdminTeamsModule } from '../teams/teams.module.js'`, `bootAdminApp` 의 `imports` 에서 `AdminUsersModule,` 다음에 `AdminTeamsModule,`.

- [ ] **Step 5: GREEN — 단위 · 기존 HTTP 계약**

```bash
pnpm --filter @ssworks/admin-server test
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
pnpm --filter @ssworks/admin-server test:db http
```

Expected: 모두 PASS. `test:db http` 는 `bootAdminApp` 을 쓰는 기존 HTTP 계약(역할 · 사용자 · 세션 · 감사 · 인증)이 팀 모듈을 싣고도 초록인지 본다 — 새 슬롯 키가 카탈로그에 있어 역할 · 사용자 모듈의 B12 검사를 지난다.

- [ ] **Step 6: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth/permission-slots.ts packages/admin-server/src/auth/permission-slots.test.ts packages/admin-server/src/teams/teams.controller.ts packages/admin-server/src/teams/teams.module.ts packages/admin-server/src/teams/teams.module.test.ts packages/admin-server/src/admin-server.module.ts packages/admin-server/src/index.ts packages/admin-server/src/test-support/accounts.ts packages/admin-server/src/test-support/admin-app.ts
git add packages/admin-server/src/auth/permission-slots.ts packages/admin-server/src/auth/permission-slots.test.ts packages/admin-server/src/teams/teams.controller.ts packages/admin-server/src/teams/teams.module.ts packages/admin-server/src/teams/teams.module.test.ts packages/admin-server/src/admin-server.module.ts packages/admin-server/src/index.ts packages/admin-server/src/test-support/accounts.ts packages/admin-server/src/test-support/admin-app.ts
git commit -m "feat(admin-server): AdminTeamsModule — 팀 다섯 라우트 · 슬롯 teams.read · teams.manage · 감사 org.team.*" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 실 MariaDB HTTP 계약 — 3d §9 전 행 · 감사 행

**Files:**

- Create: `packages/admin-server/src/teams/teams.http.db.test.ts`

**Interfaces:**

- Consumes: Task 8 `bootAdminApp`(팀 모듈 · 슬롯 포함), `TEAM_MESSAGES`, admin-shared `adminTeamTreeSchema` · `adminTeamCreateResultSchema` · `errorRespSchema` · `parseJSON` · `stringifyJSON`.

- [ ] **Step 1: HTTP 계약 테스트를 쓴다**

`packages/admin-server/src/teams/teams.http.db.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminTeamCreateResultSchema,
  adminTeamTreeSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
  type AdminTeamNode,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAdminApp } from '../test-support/admin-app.js'
import { addToTeam, seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { outline } from '../test-support/teams.js'
import { TEAM_MESSAGES } from './errors.js'

// 실 MariaDB 의 팀 HTTP 계약(2e 스펙 §9-3 [1]) — admin-ui useTeamTree 가 기대는 3d §9 그대로.
// 🔴 bigint 가 든 본문은 stringifyJSON 으로 보낸다(supertest 의 .send(object) 는 bigint 에서 던진다). 팀 이름은 테스트마다
//    접두어로 가르고 대소문자만으로 가르지 않는다(ci 콜레이션).

let t: TestDatabase
let app: NestExpressApplication
let guarded: NestExpressApplication
let boss: SeededUser
let manager: SeededUser
let reader: SeededUser
let member: SeededUser
let memberRole: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  const bossRole = await seedRole(t.db, { roleName: '최고 관리자', permissions: ['*'] })
  const managerRole = await seedRole(t.db, {
    roleName: '팀 관리자',
    permissions: ['org.teams:read', 'org.teams:write'],
  })
  const readerRole = await seedRole(t.db, {
    roleName: '사용자 조회',
    permissions: ['org.users:read'],
  })
  memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  boss = await seedUser(t.db, { roleNo: bossRole, userId: 'boss' })
  manager = await seedUser(t.db, { roleNo: managerRole, userId: 'team-manager' })
  reader = await seedUser(t.db, { roleNo: readerRole, userId: 'user-reader' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'member' })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  guarded = await bootAdminApp(connection, { reauth: true })
})

afterAll(async () => {
  await app?.close()
  await guarded?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>
type Pending = ReturnType<Agent['post']>

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

function sendJson(pending: Pending, body: unknown): Pending {
  return pending.set('Content-Type', 'application/json').send(stringifyJSON(body))
}

/** 성공 봉투 { success: true, data } 를 풀고 data 의 키 집합이 정확히 keys 인지 잰다 */
function envelope(response: Response, keys: string[]): Record<string, unknown> {
  const body = parseJSON<{ success: boolean; data: Record<string, unknown> }>(response.text)
  expect(body.success).toBe(true)
  expect(Object.keys(body.data).sort()).toEqual([...keys].sort())
  return body.data
}

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

const issuePaths = (details: unknown) =>
  (details as { issues: { path: unknown[] }[] }).issues.map((issue) => issue.path)

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function tree(agent: Agent): Promise<AdminTeamNode[]> {
  const response = await agent.get('/admin/teams/tree').expect(200)
  envelope(response, ['items'])
  return adminTeamTreeSchema.parse(data(response)).items
}

async function createTeam(
  agent: Agent,
  teamName: string,
  parentTeamNo: bigint | null,
): Promise<bigint> {
  const response = await sendJson(agent.post('/admin/teams'), { teamName, parentTeamNo }).expect(
    201,
  )
  envelope(response, ['teamNo'])
  return adminTeamCreateResultSchema.parse(data(response)).teamNo
}

const pathsOf = async (agent: Agent, prefix: string) =>
  outline(await tree(agent)).filter((path) => path.startsWith(prefix))

describe('트리', () => {
  it('빈 저장소는 { items: [] } — 이 파일의 첫 테스트', async () => {
    const response = await (await signIn(boss)).get('/admin/teams/tree').expect(200)
    expect(envelope(response, ['items'])).toEqual({ items: [] })
  })

  it('🔴 users.read 만으로 트리 200 · 쓰기 403(⑥ P1) — 슬롯 없는 계정은 403 권한이 없습니다(details 없음)', async () => {
    const readerAgent = await signIn(reader)
    await tree(readerAgent)
    const denied = expectError(
      await sendJson(readerAgent.post('/admin/teams'), {
        teamName: 'ht-denied',
        parentTeamNo: null,
      }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      '권한이 없습니다.',
    )
    expect(denied.details).toBeUndefined()
    expectError(
      await (await signIn(member)).get('/admin/teams/tree'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})

describe('쓰기 — 3d §9', () => {
  it('만들기 201 { teamNo } · 루트 여럿 · 하위 팀 — 응답이 admin-shared 스키마로 읽힌다', async () => {
    const agent = await signIn(manager)
    const root = await createTeam(agent, 'ht-root', null)
    await createTeam(agent, 'ht-child', root)
    await createTeam(agent, 'ht-other', null)
    expect(await pathsOf(agent, 'ht-')).toEqual(['ht-root', 'ht-root/ht-child', 'ht-other'])
  })

  it('🔴 본문 검증 400 issues — 빈 이름 · 65자 · 숫자 아닌 parentTeamNo, 앞뒤 공백은 떼고 저장(Review Focus 2)', async () => {
    const agent = await signIn(manager)
    for (const teamName of ['   ', 'x'.repeat(65)]) {
      const body = expectError(
        await sendJson(agent.post('/admin/teams'), { teamName, parentTeamNo: null }),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(issuePaths(body.details)).toEqual([['teamName']])
    }
    const numeric = expectError(
      await agent
        .post('/admin/teams')
        .set('Content-Type', 'application/json')
        .send('{"teamName":"ht-numeric","parentTeamNo":5}'),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(numeric.details)).toEqual([['parentTeamNo']])
    await createTeam(agent, '  ht-trim  ', null)
    expect(await pathsOf(agent, 'ht-trim')).toEqual(['ht-trim'])
  })

  it('없는 상위 팀 404 · 이름 중복 409(대소문자 무시)', async () => {
    const agent = await signIn(manager)
    expectError(
      await sendJson(agent.post('/admin/teams'), { teamName: 'ht-orphan', parentTeamNo: 999_999n }),
      404,
      CommonErrorCodes.ERR_NO_TEAM,
      TEAM_MESSAGES.noParentTeam,
    )
    await createTeam(agent, 'ht-dup', null)
    expectError(
      await sendJson(agent.post('/admin/teams'), { teamName: 'HT-DUP', parentTeamNo: null }),
      409,
      CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME,
      TEAM_MESSAGES.duplicateTeamName,
    )
  })

  it('이름 바꾸기 {} · 없는 팀 404 · 남의 이름 409', async () => {
    const agent = await signIn(manager)
    const team = await createTeam(agent, 'ht-rename', null)
    await createTeam(agent, 'ht-taken', null)
    const renamed = await sendJson(agent.patch(`/admin/teams/${team}`), {
      teamName: 'ht-renamed',
    }).expect(200)
    expect(envelope(renamed, [])).toEqual({})
    expect(await pathsOf(agent, 'ht-renamed')).toEqual(['ht-renamed'])
    expectError(
      await sendJson(agent.patch('/admin/teams/999998'), { teamName: 'ht-none' }),
      404,
      CommonErrorCodes.ERR_NO_TEAM,
      TEAM_MESSAGES.noTeam,
    )
    expectError(
      await sendJson(agent.patch(`/admin/teams/${team}`), { teamName: 'ht-taken' }),
      409,
      CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME,
    )
  })

  it('이동 {} · 순환 400 ERR_TEAM_MOVE_CYCLE · 기준 형제 400 issues beforeTeamNo · 최상위로', async () => {
    const agent = await signIn(manager)
    const top = await createTeam(agent, 'mvh-top', null)
    const first = await createTeam(agent, 'mvh-first', top)
    const second = await createTeam(agent, 'mvh-second', top)
    const moved = await sendJson(agent.patch(`/admin/teams/${second}/move`), {
      parentTeamNo: top,
      beforeTeamNo: first,
    }).expect(200)
    expect(envelope(moved, [])).toEqual({})
    expect(await pathsOf(agent, 'mvh-')).toEqual([
      'mvh-top',
      'mvh-top/mvh-second',
      'mvh-top/mvh-first',
    ])
    expectError(
      await sendJson(agent.patch(`/admin/teams/${top}/move`), {
        parentTeamNo: first,
        beforeTeamNo: null,
      }),
      400,
      CommonErrorCodes.ERR_TEAM_MOVE_CYCLE,
      TEAM_MESSAGES.moveCycle,
    )
    const notSibling = expectError(
      await sendJson(agent.patch(`/admin/teams/${first}/move`), {
        parentTeamNo: top,
        beforeTeamNo: top,
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
      TEAM_MESSAGES.beforeNotSibling,
    )
    expect(issuePaths(notSibling.details)).toEqual([['beforeTeamNo']])
    await sendJson(agent.patch(`/admin/teams/${first}/move`), {
      parentTeamNo: null,
      beforeTeamNo: null,
    }).expect(200)
    expect(await pathsOf(agent, 'mvh-')).toEqual(['mvh-top', 'mvh-top/mvh-second', 'mvh-first'])
  })

  it('삭제 {} · 소속이 있으면 409 ERR_TEAM_HAS_MEMBERS + details.memberCount · 없는 팀 404', async () => {
    const agent = await signIn(manager)
    const busy = await createTeam(agent, 'dlh-busy', null)
    const busyChild = await createTeam(agent, 'dlh-busy-child', busy)
    const joined = await seedUser(t.db, { roleNo: memberRole, userId: 'dlh-joined' })
    await addToTeam(t.db, busyChild, joined.userNo)
    const conflict = expectError(
      await agent.delete(`/admin/teams/${busy}`),
      409,
      CommonErrorCodes.ERR_TEAM_HAS_MEMBERS,
      TEAM_MESSAGES.teamHasMembers,
    )
    expect(conflict.details).toEqual({ memberCount: 1 })
    const empty = await createTeam(agent, 'dlh-empty', null)
    const removed = await agent.delete(`/admin/teams/${empty}`).expect(200)
    expect(envelope(removed, [])).toEqual({})
    expectError(await agent.delete(`/admin/teams/${empty}`), 404, CommonErrorCodes.ERR_NO_TEAM)
  })

  it('🔴 reauth: true 앱에서도 팀 쓰기는 currentPassword 없이 통과한다(공통 3)', async () => {
    const agent = await signIn(manager, guarded)
    const response = await sendJson(agent.post('/admin/teams'), {
      teamName: 'ht-guarded',
      parentTeamNo: null,
    }).expect(201)
    envelope(response, ['teamNo'])
  })
})

describe('감사', () => {
  async function auditRows(action: string, targetRefNo: bigint) {
    return t.db
      .selectFrom('auditLogs')
      .selectAll()
      .where('action', '=', action)
      .where('targetRefNo', '=', targetRefNo)
      .orderBy('logNo', 'asc')
      .execute()
  }

  it('쓰기 넷이 행으로 — 대상 team · diff · meta 원문(⑦ A1)', async () => {
    const agent = await signIn(boss)
    const parent = await createTeam(agent, 'au-parent', null)
    const team = await createTeam(agent, 'au-team', parent)
    const other = await createTeam(agent, 'au-other', parent)
    const child = await createTeam(agent, 'au-child', team)
    await sendJson(agent.patch(`/admin/teams/${team}`), { teamName: 'au-team2' }).expect(200)
    await sendJson(agent.patch(`/admin/teams/${other}/move`), {
      parentTeamNo: parent,
      beforeTeamNo: team,
    }).expect(200)
    await agent.delete(`/admin/teams/${team}`).expect(200)

    const [created] = await auditRows(CoreAuditActions.TEAM_CREATE, team)
    expect(created).toMatchObject({ targetType: 'team', actorUserNo: boss.userNo, statusCode: 201 })
    expect(created?.meta).toEqual({
      before: {},
      after: { teamName: 'au-team', parentTeamNo: String(parent) },
    })
    const [renamed] = await auditRows(CoreAuditActions.TEAM_UPDATE, team)
    expect(renamed?.meta).toEqual({
      before: { teamName: 'au-team' },
      after: { teamName: 'au-team2' },
    })
    const [moved] = await auditRows(CoreAuditActions.TEAM_MOVE, other)
    expect(moved?.meta).toEqual({
      before: { parentTeamNo: String(parent), displayOrder: 1 },
      after: { parentTeamNo: String(parent), displayOrder: 0 },
    })
    const [deleted] = await auditRows(CoreAuditActions.TEAM_DELETE, team)
    expect(deleted?.meta).toEqual({
      before: { teamName: 'au-team2', parentTeamNo: String(parent) },
      after: {},
      descendants: [{ teamNo: String(child), teamName: 'au-child' }],
    })
  })

  it('하위 팀이 없는 삭제는 descendants 키가 없다 · 제자리 이동은 before = after', async () => {
    const agent = await signIn(boss)
    const alone = await createTeam(agent, 'au-alone', null)
    await sendJson(agent.patch(`/admin/teams/${alone}/move`), {
      parentTeamNo: null,
      beforeTeamNo: null,
    }).expect(200)
    const [moved] = await auditRows(CoreAuditActions.TEAM_MOVE, alone)
    const meta = moved?.meta as { before: unknown; after: unknown }
    expect(meta.after).toEqual(meta.before)
    await agent.delete(`/admin/teams/${alone}`).expect(200)
    const [deleted] = await auditRows(CoreAuditActions.TEAM_DELETE, alone)
    expect(Object.keys(deleted?.meta as Record<string, unknown>).sort()).toEqual([
      'after',
      'before',
    ])
  })
})
```

(제자리 이동 검사 — `au-alone` 은 만들 때 최상위 형제의 끝(`MAX + 1`)에 서므로 `beforeTeamNo: null` 은 제자리다. 그 사이 다른 테스트가 최상위 팀을 만들지 않는다 — 이 파일의 테스트는 차례로 돈다.)

- [ ] **Step 2: 돌린다**

Run: `pnpm --filter @ssworks/admin-server test:db teams.http`
Expected: PASS. 실패하면 서비스 · 컨트롤러가 이 계약과 어긋난 자리다 — 테스트의 기대(3d §9 · 스펙 §6 문구)를 바꾸지 말고 구현을 고친다. 고쳤다면 그 Task 의 파일을 이 커밋에 함께 싣는다.

- [ ] **Step 3: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/teams/teams.http.db.test.ts
git add packages/admin-server/src/teams/teams.http.db.test.ts
git commit -m "test(admin-server): 팀 HTTP 계약 — 3d §9 전 행 · 403 · 재인증 무관 · 감사 행 meta 원문" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 쓰는 쪽 스모크 · README · changeset · 진행 문서

**Files:**

- Modify: `packages/admin-server/README.md`
- Create: `.changeset/admin-server-teams.md`
- Modify: `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md`(§14 R2 — 플랜이 더한 작은 결정, 구현 중 바뀐 것)
- Create(저장소 밖): `$TEMP/akss/` 아래 앱 파일들

- [ ] **Step 1: README 를 고친다**

`packages/admin-server/README.md`:

① 둘째 단락의 `코어 스키마 9장(PR 2a · 2c · 2d-1)` 을 `코어 스키마 10장(PR 2a · 2c · 2d-1 · 2e-1)` 으로, `사용자 · 계정(PR 2d-2)이다. 팀 · 약관 · IP 접근 제어는 다음 PR 에서 붙는다` 를 `사용자 · 계정(PR 2d-2), 팀(PR 2e-1)이다. 약관 · IP 접근 제어는 다음 PR 에서 붙는다` 로.

② 장 표의 ``| `0009_guard_locks` …`` 행 다음에 행을 더한다:

```md
| `0010_team_tree_lock` | `guard_locks` 에 행 하나(팀 트리) |
```

③ "## 권한 슬롯" 예시 객체의 `'users.manage': …` 줄 다음에 두 줄을 더한다:

```ts
      'teams.read': 'org.teams:read', // GET /teams/tree(users.read 로도 열린다 — 사용자 폼의 팀 고르기)
      'teams.manage': 'org.teams:write', // POST · PATCH · DELETE /teams…
```

④ "## admin-ui 와 맞물리기" **앞**에 절을 더한다:

````md
## 팀

```ts
imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      // …
      permissions: {
        // …
        'teams.read': 'org.teams:read',
        'teams.manage': 'org.teams:write',
      },
    }),
  }),
  AdminAuthModule,
  AdminTeamsModule,
]
```

마이그레이션 폴더에 스텁 한 줄을 더한다(모든 장 필수 — 이미 장을 돌린 DB 도 `kysely migrate` 한 번으로 따라온다):

```ts
// src/database/migrations/010_admin_team_tree_lock.migration.ts
export { up, down } from '@ssworks/admin-server/migrations/0010_team_tree_lock'
```

| 라우트                            | 슬롯                        | 본문 → 응답                                             | 감사                                  |
| --------------------------------- | --------------------------- | ------------------------------------------------------- | ------------------------------------- |
| `GET /admin/teams/tree`           | `teams.read` ∨ `users.read` | → `{ items: AdminTeamNode[] }` — 루트 여럿, 없으면 `[]` | —                                     |
| `POST /admin/teams`               | `teams.manage`              | `{ teamName, parentTeamNo }` → 201 `{ teamNo }`         | `org.team.create`                     |
| `PATCH /admin/teams/:teamNo`      | `teams.manage`              | `{ teamName }` → `{}`                                   | `org.team.update`                     |
| `PATCH /admin/teams/:teamNo/move` | `teams.manage`              | `{ parentTeamNo, beforeTeamNo }` → `{}`                 | `org.team.move`                       |
| `DELETE /admin/teams/:teamNo`     | `teams.manage`              | → `{}` — 하위 팀째                                      | `org.team.delete`(meta `descendants`) |

- admin-ui `useTeamTree` 배선(admin-ui README "조직")이 그대로 맞는다 — 위 `baseURL: '/api/admin'` 이면 `load: () => api.get<AdminTeamTree>('/teams/tree').then((r) => r.items)`, ``move: ({ teamNo, ...body }) => api.patch(`/teams/${teamNo}/move`, body)``. 2열 인원 목록은 `GET /users?filter[teamNo]=…&filter[recursive]=true`("사용자 · 계정").
- **루트가 여럿이다.** `parentTeamNo: null` 이 최상위다. 화면에서 최상위 팀을 만들고 옮기려면 `useTeamTree({ topLevel: true })`. 루트 팀을 지우거나 옮기지 못하게 하려면 화면의 `canAct` 와 자기 라우트로 막는다(패키지는 시스템 팀을 모른다).
- **이동**은 기준 형제 번호다(`beforeTeamNo: null` = 맨 끝). 서버가 받는 형제 묶음을 0..n-1 로 다시 매긴다 — 시드의 빈 번호 · 같은 값은 그 묶음을 한 번 움직이면 사라진다. 자기 자신 · 하위 팀 아래로는 400 `ERR_TEAM_MOVE_CYCLE`, 기준 팀이 그 상위 팀의 자식이 아니면 400 `issues[beforeTeamNo]`, 없는 상위 팀은 404 `ERR_NO_TEAM`.
- **지우기**는 하위 팀째다. 서브트리에 소속 계정이 하나라도 있으면(퇴사자 포함) 409 `ERR_TEAM_HAS_MEMBERS` + `details.memberCount`(계정 수) — 먼저 `PATCH /admin/users/:userNo { teamNo }` 로 옮긴다.
- **이름**은 전체에서 하나다(같은 상위 팀 안이 아니다). 대소문자 · 끝 공백만 다른 이름도 같은 이름이라 409 `ERR_DUPLICATE_TEAM_NAME` 이다(`utf8mb4_unicode_ci`). 앞뒤 공백은 떼고 저장한다.
- 재인증 · revision 이 없다(`reauth: true` 여도).
- **쓰는 쪽 시드의 closure**: 계층은 `team_closure` 에만 있다. 상위 팀은 깊이 1 행이고, 조상마다 한 행(깊이 = 거리)을 넣는다. 자기 행(깊이 0)은 넣어도 안 넣어도 패키지 결과가 같다 — 패키지가 만드는 팀은 자기 행을 넣는다.
- **동시 쓰기**: 팀 쓰기(만들기 · 이름 · 이동 · 삭제)는 `guard_locks` 행 `teamTree` 에서 하나씩 돈다. 사용자 만들기 · 수정이 지우는 중인 팀을 고르면 기다렸다가 400 `issues[teamNo]`, 지우기가 소속을 넣는 중인 팀을 만나면 기다렸다가 409 다.
````

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-teams.md`:

```md
---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0010_team_tree_lock` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0010_team_tree_lock'` — 모든 장 필수, 이미 돌린 DB 는 `kysely migrate` 한 번). 팀 모듈을 쓰면 `AdminServerModule` 옵션의 `permissions` 에 슬롯 `'teams.read'` · `'teams.manage'` 를 잇고 `AdminTeamsModule` 을 import 한다.

admin-server 팀(Phase 2 PR 2e-1): `AdminTeamsModule` — `/admin/teams` 다섯 라우트(트리 — 루트 여럿 · `teams.read` ∨ `users.read`, 만들기 201 `{ teamNo }`, 이름 바꾸기, 이동 — 기준 형제 번호 `{ parentTeamNo, beforeTeamNo }` · 서버가 받는 형제 묶음을 다시 매김, 삭제 — 하위 팀째). 순환 이동 400 `ERR_TEAM_MOVE_CYCLE`, 소속 있는 삭제 409 `ERR_TEAM_HAS_MEMBERS` + `memberCount`, 이름 중복 409 `ERR_DUPLICATE_TEAM_NAME`. 팀 쓰기는 `guard_locks` 행 `teamTree` 로 직렬화된다. 사용자 수정이 같은 팀으로 다시 저장하면 소속을 건드리지 않는다(배정 시각 유지). 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: 오류 코드 `ERR_TEAM_HAS_MEMBERS`(409) · `ERR_TEAM_MOVE_CYCLE`(400), 코어 감사 액션에 팀 넷(`org.team.create` · `update` · `delete` · `move`)과 대상 `team`.
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
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "package/dist/teams/.*[.]js$"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "test-support|[.]test[.]js" || echo "테스트 파일 없음"
```

Expected: tarball 둘, `dist/teams/*.js` 가 보이고 마지막 줄은 `테스트 파일 없음`.

`$TEMP/akss/package.json` · `tsconfig.json` · `.env` · `kysely.config.ts` · `src/main.ts` 는 2c 플랜 Task 13 Step 3(`docs/superpowers/plans/2026-10-14-admin-server-sessions-audit.md`)과 같다 — 그대로 옮겨 쓰고 tarball 이름만 `ls` 결과로 맞춘다. 스텁은 2d-1 의 아홉(2d-1 플랜 Task 13 Step 3)에 하나를 더한 열이다:

```ts
// $TEMP/akss/src/migrations/010_admin_team_tree_lock.ts
export { up, down } from '@ssworks/admin-server/migrations/0010_team_tree_lock'
```

`$TEMP/akss/src/seed.ts` 는 2d-2 플랜 Task 13 Step 3 과 같다(역할 `최고 관리자`(`'*'`) · `직원`(`org.users:read`) · 계정 `admin`).

`$TEMP/akss/src/app.module.ts` — 2d-2 의 파일(2d-1 플랜 Task 13 Step 3 의 파일 + 2d-2 의 사용자 줄)에서 바꾼다: import 에 `AdminTeamsModule` 을 더하고, `permissions` 에 `'teams.read': 'org.teams:read'` · `'teams.manage': 'org.teams:write'` 를, `imports` 의 `AdminUsersModule,` 다음에 `AdminTeamsModule,` 를 더한다. 🔴 `permissions` 에 이은 팀 키도 `permissionCatalog` 안이어야 한다 — 역할 · 사용자 모듈의 슬롯 키 검사(2d B12)가 기동에서 멈춘다. 2d-1 의 카탈로그에 `TEAMS_READ: 'org.teams:read'` · `TEAMS_WRITE: 'org.teams:write'` 를 더한다.

`$TEMP/akss/check.mjs` — 2d-1 플랜의 `send` · `show` · `bigint` · `waitForServer` · `login` 도우미 그대로, 본문을 바꾼다:

```js
await waitForServer()
const admin = await login('admin', 'smoke-pass-1234')
const write = (method, path, body) => send(path, { method, cookie: admin, body })
const teamNoOf = (response) => JSON.parse(response.text).data.teamNo // "BigInt(n)" — 그대로 보낸다

const root = await write('POST', '/admin/teams', { teamName: '본사', parentTeamNo: null })
show('teams-create-root', root)
const sales = await write('POST', '/admin/teams', {
  teamName: '영업팀',
  parentTeamNo: teamNoOf(root),
})
show('teams-create-sales', sales)
const dev = await write('POST', '/admin/teams', {
  teamName: '개발팀',
  parentTeamNo: teamNoOf(root),
})
show('teams-create-dev', dev)
show(
  'teams-move',
  await write('PATCH', `/admin/teams/${bigint(teamNoOf(dev))}/move`, {
    parentTeamNo: teamNoOf(root),
    beforeTeamNo: teamNoOf(sales),
  }),
)
show(
  'teams-cycle',
  await write('PATCH', `/admin/teams/${bigint(teamNoOf(root))}/move`, {
    parentTeamNo: teamNoOf(dev),
    beforeTeamNo: null,
  }),
)
show('teams-tree', await send('/admin/teams/tree', { cookie: admin }))

const roles = JSON.parse((await send('/admin/roles', { cookie: admin })).text).data.items
const staffRole = roles.find((role) => role.roleName === '직원').roleNo
show(
  'users-create-in-team',
  await write('POST', '/admin/users', {
    userId: 'smoke-team-user',
    userName: '팀 사용자',
    roleNo: staffRole,
    teamNo: teamNoOf(sales),
  }),
)
show('teams-delete-busy', await write('DELETE', `/admin/teams/${bigint(teamNoOf(sales))}`))
show(
  'users-under-root',
  await send(
    `/admin/users?filter%5BteamNo%5D=${bigint(teamNoOf(root))}&filter%5Brecursive%5D=true`,
    { cookie: admin },
  ),
)
show('teams-delete-dev', await write('DELETE', `/admin/teams/${bigint(teamNoOf(dev))}`))
show(
  'audit-logs',
  await send('/admin/audit-logs?itemsPerPage=20&filter%5Baction%5D=org.team', { cookie: admin }),
)
```

🔴 시나리오 대조(서버 규칙을 어기지 않는가): 세 팀 이름이 서로 다르다(ci 중복 없음) · 개발팀을 영업팀 앞으로 옮기는 기준 팀은 본사의 자식이다 · 순환은 본사를 그 하위 팀(개발팀) 아래로 보내 400 을 기대한다 · 사용자 만들기의 역할 `직원`(`org.users:read`)은 `admin`(`'*'`)이 덮는다 · 영업팀 삭제는 방금 넣은 소속 때문에 409 · 개발팀은 하위 팀 · 소속이 없어 200.

- [ ] **Step 4: 설치 · 빌드 · 마이그레이션 · 시드**

```bash
cd "$TEMP/akss"
pnpm install
pnpm build
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists akss; create database akss"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akss -e "select lock_name from guard_locks order by lock_name"
```

Expected: 설치 성공 · 마이그레이션 10장 · 시드 성공. 마지막 줄에 `superAdminSurvival` · `teamTree` 두 행. `tsc` 는 2a 때의 제3자 d.ts 6건 말고는 오류가 없다(있으면 기록하고 `skipLibCheck: true` 로 한 번 더 돌린다).

- [ ] **Step 5: 기동 · 요청**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected(본문은 줄여 적는다):

- `teams-create-root 201 {"success":true,"data":{"teamNo":"BigInt(1)"}}` · `teams-create-sales 201` · `teams-create-dev 201`
- `teams-move 200 {"success":true,"data":{}}` · `teams-cycle 400 {…"code":"ERR_TEAM_MOVE_CYCLE","message":"팀을 자기 자신이나 하위 팀 아래로 옮길 수 없습니다."…}`
- `teams-tree 200 {…"items":[{"teamNo":"BigInt(1)","teamName":"본사",…"children":[{…"개발팀"…},{…"영업팀"…}]}]}`
- `users-create-in-team 201 {…"teamName":"영업팀"…}`
- `teams-delete-busy 409 {…"code":"ERR_TEAM_HAS_MEMBERS",…"details":{"memberCount":1}}`
- `users-under-root 200 {…"items":[{…"userId":"smoke-team-user"…}],"total":"BigInt(1)"…}`
- `teams-delete-dev 200 {"success":true,"data":{}}`
- `audit-logs 200 {…}` — 최신순으로 `org.team.delete`(개발팀 · 200) · `org.team.delete`(영업팀 · 409 · `errorCode` `ERR_TEAM_HAS_MEMBERS`) · `org.team.move`(400 · `ERR_TEAM_MOVE_CYCLE`) · `org.team.move`(meta before/after) · `org.team.create` 셋.

셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
```

- [ ] **Step 7: 스펙 §14 · 진행 문서를 고친다**

숫자(N · M · W)는 저장소 루트에서 `pnpm check` · `pnpm test:db` 를 돌린 결과로 채운다(admin-server 테스트 수 · DB 테스트 수 · 워크스페이스 합계).

**스펙 `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md` §14** 끝에 더한다:

```md
- **R2 — 플랜이 더한 작은 결정 셋(2026-10-14, 2e-1 플랜).** ① `snapshotKysely` 는 async 가 되어 돌려주기 전에 풀의 연결 둘이 그 세션 값인지 단언한다(이월 4 의 "풀 데우기 · 세션 단언" — 호출 둘에 `await`). ② 장 목록 테스트의 스텁 파일 이름을 세 자리(`010_…`)로 만든다 — 두 자리(`0010_…`)는 `001_…` 과 `002_…` 사이로 정렬돼 열 번째 장에서 순서 검사가 거짓으로 실패한다. ③ 가드 행 없음 문구를 `database/guard-locks.ts` 의 `GUARD_MESSAGES.missing` 하나로 둔다(`ACCOUNT_MESSAGES.guardMissing` 을 지웠다 — 같은 글자).
```

구현 · 리뷰 중 바뀐 것이 있으면 `R3` 이하로 더한다.

**`docs/01-phase0.md`**

① §3-2 표에서 첫 칸이 `` `teams: { enabled:true, rootTeamResolver }` `` 인 행을 바꾼다:

```md
| 옵션 없음 — `AdminTeamsModule` import 가 켠다(2e-1). 루트 여럿, 루트 팀 규칙은 B(시드 · admin-ui `canAct`) | 팀 쓰기 직렬화(`guard_locks` 행 `teamTree`) · 받는 형제 다시 매김 · 순환 400 · 소속 있는 삭제 409 | gise 팀 없음(INNER→LEFT JOIN + IP team 층 비움), crm 고정 1 |
```

② §2-3 의 `> **PR 2d 경계 결정 (2026-10-14)** …` 단락 다음에 단락을 더한다:

```md
> **PR 2e 경계 결정 (2026-10-14)** — 한 스펙 · 두 PR(2e-1 팀 → 2d-3 계정 정리 → 2e-2 약관). 팀 쓰기 넷은 `guardLocks` 행 `teamTree` 로 줄을 서고 쓰기 안의 읽기는 잠금 읽기다(삭제의 소속 셈만 서브트리 팀 행을 잠근 뒤 비잠금). closure 자기 행은 쓰되 기대지 않고, 이동은 기준 형제 번호를 받아 받는 형제 묶음을 다시 매긴다. 순환 400 · 소속 있는 삭제 409 는 전용 코드, 이름 중복 409. 약관은 종류 카탈로그 옵션 `legal.kinds`, 발행은 `guardLocks` 행 `legalPublish` 로 직렬화(기준 판 409 → 같은 본문 409). 근거: `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md` §2.
```

③ §8 표 `@ssworks/admin-server` 행 상태 칸 끝(`… 다음 2e 팀 · 약관`)을 바꾼다:

```md
… 다음 2e 팀 · 약관. **PR 2e-1 완료**(`feat/admin-server-teams`, 2026-10-14) — `AdminTeamsModule`(트리 · 만들기 · 이름 · 이동 · 하위 팀째 삭제) · 장 0010(`teamTree` 가드) · `lockGuardRow` · `whileHeld` 잠금 대기 폴링 · `replaceTeam` 같은 팀 건너뛰기. N 테스트 + 실 MariaDB M. 플랜 `docs/superpowers/plans/2026-10-14-admin-server-teams.md`. 다음 2d-3 계정 정리
```

④ 표 아래 `다음: Phase 2 PR 2e 팀 · 약관(…).` 줄을 바꾼다:

```md
다음: Phase 2 PR 2d-3 계정 정리(2e 스펙 §2-1 이월 표의 2d-3 몫) → 2e-2 약관(같은 스펙 [2]).
```

**`docs/HANDOFF.md`**

- `@ssworks/admin-server` 행에서 2d-2 의 숫자 문장(`464 테스트 + 실 MariaDB 256.`)을 지우고, 그 행 끝에 더한다: ``**PR 2e-1**(팀 — `AdminTeamsModule` 다섯 라우트 · 장 0010 `teamTree` 가드 · `lockGuardRow` · 잠금 뒤 소속 셈 · 받는 형제 다시 매김 · `whileHeld` 잠금 대기 폴링, admin-shared 팀 오류 코드 둘 · 팀 감사 액션)은 `feat/admin-server-teams` 에서 구현 완료(2026-10-14). N 테스트 + 실 MariaDB M.``
- "검증" 행 끝에 더한다: `PR 2e-1 은 Windows 에서 pnpm check · pnpm test:db 초록, 쓰는 쪽 스모크($TEMP/akss — 새 DB · 스텁 10 → 시드 → 기동 → 팀 만들기 · 하위 팀 · 이동 · 순환 400 · 사용자 배정 · 소속 있는 삭제 409 · 빈 팀 삭제 → 감사 행)를 통과했다.`
- "다음 플랜" 행을 바꾼다: `Phase 2 PR 2d-3 계정 정리 — 2e 스펙 §2-1 이월 표의 2d-3 몫(1 잔존 순서 재배치 · 2 역할 전수 스캔 잠금 · 5 timeZone 정규화 · 7 revokedCount liveOnly · 8 테스트 빈틈 나머지 · 9 본인 재입사 403)으로 브레인스토밍부터(작은 PR, 새 브랜치). 그다음 2e-2 약관(같은 스펙 [2] — 플랜부터). 직전 PR 2e-1: 플랜 docs/superpowers/plans/2026-10-14-admin-server-teams.md`
- "PR 2c 가 넘긴 것" 의 `2e · 2f: 팀 · 약관 · IP 슬롯과 액션(…)` 항목 끝에 ` → 팀은 **2e-1 에서 닫음**(약관은 2e-2, IP 는 2f)` 을 붙인다.
- "PR 2d-2 최종 리뷰가 넘긴 것" 의 항목 끝에 각각 붙인다: (우선) 잔존 순서 → ` → 2d-3`, 역할 전수 스캔 → ` → 2d-3(검토)`, 2b rotate → ` → 2f`, `whileHeld` → ` → **2e-1 에서 닫음**(STATUS 폴링 — innodb_trx 는 전역 캐시, 2e 스펙 §14 R1-6)`, `timeZone` → ` → 2d-3`, `replaceTeam` → ` → **2e-1 에서 닫음**`, `revokedCount` → ` → 2d-3`, 테스트 빈틈 → ` → lockTeam 회귀는 **2e-1 에서 닫음**, 나머지 2d-3`, 제품 확인 → ` → 2d-3: 본인 재입사 403(사용자 결정)`.
- 최종 리뷰가 넘긴 것이 있으면 `- **PR 2e-1 최종 리뷰가 넘긴 것(2026-10-14)**` 항목으로 더한다(Step 9 뒤에 채운다).

**`CLAUDE.md`**

- 패키지 표의 admin-server 행 설명을 `NestJS 12 모듈 (Phase 2 진행 — 2a 기반 · 2b 인증 · 2c 세션 · 감사 · 2d 역할 · 사용자 · 2e-1 팀 완료)` 로.
- `### @ssworks/admin-server (Phase 2)` 목록 끝에 한 줄을 더한다:

```md
- 팀 쓰기 넷(만들기 · 이름 · 이동 · 삭제)은 `lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)` 가 트랜잭션 첫 문장이고 그 뒤 읽기는 모두 `FOR UPDATE` 다 — 예외는 삭제의 소속 셈(서브트리 팀 행을 잠근 뒤 첫 비잠금 읽기, 2e 스펙 ② D1). closure 자기 행(depth 0)은 쓰되 기대지 않는다. 경합 테스트의 `whileHeld` 는 잠금 대기를 `SHOW ENGINE INNODB STATUS` 로 본다(`information_schema.innodb_trx` 는 서버 전역 캐시라 못 쓴다).
```

- 진행 표의 `**Phase 2 PR 2e — 팀 · 약관**` 행을 세 행으로 바꾼다: `Phase 2 PR 2e-1 — 팀(`AdminTeamsModule`· 장 0010 ·`lockGuardRow` · 소속 셈 · 다시 매김)` · `완료` · `스펙 docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md · 플랜 docs/superpowers/plans/2026-10-14-admin-server-teams.md`, `**Phase 2 PR 2d-3 — 계정 정리**` · `**다음**` · `2e 스펙 §2-1 이월 표`, `Phase 2 PR 2e-2 — 약관` · `대기` · `2e 스펙 [2]`.

- [ ] **Step 8: 포맷 · 확인 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-teams.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-teams.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md
pnpm format:check
pnpm check
pnpm test:db
```

Expected: prettier 두 번째 실행은 `(unchanged)` 뿐, `format:check` · `check` · `test:db` 초록. 작업 공간(`.superpowers/sdd/`)의 md 때문에 `format:check` 가 실패하면 그 경로만 원인인지 보고, 작업 공간을 지운 뒤 다시 돌린다.

```bash
git add packages/admin-server/README.md .changeset/admin-server-teams.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md
git commit -m "docs: PR 2e-1 팀 — README 팀 절, changeset, 진행 문서, 다음은 2d-3 계정 정리" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 9: 최종 리뷰 · 머지 방법**

whole-branch 최종 리뷰(opus)를 받고 반영한 뒤(반영 커밋마다 `pnpm check` · `pnpm test:db`), 리뷰가 넘긴 것을 HANDOFF 에 적고 superpowers:finishing-a-development-branch 로 머지 방법을 묻는다.

---

## 스펙 대조표 (자체 검토)

| 스펙(2e-1 몫)                                                                                                    | Task             |
| ---------------------------------------------------------------------------------------------------------------- | ---------------- |
| ⓪ S2 — 이 플랜은 [1] · 이월 4 · 6 · 8(일부)                                                                      | 머리말 · 1 · 7   |
| ① G1 `teamTree` 가드 · 팀 쓰기 넷의 첫 문장                                                                      | 3 · 5 · 6 · 7    |
| ② D1 잠금 뒤 비잠금 소속 셈 · ③ M1 퇴사자 포함 · `memberCount` 계정 수                                           | 7 · 9            |
| ④ C1 자기 행을 쓰되 기대지 않음 — 트리 · 만들기 · 이동 · 삭제                                                    | 4 · 5 · 6 · 7    |
| ⑤ O1 `MAX + 1` / 0 · 받는 형제 0..n-1 · 바뀐 행만 · 제자리                                                       | 4 · 5 · 6        |
| ⑥ P1 슬롯 둘 · 트리 `teams.read` ∨ `users.read`                                                                  | 8 · 9            |
| ⑦ A1 감사 넷 · 삭제 `descendants`                                                                                | 2 · 8 · 9        |
| ⑧ N1 409 `ERR_DUPLICATE_TEAM_NAME` · 제약 이름                                                                   | 5 · 9            |
| ⑪ A1 새 장 `0010_team_tree_lock`                                                                                 | 3 · 10           |
| 공통 1 슬롯 · 2 액션 · 3 재인증 · revision 없음 · 4 새 코드 둘 · 5 응답 · 6 트리 순서 · 7 이동 검사              | 2 · 4~9          |
| B1 전역 잠금 순서 · B2 `lockGuardRow` · B3 잠금 읽기 · B4 소속 불변식 · B5 이름 바꾸기 가드                      | Global · 3 · 5~7 |
| B6 closure 쌍 · B7 DELETE teams + CASCADE · B8 이동 계획 · B9 트리 조립 · B10 검사 순서 · B11 · B12              | 4~7              |
| B13 `replaceTeam` 같은 팀 건너뛰기                                                                               | 7                |
| §4-7 장 · §4-8 index · §5-8 기동 검사                                                                            | 3 · 8            |
| §6 오류 표(팀 행)                                                                                                | 4 · 5~7 · 9      |
| §9-1 단위 · §9-2 DB 없는 HTTP · §9-3 [1] DB(장 · `whileHeld` · 서비스 · 경합 a1 a2 b1 b2 c1 c2 s1 · HTTP · 감사) | 1~9              |
| §10 README · changeset · 진행 문서 · 스모크                                                                      | 10               |
| §14 R1(실측 — 특히 R1-6 STATUS 폴링)                                                                             | 1 · 5~7          |

### §9-4 리뷰 초점 → 어디서 재는가

1. 가드가 팀 쓰기 넷의 첫 문장인가 — Task 5 (c2) · Task 6 (c1) · (s1) RED. 리뷰어는 `create` · `rename` · `move` · `remove` 의 `runWriteTransaction` 콜백 첫 줄이 `lockGuardRow` 인지 본다.
2. 삭제의 소속 셈 앞에 비잠금 읽기가 없는가 · 소속을 더하는 길이 팀 행을 먼저 잡는가 — Task 7 (a1) · (a2) RED. 리뷰어는 `remove` 의 셈 앞 쿼리가 모두 `.forUpdate()` 인지, `create` · `update` · `replaceTeam` 이 `lockTeam` 을 거치는지 본다.
3. 자기 행에 기대지 않는가 — Task 5 · 6 · 7 의 "자기 행 없는 시드". 리뷰어는 closure 읽기가 모두 `depth > 0`(또는 `depth = 1`) 조건을 갖는지 본다.
4. 이동 계획이 admin-ui 요청과 맞는가 — Task 4 `move.test.ts`(`siblingMove` · `findTeamPlacement`) · Task 6 동률 · 최상위.
5. [2] 약관 — 2e-2 플랜 몫.
