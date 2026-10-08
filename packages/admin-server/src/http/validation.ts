import { BusinessError, CommonErrorCodes, type ValidationIssue } from '@ssworks/admin-shared'
import { z } from 'zod'

// 정본: ssworks-gise-home apps/api/src/core/pipes/zod-validation.pipe.ts(이슈 변환 · `input` 제외)
// 바꾼 점:
//  - 🔴 `path` 를 배열 그대로 싣는다. admin-shared `validationDetailsSchema` 와 admin-ui `toFieldErrors` 가 배열을 받는다
//    — gise 는 점으로 이어 보냈다.
//  - 코드는 admin-shared `ERR_COMMON_VALIDATION`. 기본 문구를 zod `ko` 로케일로(요청마다).

const DEFAULT_MESSAGE = '요청 형식이 올바르지 않습니다.'

/** 400 `ERR_COMMON_VALIDATION` + `details.issues` — 파이프와 서비스(틀린 현재 비밀번호 등)가 같은 모양을 낸다. */
export function validationError(
  issues: ValidationIssue[],
  message: string = DEFAULT_MESSAGE,
): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_VALIDATION, message, { issues })
}

/** zod 이슈 → 계약 이슈. 🔴 `input`(보낸 원문)을 싣지 않는다 — 비밀번호 같은 값이 응답으로 되돌아 나간다(gise). */
export function toValidationIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map((key) => (typeof key === 'symbol' ? String(key) : key)),
    code: issue.code,
    message: issue.message,
  }))
}

let koreanErrorMap: z.core.$ZodErrorMap | undefined

/**
 * zod 4 의 한국어 기본 문구. `safeParse(value, { error: koreanZodErrors() })` 로 요청마다 건다 — 스키마에 적은 문구가
 * 이긴다(4.6.5 실측). 🔴 전역 `z.config()` 를 건드리지 않는다 — 쓰는 쪽 zod 설정을 바꾸지 않는다.
 */
export function koreanZodErrors(): z.core.$ZodErrorMap {
  koreanErrorMap ??= z.locales.ko().localeError
  return koreanErrorMap
}
