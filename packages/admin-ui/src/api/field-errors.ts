import { CommonErrorCodes, validationDetailsSchema } from '@ssworks/admin-shared'
import { ApiError } from './error.js'

// 정본: ssworks-gise-home apps/admin/src/composables/useFieldErrors.ts 의 `toFieldErrors`
// 바꾼 점:
//  - 🔴 `path` 는 배열이다(킷 계약 admin-shared `validationDetailsSchema`). gise 서버는 점 연결 문자열을
//    보냈다 — 그 코드를 그대로 옮기면 키가 전부 어긋난다. 여기서 `.` 으로 잇는다.
//  - `payload.` 접두 제거(gise 섹션 저장 본문 전용)와 provide/inject 표시 추적은 버렸다(템플릿 몫).
//  - 🔴 Map 으로 누적해 fromEntries — plain `{}` 는 inherited 키(`constructor`·`__proto__`)에 throw.

/**
 * 검증 실패(`ERR_COMMON_VALIDATION`)를 필드 키별 메시지로 바꾼다. 형태가 맞지 않으면 `{}` —
 * 던지지 않는다. 키는 path 를 `.` 으로 이은 것: `['members', 0, 'name']` → `'members.0.name'`,
 * 루트 `[]` → `''`.
 */
export function toFieldErrors(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiError) || error.code !== CommonErrorCodes.ERR_COMMON_VALIDATION) {
    return {}
  }
  const parsed = validationDetailsSchema.safeParse(error.details)
  if (!parsed.success) return {}
  const map = new Map<string, string[]>()
  for (const issue of parsed.data.issues) {
    const key = issue.path.join('.')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(issue.message)
  }
  return Object.fromEntries(map)
}
