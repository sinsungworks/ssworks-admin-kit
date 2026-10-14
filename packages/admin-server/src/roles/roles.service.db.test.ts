import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { AdminReauthService } from '../auth/reauth.service.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { FakeReauth, accountsConfig, testPrincipal } from '../test-support/accounts.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminRolesService } from './roles.service.js'

// 🔴 이 파일은 잔존 셈을 잰다 — 사용자는 "마지막 관리자" 테스트에서만 만든다. seedRole 은 늘 permissions 를 명시한다.

let t: TestDatabase
let service: AdminRolesService
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.roles:read', 'org.roles:write', 'org.users:read'])

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminRolesService(t.db, accountsConfig(), undefined)
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

async function stored(roleNo: bigint) {
  return t.db
    .selectFrom('roles')
    .select(['roleName', 'permissions', 'displayOrder', 'isDefault', 'revision'])
    .where('roleNo', '=', roleNo)
    .executeTakeFirstOrThrow()
}

describe('list', () => {
  it('displayOrder, roleNo 오름차순 전량 — 권한은 저장된 그대로(옛 키 포함, B6)', async () => {
    const late = await seedRole(t.db, { roleName: 'list-late', permissions: ['org.users:read'] })
    const early = await seedRole(t.db, {
      roleName: 'list-early',
      permissions: ['old.key:read', 'org.users:read'],
    })
    await t.db.updateTable('roles').set({ displayOrder: 90 }).where('roleNo', '=', late).execute()
    await t.db.updateTable('roles').set({ displayOrder: 80 }).where('roleNo', '=', early).execute()
    const { items } = await service.list()
    const mine = items.filter((item) => item.roleName.startsWith('list-'))
    expect(mine.map((item) => item.roleName)).toEqual(['list-early', 'list-late'])
    expect(mine[0]).toMatchObject({
      roleNo: early,
      displayOrder: 80,
      isDefault: false,
      permissions: ['old.key:read', 'org.users:read'],
      revision: 0,
    })
    const orders = items.map((item) => item.displayOrder)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })
})

describe('create', () => {
  it("정규화해 저장한다 — '*' 접기 · 함의 · 카탈로그 순서, 마지막 + 1 · revision 0", async () => {
    const top = await t.db
      .selectFrom('roles')
      .select((eb) => eb.fn.max('displayOrder').as('maxOrder'))
      .executeTakeFirstOrThrow()
    const posts = await service.create(
      {
        roleName: 'create-posts',
        isDefault: false,
        permissions: ['board.posts:delete', 'org.users:write'],
      },
      root,
    )
    expect(await stored(posts.roleNo)).toMatchObject({
      permissions: [
        'org.users:read',
        'org.users:write',
        'board.posts:read',
        'board.posts:write',
        'board.posts:delete',
      ],
      displayOrder: Number(top.maxOrder ?? 0) + 1,
      revision: 0,
      isDefault: false,
    })
    expect(posts.after).toEqual({
      roleName: 'create-posts',
      isDefault: false,
      permissions: [
        'org.users:read',
        'org.users:write',
        'board.posts:read',
        'board.posts:write',
        'board.posts:delete',
      ],
    })
    const all = await service.create(
      { roleName: 'create-all', isDefault: false, permissions: ['org.users:read', '*'] },
      root,
    )
    expect((await stored(all.roleNo)).permissions).toEqual(['*'])
  })

  it('넓은 권한을 만들면 403 + details.outside', async () => {
    const error = await rejection(() =>
      service.create(
        { roleName: 'create-wide', isDefault: false, permissions: ['setting.auditLog:read'] },
        manager,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherRoleToEdit)
    expect(error.details).toEqual({ outside: ['setting.auditLog:read'] })
  })

  it('🔴 이름 중복(대소문자 무시)은 400 issues roleName — 제약 이름으로 가른다(B1)', async () => {
    await service.create({ roleName: 'Dup-Name', isDefault: false, permissions: [] }, root)
    const error = await rejection(() =>
      service.create({ roleName: 'dup-name', isDefault: false, permissions: [] }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(error.details).toEqual({
      issues: [{ path: ['roleName'], code: 'custom', message: ACCOUNT_MESSAGES.duplicateRoleName }],
    })
  })

  it('기본 역할로 만들면 다른 기본 역할을 끄고 그 revision 을 올린다(⑫ D1)', async () => {
    const first = await service.create(
      { roleName: 'default-first', isDefault: true, permissions: [] },
      root,
    )
    const second = await service.create(
      { roleName: 'default-second', isDefault: true, permissions: [] },
      root,
    )
    expect(await stored(first.roleNo)).toMatchObject({ isDefault: false, revision: 1 })
    expect(await stored(second.roleNo)).toMatchObject({ isDefault: true, revision: 0 })
    const defaults = await t.db
      .selectFrom('roles')
      .select('roleNo')
      .where('isDefault', '=', true)
      .execute()
    expect(defaults).toEqual([{ roleNo: second.roleNo }])
  })
})

describe('update', () => {
  it('revision 이 다르면 409, 맞으면 +1 · { item } · before/after', async () => {
    const { roleNo } = await service.create(
      { roleName: 'update-rev', isDefault: false, permissions: ['org.users:read'] },
      root,
    )
    const conflict = await rejection(() =>
      service.update(roleNo, { revision: 5, roleName: 'update-rev2' }, root),
    )
    expect(conflict.code).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
    expect(conflict.message).toBe(ACCOUNT_MESSAGES.roleRevisionMismatch)

    const result = await service.update(
      roleNo,
      { revision: 0, roleName: 'update-rev2', permissions: ['org.users:write'] },
      root,
    )
    expect(result.item).toMatchObject({
      roleNo,
      roleName: 'update-rev2',
      permissions: ['org.users:read', 'org.users:write'],
      revision: 1,
    })
    expect(result.before).toEqual({
      roleName: 'update-rev',
      isDefault: false,
      permissions: ['org.users:read'],
    })
    expect(result.after).toEqual({
      roleName: 'update-rev2',
      isDefault: false,
      permissions: ['org.users:read', 'org.users:write'],
    })
  })

  it('🔴 permissions 없는 본문은 넓은 역할의 이름도 고친다(3b §9), 있으면 403', async () => {
    const { roleNo } = await service.create(
      { roleName: 'update-wide', isDefault: false, permissions: ['*'] },
      root,
    )
    await expect(
      service.update(roleNo, { revision: 0, roleName: 'update-wide2' }, manager),
    ).resolves.toMatchObject({ item: { roleName: 'update-wide2', revision: 1 } })
    const error = await rejection(() =>
      service.update(roleNo, { revision: 1, permissions: ['org.users:read'] }, manager),
    )
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherRoleToEdit)
    expect(error.details).toEqual({ outside: ['*'] })
  })

  it('🔴 권한 없는 사람에게는 revision 이 틀려도 409 가 아니라 403 이다 — 판정이 먼저(B7)', async () => {
    const { roleNo } = await service.create(
      { roleName: 'b7-wide', isDefault: false, permissions: ['*'] },
      root,
    )
    const error = await rejection(() =>
      service.update(roleNo, { revision: 7, permissions: ['org.users:read'] }, manager),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherRoleToEdit)
    expect(await stored(roleNo)).toMatchObject({ permissions: ['*'], revision: 0 })
  })

  it('이름 중복(대소문자 무시)으로 바꾸면 400 issues roleName · 그 역할은 그대로(B1)', async () => {
    await service.create({ roleName: 'Svc-Dup', isDefault: false, permissions: [] }, root)
    const second = await service.create(
      { roleName: 'svc-other', isDefault: false, permissions: [] },
      root,
    )
    const error = await rejection(() =>
      service.update(second.roleNo, { revision: 0, roleName: 'svc-dup' }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(error.details).toEqual({
      issues: [{ path: ['roleName'], code: 'custom', message: ACCOUNT_MESSAGES.duplicateRoleName }],
    })
    expect(await stored(second.roleNo)).toMatchObject({ roleName: 'svc-other', revision: 0 })
  })

  it('옛 키는 permissions 를 담은 저장에서 빠진다(Review Focus 2)', async () => {
    const roleNo = await seedRole(t.db, {
      roleName: 'update-stale',
      permissions: ['old.key:read', 'org.users:read'],
    })
    await service.update(roleNo, { revision: 0, permissions: ['org.users:read'] }, root)
    expect((await stored(roleNo)).permissions).toEqual(['org.users:read'])
  })

  it('기본 역할을 켜면 다른 기본 역할을 끄고, 끄면 0개도 허용한다', async () => {
    const a = await service.create({ roleName: 'flag-a', isDefault: true, permissions: [] }, root)
    const b = await service.create({ roleName: 'flag-b', isDefault: false, permissions: [] }, root)
    await service.update(b.roleNo, { revision: 0, isDefault: true }, root)
    expect(await stored(a.roleNo)).toMatchObject({ isDefault: false })
    await service.update(b.roleNo, { revision: 1, isDefault: false }, root)
    const defaults = await t.db
      .selectFrom('roles')
      .select('roleNo')
      .where('isDefault', '=', true)
      .execute()
    expect(defaults).toEqual([])
  })

  it('없는 역할은 404 ERR_NO_ROLE', async () => {
    const error = await rejection(() =>
      service.update(999_999n, { revision: 0, roleName: 'x' }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_NO_ROLE)
    expect(error.message).toBe(ACCOUNT_MESSAGES.noRole)
  })

  it('🔴 마지막 전체 권한 재직자의 역할에서 * 를 빼면 409 · 그대로 남는다', async () => {
    const { roleNo } = await service.create(
      { roleName: 'last-admin-role', isDefault: false, permissions: ['*'] },
      root,
    )
    await seedUser(t.db, { roleNo, userId: 'last-admin' })
    const error = await rejection(() =>
      service.update(roleNo, { revision: 0, permissions: ['org.users:read'] }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await stored(roleNo)).toMatchObject({ permissions: ['*'], revision: 0 })
  })
})

describe('재인증(reauth: true)', () => {
  it('틀리면 403 ERR_REAUTH_REQUIRED 이고 쓰지 않는다, 맞으면 쓴다 — 끄면 묻지 않는다', async () => {
    const reauth = new FakeReauth()
    const guarded = new AdminRolesService(
      t.db,
      accountsConfig(true),
      reauth as unknown as AdminReauthService,
    )
    const wrong = await rejection(() =>
      guarded.create(
        { roleName: 'reauth-role', isDefault: false, permissions: [], currentPassword: 'nope' },
        root,
      ),
    )
    expect(wrong.code).toBe(CommonErrorCodes.ERR_REAUTH_REQUIRED)
    expect(
      await t.db
        .selectFrom('roles')
        .select('roleNo')
        .where('roleName', '=', 'reauth-role')
        .execute(),
    ).toEqual([])
    await guarded.create(
      {
        roleName: 'reauth-role',
        isDefault: false,
        permissions: [],
        currentPassword: 'right-password',
      },
      root,
    )
    expect(reauth.calls).toEqual(['nope', 'right-password'])

    const silent = new FakeReauth()
    const open = new AdminRolesService(
      t.db,
      accountsConfig(false),
      silent as unknown as AdminReauthService,
    )
    await open.create(
      { roleName: 'reauth-off', isDefault: false, permissions: [], currentPassword: 'anything' },
      root,
    )
    expect(silent.calls).toEqual([])
  })
})
