import type { PoolConfig } from 'mariadb'

// 정본: hangang-home apps/api/src/core/database/pool-options.ts · database.module.ts(createDb),
//       ssworks-gise-home apps/api/src/core/database/pool.ts
// 바꾼 점:
//  - 접속 정보를 `process.env` 에서 직접 읽지 않고 `AdminDbConnection` 으로 받는다. env 를 읽는 자리는
//    `adminDbConnectionFromEnv()` 하나다. 이름은 hangang(`DB_NAME`) — gise 처럼 `DB_DATABASE` 를 쓰는 프로젝트는
//    객체를 직접 만들어 넘긴다.
//  - 🔴 이 파일은 Nest 를 import 하지 않는다 — 마이그레이션 러너(kysely.config.ts)가 `@ssworks/admin-server/runner`
//    로 읽는다(정본 규약 그대로).

/** DB 접속 정보. 풀 안전 옵션은 `adminPoolConfig()` 가 고정하고 여기서는 바꾸지 못한다. */
export interface AdminDbConnection {
  host: string
  /** 기본 3306 */
  port?: number
  user: string
  password: string
  database: string
  /** 풀 크기. 기본 10 — `connectionLimit × API 프로세스 수` 가 DB `max_connections` 여유 안에 들어야 한다(hangang) */
  connectionLimit?: number
  /** 풀에서 연결을 기다리는 한도(ms). 기본 10 000 */
  acquireTimeout?: number
}

type Env = Readonly<Record<string, string | undefined>>

const DEFAULT_PORT = 3306
const DEFAULT_CONNECTION_LIMIT = 10
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000

/**
 * 풀 숫자 env 를 읽는다. 없거나 비면 기본값, 있으면 양의 정수여야 한다.
 *
 * 🔴 `Number('ten')` 은 `NaN` 을 그대로 `createPool()` 에 넘기고 드라이버는 던지지 않는다 — 기동은 성공하고 증상은
 *    부하가 걸린 뒤에 나온다(hangang 최종 수정 A9-1).
 * 🔴 값을 메시지에 담지 않는다 — `DB_PORT` 는 자격증명과 같은 줄에 있다.
 */
export function poolEnvInt(name: string, fallback: number, env: Env = process.env): number {
  const raw = env[name]
  if (raw == null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} 은 양의 정수여야 한다`)
  return parsed
}

const REQUIRED_KEYS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const

/** `DB_HOST` · `DB_PORT` · `DB_USER` · `DB_PASSWORD` · `DB_NAME` · `DB_POOL_LIMIT` · `DB_ACQUIRE_TIMEOUT_MS` 를 읽는다. */
export function adminDbConnectionFromEnv(env: Env = process.env): AdminDbConnection {
  const missing = REQUIRED_KEYS.filter((key) => !env[key])
  // 🔴 이름만 담는다. 값은 담지 않는다.
  if (missing.length > 0) throw new Error(`필수 환경변수가 없다: ${missing.join(', ')}`)
  const value = (key: (typeof REQUIRED_KEYS)[number]): string => env[key] ?? ''
  return {
    host: value('DB_HOST'),
    port: poolEnvInt('DB_PORT', DEFAULT_PORT, env),
    user: value('DB_USER'),
    password: value('DB_PASSWORD'),
    database: value('DB_NAME'),
    connectionLimit: poolEnvInt('DB_POOL_LIMIT', DEFAULT_CONNECTION_LIMIT, env),
    acquireTimeout: poolEnvInt('DB_ACQUIRE_TIMEOUT_MS', DEFAULT_ACQUIRE_TIMEOUT_MS, env),
  }
}

/** 풀 옵션의 단일 출처 — 앱과 마이그레이션 러너가 같은 값을 쓴다. 접속 정보 밖의 키는 옮기지 않는다. */
export function adminPoolConfig(connection: AdminDbConnection): PoolConfig {
  return {
    host: connection.host,
    port: connection.port ?? DEFAULT_PORT,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    // 🔴 'auto' 가 아니다 — 머신 IANA 이름을 세션에 강제해 tz 테이블 없는 인스턴스에서 접속이 실패한다(hangang).
    timezone: 'Z',
    // 🔴 넷 다 명시한다. BIGINT 는 bigint 로, DECIMAL 은 문자열로 — 숫자로 바꾸면 정밀도가 조용히 깎인다.
    //    checkNumberRange 는 앞의 셋 중 하나가 true 일 때만 동작한다(gise 실측) — 그래도 명시한다.
    bigIntAsNumber: false,
    decimalAsNumber: false,
    insertIdAsNumber: false,
    checkNumberRange: true,
    // 🔴 드라이버가 SQL 과 바인딩 값을 오류 메시지에 붙이지 않게 한다(hangang 최종 수정 A2). 기본 true 면 argon2 해시와
    //    refresh 토큰 해시가 5xx 로그로 나간다. 진단은 오류 `code` 와 스택이면 된다.
    logParam: false,
    connectionLimit: connection.connectionLimit ?? DEFAULT_CONNECTION_LIMIT,
    acquireTimeout: connection.acquireTimeout ?? DEFAULT_ACQUIRE_TIMEOUT_MS,
  }
}
