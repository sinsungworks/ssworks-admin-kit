import { AxiosError } from 'axios'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './error.js'
import { createApiClient } from './client.js'

// 정본: hangang-home apps/admin/src/api/client.test.ts (어댑터 교체 방식 · 갱신 경쟁 · FormData 절)
// 바꾼 점:
//  - 모듈 싱글턴이 아니라 팩토리라 테스트마다 새 클라이언트를 만든다(상태 공유 없음).
//  - 스토어·라우터 대신 onAuthFailure · onError 호출을 단언한다.
//  - hangang 은 봉투·bigint 기본값이 없는 쪽이었다 — 기본 경로(success-data + bigint)를 추가했고,
//    원문 본문이 필요한 곳은 envelope: 'none' 을 명시한다.

interface Seen {
  method?: string
  url?: string
  data?: unknown
  params?: unknown
  headers: Record<string, unknown>
  config: InternalAxiosRequestConfig
}

type Reply = { status?: number; body?: unknown; raw?: string }

/** 어댑터를 갈아 끼운다. 상태 검증(settle)이 어댑터 몫이라 4xx/5xx 는 던진다. */
function stub(
  client: ReturnType<typeof createApiClient>,
  handler: (config: InternalAxiosRequestConfig, seen: Seen[]) => Reply | Promise<Reply>,
): Seen[] {
  const seen: Seen[] = []
  const adapter: AxiosAdapter = async (config) => {
    seen.push({
      method: config.method,
      url: config.url,
      data: config.data,
      params: config.params,
      headers: { ...(config.headers.toJSON() as Record<string, unknown>) },
      config,
    })
    const reply = await handler(config, seen)
    const status = reply.status ?? 200
    const data = reply.raw ?? (reply.body === undefined ? '' : JSON.stringify(reply.body))
    const response = { data, status, statusText: '', headers: {}, config }
    if (status >= 200 && status < 300) return response
    throw new AxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_REQUEST',
      config,
      null,
      response,
    )
  }
  client.axios.defaults.adapter = adapter
  return seen
}

const ok = (data: unknown): Reply => ({ body: { success: true, data } })
const unauthorized = (): Reply => ({
  status: 401,
  body: { success: false, code: 'ERR_AUTH_UNAUTHORIZED', message: 'x' },
})
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('봉투 · bigint 기본 경로', () => {
  it('기본값은 success-data + bigint — data 만 벗기고 BigInt 래퍼를 bigint 로 되살린다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    stub(client, () => ok({ userNo: 'BigInt(1)' }))
    expect(await client.api.get('/me')).toEqual({ userNo: 1n })
  })

  it("envelope: 'none' 은 본문 그대로", async () => {
    const client = createApiClient({ baseURL: '/api', envelope: 'none' })
    stub(client, () => ok({ a: 1 }))
    expect(await client.api.get('/x')).toEqual({ success: true, data: { a: 1 } })
  })

  it('bigint: false 면 래퍼 문자열을 그대로 둔다', async () => {
    const client = createApiClient({ baseURL: '/api', bigint: false })
    stub(client, () => ok({ n: 'BigInt(1)' }))
    expect(await client.api.get('/x')).toEqual({ n: 'BigInt(1)' })
  })

  it('요청 본문의 bigint 가 래퍼로 나가고 Content-Type 은 json', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ok(null))
    await client.api.post('/posts', { postNo: 10n })
    expect(seen[0]?.data).toBe('{"postNo":"BigInt(10)"}')
    expect(String(seen[0]?.headers['Content-Type'])).toContain('application/json')
  })

  it('JSON 이 아닌 본문 · 빈 본문(204)에 던지지 않는다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    stub(client, () => ({ raw: '<html>502</html>' }))
    expect(await client.api.get('/x')).toBe('<html>502</html>')
    stub(client, () => ({ status: 204 }))
    expect(await client.api.get('/x')).toBe('')
  })

  it('200 인데 success:false 면 ApiError 로 거부한다', async () => {
    const onError = vi.fn()
    const client = createApiClient({ baseURL: '/api', onError })
    stub(client, () => ({ body: { success: false, code: 'ERR_X', message: 'm' } }))
    await expect(client.api.get('/x')).rejects.toMatchObject({ code: 'ERR_X', message: 'm' })
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

describe('요청 래퍼', () => {
  it('del() · put() 이 본문을 싣는다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ok(null))
    await client.api.del('/roles/3', { currentPassword: 'x' })
    await client.api.put('/settings', { b: 'b' })
    await client.api.patch('/p', { c: 1 })
    expect(seen.map((s) => s.method)).toEqual(['delete', 'put', 'patch'])
    expect(seen[0]?.data).toBe('{"currentPassword":"x"}')
    expect(seen[1]?.data).toBe('{"b":"b"}')
  })

  it('본문 없는 del() · put() 도 그대로 나간다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ok(null))
    await client.api.del('/a')
    await client.api.put('/b')
    expect(seen[0]?.data).toBeUndefined()
    expect(seen[1]?.data).toBeUndefined()
  })

  it('FormData 는 Content-Type 을 지우고 그대로 보낸다 — JSON 으로 바뀌면 파일이 증발한다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ok(null))
    const fd = new FormData()
    fd.append('file', new Blob(['bytes']), 'a.png')
    await client.api.post('/upload', fd)
    expect(seen[0]?.data).toBeInstanceOf(FormData)
    const ct = String(seen[0]?.headers['Content-Type'] ?? '')
    expect(ct).not.toContain('application/json')
  })

  it('URLSearchParams · Blob · 직렬화된 문자열 본문은 건드리지 않는다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ok(null))
    const usp = new URLSearchParams({ a: '1' })
    const blob = new Blob(['x'])
    await client.api.post('/a', usp)
    await client.api.post('/b', blob)
    await client.api.post('/c', '{"a":"BigInt(1)"}')
    expect(seen[0]?.data).toBe('a=1') // axios 자신의 직렬화 — JSON 코덱을 안 탔다
    expect(seen[1]?.data).toBe(blob)
    expect(seen[2]?.data).toBe('{"a":"BigInt(1)"}') // 직렬화된 JSON 문자열은 이중 직렬화되지 않는다
  })
})

describe('ApiError 정규화 · onError', () => {
  it('실패 봉투 → ApiError{status,code,message,details}', async () => {
    const onError = vi.fn()
    const client = createApiClient({ baseURL: '/api', onError })
    stub(client, () => ({
      status: 400,
      body: { success: false, code: 'ERR_COMMON_VALIDATION', message: '검증', details: { a: 1 } },
    }))
    const error = await client.api.get('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      code: 'ERR_COMMON_VALIDATION',
      message: '검증',
      details: { a: 1 },
    })
    expect((error as ApiError).raw).toBeDefined()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('{statusCode, code, message} 형도 읽는다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    stub(client, () => ({
      status: 403,
      body: {
        statusCode: 403,
        code: 'ERR_IP_NOT_ALLOWED',
        message: '차단',
        details: { clientIp: '1.2.3.4' },
      },
    }))
    await expect(client.api.get('/x')).rejects.toMatchObject({
      status: 403,
      code: 'ERR_IP_NOT_ALLOWED',
      message: '차단',
      details: { clientIp: '1.2.3.4' },
    })
  })

  it('code 없는 NestJS 오류(message 만)도 읽는다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    stub(client, () => ({ status: 404, body: { statusCode: 404, message: 'Not Found' } }))
    const error = (await client.api.get('/x').catch((e: unknown) => e)) as ApiError
    expect(error).toMatchObject({ status: 404, message: 'Not Found' })
    expect(error.code).toBeUndefined()
  })

  it('네트워크 오류는 status 가 undefined', async () => {
    const onError = vi.fn()
    const client = createApiClient({ baseURL: '/api', onError })
    client.axios.defaults.adapter = async (config) => {
      throw new AxiosError('Network Error', 'ERR_NETWORK', config)
    }
    const error = (await client.api.get('/x').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBeUndefined()
    expect(error.message).toBe('Network Error')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('JSON 이 아닌 502 본문도 ApiError 로 거부한다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    stub(client, () => ({ status: 502, raw: '<html>502</html>' }))
    await expect(client.api.get('/x')).rejects.toMatchObject({ status: 502 })
  })

  it('성공하면 onError 는 안 불린다', async () => {
    const onError = vi.fn()
    const client = createApiClient({ baseURL: '/api', onError })
    stub(client, () => ok(1))
    await client.api.get('/x')
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('401 갱신', () => {
  it('401 → refreshPath 1회 → 원 요청 재시도, 중간 401 은 onError 를 안 부른다', async () => {
    const onError = vi.fn()
    const onAuthFailure = vi.fn()
    const client = createApiClient({ baseURL: '/api', onError, onAuthFailure })
    let first = true
    const seen = stub(client, (config) => {
      if (config.url === '/auth/refresh') return ok(null)
      if (first) {
        first = false
        return unauthorized()
      }
      return ok({ v: 1 })
    })
    expect(await client.api.get('/me')).toEqual({ v: 1 })
    expect(seen.map((s) => s.url)).toEqual(['/me', '/auth/refresh', '/me'])
    expect(onError).not.toHaveBeenCalled()
    expect(onAuthFailure).not.toHaveBeenCalled()
  })

  it('🔴 동시 401 셋 → 갱신 1회', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const tried = new Set<string>()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const seen = stub(client, async (config) => {
      if (config.url === '/auth/refresh') {
        await gate
        return ok(null)
      }
      if (!tried.has(config.url ?? '')) {
        tried.add(config.url ?? '')
        return unauthorized()
      }
      return ok(config.url)
    })
    const all = Promise.all([client.api.get('/a'), client.api.get('/b'), client.api.get('/c')])
    await tick()
    await tick()
    release()
    expect(await all).toEqual(['/a', '/b', '/c'])
    expect(seen.filter((s) => s.url === '/auth/refresh')).toHaveLength(1)
  })

  it('🔴 갱신 실패 → 대기 전부 reject + onAuthFailure 1회(옵션·등록 각 1회) + onError 는 요청별 1회', async () => {
    const onAuthFailure = vi.fn()
    const onError = vi.fn()
    const client = createApiClient({ baseURL: '/api', onAuthFailure, onError })
    const registered = vi.fn()
    client.onAuthFailure(registered)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const seen = stub(client, async (config) => {
      if (config.url === '/auth/refresh') {
        await gate
        return unauthorized()
      }
      return unauthorized()
    })
    const settled = Promise.allSettled([
      client.api.get('/a'),
      client.api.get('/b'),
      client.api.get('/c'),
    ])
    await tick()
    await tick()
    release()
    const results = await settled
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected'])
    expect(seen.filter((s) => s.url === '/auth/refresh')).toHaveLength(1)
    expect(onAuthFailure).toHaveBeenCalledTimes(1)
    expect(registered).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(3)
  })

  it('갱신이 끝나면 in-flight 가 비워져 이후 401 이 다시 갱신한다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const tried = new Set<string>()
    const seen = stub(client, (config) => {
      if (config.url === '/auth/refresh') return ok(null)
      if (!tried.has(config.url ?? '')) {
        tried.add(config.url ?? '')
        return unauthorized()
      }
      return ok(1)
    })
    await client.api.get('/a')
    await client.api.get('/b')
    expect(seen.filter((s) => s.url === '/auth/refresh')).toHaveLength(2)
  })

  it('갱신 직후에도 401 이면 재진입 없이 거부한다(_retry)', async () => {
    const onError = vi.fn()
    const client = createApiClient({ baseURL: '/api', onError })
    const seen = stub(client, (config) =>
      config.url === '/auth/refresh' ? ok(null) : unauthorized(),
    )
    await expect(client.api.get('/a')).rejects.toMatchObject({ status: 401 })
    expect(seen.filter((s) => s.url === '/auth/refresh')).toHaveLength(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('noRetryPaths(기본 /auth/login)는 갱신하지 않는다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => unauthorized())
    await expect(client.api.post('/auth/login', {})).rejects.toMatchObject({ status: 401 })
    expect(seen.map((s) => s.url)).toEqual(['/auth/login'])
  })

  it('noRetryPaths 를 덮어쓸 수 있다', async () => {
    const client = createApiClient({ baseURL: '/api', noRetryPaths: ['/auth/otp'] })
    const seen = stub(client, () => unauthorized())
    await expect(client.api.post('/auth/otp', {})).rejects.toMatchObject({ status: 401 })
    expect(seen.map((s) => s.url)).toEqual(['/auth/otp'])
  })

  it('refreshPath 자신의 401 은 갱신하지 않고 onAuthFailure 도 안 부른다(호출자가 직접 부른 경우)', async () => {
    const onAuthFailure = vi.fn()
    const client = createApiClient({ baseURL: '/api', refreshPath: '/token', onAuthFailure })
    const seen = stub(client, () => unauthorized())
    await expect(client.api.post('/token')).rejects.toMatchObject({ status: 401 })
    expect(seen.map((s) => s.url)).toEqual(['/token'])
    expect(onAuthFailure).not.toHaveBeenCalled()
  })

  it('refreshPath 를 바꿀 수 있다', async () => {
    const client = createApiClient({ baseURL: '/api', refreshPath: '/token/renew' })
    let first = true
    const seen = stub(client, (config) => {
      if (config.url === '/token/renew') return ok(null)
      if (first) {
        first = false
        return unauthorized()
      }
      return ok(1)
    })
    await client.api.get('/me')
    expect(seen.map((s) => s.url)).toEqual(['/me', '/token/renew', '/me'])
  })

  it('401 이 아닌 오류는 갱신하지 않는다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ({
      status: 500,
      body: { success: false, code: 'E', message: 'm' },
    }))
    await expect(client.api.get('/a')).rejects.toMatchObject({ status: 500 })
    expect(seen).toHaveLength(1)
  })
})

describe('paramsSerializer', () => {
  it('boolean · Date · 배열 · 중첩 객체 · undefined/null', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ok(null))
    await client.api.get('/list', {
      params: {
        active: true,
        off: false,
        at: new Date('2026-01-02T03:04:05.000Z'),
        ids: [1, 2, null],
        filter: { name: 'kim', age: 3, skip: undefined },
        none: undefined,
        nil: null,
        q: 'a b',
      },
    })
    const serialize = client.axios.defaults.paramsSerializer as {
      serialize: (p: Record<string, unknown>) => string
    }
    const qs = serialize.serialize(seen[0]?.params as Record<string, unknown>)
    expect(decodeURIComponent(qs.replace(/\+/g, ' '))).toBe(
      'active=1&off=&at=2026-01-02T03:04:05.000Z&ids=1&ids=2&filter[name]=kim&filter[age]=3&q=a b',
    )
  })
})
