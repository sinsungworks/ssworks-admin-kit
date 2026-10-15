import { readFileSync } from 'node:fs'
import type { PoolConfig } from 'mariadb'

// 정본: hangang-home apps/api/src/core/database/pool-options.ts · database.module.ts(createDb),
//       ssworks-gise-home apps/api/src/core/database/pool.ts
// 바꾼 점:
//  - 접속 정보를 `process.env` 에서 직접 읽지 않고 `AdminDbConnection` 으로 받는다. env 를 읽는 자리는
//    `adminDbConnectionFromEnv()` 하나다. 이름은 hangang(`DB_NAME`) — gise 처럼 `DB_DATABASE` 를 쓰는 프로젝트는
//    객체를 직접 만들어 넘긴다.
//  - TLS(`ssl`) · 유닉스 소켓(`socketPath`)을 받는다(2f-2b — 정본 넷 모두 없었다). env 는 검증하는 두 가지
//    (`DB_SSL=true` · `DB_SSL_CA`)와 `DB_SOCKET_PATH` 만 연다 — 검증을 끄는 것은 코드로만(2f-2b 스펙 ③ T1).
//  - 🔴 이 파일은 Nest 를 import 하지 않는다 — 마이그레이션 러너(kysely.config.ts)가 `@ssworks/admin-server/runner`
//    로 읽는다(정본 규약 그대로).

/** DB 접속 정보. 풀 안전 옵션은 `adminPoolConfig()` 가 고정하고 여기서는 바꾸지 못한다. */
export interface AdminDbConnection {
  /** TCP 호스트. 🔴 `socketPath` 와 둘 중 하나만 */
  host?: string
  /** 기본 3306. `socketPath` 와 함께 쓰지 않는다 */
  port?: number
  /** 유닉스 소켓(Windows 는 명명 파이프 경로). 🔴 `host` · `port` · `ssl` 과 함께 쓰지 않는다 */
  socketPath?: string
  user: string
  password: string
  database: string
  /**
   * TLS — mariadb 드라이버 `ssl` 그대로. `true` = 시스템 CA 로 검증(MariaDB 11.4.1+ 의 자체 서명은 드라이버가
   * 비밀번호 지문으로 검증), 객체 = `{ ca, cert, key, servername, checkServerIdentity, rejectUnauthorized … }`.
   * 🔴 `rejectUnauthorized: false` 는 검증을 끈다 — 암호화만 되고 중간자를 막지 못한다.
   */
  ssl?: PoolConfig['ssl']
  /** 풀 크기. 기본 10 — `connectionLimit × API 프로세스 수` 가 DB `max_connections` 여유 안에 들어야 한다(hangang) */
  connectionLimit?: number
  /** 풀에서 연결을 기다리는 한도(ms). 기본 10 000 */
  acquireTimeout?: number
}

type Env = Readonly<Record<string, string | undefined>>

const DEFAULT_PORT = 3306
const DEFAULT_CONNECTION_LIMIT = 10
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000
const PEM_CERTIFICATE = '-----BEGIN CERTIFICATE-----'

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

const REQUIRED_KEYS = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const

/** 앞뒤 공백을 뗀 값. 비면 undefined — 공백만 든 env 는 없는 것으로 본다(새 env 셋만 — 기존 키의 판정은 그대로) */
function envText(env: Env, name: string): string | undefined {
  const value = env[name]?.trim()
  return value ? value : undefined
}

/** `DB_SSL` — 없음 · 빈 값은 undefined, `true` · `false` 만 받는다. 🔴 값을 메시지에 담지 않는다 */
function sslFlag(env: Env): boolean | undefined {
  const raw = envText(env, 'DB_SSL')
  if (raw === undefined) return undefined
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error('DB_SSL 은 true 나 false 여야 한다')
}

/** 🔴 Node 오류 메시지는 경로를 담는다 — 그대로 다시 던지지 않고 errno 코드만 담는다(cause 도 달지 않는다) */
function readCaFile(path: string): string {
  let pem: string
  try {
    pem = readFileSync(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN'
    throw new Error(`DB_SSL_CA 파일을 읽지 못했다(${code})`)
  }
  if (!pem.includes(PEM_CERTIFICATE)) throw new Error('DB_SSL_CA 가 PEM 인증서가 아니다')
  return pem
}

/** env 의 TLS — `DB_SSL_CA` 가 있으면 그 CA 로 검증(지문 검증은 드라이버가 끈다), `DB_SSL=true` 면 시스템 CA */
function tlsFromEnv(env: Env): AdminDbConnection['ssl'] | undefined {
  const flag = sslFlag(env)
  const caPath = envText(env, 'DB_SSL_CA')
  if (caPath !== undefined) {
    if (flag === false) throw new Error('DB_SSL=false 와 DB_SSL_CA 는 함께 쓰지 않는다')
    return { ca: readCaFile(caPath) }
  }
  return flag === true ? true : undefined
}

/**
 * `DB_HOST` · `DB_PORT` · `DB_USER` · `DB_PASSWORD` · `DB_NAME` · `DB_POOL_LIMIT` · `DB_ACQUIRE_TIMEOUT_MS` 와
 * `DB_SOCKET_PATH` · `DB_SSL` · `DB_SSL_CA` 를 읽는다(2f-2b 스펙 §5-2).
 */
export function adminDbConnectionFromEnv(env: Env = process.env): AdminDbConnection {
  const socketPath = envText(env, 'DB_SOCKET_PATH')
  if (socketPath !== undefined) {
    // 🔴 접속 대상이 모호하면 기동하지 않는다 — 드라이버는 소켓이 있으면 host · port 를 조용히 무시한다
    if (envText(env, 'DB_HOST') !== undefined || envText(env, 'DB_PORT') !== undefined)
      throw new Error('DB_SOCKET_PATH 는 DB_HOST · DB_PORT 와 함께 쓰지 않는다')
    const ssl = envText(env, 'DB_SSL')
    if ((ssl !== undefined && ssl !== 'false') || envText(env, 'DB_SSL_CA') !== undefined)
      throw new Error('DB_SOCKET_PATH 는 DB_SSL · DB_SSL_CA 와 함께 쓰지 않는다')
  }
  const missing = [
    ...(socketPath === undefined && !env.DB_HOST ? ['DB_HOST(또는 DB_SOCKET_PATH)'] : []),
    ...REQUIRED_KEYS.filter((key) => !env[key]),
  ]
  // 🔴 이름만 담는다. 값은 담지 않는다.
  if (missing.length > 0) throw new Error(`필수 환경변수가 없다: ${missing.join(', ')}`)
  const value = (key: string): string => env[key] ?? ''
  const common = {
    user: value('DB_USER'),
    password: value('DB_PASSWORD'),
    database: value('DB_NAME'),
    connectionLimit: poolEnvInt('DB_POOL_LIMIT', DEFAULT_CONNECTION_LIMIT, env),
    acquireTimeout: poolEnvInt('DB_ACQUIRE_TIMEOUT_MS', DEFAULT_ACQUIRE_TIMEOUT_MS, env),
  }
  if (socketPath !== undefined) return { socketPath, ...common }
  const ssl = tlsFromEnv(env)
  return {
    host: value('DB_HOST'),
    port: poolEnvInt('DB_PORT', DEFAULT_PORT, env),
    ...common,
    ...(ssl === undefined ? {} : { ssl }),
  }
}

/** 접속 대상 — TCP(host · port · ssl) 또는 소켓. 🔴 둘 중 하나만이다(2f-2b 스펙 §5-1). 빈 문자열은 없는 것이다 */
function adminDbTarget(
  connection: AdminDbConnection,
): Pick<PoolConfig, 'host' | 'port' | 'socketPath' | 'ssl'> {
  const hasHost = Boolean(connection.host)
  const hasSocket = Boolean(connection.socketPath)
  if (hasHost && hasSocket)
    throw new Error('AdminDbConnection 은 host 와 socketPath 중 하나만 둔다')
  if (!hasHost && !hasSocket) throw new Error('AdminDbConnection 에 host 나 socketPath 가 없다')
  if (hasSocket) {
    // 소켓은 로컬 연결이다 — 드라이버의 11.4 지문 검증도 소켓에서는 꺼져 TLS 를 얹으면 자체 서명에서 실패한다
    if (connection.port !== undefined || connection.ssl)
      throw new Error('socketPath 는 port · ssl 과 함께 쓰지 않는다')
    return { socketPath: connection.socketPath }
  }
  return {
    host: connection.host,
    port: connection.port ?? DEFAULT_PORT,
    // 🔴 객체는 얕은 복사 — 드라이버(connection-options.js)가 받은 객체의 rejectUnauthorized 를 다시 쓴다
    ...(connection.ssl ? { ssl: connection.ssl === true ? true : { ...connection.ssl } } : {}),
  }
}

/** 풀 옵션의 단일 출처 — 앱과 마이그레이션 러너가 같은 값을 쓴다. 접속 정보 밖의 키는 옮기지 않는다. */
export function adminPoolConfig(connection: AdminDbConnection): PoolConfig {
  return {
    ...adminDbTarget(connection),
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
