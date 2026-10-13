import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { requestMetaOf } from './request-meta.js'

function req(input: { ip?: string; userAgent?: unknown }) {
  return {
    ip: input.ip,
    headers: input.userAgent === undefined ? {} : { 'user-agent': input.userAgent },
  } as unknown as Request
}

describe('requestMetaOf', () => {
  it('req.ip 와 User-Agent 문자열', () => {
    expect(requestMetaOf(req({ ip: '10.0.0.1', userAgent: 'UA/1' }))).toEqual({
      clientIp: '10.0.0.1',
      userAgent: 'UA/1',
    })
  })

  it('없거나 비면 null', () => {
    expect(requestMetaOf(req({}))).toEqual({ clientIp: null, userAgent: null })
    expect(requestMetaOf(req({ ip: '', userAgent: '' }))).toEqual({
      clientIp: null,
      userAgent: null,
    })
  })
})
