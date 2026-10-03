# admin-ui 목록 · 쓰기 기반 (PR #3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@ssworks/admin-ui` 에 서버 페이징 목록(`useServerTable`), 목록 상태 ↔ URL(`useQuerySyncedFilter` + 코덱 층), 쓰기 관문·오류 분류(`useWriteFlow`), 검증 오류 → 필드(`toFieldErrors`)를 넣고, 이중 알림을 막는 오류 계약(`ERR_COMMON_REVISION_CONFLICT` · `ApiError.handled` · 지연 `onError`)을 바꾼다.

**Architecture:** 코덱 층(`query-codec.ts`)은 순수 함수, 동기화 핵심(`useQuerySyncedFilter`)은 코덱을 모르는 콜백형, `useServerTable` 이 `urlSync` 옵션으로 둘을 품는다. `useWriteFlow` 는 `ConfirmDialog`·`ReauthDialog` 에 `v-bind` 할 바인딩을 내고 `ApiError.code` 로 결과를 가른다. 화면에 직접 보인 오류만 `handled` 로 표시하고, `createApiClient` 는 `onError` 를 한 매크로태스크 미뤄 그것을 건너뛴다.

**Tech Stack:** Vue 3.5 · Vuetify 4 · vue-router 4 · zod 4(admin-shared 경유) · vitest 4 + happy-dom · @vue/test-utils · pnpm 12

**Spec:** `docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md`

## Global Constraints

- 새 peer 의존 없음. 소스가 import 하는 외부 패키지는 `vue` · `vue-router` · `@ssworks/admin-shared` · `axios`(기존) 뿐(`peer-deps.test.ts` 가 막는다).
- `import type` 을 분리한다(eslint `consistent-type-imports`). 내부 상대 import 는 `.js` 확장자(`./query-codec.js`). `.vue` 는 그대로.
- `console.log` 금지 — `console.warn`·`console.error` 만.
- 정본에서 가져온 파일은 머리 주석에 `정본: <프로젝트> <경로>` 와 `바꾼 점:` 을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 반환 형태는 ref 묶음(스펙 D6) — 쓰는 쪽이 구조 분해한다. `reactive()` 로 감싸 돌려주지 않는다.
- URL 키: 표는 `page`(1 이면 생략) · `size`(기본값이면 생략) · `sort`(`key:order`, 기본 정렬이면 생략). 코덱 `bool` 은 `'1'`/`'0'` 만.
- 테스트: DOM 이 필요한 파일 머리에 `// @vitest-environment happy-dom`. VDialog 를 여는 테스트는 모듈 최상단에서 `installVisualViewport()`. `data-testid` 를 심지 않는다 — 글자와 `name` 으로 찾는다.
- admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 돌려야 admin-ui 에 보인다(admin-ui 는 `dist/` 를 import 한다).
- 포맷: prettier(세미콜론 없음 · 작은따옴표 · 100자). 커밋 전 `pnpm exec prettier --write <파일>`.
- Windows 에서도 돈다 — `/dev/null` 금지, 셸 명령 대신 `pnpm` 명령을 쓴다.
- 커밋 메시지: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`.
- 테스트 실행은 저장소 루트에서 `pnpm exec vitest run <경로>`.

## 스펙과 다르게 구현하는 세부 (Task 8 에서 스펙 §10 에 기록)

- **R1** — `ERR_COMMON_CONFLICT` 설명은 "상태 전이 충돌" 로 좁힌다. 중복 값에는 이미 `ERR_COMMON_DUPLICATED` 가 있다(스펙은 "중복 · 상태 충돌").
- **R2** — `urlSync` 키 충돌은 환경과 무관하게 `console.error` 후 표 값으로 덮는다. 라이브러리 빌드에서 `import.meta.env.DEV` 는 빌드 시점 상수(`false`)라 소비 앱의 개발 모드를 모른다(스펙은 "개발 빌드에서 throw").
- **R3** — `confirmColor` 는 `gate: 'confirm'` 옵션에만 있다(스펙 주석 "confirm 관문만" 의 타입 표현).

## Review Focus

- **bigint 필터 값** — `filters: () => ({ teamNo: 3n })` 이면 비교 문자열을 만들다 던지면 안 된다(`JSON.stringify` 는 bigint 에서 던진다). 조회가 정상으로 나가야 한다 → Task 5 테스트.
- **반복된 표 키 URL**(`?page=2&page=5`) — 첫 값을 쓰고 화면이 깨지지 않아야 한다 → Task 6 테스트.
- **실행 중에 관문 다이얼로그를 닫음** — 요청은 이미 나갔다. `run()` 은 섣불리 `false` 로 끝나지 말고 요청 결과로 끝나야 한다 → Task 7 테스트.
- **`handled` 를 늦게 표시** — 호출처가 매크로태스크를 한 번 기다린 뒤 표시하면 전역 `onError` 는 이미 불렸다(계약의 경계). 마이크로태스크 안에서는 늦지 않다 → Task 1 테스트.
- **`toQuery` 가 숫자를 돌려줌** — `LocationQueryRaw` 는 숫자를 허용한다. URL 은 문자열로 돌아오므로 비교가 어긋나면 쓰기 ↔ 감시가 반복된다. 한 번만 써야 한다 → Task 4 테스트.

---

### Task 1: 오류 계약 — revision 충돌 코드 · `ApiError.handled` · 지연 `onError`

**Files:**

- Modify: `packages/admin-shared/src/error-codes.ts` (`ERR_COMMON_CONFLICT` 정의부와 `COMMON_ERROR_STATUS`)
- Test: `packages/admin-shared/src/error-codes.test.ts`
- Modify: `packages/admin-ui/src/api/error.ts` (`ApiError` 클래스 필드)
- Modify: `packages/admin-ui/src/api/client.ts` (`request()` 의 `catch`)
- Test: `packages/admin-ui/src/api/client.test.ts`
- Modify: `packages/admin-ui/src/wiring.integration.test.ts`

**Interfaces:**

- Produces: `CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT === 'ERR_COMMON_REVISION_CONFLICT'`(409). `ApiError#handled: boolean`(기본 false, 쓰기 가능). `createApiClient` 의 `onError` 는 `setTimeout(…, 0)` 뒤에 불리고 그때 `handled` 면 생략.

- [ ] **Step 1: admin-shared 실패 테스트 추가**

`packages/admin-shared/src/error-codes.test.ts` 의 `describe('CommonErrorCodes — 코어 코드 표', …)` 안 마지막에 추가:

```ts
it('revision 충돌은 전용 코드다 — 409, ERR_COMMON_CONFLICT 와 다른 값', () => {
  expect(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT).toBe('ERR_COMMON_REVISION_CONFLICT')
  expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT]).toBe(409)
  expect(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT).not.toBe(
    CommonErrorCodes.ERR_COMMON_CONFLICT,
  )
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-shared/src/error-codes.test.ts`
Expected: FAIL — `expected undefined to be 'ERR_COMMON_REVISION_CONFLICT'`

- [ ] **Step 3: 코드 추가**

`packages/admin-shared/src/error-codes.ts` 에서

```ts
  /** 상태 전이 충돌 · 낙관적 잠금(revision) 불일치 */
  ERR_COMMON_CONFLICT: 'ERR_COMMON_CONFLICT',
```

를 다음으로 바꾼다:

```ts
  /** 상태 전이 충돌(이미 처리됨 · 지금 상태에서 허용되지 않는 전이). 중복 값은 `ERR_COMMON_DUPLICATED` */
  ERR_COMMON_CONFLICT: 'ERR_COMMON_CONFLICT',
  /**
   * 낙관적 잠금(revision) 불일치 — 다른 곳에서 먼저 바뀌었다. 프론트는 다시 불러오기를 안내한다.
   * 🔴 `ERR_COMMON_CONFLICT` 와 가른다. 한 코드에 두 뜻을 실으면 프론트가 "다시 불러오기" 와
   *    "값을 고치세요" 를 구분하지 못한다(gise 역할 폼이 실제로 겪었다).
   */
  ERR_COMMON_REVISION_CONFLICT: 'ERR_COMMON_REVISION_CONFLICT',
```

같은 파일 `COMMON_ERROR_STATUS` 에서 `[CommonErrorCodes.ERR_COMMON_CONFLICT]: 409,` 바로 아래에 추가:

```ts
  [CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT]: 409,
```

- [ ] **Step 4: 통과 확인 · admin-shared 다시 빌드**

Run: `pnpm exec vitest run packages/admin-shared/src/error-codes.test.ts`
Expected: PASS
Run: `pnpm --filter @ssworks/admin-shared build`
Expected: 오류 없이 끝난다

- [ ] **Step 5: client 실패 테스트 추가**

`packages/admin-ui/src/api/client.test.ts` 의 `const ok = …` 줄 아래에 추가:

```ts
/** 🔴 onError 는 한 매크로태스크 뒤에 불린다 — 단언 전에 이것을 기다린다. */
const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
```

`describe('ApiError 정규화 · onError', …)` 블록 끝에 추가:

```ts
it('🔴 onError 는 한 매크로태스크 뒤에 불린다 — 거부 직후에는 아직 안 불렸다', async () => {
  const onError = vi.fn()
  const client = createApiClient({ baseURL: '/api', onError })
  stub(client, () => ({ status: 500, body: { success: false, code: 'ERR_X', message: 'm' } }))
  await client.api.get('/x').catch(() => {})
  expect(onError).not.toHaveBeenCalled()
  await macrotask()
  expect(onError).toHaveBeenCalledTimes(1)
})

it('🔴 catch 에서 handled 를 세우면 onError 를 건너뛴다 — 마이크로태스크를 거쳐도 늦지 않다', async () => {
  const onError = vi.fn()
  const client = createApiClient({ baseURL: '/api', onError })
  stub(client, () => ({ status: 500, body: { success: false, code: 'ERR_X', message: 'm' } }))
  await client.api.get('/x').catch(async (error: ApiError) => {
    await Promise.resolve()
    error.handled = true
  })
  await macrotask()
  expect(onError).not.toHaveBeenCalled()
})

it('handled 를 매크로태스크 뒤에 세우면 이미 늦다 — onError 가 불린다(계약의 경계)', async () => {
  const onError = vi.fn()
  const client = createApiClient({ baseURL: '/api', onError })
  stub(client, () => ({ status: 500, body: { success: false, code: 'ERR_X', message: 'm' } }))
  const error = (await client.api.get('/x').catch((e: unknown) => e)) as ApiError
  await macrotask()
  error.handled = true
  expect(onError).toHaveBeenCalledTimes(1)
})

it('onError 훅이 던져도 격리된다', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const client = createApiClient({
    baseURL: '/api',
    onError: () => {
      throw new Error('boom')
    },
  })
  stub(client, () => ({ status: 500, body: { success: false, code: 'ERR_X', message: 'm' } }))
  await expect(client.api.get('/x')).rejects.toBeInstanceOf(ApiError)
  await macrotask()
  expect(log).toHaveBeenCalledWith('onError 훅 오류', expect.any(Error))
  log.mockRestore()
})
```

- [ ] **Step 6: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/api/client.test.ts`
Expected: FAIL — 첫 새 테스트가 `expected "spy" to not be called` 로 실패(지금은 동기 호출)

- [ ] **Step 7: `ApiError.handled` 와 지연 보고 구현**

`packages/admin-ui/src/api/error.ts` 의 `readonly raw: unknown` 줄 아래에 추가:

```ts
/**
 * 🔴 호출처가 이 오류를 화면에 직접 보였다는 표시(재인증 다이얼로그 안 문구 · 필드 오류 · 충돌 안내).
 *    `createApiClient` 는 `onError` 를 한 매크로태스크 뒤에 부르고, 그때 이 값이 true 면 건너뛴다 —
 *    전역 토스트로 두 번 알리지 않는다. `catch` 안에서 **동기로**(또는 마이크로태스크 안에서) 세운다.
 *    타이머를 한 번이라도 기다린 뒤 세우면 이미 늦다.
 */
handled = false
```

`packages/admin-ui/src/api/client.ts` 의 `request()` 에서

```ts
    } catch (error) {
      const apiError = toApiError(error)
      try {
        onError?.(apiError)
      } catch (hookError) {
        console.error('onError 훅 오류', hookError)
      }
      throw apiError
    }
```

를 다음으로 바꾼다:

```ts
    } catch (error) {
      const apiError = toApiError(error)
      if (onError) {
        // 🔴 한 매크로태스크 뒤에 부른다. 호출처의 await 연쇄와 catch 는 전부 마이크로태스크라 그
        //    사이에 끝난다 — 거기서 `handled` 를 세운 오류(useWriteFlow 가 다이얼로그·필드에 직접
        //    보인 것)는 전역 토스트로 두 번 알리지 않는다.
        setTimeout(() => {
          if (apiError.handled) return
          try {
            onError(apiError)
          } catch (hookError) {
            console.error('onError 훅 오류', hookError)
          }
        }, 0)
      }
      throw apiError
    }
```

같은 파일 `ApiClientOptions` 의 `onError` JSDoc 을 다음으로 바꾼다:

```ts
/**
 * `api.*` 가 거부하는 최종 실패마다 한 번, **한 매크로태스크 뒤에**. 갱신으로 복구되는 중간 401 은
 * 안 불린다. 호출처가 `error.handled = true` 로 표시한 오류도 안 불린다(이미 화면에 보였다).
 */
```

- [ ] **Step 8: 기존 client 테스트를 새 타이밍에 맞춘다**

`packages/admin-ui/src/api/client.test.ts` 에서 아래 다섯 테스트의 `onError` 단언 **바로 앞**에 `await macrotask()` 한 줄을 넣는다:

1. `'200 인데 success:false 면 ApiError 로 거부한다'` — `expect(onError).toHaveBeenCalledTimes(1)` 앞
2. `'실패 봉투 → ApiError{status,code,message,details}'` — `expect(onError).toHaveBeenCalledTimes(1)` 앞
3. `'네트워크 오류는 status 가 undefined'` — `expect(onError).toHaveBeenCalledTimes(1)` 앞
4. `'성공하면 onError 는 안 불린다'` — `expect(onError).not.toHaveBeenCalled()` 앞
5. `'401 → refreshPath 1회 → 원 요청 재시도, 중간 401 은 onError 를 안 부른다'` — `expect(onError).not.toHaveBeenCalled()` 앞

예 — 1번은 이렇게 된다:

```ts
it('200 인데 success:false 면 ApiError 로 거부한다', async () => {
  const onError = vi.fn()
  const client = createApiClient({ baseURL: '/api', onError })
  stub(client, () => ({ body: { success: false, code: 'ERR_X', message: 'm' } }))
  await expect(client.api.get('/x')).rejects.toMatchObject({ code: 'ERR_X', message: 'm' })
  await macrotask()
  expect(onError).toHaveBeenCalledTimes(1)
})
```

`packages/admin-ui/src/wiring.integration.test.ts` 에서 아래 단언 **바로 앞**에 `await settle()` 를 넣는다(`settle` 은 이미 같은 파일에 있다 — 매크로태스크 20번):

1. `'🔴 비밀번호를 틀리면(/auth/login 401) 토스트 없이 거부만 한다 — 로그인 화면이 알린다'` — `expect(toast.error).not.toHaveBeenCalled()` 앞
2. `'401 이 아닌 실패는 토스트한다'` — `expect(toast.error).toHaveBeenCalledWith('서버 오류')` 앞
3. `'🔴 onError 가 IP 차단 코드로 플래그를 세우고(토스트 없음), 로그아웃·로그인이 비운다'` — 첫 `expect(ipBlock).toEqual({ blocked: true, ip: '203.0.113.9' })` 앞, 그리고 두 번째 `await expect(api.get('/users')).rejects.toThrow(ApiError)` 다음의 `expect(ipBlock.blocked).toBe(true)` 앞

- [ ] **Step 9: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/api/client.test.ts packages/admin-ui/src/wiring.integration.test.ts packages/admin-shared/src/error-codes.test.ts`
Expected: PASS (전부)

- [ ] **Step 10: 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/error-codes.ts packages/admin-shared/src/error-codes.test.ts packages/admin-ui/src/api/error.ts packages/admin-ui/src/api/client.ts packages/admin-ui/src/api/client.test.ts packages/admin-ui/src/wiring.integration.test.ts
git add packages/admin-shared/src/error-codes.ts packages/admin-shared/src/error-codes.test.ts packages/admin-ui/src/api/error.ts packages/admin-ui/src/api/client.ts packages/admin-ui/src/api/client.test.ts packages/admin-ui/src/wiring.integration.test.ts
git commit -m "feat: revision 충돌 코드 · ApiError.handled · onError 지연 보고

ERR_COMMON_REVISION_CONFLICT(409)를 ERR_COMMON_CONFLICT 와 가른다. createApiClient 는
onError 를 한 매크로태스크 뒤에 부르고 호출처가 handled 로 표시한 오류는 건너뛴다 —
useWriteFlow 가 다이얼로그·필드에 직접 보인 오류가 전역 토스트로 또 뜨지 않게.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `toFieldErrors`

**Files:**

- Create: `packages/admin-ui/src/api/field-errors.ts`
- Test: `packages/admin-ui/src/api/field-errors.test.ts`

**Interfaces:**

- Consumes: `ApiError`(Task 1), admin-shared `CommonErrorCodes` · `validationDetailsSchema`.
- Produces: `toFieldErrors(error: unknown): Record<string, string[]>`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/api/field-errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from './error.js'
import { toFieldErrors } from './field-errors.js'

const validation = (details: unknown) =>
  new ApiError('검증', { status: 400, code: 'ERR_COMMON_VALIDATION', details, raw: null })

describe('toFieldErrors', () => {
  it('path 배열을 . 으로 이은 키로 모은다', () => {
    const error = validation({
      issues: [
        { path: ['userId'], message: '필수입니다' },
        { path: ['members', 0, 'name'], message: '너무 깁니다', code: 'too_big' },
      ],
    })
    expect(toFieldErrors(error)).toEqual({
      userId: ['필수입니다'],
      'members.0.name': ['너무 깁니다'],
    })
  })

  it('같은 키의 메시지는 순서대로 쌓는다', () => {
    const error = validation({
      issues: [
        { path: ['password'], message: '8자 이상' },
        { path: ['password'], message: '숫자 포함' },
      ],
    })
    expect(toFieldErrors(error)).toEqual({ password: ['8자 이상', '숫자 포함'] })
  })

  it('루트 path [] 는 빈 문자열 키', () => {
    expect(toFieldErrors(validation({ issues: [{ path: [], message: '본문이 비었다' }] }))).toEqual(
      {
        '': ['본문이 비었다'],
      },
    )
  })

  it('🔴 gise 식 점 연결 문자열 path 는 계약 위반 — {} (틀린 키를 조용히 만들지 않는다)', () => {
    expect(toFieldErrors(validation({ issues: [{ path: 'a.b', message: 'm' }] }))).toEqual({})
  })

  it('다른 코드 · details 없음 · ApiError 아님 → {} (던지지 않는다)', () => {
    const conflict = new ApiError('x', {
      code: 'ERR_COMMON_CONFLICT',
      details: { issues: [{ path: ['a'], message: 'm' }] },
      raw: null,
    })
    expect(toFieldErrors(conflict)).toEqual({})
    expect(toFieldErrors(validation(undefined))).toEqual({})
    expect(toFieldErrors(new Error('x'))).toEqual({})
    expect(toFieldErrors(null)).toEqual({})
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/api/field-errors.test.ts`
Expected: FAIL — `Failed to load url ./field-errors.js`(파일 없음)

- [ ] **Step 3: 구현**

`packages/admin-ui/src/api/field-errors.ts`:

```ts
import { CommonErrorCodes, validationDetailsSchema } from '@ssworks/admin-shared'
import { ApiError } from './error.js'

// 정본: ssworks-gise-home apps/admin/src/composables/useFieldErrors.ts 의 `toFieldErrors`
// 바꾼 점:
//  - 🔴 `path` 는 배열이다(킷 계약 admin-shared `validationDetailsSchema`). gise 서버는 점 연결 문자열을
//    보냈다 — 그 코드를 그대로 옮기면 키가 전부 어긋난다. 여기서 `.` 으로 잇는다.
//  - `payload.` 접두 제거(gise 섹션 저장 본문 전용)와 provide/inject 표시 추적은 버렸다(템플릿 몫).

/**
 * 검증 실패(`ERR_COMMON_VALIDATION`)를 필드 키별 메시지로 바꾼다. 형태가 맞지 않으면 `{}` —
 * 던지지 않는다. 키는 path 를 `.` 으로 이은 것: `['members', 0, 'name']` → `'members.0.name'`,
 * 루트 `[]` → `''`.
 */
export function toFieldErrors(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiError) || error.code !== CommonErrorCodes.ERR_COMMON_VALIDATION) {
    return {}
  }
  const parsed = validationDetailsSchema.safeParse(error.details)
  if (!parsed.success) return {}
  const out: Record<string, string[]> = {}
  for (const issue of parsed.data.issues) {
    const key = issue.path.join('.')
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/api/field-errors.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/api/field-errors.ts packages/admin-ui/src/api/field-errors.test.ts
git add packages/admin-ui/src/api/field-errors.ts packages/admin-ui/src/api/field-errors.test.ts
git commit -m "feat(admin-ui): toFieldErrors — 검증 실패 details.issues 를 필드 키별 메시지로

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 코덱 층 — `queryCodec` · `withDefault` · `bindQueryCodecs`

**Files:**

- Create: `packages/admin-ui/src/composables/query-codec.ts`
- Test: `packages/admin-ui/src/composables/query-codec.test.ts`

**Interfaces:**

- Produces:
  - `type RawQueryValue = LocationQueryValue | LocationQueryValue[] | undefined`
  - `interface QueryCodec<T> { decode(raw: RawQueryValue): T | undefined; encode(value: T): string | string[] | undefined }`
  - `interface DefaultedQueryCodec<T> extends QueryCodec<T> { decode(raw: RawQueryValue): T; readonly defaultValue: T }`
  - `interface QuerySyncBinding { read: (query: LocationQuery) => void; toQuery: () => LocationQueryRaw }`
  - `type QueryCodecSpec<S>`
  - `const queryCodec: { string(); int(options?); bool(); enumOf(values); bigint(); array(inner) }`
  - `withDefault<T>(codec: QueryCodec<T>, defaultValue: T): DefaultedQueryCodec<T>`
  - `bindQueryCodecs<S extends object>(state: Ref<S>, spec: QueryCodecSpec<S>): QuerySyncBinding`

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/composables/query-codec.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ref, type Ref } from 'vue'
import { bindQueryCodecs, queryCodec, withDefault } from './query-codec.js'

describe('queryCodec — 기본 코덱', () => {
  it('string: 빈 문자열은 없음, 반복 키는 첫 값', () => {
    const codec = queryCodec.string()
    expect(codec.decode('abc')).toBe('abc')
    expect(codec.decode('')).toBeUndefined()
    expect(codec.decode(undefined)).toBeUndefined()
    expect(codec.decode(null)).toBeUndefined()
    expect(codec.decode(['a', 'b'])).toBe('a')
    expect(codec.encode('')).toBeUndefined()
    expect(codec.encode('x')).toBe('x')
  })

  it('int: 안전 정수만 — 범위 밖 · 소수 · 문자 · 너무 큰 수는 없음', () => {
    const codec = queryCodec.int({ min: 1, max: 100 })
    expect(codec.decode('3')).toBe(3)
    expect(codec.decode('0')).toBeUndefined()
    expect(codec.decode('101')).toBeUndefined()
    expect(codec.decode('1.5')).toBeUndefined()
    expect(codec.decode('abc')).toBeUndefined()
    expect(queryCodec.int().decode('99999999999999999999')).toBeUndefined()
    expect(queryCodec.int().decode('-4')).toBe(-4)
    expect(codec.encode(7)).toBe('7')
    expect(codec.encode(0)).toBeUndefined()
  })

  it("🔴 bool: '1'/'0' 만 — 'true'·'false' 는 형식이 틀린 값", () => {
    const codec = queryCodec.bool()
    expect(codec.decode('1')).toBe(true)
    expect(codec.decode('0')).toBe(false)
    expect(codec.decode('true')).toBeUndefined()
    expect(codec.decode('false')).toBeUndefined()
    expect(codec.encode(true)).toBe('1')
    expect(codec.encode(false)).toBe('0')
  })

  it('enumOf: 목록 밖 값은 없음', () => {
    const codec = queryCodec.enumOf(['active', 'locked'])
    expect(codec.decode('locked')).toBe('locked')
    expect(codec.decode('deleted')).toBeUndefined()
    expect(codec.encode('active')).toBe('active')
  })

  it('🔴 bigint: 0 이상 정수 — 앞자리 0 · 음수 · 지수 표기는 없음', () => {
    const codec = queryCodec.bigint()
    expect(codec.decode('12')).toBe(12n)
    expect(codec.decode('0')).toBe(0n)
    expect(codec.decode('012')).toBeUndefined()
    expect(codec.decode('-1')).toBeUndefined()
    expect(codec.decode('1e3')).toBeUndefined()
    expect(codec.encode(12n)).toBe('12')
    expect(codec.encode(-1n)).toBeUndefined()
  })

  it('array: 반복 키 — 틀린 원소는 버리고, 남은 게 없으면 없음', () => {
    const codec = queryCodec.array(queryCodec.int())
    expect(codec.decode(['1', 'x', '3'])).toEqual([1, 3])
    expect(codec.decode('5')).toEqual([5])
    expect(codec.decode(['x'])).toBeUndefined()
    expect(codec.decode(undefined)).toBeUndefined()
    expect(codec.encode([1, 2])).toEqual(['1', '2'])
    expect(codec.encode([])).toBeUndefined()
  })

  it('🔴 어떤 입력에도 던지지 않는다 — 주소창의 값으로 화면이 백지가 되면 안 된다', () => {
    const inputs = [undefined, null, '', ' ', '%', ['', null], 'NaN', '1'.repeat(400)]
    const codecs = [
      queryCodec.string(),
      queryCodec.int(),
      queryCodec.bool(),
      queryCodec.enumOf(['a']),
      queryCodec.bigint(),
      queryCodec.array(queryCodec.bigint()),
    ]
    for (const codec of codecs) {
      for (const input of inputs) expect(() => codec.decode(input)).not.toThrow()
    }
  })
})

describe('withDefault', () => {
  it('없거나 틀리면 기본값으로 읽는다', () => {
    const codec = withDefault(queryCodec.int({ min: 1 }), 1)
    expect(codec.decode(undefined)).toBe(1)
    expect(codec.decode('abc')).toBe(1)
    expect(codec.decode('4')).toBe(4)
    expect(codec.defaultValue).toBe(1)
  })

  it('기본값과 같으면 URL 에서 뺀다 — 배열 · bigint 는 값으로 비교', () => {
    const tags = withDefault(queryCodec.array(queryCodec.string()), ['a'])
    expect(tags.encode(['a'])).toBeUndefined()
    expect(tags.encode(['a', 'b'])).toEqual(['a', 'b'])
    const team = withDefault(queryCodec.bigint(), 1n)
    expect(team.encode(1n)).toBeUndefined()
    expect(team.encode(2n)).toBe('2')
  })
})

describe('bindQueryCodecs', () => {
  interface Filter {
    status: 'active' | 'locked'
    teamNo?: bigint
    q: string
    other: number
  }

  function bind(state: Ref<Filter>) {
    return bindQueryCodecs(state, {
      status: withDefault(queryCodec.enumOf(['active', 'locked']), 'active'),
      teamNo: queryCodec.bigint(),
      q: withDefault(queryCodec.string(), ''),
    })
  }

  it('read 는 spec 키만 새로 대입하고 다른 상태 키는 그대로 둔다', () => {
    const state = ref<Filter>({ status: 'locked', teamNo: 3n, q: 'x', other: 9 })
    bind(state).read({ teamNo: '7' })
    expect(state.value).toEqual({ status: 'active', teamNo: 7n, q: '', other: 9 })
  })

  it('toQuery 는 기본값 · undefined 를 뺀다', () => {
    const state = ref<Filter>({ status: 'active', q: '', other: 0 })
    expect(bind(state).toQuery()).toEqual({})
    state.value = { status: 'locked', teamNo: 12n, q: '김', other: 0 }
    expect(bind(state).toQuery()).toEqual({ status: 'locked', teamNo: '12', q: '김' })
  })

  it('왕복 — URL → 상태 → URL 이 같은 쿼리', () => {
    const state = ref<Filter>({ status: 'active', q: '', other: 0 })
    const binding = bind(state)
    binding.read({ status: 'locked', teamNo: '12', q: '김' })
    expect(binding.toQuery()).toEqual({ status: 'locked', teamNo: '12', q: '김' })
  })

  it('타입 — 기본값 없는 코덱은 undefined 를 허용하는 키에만 쓸 수 있다', () => {
    const state = ref<{ q: string; teamNo?: bigint }>({ q: '' })
    // @ts-expect-error — q 는 undefined 를 허용하지 않으므로 기본값 없는 코덱을 받을 수 없다
    bindQueryCodecs(state, { q: queryCodec.string() })
    const ok = bindQueryCodecs(state, {
      q: withDefault(queryCodec.string(), ''),
      teamNo: queryCodec.bigint(),
    })
    expect(typeof ok.read).toBe('function')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/query-codec.test.ts`
Expected: FAIL — `Failed to load url ./query-codec.js`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/composables/query-codec.ts`:

```ts
import type { Ref } from 'vue'
import type { LocationQuery, LocationQueryRaw, LocationQueryValue } from 'vue-router'

// 정본: kim5257-crm-v5 packages/frontend-core/src/utils/queryCodec.ts
// 바꾼 점:
//  - 코덱은 선택형 층이다. 동기화 타이밍(`useQuerySyncedFilter`)은 코덱을 모르고 `read`·`toQuery`
//    콜백만 받는다 — `bindQueryCodecs` 가 둘을 잇는다.
//  - 기본 코덱은 도메인 취향 없는 범용 6종(string · int · bool · enumOf · bigint · array)만. crm 의
//    `intRange` · `bigintArray` · `enumArray` · `stringArray` 는 `array(inner)` 로, `calendarDate` ·
//    `dateString`(KST)은 시간대 정책이 프로젝트마다 달라 뺐고, `sortCodec` 은 `useServerTable` 이
//    직접 처리한다. 그 밖은 `QueryCodec<T>` 를 구현한 사용자 코드다.
//  - 🔴 `decode` 는 던지지 않는다 — 형식이 틀린 값은 "없는 것" 이다(crm 과 같다). 주소창에 사람이 친
//    값 때문에 화면이 백지가 되면 안 된다.

/** vue-router 가 주는 쿼리 값 한 칸. 반복 키는 배열, `?flag` 는 `null`. */
export type RawQueryValue = LocationQueryValue | LocationQueryValue[] | undefined

export interface QueryCodec<T> {
  /** 형식이 틀리면 `undefined`. 던지지 않는다. */
  decode(raw: RawQueryValue): T | undefined
  /** `undefined` 면 URL 에서 뺀다. */
  encode(value: T): string | string[] | undefined
}

/** `withDefault` 결과 — 읽기가 항상 값을 낸다. */
export interface DefaultedQueryCodec<T> extends QueryCodec<T> {
  decode(raw: RawQueryValue): T
  readonly defaultValue: T
}

/** `useQuerySyncedFilter` · `useServerTable({ urlSync })` 가 받는 한 쌍. */
export interface QuerySyncBinding {
  /** URL → 화면 상태. 쿼리에 없거나 형식이 틀린 키는 기본값으로 되돌린다(전체 대입). */
  read: (query: LocationQuery) => void
  /** 화면 상태 → URL. 기본값과 같은 값은 `undefined` 로 빼서 돌려준다. */
  toQuery: () => LocationQueryRaw
}

/**
 * 상태 키마다 고르는 코덱. 🔴 기본값 없는 코덱은 URL 에 없으면 `undefined` 를 넣으므로, 상태 타입이
 * `undefined` 를 허용하는 키에만 쓸 수 있다 — 아니면 컴파일 오류(crm `FilterSpecFor` 와 같은 이유:
 * 타입상 있는 값이 런타임에 `undefined` 가 되는 유형을 막는다).
 */
export type QueryCodecSpec<S> = {
  [K in keyof S]?: undefined extends S[K]
    ? QueryCodec<Exclude<S[K], undefined>>
    : DefaultedQueryCodec<S[K]>
}

/** 단일 값 코덱은 첫 값만 본다. vue-router 는 반복 키를 배열로 준다. */
function first(raw: RawQueryValue): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : undefined
}

const INT = /^-?\d+$/
/** 🔴 앞자리 0 을 거부한다 — `007` 과 `7` 이 같은 상태의 두 URL 이 되지 않게. */
const BIGINT = /^(0|[1-9]\d*)$/

export const queryCodec = {
  /** 빈 문자열은 "없음". */
  string(): QueryCodec<string> {
    return {
      decode: (raw) => {
        const value = first(raw)
        return value === undefined || value === '' ? undefined : value
      },
      encode: (value) => (value === '' ? undefined : value),
    }
  },

  /** 안전 정수만. 범위 밖은 "없음". */
  int(options: { min?: number; max?: number } = {}): QueryCodec<number> {
    const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options
    const inRange = (n: number) => Number.isSafeInteger(n) && n >= min && n <= max
    return {
      decode: (raw) => {
        const value = first(raw)
        if (value === undefined || !INT.test(value)) return undefined
        const n = Number(value)
        return inRange(n) ? n : undefined
      },
      encode: (value) => (inRange(value) ? String(value) : undefined),
    }
  },

  /** 🔴 `'1'` / `'0'` 만 — 표기가 둘이면 같은 상태가 두 URL 로 갈린다. */
  bool(): QueryCodec<boolean> {
    return {
      decode: (raw) => {
        const value = first(raw)
        return value === '1' ? true : value === '0' ? false : undefined
      },
      encode: (value) => (value ? '1' : '0'),
    }
  },

  enumOf<const T extends string>(values: readonly T[]): QueryCodec<T> {
    const allowed: ReadonlySet<string> = new Set(values)
    return {
      decode: (raw) => {
        const value = first(raw)
        return value !== undefined && allowed.has(value) ? (value as T) : undefined
      },
      encode: (value) => (allowed.has(value) ? value : undefined),
    }
  },

  /** 0 이상 정수 ID. 킷의 ID 가 bigint 라 기본 코덱에 둔다. */
  bigint(): QueryCodec<bigint> {
    return {
      decode: (raw) => {
        const value = first(raw)
        return value !== undefined && BIGINT.test(value) ? BigInt(value) : undefined
      },
      encode: (value) => (value >= 0n ? value.toString() : undefined),
    }
  },

  /** 반복 키(`?tag=a&tag=b`). 틀린 원소는 버리고, 남은 게 없으면 "없음". */
  array<T>(inner: QueryCodec<T>): QueryCodec<T[]> {
    return {
      decode: (raw) => {
        if (raw === undefined) return undefined
        const out: T[] = []
        for (const item of Array.isArray(raw) ? raw : [raw]) {
          const value = inner.decode(item)
          if (value !== undefined) out.push(value)
        }
        return out.length > 0 ? out : undefined
      },
      encode: (values) => {
        const out: string[] = []
        for (const item of values) {
          const encoded = inner.encode(item)
          if (typeof encoded === 'string') out.push(encoded)
          else if (Array.isArray(encoded)) out.push(...encoded)
        }
        return out.length > 0 ? out : undefined
      },
    }
  },
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }
  return Object.is(a, b)
}

/** 없거나 틀리면 기본값으로 읽고, 기본값과 같으면 URL 에서 뺀다. 배열 · bigint 는 값으로 비교한다. */
export function withDefault<T>(codec: QueryCodec<T>, defaultValue: T): DefaultedQueryCodec<T> {
  return {
    defaultValue,
    decode: (raw) => codec.decode(raw) ?? defaultValue,
    encode: (value) => (sameValue(value, defaultValue) ? undefined : codec.encode(value)),
  }
}

/** 코덱 묶음 → `{ read, toQuery }`. `read` 는 spec 의 키만 새로 대입하고 나머지 상태 키는 둔다. */
export function bindQueryCodecs<S extends object>(
  state: Ref<S>,
  spec: QueryCodecSpec<S>,
): QuerySyncBinding {
  const entries = Object.entries(
    spec as unknown as Record<string, QueryCodec<unknown> | undefined>,
  ).filter((entry): entry is [string, QueryCodec<unknown>] => entry[1] !== undefined)
  return {
    read(query) {
      const next: Record<string, unknown> = { ...(state.value as Record<string, unknown>) }
      for (const [key, codec] of entries) next[key] = codec.decode(query[key])
      state.value = next as S
    },
    toQuery() {
      const current = state.value as Record<string, unknown>
      const out: LocationQueryRaw = {}
      for (const [key, codec] of entries) {
        const value = current[key]
        if (value === undefined) continue
        const encoded = codec.encode(value)
        if (encoded !== undefined) out[key] = encoded
      }
      return out
    },
  }
}
```

- [ ] **Step 4: 통과 · 타입 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/query-codec.test.ts`
Expected: PASS
Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 없음(테스트의 `@ts-expect-error` 가 실제로 오류를 잡는지도 여기서 검증된다 — 오류가 안 나면 "Unused '@ts-expect-error'" 로 실패한다)

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/query-codec.ts packages/admin-ui/src/composables/query-codec.test.ts
git add packages/admin-ui/src/composables/query-codec.ts packages/admin-ui/src/composables/query-codec.test.ts
git commit -m "feat(admin-ui): 쿼리 코덱 층 — queryCodec 6종 · withDefault · bindQueryCodecs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `useQuerySyncedFilter` — URL 동기화 핵심

**Files:**

- Create: `packages/admin-ui/src/composables/useQuerySyncedFilter.ts`
- Test: `packages/admin-ui/src/composables/useQuerySyncedFilter.test.ts`

**Interfaces:**

- Consumes: `QuerySyncBinding`(Task 3).
- Produces:
  - `interface QuerySyncOptions extends QuerySyncBinding { onInbound?: () => void; debounceMs?: number }`
  - `useQuerySyncedFilter(options: QuerySyncOptions): { flushUrl: () => Promise<void> }` — setup 안에서 부른다.
  - `stableQueryKey(query: LocationQuery | LocationQueryRaw): string` — Task 5·6 이 필터 비교에 쓴다.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/composables/useQuerySyncedFilter.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type LocationQuery } from 'vue-router'
import {
  stableQueryKey,
  useQuerySyncedFilter,
  type QuerySyncOptions,
} from './useQuerySyncedFilter.js'

// 정본: kim5257-crm-v5 useQuerySyncedFilter 의 🔴 규칙과 gise useRouteQuerySync 의 동작을 계약으로 못박는다.

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function setup(initial: string, extra: Partial<QuerySyncOptions> = {}) {
  const state = ref({ q: '' })
  const read = vi.fn((query: LocationQuery) => {
    state.value = { q: typeof query.q === 'string' ? query.q : '' }
  })
  const onInbound = vi.fn()
  let flushUrl: () => Promise<void> = () => Promise.resolve()
  const List = defineComponent({
    setup() {
      const sync = useQuerySyncedFilter({
        read,
        toQuery: () => ({ q: state.value.q || undefined }),
        onInbound,
        ...extra,
      })
      flushUrl = sync.flushUrl
      return () => h('div', 'list')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/list', component: List },
      { path: '/other', component: { render: () => h('div', 'other') } },
    ],
  })
  await router.push(initial)
  await router.isReady()
  const replace = vi.spyOn(router, 'replace')
  wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { state, read, onInbound, router, replace, flush: () => flushUrl() }
}

describe('useQuerySyncedFilter', () => {
  it('🔴 초기 복원은 감시 등록보다 먼저 — read 1번, URL 쓰기 · onInbound 없음', async () => {
    const { state, read, onInbound, replace } = await setup('/list?q=abc')
    expect(state.value.q).toBe('abc')
    expect(read).toHaveBeenCalledTimes(1)
    expect(onInbound).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('상태가 바뀌면 router.replace 로 쓴다', async () => {
    const { state, router, replace } = await setup('/list')
    state.value = { q: 'x' }
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/list?q=x')
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('🔴 자기가 쓴 쿼리는 인바운드로 보지 않는다 — read · onInbound 를 다시 부르지 않는다', async () => {
    const { state, read, onInbound } = await setup('/list')
    state.value = { q: 'x' }
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(1)
    expect(onInbound).not.toHaveBeenCalled()
  })

  it('같은 화면에 쿼리만 바뀌어 들어오면 read → onInbound, 그리고 같은 주소를 다시 쓰지 않는다', async () => {
    const { state, read, onInbound, router, replace } = await setup('/list?q=a')
    await router.push('/list?q=b')
    await flushPromises()
    expect(state.value.q).toBe('b')
    expect(read).toHaveBeenCalledTimes(2)
    expect(onInbound).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('🔴 다른 경로로 떠날 때 목적지 쿼리로 상태를 엎지 않는다', async () => {
    const { state, read, router } = await setup('/list?q=keep')
    await router.push('/other?q=dest')
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(1)
    expect(state.value.q).toBe('keep')
  })

  it('debounceMs 동안 모은 변경을 한 번에 쓴다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { state, router, replace } = await setup('/list', { debounceMs: 300 })
    state.value = { q: 'a' }
    await flushPromises()
    state.value = { q: 'ab' }
    await flushPromises()
    vi.advanceTimersByTime(299)
    await flushPromises()
    expect(replace).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query.q).toBe('ab')
  })

  it('🔴 화면이 사라질 때 대기 중인 쓰기를 반영하지 않는다 — 반영하면 목적지 경로에 쓴다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { state, router, replace } = await setup('/list', { debounceMs: 300 })
    state.value = { q: 'late' }
    await flushPromises()
    await router.push('/other')
    await flushPromises()
    vi.advanceTimersByTime(300)
    await flushPromises()
    expect(replace).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/other')
  })

  it('🔴 flushUrl 은 대기 중인 쓰기를 확정하고 기다린다 — 직후의 push 가 취소되지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { state, router, flush, replace } = await setup('/list', { debounceMs: 300 })
    state.value = { q: 'row' }
    await flushPromises()
    await flush()
    expect(router.currentRoute.value.fullPath).toBe('/list?q=row')
    await router.push('/other')
    vi.advanceTimersByTime(300)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/other')
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('router.replace 가 가드 예외로 거부돼도 삼킨다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { state, router } = await setup('/list')
    router.beforeEach((to) => {
      if (to.query.q === 'boom') throw new Error('가드')
    })
    state.value = { q: 'boom' }
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/list')
  })

  it('🔴 toQuery 가 숫자를 돌려줘도 한 번만 쓴다 — URL 의 문자열과 같은 값으로 본다', async () => {
    const count = ref(0)
    const List = defineComponent({
      setup() {
        useQuerySyncedFilter({
          read: (query) => {
            count.value = Number(query.n ?? 0)
          },
          toQuery: () => ({ n: count.value || undefined }),
        })
        return () => h('div')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/list', component: List }],
    })
    await router.push('/list')
    await router.isReady()
    const replace = vi.spyOn(router, 'replace')
    wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
      global: { plugins: [router] },
    })
    count.value = 3
    await flushPromises()
    await flushPromises()
    expect(router.currentRoute.value.query.n).toBe('3')
    expect(replace).toHaveBeenCalledTimes(1)
  })
})

describe('stableQueryKey', () => {
  it('키 순서 · undefined · null · 빈 배열과 무관하고, 값은 문자열로 맞춘다', () => {
    expect(stableQueryKey({ b: '2', a: ['x', 'y'], c: undefined, d: null, e: [] })).toBe(
      stableQueryKey({ a: ['x', 'y'], b: 2 }),
    )
  })

  it('구분자가 값에 있어도 다른 항목과 섞이지 않는다', () => {
    expect(stableQueryKey({ a: 'x,y' })).not.toBe(stableQueryKey({ a: ['x', 'y'] }))
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useQuerySyncedFilter.test.ts`
Expected: FAIL — `Failed to load url ./useQuerySyncedFilter.js`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/composables/useQuerySyncedFilter.ts`:

```ts
import { onUnmounted, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery, type LocationQueryRaw } from 'vue-router'
import type { QuerySyncBinding } from './query-codec.js'

// 정본: ssworks-gise-home apps/admin/src/composables/useRouteQuerySync.ts (콜백 모양 · 비교 문자열)
//       + kim5257-crm-v5 packages/frontend-core/src/composables/useQuerySyncedFilter.ts 의 🔴 규칙
// 바꾼 점:
//  - crm 의 코덱 선언형 인자를 `read`·`toQuery` 콜백으로 바꿨다. 코덱은 `bindQueryCodecs` 가 콜백을
//    만들어 준다(선택형 층).
//  - gise 의 `isRestoring` 은 뺐다 — 복원 중 1쪽 되돌리기를 막는 일은 `useServerTable` 이 내부에서 한다.
//  - crm 의 필터·정렬·extra 3분할과 필수 `sort` 옵션은 뺐다. 정렬은 `useServerTable` 몫이다.
//  - 쓰기에도 경로 가드를 걸었다 — 떠나는 중의 쓰기는 목적지에 간다.

export interface QuerySyncOptions extends QuerySyncBinding {
  /** 뒤로·앞으로 가기 등 외부 요인으로 복원된 직후 1회. 🔴 초기 복원에서는 부르지 않는다(crm: 소비처
   *  클로저가 setup 아래쪽 바인딩을 읽어 TDZ 로 죽는다). */
  onInbound?: () => void
  /** 상태 변경 → URL 쓰기 지연(ms). 기본 0. */
  debounceMs?: number
}

/**
 * 쿼리 비교용 안정 문자열 — 키 정렬, `undefined`·`null`·빈 배열 제외, 값은 문자열로, 키·값은
 * `encodeURIComponent`. 🔴 `JSON.stringify` 를 쓰지 않는다 — 키 순서와 타입 표기(`2` vs `"2"`)에 따라
 * 같은 쿼리가 다른 문자열이 되고, bigint 에서는 던진다.
 */
export function stableQueryKey(query: LocationQuery | LocationQueryRaw): string {
  return Object.entries(query)
    .map(([key, value]) => {
      const list = (Array.isArray(value) ? value : [value]).filter((item) => item != null)
      return [key, list.map((item) => String(item))] as const
    })
    .filter(([, values]) => values.length > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(
      ([key, values]) =>
        `${encodeURIComponent(key)}=${values.map((value) => encodeURIComponent(value)).join(',')}`,
    )
    .join('&')
}

/**
 * 목록 화면 상태 ↔ URL 쿼리. setup 안에서 부른다.
 *
 * 지키는 것(crm 🔴):
 * 1. 초기 복원은 감시 등록보다 앞 줄에서 한다 — 뒤집으면 화면은 같은데 첫 요청만 2배가 된다.
 * 2. URL 쓰기는 멱등하다 — 조립 결과가 지금 주소와 같으면 쓰지 않는다. 쓰기 ↔ 감시 루프를 끊는다.
 * 3. 자기 화면 경로의 쿼리만 본다.
 */
export function useQuerySyncedFilter(options: QuerySyncOptions): {
  flushUrl: () => Promise<void>
} {
  const route = useRoute()
  const router = useRouter()

  /**
   * 마운트된 경로. vue-router 는 finalizeNavigation 에서 currentRoute 를 먼저 갱신하고 언마운트는 그
   * 결과다 — 다른 경로로 가면 **떠나는 화면의 감시가 목적지 쿼리로 먼저 깨어난다.** 그때 자기 상태를
   * 기본값으로 엎지 않도록 경로가 다르면 무시한다.
   *
   * ⚠️ 알려진 한계(crm 그대로, 의도된 것): setup 에서 한 번 잡고 다시 갱신하지 않는다. 동적 세그먼트만
   * 바뀌는 상세 라우트(`/users/:id`)는 컴포넌트를 재사용하므로 `route.path !== ownPath` 가 영구 참이 되어
   * 인바운드 감시가 조용히 꺼진다. 그런 라우트에서는 쓰지 않는다.
   */
  const ownPath = route.path
  const debounceMs = options.debounceMs ?? 0

  // ── 1. 초기 복원 — 감시 등록 전(setup 동기). onInbound 는 부르지 않는다.
  options.read(route.query)

  /**
   * 이 composable 이 마지막으로 쓴 쿼리의 안정 문자열. 인바운드 감시가 자기 쓰기를 무시하는 데 쓴다.
   * ⚠️ 슬롯이 **하나**라는 것은 "동시에 떠 있는 내 쓰기는 최대 1건" 이라는 전제다. 지금은 성립한다 —
   * 내비게이션이 매크로태스크 경계를 넘지 않는다. 전역 라우터 가드에 진짜 비동기 대기(권한 재조회 등)가
   * 생기면 두 쓰기가 겹쳐 첫 완료가 외부 변경으로 오인된다. 가드를 비동기로 바꿀 때 이 지점을 함께 본다.
   */
  let lastWritten = stableQueryKey(route.query)
  let timer: ReturnType<typeof setTimeout> | undefined
  /** 진행 중인 확정 쓰기(flushUrl). 살아 있는 동안 감시발 쓰기를 건너뛴다. */
  let inFlight: Promise<void> | null = null

  function writeUrl(): Promise<void> {
    if (route.path !== ownPath) return Promise.resolve()
    const next = options.toQuery()
    const key = stableQueryKey(next)
    if (key === stableQueryKey(route.query)) return Promise.resolve() // 같은 주소 — 쓰지 않는다
    lastWritten = key
    // 취소 · 중복 · 리다이렉트는 reject 가 아니라 실패 "값" 으로 resolve 된다(vue-router 4). 가드 예외만
    // reject 이므로 그것만 삼킨다.
    return router.replace({ query: next }).then(
      () => {},
      () => {},
    )
  }

  function syncUrl(): void {
    // 🔴 flushUrl 이 확정 쓰기 중이면 건너뛴다 — vue-router 의 pendingLocation 슬롯(1개)을 다투면 앞
    //    쓰기가 취소되고, 이어지는 push 가 뒤 쓰기까지 취소한다.
    if (inFlight) return
    void writeUrl()
  }

  async function flushUrl(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    const pending = writeUrl()
    inFlight = pending
    try {
      await pending
    } finally {
      inFlight = null
    }
  }

  // ── 2. 화면 → URL
  watch(
    () => stableQueryKey(options.toQuery()),
    () => {
      if (debounceMs <= 0) {
        syncUrl()
        return
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        syncUrl()
      }, debounceMs)
    },
  )

  // 🔴 언마운트 때 대기 중인 쓰기를 확정하지 **않는다.** 그 시점의 replace 는 이미 목적지 경로에 쓴다
  //    (crm 이 시도했다가 되돌렸다). 타이머만 정리한다.
  onUnmounted(() => clearTimeout(timer))

  // ── 3. URL → 화면(뒤로·앞으로 가기, 같은 화면으로의 링크)
  watch(
    () => route.query,
    (query) => {
      if (route.path !== ownPath) return
      const key = stableQueryKey(query)
      if (key === lastWritten) return
      lastWritten = key
      options.read(query)
      options.onInbound?.()
    },
  )

  return { flushUrl }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useQuerySyncedFilter.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/useQuerySyncedFilter.ts packages/admin-ui/src/composables/useQuerySyncedFilter.test.ts
git add packages/admin-ui/src/composables/useQuerySyncedFilter.ts packages/admin-ui/src/composables/useQuerySyncedFilter.test.ts
git commit -m "feat(admin-ui): useQuerySyncedFilter — 목록 상태 ↔ URL 쿼리 동기화 핵심

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `useServerTable` — 서버 페이징 목록(URL 동기화 없이)

**Files:**

- Create: `packages/admin-ui/src/composables/useServerTable.ts`
- Test: `packages/admin-ui/src/composables/useServerTable.test.ts`

**Interfaces:**

- Consumes: `ApiError` · `toApiError`(`../api/error.js`), `ADMIN_LIST_MAX_PAGE_SIZE` · `AdminTableSort`(`../components/table/data-table.js`), admin-shared `DEFAULT_ITEMS_PER_PAGE`, `stableQueryKey`(Task 4).
- Produces:
  - `interface ServerTableParams<TFilter> { page: number; itemsPerPage: number; sortBy: string[]; sortOrder: ('asc' | 'desc')[]; filter: TFilter }`
  - `interface ServerTableOptions<TRow, TFilter extends object>` — `fetch` · `sort` · `filters?` · `isFiltered?` · `itemsPerPage?` · `immediate?` (Task 6 이 `urlSync?` 를 더한다)
  - `interface ServerTable<TRow>` — `page` · `itemsPerPage` · `sortBy` · `items` · `total` · `loading` · `error` · `isFiltered` · `reload()` · `flushUrl()`
  - `useServerTable<TRow, TFilter extends object = Record<string, never>>(options): ServerTable<TRow>`

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/composables/useServerTable.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { ApiError } from '../api/error.js'
import {
  useServerTable,
  type ServerTable,
  type ServerTableOptions,
  type ServerTableParams,
} from './useServerTable.js'

// 정본: hangang-home apps/admin/src/pages/org/users.vue 의 목록 규칙(조회 1번 · seq · 1쪽 · 정렬 보정 ·
//       bigint total · isFiltered)을 계약으로 못박는다.

interface Row {
  id: number
}
interface Filter {
  q?: string
  tags?: string[]
  teamNo?: bigint
}
type Result = { items: Row[]; total: number | bigint }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

function setup(overrides: Partial<ServerTableOptions<Row, Filter>> = {}) {
  const filter = ref<Filter>({})
  const fetch = vi.fn(async (_params: ServerTableParams<Filter>): Promise<Result> => ({
    items: [{ id: 1 }],
    total: 1,
  }))
  let table!: ServerTable<Row>
  wrapper = mount(
    defineComponent({
      setup() {
        table = useServerTable<Row, Filter>({
          fetch,
          sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
          filters: () => filter.value,
          ...overrides,
        })
        return () => h('div')
      },
    }),
  )
  return { filter, fetch, table: () => table }
}

describe('useServerTable — 조회', () => {
  it('마운트하면 한 번 조회한다 — params 는 createQuerySchema 가 읽는 모양', async () => {
    const { fetch, table } = setup()
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith({
      page: 1,
      itemsPerPage: 20,
      sortBy: ['joinAt'],
      sortOrder: ['desc'],
      filter: {},
    })
    expect(table().items.value).toEqual([{ id: 1 }])
    expect(table().total.value).toBe(1)
    expect(table().loading.value).toBe(false)
  })

  it('immediate: false 면 마운트에 조회하지 않고 reload() 로 조회한다', async () => {
    const { fetch, table } = setup({ immediate: false })
    await flushPromises()
    expect(fetch).not.toHaveBeenCalled()
    await table().reload()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('itemsPerPage 옵션이 기본 쪽 크기다', async () => {
    const { fetch } = setup({ itemsPerPage: 50 })
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ itemsPerPage: 50 }))
  })

  it('🔴 쪽과 정렬이 한 틱에 같이 바뀌어도 조회는 1번', async () => {
    const { fetch, table } = setup()
    await flushPromises()
    table().page.value = 3
    table().sortBy.value = [{ key: 'userId', order: 'asc' }]
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 3, sortBy: ['userId'], sortOrder: ['asc'] }),
    )
  })

  it('🔴 늦게 온 앞 응답은 버린다 — 뒤 요청의 결과가 남고 loading 은 뒤 요청이 끝날 때 내린다', async () => {
    const first = deferred<Result>()
    const second = deferred<Result>()
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { table } = setup({ fetch })
    await flushPromises()
    table().page.value = 2
    await flushPromises()
    first.resolve({ items: [{ id: 1 }], total: 1 })
    await flushPromises()
    expect(table().loading.value).toBe(true)
    second.resolve({ items: [{ id: 2 }], total: 2 })
    await flushPromises()
    expect(table().items.value).toEqual([{ id: 2 }])
    expect(table().loading.value).toBe(false)
  })

  it('🔴 total 이 bigint 여도 number 로 바꾼다', async () => {
    const { table } = setup({ fetch: vi.fn(async () => ({ items: [], total: 42n })) })
    await flushPromises()
    expect(table().total.value).toBe(42)
    expect(typeof table().total.value).toBe('number')
  })

  it('🔴 bigint 필터 값으로도 조회한다 — 비교 문자열을 만들다 던지지 않는다', async () => {
    const { fetch, filter } = setup()
    await flushPromises()
    filter.value = { teamNo: 3n }
    await flushPromises()
    expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ filter: { teamNo: 3n } }))
  })
})

describe('useServerTable — 1쪽 되돌리기 · 정렬 보정', () => {
  it('🔴 필터가 바뀌면 1쪽으로 — 조회는 1번', async () => {
    const { fetch, filter, table } = setup()
    await flushPromises()
    table().page.value = 3
    await flushPromises()
    fetch.mockClear()
    filter.value = { q: '김' }
    await flushPromises()
    expect(table().page.value).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ page: 1, filter: { q: '김' } }))
  })

  it('쪽 크기가 바뀌면 1쪽으로 — 1..100 으로 자르고, 정수가 아니면 기본값', async () => {
    const { fetch, table } = setup()
    await flushPromises()
    table().page.value = 4
    await flushPromises()
    fetch.mockClear()
    table().itemsPerPage.value = 50
    await flushPromises()
    expect(table().page.value).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    table().itemsPerPage.value = 500
    await flushPromises()
    expect(table().itemsPerPage.value).toBe(100)
    table().itemsPerPage.value = -1
    await flushPromises()
    expect(table().itemsPerPage.value).toBe(20)
  })

  it('🔴 빈 정렬(같은 헤더 세 번째 클릭) · 목록 밖 키는 기본 정렬로 되돌리고 다시 조회하지 않는다', async () => {
    const { fetch, table } = setup()
    await flushPromises()
    table().sortBy.value = []
    await flushPromises()
    expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
    table().sortBy.value = [{ key: 'password', order: 'asc' }]
    await flushPromises()
    expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('sort: false 면 sortBy · sortOrder 를 빈 배열로 보낸다', async () => {
    const { fetch } = setup({ sort: false })
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ sortBy: [], sortOrder: [] }))
  })
})

describe('useServerTable — 오류 · isFiltered', () => {
  it('실패하면 목록을 비우고 error 에 ApiError — 처리 표시는 안 한다, 다음 조회 시작에 비운다', async () => {
    const failure = new ApiError('서버 오류', {
      status: 500,
      code: 'ERR_COMMON_INTERNAL',
      raw: null,
    })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 1 }], total: 1 })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ items: [{ id: 3 }], total: 1 })
    const { table } = setup({ fetch })
    await flushPromises()
    table().page.value = 2
    await flushPromises()
    expect(table().items.value).toEqual([])
    expect(table().total.value).toBe(0)
    expect(table().error.value).toBe(failure)
    expect(failure.handled).toBe(false)
    await table().reload()
    expect(table().error.value).toBeNull()
    expect(table().items.value).toEqual([{ id: 3 }])
  })

  it('ApiError 가 아닌 예외도 ApiError 로 바꾸고 console.error 로 남긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { table } = setup({ fetch: vi.fn().mockRejectedValue(new TypeError('x is undefined')) })
    await flushPromises()
    expect(table().error.value).toBeInstanceOf(ApiError)
    expect(log).toHaveBeenCalled()
  })

  it('isFiltered 기본 — undefined · null · 빈 문자열 · 빈 배열이 아닌 값이 있으면 true', async () => {
    const { filter, table } = setup()
    filter.value = { q: '', tags: [] }
    expect(table().isFiltered.value).toBe(false)
    filter.value = { q: '김' }
    expect(table().isFiltered.value).toBe(true)
  })

  it('isFiltered 옵션이 기본 판정을 대신한다', async () => {
    const { table } = setup({ isFiltered: () => true })
    expect(table().isFiltered.value).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useServerTable.test.ts`
Expected: FAIL — `Failed to load url ./useServerTable.js`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/composables/useServerTable.ts`:

```ts
import { computed, onMounted, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue'
import type { LocationQueryRaw } from 'vue-router'
import { DEFAULT_ITEMS_PER_PAGE } from '@ssworks/admin-shared'
import { ApiError, toApiError } from '../api/error.js'
import { ADMIN_LIST_MAX_PAGE_SIZE, type AdminTableSort } from '../components/table/data-table.js'
import { stableQueryKey } from './useQuerySyncedFilter.js'

// 정본: hangang-home apps/admin/src/pages/org/users.vue (목록 상태 · seq 가드 · 정렬 보정 · isFiltered)
// 바꾼 점:
//  - 페이지 로컬 ref 묶음을 composable 하나로. 조회는 `fetch` 어댑터, 필터는 "적용된 값" 게터로 받는다.
//  - 오류 문구 해석은 하지 않는다 — 알림은 `createApiClient` 의 전역 `onError` 몫이다.

export interface ServerTableParams<TFilter> {
  page: number
  itemsPerPage: number
  sortBy: string[]
  sortOrder: ('asc' | 'desc')[]
  filter: TFilter
}

export interface ServerTableOptions<TRow, TFilter extends object> {
  /** `params` 는 admin-shared `createQuerySchema` 가 읽는 모양 그대로 — GET 파라미터로 그대로 보낸다. */
  fetch: (params: ServerTableParams<TFilter>) => Promise<{ items: TRow[]; total: number | bigint }>
  /** 🔴 필수 — 생략을 허용하면 정렬이 조용히 빠진다(crm). 정렬 없는 표는 `false`. */
  sort: { keys: readonly string[]; default: AdminTableSort } | false
  /** "적용된" 필터 값(평평한 객체). 바뀌면 1쪽으로 돌아가고 다시 조회한다. 기본 `() => ({})`. */
  filters?: () => TFilter
  /** 기본: `filters()` 에 `undefined`·`null`·`''`·빈 배열이 아닌 값이 하나라도 있으면 true. */
  isFiltered?: () => boolean
  /** 기본 20(`DEFAULT_ITEMS_PER_PAGE`). 1..100 으로 자른다. */
  itemsPerPage?: number
  /** 기본 true — onMounted 에서 첫 조회. */
  immediate?: boolean
}

export interface ServerTable<TRow> {
  page: Ref<number>
  itemsPerPage: Ref<number>
  sortBy: Ref<AdminTableSort[]>
  items: Ref<TRow[]>
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<ApiError | null>
  isFiltered: ComputedRef<boolean>
  reload: () => Promise<void>
  /** `urlSync` 가 없으면 즉시 resolve. */
  flushUrl: () => Promise<void>
}

function clampItemsPerPage(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 1) return fallback
  return Math.min(value, ADMIN_LIST_MAX_PAGE_SIZE)
}

function isEmptyFilterValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** 🔴 `JSON.stringify` 를 쓰지 않는다 — bigint 필터 값에서 던진다. 값을 문자열로 맞춘 비교 문자열. */
function filterKeyOf(filter: object): string {
  return stableQueryKey(filter as LocationQueryRaw)
}

/**
 * 서버 페이징 목록. setup 안에서 부르고, 반환값을 구조 분해해 `DataTableBody` 에 그대로 건다.
 *
 * 지키는 것(hangang 🔴):
 * 1. 요청 조건은 `computed` 하나, 감시도 하나 — 쪽 · 정렬 · 필터가 한 틱에 같이 바뀌어도 조회는 1번.
 * 2. 늦게 온 응답은 버린다(seq).
 * 3. 필터 · 쪽 크기가 바뀌면 같은 틱에 1쪽으로 — 안 그러면 3쪽에서 0건이 나온다.
 */
export function useServerTable<TRow, TFilter extends object = Record<string, never>>(
  options: ServerTableOptions<TRow, TFilter>,
): ServerTable<TRow> {
  const sort = options.sort
  const defaultItemsPerPage = clampItemsPerPage(
    options.itemsPerPage ?? DEFAULT_ITEMS_PER_PAGE,
    DEFAULT_ITEMS_PER_PAGE,
  )
  const filters = options.filters ?? (() => ({}) as TFilter)
  const defaultSort = (): AdminTableSort[] => (sort === false ? [] : [{ ...sort.default }])

  /** 🔴 키가 허용 목록 밖이거나 비었으면(같은 헤더 세 번째 클릭) 기본 정렬. 한 열만 본다(hangang). */
  function normalizeSort(value: readonly AdminTableSort[]): AdminTableSort[] {
    if (sort === false) return []
    const head = value[0]
    if (head && sort.keys.includes(head.key) && (head.order === 'asc' || head.order === 'desc')) {
      return [{ key: head.key, order: head.order }]
    }
    return defaultSort()
  }

  const page = ref(1)
  const itemsPerPage = ref(defaultItemsPerPage)
  const sortBy = ref<AdminTableSort[]>(defaultSort())
  const items = shallowRef<TRow[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = shallowRef<ApiError | null>(null)

  // ── 정렬 보정 — ref 자체를 되돌려 라벨 · 화살표 · 요청이 한 값을 본다(hangang).
  watch(
    sortBy,
    (value) => {
      const normalized = normalizeSort(value)
      const same =
        normalized.length === value.length &&
        normalized.every((s, i) => s.key === value[i]?.key && s.order === value[i]?.order)
      if (!same) sortBy.value = normalized
    },
    { flush: 'sync' },
  )

  // ── 쪽 크기 자르기 · 필터/쪽 크기 변경 → 1쪽. 🔴 같은 틱(sync)에 처리해야 조회가 1번이다.
  watch(
    itemsPerPage,
    (value) => {
      const clamped = clampItemsPerPage(value, defaultItemsPerPage)
      if (clamped !== value) itemsPerPage.value = clamped
    },
    { flush: 'sync' },
  )
  const filterKey = computed(() => filterKeyOf(filters()))
  watch(
    [filterKey, itemsPerPage],
    () => {
      page.value = 1
    },
    { flush: 'sync' },
  )

  const params = computed<ServerTableParams<TFilter>>(() => {
    const sorted = normalizeSort(sortBy.value)
    return {
      page: page.value,
      itemsPerPage: itemsPerPage.value,
      sortBy: sorted.map((s) => s.key),
      sortOrder: sorted.map((s) => s.order),
      filter: filters(),
    }
  })
  /** 🔴 객체가 아니라 문자열을 감시한다 — `computed` 는 매번 새 객체라 정렬 되돌리기만으로도 다시 조회한다. */
  const requestKey = computed(() => {
    const p = params.value
    return [
      p.page,
      p.itemsPerPage,
      p.sortBy.join(','),
      p.sortOrder.join(','),
      filterKeyOf(p.filter),
    ].join('|')
  })

  const isFiltered = computed(() =>
    options.isFiltered
      ? options.isFiltered()
      : Object.values(filters()).some((value) => !isEmptyFilterValue(value)),
  )

  let seq = 0
  async function load(): Promise<void> {
    const mine = ++seq
    loading.value = true
    error.value = null
    try {
      const result = await options.fetch(params.value)
      if (mine !== seq) return
      items.value = result.items
      // 🔴 `total` 이 bigint 일 수 있다. `DataTableBody.itemsLength` 는 number — 그대로 넘기면 타입은
      //    통과하는데 표가 조용히 틀린다(hangang).
      total.value = Number(result.total)
    } catch (caught) {
      if (mine !== seq) return
      if (!(caught instanceof ApiError)) {
        console.error('[useServerTable] fetch 가 ApiError 가 아닌 예외를 던졌다', caught)
      }
      items.value = []
      total.value = 0
      error.value = toApiError(caught)
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  watch(requestKey, () => {
    void load()
  })
  if (options.immediate !== false) {
    onMounted(() => {
      void load()
    })
  }

  return {
    page,
    itemsPerPage,
    sortBy,
    items,
    total,
    loading,
    error,
    isFiltered,
    reload: load,
    flushUrl: () => Promise.resolve(),
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useServerTable.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/useServerTable.ts packages/admin-ui/src/composables/useServerTable.test.ts
git add packages/admin-ui/src/composables/useServerTable.ts packages/admin-ui/src/composables/useServerTable.test.ts
git commit -m "feat(admin-ui): useServerTable — 서버 페이징 목록(조회 1번 · seq · 1쪽 · 정렬 보정)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `useServerTable` 의 `urlSync`

**Files:**

- Modify: `packages/admin-ui/src/composables/useServerTable.ts` (전체를 아래 최종본으로 교체)
- Test: `packages/admin-ui/src/composables/useServerTable.url.test.ts`

**Interfaces:**

- Consumes: `queryCodec` · `withDefault` · `QuerySyncBinding` · `RawQueryValue`(Task 3), `useQuerySyncedFilter`(Task 4).
- Produces: `ServerTableOptions` 에 `urlSync?: QuerySyncBinding`. 표 URL 키 `page` · `size` · `sort`(`key:order`).

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/composables/useServerTable.url.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { bindQueryCodecs, queryCodec, withDefault, type QuerySyncBinding } from './query-codec.js'
import { useServerTable, type ServerTable } from './useServerTable.js'

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

async function setup(initial: string, urlSyncOverride?: QuerySyncBinding) {
  const filter = ref<{ q: string }>({ q: '' })
  const fetch = vi.fn(async () => ({ items: [] as never[], total: 0 }))
  let table!: ServerTable<never>
  const List = defineComponent({
    setup() {
      table = useServerTable<never, { q?: string }>({
        fetch,
        sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
        filters: () => ({ q: filter.value.q || undefined }),
        urlSync:
          urlSyncOverride ?? bindQueryCodecs(filter, { q: withDefault(queryCodec.string(), '') }),
      })
      return () => h('div')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/list', component: List },
      { path: '/other', component: { render: () => h('div') } },
    ],
  })
  await router.push(initial)
  await router.isReady()
  wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { filter, fetch, router, table: () => table }
}

describe('useServerTable — urlSync', () => {
  it('🔴 첫 URL 에서 복원하고 조회는 1번 — 쪽 · 크기 · 정렬 · 필터', async () => {
    const { fetch } = await setup('/list?page=3&size=50&sort=userId:asc&q=x')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith({
      page: 3,
      itemsPerPage: 50,
      sortBy: ['userId'],
      sortOrder: ['asc'],
      filter: { q: 'x' },
    })
  })

  it('상태를 URL 에 싣고 기본값은 뺀다', async () => {
    const { router, table } = await setup('/list')
    table().page.value = 2
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/list?page=2')
    table().page.value = 1
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/list')
    table().sortBy.value = [{ key: 'userId', order: 'asc' }]
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'userId:asc' })
    table().itemsPerPage.value = 50
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'userId:asc', size: '50' })
  })

  it('필터를 바꾸면 URL 에 싣고 쪽 키는 사라진다(1쪽)', async () => {
    const { router, table, filter } = await setup('/list?page=3')
    filter.value = { q: '김' }
    await flushPromises()
    expect(table().page.value).toBe(1)
    expect(router.currentRoute.value.query).toEqual({ q: '김' })
  })

  it('🔴 URL 에서 복원할 때는 1쪽으로 되돌리지 않는다 — 조회 1번, 복원한 쪽 그대로', async () => {
    const { router, table, fetch } = await setup('/list')
    fetch.mockClear()
    await router.push('/list?page=4&q=y')
    await flushPromises()
    expect(table().page.value).toBe(4)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ page: 4, filter: { q: 'y' } }))
  })

  it('틀린 URL 값은 기본값 — 문자 쪽, 상한 넘는 크기, 목록 밖 정렬 키', async () => {
    const { fetch } = await setup('/list?page=abc&size=1000&sort=password:asc')
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        itemsPerPage: 20,
        sortBy: ['joinAt'],
        sortOrder: ['desc'],
      }),
    )
  })

  it('반복된 표 키는 첫 값을 쓴다 — 화면이 깨지지 않는다', async () => {
    const { fetch } = await setup('/list?page=2&page=5')
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('🔴 필터 키가 표 키(page·size·sort)와 겹치면 console.error 후 표 값이 이긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { router, table } = await setup('/list', {
      read: () => {},
      toQuery: () => ({ page: '99' }),
    })
    table().page.value = 2
    await flushPromises()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('page'))
    expect(router.currentRoute.value.query.page).toBe('2')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useServerTable.url.test.ts`
Expected: FAIL — 첫 테스트가 `page: 1`(URL 을 안 읽음)로 실패

- [ ] **Step 3: 최종본으로 교체**

`packages/admin-ui/src/composables/useServerTable.ts` 전체를 다음으로 바꾼다:

```ts
import { computed, onMounted, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue'
import type { LocationQueryRaw } from 'vue-router'
import { DEFAULT_ITEMS_PER_PAGE } from '@ssworks/admin-shared'
import { ApiError, toApiError } from '../api/error.js'
import { ADMIN_LIST_MAX_PAGE_SIZE, type AdminTableSort } from '../components/table/data-table.js'
import {
  queryCodec,
  withDefault,
  type QuerySyncBinding,
  type RawQueryValue,
} from './query-codec.js'
import { stableQueryKey, useQuerySyncedFilter } from './useQuerySyncedFilter.js'

// 정본: hangang-home apps/admin/src/pages/org/users.vue (목록 상태 · seq 가드 · 정렬 보정 · isFiltered)
// 바꾼 점:
//  - 페이지 로컬 ref 묶음을 composable 하나로. 조회는 `fetch` 어댑터, 필터는 "적용된 값" 게터로 받는다.
//  - URL 동기화(gise `useRouteQuerySync`)를 `urlSync` 옵션으로 품는다 — 복원이 감시보다 먼저인 순서를
//    여기서 보장하고, 복원 중에는 1쪽 되돌리기를 건너뛴다(crm `onInbound` 가 생긴 이유).
//  - 오류 문구 해석은 하지 않는다 — 알림은 `createApiClient` 의 전역 `onError` 몫이다.

export interface ServerTableParams<TFilter> {
  page: number
  itemsPerPage: number
  sortBy: string[]
  sortOrder: ('asc' | 'desc')[]
  filter: TFilter
}

export interface ServerTableOptions<TRow, TFilter extends object> {
  /** `params` 는 admin-shared `createQuerySchema` 가 읽는 모양 그대로 — GET 파라미터로 그대로 보낸다. */
  fetch: (params: ServerTableParams<TFilter>) => Promise<{ items: TRow[]; total: number | bigint }>
  /** 🔴 필수 — 생략을 허용하면 정렬이 조용히 빠진다(crm). 정렬 없는 표는 `false`. */
  sort: { keys: readonly string[]; default: AdminTableSort } | false
  /** "적용된" 필터 값(평평한 객체). 바뀌면 1쪽으로 돌아가고 다시 조회한다. 기본 `() => ({})`. */
  filters?: () => TFilter
  /** 기본: `filters()` 에 `undefined`·`null`·`''`·빈 배열이 아닌 값이 하나라도 있으면 true. */
  isFiltered?: () => boolean
  /** 기본 20(`DEFAULT_ITEMS_PER_PAGE`). 1..100 으로 자른다. */
  itemsPerPage?: number
  /**
   * 켜면 쪽 · 크기 · 정렬은 표가 `page` · `size` · `sort` 로, 필터는 이것이 URL 과 맞춘다.
   * `bindQueryCodecs(...)` 결과나 손으로 쓴 `{ read, toQuery }`.
   */
  urlSync?: QuerySyncBinding
  /** 기본 true — onMounted 에서 첫 조회. */
  immediate?: boolean
}

export interface ServerTable<TRow> {
  page: Ref<number>
  itemsPerPage: Ref<number>
  sortBy: Ref<AdminTableSort[]>
  items: Ref<TRow[]>
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<ApiError | null>
  isFiltered: ComputedRef<boolean>
  reload: () => Promise<void>
  /** `urlSync` 가 없으면 즉시 resolve. */
  flushUrl: () => Promise<void>
}

/** 표가 URL 에 쓰는 키. 필터 키가 이것과 겹치면 안 된다. */
const TABLE_URL_KEYS = ['page', 'size', 'sort'] as const

function clampItemsPerPage(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 1) return fallback
  return Math.min(value, ADMIN_LIST_MAX_PAGE_SIZE)
}

function isEmptyFilterValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** 🔴 `JSON.stringify` 를 쓰지 않는다 — bigint 필터 값에서 던진다. 값을 문자열로 맞춘 비교 문자열. */
function filterKeyOf(filter: object): string {
  return stableQueryKey(filter as LocationQueryRaw)
}

/**
 * 서버 페이징 목록. setup 안에서 부르고, 반환값을 구조 분해해 `DataTableBody` 에 그대로 건다.
 *
 * 지키는 것(hangang 🔴 · crm 🔴):
 * 1. 요청 조건은 `computed` 하나, 감시도 하나 — 쪽 · 정렬 · 필터가 한 틱에 같이 바뀌어도 조회는 1번.
 * 2. 늦게 온 응답은 버린다(seq).
 * 3. 필터 · 쪽 크기가 바뀌면 같은 틱에 1쪽으로 — 단 URL 에서 복원할 때는 아니다.
 * 4. `urlSync` 의 초기 복원은 아래 감시들보다 먼저 한다.
 */
export function useServerTable<TRow, TFilter extends object = Record<string, never>>(
  options: ServerTableOptions<TRow, TFilter>,
): ServerTable<TRow> {
  const sort = options.sort
  const defaultItemsPerPage = clampItemsPerPage(
    options.itemsPerPage ?? DEFAULT_ITEMS_PER_PAGE,
    DEFAULT_ITEMS_PER_PAGE,
  )
  const filters = options.filters ?? (() => ({}) as TFilter)
  const defaultSort = (): AdminTableSort[] => (sort === false ? [] : [{ ...sort.default }])

  /** 🔴 키가 허용 목록 밖이거나 비었으면(같은 헤더 세 번째 클릭) 기본 정렬. 한 열만 본다(hangang). */
  function normalizeSort(value: readonly AdminTableSort[]): AdminTableSort[] {
    if (sort === false) return []
    const head = value[0]
    if (head && sort.keys.includes(head.key) && (head.order === 'asc' || head.order === 'desc')) {
      return [{ key: head.key, order: head.order }]
    }
    return defaultSort()
  }

  const page = ref(1)
  const itemsPerPage = ref(defaultItemsPerPage)
  const sortBy = ref<AdminTableSort[]>(defaultSort())
  const items = shallowRef<TRow[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = shallowRef<ApiError | null>(null)

  // ── URL 동기화 — 🔴 아래 감시들보다 먼저. 초기 복원이 감시에 관측되면 첫 요청이 2번 나간다.
  /** URL 에서 상태를 되채우는 중 — 이 동안의 필터·크기 변경은 1쪽 되돌리기를 하지 않는다. */
  let restoring = false
  let flushUrl: () => Promise<void> = () => Promise.resolve()
  const urlSync = options.urlSync
  if (urlSync) {
    const pageCodec = withDefault(queryCodec.int({ min: 1 }), 1)
    const sizeCodec = withDefault(
      queryCodec.int({ min: 1, max: ADMIN_LIST_MAX_PAGE_SIZE }),
      defaultItemsPerPage,
    )
    const decodeSort = (raw: RawQueryValue): AdminTableSort[] => {
      const value = Array.isArray(raw) ? raw[0] : raw
      const match = typeof value === 'string' ? /^(.+):(asc|desc)$/.exec(value) : null
      if (!match) return defaultSort()
      return normalizeSort([{ key: match[1] as string, order: match[2] as 'asc' | 'desc' }])
    }
    const encodeSort = (value: readonly AdminTableSort[]): string | undefined => {
      const head = normalizeSort(value)[0]
      const fallback = defaultSort()[0]
      if (!head) return undefined
      if (fallback && head.key === fallback.key && head.order === fallback.order) return undefined
      return `${head.key}:${head.order}`
    }

    flushUrl = useQuerySyncedFilter({
      read(query) {
        restoring = true
        try {
          page.value = pageCodec.decode(query.page)
          itemsPerPage.value = sizeCodec.decode(query.size)
          sortBy.value = decodeSort(query.sort)
          urlSync.read(query)
        } finally {
          restoring = false
        }
      },
      toQuery() {
        const filterQuery = urlSync.toQuery()
        const clash = TABLE_URL_KEYS.filter((key) => filterQuery[key] !== undefined)
        if (clash.length > 0) {
          // 🔴 던지지 않는다 — 라이브러리 빌드에서 `import.meta.env.DEV` 는 빌드 시점 상수라 소비 앱의
          //    개발 모드를 모른다. 배포에서 던지면 화면이 백지가 된다. 표 값이 이긴다.
          console.error(`[useServerTable] urlSync 의 필터 키가 표 키와 겹친다: ${clash.join(', ')}`)
        }
        return {
          ...filterQuery,
          page: pageCodec.encode(page.value),
          size: sizeCodec.encode(itemsPerPage.value),
          sort: encodeSort(sortBy.value),
        }
      },
    }).flushUrl
  }

  // ── 정렬 보정 — ref 자체를 되돌려 라벨 · 화살표 · 요청이 한 값을 본다(hangang).
  watch(
    sortBy,
    (value) => {
      const normalized = normalizeSort(value)
      const same =
        normalized.length === value.length &&
        normalized.every((s, i) => s.key === value[i]?.key && s.order === value[i]?.order)
      if (!same) sortBy.value = normalized
    },
    { flush: 'sync' },
  )

  // ── 쪽 크기 자르기 · 필터/쪽 크기 변경 → 1쪽. 🔴 같은 틱(sync)에 처리해야 조회가 1번이다.
  watch(
    itemsPerPage,
    (value) => {
      const clamped = clampItemsPerPage(value, defaultItemsPerPage)
      if (clamped !== value) itemsPerPage.value = clamped
    },
    { flush: 'sync' },
  )
  const filterKey = computed(() => filterKeyOf(filters()))
  watch(
    [filterKey, itemsPerPage],
    () => {
      // 🔴 URL 복원 중에는 되돌리지 않는다 — 복원한 쪽 번호가 같은 틱에 1로 덮인다.
      if (!restoring) page.value = 1
    },
    { flush: 'sync' },
  )

  const params = computed<ServerTableParams<TFilter>>(() => {
    const sorted = normalizeSort(sortBy.value)
    return {
      page: page.value,
      itemsPerPage: itemsPerPage.value,
      sortBy: sorted.map((s) => s.key),
      sortOrder: sorted.map((s) => s.order),
      filter: filters(),
    }
  })
  /** 🔴 객체가 아니라 문자열을 감시한다 — `computed` 는 매번 새 객체라 정렬 되돌리기만으로도 다시 조회한다. */
  const requestKey = computed(() => {
    const p = params.value
    return [
      p.page,
      p.itemsPerPage,
      p.sortBy.join(','),
      p.sortOrder.join(','),
      filterKeyOf(p.filter),
    ].join('|')
  })

  const isFiltered = computed(() =>
    options.isFiltered
      ? options.isFiltered()
      : Object.values(filters()).some((value) => !isEmptyFilterValue(value)),
  )

  let seq = 0
  async function load(): Promise<void> {
    const mine = ++seq
    loading.value = true
    error.value = null
    try {
      const result = await options.fetch(params.value)
      if (mine !== seq) return
      items.value = result.items
      // 🔴 `total` 이 bigint 일 수 있다. `DataTableBody.itemsLength` 는 number — 그대로 넘기면 타입은
      //    통과하는데 표가 조용히 틀린다(hangang).
      total.value = Number(result.total)
    } catch (caught) {
      if (mine !== seq) return
      if (!(caught instanceof ApiError)) {
        console.error('[useServerTable] fetch 가 ApiError 가 아닌 예외를 던졌다', caught)
      }
      items.value = []
      total.value = 0
      error.value = toApiError(caught)
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  watch(requestKey, () => {
    void load()
  })
  if (options.immediate !== false) {
    onMounted(() => {
      void load()
    })
  }

  return {
    page,
    itemsPerPage,
    sortBy,
    items,
    total,
    loading,
    error,
    isFiltered,
    reload: load,
    flushUrl: () => flushUrl(),
  }
}
```

- [ ] **Step 4: 통과 확인(Task 5 테스트 포함)**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useServerTable.url.test.ts packages/admin-ui/src/composables/useServerTable.test.ts`
Expected: PASS (둘 다)

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/useServerTable.ts packages/admin-ui/src/composables/useServerTable.url.test.ts
git add packages/admin-ui/src/composables/useServerTable.ts packages/admin-ui/src/composables/useServerTable.url.test.ts
git commit -m "feat(admin-ui): useServerTable urlSync — 쪽·크기·정렬은 표가, 필터는 코덱/콜백이 URL 과 맞춘다

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `useWriteFlow`

**Files:**

- Create: `packages/admin-ui/src/composables/useWriteFlow.ts`
- Test: `packages/admin-ui/src/composables/useWriteFlow.render.test.ts`

**Interfaces:**

- Consumes: `ApiError#handled`(Task 1), `toFieldErrors`(Task 2), admin-shared `CommonErrorCodes`, `ConfirmDialog` · `ReauthDialog`(기존 — props 는 이 플랜의 바인딩 이름 그대로).
- Produces:
  - `type WriteRunOptions<T>` — `{ gate?: 'none'; action: () => Promise<T> }` | `{ gate: 'confirm'; reversible: boolean; confirmColor?: string; action: () => Promise<T> }` | `{ gate: 'reauth'; action: (ctx: { currentPassword: string }) => Promise<T> }`, 공통 `onSuccess?` · `onConflict?`, confirm·reauth 는 `title?` · `message?` · `confirmLabel?`
  - `interface ConfirmDialogBindings`, `interface ReauthDialogBindings`, `interface WriteFlow`
  - `useWriteFlow(): WriteFlow`

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/composables/useWriteFlow.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import { ApiError } from '../api/error.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import ReauthDialog from '../components/common/ReauthDialog.vue'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import { useWriteFlow, type WriteFlow } from './useWriteFlow.js'

// 정본: hangang-home users.vue `onReauthConfirm` 의 규칙(재인증 실패에 다이얼로그 유지 · 비밀번호 1회
//       전달)과 gise 의 revision 충돌 · 필드 오류를, 실제 다이얼로그에 v-bind 로 붙여 못박는다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(): Promise<WriteFlow> {
  let flow!: WriteFlow
  wrapper = mount(
    defineComponent({
      setup() {
        flow = useWriteFlow()
        return () =>
          h('div', [
            h(ConfirmDialog as Component, flow.confirmDialog.value),
            h(ReauthDialog as Component, flow.reauthDialog.value),
          ])
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return flow
}

const apiError = (code: string, details?: unknown) =>
  new ApiError(code, { status: 400, code, details, raw: null })

function passwordInput(): HTMLInputElement | null {
  return document.body.querySelector('input[name="currentPassword"]')
}

/** `.value` 대입만으로는 `v-model` 이 안 먹는다 — `input` 이벤트를 손으로 낸다. */
async function typePassword(value: string) {
  const input = passwordInput()
  expect(input, '가드 — 재인증 다이얼로그가 열려 있다').not.toBeNull()
  input!.value = value
  input!.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function click(text: string) {
  const button = buttonByText(text)
  expect(button, `가드 — "${text}" 버튼이 있다`).toBeTruthy()
  button!.click()
  await flushPromises()
}

describe('useWriteFlow — 관문', () => {
  it("gate 'none' 은 바로 실행하고 onSuccess(result) 뒤 true", async () => {
    const flow = await setup()
    const onSuccess = vi.fn()
    expect(await flow.run({ action: async () => 7, onSuccess })).toBe(true)
    expect(onSuccess).toHaveBeenCalledWith(7)
    expect(flow.submitting.value).toBe(false)
  })

  it('실행 중에는 submitting 이고, 그동안의 run() 은 바로 false', async () => {
    const flow = await setup()
    let release!: () => void
    const first = flow.run({ action: () => new Promise<void>((resolve) => (release = resolve)) })
    await flushPromises()
    expect(flow.submitting.value).toBe(true)
    expect(await flow.run({ action: async () => 1 })).toBe(false)
    release()
    expect(await first).toBe(true)
  })

  it("gate 'confirm' 은 ConfirmDialog 를 열고, 확인을 누르면 실행한다", async () => {
    const flow = await setup()
    const action = vi.fn(async () => undefined)
    const pending = flow.run({
      gate: 'confirm',
      reversible: false,
      message: '세션을 끊습니다.',
      action,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('세션을 끊습니다.')
    expect(action).not.toHaveBeenCalled()
    await click('확인')
    expect(await pending).toBe(true)
    expect(action).toHaveBeenCalledTimes(1)
    expect(flow.confirmDialog.value.modelValue).toBe(false)
  })

  it('취소하면 실행하지 않고 false', async () => {
    const flow = await setup()
    const action = vi.fn(async () => undefined)
    const pending = flow.run({ gate: 'confirm', reversible: true, message: '저장합니다.', action })
    await flushPromises()
    await click('취소')
    expect(await pending).toBe(false)
    expect(action).not.toHaveBeenCalled()
  })

  it("🔴 gate 'reauth' 는 입력한 비밀번호를 action 에 한 번 전달하고 바인딩에 남기지 않는다", async () => {
    const flow = await setup()
    const action = vi.fn(async (_ctx: { currentPassword: string }) => undefined)
    const pending = flow.run({ gate: 'reauth', message: '계정을 퇴사 처리합니다.', action })
    await flushPromises()
    await typePassword('my-secret')
    await click('확인')
    expect(await pending).toBe(true)
    expect(action).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledWith({ currentPassword: 'my-secret' })
    expect(JSON.stringify(flow.reauthDialog.value)).not.toContain('my-secret')
  })

  it('🔴 실행 중에는 ConfirmDialog 확인 버튼이 disabled — :loading 만으로는 클릭이 안 막힌다', async () => {
    const flow = await setup()
    let release!: () => void
    const action = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const pending = flow.run({ gate: 'confirm', reversible: true, message: '저장합니다.', action })
    await flushPromises()
    await click('확인')
    expect(buttonByText('확인')?.disabled).toBe(true)
    buttonByText('확인')?.click()
    await flushPromises()
    expect(action).toHaveBeenCalledTimes(1)
    release()
    expect(await pending).toBe(true)
  })

  it('실행 중에 다이얼로그를 닫으면 요청 결과를 기다려 끝난다 — 섣불리 false 가 아니다', async () => {
    const flow = await setup()
    let release!: () => void
    const action = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const pending = flow.run({ gate: 'confirm', reversible: true, message: '저장합니다.', action })
    await flushPromises()
    await click('확인')
    flow.confirmDialog.value['onUpdate:modelValue'](false)
    await flushPromises()
    expect(flow.confirmDialog.value.modelValue).toBe(false)
    release()
    expect(await pending).toBe(true)
  })
})

describe('useWriteFlow — 결과 분류', () => {
  it('🔴 재인증 실패는 다이얼로그를 연 채 안에 문구를 보이고 handled — 다시 입력하면 이어서 성공', async () => {
    const flow = await setup()
    const failure = new ApiError('현재 비밀번호가 올바르지 않습니다', {
      status: 403,
      code: 'ERR_REAUTH_REQUIRED',
      raw: null,
    })
    const action = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined)
    const pending = flow.run({ gate: 'reauth', action })
    await flushPromises()
    await typePassword('wrong')
    await click('확인')
    expect(failure.handled).toBe(true)
    expect(flow.reauthDialog.value.modelValue).toBe(true)
    expect(document.body.textContent).toContain('현재 비밀번호가 올바르지 않습니다')
    await typePassword('right')
    await click('확인')
    expect(await pending).toBe(true)
    expect(action).toHaveBeenLastCalledWith({ currentPassword: 'right' })
  })

  it('검증 실패는 fieldErrors 를 채우고 handled, 다이얼로그를 닫고 false', async () => {
    const flow = await setup()
    const failure = apiError('ERR_COMMON_VALIDATION', {
      issues: [{ path: ['userId'], message: '이미 쓰는 아이디입니다' }],
    })
    const pending = flow.run({ gate: 'reauth', action: vi.fn().mockRejectedValue(failure) })
    await flushPromises()
    await typePassword('pw')
    await click('확인')
    expect(await pending).toBe(false)
    expect(flow.fieldErrors.value).toEqual({ userId: ['이미 쓰는 아이디입니다'] })
    expect(failure.handled).toBe(true)
    expect(flow.reauthDialog.value.modelValue).toBe(false)
  })

  it('필드로 바꿀 수 없는 검증 실패는 handled 가 아니다 — 전역 토스트가 알린다', async () => {
    const flow = await setup()
    const failure = apiError('ERR_COMMON_VALIDATION', { reason: 'x' })
    expect(await flow.run({ action: vi.fn().mockRejectedValue(failure) })).toBe(false)
    expect(failure.handled).toBe(false)
    expect(flow.fieldErrors.value).toEqual({})
  })

  it('다음 실행을 시작하면 fieldErrors 를 비운다', async () => {
    const flow = await setup()
    const failure = apiError('ERR_COMMON_VALIDATION', {
      issues: [{ path: ['userId'], message: 'm' }],
    })
    await flow.run({ action: vi.fn().mockRejectedValue(failure) })
    expect(flow.fieldErrors.value).not.toEqual({})
    let release!: () => void
    const next = flow.run({ action: () => new Promise<void>((resolve) => (release = resolve)) })
    await flushPromises()
    expect(flow.fieldErrors.value).toEqual({})
    release()
    await next
  })

  it('revision 충돌 — onConflict 가 있으면 부르고 handled, 없으면 handled 아님. 둘 다 false', async () => {
    const flow = await setup()
    const withHandler = apiError('ERR_COMMON_REVISION_CONFLICT')
    const onConflict = vi.fn()
    expect(await flow.run({ action: vi.fn().mockRejectedValue(withHandler), onConflict })).toBe(
      false,
    )
    expect(onConflict).toHaveBeenCalledWith(withHandler)
    expect(withHandler.handled).toBe(true)
    const without = apiError('ERR_COMMON_REVISION_CONFLICT')
    expect(await flow.run({ action: vi.fn().mockRejectedValue(without) })).toBe(false)
    expect(without.handled).toBe(false)
  })

  it('그 밖의 오류는 handled 가 아니다 — 재인증 관문이 아닌 쓰기의 ERR_REAUTH_REQUIRED 도', async () => {
    const flow = await setup()
    const internal = apiError('ERR_COMMON_INTERNAL')
    expect(await flow.run({ action: vi.fn().mockRejectedValue(internal) })).toBe(false)
    expect(internal.handled).toBe(false)
    const reauthOnConfirm = apiError('ERR_REAUTH_REQUIRED')
    const pending = flow.run({
      gate: 'confirm',
      reversible: true,
      message: '저장합니다.',
      action: vi.fn().mockRejectedValue(reauthOnConfirm),
    })
    await flushPromises()
    await click('확인')
    expect(await pending).toBe(false)
    expect(reauthOnConfirm.handled).toBe(false)
    expect(flow.confirmDialog.value.modelValue).toBe(false)
  })

  it('ApiError 가 아닌 예외는 다시 던진다 — 프로그래밍 오류를 삼키지 않고, 다음 실행은 막히지 않는다', async () => {
    const flow = await setup()
    const bug = new TypeError('x is undefined')
    await expect(flow.run({ action: vi.fn().mockRejectedValue(bug) })).rejects.toBe(bug)
    expect(flow.submitting.value).toBe(false)
    expect(await flow.run({ action: async () => 1 })).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useWriteFlow.render.test.ts`
Expected: FAIL — `Failed to load url ./useWriteFlow.js`

- [ ] **Step 3: 구현**

`packages/admin-ui/src/composables/useWriteFlow.ts`:

```ts
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { CommonErrorCodes } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { toFieldErrors } from '../api/field-errors.js'

// 정본: hangang-home apps/admin/src/pages/org/users.vue `onReauthConfirm` · users-messages.ts `isReauthFailure`
//       + ssworks-gise-home revision 충돌 처리(components/RoleFormDialog.vue · pages/settings/index.vue)
// 바꾼 점:
//  - 페이지마다 `switch(action)` 으로 갈리던 쓰기를 `run({ gate, action })` 하나로. 확인 · 재인증 관문,
//    busy, 오류 분류를 여기서 한 번만 한다.
//  - 재인증 실패 판정을 AxiosError 직접 읽기에서 `ApiError.code` 로.
//  - 🔴 화면에 직접 보인 오류만 `handled` 로 표시한다 — `createApiClient` 의 지연 `onError` 가 그것을
//    건너뛴다(전역 토스트 이중 알림 방지). 표시는 `catch` 의 동기 구간에서 한다.
//  - 성공 알림은 하지 않는다 — 문구가 페이지마다 달라 `onSuccess` 에서 페이지가 띄운다.

interface WriteCommon<T> {
  onSuccess?: (result: T) => void | Promise<void>
  /** `ERR_COMMON_REVISION_CONFLICT`. 있으면 처리 표시(전역 토스트를 막음), 없으면 전역 토스트에 맡긴다. */
  onConflict?: (error: ApiError) => void | Promise<void>
}

interface DialogText {
  title?: string
  message?: string
  confirmLabel?: string
}

export type WriteRunOptions<T> =
  | ({ gate?: 'none'; action: () => Promise<T> } & WriteCommon<T>)
  | ({
      gate: 'confirm'
      /** 🔴 필수 — `ConfirmDialog` 규약. 되돌릴 수 있는지를 부르는 쪽이 밝힌다. */
      reversible: boolean
      confirmColor?: string
      action: () => Promise<T>
    } & WriteCommon<T> &
      DialogText)
  | ({
      gate: 'reauth'
      action: (ctx: { currentPassword: string }) => Promise<T>
    } & WriteCommon<T> &
      DialogText)

/** `<ConfirmDialog v-bind="confirmDialog" />` — props 와 리스너 이름은 컴포넌트 그대로. */
export interface ConfirmDialogBindings {
  modelValue: boolean
  'onUpdate:modelValue': (value: boolean) => void
  title: string
  message: string
  reversible: boolean
  submitting: boolean
  confirmLabel?: string
  confirmColor?: string
  onConfirm: () => void
}

/** `<ReauthDialog v-bind="reauthDialog" />` — props 와 리스너 이름은 컴포넌트 그대로. */
export interface ReauthDialogBindings {
  modelValue: boolean
  'onUpdate:modelValue': (value: boolean) => void
  title?: string
  message: string
  submitting: boolean
  error: string
  confirmLabel?: string
  onConfirm: (password: string) => void
}

export interface WriteFlow {
  /** 성공 true · 취소 · 실패 false. 진행 중이면 바로 false. ApiError 가 아닌 예외는 reject. */
  run: <T>(options: WriteRunOptions<T>) => Promise<boolean>
  submitting: Readonly<Ref<boolean>>
  fieldErrors: Readonly<Ref<Record<string, string[]>>>
  clearFieldErrors: () => void
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  reauthDialog: ComputedRef<ReauthDialogBindings>
}

interface Pending {
  options: WriteRunOptions<unknown>
  resolve: (ok: boolean) => void
  reject: (error: unknown) => void
}

/** 쓰기 흐름. 페이지당 하나 — 동작마다 `run()` 을 부르고 두 다이얼로그는 페이지에 한 번씩 둔다. */
export function useWriteFlow(): WriteFlow {
  const submitting = ref(false)
  const fieldErrors = shallowRef<Record<string, string[]>>({})
  const pending = shallowRef<Pending | null>(null)
  const confirmOpen = ref(false)
  const reauthOpen = ref(false)
  const reauthError = ref('')

  function closeGates(): void {
    confirmOpen.value = false
    reauthOpen.value = false
    reauthError.value = ''
  }

  function settle(current: Pending, outcome: { ok: boolean } | { error: unknown }): void {
    if (pending.value === current) pending.value = null
    if ('error' in outcome) current.reject(outcome.error)
    else current.resolve(outcome.ok)
  }

  function run<T>(options: WriteRunOptions<T>): Promise<boolean> {
    // 권한 검사는 부르는 쪽이 먼저 한다(hangang: 권한 → 재인증 순).
    if (submitting.value || pending.value) return Promise.resolve(false)
    return new Promise<boolean>((resolve, reject) => {
      pending.value = { options: options as unknown as WriteRunOptions<unknown>, resolve, reject }
      if (options.gate === 'confirm') confirmOpen.value = true
      else if (options.gate === 'reauth') reauthOpen.value = true
      else void execute(undefined)
    })
  }

  async function execute(currentPassword: string | undefined): Promise<void> {
    const current = pending.value
    if (!current || submitting.value) return
    const { options } = current
    submitting.value = true
    fieldErrors.value = {}
    reauthError.value = ''
    let result: unknown
    try {
      // 🔴 비밀번호는 다이얼로그에서 여기로 한 번 오고, 이 함수 밖에 남지 않는다.
      result =
        options.gate === 'reauth'
          ? await options.action({ currentPassword: currentPassword ?? '' })
          : await options.action()
    } catch (caught) {
      submitting.value = false
      onFailure(current, caught)
      return
    }
    closeGates()
    try {
      await options.onSuccess?.(result)
      settle(current, { ok: true })
    } catch (caught) {
      settle(current, { error: caught })
    } finally {
      submitting.value = false
    }
  }

  /** 🔴 `handled` 표시는 이 함수의 동기 구간에서 한다 — 지연 `onError` 보다 먼저여야 한다. */
  function onFailure(current: Pending, caught: unknown): void {
    if (!(caught instanceof ApiError)) {
      closeGates()
      settle(current, { error: caught })
      return
    }
    const { options } = current
    if (caught.code === CommonErrorCodes.ERR_REAUTH_REQUIRED && options.gate === 'reauth') {
      // 🔴 다이얼로그를 닫지 않는다 — 닫으면 사용자가 뒤의 폼을 처음부터 다시 채운다(hangang).
      caught.handled = true
      reauthError.value = caught.message
      return
    }
    if (caught.code === CommonErrorCodes.ERR_COMMON_VALIDATION) {
      const mapped = toFieldErrors(caught)
      if (Object.keys(mapped).length > 0) {
        caught.handled = true
        fieldErrors.value = mapped
      }
    }
    if (caught.code === CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT && options.onConflict) {
      caught.handled = true
      closeGates()
      const onConflict = options.onConflict
      void Promise.resolve()
        .then(() => onConflict(caught))
        .then(
          () => settle(current, { ok: false }),
          (error: unknown) => settle(current, { error }),
        )
      return
    }
    closeGates()
    settle(current, { ok: false })
  }

  function onGateModel(gate: 'confirm' | 'reauth', open: boolean): void {
    if (open) return
    if (gate === 'confirm') confirmOpen.value = false
    else {
      reauthOpen.value = false
      reauthError.value = ''
    }
    // 실행 중에 닫혔으면 결과를 기다린다 — 요청은 이미 나갔다. 끝나면 execute 가 정리한다.
    const current = pending.value
    if (current && !submitting.value) settle(current, { ok: false })
  }

  const confirmDialog = computed<ConfirmDialogBindings>(() => {
    const options = pending.value?.options
    const text = options?.gate === 'confirm' ? options : undefined
    return {
      modelValue: confirmOpen.value,
      'onUpdate:modelValue': (open: boolean) => onGateModel('confirm', open),
      title: text?.title ?? '확인',
      message: text?.message ?? '',
      reversible: text?.reversible ?? true,
      submitting: submitting.value,
      confirmLabel: text?.confirmLabel,
      confirmColor: text?.confirmColor,
      onConfirm: () => {
        void execute(undefined)
      },
    }
  })

  const reauthDialog = computed<ReauthDialogBindings>(() => {
    const options = pending.value?.options
    const text = options?.gate === 'reauth' ? options : undefined
    return {
      modelValue: reauthOpen.value,
      'onUpdate:modelValue': (open: boolean) => onGateModel('reauth', open),
      title: text?.title,
      message: text?.message ?? '',
      submitting: submitting.value,
      error: reauthError.value,
      confirmLabel: text?.confirmLabel,
      onConfirm: (password: string) => {
        void execute(password)
      },
    }
  })

  return {
    run,
    submitting,
    fieldErrors,
    clearFieldErrors: () => {
      fieldErrors.value = {}
    },
    confirmDialog,
    reauthDialog,
  }
}
```

- [ ] **Step 4: 통과 · 타입 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useWriteFlow.render.test.ts`
Expected: PASS
Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/composables/useWriteFlow.ts packages/admin-ui/src/composables/useWriteFlow.render.test.ts
git add packages/admin-ui/src/composables/useWriteFlow.ts packages/admin-ui/src/composables/useWriteFlow.render.test.ts
git commit -m "feat(admin-ui): useWriteFlow — 확인·재인증 관문, busy, 오류 분류(handled)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: export · README · changeset · 문서 · 최종 검증

**Files:**

- Modify: `packages/admin-ui/src/index.ts`
- Modify: `packages/admin-ui/README.md`
- Create: `.changeset/admin-ui-list-write.md`
- Modify: `docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md` (끝에 §10)
- Modify: `docs/01-phase0.md` (§2-2 아래 · §8 "미확인" 문단)
- Modify: `CLAUDE.md` (진행 상태 표), `docs/HANDOFF.md` ("다음 플랜" 행)

**Interfaces:**

- Consumes: Task 1~7 의 모든 export.

- [ ] **Step 1: export 추가**

`packages/admin-ui/src/index.ts` 에서 `export { ApiError } from './api/error.js'` 줄 아래에 추가:

```ts
export { toFieldErrors } from './api/field-errors.js'
```

파일 끝(`export { useTableSelection } …` 아래)에 추가:

```ts
export { useQuerySyncedFilter, type QuerySyncOptions } from './composables/useQuerySyncedFilter.js'
export {
  queryCodec,
  withDefault,
  bindQueryCodecs,
  type QueryCodec,
  type DefaultedQueryCodec,
  type QueryCodecSpec,
  type QuerySyncBinding,
  type RawQueryValue,
} from './composables/query-codec.js'
export {
  useServerTable,
  type ServerTable,
  type ServerTableOptions,
  type ServerTableParams,
} from './composables/useServerTable.js'
export {
  useWriteFlow,
  type WriteFlow,
  type WriteRunOptions,
  type ConfirmDialogBindings,
  type ReauthDialogBindings,
} from './composables/useWriteFlow.js'
```

- [ ] **Step 2: README**

`packages/admin-ui/README.md` 의 "셸 · 내비게이션 · 인프라" 표에서 `| \`useDirtyGuard\` · …` 행 아래에 네 행을 추가:

```md
| `useServerTable` · `ServerTable` · `ServerTableOptions` · `ServerTableParams` | 서버 페이징 목록 — 조회 1번 · 늦은 응답 무시 · 필터/쪽 크기 변경 시 1쪽 · 정렬 보정 · bigint `total` · `urlSync` |
| `useQuerySyncedFilter` · `QuerySyncOptions` · `queryCodec` · `withDefault` · `bindQueryCodecs` · `QueryCodec` · `DefaultedQueryCodec` · `QueryCodecSpec` · `QuerySyncBinding` · `RawQueryValue` | 목록 상태 ↔ URL 쿼리. 타이밍 핵심(`read`·`toQuery`) + 선택형 코덱(기본 6종 · 커스텀) |
| `useWriteFlow` · `WriteFlow` · `WriteRunOptions` · `ConfirmDialogBindings` · `ReauthDialogBindings` | 쓰기 관문(확인 · 재인증) · busy · 오류 분류. 다이얼로그는 `v-bind="confirmDialog"` |
| `toFieldErrors` | `ERR_COMMON_VALIDATION` 의 `details.issues` → 필드 키별 메시지(`'members.0.name'`) |
```

같은 README "최소 배선" 의 `onError: (error) => {` 바로 위 줄(`noRetryPaths: ['/auth/login'],` 다음)에 주석 두 줄을 추가:

```ts
// 🔴 onError 는 한 매크로태스크 뒤에 불리고, 호출처가 화면에 직접 보인 오류(`error.handled`)는
//    오지 않는다 — useWriteFlow 의 재인증 실패 · 필드 오류 · 충돌 안내가 토스트로 또 뜨지 않는다.
```

README 끝에 사용 절을 추가:

````md
## 목록 · 쓰기

```ts
const applied = ref({ userId: '', teamNo: undefined as bigint | undefined })
const { page, itemsPerPage, sortBy, items, total, loading, isFiltered, reload } = useServerTable({
  fetch: (params) => api.get<Paginated<UserRow>>('/users', { params }),
  sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
  filters: () => ({ userId: applied.value.userId || undefined, teamNo: applied.value.teamNo }),
  urlSync: bindQueryCodecs(applied, {
    userId: withDefault(queryCodec.string(), ''),
    teamNo: queryCodec.bigint(),
  }),
})

const { run, submitting, fieldErrors, confirmDialog, reauthDialog } = useWriteFlow()
function resign(no: bigint) {
  void run({
    gate: 'reauth',
    message: '이 계정을 퇴사 처리합니다.',
    action: ({ currentPassword }) => api.post(`/users/${no}/resign`, { currentPassword }),
    onSuccess: () => reload(),
  })
}
```

```vue
<DataTableBody
  v-model:page="page"
  v-model:items-per-page="itemsPerPage"
  v-model:sort-by="sortBy"
  :headers="headers"
  :items="items"
  :items-length="total"
  :loading="loading"
>
  <template #no-data><EmptyState :filtered="isFiltered" title="아직 없습니다" filtered-title="조건에 맞는 항목이 없습니다" /></template>
</DataTableBody>
<ConfirmDialog v-bind="confirmDialog" />
<ReauthDialog v-bind="reauthDialog" />
```

- 반환값은 ref 묶음이다 — 구조 분해해서 템플릿에 건다(템플릿은 최상위 바인딩만 언래핑한다).
- 표는 "적용된" 필터만 본다. 입력값과 적용값을 나눠 Enter · 버튼으로 적용한다.
- `urlSync` 를 쓰는 화면은 동적 세그먼트 상세 라우트(`/users/:id`)가 아니어야 한다 — 같은 컴포넌트가 재사용돼 URL 감시가 꺼진다.
- 서버는 revision 충돌에 `ERR_COMMON_REVISION_CONFLICT`, 검증 실패에 `ERR_COMMON_VALIDATION` + `details.issues[{ path: (string|number)[], message }]` 를 보낸다.
````

- [ ] **Step 3: changeset**

`.changeset/admin-ui-list-write.md`:

```md
---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

PR #3a — 목록 · 쓰기 기반.

- admin-ui 새 API: `useServerTable` · `useQuerySyncedFilter` · 코덱 층(`queryCodec` · `withDefault` · `bindQueryCodecs`) · `useWriteFlow` · `toFieldErrors`.
- admin-shared 새 오류 코드 `ERR_COMMON_REVISION_CONFLICT`(409). `ERR_COMMON_CONFLICT` 는 상태 전이 충돌 전용이다 — 서버는 revision 불일치에 새 코드를 보낼 것.
- **동작 변경:** `createApiClient` 의 `onError` 가 **한 매크로태스크 뒤에** 불리고, 호출처가 `error.handled = true` 로 표시한 오류는 건너뛴다. `onError` 가 거부 직후 동기로 불린다고 기대하던 코드·테스트는 한 틱 기다리도록 고칠 것.
- `ApiError` 에 `handled: boolean` 필드가 생겼다.
```

- [ ] **Step 4: 스펙 §10 · 경계 문서 · 진행표**

`docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md` 끝에 추가:

```md
## 10. 구현 중 정정 (2026-10-03)

- **R1 — `ERR_COMMON_CONFLICT` 는 "상태 전이 충돌" 로 좁혔다.** §4-6 은 "중복 값 · 상태 전이 충돌" 이라 적었으나 중복 값에는 이미 `ERR_COMMON_DUPLICATED`(409)가 있다.
- **R2 — `urlSync` 키 충돌은 환경과 무관하게 `console.error` 후 표 값으로 덮는다.** §4-3 의 "개발 빌드에서 throw" 는 라이브러리에서 지킬 수 없다 — vite 라이브러리 빌드는 `import.meta.env.DEV` 를 빌드 시점 상수(`false`)로 바꿔, 소비 앱의 개발 모드를 모른다.
- **R3 — `confirmColor` 는 `gate: 'confirm'` 옵션에만 둔다.** §4-4 의 `DialogText` 주석("confirm 관문만")을 타입으로 옮겼다.
```

`docs/01-phase0.md` 의 `### 2-3.` 제목 바로 위(2-2 표 다음 줄)에 추가:

```md
> **PR #3 경계 결정 (2026-10-03)** — `useQuerySyncedFilter` 는 콜백형 핵심 + 선택형 코덱 층(`queryCodec` 6종 · `withDefault` · `bindQueryCodecs`). `useFieldErrors` 는 **`toFieldErrors` 순수 함수만 A**, gise 의 표시 추적(provide/inject)은 B. `TeamTree` 의 he-tree · `LegalDocumentEditor` 의 CodeMirror 는 **필수 peer**(엔트리 하나 유지). PR #3 은 3a~3e 로 나눈다. 근거: `docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md` §2.
```

같은 파일 §8 의 `미확인(추출본에 없어 확정 보류): …` 문단 끝에 덧붙인다:

```md
→ **2026-10-03 원본 확인으로 해소** — crm `queryCodec.ts`·`useQuerySyncedFilter.ts`, gise `useRouteQuerySync.ts`·`useFieldErrors.ts` 를 읽고 위 결정에 반영했다.
```

`CLAUDE.md` "진행 상태와 다음 단계" 표에서 `Phase 1 PR #3 — \`PermissionMatrix\` …` 로 시작하는 행을 다음 두 행으로 바꾼다:

```md
| Phase 1 PR #3a — `useServerTable` · `useQuerySyncedFilter`(+코덱) · `useWriteFlow` · `toFieldErrors` | 완료 | 스펙 `docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md` · 플랜 `docs/superpowers/plans/2026-10-03-admin-ui-list-write.md` |
| **Phase 1 PR #3b~3e — 역할·설정 / 계정·세션 / 조직(he-tree) / 약관(CodeMirror)** | **다음** | 위 스펙 §2-1 · `docs/phase0-reports/fe-pages.md` §2 |
```

`docs/HANDOFF.md` "지금 상태" 표의 `다음 플랜` 행 내용을 다음으로 바꾼다:

```md
| 다음 플랜 | PR #3b(역할·설정 — `PermissionMatrix` · `useRoleEditor` · `SettingsShell`). 직전 PR #3a: 스펙 `docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md` · 플랜 `docs/superpowers/plans/2026-10-03-admin-ui-list-write.md` |
```

- [ ] **Step 5: 포맷 · 전체 검증**

Run: `pnpm format`
Run: `pnpm check`
Expected: lint · typecheck · test · build 모두 초록. admin-ui 테스트 수가 이전(348)보다 늘었다.

- [ ] **Step 6: 발행 형태 스모크**

`.claude/commands/smoke.md` 절차를 그대로 따른다 — 패킹한 tarball 을 임시 소비 앱(Vite + vue + vuetify)에 설치하고, `App.vue` 에서 admin-ui 의 **모든 export**(이번 새 export 포함 — `useServerTable` · `useQuerySyncedFilter` · `queryCodec` · `withDefault` · `bindQueryCodecs` · `useWriteFlow` · `toFieldErrors`)를 한 번씩 쓴 뒤 `vue-tsc --noEmit` · `vite build` 가 둘 다 통과해야 한다. 임시 폴더는 짧은 실제 경로(`%TEMP%` 바로 아래)에 만들고 끝나면 지운다 — 이 PC 는 긴 경로를 막아 둬서 깊은 경로에서는 pnpm 12 설치가 실패한다.
Expected: 통과

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-ui/src/index.ts packages/admin-ui/README.md .changeset/admin-ui-list-write.md docs/superpowers/specs/2026-10-03-admin-ui-list-write-design.md docs/01-phase0.md CLAUDE.md docs/HANDOFF.md
git commit -m "feat(admin-ui): PR #3a export · README · changeset · 문서 갱신

Co-Authored-By: Claude <noreply@anthropic.com>"
```
