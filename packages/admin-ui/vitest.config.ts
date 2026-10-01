import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// hangang-home apps/admin/vitest.config.ts 의 규약:
//  · DOM 은 파일 머리의 `// @vitest-environment happy-dom` 으로만 켠다.
//  · vuetify 를 inline 으로 돌린다 — `vuetify/components` 가 컴포넌트마다 .css 를 import 하는데
//    Node ESM 로더가 그 확장자를 모른다. inline 이면 Vite 가 받아 빈 모듈로 스텁한다.
export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'admin-ui',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
  },
})
