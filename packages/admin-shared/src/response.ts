import { z } from 'zod'

/**
 * API 응답 봉투 — 결정 1(2026-10-01): `{ success: true, data }` / `{ success: false, code, message, details? }`.
 *
 * 정본: kim5257-crm-v5 `packages/shared/src/schemas/response.schema.ts`.
 *
 * 프론트 `createApiClient` 는 이 봉투를 기본으로 벗기고, 서버 패키지의 응답 인터셉터가 씌운다.
 * 서비스 계층은 봉투를 모른다 — 컨트롤러가 반환한 값이 `data` 가 된다.
 */

export const errorRespSchema = z.object({
  success: z.literal(false),
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
})

export type ErrorResp = z.infer<typeof errorRespSchema>

export function createSuccessRespSchema<T extends z.ZodType>(
  dataSchema: T,
): z.ZodObject<{ success: z.ZodLiteral<true>; data: T }>
export function createSuccessRespSchema(): z.ZodObject<{ success: z.ZodLiteral<true> }>
export function createSuccessRespSchema<T extends z.ZodType>(dataSchema?: T) {
  return dataSchema != null
    ? z.object({ success: z.literal(true), data: dataSchema })
    : z.object({ success: z.literal(true) })
}

export const successRespSchema = createSuccessRespSchema()

export interface SuccessResp<T> {
  success: true
  data: T
}

export type ApiResp<T = undefined> = SuccessResp<T> | ErrorResp

export function isErrorResp(value: unknown): value is ErrorResp {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { code?: unknown }).code === 'string'
  )
}

export function isSuccessResp<T = unknown>(value: unknown): value is SuccessResp<T> {
  return (
    typeof value === 'object' && value !== null && (value as { success?: unknown }).success === true
  )
}

/**
 * 검증 실패(`ERR_COMMON_VALIDATION`)의 `details` 계약. 프론트 `useFieldErrors` 가 이 모양으로
 * 필드별 오류를 그린다. `path` 는 zod issue path 그대로다(본문 루트 기준).
 */
export const validationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
  code: z.string().optional(),
})

export const validationDetailsSchema = z.object({
  issues: z.array(validationIssueSchema),
})

export type ValidationIssue = z.infer<typeof validationIssueSchema>
export type ValidationDetails = z.infer<typeof validationDetailsSchema>
