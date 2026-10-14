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
