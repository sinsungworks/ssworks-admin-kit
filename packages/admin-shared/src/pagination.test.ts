import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createPaginatedRespSchema,
  createPaginationQuerySchema,
  createQuerySchema,
  parseSortConditions,
  toListQuery,
} from './pagination.js'

describe('createPaginationQuerySchema', () => {
  it('기본값 page=1 · itemsPerPage=20, 상한 100', () => {
    const schema = createPaginationQuerySchema()
    expect(schema.parse({})).toEqual({ page: 1, itemsPerPage: 20 })
    expect(schema.parse({ page: '3', itemsPerPage: '50' })).toEqual({ page: 3, itemsPerPage: 50 })
    expect(() => schema.parse({ itemsPerPage: 101 })).toThrow()
    expect(() => schema.parse({ itemsPerPage: 0 })).toThrow()
    expect(() => schema.parse({ page: 0 })).toThrow()
  })

  it('🔴 -1(전체)은 거부한다 — Vuetify 푸터 기본 선택지가 이 값을 낸다', () => {
    expect(() => createPaginationQuerySchema().parse({ itemsPerPage: -1 })).toThrow()
  })

  it('상한·기본값을 프로젝트가 올릴 수 있다 (crm-v5: 100 / 10000)', () => {
    const schema = createPaginationQuerySchema({ defaultItemsPerPage: 100, maxItemsPerPage: 10000 })
    expect(schema.parse({})).toEqual({ page: 1, itemsPerPage: 100 })
    expect(schema.parse({ itemsPerPage: 10000 }).itemsPerPage).toBe(10000)
  })
})

describe('createQuerySchema — 정렬 · 필터', () => {
  const schema = createQuerySchema({
    sortableColumns: ['createAt', 'userName'] as const,
    defaultSortColumn: 'createAt',
    filterShape: { userId: z.string(), teamNo: z.coerce.bigint() },
  })

  it('비어 있으면 기본 정렬 하나와 필터 없음', () => {
    expect(schema.parse({})).toEqual({
      page: 1,
      itemsPerPage: 20,
      sortBy: ['createAt'],
      sortOrder: ['desc'],
      filter: undefined,
    })
  })

  it('단일값(hangang 식)과 배열(crm 식) 모두 배열로 정규화된다', () => {
    expect(schema.parse({ sortBy: 'userName', sortOrder: 'asc' })).toMatchObject({
      sortBy: ['userName'],
      sortOrder: ['asc'],
    })
    expect(
      schema.parse({ sortBy: ['createAt', 'userName'], sortOrder: ['desc', 'asc'] }),
    ).toMatchObject({ sortBy: ['createAt', 'userName'], sortOrder: ['desc', 'asc'] })
  })

  it('정렬 가능 컬럼 밖은 거부한다', () => {
    expect(() => schema.parse({ sortBy: 'password' })).toThrow()
  })

  it('filter 는 부분 객체이고 coerce 가 돈다', () => {
    expect(schema.parse({ filter: { teamNo: '7' } }).filter).toEqual({ teamNo: 7n })
  })

  it('filterShape 를 생략해도 된다', () => {
    const plain = createQuerySchema({ sortableColumns: ['a'] as const, defaultSortColumn: 'a' })
    expect(plain.parse({}).filter).toBeUndefined()
  })
})

describe('parseSortConditions / toListQuery', () => {
  it('길이가 다르면 첫 order 를 재사용한다', () => {
    expect(parseSortConditions(['a', 'b'], ['asc'])).toEqual([
      { column: 'a', order: 'asc' },
      { column: 'b', order: 'asc' },
    ])
    expect(parseSortConditions(['a'], [])).toEqual([{ column: 'a', order: 'desc' }])
  })

  it('offset · limit · sort 로 평탄화한다', () => {
    expect(
      toListQuery({ page: 3, itemsPerPage: 20, sortBy: ['createAt'], sortOrder: ['desc'] }),
    ).toEqual({ offset: 40, limit: 20, sort: [{ column: 'createAt', order: 'desc' }] })
  })
})

describe('createPaginatedRespSchema', () => {
  it('total 은 bigint 다 (결정 3)', () => {
    const schema = createPaginatedRespSchema(z.object({ userNo: z.bigint() }))
    expect(
      schema.parse({ items: [{ userNo: 1n }], total: 137n, page: 1, itemsPerPage: 20 }),
    ).toEqual({ items: [{ userNo: 1n }], total: 137n, page: 1, itemsPerPage: 20 })
    expect(() => schema.parse({ items: [], total: 137, page: 1, itemsPerPage: 20 })).toThrow()
  })
})
