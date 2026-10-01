import { describe, expect, it } from 'vitest'
import { defineAdminRoute } from './route-meta.js'

describe('defineAdminRoute', () => {
  it('런타임에는 항등이다 — 같은 객체를 돌려준다(타입만 좁힌다)', () => {
    const route = {
      path: '/posts',
      component: () => null,
      meta: { title: '게시글', permissions: ['board.posts:read'] },
    }
    expect(defineAdminRoute<string>(route)).toBe(route)
  })
})
