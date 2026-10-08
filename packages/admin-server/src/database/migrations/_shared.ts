import { sql } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/migrations/_shared.ts
// 바꾼 점: 이 패키지 장이 쓰는 것만 남겼다(ASCII_CI 뺌).

/**
 * 🔴 모든 `createTable` 의 꼬리에 붙인다. 서버 기본 collation 이 바뀌어도 테이블이 조용히 갈리지 않게 명시한다.
 * 대소문자를 무시해야 하는 컬럼은 `UTF8_CI` 를 컬럼마다 붙인다 — 빠뜨리면 UNIQUE 가 `admin` · `Admin` 을 둘 다 허용한다.
 */
export const TABLE_OPTIONS = sql`engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin`

/** 대소문자를 무시하는 컬럼 — 로그인 아이디 · 사람이 입력하는 이름(UNIQUE · LIKE · 정렬 대상) */
export const UTF8_CI = sql`collate utf8mb4_unicode_ci`

/** 토큰 · 해시 — 대소문자가 값의 일부다 */
export const ASCII_BIN = sql`collate ascii_bin`

/** MariaDB 의 `JSON` 은 `LONGTEXT` 별칭이며 정의상 `utf8mb4_bin` 이다 */
export const JSON_BIN = sql`collate utf8mb4_bin`

/** 컬럼 설명. 정의 시점에 붙인다(나중의 `ALTER … MODIFY` 우회를 쓰지 않는다) */
export const comment = (text: string) => sql`comment ${sql.lit(text)}`
