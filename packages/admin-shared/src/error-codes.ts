/**
 * 에러 코드 — 클라이언트가 분기하는 유일한 문자열.
 *
 * 정본: hangang-home `packages/shared/src/errors/error-codes.ts` 의 명명(`ERR_COMMON_*`, 값=키)
 *       + ssworks-gise-home `packages/shared/src/errors/codes.ts` 의 구조(코드→HTTP 상태 단일표를
 *       `Record<Code, number>` 로 강제, `BusinessError` 는 Nest 무의존).
 *
 * 🔴 **`HttpException` 을 상속하는 예외는 여기 오지 않는다.** 이 패키지는 브라우저 번들도
 *    소비한다. 서비스 계층은 `BusinessError` 만 던지고, 서버 패키지의 예외 필터가
 *    `httpStatusFor(code)` 로 상태를 정해 `{ success: false, code, message, details? }` 로
 *    직렬화한다.
 *
 * 🔴 **같은 코드가 두 상태로 나가지 않는다.** 상류(crm-v5)는 `ERR_RESIGNED_USER` 를 로그인에서
 *    403, 가드에서 401 로 냈다 — 던지는 쪽이 매번 손으로 적었기 때문이다. 여기서는 표 하나다.
 */

export const CommonErrorCodes = {
  // ── 공용 ────────────────────────────────────────────────────────────────
  /** 형식은 맞았으나 요청 자체가 잘못됨. 매핑되지 않은 4xx 의 기본값 */
  ERR_COMMON_BAD_REQUEST: 'ERR_COMMON_BAD_REQUEST',
  /** zod 파싱 실패 · 형식 위반. `details.issues` 에 필드별 사유가 실린다 */
  ERR_COMMON_VALIDATION: 'ERR_COMMON_VALIDATION',
  /** 인증 자체가 없음 */
  ERR_COMMON_UNAUTHORIZED: 'ERR_COMMON_UNAUTHORIZED',
  /** 인증은 됐으나 권한이 없음. fail-closed 가드의 기본 응답 */
  ERR_COMMON_FORBIDDEN: 'ERR_COMMON_FORBIDDEN',
  ERR_COMMON_NOT_FOUND: 'ERR_COMMON_NOT_FOUND',
  /** 상태 전이 충돌(이미 처리됨 · 지금 상태에서 허용되지 않는 전이). 중복 값은 `ERR_COMMON_DUPLICATED` */
  ERR_COMMON_CONFLICT: 'ERR_COMMON_CONFLICT',
  /**
   * 낙관적 잠금(revision) 불일치 — 다른 곳에서 먼저 바뀌었다. 프론트는 다시 불러오기를 안내한다.
   * 🔴 `ERR_COMMON_CONFLICT` 와 가른다. 한 코드에 두 뜻을 실으면 프론트가 "다시 불러오기" 와
   *    "값을 고치세요" 를 구분하지 못한다(gise 역할 폼이 실제로 겪었다).
   */
  ERR_COMMON_REVISION_CONFLICT: 'ERR_COMMON_REVISION_CONFLICT',
  /** 유니크 제약 위반 */
  ERR_COMMON_DUPLICATED: 'ERR_COMMON_DUPLICATED',
  /** 다른 행이 참조 중이라 삭제·변경 불가 (FK restrict) */
  ERR_COMMON_IN_USE: 'ERR_COMMON_IN_USE',
  ERR_COMMON_PAYLOAD_TOO_LARGE: 'ERR_COMMON_PAYLOAD_TOO_LARGE',
  ERR_COMMON_TOO_MANY_REQUESTS: 'ERR_COMMON_TOO_MANY_REQUESTS',
  /** 처리되지 않은 서버 오류. 내부 사유는 절대 응답에 넣지 않는다 */
  ERR_COMMON_INTERNAL: 'ERR_COMMON_INTERNAL',
  ERR_COMMON_UNAVAILABLE: 'ERR_COMMON_UNAVAILABLE',
  ERR_COMMON_TIMEOUT: 'ERR_COMMON_TIMEOUT',

  // ── 인증 · 세션 ─────────────────────────────────────────────────────────
  /** 로그인 아이디·비밀번호 불일치. 🔴 존재 여부를 가르지 않는다(열거 방어) */
  ERR_LOGIN_FAILED: 'ERR_LOGIN_FAILED',
  /** 토큰 서명 불일치 · 형식 오류 · 폐기된 세션 */
  ERR_INVALID_TOKEN: 'ERR_INVALID_TOKEN',
  /** 액세스 토큰 만료 — 프론트가 조용히 갱신을 시도할 신호 */
  ERR_EXPIRED_TOKEN: 'ERR_EXPIRED_TOKEN',
  /** 리프레시 세션이 만료됐거나 폐기됨 */
  ERR_SESSION_EXPIRED: 'ERR_SESSION_EXPIRED',
  /** 이미 회전된 리프레시 토큰의 재사용 탐지 — 세션 전량 폐기 신호 */
  ERR_REFRESH_REUSED: 'ERR_REFRESH_REUSED',
  /** 연속 실패로 잠긴 계정 */
  ERR_ACCOUNT_LOCKED: 'ERR_ACCOUNT_LOCKED',
  /** 비활성(퇴사) 계정 */
  ERR_RESIGNED_USER: 'ERR_RESIGNED_USER',
  /** 허용되지 않은 접속 위치 (IP 접근 제어) */
  ERR_IP_NOT_ALLOWED: 'ERR_IP_NOT_ALLOWED',
  /** 민감 작업 재인증 실패 — `currentPassword` 불일치 */
  ERR_REAUTH_REQUIRED: 'ERR_REAUTH_REQUIRED',
  /** 비밀번호 변경 시 현재 비밀번호 불일치 */
  ERR_WRONG_PASSWORD: 'ERR_WRONG_PASSWORD',
  /** 첫 로그인·초기화 뒤 비밀번호를 바꿔야 다른 요청이 허용됨 */
  ERR_PASSWORD_CHANGE_REQUIRED: 'ERR_PASSWORD_CHANGE_REQUIRED',

  // ── 조직 ────────────────────────────────────────────────────────────────
  ERR_NO_USER: 'ERR_NO_USER',
  ERR_DUPLICATE_USER_ID: 'ERR_DUPLICATE_USER_ID',
  ERR_NO_ROLE: 'ERR_NO_ROLE',
  ERR_DUPLICATE_ROLE_NAME: 'ERR_DUPLICATE_ROLE_NAME',
  ERR_NO_TEAM: 'ERR_NO_TEAM',
  ERR_DUPLICATE_TEAM_NAME: 'ERR_DUPLICATE_TEAM_NAME',
} as const

export type CommonErrorCode = (typeof CommonErrorCodes)[keyof typeof CommonErrorCodes]

/**
 * 코어 코드의 HTTP 상태 — 이 표가 상태 코드의 유일한 출처다.
 *
 * `Record<CommonErrorCode, number>` 로 못박았으므로 코드를 더하고 여기를 빠뜨리면 컴파일이
 * 실패한다. 프로젝트는 `defineErrorCodes()` 의 두 번째 인자로 덮어쓸 수 있다
 * (예: `ERR_ACCOUNT_LOCKED` 를 423 대신 403 으로).
 */
export const COMMON_ERROR_STATUS: Record<CommonErrorCode, number> = {
  [CommonErrorCodes.ERR_COMMON_BAD_REQUEST]: 400,
  [CommonErrorCodes.ERR_COMMON_VALIDATION]: 400,
  [CommonErrorCodes.ERR_COMMON_UNAUTHORIZED]: 401,
  [CommonErrorCodes.ERR_COMMON_FORBIDDEN]: 403,
  [CommonErrorCodes.ERR_COMMON_NOT_FOUND]: 404,
  [CommonErrorCodes.ERR_COMMON_CONFLICT]: 409,
  [CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT]: 409,
  [CommonErrorCodes.ERR_COMMON_DUPLICATED]: 409,
  [CommonErrorCodes.ERR_COMMON_IN_USE]: 409,
  [CommonErrorCodes.ERR_COMMON_PAYLOAD_TOO_LARGE]: 413,
  [CommonErrorCodes.ERR_COMMON_TOO_MANY_REQUESTS]: 429,
  [CommonErrorCodes.ERR_COMMON_INTERNAL]: 500,
  [CommonErrorCodes.ERR_COMMON_UNAVAILABLE]: 503,
  [CommonErrorCodes.ERR_COMMON_TIMEOUT]: 504,

  [CommonErrorCodes.ERR_LOGIN_FAILED]: 401,
  [CommonErrorCodes.ERR_INVALID_TOKEN]: 401,
  [CommonErrorCodes.ERR_EXPIRED_TOKEN]: 401,
  [CommonErrorCodes.ERR_SESSION_EXPIRED]: 401,
  [CommonErrorCodes.ERR_REFRESH_REUSED]: 401,
  // 🔴 401 이 아니다 — 401 은 프론트 클라이언트의 토큰 갱신 트리거다. 잠금·퇴사·IP 차단은
  //    갱신해도 풀리지 않으므로 401 로 내면 갱신 → 401 → 갱신 루프가 된다.
  [CommonErrorCodes.ERR_ACCOUNT_LOCKED]: 423,
  [CommonErrorCodes.ERR_RESIGNED_USER]: 403,
  [CommonErrorCodes.ERR_IP_NOT_ALLOWED]: 403,
  [CommonErrorCodes.ERR_REAUTH_REQUIRED]: 403,
  [CommonErrorCodes.ERR_WRONG_PASSWORD]: 400,
  [CommonErrorCodes.ERR_PASSWORD_CHANGE_REQUIRED]: 403,

  [CommonErrorCodes.ERR_NO_USER]: 404,
  [CommonErrorCodes.ERR_DUPLICATE_USER_ID]: 409,
  [CommonErrorCodes.ERR_NO_ROLE]: 404,
  [CommonErrorCodes.ERR_DUPLICATE_ROLE_NAME]: 409,
  [CommonErrorCodes.ERR_NO_TEAM]: 404,
  [CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME]: 409,
}

export interface ErrorCodeTable<T extends Record<string, string>> {
  /** 코어 코드 + 프로젝트 코드. */
  readonly ErrorCodes: Readonly<typeof CommonErrorCodes> & Readonly<T>
  readonly ERROR_CODE_VALUES: readonly (CommonErrorCode | T[keyof T])[]
  isErrorCode(value: string): value is CommonErrorCode | T[keyof T]
  /**
   * 코드의 HTTP 상태. 표에 없는 값(외부 입력을 캐스팅한 경우)은 4xx 를 지어내지 않고
   * 500 으로 떨어뜨린다.
   */
  httpStatusFor(code: string): number
}

/** `defineErrorCodes()` 반환값에서 코드 유니온 타입을 뽑는다. */
export type ErrorCodeOf<E> =
  E extends ErrorCodeTable<infer T> ? CommonErrorCode | T[keyof T] : never

/**
 * 프로젝트 에러 코드를 코어 코드에 병합한다. 프로젝트 코드마다 상태를 반드시 적어야 하고,
 * 코어 코드의 상태는 선택적으로 덮어쓴다.
 *
 * ```ts
 * export const errors = defineErrorCodes(
 *   { ERR_NO_POST: 'ERR_NO_POST', STORAGE_NOT_CONFIGURED: 'STORAGE_NOT_CONFIGURED' },
 *   { ERR_NO_POST: 404, STORAGE_NOT_CONFIGURED: 503, ERR_ACCOUNT_LOCKED: 403 },
 * )
 * ```
 */
export function defineErrorCodes<const T extends Record<string, string>>(
  codes: T,
  status: Record<T[keyof T], number> & Partial<Record<CommonErrorCode, number>>,
): ErrorCodeTable<T> {
  type Code = CommonErrorCode | T[keyof T]

  const overlapping = Object.keys(codes).filter((key) => key in CommonErrorCodes)
  if (overlapping.length > 0) {
    throw new Error(`defineErrorCodes: 코어 코드와 키가 겹친다: ${overlapping.join(', ')}`)
  }

  const ErrorCodes = Object.freeze({ ...CommonErrorCodes, ...codes })
  const ERROR_CODE_VALUES = Object.freeze(Object.values(ErrorCodes) as Code[])
  const valueSet: ReadonlySet<string> = new Set(ERROR_CODE_VALUES)
  const statusTable: Record<string, number> = { ...COMMON_ERROR_STATUS, ...status }

  const missing = ERROR_CODE_VALUES.filter((code) => statusTable[code] == null)
  if (missing.length > 0) {
    throw new Error(`defineErrorCodes: HTTP 상태가 없는 코드: ${missing.join(', ')}`)
  }

  return {
    ErrorCodes,
    ERROR_CODE_VALUES,
    isErrorCode: (value): value is Code => valueSet.has(value),
    httpStatusFor: (code) => statusTable[code] ?? 500,
  }
}

/**
 * 도메인 규칙 위반을 나타내는 예외. HTTP 를 모른다.
 *
 * `details` 와 `options.cause` 는 목적지가 다르다. `details` 는 **응답 본문에 실린다**
 * (검증 이슈 목록 같은 사용자용 정보). `cause` 는 **응답에 절대 실리지 않고** 5xx 로그로만
 * 간다 — 내부 사유를 실수로 `details` 에 넣지 않도록 자리를 따로 둔 것이다.
 */
export class BusinessError<C extends string = string> extends Error {
  readonly code: C
  readonly details?: unknown

  constructor(code: C, message?: string, details?: unknown, options?: { cause?: unknown }) {
    super(message ?? code, options)
    this.name = 'BusinessError'
    this.code = code
    this.details = details
  }
}

export function isBusinessError(value: unknown): value is BusinessError {
  return value instanceof BusinessError
}
