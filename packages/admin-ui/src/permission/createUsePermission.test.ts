import { describe, expect, it } from 'vitest'
import { definePermissions, type PermissionOf } from '@ssworks/admin-shared'
import { createUsePermission } from './createUsePermission.js'

// hangang-home usePermission.test.ts 의 케이스를 스토어 없이 게터 주입으로 옮겼다.

const catalog = definePermissions({
  BOARD_POSTS_READ: 'board.posts:read',
  BOARD_POSTS_WRITE: 'board.posts:write',
  ORG_USERS_READ: 'org.users:read',
})
type Permission = PermissionOf<typeof catalog>
const { PERMISSIONS } = catalog

describe('createUsePermission', () => {
  it('게터를 호출 시점마다 읽는다 — 로그인 전후가 같은 훅으로 갈린다', () => {
    let granted: string[] = []
    const usePermission = createUsePermission<Permission>(() => granted)
    const { hasPermission, hasAnyPermission } = usePermission()

    expect(hasPermission(PERMISSIONS.BOARD_POSTS_READ)).toBe(false)
    granted = [PERMISSIONS.BOARD_POSTS_READ]
    expect(hasPermission(PERMISSIONS.BOARD_POSTS_READ)).toBe(true)
    expect(hasPermission(PERMISSIONS.BOARD_POSTS_READ, PERMISSIONS.BOARD_POSTS_WRITE)).toBe(false)
    expect(hasAnyPermission(PERMISSIONS.BOARD_POSTS_WRITE, PERMISSIONS.BOARD_POSTS_READ)).toBe(true)
  })

  it("🔴 '*' 하나면 둘 다 단락한다", () => {
    const { hasPermission, hasAnyPermission } = createUsePermission<Permission>(() => ['*'])()
    expect(hasPermission(PERMISSIONS.ORG_USERS_READ, PERMISSIONS.BOARD_POSTS_WRITE)).toBe(true)
    expect(hasAnyPermission(PERMISSIONS.ORG_USERS_READ)).toBe(true)
  })

  it('🔴 인자가 없으면 거짓이다 (fail-closed) — 메뉴 필터는 길이를 먼저 본다', () => {
    const { hasPermission, hasAnyPermission } = createUsePermission<Permission>(() => [
      'board.posts:read',
    ])()
    expect(hasPermission()).toBe(false)
    expect(hasAnyPermission()).toBe(false)
  })

  it('같은 훅은 같은 판정기를 돌려준다 — 메뉴와 가드가 한 인스턴스를 공유한다', () => {
    const usePermission = createUsePermission(() => [])
    expect(usePermission()).toBe(usePermission())
  })
})
