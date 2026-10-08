import { afterEach, describe, expect, it } from 'vitest'
import { assertUtcTimezone, isEffectiveUtc } from './timezone.js'

const original = process.env.TZ

afterEach(() => {
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

describe('isEffectiveUtc', () => {
  const winter = new Date('2026-01-15T00:00:00.000Z')

  it('UTC 면 참', () => {
    process.env.TZ = 'UTC'
    expect(isEffectiveUtc(winter)).toBe(true)
  })

  it('Asia/Seoul 이면 거짓', () => {
    process.env.TZ = 'Asia/Seoul'
    expect(isEffectiveUtc(winter)).toBe(false)
  })

  it('🔴 Europe/London 은 겨울에 재도 거짓 — 7월 1일 시점이 서머타임을 잡는다', () => {
    process.env.TZ = 'Europe/London'
    expect(isEffectiveUtc(winter)).toBe(false)
  })
})

describe('assertUtcTimezone', () => {
  it('UTC 가 아니면 진입점 이름을 담아 던진다', () => {
    process.env.TZ = 'Asia/Seoul'
    expect(() => assertUtcTimezone('마이그레이션 러너')).toThrow(
      /^마이그레이션 러너: 프로세스 실효 타임존이 UTC 가 아니다/,
    )
  })

  it('UTC 면 통과', () => {
    process.env.TZ = 'UTC'
    expect(() => assertUtcTimezone('api')).not.toThrow()
  })
})
