import { z } from 'zod'

/**
 * 목록 조회 규약 — 오프셋 페이지네이션 · 다중 정렬 · 필터 객체.
 *
 * 정본: kim5257-crm-v5 `packages/shared/src/schemas/pagination.schema.ts`. axion 이 그대로 쓰고
 * hangang 은 flat 단일 `sortBy` 로 축소했다. `toArray` 가 단일값도 받으므로 hangang 식 쿼리
 * (`?sortBy=createAt&sortOrder=desc&userId=...`)도 상위 호환으로 수용된다 — 단 flat 필터는
 * `filter[...]` 가 아니라 프로젝트가 `extend()` 로 더해야 한다.
 *
 * 응답의 `total` 은 bigint 다(결정 3 — bigint 는 `"BigInt(n)"` 래퍼로 오간다).
 *
 * 쪽당 개수 상한 기본값은 100 이다(hangang·gise). crm-v5 의 10000 은 `createPaginationQuerySchema`
 * 옵션으로 올린다. 프론트 `DataTablePanel` 의 선택지(10/20/50/100)가 이 상한을 넘지 않는다.
 */

export const DEFAULT_ITEMS_PER_PAGE = 20
export const DEFAULT_MAX_ITEMS_PER_PAGE = 100

/** 단일값·배열 둘 다 허용해 배열로 정규화한다 (`?sortBy=a` 와 `?sortBy[]=a&sortBy[]=b`). */
export const toArray = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.array(schema)]).transform((val) => (Array.isArray(val) ? val : [val]))

export interface PaginationQueryOptions {
  defaultItemsPerPage?: number
  maxItemsPerPage?: number
}

export function createPaginationQuerySchema(options: PaginationQueryOptions = {}) {
  const {
    defaultItemsPerPage = DEFAULT_ITEMS_PER_PAGE,
    maxItemsPerPage = DEFAULT_MAX_ITEMS_PER_PAGE,
  } = options
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    itemsPerPage: z.coerce.number().int().min(1).max(maxItemsPerPage).default(defaultItemsPerPage),
  })
}

export const paginationQuerySchema = createPaginationQuerySchema()
export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export const paginationRespSchema = z.object({
  total: z.bigint().describe('전체 개수'),
  page: z.number().int().describe('현재 페이지'),
  itemsPerPage: z.number().int().describe('페이지 당 항목 수'),
})

/** `{ items, total, page, itemsPerPage }` — 목록 응답의 표준 모양. */
export function createPaginatedRespSchema<T extends z.ZodType>(itemSchema: T) {
  return paginationRespSchema.extend({ items: z.array(itemSchema) })
}

export interface Paginated<T> {
  items: T[]
  total: bigint
  page: number
  itemsPerPage: number
}

export const sortOrderSchema = z.enum(['asc', 'desc'])
export type SortOrder = z.infer<typeof sortOrderSchema>

export interface SortCondition<T extends string> {
  column: T
  order: SortOrder
}

/** `sortBy[]`·`sortOrder[]` 두 배열을 짝지어 정렬 조건 목록으로 만든다. 길이가 다르면 첫 order 를 재사용. */
export function parseSortConditions<T extends string>(
  sortBy: readonly T[],
  sortOrder: readonly SortOrder[],
): SortCondition<T>[] {
  return sortBy.map((column, index) => ({
    column,
    order: sortOrder[index] ?? sortOrder[0] ?? 'desc',
  }))
}

export interface QuerySchemaOptions<
  TSortable extends readonly [string, ...string[]],
  TFilter extends z.ZodRawShape,
> extends PaginationQueryOptions {
  sortableColumns: TSortable
  defaultSortColumn: TSortable[number]
  defaultSortOrder?: SortOrder
  /** `filter[key]=value` 로 받는 필터. 없으면 `{}`. */
  filterShape?: TFilter
}

/**
 * 목록 조회 쿼리 스키마.
 *
 * ```
 * GET /users?page=2&itemsPerPage=20&sortBy[]=createAt&sortOrder[]=desc&filter[teamNo]=3
 * ```
 */
export function createQuerySchema<
  TSortable extends readonly [string, ...string[]],
  TFilter extends z.ZodRawShape = Record<never, never>,
>(options: QuerySchemaOptions<TSortable, TFilter>) {
  const {
    sortableColumns,
    defaultSortColumn,
    defaultSortOrder = 'desc',
    filterShape = {} as TFilter,
  } = options
  const columnSchema = z.enum(sortableColumns)

  return createPaginationQuerySchema(options).extend({
    sortBy: toArray(columnSchema).optional().default([defaultSortColumn]),
    sortOrder: toArray(sortOrderSchema).optional().default([defaultSortOrder]),
    filter: z.object(filterShape).partial().optional(),
  })
}

/** `createQuerySchema` 결과를 Kysely 등에서 바로 쓰게 평탄화한다. */
export function toListQuery<T extends string>(parsed: {
  page: number
  itemsPerPage: number
  sortBy: T[]
  sortOrder: SortOrder[]
}): { offset: number; limit: number; sort: SortCondition<T>[] } {
  return {
    offset: (parsed.page - 1) * parsed.itemsPerPage,
    limit: parsed.itemsPerPage,
    sort: parseSortConditions(parsed.sortBy, parsed.sortOrder),
  }
}
