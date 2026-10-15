import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { LegalKindQueryPipe, LegalPublishBodyPipe } from './legal.body.js'
import { resolveLegalConfig } from './options.js'

const config = resolveLegalConfig({ legal: { kinds: ['TERMS', 'PRIVACY'] } }, 'AdminLegalModule')
const publishPipe = new LegalPublishBodyPipe(config)
const queryPipe = new LegalKindQueryPipe(config)
const UNKNOWN_KIND = '잘못된 옵션: "TERMS"또는 "PRIVACY" 중 하나여야 합니다'

type Issue = { path: unknown[]; code: string; message: string }

function rejectionOf(run: () => unknown): BusinessError {
  try {
    run()
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('던지지 않았다')
}

function issuesOf(run: () => unknown): Issue[] {
  const error = rejectionOf(run)
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
  return (error.details as { issues: Issue[] }).issues
}

describe('LegalPublishBodyPipe', () => {
  it('종류는 옵션 안만 · 본문을 트림하지 않는다 · 보낸 contentHash 는 버린다(Review Focus 3)', () => {
    expect(
      publishPipe.transform({
        kind: 'PRIVACY',
        body: '  본문  ',
        baseLegalDocNo: 3n,
        contentHash: '0'.repeat(64),
      }),
    ).toEqual({ kind: 'PRIVACY', body: '  본문  ', baseLegalDocNo: 3n })
  })

  it('🔴 모르는 종류 400 issues[kind] — zod ko 열거 문구(§14 R5-3), 대소문자를 가른다', () => {
    for (const kind of ['REFUND', 'terms', '', 3]) {
      expect(
        issuesOf(() => publishPipe.transform({ kind, body: 'x', baseLegalDocNo: null })),
      ).toEqual([{ path: ['kind'], code: 'invalid_value', message: UNKNOWN_KIND }])
    }
  })

  it('본문 검증은 admin-shared 그대로 — 공백만 · 1,000,001자 · 기준 판 빠짐 · 숫자 기준 판', () => {
    expect(
      issuesOf(() => publishPipe.transform({ kind: 'TERMS', body: '   ', baseLegalDocNo: null })),
    ).toEqual([{ path: ['body'], code: 'invalid_format', message: '본문을 입력하세요.' }])
    expect(
      issuesOf(() =>
        publishPipe.transform({ kind: 'TERMS', body: 'x'.repeat(1_000_001), baseLegalDocNo: null }),
      ),
    ).toEqual([
      { path: ['body'], code: 'too_big', message: '본문은 1,000,000자를 넘을 수 없습니다.' },
    ])
    for (const body of [
      { kind: 'TERMS', body: 'x' },
      { kind: 'TERMS', body: 'x', baseLegalDocNo: 5 },
    ]) {
      expect(issuesOf(() => publishPipe.transform(body)).map((issue) => issue.path)).toEqual([
        ['baseLegalDocNo'],
      ])
    }
  })
})

describe('LegalKindQueryPipe', () => {
  it('종류 하나 — 다른 쿼리 키는 버린다', () => {
    expect(queryPipe.transform({ kind: 'TERMS', page: '2' })).toEqual({ kind: 'TERMS' })
  })

  it('🔴 빠짐 · 배열 · 모르는 값 · 소문자 400 issues[kind] — 500 이 아니다(Review Focus 4)', () => {
    for (const value of [
      {},
      { kind: ['TERMS', 'PRIVACY'] },
      { kind: 'REFUND' },
      { kind: 'terms' },
    ]) {
      expect(issuesOf(() => queryPipe.transform(value))).toEqual([
        { path: ['kind'], code: 'invalid_value', message: UNKNOWN_KIND },
      ])
    }
  })
})
