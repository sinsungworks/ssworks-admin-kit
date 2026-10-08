import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'admin-server',
    include: ['src/**/*.test.ts'],
    // 🔴 실 MariaDB 층(*.db.test.ts)은 `pnpm test:db` 가 따로 돈다(vitest.db.config.ts). `pnpm check` 는 DB 없이 초록이어야 한다.
    exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
    environment: 'node',
    env: { TZ: 'UTC' },
  },
})
