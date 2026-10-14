// 정본: hangang-home apps/api/src/core/audit/audit.service.ts `scrubSecrets` · `foldBigInts` · `META_FIELD_BLACKLIST`
// 바꾼 점:
//  - 키 비교는 대소문자를 가리지 않는다(2c 스펙 B1). 프로젝트 키(hangang s3*Enc)는 쓰는 쪽 audit.secretKeys 로.
//  - 순환 '[Circular]' · 깊이 20 '[Depth]'(B7), meta 64 KiB 상한(B8) — 셋 다 행을 통째로 잃는 길을 막는다.
//  - 읽을 때 다시 가리기(hangang maskCiphertext)는 없다 — 모든 meta 가 쓸 때 여기를 지난다.

export const DEFAULT_SECRET_KEYS = Object.freeze([
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'refreshToken',
  'refreshTokenHash',
  'accessToken',
  'token',
  'secret',
  'keyHash',
] as const)

export const SECRET_MASK = '***'
export const META_MAX_BYTES = 64 * 1024
const MAX_DEPTH = 20
const UNSERIALIZABLE = '{"_unserializable":true}'

/** 기본 키 + 쓰는 쪽 키, 소문자로 */
export function secretKeySet(extra: readonly string[] = []): ReadonlySet<string> {
  return new Set([...DEFAULT_SECRET_KEYS, ...extra].map((key) => key.toLowerCase()))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

/**
 * 비밀 키의 값을 `'***'` 로 가린다 — 키는 남긴다(무엇이 바뀌었는지는 남는다).
 * 🔴 배열 · 중첩까지 내려간다(hangang I5 — 최상위만 보면 permissions 배열 안의 비밀이 그대로 실렸다).
 * 일반 객체 · 배열만 내려간다 — Date · 클래스 인스턴스는 그대로 둔다(`Object.entries(new Date())` 는 `{}`).
 */
export function scrubSecrets(value: unknown, keys: ReadonlySet<string>): unknown {
  const ancestors = new WeakSet<object>()
  const walk = (current: unknown, depth: number): unknown => {
    if (!Array.isArray(current) && !isPlainObject(current)) return current
    if (ancestors.has(current)) return '[Circular]'
    if (depth >= MAX_DEPTH) return '[Depth]'
    ancestors.add(current)
    const result = Array.isArray(current)
      ? current.map((item) => walk(item, depth + 1))
      : Object.fromEntries(
          Object.entries(current).map(([key, item]) => [
            key,
            keys.has(key.toLowerCase()) ? SECRET_MASK : walk(item, depth + 1),
          ]),
        )
    // 형제가 같은 객체를 가리키는 것은 순환이 아니다 — 조상에서만 뺀다.
    ancestors.delete(current)
    return result
  }
  return walk(value, 0)
}

/**
 * bigint → 십진 문자열, Date → ISO(잘못된 Date 는 null).
 * 🔴 admin-shared `stringifyJSON` 을 쓰지 않는다 — `"BigInt(n)"` 래퍼는 화면이 meta 를 다시 `JSON.stringify` 할 때
 *    TypeError 를 낸다(hangang).
 */
export function foldBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (Array.isArray(value)) return value.map(foldBigInts)
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, foldBigInts(item)]))
  }
  return value
}

/** 감사 행의 meta 컬럼 값. 비면 null. 🔴 던지지 않는다 — 실패 · 초과는 자리표시로 남긴다(행을 잃지 않는다) */
export function serializeAuditMeta(
  meta: Record<string, unknown>,
  keys: ReadonlySet<string>,
): string | null {
  if (Object.keys(meta).length === 0) return null
  let text: string
  try {
    text = JSON.stringify(foldBigInts(scrubSecrets(meta, keys)))
  } catch {
    return UNSERIALIZABLE
  }
  const bytes = Buffer.byteLength(text, 'utf8')
  return bytes > META_MAX_BYTES ? JSON.stringify({ _truncated: true, bytes }) : text
}
