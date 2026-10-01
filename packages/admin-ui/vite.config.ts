import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// 라이브러리 빌드 — ESM 하나 + style.css 하나. vue · vuetify 는 소비 프로젝트 것을 쓴다(external).
export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: './tsconfig.build.json',
      processor: 'vue',
      copyDtsFiles: false,
      exclude: ['src/**/*.test.ts', 'src/test/**'],
    }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'style',
    },
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      external: ['vue', /^vuetify(\/.*)?$/, /^@ssworks\/admin-shared(\/.*)?$/, 'zod'],
      output: {
        // 소비 프로젝트의 tree-shaking 을 위해 모듈 구조를 유지하지 않고 한 파일로 — 이 패키지는
        // 작고 sideEffects 가 CSS 뿐이라 한 파일이 단순하다.
        exports: 'named',
      },
    },
  },
})
