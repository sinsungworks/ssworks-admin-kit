// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'
import { createTitleGuard } from './title-guard.js'

// 형식 정본: gise-home `router/guards.ts` createTitleGuard. 동적 제목(함수)은 crm-v5 에서.
function to(title?: unknown) {
  return { meta: title === undefined ? {} : { title } } as unknown as RouteLocationNormalized
}
const from = {} as RouteLocationNormalized

describe('createTitleGuard', () => {
  it('"페이지 | 앱" 형식으로 세운다', () => {
    createTitleGuard('관리자')(to('사용자'), from)
    expect(document.title).toBe('사용자 | 관리자')
  })

  it('meta.title 이 없거나 공백이면 앱 제목만', () => {
    const guard = createTitleGuard('관리자')
    guard(to(), from)
    expect(document.title).toBe('관리자')
    guard(to('   '), from)
    expect(document.title).toBe('관리자')
  })

  it('문자열이 아닌 title 은 무시한다', () => {
    createTitleGuard('관리자')(to(123), from)
    expect(document.title).toBe('관리자')
  })

  it('앱 제목이 함수면 내비게이션마다 다시 평가한다', () => {
    let name = 'A'
    const guard = createTitleGuard(() => name)
    guard(to('x'), from)
    expect(document.title).toBe('x | A')
    name = 'B'
    guard(to('x'), from)
    expect(document.title).toBe('x | B')
  })
})
