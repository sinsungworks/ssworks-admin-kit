import { describe, expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'
import {
  LEGAL_BODY_MAX_LENGTH,
  adminLegalCurrentSchema,
  adminLegalDocumentSchema,
  adminLegalHistoryItemSchema,
  adminLegalHistorySchema,
  adminLegalPublishResultSchema,
  adminLegalPublishSchema,
  legalBodySchema,
  type AdminLegalDocument,
  type AdminLegalHistoryItem,
  type AdminLegalPublish,
} from './legal.js'

const HASH = '0123456789abcdef'.repeat(4)

const DOC: AdminLegalDocument = {
  legalDocNo: 12n,
  kind: 'TERMS',
  body: '# 제1조 (목적)\n',
  contentHash: HASH,
  publishedAt: '2026-09-01T05:00:00.000Z',
  publishedByUserNo: 7n,
  publishedByUserName: '김관리',
}

describe('adminLegalDocumentSchema', () => {
  it('문서를 받는다', () => {
    expect(adminLegalDocumentSchema.parse(DOC)).toEqual(DOC)
  })

  it('번호는 bigint 다', () => {
    expect(adminLegalDocumentSchema.safeParse({ ...DOC, legalDocNo: 12 }).success).toBe(false)
  })

  it('🔴 publishedAt 은 UTC ISO 만 — 오프셋 · 공백 표기는 거부한다', () => {
    expect(
      adminLegalDocumentSchema.safeParse({ ...DOC, publishedAt: '2026-09-01T14:00:00+09:00' })
        .success,
    ).toBe(false)
    expect(
      adminLegalDocumentSchema.safeParse({ ...DOC, publishedAt: '2026-09-01 05:00:00' }).success,
    ).toBe(false)
  })

  it('해시는 sha256 hex 소문자 64자', () => {
    expect(adminLegalDocumentSchema.safeParse({ ...DOC, contentHash: HASH.slice(1) }).success).toBe(
      false,
    )
    expect(
      adminLegalDocumentSchema.safeParse({ ...DOC, contentHash: HASH.toUpperCase() }).success,
    ).toBe(false)
  })

  it('발행자는 둘 다 null 일 수 있다(계정이 지워지면 FK SET NULL)', () => {
    const orphan = { ...DOC, publishedByUserNo: null, publishedByUserName: null }
    expect(adminLegalDocumentSchema.parse(orphan)).toEqual(orphan)
  })

  it('종류는 빈 문자열이 아니다', () => {
    expect(adminLegalDocumentSchema.safeParse({ ...DOC, kind: '' }).success).toBe(false)
  })

  it('인터페이스와 추론 타입이 같다', () => {
    expectTypeOf<z.infer<typeof adminLegalDocumentSchema>>().toEqualTypeOf<AdminLegalDocument>()
    expectTypeOf<
      z.infer<typeof adminLegalHistoryItemSchema>
    >().toEqualTypeOf<AdminLegalHistoryItem>()
    expectTypeOf<z.infer<typeof adminLegalPublishSchema>>().toEqualTypeOf<AdminLegalPublish>()
  })
})

describe('이력 · 현재본 응답', () => {
  it('이력 행은 본문 없이 받고, 본문이 와도 버린다', () => {
    const { body, ...row } = DOC
    expect(body).toBe('# 제1조 (목적)\n')
    expect(adminLegalHistoryItemSchema.parse(row)).toEqual(row)
    expect(adminLegalHistoryItemSchema.parse(DOC)).not.toHaveProperty('body')
  })

  it('이력 목록은 { items }', () => {
    expect(adminLegalHistorySchema.parse({ items: [] })).toEqual({ items: [] })
  })

  it('현재본은 { item } — null 이 미발행이다', () => {
    expect(adminLegalCurrentSchema.parse({ item: null })).toEqual({ item: null })
    expect(adminLegalCurrentSchema.parse({ item: DOC })).toEqual({ item: DOC })
    expect(adminLegalCurrentSchema.safeParse({}).success).toBe(false)
  })
})

describe('legalBodySchema · adminLegalPublishSchema', () => {
  it('공백뿐이면 거부하고 문구를 낸다', () => {
    const result = legalBodySchema.safeParse('  \n\t ')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('본문을 입력하세요.')
  })

  it('최대 길이까지 받고 하나 넘으면 거부한다', () => {
    expect(LEGAL_BODY_MAX_LENGTH).toBe(1_000_000)
    expect(legalBodySchema.safeParse('가'.repeat(LEGAL_BODY_MAX_LENGTH)).success).toBe(true)
    const result = legalBodySchema.safeParse('가'.repeat(LEGAL_BODY_MAX_LENGTH + 1))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('본문은 1,000,000자를 넘을 수 없습니다.')
  })

  it('🔴 본문을 트림하지 않는다 — 앞뒤 공백 · CRLF 를 그대로 둔다(D3)', () => {
    expect(legalBodySchema.parse('  본문 \r\n')).toBe('  본문 \r\n')
  })

  it('기준 판 번호는 bigint 이거나 null(미발행에서 시작)', () => {
    expect(
      adminLegalPublishSchema.parse({ kind: 'TERMS', body: '본문', baseLegalDocNo: null }),
    ).toEqual({
      kind: 'TERMS',
      body: '본문',
      baseLegalDocNo: null,
    })
    expect(
      adminLegalPublishSchema.parse({ kind: 'TERMS', body: '본문', baseLegalDocNo: 12n })
        .baseLegalDocNo,
    ).toBe(12n)
    expect(adminLegalPublishSchema.safeParse({ kind: 'TERMS', body: '본문' }).success).toBe(false)
  })

  it('🔴 발행 본문에 contentHash 가 없다 — 와도 버린다(해시는 서버만 계산)', () => {
    const parsed = adminLegalPublishSchema.parse({
      kind: 'TERMS',
      body: '본문',
      baseLegalDocNo: null,
      contentHash: HASH,
    })
    expect(parsed).not.toHaveProperty('contentHash')
  })

  it('발행 결과는 번호와 해시', () => {
    expect(adminLegalPublishResultSchema.parse({ legalDocNo: 13n, contentHash: HASH })).toEqual({
      legalDocNo: 13n,
      contentHash: HASH,
    })
    expect(
      adminLegalPublishResultSchema.safeParse({ legalDocNo: 13n, contentHash: 'x' }).success,
    ).toBe(false)
  })
})
