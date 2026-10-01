/**
 * HTTP 경계의 BigInt-safe JSON 코덱.
 *
 * 정본: ssworks-gise-home `packages/shared/src/json/bigint-json.ts`
 *       (= hangang-home `utils/bigint-json.ts` 커밋 2cc40c0 의 이식본). 래퍼 형식 `BigInt(n)` 과
 *       B9 이스케이프 규칙은 원본 그대로다 — crm-v5·axion 의 판(이스케이프 없음, 끝 앵커 없는
 *       정규식)은 폐기했다.
 *
 * 네 프로젝트 모두 PK 가 `bigint` 이고 와이어 표기는 `"BigInt(123)"` 문자열이다. 프론트는
 * `parseJSON` 으로 되돌리고(axios `transformResponse`), 백엔드는 `bigintJsonReplacer` 를
 * Express `json replacer` 나 응답 인터셉터에 꽂는다.
 *
 * B9 이스케이프: 사용자가 입력한 **일반 문자열**이 우연히 `BigInt(3)` 꼴이면 리바이버가 그것을
 * 숫자로 바꿔 버린다. 그래서 replacer 가 그런 문자열 앞에 역슬래시 한 개를 붙이고, 리바이버가
 * 역슬래시 붙은 꼴은 한 겹만 벗겨 되돌린다. 왕복이 보존된다.
 */

const BIGINT_PATTERN = /^BigInt\((-?\d+)\)$/

/** `BigInt(n)` 래퍼와 충돌하는 일반 문자열. replacer 가 역슬래시 한 개를 앞에 붙이는 대상. */
const ESCAPE_NEEDED_PATTERN = /^\\*BigInt\(-?\d+\)$/

/** 역슬래시가 하나 이상 붙은 `BigInt(n)` 꼴. reviver 가 한 겹만 벗긴다. */
const ESCAPED_PATTERN = /^\\+BigInt\(-?\d+\)$/

/**
 * `JSON.parse` 의 reviver. 문자열이 `BigInt(n)` 패턴이면 bigint 로, 역슬래시가 붙은 패턴
 * 문자열이면 역슬래시를 한 겹 벗겨 되돌린다. 그 외 값은 그대로 둔다.
 */
export function bigintJsonReviver(this: unknown, _key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    const match = BIGINT_PATTERN.exec(value)
    if (match) return BigInt(match[1]!)
    if (ESCAPED_PATTERN.test(value)) return value.slice(1)
  }
  return value
}

/**
 * `JSON.stringify` 의 replacer. bigint 를 `BigInt(n)` 문자열로, `BigInt(n)` 패턴과 충돌하는
 * 문자열은 역슬래시 한 개를 붙여 내보낸다. 그 외 값은 그대로 둔다.
 */
export function bigintJsonReplacer(this: unknown, _key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return `BigInt(${value.toString()})`
  if (typeof value === 'string' && ESCAPE_NEEDED_PATTERN.test(value)) return `\\${value}`
  return value
}

/** 응답·요청 본문을 파싱하며 `BigInt(n)` 표기를 JS `bigint` 로 되돌린다. */
export function parseJSON<T = unknown>(text: string): T {
  return JSON.parse(text, bigintJsonReviver) as T
}

/** 요청·응답 본문을 만들며 JS `bigint` 를 `BigInt(n)` 표기로 내보낸다. */
export function stringifyJSON(value: unknown): string {
  return JSON.stringify(value, bigintJsonReplacer)
}

/**
 * 값 트리를 와이어-안전한 형태로 접는다 — bigint → `"BigInt(n)"`, Date → ISO 문자열.
 *
 * 응답 직렬화 경로에 replacer 를 꽂을 수 없는 자리(예: 프레임워크가 `JSON.stringify` 를
 * 직접 부르는 곳)에서 응답 직전에 한 번 호출한다. hangang-home `toWireSafe()` 와 같은 역할.
 */
export function toWireSafe<T>(value: T): unknown {
  return JSON.parse(stringifyJSON(value))
}
