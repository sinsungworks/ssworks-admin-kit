import type { Ref } from 'vue'
import type { LocationQuery, LocationQueryRaw, LocationQueryValue } from 'vue-router'

// 정본: kim5257-crm-v5 packages/frontend-core/src/utils/queryCodec.ts
// 바꾼 점:
//  - 코덱은 선택형 층이다. 동기화 타이밍(`useQuerySyncedFilter`)은 코덱을 모르고 `read`·`toQuery`
//    콜백만 받는다 — `bindQueryCodecs` 가 둘을 잇는다.
//  - 기본 코덱은 도메인 취향 없는 범용 6종(string · int · bool · enumOf · bigint · array)만. crm 의
//    `intRange` · `bigintArray` · `enumArray` · `stringArray` 는 `array(inner)` 로, `calendarDate` ·
//    `dateString`(KST)은 시간대 정책이 프로젝트마다 달라 뺐고, `sortCodec` 은 `useServerTable` 이
//    직접 처리한다. 그 밖은 `QueryCodec<T>` 를 구현한 사용자 코드다.
//  - 🔴 `decode` 는 던지지 않는다 — 형식이 틀린 값은 "없는 것" 이다(crm 과 같다). 주소창에 사람이 친
//    값 때문에 화면이 백지가 되면 안 된다.

/** vue-router 가 주는 쿼리 값 한 칸. 반복 키는 배열, `?flag` 는 `null`. */
export type RawQueryValue = LocationQueryValue | LocationQueryValue[] | undefined

export interface QueryCodec<T> {
  /** 형식이 틀리면 `undefined`. 던지지 않는다. */
  decode(raw: RawQueryValue): T | undefined
  /** `undefined` 면 URL 에서 뺀다. */
  encode(value: T): string | string[] | undefined
}

/** `withDefault` 결과 — 읽기가 항상 값을 낸다. */
export interface DefaultedQueryCodec<T> extends QueryCodec<T> {
  decode(raw: RawQueryValue): T
  readonly defaultValue: T
}

/** `useQuerySyncedFilter` · `useServerTable({ urlSync })` 가 받는 한 쌍. */
export interface QuerySyncBinding {
  /** URL → 화면 상태. 쿼리에 없거나 형식이 틀린 키는 기본값으로 되돌린다(전체 대입). */
  read: (query: LocationQuery) => void
  /** 화면 상태 → URL. 기본값과 같은 값은 `undefined` 로 빼서 돌려준다. */
  toQuery: () => LocationQueryRaw
}

/**
 * 상태 키마다 고르는 코덱. 🔴 기본값 없는 코덱은 URL 에 없으면 `undefined` 를 넣으므로, 상태 타입이
 * `undefined` 를 허용하는 키에만 쓸 수 있다 — 아니면 컴파일 오류(crm `FilterSpecFor` 와 같은 이유:
 * 타입상 있는 값이 런타임에 `undefined` 가 되는 유형을 막는다).
 */
export type QueryCodecSpec<S> = {
  [K in keyof S]?: undefined extends S[K]
    ? QueryCodec<Exclude<S[K], undefined>>
    : DefaultedQueryCodec<S[K]>
}

/** 단일 값 코덱은 첫 값만 본다. vue-router 는 반복 키를 배열로 준다. */
function first(raw: RawQueryValue): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : undefined
}

const INT = /^-?\d+$/
/** 🔴 앞자리 0 을 거부한다 — `007` 과 `7` 이 같은 상태의 두 URL 이 되지 않게. */
const BIGINT = /^(0|[1-9]\d*)$/

export const queryCodec = {
  /** 빈 문자열은 "없음". */
  string(): QueryCodec<string> {
    return {
      decode: (raw) => {
        const value = first(raw)
        return value === undefined || value === '' ? undefined : value
      },
      encode: (value) => (value === '' ? undefined : value),
    }
  },

  /** 안전 정수만. 범위 밖은 "없음". */
  int(options: { min?: number; max?: number } = {}): QueryCodec<number> {
    const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options
    const inRange = (n: number) => Number.isSafeInteger(n) && n >= min && n <= max
    return {
      decode: (raw) => {
        const value = first(raw)
        if (value === undefined || !INT.test(value)) return undefined
        const n = Number(value)
        return inRange(n) ? n : undefined
      },
      encode: (value) => (inRange(value) ? String(value) : undefined),
    }
  },

  /** 🔴 `'1'` / `'0'` 만 — 표기가 둘이면 같은 상태가 두 URL 로 갈린다. */
  bool(): QueryCodec<boolean> {
    return {
      decode: (raw) => {
        const value = first(raw)
        return value === '1' ? true : value === '0' ? false : undefined
      },
      encode: (value) => (value ? '1' : '0'),
    }
  },

  enumOf<const T extends string>(values: readonly T[]): QueryCodec<T> {
    const allowed: ReadonlySet<string> = new Set(values)
    return {
      decode: (raw) => {
        const value = first(raw)
        return value !== undefined && allowed.has(value) ? (value as T) : undefined
      },
      encode: (value) => (allowed.has(value) ? value : undefined),
    }
  },

  /** 0 이상 정수 ID. 킷의 ID 가 bigint 라 기본 코덱에 둔다. */
  bigint(): QueryCodec<bigint> {
    return {
      decode: (raw) => {
        const value = first(raw)
        return value !== undefined && BIGINT.test(value) ? BigInt(value) : undefined
      },
      encode: (value) => (value >= 0n ? value.toString() : undefined),
    }
  },

  /** 반복 키(`?tag=a&tag=b`). 틀린 원소는 버리고, 남은 게 없으면 "없음". */
  array<T>(inner: QueryCodec<T>): QueryCodec<T[]> {
    return {
      decode: (raw) => {
        if (raw === undefined) return undefined
        const out: T[] = []
        for (const item of Array.isArray(raw) ? raw : [raw]) {
          const value = inner.decode(item)
          if (value !== undefined) out.push(value)
        }
        return out.length > 0 ? out : undefined
      },
      encode: (values) => {
        const out: string[] = []
        for (const item of values) {
          const encoded = inner.encode(item)
          if (typeof encoded === 'string') out.push(encoded)
          else if (Array.isArray(encoded)) out.push(...encoded)
        }
        return out.length > 0 ? out : undefined
      },
    }
  },
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }
  return Object.is(a, b)
}

/** 없거나 틀리면 기본값으로 읽고, 기본값과 같으면 URL 에서 뺀다. 배열 · bigint 는 값으로 비교한다. */
export function withDefault<T>(codec: QueryCodec<T>, defaultValue: T): DefaultedQueryCodec<T> {
  return {
    defaultValue,
    decode: (raw) => codec.decode(raw) ?? defaultValue,
    encode: (value) => (sameValue(value, defaultValue) ? undefined : codec.encode(value)),
  }
}

/** 코덱 묶음 → `{ read, toQuery }`. `read` 는 spec 의 키만 새로 대입하고 나머지 상태 키는 둔다. */
export function bindQueryCodecs<S extends object>(
  state: Ref<S>,
  spec: QueryCodecSpec<S>,
): QuerySyncBinding {
  const entries = Object.entries(
    spec as unknown as Record<string, QueryCodec<unknown> | undefined>,
  ).filter((entry): entry is [string, QueryCodec<unknown>] => entry[1] !== undefined)
  return {
    read(query) {
      const next: Record<string, unknown> = { ...(state.value as Record<string, unknown>) }
      for (const [key, codec] of entries) next[key] = codec.decode(query[key])
      state.value = next as S
    },
    toQuery() {
      const current = state.value as Record<string, unknown>
      const out: LocationQueryRaw = {}
      for (const [key, codec] of entries) {
        const value = current[key]
        if (value === undefined) continue
        const encoded = codec.encode(value)
        if (encoded !== undefined) out[key] = encoded
      }
      return out
    },
  }
}
