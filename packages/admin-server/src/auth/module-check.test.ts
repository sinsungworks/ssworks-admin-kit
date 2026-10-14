import type { ModulesContainer } from '@nestjs/core'
import { describe, expect, it } from 'vitest'
import { AdminAuthModule } from './admin-auth.module.js'
import { assertAuthModuleRegistered } from './module-check.js'

function container(...metatypes: unknown[]): ModulesContainer {
  return new Map(
    metatypes.map((metatype, index) => [`m${index}`, { metatype }]),
  ) as unknown as ModulesContainer
}

describe('assertAuthModuleRegistered', () => {
  it('AdminAuthModule 이 있으면 통과', () => {
    expect(() =>
      assertAuthModuleRegistered(container(class Other {}, AdminAuthModule), 'AdminSessionsModule'),
    ).not.toThrow()
  })

  it('🔴 없으면 모듈 이름과 함께 멈춘다 — 가드 없이 라우트가 열린다', () => {
    expect(() =>
      assertAuthModuleRegistered(container(class Other {}), 'AdminSessionsModule'),
    ).toThrow('AdminSessionsModule 은 AdminAuthModule 이 있어야 한다')
  })
})
