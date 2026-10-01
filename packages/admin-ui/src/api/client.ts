import Axios from 'axios'
import type {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios'
import { isSuccessResp, parseJSON, stringifyJSON } from '@ssworks/admin-shared'
import { ApiError, toApiError } from './error.js'

// 정본: hangang-home apps/admin/src/api/client.ts (crm 정본 · gise `onAuthFailure`/`refreshInFlight` ·
//   axion `NO_RETRY_PATHS` 를 합쳤다)
// 바꾼 점:
//  - 🔴 모듈 싱글턴이 아니라 팩토리다. 스토어·라우터를 import 하지 않는다 — 앱에는 `onAuthFailure` ·
//    `onError` 콜백으로만 닿는다. hangang 의 동적 import(스토어 ↔ 라우터 ↔ API 순환 회피)가 통째로 사라진다.
//  - 갱신 경쟁: `isRefreshing` + 대기 큐 대신 **공유 Promise 하나**(gise). 실패하면 모든 대기자가 같은 이유로
//    거부되고 `onAuthFailure` 는 한 번만 돈다.
//  - 봉투(결정 1)·bigint(결정 3)를 기본으로 켠다. 요청 직렬화는 hangang 과 같고 응답은 봉투를 벗긴다.
//  - SSE 헤더·`/auth/refresh` 하드코딩(`includes`)·IP 차단 → 스토어 분기를 뺐다(→ `onError`).

export interface ApiClientOptions {
  baseURL: string
  /** 갱신 엔드포인트. 이 경로 자신의 401 은 다시 갱신하지 않는다. */
  refreshPath?: string
  /** 401 이어도 갱신하지 않는 경로(로그인 실패는 "비밀번호 틀림" 이다). */
  noRetryPaths?: string[]
  /** 🔴 기본 'success-data'. 'none' 이면 본문 그대로. */
  envelope?: 'success-data' | 'none'
  /** 🔴 기본 true — `"BigInt(n)"` 래퍼 + Date 코덱. */
  bigint?: boolean
  /** 갱신이 실패했다 = 로그아웃 상태다. 한 번의 실패에 한 번 불린다. */
  onAuthFailure?: () => void
  /** `api.*` 가 거부하는 최종 실패마다 한 번. 갱신으로 복구되는 중간 401 은 안 불린다. */
  onError?: (error: ApiError) => void
}

export interface ApiClient {
  axios: AxiosInstance
  api: {
    get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
    post<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T>
    patch<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T>
    put<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T>
    /** 🔴 본문을 싣는다 — 민감 작업 재인증 비밀번호가 DELETE 본문으로 간다. */
    del<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T>
  }
  /** 갱신 실패 리스너를 더한다. 옵션의 `onAuthFailure` 와 함께 각각 한 번씩 불린다. */
  onAuthFailure(fn: () => void): void
}

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

export function serializeParams(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  const append = (key: string, value: unknown): void => {
    if (value == null) return
    if (typeof value === 'boolean') search.append(key, value ? '1' : '')
    else if (value instanceof Date) search.append(key, value.toISOString())
    else if (Array.isArray(value)) {
      for (const item of value) if (item != null) search.append(key, String(item))
    } else if (typeof value === 'object') {
      for (const [sub, v] of Object.entries(value)) append(`${key}[${sub}]`, v)
    } else search.append(key, String(value))
  }
  for (const [key, value] of Object.entries(params)) append(key, value)
  return search.toString()
}

/** 경로 비교용 — 쿼리·해시를 떼고 baseURL 은 애초에 config.url 에 없다. */
function pathOf(url: string | undefined): string {
  return (url ?? '').split(/[?#]/)[0] ?? ''
}

function isPlainBody(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false
  return Array.isArray(data) || Object.getPrototypeOf(data) === Object.prototype
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const {
    baseURL,
    refreshPath = '/auth/refresh',
    noRetryPaths = ['/auth/login'],
    envelope = 'success-data',
    bigint = true,
    onAuthFailure,
    onError,
  } = options

  const instance = Axios.create({
    baseURL,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
    paramsSerializer: { serialize: serializeParams },
    ...(bigint
      ? {
          transformResponse: [
            (data: unknown) => {
              if (typeof data !== 'string' || data.length === 0) return data
              try {
                return parseJSON(data)
              } catch {
                // 🔴 JSON 이 아니면(502 HTML 등) 원문 그대로. 여기서 던지면 응답 인터셉터 밖에서 터져
                //    401 갱신 경로를 통째로 건너뛴다.
                return data
              }
            },
          ],
        }
      : {}),
  })

  instance.interceptors.request.use((config) => {
    // 🔴 인스턴스 기본 `Content-Type: application/json` 이 FormData 를 죽인다(axios 가 FormData 를
    //    JSON 으로 바꿔 파일이 `{}` 로 증발). 손으로 multipart 를 적어도 boundary 가 없어 깨진다 —
    //    지워야 브라우저가 boundary 를 붙인다.
    if (config.data instanceof FormData) {
      config.headers.delete('Content-Type')
      return config
    }
    // FormData · Blob · URLSearchParams · 문자열은 그대로. 평범한 객체/배열만 코덱을 태운다.
    if (bigint && isPlainBody(config.data)) {
      config.data = stringifyJSON(config.data)
      config.headers.set('Content-Type', 'application/json')
    }
    return config
  })

  const authFailureListeners: (() => void)[] = onAuthFailure ? [onAuthFailure] : []
  const notifyAuthFailure = (): void => {
    for (const fn of authFailureListeners) {
      try {
        fn()
      } catch (error) {
        console.error('onAuthFailure 리스너 오류', error)
      }
    }
  }

  // 🔴 갱신은 공유 Promise 하나다. 동시 401 은 여기에 합류하고, 실패 통지(`onAuthFailure`)도 이 Promise
  //    안에서 한 번만 한다. 끝나면(성공이든 실패든) 비워 이후 401 이 다시 갱신할 수 있게 한다.
  let refreshing: Promise<void> | null = null
  const refresh = (): Promise<void> => {
    if (refreshing) return refreshing
    const run: Promise<void> = instance
      .post(refreshPath)
      .then(
        () => undefined,
        (error: unknown) => {
          notifyAuthFailure()
          throw error
        },
      )
      .finally(() => {
        if (refreshing === run) refreshing = null
      })
    refreshing = run
    return run
  }

  const noRefresh = new Set([refreshPath, ...noRetryPaths])

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as RetryConfig | undefined
      if (original == null || error.response?.status !== 401) throw error
      // 🔴 `_retry` 는 큐에 합류하기 **전에** 세운다 — 갱신 직후 또 401 이면 처음부터 다시 갱신하지 않는다.
      if (original._retry || noRefresh.has(pathOf(original.url))) throw error
      original._retry = true
      await refresh() // 실패하면 갱신 오류로 거부 — 대기자 전부 같은 이유.
      return instance(original)
    },
  )

  async function request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const { data } = await instance.request<unknown>(config)
      if (envelope === 'none') return data as T
      if (isSuccessResp(data)) return (data as { data: T }).data
      if (
        typeof data === 'object' &&
        data !== null &&
        (data as { success?: unknown }).success === false
      ) {
        const body = data as { code?: unknown; message?: unknown; details?: unknown }
        throw new ApiError(
          typeof body.message === 'string' ? body.message : '요청이 실패했습니다',
          {
            status: 200,
            code: typeof body.code === 'string' ? body.code : undefined,
            details: body.details,
            raw: data,
          },
        )
      }
      return data as T // 봉투가 아닌 본문(204 빈 본문 등)
    } catch (error) {
      const apiError = toApiError(error)
      try {
        onError?.(apiError)
      } catch (hookError) {
        console.error('onError 훅 오류', hookError)
      }
      throw apiError
    }
  }

  const withBody =
    (method: 'post' | 'patch' | 'put' | 'delete') =>
    <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
      request<T>({ ...config, url, method, data: body })

  return {
    axios: instance,
    api: {
      get: <T>(url: string, config?: AxiosRequestConfig) =>
        request<T>({ ...config, url, method: 'get' }),
      post: withBody('post'),
      patch: withBody('patch'),
      put: withBody('put'),
      del: withBody('delete'),
    },
    onAuthFailure(fn) {
      authFailureListeners.push(fn)
    },
  }
}
