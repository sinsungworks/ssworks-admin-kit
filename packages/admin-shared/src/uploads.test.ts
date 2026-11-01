import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MEDIA_PATH,
  DEFAULT_UPLOAD_POLICY,
  LEGAL_UPLOAD_PURPOSE,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_PURPOSE_PATTERN,
  UPLOAD_SCHEMA_MESSAGES,
  adminUploadCreatedSchema,
  collectUploadKeys,
  isUploadKey,
  uploadPurposeOf,
  uploadPurposeQuerySchema,
  uploadUrl,
} from './uploads.js'

const KEY = 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp'
const KEY2 = 'legal/2026/11/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.webp'

describe('키 모양(스펙 U1)', () => {
  it('용도 · 연월 · base64url 32자 · .webp — 대소문자를 가른다', () => {
    expect(isUploadKey(KEY)).toBe(true)
    expect(isUploadKey('notice_v2/2026/01/abcdefghijklmnopqrstuvwxyz012345.webp')).toBe(true)
    expect(isUploadKey('legal/2026/11/abc-_ABC0123456789abcdefghijklmn.webp')).toBe(true)
  })

  it('🔴 형식 밖 — 용도의 `-` · 한 자리 월 · 31자 · 33자 · 다른 확장자 · 대문자 확장자 · 앞뒤 공백 · 경로 탐색', () => {
    for (const bad of [
      'a-b/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      'legal/2026/1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.png',
      'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.WEBP',
      ` ${KEY}`,
      `${KEY} `,
      '../2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      `${KEY}/..`,
      'legal/2026/11/../AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      `${'A'.repeat(33)}/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp`,
      '',
    ]) {
      expect(isUploadKey(bad), bad).toBe(false)
    }
  })

  it('uploadPurposeOf · uploadUrl · 용도 패턴', () => {
    expect(uploadPurposeOf(KEY)).toBe('legal')
    expect(uploadPurposeOf('nope')).toBeNull()
    expect(uploadUrl(KEY)).toBe(`/api/media/${KEY}`)
    expect(uploadUrl(KEY, '/media')).toBe(`/media/${KEY}`)
    expect(DEFAULT_MEDIA_PATH).toBe('/api/media')
    expect(UPLOAD_PURPOSE_PATTERN.test('A'.repeat(32))).toBe(true)
    expect(UPLOAD_PURPOSE_PATTERN.test('A'.repeat(33))).toBe(false)
    expect(UPLOAD_PURPOSE_PATTERN.test('bad kind')).toBe(false)
    expect(UPLOAD_PURPOSE_PATTERN.test('약관')).toBe(false)
    // 약관 용도 상수도 같은 패턴 안이다(서버 자동 등록 · 키 첫 조각)
    expect(LEGAL_UPLOAD_PURPOSE).toBe('legal')
    expect(UPLOAD_PURPOSE_PATTERN.test(LEGAL_UPLOAD_PURPOSE)).toBe(true)
  })
})

describe('collectUploadKeys(스펙 §4-1 — 렌더 위에서 센다)', () => {
  it('렌더된 <img src> 중 우리 경로 · 키 모양만 — 처음 나온 순서 · 겹침 없음 · 제목 있는 그림도', () => {
    const md = [
      `![a](/api/media/${KEY})`,
      `![b](/api/media/${KEY2} "제목")`,
      `![a 다시](/api/media/${KEY})`,
    ].join('\n\n')
    expect(collectUploadKeys(md)).toEqual([KEY, KEY2])
  })

  it('🔴 코드 블록 · 인라인 코드 · 링크 · 다른 경로 · data: · 쿼리가 붙은 것은 키가 아니다', () => {
    const md = [
      '```',
      `![x](/api/media/${KEY})`,
      '```',
      `\`![y](/api/media/${KEY2})\``,
      `[링크](/api/media/${KEY2})`,
      `![z](/files/${KEY})`,
      '![d](data:image/png;base64,AAAA)',
      `![q](/api/media/${KEY}?x=1)`,
      `![f](/api/media/${KEY}#top)`,
    ].join('\n\n')
    expect(collectUploadKeys(md)).toEqual([])
  })

  it('글자 문단 속 · 목록 항목 · 참조식 그림도 센다(렌더가 <img> 를 내는 자리면 어디든)', () => {
    const md = [
      `앞 ![a](/api/media/${KEY}) 뒤`,
      `- 항목 ![b](/api/media/${KEY2})`,
      '![c][ref]',
      `[ref]: /api/media/${KEY}`,
    ].join('\n\n')
    expect(collectUploadKeys(md)).toEqual([KEY, KEY2])
  })

  it('mediaPath 인자 — 다른 접두사로 세고, 어긋나면 비어 있다 · 접두사가 앞부분만 같은 경로(/api/media2)는 키가 아니다', () => {
    const md = `![a](/media/${KEY})`
    expect(collectUploadKeys(md, '/media')).toEqual([KEY])
    expect(collectUploadKeys(md)).toEqual([])
    expect(collectUploadKeys(`![a](/api/media2/${KEY})`)).toEqual([])
  })

  it('빈 본문은 []', () => {
    expect(collectUploadKeys('')).toEqual([])
    expect(collectUploadKeys('그림 없음')).toEqual([])
  })
})

describe('정책 · 스키마(스펙 S6 · §4-1)', () => {
  it('기본값 · 얼림 · 받는 형식 넷', () => {
    expect(DEFAULT_UPLOAD_POLICY).toEqual({
      maxBytes: 10_485_760,
      maxLongEdge: 2048,
      maxInputPixels: 40_000_000,
      maxFrames: 100,
      webpQuality: 82,
      maxPerBody: 20,
      maxPendingPerUser: 50,
      pendingTtlHours: 24,
    })
    expect(Object.isFrozen(DEFAULT_UPLOAD_POLICY)).toBe(true)
    expect(UPLOAD_CONTENT_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    expect(Object.isFrozen(UPLOAD_SCHEMA_MESSAGES)).toBe(true)
  })

  it('uploadPurposeQuerySchema — 형식 밖 · 빠짐은 거부, 문구는 UPLOAD_SCHEMA_MESSAGES.purpose', () => {
    expect(uploadPurposeQuerySchema.parse({ purpose: 'legal' })).toEqual({ purpose: 'legal' })
    const bad = uploadPurposeQuerySchema.safeParse({ purpose: 'bad kind' })
    expect(bad.success).toBe(false)
    if (!bad.success) expect(bad.error.issues[0]?.message).toBe(UPLOAD_SCHEMA_MESSAGES.purpose)
    expect(uploadPurposeQuerySchema.safeParse({}).success).toBe(false)
  })

  it('adminUploadCreatedSchema — 키 모양 · 양의 정수', () => {
    const created = { key: KEY, url: `/api/media/${KEY}`, width: 10, height: 20, bytes: 300 }
    expect(adminUploadCreatedSchema.parse(created)).toEqual(created)
    expect(adminUploadCreatedSchema.safeParse({ ...created, key: 'x' }).success).toBe(false)
    expect(adminUploadCreatedSchema.safeParse({ ...created, width: 0 }).success).toBe(false)
    expect(adminUploadCreatedSchema.safeParse({ ...created, bytes: 1.5 }).success).toBe(false)
  })
})
