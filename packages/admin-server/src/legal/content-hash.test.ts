import { describe, expect, it } from 'vitest'
import { legalContentHash } from './content-hash.js'

const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)

describe('legalContentHash — sha256(body, utf8) hex 소문자(3e §9)', () => {
  it('알려진 벡터 — 빈 문자열 · 한글 · CRLF · LF', () => {
    expect(legalContentHash('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(legalContentHash('약관')).toBe(
      '79928e09de12ead932f6a6f7c0c2f9493f492eb419e4c3e9d4e991a851c15d21',
    )
    expect(legalContentHash(['a', 'b'].join(CRLF))).toBe(
      '18745f36a05e29072709042d6062ce54f1b08ff36c27ba80c39f81fb010c8ce2',
    )
    expect(legalContentHash(['a', 'b'].join(LF))).toBe(
      '7e18f737311b2dc3b2f269dd78396b0351f14fb66efa879f768cb23181883c78',
    )
  })

  it('🔴 트림 · 정규화하지 않는다 — 끝 공백 · 줄바꿈만 달라도 다른 해시(Review Focus 2)', () => {
    expect(legalContentHash('본문 ')).not.toBe(legalContentHash('본문'))
    expect(legalContentHash(['가', '나'].join(CRLF))).not.toBe(
      legalContentHash(['가', '나'].join(LF)),
    )
  })
})
