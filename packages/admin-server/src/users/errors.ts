import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { validationError } from '../http/validation.js'

// 정본: 없음 — 사용자 서비스 · 잠금 도우미가 같은 오류를 만든다(2d 스펙 §6 · ⑬ K1). 문구는 ACCOUNT_MESSAGES 한 곳.

export function noUser(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_USER, ACCOUNT_MESSAGES.noUser)
}

/** 상태 전이 · 재직 구간 위반 — 409 ERR_COMMON_CONFLICT */
export function userConflict(message: string): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, message)
}

/** 본문 칸에 붙는 위반 — 400 ERR_COMMON_VALIDATION + issues[{ path: [field] }](B1 — admin-ui toFieldErrors 가 칸에 단다) */
export function fieldError(field: string, message: string): BusinessError {
  return validationError([{ path: [field], code: 'custom', message }], message)
}

export function userRevisionConflict(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    ACCOUNT_MESSAGES.userRevisionMismatch,
  )
}
