import { describe, expect, it } from 'vitest'
import {
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from './temporary-password.js'

describe('generateTemporaryPassword', () => {
  it('🔴 16자 · 56자 알파벳 · 혼동 문자 I O l o 0 1 없음(3c §9)', () => {
    expect(TEMPORARY_PASSWORD_LENGTH).toBe(16)
    expect(TEMPORARY_PASSWORD_ALPHABET).toHaveLength(56)
    expect(new Set(TEMPORARY_PASSWORD_ALPHABET).size).toBe(56)
    for (const confusing of 'IOlo01') expect(TEMPORARY_PASSWORD_ALPHABET).not.toContain(confusing)
    for (let round = 0; round < 200; round += 1) {
      const password = generateTemporaryPassword()
      expect(password).toHaveLength(16)
      for (const char of password) expect(TEMPORARY_PASSWORD_ALPHABET).toContain(char)
    }
  })

  it('주입한 pick 으로 결정적이다 — 매번 알파벳 길이를 상한으로 묻는다', () => {
    const asked: number[] = []
    const pick = (max: number) => {
      asked.push(max)
      return asked.length - 1
    }
    expect(generateTemporaryPassword(pick)).toBe(TEMPORARY_PASSWORD_ALPHABET.slice(0, 16))
    expect(asked).toEqual(Array.from({ length: 16 }, () => 56))
  })
})
