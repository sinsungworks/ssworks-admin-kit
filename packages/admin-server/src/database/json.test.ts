import { describe, expect, it } from 'vitest'
import { readJsonColumn } from './json.js'

describe('readJsonColumn', () => {
  it('문자열이면 파싱한다', () => {
    expect(readJsonColumn('["*"]')).toEqual(['*'])
  })

  it('드라이버가 이미 파싱한 값은 그대로', () => {
    const value = { a: [1] }
    expect(readJsonColumn(value)).toBe(value)
  })

  it('🔴 잘못된 JSON 은 삼키지 않고 던진다', () => {
    expect(() => readJsonColumn('{bad')).toThrow(SyntaxError)
  })
})
