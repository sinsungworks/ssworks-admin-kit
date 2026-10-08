// 정본: ssworks-gise-home apps/api/src/core/database/json-column.ts
// 바꾼 점: 없음.

/**
 * MariaDB `JSON` 컬럼의 SELECT 값을 읽는다.
 *
 * `mariadb` 드라이버는 `autoJsonMap` 기본값 때문에 JSON 컬럼(LONGTEXT 별칭 + json 확장 메타데이터)을 **이미 파싱한
 * 값**으로 줄 때가 있다. 문자열이라고 가정하지 않는다 — 테이블 타입의 읽기 타입이 `unknown` 인 이유다.
 *
 * 🔴 잘못된 JSON 문자열은 삼키지 않는다 — `JSON.parse` 가 그대로 던진다. 반환값은 형태를 보장하지 않으므로 호출부가
 *    곧바로 zod 로 검증한다.
 */
export function readJsonColumn(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value
}
