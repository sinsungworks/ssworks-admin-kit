# admin-server 인증 Implementation Plan (Phase 2 PR 2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@ssworks/admin-server` 에 관리자 인증을 더한다 — argon2id 비밀번호 · JWT 액세스 + 해시 저장 · 회전 refresh · 계정 잠금 · 재사용 탐지(유예창) · 앱 전역 인증 · 권한 가드(fail-closed) · `/admin/auth/{login,refresh,logout,me,password}` · 재인증.

**Architecture:**

- **순수 층:** `auth/*-policy.ts`(잠금 · 유예 · 퇴사 · 만료 판정 — 모두 `now` 를 받는다) · `password.ts`(argon2id) · `refresh-token.ts`(난수 · sha256) · `options.ts`(옵션 해석) · `cookies.ts` · `request-meta.ts` · `errors.ts`(문구 표). 단위 테스트.
- **저장 층:** `AUTH_REPOSITORY`(사용자 쪽 다섯 메서드, 기본 `KyselyAuthRepository`) + 패키지 내부 `AdminSessionStore`(회전 한 트랜잭션). 실 MariaDB 테스트.
- **서비스 층:** `AdminAuthService`(로그인 · 인증 · 회전 · 로그아웃 · 비밀번호 변경) · `AdminReauthService` · `AdminAccessTokenService`(`@nestjs/jwt`). 선택 주입 `ADMIN_ACCESS_POLICY`(2f) · `ADMIN_AUTH_EVENTS`(2c).
- **HTTP 층:** `AdminAuthGuard` → `AdminPermissionGuard`(`APP_GUARD`, 앱 전역) · 데코레이터 · 주입형 본문 파이프 · `AdminAuthController` · `AdminAuthModule`(+`withRepository`). 코어 `ADMIN_ROUTE_MODULES` 가 `/admin` prefix 를 붙인다.

**Tech Stack:** NestJS 12.1 · `@nestjs/jwt` 12.0 · `@node-rs/argon2` 2.2 · Express 5 · cookie-parser · Kysely 0.29 · mariadb 3.5 · MariaDB 11.4(Docker) · zod 4 · vitest 4 · supertest 7

**Spec:** `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` — §2 결정(①~⑩ · B1~B9) · §4 공개 API · §5 흐름 · §6 오류 표 · §9 테스트 계약 · §14 정정 R1~R6. 선행은 2a 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1(Phase 2 지도 · 공통 결정). 플랜과 스펙이 어긋나면 스펙이 이긴다.

**Branch:** `feat/admin-server-auth`(스펙 커밋 위). `main` 에서 직접 작업하지 않는다.

## Global Constraints

- **판:** Node `>=22`. 새 `dependencies` 는 `@nestjs/jwt` `^12.0.2` · `@node-rs/argon2` `^2.2.2` 둘(기존 `cookie-parser` `^1.4.7` 유지). peer · dev 변화 없음. **admin-shared 는 고치지 않는다** — 새 오류 코드 · 스키마가 없다(스펙 §6 · §7).
- **ESM · NodeNext:** 내부 상대 import 는 `.js` 확장자(`./password.js`).
- **import 규칙(admin-server/src):** `verbatimModuleSyntax` 라 타입만 쓰는 것은 `import type`. 🔴 데코레이터가 붙은 시그니처(생성자 · 핸들러 매개변수)의 인터페이스 · 타입 별칭은 `import type`(TS1272). DI 로 받는 클래스(`Reflector` · `AdminSessionStore` · `AdminAuthService` …)는 일반 import. `Kysely` 는 `import type` + `@Inject(KYSELY)`(2a 와 같다).
- **`any` 금지:** eslint `no-explicit-any`(src). 쓰지 않는 인자 · 변수는 `_` 접두.
- **로그:** `console.log` 금지. Nest 클래스는 `new Logger(이름)` 의 `warn` · `error` 를 **문자열 하나**로 부른다. 🔴 비밀번호 · 토큰 · 해시 · `jwtSecret` 값을 로그 · 오류 메시지 · 이벤트에 싣지 않는다.
- **오류:** 서비스 · 가드 · 파이프는 admin-shared `BusinessError`(코드는 `CommonErrorCodes`)만 던진다. 상태는 코어 표(스펙 §6). 문구는 `auth/errors.ts` 의 `AUTH_MESSAGES`(Task 7) 하나에서 가져온다 — 테스트도 같은 상수를 본다.
- **메타데이터 키:** `admin-kit:` 접두(`tokens.ts`).
- **시계:** 판정 함수는 `now: Date` 를 받는다. 서비스 메서드는 들어올 때 `new Date()` 하나를 만들어 끝까지 쓴다. 경계: 잠김 `lockUntil > now` · 세션 만료 `expireAt <= now` · 퇴사 `resignAt <= now` · 유예 `-5000 <= now - revokedAt <= graceMs`(스펙 §5-5).
- **🔴 argon2(`hashPassword` · `verifyPassword`)는 트랜잭션 밖에서만 부른다.**
- **머리 주석:** 정본에서 가져온 파일은 `정본: …` 과 `바꾼 점:` 을 적는다. `🔴` 는 "지우면 사고가 나는 이유" 다.
- **포맷:** prettier(세미콜론 없음 · 작은따옴표 · 100자 · trailing comma all). Task 끝마다 `pnpm exec prettier --write <바꾼 파일들>`.
- **Windows · Linux 양쪽:** `> /dev/null` · `2>/dev/null` 금지(Windows 에서 `NUL` 파일). 파일을 python · sed 로 다시 쓰지 않는다(LF). npm 스크립트에 작은따옴표 · 글롭 금지. 🔴 이 플랜의 코드에는 백슬래시가 없다 — 넣게 되면 도구 입력에서 이스케이프가 풀리지 않았는지 `node -e "console.log([...require('fs').readFileSync('<파일>','utf8')].filter(c=>c.charCodeAt(0)===92).length)"` 로 센다.
- **참조 프로젝트(`../hangang-home` · `../ssworks-gise-home` 등)는 읽기만 한다.**
- **커밋:** 한국어 conventional commits(`feat(admin-server): …`), 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `pnpm release` · `npm publish` · `pnpm stage approve` 하지 않는다.
- **Task 마다:** `pnpm check` 초록. DB 가 걸린 Task(5 · 6 · 8 · 9 · 10 · 12)는 `pnpm test:db` 도 초록 — Docker `admin-kit-test-db` 가 꺼져 있으면 `docker start admin-kit-test-db`, 없으면 저장소 루트에서 `pnpm db:test:up`.

## Review Focus

스펙이 말하지 않았지만 쓰는 사람이 실제로 부딪칠 입력 다섯. 각 줄의 테스트는 해당 Task 에 들어 있다.

1. **아이디의 대소문자 · 끝 공백(모바일 자동완성 `admin `)** — `userId` 는 `utf8mb4_unicode_ci`(대소문자 무시 · PAD SPACE)라 `ADMIN` · `admin ` 도 같은 계정이다. 같은 계정으로 로그인돼야 하고, 앞 공백(` admin`)은 다른 아이디다 → Task 5 리포지토리 테스트.
2. **비밀번호의 앞뒤 공백 · 한글** — 다듬지 않고 그대로 비교한다. `' 한글 비번 '` 으로 만든 계정은 그 값으로만 들어오고 `'한글 비번'` 으로는 401 → Task 8 로그인 테스트.
3. **이모지가 든 600자 User-Agent** — 로그인이 실패하지 않고, 코드 포인트 단위로 512자에서 잘려 저장된다(서로게이트 반쪽을 남기지 않는다) → Task 6 저장소 테스트.
4. **권한 JSON 이 깨진 역할의 계정** — 로그인 200, `/me` 의 `permissions: []`, 권한 라우트 403 — 500 이 아니다 → Task 12.
5. **액세스 쿠키만 수명이 다해 사라지고 refresh 쿠키가 남은 브라우저** — `/me` 401 `ERR_COMMON_UNAUTHORIZED` → refresh 200 → `/me` 200(admin-ui 클라이언트의 흐름 그대로) → Task 12.

---

## 파일 구조

```
packages/admin-server/
  package.json                          (Task 1 — dependencies 둘)
  README.md                             (Task 13 — 인증 절)
  src/
    tokens.ts                           (Task 3 · 7 — 토큰 · 메타 키)
    options.ts                          (Task 3 — auth · passwordPolicy)
    admin-server.module.ts              (Task 11 — ADMIN_ROUTE_MODULES)
    index.ts · runner.ts                (Task 1 runner · Task 11 index)
    runner-graph.test.ts                (Task 1)
    database/tables/users.ts            (Task 5 — resignAt 주석, R1)
    database/migrations/0002_users.ts   (Task 5 — resignAt 컬럼 주석)
    auth/
      password.ts · refresh-token.ts (+tests)                         (Task 1)
      login-policy.ts · account-policy.ts · refresh-policy.ts (+tests) (Task 2)
      options.ts · cookies.ts · request-meta.ts (+tests)              (Task 3)
      access-token.service.ts (+test)                                (Task 4)
      auth.repository.ts · kysely-auth.repository.ts (+db test)      (Task 5)
      session.store.ts (+db test)                                    (Task 6)
      errors.ts · hooks.ts · principal.ts · decorators.ts · permission.guard.ts (+tests)  (Task 7)
      password-check.ts · auth.service.ts (+db test login)           (Task 8)
      auth.service.ts (+db test refresh)                             (Task 9)
      auth.service.ts · reauth.service.ts (+db test password)        (Task 10)
      auth.guard.ts · auth.pipes.ts · auth.controller.ts · admin-auth.module.ts · auth.http.test.ts  (Task 11)
      auth.http.db.test.ts                                           (Task 12)
    test-support/
      auth.ts                           (Task 5 시드 → Task 6 잠금 연결 → Task 8 가짜 · 조립)
      auth-probe.ts                     (Task 11 — 프로브 컨트롤러 · 앱 부트)
.changeset/admin-server-auth.md         (Task 13)
docs/01-phase0.md · docs/HANDOFF.md · CLAUDE.md · 스펙 §14  (Task 13)
```

---

### Task 1: 의존성 · 비밀번호 · refresh 토큰 · 러너 export

새 dependency 둘을 넣고, Nest 무의존인 두 유틸을 만든다. `hashPassword` · `verifyPassword` 는 러너 진입점으로도 낸다(스펙 B5 — 시드 스크립트가 Nest 없이 계정을 만든다).

**Files:**

- Modify: `packages/admin-server/package.json`(dependencies)
- Create: `packages/admin-server/src/auth/password.ts` · `password.test.ts`
- Create: `packages/admin-server/src/auth/refresh-token.ts` · `refresh-token.test.ts`
- Modify: `packages/admin-server/src/runner.ts` · `src/runner-graph.test.ts`

**Interfaces:**

- Produces:
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(passwordHash: string, password: string): Promise<boolean>` — 깨진 해시는 던진다
  - `DUMMY_PASSWORD_HASH: string`
  - `createRefreshToken(): string`(128자 hex) · `hashRefreshToken(token: string): string`(64자 hex)

- [ ] **Step 1: 의존성을 넣는다**

저장소 루트에서:

```bash
pnpm --filter @ssworks/admin-server add @nestjs/jwt@^12.0.2 @node-rs/argon2@^2.2.2
```

Expected: `packages/admin-server/package.json` 의 `dependencies` 가 `@nestjs/jwt` · `@node-rs/argon2` · `cookie-parser` 셋. `pnpm-lock.yaml` 에 이 PC 의 프리빌드(`@node-rs/argon2-win32-x64-msvc` 또는 `-linux-x64-gnu`)가 있다(스펙 §14 R1-2). "Ignored build scripts" 경고가 나와도 argon2 는 빌드 스크립트 없이 프리빌드를 쓴다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/password.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js'

const ARGON2ID_PREFIX = '$argon2id$v=19$m=65536,t=3,p=4$'

describe('hashPassword · verifyPassword', () => {
  it('argon2id m=65536 · t=3 · p=4 로 해시하고 같은 입력만 맞다', async () => {
    const encoded = await hashPassword('correct horse 비번')
    expect(encoded.startsWith(ARGON2ID_PREFIX)).toBe(true)
    expect(await verifyPassword(encoded, 'correct horse 비번')).toBe(true)
    expect(await verifyPassword(encoded, 'correct horse 비번 ')).toBe(false)
    expect(await verifyPassword(encoded, 'Correct horse 비번')).toBe(false)
  })

  it('같은 비밀번호도 매번 다른 해시다(솔트)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })

  it('🔴 더미 해시는 같은 매개변수다 — 없는 계정도 같은 비용을 치른다', async () => {
    expect(DUMMY_PASSWORD_HASH.startsWith(ARGON2ID_PREFIX)).toBe(true)
    for (const input of ['', 'password', '1234', 'admin']) {
      expect(await verifyPassword(DUMMY_PASSWORD_HASH, input)).toBe(false)
    }
  })

  it('🔴 깨진 해시는 던진다 — 데이터 손상이 조용히 "비밀번호 틀림" 이 되지 않는다', async () => {
    await expect(verifyPassword('garbage', 'x')).rejects.toThrow()
  })
})
```

`packages/admin-server/src/auth/refresh-token.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRefreshToken, hashRefreshToken } from './refresh-token.js'

describe('refresh 토큰', () => {
  it('512비트 난수 — 128자 소문자 hex, 매번 다르다', () => {
    const a = createRefreshToken()
    expect(a).toMatch(/^[0-9a-f]{128}$/)
    expect(createRefreshToken()).not.toBe(a)
  })

  it('🔴 sha256 hex 64자 · 결정적 — 조회 키로 쓴다', () => {
    expect(hashRefreshToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    const token = createRefreshToken()
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token))
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/password.test.ts src/auth/refresh-token.test.ts`
Expected: FAIL — `Failed to resolve import "./password.js"` · `"./refresh-token.js"`.

- [ ] **Step 4: 구현한다**

`packages/admin-server/src/auth/password.ts`:

```ts
import { hash, verify } from '@node-rs/argon2'

// 정본: ssworks-gise-home apps/api/src/core/auth/password.util.ts (= hangang-home core/utils/password.util.ts —
//       네 정본의 매개변수가 같다)
// 바꾼 점: 더미 해시를 여기로 옮겼다(gise 는 auth.service.ts). 러너 진입점이 낸다 — 시드 스크립트(B)가 Nest 없이
//   계정을 만든다(스펙 B5).

/**
 * Argon2id, m=64MiB · t=3 · p=4.
 * 🔴 매개변수를 낮추지 마라 — 이 비용 자체가 로그인 · 비밀번호 변경 · 재인증의 두 번째 속도 제한이다(첫째는 edge 의
 *    IP 단위 제한, 쓰는 쪽 몫). 계정 잠금은 여기에 도움이 되지 않는다 — 잠긴 계정도 비밀번호 검증을 먼저 거친다(의도된
 *    순서, 스펙 §5-1).
 * 🔴 `algorithm` 은 숫자 2(Argon2id)다 — `@node-rs/argon2` 의 `Algorithm` 은 const enum 이라 `isolatedModules` 에서
 *    값으로 쓸 수 없다(스펙 §14 R1-2, gise 와 같다).
 */
const HASH_OPTIONS = {
  algorithm: 2,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
} as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS)
}

/**
 * 🔴 해시가 깨졌으면 던진다(`Decoding failed`) — 데이터 손상이 조용히 "비밀번호 틀림" 이 되지 않게 한다. 호출부를 지나
 *    500(마스킹)이 된다.
 */
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password)
}

/**
 * 존재하지 않는 계정에도 argon2 검증을 한 번 태워 응답 시간을 맞춘다 — 안 그러면 응답 지연 차이만으로 계정 존재 여부가
 * 열거된다(gise). 같은 매개변수여야 같은 비용이 든다(테스트가 접두를 고정한다). 값은 gise 의
 * `hashPassword('never-matches-anything')` 결과다.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$bZ+HSIFQZdx1rbnNqDhj7Q$J7M0y3oOHAddakZGqIdGM+1Lwtx6s+f/NZ77RsGuRwI'
```

`packages/admin-server/src/auth/refresh-token.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto'

// 정본: ssworks-gise-home apps/api/src/modules/auth/token.util.ts (= hangang-home modules/auth/token.util.ts)
// 바꾼 점: 없음. hangang 의 UNIQUE 충돌 재시도(3회)는 옮기지 않았다 — 512비트 난수라 충돌하지 않는다.

/** 64바이트 난수 → 128자 hex. 엔트로피 512비트. */
export function createRefreshToken(): string {
  return randomBytes(64).toString('hex')
}

/**
 * 🔴 sha256 이다, argon2 가 아니다. 이 값은 조회 키다(`where refreshTokenHash = ?`) — argon2 는 솔트가 매번 달라 값으로
 *    인덱스를 못 탄다. 솔트도 느린 KDF 도 필요 없는 이유는 입력이 이미 512비트 난수라 사전 공격 대상이 아니기 때문이고,
 *    목표는 "덤프가 새도 유효 토큰이 나오지 않는다" 하나다(gise · hangang).
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/password.test.ts src/auth/refresh-token.test.ts`
Expected: PASS(6 tests). 해시 한 번이 수십 ms 안쪽이다(스펙 §14 R1-2).

- [ ] **Step 6: 러너 진입점으로 낸다**

`packages/admin-server/src/runner.ts` 끝에 더한다:

```ts
export { hashPassword, verifyPassword } from './auth/password.js'
```

`packages/admin-server/src/runner-graph.test.ts` 의 첫 `it` 끝(`expect(packages).toContain('kysely')` 다음 줄)에 더한다:

```ts
// 시드 스크립트가 러너로 계정을 만든다(스펙 B5) — argon2 는 Nest 무의존이다
expect(packages).toContain('@node-rs/argon2')
```

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/runner-graph.test.ts`
Expected: PASS — 러너 그래프에 `@nestjs/` 가 여전히 없다.

- [ ] **Step 7: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/runner.ts packages/admin-server/src/runner-graph.test.ts
pnpm check
git add packages/admin-server/package.json pnpm-lock.yaml packages/admin-server/src/auth packages/admin-server/src/runner.ts packages/admin-server/src/runner-graph.test.ts
git commit -m "$(cat <<'EOF'
feat(admin-server): argon2id 비밀번호 · refresh 토큰 유틸, 러너에 hashPassword

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

Expected: `pnpm check` 초록.

---

### Task 2: 판정 순수 함수 — 잠금 · 퇴사 · 만료 · 유예

**Files:**

- Create: `packages/admin-server/src/auth/login-policy.ts` · `login-policy.test.ts`
- Create: `packages/admin-server/src/auth/account-policy.ts` · `account-policy.test.ts`
- Create: `packages/admin-server/src/auth/refresh-policy.ts` · `refresh-policy.test.ts`

**Interfaces:**

- Produces:
  - `interface LoginLockout { maxFailures: number; lockMs: number }` · `DEFAULT_LOCKOUT`(5 · 900 000)
  - `interface AdminLoginState { loginFailCount: number; lockUntil: Date | null }`
  - `isLocked(lockUntil: Date | null, now: Date): boolean`
  - `nextLoginState(current: AdminLoginState, outcome: 'success' | 'fail', now: Date, lockout?: LoginLockout): AdminLoginState`
  - `needsReset(state: AdminLoginState): boolean`
  - `isResigned(resignAt: Date | null, now: Date): boolean` · `isSessionExpired(expireAt: Date, now: Date): boolean`
  - `CLOCK_SKEW_TOLERANCE_MS = 5000` · `isWithinRefreshGrace(revokedAt: Date | null, now: Date, graceMs: number): boolean`
  - `interface RotatedSessionView { userNo: bigint; revokedAt: Date | null; replacedBySessionNo: bigint | null }`
  - `interface SuccessorSessionView { sessionNo: bigint; userNo: bigint; isRevoked: boolean; expireAt: Date }`
  - `judgeRotatedReuse(rotated: RotatedSessionView, successor: SuccessorSessionView | null, now: Date, graceMs: number): 'grace' | 'reuse'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/login-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCKOUT, isLocked, needsReset, nextLoginState } from './login-policy.js'

const now = new Date('2026-10-13T00:00:00.000Z')
const at = (ms: number) => new Date(now.getTime() + ms)

describe('isLocked', () => {
  it('lockUntil 이 지금보다 뒤면 잠김 — 같은 순간은 풀림', () => {
    expect(isLocked(null, now)).toBe(false)
    expect(isLocked(at(1), now)).toBe(true)
    expect(isLocked(at(0), now)).toBe(false)
    expect(isLocked(at(-1), now)).toBe(false)
  })
})

describe('nextLoginState', () => {
  it('기본값은 5회 · 15분', () => {
    expect(DEFAULT_LOCKOUT).toEqual({ maxFailures: 5, lockMs: 15 * 60 * 1000 })
  })

  it('실패 1~4회는 잠그지 않고 5회째 now + lockMs 로 잠근다', () => {
    let state: { loginFailCount: number; lockUntil: Date | null } = {
      loginFailCount: 0,
      lockUntil: null,
    }
    for (let count = 1; count <= 4; count += 1) {
      state = nextLoginState(state, 'fail', now)
      expect(state).toEqual({ loginFailCount: count, lockUntil: null })
    }
    expect(nextLoginState(state, 'fail', now)).toEqual({
      loginFailCount: 5,
      lockUntil: at(DEFAULT_LOCKOUT.lockMs),
    })
  })

  it('🔴 잠긴 동안의 실패는 카운트만 오르고 lockUntil 을 늘리지 않는다(1회 비용 DoS 방지)', () => {
    expect(nextLoginState({ loginFailCount: 5, lockUntil: at(60_000) }, 'fail', now)).toEqual({
      loginFailCount: 6,
      lockUntil: at(60_000),
    })
  })

  it('🔴 잠금이 끝난 뒤 첫 실패는 1부터 다시 센다 — 같은 순간도 끝난 것이다', () => {
    expect(nextLoginState({ loginFailCount: 5, lockUntil: at(0) }, 'fail', now)).toEqual({
      loginFailCount: 1,
      lockUntil: null,
    })
    expect(nextLoginState({ loginFailCount: 7, lockUntil: at(-1) }, 'fail', now)).toEqual({
      loginFailCount: 1,
      lockUntil: null,
    })
  })

  it('성공은 { 0, null } — 잠겨 있었어도', () => {
    expect(nextLoginState({ loginFailCount: 3, lockUntil: at(5000) }, 'success', now)).toEqual({
      loginFailCount: 0,
      lockUntil: null,
    })
  })

  it('lockout 값을 받는다', () => {
    expect(
      nextLoginState({ loginFailCount: 2, lockUntil: null }, 'fail', now, {
        maxFailures: 3,
        lockMs: 1000,
      }),
    ).toEqual({ loginFailCount: 3, lockUntil: at(1000) })
  })
})

describe('needsReset', () => {
  it('카운트나 잠금이 남아 있을 때만 참 — 성공 때 쓰기를 아낀다', () => {
    expect(needsReset({ loginFailCount: 0, lockUntil: null })).toBe(false)
    expect(needsReset({ loginFailCount: 1, lockUntil: null })).toBe(true)
    expect(needsReset({ loginFailCount: 0, lockUntil: at(-1000) })).toBe(true)
  })
})
```

`packages/admin-server/src/auth/account-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isResigned, isSessionExpired } from './account-policy.js'

const now = new Date('2026-10-13T00:00:00.000Z')
const at = (ms: number) => new Date(now.getTime() + ms)

describe('isResigned — resignAt 은 효력 시각(스펙 R1)', () => {
  it('같은 순간부터 퇴사, 1ms 전은 재직, null 은 재직', () => {
    expect(isResigned(null, now)).toBe(false)
    expect(isResigned(at(1), now)).toBe(false)
    expect(isResigned(at(0), now)).toBe(true)
    expect(isResigned(at(-1), now)).toBe(true)
  })
})

describe('isSessionExpired', () => {
  it('expireAt 과 같은 순간이면 만료', () => {
    expect(isSessionExpired(at(1), now)).toBe(false)
    expect(isSessionExpired(at(0), now)).toBe(true)
    expect(isSessionExpired(at(-1), now)).toBe(true)
  })
})
```

`packages/admin-server/src/auth/refresh-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CLOCK_SKEW_TOLERANCE_MS,
  isWithinRefreshGrace,
  judgeRotatedReuse,
  type RotatedSessionView,
  type SuccessorSessionView,
} from './refresh-policy.js'

const revokedAt = new Date('2026-10-13T00:00:00.000Z')
const after = (ms: number) => new Date(revokedAt.getTime() + ms)

describe('isWithinRefreshGrace', () => {
  it('경과가 −5000 ~ graceMs 면 창 안이다(양 끝 포함)', () => {
    expect(isWithinRefreshGrace(revokedAt, after(0), 30_000)).toBe(true)
    expect(isWithinRefreshGrace(revokedAt, after(30_000), 30_000)).toBe(true)
    expect(isWithinRefreshGrace(revokedAt, after(30_001), 30_000)).toBe(false)
    expect(isWithinRefreshGrace(revokedAt, after(-CLOCK_SKEW_TOLERANCE_MS), 30_000)).toBe(true)
    expect(isWithinRefreshGrace(revokedAt, after(-CLOCK_SKEW_TOLERANCE_MS - 1), 30_000)).toBe(false)
  })

  it('🔴 시계 오차 하한은 5초로 고정이다 — 넓히면 시계가 앞선 서버가 쓴 행에서 탐지가 꺼진다(gise)', () => {
    expect(CLOCK_SKEW_TOLERANCE_MS).toBe(5000)
  })

  it('revokedAt 이 null 이거나 graceMs 가 0 이면 창 밖', () => {
    expect(isWithinRefreshGrace(null, after(0), 30_000)).toBe(false)
    expect(isWithinRefreshGrace(revokedAt, after(0), 0)).toBe(false)
  })
})

describe('judgeRotatedReuse', () => {
  const now = after(1000)
  const rotated: RotatedSessionView = { userNo: 1n, revokedAt, replacedBySessionNo: 20n }
  const successor: SuccessorSessionView = {
    sessionNo: 20n,
    userNo: 1n,
    isRevoked: false,
    expireAt: after(60_000),
  }

  it('창 안이고 후계가 살아 있으면 grace', () => {
    expect(judgeRotatedReuse(rotated, successor, now, 30_000)).toBe('grace')
  })

  it('창 밖이면 reuse', () => {
    expect(judgeRotatedReuse(rotated, successor, after(30_001), 30_000)).toBe('reuse')
  })

  it('graceMs 가 0 이면 늘 reuse', () => {
    expect(judgeRotatedReuse(rotated, successor, now, 0)).toBe('reuse')
  })

  it('🔴 replacedBySessionNo 가 null 이면 후계가 없는 것 — reuse(스펙 B4, fail-closed)', () => {
    expect(
      judgeRotatedReuse({ ...rotated, replacedBySessionNo: null }, successor, now, 30_000),
    ).toBe('reuse')
  })

  it('후계 없음 · 번호 다름 · 다른 사용자 · 폐기 · 만료(같은 순간 포함)면 reuse', () => {
    expect(judgeRotatedReuse(rotated, null, now, 30_000)).toBe('reuse')
    expect(judgeRotatedReuse(rotated, { ...successor, sessionNo: 21n }, now, 30_000)).toBe('reuse')
    expect(judgeRotatedReuse(rotated, { ...successor, userNo: 2n }, now, 30_000)).toBe('reuse')
    expect(judgeRotatedReuse(rotated, { ...successor, isRevoked: true }, now, 30_000)).toBe('reuse')
    expect(judgeRotatedReuse(rotated, { ...successor, expireAt: now }, now, 30_000)).toBe('reuse')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/login-policy.test.ts src/auth/account-policy.test.ts src/auth/refresh-policy.test.ts`
Expected: FAIL — 세 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/auth/login-policy.ts`:

```ts
// 정본: ssworks-gise-home apps/api/src/modules/auth/login-policy.ts (= hangang-home modules/auth/login-policy.ts — 필드
//       이름만 다른 같은 알고리즘)
// 바꾼 점: 횟수 · 시간이 옵션이다(기본값 같음, 스펙 §4-1). 필드 이름은 코어 users 컬럼(loginFailCount · lockUntil —
//   hangang). 성공 때 쓰기를 아끼는 needsReset 을 더했다.

export interface LoginLockout {
  maxFailures: number
  lockMs: number
}

export const DEFAULT_LOCKOUT: LoginLockout = { maxFailures: 5, lockMs: 15 * 60 * 1000 }

/** users 의 잠금 두 컬럼. 리포지토리가 그대로 읽고 쓴다(`AdminAuthRepository.saveLoginState`). */
export interface AdminLoginState {
  loginFailCount: number
  lockUntil: Date | null
}

/** 같은 순간이면 풀린 것이다(스펙 §5-5). */
export function isLocked(lockUntil: Date | null, now: Date): boolean {
  return lockUntil != null && lockUntil.getTime() > now.getTime()
}

/**
 * 비밀번호 확인 한 번의 결과로 다음 잠금 상태를 낸다. 로그인 · 비밀번호 변경 · 재인증이 같은 카운터를 쓴다(스펙 B2).
 */
export function nextLoginState(
  current: AdminLoginState,
  outcome: 'success' | 'fail',
  now: Date,
  lockout: LoginLockout = DEFAULT_LOCKOUT,
): AdminLoginState {
  if (outcome === 'success') return { loginFailCount: 0, lockUntil: null }

  const locked = isLocked(current.lockUntil, now)
  // 🔴 ① 잠금이 이미 끝났으면 카운터도 0부터 다시 센다. 안 그러면 카운터가 maxFailures 아래로 내려오지 않아, 만료 직후의
  //    실패 한 번이 곧바로 다시 잠금이 되어 사실상 영구 잠금이 된다(gise).
  const base = current.lockUntil != null && !locked ? 0 : current.loginFailCount
  const loginFailCount = base + 1

  // 🔴 ② 잠긴 동안에는 시각을 늘리지 않는다. 늘리면 풀리기 직전마다 오답 하나로 다시 lockMs 가 붙어, 유일한 관리자 계정을
  //    무기한 잠그는 DoS 가 maxFailures 회가 아니라 1회 비용이 된다(gise).
  const lockUntil = locked
    ? current.lockUntil
    : loginFailCount >= lockout.maxFailures
      ? new Date(now.getTime() + lockout.lockMs)
      : null

  return { loginFailCount, lockUntil }
}

/** 성공 뒤 되돌릴 것이 있는가 — 이미 { 0, null } 이면 쓰기를 아낀다. */
export function needsReset(state: AdminLoginState): boolean {
  return state.loginFailCount !== 0 || state.lockUntil != null
}
```

`packages/admin-server/src/auth/account-policy.ts`:

```ts
// 정본: 없음(새 판정). hangang `isResignEffective` 는 날짜 + 기준 시간대로 "퇴사일 당일까지 근무" 를 셌다 — 패키지는
//   `resignAt` 을 효력 시각으로 정했다(스펙 ④ R1). 날짜 → 시각 변환은 2d 가 쓸 때 한다.

/** 🔴 `resignAt` 은 효력 시각 — 같은 순간부터 퇴사다. null 은 재직. */
export function isResigned(resignAt: Date | null, now: Date): boolean {
  return resignAt != null && resignAt.getTime() <= now.getTime()
}

/** refresh 세션 만료 — 같은 순간이면 만료(스펙 §5-5). */
export function isSessionExpired(expireAt: Date, now: Date): boolean {
  return expireAt.getTime() <= now.getTime()
}
```

`packages/admin-server/src/auth/refresh-policy.ts`:

```ts
import { isSessionExpired } from './account-policy.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/refresh-policy.ts(유예창 · 시계 오차 하한) + auth.service.ts
//       `isWithinGrace`(후계 생존 · 같은 사용자 불변식)
// 바꾼 점:
//  - 창 길이가 옵션이다(기본 30 000, 0 이면 끈다 — 스펙 ③ W1). 시계 오차 하한은 상수 그대로.
//  - 🔴 `replacedBySessionNo` 가 null 이면 후계가 없는 것으로 본다(스펙 B4). gise 는 폐기와 링크가 두 문장이라 그 사이
//    구간에 유예를 줬다 — 우리 회전은 같은 트랜잭션에서 링크하므로 null 은 이상 상태다.
//  - 판정을 순수 함수 하나(judgeRotatedReuse)로 모았다 — 경합 0행(P1)과 읽기 시점 rotated(P2)가 같은 답을 낸다.

/**
 * 🔴 음수 방향 하한. 경과가 음수인 유일한 실제 원인은 복제본 간 시계 오차다(gise 실측 — 저장은 절삭이라 과거 방향).
 *    하한 없이 두면 시계가 앞선 서버가 쓴 행은 오차만큼 재사용 탐지가 꺼진다. 옵션이 아니다 — 배포자가 조용히 넓히지
 *    못하게 하고, 테스트가 값을 고정한다(gise 픽스 라운드 2).
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5_000

/** 회전으로 폐기된 세션이 아직 유예창 안인가. `revokedAt` null · `graceMs` 0 은 창 밖이다. */
export function isWithinRefreshGrace(revokedAt: Date | null, now: Date, graceMs: number): boolean {
  if (graceMs <= 0 || revokedAt == null) return false
  const elapsed = now.getTime() - revokedAt.getTime()
  return elapsed >= -CLOCK_SKEW_TOLERANCE_MS && elapsed <= graceMs
}

export interface RotatedSessionView {
  userNo: bigint
  revokedAt: Date | null
  replacedBySessionNo: bigint | null
}

export interface SuccessorSessionView {
  sessionNo: bigint
  userNo: bigint
  isRevoked: boolean
  expireAt: Date
}

/**
 * 이미 'rotated' 인 refresh 가 다시 왔을 때의 판정 한 곳(P1 · P2 공용).
 * - `'grace'` — 다른 탭이 늦게 낸 같은 토큰이다. 새 세션을 하나 더 준다(이긴 탭의 세션은 건드리지 않는다).
 * - `'reuse'` — 그 값을 가진 다른 주체가 있다. 누가 진짜인지 알 수 없으니 그 사용자의 살아 있는 세션을 전부 끊는다.
 */
export function judgeRotatedReuse(
  rotated: RotatedSessionView,
  successor: SuccessorSessionView | null,
  now: Date,
  graceMs: number,
): 'grace' | 'reuse' {
  if (!isWithinRefreshGrace(rotated.revokedAt, now, graceMs)) return 'reuse'
  if (rotated.replacedBySessionNo == null || successor == null) return 'reuse'
  if (successor.sessionNo !== rotated.replacedBySessionNo) return 'reuse'
  // 🔴 불변식을 코드에 박는다 — replacedBySessionNo 는 FK 가 아니라 DB 가 같은 사용자임을 보장하지 않는다(gise P4).
  if (successor.userNo !== rotated.userNo) return 'reuse'
  // 🔴 후계가 로그아웃 · 강제 종료로 죽었으면 교차 탭 경쟁이 아니다 — 재사용으로 판정한다(gise).
  if (successor.isRevoked || isSessionExpired(successor.expireAt, now)) return 'reuse'
  return 'grace'
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/login-policy.test.ts src/auth/account-policy.test.ts src/auth/refresh-policy.test.ts`
Expected: PASS(16 tests).

- [ ] **Step 5: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth
pnpm check
git add packages/admin-server/src/auth
git commit -m "$(cat <<'EOF'
feat(admin-server): 인증 판정 순수 함수 — 잠금 · 퇴사 · 만료 · 유예창

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 옵션 해석 · 코어 옵션 · 쿠키 · 요청 메타

**Files:**

- Create: `packages/admin-server/src/auth/options.ts` · `options.test.ts`
- Create: `packages/admin-server/src/auth/cookies.ts` · `cookies.test.ts`
- Create: `packages/admin-server/src/auth/request-meta.ts` · `request-meta.test.ts`
- Modify: `packages/admin-server/src/options.ts`(AdminServerOptions 에 `auth` · `passwordPolicy`)
- Modify: `packages/admin-server/src/tokens.ts`(내부 토큰 `ADMIN_AUTH_CONFIG`)

**Interfaces:**

- Consumes: `DEFAULT_LOCKOUT` · `LoginLockout`(Task 2), admin-shared `definePasswordPolicy` · `PasswordPolicy`
- Produces:
  - `interface AdminAuthOptions` · `interface AdminAuthCookieOptions`(스펙 §4-1)
  - `interface ResolvedAuthCookies { accessName: string; refreshName: string; refreshPath: string; sameSite: 'lax' | 'strict'; secure: 'auto' | boolean; domain: string | undefined }`
  - `interface ResolvedAuthConfig { jwtSecret: string; accessTtlMs: number; refreshTtlMs: number; refreshGraceMs: number; lockout: LoginLockout; cookies: ResolvedAuthCookies; failClosed: boolean; passwordPolicy: PasswordPolicy }`
  - `resolveAuthConfig(auth: AdminAuthOptions | undefined, passwordPolicy: PasswordPolicy | undefined): ResolvedAuthConfig`
  - `MIN_JWT_SECRET_LENGTH = 32`
  - `ADMIN_AUTH_CONFIG: unique symbol`(tokens.ts, 내부 — index 에 내지 않는다)
  - `isSecureRequest(req: Request): boolean` · `setAuthCookies(req, res, config, tokens: { accessToken: string; refreshToken: string }): void` · `clearAuthCookies(req, res, config): void` · `readCookie(req: Request, name: string): string | undefined`
  - `interface RequestMeta { clientIp: string | null; userAgent: string | null }` · `requestMetaOf(req: Request): RequestMeta`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/options.test.ts`:

```ts
import { definePasswordPolicy } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { MIN_JWT_SECRET_LENGTH, resolveAuthConfig } from './options.js'

const secret = 's'.repeat(MIN_JWT_SECRET_LENGTH)

describe('resolveAuthConfig', () => {
  it('기본값', () => {
    const config = resolveAuthConfig({ jwtSecret: secret }, undefined)
    expect(config).toMatchObject({
      jwtSecret: secret,
      accessTtlMs: 900_000,
      refreshTtlMs: 604_800_000,
      refreshGraceMs: 30_000,
      lockout: { maxFailures: 5, lockMs: 900_000 },
      cookies: {
        accessName: 'admin_at',
        refreshName: 'admin_rt',
        refreshPath: '/',
        sameSite: 'lax',
        secure: 'auto',
        domain: undefined,
      },
      failClosed: true,
    })
    expect(config.passwordPolicy.minLength).toBe(8)
    expect(config.passwordPolicy.maxLength).toBe(200)
  })

  it('사용자 값과 정책을 그대로 쓴다', () => {
    const policy = definePasswordPolicy({ minLength: 12 })
    const config = resolveAuthConfig(
      {
        jwtSecret: secret,
        accessTtlMs: 60_000,
        refreshTtlMs: 120_000,
        refreshGraceMs: 0,
        lockout: { maxFailures: 3 },
        cookies: {
          accessName: 'hg_admin_at',
          refreshName: 'hg_admin_rt',
          refreshPath: '/api/admin/auth',
          sameSite: 'strict',
          secure: true,
          domain: 'example.com',
        },
        failClosed: false,
      },
      policy,
    )
    expect(config).toMatchObject({
      accessTtlMs: 60_000,
      refreshTtlMs: 120_000,
      refreshGraceMs: 0,
      lockout: { maxFailures: 3, lockMs: 900_000 },
      cookies: {
        refreshPath: '/api/admin/auth',
        sameSite: 'strict',
        secure: true,
        domain: 'example.com',
      },
      failClosed: false,
    })
    expect(config.passwordPolicy).toBe(policy)
  })

  it.each([
    ['auth 없음', undefined, 'auth.jwtSecret'],
    ['짧은 비밀키', { jwtSecret: 's'.repeat(31) }, 'auth.jwtSecret 은 32자 이상'],
    ['accessTtlMs 0', { jwtSecret: secret, accessTtlMs: 0 }, 'auth.accessTtlMs'],
    ['refreshTtlMs 소수', { jwtSecret: secret, refreshTtlMs: 1.5 }, 'auth.refreshTtlMs'],
    ['refreshGraceMs 음수', { jwtSecret: secret, refreshGraceMs: -1 }, 'auth.refreshGraceMs'],
    [
      'refreshGraceMs ≥ accessTtlMs',
      { jwtSecret: secret, accessTtlMs: 60_000, refreshGraceMs: 60_000 },
      'auth.refreshGraceMs',
    ],
    ['lockout.maxFailures 0', { jwtSecret: secret, lockout: { maxFailures: 0 } }, /maxFailures/],
    ['쿠키 이름 공백', { jwtSecret: secret, cookies: { accessName: 'a b' } }, /accessName/],
    [
      '두 쿠키 이름이 같음',
      { jwtSecret: secret, cookies: { accessName: 'x', refreshName: 'x' } },
      /같다/,
    ],
    [
      'refreshPath 가 / 로 시작하지 않음',
      { jwtSecret: secret, cookies: { refreshPath: 'api' } },
      /refreshPath/,
    ],
  ])('%s → 던진다', (_label, auth, message) => {
    expect(() => resolveAuthConfig(auth, undefined)).toThrow(message)
  })

  it('🔴 오류 메시지에 비밀키 값이 없다', () => {
    const short = 'TOP-SECRET-VALUE'
    try {
      resolveAuthConfig({ jwtSecret: short }, undefined)
      expect.unreachable()
    } catch (error) {
      expect(String(error)).not.toContain(short)
    }
  })
})
```

`packages/admin-server/src/auth/cookies.test.ts`:

```ts
import type { Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAuthCookies, isSecureRequest, readCookie, setAuthCookies } from './cookies.js'
import { resolveAuthConfig, type AdminAuthCookieOptions } from './options.js'

function fakeRequest(input: {
  secure?: boolean
  headers?: Record<string, unknown>
  cookies?: unknown
}) {
  return {
    secure: input.secure ?? false,
    headers: input.headers ?? {},
    cookies: input.cookies,
  } as unknown as Request
}

function fakeResponse() {
  const cookie = vi.fn()
  const clearCookie = vi.fn()
  return { res: { cookie, clearCookie } as unknown as Response, cookie, clearCookie }
}

function config(cookies: AdminAuthCookieOptions = {}) {
  return resolveAuthConfig({ jwtSecret: 's'.repeat(32), cookies }, undefined)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isSecureRequest — Secure "auto"', () => {
  it.each([
    ['req.secure', { secure: true }, true],
    ['X-Forwarded-Proto https', { headers: { 'x-forwarded-proto': 'https' } }, true],
    ['여러 값의 첫 값', { headers: { 'x-forwarded-proto': 'https, http' } }, true],
    ['대문자', { headers: { 'x-forwarded-proto': 'HTTPS' } }, true],
    ['첫 값이 http', { headers: { 'x-forwarded-proto': 'http, https' } }, false],
    ['평범한 http', {}, false],
  ])('%s → %s', (_label, input, expected) => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(isSecureRequest(fakeRequest(input))).toBe(expected)
  })

  it('🔴 NODE_ENV=production 이면 http 여도 Secure — 헤더만 믿으면 클라이언트가 벗길 수 있다(hangang)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(isSecureRequest(fakeRequest({}))).toBe(true)
  })
})

describe('setAuthCookies · clearAuthCookies', () => {
  it('두 쿠키 — httpOnly · lax · Path=/ · maxAge 는 각 TTL', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const { res, cookie } = fakeResponse()
    setAuthCookies(fakeRequest({}), res, config(), { accessToken: 'A', refreshToken: 'R' })
    expect(cookie).toHaveBeenCalledWith('admin_at', 'A', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 900_000,
    })
    expect(cookie).toHaveBeenCalledWith('admin_rt', 'R', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 604_800_000,
    })
  })

  it('🔴 clear 는 set 과 같은 속성이다 — path 가 어긋난 clearCookie 를 브라우저는 무시한다(crm 사고)', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const custom = config({ refreshPath: '/api/admin/auth', domain: 'example.com', secure: true })
    const set = fakeResponse()
    const cleared = fakeResponse()
    setAuthCookies(fakeRequest({}), set.res, custom, { accessToken: 'A', refreshToken: 'R' })
    clearAuthCookies(fakeRequest({}), cleared.res, custom)
    for (const [index, name] of ['admin_at', 'admin_rt'].entries()) {
      const { maxAge: _maxAge, ...setOptions } = set.cookie.mock.calls[index]![2] as Record<
        string,
        unknown
      >
      expect(cleared.clearCookie).toHaveBeenCalledWith(name, setOptions)
    }
    expect(set.cookie.mock.calls[1]![2]).toMatchObject({
      path: '/api/admin/auth',
      domain: 'example.com',
      secure: true,
    })
    expect(set.cookie.mock.calls[0]![2]).toMatchObject({ path: '/' })
  })

  it('secure: false 는 production 에서도 Secure 를 빼고, domain 이 없으면 키를 싣지 않는다', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { res, cookie } = fakeResponse()
    setAuthCookies(fakeRequest({}), res, config({ secure: false }), {
      accessToken: 'A',
      refreshToken: 'R',
    })
    expect(cookie.mock.calls[0]![2]).toMatchObject({ secure: false })
    expect(cookie.mock.calls[0]![2]).not.toHaveProperty('domain')
  })
})

describe('readCookie', () => {
  it.each([
    ['문자열', { admin_rt: 'abc' }, 'abc'],
    ['빈 문자열', { admin_rt: '' }, undefined],
    ['🔴 j: 객체(cookie-parser 가 JSON 으로 풀었다)', { admin_rt: { a: 1 } }, undefined],
    ['j: 배열', { admin_rt: [1] }, undefined],
    ['없음', {}, undefined],
    ['req.cookies 자체가 없음', undefined, undefined],
  ])('%s', (_label, cookies, expected) => {
    expect(readCookie(fakeRequest({ cookies }), 'admin_rt')).toBe(expected)
  })
})
```

`packages/admin-server/src/auth/request-meta.test.ts`:

```ts
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { requestMetaOf } from './request-meta.js'

function req(input: { ip?: string; userAgent?: unknown }) {
  return {
    ip: input.ip,
    headers: input.userAgent === undefined ? {} : { 'user-agent': input.userAgent },
  } as unknown as Request
}

describe('requestMetaOf', () => {
  it('req.ip 와 User-Agent 문자열', () => {
    expect(requestMetaOf(req({ ip: '10.0.0.1', userAgent: 'UA/1' }))).toEqual({
      clientIp: '10.0.0.1',
      userAgent: 'UA/1',
    })
  })

  it('없거나 비면 null', () => {
    expect(requestMetaOf(req({}))).toEqual({ clientIp: null, userAgent: null })
    expect(requestMetaOf(req({ ip: '', userAgent: '' }))).toEqual({
      clientIp: null,
      userAgent: null,
    })
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/options.test.ts src/auth/cookies.test.ts src/auth/request-meta.test.ts`
Expected: FAIL — 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/tokens.ts` 끝에 더한다:

```ts
/**
 * 내부 — 해석된 인증 설정(`ResolvedAuthConfig`). `AdminAuthModule` 이 코어 옵션의 `auth` · `passwordPolicy` 로 만든다.
 * index 에 내지 않는다.
 */
export const ADMIN_AUTH_CONFIG = Symbol('ADMIN_AUTH_CONFIG')
```

`packages/admin-server/src/auth/options.ts`:

```ts
import { definePasswordPolicy, type PasswordPolicy } from '@ssworks/admin-shared'
import { DEFAULT_LOCKOUT, type LoginLockout } from './login-policy.js'

// 정본: 없음 — Phase 0 §3-2 표의 `auth` · `cookies` · `permissions` 행을 실제로 갈렸던 값만 남겨 옵션으로 만들었다
//   (스펙 §4-1). 해석 · 검증을 순수 함수 하나에 모은다 — 잘못된 설정은 첫 기동에서 드러난다.

export interface AdminAuthCookieOptions {
  /** 기본 'admin_at' */
  accessName?: string
  /** 기본 'admin_rt' */
  refreshName?: string
  /** refresh 쿠키 경로. 기본 '/'. 좁히려면 브라우저가 보는 경로(전역 prefix 포함)를 적는다 */
  refreshPath?: string
  /** 기본 'lax' */
  sameSite?: 'lax' | 'strict'
  /** 기본 'auto' = req.secure ‖ X-Forwarded-Proto 첫 값이 https ‖ NODE_ENV === 'production' */
  secure?: 'auto' | boolean
  domain?: string
}

export interface AdminAuthOptions {
  /** HS256 비밀키. 🔴 32자 이상 — 짧으면 기동 거부. 값은 어떤 오류 메시지에도 싣지 않는다 */
  jwtSecret: string
  /** 액세스 토큰 · 쿠키 수명(ms). 기본 900 000(15분). JWT exp 는 초 단위로 올림 */
  accessTtlMs?: number
  /** refresh 세션 수명(ms). 기본 604 800 000(7일). 회전마다 새 행이 다시 받는다 */
  refreshTtlMs?: number
  /** 회전된 토큰을 다른 탭이 늦게 내도 받아 주는 창(ms). 기본 30 000, 0 이면 끈다. accessTtlMs 미만 */
  refreshGraceMs?: number
  /** 기본 5회 · 900 000ms */
  lockout?: { maxFailures?: number; lockMs?: number }
  cookies?: AdminAuthCookieOptions
  /** 🔴 기본 true. false 면 권한 선언 없는 라우트가 인증만으로 통과한다(crm · axion 이식 과도기). 기동 때 경고 한 줄 */
  failClosed?: boolean
}

export interface ResolvedAuthCookies {
  accessName: string
  refreshName: string
  refreshPath: string
  sameSite: 'lax' | 'strict'
  secure: 'auto' | boolean
  domain: string | undefined
}

export interface ResolvedAuthConfig {
  jwtSecret: string
  accessTtlMs: number
  refreshTtlMs: number
  refreshGraceMs: number
  lockout: LoginLockout
  cookies: ResolvedAuthCookies
  failClosed: boolean
  passwordPolicy: PasswordPolicy
}

export const MIN_JWT_SECRET_LENGTH = 32

const DEFAULT_ACCESS_TTL_MS = 15 * 60 * 1000
const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_REFRESH_GRACE_MS = 30_000
/** RFC 6265 토큰의 실용 부분집합 — 공백 · `;` · `=` 를 막는다 */
const COOKIE_NAME = /^[A-Za-z0-9_.-]+$/

function positiveInt(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${name} 은 양의 정수여야 한다.`)
  }
  return resolved
}

function cookieName(name: string, value: string | undefined, fallback: string): string {
  const resolved = value ?? fallback
  if (!COOKIE_NAME.test(resolved)) {
    throw new Error(`${name} 은 영문 · 숫자 · _ . - 로만 된 쿠키 이름이어야 한다.`)
  }
  return resolved
}

/**
 * 코어 옵션의 `auth` · `passwordPolicy` 를 해석한다. 🔴 메시지에는 옵션 이름만 담는다 — 비밀키 값을 싣지 않는다.
 */
export function resolveAuthConfig(
  auth: AdminAuthOptions | undefined,
  passwordPolicy: PasswordPolicy | undefined,
): ResolvedAuthConfig {
  if (auth == null) {
    throw new Error(
      'AdminAuthModule 을 쓰려면 AdminServerModule 옵션에 auth.jwtSecret 이 있어야 한다.',
    )
  }
  if (typeof auth.jwtSecret !== 'string' || auth.jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`auth.jwtSecret 은 ${MIN_JWT_SECRET_LENGTH}자 이상이어야 한다.`)
  }

  const accessTtlMs = positiveInt('auth.accessTtlMs', auth.accessTtlMs, DEFAULT_ACCESS_TTL_MS)
  const refreshTtlMs = positiveInt('auth.refreshTtlMs', auth.refreshTtlMs, DEFAULT_REFRESH_TTL_MS)
  const refreshGraceMs = auth.refreshGraceMs ?? DEFAULT_REFRESH_GRACE_MS
  // 🔴 상한은 액세스 TTL 이다 — 창이 그것에 가까워지면 정상 탭의 다음 정기 갱신까지 창 안에 들어와 재사용 탐지가 사실상
  //    꺼진다(gise refresh-policy).
  if (!Number.isInteger(refreshGraceMs) || refreshGraceMs < 0 || refreshGraceMs >= accessTtlMs) {
    throw new Error('auth.refreshGraceMs 는 0 이상 auth.accessTtlMs 미만의 정수여야 한다.')
  }

  const lockout: LoginLockout = {
    maxFailures: positiveInt(
      'auth.lockout.maxFailures',
      auth.lockout?.maxFailures,
      DEFAULT_LOCKOUT.maxFailures,
    ),
    lockMs: positiveInt('auth.lockout.lockMs', auth.lockout?.lockMs, DEFAULT_LOCKOUT.lockMs),
  }

  const cookies = auth.cookies ?? {}
  const accessName = cookieName('auth.cookies.accessName', cookies.accessName, 'admin_at')
  const refreshName = cookieName('auth.cookies.refreshName', cookies.refreshName, 'admin_rt')
  if (accessName === refreshName) {
    throw new Error('auth.cookies.accessName 과 refreshName 이 같다.')
  }
  const refreshPath = cookies.refreshPath ?? '/'
  if (!refreshPath.startsWith('/')) {
    throw new Error('auth.cookies.refreshPath 는 / 로 시작해야 한다.')
  }

  return {
    jwtSecret: auth.jwtSecret,
    accessTtlMs,
    refreshTtlMs,
    refreshGraceMs,
    lockout,
    cookies: {
      accessName,
      refreshName,
      refreshPath,
      sameSite: cookies.sameSite ?? 'lax',
      secure: cookies.secure ?? 'auto',
      domain: cookies.domain,
    },
    failClosed: auth.failClosed ?? true,
    passwordPolicy: passwordPolicy ?? definePasswordPolicy(),
  }
}
```

`packages/admin-server/src/auth/cookies.ts`:

```ts
import type { CookieOptions, Request, Response } from 'express'
import type { ResolvedAuthConfig } from './options.js'

// 정본: hangang-home apps/api/src/core/utils/cookie.util.ts(set/clear 가 옵션 함수 하나를 공유 · 호출 시점 평가 ·
//       Secure fail-secure) + ssworks-gise-home apps/api/src/core/auth/cookies.ts(refresh 경로)
// 바꾼 점: 이름 · 경로 · SameSite · Secure · domain 이 옵션이다(스펙 ⑨ C1). `j:` 객체 쿠키를 "없음" 으로 읽는 readCookie 를
//   더했다(2a 최종 리뷰).

export interface AuthCookieTokens {
  accessToken: string
  refreshToken: string
}

/**
 * Secure `'auto'` 판정. 🔴 부를 때마다 읽는다 — 모듈 최상위 상수면 ESM import 호이스팅으로 main.ts 의 loadDotEnv() 보다
 * 먼저 굳어 `.env` 의 NODE_ENV 가 닿지 않는다(hangang A9-2).
 * 🔴 NODE_ENV 를 OR 로 둔다 — X-Forwarded-Proto 만 믿으면 클라이언트가 `http` 를 보내 Secure 를 벗길 수 있다(hangang 08편).
 * trust proxy 없이는 X-Forwarded-Proto 가 req.secure 를 바꾸지 않아 헤더를 직접 읽는다(스펙 §14 R1-5).
 */
export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true
  const header = req.headers['x-forwarded-proto']
  const raw = Array.isArray(header) ? header[0] : header
  const first = typeof raw === 'string' ? raw.split(',')[0]?.trim().toLowerCase() : undefined
  return first === 'https' || process.env.NODE_ENV === 'production'
}

/** 🔴 set 과 clear 가 이 함수 하나를 쓴다 — path · domain 이 어긋난 clearCookie 를 브라우저는 무시한다(crm 사고). */
function baseCookieOptions(req: Request, config: ResolvedAuthConfig, path: string): CookieOptions {
  const { cookies } = config
  return {
    httpOnly: true,
    sameSite: cookies.sameSite,
    secure: cookies.secure === 'auto' ? isSecureRequest(req) : cookies.secure,
    path,
    ...(cookies.domain === undefined ? {} : { domain: cookies.domain }),
  }
}

export function setAuthCookies(
  req: Request,
  res: Response,
  config: ResolvedAuthConfig,
  tokens: AuthCookieTokens,
): void {
  res.cookie(config.cookies.accessName, tokens.accessToken, {
    ...baseCookieOptions(req, config, '/'),
    maxAge: config.accessTtlMs,
  })
  res.cookie(config.cookies.refreshName, tokens.refreshToken, {
    ...baseCookieOptions(req, config, config.cookies.refreshPath),
    maxAge: config.refreshTtlMs,
  })
}

export function clearAuthCookies(req: Request, res: Response, config: ResolvedAuthConfig): void {
  res.clearCookie(config.cookies.accessName, baseCookieOptions(req, config, '/'))
  res.clearCookie(
    config.cookies.refreshName,
    baseCookieOptions(req, config, config.cookies.refreshPath),
  )
}

/**
 * 문자열이고 비어 있지 않을 때만 값. 🔴 cookie-parser 는 `j:` 로 시작하는 값을 JSON 으로 풀어 객체 · 배열을 줄 수 있다 —
 * 그대로 해시하면 `[object Object]` 를 해시한다(2a 최종 리뷰).
 */
export function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined
  const value = cookies?.[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
```

`packages/admin-server/src/auth/request-meta.ts`:

```ts
import type { Request } from 'express'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.controller.ts `sessionMeta`
// 바꾼 점: 없으면 null(gise 는 '0.0.0.0'). 클라이언트 IP 의 출처(X-Real-IP 우선 · trust proxy)는 2f 가 다시 본다.

export interface RequestMeta {
  clientIp: string | null
  userAgent: string | null
}

/** 🔴 clientIp 는 req.ip 그대로다 — trust proxy 는 쓰는 쪽 main.ts 몫이다. 세션 행 · IP 정책 · 이벤트가 같은 값을 본다. */
export function requestMetaOf(req: Request): RequestMeta {
  const userAgent = req.headers['user-agent']
  return {
    clientIp: typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : null,
    userAgent: typeof userAgent === 'string' && userAgent.length > 0 ? userAgent : null,
  }
}
```

`packages/admin-server/src/options.ts` — import 두 줄을 더하고 `AdminServerOptions` 에 두 필드를 더한다:

```ts
import type { FactoryProvider, ModuleMetadata } from '@nestjs/common'
import type { ErrorCodeTable, PasswordPolicy } from '@ssworks/admin-shared'
import type { AdminAuthOptions } from './auth/options.js'
import type { AdminDbConnection } from './database/connection.js'

export interface AdminServerOptions {
  /** DB 접속. 보통 `adminDbConnectionFromEnv()` */
  db: AdminDbConnection
  /**
   * 프로젝트 오류 코드표(admin-shared `defineErrorCodes` 결과). 예외 필터가 `BusinessError` 의 상태를 여기서 찾는다.
   * 없으면 코어 표(`COMMON_ERROR_STATUS`). 표에 없는 코드는 500.
   */
  errorCodes?: Pick<ErrorCodeTable<Record<string, string>>, 'httpStatusFor'>
  /** `AdminAuthModule` 을 쓰면 필수 — 없으면 기동에서 멈춘다(스펙 §4-1) */
  auth?: AdminAuthOptions
  /** admin-shared `definePasswordPolicy()` 결과. 없으면 기본 정책(8 · 200). 인증(비밀번호 변경)과 2d 가 함께 읽는다 */
  passwordPolicy?: PasswordPolicy
}
```

(`AdminServerStaticOptions` · `AdminServerAsyncOptions` 는 그대로 둔다.)

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/options.test.ts src/auth/cookies.test.ts src/auth/request-meta.test.ts`
Expected: PASS.

- [ ] **Step 5: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/options.ts packages/admin-server/src/tokens.ts
pnpm check
git add packages/admin-server/src/auth packages/admin-server/src/options.ts packages/admin-server/src/tokens.ts
git commit -m "$(cat <<'EOF'
feat(admin-server): 인증 옵션 해석 · 쿠키 · 요청 메타

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 액세스 토큰 — `AdminAccessTokenService`

**Files:**

- Create: `packages/admin-server/src/auth/access-token.service.ts` · `access-token.service.test.ts`
- Create: `packages/admin-server/src/auth/errors.ts`(문구 표 — Task 7 이 채운다. 여기서는 토큰 문구 둘로 시작한다)

**Interfaces:**

- Consumes: `ResolvedAuthConfig` · `resolveAuthConfig` · `ADMIN_AUTH_CONFIG`(Task 3)
- Produces:
  - `interface AccessTokenClaims { userNo: bigint; sessionNo: bigint }`
  - `class AdminAccessTokenService { sign(claims: AccessTokenClaims): string; verify(token: string, now: Date): AccessTokenClaims }` — 만료 → `ERR_EXPIRED_TOKEN`, 그 밖 → `ERR_INVALID_TOKEN`
  - `AUTH_MESSAGES`(errors.ts) — 이 Task 에서는 `accessExpired` · `accessInvalid` 두 키

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/access-token.service.test.ts`:

```ts
import { JwtService } from '@nestjs/jwt'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { AdminAccessTokenService } from './access-token.service.js'
import { AUTH_MESSAGES } from './errors.js'
import { resolveAuthConfig } from './options.js'

const secret = 'access-token-test-secret'.padEnd(32, 'x')
const service = new AdminAccessTokenService(resolveAuthConfig({ jwtSecret: secret }, undefined))

function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >
}

function rejection(run: () => unknown): BusinessError {
  try {
    run()
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('던지지 않았다')
}

describe('AdminAccessTokenService', () => {
  it('bigint 두 클레임을 래퍼 문자열로 싣고 되살린다 · exp − iat 는 accessTtlMs 를 초로 올림', () => {
    const token = service.sign({ userNo: 12n, sessionNo: 34n })
    const payload = payloadOf(token)
    expect(payload.userNo).toBe('BigInt(12)')
    expect(payload.sessionNo).toBe('BigInt(34)')
    expect(Number(payload.exp) - Number(payload.iat)).toBe(900)
    expect(service.verify(token, new Date())).toEqual({ userNo: 12n, sessionNo: 34n })
  })

  it('🔴 exp 와 같은 초부터 만료 — ERR_EXPIRED_TOKEN, 1초 전은 통과', () => {
    const token = service.sign({ userNo: 1n, sessionNo: 2n })
    const exp = Number(payloadOf(token).exp)
    expect(service.verify(token, new Date((exp - 1) * 1000))).toEqual({ userNo: 1n, sessionNo: 2n })
    const error = rejection(() => service.verify(token, new Date(exp * 1000)))
    expect(error.code).toBe(CommonErrorCodes.ERR_EXPIRED_TOKEN)
    expect(error.message).toBe(AUTH_MESSAGES.accessExpired)
  })

  it.each([
    [
      '다른 비밀키',
      () =>
        new JwtService({ secret: 'y'.repeat(32) }).sign({
          userNo: 'BigInt(1)',
          sessionNo: 'BigInt(2)',
        }),
    ],
    [
      'HS512',
      () =>
        new JwtService({ secret }).sign(
          { userNo: 'BigInt(1)', sessionNo: 'BigInt(2)' },
          { algorithm: 'HS512' },
        ),
    ],
    [
      'alg none',
      () =>
        [
          Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
          Buffer.from(JSON.stringify({ userNo: 'BigInt(1)', sessionNo: 'BigInt(2)' })).toString(
            'base64url',
          ),
          '',
        ].join('.'),
    ],
    ['잘린 토큰', () => service.sign({ userNo: 1n, sessionNo: 2n }).slice(0, -3)],
    ['숫자 클레임', () => new JwtService({ secret }).sign({ userNo: 1, sessionNo: 2 })],
    ['클레임 없음', () => new JwtService({ secret }).sign({ hello: 'world' })],
    ['형식이 아님', () => 'not-a-jwt'],
  ])('🔴 %s → ERR_INVALID_TOKEN', (_label, make) => {
    const error = rejection(() => service.verify(make(), new Date()))
    expect(error.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(error.message).toBe(AUTH_MESSAGES.accessInvalid)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/access-token.service.test.ts`
Expected: FAIL — `./access-token.service.js` · `./errors.js` 를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/auth/errors.ts`(Task 7 이 나머지 문구를 더한다):

```ts
// 인증 오류 문구 — 서비스 · 가드 · 테스트가 이 표 하나를 본다(스펙 §5 · §14 R6). 코드 · 상태는 admin-shared 코어 표.

export const AUTH_MESSAGES = {
  accessExpired: '접근 토큰이 만료되었습니다.',
  accessInvalid: '유효하지 않은 접근 토큰입니다.',
} as const
```

`packages/admin-server/src/auth/access-token.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { JwtService, TokenExpiredError } from '@nestjs/jwt'
import { BusinessError, CommonErrorCodes, parseJSON, stringifyJSON } from '@ssworks/admin-shared'
import { ADMIN_AUTH_CONFIG } from '../tokens.js'
import { AUTH_MESSAGES } from './errors.js'
import type { ResolvedAuthConfig } from './options.js'

// 정본: hangang-home apps/api/src/modules/auth/auth.service.ts `signAccessToken` + core/guards/auth.guard.ts
//       `verifyAccessToken`(만료 · 위조 매핑) + ssworks-gise-home auth.service.ts `issue`(bigint 래퍼 서명)
// 바꾼 점:
//  - JwtModule 대신 JwtService 를 직접 만든다 — 비밀키가 런타임 옵션이고 쓰는 쪽 JwtModule 과 섞이지 않는다(스펙 ① J1).
//  - 🔴 알고리즘을 HS256 하나로 묶는다(서명 · 검증 둘 다) — HS512 · none 은 위조로 본다(스펙 §14 R1-1 실측).
//  - `now` 를 받아 `clockTimestamp` 로 넘긴다 — 만료 경계를 테스트가 만든다(스펙 §5-5).
//  - 클레임이 bigint 래퍼가 아니면 위조로 본다(gise payload 형태 검사).

export interface AccessTokenClaims {
  userNo: bigint
  sessionNo: bigint
}

function invalidToken(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.accessInvalid)
}

@Injectable()
export class AdminAccessTokenService {
  private readonly jwt: JwtService
  private readonly expiresInSeconds: number

  constructor(@Inject(ADMIN_AUTH_CONFIG) config: ResolvedAuthConfig) {
    this.expiresInSeconds = Math.ceil(config.accessTtlMs / 1000)
    this.jwt = new JwtService({
      secret: config.jwtSecret,
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    })
  }

  sign(claims: AccessTokenClaims): string {
    // 🔴 jsonwebtoken 은 payload 를 JSON.stringify 한다 — bigint 를 만나면 던진다(gise 실측). 래퍼 문자열로 바꿔 넘긴다.
    const payload = JSON.parse(
      stringifyJSON({ userNo: claims.userNo, sessionNo: claims.sessionNo }),
    ) as Record<string, string>
    return this.jwt.sign(payload, { expiresIn: this.expiresInSeconds })
  }

  verify(token: string, now: Date): AccessTokenClaims {
    let raw: Record<string, unknown>
    try {
      // verify 옵션은 생성자의 verifyOptions(algorithms) 와 합쳐진다(스펙 §14 R1-1).
      raw = this.jwt.verify<Record<string, unknown>>(token, {
        clockTimestamp: Math.floor(now.getTime() / 1000),
      })
    } catch (error) {
      // 🔴 만료를 위조와 가른다 — 만료는 클라이언트가 조용히 갱신할 신호다. 감싸지 않으면 15분마다 500 이 된다(hangang).
      if (error instanceof TokenExpiredError) {
        throw new BusinessError(CommonErrorCodes.ERR_EXPIRED_TOKEN, AUTH_MESSAGES.accessExpired)
      }
      throw invalidToken()
    }
    const claims = parseJSON<{ userNo?: unknown; sessionNo?: unknown }>(
      JSON.stringify({ userNo: raw.userNo, sessionNo: raw.sessionNo }),
    )
    if (typeof claims.userNo !== 'bigint' || typeof claims.sessionNo !== 'bigint') {
      throw invalidToken()
    }
    return { userNo: claims.userNo, sessionNo: claims.sessionNo }
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/access-token.service.test.ts`
Expected: PASS(9 tests). 만료 테스트가 실패하면 `verify` 의 두 번째 인자가 생성자 `verifyOptions` 를 덮지 않는지(algorithms 유지) 본다.

- [ ] **Step 5: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth
pnpm check
git add packages/admin-server/src/auth
git commit -m "$(cat <<'EOF'
feat(admin-server): JWT 액세스 토큰 서비스 — HS256 고정 · 만료와 위조 구분

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `AUTH_REPOSITORY` · `KyselyAuthRepository`

사용자 테이블을 읽고 쓰는 교체 지점(스펙 ⑤ A1). 실 MariaDB 로 잰다. 이 Task 에서 `users.resignAt` 의 뜻(효력 시각 — 스펙 ④ R1)을 타입 · 장 주석에 적는다.

**Files:**

- Create: `packages/admin-server/src/auth/auth.repository.ts`
- Create: `packages/admin-server/src/auth/kysely-auth.repository.ts` · `kysely-auth.repository.db.test.ts`
- Create: `packages/admin-server/src/test-support/auth.ts`(시드 도우미)
- Modify: `packages/admin-server/src/tokens.ts`(`AUTH_REPOSITORY`)
- Modify: `packages/admin-server/src/database/tables/users.ts` · `src/database/migrations/0002_users.ts`(resignAt 주석)

**Interfaces:**

- Consumes: `AdminLoginState`(Task 2), `KYSELY` · `runQuery` · `readJsonColumn` · `AdminDatabase`(2a), `hashPassword`(Task 1)
- Produces:
  - `AUTH_REPOSITORY: unique symbol`(tokens.ts — 공개)
  - `interface AdminCredential { userNo: bigint; passwordHash: string; resignAt: Date | null; loginFailCount: number; lockUntil: Date | null; isPasswordChangeRequired: boolean }`
  - `interface AdminPrincipalRecord { userNo: bigint; userId: string; userName: string; roleNo: bigint; roleName: string; teamNo: bigint | null; teamName: string | null; permissions: string[]; isPasswordChangeRequired: boolean; resignAt: Date | null }`
  - `interface AdminAuthRepository { findCredentialByUserId(userId: string): Promise<AdminCredential | null>; findCredentialByNo(userNo: bigint): Promise<AdminCredential | null>; findPrincipal(userNo: bigint): Promise<AdminPrincipalRecord | null>; saveLoginState(userNo: bigint, state: AdminLoginState): Promise<void>; changePassword(trx: Transaction<AdminDatabase>, userNo: bigint, expectedHash: string, newHash: string): Promise<number> }`
  - `class KyselyAuthRepository implements AdminAuthRepository`(생성자 `@Inject(KYSELY) db: Kysely<AdminDatabase>`)
  - test-support: `seedRole(db, input?: { roleName?: string; permissions?: unknown }): Promise<bigint>` · `seedUser(db, input: SeedUserInput): Promise<SeededUser>` · `seedTeam(db, teamName: string): Promise<bigint>` · `addToTeam(db, teamNo: bigint, userNo: bigint): Promise<void>`

- [ ] **Step 1: 시드 도우미를 쓴다**

`packages/admin-server/src/test-support/auth.ts`:

```ts
import type { Kysely } from 'kysely'
import { hashPassword } from '../auth/password.js'
import type { AdminDatabase } from '../database/types.js'

// 테스트 전용 — 인증 테스트의 계정 시드. 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// argon2 해시가 한 번에 약 15ms 라(스펙 §14 R1-2) 시드마다 그냥 해시한다.

let sequence = 0

export async function seedRole(
  db: Kysely<AdminDatabase>,
  input: { roleName?: string; permissions?: unknown } = {},
): Promise<bigint> {
  sequence += 1
  const result = await db
    .insertInto('roles')
    .values({
      roleName: input.roleName ?? `역할${sequence}`,
      permissions: JSON.stringify(input.permissions ?? ['*']),
    })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

export interface SeedUserInput {
  roleNo: bigint
  userId?: string
  /** 평문 — 시드가 해시한다 */
  password?: string
  userName?: string
  resignAt?: Date | null
  isPasswordChangeRequired?: boolean
  loginFailCount?: number
  lockUntil?: Date | null
}

export interface SeededUser {
  userNo: bigint
  userId: string
  password: string
}

export async function seedUser(
  db: Kysely<AdminDatabase>,
  input: SeedUserInput,
): Promise<SeededUser> {
  sequence += 1
  const userId = input.userId ?? `user${sequence}`
  const password = input.password ?? `pw-${sequence}-secret`
  const result = await db
    .insertInto('users')
    .values({
      userId,
      password: await hashPassword(password),
      userName: input.userName ?? `사용자${sequence}`,
      roleNo: input.roleNo,
      resignAt: input.resignAt ?? null,
      isPasswordChangeRequired: input.isPasswordChangeRequired ?? false,
      loginFailCount: input.loginFailCount ?? 0,
      lockUntil: input.lockUntil ?? null,
    })
    .executeTakeFirstOrThrow()
  return { userNo: result.insertId as bigint, userId, password }
}

export async function seedTeam(db: Kysely<AdminDatabase>, teamName: string): Promise<bigint> {
  const result = await db.insertInto('teams').values({ teamName }).executeTakeFirstOrThrow()
  return result.insertId as bigint
}

export async function addToTeam(
  db: Kysely<AdminDatabase>,
  teamNo: bigint,
  userNo: bigint,
): Promise<void> {
  await db.insertInto('teamUserMap').values({ teamNo, userNo }).execute()
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/kysely-auth.repository.db.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runWriteTransaction } from '../database/run.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { addToTeam, seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'
import { hashPassword, verifyPassword } from './password.js'

let t: TestDatabase
let repo: KyselyAuthRepository

beforeAll(async () => {
  t = await createTestDatabase()
  repo = new KyselyAuthRepository(t.db)
})

afterAll(async () => {
  await t?.drop()
})

describe('findCredentialByUserId · findCredentialByNo', () => {
  it('자격 증명 행 — 해시 · 잠금 두 컬럼 · 퇴사 · 강제 변경', async () => {
    const roleNo = await seedRole(t.db)
    const lockUntil = new Date('2030-01-01T00:00:00.000Z')
    const user = await seedUser(t.db, {
      roleNo,
      userId: 'cred-admin',
      loginFailCount: 2,
      lockUntil,
      isPasswordChangeRequired: true,
    })
    const byId = await repo.findCredentialByUserId('cred-admin')
    expect(byId).toMatchObject({
      userNo: user.userNo,
      resignAt: null,
      loginFailCount: 2,
      lockUntil,
      isPasswordChangeRequired: true,
    })
    expect(await verifyPassword(byId!.passwordHash, user.password)).toBe(true)
    expect(await repo.findCredentialByNo(user.userNo)).toEqual(byId)
    expect(await repo.findCredentialByUserId('nobody')).toBeNull()
    expect(await repo.findCredentialByNo(999_999n)).toBeNull()
  })

  it('🔴 아이디는 대소문자 · 끝 공백을 가리지 않는다(utf8mb4_unicode_ci · PAD SPACE), 앞 공백은 다른 아이디 — Review Focus 1', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo, userId: 'casey' })
    expect((await repo.findCredentialByUserId('CASEY'))?.userNo).toBe(user.userNo)
    expect((await repo.findCredentialByUserId('casey '))?.userNo).toBe(user.userNo)
    expect(await repo.findCredentialByUserId(' casey')).toBeNull()
  })
})

describe('findPrincipal', () => {
  it('역할 이름 · 권한 · 대표 팀(작은 teamNo) · 퇴사 · 강제 변경을 싣는다', async () => {
    const roleNo = await seedRole(t.db, {
      roleName: '운영자',
      permissions: ['user:read', 'team:read'],
    })
    const user = await seedUser(t.db, {
      roleNo,
      userId: 'principal-a',
      userName: '김운영',
      isPasswordChangeRequired: true,
    })
    const big = await seedTeam(t.db, '나중 팀')
    const small = await seedTeam(t.db, '먼저 팀')
    const first = small < big ? small : big
    await addToTeam(t.db, big, user.userNo)
    await addToTeam(t.db, small, user.userNo)

    const principal = await repo.findPrincipal(user.userNo)
    expect(principal).toEqual({
      userNo: user.userNo,
      userId: 'principal-a',
      userName: '김운영',
      roleNo,
      roleName: '운영자',
      teamNo: first,
      teamName: first === small ? '먼저 팀' : '나중 팀',
      permissions: ['user:read', 'team:read'],
      isPasswordChangeRequired: true,
      resignAt: null,
    })
  })

  it('팀이 없으면 teamNo · teamName 이 null', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo })
    expect(await repo.findPrincipal(user.userNo)).toMatchObject({ teamNo: null, teamName: null })
  })

  it('🔴 권한 JSON 이 배열이 아니면 [], 배열이면 문자열 원소만 — fail-closed', async () => {
    const objectRole = await seedRole(t.db, { permissions: { all: true } })
    const mixedRole = await seedRole(t.db, { permissions: [1, 'user:read', null, ['x']] })
    const a = await seedUser(t.db, { roleNo: objectRole })
    const b = await seedUser(t.db, { roleNo: mixedRole })
    expect((await repo.findPrincipal(a.userNo))?.permissions).toEqual([])
    expect((await repo.findPrincipal(b.userNo))?.permissions).toEqual(['user:read'])
  })

  it('없는 사용자는 null', async () => {
    expect(await repo.findPrincipal(999_999n)).toBeNull()
  })
})

describe('saveLoginState', () => {
  it('카운트와 잠금 시각을 쓴다', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo })
    const lockUntil = new Date('2031-02-03T04:05:06.000Z')
    await repo.saveLoginState(user.userNo, { loginFailCount: 5, lockUntil })
    expect(await repo.findCredentialByNo(user.userNo)).toMatchObject({
      loginFailCount: 5,
      lockUntil,
    })
    await repo.saveLoginState(user.userNo, { loginFailCount: 0, lockUntil: null })
    expect(await repo.findCredentialByNo(user.userNo)).toMatchObject({
      loginFailCount: 0,
      lockUntil: null,
    })
  })
})

describe('changePassword', () => {
  it('🔴 기대 해시가 다르면 0행 — 아무것도 바꾸지 않는다', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo, isPasswordChangeRequired: true, loginFailCount: 3 })
    const before = await repo.findCredentialByNo(user.userNo)
    const changed = await runWriteTransaction(t.db, (trx) =>
      repo.changePassword(trx, user.userNo, 'not-the-hash', 'new-hash'),
    )
    expect(changed).toBe(0)
    expect(await repo.findCredentialByNo(user.userNo)).toEqual(before)
  })

  it('기대 해시가 같으면 1행 — 해시 교체 · 플래그 해제 · 카운터 · 잠금 초기화', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, {
      roleNo,
      isPasswordChangeRequired: true,
      loginFailCount: 4,
      lockUntil: new Date('2030-01-01T00:00:00.000Z'),
    })
    const before = (await repo.findCredentialByNo(user.userNo))!
    const newHash = await hashPassword('brand-new-pass')
    const changed = await runWriteTransaction(t.db, (trx) =>
      repo.changePassword(trx, user.userNo, before.passwordHash, newHash),
    )
    expect(changed).toBe(1)
    expect(await repo.findCredentialByNo(user.userNo)).toMatchObject({
      passwordHash: newHash,
      isPasswordChangeRequired: false,
      loginFailCount: 0,
      lockUntil: null,
    })
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/kysely-auth.repository.db.test.ts`
Expected: FAIL — `./kysely-auth.repository.js` 를 찾지 못한다.

- [ ] **Step 4: 구현한다**

`packages/admin-server/src/tokens.ts` 끝에 더한다:

```ts
/** `AdminAuthRepository` — 사용자 테이블을 읽고 쓰는 교체 지점(스펙 ⑤ A1). 교체는 `AdminAuthModule.withRepository` */
export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY')
```

`packages/admin-server/src/auth/auth.repository.ts`:

```ts
import type { Transaction } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import type { AdminLoginState } from './login-policy.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.repository.ts(AUTH_REPOSITORY 인터페이스 · 기대 해시 조건부 교체)
// 바꾼 점: 사용자 쪽 다섯 메서드만이다(스펙 ⑤ A1) — 세션은 패키지 코어 장(0007)이라 컬럼 차이가 없어 패키지 내부
//   AdminSessionStore 가 맡는다. `isActive` 대신 `resignAt`(효력 시각, 스펙 ④ R1). `touchLastLogin` 은 코어 컬럼이 없어
//   뺐다(쓰는 쪽은 login.success 이벤트로 남긴다).

export type { AdminLoginState }

/** 비밀번호 확인 세 자리(로그인 · 변경 · 재인증)가 읽는 행 */
export interface AdminCredential {
  userNo: bigint
  passwordHash: string
  /** 🔴 효력 시각 — 이 시각부터 로그인 · 요청이 막힌다. null = 재직(스펙 ④ R1) */
  resignAt: Date | null
  loginFailCount: number
  lockUntil: Date | null
  isPasswordChangeRequired: boolean
}

/** 매 요청 · `/me` 가 읽는 행 */
export interface AdminPrincipalRecord {
  userNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  /** 대표 팀 — teamNo 오름차순 첫 행(hangang R34). 팀이 없으면 null */
  teamNo: bigint | null
  teamName: string | null
  /** 역할 권한(검증 전 문자열). 강제 변경 계정이어도 그대로 — 비우는 것은 서비스다 */
  permissions: string[]
  isPasswordChangeRequired: boolean
  resignAt: Date | null
}

/**
 * 사용자 테이블 컬럼이 코어(`users.userId` · `password` · `userName` · `resignAt` …)와 다른 프로젝트는 이 인터페이스를
 * 구현해 `AdminAuthModule.withRepository(MyRepo)` 로 바꾼다. 🔴 컬럼 매핑 옵션은 만들지 않는다(2a §1-4 #5).
 */
export interface AdminAuthRepository {
  findCredentialByUserId(userId: string): Promise<AdminCredential | null>
  findCredentialByNo(userNo: bigint): Promise<AdminCredential | null>
  findPrincipal(userNo: bigint): Promise<AdminPrincipalRecord | null>
  saveLoginState(userNo: bigint, state: AdminLoginState): Promise<void>
  /**
   * 🔴 기대 해시(`expectedHash`)가 그대로일 때만 바꾼다 — 바꿀 때 `isPasswordChangeRequired = false` · `loginFailCount = 0`
   * · `lockUntil = null` 을 함께 쓴다. 바뀐 행 수(0 = 검증 뒤 다른 쓰기가 먼저 커밋). 받은 트랜잭션 위에서만 쓴다.
   */
  changePassword(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    expectedHash: string,
    newHash: string,
  ): Promise<number>
}
```

`packages/admin-server/src/auth/kysely-auth.repository.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Kysely, Transaction } from 'kysely'
import { readJsonColumn } from '../database/json.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import type {
  AdminAuthRepository,
  AdminCredential,
  AdminLoginState,
  AdminPrincipalRecord,
} from './auth.repository.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.repository.ts(KyselyAuthRepository) + hangang-home
//       modules/auth/auth.service.ts `primaryTeamQuery`(대표 팀 R34) · users.service.ts `findMeByUserNo`(역할 조인)
// 바꾼 점:
//  - 코어 users 컬럼(hangang 이름)을 읽는다. 대표 팀은 LEFT JOIN — 팀 없는 계정도 인증된다(hangang 은 INNER 라 팀 미배정
//    계정이 401 이었다). IP team 층은 2f 가 teamNos 가 빈 경우를 다룬다.
//  - 권한 JSON 이 배열이 아니면 [] + 경고(fail-closed) — 깨진 JSON 이 500 으로 그 역할 전원을 막지 않는다.

@Injectable()
export class KyselyAuthRepository implements AdminAuthRepository {
  private readonly logger = new Logger('KyselyAuthRepository')

  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  async findCredentialByUserId(userId: string): Promise<AdminCredential | null> {
    const row = await runQuery(() =>
      this.credentialQuery().where('userId', '=', userId).executeTakeFirst(),
    )
    return row ?? null
  }

  async findCredentialByNo(userNo: bigint): Promise<AdminCredential | null> {
    const row = await runQuery(() =>
      this.credentialQuery().where('userNo', '=', userNo).executeTakeFirst(),
    )
    return row ?? null
  }

  async findPrincipal(userNo: bigint): Promise<AdminPrincipalRecord | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('users')
        .innerJoin('roles', 'roles.roleNo', 'users.roleNo')
        // 🔴 대표 팀 = 가장 작은 teamNo(hangang R34) — 로그인 · 가드 · 2f IP 판정이 같은 팀을 본다. 다중 팀은 범위 밖.
        .leftJoin(
          (eb) =>
            eb
              .selectFrom('teamUserMap')
              .select((sub) => [
                'teamUserMap.userNo',
                sub.fn.min('teamUserMap.teamNo').as('teamNo'),
              ])
              .where('teamUserMap.userNo', '=', userNo)
              .groupBy('teamUserMap.userNo')
              .as('primaryTeam'),
          (join) => join.onRef('primaryTeam.userNo', '=', 'users.userNo'),
        )
        .leftJoin('teams', 'teams.teamNo', 'primaryTeam.teamNo')
        .select([
          'users.userNo',
          'users.userId',
          'users.userName',
          'users.roleNo',
          'roles.roleName',
          'roles.permissions',
          'teams.teamNo',
          'teams.teamName',
          'users.isPasswordChangeRequired',
          'users.resignAt',
        ])
        .where('users.userNo', '=', userNo)
        .executeTakeFirst(),
    )
    if (row == null) return null
    return {
      userNo: row.userNo,
      userId: row.userId,
      userName: row.userName,
      roleNo: row.roleNo,
      roleName: row.roleName,
      teamNo: row.teamNo ?? null,
      teamName: row.teamName ?? null,
      permissions: this.readPermissions(row.roleNo, row.permissions),
      isPasswordChangeRequired: row.isPasswordChangeRequired,
      resignAt: row.resignAt,
    }
  }

  async saveLoginState(userNo: bigint, state: AdminLoginState): Promise<void> {
    await runQuery(() =>
      this.db
        .updateTable('users')
        .set({ loginFailCount: state.loginFailCount, lockUntil: state.lockUntil })
        .where('userNo', '=', userNo)
        .execute(),
    )
  }

  async changePassword(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    expectedHash: string,
    newHash: string,
  ): Promise<number> {
    // 트랜잭션 안이라 runQuery 로 감싸지 않는다 — runWriteTransaction 이 드라이버 오류를 바꾼다.
    const result = await trx
      .updateTable('users')
      .set({
        password: newHash,
        isPasswordChangeRequired: false,
        loginFailCount: 0,
        lockUntil: null,
      })
      .where('userNo', '=', userNo)
      .where('password', '=', expectedHash)
      .executeTakeFirst()
    return Number(result.numUpdatedRows)
  }

  private credentialQuery() {
    return this.db
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

  private readPermissions(roleNo: bigint, value: unknown): string[] {
    let parsed: unknown
    try {
      parsed = readJsonColumn(value)
    } catch {
      parsed = undefined
    }
    if (!Array.isArray(parsed)) {
      this.logger.warn(`역할 ${roleNo} 의 permissions 가 배열이 아니다 — 빈 권한으로 본다.`)
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string')
  }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/kysely-auth.repository.db.test.ts`
Expected: PASS(10 tests). `findPrincipal` 의 파생 테이블이 타입 검사에서 막히면(`sub.fn.min` 의 별칭) 구문은 그대로 두고 `select` 콜백의 반환 배열에 `as const` 를 붙여 본다 — SQL 은 `left join (select user_no, min(team_no) as team_no from team_user_map where user_no = ? group by user_no) as primary_team` 이어야 한다.

- [ ] **Step 6: `resignAt` 의 뜻을 적는다(스펙 ④ R1 · §13)**

`packages/admin-server/src/database/tables/users.ts` 의 `resignAt` 주석을 바꾼다:

```ts
/** 🔴 퇴사 효력 시각 — 이 시각부터 로그인 · 요청이 막힌다(인증은 resignAt ≤ now 만 본다). NULL = 재직 */
resignAt: Date | null
```

머리 주석의 `// 바꾼 점:` 줄을 이렇게 바꾼다:

```ts
// 바꾼 점: `revision` 추가. `resignAt` 은 효력 시각이다(2b 스펙 ④ R1 — hangang 은 날짜였다).
```

`packages/admin-server/src/database/migrations/0002_users.ts` 의 `resignAt` 컬럼 주석을 바꾼다:

```ts
    .addColumn('resignAt', 'timestamp', (col) =>
      col
        .modifyFront(sql`null`)
        .modifyEnd(comment('퇴사 효력 시각. 이 시각부터 로그인 · 요청이 막힌다. NULL = 재직')),
    )
```

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/database/migrations/ddl.test.ts`
Expected: PASS — 식별자는 바뀌지 않았다(주석만).

- [ ] **Step 7: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/test-support/auth.ts packages/admin-server/src/tokens.ts packages/admin-server/src/database/tables/users.ts packages/admin-server/src/database/migrations/0002_users.ts
pnpm check
pnpm test:db
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): AUTH_REPOSITORY 와 Kysely 기본 구현 — 대표 팀 · 권한 fail-closed · 조건부 비밀번호 교체

resignAt 을 효력 시각으로 적는다(2b 스펙 ④ R1).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

Expected: `pnpm check` · `pnpm test:db` 초록.

---

### Task 6: `AdminSessionStore` — 세션 생성 · 회전 트랜잭션 · 폐기

**Files:**

- Create: `packages/admin-server/src/auth/session.store.ts` · `session.store.db.test.ts`
- Modify: `packages/admin-server/src/test-support/auth.ts`(잠금 연결 `holdRotation` 을 끝에 더한다)

**Interfaces:**

- Consumes: `KYSELY` · `runQuery` · `runWriteTransaction` · `AdminDatabase` · `AdminSessionRevokeReason`(2a), `testDbServer` · `TestDatabase`(2a test-support)
- Produces:
  - `interface AdminSessionRow { sessionNo: bigint; userNo: bigint; loginAt: Date; expireAt: Date; isRevoked: boolean; revokedReason: AdminSessionRevokeReason | null; revokedAt: Date | null; replacedBySessionNo: bigint | null }`
  - `interface NewSessionInput { userNo: bigint; refreshTokenHash: string; userAgent: string | null; ipAddress: string | null; loginAt: Date; now: Date; expireAt: Date }`
  - `SESSION_USER_AGENT_MAX = 512` · `SESSION_IP_ADDRESS_MAX = 45`
  - `class AdminSessionStore`:
    - `create(input: NewSessionInput): Promise<bigint>`
    - `findByRefreshHash(hash: string): Promise<AdminSessionRow | null>` · `findByNo(sessionNo: bigint): Promise<AdminSessionRow | null>`
    - `rotate(old: { sessionNo: bigint; loginAt: Date }, next: Omit<NewSessionInput, 'loginAt'>): Promise<bigint | null>` — 0행이면 null
    - `revoke(sessionNo: bigint, reason: AdminSessionRevokeReason, now: Date): Promise<number>`
    - `revokeAllOfUser(userNo: bigint, reason: AdminSessionRevokeReason, now: Date, options?: { exceptSessionNo?: bigint; trx?: Transaction<AdminDatabase> }): Promise<number>`
  - test-support: `holdRotation(t: TestDatabase, sessionNo: bigint, replacedBySessionNo: bigint | null): Promise<{ release(): Promise<void> }>`

- [ ] **Step 1: 잠금 연결 도우미를 더한다**

`packages/admin-server/src/test-support/auth.ts` — import 에 `createConnection` · `testDbServer` · `TestDatabase` 를 더하고 끝에 함수를 더한다:

```ts
import { createConnection } from 'mariadb'
import type { TestDatabase } from './db.js'
import { testDbServer } from './db-url.js'
```

```ts
/**
 * 🔴 P1(동시 회전 경합)을 결정적으로 재현한다(스펙 §9-3 · §14 R1-4). 별도 연결이 옛 행을 커밋 전 'rotated' 로 잡는다 —
 * 그동안 autocommit 읽기는 옛(살아 있는) 버전을 보고, 같은 행의 조건부 UPDATE 는 `release()` 의 커밋까지 기다렸다가
 * 0행을 받는다.
 */
export async function holdRotation(
  t: TestDatabase,
  sessionNo: bigint,
  replacedBySessionNo: bigint | null,
): Promise<{ release(): Promise<void> }> {
  // 🔴 revoked_at 은 테스트 프로세스 시각으로 넣는다 — DB 컨테이너 시계(UTC_TIMESTAMP)가 호스트보다 5초 넘게 앞서면 유예
  //    판정이 재사용으로 바뀐다. timezone 'Z' + 프로세스 TZ=UTC(vitest env)라 저장 바이트가 UTC 다(2a R8).
  const connection = await createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
  await connection.beginTransaction()
  await connection.query(
    "update sessions set is_revoked = 1, revoked_reason = 'rotated', revoked_at = ?, replaced_by_session_no = ? where session_no = ?",
    [new Date(), replacedBySessionNo, sessionNo],
  )
  return {
    async release() {
      try {
        await connection.commit()
      } finally {
        await connection.end()
      }
    },
  }
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/session.store.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { holdRotation, seedRole, seedUser } from '../test-support/auth.js'
import { createRefreshToken, hashRefreshToken } from './refresh-token.js'
import { AdminSessionStore, type NewSessionInput } from './session.store.js'

let t: TestDatabase
let store: AdminSessionStore
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  store = new AdminSessionStore(t.db)
  roleNo = await seedRole(t.db)
})

afterAll(async () => {
  await t?.drop()
})

/** 초 단위로 잘린 시각 — datetime · timestamp 컬럼은 초에서 잘린다(스펙 §14 R5) */
function second(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000)
}

function input(userNo: bigint, overrides: Partial<NewSessionInput> = {}): NewSessionInput {
  const now = second(new Date())
  return {
    userNo,
    refreshTokenHash: hashRefreshToken(createRefreshToken()),
    userAgent: 'UA/1',
    ipAddress: '10.0.0.1',
    loginAt: now,
    now,
    expireAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
    ...overrides,
  }
}

describe('create · find', () => {
  it('넣은 값 그대로 읽는다 — 해시 · 번호로', async () => {
    const user = await seedUser(t.db, { roleNo })
    const fields = input(user.userNo, { loginAt: second(new Date('2026-01-01T00:00:00.000Z')) })
    const sessionNo = await store.create(fields)
    const row = await store.findByRefreshHash(fields.refreshTokenHash)
    expect(row).toEqual({
      sessionNo,
      userNo: user.userNo,
      loginAt: fields.loginAt,
      expireAt: fields.expireAt,
      isRevoked: false,
      revokedReason: null,
      revokedAt: null,
      replacedBySessionNo: null,
    })
    expect(await store.findByNo(sessionNo)).toEqual(row)
    expect(await store.findByRefreshHash(hashRefreshToken('nope'))).toBeNull()
  })

  it('🔴 이모지가 든 600자 User-Agent 를 코드 포인트 512자로 자르고 IP 를 45자로 자른다 — Review Focus 3', async () => {
    const user = await seedUser(t.db, { roleNo })
    const userAgent = '🙂'.repeat(600)
    const sessionNo = await store.create(
      input(user.userNo, { userAgent, ipAddress: '1'.repeat(60) }),
    )
    const row = await t.db
      .selectFrom('sessions')
      .select(['userAgent', 'ipAddress'])
      .where('sessionNo', '=', sessionNo)
      .executeTakeFirstOrThrow()
    expect([...(row.userAgent ?? '')]).toHaveLength(512)
    expect(row.userAgent).toBe('🙂'.repeat(512))
    expect(row.ipAddress).toBe('1'.repeat(45))
  })
})

describe('rotate', () => {
  it('옛 행을 rotated 로 · 새 행은 옛 loginAt 을 옮겨 담고 · 옛 행이 새 행을 가리킨다', async () => {
    const user = await seedUser(t.db, { roleNo })
    const loginAt = second(new Date('2026-02-02T02:02:02.000Z'))
    const oldNo = await store.create(input(user.userNo, { loginAt }))
    const now = second(new Date())
    const next = input(user.userNo, { now })
    const newNo = await store.rotate({ sessionNo: oldNo, loginAt }, next)
    expect(newNo).not.toBeNull()
    expect(await store.findByNo(oldNo)).toMatchObject({
      isRevoked: true,
      revokedReason: 'rotated',
      revokedAt: now,
      replacedBySessionNo: newNo,
    })
    expect(await store.findByNo(newNo!)).toMatchObject({
      userNo: user.userNo,
      loginAt,
      isRevoked: false,
      replacedBySessionNo: null,
    })
  })

  it('이미 폐기된 행은 0행 — null', async () => {
    const user = await seedUser(t.db, { roleNo })
    const oldNo = await store.create(input(user.userNo))
    await store.revoke(oldNo, 'terminated', new Date())
    expect(
      await store.rotate({ sessionNo: oldNo, loginAt: new Date() }, input(user.userNo)),
    ).toBeNull()
  })

  it('🔴 INSERT 가 실패하면 옛 행도 되돌아간다 — 한 트랜잭션(스펙 B3)', async () => {
    const user = await seedUser(t.db, { roleNo })
    const taken = input(user.userNo)
    await store.create(taken)
    const oldNo = await store.create(input(user.userNo))
    const error = await store
      .rotate(
        { sessionNo: oldNo, loginAt: new Date() },
        input(user.userNo, { refreshTokenHash: taken.refreshTokenHash }),
      )
      .then(
        () => undefined,
        (caught: unknown) => caught,
      )
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_DUPLICATED)
    expect(await store.findByNo(oldNo)).toMatchObject({ isRevoked: false, revokedReason: null })
  })

  it('🔴 다른 연결이 커밋 전에 옛 행을 잡고 있으면 기다렸다가 0행 — P1(스펙 §14 R1-4)', async () => {
    const user = await seedUser(t.db, { roleNo })
    const oldNo = await store.create(input(user.userNo))
    const successorNo = await store.create(input(user.userNo))
    const hold = await holdRotation(t, oldNo, successorNo)
    const pending = store.rotate({ sessionNo: oldNo, loginAt: new Date() }, input(user.userNo))
    await new Promise((resolve) => setTimeout(resolve, 300))
    await hold.release()
    expect(await pending).toBeNull()
    expect(await store.findByNo(oldNo)).toMatchObject({
      revokedReason: 'rotated',
      replacedBySessionNo: successorNo,
    })
  })
})

describe('revoke · revokeAllOfUser', () => {
  it('revoke 는 살아 있을 때만 — 이미 폐기된 행의 사유를 덮지 않는다', async () => {
    const user = await seedUser(t.db, { roleNo })
    const sessionNo = await store.create(input(user.userNo))
    expect(await store.revoke(sessionNo, 'terminated', new Date())).toBe(1)
    expect(await store.revoke(sessionNo, 'reuse_detected', new Date())).toBe(0)
    expect(await store.findByNo(sessionNo)).toMatchObject({ revokedReason: 'terminated' })
  })

  it('🔴 revokeAllOfUser 는 그 사용자의 살아 있는 행만 바꾼다 — rotated · terminated 사유와 남의 세션은 그대로(hangang R34)', async () => {
    const user = await seedUser(t.db, { roleNo })
    const other = await seedUser(t.db, { roleNo })
    const rotatedOld = await store.create(input(user.userNo))
    const live = await store.rotate(
      { sessionNo: rotatedOld, loginAt: new Date() },
      input(user.userNo),
    )
    const ended = await store.create(input(user.userNo))
    await store.revoke(ended, 'terminated', new Date())
    const liveTwo = await store.create(input(user.userNo))
    const othersLive = await store.create(input(other.userNo))

    expect(await store.revokeAllOfUser(user.userNo, 'reuse_detected', new Date())).toBe(2)
    expect((await store.findByNo(rotatedOld))?.revokedReason).toBe('rotated')
    expect((await store.findByNo(ended))?.revokedReason).toBe('terminated')
    expect((await store.findByNo(live!))?.revokedReason).toBe('reuse_detected')
    expect((await store.findByNo(liveTwo))?.revokedReason).toBe('reuse_detected')
    expect((await store.findByNo(othersLive))?.isRevoked).toBe(false)
  })

  it('exceptSessionNo 는 남기고 trx 위에서도 돈다', async () => {
    const user = await seedUser(t.db, { roleNo })
    const keep = await store.create(input(user.userNo))
    const drop = await store.create(input(user.userNo))
    const count = await t.db
      .transaction()
      .execute((trx) =>
        store.revokeAllOfUser(user.userNo, 'terminated', new Date(), {
          exceptSessionNo: keep,
          trx,
        }),
      )
    expect(count).toBe(1)
    expect((await store.findByNo(keep))?.isRevoked).toBe(false)
    expect((await store.findByNo(drop))?.revokedReason).toBe('terminated')
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/session.store.db.test.ts`
Expected: FAIL — `./session.store.js` 를 찾지 못한다.

- [ ] **Step 4: 구현한다**

`packages/admin-server/src/auth/session.store.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import type { Kysely, Transaction } from 'kysely'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase, AdminSessionRevokeReason } from '../database/types.js'
import { KYSELY } from '../tokens.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.repository.ts(세션 메서드 · 호출부가 주는 revokedAt) +
//       hangang-home modules/auth/auth.service.ts `issueSession`(메타를 폭으로 자른 뒤 INSERT · A6) · 폐기 조건절(R34)
// 바꾼 점:
//  - 🔴 회전이 한 트랜잭션이다(스펙 B3) — 정본 둘은 폐기 · INSERT · 링크를 따로 보내 INSERT 가 죽으면 그 기기가 되돌릴 수
//    없이 로그아웃됐다.
//  - 메타를 코드 포인트 단위로 자른다 — UTF-16 으로 자르면 이모지 서로게이트 반쪽이 남는다.
//  - 패키지 내부다(스펙 ⑤ A1) — 교체 대상이 아니다. 2c 가 목록 메서드를 더한다.

export interface AdminSessionRow {
  sessionNo: bigint
  userNo: bigint
  loginAt: Date
  expireAt: Date
  isRevoked: boolean
  revokedReason: AdminSessionRevokeReason | null
  revokedAt: Date | null
  replacedBySessionNo: bigint | null
}

export interface NewSessionInput {
  userNo: bigint
  /** sha256 hex — 원문을 넘기지 않는다 */
  refreshTokenHash: string
  userAgent: string | null
  ipAddress: string | null
  /** 첫 로그인 시각 — 회전은 옛 값을 옮겨 담는다(2a F14) */
  loginAt: Date
  /** 이 요청의 시각 — lastAccessAt 이 된다 */
  now: Date
  expireAt: Date
}

/** 0007 장의 컬럼 폭 */
export const SESSION_USER_AGENT_MAX = 512
export const SESSION_IP_ADDRESS_MAX = 45

const SESSION_COLUMNS = [
  'sessionNo',
  'userNo',
  'loginAt',
  'expireAt',
  'isRevoked',
  'revokedReason',
  'revokedAt',
  'replacedBySessionNo',
] as const

/** 🔴 자르지 않으면 회전 중 INSERT 가 죽는다(hangang A6). 코드 포인트 단위 — 서로게이트 반쪽을 남기지 않는다. */
function clamp(value: string | null, max: number): string | null {
  if (value == null) return null
  const points = [...value]
  return points.length <= max ? value : points.slice(0, max).join('')
}

async function insertSession(db: Kysely<AdminDatabase>, input: NewSessionInput): Promise<bigint> {
  const result = await db
    .insertInto('sessions')
    .values({
      userNo: input.userNo,
      refreshTokenHash: input.refreshTokenHash,
      userAgent: clamp(input.userAgent, SESSION_USER_AGENT_MAX),
      ipAddress: clamp(input.ipAddress, SESSION_IP_ADDRESS_MAX),
      loginAt: input.loginAt,
      lastAccessAt: input.now,
      expireAt: input.expireAt,
    })
    .executeTakeFirstOrThrow()
  if (result.insertId === undefined)
    throw new Error('sessions INSERT 가 insertId 를 돌려주지 않았다.')
  return result.insertId
}

@Injectable()
export class AdminSessionStore {
  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  create(input: NewSessionInput): Promise<bigint> {
    return runQuery(() => insertSession(this.db, input))
  }

  async findByRefreshHash(refreshTokenHash: string): Promise<AdminSessionRow | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('sessions')
        .select(SESSION_COLUMNS)
        .where('refreshTokenHash', '=', refreshTokenHash)
        .executeTakeFirst(),
    )
    return row ?? null
  }

  async findByNo(sessionNo: bigint): Promise<AdminSessionRow | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('sessions')
        .select(SESSION_COLUMNS)
        .where('sessionNo', '=', sessionNo)
        .executeTakeFirst(),
    )
    return row ?? null
  }

  /**
   * 🔴 한 트랜잭션: 옛 행 조건부 폐기 → 새 행 INSERT → 옛 행 링크. 조건부 UPDATE 가 0행이면 null — 다른 요청이 먼저
   * 회전했다(P1). InnoDB UPDATE 는 잠금 읽기라 진 쪽은 이긴 쪽 커밋까지 기다렸다가 0행을 받는다(스펙 §14 R1-4).
   * 🔴 호출부는 null 뒤의 재조회를 이 트랜잭션 밖에서 한다(스펙 §14 R2).
   */
  rotate(
    old: { sessionNo: bigint; loginAt: Date },
    next: Omit<NewSessionInput, 'loginAt'>,
  ): Promise<bigint | null> {
    return runWriteTransaction(this.db, async (trx) => {
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
    })
  }

  /** 살아 있을 때만 폐기한다 — 🔴 이미 폐기된 행의 사유를 덮지 않는다('rotated' 를 덮으면 재사용 탐지가 꺼진다, gise). */
  async revoke(sessionNo: bigint, reason: AdminSessionRevokeReason, now: Date): Promise<number> {
    const result = await runQuery(() =>
      this.db
        .updateTable('sessions')
        .set({ isRevoked: true, revokedReason: reason, revokedAt: now })
        .where('sessionNo', '=', sessionNo)
        .where('isRevoked', '=', false)
        .executeTakeFirst(),
    )
    return Number(result.numUpdatedRows)
  }

  /** 🔴 그 사용자의 살아 있는 행만 바꾼다 — 'rotated' · 'terminated' 사유는 사후 분석 정보라 남긴다(hangang R34). */
  async revokeAllOfUser(
    userNo: bigint,
    reason: AdminSessionRevokeReason,
    now: Date,
    options: { exceptSessionNo?: bigint; trx?: Transaction<AdminDatabase> } = {},
  ): Promise<number> {
    const run = (db: Kysely<AdminDatabase>) => {
      let query = db
        .updateTable('sessions')
        .set({ isRevoked: true, revokedReason: reason, revokedAt: now })
        .where('userNo', '=', userNo)
        .where('isRevoked', '=', false)
      if (options.exceptSessionNo != null) {
        query = query.where('sessionNo', '!=', options.exceptSessionNo)
      }
      return query.executeTakeFirst()
    }
    const result = options.trx ? await run(options.trx) : await runQuery(() => run(this.db))
    return Number(result.numUpdatedRows)
  }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/session.store.db.test.ts`
Expected: PASS(9 tests). P1 테스트는 약 0.3초 기다린다.

- [ ] **Step 6: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/test-support/auth.ts
pnpm check
pnpm test:db
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): 세션 저장소 — 회전 한 트랜잭션 · 조건부 폐기 · 살아 있는 행만 일괄 폐기

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 문구 표 · 훅 자리 · 주체 · 데코레이터 · `AdminPermissionGuard`

**Files:**

- Modify: `packages/admin-server/src/auth/errors.ts`(문구 표 전체)
- Modify: `packages/admin-server/src/tokens.ts`(`ADMIN_ACCESS_POLICY` · `ADMIN_AUTH_EVENTS` · 메타 키 다섯)
- Create: `packages/admin-server/src/auth/hooks.ts`
- Create: `packages/admin-server/src/auth/principal.ts` · `principal.test.ts`
- Create: `packages/admin-server/src/auth/decorators.ts`
- Create: `packages/admin-server/src/auth/permission.guard.ts` · `permission.guard.test.ts`

**Interfaces:**

- Consumes: `ResolvedAuthConfig` · `resolveAuthConfig` · `ADMIN_AUTH_CONFIG`(Task 3), admin-shared `hasPermission` · `hasAnyPermission`
- Produces:
  - `AUTH_MESSAGES`(아래 키 전부)
  - tokens: `ADMIN_ACCESS_POLICY` · `ADMIN_AUTH_EVENTS`(공개), `IS_PUBLIC` · `IS_SELF_ONLY` · `REQUIRED_PERMISSIONS` · `ANY_PERMISSIONS` · `ALLOW_PASSWORD_CHANGE`(메타 키)
  - `interface AdminAccessContext { clientIp: string | null; userNo: bigint; teamNos: readonly bigint[] }` · `interface AdminAccessPolicy { allows(context: AdminAccessContext): Promise<boolean> }`
  - `type AdminAuthEvent`(스펙 §4-6) · `interface AdminAuthEventSink { record(event: AdminAuthEvent, req: Request): Promise<void> }`
  - `interface AdminPrincipal`(스펙 §4-4) · `interface AdminMe` · `toAdminMe(principal): AdminMe` · `getAdminPrincipal(req): AdminPrincipal | undefined` · `setAdminPrincipal(req, principal): void`
  - `Public()` · `SelfOnly()` · `RequirePermissions(...p: string[])` · `RequireAnyPermissions(...p: string[])` · `AllowDuringPasswordChange()`(내부) · `CurrentAdmin()`
  - `class AdminPermissionGuard implements CanActivate`(생성자 `(reflector: Reflector, @Inject(ADMIN_AUTH_CONFIG) config: ResolvedAuthConfig)`)

- [ ] **Step 1: 문구 표 · 토큰 · 훅을 쓴다(동작 없는 선언)**

`packages/admin-server/src/auth/errors.ts` 를 통째로 바꾼다:

```ts
// 인증 오류 문구 — 서비스 · 가드 · 테스트가 이 표 하나를 본다(스펙 §5 · §14 R6). 코드 · 상태는 admin-shared 코어 표.

export const AUTH_MESSAGES = {
  unauthorized: '인증이 필요합니다.',
  loginFailed: '아이디 또는 비밀번호가 올바르지 않습니다.',
  resigned: '퇴사한 계정입니다.',
  ipNotAllowed: '허용되지 않은 접속 위치입니다.',
  locked: '로그인 실패가 반복되어 계정이 잠겼습니다. 잠시 후 다시 시도해 주세요.',
  accessExpired: '접근 토큰이 만료되었습니다.',
  accessInvalid: '유효하지 않은 접근 토큰입니다.',
  sessionInvalid: '세션이 유효하지 않습니다.',
  sessionExpired: '세션이 만료되었습니다.',
  refreshMissing: '갱신 토큰이 없습니다.',
  refreshInvalid: '유효하지 않은 갱신 토큰입니다.',
  refreshEnded: '세션이 종료되었습니다. 다시 로그인해 주세요.',
  refreshExpired: '갱신 토큰이 만료되었습니다.',
  refreshRaced: '이미 갱신된 토큰입니다. 잠시 후 다시 시도해 주세요.',
  refreshReused: '이미 사용된 갱신 토큰입니다. 다시 로그인해 주세요.',
  passwordChangeRequired: '비밀번호를 바꾼 뒤 이용할 수 있습니다.',
  noPermissionDeclared: '이 기능에 접근할 수 없습니다.',
  forbidden: '권한이 없습니다.',
  currentPasswordMismatch: '현재 비밀번호가 올바르지 않습니다.',
  reauthFailed: '비밀번호가 올바르지 않습니다.',
  passwordConflict: '동시 요청이 충돌했습니다. 다시 시도해 주세요.',
} as const
```

`packages/admin-server/src/tokens.ts` 끝에 더한다:

```ts
/** 2f 가 제공하는 IP 접근 정책(선택, `AdminAccessPolicy`). 제공하는 모듈은 전역으로 내보낸다 */
export const ADMIN_ACCESS_POLICY = Symbol('ADMIN_ACCESS_POLICY')

/** 2c 가 제공하는 인증 이벤트 기록기(선택, `AdminAuthEventSink`). 제공하는 모듈은 전역으로 내보낸다 */
export const ADMIN_AUTH_EVENTS = Symbol('ADMIN_AUTH_EVENTS')

/** 데코레이터 메타데이터 키 — 🔴 `admin-kit:` 접두라 쓰는 쪽 `isPublic` 키와 섞이지 않는다 */
export const IS_PUBLIC = 'admin-kit:public'
export const IS_SELF_ONLY = 'admin-kit:self-only'
export const REQUIRED_PERMISSIONS = 'admin-kit:permissions'
export const ANY_PERMISSIONS = 'admin-kit:any-permissions'
/** 내부 — 강제 변경 계정에도 여는 라우트(me · password) */
export const ALLOW_PASSWORD_CHANGE = 'admin-kit:allow-password-change'
```

`packages/admin-server/src/auth/hooks.ts`:

```ts
import type { Request } from 'express'

// 정본: 없음 — 2c(감사) · 2f(IP 접근 제어)가 꽂을 자리(스펙 ⑧ H1). hangang 은 인증 서비스 · 가드가 감사 · IP 를 직접
//   불렀다 — 여기서는 선택 주입 토큰 둘로 뺀다. 판정 순서(비밀번호 → 퇴사 → IP → 잠김)는 2b 가 고정한다.

export interface AdminAccessContext {
  clientIp: string | null
  userNo: bigint
  /** 대표 팀 하나(또는 빈 배열) — 다중 팀은 범위 밖(hangang R34) */
  teamNos: readonly bigint[]
}

/** `ADMIN_ACCESS_POLICY`. 🔴 boolean 만 돌려준다 — 403 ERR_IP_NOT_ALLOWED + details.clientIp 는 패키지가 던진다(스펙 B7) */
export interface AdminAccessPolicy {
  allows(context: AdminAccessContext): Promise<boolean>
}

/** 인증 이벤트. 🔴 비밀번호 · 토큰 · 해시를 싣지 않는다 */
export type AdminAuthEvent =
  | { type: 'login.success'; userNo: bigint; sessionNo: bigint }
  | { type: 'login.fail'; userId: string; userNo: bigint | null; loginFailCount: number | null }
  | {
      type: 'login.blocked'
      reason: 'resigned' | 'ip' | 'locked'
      userId: string
      userNo: bigint
    }
  | {
      type: 'token.refresh'
      userNo: bigint
      sessionNo: bigint
      rotatedFrom: bigint
      grace: boolean
    }
  | { type: 'token.reuse'; userNo: bigint; sessionNo: bigint; revokedCount: number }
  | { type: 'logout'; userNo: bigint; sessionNo: bigint }
  | { type: 'password.change'; userNo: bigint; sessionNo: bigint; revokedCount: number }
  | { type: 'access.blocked'; reason: 'ip'; userNo: bigint; sessionNo: bigint }

/** `ADMIN_AUTH_EVENTS`. 🔴 던져도 인증은 계속된다 — 패키지가 잡아 Logger.warn(스펙 B8) */
export interface AdminAuthEventSink {
  record(event: AdminAuthEvent, req: Request): Promise<void>
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/principal.test.ts`:

```ts
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import {
  getAdminPrincipal,
  setAdminPrincipal,
  toAdminMe,
  type AdminPrincipal,
} from './principal.js'

const principal: AdminPrincipal = {
  userNo: 7n,
  sessionNo: 70n,
  userId: 'admin',
  userName: '관리자',
  roleNo: 1n,
  roleName: '최고 관리자',
  teamNo: 3n,
  teamName: '운영팀',
  permissions: ['*'],
  isPasswordChangeRequired: false,
}

describe('toAdminMe', () => {
  it('sessionNo 를 빼고 나머지를 싣는다', () => {
    expect(toAdminMe(principal)).toEqual({
      userNo: 7n,
      userId: 'admin',
      userName: '관리자',
      roleNo: 1n,
      roleName: '최고 관리자',
      teamNo: 3n,
      teamName: '운영팀',
      permissions: ['*'],
      isPasswordChangeRequired: false,
    })
  })

  it('팀이 없으면 teamNo · teamName 키를 뺀다(AdminUserInfo 의 ?:)', () => {
    const me = toAdminMe({ ...principal, teamNo: null, teamName: null })
    expect(me).not.toHaveProperty('teamNo')
    expect(me).not.toHaveProperty('teamName')
  })
})

describe('getAdminPrincipal · setAdminPrincipal', () => {
  it('req.admin 에 두고 꺼낸다', () => {
    const req = {} as Request
    expect(getAdminPrincipal(req)).toBeUndefined()
    setAdminPrincipal(req, principal)
    expect(getAdminPrincipal(req)).toBe(principal)
    expect((req as unknown as { admin: unknown }).admin).toBe(principal)
  })
})
```

`packages/admin-server/src/auth/permission.guard.test.ts`:

```ts
import 'reflect-metadata'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import {
  AllowDuringPasswordChange,
  Public,
  RequireAnyPermissions,
  RequirePermissions,
  SelfOnly,
} from './decorators.js'
import { AUTH_MESSAGES } from './errors.js'
import { resolveAuthConfig } from './options.js'
import { AdminPermissionGuard } from './permission.guard.js'
import type { AdminPrincipal } from './principal.js'

class Routes {
  @Public()
  open() {}

  @SelfOnly()
  self() {}

  undeclared() {}

  @RequirePermissions('user:read', 'user:write')
  both() {}

  @RequireAnyPermissions('team:read', 'role:read')
  any() {}

  @RequirePermissions('user:read')
  @RequireAnyPermissions('team:read', 'role:read')
  mixed() {}

  @SelfOnly()
  @AllowDuringPasswordChange()
  me() {}
}

@SelfOnly()
class SelfOnlyRoutes {
  plain() {}

  @RequirePermissions('audit:read')
  audit() {}
}

function principal(permissions: string[], isPasswordChangeRequired = false): AdminPrincipal {
  return {
    userNo: 1n,
    sessionNo: 10n,
    userId: 'u',
    userName: '사용자',
    roleNo: 1n,
    roleName: '역할',
    teamNo: null,
    teamName: null,
    permissions,
    isPasswordChangeRequired,
  }
}

function context(
  target: object,
  method: string,
  admin: AdminPrincipal | undefined,
  type = 'http',
): ExecutionContext {
  const handler = (target as Record<string, unknown>)[method] as () => void
  return {
    getType: () => type,
    getHandler: () => handler,
    getClass: () => (target as { constructor: unknown }).constructor,
    switchToHttp: () => ({ getRequest: () => ({ admin }) }),
  } as unknown as ExecutionContext
}

function guard(failClosed = true): AdminPermissionGuard {
  return new AdminPermissionGuard(
    new Reflector(),
    resolveAuthConfig({ jwtSecret: 's'.repeat(32), failClosed }, undefined),
  )
}

function rejection(run: () => unknown): BusinessError {
  try {
    run()
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('던지지 않았다')
}

const routes = new Routes()
const selfOnlyRoutes = new SelfOnlyRoutes()

describe('AdminPermissionGuard', () => {
  it('🔴 HTTP 가 아닌 컨텍스트는 통과(스펙 §14 R4)', () => {
    expect(guard().canActivate(context(routes, 'undeclared', undefined, 'rpc'))).toBe(true)
  })

  it('@Public 은 주체 없이 통과', () => {
    expect(guard().canActivate(context(routes, 'open', undefined))).toBe(true)
  })

  it('주체가 없으면 401', () => {
    const error = rejection(() => guard().canActivate(context(routes, 'self', undefined)))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED)
    expect(error.message).toBe(AUTH_MESSAGES.unauthorized)
  })

  it('🔴 강제 변경 계정은 허용 표시가 있는 라우트만 — 권한 판정보다 먼저', () => {
    const changing = principal(['*'], true)
    expect(guard().canActivate(context(routes, 'me', changing))).toBe(true)
    for (const method of ['self', 'both', 'undeclared']) {
      const error = rejection(() => guard().canActivate(context(routes, method, changing)))
      expect(error.code).toBe(CommonErrorCodes.ERR_PASSWORD_CHANGE_REQUIRED)
      expect(error.message).toBe(AUTH_MESSAGES.passwordChangeRequired)
    }
  })

  it('@SelfOnly 는 인증만으로 통과', () => {
    expect(guard().canActivate(context(routes, 'self', principal([])))).toBe(true)
  })

  it('🔴 선언이 없으면 403 + reason — fail-closed. "*" 도 막는다', () => {
    for (const granted of [[], ['*']]) {
      const error = rejection(() =>
        guard().canActivate(context(routes, 'undeclared', principal(granted))),
      )
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
      expect(error.message).toBe(AUTH_MESSAGES.noPermissionDeclared)
      expect(error.details).toEqual({ reason: 'no-permission-declared' })
    }
  })

  it('failClosed: false 면 선언 없는 라우트가 인증만으로 통과', () => {
    expect(guard(false).canActivate(context(routes, 'undeclared', principal([])))).toBe(true)
  })

  it('AND — 전부 가져야 한다, "*" 는 정확 일치로 전부', () => {
    expect(() => guard().canActivate(context(routes, 'both', principal(['user:read'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
    expect(
      guard().canActivate(context(routes, 'both', principal(['user:read', 'user:write']))),
    ).toBe(true)
    expect(guard().canActivate(context(routes, 'both', principal(['*'])))).toBe(true)
    // 'user:*' 는 접두 와일드카드가 아니다
    expect(() => guard().canActivate(context(routes, 'both', principal(['user:*'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
  })

  it('OR — 하나라도', () => {
    expect(guard().canActivate(context(routes, 'any', principal(['role:read'])))).toBe(true)
    expect(() => guard().canActivate(context(routes, 'any', principal(['user:read'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
  })

  it('AND · OR 가 함께면 둘 다 통과해야 한다', () => {
    expect(() => guard().canActivate(context(routes, 'mixed', principal(['user:read'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
    expect(() => guard().canActivate(context(routes, 'mixed', principal(['team:read'])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
    expect(
      guard().canActivate(context(routes, 'mixed', principal(['user:read', 'team:read']))),
    ).toBe(true)
  })

  it('🔴 클래스 @SelfOnly 여도 메서드의 권한 선언은 지켜진다(스펙 §14 R3)', () => {
    expect(guard().canActivate(context(selfOnlyRoutes, 'plain', principal([])))).toBe(true)
    expect(() => guard().canActivate(context(selfOnlyRoutes, 'audit', principal([])))).toThrow(
      AUTH_MESSAGES.forbidden,
    )
    expect(guard().canActivate(context(selfOnlyRoutes, 'audit', principal(['audit:read'])))).toBe(
      true,
    )
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/principal.test.ts src/auth/permission.guard.test.ts`
Expected: FAIL — `./principal.js` · `./decorators.js` · `./permission.guard.js` 를 찾지 못한다.

- [ ] **Step 4: 구현한다**

`packages/admin-server/src/auth/principal.ts`:

```ts
import type { Request } from 'express'

// 정본: hangang-home apps/api/src/core/guards/auth.guard.ts `AuthenticatedUser` + ssworks-gise-home
//       core/auth/authenticated-admin.ts(권한은 매 요청 DB · 강제 변경이면 빈 배열)
// 바꾼 점: 주체를 req.admin 에 둔다(회원 인증 passport 의 req.user 와 가른다 — 스펙 ⑦ N1). Express Request 를 전역
//   증강하지 않는다 — getAdminPrincipal · @CurrentAdmin 으로 꺼낸다. 프로젝트 필드(crm scopes 등)는 없다.

export interface AdminPrincipal {
  userNo: bigint
  sessionNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  teamNo: bigint | null
  teamName: string | null
  /** 🔴 강제 변경 계정은 [](gise) — 권한 라우트가 저절로 403 이 된다 */
  permissions: readonly string[]
  isPasswordChangeRequired: boolean
}

/** `GET /auth/me` 응답 — admin-ui `AdminUserInfo` 의 상위 집합(스펙 §4-5) */
export interface AdminMe {
  userNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  teamNo?: bigint
  teamName?: string
  permissions: readonly string[]
  isPasswordChangeRequired: boolean
}

type WithAdmin = Request & { admin?: AdminPrincipal }

export function getAdminPrincipal(req: Request): AdminPrincipal | undefined {
  return (req as WithAdmin).admin
}

export function setAdminPrincipal(req: Request, principal: AdminPrincipal): void {
  ;(req as WithAdmin).admin = principal
}

/** 🔴 필드를 하나씩 옮긴다 — 주체에 무엇이 더해져도 응답으로 새지 않는다. 팀이 없으면 키를 뺀다. */
export function toAdminMe(principal: AdminPrincipal): AdminMe {
  return {
    userNo: principal.userNo,
    userId: principal.userId,
    userName: principal.userName,
    roleNo: principal.roleNo,
    roleName: principal.roleName,
    ...(principal.teamNo == null ? {} : { teamNo: principal.teamNo }),
    ...(principal.teamName == null ? {} : { teamName: principal.teamName }),
    permissions: principal.permissions,
    isPasswordChangeRequired: principal.isPasswordChangeRequired,
  }
}
```

`packages/admin-server/src/auth/decorators.ts`:

```ts
import {
  SetMetadata,
  createParamDecorator,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import {
  ALLOW_PASSWORD_CHANGE,
  ANY_PERMISSIONS,
  IS_PUBLIC,
  IS_SELF_ONLY,
  REQUIRED_PERMISSIONS,
} from '../tokens.js'
import { AUTH_MESSAGES } from './errors.js'
import { getAdminPrincipal, type AdminPrincipal } from './principal.js'

// 정본: hangang-home apps/api/src/core/decorators/{public,self-only,require-permissions,require-any-permissions,
//       current-user}.decorator.ts
// 바꾼 점: 메타 키에 admin-kit: 접두. @CurrentUser → @CurrentAdmin(req.admin — 스펙 ⑦ N1). 권한 인자는 string 이다 —
//   프로젝트 권한 유니온으로 좁히려면 쓰는 쪽이 감싼다. @Cookies 는 옮기지 않았다(컨트롤러가 readCookie 로 읽는다).

/**
 * 관리자 인증 · 권한 가드를 건너뛴다. 🔴 가드는 앱 전역이다(스펙 ② G1) — 관리자 라우트에서는 로그인 · 갱신 · 로그아웃
 * 뿐이고, 회원 · 공개 · 헬스체크 컨트롤러는 클래스에 붙인다.
 */
export function Public(): CustomDecorator<string> {
  return SetMetadata(IS_PUBLIC, true)
}

/** 🔴 "인증만 요구한다" 는 명시 선언이다. 부재가 아니라 이 선언이 통과다(hangang). */
export function SelfOnly(): CustomDecorator<string> {
  return SetMetadata(IS_SELF_ONLY, true)
}

/** AND — 나열한 권한을 모두 가져야 통과한다. `'*'` 는 정확 일치로 전부다. */
export function RequirePermissions(...permissions: string[]): CustomDecorator<string> {
  return SetMetadata(REQUIRED_PERMISSIONS, permissions)
}

/** OR — 나열한 권한 중 하나라도 있으면 통과한다. */
export function RequireAnyPermissions(...permissions: string[]): CustomDecorator<string> {
  return SetMetadata(ANY_PERMISSIONS, permissions)
}

/** 내부 — 강제 변경 계정에도 연다. `me` · `password` 에만 붙인다. 공개하지 않는다(index 에 없다). */
export function AllowDuringPasswordChange(): CustomDecorator<string> {
  return SetMetadata(ALLOW_PASSWORD_CHANGE, true)
}

/** 인증 가드가 채운 주체. 🔴 없으면 401 — @Public 라우트에서 잘못 쓰면 조용히 undefined 가 되는 대신 드러난다. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminPrincipal => {
    const principal = getAdminPrincipal(ctx.switchToHttp().getRequest<Request>())
    if (principal == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }
    return principal
  },
)
```

`packages/admin-server/src/auth/permission.guard.ts`:

```ts
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
  BusinessError,
  CommonErrorCodes,
  hasAnyPermission,
  hasPermission,
} from '@ssworks/admin-shared'
import type { Request } from 'express'
import {
  ADMIN_AUTH_CONFIG,
  ALLOW_PASSWORD_CHANGE,
  ANY_PERMISSIONS,
  IS_PUBLIC,
  IS_SELF_ONLY,
  REQUIRED_PERMISSIONS,
} from '../tokens.js'
import { AUTH_MESSAGES } from './errors.js'
import type { ResolvedAuthConfig } from './options.js'
import { getAdminPrincipal } from './principal.js'

// 정본: hangang-home apps/api/src/core/guards/permission.guard.ts(fail-closed · @SelfOnly 명시 통과 · AND/OR)
// 바꾼 점:
//  - 🔴 권한 선언이 @SelfOnly 보다 먼저다(스펙 §14 R3). hangang 은 @SelfOnly 면 곧바로 통과시켜, 클래스 @SelfOnly +
//    메서드 @RequirePermissions 가 권한 검사 없이 열렸다.
//  - 강제 변경 계정은 허용 표시가 있는 라우트만(gise — 권한을 빈 배열로 보는 것만으로는 @SelfOnly 라우트가 열린다).
//  - 판정은 admin-shared hasPermission · hasAnyPermission('*' 정확 일치 — 화면과 같은 함수).
//  - failClosed: false 과도기 옵션(Phase 0 §4 #5). HTTP 가 아닌 컨텍스트는 통과(스펙 §14 R4).

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true
    const targets = [context.getHandler(), context.getClass()]
    const flag = (key: string): boolean =>
      this.reflector.getAllAndOverride<boolean | undefined>(key, targets) === true

    if (flag(IS_PUBLIC)) return true

    const principal = getAdminPrincipal(context.switchToHttp().getRequest<Request>())
    if (principal == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }

    if (principal.isPasswordChangeRequired && !flag(ALLOW_PASSWORD_CHANGE)) {
      throw new BusinessError(
        CommonErrorCodes.ERR_PASSWORD_CHANGE_REQUIRED,
        AUTH_MESSAGES.passwordChangeRequired,
      )
    }

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS,
      targets,
    )
    const anyOf = this.reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSIONS, targets)
    const hasRequired = required != null && required.length > 0
    const hasAnyOf = anyOf != null && anyOf.length > 0

    if (hasRequired || hasAnyOf) {
      if (hasRequired && !hasPermission(principal.permissions, ...required)) throw forbidden()
      if (hasAnyOf && !hasAnyPermission(principal.permissions, ...anyOf)) throw forbidden()
      return true
    }

    if (flag(IS_SELF_ONLY)) return true

    // 🔴 여기가 fail-closed 다. 선언이 없는 라우트는 잠그는 것을 잊은 라우트다 — hangang 은 상류 22곳에 데코레이터가
    //    0건이었다. 부재를 통과로 읽으면 그 라우트가 로그인한 누구에게나 열린다. '*' 도 막는다.
    if (!this.config.failClosed) return true
    throw new BusinessError(
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      AUTH_MESSAGES.noPermissionDeclared,
      { reason: 'no-permission-declared' },
    )
  }
}

function forbidden(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_FORBIDDEN, AUTH_MESSAGES.forbidden)
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/principal.test.ts src/auth/permission.guard.test.ts src/auth/access-token.service.test.ts`
Expected: PASS. (errors.ts 를 바꿨으므로 Task 4 테스트도 다시 돈다.)

- [ ] **Step 6: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/tokens.ts
pnpm check
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): 권한 가드 · 데코레이터 · 주체 · 2c/2f 자리

권한 선언을 @SelfOnly 보다 먼저 본다(스펙 §14 R3).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `AdminAuthService` — 로그인 · 매 요청 인증

**Files:**

- Create: `packages/admin-server/src/auth/password-check.ts`
- Create: `packages/admin-server/src/auth/auth.service.ts`
- Create: `packages/admin-server/src/auth/auth.service.login.db.test.ts`
- Modify: `packages/admin-server/src/test-support/auth.ts`(가짜 요청 · 이벤트 · 정책 · 서비스 조립을 끝에 더한다)

**Interfaces:**

- Consumes: Task 1~7 전부
- Produces:
  - `type PasswordCheck = { ok: true } | { ok: false; state: AdminLoginState }` · `checkPasswordWithCounter(repo: AdminAuthRepository, credential: AdminCredential, password: string, now: Date, lockout: LoginLockout): Promise<PasswordCheck>`
  - `interface AdminTokenPair { accessToken: string; refreshToken: string }`
  - `class AdminAuthService`, 생성자 `(config: ResolvedAuthConfig, repo: AdminAuthRepository, sessions: AdminSessionStore, tokens: AdminAccessTokenService, db: Kysely<AdminDatabase>, accessPolicy?: AdminAccessPolicy, events?: AdminAuthEventSink)`:
    - `login(input: { userId: string; password: string }, req: Request): Promise<AdminTokenPair>`
    - `authenticate(accessToken: string | undefined, req: Request): Promise<AdminPrincipal>`
    - (Task 9 · 10 이 `refresh` · `logout` · `changePassword` 를 더한다)
  - test-support: `TEST_JWT_SECRET` · `fakeRequest(input?)` · `class RecordingEvents`(`events` · `failWith` · `types()`) · `class SwitchablePolicy`(`allow` · `calls`) · `createAuthKit(t, options?): AuthKit`

- [ ] **Step 1: 테스트 도우미를 더한다**

`packages/admin-server/src/test-support/auth.ts` — import 를 더하고 끝에 덧붙인다:

```ts
import type { Request } from 'express'
import { AdminAccessTokenService } from '../auth/access-token.service.js'
import { AdminAuthService } from '../auth/auth.service.js'
import type {
  AdminAccessContext,
  AdminAccessPolicy,
  AdminAuthEvent,
  AdminAuthEventSink,
} from '../auth/hooks.js'
import { KyselyAuthRepository } from '../auth/kysely-auth.repository.js'
import {
  resolveAuthConfig,
  type AdminAuthOptions,
  type ResolvedAuthConfig,
} from '../auth/options.js'
import { AdminSessionStore } from '../auth/session.store.js'
```

```ts
export const TEST_JWT_SECRET = 'admin-kit-test-jwt-secret'.padEnd(32, '-')

/** 서비스 테스트용 요청 — ip · User-Agent · 쿠키만 */
export function fakeRequest(
  input: { ip?: string; userAgent?: string; cookies?: Record<string, unknown> } = {},
): Request {
  return {
    ip: input.ip ?? '10.0.0.1',
    headers: { 'user-agent': input.userAgent ?? 'TestAgent/1.0' },
    cookies: input.cookies ?? {},
    secure: false,
  } as unknown as Request
}

/** `ADMIN_AUTH_EVENTS` 가짜 — 받은 이벤트를 모은다. `failWith` 가 있으면 던진다 */
export class RecordingEvents implements AdminAuthEventSink {
  readonly events: AdminAuthEvent[] = []
  failWith: Error | null = null

  async record(event: AdminAuthEvent): Promise<void> {
    if (this.failWith != null) throw this.failWith
    this.events.push(event)
  }

  /** 'login.blocked' 는 'login.blocked:locked' 처럼 사유를 붙인다 */
  types(): string[] {
    return this.events.map((event) =>
      event.type === 'login.blocked' || event.type === 'access.blocked'
        ? `${event.type}:${event.reason}`
        : event.type,
    )
  }
}

/** `ADMIN_ACCESS_POLICY` 가짜 — `allow` 로 답하고 받은 문맥을 모은다 */
export class SwitchablePolicy implements AdminAccessPolicy {
  allow = true
  readonly calls: AdminAccessContext[] = []

  async allows(context: AdminAccessContext): Promise<boolean> {
    this.calls.push(context)
    return this.allow
  }
}

export interface AuthKit {
  config: ResolvedAuthConfig
  repo: KyselyAuthRepository
  store: AdminSessionStore
  tokens: AdminAccessTokenService
  service: AdminAuthService
  events: RecordingEvents
  policy: SwitchablePolicy
}

/** Nest 없이 서비스를 조립한다. `policy: false` 면 정책을 주입하지 않는다 */
export function createAuthKit(
  t: TestDatabase,
  options: { auth?: Partial<AdminAuthOptions>; policy?: boolean } = {},
): AuthKit {
  const config = resolveAuthConfig({ jwtSecret: TEST_JWT_SECRET, ...options.auth }, undefined)
  const repo = new KyselyAuthRepository(t.db)
  const store = new AdminSessionStore(t.db)
  const tokens = new AdminAccessTokenService(config)
  const events = new RecordingEvents()
  const policy = new SwitchablePolicy()
  const service = new AdminAuthService(
    config,
    repo,
    store,
    tokens,
    t.db,
    options.policy === false ? undefined : policy,
    events,
  )
  return { config, repo, store, tokens, service, events, policy }
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/auth.service.login.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  addToTeam,
  createAuthKit,
  fakeRequest,
  seedRole,
  seedTeam,
  seedUser,
  type AuthKit,
} from '../test-support/auth.js'
import { AUTH_MESSAGES } from './errors.js'
import { hashRefreshToken } from './refresh-token.js'

let t: TestDatabase
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db, { roleName: '관리자', permissions: ['user:read'] })
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(promise: Promise<unknown>): Promise<BusinessError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('거부되지 않았다')
}

async function counters(kit: AuthKit, userNo: bigint) {
  const credential = await kit.repo.findCredentialByNo(userNo)
  return { loginFailCount: credential!.loginFailCount, lockUntil: credential!.lockUntil }
}

const later = (ms: number) => new Date(Date.now() + ms)

describe('login', () => {
  it('성공 — 토큰 둘 · 세션 행(loginAt = lastAccessAt · expireAt = loginAt + 7일 · UA · IP) · login.success', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo })
    const tokens = await kit.service.login(
      { userId: user.userId, password: user.password },
      fakeRequest({ ip: '10.1.2.3', userAgent: 'Chrome/140' }),
    )
    const claims = kit.tokens.verify(tokens.accessToken, new Date())
    expect(claims.userNo).toBe(user.userNo)
    expect(await kit.store.findByRefreshHash(hashRefreshToken(tokens.refreshToken))).toMatchObject({
      sessionNo: claims.sessionNo,
      userNo: user.userNo,
      isRevoked: false,
    })
    const row = await t.db
      .selectFrom('sessions')
      .select(['userAgent', 'ipAddress', 'loginAt', 'lastAccessAt', 'expireAt'])
      .where('sessionNo', '=', claims.sessionNo)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ userAgent: 'Chrome/140', ipAddress: '10.1.2.3' })
    expect(row.lastAccessAt.getTime()).toBe(row.loginAt.getTime())
    expect(row.expireAt.getTime() - row.loginAt.getTime()).toBe(kit.config.refreshTtlMs)
    expect(kit.events.types()).toEqual(['login.success'])
    expect(kit.events.events[0]).toEqual({
      type: 'login.success',
      userNo: user.userNo,
      sessionNo: claims.sessionNo,
    })
  })

  it('🔴 없는 아이디 — 401 ERR_LOGIN_FAILED, 정책을 부르지 않는다, login.fail(userNo null)', async () => {
    const kit = createAuthKit(t)
    const error = await rejection(
      kit.service.login({ userId: 'ghost', password: 'x' }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailed)
    expect(kit.policy.calls).toHaveLength(0)
    expect(kit.events.events).toEqual([
      { type: 'login.fail', userId: 'ghost', userNo: null, loginFailCount: null },
    ])
  })

  it('틀린 비밀번호 — 카운터 +1 · 401 · login.fail(갱신 뒤 카운트)', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo })
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 1, lockUntil: null })
    expect(kit.events.events).toEqual([
      { type: 'login.fail', userId: user.userId, userNo: user.userNo, loginFailCount: 1 },
    ])
  })

  it('🔴 5회째 잠기고, 맞은 비밀번호도 정책 다음에 423 — 카운터는 그대로', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo })
    for (let i = 0; i < 5; i += 1) {
      await rejection(kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()))
    }
    const locked = await counters(kit, user.userNo)
    expect(locked.loginFailCount).toBe(5)
    expect(locked.lockUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000)

    const error = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_ACCOUNT_LOCKED)
    expect(error.message).toBe(AUTH_MESSAGES.locked)
    expect(kit.policy.calls).toHaveLength(1)
    expect(await counters(kit, user.userNo)).toEqual(locked)
    expect(kit.events.types().at(-1)).toBe('login.blocked:locked')
  })

  it('🔴 잠긴 동안의 틀린 비밀번호는 401 이고 잠금을 늘리지 않는다', async () => {
    const kit = createAuthKit(t)
    const lockUntil = new Date(Math.floor(later(60_000).getTime() / 1000) * 1000)
    const user = await seedUser(t.db, { roleNo, loginFailCount: 5, lockUntil })
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(await counters(kit, user.userNo)).toEqual({ loginFailCount: 6, lockUntil })
  })

  it('잠금이 끝났으면 — 틀리면 1부터, 맞으면 성공하고 카운터 0', async () => {
    const kit = createAuthKit(t)
    const a = await seedUser(t.db, { roleNo, loginFailCount: 5, lockUntil: later(-2000) })
    await rejection(kit.service.login({ userId: a.userId, password: 'wrong' }, fakeRequest()))
    expect(await counters(kit, a.userNo)).toEqual({ loginFailCount: 1, lockUntil: null })

    const b = await seedUser(t.db, { roleNo, loginFailCount: 5, lockUntil: later(-2000) })
    await kit.service.login({ userId: b.userId, password: b.password }, fakeRequest())
    expect(await counters(kit, b.userNo)).toEqual({ loginFailCount: 0, lockUntil: null })
  })

  it('🔴 퇴사 계정 — 틀린 비밀번호는 401(존재를 흘리지 않는다), 맞으면 403 이고 정책을 부르지 않는다', async () => {
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
    expect(kit.policy.calls).toHaveLength(0)
    expect(kit.events.types()).toEqual(['login.fail', 'login.blocked:resigned'])
  })

  it('퇴사 효력 시각이 미래면 로그인된다(스펙 ④ R1)', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo, resignAt: later(24 * 3600 * 1000) })
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })

  it('정책이 거부하면 403 ERR_IP_NOT_ALLOWED + details.clientIp, 세션을 만들지 않는다 — 대표 팀을 넘긴다', async () => {
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
    expect(error.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
    expect(error.details).toEqual({ clientIp: '203.0.113.9' })
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

  it('정책이 없으면 IP 판정을 건너뛴다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const user = await seedUser(t.db, { roleNo })
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('refreshToken')
  })

  it('강제 변경 계정도 로그인된다', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo, isPasswordChangeRequired: true })
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })

  it('🔴 이벤트 기록기가 던져도 로그인은 성공한다(스펙 B8)', async () => {
    const kit = createAuthKit(t)
    kit.events.failWith = new Error('감사 DB 다운')
    const user = await seedUser(t.db, { roleNo })
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })

  it('🔴 비밀번호의 앞뒤 공백 · 한글은 다듬지 않고 그대로 비교한다 — Review Focus 2', async () => {
    const kit = createAuthKit(t)
    const user = await seedUser(t.db, { roleNo, password: ' 한글 비번 ' })
    await expect(
      kit.service.login({ userId: user.userId, password: ' 한글 비번 ' }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: '한글 비번' }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
  })
})

describe('authenticate', () => {
  async function loggedIn(kit: AuthKit, input: Parameters<typeof seedUser>[1] = { roleNo }) {
    const user = await seedUser(t.db, input)
    const tokens = await kit.service.login(
      { userId: user.userId, password: user.password },
      fakeRequest(),
    )
    const claims = kit.tokens.verify(tokens.accessToken, new Date())
    return { user, tokens, sessionNo: claims.sessionNo }
  }

  it('주체 — 역할 권한 · 세션 번호', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await loggedIn(kit)
    expect(await kit.service.authenticate(tokens.accessToken, fakeRequest())).toEqual({
      userNo: user.userNo,
      sessionNo,
      userId: user.userId,
      userName: expect.any(String),
      roleNo,
      roleName: '관리자',
      teamNo: null,
      teamName: null,
      permissions: ['user:read'],
      isPasswordChangeRequired: false,
    })
  })

  it('🔴 강제 변경 계정은 권한이 [](gise)', async () => {
    const kit = createAuthKit(t)
    const { tokens } = await loggedIn(kit, { roleNo, isPasswordChangeRequired: true })
    expect(await kit.service.authenticate(tokens.accessToken, fakeRequest())).toMatchObject({
      permissions: [],
      isPasswordChangeRequired: true,
    })
  })

  it('토큰이 없으면 401 ERR_COMMON_UNAUTHORIZED', async () => {
    const kit = createAuthKit(t)
    const error = await rejection(kit.service.authenticate(undefined, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED)
  })

  it('폐기된 세션 · 다른 사용자의 토큰 — 401 ERR_INVALID_TOKEN', async () => {
    const kit = createAuthKit(t)
    const a = await loggedIn(kit)
    await kit.store.revoke(a.sessionNo, 'terminated', new Date())
    const revoked = await rejection(kit.service.authenticate(a.tokens.accessToken, fakeRequest()))
    expect(revoked.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(revoked.message).toBe(AUTH_MESSAGES.sessionInvalid)

    const b = await loggedIn(kit)
    const forged = kit.tokens.sign({ userNo: a.user.userNo, sessionNo: b.sessionNo })
    const mismatch = await rejection(kit.service.authenticate(forged, fakeRequest()))
    expect(mismatch.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
  })

  it('세션 만료 — 401 ERR_SESSION_EXPIRED', async () => {
    const kit = createAuthKit(t)
    const { tokens, sessionNo } = await loggedIn(kit)
    await t.db
      .updateTable('sessions')
      .set({ expireAt: later(-2000) })
      .where('sessionNo', '=', sessionNo)
      .execute()
    const error = await rejection(kit.service.authenticate(tokens.accessToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_SESSION_EXPIRED)
    expect(error.message).toBe(AUTH_MESSAGES.sessionExpired)
  })

  it('로그인 뒤 퇴사 효력이 지나면 403 ERR_RESIGNED_USER', async () => {
    const kit = createAuthKit(t)
    const { user, tokens } = await loggedIn(kit)
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(kit.service.authenticate(tokens.accessToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
  })

  it('정책이 거부하면 403 ERR_IP_NOT_ALLOWED + access.blocked:ip', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await loggedIn(kit)
    kit.policy.allow = false
    const error = await rejection(
      kit.service.authenticate(tokens.accessToken, fakeRequest({ ip: '198.51.100.7' })),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_IP_NOT_ALLOWED)
    expect(error.details).toEqual({ clientIp: '198.51.100.7' })
    expect(kit.events.events.at(-1)).toEqual({
      type: 'access.blocked',
      reason: 'ip',
      userNo: user.userNo,
      sessionNo,
    })
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/auth.service.login.db.test.ts`
Expected: FAIL — `../auth/auth.service.js`(test-support 가 import)를 찾지 못한다.

- [ ] **Step 4: 구현한다**

`packages/admin-server/src/auth/password-check.ts`:

```ts
import type { AdminAuthRepository, AdminCredential } from './auth.repository.js'
import { nextLoginState, type AdminLoginState, type LoginLockout } from './login-policy.js'
import { verifyPassword } from './password.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.service.ts login(틀리면 카운터) · admin-password.service.ts
//       (비밀번호 변경도 셈)
// 바꾼 점: 로그인 · 비밀번호 변경 · 재인증 세 자리가 이 함수 하나로 같은 카운터를 쓴다(스펙 B2 — gise 는 재인증을 세지
//   않았다). 세션을 쥔 사람이 재인증 붙은 쓰기를 비밀번호 대입 경로로 쓰지 못하게 한다.

export type PasswordCheck = { ok: true } | { ok: false; state: AdminLoginState }

/**
 * 🔴 트랜잭션 밖에서 부른다(argon2 — 스펙 Global Constraints). 틀리면 실패 상태를 저장하고 그 상태를 돌려준다.
 * 맞았을 때 카운터를 되돌리는 것은 호출부 몫이다(로그인 · 재인증은 needsReset, 변경은 changePassword 가 함께 쓴다).
 */
export async function checkPasswordWithCounter(
  repo: AdminAuthRepository,
  credential: AdminCredential,
  password: string,
  now: Date,
  lockout: LoginLockout,
): Promise<PasswordCheck> {
  if (await verifyPassword(credential.passwordHash, password)) return { ok: true }
  const state = nextLoginState(credential, 'fail', now, lockout)
  await repo.saveLoginState(credential.userNo, state)
  return { ok: false, state }
}
```

`packages/admin-server/src/auth/auth.service.ts`:

```ts
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import {
  ADMIN_ACCESS_POLICY,
  ADMIN_AUTH_CONFIG,
  ADMIN_AUTH_EVENTS,
  AUTH_REPOSITORY,
  KYSELY,
} from '../tokens.js'
import { AdminAccessTokenService } from './access-token.service.js'
import { isResigned, isSessionExpired } from './account-policy.js'
import type { AdminAuthRepository } from './auth.repository.js'
import { AUTH_MESSAGES } from './errors.js'
import type { AdminAccessPolicy, AdminAuthEvent, AdminAuthEventSink } from './hooks.js'
import { isLocked, needsReset, nextLoginState } from './login-policy.js'
import type { ResolvedAuthConfig } from './options.js'
import { checkPasswordWithCounter } from './password-check.js'
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password.js'
import type { AdminPrincipal } from './principal.js'
import { createRefreshToken, hashRefreshToken } from './refresh-token.js'
import { requestMetaOf } from './request-meta.js'
import { AdminSessionStore, type NewSessionInput } from './session.store.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.service.ts(로그인 · 회전 · 유예 · 재사용 · 로그아웃 멱등) +
//       hangang-home modules/auth/auth.service.ts(로그인 순서: 비밀번호 → 퇴사 → IP → 잠금) · core/guards/auth.guard.ts
//       (매 요청: 세션 → 사용자 → 퇴사 → IP) + ssworks-axion-admin checkSession(sessionNo, userNo) 소유 대조
// 바꾼 점:
//  - 사용자 쪽은 AUTH_REPOSITORY, 세션은 AdminSessionStore(스펙 ⑤ A1). Kysely 를 직접 쓰는 곳은 비밀번호 변경
//    트랜잭션 하나(Task 10).
//  - 감사 직접 호출 대신 ADMIN_AUTH_EVENTS, IP 평가 대신 ADMIN_ACCESS_POLICY — 둘 다 선택(스펙 ⑧ H1).
//  - 퇴사는 resignAt ≤ now(스펙 ④ R1 — hangang 사이트 시간대 · gise isActive 대신).
//  - 로그인 실패는 401 ERR_LOGIN_FAILED(hangang 은 404 ERR_NO_USER).

export interface AdminTokenPair {
  accessToken: string
  refreshToken: string
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger('AdminAuthService')

  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
    @Inject(AUTH_REPOSITORY) private readonly repo: AdminAuthRepository,
    private readonly sessions: AdminSessionStore,
    private readonly tokens: AdminAccessTokenService,
    /** 비밀번호 변경 트랜잭션(Task 10) */
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Optional() @Inject(ADMIN_ACCESS_POLICY) private readonly accessPolicy?: AdminAccessPolicy,
    @Optional() @Inject(ADMIN_AUTH_EVENTS) private readonly events?: AdminAuthEventSink,
  ) {}

  /**
   * 🔴 비밀번호 검증이 먼저다 — 존재 · 잠김 · 퇴사는 비밀번호를 아는 사람에게만 드러난다(gise · hangang 코드 리뷰 I1).
   * 실패 카운터는 비밀번호가 틀렸을 때만 오른다(hangang I2).
   */
  async login(input: { userId: string; password: string }, req: Request): Promise<AdminTokenPair> {
    const now = new Date()
    const credential = await this.repo.findCredentialByUserId(input.userId)

    if (credential == null) {
      // 🔴 없는 계정에도 argon2 를 한 번 태운다 — 응답 시간으로 계정이 열거되지 않게(gise). 결과는 버린다.
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password)
      await this.emit(
        { type: 'login.fail', userId: input.userId, userNo: null, loginFailCount: null },
        req,
      )
      throw loginFailed()
    }

    const check = await checkPasswordWithCounter(
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
      throw loginFailed()
    }

    // 여기부터는 비밀번호가 맞았다 — 존재를 숨길 이유가 없다.
    if (isResigned(credential.resignAt, now)) {
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

    if (this.accessPolicy != null) {
      const principal = await this.repo.findPrincipal(credential.userNo)
      const { clientIp } = requestMetaOf(req)
      const allowed = await this.accessPolicy.allows({
        clientIp,
        userNo: credential.userNo,
        teamNos: principal?.teamNo == null ? [] : [principal.teamNo],
      })
      if (!allowed) {
        await this.emit(
          { type: 'login.blocked', reason: 'ip', userId: input.userId, userNo: credential.userNo },
          req,
        )
        throw ipNotAllowed(clientIp)
      }
    }

    // 🔴 맞은 비밀번호도 잠긴 동안에는 막는다 — 잠금 중에 맞힌 대입이 통과하면 잠금이 무의미하다. 카운터는 건드리지 않는다.
    if (isLocked(credential.lockUntil, now)) {
      await this.emit(
        {
          type: 'login.blocked',
          reason: 'locked',
          userId: input.userId,
          userNo: credential.userNo,
        },
        req,
      )
      throw new BusinessError(CommonErrorCodes.ERR_ACCOUNT_LOCKED, AUTH_MESSAGES.locked)
    }

    if (needsReset(credential)) {
      await this.repo.saveLoginState(
        credential.userNo,
        nextLoginState(credential, 'success', now, this.config.lockout),
      )
    }

    const issued = this.newSession(credential.userNo, req, now)
    const sessionNo = await this.sessions.create({ ...issued.input, loginAt: now })
    await this.emit({ type: 'login.success', userNo: credential.userNo, sessionNo }, req)
    return {
      accessToken: this.tokens.sign({ userNo: credential.userNo, sessionNo }),
      refreshToken: issued.refreshToken,
    }
  }

  /**
   * 매 요청 — AdminAuthGuard 가 부른다. DB 왕복 둘(세션 · 주체). 🔴 권한은 토큰에 싣지 않고 매 요청 읽는다 — 역할을
   * 바꾸면 다음 요청부터 반영된다(gise). lastAccessAt 은 쓰지 않는다(15분마다 회전이 새 행을 만든다).
   */
  async authenticate(accessToken: string | undefined, req: Request): Promise<AdminPrincipal> {
    if (accessToken == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }
    const now = new Date()
    const claims = this.tokens.verify(accessToken, now)

    const session = await this.sessions.findByNo(claims.sessionNo)
    // 🔴 세션 행의 userNo 를 토큰과 대조한다(axion) — 서명 키가 새면 남의 세션 번호를 붙여 오는 것을 막는다.
    if (session == null || session.isRevoked || session.userNo !== claims.userNo) {
      throw sessionInvalid()
    }
    if (isSessionExpired(session.expireAt, now)) {
      throw new BusinessError(CommonErrorCodes.ERR_SESSION_EXPIRED, AUTH_MESSAGES.sessionExpired)
    }

    const record = await this.repo.findPrincipal(claims.userNo)
    if (record == null) throw sessionInvalid()
    if (isResigned(record.resignAt, now)) {
      throw new BusinessError(CommonErrorCodes.ERR_RESIGNED_USER, AUTH_MESSAGES.resigned)
    }

    if (this.accessPolicy != null) {
      const { clientIp } = requestMetaOf(req)
      const allowed = await this.accessPolicy.allows({
        clientIp,
        userNo: record.userNo,
        teamNos: record.teamNo == null ? [] : [record.teamNo],
      })
      if (!allowed) {
        // 🔴 거부를 던지기 전에 남긴다 — 감사 인터셉터는 가드 뒤라 이 요청을 보지 못한다(hangang I4).
        await this.emit(
          {
            type: 'access.blocked',
            reason: 'ip',
            userNo: record.userNo,
            sessionNo: session.sessionNo,
          },
          req,
        )
        throw ipNotAllowed(clientIp)
      }
    }

    return {
      userNo: record.userNo,
      sessionNo: session.sessionNo,
      userId: record.userId,
      userName: record.userName,
      roleNo: record.roleNo,
      roleName: record.roleName,
      teamNo: record.teamNo,
      teamName: record.teamName,
      // 🔴 강제 변경 계정은 권한을 비운다(gise) — 가드의 허용 표시와 함께 이중으로 막는다.
      permissions: record.isPasswordChangeRequired ? [] : record.permissions,
      isPasswordChangeRequired: record.isPasswordChangeRequired,
    }
  }

  /** 새 refresh 토큰과 세션 입력(loginAt 제외). 원문은 응답 쿠키로만 나가고 DB 에는 해시만 들어간다. */
  private newSession(
    userNo: bigint,
    req: Request,
    now: Date,
  ): { refreshToken: string; input: Omit<NewSessionInput, 'loginAt'> } {
    const meta = requestMetaOf(req)
    const refreshToken = createRefreshToken()
    return {
      refreshToken,
      input: {
        userNo,
        refreshTokenHash: hashRefreshToken(refreshToken),
        userAgent: meta.userAgent,
        ipAddress: meta.clientIp,
        now,
        expireAt: new Date(now.getTime() + this.config.refreshTtlMs),
      },
    }
  }

  /** 🔴 기록기가 던져도 인증은 계속된다(스펙 B8). 메시지에 이벤트 내용을 싣지 않는다. */
  private async emit(event: AdminAuthEvent, req: Request): Promise<void> {
    if (this.events == null) return
    try {
      await this.events.record(event, req)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`인증 이벤트 ${event.type} 를 기록하지 못했다: ${reason}`)
    }
  }
}

function loginFailed(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_LOGIN_FAILED, AUTH_MESSAGES.loginFailed)
}

function sessionInvalid(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.sessionInvalid)
}

function ipNotAllowed(clientIp: string | null): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_IP_NOT_ALLOWED, AUTH_MESSAGES.ipNotAllowed, {
    clientIp,
  })
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/auth.service.login.db.test.ts`
Expected: PASS(19 tests). `db` 생성자 인자는 Task 10 이 쓴다 — 그때까지 쓰이지 않는 것이 정상이다.

- [ ] **Step 6: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/test-support/auth.ts
pnpm check
pnpm test:db
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): 인증 서비스 — 로그인 판정 순서 · 매 요청 인증 · 카운터 공용

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `AdminAuthService` — 회전 · 유예 · 재사용 탐지 · 로그아웃

**Files:**

- Modify: `packages/admin-server/src/auth/auth.service.ts`(메서드 넷)
- Create: `packages/admin-server/src/auth/auth.service.refresh.db.test.ts`

**Interfaces:**

- Consumes: `judgeRotatedReuse`(Task 2), `AdminSessionStore.rotate` · `revoke` · `revokeAllOfUser` · `AdminSessionRow`(Task 6), `holdRotation`(Task 6)
- Produces:
  - `AdminAuthService.refresh(refreshToken: string | undefined, req: Request): Promise<AdminTokenPair>`
  - `AdminAuthService.logout(refreshToken: string | undefined, req: Request): Promise<void>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/auth.service.refresh.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  createAuthKit,
  fakeRequest,
  holdRotation,
  seedRole,
  seedUser,
  type AuthKit,
} from '../test-support/auth.js'
import { AUTH_MESSAGES } from './errors.js'
import { hashRefreshToken } from './refresh-token.js'

let t: TestDatabase
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db)
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(promise: Promise<unknown>): Promise<BusinessError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('거부되지 않았다')
}

const later = (ms: number) => new Date(Date.now() + ms)

async function login(kit: AuthKit, input: Parameters<typeof seedUser>[1] = { roleNo }) {
  const user = await seedUser(t.db, input)
  const tokens = await kit.service.login(
    { userId: user.userId, password: user.password },
    fakeRequest(),
  )
  const sessionNo = kit.tokens.verify(tokens.accessToken, new Date()).sessionNo
  return { user, tokens, sessionNo }
}

async function sessionOf(kit: AuthKit, refreshToken: string) {
  return kit.store.findByRefreshHash(hashRefreshToken(refreshToken))
}

async function liveSessions(userNo: bigint): Promise<bigint[]> {
  const rows = await t.db
    .selectFrom('sessions')
    .select('sessionNo')
    .where('userNo', '=', userNo)
    .where('isRevoked', '=', false)
    .execute()
  return rows.map((row) => row.sessionNo)
}

describe('refresh — 회전', () => {
  it('새 토큰 둘 · 옛 행 rotated + 링크 · 새 행이 옛 loginAt 을 옮겨 담는다 · token.refresh', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    const loginAt = new Date('2026-03-04T05:06:07.000Z')
    await t.db.updateTable('sessions').set({ loginAt }).where('sessionNo', '=', sessionNo).execute()

    const next = await kit.service.refresh(tokens.refreshToken, fakeRequest())
    expect(next.refreshToken).not.toBe(tokens.refreshToken)
    const fresh = await sessionOf(kit, next.refreshToken)
    expect(fresh).toMatchObject({ userNo: user.userNo, loginAt, isRevoked: false })
    expect(await kit.store.findByNo(sessionNo)).toMatchObject({
      revokedReason: 'rotated',
      replacedBySessionNo: fresh!.sessionNo,
    })
    expect(kit.tokens.verify(next.accessToken, new Date()).sessionNo).toBe(fresh!.sessionNo)
    expect(kit.events.events.at(-1)).toEqual({
      type: 'token.refresh',
      userNo: user.userNo,
      sessionNo: fresh!.sessionNo,
      rotatedFrom: sessionNo,
      grace: false,
    })
  })

  it.each([
    [
      '쿠키 없음',
      undefined,
      CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
      AUTH_MESSAGES.refreshMissing,
    ],
    [
      '모르는 토큰',
      'f'.repeat(128),
      CommonErrorCodes.ERR_INVALID_TOKEN,
      AUTH_MESSAGES.refreshInvalid,
    ],
  ])('%s → 거부', async (_label, token, code, message) => {
    const kit = createAuthKit(t)
    const error = await rejection(kit.service.refresh(token, fakeRequest()))
    expect(error.code).toBe(code)
    expect(error.message).toBe(message)
  })

  it("🔴 'terminated' · 'reuse_detected' 재제시는 401 ERR_INVALID_TOKEN 만 — 다른 세션은 그대로", async () => {
    const kit = createAuthKit(t)
    const first = await login(kit)
    const second = await kit.service.login(
      { userId: first.user.userId, password: first.user.password },
      fakeRequest(),
    )
    await kit.store.revoke(first.sessionNo, 'terminated', new Date())
    const ended = await rejection(kit.service.refresh(first.tokens.refreshToken, fakeRequest()))
    expect(ended.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(ended.message).toBe(AUTH_MESSAGES.refreshEnded)
    expect((await sessionOf(kit, second.refreshToken))?.isRevoked).toBe(false)

    const secondNo = (await sessionOf(kit, second.refreshToken))!.sessionNo
    await kit.store.revoke(secondNo, 'reuse_detected', new Date())
    const detected = await rejection(kit.service.refresh(second.refreshToken, fakeRequest()))
    expect(detected.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
  })

  it('만료된 세션 — 401 ERR_SESSION_EXPIRED', async () => {
    const kit = createAuthKit(t)
    const { tokens, sessionNo } = await login(kit)
    await t.db
      .updateTable('sessions')
      .set({ expireAt: later(-2000) })
      .where('sessionNo', '=', sessionNo)
      .execute()
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_SESSION_EXPIRED)
    expect(error.message).toBe(AUTH_MESSAGES.refreshExpired)
  })

  it('🔴 퇴사 효력이 지났으면 회전 전에 403 — 행은 살아 있는 그대로', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
    expect((await kit.store.findByNo(sessionNo))?.isRevoked).toBe(false)
  })

  it('🔴 강제 변경 · 잠긴 계정의 세션은 회전한다 — 잠금은 비밀번호 대입 방어다', async () => {
    const kit = createAuthKit(t)
    const changing = await login(kit, { roleNo, isPasswordChangeRequired: true })
    await expect(
      kit.service.refresh(changing.tokens.refreshToken, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
    const locked = await login(kit)
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 5, lockUntil: later(10 * 60 * 1000) })
      .where('userNo', '=', locked.user.userNo)
      .execute()
    await expect(
      kit.service.refresh(locked.tokens.refreshToken, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })
})

describe('refresh — 회전된 토큰의 재제시(P2)', () => {
  it('유예창 안 + 후계가 살아 있으면 새 세션을 하나 더 — 후계 · 링크는 그대로, grace true', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    const winner = await kit.service.refresh(tokens.refreshToken, fakeRequest())
    const winnerNo = (await sessionOf(kit, winner.refreshToken))!.sessionNo

    const loser = await kit.service.refresh(tokens.refreshToken, fakeRequest())
    const loserRow = await sessionOf(kit, loser.refreshToken)
    expect(loserRow).toMatchObject({ isRevoked: false, userNo: user.userNo })
    expect(loserRow!.sessionNo).not.toBe(winnerNo)
    expect((await kit.store.findByNo(winnerNo))?.isRevoked).toBe(false)
    expect((await kit.store.findByNo(sessionNo))?.replacedBySessionNo).toBe(winnerNo)
    expect(kit.events.events.at(-1)).toMatchObject({
      type: 'token.refresh',
      grace: true,
      rotatedFrom: sessionNo,
    })
  })

  it('🔴 유예창 밖이면 그 사용자의 살아 있는 세션 전부 reuse_detected + 401 ERR_REFRESH_REUSED — 남의 세션은 그대로', async () => {
    const kit = createAuthKit(t)
    const deviceA = await login(kit)
    const deviceB = await kit.service.login(
      { userId: deviceA.user.userId, password: deviceA.user.password },
      fakeRequest(),
    )
    const stranger = await login(kit)
    await kit.service.refresh(deviceA.tokens.refreshToken, fakeRequest())
    await t.db
      .updateTable('sessions')
      .set({ revokedAt: later(-60_000) })
      .where('sessionNo', '=', deviceA.sessionNo)
      .execute()

    const error = await rejection(kit.service.refresh(deviceA.tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_REFRESH_REUSED)
    expect(error.message).toBe(AUTH_MESSAGES.refreshReused)
    expect(await liveSessions(deviceA.user.userNo)).toEqual([])
    expect((await sessionOf(kit, deviceB.refreshToken))?.revokedReason).toBe('reuse_detected')
    expect((await kit.store.findByNo(deviceA.sessionNo))?.revokedReason).toBe('rotated')
    expect(await liveSessions(stranger.user.userNo)).toEqual([stranger.sessionNo])
    expect(kit.events.events.at(-1)).toEqual({
      type: 'token.reuse',
      userNo: deviceA.user.userNo,
      sessionNo: deviceA.sessionNo,
      revokedCount: 2,
    })
  })

  it('🔴 후계가 로그아웃으로 죽었으면 창 안이어도 재사용이다', async () => {
    const kit = createAuthKit(t)
    const { tokens } = await login(kit)
    const winner = await kit.service.refresh(tokens.refreshToken, fakeRequest())
    await kit.service.logout(winner.refreshToken, fakeRequest())
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_REFRESH_REUSED)
  })

  it('유예창 0 이면 곧바로 재사용이다', async () => {
    const kit = createAuthKit(t, { auth: { refreshGraceMs: 0 } })
    const { tokens } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_REFRESH_REUSED)
  })

  it('🔴 유예 경로에서도 퇴사를 막는다', async () => {
    const kit = createAuthKit(t)
    const { user, tokens } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(kit.service.refresh(tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
  })
})

describe('refresh — 동시 회전 경합(P1, 결정적 재현)', () => {
  async function raced(kit: AuthKit) {
    const { user, tokens, sessionNo } = await login(kit)
    const successor = await kit.store.create({
      userNo: user.userNo,
      refreshTokenHash: hashRefreshToken(`successor-${sessionNo}`),
      userAgent: null,
      ipAddress: null,
      loginAt: new Date(),
      now: new Date(),
      expireAt: later(3600 * 1000),
    })
    const rotate = vi.spyOn(kit.store, 'rotate')
    const hold = await holdRotation(t, sessionNo, successor)
    const pending = kit.service.refresh(tokens.refreshToken, fakeRequest()).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    await new Promise((resolve) => setTimeout(resolve, 300))
    await hold.release()
    const outcome = await pending
    // 🔴 P1 을 지났는지 — 회전 시도가 한 번 있었고 그 결과가 0행(null)이다. P2 였다면 rotate 를 부르지 않는다.
    expect(rotate).toHaveBeenCalledTimes(1)
    expect(await rotate.mock.results[0]!.value).toBeNull()
    return { outcome, user, sessionNo, successor }
  }

  it('유예창 안이면 다시 읽어 grace — 200, 링크는 먼저 이긴 후계 그대로', async () => {
    const kit = createAuthKit(t)
    const { outcome, sessionNo, successor } = await raced(kit)
    expect(outcome).toHaveProperty('value.accessToken')
    expect((await kit.store.findByNo(sessionNo))?.replacedBySessionNo).toBe(successor)
  })

  it('🔴 유예창 0 이면 401 ERR_INVALID_TOKEN 만 — 전량 폐기하지 않는다(hangang)', async () => {
    const kit = createAuthKit(t, { auth: { refreshGraceMs: 0 } })
    const { outcome, user, successor } = await raced(kit)
    expect(outcome).toHaveProperty('error')
    const error = (outcome as { error: BusinessError }).error
    expect(error.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(error.message).toBe(AUTH_MESSAGES.refreshRaced)
    expect(await liveSessions(user.userNo)).toEqual([successor])
  })
})

describe('logout', () => {
  it("살아 있는 세션을 'terminated' 로 · logout 이벤트 — 두 번째는 아무것도 안 한다", async () => {
    const kit = createAuthKit(t)
    const { user, tokens, sessionNo } = await login(kit)
    await kit.service.logout(tokens.refreshToken, fakeRequest())
    expect(await kit.store.findByNo(sessionNo)).toMatchObject({ revokedReason: 'terminated' })
    expect(kit.events.events.at(-1)).toEqual({ type: 'logout', userNo: user.userNo, sessionNo })
    const before = kit.events.events.length
    await kit.service.logout(tokens.refreshToken, fakeRequest())
    expect(kit.events.events).toHaveLength(before)
  })

  it('쿠키 없음 · 모르는 토큰은 아무 일도 없다', async () => {
    const kit = createAuthKit(t)
    await expect(kit.service.logout(undefined, fakeRequest())).resolves.toBeUndefined()
    await expect(kit.service.logout('f'.repeat(128), fakeRequest())).resolves.toBeUndefined()
  })

  it("🔴 회전된 토큰으로 로그아웃해도 'rotated' 사유를 덮지 않는다(gise)", async () => {
    const kit = createAuthKit(t)
    const { tokens, sessionNo } = await login(kit)
    await kit.service.refresh(tokens.refreshToken, fakeRequest())
    await kit.service.logout(tokens.refreshToken, fakeRequest())
    expect((await kit.store.findByNo(sessionNo))?.revokedReason).toBe('rotated')
  })

  it('🔴 로그아웃한 탭의 옛 refresh 는 재사용 탐지가 아니다 — 다른 세션이 살아남는다', async () => {
    const kit = createAuthKit(t)
    const first = await login(kit)
    const other = await kit.service.login(
      { userId: first.user.userId, password: first.user.password },
      fakeRequest(),
    )
    await kit.service.logout(first.tokens.refreshToken, fakeRequest())
    const error = await rejection(kit.service.refresh(first.tokens.refreshToken, fakeRequest()))
    expect(error.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect((await sessionOf(kit, other.refreshToken))?.isRevoked).toBe(false)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/auth.service.refresh.db.test.ts`
Expected: FAIL — `kit.service.refresh is not a function`.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/auth/auth.service.ts` — import 두 줄을 고친다:

```ts
import { judgeRotatedReuse } from './refresh-policy.js'
import { AdminSessionStore, type AdminSessionRow, type NewSessionInput } from './session.store.js'
```

`authenticate` 와 `newSession` 사이에 메서드 넷을 더한다:

```ts
  /**
   * 회전(스펙 §5-3). 🔴 'rotated' 만 재사용 판정 대상이다 — 'terminated'(로그아웃 · 강제 종료)를 재사용으로 보면 세션
   * 하나를 끊었을 뿐인데 전 기기가 로그아웃된다(hangang 011).
   */
  async refresh(refreshToken: string | undefined, req: Request): Promise<AdminTokenPair> {
    if (refreshToken == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.refreshMissing)
    }
    const now = new Date()
    const row = await this.sessions.findByRefreshHash(hashRefreshToken(refreshToken))
    if (row == null) {
      throw new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshInvalid)
    }

    if (row.isRevoked) {
      // P2 — 다른 탭의 회전이 이 읽기보다 먼저 커밋됐다.
      if (row.revokedReason === 'rotated') return this.reuseOfRotated(row, req, now)
      throw new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshEnded)
    }

    if (isSessionExpired(row.expireAt, now)) {
      // 🔴 EXPIRED_TOKEN 이 아니다 — 그것은 "액세스 토큰이 만료됐으니 갱신하라" 는 신호다. 갱신 안에서 그 코드를 쓰면
      //    반드시 실패할 왕복을 하나 더 태운다(gise).
      throw new BusinessError(CommonErrorCodes.ERR_SESSION_EXPIRED, AUTH_MESSAGES.refreshExpired)
    }
    // 🔴 퇴사는 회전 전에 막는다 — 새 토큰을 내주지 않는다. 강제 변경 · 잠김은 회전한다.
    await this.assertActive(row.userNo, now)

    const issued = this.newSession(row.userNo, req, now)
    const sessionNo = await this.sessions.rotate(
      { sessionNo: row.sessionNo, loginAt: row.loginAt },
      issued.input,
    )
    if (sessionNo == null) {
      // P1 — 두 요청이 위의 읽기를 둘 다 통과한 뒤 조건부 UPDATE 에서 갈렸다. 정본이 놓친 경로이고 실제로는 이쪽이
      // 더 잦다(gise). 🔴 유예가 꺼져 있으면 전량 폐기하지 않는다 — 흔한 탭 경쟁 한 번에 전 기기가 로그아웃된다(hangang).
      if (this.config.refreshGraceMs === 0) {
        throw new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshRaced)
      }
      // 🔴 트랜잭션 밖에서 다시 읽는다 — 위의 row 는 회전 전 스냅숏이라 revokedAt · replacedBySessionNo 가 비어 있다.
      const rotated = await this.sessions.findByNo(row.sessionNo)
      if (rotated == null || rotated.revokedReason !== 'rotated') {
        throw new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshRaced)
      }
      return this.reuseOfRotated(rotated, req, now)
    }

    await this.emit(
      { type: 'token.refresh', userNo: row.userNo, sessionNo, rotatedFrom: row.sessionNo, grace: false },
      req,
    )
    return {
      accessToken: this.tokens.sign({ userNo: row.userNo, sessionNo }),
      refreshToken: issued.refreshToken,
    }
  }

  /**
   * 🔴 액세스 토큰이 만료된 상태에서도 성공해야 쿠키가 지워진다 — @Public 이라 주체가 없고, refresh 쿠키가 세션을
   * 지목한다(gise C1). 이미 폐기된 행 · 모르는 토큰은 아무 일도 하지 않는다(멱등).
   */
  async logout(refreshToken: string | undefined, req: Request): Promise<void> {
    if (refreshToken == null) return
    const row = await this.sessions.findByRefreshHash(hashRefreshToken(refreshToken))
    // 🔴 이미 폐기된 행은 건드리지 않는다 — 'rotated' 를 'terminated' 로 덮으면 재사용 탐지가 꺼진다(gise).
    if (row == null || row.isRevoked) return
    if ((await this.sessions.revoke(row.sessionNo, 'terminated', new Date())) > 0) {
      await this.emit({ type: 'logout', userNo: row.userNo, sessionNo: row.sessionNo }, req)
    }
  }

  /** P1 · P2 가 같은 답을 내도록 판정을 한 곳에 둔다(gise). */
  private async reuseOfRotated(
    row: AdminSessionRow,
    req: Request,
    now: Date,
  ): Promise<AdminTokenPair> {
    const successor =
      row.replacedBySessionNo == null ? null : await this.sessions.findByNo(row.replacedBySessionNo)

    if (judgeRotatedReuse(row, successor, now, this.config.refreshGraceMs) === 'grace') {
      await this.assertActive(row.userNo, now)
      // 🔴 새 세션을 하나 더 준다. 이긴 탭의 세션은 건드리지 않는다 — 원문을 저장하지 않으니 같은 쿠키를 줄 수 없고,
      //    두 응답 중 나중에 도착한 쪽이 쿠키를 덮어도 살아 있는 토큰만 남아야 한다(gise). 링크는 하지 않는다.
      const issued = this.newSession(row.userNo, req, now)
      const sessionNo = await this.sessions.create({ ...issued.input, loginAt: row.loginAt })
      await this.emit(
        { type: 'token.refresh', userNo: row.userNo, sessionNo, rotatedFrom: row.sessionNo, grace: true },
        req,
      )
      return {
        accessToken: this.tokens.sign({ userNo: row.userNo, sessionNo }),
        refreshToken: issued.refreshToken,
      }
    }

    // 🔴 정상 클라이언트라면 버렸을 값이다. 그 값을 가진 다른 주체가 있으니 누가 진짜인지 알 수 없다 — 전부 끊는다.
    const revokedCount = await this.sessions.revokeAllOfUser(row.userNo, 'reuse_detected', now)
    await this.emit(
      { type: 'token.reuse', userNo: row.userNo, sessionNo: row.sessionNo, revokedCount },
      req,
    )
    throw new BusinessError(CommonErrorCodes.ERR_REFRESH_REUSED, AUTH_MESSAGES.refreshReused)
  }

  /** 회전 · 유예 발급 전 — 계정이 없으면 401, 퇴사면 403. */
  private async assertActive(userNo: bigint, now: Date): Promise<void> {
    const credential = await this.repo.findCredentialByNo(userNo)
    if (credential == null) throw sessionInvalid()
    if (isResigned(credential.resignAt, now)) {
      throw new BusinessError(CommonErrorCodes.ERR_RESIGNED_USER, AUTH_MESSAGES.resigned)
    }
  }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/auth.service.refresh.db.test.ts src/auth/auth.service.login.db.test.ts`
Expected: PASS. P1 두 테스트는 각 약 0.3초 기다린다.

- [ ] **Step 5: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth
pnpm check
pnpm test:db
git add packages/admin-server/src/auth
git commit -m "$(cat <<'EOF'
feat(admin-server): refresh 회전 · 유예창 · 재사용 탐지 · 로그아웃

동시 회전 경합(P1)은 트랜잭션 밖에서 다시 읽어 읽기 시점 rotated(P2)와 같은 판정을 쓴다.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 비밀번호 변경 · `AdminReauthService`

**Files:**

- Modify: `packages/admin-server/src/auth/auth.service.ts`(`changePassword`)
- Create: `packages/admin-server/src/auth/reauth.service.ts`
- Create: `packages/admin-server/src/auth/auth.service.password.db.test.ts`
- Modify: `packages/admin-server/src/test-support/auth.ts`(`AuthKit` 에 `reauth`)

**Interfaces:**

- Consumes: `checkPasswordWithCounter`(Task 8), `AdminAuthRepository.changePassword`(Task 5), `AdminSessionStore.revokeAllOfUser`(Task 6), 2a `runWriteTransaction` · `validationError`
- Produces:
  - `AdminAuthService.changePassword(principal: AdminPrincipal, body: { currentPassword: string; newPassword: string }, req: Request): Promise<void>`
  - `class AdminReauthService { verify(principal: AdminPrincipal, password: string): Promise<void> }`(생성자 `(@Inject(ADMIN_AUTH_CONFIG) config, @Inject(AUTH_REPOSITORY) repo)`)
  - `AuthKit.reauth: AdminReauthService`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/test-support/auth.ts` — import 를 더하고 `AuthKit` · `createAuthKit` 을 고친다:

```ts
import { AdminReauthService } from '../auth/reauth.service.js'
```

```ts
export interface AuthKit {
  config: ResolvedAuthConfig
  repo: KyselyAuthRepository
  store: AdminSessionStore
  tokens: AdminAccessTokenService
  service: AdminAuthService
  reauth: AdminReauthService
  events: RecordingEvents
  policy: SwitchablePolicy
}
```

`createAuthKit` 의 `return` 을 `return { config, repo, store, tokens, service, reauth: new AdminReauthService(config, repo), events, policy }` 로 바꾼다.

`packages/admin-server/src/auth/auth.service.password.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  createAuthKit,
  fakeRequest,
  seedRole,
  seedUser,
  type AuthKit,
} from '../test-support/auth.js'
import { AdminAuthService } from './auth.service.js'
import { AUTH_MESSAGES } from './errors.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'
import { hashPassword } from './password.js'
import type { AdminPrincipal } from './principal.js'

let t: TestDatabase
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db)
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(promise: Promise<unknown>): Promise<BusinessError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('거부되지 않았다')
}

const later = (ms: number) => new Date(Date.now() + ms)

async function signedIn(kit: AuthKit, input: Parameters<typeof seedUser>[1] = { roleNo }) {
  const user = await seedUser(t.db, input)
  const tokens = await kit.service.login(
    { userId: user.userId, password: user.password },
    fakeRequest(),
  )
  const principal: AdminPrincipal = await kit.service.authenticate(
    tokens.accessToken,
    fakeRequest(),
  )
  return { user, tokens, principal }
}

async function failCount(kit: AuthKit, userNo: bigint): Promise<number> {
  return (await kit.repo.findCredentialByNo(userNo))!.loginFailCount
}

describe('changePassword', () => {
  it('🔴 틀린 현재 비밀번호 — 400 ERR_COMMON_VALIDATION + issues[currentPassword], 카운터 +1(3c W1 · 스펙 B2)', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    const error = await rejection(
      kit.service.changePassword(
        principal,
        { currentPassword: 'wrong', newPassword: 'brand-new-pass' },
        fakeRequest(),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(error.details).toEqual({
      issues: [
        {
          path: ['currentPassword'],
          code: 'custom',
          message: AUTH_MESSAGES.currentPasswordMismatch,
        },
      ],
    })
    expect(await failCount(kit, user.userNo)).toBe(1)
  })

  it('잠긴 계정 — 423, 검증하지 않아 카운터가 그대로', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 5, lockUntil: later(60_000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(
      kit.service.changePassword(
        principal,
        { currentPassword: user.password, newPassword: 'brand-new-pass' },
        fakeRequest(),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_ACCOUNT_LOCKED)
    expect(await failCount(kit, user.userNo)).toBe(5)
  })

  it('성공 — 새 비밀번호로만 로그인 · 플래그 해제 · 카운터 0 · 다른 세션 terminated · 현재 세션 유지 · password.change', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, principal } = await signedIn(kit, {
      roleNo,
      isPasswordChangeRequired: true,
      loginFailCount: 2,
    })
    const other = await kit.service.login(
      { userId: user.userId, password: user.password },
      fakeRequest(),
    )
    const rotatedFrom = await kit.service.login(
      { userId: user.userId, password: user.password },
      fakeRequest(),
    )
    await kit.service.refresh(rotatedFrom.refreshToken, fakeRequest())

    await kit.service.changePassword(
      principal,
      { currentPassword: user.password, newPassword: 'brand-new-pass' },
      fakeRequest(),
    )

    expect(await kit.repo.findCredentialByNo(user.userNo)).toMatchObject({
      isPasswordChangeRequired: false,
      loginFailCount: 0,
      lockUntil: null,
    })
    await expect(
      kit.service.login({ userId: user.userId, password: 'brand-new-pass' }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
    const old = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(old.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)

    const otherError = await rejection(kit.service.refresh(other.refreshToken, fakeRequest()))
    expect(otherError.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    await expect(
      kit.service.authenticate(tokens.accessToken, fakeRequest()),
    ).resolves.toMatchObject({
      sessionNo: principal.sessionNo,
    })
    const rotatedRow = await t.db
      .selectFrom('sessions')
      .select('revokedReason')
      .where('userNo', '=', user.userNo)
      .where('revokedReason', '=', 'rotated')
      .execute()
    expect(rotatedRow).toHaveLength(1)
    expect(kit.events.events.find((event) => event.type === 'password.change')).toEqual({
      type: 'password.change',
      userNo: user.userNo,
      sessionNo: principal.sessionNo,
      revokedCount: 2,
    })
  })

  it('🔴 검증 뒤 다른 쓰기가 먼저 해시를 바꿨으면 409 ERR_COMMON_CONFLICT — 아무것도 바뀌지 않는다', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    const staleHash = await hashPassword(user.password)

    class StaleRepository extends KyselyAuthRepository {
      override async findCredentialByNo(userNo: bigint) {
        const row = await super.findCredentialByNo(userNo)
        return row == null ? null : { ...row, passwordHash: staleHash }
      }
    }

    const service = new AdminAuthService(
      kit.config,
      new StaleRepository(t.db),
      kit.store,
      kit.tokens,
      t.db,
    )
    const error = await rejection(
      service.changePassword(
        principal,
        { currentPassword: user.password, newPassword: 'brand-new-pass' },
        fakeRequest(),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(AUTH_MESSAGES.passwordConflict)
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })
})

describe('AdminReauthService', () => {
  it('틀리면 403 ERR_REAUTH_REQUIRED + 카운터 +1, 맞으면 카운터를 되돌린다', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    const error = await rejection(kit.reauth.verify(principal, 'wrong'))
    expect(error.code).toBe(CommonErrorCodes.ERR_REAUTH_REQUIRED)
    expect(error.message).toBe(AUTH_MESSAGES.reauthFailed)
    expect(await failCount(kit, user.userNo)).toBe(1)
    await kit.reauth.verify(principal, user.password)
    expect(await failCount(kit, user.userNo)).toBe(0)
  })

  it('잠긴 계정은 423', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 5, lockUntil: later(60_000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(kit.reauth.verify(principal, user.password))
    expect(error.code).toBe(CommonErrorCodes.ERR_ACCOUNT_LOCKED)
  })
})

describe('🔴 비밀번호 확인 세 자리가 카운터 하나를 쓴다(스펙 B2)', () => {
  it('로그인 2 + 변경 2 + 재인증 1 = 5회 → 잠김 → 맞은 비밀번호로도 로그인 423', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    for (let i = 0; i < 2; i += 1) {
      await rejection(kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()))
      await rejection(
        kit.service.changePassword(
          principal,
          { currentPassword: 'wrong', newPassword: 'brand-new-pass' },
          fakeRequest(),
        ),
      )
    }
    await rejection(kit.reauth.verify(principal, 'wrong'))
    expect(await failCount(kit, user.userNo)).toBe(5)
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_ACCOUNT_LOCKED)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/auth.service.password.db.test.ts`
Expected: FAIL — `../auth/reauth.service.js` 를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/auth/reauth.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { ADMIN_AUTH_CONFIG, AUTH_REPOSITORY } from '../tokens.js'
import type { AdminAuthRepository } from './auth.repository.js'
import { AUTH_MESSAGES } from './errors.js'
import { isLocked, needsReset, nextLoginState } from './login-policy.js'
import type { ResolvedAuthConfig } from './options.js'
import { checkPasswordWithCounter } from './password-check.js'
import type { AdminPrincipal } from './principal.js'

// 정본: hangang-home apps/api/src/core/utils/password-recheck.ts `assertUserPrincipalWithPassword`
// 바꾼 점:
//  - 실패를 로그인 카운터에 센다(스펙 B2 — hangang 은 세지 않았다). 잠긴 계정은 423.
//  - DB 를 리포지토리로 읽는다(사용자 테이블 교체 지점, 스펙 ⑤ A1).

/**
 * 민감 작업 재인증 — 저장 요청 본문에 실려 온 비밀번호로 행위자 본인을 다시 확인한다.
 *  - 별도 엔드포인트를 만들지 않는다. 유효창을 두지 않는다 — 창을 두면 XSS 가 그 안에서 민감 쓰기를 전부 태운다(hangang).
 *  - 🔴 권한이 먼저, 재인증이 나중 — 가드가 통과시킨 뒤 서비스 진입부에서 부른다. 권한 없는 사람에게 비밀번호를 묻지 않는다.
 *  - 🔴 트랜잭션 안에서 부르지 마라 — argon2 수백 ms 동안 이미 잡은 행 잠금을 쥔다(hangang, ER_LOCK_WAIT_TIMEOUT).
 *  - 내 비밀번호 변경에는 걸지 않는다 — 그 본문이 이미 현재 비밀번호를 요구한다.
 */
@Injectable()
export class AdminReauthService {
  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
    @Inject(AUTH_REPOSITORY) private readonly repo: AdminAuthRepository,
  ) {}

  async verify(principal: AdminPrincipal, password: string): Promise<void> {
    const now = new Date()
    const credential = await this.repo.findCredentialByNo(principal.userNo)
    if (credential == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }
    if (isLocked(credential.lockUntil, now)) {
      throw new BusinessError(CommonErrorCodes.ERR_ACCOUNT_LOCKED, AUTH_MESSAGES.locked)
    }
    const check = await checkPasswordWithCounter(
      this.repo,
      credential,
      password,
      now,
      this.config.lockout,
    )
    if (!check.ok) {
      // 화면의 재인증 창이 이 코드로 "다시 묻기" 를 판정한다(admin-ui useWriteFlow).
      throw new BusinessError(CommonErrorCodes.ERR_REAUTH_REQUIRED, AUTH_MESSAGES.reauthFailed)
    }
    if (needsReset(credential)) {
      await this.repo.saveLoginState(
        credential.userNo,
        nextLoginState(credential, 'success', now, this.config.lockout),
      )
    }
  }
}
```

`packages/admin-server/src/auth/auth.service.ts` — import 세 줄을 더한다:

```ts
import { runWriteTransaction } from '../database/run.js'
import { validationError } from '../http/validation.js'
import { hashPassword } from './password.js'
```

(`./password.js` 는 이미 `DUMMY_PASSWORD_HASH` · `verifyPassword` 를 가져오니 그 줄에 `hashPassword` 를 더한다: `import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js'`.)

`logout` 다음에 메서드를 더한다:

```ts
  /**
   * 내 비밀번호 변경(스펙 §5-4). 본문은 이미 쓰는 쪽 정책 스키마를 지났다 — 길이 · 새 = 현재는 400 이 저절로 났다.
   * 🔴 잠김을 먼저 본다(gise — 이미 인증된 본인이라 계정 존재를 숨길 이유가 없다). 틀린 현재 비밀번호는 로그인 실패로
   *    센다(스펙 B2) — 세션을 쥔 사람이 이 경로로 비밀번호를 대입하지 못하게.
   */
  async changePassword(
    principal: AdminPrincipal,
    body: { currentPassword: string; newPassword: string },
    req: Request,
  ): Promise<void> {
    const now = new Date()
    const credential = await this.repo.findCredentialByNo(principal.userNo)
    if (credential == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }
    if (isLocked(credential.lockUntil, now)) {
      throw new BusinessError(CommonErrorCodes.ERR_ACCOUNT_LOCKED, AUTH_MESSAGES.locked)
    }
    const check = await checkPasswordWithCounter(
      this.repo,
      credential,
      body.currentPassword,
      now,
      this.config.lockout,
    )
    if (!check.ok) {
      // 🔴 3c W1 — admin-ui PasswordChangeForm 이 이 경로를 '현재 비밀번호' 칸 옆에 낸다.
      throw validationError([
        {
          path: ['currentPassword'],
          code: 'custom',
          message: AUTH_MESSAGES.currentPasswordMismatch,
        },
      ])
    }

    // 🔴 argon2 는 트랜잭션 밖이다.
    const newHash = await hashPassword(body.newPassword)
    const revokedCount = await runWriteTransaction(this.db, async (trx) => {
      const changed = await this.repo.changePassword(
        trx,
        credential.userNo,
        credential.passwordHash,
        newHash,
      )
      // 검증 뒤 다른 쓰기(다른 세션의 변경 · 관리자 초기화)가 먼저 커밋했다(gise).
      if (changed === 0) {
        throw new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, AUTH_MESSAGES.passwordConflict)
      }
      // 현재 세션은 남기고 나머지를 끊는다(gise · 3c §9).
      return this.sessions.revokeAllOfUser(credential.userNo, 'terminated', now, {
        exceptSessionNo: principal.sessionNo,
        trx,
      })
    })
    // 커밋 뒤에 낸다(스펙 B8). 같은 트랜잭션 감사는 2c 가 정한다.
    await this.emit(
      { type: 'password.change', userNo: credential.userNo, sessionNo: principal.sessionNo, revokedCount },
      req,
    )
  }
```

`db` 주석(`/** 비밀번호 변경 트랜잭션(Task 10) */`)을 `/** 비밀번호 변경 트랜잭션 */` 으로 고친다.

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth`
Expected: PASS — 이 Task 의 7 tests 와 앞 Task 의 DB 테스트 전부.

- [ ] **Step 5: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth packages/admin-server/src/test-support/auth.ts
pnpm check
pnpm test:db
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): 내 비밀번호 변경 · 재인증 — 틀린 현재 비밀번호는 필드 오류, 세 자리 카운터 공용

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `AdminAuthGuard` · 본문 파이프 · 컨트롤러 · `AdminAuthModule` · 코어 배선

**Files:**

- Create: `packages/admin-server/src/auth/auth.guard.ts`
- Create: `packages/admin-server/src/auth/auth.pipes.ts`
- Create: `packages/admin-server/src/auth/auth.controller.ts`
- Create: `packages/admin-server/src/auth/admin-auth.module.ts`
- Create: `packages/admin-server/src/auth/auth.http.test.ts`(DB 없는 HTTP)
- Create: `packages/admin-server/src/test-support/auth-probe.ts`
- Modify: `packages/admin-server/src/tokens.ts`(`CUSTOM_AUTH_REPOSITORY`)
- Modify: `packages/admin-server/src/admin-server.module.ts`(`ADMIN_ROUTE_MODULES`)
- Modify: `packages/admin-server/src/index.ts`(공개 export)

**Interfaces:**

- Consumes: Task 1~10 전부, 2a `ZodValidationPipe` · `createHttpApp` · `AdminServerModule`
- Produces:
  - `class AdminAuthGuard implements CanActivate`
  - `type AdminLoginBody = { userId: string; password: string }` · `class LoginBodyPipe` · `class ChangePasswordBodyPipe`
  - `class AdminAuthController`(`@Controller('auth')` — login · refresh · logout · me · password)
  - `class AdminAuthModule { static withRepository(repository: Type<AdminAuthRepository>, options?: { imports?: ModuleMetadata['imports'] }): DynamicModule }`
  - test-support: `AuthProbeController` · `AuthProbeModule` · `authHooksModule(hooks)` · `bootAuthApp(options): Promise<NestExpressApplication>`

- [ ] **Step 1: 프로브를 쓴다**

`packages/admin-server/src/test-support/auth-probe.ts`:

```ts
import { Body, Controller, Get, HttpCode, Module, Post, type DynamicModule } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import {
  CurrentAdmin,
  Public,
  RequireAnyPermissions,
  RequirePermissions,
  SelfOnly,
} from '../auth/decorators.js'
import type { AdminAccessPolicy, AdminAuthEventSink } from '../auth/hooks.js'
import type { AdminAuthOptions } from '../auth/options.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import type { AdminDbConnection } from '../database/connection.js'
import { ADMIN_ACCESS_POLICY, ADMIN_AUTH_EVENTS } from '../tokens.js'
import { TEST_JWT_SECRET } from './auth.js'
import { createHttpApp, type HttpAppOptions } from './http.js'

// 테스트 전용 — 인증 가드 · 데코레이터를 HTTP 로 잰다. 🔴 빌드에서 빠진다(tsconfig.build.json).
// 이 모듈은 AdminAuthModule 과 다른 모듈이다 — 앱 전역 가드(스펙 ② G1)가 쓰는 쪽 모듈에도 걸리는지 잰다.

@Controller('authprobe')
export class AuthProbeController {
  constructor(private readonly reauth: AdminReauthService) {}

  @Public()
  @Get('public')
  open() {
    return { ok: true }
  }

  @Get('undeclared')
  undeclared() {
    return { ok: true }
  }

  @SelfOnly()
  @Get('self')
  self(@CurrentAdmin() admin: AdminPrincipal) {
    return { userId: admin.userId, sessionNo: admin.sessionNo }
  }

  @RequirePermissions('user:read')
  @Get('users')
  users() {
    return { ok: true }
  }

  @RequireAnyPermissions('team:read', 'role:read')
  @Get('any')
  any() {
    return { ok: true }
  }

  @SelfOnly()
  @HttpCode(200)
  @Post('reauth')
  async reauthCheck(@CurrentAdmin() admin: AdminPrincipal, @Body() body: { password?: unknown }) {
    await this.reauth.verify(admin, typeof body.password === 'string' ? body.password : '')
    return { ok: true }
  }
}

@Module({ imports: [AdminAuthModule], controllers: [AuthProbeController] })
export class AuthProbeModule {}

@Module({})
class AuthHooksTestModule {}

/** 2c · 2f 가 할 일 — 전역 모듈이 ADMIN_ACCESS_POLICY · ADMIN_AUTH_EVENTS 를 내보낸다 */
export function authHooksModule(hooks: {
  policy?: AdminAccessPolicy
  events?: AdminAuthEventSink
}): DynamicModule {
  const providers = [
    ...(hooks.policy ? [{ provide: ADMIN_ACCESS_POLICY, useValue: hooks.policy }] : []),
    ...(hooks.events ? [{ provide: ADMIN_AUTH_EVENTS, useValue: hooks.events }] : []),
  ]
  return {
    module: AuthHooksTestModule,
    global: true,
    providers,
    exports: providers.map((provider) => provider.provide),
  }
}

export interface AuthAppOptions {
  db: AdminDbConnection
  auth?: Partial<AdminAuthOptions>
  policy?: AdminAccessPolicy
  events?: AdminAuthEventSink
  override?: HttpAppOptions['override']
}

/** 코어 + 인증 + 프로브 + 훅 — 운영 main.ts 와 같은 배선(configureAdminApp)으로 띄운다 */
export function bootAuthApp(options: AuthAppOptions): Promise<NestExpressApplication> {
  return createHttpApp(
    {
      imports: [
        AdminServerModule.forRoot({
          db: options.db,
          auth: { jwtSecret: TEST_JWT_SECRET, ...options.auth },
        }),
        AdminAuthModule,
        AuthProbeModule,
        authHooksModule({ policy: options.policy, events: options.events }),
      ],
    },
    options.override ? { override: options.override } : {},
  )
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/auth.http.test.ts`:

```ts
import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { CommonErrorCodes, errorRespSchema } from '@ssworks/admin-shared'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { bootAuthApp } from '../test-support/auth-probe.js'
import { createHttpApp } from '../test-support/http.js'
import { AUTH_REPOSITORY, KYSELY } from '../tokens.js'
import { AdminAuthModule } from './admin-auth.module.js'
import type { AdminAuthRepository } from './auth.repository.js'
import { AUTH_MESSAGES } from './errors.js'

// DB 없는 HTTP 층 — DB 에 닿기 전에 끝나는 경로만 잰다(스펙 §9-2). KYSELY 는 가짜다.

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const fakeKysely = () => ({ destroy: vi.fn(async () => undefined) })

let app: NestExpressApplication

beforeAll(async () => {
  app = await bootAuthApp({
    db: unreachable,
    override: (builder) => builder.overrideProvider(KYSELY).useValue(fakeKysely()),
  })
})

afterAll(async () => {
  await app?.close()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function expectError(body: unknown, code: string, message?: string) {
  const parsed = errorRespSchema.parse(body)
  expect(parsed.code).toBe(code)
  if (message !== undefined) expect(parsed.message).toBe(message)
}

describe('라우트 자리', () => {
  it('/admin/auth/login 에 있고 본문을 검증한다 — 400 · path 배열', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ userId: '', password: 1 })
      .expect(400)
    expectError(response.body, CommonErrorCodes.ERR_COMMON_VALIDATION)
    const paths = (response.body.details.issues as { path: unknown[] }[]).map((issue) => issue.path)
    expect(paths).toEqual(expect.arrayContaining([['userId'], ['password']]))
  })

  it('prefix 없는 /auth/login 은 없다', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({}).expect(404)
  })
})

describe('🔴 앱 전역 가드(스펙 ② G1) — 다른 모듈의 라우트에도 걸린다', () => {
  it('@Public 은 쿠키 없이 200', async () => {
    await request(app.getHttpServer()).get('/authprobe/public').expect(200)
  })

  it('표시 없는 라우트 · /me 는 쿠키 없이 401 ERR_COMMON_UNAUTHORIZED', async () => {
    for (const path of ['/authprobe/undeclared', '/admin/auth/me']) {
      const response = await request(app.getHttpServer()).get(path).expect(401)
      expectError(
        response.body,
        CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
        AUTH_MESSAGES.unauthorized,
      )
    }
  })

  it('🔴 j: 객체 쿠키는 없는 것이다 — 401 ERR_COMMON_UNAUTHORIZED', async () => {
    const response = await request(app.getHttpServer())
      .get('/authprobe/self')
      .set('Cookie', 'admin_at=j:{"userNo":"BigInt(1)"}')
      .expect(401)
    expectError(response.body, CommonErrorCodes.ERR_COMMON_UNAUTHORIZED)
  })

  it('위조 JWT — 401 ERR_INVALID_TOKEN', async () => {
    const forged = new JwtService({ secret: 'z'.repeat(32) }).sign({
      userNo: 'BigInt(1)',
      sessionNo: 'BigInt(1)',
    })
    const response = await request(app.getHttpServer())
      .get('/authprobe/self')
      .set('Cookie', `admin_at=${forged}`)
      .expect(401)
    expectError(response.body, CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.accessInvalid)
  })

  it('만료 JWT — 401 ERR_EXPIRED_TOKEN', async () => {
    const expired = new JwtService({ secret: TEST_JWT_SECRET }).sign({
      userNo: 'BigInt(1)',
      sessionNo: 'BigInt(1)',
      exp: Math.floor(Date.now() / 1000) - 10,
    })
    const response = await request(app.getHttpServer())
      .get('/authprobe/self')
      .set('Cookie', `admin_at=${expired}`)
      .expect(401)
    expectError(response.body, CommonErrorCodes.ERR_EXPIRED_TOKEN, AUTH_MESSAGES.accessExpired)
  })
})

describe('refresh · logout — 쿠키 없이', () => {
  it('refresh 는 401 ERR_COMMON_UNAUTHORIZED', async () => {
    const response = await request(app.getHttpServer()).post('/admin/auth/refresh').expect(401)
    expectError(
      response.body,
      CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
      AUTH_MESSAGES.refreshMissing,
    )
  })

  it('🔴 logout 은 200 data null + 두 쿠키를 같은 Path 로 지운다', async () => {
    const response = await request(app.getHttpServer()).post('/admin/auth/logout').expect(200)
    expect(response.body).toEqual({ success: true, data: null })
    const cookies = response.headers['set-cookie'] as unknown as string[]
    for (const name of ['admin_at', 'admin_rt']) {
      const line = cookies.find((cookie) => cookie.startsWith(`${name}=;`))
      expect(line).toBeDefined()
      expect(line).toContain('Path=/')
      expect(line).toContain('Expires=Thu, 01 Jan 1970')
      expect(line).toContain('HttpOnly')
    }
  })
})

describe('기동 검사', () => {
  const boot = (options: Parameters<typeof AdminServerModule.forRoot>[0]) =>
    createHttpApp(
      { imports: [AdminServerModule.forRoot(options), AdminAuthModule] },
      { override: (builder) => builder.overrideProvider(KYSELY).useValue(fakeKysely()) },
    )

  it.each([
    ['auth 없음', { db: unreachable }, 'auth.jwtSecret'],
    [
      '짧은 비밀키',
      { db: unreachable, auth: { jwtSecret: 'short' } },
      'auth.jwtSecret 은 32자 이상',
    ],
    [
      '같은 쿠키 이름',
      {
        db: unreachable,
        auth: { jwtSecret: TEST_JWT_SECRET, cookies: { accessName: 'x', refreshName: 'x' } },
      },
      '같다',
    ],
  ])('%s → 기동에서 멈춘다', async (_label, options, message) => {
    await expect(boot(options)).rejects.toThrow(message)
  })

  it('failClosed: false 는 경고 한 줄을 남긴다', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn')
    const lenient = await boot({
      db: unreachable,
      auth: { jwtSecret: TEST_JWT_SECRET, failClosed: false },
    })
    try {
      expect(warn.mock.calls.some(([message]) => String(message).includes('failClosed'))).toBe(true)
    } finally {
      await lenient.close()
    }
  })

  it('withRepository — 바꾼 리포지토리가 AUTH_REPOSITORY 가 되고 /admin/auth/* 가 그대로 있다', async () => {
    class MemoryRepository implements AdminAuthRepository {
      async findCredentialByUserId() {
        return null
      }
      async findCredentialByNo() {
        return null
      }
      async findPrincipal() {
        return null
      }
      async saveLoginState() {}
      async changePassword() {
        return 0
      }
    }
    const custom = await createHttpApp(
      {
        imports: [
          AdminServerModule.forRoot({ db: unreachable, auth: { jwtSecret: TEST_JWT_SECRET } }),
          AdminAuthModule.withRepository(MemoryRepository),
        ],
      },
      { override: (builder) => builder.overrideProvider(KYSELY).useValue(fakeKysely()) },
    )
    try {
      expect(custom.get(AUTH_REPOSITORY, { strict: false })).toBeInstanceOf(MemoryRepository)
      await request(custom.getHttpServer()).post('/admin/auth/login').send({}).expect(400)
    } finally {
      await custom.close()
    }
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/auth.http.test.ts`
Expected: FAIL — `../auth/admin-auth.module.js` 를 찾지 못한다.

- [ ] **Step 4: 구현한다**

`packages/admin-server/src/tokens.ts` 끝에 더한다:

```ts
/** 내부 — `AdminAuthModule.withRepository` 가 넣는 교체 구현. AUTH_REPOSITORY 팩토리가 있으면 쓴다(스펙 B6) */
export const CUSTOM_AUTH_REPOSITORY = Symbol('CUSTOM_AUTH_REPOSITORY')
```

`packages/admin-server/src/auth/auth.guard.ts`:

```ts
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ADMIN_AUTH_CONFIG, IS_PUBLIC } from '../tokens.js'
import { AdminAuthService } from './auth.service.js'
import { readCookie } from './cookies.js'
import type { ResolvedAuthConfig } from './options.js'
import { setAdminPrincipal } from './principal.js'

// 정본: hangang-home apps/api/src/core/guards/auth.guard.ts
// 바꾼 점: 판정(JWT · 세션 · 사용자 · 퇴사 · IP)을 AdminAuthService.authenticate 로 옮겼다 — 가드는 쿠키를 읽고 주체를
//   req.admin 에 둔다. HTTP 가 아닌 컨텍스트는 통과(스펙 §14 R4). apiKey 경로 · 사이트 시간대는 없다.

/** 🔴 앱 전역(APP_GUARD — 스펙 ② G1). 관리자 밖 라우트는 @Public 으로 뺀다. AdminPermissionGuard 보다 먼저 돈다. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AdminAuthService,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic === true) return true

    const req = context.switchToHttp().getRequest<Request>()
    const principal = await this.auth.authenticate(
      readCookie(req, this.config.cookies.accessName),
      req,
    )
    setAdminPrincipal(req, principal)
    return true
  }
}
```

`packages/admin-server/src/auth/auth.pipes.ts`:

```ts
import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import { z } from 'zod'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_AUTH_CONFIG } from '../tokens.js'
import type { ResolvedAuthConfig } from './options.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.dto.ts(loginBodySchema) · admin-password.controller.ts
// 바꾼 점: 스키마가 런타임 정책(passwordPolicy)에 달려 있어 데코레이터 인자로 고정할 수 없다 — 주입형 파이프가 2a
//   ZodValidationPipe 를 감싼다(스펙 §4-9). `@Body(LoginBodyPipe)` 처럼 클래스로 넘기면 Nest 가 모듈 안에서 만든다.

export interface AdminLoginBody {
  userId: string
  password: string
}

export interface AdminChangePasswordBody {
  currentPassword: string
  newPassword: string
}

/** userId 는 users.userId 폭(64). 비밀번호 상한은 정책 최대와 256 중 큰 값 — 정책을 줄여도 옛 긴 비밀번호로 들어온다 */
@Injectable()
export class LoginBodyPipe implements PipeTransform<unknown, AdminLoginBody> {
  private readonly pipe: ZodValidationPipe<AdminLoginBody>

  constructor(@Inject(ADMIN_AUTH_CONFIG) config: ResolvedAuthConfig) {
    this.pipe = new ZodValidationPipe(
      z.object({
        userId: z.string().min(1).max(64),
        password: z.string().min(1).max(Math.max(config.passwordPolicy.maxLength, 256)),
      }),
    )
  }

  transform(value: unknown): AdminLoginBody {
    return this.pipe.transform(value)
  }
}

/** 🔴 쓰는 쪽 정책의 changePasswordSchema — 길이 위반 · 새 = 현재가 저절로 필드 오류가 된다(3c §4-3) */
@Injectable()
export class ChangePasswordBodyPipe implements PipeTransform<unknown, AdminChangePasswordBody> {
  private readonly pipe: ZodValidationPipe<AdminChangePasswordBody>

  constructor(@Inject(ADMIN_AUTH_CONFIG) config: ResolvedAuthConfig) {
    this.pipe = new ZodValidationPipe(config.passwordPolicy.changePasswordSchema)
  }

  transform(value: unknown): AdminChangePasswordBody {
    return this.pipe.transform(value)
  }
}
```

`packages/admin-server/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { ADMIN_AUTH_CONFIG } from '../tokens.js'
import { ChangePasswordBodyPipe, LoginBodyPipe } from './auth.pipes.js'
import type { AdminChangePasswordBody, AdminLoginBody } from './auth.pipes.js'
import { AdminAuthService } from './auth.service.js'
import { clearAuthCookies, readCookie, setAuthCookies } from './cookies.js'
import { AllowDuringPasswordChange, CurrentAdmin, Public, SelfOnly } from './decorators.js'
import type { ResolvedAuthConfig } from './options.js'
import { toAdminMe } from './principal.js'
import type { AdminMe, AdminPrincipal } from './principal.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.controller.ts(@Public 로그인 · 갱신 · 로그아웃, 쿠키는 늘 지움)
//       + hangang-home modules/auth/auth.controller.ts(@HttpCode(200))
// 바꾼 점: 본문 { ok: true } 대신 반환값 없음(→ data: null, 2a F4). 로그아웃은 @Public(hangang 은 @SelfOnly) — 액세스
//   토큰이 만료돼도 쿠키가 지워져야 한다. 경로는 AdminServerModule 의 RouterModule 이 /admin 을 붙인다.

@Controller('auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
  ) {}

  /** 🔴 토큰은 httpOnly 쿠키로만 나간다 — 본문에 담으면 SPA 가 localStorage 에 넣을 여지가 생긴다(gise). */
  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(LoginBodyPipe) body: AdminLoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    setAuthCookies(req, res, this.config, await this.auth.login(body, req))
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const tokens = await this.auth.refresh(readCookie(req, this.config.cookies.refreshName), req)
    setAuthCookies(req, res, this.config, tokens)
  }

  /**
   * 🔴 @Public 이다 — 액세스 토큰이 만료된 상태에서도 성공해야 쿠키가 지워진다. 주체 대신 refresh 쿠키가 세션을 지목한다.
   * 🔴 폐기가 실패해도(DB 오류) 쿠키는 지운다 — 브라우저 상태는 깨끗해져야 한다(gise).
   */
  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    try {
      await this.auth.logout(readCookie(req, this.config.cookies.refreshName), req)
    } finally {
      clearAuthCookies(req, res, this.config)
    }
  }

  /** 🔴 @SelfOnly — 권한 없는 계정이 여기서 403 이면 SPA 가 조용한 리디렉트 루프에 빠진다(gise). 강제 변경 계정도 연다. */
  @SelfOnly()
  @AllowDuringPasswordChange()
  @Get('me')
  me(@CurrentAdmin() admin: AdminPrincipal): AdminMe {
    return toAdminMe(admin)
  }

  @SelfOnly()
  @AllowDuringPasswordChange()
  @Patch('password')
  async changePassword(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body(ChangePasswordBodyPipe) body: AdminChangePasswordBody,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword(admin, body, req)
  }
}
```

`packages/admin-server/src/auth/admin-auth.module.ts`:

```ts
import {
  Logger,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type Provider,
  type Type,
} from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import type { AdminServerOptions } from '../options.js'
import {
  ADMIN_AUTH_CONFIG,
  ADMIN_SERVER_OPTIONS,
  AUTH_REPOSITORY,
  CUSTOM_AUTH_REPOSITORY,
  KYSELY,
} from '../tokens.js'
import { AdminAccessTokenService } from './access-token.service.js'
import { AdminAuthController } from './auth.controller.js'
import { AdminAuthGuard } from './auth.guard.js'
import type { AdminAuthRepository } from './auth.repository.js'
import { AdminAuthService } from './auth.service.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'
import { resolveAuthConfig, type ResolvedAuthConfig } from './options.js'
import { AdminPermissionGuard } from './permission.guard.js'
import { AdminReauthService } from './reauth.service.js'
import { AdminSessionStore } from './session.store.js'

// 정본: hangang-home apps/api/src/app.module.ts(APP_GUARD AuthGuard → PermissionGuard) · modules/auth/auth.module.ts
// 바꾼 점: 패키지 기능 모듈이다 — 쓰는 쪽 app.module.ts 가 import 한다(2a ④ R2). 값은 코어 옵션의 auth ·
//   passwordPolicy 에서 읽고, 리포지토리 교체만 withRepository 로 받는다(스펙 ⑥ O1). JwtModule 을 쓰지 않는다(Task 4).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 하므로
//    반대 방향은 순환이다. 토큰은 tokens.ts 에서(2a F3).

const providers: Provider[] = [
  {
    provide: ADMIN_AUTH_CONFIG,
    useFactory: (options: AdminServerOptions): ResolvedAuthConfig => {
      const config = resolveAuthConfig(options.auth, options.passwordPolicy)
      if (!config.failClosed) {
        new Logger('AdminAuthModule').warn(
          'auth.failClosed 가 false 다 — 권한 선언이 없는 라우트가 인증만으로 통과한다(이식 과도기 옵션).',
        )
      }
      return config
    },
    inject: [ADMIN_SERVER_OPTIONS],
  },
  {
    // 🔴 교체는 CUSTOM_AUTH_REPOSITORY 가 있을 때만 — 같은 토큰을 정적 · 동적 메타데이터에 두 번 두고 덮어쓰기 순서에
    //    기대지 않는다(스펙 B6, §14 R1-3 실측).
    provide: AUTH_REPOSITORY,
    useFactory: (custom: AdminAuthRepository | undefined, db: Kysely<AdminDatabase>) =>
      custom ?? new KyselyAuthRepository(db),
    inject: [{ token: CUSTOM_AUTH_REPOSITORY, optional: true }, KYSELY],
  },
  AdminAccessTokenService,
  AdminSessionStore,
  AdminAuthService,
  AdminReauthService,
  // 본문 파이프(LoginBodyPipe · ChangePasswordBodyPipe)는 @Body(클래스) 로 넘겨 Nest 가 이 모듈 안에서 만든다 — 여기
  // 적지 않는다.
  // 🔴 앱 전역(스펙 ② G1). 등록 순서가 실행 순서다 — 인증이 주체를 채운 뒤 권한을 판정한다.
  { provide: APP_GUARD, useClass: AdminAuthGuard },
  { provide: APP_GUARD, useClass: AdminPermissionGuard },
]

@Module({
  controllers: [AdminAuthController],
  providers,
  exports: [AdminReauthService, AUTH_REPOSITORY],
})
export class AdminAuthModule {
  /**
   * 사용자 테이블 컬럼이 코어와 다른 프로젝트 — `AdminAuthRepository` 구현을 넘긴다. 그 클래스가 기대는 provider 의
   * 모듈은 `imports` 로 넘긴다. 🔴 컬럼 매핑 옵션은 만들지 않는다(2a §1-4 #5).
   */
  static withRepository(
    repository: Type<AdminAuthRepository>,
    options: { imports?: ModuleMetadata['imports'] } = {},
  ): DynamicModule {
    return {
      module: AdminAuthModule,
      imports: options.imports ?? [],
      providers: [{ provide: CUSTOM_AUTH_REPOSITORY, useClass: repository }],
    }
  }
}
```

`packages/admin-server/src/admin-server.module.ts` — import 를 더하고 목록을 채운다:

```ts
import { AdminAuthModule } from './auth/admin-auth.module.js'
```

```ts
/**
 * 패키지가 아는 기능 모듈 — `routePrefix` 를 붙일 대상. 쓰는 쪽이 import 하지 않은 모듈은 `RouterModule` 이 건너뛴다
 * (`@nestjs/core` router-module.js 실측). 같은 클래스의 동적 모듈(`withRepository`)에도 붙는다(2b 스펙 §14 R1-3).
 * 🔴 여기 오는 모듈 파일은 이 파일을 import 하지 않는다(순환) — 토큰은 tokens.ts 에서 가져온다.
 */
const ADMIN_ROUTE_MODULES: readonly Type[] = [AdminAuthModule]
```

`packages/admin-server/src/index.ts` 끝에 더한다:

```ts
// 인증(PR 2b)
export { AdminAuthModule } from './auth/admin-auth.module.js'
export { AUTH_REPOSITORY, ADMIN_ACCESS_POLICY, ADMIN_AUTH_EVENTS } from './tokens.js'
export type { AdminAuthOptions, AdminAuthCookieOptions } from './auth/options.js'
export type {
  AdminAuthRepository,
  AdminCredential,
  AdminPrincipalRecord,
  AdminLoginState,
} from './auth/auth.repository.js'
export { KyselyAuthRepository } from './auth/kysely-auth.repository.js'
export { getAdminPrincipal, type AdminPrincipal, type AdminMe } from './auth/principal.js'
export {
  Public,
  SelfOnly,
  RequirePermissions,
  RequireAnyPermissions,
  CurrentAdmin,
} from './auth/decorators.js'
export type {
  AdminAccessContext,
  AdminAccessPolicy,
  AdminAuthEvent,
  AdminAuthEventSink,
} from './auth/hooks.js'
export { AdminReauthService } from './auth/reauth.service.js'
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/auth.http.test.ts src/admin-server.module.test.ts src/runner-graph.test.ts`
Expected: PASS. 2a 모듈 테스트("목록에 없는 모듈은 prefix 없음" 등)는 그대로 초록이다 — `AdminAuthModule` 을 import 하지 않은 앱에서는 `RouterModule` 이 그 항목을 건너뛴다. `AdminAuthModule` 을 import 하지 않은 2a 테스트 앱에는 인증 가드가 없다.

- [ ] **Step 6: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src
pnpm check
pnpm test:db
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): AdminAuthModule — 앱 전역 인증 · 권한 가드, /admin/auth 라우트, withRepository

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

Expected: `pnpm check` · `pnpm test:db` 초록.

---

### Task 12: 실 MariaDB HTTP 계약 — 끝 상태

2a D1 의 세 번째 층. 실제 앱(코어 + 인증 + 프로브 + 가짜 정책 · 이벤트)을 테스트 데이터베이스에 붙여 스펙 §1 의 끝 상태와 §9-3 의 HTTP 계약을 요청으로 잰다. 코드를 고치지 않는 Task 다 — 실패가 나오면 해당 Task 의 파일을 고치고 스펙 §14 에 R 항목을 더한다.

**Files:**

- Create: `packages/admin-server/src/auth/auth.http.db.test.ts`

**Interfaces:**

- Consumes: `bootAuthApp`(Task 11), `SwitchablePolicy` · `RecordingEvents` · `seedRole` · `seedUser`(Task 5 · 8), `AUTH_MESSAGES`(Task 7)

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/auth/auth.http.db.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import { CommonErrorCodes, errorRespSchema } from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import {
  RecordingEvents,
  SwitchablePolicy,
  seedRole,
  seedUser,
  type SeedUserInput,
} from '../test-support/auth.js'
import { bootAuthApp } from '../test-support/auth-probe.js'
import { AUTH_MESSAGES } from './errors.js'
import { hashRefreshToken } from './refresh-token.js'

// 실 MariaDB 의 HTTP 계약(스펙 §9-3) — admin-ui createApiClient · createAppStore 가 기대는 모양 그대로.

let t: TestDatabase
let app: NestExpressApplication
let readerRole: bigint
let allRole: bigint
const policy = new SwitchablePolicy()
const events = new RecordingEvents()

beforeAll(async () => {
  t = await createTestDatabase()
  readerRole = await seedRole(t.db, { roleName: '열람자', permissions: ['user:read'] })
  allRole = await seedRole(t.db, { roleName: '최고 관리자', permissions: ['*'] })
  app = await bootAuthApp({
    db: { ...testDbServer(), database: t.name, connectionLimit: 4 },
    policy,
    events,
  })
})

afterAll(async () => {
  await app?.close()
  await t?.drop()
})

afterEach(() => {
  policy.allow = true
})

const LOGIN = '/admin/auth/login'
const REFRESH = '/admin/auth/refresh'
const LOGOUT = '/admin/auth/logout'
const ME = '/admin/auth/me'
const PASSWORD = '/admin/auth/password'

const server = () => app.getHttpServer()
const later = (ms: number) => new Date(Date.now() + ms)

function setCookies(response: Response): string[] {
  const header: unknown = response.headers['set-cookie']
  return Array.isArray(header) ? (header as string[]) : []
}

function cookieLine(response: Response, name: string): string {
  const line = setCookies(response).find((item) => item.startsWith(`${name}=`))
  if (line === undefined) throw new Error(`${name} 쿠키가 없다`)
  return line
}

function cookieValue(response: Response, name: string): string {
  return cookieLine(response, name)
    .split(';')[0]!
    .slice(name.length + 1)
}

function expectError(response: Response, status: number, code: string, message?: string): void {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
}

async function signIn(input: SeedUserInput = { roleNo: readerRole }) {
  const user = await seedUser(t.db, input)
  const agent = request.agent(server())
  const login = await agent.post(LOGIN).send({ userId: user.userId, password: user.password })
  expect(login.status).toBe(200)
  return { user, agent, login, refresh: cookieValue(login, 'admin_rt') }
}

describe('로그인 → 쿠키 → /me', () => {
  it('🔴 쿠키 둘(HttpOnly · Path=/ · Lax · http 에서 Secure 없음) · /me 는 AdminUserInfo 의 상위 집합', async () => {
    const { user, agent, login } = await signIn()
    expect(login.body).toEqual({ success: true, data: null })
    for (const name of ['admin_at', 'admin_rt']) {
      const line = cookieLine(login, name)
      expect(line).toContain('HttpOnly')
      expect(line).toContain('Path=/')
      expect(line).toContain('SameSite=Lax')
      expect(line).not.toContain('Secure')
    }
    expect(cookieLine(login, 'admin_at')).toContain('Max-Age=900')
    expect(cookieLine(login, 'admin_rt')).toContain('Max-Age=604800')

    const me = await agent.get(ME).expect(200)
    expect(me.body).toEqual({
      success: true,
      data: {
        userNo: `BigInt(${user.userNo})`,
        userId: user.userId,
        userName: expect.any(String),
        roleNo: `BigInt(${readerRole})`,
        roleName: '열람자',
        permissions: ['user:read'],
        isPasswordChangeRequired: false,
      },
    })
  })

  it('X-Forwarded-Proto: https 면 두 쿠키에 Secure', async () => {
    const user = await seedUser(t.db, { roleNo: readerRole })
    const login = await request(server())
      .post(LOGIN)
      .set('X-Forwarded-Proto', 'https')
      .send({ userId: user.userId, password: user.password })
      .expect(200)
    expect(cookieLine(login, 'admin_at')).toContain('Secure')
    expect(cookieLine(login, 'admin_rt')).toContain('Secure')
  })
})

describe('회전 · 재사용 탐지', () => {
  it('refresh 가 새 쿠키 둘을 주고 새 쿠키로 /me 가 된다', async () => {
    const { agent, login } = await signIn()
    const refreshed = await agent.post(REFRESH).expect(200)
    expect(refreshed.body).toEqual({ success: true, data: null })
    expect(cookieValue(refreshed, 'admin_rt')).not.toBe(cookieValue(login, 'admin_rt'))
    expect(cookieValue(refreshed, 'admin_at')).not.toBe(cookieValue(login, 'admin_at'))
    await agent.get(ME).expect(200)
  })

  it('🔴 끝 상태 — 창 밖의 옛 refresh 는 401 ERR_REFRESH_REUSED 이고 다른 기기까지 끊긴다', async () => {
    const deviceA = await signIn()
    const deviceB = request.agent(server())
    await deviceB
      .post(LOGIN)
      .send({ userId: deviceA.user.userId, password: deviceA.user.password })
      .expect(200)
    await deviceA.agent.post(REFRESH).expect(200)
    await t.db
      .updateTable('sessions')
      .set({ revokedAt: later(-60_000) })
      .where('refreshTokenHash', '=', hashRefreshToken(deviceA.refresh))
      .execute()

    const reused = await request(server())
      .post(REFRESH)
      .set('Cookie', `admin_rt=${deviceA.refresh}`)
    expectError(reused, 401, CommonErrorCodes.ERR_REFRESH_REUSED, AUTH_MESSAGES.refreshReused)
    expectError(await deviceA.agent.get(ME), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
    expectError(await deviceB.get(ME), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
  })

  it('🔴 같은 쿠키로 동시 refresh 두 건 — 둘 다 200(유예창)', async () => {
    const { agent } = await signIn()
    const [a, b] = await Promise.all([agent.post(REFRESH), agent.post(REFRESH)])
    expect([a.status, b.status]).toEqual([200, 200])
    await agent.get(ME).expect(200)
  })

  it('🔴 액세스 쿠키만 사라진 브라우저 — /me 401 → refresh 200 → /me 200 (Review Focus 5)', async () => {
    const { refresh } = await signIn()
    const browser = request.agent(server())
    expectError(
      await browser.get(ME).set('Cookie', `admin_rt=${refresh}`),
      401,
      CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
    )
    await browser.post(REFRESH).set('Cookie', `admin_rt=${refresh}`).expect(200)
    await browser.get(ME).expect(200)
  })
})

describe('로그인 실패 · 잠금 · 퇴사 · 만료', () => {
  it('🔴 틀림 401 × 5 → 맞은 비밀번호 423 → 잠금이 지나면 200', async () => {
    const user = await seedUser(t.db, { roleNo: readerRole })
    for (let i = 0; i < 5; i += 1) {
      expectError(
        await request(server()).post(LOGIN).send({ userId: user.userId, password: 'wrong-pass' }),
        401,
        CommonErrorCodes.ERR_LOGIN_FAILED,
        AUTH_MESSAGES.loginFailed,
      )
    }
    expectError(
      await request(server()).post(LOGIN).send({ userId: user.userId, password: user.password }),
      423,
      CommonErrorCodes.ERR_ACCOUNT_LOCKED,
      AUTH_MESSAGES.locked,
    )
    await t.db
      .updateTable('users')
      .set({ lockUntil: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    await request(server())
      .post(LOGIN)
      .send({ userId: user.userId, password: user.password })
      .expect(200)
  })

  it('🔴 퇴사 효력이 지나면 가드 · refresh · 로그인 모두 403 ERR_RESIGNED_USER', async () => {
    const { user, agent, refresh } = await signIn()
    await t.db
      .updateTable('users')
      .set({ resignAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    expectError(
      await agent.get(ME),
      403,
      CommonErrorCodes.ERR_RESIGNED_USER,
      AUTH_MESSAGES.resigned,
    )
    expectError(
      await request(server()).post(REFRESH).set('Cookie', `admin_rt=${refresh}`),
      403,
      CommonErrorCodes.ERR_RESIGNED_USER,
    )
    expectError(
      await request(server()).post(LOGIN).send({ userId: user.userId, password: user.password }),
      403,
      CommonErrorCodes.ERR_RESIGNED_USER,
    )
  })

  it('세션 expireAt 이 지나면 401 ERR_SESSION_EXPIRED', async () => {
    const { user, agent } = await signIn()
    await t.db
      .updateTable('sessions')
      .set({ expireAt: later(-2000) })
      .where('userNo', '=', user.userNo)
      .execute()
    expectError(await agent.get(ME), 401, CommonErrorCodes.ERR_SESSION_EXPIRED)
  })
})

describe('권한', () => {
  it('열람자 — users 200 · any 403 · self 200 · 선언 없음 403(reason)', async () => {
    const { agent } = await signIn()
    await agent.get('/authprobe/users').expect(200)
    expectError(
      await agent.get('/authprobe/any'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      AUTH_MESSAGES.forbidden,
    )
    await agent.get('/authprobe/self').expect(200)
    const undeclared = await agent.get('/authprobe/undeclared')
    expectError(
      undeclared,
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      AUTH_MESSAGES.noPermissionDeclared,
    )
    expect(undeclared.body.details).toEqual({ reason: 'no-permission-declared' })
  })

  it('🔴 "*" 역할 — users · any 200, 선언 없는 라우트는 여전히 403', async () => {
    const { agent } = await signIn({ roleNo: allRole })
    await agent.get('/authprobe/users').expect(200)
    await agent.get('/authprobe/any').expect(200)
    expectError(
      await agent.get('/authprobe/undeclared'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('🔴 권한 JSON 이 깨진 역할 — 로그인 200 · /me permissions [] · 권한 라우트 403 (Review Focus 4)', async () => {
    const broken = await seedRole(t.db, { permissions: { all: true } })
    const { agent } = await signIn({ roleNo: broken })
    const me = await agent.get(ME).expect(200)
    expect(me.body.data.permissions).toEqual([])
    expectError(await agent.get('/authprobe/users'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })
})

describe('강제 변경', () => {
  it('🔴 /me 200 + permissions [] · 다른 @SelfOnly 403 · refresh 200 · 바꾸면 풀린다', async () => {
    const { user, agent } = await signIn({ roleNo: allRole, isPasswordChangeRequired: true })
    const me = await agent.get(ME).expect(200)
    expect(me.body.data).toMatchObject({ permissions: [], isPasswordChangeRequired: true })
    expectError(
      await agent.get('/authprobe/self'),
      403,
      CommonErrorCodes.ERR_PASSWORD_CHANGE_REQUIRED,
      AUTH_MESSAGES.passwordChangeRequired,
    )
    await agent.post(REFRESH).expect(200)
    await agent
      .patch(PASSWORD)
      .send({ currentPassword: user.password, newPassword: 'brand-new-pass-1' })
      .expect(200)
    const after = await agent.get(ME).expect(200)
    expect(after.body.data).toMatchObject({ permissions: ['*'], isPasswordChangeRequired: false })
    await agent.get('/authprobe/self').expect(200)
  })
})

describe('비밀번호 변경', () => {
  it('🔴 틀린 현재 비밀번호 400 issues[currentPassword] + 카운터 · 새 = 현재 400 newPassword · 짧음 400', async () => {
    const { user, agent } = await signIn()
    const wrong = await agent
      .patch(PASSWORD)
      .send({ currentPassword: 'wrong-current', newPassword: 'brand-new-pass-1' })
    expectError(wrong, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(wrong.body.details.issues).toEqual([
      { path: ['currentPassword'], code: 'custom', message: AUTH_MESSAGES.currentPasswordMismatch },
    ])
    const row = await t.db
      .selectFrom('users')
      .select('loginFailCount')
      .where('userNo', '=', user.userNo)
      .executeTakeFirstOrThrow()
    expect(row.loginFailCount).toBe(1)

    const same = await agent
      .patch(PASSWORD)
      .send({ currentPassword: user.password, newPassword: user.password })
    expectError(same, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect((same.body.details.issues as { path: unknown[] }[]).map((issue) => issue.path)).toEqual([
      ['newPassword'],
    ])

    const short = await agent
      .patch(PASSWORD)
      .send({ currentPassword: user.password, newPassword: 'short' })
    expectError(short, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(short.body.details.issues[0].path).toEqual(['newPassword'])
  })

  it('성공 — 다른 기기 refresh 401 · 현재 세션 유지 · 새 비밀번호로만 로그인', async () => {
    const deviceA = await signIn()
    const credentials = { userId: deviceA.user.userId, password: deviceA.user.password }
    const deviceB = request.agent(server())
    await deviceB.post(LOGIN).send(credentials).expect(200)

    await deviceA.agent
      .patch(PASSWORD)
      .send({ currentPassword: credentials.password, newPassword: 'brand-new-pass-2' })
      .expect(200)
    await deviceA.agent.get(ME).expect(200)
    expectError(await deviceB.post(REFRESH), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
    await request(server())
      .post(LOGIN)
      .send({ userId: credentials.userId, password: 'brand-new-pass-2' })
      .expect(200)
    expectError(
      await request(server()).post(LOGIN).send(credentials),
      401,
      CommonErrorCodes.ERR_LOGIN_FAILED,
    )
  })

  it('잠긴 계정의 변경은 423', async () => {
    const { user, agent } = await signIn()
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 5, lockUntil: later(60_000) })
      .where('userNo', '=', user.userNo)
      .execute()
    expectError(
      await agent
        .patch(PASSWORD)
        .send({ currentPassword: user.password, newPassword: 'brand-new-pass-3' }),
      423,
      CommonErrorCodes.ERR_ACCOUNT_LOCKED,
    )
  })
})

describe('재인증 · 로그아웃', () => {
  it('재인증 — 틀리면 403 ERR_REAUTH_REQUIRED, 맞으면 200', async () => {
    const { user, agent } = await signIn()
    expectError(
      await agent.post('/authprobe/reauth').send({ password: 'wrong' }),
      403,
      CommonErrorCodes.ERR_REAUTH_REQUIRED,
      AUTH_MESSAGES.reauthFailed,
    )
    await agent.post('/authprobe/reauth').send({ password: user.password }).expect(200)
  })

  it('🔴 로그아웃 — 두 쿠키를 지우고, 옛 refresh 는 재사용이 아니라 ERR_INVALID_TOKEN, 다른 기기는 산다', async () => {
    const deviceA = await signIn()
    const deviceB = request.agent(server())
    await deviceB
      .post(LOGIN)
      .send({ userId: deviceA.user.userId, password: deviceA.user.password })
      .expect(200)
    const out = await deviceA.agent.post(LOGOUT).expect(200)
    expect(cookieLine(out, 'admin_at')).toContain('Expires=Thu, 01 Jan 1970')
    expect(cookieLine(out, 'admin_rt')).toContain('Expires=Thu, 01 Jan 1970')
    expectError(
      await request(server()).post(REFRESH).set('Cookie', `admin_rt=${deviceA.refresh}`),
      401,
      CommonErrorCodes.ERR_INVALID_TOKEN,
      AUTH_MESSAGES.refreshEnded,
    )
    await deviceB.get(ME).expect(200)
  })
})

describe('IP 자리(2f)', () => {
  it('🔴 정책이 거부하면 로그인은 비밀번호가 맞은 뒤에만 403 + details.clientIp', async () => {
    const user = await seedUser(t.db, { roleNo: readerRole })
    policy.allow = false
    expectError(
      await request(server()).post(LOGIN).send({ userId: user.userId, password: 'wrong-pass' }),
      401,
      CommonErrorCodes.ERR_LOGIN_FAILED,
    )
    const blocked = await request(server())
      .post(LOGIN)
      .send({ userId: user.userId, password: user.password })
    expectError(blocked, 403, CommonErrorCodes.ERR_IP_NOT_ALLOWED, AUTH_MESSAGES.ipNotAllowed)
    expect(typeof blocked.body.details.clientIp).toBe('string')
  })

  it('로그인 뒤 막히면 가드가 403 + access.blocked:ip 이벤트', async () => {
    const { agent } = await signIn()
    policy.allow = false
    const blocked = await agent.get(ME)
    expectError(blocked, 403, CommonErrorCodes.ERR_IP_NOT_ALLOWED)
    expect(typeof blocked.body.details.clientIp).toBe('string')
    expect(events.types()).toContain('access.blocked:ip')
  })
})
```

- [ ] **Step 2: 돌린다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/auth.http.db.test.ts`
Expected: PASS(22 tests). 실패하면 원인 Task 의 코드를 고친다(이 파일의 기대를 낮추지 않는다). 고친 것은 스펙 §14 에 R 항목으로 적는다.

- [ ] **Step 3: 전체 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/auth/auth.http.db.test.ts
pnpm check
pnpm test:db
git add packages/admin-server/src/auth/auth.http.db.test.ts
git commit -m "$(cat <<'EOF'
test(admin-server): 인증 HTTP 계약을 실 MariaDB 로 — 로그인 · 회전 · 재사용 · 잠금 · 강제 변경

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: 쓰는 쪽 스모크 · README · changeset · 진행 문서

**Files:**

- Modify: `packages/admin-server/README.md`
- Create: `.changeset/admin-server-auth.md`
- Modify: `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`
- Create(저장소 밖): `$TEMP/akss/` 아래 앱 파일들

- [ ] **Step 1: README 를 고친다**

`packages/admin-server/README.md` 둘째 단락(`지금(PR 2a) 들어 있는 것은 …`)을 바꾼다:

```md
지금 들어 있는 것은 응답 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 스키마 7장(PR 2a)과 관리자 인증(PR 2b — 로그인 · refresh 회전 · 가드 · 재인증)이다. 세션 목록 · 감사 · 사용자 · 역할 · 팀 · 약관 · IP 접근 제어는 다음 PR 에서 붙는다 — 지도는 저장소 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1.
```

"## 환경 변수" 표 끝에 한 줄을 더한다(패키지가 읽는 이름이 아니라 예시 — 표 아래 문장으로 그렇게 적는다):

```md
| `ADMIN_JWT_SECRET` | 예 | | 액세스 토큰 HS256 비밀키(32자 이상). 🔴 패키지가 직접 읽지 않는다 — `auth.jwtSecret` 으로 넘기는 예시 이름 |
```

"## 코어 스키마와 내 테이블" 절 다음에 "## 인증" 절을 더한다:

````md
## 인증

`AdminAuthModule` 을 import 하면 관리자 인증이 켜진다 — `/api/admin/auth/*` 라우트와 **앱 전역** 인증 · 권한 가드.

```ts
// src/app.module.ts
@Module({
  imports: [
    AdminServerModule.forRootAsync({
      useFactory: () => {
        requireEnv(['ADMIN_JWT_SECRET'])
        return {
          db: adminDbConnectionFromEnv(),
          auth: { jwtSecret: process.env.ADMIN_JWT_SECRET! }, // 🔴 32자 이상 — 짧으면 기동에서 멈춘다
          passwordPolicy, // admin-shared definePasswordPolicy() — 화면과 같이 쓴다. 생략하면 8 · 200
        }
      },
    }),
    AdminAuthModule, // 사용자 테이블 컬럼이 다르면 AdminAuthModule.withRepository(MyAuthRepository, { imports })
  ],
})
export class AppModule {}
```

| 라우트                 | 표시        | 본문 → 응답                                                                                                  |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `POST /auth/login`     | 공개        | `{ userId, password }` → 쿠키 둘, `data: null`                                                               |
| `POST /auth/refresh`   | 공개        | refresh 쿠키 → 쿠키 둘(회전), `data: null`                                                                   |
| `POST /auth/logout`    | 공개        | refresh 쿠키 → 두 쿠키를 지운다(늘 200)                                                                      |
| `GET /auth/me`         | `@SelfOnly` | `{ userNo, userId, userName, roleNo, roleName, teamNo?, teamName?, permissions, isPasswordChangeRequired }`  |
| `PATCH /auth/password` | `@SelfOnly` | `{ currentPassword, newPassword }`(`passwordPolicy.changePasswordSchema`) → `data: null`, 다른 세션을 끊는다 |

### 🔴 가드는 앱 전역이다

- 관리자 밖 컨트롤러(회원 · 공개 · 헬스체크 · 웹훅)는 클래스에 `@Public()` 을 붙인다. 안 붙이면 401 이다 — 구멍이 아니라 고장으로 드러난다.
- 관리자 라우트는 권한을 선언한다: `@RequirePermissions(...)`(AND) · `@RequireAnyPermissions(...)`(OR) · `@SelfOnly()`(인증만). 🔴 선언이 없으면 403(fail-closed) — `'*'` 권한도 막는다. 선언한 권한은 클래스 `@SelfOnly` 보다 우선한다. crm · axion 이식 과도기에만 `auth.failClosed: false`.
- 프로젝트 권한 타입으로 좁히려면 감싼다: `export const Require = (...p: Permission[]) => RequirePermissions(...p)`.
- 주체는 `@CurrentAdmin()`(`AdminPrincipal`) 으로 받는다 — `req.admin` 에 있어 회원 인증(passport)의 `req.user` 와 갈린다. 인터셉터에서는 `getAdminPrincipal(req)`.
- HTTP 가 아닌 컨텍스트(마이크로서비스 · WebSocket)는 가드가 지나친다.

### 토큰 · 쿠키

- 액세스 = JWT HS256 15분, refresh = 512비트 난수 7일(DB 에는 sha256 만, 회전마다 새로). 둘 다 httpOnly 쿠키 `admin_at` · `admin_rt`, `Path=/`, `SameSite=Lax`.
- Secure 는 `'auto'` — `req.secure` 또는 `X-Forwarded-Proto` 첫 값이 https 또는 `NODE_ENV=production`. 🔴 http 개발 서버를 `NODE_ENV=production` 으로 띄우면 브라우저가 쿠키를 버린다 — admin-ui 스토어가 `SessionNotEstablishedError` 로 알린다.
- 옵션: `auth.accessTtlMs` · `refreshTtlMs` · `refreshGraceMs`(기본 30 000, 0 이면 끔) · `lockout: { maxFailures, lockMs }` · `cookies: { accessName, refreshName, refreshPath, sameSite, secure, domain }`.
- 회전된 refresh 가 다시 오면 그 사용자의 세션을 전부 끊는다(재사용 탐지, 401 `ERR_REFRESH_REUSED`). 30초 유예창 안에서 다른 탭이 늦게 낸 같은 토큰은 새 세션을 하나 더 준다.

### 로그인 판정 · 강제 변경 · 재인증

- 비밀번호가 먼저다 — 틀리면 언제나 401 `ERR_LOGIN_FAILED`(없는 아이디 · 퇴사 · 잠긴 계정도 같은 응답). 맞으면 퇴사 403 → IP 403 → 잠김 423 순서. 5회 틀리면 15분 잠긴다 — 로그인 · 비밀번호 변경 · 재인증이 한 카운터를 쓴다.
- 퇴사: `users.resignAt` 은 **효력 시각**이다 — 그 시각부터 로그인 · 요청 · 갱신이 403 `ERR_RESIGNED_USER`. "퇴사일 당일까지 근무" 는 쓸 때 다음 날 0시(기준 시간대)로 바꿔 넣는다.
- 강제 변경(`isPasswordChangeRequired`): 로그인은 되고 `/me` 가 `permissions: []` 와 플래그를 낸다. 그 밖의 라우트는 403 `ERR_PASSWORD_CHANGE_REQUIRED`. admin-ui `createAdminGuard({ isPasswordChangeRequired })` 가 변경 화면으로 보낸다.
- 민감 작업 재인증: 서비스 진입부에서 `await reauth.verify(admin, body.currentPassword)`(`AdminReauthService`, 틀리면 403 `ERR_REAUTH_REQUIRED`). 🔴 트랜잭션 안에서 부르지 않는다.
- 로그인 시도 제한(IP 단위)은 쓰는 쪽이 edge(nginx) · `@nestjs/throttler` 로 건다. 패키지는 계정 잠금과 argon2 비용을 맡는다.

### 사용자 테이블이 다를 때

컬럼 매핑 옵션은 없다. `AdminAuthRepository` 다섯 메서드를 구현해 바꾼다.

```ts
@Injectable()
class MyAuthRepository implements AdminAuthRepository {
  // findCredentialByUserId · findCredentialByNo · findPrincipal · saveLoginState · changePassword
  // 예: isActive 컬럼이면 resignAt: row.isActive ? null : new Date(0)
}

AdminAuthModule.withRepository(MyAuthRepository, { imports: [MyUsersDataModule] })
```

### 시드 · 2c · 2f 자리

- 첫 관리자는 `@ssworks/admin-server/runner` 의 `hashPassword` 로 만든다(Nest 없이).
- `ADMIN_AUTH_EVENTS`(로그인 · 갱신 · 재사용 · 로그아웃 · 비밀번호 변경 이벤트) · `ADMIN_ACCESS_POLICY`(IP 판정)를 전역 모듈이 제공하면 인증이 부른다. 패키지의 감사(2c) · IP 접근 제어(2f) 모듈이 채운다.
````

"## admin-ui 와 맞물리기" 절의 코드 블록 다음 문단을 바꾼다:

```md
봉투(`envelope: 'success-data'`)와 bigint 코덱은 admin-ui 기본값과 같다. 오류 `code` · `details.issues` 는 `ApiError` · `toFieldErrors` 가 그대로 읽는다. 스토어는 `fetchMe: () => api.get('/auth/me')` · `login: (c) => api.post('/auth/login', c)` · `logout: () => api.post('/auth/logout')`, 강제 변경은 `createAdminGuard({ isPasswordChangeRequired: () => store.userInfo?.isPasswordChangeRequired === true })`, IP 차단은 `onError` 에서 `ERR_IP_NOT_ALLOWED` 와 `details.clientIp`(admin-ui README).
```

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-auth.md`:

```md
---
'@ssworks/admin-server': minor
---

**쓰는 쪽이 할 일:** `AdminServerModule.forRootAsync` 의 `useFactory` 에 `auth: { jwtSecret }`(32자 이상 — 보통 `ADMIN_JWT_SECRET`)과 선택 `passwordPolicy` 를 더하고 `AdminAuthModule` 을 import 한다. 🔴 인증 · 권한 가드가 **앱 전역**이다 — 관리자가 아닌 컨트롤러(회원 · 공개 · 헬스체크 · 웹훅)에 `@Public()` 을 붙인다(안 붙이면 401). 관리자 라우트는 `@RequirePermissions` · `@RequireAnyPermissions` · `@SelfOnly` 중 하나를 선언한다(없으면 403). `users.resignAt` 은 퇴사 **효력 시각**으로 쓴다.

admin-server 인증(Phase 2 PR 2b): `AdminAuthModule`(+`withRepository`) — `/admin/auth/{login,refresh,logout,me,password}`, argon2id 비밀번호, JWT 액세스(HS256 · 15분) + sha256 저장 refresh 회전(7일), 재사용 탐지(30초 유예창), 계정 잠금(5회 · 15분, 로그인 · 변경 · 재인증 공용), 퇴사 · 강제 변경, fail-closed 권한 가드와 데코레이터(`@Public` · `@SelfOnly` · `@RequirePermissions` · `@RequireAnyPermissions` · `@CurrentAdmin`), `AdminReauthService`, `AUTH_REPOSITORY` · `KyselyAuthRepository`, 선택 주입 `ADMIN_ACCESS_POLICY` · `ADMIN_AUTH_EVENTS`. 러너 진입점에 `hashPassword` · `verifyPassword`. 새 dependencies `@nestjs/jwt` · `@node-rs/argon2`. 아직 `private` 이라 npm 에 나가지 않는다.
```

- [ ] **Step 3: tarball 을 만들고 스모크 앱을 쓴다**

```bash
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server build
mkdir -p "$TEMP/akss"
pnpm --filter @ssworks/admin-shared pack --pack-destination "$TEMP/akss"
pnpm --filter @ssworks/admin-server pack --pack-destination "$TEMP/akss"
ls "$TEMP/akss"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -c "package/dist/auth/.*[.]js$"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "test-support|[.]test[.]js"
```

Expected: tarball 둘(`…-0.3.0.tgz`). `dist/auth/*.js` 가 18개 안팎, 두 번째 grep 은 아무것도 내지 않는다. 아래 `package.json` 의 파일 이름을 실제 이름으로 맞춘다.

`$TEMP/akss/package.json`:

```json
{
  "name": "akss",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@kim5257/kysely-mariadb-dialect": "^0.2.0",
    "@nestjs/common": "^12.1.2",
    "@nestjs/core": "^12.1.2",
    "@nestjs/platform-express": "^12.1.2",
    "@ssworks/admin-server": "file:./ssworks-admin-server-0.3.0.tgz",
    "@ssworks/admin-shared": "file:./ssworks-admin-shared-0.3.0.tgz",
    "kysely": "^0.29.6",
    "mariadb": "^3.5.4",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^24.0.0",
    "kysely-ctl": "^0.21.0",
    "typescript": "~5.9.2"
  }
}
```

`$TEMP/akss/tsconfig.json`: 2a 스모크와 같다(`module` · `moduleResolution` `NodeNext`, `strict`, `skipLibCheck: false`, `experimentalDecorators` · `emitDecoratorMetadata`, `outDir: dist`, `rootDir: src`, `types: ["node"]`).

`$TEMP/akss/.env`:

```
DB_HOST=127.0.0.1
DB_PORT=33306
DB_USER=root
DB_PASSWORD=admin-kit-test
DB_NAME=akss
ADMIN_JWT_SECRET=akss-smoke-jwt-secret-0123456789abcdef
```

`$TEMP/akss/kysely.config.ts` 와 `src/migrations/` 의 스텁 7개(`001_admin_roles.ts` … `007_admin_sessions.ts`)는 2a 스모크(2a 플랜 Task 11 Step 2)와 같다. 프로젝트 장(`100_posts.ts`)은 두지 않는다.

`$TEMP/akss/src/seed.ts`:

```ts
import {
  adminDbConnectionFromEnv,
  assertUtcTimezone,
  createAdminKysely,
  hashPassword,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

// 시드는 러너만 쓴다 — Nest 를 싣지 않는다(스펙 B5).
loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('seed')
const db = createAdminKysely(adminDbConnectionFromEnv())
try {
  const role = await db
    .insertInto('roles')
    .values({ roleName: '최고 관리자', permissions: JSON.stringify(['*']) })
    .executeTakeFirstOrThrow()
  await db
    .insertInto('users')
    .values({
      userId: 'admin',
      password: await hashPassword('smoke-pass-1234'),
      userName: '관리자',
      roleNo: role.insertId as bigint,
    })
    .execute()
} finally {
  await db.destroy()
}
```

`$TEMP/akss/src/app.module.ts`:

```ts
import { Controller, Get, Module } from '@nestjs/common'
import {
  AdminAuthModule,
  AdminServerModule,
  Public,
  RequirePermissions,
  adminDbConnectionFromEnv,
  requireEnv,
} from '@ssworks/admin-server'

@Public()
@Controller('health')
class HealthController {
  @Get()
  ok() {
    return { ok: true }
  }
}

@Controller('posts')
class PostsController {
  @Get()
  undeclared() {
    return { items: [] }
  }

  @RequirePermissions('post:read')
  @Get('guarded')
  guarded() {
    return { ok: true }
  }
}

@Module({
  imports: [
    AdminServerModule.forRootAsync({
      useFactory: () => {
        requireEnv(['ADMIN_JWT_SECRET'])
        return {
          db: adminDbConnectionFromEnv(),
          auth: { jwtSecret: process.env.ADMIN_JWT_SECRET! },
        }
      },
    }),
    AdminAuthModule,
  ],
  controllers: [HealthController, PostsController],
})
export class AppModule {}
```

`$TEMP/akss/src/main.ts`: 2a 스모크와 같다(`loadDotEnv` → `assertUtcTimezone` → `NestFactory.create` → `configureAdminApp` → `setGlobalPrefix('api')` → `enableShutdownHooks` → `listen(4100)`).

`$TEMP/akss/check.mjs`:

```js
const base = 'http://127.0.0.1:4100/api'

async function send(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const cookies = Object.fromEntries(
    response.headers.getSetCookie().map((line) => {
      const pair = line.split(';')[0]
      const index = pair.indexOf('=')
      return [pair.slice(0, index), pair.slice(index + 1)]
    }),
  )
  return { status: response.status, text: await response.text(), cookies }
}

function show(label, result) {
  console.log(label, result.status, result.text)
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${base}/health`)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error('서버가 뜨지 않았다 — server.log 를 본다')
}

await waitForServer()
show('health', await send('/health'))
show('posts-anonymous', await send('/posts'))
show(
  'login-wrong',
  await send('/admin/auth/login', { method: 'POST', body: { userId: 'admin', password: 'nope' } }),
)
const login = await send('/admin/auth/login', {
  method: 'POST',
  body: { userId: 'admin', password: 'smoke-pass-1234' },
})
show('login', login)
console.log('cookies', Object.keys(login.cookies))
const first = `admin_at=${login.cookies.admin_at}; admin_rt=${login.cookies.admin_rt}`
show('me', await send('/admin/auth/me', { cookie: first }))
show('posts-undeclared', await send('/posts', { cookie: first }))
show('posts-guarded', await send('/posts/guarded', { cookie: first }))
const rotated = await send('/admin/auth/refresh', { method: 'POST', cookie: first })
show('refresh', rotated)
const second = `admin_at=${rotated.cookies.admin_at}; admin_rt=${rotated.cookies.admin_rt}`
show('me-after-refresh', await send('/admin/auth/me', { cookie: second }))
show(
  'old-refresh-in-grace',
  await send('/admin/auth/refresh', {
    method: 'POST',
    cookie: `admin_rt=${login.cookies.admin_rt}`,
  }),
)
console.log('31초 기다린다 — 유예창 밖')
await new Promise((resolve) => setTimeout(resolve, 31_000))
show(
  'old-refresh-reused',
  await send('/admin/auth/refresh', {
    method: 'POST',
    cookie: `admin_rt=${login.cookies.admin_rt}`,
  }),
)
show('me-after-reuse', await send('/admin/auth/me', { cookie: second }))
show('logout', await send('/admin/auth/logout', { method: 'POST', cookie: second }))
```

- [ ] **Step 4: 설치 · 빌드 · 마이그레이션 · 시드**

```bash
cd "$TEMP/akss"
pnpm install
pnpm build
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists akss; create database akss"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
```

Expected: 설치 성공 — `@nestjs/jwt` · `@node-rs/argon2` 가 admin-server 의 dependencies 로 따라 들어온다(쓰는 쪽 package.json 에 없다). `tsc` 는 2a 때의 제3자 d.ts 6건 말고는 오류가 없다(있으면 내용을 기록하고 `skipLibCheck: true` 로 한 번 더 돌려 패키지 쪽 오류가 없음을 확인한다). 마이그레이션 7장 · 시드 성공.

- [ ] **Step 5: 기동 · 요청**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected(본문은 줄여 적는다):

- `health 200 {"success":true,"data":{"ok":true}}` — `@Public` 컨트롤러
- `posts-anonymous 401 {"success":false,"code":"ERR_COMMON_UNAUTHORIZED",…}` — 🔴 앱 전역 가드
- `login-wrong 401 {…"code":"ERR_LOGIN_FAILED"…}`
- `login 200 {"success":true,"data":null}` · `cookies [ 'admin_at', 'admin_rt' ]`
- `me 200 {"success":true,"data":{"userNo":"BigInt(1)","userId":"admin","userName":"관리자","roleNo":"BigInt(1)","roleName":"최고 관리자","permissions":["*"],"isPasswordChangeRequired":false}}`
- `posts-undeclared 403 {…"code":"ERR_COMMON_FORBIDDEN","message":"이 기능에 접근할 수 없습니다.",…}` — fail-closed(`'*'` 도)
- `posts-guarded 200`
- `refresh 200` · `me-after-refresh 200`
- `old-refresh-in-grace 200` — 유예창
- `old-refresh-reused 401 {…"code":"ERR_REFRESH_REUSED"…}` — 🔴 재사용 탐지
- `me-after-reuse 401 {…"code":"ERR_INVALID_TOKEN"…}` — 전 세션 폐기
- `logout 200 {"success":true,"data":null}`

`check.mjs` 가 "서버가 뜨지 않았다" 로 끝나면 `server.log` 를 본다. 셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
```

- [ ] **Step 7: 진행 문서를 고친다**

숫자(N · M)는 저장소 루트에서 `pnpm check` · `pnpm test:db` 를 돌린 결과로 채운다(admin-server 프로젝트의 테스트 수 · DB 테스트 수, 워크스페이스 합계). 아래 블록의 글은 그대로 옮긴다 — 역따옴표 앞에 아무것도 붙이지 않는다.

**`docs/01-phase0.md`**

① §2-3 의 `> **Phase 2 경계 결정 (2026-10-08)** — …` 단락 바로 아래에 빈 줄을 두고 더한다:

```md
> **PR 2b 경계 결정 (2026-10-09)** — JWT 는 `@nestjs/jwt`(dependencies), 인증 · 권한 가드는 앱 전역(관리자 밖은 `@Public`), refresh 유예창 기본 30초(0 이면 끔), `users.resignAt` 은 퇴사 효력 시각, `AUTH_REPOSITORY` 는 사용자 쪽 다섯 메서드(세션은 패키지 내부), 값은 코어 옵션 · 리포지토리 교체만 `AdminAuthModule.withRepository`, 주체는 `@CurrentAdmin`(`req.admin`), IP · 감사는 선택 주입 토큰, 쿠키 `admin_at` · `admin_rt`(`Path=/`). 근거: `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` §2.
```

② §3-2 표에서 첫 칸이 `auth: { repository?` · `cookies: { accessName` · `permissions: { catalog` 로 시작하는 세 행을 이 셋으로 바꾼다:

```md
| `auth: { jwtSecret(32자 하한), accessTtlMs, refreshTtlMs, refreshGraceMs, lockout, cookies, failClosed }` + 코어 `passwordPolicy`. 리포지토리 교체는 `AdminAuthModule.withRepository`(2b) | 15분 · 7일 · 30초(0=끔) · 5회/15분 · `failClosed: true` | 1h vs 15m, 유예창, 잠금 유무. 회전 · 재사용 시 전량 폐기 · 로그인 실패 401 · 세션 소유 대조 · 로그아웃 `@Public` 은 고정 동작이다(옵션 아님 — 2b 스펙 §2). `principalMapper` 는 없다(`/me` 고정, 프로젝트 필드는 자기 라우트) |
| `auth.cookies: { accessName, refreshName, refreshPath, sameSite, secure, domain }` | `admin_at` · `admin_rt` · `'/'` · `'lax'` · `'auto'`(req.secure ‖ X-Forwarded-Proto ‖ NODE_ENV=production) | 이름 · path · strict/lax · secure 판정식 |
| `auth.failClosed`(기본 true) — 권한 카탈로그 · `normalize` 는 2d, `selfOnlyKey` · `extraGuards` 는 두지 않는다(`@SelfOnly` 고정, 추가 가드는 쓰는 쪽 `APP_GUARD`) | fail-closed | fail-open(crm/axion) 과도기 |
```

③ §8 표의 `@ssworks/admin-server` 행 상태 칸 끝(`… 다음 2b 인증`)을 이렇게 바꾼다:

```md
… 다음 2b 인증. **PR 2b 완료**(브랜치 `feat/admin-server-auth`) — `AdminAuthModule` · 앱 전역 인증 · 권한 가드 · refresh 회전 · 재사용 탐지(유예창) · 계정 잠금 · 강제 변경 · 재인증. N 테스트 + 실 MariaDB M. 스펙 `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` · 플랜 `docs/superpowers/plans/2026-10-13-admin-server-auth.md`. 다음 2c 세션 · 감사
```

④ 표 아래 `다음: Phase 2 PR 2b 인증(2a 스펙 §1-3).` 을 바꾼다:

```md
다음: Phase 2 PR 2c 세션 · 감사(2a 스펙 §1-3 의 2c 행 · 2b 스펙 §4-6 · §11).
```

**`docs/HANDOFF.md`**

① 머리 `# HANDOFF — 2026-10-08` 의 날짜를 오늘로 바꾼다.

② "지금 상태" 표 `@ssworks/admin-server` 행을 이 글로 바꾼다:

```md
| `@ssworks/admin-server` | Phase 2 진행. **PR 2a**(기반 · 코어 스키마)는 `main` 에 병합 · push 됐다(Version Packages PR #2 머지 2026-10-09, 0.3.0). **PR 2b**(인증 — `AdminAuthModule` · 앱 전역 인증 · 권한 가드 · refresh 회전 · 재사용 탐지 · 계정 잠금 · 강제 변경 · 재인증)는 `feat/admin-server-auth` 에서 구현 완료. N 테스트 + 실 MariaDB M. 아직 `private: true`(첫 발행은 Phase 2 끝 — 결정 ⑥ V1). 지도는 2a 스펙 §1 |
```

③ "검증" 행 끝에 한 문장을 더한다(실제 결과로 적는다):

```md
PR 2b 는 Windows 에서 pnpm check · pnpm test:db 초록, 쓰는 쪽 스모크($TEMP/akss — 스텁 7 → 시드(runner hashPassword) → 기동 → 로그인 · 쿠키 · /me · 회전 · 유예 · 재사용 탐지 · 로그아웃, @Public 밖 401 · 선언 없음 403)를 통과했다.
```

④ "다음 플랜" 행의 내용 칸을 바꾼다:

```md
Phase 2 PR 2c 세션 · 감사 — 스펙부터(2a 스펙 §1-3 의 2c 행 · 2b 스펙 §4-6 `ADMIN_AUTH_EVENTS` · §11 · 3c §9 세션 6라우트). 직전 PR 2b: 스펙 docs/superpowers/specs/2026-10-13-admin-server-auth-design.md · 플랜 docs/superpowers/plans/2026-10-13-admin-server-auth.md
```

⑤ "발행 전에 사람이 해야 하는 것" 의 `- **Version Packages PR #2(0.3.0)는 2a 를 main 에 넣기 전에 머지한다**(Phase 2 결정 ⓪ M1).` 을 바꾼다:

```md
- ~~**Version Packages PR #2(0.3.0)는 2a 를 main 에 넣기 전에 머지한다**(Phase 2 결정 ⓪ M1).~~ — 머지됨(2026-10-09).
```

⑥ "알려진 미확인 · 보류" 의 "PR 2a 최종 리뷰가 넘긴 것" 에서 `- 2b: cookie-parser 는` 로 시작하는 줄 끝에 ` → **2b 에서 닫음**(`readCookie`, 2b 스펙 §5-6).` 을, `- 2b~2f: 새 장 id 에` 로 시작하는 줄 끝에 ` → 2b 는 장을 더하지 않았다 — 숫자 든 장을 더하는 PR 이 한다.` 를 덧붙인다. 그 항목 다음에 새 항목을 더한다:

```md
- **PR 2b 가 넘긴 것(2026-10-13)**
  - 2c: `AdminSessionStore` 에 목록 메서드를 더하고 `ADMIN_AUTH_EVENTS` 를 제공한다. 감사 행을 비밀번호 변경과 같은 트랜잭션에 쓸지 정한다(2b 는 커밋 뒤에 이벤트를 낸다 — 스펙 B8).
  - 2d: `resignAt` 효력 시각 계산("퇴사일 당일까지 근무" · 기준 시간대), 비밀번호 변경이 `users.revision` 을 올리는지(B9), 재인증(`AdminReauthService`)을 붙일 쓰기.
  - 2f: `ADMIN_ACCESS_POLICY` 구현과 `clientIp` 출처(trust proxy · X-Real-IP 우선).
```

**`CLAUDE.md`**

① 패키지 표 `packages/admin-server` 행의 `(Phase 2 진행 — 2a 기반 · 코어 스키마 완료)` 를 `(Phase 2 진행 — 2a 기반 · 2b 인증 완료)` 로.

② "`@ssworks/admin-server` (Phase 2)" 규약 절 끝에 두 줄을 더한다:

```md
- 인증 · 권한 가드는 **앱 전역**(`AdminAuthModule` 의 `APP_GUARD`)이다. 관리자 밖 컨트롤러는 `@Public()`, 관리자 라우트는 `@RequirePermissions` · `@RequireAnyPermissions` · `@SelfOnly` 중 하나를 선언한다 — 없으면 403(fail-closed).
- argon2(`hashPassword` · `verifyPassword` · 재인증)는 트랜잭션 밖에서만 부른다. 인증 문구는 `auth/errors.ts` 의 `AUTH_MESSAGES` 하나에서 가져온다.
```

③ 진행 표의 `| **Phase 2 PR 2b — 인증** | **다음** | 2a 스펙 §1-3 |` 행을 두 행으로 바꾼다:

```md
| Phase 2 PR 2b — 인증(`AdminAuthModule` · 앱 전역 가드 · 회전 · 재사용 탐지 · 잠금 · 재인증) | 완료 | 스펙 `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` · 플랜 `docs/superpowers/plans/2026-10-13-admin-server-auth.md` |
| **Phase 2 PR 2c — 세션 · 감사** | **다음** | 2a 스펙 §1-3 · 2b 스펙 §4-6 · §11 |
```

- [ ] **Step 8: 최종 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md .changeset/admin-server-auth.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md
node -e "for (const f of ['packages/admin-server/README.md','.changeset/admin-server-auth.md','docs/01-phase0.md','docs/HANDOFF.md','CLAUDE.md']) { const s = require('fs').readFileSync(f, 'utf8'); console.log(f, s.includes(String.fromCharCode(92, 96)) ? '역슬래시+역따옴표 있음 — 고친다' : 'ok') }"
pnpm check
pnpm test:db
pnpm format:check
git status --short
```

Expected: 다섯 파일 모두 `ok`(지시를 옮기다 생긴 역슬래시 + 역따옴표가 없다). `pnpm check` · `pnpm test:db` · `pnpm format:check` 초록. `git status` 에 `NUL` 이나 의도하지 않은 파일이 없다.

```bash
git add packages/admin-server/README.md .changeset/admin-server-auth.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: PR 2b 인증 — README 인증 절 · changeset · 진행 문서, 다음 플랜은 2c

쓰는 쪽 스모크: 로그인 → 쿠키 → /me → 회전 → 유예 → 재사용 탐지 → 로그아웃.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: 마무리 확인**

`superpowers:finishing-a-development-branch` 로 사용자에게 머지 방식을 묻는다. push 는 사람이 한다.

---

## 스펙 대조표 (자체 검토)

| 스펙                                                                                      | Task                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| §1 끝 상태(로그인 → 쿠키 → /me → 회전 → 재사용 · 423 · 401 · 만료 · 403 · 강제 변경 · W1) | Task 12 · 13(스모크)                       |
| ① J1 `@nestjs/jwt` dependencies                                                           | Task 1(의존성) · Task 4                    |
| ② G1 앱 전역 가드 · `@Public`                                                             | Task 7 · 11(HTTP) · 12 · 13(스모크)        |
| ③ W1 유예창 · P1 재조회 · grace 0                                                         | Task 2 · 6 · 9 · 12                        |
| ④ R1 `resignAt` 효력 시각                                                                 | Task 2 · 5(주석) · 8 · 9 · 12              |
| ⑤ A1 리포지토리 다섯 · 세션 내부                                                          | Task 5 · 6                                 |
| ⑥ O1 코어 옵션 · `withRepository`                                                         | Task 3 · 11                                |
| ⑦ N1 이름 · `req.admin` · 메타 키 접두                                                    | Task 7 · 11                                |
| ⑧ H1 선택 주입 토큰                                                                       | Task 7 · 8 · 9 · 10 · 11(전역 모듈) · 12   |
| ⑨ C1 쿠키 기본값 · Secure auto                                                            | Task 3 · 11 · 12                           |
| ⑩ S1 한 PR                                                                                | 이 플랜                                    |
| B1 `findCredentialByNo`                                                                   | Task 5 · 10                                |
| B2 카운터 공용                                                                            | Task 8(`password-check`) · 10              |
| B3 회전 한 트랜잭션                                                                       | Task 6                                     |
| B4 null 링크 → 재사용                                                                     | Task 2                                     |
| B5 러너 `hashPassword`                                                                    | Task 1 · 13(시드)                          |
| B6 `CUSTOM_AUTH_REPOSITORY` 팩토리                                                        | Task 11                                    |
| B7 정책 boolean · 패키지가 403                                                            | Task 7 · 8 · 12                            |
| B8 이벤트 실패 무시 · 커밋 뒤                                                             | Task 8 · 10                                |
| B9 revision 안 건드림                                                                     | Task 5(`changePassword` 의 set 목록)       |
| §4-5 `/me` 모양                                                                           | Task 7 · 12                                |
| §4-9 라우트 · 본문 파이프                                                                 | Task 11                                    |
| §5-5 시계 경계                                                                            | Task 2(단위) · 4(JWT exp) · 12(±2초)       |
| §5-6 쿠키 · `j:` · 메타 자르기                                                            | Task 3 · 6 · 11                            |
| §6 오류 표                                                                                | Task 7 · 8 · 9 · 10 · 11 · 12              |
| §9-1 단위                                                                                 | Task 1 · 2 · 3 · 4 · 7                     |
| §9-2 DB 없는 HTTP · 기동 검사                                                             | Task 11                                    |
| §9-3 실 MariaDB                                                                           | Task 5 · 6 · 8 · 9 · 10 · 12               |
| §9-4 리뷰 초점 다섯                                                                       | Task 2 · 4 · 6 · 9 · 12(아래 Review Focus) |
| §10 changeset · README · 진행 문서                                                        | Task 13                                    |
| §13 선행 문서 정정(`resignAt` 주석)                                                       | Task 5                                     |
| §14 R1~R6                                                                                 | 플랜 전 실측 · Task 6 · 7 · 8 · 11         |
| Review Focus 1~5                                                                          | Task 5 · 8 · 6 · 12 · 12                   |
