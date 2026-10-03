import { isAxiosError } from 'axios'
import { isErrorResp } from '@ssworks/admin-shared'

// 정본: hangang-home apps/admin/src/api/client.ts 의 `ErrorResp` 와 crm 의 오류 처리를 합쳤다.
// 바꾼 점: 서버 봉투 타입이 아니라 던지는 쪽 `Error` 클래스로 만들었다. 결정 1 의 실패 봉투
//   `{success:false,code,message,details?}` 와 과도기 형태 `{statusCode,code?,message}`(NestJS 기본
//   예외 포함)를 한 모양으로 읽는다.

export class ApiError extends Error {
  readonly status?: number
  readonly code?: string
  readonly details?: unknown
  /** 원본 — AxiosError 또는 응답 본문. 모양이 다른 서버 오류를 호출자가 직접 읽을 때 쓴다. */
  readonly raw: unknown
  /**
   * 🔴 호출처가 이 오류를 화면에 직접 보였다는 표시(재인증 다이얼로그 안 문구 · 필드 오류 · 충돌 안내).
   *    `createApiClient` 는 `onError` 를 한 매크로태스크 뒤에 부르고, 그때 이 값이 true 면 건너뛴다 —
   *    전역 토스트로 두 번 알리지 않는다. `catch` 안에서 **동기로**(또는 마이크로태스크 안에서) 세운다.
   *    타이머를 한 번이라도 기다린 뒤 세우면 이미 늦다.
   */
  handled = false

  constructor(
    message: string,
    init: { status?: number; code?: string; details?: unknown; raw: unknown },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.details = init.details
    this.raw = init.raw
  }
}

function asMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value
  // NestJS ValidationPipe 는 message 를 문자열 배열로 낸다.
  if (Array.isArray(value) && value.length > 0) return value.map(String).join('\n')
  return undefined
}

/** 어떤 거부 이유든 `ApiError` 로 만든다. 이미 `ApiError` 면 그대로. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (isAxiosError(error)) {
    const status = error.response?.status
    const body: unknown = error.response?.data
    if (isErrorResp(body)) {
      return new ApiError(body.message, {
        status,
        code: body.code,
        details: body.details,
        raw: error,
      })
    }
    if (typeof body === 'object' && body !== null) {
      const legacy = body as {
        statusCode?: unknown
        code?: unknown
        message?: unknown
        details?: unknown
      }
      return new ApiError(asMessage(legacy.message) ?? error.message, {
        status: typeof legacy.statusCode === 'number' ? legacy.statusCode : status,
        code: typeof legacy.code === 'string' ? legacy.code : undefined,
        details: legacy.details,
        raw: error,
      })
    }
    return new ApiError(error.message, { status, raw: error })
  }

  return new ApiError(error instanceof Error ? error.message : String(error), { raw: error })
}
