# admin-ui 역할 · 설정 (PR #3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin-shared 에 역할 코어 스키마를, admin-ui 에 `PermissionMatrix` · `useRoleEditor` · `SettingsShell` · 앱 스토어 `refresh()` 를 넣고, `useWriteFlow` 의 검증 오류 처리됨 판정(`fields`)과 언마운트 중 재인증이 멈추는 결함을 고친다.

**Architecture:** 권한 배열 규칙(정렬 · 함의 닫힘 · 토글)은 순수 함수(`role-permissions.ts`)다. `PermissionMatrix` 는 칸 하나만 토글하는 표시 컴포넌트이고, `useRoleEditor` 가 함의 · 전체 권한 · 권한 상승 방지를 판정해 `v-bind` 용 바인딩(`matrix`)으로 넘긴다. 쓰기는 `useRoleEditor` 안의 `useWriteFlow` 하나를 거친다. `SettingsShell` 은 vue-router 의 `matchedRouteKey` 로 자기 라우트 레코드를 읽어 자식 `meta` 에서 메뉴를 만든다.

**Tech Stack:** Vue 3.5 · Vuetify 4 · vue-router 4.6 · pinia · zod 4.6 · vitest 4 + happy-dom · @vue/test-utils · pnpm 12

**Spec:** `docs/superpowers/specs/2026-10-04-admin-ui-roles-settings-design.md`

## Global Constraints

- 새 의존 없음. admin-ui 소스가 import 하는 외부 패키지는 `vue` · `vue-router` · `vuetify` · `pinia` · `@ssworks/admin-shared` · `axios` 뿐이다(`peer-deps.test.ts` 가 막는다). admin-shared 는 `zod` 만.
- `import type` 을 분리한다(eslint `consistent-type-imports`). 내부 상대 import 는 `.js` 확장자(`./role-permissions.js`). `.vue` 는 그대로.
- SFC 는 Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import 한다. 스타일은 `<style scoped>` 순수 CSS.
- `console.log` 금지 — `console.warn` · `console.error` 만.
- 정본에서 가져온 파일은 머리 주석에 `정본: <프로젝트> <경로>` 와 `바꾼 점:` 을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 반환 형태는 ref 묶음이다. `reactive()` 로 감싸 돌려주지 않는다. 바인딩 객체(`matrix` · `confirmDialog` · `reauthDialog`)는 `ComputedRef`.
- 테스트: DOM 이 필요한 파일 머리에 `// @vitest-environment happy-dom`. VDialog 를 여는 테스트는 모듈 최상단에서 `installVisualViewport()`. `data-testid` 를 심지 않는다 — 글자 · `name` · `aria-label` 로 찾는다.
- 테스트 공용 하네스는 `packages/admin-ui/src/test/` 에 둔다(빌드 · d.ts 에서 빠진다).
- admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 돌려야 admin-ui 에 보인다(admin-ui 는 `dist/` 를 import 한다).
- 포맷: prettier(세미콜론 없음 · 작은따옴표 · 100자). 커밋 전 `pnpm exec prettier --write <파일들>`.
- Windows 에서도 돈다 — `/dev/null` 금지, 셸 명령 대신 `pnpm` 명령을 쓴다.
- 커밋 메시지: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`.
- 테스트 실행은 저장소 루트에서 `pnpm exec vitest run <경로>`.
- 역할 용어는 패키지 기본 문구에서 "역할" 이다(프로젝트 용어는 `dialogText` 로 바꾼다).

## 스펙과 다르게 구현하는 세부 (Task 9 에서 스펙 §11 에 기록)

- **R1** — zod 4.6.5 에서 refinement 가 있는 객체 스키마의 `.extend()` 는 동작하고, 던지는 것은 `.omit()` · `.pick()` 이다(플랜 작성 중 실측). 스펙 §4-1 의 근거 문장은 플랜 작성 시 이미 고쳤다. 결론("refine 을 걸지 않는다")은 같다.
- **R2** — `joinPath` 를 `menu.ts` 에서 export 한다(패키지 내부용, `index.ts` 에는 올리지 않는다). `SettingsShell` 이 `buildMenu` 와 같은 경로 규칙을 쓰기 위해서다.

## Review Focus

- **`'*'` 역할을 `'*'` 없는 행위자가 열고 이름만 고침** — 매트릭스는 잠기고, 저장 본문에 `permissions` 가 실리지 않아야 한다(실리면 서버 권한 상승 검사에 403) → Task 6 · Task 7 테스트.
- **저장 직후 같은 화면에서 다시 저장** — 성공 뒤 재선택이 새 `revision` 을 쥐지 않으면 두 번째 저장이 거짓 충돌이 된다 → Task 7 테스트.
- **관문 다이얼로그 취소** — 요청이 안 나갔으니 재조회도 없고 폼이 그대로여야 한다 → Task 7 테스트.
- **설정 자식 → 부모 재진입** — 셸은 다시 마운트되지 않는다. 오른쪽이 빈 채 남으면 안 된다 → Task 8 테스트.
- **재인증 요청이 나간 동안 화면이 사라짐** — `await run()` 이 영구히 멈추면 안 된다 → Task 2 테스트.
- **`displayOrder` 에 구멍(1 → 3)** — 이동 목표가 ±1 이면 서버가 200 을 주고도 안 움직인다 → Task 7 테스트.

---

### Task 1: admin-shared 역할 스키마

**Files:**

- Create: `packages/admin-shared/src/roles.ts`
- Create: `packages/admin-shared/src/roles.test.ts`
- Modify: `packages/admin-shared/src/index.ts` (끝에 export 블록 추가)

**Interfaces:**

- Produces: `adminRoleSchema` · `adminRoleCreateSchema` · `adminRoleUpdateSchema` · `adminRoleMoveSchema` · `adminRoleRemoveSchema` 와 타입 `AdminRole` · `AdminRoleCreate` · `AdminRoleUpdate` · `AdminRoleMove` · `AdminRoleRemove`. `AdminRole = { roleNo: bigint; roleName: string; displayOrder: number; isDefault: boolean; permissions: string[]; revision: number }`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-shared/src/roles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { definePermissions } from './permissions.js'
import {
  adminRoleCreateSchema,
  adminRoleMoveSchema,
  adminRoleRemoveSchema,
  adminRoleSchema,
  adminRoleUpdateSchema,
} from './roles.js'

const WITHOUT_REVISION = {
  roleNo: 1n,
  roleName: '운영자',
  displayOrder: 0,
  isDefault: false,
  permissions: ['org.users:read'],
}
const ROLE = { ...WITHOUT_REVISION, revision: 3 }

describe('adminRoleSchema', () => {
  it('공통 필드와 revision 을 받는다', () => {
    expect(adminRoleSchema.parse(ROLE)).toEqual(ROLE)
  })

  it('🔴 revision 이 없으면 거부한다 — 쓰기 보호 기본(Phase 0 §4)', () => {
    expect(adminRoleSchema.safeParse(WITHOUT_REVISION).success).toBe(false)
  })

  it('roleName 은 1~64자다', () => {
    expect(adminRoleSchema.safeParse({ ...ROLE, roleName: '' }).success).toBe(false)
    expect(adminRoleSchema.safeParse({ ...ROLE, roleName: 'a'.repeat(64) }).success).toBe(true)
    expect(adminRoleSchema.safeParse({ ...ROLE, roleName: 'a'.repeat(65) }).success).toBe(false)
  })

  it('roleNo 는 bigint 다 — 와이어의 "BigInt(n)" 래퍼를 parseJSON 이 되살린 값', () => {
    expect(adminRoleSchema.safeParse({ ...ROLE, roleNo: 1 }).success).toBe(false)
  })

  it('🔴 프로젝트가 permissions 를 좁히고 필드를 덜어 낼 수 있다 — refine 이 없어야 한다', () => {
    const catalog = definePermissions({ USERS_READ: 'org.users:read' })
    const narrowed = adminRoleSchema.extend({ permissions: catalog.permissionListSchema })
    expect(narrowed.safeParse(ROLE).success).toBe(true)
    expect(narrowed.safeParse({ ...ROLE, permissions: ['nope:read'] }).success).toBe(false)
    expect(adminRoleSchema.omit({ revision: true }).parse(WITHOUT_REVISION)).toEqual(
      WITHOUT_REVISION,
    )
  })
})

describe('역할 본문 스키마', () => {
  it('만들기는 roleName · isDefault · permissions 다', () => {
    const body = { roleName: '감사', isDefault: false, permissions: [] }
    expect(adminRoleCreateSchema.parse(body)).toEqual(body)
    expect(adminRoleCreateSchema.safeParse({ roleName: '감사' }).success).toBe(false)
  })

  it('수정은 필드가 모두 선택이고 revision 만 필수다', () => {
    expect(adminRoleUpdateSchema.parse({ revision: 0 })).toEqual({ revision: 0 })
    expect(adminRoleUpdateSchema.parse({ roleName: '감사', revision: 2 })).toEqual({
      roleName: '감사',
      revision: 2,
    })
    expect(adminRoleUpdateSchema.safeParse({ roleName: '감사' }).success).toBe(false)
  })

  it('🔴 이동 본문에는 revision 이 없다 — 순서는 내용이 아니다(스펙 D1)', () => {
    expect(adminRoleMoveSchema.parse({ displayOrder: 2, revision: 1 })).toEqual({
      displayOrder: 2,
    })
    expect(adminRoleMoveSchema.safeParse({ displayOrder: -1 }).success).toBe(false)
  })

  it('삭제 본문은 revision 하나다', () => {
    expect(adminRoleRemoveSchema.parse({ revision: 5 })).toEqual({ revision: 5 })
    expect(adminRoleRemoveSchema.safeParse({}).success).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-shared/src/roles.test.ts`
Expected: FAIL — `Failed to resolve import "./roles.js"`

- [ ] **Step 3: 구현**

`packages/admin-shared/src/roles.ts`:

```ts
import { z } from 'zod'

// 역할(직책) 코어 계약 — Phase 2 서버와 admin-ui `useRoleEditor` 가 같은 모양을 본다.
//
// 정본: ssworks-gise-home 역할 DTO(revision 낙관적 잠금) · hangang-home apps/admin/src/api/roles.api.ts
//       (공통 필드 · 이동 본문 분리)
// 바꾼 점:
//  - 네 프로젝트 공통 필드 + gise `revision` 만 둔다. `createAt` · `updateAt` · gise `userCount` 는 화면이 쓰지
//    않으므로 소비자가 `.extend()` 로 더한다.
//  - 🔴 `permissions` 는 `string[]` 이다. 프로젝트가 `.extend({ permissions: permissionListSchema })` 로 좁힌다 —
//    패키지는 권한 키를 모른다.
//  - 🔴 `.refine()` 을 걸지 않는다. zod 4 는 refinement 가 있는 객체 스키마의 `.omit()` · `.pick()` 을 던진다
//    (4.6.5 실측). 그러면 프로젝트가 필드를 덜어 낼 수 없고, `revision` 을 끄는 경로(`.omit({ revision: true })`)
//    도 막힌다. "수정할 값이 없다" 검사는 서버가 원하면 따로 건다.
//
// 🔴 `'*'`(전체 권한)는 `permissions` 안에서 정확히 `['*']` 하나로만 쓴다. 스키마는 강제하지 않고 서버 정규화가
//    맡는다(hangang `permissions.normalize.ts` 규칙 ①).

/** hangang `maxlength` 64. Phase 2 컬럼 길이와 맞춘다. */
const roleNameSchema = z.string().min(1).max(64)
/** 🔴 Phase 0 §4 "쓰기 보호는 revision 기본". 수정 · 삭제 성공마다 서버가 올린다. 이동은 올리지 않는다. */
const revisionSchema = z.number().int().min(0)

export const adminRoleSchema = z.object({
  roleNo: z.bigint(),
  roleName: roleNameSchema,
  displayOrder: z.number().int().min(0),
  isDefault: z.boolean(),
  permissions: z.array(z.string()),
  revision: revisionSchema,
})

export const adminRoleCreateSchema = z.object({
  roleName: roleNameSchema,
  isDefault: z.boolean(),
  permissions: z.array(z.string()),
})

/** 부분 갱신. 🔴 `revision` 만 필수다 — 낙관적 잠금은 끄는 경로가 없다(3b 스펙 §2-1). */
export const adminRoleUpdateSchema = z.object({
  roleName: roleNameSchema.optional(),
  isDefault: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
  revision: revisionSchema,
})

/**
 * 🔴 `revision` 이 없다 — 순서는 내용이 아니다. 이동이 `revision` 을 올리면 남이 순서만 바꿔도 편집 중인 사람의
 *    저장이 충돌로 떨어진다(3b 스펙 D1). 서버는 이웃의 `displayOrder` 를 목표로 받아 구간을 재번호한다.
 */
export const adminRoleMoveSchema = z.object({ displayOrder: z.number().int().min(0) })

export const adminRoleRemoveSchema = z.object({ revision: revisionSchema })

export type AdminRole = z.infer<typeof adminRoleSchema>
export type AdminRoleCreate = z.infer<typeof adminRoleCreateSchema>
export type AdminRoleUpdate = z.infer<typeof adminRoleUpdateSchema>
export type AdminRoleMove = z.infer<typeof adminRoleMoveSchema>
export type AdminRoleRemove = z.infer<typeof adminRoleRemoveSchema>
```

`packages/admin-shared/src/index.ts` 끝(`pagination.js` export 블록 뒤)에 추가:

```ts
export {
  adminRoleSchema,
  adminRoleCreateSchema,
  adminRoleUpdateSchema,
  adminRoleMoveSchema,
  adminRoleRemoveSchema,
  type AdminRole,
  type AdminRoleCreate,
  type AdminRoleUpdate,
  type AdminRoleMove,
  type AdminRoleRemove,
} from './roles.js'
```

- [ ] **Step 4: 통과 확인 · 빌드**

Run: `pnpm exec vitest run packages/admin-shared/src/roles.test.ts`
Expected: PASS (9 tests)

Run: `pnpm --filter @ssworks/admin-shared typecheck && pnpm --filter @ssworks/admin-shared build`
Expected: 오류 없음. `packages/admin-shared/dist/roles.d.ts` 가 생긴다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/roles.ts packages/admin-shared/src/roles.test.ts packages/admin-shared/src/index.ts
git add packages/admin-shared/src/roles.ts packages/admin-shared/src/roles.test.ts packages/admin-shared/src/index.ts
git commit -m "feat(admin-shared): 역할 코어 스키마 — revision 필수, 이동은 revision 무관

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `useWriteFlow` — `fields` · `currentPassword` · 해제 뒤 처리됨 금지

**Files:**

- Modify: `packages/admin-ui/src/composables/useWriteFlow.ts`
- Modify: `packages/admin-ui/src/composables/useWriteFlow.render.test.ts`
- Modify: `packages/admin-ui/src/wiring.integration.test.ts` (D3 테스트의 첫 `run`)

**Interfaces:**

- Produces: `WriteRunOptions<T>` 의 모든 갈래에 `fields?: readonly string[]`. 검증 오류(`ERR_COMMON_VALIDATION`)는 `fieldErrors` 를 늘 채우고, 키가 하나 이상이며 전부 `fields` 안일 때만 `handled`. 재인증 관문이 열려 있고 `currentPassword` 키가 있으면 그 문구가 `reauthDialog.error` 로 가고 다이얼로그가 유지된다. 스코프 해제 뒤 도착한 실패는 `handled` 가 아니고 `onConflict` 도 불리지 않는다.

- [ ] **Step 1: 기존 테스트를 새 계약으로 고치고 실패 테스트 추가**

`useWriteFlow.render.test.ts` 의 `'검증 실패는 fieldErrors 를 채우고 handled, 다이얼로그를 닫고 false'` 테스트를 다음으로 바꾼다(제목과 `run` 옵션의 `fields` 만 바뀐다):

```ts
it('검증 실패 — 키가 전부 fields 안이면 fieldErrors 를 채우고 handled, 다이얼로그를 닫고 false', async () => {
  const flow = await setup()
  const failure = apiError('ERR_COMMON_VALIDATION', {
    issues: [{ path: ['userId'], message: '이미 쓰는 아이디입니다' }],
  })
  const pending = flow.run({
    gate: 'reauth',
    action: vi.fn().mockRejectedValue(failure),
    fields: ['userId'],
  })
  await flushPromises()
  await typePassword('pw')
  await click('확인')
  expect(await pending).toBe(false)
  expect(flow.fieldErrors.value).toEqual({ userId: ['이미 쓰는 아이디입니다'] })
  expect(failure.handled).toBe(true)
  expect(flow.reauthDialog.value.modelValue).toBe(false)
})
```

같은 파일의 `describe('useWriteFlow — 결과 분류', …)` 뒤에 새 describe 를 추가한다:

```ts
describe('useWriteFlow — 검증 오류와 fields', () => {
  const validation = (...issues: { path: (string | number)[]; message: string }[]) =>
    apiError('ERR_COMMON_VALIDATION', { issues })

  it('🔴 fields 를 안 주면 fieldErrors 는 채우되 handled 가 아니다 — 전역 토스트가 알린다', async () => {
    const flow = await setup()
    const failure = validation({ path: ['roleName'], message: '이미 있는 이름입니다' })
    expect(await flow.run({ action: vi.fn().mockRejectedValue(failure) })).toBe(false)
    expect(flow.fieldErrors.value).toEqual({ roleName: ['이미 있는 이름입니다'] })
    expect(failure.handled).toBe(false)
  })

  it('키가 하나라도 fields 밖이면 handled 가 아니다 — fieldErrors 는 둘 다 채운다', async () => {
    const flow = await setup()
    const failure = validation(
      { path: ['roleName'], message: 'a' },
      { path: ['memo'], message: 'b' },
    )
    await flow.run({ action: vi.fn().mockRejectedValue(failure), fields: ['roleName'] })
    expect(flow.fieldErrors.value).toEqual({ roleName: ['a'], memo: ['b'] })
    expect(failure.handled).toBe(false)
  })

  it('루트 오류(path [])의 키는 빈 문자열이다 — fields 에 없으면 handled 가 아니다', async () => {
    const flow = await setup()
    const failure = validation({ path: [], message: '본문이 비었습니다' })
    await flow.run({ action: vi.fn().mockRejectedValue(failure), fields: ['roleName'] })
    expect(flow.fieldErrors.value).toEqual({ '': ['본문이 비었습니다'] })
    expect(failure.handled).toBe(false)
  })

  it('🔴 접두만 일치하면 덮지 않는다 — fields 의 permissions 는 permissions.3 을 처리하지 않는다', async () => {
    const flow = await setup()
    const failure = validation({ path: ['permissions', 3], message: '모르는 권한' })
    await flow.run({ action: vi.fn().mockRejectedValue(failure), fields: ['permissions'] })
    expect(flow.fieldErrors.value).toEqual({ 'permissions.3': ['모르는 권한'] })
    expect(failure.handled).toBe(false)
  })

  it('🔴 재인증 관문의 currentPassword 오류는 다이얼로그 안에 보이고 다이얼로그를 유지한다 — 다시 입력하면 이어서 성공', async () => {
    const flow = await setup()
    const failure = validation({ path: ['currentPassword'], message: '256자 이하로 입력하세요' })
    const action = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined)
    const pending = flow.run({ gate: 'reauth', action, fields: ['roleName'] })
    await flushPromises()
    await typePassword('pw')
    await click('확인')
    expect(flow.reauthDialog.value.modelValue).toBe(true)
    expect(flow.reauthDialog.value.error).toBe('256자 이하로 입력하세요')
    expect(document.body.textContent).toContain('256자 이하로 입력하세요')
    expect(flow.fieldErrors.value).toEqual({})
    expect(failure.handled).toBe(true)
    await typePassword('right')
    await click('확인')
    expect(await pending).toBe(true)
  })

  it('currentPassword 와 함께 온 나머지 키는 fieldErrors 로 — 전부 fields 안이면 handled, 밖이면 아니다', async () => {
    const flow = await setup()
    const inside = validation(
      { path: ['currentPassword'], message: 'p' },
      { path: ['roleName'], message: 'n' },
    )
    const first = flow.run({
      gate: 'reauth',
      action: vi.fn().mockRejectedValue(inside),
      fields: ['roleName'],
    })
    await flushPromises()
    await typePassword('pw')
    await click('확인')
    expect(flow.fieldErrors.value).toEqual({ roleName: ['n'] })
    expect(inside.handled).toBe(true)
    await click('취소')
    expect(await first).toBe(false)

    const outside = validation(
      { path: ['currentPassword'], message: 'p' },
      { path: ['memo'], message: 'm' },
    )
    const second = flow.run({
      gate: 'reauth',
      action: vi.fn().mockRejectedValue(outside),
      fields: ['roleName'],
    })
    await flushPromises()
    await typePassword('pw')
    await click('확인')
    expect(flow.reauthDialog.value.modelValue).toBe(true)
    expect(outside.handled).toBe(false)
    await click('취소')
    expect(await second).toBe(false)
  })
})
```

같은 파일 `describe('useWriteFlow — 막히지 않는 흐름', …)` 의 마지막 테스트 뒤에 추가한다(그 describe 안의 `settledOrStuck` 를 쓴다):

```ts
it('🔴 재인증 요청이 나간 동안 언마운트된 뒤 ERR_REAUTH_REQUIRED 가 와도 false 로 끝나고 handled 가 아니다', async () => {
  const flow = await setup()
  const failure = apiError('ERR_REAUTH_REQUIRED')
  let fail!: (error: unknown) => void
  const pending = flow.run({
    gate: 'reauth',
    action: vi.fn(() => new Promise<void>((_resolve, reject) => (fail = reject))),
  })
  await flushPromises()
  await typePassword('pw')
  await click('확인')
  wrapper?.unmount()
  wrapper = null
  fail(failure)
  expect(await settledOrStuck(pending)).toBe(false)
  expect(failure.handled).toBe(false)
})

it('해제 뒤 도착한 검증 오류는 fields 안이어도 handled 가 아니다 — 보여 줄 화면이 없다', async () => {
  const flow = await setup()
  const failure = apiError('ERR_COMMON_VALIDATION', {
    issues: [{ path: ['roleName'], message: 'n' }],
  })
  let fail!: (error: unknown) => void
  const pending = flow.run({
    action: () => new Promise<void>((_resolve, reject) => (fail = reject)),
    fields: ['roleName'],
  })
  await flushPromises()
  wrapper?.unmount()
  wrapper = null
  fail(failure)
  expect(await settledOrStuck(pending)).toBe(false)
  expect(failure.handled).toBe(false)
})

it('해제 뒤 도착한 revision 충돌은 onConflict 를 부르지 않고 handled 가 아니다', async () => {
  const flow = await setup()
  const failure = apiError('ERR_COMMON_REVISION_CONFLICT')
  const onConflict = vi.fn()
  let fail!: (error: unknown) => void
  const pending = flow.run({
    action: () => new Promise<void>((_resolve, reject) => (fail = reject)),
    onConflict,
  })
  await flushPromises()
  wrapper?.unmount()
  wrapper = null
  fail(failure)
  expect(await settledOrStuck(pending)).toBe(false)
  expect(onConflict).not.toHaveBeenCalled()
  expect(failure.handled).toBe(false)
})

it('해제 뒤에 성공하면 onSuccess 는 부른다 — 쓰기는 이미 일어났다', async () => {
  const flow = await setup()
  const onSuccess = vi.fn()
  let release!: () => void
  const pending = flow.run({
    action: () => new Promise<void>((resolve) => (release = resolve)),
    onSuccess,
  })
  await flushPromises()
  wrapper?.unmount()
  wrapper = null
  release()
  expect(await settledOrStuck(pending)).toBe(true)
  expect(onSuccess).toHaveBeenCalledTimes(1)
})
```

`packages/admin-ui/src/wiring.integration.test.ts` 의 D3 테스트에서 첫 `run` 을 `fields` 를 주도록 고친다:

```ts
// 매핑된 검증 오류 → fieldErrors, 토스트 없음 (폼이 그리는 키를 fields 로 밝힌다)
reply = fail(400, 'ERR_COMMON_VALIDATION', { issues: [{ path: ['name'], message: 'req' }] })
expect(await flow.run({ action: () => api.post('/users', {}), fields: ['name'] })).toBe(false)
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useWriteFlow.render.test.ts packages/admin-ui/src/wiring.integration.test.ts`
Expected: FAIL — `fields 를 안 주면 …` 이 `handled` true 로, `currentPassword` 두 테스트가 다이얼로그 닫힘으로, 해제 테스트 셋이 `stuck`/`handled true`/`onConflict` 호출로 실패. typecheck 상 `fields` 가 없다는 오류는 vitest 가 무시하므로 런타임 실패로 나타난다.

- [ ] **Step 3: 구현**

`useWriteFlow.ts` 를 다음과 같이 고친다.

머리 주석 `바꾼 점:` 목록 끝에 두 줄 추가:

```ts
//  - 🔴 검증 오류는 `fields`(폼이 그리는 키)가 키를 전부 덮을 때만 처리됨이다 — 폼이 안 그리는 키를 처리됨으로
//    표시하면 오류가 조용히 사라진다(3b 스펙 §4-7). 재인증 관문의 `currentPassword` 오류는 다이얼로그 안에 보인다.
//  - 🔴 스코프가 해제된 뒤 도착한 실패는 처리됨으로 표시하지 않는다 — 보여 줄 화면이 없다.
```

`WriteCommon<T>` 에 필드 추가:

```ts
interface WriteCommon<T> {
  onSuccess?: (result: T) => void | Promise<void>
  /** `ERR_COMMON_REVISION_CONFLICT`. 있으면 처리 표시(전역 토스트를 막음), 없으면 전역 토스트에 맡긴다. */
  onConflict?: (error: ApiError) => void | Promise<void>
  /**
   * 폼이 그리는 필드 키(`toFieldErrors` 의 점 경로). 검증 오류의 키가 **전부** 여기 있을 때만 처리됨이다.
   * 생략하면 처리됨으로 표시하지 않는다 — `fieldErrors` 는 채우고 전역 토스트도 뜬다.
   */
  fields?: readonly string[]
}
```

`interface Pending` 정의 바로 뒤에 모듈 상수 · 함수 추가:

```ts
/** 재인증 다이얼로그가 받는 필드. 이 키의 검증 오류는 폼이 아니라 다이얼로그 안에 보인다. */
const REAUTH_FIELD = 'currentPassword'

/**
 * 바뀐 키가 전부 `fields` 안인가. 키가 하나도 없을 때의 답은 부르는 쪽이 정한다.
 * 🔴 정확히 일치한다. 접두 일치면 `fields: ['permissions']` 가 폼이 그리지 않는 `permissions.3` 을 덮어 오류가 사라진다.
 */
function coveredByFields(
  mapped: Record<string, string[]>,
  fields: readonly string[] | undefined,
  whenEmpty: boolean,
): boolean {
  const keys = Object.keys(mapped)
  if (keys.length === 0) return whenEmpty
  return fields != null && keys.every((key) => fields.includes(key))
}
```

`useWriteFlow()` 안, `const reauthError = ref('')` 다음 줄에:

```ts
/** 🔴 스코프가 해제됐는가. 해제 뒤 도착한 실패는 보일 곳이 없으니 처리됨으로 표시하지 않는다. */
let disposed = false
```

`onFailure` 전체를 다음으로 바꾼다:

```ts
/**
 * 🔴 `handled` 표시는 이 함수의 동기 구간에서 한다 — 지연 `onError` 보다 먼저여야 한다.
 * 반환값 true 는 `onConflict` 가 끝날 때까지 `submitting` 을 이 함수가 이어서 책임진다는 뜻이다.
 */
function onFailure(current: Pending, caught: unknown): boolean {
  if (!(caught instanceof ApiError)) {
    closeGates()
    settle(current, { error: caught })
    return false
  }
  const { options } = current
  // 🔴 다이얼로그를 유지할 수 있는 것은 그것이 아직 열려 있고 화면이 살아 있을 때뿐이다. 처리 중에 사용자가 닫았거나
  //    컴포넌트가 사라졌으면 문구를 보일 곳이 없고, 여기서 settle 없이 return 하면 pending 이 남아 `await run()` 이
  //    영구히 멈춘다(사용자가 닫음 — 3a R6, 화면이 사라짐 — 3b). 그때는 아래로 흘려 handled 없이(전역 토스트가 알림)
  //    정리한다.
  const keepReauth = options.gate === 'reauth' && reauthOpen.value && !disposed
  if (caught.code === CommonErrorCodes.ERR_REAUTH_REQUIRED && keepReauth) {
    // 🔴 다이얼로그를 닫지 않는다 — 닫으면 사용자가 뒤의 폼을 처음부터 다시 채운다(hangang).
    caught.handled = true
    reauthError.value = caught.message
    return false
  }
  if (caught.code === CommonErrorCodes.ERR_COMMON_VALIDATION) {
    const mapped = toFieldErrors(caught)
    const passwordMessages = mapped[REAUTH_FIELD]
    if (keepReauth && passwordMessages != null) {
      // 🔴 비밀번호 형식 오류는 비밀번호를 받은 다이얼로그 안에 보이고 다이얼로그를 유지한다 — 폼은 그 키를 그리지 않는다.
      const rest = Object.fromEntries(
        Object.entries(mapped).filter(([key]) => key !== REAUTH_FIELD),
      )
      reauthError.value = passwordMessages.join(' ')
      fieldErrors.value = rest
      if (coveredByFields(rest, options.fields, true)) caught.handled = true
      return false
    }
    // `fieldErrors` 는 어느 경우든 채운다 — 처리됨 표시와 무관하게 폼은 자기 키를 그린다.
    fieldErrors.value = mapped
    if (!disposed && coveredByFields(mapped, options.fields, false)) caught.handled = true
  }
  if (
    caught.code === CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT &&
    options.onConflict &&
    !disposed
  ) {
    caught.handled = true
    closeGates()
    const onConflict = options.onConflict
    void Promise.resolve()
      .then(() => onConflict(caught))
      .then(
        () => {
          submitting.value = false
          settle(current, { ok: false })
        },
        (error: unknown) => {
          submitting.value = false
          settle(current, { error })
        },
      )
    return true
  }
  closeGates()
  settle(current, { ok: false })
  return false
}
```

`onScopeDispose` 블록을 다음으로 바꾼다:

```ts
// 🔴 관문이 열린 채 컴포넌트가 사라지면 `await run()` 이 영구히 멈춘다 — false 로 끝낸다. 요청이 이미 나간
//    실행 중(submitting)이면 결과를 기다린다. 그 결과가 실패면 `disposed` 때문에 처리됨 없이 false 로 끝난다.
if (getCurrentScope()) {
  onScopeDispose(() => {
    disposed = true
    const current = pending.value
    if (current && !submitting.value) settle(current, { ok: false })
  })
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useWriteFlow.render.test.ts packages/admin-ui/src/wiring.integration.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/useWriteFlow.ts packages/admin-ui/src/composables/useWriteFlow.render.test.ts packages/admin-ui/src/wiring.integration.test.ts
git add packages/admin-ui/src/composables/useWriteFlow.ts packages/admin-ui/src/composables/useWriteFlow.render.test.ts packages/admin-ui/src/wiring.integration.test.ts
git commit -m "fix(admin-ui): useWriteFlow — fields 로 처리됨 판정, currentPassword 는 다이얼로그로, 해제 뒤 재인증 멈춤 수정

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 앱 스토어 `refresh()`

**Files:**

- Modify: `packages/admin-ui/src/store/app-store.ts`
- Modify: `packages/admin-ui/src/store/app-store.test.ts`

**Interfaces:**

- Produces: `AppStoreActions.refresh: () => Promise<void>` — 절대 거부하지 않는다. 성공하면 `sanitize` 를 거쳐 `userInfo` 를 바꾸고 `authorized = true` · `permissionDenied = false`. 실패하면 아무것도 바꾸지 않는다. 진행 중인 요청이 있으면 끝난 뒤 새로 받는다. 도중에 `clearSession()` 이 불리면 결과를 버린다.

- [ ] **Step 1: 실패 테스트 작성**

`app-store.test.ts` 의 `describe('createAppStore', …)` 안, `describe('login()', …)` 블록 뒤에 추가:

```ts
describe('refresh()', () => {
  it('/me 를 다시 받아 userInfo 를 바꾼다 — sanitize 를 거친다', async () => {
    const { fetchMe, store } = setup({
      sanitize: (me) => ({ ...me, permissions: me.permissions.filter((p) => p !== 'bogus') }),
    })
    fetchMe.mockResolvedValueOnce(ME)
    await store.initialize()
    fetchMe.mockResolvedValueOnce({ ...ME, permissions: ['org.roles:read', 'bogus'] })
    await store.refresh()
    expect(fetchMe).toHaveBeenCalledTimes(2)
    expect(store.userInfo?.permissions).toEqual(['org.roles:read'])
    expect(store.authorized).toBe(true)
  })

  it('🔴 실패하면 아무것도 바꾸지 않고 거부하지 않는다 — 일시 오류 하나로 로그아웃되면 안 된다', async () => {
    const { fetchMe, store } = setup()
    fetchMe.mockResolvedValueOnce(ME)
    await store.initialize()
    fetchMe.mockRejectedValueOnce(new FakeForbidden())
    await expect(store.refresh()).resolves.toBeUndefined()
    expect(store.userInfo).toEqual(ME)
    expect(store.authorized).toBe(true)
    expect(store.permissionDenied).toBe(false)
  })

  it('진행 중인 initialize() 가 있으면 끝난 뒤 새로 받는다 — 옛 요청의 응답을 믿지 않는다', async () => {
    const { fetchMe, store } = setup()
    let resolveFirst!: (me: AdminUserInfo) => void
    fetchMe.mockImplementationOnce(
      () =>
        new Promise<AdminUserInfo>((resolve) => {
          resolveFirst = resolve
        }),
    )
    fetchMe.mockResolvedValueOnce({ ...ME, userName: '새 이름' })
    const initializing = store.initialize()
    const refreshing = store.refresh()
    resolveFirst(ME)
    await Promise.all([initializing, refreshing])
    expect(fetchMe).toHaveBeenCalledTimes(2)
    expect(store.userInfo?.userName).toBe('새 이름')
  })

  it('🔴 진행 중에 clearSession 이 불리면 늦게 온 응답이 세션을 되살리지 못한다', async () => {
    const { fetchMe, store } = setup()
    fetchMe.mockResolvedValueOnce(ME)
    await store.initialize()
    let resolveMe!: (me: AdminUserInfo) => void
    fetchMe.mockImplementationOnce(
      () =>
        new Promise<AdminUserInfo>((resolve) => {
          resolveMe = resolve
        }),
    )
    const pending = store.refresh()
    store.clearSession()
    resolveMe(ME)
    await pending
    expect(store.userInfo).toBeNull()
    expect(store.authorized).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/store/app-store.test.ts`
Expected: FAIL — `store.refresh is not a function`

- [ ] **Step 3: 구현**

`app-store.ts` 머리 주석의 다음 두 줄을

```ts
//  - `initialize()` 가 진행 중 Promise 를 공유하고, 한 번 끝나면 다시 가져오지 않는다(hangang 은 호출마다 재요청).
//    다시 읽을 곳은 `login()` 뿐이다.
```

다음으로 바꾼다:

```ts
//  - `initialize()` 가 진행 중 Promise 를 공유하고, 한 번 끝나면 다시 가져오지 않는다(hangang 은 호출마다 재요청).
//    다시 읽을 곳은 `login()` 과 `refresh()` 다. `refresh()` 는 자기 직책 저장 뒤처럼 권한이 바뀌었을 수 있을 때
//    부르고, 실패해도 세션을 비우지 않는다.
```

`AppStoreActions` 에 추가(`clearSession` 아래):

```ts
/**
 * `/me` 를 다시 받는다 — 자기 직책 저장 뒤처럼 권한이 바뀌었을 수 있을 때.
 * 🔴 절대 거부하지 않고, 실패하면 아무것도 바꾸지 않는다.
 */
refresh: () => Promise<void>
```

`logout()` 함수 뒤, `return {` 앞에 추가:

```ts
/**
 * 🔴 실패하면 아무것도 바꾸지 않는다. `load()` 처럼 세션을 비우면 저장 직후의 일시 오류 하나로 로그아웃된다.
 *    401 은 `createApiClient` 의 `onUnauthorized` 경로가 따로 처리한다.
 * 🔴 진행 중인 요청이 있으면 끝나기를 기다린 뒤 **새로** 받는다 — `login()` 과 같은 이유로 옛 요청의 응답을 믿지 않는다.
 */
async function refresh(): Promise<void> {
  if (inFlight) await inFlight
  const started = generation
  try {
    const me = await options.fetchMe()
    if (started !== generation) return
    userInfo.value = options.sanitize ? options.sanitize(me) : me
    authorized.value = true
    permissionDenied.value = false
  } catch {
    // 기존 상태를 그대로 둔다.
  }
}
```

`return { … }` 에 `refresh` 를 더한다(`clearSession,` 다음 줄).

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/store/app-store.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/store/app-store.ts packages/admin-ui/src/store/app-store.test.ts
git add packages/admin-ui/src/store/app-store.ts packages/admin-ui/src/store/app-store.test.ts
git commit -m "feat(admin-ui): 앱 스토어 refresh() — 실패해도 세션을 비우지 않는 /me 재조회

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 권한 배열 규칙 — `role-permissions.ts`

**Files:**

- Create: `packages/admin-ui/src/composables/role-permissions.ts`
- Create: `packages/admin-ui/src/composables/role-permissions.test.ts`

**Interfaces:**

- Produces(패키지 내부 — `index.ts` 에 올리지 않는다):
  - `type ImpliesMap = Readonly<Partial<Record<string, readonly string[]>>>`
  - `orderedPermissions(catalog: readonly string[], list: readonly string[]): string[]`
  - `impliedClosure(implies: ImpliesMap, key: string): string[]`
  - `togglePermission(catalog: readonly string[], implies: ImpliesMap, current: readonly string[], key: string, on: boolean): string[]`
  - `samePermissionList(a: readonly string[], b: readonly string[]): boolean`

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/composables/role-permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  impliedClosure,
  orderedPermissions,
  samePermissionList,
  togglePermission,
} from './role-permissions.js'

// 정본: hangang-home apps/admin/src/pages/settings/roles-messages.ts 의 sortPermissions · togglePermission ·
//       samePermissionSet 규칙을 권한 키 단위 함의로 옮겨 못박는다.

const CATALOG = [
  'org.users:read',
  'org.users:write',
  'org.users:delete',
  'org.roles:read',
  'org.roles:write',
  'log:read',
  '*',
]
const IMPLIES = {
  'org.users:write': ['org.users:read'],
  'org.users:delete': ['org.users:write'],
  'org.roles:write': ['org.roles:read'],
}

describe('orderedPermissions', () => {
  it('카탈로그 순서로 거른다', () => {
    expect(orderedPermissions(CATALOG, ['log:read', 'org.users:read'])).toEqual([
      'org.users:read',
      'log:read',
    ])
  })

  it("🔴 '*' 와 카탈로그 밖 키를 버린다 — 매트릭스 모델에 '*' 가 들어오는 길을 막는다", () => {
    expect(orderedPermissions(CATALOG, ['*', 'gone:read', 'log:read'])).toEqual(['log:read'])
  })
})

describe('impliedClosure', () => {
  it('함의를 연쇄로 펼치고 자기 자신은 뺀다', () => {
    expect(impliedClosure(IMPLIES, 'org.users:delete')).toEqual([
      'org.users:write',
      'org.users:read',
    ])
  })

  it('함의가 없으면 빈 배열이다', () => {
    expect(impliedClosure(IMPLIES, 'log:read')).toEqual([])
  })

  it('순환이 있어도 멈춘다', () => {
    expect(impliedClosure({ a: ['b'], b: ['a'] }, 'a')).toEqual(['b'])
  })
})

describe('togglePermission', () => {
  it('🔴 켜면 함의 대상까지 값에 써 넣는다 — 결과는 카탈로그 순서', () => {
    expect(togglePermission(CATALOG, IMPLIES, ['log:read'], 'org.users:delete', true)).toEqual([
      'org.users:read',
      'org.users:write',
      'org.users:delete',
      'log:read',
    ])
  })

  it('🔴 끄면 그것을 함의하는 키까지 끈다 — 끄는 방향은 implies 에서 유도한다', () => {
    const all = ['org.users:read', 'org.users:write', 'org.users:delete', 'log:read']
    expect(togglePermission(CATALOG, IMPLIES, all, 'org.users:read', false)).toEqual(['log:read'])
    expect(togglePermission(CATALOG, IMPLIES, all, 'org.users:delete', false)).toEqual([
      'org.users:read',
      'org.users:write',
      'log:read',
    ])
  })

  it('함의가 없으면 그 키 하나만 바꾼다', () => {
    expect(togglePermission(CATALOG, IMPLIES, [], 'log:read', true)).toEqual(['log:read'])
    expect(togglePermission(CATALOG, IMPLIES, ['log:read'], 'log:read', false)).toEqual([])
  })

  it("카탈로그 밖 키와 '*' 는 함의로도 만들지 않는다", () => {
    expect(
      togglePermission(CATALOG, { 'log:read': ['log:export', '*'] }, [], 'log:read', true),
    ).toEqual(['log:read'])
  })
})

describe('samePermissionList', () => {
  it('길이와 순서까지 같아야 같다', () => {
    expect(samePermissionList(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(samePermissionList(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(samePermissionList(['a'], ['a', 'b'])).toBe(false)
    expect(samePermissionList([], [])).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/role-permissions.test.ts`
Expected: FAIL — `Failed to resolve import "./role-permissions.js"`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/composables/role-permissions.ts`:

```ts
import { ALL_PERMISSION } from '@ssworks/admin-shared'

// 역할 편집의 권한 배열 규칙 — `useRoleEditor` 전용(index 에서 내보내지 않는다).
//
// 정본: hangang-home apps/admin/src/pages/settings/roles-messages.ts
//       (`sortPermissions` · `samePermissionSet` · `togglePermission` · `IMPLIED_BY` · `dependentsOf`)
// 바꾼 점:
//  - 카탈로그(`CANONICAL_PERMISSION_ORDER`) · 함의 표(액션 단위 `IMPLIED_BY`)를 모듈 상수로 들지 않고 인자로 받는다.
//    함의는 액션이 아니라 **권한 키 단위**다(`{ 'org.users:write': ['org.users:read'] }`) — 자원마다 액션 어휘가
//    다른 프로젝트(gise)도 적을 수 있다.
//  - 함의를 연쇄로 펼친다. `delete ⇒ write ⇒ read` 를 적으면 `delete` 가 `read` 까지 켠다.

export type ImpliesMap = Readonly<Partial<Record<string, readonly string[]>>>

/** `catalog` 순서로 거른다. 🔴 `'*'` 와 카탈로그 밖 키는 버린다 — 매트릭스 모델에 `'*'` 가 들어오는 길을 막는다. */
export function orderedPermissions(catalog: readonly string[], list: readonly string[]): string[] {
  const granted = new Set(list)
  return catalog.filter((key) => key !== ALL_PERMISSION && granted.has(key))
}

/** `key` 가 연쇄로 함의하는 키 전부(너비 우선). `key` 자신은 빠진다. 순환이 있어도 멈춘다. */
export function impliedClosure(implies: ImpliesMap, key: string): string[] {
  const seen = new Set<string>([key])
  const queue = [key]
  const out: string[] = []
  for (let current = queue.shift(); current != null; current = queue.shift()) {
    for (const next of implies[current] ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      out.push(next)
      queue.push(next)
    }
  }
  return out
}

/**
 * 칸 하나를 켜거나 끈다 — 🔴 함의를 값에 **써 넣는다**(hangang §7-2 "표시만 하지 말라"). 화면은 부여됐다 하고
 * 저장소는 없다고 하면 안 된다.
 *
 * - 켤 때: `key` + 닫힘.
 * - 끌 때: `key` + `key` 를 닫힘에 포함하는 키. 🔴 끄는 방향은 `implies` 에서 **유도한다** — 두 번째 표를 받지
 *   않는다. 두 표가 갈리면 "읽기는 껐는데 편집은 켜진" 집합이 저장으로 나가고, 서버 정규화가 읽기를 되살려 화면과
 *   저장소가 갈린다.
 * - 🔴 카탈로그 밖 키와 `'*'` 는 함의로도 만들지 않는다. 결과는 카탈로그 순서다.
 */
export function togglePermission(
  catalog: readonly string[],
  implies: ImpliesMap,
  current: readonly string[],
  key: string,
  on: boolean,
): string[] {
  const valid = new Set(catalog)
  const granted = new Set(current)
  const affected = on
    ? [key, ...impliedClosure(implies, key)]
    : [
        key,
        ...catalog.filter((other) => other !== key && impliedClosure(implies, other).includes(key)),
      ]
  for (const target of affected) {
    if (target === ALL_PERMISSION || !valid.has(target)) continue
    if (on) granted.add(target)
    else granted.delete(target)
  }
  return orderedPermissions(catalog, [...granted])
}

/**
 * 두 전송값이 같은가 — 🔴 순서까지 보는 완전 대조다. 양쪽 다 `orderedPermissions` 를 지났거나 정확히 `['*']`
 * 이므로 순서가 다르면 그 자체가 결함이다. 집합 비교로 뭉개면 그 결함이 "같다" 로 삼켜진다(hangang).
 */
export function samePermissionList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/role-permissions.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/role-permissions.ts packages/admin-ui/src/composables/role-permissions.test.ts
git add packages/admin-ui/src/composables/role-permissions.ts packages/admin-ui/src/composables/role-permissions.test.ts
git commit -m "feat(admin-ui): 역할 권한 배열 규칙 — 카탈로그 순서 · 연쇄 함의 · 함의 써 넣는 토글

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `PermissionMatrix`

**Files:**

- Create: `packages/admin-ui/src/components/permission/permission-matrix.ts`
- Create: `packages/admin-ui/src/components/permission/PermissionMatrix.vue`
- Create: `packages/admin-ui/src/components/permission/permission-matrix.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts` (새 절 추가)

**Interfaces:**

- Produces:
  - `interface PermissionMatrixColumn { action: string; label: string }`
  - `interface PermissionMatrixRow { resource: string; label: string }`
  - `interface PermissionMatrixCategory { id: string; label: string; columns: readonly PermissionMatrixColumn[]; rows: readonly PermissionMatrixRow[] }`
  - `matrixCellKey(row, column): string`(내부) · `assertMatrixCoversPermissions(categories, permissions): void`
  - `PermissionMatrix` props: `modelValue: string[]`(v-model) · `categories` · `permissions: readonly string[]` · `disabled?: boolean`(false) · `canPick?(permission: string): boolean`. 슬롯 `row-extra({ row, category })`. 칸 input 은 `name` = 권한 키, `aria-label` = `"{행 라벨} {열 라벨}"`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/components/permission/permission-matrix.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import { vuetify } from '../../test/setup.js'
import PermissionMatrix from './PermissionMatrix.vue'
import {
  assertMatrixCoversPermissions,
  type PermissionMatrixCategory,
} from './permission-matrix.js'

// 정본: hangang-home apps/admin/src/components/org/permission-matrix.render.test.ts 의 규칙(없는 칸 비활성 ·
//       '*' 를 칸으로 못 만듦 · 칸 하나만 토글)을 axion 카테고리 모양에서 다시 잰다.

const CATEGORIES: PermissionMatrixCategory[] = [
  {
    id: 'org',
    label: '조직',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'write', label: '편집' },
      { action: 'delete', label: '삭제' },
    ],
    rows: [
      { resource: 'org.users', label: '직원' },
      { resource: 'org.roles', label: '역할' },
    ],
  },
  {
    id: 'log',
    label: '기록',
    columns: [{ action: 'read', label: '읽기' }],
    rows: [{ resource: 'log', label: '감사 로그' }],
  },
]
// org.roles:delete 는 카탈로그에 없다 — 격자에는 칸이 있지만 비활성이어야 한다.
const PERMISSIONS = [
  'org.users:read',
  'org.users:write',
  'org.users:delete',
  'org.roles:read',
  'org.roles:write',
  'log:read',
  '*',
]

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function setup(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const model = ref<string[]>((props.modelValue as string[] | undefined) ?? [])
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(
          PermissionMatrix as Component,
          {
            categories: CATEGORIES,
            permissions: PERMISSIONS,
            ...props,
            modelValue: model.value,
            'onUpdate:modelValue': (value: string[]) => {
              model.value = value
            },
          },
          slots,
        ),
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return model
}

const cell = (key: string) => document.querySelector<HTMLInputElement>(`input[name="${key}"]`)

async function clickCell(key: string) {
  const input = cell(key)
  expect(input, `가드 — ${key} 칸이 있다`).not.toBeNull()
  input!.click()
  await flushPromises()
}

describe('PermissionMatrix — 렌더', () => {
  it('카테고리마다 표 하나 — 머리 칸은 카테고리 라벨과 열 라벨, 행 머리는 행 라벨', async () => {
    await setup()
    const tables = document.querySelectorAll('table')
    expect(tables).toHaveLength(2)
    const heads = [...tables[0]!.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    expect(heads).toEqual(['조직', '읽기', '편집', '삭제'])
    const rows = [...tables[0]!.querySelectorAll('tbody th')].map((th) => th.textContent?.trim())
    expect(rows).toEqual(['직원', '역할'])
  })

  it('칸의 접근 가능한 이름은 「행 라벨 열 라벨」, name 은 권한 키다', async () => {
    await setup()
    expect(cell('org.users:write')?.getAttribute('aria-label')).toBe('직원 편집')
    expect(cell('log:read')?.getAttribute('aria-label')).toBe('감사 로그 읽기')
  })

  it('🔴 permissions 에 없는 칸은 비활성 · 미체크다 — 모델에 그 키가 있어도', async () => {
    await setup({ modelValue: ['org.roles:delete'] })
    expect(cell('org.roles:delete')?.disabled).toBe(true)
    expect(cell('org.roles:delete')?.checked).toBe(false)
    expect(cell('org.roles:write')?.disabled).toBe(false)
  })

  it("🔴 '*' 는 칸이 되지 않는다 — 칸 키는 늘 resource:action 이다", async () => {
    await setup({ modelValue: ['*'] })
    expect(cell('*')).toBeNull()
    expect([...document.querySelectorAll('input')].some((input) => input.checked)).toBe(false)
  })
})

describe('PermissionMatrix — 토글', () => {
  it('칸 하나만 더하고 뺀다 — 다른 키는 그대로', async () => {
    const model = await setup({ modelValue: ['log:read'] })
    await clickCell('org.users:read')
    expect(model.value).toEqual(['log:read', 'org.users:read'])
    expect(cell('org.users:read')?.checked).toBe(true)
    await clickCell('org.users:read')
    expect(model.value).toEqual(['log:read'])
  })

  it('disabled 면 모든 칸이 비활성이고 모델이 바뀌지 않는다', async () => {
    const model = await setup({ modelValue: ['log:read'], disabled: true })
    expect([...document.querySelectorAll('input')].every((input) => input.disabled)).toBe(true)
    cell('org.users:read')!.click()
    await flushPromises()
    expect(model.value).toEqual(['log:read'])
  })

  it('canPick 이 거짓인 칸은 비활성 — 체크 표시는 모델을 따른다', async () => {
    await setup({
      modelValue: ['org.users:delete'],
      canPick: (permission: string) => permission !== 'org.users:delete',
    })
    expect(cell('org.users:delete')?.disabled).toBe(true)
    expect(cell('org.users:delete')?.checked).toBe(true)
    expect(cell('org.users:write')?.disabled).toBe(false)
  })
})

describe('PermissionMatrix — 슬롯 · 도우미', () => {
  it('#row-extra 를 주면 열 하나를 더해 행마다 그린다', async () => {
    await setup(
      {},
      {
        'row-extra': ({ row, category }: { row: { resource: string }; category: { id: string } }) =>
          h('span', `${category.id}/${row.resource}`),
      },
    )
    expect(document.body.textContent).toContain('org/org.users')
    expect(document.body.textContent).toContain('log/log')
    expect(document.querySelectorAll('table')[0]!.querySelectorAll('thead th')).toHaveLength(5)
  })

  it('슬롯이 없으면 열을 더하지 않는다', async () => {
    await setup()
    expect(document.querySelectorAll('table')[0]!.querySelectorAll('thead th')).toHaveLength(4)
  })

  it("assertMatrixCoversPermissions — 모든 권한('*' 제외)에 칸이 있으면 통과, 아니면 빠진 키를 나열한다", () => {
    expect(() => assertMatrixCoversPermissions(CATEGORIES, PERMISSIONS)).not.toThrow()
    expect(() =>
      assertMatrixCoversPermissions(CATEGORIES, [...PERMISSIONS, 'setting:read', 'setting:write']),
    ).toThrow('setting:read, setting:write')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/permission/permission-matrix.render.test.ts`
Expected: FAIL — `Failed to resolve import "./PermissionMatrix.vue"`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/components/permission/permission-matrix.ts`:

```ts
import { ALL_PERMISSION } from '@ssworks/admin-shared'

// 권한 매트릭스의 카탈로그 모양.
//
// 정본: ssworks-axion-admin packages/frontend/src/data/permission_matrix.ts
// 바꾼 점: 이름에 `PermissionMatrix` 접두를 붙였다 · 배열을 `readonly` 로 · 누락 검사 도우미를 더했다.

export interface PermissionMatrixColumn {
  action: string
  label: string
}

export interface PermissionMatrixRow {
  /** 점이 있어도 된다(`org.users`). 칸 키를 쪼개지 않는다. */
  resource: string
  label: string
}

/** 카테고리마다 열이 달라도 된다(axion — CRUD 4열 · 라이선스 5열 · 설정 2열). */
export interface PermissionMatrixCategory {
  id: string
  label: string
  columns: readonly PermissionMatrixColumn[]
  rows: readonly PermissionMatrixRow[]
}

/** 칸 키. 🔴 늘 `${resource}:${action}` 이라 `'*'` 와 같아질 수 없다. */
export function matrixCellKey(row: PermissionMatrixRow, column: PermissionMatrixColumn): string {
  return `${row.resource}:${column.action}`
}

/**
 * 카탈로그의 모든 권한(`'*'` 제외)이 어느 한 칸에 놓였는지 검사한다. 아니면 빠진 키를 나열하며 던진다.
 * 템플릿의 테스트에서 부른다 — 권한을 카탈로그에 더하고 매트릭스에 안 넣으면 그 권한은 화면에서 줄 길이 없다.
 * 카탈로그에 없는 칸이 있는 것은 괜찮다(비활성으로 그린다).
 */
export function assertMatrixCoversPermissions(
  categories: readonly PermissionMatrixCategory[],
  permissions: readonly string[],
): void {
  const placed = new Set(
    categories.flatMap((category) =>
      category.rows.flatMap((row) => category.columns.map((column) => matrixCellKey(row, column))),
    ),
  )
  const missing = permissions.filter(
    (permission) => permission !== ALL_PERMISSION && !placed.has(permission),
  )
  if (missing.length > 0) {
    throw new Error(`권한 매트릭스에 칸이 없는 권한: ${missing.join(', ')}`)
  }
}
```

`packages/admin-ui/src/components/permission/PermissionMatrix.vue`:

```vue
<script setup lang="ts">
  import { computed } from 'vue'
  import { VCheckbox, VTable } from 'vuetify/components'
  import {
    matrixCellKey,
    type PermissionMatrixCategory,
    type PermissionMatrixRow,
  } from './permission-matrix.js'

  // 정본: hangang-home apps/admin/src/components/org/PermissionMatrix.vue
  //       + ssworks-axion-admin packages/frontend/src/data/permission_matrix.ts(카테고리 · 라벨 모양)
  // 바꾼 점:
  //  ① 고정 열(read/write/delete) · 상수 import 를 `categories` · `permissions` prop 으로. 카테고리마다 열이 다르다.
  //  ② 라벨을 그린다. 칸의 접근 가능한 이름은 「행 라벨 열 라벨」, `name` 은 권한 키다 — 테스트도 이것으로 찾는다
  //     (hangang 의 `data-perm` 은 테스트 전용 속성이라 버렸다).
  //  ③ `canPick` — 권한 상승 방지(gise). ④ `#row-extra` 슬롯 — scope 선택 상자 자리(crm · axion).
  //
  // 🔴 칸 하나만 더하거나 뺀다 — 함의 · 전체 권한 · 정렬은 모른다. `useRoleEditor` 가 판정해 바인딩으로 넘긴다.
  // 🔴 `'*'` 를 칸으로 만들 수 없다. 칸 키는 늘 `${resource}:${action}` 이다. hangang 사고 — 전체 권한을 행으로
  //    넣으면 `*:read` 가 만들어져 조용히 버려지고, 켜고 저장했는데 권한이 하나도 안 붙는다.
  // 🔴 칸의 활성 여부는 `permissions`(카탈로그)에서 파생한다. 손으로 적으면 카탈로그가 바뀌는 날 조용히 갈린다.

  const model = defineModel<string[]>({ default: () => [] })

  const props = withDefaults(
    defineProps<{
      categories: readonly PermissionMatrixCategory[]
      /** 유효 권한 목록. 칸 키가 여기 없으면 그 칸은 비활성 · 미체크다. */
      permissions: readonly string[]
      disabled?: boolean
      /**
       * false 면 그 칸 비활성(권한 상승 방지). 체크 표시는 모델을 그대로 따른다.
       * 🔴 메서드 꼴이다(bivariant) — `MainMenu` 의 `filter` 와 같은 이유.
       */
      canPick?(permission: string): boolean
    }>(),
    { disabled: false, canPick: undefined },
  )

  const slots = defineSlots<{
    'row-extra'?(props: { row: PermissionMatrixRow; category: PermissionMatrixCategory }): unknown
  }>()

  const valid = computed(() => new Set(props.permissions))
  const granted = computed(() => new Set(model.value))

  const tables = computed(() =>
    props.categories.map((category) => ({
      category,
      rows: category.rows.map((row) => ({
        row,
        cells: category.columns.map((column) => ({ column, key: matrixCellKey(row, column) })),
      })),
    })),
  )

  function cellDisabled(key: string): boolean {
    return props.disabled || !valid.value.has(key) || (props.canPick?.(key) ?? true) === false
  }

  function toggle(key: string, on: boolean): void {
    // 🔴 첫 줄이 가드다 — `:disabled` 는 마우스만 막는다.
    if (cellDisabled(key)) return
    if (on) {
      if (!granted.value.has(key)) model.value = [...model.value, key]
    } else {
      model.value = model.value.filter((permission) => permission !== key)
    }
  }
</script>

<template>
  <div class="permission-matrix">
    <VTable
      v-for="table in tables"
      :key="table.category.id"
      class="permission-matrix__category"
      density="compact"
    >
      <thead>
        <tr>
          <th scope="col">{{ table.category.label }}</th>
          <th v-for="column in table.category.columns" :key="column.action" scope="col">
            {{ column.label }}
          </th>
          <th v-if="slots['row-extra']" scope="col" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in table.rows" :key="entry.row.resource">
          <th scope="row">{{ entry.row.label }}</th>
          <td v-for="cell in entry.cells" :key="cell.column.action">
            <VCheckbox
              :aria-label="`${entry.row.label} ${cell.column.label}`"
              density="compact"
              :disabled="cellDisabled(cell.key)"
              hide-details
              :model-value="valid.has(cell.key) && granted.has(cell.key)"
              :name="cell.key"
              @update:model-value="(value) => toggle(cell.key, value === true)"
            />
          </td>
          <td v-if="slots['row-extra']">
            <slot name="row-extra" :category="table.category" :row="entry.row" />
          </td>
        </tr>
      </tbody>
    </VTable>
  </div>
</template>

<style scoped>
  .permission-matrix {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
</style>
```

`packages/admin-ui/src/index.ts` 의 `// ── 권한 ──` 절 바로 뒤에 새 절을 추가:

```ts
// ── 역할 · 설정 ───────────────────────────────────────────────────────
export { default as PermissionMatrix } from './components/permission/PermissionMatrix.vue'
export {
  assertMatrixCoversPermissions,
  type PermissionMatrixCategory,
  type PermissionMatrixColumn,
  type PermissionMatrixRow,
} from './components/permission/permission-matrix.js'
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/permission/permission-matrix.render.test.ts`
Expected: PASS (10 tests)

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm --filter @ssworks/admin-ui lint`
Expected: 오류 없음. (`lint` 스크립트가 패키지에 없으면 저장소 루트에서 `pnpm lint`.)

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/components/permission packages/admin-ui/src/index.ts
git add packages/admin-ui/src/components/permission packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): PermissionMatrix — 카테고리 격자, 없는 칸 비활성, canPick · row-extra 슬롯

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `useRoleEditor` — 목록 · 선택 · 폼 · 판정

**Files:**

- Create: `packages/admin-ui/src/composables/useRoleEditor.ts`
- Create: `packages/admin-ui/src/test/role-editor-harness.ts`
- Create: `packages/admin-ui/src/composables/useRoleEditor.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts` (`역할 · 설정` 절에 추가)

**Interfaces:**

- Consumes: `orderedPermissions` · `impliedClosure` · `samePermissionList` · `togglePermission` · `ImpliesMap`(Task 4), `PermissionMatrix` · `PermissionMatrixCategory`(Task 5), `AdminRole` 등(Task 1), `useWriteFlow` 와 `ConfirmDialogBindings` · `ReauthDialogBindings`(기존 + Task 2).
- Produces: 스펙 §4-4 의 타입 전부(`RoleWriteContext` · `RoleEditorApi` · `RoleEditorAction` · `RoleDialogText` · `RoleEditorOptions` · `RoleForm` · `PermissionMatrixBindings` · `RoleEditor`)와 `useRoleEditor()`. 이 Task 의 `RoleEditor` 에는 `save` · `remove` · `move` 가 아직 없다 — Task 7 이 더한다. 테스트 하네스 `mountRoleEditor()` · `createFakeRoleApi()` · `cell()` · `clickCell()` · `unmountRoleEditor()` 와 상수 `CATALOG` · `IMPLIES` · `CATEGORIES` · `ROLES`.

- [ ] **Step 1: 테스트 하네스 작성**

`packages/admin-ui/src/test/role-editor-harness.ts`:

```ts
// useRoleEditor 렌더 테스트 공용 — 실제 PermissionMatrix · ConfirmDialog · ReauthDialog 를 v-bind 로 붙인다.
// 🔴 이 폴더는 빌드 · d.ts 에서 빠진다(vite.config.ts · tsconfig.build.json).
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { vi } from 'vitest'
import { defineComponent, h, ref, type Component, type Ref } from 'vue'
import type { AdminRole } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import ReauthDialog from '../components/common/ReauthDialog.vue'
import PermissionMatrix from '../components/permission/PermissionMatrix.vue'
import type { PermissionMatrixCategory } from '../components/permission/permission-matrix.js'
import {
  useRoleEditor,
  type RoleEditor,
  type RoleEditorApi,
  type RoleEditorOptions,
} from '../composables/useRoleEditor.js'
import { vuetify } from './setup.js'

export const CATALOG = [
  'org.users:read',
  'org.users:write',
  'org.users:delete',
  'org.roles:read',
  'org.roles:write',
  'log:read',
  '*',
]

export const IMPLIES = {
  'org.users:write': ['org.users:read'],
  'org.users:delete': ['org.users:write'],
  'org.roles:write': ['org.roles:read'],
}

export const CATEGORIES: PermissionMatrixCategory[] = [
  {
    id: 'org',
    label: '조직',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'write', label: '편집' },
      { action: 'delete', label: '삭제' },
    ],
    rows: [
      { resource: 'org.users', label: '직원' },
      { resource: 'org.roles', label: '역할' },
    ],
  },
  {
    id: 'log',
    label: '기록',
    columns: [{ action: 'read', label: '읽기' }],
    rows: [{ resource: 'log', label: '감사 로그' }],
  },
]

/** 🔴 `displayOrder` 에 구멍이 있다(1 → 3) — 이동 목표가 ±1 이면 안 움직인다는 사고를 재기 위해서다. */
export const ROLES: readonly AdminRole[] = [
  {
    roleNo: 1n,
    roleName: '최고관리자',
    displayOrder: 0,
    isDefault: false,
    permissions: ['*'],
    revision: 1,
  },
  {
    roleNo: 2n,
    roleName: '운영자',
    displayOrder: 1,
    isDefault: true,
    permissions: ['org.users:write', 'org.users:read'],
    revision: 4,
  },
  {
    roleNo: 3n,
    roleName: '감사',
    displayOrder: 3,
    isDefault: false,
    permissions: ['log:read'],
    revision: 0,
  },
]

const copy = (row: AdminRole): AdminRole => ({ ...row, permissions: [...row.permissions] })

/** 서버 흉내 — 수정 · 삭제는 revision 을 대조하고 성공하면 올린다. 이동은 revision 을 건드리지 않는다(스펙 D1). */
export function createFakeRoleApi(initial: readonly AdminRole[] = ROLES) {
  let rows = initial.map(copy)
  let nextRoleNo = 100n
  const sortRows = () => rows.sort((a, b) => a.displayOrder - b.displayOrder)
  const find = (roleNo: bigint) => {
    const row = rows.find((candidate) => candidate.roleNo === roleNo)
    if (row == null) {
      throw new ApiError('없는 역할입니다', { status: 404, code: 'ERR_NO_ROLE', raw: null })
    }
    return row
  }
  const conflict = () =>
    new ApiError('다른 사람이 먼저 바꿨습니다', {
      status: 409,
      code: 'ERR_COMMON_REVISION_CONFLICT',
      raw: null,
    })

  const api = {
    list: vi.fn<RoleEditorApi['list']>(async () => sortRows().map(copy)),
    create: vi.fn<RoleEditorApi['create']>(async (body) => {
      const roleNo = nextRoleNo++
      const displayOrder = Math.max(-1, ...rows.map((row) => row.displayOrder)) + 1
      rows.push({ ...body, permissions: [...body.permissions], roleNo, displayOrder, revision: 0 })
      return roleNo
    }),
    update: vi.fn<RoleEditorApi['update']>(async (roleNo, body) => {
      const row = find(roleNo)
      if (row.revision !== body.revision) throw conflict()
      if (body.roleName != null) row.roleName = body.roleName
      if (body.isDefault != null) row.isDefault = body.isDefault
      if (body.permissions != null) row.permissions = [...body.permissions]
      row.revision += 1
    }),
    remove: vi.fn<RoleEditorApi['remove']>(async (roleNo, body) => {
      const row = find(roleNo)
      if (row.revision !== body.revision) throw conflict()
      rows = rows.filter((candidate) => candidate.roleNo !== roleNo)
    }),
    move: vi.fn<RoleEditorApi['move']>(async (roleNo, body) => {
      const row = find(roleNo)
      const other = rows.find((candidate) => candidate.displayOrder === body.displayOrder)
      if (other != null) other.displayOrder = row.displayOrder
      row.displayOrder = body.displayOrder
    }),
  }
  return { api, rows: () => rows }
}

export type FakeRoleApi = ReturnType<typeof createFakeRoleApi>

export interface RoleEditorHarness {
  editor: RoleEditor
  fake: FakeRoleApi
  /** 행위자 권한 — 기본 `['*']`. */
  actor: Ref<string[]>
  canWrite: Ref<boolean>
  /** 자기 직책 이름 — 기본 없음. */
  me: Ref<string | null>
}

let current: VueWrapper | null = null

export async function mountRoleEditor(
  overrides: Partial<RoleEditorOptions> & { roles?: readonly AdminRole[] } = {},
): Promise<RoleEditorHarness> {
  const { roles, ...options } = overrides
  const fake = createFakeRoleApi(roles)
  const actor = ref<string[]>(['*'])
  const canWrite = ref(true)
  const me = ref<string | null>(null)
  let editor!: RoleEditor
  current = mount(
    defineComponent({
      setup() {
        editor = useRoleEditor({
          api: fake.api,
          permissions: CATALOG,
          implies: IMPLIES,
          canWrite: () => canWrite.value,
          actorPermissions: () => actor.value,
          isSelf: (role) => role.roleName === me.value,
          ...options,
        })
        return () =>
          h('div', [
            h(PermissionMatrix as Component, { ...editor.matrix.value, categories: CATEGORIES }),
            h(ConfirmDialog as Component, editor.confirmDialog.value),
            h(ReauthDialog as Component, editor.reauthDialog.value),
          ])
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return { editor, fake, actor, canWrite, me }
}

export function unmountRoleEditor(): void {
  current?.unmount()
  current = null
  document.body.innerHTML = ''
}

export const cell = (key: string) =>
  document.querySelector<HTMLInputElement>(`input[name="${key}"]`)

export async function clickCell(key: string): Promise<void> {
  const input = cell(key)
  if (input == null) throw new Error(`가드 — ${key} 칸이 없다`)
  input.click()
  await flushPromises()
}
```

- [ ] **Step 2: 실패 테스트 작성**

`packages/admin-ui/src/composables/useRoleEditor.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import type { AdminRole } from '@ssworks/admin-shared'
import { createAdminUi, type AdminUserInfo } from '../context/admin-ui.js'
import {
  CATALOG,
  ROLES,
  cell,
  clickCell,
  createFakeRoleApi,
  mountRoleEditor,
  unmountRoleEditor,
} from '../test/role-editor-harness.js'
import { installVisualViewport, vuetify } from '../test/setup.js'
import { useRoleEditor, type RoleEditor } from './useRoleEditor.js'

// 정본: hangang-home apps/admin/src/pages/settings/roles.render.test.ts 의 상태 규칙(첫 행 열기 · 전체 권한
//       스위치 · 함의 써 넣기 · 자기 직책 판정 · 응답 경합)과 gise 의 권한 상승 방지를 headless 로 다시 잰다.

installVisualViewport()

afterEach(() => {
  unmountRoleEditor()
  vi.restoreAllMocks()
})

const MATRIX_KEYS = CATALOG.filter((key) => key !== '*')

describe('useRoleEditor — 목록 · 선택', () => {
  it('첫 조회가 끝나면 첫 행을 연다', async () => {
    const { editor, fake } = await mountRoleEditor()
    expect(fake.api.list).toHaveBeenCalledTimes(1)
    expect(editor.loading.value).toBe(false)
    expect(editor.roles.value.map((role) => role.roleName)).toEqual([
      '최고관리자',
      '운영자',
      '감사',
    ])
    expect(editor.selected.value?.roleNo).toBe(1n)
    expect(editor.form.value).toEqual({
      roleName: '최고관리자',
      isDefault: false,
      isAll: true,
      permissions: [],
    })
  })

  it("select 는 폼을 그 행으로 세운다 — 권한은 카탈로그 순서, '*' 는 isAll 로", async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    expect(editor.form.value).toEqual({
      roleName: '운영자',
      isDefault: true,
      isAll: false,
      permissions: ['org.users:read', 'org.users:write'],
    })
  })

  it('🔴 늦게 온 옛 목록 응답은 버린다', async () => {
    const fake = createFakeRoleApi()
    let releaseFirst!: (rows: readonly AdminRole[]) => void
    fake.api.list.mockImplementationOnce(
      () => new Promise<readonly AdminRole[]>((resolve) => (releaseFirst = resolve)),
    )
    const { editor } = await mountRoleEditor({ api: fake.api })
    await editor.reload()
    releaseFirst([{ ...ROLES[2]!, roleName: '옛 응답' }])
    await flushPromises()
    expect(editor.roles.value.map((role) => role.roleName)).toEqual([
      '최고관리자',
      '운영자',
      '감사',
    ])
    expect(editor.loading.value).toBe(false)
  })

  it('조회 실패는 loadError 에 — 목록은 그대로 두고, 다음 조회가 비운다', async () => {
    const { editor, fake } = await mountRoleEditor()
    const failure = new Error('network')
    fake.api.list.mockRejectedValueOnce(failure)
    await editor.reload()
    expect(editor.loadError.value).toBe(failure)
    expect(editor.roles.value).toHaveLength(3)
    await editor.reload()
    expect(editor.loadError.value).toBeNull()
  })

  it('첫 조회가 실패했다가 성공하면 그때 첫 행을 연다', async () => {
    const fake = createFakeRoleApi()
    fake.api.list.mockRejectedValueOnce(new Error('network'))
    const { editor } = await mountRoleEditor({ api: fake.api })
    expect(editor.selected.value).toBeNull()
    await editor.reload()
    expect(editor.selected.value?.roleNo).toBe(1n)
  })

  it('startCreate 는 선택과 폼을 비운다 — 쓰기 권한이 없으면 무시한다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    canWrite.value = false
    editor.startCreate()
    expect(editor.selected.value?.roleNo).toBe(1n)
    canWrite.value = true
    editor.startCreate()
    expect(editor.selected.value).toBeNull()
    expect(editor.form.value).toEqual({
      roleName: '',
      isDefault: false,
      isAll: false,
      permissions: [],
    })
    expect(editor.matrix.value.modelValue).toEqual([])
  })

  it('쓰기 권한이 없어도 select 는 된다 — 읽기 동작이다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    canWrite.value = false
    editor.select(editor.roles.value[2]!)
    expect(editor.selected.value?.roleNo).toBe(3n)
  })
})

describe('useRoleEditor — 전체 권한 · 매트릭스', () => {
  it('🔴 전체 권한이면 매트릭스에 카탈로그 전체가 체크된 채 잠기고, 끄면 이전 권한이 돌아온다', async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.isAll = true
    await flushPromises()
    expect(editor.matrix.value.modelValue).toEqual(MATRIX_KEYS)
    expect(editor.matrix.value.disabled).toBe(true)
    expect(cell('log:read')?.checked).toBe(true)
    expect(cell('log:read')?.disabled).toBe(true)
    expect(editor.form.value.permissions).toEqual(['org.users:read', 'org.users:write'])
    editor.form.value.isAll = false
    await flushPromises()
    expect(editor.matrix.value.modelValue).toEqual(['org.users:read', 'org.users:write'])
    expect(cell('log:read')?.checked).toBe(false)
  })

  it("🔴 매트릭스에 '*' 칸은 없다 — matrix.permissions 에서 '*' 를 뺀다", async () => {
    const { editor } = await mountRoleEditor()
    expect(editor.matrix.value.permissions).toEqual(MATRIX_KEYS)
    expect(cell('*')).toBeNull()
  })

  it('🔴 칸을 켜면 함의가 값에 써 넣어진다 — 끄면 그것을 함의하는 키도 꺼진다', async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[2]!)
    await flushPromises()
    await clickCell('org.users:delete')
    expect(editor.form.value.permissions).toEqual([
      'org.users:read',
      'org.users:write',
      'org.users:delete',
      'log:read',
    ])
    expect(cell('org.users:read')?.checked).toBe(true)
    await clickCell('org.users:read')
    expect(editor.form.value.permissions).toEqual(['log:read'])
  })

  it('🔴 행위자가 못 가진 권한(함께 켜질 키 포함)은 고를 수 없다', async () => {
    const { editor, actor } = await mountRoleEditor()
    actor.value = ['org.users:read', 'org.users:write', 'org.roles:read', 'log:read']
    editor.select(editor.roles.value[2]!)
    await flushPromises()
    expect(editor.permissionsLocked.value).toBe(false)
    expect(cell('org.users:write')?.disabled).toBe(false)
    expect(cell('org.users:delete')?.disabled).toBe(true)
    expect(cell('org.roles:write')?.disabled).toBe(true)
    // 바인딩을 직접 불러도 무시한다 — :disabled 는 마우스만 막는다.
    editor.matrix.value['onUpdate:modelValue']([
      ...editor.form.value.permissions,
      'org.users:delete',
    ])
    expect(editor.form.value.permissions).toEqual(['log:read'])
  })

  it('🔴 행위자보다 넓은 역할은 매트릭스 전체가 잠긴다 — 이름 · 기본 여부는 고칠 수 있다', async () => {
    const { editor, actor } = await mountRoleEditor()
    actor.value = ['org.users:read', 'org.users:write', 'org.roles:read']
    editor.select(editor.roles.value[2]!)
    expect(editor.permissionsLocked.value).toBe(true)
    expect(editor.matrix.value.disabled).toBe(true)
    editor.form.value.roleName = '감사팀'
    expect(editor.canSave.value).toBe(true)
    editor.select(editor.roles.value[0]!)
    expect(editor.permissionsLocked.value).toBe(true)
    editor.select(editor.roles.value[1]!)
    expect(editor.permissionsLocked.value).toBe(false)
  })

  it("전체 권한 스위치는 행위자가 '*' 이고 쓰기 권한이 있을 때만 켤 수 있다", async () => {
    const { editor, actor, canWrite } = await mountRoleEditor()
    expect(editor.canToggleAll.value).toBe(true)
    actor.value = ['org.users:read']
    expect(editor.canToggleAll.value).toBe(false)
    actor.value = ['*']
    canWrite.value = false
    expect(editor.canToggleAll.value).toBe(false)
  })

  it('쓰기 권한이 없으면 매트릭스가 잠긴다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    editor.select(editor.roles.value[2]!)
    canWrite.value = false
    await flushPromises()
    expect(editor.matrix.value.disabled).toBe(true)
    expect(cell('org.users:read')?.disabled).toBe(true)
  })
})

describe('useRoleEditor — 판정', () => {
  it('🔴 자기 직책 판정은 원본 기준 — 폼에서 이름을 고쳐도 남는다', async () => {
    const { editor, me } = await mountRoleEditor()
    me.value = '운영자'
    editor.select(editor.roles.value[1]!)
    expect(editor.isSelfRole.value).toBe(true)
    editor.form.value.roleName = '다른 이름'
    expect(editor.isSelfRole.value).toBe(true)
    editor.select(editor.roles.value[2]!)
    expect(editor.isSelfRole.value).toBe(false)
  })

  it('isDirty · canSave — 바뀐 것이 있어야 저장할 수 있고, 이름 앞뒤 공백은 변경이 아니다', async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    await flushPromises()
    expect(editor.isDirty.value).toBe(false)
    expect(editor.canSave.value).toBe(false)
    editor.form.value.roleName = ' 운영자 '
    expect(editor.isDirty.value).toBe(false)
    editor.form.value.isDefault = false
    expect(editor.isDirty.value).toBe(true)
    expect(editor.canSave.value).toBe(true)
    editor.form.value.isDefault = true
    expect(editor.isDirty.value).toBe(false)
    await clickCell('log:read')
    expect(editor.isDirty.value).toBe(true)
  })

  it('새 역할은 이름만 있으면 저장할 수 있다 — 빈 이름 · 쓰기 권한 없음은 막는다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    editor.startCreate()
    expect(editor.canSave.value).toBe(false)
    editor.form.value.roleName = '   '
    expect(editor.canSave.value).toBe(false)
    editor.form.value.roleName = '신규'
    expect(editor.canSave.value).toBe(true)
    canWrite.value = false
    expect(editor.canSave.value).toBe(false)
  })

  it('canMove — 이웃이 있는 방향만, 행은 roleNo 로 찾는다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    const [first, middle, last] = editor.roles.value
    expect(editor.canMove(first!, 'up')).toBe(false)
    expect(editor.canMove(first!, 'down')).toBe(true)
    expect(editor.canMove({ ...middle! }, 'up')).toBe(true)
    expect(editor.canMove(last!, 'down')).toBe(false)
    canWrite.value = false
    expect(editor.canMove(middle!, 'up')).toBe(false)
  })

  it('canRemove — 선택이 있고 쓰기 권한이 있을 때', async () => {
    const { editor } = await mountRoleEditor()
    expect(editor.canRemove.value).toBe(true)
    editor.startCreate()
    expect(editor.canRemove.value).toBe(false)
  })
})

describe('useRoleEditor — 기본값', () => {
  let wrapper: VueWrapper | null = null
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('actorPermissions · isSelf 를 안 주면 useAdminUi 사용자의 권한 · 역할 이름으로 판정한다', async () => {
    const fake = createFakeRoleApi()
    const user = ref<AdminUserInfo>({
      userId: 'u',
      userName: '김',
      permissions: ['org.users:read'],
      roleName: '운영자',
    })
    let editor!: RoleEditor
    wrapper = mount(
      defineComponent({
        setup() {
          editor = useRoleEditor({ api: fake.api, permissions: CATALOG, canWrite: () => true })
          return () => h('div')
        },
      }),
      {
        global: {
          plugins: [vuetify, createAdminUi({ user: () => user.value, logout: async () => {} })],
        },
      },
    )
    await flushPromises()
    editor.select(editor.roles.value[1]!)
    expect(editor.isSelfRole.value).toBe(true)
    expect(editor.permissionsLocked.value).toBe(true)
    expect(editor.canToggleAll.value).toBe(false)
    user.value = { ...user.value, permissions: ['*'] }
    expect(editor.permissionsLocked.value).toBe(false)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useRoleEditor.render.test.ts`
Expected: FAIL — `Failed to resolve import "../composables/useRoleEditor.js"`

- [ ] **Step 4: 구현**

`packages/admin-ui/src/composables/useRoleEditor.ts`:

```ts
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import {
  ALL_PERMISSION,
  coversPermissions,
  type AdminRole,
  type AdminRoleCreate,
  type AdminRoleMove,
  type AdminRoleRemove,
  type AdminRoleUpdate,
} from '@ssworks/admin-shared'
import { useAdminUi } from '../context/admin-ui.js'
import {
  impliedClosure,
  orderedPermissions,
  samePermissionList,
  togglePermission,
  type ImpliesMap,
} from './role-permissions.js'
import {
  useWriteFlow,
  type ConfirmDialogBindings,
  type ReauthDialogBindings,
} from './useWriteFlow.js'

// 정본: hangang-home apps/admin/src/pages/settings/roles.vue(상태 · 규칙) · roles-messages.ts
//       + ssworks-gise-home 역할 편집의 권한 상승 방지(`coversPermissions` 로 칸 · 행 잠금)와 revision 충돌
// 바꾼 점:
//  ① 화면(2단 · 문구 · VAlert)을 버리고 상태 · 규칙만 headless 로 낸다. 배치는 템플릿(B)이 한다.
//  ② 재인증 고정을 `reauth` 옵션으로. 수정 · 삭제는 `revision` 을 늘 싣는다(3b 스펙 §2-1 — 필수, 끄는 경로 없음).
//  ③ 함의 표(액션 단위 `IMPLIED_BY`)를 `implies` 옵션(권한 키 단위 · 연쇄)으로.
//  ④ 권한 상승 방지를 더했다 — hangang 은 서버 판정만 있었다.
//  ⑤ 메시지 해석(`resolveRolesMessage`)을 버렸다 — 처리 안 된 실패는 `createApiClient` 의 전역 `onError` 가 서버
//     `message` 그대로 알린다. 성공 문구는 `save()` 등이 true 를 돌려주면 화면이 띄운다.
//  ⑥ `total` 잘림 안내를 버렸다 — 어댑터가 전량을 준다.
//  ⑦ 자기 직책 저장 뒤 `/me` 재조회 · 이동을 `onSelfRoleSaved` 훅으로.

export interface RoleWriteContext {
  /** `reauth: true` 일 때만 있다. 본문 · 헤더 중 어디에 실을지는 어댑터가 정한다. */
  currentPassword?: string
}

export interface RoleEditorApi<R extends AdminRole = AdminRole> {
  /**
   * 🔴 전량, `displayOrder` 오름차순. 쪽을 나누는 서버면 어댑터가 끝까지 받아 이어 붙인다 — hangang 은 서버 상한
   *    100건에 잘린 역할이 편집 · 삭제 · 이동 모두 도달 불가가 됐다.
   */
  list(): Promise<readonly R[]>
  /** 새 `roleNo` 를 돌려준다 — 만든 행을 선택하는 데 쓴다. */
  create(body: AdminRoleCreate, ctx: RoleWriteContext): Promise<bigint>
  update(roleNo: bigint, body: AdminRoleUpdate, ctx: RoleWriteContext): Promise<void>
  remove(roleNo: bigint, body: AdminRoleRemove, ctx: RoleWriteContext): Promise<void>
  /**
   * 🔴 재인증 없음 · revision 없음 — 순서는 내용이 아니다(3b 스펙 D1). hangang: 이동 본문에 비밀번호를 실으면 서버가
   *    조용히 떨궈 200 이라, 화면은 재인증했다고 믿는데 서버는 비밀번호를 본 적이 없다.
   */
  move(roleNo: bigint, body: AdminRoleMove): Promise<void>
}

export type RoleEditorAction = 'create' | 'update' | 'remove'

export interface RoleDialogText {
  title?: string
  message: string
}

export interface RoleEditorOptions<P extends string = string, R extends AdminRole = AdminRole> {
  api: RoleEditorApi<R>
  /** 정렬 순서이자 유효 키 목록. 보통 카탈로그의 `ALL_PERMISSION_VALUES`. `'*'` 는 걸러 낸다. */
  permissions: readonly P[]
  /** 쓰기 권한. 게터 — 호출 시점마다 평가한다. */
  canWrite: () => boolean
  /** `{ 'org.users:write': ['org.users:read'] }`. 연쇄를 펼친다. 끄는 방향은 여기서 유도한다. */
  implies?: Partial<Record<P, readonly P[]>>
  /** 기본 false. true 면 만들기 · 수정 · 삭제에 재인증 관문. 🔴 이동은 늘 관문 없음. */
  reauth?: boolean
  /** 기본 `useAdminUi().user()?.permissions ?? []`. */
  actorPermissions?: () => readonly string[]
  /** 기본 `user()?.roleName === role.roleName` — roleName 은 UNIQUE 전제(hangang). */
  isSelf?: (role: R) => boolean
  /** 자기 직책 **수정** 성공 뒤(재조회 · 재선택 뒤). 템플릿이 `store.refresh()` 와 권한 상실 시 이동을 한다. */
  onSelfRoleSaved?: () => void | Promise<void>
  /** 관문 다이얼로그 문구. 기본은 "역할" 용어(스펙 §4-4-3). */
  dialogText?: (action: RoleEditorAction, role: R | null) => RoleDialogText
}

export interface RoleForm {
  roleName: string
  isDefault: boolean
  /** 🔴 전체 권한 — 매트릭스 행이 아니라 독립 스위치다. 켜면 정확히 `['*']` 만 보낸다. */
  isAll: boolean
  /** 매트릭스의 키들. 🔴 `'*'` 가 들어오는 길이 없다(`orderedPermissions`). */
  permissions: string[]
}

/** `<PermissionMatrix v-bind="matrix" :categories="…" />` */
export interface PermissionMatrixBindings {
  modelValue: string[]
  'onUpdate:modelValue': (value: string[]) => void
  permissions: readonly string[]
  disabled: boolean
  canPick: (permission: string) => boolean
}

export interface RoleEditor<R extends AdminRole = AdminRole> {
  roles: Readonly<Ref<readonly R[]>>
  loading: Readonly<Ref<boolean>>
  /** 마지막 목록 조회의 오류. 다음 조회 시작 때 비운다. */
  loadError: Readonly<Ref<unknown>>
  reload: () => Promise<void>

  /** 불러온 원본 스냅샷. `null` 이면 새 역할 모드. */
  selected: Readonly<Ref<R | null>>
  select: (role: R) => void
  startCreate: () => void

  form: Ref<RoleForm>
  matrix: ComputedRef<PermissionMatrixBindings>

  canToggleAll: ComputedRef<boolean>
  permissionsLocked: ComputedRef<boolean>
  isSelfRole: ComputedRef<boolean>
  isDirty: ComputedRef<boolean>
  conflicted: Readonly<Ref<boolean>>
  canSave: ComputedRef<boolean>
  canRemove: ComputedRef<boolean>
  canMove: (role: R, direction: 'up' | 'down') => boolean

  submitting: Readonly<Ref<boolean>>
  fieldErrors: Readonly<Ref<Record<string, string[]>>>
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  reauthDialog: ComputedRef<ReauthDialogBindings>
}

function emptyForm(): RoleForm {
  return { roleName: '', isDefault: false, isAll: false, permissions: [] }
}

/** setup 안에서 부른다. 페이지당 하나 — 다이얼로그 둘과 매트릭스는 반환된 바인딩을 `v-bind` 로 붙인다. */
export function useRoleEditor<P extends string, R extends AdminRole = AdminRole>(
  options: RoleEditorOptions<P, R>,
): RoleEditor<R> {
  const { api } = options
  /** 🔴 매트릭스와 폼이 쓰는 카탈로그 — `'*'` 를 뺀다. 전체 권한은 행이 아니라 `form.isAll` 스위치다. */
  const catalog: readonly string[] = options.permissions.filter((key) => key !== ALL_PERMISSION)
  const implies: ImpliesMap = options.implies ?? {}
  const flow = useWriteFlow()

  // 기본값을 쓸 때만 컨텍스트를 찾는다 — 두 옵션을 다 주면 플러그인 없이도 쓸 수 있다.
  const ui = options.actorPermissions != null && options.isSelf != null ? null : useAdminUi()
  // 🔴 게터로 읽는다 — 값을 캐시하면 `refresh()` 뒤에도 옛 권한으로 판정한다.
  const actor = options.actorPermissions ?? (() => ui?.user()?.permissions ?? [])
  const isSelf =
    options.isSelf ??
    ((role: R) => {
      const name = ui?.user()?.roleName
      return name != null && name === role.roleName
    })

  const roles = shallowRef<readonly R[]>([])
  const loading = ref(false)
  const loadError = shallowRef<unknown>(null)
  /** 🔴 불러온 원본. 자기 직책 판정 · revision 은 폼이 아니라 이것으로 한다. */
  const selected = shallowRef<R | null>(null)
  const form = ref<RoleForm>(emptyForm())
  /** 선택할 때의 전송값(`built()`). 수정 저장이 `permissions` 를 바뀐 경우에만 싣는 판정에 쓴다. */
  const snapshot = shallowRef<readonly string[]>([])
  const conflicted = ref(false)

  const busy = computed(() => loading.value || flow.submitting.value)

  /** 🔴 전체 권한이면 정확히 `['*']` 다 — 매트릭스 키를 함께 보내지 않는다(hangang). */
  function built(): string[] {
    return form.value.isAll ? [ALL_PERMISSION] : orderedPermissions(catalog, form.value.permissions)
  }

  function applySelection(role: R): void {
    selected.value = role
    form.value = {
      roleName: role.roleName,
      isDefault: role.isDefault,
      isAll: role.permissions.includes(ALL_PERMISSION),
      permissions: orderedPermissions(catalog, role.permissions),
    }
    snapshot.value = built()
  }

  function clearSelection(): void {
    selected.value = null
    form.value = emptyForm()
    snapshot.value = []
  }

  function resetFeedback(): void {
    flow.clearFieldErrors()
    conflicted.value = false
  }

  // ── 목록 ──────────────────────────────────────────────────────────

  /** 🔴 응답 경합 — 쓰기 뒤 재조회와 첫 조회가 겹치면 먼저 보낸 느린 응답이 나중에 도착해 이긴다(hangang). */
  let loadSeq = 0
  let loadedOnce = false

  async function reload(): Promise<void> {
    const seq = ++loadSeq
    loading.value = true
    loadError.value = null
    try {
      const items = await api.list()
      if (seq !== loadSeq) return
      roles.value = items
      // 🔴 첫 조회가 성공하면 첫 행을 연다 — 오른쪽이 빈 첫 화면을 피한다(hangang).
      if (!loadedOnce) {
        loadedOnce = true
        const first = items[0]
        if (selected.value == null && first != null) applySelection(first)
      }
    } catch (error) {
      if (seq !== loadSeq) return
      // 🔴 목록은 그대로 둔다 — 화면이 로딩 · 목록 · 실패 · 빈 목록 네 갈래를 가를 수 있게.
      loadError.value = error
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  // ── 판정 ──────────────────────────────────────────────────────────

  const permissionsLocked = computed(
    () => selected.value != null && !coversPermissions(actor(), snapshot.value),
  )
  const canToggleAll = computed(
    () => options.canWrite() && !busy.value && actor().includes(ALL_PERMISSION),
  )
  const matrixDisabled = computed(
    () => !options.canWrite() || busy.value || form.value.isAll || permissionsLocked.value,
  )

  /** 🔴 켜면 함께 켜질 키까지 행위자가 가져야 한다 — 아니면 서버의 권한 상승 검사에 걸린다(gise). */
  function canPick(permission: string): boolean {
    return coversPermissions(actor(), [permission, ...impliedClosure(implies, permission)])
  }

  /**
   * 🔴 매트릭스는 칸 하나만 더하거나 뺀 원본을 낸다. 옛 값과 대조해 바뀐 키 하나를 찾아 함의를 값에 써 넣는다
   *    (hangang §7-2 "표시만 하지 말라" — 화면은 부여됐다 하고 저장소는 없다고 하면 안 된다).
   */
  function onMatrixUpdate(next: string[]): void {
    if (matrixDisabled.value) return
    const before = form.value.permissions
    const added = next.find((key) => !before.includes(key))
    const removed = before.find((key) => !next.includes(key))
    const changed = added ?? removed
    if (changed == null || !canPick(changed)) return
    form.value.permissions = togglePermission(catalog, implies, before, changed, added != null)
  }

  const matrix = computed<PermissionMatrixBindings>(() => ({
    // 🔴 전체 권한이면 카탈로그 전체를 넘겨 체크된 채 잠가 보인다. `form.permissions` 는 건드리지 않는다 — 끄면
    //    이전 값이 돌아온다.
    modelValue: form.value.isAll ? [...catalog] : form.value.permissions,
    'onUpdate:modelValue': onMatrixUpdate,
    permissions: catalog,
    disabled: matrixDisabled.value,
    canPick,
  }))

  /** 🔴 폼이 아니라 불러온 원본으로 판정한다 — 폼에서 이름을 고치는 순간 경고가 사라지면 안 된다(hangang §1-4). */
  const isSelfRole = computed(() => selected.value != null && isSelf(selected.value))

  const isDirty = computed(() => {
    const name = form.value.roleName.trim()
    const current = built()
    const role = selected.value
    if (role == null) return name !== '' || form.value.isDefault || current.length > 0
    return (
      name !== role.roleName ||
      form.value.isDefault !== role.isDefault ||
      !samePermissionList(current, snapshot.value)
    )
  })

  /** 🔴 빈 이름 · 변경 없는 저장을 버튼 단계에서 막는다 — hangang 은 둘 다 서버 400 이었다. */
  const canSave = computed(
    () =>
      options.canWrite() &&
      !busy.value &&
      !conflicted.value &&
      form.value.roleName.trim() !== '' &&
      (selected.value == null || isDirty.value),
  )
  const canRemove = computed(() => options.canWrite() && !busy.value && selected.value != null)

  /** 🔴 `indexOf` 가 아니라 `roleNo` 로 찾는다 — 슬롯이 넘기는 행이 `roles` 의 원본 참조라는 보장이 없다(hangang). */
  function neighborOf(role: R, direction: 'up' | 'down'): R | undefined {
    const index = roles.value.findIndex((candidate) => candidate.roleNo === role.roleNo)
    if (index < 0) return undefined
    return roles.value[direction === 'up' ? index - 1 : index + 1]
  }

  function canMove(role: R, direction: 'up' | 'down'): boolean {
    return options.canWrite() && !busy.value && neighborOf(role, direction) != null
  }

  // ── 선택 ──────────────────────────────────────────────────────────

  /**
   * 🔴 선택은 읽기 동작이다 — `canWrite` 로 막지 않는다. 저장 중에는 무시한다 — 진행 중이던 저장이 성공하며 선택을
   *    되돌린다.
   */
  function select(role: R): void {
    if (flow.submitting.value) return
    applySelection(role)
    resetFeedback()
  }

  function startCreate(): void {
    if (!options.canWrite() || busy.value) return
    clearSelection()
    resetFeedback()
  }

  void reload()

  return {
    roles,
    loading,
    loadError,
    reload,
    selected,
    select,
    startCreate,
    form,
    matrix,
    canToggleAll,
    permissionsLocked,
    isSelfRole,
    isDirty,
    conflicted,
    canSave,
    canRemove,
    canMove,
    submitting: flow.submitting,
    fieldErrors: flow.fieldErrors,
    confirmDialog: flow.confirmDialog,
    reauthDialog: flow.reauthDialog,
  }
}
```

`packages/admin-ui/src/index.ts` 의 `역할 · 설정` 절(Task 5 에서 만든 것) 끝에 추가:

```ts
export {
  useRoleEditor,
  type RoleEditor,
  type RoleEditorApi,
  type RoleEditorOptions,
  type RoleEditorAction,
  type RoleDialogText,
  type RoleForm,
  type RoleWriteContext,
  type PermissionMatrixBindings,
} from './composables/useRoleEditor.js'
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useRoleEditor.render.test.ts`
Expected: PASS (20 tests)

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/useRoleEditor.ts packages/admin-ui/src/composables/useRoleEditor.render.test.ts packages/admin-ui/src/test/role-editor-harness.ts packages/admin-ui/src/index.ts
git add packages/admin-ui/src/composables/useRoleEditor.ts packages/admin-ui/src/composables/useRoleEditor.render.test.ts packages/admin-ui/src/test/role-editor-harness.ts packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): useRoleEditor — 목록 · 선택 · 폼, 전체 권한 · 함의 · 권한 상승 방지 판정

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `useRoleEditor` — 저장 · 삭제 · 이동

**Files:**

- Modify: `packages/admin-ui/src/composables/useRoleEditor.ts`
- Create: `packages/admin-ui/src/composables/useRoleEditor.write.render.test.ts`

**Interfaces:**

- Consumes: Task 6 의 `useRoleEditor` 내부(`selected` · `snapshot` · `built()` · `applySelection` · `clearSelection` · `resetFeedback` · `reload` · `neighborOf` · `canSave` · `canRemove` · `canMove` · `isSelfRole` · `flow`), 하네스(Task 6).
- Produces: `RoleEditor` 에 `save: () => Promise<boolean>` · `remove: () => Promise<boolean>` · `move: (role: R, direction: 'up' | 'down') => Promise<boolean>`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/composables/useRoleEditor.write.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/error.js'
import { clickCell, mountRoleEditor, unmountRoleEditor } from '../test/role-editor-harness.js'
import { buttonByText, installVisualViewport } from '../test/setup.js'

// 정본: hangang-home apps/admin/src/pages/settings/roles.render.test.ts 의 쓰기 규칙(바뀐 것만 전송 · 실패해도
//       재조회 · 성공할 때만 선택 이동 · 이웃 displayOrder · 이동에는 재인증 없음)과 gise revision 충돌.

installVisualViewport()

afterEach(() => {
  unmountRoleEditor()
  vi.restoreAllMocks()
})

const apiError = (code: string, status = 400, details?: unknown) =>
  new ApiError(code, { status, code, details, raw: null })

async function click(text: string) {
  const button = buttonByText(text)
  expect(button, `가드 — "${text}" 버튼이 있다`).toBeTruthy()
  button!.click()
  await flushPromises()
}

async function typePassword(value: string) {
  const input = document.body.querySelector<HTMLInputElement>('input[name="currentPassword"]')
  expect(input, '가드 — 재인증 다이얼로그가 열려 있다').not.toBeNull()
  input!.value = value
  input!.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('save — 만들기', () => {
  it('이름(trim) · 기본 여부 · 카탈로그 순서 권한으로 만들고, 만든 행을 연다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.startCreate()
    editor.form.value.roleName = '  신규  '
    await flushPromises()
    await clickCell('log:read')
    await clickCell('org.users:write')
    expect(await editor.save()).toBe(true)
    expect(fake.api.create).toHaveBeenCalledWith(
      {
        roleName: '신규',
        isDefault: false,
        permissions: ['org.users:read', 'org.users:write', 'log:read'],
      },
      {},
    )
    expect(fake.api.list).toHaveBeenCalledTimes(2)
    expect(editor.selected.value?.roleNo).toBe(100n)
    expect(editor.form.value.roleName).toBe('신규')
  })

  it("🔴 전체 권한을 켜고 저장하면 정확히 ['*'] 만 보낸다", async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.startCreate()
    editor.form.value.roleName = '전권'
    editor.form.value.permissions = ['log:read']
    editor.form.value.isAll = true
    await editor.save()
    expect(fake.api.create.mock.calls[0]![0].permissions).toEqual(['*'])
  })
})

describe('save — 수정', () => {
  it('🔴 이름만 고치면 permissions 를 싣지 않는다 — revision 은 늘 싣는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    expect(await editor.save()).toBe(true)
    expect(fake.api.update).toHaveBeenCalledWith(
      2n,
      { roleName: '운영팀', isDefault: true, revision: 4 },
      {},
    )
  })

  it('🔴 행위자보다 넓은 역할도 이름은 고칠 수 있다 — permissions 가 실리지 않는다', async () => {
    const { editor, fake, actor } = await mountRoleEditor()
    actor.value = ['org.users:read']
    editor.select(editor.roles.value[0]!)
    editor.form.value.roleName = '전권 관리자'
    expect(await editor.save()).toBe(true)
    expect(fake.api.update.mock.calls[0]![1]).toEqual({
      roleName: '전권 관리자',
      isDefault: false,
      revision: 1,
    })
  })

  it('권한을 바꾸면 permissions 를 싣는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    await flushPromises()
    await clickCell('log:read')
    await editor.save()
    expect(fake.api.update.mock.calls[0]![1]).toEqual({
      roleName: '운영자',
      isDefault: true,
      revision: 4,
      permissions: ['org.users:read', 'org.users:write', 'log:read'],
    })
  })

  it('🔴 저장에 성공하면 같은 행을 새 revision 으로 다시 연다 — 이어서 저장해도 거짓 충돌이 없다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    await editor.save()
    expect(editor.selected.value?.revision).toBe(5)
    editor.form.value.roleName = '운영본부'
    expect(await editor.save()).toBe(true)
    expect(fake.api.update.mock.calls[1]![1]).toMatchObject({ revision: 5 })
    expect(editor.conflicted.value).toBe(false)
  })

  it('🔴 실패하면 폼을 그대로 두고 목록만 다시 받는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    fake.api.update.mockRejectedValueOnce(apiError('ERR_COMMON_INTERNAL', 500))
    expect(await editor.save()).toBe(false)
    expect(fake.api.list).toHaveBeenCalledTimes(2)
    expect(editor.form.value.roleName).toBe('운영팀')
    expect(editor.selected.value?.revision).toBe(4)
  })

  it('서버 검증 오류는 fieldErrors.roleName 에 — 폼이 그리는 키라 처리됨이다', async () => {
    const { editor, fake } = await mountRoleEditor()
    const failure = apiError('ERR_COMMON_VALIDATION', 400, {
      issues: [{ path: ['roleName'], message: '이미 있는 이름입니다' }],
    })
    fake.api.update.mockRejectedValueOnce(failure)
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '감사'
    expect(await editor.save()).toBe(false)
    expect(editor.fieldErrors.value).toEqual({ roleName: ['이미 있는 이름입니다'] })
    expect(failure.handled).toBe(true)
  })

  it('🔴 revision 충돌 — 처리됨, 폼 유지, conflicted 동안 저장 불가, 같은 행을 다시 열면 풀린다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    fake.rows().find((row) => row.roleNo === 2n)!.revision = 9 // 남이 먼저 고쳤다
    expect(await editor.save()).toBe(false)
    const settled = fake.api.update.mock.settledResults[0]
    expect(settled?.type).toBe('rejected')
    expect((settled?.value as ApiError).handled).toBe(true)
    expect(editor.conflicted.value).toBe(true)
    expect(editor.form.value.roleName).toBe('운영팀')
    expect(editor.canSave.value).toBe(false)
    editor.select(editor.roles.value[1]!)
    expect(editor.conflicted.value).toBe(false)
    expect(editor.form.value.roleName).toBe('운영자')
    expect(editor.selected.value?.revision).toBe(9)
  })

  it('canSave 가 아니면 요청 없이 false', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    expect(await editor.save()).toBe(false)
    expect(fake.api.update).not.toHaveBeenCalled()
    expect(fake.api.list).toHaveBeenCalledTimes(1)
  })

  it('🔴 저장 중 select 는 무시한다 — 진행 중이던 저장이 선택을 되돌리지 않게', async () => {
    const { editor, fake } = await mountRoleEditor()
    let release!: () => void
    fake.api.update.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve)),
    )
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    const pending = editor.save()
    await flushPromises()
    expect(editor.submitting.value).toBe(true)
    editor.select(editor.roles.value[2]!)
    expect(editor.selected.value?.roleNo).toBe(2n)
    release()
    expect(await pending).toBe(true)
  })
})

describe('재인증 · 확인 관문', () => {
  it('reauth: true 면 저장이 재인증을 거쳐 비밀번호를 ctx 로 넘긴다 — 기본 문구는 원본 이름', async () => {
    const { editor, fake } = await mountRoleEditor({ reauth: true })
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    const pending = editor.save()
    await flushPromises()
    expect(document.body.textContent).toContain('「운영자」 역할을 저장합니다.')
    await typePassword('pw')
    await click('확인')
    expect(await pending).toBe(true)
    expect(fake.api.update).toHaveBeenCalledWith(
      2n,
      { roleName: '운영팀', isDefault: true, revision: 4 },
      { currentPassword: 'pw' },
    )
  })

  it('🔴 관문을 취소하면 요청도 재조회도 없고 폼이 남는다', async () => {
    const { editor, fake } = await mountRoleEditor({ reauth: true })
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    const pending = editor.save()
    await flushPromises()
    await click('취소')
    expect(await pending).toBe(false)
    expect(fake.api.update).not.toHaveBeenCalled()
    expect(fake.api.list).toHaveBeenCalledTimes(1)
    expect(editor.form.value.roleName).toBe('운영팀')
  })

  it('remove — 재인증이 아니면 되돌릴 수 없다는 확인을 거쳐 revision 과 함께 지우고 첫 행을 연다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[2]!)
    const pending = editor.remove()
    await flushPromises()
    expect(document.body.textContent).toContain('「감사」 역할을 삭제합니다.')
    expect(editor.confirmDialog.value.reversible).toBe(false)
    await click('확인')
    expect(await pending).toBe(true)
    expect(fake.api.remove).toHaveBeenCalledWith(3n, { revision: 0 }, {})
    expect(editor.roles.value.map((role) => role.roleNo)).toEqual([1n, 2n])
    expect(editor.selected.value?.roleNo).toBe(1n)
  })

  it('remove — reauth: true 면 재인증 다이얼로그 하나로 지운다', async () => {
    const { editor, fake } = await mountRoleEditor({ reauth: true })
    editor.select(editor.roles.value[2]!)
    const pending = editor.remove()
    await flushPromises()
    expect(editor.confirmDialog.value.modelValue).toBe(false)
    expect(document.body.textContent).toContain('「감사」 역할을 삭제합니다.')
    await typePassword('pw')
    await click('확인')
    expect(await pending).toBe(true)
    expect(fake.api.remove).toHaveBeenCalledWith(3n, { revision: 0 }, { currentPassword: 'pw' })
  })

  it('remove 가 실패하면 선택이 그대로이고 목록은 다시 받는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    fake.api.remove.mockRejectedValueOnce(apiError('ERR_COMMON_CONFLICT', 409))
    editor.select(editor.roles.value[2]!)
    const pending = editor.remove()
    await flushPromises()
    await click('확인')
    expect(await pending).toBe(false)
    expect(editor.selected.value?.roleNo).toBe(3n)
    expect(fake.api.list).toHaveBeenCalledTimes(2)
  })

  it('dialogText 로 문구를 바꾼다', async () => {
    const { editor } = await mountRoleEditor({
      reauth: true,
      dialogText: (action, role) => ({
        title: '직책',
        message: `${action}:${role?.roleName ?? '새 직책'}`,
      }),
    })
    editor.startCreate()
    editor.form.value.roleName = '신규'
    const pending = editor.save()
    await flushPromises()
    expect(document.body.textContent).toContain('create:새 직책')
    await click('취소')
    expect(await pending).toBe(false)
  })
})

describe('move', () => {
  it('🔴 목표값은 이웃 행의 displayOrder 다 — 구멍(1 → 3)이 있어도 움직인다', async () => {
    const { editor, fake } = await mountRoleEditor()
    expect(await editor.move(editor.roles.value[1]!, 'down')).toBe(true)
    expect(fake.api.move).toHaveBeenCalledWith(2n, { displayOrder: 3 })
    expect(editor.roles.value.map((role) => role.roleName)).toEqual([
      '최고관리자',
      '감사',
      '운영자',
    ])
  })

  it('경계에서는 요청하지 않는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    expect(await editor.move(editor.roles.value[0]!, 'up')).toBe(false)
    expect(await editor.move(editor.roles.value[2]!, 'down')).toBe(false)
    expect(fake.api.move).not.toHaveBeenCalled()
    expect(fake.api.list).toHaveBeenCalledTimes(1)
  })

  it('🔴 이동에는 재인증이 없다 — reauth: true 여도 다이얼로그 없이 바로 나간다', async () => {
    const { editor, fake } = await mountRoleEditor({ reauth: true })
    expect(await editor.move(editor.roles.value[0]!, 'down')).toBe(true)
    expect(fake.api.move).toHaveBeenCalledWith(1n, { displayOrder: 1 })
    expect(editor.reauthDialog.value.modelValue).toBe(false)
  })

  it('이동은 선택 · 폼을 건드리지 않는다', async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    await editor.move(editor.roles.value[0]!, 'down')
    expect(editor.selected.value?.roleNo).toBe(2n)
    expect(editor.form.value.roleName).toBe('운영팀')
  })
})

describe('자기 직책', () => {
  it('🔴 자기 직책 수정에 성공하면 재조회 · 재선택 뒤 onSelfRoleSaved 를 부른다', async () => {
    const onSelfRoleSaved = vi.fn()
    const { editor, me } = await mountRoleEditor({ onSelfRoleSaved })
    onSelfRoleSaved.mockImplementation(() => {
      expect(editor.selected.value?.revision).toBe(5)
    })
    me.value = '운영자'
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀' // 🔴 이름을 바꿔도 요청 전에 잡아 둔 판정을 쓴다
    expect(await editor.save()).toBe(true)
    expect(onSelfRoleSaved).toHaveBeenCalledTimes(1)
  })

  it('다른 역할 수정 · 실패 · 만들기에서는 부르지 않는다', async () => {
    const onSelfRoleSaved = vi.fn()
    const { editor, me, fake } = await mountRoleEditor({ onSelfRoleSaved })
    me.value = '운영자'
    editor.select(editor.roles.value[2]!)
    editor.form.value.roleName = '감사팀'
    await editor.save()
    editor.select(editor.roles.value.find((role) => role.roleNo === 2n)!)
    editor.form.value.roleName = '운영팀'
    fake.api.update.mockRejectedValueOnce(apiError('ERR_COMMON_INTERNAL', 500))
    await editor.save()
    editor.startCreate()
    editor.form.value.roleName = '운영자 2'
    await editor.save()
    expect(onSelfRoleSaved).not.toHaveBeenCalled()
  })

  it('onSelfRoleSaved 가 던지면 save() 가 reject 한다', async () => {
    const boom = new Error('boom')
    const { editor, me } = await mountRoleEditor({
      onSelfRoleSaved: () => {
        throw boom
      },
    })
    me.value = '운영자'
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    await expect(editor.save()).rejects.toBe(boom)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useRoleEditor.write.render.test.ts`
Expected: FAIL — `editor.save is not a function`(그리고 move · remove 도 같은 꼴)

- [ ] **Step 3: 구현**

`useRoleEditor.ts` 에서:

모듈 상수 · 함수 추가(`function emptyForm()` 바로 위):

```ts
/** 저장 폼이 그리는 필드 — 이 키의 서버 검증 오류만 처리됨(전역 토스트 없음)이다. */
const SAVE_FIELDS = ['roleName', 'isDefault', 'permissions'] as const

function defaultDialogText(action: RoleEditorAction, role: AdminRole | null): RoleDialogText {
  if (action === 'create') return { title: '역할 만들기', message: '새 역할을 만듭니다.' }
  // 🔴 원본(`selected`)의 이름이다 — 폼에서 고친 새 이름이 아니다.
  const name = role?.roleName ?? ''
  if (action === 'update') return { title: '역할 저장', message: `「${name}」 역할을 저장합니다.` }
  return { title: '역할 삭제', message: `「${name}」 역할을 삭제합니다.` }
}
```

`RoleEditor` 인터페이스의 `canMove` 아래에 추가:

```ts
/** 성공 true · 취소 · 실패 · 막힘 false. */
save: () => Promise<boolean>
remove: () => Promise<boolean>
move: (role: R, direction: 'up' | 'down') => Promise<boolean>
```

`useRoleEditor()` 안, `startCreate()` 뒤 `void reload()` 앞에 쓰기 절을 추가:

```ts
// ── 쓰기 ──────────────────────────────────────────────────────────

interface WriteStep<T> {
  gate: 'none' | 'confirm' | 'reauth'
  text: RoleDialogText
  action: (ctx: RoleWriteContext) => Promise<T>
  onSuccess?: (result: T) => void
  onConflict?: () => void
  fields?: readonly string[]
}

/** 결과와 함께 요청이 실제로 나갔는지(관문 취소가 아닌지)를 돌려준다 — 재조회는 나갔을 때만 한다. */
async function write<T>(step: WriteStep<T>): Promise<{ ok: boolean; attempted: boolean }> {
  let attempted = false
  const action = (ctx: RoleWriteContext): Promise<T> => {
    attempted = true
    return step.action(ctx)
  }
  const common = { onSuccess: step.onSuccess, onConflict: step.onConflict, fields: step.fields }
  let ok: boolean
  if (step.gate === 'reauth') {
    ok = await flow.run({ gate: 'reauth', ...step.text, ...common, action: (ctx) => action(ctx) })
  } else if (step.gate === 'confirm') {
    // 🔴 이 composable 의 확인 관문은 삭제뿐이다 — 지운 역할을 되살릴 길이 없다.
    ok = await flow.run({
      gate: 'confirm',
      reversible: false,
      ...step.text,
      ...common,
      action: () => action({}),
    })
  } else {
    ok = await flow.run({ ...common, action: () => action({}) })
  }
  return { ok, attempted }
}

function dialogText(action: RoleEditorAction, role: R | null): RoleDialogText {
  return options.dialogText?.(action, role) ?? defaultDialogText(action, role)
}

function markConflicted(): void {
  conflicted.value = true
}

async function save(): Promise<boolean> {
  if (!canSave.value) return false
  const role = selected.value
  // 🔴 요청 전에 잡아 둔다 — 재조회 뒤에는 원본이 바뀐다.
  const wasSelf = isSelfRole.value
  const roleName = form.value.roleName.trim()
  const isDefault = form.value.isDefault
  const permissions = built()
  // 🔴 `permissions` 는 바뀐 경우에만 싣는다. 늘 실으면 서버의 권한 상승 검사가 바뀌었는지와 무관하게 보낸 배열
  //    전부를 행위자와 대조해, 범위 밖 권한을 가진 역할은 이름조차 못 고친다(hangang `samePermissionSet`).
  const permissionsChanged = !samePermissionList(permissions, snapshot.value)
  let createdRoleNo: bigint | null = null
  const { ok, attempted } = await write<bigint | void>({
    gate: options.reauth ? 'reauth' : 'none',
    text: dialogText(role == null ? 'create' : 'update', role),
    fields: SAVE_FIELDS,
    onConflict: markConflicted,
    action: (ctx) =>
      role == null
        ? api.create({ roleName, isDefault, permissions }, ctx)
        : api.update(
            role.roleNo,
            {
              roleName,
              isDefault,
              revision: role.revision,
              ...(permissionsChanged ? { permissions } : {}),
            },
            ctx,
          ),
    onSuccess: (result) => {
      if (typeof result === 'bigint') createdRoleNo = result
    },
  })
  if (!attempted) return false
  // 🔴 실패해도 다시 조회한다 — 404 는 "목록이 낡았다", 409 는 "상태가 갈렸다" 이다(hangang).
  await reload()
  // 🔴 실패면 선택 · 폼을 그대로 둔다 — 관리자가 고친 값을 잃지 않는다.
  if (!ok) return false
  const targetRoleNo = role == null ? createdRoleNo : role.roleNo
  const next = roles.value.find((item) => item.roleNo === targetRoleNo)
  if (next != null) applySelection(next)
  else if (role == null) clearSelection()
  if (role != null && wasSelf) await options.onSelfRoleSaved?.()
  return true
}

async function remove(): Promise<boolean> {
  const role = selected.value
  if (!canRemove.value || role == null) return false
  const { ok, attempted } = await write({
    // 🔴 재인증이면 그 다이얼로그 하나로 — 문구가 확인을 겸한다. 아니면 되돌릴 수 없다는 확인.
    gate: options.reauth ? 'reauth' : 'confirm',
    text: dialogText('remove', role),
    onConflict: markConflicted,
    action: (ctx) => api.remove(role.roleNo, { revision: role.revision }, ctx),
  })
  if (!attempted) return false
  // 🔴 목록에서 지우는 것은 서버 성공 뒤의 재조회다 — 화면이 먼저 지우지 않는다(hangang §7-2 ④).
  await reload()
  if (!ok) return false
  const first = roles.value[0]
  if (first != null) applySelection(first)
  else clearSelection()
  resetFeedback()
  return true
}

async function move(role: R, direction: 'up' | 'down'): Promise<boolean> {
  // 🔴 이웃 없는 경계(맨 위 · 막내)도 여기서 요청 없이 끝난다.
  const neighbor = neighborOf(role, direction)
  if (!canMove(role, direction) || neighbor == null) return false
  // 🔴 목표값은 「내 순서 ± 1」이 아니라 이웃 행의 `displayOrder` 다. 서버가 구간 재번호라 ±1 은 구멍(삭제가
  //    재번호를 안 한다)이 있으면 200 을 받고도 한 줄도 안 움직인다(hangang).
  const displayOrder = neighbor.displayOrder
  const { ok, attempted } = await write({
    gate: 'none',
    text: { message: '' },
    action: () => api.move(role.roleNo, { displayOrder }),
  })
  if (attempted) await reload()
  return ok
}
```

`return { … }` 의 `canMove,` 다음에 `save,` · `remove,` · `move,` 를 더한다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useRoleEditor.write.render.test.ts packages/admin-ui/src/composables/useRoleEditor.render.test.ts`
Expected: PASS (24 + 20 tests)

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/useRoleEditor.ts packages/admin-ui/src/composables/useRoleEditor.write.render.test.ts
git add packages/admin-ui/src/composables/useRoleEditor.ts packages/admin-ui/src/composables/useRoleEditor.write.render.test.ts
git commit -m "feat(admin-ui): useRoleEditor — 저장 · 삭제 · 이동, revision 충돌 · 자기 직책 훅

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: `SettingsShell`

**Files:**

- Modify: `packages/admin-ui/src/menu/menu.ts` (`joinPath` 를 export)
- Create: `packages/admin-ui/src/layout/SettingsShell.vue`
- Create: `packages/admin-ui/src/layout/settings-shell.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts` (`역할 · 설정` 절에 추가)

**Interfaces:**

- Consumes: `filterMenu` · `MenuNode` · `joinPath`(menu.ts), `useAdminUi`, `ColumnLayout` · `ColumnPane`, `AdminRouteMeta`.
- Produces: `SettingsShell` props `check?: PermissionCheck` · `forbiddenPath?: string`('/403') · `menuWidth?: string`('240px'), 기본 슬롯(기본 내용 `<RouterView />`).

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/layout/settings-shell.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, type Component } from 'vue'
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type Router,
  type RouteRecordRaw,
} from 'vue-router'
import { createPermissionCheck } from '@ssworks/admin-shared'
import { createAdminUi, type AdminUserInfo } from '../context/admin-ui.js'
import { vuetify } from '../test/setup.js'
import SettingsShell from './SettingsShell.vue'

// 정본: hangang-home apps/admin/src/pages/settings/settings.render.test.ts — 자식 meta 파생 · 권한 있는 첫 자식으로
//       보내기 · 재진입 리다이렉트를 실제 vue-router 로 잰다.

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const page = (text: string): Component => ({ render: () => h('p', text) })

const CHILDREN: RouteRecordRaw[] = [
  { path: '', component: page('INDEX') },
  {
    path: 'site',
    component: page('SITE'),
    meta: { title: '사이트', permissions: ['setting:read'] },
  },
  {
    path: 'roles',
    component: page('ROLES'),
    meta: {
      title: '역할',
      permissions: ['org.roles:read'],
      menu: { title: '역할 관리', icon: 'mdi-account-key' },
    },
  },
  {
    path: 'roles/:roleNo',
    component: page('ROLE-DETAIL'),
    meta: { title: '역할 상세', permissions: ['org.roles:read'] },
  },
  { path: 'about', component: page('ABOUT'), meta: { title: '정보' } },
]

interface SetupOptions {
  permissions?: string[]
  children?: RouteRecordRaw[]
  /** setupLayouts 처럼 `path: ''` 래퍼 아래에 셸을 둔다. */
  wrap?: boolean
  basePath?: string
  shellProps?: Record<string, unknown>
  slots?: Record<string, () => unknown>
  start?: string
}

async function setup(options: SetupOptions = {}): Promise<Router> {
  const shell: Component = {
    render: () => h(SettingsShell, options.shellProps ?? {}, options.slots),
  }
  const basePath = options.basePath ?? '/settings'
  const children = options.children ?? CHILDREN
  const settings: RouteRecordRaw = options.wrap
    ? {
        path: basePath,
        component: { render: () => h(RouterView) },
        children: [{ path: '', component: shell, children }],
      }
    : { path: basePath, component: shell, children }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: page('HOME') },
      { path: '/403', component: page('FORBIDDEN') },
      { path: '/denied', component: page('DENIED') },
      settings,
    ],
  })
  const user: AdminUserInfo = {
    userId: 'u',
    userName: '김',
    permissions: options.permissions ?? ['*'],
  }
  wrapper = mount(
    { render: () => h(RouterView) },
    {
      attachTo: document.body,
      global: {
        plugins: [vuetify, router, createAdminUi({ user: () => user, logout: async () => {} })],
      },
    },
  )
  await router.push(options.start ?? '/settings')
  await flushPromises()
  return router
}

const menuTitles = () =>
  [...document.querySelectorAll('.v-list-item-title')].map((el) => el.textContent?.trim())
const menuLinks = () =>
  [...document.querySelectorAll('a.v-list-item')].map((el) => el.getAttribute('href'))

describe('SettingsShell — 메뉴', () => {
  it('직속 자식이 메뉴가 된다 — 인덱스와 동적 세그먼트 자식은 빠지고, 제목은 meta.menu.title → meta.title', async () => {
    await setup({ start: '/settings/about' })
    expect(menuTitles()).toEqual(['사이트', '역할 관리', '정보'])
    expect(menuLinks()).toEqual(['/settings/site', '/settings/roles', '/settings/about'])
    expect(document.querySelector('.mdi-account-key')).not.toBeNull()
  })

  it('권한으로 거른다 — 권한 선언이 없는 자식은 공개다', async () => {
    await setup({ permissions: ['org.roles:read'], start: '/settings/about' })
    expect(menuTitles()).toEqual(['역할 관리', '정보'])
  })

  it('check prop 을 주면 사용자 대신 그것으로 판정한다', async () => {
    await setup({
      shellProps: { check: createPermissionCheck(() => ['setting:read']) },
      start: '/settings/about',
    })
    expect(menuTitles()).toEqual(['사이트', '정보'])
  })

  it('자식 페이지는 셸의 RouterView 에 그려진다', async () => {
    await setup({ start: '/settings/about' })
    expect(document.body.textContent).toContain('ABOUT')
  })

  it('기본 슬롯을 주면 RouterView 대신 그린다', async () => {
    await setup({ start: '/settings/about', slots: { default: () => h('p', 'CUSTOM') } })
    expect(document.body.textContent).toContain('CUSTOM')
    expect(document.body.textContent).not.toContain('ABOUT')
  })
})

describe('SettingsShell — 리다이렉트', () => {
  it('🔴 부모로 들어오면 걸러진 첫 자식으로 replace 한다 — 고정 자식이 아니다', async () => {
    const router = await setup({ permissions: ['org.roles:read'] })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/roles'))
    expect(document.body.textContent).toContain('ROLES')
  })

  it('🔴 자식에서 부모로 다시 들어와도 다시 보낸다 — 셸은 다시 마운트되지 않는다', async () => {
    const router = await setup({ start: '/settings/about' })
    expect(router.currentRoute.value.path).toBe('/settings/about')
    await router.push('/settings')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/site'))
  })

  it('허용된 자식이 없으면 forbiddenPath 로 보낸다 — 기본 /403', async () => {
    const children: RouteRecordRaw[] = [
      { path: 'site', component: page('SITE'), meta: { permissions: ['setting:read'] } },
    ]
    const router = await setup({ permissions: [], children })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/403'))
  })

  it('forbiddenPath 를 바꿀 수 있다', async () => {
    const children: RouteRecordRaw[] = [
      { path: 'site', component: page('SITE'), meta: { permissions: ['setting:read'] } },
    ]
    const router = await setup({
      permissions: [],
      children,
      shellProps: { forbiddenPath: '/denied' },
    })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/denied'))
  })

  it("🔴 setupLayouts 처럼 path '' 래퍼 아래에서도 셸의 레코드를 잡는다", async () => {
    const router = await setup({ wrap: true })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/site'))
    expect(menuTitles()).toEqual(['사이트', '역할 관리', '정보'])
  })
})

describe('SettingsShell — 잘못 쓴 경우', () => {
  it('RouterView 밖에서 쓰면 안내하며 던진다', () => {
    const errors: unknown[] = []
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: page('HOME') }],
    })
    wrapper = mount(SettingsShell, {
      global: {
        plugins: [vuetify, router, createAdminUi({ user: () => null, logout: async () => {} })],
        config: {
          errorHandler: (error) => {
            errors.push(error)
          },
        },
      },
    })
    expect(String(errors[0])).toContain('RouterView')
  })

  it('동적 세그먼트가 있는 부모는 경고하고 메뉴를 그리지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await setup({ basePath: '/projects/:id/settings', start: '/projects/1/settings/about' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/projects/:id/settings'))
    expect(menuTitles()).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/layout/settings-shell.render.test.ts`
Expected: FAIL — `Failed to resolve import "./SettingsShell.vue"`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/menu/menu.ts` 의 `joinPath` 를 export 하고 주석에 한 줄 더한다:

```ts
/**
 * vue-router 가 레코드를 등록할 때와 같은 규칙으로 전체 경로를 만든다 — `/` 로 시작하면 그대로,
 * `''` 이면 부모 경로, 아니면 부모 경로에 슬래시 하나로 잇는다(부모가 `/` 로 끝나면 덧붙이지 않는다).
 * 패키지 내부용(`SettingsShell` 이 같은 규칙을 쓴다) — index 에서 내보내지 않는다.
 */
export function joinPath(parent: string | undefined, path: string): string {
```

`packages/admin-ui/src/layout/SettingsShell.vue`:

```vue
<script setup lang="ts">
  import { computed, inject, watch } from 'vue'
  import { matchedRouteKey, RouterView, useRoute, useRouter } from 'vue-router'
  import { VList, VListItem } from 'vuetify/components'
  import { createPermissionCheck, type PermissionCheck } from '@ssworks/admin-shared'
  import ColumnLayout from '../components/ui/ColumnLayout.vue'
  import ColumnPane from '../components/ui/ColumnPane.vue'
  import { useAdminUi } from '../context/admin-ui.js'
  import { filterMenu, joinPath, type MenuNode } from '../menu/menu.js'
  import type { AdminRouteMeta } from '../router/route-meta.js'

  // 정본: hangang-home apps/admin/src/pages/settings/index.vue
  // 바꾼 점:
  //  ① 라우트 표 직접 import(`routes.find(r => r.path === '/settings')`)를 vue-router 의 `matchedRouteKey` 주입으로.
  //     이 셸(또는 셸을 품은 페이지)을 그린 `RouterView` 의 레코드다 — 패키지는 소비자의 라우트 표를 모른다.
  //  ② `usePermission()` 직접 import 를 `check` prop 으로. 안 주면 `useAdminUi().user()` 의 권한(MainMenu 와 같음).
  //  ③ 판정을 킷 `filterMenu` 로 — 빈 권한은 공개, `permissions` AND, `anyPermissions` OR(가드와 같은 meta).
  //  ④ 인덱스(`path: ''`) · 동적 세그먼트 자식을 뺀다 — 메뉴로 갈 수 있는 자리가 아니다. 제목은 `meta.menu.title` 우선.
  //  ⑤ `forbiddenPath` · `menuWidth` prop, 기본 슬롯(기본 내용 `RouterView`).
  //
  // 🔴 **좌측 메뉴를 손으로 나열하지 않는다** — 자식 `meta` 에서 파생한다. 메뉴가 자기 권한을 따로 들면 둘이 갈릴 때
  //    메뉴는 보이는데 들어가면 403 이 된다.
  // 🔴 **`RouterView` 를 `ColumnPane` 으로 감싸지 않는다.** 자식 페이지가 자기 루트에서 `ColumnPane` 을 내고,
  //    fragment 로 메뉴 pane 과 나란히 놓인다(hangang 구조).

  const props = withDefaults(
    defineProps<{
      /** 생략하면 `useAdminUi().user()` 의 permissions 로 판정한다. */
      check?: PermissionCheck
      /** 허용된 자식이 하나도 없을 때. 가드 기본값과 같다. */
      forbiddenPath?: string
      menuWidth?: string
    }>(),
    { check: undefined, forbiddenPath: '/403', menuWidth: '240px' },
  )

  defineSlots<{ default?(): unknown }>()

  const matched = inject(matchedRouteKey, null)
  if (matched == null) {
    throw new Error(
      '[admin-ui] SettingsShell 은 RouterView 가 그린 라우트 컴포넌트 안에서 써야 한다 — 자기 라우트 레코드를 찾지 못했다',
    )
  }
  const route = useRoute()
  const router = useRouter()
  const ui = useAdminUi()
  // 🔴 사용자는 게터로 읽는다 — 값을 캐시하면 로그아웃 · `refresh()` 뒤에도 이전 권한의 메뉴가 남는다.
  const contextCheck = createPermissionCheck(() => ui.user()?.permissions ?? [])

  const isDynamic = (path: string) => path.includes(':')
  const trimSlash = (path: string) =>
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

  const basePath = computed(() => matched.value?.path ?? '')

  watch(
    basePath,
    (path) => {
      if (isDynamic(path)) {
        console.warn(
          `[admin-ui] SettingsShell 은 동적 세그먼트가 있는 부모 경로(${path})를 지원하지 않는다 — 메뉴를 그리지 않는다`,
        )
      }
    },
    { immediate: true },
  )

  const items = computed<MenuNode[]>(() => {
    const record = matched.value
    if (record == null || isDynamic(record.path)) return []
    return (record.children ?? [])
      .filter((child) => child.path !== '' && !isDynamic(child.path))
      .map((child) => {
        const meta = child.meta as AdminRouteMeta | undefined
        const to = joinPath(record.path, child.path)
        const node: MenuNode = {
          id: to,
          title: meta?.menu?.title ?? meta?.title ?? to,
          to,
          permissions: meta?.permissions,
          anyPermissions: meta?.anyPermissions,
        }
        if (meta?.menu?.icon != null) node.icon = meta.menu.icon
        return node
      })
  })

  const visibleItems = computed(() => filterMenu(items.value, props.check ?? contextCheck))

  /**
   * 🔴 **`watch` 로 건다 — `setup`/`onMounted` 에서 하면 첫 진입에서만 돈다.** `/settings/roles → /settings` 이동에서
   *    셸 레코드가 같아 부모는 patch 될 뿐 다시 마운트되지 않고, 자식 매칭이 없어 오른쪽이 빈다. 사이드바의 "설정" 을
   *    다시 누르는 것이 가장 흔한 경로다(hangang).
   * 🔴 **대상은 고정 자식이 아니라 걸러진 첫 항목이다.** 고정 자식으로 밀면 그 권한 하나만 없는 관리자가 설정 전체를
   *    못 쓴다. 걸러진 목록이 비면 `forbiddenPath` — 빈 화면이 아니라 "접근 권한 없음" 문장을 낸다.
   * 🔴 `replace` 다 — 뒤로 가기가 부모와 첫 자식 사이에 갇히지 않는다.
   */
  watch(
    () => route.path,
    (path) => {
      if (isDynamic(basePath.value) || trimSlash(path) !== trimSlash(basePath.value)) return
      const first = visibleItems.value[0]
      void router.replace(first?.to ?? props.forbiddenPath)
    },
    { immediate: true },
  )
</script>

<template>
  <ColumnLayout class="pa-3" gap="12px">
    <ColumnPane :width="props.menuWidth">
      <VList nav>
        <VListItem
          v-for="item in visibleItems"
          :key="item.id"
          :prepend-icon="item.icon"
          :title="item.title"
          :to="item.to"
        />
      </VList>
    </ColumnPane>
    <slot><RouterView /></slot>
  </ColumnLayout>
</template>
```

`packages/admin-ui/src/index.ts` 의 `역할 · 설정` 절 끝에 추가:

```ts
export { default as SettingsShell } from './layout/SettingsShell.vue'
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/layout/settings-shell.render.test.ts packages/admin-ui/src/menu`
Expected: PASS (settings-shell 12 tests, menu 기존 테스트 그대로)

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/layout/SettingsShell.vue packages/admin-ui/src/layout/settings-shell.render.test.ts packages/admin-ui/src/menu/menu.ts packages/admin-ui/src/index.ts
git add packages/admin-ui/src/layout/SettingsShell.vue packages/admin-ui/src/layout/settings-shell.render.test.ts packages/admin-ui/src/menu/menu.ts packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): SettingsShell — 라우트 자식 meta 파생 메뉴, 허용된 첫 자식으로 재진입 리다이렉트

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: README · changeset · 문서 · 전체 검증

**Files:**

- Modify: `packages/admin-ui/README.md` (`## 목록 · 쓰기` 절 고쳐 쓰기, 새 `## 역할 · 설정` 절)
- Create: `.changeset/admin-ui-roles-settings.md`
- Modify: `docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md` (§2-1 제목 줄)
- Modify: `docs/superpowers/specs/2026-10-04-admin-ui-roles-settings-design.md` (끝에 §11)
- Modify: `CLAUDE.md` (진행표) · `docs/HANDOFF.md` · `docs/01-phase0.md` (§8)

**Interfaces:**

- Consumes: Task 1~8 의 공개 API 이름 그대로.

- [ ] **Step 1: README `## 목록 · 쓰기` 고쳐 쓰기**

`packages/admin-ui/README.md` 의 ts 예시에서 다음 블록을

```ts
// 폼이 그리지 않는 키(루트 '' · 중첩 경로 · 재인증의 currentPassword …)를 모아 보여 준다.
const formKeys = ['userId', 'userName']
const otherErrors = computed(() =>
  Object.entries(fieldErrors.value)
    .filter(([key]) => !formKeys.includes(key))
    .flatMap(([, messages]) => messages),
)
```

다음으로 바꾼다:

```ts
function saveUser() {
  void run({
    action: () => api.post('/users', form.value),
    // 폼이 그리는 키. 검증 오류의 키가 전부 여기 있을 때만 처리됨(전역 토스트 없음)
    fields: ['userId', 'userName'],
    onSuccess: () => reload(),
  })
}
```

vue 예시에서 다음 세 줄을 지운다:

```vue
<VAlert v-if="otherErrors.length" type="error">
  <div v-for="message in otherErrors" :key="message">{{ message }}</div>
</VAlert>
```

글머리표 중 `- 🔴 필드 오류는 처리됨으로 표시돼 전역 토스트가 뜨지 않는다 — …` 한 줄을 다음 두 줄로 바꾼다:

```md
- 🔴 검증 오류는 `fields` 가 키를 **전부** 덮을 때만 처리됨으로 표시돼 전역 토스트가 뜨지 않는다. 하나라도 밖이면(루트 `''` · 중첩 경로 포함) 전역 토스트가 알린다 — `fields` 를 안 주면 늘 그렇다. `fieldErrors` 는 어느 경우든 채운다. 키는 정확히 일치해야 한다(`permissions` 는 `permissions.3` 을 덮지 않는다).
- 재인증 관문의 `currentPassword` 검증 오류는 재인증 다이얼로그 안에 보이고, 다이얼로그는 열린 채 남는다.
```

- [ ] **Step 2: README 에 `## 역할 · 설정` 절 추가**

`## 목록 · 쓰기` 절 끝(파일 끝)에 추가:

````md
## 역할 · 설정

```ts
const categories: PermissionMatrixCategory[] = [
  {
    id: 'org',
    label: '조직',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'write', label: '편집' },
    ],
    rows: [
      { resource: 'org.users', label: '직원' },
      { resource: 'org.roles', label: '역할' },
    ],
  },
]

const {
  roles,
  selected,
  select,
  startCreate,
  form,
  matrix,
  canToggleAll,
  conflicted,
  canSave,
  save,
  remove,
  move,
  canMove,
  submitting,
  fieldErrors,
  confirmDialog,
  reauthDialog,
} = useRoleEditor({
  api: rolesApi, // list · create · update · remove · move — 프로젝트 API 어댑터
  permissions: permissions.ALL_PERMISSION_VALUES,
  canWrite: () => check.hasPermission(PERMISSIONS.ORG_ROLES_WRITE),
  implies: { 'org.users:write': ['org.users:read'], 'org.roles:write': ['org.roles:read'] },
  reauth: true,
  onSelfRoleSaved: async () => {
    await appStore.refresh()
    if (!check.hasPermission(PERMISSIONS.ORG_ROLES_READ)) await router.replace('/403')
  },
})
```

```vue
<VTextField
  v-model="form.roleName"
  label="역할 이름"
  name="roleName"
  :error-messages="fieldErrors.roleName"
/>
<VSwitch v-model="form.isAll" :disabled="!canToggleAll" label="전체 권한" />
<VAlert
  v-if="conflicted"
  type="warning"
>다른 사람이 먼저 바꿨습니다. 역할을 다시 선택하면 최신 값으로 열립니다.</VAlert>
<PermissionMatrix v-bind="matrix" :categories="categories" />
<VBtn :disabled="!canSave" :loading="submitting" @click="onSave">저장</VBtn>
<ConfirmDialog v-bind="confirmDialog" />
<ReauthDialog v-bind="reauthDialog" />
```

- 템플릿 테스트에서 `assertMatrixCoversPermissions(categories, permissions.ALL_PERMISSION_VALUES)` 를 부른다 — 권한을 카탈로그에 더하고 매트릭스에 안 넣으면 그 권한은 화면에서 줄 길이 없다.
- 🔴 전체 권한은 매트릭스 행이 아니라 `form.isAll` 스위치다. `categories` 에 `'*'` 행을 만들지 않는다.
- 어댑터 `list()` 는 전량을 `displayOrder` 오름차순으로 준다 — 쪽을 나누는 서버면 끝까지 받아 이어 붙인다.
- 수정 · 삭제 본문에는 `revision` 이 실린다. 서버는 불일치에 409 `ERR_COMMON_REVISION_CONFLICT` 를 보낸다. 이동은 `revision` 과 무관하고 재인증도 없다.
- 성공 문구는 `save()` · `remove()` · `move()` 가 `true` 를 돌려줄 때 화면이 띄운다. 처리 안 된 실패는 전역 `onError` 가 알린다.
- `isDirty` 를 `useDirtyGuard` 에 이으면 다른 역할로 옮길 때 경고할 수 있다.
- 관문 문구의 용어(직책 · 권한 그룹)는 `dialogText` 로 바꾼다.

### 설정 셸

```ts
defineAdminRoute<Permission>({
  path: '/settings',
  component: () => import('./pages/settings.vue'), // <SettingsShell />
  meta: { anyPermissions: [P.SETTING_READ, P.ORG_ROLES_READ] }, // 🔴 자식 권한의 합집합 이상
  children: [
    { path: 'site', component: SitePage, meta: { title: '사이트', permissions: [P.SETTING_READ] } },
    {
      path: 'roles',
      component: RolesPage,
      meta: { title: '역할', permissions: [P.ORG_ROLES_READ], menu: { icon: 'mdi-account-key' } },
    },
  ],
})
```

- 메뉴는 직속 자식의 `meta` 에서 만든다(인덱스 `path: ''` · `:id` 자식 제외, 제목은 `meta.menu.title` → `meta.title`). 부모로 들어오면 권한이 있는 첫 자식으로 보내고, 없으면 `forbiddenPath`(기본 `/403`).
- 🔴 부모의 `anyPermissions` 가 자식 권한을 덮지 않으면 가드가 셸을 열기 전에 막는다 — 라우트 테스트에서 `assertParentAnyPermissionsCoverChildren(routes)` 를 부른다.
- 설정 자식은 사이드바에 올리지 않는다(`buildMenu` 의 `depth: 1` 기본값).
- 자식 페이지는 자기 루트에서 `ColumnPane` 을 낸다 — 셸의 메뉴 pane 옆에 나란히 붙는다.
````

- [ ] **Step 3: changeset**

`.changeset/admin-ui-roles-settings.md`:

```md
---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

PR #3b — 역할 · 설정.

- admin-shared 새 스키마: `adminRoleSchema` · `adminRoleCreateSchema` · `adminRoleUpdateSchema` · `adminRoleMoveSchema` · `adminRoleRemoveSchema` 와 각 타입. 🔴 수정 · 삭제 본문에 `revision` 이 필수다. 이동은 `revision` 을 싣지도 올리지도 않는다.
- admin-ui 새 API: `PermissionMatrix` · `assertMatrixCoversPermissions` · `useRoleEditor` · `SettingsShell`, 앱 스토어 `refresh()`.
- `useWriteFlow` 의 `run({ fields })`: 검증 오류는 키가 전부 `fields` 안일 때만 처리됨(전역 토스트 없음)이다. `fields` 를 안 주면 `fieldErrors` 는 채우되 전역 토스트도 뜬다 — 폼을 그리는 쓰기는 `fields` 를 넘길 것. 재인증 관문의 `currentPassword` 오류는 다이얼로그 안에 보인다.
- 서버 계약: 역할 목록은 전량 · `displayOrder` 오름차순, revision 불일치는 409 `ERR_COMMON_REVISION_CONFLICT`, 이동 목표는 이웃의 `displayOrder` 이고 서버가 구간을 재번호한다.
```

- [ ] **Step 4: 스펙 · 진행 문서**

`docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md` 의 줄

```md
### 2-1. PR #3 경계 결정 (2026-10-03, 결정 문서 https://claude.ai/artifact/DXSqKqAoqUuYAQRyurtm9u)
```

을 다음 두 단락으로 바꾼다:

```md
### 2-1. PR #3 경계 결정 (2026-10-03)

결정 문서는 세션 아티팩트였고 지금은 없다. 아래 표가 정본이다.
```

`docs/superpowers/specs/2026-10-04-admin-ui-roles-settings-design.md` 끝에 추가:

```md
## 11. 구현 중 정정 (2026-10-04)

- **R1 — refine 금지의 근거를 고쳤다(§4-1).** zod 4.6.5 에서 refinement 가 있는 객체 스키마의 `.extend()` 는 동작하고, 던지는 것은 `.omit()` · `.pick()` 이다. 결론은 같다 — 프로젝트가 필드를 덜어 내는 길과 §10 의 `revision` 끄는 경로(`.omit({ revision: true })`)를 막지 않는다.
- **R2 — `joinPath` 를 `menu.ts` 에서 export 한다**(패키지 내부용, index 에는 없음). `SettingsShell` 이 `buildMenu` 와 같은 경로 규칙을 쓴다.
```

이 Task 를 실행하는 중에 플랜과 다르게 구현한 것이 더 생겼으면 R3 부터 같은 꼴로 더한다(ledger 의 Ruling 을 옮긴다).

`CLAUDE.md` 진행표에서 다음 행을

```md
| **Phase 1 PR #3b~3e — 역할·설정 / 계정·세션 / 조직(he-tree) / 약관(CodeMirror)** | **다음** | 위 스펙 §2-1 · `docs/phase0-reports/fe-pages.md` §2 |
```

다음 두 행으로 바꾼다(정렬은 Step 5 의 prettier 가 맞춘다):

```md
| Phase 1 PR #3b — `PermissionMatrix` · `useRoleEditor` · `SettingsShell` · 역할 스키마 · `useWriteFlow` `fields` | 완료 | 스펙 `docs/superpowers/specs/2026-10-04-admin-ui-roles-settings-design.md` · 플랜 `docs/superpowers/plans/2026-10-04-admin-ui-roles-settings.md` |
| **Phase 1 PR #3c~3e — 계정·세션 / 조직(he-tree) / 약관(CodeMirror)** | **다음** | 3a 스펙 §2-1 · `docs/phase0-reports/fe-pages.md` §2 |
```

`docs/HANDOFF.md`:

- 11행(`@ssworks/admin-ui`) 끝의 `… 에서 구현 완료. 429 테스트.` 를 `… 에서 구현 완료. **PR #3b**(\`PermissionMatrix\` · \`useRoleEditor\` · \`SettingsShell\` · 앱 스토어 \`refresh()\` · \`useWriteFlow\` \`fields\`)는 \`feat/admin-ui-roles-settings\` 에서 구현 완료. <N> 테스트.` 로 바꾼다(`<N>` 은 Step 5 의 admin-ui 테스트 수).
- 10행(`@ssworks/admin-shared`)의 `54 테스트` 를 Step 5 의 admin-shared 테스트 수로 바꾼다.
- 15행(다음 플랜)을 `PR #3c(계정·세션 — \`SessionTable\` · \`useSessions\` · \`TemporaryPasswordDialog\` · \`PasswordChangeForm\`). 직전 PR #3b: 스펙 \`docs/superpowers/specs/2026-10-04-admin-ui-roles-settings-design.md\` · 플랜 \`docs/superpowers/plans/2026-10-04-admin-ui-roles-settings.md\`` 로 바꾼다.
- 21행 끝의 `— **PR #3a 완료**, 다음은 **PR #3b**(\`docs/phase0-reports/fe-pages.md\` §2).`를`— **PR #3a · #3b 완료**, 다음은 **PR #3c**(\`docs/phase0-reports/fe-pages.md\` §2).` 로 바꾼다.
- `## 발행 전에 사람이 해야 하는 것` 목록 끝에 추가: `- **Version Packages PR #2 는 3b 가 \`main\` 에 들어온 뒤 머지한다** — 0.3.0 에 3a + 3b 가 함께 실린다(3b 스펙 §8). 로컬 \`main\` 의 커밋은 PR #2 머지 전에 push 한다.`

`docs/01-phase0.md`:

- 182행(`@ssworks/admin-ui`) 셀 끝의 `… 누적 **429 테스트**(admin-ui) |` 를 `… 누적 **429 테스트**(admin-ui). **PR #3b 완료**(브랜치 \`feat/admin-ui-roles-settings\`) — \`PermissionMatrix\` · \`useRoleEditor\` · \`SettingsShell\` · 앱 스토어 \`refresh()\` · \`useWriteFlow\` \`fields\`, admin-shared 역할 스키마. 누적 **<N> 테스트**(admin-ui) |` 로 바꾼다.
- 185행 `다음: admin-ui PR #3b(PermissionMatrix/useRoleEditor/SettingsShell …), 그 뒤 admin-server.` 를 `다음: admin-ui PR #3c(계정·세션), 3d(조직), 3e(약관), 그 뒤 admin-server.` 로 바꾼다.

- [ ] **Step 5: 전체 검증 · 테스트 수 채우기**

Run: `pnpm check`
Expected: lint → typecheck → test → build 모두 초록. 출력의 패키지별 `Tests  N passed` 에서 admin-shared · admin-ui 수를 읽어 Step 4 의 `<N>` 자리에 채운다.

Run: `pnpm exec prettier --write packages/admin-ui/README.md .changeset/admin-ui-roles-settings.md CLAUDE.md docs/HANDOFF.md docs/01-phase0.md docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md docs/superpowers/specs/2026-10-04-admin-ui-roles-settings-design.md`
Run: `pnpm format:check`
Expected: 초록

- [ ] **Step 6: 스모크**

`.claude/commands/smoke.md` 절차를 그대로 따른다 — 패킹한 tarball 을 임시 소비 앱(Vite + vue + vuetify + vue-router + pinia)에 설치하고, `App.vue` 에서 admin-ui 의 **모든 export**(이번 새 export 포함 — `PermissionMatrix` · `assertMatrixCoversPermissions` · `useRoleEditor` · `SettingsShell`, admin-shared 의 `adminRoleSchema` 등)를 한 번씩 쓴 뒤 `vue-tsc --noEmit` · `vite build` 가 둘 다 통과해야 한다. 임시 폴더는 짧은 실제 경로(`%TEMP%` 바로 아래)에 만들고 끝나면 지운다 — 이 PC 는 긴 경로를 막아 둬서 깊은 경로에서는 pnpm 12 설치가 실패한다.

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-ui/README.md .changeset/admin-ui-roles-settings.md CLAUDE.md docs/HANDOFF.md docs/01-phase0.md docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md docs/superpowers/specs/2026-10-04-admin-ui-roles-settings-design.md
git commit -m "docs: PR #3b — README 역할 · 설정 절, useWriteFlow fields, changeset, 진행 문서

Co-Authored-By: Claude <noreply@anthropic.com>"
```
