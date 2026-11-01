import { describe, expect, it } from 'vitest'
import {
  MEDIA_CONTROLLER_PATH,
  MEDIA_MAX_AGE_SECONDS,
  etagMatches,
  mediaEtag,
} from './media-http.js'

describe('media-http(스펙 U5)', () => {
  it('컨트롤러 경로 media · 캐시 600초', () => {
    expect(MEDIA_CONTROLLER_PATH).toBe('media')
    expect(MEDIA_MAX_AGE_SECONDS).toBe(600)
  })

  it('ETag 는 키의 sha256 앞 16자(따옴표) — 같은 키는 같은 값, 다른 키는 다른 값', () => {
    const a = mediaEtag('legal/2026/11/' + 'A'.repeat(32) + '.webp')
    expect(a).toMatch(/^"[0-9a-f]{16}"$/)
    expect(mediaEtag('legal/2026/11/' + 'A'.repeat(32) + '.webp')).toBe(a)
    expect(mediaEtag('legal/2026/11/' + 'B'.repeat(32) + '.webp')).not.toBe(a)
  })

  it('If-None-Match — 목록 · 약한 표기 · * · 없음', () => {
    const etag = '"abc"'
    expect(etagMatches('"abc"', etag)).toBe(true)
    expect(etagMatches('"x", "abc"', etag)).toBe(true)
    expect(etagMatches('W/"abc"', etag)).toBe(true)
    expect(etagMatches('*', etag)).toBe(true)
    expect(etagMatches('"abd"', etag)).toBe(false)
    expect(etagMatches(undefined, etag)).toBe(false)
  })
})
