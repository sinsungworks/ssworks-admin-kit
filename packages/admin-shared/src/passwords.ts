import { z } from 'zod'

// 비밀번호 정책 — Phase 2 서버의 본문 검증과 admin-ui `PasswordChangeForm` 이 같은 숫자 · 같은 문구를 쓴다.
//
// 정본: ssworks-gise-home packages/shared/src/account(ACCOUNT_LIMITS · ADMIN_PASSWORD_LENGTH_MESSAGE)
// 바꾼 점:
//  - 상수를 팩토리로 — 프로젝트가 숫자를 정한다. 기본은 8자(3c 결정 ⑧-L2, crm · axion · hangang 과 같음).
//  - 🔴 "새 = 현재" 를 본문 스키마의 `newPassword` 경로 오류로 둔다 — 서버가 이 스키마로 검증하면 화면은 필드
//    오류 하나의 경로(3a `toFieldErrors`)로 그 칸 옆에 낸다(3c 결정 ⑦-W1).
//  - `changePasswordSchema` 에는 `.refine()` 이 걸린다. 3b §11 R1 의 "refine 금지" 는 소비자가 `.omit()` 할 코어
//    행 스키마 이야기이고, 이 스키마는 변경 본문 전용이라 덜어 낼 일이 없다.
//  - 복잡도 규칙(대소문자 · 숫자)은 두지 않는다 — 네 프로젝트 모두 없다.

const DEFAULT_MIN_LENGTH = 8
const DEFAULT_MAX_LENGTH = 200
/** 현재 비밀번호 칸의 최소 상한 — 정책을 나중에 줄여도 예전의 긴 비밀번호로 바꾸기를 할 수 있어야 한다 */
const CURRENT_PASSWORD_MAX_FLOOR = 256
const SAME_AS_CURRENT_MESSAGE = '새 비밀번호가 현재 비밀번호와 같습니다.'

export interface PasswordPolicyOptions {
  /** 기본 8 */
  minLength?: number
  /** 기본 200 */
  maxLength?: number
}

export interface PasswordPolicy {
  readonly minLength: number
  readonly maxLength: number
  /** "비밀번호는 8자 이상 200자 이하로 정하세요." */
  readonly lengthMessage: string
  /** "새 비밀번호가 현재 비밀번호와 같습니다." */
  readonly sameAsCurrentMessage: string
  /** 새 비밀번호 · 임시 비밀번호 검증 — 길이 위반이면 `lengthMessage` */
  readonly passwordSchema: z.ZodString
  /** 비밀번호 변경 본문. 새 = 현재면 경로 `newPassword` 의 검증 오류 */
  readonly changePasswordSchema: z.ZodType<{ currentPassword: string; newPassword: string }>
}

export function definePasswordPolicy(options: PasswordPolicyOptions = {}): PasswordPolicy {
  const minLength = options.minLength ?? DEFAULT_MIN_LENGTH
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH
  if (!Number.isInteger(minLength) || minLength < 1) {
    throw new Error(
      `definePasswordPolicy: minLength 는 1 이상 정수여야 한다 (받은 값 ${minLength})`,
    )
  }
  if (!Number.isInteger(maxLength) || maxLength < minLength) {
    throw new Error(
      `definePasswordPolicy: maxLength 는 minLength(${minLength}) 이상 정수여야 한다 (받은 값 ${maxLength})`,
    )
  }
  const lengthMessage = `비밀번호는 ${minLength}자 이상 ${maxLength}자 이하로 정하세요.`
  const passwordSchema = z.string().min(minLength, lengthMessage).max(maxLength, lengthMessage)
  const changePasswordSchema = z
    .object({
      currentPassword: z.string().min(1).max(Math.max(maxLength, CURRENT_PASSWORD_MAX_FLOOR)),
      newPassword: passwordSchema,
    })
    .refine((body) => body.newPassword !== body.currentPassword, {
      path: ['newPassword'],
      message: SAME_AS_CURRENT_MESSAGE,
    })
  return Object.freeze({
    minLength,
    maxLength,
    lengthMessage,
    sameAsCurrentMessage: SAME_AS_CURRENT_MESSAGE,
    passwordSchema,
    changePasswordSchema,
  })
}

/**
 * 비밀번호 초기화 응답(그리고 계정 생성 응답에 함께 실리는 값). 키는 `temporaryPassword`(gise) — 변경 본문의
 * `newPassword` 와 뜻이 겹치지 않게 한다.
 */
export const adminTemporaryPasswordSchema = z.object({ temporaryPassword: z.string().min(1) })

export type AdminTemporaryPassword = z.infer<typeof adminTemporaryPasswordSchema>
