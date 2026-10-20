# 전권 전용 · 서버 문구(PR 2g) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ringside 둘째 보고의 서버 몫 둘 — R3 "`ipAccess.manage` 는 전체 권한 관리자에게만"을 킷이 강제하고(카탈로그 `fullAccessOnly`), R2 서버 오류 문구를 앱 용어로 덮게 한다(`AdminServerModule` 옵션 `messages`).

**Architecture:** R3 은 admin-shared `definePermissions` 에 `fullAccessOnly` 를 더해 서버와 화면이 표 하나를 쓴다. admin-server 는 순수 함수 둘(`assertFullAccessOnly` — 역할 만들기 · 권한 수정의 400, `assertIpManageFullAccessOnly` — IP 모듈을 켠 앱의 기동 검사)을 `accounts/full-access.ts` 에 두고 역할 서비스 · 모듈이 부른다. admin-ui `useRoleEditor` 는 표시된 칸을 "켜져 있을 때만" 고를 수 있게 한다. R2 는 `http/messages.ts` 가 서버 문구 표 여덟을 묶고(`ADMIN_SERVER_DEFAULT_MESSAGES`), 기동 때 "기본 글자 → 덮을 글자" 표를 만들어(`resolveAdminMessages`) 예외 필터 한 곳이 4xx 본문에 적용한다(`applyMessageOverrides`). 문구를 쓰는 곳은 고치지 않는다.

**Tech Stack:** NestJS 12 · Kysely 0.29 · MariaDB 11.4 / 12.3 · zod 4 · TypeScript 6 · Vitest 5 · Vue 3.5 · Vuetify 4.2

**Spec:** `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md` — 결정 ②~⑤ · M1–M10 · F1–F10 · §3-2~§3-4 · §5-2 · §6-2 · §7 · §8 · §9. 실행자는 스펙과 함께 읽는다. 입력 보고서는 `docs/reports/2026-10-20-admin-kit-report.md`. PR #3i(admin-ui 다섯 항목)는 먼저 `main` 에 들어가 있다(플랜 `docs/superpowers/plans/2026-10-20-admin-ui-ringside-feedback-2.md`).

## Global Constraints

- 브랜치 `feat/admin-kit-full-access-messages` — PR #3i 가 로컬 병합된 `main` 에서 갈라진다. `main` 에 직접 커밋하지 않는다. `.claude/settings.json` 의 로컬 변경은 커밋하지 않는다 — `git add` 는 파일을 이름으로 적는다.
- 🔴 **admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build`** — admin-server · admin-ui 는 admin-shared 를 `dist/` 로 import 한다. Task 1 끝에서 빌드하고, 그 뒤 Task 들이 새 필드를 본다.
- 새 의존을 더하지 않는다. admin-server peer `@ssworks/admin-shared` 는 `workspace:>=0.9.0 <1.0.0` 로 올린다(Task 2 — F7). admin-ui peer 는 그대로(F9).
- 템플릿(`../kim5257-project-template`) · ringside 는 읽기만 한다.
- admin-server: ESM · `NodeNext` · 내부 상대 import 는 `.js`. 데코레이터가 붙은 시그니처의 인터페이스 · 타입 별칭은 `import type`, DI 로 받는 클래스는 일반 import. `console.log` 금지(`Logger` 는 `warn` · `error`).
- admin-shared: `vue` · `vuetify` · `@nestjs/*` · `node:*` · `axios` 를 import 하지 않는다(eslint). 키를 하드코딩하지 않는다.
- admin-ui: 스토어 · 라우터를 import 하지 않는다. `data-testid` 를 심지 않는다.
- 🔴 **코드 · 정규식 · 명령에 백슬래시를 쓰지 않는다** — 도구 입력의 이스케이프가 풀려 글자가 바뀐다. 줄바꿈은 `String.fromCharCode(10)`, 점은 `[.]`. 백슬래시가 들어간 편집을 했다면 node 로 바이트를 확인한다.
- 바꾸는 파일의 머리 주석(정본 · 바꾼 점)에 2g 변경을 한 줄 더한다. `🔴` 주석은 "지우면 사고가 나는 이유"다.
- 새 문구는 이 플랜에 적힌 글자 그대로다 — `ACCOUNT_MESSAGES.fullAccessOnly` = '전체 권한 역할만 가질 수 있는 권한이 들어 있습니다.'
- 명령은 저장소 루트에서: 파일 하나 `pnpm --filter <패키지> exec vitest run <src 기준 경로>`, 실 DB 파일 하나 `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts <src 기준 경로>`(먼저 `docker start admin-kit-test-db` — PC 재시작 뒤에는 Docker Desktop 부터), 패키지 `pnpm --filter <패키지> test`, 타입 `pnpm --filter <패키지> typecheck`, lint `pnpm exec eslint <파일들>`(admin-server 는 패키지에 lint 스크립트가 없다), 마크다운 `pnpm exec prettier --write <파일>`(긴 md 는 두 번 돌리고 `--check`).
- 🔴 `pnpm test:db` 를 겹쳐 돌리지 않는다(11.4 · 12.3 차례로).
- 커밋 메시지: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Windows · Linux 양쪽: Unix 파일 명령 대신 전용 도구, `> /dev/null` 금지.

## Review Focus

1. **역할 본문에 `'*'` 와 전권 전용 키를 함께 보냄**(`['*', 'setting.ipAccess:write']`) — 기대: 정규화가 `['*']` 로 접어 통과하고 `['*']` 로 저장된다. → Task 2 단위 · DB 테스트.
2. **업그레이드 전에 그 키를 받은 일반 역할의 이름만 고침 · 그 키를 빼는 권한 수정** — 기대: 둘 다 된다(결정 ④). 키를 남긴 권한 수정만 400 이고 행은 그대로다. → Task 2 DB 테스트.
3. **`ipAccess.manage` 슬롯 키가 `'*'`** — 기대: 기동 검사가 지난다(`'*'` 는 표시할 수 없고, 이미 전권만 가진다). → Task 2 단위 테스트.
4. **두 묶음의 같은 기본 글자를 같은 값으로 덮음**(`accounts.noUser` · `sessions.noUser` 둘 다 '운영자를 찾을 수 없습니다.') — 기대: 기동한다. 다른 값이면 두 자리를 함께 적고 멈춘다. 기본값과 같은 덮기는 표에 들어가지 않는다. → Task 4 테스트.
5. **`details` 가 객체가 아니거나 `issues` 항목에 `message` 문자열이 없음** — 기대: 바꾸기가 그 항목을 건너뛰고 나머지를 바꾸며 던지지 않는다. 표가 던져도 원문 4xx 가 나간다(M7). → Task 4 · Task 5 테스트.

---

## File Structure

| 파일 (저장소 루트 기준)                                                                                                                                                    | 책임                                           | Task |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---- |
| `packages/admin-shared/src/permissions.ts` · `permissions.test.ts`                                                                                                         | `fullAccessOnly` 옵션 · 검사 · 카탈로그 필드   | 1    |
| `packages/admin-server/src/accounts/full-access.ts`(새) · `full-access.test.ts`(새)                                                                                        | 역할 쓰기 400 · IP 슬롯 기동 검사 — 순수 함수  | 2    |
| `packages/admin-server/src/accounts/errors.ts` · `accounts/options.ts` · `accounts/options.test.ts`                                                                        | 문구 · 카탈로그 모양(F7)                       | 2    |
| `packages/admin-server/src/roles/roles.service.ts` · `roles.module.ts` · `roles.module.test.ts` · `roles.service.db.test.ts`                                               | F3 · F4 · F6 배선                              | 2    |
| `packages/admin-server/src/test-support/accounts.ts` · `packages/admin-server/package.json`                                                                                | `TEST_CATALOG` 표시 · peer 하한                | 2    |
| `packages/admin-ui/src/composables/useRoleEditor.ts` · `useRoleEditor.render.test.ts`                                                                                      | `fullAccessOnly` · `canPick`                   | 3    |
| `packages/admin-server/src/http/messages.ts`(새) · `messages.test.ts`(새) · `auth/errors.ts` · `sessions/errors.ts` · `audit/errors.ts`                                    | 묶음 · 해석 · 적용 — 순수 · 표 얼림            | 4    |
| `packages/admin-server/src/tokens.ts` · `admin-server.module.ts` · `http/exception.filter.ts` · `index.ts` · `http/http-contract.test.ts` · `admin-server.module.test.ts`  | 덮기 표 provider · 필터 적용 · export          | 5    |
| `packages/admin-server/README.md` · `packages/admin-ui/README.md` · `.changeset/admin-kit-full-access-messages.md` · `CLAUDE.md` · `docs/01-phase0.md` · `docs/HANDOFF.md` | 문서 · 릴리스 · 진행                           | 6    |
| `docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md` · `docs/HANDOFF.md`                                                                                        | 실 DB 두 버전 · changeset status · 서버 스모크 | 7    |

---

### Task 1: admin-shared — `definePermissions(…, { fullAccessOnly })`

**Files:**

- Modify: `packages/admin-shared/src/permissions.ts` (`DefinePermissionsOptions` · `PermissionCatalog` · `definePermissions` · 새 내부 함수 둘)
- Test: `packages/admin-shared/src/permissions.test.ts`

**Interfaces:**

- Consumes: 없음
- Produces:
  - `DefinePermissionsOptions.fullAccessOnly?: readonly P[]`
  - `PermissionCatalog.fullAccessOnly: readonly (T[keyof T] | E)[]` — 얼린 배열, 카탈로그 순서(`ALL_PERMISSION_VALUES`), 중복 없음, 기본 `[]`
  - 정의할 때 던지는 문구(한 번에 모아 `definePermissions: ` 뒤에 `/` 로 잇는다): `전권 전용 키가 카탈로그 밖이다: <키>` · `표시 없는 키가 전권 전용 키를 함의한다: <키> → <표시된 키들(, 로)>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`permissions.test.ts` 끝에 더한다:

```ts
describe('definePermissions — fullAccessOnly(2g F1 · F2)', () => {
  const base = {
    IP_READ: 'setting.ipAccess:read',
    IP_WRITE: 'setting.ipAccess:write',
    USERS_READ: 'org.users:read',
    USERS_WRITE: 'org.users:write',
  } as const

  it('기본은 빈 배열 · 얼림', () => {
    const plain = definePermissions(base)
    expect(plain.fullAccessOnly).toEqual([])
    expect(Object.isFrozen(plain.fullAccessOnly)).toBe(true)
  })

  it('카탈로그 순서 · 중복 없이 얼린다 — 표시된 키가 일반 키를 함의하는 것은 된다', () => {
    const marked = definePermissions(base, {
      implies: { 'setting.ipAccess:write': ['setting.ipAccess:read'] },
      fullAccessOnly: ['org.users:write', 'setting.ipAccess:write', 'org.users:write'],
    })
    expect(marked.fullAccessOnly).toEqual(['setting.ipAccess:write', 'org.users:write'])
    expect(Object.isFrozen(marked.fullAccessOnly)).toBe(true)
  })

  it("🔴 카탈로그 밖 키 · '*' 는 정의할 때 던진다", () => {
    expect(() => definePermissions(base, { fullAccessOnly: ['x:write'] as never })).toThrow(
      '전권 전용 키가 카탈로그 밖이다: x:write',
    )
    expect(() => definePermissions(base, { fullAccessOnly: ['*'] as never })).toThrow(
      '전권 전용 키가 카탈로그 밖이다: *',
    )
  })

  it('🔴 표시 없는 키의 함의 닫힘에 표시된 키가 있으면 던진다 — 직접 · 연쇄', () => {
    expect(() =>
      definePermissions(base, {
        implies: { 'org.users:write': ['setting.ipAccess:write'] },
        fullAccessOnly: ['setting.ipAccess:write'],
      }),
    ).toThrow('표시 없는 키가 전권 전용 키를 함의한다: org.users:write → setting.ipAccess:write')
    expect(() =>
      definePermissions(base, {
        implies: {
          'org.users:write': ['org.users:read'],
          'org.users:read': ['setting.ipAccess:write'],
        },
        fullAccessOnly: ['setting.ipAccess:write'],
      }),
    ).toThrow('표시 없는 키가 전권 전용 키를 함의한다: org.users:read → setting.ipAccess:write')
  })

  it('순환 함의에서도 멈춘다 — 표시된 키끼리의 순환은 된다', () => {
    const cyclic = definePermissions(base, {
      implies: {
        'setting.ipAccess:write': ['setting.ipAccess:read'],
        'setting.ipAccess:read': ['setting.ipAccess:write'],
      },
      fullAccessOnly: ['setting.ipAccess:read', 'setting.ipAccess:write'],
    })
    expect(cyclic.fullAccessOnly).toEqual(['setting.ipAccess:read', 'setting.ipAccess:write'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-shared exec vitest run src/permissions.test.ts`
Expected: FAIL — `fullAccessOnly` 가 `undefined` 이고 던지지 않는다.

- [ ] **Step 3: 구현한다**

`permissions.ts`:

1. `DefinePermissionsOptions` 의 `implies?:` 뒤에:

```ts
  /**
   * 전체 권한(`'*'`) 역할만 가질 수 있는 키(2g F1). 서버 역할 쓰기가 400 으로 막고 admin-ui `useRoleEditor({ fullAccessOnly })` 가
   * 칸을 잠근다 — 서버 · 화면이 이 표 하나를 쓴다(`implies` 와 같은 자리). 예: IP 접근 제어 관리 키.
   * 정의할 때 던진다: 카탈로그 밖 · `'*'` · 표시 없는 키의 함의 닫힘에 표시된 키(그 키를 켜면 400 이 나는 칸이 생긴다).
   */
  fullAccessOnly?: readonly P[]
```

2. `PermissionCatalog` 의 `readonly implies:` 뒤에:

```ts
  /** 검증된 전권 전용 키(얼림 · 카탈로그 순서). 없으면 `[]`. admin-ui `useRoleEditor({ fullAccessOnly })` 에 그대로 넘긴다 */
  readonly fullAccessOnly: readonly (T[keyof T] | E)[]
```

3. `definePermissions` 안 `const implies = freezeImplies(…)` 바로 뒤에:

```ts
const fullAccessOnly = freezeFullAccessOnly(
  options.fullAccessOnly ?? [],
  ALL_PERMISSION_VALUES,
  implies,
)
```

반환 객체의 `implies: …,` 뒤에 `fullAccessOnly: fullAccessOnly as PermissionCatalog<T, E>['fullAccessOnly'],`.

4. 파일 끝(`freezeImplies` 뒤)에 더한다:

```ts
/** 함의 닫힘(자신 제외) — `normalize` 와 같은 펼치기. 순환에서 멈춘다 */
function impliedBy(key: string, implies: Readonly<Record<string, readonly string[]>>): string[] {
  const seen = new Set<string>()
  const pending = [...(Object.hasOwn(implies, key) ? (implies[key] ?? []) : [])]
  while (pending.length > 0) {
    const next = pending.pop() as string
    if (seen.has(next)) continue
    seen.add(next)
    if (Object.hasOwn(implies, next)) pending.push(...(implies[next] ?? []))
  }
  seen.delete(key)
  return [...seen]
}

/**
 * 전권 전용 목록을 검증해 카탈로그 순서로 얼린다(2g F1 · F2). 문제를 모아 한 번에 던진다(`freezeImplies` 와 같은 틀).
 * 🔴 표시 없는 키의 함의 닫힘에 표시된 키가 있으면 던진다 — 그 키를 켜는 순간 서버가 400 을 내는 칸이 생긴다.
 */
function freezeFullAccessOnly(
  list: readonly string[],
  ordered: readonly string[],
  implies: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
  const problems: string[] = []
  const known = new Set(ordered)
  for (const key of new Set(list)) {
    if (key === ALL_PERMISSION || !known.has(key)) {
      problems.push(`전권 전용 키가 카탈로그 밖이다: ${key}`)
    }
  }
  const marked = new Set(list)
  for (const key of ordered) {
    if (key === ALL_PERMISSION || marked.has(key)) continue
    const leaked = impliedBy(key, implies).filter((value) => marked.has(value))
    if (leaked.length > 0) {
      problems.push(`표시 없는 키가 전권 전용 키를 함의한다: ${key} → ${leaked.join(', ')}`)
    }
  }
  if (problems.length > 0) throw new Error(`definePermissions: ${problems.join(' / ')}`)
  return Object.freeze(ordered.filter((key) => key !== ALL_PERMISSION && marked.has(key)))
}
```

5. 파일 머리 주석(카탈로그 설명 블록)에 한 줄: `// 2g: fullAccessOnly — 전체 권한 역할만 가질 수 있는 키(서버 역할 쓰기 · useRoleEditor 가 같은 표를 쓴다).`

- [ ] **Step 4: 테스트가 통과하는지 본다 · 빌드**

Run: `pnpm --filter @ssworks/admin-shared exec vitest run src/permissions.test.ts` → PASS.
Run: `pnpm --filter @ssworks/admin-shared test` → PASS.
Run: `pnpm --filter @ssworks/admin-shared typecheck` → 오류 0.
Run: `pnpm --filter @ssworks/admin-shared build` → 성공(🔴 다음 Task 들이 `dist/` 의 새 필드를 본다).
Run: `pnpm exec eslint packages/admin-shared/src/permissions.ts packages/admin-shared/src/permissions.test.ts` → 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-shared/src/permissions.ts packages/admin-shared/src/permissions.test.ts
git commit -m "feat(admin-shared): definePermissions fullAccessOnly — 전체 권한 역할만 가질 수 있는 키(ringside 보고 §3)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: admin-server — 역할 쓰기 400 · IP 슬롯 기동 검사 · 카탈로그 모양

**Files:**

- Create: `packages/admin-server/src/accounts/full-access.ts`
- Create: `packages/admin-server/src/accounts/full-access.test.ts`
- Modify: `packages/admin-server/src/accounts/errors.ts` (`fullAccessOnly` 문구)
- Modify: `packages/admin-server/src/accounts/options.ts` (`AdminPermissionCatalog` Pick · `isCatalog` · 문구)
- Test: `packages/admin-server/src/accounts/options.test.ts`
- Modify: `packages/admin-server/src/roles/roles.service.ts` (`create` · `update`)
- Modify: `packages/admin-server/src/roles/roles.module.ts` (생성자 · `onModuleInit`)
- Test: `packages/admin-server/src/roles/roles.module.test.ts`
- Test: `packages/admin-server/src/roles/roles.service.db.test.ts`
- Modify: `packages/admin-server/src/test-support/accounts.ts` (`TEST_CATALOG`)
- Modify: `packages/admin-server/package.json` (peer 하한)

**Interfaces:**

- Consumes: Task 1 `PermissionCatalog.fullAccessOnly`(빌드된 `dist/`)
- Produces:
  - `accounts/full-access.ts`: `export function assertFullAccessOnly(catalog: Pick<AdminPermissionCatalog, 'fullAccessOnly'>, permissions: readonly string[]): void` · `export function assertIpManageFullAccessOnly(permissions: Readonly<AdminPermissionMap> | undefined, catalog: Pick<AdminPermissionCatalog, 'fullAccessOnly'>, ipAccess: boolean): void`
  - `ACCOUNT_MESSAGES.fullAccessOnly`
  - `AdminPermissionCatalog` 에 `fullAccessOnly`(공개 타입)

- [ ] **Step 1: 실패하는 단위 테스트를 쓴다**

`packages/admin-server/src/accounts/full-access.test.ts`:

```ts
import { BusinessError, CommonErrorCodes, definePermissions } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from './errors.js'
import { assertFullAccessOnly, assertIpManageFullAccessOnly } from './full-access.js'

const KEYS = {
  IP_READ: 'setting.ipAccess:read',
  IP_WRITE: 'setting.ipAccess:write',
  USERS_READ: 'org.users:read',
} as const
const marked = definePermissions(KEYS, {
  implies: { 'setting.ipAccess:write': ['setting.ipAccess:read'] },
  fullAccessOnly: ['setting.ipAccess:write'],
})
const plain = definePermissions(KEYS)

function thrown(run: () => void): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

describe('assertFullAccessOnly(2g F3)', () => {
  it("🔴 '*' 가 아닌 역할에 전권 전용 키가 있으면 400 issues permissions", () => {
    const error = thrown(() =>
      assertFullAccessOnly(marked, ['setting.ipAccess:read', 'setting.ipAccess:write']),
    )
    expect(error).toBeInstanceOf(BusinessError)
    const business = error as BusinessError
    expect(business.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(business.message).toBe(ACCOUNT_MESSAGES.fullAccessOnly)
    expect(business.details).toEqual({
      issues: [{ path: ['permissions'], code: 'custom', message: ACCOUNT_MESSAGES.fullAccessOnly }],
    })
  })

  it("'*' 역할 · 정규화된 ['*', 키] · 표시 없는 키만 · 빈 권한은 지난다", () => {
    expect(() => assertFullAccessOnly(marked, ['*'])).not.toThrow()
    expect(() =>
      assertFullAccessOnly(marked, marked.normalize(['*', 'setting.ipAccess:write'])),
    ).not.toThrow()
    expect(() =>
      assertFullAccessOnly(marked, ['setting.ipAccess:read', 'org.users:read']),
    ).not.toThrow()
    expect(() => assertFullAccessOnly(marked, [])).not.toThrow()
    expect(() => assertFullAccessOnly(plain, ['setting.ipAccess:write'])).not.toThrow()
  })
})

describe('assertIpManageFullAccessOnly(2g F6)', () => {
  const permissions = {
    'ipAccess.read': 'setting.ipAccess:read',
    'ipAccess.manage': 'setting.ipAccess:write',
  }

  it('🔴 IP 모듈이 켜졌고 manage 키가 전권 전용이 아니면 던진다 — 고칠 한 줄을 문구에', () => {
    expect(() => assertIpManageFullAccessOnly(permissions, plain, true)).toThrow(
      "fullAccessOnly: ['setting.ipAccess:write']",
    )
  })

  it("표시돼 있거나 · IP 모듈이 없거나 · 슬롯 키가 '*' 거나 · 슬롯이 없으면 지난다", () => {
    expect(() => assertIpManageFullAccessOnly(permissions, marked, true)).not.toThrow()
    expect(() => assertIpManageFullAccessOnly(permissions, plain, false)).not.toThrow()
    expect(() =>
      assertIpManageFullAccessOnly({ ...permissions, 'ipAccess.manage': '*' }, plain, true),
    ).not.toThrow()
    expect(() => assertIpManageFullAccessOnly({}, plain, true)).not.toThrow()
    expect(() => assertIpManageFullAccessOnly(undefined, plain, true)).not.toThrow()
  })
})
```

`accounts/options.test.ts` 의 `describe('resolveAccountsConfig', …)` 끝에 더한다:

```ts
it('🔴 fullAccessOnly 가 없는 카탈로그(admin-shared 0.9.0 전)는 모양이 다르다고 멈춘다(2g F7)', () => {
  const { fullAccessOnly: _old, ...older } = catalog
  expect(() =>
    resolveAccountsConfig({ permissionCatalog: older as never }, 'AdminRolesModule'),
  ).toThrow('fullAccessOnly')
})
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/accounts/full-access.test.ts src/accounts/options.test.ts`
Expected: FAIL — `full-access.js` 가 없다 · 옛 모양 카탈로그가 통과한다.

- [ ] **Step 3: 순수 함수 · 문구 · 모양 검사를 구현한다**

`accounts/errors.ts` 의 `unknownPermission: …,` 뒤에:

```ts
  fullAccessOnly: '전체 권한 역할만 가질 수 있는 권한이 들어 있습니다.',
```

`packages/admin-server/src/accounts/full-access.ts`:

```ts
import { ALL_PERMISSION } from '@ssworks/admin-shared'
import type { AdminPermissionMap } from '../auth/permission-slots.js'
import { validationError } from '../http/validation.js'
import { ACCOUNT_MESSAGES } from './errors.js'
import type { AdminPermissionCatalog } from './options.js'

// 정본: 없음 — 2g 스펙 F3 · F6(ringside 보고 §3). 2f-1 README 의 "ipAccess.manage 는 전체 권한 관리자에게만" 을 킷이 강제한다.

/**
 * 🔴 전권 전용 키(카탈로그 `fullAccessOnly`)는 `'*'` 역할만 갖는다(2g F3). 정규화를 지난 권한을 받는다 — `'*'` 가 있으면
 * 정확히 `['*']` 라 걸리지 않는다. 어기면 400 `ERR_COMMON_VALIDATION` + `issues[{ path: ['permissions'] }]`.
 * 본문만 보는 검사라 트랜잭션 앞에서 부른다(F4). 이름 · 기본 표시만 고치는 수정 · 사용자 배정은 부르지 않는다(결정 ④).
 */
export function assertFullAccessOnly(
  catalog: Pick<AdminPermissionCatalog, 'fullAccessOnly'>,
  permissions: readonly string[],
): void {
  if (permissions.includes(ALL_PERMISSION)) return
  const marked = new Set<string>(catalog.fullAccessOnly)
  if (!permissions.some((permission) => marked.has(permission))) return
  throw validationError(
    [{ path: ['permissions'], code: 'custom', message: ACCOUNT_MESSAGES.fullAccessOnly }],
    ACCOUNT_MESSAGES.fullAccessOnly,
  )
}

/**
 * 🔴 기동 검사(2g F6) — IP 모듈을 켠 앱에서 `ipAccess.manage` 의 키는 전권 전용이어야 한다. 그 슬롯은 사실상 전권급이다 — 좁은
 * 보유자도 마지막 도달 가능 전권자를 뺀 전권자를 가두고 일반 관리자를 모두 잠글 수 있다(2f-1 스펙 §9-2 s1). 슬롯이 없으면
 * IP 모듈 자신의 슬롯 검사가 멈추고, 키가 `'*'` 면 이미 전권만 가진다.
 */
export function assertIpManageFullAccessOnly(
  permissions: Readonly<AdminPermissionMap> | undefined,
  catalog: Pick<AdminPermissionCatalog, 'fullAccessOnly'>,
  ipAccess: boolean,
): void {
  if (!ipAccess) return
  const key = permissions?.['ipAccess.manage']
  if (key === undefined || key === ALL_PERMISSION || catalog.fullAccessOnly.includes(key)) return
  throw new Error(
    `AdminRolesModule — IP 접근 제어를 켰다면 ipAccess.manage 의 키(${key})를 전권 전용으로 표시한다: definePermissions(…, { fullAccessOnly: ['${key}'] }). 그 슬롯은 사실상 전권급이다 — 일반 역할이 가지면 다른 관리자를 모두 잠글 수 있다.`,
  )
}
```

`accounts/options.ts`:

1. `AdminPermissionCatalog` 의 Pick 목록에 `| 'fullAccessOnly'` 를 더한다: `'ALL_PERMISSION_VALUES' | 'isPermission' | 'implies' | 'normalize' | 'fullAccessOnly'`.
2. `isCatalog` 의 반환식 끝(`candidate.implies !== null`) 뒤에 `&& Array.isArray(candidate.fullAccessOnly)` 를 더한다.
3. 모양 오류 문구의 `admin-shared 가 implies · normalize 를 내는 판인지(설치가 둘이 아닌지)` 를 `admin-shared 가 implies · normalize · fullAccessOnly 를 내는 판(0.9.0 이상)인지(설치가 둘이 아닌지)` 로 바꾼다. 기존 테스트가 옛 문구 전체를 재면 새 문구로 고친다.
4. 머리 주석에 한 줄: `// 2g: 카탈로그 모양에 fullAccessOnly(F7) — admin-server peer 하한 0.9.0.`

- [ ] **Step 4: 단위 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/accounts/full-access.test.ts src/accounts/options.test.ts` → PASS.

- [ ] **Step 5: 실패하는 배선 테스트를 쓴다**

`test-support/accounts.ts` 의 `TEST_CATALOG` 옵션 객체에서 `implies: { … },` 뒤에 `fullAccessOnly: ['setting.ipAccess:write'],` 를 더한다(🔴 `bootAdminApp` 이 역할 · IP 모듈을 함께 띄운다 — 표시가 없으면 실 DB HTTP 테스트가 모두 기동에서 멈춘다. IP 테스트의 좁은 보유자는 `seedRole` 로 DB 에 직접 넣으므로 쓰기 검사를 타지 않는다).

`roles/roles.module.test.ts`:

- import 에 `import { definePermissions } from '@ssworks/admin-shared'` 와 `import { AdminIpAccessModule } from '../ip-access/ip-access.module.js'` 를 더한다.
- `describe('AdminRolesModule 배선', …)` 끝에 더한다(IP 모듈 기동에 더 필요한 모듈 · 옵션이 있으면 `ip-access/ip-access.module.test.ts` 의 `boot` 를 따른다):

```ts
const IP_PERMISSIONS = {
  ...PERMISSIONS,
  'ipAccess.read': 'setting.ipAccess:read',
  'ipAccess.manage': 'setting.ipAccess:write',
}

it('🔴 IP 모듈을 켰는데 ipAccess.manage 키가 전권 전용이 아니면 멈춘다(2g F6)', async () => {
  const unmarked = definePermissions({
    ROLES_READ: 'org.roles:read',
    ROLES_WRITE: 'org.roles:write',
    IP_READ: 'setting.ipAccess:read',
    IP_WRITE: 'setting.ipAccess:write',
  })
  await expect(
    boot([AdminAuthModule, AdminRolesModule, AdminIpAccessModule], {
      permissions: IP_PERMISSIONS,
      permissionCatalog: unmarked,
    }),
  ).rejects.toThrow("fullAccessOnly: ['setting.ipAccess:write']")
})

it('표시가 있으면 IP 모듈과 함께 뜬다(TEST_CATALOG)', async () => {
  const app = await boot([AdminAuthModule, AdminRolesModule, AdminIpAccessModule], {
    permissions: IP_PERMISSIONS,
  })
  expect(app).toBeDefined()
})
```

`roles/roles.service.db.test.ts` 끝에 더한다:

```ts
describe('전권 전용 키(2g F3 · F5)', () => {
  it('🔴 일반 역할 만들기에 전권 전용 키가 있으면 400 issues permissions · 행이 없다', async () => {
    const error = await rejection(() =>
      service.create(
        { roleName: 'fa-create', isDefault: false, permissions: ['setting.ipAccess:write'] },
        root,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(error.details).toEqual({
      issues: [{ path: ['permissions'], code: 'custom', message: ACCOUNT_MESSAGES.fullAccessOnly }],
    })
    const row = await t.db
      .selectFrom('roles')
      .select('roleNo')
      .where('roleName', '=', 'fa-create')
      .executeTakeFirst()
    expect(row).toBeUndefined()
  })

  it("'*' 와 함께 보내면 ['*'] 로 만든다", async () => {
    const created = await service.create(
      { roleName: 'fa-star', isDefault: false, permissions: ['*', 'setting.ipAccess:write'] },
      root,
    )
    expect(created.after.permissions).toEqual(['*'])
  })

  it('🔴 업그레이드 전 역할 — 이름만 고치기 · 키를 빼는 수정은 되고, 키를 남긴 권한 수정은 400 · 그대로', async () => {
    const legacy = await seedRole(t.db, {
      roleName: 'fa-legacy',
      permissions: ['setting.ipAccess:read', 'setting.ipAccess:write'],
    })
    await expect(
      service.update(legacy, { revision: 0, roleName: 'fa-legacy2' }, root),
    ).resolves.toMatchObject({ item: { roleName: 'fa-legacy2', revision: 1 } })
    const error = await rejection(() =>
      service.update(
        legacy,
        { revision: 1, permissions: ['setting.ipAccess:write', 'org.users:read'] },
        root,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect((await stored(legacy)).revision).toBe(1)
    await expect(
      service.update(legacy, { revision: 1, permissions: ['setting.ipAccess:read'] }, root),
    ).resolves.toMatchObject({ item: { permissions: ['setting.ipAccess:read'], revision: 2 } })
  })
})
```

- [ ] **Step 6: 배선 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/roles/roles.module.test.ts`
Expected: FAIL — 표시 없는 카탈로그로도 뜬다.

Run(먼저 `docker start admin-kit-test-db`): `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/roles/roles.service.db.test.ts`
Expected: FAIL — 일반 역할 만들기가 성공한다 · 키를 남긴 수정이 성공한다.

- [ ] **Step 7: 역할 서비스 · 모듈 · peer 를 구현한다**

`roles/roles.service.ts`:

- import 에 `import { assertFullAccessOnly } from '../accounts/full-access.js'` 를 더한다.
- `create` 의 `const next = this.config.catalog.normalize(body.permissions)` 바로 뒤에:

```ts
// 🔴 본문만 보는 검사 — 트랜잭션 · 403 판정 앞(2g F4)
assertFullAccessOnly(this.config.catalog, next)
```

- `update` 의 `const next = body.permissions === undefined ? undefined : this.config.catalog.normalize(body.permissions)` 바로 뒤에:

```ts
// 🔴 권한을 바꾸는 수정만 — 이름 · 기본 표시만 고치는 수정은 업그레이드 전 역할도 지난다(2g F4 · F5, 결정 ④)
if (next !== undefined) assertFullAccessOnly(this.config.catalog, next)
```

- 머리 주석의 바꾼 점에 한 줄: `//  - 전권 전용 키는 '*' 역할만(2g F3) — 만들기 · 권한 수정이 정규화 뒤 assertFullAccessOnly.`

`roles/roles.module.ts`:

- import 를 고친다(🔴 데코레이터가 붙은 생성자 매개변수의 인터페이스는 `import type` 한 줄로 따로 — TS1272, `roles.service.ts` 와 같은 꼴):

```ts
import { Inject, Module, Optional, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertIpManageFullAccessOnly } from '../accounts/full-access.js'
import { resolveAccountsConfig } from '../accounts/options.js'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_ACCOUNTS_CONFIG, ADMIN_SERVER_OPTIONS, IP_ACCESS_ENABLED } from '../tokens.js'
```

- 생성자 · `onModuleInit`:

```ts
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
    @Inject(ADMIN_ACCOUNTS_CONFIG) private readonly config: ResolvedAccountsConfig,
    // 🔴 @Optional — IP 접근 제어 모듈이 없는 앱(전역 모듈의 표시 토큰, 2g F6)
    @Optional() @Inject(IP_ACCESS_ENABLED) private readonly ipAccess?: boolean,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminRolesModule')
    assertPermissionSlots(
      this.options.permissions,
      ['roles.read', 'roles.manage'],
      'AdminRolesModule',
    )
    // 🔴 IP 모듈을 켠 앱의 ipAccess.manage 키는 전권 전용이어야 한다(2g F6) — 역할 모듈이 없는 앱은 킷 안에 역할 쓰기 길이 없다
    assertIpManageFullAccessOnly(this.options.permissions, this.config.catalog, this.ipAccess === true)
  }
```

- 머리 주석에 한 줄: `// 🔴 IP 모듈을 켠 앱은 ipAccess.manage 키가 카탈로그 fullAccessOnly 여야 뜬다(2g F6).`

`packages/admin-server/package.json` 의 `peerDependencies` 에서 `"@ssworks/admin-shared": "workspace:>=0.4.0 <1.0.0"` 를 `"workspace:>=0.9.0 <1.0.0"` 로 바꾼다(.changeset/README.md 하한 규칙 — 로컬 admin-shared 가 0.8.0 인 동안 changesets 가 비치명 경고를 낼 수 있다, 2f-2b 와 같다).

- [ ] **Step 8: 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/roles/roles.module.test.ts src/accounts` → PASS.
Run: `pnpm --filter @ssworks/admin-server test` → PASS.
Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/roles src/ip-access src/accounts` → PASS(🔴 `TEST_CATALOG` 표시로 IP · 잔존 실 DB 테스트가 그대로 초록인지 — 빨간 테스트가 역할 API 로 일반 역할에 `setting.ipAccess:write` 를 넣고 있으면 그 테스트는 `seedRole` 로 바꾼다).
Run: `pnpm --filter @ssworks/admin-server typecheck` → 오류 0.
Run: `pnpm exec eslint packages/admin-server/src/accounts packages/admin-server/src/roles packages/admin-server/src/test-support/accounts.ts` → 오류 0.

- [ ] **Step 9: 커밋**

```bash
git add packages/admin-server/src/accounts/full-access.ts packages/admin-server/src/accounts/full-access.test.ts packages/admin-server/src/accounts/errors.ts packages/admin-server/src/accounts/options.ts packages/admin-server/src/accounts/options.test.ts packages/admin-server/src/roles/roles.service.ts packages/admin-server/src/roles/roles.module.ts packages/admin-server/src/roles/roles.module.test.ts packages/admin-server/src/roles/roles.service.db.test.ts packages/admin-server/src/test-support/accounts.ts packages/admin-server/package.json
git commit -m "feat(admin-server): 전권 전용 키 — 일반 역할 쓰기 400 · IP 슬롯 표시 기동 검사 · peer 하한 0.9.0(ringside 보고 §3)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: admin-ui — `useRoleEditor({ fullAccessOnly })`

**Files:**

- Modify: `packages/admin-ui/src/composables/useRoleEditor.ts` (`RoleEditorOptions` · `canPick`)
- Test: `packages/admin-ui/src/composables/useRoleEditor.render.test.ts`

**Interfaces:**

- Consumes: 없음(배열을 받는다 — 보통 `catalog.fullAccessOnly`)
- Produces: `RoleEditorOptions.fullAccessOnly?: readonly P[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`useRoleEditor.render.test.ts` 의 `describe('useRoleEditor — 판정', …)` 바로 앞에 더한다(하네스 `ROLES` — `[1]` 운영자는 `log:read` 없음, `[2]` 감사는 `log:read` 만 — 업그레이드 전 역할 역할을 한다):

```ts
describe('useRoleEditor — 전권 전용 fullAccessOnly(2g F8)', () => {
  it('🔴 표시된 칸은 꺼져 있으면 켤 수 없다 — 행위자가 * 여도 · 바인딩을 직접 불러도', async () => {
    const { editor } = await mountRoleEditor({ fullAccessOnly: ['log:read'] })
    editor.select(editor.roles.value[1]!)
    await flushPromises()
    expect(cell('log:read')?.disabled).toBe(true)
    expect(cell('org.users:delete')?.disabled).toBe(false)
    editor.matrix.value['onUpdate:modelValue']([...editor.form.value.permissions, 'log:read'])
    expect(editor.form.value.permissions).not.toContain('log:read')
  })

  it('🔴 켜진 기존 역할은 끌 수 있고, 끈 뒤에는 다시 켤 수 없다', async () => {
    const { editor } = await mountRoleEditor({ fullAccessOnly: ['log:read'] })
    editor.select(editor.roles.value[2]!)
    await flushPromises()
    expect(cell('log:read')?.disabled).toBe(false)
    await clickCell('log:read')
    expect(editor.form.value.permissions).toEqual([])
    expect(cell('log:read')?.disabled).toBe(true)
    editor.matrix.value['onUpdate:modelValue'](['log:read'])
    expect(editor.form.value.permissions).toEqual([])
  })

  it('옵션이 없으면 지금과 같다', async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    await flushPromises()
    expect(cell('log:read')?.disabled).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useRoleEditor.render.test.ts`
Expected: FAIL — `log:read` 칸이 켜진다(옵션을 무시한다).

- [ ] **Step 3: 구현한다**

`useRoleEditor.ts`:

1. `RoleEditorOptions` 의 `implies?:` 뒤에:

```ts
  /**
   * 전권 전용 키 — 보통 카탈로그의 `fullAccessOnly`(서버 역할 쓰기와 같은 표). 그 칸은 꺼져 있으면 켤 수 없고, 켜져 있으면 끌 수
   * 있다(업그레이드 전에 그 키를 받은 역할을 정리하는 길). 키는 "전체 권한" 스위치로만 얻는다(2g F8).
   */
  fullAccessOnly?: readonly P[]
```

2. setup 의 `const implies: ImpliesMap = options.implies ?? {}` 뒤에:

```ts
const fullAccessOnly: ReadonlySet<string> = new Set(options.fullAccessOnly ?? [])
```

3. `canPick` 을 바꾼다:

```ts
/** 🔴 켜면 함께 켜질 키까지 행위자가 가져야 한다 — 아니면 서버의 권한 상승 검사에 걸린다(gise). */
function canPick(permission: string): boolean {
  // 🔴 전권 전용 키는 지금 켜져 있을 때만(2g F8) — 서버가 일반 역할의 그 키를 400 으로 막는다. 끄는 길은 남긴다.
  if (fullAccessOnly.has(permission) && !form.value.permissions.includes(permission)) return false
  return coversPermissions(actor(), [permission, ...impliedClosure(implies, permission)])
}
```

4. 머리 주석의 바꾼 점에 한 줄: `//  - fullAccessOnly(2g F8): 전권 전용 칸은 켜져 있을 때만 고를 수 있다.`

- [ ] **Step 4: 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useRoleEditor.render.test.ts src/composables/useRoleEditor.write.render.test.ts` → PASS.
Run: `pnpm --filter @ssworks/admin-ui test` → PASS.
Run: `pnpm --filter @ssworks/admin-ui typecheck` → 오류 0.
Run: `pnpm exec eslint packages/admin-ui/src/composables/useRoleEditor.ts packages/admin-ui/src/composables/useRoleEditor.render.test.ts` → 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-ui/src/composables/useRoleEditor.ts packages/admin-ui/src/composables/useRoleEditor.render.test.ts
git commit -m "feat(admin-ui): useRoleEditor fullAccessOnly — 전권 전용 칸은 켜져 있을 때만 고른다(ringside 보고 §3)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: admin-server — 문구 묶음 · 해석 · 적용(순수)

**Files:**

- Create: `packages/admin-server/src/http/messages.ts`
- Create: `packages/admin-server/src/http/messages.test.ts`
- Modify: `packages/admin-server/src/auth/errors.ts` · `packages/admin-server/src/sessions/errors.ts` · `packages/admin-server/src/audit/errors.ts` (표 얼림)

**Interfaces:**

- Consumes: 서버 문구 표 일곱 · admin-shared `IP_ACCESS_SCHEMA_MESSAGES` · `http/error-response.ts` 의 `ErrorBody`
- Produces(`http/messages.ts`):
  - `export const ADMIN_SERVER_DEFAULT_MESSAGES` — 얼린 `{ auth, accounts, sessions, audit, teams, legal, ipAccess, ipAccessSchema }`(각 값은 그 표 객체 자체)
  - `export type AdminServerMessages = { readonly [G in keyof typeof ADMIN_SERVER_DEFAULT_MESSAGES]?: Partial<Record<keyof (typeof ADMIN_SERVER_DEFAULT_MESSAGES)[G], string>> }`
  - `export function resolveAdminMessages(messages: AdminServerMessages | undefined): ReadonlyMap<string, string>`
  - `export function applyMessageOverrides(body: ErrorBody, overrides: ReadonlyMap<string, string>): ErrorBody`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/http/messages.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AUDIT_MESSAGES } from '../audit/errors.js'
import { AUTH_MESSAGES } from '../auth/errors.js'
import { IP_ACCESS_MESSAGES } from '../ip-access/errors.js'
import { LEGAL_MESSAGES } from '../legal/errors.js'
import { SESSION_MESSAGES } from '../sessions/errors.js'
import { TEAM_MESSAGES } from '../teams/errors.js'
import {
  ADMIN_SERVER_DEFAULT_MESSAGES,
  applyMessageOverrides,
  resolveAdminMessages,
  type AdminServerMessages,
} from './messages.js'

describe('ADMIN_SERVER_DEFAULT_MESSAGES(2g M1 · M2)', () => {
  it('묶음 여덟은 서버가 쓰는 그 표 객체이고 모두 얼려 있다', () => {
    expect(ADMIN_SERVER_DEFAULT_MESSAGES).toEqual({
      auth: AUTH_MESSAGES,
      accounts: ACCOUNT_MESSAGES,
      sessions: SESSION_MESSAGES,
      audit: AUDIT_MESSAGES,
      teams: TEAM_MESSAGES,
      legal: LEGAL_MESSAGES,
      ipAccess: IP_ACCESS_MESSAGES,
      ipAccessSchema: IP_ACCESS_SCHEMA_MESSAGES,
    })
    expect(ADMIN_SERVER_DEFAULT_MESSAGES.accounts).toBe(ACCOUNT_MESSAGES)
    expect(Object.isFrozen(ADMIN_SERVER_DEFAULT_MESSAGES)).toBe(true)
    for (const table of Object.values(ADMIN_SERVER_DEFAULT_MESSAGES)) {
      expect(Object.isFrozen(table)).toBe(true)
    }
  })

  it('🔴 서버의 문구 표(export const *_MESSAGES)는 모두 묶음에 있거나 제외 목록에 있다(M10)', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
    const sourceFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return name === 'test-support' ? [] : sourceFiles(path)
        return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : []
      })
    const found = sourceFiles(srcDir).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/^export const ([A-Z_]+_MESSAGES)[ :=]/gm)].map(
        (match) => match[1],
      ),
    )
    const grouped = [
      'AUTH_MESSAGES',
      'ACCOUNT_MESSAGES',
      'SESSION_MESSAGES',
      'AUDIT_MESSAGES',
      'TEAM_MESSAGES',
      'LEGAL_MESSAGES',
      'IP_ACCESS_MESSAGES',
    ]
    // GUARD_MESSAGES — 5xx 라 고정 문구로 가려진다(M1). ADMIN_SERVER_DEFAULT_MESSAGES — 묶음 자체
    const excluded = ['GUARD_MESSAGES', 'ADMIN_SERVER_DEFAULT_MESSAGES']
    expect([...found].sort()).toEqual([...grouped, ...excluded].sort())
  })
})

describe('resolveAdminMessages(2g M3 · M4)', () => {
  it('없거나 빈 옵션은 빈 표', () => {
    expect(resolveAdminMessages(undefined).size).toBe(0)
    expect(resolveAdminMessages({}).size).toBe(0)
  })

  it('키별 덮기 → 기본 글자에서 덮을 글자로', () => {
    const map = resolveAdminMessages({
      accounts: { noUser: '운영자를 찾을 수 없습니다.' },
      ipAccess: { noScopeUser: '대상 운영자를 찾을 수 없습니다.' },
      ipAccessSchema: { scopeRefRequired: '팀 · 운영자 규칙은 대상을 골라야 합니다.' },
    })
    expect(map.get(ACCOUNT_MESSAGES.noUser)).toBe('운영자를 찾을 수 없습니다.')
    expect(map.get(IP_ACCESS_MESSAGES.noScopeUser)).toBe('대상 운영자를 찾을 수 없습니다.')
    expect(map.get(IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired)).toBe(
      '팀 · 운영자 규칙은 대상을 골라야 합니다.',
    )
    expect(map.size).toBe(3)
  })

  it('같은 기본 글자를 같은 값으로 덮으면 된다 · 기본값과 같은 덮기는 표에 없다', () => {
    const map = resolveAdminMessages({
      accounts: { noUser: '운영자를 찾을 수 없습니다.', noRole: ACCOUNT_MESSAGES.noRole },
      sessions: { noUser: '운영자를 찾을 수 없습니다.' },
    })
    expect(map.size).toBe(1)
    expect(map.has(ACCOUNT_MESSAGES.noRole)).toBe(false)
  })

  it('🔴 같은 기본 글자를 다르게 덮으면 두 자리를 적고 멈춘다', () => {
    expect(() =>
      resolveAdminMessages({
        accounts: { noUser: '운영자를 찾을 수 없습니다.' },
        sessions: { noUser: '회원을 찾을 수 없습니다.' },
      }),
    ).toThrow('같은 기본 문구를 다르게 덮는다: accounts.noUser · sessions.noUser')
  })

  it('🔴 모르는 묶음 · 키 · 빈 값 · 문자열 아님은 모아서 멈춘다', () => {
    expect(() =>
      resolveAdminMessages({
        acounts: { noUser: 'x' },
        accounts: { noUsr: 'x', noRole: '  ', noTeam: 3 },
      } as unknown as AdminServerMessages),
    ).toThrow(
      '모르는 묶음: acounts / 모르는 키: accounts.noUsr / 빈 문구: accounts.noRole / 빈 문구: accounts.noTeam',
    )
  })
})

describe('applyMessageOverrides(2g M6)', () => {
  const map = new Map([
    ['없음', '덮인 없음'],
    ['칸 오류', '덮인 칸 오류'],
  ])

  it('message 와 details.issues[].message 를 바꾸고 나머지는 그대로 — 원본을 고치지 않는다', () => {
    const issues = [
      { path: ['a'], code: 'custom', message: '칸 오류' },
      { path: ['b'], code: 'custom', message: '그대로' },
    ]
    const body = {
      success: false as const,
      code: 'ERR_COMMON_VALIDATION',
      message: '칸 오류',
      details: { issues, extra: 1 },
    }
    expect(applyMessageOverrides(body, map)).toEqual({
      success: false,
      code: 'ERR_COMMON_VALIDATION',
      message: '덮인 칸 오류',
      details: {
        issues: [
          { path: ['a'], code: 'custom', message: '덮인 칸 오류' },
          { path: ['b'], code: 'custom', message: '그대로' },
        ],
        extra: 1,
      },
    })
    expect(body.message).toBe('칸 오류')
    expect(issues[0]?.message).toBe('칸 오류')
  })

  it('표에 없으면 같은 객체를 돌려준다', () => {
    const body = { success: false as const, code: 'ERR_COMMON_NOT_FOUND', message: '모름' }
    expect(applyMessageOverrides(body, map)).toBe(body)
  })

  it('🔴 details 가 객체가 아니거나 issues 항목이 이상해도 던지지 않는다', () => {
    const weird = {
      success: false as const,
      code: 'ERR_COMMON_VALIDATION',
      message: '없음',
      details: { issues: ['문자열', null, { path: [] }, { message: 3 }, { message: '칸 오류' }] },
    }
    expect(applyMessageOverrides(weird, map)).toEqual({
      ...weird,
      message: '덮인 없음',
      details: {
        issues: ['문자열', null, { path: [] }, { message: 3 }, { message: '덮인 칸 오류' }],
      },
    })
    const listDetails = { success: false as const, code: 'X', message: '모름', details: [1, 2] }
    expect(applyMessageOverrides(listDetails, map)).toBe(listDetails)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/http/messages.test.ts`
Expected: FAIL — `messages.js` 가 없다.

- [ ] **Step 3: 표를 얼린다**

- `auth/errors.ts`: `export const AUTH_MESSAGES = {` → `export const AUTH_MESSAGES = Object.freeze({`, 끝의 `} as const` → `} as const)`.
- `sessions/errors.ts`: `SESSION_MESSAGES` 를 같은 꼴로.
- `audit/errors.ts`: `AUDIT_MESSAGES` 를 같은 꼴로.
- 셋의 머리 주석 끝에 한 줄: `// 2g: 얼린다 — ADMIN_SERVER_DEFAULT_MESSAGES 로 공개된다(http/messages.ts).`

- [ ] **Step 4: `http/messages.ts` 를 구현한다**

```ts
import { IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AUDIT_MESSAGES } from '../audit/errors.js'
import { AUTH_MESSAGES } from '../auth/errors.js'
import { IP_ACCESS_MESSAGES } from '../ip-access/errors.js'
import { LEGAL_MESSAGES } from '../legal/errors.js'
import { SESSION_MESSAGES } from '../sessions/errors.js'
import { TEAM_MESSAGES } from '../teams/errors.js'
import type { ErrorBody } from './error-response.js'

// 정본: 없음 — 2g 스펙 M1–M10(ringside 보고 §2). 서버 오류 문구를 쓰는 쪽 용어로 덮는다. 문구를 쓰는 곳(26곳 · 순수 판정
//   함수)은 고치지 않고, 기동 때 "기본 글자 → 덮을 글자" 표를 만들어 예외 필터 한 곳이 4xx 본문에 적용한다.
// 🔴 "용어 하나 바꾸기" 를 만들지 않는다 — 한국어 조사(을/를 · 은/는)가 단어의 받침에 따라 바뀐다(스펙 §2-1).

/**
 * 묶음 → 서버 문구 표(얼림 — 각 값은 서버가 쓰는 그 표 객체). 키를 보고 테스트에서 비교한다.
 * 🔴 새 문구 표(`export const *_MESSAGES`)를 만들면 여기에 더한다 — `messages.test.ts` 의 정적 검사가 잡는다(M10).
 *    `GUARD_MESSAGES` 는 5xx 라 고정 문구로 가려져 넣지 않는다.
 */
export const ADMIN_SERVER_DEFAULT_MESSAGES = Object.freeze({
  auth: AUTH_MESSAGES,
  accounts: ACCOUNT_MESSAGES,
  sessions: SESSION_MESSAGES,
  audit: AUDIT_MESSAGES,
  teams: TEAM_MESSAGES,
  legal: LEGAL_MESSAGES,
  ipAccess: IP_ACCESS_MESSAGES,
  /** admin-shared 스키마 문구 — 서버 검증 400 의 칸 오류로 나간다 */
  ipAccessSchema: IP_ACCESS_SCHEMA_MESSAGES,
})

type DefaultMessages = typeof ADMIN_SERVER_DEFAULT_MESSAGES

/** `AdminServerModule` 옵션 `messages` — 묶음별로 바꿀 키만 */
export type AdminServerMessages = {
  readonly [G in keyof DefaultMessages]?: Partial<Record<keyof DefaultMessages[G], string>>
}

/**
 * 쓰는 쪽 덮기를 "기본 글자 → 덮을 글자" 표로 편다(2g M3).
 * 🔴 기동에서 멈춘다(문제를 모아 한 번에): 모르는 묶음 · 키(오타), 문자열이 아니거나 trim 해서 빈 값, 같은 기본 글자를 서로 다르게
 *    덮음(M4 — `accounts.noUser` 와 `sessions.noUser` 는 같은 글자다. 같은 값이면 된다). 기본값과 같은 덮기는 표에 넣지 않는다.
 */
export function resolveAdminMessages(
  messages: AdminServerMessages | undefined,
): ReadonlyMap<string, string> {
  const tables = ADMIN_SERVER_DEFAULT_MESSAGES as unknown as Readonly<
    Record<string, Readonly<Record<string, string>>>
  >
  const overrides = new Map<string, string>()
  const origin = new Map<string, string>()
  const problems: string[] = []
  for (const [group, entries] of Object.entries(messages ?? {})) {
    const table = Object.hasOwn(tables, group) ? tables[group] : undefined
    if (table === undefined) {
      problems.push(`모르는 묶음: ${group}`)
      continue
    }
    if (entries === undefined) continue
    if (typeof entries !== 'object' || entries === null) {
      problems.push(`묶음 값이 객체가 아니다: ${group}`)
      continue
    }
    for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
      const place = `${group}.${key}`
      if (!Object.hasOwn(table, key)) {
        problems.push(`모르는 키: ${place}`)
        continue
      }
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`빈 문구: ${place}`)
        continue
      }
      const base = table[key] as string
      if (value === base) continue
      const earlier = overrides.get(base)
      if (earlier !== undefined && earlier !== value) {
        problems.push(
          `같은 기본 문구를 다르게 덮는다: ${origin.get(base) ?? '?'} · ${place} — 「${base}」`,
        )
        continue
      }
      overrides.set(base, value)
      if (!origin.has(base)) origin.set(base, place)
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `AdminServerModule 옵션 messages 를 해석할 수 없다 — ${problems.join(' / ')}. 키는 ADMIN_SERVER_DEFAULT_MESSAGES 에 있다.`,
    )
  }
  return overrides
}

/**
 * 4xx 본문의 `message` 와 `details.issues[].message` 를 표로 바꾼다(2g M6). 바꿀 것이 없으면 같은 객체를 돌려준다.
 * 🔴 새 객체로 만든다 — 예외의 `details` 를 고치지 않는다. `issues` 밖의 `details` 는 건드리지 않는다. 5xx 는 부르는 쪽(필터)이 거른다.
 */
export function applyMessageOverrides(
  body: ErrorBody,
  overrides: ReadonlyMap<string, string>,
): ErrorBody {
  const message = overrides.get(body.message) ?? body.message
  const details = overrideIssues(body.details, overrides)
  if (message === body.message && details === body.details) return body
  return { ...body, message, ...(details === undefined ? {} : { details }) }
}

function overrideIssues(details: unknown, overrides: ReadonlyMap<string, string>): unknown {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return details
  const issues = (details as { issues?: unknown }).issues
  if (!Array.isArray(issues)) return details
  let changed = false
  const next = issues.map((issue: unknown) => {
    if (typeof issue !== 'object' || issue === null) return issue
    const text = (issue as { message?: unknown }).message
    if (typeof text !== 'string') return issue
    const replaced = overrides.get(text)
    if (replaced === undefined) return issue
    changed = true
    return { ...(issue as Record<string, unknown>), message: replaced }
  })
  return changed ? { ...(details as Record<string, unknown>), issues: next } : details
}
```

- [ ] **Step 5: 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/http/messages.test.ts` → PASS.
Run: `pnpm --filter @ssworks/admin-server test` → PASS(표 얼림으로 깨지는 곳이 없다 — 대입하는 코드가 있으면 그 자리를 보고 멈춘다).
Run: `pnpm --filter @ssworks/admin-server typecheck` → 오류 0.
Run: `pnpm exec eslint packages/admin-server/src/http/messages.ts packages/admin-server/src/http/messages.test.ts packages/admin-server/src/auth/errors.ts packages/admin-server/src/sessions/errors.ts packages/admin-server/src/audit/errors.ts` → 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-server/src/http/messages.ts packages/admin-server/src/http/messages.test.ts packages/admin-server/src/auth/errors.ts packages/admin-server/src/sessions/errors.ts packages/admin-server/src/audit/errors.ts
git commit -m "feat(admin-server): 서버 문구 묶음 · 덮기 해석 · 4xx 본문 적용(순수 — ringside 보고 §2)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: admin-server — 덮기 표 provider · 예외 필터 · export

**Files:**

- Modify: `packages/admin-server/src/tokens.ts` (`ADMIN_MESSAGE_OVERRIDES`)
- Modify: `packages/admin-server/src/options.ts` (`messages`)
- Modify: `packages/admin-server/src/admin-server.module.ts` (`buildAdminServerModule` providers)
- Modify: `packages/admin-server/src/http/exception.filter.ts` (생성자 · `localize`)
- Modify: `packages/admin-server/src/index.ts` (export 둘)
- Test: `packages/admin-server/src/http/http-contract.test.ts`
- Test: `packages/admin-server/src/admin-server.module.test.ts`

**Interfaces:**

- Consumes: Task 4 `resolveAdminMessages` · `applyMessageOverrides` · `AdminServerMessages` · `ADMIN_SERVER_DEFAULT_MESSAGES`
- Produces: 내부 토큰 `ADMIN_MESSAGE_OVERRIDES`(index 에 내지 않는다) · `AdminServerOptions.messages?: AdminServerMessages` · index export `ADMIN_SERVER_DEFAULT_MESSAGES` · `type AdminServerMessages`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`http/http-contract.test.ts`:

- import 에 `import { GENERIC_5XX_MESSAGE } from './error-response.js'` 를 더하고, `import { ADMIN_SERVER_OPTIONS } from '../tokens.js'` 를 `import { ADMIN_MESSAGE_OVERRIDES, ADMIN_SERVER_OPTIONS } from '../tokens.js'` 로.
- 파일 끝에 더한다:

```ts
describe('문구 덮기(2g M6 · M7)', () => {
  async function bootWith(overrides: ReadonlyMap<string, string>) {
    const meta = wiring(options)
    return createHttpApp({
      ...meta,
      providers: [
        ...(meta.providers ?? []),
        { provide: ADMIN_MESSAGE_OVERRIDES, useValue: overrides },
      ],
    })
  }

  it('4xx 의 message 를 표로 바꾸고 code · details 는 그대로', async () => {
    const local = await bootWith(new Map([['업무 오류 ERR_COMMON_NOT_FOUND', '덮인 404 문구']]))
    try {
      const res = await request(local.getHttpServer())
        .get('/probe/business/ERR_COMMON_NOT_FOUND')
        .expect(404)
      expect(wire(res.text)).toEqual({
        success: false,
        code: 'ERR_COMMON_NOT_FOUND',
        message: '덮인 404 문구',
        details: { field: 'x', n: 3n },
      })
    } finally {
      await local.close()
    }
  })

  it('400 검증 — issues[].message 도 바꾸고, 표에 없는 문구는 그대로', async () => {
    const plain = await request(server)
      .post('/probe/validate')
      .send({ name: 'a', members: [{ name: '' }] })
      .expect(400)
    const plainIssues = validationDetailsSchema.parse(plain.body.details).issues
    const overrides = new Map([['이름을 입력하세요.', '이름을 꼭 넣으세요.']])
    const local = await bootWith(overrides)
    try {
      const res = await request(local.getHttpServer())
        .post('/probe/validate')
        .send({ name: 'a', members: [{ name: '' }] })
        .expect(400)
      const issues = validationDetailsSchema.parse(res.body.details).issues
      expect(issues[1]?.message).toBe('이름을 꼭 넣으세요.')
      expect(issues[0]?.message).toBe(plainIssues[0]?.message)
      expect(res.body.message).toBe(overrides.get(plain.body.message) ?? plain.body.message)
    } finally {
      await local.close()
    }
  })

  it('5xx 는 고정 문구 그대로 — 표에 고정 문구가 있어도', async () => {
    const local = await bootWith(new Map([[GENERIC_5XX_MESSAGE, '바뀌면 안 된다']]))
    try {
      silenceErrors()
      const res = await request(local.getHttpServer()).get('/probe/string-throw').expect(500)
      expect(res.body.message).toBe(GENERIC_5XX_MESSAGE)
    } finally {
      await local.close()
    }
  })

  it('🔴 바꾸기가 던지면 원문 4xx 를 보낸다 — 500 이 되지 않는다(M7)', async () => {
    class Exploding extends Map<string, string> {
      get(): string | undefined {
        throw new Error('boom')
      }
    }
    const local = await bootWith(new Exploding([['x', 'y']]))
    try {
      const spy = silenceErrors()
      const res = await request(local.getHttpServer())
        .get('/probe/business/ERR_COMMON_NOT_FOUND')
        .expect(404)
      expect(res.body.message).toBe('업무 오류 ERR_COMMON_NOT_FOUND')
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('문구 덮기 실패'))
    } finally {
      await local.close()
    }
  })
})
```

`admin-server.module.test.ts`:

- import 에 `import { AdminAuthModule } from './auth/admin-auth.module.js'` · `import { TEST_JWT_SECRET } from './test-support/auth.js'` 를 더한다.
- 파일 끝에 더한다:

```ts
describe('messages(2g M5)', () => {
  it('🔴 forRoot — 덮은 문구가 실제 킷 오류 응답에 나온다(인증 401)', async () => {
    const { app } = await boot(
      AdminServerModule.forRoot({
        db,
        auth: { jwtSecret: TEST_JWT_SECRET },
        messages: { auth: { unauthorized: '운영자 로그인이 필요합니다.' } },
      }),
      [AdminAuthModule],
    )
    try {
      const res = await request(app.getHttpServer()).get('/admin/auth/me').expect(401)
      expect(res.body).toMatchObject({
        success: false,
        code: 'ERR_COMMON_UNAUTHORIZED',
        message: '운영자 로그인이 필요합니다.',
      })
    } finally {
      await app.close()
    }
  })

  it('🔴 forRoot · forRootAsync — 오타는 기동에서 멈춘다', async () => {
    await expect(
      boot(
        AdminServerModule.forRoot({
          db,
          messages: { accounts: { noUsr: 'x' } } as unknown as AdminServerOptions['messages'],
        }),
      ),
    ).rejects.toThrow('모르는 키: accounts.noUsr')
    await expect(
      boot(
        AdminServerModule.forRootAsync({
          useFactory: () => ({
            db,
            messages: { acounts: {} } as unknown as AdminServerOptions['messages'],
          }),
        }),
      ),
    ).rejects.toThrow('모르는 묶음: acounts')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/http/http-contract.test.ts src/admin-server.module.test.ts`
Expected: FAIL — `ADMIN_MESSAGE_OVERRIDES` 가 없다(import 오류로 파일이 빨강일 수 있다). 타입 검사가 없는 vitest 에서 `messages` 옵션은 무시돼 401 문구가 기본값이다.

- [ ] **Step 3: 토큰 · 옵션 · 모듈을 구현한다**

`tokens.ts` 끝에:

```ts
/** 내부 — 쓰는 쪽 문구 덮기 표(기본 글자 → 덮을 글자). 코어 모듈이 `messages` 옵션으로 기동 때 만든다(2g M5). index 에 내지 않는다 */
export const ADMIN_MESSAGE_OVERRIDES = Symbol('ADMIN_MESSAGE_OVERRIDES')
```

`options.ts`:

- import 에 `import type { AdminServerMessages } from './http/messages.js'` 를 더한다.
- `AdminServerOptions` 의 `clientIp?:` 뒤(또는 끝)에:

```ts
  /**
   * 서버 오류 문구를 키별로 덮는다(2g M1–M9) — 예: `{ accounts: { noUser: '운영자를 찾을 수 없습니다.' } }`. 키는
   * `ADMIN_SERVER_DEFAULT_MESSAGES`. 🔴 같은 기본 글자는 함께 바뀐다(`accounts.noUser` = `sessions.noUser`). 오타 · 같은 글자를
   * 다르게 덮기는 기동에서 멈춘다. 4xx 의 `message` · `details.issues[].message` 만 — 5xx 고정 문구 · 로그 · 감사는 그대로.
   */
  messages?: AdminServerMessages
```

`admin-server.module.ts`:

- import 에 `import { resolveAdminMessages } from './http/messages.js'` 를 더하고 토큰 줄을 `import { ADMIN_MESSAGE_OVERRIDES, ADMIN_SERVER_OPTIONS, KYSELY } from './tokens.js'` 로.
- `buildAdminServerModule` 의 providers 에서 `KYSELY` provider 뒤에:

```ts
      // 🔴 기동 때 검증된다 — 오타 · 충돌이 첫 오류 응답이 아니라 기동에서 드러난다(2g M5). forRootAsync 도 같다
      {
        provide: ADMIN_MESSAGE_OVERRIDES,
        useFactory: (options: AdminServerOptions) => resolveAdminMessages(options.messages),
        inject: [ADMIN_SERVER_OPTIONS],
      },
```

- 머리 주석 바꾼 점에 한 줄: `// 2g: 문구 덮기 표(ADMIN_MESSAGE_OVERRIDES)를 코어 provider 로 — 예외 필터가 주입받는다.`

- [ ] **Step 4: 예외 필터를 구현한다**

`http/exception.filter.ts`:

- import: `import { ADMIN_MESSAGE_OVERRIDES, ADMIN_SERVER_OPTIONS } from '../tokens.js'` · `import { applyMessageOverrides } from './messages.js'`.
- 머리 주석 바꾼 점 끝에 한 줄: `//  - 쓰는 쪽 문구 덮기(2g M6 · M7) — 4xx 본문만, 바꾸기가 던지면 원문을 보낸다.`
- 생성자:

```ts
  constructor(
    @Optional() @Inject(ADMIN_SERVER_OPTIONS) private readonly options?: AdminServerOptions,
    // 🔴 @Optional — 코어 모듈 밖에서 필터만 쓰는 배선(테스트 · 쓰는 쪽 수동 등록)은 덮기 없이 돈다
    @Optional()
    @Inject(ADMIN_MESSAGE_OVERRIDES)
    private readonly overrides?: ReadonlyMap<string, string>,
  ) {}
```

- `catch` 의 마지막 줄 `this.send(response, request, normalizeStatus(resolved.status), resolved.body)` 를 바꾼다:

```ts
this.send(response, request, normalizeStatus(resolved.status), this.localize(resolved, request))
```

- `send` 앞에 메서드를 더한다:

```ts
  /**
   * 쓰는 쪽 문구 덮기(2g M6) — 4xx 본문의 message · details.issues[].message. 🔴 던지면 바꾸지 않은 본문을 보낸다 — 바꾸기
   * 실패가 4xx 를 500 으로 만들지 않는다(M7, "반드시 응답").
   */
  private localize(resolved: ResolvedErrorResponse, request: Request | undefined): ErrorBody {
    const overrides = this.overrides
    if (overrides === undefined || overrides.size === 0 || resolved.status >= 500) {
      return resolved.body
    }
    try {
      return applyMessageOverrides(resolved.body, overrides)
    } catch (error) {
      this.logSafely(
        `${describeRequest(request)} — 문구 덮기 실패(원문을 보낸다)`,
        describeReason(error),
      )
      return resolved.body
    }
  }
```

`index.ts` 의 `export { validationError } from './http/validation.js'` 뒤에:

```ts
export { ADMIN_SERVER_DEFAULT_MESSAGES, type AdminServerMessages } from './http/messages.js'
```

- [ ] **Step 5: 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/http src/admin-server.module.test.ts` → PASS.
Run: `pnpm --filter @ssworks/admin-server test` → PASS(`decorator-metadata.test.ts` 가 필터 생성자의 새 매개변수를 문제 삼으면 그 테스트의 기대 목록에 `ADMIN_MESSAGE_OVERRIDES` 를 더한다 — 2b 의 "decorator-metadata 테스트에 새 서비스 생성자" 와 같다).
Run: `pnpm --filter @ssworks/admin-server typecheck` → 오류 0.
Run: `pnpm --filter @ssworks/admin-server build && pnpm --filter @ssworks/admin-server check:dts` → 성공 · 출력 없음.
Run: `pnpm exec eslint packages/admin-server/src/tokens.ts packages/admin-server/src/options.ts packages/admin-server/src/admin-server.module.ts packages/admin-server/src/http packages/admin-server/src/index.ts packages/admin-server/src/admin-server.module.test.ts` → 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-server/src/tokens.ts packages/admin-server/src/options.ts packages/admin-server/src/admin-server.module.ts packages/admin-server/src/http/exception.filter.ts packages/admin-server/src/index.ts packages/admin-server/src/http/http-contract.test.ts packages/admin-server/src/admin-server.module.test.ts
git commit -m "feat(admin-server): AdminServerModule messages — 서버 오류 문구 키별 덮기를 예외 필터 한 곳에서(ringside 보고 §2)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

(Task 5 Step 5 에서 `decorator-metadata.test.ts` 를 고쳤으면 그 파일도 `git add` 에 넣는다.)

---

### Task 6: README · changeset · 진행 문서 · `pnpm check`

**Files:**

- Modify: `packages/admin-server/README.md`
- Modify: `packages/admin-ui/README.md`
- Create: `.changeset/admin-kit-full-access-messages.md`
- Modify: `CLAUDE.md` · `docs/01-phase0.md` · `docs/HANDOFF.md`

**Interfaces:**

- Consumes: Task 1~5 의 공개 이름 — `fullAccessOnly` · `ACCOUNT_MESSAGES.fullAccessOnly` 문구 · `messages` · `ADMIN_SERVER_DEFAULT_MESSAGES` · `AdminServerMessages`
- Produces: 문서만

- [ ] **Step 1: admin-server README**

「응답 계약」 절의 마지막 목록 항목(「쿼리는 extended 파서다」 줄) 뒤에 빈 줄을 두고 더한다:

````markdown
### 오류 문구 바꾸기

서버 오류 문구(사용자를 찾을 수 없음 · 인증이 필요함 …)를 앱 용어로 덮는다. 키는 `ADMIN_SERVER_DEFAULT_MESSAGES` 에 있다(묶음 `auth` · `accounts` · `sessions` · `audit` · `teams` · `legal` · `ipAccess` · `ipAccessSchema`).

```ts
AdminServerModule.forRootAsync({
  useFactory: () => ({
    …,
    messages: {
      accounts: {
        noUser: '운영자를 찾을 수 없습니다.',
        alreadyResigned: '이미 퇴사 처리된 운영자입니다.',
        notResigned: '재직 중인 운영자는 퇴사일을 정정할 수 없습니다.',
        notResignedForRehire: '재직 중인 운영자는 재입사 처리할 수 없습니다.',
      },
      sessions: { noUser: '운영자를 찾을 수 없습니다.' },
      ipAccess: { noScopeUser: '대상 운영자를 찾을 수 없습니다.' },
      ipAccessSchema: { scopeRefRequired: '팀 · 운영자 규칙은 대상을 골라야 합니다.' },
    },
  }),
})
```

- 4xx 의 `message` 와 `details.issues[].message` 만 바뀐다. 5xx 고정 문구 · 로그 · 감사 행(상태 · 코드만 남는다)은 그대로다.
- 🔴 문구는 글자로 맞춘다 — 같은 기본 글자를 쓰는 묶음은 함께 바뀐다(`accounts.noUser` = `sessions.noUser`, `accounts.noTeam` = `teams.noTeam`). 같은 글자를 서로 다르게 덮으면 기동에서 멈춘다. 모르는 묶음 · 키(오타) · 빈 문구도 기동에서 멈춘다.
- 표에 없는 글자(zod 기본 문구 · 본문 초과 413 같은 고정 문구)는 덮지 않는다.
- 한 단어를 일괄 치환하는 옵션은 없다 — 한국어 조사(을/를 · 은/는)가 단어의 받침에 따라 바뀐다. 화면 문구는 admin-ui README 「용어 바꾸기」.
````

「역할 · 권한」 절:

- 첫 코드 블록의 `definePermissions(…)` 예시 두 번째 인자를 바꾼다:

```ts
  {
    implies: { 'org.users:write': ['org.users:read'], 'org.roles:write': ['org.roles:read'] },
    // 전체 권한('*') 역할만 가질 수 있는 키 — IP 접근 제어를 켜면 ipAccess.manage 의 키가 여기 있어야 뜬다
    fullAccessOnly: [],
  },
```

- 「권한 상승」 목록 항목 뒤에 더한다:

```markdown
- **전권 전용 키**: 카탈로그 `fullAccessOnly` 의 키는 `'*'` 역할만 갖는다 — 일반 역할의 만들기 · 권한 수정에 그 키가 있으면 400 `issues[{ path: ['permissions'] }]`(「전체 권한 역할만 가질 수 있는 권한이 들어 있습니다.」). 이름 · 기본 표시만 고치는 수정과 사용자 배정은 보지 않는다. 업그레이드 전에 그 키를 받은 일반 역할은 효력이 그대로다 — 찾아서 뺀다: `SELECT role_no, role_name FROM roles WHERE JSON_CONTAINS(permissions, '"<키>"')`(admin-ui 역할 화면에서는 그 칸이 켜진 채 끌 수만 있다). 🔴 IP 접근 제어(`AdminIpAccessModule`)를 켠 앱은 `ipAccess.manage` 의 키를 여기 넣어야 `AdminRolesModule` 이 뜬다.
```

- 「역할 · 권한」의 `useRoleEditor({ … })` 예시에서 `implies: permissions.implies, // 🔴 서버 정규화와 같은 표` 줄 뒤에 `fullAccessOnly: permissions.fullAccessOnly, // 🔴 서버 역할 쓰기와 같은 표` 를 더한다.

「IP 접근 제어」 절의 `- **주의**: …` 항목에서 「전체 권한 관리자에게만 준다.」 를 아래로 바꾼다:

```markdown
🔴 그래서 카탈로그에 전권 전용으로 표시한다 — `definePermissions(…, { fullAccessOnly: ['<ipAccess.manage 키>'] })`. 표시가 없으면 `AdminRolesModule` 이 기동에서 멈추고, 일반 역할에 그 키를 넣는 역할 쓰기는 400 이다(역할 모듈이 없는 앱은 킷 안에 역할 쓰기 길이 없어 보지 않는다).
```

- [ ] **Step 2: admin-ui README**

「역할 · 설정」의 `useRoleEditor({ … })` 예시에서 `implies: { … },` 줄 뒤에 `fullAccessOnly: permissions.fullAccessOnly, // 전권 전용 칸 — 꺼져 있으면 켤 수 없다(켜진 기존 역할은 끌 수 있다)` 를 더한다.

「용어 바꾸기」 표의 마지막 행 뒤에 행을 더한다:

```markdown
| 서버 오류 문구 | admin-server `AdminServerModule` 옵션 `messages` — admin-server README 「오류 문구 바꾸기」 |
```

Run: `pnpm exec prettier --write packages/admin-server/README.md packages/admin-ui/README.md` 두 번 → `--check` 통과.

- [ ] **Step 3: changeset**

`.changeset/admin-kit-full-access-messages.md`:

```markdown
---
'@ssworks/admin-shared': minor
'@ssworks/admin-server': minor
'@ssworks/admin-ui': minor
---

ringside 둘째 보고 반영(PR 2g — `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md`).

- admin-shared: `definePermissions(…, { fullAccessOnly })` · 카탈로그 `fullAccessOnly` — 전체 권한(`'*'`) 역할만 가질 수 있는 키. 표시 없는 키가 표시된 키를 함의하면 정의할 때 던진다.
- admin-server:
  - 역할 만들기 · 권한 수정에 전권 전용 키가 있고 `'*'` 가 아니면 400 `ERR_COMMON_VALIDATION`(`issues[{ path: ['permissions'] }]`). 이름 · 기본 표시만 고치는 수정 · 사용자 배정은 보지 않는다 — 업그레이드 전에 그 키를 받은 역할은 효력이 그대로다(README 「역할 · 권한」 정리 절차).
  - 🔴 IP 접근 제어(`AdminIpAccessModule`)를 켠 앱은 카탈로그에 `fullAccessOnly: [<ipAccess.manage 키>]` 를 더해야 `AdminRolesModule` 이 기동한다.
  - 🔴 peer `@ssworks/admin-shared` 하한 0.9.0(`>=0.9.0 <1.0.0`) — 카탈로그 모양 검사가 `fullAccessOnly` 를 요구한다.
  - `AdminServerModule` 옵션 `messages` — 서버 오류 문구를 키별로 덮는다(키는 `ADMIN_SERVER_DEFAULT_MESSAGES`, 타입 `AdminServerMessages`). 같은 기본 글자는 함께 바뀌고, 오타 · 같은 글자를 다르게 덮기는 기동에서 멈춘다. 5xx 고정 문구 · 로그 · 감사는 그대로.
- admin-ui: `useRoleEditor({ fullAccessOnly })` — 표시된 칸은 꺼져 있으면 켤 수 없다(켜진 기존 역할은 끌 수 있다). 보통 `catalog.fullAccessOnly` 를 넘긴다.
```

- [ ] **Step 4: 진행 문서**

`CLAUDE.md`:

- 진행표 — `| Phase 4 — 첫 신규 프로젝트(ringside) 실전 검증 → 1.0 |` 행 바로 앞에:

```markdown
| Phase 2 후속 PR 2g — 전권 전용 · 서버 문구(카탈로그 `fullAccessOnly` · 역할 쓰기 400 · IP 슬롯 기동 검사 · `useRoleEditor` 칸 · `messages` 덮어쓰기) | 완료 | 스펙 `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md` · 플랜 `docs/superpowers/plans/2026-10-20-admin-kit-full-access-messages.md` |
```

- 「`@ssworks/admin-server` (Phase 2)」 규약 목록에서 「역할 · 사용자 쓰기의 권한 상승은 …」 항목 바로 뒤에:

```markdown
- 전권 전용 키는 카탈로그 `fullAccessOnly` 하나로 정한다 — 역할 쓰기 400 은 `accounts/full-access.ts` 의 `assertFullAccessOnly`(정규화 뒤 · 트랜잭션 앞), IP 슬롯 기동 검사는 `assertIpManageFullAccessOnly`(`AdminRolesModule`). 서버 오류 문구 덮기는 `http/messages.ts` 의 표를 예외 필터 한 곳에서 적용한다 — 문구를 쓰는 곳은 고치지 않는다. 새 문구 표(`export const *_MESSAGES`)는 `ADMIN_SERVER_DEFAULT_MESSAGES` 묶음에 더한다(`messages.test.ts` 정적 검사).
```

`docs/01-phase0.md` §8 — PR #3i 문단 바로 뒤에 빈 줄을 두고:

```markdown
전권 전용 · 서버 문구 PR 2g(2026-10-20) 완료 — admin-shared `definePermissions(…, { fullAccessOnly })` · admin-server 일반 역할 쓰기 400 · IP 모듈을 켠 앱의 `ipAccess.manage` 표시 기동 검사 · peer 하한 0.9.0 · `AdminServerModule` 옵션 `messages`(서버 오류 문구 키별 덮기 — 예외 필터 한 곳) · admin-ui `useRoleEditor({ fullAccessOnly })`(스펙 `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md` · 플랜 `docs/superpowers/plans/2026-10-20-admin-kit-full-access-messages.md`).
```

`docs/HANDOFF.md`:

- 「지금 상태」 `@ssworks/admin-shared` 행 끝(마지막 문장 「`tsc` 빌드」 뒤)에 아래 글을 붙인다(앞에 공백 하나):

```markdown
PR 2g 가 `definePermissions` 의 `fullAccessOnly` 를 더했다(0.9.0 예정).
```

- 「지금 상태」 `@ssworks/admin-server` 행의 「597 테스트 + 실 MariaDB 468.」 앞에 아래 글을 넣는다(뒤에 공백 하나):

```markdown
**PR 2g**(전권 전용 · 서버 문구 — 일반 역할 쓰기 400 · IP 슬롯 표시 기동 검사 · peer 하한 0.9.0 · `messages` 덮어쓰기)는 구현 완료 · `main` 에 로컬 병합(2026-10-20) — 0.9.0 예정.
```

그리고 「597 테스트 + 실 MariaDB 468.」 의 숫자를 Task 7 에서 잰 값으로 바꾼다.

- 「지금 상태」 「다음 플랜」 행 머리의 「**PR #3i 뒤**: … (0.9.0 ×3).」 문장 전체를 아래로 바꾼다:

```markdown
**PR #3i · 2g 뒤**: 사람이 `main` push → Version Packages PR(0.9.0 ×3 — major 없음) 머지 → 셋 스테이징 → `pnpm stage approve` ×3 → 태그. 그다음 ringside 적용(아래 「PR 2g 가 넘긴 것」 — 공개 하루 뒤 설치) · 템플릿 세션 입력.
```

- 「알려진 미확인·보류」의 「PR #3i 가 넘긴 것」 묶음 뒤에:

```markdown
- **PR 2g 가 넘긴 것(2026-10-20)** — 같은 스펙
  - **ringside 적용법(서버 몫 — 0.9.0 공개 하루 뒤 설치, 자동으로 붙은 `minimumReleaseAgeExclude` 는 커밋하지 않는다)**: ① 카탈로그 `definePermissions(…, { fullAccessOnly: ['settings.ipAccess:write'] })` — 없으면 `AdminRolesModule` 이 기동에서 멈춘다 ② 역할 화면 `useRoleEditor({ fullAccessOnly: catalog.fullAccessOnly })` — 매트릭스 `canPick` 을 감싼 바인딩은 지운다 ③ 서버 `messages`(admin-server README 「오류 문구 바꾸기」 예시 — accounts 넷 · sessions · ipAccess · ipAccessSchema) ④ 일반 역할에 그 키가 남아 있지 않은지 README 의 SQL 로 확인한다. UI 몫(scopes · DEFAULT import · 정렬 메모 · gap)은 「PR #3i 가 넘긴 것」.
  - **템플릿 세션 입력**(`preset/admin` — push 는 사람): 킷 핀 0.5.0 → 0.9.0 · 역할 페이지 `useRoleEditor({ fullAccessOnly })` · 카탈로그 `fullAccessOnly` 는 IP 모듈을 켜는 절 「IP 접근 제어 켜기」에 함께(템플릿은 IP 모듈을 꺼 둔다) · 0.8.0 입력(「PR #3h 가 넘긴 것」)과 함께.
  - 남은 것: 판정에서 전권 전용 키 빼기(결정 ④ 버린 안)는 하지 않았다 — 업그레이드 전 역할은 사람이 정리한다.
```

Run: `pnpm exec prettier --write CLAUDE.md docs/01-phase0.md docs/HANDOFF.md .changeset/admin-kit-full-access-messages.md` 두 번 → `--check` 통과.

- [ ] **Step 5: 전체 검사**

Run: `pnpm check` → lint → typecheck → test → build → check:dts 모두 초록.
Run: `pnpm format:check` → 통과.

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-server/README.md packages/admin-ui/README.md .changeset/admin-kit-full-access-messages.md CLAUDE.md docs/01-phase0.md docs/HANDOFF.md
git commit -m "docs: PR 2g — README(전권 전용 · 오류 문구 바꾸기) · changeset · 진행 문서

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 실 DB 두 버전 · changeset status · 서버 스모크 · 검증 기록

**Files:**

- Modify: `docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md` (PR #3i 가 만든 파일 — §5 부터 더한다)
- Modify: `docs/HANDOFF.md` (「지금 상태」 검증 행 · admin-server 행 테스트 수)
- 저장소 밖(커밋하지 않음): `$LOCALAPPDATA/Temp/aksg/` — 짧은 경로

**Interfaces:**

- Consumes: Task 1~6 의 빌드 산출물
- Produces: 검증 기록

- [ ] **Step 1: 실 MariaDB 11.4 · 12.3**

```bash
docker start admin-kit-test-db
pnpm test:db
docker start admin-kit-test-db-12
ADMIN_TEST_DB_URL=mariadb://root:admin-kit-test@127.0.0.1:33307 pnpm test:db
```

(PowerShell 이면 `$env:ADMIN_TEST_DB_URL='mariadb://root:admin-kit-test@127.0.0.1:33307'; pnpm test:db`. 🔴 둘을 겹쳐 돌리지 않는다. 12.3 컨테이너가 없으면 `pnpm db:test:up:12.3`.)
Expected: 둘 다 초록 — 테스트 수를 적어 둔다(검증 기록 · HANDOFF). 20초 근처 시간 초과 흔들림이면 한 번 다시 돌리고, 같은 테스트가 또 빨가면 멈추고 보고한다.

- [ ] **Step 2: changeset status**

Run: `pnpm exec changeset status --verbose`
Expected: 세 패키지 모두 `minor` → 0.9.0, major 없음. admin-server 의 admin-shared peer(`workspace:>=0.9.0 <1.0.0`) 때문에 `must depend on the current version` 비치명 경고가 보일 수 있다(로컬 admin-shared 가 0.8.0 — 2f-2b 와 같다). 1.0.0 이 보이면 멈추고 보고한다.

- [ ] **Step 3: 서버 스모크 앱**

Git Bash 에서(포그라운드):

```bash
node -e "require('fs').rmSync(process.env.LOCALAPPDATA + '/Temp/aksg', { recursive: true, force: true })"
mkdir -p "$LOCALAPPDATA/Temp/aksg/src"
pnpm --filter @ssworks/admin-shared pack --pack-destination "$LOCALAPPDATA/Temp/aksg"
pnpm --filter @ssworks/admin-server pack --pack-destination "$LOCALAPPDATA/Temp/aksg"
ls "$LOCALAPPDATA/Temp/aksg"
```

tarball 이름(지금 버전 — 0.8.0)을 확인하고 앱 파일을 Write 도구로 쓴다.

`package.json`(tarball 이름은 위 `ls` 값):

```json
{
  "name": "aksg",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.8.1",
  "scripts": { "build": "tsc", "check": "node dist/check.js" },
  "dependencies": {
    "@kim5257/kysely-mariadb-dialect": "^0.2.0",
    "@nestjs/common": "^12.0.0",
    "@nestjs/core": "^12.0.0",
    "@nestjs/platform-express": "^12.0.0",
    "@ssworks/admin-server": "file:./ssworks-admin-server-0.8.0.tgz",
    "@ssworks/admin-shared": "file:./ssworks-admin-shared-0.8.0.tgz",
    "kysely": "^0.29.0",
    "mariadb": "^3.4.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^24.0.0",
    "typescript": "6.0.3"
  }
}
```

(🔴 로컬 tarball 은 0.8.0 이고 admin-server peer 는 `>=0.9.0 <1.0.0` 이라 설치가 peer 경고를 낸다 — 발행본은 함께 0.9.0 이라 나지 않는다. 경고를 기록하고 넘어간다.)

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

`src/check.ts` — DB 없이 닿는 것만 잰다(닿지 않는 DB — 풀은 연결 실패를 로그로만 낸다):

```ts
import 'reflect-metadata'
import type { DynamicModule } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  ADMIN_SERVER_DEFAULT_MESSAGES,
  AdminAuthModule,
  AdminIpAccessModule,
  AdminRolesModule,
  AdminServerModule,
  configureAdminApp,
  type AdminServerMessages,
} from '@ssworks/admin-server'
import { definePermissions } from '@ssworks/admin-shared'

const KEYS = {
  ROLES_READ: 'org.roles:read',
  ROLES_WRITE: 'org.roles:write',
  IP_READ: 'setting.ipAccess:read',
  IP_WRITE: 'setting.ipAccess:write',
} as const
const implies = { 'setting.ipAccess:write': ['setting.ipAccess:read'] } as const
const marked = definePermissions(KEYS, { implies, fullAccessOnly: ['setting.ipAccess:write'] })
const unmarked = definePermissions(KEYS, { implies })
const messages: AdminServerMessages = { auth: { unauthorized: '운영자 로그인이 필요합니다.' } }

class Root {}
const firstLine = (error: unknown) =>
  String((error as Error).message).split(String.fromCharCode(10))[0]

function root(catalog: typeof marked, extra: { messages?: unknown } = {}): DynamicModule {
  return {
    module: Root,
    imports: [
      AdminServerModule.forRoot({
        db: { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' },
        auth: { jwtSecret: 'aksg-smoke-jwt-secret-0123456789abcdef' },
        permissions: {
          'roles.read': 'org.roles:read',
          'roles.manage': 'org.roles:write',
          'ipAccess.read': 'setting.ipAccess:read',
          'ipAccess.manage': 'setting.ipAccess:write',
        },
        permissionCatalog: catalog,
        messages,
        ...(extra as { messages?: AdminServerMessages }),
      }),
      AdminAuthModule,
      AdminRolesModule,
      AdminIpAccessModule,
    ],
  }
}

async function boot(module: DynamicModule): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(module, { logger: false })
  configureAdminApp(app)
  await app.init()
  return app
}

for (const [label, module] of [
  ['unmarked', root(unmarked)],
  ['typo', root(marked, { messages: { acounts: {} } })],
] as const) {
  try {
    await boot(module)
    console.log(label, 'BOOTED')
  } catch (error) {
    console.log(label, 'ERR', firstLine(error))
  }
}

const app = await boot(root(marked))
await app.listen(0)
const response = await fetch(`${await app.getUrl()}/admin/auth/me`)
const body = (await response.json()) as { code?: string; message?: string }
console.log('me', response.status, body.code, body.message)
console.log('defaults', Object.keys(ADMIN_SERVER_DEFAULT_MESSAGES).join(','))
console.log('fullAccessOnly', JSON.stringify(marked.fullAccessOnly))
await app.close()
process.exit(0)
```

- [ ] **Step 4: 설치 · 타입 · 실행**

```bash
cd "$LOCALAPPDATA/Temp/aksg"
pnpm install
pnpm build
pnpm check
```

Expected:

- `pnpm build`(`tsc`, `skipLibCheck: false`) **0건** — 발행 d.ts 의 `AdminServerMessages` · `fullAccessOnly` 가 소비자 쪽에서 깨지지 않는다.
- `pnpm check` 출력:
  - `unmarked ERR AdminRolesModule — IP 접근 제어를 켰다면 ipAccess.manage 의 키(setting.ipAccess:write)를 전권 전용으로 표시한다: …`
  - `typo ERR AdminServerModule 옵션 messages 를 해석할 수 없다 — 모르는 묶음: acounts. …`
  - `me 401 ERR_COMMON_UNAUTHORIZED 운영자 로그인이 필요합니다.`
  - `defaults auth,accounts,sessions,audit,teams,legal,ipAccess,ipAccessSchema`
  - `fullAccessOnly ["setting.ipAccess:write"]`

다르면 멈추고 값 그대로 보고한다(고치지 않는다). 끝나면 `node -e "require('fs').rmSync(process.env.LOCALAPPDATA + '/Temp/aksg', { recursive: true, force: true })"`.

- [ ] **Step 5: 검증 기록 · HANDOFF**

`docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md` 의 §4 뒤에 더한다(실제 값으로 — 지어내지 않는다):

```markdown
## 5. 저장소(PR 2g)

- 브랜치 `feat/admin-kit-full-access-messages` · 끝 커밋 `<해시>`
- `pnpm check` 초록 — 워크스페이스 <N> 테스트
- `pnpm test:db` — 11.4 <N> · 12.3 <N>
- `changeset status` — <결과>

## 6. 서버 스모크(`$LOCALAPPDATA/Temp/aksg`)

| 항목                         | 기대                                                        | 실제 |
| ---------------------------- | ----------------------------------------------------------- | ---- |
| `tsc`(`skipLibCheck: false`) | 0건                                                         | <값> |
| 표시 없는 카탈로그 + IP 모듈 | 기동 실패(F6 문구)                                          | <값> |
| `messages` 오타              | 기동 실패(모르는 묶음)                                      | <값> |
| 덮은 401                     | 401 · ERR_COMMON_UNAUTHORIZED · 운영자 로그인이 필요합니다. | <값> |
| 묶음 키                      | 여덟                                                        | <값> |

## 7. 남은 것

- <측정 중 본 것 · 기대와 다른 값 · 사람이 볼 것(설치 peer 경고 포함)>
```

`docs/HANDOFF.md` 「지금 상태」 「검증」 행 끝에 붙인다(앞에 공백 하나, `<…>` 는 실제 값):

```markdown
PR 2g(2026-10-20)는 Windows 에서 pnpm check 초록 · pnpm test:db 11.4 <N> · 12.3 <N> 초록, changeset status 0.9.0 ×3(major 없음), 서버 스모크(`$LOCALAPPDATA/Temp/aksg` — skipLibCheck: false tsc 0건 · 표시 없는 카탈로그 기동 실패 · messages 오타 기동 실패 · 덮인 401 문구)를 통과했다 — docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md §5 ~ §7.
```

그리고 admin-server 행의 테스트 수(Task 6 Step 4 에서 남긴 자리)를 Step 1 값으로 고친다.

Run: `pnpm exec prettier --write docs/HANDOFF.md` 두 번 → `--check` 통과.

```bash
git add docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md docs/HANDOFF.md
git commit -m "docs: PR 2g 검증 기록 — 실 DB 11.4 · 12.3 · changeset status · 서버 스모크

Co-Authored-By: Claude <noreply@anthropic.com>"
```

브랜치 끝: whole-branch 리뷰(opus) → 사람이 정한 대로 `main` 에 로컬 병합(push · PR · Version Packages 머지 · `pnpm stage approve` 는 사람).
