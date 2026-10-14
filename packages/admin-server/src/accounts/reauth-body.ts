import { z } from 'zod'
import { ACCOUNT_MESSAGES } from './errors.js'
import type { AdminPermissionCatalog } from './options.js'

// 정본: hangang-home apps/api/src/core/utils/reauth-password.schema.ts(1..256 — 작업량 상한이지 정책이 아니다)
// 바꾼 점: 옵션(reauth)에 따라 켜고 끈다(2d 스펙 ⑦ R1 · B5). 끄면 보낸 값을 버린다 — 검증하지도 싣지도 않는다.

export const REAUTH_PASSWORD_MAX_LENGTH = 256

/**
 * 재인증 칸. 켜면 1~256자 필수 — 빠짐 · 빈 값은 그 칸의 필드 오류다(admin-ui 재인증 창이 띄운다, 3b D8). 🔴 파이프에서
 * 멈추므로 비밀번호를 대조하지 않는다 — 잠금 카운터가 오르지 않는다. 끄면 무엇이 와도 undefined.
 */
export function currentPasswordField(reauth: boolean): z.ZodType<string | undefined> {
  if (!reauth)
    return z
      .unknown()
      .optional()
      .transform(() => undefined)
  return z
    .string({ error: ACCOUNT_MESSAGES.currentPasswordRequired })
    .min(1, ACCOUNT_MESSAGES.currentPasswordRequired)
    .max(REAUTH_PASSWORD_MAX_LENGTH)
}

/** 권한 목록 — 원소마다 카탈로그로 거른다. 🔴 zod 열거형 문구는 카탈로그 값 전부를 나열한다(2d 스펙 §14 R1-7) */
export function permissionListSchema(catalog: AdminPermissionCatalog): z.ZodType<string[]> {
  return z.array(
    z.string().refine((value) => catalog.isPermission(value), {
      message: ACCOUNT_MESSAGES.unknownPermission,
    }),
  )
}
