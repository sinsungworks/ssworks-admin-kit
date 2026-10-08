import {
  Catch,
  HttpException,
  Inject,
  Logger,
  Optional,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import {
  BusinessError,
  COMMON_ERROR_STATUS,
  CommonErrorCodes,
  stringifyJSON,
  type CommonErrorCode,
} from '@ssworks/admin-shared'
import type { Request, Response } from 'express'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { stringifyForLog, toJsonSafe } from './json-safe.js'

// 정본: ssworks-gise-home apps/api/src/core/filters/business-exception.filter.ts(`@Catch()` 전부 · 소독 경계 · 5xx 마스킹 ·
//       "반드시 응답" · logSafely · 상태 정규화) + hangang-home business-exception.filter.ts(stringifyJSON 으로 직접 보냄)
// 바꾼 점:
//  - 본문이 `{ success: false, code, message, details? }`(Phase 0 §4 #1). gise 는 `{ statusCode, … }`.
//  - 🔴 replacer 에 기대지 않는다 — 소독한 본문을 admin-shared `stringifyJSON` 으로 직접 보낸다(hangang). gise 는
//    `res.json()` 이라 `json replacer` 가 빠진 앱에서 bigint 가 든 오류 응답이 응답 없이 타임아웃했다.
//  - 상태 → 코드는 고정 표다. gise 는 코드표를 역조회했는데 admin-shared 는 같은 상태를 쓰는 코드가 여럿이다.
//  - Express 층 `http-errors`(본문 초과 413 — Nest 가 그대로 넘긴다)를 그 상태로 받는다. gise 는 500 이었다.
//  - 헤더가 이미 나갔으면 다시 보내지 않고 응답을 닫는다(스펙 R5).
//  - 로그는 문자열 하나로 — Nest `Logger.error(message, second)` 는 둘째 문자열이 스택처럼 보이지 않으면 context 로 읽는다.

interface ErrorBody {
  success: false
  code: string
  message: string
  details?: unknown
}

/** 5xx 응답에서 원문 대신 나가는 고정 문구. 원문은 로그로만 간다. */
const GENERIC_5XX_MESSAGE = '서버 내부 오류가 발생했습니다.'
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

/** Express 5 의 `res.status()` 는 정수가 아니거나 범위 밖이면 던진다(gise). */
function normalizeStatus(status: number): number {
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500
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

    let status: number
    let body: ErrorBody
    // 🔴 이 try/catch 를 "안전한 값만 다루니 필요 없다" 며 지우지 않는다 — 분기가 하나 늘면 같은 사고가 난다(gise).
    try {
      ;({ status, body } = this.toBody(exception, request))
    } catch (internalError) {
      this.logSafely(
        `${describeRequest(request)} — 예외 필터 내부 오류`,
        describeReason(internalError),
      )
      status = 500
      body = {
        success: false,
        code: CommonErrorCodes.ERR_COMMON_INTERNAL,
        message: GENERIC_5XX_MESSAGE,
      }
    }
    this.send(response, request, normalizeStatus(status), body)
  }

  private statusOf(code: string): number {
    if (this.options?.errorCodes) return errorStatus(this.options.errorCodes.httpStatusFor(code))
    return errorStatus(
      Object.hasOwn(COMMON_ERROR_STATUS, code)
        ? (COMMON_ERROR_STATUS as Readonly<Record<string, number>>)[code]
        : 500,
    )
  }

  private toBody(
    exception: unknown,
    request: Request | undefined,
  ): { status: number; body: ErrorBody } {
    if (exception instanceof BusinessError) {
      const status = this.statusOf(exception.code)
      if (status >= 500) {
        // 🔴 원문 · details 는 로그로만. details 는 클라이언트가 요청을 고치라고 주는 채널이라 5xx 에서는 뺀다(gise).
        this.log(request, exception.message, exception.cause ?? exception, exception.details)
        return {
          status,
          body: { success: false, code: exception.code, message: GENERIC_5XX_MESSAGE },
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
        this.log(request, messageOfHttpException(exception), exception)
        const masked = serverStatus(status)
        return {
          status: masked,
          body: { success: false, code: codeForStatus(masked), message: GENERIC_5XX_MESSAGE },
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

    this.log(request, '처리되지 않은 예외', exception)
    return {
      status: 500,
      body: {
        success: false,
        code: CommonErrorCodes.ERR_COMMON_INTERNAL,
        message: GENERIC_5XX_MESSAGE,
      },
    }
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
