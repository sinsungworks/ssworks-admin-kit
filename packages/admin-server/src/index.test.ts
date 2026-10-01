import { expect, it } from 'vitest'
import { ADMIN_SERVER_PHASE } from './index.js'

it('골격 패키지다 — Phase 2 에서 실제 모듈로 바뀐다', () => {
  expect(ADMIN_SERVER_PHASE).toBe('scaffold')
})
