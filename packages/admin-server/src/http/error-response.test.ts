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
