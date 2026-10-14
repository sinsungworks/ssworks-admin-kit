import { BusinessError } from '@ssworks/admin-shared'

// 정본: 없음 — 2a F10 · R3 "UNIQUE 를 도메인 오류로 바꾸는 일은 그 모듈이 제약 이름을 보고 한다", 2d 스펙 §14 R1-6.

/**
 * 드라이버의 UNIQUE 위반이 이 제약 이름인가. `runWriteTransaction` 이 `mapError` 로 `ERR_COMMON_DUPLICATED` 를 만들어도
 * 원본은 `cause` 에 남는다. 제약 이름은 DB 의 snake_case 다(`uq_roles_role_name` — CamelCasePlugin 이 바꾼 이름).
 * `logParam: false` 에서도 메시지에 키 이름이 실린다(2a R3).
 */
export function isDuplicateOf(error: unknown, constraint: string): boolean {
  const source = error instanceof BusinessError ? (error as Error).cause : error
  if (typeof source !== 'object' || source === null) return false
  const { code, message } = source as { code?: unknown; message?: unknown }
  return (
    code === 'ER_DUP_ENTRY' && typeof message === 'string' && message.includes(`'${constraint}'`)
  )
}
