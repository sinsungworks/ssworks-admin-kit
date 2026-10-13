import { describe, expect, it } from 'vitest'
import { createRefreshToken, hashRefreshToken } from './refresh-token.js'

describe('refresh 토큰', () => {
  it('512비트 난수 — 128자 소문자 hex, 매번 다르다', () => {
    const a = createRefreshToken()
    expect(a).toMatch(/^[0-9a-f]{128}$/)
    expect(createRefreshToken()).not.toBe(a)
  })

  it('🔴 sha256 hex 64자 · 결정적 — 조회 키로 쓴다', () => {
    expect(hashRefreshToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    const token = createRefreshToken()
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token))
  })
})
