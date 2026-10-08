import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES as MESSAGES,
  publisherLabel,
  shortHash,
} from './legal-document.js'

describe('shortHash', () => {
  it('앞 8자', () => {
    expect(shortHash('a1b2c3d4' + 'e'.repeat(56))).toBe('a1b2c3d4')
  })

  it('비었으면 "-"', () => {
    expect(shortHash('')).toBe('-')
    expect(shortHash(null)).toBe('-')
  })
})

describe('publisherLabel — 이름 → #번호 → "-"(D20)', () => {
  it('이름이 있으면 이름', () => {
    expect(publisherLabel('김관리', 7n)).toBe('김관리')
  })

  it('이름이 없으면 #번호(axion)', () => {
    expect(publisherLabel(null, 7n)).toBe('#7')
  })

  it('둘 다 없으면 "-"(gise — 계정이 지워짐)', () => {
    expect(publisherLabel(null, null)).toBe('-')
  })
})

describe('화면 기본 문구', () => {
  it('충돌 안내 — 날짜를 알면 넣고, 모르면 뺀다', () => {
    expect(MESSAGES.conflict('2026-10-07 10:12')).toBe(
      '다른 관리자가 2026-10-07 10:12에 새 버전을 발행했습니다. 이력에서 새 판을 확인한 뒤 다시 발행하세요. 다시 발행하면 그 판을 대체합니다.',
    )
    expect(MESSAGES.conflict(null)).toBe(
      '다른 관리자가 새 버전을 발행했습니다. 이력에서 새 판을 확인한 뒤 다시 발행하세요. 다시 발행하면 그 판을 대체합니다.',
    )
  })

  it('너무 김 — 상한을 천 단위로 끊어 적는다', () => {
    expect(MESSAGES.blocked.tooLong).toBe('본문은 1,000,000자를 넘을 수 없습니다.')
  })
})
