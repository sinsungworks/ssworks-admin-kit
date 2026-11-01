import { Readable } from 'node:stream'
import { CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { failure } from '../test-support/errors.js'
import { UPLOAD_MESSAGES } from './errors.js'
import { isUploadContentType, readImageBody } from './read-body.js'

/** 요청 흉내 — 본문 조각과 머리글 */
function fakeRequest(chunks: Buffer[], headers: Record<string, string> = {}): Request {
  const stream = Readable.from(chunks)
  return Object.assign(stream, {
    headers: { 'content-type': 'image/png', ...headers },
  }) as unknown as Request
}

describe('isUploadContentType', () => {
  it('매개변수 · 대소문자를 무시하고 넷만', () => {
    expect(isUploadContentType('image/png')).toBe(true)
    expect(isUploadContentType('IMAGE/JPEG; charset=binary')).toBe(true)
    expect(isUploadContentType('image/gif')).toBe(true)
    expect(isUploadContentType('image/webp')).toBe(true)
    expect(isUploadContentType('image/svg+xml')).toBe(false)
    expect(isUploadContentType('application/json')).toBe(false)
    expect(isUploadContentType(undefined)).toBe(false)
  })
})

describe('readImageBody(스펙 U2)', () => {
  it('조각을 모아 Buffer 하나로', async () => {
    const body = await readImageBody(fakeRequest([Buffer.from('ab'), Buffer.from('cd')]), 100)
    expect(body.toString()).toBe('abcd')
  })

  it('415 — Content-Type 밖 · Content-Encoding 이 붙음(identity 는 된다) — 본문을 읽기 전에', async () => {
    const wrong = await failure(
      readImageBody(fakeRequest([Buffer.from('x')], { 'content-type': 'text/plain' }), 100),
    )
    expect(wrong.code).toBe(CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    const gzip = await failure(
      readImageBody(fakeRequest([Buffer.from('x')], { 'content-encoding': 'gzip' }), 100),
    )
    expect(gzip.code).toBe(CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    expect(
      (
        await readImageBody(
          fakeRequest([Buffer.from('x')], { 'content-encoding': 'identity' }),
          100,
        )
      ).toString(),
    ).toBe('x')
  })

  it('🔴 413 — Content-Length 가 상한을 넘으면 읽기 전에, 아니면 읽다가 넘는 순간(details.maxBytes)', async () => {
    const declared = await failure(
      readImageBody(fakeRequest([Buffer.alloc(1)], { 'content-length': '101' }), 100),
    )
    expect(declared.code).toBe(CommonErrorCodes.ERR_UPLOAD_TOO_LARGE)
    expect(declared.details).toEqual({ maxBytes: 100 })

    const chunks = [Buffer.alloc(60), Buffer.alloc(60), Buffer.alloc(60)]
    const request = fakeRequest(chunks)
    const drained = new Promise<void>((resolve) => request.on('end', resolve).on('close', resolve))
    const streamed = await failure(readImageBody(request, 100))
    expect(streamed.code).toBe(CommonErrorCodes.ERR_UPLOAD_TOO_LARGE)
    // 남은 본문은 버린다(소켓을 닫지 않는다) — 스트림이 흐르는 상태로 끝까지 간다
    await drained
    expect(request.destroyed === true || request.readableEnded === true).toBe(true)
  })

  it('경계 — Content-Length 가 상한과 같거나 본문이 정확히 상한이면 받는다(초과만 413)', async () => {
    const exact = Buffer.alloc(100)
    expect(
      (await readImageBody(fakeRequest([exact], { 'content-length': '100' }), 100)).length,
    ).toBe(100)
    expect(
      (await readImageBody(fakeRequest([Buffer.alloc(50), Buffer.alloc(50)]), 100)).length,
    ).toBe(100)
  })

  it('415 — Content-Encoding 이 여럿(gzip, identity)이어도 identity 하나가 아니면 거부', async () => {
    const error = await failure(
      readImageBody(fakeRequest([Buffer.from('x')], { 'content-encoding': 'gzip, identity' }), 100),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
  })

  it('연결이 끊기면(close · end 없음) 매달리지 않고 던진다', async () => {
    const stream = new Readable({ read() {} })
    const request = Object.assign(stream, {
      headers: { 'content-type': 'image/png' },
    }) as unknown as Request
    const pending = readImageBody(request, 100)
    stream.push(Buffer.from('ab'))
    setTimeout(() => stream.destroy(), 5)
    const error = await failure(pending)
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
    expect(error.message).toBe(UPLOAD_MESSAGES.aborted)
    expect(error.details).toEqual({ reason: 'closed' })
  })

  it('🔴 스트림 오류 · 연결 끊김은 400 BusinessError(details.reason) — 흔들리는 연결이 500 이 되지 않는다', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('socket hang up'))
      },
    })
    const request = Object.assign(stream, {
      headers: { 'content-type': 'image/png' },
    }) as unknown as Request
    const error = await failure(readImageBody(request, 100))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
    expect(error.message).toBe(UPLOAD_MESSAGES.aborted)
    expect(error.details).toEqual({ reason: 'socket hang up' })
  })
})
