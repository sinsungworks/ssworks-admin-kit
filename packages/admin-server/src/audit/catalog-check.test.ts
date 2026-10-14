import { coreAuditCatalog, defineAuditCatalog } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { findAuditProblems, type CollectedAuditDeclaration } from './catalog-check.js'

const ok: CollectedAuditDeclaration = {
  controller: 'SessionsController',
  method: 'revoke',
  options: { action: 'session.revoke', targetType: 'session' },
  isPublic: false,
}

describe('findAuditProblems', () => {
  it('카탈로그에 있으면 문제 없음', () => {
    expect(findAuditProblems([ok], coreAuditCatalog)).toEqual([])
  })

  it('🔴 모르는 액션 · 대상 종류 · @Public 을 Controller.method 로 모은다', () => {
    expect(
      findAuditProblems(
        [
          { ...ok, method: 'a', options: { action: 'nope.action' } },
          { ...ok, method: 'b', options: { action: 'session.revoke', targetType: 'nope' } },
          { ...ok, method: 'c', isPublic: true },
        ],
        coreAuditCatalog,
      ),
    ).toEqual([
      "SessionsController.a: 카탈로그에 없는 액션 'nope.action'",
      "SessionsController.b: 카탈로그에 없는 대상 종류 'nope'",
      'SessionsController.c: @Public 라우트의 @Audit 은 기록되지 않는다(주체가 없다)',
    ])
  })

  it('프로젝트 카탈로그의 액션은 통과', () => {
    const catalog = defineAuditCatalog({ actions: { X: 'probe.x' }, labels: { 'probe.x': 'x' } })
    expect(findAuditProblems([{ ...ok, options: { action: 'probe.x' } }], catalog)).toEqual([])
  })
})
