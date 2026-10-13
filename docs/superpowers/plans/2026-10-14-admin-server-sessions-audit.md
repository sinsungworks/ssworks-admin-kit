# admin-server 세션 · 감사 (Phase 2 PR 2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@ssworks/admin-server` 에 세션 목록 · 끊기 6라우트(`AdminSessionsModule`)와 감사 기록 · 조회(`AdminAuditModule` — `@Audit` · 전역 인터셉터 · 인증 이벤트 sink · `GET /admin/audit-logs`)를 더하고, admin-shared 에 감사 카탈로그 · 행 · 조회 스키마를 더한다.

**Architecture:** 패키지 라우트는 권한 키 대신 **슬롯**(`sessions.read` · `sessions.manage` · `auditLogs.read`)을 선언하고 쓰는 쪽이 `AdminServerOptions.permissions` 로 키를 잇는다. 감사는 hangang 판 — 핸들러에 `@Audit` 을 달면 전역 인터셉터가 성공 · 실패를 응답 전에 기다려 기록하고(실패는 경고만), 인증 이벤트는 2b 가 비워 둔 `ADMIN_AUTH_EVENTS` 를 sink 가 채운다. 예외 필터의 판정을 `resolveErrorResponse` 로 꺼내 필터와 감사가 같은 상태 · 코드를 쓴다.

**Tech Stack:** NestJS 12.1 (ESM · NodeNext) · Kysely 0.29 + MariaDB 11.4 · zod 4 · vitest 4 · supertest · rxjs 7

**Spec:** `docs/superpowers/specs/2026-10-14-admin-server-sessions-audit-design.md` — 결정 ①~⑬(§2-1) · 공통 1~11(§2-2) · 설계 B1~B14(§2-3) · §14 R1(실측). 이 플랜은 스펙의 논증이고, 어긋나면 스펙이 이긴다.

## Global Constraints

- ESM 전용 · `module: NodeNext`. 내부 상대 import 는 `.js` 확장자. `console.log` 금지(`Logger.warn` · `error` 만).
- `admin-server/src` 는 `import type` 분리 규칙의 예외다(DI 메타데이터) — 단 데코레이터가 붙은 시그니처(생성자 · 핸들러 매개변수)에 쓰는 **인터페이스 · 타입 별칭은 `import type`**(TS1272), DI 로 받는 **클래스는 일반 import**.
- 정본에서 옮긴 파일은 머리 주석에 `정본:` 과 `바꾼 점:` 을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 패키지는 권한 키를 하드코딩하지 않는다 — 슬롯 이름만 쓴다: `'sessions.read'` · `'sessions.manage'` · `'auditLogs.read'`.
- 세션 "살아 있음" = `isRevoked = false AND expireAt > now`. 끊기의 사유는 늘 `'terminated'`.
- 오류 문구(정확히 이 글자):
  - `지금 쓰는 세션은 여기서 끝낼 수 없습니다. 로그아웃을 쓰세요.` — 400 `ERR_COMMON_BAD_REQUEST`
  - `세션을 찾을 수 없습니다. 이미 끝났거나 갱신됐을 수 있습니다.` — 404 `ERR_COMMON_NOT_FOUND`
  - `사용자를 찾을 수 없습니다.` — 404 `ERR_NO_USER`
  - `끝 시각은 시작 시각보다 뒤여야 합니다.` — 400 `ERR_COMMON_VALIDATION`, `issues[{ path: ['filter', 'to'] }]`
- 감사 컬럼 폭(코드 포인트): `method` 8 · `path` 255 · `ip` 45 · `userAgent` 255. 액션 ≤ 128 · 대상 종류 ≤ 64 · 오류 코드 ≤ 64. meta 상한 65 536 바이트(UTF-8), 소독 깊이 20.
- 기본 비밀 키(대소문자 무시): `password` · `currentPassword` · `newPassword` · `passwordHash` · `refreshToken` · `refreshTokenHash` · `accessToken` · `token` · `secret` · `keyHash`. 가림 문자열 `'***'`.
- LIKE 이스케이프 문자는 `'!'` — SQL 에는 `escape '!'` 를 정적 텍스트로 쓴다(바인딩하지 않는다).
- 쿼리스트링 bigint 는 `queryBigIntSchema` 로만 읽는다 — 🔴 `z.coerce.bigint()` 금지(`BigInt('')` 는 `0n`, `BigInt(' 3 ')` 은 `3n` — 스펙 §14 R1-5).
- admin-shared 스키마에 `.refine()` 을 걸지 않는다(3b §11 R1).
- admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server 가 새 export 를 본다.
- 테스트: 단위 · DB 없는 HTTP 는 `*.test.ts`(`pnpm check` 가 돌린다), 실 MariaDB 는 `*.db.test.ts`(`pnpm --filter @ssworks/admin-server test:db`, Docker 컨테이너 `admin-kit-test-db` 가 떠 있어야 한다). 테스트 전용 `data-testid` 없음.
- 셸: Windows(Git Bash) · Linux 양쪽. 🔴 `/dev/null` 로 보내지 않는다(Windows 에 `NUL` 파일이 생긴다). 파일을 python · sed 로 다시 쓰지 않는다(LF).
- 🔴 도구 입력의 백슬래시 이스케이프는 JSON 으로 풀린다 — 백슬래시가 든 편집(예: `'\n'`) 뒤에는 `node -e` 와 `String.fromCharCode` · `charCodeAt` 로 그 자리의 바이트를 확인한다. 새 코드는 정규식에 `[0-9]` 같은 문자 클래스를 쓰고 문구는 한 줄로 써서 백슬래시를 피한다.
- 커밋: 한국어 conventional commits. 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `pnpm release` · `npm publish` · `pnpm stage approve` 는 하지 않는다.

## Review Focus

스펙이 함의하지만 다른 테스트가 재지 않는, 사람이 가장 먼저 부딪힐 입력 다섯. 각 줄의 테스트를 담당 Task 에 넣었다.

1. **폭을 넘는 이모지 User-Agent · 경로** — 코드 포인트 단위로 잘려 서로게이트 반쪽이 남지 않고, INSERT 가 죽지 않는다. → Task 6 `entry.test.ts` "이모지 UA".
2. **공백뿐인 검색어 · `%` `_` `!` 가 든 검색어** — 공백뿐이면 조건 없음(전부), 특수문자는 글자 그대로 찾는다. → Task 10 `session.store.db.test.ts` "검색어", Task 11 `sessions.query.test.ts` "공백뿐".
3. **빈 `filter[userNo]=`** — 0번 사용자가 아니라 400 이다. → Task 2 `audit.test.ts` `queryBigIntSchema`, Task 12 `sessions.http.db.test.ts` "빈 userNo".
4. **`expireAt` 이 지금과 같은 세션** — 살아 있지 않다(목록에서 빠지고 끊기 0행). → Task 10 "경계".
5. **"다른 세션 모두" 에 끊을 것이 없을 때** — 200 `{ revokedCount: 0 }` 이고 감사 행(`revokedCount: 0`)이 남는다. → Task 12 `audit.http.db.test.ts` "0건".

## 파일 구조

| 파일                                                                                                     | 책임                                                                                      | Task |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| `packages/admin-server/src/http/error-response.ts`                                                       | `resolveErrorResponse` — 예외 → 상태 · 봉투 · 남길 로그(순수)                             | 1    |
| `packages/admin-server/src/http/exception.filter.ts`                                                     | 판정을 위임하고 로그 · 전송만                                                             | 1    |
| `packages/admin-shared/src/audit.ts`                                                                     | 코어 액션 · 대상 · 라벨, `defineAuditCatalog`, `queryBigIntSchema`, 감사 행 · 조회 스키마 | 2    |
| `packages/admin-server/src/database/like.ts`                                                             | `LIKE_ESCAPE` · `escapeLike` · `likeContains` · `likePrefix`                              | 3    |
| `packages/admin-server/src/auth/permission-slots.ts`                                                     | 슬롯 타입 · `RequirePermissionSlot` · `assertPermissionSlots`                             | 4    |
| `packages/admin-server/src/auth/module-check.ts`                                                         | `assertAuthModuleRegistered`                                                              | 4    |
| `packages/admin-server/src/auth/options.ts` · `permission.guard.ts`                                      | 해석된 슬롯 맵 · 가드의 슬롯 갈래                                                         | 4    |
| `packages/admin-server/src/database/migrations/0008_audit_logs.ts` · `tables/audit-logs.ts`              | 감사 장 · 테이블 타입                                                                     | 5    |
| `packages/admin-server/src/audit/audit.decorator.ts`                                                     | `@Audit`                                                                                  | 6    |
| `packages/admin-server/src/audit/audit-bag.ts`                                                           | 요청의 감사 가방 · `attachAudit*`                                                         | 6    |
| `packages/admin-server/src/audit/scrub.ts`                                                               | `scrubSecrets` · `foldBigInts` · `serializeAuditMeta`                                     | 6    |
| `packages/admin-server/src/audit/entry.ts`                                                               | 폭 자르기 · 요청 필드 · 대상 고르기 · `buildAuditEntry`                                   | 6    |
| `packages/admin-server/src/audit/options.ts`                                                             | `AdminAuditOptions` · `resolveAuditConfig`                                                | 7    |
| `packages/admin-server/src/audit/audit.service.ts`                                                       | `AdminAuditService.insert` — 던지지 않는 INSERT                                           | 7    |
| `packages/admin-server/src/audit/audit.interceptor.ts`                                                   | `AdminAuditInterceptor`                                                                   | 7    |
| `packages/admin-server/src/audit/auth-events.ts`                                                         | `auditEntryOfAuthEvent` · `AdminAuditEventSink`                                           | 8    |
| `packages/admin-server/src/audit/audit-logs.service.ts` · `audit-logs.controller.ts` · `errors.ts`       | 감사 조회                                                                                 | 9    |
| `packages/admin-server/src/audit/catalog-check.ts`                                                       | `@Audit` 선언 훑기 · 문제 판정                                                            | 9    |
| `packages/admin-server/src/audit/audit.module.ts`                                                        | `AdminAuditModule`(전역 · 기동 검사)                                                      | 9    |
| `packages/admin-server/src/auth/session.store.ts`                                                        | 목록 · 조건부 폐기 · `liveOnly`                                                           | 10   |
| `packages/admin-server/src/sessions/*`                                                                   | 문구 · 쿼리 스키마 · 서비스 · 컨트롤러 · `AdminSessionsModule`                            | 11   |
| `packages/admin-server/src/test-support/admin-app.ts` · `audit-probe.ts`                                 | 세션 · 감사 앱 부트 · 감사 프로브                                                         | 12   |
| `packages/admin-server/README.md` · `.changeset/admin-server-sessions-audit.md` · `docs/*` · `CLAUDE.md` | 문서 · 릴리스                                                                             | 13   |

순서 메모(스펙 §8 의 Task 목록과 다름): 세션 컨트롤러가 `@Audit` · `attachAudit*` 를 쓰므로 감사(6~9)를 세션(10~11) 앞에 둔다. 스펙 §4-2 의 "`AdminAuthModule` 이 `AdminSessionStore` 를 export" 는 Task 11 에서 바꾼다 — `AdminSessionsModule` 이 무상태 저장소를 자기 provider 로 둔다. 그래야 인증 모듈이 빠진 앱에서도 DI 해석 오류가 아니라 `assertAuthModuleRegistered` 의 문구로 멈춘다(스펙 §14 R2 에 적었다 — 플랜 작성 중 정정 R2~R6).

---

### Task 1: `resolveErrorResponse` 추출 — 동작은 그대로

**Files:**

- Create: `packages/admin-server/src/http/error-response.ts`
- Create: `packages/admin-server/src/http/error-response.test.ts`
- Modify: `packages/admin-server/src/http/exception.filter.ts`

**Interfaces:**

- Consumes: admin-shared `BusinessError` · `COMMON_ERROR_STATUS` · `CommonErrorCodes` · `ErrorCodeTable`
- Produces:
  - `export type ErrorStatusTable = Pick<ErrorCodeTable<Record<string, string>>, 'httpStatusFor'>`
  - `export interface ErrorBody { success: false; code: string; message: string; details?: unknown }`
  - `export interface ResolvedErrorResponse { status: number; body: ErrorBody; log?: { message: string; reason: unknown; details?: unknown } }`
  - `export function resolveErrorResponse(exception: unknown, errorCodes?: ErrorStatusTable): ResolvedErrorResponse`
  - `export const GENERIC_5XX_MESSAGE = '서버 내부 오류가 발생했습니다.'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/http/error-response.test.ts`:

```ts
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common'
import { BusinessError, CommonErrorCodes, defineErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { GENERIC_5XX_MESSAGE, resolveErrorResponse } from './error-response.js'

// 판정만 잰다 — 응답 전송 · 로그 · "반드시 응답" 은 http-contract.test.ts 가 그대로 잰다(2c 스펙 §5-4).

describe('resolveErrorResponse — BusinessError', () => {
  it('4xx 는 코드표 상태 · 메시지 · details, 로그 없음', () => {
    const result = resolveErrorResponse(
      new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, '겹친다', { at: 1n }),
    )
    expect(result).toEqual({
      status: 409,
      body: { success: false, code: 'ERR_COMMON_CONFLICT', message: '겹친다', details: { at: 1n } },
    })
  })

  it('details 가 없으면 키도 없다', () => {
    const result = resolveErrorResponse(
      new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, 'x'),
    )
    expect(result.body).toEqual({ success: false, code: 'ERR_COMMON_NOT_FOUND', message: 'x' })
    expect('details' in result.body).toBe(false)
  })

  it('🔴 5xx 는 고정 문구 · details 없음, 원문 · cause · details 는 log 로', () => {
    const cause = new Error('드라이버 원문')
    const result = resolveErrorResponse(
      new BusinessError(CommonErrorCodes.ERR_COMMON_INTERNAL, '내부 사유', { sql: 'x' }, { cause }),
    )
    expect(result.status).toBe(500)
    expect(result.body).toEqual({
      success: false,
      code: 'ERR_COMMON_INTERNAL',
      message: GENERIC_5XX_MESSAGE,
    })
    expect(result.log).toEqual({ message: '내부 사유', reason: cause, details: { sql: 'x' } })
  })

  it('프로젝트 코드는 errorCodes 의 상태', () => {
    const errors = defineErrorCodes({ ERR_NO_POST: 'ERR_NO_POST' }, { ERR_NO_POST: 404 })
    expect(resolveErrorResponse(new BusinessError('ERR_NO_POST', '없음'), errors).status).toBe(404)
  })

  it('🔴 표에 없는 코드 · Object.prototype 이름 코드는 500 · 고정 문구', () => {
    for (const code of ['ERR_UNKNOWN', 'constructor']) {
      const result = resolveErrorResponse(new BusinessError(code, '원문'))
      expect(result.status).toBe(500)
      expect(result.body.message).toBe(GENERIC_5XX_MESSAGE)
      expect(result.log?.message).toBe('원문')
    }
  })

  it('🔴 httpStatusFor 가 범위 밖을 돌려줘도 500', () => {
    const table = { httpStatusFor: () => 200 }
    expect(resolveErrorResponse(new BusinessError('ERR_X', 'x'), table).status).toBe(500)
  })
})

describe('resolveErrorResponse — HttpException · Express · 그 밖', () => {
  it('HttpException 4xx 는 상태에 맞는 코어 코드와 그 메시지', () => {
    expect(resolveErrorResponse(new NotFoundException('없는 경로'))).toEqual({
      status: 404,
      body: { success: false, code: 'ERR_COMMON_NOT_FOUND', message: '없는 경로' },
    })
    expect(resolveErrorResponse(new BadRequestException(['a', 'b'])).body.message).toBe('a, b')
  })

  it('HttpException 502 는 500 으로 가리고 log, 503 은 그대로', () => {
    const bad = resolveErrorResponse(new HttpException('상류', 502))
    expect(bad.status).toBe(500)
    expect(bad.body).toEqual({
      success: false,
      code: 'ERR_COMMON_INTERNAL',
      message: GENERIC_5XX_MESSAGE,
    })
    expect(bad.log?.message).toBe('상류')
    expect(resolveErrorResponse(new HttpException('점검', 503)).body.code).toBe(
      'ERR_COMMON_UNAVAILABLE',
    )
  })

  it('Express http-errors — 노출 가능한 4xx 만 그 상태', () => {
    expect(resolveErrorResponse({ status: 413, expose: true })).toEqual({
      status: 413,
      body: {
        success: false,
        code: 'ERR_COMMON_PAYLOAD_TOO_LARGE',
        message: '요청 본문이 너무 큽니다.',
      },
    })
    expect(resolveErrorResponse({ status: 400, expose: true }).body.message).toBe(
      '요청을 처리할 수 없습니다.',
    )
    expect(resolveErrorResponse({ status: 400, expose: false }).status).toBe(500)
  })

  it('문자열 · 맨 Error 는 500 과 log "처리되지 않은 예외"', () => {
    for (const thrown of ['문자열', new Error('boom')]) {
      const result = resolveErrorResponse(thrown)
      expect(result.status).toBe(500)
      expect(result.body.code).toBe('ERR_COMMON_INTERNAL')
      expect(result.log).toEqual({ message: '처리되지 않은 예외', reason: thrown })
    }
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/http/error-response.test.ts`
Expected: FAIL — `Failed to resolve import "./error-response.js"`

- [ ] **Step 3: 판정을 옮긴다**

`packages/admin-server/src/http/error-response.ts`:

```ts
import { HttpException } from '@nestjs/common'
import {
  BusinessError,
  COMMON_ERROR_STATUS,
  CommonErrorCodes,
  type CommonErrorCode,
  type ErrorCodeTable,
} from '@ssworks/admin-shared'

// 정본: 2a `AdminExceptionFilter.toBody`(ssworks-gise-home business-exception.filter.ts · hangang-home 같은 이름 파일)
// 바꾼 점: 판정만 꺼냈다 — 로그를 직접 찍지 않고 `log` 로 돌려준다. 필터는 찍고 감사 인터셉터는 버린다(2c 스펙 §5-4 ·
//   공통 10). 실패 요청 감사가 응답과 같은 상태 · 코드를 쓴다.

export type ErrorStatusTable = Pick<ErrorCodeTable<Record<string, string>>, 'httpStatusFor'>

export interface ErrorBody {
  success: false
  code: string
  message: string
  details?: unknown
}

export interface ResolvedErrorResponse {
  status: number
  body: ErrorBody
  /** 5xx · 처리되지 않은 예외만. 원문 · 사유 · details 는 로그로만 간다 */
  log?: { message: string; reason: unknown; details?: unknown }
}

/** 5xx 응답에서 원문 대신 나가는 고정 문구. 원문은 로그로만 간다. */
export const GENERIC_5XX_MESSAGE = '서버 내부 오류가 발생했습니다.'
const PAYLOAD_TOO_LARGE_MESSAGE = '요청 본문이 너무 큽니다.'
const EXPRESS_4XX_MESSAGE = '요청을 처리할 수 없습니다.'

const CODE_BY_STATUS: ReadonlyMap<number, CommonErrorCode> = new Map([
  [400, CommonErrorCodes.ERR_COMMON_BAD_REQUEST],
  [401, CommonErrorCodes.ERR_COMMON_UNAUTHORIZED],
  [403, CommonErrorCodes.ERR_COMMON_FORBIDDEN],
  [404, CommonErrorCodes.ERR_COMMON_NOT_FOUND],
  [409, CommonErrorCodes.ERR_COMMON_CONFLICT],
  [413, CommonErrorCodes.ERR_COMMON_PAYLOAD_TOO_LARGE],
  [429, CommonErrorCodes.ERR_COMMON_TOO_MANY_REQUESTS],
  [503, CommonErrorCodes.ERR_COMMON_UNAVAILABLE],
  [504, CommonErrorCodes.ERR_COMMON_TIMEOUT],
])

function codeForStatus(status: number): string {
  return (
    CODE_BY_STATUS.get(status) ??
    (status >= 500 ? CommonErrorCodes.ERR_COMMON_INTERNAL : CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
  )
}

/** 5xx 는 503 · 504 만 그대로 두고 나머지는 500 이다 — 상류의 502 같은 상태를 그대로 흉내 내지 않는다. */
function serverStatus(status: number): number {
  return status === 503 || status === 504 ? status : 500
}

/** body-parser 등 Express 층의 `http-errors` — 4xx 이고 노출 가능하다고 표시된 것만 그 상태를 믿는다. */
function expressClientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined
  const { status, expose } = exception as { status?: unknown; expose?: unknown }
  return typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status < 500 &&
    expose === true
    ? status
    : undefined
}

/**
 * 오류 응답의 상태를 400~599 정수로 고정한다. 그 밖(undefined · NaN · 함수 · 2xx)은 500.
 * 🔴 마스킹 판정(`>= 500`) **전에** 부른다 — 뒤에 하면 비정상 값이 4xx 경로를 타 원문 · details 를 싣고 나간 뒤에야
 *    500 으로 바뀐다. `httpStatusFor('constructor')` 처럼 코드표가 프로토타입 값을 돌려주는 경우가 실제로 있다.
 */
function errorStatus(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : 500
}

/** 객체 페이로드(`{ message, … }`)인 HttpException 에서 `message` 만 꺼낸다 — 다른 필드는 응답에 싣지 않는다(gise). */
function messageOfHttpException(exception: HttpException): string {
  const payload = exception.getResponse()
  if (typeof payload === 'string') return payload
  const message = (payload as { message?: unknown }).message
  if (typeof message === 'string') return message
  if (Array.isArray(message)) return message.map(String).join(', ')
  return exception.message
}

function statusOf(code: string, errorCodes: ErrorStatusTable | undefined): number {
  if (errorCodes) return errorStatus(errorCodes.httpStatusFor(code))
  return errorStatus(
    Object.hasOwn(COMMON_ERROR_STATUS, code)
      ? (COMMON_ERROR_STATUS as Readonly<Record<string, number>>)[code]
      : 500,
  )
}

/**
 * 예외 하나를 응답 상태 · 봉투로 판정한다. 던지지 않는 것을 목표로 하지만 부르는 쪽은 감싼다(필터의 "반드시 응답").
 * 🔴 예상 못한 예외의 내부 사유(드라이버 메시지 · 스택)는 본문에 넣지 않는다 — `log` 로만 돌려준다.
 */
export function resolveErrorResponse(
  exception: unknown,
  errorCodes?: ErrorStatusTable,
): ResolvedErrorResponse {
  if (exception instanceof BusinessError) {
    const status = statusOf(exception.code, errorCodes)
    if (status >= 500) {
      // 🔴 원문 · details 는 로그로만. details 는 클라이언트가 요청을 고치라고 주는 채널이라 5xx 에서는 뺀다(gise).
      return {
        status,
        body: { success: false, code: exception.code, message: GENERIC_5XX_MESSAGE },
        log: {
          message: exception.message,
          reason: exception.cause ?? exception,
          details: exception.details,
        },
      }
    }
    return {
      status,
      body: {
        success: false,
        code: exception.code,
        message: exception.message,
        ...(exception.details === undefined ? {} : { details: exception.details }),
      },
    }
  }

  if (exception instanceof HttpException) {
    const status = errorStatus(exception.getStatus())
    if (status >= 500) {
      const masked = serverStatus(status)
      return {
        status: masked,
        body: { success: false, code: codeForStatus(masked), message: GENERIC_5XX_MESSAGE },
        log: { message: messageOfHttpException(exception), reason: exception },
      }
    }
    return {
      status,
      body: {
        success: false,
        code: codeForStatus(status),
        message: messageOfHttpException(exception),
      },
    }
  }

  const expressStatus = expressClientErrorStatus(exception)
  if (expressStatus !== undefined) {
    return {
      status: expressStatus,
      body: {
        success: false,
        code: codeForStatus(expressStatus),
        message: expressStatus === 413 ? PAYLOAD_TOO_LARGE_MESSAGE : EXPRESS_4XX_MESSAGE,
      },
    }
  }

  return {
    status: 500,
    body: {
      success: false,
      code: CommonErrorCodes.ERR_COMMON_INTERNAL,
      message: GENERIC_5XX_MESSAGE,
    },
    log: { message: '처리되지 않은 예외', reason: exception },
  }
}
```

- [ ] **Step 4: 필터가 판정을 위임하게 고친다**

`packages/admin-server/src/http/exception.filter.ts` 를 통째로 이렇게 바꾼다(파일 머리 · `describeRequest` · `describeReason` · `normalizeStatus` · `send` · `log` · `logSafely` 와 그 🔴 주석은 그대로다):

```ts
import {
  Catch,
  Inject,
  Logger,
  Optional,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import { CommonErrorCodes, stringifyJSON } from '@ssworks/admin-shared'
import type { Request, Response } from 'express'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_SERVER_OPTIONS } from '../tokens.js'
import {
  GENERIC_5XX_MESSAGE,
  resolveErrorResponse,
  type ErrorBody,
  type ResolvedErrorResponse,
} from './error-response.js'
import { stringifyForLog, toJsonSafe } from './json-safe.js'

// 정본: ssworks-gise-home apps/api/src/core/filters/business-exception.filter.ts(`@Catch()` 전부 · 소독 경계 · 5xx 마스킹 ·
//       "반드시 응답" · logSafely · 상태 정규화) + hangang-home business-exception.filter.ts(stringifyJSON 으로 직접 보냄)
// 바꾼 점:
//  - 본문이 `{ success: false, code, message, details? }`(Phase 0 §4 #1). gise 는 `{ statusCode, … }`.
//  - 🔴 replacer 에 기대지 않는다 — 소독한 본문을 admin-shared `stringifyJSON` 으로 직접 보낸다(hangang). gise 는
//    `res.json()` 이라 `json replacer` 가 빠진 앱에서 bigint 가 든 오류 응답이 응답 없이 타임아웃했다.
//  - 상태 · 코드 · 마스킹 판정은 `resolveErrorResponse`(error-response.ts) — 감사 인터셉터가 같은 답을 쓴다(2c 스펙 §5-4).
//  - Express 층 `http-errors`(본문 초과 413 — Nest 가 그대로 넘긴다)를 그 상태로 받는다. gise 는 500 이었다.
//  - 헤더가 이미 나갔으면 다시 보내지 않고 응답을 닫는다(스펙 R5).
//  - 로그는 문자열 하나로 — Nest `Logger.error(message, second)` 는 둘째 문자열이 스택처럼 보이지 않으면 context 로 읽는다.

/** Express 5 의 `res.status()` 는 정수가 아니거나 범위 밖이면 던진다(gise). */
function normalizeStatus(status: number): number {
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500
}

/** 로그 첫 줄의 `METHOD PATH` — 쿼리스트링은 싣지 않는다. 던지지 않는다. */
function describeRequest(request: Request | undefined): string {
  try {
    const url = String(request?.originalUrl ?? '-')
    const queryIndex = url.indexOf('?')
    return `${String(request?.method ?? '-')} ${queryIndex === -1 ? url : url.slice(0, queryIndex)}`
  } catch {
    return '- -'
  }
}

function describeReason(reason: unknown): string {
  try {
    if (reason instanceof Error) return reason.stack ?? reason.message
    return String(reason)
  } catch {
    return '[unserializable]'
  }
}

/**
 * 전역 예외 필터 — 실패는 이 한 형식으로 나간다.
 *
 * 🔴 불변식: **이 필터에 온 요청은 반드시 응답을 받는다.** 어떤 예외 모양 · `details` 값 · 로거 동작도 이 필터를 던지게
 *    만들 수 없다. 이 위에는 아무것도 없다.
 * 🔴 예상 못한 예외의 내부 사유(드라이버 메시지 · 스택)는 응답에 넣지 않는다 — `cause` 와 함께 5xx 로그로만 간다.
 */
@Catch()
export class AdminExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AdminExceptionFilter.name)

  constructor(
    @Optional() @Inject(ADMIN_SERVER_OPTIONS) private readonly options?: AdminServerOptions,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const response = http.getResponse<Response>()
    let request: Request | undefined
    try {
      request = http.getRequest<Request>()
    } catch {
      request = undefined
    }

    let resolved: ResolvedErrorResponse
    // 🔴 이 try/catch 를 "안전한 값만 다루니 필요 없다" 며 지우지 않는다 — 분기가 하나 늘면 같은 사고가 난다(gise).
    try {
      resolved = resolveErrorResponse(exception, this.options?.errorCodes)
      if (resolved.log) {
        this.log(request, resolved.log.message, resolved.log.reason, resolved.log.details)
      }
    } catch (internalError) {
      this.logSafely(
        `${describeRequest(request)} — 예외 필터 내부 오류`,
        describeReason(internalError),
      )
      resolved = {
        status: 500,
        body: {
          success: false,
          code: CommonErrorCodes.ERR_COMMON_INTERNAL,
          message: GENERIC_5XX_MESSAGE,
        },
      }
    }
    this.send(response, request, normalizeStatus(resolved.status), resolved.body)
  }

  /** 🔴 클라이언트로 나가는 유일한 출구. 본문 전체가 소독 경계를 지난다. */
  private send(
    response: Response,
    request: Request | undefined,
    status: number,
    body: ErrorBody,
  ): void {
    if (response.headersSent) {
      // 🔴 다시 보내지 않는다. 열린 응답을 그대로 두면 요청이 끝나지 않으므로 닫는다(스펙 R5).
      this.logSafely(
        `${describeRequest(request)} — 응답이 이미 나가 오류 봉투(${body.code})를 보내지 못했다`,
      )
      try {
        if (!response.writableEnded) response.end()
      } catch {
        // 닫기도 실패하면 더 할 것이 없다.
      }
      return
    }
    const safe = toJsonSafe(body)
    const payload =
      typeof safe === 'object' && safe !== null && !Array.isArray(safe)
        ? safe
        : {
            success: false,
            code: CommonErrorCodes.ERR_COMMON_INTERNAL,
            message: GENERIC_5XX_MESSAGE,
          }
    try {
      response.status(status).type('application/json').send(stringifyJSON(payload))
    } catch (sendError) {
      this.logSafely(`${describeRequest(request)} — 응답 전송 실패`, describeReason(sendError))
    }
  }

  private log(
    request: Request | undefined,
    message: string,
    reason: unknown,
    details?: unknown,
  ): void {
    const parts = [`${describeRequest(request)} — ${message}`, describeReason(reason)]
    if (details !== undefined) parts.push(`details: ${stringifyForLog(details)}`)
    this.logSafely(...parts)
  }

  /** 🔴 로거가 죽어도 응답은 살린다 — 이 필터의 모든 로그가 여기를 지난다(gise). */
  private logSafely(...parts: string[]): void {
    try {
      this.logger.error(parts.join('\n'))
    } catch {
      // 의도적으로 삼킨다 — 같은 트랜스포트가 또 던진다.
    }
  }
}
```

- [ ] **Step 5: 새 테스트와 기존 필터 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/http`
Expected: PASS — `error-response.test.ts` 와 손대지 않은 `http-contract.test.ts` · `validation.test.ts` · `pipes.test.ts` · `json-safe.test.ts` 전부.

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-server/src/http/error-response.ts packages/admin-server/src/http/error-response.test.ts packages/admin-server/src/http/exception.filter.ts
git commit -m "refactor(admin-server): 오류 응답 판정을 resolveErrorResponse 로 꺼낸다" -m "필터는 로그 · 전송만 하고 상태 · 코드 · 마스킹 판정은 순수 함수가 한다 — 2c 감사 인터셉터가 같은 답을 쓴다(2c 스펙 §5-4). 동작은 그대로다." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: admin-shared — 감사 카탈로그 · `queryBigIntSchema` · 감사 행 · 조회 스키마

**Files:**

- Create: `packages/admin-shared/src/audit.ts`
- Create: `packages/admin-shared/src/audit.test.ts`
- Modify: `packages/admin-shared/src/index.ts`

**Interfaces:**

- Consumes: `createQuerySchema`(`./pagination.js`)
- Produces(전부 index 에서 export):
  - `CoreAuditActions` · `CoreAuditTargets` · `type CoreAuditAction` · `type CoreAuditTarget` · `CORE_AUDIT_ACTION_LABELS` · `CORE_AUDIT_TARGET_LABELS`
  - `AUDIT_ACTION_MAX_LENGTH = 128` · `AUDIT_TARGET_TYPE_MAX_LENGTH = 64`
  - `interface AuditCatalog<A, T>` · `interface AuditCatalogInput<A, T>` · `defineAuditCatalog(input?)` · `coreAuditCatalog`
  - `queryBigIntSchema`(입력 `bigint | string`, 출력 `bigint`)
  - `adminAuditLogSchema` · `type AdminAuditLog` · `adminAuditLogQuerySchema` · `type AdminAuditLogQuery`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-shared/src/audit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CORE_AUDIT_ACTION_LABELS,
  CORE_AUDIT_TARGET_LABELS,
  CoreAuditActions,
  CoreAuditTargets,
  adminAuditLogQuerySchema,
  adminAuditLogSchema,
  coreAuditCatalog,
  defineAuditCatalog,
  queryBigIntSchema,
} from './audit.js'

describe('코어 카탈로그', () => {
  it('🔴 액션 14 · 대상 2 · 라벨이 하나씩 — 개수는 이 테스트가 고정한다(산문의 개수는 낡는다)', () => {
    expect(Object.values(CoreAuditActions)).toHaveLength(14)
    expect(Object.values(CoreAuditTargets)).toEqual(['user', 'session'])
    expect(Object.keys(CORE_AUDIT_ACTION_LABELS).sort()).toEqual(
      [...Object.values(CoreAuditActions)].sort(),
    )
    expect(Object.keys(CORE_AUDIT_TARGET_LABELS).sort()).toEqual(['session', 'user'])
  })

  it('이름은 hangang 그대로 + session.revoke.others', () => {
    expect(CoreAuditActions.AUTH_LOGIN_BLOCKED_INACTIVE).toBe('auth.login.blocked.inactive')
    expect(CoreAuditActions.SESSION_REVOKE_OTHERS).toBe('session.revoke.others')
    expect(coreAuditCatalog.labelOf('session.revoke.others')).toBe('본인 다른 세션 모두 종료')
  })
})

describe('defineAuditCatalog', () => {
  const catalog = defineAuditCatalog({
    actions: { BOARD_POST_CREATE: 'board.post.create' },
    targets: { POST: 'post' },
    labels: { 'board.post.create': '게시글 작성', 'auth.logout': '나가기' },
    targetLabels: { post: '게시글' },
  })

  it('코어 + 프로젝트를 합치고 코어 라벨을 덮어쓴다', () => {
    expect(catalog.AuditActions.BOARD_POST_CREATE).toBe('board.post.create')
    expect(catalog.AuditActions.AUTH_LOGOUT).toBe('auth.logout')
    expect(catalog.ACTION_VALUES).toHaveLength(15)
    expect(catalog.TARGET_VALUES).toEqual(['user', 'session', 'post'])
    expect(catalog.labelOf('board.post.create')).toBe('게시글 작성')
    expect(catalog.labelOf('auth.logout')).toBe('나가기')
    expect(catalog.targetLabelOf('post')).toBe('게시글')
    expect(catalog.isAuditAction('board.post.create')).toBe(true)
    expect(catalog.isAuditAction('board.post.delete')).toBe(false)
    expect(catalog.isAuditTarget('post')).toBe(true)
  })

  it('🔴 모르는 값은 원문 그대로 — Object.prototype 이름도', () => {
    expect(catalog.labelOf('old.removed.action')).toBe('old.removed.action')
    expect(catalog.labelOf('constructor')).toBe('constructor')
    expect(catalog.targetLabelOf('toString')).toBe('toString')
    expect(catalog.isAuditAction('constructor')).toBe(false)
  })

  it('🔴 코어 키 · 코어 값과 겹치면 던진다', () => {
    expect(() =>
      defineAuditCatalog({ actions: { AUTH_LOGOUT: 'x.logout' }, labels: { 'x.logout': 'x' } }),
    ).toThrow('AUTH_LOGOUT')
    expect(() =>
      defineAuditCatalog({ actions: { MY_LOGOUT: 'auth.logout' }, labels: {} as never }),
    ).toThrow('auth.logout')
  })

  it('🔴 라벨이 빠지면 던진다', () => {
    expect(() =>
      defineAuditCatalog({ actions: { A: 'a.b' }, labels: {} as Record<'a.b', string> }),
    ).toThrow('라벨이 없는 액션: a.b')
    expect(() =>
      defineAuditCatalog({ targets: { P: 'p' }, targetLabels: {} as Record<'p', string> }),
    ).toThrow('라벨이 없는 대상: p')
  })

  it('폭을 넘는 값은 던진다(액션 128 · 대상 64)', () => {
    const long = `a.${'x'.repeat(127)}`
    expect(() =>
      defineAuditCatalog({
        actions: { L: long },
        labels: { [long]: 'l' } as Record<string, string>,
      }),
    ).toThrow('128')
  })
})

describe('queryBigIntSchema', () => {
  it('숫자만 든 문자열 · bigint 를 bigint 로', () => {
    expect(queryBigIntSchema.parse('3')).toBe(3n)
    expect(queryBigIntSchema.parse(7n)).toBe(7n)
    expect(queryBigIntSchema.parse('18446744073709551615')).toBe(18446744073709551615n)
  })

  it('🔴 빈 문자열 · 공백 · 부호 · 소수 · 지수 · 범위 밖은 거부 — BigInt("") 는 0n 이다', () => {
    for (const value of ['', ' 3', '3 ', '-1', '+1', '1.5', '1e3', '18446744073709551616', 'abc']) {
      expect(queryBigIntSchema.safeParse(value).success, value).toBe(false)
    }
    expect(queryBigIntSchema.safeParse(-1n).success).toBe(false)
  })
})

describe('감사 행 · 조회 스키마', () => {
  const ROW = {
    logNo: 1n,
    actorUserNo: 3n,
    actorUserId: 'admin',
    actorUserName: '관리자',
    sessionNo: 9n,
    action: 'session.revoke',
    targetType: 'session',
    targetRefNo: 12n,
    method: 'DELETE',
    path: '/api/admin/sessions/12',
    statusCode: 200,
    errorCode: null,
    ip: '10.0.0.1',
    userAgent: 'UA',
    meta: { revokedCount: 1 },
    createAt: '2026-10-14T01:02:03.000Z',
  }

  it('행을 받는다 — 행위자 · 대상 · IP 는 null 허용, action 은 열린 문자열', () => {
    expect(adminAuditLogSchema.parse(ROW)).toEqual(ROW)
    expect(
      adminAuditLogSchema.parse({
        ...ROW,
        actorUserNo: null,
        actorUserId: null,
        actorUserName: null,
        sessionNo: null,
        targetType: null,
        targetRefNo: null,
        ip: null,
        action: 'future.action',
        meta: null,
      }).action,
    ).toBe('future.action')
  })

  it('조회 쿼리 — 와이어의 문자열을 읽고 정렬 기본은 createAt', () => {
    const parsed = adminAuditLogQuerySchema.parse({
      page: '2',
      itemsPerPage: '50',
      filter: {
        actorUserNo: '7',
        action: 'session.revoke',
        actionMatch: 'exact',
        targetType: 'session',
        targetRefNo: '12',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-02T00:00:00.000Z',
      },
    })
    expect(parsed).toEqual({
      page: 2,
      itemsPerPage: 50,
      sortBy: ['createAt'],
      sortOrder: ['desc'],
      filter: {
        actorUserNo: 7n,
        action: 'session.revoke',
        actionMatch: 'exact',
        targetType: 'session',
        targetRefNo: 12n,
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-02T00:00:00.000Z',
      },
    })
  })

  it('정렬 열은 createAt 뿐, 빈 액션 · 오프셋 시각은 거부', () => {
    expect(adminAuditLogQuerySchema.safeParse({ sortBy: 'action' }).success).toBe(false)
    expect(adminAuditLogQuerySchema.safeParse({ filter: { action: '' } }).success).toBe(false)
    expect(
      adminAuditLogQuerySchema.safeParse({ filter: { from: '2026-10-01T09:00:00+09:00' } }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-shared exec vitest run src/audit.test.ts`
Expected: FAIL — `Failed to resolve import "./audit.js"`

- [ ] **Step 3: 구현한다**

`packages/admin-shared/src/audit.ts`:

````ts
import { z } from 'zod'
import { createQuerySchema } from './pagination.js'

// 감사 계약 — Phase 2 서버(@ssworks/admin-server AdminAuditModule)와 쓰는 쪽 감사 화면이 같은 이름 · 라벨을 본다.
//
// 정본: hangang-home packages/shared/src/constants/audit.const.ts(액션 · 라벨 · 대상) + 이 패키지 error-codes.ts
//       `defineErrorCodes`(코어 + 프로젝트 병합 틀)
// 바꾼 점:
//  - 코어 액션은 인증 · 세션만(2c). 사용자 · 역할 · 팀 · IP 액션은 2d~2f 가 더한다. 프로젝트 액션은 `defineAuditCatalog`.
//  - `session.revoke.others` 를 더했다(gise "다른 세션 모두").
//  - 행의 행위자는 `actorUserNo`(2c 스펙 B5). `action` 은 열린 문자열 — 새 판이 쓴 행도 옛 화면이 읽는다(gise).
//  - 🔴 `.refine()` 을 걸지 않는다(3b §11 R1) — 기간 순서는 서버가 본다(2c 스펙 B14).

export const AUDIT_ACTION_MAX_LENGTH = 128
export const AUDIT_TARGET_TYPE_MAX_LENGTH = 64

export const CoreAuditActions = {
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAIL: 'auth.login.fail',
  AUTH_LOGIN_BLOCKED_INACTIVE: 'auth.login.blocked.inactive',
  AUTH_LOGIN_BLOCKED_IP: 'auth.login.blocked.ip',
  AUTH_LOGIN_BLOCKED_LOCKED: 'auth.login.blocked.locked',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_TOKEN_REFRESH: 'auth.token.refresh',
  AUTH_TOKEN_REUSE: 'auth.token.reuse',
  AUTH_PASSWORD_CHANGE: 'auth.password.change',
  AUTH_ACCESS_BLOCKED_IP: 'auth.access.blocked.ip',
  SESSION_REVOKE: 'session.revoke',
  SESSION_REVOKE_USER: 'session.revoke.user',
  SESSION_REVOKE_SELF: 'session.revoke.self',
  SESSION_REVOKE_OTHERS: 'session.revoke.others',
} as const

export type CoreAuditAction = (typeof CoreAuditActions)[keyof typeof CoreAuditActions]

export const CoreAuditTargets = { USER: 'user', SESSION: 'session' } as const

export type CoreAuditTarget = (typeof CoreAuditTargets)[keyof typeof CoreAuditTargets]

/** hangang 문구. 🔴 액션마다 하나 — 빠지면 화면 필터 목록에서 조용히 사라진다(crm 39건) */
export const CORE_AUDIT_ACTION_LABELS: Readonly<Record<CoreAuditAction, string>> = Object.freeze({
  'auth.login.success': '로그인 성공',
  'auth.login.fail': '로그인 실패',
  'auth.login.blocked.inactive': '로그인 차단 (퇴사 계정)',
  'auth.login.blocked.ip': '로그인 차단 (허용되지 않은 IP)',
  'auth.login.blocked.locked': '로그인 차단 (계정 잠김)',
  'auth.logout': '로그아웃',
  'auth.token.refresh': '토큰 갱신',
  'auth.token.reuse': '갱신 토큰 재사용 탐지 (전 세션 폐기)',
  'auth.password.change': '본인 비밀번호 변경',
  'auth.access.blocked.ip': '접근 차단 (허용되지 않은 IP)',
  'session.revoke': '세션 강제 종료',
  'session.revoke.user': '사용자 전 세션 강제 종료',
  'session.revoke.self': '본인 세션 종료',
  'session.revoke.others': '본인 다른 세션 모두 종료',
})

export const CORE_AUDIT_TARGET_LABELS: Readonly<Record<CoreAuditTarget, string>> = Object.freeze({
  user: '사용자',
  session: '세션',
})

/**
 * 🔴 기본 타입 인자는 넓은 `Record<string, string>` 이다 — 프로젝트 카탈로그(`AuditCatalog<{ X: 'x' }>`)를 서버 옵션
 *    `audit.catalog`(타입 `AuditCatalog`)에 넣을 수 있어야 한다. 좁은 기본값이면 타입 술어 · 값 배열이 할당되지 않는다.
 */
export interface AuditCatalog<
  A extends Record<string, string> = Record<string, string>,
  T extends Record<string, string> = Record<string, string>,
> {
  readonly AuditActions: Readonly<typeof CoreAuditActions> & Readonly<A>
  readonly AuditTargets: Readonly<typeof CoreAuditTargets> & Readonly<T>
  readonly ACTION_VALUES: readonly (CoreAuditAction | A[keyof A])[]
  readonly TARGET_VALUES: readonly (CoreAuditTarget | T[keyof T])[]
  isAuditAction(value: string): value is CoreAuditAction | A[keyof A]
  isAuditTarget(value: string): value is CoreAuditTarget | T[keyof T]
  /** 모르는 값(옛 행 · 지운 액션)은 원문 그대로 */
  labelOf(action: string): string
  targetLabelOf(target: string): string
}

export interface AuditCatalogInput<
  A extends Record<string, string>,
  T extends Record<string, string>,
> {
  actions?: A
  targets?: T
  /** 프로젝트 액션은 전부 필수, 코어 액션은 덮어쓰기(선택) */
  labels?: Record<A[keyof A], string> & Partial<Record<CoreAuditAction, string>>
  targetLabels?: Record<T[keyof T], string> & Partial<Record<CoreAuditTarget, string>>
}

function overlappingKeys(project: object, core: object): string[] {
  return Object.keys(project).filter((key) => Object.hasOwn(core, key))
}

function duplicatedValues(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index)
}

function lookup(table: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

/**
 * 프로젝트 감사 액션 · 대상을 코어에 병합한다(`defineErrorCodes` 와 같은 틀).
 *
 * ```ts
 * export const auditCatalog = defineAuditCatalog({
 *   actions: { BOARD_POST_CREATE: 'board.post.create' },
 *   targets: { POST: 'post' },
 *   labels: { 'board.post.create': '게시글 작성' },
 *   targetLabels: { post: '게시글' },
 * })
 * ```
 *
 * 던진다: 코어와 키가 겹칠 때, 값이 코어 · 서로와 겹칠 때, 라벨이 빠졌을 때, 폭(액션 128 · 대상 64)을 넘을 때.
 */
export function defineAuditCatalog<
  const A extends Record<string, string> = Record<never, never>,
  const T extends Record<string, string> = Record<never, never>,
>(input: AuditCatalogInput<A, T> = {}): AuditCatalog<A, T> {
  type Action = CoreAuditAction | A[keyof A]
  type Target = CoreAuditTarget | T[keyof T]

  const actions = input.actions ?? ({} as A)
  const targets = input.targets ?? ({} as T)
  const problems: string[] = []

  for (const key of overlappingKeys(actions, CoreAuditActions))
    problems.push(`코어 액션 키와 겹친다: ${key}`)
  for (const key of overlappingKeys(targets, CoreAuditTargets))
    problems.push(`코어 대상 키와 겹친다: ${key}`)

  const AuditActions = Object.freeze({ ...CoreAuditActions, ...actions })
  const AuditTargets = Object.freeze({ ...CoreAuditTargets, ...targets })
  const ACTION_VALUES = Object.freeze(Object.values(AuditActions) as Action[])
  const TARGET_VALUES = Object.freeze(Object.values(AuditTargets) as Target[])

  for (const value of duplicatedValues(ACTION_VALUES)) problems.push(`액션 값이 겹친다: ${value}`)
  for (const value of duplicatedValues(TARGET_VALUES)) problems.push(`대상 값이 겹친다: ${value}`)
  for (const value of ACTION_VALUES) {
    if (value.length === 0 || value.length > AUDIT_ACTION_MAX_LENGTH) {
      problems.push(`액션은 1~${AUDIT_ACTION_MAX_LENGTH}자: ${value}`)
    }
  }
  for (const value of TARGET_VALUES) {
    if (value.length === 0 || value.length > AUDIT_TARGET_TYPE_MAX_LENGTH) {
      problems.push(`대상 종류는 1~${AUDIT_TARGET_TYPE_MAX_LENGTH}자: ${value}`)
    }
  }

  const labels: Readonly<Record<string, string>> = Object.freeze({
    ...CORE_AUDIT_ACTION_LABELS,
    ...(input.labels ?? {}),
  })
  const targetLabels: Readonly<Record<string, string>> = Object.freeze({
    ...CORE_AUDIT_TARGET_LABELS,
    ...(input.targetLabels ?? {}),
  })
  for (const value of ACTION_VALUES) {
    if (!lookup(labels, value)) problems.push(`라벨이 없는 액션: ${value}`)
  }
  for (const value of TARGET_VALUES) {
    if (!lookup(targetLabels, value)) problems.push(`라벨이 없는 대상: ${value}`)
  }

  if (problems.length > 0) throw new Error(`defineAuditCatalog: ${problems.join(' / ')}`)

  const actionSet: ReadonlySet<string> = new Set(ACTION_VALUES)
  const targetSet: ReadonlySet<string> = new Set(TARGET_VALUES)
  return {
    AuditActions,
    AuditTargets,
    ACTION_VALUES,
    TARGET_VALUES,
    isAuditAction: (value): value is Action => actionSet.has(value),
    isAuditTarget: (value): value is Target => targetSet.has(value),
    labelOf: (action) => lookup(labels, action) ?? action,
    targetLabelOf: (target) => lookup(targetLabels, target) ?? target,
  }
}

export const coreAuditCatalog: AuditCatalog = defineAuditCatalog()

const UNSIGNED_DIGITS = /^[0-9]{1,20}$/
const UNSIGNED_BIGINT_MAX = 18446744073709551615n

/**
 * 쿼리스트링의 bigint(2c 스펙 B13). admin-ui `serializeParams` 는 bigint 를 십진 문자열로 보낸다.
 * 🔴 `z.coerce.bigint()` 를 쓰지 않는다 — `BigInt('')` 는 `0n`, `BigInt(' 3 ')` 은 `3n` 이다(2c 스펙 §14 R1-5).
 */
export const queryBigIntSchema = z.union([
  z.bigint().min(0n).max(UNSIGNED_BIGINT_MAX),
  z
    .string()
    .regex(UNSIGNED_DIGITS)
    .transform((value) => BigInt(value))
    .pipe(z.bigint().max(UNSIGNED_BIGINT_MAX)),
])

export const adminAuditLogSchema = z.object({
  logNo: z.bigint(),
  /** 행위자. null = 계정을 특정할 수 없음(없는 아이디의 로그인 실패) */
  actorUserNo: z.bigint().nullable(),
  actorUserId: z.string().nullable(),
  actorUserName: z.string().nullable(),
  sessionNo: z.bigint().nullable(),
  /** 🔴 열린 문자열 — 카탈로그 밖의 옛 · 새 액션도 읽는다. 라벨은 `catalog.labelOf` */
  action: z.string(),
  targetType: z.string().nullable(),
  targetRefNo: z.bigint().nullable(),
  method: z.string(),
  path: z.string(),
  statusCode: z.number().int(),
  /** 실패면 응답 봉투의 code */
  errorCode: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** 소독 · bigint 접기를 거친 JSON — bigint 는 십진 문자열이다 */
  meta: z.unknown(),
  createAt: z.iso.datetime(),
})

export type AdminAuditLog = z.infer<typeof adminAuditLogSchema>

/** `GET /admin/audit-logs` — 기간은 `[from, to)` 반열림. `actionMatch` 기본 'prefix'(서버) */
export const adminAuditLogQuerySchema = createQuerySchema({
  sortableColumns: ['createAt'] as const,
  defaultSortColumn: 'createAt',
  filterShape: {
    actorUserNo: queryBigIntSchema,
    action: z.string().min(1).max(AUDIT_ACTION_MAX_LENGTH),
    actionMatch: z.enum(['prefix', 'exact']),
    targetType: z.string().min(1).max(AUDIT_TARGET_TYPE_MAX_LENGTH),
    targetRefNo: queryBigIntSchema,
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  },
})

export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>
````

`packages/admin-shared/src/index.ts` — `./sessions.js` export 블록 바로 아래에 더한다:

```ts
export {
  AUDIT_ACTION_MAX_LENGTH,
  AUDIT_TARGET_TYPE_MAX_LENGTH,
  CoreAuditActions,
  CoreAuditTargets,
  CORE_AUDIT_ACTION_LABELS,
  CORE_AUDIT_TARGET_LABELS,
  defineAuditCatalog,
  coreAuditCatalog,
  queryBigIntSchema,
  adminAuditLogSchema,
  adminAuditLogQuerySchema,
  type CoreAuditAction,
  type CoreAuditTarget,
  type AuditCatalog,
  type AuditCatalogInput,
  type AdminAuditLog,
  type AdminAuditLogQuery,
} from './audit.js'
```

- [ ] **Step 4: 통과를 확인하고 빌드한다**

Run: `pnpm --filter @ssworks/admin-shared exec vitest run src/audit.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-shared typecheck && pnpm --filter @ssworks/admin-shared lint && pnpm --filter @ssworks/admin-shared build`
Expected: 오류 없음, `packages/admin-shared/dist/audit.js` · `audit.d.ts` 가 생긴다. 🔴 이 빌드가 없으면 Task 6 부터 admin-server 가 새 export 를 못 본다.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts packages/admin-shared/src/index.ts
git commit -m "feat(admin-shared): 감사 카탈로그 · 감사 행 · 조회 스키마 · queryBigIntSchema" -m "코어 액션 14(hangang 이름 + session.revoke.others) · 대상 2 · 한국어 라벨, defineAuditCatalog 로 프로젝트 액션 병합. 쿼리스트링 bigint 는 숫자만 받는다(BigInt('') = 0n 함정 — 2c 스펙 B13)." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: LIKE 도우미

**Files:**

- Create: `packages/admin-server/src/database/like.ts`
- Create: `packages/admin-server/src/database/like.test.ts`
- Modify: `packages/admin-server/src/index.ts`

**Interfaces:**

- Produces: `LIKE_ESCAPE = '!'` · `escapeLike(term: string): string` · `likeContains(term: string): string` · `likePrefix(term: string): string` (index 에서 export)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/database/like.test.ts`:

```ts
import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  sql,
  type SqlBool,
} from 'kysely'
import { describe, expect, it } from 'vitest'
import type { AdminDatabase } from './types.js'
import { adminKyselyPlugins } from './kysely.js'
import { LIKE_ESCAPE, escapeLike, likeContains, likePrefix } from './like.js'

describe('escapeLike', () => {
  it('! · % · _ 앞에 ! 를 붙인다', () => {
    expect(escapeLike('a!b%c_d')).toBe('a!!b!%c!_d')
    expect(escapeLike('평범한 글')).toBe('평범한 글')
  })

  it('🔴 한 번에 바꾼다 — 이스케이프한 ! 를 다시 이스케이프하지 않는다', () => {
    expect(escapeLike('!%')).toBe('!!!%')
    expect(escapeLike(escapeLike('!'))).toBe('!!!!')
  })
})

describe('likeContains · likePrefix', () => {
  it('포함 · 접두 패턴', () => {
    expect(likeContains('50%')).toBe('%50!%%')
    expect(likePrefix('session.revoke')).toBe('session.revoke%')
    expect(likePrefix('a_b')).toBe('a!_b%')
  })

  it('빈 문자열은 전부다 — 부르는 쪽이 거른다', () => {
    expect(likeContains('')).toBe('%%')
  })

  it('이스케이프 문자는 ! 이고 SQL 에 정적 텍스트로 쓴다', () => {
    expect(LIKE_ESCAPE).toBe('!')
    const db = new Kysely<AdminDatabase>({
      dialect: {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new MysqlIntrospector(kysely),
        createQueryCompiler: () => new MysqlQueryCompiler(),
      },
      plugins: adminKyselyPlugins(),
    })
    const compiled = db
      .selectFrom('users')
      .select('userId')
      .where(sql<SqlBool>`${sql.ref('userId')} like ${likeContains('x')} escape '!'`)
      .compile()
    expect(compiled.sql).toBe("select `user_id` from `users` where `user_id` like ? escape '!'")
    expect(compiled.parameters).toEqual(['%x%'])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/database/like.test.ts`
Expected: FAIL — `Failed to resolve import "./like.js"`

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/database/like.ts`:

```ts
// 정본: ssworks-gise-home apps/api/src/core/database/like.ts(`likeContains` · `!`) + hangang-home
//       packages/shared/src/utils/escape-like.ts(`escapeLike` — 한 번에 바꾼다)
// 바꾼 점: 접두 도우미 `likePrefix` 를 더했다(hangang 감사 액션 필터가 손으로 `+ '%'` 했다).
//
// 쓰는 법: sql`${sql.ref('u.userId')} like ${likeContains(term)} escape '!'` — 빈 문자열은 부르는 쪽이 거른다('%%' 는 전부).
// 🔴 이스케이프 문자는 '!' 다 — MariaDB 기본 이스케이프(백슬래시)는 NO_BACKSLASH_ESCAPES 에서 뜻이 바뀐다.
// 🔴 `escape '!'` 는 SQL 정적 텍스트로 쓴다 — 문법 리터럴이라 바인딩할 수 없다.

export const LIKE_ESCAPE = '!'

const SPECIAL = /[!%_]/g

/** 🔴 한 번의 치환으로 셋을 다 바꾼다 — '!' 를 먼저, '%' 를 나중에 바꾸면 앞에서 넣은 '!' 를 다시 이스케이프한다. */
export function escapeLike(term: string): string {
  return term.replace(SPECIAL, (char) => `${LIKE_ESCAPE}${char}`)
}

/** `%…%` — 부분일치 */
export function likeContains(term: string): string {
  return `%${escapeLike(term)}%`
}

/** `…%` — 접두 일치(감사 액션 `session.revoke` → `.user` · `.self` · `.others` 도) */
export function likePrefix(term: string): string {
  return `${escapeLike(term)}%`
}
```

`packages/admin-server/src/index.ts` — `export { validationError } from './http/validation.js'` 다음 줄에 더한다:

```ts
export { LIKE_ESCAPE, escapeLike, likeContains, likePrefix } from './database/like.js'
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/database/like.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-server/src/database/like.ts packages/admin-server/src/database/like.test.ts packages/admin-server/src/index.ts
git commit -m "feat(admin-server): LIKE 도우미 escapeLike · likeContains · likePrefix" -m "이스케이프 문자 '!' 를 한 번에 붙이고 SQL 에는 escape '!' 를 정적으로 쓴다(gise · hangang)." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 권한 슬롯 — 코어 옵션 `permissions` · 가드 갈래 · 기동 검사

**Files:**

- Create: `packages/admin-server/src/auth/permission-slots.ts`
- Create: `packages/admin-server/src/auth/permission-slots.test.ts`
- Create: `packages/admin-server/src/auth/module-check.ts`
- Create: `packages/admin-server/src/auth/module-check.test.ts`
- Modify: `packages/admin-server/src/tokens.ts`
- Modify: `packages/admin-server/src/options.ts`
- Modify: `packages/admin-server/src/auth/options.ts`
- Modify: `packages/admin-server/src/auth/admin-auth.module.ts`
- Modify: `packages/admin-server/src/auth/permission.guard.ts`
- Modify: `packages/admin-server/src/auth/permission.guard.test.ts`
- Modify: `packages/admin-server/src/index.ts`

**Interfaces:**

- Consumes: admin-shared `hasPermission(granted, ...required)`, 2b `ResolvedAuthConfig` · `resolveAuthConfig`
- Produces:
  - `type AdminPermissionSlot = 'sessions.read' | 'sessions.manage' | 'auditLogs.read'` · `ADMIN_PERMISSION_SLOTS` · `type AdminPermissionMap = Partial<Record<AdminPermissionSlot, string>>`
  - `RequirePermissionSlot(slot): CustomDecorator<string>`(내부 — index 에 내지 않는다)
  - `resolvePermissionMap(permissions?): Readonly<AdminPermissionMap>` · `assertPermissionSlots(permissions, slots, moduleName): void`
  - `assertAuthModuleRegistered(modules: ModulesContainer, moduleName: string): void`
  - `PERMISSION_SLOT = 'admin-kit:permission-slot'`(tokens)
  - `AdminServerOptions.permissions?: AdminPermissionMap` · `ResolvedAuthConfig.permissions: Readonly<AdminPermissionMap>` · `resolveAuthConfig(auth, passwordPolicy, permissions?)`

- [ ] **Step 1: 슬롯 도우미 테스트를 쓴다**

`packages/admin-server/src/auth/permission-slots.test.ts`:

```ts
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { PERMISSION_SLOT } from '../tokens.js'
import {
  ADMIN_PERMISSION_SLOTS,
  RequirePermissionSlot,
  assertPermissionSlots,
  resolvePermissionMap,
} from './permission-slots.js'

class Routes {
  @RequirePermissionSlot('sessions.read')
  read() {}
}

describe('RequirePermissionSlot', () => {
  it('슬롯 이름을 메타데이터로 남긴다', () => {
    expect(Reflect.getMetadata(PERMISSION_SLOT, Routes.prototype.read)).toBe('sessions.read')
  })
})

describe('resolvePermissionMap', () => {
  it('아는 슬롯만 얼린 사본으로', () => {
    const resolved = resolvePermissionMap({ 'sessions.read': 'org.users:read' })
    expect(resolved).toEqual({ 'sessions.read': 'org.users:read' })
    expect(Object.isFrozen(resolved)).toBe(true)
    expect(resolvePermissionMap(undefined)).toEqual({})
  })

  it('🔴 모르는 슬롯(오타)은 기동에서 멈춘다', () => {
    expect(() =>
      resolvePermissionMap({ 'session.read': 'x' } as unknown as Record<string, string>),
    ).toThrow('모르는 권한 슬롯이 있다: session.read')
  })

  it('빈 키 · 공백 키 · 문자열 아닌 키는 멈춘다', () => {
    for (const key of ['', '   ', 1]) {
      expect(() =>
        resolvePermissionMap({ 'sessions.read': key } as unknown as Record<string, string>),
      ).toThrow("permissions['sessions.read']")
    }
  })

  it('2c 의 슬롯은 셋', () => {
    expect(ADMIN_PERMISSION_SLOTS).toEqual(['sessions.read', 'sessions.manage', 'auditLogs.read'])
  })
})

describe('assertPermissionSlots', () => {
  it('다 이어졌으면 통과', () => {
    expect(() =>
      assertPermissionSlots(
        { 'sessions.read': 'a', 'sessions.manage': 'b' },
        ['sessions.read', 'sessions.manage'],
        'AdminSessionsModule',
      ),
    ).not.toThrow()
  })

  it('🔴 빠진 슬롯을 모아 한 번에 — 배선 예시와 함께', () => {
    expect(() =>
      assertPermissionSlots({ 'sessions.read': '  ' }, ['sessions.read', 'sessions.manage'], 'M'),
    ).toThrow(
      "M 의 권한 슬롯이 이어지지 않았다: sessions.read, sessions.manage — AdminServerModule 옵션에 permissions: { 'sessions.read': '<프로젝트 권한 키>', 'sessions.manage': '<프로젝트 권한 키>' } 를 더한다.",
    )
    expect(() => assertPermissionSlots(undefined, ['auditLogs.read'], 'M')).toThrow(
      'auditLogs.read',
    )
  })
})
```

`packages/admin-server/src/auth/module-check.test.ts`:

```ts
import type { ModulesContainer } from '@nestjs/core'
import { describe, expect, it } from 'vitest'
import { AdminAuthModule } from './admin-auth.module.js'
import { assertAuthModuleRegistered } from './module-check.js'

function container(...metatypes: unknown[]): ModulesContainer {
  return new Map(
    metatypes.map((metatype, index) => [`m${index}`, { metatype }]),
  ) as unknown as ModulesContainer
}

describe('assertAuthModuleRegistered', () => {
  it('AdminAuthModule 이 있으면 통과', () => {
    expect(() =>
      assertAuthModuleRegistered(container(class Other {}, AdminAuthModule), 'AdminSessionsModule'),
    ).not.toThrow()
  })

  it('🔴 없으면 모듈 이름과 함께 멈춘다 — 가드 없이 라우트가 열린다', () => {
    expect(() =>
      assertAuthModuleRegistered(container(class Other {}), 'AdminSessionsModule'),
    ).toThrow('AdminSessionsModule 은 AdminAuthModule 이 있어야 한다')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/permission-slots.test.ts src/auth/module-check.test.ts`
Expected: FAIL — `./permission-slots.js` · `./module-check.js` 를 찾지 못한다.

- [ ] **Step 3: 토큰 · 슬롯 도우미 · 모듈 검사를 쓴다**

`packages/admin-server/src/tokens.ts` — `ALLOW_PASSWORD_CHANGE` 줄 다음에 더한다:

```ts
/** 내부 — 패키지 라우트의 권한 슬롯(2c 스펙 ① P1). 키는 `AdminServerOptions.permissions` 가 준다 */
export const PERMISSION_SLOT = 'admin-kit:permission-slot'
```

`packages/admin-server/src/auth/permission-slots.ts`:

```ts
import { SetMetadata, type CustomDecorator } from '@nestjs/common'
import { PERMISSION_SLOT } from '../tokens.js'

// 정본: 없음 — 패키지 라우트의 권한 키를 쓰는 쪽이 잇는 자리(2c 스펙 ① P1). 네 정본은 라우트에 자기 키를 박았다
//   (hangang org.users:read · gise account.session:manage · axion sessions:read · crm setting.session:read).
// 🔴 패키지는 권한 키를 하드코딩하지 않는다 — 슬롯 이름만 선언하고 키는 AdminServerOptions.permissions 가 준다.

/** 2c 의 셋. 2d~2f 가 늘린다 — 유니온이 늘어나는 것은 하위 호환이다 */
export type AdminPermissionSlot = 'sessions.read' | 'sessions.manage' | 'auditLogs.read'

export const ADMIN_PERMISSION_SLOTS: readonly AdminPermissionSlot[] = Object.freeze([
  'sessions.read',
  'sessions.manage',
  'auditLogs.read',
])

export type AdminPermissionMap = Partial<Record<AdminPermissionSlot, string>>

/**
 * 내부 — 패키지 라우트가 권한 슬롯을 선언한다. index 에 내지 않는다.
 * 🔴 권한 선언과 같은 층이라 `@SelfOnly` 보다 먼저 판정한다(2b 스펙 §14 R3).
 */
export function RequirePermissionSlot(slot: AdminPermissionSlot): CustomDecorator<string> {
  return SetMetadata(PERMISSION_SLOT, slot)
}

/** 코어 옵션의 `permissions` 를 해석한다. 🔴 모르는 슬롯(오타) · 빈 키는 기동에서 멈춘다 — 조용히 무시되면 403 만 남는다 */
export function resolvePermissionMap(
  permissions: AdminPermissionMap | undefined,
): Readonly<AdminPermissionMap> {
  const known: readonly string[] = ADMIN_PERMISSION_SLOTS
  const resolved: AdminPermissionMap = {}
  for (const [slot, key] of Object.entries(permissions ?? {})) {
    if (!known.includes(slot)) {
      throw new Error(
        `permissions 에 모르는 권한 슬롯이 있다: ${slot} — 쓸 수 있는 슬롯: ${ADMIN_PERMISSION_SLOTS.join(', ')}`,
      )
    }
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error(`permissions['${slot}'] 는 빈 문자열이 아닌 권한 키여야 한다.`)
    }
    resolved[slot as AdminPermissionSlot] = key
  }
  return Object.freeze(resolved)
}

/** 기동 검사 — 모듈이 쓰는 슬롯이 모두 이어졌는가. 빠진 것을 모아 한 번에 던진다(2c 스펙 §5-8) */
export function assertPermissionSlots(
  permissions: Readonly<AdminPermissionMap> | undefined,
  slots: readonly AdminPermissionSlot[],
  moduleName: string,
): void {
  const missing = slots.filter((slot) => {
    const key = permissions?.[slot]
    return typeof key !== 'string' || key.trim() === ''
  })
  if (missing.length === 0) return
  const example = missing.map((slot) => `'${slot}': '<프로젝트 권한 키>'`).join(', ')
  throw new Error(
    `${moduleName} 의 권한 슬롯이 이어지지 않았다: ${missing.join(', ')} — AdminServerModule 옵션에 permissions: { ${example} } 를 더한다.`,
  )
}
```

`packages/admin-server/src/auth/module-check.ts`:

```ts
import type { ModulesContainer } from '@nestjs/core'
import { AdminAuthModule } from './admin-auth.module.js'

// 정본: 없음 — 2b AdminAuthModule.onModuleInit 의 ModulesContainer 훑기(최종 리뷰 F3)와 같은 방식.
// 🔴 세션 · 감사 모듈은 인증 · 권한 가드(AdminAuthModule 의 APP_GUARD)에 기댄다 — 인증 모듈 없이 붙으면 라우트가 그대로
//    열린다. 그래서 import 유무를 기동에서 본다(2c 스펙 §5-8, §14 R1-3 실측).
// 🔴 이 파일은 permission-slots.ts 와 따로 둔다 — 권한 가드(admin-auth.module 이 import)가 슬롯 파일을 import 하므로,
//    여기서 AdminAuthModule 을 부르면 순환이 된다.

export function assertAuthModuleRegistered(modules: ModulesContainer, moduleName: string): void {
  const found = [...modules.values()].some((ref) => ref.metatype === AdminAuthModule)
  if (!found) {
    throw new Error(
      `${moduleName} 은 AdminAuthModule 이 있어야 한다 — 인증 · 권한 가드 없이 라우트가 열린다. AppModule 에 AdminAuthModule 을 import 한다.`,
    )
  }
}
```

- [ ] **Step 4: 코어 옵션 · 인증 설정 · 모듈이 슬롯 맵을 넘기게 한다**

`packages/admin-server/src/options.ts` — import 에 더하고 `AdminServerOptions` 에 필드를 더한다:

```ts
import type { AdminPermissionMap } from './auth/permission-slots.js'
```

```ts
  /**
   * 패키지 라우트의 권한 슬롯 → 프로젝트 권한 키(2c 스펙 ① P1). 예: `{ 'sessions.read': 'org.users:read' }`.
   * 🔴 import 한 기능 모듈의 슬롯이 없거나 모르는 슬롯이 있으면 기동에서 멈춘다.
   */
  permissions?: AdminPermissionMap
```

`packages/admin-server/src/auth/options.ts`:

- import 를 더한다: `import { resolvePermissionMap, type AdminPermissionMap } from './permission-slots.js'`
- `ResolvedAuthConfig` 의 `passwordPolicy: PasswordPolicy` 다음 줄에 `permissions: Readonly<AdminPermissionMap>` 를 더한다.
- `resolveAuthConfig` 시그니처와 주석 · 반환을 이렇게 바꾼다:

```ts
/**
 * 코어 옵션의 `auth` · `passwordPolicy` · `permissions` 를 해석한다. 🔴 메시지에는 옵션 이름만 담는다 — 비밀키 값을 싣지 않는다.
 */
export function resolveAuthConfig(
  auth: AdminAuthOptions | undefined,
  passwordPolicy: PasswordPolicy | undefined,
  permissions?: AdminPermissionMap,
): ResolvedAuthConfig {
```

반환 객체의 `passwordPolicy: passwordPolicy ?? definePasswordPolicy(),` 다음 줄에 `permissions: resolvePermissionMap(permissions),` 를 더한다.

`packages/admin-server/src/auth/admin-auth.module.ts` — `ADMIN_AUTH_CONFIG` 팩토리의 첫 줄을 바꾼다:

```ts
const config = resolveAuthConfig(options.auth, options.passwordPolicy, options.permissions)
```

- [ ] **Step 5: 가드 테스트에 슬롯 갈래를 더한다**

`packages/admin-server/src/auth/permission.guard.test.ts` — import 에 `import { RequirePermissionSlot } from './permission-slots.js'` 를 더하고, `const selfOnlyRoutes = new SelfOnlyRoutes()` 줄 아래에 클래스 · 도우미를, 파일 끝에 describe 를 더한다:

```ts
class SlotRoutes {
  @RequirePermissionSlot('sessions.read')
  read() {}

  @RequirePermissionSlot('auditLogs.read')
  unmapped() {}

  @RequirePermissionSlot('sessions.manage')
  @RequirePermissions('user:write')
  both() {}
}

@SelfOnly()
class SelfOnlySlotRoutes {
  @RequirePermissionSlot('sessions.read')
  read() {}
}

const slotRoutes = new SlotRoutes()
const selfOnlySlotRoutes = new SelfOnlySlotRoutes()

function slotGuard(): AdminPermissionGuard {
  return new AdminPermissionGuard(
    new Reflector(),
    resolveAuthConfig({ jwtSecret: 's'.repeat(32) }, undefined, {
      'sessions.read': 'org.users:read',
      'sessions.manage': 'org.users:write',
    }),
  )
}
```

```ts
describe('AdminPermissionGuard — 권한 슬롯(2c 스펙 ① P1)', () => {
  it('맵이 이은 키를 가진 주체는 통과, 없으면 403', () => {
    expect(
      slotGuard().canActivate(context(slotRoutes, 'read', principal(['org.users:read']))),
    ).toBe(true)
    const error = rejection(() =>
      slotGuard().canActivate(context(slotRoutes, 'read', principal(['user:read']))),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(AUTH_MESSAGES.forbidden)
  })

  it("'*' 는 이어진 슬롯을 통과한다", () => {
    expect(slotGuard().canActivate(context(slotRoutes, 'read', principal(['*'])))).toBe(true)
  })

  it("🔴 이어지지 않은 슬롯은 '*' 도 403 — 기동 검사를 피한 조합의 방어선", () => {
    const error = rejection(() =>
      slotGuard().canActivate(context(slotRoutes, 'unmapped', principal(['*']))),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })

  it('🔴 슬롯은 클래스 @SelfOnly 보다 먼저다', () => {
    const error = rejection(() =>
      slotGuard().canActivate(context(selfOnlySlotRoutes, 'read', principal([]))),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })

  it('슬롯과 @RequirePermissions 는 AND', () => {
    expect(() =>
      slotGuard().canActivate(context(slotRoutes, 'both', principal(['org.users:write']))),
    ).toThrow(BusinessError)
    expect(
      slotGuard().canActivate(
        context(slotRoutes, 'both', principal(['org.users:write', 'user:write'])),
      ),
    ).toBe(true)
  })

  it('셋째 인자가 없으면 슬롯 맵은 비어 있다(2b 호출부 그대로)', () => {
    expect(resolveAuthConfig({ jwtSecret: 's'.repeat(32) }, undefined).permissions).toEqual({})
  })
})
```

- [ ] **Step 6: 새 가드 테스트의 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth/permission.guard.test.ts`
Expected: FAIL — 슬롯 라우트가 fail-closed 403(`noPermissionDeclared`) 이거나 통과해야 할 요청이 403 이다(가드가 슬롯을 모른다).

- [ ] **Step 7: 가드에 슬롯 갈래를 더한다**

`packages/admin-server/src/auth/permission.guard.ts`:

- tokens import 에 `PERMISSION_SLOT` 을 더하고, `import type { AdminPermissionSlot } from './permission-slots.js'` 를 더한다.
- 머리 주석 `// 바꾼 점:` 목록 끝에 한 줄을 더한다:

```ts
//  - 패키지 라우트의 권한 슬롯(2c 스펙 ① P1)은 권한 선언과 같은 층이다 — 슬롯 · @RequirePermissions 가 함께면 AND.
```

- `const required = …` 줄 바로 위에 슬롯을 읽고, `if (hasRequired || hasAnyOf) {` 블록을 이렇게 바꾼다:

```ts
const slot = this.reflector.getAllAndOverride<AdminPermissionSlot | undefined>(
  PERMISSION_SLOT,
  targets,
)
```

```ts
if (slot != null || hasRequired || hasAnyOf) {
  if (slot != null) {
    // 🔴 이어지지 않은 슬롯은 '*' 도 막는다 — 기동 검사(assertPermissionSlots)를 피한 조합의 방어선이다(2c 스펙 §4-1).
    const key = this.config.permissions[slot]
    if (key == null || !hasPermission(principal.permissions, key)) throw forbidden()
  }
  if (hasRequired && !hasPermission(principal.permissions, ...required)) throw forbidden()
  if (hasAnyOf && !hasAnyPermission(principal.permissions, ...anyOf)) throw forbidden()
  return true
}
```

`packages/admin-server/src/index.ts` — 인증 블록의 `export type { AdminAuthOptions, AdminAuthCookieOptions } …` 다음 줄에 더한다:

```ts
export type { AdminPermissionSlot, AdminPermissionMap } from './auth/permission-slots.js'
```

- [ ] **Step 8: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/auth`
Expected: PASS — 새 테스트 셋 파일과 기존 인증 단위 · DB 없는 HTTP 테스트 전부(`*.db.test.ts` 는 이 설정에서 돌지 않는다).

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint`
Expected: 오류 없음.

- [ ] **Step 9: 커밋**

```bash
git add packages/admin-server/src/tokens.ts packages/admin-server/src/options.ts packages/admin-server/src/index.ts packages/admin-server/src/auth/permission-slots.ts packages/admin-server/src/auth/permission-slots.test.ts packages/admin-server/src/auth/module-check.ts packages/admin-server/src/auth/module-check.test.ts packages/admin-server/src/auth/options.ts packages/admin-server/src/auth/admin-auth.module.ts packages/admin-server/src/auth/permission.guard.ts packages/admin-server/src/auth/permission.guard.test.ts
git commit -m "feat(admin-server): 권한 슬롯 — 코어 옵션 permissions 맵 · 가드 갈래 · 기동 검사" -m "패키지 라우트는 슬롯(sessions.read · sessions.manage · auditLogs.read)을 선언하고 쓰는 쪽이 키를 잇는다(2c 스펙 ① P1). 슬롯은 @SelfOnly 보다 먼저, 이어지지 않은 슬롯은 '*' 도 403. 모르는 슬롯 · 빈 키 · 빠진 슬롯은 기동에서 멈춘다." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 감사 장 `0008_audit_logs` · 테이블 타입

**Files:**

- Create: `packages/admin-server/src/database/migrations/0008_audit_logs.ts`
- Create: `packages/admin-server/src/database/tables/audit-logs.ts`
- Modify: `packages/admin-server/src/database/migrations/index.ts`
- Modify: `packages/admin-server/src/database/types.ts`
- Modify: `packages/admin-server/src/database/migrations/ddl.test.ts`
- Modify: `packages/admin-server/src/database/migrations/index.test.ts`
- Modify: `packages/admin-server/src/database/migrations/migrations.db.test.ts`

**Interfaces:**

- Produces:
  - 장 ID `'0008_audit_logs'`(`ADMIN_MIGRATIONS` 끝) — 스텁 `export { up, down } from '@ssworks/admin-server/migrations/0008_audit_logs'`
  - `AdminAuditLogsTable`, `AdminDatabase.auditLogs`

- [ ] **Step 1: 장 목록 · DDL · 실 DB 테스트를 먼저 고친다**

`packages/admin-server/src/database/migrations/index.test.ts` — 첫 테스트를 이렇게 바꾼다:

```ts
it('0001~0008 순서', () => {
  expect(ADMIN_MIGRATIONS).toEqual([
    '0001_roles',
    '0002_users',
    '0003_teams',
    '0004_team_closure',
    '0005_team_user_map',
    '0006_user_employment_periods',
    '0007_sessions',
    '0008_audit_logs',
  ])
})
```

`packages/admin-server/src/database/migrations/ddl.test.ts` — import 에 `import * as auditLogs from './0008_audit_logs.js'` 를, `CHAPTERS` 끝에 `['0008_audit_logs', auditLogs],` 를 더하고, `describe('0002_users', …)` 다음에 더한다:

```ts
describe('0008_audit_logs', () => {
  it('🔴 users · sessions FK 가 없다 — 계정 삭제가 감사 흔적을 지우지 않게', async () => {
    const statements = await capture((db) => auditLogs.up(db))
    expect(statements.join(' ').toLowerCase()).not.toContain('foreign key')
  })

  it('status_code 는 smallint unsigned, meta 는 json + utf8mb4_bin', async () => {
    const [statement] = await capture((db) => auditLogs.up(db))
    expect(statement).toContain('`status_code` smallint unsigned not null')
    expect(statement).toContain('`meta` json collate utf8mb4_bin')
  })
})
```

`packages/admin-server/src/database/migrations/migrations.db.test.ts`:

- `CORE_TABLES` 맨 앞에 `'audit_logs',` 를 더한다(이름순).
- `'collation · NULL · ON UPDATE · 타입을 스키마에서 잰다'` 테스트의 마지막 `expect` 다음에 더한다:

```ts
// 감사 장(2c 스펙 §4-8) — 행위자 · 세션 · IP 는 NULL 허용(⑥ TB2)
expect(column('audit_logs', 'action').collationName).toBe('utf8mb4_unicode_ci')
expect(column('audit_logs', 'error_code').collationName).toBe('ascii_bin')
expect(column('audit_logs', 'actor_user_no').isNullable).toBe('YES')
expect(column('audit_logs', 'session_no').isNullable).toBe('YES')
expect(column('audit_logs', 'ip').isNullable).toBe('YES')
expect(column('audit_logs', 'method').isNullable).toBe('NO')
expect(column('audit_logs', 'status_code').columnType).toBe('smallint(5) unsigned')
expect(column('audit_logs', 'user_agent').columnType).toBe('varchar(255)')
```

- `'인덱스'` 테스트의 기대 목록 끝에 `'idx_audit_logs_actor', 'idx_audit_logs_target', 'idx_audit_logs_action',` 를 더한다.
- 제약 이름 테스트는 고치지 않는다 — 목록이 그대로라는 것이 FK 가 없다는 증거다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/database/migrations`
Expected: FAIL — `./0008_audit_logs.js` 를 찾지 못한다.

- [ ] **Step 3: 장 · 테이블 타입을 쓰고 목록에 더한다**

`packages/admin-server/src/database/migrations/0008_audit_logs.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, JSON_BIN, TABLE_OPTIONS, UTF8_CI, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/009_audit_logs.migration.ts + ssworks-gise-home 017_audit_logs
//       (sessionNo)
// 바꾼 점:
//  - 행위자 컬럼은 `actorUserNo`(gise) — hangang `principalRefNo` 는 crm API 키 주체에서 온 이름이다(2c 스펙 B5).
//  - 행위자 · IP 는 NULL 을 허용한다 — 계정을 특정할 수 없는 로그인 실패는 0 대신 NULL(2c 스펙 ⑥ TB2).
//  - `errorCode`(실패면 응답 봉투의 code) · `sessionNo`(행위자의 세션)를 더했다(⑥ TB2).
// 🔴 users · sessions FK 를 두지 않는다 — 계정 삭제(CASCADE)가 감사 흔적을 지우면 안 된다(hangang).
// 🔴 파티셔닝 · 복합 PK 를 쓰지 않는다 — crm 의 RANGE 파티션은 운영 cron 이 없어 p_future 에 쌓였다(hangang 이 걷어냈다).
//    보존 · 청소는 쓰는 쪽(B) 몫이다.
// 🔴 폭은 audit/entry.ts 의 AUDIT_COLUMN_WIDTHS 와 같다 — 넘는 값은 STRICT 모드에서 INSERT 를 죽여 행이 빠진다(hangang C1).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('auditLogs')
    .addColumn('logNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('actorUserNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('행위자 userNo. NULL = 계정을 특정할 수 없음')),
    )
    .addColumn('sessionNo', 'bigint', (col) => col.unsigned().modifyEnd(comment('행위자의 세션')))
    .addColumn('action', 'varchar(128)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('감사 카탈로그 액션')),
    )
    .addColumn('targetType', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).modifyEnd(comment('대상 종류')),
    )
    .addColumn('targetRefNo', 'bigint', (col) => col.unsigned().modifyEnd(comment('대상 번호')))
    .addColumn('method', 'varchar(8)', (col) => col.notNull())
    .addColumn('path', 'varchar(255)', (col) =>
      col.notNull().modifyEnd(comment('쿼리를 뗀 요청 경로')),
    )
    .addColumn('statusCode', 'smallint', (col) => col.unsigned().notNull())
    .addColumn('errorCode', 'varchar(64)', (col) =>
      col.modifyFront(ASCII_BIN).modifyEnd(comment('실패면 응답 봉투의 code')),
    )
    .addColumn('ip', 'varchar(45)', (col) =>
      col.modifyEnd(comment('요청 IP. IPv4-mapped IPv6 최대 45자')),
    )
    .addColumn('userAgent', 'varchar(255)')
    .addColumn('meta', 'json', (col) =>
      col.modifyFront(JSON_BIN).modifyEnd(comment('소독 · bigint 접기를 거친 JSON')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxAuditLogsActor')
    .on('auditLogs')
    .columns(['actorUserNo', 'createAt'])
    .execute()
  await db.schema
    .createIndex('idxAuditLogsTarget')
    .on('auditLogs')
    .columns(['targetType', 'targetRefNo', 'createAt'])
    .execute()
  await db.schema
    .createIndex('idxAuditLogsAction')
    .on('auditLogs')
    .columns(['action', 'createAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('auditLogs').execute()
}
```

`packages/admin-server/src/database/tables/audit-logs.ts`:

```ts
import type { ColumnType } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/audit-logs.table.ts
// 바꾼 점: 2c 스펙 §4-8 의 컬럼(actorUserNo · sessionNo · errorCode, NULL 허용). 🔴 append-only — 갱신 타입을 never 로 막는다
//   (gise audit-log-append-only 테스트의 뜻을 타입으로).

/** 넣을 수 있고 고칠 수 없다 */
type AppendOnly<T> = ColumnType<T, T, never>

export interface AdminAuditLogsTable {
  logNo: ColumnType<bigint, never, never>
  actorUserNo: AppendOnly<bigint | null>
  sessionNo: AppendOnly<bigint | null>
  action: AppendOnly<string>
  targetType: AppendOnly<string | null>
  targetRefNo: AppendOnly<bigint | null>
  method: AppendOnly<string>
  path: AppendOnly<string>
  statusCode: AppendOnly<number>
  errorCode: AppendOnly<string | null>
  ip: AppendOnly<string | null>
  userAgent: AppendOnly<string | null>
  /** 쓰기는 JSON 문자열, 읽기는 드라이버가 파싱한 값 — `readJsonColumn` 을 거친다(2c 스펙 §14 R1-4) */
  meta: ColumnType<unknown, string | null, never>
  createAt: ColumnType<Date, never, never>
}
```

`packages/admin-server/src/database/types.ts` — import 에 `import type { AdminAuditLogsTable } from './tables/audit-logs.js'` 를, `AdminDatabase` 끝에 `auditLogs: AdminAuditLogsTable` 를, 타입 재export 목록에 `AdminAuditLogsTable,` 를 더한다. 머리 주석의 "코어 7키만" 을 "코어 8키만" 으로 고친다.

`packages/admin-server/src/database/migrations/index.ts`:

- import 에 `import * as auditLogs from './0008_audit_logs.js'` 를 더한다.
- `ADMIN_MIGRATIONS` 끝에 `'0008_audit_logs',` 를, `CHAPTERS` 끝에 `'0008_audit_logs': auditLogs,` 를 더한다.

- [ ] **Step 4: 단위 테스트 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/database`
Expected: PASS — `ddl.test.ts`(0008 포함 snake_case · camelCase 없음 · InnoDB · FK 없음) · `index.test.ts`.

- [ ] **Step 5: 실 DB 테스트 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/database`
Expected: PASS — up → down → up 이 8장, 감사 컬럼 · 인덱스. 다른 DB 테스트도 새 장을 지난다(테스트 DB 는 늘 전부 올린다).

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-server/src/database
git commit -m "feat(admin-server): 감사 장 0008_audit_logs · AdminAuditLogsTable" -m "hangang 009 + errorCode · sessionNo, 행위자 · IP 는 NULL 허용, FK · 파티셔닝 없음(2c 스펙 §4-8). 모든 장 필수(⑨ M1) — 쓰는 쪽은 스텁 한 줄을 더한다." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 감사 순수 함수 — `@Audit` · 감사 가방 · 소독 · 행 만들기

**Files:**

- Create: `packages/admin-server/src/audit/audit.decorator.ts`
- Create: `packages/admin-server/src/audit/audit-bag.ts`
- Create: `packages/admin-server/src/audit/audit-bag.test.ts`
- Create: `packages/admin-server/src/audit/scrub.ts`
- Create: `packages/admin-server/src/audit/scrub.test.ts`
- Create: `packages/admin-server/src/audit/entry.ts`
- Create: `packages/admin-server/src/audit/entry.test.ts`
- Modify: `packages/admin-server/src/tokens.ts`
- Modify: `packages/admin-server/src/index.ts`

**Interfaces:**

- Consumes: `AdminPrincipal`(`../auth/principal.js`) · `requestMetaOf`(`../auth/request-meta.js`)
- Produces:
  - `AUDIT_META = 'admin-kit:audit'`(tokens)
  - `interface AuditOptions { action: string; targetType?: string; paramKey?: string }` · `Audit(options): CustomDecorator<string>`
  - `interface AuditBag { targetRefNo?: bigint; meta: Record<string, unknown> }` · `readAuditBag(req): AuditBag | undefined` · `attachAuditTarget(req, targetRefNo: bigint)` · `attachAuditMeta(req, patch)` · `attachAuditDiff(req, before, after, fields)`
  - `DEFAULT_SECRET_KEYS` · `SECRET_MASK = '***'` · `META_MAX_BYTES = 65536` · `secretKeySet(extra?): ReadonlySet<string>` · `scrubSecrets(value, keys)` · `foldBigInts(value)` · `serializeAuditMeta(meta, keys): string | null`
  - `AUDIT_COLUMN_WIDTHS = { method: 8, path: 255, ip: 45, userAgent: 255, errorCode: 64 }` · `clampCodePoints(value, max)` · `clampErrorCode(code)` · `interface AuditRequestFields { method; path; ip; userAgent }` · `requestFieldsOf(req): AuditRequestFields` · `pickTargetRefNo(req, paramKey, attached): bigint | null`
  - `interface AuditOutcome { status: number; errorCode: string | null }` · `interface AuditInsert`(감사 행 한 줄 — `AdminAuditLogsTable` 의 넣는 모양과 같다) · `buildAuditEntry(req, principal, options, outcome, secretKeys): AuditInsert`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/audit/scrub.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  META_MAX_BYTES,
  foldBigInts,
  scrubSecrets,
  secretKeySet,
  serializeAuditMeta,
} from './scrub.js'

const keys = secretKeySet()

describe('scrubSecrets', () => {
  it('🔴 비밀 키는 대소문자 무시로 값만 가린다 — 배열 · 중첩까지(hangang I5)', () => {
    expect(
      scrubSecrets(
        {
          Password: 'p',
          TOKEN: 't',
          nested: { secret: 's', keep: 1 },
          list: [{ newPassword: 'n' }, 'plain'],
          currentPassword: { deep: 'whole' },
        },
        keys,
      ),
    ).toEqual({
      Password: '***',
      TOKEN: '***',
      nested: { secret: '***', keep: 1 },
      list: [{ newPassword: '***' }, 'plain'],
      currentPassword: '***',
    })
  })

  it('쓰는 쪽 키를 더한다', () => {
    expect(scrubSecrets({ apiKey: 'k', name: 'n' }, secretKeySet(['ApiKey']))).toEqual({
      apiKey: '***',
      name: 'n',
    })
  })

  it('Date 는 건드리지 않는다', () => {
    const at = new Date('2026-10-14T00:00:00.000Z')
    expect((scrubSecrets({ at }, keys) as { at: Date }).at).toBe(at)
  })

  it('🔴 순환은 [Circular] — 형제가 같은 객체를 가리키는 것은 순환이 아니다', () => {
    const loop: Record<string, unknown> = { name: 'a' }
    loop.self = loop
    expect(scrubSecrets(loop, keys)).toEqual({ name: 'a', self: '[Circular]' })
    const shared = { x: 1 }
    expect(scrubSecrets({ a: shared, b: shared }, keys)).toEqual({ a: { x: 1 }, b: { x: 1 } })
  })

  it('🔴 깊이 20 에서 [Depth]', () => {
    let deep: Record<string, unknown> = { leaf: true }
    for (let i = 0; i < 25; i += 1) deep = { n: deep }
    let cursor = scrubSecrets(deep, keys) as Record<string, unknown>
    for (let i = 0; i < 19; i += 1) cursor = cursor.n as Record<string, unknown>
    expect(cursor.n).toBe('[Depth]')
  })
})

describe('foldBigInts', () => {
  it('bigint → 십진 문자열, Date → ISO, 잘못된 Date → null', () => {
    expect(
      foldBigInts({
        a: 1n,
        at: new Date('2026-10-14T00:00:00.000Z'),
        list: [2n, { b: 3n }],
        bad: new Date(Number.NaN),
      }),
    ).toEqual({ a: '1', at: '2026-10-14T00:00:00.000Z', list: ['2', { b: '3' }], bad: null })
  })
})

describe('serializeAuditMeta', () => {
  it('비면 null, 아니면 소독 · 접기 뒤 표준 JSON', () => {
    expect(serializeAuditMeta({}, keys)).toBeNull()
    expect(serializeAuditMeta({ revokedCount: 2, userNo: 5n, password: 'p' }, keys)).toBe(
      '{"revokedCount":2,"userNo":"5","password":"***"}',
    )
  })

  it('🔴 UTF-8 64 KiB 를 넘으면 자리표시 — 글자 수가 아니라 바이트로 잰다', () => {
    const text = serializeAuditMeta({ body: '가'.repeat(30_000) }, keys)
    const bytes = Buffer.byteLength(JSON.stringify({ body: '가'.repeat(30_000) }), 'utf8')
    expect(bytes).toBeGreaterThan(META_MAX_BYTES)
    expect(text).toBe(`{"_truncated":true,"bytes":${bytes}}`)
  })

  it('직렬화가 던지면 자리표시 — 행을 잃지 않는다', () => {
    const exploding = new (class {
      toJSON(): never {
        throw new Error('boom')
      }
    })()
    expect(serializeAuditMeta({ exploding }, keys)).toBe('{"_unserializable":true}')
  })
})
```

`packages/admin-server/src/audit/audit-bag.test.ts`:

```ts
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { attachAuditDiff, attachAuditMeta, attachAuditTarget, readAuditBag } from './audit-bag.js'

const request = () => ({ params: {} }) as unknown as Request

describe('감사 가방', () => {
  it('붙인 것이 없으면 없다', () => {
    expect(readAuditBag(request())).toBeUndefined()
  })

  it('대상 · meta(얕은 병합, 뒤가 이긴다)', () => {
    const req = request()
    attachAuditTarget(req, 7n)
    attachAuditMeta(req, { a: 1, b: 1 })
    attachAuditMeta(req, { b: 2 })
    expect(readAuditBag(req)).toEqual({ targetRefNo: 7n, meta: { a: 1, b: 2 } })
  })

  it('diff 는 fields 에 적힌 자기 키만 — 상속 키 · 없는 키는 빼고, null 은 빈 객체', () => {
    const req = request()
    const before = Object.assign(Object.create({ inherited: 'x' }) as object, {
      roleName: '옛',
      extra: 1,
    })
    attachAuditDiff(req, before, null, ['roleName', 'inherited', 'missing'])
    expect(readAuditBag(req)?.meta).toEqual({ before: { roleName: '옛' }, after: {} })
  })

  it('가방은 요청의 열거 키를 늘리지 않는다(심볼 자리)', () => {
    const req = request()
    const keysBefore = Object.keys(req)
    attachAuditMeta(req, { a: 1 })
    expect(Object.keys(req)).toEqual(keysBefore)
  })
})
```

`packages/admin-server/src/audit/entry.test.ts`:

```ts
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import type { AdminPrincipal } from '../auth/principal.js'
import { attachAuditMeta, attachAuditTarget } from './audit-bag.js'
import {
  AUDIT_COLUMN_WIDTHS,
  buildAuditEntry,
  clampCodePoints,
  pickTargetRefNo,
  requestFieldsOf,
} from './entry.js'
import { secretKeySet } from './scrub.js'

function fakeRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    method: 'DELETE',
    originalUrl: '/api/admin/sessions/12?keyword=secret',
    params: { sessionNo: '12' },
    ip: '10.0.0.1',
    headers: { 'user-agent': 'UA/1' },
    ...overrides,
  } as unknown as Request
}

const principal: AdminPrincipal = {
  userNo: 3n,
  sessionNo: 9n,
  userId: 'admin',
  userName: '관리자',
  roleNo: 1n,
  roleName: '역할',
  teamNo: null,
  teamName: null,
  permissions: ['*'],
  isPasswordChangeRequired: false,
}

describe('clampCodePoints', () => {
  it('🔴 이모지를 코드 포인트로 자른다 — 서로게이트 반쪽이 남지 않는다', () => {
    const clamped = clampCodePoints('😀'.repeat(300), 255)
    expect([...clamped]).toHaveLength(255)
    expect(clamped).toHaveLength(510)
    expect(clampCodePoints('짧다', 255)).toBe('짧다')
  })
})

describe('requestFieldsOf', () => {
  it('쿼리를 뗀 경로 · 메서드 · IP · UA', () => {
    expect(requestFieldsOf(fakeRequest())).toEqual({
      method: 'DELETE',
      path: '/api/admin/sessions/12',
      ip: '10.0.0.1',
      userAgent: 'UA/1',
    })
  })

  it('🔴 폭을 넘는 이모지 UA · 경로를 컬럼 폭으로 자른다(Review Focus 1)', () => {
    const fields = requestFieldsOf(
      fakeRequest({
        originalUrl: `/a/${'😀'.repeat(300)}`,
        headers: { 'user-agent': '😀'.repeat(400) },
        method: 'VERYLONGMETHOD',
      }),
    )
    expect([...fields.path]).toHaveLength(AUDIT_COLUMN_WIDTHS.path)
    expect([...(fields.userAgent ?? '')]).toHaveLength(AUDIT_COLUMN_WIDTHS.userAgent)
    expect(fields.method).toBe('VERYLONG')
  })

  it('IP · UA 가 없으면 null', () => {
    expect(requestFieldsOf(fakeRequest({ ip: undefined, headers: {} }))).toMatchObject({
      ip: null,
      userAgent: null,
    })
  })
})

describe('pickTargetRefNo(2c 스펙 B6)', () => {
  it('🔴 핸들러가 붙인 값이 먼저다', () => {
    expect(pickTargetRefNo(fakeRequest(), undefined, 5n)).toBe(5n)
  })

  it('paramKey 가 가리키는 경로 변수 — 읽히지 않으면 다음 갈래', () => {
    const req = fakeRequest({ params: { userNo: '4', sessionNo: '12' } })
    expect(pickTargetRefNo(req, 'userNo', undefined)).toBe(4n)
    expect(
      pickTargetRefNo(fakeRequest({ params: { userNo: 'x', n: '8' } }), 'userNo', undefined),
    ).toBe(8n)
  })

  it('숫자 경로 변수가 정확히 하나일 때만 — 둘이면 고르지 않는다', () => {
    expect(pickTargetRefNo(fakeRequest(), undefined, undefined)).toBe(12n)
    expect(
      pickTargetRefNo(fakeRequest({ params: { a: '1', b: '2' } }), undefined, undefined),
    ).toBeNull()
    expect(pickTargetRefNo(fakeRequest({ params: {} }), undefined, undefined)).toBeNull()
  })

  it('BIGINT UNSIGNED 범위 밖 · 부호 · 공백은 읽지 않는다', () => {
    for (const value of ['18446744073709551616', '-1', ' 1']) {
      expect(
        pickTargetRefNo(fakeRequest({ params: { n: value } }), undefined, undefined),
      ).toBeNull()
    }
  })
})

describe('buildAuditEntry', () => {
  it('주체 · 메타 · 결과 · 가방을 한 행으로', () => {
    const req = fakeRequest()
    attachAuditMeta(req, { revokedCount: 1, token: 't' })
    expect(
      buildAuditEntry(
        req,
        principal,
        { action: 'session.revoke', targetType: 'session' },
        { status: 200, errorCode: null },
        secretKeySet(),
      ),
    ).toEqual({
      actorUserNo: 3n,
      sessionNo: 9n,
      action: 'session.revoke',
      targetType: 'session',
      targetRefNo: 12n,
      method: 'DELETE',
      path: '/api/admin/sessions/12',
      statusCode: 200,
      errorCode: null,
      ip: '10.0.0.1',
      userAgent: 'UA/1',
      meta: '{"revokedCount":1,"token":"***"}',
    })
  })

  it('가방이 없으면 meta null, 대상 종류가 없으면 null, 붙인 대상이 이긴다', () => {
    const req = fakeRequest()
    attachAuditTarget(req, 99n)
    const entry = buildAuditEntry(
      req,
      principal,
      { action: 'x' },
      { status: 409, errorCode: 'ERR_COMMON_CONFLICT' },
      secretKeySet(),
    )
    expect(entry).toMatchObject({ targetType: null, targetRefNo: 99n, meta: null, statusCode: 409 })
    expect(
      buildAuditEntry(
        fakeRequest(),
        principal,
        { action: 'x' },
        { status: 200, errorCode: null },
        secretKeySet(),
      ).meta,
    ).toBeNull()
  })

  it('쓰는 쪽의 긴 오류 코드는 64 로 자른다', () => {
    const entry = buildAuditEntry(
      fakeRequest(),
      principal,
      { action: 'x' },
      { status: 400, errorCode: `ERR_${'X'.repeat(100)}` },
      secretKeySet(),
    )
    expect(entry.errorCode).toHaveLength(AUDIT_COLUMN_WIDTHS.errorCode)
  })
})
```

`attachAuditTarget` 만 붙인 가방은 `meta` 가 비어 있어 `serializeAuditMeta` 가 null 을 낸다 — 위 둘째 테스트가 그것을 잰다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/audit`
Expected: FAIL — `./scrub.js` · `./audit-bag.js` · `./entry.js` 를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/tokens.ts` — `PERMISSION_SLOT` 다음에 더한다:

```ts
/** `@Audit()` 이 남기는 메타데이터 키(2c) */
export const AUDIT_META = 'admin-kit:audit'
```

`packages/admin-server/src/audit/audit.decorator.ts`:

```ts
import { SetMetadata, type CustomDecorator } from '@nestjs/common'
import { AUDIT_META } from '../tokens.js'

// 정본: hangang-home apps/api/src/core/decorators/audit.decorator.ts + kim5257-crm-v5
//       packages/backend-core/src/core/decorators/audit.decorator.ts(`paramKey`)
// 바꾼 점: 메타 키에 admin-kit: 접두. 액션 · 대상 종류는 카탈로그(admin-shared defineAuditCatalog)에 있어야 한다 —
//   AdminAuditModule 이 기동에서 훑는다(2c 스펙 §5-8). 프로젝트 액션 유니온으로 좁히려면 쓰는 쪽이 감싼다.

export interface AuditOptions {
  action: string
  targetType?: string
  /** 대상 id 로 읽을 경로 변수 이름(crm). 없으면 숫자 경로 변수가 정확히 하나일 때 그것 */
  paramKey?: string
}

/**
 * 이 라우트를 감사 로그에 남긴다 — 성공 · 실패 모두(실패는 핸들러에서 던진 것만, 2c 스펙 ⑧ F1).
 * 🔴 `@Public()` 라우트에는 붙이지 않는다 — 주체가 없어 기록되지 않는다. 붙이면 기동에서 멈춘다(B11).
 */
export function Audit(options: AuditOptions): CustomDecorator<string> {
  return SetMetadata(AUDIT_META, Object.freeze({ ...options }))
}
```

`packages/admin-server/src/audit/audit-bag.ts`:

```ts
import type { Request } from 'express'

// 정본: hangang-home apps/api/src/core/audit/audit.service.ts `attachDiff` · `attachMeta` · `attachTarget`
// 바꾼 점: 서비스 메서드가 아니라 함수다(2c 스펙 B2) — hangang 메서드도 DI 상태를 쓰지 않았다. 가방에는 원본만 쌓고, 소독은
//   인터셉터가 쓸 때 한 번에 한다(`serializeAuditMeta`) — attachAuditMeta 경로도 저절로 소독된다(hangang 은 소독하지 않았다).
//   Express Request 를 증강하지 않는다 — 비공개 심볼 자리(2b 주체와 같은 방식).

const AUDIT_BAG = Symbol('admin-kit:audit-bag')

export interface AuditBag {
  targetRefNo?: bigint
  meta: Record<string, unknown>
}

type WithBag = Request & { [AUDIT_BAG]?: AuditBag }

function bagOf(req: Request): AuditBag {
  const holder = req as WithBag
  holder[AUDIT_BAG] ??= { meta: {} }
  return holder[AUDIT_BAG]
}

export function readAuditBag(req: Request): AuditBag | undefined {
  return (req as WithBag)[AUDIT_BAG]
}

/** 경로 변수로 대상을 알 수 없을 때(생성 · "다른 세션 모두") 핸들러가 붙인다. 🔴 자동 추출보다 먼저다(B6) */
export function attachAuditTarget(req: Request, targetRefNo: bigint): void {
  bagOf(req).targetRefNo = targetRefNo
}

/** meta 에 얕게 병합한다. 비밀 키 값은 기록할 때 가린다 */
export function attachAuditMeta(req: Request, patch: Record<string, unknown>): void {
  Object.assign(bagOf(req).meta, patch)
}

/**
 * 변경 전 · 후에서 `fields` 에 적힌 자기 키만 골라 meta 의 before · after 로 둔다.
 * 🔴 본문 같은 큰 필드를 fields 에 넣지 않는다 — meta 64 KiB 상한(B8)에 걸려 자리표시만 남는다.
 */
export function attachAuditDiff(
  req: Request,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): void {
  const pick = (source: Record<string, unknown> | null | undefined): Record<string, unknown> => {
    const picked: Record<string, unknown> = {}
    if (source == null) return picked
    for (const field of fields) if (Object.hasOwn(source, field)) picked[field] = source[field]
    return picked
  }
  Object.assign(bagOf(req).meta, { before: pick(before), after: pick(after) })
}
```

`packages/admin-server/src/audit/scrub.ts`:

```ts
// 정본: hangang-home apps/api/src/core/audit/audit.service.ts `scrubSecrets` · `foldBigInts` · `META_FIELD_BLACKLIST`
// 바꾼 점:
//  - 키 비교는 대소문자를 가리지 않는다(2c 스펙 B1). 프로젝트 키(hangang s3*Enc)는 쓰는 쪽 audit.secretKeys 로.
//  - 순환 '[Circular]' · 깊이 20 '[Depth]'(B7), meta 64 KiB 상한(B8) — 셋 다 행을 통째로 잃는 길을 막는다.
//  - 읽을 때 다시 가리기(hangang maskCiphertext)는 없다 — 모든 meta 가 쓸 때 여기를 지난다.

export const DEFAULT_SECRET_KEYS = Object.freeze([
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'refreshToken',
  'refreshTokenHash',
  'accessToken',
  'token',
  'secret',
  'keyHash',
] as const)

export const SECRET_MASK = '***'
export const META_MAX_BYTES = 64 * 1024
const MAX_DEPTH = 20
const UNSERIALIZABLE = '{"_unserializable":true}'

/** 기본 키 + 쓰는 쪽 키, 소문자로 */
export function secretKeySet(extra: readonly string[] = []): ReadonlySet<string> {
  return new Set([...DEFAULT_SECRET_KEYS, ...extra].map((key) => key.toLowerCase()))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

/**
 * 비밀 키의 값을 `'***'` 로 가린다 — 키는 남긴다(무엇이 바뀌었는지는 남는다).
 * 🔴 배열 · 중첩까지 내려간다(hangang I5 — 최상위만 보면 permissions 배열 안의 비밀이 그대로 실렸다).
 * 일반 객체 · 배열만 내려간다 — Date · 클래스 인스턴스는 그대로 둔다(`Object.entries(new Date())` 는 `{}`).
 */
export function scrubSecrets(value: unknown, keys: ReadonlySet<string>): unknown {
  const ancestors = new WeakSet<object>()
  const walk = (current: unknown, depth: number): unknown => {
    if (!Array.isArray(current) && !isPlainObject(current)) return current
    if (ancestors.has(current)) return '[Circular]'
    if (depth >= MAX_DEPTH) return '[Depth]'
    ancestors.add(current)
    const result = Array.isArray(current)
      ? current.map((item) => walk(item, depth + 1))
      : Object.fromEntries(
          Object.entries(current).map(([key, item]) => [
            key,
            keys.has(key.toLowerCase()) ? SECRET_MASK : walk(item, depth + 1),
          ]),
        )
    // 형제가 같은 객체를 가리키는 것은 순환이 아니다 — 조상에서만 뺀다.
    ancestors.delete(current)
    return result
  }
  return walk(value, 0)
}

/**
 * bigint → 십진 문자열, Date → ISO(잘못된 Date 는 null).
 * 🔴 admin-shared `stringifyJSON` 을 쓰지 않는다 — `"BigInt(n)"` 래퍼는 화면이 meta 를 다시 `JSON.stringify` 할 때
 *    TypeError 를 낸다(hangang).
 */
export function foldBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (Array.isArray(value)) return value.map(foldBigInts)
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, foldBigInts(item)]))
  }
  return value
}

/** 감사 행의 meta 컬럼 값. 비면 null. 🔴 던지지 않는다 — 실패 · 초과는 자리표시로 남긴다(행을 잃지 않는다) */
export function serializeAuditMeta(
  meta: Record<string, unknown>,
  keys: ReadonlySet<string>,
): string | null {
  if (Object.keys(meta).length === 0) return null
  let text: string
  try {
    text = JSON.stringify(foldBigInts(scrubSecrets(meta, keys)))
  } catch {
    return UNSERIALIZABLE
  }
  const bytes = Buffer.byteLength(text, 'utf8')
  return bytes > META_MAX_BYTES ? JSON.stringify({ _truncated: true, bytes }) : text
}
```

`packages/admin-server/src/audit/entry.ts`:

```ts
import type { Request } from 'express'
import type { AdminPrincipal } from '../auth/principal.js'
import { requestMetaOf } from '../auth/request-meta.js'
import type { AuditOptions } from './audit.decorator.js'
import { readAuditBag } from './audit-bag.js'
import { serializeAuditMeta } from './scrub.js'

// 정본: hangang-home apps/api/src/core/audit/audit.interceptor.ts `write` · `pickTargetRefNo` + audit.service.ts
//       `record`(폭 자르기) · `extractPath`
// 바꾼 점: 행 만들기를 순수 함수로 꺼냈다 — 인터셉터와 인증 이벤트 sink 가 같은 요청 필드를 쓴다. 대상 id 는 붙인 값이
//   먼저(2c 스펙 B6), 자르기는 코드 포인트 단위(서로게이트 반쪽을 남기지 않는다).

/**
 * 🔴 0008 장의 컬럼 폭과 같다 — 넘으면 STRICT 모드에서 INSERT 가 죽어 행이 빠진다(hangang C1 · A6). 오류 코드는 쓰는 쪽이
 *    정하므로 길 수 있다. 액션 · 대상 종류는 카탈로그가 폭을 지킨다(defineAuditCatalog · 기동 검사).
 */
export const AUDIT_COLUMN_WIDTHS = Object.freeze({
  method: 8,
  path: 255,
  ip: 45,
  userAgent: 255,
  errorCode: 64,
})

const UNSIGNED_DIGITS = /^[0-9]{1,20}$/
const UNSIGNED_BIGINT_MAX = 18446744073709551615n

export interface AuditOutcome {
  status: number
  /** 실패면 응답 봉투의 code, 성공이면 null */
  errorCode: string | null
}

/** 감사 행 한 줄 — `AdminAuditLogsTable` 의 넣는 모양 */
export interface AuditInsert {
  actorUserNo: bigint | null
  sessionNo: bigint | null
  action: string
  targetType: string | null
  targetRefNo: bigint | null
  method: string
  path: string
  statusCode: number
  errorCode: string | null
  ip: string | null
  userAgent: string | null
  meta: string | null
}

export interface AuditRequestFields {
  method: string
  path: string
  ip: string | null
  userAgent: string | null
}

export function clampCodePoints(value: string, max: number): string {
  const points = [...value]
  return points.length <= max ? value : points.slice(0, max).join('')
}

/** 🔴 쿼리를 뗀다 — 검색어 · 필터가 감사 경로에 섞여 들어간다(hangang) */
function pathOf(req: Request): string {
  const raw: unknown = req.originalUrl ?? req.url
  const url = typeof raw === 'string' ? raw : ''
  const queryIndex = url.indexOf('?')
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}

export function requestFieldsOf(req: Request): AuditRequestFields {
  const meta = requestMetaOf(req)
  return {
    method: clampCodePoints(
      typeof req.method === 'string' ? req.method : '',
      AUDIT_COLUMN_WIDTHS.method,
    ),
    path: clampCodePoints(pathOf(req), AUDIT_COLUMN_WIDTHS.path),
    ip: meta.clientIp == null ? null : clampCodePoints(meta.clientIp, AUDIT_COLUMN_WIDTHS.ip),
    userAgent:
      meta.userAgent == null
        ? null
        : clampCodePoints(meta.userAgent, AUDIT_COLUMN_WIDTHS.userAgent),
  }
}

function toBigIntOrNull(value: unknown): bigint | null {
  if (typeof value !== 'string' || !UNSIGNED_DIGITS.test(value)) return null
  const parsed = BigInt(value)
  return parsed <= UNSIGNED_BIGINT_MAX ? parsed : null
}

/**
 * 대상 id(2c 스펙 B6): 붙인 값 → `paramKey` 경로 변수 → 숫자 경로 변수가 정확히 하나면 그것 → null.
 * 🔴 숫자 경로 변수가 둘 이상이면 고르지 않는다 — 조용히 엉뚱한 값을 고르는 대신 null(hangang). 그때는 attachAuditTarget.
 */
export function pickTargetRefNo(
  req: Request,
  paramKey: string | undefined,
  attached: bigint | undefined,
): bigint | null {
  if (attached !== undefined) return attached
  const params = (req.params ?? {}) as Record<string, unknown>
  if (paramKey !== undefined) {
    const named = toBigIntOrNull(params[paramKey])
    if (named !== null) return named
  }
  const numeric = Object.values(params)
    .map(toBigIntOrNull)
    .filter((value): value is bigint => value !== null)
  return numeric.length === 1 ? (numeric[0] ?? null) : null
}

export function buildAuditEntry(
  req: Request,
  principal: AdminPrincipal,
  options: AuditOptions,
  outcome: AuditOutcome,
  secretKeys: ReadonlySet<string>,
): AuditInsert {
  const bag = readAuditBag(req)
  return {
    actorUserNo: principal.userNo,
    sessionNo: principal.sessionNo,
    action: options.action,
    targetType: options.targetType ?? null,
    targetRefNo: pickTargetRefNo(req, options.paramKey, bag?.targetRefNo),
    ...requestFieldsOf(req),
    statusCode: outcome.status,
    errorCode: clampErrorCode(outcome.errorCode),
    meta: bag ? serializeAuditMeta(bag.meta, secretKeys) : null,
  }
}

export function clampErrorCode(code: string | null): string | null {
  return code == null ? null : clampCodePoints(code, AUDIT_COLUMN_WIDTHS.errorCode)
}
```

`buildAuditEntry` 의 키 순서는 `entry.test.ts` 의 `toEqual` 과 상관없다(객체 비교) — 스프레드 위치는 읽기 편한 대로 둔다.

`packages/admin-server/src/index.ts` — 파일 끝에 더한다:

```ts
// 세션 · 감사(PR 2c)
export { Audit, type AuditOptions } from './audit/audit.decorator.js'
export { attachAuditTarget, attachAuditMeta, attachAuditDiff } from './audit/audit-bag.js'
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/audit`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-server/src/tokens.ts packages/admin-server/src/index.ts packages/admin-server/src/audit
git commit -m "feat(admin-server): 감사 순수 함수 — @Audit · 감사 가방 · 소독 · 행 만들기" -m "attachAudit* 는 함수(B2), 비밀 키는 대소문자 무시(B1), 순환 · 깊이 · 64 KiB 자리표시(B7 · B8), 대상 id 는 붙인 값이 먼저(B6), 폭은 코드 포인트로 자른다." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 감사 설정 · `AdminAuditService` · `AdminAuditInterceptor`

**Files:**

- Create: `packages/admin-server/src/audit/options.ts`
- Create: `packages/admin-server/src/audit/options.test.ts`
- Create: `packages/admin-server/src/audit/audit.service.ts`
- Create: `packages/admin-server/src/audit/audit.service.db.test.ts`
- Create: `packages/admin-server/src/audit/audit.interceptor.ts`
- Create: `packages/admin-server/src/audit/audit.interceptor.test.ts`
- Modify: `packages/admin-server/src/tokens.ts`
- Modify: `packages/admin-server/src/options.ts`
- Modify: `packages/admin-server/src/index.ts`

**Interfaces:**

- Consumes: Task 1 `resolveErrorResponse` · Task 2 `AuditCatalog` · `coreAuditCatalog` · Task 5 `AdminDatabase.auditLogs` · Task 6 `AuditOptions` · `AuditInsert` · `AuditOutcome` · `buildAuditEntry` · `secretKeySet` · 2b `getAdminPrincipal`
- Produces:
  - `ADMIN_AUDIT_CONFIG: unique symbol`(tokens, 내부)
  - `interface AdminAuditOptions { catalog?: AuditCatalog; secretKeys?: readonly string[] }` · `interface ResolvedAuditConfig { catalog: AuditCatalog; secretKeys: ReadonlySet<string> }` · `resolveAuditConfig(options?): ResolvedAuditConfig`
  - `AdminServerOptions.audit?: AdminAuditOptions`
  - `class AdminAuditService { insert(entry: AuditInsert): Promise<void>; warn(message: string): void }` · `reasonOf(error: unknown): string`
  - `class AdminAuditInterceptor implements NestInterceptor` — 생성자 `(reflector: Reflector, audit: AdminAuditService, config: ResolvedAuditConfig, options?: AdminServerOptions)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/audit/options.test.ts`:

```ts
import { coreAuditCatalog, defineAuditCatalog } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { resolveAuditConfig } from './options.js'

describe('resolveAuditConfig', () => {
  it('없으면 코어 카탈로그 · 기본 비밀 키', () => {
    const config = resolveAuditConfig(undefined)
    expect(config.catalog).toBe(coreAuditCatalog)
    expect(config.secretKeys.has('password')).toBe(true)
  })

  it('프로젝트 카탈로그 · 쓰는 쪽 비밀 키(소문자로)', () => {
    const catalog = defineAuditCatalog({ actions: { X: 'probe.x' }, labels: { 'probe.x': 'x' } })
    const config = resolveAuditConfig({ catalog, secretKeys: ['S3SecretKeyEnc'] })
    expect(config.catalog).toBe(catalog)
    expect(config.secretKeys.has('s3secretkeyenc')).toBe(true)
    expect(config.secretKeys.has('token')).toBe(true)
  })

  it('빈 비밀 키 이름은 기동에서 멈춘다', () => {
    expect(() => resolveAuditConfig({ secretKeys: [' '] })).toThrow('audit.secretKeys')
  })
})
```

`packages/admin-server/src/audit/audit.interceptor.test.ts`:

```ts
import 'reflect-metadata'
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BusinessError, CommonErrorCodes, defineErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { lastValueFrom, of, throwError } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { setAdminPrincipal, type AdminPrincipal } from '../auth/principal.js'
import type { AdminServerOptions } from '../options.js'
import { Audit } from './audit.decorator.js'
import { AdminAuditInterceptor } from './audit.interceptor.js'
import type { AdminAuditService } from './audit.service.js'
import type { AuditInsert } from './entry.js'
import { resolveAuditConfig } from './options.js'

class Routes {
  @Audit({ action: 'session.revoke', targetType: 'session' })
  revoke() {}

  plain() {}
}

class FakeAudit {
  readonly entries: AuditInsert[] = []
  readonly warnings: string[] = []
  calls = 0
  failWith: Error | null = null
  gate: Promise<void> | null = null

  async insert(entry: AuditInsert): Promise<void> {
    this.calls += 1
    if (this.gate) await this.gate
    if (this.failWith) throw this.failWith
    this.entries.push(entry)
  }

  warn(message: string): void {
    this.warnings.push(message)
  }
}

const principal: AdminPrincipal = {
  userNo: 3n,
  sessionNo: 9n,
  userId: 'admin',
  userName: '관리자',
  roleNo: 1n,
  roleName: '역할',
  teamNo: null,
  teamName: null,
  permissions: ['*'],
  isPasswordChangeRequired: false,
}

function request(withPrincipal = true): Request {
  const req = {
    method: 'DELETE',
    originalUrl: '/api/admin/sessions/12',
    params: { sessionNo: '12' },
    ip: '10.0.0.1',
    headers: { 'user-agent': 'UA/1' },
  } as unknown as Request
  if (withPrincipal) setAdminPrincipal(req, principal)
  return req
}

function context(
  method: keyof Routes,
  req: Request,
  statusCode = 200,
  type = 'http',
): ExecutionContext {
  return {
    getType: () => type,
    getHandler: () => Routes.prototype[method],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode }) }),
  } as unknown as ExecutionContext
}

const ok = (value: unknown): CallHandler => ({ handle: () => of(value) })
const fail = (error: unknown): CallHandler => ({ handle: () => throwError(() => error) })

function interceptor(
  audit: FakeAudit,
  options?: Partial<AdminServerOptions>,
): AdminAuditInterceptor {
  return new AdminAuditInterceptor(
    new Reflector(),
    audit as unknown as AdminAuditService,
    resolveAuditConfig(undefined),
    options as AdminServerOptions | undefined,
  )
}

describe('AdminAuditInterceptor', () => {
  it('HTTP 가 아니거나 @Audit 이 없으면 기록하지 않는다', async () => {
    const audit = new FakeAudit()
    await lastValueFrom(
      interceptor(audit).intercept(context('revoke', request(), 200, 'rpc'), ok(1)),
    )
    await lastValueFrom(interceptor(audit).intercept(context('plain', request()), ok(1)))
    expect(audit.calls).toBe(0)
  })

  it('성공은 res.statusCode 로 — POST 201', async () => {
    const audit = new FakeAudit()
    const value = await lastValueFrom(
      interceptor(audit).intercept(context('revoke', request(), 201), ok({ a: 1 })),
    )
    expect(value).toEqual({ a: 1 })
    expect(audit.entries).toHaveLength(1)
    expect(audit.entries[0]).toMatchObject({
      action: 'session.revoke',
      targetRefNo: 12n,
      statusCode: 201,
      errorCode: null,
      actorUserNo: 3n,
      sessionNo: 9n,
    })
  })

  it('🔴 실패는 필터와 같은 상태 · 코드로 남기고 원래 예외를 그대로 다시 던진다', async () => {
    const audit = new FakeAudit()
    const error = new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, '없음')
    await expect(
      lastValueFrom(interceptor(audit).intercept(context('revoke', request()), fail(error))),
    ).rejects.toBe(error)
    expect(audit.entries[0]).toMatchObject({ statusCode: 404, errorCode: 'ERR_COMMON_NOT_FOUND' })
  })

  it('맨 Error 는 500 · ERR_COMMON_INTERNAL, 프로젝트 코드는 errorCodes 의 상태', async () => {
    const audit = new FakeAudit()
    await expect(
      lastValueFrom(
        interceptor(audit).intercept(context('revoke', request()), fail(new Error('x'))),
      ),
    ).rejects.toThrow('x')
    expect(audit.entries[0]).toMatchObject({ statusCode: 500, errorCode: 'ERR_COMMON_INTERNAL' })

    const errorCodes = defineErrorCodes({ ERR_NO_POST: 'ERR_NO_POST' }, { ERR_NO_POST: 410 })
    await expect(
      lastValueFrom(
        interceptor(audit, { errorCodes }).intercept(
          context('revoke', request()),
          fail(new BusinessError('ERR_NO_POST', '없음')),
        ),
      ),
    ).rejects.toBeInstanceOf(BusinessError)
    expect(audit.entries[1]).toMatchObject({ statusCode: 410, errorCode: 'ERR_NO_POST' })
  })

  it('🔴 기록이 던져도 응답은 그대로 — 두 번 기록하지 않는다', async () => {
    const audit = new FakeAudit()
    audit.failWith = new Error('db down')
    const value = await lastValueFrom(
      interceptor(audit).intercept(context('revoke', request()), ok('done')),
    )
    expect(value).toBe('done')
    expect(audit.calls).toBe(1)
    expect(audit.warnings[0]).toContain('db down')
  })

  it('🔴 기록을 기다린 뒤에 값을 낸다(hangang I2)', async () => {
    const audit = new FakeAudit()
    let release: () => void = () => {}
    audit.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let emitted = false
    const pending = lastValueFrom(
      interceptor(audit).intercept(context('revoke', request()), ok('v')),
    ).then((value) => {
      emitted = true
      return value
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(emitted).toBe(false)
    release()
    await expect(pending).resolves.toBe('v')
    expect(audit.entries).toHaveLength(1)
  })

  it('주체가 없으면(@Public) 기록하지 않는다', async () => {
    const audit = new FakeAudit()
    await lastValueFrom(interceptor(audit).intercept(context('revoke', request(false)), ok(1)))
    expect(audit.calls).toBe(0)
  })
})
```

`packages/admin-server/src/audit/audit.service.db.test.ts`:

```ts
import { Logger } from '@nestjs/common'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminAuditService } from './audit.service.js'
import type { AuditInsert } from './entry.js'

let t: TestDatabase
let empty: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
  empty = await createTestDatabase({ migrate: false })
})

afterAll(async () => {
  await t?.drop()
  await empty?.drop()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const ENTRY: AuditInsert = {
  actorUserNo: 3n,
  sessionNo: 9n,
  action: 'session.revoke',
  targetType: 'session',
  targetRefNo: 12n,
  method: 'DELETE',
  path: '/api/admin/sessions/12',
  statusCode: 200,
  errorCode: null,
  ip: '10.0.0.1',
  userAgent: 'UA/1',
  meta: '{"revokedCount":1,"note":"비밀 아님"}',
}

describe('AdminAuditService.insert', () => {
  it('한 행을 넣는다 — meta 는 드라이버가 파싱해 돌려준다(2c 스펙 §14 R1-4)', async () => {
    await new AdminAuditService(t.db).insert(ENTRY)
    const row = await t.db.selectFrom('auditLogs').selectAll().executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      actorUserNo: 3n,
      sessionNo: 9n,
      action: 'session.revoke',
      targetRefNo: 12n,
      statusCode: 200,
      errorCode: null,
      meta: { revokedCount: 1, note: '비밀 아님' },
    })
    expect(row.createAt).toBeInstanceOf(Date)
  })

  it('행위자 · 세션 · IP 가 없어도 넣는다(익명 로그인 실패)', async () => {
    await new AdminAuditService(t.db).insert({
      ...ENTRY,
      actorUserNo: null,
      sessionNo: null,
      ip: null,
      action: 'auth.login.fail',
      meta: null,
    })
    const row = await t.db
      .selectFrom('auditLogs')
      .selectAll()
      .where('action', '=', 'auth.login.fail')
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ actorUserNo: null, sessionNo: null, ip: null, meta: null })
  })

  it('🔴 INSERT 가 실패해도 던지지 않고 경고 한 줄 — meta · IP · UA 는 싣지 않는다(B12)', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    await expect(new AdminAuditService(empty.db).insert(ENTRY)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain(
      '감사 기록 실패 — actor=3 action=session.revoke DELETE /api/admin/sessions/12 status=200:',
    )
    expect(message).not.toContain('비밀 아님')
    expect(message).not.toContain('10.0.0.1')
    expect(message).not.toContain('UA/1')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/audit/options.test.ts src/audit/audit.interceptor.test.ts`
Expected: FAIL — `./options.js` · `./audit.interceptor.js` 를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/tokens.ts` — `AUDIT_META` 다음에 더한다:

```ts
/** 내부 — 해석된 감사 설정(`ResolvedAuditConfig`). `AdminAuditModule` 이 코어 옵션의 `audit` 로 만든다 */
export const ADMIN_AUDIT_CONFIG = Symbol('ADMIN_AUDIT_CONFIG')
```

`packages/admin-server/src/audit/options.ts`:

```ts
import { coreAuditCatalog, type AuditCatalog } from '@ssworks/admin-shared'
import { secretKeySet } from './scrub.js'

// 정본: 없음 — Phase 0 §3-2 `audit: { enabled, sink?, catalog, blacklist }` 를 실제로 갈리는 값만 남겼다(2c 스펙 §4-1).
//   enabled 는 모듈 import, sink 는 내부(ADMIN_AUTH_EVENTS), blacklist 는 secretKeys, 파티셔닝은 없다.

export interface AdminAuditOptions {
  /** admin-shared `defineAuditCatalog()` 결과. 없으면 코어 카탈로그 */
  catalog?: AuditCatalog
  /** 기본 비밀 키에 더한다(2c 스펙 B1). 대소문자 무시 — 기본 키를 뺄 수는 없다 */
  secretKeys?: readonly string[]
}

export interface ResolvedAuditConfig {
  catalog: AuditCatalog
  /** 소문자 */
  secretKeys: ReadonlySet<string>
}

export function resolveAuditConfig(options: AdminAuditOptions | undefined): ResolvedAuditConfig {
  const extra = options?.secretKeys ?? []
  for (const key of extra) {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error('audit.secretKeys 는 빈 문자열이 아닌 키 이름이어야 한다.')
    }
  }
  return Object.freeze({
    catalog: options?.catalog ?? coreAuditCatalog,
    secretKeys: secretKeySet(extra),
  })
}
```

`packages/admin-server/src/options.ts` — import 에 `import type { AdminAuditOptions } from './audit/options.js'` 를 더하고 `AdminServerOptions` 의 `permissions` 다음에 더한다:

```ts
  /** `AdminAuditModule` 이 읽는다 — 카탈로그 · 더할 비밀 키(2c 스펙 §4-1) */
  audit?: AdminAuditOptions
```

`packages/admin-server/src/audit/audit.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import type { AuditInsert } from './entry.js'

// 정본: hangang-home apps/api/src/core/audit/audit.service.ts `record`
// 바꾼 점: 행은 호출부(인터셉터 · 인증 이벤트 sink)가 다 만들어 온다 — 폭 자르기 · 소독은 entry.ts · scrub.ts 몫. 경고
//   문구는 2c 스펙 B12.

/** 던지지 않는 사유 문자열 */
export function reasonOf(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error)
  } catch {
    return '[unserializable]'
  }
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger('AdminAuditService')

  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  /**
   * 감사 행 하나를 넣는다(자기 연결 — 업무 트랜잭션 밖, 커밋 뒤 · 2c 스펙 ⑤ T1).
   * 🔴 던지지 않는다 — 감사 누락 < 서비스 차단(hangang). 감사 테이블이 잠기거나 차도 로그인 · 저장이 막히면 안 된다.
   * 🔴 그 대가로 구멍은 경고 한 줄로만 드러난다(I7) — 누가 · 무엇을 · 어디서 · 결과를 싣고, meta · IP · UA 는 싣지 않는다.
   *    드라이버 문구는 싣는다 — 풀이 logParam: false 라 바인딩 값이 문구에 나오지 않는다(2a).
   */
  async insert(entry: AuditInsert): Promise<void> {
    try {
      await this.db.insertInto('auditLogs').values(entry).execute()
    } catch (error) {
      this.warn(
        `감사 기록 실패 — actor=${entry.actorUserNo ?? '-'} action=${entry.action} ${entry.method} ${entry.path} status=${entry.statusCode}: ${reasonOf(error)}`,
      )
    }
  }

  /** 🔴 로거가 던져도 삼킨다 — 감사 실패가 응답을 바꾸면 안 된다 */
  warn(message: string): void {
    try {
      this.logger.warn(message)
    } catch {
      // 의도적으로 삼킨다.
    }
  }
}
```

`packages/admin-server/src/audit/audit.interceptor.ts`:

```ts
import {
  Inject,
  Injectable,
  Optional,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request, Response } from 'express'
import { catchError, from, map, mergeMap, throwError, type Observable } from 'rxjs'
import { getAdminPrincipal } from '../auth/principal.js'
import { resolveErrorResponse } from '../http/error-response.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_AUDIT_CONFIG, ADMIN_SERVER_OPTIONS, AUDIT_META } from '../tokens.js'
import type { AuditOptions } from './audit.decorator.js'
import { AdminAuditService, reasonOf } from './audit.service.js'
import { buildAuditEntry, type AuditOutcome } from './entry.js'
import type { ResolvedAuditConfig } from './options.js'

// 정본: hangang-home apps/api/src/core/audit/audit.interceptor.ts
// 바꾼 점:
//  - 실패의 상태 · 코드는 resolveErrorResponse — 예외 필터가 실제로 보내는 값과 같다(2c 스펙 공통 10 · ⑧ F1). hangang 은
//    `err.getStatus()` 라 BusinessError 가 모두 500 으로 남았다. 오류 코드 컬럼을 더 채운다(⑥ TB2).
//  - 주체는 req.admin(2b) — hangang 은 req.user.
// 순서(2c 스펙 §14 R1-1 실측): 가드 → Nest 가 성공 상태를 정한다 → 봉투 인터셉터 → 이 인터셉터 → 핸들러. 이 인터셉터는 봉투
//   안쪽이라 핸들러의 원래 반환값을 본다(읽지 않는다). 가드 거부(401 · 403)는 여기 오지 않는다.

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AdminAuditService,
    @Inject(ADMIN_AUDIT_CONFIG) private readonly config: ResolvedAuditConfig,
    @Optional() @Inject(ADMIN_SERVER_OPTIONS) private readonly options?: AdminServerOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const meta = this.reflector.getAllAndOverride<AuditOptions | undefined>(AUDIT_META, [
      context.getHandler(),
      context.getClass(),
    ])
    if (meta == null) return next.handle()

    const http = context.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()

    return next.handle().pipe(
      // 🔴 실패도 남긴다 — 기록을 **기다린 뒤** 원래 예외를 그대로 다시 던진다.
      // 🔴 catchError 가 mergeMap 앞이다 — 반대면 성공 경로 기록이 실패할 때 그것을 다시 잡아 같은 요청이 두 번 기록된다.
      catchError((error: unknown) =>
        from(this.write(req, meta, () => this.failureOf(error))).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
      // 성공 경로 — 응답을 내보내기 전에 기록을 기다린다(hangang I2 — tap(void) 는 행을 잃었다). 값은 그대로 흘린다.
      mergeMap((value: unknown) =>
        from(this.write(req, meta, () => ({ status: res.statusCode, errorCode: null }))).pipe(
          map(() => value),
        ),
      ),
    )
  }

  private failureOf(error: unknown): AuditOutcome {
    const resolved = resolveErrorResponse(error, this.options?.errorCodes)
    return { status: resolved.status, errorCode: resolved.body.code }
  }

  /**
   * 🔴 절대 reject 하지 않는다 — 기다리는 대상이라 reject 하면 감사 실패가 응답을 500 으로 만든다(상류의 "감사 누락 <
   *    서비스 차단" 이 뒤집힌다). insert 는 스스로 삼키고, 그 밖(판정 · 행 만들기)에서 나는 것을 여기서 삼킨다.
   */
  private async write(
    req: Request,
    meta: AuditOptions,
    outcome: () => AuditOutcome,
  ): Promise<void> {
    try {
      const principal = getAdminPrincipal(req)
      // 주체 없음 = @Public 라우트 — 기동 검사가 @Public + @Audit 을 미리 막는다(2c 스펙 B11).
      if (principal == null) return
      await this.audit.insert(
        buildAuditEntry(req, principal, meta, outcome(), this.config.secretKeys),
      )
    } catch (error) {
      this.audit.warn(`감사 기록 준비 실패 — action=${meta.action}: ${reasonOf(error)}`)
    }
  }
}
```

`packages/admin-server/src/index.ts` — 세션 · 감사 블록에 더한다:

```ts
export type { AdminAuditOptions } from './audit/options.js'
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/audit`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/audit/audit.service.db.test.ts`
Expected: PASS — 넣기 · NULL 허용 · 실패는 경고 한 줄.

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-server/src/tokens.ts packages/admin-server/src/options.ts packages/admin-server/src/index.ts packages/admin-server/src/audit
git commit -m "feat(admin-server): 감사 설정 · AdminAuditService · AdminAuditInterceptor" -m "응답 전에 기록을 기다리고(I2) 실패는 경고 한 줄(I7 · B12). 실패 요청의 상태 · 코드는 resolveErrorResponse — 필터와 같은 값. catchError 가 mergeMap 앞이라 두 번 기록하지 않는다." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 인증 이벤트 sink — `auditEntryOfAuthEvent` · `AdminAuditEventSink`

**Files:**

- Create: `packages/admin-server/src/audit/auth-events.ts`
- Create: `packages/admin-server/src/audit/auth-events.test.ts`

**Interfaces:**

- Consumes: 2b `AdminAuthEvent` · `AdminAuthEventSink`(`../auth/hooks.js`), Task 1 `resolveErrorResponse`, Task 6 `requestFieldsOf` · `serializeAuditMeta`, Task 7 `AdminAuditService` · `reasonOf` · `ResolvedAuditConfig`
- Produces:
  - `interface AuthEventAudit { actorUserNo: bigint | null; sessionNo: bigint | null; action: string; targetType: string | null; targetRefNo: bigint | null; errorCode: string | null; meta: Record<string, unknown> | null }`
  - `auditEntryOfAuthEvent(event: AdminAuthEvent): AuthEventAudit`
  - `class AdminAuditEventSink implements AdminAuthEventSink` — 생성자 `(audit: AdminAuditService, config: ResolvedAuditConfig, options?: AdminServerOptions)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/audit/auth-events.test.ts`:

```ts
import { CommonErrorCodes, CoreAuditActions, defineErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import type { AdminAuthEvent } from '../auth/hooks.js'
import type { AdminServerOptions } from '../options.js'
import type { AdminAuditService } from './audit.service.js'
import { AdminAuditEventSink, auditEntryOfAuthEvent } from './auth-events.js'
import type { AuditInsert } from './entry.js'
import { resolveAuditConfig } from './options.js'

describe('auditEntryOfAuthEvent(2c 스펙 §5-5)', () => {
  const cases: [AdminAuthEvent, Partial<ReturnType<typeof auditEntryOfAuthEvent>>][] = [
    [
      { type: 'login.success', userNo: 3n, sessionNo: 9n },
      {
        action: CoreAuditActions.AUTH_LOGIN_SUCCESS,
        actorUserNo: 3n,
        sessionNo: 9n,
        targetType: 'user',
        targetRefNo: 3n,
        errorCode: null,
        meta: null,
      },
    ],
    [
      { type: 'login.fail', userId: 'nobody', userNo: null, loginFailCount: null },
      {
        action: CoreAuditActions.AUTH_LOGIN_FAIL,
        actorUserNo: null,
        sessionNo: null,
        targetType: null,
        targetRefNo: null,
        errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
        meta: { userId: 'nobody', loginFailCount: null },
      },
    ],
    [
      { type: 'login.fail', userId: 'admin', userNo: 3n, loginFailCount: 2 },
      {
        actorUserNo: 3n,
        targetType: 'user',
        targetRefNo: 3n,
        meta: { userId: 'admin', loginFailCount: 2 },
      },
    ],
    [
      { type: 'login.blocked', reason: 'resigned', userId: 'a', userNo: 3n },
      {
        action: CoreAuditActions.AUTH_LOGIN_BLOCKED_INACTIVE,
        errorCode: CommonErrorCodes.ERR_RESIGNED_USER,
        targetRefNo: 3n,
        meta: { userId: 'a' },
      },
    ],
    [
      { type: 'login.blocked', reason: 'ip', userId: 'a', userNo: 3n },
      {
        action: CoreAuditActions.AUTH_LOGIN_BLOCKED_IP,
        errorCode: CommonErrorCodes.ERR_IP_NOT_ALLOWED,
      },
    ],
    [
      { type: 'login.blocked', reason: 'locked', userId: 'a', userNo: 3n },
      // 🔴 잠긴 동안의 로그인은 실패와 같은 401 이다(2b §14 R7) — 코드도 응답과 같게
      {
        action: CoreAuditActions.AUTH_LOGIN_BLOCKED_LOCKED,
        errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
      },
    ],
    [
      { type: 'token.refresh', userNo: 3n, sessionNo: 10n, rotatedFrom: 9n, grace: false },
      {
        action: CoreAuditActions.AUTH_TOKEN_REFRESH,
        sessionNo: 10n,
        targetType: 'session',
        targetRefNo: 10n,
        errorCode: null,
        meta: { rotatedFrom: 9n, grace: false },
      },
    ],
    [
      { type: 'token.reuse', userNo: 3n, sessionNo: 9n, revokedCount: 2 },
      {
        action: CoreAuditActions.AUTH_TOKEN_REUSE,
        sessionNo: 9n,
        targetRefNo: 9n,
        errorCode: CommonErrorCodes.ERR_REFRESH_REUSED,
        meta: { revokedCount: 2 },
      },
    ],
    [
      { type: 'logout', userNo: 3n, sessionNo: 9n },
      {
        action: CoreAuditActions.AUTH_LOGOUT,
        targetType: 'session',
        targetRefNo: 9n,
        errorCode: null,
      },
    ],
    [
      { type: 'password.change', userNo: 3n, sessionNo: 9n, revokedCount: 1 },
      {
        action: CoreAuditActions.AUTH_PASSWORD_CHANGE,
        targetType: 'user',
        targetRefNo: 3n,
        sessionNo: 9n,
        meta: { revokedCount: 1 },
      },
    ],
    [
      { type: 'access.blocked', reason: 'ip', userNo: 3n, sessionNo: 9n },
      {
        action: CoreAuditActions.AUTH_ACCESS_BLOCKED_IP,
        targetType: 'session',
        errorCode: CommonErrorCodes.ERR_IP_NOT_ALLOWED,
      },
    ],
  ]

  it.each(cases)('%o', (event, expected) => {
    expect(auditEntryOfAuthEvent(event)).toMatchObject(expected)
  })
})

class FakeAudit {
  readonly entries: AuditInsert[] = []
  readonly warnings: string[] = []
  failWith: Error | null = null

  async insert(entry: AuditInsert): Promise<void> {
    if (this.failWith) throw this.failWith
    this.entries.push(entry)
  }

  warn(message: string): void {
    this.warnings.push(message)
  }
}

const req = {
  method: 'POST',
  originalUrl: '/api/admin/auth/login',
  ip: '10.0.0.1',
  headers: { 'user-agent': 'UA/1' },
} as unknown as Request

function sink(audit: FakeAudit, options?: Partial<AdminServerOptions>): AdminAuditEventSink {
  return new AdminAuditEventSink(
    audit as unknown as AdminAuditService,
    resolveAuditConfig(undefined),
    options as AdminServerOptions | undefined,
  )
}

describe('AdminAuditEventSink', () => {
  it('요청 필드 · 상태(응답과 같은 판정) · 접힌 meta 로 한 행', async () => {
    const audit = new FakeAudit()
    await sink(audit).record(
      { type: 'token.refresh', userNo: 3n, sessionNo: 10n, rotatedFrom: 9n, grace: true },
      req,
    )
    await sink(audit).record(
      { type: 'login.fail', userId: 'x', userNo: null, loginFailCount: null },
      req,
    )
    expect(audit.entries[0]).toEqual({
      actorUserNo: 3n,
      sessionNo: 10n,
      action: 'auth.token.refresh',
      targetType: 'session',
      targetRefNo: 10n,
      method: 'POST',
      path: '/api/admin/auth/login',
      statusCode: 200,
      errorCode: null,
      ip: '10.0.0.1',
      userAgent: 'UA/1',
      meta: '{"rotatedFrom":"9","grace":true}',
    })
    expect(audit.entries[1]).toMatchObject({ statusCode: 401, errorCode: 'ERR_LOGIN_FAILED' })
  })

  it('쓰는 쪽이 코어 코드 상태를 덮으면 그 상태로 — 필터가 보내는 값과 같다', async () => {
    const audit = new FakeAudit()
    const errorCodes = defineErrorCodes({}, { ERR_IP_NOT_ALLOWED: 401 })
    await sink(audit, { errorCodes }).record(
      { type: 'access.blocked', reason: 'ip', userNo: 3n, sessionNo: 9n },
      req,
    )
    expect(audit.entries[0]?.statusCode).toBe(401)
  })

  it('🔴 던지지 않는다 — 인증은 계속된다(2b B8)', async () => {
    const audit = new FakeAudit()
    audit.failWith = new Error('boom')
    // insert 는 실제로 던지지 않지만, 던져도 record 는 resolve 하고 경고를 남긴다.
    await expect(
      sink(audit).record({ type: 'logout', userNo: 3n, sessionNo: 9n }, req),
    ).resolves.toBeUndefined()
    expect(audit.warnings[0]).toContain('logout')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/audit/auth-events.test.ts`
Expected: FAIL — `./auth-events.js` 를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/audit/auth-events.ts`:

```ts
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  BusinessError,
  CommonErrorCodes,
  CoreAuditActions,
  CoreAuditTargets,
} from '@ssworks/admin-shared'
import type { Request } from 'express'
import type { AdminAuthEvent, AdminAuthEventSink } from '../auth/hooks.js'
import { resolveErrorResponse } from '../http/error-response.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_AUDIT_CONFIG, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminAuditService, reasonOf } from './audit.service.js'
import { clampErrorCode, requestFieldsOf } from './entry.js'
import type { ResolvedAuditConfig } from './options.js'
import { serializeAuditMeta } from './scrub.js'

// 정본: hangang-home apps/api/src/modules/auth/auth.service.ts `recordFromRequest` · `denyAndRecord` 호출 다섯 갈래
// 바꾼 점: 인증 서비스가 직접 부르지 않고 2b 의 ADMIN_AUTH_EVENTS 를 채운다(2b 스펙 ⑧ H1 · 2c 스펙 공통 11). 인증
//   컨트롤러의 로그인 · refresh · 로그아웃은 @Public 이라 인터셉터가 주체를 모른다 — 그래서 이벤트로 받는다.
//   실패의 상태는 resolveErrorResponse 로 낸다 — 쓰는 쪽 errorCodes 가 상태를 덮어도 필터가 보낸 값과 같다.

export interface AuthEventAudit {
  actorUserNo: bigint | null
  sessionNo: bigint | null
  action: string
  targetType: string | null
  targetRefNo: bigint | null
  /** null = 성공(200) */
  errorCode: string | null
  meta: Record<string, unknown> | null
}

const BLOCKED = {
  resigned: {
    action: CoreAuditActions.AUTH_LOGIN_BLOCKED_INACTIVE,
    errorCode: CommonErrorCodes.ERR_RESIGNED_USER,
  },
  ip: {
    action: CoreAuditActions.AUTH_LOGIN_BLOCKED_IP,
    errorCode: CommonErrorCodes.ERR_IP_NOT_ALLOWED,
  },
  // 🔴 잠긴 동안의 로그인은 실패와 같은 401 ERR_LOGIN_FAILED 다(2b 스펙 §14 R7) — 감사도 응답과 같은 코드를 남긴다.
  locked: {
    action: CoreAuditActions.AUTH_LOGIN_BLOCKED_LOCKED,
    errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
  },
} as const

/**
 * 인증 이벤트 → 감사 행의 의미 부분(2c 스펙 §5-5 표). 🔴 이벤트에는 비밀번호 · 토큰 · 해시가 없다(2b). `login.fail` 의
 * `userId` 는 사람이 친 원문이다 — 비밀번호를 아이디 칸에 친 사고가 그대로 남는다(README 에 적는다).
 */
export function auditEntryOfAuthEvent(event: AdminAuthEvent): AuthEventAudit {
  switch (event.type) {
    case 'login.success':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_LOGIN_SUCCESS,
        targetType: CoreAuditTargets.USER,
        targetRefNo: event.userNo,
        errorCode: null,
        meta: null,
      }
    case 'login.fail':
      return {
        actorUserNo: event.userNo,
        sessionNo: null,
        action: CoreAuditActions.AUTH_LOGIN_FAIL,
        targetType: event.userNo == null ? null : CoreAuditTargets.USER,
        targetRefNo: event.userNo,
        errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
        meta: { userId: event.userId, loginFailCount: event.loginFailCount },
      }
    case 'login.blocked':
      return {
        actorUserNo: event.userNo,
        sessionNo: null,
        action: BLOCKED[event.reason].action,
        targetType: CoreAuditTargets.USER,
        targetRefNo: event.userNo,
        errorCode: BLOCKED[event.reason].errorCode,
        meta: { userId: event.userId },
      }
    case 'token.refresh':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_TOKEN_REFRESH,
        targetType: CoreAuditTargets.SESSION,
        targetRefNo: event.sessionNo,
        errorCode: null,
        meta: { rotatedFrom: event.rotatedFrom, grace: event.grace },
      }
    case 'token.reuse':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_TOKEN_REUSE,
        targetType: CoreAuditTargets.SESSION,
        targetRefNo: event.sessionNo,
        errorCode: CommonErrorCodes.ERR_REFRESH_REUSED,
        meta: { revokedCount: event.revokedCount },
      }
    case 'logout':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_LOGOUT,
        targetType: CoreAuditTargets.SESSION,
        targetRefNo: event.sessionNo,
        errorCode: null,
        meta: null,
      }
    case 'password.change':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_PASSWORD_CHANGE,
        targetType: CoreAuditTargets.USER,
        targetRefNo: event.userNo,
        errorCode: null,
        meta: { revokedCount: event.revokedCount },
      }
    case 'access.blocked':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_ACCESS_BLOCKED_IP,
        targetType: CoreAuditTargets.SESSION,
        targetRefNo: event.sessionNo,
        errorCode: CommonErrorCodes.ERR_IP_NOT_ALLOWED,
        meta: null,
      }
  }
}

/** `ADMIN_AUTH_EVENTS` 구현 — AdminAuditModule 이 전역으로 낸다(2c 스펙 §4-2, §14 R1-2 실측) */
@Injectable()
export class AdminAuditEventSink implements AdminAuthEventSink {
  constructor(
    private readonly audit: AdminAuditService,
    @Inject(ADMIN_AUDIT_CONFIG) private readonly config: ResolvedAuditConfig,
    @Optional() @Inject(ADMIN_SERVER_OPTIONS) private readonly options?: AdminServerOptions,
  ) {}

  /** 🔴 던지지 않는다 — 인증은 계속된다(2b 스펙 B8). 2b 의 emit 도 한 번 더 잡는다 */
  async record(event: AdminAuthEvent, req: Request): Promise<void> {
    try {
      const entry = auditEntryOfAuthEvent(event)
      await this.audit.insert({
        actorUserNo: entry.actorUserNo,
        sessionNo: entry.sessionNo,
        action: entry.action,
        targetType: entry.targetType,
        targetRefNo: entry.targetRefNo,
        ...requestFieldsOf(req),
        statusCode:
          entry.errorCode == null
            ? 200
            : resolveErrorResponse(
                new BusinessError(entry.errorCode, entry.action),
                this.options?.errorCodes,
              ).status,
        errorCode: clampErrorCode(entry.errorCode),
        meta: entry.meta == null ? null : serializeAuditMeta(entry.meta, this.config.secretKeys),
      })
    } catch (error) {
      this.audit.warn(`인증 이벤트 ${event.type} 의 감사 기록 준비 실패: ${reasonOf(error)}`)
    }
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/audit/auth-events.test.ts`
Expected: PASS — 11 갈래 표 · sink 셋.

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint`
Expected: 오류 없음(switch 가 이벤트 8종을 다 덮어 반환 누락이 없다).

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-server/src/audit/auth-events.ts packages/admin-server/src/audit/auth-events.test.ts
git commit -m "feat(admin-server): 인증 이벤트 sink — 2b ADMIN_AUTH_EVENTS 를 감사 행으로" -m "이벤트 8종 → 액션 · 대상 · 세션 · meta(2c 스펙 §5-5). 실패 상태는 resolveErrorResponse 로 — 쓰는 쪽 errorCodes 가 덮어도 응답과 같다. 던지지 않는다(B8)." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 감사 조회 · 카탈로그 검사 · `AdminAuditModule`

**Files:**

- Create: `packages/admin-server/src/audit/errors.ts`
- Create: `packages/admin-server/src/audit/audit-logs.service.ts`
- Create: `packages/admin-server/src/audit/audit-logs.service.db.test.ts`
- Create: `packages/admin-server/src/audit/audit-logs.controller.ts`
- Create: `packages/admin-server/src/audit/catalog-check.ts`
- Create: `packages/admin-server/src/audit/catalog-check.test.ts`
- Create: `packages/admin-server/src/audit/audit.module.ts`
- Create: `packages/admin-server/src/audit/audit.module.test.ts`
- Modify: `packages/admin-server/src/admin-server.module.ts`
- Modify: `packages/admin-server/src/index.ts`

**Interfaces:**

- Consumes: Task 2 `adminAuditLogQuerySchema` · `AdminAuditLogQuery` · `AuditCatalog`, Task 3 `likePrefix`, Task 4 `RequirePermissionSlot` · `assertPermissionSlots` · `assertAuthModuleRegistered`, Task 6 `AuditOptions`, Task 7 `AdminAuditService` · `AdminAuditInterceptor` · `resolveAuditConfig`, Task 8 `AdminAuditEventSink`, 2a `ZodValidationPipe` · `validationError` · `readJsonColumn` · `runQuery`
- Produces:
  - `AUDIT_MESSAGES = { periodOrder: '끝 시각은 시작 시각보다 뒤여야 합니다.' }`
  - `interface AdminAuditLogRow`(조회 행 — `createAt: Date`, `meta: unknown`) · `class AdminAuditLogsService { list(query: AdminAuditLogQuery): Promise<Paginated<AdminAuditLogRow>> }`
  - `class AdminAuditLogsController` — `GET /audit-logs`(슬롯 `auditLogs.read`)
  - `interface AuditDeclaration { controller: string; method: string; options: AuditOptions; isPublic: boolean }` · `collectAuditDeclarations(discovery, reflector): AuditDeclaration[]` · `findAuditProblems(declarations, catalog): string[]`
  - `class AdminAuditModule`(전역) — index 에서 export

- [ ] **Step 1: 카탈로그 검사 테스트를 쓴다**

`packages/admin-server/src/audit/catalog-check.test.ts`:

```ts
import { coreAuditCatalog, defineAuditCatalog } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { findAuditProblems, type AuditDeclaration } from './catalog-check.js'

const ok: AuditDeclaration = {
  controller: 'SessionsController',
  method: 'revoke',
  options: { action: 'session.revoke', targetType: 'session' },
  isPublic: false,
}

describe('findAuditProblems', () => {
  it('카탈로그에 있으면 문제 없음', () => {
    expect(findAuditProblems([ok], coreAuditCatalog)).toEqual([])
  })

  it('🔴 모르는 액션 · 대상 종류 · @Public 을 Controller.method 로 모은다', () => {
    expect(
      findAuditProblems(
        [
          { ...ok, method: 'a', options: { action: 'nope.action' } },
          { ...ok, method: 'b', options: { action: 'session.revoke', targetType: 'nope' } },
          { ...ok, method: 'c', isPublic: true },
        ],
        coreAuditCatalog,
      ),
    ).toEqual([
      "SessionsController.a: 카탈로그에 없는 액션 'nope.action'",
      "SessionsController.b: 카탈로그에 없는 대상 종류 'nope'",
      'SessionsController.c: @Public 라우트의 @Audit 은 기록되지 않는다(주체가 없다)',
    ])
  })

  it('프로젝트 카탈로그의 액션은 통과', () => {
    const catalog = defineAuditCatalog({ actions: { X: 'probe.x' }, labels: { 'probe.x': 'x' } })
    expect(findAuditProblems([{ ...ok, options: { action: 'probe.x' } }], catalog)).toEqual([])
  })
})
```

- [ ] **Step 2: 모듈 기동 검사 테스트를 쓴다(DB 없음)**

`packages/admin-server/src/audit/audit.module.test.ts`:

```ts
import { Controller, Module, Post, type ModuleMetadata } from '@nestjs/common'
import { defineAuditCatalog } from '@ssworks/admin-shared'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import { Public, SelfOnly } from '../auth/decorators.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { ADMIN_AUTH_EVENTS } from '../tokens.js'
import { Audit } from './audit.decorator.js'
import { AdminAuditModule } from './audit.module.js'
import { AdminAuditEventSink } from './auth-events.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = {
  'sessions.read': 'org.users:read',
  'sessions.manage': 'org.users:write',
  'auditLogs.read': 'setting.auditLog:read',
}

@Controller('badaction')
class BadActionController {
  @SelfOnly()
  @Audit({ action: 'nope.action' })
  @Post()
  write() {
    return {}
  }
}

@Public()
@Controller('publicaudit')
class PublicAuditController {
  @Audit({ action: 'session.revoke' })
  @Post()
  write() {
    return {}
  }
}

@Controller('projectaudit')
class ProjectAuditController {
  @SelfOnly()
  @Audit({ action: 'probe.write' })
  @Post()
  write() {
    return {}
  }
}

@Module({ controllers: [BadActionController] })
class BadActionModule {}

@Module({ controllers: [PublicAuditController] })
class PublicAuditModule {}

@Module({ controllers: [ProjectAuditController] })
class ProjectAuditModule {}

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

describe('AdminAuditModule 배선', () => {
  it('뜨면 ADMIN_AUTH_EVENTS 가 sink 이고 조회 라우트는 쿠키 없이 401', async () => {
    const app = await boot([AdminAuthModule, AdminAuditModule])
    expect(app.get(ADMIN_AUTH_EVENTS, { strict: false })).toBeInstanceOf(AdminAuditEventSink)
    const response = await request(app.getHttpServer()).get('/admin/audit-logs')
    expect(response.status).toBe(401)
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다', async () => {
    await expect(boot([AdminAuditModule])).rejects.toThrow(
      'AdminAuditModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 auditLogs.read 슬롯이 없으면 뜨지 않는다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule], { permissions: { 'sessions.read': 'x' } }),
    ).rejects.toThrow('AdminAuditModule 의 권한 슬롯이 이어지지 않았다: auditLogs.read')
  })

  it('🔴 카탈로그에 없는 액션을 단 @Audit 이 있으면 뜨지 않는다 — 쓰는 쪽 컨트롤러까지 훑는다', async () => {
    await expect(boot([AdminAuthModule, AdminAuditModule, BadActionModule])).rejects.toThrow(
      "BadActionController.write: 카탈로그에 없는 액션 'nope.action'",
    )
  })

  it('🔴 @Public 라우트의 @Audit 은 뜨지 않는다(B11)', async () => {
    await expect(boot([AdminAuthModule, AdminAuditModule, PublicAuditModule])).rejects.toThrow(
      'PublicAuditController.write: @Public 라우트의 @Audit 은 기록되지 않는다',
    )
  })

  it('프로젝트 카탈로그를 넘기면 그 액션으로 뜬다', async () => {
    const catalog = defineAuditCatalog({
      actions: { PROBE_WRITE: 'probe.write' },
      labels: { 'probe.write': '프로브' },
    })
    await expect(
      boot([AdminAuthModule, AdminAuditModule, ProjectAuditModule], { audit: { catalog } }),
    ).resolves.toBeDefined()
  })
})
```

- [ ] **Step 3: 감사 조회 서비스 DB 테스트를 쓴다**

`packages/admin-server/src/audit/audit-logs.service.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes, adminAuditLogQuerySchema } from '@ssworks/admin-shared'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AUDIT_MESSAGES } from './errors.js'
import { AdminAuditLogsService } from './audit-logs.service.js'

let t: TestDatabase
let service: AdminAuditLogsService
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminAuditLogsService(t.db)
  roleNo = await seedRole(t.db)
})

afterAll(async () => {
  await t?.drop()
})

/** 시각을 정해 넣는다 — 테이블 타입은 createAt 넣기를 막으므로(append-only) 원문 SQL 로 */
async function row(input: {
  actorUserNo: bigint | null
  action: string
  createAt: Date
  targetType?: string | null
  targetRefNo?: bigint | null
  meta?: string | null
}): Promise<void> {
  await sql`
    insert into audit_logs
      (actor_user_no, session_no, action, target_type, target_ref_no, method, path, status_code, error_code, ip, user_agent, meta, create_at)
    values
      (${input.actorUserNo}, ${null}, ${input.action}, ${input.targetType ?? null}, ${input.targetRefNo ?? null},
       ${'POST'}, ${'/x'}, ${200}, ${null}, ${null}, ${null}, ${input.meta ?? null}, ${input.createAt})
  `.execute(t.db)
}

const query = (raw: unknown) => adminAuditLogQuerySchema.parse(raw)
const at = (iso: string) => new Date(iso)

describe('AdminAuditLogsService.list', () => {
  it('액션 접두(기본) · 정확 일치 — 접두의 _ 는 글자 그대로', async () => {
    const user = await seedUser(t.db, { roleNo })
    for (const action of [
      'session.revoke',
      'session.revoke.user',
      'session.revoke.self',
      'session.revoke.others',
      'sessionxrevoke',
      'a_b.x',
      'aXb.x',
    ]) {
      await row({ actorUserNo: user.userNo, action, createAt: at('2026-10-01T00:00:00.000Z') })
    }
    const actions = async (filter: Record<string, unknown>) =>
      (await service.list(query({ filter: { actorUserNo: String(user.userNo), ...filter } }))).items
        .map((item) => item.action)
        .sort()

    expect(await actions({ action: 'session.revoke' })).toEqual([
      'session.revoke',
      'session.revoke.others',
      'session.revoke.self',
      'session.revoke.user',
    ])
    expect(await actions({ action: 'session.revoke', actionMatch: 'exact' })).toEqual([
      'session.revoke',
    ])
    expect(await actions({ action: 'a_b' })).toEqual(['a_b.x'])
  })

  it('🔴 기간은 [from, to) 반열림 — 끝 시각의 행은 빠진다', async () => {
    const user = await seedUser(t.db, { roleNo })
    for (const iso of [
      '2026-10-01T23:59:59.000Z',
      '2026-10-02T00:00:00.000Z',
      '2026-10-02T23:59:59.000Z',
      '2026-10-03T00:00:00.000Z',
    ]) {
      await row({ actorUserNo: user.userNo, action: 'period.check', createAt: at(iso) })
    }
    const result = await service.list(
      query({
        sortOrder: 'asc',
        filter: {
          actorUserNo: String(user.userNo),
          from: '2026-10-02T00:00:00.000Z',
          to: '2026-10-03T00:00:00.000Z',
        },
      }),
    )
    expect(result.items.map((item) => item.createAt.toISOString())).toEqual([
      '2026-10-02T00:00:00.000Z',
      '2026-10-02T23:59:59.000Z',
    ])
    expect(result.total).toBe(2n)
  })

  it('🔴 거꾸로 · 같은 기간은 400 + issues[filter.to](B14)', async () => {
    for (const to of ['2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z']) {
      const error = await service
        .list(query({ filter: { from: '2026-10-02T00:00:00.000Z', to } }))
        .catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(BusinessError)
      expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect((error as BusinessError).details).toEqual({
        issues: [{ path: ['filter', 'to'], code: 'custom', message: AUDIT_MESSAGES.periodOrder }],
      })
    }
  })

  it('행위자 아이디 · 이름 JOIN, 행위자 없음은 null, meta 는 파싱된 값', async () => {
    const user = await seedUser(t.db, { roleNo, userName: '감사대상' })
    await row({
      actorUserNo: user.userNo,
      action: 'join.check',
      createAt: at('2026-10-05T00:00:00.000Z'),
      meta: '{"revokedCount":"3"}',
    })
    await row({ actorUserNo: null, action: 'join.check', createAt: at('2026-10-05T00:00:01.000Z') })
    const result = await service.list(query({ filter: { action: 'join.check' } }))
    expect(result.items.map((item) => [item.actorUserId, item.actorUserName, item.meta])).toEqual([
      [null, null, null],
      [user.userId, '감사대상', { revokedCount: '3' }],
    ])
  })

  it('대상 필터 · 최신순(같은 시각은 logNo 내림차순) · 페이지', async () => {
    const user = await seedUser(t.db, { roleNo })
    const same = at('2026-10-06T00:00:00.000Z')
    for (let i = 0; i < 3; i += 1) {
      await row({
        actorUserNo: user.userNo,
        action: 'page.check',
        createAt: same,
        targetType: 'session',
        targetRefNo: 77n,
      })
    }
    await row({
      actorUserNo: user.userNo,
      action: 'page.check',
      createAt: same,
      targetType: 'user',
      targetRefNo: 77n,
    })
    const first = await service.list(
      query({ page: '1', itemsPerPage: '2', filter: { targetType: 'session', targetRefNo: '77' } }),
    )
    const second = await service.list(
      query({ page: '2', itemsPerPage: '2', filter: { targetType: 'session', targetRefNo: '77' } }),
    )
    expect(first.total).toBe(3n)
    expect(first.items).toHaveLength(2)
    expect(second.items).toHaveLength(1)
    const logNos = [...first.items, ...second.items].map((item) => item.logNo)
    expect(logNos).toEqual([...logNos].sort((a, b) => (a > b ? -1 : 1)))
  })
})
```

- [ ] **Step 4: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/audit/catalog-check.test.ts src/audit/audit.module.test.ts`
Expected: FAIL — `./catalog-check.js` · `./audit.module.js` 를 찾지 못한다.

- [ ] **Step 5: 구현한다**

`packages/admin-server/src/audit/errors.ts`:

```ts
// 감사 조회 문구 — 서비스 · 테스트가 이 표 하나를 본다(2c 스펙 §6).

export const AUDIT_MESSAGES = {
  periodOrder: '끝 시각은 시작 시각보다 뒤여야 합니다.',
} as const
```

`packages/admin-server/src/audit/audit-logs.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { toListQuery, type AdminAuditLogQuery, type Paginated } from '@ssworks/admin-shared'
import { sql, type Kysely, type SqlBool } from 'kysely'
import { readJsonColumn } from '../database/json.js'
import { likePrefix } from '../database/like.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { validationError } from '../http/validation.js'
import { KYSELY } from '../tokens.js'
import { AUDIT_MESSAGES } from './errors.js'

// 정본: hangang-home apps/api/src/modules/audit-logs/audit-logs.service.ts(필터 · 반열림 · actionMatch · LEFT JOIN)
// 바꾼 점: 행위자 컬럼 actorUserNo(2c 스펙 B5), 응답에 actionLabel 을 싣지 않는다 — 화면이 admin-shared 카탈로그의 labelOf
//   로 읽는다. 기간 순서는 여기서 본다(스키마에 refine 을 걸지 않는다 — B14). 읽기 마스킹(hangang maskCiphertext)은 없다 —
//   모든 meta 가 쓸 때 소독된다.

export interface AdminAuditLogRow {
  logNo: bigint
  actorUserNo: bigint | null
  actorUserId: string | null
  actorUserName: string | null
  sessionNo: bigint | null
  action: string
  targetType: string | null
  targetRefNo: bigint | null
  method: string
  path: string
  statusCode: number
  errorCode: string | null
  ip: string | null
  userAgent: string | null
  meta: unknown
  createAt: Date
}

@Injectable()
export class AdminAuditLogsService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  async list(query: AdminAuditLogQuery): Promise<Paginated<AdminAuditLogRow>> {
    const filter = query.filter ?? {}
    if (
      filter.from !== undefined &&
      filter.to !== undefined &&
      Date.parse(filter.from) >= Date.parse(filter.to)
    ) {
      throw validationError([
        { path: ['filter', 'to'], code: 'custom', message: AUDIT_MESSAGES.periodOrder },
      ])
    }
    const { offset, limit, sort } = toListQuery(query)
    const order = sort[0]?.order ?? 'desc'

    return runQuery(async () => {
      let base = this.db
        .selectFrom('auditLogs as a')
        .leftJoin('users as u', 'u.userNo', 'a.actorUserNo')
      if (filter.actorUserNo !== undefined)
        base = base.where('a.actorUserNo', '=', filter.actorUserNo)
      if (filter.action !== undefined) {
        base =
          filter.actionMatch === 'exact'
            ? base.where('a.action', '=', filter.action)
            : // 🔴 접두 — session.revoke 는 .user · .self · .others 도 잡는다. 정확히 하나만 보려면 actionMatch: 'exact'.
              base.where(
                sql<SqlBool>`${sql.ref('a.action')} like ${likePrefix(filter.action)} escape '!'`,
              )
      }
      if (filter.targetType !== undefined) base = base.where('a.targetType', '=', filter.targetType)
      if (filter.targetRefNo !== undefined)
        base = base.where('a.targetRefNo', '=', filter.targetRefNo)
      if (filter.from !== undefined) base = base.where('a.createAt', '>=', new Date(filter.from))
      // 🔴 반열림 — `<=` 는 화면이 보낸 "다음 날 0시" 를 포함하거나, 날짜만 보내면 마지막 날을 통째로 뺐다(hangang).
      if (filter.to !== undefined) base = base.where('a.createAt', '<', new Date(filter.to))

      const counted = await base
        .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
        .executeTakeFirstOrThrow()
      const rows = await base
        .select([
          'a.logNo',
          'a.actorUserNo',
          'u.userId as actorUserId',
          'u.userName as actorUserName',
          'a.sessionNo',
          'a.action',
          'a.targetType',
          'a.targetRefNo',
          'a.method',
          'a.path',
          'a.statusCode',
          'a.errorCode',
          'a.ip',
          'a.userAgent',
          'a.meta',
          'a.createAt',
        ])
        .orderBy('a.createAt', order)
        .orderBy('a.logNo', order)
        .limit(limit)
        .offset(offset)
        .execute()

      return {
        items: rows.map((row) => ({ ...row, meta: readJsonColumn(row.meta) })),
        total: BigInt(counted.n),
        page: query.page,
        itemsPerPage: query.itemsPerPage,
      }
    })
  }
}
```

`packages/admin-server/src/audit/audit-logs.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common'
import { adminAuditLogQuerySchema, type AdminAuditLogQuery } from '@ssworks/admin-shared'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { AdminAuditLogsService } from './audit-logs.service.js'

// 정본: hangang-home apps/api/src/modules/audit-logs/audit-logs.controller.ts
// 바꾼 점: 권한은 슬롯 auditLogs.read(2c 스펙 ① P1). 🔴 @Audit 을 붙이지 않는다 — 조회 화면을 여는 것이 로그를 채운다.

@Controller('audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly logs: AdminAuditLogsService) {}

  @RequirePermissionSlot('auditLogs.read')
  @Get()
  list(@Query(new ZodValidationPipe(adminAuditLogQuerySchema)) query: AdminAuditLogQuery) {
    return this.logs.list(query)
  }
}
```

`packages/admin-server/src/audit/catalog-check.ts`:

```ts
import type { Type } from '@nestjs/common'
import { MetadataScanner, type DiscoveryService, type Reflector } from '@nestjs/core'
import type { AuditCatalog } from '@ssworks/admin-shared'
import { AUDIT_META, IS_PUBLIC } from '../tokens.js'
import type { AuditOptions } from './audit.decorator.js'

// 정본: kim5257-crm-v5 apps/global/backend/src/core/decorators/audit-action-catalog.spec.ts(소스를 훑는 드리프트 검사 —
//       라벨에서 39개가 조용히 빠졌다) + hangang route-audit.test.ts(@Public 라우트에 @Audit 금지)
// 바꾼 점: 테스트가 아니라 기동 검사다 — 쓰는 쪽 컨트롤러까지 Nest 가 실제로 등록한 것을 훑는다(2c 스펙 §5-8, §14 R1-3 실측).

export interface AuditDeclaration {
  controller: string
  method: string
  options: AuditOptions
  isPublic: boolean
}

/** 앱의 모든 컨트롤러 메서드에서 `@Audit` 선언을 모은다(메서드 → 클래스 순으로 읽는다 — 인터셉터와 같다) */
export function collectAuditDeclarations(
  discovery: DiscoveryService,
  reflector: Reflector,
): AuditDeclaration[] {
  const scanner = new MetadataScanner()
  const found: AuditDeclaration[] = []
  for (const wrapper of discovery.getControllers()) {
    const metatype = wrapper.metatype as Type | null | undefined
    const instance = wrapper.instance as object | null | undefined
    if (metatype == null || instance == null) continue
    const prototype = Object.getPrototypeOf(instance) as object
    for (const method of scanner.getAllMethodNames(prototype)) {
      const handler: unknown = (prototype as Record<string, unknown>)[method]
      if (typeof handler !== 'function') continue
      const targets = [handler, metatype]
      const options = reflector.getAllAndOverride<AuditOptions | undefined>(AUDIT_META, targets)
      if (options == null) continue
      const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets) === true
      found.push({ controller: metatype.name, method, options, isPublic })
    }
  }
  return found
}

/** 순수 판정 — 카탈로그에 없는 액션 · 대상 종류, 기록되지 않을 @Public 선언 */
export function findAuditProblems(
  declarations: readonly AuditDeclaration[],
  catalog: AuditCatalog,
): string[] {
  const problems: string[] = []
  for (const { controller, method, options, isPublic } of declarations) {
    const where = `${controller}.${method}`
    if (!catalog.isAuditAction(options.action)) {
      problems.push(`${where}: 카탈로그에 없는 액션 '${options.action}'`)
    }
    if (options.targetType !== undefined && !catalog.isAuditTarget(options.targetType)) {
      problems.push(`${where}: 카탈로그에 없는 대상 종류 '${options.targetType}'`)
    }
    if (isPublic) {
      problems.push(`${where}: @Public 라우트의 @Audit 은 기록되지 않는다(주체가 없다)`)
    }
  }
  return problems
}
```

`targets` 배열의 타입은 `Reflector.getAllAndOverride` 가 받는 `(Type | Function)[]` 다 — `handler` 는 `typeof handler === 'function'` 으로 좁혀졌다. 타입 검사가 `unknown` 을 거부하면 `const targets = [handler as (...args: unknown[]) => unknown, metatype]` 로 쓴다.

`packages/admin-server/src/audit/audit.module.ts`:

```ts
import {
  Global,
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common'
import {
  APP_INTERCEPTOR,
  DiscoveryModule,
  DiscoveryService,
  ModulesContainer,
  Reflector,
} from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_AUDIT_CONFIG, ADMIN_AUTH_EVENTS, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminAuditLogsController } from './audit-logs.controller.js'
import { AdminAuditLogsService } from './audit-logs.service.js'
import { AdminAuditInterceptor } from './audit.interceptor.js'
import { AdminAuditService } from './audit.service.js'
import { AdminAuditEventSink } from './auth-events.js'
import { collectAuditDeclarations, findAuditProblems } from './catalog-check.js'
import { resolveAuditConfig, type ResolvedAuditConfig } from './options.js'

// 정본: hangang-home apps/api/src/core/audit/audit.module.ts(@Global · APP_INTERCEPTOR) + modules/audit-logs(조회)
// 바꾼 점: 기록 · 조회를 한 모듈로(2c 스펙 ⑩ MD1). 인증 이벤트 sink 를 ADMIN_AUTH_EVENTS 로 낸다(2b 자리). 기동에서 인증
//   모듈 · 권한 슬롯 · 카탈로그 · @Public 선언을 본다(§5-8).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 전역이다 — AdminAuthService 의 @Optional() ADMIN_AUTH_EVENTS 주입이 import 순서와 상관없이 sink 를 받는다(§14 R1-2).

@Global()
@Module({
  imports: [DiscoveryModule],
  controllers: [AdminAuditLogsController],
  providers: [
    {
      provide: ADMIN_AUDIT_CONFIG,
      useFactory: (options: AdminServerOptions): ResolvedAuditConfig =>
        resolveAuditConfig(options.audit),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminAuditService,
    AdminAuditLogsService,
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
    { provide: ADMIN_AUTH_EVENTS, useClass: AdminAuditEventSink },
  ],
  exports: [ADMIN_AUTH_EVENTS],
})
export class AdminAuditModule implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly modules: ModulesContainer,
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
    @Inject(ADMIN_AUDIT_CONFIG) private readonly config: ResolvedAuditConfig,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminAuditModule')
    assertPermissionSlots(this.options.permissions, ['auditLogs.read'], 'AdminAuditModule')
  }

  /** 🔴 모든 모듈이 컨트롤러를 등록한 뒤라야 쓰는 쪽 컨트롤러까지 훑는다 — onModuleInit 이 아니라 여기다 */
  onApplicationBootstrap(): void {
    const problems = findAuditProblems(
      collectAuditDeclarations(this.discovery, this.reflector),
      this.config.catalog,
    )
    if (problems.length > 0) {
      throw new Error(
        `@Audit 선언이 맞지 않는다 — ${problems.join(' / ')}. 프로젝트 액션은 admin-shared defineAuditCatalog 로 정의해 AdminServerModule 옵션 audit.catalog 로 넘긴다.`,
      )
    }
  }
}
```

`packages/admin-server/src/admin-server.module.ts`:

- import 에 `import { AdminAuditModule } from './audit/audit.module.js'` 를 더한다.
- `const ADMIN_ROUTE_MODULES: readonly Type[] = [AdminAuthModule]` 를 `[AdminAuthModule, AdminAuditModule]` 로 바꾼다.

`packages/admin-server/src/index.ts` — 세션 · 감사 블록에 더한다:

```ts
export { AdminAuditModule } from './audit/audit.module.js'
```

- [ ] **Step 6: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/audit`
Expected: PASS — 카탈로그 검사 · 기동 검사 여섯.

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/audit`
Expected: PASS — 접두 · 정확 · 반열림 · 거꾸로 400 · JOIN · 페이지.

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint`
Expected: 오류 없음.

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-server/src/audit packages/admin-server/src/admin-server.module.ts packages/admin-server/src/index.ts
git commit -m "feat(admin-server): 감사 조회 · 카탈로그 기동 검사 · AdminAuditModule" -m "GET /admin/audit-logs(슬롯 auditLogs.read — 행위자 · 액션 접두/정확 · 대상 · [from, to)). 전역 모듈이 인터셉터와 ADMIN_AUTH_EVENTS sink 를 내고, 인증 모듈 · 슬롯 · 카탈로그 · @Public 선언을 기동에서 본다(2c 스펙 §5-8)." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: `AdminSessionStore` — 목록 · 조건부 폐기 · `liveOnly`

**Files:**

- Modify: `packages/admin-server/src/auth/session.store.ts`
- Modify: `packages/admin-server/src/auth/session.store.db.test.ts`

**Interfaces:**

- Consumes: Task 3 `likeContains`, admin-shared `SortCondition`
- Produces(전부 `session.store.ts` 에서 export — index 에는 내지 않는다):
  - `type AdminSessionSortColumn = 'lastAccessAt' | 'loginAt' | 'expireAt'`
  - `interface AdminSessionMeta { sessionNo: bigint; userAgent: string | null; ipAddress: string | null; loginAt: Date; lastAccessAt: Date; expireAt: Date }`
  - `interface AdminSessionListRow extends AdminSessionMeta { userNo: bigint; userId: string; userName: string }`
  - `interface LiveSessionQuery { now: Date; keyword?: string; userNo?: bigint; sort: readonly SortCondition<AdminSessionSortColumn>[]; offset: number; limit: number }`
  - `listLive(query: LiveSessionQuery): Promise<{ rows: AdminSessionListRow[]; total: bigint }>`
  - `listLiveOfUser(userNo: bigint, now: Date): Promise<AdminSessionMeta[]>`
  - `revokeLive(sessionNo: bigint, now: Date, options?: { userNo?: bigint }): Promise<number>` — 사유 `'terminated'`
  - `revokeAllOfUser(userNo, reason, now, options: { exceptSessionNo?; trx?; liveOnly?: boolean })` — `liveOnly` 를 더한다

- [ ] **Step 1: 실패하는 DB 테스트를 쓴다**

`packages/admin-server/src/auth/session.store.db.test.ts` — 파일 끝에 더한다(같은 파일의 `input` · `second` · `store` · `roleNo` 를 쓴다):

```ts
const DESC = [{ column: 'lastAccessAt', order: 'desc' }] as const

describe('listLive(2c 스펙 §5-6)', () => {
  it('🔴 살아 있는 행만 — 폐기 · 만료 · expireAt 이 지금과 같은 행은 빠진다(Review Focus 4)', async () => {
    const user = await seedUser(t.db, { roleNo, userId: 'live-only' })
    const now = second(new Date())
    const live = await store.create(input(user.userNo))
    const revoked = await store.create(input(user.userNo))
    await store.revoke(revoked, 'terminated', now)
    await store.create(input(user.userNo, { expireAt: new Date(now.getTime() - 1000) }))
    await store.create(input(user.userNo, { expireAt: now }))

    const { rows, total } = await store.listLive({
      now,
      userNo: user.userNo,
      sort: DESC,
      offset: 0,
      limit: 20,
    })
    expect(rows.map((row) => row.sessionNo)).toEqual([live])
    expect(total).toBe(1n)
    expect(rows[0]).toMatchObject({
      userNo: user.userNo,
      userId: 'live-only',
      userAgent: 'UA/1',
      ipAddress: '10.0.0.1',
    })
    // 🔴 refresh 토큰 해시는 어느 목록에도 나가지 않는다(hangang)
    expect(rows[0]).not.toHaveProperty('refreshTokenHash')
  })

  it('🔴 검색어 — 아이디 · 이름 부분일치, % _ ! 는 글자 그대로, 대소문자 무시(Review Focus 2)', async () => {
    const now = second(new Date())
    for (const [userId, userName] of [
      ['kw%1', '가'],
      ['kwx1', '나'],
      ['kw_1', '다'],
      ['kwy1', '라'],
      ['kw!1', '마'],
      ['KWZ9', '홍길동'],
    ] as const) {
      const user = await seedUser(t.db, { roleNo, userId, userName })
      await store.create(input(user.userNo))
    }
    const ids = async (keyword: string) =>
      (await store.listLive({ now, keyword, sort: DESC, offset: 0, limit: 100 })).rows
        .map((row) => row.userId)
        .sort()

    expect(await ids('%')).toEqual(['kw%1'])
    expect(await ids('_')).toEqual(['kw_1'])
    expect(await ids('!')).toEqual(['kw!1'])
    expect(await ids('kwz')).toEqual(['KWZ9'])
    expect(await ids('길동')).toEqual(['KWZ9'])
  })

  it('정렬 · 같은 값은 sessionNo 내림차순 · 쪽 · 전체 개수', async () => {
    const user = await seedUser(t.db, { roleNo })
    const base = second(new Date())
    const earlier = new Date(base.getTime() - 60_000)
    const older = await store.create(input(user.userNo, { now: earlier, loginAt: earlier }))
    const tieA = await store.create(input(user.userNo, { now: base }))
    const tieB = await store.create(input(user.userNo, { now: base }))
    const list = (order: 'asc' | 'desc', offset = 0, limit = 10) =>
      store.listLive({
        now: base,
        userNo: user.userNo,
        sort: [{ column: 'lastAccessAt', order }],
        offset,
        limit,
      })

    expect((await list('desc')).rows.map((row) => row.sessionNo)).toEqual([tieB, tieA, older])
    expect((await list('asc')).rows.map((row) => row.sessionNo)).toEqual([older, tieB, tieA])
    const page = await list('desc', 1, 1)
    expect(page.rows.map((row) => row.sessionNo)).toEqual([tieA])
    expect(page.total).toBe(3n)
  })
})

describe('listLiveOfUser', () => {
  it('그 사용자의 살아 있는 행만, 마지막 활동 내림차순', async () => {
    const me = await seedUser(t.db, { roleNo })
    const other = await seedUser(t.db, { roleNo })
    const now = second(new Date())
    const a = await store.create(input(me.userNo, { now: new Date(now.getTime() - 1000) }))
    const b = await store.create(input(me.userNo, { now }))
    await store.create(input(other.userNo))
    const dead = await store.create(input(me.userNo))
    await store.revoke(dead, 'terminated', now)

    expect((await store.listLiveOfUser(me.userNo, now)).map((row) => row.sessionNo)).toEqual([b, a])
  })
})

describe('revokeLive', () => {
  it('🔴 살아 있는 행만 terminated 로 — 남의 것 · 두 번째 · 만료는 0', async () => {
    const me = await seedUser(t.db, { roleNo })
    const other = await seedUser(t.db, { roleNo })
    const now = second(new Date())
    const mine = await store.create(input(me.userNo))

    expect(await store.revokeLive(mine, now, { userNo: other.userNo })).toBe(0)
    expect(await store.revokeLive(mine, now, { userNo: me.userNo })).toBe(1)
    expect(await store.revokeLive(mine, now)).toBe(0)
    expect(await store.findByNo(mine)).toMatchObject({
      isRevoked: true,
      revokedReason: 'terminated',
      revokedAt: now,
    })

    const expired = await store.create(input(me.userNo, { expireAt: now }))
    expect(await store.revokeLive(expired, now)).toBe(0)
    expect((await store.findByNo(expired))?.isRevoked).toBe(false)
  })
})

describe('revokeAllOfUser — liveOnly(2c 스펙 B9)', () => {
  it('만료된 행은 세지도 바꾸지도 않고 exceptSessionNo 는 남긴다', async () => {
    const me = await seedUser(t.db, { roleNo })
    const now = second(new Date())
    const keep = await store.create(input(me.userNo))
    const other = await store.create(input(me.userNo))
    const expired = await store.create(
      input(me.userNo, { expireAt: new Date(now.getTime() - 1000) }),
    )

    expect(
      await store.revokeAllOfUser(me.userNo, 'terminated', now, {
        exceptSessionNo: keep,
        liveOnly: true,
      }),
    ).toBe(1)
    expect((await store.findByNo(other))?.revokedReason).toBe('terminated')
    expect((await store.findByNo(keep))?.isRevoked).toBe(false)
    expect((await store.findByNo(expired))?.isRevoked).toBe(false)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth/session.store.db.test.ts`
Expected: FAIL — `store.listLive is not a function` 등. 기존 테스트는 통과한다.

- [ ] **Step 3: 저장소에 메서드를 더한다**

`packages/admin-server/src/auth/session.store.ts`:

- import 를 바꾼다:

```ts
import { Inject, Injectable } from '@nestjs/common'
import type { SortCondition } from '@ssworks/admin-shared'
import { sql, type Kysely, type SqlBool, type Transaction } from 'kysely'
import { likeContains } from '../database/like.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase, AdminSessionRevokeReason } from '../database/types.js'
import { KYSELY } from '../tokens.js'
```

- 머리 주석의 `//  - 패키지 내부다(스펙 ⑤ A1) — 교체 대상이 아니다. 2c 가 목록 메서드를 더한다.` 를 이렇게 바꾼다:

```ts
//  - 패키지 내부다(스펙 ⑤ A1) — 교체 대상이 아니다. 2c 가 목록 · 조건부 폐기를 더했다(2c 스펙 §5-6) — gise
//    listLiveSessionsOfUser · revokeOwnOtherSessionsInTransaction + axion activeSessionsQuery(검색).
```

- `SESSION_COLUMNS` 다음에 타입 · 상수를 더한다:

```ts
export type AdminSessionSortColumn = 'lastAccessAt' | 'loginAt' | 'expireAt'

/** 목록 행 — 세션 라우트가 isCurrent 를 붙여 낸다. 🔴 refreshTokenHash 는 어느 목록 select 에도 없다(hangang) */
export interface AdminSessionMeta {
  sessionNo: bigint
  userAgent: string | null
  ipAddress: string | null
  loginAt: Date
  lastAccessAt: Date
  expireAt: Date
}

export interface AdminSessionListRow extends AdminSessionMeta {
  userNo: bigint
  userId: string
  userName: string
}

export interface LiveSessionQuery {
  now: Date
  /** 앞뒤 공백을 뗀 검색어 — 비었으면 넘기지 않는다(조건 없음) */
  keyword?: string
  userNo?: bigint
  sort: readonly SortCondition<AdminSessionSortColumn>[]
  offset: number
  limit: number
}

const META_COLUMNS = [
  's.sessionNo',
  's.userAgent',
  's.ipAddress',
  's.loginAt',
  's.lastAccessAt',
  's.expireAt',
] as const
```

- 클래스 끝(`revokeAllOfUser` 다음)에 메서드 셋을 더한다:

```ts
  /**
   * 살아 있는 세션 전체 목록(2c 스펙 §5-6) — 사용자 JOIN · 검색어 · 사용자 필터 · 정렬 · 쪽.
   * "살아 있음" = isRevoked = false AND expireAt > now. 🔴 코어 users 의 userId · userName 을 직접 JOIN 한다(2c 스펙 B4).
   */
  listLive(query: LiveSessionQuery): Promise<{ rows: AdminSessionListRow[]; total: bigint }> {
    return runQuery(async () => {
      let base = this.db
        .selectFrom('sessions as s')
        .innerJoin('users as u', 'u.userNo', 's.userNo')
        .where('s.isRevoked', '=', false)
        .where('s.expireAt', '>', query.now)
      if (query.keyword) {
        const pattern = likeContains(query.keyword)
        base = base.where((eb) =>
          eb.or([
            sql<SqlBool>`${sql.ref('u.userId')} like ${pattern} escape '!'`,
            sql<SqlBool>`${sql.ref('u.userName')} like ${pattern} escape '!'`,
          ]),
        )
      }
      if (query.userNo != null) base = base.where('s.userNo', '=', query.userNo)

      const counted = await base
        .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
        .executeTakeFirstOrThrow()
      let rows = base.select([...META_COLUMNS, 's.userNo', 'u.userId', 'u.userName'])
      for (const { column, order } of query.sort) rows = rows.orderBy(`s.${column}`, order)
      const result = await rows
        .orderBy('s.sessionNo', 'desc')
        .limit(query.limit)
        .offset(query.offset)
        .execute()
      return { rows: result, total: BigInt(counted.n) }
    })
  }

  /** 그 사용자의 살아 있는 세션 전량(3c §10 — 상한 없음), 마지막 활동 내림차순 */
  listLiveOfUser(userNo: bigint, now: Date): Promise<AdminSessionMeta[]> {
    return runQuery(() =>
      this.db
        .selectFrom('sessions as s')
        .select(META_COLUMNS)
        .where('s.userNo', '=', userNo)
        .where('s.isRevoked', '=', false)
        .where('s.expireAt', '>', now)
        .orderBy('s.lastAccessAt', 'desc')
        .orderBy('s.sessionNo', 'desc')
        .execute(),
    )
  }

  /**
   * 살아 있는 세션 하나를 'terminated' 로 끊는다(2c 세션 라우트). `userNo` 를 주면 그 사용자의 것만이다.
   * 🔴 조건부 UPDATE 한 문장이다 — 남의 · 없는 · 끝난 · 방금 회전한 세션이 모두 같은 0 이 된다(존재를 드러내지 않는다,
   *    2c 스펙 공통 3). 회전과 겹치면 InnoDB 잠금 읽기가 가른다.
   */
  async revokeLive(
    sessionNo: bigint,
    now: Date,
    options: { userNo?: bigint } = {},
  ): Promise<number> {
    const result = await runQuery(() => {
      let query = this.db
        .updateTable('sessions')
        .set({ isRevoked: true, revokedReason: 'terminated', revokedAt: now })
        .where('sessionNo', '=', sessionNo)
        .where('isRevoked', '=', false)
        .where('expireAt', '>', now)
      if (options.userNo != null) query = query.where('userNo', '=', options.userNo)
      return query.executeTakeFirst()
    })
    return Number(result.numUpdatedRows)
  }
```

- `revokeAllOfUser` 의 옵션 타입과 본문을 바꾼다 — 주석 한 줄과 `liveOnly`:

```ts
  /**
   * 🔴 그 사용자의 살아 있는 행만 바꾼다 — 'rotated' · 'terminated' 사유는 사후 분석 정보라 남긴다(hangang R34).
   * `liveOnly` 면 이미 만료된 행도 건드리지 않는다 — 세션 라우트의 끊은 개수에 죽은 행을 세지 않는다(2c 스펙 B9).
   */
  async revokeAllOfUser(
    userNo: bigint,
    reason: AdminSessionRevokeReason,
    now: Date,
    options: { exceptSessionNo?: bigint; trx?: Transaction<AdminDatabase>; liveOnly?: boolean } = {},
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
      if (options.liveOnly === true) query = query.where('expireAt', '>', now)
      return query.executeTakeFirst()
    }
    const result = options.trx ? await run(options.trx) : await runQuery(() => run(this.db))
    return Number(result.numUpdatedRows)
  }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/auth`
Expected: PASS — 새 describe 다섯과 2b 의 세션 · 인증 DB 테스트 전부(`revokeAllOfUser` 의 기존 호출부는 `liveOnly` 를 넘기지 않아 그대로다).

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint`
Expected: 오류 없음. 정렬 루프의 템플릿 문자열 열 이름을 타입 검사가 거부하면 `rows.orderBy(sql.ref('s.' + column), order)` 로 쓴다.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-server/src/auth/session.store.ts packages/admin-server/src/auth/session.store.db.test.ts
git commit -m "feat(admin-server): 세션 저장소 — 살아 있는 세션 목록 · 조건부 폐기 · liveOnly" -m "isRevoked = false AND expireAt > now 만, 검색어는 likeContains + escape '!'(글자 그대로 · 대소문자 무시), 정렬 동률은 sessionNo 내림차순. 끊기는 조건부 UPDATE 한 문장(남의 · 없는 · 끝난 세션이 같은 0)." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: 세션 모듈 — 문구 · 쿼리 · 서비스 · 컨트롤러 · `AdminSessionsModule`

**Files:**

- Create: `packages/admin-server/src/sessions/errors.ts`
- Create: `packages/admin-server/src/sessions/sessions.query.ts`
- Create: `packages/admin-server/src/sessions/sessions.query.test.ts`
- Create: `packages/admin-server/src/sessions/sessions.service.ts`
- Create: `packages/admin-server/src/sessions/sessions.service.test.ts`
- Create: `packages/admin-server/src/sessions/sessions.controller.ts`
- Create: `packages/admin-server/src/sessions/sessions.module.ts`
- Create: `packages/admin-server/src/sessions/sessions.module.test.ts`
- Modify: `packages/admin-server/src/admin-server.module.ts`
- Modify: `packages/admin-server/src/index.ts`

**Interfaces:**

- Consumes: Task 2 `queryBigIntSchema` · `CoreAuditActions` · `CoreAuditTargets`, Task 4 `RequirePermissionSlot` · `assertPermissionSlots` · `assertAuthModuleRegistered`, Task 6 `Audit` · `attachAuditTarget` · `attachAuditMeta`, Task 10 `AdminSessionStore` 의 새 메서드 · `AdminSessionMeta` · `AdminSessionListRow`, 2a `ZodValidationPipe` · `ParseBigIntPipe` · `runQuery`, 2b `CurrentAdmin` · `SelfOnly` · `AdminPrincipal`
- Produces:
  - `SESSION_MESSAGES = { currentSession, notFound, noUser }`
  - `SESSION_KEYWORD_MAX_LENGTH = 64` · `adminSessionListQuerySchema` · `type AdminSessionListQuery`
  - `class AdminSessionsService { list; listMine; revoke; revokeUser; revokeMine; revokeOthers }`
  - `class AdminSessionsController` — `@Controller('sessions')` 6라우트(2c 스펙 §4-6)
  - `class AdminSessionsModule` — index 에서 export

- [ ] **Step 1: 쿼리 · 서비스 테스트를 쓴다**

`packages/admin-server/src/sessions/sessions.query.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adminSessionListQuerySchema } from './sessions.query.js'

describe('adminSessionListQuerySchema', () => {
  it('기본은 lastAccessAt 내림차순 · 1쪽 · 20개', () => {
    expect(adminSessionListQuerySchema.parse({})).toEqual({
      page: 1,
      itemsPerPage: 20,
      sortBy: ['lastAccessAt'],
      sortOrder: ['desc'],
    })
  })

  it('🔴 공백뿐인 검색어는 빈 문자열이 된다 — 조건 없음(Review Focus 2)', () => {
    expect(adminSessionListQuerySchema.parse({ filter: { keyword: '   ' } }).filter).toEqual({
      keyword: '',
    })
    expect(adminSessionListQuerySchema.parse({ filter: { keyword: ' kim ' } }).filter).toEqual({
      keyword: 'kim',
    })
  })

  it('검색어 64자 초과 · 모르는 정렬 열 · 빈 userNo 는 거부', () => {
    expect(
      adminSessionListQuerySchema.safeParse({ filter: { keyword: 'x'.repeat(65) } }).success,
    ).toBe(false)
    expect(adminSessionListQuerySchema.safeParse({ sortBy: 'userName' }).success).toBe(false)
    expect(adminSessionListQuerySchema.safeParse({ filter: { userNo: '' } }).success).toBe(false)
    expect(adminSessionListQuerySchema.parse({ filter: { userNo: '7' } }).filter).toEqual({
      userNo: 7n,
    })
  })
})
```

`packages/admin-server/src/sessions/sessions.service.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { describe, expect, it } from 'vitest'
import type { AdminPrincipal } from '../auth/principal.js'
import type {
  AdminSessionListRow,
  AdminSessionMeta,
  AdminSessionStore,
  LiveSessionQuery,
} from '../auth/session.store.js'
import type { AdminDatabase } from '../database/types.js'
import { SESSION_MESSAGES } from './errors.js'
import { adminSessionListQuerySchema } from './sessions.query.js'
import { AdminSessionsService } from './sessions.service.js'

const principal: AdminPrincipal = {
  userNo: 3n,
  sessionNo: 9n,
  userId: 'admin',
  userName: '관리자',
  roleNo: 1n,
  roleName: '역할',
  teamNo: null,
  teamName: null,
  permissions: ['*'],
  isPasswordChangeRequired: false,
}

function meta(sessionNo: bigint): AdminSessionMeta {
  const at = new Date('2026-10-14T00:00:00.000Z')
  return {
    sessionNo,
    userAgent: 'UA',
    ipAddress: null,
    loginAt: at,
    lastAccessAt: at,
    expireAt: at,
  }
}

class FakeStore {
  revokeLiveCalls: { sessionNo: bigint; options: { userNo?: bigint } }[] = []
  revokeAllCalls: { userNo: bigint; reason: string; options: unknown }[] = []
  liveCount = 1
  lastQuery: LiveSessionQuery | null = null

  async revokeLive(sessionNo: bigint, _now: Date, options: { userNo?: bigint } = {}) {
    this.revokeLiveCalls.push({ sessionNo, options })
    return this.liveCount
  }

  async revokeAllOfUser(userNo: bigint, reason: string, _now: Date, options: unknown) {
    this.revokeAllCalls.push({ userNo, reason, options })
    return 2
  }

  async listLive(query: LiveSessionQuery) {
    this.lastQuery = query
    const rows: AdminSessionListRow[] = [9n, 10n].map((no) => ({
      ...meta(no),
      userNo: 3n,
      userId: 'admin',
      userName: '관리자',
    }))
    return { rows, total: 2n }
  }

  async listLiveOfUser() {
    return [meta(9n), meta(10n)]
  }
}

function service(store: FakeStore): AdminSessionsService {
  return new AdminSessionsService(
    store as unknown as AdminSessionStore,
    undefined as unknown as Kysely<AdminDatabase>,
  )
}

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error('BusinessError 가 아니다')
}

describe('AdminSessionsService', () => {
  it('🔴 지금 세션이면 UPDATE 를 보내지 않고 400 — 관리자 하나 · 내 세션 하나 둘 다', async () => {
    const store = new FakeStore()
    for (const run of [
      () => service(store).revoke(9n, principal),
      () => service(store).revokeMine(9n, principal),
    ]) {
      const error = await rejection(run)
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
      expect(error.message).toBe(SESSION_MESSAGES.currentSession)
    }
    expect(store.revokeLiveCalls).toEqual([])
  })

  it('🔴 0행이면 같은 404 — 내 세션 하나는 내 userNo 로만 끊는다', async () => {
    const store = new FakeStore()
    store.liveCount = 0
    const admin = await rejection(() => service(store).revoke(11n, principal))
    const mine = await rejection(() => service(store).revokeMine(11n, principal))
    for (const error of [admin, mine]) {
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_NOT_FOUND)
      expect(error.message).toBe(SESSION_MESSAGES.notFound)
    }
    expect(store.revokeLiveCalls).toEqual([
      { sessionNo: 11n, options: {} },
      { sessionNo: 11n, options: { userNo: 3n } },
    ])
  })

  it('다른 세션 모두는 지금 세션을 빼고 살아 있는 것만 terminated 로', async () => {
    const store = new FakeStore()
    expect(await service(store).revokeOthers(principal)).toBe(2)
    expect(store.revokeAllCalls).toEqual([
      { userNo: 3n, reason: 'terminated', options: { exceptSessionNo: 9n, liveOnly: true } },
    ])
  })

  it('목록 — isCurrent 는 주체의 세션만, 빈 검색어는 넘기지 않는다', async () => {
    const store = new FakeStore()
    const result = await service(store).list(
      adminSessionListQuerySchema.parse({
        page: '2',
        itemsPerPage: '5',
        filter: { keyword: ' ', userNo: '3' },
      }),
      principal,
    )
    expect(result.items.map((item) => [item.sessionNo, item.isCurrent])).toEqual([
      [9n, true],
      [10n, false],
    ])
    expect(result).toMatchObject({ total: 2n, page: 2, itemsPerPage: 5 })
    expect(store.lastQuery).toMatchObject({
      userNo: 3n,
      offset: 5,
      limit: 5,
      sort: [{ column: 'lastAccessAt', order: 'desc' }],
    })
    expect(store.lastQuery).not.toHaveProperty('keyword')
  })

  it('내 세션 — 전량에 isCurrent', async () => {
    const result = await service(new FakeStore()).listMine(principal)
    expect(result.items.map((item) => item.isCurrent)).toEqual([true, false])
  })
})
```

- [ ] **Step 2: 모듈 기동 테스트를 쓴다(DB 없음)**

`packages/admin-server/src/sessions/sessions.module.test.ts`:

```ts
import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { AdminSessionsModule } from './sessions.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = {
  'sessions.read': 'org.users:read',
  'sessions.manage': 'org.users:write',
  'auditLogs.read': 'setting.auditLog:read',
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

describe('AdminSessionsModule 배선', () => {
  it('뜨면 여섯 라우트가 /admin/sessions 아래에 있고 쿠키 없이는 401', async () => {
    const app = await boot([AdminAuthModule, AdminSessionsModule])
    const server = app.getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/sessions'],
      ['get', '/admin/sessions/me'],
      ['delete', '/admin/sessions/1'],
      ['delete', '/admin/sessions/user/1'],
      ['delete', '/admin/sessions/me/1'],
      ['post', '/admin/sessions/me/revoke-others'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로(2c 스펙 §14 R2)', async () => {
    await expect(boot([AdminSessionsModule])).rejects.toThrow(
      'AdminSessionsModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminSessionsModule], { permissions: { 'auditLogs.read': 'x' } }),
    ).rejects.toThrow(
      'AdminSessionsModule 의 권한 슬롯이 이어지지 않았다: sessions.read, sessions.manage',
    )
  })

  it('감사 모듈과 함께 뜬다 — 세션 라우트의 @Audit 이 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminSessionsModule]),
    ).resolves.toBeDefined()
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/sessions`
Expected: FAIL — `./sessions.query.js` 등을 찾지 못한다.

- [ ] **Step 4: 구현한다**

`packages/admin-server/src/sessions/errors.ts`:

```ts
// 세션 라우트 문구 — 서비스 · 테스트가 이 표 하나를 본다(2c 스펙 §6). 코드 · 상태는 admin-shared 코어 표.

export const SESSION_MESSAGES = {
  currentSession: '지금 쓰는 세션은 여기서 끝낼 수 없습니다. 로그아웃을 쓰세요.',
  notFound: '세션을 찾을 수 없습니다. 이미 끝났거나 갱신됐을 수 있습니다.',
  noUser: '사용자를 찾을 수 없습니다.',
} as const
```

`packages/admin-server/src/sessions/sessions.query.ts`:

```ts
import { createQuerySchema, queryBigIntSchema } from '@ssworks/admin-shared'
import { z } from 'zod'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.dto.ts(정렬 열 · userNo 필터) + axion 검색어
// 바꾼 점: 서버 내부 스키마다 — admin-ui useSessions 는 어댑터라 이 스키마를 읽지 않는다(2c 스펙 §4-6). 폐기 행 필터
//   (hangang isRevoked)는 없다 — 목록은 살아 있는 세션만이다(공통 1).

export const SESSION_KEYWORD_MAX_LENGTH = 64

export const adminSessionListQuerySchema = createQuerySchema({
  sortableColumns: ['lastAccessAt', 'loginAt', 'expireAt'] as const,
  defaultSortColumn: 'lastAccessAt',
  filterShape: {
    /** 아이디 · 이름 부분일치. 앞뒤 공백을 떼고, 비면 조건 없음 */
    keyword: z.string().trim().max(SESSION_KEYWORD_MAX_LENGTH),
    /** 한 사용자의 세션만 — 사용자 상세 화면(2c 스펙 B3) */
    userNo: queryBigIntSchema,
  },
})

export type AdminSessionListQuery = z.infer<typeof adminSessionListQuerySchema>
```

`packages/admin-server/src/sessions/sessions.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { BusinessError, CommonErrorCodes, toListQuery, type Paginated } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminPrincipal } from '../auth/principal.js'
import {
  AdminSessionStore,
  type AdminSessionListRow,
  type AdminSessionMeta,
} from '../auth/session.store.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import { SESSION_MESSAGES } from './errors.js'
import type { AdminSessionListQuery } from './sessions.query.js'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.service.ts(5라우트 · terminated · 남의 세션 404 · runQuery) +
//       ssworks-gise-home apps/api/src/modules/auth/admin-me.service.ts(지금 세션 거부 · revoke-others · { revokedCount })
// 바꾼 점: 살아 있는 세션만(공통 1), isCurrent 는 액세스 토큰의 sessionNo(공통 2), 지금 세션 거부는 400(③ C1 — gise 403),
//   관리자 "사용자 전체" 는 본인에게도 열린다(admin-ui onSelfSignedOut — gise 는 막았다). 권한 상승 검사는 2d(⑪ D1).

export interface AdminSessionView extends AdminSessionMeta {
  isCurrent: boolean
}

export interface AdminSessionListView extends AdminSessionListRow {
  isCurrent: boolean
}

@Injectable()
export class AdminSessionsService {
  constructor(
    private readonly store: AdminSessionStore,
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
  ) {}

  async list(
    query: AdminSessionListQuery,
    principal: AdminPrincipal,
  ): Promise<Paginated<AdminSessionListView>> {
    const { offset, limit, sort } = toListQuery(query)
    const keyword = query.filter?.keyword
    const userNo = query.filter?.userNo
    const { rows, total } = await this.store.listLive({
      now: new Date(),
      ...(keyword ? { keyword } : {}),
      ...(userNo === undefined ? {} : { userNo }),
      sort,
      offset,
      limit,
    })
    return {
      items: rows.map((row) => ({ ...row, isCurrent: row.sessionNo === principal.sessionNo })),
      total,
      page: query.page,
      itemsPerPage: query.itemsPerPage,
    }
  }

  async listMine(principal: AdminPrincipal): Promise<{ items: AdminSessionView[] }> {
    const rows = await this.store.listLiveOfUser(principal.userNo, new Date())
    return {
      items: rows.map((row) => ({ ...row, isCurrent: row.sessionNo === principal.sessionNo })),
    }
  }

  /** 관리자 하나 끝내기. 🔴 지금 세션 검사가 UPDATE 보다 먼저다 — 본인 세션이라 드러낼 것이 없다 */
  async revoke(sessionNo: bigint, principal: AdminPrincipal): Promise<void> {
    if (sessionNo === principal.sessionNo) throw currentSession()
    if ((await this.store.revokeLive(sessionNo, new Date())) === 0) throw notFound()
  }

  /** 사용자 전체. 본인이면 지금 세션도 끊긴다 — 다음 요청이 401(admin-ui onSelfSignedOut, 2c 스펙 공통 4) */
  async revokeUser(userNo: bigint): Promise<number> {
    const user = await runQuery(() =>
      this.db.selectFrom('users').select('userNo').where('userNo', '=', userNo).executeTakeFirst(),
    )
    if (user === undefined) {
      throw new BusinessError(CommonErrorCodes.ERR_NO_USER, SESSION_MESSAGES.noUser)
    }
    return this.store.revokeAllOfUser(userNo, 'terminated', new Date(), { liveOnly: true })
  }

  /** 내 세션 하나. 🔴 남의 세션 · 없음 · 끝남이 같은 404 — 내 userNo 를 조건에 단 UPDATE 한 문장이 가른다 */
  async revokeMine(sessionNo: bigint, principal: AdminPrincipal): Promise<void> {
    if (sessionNo === principal.sessionNo) throw currentSession()
    const revoked = await this.store.revokeLive(sessionNo, new Date(), { userNo: principal.userNo })
    if (revoked === 0) throw notFound()
  }

  /** 다른 세션 모두 — 지금 세션을 뺀 살아 있는 것. 0 도 정상이다 */
  revokeOthers(principal: AdminPrincipal): Promise<number> {
    return this.store.revokeAllOfUser(principal.userNo, 'terminated', new Date(), {
      exceptSessionNo: principal.sessionNo,
      liveOnly: true,
    })
  }
}

function currentSession(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_BAD_REQUEST, SESSION_MESSAGES.currentSession)
}

function notFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, SESSION_MESSAGES.notFound)
}
```

`packages/admin-server/src/sessions/sessions.controller.ts`:

```ts
import { Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import { CoreAuditActions, CoreAuditTargets } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin, SelfOnly } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import { AdminSessionsService } from './sessions.service.js'
import { adminSessionListQuerySchema } from './sessions.query.js'
import type { AdminSessionListQuery } from './sessions.query.js'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.controller.ts(경로 · @Audit 세 코드) + gise
//       admin-me.controller.ts(POST me/revoke-others · @HttpCode(200))
// 바꾼 점: 권한은 슬롯(2c 스펙 ① P1), "다른 세션 모두" 를 더했다(session.revoke.others). 경로는 RouterModule 이 /admin 을
//   붙인다. 🔴 `DELETE me/others` 로 두지 않는다 — `DELETE me/:sessionNo` 와 겹쳐 'others' 가 번호 파싱 400 이 된다.

@Controller('sessions')
export class AdminSessionsController {
  constructor(private readonly sessions: AdminSessionsService) {}

  /** 전체 목록 — 서버 페이징 · 마지막 활동 내림차순 · 검색어(3c §9) */
  @RequirePermissionSlot('sessions.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(adminSessionListQuerySchema)) query: AdminSessionListQuery,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.sessions.list(query, admin)
  }

  /** 내 세션 — 전량 { items }(3c §10) */
  @SelfOnly()
  @Get('me')
  mine(@CurrentAdmin() admin: AdminPrincipal) {
    return this.sessions.listMine(admin)
  }

  @SelfOnly()
  @Audit({ action: CoreAuditActions.SESSION_REVOKE_OTHERS, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post('me/revoke-others')
  async revokeOthers(@CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    const revokedCount = await this.sessions.revokeOthers(admin)
    attachAuditTarget(req, admin.userNo)
    attachAuditMeta(req, { revokedCount })
    return { revokedCount }
  }

  @SelfOnly()
  @Audit({ action: CoreAuditActions.SESSION_REVOKE_SELF, targetType: CoreAuditTargets.SESSION })
  @Delete('me/:sessionNo')
  async revokeMine(
    @Param('sessionNo', ParseBigIntPipe) sessionNo: bigint,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    await this.sessions.revokeMine(sessionNo, admin)
    return {}
  }

  @RequirePermissionSlot('sessions.manage')
  @Audit({ action: CoreAuditActions.SESSION_REVOKE_USER, targetType: CoreAuditTargets.USER })
  @Delete('user/:userNo')
  async revokeUser(@Param('userNo', ParseBigIntPipe) userNo: bigint, @Req() req: Request) {
    const revokedCount = await this.sessions.revokeUser(userNo)
    attachAuditMeta(req, { revokedCount })
    return { revokedCount }
  }

  @RequirePermissionSlot('sessions.manage')
  @Audit({ action: CoreAuditActions.SESSION_REVOKE, targetType: CoreAuditTargets.SESSION })
  @Delete(':sessionNo')
  async revoke(
    @Param('sessionNo', ParseBigIntPipe) sessionNo: bigint,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    await this.sessions.revoke(sessionNo, admin)
    return {}
  }
}
```

`packages/admin-server/src/sessions/sessions.module.ts`:

```ts
import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import { AdminSessionStore } from '../auth/session.store.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminSessionsController } from './sessions.controller.js'
import { AdminSessionsService } from './sessions.service.js'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.module.ts
// 바꾼 점: 패키지 기능 모듈(2c 스펙 ⑩ MD1) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다.
// 🔴 AdminSessionStore 를 자기 provider 로 둔다(무상태 — KYSELY 만 받는다). AdminAuthModule 의 것을 export 받으면 인증
//    모듈이 빠진 앱이 DI 해석 오류로 멈춰 이유가 안 보인다 — 여기서는 onModuleInit 의 문구로 멈춘다(2c 스펙 §14 R2).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.

@Module({
  controllers: [AdminSessionsController],
  providers: [AdminSessionStore, AdminSessionsService],
})
export class AdminSessionsModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminSessionsModule')
    assertPermissionSlots(
      this.options.permissions,
      ['sessions.read', 'sessions.manage'],
      'AdminSessionsModule',
    )
  }
}
```

`packages/admin-server/src/admin-server.module.ts`:

- import 에 `import { AdminSessionsModule } from './sessions/sessions.module.js'` 를 더한다.
- `ADMIN_ROUTE_MODULES` 를 `[AdminAuthModule, AdminAuditModule, AdminSessionsModule]` 로 바꾼다.

`packages/admin-server/src/index.ts` — 세션 · 감사 블록에 더한다:

```ts
export { AdminSessionsModule } from './sessions/sessions.module.js'
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run src/sessions src/audit src/auth`
Expected: PASS — 쿼리 · 서비스 · 모듈 기동(여섯 라우트 401 · 인증 모듈 없음 · 슬롯 없음 · 감사와 함께).

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server lint`
Expected: 오류 없음. TS1272 가 나면 데코레이터가 붙은 시그니처의 타입(`AdminPrincipal` · `AdminSessionListQuery` · `AdminServerOptions` · `Request`)이 `import type` 인지 본다.

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-server/src/sessions packages/admin-server/src/admin-server.module.ts packages/admin-server/src/index.ts
git commit -m "feat(admin-server): 세션 6라우트 — AdminSessionsModule" -m "/admin/sessions 전체 목록 · 내 세션 · 하나 끝내기 · 사용자 전체 · 내 세션 하나 · 다른 세션 모두(2c 스펙 §4-6). 지금 세션은 400, 남의 · 없는 · 끝난 세션은 같은 404, 끊기는 @Audit 으로 남는다. 인증 모듈 · 슬롯을 기동에서 본다." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: 실 MariaDB HTTP 계약 — 2c 끝 상태

**Files:**

- Create: `packages/admin-server/src/test-support/audit-probe.ts`
- Create: `packages/admin-server/src/test-support/admin-app.ts`
- Create: `packages/admin-server/src/sessions/sessions.http.db.test.ts`
- Create: `packages/admin-server/src/audit/audit.http.db.test.ts`

**Interfaces:**

- Consumes: Task 1~11 전부, 2b `seedRole` · `seedUser` · `SeededUser` · `TEST_JWT_SECRET`, 2a `createHttpApp` · `createTestDatabase` · `testDbServer`
- Produces(테스트 전용 — 빌드에서 빠진다): `TEST_PERMISSIONS` · `TEST_AUDIT_CATALOG` · `bootAdminApp(db)` · `AuditProbeModule`(`POST /admin/auditprobe/item/:itemNo` · `POST /admin/auditprobe/fail` · `POST /admin/auditprobe/plain`)

- [ ] **Step 1: 하네스를 쓴다**

`packages/admin-server/src/test-support/audit-probe.ts`:

```ts
import { Body, Controller, Module, Post, Req } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditMeta } from '../audit/audit-bag.js'
import { SelfOnly } from '../auth/decorators.js'

// 테스트 전용 — 쓰는 쪽 라우트처럼 @Audit 을 달고 meta 를 붙인다(2c 스펙 §9-3). 🔴 빌드에서 빠진다(tsconfig.build.json).
// 이 모듈은 AdminAuditModule 과 다른 모듈이다 — 전역 인터셉터가 쓰는 쪽 컨트롤러에도 걸리는지 잰다.

@Controller('auditprobe')
export class AuditProbeController {
  /** 본문을 그대로 meta 로 — 비밀 키가 가려지는지 잰다 */
  @SelfOnly()
  @Audit({ action: 'probe.write', targetType: 'probe' })
  @Post('item/:itemNo')
  write(@Req() req: Request, @Body() body: Record<string, unknown>) {
    attachAuditMeta(req, body)
    return { ok: true }
  }

  @SelfOnly()
  @Audit({ action: 'probe.write', targetType: 'probe' })
  @Post('fail')
  fail(): never {
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, '겹친다')
  }

  @SelfOnly()
  @Post('plain')
  plain() {
    return { ok: true }
  }
}

@Module({ controllers: [AuditProbeController] })
export class AuditProbeModule {}
```

`packages/admin-server/src/test-support/admin-app.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import { defineAuditCatalog } from '@ssworks/admin-shared'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminDbConnection } from '../database/connection.js'
import { AdminSessionsModule } from '../sessions/sessions.module.js'
import { AuditProbeModule } from './audit-probe.js'
import { TEST_JWT_SECRET } from './auth.js'
import { createHttpApp } from './http.js'

// 테스트 전용 — 인증 · 감사 · 세션까지 붙인 앱(2c). 운영 main.ts 와 같은 배선(configureAdminApp). 🔴 빌드에서 빠진다.

export const TEST_PERMISSIONS = Object.freeze({
  'sessions.read': 'org.users:read',
  'sessions.manage': 'org.users:write',
  'auditLogs.read': 'setting.auditLog:read',
})

/** 프로브 라우트의 액션 — 쓰는 쪽 카탈로그 병합을 그대로 탄다 */
export const TEST_AUDIT_CATALOG = defineAuditCatalog({
  actions: { PROBE_WRITE: 'probe.write' },
  targets: { PROBE: 'probe' },
  labels: { 'probe.write': '프로브 쓰기' },
  targetLabels: { probe: '프로브' },
})

export function bootAdminApp(db: AdminDbConnection): Promise<NestExpressApplication> {
  return createHttpApp({
    imports: [
      AdminServerModule.forRoot({
        db,
        auth: { jwtSecret: TEST_JWT_SECRET },
        permissions: TEST_PERMISSIONS,
        audit: { catalog: TEST_AUDIT_CATALOG, secretKeys: ['apiKey'] },
      }),
      AdminAuthModule,
      AdminAuditModule,
      AdminSessionsModule,
      AuditProbeModule,
    ],
  })
}
```

- [ ] **Step 2: 세션 HTTP 계약 테스트를 쓴다**

`packages/admin-server/src/sessions/sessions.http.db.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  adminSessionListItemSchema,
  adminSessionRevokeResultSchema,
  adminSessionSchema,
  createPaginatedRespSchema,
  errorRespSchema,
  parseJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { SESSION_MESSAGES } from './errors.js'

// 실 MariaDB 의 세션 HTTP 계약(2c 스펙 §9-3) — admin-ui useSessions · SessionTable 이 기대는 모양 그대로.

let t: TestDatabase
let app: NestExpressApplication
let managerRole: bigint
let memberRole: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  managerRole = await seedRole(t.db, {
    roleName: '세션 관리자',
    permissions: ['org.users:read', 'org.users:write', 'setting.auditLog:read'],
  })
  memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  app = await bootAdminApp({ ...testDbServer(), database: t.name, connectionLimit: 4 })
})

afterAll(async () => {
  await app?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>

const server = () => app.getHttpServer()
const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data
const mineSchema = z.object({ items: z.array(adminSessionSchema) })
const listSchema = createPaginatedRespSchema(adminSessionListItemSchema)

function expectError(response: Response, status: number, code: string, message?: string): void {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
}

async function signIn(user: SeededUser): Promise<Agent> {
  const agent = request.agent(server())
  const login = await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
  expect(login.status).toBe(200)
  return agent
}

async function currentSessionNo(agent: Agent): Promise<bigint> {
  const response = await agent.get('/admin/sessions/me').expect(200)
  const current = mineSchema.parse(data(response)).items.find((item) => item.isCurrent)
  if (current === undefined) throw new Error('지금 세션이 없다')
  return current.sessionNo
}

describe('내 세션', () => {
  it('🔴 행이 adminSessionSchema 로 읽히고 isCurrent 는 그 요청의 세션에만', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const first = await signIn(user)
    const second = await signIn(user)
    const fromFirst = mineSchema.parse(
      data(await first.get('/admin/sessions/me').expect(200)),
    ).items
    expect(fromFirst).toHaveLength(2)
    expect(fromFirst.filter((item) => item.isCurrent)).toHaveLength(1)
    expect(await currentSessionNo(first)).not.toBe(await currentSessionNo(second))
  })
})

describe('전체 목록', () => {
  it('행이 adminSessionListItemSchema 로 — 검색어 · userNo 필터, 권한 없는 계정은 403', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole, userId: 'mgr-list' })
    const target = await seedUser(t.db, {
      roleNo: memberRole,
      userId: 'list-target',
      userName: '목록대상',
    })
    const managerAgent = await signIn(manager)
    const targetAgent = await signIn(target)

    const byKeyword = listSchema.parse(
      data(
        await managerAgent
          .get('/admin/sessions')
          .query({ 'filter[keyword]': '목록대' })
          .expect(200),
      ),
    )
    expect(byKeyword.items.map((item) => item.userId)).toEqual(['list-target'])
    expect(byKeyword.items[0]).toMatchObject({
      userNo: target.userNo,
      userName: '목록대상',
      isCurrent: false,
    })

    const byUser = listSchema.parse(
      data(
        await managerAgent
          .get('/admin/sessions')
          .query({ 'filter[userNo]': String(manager.userNo) })
          .expect(200),
      ),
    )
    expect(byUser.items.map((item) => [item.userId, item.isCurrent])).toEqual([['mgr-list', true]])

    expectError(
      await targetAgent.get('/admin/sessions'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('🔴 빈 filter[userNo]= 는 0번 사용자가 아니라 400(Review Focus 3)', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: managerRole }))
    expectError(
      await agent.get('/admin/sessions').query({ 'filter[userNo]': '' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
  })

  it('쪽이 넘치면 빈 items 와 전체 개수', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole })
    const agent = await signIn(manager)
    const page = listSchema.parse(
      data(
        await agent
          .get('/admin/sessions')
          .query({ page: '99', 'filter[userNo]': String(manager.userNo) })
          .expect(200),
      ),
    )
    expect(page).toMatchObject({ items: [], total: 1n, page: 99 })
  })
})

describe('내 세션 끊기', () => {
  it('🔴 지금 세션은 400, 내 다른 세션은 끊기고 그 기기는 다음 요청이 401, 다시 끊으면 404', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const here = await signIn(user)
    const there = await signIn(user)
    const hereNo = await currentSessionNo(here)
    const thereNo = await currentSessionNo(there)

    expectError(
      await here.delete(`/admin/sessions/me/${hereNo}`),
      400,
      CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
      SESSION_MESSAGES.currentSession,
    )
    const done = await here.delete(`/admin/sessions/me/${thereNo}`).expect(200)
    expect(done.body).toEqual({ success: true, data: {} })
    expect((await there.get('/admin/auth/me')).status).toBe(401)
    expectError(
      await here.delete(`/admin/sessions/me/${thereNo}`),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
      SESSION_MESSAGES.notFound,
    )
  })

  it('🔴 남의 세션과 없는 세션은 같은 404 본문 — 남의 세션은 그대로 산다', async () => {
    const mine = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    const theirs = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    const theirNo = await currentSessionNo(theirs)

    const foreign = await mine.delete(`/admin/sessions/me/${theirNo}`)
    const missing = await mine.delete('/admin/sessions/me/999999999')
    expectError(foreign, 404, CommonErrorCodes.ERR_COMMON_NOT_FOUND, SESSION_MESSAGES.notFound)
    expect(missing.body).toEqual(foreign.body)
    expect((await theirs.get('/admin/auth/me')).status).toBe(200)
  })
})

describe('관리자 끊기', () => {
  it('하나 끝내기 — 지금 세션 400, 남의 세션 200 {}, 두 번째는 404', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: managerRole }))
    const victim = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    const mineNo = await currentSessionNo(agent)
    const victimNo = await currentSessionNo(victim)

    expectError(
      await agent.delete(`/admin/sessions/${mineNo}`),
      400,
      CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
      SESSION_MESSAGES.currentSession,
    )
    expect((await agent.delete(`/admin/sessions/${victimNo}`).expect(200)).body).toEqual({
      success: true,
      data: {},
    })
    expectError(
      await agent.delete(`/admin/sessions/${victimNo}`),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
    expect((await victim.get('/admin/auth/me')).status).toBe(401)
  })

  it('사용자 전체 — { revokedCount }, 없는 사용자 404, 본인이면 지금 세션까지 끊긴다', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole })
    const target = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(manager)
    await signIn(target)
    await signIn(target)

    expect(
      adminSessionRevokeResultSchema.parse(
        data(await agent.delete(`/admin/sessions/user/${target.userNo}`).expect(200)),
      ),
    ).toEqual({ revokedCount: 2 })
    expectError(
      await agent.delete('/admin/sessions/user/999999999'),
      404,
      CommonErrorCodes.ERR_NO_USER,
      SESSION_MESSAGES.noUser,
    )
    expect(
      adminSessionRevokeResultSchema.parse(
        data(await agent.delete(`/admin/sessions/user/${manager.userNo}`).expect(200)),
      ),
    ).toEqual({ revokedCount: 1 })
    expect((await agent.get('/admin/auth/me')).status).toBe(401)
  })

  it('슬롯에 이은 키가 없는 계정은 끊기 라우트 403', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    expectError(await agent.delete('/admin/sessions/1'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expectError(
      await agent.delete('/admin/sessions/user/1'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})

describe('다른 세션 모두', () => {
  it('지금 세션만 남기고 끊는다 — 끊을 것이 없으면 0', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const here = await signIn(user)
    await signIn(user)
    await signIn(user)

    expect(
      adminSessionRevokeResultSchema.parse(
        data(await here.post('/admin/sessions/me/revoke-others').expect(200)),
      ),
    ).toEqual({ revokedCount: 2 })
    expect(
      adminSessionRevokeResultSchema.parse(
        data(await here.post('/admin/sessions/me/revoke-others').expect(200)),
      ),
    ).toEqual({ revokedCount: 0 })
    expect(
      mineSchema.parse(data(await here.get('/admin/sessions/me').expect(200))).items,
    ).toHaveLength(1)
  })
})
```

- [ ] **Step 3: 감사 HTTP 계약 테스트를 쓴다**

`packages/admin-server/src/audit/audit.http.db.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  adminAuditLogSchema,
  adminSessionSchema,
  createPaginatedRespSchema,
  errorRespSchema,
  parseJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { AUDIT_MESSAGES } from './errors.js'

// 실 MariaDB 의 감사 계약(2c 스펙 §9-3) — 세션 끊기 · 쓰는 쪽 라우트 · 실패 요청 · 인증 이벤트가 행이 되고 조회된다.

let t: TestDatabase
let app: NestExpressApplication
let managerRole: bigint
let memberRole: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  managerRole = await seedRole(t.db, {
    roleName: '감사 관리자',
    permissions: ['org.users:read', 'org.users:write', 'setting.auditLog:read'],
  })
  memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  app = await bootAdminApp({ ...testDbServer(), database: t.name, connectionLimit: 4 })
})

afterAll(async () => {
  await app?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>

const server = () => app.getHttpServer()
const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data
const mineSchema = z.object({ items: z.array(adminSessionSchema) })
const logsSchema = createPaginatedRespSchema(adminAuditLogSchema)

function expectError(response: Response, status: number, code: string): void {
  expect(response.status).toBe(status)
  expect(errorRespSchema.parse(response.body).code).toBe(code)
}

async function signIn(user: SeededUser): Promise<Agent> {
  const agent = request.agent(server())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function currentSessionNo(agent: Agent): Promise<bigint> {
  const response = await agent.get('/admin/sessions/me').expect(200)
  const current = mineSchema.parse(data(response)).items.find((item) => item.isCurrent)
  if (current === undefined) throw new Error('지금 세션이 없다')
  return current.sessionNo
}

async function auditRows(where: { actorUserNo?: bigint; action?: string; path?: string }) {
  let query = t.db.selectFrom('auditLogs').selectAll().orderBy('logNo', 'asc')
  if (where.actorUserNo !== undefined) query = query.where('actorUserNo', '=', where.actorUserNo)
  if (where.action !== undefined) query = query.where('action', '=', where.action)
  if (where.path !== undefined) query = query.where('path', '=', where.path)
  return query.execute()
}

describe('세션 끊기 감사', () => {
  it('🔴 끊기 넷이 행으로 — 대상 · 행위자 세션 · meta', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole })
    const target = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(manager)
    const extra = await signIn(manager)
    const agentNo = await currentSessionNo(agent)
    const extraNo = await currentSessionNo(extra)

    await agent.delete(`/admin/sessions/me/${extraNo}`).expect(200)
    await signIn(manager)
    await agent.post('/admin/sessions/me/revoke-others').expect(200)
    const victimNo = await currentSessionNo(await signIn(target))
    await agent.delete(`/admin/sessions/${victimNo}`).expect(200)
    await signIn(target)
    await agent.delete(`/admin/sessions/user/${target.userNo}`).expect(200)

    const rows = (await auditRows({ actorUserNo: manager.userNo })).filter((row) =>
      row.action.startsWith('session.'),
    )
    expect(
      rows.map((row) => [
        row.action,
        row.targetType,
        row.targetRefNo,
        row.statusCode,
        row.sessionNo,
      ]),
    ).toEqual([
      ['session.revoke.self', 'session', extraNo, 200, agentNo],
      ['session.revoke.others', 'user', manager.userNo, 200, agentNo],
      ['session.revoke', 'session', victimNo, 200, agentNo],
      ['session.revoke.user', 'user', target.userNo, 200, agentNo],
    ])
    expect(rows.map((row) => row.meta)).toEqual([
      null,
      { revokedCount: 1 },
      null,
      { revokedCount: 1 },
    ])
    expect(rows[0]?.path).toBe(`/admin/sessions/me/${extraNo}`)
  })

  it('🔴 끊을 것이 없는 "다른 세션 모두" 도 200 { revokedCount: 0 } 과 감사 행(Review Focus 5)', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(user)
    expect(data(await agent.post('/admin/sessions/me/revoke-others').expect(200))).toEqual({
      revokedCount: 0,
    })
    const rows = await auditRows({ actorUserNo: user.userNo, action: 'session.revoke.others' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.meta).toEqual({ revokedCount: 0 })
  })
})

describe('쓰는 쪽 라우트 · 실패 요청', () => {
  it('🔴 meta 의 비밀 키는 대소문자 무시로 *** — 중첩 · 배열 · 쓰는 쪽 키까지, bigint 는 문자열', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(user)
    await agent
      .post('/admin/auditprobe/item/5')
      .send({
        password: 'p',
        Token: 't',
        apiKey: 'k',
        nested: { secret: 's', keep: 1 },
        list: [{ newPassword: 'n' }],
        count: 'BigInt(12)',
      })
      .expect(201)
    const [row] = await auditRows({ actorUserNo: user.userNo, action: 'probe.write' })
    expect(row).toMatchObject({
      targetType: 'probe',
      targetRefNo: 5n,
      statusCode: 201,
      errorCode: null,
      method: 'POST',
      path: '/admin/auditprobe/item/5',
    })
    expect(row?.meta).toEqual({
      password: '***',
      Token: '***',
      apiKey: '***',
      nested: { secret: '***', keep: 1 },
      list: [{ newPassword: '***' }],
      count: '12',
    })
  })

  it('🔴 핸들러에서 던진 실패는 응답과 같은 상태 · 코드로 남는다', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const agent = await signIn(user)
    expectError(
      await agent.post('/admin/auditprobe/fail'),
      409,
      CommonErrorCodes.ERR_COMMON_CONFLICT,
    )
    const [row] = await auditRows({ actorUserNo: user.userNo, action: 'probe.write' })
    expect(row).toMatchObject({
      statusCode: 409,
      errorCode: 'ERR_COMMON_CONFLICT',
      targetRefNo: null,
    })
  })

  it('@Audit 이 없는 라우트 · 가드가 거부한 요청은 남지 않는다(⑧ F1)', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    await agent.post('/admin/auditprobe/plain').expect(201)
    await request(server()).post('/admin/auditprobe/item/1').send({}).expect(401)
    expect(await auditRows({ path: '/admin/auditprobe/plain' })).toEqual([])
    expect(await auditRows({ path: '/admin/auditprobe/item/1' })).toEqual([])
  })
})

describe('인증 이벤트', () => {
  it('로그인 성공 · 갱신 · 로그아웃, 없는 아이디의 실패가 sink 를 거쳐 행이 된다', async () => {
    const user = await seedUser(t.db, { roleNo: memberRole })
    const agent = request.agent(server())
    await agent
      .post('/admin/auth/login')
      .send({ userId: user.userId, password: user.password })
      .expect(200)
    await request(server())
      .post('/admin/auth/login')
      .send({ userId: 'nobody-2c', password: 'x' })
      .expect(401)
    await agent.post('/admin/auth/refresh').expect(200)
    await agent.post('/admin/auth/logout').expect(200)

    const mine = await auditRows({ actorUserNo: user.userNo })
    expect(mine.map((row) => [row.action, row.statusCode, row.errorCode])).toEqual([
      ['auth.login.success', 200, null],
      ['auth.token.refresh', 200, null],
      ['auth.logout', 200, null],
    ])
    expect(mine[1]?.meta).toEqual({ rotatedFrom: String(mine[0]?.sessionNo), grace: false })
    expect(mine[1]?.path).toBe('/admin/auth/refresh')

    const anonymous = (await auditRows({ action: 'auth.login.fail' })).filter(
      (row) => (row.meta as { userId?: string } | null)?.userId === 'nobody-2c',
    )
    expect(anonymous).toHaveLength(1)
    expect(anonymous[0]).toMatchObject({
      actorUserNo: null,
      sessionNo: null,
      targetType: null,
      statusCode: 401,
      errorCode: 'ERR_LOGIN_FAILED',
      meta: { userId: 'nobody-2c', loginFailCount: null },
    })
  })
})

describe('GET /admin/audit-logs', () => {
  it('adminAuditLogSchema 로 읽히고 접두 · 정확 · 행위자 필터, 행위자 아이디가 붙는다', async () => {
    const manager = await seedUser(t.db, { roleNo: managerRole })
    const agent = await signIn(manager)
    await signIn(manager)
    await agent.post('/admin/sessions/me/revoke-others').expect(200)

    const filter = {
      'filter[actorUserNo]': String(manager.userNo),
      'filter[action]': 'session.revoke',
    }
    const prefix = logsSchema.parse(
      data(await agent.get('/admin/audit-logs').query(filter).expect(200)),
    )
    expect(prefix.items.map((item) => item.action)).toEqual(['session.revoke.others'])
    expect(prefix.items[0]).toMatchObject({
      actorUserId: manager.userId,
      meta: { revokedCount: 1 },
    })

    const exact = logsSchema.parse(
      data(
        await agent
          .get('/admin/audit-logs')
          .query({ ...filter, 'filter[actionMatch]': 'exact' })
          .expect(200),
      ),
    )
    expect(exact.items).toEqual([])
  })

  it('🔴 거꾸로 기간은 400 + issues[filter.to], 슬롯 키가 없는 계정은 403', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: managerRole }))
    const reversed = await agent.get('/admin/audit-logs').query({
      'filter[from]': '2026-10-02T00:00:00.000Z',
      'filter[to]': '2026-10-01T00:00:00.000Z',
    })
    expectError(reversed, 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(errorRespSchema.parse(reversed.body).details).toEqual({
      issues: [{ path: ['filter', 'to'], code: 'custom', message: AUDIT_MESSAGES.periodOrder }],
    })

    const member = await signIn(await seedUser(t.db, { roleNo: memberRole }))
    expectError(await member.get('/admin/audit-logs'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })
})
```

- [ ] **Step 4: 돌린다**

Run: `pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/sessions src/audit`
Expected: PASS — 세션 9 · 감사 9.

실패가 나면 원인을 고친 Task 의 파일에서 고치고(테스트를 기대에 맞춰 바꾸지 않는다), 스펙과 다른 동작이면 스펙 §14 에 `R<n>` 으로 적는다.

- [ ] **Step 5: 전체를 돌린다**

Run(저장소 루트): `pnpm check`
Expected: lint → typecheck → test → build 초록.

Run(저장소 루트): `pnpm test:db`
Expected: 초록 — 2b 의 101 + 2c 의 새 DB 테스트.

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-server/src/test-support/audit-probe.ts packages/admin-server/src/test-support/admin-app.ts packages/admin-server/src/sessions/sessions.http.db.test.ts packages/admin-server/src/audit/audit.http.db.test.ts
git commit -m "test(admin-server): 세션 · 감사 실 DB HTTP 계약 — 2c 끝 상태" -m "세션 행 스키마 · isCurrent · 지금 세션 400 · 남의 세션 404(같은 본문) · revokedCount · 본인 사용자 전체 뒤 401, 감사 행(끊기 넷 · 비밀 *** · 실패 409 · 인증 이벤트) · 조회 필터 · 거꾸로 기간 400(2a 스펙 §1-3 · 2c 스펙 §9-3)." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: 쓰는 쪽 스모크 · README · changeset · 진행 문서

**Files:**

- Modify: `packages/admin-server/README.md`
- Create: `.changeset/admin-server-sessions-audit.md`
- Modify: `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-14-admin-server-sessions-audit-design.md`(§14 — 구현 중 바뀐 것이 있을 때만)
- Create(저장소 밖): `$TEMP/akss/` 아래 앱 파일들

- [ ] **Step 1: README 를 고친다**

`packages/admin-server/README.md`:

① 둘째 단락(`지금 들어 있는 것은 …`)을 바꾼다:

```md
지금 들어 있는 것은 응답 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 스키마 8장(PR 2a · 2c)과 관리자 인증(PR 2b — 로그인 · refresh 회전 · 가드 · 재인증), 세션 관리 · 감사(PR 2c)다. 사용자 · 역할 · 팀 · 약관 · IP 접근 제어는 다음 PR 에서 붙는다 — 지도는 저장소 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1.
```

② 장 표 끝에 한 줄을 더한다:

```md
| `0008_audit_logs` | `audit_logs` |
```

③ "### 시드 · 2c · 2f 자리" 절을 바꾼다:

```md
### 시드 · IP 자리

- 첫 관리자는 `@ssworks/admin-server/runner` 의 `hashPassword` 로 만든다(Nest 없이).
- 인증 이벤트(로그인 · 갱신 · 재사용 · 로그아웃 · 비밀번호 변경)는 `AdminAuditModule` 이 감사 행으로 남긴다(아래 "감사"). `ADMIN_ACCESS_POLICY`(IP 판정)는 IP 접근 제어(2f)가 채운다.
```

④ "## admin-ui 와 맞물리기" 절 **앞**에 두 절을 더한다:

````md
## 권한 슬롯

패키지 라우트는 권한 키를 박지 않는다 — **슬롯**을 선언하고 쓰는 쪽이 자기 권한 키를 잇는다.

```ts
AdminServerModule.forRootAsync({
  useFactory: () => ({
    db: adminDbConnectionFromEnv(),
    auth: { jwtSecret: process.env.ADMIN_JWT_SECRET! },
    permissions: {
      'sessions.read': 'org.users:read', // GET /sessions
      'sessions.manage': 'org.users:write', // DELETE /sessions/:sessionNo · /sessions/user/:userNo
      'auditLogs.read': 'setting.auditLog:read', // GET /audit-logs
    },
  }),
})
```

- 🔴 import 한 기능 모듈의 슬롯이 없거나, 모르는 슬롯(오타) · 빈 키가 있으면 기동에서 멈춘다. 슬롯 판정은 `@RequirePermissions` 와 같은 층이다(`'*'` 는 이어진 슬롯을 통과한다).
- 키 이름은 프로젝트 카탈로그가 정한다 — hangang 은 `org.users:*`, gise 는 `account.session:manage`.

## 세션 · 감사

```ts
imports: [
  AdminServerModule.forRootAsync({ useFactory: () => ({ …, permissions, audit: { catalog: auditCatalog } }) }),
  AdminAuthModule,
  AdminAuditModule, // 전역 감사 인터셉터 · 인증 이벤트 기록 · GET /audit-logs
  AdminSessionsModule, // /sessions 6라우트
]
```

🔴 둘 다 `AdminAuthModule` 이 있어야 뜬다(가드 없이 라우트가 열리지 않게). 감사 장 스텁(`0008_audit_logs`)은 모든 앱에 필수다.

### 세션

| 라우트                            | 권한              | 응답                                   | admin-ui `useSessions` 어댑터 |
| --------------------------------- | ----------------- | -------------------------------------- | ----------------------------- |
| `GET /sessions`                   | `sessions.read`   | `{ items, total, page, itemsPerPage }` | `fetch`(서버 페이징)          |
| `DELETE /sessions/:sessionNo`     | `sessions.manage` | `{}`                                   | `revoke`(관리자 표)           |
| `DELETE /sessions/user/:userNo`   | `sessions.manage` | `{ revokedCount }`                     | `revokeUser`                  |
| `GET /sessions/me`                | `@SelfOnly`       | `{ items }`(전량)                      | `list`                        |
| `DELETE /sessions/me/:sessionNo`  | `@SelfOnly`       | `{}`                                   | `revoke`(내 세션 표)          |
| `POST /sessions/me/revoke-others` | `@SelfOnly`       | `{ revokedCount }`                     | `revokeOthers`                |

- 행은 admin-shared `adminSessionSchema` · `adminSessionListItemSchema`. `isCurrent` 는 그 요청의 세션이다. 목록은 살아 있는 세션(끊기지 않고 만료 전)만이다.
- 전체 목록 쿼리: `filter[keyword]`(아이디 · 이름 부분일치) · `filter[userNo]` · 정렬 `lastAccessAt` · `loginAt` · `expireAt`.
- 🔴 지금 쓰는 세션은 이 라우트로 끊지 못한다(400) — 로그아웃이 정상 경로다. 남의 세션 · 없는 세션 · 이미 끝난 세션은 같은 404 다. 본인 계정의 "사용자 전체" 는 지금 세션까지 끊는다(다음 요청 401 — admin-ui `onSelfSignedOut`).
- 유예창(30초) 안에서 다른 탭이 옛 refresh 를 내면 세션이 하나 더 생긴다. 같은 브라우저라면 그중 하나는 아무도 쓰지 않는 행으로 만료(7일)까지 남는다 — 목록에 같은 기기가 두 번 보이면 그것이다. "다른 세션 모두" 가 쓸어 낸다.
- 남의 세션을 끊을 때의 권한 상승 검사(낮은 관리자가 전권자의 세션을 끊는 것)는 사용자 · 역할 PR(2d)이 붙인다.

### 감사

```ts
// 프로젝트 액션은 admin-shared 카탈로그로 — 화면(감사 로그 조회)도 같은 라벨을 쓴다
export const auditCatalog = defineAuditCatalog({
  actions: { BOARD_POST_CREATE: 'board.post.create' },
  targets: { POST: 'post' },
  labels: { 'board.post.create': '게시글 작성' },
  targetLabels: { post: '게시글' },
})

@RequirePermissions('board.post:write')
@Audit({ action: 'board.post.create', targetType: 'post' })
@Post()
async create(@Body() body: PostBody, @Req() req: Request) {
  const postNo = await this.posts.create(body)
  attachAuditTarget(req, postNo) // 경로 변수로 대상을 알 수 없을 때
  attachAuditDiff(req, null, body, ['title', 'isNotice']) // 남길 필드만
  return { postNo }
}
```

- 성공 · 실패(핸들러에서 던진 것) 모두 기록한다. 응답 전에 기록을 기다리고, 기록이 실패해도 응답은 그대로다(경고 한 줄). 가드가 거부한 요청(401 · 403)은 남지 않는다.
- 🔴 카탈로그에 없는 액션 · 대상 종류를 단 `@Audit`, `@Public` 라우트의 `@Audit` 은 기동에서 멈춘다.
- 대상 번호: `attachAuditTarget` → `@Audit({ paramKey })` 경로 변수 → 숫자 경로 변수가 하나뿐일 때 그것.
- meta 의 비밀 키(`password` · `token` · `secret` …, 대소문자 무시)는 `***` 로 남는다. 프로젝트 키는 `audit.secretKeys` 로 더한다. bigint 는 문자열로, 64 KiB 를 넘는 meta 는 `{ _truncated, bytes }` 로 남는다 — 본문 같은 큰 필드를 `attachAuditDiff` 에 넣지 않는다.
- 🔴 로그인 실패 행의 meta `userId` 는 사람이 친 원문이다 — 비밀번호를 아이디 칸에 치면 그대로 남는다. 감사 조회 권한을 그만큼 좁게 준다.
- 조회: `GET /audit-logs` — `filter[actorUserNo]` · `filter[action]` + `filter[actionMatch]`(`prefix` 기본 · `exact`) · `filter[targetType]` · `filter[targetRefNo]` · `filter[from]` · `filter[to]`(`[from, to)` — "다음 날 0시" 를 보낸다). 행은 admin-shared `adminAuditLogSchema`, 라벨은 `auditCatalog.labelOf(action)`.
- 보존 기간 · 청소 · 파티셔닝은 쓰는 쪽 몫이다(크론으로 오래된 행을 지운다).
````

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-sessions-audit.md`:

```md
---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 스텁 한 줄을 더한다 — `export { up, down } from '@ssworks/admin-server/migrations/0008_audit_logs'`(🔴 모든 장이 필수다 — 빠지면 `assertAdminMigrationStubs` 가 멈춘다). `AdminServerModule` 옵션에 `permissions: { 'sessions.read', 'sessions.manage', 'auditLogs.read' }`(프로젝트 권한 키)와 선택 `audit: { catalog, secretKeys }` 를 더하고 `AdminAuditModule` · `AdminSessionsModule` 을 import 한다. 프로젝트 감사 액션은 admin-shared `defineAuditCatalog` 로 정의한다 — 카탈로그 밖 액션을 단 `@Audit` 은 기동에서 멈춘다.

admin-server 세션 · 감사(Phase 2 PR 2c): `AdminSessionsModule` — `/admin/sessions` 6라우트(전체 목록 · 내 세션 · 하나 끝내기 · 사용자 전체 · 내 세션 하나 · 다른 세션 모두, 지금 세션 400 · 남의 세션 404 · `{ revokedCount }`). `AdminAuditModule` — `@Audit` · 전역 감사 인터셉터(성공 · 실패, 응답 전에 기다림, 실패는 경고) · `attachAuditTarget` · `attachAuditMeta` · `attachAuditDiff` · 비밀 키 소독 · 인증 이벤트 기록(`ADMIN_AUTH_EVENTS`) · `GET /admin/audit-logs`. 권한 슬롯(`AdminServerOptions.permissions` · `AdminPermissionSlot`), 감사 장 `0008_audit_logs`, LIKE 도우미 `escapeLike` · `likeContains` · `likePrefix`. 예외 필터의 판정을 꺼냈다(동작 같음). 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: 감사 카탈로그(`CoreAuditActions` · `CoreAuditTargets` · 한국어 라벨 · `defineAuditCatalog` · `coreAuditCatalog`), 감사 행 · 조회 스키마(`adminAuditLogSchema` · `adminAuditLogQuerySchema`), 쿼리스트링 bigint 스키마 `queryBigIntSchema`.
```

- [ ] **Step 3: tarball 을 만들고 스모크 앱을 쓴다**

```bash
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server build
mkdir -p "$TEMP/akss/src/migrations"
pnpm --filter @ssworks/admin-shared pack --pack-destination "$TEMP/akss"
pnpm --filter @ssworks/admin-server pack --pack-destination "$TEMP/akss"
ls "$TEMP/akss"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -c "package/dist/audit/.*[.]js$"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "test-support|[.]test[.]js"
```

Expected: tarball 둘. `dist/audit/*.js` 가 12개 안팎, 두 번째 grep 은 아무것도 내지 않는다. 아래 `package.json` 의 tarball 파일 이름을 `ls` 결과로 맞춘다.

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

`$TEMP/akss/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`$TEMP/akss/.env`:

```
DB_HOST=127.0.0.1
DB_PORT=33306
DB_USER=root
DB_PASSWORD=admin-kit-test
DB_NAME=akss
ADMIN_JWT_SECRET=akss-smoke-jwt-secret-0123456789abcdef
```

`$TEMP/akss/kysely.config.ts`:

```ts
import { defineConfig } from 'kysely-ctl'
import {
  adminDbConnectionFromEnv,
  assertAdminMigrationStubs,
  assertUtcTimezone,
  createAdminKysely,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

loadDotEnv(new URL('./.env', import.meta.url))
assertUtcTimezone('마이그레이션 러너')
assertAdminMigrationStubs('src/migrations')

export default defineConfig({
  kysely: () => createAdminKysely(adminDbConnectionFromEnv()),
  migrations: { migrationFolder: 'src/migrations' },
})
```

`$TEMP/akss/src/migrations/` 에 스텁 8개 — 파일 이름과 내용(한 줄씩):

```
001_admin_roles.ts                    export { up, down } from '@ssworks/admin-server/migrations/0001_roles'
002_admin_users.ts                    export { up, down } from '@ssworks/admin-server/migrations/0002_users'
003_admin_teams.ts                    export { up, down } from '@ssworks/admin-server/migrations/0003_teams'
004_admin_team_closure.ts             export { up, down } from '@ssworks/admin-server/migrations/0004_team_closure'
005_admin_team_user_map.ts            export { up, down } from '@ssworks/admin-server/migrations/0005_team_user_map'
006_admin_user_employment_periods.ts  export { up, down } from '@ssworks/admin-server/migrations/0006_user_employment_periods'
007_admin_sessions.ts                 export { up, down } from '@ssworks/admin-server/migrations/0007_sessions'
008_admin_audit_logs.ts               export { up, down } from '@ssworks/admin-server/migrations/0008_audit_logs'
```

`$TEMP/akss/src/seed.ts`:

```ts
import {
  adminDbConnectionFromEnv,
  assertUtcTimezone,
  createAdminKysely,
  hashPassword,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

// 시드는 러너만 쓴다 — Nest 를 싣지 않는다.
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
import { Body, Controller, Get, Module, Post, Req } from '@nestjs/common'
import {
  AdminAuditModule,
  AdminAuthModule,
  AdminServerModule,
  AdminSessionsModule,
  Audit,
  Public,
  RequirePermissions,
  adminDbConnectionFromEnv,
  attachAuditMeta,
  requireEnv,
} from '@ssworks/admin-server'
import { defineAuditCatalog } from '@ssworks/admin-shared'
import type { Request } from 'express'

const auditCatalog = defineAuditCatalog({
  actions: { BOARD_POST_CREATE: 'board.post.create' },
  targets: { POST: 'post' },
  labels: { 'board.post.create': '게시글 작성' },
  targetLabels: { post: '게시글' },
})

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
  @RequirePermissions('board.post:write')
  @Audit({ action: 'board.post.create', targetType: 'post' })
  @Post()
  create(@Req() req: Request, @Body() body: Record<string, unknown>) {
    attachAuditMeta(req, body)
    return { postNo: 1 }
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
          permissions: {
            'sessions.read': 'org.users:read',
            'sessions.manage': 'org.users:write',
            'auditLogs.read': 'setting.auditLog:read',
          },
          audit: { catalog: auditCatalog },
        }
      },
    }),
    AdminAuthModule,
    AdminAuditModule,
    AdminSessionsModule,
  ],
  controllers: [HealthController, PostsController],
})
export class AppModule {}
```

`$TEMP/akss/src/main.ts`:

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { assertUtcTimezone, configureAdminApp, loadDotEnv } from '@ssworks/admin-server'
import { AppModule } from './app.module.js'

loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('akss')
const app = await NestFactory.create<NestExpressApplication>(AppModule)
configureAdminApp(app)
app.setGlobalPrefix('api')
app.enableShutdownHooks()
await app.listen(4100)
```

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

async function login() {
  const result = await send('/admin/auth/login', {
    method: 'POST',
    body: { userId: 'admin', password: 'smoke-pass-1234' },
  })
  if (result.status !== 200) throw new Error(`로그인 실패 ${result.status} ${result.text}`)
  return `admin_at=${result.cookies.admin_at}; admin_rt=${result.cookies.admin_rt}`
}

await waitForServer()
const first = await login()
const second = await login()
show('sessions-me', await send('/admin/sessions/me', { cookie: first }))
show('sessions-all', await send('/admin/sessions?filter%5Bkeyword%5D=adm', { cookie: first }))
show(
  'posts-create',
  await send('/posts', { method: 'POST', cookie: first, body: { title: '첫 글', password: 'x' } }),
)
show(
  'revoke-others',
  await send('/admin/sessions/me/revoke-others', { method: 'POST', cookie: first }),
)
show('me-second-after', await send('/admin/auth/me', { cookie: second }))
show('audit-logs', await send('/admin/audit-logs?itemsPerPage=10', { cookie: first }))
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

Expected: 설치 성공. `tsc` 는 2a 때의 제3자 d.ts 6건(`@nestjs/platform-express` TS7016 3 · admin-shared `pagination.d.ts` TS2536 3) 말고는 오류가 없다 — 있으면 내용을 기록하고 `skipLibCheck: true` 로 한 번 더 돌려 패키지 쪽 오류가 없음을 확인한다. 마이그레이션 8장 · 시드 성공. 스텁 하나를 지우고 `npx kysely migrate latest` 를 돌리면 `빠진 장 0008_audit_logs` 로 멈추는지도 한 번 본다(되돌린다).

- [ ] **Step 5: 기동 · 요청**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected(본문은 줄여 적는다):

- `sessions-me 200 {"success":true,"data":{"items":[…두 행…]}}` — 한 행만 `"isCurrent":true`
- `sessions-all 200 {"success":true,"data":{"items":[…두 행, "userId":"admin"…],"total":"BigInt(2)","page":1,"itemsPerPage":20}}`
- `posts-create 201 {"success":true,"data":{"postNo":1}}` — 쓰는 쪽 라우트의 `@Audit`
- `revoke-others 200 {"success":true,"data":{"revokedCount":1}}`
- `me-second-after 401 {…}` — 끊긴 세션
- `audit-logs 200 {…"items":[…]…}` — 최신순으로 `session.revoke.others`(meta `{"revokedCount":1}`) · `board.post.create`(meta `{"title":"첫 글","password":"***"}`) · `auth.login.success` 둘, `actorUserId: "admin"`

`check.mjs` 가 "서버가 뜨지 않았다" 로 끝나면 `server.log` 를 본다. 셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
```

- [ ] **Step 7: 진행 문서를 고친다**

숫자(N · M)는 저장소 루트에서 `pnpm check` · `pnpm test:db` 를 돌린 결과로 채운다(admin-server 테스트 수 · DB 테스트 수, 워크스페이스 합계).

**`docs/01-phase0.md`**

① §2-3 의 `> **PR 2b 경계 결정 (2026-10-09)** — …` 단락 아래에 빈 줄을 두고 더한다:

```md
> **PR 2c 경계 결정 (2026-10-14)** — 패키지 라우트 권한은 슬롯 + 코어 옵션 `permissions` 맵(2d~2f 같은 틀), 세션은 `/admin/sessions` 6라우트(지금 세션 400 · 남의 세션 404), 감사는 hangang `@Audit` + 전역 인터셉터(커밋 뒤 · 응답 전에 기다림 · 실패는 경고), 감사 장 0008(+ `errorCode` · `sessionNo`, 익명 NULL), 카탈로그는 admin-shared `defineAuditCatalog`, 실패 기록은 핸들러 실패만, 모든 장 필수, 남의 세션 권한 상승 검사는 2d. 근거: `docs/superpowers/specs/2026-10-14-admin-server-sessions-audit-design.md` §2.
```

② §3-2 표에서 첫 칸이 `` `audit: { enabled `` 로 시작하는 행을 이 두 행으로 바꾼다:

```md
| `audit: { catalog, secretKeys }`(2c) — `enabled` 는 `AdminAuditModule` import, `sink` 는 내부(`ADMIN_AUTH_EVENTS`), `blacklist` → `secretKeys`(기본 10키에 더함, 대소문자 무시), 파티셔닝 없음 | 코어 카탈로그(인증 · 세션 액션 14) · 기본 비밀 키 | crm apiKey 주체·파티셔닝 |
| `permissions: { 'sessions.read', 'sessions.manage', 'auditLogs.read', … }`(2c) — 패키지 라우트의 권한 슬롯 → 프로젝트 키. 빠진 · 모르는 슬롯은 기동에서 멈춘다 | 없음(기능 모듈을 쓰면 필수) | 네 프로젝트의 서로 다른 키(hangang `org.users:*` · gise `account.session:manage` · axion `sessions:*` · crm `setting.session:*`) |
```

③ §8 표의 `@ssworks/admin-server` 행 상태 칸 끝(`… 다음 2c 세션 · 감사`)을 이렇게 바꾼다:

```md
… 다음 2c 세션 · 감사. **PR 2c 완료**(`feat/admin-server-sessions-audit`, 2026-10-14) — `AdminSessionsModule` 6라우트 · `AdminAuditModule`(`@Audit` · 전역 인터셉터 · 인증 이벤트 sink · 조회) · 권한 슬롯 · 감사 장 0008 · admin-shared 감사 카탈로그. N 테스트 + 실 MariaDB M. 스펙 `docs/superpowers/specs/2026-10-14-admin-server-sessions-audit-design.md` · 플랜 `docs/superpowers/plans/2026-10-14-admin-server-sessions-audit.md`. 다음 2d 사용자 · 역할
```

④ 표 아래 `다음: Phase 2 PR 2c 세션 · 감사(…).` 줄을 바꾼다:

```md
다음: Phase 2 PR 2d 사용자 · 역할(2a 스펙 §1-3 의 2d 행 · 2c 스펙 ⑪ D1 — 세션 관리 라우트의 권한 상승 검사).
```

**`docs/HANDOFF.md`**

- 첫 줄 날짜를 `# HANDOFF — 2026-10-14` 로.
- `@ssworks/admin-server` 행에서 2b 의 숫자 문장(`268 테스트 + 실 MariaDB 101.`)을 지우고 그 자리에 이 글을 넣는다(2c 숫자가 최신이다):

```md
**PR 2c**(세션 · 감사 — `AdminSessionsModule` 6라우트 · `AdminAuditModule` · 권한 슬롯 · 감사 장 0008, admin-shared 감사 카탈로그)는 `feat/admin-server-sessions-audit` 에서 구현 완료(2026-10-14). N 테스트 + 실 MariaDB M.
```

- "검증" 행 끝에 더한다: `PR 2c 는 Windows 에서 pnpm check · pnpm test:db 초록, 쓰는 쪽 스모크($TEMP/akss — 스텁 8 → 시드 → 기동 → 세션 목록 · 다른 세션 모두 → 끊긴 세션 401 → 감사 조회에 끊기 · 쓰는 쪽 @Audit(password ***) · 로그인 행)를 통과했다.`
- "다음 플랜" 행을 바꾼다: `Phase 2 PR 2d 사용자 · 역할 — 스펙부터(2a 스펙 §1-3 의 2d 행 · 2c 스펙 ⑪ D1 · §11). 직전 PR 2c: 스펙 docs/superpowers/specs/2026-10-14-admin-server-sessions-audit-design.md · 플랜 docs/superpowers/plans/2026-10-14-admin-server-sessions-audit.md`
- "PR 2a 최종 리뷰가 넘긴 것" 의 `2c 전:` 두 항목 끝에 각각 `→ **2c 에서 닫음**(resolveErrorResponse — 2c 스펙 §5-4)` · `→ **2c 에서 닫음**(모든 장 필수 — 2c 스펙 ⑨ M1)` 을 붙인다.
- "PR 2b 가 넘긴 것" 의 `2c:` 항목 끝에 `→ **2c 에서 닫음**(목록 메서드 · sink · 커밋 뒤 기록 — 2c 스펙 ⑤ T1)` 을 붙이고, `후속(최종 리뷰 Minor)` 목록의 `` `emit` 이 요청 안에서 기다림 · 경고에 sink 오류 문구(2c) `` 와 `유예 발급이 남기는 고아 세션(2c 세션 목록)` 뒤에 각각 `→ 2c: 기다림 유지(⑤ T1) · 경고 문구 B12` · `→ 2c: 그대로 보이고 README 에 적음(⑫ O1)` 을 붙인다.
- 그 아래에 더한다:

```md
- **PR 2c 가 넘긴 것(2026-10-14)**
  - 2d: 남의 세션을 끊을 때의 권한 상승 검사(⑪ D1 — `DELETE /sessions/:sessionNo` · `/sessions/user/:userNo`), 사용자 · 역할 슬롯을 `AdminPermissionSlot` · `ADMIN_PERMISSION_SLOTS` 에, 코어 감사 액션 `org.user.*` · `org.role.*` 를 admin-shared `CoreAuditActions` · 라벨에(개수 테스트를 함께 고친다).
  - 2e · 2f: 팀 · 약관 · IP 슬롯과 액션(`org.team.*` · `setting.ipAccess.*`), IP 차단의 `access.blocked` 는 이미 감사 행이 된다.
  - 감사 화면(admin-ui 에 없다 — 템플릿 B 가 `adminAuditLogSchema` · `labelOf` 로), 보존 · 청소(B), 가드 거부(401 · 403)는 남지 않는다(⑧ F1).
```

**`CLAUDE.md`**

- 패키지 표의 admin-server 행 설명을 `NestJS 12 모듈 (Phase 2 진행 — 2a 기반 · 2b 인증 · 2c 세션 · 감사 완료)` 로.
- `### @ssworks/admin-server (Phase 2)` 목록 끝에 두 줄을 더한다:

```md
- 패키지 라우트의 권한은 **슬롯**(`sessions.read` …)이다 — 키는 쓰는 쪽 `AdminServerOptions.permissions`. 새 슬롯은 `AdminPermissionSlot` · `ADMIN_PERMISSION_SLOTS` 에 더하고 그 모듈의 `onModuleInit` 에서 `assertPermissionSlots` · `assertAuthModuleRegistered`.
- 쓰기 라우트에는 `@Audit({ action, targetType })` — 코어 액션은 admin-shared `CoreAuditActions`(+ 라벨 · 개수 테스트)에 먼저 더한다(카탈로그 밖이면 기동에서 멈춘다). meta 는 `attachAuditMeta` · `attachAuditDiff`, 비밀 키는 쓸 때 가린다.
```

- 진행 표에서 `**Phase 2 PR 2c — 세션 · 감사**` 행을 `Phase 2 PR 2c — 세션 · 감사(`AdminSessionsModule`·`AdminAuditModule` · 권한 슬롯 · 감사 장)` · `완료` · `스펙 docs/superpowers/specs/2026-10-14-admin-server-sessions-audit-design.md · 플랜 docs/superpowers/plans/2026-10-14-admin-server-sessions-audit.md` 로 바꾸고, 그 아래에 `**Phase 2 PR 2d — 사용자 · 역할**` · `**다음**` · `2a 스펙 §1-3 · 2c 스펙 ⑪ D1` 행을 더한다.

- [ ] **Step 8: 포맷 · 확인 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-sessions-audit.md
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-sessions-audit.md
pnpm format:check
pnpm check
pnpm test:db
```

Expected: prettier 두 번째 실행은 `(unchanged)` 뿐(긴 마크다운 표는 한 번에 수렴하지 않는다), `format:check` · `check` · `test:db` 초록. 숫자를 문서에 넣은 뒤라면 다시 돌리지 않아도 된다.

```bash
git add packages/admin-server/README.md .changeset/admin-server-sessions-audit.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md docs/superpowers/specs/2026-10-14-admin-server-sessions-audit-design.md
git commit -m "docs: PR 2c 세션 · 감사 — README 권한 슬롯 · 세션 · 감사 절, changeset, 진행 문서, 다음 플랜은 2d" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 스펙 대조표 (자체 검토)

| 스펙                                                                     | Task                       |
| ------------------------------------------------------------------------ | -------------------------- |
| ① P1 슬롯 + 코어 옵션 맵 · 기동 실패 · 실행 중 403                       | 4 · 9 · 11                 |
| ② R1 `/admin/sessions` 6라우트                                           | 11 · 12                    |
| ③ C1 지금 세션 400 · gise 문구                                           | 11 · 12                    |
| ④ A1 `@Audit` + 전역 인터셉터                                            | 6 · 7 · 9                  |
| ⑤ T1 커밋 뒤 · 응답 전 기다림 · 실패는 경고                              | 7 · 8                      |
| ⑥ TB2 감사 장 + `errorCode` · `sessionNo` · NULL 허용                    | 5 · 7 · 12                 |
| ⑦ K1 admin-shared 카탈로그 · 행 · 조회 스키마 · 모르는 액션 기동 실패    | 2 · 9                      |
| ⑧ F1 핸들러 실패만 · `resolveErrorResponse`                              | 1 · 7 · 12                 |
| ⑨ M1 모든 장 필수                                                        | 5 · 13(changeset · 스모크) |
| ⑩ MD1 모듈 둘                                                            | 9 · 11                     |
| ⑪ D1 권한 상승 검사는 2d                                                 | 13(HANDOFF · README)       |
| ⑫ O1 고아 세션 그대로 · README                                           | 13                         |
| 공통 1 살아 있는 세션만 · 해시 비노출                                    | 10 · 12                    |
| 공통 2 `isCurrent`                                                       | 11 · 12                    |
| 공통 3 같은 404 · 조건부 UPDATE                                          | 10 · 11 · 12               |
| 공통 4 `terminated` · 사용자 전체에 지금 세션 포함 · 0건                 | 10 · 11 · 12               |
| 공통 5 검색 · 정렬                                                       | 10 · 11                    |
| 공통 6 · 7 기다림 · 두 번 기록 없음 · 폭 · 소독(+attachAuditMeta) · 접기 | 6 · 7 · 12                 |
| 공통 8 대상 id 규칙                                                      | 6                          |
| 공통 9 감사 조회 필터 · 반열림 · JOIN · `@Audit` 없음                    | 9 · 12                     |
| 공통 10 `resolveErrorResponse`                                           | 1                          |
| 공통 11 인증 이벤트 sink · 익명 NULL                                     | 8 · 12                     |
| B1 대소문자 무시 · `secretKeys`                                          | 6 · 7 · 12                 |
| B2 `attachAudit*` 함수 · 쓸 때 소독                                      | 6                          |
| B3 `filter[userNo]`                                                      | 11 · 12                    |
| B4 코어 users JOIN                                                       | 9 · 10                     |
| B5 `actorUserNo`                                                         | 2 · 5                      |
| B6 붙인 대상 먼저                                                        | 6                          |
| B7 순환 · 깊이                                                           | 6                          |
| B8 64 KiB                                                                | 6                          |
| B9 `liveOnly`                                                            | 10                         |
| B10 LIKE 도우미 셋                                                       | 3                          |
| B11 `@Public` + `@Audit` 기동 실패                                       | 9                          |
| B12 경고 문구                                                            | 7                          |
| B13 `queryBigIntSchema`                                                  | 2 · 11 · 12                |
| B14 기간 순서는 서버                                                     | 9 · 12                     |
| §9-1 · §9-2 · §9-3 테스트 계약                                           | 1~12                       |
| §10 README · changeset · 진행 문서                                       | 13                         |
| §14 R2~R6(플랜 작성 중 정정 — 스펙에 적었다)                             | 2 · 4 · 6 · 11 · 순서      |
