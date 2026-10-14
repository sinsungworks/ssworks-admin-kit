import { readJsonColumn } from '../database/json.js'

// 정본: 2b KyselyAuthRepository.readPermissions(fail-closed) — 역할 서비스 · 세션 판정이 같은 읽기를 쓴다.

/**
 * `roles.permissions` → 문자열 배열(문자열 원소만). 🔴 배열이 아니거나 깨진 JSON 이면 null — 부르는 쪽이 역할 번호만
 *    담아 경고하고 빈 권한으로 본다(2b 와 같은 fail-closed — 500 으로 그 역할 전원을 막지 않는다).
 */
export function readPermissionsColumn(value: unknown): string[] | null {
  let parsed: unknown
  try {
    parsed = readJsonColumn(value)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed.filter((item): item is string => typeof item === 'string')
}
