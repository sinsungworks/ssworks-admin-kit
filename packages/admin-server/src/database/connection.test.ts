import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rootCertificates } from 'node:tls'
import { afterAll, describe, expect, it } from 'vitest'
import {
  adminDbConnectionFromEnv,
  adminPoolConfig,
  poolEnvInt,
  type AdminDbConnection,
} from './connection.js'

describe('poolEnvInt', () => {
  it('없거나 빈 값이면 기본값', () => {
    expect(poolEnvInt('X', 7, {})).toBe(7)
    expect(poolEnvInt('X', 7, { X: '  ' })).toBe(7)
  })

  it('양의 정수를 읽는다', () => {
    expect(poolEnvInt('X', 7, { X: '20' })).toBe(20)
  })

  it.each(['ten', '0', '-1', '1.5', 'NaN'])('🔴 %s 는 던지고 값을 메시지에 담지 않는다', (raw) => {
    expect(() => poolEnvInt('DB_PORT', 3306, { DB_PORT: raw })).toThrow(
      'DB_PORT 은 양의 정수여야 한다',
    )
    try {
      poolEnvInt('DB_PORT', 3306, { DB_PORT: raw })
    } catch (error) {
      expect((error as Error).message).not.toContain(raw)
    }
  })
})

describe('adminDbConnectionFromEnv', () => {
  const env = { DB_HOST: 'db', DB_USER: 'app', DB_PASSWORD: 's3cret', DB_NAME: 'admin' }

  it('기본값과 함께 읽는다', () => {
    expect(adminDbConnectionFromEnv(env)).toEqual({
      host: 'db',
      port: 3306,
      user: 'app',
      password: 's3cret',
      database: 'admin',
      connectionLimit: 10,
      acquireTimeout: 10_000,
    })
  })

  it('숫자 env 를 읽는다', () => {
    const connection = adminDbConnectionFromEnv({
      ...env,
      DB_PORT: '33306',
      DB_POOL_LIMIT: '4',
      DB_ACQUIRE_TIMEOUT_MS: '2000',
    })
    expect(connection).toMatchObject({ port: 33306, connectionLimit: 4, acquireTimeout: 2000 })
  })

  it('🔴 빠진 이름을 모아 던지고 값은 담지 않는다', () => {
    expect(() => adminDbConnectionFromEnv({ DB_PASSWORD: 's3cret' })).toThrow(
      '필수 환경변수가 없다: DB_HOST(또는 DB_SOCKET_PATH), DB_USER, DB_NAME',
    )
  })
})

describe('adminPoolConfig', () => {
  const connection: AdminDbConnection = { host: 'h', user: 'u', password: 'p', database: 'd' }

  it('🔴 안전 옵션을 고정한다 — timezone Z · 숫자 옵션 넷 · logParam false', () => {
    expect(adminPoolConfig(connection)).toEqual({
      host: 'h',
      port: 3306,
      user: 'u',
      password: 'p',
      database: 'd',
      timezone: 'Z',
      bigIntAsNumber: false,
      decimalAsNumber: false,
      insertIdAsNumber: false,
      checkNumberRange: true,
      logParam: false,
      connectionLimit: 10,
      acquireTimeout: 10_000,
    })
  })

  it('접속 정보에 끼워 넣은 다른 키는 옮기지 않는다', () => {
    const config = adminPoolConfig({ ...connection, logParam: true } as AdminDbConnection)
    expect(config.logParam).toBe(false)
  })
})

// 2f-2b — TLS · 소켓(스펙 §5-1 · §5-2). PEM 은 Node 내장 공인 루트 하나를 빌려 쓴다(내용은 상관없다 — 형식만 본다).
const PEM = rootCertificates[0]!
const tmp = mkdtempSync(join(tmpdir(), 'akdb-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))
const pemFile = join(tmp, 'ca.pem')
writeFileSync(pemFile, PEM)
const notPemFile = join(tmp, 'not-a-cert.txt')
writeFileSync(notPemFile, 'hello')
const aDirectory = join(tmp, 'a-directory')
mkdirSync(aDirectory)

/** 던진 메시지 — 값 · 경로가 새는지 보려고 문자열로 받는다 */
function thrown(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('던지지 않았다')
}

describe('adminPoolConfig — 접속 대상 · TLS(2f-2b)', () => {
  const base = { user: 'u', password: 'p', database: 'd' }

  it('소켓만 — socketPath 를 넘기고 host · port 는 없다', () => {
    const config = adminPoolConfig({ ...base, socketPath: '/run/mysqld/mysqld.sock' })
    expect(config.socketPath).toBe('/run/mysqld/mysqld.sock')
    expect(config).not.toHaveProperty('host')
    expect(config).not.toHaveProperty('port')
    expect(config).toMatchObject({ timezone: 'Z', logParam: false, bigIntAsNumber: false })
  })

  it('Review Focus 4 — 빈 host 는 없는 것이다(소켓 모드)', () => {
    const config = adminPoolConfig({ ...base, host: '', socketPath: '/run/mysqld/mysqld.sock' })
    expect(config.socketPath).toBe('/run/mysqld/mysqld.sock')
    expect(config).not.toHaveProperty('host')
  })

  it('🔴 host 와 socketPath 는 하나만 · 둘 다 없으면 던진다', () => {
    expect(() => adminPoolConfig({ ...base, host: 'h', socketPath: '/s' })).toThrow(
      'AdminDbConnection 은 host 와 socketPath 중 하나만 둔다',
    )
    expect(() => adminPoolConfig({ ...base })).toThrow(
      'AdminDbConnection 에 host 나 socketPath 가 없다',
    )
  })

  it('🔴 socketPath 는 port · ssl 과 함께 쓰지 않는다 — ssl: false 는 괜찮다', () => {
    expect(() => adminPoolConfig({ ...base, socketPath: '/s', port: 3306 })).toThrow(
      'socketPath 는 port · ssl 과 함께 쓰지 않는다',
    )
    expect(() => adminPoolConfig({ ...base, socketPath: '/s', ssl: true })).toThrow(
      'socketPath 는 port · ssl 과 함께 쓰지 않는다',
    )
    expect(adminPoolConfig({ ...base, socketPath: '/s', ssl: false })).not.toHaveProperty('ssl')
  })

  it('ssl: true 는 그대로 · 없거나 false 면 ssl 키가 없다(지금 모양)', () => {
    expect(adminPoolConfig({ ...base, host: 'h', ssl: true }).ssl).toBe(true)
    expect(adminPoolConfig({ ...base, host: 'h' })).not.toHaveProperty('ssl')
    expect(adminPoolConfig({ ...base, host: 'h', ssl: false })).not.toHaveProperty('ssl')
  })

  it('🔴 ssl 객체는 얕은 복사 — 드라이버가 rejectUnauthorized 를 다시 써도 넘긴 객체는 그대로다', () => {
    const ssl = { ca: PEM, rejectUnauthorized: true }
    const config = adminPoolConfig({ ...base, host: 'h', ssl })
    expect(config.ssl).toEqual(ssl)
    expect(config.ssl).not.toBe(ssl)
    ;(config.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized = false
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(adminPoolConfig({ ...base, host: 'h', ssl: {} }).ssl).toEqual({})
  })
})

describe('adminDbConnectionFromEnv — 소켓 · TLS(2f-2b)', () => {
  const creds = { DB_USER: 'app', DB_PASSWORD: 's3cret', DB_NAME: 'admin' }
  const tcp = { ...creds, DB_HOST: 'db' }

  it('소켓 — DB_HOST 없이 읽고 host · port 키가 없다', () => {
    expect(
      adminDbConnectionFromEnv({ ...creds, DB_SOCKET_PATH: '/run/mysqld/mysqld.sock' }),
    ).toEqual({
      socketPath: '/run/mysqld/mysqld.sock',
      user: 'app',
      password: 's3cret',
      database: 'admin',
      connectionLimit: 10,
      acquireTimeout: 10_000,
    })
  })

  it('🔴 소켓은 DB_HOST · DB_PORT · DB_SSL=true · DB_SSL_CA 와 함께 쓰지 않는다', () => {
    const socket = { ...creds, DB_SOCKET_PATH: '/s' }
    for (const extra of [{ DB_HOST: 'db' }, { DB_PORT: '3306' }]) {
      expect(() => adminDbConnectionFromEnv({ ...socket, ...extra })).toThrow(
        'DB_SOCKET_PATH 는 DB_HOST · DB_PORT 와 함께 쓰지 않는다',
      )
    }
    for (const extra of [{ DB_SSL: 'true' }, { DB_SSL: 'maybe' }, { DB_SSL_CA: pemFile }]) {
      expect(() => adminDbConnectionFromEnv({ ...socket, ...extra })).toThrow(
        'DB_SOCKET_PATH 는 DB_SSL · DB_SSL_CA 와 함께 쓰지 않는다',
      )
    }
  })

  it('Review Focus 3 — 소켓 + DB_SSL=false 는 기동한다', () => {
    expect(
      adminDbConnectionFromEnv({ ...creds, DB_SOCKET_PATH: '/s', DB_SSL: 'false' }),
    ).not.toHaveProperty('ssl')
  })

  it('Review Focus 1 — 공백만 든 DB_SOCKET_PATH · DB_SSL_CA 는 없는 것이다', () => {
    const connection = adminDbConnectionFromEnv({ ...tcp, DB_SOCKET_PATH: '  ', DB_SSL_CA: '  ' })
    expect(connection.host).toBe('db')
    expect(connection).not.toHaveProperty('socketPath')
    expect(connection).not.toHaveProperty('ssl')
    expect(() => adminDbConnectionFromEnv({ ...creds, DB_SOCKET_PATH: '  ' })).toThrow(
      '필수 환경변수가 없다: DB_HOST(또는 DB_SOCKET_PATH)',
    )
  })

  it('DB_SSL — true(앞뒤 공백 무시)는 켬, false · 빈 값 · 없음은 끔', () => {
    expect(adminDbConnectionFromEnv({ ...tcp, DB_SSL: 'true' }).ssl).toBe(true)
    expect(adminDbConnectionFromEnv({ ...tcp, DB_SSL: ' true ' }).ssl).toBe(true)
    for (const off of [{ DB_SSL: 'false' }, { DB_SSL: '' }, {}]) {
      expect(adminDbConnectionFromEnv({ ...tcp, ...off })).not.toHaveProperty('ssl')
    }
  })

  it.each(['TRUE', '1', 'yes', 'on'])('🔴 DB_SSL=%s 는 던지고 값을 담지 않는다', (raw) => {
    const message = thrown(() => adminDbConnectionFromEnv({ ...tcp, DB_SSL: raw }))
    expect(message).toBe('DB_SSL 은 true 나 false 여야 한다')
  })

  it('DB_SSL_CA — PEM 을 읽어 ssl: { ca } 로 켠다(DB_SSL 이 비었어도 · true 여도)', () => {
    expect(adminDbConnectionFromEnv({ ...tcp, DB_SSL_CA: pemFile }).ssl).toEqual({ ca: PEM })
    expect(adminDbConnectionFromEnv({ ...tcp, DB_SSL: 'true', DB_SSL_CA: pemFile }).ssl).toEqual({
      ca: PEM,
    })
  })

  it('🔴 DB_SSL=false 와 DB_SSL_CA 는 함께 쓰지 않는다', () => {
    expect(() => adminDbConnectionFromEnv({ ...tcp, DB_SSL: 'false', DB_SSL_CA: pemFile })).toThrow(
      'DB_SSL=false 와 DB_SSL_CA 는 함께 쓰지 않는다',
    )
  })

  it('🔴 Review Focus 2 — 못 읽는 CA 는 errno 코드만, 경로는 담지 않는다', () => {
    const missing = thrown(() =>
      adminDbConnectionFromEnv({ ...tcp, DB_SSL_CA: join(tmp, 'nope.pem') }),
    )
    expect(missing).toBe('DB_SSL_CA 파일을 읽지 못했다(ENOENT)')
    const directory = thrown(() => adminDbConnectionFromEnv({ ...tcp, DB_SSL_CA: aDirectory }))
    expect(directory).toMatch(/^DB_SSL_CA 파일을 읽지 못했다[(][A-Z]+[)]$/)
    for (const message of [missing, directory]) {
      expect(message).not.toContain(tmp)
      expect(message).not.toContain('akdb-')
    }
  })

  it('PEM 인증서가 아닌 파일은 던진다', () => {
    expect(() => adminDbConnectionFromEnv({ ...tcp, DB_SSL_CA: notPemFile })).toThrow(
      'DB_SSL_CA 가 PEM 인증서가 아니다',
    )
  })

  it('객체에서 adminPoolConfig 까지 — env 의 TLS 가 풀 옵션에 실린다(앱 · 러너 공용)', () => {
    expect(adminPoolConfig(adminDbConnectionFromEnv({ ...tcp, DB_SSL: 'true' })).ssl).toBe(true)
    expect(
      adminPoolConfig(adminDbConnectionFromEnv({ ...creds, DB_SOCKET_PATH: '/s' })).socketPath,
    ).toBe('/s')
  })
})
