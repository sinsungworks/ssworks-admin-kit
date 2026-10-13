import { describe, expect, it } from 'vitest'
import { isResigned, isSessionExpired } from './account-policy.js'

const now = new Date('2026-10-13T00:00:00.000Z')
const at = (ms: number) => new Date(now.getTime() + ms)

describe('isResigned — resignAt 은 효력 시각(스펙 R1)', () => {
  it('같은 순간부터 퇴사, 1ms 전은 재직, null 은 재직', () => {
    expect(isResigned(null, now)).toBe(false)
    expect(isResigned(at(1), now)).toBe(false)
    expect(isResigned(at(0), now)).toBe(true)
    expect(isResigned(at(-1), now)).toBe(true)
  })
})

describe('isSessionExpired', () => {
  it('expireAt 과 같은 순간이면 만료', () => {
    expect(isSessionExpired(at(1), now)).toBe(false)
    expect(isSessionExpired(at(0), now)).toBe(true)
    expect(isSessionExpired(at(-1), now)).toBe(true)
  })
})
