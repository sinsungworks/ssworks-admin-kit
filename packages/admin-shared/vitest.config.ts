import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'admin-shared',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
