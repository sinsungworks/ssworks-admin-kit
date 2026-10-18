import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// 라이브러리 빌드 — ESM 엔트리 둘(index · vite) + style.css 하나. vue · vuetify 는 소비 프로젝트 것을 쓴다(external).
// 🔴 vite 엔트리(src/vite.ts)는 소비자의 vite.config 가 Node 에서 읽는다 — 아무것도 import 하지 않아 공유 청크가 없다.
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
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        vite: resolve(import.meta.dirname, 'src/vite.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: 'style',
    },
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        'vue',
        /^vuetify(\/.*)?$/,
        /^@ssworks\/admin-shared(\/.*)?$/,
        'zod',
        'axios',
        'pinia',
        /^vue-router(\/.*)?$/,
        /^@he-tree\/vue(\/.*)?$/,
        /^codemirror$/,
        /^@codemirror\//,
      ],
      output: {
        // 소비 프로젝트의 tree-shaking 을 위해 모듈 구조를 유지하지 않고 한 파일로 — 이 패키지는
        // 작고 sideEffects 가 CSS 뿐이라 한 파일이 단순하다.
        exports: 'named',
      },
    },
  },
})
