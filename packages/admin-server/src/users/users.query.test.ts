import { describe, expect, it } from 'vitest'
import { adminUserListQuerySchema } from './users.query.js'

describe('adminUserListQuerySchema', () => {
  it('기본 — 1쪽 · 20개 · createAt 내림차순 · 필터 없음', () => {
    expect(adminUserListQuerySchema.parse({})).toEqual({
      page: 1,
      itemsPerPage: 20,
      sortBy: ['createAt'],
      sortOrder: ['desc'],
    })
  })

  it("🔴 filter[recursive] 는 'true' · 'false' 만 — 'false' 는 거짓, '0' · '' 는 거부", () => {
    expect(adminUserListQuerySchema.parse({ filter: { recursive: 'false' } }).filter).toEqual({
      recursive: false,
    })
    for (const recursive of ['0', '', '1']) {
      expect(adminUserListQuerySchema.safeParse({ filter: { recursive } }).success, recursive).toBe(
        false,
      )
    }
  })

  it('filter[teamNo] 는 0 이상 정수 문자열 — 빈 값 · 부호는 거부', () => {
    expect(adminUserListQuerySchema.parse({ filter: { teamNo: '12' } }).filter?.teamNo).toBe(12n)
    for (const teamNo of ['', '-1', ' 3']) {
      expect(adminUserListQuerySchema.safeParse({ filter: { teamNo } }).success, teamNo).toBe(false)
    }
  })

  it('keyword 는 앞뒤 공백을 떼고 64자까지 · status 는 active · resigned · 정렬 열 밖은 거부', () => {
    expect(adminUserListQuerySchema.parse({ filter: { keyword: ' kim ' } }).filter?.keyword).toBe(
      'kim',
    )
    expect(
      adminUserListQuerySchema.safeParse({ filter: { keyword: 'a'.repeat(65) } }).success,
    ).toBe(false)
    expect(adminUserListQuerySchema.safeParse({ filter: { status: 'gone' } }).success).toBe(false)
    expect(adminUserListQuerySchema.safeParse({ sortBy: 'password' }).success).toBe(false)
    expect(adminUserListQuerySchema.parse({ sortBy: 'resignAt', sortOrder: 'asc' })).toMatchObject({
      sortBy: ['resignAt'],
      sortOrder: ['asc'],
    })
  })
})
