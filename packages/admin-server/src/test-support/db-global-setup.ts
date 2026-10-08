import { createConnection } from 'mariadb'
import { testDbServer } from './db-url.js'

/** 서버가 받을 때까지 60초 기다린다(컨테이너 기동 직후). 못 붙으면 건너뛰지 않고 실패한다. */
export default async function setup(): Promise<void> {
  const server = testDbServer()
  const deadline = Date.now() + 60_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const connection = await createConnection({ ...server, connectTimeout: 2_000 })
      await connection.end()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }
  throw new Error(
    `MariaDB(${server.host}:${server.port})에 붙지 못했다 — 로컬이면 \`pnpm db:test:up\` 을 먼저 실행한다. ` +
      '다른 서버는 ADMIN_TEST_DB_URL 로 준다.',
    { cause: lastError },
  )
}
