import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { clientIpOf, requestMetaOf, resolveClientIpSource } from './request-meta.js'

function req(input: { ip?: string; userAgent?: unknown; realIp?: string | string[] }) {
  const headers: Record<string, unknown> = {}
  if (input.userAgent !== undefined) headers['user-agent'] = input.userAgent
  if (input.realIp !== undefined) headers['x-real-ip'] = input.realIp
  return { ip: input.ip, headers } as unknown as Request
}

describe('resolveClientIpSource(2f-1 스펙 ④ C1)', () => {
  it("기본은 'req.ip' · 'x-real-ip' 는 그대로", () => {
    expect(resolveClientIpSource(undefined)).toBe('req.ip')
    expect(resolveClientIpSource('req.ip')).toBe('req.ip')
    expect(resolveClientIpSource('x-real-ip')).toBe('x-real-ip')
  })

  it('🔴 모르는 값은 기동에서 멈춘다 — 오타가 조용히 req.ip 로 떨어지지 않게', () => {
    for (const bad of ['X-Real-IP', 'x-forwarded-for', '', null, 1]) {
      expect(() => resolveClientIpSource(bad)).toThrow(
        "clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.",
      )
    }
  })
})

describe("clientIpOf — 'req.ip'", () => {
  it('req.ip 를 정규화한다 — IPv4-mapped · IPv6 루프백', () => {
    expect(clientIpOf(req({ ip: '10.0.0.1' }), 'req.ip')).toBe('10.0.0.1')
    expect(clientIpOf(req({ ip: '::ffff:127.0.0.1' }), 'req.ip')).toBe('127.0.0.1')
    expect(clientIpOf(req({ ip: '::1' }), 'req.ip')).toBe('127.0.0.1')
    expect(clientIpOf(req({ ip: '2001:db8::7' }), 'req.ip')).toBe('2001:db8::7')
  })

  it('없거나 비거나 주소가 아니면 null(유닉스 소켓 뒤 — req.ip 가 비는 배포)', () => {
    expect(clientIpOf(req({}), 'req.ip')).toBeNull()
    expect(clientIpOf(req({ ip: '' }), 'req.ip')).toBeNull()
    expect(clientIpOf(req({ ip: 'not-an-ip' }), 'req.ip')).toBeNull()
  })

  it('🔴 X-Real-IP 를 보지 않는다 — 엣지 없이 노출된 서버에서 헤더 한 줄로 위조할 수 없다', () => {
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '203.0.113.7' }), 'req.ip')).toBe('10.0.0.1')
  })
})

describe("clientIpOf — 'x-real-ip'", () => {
  it('헤더가 있으면 그 값(정규화), 없으면 req.ip', () => {
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '203.0.113.7' }), 'x-real-ip')).toBe(
      '203.0.113.7',
    )
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '::ffff:203.0.113.7' }), 'x-real-ip')).toBe(
      '203.0.113.7',
    )
    expect(clientIpOf(req({ ip: '10.0.0.1' }), 'x-real-ip')).toBe('10.0.0.1')
  })

  it('🔴 중복 헤더(Node 가 쉼표로 잇는다 · §14 R1-④) · 배열 · 형식 오류 · 빈 값은 null — 앞쪽을 고르면 위조 값을 고른다', () => {
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '1.2.3.4, 5.6.7.8' }), 'x-real-ip')).toBeNull()
    expect(
      clientIpOf(req({ ip: '10.0.0.1', realIp: ['1.2.3.4', '5.6.7.8'] }), 'x-real-ip'),
    ).toBeNull()
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: 'garbage' }), 'x-real-ip')).toBeNull()
    expect(clientIpOf(req({ ip: '10.0.0.1', realIp: '' }), 'x-real-ip')).toBeNull()
  })
})

describe('requestMetaOf', () => {
  it('clientIp 와 User-Agent 문자열 — 없거나 비면 null', () => {
    expect(requestMetaOf(req({ ip: '10.0.0.1', userAgent: 'UA/1' }), 'req.ip')).toEqual({
      clientIp: '10.0.0.1',
      userAgent: 'UA/1',
    })
    expect(requestMetaOf(req({}), 'req.ip')).toEqual({ clientIp: null, userAgent: null })
    expect(requestMetaOf(req({ ip: '', userAgent: '' }), 'req.ip')).toEqual({
      clientIp: null,
      userAgent: null,
    })
  })
})
