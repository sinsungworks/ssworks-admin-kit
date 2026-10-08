// 테스트 DB 서버 주소. 🔴 비밀번호를 메시지 · 로그에 담지 않는다.
const DEFAULT_URL = 'mariadb://root:admin-kit-test@127.0.0.1:33306'

export interface TestDbServer {
  host: string
  port: number
  user: string
  password: string
}

export function testDbServer(): TestDbServer {
  const url = new URL(process.env.ADMIN_TEST_DB_URL ?? DEFAULT_URL)
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  }
}
