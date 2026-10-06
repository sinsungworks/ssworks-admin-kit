# admin-ui 세션 · 비밀번호 (PR #3c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin-shared 에 세션 스키마 · `describeUserAgent` · 비밀번호 정책을, admin-ui 에 `SessionTable` · `useSessions` · `copyText` · `TemporaryPasswordDialog` · `PasswordChangeForm` 과 `AdminUserInfo.isPasswordChangeRequired?` 를 넣는다.

**Architecture:** 계약(스키마 · 기기 문구 · 정책)은 admin-shared 의 순수 코드다. `SessionTable` 은 킷 `DataTableBody` 위의 표시 컴포넌트이고, `useSessions` 가 목록 조회(전량 또는 `useServerTable`)와 세 가지 끊기 동작을 `useWriteFlow` 확인 관문으로 감싸 `v-bind` 용 바인딩을 낸다. 비밀번호 쪽은 값 소유를 구조로 강제하는 다이얼로그(`v-model` = 값)와, 정책 객체로 검증하고 제출 함수를 받는 폼이다.

**Tech Stack:** Vue 3.5 · Vuetify 4 · zod 4.6 · vitest 4 + happy-dom · @vue/test-utils · pnpm 12

**Spec:** `docs/superpowers/specs/2026-10-06-admin-ui-sessions-passwords-design.md`

## Global Constraints

- 새 의존 없음. admin-ui 소스가 import 하는 외부 패키지는 `vue` · `vue-router` · `vuetify` · `pinia` · `@ssworks/admin-shared` · `axios` 뿐(`peer-deps.test.ts`). admin-shared 는 `zod` 만.
- `import type` 을 분리한다(eslint `consistent-type-imports`). 내부 상대 import 는 `.js` 확장자. `.vue` 는 그대로.
- SFC 는 Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import 한다. 스타일은 `<style scoped>` 순수 CSS.
- `console.log` 금지 — `console.warn` · `console.error` 만.
- 정본에서 가져온 파일은 머리 주석에 `정본: <프로젝트> <경로>` 와 `바꾼 점:` 을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 반환 형태는 ref 묶음 · `ComputedRef` 바인딩이다. `reactive()` 로 감싸 돌려주지 않는다.
- `v-model` 은 기본 `modelValue` 하나. 예외는 표의 `page` · `itemsPerPage`(복수 모델 예외 규약).
- `:loading` 은 클릭을 안 막는다 — 제출 · 동작 버튼은 늘 `:disabled` 와 한 벌.
- Boolean prop 에 `undefined` 기본값을 주지 않는다.
- 테스트: DOM 이 필요한 파일 머리에 `// @vitest-environment happy-dom`. VDialog 를 여는 테스트는 모듈 최상단에서 `installVisualViewport()`. `data-testid` 를 심지 않는다 — 글자 · `name` · `aria-label` 로 찾는다.
- admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 돌려야 admin-ui 에 보인다.
- 🔴 파일을 python · sed 같은 스크립트로 다시 쓰지 않는다(개행이 뒤집힌다). Edit/Write 도구만.
- 포맷: prettier(세미콜론 없음 · 작은따옴표 · 100자). 커밋 전 `pnpm exec prettier --write <파일들>`.
- Windows 에서도 돈다 — `/dev/null` 금지.
- 커밋 메시지: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`.
- 테스트 실행은 저장소 루트에서 `pnpm exec vitest run <경로>`.
- 문구는 스펙 §4 의 한국어 문구를 글자 그대로 쓴다.

## Review Focus

- **현재 세션 행을 바인딩으로 직접 끊으려는 호출** — 표가 버튼을 안 그려도 `table.onRevoke(currentRow)` 는 요청 없이 무시돼야 한다 → Task 5 테스트.
- **내 계정 전체 끊기 성공 뒤의 재조회** — 서버가 지금 세션까지 끊어 401 이 된다. 재조회하지 않고 `onSelfSignedOut` 만 불러야 한다 → Task 5 테스트.
- **복사 API 가 없는 사내 http 주소** — "복사했습니다" 를 내면 안 된다 → Task 3 · Task 6 테스트.
- **임시 비밀번호 다이얼로그를 닫은 뒤** — 값이 DOM 에 남으면 안 된다 → Task 6 테스트.
- **비밀번호 변경에서 Enter 두 번** — `submit` 은 한 번만 → Task 7 테스트.
- **iOS Safari UA 의 "like Mac OS X"** — macOS 로 오판하면 안 된다 → Task 1 테스트.

---

### Task 1: admin-shared 세션 스키마 · `describeUserAgent`

**Files:**

- Create: `packages/admin-shared/src/sessions.ts`, `packages/admin-shared/src/sessions.test.ts`
- Create: `packages/admin-shared/src/user-agent.ts`, `packages/admin-shared/src/user-agent.test.ts`
- Modify: `packages/admin-shared/src/index.ts` (끝에 export 블록 둘)

**Interfaces:**

- Produces: `adminSessionSchema` · `adminSessionListItemSchema` · `adminSessionRevokeResultSchema`, 타입 `AdminSession = { sessionNo: bigint; userAgent: string | null; ipAddress: string | null; loginAt: string; lastAccessAt: string; expireAt: string; isCurrent: boolean }` · `AdminSessionListItem`(+ `userNo: bigint; userId: string; userName: string`) · `AdminSessionRevokeResult = { revokedCount: number }`. `describeUserAgent(userAgent: string | null | undefined): string`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-shared/src/sessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  adminSessionListItemSchema,
  adminSessionRevokeResultSchema,
  adminSessionSchema,
} from './sessions.js'

const SESSION = {
  sessionNo: 1n,
  userAgent: 'Mozilla/5.0',
  ipAddress: '10.0.0.1',
  loginAt: '2026-10-05T00:00:00.000Z',
  lastAccessAt: '2026-10-05T01:00:00.000Z',
  expireAt: '2026-10-12T01:00:00.000Z',
  isCurrent: false,
}

describe('adminSessionSchema', () => {
  it('세션 행을 받는다', () => {
    expect(adminSessionSchema.parse(SESSION)).toEqual(SESSION)
  })

  it('🔴 isCurrent 는 필수다 — 현재 세션을 목록에서 끊지 못하게 막는 근거다', () => {
    const { isCurrent: _isCurrent, ...withoutCurrent } = SESSION
    expect(adminSessionSchema.safeParse(withoutCurrent).success).toBe(false)
  })

  it('userAgent · ipAddress 는 null 을 허용하고 문자열이 아닌 값은 거부한다', () => {
    expect(
      adminSessionSchema.safeParse({ ...SESSION, userAgent: null, ipAddress: null }).success,
    ).toBe(true)
    expect(adminSessionSchema.safeParse({ ...SESSION, userAgent: 1 }).success).toBe(false)
  })

  it('🔴 시각은 ISO UTC 문자열(Z)만 받는다 — 와이어에서 날짜는 문자열이다', () => {
    expect(
      adminSessionSchema.safeParse({ ...SESSION, loginAt: '2026-10-05 00:00:00' }).success,
    ).toBe(false)
    expect(adminSessionSchema.safeParse({ ...SESSION, loginAt: new Date() }).success).toBe(false)
  })

  it('sessionNo 는 bigint 다', () => {
    expect(adminSessionSchema.safeParse({ ...SESSION, sessionNo: 1 }).success).toBe(false)
  })
})

describe('adminSessionListItemSchema · adminSessionRevokeResultSchema', () => {
  it('목록 행은 사용자 필드가 더 붙는다', () => {
    const item = { ...SESSION, userNo: 7n, userId: 'kim', userName: '김' }
    expect(adminSessionListItemSchema.parse(item)).toEqual(item)
    expect(adminSessionListItemSchema.safeParse(SESSION).success).toBe(false)
  })

  it('끊기 결과는 0 이상 정수 개수다', () => {
    expect(adminSessionRevokeResultSchema.parse({ revokedCount: 3 })).toEqual({ revokedCount: 3 })
    expect(adminSessionRevokeResultSchema.safeParse({ revokedCount: -1 }).success).toBe(false)
    expect(adminSessionRevokeResultSchema.safeParse({ revokedCount: 1.5 }).success).toBe(false)
  })
})
```

`packages/admin-shared/src/user-agent.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { describeUserAgent } from './user-agent.js'

// 정본: ssworks-gise-home apps/admin/test/user-agent.test.ts 의 표 기반 방식.

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  whaleWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Whale/3.27.254.15 Safari/537.36',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  edgeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  firefoxIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15',
  edgeIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/129.0.2792.84 Version/17.0 Mobile/15E148 Safari/604.1',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
}

describe('describeUserAgent', () => {
  it.each([
    ['Chrome Windows', UA.chromeWindows, 'Chrome · Windows'],
    ['🔴 Edge 원문에는 Chrome/ 이 들어 있다 — Edge 가 먼저', UA.edgeWindows, 'Edge · Windows'],
    ['Whale', UA.whaleWindows, 'Whale · Windows'],
    ['Samsung Internet', UA.samsungAndroid, 'Samsung Internet · Android'],
    ['Edge Android', UA.edgeAndroid, 'Edge · Android'],
    ['Safari macOS', UA.safariMac, 'Safari · macOS'],
    ['🔴 iOS 원문의 like Mac OS X 를 macOS 로 읽지 않는다', UA.safariIphone, 'Safari · iOS'],
    ['iOS Chrome(CriOS)', UA.chromeIphone, 'Chrome · iOS'],
    ['iOS Firefox(FxiOS)', UA.firefoxIphone, 'Firefox · iOS'],
    ['iPad Edge(EdgiOS)', UA.edgeIpad, 'Edge · iOS'],
    ['Firefox Linux', UA.firefoxLinux, 'Firefox · Linux'],
    ['ChromeOS', UA.chromeOs, 'Chrome · ChromeOS'],
  ])('%s', (_title, ua, expected) => {
    expect(describeUserAgent(ua)).toBe(expected)
  })

  it('하나만 알면 그것만, 둘 다 모르면 "알 수 없는 기기"', () => {
    expect(describeUserAgent('Firefox/130.0')).toBe('Firefox')
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) SomeBot/1.0')).toBe('Windows')
    expect(describeUserAgent('curl/8.4.0')).toBe('알 수 없는 기기')
  })

  it('원문이 없거나 공백뿐이면 "기기 정보 없음"', () => {
    expect(describeUserAgent(null)).toBe('기기 정보 없음')
    expect(describeUserAgent(undefined)).toBe('기기 정보 없음')
    expect(describeUserAgent('   ')).toBe('기기 정보 없음')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-shared/src/sessions.test.ts packages/admin-shared/src/user-agent.test.ts`
Expected: FAIL — `Failed to resolve import "./sessions.js"` / `"./user-agent.js"`

- [ ] **Step 3: 구현**

`packages/admin-shared/src/sessions.ts`:

```ts
import { z } from 'zod'

// 세션 코어 계약 — Phase 2 서버와 admin-ui `SessionTable` · `useSessions` 가 같은 모양을 본다.
//
// 정본: hangang-home apps/api/src/modules/sessions(컬럼 · 라우트) + kim5257-crm-v5
//       packages/shared/src/schemas/session.schema.ts(관리자 목록 행)
// 바꾼 점:
//  - 필드명은 hangang 컬럼(`loginAt` · `lastAccessAt`)을 따른다. gise 의 `lastActiveAt` 은 실제로는 행 생성
//    시각이라 뜻이 다르다. 원문은 `userAgent` — 화면이 `describeUserAgent()` 로 해석한다(crm 의 서버 해석
//    `device{}` 를 버렸다).
//  - crm 고유의 `source`(web · API 키) · `apiKeyName` 은 넣지 않는다 — 프로젝트가 `.extend()` 로 더한다.
//  - 🔴 `.refine()` 을 걸지 않는다(3b §11 R1) — 소비자의 `.extend()` · `.omit()` 을 막지 않는다.
//
// 🔴 시각은 와이어에서 ISO UTC 문자열(`Z`)이다. 킷 JSON 코덱은 `"BigInt(n)"` 만 되살리고 날짜는 문자열로 둔다.

export const adminSessionSchema = z.object({
  sessionNo: z.bigint(),
  /** 브라우저 원문. 화면이 `describeUserAgent()` 로 해석한다. 없으면 null */
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  loginAt: z.iso.datetime(),
  lastAccessAt: z.iso.datetime(),
  expireAt: z.iso.datetime(),
  /** 🔴 요청한 사람이 지금 쓰는 세션인가 — 목록에서 끊지 못하게 막는 근거다(3c 스펙 D4) */
  isCurrent: z.boolean(),
})

/** 관리자 전체 목록 행 — 누구의 세션인지가 더 붙는다 */
export const adminSessionListItemSchema = adminSessionSchema.extend({
  userNo: z.bigint(),
  userId: z.string(),
  userName: z.string(),
})

/** "다른 세션 모두" · "사용자 전체" 의 응답. 화면은 이 개수가 있을 때만 개수를 말한다 */
export const adminSessionRevokeResultSchema = z.object({ revokedCount: z.number().int().min(0) })

export type AdminSession = z.infer<typeof adminSessionSchema>
export type AdminSessionListItem = z.infer<typeof adminSessionListItemSchema>
export type AdminSessionRevokeResult = z.infer<typeof adminSessionRevokeResultSchema>
```

`packages/admin-shared/src/user-agent.ts`:

```ts
// 브라우저 원문(User-Agent) → "Chrome · Windows".
//
// 정본: ssworks-gise-home apps/admin/src/utils/user-agent.ts
// 바꾼 점: admin-shared 로 옮겼다 — 프레임워크 무관한 순수 함수라 Phase 2 서버가 감사 로그에 같은 문구를 쓸 수
//          있다. 입력에 `undefined` 를 더 받는다.
//
// 🔴 표의 순서가 규칙이다. 앞에서부터 처음 맞는 것을 쓴다.
//    - Edge · Whale · Samsung Internet 원문에는 `Chrome/` 이 들어 있고, Chrome 원문에는 `Safari/` 가 들어 있다.
//    - iOS 원문에는 `like Mac OS X` 가 들어 있다 — iOS 를 macOS 보다 먼저 본다.
//    - Android 원문에는 `Linux` 가 들어 있다 — Android 를 Linux 보다 먼저 본다.

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bWhale\//, 'Whale'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
]

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\bCrOS\b/, 'ChromeOS'],
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\b(?:Mac OS X|Macintosh)\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

function firstMatch(table: readonly (readonly [RegExp, string])[], text: string): string | null {
  for (const [pattern, name] of table) {
    if (pattern.test(text)) return name
  }
  return null
}

export function describeUserAgent(userAgent: string | null | undefined): string {
  const text = userAgent?.trim() ?? ''
  if (text === '') return '기기 정보 없음'
  const browser = firstMatch(BROWSERS, text)
  const system = firstMatch(SYSTEMS, text)
  if (browser != null && system != null) return `${browser} · ${system}`
  return browser ?? system ?? '알 수 없는 기기'
}
```

`packages/admin-shared/src/index.ts` 끝(`roles.js` export 블록 뒤)에 추가:

```ts
export {
  adminSessionSchema,
  adminSessionListItemSchema,
  adminSessionRevokeResultSchema,
  type AdminSession,
  type AdminSessionListItem,
  type AdminSessionRevokeResult,
} from './sessions.js'

export { describeUserAgent } from './user-agent.js'
```

- [ ] **Step 4: 통과 확인 · 빌드**

Run: `pnpm exec vitest run packages/admin-shared/src/sessions.test.ts packages/admin-shared/src/user-agent.test.ts`
Expected: PASS (sessions 7, user-agent 14)

Run: `pnpm --filter @ssworks/admin-shared typecheck && pnpm --filter @ssworks/admin-shared build && pnpm lint`
Expected: 오류 없음. `dist/sessions.d.ts` · `dist/user-agent.d.ts` 가 생긴다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/sessions.ts packages/admin-shared/src/sessions.test.ts packages/admin-shared/src/user-agent.ts packages/admin-shared/src/user-agent.test.ts packages/admin-shared/src/index.ts
git add packages/admin-shared/src/sessions.ts packages/admin-shared/src/sessions.test.ts packages/admin-shared/src/user-agent.ts packages/admin-shared/src/user-agent.test.ts packages/admin-shared/src/index.ts
git commit -m "feat(admin-shared): 세션 코어 스키마 · describeUserAgent

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: admin-shared 비밀번호 정책

**Files:**

- Create: `packages/admin-shared/src/passwords.ts`, `packages/admin-shared/src/passwords.test.ts`
- Modify: `packages/admin-shared/src/index.ts`

**Interfaces:**

- Produces: `definePasswordPolicy(options?: { minLength?: number; maxLength?: number }): PasswordPolicy` — `PasswordPolicy = { readonly minLength; readonly maxLength; readonly lengthMessage: string; readonly sameAsCurrentMessage: string; readonly passwordSchema: z.ZodString; readonly changePasswordSchema: z.ZodType<{ currentPassword: string; newPassword: string }> }`. `adminTemporaryPasswordSchema`, 타입 `AdminTemporaryPassword = { temporaryPassword: string }`, `PasswordPolicyOptions`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-shared/src/passwords.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adminTemporaryPasswordSchema, definePasswordPolicy } from './passwords.js'

describe('definePasswordPolicy', () => {
  it('기본은 8자 이상 200자 이하다(3c 결정 ⑧-L2)', () => {
    const policy = definePasswordPolicy()
    expect(policy.minLength).toBe(8)
    expect(policy.maxLength).toBe(200)
    expect(policy.lengthMessage).toBe('비밀번호는 8자 이상 200자 이하로 정하세요.')
    expect(policy.sameAsCurrentMessage).toBe('새 비밀번호가 현재 비밀번호와 같습니다.')
  })

  it('프로젝트가 숫자를 바꾸면 문구도 따라간다', () => {
    const policy = definePasswordPolicy({ minLength: 12, maxLength: 64 })
    expect(policy.lengthMessage).toBe('비밀번호는 12자 이상 64자 이하로 정하세요.')
  })

  it('잘못된 정책은 정의할 때 던진다 — 설정 실수를 첫 실행에서 드러낸다', () => {
    expect(() => definePasswordPolicy({ minLength: 0 })).toThrow('minLength')
    expect(() => definePasswordPolicy({ minLength: 1.5 })).toThrow('minLength')
    expect(() => definePasswordPolicy({ minLength: 10, maxLength: 9 })).toThrow('maxLength')
  })

  it('passwordSchema 는 길이 경계를 지키고 위반이면 정책 문구를 낸다', () => {
    const { passwordSchema, lengthMessage } = definePasswordPolicy()
    const short = passwordSchema.safeParse('a'.repeat(7))
    expect(short.success).toBe(false)
    expect(short.error?.issues[0]?.message).toBe(lengthMessage)
    expect(passwordSchema.safeParse('a'.repeat(8)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(200)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(201)).success).toBe(false)
  })

  it('🔴 changePasswordSchema — 새 = 현재면 경로 newPassword 의 검증 오류다(3c 결정 ⑦-W1)', () => {
    const { changePasswordSchema, sameAsCurrentMessage } = definePasswordPolicy()
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old-pass-1', newPassword: 'new-pass-1' })
        .success,
    ).toBe(true)
    const same = changePasswordSchema.safeParse({
      currentPassword: 'same-pass-1',
      newPassword: 'same-pass-1',
    })
    expect(same.success).toBe(false)
    expect(same.error?.issues[0]?.path).toEqual(['newPassword'])
    expect(same.error?.issues[0]?.message).toBe(sameAsCurrentMessage)
  })

  it('changePasswordSchema — 현재 비밀번호는 비면 안 되고, 새 비밀번호 길이 위반은 newPassword 경로다', () => {
    const { changePasswordSchema } = definePasswordPolicy()
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'new-pass-1' }).success,
    ).toBe(false)
    const short = changePasswordSchema.safeParse({
      currentPassword: 'old-pass-1',
      newPassword: 'short',
    })
    expect(short.error?.issues[0]?.path).toEqual(['newPassword'])
  })

  it('현재 비밀번호 상한은 정책 최대보다 낮추지 않는다(최소 256) — 정책을 줄여도 옛 긴 비밀번호로 바꿀 수 있다', () => {
    const { changePasswordSchema } = definePasswordPolicy({ minLength: 8, maxLength: 64 })
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'a'.repeat(256),
        newPassword: 'new-pass-1',
      }).success,
    ).toBe(true)
  })
})

describe('adminTemporaryPasswordSchema', () => {
  it('temporaryPassword 하나 — 빈 값은 거부한다', () => {
    expect(adminTemporaryPasswordSchema.parse({ temporaryPassword: 'Ab3dEf7hJk9mNp2q' })).toEqual({
      temporaryPassword: 'Ab3dEf7hJk9mNp2q',
    })
    expect(adminTemporaryPasswordSchema.safeParse({ temporaryPassword: '' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-shared/src/passwords.test.ts`
Expected: FAIL — `Failed to resolve import "./passwords.js"`

- [ ] **Step 3: 구현**

`packages/admin-shared/src/passwords.ts`:

```ts
import { z } from 'zod'

// 비밀번호 정책 — Phase 2 서버의 본문 검증과 admin-ui `PasswordChangeForm` 이 같은 숫자 · 같은 문구를 쓴다.
//
// 정본: ssworks-gise-home packages/shared/src/account(ACCOUNT_LIMITS · ADMIN_PASSWORD_LENGTH_MESSAGE)
// 바꾼 점:
//  - 상수를 팩토리로 — 프로젝트가 숫자를 정한다. 기본은 8자(3c 결정 ⑧-L2, crm · axion · hangang 과 같음).
//  - 🔴 "새 = 현재" 를 본문 스키마의 `newPassword` 경로 오류로 둔다 — 서버가 이 스키마로 검증하면 화면은 필드
//    오류 하나의 경로(3a `toFieldErrors`)로 그 칸 옆에 낸다(3c 결정 ⑦-W1).
//  - `changePasswordSchema` 에는 `.refine()` 이 걸린다. 3b §11 R1 의 "refine 금지" 는 소비자가 `.omit()` 할 코어
//    행 스키마 이야기이고, 이 스키마는 변경 본문 전용이라 덜어 낼 일이 없다.
//  - 복잡도 규칙(대소문자 · 숫자)은 두지 않는다 — 네 프로젝트 모두 없다.

const DEFAULT_MIN_LENGTH = 8
const DEFAULT_MAX_LENGTH = 200
/** 현재 비밀번호 칸의 최소 상한 — 정책을 나중에 줄여도 예전의 긴 비밀번호로 바꾸기를 할 수 있어야 한다 */
const CURRENT_PASSWORD_MAX_FLOOR = 256
const SAME_AS_CURRENT_MESSAGE = '새 비밀번호가 현재 비밀번호와 같습니다.'

export interface PasswordPolicyOptions {
  /** 기본 8 */
  minLength?: number
  /** 기본 200 */
  maxLength?: number
}

export interface PasswordPolicy {
  readonly minLength: number
  readonly maxLength: number
  /** "비밀번호는 8자 이상 200자 이하로 정하세요." */
  readonly lengthMessage: string
  /** "새 비밀번호가 현재 비밀번호와 같습니다." */
  readonly sameAsCurrentMessage: string
  /** 새 비밀번호 · 임시 비밀번호 검증 — 길이 위반이면 `lengthMessage` */
  readonly passwordSchema: z.ZodString
  /** 비밀번호 변경 본문. 새 = 현재면 경로 `newPassword` 의 검증 오류 */
  readonly changePasswordSchema: z.ZodType<{ currentPassword: string; newPassword: string }>
}

export function definePasswordPolicy(options: PasswordPolicyOptions = {}): PasswordPolicy {
  const minLength = options.minLength ?? DEFAULT_MIN_LENGTH
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH
  if (!Number.isInteger(minLength) || minLength < 1) {
    throw new Error(
      `definePasswordPolicy: minLength 는 1 이상 정수여야 한다 (받은 값 ${minLength})`,
    )
  }
  if (!Number.isInteger(maxLength) || maxLength < minLength) {
    throw new Error(
      `definePasswordPolicy: maxLength 는 minLength(${minLength}) 이상 정수여야 한다 (받은 값 ${maxLength})`,
    )
  }
  const lengthMessage = `비밀번호는 ${minLength}자 이상 ${maxLength}자 이하로 정하세요.`
  const passwordSchema = z.string().min(minLength, lengthMessage).max(maxLength, lengthMessage)
  const changePasswordSchema = z
    .object({
      currentPassword: z.string().min(1).max(Math.max(maxLength, CURRENT_PASSWORD_MAX_FLOOR)),
      newPassword: passwordSchema,
    })
    .refine((body) => body.newPassword !== body.currentPassword, {
      path: ['newPassword'],
      message: SAME_AS_CURRENT_MESSAGE,
    })
  return Object.freeze({
    minLength,
    maxLength,
    lengthMessage,
    sameAsCurrentMessage: SAME_AS_CURRENT_MESSAGE,
    passwordSchema,
    changePasswordSchema,
  })
}

/**
 * 비밀번호 초기화 응답(그리고 계정 생성 응답에 함께 실리는 값). 키는 `temporaryPassword`(gise) — 변경 본문의
 * `newPassword` 와 뜻이 겹치지 않게 한다.
 */
export const adminTemporaryPasswordSchema = z.object({ temporaryPassword: z.string().min(1) })

export type AdminTemporaryPassword = z.infer<typeof adminTemporaryPasswordSchema>
```

`packages/admin-shared/src/index.ts` 끝에 추가:

```ts
export {
  definePasswordPolicy,
  adminTemporaryPasswordSchema,
  type PasswordPolicy,
  type PasswordPolicyOptions,
  type AdminTemporaryPassword,
} from './passwords.js'
```

- [ ] **Step 4: 통과 확인 · 빌드**

Run: `pnpm exec vitest run packages/admin-shared/src/passwords.test.ts`
Expected: PASS (8 tests)

Run: `pnpm --filter @ssworks/admin-shared typecheck && pnpm --filter @ssworks/admin-shared build && pnpm lint`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/passwords.ts packages/admin-shared/src/passwords.test.ts packages/admin-shared/src/index.ts
git add packages/admin-shared/src/passwords.ts packages/admin-shared/src/passwords.test.ts packages/admin-shared/src/index.ts
git commit -m "feat(admin-shared): 비밀번호 정책 팩토리 · 임시 비밀번호 응답 스키마

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: admin-ui `AdminUserInfo.isPasswordChangeRequired?` · `copyText`

**Files:**

- Modify: `packages/admin-ui/src/context/admin-ui.ts` (`AdminUserInfo`)
- Modify: `packages/admin-ui/src/context/admin-ui.test.ts` (타입 테스트 하나)
- Create: `packages/admin-ui/src/utils/copy-text.ts`, `packages/admin-ui/src/utils/copy-text.test.ts`
- Modify: `packages/admin-ui/src/index.ts`

**Interfaces:**

- Produces: `AdminUserInfo.isPasswordChangeRequired?: boolean`. `copyText(text: string): Promise<CopyResult>`, `type CopyResult = 'done' | 'failed' | 'unavailable'`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/context/admin-ui.test.ts` 맨 위 import 에 `expectTypeOf` 와 `type AdminUserInfo` 를 더하고(이미 있으면 그대로), 파일 끝에 추가:

```ts
describe('AdminUserInfo', () => {
  it('isPasswordChangeRequired 는 선택 boolean 이다 — createAdminGuard 의 강제 변경 게터에 잇는다', () => {
    expectTypeOf<AdminUserInfo['isPasswordChangeRequired']>().toEqualTypeOf<boolean | undefined>()
  })
})
```

`packages/admin-ui/src/utils/copy-text.test.ts`:

```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copy-text.js'

// 정본: hangang-home apps/admin/src/pages/org/users.render.test.ts 의 복사 3갈래.

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('copyText', () => {
  it("🔴 클립보드 API 가 없으면 'unavailable' — 보안 컨텍스트가 아닌 사내 http 주소", async () => {
    setClipboard(undefined)
    expect(await copyText('Ab3dEf7h')).toBe('unavailable')
  })

  it("writeText 가 없어도 'unavailable'", async () => {
    setClipboard({})
    expect(await copyText('Ab3dEf7h')).toBe('unavailable')
  })

  it("쓰기가 거부되면 'failed' — 던지지 않는다", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) })
    expect(await copyText('Ab3dEf7h')).toBe('failed')
  })

  it("성공하면 'done' — 값을 그대로 쓴다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    expect(await copyText('Ab3dEf7h')).toBe('done')
    expect(writeText).toHaveBeenCalledWith('Ab3dEf7h')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/utils/copy-text.test.ts`
Expected: FAIL — `Failed to resolve import "./copy-text.js"`

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: FAIL — `Property 'isPasswordChangeRequired' does not exist on type 'AdminUserInfo'`(타입 테스트)

- [ ] **Step 3: 구현**

`packages/admin-ui/src/context/admin-ui.ts` 의 `AdminUserInfo` 에 필드 추가(`roleName?: string` 다음 줄):

```ts
  /**
   * 임시 비밀번호로 로그인해 새 비밀번호를 정해야 하는가. `/me` 응답에서 온다.
   * `createAdminGuard({ isPasswordChangeRequired: () => store.userInfo?.isPasswordChangeRequired === true })` 로 잇는다.
   */
  isPasswordChangeRequired?: boolean
```

`packages/admin-ui/src/utils/copy-text.ts`:

```ts
// 클립보드에 글자를 쓴다 — 결과를 세 갈래로 돌려주고 던지지 않는다.
//
// 정본: hangang-home apps/admin/src/pages/org/users.vue(복사 3분기) · users-messages.ts(COPY_*)
// 바꾼 점: 페이지 안 분기를 함수로. 문구는 부르는 쪽(TemporaryPasswordDialog)이 고른다.
//
// 🔴 보안 컨텍스트가 아니면(사내 http 주소) 브라우저가 `navigator.clipboard` 를 아예 주지 않는다. 그때 "복사했습니다"
//    를 내면 관리자는 빈 값을 붙여넣고, 그 시점에는 임시 비밀번호를 다시 볼 수 없다(axion 사고). 성공 문구는
//    `'done'` 일 때만 낸다.
// 🔴 `execCommand('copy')` 대체 경로를 두지 않는다 — 화면에 글자로 찍힌 값이 정본이고, 복사는 편의다.

export type CopyResult = 'done' | 'failed' | 'unavailable'

export async function copyText(text: string): Promise<CopyResult> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (clipboard == null || typeof clipboard.writeText !== 'function') return 'unavailable'
  try {
    await clipboard.writeText(text)
    return 'done'
  } catch {
    return 'failed'
  }
}
```

`packages/admin-ui/src/index.ts` 맨 끝(composable 절 뒤)에 새 절 추가:

```ts
// ── 세션 · 비밀번호 ───────────────────────────────────────────────────
export { copyText, type CopyResult } from './utils/copy-text.js'
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/utils/copy-text.test.ts packages/admin-ui/src/context/admin-ui.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm lint`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/context/admin-ui.ts packages/admin-ui/src/context/admin-ui.test.ts packages/admin-ui/src/utils/copy-text.ts packages/admin-ui/src/utils/copy-text.test.ts packages/admin-ui/src/index.ts
git add packages/admin-ui/src/context/admin-ui.ts packages/admin-ui/src/context/admin-ui.test.ts packages/admin-ui/src/utils/copy-text.ts packages/admin-ui/src/utils/copy-text.test.ts packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): copyText 3갈래 · AdminUserInfo.isPasswordChangeRequired

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `SessionTable`

**Files:**

- Create: `packages/admin-ui/src/components/session/session-table.ts`
- Create: `packages/admin-ui/src/components/session/SessionTable.vue`
- Create: `packages/admin-ui/src/components/session/session-table.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts` (`세션 · 비밀번호` 절)

**Interfaces:**

- Consumes: `describeUserAgent` · `AdminSession` · `AdminSessionListItem`(Task 1), `DataTableBody` · `AdminTableHeader`(기존).
- Produces: `type SessionTableRow = AdminSession & Partial<Pick<AdminSessionListItem, 'userNo' | 'userId' | 'userName'>>`, 내부 `formatDateTime(iso: string): string`. `SessionTable` props `sessions` · `itemsLength?` · `loading` · `busy` · `showUser` · `showIp` · `showLoginAt` · `showExpireAt` · `canRevoke` · `canRevokeUser` · `emptyText` · `formatDate?(iso)`, 모델 `page` · `itemsPerPage`, 이벤트 `revoke(row)` · `revokeUser(row)`, 슬롯 `no-data`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/components/session/session-table.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, type Component } from 'vue'
import { VDataTableServer } from 'vuetify/components'
import { vuetify } from '../../test/setup.js'
import SessionTable from './SessionTable.vue'
import { formatDateTime, type SessionTableRow } from './session-table.js'

// 정본: ssworks-gise-home apps/admin/test/me-page.test.ts 의 세션 표 규칙(현재 행에 버튼 없음 · 같은 요약 행을
//       접근 이름으로 구분 · busy 잠금)을 킷 DataTableBody 위에서 다시 잰다.

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const row = (over: Partial<SessionTableRow>): SessionTableRow => ({
  sessionNo: 1n,
  userAgent: CHROME_WIN,
  ipAddress: '10.0.0.1',
  loginAt: '2026-10-05T00:00:00.000Z',
  lastAccessAt: '2026-10-05T01:00:00.000Z',
  expireAt: '2026-10-12T01:00:00.000Z',
  isCurrent: false,
  ...over,
})

const ROWS: SessionTableRow[] = [
  row({ sessionNo: 1n, isCurrent: true, userId: 'kim', userName: '김' }),
  row({
    sessionNo: 2n,
    userAgent: SAFARI_IPHONE,
    lastAccessAt: '2026-10-05T02:00:00.000Z',
    userId: 'kim',
    userName: '김',
  }),
  row({
    sessionNo: 3n,
    userAgent: SAFARI_IPHONE,
    lastAccessAt: '2026-10-05T03:00:00.000Z',
    userId: 'lee',
    userName: '이',
  }),
]

/** 시간대와 무관한 표기 — 접근 이름 비교를 결정적으로 한다 */
const utc = (iso: string) => iso.slice(0, 16).replace('T', ' ')

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountTable(
  props: Record<string, unknown> = {},
  slots: Record<string, unknown> = {},
) {
  wrapper = mount(SessionTable as Component, {
    props: { sessions: ROWS, formatDate: utc, ...props },
    slots,
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

const headers = () =>
  [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '')
const bodyRows = () => [...document.querySelectorAll('tbody tr')]
const buttonByLabel = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const buttonsByText = (text: string, root: ParentNode = document) =>
  [...root.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text)

describe('SessionTable — 열', () => {
  it('기본 열은 기기 · IP · 마지막 활동 · 만료 · 동작이다', async () => {
    await mountTable()
    expect(headers()).toEqual(['기기', 'IP', '마지막 활동', '만료', ''])
  })

  it('사용자 · 로그인 열을 켜고 IP · 만료 열을 끌 수 있다', async () => {
    await mountTable({ showUser: true, showLoginAt: true, showIp: false, showExpireAt: false })
    expect(headers()).toEqual(['사용자', '기기', '로그인', '마지막 활동', ''])
    expect(bodyRows()[0]?.textContent).toContain('김 (kim)')
  })

  it('기기 칸은 요약 · 현재 칩 · 원문, 원문이 없으면 "기기 정보 없음" 만', async () => {
    await mountTable({ sessions: [ROWS[0]!, row({ sessionNo: 9n, userAgent: null })] })
    const [current, unknown] = bodyRows()
    expect(current?.textContent).toContain('Chrome · Windows')
    expect(current?.textContent).toContain('이 기기')
    expect(current?.textContent).toContain(CHROME_WIN)
    expect(unknown?.textContent).toContain('기기 정보 없음')
    expect(unknown?.textContent).not.toContain('이 기기')
  })

  it('IP 가 없으면 - 를 보인다', async () => {
    await mountTable({ sessions: [row({ ipAddress: null })] })
    expect(bodyRows()[0]?.querySelectorAll('td')[1]?.textContent?.trim()).toBe('-')
  })

  it('formatDate 를 안 주면 브라우저 현지 시각 YYYY-MM-DD HH:mm, 틀린 값은 원문 그대로', () => {
    const date = new Date('2026-10-05T01:02:00.000Z')
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(formatDateTime('2026-10-05T01:02:00.000Z')).toBe(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`,
    )
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
  })
})

describe('SessionTable — 동작', () => {
  it('🔴 현재 세션 행에는 끝내기가 없고 로그아웃 안내를 보인다', async () => {
    await mountTable()
    const current = bodyRows()[0]!
    expect(buttonsByText('끝내기', current)).toHaveLength(0)
    expect(current.textContent).toContain('이 기기는 로그아웃으로 끝냅니다.')
    expect(buttonsByText('끝내기')).toHaveLength(2)
  })

  it('🔴 요약이 같은 행은 접근 이름(마지막 활동 시각)으로 구분되고, 누르면 그 행으로 revoke 를 낸다', async () => {
    const w = await mountTable()
    const second = buttonByLabel('Safari · iOS 세션 끝내기 (마지막 활동 2026-10-05 02:00)')
    const third = buttonByLabel('Safari · iOS 세션 끝내기 (마지막 활동 2026-10-05 03:00)')
    expect(second).not.toBeNull()
    expect(third).not.toBeNull()
    third!.click()
    await flushPromises()
    expect(w.emitted('revoke')).toEqual([[ROWS[2]]])
  })

  it('사용자 열이 보이면 접근 이름 앞에 이름이 붙는다', async () => {
    await mountTable({ showUser: true })
    expect(
      buttonByLabel('이 · Safari · iOS 세션 끝내기 (마지막 활동 2026-10-05 03:00)'),
    ).not.toBeNull()
  })

  it('canRevokeUser 면 현재 행을 포함해 모든 행에 "사용자 전체 끊기" 가 있고 revokeUser 를 낸다', async () => {
    const w = await mountTable({ canRevokeUser: true })
    expect(buttonsByText('사용자 전체 끊기')).toHaveLength(3)
    buttonByLabel('김(kim) 의 세션 모두 끊기')!.click()
    await flushPromises()
    expect(w.emitted('revokeUser')).toEqual([[ROWS[0]]])
  })

  it('canRevoke 가 거짓이면 끝내기 버튼이 없다', async () => {
    await mountTable({ canRevoke: false })
    expect(buttonsByText('끝내기')).toHaveLength(0)
  })

  it('busy 동안 동작 버튼이 모두 잠긴다', async () => {
    await mountTable({ busy: true, canRevokeUser: true })
    const buttons = [...buttonsByText('끝내기'), ...buttonsByText('사용자 전체 끊기')]
    expect(buttons.length).toBe(5)
    expect(buttons.every((button) => button.disabled)).toBe(true)
  })
})

describe('SessionTable — 빈 목록 · 두 모드', () => {
  it('빈 목록은 emptyText, #no-data 슬롯이 있으면 그것', async () => {
    await mountTable({ sessions: [] })
    expect(document.body.textContent).toContain('로그인된 세션이 없습니다.')
    wrapper?.unmount()
    await mountTable({ sessions: [], emptyText: '세션 없음' })
    expect(document.body.textContent).toContain('세션 없음')
    wrapper?.unmount()
    await mountTable({ sessions: [] }, { 'no-data': () => h('p', '슬롯 문구') })
    expect(document.body.textContent).toContain('슬롯 문구')
  })

  it('전량 모드(itemsLength 없음)는 쪽 이동 없이 행을 전부 그린다', async () => {
    const many = Array.from({ length: 25 }, (_, i) => row({ sessionNo: BigInt(i + 1) }))
    await mountTable({ sessions: many })
    expect(document.querySelector('.v-data-table-footer')).toBeNull()
    expect(bodyRows()).toHaveLength(25)
  })

  it('서버 페이징 모드(itemsLength 있음)는 쪽 이동을 보이고 쪽 모델을 낸다', async () => {
    const w = await mountTable({ itemsLength: 45, page: 1, itemsPerPage: 20 })
    expect(document.querySelector('.v-data-table-footer')).not.toBeNull()
    w.findComponent(VDataTableServer).vm.$emit('update:page', 2)
    await flushPromises()
    expect(w.emitted('update:page')?.at(-1)).toEqual([2])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/session/session-table.render.test.ts`
Expected: FAIL — `Failed to resolve import "./SessionTable.vue"`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/components/session/session-table.ts`:

```ts
import type { AdminSession, AdminSessionListItem } from '@ssworks/admin-shared'

// SessionTable 의 행 타입과 날짜 표기.
//
// 정본: ssworks-gise-home apps/admin/src/types/session.ts
// 바꾼 점: 행 모양을 admin-shared 세션 스키마에서 파생한다 — 관리자 목록 행이면 사용자 필드가 있다.

/** 내 세션 행(`AdminSession`) 또는 관리자 목록 행(`AdminSessionListItem`) */
export type SessionTableRow = AdminSession &
  Partial<Pick<AdminSessionListItem, 'userNo' | 'userId' | 'userName'>>

const pad = (value: number) => String(value).padStart(2, '0')

/** 브라우저 현지 시각 `YYYY-MM-DD HH:mm`. 형식이 틀린 값은 원문 그대로(gise). 패키지 내부용. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

`packages/admin-ui/src/components/session/SessionTable.vue`:

```vue
<script setup lang="ts" generic="TRow extends SessionTableRow">
  import { computed } from 'vue'
  import { VBtn, VChip } from 'vuetify/components'
  import { describeUserAgent } from '@ssworks/admin-shared'
  import DataTableBody from '../table/DataTableBody.vue'
  import type { AdminTableHeader } from '../table/data-table.js'
  import { formatDateTime, type SessionTableRow } from './session-table.js'

  // 정본: ssworks-gise-home apps/admin/src/components/SessionTable.vue
  //       + kim5257-crm-v5 packages/frontend-core/src/components/sessions/SessionsAdminPanel.vue(사용자 열 · 서버 페이징)
  // 바꾼 점:
  //  ① 클라이언트 `VDataTable` 을 킷 `DataTableBody` 로 — `itemsLength` 를 주면 서버 페이징(관리자 전체 목록),
  //     안 주면 행 전부 + 쪽 이동 숨김(내 세션 · 계정별). `VDataTableServer` 는 넘긴 행을 자르지 않는다.
  //  ② 열을 켜고 끈다(사용자 · IP · 로그인 · 만료). crm 의 행 메뉴를 텍스트 버튼 둘로.
  //  ③ gise 의 `testPrefix` · `data-test` 를 버렸다 — 테스트는 접근 이름으로 찾는다.
  //
  // 🔴 현재 세션 행에는 "끝내기" 가 없다(3c 스펙 D4). 목록에서 끊으면 다음 요청이 401 이 되어 화면이 갑자기
  //    로그인으로 튕긴다 — 로그아웃 버튼이 같은 일을 정상 경로로 한다.
  // 🔴 끝내기 버튼의 접근 이름에 마지막 활동 시각을 넣는다 — 같은 브라우저 · 같은 OS 의 세션이 여러 줄이면 요약만으로는
  //    스크린리더도 테스트도 어느 줄인지 모른다(gise).

  const props = withDefaults(
    defineProps<{
      sessions: readonly TRow[]
      /** 있으면 서버 페이징 모드 — 서버가 센 총 개수 */
      itemsLength?: number
      loading?: boolean
      busy?: boolean
      showUser?: boolean
      showIp?: boolean
      showLoginAt?: boolean
      showExpireAt?: boolean
      canRevoke?: boolean
      canRevokeUser?: boolean
      emptyText?: string
      /** 메서드 꼴(bivariant). 기본은 브라우저 현지 시각 `YYYY-MM-DD HH:mm` */
      formatDate?(iso: string): string
    }>(),
    {
      itemsLength: undefined,
      loading: false,
      busy: false,
      showUser: false,
      showIp: true,
      showLoginAt: false,
      showExpireAt: true,
      canRevoke: true,
      canRevokeUser: false,
      emptyText: '로그인된 세션이 없습니다.',
      formatDate: undefined,
    },
  )

  const page = defineModel<number>('page', { default: 1 })
  const itemsPerPage = defineModel<number>('itemsPerPage', { default: 20 })

  const emit = defineEmits<{
    revoke: [row: TRow]
    revokeUser: [row: TRow]
  }>()

  defineSlots<{ 'no-data'?(): unknown }>()

  const paged = computed(() => props.itemsLength != null)

  const headers = computed<AdminTableHeader[]>(() => [
    ...(props.showUser ? [{ title: '사용자', key: 'user', sortable: false }] : []),
    { title: '기기', key: 'device', sortable: false },
    ...(props.showIp ? [{ title: 'IP', key: 'ipAddress', sortable: false, nowrap: true }] : []),
    ...(props.showLoginAt
      ? [{ title: '로그인', key: 'loginAt', sortable: false, nowrap: true }]
      : []),
    { title: '마지막 활동', key: 'lastAccessAt', sortable: false, nowrap: true },
    ...(props.showExpireAt
      ? [{ title: '만료', key: 'expireAt', sortable: false, nowrap: true }]
      : []),
    { title: '', key: 'actions', sortable: false, align: 'end' as const },
  ])

  function format(iso: string): string {
    return props.formatDate ? props.formatDate(iso) : formatDateTime(iso)
  }

  function revokeLabel(row: TRow): string {
    const who = props.showUser && row.userName ? `${row.userName} · ` : ''
    return `${who}${describeUserAgent(row.userAgent)} 세션 끝내기 (마지막 활동 ${format(row.lastAccessAt)})`
  }

  function revokeUserLabel(row: TRow): string {
    return `${row.userName ?? ''}(${row.userId ?? ''}) 의 세션 모두 끊기`
  }
</script>

<template>
  <DataTableBody
    v-model:items-per-page="itemsPerPage"
    v-model:page="page"
    class="session-table"
    :headers="headers"
    :hide-default-footer="!paged"
    :items="sessions"
    :items-length="itemsLength ?? sessions.length"
    :loading="loading"
  >
    <template #item.user="{ item }">{{ item.userName }} ({{ item.userId }})</template>
    <template #item.device="{ item }">
      <div class="session-table__device">
        <span>{{ describeUserAgent(item.userAgent) }}</span>
        <VChip v-if="item.isCurrent" color="primary" size="x-small" variant="tonal">이 기기</VChip>
      </div>
      <div
        v-if="item.userAgent?.trim()"
        class="session-table__raw text-caption text-medium-emphasis"
      >
        {{ item.userAgent }}
      </div>
    </template>
    <template #item.ipAddress="{ item }">{{ item.ipAddress ?? '-' }}</template>
    <template #item.loginAt="{ item }">{{ format(item.loginAt) }}</template>
    <template #item.lastAccessAt="{ item }">{{ format(item.lastAccessAt) }}</template>
    <template #item.expireAt="{ item }">{{ format(item.expireAt) }}</template>
    <template #item.actions="{ item }">
      <div class="session-table__actions">
        <span v-if="item.isCurrent" class="text-caption text-medium-emphasis">
          이 기기는 로그아웃으로 끝냅니다.
        </span>
        <VBtn
          v-else-if="canRevoke"
          :aria-label="revokeLabel(item)"
          color="error"
          :disabled="busy"
          size="small"
          variant="text"
          @click="emit('revoke', item)"
        >
          끝내기
        </VBtn>
        <VBtn
          v-if="canRevokeUser"
          :aria-label="revokeUserLabel(item)"
          :disabled="busy"
          size="small"
          variant="text"
          @click="emit('revokeUser', item)"
        >
          사용자 전체 끊기
        </VBtn>
      </div>
    </template>
    <template #no-data>
      <slot name="no-data">{{ emptyText }}</slot>
    </template>
  </DataTableBody>
</template>

<style scoped>
  .session-table__device {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .session-table__raw {
    overflow-wrap: anywhere;
  }
  .session-table__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
  }
</style>
```

`packages/admin-ui/src/index.ts` 의 `세션 · 비밀번호` 절(Task 3)에 추가:

```ts
export { default as SessionTable } from './components/session/SessionTable.vue'
export { type SessionTableRow } from './components/session/session-table.js'
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/session/session-table.render.test.ts`
Expected: PASS (14 tests)

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm lint`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/components/session packages/admin-ui/src/index.ts
git add packages/admin-ui/src/components/session packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): SessionTable — 현재 세션 보호, 기기 요약 · 원문, 전량 · 서버 페이징 두 모드

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `useSessions`

**Files:**

- Create: `packages/admin-ui/src/composables/useSessions.ts`
- Create: `packages/admin-ui/src/composables/useSessions.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts`

**Interfaces:**

- Consumes: `SessionTable` · `SessionTableRow`(Task 4), `useServerTable` · `ServerTable` · `ServerTableOptions`(기존), `useWriteFlow` · `ConfirmDialogBindings`(기존), `useAdminUi`(기존).
- Produces: 스펙 §4-6 의 타입 전부(`SessionDialogText` · `SessionMessages` · `SessionAction` · `SessionRevokedEvent` · `UseSessionsOptions` · `SessionTableBindings` · `Sessions`)와 `useSessions()`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/composables/useSessions.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import type { AdminSessionListItem } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import SessionTable from '../components/session/SessionTable.vue'
import { createAdminUi } from '../context/admin-ui.js'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import { useSessions, type Sessions, type UseSessionsOptions } from './useSessions.js'

// 정본: ssworks-gise-home apps/admin/test/me-page.test.ts(확인 뒤 요청 · 취소는 요청 0건 · 개수 문구 · 다른 세션이
//       없으면 "모두" 꺼짐) + hangang-home users.render.test.ts(자기 계정 1인칭 경고)를 실제 SessionTable ·
//       ConfirmDialog 에 붙여 잰다.

installVisualViewport()

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

type Row = AdminSessionListItem

const row = (over: Partial<Row>): Row => ({
  sessionNo: 1n,
  userNo: 1n,
  userId: 'kim',
  userName: '김',
  userAgent: CHROME_WIN,
  ipAddress: '10.0.0.1',
  loginAt: '2026-10-05T00:00:00.000Z',
  lastAccessAt: '2026-10-05T01:00:00.000Z',
  expireAt: '2026-10-12T01:00:00.000Z',
  isCurrent: false,
  ...over,
})

const MINE: Row[] = [
  row({ sessionNo: 1n, isCurrent: true }),
  row({ sessionNo: 2n, userAgent: SAFARI_IPHONE, lastAccessAt: '2026-10-05T02:00:00.000Z' }),
]
const OTHERS: Row[] = [row({ sessionNo: 7n, userNo: 2n, userId: 'lee', userName: '이' })]

const utc = (iso: string) => iso.slice(0, 16).replace('T', ' ')
const SECOND_ROW_LABEL = 'Safari · iOS 세션 끝내기 (마지막 활동 2026-10-05 02:00)'

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(options: UseSessionsOptions<Row>, tableProps: Record<string, unknown> = {}) {
  let sessions!: Sessions<Row>
  wrapper = mount(
    defineComponent({
      setup() {
        sessions = useSessions<Row>(options)
        return () =>
          h('div', [
            h(SessionTable as Component, {
              ...sessions.table.value,
              formatDate: utc,
              ...tableProps,
            }),
            h(ConfirmDialog as Component, sessions.confirmDialog.value),
          ])
      },
    }),
    {
      attachTo: document.body,
      global: {
        plugins: [
          vuetify,
          createAdminUi({
            user: () => ({ userId: 'kim', userName: '김', permissions: ['*'] }),
            logout: async () => {},
          }),
        ],
      },
    },
  )
  await flushPromises()
  return sessions
}

const activeDialog = () =>
  document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body

async function clickLabel(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button, `가드 — "${label}" 버튼이 있다`).not.toBeNull()
  button!.click()
  await flushPromises()
}

async function clickInDialog(text: string) {
  const button = buttonByText(text, activeDialog())
  expect(button, `가드 — 다이얼로그에 "${text}" 버튼이 있다`).toBeTruthy()
  button!.click()
  await flushPromises()
}

const apiError = (code: string, status = 404) => new ApiError(code, { status, code, raw: null })

describe('useSessions — 전량 모드 · 하나 끝내기', () => {
  it('처음에 목록을 받아 표에 넘긴다', async () => {
    const list = vi.fn(async () => MINE)
    const sessions = await setup({ list, revoke: vi.fn() })
    expect(list).toHaveBeenCalledTimes(1)
    expect(sessions.rows.value).toEqual(MINE)
    expect(sessions.total.value).toBe(2)
    expect(sessions.table.value.sessions).toEqual(MINE)
    expect(sessions.loading.value).toBe(false)
  })

  it('끝내기 → 되돌릴 수 없다는 확인 → 요청 → 재조회 → onRevoked', async () => {
    const list = vi.fn(async () => MINE)
    const revoke = vi.fn(async () => undefined)
    const onRevoked = vi.fn()
    const sessions = await setup({ list, revoke, onRevoked })
    await clickLabel(SECOND_ROW_LABEL)
    expect(document.body.textContent).toContain(
      '그 브라우저는 즉시 로그아웃되고, 다시 쓰려면 다시 로그인해야 합니다.',
    )
    expect(sessions.confirmDialog.value.reversible).toBe(false)
    expect(revoke).not.toHaveBeenCalled()
    await clickInDialog('끝내기')
    expect(revoke).toHaveBeenCalledWith(MINE[1])
    expect(list).toHaveBeenCalledTimes(2)
    expect(onRevoked).toHaveBeenCalledWith({ action: 'revoke', row: MINE[1] })
  })

  it('🔴 확인을 취소하면 요청도 재조회도 없다', async () => {
    const list = vi.fn(async () => MINE)
    const revoke = vi.fn(async () => undefined)
    await setup({ list, revoke })
    await clickLabel(SECOND_ROW_LABEL)
    await clickInDialog('취소')
    expect(revoke).not.toHaveBeenCalled()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('실패해도 재조회한다 — 404 는 이미 끝난 세션이다. onRevoked 는 부르지 않는다', async () => {
    const list = vi.fn(async () => MINE)
    const revoke = vi.fn().mockRejectedValue(apiError('ERR_NO_SESSION'))
    const onRevoked = vi.fn()
    await setup({ list, revoke, onRevoked })
    await clickLabel(SECOND_ROW_LABEL)
    await clickInDialog('끝내기')
    expect(list).toHaveBeenCalledTimes(2)
    expect(onRevoked).not.toHaveBeenCalled()
  })

  it('🔴 현재 세션 행을 바인딩으로 직접 끊으려 해도 요청 없이 무시한다', async () => {
    const revoke = vi.fn(async () => undefined)
    const sessions = await setup({ list: async () => MINE, revoke })
    sessions.table.value.onRevoke(MINE[0]!)
    await flushPromises()
    expect(sessions.confirmDialog.value.modelValue).toBe(false)
    expect(revoke).not.toHaveBeenCalled()
  })

  it('요청 중에는 표가 busy — 동작 버튼이 잠긴다', async () => {
    let release!: () => void
    const revoke = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const sessions = await setup({ list: async () => MINE, revoke })
    await clickLabel(SECOND_ROW_LABEL)
    await clickInDialog('끝내기')
    expect(sessions.table.value.busy).toBe(true)
    expect(
      document.querySelector<HTMLButtonElement>(`button[aria-label="${SECOND_ROW_LABEL}"]`)
        ?.disabled,
    ).toBe(true)
    release()
    await flushPromises()
    expect(sessions.table.value.busy).toBe(false)
  })

  it('canWrite 가 거짓이면 끝내기 버튼이 없다', async () => {
    const sessions = await setup({ list: async () => MINE, revoke: vi.fn(), canWrite: () => false })
    expect(sessions.table.value.canRevoke).toBe(false)
    expect(document.querySelector(`button[aria-label="${SECOND_ROW_LABEL}"]`)).toBeNull()
  })

  it('messages 로 확인 문구를 바꾼다', async () => {
    await setup({
      list: async () => MINE,
      revoke: vi.fn(),
      messages: {
        revoke: {
          title: '로그아웃',
          message: '이 기기를 로그아웃합니다.',
          confirmLabel: '로그아웃',
        },
      },
    })
    await clickLabel(SECOND_ROW_LABEL)
    expect(document.body.textContent).toContain('이 기기를 로그아웃합니다.')
    expect(buttonByText('로그아웃', activeDialog())).toBeTruthy()
  })
})

describe('useSessions — 다른 세션 모두', () => {
  it('다른 세션이 있으면 켜지고, 개수를 주면 onRevoked 에 싣는다', async () => {
    const list = vi.fn(async () => MINE)
    const revokeOthers = vi.fn(async () => ({ revokedCount: 1 }))
    const onRevoked = vi.fn()
    const sessions = await setup({ list, revokeOthers, onRevoked })
    expect(sessions.canRevokeOthers.value).toBe(true)
    const pending = sessions.revokeOthers()
    await flushPromises()
    expect(document.body.textContent).toContain('이 기기를 뺀 모든 세션이 즉시 로그아웃됩니다.')
    await clickInDialog('모두 끝내기')
    expect(await pending).toBe(true)
    expect(list).toHaveBeenCalledTimes(2)
    expect(onRevoked).toHaveBeenCalledWith({ action: 'revokeOthers', revokedCount: 1 })
  })

  it('🔴 개수를 안 주면 지어내지 않는다', async () => {
    const onRevoked = vi.fn()
    const sessions = await setup({
      list: async () => MINE,
      revokeOthers: vi.fn(async () => undefined),
      onRevoked,
    })
    const pending = sessions.revokeOthers()
    await flushPromises()
    await clickInDialog('모두 끝내기')
    await pending
    expect(onRevoked.mock.calls[0]![0]).toEqual({ action: 'revokeOthers' })
    expect(onRevoked.mock.calls[0]![0].revokedCount).toBeUndefined()
  })

  it('현재 세션뿐이면 꺼지고, 불러도 확인 없이 false', async () => {
    const sessions = await setup({ list: async () => [MINE[0]!], revokeOthers: vi.fn() })
    expect(sessions.canRevokeOthers.value).toBe(false)
    expect(await sessions.revokeOthers()).toBe(false)
    expect(sessions.confirmDialog.value.modelValue).toBe(false)
  })
})

describe('useSessions — 사용자 전체', () => {
  it('다른 사람이면 「이름(아이디)」 문구로 확인받고, 요청 뒤 재조회한다', async () => {
    const list = vi.fn(async () => OTHERS)
    const revokeUser = vi.fn(async () => ({ revokedCount: 3 }))
    const onRevoked = vi.fn()
    await setup({ list, revokeUser, onRevoked }, { showUser: true })
    await clickLabel('이(lee) 의 세션 모두 끊기')
    expect(document.body.textContent).toContain('「이(lee)」의 모든 세션이 즉시 로그아웃됩니다.')
    await clickInDialog('모두 끊기')
    expect(revokeUser).toHaveBeenCalledWith(OTHERS[0])
    expect(list).toHaveBeenCalledTimes(2)
    expect(onRevoked).toHaveBeenCalledWith({
      action: 'revokeUser',
      row: OTHERS[0],
      revokedCount: 3,
    })
  })

  it('🔴 내 계정이면 1인칭 경고로 확인받고, 성공하면 재조회 없이 onSelfSignedOut 을 부른다', async () => {
    const list = vi.fn(async () => MINE)
    const revokeUser = vi.fn(async () => undefined)
    const order: string[] = []
    await setup({
      list,
      revokeUser,
      onRevoked: () => {
        order.push('revoked')
      },
      onSelfSignedOut: () => {
        order.push('signedOut')
      },
    })
    await clickLabel('김(kim) 의 세션 모두 끊기')
    expect(document.body.textContent).toContain('이 계정은 지금 로그인한 당신 자신입니다.')
    await clickInDialog('모두 끊기')
    expect(revokeUser).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['revoked', 'signedOut'])
  })

  it('isSelf 를 주면 그것으로 판정한다(useAdminUi 를 보지 않는다)', async () => {
    await setup({ list: async () => OTHERS, revokeUser: vi.fn(), isSelf: () => true })
    await clickLabel('이(lee) 의 세션 모두 끊기')
    expect(document.body.textContent).toContain('이 계정은 지금 로그인한 당신 자신입니다.')
  })
})

describe('useSessions — 목록', () => {
  it('🔴 늦게 온 옛 목록 응답은 버린다', async () => {
    let releaseFirst!: (rows: Row[]) => void
    const list = vi
      .fn<() => Promise<Row[]>>()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockResolvedValue(MINE)
    const sessions = await setup({ list })
    await sessions.reload()
    releaseFirst(OTHERS)
    await flushPromises()
    expect(sessions.rows.value).toEqual(MINE)
    expect(sessions.loading.value).toBe(false)
  })

  it('조회 실패는 loadError 에 — 목록은 그대로, 다음 조회가 비운다', async () => {
    const failure = new Error('network')
    const list = vi
      .fn<() => Promise<Row[]>>()
      .mockResolvedValueOnce(MINE)
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(MINE)
    const sessions = await setup({ list })
    await sessions.reload()
    expect(sessions.loadError.value).toBe(failure)
    expect(sessions.rows.value).toEqual(MINE)
    await sessions.reload()
    expect(sessions.loadError.value).toBeNull()
  })

  it('immediate: false 면 reload() 를 부를 때까지 조회하지 않는다', async () => {
    const list = vi.fn(async () => MINE)
    const sessions = await setup({ list, immediate: false })
    expect(list).not.toHaveBeenCalled()
    await sessions.reload()
    expect(list).toHaveBeenCalledTimes(1)
  })
})

describe('useSessions — 서버 페이징 모드', () => {
  it('fetch 를 useServerTable 로 넘기고 표에 itemsLength · 쪽 모델을 준다', async () => {
    const fetch = vi.fn(async () => ({ items: OTHERS, total: 45n }))
    const sessions = await setup({ fetch, revoke: vi.fn() })
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ page: 1, itemsPerPage: 20 }))
    expect(sessions.table.value.itemsLength).toBe(45)
    expect(sessions.total.value).toBe(45)
    expect(sessions.serverTable).not.toBeNull()
    sessions.table.value['onUpdate:page']!(2)
    await flushPromises()
    expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('끝내기 뒤 재조회는 fetch 를 다시 부른다', async () => {
    const fetch = vi.fn(async () => ({ items: OTHERS, total: 1 }))
    const revoke = vi.fn(async () => undefined)
    await setup({ fetch, revoke })
    await clickLabel('Chrome · Windows 세션 끝내기 (마지막 활동 2026-10-05 01:00)')
    await clickInDialog('끝내기')
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('서버 페이징 모드에서는 "다른 세션 모두" 를 쓰지 않는다', async () => {
    const sessions = await setup({
      fetch: async () => ({ items: MINE, total: 2 }),
      revokeOthers: vi.fn(),
    })
    expect(sessions.canRevokeOthers.value).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useSessions.render.test.ts`
Expected: FAIL — `Failed to resolve import "./useSessions.js"`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/composables/useSessions.ts`:

```ts
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import type { SessionTableRow } from '../components/session/session-table.js'
import { useAdminUi } from '../context/admin-ui.js'
import { useServerTable, type ServerTable, type ServerTableOptions } from './useServerTable.js'
import { useWriteFlow, type ConfirmDialogBindings } from './useWriteFlow.js'

// 세션 목록 조회와 세 가지 끊기 동작 — `SessionTable` 에 `v-bind` 할 바인딩을 낸다.
//
// 정본: ssworks-gise-home apps/admin/src/pages/me.vue · components/AccountSessionsDialog.vue(흐름 · 문구표 · 응답 경합)
//       + hangang-home apps/admin/src/pages/org/users.vue "세션 종료"(자기 계정 1인칭 경고)
// 바꾼 점:
//  ① 화면마다 흩어진 상태를 composable 하나로. 확인 관문은 3a `useWriteFlow` 를 쓴다(D5 — 재인증 없음).
//  ② 목록이 전량(`list`)이면 직접, 서버 페이징(`fetch`)이면 `useServerTable` 을 감싼다(관리자 전체 목록).
//  ③ 동작은 어댑터에 준 것만 생긴다(3c 결정 ④-A1). 성공 문구는 `onRevoked` 로 화면에 맡긴다.
//  ④ gise 의 "403/404/409 만 재조회, 500 은 다이얼로그 유지" 를 버렸다 — 요청이 나갔으면 늘 재조회한다(D6).

export interface SessionDialogText {
  title: string
  message: string
  confirmLabel: string
}

export interface SessionMessages<R> {
  revoke: SessionDialogText
  revokeOthers: SessionDialogText
  revokeUser: (row: R) => SessionDialogText
  revokeUserSelf: (row: R) => SessionDialogText
}

export type SessionAction = 'revoke' | 'revokeOthers' | 'revokeUser'

export interface SessionRevokedEvent<R> {
  action: SessionAction
  row?: R
  /** 서버가 준 경우에만. 없으면 화면이 개수를 지어내지 않는다(hangang) */
  revokedCount?: number
}

interface SessionsCommonOptions<R extends SessionTableRow> {
  revoke?: (row: R) => Promise<void>
  revokeOthers?: () => Promise<{ revokedCount?: number } | void>
  revokeUser?: (row: R) => Promise<{ revokedCount?: number } | void>
  /** 게터 — 호출 시점마다 평가한다(axion 처럼 한 번만 읽으면 권한 변화를 못 따른다). 기본 `() => true` */
  canWrite?: () => boolean
  /** 사용자 전체 끊기의 "나 자신" 판정. 기본 `row.userId === useAdminUi().user()?.userId` */
  isSelf?: (row: R) => boolean
  onRevoked?: (event: SessionRevokedEvent<R>) => void | Promise<void>
  /** 내 계정 전체를 끊은 뒤 — 템플릿이 세션을 비우고 로그인으로 보낸다 */
  onSelfSignedOut?: () => void | Promise<void>
  messages?: Partial<SessionMessages<R>>
  /** 기본 true. 다이얼로그 안처럼 열 때 불러야 하면 false + `reload()` */
  immediate?: boolean
}

export type UseSessionsOptions<
  R extends SessionTableRow,
  F extends object = Record<string, never>,
> =
  | (SessionsCommonOptions<R> & { list: () => Promise<readonly R[]> })
  | (SessionsCommonOptions<R> & {
      fetch: ServerTableOptions<R, F>['fetch']
      filters?: ServerTableOptions<R, F>['filters']
      isFiltered?: ServerTableOptions<R, F>['isFiltered']
      urlSync?: ServerTableOptions<R, F>['urlSync']
      itemsPerPage?: number
    })

/** `<SessionTable v-bind="table" show-… />` */
export interface SessionTableBindings<R> {
  sessions: readonly R[]
  itemsLength?: number
  page?: number
  itemsPerPage?: number
  'onUpdate:page'?: (page: number) => void
  'onUpdate:itemsPerPage'?: (size: number) => void
  loading: boolean
  busy: boolean
  canRevoke: boolean
  canRevokeUser: boolean
  onRevoke: (row: R) => void
  onRevokeUser: (row: R) => void
}

export interface Sessions<R> {
  rows: Readonly<Ref<readonly R[]>>
  /** 전량 모드는 `rows.length` */
  total: Readonly<Ref<number>>
  loading: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<unknown>>
  reload: () => Promise<void>
  table: ComputedRef<SessionTableBindings<R>>
  canRevokeOthers: ComputedRef<boolean>
  /** 성공 true · 취소 · 실패 · 막힘 false */
  revokeOthers: () => Promise<boolean>
  submitting: Readonly<Ref<boolean>>
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  /** 서버 페이징 모드에서만 — 필터 · `isFiltered` · `flushUrl` 을 쓸 때 */
  serverTable: ServerTable<R> | null
}

const DEFAULT_MESSAGES: SessionMessages<SessionTableRow> = {
  revoke: {
    title: '세션 끝내기',
    message: '그 브라우저는 즉시 로그아웃되고, 다시 쓰려면 다시 로그인해야 합니다.',
    confirmLabel: '끝내기',
  },
  revokeOthers: {
    title: '다른 세션 모두 끝내기',
    message: '이 기기를 뺀 모든 세션이 즉시 로그아웃됩니다.',
    confirmLabel: '모두 끝내기',
  },
  revokeUser: (row) => ({
    title: '사용자 전체 끊기',
    message: `「${row.userName ?? ''}(${row.userId ?? ''})」의 모든 세션이 즉시 로그아웃됩니다. 그 사람은 다시 로그인해야 합니다.`,
    confirmLabel: '모두 끊기',
  }),
  revokeUserSelf: () => ({
    title: '사용자 전체 끊기',
    message:
      '이 계정은 지금 로그인한 당신 자신입니다. 확인하는 즉시 이 화면에서도 로그아웃되고, 다시 로그인해야 합니다.',
    confirmLabel: '모두 끊기',
  }),
}

/** 응답에 0 이상 정수 `revokedCount` 가 있을 때만 그 값 */
function countOf(result: unknown): number | undefined {
  if (result == null || typeof result !== 'object' || !('revokedCount' in result)) return undefined
  const count = (result as { revokedCount?: unknown }).revokedCount
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : undefined
}

/** setup 안에서 부른다. 확인 다이얼로그는 반환된 `confirmDialog` 를 `<ConfirmDialog v-bind>` 로 붙인다. */
export function useSessions<R extends SessionTableRow, F extends object = Record<string, never>>(
  options: UseSessionsOptions<R, F>,
): Sessions<R> {
  const flow = useWriteFlow()
  const canWrite = options.canWrite ?? (() => true)
  // 기본값을 쓸 때만 컨텍스트를 찾는다 — isSelf 를 주거나 사용자 전체 끊기가 없으면 플러그인 없이도 쓸 수 있다.
  const ui = options.revokeUser != null && options.isSelf == null ? useAdminUi() : null
  const isSelf =
    options.isSelf ??
    ((row: R) => {
      const userId = ui?.user()?.userId
      return userId != null && row.userId === userId
    })
  const messages = { ...DEFAULT_MESSAGES, ...options.messages } as SessionMessages<R>
  const immediate = options.immediate !== false

  // ── 목록 ──────────────────────────────────────────────────────────

  let serverTable: ServerTable<R> | null = null
  let rows: Readonly<Ref<readonly R[]>>
  let total: Readonly<Ref<number>>
  let loading: Readonly<Ref<boolean>>
  let loadError: Readonly<Ref<unknown>>
  let reload: () => Promise<void>

  if ('fetch' in options) {
    const table = useServerTable<R, F>({
      fetch: options.fetch,
      // 네 프로젝트 모두 마지막 활동 내림차순 고정 — 열 머리 정렬이 없다(D3).
      sort: false,
      filters: options.filters,
      isFiltered: options.isFiltered,
      urlSync: options.urlSync,
      itemsPerPage: options.itemsPerPage,
      immediate,
    })
    serverTable = table
    rows = table.items
    total = table.total
    loading = table.loading
    loadError = table.error
    reload = table.reload
  } else {
    const { list } = options
    const listRows = shallowRef<readonly R[]>([])
    const listLoading = ref(false)
    const listError = shallowRef<unknown>(null)
    /** 🔴 응답 경합 — 끊은 뒤 재조회와 첫 조회가 겹치면 먼저 보낸 느린 응답이 나중에 도착해 이긴다(gise · hangang). */
    let loadSeq = 0
    reload = async () => {
      const seq = ++loadSeq
      listLoading.value = true
      listError.value = null
      try {
        const items = await list()
        if (seq !== loadSeq) return
        listRows.value = items
      } catch (error) {
        if (seq !== loadSeq) return
        // 목록은 그대로 둔다 — 화면이 로딩 · 목록 · 실패 · 빈 목록을 가를 수 있게.
        listError.value = error
      } finally {
        if (seq === loadSeq) listLoading.value = false
      }
    }
    rows = listRows
    total = computed(() => listRows.value.length)
    loading = listLoading
    loadError = listError
    if (immediate) void reload()
  }

  const busy = computed(() => loading.value || flow.submitting.value)

  // ── 쓰기 ──────────────────────────────────────────────────────────

  /** 결과와 함께 요청이 실제로 나갔는지(관문 취소가 아닌지)를 돌려준다 — 재조회는 나갔을 때만 한다(D6). */
  async function write(
    text: SessionDialogText,
    action: () => Promise<unknown>,
  ): Promise<{ ok: boolean; attempted: boolean; result: unknown }> {
    let attempted = false
    let result: unknown
    const ok = await flow.run({
      gate: 'confirm',
      // 🔴 끊은 세션은 되살릴 수 없다 — 사용자는 다시 로그인해야 한다(D5).
      reversible: false,
      title: text.title,
      message: text.message,
      confirmLabel: text.confirmLabel,
      action: async () => {
        attempted = true
        result = await action()
      },
    })
    return { ok, attempted, result }
  }

  async function revokeRow(row: R): Promise<boolean> {
    const revoke = options.revoke
    // 🔴 현재 세션은 목록에서 끊지 않는다 — 표가 버튼을 안 그려도 바인딩을 직접 부르는 길까지 막는다(D4).
    if (revoke == null || row.isCurrent || !canWrite()) return false
    const { ok, attempted } = await write(messages.revoke, () => revoke(row))
    if (!attempted) return false
    await reload()
    if (ok) await options.onRevoked?.({ action: 'revoke', row })
    return ok
  }

  async function revokeUserRow(row: R): Promise<boolean> {
    const revokeUser = options.revokeUser
    if (revokeUser == null || !canWrite()) return false
    const self = isSelf(row)
    const text = self ? messages.revokeUserSelf(row) : messages.revokeUser(row)
    const { ok, attempted, result } = await write(text, () => revokeUser(row))
    if (!attempted) return false
    if (ok && self) {
      // 🔴 서버가 지금 세션까지 끊었다 — 재조회는 401 로 실패할 뿐이다. 화면이 세션을 비우고 로그인으로 보낸다.
      await options.onRevoked?.({ action: 'revokeUser', row, revokedCount: countOf(result) })
      await options.onSelfSignedOut?.()
      return true
    }
    await reload()
    if (ok) await options.onRevoked?.({ action: 'revokeUser', row, revokedCount: countOf(result) })
    return ok
  }

  const canRevokeOthers = computed(
    () =>
      options.revokeOthers != null &&
      // 내 세션은 전량 모드다 — 서버 페이징 목록에서 "다른 세션 모두" 는 뜻이 없다.
      serverTable == null &&
      canWrite() &&
      !busy.value &&
      rows.value.some((row) => !row.isCurrent),
  )

  async function revokeOthers(): Promise<boolean> {
    const fn = options.revokeOthers
    if (fn == null || !canRevokeOthers.value) return false
    const { ok, attempted, result } = await write(messages.revokeOthers, () => fn())
    if (!attempted) return false
    await reload()
    if (ok) await options.onRevoked?.({ action: 'revokeOthers', revokedCount: countOf(result) })
    return ok
  }

  const table = computed<SessionTableBindings<R>>(() => {
    const bindings: SessionTableBindings<R> = {
      sessions: rows.value,
      loading: loading.value,
      busy: busy.value,
      canRevoke: options.revoke != null && canWrite(),
      canRevokeUser: options.revokeUser != null && canWrite(),
      onRevoke: (row) => {
        void revokeRow(row)
      },
      onRevokeUser: (row) => {
        void revokeUserRow(row)
      },
    }
    const server = serverTable
    if (server != null) {
      bindings.itemsLength = server.total.value
      bindings.page = server.page.value
      bindings.itemsPerPage = server.itemsPerPage.value
      bindings['onUpdate:page'] = (page) => {
        server.page.value = page
      }
      bindings['onUpdate:itemsPerPage'] = (size) => {
        server.itemsPerPage.value = size
      }
    }
    return bindings
  })

  return {
    rows,
    total,
    loading,
    loadError,
    reload,
    table,
    canRevokeOthers,
    revokeOthers,
    submitting: flow.submitting,
    confirmDialog: flow.confirmDialog,
    serverTable,
  }
}
```

`packages/admin-ui/src/index.ts` 의 `세션 · 비밀번호` 절에 추가:

```ts
export {
  useSessions,
  type Sessions,
  type UseSessionsOptions,
  type SessionTableBindings,
  type SessionMessages,
  type SessionDialogText,
  type SessionAction,
  type SessionRevokedEvent,
} from './composables/useSessions.js'
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useSessions.render.test.ts`
Expected: PASS (20 tests)

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm lint && pnpm --filter @ssworks/admin-ui test`
Expected: 오류 없음, 전체 통과

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/useSessions.ts packages/admin-ui/src/composables/useSessions.render.test.ts packages/admin-ui/src/index.ts
git add packages/admin-ui/src/composables/useSessions.ts packages/admin-ui/src/composables/useSessions.render.test.ts packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): useSessions — 전량 · 서버 페이징 목록, 끝내기 · 다른 세션 모두 · 사용자 전체

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `TemporaryPasswordDialog`

**Files:**

- Create: `packages/admin-ui/src/components/password/TemporaryPasswordDialog.vue`
- Create: `packages/admin-ui/src/components/password/temporary-password-dialog.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts`

**Interfaces:**

- Consumes: `copyText` · `CopyResult`(Task 3), `BaseDialog`(기존 — `v-model` boolean, `persistent` 기본 true, `closable`, `type: 'none'` + `#actions`).
- Produces: `TemporaryPasswordDialog` — `v-model: string | null`, props `mode`('create' | 'reset', 기본 'reset') · `title?` · `target?` · `sessionsRevoked`(기본 false), 기본 슬롯.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/components/password/temporary-password-dialog.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Component } from 'vue'
import { VDialog } from 'vuetify/components'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import TemporaryPasswordDialog from './TemporaryPasswordDialog.vue'

// 정본: ssworks-gise-home apps/admin/test/accounts-users-page.test.ts(닫으면 값이 남지 않음 · 복사 결과) +
//       hangang-home users.render.test.ts(글자로 표시 · 복사 3갈래 · 자동으로 닫지 않음).

installVisualViewport()

const TEMP = 'Ab3dEf7hJk9mNp2q'
const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

async function setup(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const value = ref<string | null>(TEMP)
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(
          TemporaryPasswordDialog as Component,
          {
            ...props,
            modelValue: value.value,
            'onUpdate:modelValue': (next: string | null) => {
              value.value = next
            },
          },
          slots,
        ),
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return value
}

const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active')

async function click(text: string) {
  const button = buttonByText(text, dialog() ?? document.body)
  expect(button, `가드 — "${text}" 버튼이 있다`).toBeTruthy()
  button!.click()
  await flushPromises()
}

describe('TemporaryPasswordDialog — 표시', () => {
  it('값이 있으면 열리고, 🔴 값은 입력칸이 아니라 code 글자다', async () => {
    await setup()
    expect(dialog()).not.toBeNull()
    expect(dialog()?.querySelector('code')?.textContent).toBe(TEMP)
    const inputs = [...document.querySelectorAll('input')]
    expect(inputs.some((input) => input.value === TEMP)).toBe(false)
  })

  it('값이 null 이면 열리지 않는다', async () => {
    const value = await setup()
    value.value = null
    await flushPromises()
    expect(dialog()).toBeNull()
  })

  it('제목은 mode 로 갈리고 title 로 바꿀 수 있다', async () => {
    await setup()
    expect(document.body.textContent).toContain('비밀번호를 초기화했습니다')
    wrapper?.unmount()
    await setup({ mode: 'create' })
    expect(document.body.textContent).toContain('계정을 만들었습니다')
    wrapper?.unmount()
    await setup({ title: '임시 비밀번호 발급' })
    expect(document.body.textContent).toContain('임시 비밀번호 발급')
  })

  it('"한 번만" 경고와 첫 로그인 안내를 보이고, target · sessionsRevoked · 슬롯을 더한다', async () => {
    await setup(
      { target: '홍길동(hong)', sessionsRevoked: true },
      { default: () => h('p', '추가 안내') },
    )
    const text = document.body.textContent ?? ''
    expect(text).toContain(
      '이 값은 지금 한 번만 보입니다. 창을 닫으면 다시 볼 수 없고, 잃어버리면 다시 발급해야 합니다.',
    )
    expect(text).toContain('처음 로그인하면 새 비밀번호를 정하게 됩니다.')
    expect(text).toContain('「홍길동(hong)」의 임시 비밀번호')
    expect(text).toContain('이 계정의 접속 세션은 서버가 함께 끊었습니다.')
    expect(text).toContain('추가 안내')
  })

  it('세션 안내는 sessionsRevoked 일 때만', async () => {
    await setup()
    expect(document.body.textContent).not.toContain('이 계정의 접속 세션은 서버가 함께 끊었습니다.')
  })
})

describe('TemporaryPasswordDialog — 복사', () => {
  it('성공하면 값 아래에 "복사했습니다" — 값 그대로 쓴다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    await setup()
    await click('복사')
    expect(writeText).toHaveBeenCalledWith(TEMP)
    expect(dialog()?.querySelector('[aria-live="polite"]')?.textContent).toContain(
      '임시 비밀번호를 복사했습니다.',
    )
  })

  it('🔴 클립보드 API 가 없으면 "복사했습니다" 를 내지 않는다', async () => {
    setClipboard(undefined)
    await setup()
    await click('복사')
    const notice = dialog()?.querySelector('[aria-live="polite"]')?.textContent ?? ''
    expect(notice).toContain(
      '이 브라우저에서는 복사 기능을 쓸 수 없습니다. 위 값을 직접 선택해 복사하세요.',
    )
    expect(notice).not.toContain('복사했습니다')
  })

  it('거부되면 실패 문구', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    await setup()
    await click('복사')
    expect(dialog()?.querySelector('[aria-live="polite"]')?.textContent).toContain(
      '복사하지 못했습니다. 위 값을 직접 선택해 복사하세요.',
    )
  })

  it('복사 중에는 복사 버튼이 잠긴다', async () => {
    let release!: () => void
    setClipboard({ writeText: vi.fn(() => new Promise<void>((resolve) => (release = resolve))) })
    await setup()
    await click('복사')
    expect(buttonByText('복사', dialog()!)?.disabled).toBe(true)
    release()
    await flushPromises()
    expect(buttonByText('복사', dialog()!)?.disabled).toBe(false)
  })

  it('값이 바뀌면 이전 복사 결과 문구를 지운다', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) })
    const value = await setup()
    await click('복사')
    value.value = 'Zz9yXw8vUt7sRq6p'
    await flushPromises()
    expect(dialog()?.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('')
  })
})

describe('TemporaryPasswordDialog — 닫기', () => {
  it('🔴 닫기는 null 을 내보내 부모의 값을 비우고, 값이 DOM 에 남지 않는다', async () => {
    const value = await setup()
    await click('닫기')
    expect(value.value).toBeNull()
    await nextTick()
    expect(document.body.innerHTML).not.toContain(TEMP)
  })

  it('🔴 스스로 닫지 않는다 — persistent 이고 제목 줄 X 가 없다', async () => {
    const value = await setup()
    expect(wrapper!.findComponent(VDialog).props('persistent')).toBe(true)
    expect(document.querySelector('button[aria-label="닫기"]')).toBeNull()
    expect(value.value).toBe(TEMP)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/password/temporary-password-dialog.render.test.ts`
Expected: FAIL — `Failed to resolve import "./TemporaryPasswordDialog.vue"`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/components/password/TemporaryPasswordDialog.vue`:

```vue
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { VAlert, VBtn } from 'vuetify/components'
  import BaseDialog from '../common/BaseDialog.vue'
  import { copyText, type CopyResult } from '../../utils/copy-text.js'

  // 정본: ssworks-gise-home apps/admin/src/components/TemporaryPasswordDialog.vue
  //       + hangang-home apps/admin/src/pages/org/users.vue(인라인 다이얼로그) · users-messages.ts(문구)
  // 바꾼 점:
  //  ① 열림(boolean)과 값을 따로 받던 것을 `v-model` 하나로 — 값 자체(`string | null`)가 모델이다.
  //  ② hangang 규칙: 값을 글자로 · 복사 3갈래 · 문구는 값 아래 · "한 번만" 경고 · 세션 폐기 안내 · 스스로 닫지 않음.
  //  ③ gise 의 토스트 복사 알림을 버렸다 — 관리자는 지금 이 값을 보고 있다.
  //
  // 🔴 `v-model` 이 곧 값이다. 닫기가 `null` 을 내보내 부모의 값을 비운다 — "닫으면 부모가 비운다" 를 부모의
  //    성실함에 맡기지 않는다(3c 스펙 D7). 이 컴포넌트는 값을 따로 보관하지 않는다.
  // 🔴 값을 입력칸이 아니라 글자로 낸다 — 입력칸의 value 는 화면 읽기 도구가 못 읽고, 클립보드가 없을 때 손으로
  //    고르기도 불편하다. 복사는 편의이고 화면의 글자가 정본이다(hangang).
  // 🔴 스스로 닫지 않는다 — 바깥 클릭 · ESC 무시, 제목 줄 X 없음. 목록을 다시 불러와도 열린 채다. 읽기 전에 닫히면
  //    그 값은 다시 볼 수 없다(hangang).

  const value = defineModel<string | null>({ default: null })

  const props = withDefaults(
    defineProps<{
      mode?: 'create' | 'reset'
      title?: string
      /** 누구의 값인지(예: `홍길동(hong)`) */
      target?: string
      /** 서버가 그 계정의 세션을 함께 끊었다는 안내 */
      sessionsRevoked?: boolean
    }>(),
    { mode: 'reset', title: undefined, target: undefined, sessionsRevoked: false },
  )

  defineSlots<{ default?(): unknown }>()

  const COPY_MESSAGES: Record<CopyResult, string> = {
    done: '임시 비밀번호를 복사했습니다.',
    failed: '복사하지 못했습니다. 위 값을 직접 선택해 복사하세요.',
    unavailable: '이 브라우저에서는 복사 기능을 쓸 수 없습니다. 위 값을 직접 선택해 복사하세요.',
  }

  const open = computed(() => value.value != null)
  const heading = computed(
    () =>
      props.title ??
      (props.mode === 'create' ? '계정을 만들었습니다' : '비밀번호를 초기화했습니다'),
  )
  const copying = ref(false)
  const copyResult = ref<CopyResult | null>(null)

  // 값이 바뀌거나 닫히면 이전 복사 결과를 지운다 — 다른 사람 값에 "복사했습니다" 가 남지 않게.
  watch(value, () => {
    copyResult.value = null
  })

  async function copy(): Promise<void> {
    const text = value.value
    if (text == null || copying.value) return
    copying.value = true
    try {
      copyResult.value = await copyText(text)
    } finally {
      copying.value = false
    }
  }

  function close(): void {
    value.value = null
  }

  function onModel(next: boolean): void {
    if (!next) close()
  }
</script>

<template>
  <BaseDialog
    :closable="false"
    max-width="480"
    :model-value="open"
    persistent
    :title="heading"
    type="none"
    @update:model-value="onModel"
  >
    <div class="temporary-password">
      <p v-if="target" class="text-body-2">「{{ target }}」의 임시 비밀번호</p>
      <code class="temporary-password__value">{{ value }}</code>
      <p aria-live="polite" class="text-body-2">
        {{ copyResult ? COPY_MESSAGES[copyResult] : '' }}
      </p>
      <VAlert density="compact" type="warning" variant="tonal">
        이 값은 지금 한 번만 보입니다. 창을 닫으면 다시 볼 수 없고, 잃어버리면 다시 발급해야 합니다.
      </VAlert>
      <VAlert v-if="sessionsRevoked" density="compact" type="info" variant="tonal">
        이 계정의 접속 세션은 서버가 함께 끊었습니다.
      </VAlert>
      <p class="text-body-2">처음 로그인하면 새 비밀번호를 정하게 됩니다.</p>
      <slot />
    </div>
    <template #actions>
      <VBtn :disabled="copying" :loading="copying" variant="text" @click="copy">복사</VBtn>
      <VBtn @click="close">닫기</VBtn>
    </template>
  </BaseDialog>
</template>

<style scoped>
  .temporary-password {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .temporary-password__value {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 1.25rem;
    letter-spacing: 0.04em;
    padding: 8px 12px;
    border-radius: 6px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    user-select: all;
    overflow-wrap: anywhere;
  }
</style>
```

`packages/admin-ui/src/index.ts` 의 `세션 · 비밀번호` 절에 추가:

```ts
export { default as TemporaryPasswordDialog } from './components/password/TemporaryPasswordDialog.vue'
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/password/temporary-password-dialog.render.test.ts`
Expected: PASS (12 tests)

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm lint`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/components/password/TemporaryPasswordDialog.vue packages/admin-ui/src/components/password/temporary-password-dialog.render.test.ts packages/admin-ui/src/index.ts
git add packages/admin-ui/src/components/password/TemporaryPasswordDialog.vue packages/admin-ui/src/components/password/temporary-password-dialog.render.test.ts packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): TemporaryPasswordDialog — v-model 이 곧 값, 글자 표시 · 복사 3갈래 · 스스로 닫지 않음

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `PasswordChangeForm`

**Files:**

- Create: `packages/admin-ui/src/components/password/PasswordChangeForm.vue`
- Create: `packages/admin-ui/src/components/password/password-change-form.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts`

**Interfaces:**

- Consumes: `definePasswordPolicy` · `PasswordPolicy`(Task 2), `PasswordField`(기존 — `v-model`, `$attrs` 를 `VTextField` 로, `autocomplete="off"` 를 `$attrs` 가 덮는다).
- Produces: `PasswordChangeForm` — props `policy` · `submit(body) => Promise<boolean>` · `errors`(기본 `{}`) · `userId?` · `submitLabel`(기본 `비밀번호 변경`).

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/components/password/password-change-form.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import { definePasswordPolicy } from '@ssworks/admin-shared'
import { buttonByText, vuetify } from '../../test/setup.js'
import PasswordChangeForm from './PasswordChangeForm.vue'

// 정본: ssworks-gise-home apps/admin/test/password-page.test.ts(칸 · 검증 · 이중 제출 · readonly · 필드 오류 ·
//       포커스)를 화면 위치와 무관한 폼 컴포넌트로 다시 잰다.

const policy = definePasswordPolicy()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function setup(props: Record<string, unknown> = {}) {
  const errors = ref<Record<string, string[]>>({})
  const submit =
    (props.submit as ((body: unknown) => Promise<boolean>) | undefined) ?? vi.fn(async () => true)
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(PasswordChangeForm as Component, { policy, submit, ...props, errors: errors.value }),
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return { errors, submit }
}

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!

/** `.value` 대입만으로는 `v-model` 이 안 먹는다 — `input` 이벤트를 손으로 낸다 */
async function typeInto(name: string, value: string) {
  const el = input(name)
  el.value = value
  el.dispatchEvent(new Event('input'))
  await flushPromises()
}

/** Vuetify 가 오류 문구가 있는 칸에 붙이는 상태 클래스 */
const hasError = (name: string) =>
  input(name).closest('.v-input')?.classList.contains('v-input--error') ?? false

async function fill(current = 'old-pass-1', next = 'new-pass-1', confirm = next) {
  await typeInto('currentPassword', current)
  await typeInto('newPassword', next)
  await typeInto('confirmPassword', confirm)
}

const submitButton = () => buttonByText('비밀번호 변경')!
const form = () => document.querySelector('form')!

describe('PasswordChangeForm — 칸', () => {
  it('세 칸의 이름 · autocomplete 와 정책 문구 도움말', async () => {
    await setup()
    expect(input('currentPassword').getAttribute('autocomplete')).toBe('current-password')
    expect(input('newPassword').getAttribute('autocomplete')).toBe('new-password')
    expect(input('confirmPassword').getAttribute('autocomplete')).toBe('new-password')
    expect(document.body.textContent).toContain(policy.lengthMessage)
  })

  it('userId 를 주면 숨은 username 칸을 둔다 — 비밀번호 관리자가 계정을 알아본다', async () => {
    await setup({ userId: 'hong' })
    const username = document.querySelector<HTMLInputElement>('input[autocomplete="username"]')
    expect(username?.value).toBe('hong')
    expect(username?.hidden).toBe(true)
  })
})

describe('PasswordChangeForm — 검증', () => {
  it('검증 오류는 그 칸에 입력한 뒤에만 — 처음부터 빨간 칸으로 시작하지 않는다', async () => {
    await setup()
    // 새 비밀번호 칸의 도움말이 정책 문구와 같은 글자라, 오류 여부는 글자가 아니라 오류 상태로 잰다.
    expect(hasError('newPassword')).toBe(false)
    expect(hasError('confirmPassword')).toBe(false)
    expect(document.body.textContent).not.toContain('새 비밀번호가 서로 다릅니다.')
    await typeInto('newPassword', 'short')
    expect(hasError('newPassword')).toBe(true)
    await typeInto('confirmPassword', 'other')
    expect(hasError('confirmPassword')).toBe(true)
    expect(document.body.textContent).toContain('새 비밀번호가 서로 다릅니다.')
  })

  it('새 = 현재면 정책의 같음 문구', async () => {
    await setup()
    await fill('same-pass-1', 'same-pass-1')
    expect(document.body.textContent).toContain(policy.sameAsCurrentMessage)
    expect(submitButton().disabled).toBe(true)
  })

  it('조건을 다 채우기 전에는 버튼이 잠기고, 다 채우면 풀린다', async () => {
    await setup()
    expect(submitButton().disabled).toBe(true)
    await fill('old-pass-1', 'new-pass-1', 'new-pass-2')
    expect(submitButton().disabled).toBe(true)
    await typeInto('confirmPassword', 'new-pass-1')
    expect(submitButton().disabled).toBe(false)
  })
})

describe('PasswordChangeForm — 제출', () => {
  it('🔴 Enter 두 번에도 submit 은 한 번 — 처리 중에는 세 칸이 readonly(disabled 아님)', async () => {
    let release!: (ok: boolean) => void
    const submit = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)))
    await setup({ submit })
    await fill()
    form().dispatchEvent(new Event('submit'))
    form().dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith({
      currentPassword: 'old-pass-1',
      newPassword: 'new-pass-1',
    })
    expect(input('currentPassword').readOnly).toBe(true)
    expect(input('currentPassword').disabled).toBe(false)
    release(true)
    await flushPromises()
    expect(input('currentPassword').readOnly).toBe(false)
  })

  it('submit 이 true 면 세 칸을 비운다', async () => {
    await setup({ submit: vi.fn(async () => true) })
    await fill()
    form().dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(input('currentPassword').value).toBe('')
    expect(input('newPassword').value).toBe('')
    expect(input('confirmPassword').value).toBe('')
  })

  it('submit 이 false 면 값을 둔다', async () => {
    await setup({ submit: vi.fn(async () => false) })
    await fill()
    form().dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(input('newPassword').value).toBe('new-pass-1')
  })
})

describe('PasswordChangeForm — 서버 오류', () => {
  it('🔴 errors 를 칸 옆에 내고 첫 오류 칸(현재 우선)으로 포커스를 옮긴다', async () => {
    const { errors } = await setup()
    await fill()
    errors.value = {
      newPassword: ['새 비밀번호가 현재 비밀번호와 같습니다.'],
      currentPassword: ['현재 비밀번호가 올바르지 않습니다.'],
    }
    await flushPromises()
    expect(document.body.textContent).toContain('현재 비밀번호가 올바르지 않습니다.')
    expect(document.activeElement).toBe(input('currentPassword'))
  })

  it('새 비밀번호 오류만 있으면 새 칸으로 포커스', async () => {
    const { errors } = await setup()
    await fill()
    errors.value = { newPassword: ['서버가 거부한 이유'] }
    await flushPromises()
    expect(document.activeElement).toBe(input('newPassword'))
  })

  it('그 칸을 고치면 그 칸의 서버 오류를 숨긴다', async () => {
    const { errors } = await setup()
    await fill()
    errors.value = { currentPassword: ['현재 비밀번호가 올바르지 않습니다.'] }
    await flushPromises()
    await typeInto('currentPassword', 'old-pass-2')
    expect(document.body.textContent).not.toContain('현재 비밀번호가 올바르지 않습니다.')
  })

  it('submit 이 던지면 처리 중 표시를 풀고 오류를 다시 던진다', async () => {
    const boom = new Error('boom')
    const errorHandler = vi.fn()
    const submit = vi.fn(async () => {
      throw boom
    })
    wrapper = mount(
      defineComponent({
        setup: () => () => h(PasswordChangeForm as Component, { policy, submit }),
      }),
      { attachTo: document.body, global: { plugins: [vuetify], config: { errorHandler } } },
    )
    await flushPromises()
    await fill()
    form().dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(errorHandler).toHaveBeenCalledWith(boom, expect.anything(), expect.anything())
    expect(input('currentPassword').readOnly).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/password/password-change-form.render.test.ts`
Expected: FAIL — `Failed to resolve import "./PasswordChangeForm.vue"`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/components/password/PasswordChangeForm.vue`:

```vue
<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import { VBtn } from 'vuetify/components'
  import type { PasswordPolicy } from '@ssworks/admin-shared'
  import PasswordField from '../common/PasswordField.vue'

  // 정본: ssworks-gise-home apps/admin/src/pages/password.vue + hangang-home apps/admin/src/pages/account.vue
  // 바꾼 점:
  //  ① 페이지를 폼 컴포넌트로 — 화면 위치(전용 페이지 · 내 계정 카드 · 다이얼로그)는 템플릿이 고른다.
  //  ② 길이 숫자 · 문구를 admin-shared 정책 객체에서 받는다 — 서버 본문 검증과 같은 값이다(3c 결정 ⑧).
  //  ③ 요청 · 성공 뒤 처리(`/me` 재조회 · 이동)는 `submit` 을 넘긴 페이지가 한다. 페이지는
  //     `useWriteFlow({ gate: 'none', fields: ['currentPassword', 'newPassword'] })` 로 보낸다 — 재인증 관문을 쓰지
  //     않는다(본문이 이미 현재 비밀번호를 받는다, hangang).
  //  ④ gise 의 눈 토글 없는 칸 대신 킷 `PasswordField`(hangang).
  //
  // 🔴 제출 함수 첫 줄이 버튼과 같은 검사다 — `:disabled` 는 마우스만 막는다. Enter 두 번에도 요청은 한 번(gise).
  // 🔴 처리 중에는 `readonly` 다(`disabled` 아님) — 값과 포커스를 유지한다(gise).
  // 🔴 비밀번호 값은 이 컴포넌트 상태에만 있다. 성공하면 비운다.

  const props = withDefaults(
    defineProps<{
      policy: PasswordPolicy
      submit: (body: { currentPassword: string; newPassword: string }) => Promise<boolean>
      /** `useWriteFlow` 의 `fieldErrors` — `currentPassword` · `newPassword` 만 그린다 */
      errors?: Readonly<Record<string, readonly string[]>>
      /** 있으면 숨은 username 칸 — 비밀번호 관리자가 계정을 알아본다(gise) */
      userId?: string
      submitLabel?: string
    }>(),
    { errors: () => ({}), userId: undefined, submitLabel: '비밀번호 변경' },
  )

  const MISMATCH_MESSAGE = '새 비밀번호가 서로 다릅니다.'
  const FIELD_KEYS = ['currentPassword', 'newPassword'] as const

  const formEl = ref<HTMLFormElement | null>(null)
  const currentPassword = ref('')
  const newPassword = ref('')
  const confirmPassword = ref('')
  const pending = ref(false)
  /** 서버 오류를 숨긴 칸 — 사용자가 그 칸을 고치면 숨기고, 새 `errors` 가 오면 비운다 */
  const dismissed = ref(new Set<string>())

  const lengthOk = computed(
    () =>
      newPassword.value.length >= props.policy.minLength &&
      newPassword.value.length <= props.policy.maxLength,
  )
  const confirmOk = computed(() => confirmPassword.value === newPassword.value)
  const differs = computed(() => newPassword.value !== currentPassword.value)
  const canSubmit = computed(
    () =>
      !pending.value &&
      currentPassword.value !== '' &&
      lengthOk.value &&
      confirmOk.value &&
      differs.value,
  )

  function serverErrors(key: string): string[] {
    return dismissed.value.has(key) ? [] : [...(props.errors[key] ?? [])]
  }

  const currentErrors = computed(() => serverErrors('currentPassword'))
  const newErrors = computed(() => {
    const local: string[] = []
    if (newPassword.value !== '') {
      if (!lengthOk.value) local.push(props.policy.lengthMessage)
      else if (!differs.value) local.push(props.policy.sameAsCurrentMessage)
    }
    return [...local, ...serverErrors('newPassword')]
  })
  const confirmErrors = computed(() =>
    confirmPassword.value !== '' && !confirmOk.value ? [MISMATCH_MESSAGE] : [],
  )

  // 새 서버 오류가 오면 숨김을 풀고 첫 오류 칸(현재 → 새)으로 포커스를 옮긴다(gise).
  watch(
    () => props.errors,
    async (next) => {
      dismissed.value = new Set()
      const first = FIELD_KEYS.find((key) => (next[key]?.length ?? 0) > 0)
      if (first == null) return
      await nextTick()
      formEl.value?.querySelector<HTMLInputElement>(`input[name="${first}"]`)?.focus()
    },
  )
  watch(currentPassword, () => {
    dismissed.value.add('currentPassword')
  })
  watch(newPassword, () => {
    dismissed.value.add('newPassword')
  })

  async function onSubmit(): Promise<void> {
    if (!canSubmit.value) return
    pending.value = true
    try {
      const ok = await props.submit({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      })
      if (ok) {
        currentPassword.value = ''
        newPassword.value = ''
        confirmPassword.value = ''
      }
    } finally {
      pending.value = false
    }
  }
</script>

<template>
  <form ref="formEl" class="password-change-form" novalidate @submit.prevent="onSubmit">
    <input
      v-if="userId"
      autocomplete="username"
      hidden
      name="username"
      readonly
      type="text"
      :value="userId"
    />
    <PasswordField
      v-model="currentPassword"
      autocomplete="current-password"
      :error-messages="currentErrors"
      label="현재 비밀번호"
      name="currentPassword"
      :readonly="pending"
    />
    <PasswordField
      v-model="newPassword"
      autocomplete="new-password"
      :error-messages="newErrors"
      :hint="policy.lengthMessage"
      label="새 비밀번호"
      name="newPassword"
      persistent-hint
      :readonly="pending"
    />
    <PasswordField
      v-model="confirmPassword"
      autocomplete="new-password"
      :error-messages="confirmErrors"
      label="새 비밀번호 확인"
      name="confirmPassword"
      :readonly="pending"
    />
    <VBtn block :disabled="!canSubmit" :loading="pending" type="submit">{{ submitLabel }}</VBtn>
  </form>
</template>

<style scoped>
  .password-change-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
```

`packages/admin-ui/src/index.ts` 의 `세션 · 비밀번호` 절에 추가:

```ts
export { default as PasswordChangeForm } from './components/password/PasswordChangeForm.vue'
```

> `dismissed` 는 `ref(new Set())` 다 — Vue 3 는 Set 을 반응형 컬렉션으로 감싸 `.add` 를 추적한다. 새 `errors` 가 오면 `new Set()` 으로 통째로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/password/password-change-form.render.test.ts`
Expected: PASS (12 tests)

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm lint && pnpm --filter @ssworks/admin-ui test`
Expected: 오류 없음, 전체 통과

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/components/password/PasswordChangeForm.vue packages/admin-ui/src/components/password/password-change-form.render.test.ts packages/admin-ui/src/index.ts
git add packages/admin-ui/src/components/password/PasswordChangeForm.vue packages/admin-ui/src/components/password/password-change-form.render.test.ts packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): PasswordChangeForm — 정책 검증 · 이중 제출 방지 · readonly · 필드 오류 포커스

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: README · changeset · 문서 · 전체 검증

**Files:**

- Modify: `packages/admin-ui/README.md` (API 표 행 추가, 새 `## 세션 · 비밀번호` 절)
- Create: `.changeset/admin-ui-sessions-passwords.md`
- Modify: `CLAUDE.md` (진행표) · `docs/HANDOFF.md` · `docs/01-phase0.md` (§8)

**Interfaces:**

- Consumes: Task 1~7 의 공개 API 이름 그대로.

- [ ] **Step 1: README API 표**

`packages/admin-ui/README.md` 의 기존 API 표(3b 에서 `PermissionMatrix` · `useRoleEditor` · `SettingsShell` 행을 더한 표)에 같은 형식으로 행을 더한다: `SessionTable`(+ `SessionTableRow`) · `useSessions`(+ `Sessions` · `UseSessionsOptions` · `SessionTableBindings` · `SessionMessages` · `SessionDialogText` · `SessionAction` · `SessionRevokedEvent`) · `TemporaryPasswordDialog` · `PasswordChangeForm` · `copyText`(+ `CopyResult`). `AdminUserInfo` 행이 있으면 `isPasswordChangeRequired?` 를 적는다. 표의 열 · 말투는 기존 행을 따른다.

- [ ] **Step 2: README `## 세션 · 비밀번호` 절**

파일 끝(`## 역할 · 설정` 절 뒤)에 추가:

````md
## 세션 · 비밀번호

### 내 세션

```ts
const mine = useSessions({
  list: () => api.get<{ items: AdminSession[] }>('/sessions/me').then((r) => r.items),
  revoke: (row) => api.del(`/sessions/me/${row.sessionNo}`),
  revokeOthers: () => api.post<AdminSessionRevokeResult>('/sessions/me/revoke-others'),
  onRevoked: ({ action, revokedCount }) =>
    toast.success(
      action === 'revokeOthers' && revokedCount != null
        ? `다른 세션 ${revokedCount}개를 끝냈습니다.`
        : '세션을 끝냈습니다.',
    ),
})
```

```vue
<SessionTable v-bind="mine.table.value" />
<VBtn
  :disabled="!mine.canRevokeOthers.value"
  @click="mine.revokeOthers()"
>다른 세션 모두 끝내기</VBtn>
<ConfirmDialog v-bind="mine.confirmDialog.value" />
```

### 관리자 전체 목록

```ts
const applied = ref({ keyword: '' })
const all = useSessions({
  fetch: (params) => api.get<Paginated<AdminSessionListItem>>('/sessions', { params }),
  filters: () => ({ keyword: applied.value.keyword || undefined }),
  revoke: (row) => api.del(`/sessions/${row.sessionNo}`),
  revokeUser: (row) => api.del<AdminSessionRevokeResult>(`/sessions/user/${row.userNo}`),
  canWrite: () => check.hasPermission(PERMISSIONS.SESSIONS_WRITE),
  onSelfSignedOut: async () => {
    appStore.clearSession()
    await router.replace('/login')
  },
})
```

```vue
<SessionTable v-bind="all.table.value" show-user show-login-at />
<ConfirmDialog v-bind="all.confirmDialog.value" />
```

- 🔴 지금 쓰는 세션 행에는 "끝내기" 가 없다 — 로그아웃 버튼이 정상 경로다. 서버도 거부해야 한다.
- 내 계정 전체 끊기는 1인칭 경고로 확인받고, 성공하면 재조회 대신 `onSelfSignedOut` 을 부른다.
- 성공 문구는 `onRevoked` 로 화면이 띄운다. 서버가 `revokedCount` 를 주지 않으면 개수를 지어내지 않는다.
- 계정별 세션 다이얼로그는 `BaseDialog` 안에 `SessionTable` + `useSessions({ list, immediate: false })` 를 두고 열 때 `reload()` 한다. 내 계정 · 상위 계정 행의 버튼을 막는 판단은 사용자 목록 화면의 몫이다.

### 임시 비밀번호

```ts
const issued = ref<string | null>(null)
async function resetPassword(user: UserRow) {
  if (user.userId === me.value?.userId) return // 자기 계정 초기화는 막는다 — 비밀번호 변경 화면이 정규 경로다
  await run({
    gate: 'reauth', // 또는 { gate: 'confirm', reversible: false } — 프로젝트 정책
    message: `「${user.userName}」의 비밀번호를 임시 비밀번호로 바꾸고 접속 세션을 모두 끊습니다.`,
    action: ({ currentPassword }) =>
      api.post<AdminTemporaryPassword>(`/users/${user.userNo}/password-reset`, { currentPassword }),
    onSuccess: (r) => {
      issued.value = r.temporaryPassword
      void reload()
    },
  })
}
```

```vue
<TemporaryPasswordDialog v-model="issued" mode="reset" :target="target" sessions-revoked />
```

- 🔴 `v-model` 이 곧 값이다 — 닫으면 `null` 이 되어 값이 남지 않는다. 값을 다른 상태에 복사해 두지 않는다.
- 🔴 초기화 뒤에 세션 끊기 API 를 또 부르지 않는다 — 서버가 같은 트랜잭션에서 이미 끊었고, 또 부르면 일어나지 않은 강제 종료가 감사 로그에 남는다.
- 복사 결과는 다이얼로그 안에 나온다. 클립보드를 못 쓰는 사내 http 주소에서도 값은 화면에 글자로 남는다.

### 비밀번호 변경 · 강제 변경

```ts
// 프로젝트 shared 패키지에서 한 번 정의해 서버와 화면이 같이 쓴다
export const passwordPolicy = definePasswordPolicy() // 기본 8 · 200

const { run, fieldErrors } = useWriteFlow()
const submit = (body: { currentPassword: string; newPassword: string }) =>
  run({
    action: () => api.patch('/auth/password', body),
    fields: ['currentPassword', 'newPassword'], // 🔴 재인증 관문을 쓰지 않는다 — 본문이 이미 현재 비밀번호를 받는다
    onSuccess: async () => {
      await appStore.refresh() // 🔴 강제 변경 표시를 서버 값으로 되돌린다
      toast.success('비밀번호를 바꿨습니다.')
      await router.replace(safeRedirect(route.query.redirect))
    },
  })
```

```vue
<PasswordChangeForm
  :policy="passwordPolicy"
  :submit="submit"
  :errors="fieldErrors"
  :user-id="me?.userId"
/>
```

```ts
createAdminGuard({
  // …
  isPasswordChangeRequired: () => appStore.userInfo?.isPasswordChangeRequired === true,
  paths: { passwordChange: '/password' },
})
```

- 서버는 본문을 `passwordPolicy.changePasswordSchema` 로 검증하고, 틀린 현재 비밀번호를 `ERR_COMMON_VALIDATION` + `details.issues[{ path: ['currentPassword'] }]` 로 보낸다 — 폼은 그 칸 옆에 낸다.
- 강제 변경 화면(auth 레이아웃, "임시 비밀번호로 로그인했습니다" 안내, 변경 필요 상태에서 돌아가기 숨김, 로그아웃 버튼)은 템플릿이 조립한다.
````

- [ ] **Step 3: changeset**

`.changeset/admin-ui-sessions-passwords.md`:

```md
---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

PR #3c — 세션 · 비밀번호.

- admin-shared 새 API: `adminSessionSchema` · `adminSessionListItemSchema` · `adminSessionRevokeResultSchema`, `describeUserAgent()`, `definePasswordPolicy()`(기본 8 · 200자, `changePasswordSchema` 는 새 = 현재를 `newPassword` 경로 오류로), `adminTemporaryPasswordSchema`.
- admin-ui 새 API: `SessionTable` · `useSessions`(전량 · 서버 페이징, 끝내기 · 다른 세션 모두 · 사용자 전체) · `TemporaryPasswordDialog`(`v-model` 이 곧 값) · `PasswordChangeForm` · `copyText`.
- `AdminUserInfo.isPasswordChangeRequired?` — `createAdminGuard({ isPasswordChangeRequired })` 에 잇는다.
- 서버 계약: 세션 행의 `isCurrent` · `lastAccessAt` · `userAgent`, 현재 세션은 목록에서 끊지 못함, 임시 비밀번호 응답 키 `temporaryPassword`, 틀린 현재 비밀번호는 `ERR_COMMON_VALIDATION` + `currentPassword` 경로.
```

- [ ] **Step 4: 진행 문서**

`CLAUDE.md` 진행표에서

```md
| **Phase 1 PR #3c~3e — 계정·세션 / 조직(he-tree) / 약관(CodeMirror)** | **다음** | 3a 스펙 §2-1 · `docs/phase0-reports/fe-pages.md` §2 |
```

행(정렬 공백은 현재 파일 그대로 찾을 것)을 다음 두 행으로 바꾼다(정렬은 Step 5 의 prettier 가 맞춘다):

```md
| Phase 1 PR #3c — `SessionTable` · `useSessions` · `TemporaryPasswordDialog` · `PasswordChangeForm` · 세션 스키마 · 비밀번호 정책 | 완료 | 스펙 `docs/superpowers/specs/2026-10-06-admin-ui-sessions-passwords-design.md` · 플랜 `docs/superpowers/plans/2026-10-06-admin-ui-sessions-passwords.md` |
| **Phase 1 PR #3d~3e — 조직(he-tree) / 약관(CodeMirror)** | **다음** | 3a 스펙 §2-1 · `docs/phase0-reports/fe-pages.md` §2 |
```

`docs/HANDOFF.md`:

- `@ssworks/admin-ui` 행: 3b 문장 뒤에 `**PR #3c**(\`SessionTable\` · \`useSessions\` · \`TemporaryPasswordDialog\` · \`PasswordChangeForm\` · \`copyText\`)는 \`feat/admin-ui-sessions-passwords\` 에서 구현 완료.` 를 더하고, 행의 admin-ui 테스트 수를 Step 5 의 수로 바꾼다.
- `@ssworks/admin-shared` 행의 테스트 수를 Step 5 의 수로 바꾼다.
- "다음 플랜" 행을 `PR #3d(조직 — \`TeamTree\` · \`TeamUserList\` · \`flattenTeamTree\` · \`useTeamTree\`, he-tree 필수 peer). 직전 PR #3c: 스펙 \`docs/superpowers/specs/2026-10-06-admin-ui-sessions-passwords-design.md\` · 플랜 \`docs/superpowers/plans/2026-10-06-admin-ui-sessions-passwords.md\`` 로 바꾼다.
- "첫 세션에서 할 일" 3번 끝의 `— **PR #3a · #3b 완료**, 다음은 **PR #3c**(…)` 를 `— **PR #3a · #3b · #3c 완료**, 다음은 **PR #3d**(\`docs/phase0-reports/fe-pages.md\` §2).` 로 바꾼다.

`docs/01-phase0.md` §8:

- `@ssworks/admin-ui` 셀 끝에 `**PR #3c 완료**(브랜치 \`feat/admin-ui-sessions-passwords\`) — \`SessionTable\` · \`useSessions\` · \`TemporaryPasswordDialog\` · \`PasswordChangeForm\` · \`copyText\`, admin-shared 세션 스키마 · \`describeUserAgent\` · 비밀번호 정책. 누적 **<N> 테스트**(admin-ui)` 를 더한다. admin-shared 행(또는 셀)의 테스트 수도 Step 5 의 수로 맞춘다.
- `다음: admin-ui PR #3c(계정·세션), 3d(조직), 3e(약관), 그 뒤 admin-server.` 를 `다음: admin-ui PR #3d(조직), 3e(약관), 그 뒤 admin-server.` 로 바꾼다.

세 문서의 테스트 수는 서로 같아야 하고 Step 5 의 `pnpm check` 출력과 같아야 한다.

- [ ] **Step 5: 전체 검증 · 테스트 수 채우기**

Run: `pnpm check`
Expected: lint → typecheck → test → build 모두 초록. 패키지별 `Tests  N passed` 에서 admin-shared · admin-ui 수를 읽어 Step 4 의 `<N>` 자리에 채운다.

Run: `pnpm exec prettier --write packages/admin-ui/README.md .changeset/admin-ui-sessions-passwords.md CLAUDE.md docs/HANDOFF.md docs/01-phase0.md`
Run: `pnpm exec prettier --check packages docs .changeset CLAUDE.md`
Expected: 초록(저장소 `format:check` 는 git 무시 폴더 `.superpowers/` 의 임시 파일까지 보니 거기 실패만 있으면 무시한다)

- [ ] **Step 6: 스모크**

`.claude/commands/smoke.md` 절차를 따른다. 임시 소비 앱은 짧은 실제 경로(`%TEMP%` 바로 아래, 예 `C:\Users\kim52\AppData\Local\Temp\aks3c`)에 만들고(긴 경로는 pnpm 12 설치가 os error 3 으로 실패) `vue-router` · `pinia` 도 의존에 넣는다. `App.vue`(또는 컴포넌트 몇 개)에서 이번 새 export — `SessionTable` · `useSessions`(전량 · 서버 페이징 둘 다, 타입이 맞는 가짜 어댑터) · `TemporaryPasswordDialog` · `PasswordChangeForm` · `copyText`, admin-shared 의 `adminSessionSchema` · `adminSessionListItemSchema` · `adminSessionRevokeResultSchema` · `describeUserAgent` · `definePasswordPolicy` · `adminTemporaryPasswordSchema` 와 타입 — 을 한 번씩 쓰고, 기존 export 도 명령 문서대로 참조한다. `vue-tsc --noEmit` · `vite build` 둘 다 통과해야 한다. 끝나면 임시 폴더를 `node -e "require('fs').rmSync(…, { recursive: true, force: true })"` 로 지운다. 저장소에 아무것도 남기지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-ui/README.md .changeset/admin-ui-sessions-passwords.md CLAUDE.md docs/HANDOFF.md docs/01-phase0.md
git commit -m "docs: PR #3c — README 세션 · 비밀번호 절, changeset, 진행 문서

Co-Authored-By: Claude <noreply@anthropic.com>"
```
