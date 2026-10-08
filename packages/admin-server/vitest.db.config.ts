import { defineConfig } from 'vitest/config'

// 실 MariaDB 층 — `pnpm test:db`(패키지 폴더에서 돈다). 루트 projects 글롭(`vitest.config.*`)에 안 잡혀 `pnpm check` 에서
// 빠진다. 접속은 ADMIN_TEST_DB_URL, 없으면 `pnpm db:test:up` 컨테이너(스펙 R6).
export default defineConfig({
  test: {
    name: 'admin-server-db',
    include: ['src/**/*.db.test.ts'],
    environment: 'node',
    env: { TZ: 'UTC' },
    globalSetup: ['./src/test-support/db-global-setup.ts'],
    // 테스트 파일마다 데이터베이스를 따로 만들므로 병렬로 돌아도 된다.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
