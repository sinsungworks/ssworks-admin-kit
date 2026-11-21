# IP 접근 제어 확장 범위 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IP 접근 제어에 관리자 밖 주체(첫 소비자 — 출고 관리 서비스의 출고 토큰)에 거는 「확장 범위」 를 더한다 — 두 층 판정, 관리자 판정과 양방향 분리, 기존 `/admin/ip-access` 라우트 · 화면 재사용.

**Architecture:** admin-shared 에 이름 규칙 · 두 층 판정 `evaluateScopedIpAccess` 를 두고, admin-server 는 코어 옵션 `ipAccess.extraScopes`(대상 훅 `lock` · `names`)로 범위를 등록받아 쓰기를 코어 갈래(잔존 가드 안)와 확장 갈래(잔존 밖)로 나누며, 관리자 판정의 규칙 읽기는 코어 셋만 고른다. 쓰는 쪽은 `AdminIpExtraScopeService.allows` 로 판정한다. admin-ui 는 `useIpAccessRules` 에 `extraScopes` · `focus` · `openCreate(prefill)` 을 더하고 확장 규칙에는 미리보기를 부르지 않는다(`'unrelated'`).

**Tech Stack:** TypeScript 6 · zod 4 · NestJS · Kysely(MariaDB 11.4 · 12.3) · Vue 3 + Vuetify 4 · vitest 5 · happy-dom

**스펙:** `docs/superpowers/specs/2026-11-21-admin-kit-ip-extra-scopes-design.md` — 결정 X1~X12 · §3 ~ §10. 이 플랜의 이름(함수 · 키 · 문구)은 스펙과 같다. 스펙과 어긋나면 스펙이 맞다 — 멈추고 보고한다.

**브랜치:** `feat/ip-extra-scopes`(이미 있다 — 스펙 커밋 `bc3e8ca`). Task 마다 로컬 커밋. 🔴 push · 발행 · `pnpm stage approve` 는 하지 않는다.

**공통 규칙(모든 Task):**

- 저장소 `CLAUDE.md` 를 따른다 — prettier(세미콜론 없음 · 작은따옴표 · 100자), `import type` 분리(admin-server/src 는 DI 예외), 상대 import `.js`, `console.log` 금지, `/dev/null` 금지(Windows), 파일을 python 으로 다시 쓰지 않는다(LF).
- 새 파일 머리 주석에 `정본:` 과 `바꾼 점:`(정본이 없으면 `정본: 없음 — 확장 범위 스펙 …`)을 적는다. `🔴` 주석은 지우기 전에 아직 참인지 본다.
- admin-shared 를 고친 Task 는 `pnpm --filter @ssworks/admin-shared build` 를 돌린 뒤 admin-ui · admin-server 를 잰다(admin-ui 는 `dist/` 를 import 한다).
- DB 시험(`*.db.test.ts`)은 `pnpm db:test:up`(MariaDB 11.4 · 33306)이 떠 있어야 한다. 한 파일만: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts <경로>`.
- 커밋 메시지는 한국어 conventional commits, 끝 줄은 `Co-Authored-By: Claude <noreply@anthropic.com>`.
- 계획에 없는 타입 오류 · 시험 실패가 나와 고칠 길이 스펙 밖이면 멈추고 **BLOCKED** 로 보고한다(스펙을 넘어 즉흥으로 고치지 않는다).

## 파일 지도

| 파일                                                                                               | 책임                                                 | Task      |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| `packages/admin-shared/src/ip-access.ts`                                                           | 이름 규칙 · 갈래 · 두 층 판정 · 스키마 넓히기 · 문구 | 1         |
| `packages/admin-server/src/ip-access/options.ts`                                                   | `ipAccess.extraScopes` 옵션 · 해석 · 기동 검사       | 2         |
| `packages/admin-server/src/ip-access/scope-check.ts`(새)                                           | 범위 판정 하나(코어 · 확장) · 갈래 비교              | 2         |
| `packages/admin-server/src/ip-access/errors.ts`                                                    | 문구 넷 · `scopeTypeError`                           | 2         |
| `packages/admin-server/src/ip-access/rule-set.ts` · `queries.ts`                                   | 관리자 판정 · 미리보기 읽기를 코어 셋으로            | 3         |
| `packages/admin-server/src/ip-access/rule-views.ts`(새)                                            | 응답 행 모양 · 확장 대상 이름(훅)                    | 3         |
| `packages/admin-server/src/ip-access/extra-scope-queries.ts`(새)                                   | 쓰는 쪽 읽기 쿼리                                    | 3         |
| `packages/admin-server/src/ip-access/extra-scope.service.ts`(새)                                   | `AdminIpExtraScopeService`                           | 3         |
| `packages/admin-server/src/ip-access/ip-access.body.ts` · `ip-access.service.ts` · `rule-locks.ts` | 쓰기 갈래 · 대상 잠금                                | 4         |
| `packages/admin-server/src/test-support/ip-access.ts` · `admin-app.ts`                             | 시험 대역(probe_tokens) · 앱 옵션                    | 2 · 3 · 5 |
| `packages/admin-ui/src/components/ip-access/ip-scope-choices.ts`(새)                               | 선택지 키 · 범위 카탈로그 · 미리 채움 판정           | 6         |
| `packages/admin-ui/src/components/ip-access/ip-access.ts`                                          | 폼 · 표기 · 문구 · `'unrelated'`                     | 1 · 6     |
| `packages/admin-ui/src/composables/useIpPreview.ts`                                                | `'unrelated'` 상태                                   | 7         |
| `packages/admin-ui/src/composables/useIpAccessRules.ts`                                            | 확장 범위 흐름 · focus · openCreate(prefill)         | 1 · 7 · 8 |
| `packages/admin-ui/src/components/ip-access/*.vue`                                                 | 부품                                                 | 1 · 9     |
| README 둘 · `CLAUDE.md` · `docs/HANDOFF.md` · `docs/01-phase0.md` · `.changeset/*` · peer          | 기록 · 판                                            | 10        |
| `docs/verification/2026-11-21-admin-kit-ip-extra-scopes.md`(새)                                    | 검증 기록                                            | 11        |

---

### Task 1: 공유 계약 · 스키마 넓히기 (모델: `sonnet`)

admin-shared 에 이름 규칙 · 갈래 · 두 층 판정을 더하고, 규칙 응답 · 본문 스키마의 `scopeType` 을 넓힌다. 넓힌 타입 때문에 깨지는 admin-server · admin-ui 자리는 **동작을 바꾸지 않고** 타입만 따라가게 한다(확장 범위 동작은 Task 2 뒤).

**Files:**

- Modify: `packages/admin-shared/src/ip-access.ts`
- Modify: `packages/admin-shared/src/index.ts`(ip-access export 목록)
- Test: `packages/admin-shared/src/ip-access.test.ts`
- Modify(타입만): `packages/admin-server/src/ip-access/ip-access.body.ts` · `packages/admin-server/src/ip-access/ip-access.service.ts`
- Modify(타입만): `packages/admin-ui/src/components/ip-access/ip-access.ts` · `packages/admin-ui/src/composables/useIpAccessRules.ts` · `packages/admin-ui/src/components/ip-access/IpRuleEditor.vue`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `packages/admin-shared/src/ip-access.test.ts` 의 import 목록에 `IP_EXTRA_SCOPE_TYPE_PATTERN`, `adminIpRuleSchema`, `evaluateScopedIpAccess`, `ipRuleScopeTypeSchema`, `isCoreIpScopeType`, `isIpExtraScopeTypeName` 을 더하고 파일 끝에 붙인다:

```ts
describe('확장 범위 — 이름 · 갈래(확장 범위 스펙 X1)', () => {
  it('이름 규칙 — 영소문자로 시작하는 영숫자 1~16자', () => {
    expect(IP_EXTRA_SCOPE_TYPE_PATTERN.test('shippingToken')).toBe(true)
    expect(isIpExtraScopeTypeName('shippingToken')).toBe(true)
    expect(isIpExtraScopeTypeName('a')).toBe(true)
    expect(isIpExtraScopeTypeName('a'.repeat(16))).toBe(true)
    expect(isIpExtraScopeTypeName('a'.repeat(17))).toBe(false)
    expect(isIpExtraScopeTypeName('')).toBe(false)
    expect(isIpExtraScopeTypeName('ShippingToken')).toBe(false)
    expect(isIpExtraScopeTypeName('1token')).toBe(false)
    expect(isIpExtraScopeTypeName('shipping_token')).toBe(false)
    expect(isIpExtraScopeTypeName('shippingToken:*')).toBe(false)
  })

  it('🔴 코어 이름과 대소문자 무시로 겹치면 거짓', () => {
    for (const name of ['global', 'team', 'user', 'gLOBAL', 'tEAM', 'uSER']) {
      expect(isIpExtraScopeTypeName(name), name).toBe(false)
    }
  })

  it('isCoreIpScopeType — 코어 셋만', () => {
    expect(['global', 'team', 'user'].every(isCoreIpScopeType)).toBe(true)
    expect(isCoreIpScopeType('shippingToken')).toBe(false)
    expect(isCoreIpScopeType('Global')).toBe(false)
  })
})

describe('확장 범위 — 두 층 판정(evaluateScopedIpAccess · 스펙 §3-3)', () => {
  const token = (
    cidr: string,
    scopeRefNo: bigint | null = 7n,
    scopeType = 'shippingToken',
  ): IpRule => ({ scopeType, scopeRefNo, cidr })
  const of = (scopeRefNo = 7n) => ({ scopeType: 'shippingToken', scopeRefNo })

  it('🔴 규칙이 없으면 거부 · 주소가 null 이면 거부', () => {
    expect(evaluateScopedIpAccess('203.0.113.9', [], of())).toBe(false)
    expect(evaluateScopedIpAccess(null, [token('0.0.0.0/0', null)], of())).toBe(false)
  })

  it('대상 층 — 그 대상의 규칙 하나라도 맞으면 통과', () => {
    const rules = [token('198.51.100.0/24'), token('203.0.113.0/24')]
    expect(evaluateScopedIpAccess('203.0.113.9', rules, of())).toBe(true)
    expect(evaluateScopedIpAccess('192.0.2.1', rules, of())).toBe(false)
  })

  it('🔴 가장 가까운 층 하나 — 대상 규칙이 있으면 범위 전체 규칙을 보지 않는다', () => {
    const rules = [token('0.0.0.0/0', null), token('203.0.113.0/24')]
    expect(evaluateScopedIpAccess('192.0.2.1', rules, of())).toBe(false)
    expect(evaluateScopedIpAccess('192.0.2.1', rules, of(8n))).toBe(true)
  })

  it('대상 규칙이 없으면 범위 전체 규칙 · 둘 다 없으면 거부', () => {
    expect(evaluateScopedIpAccess('203.0.113.9', [token('203.0.113.0/24', null)], of())).toBe(true)
    expect(evaluateScopedIpAccess('192.0.2.1', [token('203.0.113.0/24', null)], of())).toBe(false)
  })

  it('🔴 R3b — 코어 규칙(global 시드 0.0.0.0/0 · ::/0)은 확장 판정에 쓰이지 않는다', () => {
    const rules = [
      rule('global', '0.0.0.0/0'),
      rule('global', '::/0'),
      rule('user', '0.0.0.0/0', 7n),
    ]
    expect(evaluateScopedIpAccess('203.0.113.9', rules, of())).toBe(false)
  })

  it('다른 확장 범위 · 다른 대상의 규칙은 보지 않는다', () => {
    const rules = [token('0.0.0.0/0', 7n, 'apiKey'), token('0.0.0.0/0', 8n)]
    expect(evaluateScopedIpAccess('203.0.113.9', rules, of())).toBe(false)
  })

  it('🔴 코어 이름으로 부르면 던진다 — 주소가 null 이어도', () => {
    expect(() =>
      evaluateScopedIpAccess('203.0.113.9', [], { scopeType: 'global', scopeRefNo: 1n }),
    ).toThrow('evaluateScopedIpAccess')
    expect(() => evaluateScopedIpAccess(null, [], { scopeType: 'user', scopeRefNo: 1n })).toThrow(
      'evaluateScopedIpAccess',
    )
  })

  it('🔴 R3a — 관리자 판정은 확장 범위 행을 보지 않는다(번호가 userNo 와 같아도)', () => {
    const rules = [token('0.0.0.0/0', null), token('203.0.113.0/24', 1n)]
    const admin = { userNo: 1n, teamNos: [] }
    expect(applicableIpLayer(rules, admin)).toBeNull()
    expect(evaluateIpAccess('203.0.113.9', rules, admin)).toBe(false)
    expect(applicableIpLayer([...rules, rule('global', '0.0.0.0/0')], admin)).toBe('global')
  })
})

describe('규칙 스키마의 범위 이름(스펙 §3-2)', () => {
  it('ipRuleScopeTypeSchema — 코어 셋 · 확장 이름을 받고 형식 밖은 한 문구', () => {
    for (const value of ['global', 'team', 'user', 'shippingToken']) {
      expect(ipRuleScopeTypeSchema.parse(value)).toBe(value)
    }
    for (const value of ['', 'Shipping', 'shipping_token', 'a'.repeat(17), 'GLOBAL']) {
      const failed = ipRuleScopeTypeSchema.safeParse(value)
      expect(failed.success, value).toBe(false)
      expect(failed.error?.issues.map((issue) => issue.message)).toEqual([
        IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid,
      ])
    }
  })

  it('응답 · 만들기 · 수정 스키마가 확장 이름을 받는다', () => {
    const row = {
      ruleNo: 3n,
      scopeType: 'shippingToken',
      scopeRefNo: 7n,
      scopeName: '작업대 1',
      scopeUserId: null,
      cidr: '203.0.113.7/32',
      description: null,
      revision: 0,
      createAt: '2026-11-21T00:00:00.000Z',
      updateAt: '2026-11-21T00:00:00.000Z',
    }
    expect(adminIpRuleSchema.parse(row).scopeType).toBe('shippingToken')
    expect(
      adminIpRuleCreateSchema.parse({
        scopeType: 'shippingToken',
        scopeRefNo: null,
        cidr: '10.0.0.0/8',
      }).scopeType,
    ).toBe('shippingToken')
    expect(
      adminIpRuleUpdateSchema.parse({ scopeType: 'shippingToken', revision: 0 }).scopeType,
    ).toBe('shippingToken')
    expect(
      adminIpRuleCreateSchema.safeParse({ scopeType: 'Bad!', scopeRefNo: null, cidr: '10.0.0.0/8' })
        .success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-shared exec vitest run src/ip-access.test.ts`
Expected: FAIL — `isIpExtraScopeTypeName` 등이 export 되지 않았다.

- [ ] **Step 3: admin-shared 를 고친다** — `packages/admin-shared/src/ip-access.ts`

(a) 파일 머리 `바꾼 점:` 목록 끝에 한 줄을 더한다:

```ts
//  - 확장 범위(확장 범위 스펙 2026-11-21): 관리자 밖 주체(출고 토큰 등)에 거는 규칙. 이름 규칙 · 갈래 · 두 층 판정(evaluateScopedIpAccess)
//    을 여기 둔다. 🔴 관리자 판정(evaluateIpAccess)과 확장 판정은 서로의 행을 보지 않는다(R3 양방향).
```

(b) `IpRule` 의 `scopeType` 을 넓힌다:

```ts
export interface IpRule {
  /** 코어 셋(global · team · user) 또는 확장 범위 이름. 🔴 관리자 평가는 코어 밖 값을 무시한다 */
  scopeType: string
  /** global · 범위 전체면 null. team · user · 확장 대상의 번호(다형 참조) */
  scopeRefNo: bigint | null
  cidr: string
}
```

(c) `IP_SCOPE_TYPES` 선언 바로 아래에 더한다:

```ts
/**
 * 확장 범위 이름(관리자 밖 주체 — 출고 토큰 등) — 영소문자로 시작하는 영숫자 1~16자(장 0012 `scope_type varchar(16)` · `ascii_bin`).
 * 🔴 밑줄 · 쌍점을 받지 않는다 — 화면이 범위 전체 선택지 키에 `:*` 를 붙인다(확장 범위 스펙 X11).
 */
export const IP_EXTRA_SCOPE_TYPE_PATTERN = /^[a-z][A-Za-z0-9]{0,15}$/

/** 코어 셋(global · team · user)인가 */
export function isCoreIpScopeType(type: string): type is IpScopeType {
  return (IP_SCOPE_TYPES as readonly string[]).includes(type)
}

/** 확장 범위 이름으로 쓸 수 있는가 — 🔴 코어 이름과 대소문자 무시로 겹치면 거짓(`Global` 금지 — X1) */
export function isIpExtraScopeTypeName(name: string): boolean {
  if (!IP_EXTRA_SCOPE_TYPE_PATTERN.test(name)) return false
  const lower = name.toLowerCase()
  return !IP_SCOPE_TYPES.some((core) => core === lower)
}
```

(d) `evaluateIpAccess` 함수 바로 아래에 더한다:

```ts
export interface IpScopedSubject {
  /** 확장 범위 이름 — 🔴 코어 이름이면 던진다 */
  scopeType: string
  /** 그 주체의 번호(예: 출고 토큰 번호) */
  scopeRefNo: bigint
}

/**
 * 이 주소로 이 확장 범위 주체가 들어올 수 있는가(확장 범위 스펙 §3-3 · R2).
 * 그 범위 행만 본다 → 대상 층(scopeRefNo 같음)이 하나라도 있으면 그것만 → 없으면 범위 전체 층(scopeRefNo null) → 둘 다 없으면 거부.
 * 🔴 코어 이름이면 던진다 — 코어 규칙(global 시드 포함)이 확장 판정에 들어올 길을 막는다(R3b). 주소보다 먼저 본다.
 * 🔴 범위 전체 층을 끈 범위(서버 wholeScope: false)는 서버 읽기가 NULL 행을 빼고 넘긴다 — 이 함수는 그 설정을 모른다.
 */
export function evaluateScopedIpAccess(
  ip: string | null,
  rules: readonly IpRule[],
  subject: IpScopedSubject,
): boolean {
  if (isCoreIpScopeType(subject.scopeType)) {
    throw new Error(
      `evaluateScopedIpAccess 는 확장 범위만 판정한다 — 코어 범위(${subject.scopeType})는 evaluateIpAccess 다`,
    )
  }
  if (ip === null) return false
  const own = rules.filter((rule) => rule.scopeType === subject.scopeType)
  const target = own.filter((rule) => rule.scopeRefNo === subject.scopeRefNo)
  const layer = target.length > 0 ? target : own.filter((rule) => rule.scopeRefNo === null)
  return layer.some((rule) => ipInCidr(ip, rule.cidr))
}
```

(e) `IP_ACCESS_SCHEMA_MESSAGES` 에 한 줄을 더한다(마지막 키 뒤):

```ts
  scopeTypeInvalid: '범위 이름이 형식에 맞지 않습니다.',
```

(f) `ipScopeTypeSchema` 선언 아래에 더한다:

```ts
/**
 * 규칙의 범위 — 코어 셋 또는 확장 범위 이름(X1). 🔴 응답 · 본문 스키마용이다 — 서버 파이프가 "코어 ∪ 등록된 이름" 으로 다시
 * 좁힌다. 미리보기 쿼리 · 층 칸은 코어 셋(ipScopeTypeSchema) 그대로다(X9).
 */
export const ipRuleScopeTypeSchema = z
  .string()
  .refine((type) => isCoreIpScopeType(type) || isIpExtraScopeTypeName(type), {
    message: IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid,
  })
```

(g) `adminIpRuleSchema` · `adminIpRuleCreateSchema` 의 `scopeType: ipScopeTypeSchema` 를 `scopeType: ipRuleScopeTypeSchema` 로, `adminIpRuleUpdateSchema` 의 `scopeType: ipScopeTypeSchema.optional()` 을 `scopeType: ipRuleScopeTypeSchema.optional()` 로 바꾼다. `adminIpRuleSchema` 의 `scopeName` 주석을 `/** 팀 이름 · 사용자 이름 · 확장 대상 이름(서버 훅). global · 범위 전체거나 대상이 지워졌으면 null */` 로 바꾼다. `adminIpPreviewQuerySchema` · `adminIpPreviewItemSchema` 는 그대로 둔다.

(h) `packages/admin-shared/src/index.ts` 의 ip-access export 목록에 `IP_EXTRA_SCOPE_TYPE_PATTERN`, `isCoreIpScopeType`, `isIpExtraScopeTypeName`, `evaluateScopedIpAccess`, `ipRuleScopeTypeSchema`, `type IpScopedSubject` 를 더한다(`evaluateIpAccess` 와 `ipScopeTypeSchema` 옆).

- [ ] **Step 4: admin-shared 시험 · 빌드**

Run: `pnpm --filter @ssworks/admin-shared exec vitest run src/ip-access.test.ts && pnpm --filter @ssworks/admin-shared build`
Expected: PASS, 빌드 성공.

- [ ] **Step 5: admin-server 를 타입만 따라가게 한다**(동작 그대로 — 확장 범위는 Task 4 가 연다)

`packages/admin-server/src/ip-access/ip-access.body.ts` — import 에 `ipScopeTypeSchema` 를 더하고, 만들기 · 수정 파이프의 extend 에 코어 enum 을 다시 건다:

```ts
adminIpRuleCreateSchema
  // Task 1 — 공유 스키마가 넓어졌다. 확장 범위를 받는 것은 Task 4 의 파이프다 — 그때까지 코어 셋만(지금 동작)
  .extend({ scopeType: ipScopeTypeSchema, currentPassword: currentPasswordField(config.reauth) })
```

```ts
      adminIpRuleUpdateSchema.extend({
        scopeType: ipScopeTypeSchema.optional(),
        currentPassword: currentPasswordField(config.reauth),
      }),
```

`packages/admin-server/src/ip-access/ip-access.service.ts` — 본문 타입이 넓어진 `scopeType` 을 받지 않게 좁힌다(파이프와 같은 모양):

```ts
export type AdminIpRuleCreateBody = Omit<AdminIpRuleCreate, 'scopeType'> & {
  scopeType: IpScopeType
  currentPassword?: string
}
export type AdminIpRuleUpdateBody = Omit<AdminIpRuleUpdate, 'scopeType'> & {
  scopeType?: IpScopeType
  currentPassword?: string
}
```

- [ ] **Step 6: admin-ui 를 타입만 따라가게 한다**(동작 그대로)

`packages/admin-ui/src/components/ip-access/ip-access.ts`:

```ts
/** 칸 값은 문자열 — scopeRefNo '' = 없음. scopeType 은 범위 선택지 키(Task 6 — 코어는 층 이름 그대로) */
export interface IpRuleForm {
  scopeType: string
  scopeRefNo: string
  cidr: string
  description: string
}
```

- `scopeTypeLabel(scopeType: IpScopeType, …)` → `scopeTypeLabel(scopeType: string, …)`(본문 그대로).
- `scopeTypeItems(messages, scopes, current?: IpScopeType)` → `current?: string`(본문 그대로).
- `emptyIpRuleForm(scopeType: IpScopeType = 'global')` → `scopeType: string = 'global'`.
- `withScopeType(form, scopeType: IpScopeType)` → `scopeType: string`.
- `previewQueryOf` — `const { form } = target` 다음 줄에 `if (!isCoreIpScopeType(form.scopeType)) return null` 를 넣고, import 에 `isCoreIpScopeType` 을 더한다(그 아래 `scopeType: form.scopeType` 가 코어로 좁혀진다).

`packages/admin-ui/src/composables/useIpAccessRules.ts` — `updateForm` 의 목록 밖 검사:

```ts
if (
  next.scopeType !== form.value.scopeType &&
  !(scopes as readonly string[]).includes(next.scopeType)
)
  return
```

`packages/admin-ui/src/components/ip-access/IpRuleEditor.vue`:

```ts
const targetScope = computed(() =>
  props.form.scopeType === 'team' || props.form.scopeType === 'user' ? props.form.scopeType : null,
)
```

```ts
function patchScope(value: unknown): void {
  if (typeof value === 'string' && scopeTypes.includes(value)) {
    emit('update:form', { ...props.form, scopeType: value })
  }
}
```

(`IpScopeType` import 가 쓰이지 않게 되면 지운다.)

- [ ] **Step 7: 워크스페이스 타입 · 시험**

Run: `pnpm typecheck && pnpm test`
Expected: 둘 다 PASS. 위 다섯 자리 밖에서 타입 오류가 나면 BLOCKED 로 보고한다.

- [ ] **Step 8: 커밋**

```bash
git add packages/admin-shared packages/admin-server/src/ip-access packages/admin-ui/src
git commit -m "$(cat <<'EOF'
feat(admin-shared): IP 확장 범위 이름 규칙 · 두 층 판정 evaluateScopedIpAccess · 규칙 스키마 scopeType 넓히기

서버 · 화면은 타입만 따라간다(동작 그대로 — 확장 범위는 다음 Task).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 서버 옵션 · 문구 · 범위 판정 (모델: `sonnet`)

코어 옵션 `ipAccess.extraScopes` 를 해석하고(기동 검사), 범위 판정을 한 함수로 둔다. 이 Task 는 아직 쓰기 경로를 바꾸지 않는다.

**Files:**

- Modify: `packages/admin-server/src/ip-access/options.ts`
- Modify: `packages/admin-server/src/options.ts`
- Modify: `packages/admin-server/src/ip-access/errors.ts`
- Create: `packages/admin-server/src/ip-access/scope-check.ts`
- Modify: `packages/admin-server/src/test-support/ip-access.ts`
- Test: `packages/admin-server/src/ip-access/options.test.ts`(새) · `packages/admin-server/src/ip-access/scope-check.test.ts`(새) · `packages/admin-server/src/ip-access/ip-access.module.test.ts`

- [ ] **Step 1: 실패하는 시험 — 옵션 해석** — `packages/admin-server/src/ip-access/options.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveIpAccessConfig, type AdminIpScopeTarget } from './options.js'

// 확장 범위 옵션(확장 범위 스펙 §4-1). 🔴 문제를 모아 한 번에 던진다 — 하나 고치고 다시 띄우기를 되풀이하지 않게.

const target: AdminIpScopeTarget = {
  async lock() {
    return true
  },
  async names() {
    return new Map()
  },
}

const resolve = (ipAccess: unknown) => resolveIpAccessConfig({ ipAccess: ipAccess as never })

describe('resolveIpAccessConfig — ipAccess', () => {
  it('없으면 확장 범위가 비었다 — 지금과 같다', () => {
    const config = resolveIpAccessConfig({})
    expect(config.extraScopes.size).toBe(0)
    expect(config.reauth).toBe(false)
    expect(config.clientIp).toBe('req.ip')
  })

  it('등록 — 이름 · 기본 wholeScope true · 끈 wholeScope · 옵션 순서', () => {
    const config = resolve({
      extraScopes: [
        { type: 'shippingToken', target },
        { type: 'apiKey', wholeScope: false, target },
      ],
    })
    expect([...config.extraScopes.keys()]).toEqual(['shippingToken', 'apiKey'])
    expect(config.extraScopes.get('shippingToken')).toMatchObject({
      type: 'shippingToken',
      wholeScope: true,
    })
    expect(config.extraScopes.get('apiKey')?.wholeScope).toBe(false)
    expect(config.extraScopes.get('apiKey')?.target).toBe(target)
  })

  it('빈 extraScopes 는 지금과 같다', () => {
    expect(resolve({ extraScopes: [] }).extraScopes.size).toBe(0)
    expect(resolve({}).extraScopes.size).toBe(0)
  })

  it.each<[string, unknown, string]>([
    ['객체가 아님', 'shippingToken', 'ipAccess 는 { extraScopes } 객체여야 한다'],
    ['모르는 키', { extra: [] }, 'ipAccess 에 모르는 키: extra'],
    ['배열이 아님', { extraScopes: {} }, 'ipAccess.extraScopes 는 배열이어야 한다'],
    [
      '항목이 객체가 아님',
      { extraScopes: ['x'] },
      'ipAccess.extraScopes[0] 는 { type, target } 객체여야 한다',
    ],
    [
      '이름 규칙 밖',
      { extraScopes: [{ type: 'Shipping', target }] },
      'ipAccess.extraScopes[0].type 은',
    ],
    [
      '🔴 코어 이름(대소문자 무시)',
      { extraScopes: [{ type: 'gLOBAL', target }] },
      'ipAccess.extraScopes[0].type 은',
    ],
    [
      'wholeScope 가 boolean 아님',
      { extraScopes: [{ type: 'a', wholeScope: 'yes', target }] },
      'ipAccess.extraScopes[0].wholeScope 는 true · false 여야 한다',
    ],
    [
      '훅 없음',
      { extraScopes: [{ type: 'a', target: { lock: () => true } }] },
      'ipAccess.extraScopes[0].target 은 lock · names 함수를 가진 객체여야 한다',
    ],
    [
      '🔴 권한 키(R7 없음)',
      { extraScopes: [{ type: 'a', target, permissions: { read: 'x', manage: 'y' } }] },
      'ipAccess.extraScopes[0].permissions — 확장 범위에는 권한 키를 두지 않는다',
    ],
    [
      '모르는 항목 키',
      { extraScopes: [{ type: 'a', target, label: '출고' }] },
      'ipAccess.extraScopes[0] 에 모르는 키: label',
    ],
    [
      '이름 겹침(대소문자 무시)',
      {
        extraScopes: [
          { type: 'shippingToken', target },
          { type: 'shippingtoken', target },
        ],
      },
      'ipAccess.extraScopes 의 이름이 겹친다: shippingtoken',
    ],
  ])('🔴 %s — 기동에서 멈춘다', (_name, ipAccess, message) => {
    expect(() => resolve(ipAccess)).toThrow('AdminIpAccessModule 의 ipAccess 옵션이 맞지 않다 — ')
    expect(() => resolve(ipAccess)).toThrow(message)
  })

  it('문제를 모아 한 번에 던진다', () => {
    expect(() =>
      resolve({
        extraScopes: [
          { type: 'Bad', target: null },
          { type: 'global', target },
        ],
      }),
    ).toThrow(
      /extraScopes\[0\]\.type .* \/ .*extraScopes\[0\]\.target .* \/ .*extraScopes\[1\]\.type/,
    )
  })
})
```

(마지막 정규식은 백슬래시를 쓰지만 시험 파일이라 괜찮다 — 저장소 규칙은 `ip-access.ts` 의 런타임 정규식에 대한 것이다. 거슬리면 `toThrow` 를 세 번 나눠 부른다.)

- [ ] **Step 2: 실패하는 시험 — 범위 판정** — `packages/admin-server/src/ip-access/scope-check.test.ts`:

```ts
import { IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { resolveIpAccessConfig, type AdminIpScopeTarget } from './options.js'
import { isKnownScopeType, ruleScopeProblem, sameScopeFamily } from './scope-check.js'

const target: AdminIpScopeTarget = {
  async lock() {
    return true
  },
  async names() {
    return new Map()
  },
}
const config = resolveIpAccessConfig({
  ipAccess: {
    extraScopes: [
      { type: 'shippingToken', target },
      { type: 'apiKey', wholeScope: false, target },
    ],
  },
})

describe('범위 판정(scope-check — 스펙 §4-2 · X2)', () => {
  it('isKnownScopeType — 코어 셋 ∪ 등록된 이름', () => {
    expect(
      ['global', 'team', 'user', 'shippingToken', 'apiKey'].every((t) =>
        isKnownScopeType(config, t),
      ),
    ).toBe(true)
    expect(isKnownScopeType(config, 'gone')).toBe(false)
    expect(isKnownScopeType(resolveIpAccessConfig({}), 'shippingToken')).toBe(false)
  })

  it('코어는 ipScopeProblem 그대로', () => {
    expect(ruleScopeProblem(config, { scopeType: 'global', scopeRefNo: null })).toBeNull()
    expect(ruleScopeProblem(config, { scopeType: 'global', scopeRefNo: 1n })).toEqual({
      path: 'scopeRefNo',
      message: IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden,
    })
    expect(ruleScopeProblem(config, { scopeType: 'team', scopeRefNo: null })).toEqual({
      path: 'scopeRefNo',
      message: IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired,
    })
  })

  it('확장 — 대상 하나 · 범위 전체(wholeScope) · 꺼진 범위 전체 · 모르는 범위', () => {
    expect(ruleScopeProblem(config, { scopeType: 'shippingToken', scopeRefNo: 7n })).toBeNull()
    expect(ruleScopeProblem(config, { scopeType: 'shippingToken', scopeRefNo: null })).toBeNull()
    expect(ruleScopeProblem(config, { scopeType: 'apiKey', scopeRefNo: null })).toEqual({
      path: 'scopeRefNo',
      message: IP_ACCESS_MESSAGES.wholeScopeOff,
    })
    expect(ruleScopeProblem(config, { scopeType: 'gone', scopeRefNo: 1n })).toEqual({
      path: 'scopeType',
      message: IP_ACCESS_MESSAGES.unknownScopeType,
    })
  })

  it('🔴 sameScopeFamily — 코어끼리 · 같은 확장 범위만', () => {
    expect(sameScopeFamily('global', 'user')).toBe(true)
    expect(sameScopeFamily('team', 'shippingToken')).toBe(false)
    expect(sameScopeFamily('shippingToken', 'global')).toBe(false)
    expect(sameScopeFamily('shippingToken', 'apiKey')).toBe(false)
    expect(sameScopeFamily('shippingToken', 'shippingToken')).toBe(true)
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/ip-access/options.test.ts src/ip-access/scope-check.test.ts`
Expected: FAIL — `scope-check.js` 가 없고 `resolveIpAccessConfig` 가 `ipAccess` 를 모른다.

- [ ] **Step 4: 옵션을 쓴다** — `packages/admin-server/src/ip-access/options.ts` 전체를 바꾼다:

```ts
import { isIpExtraScopeTypeName } from '@ssworks/admin-shared'
import type { Kysely, Transaction } from 'kysely'
import { resolveClientIpSource, type AdminClientIpSource } from '../auth/request-meta.js'
import type { AdminDatabase } from '../database/types.js'
import type { AdminServerOptions } from '../options.js'

// 정본: 없음 — 2f-1 스펙 2-2 #2 · #3(코어 옵션 reauth · clientIp) + 확장 범위 스펙 §4-1(ipAccess.extraScopes — IP 모듈의 첫 옵션).
// 🔴 확장 범위에는 권한 키가 없다(확장 범위 스펙 ① — R7 없음). 코어 슬롯 ipAccess.read · ipAccess.manage 가 모든 규칙을 다룬다.

/**
 * 확장 범위의 대상(쓰는 쪽 개체 — 출고 토큰 등)을 킷이 확인 · 표시하는 훅(확장 범위 스펙 X5).
 * 🔴 메서드 꼴로 선언한다 — 매개변수 이변성 덕에 쓰는 쪽이 `Transaction<Database>`(Database extends AdminDatabase)로 적어도
 *    옵션에 들어간다. 속성 꼴(`lock: (trx) => …`)로 바꾸면 strictFunctionTypes 가 막는다(options.types.test.ts).
 */
export interface AdminIpScopeTarget<DB extends AdminDatabase = AdminDatabase> {
  /** 🔴 쓰기 트랜잭션 안 — 대상 행을 FOR UPDATE 로 잠그고, 있으면 true. 없으면 400 issues[scopeRefNo] */
  lock(trx: Transaction<DB>, refNo: bigint): Promise<boolean>
  /** 목록 · 응답의 대상 이름. 없는 번호는 빼고 돌려준다(→ scopeName null). 빈 배열로는 부르지 않는다 */
  names(db: Kysely<DB>, refNos: readonly bigint[]): Promise<ReadonlyMap<bigint, string>>
}

export interface AdminIpExtraScope<DB extends AdminDatabase = AdminDatabase> {
  /** scope_type 값 — 영소문자로 시작하는 영숫자 1~16자, 코어 이름(global · team · user)과 대소문자 무시로 다름 */
  type: string
  /** 기본 true — scopeRefNo NULL(범위 전체) 규칙을 받고 판정에 쓴다(확장 범위 스펙 X7) */
  wholeScope?: boolean
  target: AdminIpScopeTarget<DB>
}

export interface AdminIpAccessOptions {
  /** 관리자 밖 주체에 거는 IP 규칙 범위. 없거나 비면 지금과 같다 */
  extraScopes?: readonly AdminIpExtraScope[]
}

export interface ResolvedIpExtraScope {
  readonly type: string
  readonly wholeScope: boolean
  readonly target: AdminIpScopeTarget
}

export interface ResolvedIpAccessConfig {
  /** 켜면 IP 쓰기가 본문 currentPassword 로 재인증한다 — 역할 · 사용자와 같은 스위치(코어 reauth) */
  readonly reauth: boolean
  /** 자기 잠금 · 미리보기 · 쓰는 쪽 판정이 보는 요청자 주소의 출처 — 인증과 같은 해석 */
  readonly clientIp: AdminClientIpSource
  /** 등록된 확장 범위 — 이름 → 설정(옵션 순서). 비었으면 지금과 같다 */
  readonly extraScopes: ReadonlyMap<string, ResolvedIpExtraScope>
}

const OPTION_KEYS: readonly string[] = ['extraScopes']
const SCOPE_KEYS: readonly string[] = ['type', 'wholeScope', 'target']

/** 🔴 기동에서 멈춘다: reauth 가 boolean 이 아님, clientIp 가 두 값 밖, ipAccess 형식 밖(문제를 모아 한 번에) */
export function resolveIpAccessConfig(
  options: Pick<AdminServerOptions, 'reauth' | 'clientIp' | 'ipAccess'>,
): ResolvedIpAccessConfig {
  if (options.reauth !== undefined && typeof options.reauth !== 'boolean') {
    throw new Error('reauth 는 true · false 여야 한다.')
  }
  return Object.freeze({
    reauth: options.reauth === true,
    clientIp: resolveClientIpSource(options.clientIp),
    extraScopes: resolveExtraScopes(options.ipAccess),
  })
}

function resolveExtraScopes(raw: unknown): ReadonlyMap<string, ResolvedIpExtraScope> {
  const scopes = new Map<string, ResolvedIpExtraScope>()
  if (raw === undefined) return scopes
  const problems: string[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    problems.push('ipAccess 는 { extraScopes } 객체여야 한다')
  } else {
    for (const key of Object.keys(raw)) {
      if (!OPTION_KEYS.includes(key)) problems.push(`ipAccess 에 모르는 키: ${key}`)
    }
    const list = (raw as { extraScopes?: unknown }).extraScopes
    if (list !== undefined && !Array.isArray(list)) {
      problems.push('ipAccess.extraScopes 는 배열이어야 한다')
    } else if (Array.isArray(list)) {
      // 🔴 대소문자 무시로 겹침을 본다 — ascii_bin 이라 DB 에서는 다른 값이지만 사람에게는 같은 이름이다
      const seen = new Set<string>()
      list.forEach((item: unknown, index) => {
        const scope = resolveExtraScope(item, `ipAccess.extraScopes[${index}]`, problems)
        if (scope === null) return
        const key = scope.type.toLowerCase()
        if (seen.has(key)) {
          problems.push(`ipAccess.extraScopes 의 이름이 겹친다: ${scope.type}`)
          return
        }
        seen.add(key)
        scopes.set(scope.type, scope)
      })
    }
  }
  if (problems.length > 0) {
    throw new Error(`AdminIpAccessModule 의 ipAccess 옵션이 맞지 않다 — ${problems.join(' / ')}`)
  }
  return scopes
}

function resolveExtraScope(
  raw: unknown,
  place: string,
  problems: string[],
): ResolvedIpExtraScope | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    problems.push(`${place} 는 { type, target } 객체여야 한다`)
    return null
  }
  const before = problems.length
  for (const key of Object.keys(raw)) {
    if (key === 'permissions') {
      problems.push(
        `${place}.permissions — 확장 범위에는 권한 키를 두지 않는다(코어 슬롯 ipAccess.read · ipAccess.manage 가 다룬다)`,
      )
    } else if (!SCOPE_KEYS.includes(key)) {
      problems.push(`${place} 에 모르는 키: ${key}`)
    }
  }
  const { type, wholeScope, target } = raw as {
    type?: unknown
    wholeScope?: unknown
    target?: unknown
  }
  if (typeof type !== 'string' || !isIpExtraScopeTypeName(type)) {
    problems.push(
      `${place}.type 은 영소문자로 시작하는 영숫자 1~16자이고 global · team · user 와 달라야 한다: ${JSON.stringify(type)}`,
    )
  }
  if (wholeScope !== undefined && typeof wholeScope !== 'boolean') {
    problems.push(`${place}.wholeScope 는 true · false 여야 한다`)
  }
  if (!isTarget(target)) {
    problems.push(`${place}.target 은 lock · names 함수를 가진 객체여야 한다`)
  }
  if (problems.length > before) return null
  return Object.freeze({
    type: type as string,
    wholeScope: wholeScope !== false,
    target: target as AdminIpScopeTarget,
  })
}

function isTarget(value: unknown): value is AdminIpScopeTarget {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.lock === 'function' && typeof candidate.names === 'function'
}
```

`packages/admin-server/src/options.ts` — import 에 `import type { AdminIpAccessOptions } from './ip-access/options.js'` 를 더하고 `clientIp` 옵션 아래에 더한다:

```ts
  /**
   * IP 접근 제어의 확장 범위(확장 범위 스펙 §4-1) — 관리자 밖 주체(장치 토큰 · 외부 API 키 …)에 거는 IP 규칙. 예:
   * `{ extraScopes: [{ type: 'shippingToken', target: { lock, names } }] }`. 🔴 이름 규칙 밖 · 코어 이름과 겹침 · 훅 없음 ·
   * 모르는 키(권한 키 포함)는 `AdminIpAccessModule` 이 기동에서 멈춘다. 없으면 지금과 같다. 쓰는 쪽 판정은
   * `AdminIpExtraScopeService`. 확장 범위 규칙도 슬롯 `ipAccess.read` · `ipAccess.manage` 가 다룬다.
   */
  ipAccess?: AdminIpAccessOptions
```

- [ ] **Step 5: 문구 · 범위 판정을 쓴다**

`packages/admin-server/src/ip-access/errors.ts` — `IP_ACCESS_MESSAGES` 에 넷을 더하고(🔴 기본 글자는 다른 키와 겹치지 않게 — 2g), 머리 주석 `바꾼 점:` 끝에 `확장 범위 문구 넷(확장 범위 스펙 §4-7).` 을 덧붙인다:

```ts
  unknownScopeType: '등록되지 않은 범위입니다.',
  scopeTypeLocked: '이 규칙의 범위 종류는 바꿀 수 없습니다. 지우고 새로 만드세요.',
  wholeScopeOff: '이 범위의 규칙은 대상을 골라야 합니다.',
  noScopeTarget: '규칙이 가리킬 대상을 찾을 수 없습니다.',
```

같은 파일 `scopeRefError` 아래에 더한다:

```ts
/** 400 ERR_COMMON_VALIDATION + issues[{ path: ['scopeType'] }] — 모르는 범위 · 갈래를 넘는 수정 */
export function scopeTypeError(message: string): BusinessError {
  return validationError([{ path: ['scopeType'], code: 'custom', message }], message)
}
```

`packages/admin-server/src/ip-access/scope-check.ts`(새):

```ts
import { ipScopeProblem, isCoreIpScopeType } from '@ssworks/admin-shared'
import { IP_ACCESS_MESSAGES, scopeRefError, scopeTypeError } from './errors.js'
import type { ResolvedIpAccessConfig } from './options.js'

// 정본: 없음 — 확장 범위 스펙 §4-2 · §4-3 · X2. 범위 판정을 한 곳에 — 만들기 파이프와 수정의 병합 결과가 같은 함수를 쓴다
//   (hangang R30 — 다른 판정을 두 번 적으면 "저장은 됐는데 어느 층에도 안 걸리는" 행이 생긴다).

export interface RuleScope {
  scopeType: string
  scopeRefNo: bigint | null
}

export interface RuleScopeProblem {
  path: 'scopeType' | 'scopeRefNo'
  message: string
}

type ScopeConfig = Pick<ResolvedIpAccessConfig, 'extraScopes'>

/** 이 앱이 받는 범위 이름인가 — 코어 셋 ∪ 등록된 확장 범위 */
export function isKnownScopeType(config: ScopeConfig, scopeType: string): boolean {
  return isCoreIpScopeType(scopeType) || config.extraScopes.has(scopeType)
}

/** 범위 불변식 — 코어는 ipScopeProblem(global ⇔ 대상 없음), 확장은 등록 · wholeScope(X7 · X8). 맞으면 null */
export function ruleScopeProblem(config: ScopeConfig, scope: RuleScope): RuleScopeProblem | null {
  if (isCoreIpScopeType(scope.scopeType)) {
    const message = ipScopeProblem({ scopeType: scope.scopeType, scopeRefNo: scope.scopeRefNo })
    return message === null ? null : { path: 'scopeRefNo', message }
  }
  const extra = config.extraScopes.get(scope.scopeType)
  if (extra === undefined)
    return { path: 'scopeType', message: IP_ACCESS_MESSAGES.unknownScopeType }
  if (scope.scopeRefNo === null && !extra.wholeScope) {
    return { path: 'scopeRefNo', message: IP_ACCESS_MESSAGES.wholeScopeOff }
  }
  return null
}

/** ruleScopeProblem 이 있으면 400(그 칸) */
export function assertRuleScope(config: ScopeConfig, scope: RuleScope): void {
  const problem = ruleScopeProblem(config, scope)
  if (problem === null) return
  throw problem.path === 'scopeType'
    ? scopeTypeError(problem.message)
    : scopeRefError(problem.message)
}

/** 같은 갈래인가 — 코어끼리, 또는 같은 확장 범위(X2 — 수정은 갈래를 넘지 않는다) */
export function sameScopeFamily(a: string, b: string): boolean {
  return isCoreIpScopeType(a) ? isCoreIpScopeType(b) : a === b
}
```

- [ ] **Step 6: 시험 대역 설정을 해석 함수로** — `packages/admin-server/src/test-support/ip-access.ts`

- import 에 `import { resolveIpAccessConfig, type AdminIpAccessOptions, type ResolvedIpAccessConfig } from '../ip-access/options.js'` (기존 `ResolvedIpAccessConfig` type import 와 합친다).
- (`IpRuleSeed.scopeType` 은 아직 넓히지 않는다 — 표 타입이 `IpScopeType` 인 동안 넓히면 `seedIpRule` 이 컴파일되지 않는다. Task 3 Step 5 가 표 타입과 함께 넓힌다.)
- `ipAccessConfig` 를 바꾼다:

```ts
/** IP 서비스 설정 — 재인증 기본 꺼짐 · 출처 req.ip · 확장 범위 없음. 🔴 앱과 같은 해석 함수를 지난다 */
export function ipAccessConfig(
  reauth = false,
  clientIp: AdminClientIpSource = 'req.ip',
  ipAccess?: AdminIpAccessOptions,
): ResolvedIpAccessConfig {
  return resolveIpAccessConfig({
    reauth,
    clientIp,
    ...(ipAccess === undefined ? {} : { ipAccess }),
  })
}
```

`grep -rn "ResolvedIpAccessConfig = \|Object.freeze({ reauth" packages/admin-server/src` 로 설정 객체를 손으로 만드는 곳이 더 있는지 보고, 있으면 `ipAccessConfig(…)` 로 바꾼다.

- [ ] **Step 7: 기동 시험** — `packages/admin-server/src/ip-access/ip-access.module.test.ts` 의 `describe` 끝에 더한다:

```ts
it('🔴 ipAccess 옵션 오류는 기동에서 멈춘다 — 권한 키는 받지 않는다(R7 없음)', async () => {
  await expect(
    boot([AdminAuthModule, AdminIpAccessModule], {
      ipAccess: {
        extraScopes: [
          {
            type: 'shippingToken',
            permissions: { read: 'a', manage: 'b' },
            target: { lock: async () => true, names: async () => new Map() },
          } as never,
        ],
      },
    }),
  ).rejects.toThrow('ipAccess.extraScopes[0].permissions — 확장 범위에는 권한 키를 두지 않는다')
})
```

- [ ] **Step 8: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/ip-access/options.test.ts src/ip-access/scope-check.test.ts src/ip-access/ip-access.module.test.ts src/http/messages.test.ts && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS(문구 정적 검사 `messages.test.ts` 포함).

- [ ] **Step 9: 커밋**

```bash
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): IP 확장 범위 옵션 ipAccess.extraScopes · 기동 검사 · 범위 판정 scope-check · 문구 넷

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 서버 읽기 — 코어 셋 · 목록 이름 · 쓰는 쪽 서비스 (모델: `sonnet`)

관리자 판정 · 미리보기의 규칙 읽기를 코어 셋으로 좁히고(R3a 첫 겹), 목록에 확장 대상 이름을 붙이고, 쓰는 쪽 판정 서비스 `AdminIpExtraScopeService` 를 낸다.

**Files:**

- Modify: `packages/admin-server/src/ip-access/rule-set.ts` · `packages/admin-server/src/ip-access/queries.ts`
- Modify: `packages/admin-server/src/database/tables/ip-access-rules.ts`
- Create: `packages/admin-server/src/ip-access/rule-views.ts` · `packages/admin-server/src/ip-access/extra-scope-queries.ts` · `packages/admin-server/src/ip-access/extra-scope.service.ts`
- Modify: `packages/admin-server/src/ip-access/ip-access.service.ts` · `packages/admin-server/src/ip-access/ip-access.module.ts` · `packages/admin-server/src/index.ts`
- Modify: `packages/admin-server/src/test-support/ip-access.ts`
- Test: `packages/admin-server/src/ip-access/queries.test.ts` · `packages/admin-server/src/ip-access/extra-scope.service.db.test.ts`(새) · `packages/admin-server/src/ip-access/ip-access.service.db.test.ts`

- [ ] **Step 1: 실패하는 시험 — 컴파일된 SQL** — `packages/admin-server/src/ip-access/queries.test.ts` 의 import 에 `import { countScopeRulesQuery, scopeRulesQuery } from './extra-scope-queries.js'` 를 더하고 끝에 붙인다:

```ts
describe('🔴 관리자 판정은 코어 셋만 읽는다(확장 범위 스펙 §4-5 · R3a)', () => {
  it('정책 · 잔존 · 자기 잠금(ipRuleSetQuery) · 미리보기(identifiedRulesQuery)', () => {
    for (const query of [ipRuleSetQuery(db), identifiedRulesQuery(db)]) {
      const compiled = query.compile()
      expect(compiled.sql).toContain('`scope_type` in (?, ?, ?)')
      expect(compiled.parameters).toEqual(['global', 'team', 'user'])
    }
  })

  it('목록은 전부 — 확장 범위 행도 싣는다', () => {
    expect(ruleViewQuery(db).compile().sql).not.toContain('`scope_type` in')
  })
})

describe('쓰는 쪽 읽기(extra-scope-queries — 스펙 §4-6)', () => {
  it('rulesOf — 그 범위 전부 · 범위 전체를 끄면 NULL 행을 뺀다', () => {
    const all = scopeRulesQuery(db, 'shippingToken', { wholeScope: true }).compile()
    expect(all.sql).toBe(
      'select `scope_type`, `scope_ref_no`, `cidr` from `ip_access_rules` where `scope_type` = ? order by `rule_no`',
    )
    expect(all.parameters).toEqual(['shippingToken'])
    expect(scopeRulesQuery(db, 'shippingToken', { wholeScope: false }).compile().sql).toContain(
      'where `scope_type` = ? and `scope_ref_no` is not null',
    )
  })

  it('allows — 그 대상 · 범위 전체 행만(인덱스 idxIpAccessRulesScope)', () => {
    const both = scopeRulesQuery(db, 'shippingToken', { wholeScope: true, refNo: 7n }).compile()
    expect(both.sql).toContain(
      'where `scope_type` = ? and (`scope_ref_no` = ? or `scope_ref_no` is null)',
    )
    expect(both.parameters).toEqual(['shippingToken', 7n])
    expect(
      scopeRulesQuery(db, 'shippingToken', { wholeScope: false, refNo: 7n }).compile().sql,
    ).toContain('where `scope_type` = ? and `scope_ref_no` = ?')
  })

  it('countRulesOf — 그 대상 번호의 행만 · 잠금 없음', () => {
    const compiled = countScopeRulesQuery(db, 'shippingToken', 7n).compile()
    expect(compiled.sql).toBe(
      'select count(*) as `n` from `ip_access_rules` where `scope_type` = ? and `scope_ref_no` = ?',
    )
    expect(compiled.sql.toLowerCase()).not.toContain('for update')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/ip-access/queries.test.ts`
Expected: FAIL — `extra-scope-queries.js` 가 없고 코어 조건이 없다.

- [ ] **Step 3: 쿼리를 고치고 새로 쓴다**

`packages/admin-server/src/ip-access/rule-set.ts`:

```ts
import { IP_SCOPE_TYPES } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts loadRules(평가에 필요한 세 열)
// 바꾼 점: 쿼리 하나로 둔다 — IP 정책(매 인증) · 잔존 셈 · 자기 잠금 판정이 같은 모양을 읽는다(2f-1 스펙 P2 · P4 · P6).
//   확장 범위 스펙 §4-5(R3a): 코어 셋만 읽는다 — 관리자 판정이 확장 범위 행을 아예 보지 않는다(둘째 겹은 evaluateIpAccess 가
//   모르는 범위를 무시하는 것). 목록을 두 번 적지 않게 IP_SCOPE_TYPES 에서 만든다.
// 🔴 비잠금 읽기다. 여기에 FOR UPDATE 를 붙이지 않는다 — 인증 hot path 가 서로를 막고, 잔존 셈의 잠금은 교착 배치다(hangang).

export function ipRuleSetQuery(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('ipAccessRules')
    .select(['scopeType', 'scopeRefNo', 'cidr'])
    .where('scopeType', 'in', IP_SCOPE_TYPES)
}
```

(Kysely 가 `readonly` 튜플을 받지 않으면 `[...IP_SCOPE_TYPES]` 로 넘긴다.)

`packages/admin-server/src/ip-access/queries.ts` — `identifiedRulesQuery` 에 같은 조건을 더하고(`.select(...)` 다음 줄 `.where('scopeType', 'in', IP_SCOPE_TYPES)`, import 추가), 그 함수 주석을 `/** 미리보기의 지금 규칙 — 시뮬레이션이 대상을 지목하는 ruleNo 포함. 🔴 코어 셋만(확장 범위 스펙 X9 — 확장 규칙 번호의 수정 · 삭제 미리보기는 404). 🔴 잠금 없음 */` 로 바꾼다. 파일 머리 `바꾼 점:` 에 `- 미리보기 읽기는 코어 셋만(확장 범위 스펙 X9).` 를 더한다.

`packages/admin-server/src/database/tables/ip-access-rules.ts` — `scopeType: IpScopeType` 을 넓힌다:

```ts
/** 🔴 코어(`'global' | 'team' | 'user'`) 또는 확장 범위 이름 — ENUM 이 아니다(장 주석). 관리자 판정은 코어 셋만 읽는다 */
scopeType: string
```

(`IpScopeType` import 를 지운다.)

`packages/admin-server/src/ip-access/extra-scope-queries.ts`(새):

```ts
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 정본: 없음 — 확장 범위 스펙 §4-6(쓰는 쪽 판정 · 규칙 수). 🔴 비잠금 · 캐시 없음(코어 정책과 같은 이유 — 2f-1 P2).
// 인덱스 idxIpAccessRulesScope(scopeType, scopeRefNo)를 탄다. 🔴 모듈 수준 함수다 — DB 없이 컴파일된 SQL 을 단위 시험이 잰다.

export interface ScopeRulesFilter {
  /** 범위 전체 층을 판정에 쓰는가 — 꺼졌으면 NULL 행을 뺀다(X7) */
  wholeScope: boolean
  /** 주면 그 대상 행(+ 켜져 있으면 범위 전체 행)만 */
  refNo?: bigint
}

/** 한 확장 범위의 규칙 — 판정에 필요한 세 열 */
export function scopeRulesQuery(
  db: Kysely<AdminDatabase>,
  scopeType: string,
  filter: ScopeRulesFilter,
) {
  const base = db
    .selectFrom('ipAccessRules')
    .select(['scopeType', 'scopeRefNo', 'cidr'])
    .where('scopeType', '=', scopeType)
    .orderBy('ruleNo')
  const { refNo } = filter
  if (refNo === undefined) {
    return filter.wholeScope ? base : base.where('scopeRefNo', 'is not', null)
  }
  return filter.wholeScope
    ? base.where((eb) => eb.or([eb('scopeRefNo', '=', refNo), eb('scopeRefNo', 'is', null)]))
    : base.where('scopeRefNo', '=', refNo)
}

/** 이 대상을 가리키는 규칙 수 — wholeScope 와 무관하게 그 번호의 행만 */
export function countScopeRulesQuery(db: Kysely<AdminDatabase>, scopeType: string, refNo: bigint) {
  return db
    .selectFrom('ipAccessRules')
    .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
    .where('scopeType', '=', scopeType)
    .where('scopeRefNo', '=', refNo)
}
```

- [ ] **Step 4: 쿼리 시험 통과**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/ip-access/queries.test.ts`
Expected: PASS. (컴파일된 SQL 글자가 조금 다르면 — 괄호 · 공백 — 실제 출력에 맞추되 조건의 뜻은 바꾸지 않는다.)

- [ ] **Step 5: 시험 대역 — probe_tokens** — `packages/admin-server/src/test-support/ip-access.ts`

먼저 `IpRuleSeed.scopeType` 을 `string` 으로 넓히고(주석 `/** 코어 셋 또는 확장 범위 이름(대역 probeToken 등) */` — Step 3 이 표 타입을 넓혔다), `IpScopeType` import 가 쓰이지 않으면 지운다. 그리고 끝에 더한다(import 에 `sql`, `type Generated`, `type Transaction` 과 `type AdminIpExtraScope`, `type AdminIpScopeTarget` 를 더한다). 🔴 `probeScope()` 를 `ipAccessConfig(…, { extraScopes: [probeScope()] })` 에 넘기는 곳(Step 6 · 9)이 typecheck 에서 실패하면 — `AdminIpExtraScope<ProbeDatabase>` 가 `AdminIpExtraScope` 로 들어가지 않으면 — 스펙 X5(메서드 꼴 이변성)가 틀린 것이다. 고치지 말고 BLOCKED 로 보고한다:

```ts
/** 확장 범위 대역 이름 — 쓰는 쪽 출고 토큰 자리 */
export const PROBE_SCOPE = 'probeToken'

interface ProbeTokensTable {
  tokenNo: Generated<bigint>
  tokenName: string
}

/** 쓰는 쪽 DB 모양 — `interface Database extends AdminDatabase` 와 같은 꼴 */
export interface ProbeDatabase extends AdminDatabase {
  probeTokens: ProbeTokensTable
}

/** 테스트 DB 에 쓰는 쪽 토큰 표 자리를 만든다(beforeAll 에서 한 번) */
export async function createProbeTokens(db: Kysely<AdminDatabase>): Promise<void> {
  await sql`create table if not exists probe_tokens (
    token_no bigint unsigned not null auto_increment primary key,
    token_name varchar(50) not null
  ) engine = InnoDB`.execute(db)
}

export async function seedProbeToken(
  db: Kysely<AdminDatabase>,
  tokenName: string,
): Promise<bigint> {
  const result = await (db as unknown as Kysely<ProbeDatabase>)
    .insertInto('probeTokens')
    .values({ tokenName })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

/** 훅이 받은 번호 — lock 은 번호 하나씩, names 는 한 번에 받은 목록 */
export interface ProbeTargetCalls {
  lock: bigint[]
  names: bigint[][]
}

/**
 * 쓰는 쪽 훅 대역. 🔴 쓰는 쪽처럼 Transaction<ProbeDatabase> 로 적는다 — 메서드 꼴 이변성으로 옵션에 들어가는지를 typecheck 가
 * 함께 잰다(확장 범위 스펙 X5).
 */
export function probeTokenTarget(
  calls: ProbeTargetCalls = { lock: [], names: [] },
): AdminIpScopeTarget<ProbeDatabase> {
  return {
    async lock(trx: Transaction<ProbeDatabase>, refNo: bigint) {
      calls.lock.push(refNo)
      const row = await trx
        .selectFrom('probeTokens')
        .select('tokenNo')
        .where('tokenNo', '=', refNo)
        .forUpdate()
        .executeTakeFirst()
      return row !== undefined
    },
    async names(db: Kysely<ProbeDatabase>, refNos: readonly bigint[]) {
      calls.names.push([...refNos])
      const rows = await db
        .selectFrom('probeTokens')
        .select(['tokenNo', 'tokenName'])
        .where('tokenNo', 'in', refNos)
        .execute()
      return new Map(rows.map((row) => [row.tokenNo, row.tokenName]))
    },
  }
}

export function probeScope(
  over: Partial<AdminIpExtraScope<ProbeDatabase>> = {},
): AdminIpExtraScope<ProbeDatabase> {
  return { type: PROBE_SCOPE, target: probeTokenTarget(), ...over }
}
```

- [ ] **Step 6: 실패하는 DB 시험 — 쓰는 쪽 서비스** — `packages/admin-server/src/ip-access/extra-scope.service.db.test.ts`(새):

```ts
import type { Request } from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  PROBE_SCOPE,
  createProbeTokens,
  ipAccessConfig,
  probeScope,
  resetIpRules,
  seedIpRule,
  seedProbeToken,
} from '../test-support/ip-access.js'
import { AdminIpExtraScopeService } from './extra-scope.service.js'

// 쓰는 쪽 판정 서비스(확장 범위 스펙 §4-6 · R2 · R3b · R4b · R8). 🔴 규칙은 DB 전역 상태 — beforeEach 로 시드 두 행만 남긴다.

let t: TestDatabase
let service: AdminIpExtraScopeService
let token: bigint
let other: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  await createProbeTokens(t.db)
  token = await seedProbeToken(t.db, '작업대 1')
  other = await seedProbeToken(t.db, '작업대 2')
  service = new AdminIpExtraScopeService(
    t.db,
    ipAccessConfig(false, 'req.ip', {
      extraScopes: [probeScope(), probeScope({ type: 'probeNoWhole', wholeScope: false })],
    }),
  )
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

describe('allows — 두 층 판정', () => {
  it('🔴 R3b — global 시드(0.0.0.0/0 · ::/0)만 있으면 어디서도 거부', async () => {
    expect(await service.allows(PROBE_SCOPE, token, '203.0.113.9')).toBe(false)
    expect(await service.allows(PROBE_SCOPE, token, '2001:db8::1')).toBe(false)
    expect(await service.rulesOf(PROBE_SCOPE)).toEqual([])
  })

  it('대상 층 · 🔴 가장 가까운 층 하나 · 범위 전체 층', async () => {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' })
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '203.0.113.0/24' })
    expect(await service.allows(PROBE_SCOPE, token, '203.0.113.9')).toBe(true)
    expect(await service.allows(PROBE_SCOPE, token, '192.0.2.1')).toBe(false)
    expect(await service.allows(PROBE_SCOPE, other, '192.0.2.1')).toBe(true)
  })

  it('🔴 주소가 null 이면 거부', async () => {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' })
    expect(await service.allows(PROBE_SCOPE, token, null)).toBe(false)
  })

  it('🔴 wholeScope: false — 범위 전체 행은 판정 · 읽기에서 빠진다', async () => {
    await seedIpRule(t.db, { scopeType: 'probeNoWhole', scopeRefNo: null, cidr: '0.0.0.0/0' })
    await seedIpRule(t.db, { scopeType: 'probeNoWhole', scopeRefNo: other, cidr: '10.0.0.0/8' })
    expect(await service.allows('probeNoWhole', token, '203.0.113.9')).toBe(false)
    expect(await service.rulesOf('probeNoWhole')).toEqual([
      { scopeType: 'probeNoWhole', scopeRefNo: other, cidr: '10.0.0.0/8' },
    ])
  })

  it('🔴 등록되지 않은 범위 · 코어 이름은 던진다(설정 오류 — fail-closed)', async () => {
    await expect(service.allows('gone', token, '203.0.113.9')).rejects.toThrow(
      '등록되지 않은 확장 범위다',
    )
    await expect(service.rulesOf('global')).rejects.toThrow('등록되지 않은 확장 범위다')
  })
})

describe('countRulesOf · clientIpOf', () => {
  it('그 대상 번호의 행만 센다 — 쓰는 쪽 트랜잭션 안에서도', async () => {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '203.0.113.0/24' })
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '198.51.100.0/24' })
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' })
    expect(await service.countRulesOf(PROBE_SCOPE, token)).toBe(2)
    expect(await service.countRulesOf(PROBE_SCOPE, other)).toBe(0)
    const inside = await t.db
      .transaction()
      .execute((trx) => service.countRulesOf(PROBE_SCOPE, token, trx))
    expect(inside).toBe(2)
  })

  it('clientIpOf — 관리자 판정과 같은 출처 · 정규화', () => {
    const req = { ip: '::ffff:203.0.113.9', headers: {} } as unknown as Request
    expect(service.clientIpOf(req)).toBe('203.0.113.9')
  })
})
```

- [ ] **Step 7: 서비스를 쓴다** — `packages/admin-server/src/ip-access/extra-scope.service.ts`(새):

```ts
import { Inject, Injectable } from '@nestjs/common'
import { evaluateScopedIpAccess, type IpRule } from '@ssworks/admin-shared'
import type { Request } from 'express'
import type { Kysely } from 'kysely'
import { clientIpOf } from '../auth/request-meta.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_IP_ACCESS_CONFIG, KYSELY } from '../tokens.js'
import { countScopeRulesQuery, scopeRulesQuery } from './extra-scope-queries.js'
import type { ResolvedIpAccessConfig, ResolvedIpExtraScope } from './options.js'

// 정본: 없음 — 확장 범위 스펙 §4-6 · X10(R4b · R8). 쓰는 쪽 @Public() 가드가 매 요청 부른다 — 쓰는 쪽이 ipAccessRules 를 직접
//   질의하는 데 기대지 않게 한다. 범위 등록 · wholeScope 를 아는 쪽이 읽어야 거른 결과가 판정과 같다.
// 🔴 비잠금 · 캐시 없음(2f-1 P2 와 같은 이유 — 인스턴스가 여럿이면 낡은 규칙으로 통과시키는 창). 🔴 코어 규칙을 읽지 않는다(R3b).

@Injectable()
export class AdminIpExtraScopeService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_IP_ACCESS_CONFIG) private readonly config: ResolvedIpAccessConfig,
  ) {}

  /** 요청자 주소 — 관리자 판정 · 세션 · 감사와 같은 출처(코어 clientIp). 쓰는 쪽은 헤더를 직접 읽지 않는다 */
  clientIpOf(req: Request): string | null {
    return clientIpOf(req, this.config.clientIp)
  }

  /** 그 범위의 규칙(scopeType · scopeRefNo · cidr). wholeScope 가 꺼졌으면 NULL 행을 뺀다 */
  async rulesOf(scopeType: string): Promise<IpRule[]> {
    const scope = this.registered(scopeType)
    return runQuery(() =>
      scopeRulesQuery(this.db, scope.type, { wholeScope: scope.wholeScope }).execute(),
    )
  }

  /** 이 주소로 이 주체가 들어올 수 있는가 — 그 대상 · 범위 전체 행만 읽어 evaluateScopedIpAccess */
  async allows(scopeType: string, scopeRefNo: bigint, clientIp: string | null): Promise<boolean> {
    const scope = this.registered(scopeType)
    const rules = await runQuery(() =>
      scopeRulesQuery(this.db, scope.type, {
        wholeScope: scope.wholeScope,
        refNo: scopeRefNo,
      }).execute(),
    )
    return evaluateScopedIpAccess(clientIp, rules, { scopeType: scope.type, scopeRefNo })
  }

  /**
   * 이 대상을 가리키는 규칙 수(R8). db 에 쓰는 쪽 트랜잭션을 넘길 수 있다.
   * 🔴 쓰는 쪽은 대상 행을 FOR UPDATE 로 잠근 **뒤** 첫 비잠금 읽기로 부른다(팀 삭제의 소속 셈과 같은 이유 — 2e D1).
   */
  async countRulesOf(
    scopeType: string,
    scopeRefNo: bigint,
    db: Kysely<AdminDatabase> = this.db,
  ): Promise<number> {
    const scope = this.registered(scopeType)
    const row = await runQuery(() =>
      countScopeRulesQuery(db, scope.type, scopeRefNo).executeTakeFirstOrThrow(),
    )
    return Number(row.n)
  }

  /** 🔴 등록되지 않은 이름(코어 이름 포함)은 설정 오류다 — 던진다(쓰는 쪽 가드가 500 → 막힘) */
  private registered(scopeType: string): ResolvedIpExtraScope {
    const scope = this.config.extraScopes.get(scopeType)
    if (scope === undefined) {
      throw new Error(
        `AdminIpExtraScopeService — 등록되지 않은 확장 범위다: ${JSON.stringify(scopeType)} — AdminServerModule 옵션 ipAccess.extraScopes 에 더한다.`,
      )
    }
    return scope
  }
}
```

`packages/admin-server/src/ip-access/ip-access.module.ts` — import 에 `AdminIpExtraScopeService` 를 더하고 `providers` 에 `AdminIpExtraScopeService`, `exports` 에 `AdminIpExtraScopeService` 를 더한다. 머리 주석 `바꾼 점:` 끝에 `확장 범위(스펙 §4-6): 쓰는 쪽 판정 서비스 AdminIpExtraScopeService 를 전역으로 낸다 · 코어 옵션 ipAccess 를 읽는다.` 를 덧붙이고, `옵션이 없다(import 하면 켜진다, 2f-1 스펙 2-2 #3)` 는 `모듈 옵션이 없다 — import 하면 켜진다(2f-1 2-2 #3). 확장 범위는 코어 옵션 ipAccess` 로 고친다.

`packages/admin-server/src/index.ts` — `AdminIpAccessModule` export 옆에 더한다:

```ts
export { AdminIpExtraScopeService } from './ip-access/extra-scope.service.js'
export type {
  AdminIpAccessOptions,
  AdminIpExtraScope,
  AdminIpScopeTarget,
} from './ip-access/options.js'
```

- [ ] **Step 8: 쓰는 쪽 서비스 DB 시험 통과**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/ip-access/extra-scope.service.db.test.ts`
Expected: PASS.

- [ ] **Step 9: 실패하는 DB 시험 — 목록 이름** — `packages/admin-server/src/ip-access/ip-access.service.db.test.ts` 끝에 더한다(import 에 `PROBE_SCOPE`, `createProbeTokens`, `probeScope`, `probeTokenTarget`, `seedProbeToken`, `type ProbeTargetCalls` 를 더한다):

```ts
describe('목록 — 확장 범위 대상 이름(확장 범위 스펙 §4-4)', () => {
  it('범위마다 names 를 한 번 · 번호는 겹치지 않게 · 없는 번호 · 범위 전체 · 등록 빠진 범위는 null', async () => {
    await createProbeTokens(t.db)
    const token = await seedProbeToken(t.db, '작업대 1')
    const calls: ProbeTargetCalls = { lock: [], names: [] }
    const extra = new AdminIpAccessService(
      t.db,
      ipAccessConfig(false, 'req.ip', {
        extraScopes: [probeScope({ target: probeTokenTarget(calls) })],
      }),
      undefined,
    )
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '203.0.113.0/24' })
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '198.51.100.0/24' })
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: 999_999n, cidr: '10.0.0.0/8' })
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' })
    await seedIpRule(t.db, { scopeType: 'goneScope', scopeRefNo: token, cidr: '10.0.0.0/8' })
    const { items } = await extra.list()
    expect(
      items.map((item) => [item.scopeType, item.cidr, item.scopeName, item.scopeUserId]),
    ).toEqual([
      ['global', '0.0.0.0/0', null, null],
      ['global', '::/0', null, null],
      ['goneScope', '10.0.0.0/8', null, null],
      [PROBE_SCOPE, '203.0.113.0/24', '작업대 1', null],
      [PROBE_SCOPE, '198.51.100.0/24', '작업대 1', null],
      [PROBE_SCOPE, '10.0.0.0/8', null, null],
      [PROBE_SCOPE, '0.0.0.0/0', null, null],
    ])
    expect(calls.names).toEqual([[token, 999_999n]])
  })

  it('확장 범위가 없는 앱은 지금과 같다 — 훅이 없으니 확장 행 이름은 null', async () => {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: 1n, cidr: '10.0.0.0/8' })
    const { items } = await service.list()
    expect(items.find((item) => item.scopeType === PROBE_SCOPE)?.scopeName).toBeNull()
  })
})
```

(정렬 기대값은 `scope_type` 문자 순 — `ascii_bin` 이라 대문자가 소문자 앞이다. `goneScope` · `probeToken` 순서가 실제와 다르면 실제 DB 정렬에 맞추되 "scopeType → ruleNo" 규칙은 바꾸지 않는다.)

- [ ] **Step 10: 목록 이름을 쓴다** — `packages/admin-server/src/ip-access/rule-views.ts`(새):

```ts
import { isCoreIpScopeType } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import type { ResolvedIpAccessConfig } from './options.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts findAll(행 모양)
// 바꾼 점: 2f-1 P13(팀 · 사용자 LEFT JOIN 이름)을 서비스에서 옮겼고, 확장 범위 대상 이름을 범위마다 쓰는 쪽 훅(target.names)
//   한 번으로 붙인다(확장 범위 스펙 §4-4). 받지 못한 번호 · 범위 전체 · 등록이 빠진 범위는 null.
// 🔴 훅이 던지면 그대로 던진다 — 이름을 숨기면 대상이 사라진 것처럼 보인다.

/** 목록 · 응답의 행 — admin-shared adminIpRuleSchema 와 같은 모양(시각은 ISO 문자열) */
export type AdminIpRuleView = {
  ruleNo: bigint
  scopeType: string
  scopeRefNo: bigint | null
  scopeName: string | null
  scopeUserId: string | null
  cidr: string
  description: string | null
  revision: number
  createAt: string
  updateAt: string
}

/** ruleViewQuery 의 행 */
export type RuleViewRow = {
  ruleNo: bigint
  scopeType: string
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

/** 행들 → 응답 모양. 🔴 db 는 쓰기 트랜잭션일 수 있다(쓴 뒤 응답) — 훅도 같은 연결로 읽는다 */
export async function toRuleViews(
  db: Kysely<AdminDatabase>,
  config: Pick<ResolvedIpAccessConfig, 'extraScopes'>,
  rows: readonly RuleViewRow[],
): Promise<AdminIpRuleView[]> {
  const wanted = new Map<string, Set<bigint>>()
  for (const row of rows) {
    if (isCoreIpScopeType(row.scopeType) || row.scopeRefNo === null) continue
    if (!config.extraScopes.has(row.scopeType)) continue
    const refNos = wanted.get(row.scopeType) ?? new Set<bigint>()
    refNos.add(row.scopeRefNo)
    wanted.set(row.scopeType, refNos)
  }
  const names = new Map<string, ReadonlyMap<bigint, string>>()
  for (const [scopeType, refNos] of wanted) {
    const scope = config.extraScopes.get(scopeType)
    if (scope !== undefined) names.set(scopeType, await scope.target.names(db, [...refNos]))
  }
  return rows.map((row) => toRuleView(row, names.get(row.scopeType)))
}

function scopeNameOf(
  row: RuleViewRow,
  extraNames: ReadonlyMap<bigint, string> | undefined,
): string | null {
  if (row.scopeType === 'team') return row.teamName
  if (row.scopeType === 'user') return row.userName
  if (row.scopeType === 'global' || row.scopeRefNo === null) return null
  return extraNames?.get(row.scopeRefNo) ?? null
}

function toRuleView(
  row: RuleViewRow,
  extraNames: ReadonlyMap<bigint, string> | undefined,
): AdminIpRuleView {
  return {
    ruleNo: row.ruleNo,
    scopeType: row.scopeType,
    scopeRefNo: row.scopeRefNo,
    scopeName: scopeNameOf(row, extraNames),
    scopeUserId: row.scopeType === 'user' ? row.userId : null,
    cidr: row.cidr,
    description: row.description,
    revision: row.revision,
    createAt: row.createAt.toISOString(),
    updateAt: row.updateAt.toISOString(),
  }
}
```

`packages/admin-server/src/ip-access/ip-access.service.ts`:

- `AdminIpRuleView` 타입 선언 · `RuleViewRow` · `toRuleView` 함수 · 모듈 수준 `readRuleView` 를 지우고, `import { toRuleViews, type AdminIpRuleView } from './rule-views.js'` 와 `export type { AdminIpRuleView } from './rule-views.js'`(밖에서 이 이름을 쓰던 자리를 위해)를 둔다.
- `IpRuleAuditView.scopeType` 을 `string` 으로.
- 클래스 안에 메서드를 더하고 `list` 를 고친다:

```ts
  async list(): Promise<{ items: AdminIpRuleView[] }> {
    const rows = await runQuery(() => ruleViewQuery(this.db).execute())
    return { items: await toRuleViews(this.db, this.config, rows) }
  }

  /** 한 행의 응답 모양 — 쓰기 트랜잭션 안에서 부르면 자기 쓰기를 본다 */
  private async readRuleView(db: Kysely<AdminDatabase>, ruleNo: bigint): Promise<AdminIpRuleView> {
    const row = await ruleViewQuery(db).where('r.ruleNo', '=', ruleNo).executeTakeFirstOrThrow()
    const [view] = await toRuleViews(db, this.config, [row])
    return view as AdminIpRuleView
  }
```

- `create` · `update` 안의 `readRuleView(trx, …)` 를 `this.readRuleView(trx, …)` 로 바꾼다.

- [ ] **Step 11: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server exec vitest run src/ip-access && pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/ip-access`
Expected: 모두 PASS — 기존 IP DB 시험(정책 · 잔존 · 경합 · HTTP)도 그대로 통과한다(코어 셋 조건은 코어 행만 있는 저장소에서 결과가 같다).

- [ ] **Step 12: 커밋**

```bash
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): IP 관리자 판정 · 미리보기는 코어 셋만 읽기 · 목록 확장 대상 이름 · AdminIpExtraScopeService

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 서버 쓰기 — 파이프 · 갈래 · 대상 잠금 (모델: `sonnet`)

만들기 · 수정 · 삭제가 확장 범위를 받는다. 코어 갈래는 지금 그대로(잔존 가드 안), 확장 갈래는 잔존 · 가드 행 · 자기 잠금 밖이다(X3 · X4).

**Files:**

- Modify: `packages/admin-server/src/ip-access/ip-access.body.ts`
- Modify: `packages/admin-server/src/ip-access/ip-access.service.ts`
- Modify: `packages/admin-server/src/ip-access/rule-locks.ts`
- Test: `packages/admin-server/src/ip-access/ip-access.body.test.ts`(새) · `packages/admin-server/src/ip-access/ip-access.extra.db.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 — 파이프** — `packages/admin-server/src/ip-access/ip-access.body.test.ts`(새):

```ts
import { BusinessError, IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ipAccessConfig, probeScope } from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { IpRuleCreateBodyPipe, IpRuleUpdateBodyPipe } from './ip-access.body.js'

// 본문 파이프(확장 범위 스펙 §4-2) — DB 없이 파이프를 직접 부른다. 🔴 IP 라우트는 로그인 세션이 있어야 핸들러에 닿으므로
// 라우트 행동은 ip-access.extra.http.db.test.ts 가 잰다.

const extra = ipAccessConfig(false, 'req.ip', {
  extraScopes: [probeScope(), probeScope({ type: 'probeNoWhole', wholeScope: false })],
})

function issuesOf(run: () => unknown): [string, string][] {
  try {
    run()
  } catch (error) {
    if (!(error instanceof BusinessError)) throw error
    return (error.details as { issues: { path: unknown[]; message: string }[] }).issues.map(
      (issue) => [issue.path.join('.'), issue.message],
    )
  }
  throw new Error('통과했다')
}

describe('만들기 파이프', () => {
  it('등록된 확장 범위 — 대상 하나 · 범위 전체를 받는다', () => {
    const pipe = new IpRuleCreateBodyPipe(extra)
    expect(
      pipe.transform({ scopeType: 'probeToken', scopeRefNo: 7n, cidr: '10.0.0.0/8' }),
    ).toMatchObject({
      scopeType: 'probeToken',
      scopeRefNo: 7n,
    })
    expect(
      pipe.transform({ scopeType: 'probeToken', scopeRefNo: null, cidr: '10.0.0.0/8' }).scopeRefNo,
    ).toBeNull()
  })

  it('🔴 모르는 범위 · 꺼진 범위 전체 · 형식 밖 이름', () => {
    const pipe = new IpRuleCreateBodyPipe(extra)
    expect(
      issuesOf(() => pipe.transform({ scopeType: 'gone', scopeRefNo: 1n, cidr: '10.0.0.0/8' })),
    ).toEqual([['scopeType', IP_ACCESS_MESSAGES.unknownScopeType]])
    expect(
      issuesOf(() =>
        pipe.transform({ scopeType: 'probeNoWhole', scopeRefNo: null, cidr: '10.0.0.0/8' }),
      ),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.wholeScopeOff]])
    expect(
      issuesOf(() => pipe.transform({ scopeType: 'Bad!', scopeRefNo: 1n, cidr: '10.0.0.0/8' })),
    ).toEqual([['scopeType', IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid]])
  })

  it('🔴 확장 범위가 없는 앱 — 확장 이름은 400 scopeType · 코어 불변식은 지금 그대로', () => {
    const pipe = new IpRuleCreateBodyPipe(ipAccessConfig())
    expect(
      issuesOf(() =>
        pipe.transform({ scopeType: 'probeToken', scopeRefNo: 1n, cidr: '10.0.0.0/8' }),
      ),
    ).toEqual([['scopeType', IP_ACCESS_MESSAGES.unknownScopeType]])
    expect(
      issuesOf(() => pipe.transform({ scopeType: 'global', scopeRefNo: 1n, cidr: '0.0.0.0/0' })),
    ).toEqual([['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden]])
  })
})

describe('수정 파이프', () => {
  it('scopeType 이 있으면 등록 검사 — 없으면 통과(병합 판정은 서비스)', () => {
    const pipe = new IpRuleUpdateBodyPipe(extra)
    expect(pipe.transform({ revision: 0 })).toEqual({ revision: 0 })
    expect(pipe.transform({ scopeType: 'probeToken', revision: 0 }).scopeType).toBe('probeToken')
    expect(issuesOf(() => pipe.transform({ scopeType: 'gone', revision: 0 }))).toEqual([
      ['scopeType', IP_ACCESS_MESSAGES.unknownScopeType],
    ])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/ip-access/ip-access.body.test.ts`
Expected: FAIL — 파이프가 코어 enum 만 받는다.

- [ ] **Step 3: 파이프를 쓴다** — `packages/admin-server/src/ip-access/ip-access.body.ts`

import 를 바꾼다(`ipScopeProblem` · `ipScopeTypeSchema` 대신):

```ts
import {
  adminIpRuleCreateSchema,
  adminIpRuleRemoveSchema,
  adminIpRuleUpdateSchema,
  isCoreIpScopeType,
  isIpExtraScopeTypeName,
} from '@ssworks/admin-shared'
...
import { IP_ACCESS_MESSAGES } from './errors.js'
import { isKnownScopeType, ruleScopeProblem } from './scope-check.js'
```

머리 주석 `바꾼 점:` 끝에 `확장 범위(스펙 §4-2): 범위 판정은 scope-check 하나 — 코어 ∪ 등록된 확장 범위만 받는다. 형식 밖 이름은 공유 스키마가 먼저 막는다.` 를 덧붙인다.

만들기 파이프 생성자:

```ts
this.pipe = new ZodValidationPipe(
  adminIpRuleCreateSchema
    .extend({ currentPassword: currentPasswordField(config.reauth) })
    .superRefine((body, ctx) => {
      // 🔴 형식 밖 이름은 공유 스키마(ipRuleScopeTypeSchema)가 이미 알렸다 — 같은 칸에 두 번 싣지 않는다
      if (!isCoreIpScopeType(body.scopeType) && !isIpExtraScopeTypeName(body.scopeType)) return
      const problem = ruleScopeProblem(config, body)
      if (problem !== null) {
        ctx.addIssue({ code: 'custom', path: [problem.path], message: problem.message })
      }
    }),
)
```

수정 파이프 생성자:

```ts
this.pipe = new ZodValidationPipe(
  adminIpRuleUpdateSchema
    .extend({ currentPassword: currentPasswordField(config.reauth) })
    .superRefine((body, ctx) => {
      const type = body.scopeType
      if (type === undefined || (!isCoreIpScopeType(type) && !isIpExtraScopeTypeName(type))) return
      // 병합 결과의 범위 불변식 · 갈래는 서비스가 본다 — 여기는 이름 등록만
      if (!isKnownScopeType(config, type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['scopeType'],
          message: IP_ACCESS_MESSAGES.unknownScopeType,
        })
      }
    }),
)
```

(zod 4 에서 하위 칸 오류가 있으면 superRefine 이 돌지 않을 수 있다 — 위 가드가 어느 쪽이든 같은 결과를 낸다. Step 1 시험의 형식 밖 이름 기대값이 `[scopeType, scopeTypeInvalid]` 하나임을 확인한다.)

- [ ] **Step 4: 파이프 시험 통과**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/ip-access/ip-access.body.test.ts`
Expected: PASS. (`typecheck` 는 Step 7 뒤에 — 서비스 본문 타입이 아직 코어 enum 이다.)

- [ ] **Step 5: 실패하는 DB 시험 — 확장 쓰기** — `packages/admin-server/src/ip-access/ip-access.extra.db.test.ts`(새):

```ts
import { CommonErrorCodes, IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GUARD_LOCK_SUPER_ADMIN } from '../accounts/super-admin.js'
import type { AdminReauthService } from '../auth/reauth.service.js'
import { FakeReauth, testPrincipal } from '../test-support/accounts.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { holdGuard, underHeld, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { failure } from '../test-support/errors.js'
import {
  PROBE_SCOPE,
  createProbeTokens,
  ipAccessConfig,
  ipRulesOf,
  probeScope,
  probeTokenTarget,
  resetIpRules,
  seedIpRule,
  seedProbeToken,
  type ProbeTargetCalls,
} from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { AdminIpAccessService } from './ip-access.service.js'

// 확장 범위 쓰기(확장 범위 스펙 §4-3 · X2 ~ X8). 🔴 규칙은 DB 전역 상태 — beforeEach 로 시드 두 행만 남긴다.

let t: TestDatabase
let service: AdminIpAccessService
let calls: ProbeTargetCalls
let actor: SeededUser
let token: bigint
let other: bigint
const ACTOR_IP = '203.0.113.9'

beforeAll(async () => {
  t = await createTestDatabase()
  await createProbeTokens(t.db)
  token = await seedProbeToken(t.db, '작업대 1')
  other = await seedProbeToken(t.db, '작업대 2')
  calls = { lock: [], names: [] }
  service = new AdminIpAccessService(
    t.db,
    ipAccessConfig(false, 'req.ip', {
      extraScopes: [
        probeScope({ target: probeTokenTarget(calls) }),
        probeScope({ type: 'probeNoWhole', wholeScope: false }),
      ],
    }),
    undefined,
  )
  const plain = await seedRole(t.db, { roleName: 'extra-plain', permissions: [] })
  actor = await seedUser(t.db, { roleNo: plain, userId: 'extra-actor' })
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
  calls.lock.length = 0
  calls.names.length = 0
})

const me = () => testPrincipal(actor.userNo, ['setting.ipAccess:write'])
const issueOf = (error: { details?: unknown }) =>
  (error.details as { issues: { path: unknown[]; message: string }[] }).issues.map((issue) => [
    issue.path.join('.'),
    issue.message,
  ])

describe('만들기', () => {
  it('대상 하나 — 훅이 잠그고 이름을 붙인다', async () => {
    const { item } = await service.create(
      { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '203.0.113.7/32', description: '출고장' },
      me(),
      ACTOR_IP,
    )
    expect(item).toMatchObject({
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      scopeName: '작업대 1',
      scopeUserId: null,
      cidr: '203.0.113.7/32',
      description: '출고장',
      revision: 0,
    })
    expect(calls.lock).toEqual([token])
  })

  it('범위 전체 — 잠글 대상이 없다 · 이름 null', async () => {
    const { item } = await service.create(
      { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '198.51.100.0/24' },
      me(),
      ACTOR_IP,
    )
    expect(item).toMatchObject({ scopeRefNo: null, scopeName: null })
    expect(calls.lock).toEqual([])
  })

  it('🔴 대상이 없으면 400 scopeRefNo — 행을 넣지 않는다', async () => {
    const error = await failure(
      service.create(
        { scopeType: PROBE_SCOPE, scopeRefNo: 999_999n, cidr: '10.0.0.0/8' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(issueOf(error)).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTarget]])
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('🔴 꺼진 범위 전체 · 모르는 범위 — 400(서비스도 본다)', async () => {
    expect(
      issueOf(
        await failure(
          service.create(
            { scopeType: 'probeNoWhole', scopeRefNo: null, cidr: '10.0.0.0/8' },
            me(),
            ACTOR_IP,
          ),
        ),
      ),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.wholeScopeOff]])
    expect(
      issueOf(
        await failure(
          service.create({ scopeType: 'gone', scopeRefNo: 1n, cidr: '10.0.0.0/8' }, me(), ACTOR_IP),
        ),
      ),
    ).toEqual([['scopeType', IP_ACCESS_MESSAGES.unknownScopeType]])
  })
})

describe('수정', () => {
  it('대상 바꾸기 · CIDR · revision 하나 오름 · before · after', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const { item, before, after } = await service.update(
      ruleNo,
      { scopeRefNo: other, cidr: '10.1.0.0/16', revision: 0 },
      me(),
      ACTOR_IP,
    )
    expect(item).toMatchObject({
      scopeRefNo: other,
      scopeName: '작업대 2',
      cidr: '10.1.0.0/16',
      revision: 1,
    })
    expect(before).toEqual({
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
      description: null,
    })
    expect(after).toEqual({
      scopeType: PROBE_SCOPE,
      scopeRefNo: other,
      cidr: '10.1.0.0/16',
      description: null,
    })
    expect(calls.lock).toEqual([other])
  })

  it('🔴 범위 종류는 바꿀 수 없다 — 코어로 · 다른 확장 범위로 · 코어에서 확장으로', async () => {
    const extraRule = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    for (const scopeType of ['global', 'probeNoWhole']) {
      const error = await failure(
        service.update(extraRule, { scopeType, scopeRefNo: null, revision: 0 }, me(), ACTOR_IP),
      )
      expect(issueOf(error)).toEqual([['scopeType', IP_ACCESS_MESSAGES.scopeTypeLocked]])
    }
    const [globalRule] = await resetIpRules(t.db)
    const error = await failure(
      service.update(
        globalRule!,
        { scopeType: PROBE_SCOPE, scopeRefNo: token, revision: 0 },
        me(),
        ACTOR_IP,
      ),
    )
    expect(issueOf(error)).toEqual([['scopeType', IP_ACCESS_MESSAGES.scopeTypeLocked]])
  })

  it('revision 이 다르면 409 · 대상이 없으면 400', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    expect(
      (await failure(service.update(ruleNo, { cidr: '10.2.0.0/16', revision: 5 }, me(), ACTOR_IP)))
        .code,
    ).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
    expect(
      issueOf(
        await failure(
          service.update(ruleNo, { scopeRefNo: 999_999n, revision: 0 }, me(), ACTOR_IP),
        ),
      ),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTarget]])
  })

  it('🔴 꺼진 범위 전체로 바꾸기는 400', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: 'probeNoWhole',
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    expect(
      issueOf(
        await failure(service.update(ruleNo, { scopeRefNo: null, revision: 0 }, me(), ACTOR_IP)),
      ),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.wholeScopeOff]])
  })
})

describe('삭제 · 등록이 빠진 범위', () => {
  it('삭제 — before · revision 409', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    expect((await failure(service.remove(ruleNo, { revision: 3 }, me(), ACTOR_IP))).code).toBe(
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    const { before } = await service.remove(ruleNo, { revision: 0 }, me(), ACTOR_IP)
    expect(before).toEqual({
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
      description: null,
    })
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('🔴 등록이 빠진 범위의 행 — 수정은 400 scopeType · 삭제는 된다(X8)', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: 'goneScope',
      scopeRefNo: 1n,
      cidr: '10.0.0.0/8',
    })
    expect(
      issueOf(
        await failure(service.update(ruleNo, { cidr: '10.2.0.0/16', revision: 0 }, me(), ACTOR_IP)),
      ),
    ).toEqual([['scopeType', IP_ACCESS_MESSAGES.unknownScopeType]])
    await service.remove(ruleNo, { revision: 0 }, me(), ACTOR_IP)
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('없는 규칙 — 지금처럼 404', async () => {
    expect((await failure(service.remove(999_999n, { revision: 0 }, me(), ACTOR_IP))).code).toBe(
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
  })
})

describe('🔴 확장 쓰기는 잔존 밖(X3)', () => {
  it('잔존 가드 행을 남이 쥐고 있어도 기다리지 않는다 — 만들기 · 수정 · 삭제', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    for (const write of [
      () =>
        service.create(
          { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '10.9.0.0/16' },
          me(),
          ACTOR_IP,
        ),
      () => service.update(ruleNo, { cidr: '10.1.0.0/16', revision: 0 }, me(), ACTOR_IP),
      () => service.remove(ruleNo, { revision: 1 }, me(), ACTOR_IP),
    ]) {
      const { waited, result } = await underHeld(t, holdGuard(GUARD_LOCK_SUPER_ADMIN), write)
      expect(waited).toBe(false)
      expect(result.ok).toBe(true)
    }
  })

  it('쓰는 쪽이 대상 행을 쥐고 있으면 기다린다(훅이 FOR UPDATE)', async () => {
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query('select token_no from probe_tokens where token_no = ? for update', [
          token,
        ]),
      () =>
        service.create(
          { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '10.8.0.0/16' },
          me(),
          ACTOR_IP,
        ),
      { expectWait: true },
    )
    expect(result.ok).toBe(true)
  })

  it('🔴 자기 잠금을 보지 않는다 — 요청자 주소와 무관한 확장 규칙도 저장된다', async () => {
    const { item } = await service.create(
      { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '192.0.2.0/24' },
      me(),
      null,
    )
    expect(item.cidr).toBe('192.0.2.0/24')
  })
})

describe('재인증', () => {
  it('확장 쓰기도 reauth 를 지난다 — 틀린 비밀번호는 쓰지 않는다', async () => {
    const reauth = new FakeReauth()
    const guarded = new AdminIpAccessService(
      t.db,
      ipAccessConfig(true, 'req.ip', { extraScopes: [probeScope()] }),
      reauth as unknown as AdminReauthService,
    )
    await failure(
      guarded.create(
        { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '10.0.0.0/8', currentPassword: 'wrong' },
        me(),
        ACTOR_IP,
      ),
    )
    await guarded.create(
      {
        scopeType: PROBE_SCOPE,
        scopeRefNo: token,
        cidr: '10.0.0.0/8',
        currentPassword: 'right-password',
      },
      me(),
      ACTOR_IP,
    )
    expect(reauth.calls).toEqual(['wrong', 'right-password'])
  })
})

it('형식 메시지 상수가 공유 표와 같은 출처다', () => {
  expect(IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid).toBe('범위 이름이 형식에 맞지 않습니다.')
})
```

(`underHeld` 의 반환 모양 — `{ waited, result }` — 과 `holdGuard` 는 `test-support/concurrency.ts` 그대로다. `underHeld` 가 대기 판정을 다른 이름으로 돌려주면 그 이름에 맞춘다.)

- [ ] **Step 6: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/ip-access/ip-access.extra.db.test.ts`
Expected: FAIL — 서비스가 확장 범위를 코어 경로로 보낸다(타입 오류로 컴파일이 먼저 실패해도 된다).

- [ ] **Step 7: 서비스 · 잠금을 쓴다**

`packages/admin-server/src/ip-access/rule-locks.ts` — `LockedRule.scopeType` 을 `string` 으로 바꾸고(import 의 `IpScopeType` 은 `lockScopeRef` 가 `IpScope` 로 계속 쓴다), import 에 `import type { ResolvedIpExtraScope } from './options.js'` 를 더하고 끝에 더한다:

```ts
/**
 * 확장 범위 대상 — 쓰는 쪽 훅(target.lock)이 FOR UPDATE 로 잠근다. 없으면 400 scopeRefNo. 범위 전체(null)는 잠글 것이 없다
 * (확장 범위 스펙 X3 · X5). 🔴 잠금 순서는 규칙 행 → 쓰는 쪽 대상 행(X6) — 쓰는 쪽은 ipAccessRules 를 잠그지 않는다.
 */
export async function lockExtraScopeTarget(
  trx: Transaction<AdminDatabase>,
  scope: ResolvedIpExtraScope,
  refNo: bigint | null,
): Promise<void> {
  if (refNo === null) return
  if (!(await scope.target.lock(trx, refNo))) throw scopeRefError(IP_ACCESS_MESSAGES.noScopeTarget)
}
```

`packages/admin-server/src/ip-access/ip-access.service.ts`:

(a) 머리 주석 `바꾼 점:` 끝에 덧붙인다:

```ts
//  - 확장 범위(확장 범위 스펙 §4-3 · X2 ~ X8): 쓰기를 갈래로 나눈다. 코어 갈래는 위 그대로. 확장 갈래는 잔존 · 가드 행 · 자기 잠금
//    밖이다 — 대상 규칙 행 FOR UPDATE → (revision · 등록 · wholeScope) → 쓰는 쪽 target.lock → 쓰기. 수정 · 삭제는 트랜잭션 밖
//    비잠금 한 줄로 갈래를 고르고(대상이 없으면 코어 갈래 — 지금처럼 재인증 → 404), 안에서 잠근 행이 같은 갈래인지 다시 본다.
//    범위 종류는 갈래를 넘어 바꾸지 않는다(400 scopeType).
```

(b) import 에 `isCoreIpScopeType` 을 더하고, `./errors.js` 에서 `IP_ACCESS_MESSAGES`, `scopeTypeError`, `./rule-locks.js` 에서 `lockExtraScopeTarget`, `./scope-check.js` 에서 `assertRuleScope`, `sameScopeFamily`, `./options.js` 에서 `type ResolvedIpExtraScope` 를 더한다.

(c) 본문 타입을 넓힌다(Task 1 의 좁힘을 되돌린다):

```ts
export type AdminIpRuleCreateBody = AdminIpRuleCreate & { currentPassword?: string }
export type AdminIpRuleUpdateBody = AdminIpRuleUpdate & { currentPassword?: string }
```

(d) `create` 첫 줄과 확장 갈래:

```ts
  async create(
    body: AdminIpRuleCreateBody,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<{ item: AdminIpRuleView }> {
    if (!isCoreIpScopeType(body.scopeType)) return this.createExtra(body, principal)
    const scope: IpScope = { scopeType: body.scopeType, scopeRefNo: body.scopeRefNo }
    // … 아래는 지금 그대로(readRuleView 만 this.readRuleView)
  }

  /** 🔴 확장 갈래 — 잔존 · 가드 행 · 자기 잠금이 없다(X3). 첫 문장은 쓰는 쪽 대상 행 잠금 */
  private async createExtra(
    body: AdminIpRuleCreateBody,
    principal: AdminPrincipal,
  ): Promise<{ item: AdminIpRuleView }> {
    const scope = { scopeType: body.scopeType, scopeRefNo: body.scopeRefNo }
    assertRuleScope(this.config, scope)
    const extra = this.extraScopeOf(scope.scopeType)
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    return runWriteTransaction(this.db, async (trx) => {
      await lockExtraScopeTarget(trx, extra, scope.scopeRefNo)
      const inserted = await trx
        .insertInto('ipAccessRules')
        .values({
          scopeType: scope.scopeType,
          scopeRefNo: scope.scopeRefNo,
          cidr: body.cidr,
          description: body.description ?? null,
        })
        .executeTakeFirstOrThrow()
      return { item: await this.readRuleView(trx, inserted.insertId as bigint) }
    })
  }
```

(e) `update` — 앞부분과 코어 `lock` 을 바꾸고 확장 갈래를 더한다:

```ts
  async update(
    ruleNo: bigint,
    body: AdminIpRuleUpdateBody,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<{ item: AdminIpRuleView; before: IpRuleAuditView; after: IpRuleAuditView }> {
    const current = await this.peekScopeType(ruleNo)
    if (current !== null && !isCoreIpScopeType(current)) {
      return this.updateExtra(ruleNo, current, body, principal)
    }
    // 🔴 갈래를 넘는 수정은 재인증 앞에서 400(X2). 대상이 없으면(current null) 지금처럼 재인증 → 404
    if (current !== null && body.scopeType !== undefined && !sameScopeFamily(current, body.scopeType)) {
      throw scopeTypeError(IP_ACCESS_MESSAGES.scopeTypeLocked)
    }
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = subjectOf(principal)
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(
        trx,
        {
          // 🔴 잠금 읽기 · 판정만 — 대상 규칙 → 갈래 → revision → 병합 결과 불변식 → 병합 결과의 참조 행
          lock: async (): Promise<{ target: LockedRule; scope: IpScope }> => {
            const target = await lockRule(trx, ruleNo)
            // 🔴 먼저 읽은 갈래와 다르면 낡은 요청이다(X4 — 범위 종류가 갈래를 넘지 않으니 일어날 수 없지만 막는다)
            if (!isCoreIpScopeType(target.scopeType)) throw ruleRevisionConflict()
            if (body.revision !== target.revision) throw ruleRevisionConflict()
            const scopeType = body.scopeType ?? target.scopeType
            if (!isCoreIpScopeType(scopeType)) throw scopeTypeError(IP_ACCESS_MESSAGES.scopeTypeLocked)
            // 🔴 병합 결과가 판정 대상이다(hangang R30) — global 행에 scopeType: 'user' 만 보내면 어느 층에도 안 걸리는 행이 된다
            const scope: IpScope = {
              scopeType,
              scopeRefNo: body.scopeRefNo !== undefined ? body.scopeRefNo : target.scopeRefNo,
            }
            assertIpScope(scope)
            await lockScopeRef(trx, scope)
            return { target, scope }
          },
          write: async ({ target, scope }) => {
            // … 지금 그대로(readRuleView 만 this.readRuleView)
          },
        },
        IP_WRITE,
      ),
    )
  }

  /** 🔴 확장 갈래 — 대상 규칙 → 갈래 재확인 → revision → 등록 · wholeScope → target.lock(X3 · X4 · X7 · X8) */
  private async updateExtra(
    ruleNo: bigint,
    scopeType: string,
    body: AdminIpRuleUpdateBody,
    principal: AdminPrincipal,
  ): Promise<{ item: AdminIpRuleView; before: IpRuleAuditView; after: IpRuleAuditView }> {
    if (body.scopeType !== undefined && body.scopeType !== scopeType) {
      throw scopeTypeError(IP_ACCESS_MESSAGES.scopeTypeLocked)
    }
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    return runWriteTransaction(this.db, async (trx) => {
      const target = await lockRule(trx, ruleNo)
      if (target.scopeType !== scopeType) throw ruleRevisionConflict()
      if (body.revision !== target.revision) throw ruleRevisionConflict()
      const scope = {
        scopeType,
        scopeRefNo: body.scopeRefNo !== undefined ? body.scopeRefNo : target.scopeRefNo,
      }
      assertRuleScope(this.config, scope)
      await lockExtraScopeTarget(trx, this.extraScopeOf(scopeType), scope.scopeRefNo)
      await trx
        .updateTable('ipAccessRules')
        .set((eb) => ({
          scopeRefNo: scope.scopeRefNo,
          ...(body.cidr === undefined ? {} : { cidr: body.cidr }),
          ...(body.description === undefined ? {} : { description: body.description }),
          revision: eb('revision', '+', 1),
          updateAt: sql<Date>`current_timestamp`,
        }))
        .where('ruleNo', '=', ruleNo)
        .execute()
      const item = await this.readRuleView(trx, ruleNo)
      return { item, before: auditViewOf(target), after: auditViewOf(item) }
    })
  }
```

(f) `remove` — 앞부분 · 코어 `lock` 방어 · 확장 갈래:

```ts
  async remove(
    ruleNo: bigint,
    body: AdminIpRuleRemoveBody,
    principal: AdminPrincipal,
    clientIp: string | null,
  ): Promise<{ before: IpRuleAuditView }> {
    const current = await this.peekScopeType(ruleNo)
    if (current !== null && !isCoreIpScopeType(current)) {
      return this.removeExtra(ruleNo, current, body, principal)
    }
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = subjectOf(principal)
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(
        trx,
        {
          lock: async () => {
            const target = await lockRule(trx, ruleNo)
            if (!isCoreIpScopeType(target.scopeType)) throw ruleRevisionConflict()
            if (body.revision !== target.revision) throw ruleRevisionConflict()
            return target
          },
          write: async (target) => {
            // … 지금 그대로
          },
        },
        IP_WRITE,
      ),
    )
  }

  /** 🔴 확장 갈래 — 등록이 빠진 범위의 행도 지운다(X8) */
  private async removeExtra(
    ruleNo: bigint,
    scopeType: string,
    body: AdminIpRuleRemoveBody,
    principal: AdminPrincipal,
  ): Promise<{ before: IpRuleAuditView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    return runWriteTransaction(this.db, async (trx) => {
      const target = await lockRule(trx, ruleNo)
      if (target.scopeType !== scopeType || body.revision !== target.revision) {
        throw ruleRevisionConflict()
      }
      await trx.deleteFrom('ipAccessRules').where('ruleNo', '=', ruleNo).execute()
      // 🔴 지운 규칙은 감사의 before 로만 복원된다
      return { before: auditViewOf(target) }
    })
  }
```

(g) 도우미 둘(클래스 안):

```ts
  /** 🔴 트랜잭션 밖 비잠금 한 줄 — 갈래를 고른다(X4). 없으면 null(코어 갈래가 지금처럼 404 를 낸다) */
  private async peekScopeType(ruleNo: bigint): Promise<string | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('ipAccessRules')
        .select('scopeType')
        .where('ruleNo', '=', ruleNo)
        .executeTakeFirst(),
    )
    return row?.scopeType ?? null
  }

  /** 등록된 확장 범위 — assertRuleScope 뒤에만 부른다(없으면 400 scopeType) */
  private extraScopeOf(scopeType: string): ResolvedIpExtraScope {
    const scope = this.config.extraScopes.get(scopeType)
    if (scope === undefined) throw scopeTypeError(IP_ACCESS_MESSAGES.unknownScopeType)
    return scope
  }
```

- [ ] **Step 8: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server exec vitest run src/ip-access && pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/ip-access`
Expected: 모두 PASS — 새 확장 쓰기 시험과 기존 코어 IP 시험(잔존 · 경합 · 자기 잠금 · HTTP) 전부.

- [ ] **Step 9: 커밋**

```bash
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): IP 확장 범위 쓰기 — 파이프 등록 검사 · 갈래 나누기 · 잔존 밖 · target.lock · 범위 종류 고정

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 서버 분리 보장 · HTTP · 타입 시험 (모델: `sonnet`)

R3 두 방향을 실 DB 로 굳히고, 라우트 행동(감사 · 400 · 미리보기 · 로그인)을 HTTP 로 잰다. 쓰는 쪽 훅 타입이 옵션에 들어가는지 타입 시험으로 잰다.

**Files:**

- Modify: `packages/admin-server/src/test-support/admin-app.ts`
- Test: `packages/admin-server/src/ip-access/ip-access.separation.db.test.ts`(새) · `packages/admin-server/src/ip-access/ip-access.extra.http.db.test.ts`(새) · `packages/admin-server/src/ip-access/options.types.test.ts`(새)

- [ ] **Step 1: 시험 앱 옵션** — `packages/admin-server/src/test-support/admin-app.ts`

`AdminAppOptions` 에 더한다(import `type AdminIpAccessOptions` from `'../ip-access/options.js'`):

```ts
  /** IP 확장 범위(확장 범위 스펙 §4-1). 기본 없음 */
  ipAccess?: AdminIpAccessOptions
```

`AdminServerModule.forRoot({ … })` 의 `clientIp` 줄 아래에 `...(options.ipAccess === undefined ? {} : { ipAccess: options.ipAccess }),` 를 더하고, 머리 주석의 목록에 `· 확장 범위` 를 덧붙인다.

- [ ] **Step 2: 타입 시험** — `packages/admin-server/src/ip-access/options.types.test.ts`(새):

```ts
import type { Generated, Kysely, Transaction } from 'kysely'
import { describe, expect, it } from 'vitest'
import type { AdminDatabase } from '../database/types.js'
import type { AdminServerOptions } from '../options.js'

// 확장 범위 훅 타입(확장 범위 스펙 X5). 🔴 typecheck 가 재는 시험이다 — 쓰는 쪽 `interface Database extends AdminDatabase` 의
// Transaction<Database> 로 적은 훅이 옵션에 들어가야 한다. 들어가지 않으면 `pnpm typecheck` 가 이 파일에서 실패한다.

interface ShippingTokensTable {
  tokenNo: Generated<bigint>
  tokenName: string
}

interface Database extends AdminDatabase {
  shippingTokens: ShippingTokensTable
}

describe('확장 범위 옵션 타입', () => {
  it('🔴 쓰는 쪽 Transaction<Database> · Kysely<Database> 로 적은 훅이 들어간다', () => {
    const options: Pick<AdminServerOptions, 'ipAccess'> = {
      ipAccess: {
        extraScopes: [
          {
            type: 'shippingToken',
            target: {
              async lock(trx: Transaction<Database>, refNo: bigint) {
                const row = await trx
                  .selectFrom('shippingTokens')
                  .select('tokenNo')
                  .where('tokenNo', '=', refNo)
                  .forUpdate()
                  .executeTakeFirst()
                return row !== undefined
              },
              async names(db: Kysely<Database>, refNos: readonly bigint[]) {
                const rows = await db
                  .selectFrom('shippingTokens')
                  .select(['tokenNo', 'tokenName'])
                  .where('tokenNo', 'in', refNos)
                  .execute()
                return new Map(rows.map((row) => [row.tokenNo, row.tokenName]))
              },
            },
          },
        ],
      },
    }
    expect(options.ipAccess?.extraScopes).toHaveLength(1)
  })
})
```

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server exec vitest run src/ip-access/options.types.test.ts`
Expected: PASS. 🔴 typecheck 가 이 파일에서 실패하면(이변성으로도 `Transaction<Database>` 가 들어가지 않으면) 스펙 X5 가 틀린 것이다 — 고치지 말고 BLOCKED 로 보고한다(대안 — `defineIpExtraScope<DB>()` 도우미 — 은 사용자 결정이 필요하다).

- [ ] **Step 3: 분리 보장 DB 시험** — `packages/admin-server/src/ip-access/ip-access.separation.db.test.ts`(새):

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { countSuperAdmins } from '../accounts/super-admin.js'
import { testPrincipal } from '../test-support/accounts.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  PROBE_SCOPE,
  createProbeTokens,
  ipAccessConfig,
  probeScope,
  resetIpRules,
  seedIpRule,
  seedProbeToken,
  seedSessionFrom,
} from '../test-support/ip-access.js'
import { AdminIpExtraScopeService } from './extra-scope.service.js'
import { IpAccessPolicy } from './ip-access.policy.js'
import { AdminIpAccessService } from './ip-access.service.js'

// R3 분리 보장(확장 범위 스펙 §2-2 #2 · §4-5 · §10-3). 🔴 두 방향 모두 — 확장 규칙이 관리자 판정에, 코어 규칙이 확장 판정에
// 쓰이지 않는다. 확장 규칙의 번호를 관리자의 userNo 와 일부러 같게 둔다(다형 참조가 섞이는지 본다).

let t: TestDatabase
let ip: AdminIpAccessService
let extra: AdminIpExtraScopeService
let policy: IpAccessPolicy
let superAdmin: SeededUser
let staff: SeededUser
let token: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  await createProbeTokens(t.db)
  token = await seedProbeToken(t.db, '작업대 1')
  const config = ipAccessConfig(false, 'req.ip', { extraScopes: [probeScope()] })
  ip = new AdminIpAccessService(t.db, config, undefined)
  extra = new AdminIpExtraScopeService(t.db, config)
  policy = new IpAccessPolicy(t.db)
  const all = await seedRole(t.db, { roleName: 'sep-super', permissions: ['*'] })
  const plain = await seedRole(t.db, { roleName: 'sep-plain', permissions: [] })
  superAdmin = await seedUser(t.db, { roleNo: all, userId: 'sep-super' })
  staff = await seedUser(t.db, { roleNo: plain, userId: 'sep-staff' })
  await seedSessionFrom(t.db, staff.userNo, '203.0.113.9')
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

/** 관리자 userNo 와 같은 번호 · 범위 전체를 가리키는 좁은 확장 규칙 — 관리자 층으로 읽히면 모두 잠긴다 */
async function seedShadowingExtraRules(): Promise<void> {
  for (const scopeRefNo of [superAdmin.userNo, staff.userNo, token, null]) {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo, cidr: '192.0.2.0/24' })
  }
}

describe('🔴 R3a — 확장 규칙은 관리자 판정에 쓰이지 않는다', () => {
  it('정책(로그인 · 매 요청 · 갱신이 부르는 판정)이 그대로다', async () => {
    const context = { clientIp: '203.0.113.9', userNo: staff.userNo, teamNos: [] }
    expect(await policy.allows(context)).toBe(true)
    await seedShadowingExtraRules()
    expect(await policy.allows(context)).toBe(true)
  })

  it('확장 규칙의 0.0.0.0/0 은 관리자를 통과시키지 않는다 — 코어 규칙이 없으면 거부', async () => {
    await resetIpRules(t.db, [
      { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' },
      { scopeType: PROBE_SCOPE, scopeRefNo: staff.userNo, cidr: '0.0.0.0/0' },
    ])
    expect(
      await policy.allows({ clientIp: '203.0.113.9', userNo: staff.userNo, teamNos: [] }),
    ).toBe(false)
  })

  it('전권자 잔존 셈이 그대로다', async () => {
    const count = () =>
      t.db.transaction().execute((trx) => countSuperAdmins(trx, { ipAware: true }))
    const before = await count()
    await seedShadowingExtraRules()
    expect(await count()).toBe(before)
  })

  it('코어 쓰기의 자기 잠금 판정이 그대로다 — 확장 규칙이 요청자를 가리켜도 코어 쓰기가 된다', async () => {
    await seedShadowingExtraRules()
    const { item } = await ip.create(
      { scopeType: 'global', scopeRefNo: null, cidr: '198.51.100.0/24' },
      testPrincipal(staff.userNo, ['setting.ipAccess:write']),
      '203.0.113.9',
    )
    expect(item.scopeType).toBe('global')
  })

  it('미리보기의 요약 · 항목이 그대로다', async () => {
    const principal = testPrincipal(superAdmin.userNo, ['*'])
    const before = await ip.preview({}, principal, '203.0.113.9')
    await seedShadowingExtraRules()
    const after = await ip.preview({}, principal, '203.0.113.9')
    expect(after.summary).toEqual(before.summary)
    expect(after.items).toEqual(before.items)
    expect(after.clientPasses).toBe(before.clientPasses)
  })
})

describe('🔴 R3b — 코어 규칙은 확장 판정에 쓰이지 않는다', () => {
  it('global 시드 · 사용자 규칙(토큰 번호와 같은 번호)이 있어도 확장 규칙이 없으면 거부', async () => {
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: token, cidr: '0.0.0.0/0' })
    expect(await extra.allows(PROBE_SCOPE, token, '203.0.113.9')).toBe(false)
    expect(await extra.allows(PROBE_SCOPE, token, '2001:db8::1')).toBe(false)
  })

  it('확장 규칙을 더하면 그것만으로 판정한다', async () => {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '203.0.113.0/24' })
    expect(await extra.allows(PROBE_SCOPE, token, '203.0.113.9')).toBe(true)
    expect(await extra.allows(PROBE_SCOPE, token, '198.51.100.1')).toBe(false)
  })
})
```

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/ip-access/ip-access.separation.db.test.ts`
Expected: PASS(Task 3 · 4 가 이미 분리를 구현했다 — 이 시험은 그것을 굳힌다). 실패하면 분리 결함이다 — 원인을 찾아 Task 3 · 4 의 코드를 고치고(시험을 약하게 바꾸지 않는다) 이 Task 커밋에 함께 싣는다.

- [ ] **Step 4: HTTP 시험** — `packages/admin-server/src/ip-access/ip-access.extra.http.db.test.ts`(새). `ip-access.http.db.test.ts` 의 도우미(`data` · `sendJson` · `expectError` · `issues` · `signIn` · `auditRows`)를 이 파일에 그대로 옮겨 쓴다(파일 사이 공유 도우미를 새로 만들지 않는다):

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  IP_ACCESS_SCHEMA_MESSAGES,
  adminIpRuleItemSchema,
  adminIpRuleListSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readJsonColumn } from '../database/json.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import {
  PROBE_SCOPE,
  createProbeTokens,
  probeScope,
  resetIpRules,
  seedIpRule,
  seedProbeToken,
} from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'

// 확장 범위의 라우트 계약(확장 범위 스펙 §4 · §6). 🔴 슬롯은 그대로다(R7 없음) — ipAccess.manage 보유자가 쓴다.
// 🔴 supertest 의 요청 주소는 정규화 뒤 127.0.0.1 이다.

const IP_PATH = '/admin/ip-access'

let t: TestDatabase
let app: NestExpressApplication
let manager: SeededUser
let member: SeededUser
let token: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  await createProbeTokens(t.db)
  token = await seedProbeToken(t.db, '작업대 1')
  const managerRole = await seedRole(t.db, {
    roleName: '확장 IP 담당',
    permissions: ['setting.ipAccess:read', 'setting.ipAccess:write'],
  })
  const memberRole = await seedRole(t.db, { roleName: '확장 구성원', permissions: [] })
  manager = await seedUser(t.db, { roleNo: managerRole, userId: 'xip-manager' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'xip-member' })
  app = await bootAdminApp(
    { ...testDbServer(), database: t.name, connectionLimit: 4 },
    { ipAccess: { extraScopes: [probeScope()] } },
  )
})

afterAll(async () => {
  await app?.close()
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

// ── 도우미: ip-access.http.db.test.ts 의 data · sendJson · expectError · issues · signIn · auditRows 를 그대로 옮긴다 ──

describe('라우트로 확장 범위를 쓴다', () => {
  it('만들기 201 → 목록(스키마 통과 · 대상 이름) → 감사 after', async () => {
    const agent = await signIn(manager)
    const created = await sendJson(agent.post(IP_PATH), {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '203.0.113.7/32',
      description: '출고장',
    }).expect(201)
    const { item } = adminIpRuleItemSchema.parse(data(created))
    expect(item).toMatchObject({ scopeType: PROBE_SCOPE, scopeRefNo: token, scopeName: '작업대 1' })
    const list = adminIpRuleListSchema.parse(data(await agent.get(IP_PATH).expect(200)))
    expect(list.items.map((rule) => rule.scopeType)).toEqual(['global', 'global', PROBE_SCOPE])
    const [row] = await auditRows(CoreAuditActions.IP_ACCESS_CREATE)
    expect(JSON.stringify(row?.meta)).toContain(PROBE_SCOPE)
  })

  it('수정 · 삭제 — revision · 감사 before', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const agent = await signIn(manager)
    const updated = await sendJson(agent.patch(`${IP_PATH}/${ruleNo}`), {
      cidr: '10.1.0.0/16',
      revision: 0,
    }).expect(200)
    expect(adminIpRuleItemSchema.parse(data(updated)).item.revision).toBe(1)
    await sendJson(agent.delete(`${IP_PATH}/${ruleNo}`), { revision: 1 }).expect(200)
    expect(await auditRows(CoreAuditActions.IP_ACCESS_DELETE)).toHaveLength(1)
  })

  it('🔴 슬롯은 그대로 — 권한 없는 사람은 403', async () => {
    expectError(
      await sendJson((await signIn(member)).post(IP_PATH), {
        scopeType: PROBE_SCOPE,
        scopeRefNo: token,
        cidr: '10.0.0.0/8',
      }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})

describe('400 · 404', () => {
  it('모르는 범위 · 형식 밖 이름 · 대상 없음', async () => {
    const agent = await signIn(manager)
    for (const [body, issue] of [
      [
        { scopeType: 'goneScope', scopeRefNo: 1n, cidr: '10.0.0.0/8' },
        ['scopeType', IP_ACCESS_MESSAGES.unknownScopeType],
      ],
      [
        { scopeType: 'Bad!', scopeRefNo: 1n, cidr: '10.0.0.0/8' },
        ['scopeType', IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid],
      ],
      [
        { scopeType: PROBE_SCOPE, scopeRefNo: 999_999n, cidr: '10.0.0.0/8' },
        ['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTarget],
      ],
    ] as const) {
      const body400 = expectError(
        await sendJson(agent.post(IP_PATH), body),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(issues(body400.details)).toEqual([issue])
    }
  })

  it('🔴 갈래를 넘는 수정 400', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const body = expectError(
      await sendJson((await signIn(manager)).patch(`${IP_PATH}/${ruleNo}`), {
        scopeType: 'global',
        scopeRefNo: null,
        revision: 0,
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issues(body.details)).toEqual([['scopeType', IP_ACCESS_MESSAGES.scopeTypeLocked]])
  })

  it('🔴 미리보기는 코어만 — 확장 scopeType 400 · 확장 규칙 번호 404', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const agent = await signIn(manager)
    expectError(
      await agent.get(`${IP_PATH}/preview`).query({
        op: 'create',
        scopeType: PROBE_SCOPE,
        scopeRefNo: String(token),
        cidr: '10.0.0.0/8',
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expectError(
      await agent.get(`${IP_PATH}/preview`).query({ op: 'delete', ruleNo: String(ruleNo) }),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
  })
})

describe('🔴 R3a — 로그인', () => {
  it('확장 규칙(관리자 userNo 와 같은 번호 · 범위 전체)이 관리자 로그인을 막지 않는다', async () => {
    for (const scopeRefNo of [member.userNo, null]) {
      await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo, cidr: '192.0.2.0/24' })
    }
    await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ userId: member.userId, password: member.password })
      .expect(200)
  })

  it('확장 범위 0.0.0.0/0 만 있으면 관리자는 들어오지 못한다(코어 층 없음 — 기본 거부)', async () => {
    await resetIpRules(t.db, [{ scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' }])
    await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ userId: member.userId, password: member.password })
      .expect(401)
  })
})
```

(`ip-access.http.db.test.ts` 의 도우미 여섯을 이 파일의 `// ── 도우미 …` 자리에 옮겨 붙인다 — 이름 · 모양 그대로. `readJsonColumn` · `parseJSON` · `stringifyJSON` · `errorRespSchema` · `Response` import 는 그 도우미가 쓴다.)

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/ip-access/ip-access.extra.http.db.test.ts`
Expected: PASS. 감사 `meta` 의 모양이 `JSON.stringify` 로 `probeToken` 을 품지 않으면(가린 키 등) 기존 HTTP 시험의 감사 단언 모양을 따라 `after.scopeType` 을 직접 단언한다.

- [ ] **Step 5: 서버 전체**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server test && pnpm test:db`
Expected: 모두 PASS(실 MariaDB 11.4).

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
test(admin-server): IP 확장 범위 분리 보장(R3 양방향) · 라우트 계약 · 쓰는 쪽 훅 타입 시험

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 화면 순수 함수 — 선택지 키 · 표기 · 문구 · `'unrelated'` (모델: `sonnet`)

**Files:**

- Create: `packages/admin-ui/src/components/ip-access/ip-scope-choices.ts`
- Modify: `packages/admin-ui/src/components/ip-access/ip-access.ts`
- Test: `packages/admin-ui/src/components/ip-access/ip-scope-choices.test.ts`(새) · `packages/admin-ui/src/components/ip-access/ip-access.test.ts`

- [ ] **Step 1: 실패하는 시험** — `packages/admin-ui/src/components/ip-access/ip-scope-choices.test.ts`(새):

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_IP_ACCESS_MESSAGES as M } from './ip-access.js'
import {
  CORE_SCOPE_CATALOG,
  parseScopeChoice,
  prefillScopeChoice,
  resolveIpScopeCatalog,
  scopeChoiceItems,
  scopeChoiceKey,
  scopeChoiceLabel,
  wholeScopeKey,
} from './ip-scope-choices.js'

const shipping = { type: 'shippingToken', label: '출고 토큰', wholeLabel: '모든 출고 USB' }
const apiKey = { type: 'apiKey', label: 'API 키' }
const catalog = resolveIpScopeCatalog(['user', 'team', 'global'], [shipping, apiKey])

describe('선택지 키(확장 범위 스펙 X11)', () => {
  it('키 ↔ 범위 · 대상 없음', () => {
    expect(wholeScopeKey('shippingToken')).toBe('shippingToken:*')
    expect(parseScopeChoice('shippingToken:*')).toEqual({ scopeType: 'shippingToken', whole: true })
    expect(parseScopeChoice('shippingToken')).toEqual({ scopeType: 'shippingToken', whole: false })
    expect(parseScopeChoice('global')).toEqual({ scopeType: 'global', whole: true })
    expect(parseScopeChoice('team')).toEqual({ scopeType: 'team', whole: false })
    expect(scopeChoiceKey('shippingToken', null)).toBe('shippingToken:*')
    expect(scopeChoiceKey('shippingToken', 7n)).toBe('shippingToken')
    expect(scopeChoiceKey('global', null)).toBe('global')
    expect(scopeChoiceKey('team', null)).toBe('team')
  })

  it('이름 — 코어 문구 · 쓰는 쪽 label · wholeLabel · 없으면 「<label> 전체」 · 모르는 범위는 그대로', () => {
    expect(scopeChoiceLabel('user', M, catalog)).toBe(M.scopeUser)
    expect(scopeChoiceLabel('shippingToken', M, catalog)).toBe('출고 토큰')
    expect(scopeChoiceLabel('shippingToken:*', M, catalog)).toBe('모든 출고 USB')
    expect(scopeChoiceLabel('apiKey:*', M, catalog)).toBe(M.scopeWhole('API 키'))
    expect(scopeChoiceLabel('goneScope', M, catalog)).toBe('goneScope')
    expect(scopeChoiceLabel('goneScope:*', M, catalog)).toBe('goneScope')
  })
})

describe('선택지 목록', () => {
  it('만들기(all) — 코어 평가 순서 뒤에 확장 범위 · wholeLabel 없는 범위는 하나', () => {
    expect(scopeChoiceItems(M, catalog, 'all').map((item) => item.value)).toEqual([
      'user',
      'team',
      'global',
      'shippingToken',
      'shippingToken:*',
      'apiKey',
    ])
  })

  it('🔴 수정 — 코어 규칙은 코어만 · 확장 규칙은 그 범위만(X2)', () => {
    expect(scopeChoiceItems(M, catalog, 'core').map((item) => item.value)).toEqual([
      'user',
      'team',
      'global',
    ])
    expect(
      scopeChoiceItems(M, catalog, { extra: 'shippingToken' }).map((item) => item.value),
    ).toEqual(['shippingToken', 'shippingToken:*'])
  })

  it('지금 값이 목록 밖이면 그 자리에 남긴다 — 코어 층(3i S2) · wholeLabel 없는 범위 전체', () => {
    const narrow = resolveIpScopeCatalog(['user', 'global'], [apiKey])
    expect(scopeChoiceItems(M, narrow, 'core', 'team').map((item) => item.value)).toEqual([
      'user',
      'team',
      'global',
    ])
    expect(
      scopeChoiceItems(M, narrow, { extra: 'apiKey' }, 'apiKey:*').map((item) => item.value),
    ).toEqual(['apiKey', 'apiKey:*'])
  })

  it('코어만 쓰는 화면은 지금과 같다', () => {
    expect(scopeChoiceItems(M, CORE_SCOPE_CATALOG, 'all').map((item) => item.value)).toEqual([
      'user',
      'team',
      'global',
    ])
  })
})

describe('카탈로그 검증 · 미리 채움', () => {
  it('🔴 setup 에서 던진다 — 이름 규칙 밖 · 코어 이름 · 겹침 · focus 가 확장 범위 밖', () => {
    expect(() => resolveIpScopeCatalog(['global'], [{ type: 'Bad', label: 'x' }])).toThrow(
      'extraScopes',
    )
    expect(() => resolveIpScopeCatalog(['global'], [{ type: 'user', label: 'x' }])).toThrow(
      'extraScopes',
    )
    expect(() =>
      resolveIpScopeCatalog(['global'], [shipping, { ...shipping, label: 'y' }]),
    ).toThrow('extraScopes')
    expect(() => resolveIpScopeCatalog(['global'], [shipping], { scopeType: 'apiKey' })).toThrow(
      'focus',
    )
  })

  it('prefillScopeChoice — 고를 수 있는 선택지 키 · 아니면 null(스펙 §5-5)', () => {
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: 7n }, catalog)).toBe(
      'shippingToken',
    )
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: null }, catalog)).toBe(
      'shippingToken:*',
    )
    expect(prefillScopeChoice({ scopeType: 'apiKey', scopeRefNo: null }, catalog)).toBeNull()
    expect(prefillScopeChoice({ scopeType: 'goneScope', scopeRefNo: 1n }, catalog)).toBeNull()
    expect(prefillScopeChoice({ scopeType: 'user', scopeRefNo: 3n }, catalog)).toBe('user')
    expect(prefillScopeChoice({ scopeType: 'global', scopeRefNo: 3n }, catalog)).toBeNull()
    expect(prefillScopeChoice({ scopeType: 'team', scopeRefNo: null }, catalog)).toBeNull()
    expect(
      prefillScopeChoice(
        { scopeType: 'team', scopeRefNo: 4n },
        resolveIpScopeCatalog(['user', 'global']),
      ),
    ).toBeNull()
    const focused = resolveIpScopeCatalog(['user', 'team', 'global'], [shipping], {
      scopeType: 'shippingToken',
      scopeRefNo: 7n,
    })
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: 7n }, focused)).toBe(
      'shippingToken',
    )
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: null }, focused)).toBe(
      'shippingToken:*',
    )
    expect(prefillScopeChoice({ scopeType: 'shippingToken', scopeRefNo: 8n }, focused)).toBeNull()
    expect(prefillScopeChoice({ scopeType: 'user', scopeRefNo: 3n }, focused)).toBeNull()
  })
})
```

`packages/admin-ui/src/components/ip-access/ip-access.test.ts` 끝에 더한다(import 에 `resolveIpScopeCatalog` from `'./ip-scope-choices.js'` 와 `ruleScopeTitle`, `ruleScopeSub`, `formScopeTitle`, `toCreateBody`, `ruleToForm`, `ipRuleFormProblems`, `impactLine`, `gateImpact`, `previewQueryOf` 가 이미 없으면 더한다):

```ts
describe('확장 범위 — 폼 · 본문 · 표기(확장 범위 스펙 §5)', () => {
  const catalog = resolveIpScopeCatalog(
    ['user', 'team', 'global'],
    [{ type: 'shippingToken', label: '출고 토큰', wholeLabel: '모든 출고 USB' }],
  )
  const extraRule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
    ruleNo: 30n,
    scopeType: 'shippingToken',
    scopeRefNo: 7n,
    scopeName: '작업대 1',
    scopeUserId: null,
    cidr: '203.0.113.7/32',
    description: null,
    revision: 0,
    createAt: '2026-11-21T00:00:00.000Z',
    updateAt: '2026-11-21T00:00:00.000Z',
    ...over,
  })

  it('규칙 ↔ 폼 ↔ 본문 — 범위 전체는 :* 키 · 본문에서 null', () => {
    expect(ruleToForm(extraRule()).scopeType).toBe('shippingToken')
    expect(ruleToForm(extraRule({ scopeRefNo: null })).scopeType).toBe('shippingToken:*')
    expect(
      toCreateBody({
        scopeType: 'shippingToken:*',
        scopeRefNo: '',
        cidr: ' 10.0.0.0/8 ',
        description: '',
      }),
    ).toEqual({
      scopeType: 'shippingToken',
      scopeRefNo: null,
      cidr: '10.0.0.0/8',
      description: null,
    })
    expect(
      toCreateBody({
        scopeType: 'shippingToken',
        scopeRefNo: '7',
        cidr: '10.0.0.0/8',
        description: '',
      }).scopeRefNo,
    ).toBe(7n)
  })

  it('칸 검증 — 대상 하나는 번호가 있어야 하고 범위 전체는 없어도 된다', () => {
    const form = { scopeType: 'shippingToken', scopeRefNo: '', cidr: '10.0.0.0/8', description: '' }
    expect(ipRuleFormProblems(form, M).scopeRefNo).toEqual([M.scopeRefRequired])
    expect(ipRuleFormProblems({ ...form, scopeType: 'shippingToken:*' }, M)).toEqual({})
  })

  it('🔴 확장 폼은 미리보기 질의가 없다', () => {
    expect(
      previewQueryOf({
        op: 'create',
        form: { scopeType: 'shippingToken', scopeRefNo: '7', cidr: '10.0.0.0/8', description: '' },
      }),
    ).toBeNull()
    expect(previewQueryOf({ op: 'unrelated' })).toBeNull()
  })

  it('표기 — 대상 이름 · 범위 전체 · 대상 없음 · 모르는 범위', () => {
    expect(ruleScopeTitle(extraRule(), M, catalog)).toBe('출고 토큰 · 작업대 1')
    expect(ruleScopeSub(extraRule(), M)).toBe('#7')
    expect(ruleScopeTitle(extraRule({ scopeRefNo: null, scopeName: null }), M, catalog)).toBe(
      '모든 출고 USB',
    )
    expect(ruleScopeSub(extraRule({ scopeRefNo: null, scopeName: null }), M)).toBeNull()
    expect(ruleScopeTitle(extraRule({ scopeName: null }), M, catalog)).toBe('출고 토큰 #7')
    expect(ruleScopeSub(extraRule({ scopeName: null }), M)).toBe(M.deadTarget)
    expect(ruleScopeTitle(extraRule({ scopeType: 'goneScope', scopeName: null }), M, catalog)).toBe(
      'goneScope #7',
    )
    expect(
      formScopeTitle(
        { scopeType: 'shippingToken:*', scopeRefNo: '', cidr: '', description: '' },
        null,
        M,
        catalog,
      ),
    ).toBe('모든 출고 USB')
    expect(
      formScopeTitle(
        { scopeType: 'shippingToken', scopeRefNo: '7', cidr: '', description: '' },
        '작업대 1',
        M,
        catalog,
      ),
    ).toBe('출고 토큰 · 작업대 1')
  })

  it("'unrelated' — 영향 줄 · 관문 줄", () => {
    const view = { state: 'unrelated' as const, op: null, result: null, clientIp: '203.0.113.7' }
    expect(impactLine(view, M)).toBe(M.previewUnrelated)
    expect(gateImpact(view, M)).toBe(M.gateImpactUnrelated)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-scope-choices.test.ts src/components/ip-access/ip-access.test.ts`
Expected: FAIL — `ip-scope-choices.js` 가 없다.

- [ ] **Step 3: 선택지 모듈을 쓴다** — `packages/admin-ui/src/components/ip-access/ip-scope-choices.ts`(새):

```ts
import { isCoreIpScopeType, isIpExtraScopeTypeName, type IpScopeType } from '@ssworks/admin-shared'
import type { IpAccessMessages, IpSelectItem } from './ip-access.js'

// IP 규칙 범위 선택지 — 코어 층(사용자 · 팀 · 전체)과 확장 범위(관리자 밖 주체 — 출고 토큰 등)를 한 칸에서 고른다.
//
// 정본: 없음 — 확장 범위 스펙 X11 · X12 · §5-1 ~ §5-3 · §5-5.
// 🔴 폼의 scopeType 은 선택지 키다 — 확장 범위의 범위 전체는 `<이름>:*`. `:*` 는 서버 이름 규칙(영숫자)에 들어갈 수 없어 대상
//    칸에 친 글자와 섞이지 않는다. 본문을 만들 때 parseScopeChoice 가 { scopeType, whole } 로 푼다.
// 🔴 수정은 갈래를 넘지 않는다(X2) — 코어 규칙은 코어 선택지만, 확장 규칙은 그 범위의 둘만.

/** 가까운 층부터 — 그 순서가 곧 평가 순서다(hangang) */
export const IP_SCOPE_ORDER: readonly IpScopeType[] = Object.freeze(['user', 'team', 'global'])

export interface IpTargetOption {
  refNo: bigint
  name: string
}

export interface IpExtraScopeOption {
  /** 서버 옵션 ipAccess.extraScopes[].type 과 같은 이름 — 쓰는 쪽이 한 상수에서 만든다 */
  type: string
  /** 범위 이름(예: '출고 토큰') */
  label: string
  /** 범위 전체 이름(예: '모든 출고 USB'). 없으면 범위 전체를 고를 수 없다 — 서버 wholeScope 와 맞춘다 */
  wholeLabel?: string
  /** 대상 검색 → 후보. 없으면 번호 칸 */
  search?: (keyword: string) => Promise<readonly IpTargetOption[]>
  /** 게터 — 기본 () => true. 거짓이면 번호 칸 + 이유 */
  canSearch?: () => boolean
}

/** 한 범위 모드(R6-1) — 값이다(X12). 다른 대상을 보이려면 쓰는 쪽이 :key 로 다시 만든다 */
export interface IpRuleFocus {
  /** extraScopes 에 있는 확장 범위 */
  scopeType: string
  /** 주면 그 대상의 규칙 + 범위 전체 규칙만, 안 주면 그 범위 전부 */
  scopeRefNo?: bigint
}

/** 다른 화면에서 만들기를 열 때 미리 채울 값(R6c) */
export interface IpRulePrefill {
  /** 코어 층 또는 확장 범위 이름 */
  scopeType: string
  /** null = 전체(코어) · 범위 전체(확장) */
  scopeRefNo: bigint | null
  /** 대상 칸 · 관문 문구에 보일 이름 */
  scopeName?: string
  cidr?: string
  description?: string
}

/** 화면이 다루는 범위 — setup 에서 한 번 푼다 */
export interface IpScopeCatalog {
  /** 코어 층 — useIpAccessRules 의 scopes 를 평가 순서로 편 것 */
  readonly core: readonly IpScopeType[]
  /** 확장 범위 — 넘긴 순서 */
  readonly extra: ReadonlyMap<string, IpExtraScopeOption>
  readonly focus: IpRuleFocus | null
}

export const CORE_SCOPE_CATALOG: IpScopeCatalog = Object.freeze({
  core: IP_SCOPE_ORDER,
  extra: new Map<string, IpExtraScopeOption>(),
  focus: null,
})

const WHOLE_SUFFIX = ':*'

export function wholeScopeKey(type: string): string {
  return `${type}${WHOLE_SUFFIX}`
}

export interface IpScopeChoice {
  /** 서버 범위 이름 */
  scopeType: string
  /** 대상이 없는 선택지인가 — 코어 전체 · 확장 범위 전체 */
  whole: boolean
}

export function parseScopeChoice(key: string): IpScopeChoice {
  if (key.endsWith(WHOLE_SUFFIX)) {
    return { scopeType: key.slice(0, -WHOLE_SUFFIX.length), whole: true }
  }
  return { scopeType: key, whole: key === 'global' }
}

/** 규칙(서버 모양) → 선택지 키 */
export function scopeChoiceKey(scopeType: string, scopeRefNo: bigint | null): string {
  if (isCoreIpScopeType(scopeType) || scopeRefNo !== null) return scopeType
  return wholeScopeKey(scopeType)
}

/** 확장 범위(코어 밖)의 선택지인가 — 등록이 빠진 범위 포함 */
export function isExtraChoice(key: string): boolean {
  return !isCoreIpScopeType(parseScopeChoice(key).scopeType)
}

/** 🔴 setup 에서 던진다 — 이름 규칙 밖 · 코어 이름 · 겹침(대소문자 무시) · focus 가 확장 범위 밖 */
export function resolveIpScopeCatalog(
  core: readonly IpScopeType[],
  extraScopes: readonly IpExtraScopeOption[] = [],
  focus: IpRuleFocus | null = null,
): IpScopeCatalog {
  const extra = new Map<string, IpExtraScopeOption>()
  const seen = new Set<string>()
  for (const scope of extraScopes) {
    const lower = scope.type.toLowerCase()
    if (!isIpExtraScopeTypeName(scope.type) || seen.has(lower)) {
      throw new Error(
        `useIpAccessRules 의 extraScopes[].type 은 영소문자로 시작하는 영숫자 1~16자이고 global · team · user · 다른 범위와 겹치지 않아야 한다: ${JSON.stringify(scope.type)}`,
      )
    }
    seen.add(lower)
    extra.set(scope.type, Object.freeze({ ...scope }))
  }
  if (focus !== null && !extra.has(focus.scopeType)) {
    throw new Error(
      `useIpAccessRules 의 focus.scopeType 은 extraScopes 에 있는 범위여야 한다: ${JSON.stringify(focus.scopeType)}`,
    )
  }
  return Object.freeze({ core, extra, focus: focus === null ? null : Object.freeze({ ...focus }) })
}

function coreLabel(scopeType: IpScopeType, messages: IpAccessMessages): string {
  if (scopeType === 'user') return messages.scopeUser
  if (scopeType === 'team') return messages.scopeTeam
  return messages.scopeGlobal
}

/** 선택지 이름 — 코어는 문구, 확장은 쓰는 쪽 label · wholeLabel, 모르는 범위는 이름 그대로 */
export function scopeChoiceLabel(
  key: string,
  messages: IpAccessMessages,
  catalog: IpScopeCatalog,
): string {
  const { scopeType, whole } = parseScopeChoice(key)
  if (isCoreIpScopeType(scopeType)) return coreLabel(scopeType, messages)
  const extra = catalog.extra.get(scopeType)
  if (extra === undefined) return scopeType
  if (!whole) return extra.label
  return extra.wholeLabel ?? messages.scopeWhole(extra.label)
}

/** 'all' = 만들기 · 'core' = 코어 규칙 수정 · { extra } = 그 확장 범위(규칙 수정 · 한 범위 모드) */
export type IpScopeFamily = 'all' | 'core' | { extra: string }

/**
 * 선택지 — 코어는 평가 순서, 확장은 넘긴 순서(대상 하나 → 범위 전체). `current` 가 목록 밖이면(편집을 연 기존 규칙) 그 자리에
 * 둔다 — 폼이 다른 선택지로 바뀌면 사라진다(3i S2).
 */
export function scopeChoiceItems(
  messages: IpAccessMessages,
  catalog: IpScopeCatalog,
  family: IpScopeFamily,
  current?: string,
): IpSelectItem[] {
  const keys: string[] = []
  if (family === 'all' || family === 'core') {
    for (const layer of IP_SCOPE_ORDER) {
      if (catalog.core.includes(layer) || layer === current) keys.push(layer)
    }
  }
  if (family !== 'core') {
    for (const [type, scope] of catalog.extra) {
      if (family !== 'all' && family.extra !== type) continue
      keys.push(type)
      const whole = wholeScopeKey(type)
      if (scope.wholeLabel !== undefined || current === whole) keys.push(whole)
    }
  }
  return keys.map((value) => ({ value, title: scopeChoiceLabel(value, messages, catalog) }))
}

/** 미리 채울 선택지 키 — 이 화면이 고를 수 없으면 null(확장 범위 스펙 §5-5) */
export function prefillScopeChoice(
  prefill: Pick<IpRulePrefill, 'scopeType' | 'scopeRefNo'>,
  catalog: IpScopeCatalog,
): string | null {
  const { scopeType, scopeRefNo } = prefill
  const focus = catalog.focus
  if (focus !== null) {
    if (scopeType !== focus.scopeType) return null
    if (scopeRefNo !== null && focus.scopeRefNo !== undefined && scopeRefNo !== focus.scopeRefNo) {
      return null
    }
  }
  if (isCoreIpScopeType(scopeType)) {
    if (!catalog.core.includes(scopeType)) return null
    return (scopeType === 'global') === (scopeRefNo === null) ? scopeType : null
  }
  const extra = catalog.extra.get(scopeType)
  if (extra === undefined) return null
  if (scopeRefNo === null) return extra.wholeLabel === undefined ? null : wholeScopeKey(scopeType)
  return scopeType
}
```

- [ ] **Step 4: `ip-access.ts` 를 고친다**

(a) 머리 `바꾼 점:` 끝에 `//  - 확장 범위(확장 범위 스펙 §5): 범위 선택지 · 카탈로그는 ip-scope-choices.ts. 폼의 scopeType 은 선택지 키, 확장 규칙은 미리보기 대신 'unrelated'.` 를 더한다.

(b) import 에 `isCoreIpScopeType` 과 `./ip-scope-choices.js` 의 `CORE_SCOPE_CATALOG`, `IP_SCOPE_ORDER`, `parseScopeChoice`, `scopeChoiceItems`, `scopeChoiceKey`, `scopeChoiceLabel`, `type IpScopeCatalog` 를 더한다. 이 파일의 `IP_SCOPE_ORDER` 선언을 지우고, 위 import 로 받은 이름을 `export { IP_SCOPE_ORDER }` 로 다시 낸다(이 파일의 `resolveIpScopes` · `scopeTypeItems` 가 계속 쓰고, 이 이름을 import 하던 곳도 그대로 돈다 — `export … from` 만 쓰면 지역 이름이 생기지 않는다).

(c) 타입:

```ts
/** 칸 값은 문자열 — scopeRefNo '' = 없음. 🔴 scopeType 은 범위 선택지 키다 — 확장 범위 전체는 `<이름>:*`(X11) */
export interface IpRuleForm {
  scopeType: string
  scopeRefNo: string
  cidr: string
  description: string
}
```

```ts
export type IpPreviewState =
  'loading' | 'ready' | 'pending-input' | 'forbidden' | 'stale' | 'failed' | 'unrelated'
```

```ts
/** 미리보기가 무엇을 묻는가 — op null = 현행 · 'unrelated' = 관리자 접속과 무관한 규칙(확장 범위 — 부르지 않는다) */
export type IpPreviewTarget =
  | { op: null }
  | { op: 'unrelated' }
  | { op: 'create'; form: IpRuleForm }
  | { op: 'update'; ruleNo: bigint; form: IpRuleForm }
  | { op: 'delete'; ruleNo: bigint }
```

`IpSelectItem` 아래에 더한다:

```ts
/** 확장 범위 대상 칸의 바인딩 — 확장 범위의 「대상 하나」 선택지일 때만 */
export interface IpExtraTargetView {
  /** 검색 칸 제목(「대상 출고 토큰」) */
  label: string
  /** 번호 칸 제목(「출고 토큰 번호」) */
  numberLabel: string
  /** search = 쓰는 쪽 검색 · number = 번호 칸 · fixed = 한 범위 모드의 고정 대상(바꿀 수 없음) */
  mode: 'search' | 'number' | 'fixed'
  items: readonly IpSelectItem[]
  searching: boolean
  failed: boolean
  hint: string | null
  /** fixed 일 때 보일 글자 */
  fixedTitle: string | null
}
```

(d) `IpAccessMessages` 에 더한다(`scopeGlobal` 아래 · `previewFailed` 아래 · `hintRecovery` 아래 · `gateImpactUnknown` 아래 · `userSearchFailed` 아래 — 자리는 아무 데나 되지만 비슷한 것끼리):

```ts
scopeWhole: (label: string) => string
previewUnrelated: string
hintExtraScopes: string
gateImpactUnrelated: string
targetLabel: (scope: string) => string
targetNumberLabel: (scope: string) => string
targetSearchHint: string
targetSearchEmpty: string
targetSearchFailed: string
targetNoPermissionHint: string
```

`DEFAULT_IP_ACCESS_MESSAGES` 에 같은 키:

```ts
    scopeWhole: (label) => `${label} 전체`,
    // 🔴 "영향 없음"과 다르다 — 확인하지 못한 것이 아니라 관리자 판정에 쓰이지 않는 규칙이다(확장 범위 스펙 R3a)
    previewUnrelated: '이 규칙은 관리자 접속과 무관합니다 — 이 변경으로 잠기는 관리자는 없습니다.',
    hintExtraScopes:
      '사용자 · 팀 · 전체 밖의 범위 규칙은 관리자 접속 판정에 쓰이지 않고, 관리자 규칙(사용자 · 팀 · 전체)도 그 범위의 판정에 쓰이지 않습니다.',
    gateImpactUnrelated: '관리자 접속과 무관한 규칙입니다 — 이 변경으로 잠기는 관리자는 없습니다.',
    targetLabel: (scope) => `대상 ${scope}`,
    targetNumberLabel: (scope) => `${scope} 번호`,
    targetSearchHint: '이름을 입력하세요.',
    targetSearchEmpty: '맞는 대상이 없습니다.',
    targetSearchFailed: '대상을 검색하지 못했습니다. 다시 입력해 보세요.',
    targetNoPermissionHint: '대상 목록을 볼 권한이 없어 번호로 고릅니다.',
```

(e) 함수:

```ts
export function scopeTypeLabel(
  scopeType: string,
  messages: IpAccessMessages,
  catalog: IpScopeCatalog = CORE_SCOPE_CATALOG,
): string {
  return scopeChoiceLabel(scopeType, messages, catalog)
}

export function scopeTypeItems(
  messages: IpAccessMessages,
  scopes: readonly IpScopeType[] = IP_SCOPE_ORDER,
  current?: string,
): IpSelectItem[] {
  return scopeChoiceItems(messages, { ...CORE_SCOPE_CATALOG, core: scopes }, 'core', current)
}
```

```ts
export function ruleToForm(
  rule: Pick<AdminIpRule, 'scopeType' | 'scopeRefNo' | 'cidr' | 'description'>,
): IpRuleForm {
  return {
    scopeType: scopeChoiceKey(rule.scopeType, rule.scopeRefNo),
    scopeRefNo: rule.scopeRefNo == null ? '' : String(rule.scopeRefNo),
    cidr: rule.cidr,
    description: rule.description ?? '',
  }
}
```

`ipRuleFormProblems` · `isIpRuleFormPreviewable` 의 `form.scopeType !== 'global'` 를 `!parseScopeChoice(form.scopeType).whole` 로 바꾼다.

`previewQueryOf`:

```ts
export function previewQueryOf(target: IpPreviewTarget): AdminIpPreviewQuery | null {
  if (target.op === null) return {}
  if (target.op === 'unrelated') return null
  if (target.op === 'delete') return { op: 'delete', ruleNo: target.ruleNo }
  const { form } = target
  const choice = parseScopeChoice(form.scopeType)
  // 🔴 확장 범위는 미리보기 대상이 아니다(X9) — 흐름은 'unrelated' 로 보내 여기까지 오지 않는다
  if (!isCoreIpScopeType(choice.scopeType)) return null
  if (!isIpRuleFormPreviewable(form)) return null
  const query: AdminIpPreviewQuery = {
    op: target.op,
    scopeType: choice.scopeType,
    cidr: form.cidr.trim(),
  }
  if (target.op === 'update') query.ruleNo = target.ruleNo
  if (!choice.whole) query.scopeRefNo = BigInt(form.scopeRefNo.trim())
  return query
}
```

```ts
/** 만들기 본문. bigint 는 킷 API 클라이언트 코덱이 싣는다. 🔴 선택지 키를 서버 범위로 푼다(X11) */
export function toCreateBody(form: IpRuleForm): AdminIpRuleCreate {
  const choice = parseScopeChoice(form.scopeType)
  return {
    scopeType: choice.scopeType,
    scopeRefNo: choice.whole ? null : BigInt(form.scopeRefNo.trim()),
    cidr: form.cidr.trim(),
    description: descriptionOf(form),
  }
}
```

```ts
/** 규칙 범위 한 줄. 🔴 대상이 지워졌으면(scopeName null) 이름을 지어내지 않는다 — 번호만(I22 · hangang) */
export function ruleScopeTitle(
  rule: RuleScope,
  messages: IpAccessMessages,
  catalog: IpScopeCatalog = CORE_SCOPE_CATALOG,
): string {
  const key = scopeChoiceKey(rule.scopeType, rule.scopeRefNo)
  const label = scopeChoiceLabel(key, messages, catalog)
  if (parseScopeChoice(key).whole) return label
  if (rule.scopeName == null) return `${label} #${rule.scopeRefNo ?? '?'}`
  const name =
    rule.scopeType === 'user' && rule.scopeUserId != null
      ? userOptionTitle({ userName: rule.scopeName, userId: rule.scopeUserId })
      : rule.scopeName
  return `${label} · ${name}`
}

/** 범위 아래 줄 — 번호, 또는 대상 없음 안내. 전체 · 범위 전체는 없음 */
export function ruleScopeSub(rule: RuleScope, messages: IpAccessMessages): string | null {
  if (parseScopeChoice(scopeChoiceKey(rule.scopeType, rule.scopeRefNo)).whole) return null
  if (rule.scopeName == null) return messages.deadTarget
  return `#${rule.scopeRefNo}`
}

/** 편집 중인 폼의 범위 — 고른 대상 글자가 있으면 그것, 없으면 번호 */
export function formScopeTitle(
  form: IpRuleForm,
  targetTitle: string | null,
  messages: IpAccessMessages,
  catalog: IpScopeCatalog = CORE_SCOPE_CATALOG,
): string {
  const label = scopeChoiceLabel(form.scopeType, messages, catalog)
  if (parseScopeChoice(form.scopeType).whole) return label
  return targetTitle != null ? `${label} · ${targetTitle}` : `${label} #${form.scopeRefNo.trim()}`
}
```

`impactLine` 의 `if (view.state === 'stale')` 줄 앞에 `if (view.state === 'unrelated') return messages.previewUnrelated` 를, `gateImpact` 첫 줄에 `if (view.state === 'unrelated') return messages.gateImpactUnrelated` 를 더한다.

`resolveIpScopes` · `defaultIpScope` · `withScopeType` · `emptyIpRuleForm` 은 그대로 둔다(Task 1 의 `string` 매개변수).

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access src/composables && pnpm --filter @ssworks/admin-ui typecheck`
Expected: PASS — 기존 IP 시험(코어 표기 · 미리보기 질의 · 범위 · 폼)이 그대로 통과한다.

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-ui/src
git commit -m "$(cat <<'EOF'
feat(admin-ui): IP 확장 범위 선택지 키 · 카탈로그 · 표기 · 문구 · 미리보기 'unrelated' 상태(순수 함수)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 화면 흐름 — 확장 범위 선택 · 대상 검색 · 저장 · 삭제 (모델: `sonnet`)

**Files:**

- Modify: `packages/admin-ui/src/composables/useIpPreview.ts`
- Modify: `packages/admin-ui/src/composables/useIpAccessRules.ts`
- Modify(시험 도우미만): `packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts`
- Test: `packages/admin-ui/src/composables/useIpPreview.test.ts` · `packages/admin-ui/src/composables/useIpAccessRules.extra.render.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 — 미리보기** — `packages/admin-ui/src/composables/useIpPreview.test.ts` 의 기존 마운트 도우미 모양을 따라 끝에 더한다:

```ts
describe("'unrelated' — 확장 범위(확장 범위 스펙 §5-4)", () => {
  it('🔴 서버 미리보기를 부르지 않는다 · op 는 null · flush 는 바로', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview, { immediate: false })
    c.setTarget({ op: 'unrelated' })
    expect(c.view.value).toMatchObject({ state: 'unrelated', op: null, result: null })
    expect((await c.flush()).state).toBe('unrelated')
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(preview).not.toHaveBeenCalled()
  })

  it('관리 권한이 없으면 unrelated 보다 forbidden', () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview, { immediate: false, canManage: () => false })
    c.setTarget({ op: 'unrelated' })
    expect(c.view.value.state).toBe('forbidden')
  })
})
```

(`setup(preview, over)` · `result()` · `PreviewFn` 와 가짜 타이머(`beforeEach`)는 이 파일에 이미 있다.)

- [ ] **Step 2: 미리보기를 고친다** — `packages/admin-ui/src/composables/useIpPreview.ts`

`show`:

```ts
function show(
  state: IpPreviewState,
  result: AdminIpPreview | null,
  clientIp = view.value.clientIp,
): void {
  const op = target.value.op
  view.value = { state, op: op === 'unrelated' ? null : op, result, clientIp }
}
```

`schedule` 의 `if (!options.canManage()) { … }` 블록 바로 아래:

```ts
// 🔴 관리자 접속과 무관한 규칙(확장 범위) — 서버 미리보기를 부르지 않는다(확장 범위 스펙 §5-4 · X9)
if (target.value.op === 'unrelated') {
  show('unrelated', null)
  return
}
```

`key`:

```ts
const key = computed(() => {
  if (!options.canManage()) return 'forbidden'
  return target.value.op === 'unrelated'
    ? 'unrelated'
    : previewQueryKey(previewQueryOf(target.value))
})
```

머리 주석 `바꾼 점:` 에 `- 'unrelated'(확장 범위 스펙 §5-4) — 확장 규칙은 부르지 않고 상태만.` 을 더한다.

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useIpPreview.test.ts`
Expected: PASS.

- [ ] **Step 3: 실패하는 시험 — 흐름** — `packages/admin-ui/src/composables/useIpAccessRules.extra.render.test.ts`(새):

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { AdminIpPreview, AdminIpPreviewQuery, AdminIpRule } from '@ssworks/admin-shared'
import { DEFAULT_IP_ACCESS_MESSAGES as M } from '../components/ip-access/ip-access.js'
import type {
  IpExtraScopeOption,
  IpTargetOption,
} from '../components/ip-access/ip-scope-choices.js'
import { REMOTE_SEARCH_DEBOUNCE_MS } from './useRemoteSearch.js'
import {
  useIpAccessRules,
  type IpAccessRules,
  type UseIpAccessRulesOptions,
} from './useIpAccessRules.js'

// 확장 범위 흐름(확장 범위 스펙 §5-1 ~ §5-4) — 선택지 · 대상 검색 · 미리보기 없음 · 저장 · 삭제 · 모르는 범위.

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 1n,
  scopeType: 'global',
  scopeRefNo: null,
  scopeName: null,
  scopeUserId: null,
  cidr: '0.0.0.0/0',
  description: '기본 허용(IPv4)',
  revision: 0,
  createAt: '2026-11-21T00:00:00.000Z',
  updateAt: '2026-11-21T00:00:00.000Z',
  ...over,
})
const GLOBAL_V4 = rule()
const TOKEN = rule({
  ruleNo: 30n,
  scopeType: 'shippingToken',
  scopeRefNo: 7n,
  scopeName: '작업대 1',
  cidr: '203.0.113.7/32',
  description: null,
})
const ALL_USB = rule({
  ruleNo: 31n,
  scopeType: 'shippingToken',
  scopeRefNo: null,
  cidr: '0.0.0.0/0',
  description: null,
})
const GONE = rule({
  ruleNo: 40n,
  scopeType: 'goneScope',
  scopeRefNo: 2n,
  cidr: '10.0.0.0/8',
  description: null,
})
const RULES = [GLOBAL_V4, GONE, TOKEN, ALL_USB]

const previewResult = (): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 3,
    newlyLocked: 0,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function shipping(over: Partial<IpExtraScopeOption> = {}): IpExtraScopeOption {
  return {
    type: 'shippingToken',
    label: '출고 토큰',
    wholeLabel: '모든 출고 USB',
    search: vi.fn(async (): Promise<readonly IpTargetOption[]> => [
      { refNo: 8n, name: '작업대 2' },
    ]),
    ...over,
  }
}

async function setup(over: Partial<UseIpAccessRulesOptions> = {}) {
  const adapters = {
    list: vi.fn(async (): Promise<readonly AdminIpRule[]> => RULES),
    preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
    create: vi.fn(async (): Promise<unknown> => ({})),
    update: vi.fn(async (): Promise<unknown> => ({})),
    remove: vi.fn(async (): Promise<unknown> => ({})),
  }
  let ip!: IpAccessRules<AdminIpRule>
  wrapper = mount(
    defineComponent({
      setup() {
        ip = useIpAccessRules({
          ...adapters,
          canManage: () => true,
          extraScopes: [shipping()],
          ...over,
        })
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { ...adapters, ip }
}

const values = (ip: IpAccessRules<AdminIpRule>) =>
  ip.manager.value.scopeItems.map((item) => item.value)

describe('선택지', () => {
  it('새 규칙 — 코어 셋 뒤에 출고 토큰 · 모든 출고 USB', async () => {
    const { ip } = await setup()
    await ip.openCreate()
    expect(values(ip)).toEqual(['user', 'team', 'global', 'shippingToken', 'shippingToken:*'])
    expect(ip.manager.value.scopeItems.slice(3).map((item) => item.title)).toEqual([
      '출고 토큰',
      '모든 출고 USB',
    ])
  })

  it('wholeLabel 이 없으면 범위 전체를 고를 수 없다', async () => {
    const { ip } = await setup({ extraScopes: [shipping({ wholeLabel: undefined })] })
    await ip.openCreate()
    expect(values(ip)).toEqual(['user', 'team', 'global', 'shippingToken'])
  })

  it('🔴 수정 — 확장 규칙은 그 범위 둘만 · 코어로 바꾸는 갱신은 버린다(X2)', async () => {
    const { ip } = await setup()
    await ip.openEdit(TOKEN)
    expect(values(ip)).toEqual(['shippingToken', 'shippingToken:*'])
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'global' })
    expect(ip.form.value.scopeType).toBe('shippingToken')
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken:*' })
    expect(ip.form.value).toMatchObject({ scopeType: 'shippingToken:*', scopeRefNo: '' })
  })

  it('🔴 코어 규칙 수정 — 코어만', async () => {
    const { ip } = await setup()
    await ip.openEdit(GLOBAL_V4)
    expect(values(ip)).toEqual(['user', 'team', 'global'])
  })

  it('🔴 setup 에서 던진다 — 이름 규칙 밖 · 코어 이름(컴포넌트 밖에서 불러도 첫머리에서 던진다 — 3i 시험과 같은 꼴)', () => {
    const adapters = {
      list: vi.fn(async (): Promise<readonly AdminIpRule[]> => []),
      preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      remove: vi.fn(async () => ({})),
    }
    for (const type of ['Bad', 'user']) {
      expect(() =>
        useIpAccessRules({ ...adapters, canManage: () => true, extraScopes: [shipping({ type })] }),
      ).toThrow(/extraScopes/)
    }
  })
})

describe('미리보기 · 대상 칸', () => {
  it("🔴 확장 선택지면 미리보기 어댑터를 부르지 않는다 — 'unrelated'", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { ip, preview } = await setup()
    preview.mockClear()
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(ip.preview.value.state).toBe('unrelated')
    expect(preview).not.toHaveBeenCalled()
  })

  it('대상 검색 — 300ms 뒤 쓰는 쪽 어댑터 · 후보 · 지금 대상 이름', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const search = vi.fn(async (): Promise<readonly IpTargetOption[]> => [
      { refNo: 8n, name: '작업대 2' },
    ])
    const { ip } = await setup({ extraScopes: [shipping({ search })] })
    await ip.openEdit(TOKEN)
    expect(ip.manager.value.extraTarget).toMatchObject({
      label: M.targetLabel('출고 토큰'),
      mode: 'search',
      items: [{ value: '7', title: '작업대 1' }],
    })
    ip.manager.value.onSearchTargets('작업')
    await vi.advanceTimersByTimeAsync(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(search).toHaveBeenCalledWith('작업')
    expect(ip.manager.value.extraTarget?.items).toEqual([
      { value: '7', title: '작업대 1' },
      { value: '8', title: '작업대 2' },
    ])
  })

  it('🔴 canSearch 가 거짓이면 부르지 않고 번호 칸 · 이유', async () => {
    const search = vi.fn(async (): Promise<readonly IpTargetOption[]> => [])
    const { ip } = await setup({ extraScopes: [shipping({ search, canSearch: () => false })] })
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken' })
    expect(ip.manager.value.extraTarget).toMatchObject({
      mode: 'number',
      numberLabel: M.targetNumberLabel('출고 토큰'),
      hint: M.targetNoPermissionHint,
    })
    ip.manager.value.onSearchTargets('작업')
    expect(search).not.toHaveBeenCalled()
  })

  it('범위 전체 · 코어 선택지에서는 확장 대상 칸이 없다', async () => {
    const { ip } = await setup()
    await ip.openEdit(ALL_USB)
    expect(ip.manager.value.extraTarget).toBeNull()
    await ip.openEdit(GLOBAL_V4)
    expect(ip.manager.value.extraTarget).toBeNull()
  })
})

describe('저장 · 삭제', () => {
  it('대상 하나 — 본문 · 관문 문구(대상 이름 · 무관) · 「미리보기 없이 저장」 경고 없음', async () => {
    const { ip, create, preview } = await setup()
    preview.mockClear()
    await ip.openEdit(TOKEN)
    await ip.closeEditor()
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken' })
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeRefNo: '7', cidr: '203.0.113.8/32' })
    const saving = ip.save()
    await flushPromises()
    const dialog = ip.manager.value.confirmDialog
    expect(dialog.message).toContain('출고 토큰 · 작업대 1')
    expect(dialog.message).toContain(M.gateImpactUnrelated)
    dialog.onConfirm()
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(
      { scopeType: 'shippingToken', scopeRefNo: 7n, cidr: '203.0.113.8/32', description: null },
      {},
    )
    expect(ip.manager.value.alerts).toEqual([])
    expect(preview).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'create' }))
  })

  it('범위 전체 — 본문 scopeRefNo null · 관문 「모든 출고 USB」', async () => {
    const { ip, create } = await setup()
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({
      ...ip.form.value,
      scopeType: 'shippingToken:*',
      cidr: '198.51.100.0/24',
    })
    const saving = ip.save()
    await flushPromises()
    expect(ip.manager.value.confirmDialog.message).toContain('모든 출고 USB')
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(
      { scopeType: 'shippingToken', scopeRefNo: null, cidr: '198.51.100.0/24', description: null },
      {},
    )
  })

  it('🔴 삭제 — 미리보기를 부르지 않고 · 0.0.0.0/0 이어도 전체 허용 경고가 없다', async () => {
    const { ip, remove, preview } = await setup()
    preview.mockClear()
    const removing = ip.remove(ALL_USB)
    await flushPromises()
    expect(ip.manager.value.globalAllowRemoval).toBe(false)
    const dialog = ip.manager.value.confirmDialog
    expect(dialog.message).toContain(M.gateImpactUnrelated)
    expect(dialog.message).not.toContain(M.globalAllowRemoval)
    dialog.onConfirm()
    expect(await removing).toBe(true)
    expect(remove).toHaveBeenCalledWith(ALL_USB, { revision: 0 }, {})
    expect(preview).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'delete' }))
  })

  it('🔴 모르는 범위 행 — 수정은 열리지 않고 삭제만 된다(X8)', async () => {
    const { ip, remove } = await setup()
    expect(ip.manager.value.canEditRule(GONE)).toBe(false)
    expect(ip.manager.value.canEditRule(TOKEN)).toBe(true)
    expect(await ip.openEdit(GONE)).toBe(false)
    const removing = ip.remove(GONE)
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await removing).toBe(true)
    expect(remove).toHaveBeenCalled()
  })

  it('목록 표기 — 바인딩 카탈로그로 확장 범위 이름을 그린다', async () => {
    const { ip } = await setup()
    expect(ip.manager.value.scopeCatalog.extra.get('shippingToken')?.label).toBe('출고 토큰')
    expect(ip.manager.value.showPreviewCard).toBe(true)
  })
})
```

(관문 창의 `message` 키 · `onConfirm` 은 `ConfirmDialogBindings` 그대로다. `useIpAccessRules.write.render.test.ts` 의 기존 단언 모양을 따른다.)

- [ ] **Step 4: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useIpAccessRules.extra.render.test.ts`
Expected: FAIL — `extraScopes` 를 모른다.

- [ ] **Step 5: 흐름을 쓴다** — `packages/admin-ui/src/composables/useIpAccessRules.ts`

(a) 머리 주석 `바꾼 점:` 끝에 더한다:

```ts
//  - 확장 범위(확장 범위 스펙 §5): extraScopes — 선택지 키(범위 전체 `<이름>:*`) · 쓰는 쪽 대상 검색 · 확장 규칙은 미리보기 대신
//    'unrelated' · 수정은 갈래를 넘지 않는다 · 화면이 모르는 범위의 행은 삭제만.
```

(b) import 를 더한다:

```ts
import { CommonErrorCodes, isCoreIpScopeType } from '@ssworks/admin-shared'
...
import {
  isExtraChoice,
  parseScopeChoice,
  resolveIpScopeCatalog,
  scopeChoiceItems,
  type IpExtraScopeOption,
  type IpScopeCatalog,
  type IpScopeFamily,
  type IpTargetOption,
} from '../components/ip-access/ip-scope-choices.js'
import type { RemoteSearch } from './useRemoteSearch.js'
```

`../components/ip-access/ip-access.js` import 에서 `scopeTypeItems` 를 빼고 `type IpExtraTargetView` 를 더한다.

(c) 옵션 · 바인딩 타입:

```ts
  /**
   * 확장 범위(관리자 밖 주체 — 출고 토큰 등). 서버 옵션 ipAccess.extraScopes 와 같은 이름 — 쓰는 쪽이 한 상수에서 만든다.
   * 🔴 이름 규칙 밖 · 코어 이름 · 겹침은 setup 에서 던진다. 확장 규칙도 canManage(= ipAccess.manage)가 쓴다(R7 없음).
   */
  extraScopes?: readonly IpExtraScopeOption[]
```

`IpAccessManagerBindings` 에 더한다:

```ts
  /** 범위 이름을 그리는 카탈로그 — 표 · 편집 패널 */
  scopeCatalog: IpScopeCatalog
  /** 확장 범위 「대상 하나」 선택지일 때만 */
  extraTarget: IpExtraTargetView | null
  onSearchTargets: (keyword: string) => void
  /** 🔴 화면이 모르는 범위의 행은 수정하지 않는다(X8) — 삭제만 */
  canEditRule: (rule: R) => boolean
  /** 한 범위 모드면 거짓 — 관리자 접속 카드를 그리지 않는다 */
  showPreviewCard: boolean
```

(d) setup 첫머리(`const scopes = resolveIpScopes(options.scopes)` 다음):

```ts
// 🔴 setup 첫머리에서 던진다 — 고를 수 없는 범위는 설정 실수다(확장 범위 스펙 §5-1)
const catalog = resolveIpScopeCatalog(scopes, options.extraScopes ?? [], null)
```

(e) 갈래 · 수정 가능:

```ts
/** 만들기 = 전부(한 범위 모드면 그 범위) · 수정 = 그 규칙의 갈래(X2) */
function familyOf(target: R | 'new' | null): IpScopeFamily {
  if (target === null || target === 'new') {
    return catalog.focus === null ? 'all' : { extra: catalog.focus.scopeType }
  }
  return isCoreIpScopeType(target.scopeType) ? 'core' : { extra: target.scopeType }
}

/** 🔴 화면이 모르는 범위의 행(옵션에서 지운 범위)은 수정하지 않는다 — 서버도 400 이다(X8) */
const canEditRule = (rule: AdminIpRule): boolean =>
  isCoreIpScopeType(rule.scopeType) || catalog.extra.has(rule.scopeType)

function choiceItems() {
  return scopeChoiceItems(messages, catalog, familyOf(editing.value), form.value.scopeType)
}
```

(f) `syncTarget`:

```ts
function syncTarget(): void {
  const deleting = removing.value
  const current = editing.value
  if (deleting != null) {
    // 🔴 확장 규칙(모르는 범위 포함)은 관리자 접속과 무관하다 — 미리보기를 부르지 않는다(§5-4)
    preview.setTarget(
      isCoreIpScopeType(deleting.scopeType)
        ? { op: 'delete', ruleNo: deleting.ruleNo }
        : { op: 'unrelated' },
    )
  } else if (current === null) preview.setTarget({ op: null })
  else if (isExtraChoice(form.value.scopeType)) preview.setTarget({ op: 'unrelated' })
  else if (current === 'new') preview.setTarget({ op: 'create', form: { ...form.value } })
  else preview.setTarget({ op: 'update', ruleNo: current.ruleNo, form: { ...form.value } })
}
```

(g) 대상 후보 — `rememberTarget` · `withCurrent` 를 넓히고 확장 검색을 더한다:

```ts
function rememberTarget(rule: AdminIpRule): void {
  if (rule.scopeRefNo == null || rule.scopeName == null) return
  const title =
    rule.scopeType === 'user' && rule.scopeUserId != null
      ? userOptionTitle({ userName: rule.scopeName, userId: rule.scopeUserId })
      : rule.scopeName
  knownTargets.set(`${rule.scopeType}:${rule.scopeRefNo}`, title)
}
```

```ts
/** 지금 대상이 후보에 없어도 칸이 이름을 보이게 맨 앞에 둔다. choiceKey 는 대상이 있는 선택지(team · user · 확장 이름) */
function withCurrent(items: IpSelectItem[], choiceKey: string): IpSelectItem[] {
  const refNo = form.value.scopeRefNo.trim()
  if (
    form.value.scopeType !== choiceKey ||
    refNo === '' ||
    items.some((item) => item.value === refNo)
  ) {
    return items
  }
  return [
    { value: refNo, title: knownTargets.get(`${choiceKey}:${refNo}`) ?? `#${refNo}` },
    ...items,
  ]
}
```

(`withCurrent([...teamItems.value], 'team')` · `withCurrent(items, 'user')` 호출은 그대로 돈다.)

```ts
// ── 확장 범위 대상 후보 ─────────────────────────────────────────────

const extraSearches = new Map<string, RemoteSearch<IpTargetOption>>()
for (const [type, scope] of catalog.extra) {
  if (scope.search != null) extraSearches.set(type, useRemoteSearch(scope.search))
}
const canSearchExtra = (type: string): boolean =>
  extraSearches.has(type) && (catalog.extra.get(type)?.canSearch?.() ?? true)

const extraTarget = computed<IpExtraTargetView | null>(() => {
  const choice = parseScopeChoice(form.value.scopeType)
  const scope = catalog.extra.get(choice.scopeType)
  if (scope === undefined || choice.whole) return null
  const search = extraSearches.get(choice.scopeType)
  const found = (search?.items.value ?? []).map((option) => {
    const item = { value: String(option.refNo), title: option.name }
    knownTargets.set(`${choice.scopeType}:${item.value}`, item.title)
    return item
  })
  const searchable = canSearchExtra(choice.scopeType)
  return {
    label: messages.targetLabel(scope.label),
    numberLabel: messages.targetNumberLabel(scope.label),
    mode: searchable ? 'search' : 'number',
    items: withCurrent(found, choice.scopeType),
    searching: search?.searching.value ?? false,
    failed: search?.failed.value ?? false,
    hint: search != null && !searchable ? messages.targetNoPermissionHint : null,
    fixedTitle: null,
  }
})
```

(h) `openEdit` 첫 줄 가드에 `!canEditRule(rule)` 를 더한다:

```ts
if (!options.canManage() || busy.value || !canEditRule(rule)) return false
```

(i) `updateForm` 의 목록 밖 검사를 선택지로:

```ts
// 🔴 선택지 밖으로 바꾸는 갱신은 통째로 버린다(3i S4 · X2) — 갈래를 넘거나 목록 밖 층으로 가지 않는다
if (
  next.scopeType !== form.value.scopeType &&
  !choiceItems().some((item) => item.value === next.scopeType)
)
  return
```

(j) `targetTitleOf`:

```ts
function targetTitleOf(value: IpRuleForm): string | null {
  const choice = parseScopeChoice(value.scopeType)
  if (choice.whole) return null
  return knownTargets.get(`${choice.scopeType}:${value.scopeRefNo.trim()}`) ?? null
}
```

(k) `save` 안:

- `scope: formScopeTitle(submitted, targetTitleOf(submitted), messages, catalog),`
- `globalRemoval: target !== 'new' && isCoreIpScopeType(target.scopeType) && removesGlobalAllow(target.cidr, cidr),`
- `if (snapshot.state !== 'ready') pushAlert('warning', messages.savedWithoutPreview)` → `if (snapshot.state !== 'ready' && snapshot.state !== 'unrelated') pushAlert(…)`
- revision 충돌 알림의 `ruleScopeTitle(fresh, messages)` → `ruleScopeTitle(fresh, messages, catalog)`.

(l) `remove` 안: `scope: ruleScopeTitle(rule, messages, catalog),`, `globalRemoval: isCoreIpScopeType(rule.scopeType) && removesGlobalAllow(rule.cidr, null),`, 충돌 알림의 `ruleScopeTitle(fresh, messages)` → `ruleScopeTitle(fresh, messages, catalog)`.

(m) `globalAllowRemoval` computed:

```ts
const globalAllowRemoval = computed(() => {
  const deleting = removing.value
  if (deleting != null) {
    return isCoreIpScopeType(deleting.scopeType) && removesGlobalAllow(deleting.cidr, null)
  }
  const current = editing.value
  return (
    current !== null &&
    current !== 'new' &&
    isCoreIpScopeType(current.scopeType) &&
    removesGlobalAllow(current.cidr, form.value.cidr.trim())
  )
})
```

(n) `manager` 바인딩: `scopeItems: choiceItems(),` 로 바꾸고 더한다:

```ts
    scopeCatalog: catalog,
    extraTarget: extraTarget.value,
    onSearchTargets: (keyword) => {
      const type = parseScopeChoice(form.value.scopeType).scopeType
      if (canSearchExtra(type)) extraSearches.get(type)?.search(keyword)
    },
    canEditRule,
    showPreviewCard: catalog.focus === null,
```

(`scopeTypeItems` · `resolveIpScopes` import 중 쓰지 않게 된 것은 지운다.)

- [ ] **Step 6: 부품 시험 도우미가 새 바인딩을 갖게 한다** — `packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts` 의 바인딩을 만드는 도우미(`IpAccessManagerBindings<AdminIpRule>` 를 돌려주는 함수 — `messages: M, ...over` 로 끝난다)의 `messages: M,` 위에 더한다(import 에 `CORE_SCOPE_CATALOG` from `'./ip-scope-choices.js'`):

```ts
    scopeCatalog: CORE_SCOPE_CATALOG,
    extraTarget: null,
    onSearchTargets: vi.fn(),
    canEditRule: () => true,
    showPreviewCard: true,
```

- [ ] **Step 7: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables src/components/ip-access && pnpm --filter @ssworks/admin-ui typecheck`
Expected: PASS — 새 시험과 기존 IP 흐름 · 부품 시험 전부. (부품은 Task 9 까지 새 바인딩을 모른다 — `v-bind` 로 남는 속성 경고가 나와도 실패가 아니면 괜찮다.)

- [ ] **Step 8: 커밋**

```bash
git add packages/admin-ui/src
git commit -m "$(cat <<'EOF'
feat(admin-ui): useIpAccessRules extraScopes — 확장 범위 선택 · 대상 검색 · 미리보기 없음 · 저장 · 삭제 · 모르는 범위는 삭제만

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 화면 흐름 — 한 범위 모드 · 미리 채운 만들기 (모델: `sonnet`)

**Files:**

- Modify: `packages/admin-ui/src/composables/useIpAccessRules.ts`
- Test: `packages/admin-ui/src/composables/useIpAccessRules.focus.render.test.ts`(새)

- [ ] **Step 1: 실패하는 시험** — `packages/admin-ui/src/composables/useIpAccessRules.focus.render.test.ts`(새). 머리 · `rule` · `previewResult` · `shipping` · `setup` 도우미는 `useIpAccessRules.extra.render.test.ts` 와 같게 옮겨 쓰고(규칙 목록만 아래처럼), 시험을 쓴다:

```ts
const GLOBAL_V4 = rule()
const TOKEN_7 = rule({
  ruleNo: 30n,
  scopeType: 'shippingToken',
  scopeRefNo: 7n,
  scopeName: '작업대 1',
  cidr: '203.0.113.7/32',
  description: null,
})
const TOKEN_8 = rule({
  ruleNo: 32n,
  scopeType: 'shippingToken',
  scopeRefNo: 8n,
  scopeName: '작업대 2',
  cidr: '198.51.100.8/32',
  description: null,
})
const ALL_USB = rule({
  ruleNo: 31n,
  scopeType: 'shippingToken',
  scopeRefNo: null,
  cidr: '10.0.0.0/8',
  description: null,
})
const RULES = [GLOBAL_V4, TOKEN_7, ALL_USB, TOKEN_8]
const FOCUS_7 = { scopeType: 'shippingToken', scopeRefNo: 7n }

describe('한 범위 모드(focus — 스펙 §5-3)', () => {
  it('대상을 주면 — 그 토큰 · 모든 출고 USB 규칙만 · 선택지 둘 · 카드 없음', async () => {
    const { ip } = await setup({ focus: FOCUS_7 })
    expect(ip.rules.value).toEqual([TOKEN_7, ALL_USB])
    expect(ip.manager.value.rules).toEqual([TOKEN_7, ALL_USB])
    expect(ip.manager.value.showPreviewCard).toBe(false)
    await ip.openCreate()
    expect(ip.manager.value.scopeItems.map((item) => item.value)).toEqual([
      'shippingToken',
      'shippingToken:*',
    ])
  })

  it('대상을 안 주면 — 그 범위 전부', async () => {
    const { ip } = await setup({ focus: { scopeType: 'shippingToken' } })
    expect(ip.rules.value).toEqual([TOKEN_7, ALL_USB, TOKEN_8])
  })

  it('🔴 대상 고정 — 새 폼은 그 토큰 · 대상 칸은 fixed · 번호를 바꾸는 갱신은 무시', async () => {
    const { ip } = await setup({ focus: FOCUS_7 })
    await ip.openCreate()
    expect(ip.form.value).toMatchObject({ scopeType: 'shippingToken', scopeRefNo: '7' })
    expect(ip.manager.value.extraTarget).toMatchObject({ mode: 'fixed', fixedTitle: '작업대 1' })
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeRefNo: '8' })
    expect(ip.form.value.scopeRefNo).toBe('7')
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken:*' })
    expect(ip.form.value).toMatchObject({ scopeType: 'shippingToken:*', scopeRefNo: '' })
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken' })
    expect(ip.form.value.scopeRefNo).toBe('7')
  })

  it('🔴 focus 범위가 extraScopes 에 없으면 setup 에서 던진다', () => {
    expect(() =>
      useIpAccessRules({
        list: vi.fn(async (): Promise<readonly AdminIpRule[]> => []),
        preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
        remove: vi.fn(async () => ({})),
        canManage: () => true,
        extraScopes: [shipping()],
        focus: { scopeType: 'apiKey' },
      }),
    ).toThrow(/focus/)
  })

  it('저장 뒤 재조회 — 다시 걸러 보인다', async () => {
    const { ip, list } = await setup({ focus: FOCUS_7 })
    list.mockResolvedValueOnce([
      ...RULES,
      rule({
        ruleNo: 33n,
        scopeType: 'shippingToken',
        scopeRefNo: 7n,
        scopeName: '작업대 1',
        cidr: '203.0.113.9/32',
      }),
    ])
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '203.0.113.9/32' })
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(ip.rules.value.map((item) => item.ruleNo)).toEqual([30n, 31n, 33n])
  })
})

describe('미리 채운 만들기(openCreate(prefill) — 스펙 §5-5 · R6c)', () => {
  const PREFILL = {
    scopeType: 'shippingToken',
    scopeRefNo: 8n,
    scopeName: '작업대 2',
    cidr: '203.0.113.50/32',
    description: '2026-11-21 출고 시도에서 허용',
  }

  it('패널이 그 값으로 열리고 관문 문구에 이름 · 저장 본문', async () => {
    const { ip, create } = await setup()
    expect(await ip.openCreate(PREFILL)).toBe(true)
    expect(ip.form.value).toEqual({
      scopeType: 'shippingToken',
      scopeRefNo: '8',
      cidr: '203.0.113.50/32',
      description: '2026-11-21 출고 시도에서 허용',
    })
    expect(ip.manager.value.extraTarget?.items[0]).toEqual({ value: '8', title: '작업대 2' })
    const saving = ip.save()
    await flushPromises()
    expect(ip.manager.value.confirmDialog.message).toContain('출고 토큰 · 작업대 2')
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(
      {
        scopeType: 'shippingToken',
        scopeRefNo: 8n,
        cidr: '203.0.113.50/32',
        description: '2026-11-21 출고 시도에서 허용',
      },
      {},
    )
  })

  it('🔴 미리 채운 값은 고친 값이다 — 닫을 때 버릴지 묻는다', async () => {
    const { ip } = await setup()
    await ip.openCreate(PREFILL)
    const closing = ip.closeEditor()
    await flushPromises()
    expect(ip.manager.value.discardDialog.modelValue).toBe(true)
    ip.manager.value.discardDialog.onConfirm()
    expect(await closing).toBe(true)
  })

  it('범위 전체로 연다', async () => {
    const { ip } = await setup()
    expect(
      await ip.openCreate({ scopeType: 'shippingToken', scopeRefNo: null, cidr: '10.0.0.0/8' }),
    ).toBe(true)
    expect(ip.form.value).toMatchObject({
      scopeType: 'shippingToken:*',
      scopeRefNo: '',
      cidr: '10.0.0.0/8',
    })
  })

  it('코어 사용자로도 연다(한 범위 모드가 아니면)', async () => {
    const { ip } = await setup()
    expect(
      await ip.openCreate({ scopeType: 'user', scopeRefNo: 3n, scopeName: '김운영 (ops01)' }),
    ).toBe(true)
    expect(ip.form.value).toMatchObject({ scopeType: 'user', scopeRefNo: '3' })
  })

  it('🔴 열지 않는다 — 권한 없음 · 모르는 범위 · wholeLabel 없는 범위 전체 · focus 밖 · 코어 global 에 대상', async () => {
    expect(await (await setup({ canManage: () => false })).ip.openCreate(PREFILL)).toBe(false)
    const { ip } = await setup({ extraScopes: [shipping({ wholeLabel: undefined })] })
    expect(await ip.openCreate({ scopeType: 'goneScope', scopeRefNo: 1n })).toBe(false)
    expect(await ip.openCreate({ scopeType: 'shippingToken', scopeRefNo: null })).toBe(false)
    expect(await ip.openCreate({ scopeType: 'global', scopeRefNo: 1n })).toBe(false)
    expect(ip.editing.value).toBeNull()
    const focused = await setup({ focus: FOCUS_7 })
    expect(await focused.ip.openCreate(PREFILL)).toBe(false)
    expect(await focused.ip.openCreate({ scopeType: 'user', scopeRefNo: 3n })).toBe(false)
    expect(await focused.ip.openCreate({ ...PREFILL, scopeRefNo: 7n })).toBe(true)
  })
})
```

(`setup` 은 한 시험에서 두 번 부르면 앞의 `wrapper` 를 덮는다 — `afterEach` 가 마지막 것만 내린다. 거슬리면 `setup` 이 마운트한 것을 배열에 모아 `afterEach` 에서 모두 내린다.)

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useIpAccessRules.focus.render.test.ts`
Expected: FAIL — `focus` · `openCreate(prefill)` 이 없다.

- [ ] **Step 3: 흐름을 쓴다** — `packages/admin-ui/src/composables/useIpAccessRules.ts`

(a) import 에 `prefillScopeChoice`, `type IpRuleFocus`, `type IpRulePrefill` 를 더한다. 머리 주석 `바꾼 점:` 끝에 `//  - 한 범위 모드 focus(값 — X12) · 미리 채운 openCreate(prefill)(확장 범위 스펙 §5-3 · §5-5).` 를 더한다.

(b) 옵션 · 반환 타입:

```ts
  /**
   * 한 범위 모드(R6-1) — 목록을 그 범위(대상을 주면 그 대상 + 범위 전체)로 거르고, 선택지를 그 범위로 좁히고, 대상을 주면
   * 대상 칸을 고정하고, 관리자 접속 카드를 그리지 않는다. 🔴 값이다 — 다른 대상은 쓰는 쪽이 :key 로 다시 만든다(X12).
   * extraScopes 에 있는 범위여야 한다(아니면 setup 에서 던진다).
   */
  focus?: IpRuleFocus
```

`IpAccessRules` 의 `openCreate: () => Promise<boolean>` 를 바꾼다:

```ts
/**
 * 고친 값이 있으면 버릴지 묻는다(I21). 취소 · 막힘이면 false. prefill 을 주면 그 값으로 연다(R6c — 다른 화면의 [이 IP 허용]) —
 * 🔴 미리 채운 값은 고친 값이다. 이 화면이 고를 수 없는 선택지면 false.
 */
openCreate: (prefill?: IpRulePrefill) => Promise<boolean>
```

(c) 카탈로그에 focus:

```ts
const catalog = resolveIpScopeCatalog(scopes, options.extraScopes ?? [], options.focus ?? null)
```

(d) 빈 폼 · 고정 대상:

```ts
/** 새 규칙 폼 — 한 범위 모드면 그 범위(대상이 있으면 그 대상) */
function emptyForm(): IpRuleForm {
  const focus = catalog.focus
  if (focus === null) return emptyIpRuleForm(newScope)
  return {
    ...emptyIpRuleForm(focus.scopeType),
    scopeRefNo: focus.scopeRefNo === undefined ? '' : String(focus.scopeRefNo),
  }
}

/** 🔴 한 범위 모드의 대상은 바꿀 수 없다 — 대상 하나 선택지면 늘 그 대상 */
function pinFocus(next: IpRuleForm): IpRuleForm {
  const focus = catalog.focus
  if (focus?.scopeRefNo === undefined || next.scopeType !== focus.scopeType) return next
  return { ...next, scopeRefNo: String(focus.scopeRefNo) }
}
```

`const form = ref<IpRuleForm>(emptyIpRuleForm(newScope))` · `let baseline: IpRuleForm = emptyIpRuleForm(newScope)` 를 `emptyForm()` 으로 바꾼다(함수 선언이 위에 오게 자리를 옮긴다 — `catalog` 다음).

(e) 목록 거르기 — `const rules = shallowRef<readonly R[]>([])` 를 바꾼다:

```ts
const allRules = shallowRef<readonly R[]>([])
/** 한 범위 모드면 그 범위만(화면에서 거른다 — 서버 목록 그대로) */
const rules = computed<readonly R[]>(() => {
  const focus = catalog.focus
  if (focus === null) return allRules.value
  return allRules.value.filter(
    (rule) =>
      rule.scopeType === focus.scopeType &&
      (focus.scopeRefNo === undefined ||
        rule.scopeRefNo === null ||
        rule.scopeRefNo === focus.scopeRefNo),
  )
})
```

`load` 안의 `rules.value = items` 를 `allRules.value = items` 로, `findRule` 은 `allRules.value.find(…)` 로 바꾼다(`rules` 반환 · `manager.rules: rules.value` 는 그대로).

(f) `setEditor` — 미리 채움 · 기준선:

```ts
function setEditor(next: R | 'new' | null, seed?: IpRuleForm): void {
  editing.value = next
  form.value =
    next === null ? emptyForm() : next === 'new' ? (seed ?? emptyForm()) : ruleToForm(next)
  // 🔴 만들기의 기준선은 빈 폼 — 미리 채운 값은 고친 값이다(닫을 때 묻는다)
  baseline = next === 'new' ? emptyForm() : { ...form.value }
  clientErrors.value = {}
  flow.clearFieldErrors()
  if (next !== null && next !== 'new') rememberTarget(next)
  syncTarget()
  if (next !== null) loadTeams()
}
```

(g) `openCreate`:

```ts
async function openCreate(prefill?: IpRulePrefill): Promise<boolean> {
  // 🔴 첫 줄 가드 — :disabled 는 마우스만 막는다
  if (!options.canManage() || busy.value) return false
  let seed: IpRuleForm | undefined
  if (prefill !== undefined) {
    const key = prefillScopeChoice(prefill, catalog)
    if (key === null) return false
    seed = {
      scopeType: key,
      scopeRefNo: prefill.scopeRefNo === null ? '' : String(prefill.scopeRefNo),
      cidr: prefill.cidr ?? '',
      description: prefill.description ?? '',
    }
  }
  if (!(await askDiscard())) return false
  alerts.value = []
  if (prefill?.scopeName != null && prefill.scopeRefNo !== null) {
    knownTargets.set(`${prefill.scopeType}:${prefill.scopeRefNo}`, prefill.scopeName)
  }
  setEditor('new', seed)
  return true
}
```

(h) `updateForm` — 고정 대상:

```ts
form.value = pinFocus(withScopeType({ ...next, scopeType: form.value.scopeType }, next.scopeType))
```

(i) `extraTarget` computed 의 반환 — 고정 모드:

```ts
const fixed =
  catalog.focus?.scopeRefNo !== undefined && catalog.focus.scopeType === choice.scopeType
const refNo = form.value.scopeRefNo.trim()
const searchable = canSearchExtra(choice.scopeType)
return {
  label: messages.targetLabel(scope.label),
  numberLabel: messages.targetNumberLabel(scope.label),
  mode: fixed ? 'fixed' : searchable ? 'search' : 'number',
  items: withCurrent(found, choice.scopeType),
  searching: search?.searching.value ?? false,
  failed: search?.failed.value ?? false,
  hint: !fixed && search != null && !searchable ? messages.targetNoPermissionHint : null,
  fixedTitle: fixed ? (knownTargets.get(`${choice.scopeType}:${refNo}`) ?? `#${refNo}`) : null,
}
```

(🔴 `fixedTitle` 은 목록에서 기억한 이름을 쓴다 — `load` 뒤 `allRules` 의 규칙을 `rememberTarget` 으로 기억하게 `load` 의 `allRules.value = items` 다음 줄에 `for (const item of items) rememberTarget(item)` 를 더한다.)

(j) `manager.onOpenCreate` 는 그대로 `void openCreate()`(인자 없이).

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables src/components/ip-access && pnpm --filter @ssworks/admin-ui typecheck`
Expected: PASS — 새 focus 시험과 기존 시험 전부.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-ui/src
git commit -m "$(cat <<'EOF'
feat(admin-ui): useIpAccessRules 한 범위 모드 focus · 미리 채운 openCreate(prefill)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 화면 부품 · export (모델: `sonnet`)

**Files:**

- Modify: `packages/admin-ui/src/components/ip-access/IpAccessManager.vue` · `IpRuleEditor.vue` · `IpTargetField.vue` · `IpRuleTable.vue` · `IpPreviewCard.vue`
- Modify: `packages/admin-ui/src/index.ts`
- Test: `packages/admin-ui/src/components/ip-access/ip-access-parts.render.test.ts` · `packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts`

- [ ] **Step 1: 실패하는 시험 — 부품** — `ip-access-parts.render.test.ts`

`mountTable` 도우미가 넘기는 props 에 `scopeCatalog: CORE_SCOPE_CATALOG, canEditRule: () => true` 를 기본으로 더하고(import `CORE_SCOPE_CATALOG`, `resolveIpScopeCatalog` from `'./ip-scope-choices.js'`), 카드 마운트 도우미도 `hasExtraScopes` 를 넘길 수 있게 둔다. `describe('IpRuleTable')` 끝에 더한다:

```ts
it('확장 범위 — 이름 · 범위 전체 · 🔴 모르는 범위는 수정이 꺼진다', () => {
  const catalog = resolveIpScopeCatalog(
    ['user', 'team', 'global'],
    [{ type: 'shippingToken', label: '출고 토큰', wholeLabel: '모든 출고 USB' }],
  )
  const extraRules = [
    rule({
      ruleNo: 30n,
      scopeType: 'shippingToken',
      scopeRefNo: 7n,
      scopeName: '작업대 1',
      cidr: '203.0.113.7/32',
    }),
    rule({
      ruleNo: 31n,
      scopeType: 'shippingToken',
      scopeRefNo: null,
      scopeName: null,
      cidr: '10.0.0.0/8',
    }),
    rule({
      ruleNo: 40n,
      scopeType: 'goneScope',
      scopeRefNo: 2n,
      scopeName: null,
      cidr: '192.0.2.0/24',
    }),
  ]
  mountTable({
    rules: extraRules,
    scopeCatalog: catalog,
    canEditRule: (r: AdminIpRule) => r.scopeType !== 'goneScope',
  })
  expect(rows()[0]!.textContent).toContain('출고 토큰 · 작업대 1')
  expect(rows()[1]!.textContent).toContain('모든 출고 USB')
  expect(rows()[2]!.textContent).toContain('goneScope #2')
  const edit = document.querySelector<HTMLButtonElement>(
    'button[aria-label="goneScope #2 192.0.2.0/24 규칙 수정"]',
  )
  expect(edit!.disabled).toBe(true)
  const remove = document.querySelector<HTMLButtonElement>(
    'button[aria-label="goneScope #2 192.0.2.0/24 규칙 삭제"]',
  )
  expect(remove!.disabled).toBe(false)
})
```

`describe('IpPreviewCard')` 끝에 더한다(카드 마운트 도우미 이름에 맞춘다):

```ts
it("'unrelated' — 기준 줄 없이 무관 문구 · 확장 범위 힌트", () => {
  mountCard({
    preview: { state: 'unrelated', op: null, result: null, clientIp: '203.0.113.7' },
    hasExtraScopes: true,
  })
  expect(text()).toContain(M.previewUnrelated)
  expect(text()).not.toContain(M.basisCurrent)
  expect(text()).toContain(M.hintExtraScopes)
})

it('확장 범위가 없으면 그 힌트가 없다', () => {
  mountCard({})
  expect(text()).not.toContain(M.hintExtraScopes)
})
```

`ip-access-manager.render.test.ts` 의 `describe('흐름 + 화면 — useIpAccessRules 와 함께')` 안에 도우미를 하나 더하고(그 describe 의 `mountFlow` 는 어댑터만 돌려준다 — 이 시험은 흐름 객체가 필요하다), 끝에 시험 둘을 더한다(import 에 `type IpAccessRules` from `'../../composables/useIpAccessRules.js'`):

```ts
async function mountExtraFlow(extra: Partial<UseIpAccessRulesOptions>) {
  let ip!: IpAccessRules<AdminIpRule>
  wrapper = mount(
    defineComponent({
      setup() {
        ip = useIpAccessRules({
          list: vi.fn(async (): Promise<readonly AdminIpRule[]> => RULES),
          preview: vi.fn(async (_query: AdminIpPreviewQuery) => result()),
          create: vi.fn(async (): Promise<unknown> => ({})),
          update: vi.fn(async (): Promise<unknown> => ({})),
          remove: vi.fn(async (): Promise<unknown> => ({})),
          canManage: () => true,
          ...extra,
        })
        return () => h(IpAccessManager as Component, { ...ip.manager.value })
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return { ip }
}
```

```ts
it('확장 범위 — 출고 토큰을 고르면 대상 검색 칸 · 카드 영향 줄은 무관', async () => {
  const { ip } = await mountExtraFlow({
    extraScopes: [
      {
        type: 'shippingToken',
        label: '출고 토큰',
        wholeLabel: '모든 출고 USB',
        search: async () => [{ refNo: 8n, name: '작업대 2' }],
      },
    ],
  })
  await ip.openCreate()
  ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken' })
  await flushPromises()
  expect(text()).toContain(M.previewUnrelated)
  expect(document.querySelector('input[name="scopeRefNo"]')).not.toBeNull()
  expect(text()).toContain(M.targetLabel('출고 토큰'))
})

it('🔴 한 범위 모드 — 카드가 없고 대상 칸은 고정(꺼짐)', async () => {
  const { ip } = await mountExtraFlow({
    extraScopes: [{ type: 'shippingToken', label: '출고 토큰' }],
    focus: { scopeType: 'shippingToken', scopeRefNo: 7n },
  })
  expect(text()).not.toContain(M.cardTitle)
  await ip.openCreate()
  await flushPromises()
  const target = document.querySelector<HTMLInputElement>('input[name="scopeRefNo"]')
  expect(target?.disabled).toBe(true)
})
```

(`text` · `result` · `RULES` · `wrapper` 는 이 파일에 이미 있다. 부품 시험의 `mountCard` · `mountTable` · `rows` · `text` 도 `ip-access-parts.render.test.ts` 에 이미 있다.)

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access`
Expected: FAIL — 부품이 새 props 를 모른다.

- [ ] **Step 3: 부품을 고친다**

`IpPreviewCard.vue` — props 에 `hasExtraScopes?: boolean`(Boolean — 없으면 false). 템플릿: 기준 줄을 `<p v-if="preview.state !== 'unrelated'" class="text-medium-emphasis">{{ basisLine(preview.op, messages) }}</p>` 로, 힌트 묶음 끝에 `<p v-if="hasExtraScopes">{{ messages.hintExtraScopes }}</p>` 를 더한다. 머리 주석 `바꾼 점:` 에 `확장 범위(스펙 §5-4): 'unrelated' 면 기준 줄 없음 · 확장 범위 힌트.` 를 덧붙인다.

`IpRuleTable.vue` — props 에 `scopeCatalog: IpScopeCatalog` 와 `canEditRule: (rule: R) => boolean` 를 더한다(import `type IpScopeCatalog` from `'./ip-scope-choices.js'`). `ruleScopeTitle(row(item), messages)` · `ruleLabel` 안의 `ruleScopeTitle(rule, props.messages)` 를 카탈로그를 넘기게 바꾸고(`ruleScopeTitle(row(item), messages, scopeCatalog)` · `ruleScopeTitle(rule, props.messages, props.scopeCatalog)`), 수정 버튼을 `:disabled="busy || !canEditRule(row(item))"` 로 바꾼다. 머리 주석에 `🔴 화면이 모르는 범위의 행은 수정 버튼이 꺼진다(확장 범위 스펙 X8) — 삭제는 된다.` 를 더한다.

`IpTargetField.vue` — props 를 바꾼다(`scopeType: 'team' | 'user'` → `kind`):

```ts
const props = defineProps<{
  kind: 'team' | 'user' | 'extra'
  value: string
  errorMessages: readonly string[]
  disabled: boolean
  teamMode: 'select' | 'number'
  teamItems: readonly IpSelectItem[]
  teamsLoading: boolean
  teamsFailed: boolean
  teamHint: string | null
  userMode: 'search' | 'number'
  userItems: readonly IpSelectItem[]
  usersSearching: boolean
  usersFailed: boolean
  userHint: string | null
  extraTarget: IpExtraTargetView | null
  messages: IpAccessMessages
}>()

const emit = defineEmits<{
  'update:value': [value: string]
  searchUsers: [keyword: string]
  searchTargets: [keyword: string]
}>()

const teamItemList = computed(() => [...props.teamItems])
const errors = computed(() => [...props.errorMessages])
const extraMode = computed(() =>
  props.kind === 'extra' ? (props.extraTarget?.mode ?? 'number') : null,
)
const numberMode = computed(() => {
  if (props.kind === 'team') return props.teamMode === 'number'
  if (props.kind === 'user') return props.userMode === 'number'
  return extraMode.value === 'number'
})
const numberLabel = computed(() => {
  if (props.kind === 'team') return props.messages.teamNumberLabel
  if (props.kind === 'user') return props.messages.userNumberLabel
  return props.extraTarget?.numberLabel ?? ''
})
const hint = computed(() => {
  if (props.kind === 'team') return props.teamHint
  if (props.kind === 'user') return props.userHint
  return props.extraTarget?.hint ?? null
})
```

템플릿 — 맨 앞에 고정 칸, 번호 칸 제목, 확장 검색 칸:

```vue
<VTextField
  v-if="extraMode === 'fixed'"
  density="compact"
  disabled
  :label="extraTarget?.label"
  :model-value="extraTarget?.fixedTitle ?? ''"
  name="scopeRefNo"
  variant="outlined"
/>
<VTextField
  v-else-if="numberMode"
  autocomplete="off"
  density="compact"
  :disabled="disabled"
  :error-messages="errors"
  :label="numberLabel"
  :model-value="value"
  name="scopeRefNo"
  :placeholder="messages.numberPlaceholder"
  variant="outlined"
  @update:model-value="update"
/>
<VSelect v-else-if="kind === 'team'" … 지금 그대로 … />
<RemoteSearchField v-else-if="kind === 'user'" … 지금 그대로 … />
<RemoteSearchField
  v-else
  :disabled="disabled"
  :empty-text="messages.targetSearchEmpty"
  :error-messages="errorMessages"
  :failed="extraTarget?.failed ?? false"
  :failed-text="messages.targetSearchFailed"
  :hint-text="messages.targetSearchHint"
  :items="extraTarget?.items ?? []"
  :label="extraTarget?.label ?? ''"
  :model-value="value"
  name="scopeRefNo"
  :searching="extraTarget?.searching ?? false"
  @search="emit('searchTargets', $event)"
  @update:model-value="update"
/>
```

(`teamsFailed` 문구의 `v-if="scopeType === 'team' && …"` 를 `kind === 'team'` 으로 바꾼다. 머리 주석 `바꾼 점:` 에 `확장 범위(스펙 §5-2): 쓰는 쪽 검색 칸 · 번호 칸 · 한 범위 모드의 고정 칸.` 을 덧붙인다.)

`IpRuleEditor.vue` — props 에 `scopeCatalog: IpScopeCatalog`, `extraTarget: IpExtraTargetView | null` 를 더하고, emit 에 `searchTargets: [keyword: string]` 를 더한다. `IP_SCOPE_TYPES` import · `scopeTypes` 상수를 지우고:

```ts
const current = computed(() =>
  props.editing === 'new'
    ? null
    : `${ruleScopeTitle(props.editing, props.messages, props.scopeCatalog)} · ${props.editing.cidr}`,
)
/** 대상 칸의 종류 — 전체 · 범위 전체면 없음 */
const targetKind = computed<'team' | 'user' | 'extra' | null>(() => {
  const choice = parseScopeChoice(props.form.scopeType)
  if (choice.whole) return null
  if (choice.scopeType === 'team' || choice.scopeType === 'user') return choice.scopeType
  return props.extraTarget === null ? null : 'extra'
})

/** 범위를 바꾸면 대상 비우기는 흐름(useIpAccessRules)이 한다 — 여기는 선택지 안의 값만 올린다 */
function patchScope(value: unknown): void {
  if (typeof value === 'string' && props.scopeItems.some((item) => item.value === value)) {
    emit('update:form', { ...props.form, scopeType: value })
  }
}
```

(`targetScope` 를 `targetKind` 로 바꾸고 import 에 `parseScopeChoice`, `type IpScopeCatalog` from `'./ip-scope-choices.js'`, `type IpExtraTargetView` from `'./ip-access.js'` 를 더한다.) 템플릿의 `IpTargetField`:

```vue
<IpTargetField
  v-if="targetKind"
  class="ip-rule-editor__target"
  :disabled="busy"
  :error-messages="errors('scopeRefNo')"
  :extra-target="extraTarget"
  :kind="targetKind"
  :messages="messages"
  …
  팀
  ·
  사용자
  props
  그대로
  …
  :value="form.scopeRefNo"
  @search-targets="emit('searchTargets', $event)"
  @search-users="emit('searchUsers', $event)"
  @update:value="patch('scopeRefNo', $event)"
/>
```

머리 주석의 `🔴 전체 범위면 대상 칸을 그리지 않는다` 를 `🔴 전체 · 범위 전체면 대상 칸을 그리지 않는다 — 대상 없음 ⟺ 그 선택지가 서버 불변식이다.` 로 고친다.

`IpAccessManager.vue` — props 에 `scopeCatalog: IpScopeCatalog`, `extraTarget: IpExtraTargetView | null`, `canEditRule: (rule: R) => boolean`, `showPreviewCard: boolean` 을, emit 에 `searchTargets: [keyword: string]` 를 더한다. 템플릿:

```vue
<IpPreviewCard
  v-if="showPreviewCard"
  :changed-items="changedItems"
  :global-allow-removal="globalAllowRemoval"
  :has-extra-scopes="scopeCatalog.extra.size > 0"
  :is-self="isSelf"
  :locked-items="lockedItems"
  :messages="messages"
  :preview="preview"
/>
<IpRuleEditor
  v-if="editing !== null"
  …
  지금
  그대로
  …
  :extra-target="extraTarget"
  :scope-catalog="scopeCatalog"
  @search-targets="emit('searchTargets', $event)"
/>
<IpRuleTable … 지금 그대로 … :can-edit-rule="canEditRule" :scope-catalog="scopeCatalog" />
```

머리 주석에 `확장 범위(스펙 §5): 한 범위 모드면 카드가 없다(showPreviewCard).` 를 더한다.

`packages/admin-ui/src/index.ts` — IP 블록에 더한다:

```ts
export type {
  IpExtraScopeOption,
  IpTargetOption,
  IpRuleFocus,
  IpRulePrefill,
} from './components/ip-access/ip-scope-choices.js'
```

그리고 `ip-access.js` export 목록에 `type IpExtraTargetView` 를 더한다(바인딩 타입이 가리킨다). README 표(177행)의 IP 행에도 넷을 더한다 — Task 10 에서 함께.

- [ ] **Step 4: 통과 · 빌드 · d.ts**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access src/composables && pnpm --filter @ssworks/admin-ui typecheck && pnpm --filter @ssworks/admin-ui build`
Expected: PASS · 빌드 성공.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-ui/src
git commit -m "$(cat <<'EOF'
feat(admin-ui): IP 화면 부품 확장 범위 — 대상 검색 · 고정 칸 · 무관 카드 · 한 범위 모드 카드 없음 · 모르는 범위 수정 끔 · 타입 export

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 기록 · changeset · peer 하한 (모델: `sonnet`)

**Files:**

- Modify: `packages/admin-server/README.md`(「IP 접근 제어」)
- Modify: `packages/admin-ui/README.md`(진입점 표 177행 · 「IP 접근 제어」)
- Modify: `CLAUDE.md` · `docs/HANDOFF.md` · `docs/01-phase0.md`(§8 표)
- Modify: `packages/admin-server/package.json` · `packages/admin-ui/package.json`(peer 하한)
- Create: `.changeset/ip-extra-scopes.md`

- [ ] **Step 1: admin-server README** — 「IP 접근 제어」 절의 `- **진단 경고**` 항목 뒤(다음 `## admin-ui 와 맞물리기` 앞)에 `### 확장 범위(관리자 밖 주체)` 절을 넣는다. 내용(스펙 §10-1 ~ §10-3 을 쓰는 쪽 말로):

````markdown
### 확장 범위(관리자 밖 주체)

장치 토큰 · 외부 API 키처럼 **관리자가 아닌 주체**의 IP 를 같은 규칙 표 · 같은 화면으로 제한한다(첫 소비자 — 출고 관리 서비스의 출고 토큰). 범위 이름은 쓰는 쪽이 정하고, 대상(토큰 표)은 훅으로만 들어온다.

```ts
ipAccess: {
  extraScopes: [
    {
      type: 'shippingToken', // 영소문자로 시작하는 영숫자 1~16자 · global · team · user 와 다름(대소문자 무시)
      wholeScope: true, // 기본 true — scopeRefNo NULL(범위 전체) 규칙을 받는다
      target: {
        // 🔴 메서드 꼴로 적는다 — Transaction<Database> 로 적어도 들어간다
        async lock(trx: Transaction<Database>, refNo: bigint) {
          const row = await trx.selectFrom('shippingTokens').select('tokenNo')
            .where('tokenNo', '=', refNo).forUpdate().executeTakeFirst()
          return row !== undefined
        },
        async names(db: Kysely<Database>, refNos: readonly bigint[]) {
          const rows = await db.selectFrom('shippingTokens').select(['tokenNo', 'tokenName'])
            .where('tokenNo', 'in', refNos).execute()
          return new Map(rows.map((row) => [row.tokenNo, row.tokenName]))
        },
      },
    },
  ],
},
```

- **기동 검사**: 이름 규칙 밖 · 코어 이름과 겹침 · 범위끼리 겹침 · `wholeScope` 가 boolean 아님 · 훅 없음 · 모르는 키(`permissions` 포함)는 멈춘다. 새 장이 없다 — 스텁을 더하지 않는다.
- **권한**: 슬롯 그대로 — 목록 `ipAccess.read`, 쓰기 `ipAccess.manage`(전권 전용). 범위별 권한 키는 없다.
- **라우트**: 위 다섯 라우트가 그대로 받는다. 목록 행의 `scopeName` 은 `names()` 가 준 이름(범위마다 한 번 · 없는 번호는 `null`). 만들기 · 수정은 대상이 없으면(`lock()` 이 false) 400 `issues[scopeRefNo]`. 🔴 확장 규칙의 범위 종류는 바꿀 수 없다(코어로 · 다른 확장 범위로 400 `issues[scopeType]` — 지우고 새로 만든다). `wholeScope: false` 면 범위 전체 규칙은 400. 미리보기는 코어만이다(확장 `scopeType` 400 · 확장 규칙 번호 404).
- **두 층 판정**: 그 범위 행만 본다 → 그 대상의 규칙이 하나라도 있으면 그것만 → 없으면 범위 전체 규칙 → 둘 다 없으면 거부. 주소 `null` 은 거부. 🔴 대상 규칙 한 줄이 범위 전체 허용을 그 대상에 대해 지운다.
- **분리 보장**: 확장 규칙은 관리자 로그인 · 매 요청 · 갱신 판정, 전권자 잔존, 자기 잠금, 미리보기에 쓰이지 않는다(관리자 판정은 코어 행만 읽는다). 반대로 코어 규칙(장 0012 의 전체 허용 시드 포함)은 확장 판정에 쓰이지 않는다 — 확장 규칙이 없으면 그 주체는 어디서도 거부다. 확장 쓰기는 잔존 가드 · 자기 잠금 검사를 지나지 않는다(재인증 · `revision` · 감사는 같다).
- **쓰는 쪽 판정**: `AdminIpExtraScopeService`(전역).

  ```ts
  @Injectable()
  export class ShippingIpGuard implements CanActivate {
    constructor(private readonly ip: AdminIpExtraScopeService) {}
    async canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<Request>()
      if (!(await this.ip.allows('shippingToken', tokenNoOf(req), this.ip.clientIpOf(req)))) {
        throw new BusinessError(/* 쓰는 쪽 코드 */)
      }
      return true
    }
  }
  ```

  `allows(type, refNo, clientIp)` · `rulesOf(type)` · `countRulesOf(type, refNo, trx?)` · `clientIpOf(req)`(관리자와 같은 출처). 등록되지 않은 이름은 던진다. 판정 함수만 쓰려면 admin-shared `evaluateScopedIpAccess`.

- 🔴 **잠금 순서**: 킷은 규칙 행 → 대상 행이다. 쓰는 쪽은 자기 트랜잭션에서 `ip_access_rules` 행을 잠그지 않는다. 대상을 지우기 전 규칙 수는 대상 행을 `FOR UPDATE` 로 잠근 뒤 `countRulesOf(…, trx)` 로 센다.
- **옵션에서 범위를 지우면**: 남은 행은 목록에 보이고 삭제만 된다(수정 400 · 판정에 쓰이지 않음).
````

라우트 표의 `GET /admin/ip-access` 행 설명 끝에 `· 확장 범위 행(대상 이름은 훅)` 을 더한다.

- [ ] **Step 2: admin-ui README** — 진입점 표(177행)의 IP 행 이름 목록에 `IpExtraScopeOption` · `IpTargetOption` · `IpRuleFocus` · `IpRulePrefill` · `IpExtraTargetView` 를 더한다. 「IP 접근 제어」 의 `- **팀 없는 앱**` 항목 뒤에 더한다:

````markdown
- **확장 범위**(서버 `ipAccess.extraScopes` 와 같은 이름 — 한 상수에서): 범위 칸에 「출고 토큰」(대상 하나 — 쓰는 쪽 검색 칸)과 「모든 출고 USB」(범위 전체 — `wholeLabel` 을 줄 때만)이 붙는다. 확장 규칙에는 미리보기를 부르지 않고 「관리자 접속과 무관」 으로 보인다. 확장 규칙을 고칠 때는 그 범위 안에서만 바꿀 수 있다. 화면이 모르는 범위의 행은 삭제만 된다.

  ```ts
  const shippingScope: IpExtraScopeOption = {
    type: SHIPPING_TOKEN_SCOPE,
    label: '출고 토큰',
    wholeLabel: '모든 출고 USB',
    search: (keyword) => api.get('/shipping/tokens/search', { params: { keyword } }), // → { refNo, name }[]
    canSearch: () => can(P.SHIPPING_TOKENS_READ), // 거짓이면 번호 칸
  }
  const ip = useIpAccessRules({ ...ipAccessApi, canManage, extraScopes: [shippingScope] })
  ```

- **한 범위 모드**(`focus`): 토큰 상세처럼 한 대상의 규칙만 보일 때 `focus: { scopeType: SHIPPING_TOKEN_SCOPE, scopeRefNo: token.tokenNo }` — 그 대상 + 범위 전체 규칙만, 선택지는 그 범위 둘, 대상 칸은 고정, 접속 상태 카드는 없다. 값이라 대상이 바뀌면 `:key` 로 다시 만든다(`scopeRefNo` 를 빼면 그 범위 전부).
- **다른 화면에서 만들기**(`openCreate(prefill)`): 「출고 시도」 의 [이 IP 허용]처럼 미리 채운 편집 패널을 연다 — 같은 화면에 그 composable 의 `<IpAccessManager v-bind="…" />` 가 있어야 한다(대화상자 · 옆 패널 배치는 쓰는 쪽). 미리 채운 값은 고친 값이다. 고를 수 없는 선택지 · 권한 없음이면 `false`.

  ```ts
  await tokenIp.openCreate({
    scopeType: SHIPPING_TOKEN_SCOPE,
    scopeRefNo: attempt.tokenNo, // null = 모든 출고 USB
    scopeName: attempt.tokenName,
    cidr: `${attempt.ip}/32`,
    description: '출고 시도에서 허용',
  })
  ```
````

- [ ] **Step 3: CLAUDE.md** — admin-server 규약의 `- IP 쓰기(만들기 · 수정 · 삭제)는 \`withSuperAdminSurvival(trx, { lock, write }, { ipAware: true })\` 안이다 — …`줄의 첫머리를`- **코어 범위**(global · team · user) IP 쓰기(만들기 · 수정 · 삭제)는 …` 로 바꾸고(나머지 문장 그대로), 그 줄 바로 뒤에 더한다:

```markdown
- 확장 범위(`ipAccess.extraScopes` — 관리자 밖 주체) 쓰기는 잔존 · 가드 행 · 자기 잠금 밖이다 — 대상 규칙 행 `FOR UPDATE` → 쓰는 쪽 `target.lock(trx, refNo)`(메서드 꼴 훅) 순이고, 수정 · 삭제는 트랜잭션 밖 비잠금 한 줄로 갈래를 고른다. 범위 종류는 갈래(코어 · 그 확장 범위)를 넘어 바꾸지 않는다(400 `issues[scopeType]`). 🔴 관리자 판정이 읽는 규칙은 코어 셋뿐(`ipRuleSetQuery` · 미리보기 `identifiedRulesQuery`)이고 확장 판정은 admin-shared `evaluateScopedIpAccess` 하나(코어 행을 보지 않는다 — R3 양방향). 쓰는 쪽 판정은 `AdminIpExtraScopeService`, 쓰는 쪽은 `ipAccessRules` 를 잠그지 않는다. 범위별 권한 키는 없다(코어 슬롯).
```

admin-ui 규약 끝에 한 줄:

```markdown
- IP 화면 폼의 `scopeType` 은 범위 **선택지 키**다 — 확장 범위 전체는 `<이름>:*`(`ip-scope-choices.ts` 의 `parseScopeChoice` 하나로 푼다). 확장 규칙은 미리보기를 부르지 않는다(`'unrelated'`). `focus` 는 값이다(게터 아님).
```

진행 표 `Phase 4` 행 위에 행을 더한다:

```markdown
| IP 확장 범위(출고 관리 서비스 요청 — `ipAccess.extraScopes` · 두 층 판정 · R3 분리 · `AdminIpExtraScopeService` · `useIpAccessRules` `extraScopes` · `focus` · `openCreate(prefill)` · R7 없음) | 완료 | 스펙 `docs/superpowers/specs/2026-11-21-admin-kit-ip-extra-scopes-design.md` · 플랜 `docs/superpowers/plans/2026-11-21-admin-kit-ip-extra-scopes.md` · 검증 `docs/verification/2026-11-21-admin-kit-ip-extra-scopes.md` |
```

`packages` 표의 admin-server 설명 괄호 끝 `· 2h 이미지 업로드` 뒤에 ` · IP 확장 범위` 를 더한다.

- [ ] **Step 4: HANDOFF · phase0** — `docs/HANDOFF.md` 머리를 `# HANDOFF — 2026-11-21` 로 바꾸고, 「지금 상태」 표의 `@ssworks/admin-server` 행 끝에 `**IP 확장 범위**(출고 관리 서비스 요청 — 브랜치 \`feat/ip-extra-scopes\`, 0.15.0 예정 · **push · PR 은 사람**)`을, 「다음 플랜」 행 첫머리에`**IP 확장 범위 뒤**: 사람이 브랜치 push → PR → CI → \`main\` 병합 → Version Packages PR(0.15.0 ×3) 병합 → \`pnpm stage approve\` ×3 → 태그. 그다음 출고 관리 서비스(\`ssworks-atlas-launcher-admin\`)가 공개 하루 뒤 설치해 스펙 §10 「소비자 인계」 를 반영한다.`를 더한다.`docs/01-phase0.md` §8 표에 CLAUDE.md 와 같은 행을 더한다(표 모양을 따른다).

- [ ] **Step 5: peer 하한 · changeset**

`packages/admin-server/package.json` · `packages/admin-ui/package.json` 의 peer `"@ssworks/admin-shared": "workspace:>=0.11.0 <1.0.0"` 를 `"workspace:>=0.15.0 <1.0.0"` 으로 바꾼다(`devDependencies` 의 `workspace:*` 는 그대로).

`.changeset/ip-extra-scopes.md`(새):

```markdown
---
'@ssworks/admin-shared': minor
'@ssworks/admin-server': minor
'@ssworks/admin-ui': minor
---

IP 접근 제어에 확장 범위(관리자 밖 주체 — 장치 토큰 · 외부 API 키)를 더한다.

- admin-shared: `evaluateScopedIpAccess`(두 층 판정 — 대상 → 범위 전체 → 거부) · `isIpExtraScopeTypeName` · `isCoreIpScopeType` · `ipRuleScopeTypeSchema`. 규칙 응답 · 본문 스키마의 `scopeType` 이 확장 이름을 받는다(`AdminIpRule['scopeType']` 은 `string`).
- admin-server: 코어 옵션 `ipAccess.extraScopes`(`type` · `wholeScope` · `target.lock` · `target.names`), `AdminIpExtraScopeService`(`allows` · `rulesOf` · `countRulesOf` · `clientIpOf`). 확장 규칙은 관리자 판정 · 잔존 · 자기 잠금 · 미리보기에 쓰이지 않고, 코어 규칙은 확장 판정에 쓰이지 않는다. 모르는 `scopeType` 의 400 칸 문구가 「등록되지 않은 범위입니다.」 로 바뀐다(상태 · 코드 · 칸은 그대로).
- admin-ui: `useIpAccessRules` 의 `extraScopes` · `focus` · `openCreate(prefill)`, 타입 `IpExtraScopeOption` · `IpTargetOption` · `IpRuleFocus` · `IpRulePrefill` · `IpExtraTargetView`, 미리보기 상태 `'unrelated'`.
- peer: admin-server · admin-ui 의 `@ssworks/admin-shared` 하한 `>=0.15.0` — 세 패키지를 함께 올린다.

소비자: 확장 범위를 쓰지 않으면 고칠 것이 없다(새 장 없음). 쓰려면 서버 옵션 `ipAccess.extraScopes` · 화면 옵션 `extraScopes` 를 한 상수에서 만들고, 쓰는 쪽 가드에서 `AdminIpExtraScopeService.allows` 를 부른다(admin-server README 「확장 범위」).
```

- [ ] **Step 6: 형식 · 검사**

Run: `pnpm format && pnpm lint && pnpm changeset status`
Expected: lint 초록 · changeset status 가 세 패키지 minor(0.15.0) · major 없음.

- [ ] **Step 7: 커밋**

```bash
git add -A packages/admin-server/README.md packages/admin-ui/README.md CLAUDE.md docs/HANDOFF.md docs/01-phase0.md packages/admin-server/package.json packages/admin-ui/package.json .changeset/ip-extra-scopes.md
git commit -m "$(cat <<'EOF'
docs: IP 확장 범위 README · CLAUDE.md 불변식 · HANDOFF · changeset(minor) · peer 하한 0.15.0

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

(`pnpm format` 이 다른 파일을 바꿨으면 `git status` 로 보고 이 Task 의 파일만 싣는다. `pnpm-lock.yaml` 이 peer 하한 때문에 바뀌었으면 함께 싣는다.)

---

### Task 11: 검증 · 기록 (모델: `sonnet`)

**Files:**

- Create: `docs/verification/2026-11-21-admin-kit-ip-extra-scopes.md`

- [ ] **Step 1: 전체 검사**

Run: `pnpm check`
Expected: lint → typecheck → test → build → check:dts 모두 초록. 실패하면 원인 Task 의 코드를 고치고(시험을 약하게 바꾸지 않는다) 따로 커밋한다.

- [ ] **Step 2: 실 MariaDB 두 버전**

Run(11.4): `pnpm db:test:up` (이미 떠 있으면 건너뛴다) → `pnpm test:db`
Run(12.3): `pnpm db:test:up:12.3` → bash 에서 `ADMIN_TEST_DB_URL=mariadb://root:admin-kit-test@127.0.0.1:33307 pnpm test:db`
Expected: 두 버전 모두 초록. 통과 수를 적어 둔다.

- [ ] **Step 3: 서버 스모크(패킹 tarball)** — 작업 폴더는 스크래치(`%TEMP%` 아래 새 폴더 `aksx`). 저장소 안에 만들지 않는다.

1. `pnpm --filter @ssworks/admin-shared pack --pack-destination <aksx>` · `pnpm --filter @ssworks/admin-server pack --pack-destination <aksx>`.
2. `<aksx>` 에 `package.json`(`"type": "module"`) · `tsconfig.json`(`"strict": true`, `"skipLibCheck": false`, `"module": "NodeNext"`, `"experimentalDecorators": true`, `"emitDecoratorMetadata": true`)을 두고 두 tarball 과 peer(`@nestjs/common` · `@nestjs/core` · `@nestjs/platform-express` · `kysely` · `zod` · `@types/express` · `typescript`)를 설치한다(HANDOFF 의 이전 스모크 `$TEMP/akss` 와 같은 꼴).
3. `src/check.ts` — 스펙 §10-1 의 서버 옵션(`interface Database extends AdminDatabase` · `Transaction<Database>` 훅)과 `ShippingIpGuard`(가드) 예시를 그대로 적는다.
4. `npx tsc --noEmit` → 오류 0 을 확인한다.

- [ ] **Step 4: 화면 스모크** — `/smoke` 스킬(`.claude/commands/smoke`)을 따른다. 소비 앱 `src` 에 `useIpAccessRules({ …, extraScopes: [{ type: 'shippingToken', label: '출고 토큰', wholeLabel: '모든 출고 USB' }], focus: { scopeType: 'shippingToken', scopeRefNo: 1n } })` · `openCreate({ scopeType: 'shippingToken', scopeRefNo: 1n, cidr: '203.0.113.7/32' })` 를 쓰는 컴포넌트 하나를 더해 `vue-tsc` · `vite build` 가 통과하는지 본다.

- [ ] **Step 5: 검증 기록** — `docs/verification/2026-11-21-admin-kit-ip-extra-scopes.md`(새). 앞 검증 기록(`docs/verification/2026-11-11-admin-ui-image-attachments.md`)의 모양을 따라 적는다:

```markdown
# 검증 — IP 접근 제어 확장 범위 (2026-11-21)

스펙 `docs/superpowers/specs/2026-11-21-admin-kit-ip-extra-scopes-design.md` · 플랜 `docs/superpowers/plans/2026-11-21-admin-kit-ip-extra-scopes.md` · 브랜치 `feat/ip-extra-scopes`.

## 1. 전체 검사

- `pnpm check` — (결과 · 워크스페이스 시험 수)

## 2. 실 MariaDB

- 11.4 — (통과 수)
- 12.3 — (통과 수)

## 3. 스모크

- 서버 tarball — skipLibCheck: false tsc (오류 수) · 훅 Transaction<Database> 이변성 확인
- 화면 /smoke — vue-tsc · vite build (결과)

## 4. 요구 대조(요청 문서 R1 ~ R9)

| 요구 | 결과 | 근거(시험 · 파일) |
| R1 … | … | … |

## 5. 넘긴 것

- (없으면 "없음")
```

괄호 자리는 실제 출력으로 채운다(지어내지 않는다). §4 표는 R1 ~ R9 아홉 행 — R7 은 「하지 않음(사용자 결정)」.

- [ ] **Step 6: 커밋**

```bash
git add docs/verification/2026-11-21-admin-kit-ip-extra-scopes.md
git commit -m "$(cat <<'EOF'
docs: IP 확장 범위 검증 기록 — pnpm check · test:db 11.4 · 12.3 · 서버 · 화면 스모크

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## 마치며 (컨트롤러 몫 — Task 가 아니다)

- 모든 Task 뒤 **브랜치 전체 최종 리뷰는 `opus`** 서브에이전트(`superpowers:code-reviewer`)로 — 스펙 X1 ~ X12 · R3 분리 · 코어 경로의 무변화(잔존 · 자기 잠금 · 순서)를 본다.
- 리뷰 반영 뒤 스펙 §10 「소비자 인계」 가 실제 구현과 같은지 대조한다(이름 · 옵션 모양 · 판 · 하지 않은 것). 다르면 스펙을 고친다.
- push · PR · 발행 · `pnpm stage approve` 는 사람이 한다.
