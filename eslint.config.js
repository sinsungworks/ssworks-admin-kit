import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// ssworks-gise-home/eslint.config.js 를 바탕으로 모노레포 공통 규칙만 남겼다.
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'pnpm-lock.yaml',
      'docs/**',
      '.changeset/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    name: 'admin-kit/base',
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // 라이브러리 코드가 소비 프로젝트의 콘솔에 로그를 남기면 안 된다.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // `== null` / `!= null` 은 null·undefined 를 한 번에 잡는 관용구다.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  {
    name: 'admin-kit/server-decorator-metadata',
    // NestJS DI 는 `emitDecoratorMetadata` 가 내는 design:paramtypes 로 생성자 인자를
    // 해석한다. `import type` 으로 바꾸면 런타임 바인딩이 사라져 컴파일 오류 없이 DI 가
    // 깨진다 — 그래서 server 패키지 소스에서는 이 규칙을 끈다.
    files: ['packages/admin-server/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },

  {
    name: 'admin-kit/vue',
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // 컴포넌트 이름은 패키지 export 이름과 같다 (CardLayout 등). 한 단어 이름은 없다.
      // Vuetify 표의 셀 슬롯 이름이 점을 품는다(`#item.device`). 점 뒤를 수식어로 읽는 규칙을 푼다.
      'vue/valid-v-slot': ['error', { allowModifiers: true }],
    },
  },

  {
    name: 'admin-kit/ts-no-undef-off',
    files: ['**/*.{ts,mts,cts,vue}'],
    rules: {
      // TypeScript 가 이미 미선언 식별자를 잡는다. no-undef 는 오탐만 낸다.
      'no-undef': 'off',
    },
  },

  {
    name: 'admin-kit/shared-is-framework-free',
    files: ['packages/admin-shared/src/**/*.ts'],
    rules: {
      // 🔴 admin-shared 는 브라우저 번들과 NestJS 양쪽이 소비한다. 어느 쪽 런타임도
      //    끌어오면 안 된다.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'os', 'child_process'],
              message: '@ssworks/admin-shared 는 프레임워크·런타임 프리다.',
            },
            {
              group: ['@nestjs/*', 'vue', 'vuetify', 'pinia', 'vue-router', 'axios'],
              message: '@ssworks/admin-shared 는 프레임워크·런타임 프리다.',
            },
          ],
        },
      ],
    },
  },

  {
    name: 'admin-kit/tests',
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      // 테스트는 소비자 컴포넌트를 인라인으로 여럿 만든다.
      'vue/one-component-per-file': 'off',
    },
  },

  // 🔴 반드시 마지막. prettier 와 충돌하는 포맷 규칙을 전부 끈다.
  prettier,
)
