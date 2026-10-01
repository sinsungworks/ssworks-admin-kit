import { defineConfig } from 'vitest/config'

// 워크스페이스 전체를 러너 하나로 돈다. 패키지마다 `vitest.config.ts` 를 두고
// 자기 environment(node · happy-dom)를 스스로 정한다 — hangang-home 의 규약과 같다.
export default defineConfig({
  test: {
    // 테스트가 0개인데 초록으로 통과하는 상태를 막는다.
    passWithNoTests: false,
    projects: ['packages/*/vitest.config.*'],
  },
})
