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
  'temporaryPassword',
] as const)

export const SECRET_MASK = '***'
export const META_MAX_BYTES = 64 * 1024
const MAX_DEPTH = 20
const UNSERIALIZABLE = '{"_unserializable":true}'

/** 기본 키 + 쓰는 쪽 키, 소문자로 */
export function secretKeySet(extra: readonly string[] = []): ReadonlySet<string> {
  return new Set([...DEFAULT_SECRET_KEYS, ...extra].map((key) => key.toLowerCase()))
}

/**
 * `JSON.stringify` 가 보는 모양 — `toJSON` 이 있으면 그 결과, 없으면 자기 객체.
 * 🔴 일반 객체만 걷던 때(최종 리뷰 F1) 클래스 인스턴스(DTO · 엔티티)는 소독 · bigint 접기를 지나쳤는데 `JSON.stringify` 는
 *    자기 열거 속성을 그대로 직렬화해 비밀이 평문으로 남았다. 직렬화되는 것은 전부 걷는다. Date 는 호출한 쪽이 먼저 가른다.
 */
function jsonView(value: object): unknown {
  const toJSON = (value as { toJSON?: unknown }).toJSON
  return typeof toJSON === 'function' ? (toJSON as () => unknown).call(value) : value
}

/**
 * 비밀 키의 값을 `'***'` 로 가린다 — 키는 남긴다(무엇이 바뀌었는지는 남는다).
 * 🔴 배열 · 중첩까지 내려간다(hangang I5 — 최상위만 보면 permissions 배열 안의 비밀이 그대로 실렸다).
 * 🔴 클래스 인스턴스 · `toJSON` 객체도 내려간다(최종 리뷰 F1). Date 만 그대로 둔다.
 *    `__proto__` 키(JSON 본문의 자기 키)도 `Object.fromEntries` 가 자기 데이터 속성으로 만든다 — 대입(`[[Set]]`)이 아니다.
 */
export function scrubSecrets(value: unknown, keys: ReadonlySet<string>): unknown {
  const ancestors = new WeakSet<object>()
  const walk = (current: unknown, depth: number): unknown => {
    if (current === null || typeof current !== 'object' || current instanceof Date) return current
    if (ancestors.has(current)) return '[Circular]'
    if (depth >= MAX_DEPTH) return '[Depth]'
    ancestors.add(current)
    const view = Array.isArray(current) ? current : jsonView(current)
    let result: unknown
    if (Array.isArray(view)) {
      result = view.map((item) => walk(item, depth + 1))
    } else if (view === null || typeof view !== 'object' || view instanceof Date) {
      result = view
    } else {
      result = Object.fromEntries(
        Object.entries(view).map(([key, item]) => [
          key,
          keys.has(key.toLowerCase()) ? SECRET_MASK : walk(item, depth + 1),
        ]),
      )
    }
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
 * 🔴 클래스 인스턴스 · `toJSON` 객체도 걷는다(최종 리뷰 F1) — 안 걸으면 bigint 가 남아 직렬화가 통째로 자리표시로 떨어진다.
 */
export function foldBigInts(value: unknown): unknown {
  const ancestors = new WeakSet<object>()
  const walk = (current: unknown, depth: number): unknown => {
    if (typeof current === 'bigint') return current.toString()
    if (current instanceof Date)
      return Number.isNaN(current.getTime()) ? null : current.toISOString()
    if (current === null || typeof current !== 'object') return current
    if (ancestors.has(current)) return '[Circular]'
    if (depth >= MAX_DEPTH) return '[Depth]'
    ancestors.add(current)
    const view = Array.isArray(current) ? current : jsonView(current)
    let result: unknown
    if (Array.isArray(view)) {
      result = view.map((item) => walk(item, depth + 1))
    } else if (view === null || typeof view !== 'object' || view instanceof Date) {
      result = walk(view, depth + 1)
    } else {
      result = Object.fromEntries(
        Object.entries(view).map(([key, item]) => [key, walk(item, depth + 1)]),
      )
    }
    ancestors.delete(current)
    return result
  }
  return walk(value, 0)
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
