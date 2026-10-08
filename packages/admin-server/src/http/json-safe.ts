import { stringifyJSON } from '@ssworks/admin-shared'

// 정본: ssworks-gise-home apps/api/src/core/filters/business-exception.filter.ts 의 단일 소독 경계(toJsonSafe ·
//       sanitize · stringifyForLog)
// 바꾼 점: 필터 파일에서 떼어 냈다 — 필터와 로그가 같은 경계를 쓰고, 이 파일만 따로 시험한다.
//
// 🔴 어떤 입력에도 던지지 않는다. 순환 참조 · 던지는 getter · 깊이 상한을 마커로 접는다.
// 🔴 bigint 는 그대로 남긴다 — 래퍼로 바꾸는 것은 직렬화하는 쪽(`stringifyJSON`)이다.

export type JsonSafe =
  string | number | bigint | boolean | null | JsonSafe[] | { [key: string]: JsonSafe }

/** 조상을 다시 가리키는 진짜 순환 지점에만 붙는다. */
const CIRCULAR_MARKER = '[circular]'
/** 읽거나 변환할 수 없는 **그 값 하나**를 대체한다 — 형제 필드는 살아남는다. */
const UNSERIALIZABLE_MARKER = '[unserializable]'
/** 재귀 깊이 상한. 상한이 있어야 스택 오버플로가 봉투를 통째로 날리지 않는다. */
const DEPTH_LIMIT_MARKER = '[max depth]'
const MAX_DEPTH = 32

/** 반환값 `undefined` 는 `JSON.stringify` 가 그 값을 생략하는 경우와 같다(객체 키는 지워지고 배열 원소는 null). */
export function toJsonSafe(value: unknown): JsonSafe | undefined {
  try {
    return sanitize(value, new Set<object>(), 0)
  } catch {
    return UNSERIALIZABLE_MARKER
  }
}

/** 로그용 문자열 — 응답과 같은 경계를 지나고 bigint 는 `"BigInt(n)"` 으로. 던지지 않는다. */
export function stringifyForLog(value: unknown): string {
  try {
    return stringifyJSON(toJsonSafe(value)) ?? UNSERIALIZABLE_MARKER
  } catch {
    return UNSERIALIZABLE_MARKER
  }
}

function sanitize(value: unknown, ancestors: Set<object>, depth: number): JsonSafe | undefined {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      // `JSON.stringify(NaN) === 'null'` — 같은 결과를 낸다.
      return Number.isFinite(value) ? value : null
    case 'bigint':
      return value
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined
    default:
      break
  }
  if (value === null) return null

  const node = value as object
  // 🔴 순환은 **조상 참조**다. "한 번이라도 본 객체" 로 세면 `{ a: child, b: child }` 의 둘째 가지가 지워진다(gise
  //    round 3 결함). 현재 경로만 추적하고 빠져나올 때 지운다.
  if (ancestors.has(node)) return CIRCULAR_MARKER
  if (depth >= MAX_DEPTH) return DEPTH_LIMIT_MARKER

  ancestors.add(node)
  try {
    const unwrapped = unwrapToJson(node)
    if (unwrapped !== node) return sanitize(unwrapped, ancestors, depth)
    if (Array.isArray(node)) return sanitizeArray(node, ancestors, depth)
    return sanitizeObject(node, ancestors, depth)
  } finally {
    ancestors.delete(node)
  }
}

/** `toJSON()` 을 가진 값(`Date`)은 `JSON.stringify` 처럼 그 결과를 쓴다 — 아니면 `Date` 가 `{}` 가 된다. */
function unwrapToJson(node: object): unknown {
  let toJson: unknown
  try {
    toJson = (node as { toJSON?: unknown }).toJSON
  } catch {
    return node
  }
  if (typeof toJson !== 'function') return node
  try {
    return (toJson as () => unknown).call(node)
  } catch {
    return UNSERIALIZABLE_MARKER
  }
}

function sanitizeArray(node: unknown[], ancestors: Set<object>, depth: number): JsonSafe {
  const out: JsonSafe[] = []
  for (let index = 0; index < node.length; index += 1) {
    let item: unknown
    try {
      item = node[index]
    } catch {
      out.push(UNSERIALIZABLE_MARKER)
      continue
    }
    out.push(sanitize(item, ancestors, depth + 1) ?? null)
  }
  return out
}

function sanitizeObject(node: object, ancestors: Set<object>, depth: number): JsonSafe {
  let keys: string[]
  try {
    keys = Object.keys(node)
  } catch {
    return UNSERIALIZABLE_MARKER
  }
  const out: Record<string, JsonSafe> = {}
  for (const key of keys) {
    let raw: unknown
    try {
      raw = (node as Record<string, unknown>)[key]
    } catch {
      // 접근하면 던지는 getter — 그 키만 마커로 바꾸고 형제는 살린다.
      out[key] = UNSERIALIZABLE_MARKER
      continue
    }
    const child = sanitize(raw, ancestors, depth + 1)
    if (child !== undefined) out[key] = child
  }
  return out
}
