import { describe, expect, it } from 'vitest'
import { definePermissions } from './permissions.js'
import {
  adminRoleCreateSchema,
  adminRoleMoveSchema,
  adminRoleRemoveSchema,
  adminRoleSchema,
  adminRoleUpdateSchema,
} from './roles.js'

const WITHOUT_REVISION = {
  roleNo: 1n,
  roleName: '운영자',
  displayOrder: 0,
  isDefault: false,
  permissions: ['org.users:read'],
}
const ROLE = { ...WITHOUT_REVISION, revision: 3 }

describe('adminRoleSchema', () => {
  it('공통 필드와 revision 을 받는다', () => {
    expect(adminRoleSchema.parse(ROLE)).toEqual(ROLE)
  })

  it('🔴 revision 이 없으면 거부한다 — 쓰기 보호 기본(Phase 0 §4)', () => {
    expect(adminRoleSchema.safeParse(WITHOUT_REVISION).success).toBe(false)
  })

  it('roleName 은 1~64자다', () => {
    expect(adminRoleSchema.safeParse({ ...ROLE, roleName: '' }).success).toBe(false)
    expect(adminRoleSchema.safeParse({ ...ROLE, roleName: 'a'.repeat(64) }).success).toBe(true)
    expect(adminRoleSchema.safeParse({ ...ROLE, roleName: 'a'.repeat(65) }).success).toBe(false)
  })

  it('roleNo 는 bigint 다 — 와이어의 "BigInt(n)" 래퍼를 parseJSON 이 되살린 값', () => {
    expect(adminRoleSchema.safeParse({ ...ROLE, roleNo: 1 }).success).toBe(false)
  })

  it('🔴 프로젝트가 permissions 를 좁히고 필드를 덜어 낼 수 있다 — refine 이 없어야 한다', () => {
    const catalog = definePermissions({ USERS_READ: 'org.users:read' })
    const narrowed = adminRoleSchema.extend({ permissions: catalog.permissionListSchema })
    expect(narrowed.safeParse(ROLE).success).toBe(true)
    expect(narrowed.safeParse({ ...ROLE, permissions: ['nope:read'] }).success).toBe(false)
    expect(adminRoleSchema.omit({ revision: true }).parse(WITHOUT_REVISION)).toEqual(
      WITHOUT_REVISION,
    )
  })
})

describe('역할 본문 스키마', () => {
  it('만들기는 roleName · isDefault · permissions 다', () => {
    const body = { roleName: '감사', isDefault: false, permissions: [] }
    expect(adminRoleCreateSchema.parse(body)).toEqual(body)
    expect(adminRoleCreateSchema.safeParse({ roleName: '감사' }).success).toBe(false)
  })

  it('수정은 필드가 모두 선택이고 revision 만 필수다', () => {
    expect(adminRoleUpdateSchema.parse({ revision: 0 })).toEqual({ revision: 0 })
    expect(adminRoleUpdateSchema.parse({ roleName: '감사', revision: 2 })).toEqual({
      roleName: '감사',
      revision: 2,
    })
    expect(adminRoleUpdateSchema.safeParse({ roleName: '감사' }).success).toBe(false)
  })

  it('🔴 이동 본문에는 revision 이 없다 — 순서는 내용이 아니다(스펙 D1)', () => {
    expect(adminRoleMoveSchema.parse({ displayOrder: 2, revision: 1 })).toEqual({
      displayOrder: 2,
    })
    expect(adminRoleMoveSchema.safeParse({ displayOrder: -1 }).success).toBe(false)
  })

  it('삭제 본문은 revision 하나다', () => {
    expect(adminRoleRemoveSchema.parse({ revision: 5 })).toEqual({ revision: 5 })
    expect(adminRoleRemoveSchema.safeParse({}).success).toBe(false)
  })
})
