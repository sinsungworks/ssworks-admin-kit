import { describe, expect, it } from 'vitest'
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
      '필수 환경변수가 없다: DB_HOST, DB_USER, DB_NAME',
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
