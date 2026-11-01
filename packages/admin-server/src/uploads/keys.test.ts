import { isUploadKey } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { newUploadKey } from './keys.js'

describe('newUploadKey(스펙 U1)', () => {
  it('용도 · UTC 연월 · base64url 32자 · .webp — 키 모양을 지난다', () => {
    const key = newUploadKey('legal', new Date('2026-11-01T23:30:00Z'), () =>
      Buffer.alloc(24, 0xff),
    )
    expect(key).toBe('legal/2026/11/' + '_'.repeat(32) + '.webp')
    expect(isUploadKey(key)).toBe(true)
    expect(newUploadKey('legal', new Date('2026-12-31T15:30:00Z'))).toMatch(/^legal\/2026\/12\//)
    expect(newUploadKey('legal', new Date('2027-01-01T00:00:00Z'))).toMatch(/^legal\/2027\/01\//)
  })

  it('무작위 24바이트 — 두 번 부르면 다르다 · 바이트 수가 틀리면 던진다', () => {
    expect(newUploadKey('a', new Date())).not.toBe(newUploadKey('a', new Date()))
    expect(() => newUploadKey('a', new Date(), () => Buffer.alloc(3))).toThrow('24바이트')
  })
})
