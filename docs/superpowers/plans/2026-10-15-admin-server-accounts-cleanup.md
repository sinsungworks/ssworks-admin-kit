# admin-server 계정 정리 (Phase 2 PR 2d-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2d-2 · 2e-1 최종 리뷰가 넘긴 사용자 · 역할 쪽 이월을 닫는다 — 잔존 쓰기의 셈을 대상 잠금 뒤로(잠금 단계 콜백), 역할 인덱스 둘로 역할 쓰기의 전 행 잠금 없애기, 본인 재입사 403, `timeZone` 정규 이름, 세션 폐기 `liveOnly`, 테스트 빈틈 넷.

**Architecture:** `withSuperAdminSurvival(trx, { lock, write })` 가 센티넬(첫 문장) → `lock()`(잠금 읽기 · 판정만) → 셈(이 트랜잭션의 첫 비잠금 읽기 — 읽기 뷰가 여기서 열린다) → `write(locked)` → 후 셈 순서를 쥔다. 남이 대상 행 잠금 없이 바꿀 수 있는 결정 행(대상 users ⋈ roles · 줄 역할 · 팀 · 다른 기본 역할)을 모두 `lock()` 에서 잠가, 스냅샷 격리 OFF 의 낡은 보기 읽기와 ON 의 1020 이 사라진다. 역할 표의 `(displayOrder)` · `(isDefault)` 인덱스(장 0001 정정)로 만들기 · 이동 · 기본 켜기가 그 행만 잠근다.

**Tech Stack:** NestJS 12.1 (ESM · NodeNext) · Kysely 0.29 + MariaDB 11.4 · zod 4 · vitest 4 · supertest · TypeScript 5.9

**Spec:** `docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md` — 경계 결정 ①~⑧(§2-1) · 공통 1~4(§2-2) · 설계 C1~C9(§2-3) · §5(흐름 · 경합 결과 표) · §6 · §9 · §10 · §14 R1(실측). 어긋나면 스펙이 이긴다. 직전 PR 2e-1 플랜: `docs/superpowers/plans/2026-10-14-admin-server-teams.md`.

**구현자 규칙(모든 Task):** 테스트를 먼저 만들고 **구현 전에 돌려 RED 를 보고서에 붙인다**(실패 메시지 몇 줄 · 명령과 출력). 그다음 구현 · GREEN · 커밋. 🔴 표시가 붙은 잠금 · 순서 테스트는 구현 뒤에 해당 줄을 일부러 되돌려 RED 를 한 번 더 보고(보고서에 명령 · 출력을 적고) 되돌린다. 실험이 RED 를 내지 않으면 이유와 함께 적는다. 이미 GREEN 인 회귀 고정 테스트는 "구현 전 RED" 대신 그 Task 가 적은 RED 실험을 한다. 리뷰어는 이 플랜의 해당 Task 와 Global Constraints 를 **먼저 다 읽고** 리뷰한다.

## Global Constraints

- ESM 전용 · `module: NodeNext`. 내부 상대 import 는 `.js` 확장자. `console.log` 금지(`Logger.warn` · `error` 만).
- `admin-server/src` 는 `import type` 분리 규칙의 예외다(DI 메타데이터) — 단 데코레이터가 붙은 시그니처에 쓰는 **인터페이스 · 타입 별칭은 `import type`**(TS1272), DI 로 받는 **클래스는 일반 import**. 이 PR 은 데코레이터 시그니처를 건드리지 않는다.
- 정본에서 옮긴 파일의 머리 주석(`정본:` · `바꾼 점:`)을 지키고, 바꾼 동작은 `바꾼 점` 에 한 줄 더한다. `🔴` 주석은 "지우면 사고가 나는 이유" 다 — 코드를 바꾸면 그 주석이 아직 참인지 먼저 본다.
- 🔴 **잔존 쓰기 순서**(스펙 ① A · C1 · C2): `withSuperAdminSurvival(trx, { lock, write })` = 센티넬(`lockSuperAdminGuard`, 트랜잭션 첫 문장) → `lock()` → 전 셈 → `write(locked)` → 후 셈 → 판정. **`lock()` 에는 잠금 읽기(`.forUpdate()`)와 판정 · revision · 상태 검사만 둔다** — 보기 읽기(`readUser` · `findRole`) · 쓰는 중 검사 · 셈 같은 비잠금 SELECT 를 두면 읽기 뷰가 셈보다 먼저 열린다. 잔존이 필요 없는 갈래는 `steps.write(await steps.lock())`.
- 🔴 **잠금 단계 표**(스펙 C3): 역할 권한 수정 = `lockRole` → 판정 → revision → (기본을 켬 ∧ 아직 아님) `lockOtherDefaults`. 역할 삭제 = `lockRole` → 판정 → revision. 사용자 수정 = `lockUser` → (roleNo) `lockGrantRole` → 판정 → revision → (teamNo ≠ null) `lockTeam`. 퇴사 = `lockUser` → 판정 → 이미 퇴사 409. 나머지(보기 읽기 · 재직 이력 잠금 · 소속 바꿈 · UPDATE · 세션 폐기 · 쓰는 중 검사)는 쓰기 단계.
- 🔴 **잠금 순서**(2e 스펙 §5-1) — 전역 하나: `superAdminSurvival(가드) → users → roles → teamTree(가드) → teams → teamClosure → teamUserMap · userEmploymentPeriods → sessions`. 셈은 비잠금이라 옮겨도 이 순서는 바뀌지 않는다. 한 트랜잭션은 guardLocks 행을 둘 이상 잡지 않는다. 셈에 `FOR UPDATE` 를 붙이지 않는다.
- 🔴 **세션 폐기는 쓰기 단계다**(스펙 C5) — 잠금 단계로 올리지 않는다(회전과의 교착에서 퇴사가 희생자가 된다, §14 R1-2).
- 🔴 사용자 쓰기 트랜잭션 안의 결정 읽기(대상 · 역할 · 팀 · 재직 이력)는 모두 `FOR UPDATE` 다(2d 스펙 §14 R5-6) — 그대로.
- 판정 순서(2d B7): 대상 잠금 → 존재(404) → 판정(자기 계정 → 현재 권한 → 줄 권한, 403) → revision(409) → 상태(409) → 쓰기 → 잔존(409). 사용자 수정의 오류 순서는 404 → 400 `roleNo` → 403 → 409 revision → 400 `teamNo` 그대로다.
- 오류 문구는 새로 만들지 않는다(`accounts/errors.ts` 의 `ACCOUNT_MESSAGES`): `selfAccount` = `내 계정에는 이 작업을 할 수 없습니다. 다른 관리자에게 요청하세요.` · `higherAccount` = `내 권한보다 넓은 권한을 가진 계정은 바꿀 수 없습니다.` · `higherRoleToGrant` · `lastSuperAdmin` · `resignBeforeJoin` · `alreadyResigned` · `notResigned` · `notResignedForRehire`.
- 역할 인덱스 이름(장 0001, CamelCasePlugin 이 snake 로): `idxRolesDisplayOrder` → `idx_roles_display_order (display_order)`, `idxRolesIsDefault` → `idx_roles_is_default (is_default)`. 장 0001 을 고친다(미발행 — 장 수 · 번호 그대로, 스텁 10장).
- 테스트: 단위 · DB 없는 HTTP 는 `*.test.ts`(`pnpm check`), 실 MariaDB 는 `*.db.test.ts`(Docker 컨테이너 `admin-kit-test-db` 가 떠 있어야 한다). 🔴 DB 테스트 하나만 돌리는 명령은 `pnpm --filter @ssworks/admin-server test:db <이름>` — `--` 를 넣으면 거르지 않는다. 단위는 `pnpm --filter @ssworks/admin-server test <이름>`. lint 는 **루트 `pnpm lint`**(패키지에 lint 스크립트가 없다), 타입은 `pnpm --filter @ssworks/admin-server typecheck`, 전체는 `pnpm check` · `pnpm test:db`.
- 🔴 DB 테스트는 앞 테스트의 잔여에 기대지 않는다 — 테스트마다 자기 시드 · 고유 이름. 🔴 이름 · 아이디는 `utf8mb4_unicode_ci` 다 — 대소문자 · 끝 공백만으로 가르지 않는다(2e 스펙 §14 R1-7). `seedRole(t.db)` 의 기본 권한은 `['*']` — 늘 `permissions` 를 명시한다. 공유 데이터베이스에 `'*'` **사용자**를 만들지 않는 파일(`users.write` · `users.employment` · `roles.service` 의 머리 주석)을 지킨다.
- 🔴 원시 연결(`mariadb.createConnection`)은 `try/finally` 로 롤백 · 종료한다(`whileHeld` 가 한다). 기다리는 동안 거부될 수 있는 프로미스는 `settle` 로 바로 받아 둔다. 원시 SQL 의 식별자는 snake_case 다(`guard_locks` · `team_user_map`). 스냅샷 Kysely 는 `await snapshotKysely(t, on)` 으로 만들고 `finally` 에서 `destroy()` 한다.
- 🔴 경합 테스트는 **공개 서비스 메서드**를 거친다. 잠금 대기는 `whileHeld`(STATUS 폴링)로 본다 — `information_schema.innodb_trx` 는 서버 전역 캐시라 쓰지 않는다(2e 스펙 §14 R1-6). "잠그지 않는다" 는 원시 연결이 상관없는 행 하나만 쥔 채 서비스가 잠금 대기 없이 끝나는지로 직접 잰다(2e-1 `teams.guard.db.test.ts` 의 모양).
- 테스트 코드도 린트를 통과한다(쓰이지 않는 변수 · import 없음). bigint 가 든 HTTP 본문은 `stringifyJSON` 으로 보낸다(`users.http.db.test.ts` 의 `sendJson`).
- 셸: Windows(Git Bash) · Linux 양쪽. 🔴 출력을 `/dev/null` 로 보내지 않는다(Windows 에 `NUL` 파일이 생긴다) — 출력 억제 자체를 하지 않는다. 파일을 python · sed 로 다시 쓰지 않는다(LF). pnpm 설치는 짧은 `%TEMP%` 경로에서 한다.
- 🔴 도구 입력의 백슬래시 이스케이프는 JSON 으로 풀린다 — 새 코드 · 테스트에 백슬래시를 쓰지 않는다(따옴표가 겹치면 템플릿 리터럴). 백슬래시가 든 줄을 고쳤다면 `node -e` 와 `charCodeAt` 으로 그 자리 바이트를 확인한다.
- 플랜의 코드 블록은 prettier 를 거치지 않았다 — 커밋 전에 바꾼 파일에 `pnpm exec prettier --write <파일…>` 을 돌린다. 마지막 Task 의 `pnpm format:check` 가 지킨다.
- 커밋: 한국어 conventional commits. 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `gh pr merge` · `pnpm release` · `npm publish` · `pnpm stage approve` 는 하지 않는다.

## Review Focus

스펙이 함의하지만 다른 테스트가 재지 않는, 사람이 먼저 부딪힐 입력 다섯. 각 줄의 테스트를 담당 Task 에 넣었다.

1. **권한 없는 관리자가 없는 팀(또는 없는 팀 + 역할 변경)으로 넓은 계정을 고친다** — `lockTeam` 이 잠금 단계로 들어가도 400 `teamNo` 가 아니라 403 `higherAccount`(오류 순서 그대로). → Task 1 `users.write` "오류 순서".
2. **기본 켜기와 권한 변경을 한 번에 보낸 역할 수정** — 잔존 갈래의 잠금 단계에서 다른 기본 역할을 잠그고, 쓰기 단계에서 끄며, `clearedDefaults` 가 맞다. → Task 1 `roles.service` "기본 켜기와 권한 변경을 함께".
3. **잔존 409(마지막 전권자)에서 잠금 단계 · 쓰기 단계의 변경이 모두 롤백** — 치유 구간 · 세션 폐기 · 다른 기본 끄기까지. → 지금 테스트(`users.employment` "잔존" · `users.write` "잔존" · `roles.service` "마지막 전체 권한")가 그대로 초록이어야 한다 — Task 1 Step 6 의 전체 실행.
4. **시드가 `displayOrder` 를 0 으로 여럿 둔 역할 표**(시드 기본값) — 만들기가 끝 행 + 1 = 1, 그다음 2. → Task 2 `roles.index` "순서 시드가 0 여럿".
5. **살아 있는 · 만료된 미폐기 · 이미 폐기된(`rotated`) 세션이 섞인 계정** — 초기화 · 즉시 퇴사의 `revokedCount` 는 살아 있던 것만, 만료 행은 그대로 미폐기, `rotated` 사유는 덮지 않는다. → Task 4 `users.employment` · `users.password`.

## 파일 구조

| 파일                                                                                                                                                                                                                     | 책임                                                                                                               | Task |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---- |
| `packages/admin-server/src/accounts/super-admin.ts` · `roles/roles.service.ts` · `users/users.service.ts` · `users/user-view.ts`                                                                                         | `LockedWrite` · 셈 자리 · 잠금 단계(역할 수정 · 삭제 · 사용자 수정 · 퇴사) · `lockOtherDefaults` · `clearDefaults` | 1    |
| `accounts/super-admin.db.test.ts` · `users/users.employment.db.test.ts` · `users/users.snapshot.db.test.ts` · (새) `roles/roles.snapshot.db.test.ts` · `users/users.write.db.test.ts` · `roles/roles.service.db.test.ts` | 잠금 단계 뷰 · r1~r4 · Review Focus 1 · 2                                                                          | 1    |
| `database/migrations/0001_roles.ts` · `ddl.test.ts` · `migrations.db.test.ts` · `roles/roles.service.ts` · (새) `roles/roles.index.db.test.ts`                                                                           | 인덱스 둘 · 끝 행 순서 셈 · i1~i3 · Review Focus 4                                                                 | 2    |
| `accounts/account-command.ts` · `.test.ts` · `users/users.service.ts`(주석) · `users/users.employment.db.test.ts` · `users/users.http.db.test.ts`                                                                        | 본인 재입사 403                                                                                                    | 3    |
| `accounts/calendar.ts` · `calendar.test.ts` · `options.test.ts` · `users/users.service.ts` · `users/users.employment.db.test.ts` · `users/users.password.db.test.ts`                                                     | `timeZone` 정규 이름 · `liveOnly` · Review Focus 5                                                                 | 4    |
| `users/users.write.db.test.ts` · `users/users.employment.db.test.ts` · `users/users.http.db.test.ts`                                                                                                                     | `lockGrantRole` 회귀 · B7 · 치유 롤백 · `day()`                                                                    | 5    |
| `packages/admin-server/README.md` · `.changeset/admin-server-accounts-cleanup.md` · 스펙 셋 §14 · `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`                                                                  | 문서 · 릴리스 · 스모크                                                                                             | 6    |

(경로는 Task 안에서 `packages/admin-server/src/` 부터 적는다.)

**플랜 작성 중 확인한 것(스펙 §14 R1 에 적었다):** 새 순서가 a1 · b · d 경합의 1020 과 낡은 보기 읽기를 없앤다. 로그아웃 경합(a3)의 1020 은 남고, 회전(a2)과의 교착은 회전이 희생자다. 인덱스가 있으면 끝 행 셈 · `MAX` · 기본 찾기 · 구간 UPDATE 가 상관없는 행을 기다리지 않는다(작은 표에서도). 동시 만들기는 여전히 줄을 선다. `LockedWrite` 제네릭이 `write` 인자를 `lock` 결과로 추론한다. 그리고 Kysely 가 내는 SQL 은 ``create index `idx_roles_display_order` on `roles` (`display_order`)`` · ``select `display_order` from `roles` order by `display_order` desc limit ? for update`` 다(실측).

**권장 모델(Subagent-driven):** 구현 — Task 3 haiku(명세 확정 1~2파일 + 테스트), 나머지 sonnet. 리뷰 — Task 1 · 2 · 5(잔존 · 잠금 · 회귀) opus, Task 3 · 4 · 6 sonnet. 최종 whole-branch 리뷰 opus.

---

### Task 1: 잔존 잠금 단계 — `{ lock, write }` · 셈 자리 · 쓰는 곳 넷(이월 1 · 2e-1)

**Files:**

- Modify: `packages/admin-server/src/accounts/super-admin.ts`(전체 교체)
- Modify: `packages/admin-server/src/roles/roles.service.ts`(머리 주석 · import · 타입 둘 · `create` 의 기본 끄기 · `update` · `remove` · `clearOtherDefaults` → 둘)
- Modify: `packages/admin-server/src/users/users.service.ts`(import · `update` · `resign`)
- Modify: `packages/admin-server/src/users/user-view.ts`(12~20행 주석)
- Modify: `packages/admin-server/src/accounts/super-admin.db.test.ts`(전체 교체)
- Modify: `packages/admin-server/src/users/users.employment.db.test.ts`(경합 테스트 끝 단언)
- Modify: `packages/admin-server/src/users/users.snapshot.db.test.ts`(전체 교체)
- Create: `packages/admin-server/src/roles/roles.snapshot.db.test.ts`
- Modify: `packages/admin-server/src/users/users.write.db.test.ts`(Review Focus 1)
- Modify: `packages/admin-server/src/roles/roles.service.db.test.ts`(Review Focus 2)

**Interfaces:**

- Consumes: `lockGuardRow`(`database/guard-locks.ts`), `lockUser` · `lockGrantRole` · `lockTeam` · `replaceTeam` · `LockedUser`(`users/user-locks.ts`), `whileHeld` · `snapshotKysely`(`test-support/concurrency.ts`).
- Produces:
  - `export interface LockedWrite<L, T> { lock: () => Promise<L>; write: (locked: L) => Promise<T> }`(`accounts/super-admin.ts`)
  - `export async function withSuperAdminSurvival<L, T>(trx: Transaction<AdminDatabase>, steps: LockedWrite<L, T>): Promise<T>` — 옛 `(trx, write)` 는 없다.
  - `roles/roles.service.ts` 안(내보내지 않음): `lockOtherDefaults(trx, except: bigint | null): Promise<bigint[]>` · `clearDefaults(trx, roleNos: bigint[]): Promise<void>` — Task 2 의 `create` 가 그대로 쓴다.

- [ ] **Step 1: 잔존 테스트를 새 API 로 다시 쓰고 잠금 단계 테스트를 더한다**

`packages/admin-server/src/accounts/super-admin.db.test.ts` 를 통째로 바꾼다:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GUARD_MESSAGES } from '../database/guard-locks.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { ACCOUNT_MESSAGES } from './errors.js'
import {
  GUARD_LOCK_SUPER_ADMIN,
  countSuperAdmins,
  lockSuperAdminGuard,
  withSuperAdminSurvival,
} from './super-admin.js'

// 🔴 이 파일은 셈을 잰다 — seedRole 의 기본 권한이 ['*'] 이므로 늘 permissions 를 명시한다.

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

const count = (db: TestDatabase['db']) => db.transaction().execute((trx) => countSuperAdmins(trx))

describe('센티넬 행', () => {
  it('장의 리터럴과 잠금 함수의 이름이 같다', async () => {
    expect(
      await t.db
        .selectFrom('guardLocks')
        .select('lockName')
        .where('lockName', '=', GUARD_LOCK_SUPER_ADMIN)
        .execute(),
    ).toEqual([{ lockName: GUARD_LOCK_SUPER_ADMIN }])
  })
})

describe('countSuperAdmins', () => {
  it("재직 · '*' 만 센다 — 퇴사 · 퇴사 예정 · '*' 없는 역할 · 'a*' 는 빼고, '*' 와 다른 키가 섞여도 센다(§14 R1-2)", async () => {
    const before = await count(t.db)
    const star = await seedRole(t.db, { roleName: 'cnt-star', permissions: ['*'] })
    const mixed = await seedRole(t.db, {
      roleName: 'cnt-mixed',
      permissions: ['org.users:read', '*'],
    })
    const plain = await seedRole(t.db, { roleName: 'cnt-plain', permissions: ['org.users:read'] })
    const sub = await seedRole(t.db, { roleName: 'cnt-sub', permissions: ['a*'] })
    const empty = await seedRole(t.db, { roleName: 'cnt-empty', permissions: [] })
    await seedUser(t.db, { roleNo: star })
    await seedUser(t.db, { roleNo: mixed })
    await seedUser(t.db, { roleNo: star, resignAt: new Date(Date.now() - 60_000) })
    await seedUser(t.db, { roleNo: star, resignAt: new Date(Date.now() + 86_400_000) })
    await seedUser(t.db, { roleNo: plain })
    await seedUser(t.db, { roleNo: sub })
    await seedUser(t.db, { roleNo: empty })
    expect(await count(t.db)).toBe(before + 2)
  })
})

describe('lockSuperAdminGuard', () => {
  it('🔴 센티넬을 기다린 셈은 앞 트랜잭션의 커밋을 본다(§14 R1-3a — 잠금이 첫 문장이어야 하는 이유)', async () => {
    const role = await seedRole(t.db, { roleName: 'race-star', permissions: ['*'] })
    await seedUser(t.db, { roleNo: role })
    const baseline = await count(t.db)

    const holder = await createConnection({ ...testDbServer(), database: t.name })
    let waiting: Promise<{ waited: number; count: number }>
    try {
      await holder.beginTransaction()
      await holder.query(
        `select lock_name from guard_locks where lock_name = 'superAdminSurvival' for update`,
      )
      await holder.query(`update roles set permissions = '["org.users:read"]' where role_no = ?`, [
        role,
      ])

      const started = Date.now()
      waiting = t.db.transaction().execute(async (trx) => {
        await lockSuperAdminGuard(trx)
        return { waited: Date.now() - started, count: await countSuperAdmins(trx) }
      })
      await new Promise((resolve) => setTimeout(resolve, 400))
      await holder.commit()
    } finally {
      // 커밋 못 한 채 끝나면 센티넬 잠금이 남아 afterAll 의 DROP DATABASE 가 막힌다
      await holder.rollback().catch(() => undefined)
      await holder.end()
    }

    const result = await waiting
    expect(result.waited).toBeGreaterThanOrEqual(350)
    expect(result.count).toBe(baseline - 1)
  })
})

describe('withSuperAdminSurvival — 잠금 단계(2d-3 스펙 ① A · C2)', () => {
  it('🔴 잠금 단계가 기다린 사이 커밋된 대상의 변경을 쓰기 단계의 비잠금 읽기가 본다 — 셈이 잠금 단계 뒤에 읽기 뷰를 연다', async () => {
    const role = await seedRole(t.db, { roleName: 'stage-plain', permissions: ['org.users:read'] })
    const user = await seedUser(t.db, { roleNo: role })
    const result = await whileHeld(
      t,
      async (connection) => {
        await connection.query('select user_no from users where user_no = ? for update', [
          user.userNo,
        ])
        await connection.query(
          'update users set login_fail_count = login_fail_count + 1 where user_no = ?',
          [user.userNo],
        )
      },
      () =>
        t.db.transaction().execute((trx) =>
          withSuperAdminSurvival(trx, {
            lock: () =>
              trx
                .selectFrom('users')
                .select('userNo')
                .where('userNo', '=', user.userNo)
                .forUpdate()
                .executeTakeFirstOrThrow(),
            write: async (locked) => {
              const row = await trx
                .selectFrom('users')
                .select('loginFailCount')
                .where('userNo', '=', locked.userNo)
                .executeTakeFirstOrThrow()
              return row.loginFailCount
            },
          }),
        ),
    )
    if (!result.ok) throw result.error
    // 셈이 잠금 단계 앞이면 0(셈이 연 뷰는 원시 연결의 커밋 전이다 — 2d-3 스펙 §14 R1-1)
    expect(result.value).toBe(1)
  })
})

describe('withSuperAdminSurvival', () => {
  // 셈이 0 과 1 사이를 오가야 하므로 데이터베이스를 따로 쓴다.
  let u: TestDatabase

  beforeAll(async () => {
    u = await createTestDatabase()
  })

  afterAll(async () => {
    await u?.drop()
  })

  it('🔴 마지막 전체 권한 재직자를 없애는 쓰기는 409 이고 롤백된다', async () => {
    const role = await seedRole(u.db, { roleName: 'last-star', permissions: ['*'] })
    await seedUser(u.db, { roleNo: role })
    const error = await u.db
      .transaction()
      .execute((trx) =>
        withSuperAdminSurvival(trx, {
          lock: async () => undefined,
          write: async () => {
            await trx
              .updateTable('roles')
              .set({ permissions: JSON.stringify(['org.users:read']) })
              .where('roleNo', '=', role)
              .execute()
          },
        }),
      )
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect((error as BusinessError).message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    const after = await u.db
      .selectFrom('roles')
      .select('permissions')
      .where('roleNo', '=', role)
      .executeTakeFirstOrThrow()
    expect(after.permissions).toEqual(['*'])
  })

  it('하나가 남으면 통과하고 결과를 돌려준다 — lock() 의 값이 write 의 인자다', async () => {
    const role = await seedRole(u.db, { roleName: 'second-star', permissions: ['*'] })
    const user = await seedUser(u.db, { roleNo: role })
    await seedUser(u.db, { roleNo: role }) // 남을 한 명 — 앞 테스트가 남긴 상태에 기대지 않는다
    const result = await u.db.transaction().execute((trx) =>
      withSuperAdminSurvival(trx, {
        lock: async () => user.userNo,
        write: async (userNo) => {
          await trx
            .updateTable('users')
            .set({ resignAt: new Date() })
            .where('userNo', '=', userNo)
            .execute()
          return 'done'
        },
      }),
    )
    expect(result).toBe('done')
  })

  it('센티넬 행이 없으면 500 ERR_COMMON_INTERNAL — 잠금 단계 · 쓰기 전에 멈춘다', async () => {
    await u.db.deleteFrom('guardLocks').where('lockName', '=', GUARD_LOCK_SUPER_ADMIN).execute()
    const reached: string[] = []
    try {
      const error = await u.db
        .transaction()
        .execute((trx) =>
          withSuperAdminSurvival(trx, {
            lock: async () => {
              reached.push('lock')
            },
            write: async () => {
              reached.push('write')
            },
          }),
        )
        .catch((caught: unknown) => caught)
      expect(reached).toEqual([])
      expect(error).toBeInstanceOf(BusinessError)
      expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_INTERNAL)
      expect((error as BusinessError).message).toBe(GUARD_MESSAGES.missing)
    } finally {
      await u.db
        .insertInto('guardLocks')
        .values({ lockName: GUARD_LOCK_SUPER_ADMIN, description: '테스트가 되돌림' })
        .execute()
    }
  })
})

describe('withSuperAdminSurvival 경합', () => {
  // 기준선(전권자 둘)이 알려져 있어야 하므로 데이터베이스를 따로 쓴다.
  let v: TestDatabase

  beforeAll(async () => {
    v = await createTestDatabase()
  })

  afterAll(async () => {
    await v?.drop()
  })

  it('🔴 둘 중 하나를 앞 트랜잭션이 내리는 동안 다른 하나를 내리면 409 — 잠금이 전 셈보다 먼저여야 한다(write skew)', async () => {
    const roleA = await seedRole(v.db, { roleName: 'skew-a', permissions: ['*'] })
    const roleB = await seedRole(v.db, { roleName: 'skew-b', permissions: ['*'] })
    await seedUser(v.db, { roleNo: roleA })
    await seedUser(v.db, { roleNo: roleB })
    expect(await count(v.db)).toBe(2)

    const holder = await createConnection({ ...testDbServer(), database: v.name })
    let waiting: Promise<unknown>
    try {
      await holder.beginTransaction()
      await holder.query(
        `select lock_name from guard_locks where lock_name = 'superAdminSurvival' for update`,
      )
      await holder.query(`update roles set permissions = '[]' where role_no = ?`, [roleA])

      waiting = v.db
        .transaction()
        .execute((trx) =>
          withSuperAdminSurvival(trx, {
            lock: async () => undefined,
            write: async () => {
              await trx
                .updateTable('roles')
                .set({ permissions: JSON.stringify([]) })
                .where('roleNo', '=', roleB)
                .execute()
            },
          }),
        )
        .catch((caught: unknown) => caught)
      await new Promise((resolve) => setTimeout(resolve, 400))
      await holder.commit()
    } finally {
      // 커밋 못 한 채 끝나면 센티넬 잠금이 남아 afterAll 의 DROP DATABASE 가 막힌다
      await holder.rollback().catch(() => undefined)
      await holder.end()
    }

    const error = await waiting
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect((error as BusinessError).message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    const b = await v.db
      .selectFrom('roles')
      .select('permissions')
      .where('roleNo', '=', roleB)
      .executeTakeFirstOrThrow()
    expect(b.permissions).toEqual(['*'])
  })
})
```

- [ ] **Step 2: 퇴사 경합(r1)의 before 단언을 뒤집는다**

`packages/admin-server/src/users/users.employment.db.test.ts` 의 `'🔴 퇴사가 대상 잠금을 기다리는 동안 재입사가 커밋되면 그 구간을 본다 …'` 테스트에서 이 세 줄을

```ts
// 알려진 동작 — 감사 before 는 잔존 셈의 읽기 뷰(OFF)라 기다린 사이의 재입사를 못 본다. 판정 · 저장은 위처럼 맞다.
//   withSuperAdminSurvival 순서를 바꾸면(후속) 이 단언을 resignDate: null 로 바꾼다.
expect(result.value.before).toMatchObject({ resignDate: '2025-12-31' })
```

이렇게 바꾼다:

```ts
// 🔴 셈이 대상 잠금 뒤에 읽기 뷰를 연다 — before 가 기다린 사이의 재입사를 본다(2d-3 스펙 ① A · §14 R1-1).
//    셈을 잠금 단계 앞으로 되돌리면 '2025-12-31'(낡음)이 된다.
expect(result.value.before).toMatchObject({ resignDate: null })
```

- [ ] **Step 3: 스냅샷 경합(r2 · r3)을 다시 쓴다**

`packages/admin-server/src/users/users.snapshot.db.test.ts` 를 통째로 바꾼다:

```ts
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { snapshotKysely, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { periodsOf, seedPeriod, userRow } from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 🔴 MariaDB 11.6.2+ 는 innodb_snapshot_isolation=ON 이 기본이다(hangang 은 11.6.2, CI 는 11.4 — 풀 initSql 로 켠다,
//    2d §14 R7-8). 잔존으로 감싼 쓰기는 대상 · 줄 역할 · 팀을 잠근 **뒤에** 셈(비잠금)으로 읽기 뷰를 연다(2d-3 스펙 ① A).
//    그래서 대상의 로그인 실패 · 같은 팀의 이름 바꾸기가 그 잠금 전에 커밋돼도 ON 은 1020 이 아니라 기다렸다 성공하고, OFF 는
//    보기 읽기(before · item)가 낡지 않는다(2d-3 스펙 §14 R1-1 · R1-5). 옛 순서(센티넬 → 셈 → 대상 잠금)는 ON 409 · OFF 낡은
//    item 이었다. 공개 서비스 메서드를 거친다 — 부품을 따로 부르면 순서 회귀를 못 잡는다.

let t: TestDatabase
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

async function target(userId: string) {
  const roleNo = await seedRole(t.db, {
    roleName: `${userId}-role`,
    permissions: ['org.users:read'],
  })
  const user = await seedUser(t.db, { roleNo, userId })
  await seedPeriod(t.db, { userNo: user.userNo, joinDate: '2025-01-02' })
  return user
}

/** 로그인 실패 한 번(2b updateLoginState 와 같은 모양) — 센티넬을 잡지 않는다 */
function loginFailure(userNo: bigint) {
  return async (connection: Connection) => {
    await connection.query('select login_fail_count from users where user_no = ? for update', [
      userNo,
    ])
    await connection.query(
      'update users set login_fail_count = login_fail_count + 1 where user_no = ?',
      [userNo],
    )
  }
}

/** 팀 이름 바꾸기(2e-1 팀 쓰기 모양) — teamTree 가드 · 팀 행을 잡고 이름을 바꾼다. 사용자 잠금 없이 팀 행을 바꾼다 */
function renameTeam(teamNo: bigint, teamName: string) {
  return async (connection: Connection) => {
    await connection.query(
      `select lock_name from guard_locks where lock_name = 'teamTree' for update`,
    )
    await connection.query('select team_no from teams where team_no = ? for update', [teamNo])
    await connection.query('update teams set team_name = ? where team_no = ?', [teamName, teamNo])
  }
}

describe.each([
  ['ON', true],
  ['OFF', false],
] as const)('스냅샷 격리 %s', (label, snapshot) => {
  it('🔴 퇴사 — 대상의 로그인 실패가 커밋되기를 기다렸다 그 위에서 퇴사한다(1020 없음 · 2d-3 스펙 §5-4)', async () => {
    const user = await target(`snap-resign-${label}`)
    const db = await snapshotKysely(t, snapshot)
    try {
      const service = new AdminUsersService(db, usersConfig(), new AdminSessionStore(db), undefined)
      const result = await whileHeld(t, loginFailure(user.userNo), () =>
        service.resign(user.userNo, { resignDate: '2030-01-31' }, root),
      )
      if (!result.ok) throw result.error
      expect(result.value.before).toMatchObject({ resignDate: null, revision: 0 })
    } finally {
      await db.destroy()
    }
    expect(await userRow(t.db, user.userNo)).toMatchObject({ revision: 1, loginFailCount: 1 })
    expect((await periodsOf(t.db, user.userNo)).map((period) => period.resignDate)).toEqual([
      '2030-01-31',
    ])
  })

  it('🔴 역할 변경 — 같은 팀의 이름 바꾸기가 커밋되기를 기다렸다 바뀐 이름으로 성공한다(2e-1 이월 · lockTeam 이 셈 앞)', async () => {
    const user = await target(`snap-team-${label}`)
    const grant = await seedRole(t.db, {
      roleName: `snap-grant-${label}`,
      permissions: ['org.users:read'],
    })
    const team = await seedTeam(t.db, `snap-old-${label}`)
    const db = await snapshotKysely(t, snapshot)
    try {
      const service = new AdminUsersService(db, usersConfig(), new AdminSessionStore(db), undefined)
      const result = await whileHeld(t, renameTeam(team, `snap-new-${label}`), () =>
        service.update(user.userNo, { revision: 0, roleNo: grant, teamNo: team }, root),
      )
      if (!result.ok) throw result.error
      // OFF 에서 셈이 lockTeam 앞이면 item 의 팀 이름이 바뀌기 전 값이다(R10-2) — ON 이면 409
      expect(result.value.item).toMatchObject({
        roleNo: grant,
        teamNo: team,
        teamName: `snap-new-${label}`,
        revision: 1,
      })
    } finally {
      await db.destroy()
    }
  })
})
```

- [ ] **Step 4: 역할 스냅샷 경합(r4)을 만든다**

`packages/admin-server/src/roles/roles.snapshot.db.test.ts`:

```ts
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { accountsConfig, testPrincipal } from '../test-support/accounts.js'
import { seedRole } from '../test-support/auth.js'
import { snapshotKysely, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminRolesService } from './roles.service.js'

// 🔴 잔존으로 감싼 역할 수정 · 삭제는 대상 역할을 잠근 뒤에 셈한다(2d-3 스펙 ① A · C3). 역할 이동은 센티넬 · revision 없이
//    역할 행을 바꾼다 — 옛 순서(센티넬 → 셈 → 역할 잠금)는 스냅샷 격리 ON 에서 1020 → 409 였다(2d-3 스펙 §14 R1-6).
//    공개 서비스 메서드를 거친다. 🔴 seedRole 은 늘 permissions 를 명시한다(기본 ['*']). 사용자는 만들지 않는다.

let t: TestDatabase
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

/** 이동 모양 — 역할 행을 잡고 displayOrder 만 바꾼다(revision 그대로) */
function moving(roleNo: bigint) {
  return async (connection: Connection) => {
    await connection.query('select role_no from roles where role_no = ? for update', [roleNo])
    await connection.query(
      'update roles set display_order = display_order + 100 where role_no = ?',
      [roleNo],
    )
  }
}

describe.each([
  ['ON', true],
  ['OFF', false],
] as const)('스냅샷 격리 %s', (label, snapshot) => {
  it('🔴 권한 수정 — 그 역할의 이동이 커밋되기를 기다렸다 성공하고 이동한 순서를 본다', async () => {
    const roleNo = await seedRole(t.db, {
      roleName: `snap-update-${label}`,
      permissions: ['org.users:read'],
    })
    const db = await snapshotKysely(t, snapshot)
    try {
      const service = new AdminRolesService(db, accountsConfig(), undefined)
      const result = await whileHeld(t, moving(roleNo), () =>
        service.update(
          roleNo,
          { revision: 0, permissions: ['org.users:read', 'org.roles:read'] },
          root,
        ),
      )
      if (!result.ok) throw result.error
      expect(result.value.item).toMatchObject({
        revision: 1,
        permissions: ['org.users:read', 'org.roles:read'],
      })
      expect(result.value.item.displayOrder).toBeGreaterThanOrEqual(100)
    } finally {
      await db.destroy()
    }
  })

  it('🔴 삭제 — 그 역할의 이동이 커밋되기를 기다렸다 지운다', async () => {
    const roleNo = await seedRole(t.db, {
      roleName: `snap-remove-${label}`,
      permissions: ['org.users:read'],
    })
    const db = await snapshotKysely(t, snapshot)
    try {
      const service = new AdminRolesService(db, accountsConfig(), undefined)
      const result = await whileHeld(t, moving(roleNo), () =>
        service.remove(roleNo, { revision: 0 }, root),
      )
      if (!result.ok) throw result.error
    } finally {
      await db.destroy()
    }
    expect(
      await t.db.selectFrom('roles').select('roleNo').where('roleNo', '=', roleNo).execute(),
    ).toEqual([])
  })
})
```

- [ ] **Step 5: Review Focus 1 · 2 테스트를 더한다**

`packages/admin-server/src/users/users.write.db.test.ts` — `describe('update', …)` 안, `'없는 사용자 404 · 없는 역할 400 roleNo'` 테스트 **앞**에 더한다:

```ts
it('🔴 오류 순서 — 권한 없는 사람이 없는 팀으로 바꾸면 400 teamNo 가 아니라 403(판정이 팀 잠금보다 먼저 — 2d-3 스펙 §5-3)', async () => {
  const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'u-order-wide' })
  for (const body of [
    { revision: 0, teamNo: 999_999n },
    { revision: 0, roleNo: plainRole, teamNo: 999_999n },
  ]) {
    const error = await rejection(() => service.update(wide.userNo, body, manager))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherAccount)
  }
  expect(await userRow(t.db, wide.userNo)).toMatchObject({ roleNo: wideRole, revision: 0 })
})
```

`packages/admin-server/src/roles/roles.service.db.test.ts` — `describe('update', …)` 안, `'기본 역할을 켜면 다른 기본 역할을 끄고, 끄면 0개도 허용한다'` 테스트 **다음**에 더한다:

```ts
it('🔴 기본 켜기와 권한 변경을 함께 — 잔존 갈래에서도 다른 기본 역할을 끄고 clearedDefaults 를 돌려준다(2d-3 스펙 C4)', async () => {
  const a = await service.create(
    { roleName: 'flag-both-a', isDefault: true, permissions: [] },
    root,
  )
  const b = await service.create(
    { roleName: 'flag-both-b', isDefault: false, permissions: [] },
    root,
  )
  const result = await service.update(
    b.roleNo,
    { revision: 0, isDefault: true, permissions: ['org.users:read'] },
    root,
  )
  expect(result.clearedDefaults).toEqual([a.roleNo])
  expect(result.item).toMatchObject({
    isDefault: true,
    permissions: ['org.users:read'],
    revision: 1,
  })
  expect(await stored(a.roleNo)).toMatchObject({ isDefault: false, revision: 1 })
})
```

- [ ] **Step 6: 돌려 RED 를 본다**

```bash
pnpm --filter @ssworks/admin-server test:db super-admin
pnpm --filter @ssworks/admin-server test:db users.employment
pnpm --filter @ssworks/admin-server test:db users.snapshot
pnpm --filter @ssworks/admin-server test:db roles.snapshot
pnpm --filter @ssworks/admin-server test:db users.write
pnpm --filter @ssworks/admin-server test:db roles.service
```

Expected:

- `super-admin` — `withSuperAdminSurvival` 을 쓰는 다섯이 `TypeError: write is not a function`(옛 시그니처가 객체를 함수로 부른다).
- `users.employment` — r1 이 `resignDate: '2025-12-31'` 을 받아 실패.
- `users.snapshot` — ON 두 테스트가 409 `ERR_COMMON_CONFLICT`(원인 `ER_CHECKREAD`)로, OFF 역할 변경이 `teamName: 'snap-old-OFF'` 로 실패. OFF 퇴사는 통과할 수 있다(옛 순서에서도 OFF 는 기다렸다 성공 — 보는 열이 같다).
- `roles.snapshot` — ON 두 테스트가 409 로 실패, OFF 는 통과할 수 있다.
- `users.write` · `roles.service` 의 새 테스트는 **통과한다**(옛 순서에서도 같은 동작 — 회귀 고정). 보고서에 "구현 전 GREEN — 회귀 고정" 으로 적는다.

- [ ] **Step 7: `super-admin.ts` 를 바꾼다**

`packages/admin-server/src/accounts/super-admin.ts` 를 통째로 바꾼다:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { sql, type SqlBool, type Transaction } from 'kysely'
import { lockGuardRow } from '../database/guard-locks.js'
import type { AdminDatabase } from '../database/types.js'
import { ACCOUNT_MESSAGES } from './errors.js'

// 정본: hangang-home apps/api/src/core/permissions/monotonicity.ts lockSuperAdminGuard · countReachableSuperAdmins ·
//       assertSuperAdminSurvives
// 바꾼 점:
//  - 셈은 재직(resignAt IS NULL) ∧ 역할에 '*'. IP 층(applicableIpLayer — "어디서든 로그인할 수 있는")은 2f 가 더한다.
//  - '*' 판정은 JSON_CONTAINS — hangang 의 LIKE '%"*"%' 는 문자열 매칭이라 '*' 를 품은 키에 오탐한다(2d 스펙 §14 R1-2).
//  - 잠금 · 잠금 단계 · 전 셈 · 쓰기 · 후 셈 · 판정을 withSuperAdminSurvival 하나로 묶는다 — 부르는 쪽이 순서를 틀리지 않게.
//  - 셈을 대상 잠금 뒤로 옮겼다(잠금 단계 콜백 — 2d-3 스펙 ① A). hangang 은 센티넬 → 셈 → 대상 잠금이었다 — 셈이 연 읽기
//    뷰가 대상 잠금을 기다린 사이의 커밋을 못 봐 감사 before · item 이 낡고(OFF), ON 은 1020 이었다(2d-3 스펙 §14 R1).
// 🔴 센티넬 잠금은 트랜잭션의 첫 문장이어야 한다 — InnoDB REPEATABLE READ 는 첫 **비잠금** SELECT 에서 읽기 뷰를 만든다.
//    그보다 먼저 셈을 읽으면 앞서 이 행을 쥐었던 트랜잭션의 커밋을 못 본다(2d §14 R1-3a 실측).
// 🔴 셈은 잠금 단계 뒤다 — 이 트랜잭션의 첫 비잠금 읽기라 읽기 뷰가 여기서 열린다. 잠금 단계에 비잠금 SELECT 를 두면 뷰가
//    먼저 열려 재배치가 무너진다(2d-3 스펙 C2). 센티넬이 셈을 줄이는 쓰기를 모두 줄 세우므로 센티넬 뒤 · 셈 전에 커밋될 수
//    있는 것은 셈을 늘리거나 셈과 무관한 쓰기뿐이다 — 전 셈은 그대로 맞다.
// 🔴 셈에 FOR UPDATE 를 붙이지 않는다 — 대상 행 잠금과 전 행 스캔이 엇갈려 교착한다(hangang).
// 🔴 한 트랜잭션은 guardLocks 행을 둘 이상 잡지 않는다. 이 함수들은 Transaction 만 받는다 — 트랜잭션 밖에서 부를 수 없게.
// 셈을 늘리기만 하는 쓰기(역할 · 사용자 만들기 · 재입사)는 잠그지 않는다 — 늘어나는 것은 놓쳐도 안전하다.

/** 장 0009 의 시드 행 이름 — 장은 리터럴로 넣는다(같은 값인지는 DB 테스트가 잰다) */
export const GUARD_LOCK_SUPER_ADMIN = 'superAdminSurvival'

/**
 * 잔존으로 감쌀 수 있는 쓰기의 두 단계(2d-3 스펙 C1).
 * - `lock` — 🔴 잠금 읽기(`FOR UPDATE`)와 판정 · revision · 상태 검사만. 남이 대상 행 잠금 없이 바꿀 수 있는 결정 행(대상
 *   users ⋈ roles · 줄 역할 · 팀 · 다른 기본 역할)을 모두 여기서 잠근다(C3). 비잠금 SELECT(보기 읽기 · 쓰는 중 검사 · 셈)를
 *   두지 않는다(C2).
 * - `write` — 셈 뒤. 보기 읽기 · 대상 아래 행(그 사용자의 소속 · 재직 이력)의 잠금 읽기 · 쓰기 · 세션 폐기(C5).
 * 잔존이 필요 없는 갈래는 `steps.write(await steps.lock())` 로 같은 순서를 부른다.
 */
export interface LockedWrite<L, T> {
  lock: () => Promise<L>
  write: (locked: L) => Promise<T>
}

export async function lockSuperAdminGuard(trx: Transaction<AdminDatabase>): Promise<void> {
  await lockGuardRow(trx, GUARD_LOCK_SUPER_ADMIN)
}

/** 재직(퇴사 예정도 뺀다) · 역할에 '*' 가 있는 사용자 수 */
export async function countSuperAdmins(trx: Transaction<AdminDatabase>): Promise<number> {
  const row = await trx
    .selectFrom('users as u')
    .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
    .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
    .where('u.resignAt', 'is', null)
    .where(sql<SqlBool>`json_contains(${sql.ref('r.permissions')}, '"*"')`)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

/** "0 이면 거부" 가 아니라 "있었는데 0 이 되면 거부" — 이미 0 인 저장소를 마비시키지 않는다 */
export function assertSuperAdminSurvives(before: number, after: number): void {
  if (before >= 1 && after < 1) {
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, ACCOUNT_MESSAGES.lastSuperAdmin)
  }
}

/**
 * 잔존을 줄일 수 있는 쓰기를 감싼다 — 센티넬(첫 문장) → lock() → 전 셈 → write(locked) → 후 셈 → 판정(던지면 롤백)
 * 🔴 호출자는 트랜잭션의 첫 호출로 부른다 — 앞선 SELECT(revision 확인 등)가 읽기 뷰를 먼저 열면 셈이 낡는다
 */
export async function withSuperAdminSurvival<L, T>(
  trx: Transaction<AdminDatabase>,
  steps: LockedWrite<L, T>,
): Promise<T> {
  await lockSuperAdminGuard(trx)
  const locked = await steps.lock()
  const before = await countSuperAdmins(trx)
  const result = await steps.write(locked)
  assertSuperAdminSurvives(before, await countSuperAdmins(trx))
  return result
}
```

- [ ] **Step 8: `roles.service.ts` 의 수정 · 삭제를 잠금 단계로 나눈다**

`packages/admin-server/src/roles/roles.service.ts`:

① import 의 `import { withSuperAdminSurvival } from '../accounts/super-admin.js'` 를 바꾼다:

```ts
import { withSuperAdminSurvival, type LockedWrite } from '../accounts/super-admin.js'
```

② 머리 주석의 `//  - 수정의 응답 item · 감사 after 는 같은 트랜잭션에서 읽는다(…)` 줄 **다음**에 두 줄을 더한다:

```ts
//  - 잔존으로 감싼 수정 · 삭제는 잠금 단계(역할 · 다른 기본 역할 잠금 · 판정 · revision) 뒤에 셈한다(2d-3 스펙 ① A · C3) —
//    역할 이동이 그 사이 역할 행을 바꿔도 ON 에서 1020 이 아니다.
```

③ `type RoleRow = { … }` 정의 **다음**에 더한다:

```ts
/** 역할 수정의 잠금 단계가 쓰기 단계에 넘기는 것 */
type RoleUpdateLock = { row: RoleRow; current: string[]; clearing: bigint[] }

type RoleUpdateResult = { before: RoleAuditView; clearedDefaults: bigint[] }
```

④ `create` 의 `const clearedDefaults = body.isDefault ? await clearOtherDefaults(trx, null) : []` 한 줄을 바꾼다(순서 셈 쿼리는 Task 2 가 바꾼다):

```ts
const clearedDefaults = body.isDefault ? await lockOtherDefaults(trx, null) : []
await clearDefaults(trx, clearedDefaults)
```

⑤ `update` 메서드를 통째로 바꾼다:

```ts
  async update(
    roleNo: bigint,
    body: AdminRoleUpdateBody,
    principal: AdminPrincipal,
  ): Promise<{
    item: AdminRoleView
    before: RoleAuditView
    after: RoleAuditView
    clearedDefaults: bigint[]
  }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const next =
      body.permissions === undefined ? undefined : this.config.catalog.normalize(body.permissions)
    const actor = actorOf(principal)
    return this.guardRoleName(() =>
      runWriteTransaction(this.db, async (trx) => {
        const steps: LockedWrite<RoleUpdateLock, RoleUpdateResult> = {
          // 🔴 잠금 읽기 · 판정만(2d-3 스펙 C2 · C3). 다른 기본 역할도 여기서 잠근다 — 남이 이 역할 잠금 없이 바꾸는 행이라 셈(읽기
          //    뷰) 뒤에 잠그면 스냅샷 격리 ON 에서 1020 이다.
          lock: async () => {
            const row = await lockRole(trx, roleNo)
            const current = this.permissionsOf(row)
            // 🔴 판정이 revision 보다 먼저다 — 권한 없는 사람에게 revision 상태를 드러내지 않는다(2d 스펙 B7).
            judgeAccountCommand(actor, { kind: 'role.update', current, next })
            if (body.revision !== row.revision) {
              throw new BusinessError(
                CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
                ACCOUNT_MESSAGES.roleRevisionMismatch,
              )
            }
            const clearing =
              body.isDefault === true && !row.isDefault ? await lockOtherDefaults(trx, roleNo) : []
            return { row, current, clearing }
          },
          write: async ({ row, current, clearing }) => {
            await clearDefaults(trx, clearing)
            await trx
              .updateTable('roles')
              .set((eb) => ({
                ...(body.roleName === undefined ? {} : { roleName: body.roleName }),
                ...(body.isDefault === undefined ? {} : { isDefault: body.isDefault }),
                ...(next === undefined ? {} : { permissions: JSON.stringify(next) }),
                revision: eb('revision', '+', 1),
              }))
              .where('roleNo', '=', roleNo)
              .execute()
            return {
              before: { roleName: row.roleName, isDefault: row.isDefault, permissions: current },
              clearedDefaults: clearing,
            }
          },
        }
        // 🔴 권한을 바꾸는 수정만 잔존을 줄일 수 있다 — 센티넬이 트랜잭션의 첫 문장이 되게 감싼다(§5-3).
        const { before, clearedDefaults } =
          next === undefined
            ? await steps.write(await steps.lock())
            : await withSuperAdminSurvival(trx, steps)
        // 🔴 같은 트랜잭션에서 읽는다 — 응답 · 감사 after 가 이 쓰기의 결과다(§14 R5-2)
        const item = this.view(await findRole(trx, roleNo))
        return {
          item,
          before,
          after: {
            roleName: item.roleName,
            isDefault: item.isDefault,
            permissions: item.permissions,
          },
          clearedDefaults,
        }
      }),
    )
  }
```

⑥ `remove` 메서드를 통째로 바꾼다:

```ts
  async remove(
    roleNo: bigint,
    body: AdminRoleRemoveBody,
    principal: AdminPrincipal,
  ): Promise<{ before: RoleAuditView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = actorOf(principal)
    // 🔴 쓰는 중 검사가 먼저라 잔존은 지금은 닿지 않는 방어선이다(hangang · 2d 스펙 B11). 쓰는 중 검사가 스냅숏 때문에 놓친
    //    배정은 FK restrict 가 받친다 — mapError 가 같은 409 ERR_COMMON_IN_USE 로 바꾼다(2a F15).
    const before = await runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(trx, {
        // 🔴 잠금 읽기 · 판정만(2d-3 스펙 C2 · C3)
        lock: async () => {
          const row = await lockRole(trx, roleNo)
          const current = this.permissionsOf(row)
          judgeAccountCommand(actor, { kind: 'role.delete', current })
          if (body.revision !== row.revision) {
            throw new BusinessError(
              CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
              ACCOUNT_MESSAGES.roleRevisionMismatch,
            )
          }
          return { row, current }
        },
        // 🔴 쓰는 중 검사는 비잠금이라 쓰기 단계다(셈 뒤). 역할 행을 X 로 쥐었으므로 그 역할을 새로 배정하는 쓰기
        //    (lockGrantRole · FK S 검사)는 커밋하지 못한다 — 셈이 연 뷰에서 못 본 배정이 없다(2d-3 스펙 §5-2).
        write: async ({ row, current }) => {
          const used = await trx
            .selectFrom('users')
            .select('userNo')
            .where('roleNo', '=', roleNo)
            .limit(1)
            .executeTakeFirst()
          if (used !== undefined) {
            throw new BusinessError(CommonErrorCodes.ERR_COMMON_IN_USE, ACCOUNT_MESSAGES.roleInUse)
          }
          await trx.deleteFrom('roles').where('roleNo', '=', roleNo).execute()
          return { roleName: row.roleName, isDefault: row.isDefault, permissions: current }
        },
      }),
    )
    return { before }
  }
```

⑦ 파일 끝의 `clearOtherDefaults` 함수(주석 포함)를 둘로 바꾼다:

```ts
/**
 * ⑫ D1 — 다른 기본 역할을 잠그고 번호를 돌려준다. 역할 수정에서는 잠금 단계다(2d-3 스펙 C4) — 그 역할은 남이 이 역할 잠금 없이
 * 바꾸는 행이다. 끈 역할 번호는 감사 meta clearedDefaults(§14 R5-3).
 */
async function lockOtherDefaults(
  trx: Transaction<AdminDatabase>,
  except: bigint | null,
): Promise<bigint[]> {
  let found = trx.selectFrom('roles').select('roleNo').where('isDefault', '=', true).forUpdate()
  if (except !== null) found = found.where('roleNo', '!=', except)
  return (await found.execute()).map((row) => row.roleNo)
}

/** ⑫ D1 — 그 역할들의 기본 표시를 끄고 revision 을 올린다(내용이 바뀌었다 — 그 역할을 열어 둔 편집자는 409 를 받는다) */
async function clearDefaults(trx: Transaction<AdminDatabase>, roleNos: bigint[]): Promise<void> {
  if (roleNos.length === 0) return
  await trx
    .updateTable('roles')
    .set((eb) => ({ isDefault: false, revision: eb('revision', '+', 1) }))
    .where('roleNo', 'in', roleNos)
    .execute()
}
```

- [ ] **Step 9: `users.service.ts` 의 수정 · 퇴사를 잠금 단계로 나눈다**

`packages/admin-server/src/users/users.service.ts`:

① import 두 줄을 바꾼다:

```ts
import { withSuperAdminSurvival, type LockedWrite } from '../accounts/super-admin.js'
```

```ts
import { lockGrantRole, lockTeam, lockUser, replaceTeam, type LockedUser } from './user-locks.js'
```

② 머리 주석의 `//  - 날짜 ↔ 효력 시각은 accounts/calendar.ts 하나(⑤ Z1).` 줄 **다음**에 더한다:

```ts
//  - 잔존으로 감싼 쓰기(역할을 바꾸는 수정 · 퇴사)는 잠금 단계(대상 · 줄 역할 · 팀 잠금 · 판정 · revision · 상태) 뒤에 셈한다
//    (2d-3 스펙 ① A · C3) — before · item 이 낡지 않고 ON 에서 1020 이 아니다.
```

③ `update` 의 `return runWriteTransaction(this.db, async (trx) => { … })` 전체(메서드 끝까지)를 바꾼다:

```ts
return runWriteTransaction(this.db, async (trx) => {
  const steps: LockedWrite<LockedUser, AdminUserView> = {
    // 🔴 잠금 읽기 · 판정만(2d-3 스펙 C2 · C3) — 대상 users ⋈ roles · 줄 역할 · 팀. 남이 이 사용자 잠금 없이 바꾸는 행(역할 —
    //    이름 · 기본 · 이동, 팀 — 이름 · 이동)이라 셈(읽기 뷰) 뒤에 잠그면 스냅샷 격리 ON 에서 1020 이다(2e-1 이월).
    //    잠금 순서는 users → roles → teams → (teamUserMap · 재직 이력) — create 와 같은 순서다. 이력을 팀보다 먼저 잠그면
    //    같은 팀에 계정을 만드는 create 와 교착한다(Task 8 리뷰).
    lock: async () => {
      const target = await lockUser(trx, userNo)
      const grant =
        body.roleNo === undefined
          ? undefined
          : this.permissionsOf(await lockGrantRole(trx, body.roleNo))
      // 🔴 판정이 revision 보다 먼저다 — 권한 없는 사람에게 revision 상태를 드러내지 않는다(B7)
      judgeAccountCommand(actor, {
        kind: 'user.update',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
        grant,
      })
      if (body.revision !== target.revision) throw userRevisionConflict()
      if (body.teamNo != null) await lockTeam(trx, body.teamNo)
      return target
    },
    // 셈이 연 읽기 뷰 — 잠근 행은 모두 최신이다(2d-3 스펙 §14 R1-1 · R1-5)
    write: async () => {
      const before = await readUser(trx, userNo, timeZone)
      if (body.joinDate !== undefined) await correctJoinDate(trx, userNo, body.joinDate)
      if (body.teamNo !== undefined) await replaceTeam(trx, userNo, body.teamNo)
      await trx
        .updateTable('users')
        .set((eb) => ({
          ...(body.userName === undefined ? {} : { userName: body.userName }),
          ...(body.roleNo === undefined ? {} : { roleNo: body.roleNo }),
          ...(joinAt === undefined ? {} : { joinAt }),
          revision: eb('revision', '+', 1),
          updateAt: sql<Date>`current_timestamp`,
        }))
        .where('userNo', '=', userNo)
        .execute()
      return before
    },
  }
  // 🔴 역할을 바꾸는 수정만 잔존을 줄일 수 있다 — 센티넬이 트랜잭션의 첫 문장이 되게 감싼다(§5-3)
  const before =
    body.roleNo === undefined
      ? await steps.write(await steps.lock())
      : await withSuperAdminSurvival(trx, steps)
  // 🔴 같은 트랜잭션에서 읽는다 — 응답 · 감사 after 가 이 쓰기의 결과다(§14 R5-2)
  return { item: await readUser(trx, userNo, timeZone), before }
})
```

④ `resign` 의 `return runWriteTransaction(this.db, (trx) => withSuperAdminSurvival(trx, async () => { … }))` 전체(메서드 끝까지)를 바꾼다:

```ts
return runWriteTransaction(this.db, (trx) =>
  withSuperAdminSurvival(trx, {
    // 🔴 잠금 읽기 · 판정 · 상태 검사만(2d-3 스펙 C2 · C3)
    lock: async () => {
      const target = await lockUser(trx, userNo)
      // 🔴 판정이 상태보다 먼저(B7)
      judgeAccountCommand(actor, {
        kind: 'user.resign',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
      })
      if (target.resignAt !== null) throw userConflict(ACCOUNT_MESSAGES.alreadyResigned)
      return target
    },
    // 셈이 연 읽기 뷰 — 대상 잠금을 기다린 사이의 커밋(재입사 · 로그인 실패)이 before 에 보인다(2d-3 스펙 §14 R1-1)
    write: async (target) => {
      const before = await readUser(trx, userNo, timeZone)
      const active = await lockActivePeriods(trx, userNo)
      if (active.length > 1) throw userConflict(ACCOUNT_MESSAGES.periodCorrupted)
      const healed = active[0] === undefined
      const period =
        active[0] ??
        (await insertPeriod(trx, {
          userNo,
          joinDate: dateIn(target.joinAt, timeZone),
          reason: null,
          createdBy: null,
        }))
      if (body.resignDate < period.joinDate) {
        throw fieldError('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin)
      }
      await trx
        .updateTable('userEmploymentPeriods')
        .set({ resignAt: toDateColumn(body.resignDate), reason })
        .where('periodNo', '=', period.periodNo)
        .execute()
      await trx
        .updateTable('users')
        .set((eb) => ({
          resignAt: effective,
          revision: eb('revision', '+', 1),
          updateAt: sql<Date>`current_timestamp`,
        }))
        .where('userNo', '=', userNo)
        .execute()
      // 🔴 효력 시각이 이미 지났으면 같은 트랜잭션에서 끊는다 — 커밋되면 그 사용자의 다음 요청은 401(§14 R6-1).
      // 🔴 세션 폐기는 쓰기 단계다(2d-3 스펙 C5) — 잠금 단계로 올리면 대상의 refresh 회전과의 교착에서 퇴사가 희생자가
      //    된다. ON 에서 대상 로그아웃이 셈과 폐기 사이에 커밋되면 1020 → 409 다시 시도(2d-3 스펙 §14 R1-4).
      const revokedCount =
        effective.getTime() <= now.getTime()
          ? await this.sessions.revokeAllOfUser(userNo, 'terminated', now, { trx })
          : 0
      return {
        item: await readUser(trx, userNo, timeZone),
        before,
        meta: { reason, revokedCount, ...(healed ? { healedPeriod: true } : {}), timeZone },
      }
    },
  }),
)
```

- [ ] **Step 10: `user-view.ts` 주석을 고친다**

`packages/admin-server/src/users/user-view.ts` 의 12~20행(`// 🔴 이 투영은 보기 읽기다 …` 부터 `//    구조적 해결(… )은 후속이다(HANDOFF).` 까지)을 바꾼다:

```ts
// 🔴 이 투영은 보기 읽기다(응답 item · 감사 before/after). 판정에 쓰지 않는다 — 판정은 잠금 읽기(user-locks.ts ·
//    employment.ts)로 한다(§14 R5-6).
//    잔존으로 감싼 쓰기(역할을 바꾸는 수정 · 퇴사)는 대상 · 줄 역할 · 팀을 잠근 **뒤에** 셈으로 읽기 뷰를 연다(2d-3 스펙
//    ① A) — 쓰기 앞의 보기 읽기(before)도 잠근 행은 최신이다. 이 트랜잭션이 잠그지도 쓰지도 않은 행(다른 팀의 이름 등)은
//    뷰가 열린 시점의 값이다.
```

- [ ] **Step 11: 돌려 GREEN 을 본다**

```bash
pnpm --filter @ssworks/admin-server typecheck
pnpm --filter @ssworks/admin-server test:db super-admin
pnpm --filter @ssworks/admin-server test:db users.employment
pnpm --filter @ssworks/admin-server test:db users.snapshot
pnpm --filter @ssworks/admin-server test:db roles.snapshot
pnpm --filter @ssworks/admin-server test:db users.write
pnpm --filter @ssworks/admin-server test:db roles.service
pnpm lint
```

Expected: 타입 오류 없음, 여섯 DB 파일 모두 통과, lint 통과.

- [ ] **Step 12: 🔴 순서를 되돌려 RED 를 한 번 더 본다**

`super-admin.ts` 의 `withSuperAdminSurvival` 에서 `const before = await countSuperAdmins(trx)` 줄을 `const locked = await steps.lock()` **앞**으로 옮기고 돌린다:

```bash
pnpm --filter @ssworks/admin-server test:db super-admin
pnpm --filter @ssworks/admin-server test:db users.employment
pnpm --filter @ssworks/admin-server test:db users.snapshot
pnpm --filter @ssworks/admin-server test:db roles.snapshot
```

Expected: `super-admin` 잠금 단계 테스트가 `expected 0 to be 1`, `users.employment` r1 이 `'2025-12-31'`, `users.snapshot` ON 둘 · OFF 역할 변경, `roles.snapshot` ON 둘이 실패. 보고서에 붙이고 되돌린 뒤 같은 명령으로 GREEN 을 확인한다.

이어서 `users.service.ts` `update` 의 `lock` 안 `if (body.teamNo != null) await lockTeam(trx, body.teamNo)` 줄을 `lock` 의 첫 줄(`lockUser` 앞)로 옮겨 `pnpm --filter @ssworks/admin-server test:db users.write` — Review Focus 1 이 400 `teamNo` 로 실패해야 한다(옮긴 순서는 잠금 순서도 어긴다 — 보고서에 RED 만 적고 되돌린다).

- [ ] **Step 13: 전체 확인 · 커밋**

```bash
pnpm --filter @ssworks/admin-server test
pnpm --filter @ssworks/admin-server test:db
pnpm exec prettier --write packages/admin-server/src/accounts/super-admin.ts packages/admin-server/src/accounts/super-admin.db.test.ts packages/admin-server/src/roles/roles.service.ts packages/admin-server/src/roles/roles.snapshot.db.test.ts packages/admin-server/src/roles/roles.service.db.test.ts packages/admin-server/src/users/users.service.ts packages/admin-server/src/users/user-view.ts packages/admin-server/src/users/users.employment.db.test.ts packages/admin-server/src/users/users.snapshot.db.test.ts packages/admin-server/src/users/users.write.db.test.ts
pnpm lint
git add packages/admin-server/src/accounts/super-admin.ts packages/admin-server/src/accounts/super-admin.db.test.ts packages/admin-server/src/roles/roles.service.ts packages/admin-server/src/roles/roles.snapshot.db.test.ts packages/admin-server/src/roles/roles.service.db.test.ts packages/admin-server/src/users/users.service.ts packages/admin-server/src/users/user-view.ts packages/admin-server/src/users/users.employment.db.test.ts packages/admin-server/src/users/users.snapshot.db.test.ts packages/admin-server/src/users/users.write.db.test.ts
git commit -m "feat(admin-server): 잔존 잠금 단계 — withSuperAdminSurvival(trx, { lock, write }) · 셈을 대상 잠금 뒤로" -m "역할 권한 수정 · 삭제 · 사용자 역할 변경 · 퇴사가 대상 · 줄 역할 · 팀 · 다른 기본 역할을 잠근 뒤 셈한다. OFF 의 낡은 before · item 과 ON 의 1020(로그인 실패 · 팀 이름 바꾸기 · 역할 이동 경합)이 사라진다(2d-3 스펙 ① A · C3)." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: 전체 통과(이 Task 전의 315 에 새 DB 테스트가 더해진 수), lint 통과.

---

### Task 2: 역할 인덱스 둘 — 장 0001 정정 · 끝 행 순서 셈(이월 2)

**Files:**

- Modify: `packages/admin-server/src/database/migrations/0001_roles.ts`
- Modify: `packages/admin-server/src/database/migrations/ddl.test.ts`
- Modify: `packages/admin-server/src/database/migrations/migrations.db.test.ts`
- Modify: `packages/admin-server/src/roles/roles.service.ts`(`create` 의 순서 셈 · 머리 주석)
- Create: `packages/admin-server/src/roles/roles.index.db.test.ts`

**Interfaces:**

- Consumes: Task 1 의 `lockOtherDefaults` · `clearDefaults`(`roles.service.ts` 안), `lockWaitsIn` · `settle` · `sleep` · `Settled`(`test-support/concurrency.ts`).
- Produces: 장 0001 이 `roles` 에 `idx_roles_display_order (display_order)` · `idx_roles_is_default (is_default)` 를 만든다. `create` 의 순서 셈은 `SELECT displayOrder … ORDER BY displayOrder DESC LIMIT 1 FOR UPDATE`.

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/database/migrations/ddl.test.ts` — `describe('0002_users', …)` **앞**에 더한다:

```ts
describe('0001_roles', () => {
  it('🔴 순서 · 기본 표시 인덱스 둘 — 역할 쓰기가 전 행을 잠그지 않게(2d-3 스펙 ③ I1)', async () => {
    const statements = await capture((db) => roles.up(db))
    expect(statements).toContain(
      'create index `idx_roles_display_order` on `roles` (`display_order`)',
    )
    expect(statements).toContain('create index `idx_roles_is_default` on `roles` (`is_default`)')
  })
})
```

`packages/admin-server/src/database/migrations/migrations.db.test.ts` 의 `it('인덱스', …)` 기대 목록 첫머리(`'idx_team_closure_descendant',` 앞)에 두 줄을 더한다:

```ts
      'idx_roles_display_order',
      'idx_roles_is_default',
```

`packages/admin-server/src/roles/roles.index.db.test.ts`:

```ts
import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { accountsConfig, testPrincipal } from '../test-support/accounts.js'
import { seedRole } from '../test-support/auth.js'
import { lockWaitsIn, settle, sleep, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { AdminRolesService } from './roles.service.js'

// 🔴 역할 인덱스 둘(idx_roles_display_order · idx_roles_is_default — 장 0001, 2d-3 스펙 ③ I1)이 역할 쓰기의 잠금을 그
//    행으로 좁히는지 직접 잰다. 원시 연결이 상관없는 역할 행 하나(held)만 쥔 채 쓰기가 잠금 대기에 들어가면 전 행을 훑어
//    잠근 것이다(인덱스가 없을 때 — 2d-3 스펙 §14 R1-7). 2e-1 teams.guard.db.test.ts 의 "잠금 대기 관찰" 모양.
//    🔴 사용자는 만들지 않는다. held 는 순서 맨 앞 · 기본 아님이고 뒤 테스트들은 held 를 건드리지 않는다.

let t: TestDatabase
let service: AdminRolesService
let held: bigint
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminRolesService(t.db, accountsConfig(), undefined)
  held = (await service.create({ roleName: 'idx-held', isDefault: false, permissions: [] }, root))
    .roleNo
})

afterAll(async () => {
  await t?.drop()
})

/** 원시 연결이 held 행만 쥔 채 write 를 시작한다 — write 가 잠금 대기에 들어갔는지(waited)와 풀린 뒤의 결과 */
async function underHeldRole(
  write: () => Promise<unknown>,
): Promise<{ waited: boolean; result: Settled<unknown> }> {
  const open = () => createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
  const holder = await open()
  const observer = await open()
  try {
    await holder.beginTransaction()
    await holder.query('select role_no from roles where role_no = ? for update', [held])
    let finished = false
    const pending = settle(write()).then((result) => {
      finished = true
      return result
    })
    let waited = false
    for (let i = 0; i < 100 && !finished && !waited; i += 1) {
      waited = (await lockWaitsIn(observer, t.name)) > 0
      if (!waited) await sleep(25)
    }
    await holder.commit()
    return { waited, result: await pending }
  } finally {
    await holder.rollback().catch(() => undefined)
    await holder.end()
    await observer.end()
  }
}

async function orderOf(roleNo: bigint): Promise<number> {
  const row = await t.db
    .selectFrom('roles')
    .select('displayOrder')
    .where('roleNo', '=', roleNo)
    .executeTakeFirstOrThrow()
  return row.displayOrder
}

describe('🔴 역할 쓰기는 상관없는 역할 행을 기다리지 않는다(③ I1)', () => {
  it('만들기 — 순서 셈이 인덱스 끝 한 행만 잠근다', async () => {
    const { waited, result } = await underHeldRole(() =>
      service.create({ roleName: 'idx-create', isDefault: false, permissions: [] }, root),
    )
    expect(waited).toBe(false)
    if (!result.ok) throw result.error
  })

  it('기본 켜기 수정 — 다른 기본 역할 찾기가 기본 표시 행만 잠근다', async () => {
    await service.create({ roleName: 'idx-default-old', isDefault: true, permissions: [] }, root)
    const next = await service.create(
      { roleName: 'idx-default-new', isDefault: false, permissions: [] },
      root,
    )
    const { waited, result } = await underHeldRole(() =>
      service.update(next.roleNo, { revision: 0, isDefault: true }, root),
    )
    expect(waited).toBe(false)
    if (!result.ok) throw result.error
    const defaults = await t.db
      .selectFrom('roles')
      .select('roleNo')
      .where('isDefault', '=', true)
      .execute()
    expect(defaults).toEqual([{ roleNo: next.roleNo }])
  })

  it('이동 — 구간 UPDATE 가 구간 행만 잠근다', async () => {
    const a = await service.create(
      { roleName: 'idx-move-a', isDefault: false, permissions: [] },
      root,
    )
    const b = await service.create(
      { roleName: 'idx-move-b', isDefault: false, permissions: [] },
      root,
    )
    const slot = await orderOf(a.roleNo)
    const { waited, result } = await underHeldRole(() => service.move(b.roleNo, slot))
    expect(waited).toBe(false)
    if (!result.ok) throw result.error
    expect(await orderOf(b.roleNo)).toBe(slot)
    expect(await orderOf(a.roleNo)).toBe(slot + 1)
    expect(await orderOf(held)).toBe(1)
  })
})

describe('순서 시드가 0 여럿일 때(Review Focus 4)', () => {
  it('만들기는 끝 행 + 1 = 1, 그다음은 2 — 시드의 0 은 그대로', async () => {
    const u = await createTestDatabase()
    try {
      await seedRole(u.db, { roleName: 'zero-a', permissions: [] })
      await seedRole(u.db, { roleName: 'zero-b', permissions: [] })
      const own = new AdminRolesService(u.db, accountsConfig(), undefined)
      await own.create({ roleName: 'zero-new-1', isDefault: false, permissions: [] }, root)
      await own.create({ roleName: 'zero-new-2', isDefault: false, permissions: [] }, root)
      const rows = await u.db
        .selectFrom('roles')
        .select(['roleName', 'displayOrder'])
        .orderBy('displayOrder')
        .orderBy('roleNo')
        .execute()
      expect(rows).toEqual([
        { roleName: 'zero-a', displayOrder: 0 },
        { roleName: 'zero-b', displayOrder: 0 },
        { roleName: 'zero-new-1', displayOrder: 1 },
        { roleName: 'zero-new-2', displayOrder: 2 },
      ])
    } finally {
      await u.drop()
    }
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

```bash
pnpm --filter @ssworks/admin-server test ddl
pnpm --filter @ssworks/admin-server test:db migrations
pnpm --filter @ssworks/admin-server test:db roles.index
```

Expected: `ddl` 의 0001 테스트가 `create index` 문장이 없어 실패, `migrations` 의 '인덱스' 가 `idx_roles_display_order` 를 못 찾아 실패, `roles.index` 의 세 테스트가 `expected true to be false`(전 행 잠금 — 대기). "순서 시드가 0 여럿" 은 통과할 수 있다(지금 `MAX` 도 같은 값 — 회귀 고정).

- [ ] **Step 3: 장 0001 에 인덱스를 더한다**

`packages/admin-server/src/database/migrations/0001_roles.ts`:

① 머리 주석에서 "인자 타입은 …(스펙 R2)" 로 시작하는 줄 **앞**에 더한다:

```ts
//  - 순서 · 기본 표시 인덱스 둘을 더했다(2d-3 스펙 ③ I1) — 미발행 장을 고쳤다(2d-2 의 0002 정정과 같은 길). 인덱스가 없는
//    DB 도 2d-2 와 같이 돈다(전 행 잠금일 뿐 — 빠지면 500 인 가드 행과 다르다).
```

② `up` 의 `.execute()`(createTable 끝) **다음**, 함수 닫는 `}` 앞에 더한다:

```ts
// 🔴 만들기의 순서 셈(끝 행 FOR UPDATE) · 이동의 구간 UPDATE · 다른 기본 역할 찾기가 이 인덱스로 그 행만 잠근다. 없으면 전 행을
//    훑어 잠가 사용자 역할 변경 · 다른 역할 쓰기와 교착한다(2d-3 스펙 §14 R1-7 ~ R1-9 — 역할 몇 개뿐인 표에서도 인덱스를 탄다).
await db.schema.createIndex('idxRolesDisplayOrder').on('roles').columns(['displayOrder']).execute()
await db.schema.createIndex('idxRolesIsDefault').on('roles').columns(['isDefault']).execute()
```

- [ ] **Step 4: 만들기의 순서 셈을 끝 행 잠금 읽기로 바꾼다**

`packages/admin-server/src/roles/roles.service.ts`:

① 머리 주석의 두 줄

```ts
//  - 새 역할의 displayOrder 는 MAX … FOR UPDATE 로 셈한다(§14 R5-5 · R7-4 — 동시 만들기가 같은 값을 받으면 이동으로도 못
//    가른다).
```

을 바꾼다:

```ts
//  - 새 역할의 displayOrder 는 끝 행 + 1 — 인덱스 끝 한 행을 FOR UPDATE 로 읽는다(§14 R5-5 · R7-4 — 동시 만들기가 같은 값을
//    받으면 이동으로도 못 가른다. 2d-3 스펙 C6 — 다른 역할 행은 잠그지 않는다).
```

② `create` 안의 순서 셈

```ts
// 🔴 FOR UPDATE — 동시 만들기 둘이 같은 MAX 를 읽으면 순서 값이 겹친다(§14 R5-5 · R7-4)
const top = await trx
  .selectFrom('roles')
  .select((eb) => eb.fn.max('displayOrder').as('maxOrder'))
  .forUpdate()
  .executeTakeFirst()
```

을 바꾼다:

```ts
// 🔴 FOR UPDATE — 동시 만들기 둘이 같은 끝 값을 읽으면 순서 값이 겹친다(§14 R5-5 · R7-4). 🔴 idx_roles_display_order 의
//    끝 한 행만 잠근다 — MAX(…) 는 옵티마이저가 "optimized away" 로 읽어 잠금이 그 동작에 기댄다(2d-3 스펙 C6 · §14 R1-8)
const top = await trx
  .selectFrom('roles')
  .select('displayOrder')
  .orderBy('displayOrder', 'desc')
  .limit(1)
  .forUpdate()
  .executeTakeFirst()
```

③ 같은 메서드의 `displayOrder: Number(top?.maxOrder ?? 0) + 1,` 를 `displayOrder: (top?.displayOrder ?? 0) + 1,` 로 바꾼다.

- [ ] **Step 5: 돌려 GREEN 을 본다**

```bash
pnpm --filter @ssworks/admin-server typecheck
pnpm --filter @ssworks/admin-server test ddl
pnpm --filter @ssworks/admin-server test:db migrations
pnpm --filter @ssworks/admin-server test:db roles.index
pnpm --filter @ssworks/admin-server test:db roles.order
pnpm --filter @ssworks/admin-server test:db roles.service
pnpm lint
```

Expected: 모두 통과 — `roles.order` 의 "동시 만들기" 가 그대로 초록이다(끝 행 잠금이 여전히 줄을 세운다).

- [ ] **Step 6: 🔴 RED 를 한 번 더 본다**

① 장 0001 의 `createIndex` 두 줄을 주석으로 막고 `pnpm --filter @ssworks/admin-server test:db roles.index` — 세 테스트가 `expected true to be false`. 되돌린다.

② `create` 의 순서 셈에서 `.forUpdate()` 를 빼고 `pnpm --filter @ssworks/admin-server test:db roles.order` — "동시 만들기" 가 같은 순서 값으로 실패. 되돌린다.

두 실험의 명령 · 출력을 보고서에 붙인다.

- [ ] **Step 7: 전체 확인 · 커밋**

```bash
pnpm --filter @ssworks/admin-server test
pnpm --filter @ssworks/admin-server test:db
pnpm exec prettier --write packages/admin-server/src/database/migrations/0001_roles.ts packages/admin-server/src/database/migrations/ddl.test.ts packages/admin-server/src/database/migrations/migrations.db.test.ts packages/admin-server/src/roles/roles.service.ts packages/admin-server/src/roles/roles.index.db.test.ts
pnpm lint
git add packages/admin-server/src/database/migrations/0001_roles.ts packages/admin-server/src/database/migrations/ddl.test.ts packages/admin-server/src/database/migrations/migrations.db.test.ts packages/admin-server/src/roles/roles.service.ts packages/admin-server/src/roles/roles.index.db.test.ts
git commit -m "feat(admin-server): 역할 인덱스 둘(장 0001 정정) — 만들기 · 이동 · 기본 켜기가 그 행만 잠근다" -m "idx_roles_display_order · idx_roles_is_default. 만들기의 순서 셈은 인덱스 끝 한 행 FOR UPDATE. 역할 만들기 ∥ 사용자 역할 변경의 교착이 사라진다(2d-3 스펙 ③ I1 · C6 · §14 R1-7 ~ R1-9)." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 본인 재입사 403(이월 9)

**Files:**

- Modify: `packages/admin-server/src/accounts/account-command.ts`
- Modify: `packages/admin-server/src/accounts/account-command.test.ts`
- Modify: `packages/admin-server/src/users/users.service.ts`(`rehire` 문서 주석)
- Modify: `packages/admin-server/src/users/users.employment.db.test.ts`(rehire 의 본인 단언)
- Modify: `packages/admin-server/src/users/users.http.db.test.ts`(본인 403 테스트)

**Interfaces:**

- Consumes: `judgeAccountCommand` · `AccountCommand`(그대로 export).
- Produces: `AccountCommand` 에서 `{ kind: 'user.rehire'; … }` 변형이 사라지고 `kind: 'user.resign' | 'user.resignDate' | 'user.passwordReset' | 'user.unlock' | 'user.rehire'` 한 변형이 된다(모양 `{ targetUserNo: bigint; current: readonly string[] }` 은 같다 — 부르는 쪽 코드는 그대로 컴파일된다).

- [ ] **Step 1: 테스트를 바꾼다**

`packages/admin-server/src/accounts/account-command.test.ts`:

① `it("🔴 자기 계정의 퇴사 · 퇴사일 · 초기화 · 잠금 해제는 403 selfAccount — 덮기보다 먼저('*' 행위자도)", …)` 의 제목과 목록을 바꾼다:

```ts
  it("🔴 자기 계정의 퇴사 · 퇴사일 · 재입사 · 초기화 · 잠금 해제는 403 selfAccount — 덮기보다 먼저('*' 행위자도)", () => {
    for (const kind of [
      'user.resign',
      'user.resignDate',
      'user.rehire',
      'user.passwordReset',
      'user.unlock',
    ] as const) {
```

(본문은 그대로.)

② 바로 다음의 `it('user.rehire — 자기 계정 허용(퇴사 예정인 본인), 넓은 계정은 403', …)` 테스트를 통째로 바꾼다:

```ts
it('🔴 user.rehire — 퇴사 예정인 본인도 403 selfAccount(자기 퇴사일 정정과 효과가 같다 — 2d-3 스펙 ④ S1)', () => {
  const error = rejection(() =>
    judgeAccountCommand(manager, {
      kind: 'user.rehire',
      targetUserNo: manager.userNo,
      current: [],
    }),
  )
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  expect(error.message).toBe(ACCOUNT_MESSAGES.selfAccount)
  expect(error.details).toBeUndefined()
})
```

`packages/admin-server/src/users/users.employment.db.test.ts` — `it('재직 중 409 · 활성 구간이 남아 있으면 409 · 본인도 된다(B16) · 넓은 계정 403', …)` 의 제목을 `'재직 중 409 · 활성 구간이 남아 있으면 409 · 🔴 본인은 403(퇴사 예정 · 재직 중 모두 — 2d-3 스펙 ④ S1) · 넓은 계정 403'` 으로 바꾸고, 본문의

```ts
const me = await employee('h-self')
await service.resign(me.userNo, { resignDate: day(10) }, root)
await expect(
  service.rehire(
    me.userNo,
    { joinDate: day(11) },
    testPrincipal(me.userNo, ['org.users:read', 'org.users:write']),
  ),
).resolves.toBeDefined()
```

를 바꾼다:

```ts
const me = await employee('h-self')
const self = testPrincipal(me.userNo, ['org.users:read', 'org.users:write'])
// 재직 중인 본인 — 판정이 상태(409 notResignedForRehire)보다 먼저다(B7)
const active = await rejection(() => service.rehire(me.userNo, { joinDate: day(11) }, self))
expect(active.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
expect(active.message).toBe(ACCOUNT_MESSAGES.selfAccount)
// 퇴사 예정인 본인 — 자기 재입사로 퇴사를 거두지 못한다
await service.resign(me.userNo, { resignDate: day(10) }, root)
const pending = await rejection(() => service.rehire(me.userNo, { joinDate: day(11) }, self))
expect(pending.message).toBe(ACCOUNT_MESSAGES.selfAccount)
expect((await userRow(t.db, me.userNo)).revision).toBe(1)
```

`packages/admin-server/src/users/users.http.db.test.ts` — `it('본인 퇴사 403 selfAccount · 넓은 계정 403 details.outside', …)` 의 제목을 `'본인 퇴사 · 재입사 403 selfAccount(details 없음) · 넓은 계정 403 details.outside'` 로 바꾸고, 첫 `expectError(…)` 다음에 더한다:

```ts
const selfRehire = expectError(
  await sendJson(agent.post(`/admin/users/${manager.userNo}/rehire`), { joinDate: day(1) }),
  403,
  CommonErrorCodes.ERR_COMMON_FORBIDDEN,
  ACCOUNT_MESSAGES.selfAccount,
)
expect(selfRehire.details).toBeUndefined()
```

- [ ] **Step 2: 돌려 RED 를 본다**

```bash
pnpm --filter @ssworks/admin-server test account-command
pnpm --filter @ssworks/admin-server test:db users.employment
pnpm --filter @ssworks/admin-server test:db users.http
```

Expected: `account-command` 두 테스트가 `user.rehire` 본인에서 던지지 않아 실패, `users.employment` 가 재직 중 본인 재입사에서 409 `notResignedForRehire` 를 받아 실패, `users.http` 가 409 를 받아 실패.

- [ ] **Step 3: 판정을 고친다**

`packages/admin-server/src/accounts/account-command.ts`:

① 머리 주석의 `//  - 자기 계정은 되돌릴 수 없는 넷만 막는다(③ SF1). …` 두 줄을 바꾼다:

```ts
//  - 자기 계정은 되돌릴 수 없는 넷(퇴사 · 퇴사일 · 초기화 · 잠금 해제)과 재입사를 막는다(③ SF1 · 2d-3 스펙 ④ S1 — 퇴사
//    예정인 본인의 자기 재입사는 자기 퇴사일 정정과 효과가 같다). 자기 역할의 권한 수정은 허용한다(3b onSelfRoleSaved) —
//    마지막 관리자는 잔존 검사(super-admin.ts)가 지킨다.
```

② `AccountCommand` 의 두 변형

```ts
  | { kind: 'user.rehire'; targetUserNo: bigint; current: readonly string[] }
  | {
      kind: 'user.resign' | 'user.resignDate' | 'user.passwordReset' | 'user.unlock'
      targetUserNo: bigint
      current: readonly string[]
    }
```

을 하나로 바꾼다:

```ts
  | {
      kind: 'user.resign' | 'user.resignDate' | 'user.rehire' | 'user.passwordReset' | 'user.unlock'
      targetUserNo: bigint
      current: readonly string[]
    }
```

③ `switch` 의

```ts
    case 'user.rehire':
      demand(command.current, ACCOUNT_MESSAGES.higherAccount)
      return
    case 'user.resign':
    case 'user.resignDate':
    case 'user.passwordReset':
    case 'user.unlock':
      // 🔴 되돌릴 수 없는 넷 — 자기 퇴사는 그 즉시 로그아웃되고, 자기 초기화는 임시 비밀번호를 보기 전에 세션이 끊긴다(hangang 화면 문구).
```

를 바꾼다:

```ts
    case 'user.resign':
    case 'user.resignDate':
    case 'user.rehire':
    case 'user.passwordReset':
    case 'user.unlock':
      // 🔴 되돌릴 수 없는 넷 — 자기 퇴사는 그 즉시 로그아웃되고, 자기 초기화는 임시 비밀번호를 보기 전에 세션이 끊긴다(hangang 화면 문구).
      //    재입사도 — 퇴사 예정인 본인이 자기 퇴사를 거두는 길이다(2d-3 스펙 ④ S1).
```

`packages/admin-server/src/users/users.service.ts` — `rehire` 의 문서 주석 `/** 재입사 — 잔존 잠금 없음(셈을 늘리기만 한다). 본인도 된다(B16 — 퇴사 예정인 본인) */` 를 바꾼다:

```ts
/** 재입사 — 잔존 잠금 없음(셈을 늘리기만 한다). 본인은 403(2d-3 스펙 ④ S1 — 2d B16 정정) */
```

- [ ] **Step 4: 돌려 GREEN · 커밋**

```bash
pnpm --filter @ssworks/admin-server typecheck
pnpm --filter @ssworks/admin-server test account-command
pnpm --filter @ssworks/admin-server test:db users.employment
pnpm --filter @ssworks/admin-server test:db users.http
pnpm exec prettier --write packages/admin-server/src/accounts/account-command.ts packages/admin-server/src/accounts/account-command.test.ts packages/admin-server/src/users/users.service.ts packages/admin-server/src/users/users.employment.db.test.ts packages/admin-server/src/users/users.http.db.test.ts
pnpm lint
git add packages/admin-server/src/accounts/account-command.ts packages/admin-server/src/accounts/account-command.test.ts packages/admin-server/src/users/users.service.ts packages/admin-server/src/users/users.employment.db.test.ts packages/admin-server/src/users/users.http.db.test.ts
git commit -m "feat(admin-server): 본인 재입사 403 selfAccount — 퇴사 예정인 본인이 자기 퇴사를 거두지 못한다" -m "2d-3 스펙 ④ S1 · 2d B16 정정. 판정이 상태 검사보다 먼저라 재직 중인 본인도 403." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `timeZone` 정규 이름 · 세션 폐기 `liveOnly`(이월 5 · 7)

**Files:**

- Modify: `packages/admin-server/src/accounts/calendar.ts`(`resolveTimeZone`)
- Modify: `packages/admin-server/src/accounts/calendar.test.ts`
- Modify: `packages/admin-server/src/accounts/options.test.ts`
- Modify: `packages/admin-server/src/users/users.service.ts`(`resign` · `resetPassword` 의 `revokeAllOfUser`)
- Modify: `packages/admin-server/src/users/users.employment.db.test.ts`
- Modify: `packages/admin-server/src/users/users.password.db.test.ts`

**Interfaces:**

- Consumes: `AdminSessionStore.revokeAllOfUser(userNo, reason, now, { trx, liveOnly })` · `findByNo(sessionNo)` · `revoke(sessionNo, reason, now)`(그대로).
- Produces: `resolveTimeZone(value: unknown): string` 이 정규 이름을 돌려준다(시그니처 그대로).

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/accounts/calendar.test.ts` — `describe('resolveTimeZone', …)` 의 첫 `it` 을 통째로 바꾼다:

```ts
it('없으면 Asia/Seoul, 정규 이름은 그대로', () => {
  expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE)
  expect(DEFAULT_TIME_ZONE).toBe('Asia/Seoul')
  for (const zone of ['UTC', 'Asia/Seoul', 'America/New_York', 'Etc/GMT+9']) {
    expect(resolveTimeZone(zone)).toBe(zone)
  }
})

it('🔴 대소문자 · 옛 이름은 정규 이름으로 바꿔 돌려준다(2d-3 스펙 ⑤ N1 — 감사 meta 가 한 표기)', () => {
  expect(resolveTimeZone('asia/seoul')).toBe('Asia/Seoul')
  expect(resolveTimeZone('US/Eastern')).toBe('America/New_York')
  expect(resolveTimeZone('Etc/UTC')).toBe('UTC')
  // 🔴 링크 이름의 정규 이름은 ICU 판마다 다를 수 있다(ICU 78.3 은 'America/Buenos_Aires') — Intl 이 내는 값을 그대로 쓴다
  const linked = 'America/Argentina/Buenos_Aires'
  expect(resolveTimeZone(linked)).toBe(
    new Intl.DateTimeFormat('en-US', { timeZone: linked }).resolvedOptions().timeZone,
  )
})
```

`packages/admin-server/src/accounts/options.test.ts` — `it('🔴 timeZone 이 IANA 이름이 아니면 멈춘다(B15) — 카탈로그 검사는 그대로', …)` **앞**에 더한다(그 파일의 `catalog` 변수와 `resolveUsersConfig` import 를 그대로 쓴다):

```ts
it('timeZone 은 정규 이름으로 바꿔 둔다(2d-3 스펙 ⑤ N1)', () => {
  expect(
    resolveUsersConfig({ permissionCatalog: catalog, timeZone: 'asia/seoul' }, 'AdminUsersModule')
      .timeZone,
  ).toBe('Asia/Seoul')
})
```

`packages/admin-server/src/users/users.employment.db.test.ts`:

① `issue` 정의 **다음**에 도우미 둘을 더한다(`AdminSessionStore` · `seedSession` 은 이미 import 돼 있다):

```ts
/** 만료된 미폐기 세션 — 살아 있는 세션을 만들고 만료 시각을 1분 전으로 옮긴다 */
async function expiredSession(userNo: bigint): Promise<bigint> {
  const sessionNo = await seedSession(t.db, userNo)
  await t.db
    .updateTable('sessions')
    .set({ expireAt: new Date(Date.now() - 60_000) })
    .where('sessionNo', '=', sessionNo)
    .execute()
  return sessionNo
}

const sessionState = (sessionNo: bigint) => new AdminSessionStore(t.db).findByNo(sessionNo)
```

② `describe('resign', …)` 안, `'미래 퇴사일 → 퇴사 예정, 세션 유지'` 테스트 **다음**에 더한다:

```ts
it('🔴 즉시 퇴사는 살아 있는 세션만 끊고 센다 — 만료된 미폐기 행 · 이미 폐기된 행은 그대로(⑥ L1 · Review Focus 5)', async () => {
  const user = await employee('r-live-only')
  const live = await seedSession(t.db, user.userNo)
  const expired = await expiredSession(user.userNo)
  const rotated = await seedSession(t.db, user.userNo)
  await new AdminSessionStore(t.db).revoke(rotated, 'rotated', new Date())
  const result = await service.resign(user.userNo, { resignDate: day(-1) }, root)
  expect(result.meta).toMatchObject({ revokedCount: 1 })
  expect(await sessionState(live)).toMatchObject({ isRevoked: true, revokedReason: 'terminated' })
  expect(await sessionState(expired)).toMatchObject({ isRevoked: false, revokedReason: null })
  expect(await sessionState(rotated)).toMatchObject({ isRevoked: true, revokedReason: 'rotated' })
})
```

`packages/admin-server/src/users/users.password.db.test.ts` — `describe('resetPassword', …)` 안, 첫 테스트 **다음**에 더한다:

```ts
it('🔴 살아 있는 세션만 끊고 센다 — 만료된 미폐기 행 · 이미 폐기된 행은 그대로(⑥ L1 · Review Focus 5)', async () => {
  const store = new AdminSessionStore(t.db)
  const user = await locked('p-live-only')
  const live = await seedSession(t.db, user.userNo)
  const expired = await seedSession(t.db, user.userNo)
  await t.db
    .updateTable('sessions')
    .set({ expireAt: new Date(Date.now() - 60_000) })
    .where('sessionNo', '=', expired)
    .execute()
  const rotated = await seedSession(t.db, user.userNo)
  await store.revoke(rotated, 'rotated', new Date())
  const { revokedCount } = await service.resetPassword(user.userNo, {}, root)
  expect(revokedCount).toBe(1)
  expect(await store.findByNo(live)).toMatchObject({ isRevoked: true, revokedReason: 'terminated' })
  expect(await store.findByNo(expired)).toMatchObject({ isRevoked: false, revokedReason: null })
  expect(await store.findByNo(rotated)).toMatchObject({ isRevoked: true, revokedReason: 'rotated' })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

```bash
pnpm --filter @ssworks/admin-server test calendar
pnpm --filter @ssworks/admin-server test options
pnpm --filter @ssworks/admin-server test:db users.employment
pnpm --filter @ssworks/admin-server test:db users.password
```

Expected: `calendar` 정규 이름 테스트가 `'asia/seoul'` 을 그대로 받아 실패(첫 테스트는 통과), `options` 가 `'asia/seoul'` 로 실패, 두 DB 테스트가 `revokedCount` 2 · 만료 행 `isRevoked: true` 로 실패.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/accounts/calendar.ts` — `resolveTimeZone` 의 문서 주석과 본문을 바꾼다:

```ts
/**
 * 코어 옵션 `timeZone` 을 푼다. 없으면 'Asia/Seoul'. 정규 이름을 돌려준다 — `'asia/seoul'` → `'Asia/Seoul'`,
 * `'US/Eastern'` → `'America/New_York'`(2d-3 스펙 ⑤ N1). 셈 · 감사 meta 가 한 표기를 쓴다.
 * 🔴 기동에서 멈춘다: IANA 모양이 아님(`+09:00` · `KST`) · Intl 이 모르는 이름(B15).
 * 🔴 링크 이름의 정규 이름은 ICU 판마다 다를 수 있다 — 거부하지 않고 바꿔 둔다(Node 를 올려도 기동이 깨지지 않게).
 */
export function resolveTimeZone(value: unknown): string {
  if (typeof value === 'undefined') return DEFAULT_TIME_ZONE
  if (typeof value === 'string' && IANA_TIME_ZONE.test(value)) {
    try {
      return formatterFor(value).resolvedOptions().timeZone
    } catch {
      // Intl 이 모르는 이름 — 아래 문구로 멈춘다
    }
  }
  throw new Error(
    `timeZone 은 IANA 시간대 이름이어야 한다(예: 'Asia/Seoul' · 'UTC' — '+09:00' 같은 오프셋 표기는 안 된다). 받은 값: ${String(value)}`,
  )
}
```

`packages/admin-server/src/users/users.service.ts`:

① `resign` 의 세션 폐기 주석 끝 줄 `//    된다. ON 에서 대상 로그아웃이 셈과 폐기 사이에 커밋되면 1020 → 409 다시 시도(2d-3 스펙 §14 R1-4).` **다음**에 한 줄을 더하고, 호출의 `{ trx }` 를 `{ trx, liveOnly: true }` 로 바꾼다:

```ts
//    liveOnly — 만료된 미폐기 행은 건드리지도 세지도 않는다(2d-3 스펙 ⑥ L1 — 감사 revokedCount 가 2c 세션 라우트와 한 뜻).
const revokedCount =
  effective.getTime() <= now.getTime()
    ? await this.sessions.revokeAllOfUser(userNo, 'terminated', now, {
        trx,
        liveOnly: true,
      })
    : 0
```

② `resetPassword` 의 `return this.sessions.revokeAllOfUser(userNo, 'terminated', now, { trx })` 를 바꾼다:

```ts
// liveOnly — 만료된 미폐기 행은 건드리지도 세지도 않는다(2d-3 스펙 ⑥ L1 — 감사 revokedCount 만 바뀐다)
return this.sessions.revokeAllOfUser(userNo, 'terminated', now, { trx, liveOnly: true })
```

- [ ] **Step 4: 돌려 GREEN · 커밋**

```bash
pnpm --filter @ssworks/admin-server typecheck
pnpm --filter @ssworks/admin-server test calendar
pnpm --filter @ssworks/admin-server test options
pnpm --filter @ssworks/admin-server test:db users.employment
pnpm --filter @ssworks/admin-server test:db users.password
pnpm --filter @ssworks/admin-server test:db users.http
pnpm exec prettier --write packages/admin-server/src/accounts/calendar.ts packages/admin-server/src/accounts/calendar.test.ts packages/admin-server/src/accounts/options.test.ts packages/admin-server/src/users/users.service.ts packages/admin-server/src/users/users.employment.db.test.ts packages/admin-server/src/users/users.password.db.test.ts
pnpm lint
git add packages/admin-server/src/accounts/calendar.ts packages/admin-server/src/accounts/calendar.test.ts packages/admin-server/src/accounts/options.test.ts packages/admin-server/src/users/users.service.ts packages/admin-server/src/users/users.employment.db.test.ts packages/admin-server/src/users/users.password.db.test.ts
git commit -m "feat(admin-server): timeZone 정규 이름 · 초기화 · 즉시 퇴사의 세션 폐기 liveOnly" -m "resolveTimeZone 이 resolvedOptions().timeZone 을 돌려준다('asia/seoul' → 'Asia/Seoul'). 만료된 미폐기 세션은 감사 revokedCount 에 세지 않는다(2d-3 스펙 ⑤ N1 · ⑥ L1)." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 테스트 빈틈 — `lockGrantRole` 회귀 · B7 · 치유 롤백 · `day()`(이월 8)

**Files:**

- Modify: `packages/admin-server/src/users/users.write.db.test.ts`
- Modify: `packages/admin-server/src/users/users.employment.db.test.ts`
- Modify: `packages/admin-server/src/users/users.http.db.test.ts`

**Interfaces:**

- Consumes: `whileHeld`(`test-support/concurrency.ts`), 서비스 공개 메서드 `create` · `update` · `correctResignDate` · `rehire` · `resign`.
- Produces: 테스트만. 제품 코드는 바뀌지 않는다(RED 실험 중 잠깐 바꾸고 되돌린다).

- [ ] **Step 1: `lockGrantRole` 회귀 테스트를 쓴다**

`packages/admin-server/src/users/users.write.db.test.ts`:

① import 에 두 줄을 보탠다:

```ts
import type { Connection } from 'mariadb'
import { whileHeld } from '../test-support/concurrency.js'
```

② 파일 끝(`describe('잔존(자기 데이터베이스)', …)` **앞**)에 더한다:

```ts
describe('🔴 줄 역할 잠금(lockGrantRole forUpdate — 이월 8)', () => {
  /** 원시 연결이 줄 역할을 잡고 권한을 '*' 로 넓힌다(커밋 전) */
  function widen(roleNo: bigint) {
    return async (connection: Connection) => {
      await connection.query('select role_no from roles where role_no = ? for update', [roleNo])
      await connection.query(`update roles set permissions = '["*"]' where role_no = ?`, [roleNo])
    }
  }

  it('만들기 — 줄 역할이 넓어지는 중이면 기다렸다 새 권한으로 판정해 403 · 계정을 만들지 않는다', async () => {
    const grant = await seedRole(t.db, {
      roleName: 'g-race-create',
      permissions: ['org.users:read'],
    })
    const result = await whileHeld(t, widen(grant), () =>
      service.create(
        { userId: 'g-race-new', userName: '경합 계정', roleNo: grant, teamNo: null },
        manager,
      ),
    )
    if (result.ok) throw new Error('403 을 기대했다')
    expect(result.error).toBeInstanceOf(BusinessError)
    expect((result.error as BusinessError).message).toBe(ACCOUNT_MESSAGES.higherRoleToGrant)
    expect(
      await t.db.selectFrom('users').select('userNo').where('userId', '=', 'g-race-new').execute(),
    ).toEqual([])
  })

  it('역할 변경 — 줄 역할이 넓어지는 중이면 기다렸다 새 권한으로 판정해 403 · 그대로', async () => {
    const grant = await seedRole(t.db, {
      roleName: 'g-race-update',
      permissions: ['org.users:read'],
    })
    const user = await fresh('g-race-target')
    const result = await whileHeld(t, widen(grant), () =>
      service.update(user.userNo, { revision: 0, roleNo: grant }, manager),
    )
    if (result.ok) throw new Error('403 을 기대했다')
    expect((result.error as BusinessError).message).toBe(ACCOUNT_MESSAGES.higherRoleToGrant)
    expect(await userRow(t.db, user.userNo)).toMatchObject({ roleNo: plainRole, revision: 0 })
  })
})
```

- [ ] **Step 2: B7 · 치유 롤백 테스트를 쓰고 `day()` 를 고친다**

`packages/admin-server/src/users/users.employment.db.test.ts`:

① 머리의 `const day = (offset: number) => addDays(todayIn(TZ), offset)` 를 바꾼다:

```ts
// 🔴 오늘은 파일이 읽힐 때 한 번 센다 — 요청과 단언이 KST 자정을 걸쳐도 같은 날이다(이월 8). 효력 시각이 "지금" 보다 앞인지
//    재는 단언(세션 유지 · 미래)은 서비스 시계를 따르므로 자정 직전 몇 초에는 드물게 틀릴 수 있다 — 시계 주입은 비범위.
const TODAY = todayIn(TZ)
const day = (offset: number) => addDays(TODAY, offset)
```

② `describe('resign', …)` 안, `'활성 구간이 없으면 users.joinAt 으로 치유한다(공통 7) · 둘이면 409 periodCorrupted'` 테스트 **다음**에 더한다:

```ts
it('🔴 치유한 뒤 400 이면 치유 구간도 롤백된다(이월 8)', async () => {
  const seeded = await seedUser(t.db, {
    roleNo: plainRole,
    userId: 'r-heal-400',
    joinAt: new Date('2025-03-01T15:00:00.000Z'), // KST 2025-03-02
  })
  const error = await rejection(() =>
    service.resign(seeded.userNo, { resignDate: '2025-03-01' }, root),
  )
  expect(error.details).toEqual(issue('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin))
  expect(await periodsOf(t.db, seeded.userNo)).toEqual([])
  expect(await userRow(t.db, seeded.userNo)).toMatchObject({ resignAt: null, revision: 0 })
})
```

③ `describe('correctResignDate', …)` 안, 마지막 테스트 **다음**에 더한다:

```ts
it('🔴 권한 없는 사람에게는 재직 중이어도 409 가 아니라 403 — 판정이 먼저(B7 · 이월 8)', async () => {
  const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'd-b7-wide' })
  const error = await rejection(() =>
    service.correctResignDate(wide.userNo, { resignDate: day(1) }, manager),
  )
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  expect(error.message).toBe(ACCOUNT_MESSAGES.higherAccount)
})
```

④ `describe('rehire', …)` 안, 마지막 테스트 **다음**에 더한다:

```ts
it('🔴 권한 없는 사람에게는 재직 중이어도 409 가 아니라 403 — 판정이 먼저(B7 · 이월 8)', async () => {
  const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'h-b7-wide' })
  const error = await rejection(() => service.rehire(wide.userNo, { joinDate: day(1) }, manager))
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  expect(error.message).toBe(ACCOUNT_MESSAGES.higherAccount)
})
```

`packages/admin-server/src/users/users.http.db.test.ts` — 머리의 `const day = (offset: number) => addDays(todayIn(TZ), offset)` 를 바꾼다(`todayIn` 은 235 · 251 행이 그대로 쓴다):

```ts
// 🔴 오늘은 파일이 읽힐 때 한 번 센다 — 요청과 단언이 KST 자정을 걸쳐도 같은 날이다(이월 8)
const TODAY = todayIn(TZ)
const day = (offset: number) => addDays(TODAY, offset)
```

- [ ] **Step 3: 돌린다 — 회귀 고정이라 구현 전에도 GREEN 이다**

```bash
pnpm --filter @ssworks/admin-server test:db users.write
pnpm --filter @ssworks/admin-server test:db users.employment
pnpm --filter @ssworks/admin-server test:db users.http
pnpm lint
```

Expected: 모두 통과. 보고서에 "구현 전 GREEN — 회귀 고정" 으로 적고 Step 4 의 RED 실험을 한다.

- [ ] **Step 4: 🔴 RED 실험**

① `users/user-locks.ts` 의 `lockGrantRole` 에서 `.forUpdate()` 를 빼고 `pnpm --filter @ssworks/admin-server test:db users.write` — 줄 역할 잠금 두 테스트가 `403 을 기대했다` 로 실패(낡은 권한으로 판정 · 커밋 — 권한 상승). 되돌린다.

② `users/users.service.ts` 의 `correctResignDate` 에서 `if (target.resignAt === null) throw userConflict(ACCOUNT_MESSAGES.notResigned)` 를 `judgeAccountCommand(…)` **앞**으로, `rehire` 에서 `if (target.resignAt === null) throw userConflict(ACCOUNT_MESSAGES.notResignedForRehire)` 를 `judgeAccountCommand(…)` **앞**으로 옮기고 `pnpm --filter @ssworks/admin-server test:db users.employment` — B7 두 테스트가 409 를 받아 실패(Task 3 의 본인 재입사 테스트도 409 로 실패한다 — 같은 원인). 되돌린다.

③ 치유 롤백 테스트는 RED 실험을 하지 않는다 — 치유 INSERT 와 400 이 한 `runWriteTransaction` 안이라 그 경계를 깨는 실험은 서비스 구조를 바꿔야 한다. 보고서에 이 이유를 적는다.

세 결과(명령 · 출력)를 보고서에 붙이고, 되돌린 뒤 Step 3 의 명령으로 GREEN 을 다시 본다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/users/users.write.db.test.ts packages/admin-server/src/users/users.employment.db.test.ts packages/admin-server/src/users/users.http.db.test.ts
pnpm lint
git status --short
git add packages/admin-server/src/users/users.write.db.test.ts packages/admin-server/src/users/users.employment.db.test.ts packages/admin-server/src/users/users.http.db.test.ts
git commit -m "test(admin-server): 이월 8 — lockGrantRole 회귀 · correct · rehire 의 B7 · 치유 롤백 · day() 한 번" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: `git status --short` 에 제품 코드(`user-locks.ts` · `users.service.ts`)의 변경이 없다(실험을 되돌렸다).

---

### Task 6: README · changeset · 스모크 · 진행 문서

**Files:**

- Modify: `packages/admin-server/README.md`
- Create: `.changeset/admin-server-accounts-cleanup.md`
- Modify: `docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md`(§14 R2)
- Modify: `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md`(§14 R11)
- Modify: `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md`(§14 R4)
- Modify: `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`
- Create(저장소 밖): `$TEMP/akss/` 아래 앱 파일들

- [ ] **Step 1: README 를 고친다**

`packages/admin-server/README.md`:

① "## 역할 · 권한" 의 `- **동시 쓰기 재시도**: CI 는 MariaDB 11.4 다. …` 줄을 통째로 바꾼다:

```md
- **동시 쓰기**: 역할 만들기 · 이동 · 기본 켜기는 순서 · 기본 표시 인덱스(장 `0001_roles`)로 그 행만 잠근다 — 다른 역할을 쓰는 사용자 쓰기와 엇갈리지 않는다. 역할 권한 수정 · 삭제는 그 역할의 이동과 겹쳐도 기다렸다가 끝난다(MariaDB 11.6.2+ 의 `innodb_snapshot_isolation` ON 에서도). 겹치는 구간을 옮기는 이동 둘, 또는 기본 역할을 쓰는 계정의 역할 변경과 다른 역할의 기본 켜기가 드물게 교착(1213)하면 409 `ERR_COMMON_CONFLICT`("다시 시도해 주세요")다 — 다시 보내면 된다(전권자 잔존은 그대로 지켜진다).
```

② "## 사용자 · 계정" 의 날짜 문단에서 `` `+09:00` 같은 오프셋 표기는 기동에서 멈춘다. `` 를 바꾼다:

```md
`+09:00` 같은 오프셋 표기는 기동에서 멈추고, 대소문자 · 옛 이름(`'asia/seoul'` · `'US/Eastern'`)은 정규 이름(`'Asia/Seoul'` · `'America/New_York'`)으로 바꿔 쓴다 — 감사 meta 의 `timeZone` 도 그 이름이다.
```

③ 같은 절의 `- **권한 상승 · 자기 계정**: …` 줄을 바꾼다:

```md
- **권한 상승 · 자기 계정**: 사용자 쓰기는 대상의 역할 권한을 덮어야 하고, 역할을 바꾸면 새 역할도 덮어야 한다(403 `details.outside`). 🔴 자기 계정의 퇴사 · 퇴사일 정정 · 재입사 · 비밀번호 초기화 · 잠금 해제는 403 — 다른 관리자에게 요청한다(퇴사 예정인 본인이 자기 재입사로 퇴사를 거두는 것도 막는다). 자기 이름 · 팀 바꾸기는 된다.
```

④ 같은 절의 `- **동시 쓰기 재시도**: MariaDB 11.6.2+ …` 줄을 바꾼다:

```md
- **동시 쓰기 재시도**: 퇴사 · 역할 변경은 대상의 로그인 · 같은 팀의 이름 바꾸기 · 줄 역할의 이동과 겹쳐도 기다렸다가 끝난다(대상 · 역할 · 팀을 먼저 잠근 뒤 전권자 수를 센다). MariaDB 11.6.2+(`innodb_snapshot_isolation` 기본 ON)에서는 즉시 퇴사가 그 계정의 로그아웃(또는 다른 관리자의 세션 끊기)과 겹치면 드물게 409 `ERR_COMMON_CONFLICT`("다시 시도해 주세요")로 끝난다 — 다시 보내면 된다. 즉시 퇴사 · 비밀번호 초기화가 그 계정의 토큰 갱신과 겹치면 드물게 교착(1213)해 어느 한쪽이 409 다 — 대개 끊길 세션 쪽이다.
```

⑤ 같은 절의 `- 감사: …` 줄에서 `퇴사 · 정정 · 재입사 meta 에 사유 · 끊은 세션 수 · 기준 시간대가 남는다.` 를 바꾼다:

```md
퇴사 · 정정 · 재입사 meta 에 사유 · 끊은 세션 수 · 기준 시간대가 남는다(끊은 세션 수는 초기화와 같이 살아 있던 세션만 센다 — 만료된 세션은 건드리지 않는다).
```

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-accounts-cleanup.md`:

```md
---
'@ssworks/admin-server': minor
---

**쓰는 쪽이 할 일:** 없음(새 DB). 장 `0001_roles` 를 이미 돌린 개발 DB 는 역할 인덱스 둘이 없어도 2d-2 와 같이 돈다 — 맞추려면 `CREATE INDEX idx_roles_display_order ON roles (display_order)` · `CREATE INDEX idx_roles_is_default ON roles (is_default)`. 본인 재입사 `POST /users/:userNo/rehire` 는 이제 403 `ERR_COMMON_FORBIDDEN` 이다.

admin-server 계정 정리(Phase 2 PR 2d-3): 전권자 잔존 쓰기(역할 권한 수정 · 삭제 · 사용자 역할 변경 · 퇴사)가 대상 · 줄 역할 · 팀 · 다른 기본 역할을 잠근 뒤에 전권자 수를 센다 — 감사 before · 응답 item 이 낡지 않고, MariaDB 11.6.2+ 의 스냅샷 격리에서 대상 로그인 · 팀 이름 바꾸기 · 역할 이동과 겹쳐도 409 가 나지 않는다. 역할 표에 순서 · 기본 표시 인덱스를 더해 역할 만들기 · 이동 · 기본 켜기가 그 행만 잠근다. 퇴사 예정인 본인의 자기 재입사를 403 으로 막는다. `timeZone` 옵션은 정규 이름으로 바꿔 쓴다(`'asia/seoul'` → `'Asia/Seoul'`). 초기화 · 즉시 퇴사의 끊은 세션 수는 살아 있던 세션만 센다. 아직 `private` 이라 npm 에 나가지 않는다.
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
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "test-support|[.]test[.]js" || echo "테스트 파일 없음"
```

Expected: tarball 둘, 마지막 줄은 `테스트 파일 없음`.

`$TEMP/akss/` 의 `package.json` · `tsconfig.json` · `.env` · `kysely.config.ts` · `src/main.ts` · `src/seed.ts` · `src/app.module.ts` · 스텁 열 개(`src/migrations/001_…` ~ `010_admin_team_tree_lock.ts`)는 2e-1 플랜 Task 10 Step 3(`docs/superpowers/plans/2026-10-14-admin-server-teams.md`)과 같다 — 그대로 옮겨 쓰고 tarball 이름만 `ls` 결과로 맞춘다(장 수는 그대로 열이다 — 이 PR 은 장 0001 의 내용만 바꿨다).

`$TEMP/akss/check.mjs` — 2e-1 플랜의 `send` · `show` · `bigint` · `waitForServer` · `login` 도우미 그대로, 본문을 바꾼다:

```js
await waitForServer()
const admin = await login('admin', 'smoke-pass-1234')
const write = (method, path, body) => send(path, { method, cookie: admin, body })
const dataOf = (response) => JSON.parse(response.text).data
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

show(
  'roles-create',
  await write('POST', '/admin/roles', {
    roleName: '팀장',
    isDefault: false,
    permissions: ['org.users:read'],
  }),
)
const roles = dataOf(await send('/admin/roles', { cookie: admin })).items
const leader = roles.find((role) => role.roleName === '팀장')
const staffRole = roles.find((role) => role.roleName === '직원').roleNo
show(
  'roles-update',
  await write('PATCH', `/admin/roles/${bigint(leader.roleNo)}`, {
    revision: leader.revision,
    isDefault: true,
    permissions: ['org.users:read', 'org.users:write'],
  }),
)
show(
  'roles-move',
  await write('PATCH', `/admin/roles/${bigint(leader.roleNo)}/move`, { displayOrder: 1 }),
)

const created = await write('POST', '/admin/users', {
  userId: 'smoke-cleanup',
  userName: '정리 확인',
  roleNo: staffRole,
  teamNo: null,
})
show('users-create', created)
const item = dataOf(created).item
const changed = await write('PATCH', `/admin/users/${bigint(item.userNo)}`, {
  revision: item.revision,
  roleNo: leader.roleNo,
})
show('users-role-change', changed)
show(
  'users-resign',
  await write('POST', `/admin/users/${bigint(item.userNo)}/resign`, { resignDate: today }),
)

const people = dataOf(await send('/admin/users?filter%5Bkeyword%5D=admin', { cookie: admin })).items
const self = people.find((person) => person.userId === 'admin')
show(
  'users-rehire-self',
  await write('POST', `/admin/users/${bigint(self.userNo)}/rehire`, { joinDate: today }),
)
show(
  'audit-logs',
  await send('/admin/audit-logs?itemsPerPage=20&filter%5Baction%5D=org.', { cookie: admin }),
)
```

🔴 시나리오 대조(서버 규칙을 어기지 않는가): `admin`(`'*'`)이 모든 역할을 덮는다 · 새 역할 `팀장` 의 권한은 카탈로그 안 키다(`org.users:read` · `org.users:write` — 2d-1 카탈로그) · 기본 켜기는 시드에 기본 역할이 없으면 `clearedDefaults` 가 없다 · 새 계정의 입사일은 오늘이라 퇴사일도 오늘이어야 400 이 아니다(같은 날 퇴사 허용) · 본인 재입사는 재직 중인 `admin` 이라 판정이 먼저 403 이다.

- [ ] **Step 4: 설치 · 빌드 · 마이그레이션 · 시드 · 인덱스 확인**

```bash
cd "$TEMP/akss"
pnpm install
pnpm build
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists akss; create database akss"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akss -e "select distinct index_name from information_schema.statistics where table_schema = 'akss' and table_name = 'roles' order by index_name"
```

Expected: 설치 성공 · 마이그레이션 10장 · 시드 성공. 마지막 출력에 `PRIMARY` · `idx_roles_display_order` · `idx_roles_is_default` · `uq_roles_role_name`.

- [ ] **Step 5: 기동 · 요청**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected(본문은 줄여 적는다):

- `roles-create 201 {"success":true,"data":{"roleNo":"BigInt(3)"}}`
- `roles-update 200 {…"item":{…"isDefault":true,"permissions":["org.users:read","org.users:write"],"revision":1…}}`
- `roles-move 200 {"success":true,"data":{}}`
- `users-create 201` · `users-role-change 200 {…"roleName":"팀장"…}` · `users-resign 200 {…"resignDate":"<오늘>"…}`
- `users-rehire-self 403 {…"code":"ERR_COMMON_FORBIDDEN","message":"내 계정에는 이 작업을 할 수 없습니다. 다른 관리자에게 요청하세요."}`
- `audit-logs 200 {…}` — 최신순으로 `org.user.rehire`(403 · `errorCode` `ERR_COMMON_FORBIDDEN`) · `org.user.resign`(meta `revokedCount` 0 · `timeZone` `Asia/Seoul`) · `org.user.update` · `org.user.create` · `org.role.move` · `org.role.update` · `org.role.create`.

셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
```

- [ ] **Step 7: 스펙 §14 · 진행 문서를 고친다**

숫자(N · M · W)는 저장소 루트에서 `pnpm check` · `pnpm test:db` 를 돌린 결과로 채운다(admin-server 테스트 수 · DB 테스트 수 · 워크스페이스 합계).

**이 PR 의 스펙 `docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md` §14** 끝에 더한다:

```md
- **R2 — 플랜이 더한 작은 결정 넷(2026-10-15, 2d-3 플랜).** ① 인덱스 잠금 범위 테스트(i1~i3)와 순서 시드 0 테스트는 새 파일 `roles/roles.index.db.test.ts` 에 둔다(§8 정정 — `roles.order` 는 이동 · 삭제가 순서 값을 재므로 다른 역할을 섞지 않는다). ② 잔존 경합 r3(사용자 역할 변경 ∥ 팀 이름) · r4(역할 수정 · 삭제 ∥ 이동)는 ON · OFF 둘 다 돈다 — OFF 는 낡은 item(R10-2)을, ON 은 1020 을 잡는다. ③ 단계를 호출 밖에서 선언하는 곳(역할 · 사용자 수정 — 잔존 없는 갈래가 같은 단계를 부른다)은 `LockedWrite<L, T>` 로 타입을 적는다 — 인자를 안 쓰는 `write` 를 `steps.write(locked)` 로 부를 수 있게. ④ `resolveTimeZone` 테스트의 링크 이름 기대값은 Intl 이 내는 값이다 — ICU 78.3 은 `'America/Argentina/Buenos_Aires'` 를 `'America/Buenos_Aires'` 로 낸다(ICU 판마다 다를 수 있다).
```

구현 · 리뷰 중 바뀐 것이 있으면 `R3` 이하로 더한다.

**2d 스펙 `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` §14** 끝에 더한다:

```md
- **R11 — 2d-3 계정 정리가 고친 것(2026-10-15, `docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md`).** ① B16 "재입사는 자기 계정도 허용한다" → 본인 재입사 403 `selfAccount`(③ SF1 에 더함 — 판정이 상태보다 먼저라 재직 중인 본인도 403). ② §5-3 흐름 "① 센티넬 ② before ③ 대상 행" → 센티넬 → 잠금 단계(대상 · 줄 역할 · 팀 · 다른 기본 역할 잠금 · 판정 · revision · 상태) → before → 쓰기 → 후 셈(`withSuperAdminSurvival(trx, { lock, write })`). R9-2 · R10-2(낡은 before · item)와 R7-1(ON 의 로그인 경합 409)이 닫혔다. ③ §5-4 만들기의 `MAX(displayOrder)` → 인덱스 끝 한 행 잠금 읽기, 장 0001 에 `(displayOrder)` · `(isDefault)` 인덱스(R9-3 닫음). ④ ⑤ TZ1 의 `timeZone` 은 정규 이름으로 바꿔 쓴다. ⑤ 초기화 · 즉시 퇴사의 세션 폐기는 `liveOnly`(감사 `revokedCount` 만 바뀐다).
```

**2e 스펙 `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md` §14** 끝에 더한다:

```md
- **R4 — 2d-3 이 이월을 닫았다(2026-10-15, `docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md`).** §2-1 이월 표 1 · 2 · 5 · 7 · 8 나머지 · 9 와 2e-1 최종 리뷰의 스냅샷 1020(역할을 바꾸는 사용자 수정 ∥ 같은 팀 이름 바꾸기 · 이동)을 닫았다. §5-1 표의 사용자 쓰기 행 잠금 순서는 그대로다 — 셈 자리만 `lockTeam` 뒤로 갔다. 2d-3 은 장을 더하지 않았다(장 0001 정정) — [2] 의 `0011_legal_documents` 번호는 그대로다.
```

**`docs/01-phase0.md`**

① §8 표 `@ssworks/admin-server` 행 상태 칸 끝(`… 다음 2d-3 계정 정리`)을 바꾼다:

```md
… 다음 2d-3 계정 정리. **PR 2d-3 완료**(`feat/admin-server-accounts-cleanup`, 2026-10-15) — 잔존 잠금 단계(`withSuperAdminSurvival(trx, { lock, write })` — 셈을 대상 잠금 뒤로) · 역할 인덱스 둘(장 0001 정정) · 본인 재입사 403 · `timeZone` 정규 이름 · 세션 폐기 `liveOnly`. N 테스트 + 실 MariaDB M. 스펙 `docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md` · 플랜 `docs/superpowers/plans/2026-10-15-admin-server-accounts-cleanup.md`. 다음 2e-2 약관
```

② 표 아래 `다음: Phase 2 PR 2d-3 계정 정리(…) → 2e-2 약관(같은 스펙 [2]).` 줄을 바꾼다:

```md
다음: Phase 2 PR 2e-2 약관(2e 스펙 [2] — 위험 실측 → 플랜부터) → 2f.
```

**`docs/HANDOFF.md`**

- `@ssworks/admin-server` 행에서 2e-1 의 숫자 문장(`498 테스트 + 실 MariaDB 315.`)을 지우고, 그 행 끝에 더한다: ``**PR 2d-3**(계정 정리 — 잔존 잠금 단계 `withSuperAdminSurvival(trx, { lock, write })` · 역할 인덱스 둘(장 0001 정정) · 본인 재입사 403 · `timeZone` 정규 이름 · 세션 폐기 `liveOnly` · 테스트 빈틈 넷)은 `feat/admin-server-accounts-cleanup` 에서 구현 완료(2026-10-15). N 테스트 + 실 MariaDB M.``
- "검증" 행 끝에 더한다: `PR 2d-3 은 Windows 에서 pnpm check · pnpm test:db 초록, 쓰는 쪽 스모크($TEMP/akss — 새 DB · 스텁 10 → roles 인덱스 둘 확인 → 시드 → 기동 → 역할 만들기 · 기본 켜기 + 권한 수정 · 이동 → 사용자 만들기 · 역할 변경 · 퇴사 · 본인 재입사 403 → 감사 행)를 통과했다.`
- "다음 플랜" 행을 바꾼다: `Phase 2 PR 2e-2 약관 — 2e 스펙 [2](이미 있다). 다음 세션은 위험 실측(2e 스펙 §12 (c) — R1-5 에서 이미 잼, 플랜이 기대는 나머지 가정만) → 플랜부터. 새 브랜치 feat/admin-server-legal, 장 0011_legal_documents(번호 그대로 — 2d-3 은 장을 더하지 않았다). 직전 PR 2d-3: 플랜 docs/superpowers/plans/2026-10-15-admin-server-accounts-cleanup.md`
- "PR 2d-2 최종 리뷰가 넘긴 것" 의 항목 끝을 바꾼다: (우선) 잔존 순서 `→ 2d-3` → `→ **2d-3 에서 닫음**(잠금 단계 콜백 — 2d-3 스펙 ① A)`, 역할 전수 스캔 `→ 2d-3(검토)` → `→ **2d-3 에서 닫음**(인덱스 둘 · 장 0001 정정)`, `timeZone` `→ 2d-3` → `→ **2d-3 에서 닫음**`, `revokedCount` `→ 2d-3` → `→ **2d-3 에서 닫음**(초기화 · 즉시 퇴사 모두)`, 테스트 빈틈 `… 나머지 2d-3` → `… 나머지 **2d-3 에서 닫음**`, 제품 확인 `→ 2d-3: 본인 재입사 403(사용자 결정)` → `→ **2d-3 에서 닫음**(본인 재입사 403)`.
- "PR 2e-1 최종 리뷰가 넘긴 것" 의 첫 항목(`(2d-3 에 더함) 스냅샷 격리 ON …`) 끝에 ` → **2d-3 에서 닫음**(lockGrantRole · lockTeam 이 잠금 단계)` 을 붙인다.
- 최종 리뷰가 넘긴 것이 있으면 `- **PR 2d-3 최종 리뷰가 넘긴 것(2026-10-15)**` 항목으로 더한다(Step 9 뒤에 채운다). 2d-3 이 받아들인 남는 경합(즉시 퇴사 ∥ 대상 로그아웃 — ON 409, 기본 역할을 쓰는 계정의 역할 변경 ∥ 기본 켜기 교착)도 여기 적는다.

**`CLAUDE.md`**

- 패키지 표의 admin-server 행 설명을 `NestJS 12 모듈 (Phase 2 진행 — 2a 기반 · 2b 인증 · 2c 세션 · 감사 · 2d 역할 · 사용자 · 2e-1 팀 · 2d-3 계정 정리 완료)` 로.
- `### @ssworks/admin-server (Phase 2)` 목록에서 "전체 권한 재직자 수를 줄일 수 있는 쓰기는 …(센티넬 잠금이 트랜잭션 첫 문장)로 감싼다." 문장을 아래 블록의 문장으로 바꾼다(그 줄의 앞뒤 문장은 그대로):

```md
전체 권한 재직자 수를 줄일 수 있는 쓰기는 `withSuperAdminSurvival(trx, { lock, write })` 로 감싼다 — 센티넬(트랜잭션 첫 문장) → `lock()`(남이 대상 잠금 없이 바꾸는 결정 행의 잠금 읽기 · 판정만, 비잠금 SELECT 금지) → 셈 → `write()` → 후 셈(2d-3 스펙 ① A · C3).
```

- 진행 표: `**Phase 2 PR 2d-3 — 계정 정리**` 행을 `Phase 2 PR 2d-3 — 계정 정리(잔존 잠금 단계 · 역할 인덱스 · 본인 재입사 403 · timeZone · liveOnly)` · `완료` · `스펙 docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md · 플랜 docs/superpowers/plans/2026-10-15-admin-server-accounts-cleanup.md` 로, `Phase 2 PR 2e-2 — 약관` 행의 상태를 `**다음**` 으로(이름을 굵게).

- [ ] **Step 8: 포맷 · 확인 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-accounts-cleanup.md docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-accounts-cleanup.md docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md
pnpm format:check
pnpm check
pnpm test:db
```

Expected: prettier 두 번째 실행은 `(unchanged)` 뿐, `format:check` · `check` · `test:db` 초록. 작업 공간(`.superpowers/`)의 md 때문에 `format:check` 가 실패하면 그 경로만 원인인지 보고, 작업 공간을 지운 뒤 다시 돌린다.

```bash
git add packages/admin-server/README.md .changeset/admin-server-accounts-cleanup.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md
git commit -m "docs: PR 2d-3 계정 정리 — README · changeset · 스펙 §14 · 진행 문서, 다음은 2e-2 약관" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 9: 최종 리뷰 · 머지 방법**

whole-branch 최종 리뷰(opus)를 받고 반영한 뒤(반영 커밋마다 `pnpm check` · `pnpm test:db`), 리뷰가 넘긴 것을 HANDOFF 에 적고 superpowers:finishing-a-development-branch 로 머지 방법을 묻는다.

---

## 스펙 대조표 (자체 검토)

| 스펙                                                                                       | Task              |
| ------------------------------------------------------------------------------------------ | ----------------- |
| ① A 잔존 API `{ lock, write }` · C1 `LockedWrite` · 옛 시그니처 삭제                       | 1                 |
| ② R1 · C3 잠금 단계 표(역할 수정 · 삭제 · 사용자 수정 · 퇴사) · C2 잠금 단계에 비잠금 금지 | 1                 |
| C4 `lockOtherDefaults` · `clearDefaults`                                                   | 1 · 2             |
| C5 세션 폐기는 쓰기 단계                                                                   | 1 · 4             |
| ③ I1 인덱스 둘 · 장 0001 정정 · C6 끝 행 순서 셈                                           | 2                 |
| ④ S1 · C7 본인 재입사 403                                                                  | 3                 |
| ⑤ N1 · C8 `timeZone` 정규 이름                                                             | 4                 |
| ⑥ L1 `liveOnly`(초기화 · 즉시 퇴사)                                                        | 4                 |
| ⑦ T1 테스트 빈틈 넷(`day()` 두 파일)                                                       | 5                 |
| ⑧ P1 스펙 자리 · 2d §14 R11 · 2e §14 R4                                                    | 6                 |
| C9 주석 정리(`user-view.ts` · `super-admin.ts` · employment 경합 주석)                     | 1                 |
| §2-2 #1 잠금 규칙 그대로 · #2 새 코드 없음 · #3 HTTP 계약 하나 · #4 범위 밖                | Global · 3        |
| §5-4 경합 결과 표(r1 · r2 · r3 · r4 · i1 · 로그아웃은 받아들임)                            | 1 · 2 · 6         |
| §6 오류 표(본인 재입사)                                                                    | 3                 |
| §9-1 단위(판정 · `resolveTimeZone` · ddl)                                                  | 2 · 3 · 4         |
| §9-2 DB(잔존 · r1~r4 · i1~i3 · 장 · liveOnly · 이월 8 · 이월 9 HTTP)                       | 1 · 2 · 3 · 4 · 5 |
| §10 changeset · README · 진행 문서 · 스모크                                                | 6                 |
| §14 R1(실측)                                                                               | 머리말 · 1 · 2    |

### §9-3 리뷰 초점 → 어디서 재는가

1. `lock()` 안에 비잠금 읽기가 없는가 — Task 1 Step 12 의 RED(셈을 앞으로 옮기면 잠금 단계 테스트 · r1~r4 가 실패). 리뷰어는 `roles.service.ts` · `users.service.ts` 의 `lock:` 블록에 `.forUpdate()` 없는 SELECT · `readUser` · `findRole` 이 없는지 본다.
2. 잠금 단계가 C3 표와 같은가 · 전역 잠금 순서 — Task 1 r3(`lockTeam`) · r4(`lockRole`) · Review Focus 1(오류 순서). 리뷰어는 `update` 의 `lock` 이 `lockUser → lockGrantRole → judge → revision → lockTeam` 순서인지 본다.
3. 경합 테스트의 RED 가 다른 잠금에 가려지지 않는가 — r3 의 원시 연결은 `teamTree` 가드 · 팀 행만 쥔다(사용자 · 역할 행은 쥐지 않는다), r4 는 역할 행만 쥔다 — 서비스가 기다리는 곳은 각각 `lockTeam` · `lockRole` 하나다. i1~i3 은 상관없는 역할 행 하나만 쥔다.
4. 역할 인덱스 — Task 2 i1~i3 · `roles.order` 동시 만들기 · Step 6 RED.
5. 본인 재입사 · `liveOnly` · `timeZone` — Task 3 · 4 의 테스트, 스모크(Task 6 Step 5)의 감사 meta.
