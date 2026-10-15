import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rootCertificates } from 'node:tls'
import { sql } from 'kysely'
import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { adminDbConnectionFromEnv, type AdminDbConnection } from './connection.js'
import { createAdminKysely } from './kysely.js'

// 실 MariaDB 의 TLS(2f-2b 스펙 §8-2). 🔴 전제: 서버가 MariaDB 11.4.1+ 이고 TLS 를 켰다 — 11.4 는 인증서 설정 없이도
//    자체 서명을 만들어 TLS 를 켠다(CI db 잡 · db:test:up 의 mariadb:11.4). `ssl: true` 는 드라이버가 비밀번호 지문으로
//    그 자체 서명을 검증해 성공한다. 다른 서버(ADMIN_TEST_DB_URL)가 이 전제를 못 맞추면 1 · 3 · 4 가 실패한다.
// 실패는 풀을 지나면 acquireTimeout 뒤 ER_GET_CONNECTION_TIMEOUT(45028)이고 원인은 cause 에 실린다 — 2초로 줄인다.
// 계정은 서버 전역이라 실행마다 이름을 바꾸고 afterAll 에서 지운다.

const FAIL_FAST = 2000
const server = testDbServer()
let t: TestDatabase
const tlsUser = `akt_tls_${randomBytes(4).toString('hex')}`
const tlsPassword = `tls-${randomBytes(8).toString('hex')}`
const tmp = mkdtempSync(join(tmpdir(), 'aktls-'))
const wrongCa = join(tmp, 'wrong-ca.pem')

async function admin<T>(
  run: (query: (text: string) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  const connection = await createConnection(server)
  try {
    return await run((text) => connection.query(text))
  } finally {
    await connection.end()
  }
}

/** 패키지 풀(createAdminKysely → adminPoolConfig)로 붙어 이 세션의 TLS 암호군을 읽는다 — 평문이면 '' */
async function cipherVia(connection: AdminDbConnection): Promise<string> {
  const db = createAdminKysely(connection)
  try {
    const { rows } = await sql<{ cipher: string }>`
      select variable_value as cipher from information_schema.session_status
      where variable_name = 'Ssl_cipher'`.execute(db)
    return rows[0]?.cipher ?? ''
  } finally {
    await db.destroy()
  }
}

beforeAll(async () => {
  t = await createTestDatabase({ migrate: false })
  writeFileSync(wrongCa, rootCertificates[0]!) // 공인 루트 — 서버 자체 서명을 서명하지 않았다
  await admin(async (query) => {
    await query(`create user '${tlsUser}'@'%' identified by '${tlsPassword}' require ssl`)
    // DB 이름은 akt_<hex> — 따옴표 없는 식별자로 된다(백틱을 쓰지 않는다)
    await query(`grant select on ${t.name}.* to '${tlsUser}'@'%'`)
  })
})

afterAll(async () => {
  rmSync(tmp, { recursive: true, force: true })
  await admin((query) => query(`drop user if exists '${tlsUser}'@'%'`))
  await t?.drop()
})

describe('DB TLS — 실 MariaDB 11.4(2f-2b)', () => {
  const root = (): AdminDbConnection => ({ ...server, database: t.name })

  it('ssl: true — 지문 검증으로 TLS 가 된다', async () => {
    expect(await cipherVia({ ...root(), ssl: true })).not.toBe('')
  })

  it('ssl 이 없으면 평문이다(기본 — 하위 호환)', async () => {
    expect(await cipherVia(root())).toBe('')
  })

  it('REQUIRE SSL 계정 — 평문은 거부(1045) · ssl: true 는 성공', async () => {
    const account = { ...root(), user: tlsUser, password: tlsPassword }
    await expect(cipherVia({ ...account, acquireTimeout: FAIL_FAST })).rejects.toMatchObject({
      errno: 45028,
      cause: { errno: 1045 },
    })
    expect(await cipherVia({ ...account, ssl: true })).not.toBe('')
  })

  it('env 경로 — DB_SSL=true 는 TLS, 엉뚱한 CA 의 DB_SSL_CA 는 거부된다', async () => {
    const env = {
      DB_HOST: server.host,
      DB_PORT: String(server.port),
      DB_USER: server.user,
      DB_PASSWORD: server.password,
      DB_NAME: t.name,
      DB_ACQUIRE_TIMEOUT_MS: String(FAIL_FAST),
    }
    expect(await cipherVia(adminDbConnectionFromEnv({ ...env, DB_SSL: 'true' }))).not.toBe('')
    await expect(
      cipherVia(adminDbConnectionFromEnv({ ...env, DB_SSL_CA: wrongCa })),
    ).rejects.toMatchObject({ errno: 45028, cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } })
  })
})
