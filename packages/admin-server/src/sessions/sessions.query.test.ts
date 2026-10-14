import { describe, expect, it } from 'vitest'
import { adminSessionListQuerySchema } from './sessions.query.js'

describe('adminSessionListQuerySchema', () => {
  it('기본은 lastAccessAt 내림차순 · 1쪽 · 20개', () => {
    expect(adminSessionListQuerySchema.parse({})).toEqual({
      page: 1,
      itemsPerPage: 20,
      sortBy: ['lastAccessAt'],
      sortOrder: ['desc'],
    })
  })

  it('🔴 공백뿐인 검색어는 빈 문자열이 된다 — 조건 없음(Review Focus 2)', () => {
    expect(adminSessionListQuerySchema.parse({ filter: { keyword: '   ' } }).filter).toEqual({
      keyword: '',
    })
    expect(adminSessionListQuerySchema.parse({ filter: { keyword: ' kim ' } }).filter).toEqual({
      keyword: 'kim',
    })
  })

  it('검색어 64자 초과 · 모르는 정렬 열 · 빈 userNo 는 거부', () => {
    expect(
      adminSessionListQuerySchema.safeParse({ filter: { keyword: 'x'.repeat(65) } }).success,
    ).toBe(false)
    expect(adminSessionListQuerySchema.safeParse({ sortBy: 'userName' }).success).toBe(false)
    expect(adminSessionListQuerySchema.safeParse({ filter: { userNo: '' } }).success).toBe(false)
    expect(adminSessionListQuerySchema.parse({ filter: { userNo: '7' } }).filter).toEqual({
      userNo: 7n,
    })
  })
})
