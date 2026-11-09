// 정본: ssworks-gise-home apps/api/src/core/database/json-column.ts
// 바꾼 점: 주석 — 풀이 `autoJsonMap: false`(adminPoolConfig)라 JSON 컬럼은 늘 원문 글자로 온다.

/**
 * MariaDB `JSON` 컬럼의 SELECT 값을 읽는다.
 *
 * `adminPoolConfig` 로 만든 풀은 JSON 컬럼(LONGTEXT 별칭 + json 확장 메타데이터)을 **원문 글자**로 준다(`autoJsonMap: false`).
 * 글자가 아닌 값(SQL NULL 의 `null`, 그 풀을 거치지 않은 연결이 파싱한 값)은 그대로 돌려준다 — 읽기 타입이
 * `unknown` 인 이유다. 🔴 드라이버 기본값(`autoJsonMap`)으로 만든 풀에서는 최상위 JSON 문자열(`'"reject"'`)이 JS
 * 문자열로 와 원문과 구분되지 않는다 — 이 함수가 다시 파싱하다 던지거나 `'"123"'` 을 숫자로 바꾼다. 풀은
 * `adminPoolConfig` 하나로 만든다.
 *
 * 값에 bigint(`"BigInt(n)"`)가 들어 있으면 이 함수 대신 원문 글자를 admin-shared `parseJSON` 에 넘긴다 — 이 함수는
 * 표준 `JSON.parse` 라 `"BigInt(n)"` 을 문자열로 둔다.
 *
 * 🔴 잘못된 JSON 문자열은 삼키지 않는다 — `JSON.parse` 가 그대로 던진다. 반환값은 형태를 보장하지 않으므로 호출부가
 *    곧바로 zod 로 검증한다.
 */
export function readJsonColumn(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value
}
