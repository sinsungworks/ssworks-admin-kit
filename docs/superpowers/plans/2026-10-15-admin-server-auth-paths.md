# admin-server 인증 경로 (Phase 2 PR 2f-2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2f-2a 스펙대로 인증 경로의 이월을 닫는다 — 회전 · 유예 발급이 users 행을 세션보다 먼저 공유 잠금으로 잡아 즉시 퇴사 · 초기화 · 본인 비밀번호 변경과의 교착(2d R10-3)을 없애고, 로그인은 IP → 비밀번호 → 확정 트랜잭션(잠근 행으로 잠김 · 퇴사 판정 → 카운터 되돌림 → 세션 INSERT)으로 TOCTOU 를 닫으며, 막힌 주소의 로그인은 비밀번호를 보지 않고 같은 401 이다. `AdminAuthRepository` 를 발행 전에 트랜잭션을 받는 잠금 원시 둘로 바꾸고, IP 판정 블록을 도우미 하나로 · `clientIp` 인자 필수 · IP 진단 경고 둘 · `whileHeld` 단언 강제 · `failure()` 한 벌로 정리한다.

**Architecture:** 리포지토리는 행 단위 원시만 낸다(`lockCredential(trx, userNo, 'share' | 'update')` · `writeLoginState(trx, …)`), 트랜잭션과 카운터 원자성은 패키지(`password-check.ts` 의 `updateLoginState(db, repo, …)`)가 맡는다. `AdminAuthService` 는 로그인 확정을 한 트랜잭션(첫 문장 `lockCredential('update')`)으로, 회전 · 유예 발급을 도우미 `underUserLock`(IP → 트랜잭션: 첫 문장 `lockCredential('share')` → 퇴사 → 쓰기)으로 묶는다. 세션 저장소는 받은 트랜잭션 위에서 쓴다. 이벤트는 커밋 뒤에 낸다.

**Tech Stack:** NestJS 12.1 (ESM · NodeNext) · Kysely 0.29 + MariaDB 11.4 · vitest 4 · supertest · TypeScript 5.9

**Spec:** `docs/superpowers/specs/2026-10-15-admin-server-auth-paths-design.md` 전부 — §1 · §2-1 ①~⑤ · §2-2 #1~#5 · §2-3 A1~A17 · §4 · §5-1~§5-4 · §6 · §8 · §9 · §10 · §11 · §13 · **§14 R1(이 플랜 전 실측) · R2(이 플랜이 더한 작은 결정)**. 어긋나면 스펙이 이긴다. 직전 PR 2f-1 플랜 `docs/superpowers/plans/2026-10-15-admin-server-ip-access.md`.

**구현자 규칙(모든 Task):** 테스트를 먼저 만들고 **구현 전에 돌려 RED 를 보고서에 붙인다**(실패 메시지 몇 줄 · 명령과 출력). 그다음 구현 · GREEN · 커밋. 🔴 표시가 붙은 잠금 · 순서 테스트는 구현 뒤에 해당 줄을 일부러 되돌려 RED 를 한 번 더 보고(보고서에 명령 · 출력을 적고) 되돌린다. 실험이 RED 가 아니면 멈추고 보고한다 — 테스트가 그 회귀를 못 잡는다는 뜻이다.

## Global Constraints

- ESM 전용 · `module: NodeNext`. 내부 상대 import 는 `.js` 확장자. `console.log` 금지(`Logger.warn` · `error` 만).
- `admin-server/src` 는 `import type` 분리 규칙의 예외다(DI 메타데이터) — 단 데코레이터가 붙은 시그니처에 쓰는 **인터페이스 · 타입 별칭은 `import type`**(TS1272: `AdminAuthRepository` · `ResolvedAuthConfig` · `Kysely` · `AdminDatabase` · `Request` …), DI 로 받는 **클래스는 일반 import**(`AdminSessionStore` · `AdminAccessTokenService`).
- 정본에서 옮긴 파일은 머리 주석에 `정본:` · `바꾼 점:` · `🔴` 를 적는다. 고치는 파일은 `바꾼 점:` 에 2f-2a 줄을 더한다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 🔴 **인증 경로는 users 를 세션보다 먼저 잡는다**(스펙 §5-3). 로그인 확정 트랜잭션의 첫 문장은 `repo.lockCredential(trx, userNo, 'update')`, 회전 · 유예 발급 트랜잭션의 첫 문장은 `repo.lockCredential(trx, userNo, 'share')` 다. 세션 행을 먼저 만지는 인증 트랜잭션을 만들지 않는다.
- 🔴 **`'share'` 는 `LOCK IN SHARE MODE` 다** — MariaDB 11.4 는 `FOR SHARE` 를 1064 로 거부한다(스펙 §14 R1-⑤). Kysely `.forShare()` 를 쓰지 않고 ``.modifyEnd(sql`lock in share mode`)`` 를 쓴다(Task 2 Step 6 코드 그대로).
- 🔴 **argon2(`verifyPassword` · `hashPassword`)는 어떤 트랜잭션 안에서도 부르지 않는다.** 확정 · 회전 트랜잭션 안에는 잠금 읽기 · 판정 · 쓰기만 있다.
- 🔴 **이벤트는 커밋 뒤.** 로그인 확정 트랜잭션은 판정을 값(`LoginOutcome`)으로 돌려주고 이벤트 · 오류는 바깥에서 낸다. 회전 · 유예의 `gone` · `resigned` 는 이벤트가 없어 트랜잭션 안에서 던진다(스펙 §14 R2-⑧).
- 🔴 **`writeLoginState` 는 같은 트랜잭션에서 `lockCredential(…, 'update')` 뒤에만 부른다.** 카운터를 바꾸는 곳은 `password-check.ts` 의 `updateLoginState` 도우미와 로그인 확정의 되돌림 둘뿐이다.
- 🔴 **IP 판정은 `AdminAuthService.ipVerdict` 하나다**(스펙 A13). 판정만 하고 이벤트 · 오류는 부른 쪽이 낸다 — 로그인 → `login.blocked`(ip) + 401 `ERR_LOGIN_FAILED`, 가드 · refresh · 유예 → `access.blocked`(ip) + 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp`.
- 문구(한 곳씩):
  - `AUTH_MESSAGES.loginFailedWithIp` = `아이디 또는 비밀번호가 올바르지 않거나, 로그인 실패가 반복되어 잠시 잠겼거나, 허용되지 않은 접속 위치입니다.` — `ADMIN_ACCESS_POLICY` 가 주입됐을 때 로그인 401 전부의 문구. 없으면 지금 `loginFailed`.
  - `IP_POLICY_WARNINGS.nullClientIp` = `클라이언트 IP 를 읽지 못해 막았다 — 코어 옵션 clientIp 와 Express trust proxy 를 확인한다.`
  - `IP_POLICY_WARNINGS.noGlobalRule` = `global 층 IP 규칙이 없다 — 사용자 · 팀 규칙이 없는 계정은 어디서도 들어오지 못한다(README "잠겼을 때").`
  - `whileHeld` 기대 불일치 = `whileHeld: 잠금 대기 기대 ${expectWait} · 실제 ${reached}`
- 테스트: 단위 · DB 없는 HTTP 는 `*.test.ts`(`pnpm check`), 실 MariaDB 는 `*.db.test.ts`(Docker 컨테이너 `admin-kit-test-db` 가 떠 있어야 한다 — `docker ps --filter name=admin-kit-test-db` 로 먼저 본다). 🔴 DB 테스트 하나만 돌리는 명령은 `pnpm --filter @ssworks/admin-server test:db <이름>` — `--` 를 넣으면 거르지 않는다. 단위는 `pnpm --filter @ssworks/admin-server test <이름>` · `pnpm --filter @ssworks/admin-server typecheck` · `pnpm --filter @ssworks/admin-server lint`.
- 🔴 `pnpm test:db` 는 한 번에 하나만 돌린다 — 겹치면 공유 DB 서버의 DDL 부하로 거짓 실패한다.
- 🔴 테스트 본문(`it`)에서 `createTestDatabase()` 를 부르지 않는다 — `beforeAll` · `afterAll` 에서. 스냅샷 Kysely 는 `await snapshotKysely(t, on)` 으로 만들고 `finally` 에서 `destroy()` 한다. 전역 `testTimeout` 은 올리지 않는다.
- 🔴 원시 연결은 `whileHeld` 로만 쥔다(롤백 · 종료를 그 도우미가 한다). 원시 SQL 의 식별자는 snake_case 다(`users` · `user_no` · `resign_at` · `sessions` · `is_revoked`). 기다리는 동안 거부될 수 있는 프로미스는 `settle` 로 받는다.
- 🔴 경합 테스트는 **공개 서비스 메서드**를 거치고 `whileHeld` 의 `expectWait` 를 적는다(Task 1 이후 필수). `information_schema.innodb_trx` 는 쓰지 않는다.
- 🔴 `seedRole(t.db)` 의 기본 권한은 `['*']` 다 — 인증 테스트는 상관없지만 같은 DB 를 쓰는 다른 테스트를 흔들지 않게 새 파일은 `permissions` 를 명시한다.
- 테스트 코드도 린트를 통과한다(쓰이지 않는 변수 · import 없음). `import()` 타입 주석을 쓰지 않는다(`consistent-type-imports`).
- 셸: Windows(Git Bash) · Linux 양쪽. 🔴 출력을 `/dev/null` 로 보내지 않는다(Windows 에 `NUL` 파일이 생긴다). 파일을 python · sed 로 다시 쓰지 않는다(LF).
- 🔴 도구 입력의 백슬래시 이스케이프는 JSON 으로 풀린다 — 새 코드 · 테스트에 백슬래시를 쓰지 않는다. 정규식은 `/ lock in share mode$/` 처럼 백슬래시 없이 적는다. 마크다운의 코드 스팬 안에 백틱이 들면 이중 백틱 스팬을 쓴다.
- 플랜의 코드 블록은 prettier 를 거치지 않았다 — 커밋 전에 바꾼 파일에 `pnpm exec prettier --write <파일…>` 을 돌린다. 긴 마크다운은 두 번 돌리고 `--check` 한다.
- 커밋: 한국어 conventional commits. 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `gh pr merge` · `pnpm release` · `npm publish` · `pnpm stage approve` 는 하지 않는다.

## Review Focus

스펙이 함의하지만 스펙의 테스트 목록이 재지 않는, 사람이 먼저 부딪힐 입력 다섯. 각 줄의 테스트를 담당 Task 에 넣었다.

1. **같은 계정의 동시 로그인(새로 고침 · 여러 탭 · 자동 로그인 다섯)** — 확정 트랜잭션이 users X 로 줄을 서도 모두 200 이고 세션 다섯 · 카운터 0 이다. → Task 5 `auth.race.db.test.ts` "동시 로그인 다섯".
2. **같은 사용자의 회전이 users 공유 잠금을 쥔 동안의 로그인** — 로그인 확정(users X)이 기다렸다 성공한다(교착 없음). → Task 5 "회전 중의 로그인".
3. **같은 사용자의 로그인 확정(users X)이 쥔 동안의 refresh** — 회전이 기다렸다 성공한다. → Task 4 "로그인 확정 중의 refresh".
4. **엣지 오설정으로 주소를 못 읽는 배포(`x-real-ip` 중복 헤더 · 유닉스 소켓)** — 모든 로그인이 401 문구 · 감사 행 `ip` null 이고 서버 로그에 진단 경고가 한 번 남는다. → Task 5 `ip-access.auth.db.test.ts` "중복 헤더" · Task 6 경고.
5. **퇴사 효력 시각이 미래인 계정의 refresh** — 잠근 행으로 판정해도 회전한다(효력 전). → Task 4 `auth.service.refresh.db.test.ts` "퇴사 예정".

## 파일 구조

| 파일                                                                                                                                     | 책임                                                                                 | Task  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----- |
| `test-support/concurrency.ts` · `concurrency.db.test.ts`                                                                                 | `whileHeld` 의 `expectWait`(필수) · `afterReached`                                   | 1     |
| `test-support/errors.ts`(새)                                                                                                             | `failure()` 한 벌                                                                    | 1     |
| `whileHeld` 를 부르는 db 테스트 열하나 · `failure()` 사본 여섯                                                                           | 새 옵션 · 공용 `failure`                                                             | 1     |
| `auth/auth.repository.ts` · `kysely-auth.repository.ts`                                                                                  | `lockCredential` · `writeLoginState`(`updateLoginState` 삭제)                        | 2     |
| `auth/password-check.ts`                                                                                                                 | 카운터 도우미 `updateLoginState(db, repo, …)` · `checkPasswordWithCounter(db, …)`    | 2     |
| `auth/reauth.service.ts` · `test-support/auth.ts`                                                                                        | 재인증이 `KYSELY` 를 받는다 · 키트가 `db` 를 받는다                                  | 2     |
| `auth/kysely-auth.repository.test.ts`(새) · `kysely-auth.repository.db.test.ts` · `password-check.db.test.ts`(새)                        | 잠금 읽기 SQL · 실제 잠금 · 카운터 원자성                                            | 2     |
| `auth/options.ts` · `audit/options.ts`(+ 부르는 곳)                                                                                      | `clientIp` 필수                                                                      | 3     |
| `auth/auth.service.ts`                                                                                                                   | `ipVerdict`(Task 3) · `underUserLock` · refresh · 유예(Task 4) · 로그인 확정(Task 5) | 3~5   |
| `auth/session.store.ts` · `session.store.db.test.ts`                                                                                     | `create(input, trx?)` · `rotate(trx, …)`                                             | 4     |
| `auth/auth.race.db.test.ts`(새) · `auth.service.refresh.db.test.ts`                                                                      | R1 ~ R4 · 회전 순서                                                                  | 4     |
| `auth/errors.ts` · `audit/auth-events.ts`(+ 테스트)                                                                                      | `loginFailedWithIp` · 막힌 로그인 감사 401                                           | 5     |
| `auth/auth.service.login.test.ts`(새) · `auth.service.login.db.test.ts` · `auth.http.db.test.ts` · `ip-access/ip-access.auth.db.test.ts` | 로그인 판정 · L1 · L2                                                                | 5     |
| `ip-access/ip-access.policy.ts` · `ip-access.policy.db.test.ts`(새)                                                                      | 진단 경고 둘                                                                         | 6     |
| `README.md` · `.changeset/admin-server-auth-paths.md` · 스펙 다섯 · `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`                | 문서 · 스모크                                                                        | 2 · 7 |

---

### Task 1: 경합 도우미 — `whileHeld` 의 `expectWait` · `afterReached`, `failure()` 한 벌

**Files:**

- Modify: `packages/admin-server/src/test-support/concurrency.ts`
- Modify: `packages/admin-server/src/test-support/concurrency.db.test.ts`
- Create: `packages/admin-server/src/test-support/errors.ts`
- Modify(`whileHeld` 호출 26곳): `src/accounts/super-admin.db.test.ts` · `src/ip-access/ip-access.race.db.test.ts` · `src/legal/legal.race.db.test.ts` · `src/roles/roles.order.db.test.ts` · `src/roles/roles.snapshot.db.test.ts` · `src/teams/teams.delete.db.test.ts` · `src/teams/teams.move.db.test.ts` · `src/teams/teams.service.db.test.ts` · `src/users/users.employment.db.test.ts` · `src/users/users.snapshot.db.test.ts` · `src/users/users.write.db.test.ts`
- Modify(`failure()` 사본): `src/accounts/super-admin.ip.db.test.ts` · `src/ip-access/ip-access.service.db.test.ts` · `src/ip-access/ip-access.survival.db.test.ts` · `src/teams/teams.delete.db.test.ts` · `src/teams/teams.move.db.test.ts` · `src/teams/teams.service.db.test.ts`

**Interfaces:**

- Produces:
  - `whileHeld<T>(t, hold, during, options: WhileHeldOptions): Promise<WhileHeldResult<T>>` — `options` 필수.
  - `interface WhileHeldOptions { expectWait: boolean; waiters?: number; timeoutMs?: number; afterReached?: (connection: Connection) => Promise<unknown> }`
  - `type WhileHeldResult<T> = Settled<T> & { reached: boolean; afterReached?: Settled<unknown> }` — `afterReached` 는 대기에 닿아 그 문장을 보냈을 때만 있다.
  - `failure(promise: Promise<unknown>): Promise<BusinessError>`(`test-support/errors.ts`)

- [ ] **Step 1: 도우미 테스트를 먼저 고친다**

`packages/admin-server/src/test-support/concurrency.db.test.ts` 의 `describe('whileHeld', …)` 블록 전체를 이것으로 바꾼다(위의 import · `holdWith` · `lockedRead` · `plainRead` 는 그대로):

```ts
describe('whileHeld', () => {
  it('🔴 during 이 잠금을 기다리기 시작하면 곧바로 커밋한다 — 기다린 뒤 커밋된 값을 본다', async () => {
    const started = Date.now()
    const result = await whileHeld(t, holdWith('held-1'), lockedRead, { expectWait: true })
    expect(result).toEqual({ ok: true, value: 'held-1', reached: true })
    // 대기를 못 보면 기본 5초 뒤에야 커밋한다
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('기다리지 않는 during 은 끝나는 대로 커밋한다 — 커밋 전 값을 읽었다', async () => {
    const before = await plainRead()
    const started = Date.now()
    const result = await whileHeld(t, holdWith('held-2'), plainRead, { expectWait: false })
    expect(result).toEqual({ ok: true, value: before, reached: false })
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
      { expectWait: false, timeoutMs: 150 },
    )
    expect(result).toEqual({ ok: true, value: 'held-3', reached: false })
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
      { expectWait: true, waiters: 2 },
    )
    if (!result.ok) throw result.error
    // 첫째는 둘째가 기다리기 시작한(300ms 뒤) 다음에야 풀렸다
    expect(result.value[0]).toBeGreaterThanOrEqual(250)
  })

  it('🔴 expectWait 가 실제와 다르면 던진다 — 쥔 연결은 커밋 · 종료돼 행이 풀려 있다(2f-2a 스펙 A16)', async () => {
    await expect(whileHeld(t, holdWith('held-5'), plainRead, { expectWait: true })).rejects.toThrow(
      'whileHeld: 잠금 대기 기대 true · 실제 false',
    )
    await expect(
      whileHeld(t, holdWith('held-6'), lockedRead, { expectWait: false }),
    ).rejects.toThrow('whileHeld: 잠금 대기 기대 false · 실제 true')
    const started = Date.now()
    expect(await lockedRead()).toBe('held-6')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('🔴 afterReached 는 대기에 닿은 뒤 · 커밋 전에 쥔 연결로 보낸다 — 기다린 쪽이 그 값을 본다', async () => {
    const result = await whileHeld(t, holdWith('held-7'), lockedRead, {
      expectWait: true,
      afterReached: holdWith('after-7'),
    })
    expect(result).toMatchObject({ ok: true, value: 'after-7', reached: true })
    expect(result.afterReached?.ok).toBe(true)
  })

  it('afterReached 는 대기에 닿지 못하면 보내지 않는다', async () => {
    const result = await whileHeld(t, holdWith('held-8'), plainRead, {
      expectWait: false,
      afterReached: holdWith('never-8'),
    })
    expect(result.afterReached).toBeUndefined()
    expect(await plainRead()).toBe('held-8')
  })
})
```

- [ ] **Step 2: RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server typecheck`
Expected: FAIL — `concurrency.db.test.ts` 에서 `expectWait` · `afterReached` 가 `WhileHeldOptions` 에 없다는 TS2353 등.

- [ ] **Step 3: `whileHeld` 를 고친다**

`packages/admin-server/src/test-support/concurrency.ts`:

① 머리 주석의 `// 2f-1(스펙 P15): …` 단락 끝 다음 줄에 더한다:

```ts
// 2f-2a(스펙 A16): whileHeld 의 기대 대기(expectWait)를 필수로 — 결과가 다르면 정리를 마친 뒤 던진다(26 곳이 단언을 빠뜨렸다).
//   afterReached — 대기에 닿은 뒤 · 커밋 전에 쥔 쪽이 다음 문장을 보낸다(2d R10-3: 퇴사가 users 를 잠근 뒤 세션을 끊는 순서).
```

② `export interface WhileHeldOptions { … }` 부터 `whileHeld` 함수 끝(`holdGuard` 의 JSDoc 앞)까지를 이것으로 바꾼다:

```ts
export interface WhileHeldOptions {
  /**
   * 🔴 `during()` 이 잠금 대기에 닿기를 기대하는가 — 필수다. 실제(`reached`)와 다르면 정리를 마친 뒤 던진다. 경합 테스트가
   * 경합 창에 닿았는지 단언을 빠뜨릴 수 없게 한다(2f-2a 스펙 A16).
   */
  expectWait: boolean
  /** 같은 데이터베이스에서 이만큼의 연결이 잠금을 기다리면 커밋한다. 기본 1 */
  waiters?: number
  /** 이 시간 안에 대기를 못 보면 그래도 커밋한다. 기본 5000ms */
  timeoutMs?: number
  /**
   * 대기에 닿은 뒤 · 커밋 전에 쥔 연결로 보낸다 — 쥔 쪽의 "잠근 뒤 다음 문장" 을 재현한다. 닿지 못했으면 보내지 않는다.
   * 이 문장이 던지면(교착 희생자 1213 등) 결과의 `afterReached` 에 담는다 — InnoDB 가 이미 롤백했으니 커밋은 빈 트랜잭션이다.
   */
  afterReached?: (connection: Connection) => Promise<unknown>
}

export type WhileHeldResult<T> = Settled<T> & { reached: boolean; afterReached?: Settled<unknown> }

/**
 * 원시 연결이 트랜잭션을 열고 `hold` 로 잠금 · 쓰기를 쥔 채 `during()` 을 시작한다. 같은 데이터베이스에서 `waiters` 개의 연결이
 * 잠금을 기다리기 시작하면 — 또는 `during()` 이 기다리지 않고 끝나면, 또는 `timeoutMs` 가 지나면 — (`afterReached` 를 보낸 뒤)
 * 그 트랜잭션을 커밋하고 `during()` 의 결과와 대기에 닿았는지(`reached`)를 돌려준다. `reached` 가 `expectWait` 와 다르면 던진다.
 * 🔴 실패해도 롤백 · 종료한다 — 쥔 잠금이 남으면 afterAll 의 DROP DATABASE 가 막힌다. 관찰 연결이 열리다 실패해도 쥔 연결을 닫는다.
 */
export async function whileHeld<T>(
  t: TestDatabase,
  hold: (connection: Connection) => Promise<unknown>,
  during: () => Promise<T>,
  options: WhileHeldOptions,
): Promise<WhileHeldResult<T>> {
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
    const after =
      reached && options.afterReached !== undefined
        ? await settle(options.afterReached(connection))
        : undefined
    await connection.commit()
    const settled = await pending
    if (reached !== options.expectWait) {
      throw new Error(`whileHeld: 잠금 대기 기대 ${options.expectWait} · 실제 ${reached}`)
    }
    return after === undefined
      ? { ...settled, reached }
      : { ...settled, reached, afterReached: after }
  } finally {
    await connection.rollback().catch(() => undefined)
    await connection.end()
    await observer?.end()
  }
}
```

- [ ] **Step 4: 도우미 GREEN**

Run: `pnpm --filter @ssworks/admin-server test:db concurrency`
Expected: PASS — `whileHeld` 일곱 · `underHeld` · `snapshotKysely` 그대로.

- [ ] **Step 5: 호출 26곳에 `expectWait` 를 적는다**

규칙: `whileHeld(` 의 넷째 인자가 없으면 `{ expectWait: true }` 를 더하고, 이미 있으면(`{ waiters: 2 }`) 그 객체 첫 칸에 `expectWait: true,` 를 더한다. **예외 하나 — `src/teams/teams.move.db.test.ts` 의 `(b2) 같은 상황의 사용자 목록(하위 팀 포함)은 …` 테스트(비잠금 목록 읽기)는 `{ expectWait: false }`** 다(스펙 §14 R1-⑥).

| 파일                                  | 테스트(앞부분)                                                     | 넷째 인자                             |
| ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `accounts/super-admin.db.test.ts`     | 🔴 잠금 단계가 기다린 사이 커밋된 대상의 변경을 …                  | `{ expectWait: true }`                |
| `ip-access/ip-access.race.db.test.ts` | (r1a) · (r1b) · 대상 사용자의 로그인 실패가 …                      | `{ expectWait: true }` 셋             |
| `ip-access/ip-access.race.db.test.ts` | 각자는 자기 잠금을 통과하는 삭제 둘 …                              | `{ expectWait: true, waiters: 2 }`    |
| `legal/legal.race.db.test.ts`         | (r1) · (r2)                                                        | `{ expectWait: true, waiters: 2 }` 둘 |
| `legal/legal.race.db.test.ts`         | (s1) 원시 연결이 발행자 users 행을 바꾼 채 …                       | `{ expectWait: true }`                |
| `roles/roles.order.db.test.ts`        | 🔴 커밋 전 다른 만들기가 있으면 …                                  | `{ expectWait: true }`                |
| `roles/roles.snapshot.db.test.ts`     | 권한 수정 · 삭제 · 다른 기본 역할 잠금                             | `{ expectWait: true }` 셋             |
| `teams/teams.delete.db.test.ts`       | (a1) · (a2) 두 곳                                                  | `{ expectWait: true }` 셋             |
| `teams/teams.move.db.test.ts`         | (b1) · (s1)                                                        | `{ expectWait: true }` 둘             |
| `teams/teams.move.db.test.ts`         | (c1)                                                               | `{ expectWait: true, waiters: 2 }`    |
| `teams/teams.move.db.test.ts`         | **(b2)**                                                           | **`{ expectWait: false }`**           |
| `teams/teams.service.db.test.ts`      | 동시 만들기 둘(같은 상위 팀) · (최상위)                            | `{ expectWait: true, waiters: 2 }` 둘 |
| `users/users.employment.db.test.ts`   | 🔴 퇴사가 대상 잠금을 기다리는 동안 재입사가 …                     | `{ expectWait: true }`                |
| `users/users.snapshot.db.test.ts`     | 🔴 퇴사 — 대상의 로그인 실패가 … · 🔴 역할 변경 — 같은 팀의 이름 … | `{ expectWait: true }` 둘             |
| `users/users.write.db.test.ts`        | 만들기 — 줄 역할이 … · 역할 변경 — 줄 역할이 …                     | `{ expectWait: true }` 둘             |

`ip-access/ip-access.race.db.test.ts` 의 `expect(result.reached).toBe(true)` 네 줄은 지운다(도우미가 잰다).

확인: `grep -rn "whileHeld(" packages/admin-server/src --include=*.db.test.ts | grep -v test-support | wc -l` 이 26 이고, 각 호출의 넷째 인자에 `expectWait` 가 있다(`pnpm --filter @ssworks/admin-server typecheck` 가 빠진 곳을 TS2554 로 알려 준다).

- [ ] **Step 6: `failure()` 를 한 곳으로 모은다**

`packages/admin-server/src/test-support/errors.ts`(새):

```ts
import { BusinessError } from '@ssworks/admin-shared'
import { expect } from 'vitest'

// 테스트 전용 — 거부를 기대하는 프로미스에서 BusinessError 를 꺼낸다. 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 2f-2a(스펙 A17): db 테스트 여섯 곳의 같은 사본을 모았다.

export async function failure(promise: Promise<unknown>): Promise<BusinessError> {
  const error = await promise.then(
    () => {
      throw new Error('실패를 기대했다')
    },
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BusinessError)
  return error as BusinessError
}
```

여섯 파일(`accounts/super-admin.ip.db.test.ts` · `ip-access/ip-access.service.db.test.ts` · `ip-access/ip-access.survival.db.test.ts` · `teams/teams.delete.db.test.ts` · `teams/teams.move.db.test.ts` · `teams/teams.service.db.test.ts`)에서 `async function failure(promise: Promise<unknown>): Promise<BusinessError> { … }` 정의를 지우고 `import { failure } from '../test-support/errors.js'` 를 더한다. `BusinessError` 를 그 파일의 다른 곳에서 쓰지 않게 되면 그 import 도 지운다(`pnpm --filter @ssworks/admin-server lint` 가 알려 준다).

- [ ] **Step 7: 전량 GREEN**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint && pnpm --filter @ssworks/admin-server test:db`
Expected: PASS — DB 테스트 수는 이 Task 전보다 셋 많다(도우미 테스트 셋). `expectWait` 가 틀린 곳이 있으면 `whileHeld: 잠금 대기 기대 …` 로 실패한다 — 그 테스트의 의도(제목 · 단언)를 읽고 고친다. 🔴 값을 뒤집어 맞추기 전에 그 테스트가 정말 기다리지 않는 장면인지 보고서에 적는다.

- [ ] **Step 8: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/test-support packages/admin-server/src/accounts packages/admin-server/src/ip-access packages/admin-server/src/legal packages/admin-server/src/roles packages/admin-server/src/teams packages/admin-server/src/users
git add packages/admin-server/src
git commit -m "test(admin-server): whileHeld 기대 대기 필수 · afterReached, failure() 한 벌 — 2f-2a" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 리포지토리 trx 원시 · 카운터 도우미 · 재인증

**Files:**

- Modify: `packages/admin-server/src/auth/auth.repository.ts`
- Modify: `packages/admin-server/src/auth/kysely-auth.repository.ts`
- Modify: `packages/admin-server/src/auth/password-check.ts`
- Modify: `packages/admin-server/src/auth/reauth.service.ts`
- Modify: `packages/admin-server/src/auth/auth.service.ts`(호출 셋)
- Modify: `packages/admin-server/src/test-support/auth.ts`
- Create: `packages/admin-server/src/auth/kysely-auth.repository.test.ts`
- Create: `packages/admin-server/src/auth/password-check.db.test.ts`
- Modify: `packages/admin-server/src/auth/kysely-auth.repository.db.test.ts`
- Modify: `packages/admin-server/README.md`("### 사용자 테이블이 다를 때")

**Interfaces:**

- Consumes: Task 1 `whileHeld(…, { expectWait })`.
- Produces:
  - `AdminAuthRepository.lockCredential(trx: Transaction<AdminDatabase>, userNo: bigint, mode: 'share' | 'update'): Promise<AdminCredential | null>`
  - `AdminAuthRepository.writeLoginState(trx: Transaction<AdminDatabase>, userNo: bigint, state: AdminLoginState): Promise<void>`
  - `AdminAuthRepository.updateLoginState` — 없다.
  - `updateLoginState(db: Kysely<AdminDatabase>, repo: AdminAuthRepository, userNo: bigint, next: (current: AdminLoginState) => AdminLoginState): Promise<AdminLoginState>`(`auth/password-check.ts`)
  - `checkPasswordWithCounter(db, repo, credential, password, now, lockout): Promise<PasswordCheck>`
  - `new AdminReauthService(config, repo, db)`
  - `createAuthKit(t, { auth?, policy?, db? })` — `db` 를 주면 리포지토리 · 세션 저장소 · 서비스 · 재인증이 그 Kysely 를 쓴다.

- [ ] **Step 1: 잠금 읽기 SQL 단위 테스트를 쓴다**

`packages/admin-server/src/auth/kysely-auth.repository.test.ts`(새):

```ts
import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { adminKyselyPlugins } from '../database/kysely.js'
import type { AdminDatabase } from '../database/types.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'

// 🔴 잠금 읽기의 SQL 끝을 잰다(2f-2a 스펙 A9 · §14 R1-⑤) — MariaDB 11.4 는 FOR SHARE 를 1064 로 거부한다. Kysely forShare() 로
//    돌아가면 모든 토큰 회전이 500 이 된다. 앱과 같은 플러그인(CamelCasePlugin)을 건다.

function recordingDb(sqls: string[]): Kysely<AdminDatabase> {
  return new Kysely<AdminDatabase>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (kysely) => new MysqlIntrospector(kysely),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
    plugins: adminKyselyPlugins(),
    log: (event) => {
      if (event.level === 'query') sqls.push(event.query.sql)
    },
  })
}

describe('KyselyAuthRepository — 잠금 읽기 · 카운터 쓰기 SQL', () => {
  it.each([
    ['share', / lock in share mode$/],
    ['update', / for update$/],
  ] as const)('lockCredential(%s)', async (mode, ending) => {
    const sqls: string[] = []
    const db = recordingDb(sqls)
    const repo = new KyselyAuthRepository(db)
    const row = await db.transaction().execute((trx) => repo.lockCredential(trx, 7n, mode))
    expect(row).toBeNull()
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toMatch(ending)
    expect(sqls[0]).not.toContain('for share')
    expect(sqls[0]).toContain('from `users` where `user_no` = ?')
  })

  it('writeLoginState 는 잠금 두 컬럼만 쓴다', async () => {
    const sqls: string[] = []
    const db = recordingDb(sqls)
    const repo = new KyselyAuthRepository(db)
    await db
      .transaction()
      .execute((trx) => repo.writeLoginState(trx, 7n, { loginFailCount: 3, lockUntil: null }))
    expect(sqls).toEqual([
      'update `users` set `login_fail_count` = ?, `lock_until` = ? where `user_no` = ?',
    ])
  })
})
```

- [ ] **Step 2: 카운터 도우미 DB 테스트를 쓴다(리포지토리 테스트에서 옮긴다)**

`packages/admin-server/src/auth/password-check.db.test.ts`(새):

```ts
import type { KyselyPlugin } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'
import { updateLoginState } from './password-check.js'

// 카운터의 원자성은 패키지가 맡는다(2f-2a 스펙 A10 — 2b 스펙 §14 R8 을 리포지토리에서 옮겼다).

let t: TestDatabase
let roleNo: bigint
let repo: KyselyAuthRepository

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db, { roleName: '카운터', permissions: ['user:read'] })
  repo = new KyselyAuthRepository(t.db)
})

afterAll(async () => {
  await t?.drop()
})

describe('updateLoginState(db, repo, …)', () => {
  it('next 는 현재 행 값을 받고, 돌려준 상태가 저장된다', async () => {
    const user = await seedUser(t.db, { roleNo, loginFailCount: 2 })
    const lockUntil = new Date('2031-02-03T04:05:06.000Z')
    const state = await updateLoginState(t.db, repo, user.userNo, (current) => ({
      loginFailCount: current.loginFailCount + 1,
      lockUntil,
    }))
    expect(state).toEqual({ loginFailCount: 3, lockUntil })
    expect(await repo.findCredentialByNo(user.userNo)).toMatchObject({
      loginFailCount: 3,
      lockUntil,
    })
  })

  it('🔴 병렬 8건이 모두 센다 — lockCredential(update) 행 잠금(2b F2)', async () => {
    const user = await seedUser(t.db, { roleNo })
    await Promise.all(
      Array.from({ length: 8 }, () =>
        updateLoginState(t.db, repo, user.userNo, (current) => ({
          loginFailCount: current.loginFailCount + 1,
          lockUntil: null,
        })),
      ),
    )
    expect((await repo.findCredentialByNo(user.userNo))?.loginFailCount).toBe(8)
  })

  it('next 가 값을 바꾸지 않으면 UPDATE 를 보내지 않는다 — 카운터가 이미 { 0, null } 인 정상 경로', async () => {
    const user = await seedUser(t.db, { roleNo })
    const kinds: string[] = []
    const recorder: KyselyPlugin = {
      transformQuery: (args) => {
        kinds.push(args.node.kind)
        return args.node
      },
      transformResult: async (args) => args.result,
    }
    const recorded = t.db.withPlugin(recorder)

    const unchanged = await updateLoginState(recorded, repo, user.userNo, (current) => ({
      ...current,
    }))
    expect(unchanged).toEqual({ loginFailCount: 0, lockUntil: null })
    expect(kinds).toEqual(['SelectQueryNode'])

    kinds.length = 0
    const lockUntil = new Date('2031-02-03T04:05:06.000Z')
    await updateLoginState(recorded, repo, user.userNo, () => ({ loginFailCount: 5, lockUntil }))
    expect(kinds).toEqual(['SelectQueryNode', 'UpdateQueryNode'])

    // 같은 순간을 담은 다른 Date 객체도 "바뀌지 않음" 이다
    kinds.length = 0
    await updateLoginState(recorded, repo, user.userNo, (current) => ({
      loginFailCount: current.loginFailCount,
      lockUntil: new Date(lockUntil.getTime()),
    }))
    expect(kinds).toEqual(['SelectQueryNode'])
  })

  it('없는 사용자는 next({ 0, null }) 를 돌려주고 아무것도 쓰지 않는다', async () => {
    const state = await updateLoginState(t.db, repo, 999_999n, (current) => ({
      loginFailCount: current.loginFailCount + 1,
      lockUntil: null,
    }))
    expect(state).toEqual({ loginFailCount: 1, lockUntil: null })
    expect(await repo.findCredentialByNo(999_999n)).toBeNull()
  })
})
```

- [ ] **Step 3: 리포지토리 DB 테스트를 고친다**

`packages/admin-server/src/auth/kysely-auth.repository.db.test.ts`:

① `describe('updateLoginState', () => { … })` 블록 전체를 지우고 그 자리에 이것을 둔다(위 import 에 `whileHeld` · `runWriteTransaction` 이 없으면 더한다 — `import { whileHeld } from '../test-support/concurrency.js'` · `import { runWriteTransaction } from '../database/run.js'`. 이제 쓰이지 않는 `KyselyPlugin` import 는 지운다):

```ts
describe('lockCredential · writeLoginState(2f-2a 스펙 A9 · A10)', () => {
  const lockFor = (userNo: bigint, mode: 'share' | 'update') => () =>
    runWriteTransaction(t.db, (trx) => repo.lockCredential(trx, userNo, mode))

  it('자격 증명 행을 돌려준다 — 없으면 null', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo, loginFailCount: 2 })
    expect(await lockFor(user.userNo, 'share')()).toEqual(
      await repo.findCredentialByNo(user.userNo),
    )
    expect(await lockFor(999_999n, 'update')()).toBeNull()
  })

  it.each(['share', 'update'] as const)(
    '🔴 %s 는 잠금 읽기다 — 원시 연결이 행을 FOR UPDATE 로 쥔 동안 기다린다',
    async (mode) => {
      const roleNo = await seedRole(t.db)
      const user = await seedUser(t.db, { roleNo })
      const result = await whileHeld(
        t,
        (connection) =>
          connection.query('select user_no from users where user_no = ? for update', [user.userNo]),
        lockFor(user.userNo, mode),
        { expectWait: true },
      )
      expect(result.ok).toBe(true)
    },
  )

  it("🔴 'share' 끼리는 막지 않고 'update' 는 막힌다 — 원시 연결이 LOCK IN SHARE MODE 로 쥐었을 때", async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo })
    const holdShared = (connection: Connection) =>
      connection.query('select user_no from users where user_no = ? lock in share mode', [
        user.userNo,
      ])
    expect(
      (await whileHeld(t, holdShared, lockFor(user.userNo, 'share'), { expectWait: false })).ok,
    ).toBe(true)
    expect(
      (await whileHeld(t, holdShared, lockFor(user.userNo, 'update'), { expectWait: true })).ok,
    ).toBe(true)
  })

  it('writeLoginState 는 잠금 두 컬럼만 바꾼다', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo })
    const before = await repo.findCredentialByNo(user.userNo)
    const lockUntil = new Date('2031-02-03T04:05:06.000Z')
    await runWriteTransaction(t.db, async (trx) => {
      await repo.lockCredential(trx, user.userNo, 'update')
      await repo.writeLoginState(trx, user.userNo, { loginFailCount: 4, lockUntil })
    })
    expect(await repo.findCredentialByNo(user.userNo)).toEqual({
      ...before,
      loginFailCount: 4,
      lockUntil,
    })
  })
})
```

`Connection` 타입이 필요하면 `import type { Connection } from 'mariadb'` 를 더한다.

② `describe('🔴 updateAt(2d 스펙 ⑧ U1)', …)` 안의 `await repo.updateLoginState(user.userNo, () => ({ loginFailCount: 5, lockUntil: new Date(Date.now() + 60_000) }))` 를 이것으로 바꾼다:

```ts
await runWriteTransaction(t.db, async (trx) => {
  await repo.lockCredential(trx, user.userNo, 'update')
  await repo.writeLoginState(trx, user.userNo, {
    loginFailCount: 5,
    lockUntil: new Date(Date.now() + 60_000),
  })
})
```

- [ ] **Step 4: RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server typecheck`
Expected: FAIL — `lockCredential` · `writeLoginState` 가 `KyselyAuthRepository` 에 없다, `updateLoginState` 가 `password-check.js` 에서 export 되지 않는다.

- [ ] **Step 5: 인터페이스를 고친다**

`packages/admin-server/src/auth/auth.repository.ts`:

① 머리 주석 `// 바꾼 점:` 단락 끝에 줄을 더한다:

```ts
// 2f-2a(스펙 ③ P1 · A9 · A10): updateLoginState 를 지우고 트랜잭션을 받는 원시 둘(lockCredential · writeLoginState)을 더했다 —
//   로그인 확정 · 회전이 users 를 세션보다 먼저 같은 트랜잭션에서 잠가야 한다(2d R10-3 · 로그인 TOCTOU). 카운터 원자성은 패키지
//   도우미(password-check.ts updateLoginState)가 맡는다.
```

② 첫 import 를 `import type { Transaction } from 'kysely'` 그대로 두고, 인터페이스의 `updateLoginState(…)` 선언(JSDoc 포함)을 지운 뒤 `findPrincipal` 다음에 이것을 둔다:

```ts
  /**
   * 🔴 받은 트랜잭션 위의 **잠금 읽기** — `'update'` = `FOR UPDATE`, `'share'` = `LOCK IN SHARE MODE`(MariaDB 는 `FOR SHARE` 를
   * 받지 않는다 — Kysely `.forShare()` 를 쓰지 않는다). 잠그는 행은 sessions FK(`fkSessionsUser`)가 가리키는 그 users 행이다 —
   * 로그인 확정 · 토큰 회전이 이 잠금을 세션보다 먼저 잡아 퇴사 · 초기화와 교착하지 않는다(2f-2a 스펙 §5-3). 없으면 null.
   */
  lockCredential(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    mode: 'share' | 'update',
  ): Promise<AdminCredential | null>
  /**
   * 잠금 두 컬럼(`loginFailCount` · `lockUntil`)만 쓴다. 🔴 패키지가 같은 트랜잭션에서 먼저 `lockCredential(…, 'update')` 로
   * 잠근다 — 카운터의 원자성은 패키지가 맡는다(2b 스펙 §14 R8 · 2f-2a 스펙 A10).
   */
  writeLoginState(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    state: AdminLoginState,
  ): Promise<void>
```

- [ ] **Step 6: Kysely 구현을 고친다**

`packages/admin-server/src/auth/kysely-auth.repository.ts`:

① import 줄을 바꾼다: `import type { Kysely, Transaction } from 'kysely'` → `import { sql, type Kysely, type Transaction } from 'kysely'`, `import { runQuery, runWriteTransaction } from '../database/run.js'` → `import { runQuery } from '../database/run.js'`.

② 머리 주석 `// 바꾼 점:` 끝에 더한다:

```ts
//  - 2f-2a: updateLoginState(자체 트랜잭션) 대신 받은 트랜잭션 위의 lockCredential · writeLoginState(스펙 A9 · A10).
```

③ `findCredentialByUserId` · `findCredentialByNo` 의 `this.credentialQuery()` 를 `credentialQuery(this.db)` 로 바꾸고, 클래스 안의 `updateLoginState(…) { … }` 메서드와 `private credentialQuery() { … }` 를 지운 뒤 `changePassword` 앞에 둘을 둔다:

```ts
  async lockCredential(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    mode: 'share' | 'update',
  ): Promise<AdminCredential | null> {
    // 트랜잭션 안이라 runQuery 로 감싸지 않는다 — runWriteTransaction 이 드라이버 오류를 바꾼다.
    const query = credentialQuery(trx).where('userNo', '=', userNo)
    // 🔴 MariaDB 11.4 는 FOR SHARE 를 1064 로 거부한다(2f-2a 스펙 §14 R1-⑤) — forShare() 를 쓰지 않는다.
    const locked = mode === 'update' ? query.forUpdate() : query.modifyEnd(sql`lock in share mode`)
    return (await locked.executeTakeFirst()) ?? null
  }

  async writeLoginState(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    state: AdminLoginState,
  ): Promise<void> {
    await trx
      .updateTable('users')
      .set({ loginFailCount: state.loginFailCount, lockUntil: state.lockUntil })
      .where('userNo', '=', userNo)
      .execute()
  }
```

④ 파일 끝의 `isSameLoginState` 함수를 지우고 그 자리에 모듈 함수를 둔다:

```ts
/** 자격 증명 여섯 칸 — 비잠금 읽기 둘과 잠금 읽기가 같은 모양을 읽는다 */
function credentialQuery(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('users')
    .select([
      'userNo',
      'password as passwordHash',
      'resignAt',
      'loginFailCount',
      'lockUntil',
      'isPasswordChangeRequired',
    ])
}
```

- [ ] **Step 7: 카운터 도우미를 쓴다**

`packages/admin-server/src/auth/password-check.ts` 를 이것으로 바꾼다:

```ts
import type { Kysely } from 'kysely'
import { runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import type { AdminAuthRepository, AdminCredential } from './auth.repository.js'
import { nextLoginState, type AdminLoginState, type LoginLockout } from './login-policy.js'
import { verifyPassword } from './password.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.service.ts login(틀리면 카운터) · admin-password.service.ts
//       (비밀번호 변경도 셈)
// 바꾼 점: 로그인 · 비밀번호 변경 · 재인증 세 자리가 이 함수 하나로 같은 카운터를 쓴다(스펙 B2 — gise 는 재인증을 세지
//   않았다). 세션을 쥔 사람이 재인증 붙은 쓰기를 비밀번호 대입 경로로 쓰지 못하게 한다.
//   2f-2a(스펙 A10): 원자적 카운터 쓰기(updateLoginState)를 리포지토리에서 이리로 옮겼다 — 리포지토리는 트랜잭션을 받는 원시만 낸다.

export type PasswordCheck = { ok: true } | { ok: false; state: AdminLoginState }

/**
 * 🔴 실패 카운터를 원자적으로 바꾼다 — 행을 잠그고(`lockCredential` 'update') 현재 값에서 `next` 를 셈해 바뀌었을 때만 쓴다.
 * 호출부가 검증 전에 읽은 스냅숏으로 셈하면 병렬 요청이 덜 센다(2b 최종 리뷰 F2). 행이 없으면 쓰지 않고 `next({ 0, null })` 를
 * 돌려준다. 🔴 argon2 를 이 안에서 부르지 않는다 — 호출부가 검증을 끝낸 뒤에 부른다.
 */
export function updateLoginState(
  db: Kysely<AdminDatabase>,
  repo: AdminAuthRepository,
  userNo: bigint,
  next: (current: AdminLoginState) => AdminLoginState,
): Promise<AdminLoginState> {
  return runWriteTransaction(db, async (trx) => {
    const locked = await repo.lockCredential(trx, userNo, 'update')
    if (locked == null) return next({ loginFailCount: 0, lockUntil: null })
    const current = { loginFailCount: locked.loginFailCount, lockUntil: locked.lockUntil }
    const state = next(current)
    // 바뀌지 않으면 쓰지 않는다 — 카운터가 이미 { 0, null } 인 정상 경로가 매번 UPDATE 를 치르지 않게(2b 스펙 §14 R8).
    if (!isSameLoginState(state, current)) await repo.writeLoginState(trx, userNo, state)
    return state
  })
}

/**
 * 🔴 트랜잭션 밖에서 부른다(argon2 — 스펙 Global Constraints). 틀리면 실패 상태를 저장하고 그 상태를 돌려준다.
 * 맞았을 때 카운터를 되돌리는 것은 호출부 몫이다 — 로그인은 확정 트랜잭션에서 잠근 행으로(2f-2a 스펙 A2), 재인증은 남아
 * 있을 때만(needsReset), 비밀번호 변경은 changePassword 가 함께 쓴다.
 */
export async function checkPasswordWithCounter(
  db: Kysely<AdminDatabase>,
  repo: AdminAuthRepository,
  credential: AdminCredential,
  password: string,
  now: Date,
  lockout: LoginLockout,
): Promise<PasswordCheck> {
  if (await verifyPassword(credential.passwordHash, password)) return { ok: true }
  // 🔴 원자적으로 센다(최종 리뷰 F2) — credential 은 검증 전 스냅숏이라 다음 상태를 거기서 셈하지 않는다.
  const state = await updateLoginState(db, repo, credential.userNo, (current) =>
    nextLoginState(current, 'fail', now, lockout),
  )
  return { ok: false, state }
}

/** 같은 순간을 담은 다른 Date 객체도 같다고 본다 — `next` 가 잠금 시각을 새로 만들어 돌려줄 수 있다. */
function isSameLoginState(a: AdminLoginState, b: AdminLoginState): boolean {
  return a.loginFailCount === b.loginFailCount && a.lockUntil?.getTime() === b.lockUntil?.getTime()
}
```

- [ ] **Step 8: 부르는 곳을 고친다**

① `packages/admin-server/src/auth/reauth.service.ts`:

- import 에 더한다: `import type { Kysely } from 'kysely'` · `import type { AdminDatabase } from '../database/types.js'`. `import { ADMIN_AUTH_CONFIG, AUTH_REPOSITORY } from '../tokens.js'` 를 `import { ADMIN_AUTH_CONFIG, AUTH_REPOSITORY, KYSELY } from '../tokens.js'` 로, `import { checkPasswordWithCounter } from './password-check.js'` 를 `import { checkPasswordWithCounter, updateLoginState } from './password-check.js'` 로.
- 머리 주석 `// 바꾼 점:` 끝에 `//  - 2f-2a(스펙 A11): 카운터 트랜잭션을 위해 KYSELY 를 받는다 — 리포지토리는 트랜잭션을 열지 않는다.` 를 더한다.
- 생성자를 바꾼다:

```ts
  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
    @Inject(AUTH_REPOSITORY) private readonly repo: AdminAuthRepository,
    /** 카운터 트랜잭션(2f-2a 스펙 A11) */
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
  ) {}
```

- `checkPasswordWithCounter(` 호출의 인자 맨 앞(`this.repo,` 앞)에 `this.db,` 를 더한다.
- `await this.repo.updateLoginState(credential.userNo, (current) =>` 를 `await updateLoginState(this.db, this.repo, credential.userNo, (current) =>` 로.

② `packages/admin-server/src/auth/auth.service.ts`(동작은 그대로 — 로그인 재작성은 Task 5):

- `import { checkPasswordWithCounter } from './password-check.js'` → `import { checkPasswordWithCounter, updateLoginState } from './password-check.js'`.
- `checkPasswordWithCounter(` 호출 둘(로그인 · 비밀번호 변경)의 인자 맨 앞에 `this.db,` 를 더한다.
- 로그인의 `const settled = await this.repo.updateLoginState(credential.userNo, (current) =>` 를 `const settled = await updateLoginState(this.db, this.repo, credential.userNo, (current) =>` 로.

③ `packages/admin-server/src/test-support/auth.ts` 의 `createAuthKit` 를 바꾼다(import 에 `import type { Kysely } from 'kysely'` 는 이미 있다):

```ts
/**
 * Nest 없이 서비스를 조립한다. `policy: false` 면 정책을 주입하지 않는다. `db` 를 주면(스냅샷 격리 Kysely 등) 리포지토리 · 세션
 * 저장소 · 서비스 · 재인증이 모두 그 Kysely 를 쓴다(2f-2a 스펙 §14 R2-⑨).
 */
export function createAuthKit(
  t: TestDatabase,
  options: { auth?: Partial<AdminAuthOptions>; policy?: boolean; db?: Kysely<AdminDatabase> } = {},
): AuthKit {
  const db = options.db ?? t.db
  const config = resolveAuthConfig({ jwtSecret: TEST_JWT_SECRET, ...options.auth }, undefined)
  const repo = new KyselyAuthRepository(db)
  const store = new AdminSessionStore(db)
  const tokens = new AdminAccessTokenService(config)
  const events = new RecordingEvents()
  const policy = new SwitchablePolicy()
  const service = new AdminAuthService(
    config,
    repo,
    store,
    tokens,
    db,
    options.policy === false ? undefined : policy,
    events,
  )
  return {
    config,
    repo,
    store,
    tokens,
    service,
    reauth: new AdminReauthService(config, repo, db),
    events,
    policy,
  }
}
```

- [ ] **Step 9: README "사용자 테이블이 다를 때" 를 고친다**

`packages/admin-server/README.md`:

- `컬럼 매핑 옵션은 없다.` 로 시작하는 줄의 `다섯 메서드` → `여섯 메서드`.
- 코드 블록의 `// findCredentialByUserId · findCredentialByNo · findPrincipal · updateLoginState · changePassword` → `// findCredentialByUserId · findCredentialByNo · findPrincipal · lockCredential · writeLoginState · changePassword`.
- 코드 블록 아래 `🔴` 로 시작해 `updateLoginState` 의 원자성과 `changePassword` 의 `trx` 를 말하는 줄 전체를 이것으로 바꾼다:

```md
🔴 `lockCredential(trx, userNo, mode)` 는 받은 트랜잭션 위의 **잠금 읽기**다 — `'update'` 는 `FOR UPDATE`, `'share'` 는 `LOCK IN SHARE MODE`(MariaDB 는 `FOR SHARE` 를 받지 않는다 — Kysely `.forShare()` 를 쓰지 않는다). 잠그는 행은 `sessions.user_no` FK 가 가리키는 그 `users` 행이다 — 로그인 확정 · 토큰 회전이 이 잠금을 세션보다 먼저 잡아 퇴사 · 비밀번호 초기화와 교착하지 않는다. `writeLoginState` 는 잠금 두 컬럼(`loginFailCount` · `lockUntil`)만 쓴다 — 패키지가 같은 트랜잭션에서 먼저 `lockCredential(…, 'update')` 로 잠그므로 카운터의 원자성은 패키지가 맡는다. 받는 `trx` 는 `Transaction<AdminDatabase>` 라 자기 Database 타입으로 단언해 쓴다.
```

- [ ] **Step 10: GREEN**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint && pnpm --filter @ssworks/admin-server test kysely-auth && pnpm --filter @ssworks/admin-server test:db kysely-auth password-check auth.service`
Expected: PASS. 🔴 RED 실험: `lockCredential` 의 ``query.modifyEnd(sql`lock in share mode`)`` 를 `query.forShare()` 로 바꾸면 단위 테스트 `lockCredential(share)` 가 `for share` 로 실패한다 — 보고서에 붙이고 되돌린다.

- [ ] **Step 11: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/test-support/auth.ts packages/admin-server/README.md
git add packages/admin-server/src packages/admin-server/README.md
git commit -m "refactor(admin-server): 리포지토리 trx 원시 lockCredential · writeLoginState, 카운터 원자성은 패키지 도우미 — 2f-2a" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: IP 판정 도우미 하나 · `clientIp` 인자 필수

동작을 바꾸지 않는 정리다 — 기존 테스트가 그대로 초록이어야 한다.

**Files:**

- Modify: `packages/admin-server/src/auth/options.ts` · `packages/admin-server/src/audit/options.ts`
- Modify(부르는 곳): `src/auth/admin-auth.module.ts`(이미 넷을 넘긴다 — 확인만) · `src/audit/audit.module.ts`(확인만) · `src/test-support/auth.ts` · `src/auth/access-token.service.test.ts` · `src/auth/auth.guard.test.ts` · `src/auth/cookies.test.ts` · `src/auth/options.test.ts` · `src/auth/permission.guard.test.ts` · `src/audit/audit.interceptor.test.ts` · `src/audit/auth-events.test.ts` · `src/audit/options.test.ts`
- Modify: `packages/admin-server/src/auth/auth.service.ts`

**Interfaces:**

- Consumes: Task 2.
- Produces:
  - `resolveAuthConfig(auth, passwordPolicy, permissions: AdminPermissionMap | undefined, clientIp: unknown): ResolvedAuthConfig` — 넷 다 필수.
  - `resolveAuditConfig(options, clientIp: unknown): ResolvedAuditConfig` — 둘 다 필수.
  - `AdminAuthService` 의 비공개 `ipVerdict(userNo: bigint, req: Request, teamNo?: bigint | null): Promise<IpVerdict>`, `type IpVerdict = { allowed: true } | { allowed: false; clientIp: string | null }`.

- [ ] **Step 1: 시그니처를 먼저 바꾸고 RED 를 본다**

`packages/admin-server/src/auth/options.ts` 의 `resolveAuthConfig` 머리를 바꾼다:

```ts
/**
 * 코어 옵션의 `auth` · `passwordPolicy` · `permissions` · `clientIp` 를 해석한다. 🔴 메시지에는 옵션 이름만 담는다 — 비밀키 값을
 * 싣지 않는다. 🔴 인자는 모두 필수다(2f-2a 스펙 A14) — 모듈 팩토리가 `clientIp` 를 빠뜨리면 조용히 'req.ip' 로 떨어진다.
 */
export function resolveAuthConfig(
  auth: AdminAuthOptions | undefined,
  passwordPolicy: PasswordPolicy | undefined,
  permissions: AdminPermissionMap | undefined,
  clientIp: unknown,
): ResolvedAuthConfig {
```

`packages/admin-server/src/audit/options.ts`:

```ts
/** 🔴 `clientIp` 는 필수다(2f-2a 스펙 A14) — 감사 행 ip 가 인증과 다른 출처를 보면 안 된다 */
export function resolveAuditConfig(
  options: AdminAuditOptions | undefined,
  clientIp: unknown,
): ResolvedAuditConfig {
```

Run: `pnpm --filter @ssworks/admin-server typecheck`
Expected: FAIL — TS2554(Expected 4 arguments · Expected 2 arguments) 가 테스트 파일들에 난다. 모듈 팩토리 둘(`admin-auth.module.ts` · `audit.module.ts`)에는 나지 않는다 — 이미 넘긴다.

- [ ] **Step 2: 부르는 곳을 고친다**

TS2554 가 난 자리마다 빠진 뒤쪽 인자를 `undefined` 로 채운다. 예:

- `resolveAuthConfig({ jwtSecret: secret }, undefined)` → `resolveAuthConfig({ jwtSecret: secret }, undefined, undefined, undefined)`
- `resolveAuthConfig(auth, undefined, undefined, 'x-real-ip')` — 그대로(이미 넷)
- `resolveAuthConfig({ jwtSecret: 's'.repeat(32) }, undefined, { … })`(permission.guard.test.ts 131) → 뒤에 `, undefined`
- `resolveAuditConfig(undefined)` → `resolveAuditConfig(undefined, undefined)`
- `resolveAuditConfig({ catalog, secretKeys: [...] })` → 뒤에 `, undefined`
- `test-support/auth.ts` 의 `resolveAuthConfig({ jwtSecret: TEST_JWT_SECRET, ...options.auth }, undefined)` → `…, undefined, undefined, undefined)`

Run: `pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS.

- [ ] **Step 3: IP 판정 도우미로 블록 넷을 모은다**

`packages/admin-server/src/auth/auth.service.ts`:

① `export interface AdminTokenPair { … }` 다음에 둔다:

```ts
/** IP 판정 하나의 결과(2f-2a 스펙 A13) — 판정만 담는다. 이벤트 · 오류는 부른 쪽이 낸다 */
type IpVerdict = { allowed: true } | { allowed: false; clientIp: string | null }
```

② 클래스의 `private newSession(` 앞에 메서드를 둔다:

```ts
  /**
   * IP 판정 하나(2f-2a 스펙 A13) — 로그인 · 가드 · refresh · 유예 발급이 부른다. 정책이 없으면(IP 모듈 없음) 늘 허용.
   * 대표 팀은 `teamNo` 를 주면 그것(가드 — 이미 읽은 주체), 아니면 findPrincipal(가드와 같은 MIN(teamNo) — hangang R34).
   */
  private async ipVerdict(userNo: bigint, req: Request, teamNo?: bigint | null): Promise<IpVerdict> {
    if (this.accessPolicy == null) return { allowed: true }
    const team =
      teamNo !== undefined ? teamNo : ((await this.repo.findPrincipal(userNo))?.teamNo ?? null)
    const { clientIp } = requestMetaOf(req, this.config.clientIp)
    const allowed = await this.accessPolicy.allows({
      clientIp,
      userNo,
      teamNos: team == null ? [] : [team],
    })
    return allowed ? { allowed: true } : { allowed: false, clientIp }
  }
```

③ 로그인의 `if (this.accessPolicy != null) { const principal = … throw ipNotAllowed(clientIp) } }` 블록을 이것으로 바꾼다(순서 · 응답은 그대로 — Task 5 가 바꾼다):

```ts
const verdict = await this.ipVerdict(credential.userNo, req)
if (!verdict.allowed) {
  await this.emit(
    { type: 'login.blocked', reason: 'ip', userId: input.userId, userNo: credential.userNo },
    req,
  )
  throw ipNotAllowed(verdict.clientIp)
}
```

④ `authenticate` 의 `if (this.accessPolicy != null) { … }` 블록을 이것으로 바꾼다:

```ts
const verdict = await this.ipVerdict(record.userNo, req, record.teamNo)
if (!verdict.allowed) {
  // 🔴 거부를 던지기 전에 남긴다 — 감사 인터셉터는 가드 뒤라 이 요청을 보지 못한다(hangang I4).
  await this.emit(
    { type: 'access.blocked', reason: 'ip', userNo: record.userNo, sessionNo: session.sessionNo },
    req,
  )
  throw ipNotAllowed(verdict.clientIp)
}
```

⑤ `assertAllowedForRefresh` 의 본문을 이것으로 바꾼다(Task 4 가 지운다):

```ts
  private async assertAllowedForRefresh(row: AdminSessionRow, req: Request): Promise<void> {
    const verdict = await this.ipVerdict(row.userNo, req)
    if (verdict.allowed) return
    await this.emit(
      { type: 'access.blocked', reason: 'ip', userNo: row.userNo, sessionNo: row.sessionNo },
      req,
    )
    throw ipNotAllowed(verdict.clientIp)
  }
```

- [ ] **Step 4: GREEN — 동작이 그대로인지**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint && pnpm --filter @ssworks/admin-server test && pnpm --filter @ssworks/admin-server test:db auth ip-access`
Expected: PASS — 테스트를 하나도 고치지 않았는데 초록이다(인자 채우기 말고). `grep -n "accessPolicy.allows" packages/admin-server/src/auth/auth.service.ts` 가 한 줄(`ipVerdict` 안)이다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/audit packages/admin-server/src/test-support/auth.ts
git add packages/admin-server/src
git commit -m "refactor(admin-server): IP 판정 도우미 하나 · resolveAuthConfig · resolveAuditConfig 의 clientIp 필수 — 2f-2a" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 회전 · 유예 발급 — users 공유 잠금이 첫 문장

**Files:**

- Modify: `packages/admin-server/src/auth/session.store.ts`
- Modify: `packages/admin-server/src/auth/auth.service.ts`
- Modify: `packages/admin-server/src/auth/session.store.db.test.ts`
- Modify: `packages/admin-server/src/auth/auth.service.refresh.db.test.ts`
- Create: `packages/admin-server/src/auth/auth.race.db.test.ts`

**Interfaces:**

- Consumes: Task 1 `whileHeld({ expectWait, afterReached })` · Task 2 `lockCredential` · `createAuthKit(t, { db })` · Task 3 `ipVerdict`.
- Produces:
  - `AdminSessionStore.create(input: NewSessionInput, trx?: Transaction<AdminDatabase>): Promise<bigint>`
  - `AdminSessionStore.rotate(trx: Transaction<AdminDatabase>, old: { sessionNo: bigint; loginAt: Date }, next: Omit<NewSessionInput, 'loginAt'>): Promise<bigint | null>` — 스스로 트랜잭션을 열지 않는다.
  - `AdminAuthService` 의 비공개 `underUserLock<R>(row: AdminSessionRow, req: Request, now: Date, write: (trx: Transaction<AdminDatabase>) => Promise<R>): Promise<R>`
  - 테스트 파일 `auth.race.db.test.ts` 의 도우미 `signIn` · `lockUser` · `revokeSessions` · `sessionRows` · `failCountOf` · `codeOf` · `messageOf`(Task 5 가 같은 파일에 테스트를 더한다).

- [ ] **Step 1: 경합 테스트를 쓴다**

`packages/admin-server/src/auth/auth.race.db.test.ts`(새):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createAuthKit,
  fakeRequest,
  seedRole,
  seedUser,
  type SeededUser,
} from '../test-support/auth.js'
import { settle, snapshotKysely, whileHeld, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AUTH_MESSAGES } from './errors.js'

// 인증 경로 ∥ 사용자 쓰기(2f-2a 스펙 §9-2). 원시 연결이 사용자 쓰기를 흉내 낸다 — 즉시 퇴사 · 비밀번호 초기화는 users 를
// 잠그고 바꾼 뒤 그 사용자의 세션을 끊는다(users X → 세션 X), 본인 비밀번호 변경은 users 를 바꾼 뒤 다른 세션을 끊는다.
// 🔴 afterReached 가 "잠근 뒤 세션을 끊는" 둘째 문장이다 — 예전 순서(회전이 옛 세션 X 를 쥐고 FK 검사에서 users S 를 기다림)면
//    이 문장이나 회전 중 하나가 교착 1213 이다(스펙 §14 R1-①).

let t: TestDatabase
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db, { roleName: '경합', permissions: ['user:read'] })
})

afterAll(async () => {
  await t?.drop()
})

const past = () => new Date(Date.now() - 60_000)

/** 기본 키트(t.db)로 로그인 — 세션 하나 */
async function signIn(user?: SeededUser) {
  const kit = createAuthKit(t, { policy: false })
  const seeded = user ?? (await seedUser(t.db, { roleNo }))
  const tokens = await kit.service.login(
    { userId: seeded.userId, password: seeded.password },
    fakeRequest(),
  )
  const sessionNo = kit.tokens.verify(tokens.accessToken, new Date()).sessionNo
  return { user: seeded, tokens, sessionNo }
}

const lockUser = (userNo: bigint) => (connection: Connection) =>
  connection.query('select user_no from users where user_no = ? for update', [userNo])

/** 그 사용자의 살아 있는 세션을 끊는다 — exceptSessionNo 는 남긴다(본인 비밀번호 변경) */
const revokeSessions =
  (userNo: bigint, exceptSessionNo: bigint = 0n) =>
  (connection: Connection) =>
    connection.query(
      "update sessions set is_revoked = 1, revoked_reason = 'terminated', revoked_at = ? where user_no = ? and session_no <> ? and is_revoked = 0",
      [new Date(), userNo, exceptSessionNo],
    )

async function sessionRows(userNo: bigint) {
  return t.db
    .selectFrom('sessions')
    .select(['sessionNo', 'isRevoked', 'revokedReason'])
    .where('userNo', '=', userNo)
    .orderBy('sessionNo')
    .execute()
}

async function failCountOf(userNo: bigint): Promise<number> {
  const row = await t.db
    .selectFrom('users')
    .select('loginFailCount')
    .where('userNo', '=', userNo)
    .executeTakeFirstOrThrow()
  return row.loginFailCount
}

function codeOf(result: Settled<unknown>): string {
  if (result.ok) return 'ok'
  return result.error instanceof BusinessError ? result.error.code : String(result.error)
}

function messageOf(result: Settled<unknown>): string | undefined {
  return !result.ok && result.error instanceof BusinessError ? result.error.message : undefined
}

describe('회전 ∥ 사용자 쓰기 — 2d R10-3', () => {
  it.each([false, true])(
    '🔴 (R1) 즉시 퇴사(users 잠금 → 세션 폐기) ∥ refresh — 교착 없이 403 퇴사, 새 세션 없음(스냅샷 격리 %s)',
    async (snapshot) => {
      const db = await snapshotKysely(t, snapshot)
      try {
        const kit = createAuthKit(t, { policy: false, db })
        const { user, tokens, sessionNo } = await signIn()
        const result = await whileHeld(
          t,
          async (connection) => {
            await lockUser(user.userNo)(connection)
            await connection.query('update users set resign_at = ? where user_no = ?', [
              past(),
              user.userNo,
            ])
          },
          () => kit.service.refresh(tokens.refreshToken, fakeRequest()),
          { expectWait: true, afterReached: revokeSessions(user.userNo) },
        )
        expect(result.afterReached?.ok).toBe(true)
        expect(codeOf(result)).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
        expect(await sessionRows(user.userNo)).toEqual([
          { sessionNo, isRevoked: true, revokedReason: 'terminated' },
        ])
      } finally {
        await db.destroy()
      }
    },
  )

  it('🔴 (R2) 비밀번호 초기화(users 잠금 → 새 해시 → 세션 폐기) ∥ refresh — 교착 없이 401 refreshEnded', async () => {
    const kit = createAuthKit(t, { policy: false })
    const { user, tokens, sessionNo } = await signIn()
    const result = await whileHeld(
      t,
      async (connection) => {
        await lockUser(user.userNo)(connection)
        await connection.query(
          "update users set password = 'reset-hash', is_password_change_required = 1, login_fail_count = 0, lock_until = null where user_no = ?",
          [user.userNo],
        )
      },
      () => kit.service.refresh(tokens.refreshToken, fakeRequest()),
      { expectWait: true, afterReached: revokeSessions(user.userNo) },
    )
    expect(result.afterReached?.ok).toBe(true)
    expect(codeOf(result)).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(messageOf(result)).toBe(AUTH_MESSAGES.refreshEnded)
    expect(await sessionRows(user.userNo)).toEqual([
      { sessionNo, isRevoked: true, revokedReason: 'terminated' },
    ])
  })

  it('🔴 (R3) 본인 비밀번호 변경(users 갱신 → 다른 세션 폐기) ∥ 다른 세션의 refresh — 교착 없이 401 refreshEnded, 현재 세션은 산다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const first = await signIn()
    const other = await signIn(first.user)
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query("update users set password = 'changed-hash' where user_no = ?", [
          first.user.userNo,
        ]),
      () => kit.service.refresh(other.tokens.refreshToken, fakeRequest()),
      { expectWait: true, afterReached: revokeSessions(first.user.userNo, first.sessionNo) },
    )
    expect(result.afterReached?.ok).toBe(true)
    expect(codeOf(result)).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(messageOf(result)).toBe(AUTH_MESSAGES.refreshEnded)
    expect((await sessionRows(first.user.userNo)).map((row) => row.isRevoked)).toEqual([
      false,
      true,
    ])
  })

  it('(R4) 같은 사용자 두 세션의 refresh 를 동시에 — 공유 잠금끼리 막지 않아 둘 다 회전한다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const first = await signIn()
    const second = await signIn(first.user)
    const results = await Promise.all([
      settle(kit.service.refresh(first.tokens.refreshToken, fakeRequest())),
      settle(kit.service.refresh(second.tokens.refreshToken, fakeRequest())),
    ])
    expect(results.map(codeOf)).toEqual(['ok', 'ok'])
    const rows = await sessionRows(first.user.userNo)
    expect(rows.filter((row) => !row.isRevoked)).toHaveLength(2)
    expect(rows.filter((row) => row.revokedReason === 'rotated')).toHaveLength(2)
  })

  it('Review Focus 3 — 같은 사용자의 로그인 확정(users X)이 쥔 동안의 refresh 는 기다렸다 회전한다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const { user, tokens } = await signIn()
    const result = await whileHeld(
      t,
      lockUser(user.userNo),
      () => kit.service.refresh(tokens.refreshToken, fakeRequest()),
      { expectWait: true },
    )
    expect(codeOf(result)).toBe('ok')
  })
})
```

- [ ] **Step 2: refresh · 세션 저장소 테스트를 고친다**

① `packages/admin-server/src/auth/auth.service.refresh.db.test.ts`:

- `it('퇴사가 IP 보다 먼저다 — 퇴사 403 이면 정책을 묻지 않는다(로그인 · 가드와 같은 순서)', …)` 를 통째로 이것으로 바꾼다:

```ts
it('🔴 IP 가 퇴사보다 먼저다 — 퇴사했고 막힌 주소면 403 IP · access.blocked(2f-2a 스펙 §6 #5 — 잠금을 쥔 채 정책을 묻지 않는다)', async () => {
  const kit = createAuthKit(t)
  const { user, tokens, sessionNo } = await login(kit)
  await t.db
    .updateTable('users')
    .set({ resignAt: later(-2000) })
    .where('userNo', '=', user.userNo)
    .execute()
  kit.policy.allow = false
  const blocked = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
  expect(blocked.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
  expect(kit.events.events.at(-1)).toMatchObject({ type: 'access.blocked', sessionNo })
  kit.policy.allow = true
  const resigned = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
  expect(resigned.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
  expect((await kit.store.findByNo(sessionNo))?.isRevoked).toBe(false)
})
```

- `describe('refresh — 회전', …)` 끝(`🔴 강제 변경 · 잠긴 계정의 세션은 회전한다` 다음)에 더한다:

```ts
it('Review Focus 5 — 퇴사 효력 시각이 미래면 회전한다(잠근 행으로 판정)', async () => {
  const kit = createAuthKit(t)
  const { user, tokens, sessionNo } = await login(kit)
  await t.db
    .updateTable('users')
    .set({ resignAt: later(24 * 3600 * 1000) })
    .where('userNo', '=', user.userNo)
    .execute()
  await expect(kit.service.refresh(tokens.refreshToken, fakeRequest())).resolves.toHaveProperty(
    'accessToken',
  )
  expect((await kit.store.findByNo(sessionNo))?.revokedReason).toBe('rotated')
})
```

② `packages/admin-server/src/auth/session.store.db.test.ts`:

- import 에 `import { runWriteTransaction } from '../database/run.js'` 를 더한다.
- `store.rotate(` 를 부르는 다섯 곳을 모두 `runWriteTransaction(t.db, (trx) => store.rotate(trx, …))` 모양으로 바꾼다. 예:

```ts
const newNo = await runWriteTransaction(t.db, (trx) =>
  store.rotate(trx, { sessionNo: oldNo, loginAt }, next),
)
```

`INSERT 가 실패하면 옛 행도 되돌아간다` 테스트는 `const error = await runWriteTransaction(t.db, (trx) => store.rotate(trx, { sessionNo: oldNo, loginAt: new Date() }, input(user.userNo, { refreshTokenHash: taken.refreshTokenHash }))).then(() => undefined, (caught: unknown) => caught)` 로 — 기대(`BusinessError` · `ERR_COMMON_DUPLICATED` · 옛 행 살아 있음)는 그대로다. P1 테스트의 `const pending = store.rotate(…)` 도 `runWriteTransaction(t.db, (trx) => store.rotate(trx, …))` 로.

- `describe('rotate', …)` 끝에 더한다:

```ts
it('create(input, trx) 는 받은 트랜잭션에 든다 — 롤백되면 행이 없다(2f-2a 스펙 A12)', async () => {
  const user = await seedUser(t.db, { roleNo })
  let created: bigint | undefined
  const error = await runWriteTransaction(t.db, async (trx) => {
    created = await store.create(input(user.userNo), trx)
    throw new Error('되돌린다')
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(Error)
  expect(created).toBeDefined()
  expect(await store.findByNo(created!)).toBeNull()
})
```

- [ ] **Step 3: RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server typecheck`
Expected: FAIL — `store.rotate(trx, …)` 인자 수(TS2554) · `create` 의 둘째 인자.

(타입을 맞추려고 구현부터 바꾸지 않는다 — 다음 단계가 구현이다. 경합 테스트의 RED 는 Step 5 뒤 🔴 실험으로 본다.)

- [ ] **Step 4: 세션 저장소를 고친다**

`packages/admin-server/src/auth/session.store.ts`:

① import 의 `import { runQuery, runWriteTransaction } from '../database/run.js'` 를 `import { runQuery } from '../database/run.js'` 로.

② 머리 주석 `// 바꾼 점:` 끝에 더한다:

```ts
//  - 2f-2a(스펙 A12): 회전 · 로그인 확정 · 유예 발급이 users 잠금과 같은 트랜잭션에 세션을 쓴다 — rotate 는 받은 트랜잭션 위에서만,
//    create 는 trx 를 받을 수 있다. 트랜잭션은 인증 서비스가 연다(users 를 세션보다 먼저 — 2d R10-3).
```

③ `create` · `rotate` 를 이것으로 바꾼다:

```ts
  /** 🔴 `trx` 를 주면 그 트랜잭션 위에서 쓴다 — 로그인 확정 · 유예 발급이 users 잠금과 한 트랜잭션에 넣는다(2f-2a 스펙 A12) */
  create(input: NewSessionInput, trx?: Transaction<AdminDatabase>): Promise<bigint> {
    // 트랜잭션 안이면 runQuery 로 감싸지 않는다 — runWriteTransaction 이 드라이버 오류를 바꾼다.
    return trx ? insertSession(trx, input) : runQuery(() => insertSession(this.db, input))
  }
```

```ts
  /**
   * 🔴 받은 트랜잭션 위에서: 옛 행 조건부 폐기 → 새 행 INSERT → 옛 행 링크(스펙 B3 — 한 트랜잭션). 스스로 트랜잭션을 열지
   * 않는다 — 인증 서비스가 users 공유 잠금을 첫 문장으로 잡은 트랜잭션을 넘긴다(2f-2a 스펙 A7 — 2d R10-3 교착). 조건부 UPDATE 가
   * 0행이면 null — 다른 요청이 먼저 회전했거나 초기화 · 퇴사 · 로그아웃이 먼저 끊었다(P1). InnoDB UPDATE 는 잠금 읽기라 진 쪽은
   * 이긴 쪽 커밋까지 기다렸다가 0행을 받는다(스펙 §14 R1-4). 🔴 호출부는 null 뒤의 재조회를 이 트랜잭션 밖에서 한다(스펙 §14 R2).
   */
  async rotate(
    trx: Transaction<AdminDatabase>,
    old: { sessionNo: bigint; loginAt: Date },
    next: Omit<NewSessionInput, 'loginAt'>,
  ): Promise<bigint | null> {
    const revoked = await trx
      .updateTable('sessions')
      .set({ isRevoked: true, revokedReason: 'rotated', revokedAt: next.now })
      .where('sessionNo', '=', old.sessionNo)
      .where('isRevoked', '=', false)
      .executeTakeFirst()
    if (revoked.numUpdatedRows === 0n) return null

    const sessionNo = await insertSession(trx, { ...next, loginAt: old.loginAt })
    // 최초 후계만 기록한다 — 유예창 판정이 그것을 본다(gise).
    await trx
      .updateTable('sessions')
      .set({ replacedBySessionNo: sessionNo })
      .where('sessionNo', '=', old.sessionNo)
      .where('replacedBySessionNo', 'is', null)
      .execute()
    return sessionNo
  }
```

- [ ] **Step 5: 회전 · 유예 발급을 고친다**

`packages/admin-server/src/auth/auth.service.ts`:

① import 의 `import type { Kysely } from 'kysely'` 를 `import type { Kysely, Transaction } from 'kysely'` 로.

② 머리 주석 `// 바꾼 점:` 끝에 더한다:

```ts
//  - 🔴 회전 · 유예 발급은 users 를 세션보다 먼저 공유 잠금으로 잡는다(lockCredential 'share' — 2f-2a 스펙 A7 · A8). 퇴사 ·
//    초기화 · 본인 비밀번호 변경(users X → 세션)과 같은 순서라 교착이 없다(2d R10-3). IP 는 그 트랜잭션 앞 — 잠금을 쥔 채
//    정책을 묻지 않는다(그래서 refresh 는 IP → 퇴사 순서).
```

③ `refresh` 메서드 전체를 이것으로 바꾼다:

```ts
  /**
   * 회전(스펙 §5-3 · 2f-2a 스펙 §5-2). 🔴 'rotated' 만 재사용 판정 대상이다 — 'terminated'(로그아웃 · 강제 종료)를 재사용으로
   * 보면 세션 하나를 끊었을 뿐인데 전 기기가 로그아웃된다(hangang 011).
   */
  async refresh(refreshToken: string | undefined, req: Request): Promise<AdminTokenPair> {
    if (refreshToken == null) {
      throw new BusinessError(
        CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
        AUTH_MESSAGES.refreshMissing,
      )
    }
    const now = new Date()
    const row = await this.sessions.findByRefreshHash(hashRefreshToken(refreshToken))
    if (row == null) {
      throw new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshInvalid)
    }

    if (row.isRevoked) {
      // P2 — 다른 탭의 회전이 이 읽기보다 먼저 커밋됐다.
      if (row.revokedReason === 'rotated') return this.reuseOfRotated(row, req, now)
      throw refreshEnded()
    }

    if (isSessionExpired(row.expireAt, now)) {
      // 🔴 EXPIRED_TOKEN 이 아니다 — 그것은 "액세스 토큰이 만료됐으니 갱신하라" 는 신호다. 갱신 안에서 그 코드를 쓰면
      //    반드시 실패할 왕복을 하나 더 태운다(gise).
      throw new BusinessError(CommonErrorCodes.ERR_SESSION_EXPIRED, AUTH_MESSAGES.refreshExpired)
    }

    // 🔴 퇴사는 회전 전에 막는다 — 새 토큰을 내주지 않는다. 강제 변경 · 잠김은 회전한다.
    const issued = this.newSession(row.userNo, req, now)
    const sessionNo = await this.underUserLock(row, req, now, (trx) =>
      this.sessions.rotate(trx, { sessionNo: row.sessionNo, loginAt: row.loginAt }, issued.input),
    )
    if (sessionNo == null) {
      // P1 — 두 요청이 위의 읽기를 둘 다 통과한 뒤 조건부 UPDATE 에서 갈렸다(정본이 놓친 경로 — 실제로는 이쪽이 더 잦다, gise).
      // 또는 초기화 · 퇴사 · 로그아웃이 먼저 끊었다. 🔴 트랜잭션 밖에서 다시 읽는다 — 위의 row 는 회전 전 스냅숏이다.
      const current = await this.sessions.findByNo(row.sessionNo)
      if (current == null || current.revokedReason !== 'rotated') throw refreshEnded()
      // 🔴 유예가 꺼져 있으면 전량 폐기하지 않는다 — 흔한 탭 경쟁 한 번에 전 기기가 로그아웃된다(hangang).
      if (this.config.refreshGraceMs === 0) {
        throw new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshRaced)
      }
      return this.reuseOfRotated(current, req, now)
    }

    await this.emit(
      {
        type: 'token.refresh',
        userNo: row.userNo,
        sessionNo,
        rotatedFrom: row.sessionNo,
        grace: false,
      },
      req,
    )
    return {
      accessToken: this.tokens.sign({ userNo: row.userNo, sessionNo }),
      refreshToken: issued.refreshToken,
    }
  }
```

④ `reuseOfRotated` 의 grace 갈래(`if (judgeRotatedReuse(…) === 'grace') { … }`)의 본문을 이것으로 바꾼다:

```ts
if (judgeRotatedReuse(row, successor, now, this.config.refreshGraceMs) === 'grace') {
  // 🔴 새 세션을 하나 더 준다. 이긴 탭의 세션은 건드리지 않는다 — 원문을 저장하지 않으니 같은 쿠키를 줄 수 없고,
  //    두 응답 중 나중에 도착한 쪽이 쿠키를 덮어도 살아 있는 토큰만 남아야 한다(gise). 링크는 하지 않는다.
  const issued = this.newSession(row.userNo, req, now)
  const sessionNo = await this.underUserLock(row, req, now, (trx) =>
    this.sessions.create({ ...issued.input, loginAt: row.loginAt }, trx),
  )
  await this.emit(
    {
      type: 'token.refresh',
      userNo: row.userNo,
      sessionNo,
      rotatedFrom: row.sessionNo,
      grace: true,
    },
    req,
  )
  return {
    accessToken: this.tokens.sign({ userNo: row.userNo, sessionNo }),
    refreshToken: issued.refreshToken,
  }
}
```

⑤ `assertActive` · `assertAllowedForRefresh` 두 메서드를 지우고, 그 자리에 둔다:

```ts
  /**
   * 회전 · 유예 발급(2f-2a 스펙 A7 · A8) — IP(비잠금) → 트랜잭션: users 공유 잠금(첫 문장) → 계정 없음 401 · 퇴사 403 → write.
   * 🔴 users 를 세션보다 먼저 잡는다 — 즉시 퇴사 · 초기화 · 본인 비밀번호 변경(users X → 세션 X)과 같은 순서라 교착이 없다
   *    (2d R10-3). 공유 잠금이라 같은 사용자의 다른 세션 회전과는 줄을 서지 않는다(회전은 users 를 쓰지 않아 승격이 없다).
   * 🔴 IP 는 트랜잭션 앞이다 — 잠금을 쥔 채 정책을 묻지 않는다. 막혀도 회전 대상 행은 그대로라 허용된 주소에서 같은 토큰을
   *    다시 보내면 회전한다(2f-1 스펙 P11). 없음 · 퇴사는 이벤트가 없어 트랜잭션 안에서 던진다 — 롤백할 쓰기가 없다(§14 R2-⑧).
   */
  private async underUserLock<R>(
    row: AdminSessionRow,
    req: Request,
    now: Date,
    write: (trx: Transaction<AdminDatabase>) => Promise<R>,
  ): Promise<R> {
    const verdict = await this.ipVerdict(row.userNo, req)
    if (!verdict.allowed) {
      await this.emit(
        { type: 'access.blocked', reason: 'ip', userNo: row.userNo, sessionNo: row.sessionNo },
        req,
      )
      throw ipNotAllowed(verdict.clientIp)
    }
    return runWriteTransaction(this.db, async (trx) => {
      const credential = await this.repo.lockCredential(trx, row.userNo, 'share')
      if (credential == null) throw sessionInvalid()
      if (isResigned(credential.resignAt, now)) {
        throw new BusinessError(CommonErrorCodes.ERR_RESIGNED_USER, AUTH_MESSAGES.resigned)
      }
      return write(trx)
    })
  }
```

⑥ 파일 끝의 모듈 함수들(`loginFailed` · `sessionInvalid` · `ipNotAllowed`) 옆에 더한다:

```ts
function refreshEnded(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshEnded)
}
```

- [ ] **Step 6: GREEN**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint && pnpm --filter @ssworks/admin-server test:db auth.race auth.service session.store ip-access.auth`
Expected: PASS — R1(OFF · ON) · R2 · R3 · R4 · Review Focus 3, refresh 의 P1 · P2 · 유예 · IP 테스트 그대로, 세션 저장소 테스트.

- [ ] **Step 7: 🔴 RED 실험**

`underUserLock` 의 `const credential = await this.repo.lockCredential(trx, row.userNo, 'share')` 를 `const credential = await this.repo.findCredentialByNo(row.userNo)`(비잠금 — 예전 순서와 같다)로 바꾸고 `pnpm --filter @ssworks/admin-server test:db auth.race` 를 돌린다.
Expected: FAIL — 비잠금 읽기라 회전이 옛 세션 X 를 먼저 쥐고 새 세션 INSERT 의 FK 검사에서 users 를 기다린다(대기는 그대로 닿는다). 그 뒤 `afterReached` 의 세션 폐기가 옛 세션을 기다려 교착 1213 이 난다(스펙 §14 R1-①). R1 · R2 는 쥔 쪽이 희생자라 `expect(result.afterReached?.ok).toBe(true)` 에서 실패하고(회전은 성공), R3 은 refresh 가 희생자라 코드가 409 `ERR_COMMON_CONFLICT` 로 실패한다. 보고서에 붙이고 되돌린다.

- [ ] **Step 8: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth
git add packages/admin-server/src/auth
git commit -m "fix(admin-server): 회전 · 유예 발급이 users 를 공유 잠금으로 먼저 잡는다 — 퇴사 · 초기화 · 본인 변경과의 교착 없음(2d R10-3), refresh 는 IP → 퇴사" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 로그인 — IP 먼저 · 확정 트랜잭션 · 같은 401 문구 · 감사 401

**Files:**

- Modify: `packages/admin-server/src/auth/errors.ts`
- Modify: `packages/admin-server/src/auth/auth.service.ts`
- Modify: `packages/admin-server/src/audit/auth-events.ts` · `packages/admin-server/src/audit/auth-events.test.ts`
- Create: `packages/admin-server/src/auth/auth.service.login.test.ts`
- Modify: `packages/admin-server/src/auth/auth.service.login.db.test.ts`
- Modify: `packages/admin-server/src/auth/auth.race.db.test.ts`
- Modify: `packages/admin-server/src/auth/auth.http.db.test.ts`
- Modify: `packages/admin-server/src/ip-access/ip-access.auth.db.test.ts`

**Interfaces:**

- Consumes: Task 2 `lockCredential` · `writeLoginState` · `checkPasswordWithCounter(db, …)` · Task 3 `ipVerdict` · Task 4 `sessions.create(input, trx)` · `auth.race.db.test.ts` 도우미.
- Produces: `AUTH_MESSAGES.loginFailedWithIp`. 로그인 응답 계약(스펙 §5-1 · §6 #1~#4 · #7).

- [ ] **Step 1: 판정 단위 테스트를 쓴다**

`packages/admin-server/src/auth/auth.service.login.test.ts`(새):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminDatabase } from '../database/types.js'
import { RecordingEvents, SwitchablePolicy, fakeRequest } from '../test-support/auth.js'
import { AdminAccessTokenService } from './access-token.service.js'
import type { AdminAuthRepository, AdminCredential } from './auth.repository.js'
import { AdminAuthService } from './auth.service.js'
import { AUTH_MESSAGES } from './errors.js'
import { resolveAuthConfig } from './options.js'
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password.js'
import type { AdminSessionStore } from './session.store.js'

// 🔴 막힌 주소 · 없는 계정의 로그인은 실제 해시를 보지 않고 더미 argon2 를 한 번 태운다(2f-2a 스펙 A4 · §14 R2-②) — 응답
//    시간이 틀린 비밀번호와 같아 계정 · 정답이 드러나지 않는다. argon2 호출을 세려고 password 모듈의 verifyPassword 를 갈아 끼운다.
vi.mock('./password.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyPassword: vi.fn(async () => true),
}))

const config = resolveAuthConfig({ jwtSecret: 's'.repeat(32) }, undefined, undefined, undefined)

const credential: AdminCredential = {
  userNo: 7n,
  passwordHash: 'real-hash',
  resignAt: null,
  loginFailCount: 2,
  lockUntil: null,
  isPasswordChangeRequired: false,
}

function fakeRepo(found: AdminCredential | null) {
  return {
    findCredentialByUserId: vi.fn(async () => found),
    findCredentialByNo: vi.fn(async () => found),
    findPrincipal: vi.fn(async () => null),
    lockCredential: vi.fn(async () => found),
    writeLoginState: vi.fn(async () => undefined),
    changePassword: vi.fn(async () => 0),
  } satisfies AdminAuthRepository
}

function service(
  repo: AdminAuthRepository,
  policy: SwitchablePolicy | undefined,
  events: RecordingEvents,
) {
  return new AdminAuthService(
    config,
    repo,
    {} as AdminSessionStore,
    new AdminAccessTokenService(config),
    {} as Kysely<AdminDatabase>,
    policy,
    events,
  )
}

async function rejection(promise: Promise<unknown>): Promise<BusinessError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('거부되지 않았다')
}

beforeEach(() => {
  vi.mocked(verifyPassword).mockClear()
})

describe('login — 비밀번호를 보기 전에 끝나는 갈래', () => {
  it('🔴 막힌 주소 — 더미 해시로 한 번만 확인하고 카운터 · 잠금 읽기를 건드리지 않는다, 401 · login.blocked:ip', async () => {
    const repo = fakeRepo(credential)
    const policy = new SwitchablePolicy()
    policy.allow = false
    const events = new RecordingEvents()
    const error = await rejection(
      service(repo, policy, events).login(
        { userId: 'u7', password: 'typed' },
        fakeRequest({ ip: '203.0.113.9' }),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    expect(error.details).toBeUndefined()
    expect(vi.mocked(verifyPassword).mock.calls).toEqual([[DUMMY_PASSWORD_HASH, 'typed']])
    expect(repo.lockCredential).not.toHaveBeenCalled()
    expect(repo.writeLoginState).not.toHaveBeenCalled()
    expect(policy.calls).toEqual([{ clientIp: '203.0.113.9', userNo: 7n, teamNos: [] }])
    expect(events.types()).toEqual(['login.blocked:ip'])
  })

  it('없는 계정 — 정책을 부르지 않고 더미 해시로 한 번, 정책이 있으면 문구는 loginFailedWithIp', async () => {
    const policy = new SwitchablePolicy()
    const error = await rejection(
      service(fakeRepo(null), policy, new RecordingEvents()).login(
        { userId: 'ghost', password: 'typed' },
        fakeRequest(),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    expect(vi.mocked(verifyPassword).mock.calls).toEqual([[DUMMY_PASSWORD_HASH, 'typed']])
    expect(policy.calls).toEqual([])
  })

  it('정책이 없으면 로그인 401 문구는 loginFailed 그대로', async () => {
    const error = await rejection(
      service(fakeRepo(null), undefined, new RecordingEvents()).login(
        { userId: 'ghost', password: 'typed' },
        fakeRequest(),
      ),
    )
    expect(error.message).toBe(AUTH_MESSAGES.loginFailed)
  })
})
```

- [ ] **Step 2: 로그인 DB 테스트를 고치고 더한다**

`packages/admin-server/src/auth/auth.service.login.db.test.ts`:

① import 에 더한다: `import { AdminAuthService } from './auth.service.js'` · `import { KyselyAuthRepository } from './kysely-auth.repository.js'` · `import { hashPassword } from './password.js'`.

② 이미 있는 테스트를 고친다(`createAuthKit(t)` 는 정책을 주입하므로 로그인 401 문구가 `loginFailedWithIp` 다 — 스펙 A5):

- `🔴 없는 아이디 — 401 ERR_LOGIN_FAILED, 정책을 부르지 않는다, login.fail(userNo null)` : `AUTH_MESSAGES.loginFailed` → `AUTH_MESSAGES.loginFailedWithIp`.
- `🔴 5회째 잠기고, 맞은 비밀번호도 같은 401 — 정책을 부르지 않고 카운터는 그대로(F1)` : 제목을 `🔴 5회째 잠기고, 맞은 비밀번호도 같은 401 — 카운터는 그대로(F1)` 로, `AUTH_MESSAGES.loginFailed` → `AUTH_MESSAGES.loginFailedWithIp`, `expect(kit.policy.calls).toHaveLength(0)` → 아래 두 줄:

```ts
// IP 는 비밀번호보다 먼저 — 여섯 번 모두 물었다(2f-2a 스펙 A1)
expect(kit.policy.calls).toHaveLength(6)
```

- `🔴 잠긴 계정 + 퇴사 + 맞은 비밀번호 — 퇴사 403 이 아니라 401(잠김이 먼저)` : `AUTH_MESSAGES.loginFailed` → `AUTH_MESSAGES.loginFailedWithIp`.
- `🔴 퇴사 계정 — 틀린 비밀번호는 401(존재를 흘리지 않는다), 맞으면 403 이고 정책을 부르지 않는다` 를 통째로 바꾼다:

```ts
it('🔴 퇴사 계정 — 틀린 비밀번호는 401(존재를 흘리지 않는다), 맞으면 403 · 카운터를 되돌리지 않는다(2f-2a 스펙 §6 #3)', async () => {
  const kit = createAuthKit(t)
  const user = await seedUser(t.db, { roleNo, resignAt: later(-60_000) })
  const wrong = await rejection(
    kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
  )
  expect(wrong.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
  const right = await rejection(
    kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
  )
  expect(right.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
  expect(right.message).toBe(AUTH_MESSAGES.resigned)
  expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 1, lockUntil: null })
  expect(kit.policy.calls).toHaveLength(2)
  expect(kit.events.types()).toEqual(['login.fail', 'login.blocked:resigned'])
})
```

- `정책이 거부하면 403 ERR_IP_NOT_ALLOWED + details.clientIp, 세션을 만들지 않는다 — 대표 팀을 넘긴다` 를 통째로 바꾼다:

```ts
it('🔴 정책이 거부하면 비밀번호를 보지 않고 같은 401 — details 없음 · 세션 없음 · 대표 팀을 넘긴다(2f-2a 스펙 ② I1)', async () => {
  const kit = createAuthKit(t)
  kit.policy.allow = false
  const user = await seedUser(t.db, { roleNo })
  const teamNo = await seedTeam(t.db, `IP팀-${user.userNo}`)
  await addToTeam(t.db, teamNo, user.userNo)
  const error = await rejection(
    kit.service.login(
      { userId: user.userId, password: user.password },
      fakeRequest({ ip: '203.0.113.9' }),
    ),
  )
  expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
  expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
  expect(error.details).toBeUndefined()
  expect(kit.policy.calls).toEqual([
    { clientIp: '203.0.113.9', userNo: user.userNo, teamNos: [teamNo] },
  ])
  expect(kit.events.types()).toEqual(['login.blocked:ip'])
  const sessions = await t.db
    .selectFrom('sessions')
    .select('sessionNo')
    .where('userNo', '=', user.userNo)
    .execute()
  expect(sessions).toHaveLength(0)
})
```

③ `describe('login', …)` 끝(`🔴 비밀번호의 앞뒤 공백 · 한글은 …` 다음)에 더한다:

```ts
it('🔴 막힌 주소의 틀린 비밀번호 다섯은 세지 않는다 — 바깥에서 계정을 잠글 수 없다(2f-2a 스펙 §6 #2)', async () => {
  const kit = createAuthKit(t)
  kit.policy.allow = false
  const user = await seedUser(t.db, { roleNo })
  for (let i = 0; i < 5; i += 1) {
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
  }
  expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 0, lockUntil: null })
  kit.policy.allow = true
  await expect(
    kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
  ).resolves.toHaveProperty('accessToken')
})

it('🔴 막힌 주소의 맞은 비밀번호는 카운터를 되돌리지 않는다(2f-2a 스펙 §6 #3)', async () => {
  const kit = createAuthKit(t)
  kit.policy.allow = false
  const user = await seedUser(t.db, { roleNo, loginFailCount: 3 })
  await rejection(
    kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
  )
  expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 3, lockUntil: null })
})

it('🔴 검증한 해시가 잠근 행과 다르면(그사이 초기화 · 본인 변경) 401 — 세션을 만들지 않고 세지 않는다(2f-2a 스펙 A3)', async () => {
  const kit = createAuthKit(t)
  const user = await seedUser(t.db, { roleNo, loginFailCount: 2 })
  // 같은 비밀번호의 다른 해시 — 검증은 지나고 잠근 행의 해시와는 다르다(초기화가 그사이 커밋된 것과 같다)
  const otherHash = await hashPassword(user.password)
  class StaleRepository extends KyselyAuthRepository {
    override async findCredentialByUserId(userId: string) {
      const row = await super.findCredentialByUserId(userId)
      return row == null ? null : { ...row, passwordHash: otherHash }
    }
  }
  const service = new AdminAuthService(
    kit.config,
    new StaleRepository(t.db),
    kit.store,
    kit.tokens,
    t.db,
    kit.policy,
    kit.events,
  )
  const error = await rejection(
    service.login({ userId: user.userId, password: user.password }, fakeRequest()),
  )
  expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
  expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
  expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 2, lockUntil: null })
  expect(kit.events.events).toEqual([
    { type: 'login.fail', userId: user.userId, userNo: user.userNo, loginFailCount: 2 },
  ])
  const sessions = await t.db
    .selectFrom('sessions')
    .select('sessionNo')
    .where('userNo', '=', user.userNo)
    .execute()
  expect(sessions).toHaveLength(0)
})

it('정책이 없으면(IP 모듈 없음) 로그인 401 문구는 loginFailed', async () => {
  const kit = createAuthKit(t, { policy: false })
  const user = await seedUser(t.db, { roleNo })
  const error = await rejection(
    kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
  )
  expect(error.message).toBe(AUTH_MESSAGES.loginFailed)
})
```

- [ ] **Step 3: 로그인 경합 테스트를 더한다**

`packages/admin-server/src/auth/auth.race.db.test.ts` 끝에 더한다:

```ts
describe('로그인 ∥ 사용자 쓰기 — 로그인 TOCTOU', () => {
  it.each([false, true])(
    '🔴 (L1) 초기화가 로그인의 검증과 확정 사이에 커밋 — 401, 세션 없음, 카운터 그대로(스냅샷 격리 %s)',
    async (snapshot) => {
      const db = await snapshotKysely(t, snapshot)
      try {
        const kit = createAuthKit(t, { policy: false, db })
        const user = await seedUser(t.db, { roleNo, loginFailCount: 2 })
        const result = await whileHeld(
          t,
          async (connection) => {
            await lockUser(user.userNo)(connection)
            await connection.query(
              "update users set password = 'reset-hash', is_password_change_required = 1 where user_no = ?",
              [user.userNo],
            )
          },
          () => kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
          { expectWait: true },
        )
        expect(codeOf(result)).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
        expect(await sessionRows(user.userNo)).toEqual([])
        expect(await failCountOf(user.userNo)).toBe(2)
      } finally {
        await db.destroy()
      }
    },
  )

  it.each([false, true])(
    '🔴 (L2) 즉시 퇴사가 로그인의 검증과 확정 사이에 커밋 — 403, 세션 없음(스냅샷 격리 %s)',
    async (snapshot) => {
      const db = await snapshotKysely(t, snapshot)
      try {
        const kit = createAuthKit(t, { policy: false, db })
        const user = await seedUser(t.db, { roleNo })
        const result = await whileHeld(
          t,
          async (connection) => {
            await lockUser(user.userNo)(connection)
            await connection.query('update users set resign_at = ? where user_no = ?', [
              past(),
              user.userNo,
            ])
          },
          () => kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
          { expectWait: true },
        )
        expect(codeOf(result)).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
        expect(await sessionRows(user.userNo)).toEqual([])
      } finally {
        await db.destroy()
      }
    },
  )

  it('Review Focus 1 — 같은 계정의 동시 로그인 다섯(여러 탭)은 확정에서 줄을 서고 모두 성공한다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const user = await seedUser(t.db, { roleNo, loginFailCount: 1 })
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        settle(kit.service.login({ userId: user.userId, password: user.password }, fakeRequest())),
      ),
    )
    expect(results.map(codeOf)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
    expect(await sessionRows(user.userNo)).toHaveLength(5)
    expect(await failCountOf(user.userNo)).toBe(0)
  })

  it('Review Focus 2 — 같은 사용자의 회전이 users 공유 잠금을 쥔 동안의 로그인은 기다렸다 성공한다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const user = await seedUser(t.db, { roleNo })
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query('select user_no from users where user_no = ? lock in share mode', [
          user.userNo,
        ]),
      () => kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
      { expectWait: true },
    )
    expect(codeOf(result)).toBe('ok')
  })
})
```

- [ ] **Step 4: HTTP · IP 인증 · 감사 테스트를 고친다**

① `packages/admin-server/src/auth/auth.http.db.test.ts`:

- `🔴 틀림 401 × 5 → 맞은 비밀번호도 401 → 잠금이 지나면 200` 안의 `AUTH_MESSAGES.loginFailed,` 두 곳 → `AUTH_MESSAGES.loginFailedWithIp,`(테스트 앱이 정책을 주입한다).
- `describe('IP 자리(2f)', …)` 의 첫 테스트를 통째로 바꾼다:

```ts
it('🔴 정책이 거부하면 로그인은 비밀번호를 보지 않고 틀린 비밀번호와 같은 401 — details · 쿠키 없음(2f-2a 스펙 ② I1)', async () => {
  const user = await seedUser(t.db, { roleNo: readerRole })
  policy.allow = false
  for (const password of ['wrong-pass', user.password]) {
    const blocked = await request(server()).post(LOGIN).send({ userId: user.userId, password })
    expectError(blocked, 401, CommonErrorCodes.ERR_LOGIN_FAILED, AUTH_MESSAGES.loginFailedWithIp)
    expect(blocked.body.details).toBeUndefined()
    expect(setCookies(blocked)).toEqual([])
  }
})
```

② `packages/admin-server/src/ip-access/ip-access.auth.db.test.ts`:

- import 에 `import { AUTH_MESSAGES } from '../auth/errors.js'` 를 더하고, `expectBlocked` 다음에 도우미를 둔다:

```ts
/** 🔴 막힌 로그인은 비밀번호를 보지 않고 틀린 비밀번호와 같은 401 이다(2f-2a 스펙 ② I1) — 주소를 싣지 않는다 */
function expectLoginBlocked(response: Response) {
  expect(response.status).toBe(401)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
  expect(body.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
  expect(body.details).toBeUndefined()
}

async function failCountOf(userNo: bigint): Promise<number> {
  const row = await t.db
    .selectFrom('users')
    .select('loginFailCount')
    .where('userNo', '=', userNo)
    .executeTakeFirstOrThrow()
  return row.loginFailCount
}
```

- `describe('로그인', …)` 의 첫 테스트를 통째로 바꾼다:

```ts
it('🔴 막힌 주소 — 비밀번호를 보지 않고 401 · 감사 auth.login.blocked.ip(401), 틀린 비밀번호도 세지 않는다', async () => {
  const user = await seedUser(t.db, { roleNo: plain, userId: 'auth-blocked' })
  await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: user.userNo, cidr: '10.0.0.0/8' })
  expectLoginBlocked(await login(app, user))
  expect(await lastAudit(CoreAuditActions.AUTH_LOGIN_BLOCKED_IP, user.userNo)).toMatchObject({
    ip: '127.0.0.1',
    statusCode: 401,
    errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
  })
  const wrong = await request(app.getHttpServer())
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: 'wrong-password' })
  expectLoginBlocked(wrong)
  expect(await failCountOf(user.userNo)).toBe(0)
})
```

- `Review Focus 5 — 두 팀에 걸친 계정은 …` 의 `expectBlocked(await login(app, user), '127.0.0.1')` → `expectLoginBlocked(await login(app, user))`.
- `헤더 주소가 판정 · 세션 행 · 감사 행에 같이 쓰인다` 의 마지막 줄 `expectBlocked(await login(realIpApp, user, '203.0.113.9'), '203.0.113.9')` → 두 줄:

```ts
expectLoginBlocked(await login(realIpApp, user, '203.0.113.9'))
expect((await lastAudit(CoreAuditActions.AUTH_LOGIN_BLOCKED_IP, user.userNo))?.ip).toBe(
  '203.0.113.9',
)
```

- `🔴 중복 헤더(쉼표로 이어짐)는 null — 막힌다 · 기본 req.ip 앱은 헤더를 보지 않는다` 의 본문 두 `expectBlocked` 줄을 바꾼다(제목은 `Review Focus 4 — 🔴 중복 헤더(쉼표로 이어짐)는 주소 없음 — 401 · 감사 ip null, 기본 req.ip 앱은 헤더를 보지 않는다`):

```ts
expectLoginBlocked(await login(realIpApp, user, ['10.1.2.3', '203.0.113.9']))
expect((await lastAudit(CoreAuditActions.AUTH_LOGIN_BLOCKED_IP, user.userNo))?.ip).toBeNull()
expectLoginBlocked(await login(app, user, '10.1.2.3'))
expect((await lastAudit(CoreAuditActions.AUTH_LOGIN_BLOCKED_IP, user.userNo))?.ip).toBe('127.0.0.1')
```

`expectBlocked` 는 가드 · refresh 테스트가 그대로 쓴다.

③ `packages/admin-server/src/audit/auth-events.test.ts` 의 `login.blocked` · `reason: 'ip'` 사례를 바꾼다:

```ts
    [
      { type: 'login.blocked', reason: 'ip', userId: 'a', userNo: 3n },
      // 🔴 막힌 로그인은 틀린 비밀번호와 같은 401 이다(2f-2a 스펙 A6) — 코드도 응답과 같게, 사유는 액션이 말한다
      {
        action: CoreAuditActions.AUTH_LOGIN_BLOCKED_IP,
        errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
      },
    ],
```

- [ ] **Step 5: RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test auth.service.login auth-events && pnpm --filter @ssworks/admin-server test:db auth.service.login auth.race auth.http ip-access.auth`
Expected: FAIL — `loginFailedWithIp` 가 없다(undefined 비교), 막힌 로그인이 403, L1 · L2 가 `ok`(세션이 생긴다), 감사 코드 `ERR_IP_NOT_ALLOWED`.

- [ ] **Step 6: 문구 · 감사를 고친다**

① `packages/admin-server/src/auth/errors.ts` 의 `loginFailed` 다음 줄에 더한다:

```ts
  /** IP 정책이 주입됐을 때 로그인 401 전부의 문구(2f-2a 스펙 A5) — 한 배포 안에서 실패 문구가 하나라 오라클이 없다 */
  loginFailedWithIp:
    '아이디 또는 비밀번호가 올바르지 않거나, 로그인 실패가 반복되어 잠시 잠겼거나, 허용되지 않은 접속 위치입니다.',
```

② `packages/admin-server/src/audit/auth-events.ts` 의 `BLOCKED` 표 `ip:` 항목을 바꾼다:

```ts
  // 🔴 막힌 로그인은 틀린 비밀번호와 같은 401 ERR_LOGIN_FAILED 다(2f-2a 스펙 A6) — 감사도 응답과 같은 코드를 남기고 사유는
  //    액션이 말한다. 가드 · refresh 의 access.blocked 는 403 ERR_IP_NOT_ALLOWED 그대로.
  ip: {
    action: CoreAuditActions.AUTH_LOGIN_BLOCKED_IP,
    errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
  },
```

- [ ] **Step 7: 로그인을 고친다**

`packages/admin-server/src/auth/auth.service.ts`:

① import 를 바꾼다: `import { isLocked, nextLoginState } from './login-policy.js'` → `import { isLocked, needsReset } from './login-policy.js'`, `import { checkPasswordWithCounter, updateLoginState } from './password-check.js'` → `import { checkPasswordWithCounter } from './password-check.js'`.

② 머리 주석 `// 정본:` 의 둘째 줄 `hangang-home modules/auth/auth.service.ts(로그인 순서: 비밀번호 → 퇴사 → IP → 잠금 — 여기서는 잠금이 퇴사 앞)` 는 그대로 두고, `// 바꾼 점:` 끝에 더한다:

```ts
//  - 🔴 로그인 순서는 IP → 비밀번호 → 확정 트랜잭션(잠김 → 퇴사 → 되돌림 → 세션)이다(2f-2a 스펙 ② I1 · A1 · A2). 막힌 주소는
//    비밀번호를 보지 않고 같은 401 — 정답 오라클 · 바깥의 잠금 DoS 가 없다(hangang · 2b 는 비밀번호 뒤 IP 403 이었다). 확정
//    트랜잭션이 users 를 세션보다 먼저 잠그고 그 행으로 판정해, 검증 뒤 커밋된 초기화 · 즉시 퇴사를 본다(로그인 TOCTOU).
```

③ `export interface AdminTokenPair` · `type IpVerdict` 다음에 둔다:

```ts
/** 로그인 확정 트랜잭션의 판정(2f-2a 스펙 A2) — 트랜잭션은 값을 돌려주고 이벤트 · 오류는 커밋 뒤에 낸다 */
type LoginOutcome =
  | { kind: 'ok'; sessionNo: bigint }
  | { kind: 'stale'; loginFailCount: number | null }
  | { kind: 'locked' }
  | { kind: 'resigned' }
```

④ `login` 메서드(JSDoc 포함) 전체를 이것으로 바꾼다:

```ts
  /**
   * 🔴 순서: (정책이 있으면) IP → 비밀번호 → 확정 트랜잭션(잠김 → 퇴사 → 되돌림 → 세션)(2f-2a 스펙 §5-1). 존재 · 잠김 · 퇴사는
   * 비밀번호를 아는 사람에게만 드러난다(gise · hangang 코드 리뷰 I1). IP 는 비밀번호보다 먼저라 막힌 주소에서는 아무것도
   * 드러나지 않는다. 실패 카운터는 비밀번호가 틀렸을 때만 오르고(hangang I2) 성공 직전에만 되돌린다.
   */
  async login(input: { userId: string; password: string }, req: Request): Promise<AdminTokenPair> {
    const now = new Date()
    const credential = await this.repo.findCredentialByUserId(input.userId)

    if (credential == null) {
      // 🔴 없는 계정에도 argon2 를 한 번 태운다 — 응답 시간으로 계정이 열거되지 않게(gise). 결과는 버린다. IP 는 보지 않는다 —
      //    응답이 어차피 같은 401 이다.
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password)
      await this.emit(
        { type: 'login.fail', userId: input.userId, userNo: null, loginFailCount: null },
        req,
      )
      throw this.loginFailed()
    }

    // 🔴 IP 는 비밀번호보다 먼저다(2f-2a 스펙 ② I1 · A4) — 막힌 주소에서는 비밀번호 · 잠김 · 퇴사를 보지 않는다. 맞은 비밀번호에만
    //    다른 응답(403)을 주면 막힌 주소에서도 정답을 알아내고, 틀린 비밀번호를 세면 바깥에서 계정을 잠근다. 더미 argon2 로 없는
    //    계정 · 틀린 비밀번호와 같은 비용을 치른다.
    const verdict = await this.ipVerdict(credential.userNo, req)
    if (!verdict.allowed) {
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password)
      await this.emit(
        { type: 'login.blocked', reason: 'ip', userId: input.userId, userNo: credential.userNo },
        req,
      )
      throw this.loginFailed()
    }

    const check = await checkPasswordWithCounter(
      this.db,
      this.repo,
      credential,
      input.password,
      now,
      this.config.lockout,
    )
    if (!check.ok) {
      await this.emit(
        {
          type: 'login.fail',
          userId: input.userId,
          userNo: credential.userNo,
          loginFailCount: check.state.loginFailCount,
        },
        req,
      )
      throw this.loginFailed()
    }

    const issued = this.newSession(credential.userNo, req, now)
    const outcome = await runWriteTransaction(this.db, async (trx): Promise<LoginOutcome> => {
      // 🔴 첫 문장이 잠금 읽기다(2f-2a 스펙 A2) — users 를 세션보다 먼저 잡고(초기화 · 퇴사와 같은 순서), 스냅샷 격리 ON 에서도
      //    읽기 뷰를 먼저 열지 않는다. 판정은 이 행으로 한다 — 검증 전에 읽은 credential 로 하면 그사이 커밋된 초기화 · 즉시 퇴사를
      //    못 보고 옛 비밀번호의 세션을 남긴다(로그인 TOCTOU).
      const locked = await this.repo.lockCredential(trx, credential.userNo, 'update')
      // 검증한 뒤 비밀번호가 바뀌었다(초기화 · 본인 변경) — 대입 시도가 아니니 세지 않는다(스펙 A3).
      if (locked == null || locked.passwordHash !== credential.passwordHash) {
        return { kind: 'stale', loginFailCount: locked?.loginFailCount ?? null }
      }
      // 🔴 잠김은 퇴사보다 먼저 — 잠긴 동안은 맞든 틀리든 같은 401 이다(2b 최종 리뷰 F1, 2026-10-13 사용자 결정).
      if (isLocked(locked.lockUntil, now)) return { kind: 'locked' }
      if (isResigned(locked.resignAt, now)) return { kind: 'resigned' }
      // 되돌림은 성공 직전에만 — 잠김 · 퇴사 · IP 로 막힌 맞은 비밀번호는 카운터를 그대로 둔다(스펙 §6 #3).
      if (needsReset(locked)) {
        await this.repo.writeLoginState(trx, credential.userNo, {
          loginFailCount: 0,
          lockUntil: null,
        })
      }
      const sessionNo = await this.sessions.create({ ...issued.input, loginAt: now }, trx)
      return { kind: 'ok', sessionNo }
    })

    if (outcome.kind === 'ok') {
      await this.emit(
        { type: 'login.success', userNo: credential.userNo, sessionNo: outcome.sessionNo },
        req,
      )
      return {
        accessToken: this.tokens.sign({ userNo: credential.userNo, sessionNo: outcome.sessionNo }),
        refreshToken: issued.refreshToken,
      }
    }
    if (outcome.kind === 'resigned') {
      await this.emit(
        {
          type: 'login.blocked',
          reason: 'resigned',
          userId: input.userId,
          userNo: credential.userNo,
        },
        req,
      )
      throw new BusinessError(CommonErrorCodes.ERR_RESIGNED_USER, AUTH_MESSAGES.resigned)
    }
    if (outcome.kind === 'locked') {
      await this.emit(
        { type: 'login.blocked', reason: 'locked', userId: input.userId, userNo: credential.userNo },
        req,
      )
      throw this.loginFailed()
    }
    await this.emit(
      {
        type: 'login.fail',
        userId: input.userId,
        userNo: credential.userNo,
        loginFailCount: outcome.loginFailCount,
      },
      req,
    )
    throw this.loginFailed()
  }
```

⑤ `private async emit(` 앞에 메서드를 둔다:

```ts
  /** 로그인 401 — 정책이 주입됐으면 접속 위치까지 말한다(2f-2a 스펙 A5). 한 배포 안에서 모든 로그인 실패가 같은 문구다 */
  private loginFailed(): BusinessError {
    return new BusinessError(
      CommonErrorCodes.ERR_LOGIN_FAILED,
      this.accessPolicy == null ? AUTH_MESSAGES.loginFailed : AUTH_MESSAGES.loginFailedWithIp,
    )
  }
```

⑥ 파일 끝의 모듈 함수 `function loginFailed(): BusinessError { … }` 를 지운다(이제 메서드다). `changePassword` 는 바꾸지 않는다.

- [ ] **Step 8: GREEN**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint && pnpm --filter @ssworks/admin-server test && pnpm --filter @ssworks/admin-server test:db auth ip-access audit`
Expected: PASS. `grep -nE "nextLoginState|updateLoginState" packages/admin-server/src/auth/auth.service.ts` 는 아무것도 내지 않는다.

- [ ] **Step 9: 🔴 RED 실험 둘**

① 확정 트랜잭션의 `if (locked == null || locked.passwordHash !== credential.passwordHash) { … }` 와 그 아래 판정 둘이 `locked` 대신 `credential`(검증 전 스냅숏)을 보게 바꾼다(`isLocked(credential.lockUntil, now)` · `isResigned(credential.resignAt, now)`, 해시 비교 줄은 지운다). `pnpm --filter @ssworks/admin-server test:db auth.race` → L1 · L2 가 `ok`(세션이 생긴다)로 실패해야 한다.

② `ipVerdict` 판정 블록을 `checkPasswordWithCounter` 뒤로 옮긴다. `pnpm --filter @ssworks/admin-server test:db auth.service.login` → "막힌 주소의 틀린 비밀번호 다섯은 세지 않는다" 가 카운터 5 로 실패해야 한다.

둘 다 보고서에 붙이고 되돌린다.

- [ ] **Step 10: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/audit packages/admin-server/src/ip-access
git add packages/admin-server/src
git commit -m "fix(admin-server): 로그인은 IP 먼저 · 확정 트랜잭션 — 막힌 주소는 비밀번호를 보지 않고 같은 401, 검증 뒤 초기화 · 퇴사를 본다(로그인 TOCTOU)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: IP 진단 경고 둘

**Files:**

- Modify: `packages/admin-server/src/ip-access/ip-access.policy.ts`
- Create: `packages/admin-server/src/ip-access/ip-access.policy.db.test.ts`

**Interfaces:**

- Produces: `IP_POLICY_WARNINGS`(`nullClientIp` · `noGlobalRule`) — `ip-access.policy.ts` 에서 export(index 밖).

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/ip-access/ip-access.policy.db.test.ts`(새):

```ts
import { Logger } from '@nestjs/common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { resetIpRules } from '../test-support/ip-access.js'
import { IP_POLICY_WARNINGS, IpAccessPolicy } from './ip-access.policy.js'

// 진단 경고(2f-2a 스펙 A15 · ④ W1) — 매 인증 요청이 부르므로 인스턴스당 한 번씩만 남고 주소를 싣지 않는다.

let t: TestDatabase
let userNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  const roleNo = await seedRole(t.db, { roleName: '진단', permissions: ['user:read'] })
  userNo = (await seedUser(t.db, { roleNo })).userNo
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('IpAccessPolicy 진단 경고', () => {
  it('클라이언트 IP 가 null 이라 막으면 한 번만 경고한다 — 주소가 있으면 경고하지 않는다', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const policy = new IpAccessPolicy(t.db)
    expect(await policy.allows({ clientIp: '198.51.100.1', userNo, teamNos: [] })).toBe(true)
    expect(warn).not.toHaveBeenCalled()
    expect(await policy.allows({ clientIp: null, userNo, teamNos: [] })).toBe(false)
    expect(await policy.allows({ clientIp: null, userNo, teamNos: [] })).toBe(false)
    expect(warn.mock.calls).toEqual([[IP_POLICY_WARNINGS.nullClientIp]])
  })

  it('global 층 규칙이 없으면 한 번만 경고한다', async () => {
    await resetIpRules(t.db, [{ scopeType: 'user', scopeRefNo: userNo, cidr: '10.0.0.0/8' }])
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const policy = new IpAccessPolicy(t.db)
    expect(await policy.allows({ clientIp: '10.1.1.1', userNo, teamNos: [] })).toBe(true)
    expect(await policy.allows({ clientIp: '10.1.1.1', userNo, teamNos: [] })).toBe(true)
    expect(warn.mock.calls).toEqual([[IP_POLICY_WARNINGS.noGlobalRule]])
  })

  it('경고 문구에 주소를 싣지 않는다', () => {
    expect(Object.values(IP_POLICY_WARNINGS).join(' ')).not.toMatch(/[0-9]+[.][0-9]+[.]/)
  })
})
```

- [ ] **Step 2: RED**

Run: `pnpm --filter @ssworks/admin-server test:db ip-access.policy`
Expected: FAIL — `IP_POLICY_WARNINGS` 가 export 되지 않는다.

- [ ] **Step 3: 구현**

`packages/admin-server/src/ip-access/ip-access.policy.ts`:

① `import { Inject, Injectable } from '@nestjs/common'` → `import { Inject, Injectable, Logger } from '@nestjs/common'`.

② 머리 주석 끝에 더한다:

```ts
// 2f-2a(스펙 A15 · ④ W1): 진단 경고 둘 — 주소를 못 읽어 막았을 때(clientIp · trust proxy 오설정), global 층 규칙이 없을 때.
//   인스턴스당 한 번씩, 추가 쿼리 없이 이미 읽은 규칙 · 받은 주소로 판정한다. 주소 값을 싣지 않는다.
```

③ 클래스 앞에 상수를 두고 클래스를 바꾼다:

```ts
/** 서버 로그 문구(화면에 나가지 않는다) */
export const IP_POLICY_WARNINGS = {
  nullClientIp:
    '클라이언트 IP 를 읽지 못해 막았다 — 코어 옵션 clientIp 와 Express trust proxy 를 확인한다.',
  noGlobalRule:
    'global 층 IP 규칙이 없다 — 사용자 · 팀 규칙이 없는 계정은 어디서도 들어오지 못한다(README "잠겼을 때").',
} as const

@Injectable()
export class IpAccessPolicy implements AdminAccessPolicy {
  private readonly logger = new Logger('IpAccessPolicy')
  /** 🔴 인스턴스당 한 번씩 — 매 인증 요청이 부르므로 요청마다 남기면 로그가 쌓인다 */
  private warnedNullIp = false
  private warnedNoGlobal = false

  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  async allows(context: AdminAccessContext): Promise<boolean> {
    const rules = await runQuery(() => ipRuleSetQuery(this.db).execute())
    this.diagnose(context.clientIp, rules)
    return evaluateIpAccess(context.clientIp, rules, {
      userNo: context.userNo,
      teamNos: context.teamNos,
    })
  }

  private diagnose(clientIp: string | null, rules: readonly { scopeType: string }[]): void {
    if (clientIp === null && !this.warnedNullIp) {
      this.warnedNullIp = true
      this.logger.warn(IP_POLICY_WARNINGS.nullClientIp)
    }
    if (!this.warnedNoGlobal && !rules.some((rule) => rule.scopeType === 'global')) {
      this.warnedNoGlobal = true
      this.logger.warn(IP_POLICY_WARNINGS.noGlobalRule)
    }
  }
}
```

- [ ] **Step 4: GREEN**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint && pnpm --filter @ssworks/admin-server test:db ip-access`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/ip-access
git add packages/admin-server/src/ip-access
git commit -m "feat(admin-server): IP 진단 경고 둘 — 주소 없음으로 막음 · global 층 규칙 없음, 인스턴스당 한 번" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: README · changeset · 스펙 정정 · 진행 문서 · 쓰는 쪽 스모크

**Files:**

- Modify: `packages/admin-server/README.md`
- Create: `.changeset/admin-server-auth-paths.md`
- Modify: `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` · `2026-10-14-admin-server-users-roles-design.md` · `2026-10-15-admin-server-accounts-cleanup-design.md` · `2026-10-15-admin-server-ip-access-design.md`(각 §14 한 줄 — 스펙 §13) · `2026-10-15-admin-server-auth-paths-design.md`(§14 R3 — 구현 중 바뀐 것이 있으면)
- Modify: `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`
- Create(저장소 밖): `$TEMP/akss/` 아래 앱 파일들

- [ ] **Step 1: README 를 고친다**

`packages/admin-server/README.md`:

① "### 로그인 판정 · 강제 변경 · 재인증" 의 첫 항목(`- 비밀번호가 먼저다 — …` 로 시작하는 줄) 전체를 바꾼다:

```md
- 순서: (IP 접근 제어를 켰으면) IP → 비밀번호 → 잠김 → 퇴사. 틀리면 언제나 401 `ERR_LOGIN_FAILED`(없는 아이디 · 퇴사 · 잠긴 계정도 같은 응답). 5회 틀리면 15분 잠긴다 — 로그인 · 비밀번호 변경 · 재인증이 한 카운터를 원자적으로 쓴다. 🔴 잠긴 동안의 로그인은 비밀번호가 맞아도 같은 401 이다(정답 여부를 흘리지 않는다). 🔴 막힌 주소의 로그인도 비밀번호를 보지 않고 같은 401 이다 — 막힌 주소에서는 정답을 알아낼 수도, 틀린 비밀번호로 계정을 잠글 수도 없다. IP 접근 제어를 켜면 로그인 401 문구가 모두 "… 허용되지 않은 접속 위치입니다." 까지 말한다. 잠기지 않았고 맞으면 퇴사 403. 카운터는 로그인이 성공할 때만 0 으로 돌아간다. 로그인된 본인의 비밀번호 변경 · 재인증은 잠김을 423 으로 알린다.
```

② 같은 절 둘째 항목(`- 퇴사: …`)에서 `IP 접근 제어를 켜면 로그인 · 매 요청 · 갱신이 퇴사 다음에 IP 를 본다` 로 시작해 `details.clientIp` 뒤의 `).` 로 끝나는 문장을 바꾼다:

```md
IP 접근 제어를 켜면 매 요청은 퇴사 다음에, 갱신은 퇴사보다 먼저 IP 를 본다(막히면 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp`). 로그인은 위의 순서다.
```

③ "## 사용자 · 계정" 의 **동시 쓰기 재시도** 항목의 마지막 문장 `즉시 퇴사 · 비밀번호 초기화가 그 계정의 토큰 갱신과 겹치면 드물게 교착(1213)해 어느 한쪽이 409 다 — 대개 끊길 세션 쪽이다.` 를 바꾼다:

```md
즉시 퇴사 · 비밀번호 초기화 · 본인 비밀번호 변경은 그 계정의 토큰 갱신 · 로그인과 겹쳐도 교착하지 않는다 — 갱신 · 로그인이 사용자 행을 먼저 기다렸다가 퇴사 403 · 끝난 세션 401 · 로그인 실패 401 로 끝난다(옛 비밀번호로 세션이 남지 않는다).
```

④ "## IP 접근 제어" 의 **판정** 항목 전체를 바꾼다:

```md
- **판정**: 매 요청 · 토큰 갱신이 IP 를 본다(갱신은 퇴사보다 먼저). 막히면 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp` — admin-ui `IpBlockedDialog` 가 읽는 값이다. 🔴 로그인은 비밀번호보다 먼저 IP 를 보고, 막히면 비밀번호를 확인하지 않은 채 틀린 비밀번호와 같은 401 `ERR_LOGIN_FAILED` 다(문구 "… 허용되지 않은 접속 위치입니다." — IP 접근 제어를 켜면 모든 로그인 실패가 이 문구다). 막힌 주소에서는 정답을 알아낼 수 없고 실패 카운터도 움직이지 않는다. 그래서 로그인 화면은 `IpBlockedDialog` 를 띄우지 않는다 — 로그인 뒤 막히면(매 요청 · 갱신) 띄운다. 감사 행 `auth.login.blocked.ip`(401) · `auth.access.blocked.ip`(403). 규칙을 바꿔도 세션은 끊지 않는다 — 막힌 주소의 요청이 403 을 받고, 규칙을 풀면 같은 세션이 다시 된다.
```

⑤ 같은 절의 **캐시 없음** 항목 다음에 항목을 더한다:

```md
- **진단 경고**: 정책이 주소를 읽지 못해 막았을 때(`clientIp` 출처 · `trust proxy` 설정 오류)와 global 층 규칙이 하나도 없을 때 `IpAccessPolicy` 가 `Logger.warn` 을 프로세스당 한 번씩 남긴다 — 주소 값은 싣지 않는다. 모든 로그인이 401 로 막히면 이 경고와 감사 행 `auth.login.blocked.ip` 의 `ip` 칸(주소 없음이면 비었다)을 먼저 본다.
```

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-auth-paths.md`(새):

```md
---
'@ssworks/admin-server': minor
---

**쓰는 쪽이 할 일:** `AdminAuthModule.withRepository` 로 리포지토리를 바꿨다면 `updateLoginState` 를 지우고 `lockCredential(trx, userNo, 'share' | 'update')`(받은 트랜잭션 위의 잠금 읽기 — 🔴 `'share'` 는 `LOCK IN SHARE MODE`, MariaDB 는 `FOR SHARE` 를 받지 않는다 · 잠그는 행은 `sessions.user_no` FK 가 가리키는 그 `users` 행) · `writeLoginState(trx, userNo, state)`(잠금 두 컬럼만)를 구현한다. 카운터의 원자성은 이제 패키지가 맡는다. 로그인 화면은 IP 로 막힌 로그인에서 `IpBlockedDialog` 대신 로그인 실패 문구를 보인다.

admin-server 인증 경로(Phase 2 PR 2f-2a): 로그인은 IP(정책이 있을 때) → 비밀번호 → 확정 트랜잭션(잠근 사용자 행으로 잠김 · 퇴사 판정 → 카운터 되돌림 → 세션). 막힌 주소의 로그인은 403 `ERR_IP_NOT_ALLOWED` 대신 비밀번호를 보지 않고 401 `ERR_LOGIN_FAILED`(감사 행도 401 — 액션 `auth.login.blocked.ip` 그대로)이고, 막힌 주소의 틀린 비밀번호는 세지 않는다. 잠김 · 퇴사로 막힌 맞은 비밀번호는 카운터를 되돌리지 않는다. IP 정책이 있으면 로그인 401 문구가 모두 "… 허용되지 않은 접속 위치입니다." 다. 검증과 확정 사이에 초기화 · 즉시 퇴사가 커밋되면 세션을 남기지 않는다(401 · 403). 토큰 회전 · 유예 발급은 사용자 행을 공유 잠금으로 먼저 잡아 즉시 퇴사 · 비밀번호 초기화 · 본인 비밀번호 변경과 교착하지 않고, IP 를 퇴사보다 먼저 본다(퇴사했고 막힌 주소면 403 IP). 회전이 초기화 · 퇴사 · 로그아웃에 지면 401 문구가 "세션이 종료되었습니다" 다. IP 정책의 진단 경고 둘(주소 없음 · global 규칙 없음). 아직 `private` 이라 npm 에 나가지 않는다.
```

- [ ] **Step 3: tarball 을 만들고 스모크 앱을 쓴다**

```bash
docker ps --filter name=admin-kit-test-db --format "{{.Names}} {{.Status}}"
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server build
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
mkdir -p "$TEMP/akss/src/migrations"
pnpm --filter @ssworks/admin-shared pack --pack-destination "$TEMP/akss"
pnpm --filter @ssworks/admin-server pack --pack-destination "$TEMP/akss"
ls "$TEMP/akss"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "test-support|[.]test[.]js" || echo "테스트 파일 없음"
```

Expected: 컨테이너 `Up`, tarball 둘, 마지막 줄 `테스트 파일 없음`.

🔴 이 단계의 폴더는 **포그라운드** 명령으로 만든다. 앱 파일(`package.json` · `tsconfig.json` · `.env` · `kysely.config.ts` · `src/main.ts` · `src/seed.ts` · `src/app.module.ts` · 스텁 열둘 · `check.mjs` 의 도우미)은 **2f-1 플랜 Task 13 Step 3**(`docs/superpowers/plans/2026-10-15-admin-server-ip-access.md` — 거기서 가리키는 2e-2 · 2d-2 · 2d-1 · 2c 플랜의 파일 포함)과 같다 — 그대로 옮겨 쓰고 tarball 이름만 `ls` 결과로 맞춘다. 바꾸는 것 둘:

① `$TEMP/akss/src/seed.ts` 끝에 계정을 하나 더 넣는다 — `admin` 을 넣는 코드와 같은 방식으로 아이디 `staff` · 비밀번호 `smoke-pass-5678` · 역할 `직원`(시드가 만든 둘째 역할)인 계정.

② `$TEMP/akss/check.mjs` 의 본문(도우미 `send` · `show` · `bigint` · `waitForServer` · `login` 아래)을 이것으로 바꾼다:

```js
await waitForServer()
const admin = await login('admin', 'smoke-pass-1234')
const staff = await login('staff', 'smoke-pass-5678')
const write = (method, path, body) => send(path, { method, cookie: admin, body })
const read = (path) => send(path, { cookie: admin })
const staffNo = JSON.parse((await send('/admin/auth/me', { cookie: staff })).text).data.userNo

show('admin-refresh', await send('/admin/auth/refresh', { method: 'POST', cookie: admin }))
const rule = await write('POST', '/admin/ip-access', {
  scopeType: 'user',
  scopeRefNo: staffNo,
  cidr: '10.0.0.0/8',
})
show('ip-block-staff', rule)
show(
  'staff-login-blocked-right',
  await send('/admin/auth/login', {
    method: 'POST',
    body: { userId: 'staff', password: 'smoke-pass-5678' },
  }),
)
show(
  'staff-login-blocked-wrong',
  await send('/admin/auth/login', {
    method: 'POST',
    body: { userId: 'staff', password: 'wrong-pass-0000' },
  }),
)
const ruleNo = bigint(JSON.parse(rule.text).data.item.ruleNo)
show('ip-unblock-staff', await write('DELETE', `/admin/ip-access/${ruleNo}`, { revision: 0 }))
show('staff-reset', await write('POST', `/admin/users/${bigint(staffNo)}/password-reset`, {}))
show(
  'staff-refresh-after-reset',
  await send('/admin/auth/refresh', { method: 'POST', cookie: staff }),
)
show(
  'audit-login-blocked',
  await read('/admin/audit-logs?itemsPerPage=5&filter%5Baction%5D=auth.login.blocked.ip'),
)
```

🔴 시나리오 대조: `staffNo` 는 `/me` 의 `"BigInt(n)"` 래퍼 그대로 본문에 보낸다(서버 리바이버가 bigint 로 푼다) · URL 에는 `bigint()` 로 푼 숫자. 스모크 서버는 `127.0.0.1` 로 듣는다 — `staff` 의 사용자 규칙 `10.0.0.0/8` 은 그를 막고 `admin` 은 막지 않는다(자기 잠금 아님). 재인증 옵션은 꺼져 있다(2d-2 스모크와 같다 — 켜져 있으면 본문에 `currentPassword: 'smoke-pass-1234'`). 본문 · 쿼리에 백슬래시가 없다.

- [ ] **Step 4: 설치 · 빌드 · 마이그레이션 · 시드**

```bash
cd "$TEMP/akss"
pnpm install
pnpm build
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists akss; create database akss"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
```

Expected: 설치 성공 · 마이그레이션 12장 · 시드 성공(계정 둘). `tsc` 오류가 2a 때의 제3자 d.ts 말고 있으면 기록한다.

- [ ] **Step 5: 기동 · 요청**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected(본문은 줄여 적는다):

- `admin-refresh 200`
- `ip-block-staff 201 {…"item":{…"scopeType":"user"…"cidr":"10.0.0.0/8"…}}`
- `staff-login-blocked-right 401 {"success":false,"code":"ERR_LOGIN_FAILED","message":"아이디 또는 비밀번호가 올바르지 않거나, 로그인 실패가 반복되어 잠시 잠겼거나, 허용되지 않은 접속 위치입니다."}` — `details` 없음
- `staff-login-blocked-wrong 401` — 같은 본문
- `ip-unblock-staff 200 {"success":true,"data":{}}`
- `staff-reset 200 {…"temporaryPassword":"…"…}`
- `staff-refresh-after-reset 401 {…"code":"ERR_INVALID_TOKEN","message":"세션이 종료되었습니다. 다시 로그인해 주세요."}`
- `audit-login-blocked 200 {…}` — `auth.login.blocked.ip` 둘, `statusCode` 401 · `errorCode` `ERR_LOGIN_FAILED`.

이어서 `docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akss -e "select user_id, login_fail_count from users order by user_no"` 로 `staff` 의 `login_fail_count` 가 0(초기화가 0 으로 — 막힌 동안의 틀린 비밀번호는 세지 않았다)인지 본다. `server.log` 에 `IpAccessPolicy` 경고가 없다(주소가 있고 global 시드가 있다).

셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
```

- [ ] **Step 7: 스펙 · 진행 문서를 고친다**

숫자(N · M)는 저장소 루트에서 `pnpm check` · `pnpm test:db` 를 돌린 결과로 채운다(admin-server 테스트 수 · DB 테스트 수).

① 스펙 §13 의 정정 넷 — 각 문서 §14 끝에 한 줄씩 더한다:

- `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` §14: `- **R(2f-2a) — 인증 경로(2026-10-15, docs/superpowers/specs/2026-10-15-admin-server-auth-paths-design.md).** §5-1 로그인 순서가 IP(정책이 있을 때) → 비밀번호 → 확정 트랜잭션(잠근 행으로 잠김 → 퇴사 → 되돌림 → 세션)으로 바뀌었고 막힌 로그인은 401 ERR_LOGIN_FAILED · 감사 401(② I1 · A5 · A6). §4-3 리포지토리와 R8 의 updateLoginState 가 lockCredential · writeLoginState 로 바뀌고 원자성은 패키지 도우미가 맡는다(A10). §5-3 회전 · 유예 발급은 users 공유 잠금이 첫 문장이고 IP → 퇴사 순서다(A7 · A8).`
- `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` §14: `- **R(2f-2a) — 회전 교착(2026-10-15, 2f-2a 스펙).** R10-3(즉시 퇴사 · 초기화 ∥ 회전의 교착)이 닫혔다 — 회전 · 유예 발급이 users 를 공유 잠금으로 먼저 잡는다(2f-2a 스펙 §5-3). 로그인 TOCTOU 도 확정 트랜잭션으로 닫혔다.`
- `docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md` §14: `- **R(2f-2a) — C5 근거(2026-10-15, 2f-2a 스펙).** C5 의 근거 중 회전 교착(2d R10-3)이 사라졌다 — 세션 폐기를 쓰기 단계에 두는 배치는 그대로다(ON 의 대상 로그아웃 1020 → 409 는 남는다).`
- `docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md` §14: `- **R(2f-2a) — 인증 연결(2026-10-15, 2f-2a 스펙).** P11 의 순서(퇴사 → IP)가 IP → 퇴사로 바뀌었다(2f-2a A7). §9-2 의 "로그인 403(비밀번호 맞은 뒤)" 은 401(비밀번호 전 — 2f-2a ② I1)이다. P2 정책에 진단 경고 둘(2f-2a A15).`

② `docs/superpowers/specs/2026-10-15-admin-server-auth-paths-design.md` §14 — 구현 · 리뷰 중 바뀐 것이 있으면 `R3` 이하로 더한다(없으면 그대로).

③ `docs/01-phase0.md`:

- §8 표 `@ssworks/admin-server` 행 상태 칸 끝(`… 다음 2f-2`)을 바꾼다: `… 다음 2f-2. **PR 2f-2a 완료**(`feat/admin-server-auth-paths`, 2026-10-15) — 로그인 IP 먼저 · 확정 트랜잭션(TOCTOU) · 회전 users 공유 잠금(2d R10-3) · 리포지토리 lockCredential · writeLoginState · IP 진단 경고. N 테스트 + 실 MariaDB M. 플랜 `docs/superpowers/plans/2026-10-15-admin-server-auth-paths.md`. 다음 2f-2b`
- 표 아래 `다음: Phase 2 PR 2f-2 — …` 줄을 `다음: Phase 2 PR 2f-2b — 첫 발행 준비(DB TLS · socketPath · admin-shared peer 하한 · pagination.d.ts TS2536 · IP 파서 조이기)(HANDOFF "다음 플랜").` 으로 바꾼다.

④ `docs/HANDOFF.md`:

- "지금 상태" 표의 `@ssworks/admin-server` 행 끝의 숫자 문장(`571 테스트 + 실 MariaDB 431.`)을 지우고 그 행 끝에 더한다: `**PR 2f-2a**(인증 경로 — 로그인 IP 먼저 · 막힌 로그인 같은 401 · 확정 트랜잭션으로 로그인 TOCTOU 닫음 · 회전 · 유예가 users 공유 잠금 먼저(2d R10-3 교착 없음) · AdminAuthRepository lockCredential · writeLoginState · IP 판정 도우미 · clientIp 필수 · IP 진단 경고 · whileHeld expectWait · failure 한 벌)은 feat/admin-server-auth-paths 에서 구현 완료(2026-10-15). N 테스트 + 실 MariaDB M.`
- "검증" 행 끝에 더한다: `PR 2f-2a 는 Windows 에서 pnpm check · pnpm test:db 초록, 쓰는 쪽 스모크($TEMP/akss — 새 DB · 스텁 12 → 시드(계정 둘) → 기동 → 갱신 → 사용자 규칙으로 직원 막기 → 직원 로그인 401(맞은 · 틀린 비밀번호 같은 문구) → 규칙 삭제 → 초기화 → 옛 refresh 401 → 감사 행 401)를 통과했다.`
- "다음 플랜" 행을 바꾼다: `Phase 2 PR 2f-2b — 첫 발행 준비(새 브랜치, 브레인스토밍부터): AdminDbConnection 의 TLS(ssl) · socketPath, admin-server peer @ssworks/admin-shared 하한(workspace:^0 → 실제로 필요한 최소 버전 — changesets 가 0.x minor 를 major 로 올리지 않는 범위), admin-shared pagination.d.ts TS2536 3건(skipLibCheck: false 소비자), admin-shared IP 파서 조이기(patch — "PR 2f-1 최종 리뷰가 넘긴 것" 의 측정 케이스). 그다음 확인용 앱 실서버 확인 · 첫 발행(결정 ⑥ V1). 직전 PR 2f-2a: 플랜 docs/superpowers/plans/2026-10-15-admin-server-auth-paths.md`
- "PR 2d-2 최종 리뷰가 넘긴 것" 의 `2b rotate 잠금 순서 — …` 항목 끝 `→ 2f` 를 `→ **2f-2a 에서 닫음**(회전 · 유예가 users 공유 잠금 먼저 · 로그인 확정 트랜잭션)` 으로.
- "PR 2f-1 최종 리뷰가 넘긴 것" 의 항목 끝에 더한다: 경합 테스트 `whileHeld` 항목 → ` → **2f-2a 에서 닫음**(expectWait 필수)`, `auth.service.ts 의 정책 판정 블록 셋` → ` → **2f-2a 에서 닫음**(ipVerdict)`, `resolveAuthConfig · resolveAuditConfig 의 clientIp` → ` → **2f-2a 에서 닫음**`, `진단 경고(선택)` → ` → **2f-2a 에서 닫음**`, `로그인은 맞은 비밀번호 뒤에만 IP 를 본다` → ` → **2f-2a 에서 닫음**(IP 먼저 · 같은 401 — 사용자 결정 2026-10-15)`, `테스트 도우미 failure() 중복` → ` → **2f-2a 에서 닫음**(test-support/errors.ts)`. `admin-shared 파서 조이기` 는 그대로(2f-2b).
- 새 항목 `- **PR 2f-2a 최종 리뷰가 넘긴 것(2026-10-15)**` 을 "알려진 미확인 · 보류" 끝에 두고 한 줄 `- (최종 리뷰 뒤에 채운다)` 를 단다. 같은 항목에 미리 한 줄 더한다: `- 테스트 도우미 rejection() 사본 열하나(auth · users · roles · database · sessions 테스트 — 두 모양: promise · run)는 그대로다 — failure() 와 함께 모을지 후속.`

⑤ `CLAUDE.md`:

- 머리 표의 `admin-server` 행 성격 칸 `(… · 2f-1 IP 접근 제어 완료)` 를 `(… · 2f-1 IP 접근 제어 · 2f-2a 인증 경로 완료)` 로.
- "진행 상태와 다음 단계" 표: `**Phase 2 PR 2f-2 — 인증 경로 이월 · 첫 발행 준비**` 행을 `Phase 2 PR 2f-2a — 인증 경로(로그인 IP 먼저 · 확정 트랜잭션 · 회전 users 공유 잠금 · 리포지토리 trx 원시)` · `완료` · `스펙 docs/superpowers/specs/2026-10-15-admin-server-auth-paths-design.md · 플랜 docs/superpowers/plans/2026-10-15-admin-server-auth-paths.md` 로 바꾸고, 그 아래에 `**Phase 2 PR 2f-2b — 첫 발행 준비(DB TLS · socketPath · peer 하한 · TS2536 · IP 파서)**` · `**다음**` · `HANDOFF "다음 플랜"` 행을 더한다.
- "### `@ssworks/admin-server` (Phase 2)" 목록 끝에 한 줄을 더한다:

```md
- 인증 경로는 users 를 세션보다 먼저 잡는다 — 로그인 확정은 `lockCredential(trx, userNo, 'update')`, 회전 · 유예 발급은 `lockCredential(trx, userNo, 'share')`(`LOCK IN SHARE MODE` — MariaDB 는 `FOR SHARE` 가 1064)가 트랜잭션 첫 문장이다. IP 로 막힌 로그인은 비밀번호를 보지 않고 같은 401 이고, IP 판정은 `AdminAuthService.ipVerdict` 하나다. 카운터 쓰기는 `password-check.ts` 의 `updateLoginState` 도우미(리포지토리는 trx 원시만). 경합 테스트의 `whileHeld` 는 `expectWait` 가 필수다.
```

- [ ] **Step 8: 포맷 · 확인 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md .changeset/admin-server-auth-paths.md docs/superpowers/specs docs/01-phase0.md docs/HANDOFF.md CLAUDE.md
pnpm exec prettier --write packages/admin-server/README.md .changeset/admin-server-auth-paths.md docs/superpowers/specs docs/01-phase0.md docs/HANDOFF.md CLAUDE.md
pnpm format:check
pnpm check
pnpm test:db
```

Expected: prettier 두 번째 실행은 `(unchanged)` 뿐, `format:check` · `check` · `test:db` 초록. 숫자를 HANDOFF · phase0 에 적은 값과 맞춘다(다르면 고친다). 작업 공간(`.superpowers/sdd/`)의 md 때문에 `format:check` 가 실패하면 그 경로만 원인인지 보고, 작업 공간을 지운 뒤 다시 돌린다.

```bash
git add packages/admin-server/README.md .changeset/admin-server-auth-paths.md docs CLAUDE.md
git commit -m "docs: PR 2f-2a 인증 경로 — README 로그인 순서 · 막힌 로그인 401 · 교착 없음, changeset, 스펙 정정, 진행 문서, 다음은 2f-2b" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 스펙 대조표 (자체 검토)

| 스펙                                                   | Task                                        |
| ------------------------------------------------------ | ------------------------------------------- |
| ① N1 범위 — 2f-2a 만                                   | 전체(2f-2b 항목 없음)                       |
| ② I1 · A1 · A4 로그인 IP 먼저 · 더미 argon2            | 5 (단위 · DB · HTTP · IP 인증)              |
| A2 · A3 확정 트랜잭션 · stale                          | 5 (StaleRepository · L1 · L2)               |
| A5 문구 · A6 감사 401                                  | 5                                           |
| A7 · A8 회전 · 유예 users S 첫 문장 · IP → 퇴사        | 4 (R1 ~ R4 · 순서 테스트)                   |
| A9 LOCK IN SHARE MODE                                  | 2 (컴파일 SQL · 실제 잠금)                  |
| A10 · A11 카운터 도우미 · 재인증                       | 2                                           |
| A12 세션 저장소 trx                                    | 4                                           |
| A13 ipVerdict · A14 clientIp 필수                      | 3                                           |
| A15 진단 경고                                          | 6                                           |
| A16 whileHeld · A17 failure                            | 1                                           |
| §4 공개 API · §6 응답 변화                             | 2 · 4 · 5 · 7(README · changeset)           |
| §9-2 R1 ~ R4 · L1 · L2 · IP 먼저 · refresh 순서 · HTTP | 4 · 5                                       |
| §9-4 리뷰 초점                                         | Global Constraints 🔴 줄 · 각 Task RED 실험 |
| §10 문서 · 스모크 · §13 정정                           | 2(README 사용자 테이블) · 7                 |
| §14 R1 · R2                                            | 플랜 전 반영 · 7 Step 7 ②                   |
