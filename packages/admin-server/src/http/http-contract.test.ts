import { Logger, type ModuleMetadata } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  defineErrorCodes,
  errorRespSchema,
  parseJSON,
  validationDetailsSchema,
} from '@ssworks/admin-shared'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AdminServerOptions } from '../options.js'
import { createHttpApp } from '../test-support/http.js'
import { ProbeModule } from '../test-support/probe.js'
import { ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminEnvelopeInterceptor } from './envelope.interceptor.js'
import { AdminExceptionFilter } from './exception.filter.js'

const projectErrors = defineErrorCodes(
  { ERR_PROJECT_GONE: 'ERR_PROJECT_GONE' },
  { ERR_PROJECT_GONE: 410 },
)

function wiring(options: AdminServerOptions): ModuleMetadata {
  return {
    imports: [ProbeModule],
    providers: [
      { provide: ADMIN_SERVER_OPTIONS, useValue: options },
      { provide: APP_FILTER, useClass: AdminExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: AdminEnvelopeInterceptor },
    ],
  }
}

const options: AdminServerOptions = {
  db: { host: 'unused', user: 'u', password: 'p', database: 'd' },
  errorCodes: projectErrors,
}

let app: NestExpressApplication
let server: ReturnType<NestExpressApplication['getHttpServer']>

beforeAll(async () => {
  app = await createHttpApp(wiring(options))
  server = app.getHttpServer()
})

afterAll(async () => {
  await app.close()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 와이어 원문을 킷 코덱으로 — supertest 의 JSON.parse 는 "BigInt(n)" 을 문자열로 둔다 */
const wire = (text: string) => parseJSON<Record<string, unknown>>(text)

function silenceErrors() {
  return vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
}

describe('성공 봉투', () => {
  it('값을 data 에 싸고 bigint 는 "BigInt(n)", Date 는 ISO, 충돌 문자열은 왕복', async () => {
    const res = await request(server).get('/probe/value').expect(200)
    expect(res.headers['content-type']).toMatch(/application\/json; charset=utf-8/)
    expect(res.text).toContain('"BigInt(12345678901234567890)"')
    expect(wire(res.text)).toEqual({
      success: true,
      data: {
        n: 12345678901234567890n,
        at: '2026-01-02T03:04:05.000Z',
        text: 'BigInt(7)',
        label: '한글 값',
      },
    })
  })

  it('반환값이 없으면 data: null', async () => {
    const res = await request(server).get('/probe/nothing').expect(200)
    expect(res.body).toEqual({ success: true, data: null })
  })

  it('@RawResponse() 는 봉투 없이', async () => {
    const res = await request(server).get('/probe/raw').expect(200)
    expect(res.body).toEqual({ plain: true })
  })

  it('StreamableFile 은 건드리지 않는다', async () => {
    const res = await request(server).get('/probe/file').expect(200)
    expect(res.text).toBe('hello')
  })
})

describe('요청', () => {
  it('🔴 본문의 "BigInt(n)" 이 bigint 로 핸들러에 온다(reviver)', async () => {
    const res = await request(server).post('/probe/echo').send({ n: 'BigInt(5)' }).expect(201)
    expect(wire(res.text)).toEqual({ success: true, data: { type: 'bigint', body: { n: 5n } } })
  })

  it('🔴 filter[k] 는 객체, 같은 키 반복은 배열(query parser extended)', async () => {
    const res = await request(server).get('/probe/query?filter[a]=1&sortBy=x&sortBy=y').expect(200)
    expect(res.body).toEqual({ success: true, data: { filter: { a: '1' }, sortBy: ['x', 'y'] } })
  })

  it('🔴 __proto__ 는 쿼리 객체에 들어가지 않고 프로토타입도 오염되지 않는다', async () => {
    const res = await request(server)
      .get('/probe/query?__proto__[polluted]=1&filter[__proto__][x]=1&filter[a]=1')
      .expect(200)
    expect(res.body).toEqual({ success: true, data: { filter: { a: '1' } } })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('쿠키를 읽는다(cookie-parser)', async () => {
    const res = await request(server).get('/probe/cookie').set('Cookie', 'a=1; b=two').expect(200)
    expect(res.body).toEqual({ success: true, data: { cookies: { a: '1', b: 'two' } } })
  })
})

describe('오류 봉투', () => {
  it('BusinessError 4xx — 코드표 상태 · 메시지 · details(bigint 포함), admin-shared 스키마로 읽힌다', async () => {
    const res = await request(server).get('/probe/business/ERR_COMMON_NOT_FOUND').expect(404)
    expect(res.headers['content-type']).toMatch(/application\/json; charset=utf-8/)
    expect(errorRespSchema.safeParse(res.body).success).toBe(true)
    expect(wire(res.text)).toEqual({
      success: false,
      code: 'ERR_COMMON_NOT_FOUND',
      message: '업무 오류 ERR_COMMON_NOT_FOUND',
      details: { field: 'x', n: 3n },
    })
  })

  it('프로젝트 코드는 errorCodes 의 상태', async () => {
    const res = await request(server).get('/probe/business/ERR_PROJECT_GONE').expect(410)
    expect(res.body.code).toBe('ERR_PROJECT_GONE')
  })

  it('🔴 BusinessError 5xx — 고정 문구, details 없음, 원문 · cause · details 는 로그로', async () => {
    const spy = silenceErrors()
    const res = await request(server).get('/probe/business/ERR_COMMON_INTERNAL').expect(500)
    expect(res.body).toEqual({
      success: false,
      code: 'ERR_COMMON_INTERNAL',
      message: '서버 내부 오류가 발생했습니다.',
    })
    const logged = spy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('GET /probe/business/ERR_COMMON_INTERNAL')
    expect(logged).toContain('업무 오류 ERR_COMMON_INTERNAL')
    expect(logged).toContain('내부 원인')
    expect(logged).toContain('"BigInt(3)"')
  })

  it('표에 없는 코드는 500 · 고정 문구', async () => {
    silenceErrors()
    const res = await request(server).get('/probe/business/ERR_NOBODY_KNOWS').expect(500)
    expect(res.body).toEqual({
      success: false,
      code: 'ERR_NOBODY_KNOWS',
      message: '서버 내부 오류가 발생했습니다.',
    })
  })

  it('HttpException 4xx 는 상태에 맞는 코어 코드와 그 메시지', async () => {
    const res = await request(server).get('/probe/http-forbidden').expect(403)
    expect(res.body).toEqual({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      message: '이 작업을 할 권한이 없습니다.',
    })
  })

  it('HttpException 5xx(503 · 504 밖)는 500 · 고정 문구', async () => {
    silenceErrors()
    const res = await request(server).get('/probe/http-502').expect(500)
    expect(res.body).toEqual({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_INTERNAL,
      message: '서버 내부 오류가 발생했습니다.',
    })
  })

  it('없는 경로는 404 봉투', async () => {
    const res = await request(server).get('/nope').expect(404)
    expect(res.body).toMatchObject({ success: false, code: CommonErrorCodes.ERR_COMMON_NOT_FOUND })
  })

  it('🔴 본문 1mb 초과는 413 봉투(Express http-errors 를 그대로 받는다)', async () => {
    const body = JSON.stringify({ blob: 'x'.repeat(1_100_000) })
    const res = await request(server)
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(413)
    expect(res.body).toEqual({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_PAYLOAD_TOO_LARGE,
      message: '요청 본문이 너무 큽니다.',
    })
  })

  it('깨진 JSON 은 400 봉투', async () => {
    const res = await request(server)
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400)
    expect(res.body).toMatchObject({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
    })
  })

  it('🔴 객체가 아닌 JSON 본문도 400 봉투(body-parser strict)', async () => {
    const res = await request(server)
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send('"text"')
      .expect(400)
    expect(res.body).toMatchObject({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
    })
  })

  it('🔴 깨진 퍼센트 인코딩 경로도 400 봉투', async () => {
    const res = await request(server).get('/probe/teams/%FF').expect(400)
    expect(res.body).toMatchObject({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
    })
  })

  it('문자열을 던져도 500 봉투', async () => {
    silenceErrors()
    const res = await request(server).get('/probe/string-throw').expect(500)
    expect(res.body).toEqual({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_INTERNAL,
      message: '서버 내부 오류가 발생했습니다.',
    })
  })

  it('🔴 details 에 순환 · 던지는 getter 가 있어도 응답한다', async () => {
    const res = await request(server).get('/probe/business-weird').expect(409)
    expect(res.body).toEqual({
      success: false,
      code: 'ERR_COMMON_CONFLICT',
      message: '이상한 details',
      details: { ok: 1, self: '[circular]', bad: '[unserializable]' },
    })
  })

  it('🔴 응답을 쓰기 시작한 뒤의 예외는 다시 보내지 않고 응답을 닫는다(로그만)', async () => {
    const spy = silenceErrors()
    const res = await request(server).get('/probe/half').expect(200)
    expect(res.text).toBe('partial')
    expect(spy.mock.calls.map((call) => String(call[0])).join('\n')).toContain('응답이 이미 나가')
  })
})

describe('검증', () => {
  it('실패 본문을 admin-shared 스키마로 읽을 수 있고 path 는 배열', async () => {
    const res = await request(server)
      .post('/probe/validate')
      .send({ name: 'a', members: [{ name: '' }] })
      .expect(400)
    expect(res.body.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    const details = validationDetailsSchema.parse(res.body.details)
    expect(details.issues.map((issue) => issue.path)).toEqual([['name'], ['members', 0, 'name']])
    expect(details.issues[1]?.message).toBe('이름을 입력하세요.')
  })

  it('성공하면 파싱 결과가 핸들러에', async () => {
    const res = await request(server)
      .post('/probe/validate')
      .send({ name: '홍길', count: '2' })
      .expect(201)
    expect(res.body).toEqual({ success: true, data: { name: '홍길', count: 2, members: [] } })
  })

  it('ParseBigIntPipe — 통과는 bigint, 실패는 path [teamNo]', async () => {
    const ok = await request(server).get('/probe/teams/12').expect(200)
    expect(wire(ok.text)).toEqual({ success: true, data: { teamNo: 12n, type: 'bigint' } })
    const bad = await request(server).get('/probe/teams/abc').expect(400)
    expect(validationDetailsSchema.parse(bad.body.details).issues[0]?.path).toEqual(['teamNo'])
  })
})

describe('errorCodes 가 없을 때', () => {
  it('코어 표로 상태를 정하고 프로젝트 코드는 500', async () => {
    const plain = await createHttpApp(wiring({ db: options.db }))
    try {
      silenceErrors()
      await request(plain.getHttpServer()).get('/probe/business/ERR_COMMON_NOT_FOUND').expect(404)
      await request(plain.getHttpServer()).get('/probe/business/ERR_PROJECT_GONE').expect(500)
    } finally {
      await plain.close()
    }
  })
})
