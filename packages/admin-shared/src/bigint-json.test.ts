import { describe, expect, it } from 'vitest'
import {
  bigintJsonReplacer,
  bigintJsonReviver,
  parseJSON,
  stringifyJSON,
  toWireSafe,
} from './bigint-json.js'

describe('bigint-json — 와이어 표기 BigInt(n)', () => {
  it('bigint 는 "BigInt(n)" 문자열로 나가고 되돌아온다', () => {
    const text = stringifyJSON({ userNo: 123n, nested: { roleNo: -7n }, list: [1n, 2n] })
    expect(text).toBe(
      '{"userNo":"BigInt(123)","nested":{"roleNo":"BigInt(-7)"},"list":["BigInt(1)","BigInt(2)"]}',
    )
    expect(parseJSON(text)).toEqual({ userNo: 123n, nested: { roleNo: -7n }, list: [1n, 2n] })
  })

  it('number · string · null · Date 는 손대지 않는다', () => {
    const text = stringifyJSON({ n: 1, s: 'abc', z: null, d: new Date('2026-01-02T03:04:05.000Z') })
    expect(parseJSON(text)).toEqual({ n: 1, s: 'abc', z: null, d: '2026-01-02T03:04:05.000Z' })
  })

  // 🔴 B9 — 사용자가 입력한 일반 문자열이 우연히 래퍼 꼴이면 숫자로 둔갑한다. 그래서 이스케이프한다.
  it('🔴 B9: 래퍼 꼴 일반 문자열은 역슬래시로 보호되어 왕복이 보존된다', () => {
    const original = { memo: 'BigInt(42)', deeper: '\\BigInt(1)' }
    const text = stringifyJSON(original)
    expect(text).toBe('{"memo":"\\\\BigInt(42)","deeper":"\\\\\\\\BigInt(1)"}')
    expect(parseJSON(text)).toEqual(original)
  })

  it('B9: 리바이버는 역슬래시를 한 겹만 벗긴다', () => {
    expect(bigintJsonReviver('', '\\BigInt(3)')).toBe('BigInt(3)')
    expect(bigintJsonReviver('', '\\\\BigInt(3)')).toBe('\\BigInt(3)')
    expect(bigintJsonReviver('', 'BigInt(3)')).toBe(3n)
  })

  it('래퍼와 비슷하지만 다른 문자열은 건드리지 않는다 — 끝 앵커가 있다', () => {
    for (const value of [
      'BigInt(3) ',
      ' BigInt(3)',
      'BigInt(3)x',
      'BigInt()',
      'BigInt(a)',
      'bigint(3)',
    ]) {
      expect(bigintJsonReviver('', value)).toBe(value)
      expect(bigintJsonReplacer('', value)).toBe(value)
    }
  })

  it('toWireSafe 는 bigint 를 접고 Date 를 ISO 로 만든다 — replacer 를 못 꽂는 자리용', () => {
    expect(toWireSafe({ userNo: 5n, at: new Date('2026-01-01T00:00:00.000Z') })).toEqual({
      userNo: 'BigInt(5)',
      at: '2026-01-01T00:00:00.000Z',
    })
  })
})
