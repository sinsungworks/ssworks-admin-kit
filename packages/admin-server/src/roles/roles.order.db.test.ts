import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { lockWaitsIn, settle, sleep, whileHeld } from '../test-support/concurrency.js'
import { testDbServer } from '../test-support/db-url.js'
import { accountsConfig, testPrincipal } from '../test-support/accounts.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminRolesService } from './roles.service.js'

// 이동은 순서를 재므로 새 데이터베이스에서 역할 셋(1 · 2 · 3)으로 시작한다. 🔴 seedRole 은 늘 permissions 를 명시한다.

let t: TestDatabase
let service: AdminRolesService
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.roles:read', 'org.roles:write'])
let a: bigint
let c: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminRolesService(t.db, accountsConfig(), undefined)
  a = (await service.create({ roleName: 'order-a', isDefault: false, permissions: [] }, root))
    .roleNo
  await service.create({ roleName: 'order-b', isDefault: false, permissions: [] }, root)
  c = (await service.create({ roleName: 'order-c', isDefault: false, permissions: [] }, root))
    .roleNo
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

async function orders(): Promise<[string, number, number][]> {
  const rows = await t.db
    .selectFrom('roles')
    .select(['roleName', 'displayOrder', 'revision'])
    .where('roleName', 'like', 'order-%')
    .orderBy('displayOrder')
    .execute()
  return rows.map((row) => [row.roleName, row.displayOrder, row.revision])
}

describe('move', () => {
  it('🔴 이웃 자리로 구간 재번호 — revision 은 그대로(3b D1)', async () => {
    expect(await service.move(c, 1)).toEqual({ from: 3, to: 1 })
    expect(await orders()).toEqual([
      ['order-c', 1, 0],
      ['order-a', 2, 0],
      ['order-b', 3, 0],
    ])
  })

  it('범위 밖 목표는 맨 끝으로 잘린다 · 같은 자리는 아무것도 바꾸지 않는다', async () => {
    expect(await service.move(a, 99)).toEqual({ from: 2, to: 3 })
    expect(await orders()).toEqual([
      ['order-c', 1, 0],
      ['order-b', 2, 0],
      ['order-a', 3, 0],
    ])
    expect(await service.move(a, 3)).toEqual({ from: 3, to: 3 })
  })

  it('없는 역할은 404', async () => {
    const error = await rejection(() => service.move(999_999n, 1))
    expect(error.code).toBe(CommonErrorCodes.ERR_NO_ROLE)
  })
})

describe('remove', () => {
  it('쓰는 중이면 409 ERR_COMMON_IN_USE · revision 이 다르면 409 REVISION_CONFLICT', async () => {
    const used = await seedRole(t.db, { roleName: 'remove-used', permissions: [] })
    await seedUser(t.db, { roleNo: used })
    const inUse = await rejection(() => service.remove(used, { revision: 0 }, root))
    expect(inUse.code).toBe(CommonErrorCodes.ERR_COMMON_IN_USE)
    expect(inUse.message).toBe(ACCOUNT_MESSAGES.roleInUse)

    const free = await seedRole(t.db, { roleName: 'remove-free', permissions: [] })
    const stale = await rejection(() => service.remove(free, { revision: 3 }, root))
    expect(stale.code).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
  })

  it('지우고 before 를 돌려준다', async () => {
    const roleNo = await seedRole(t.db, { roleName: 'remove-ok', permissions: ['org.users:read'] })
    expect(await service.remove(roleNo, { revision: 0 }, root)).toEqual({
      before: { roleName: 'remove-ok', isDefault: false, permissions: ['org.users:read'] },
    })
    expect(
      await t.db.selectFrom('roles').select('roleNo').where('roleNo', '=', roleNo).execute(),
    ).toEqual([])
  })

  it('넓은 역할은 403, 없는 역할은 404', async () => {
    const wide = await seedRole(t.db, { roleName: 'remove-wide', permissions: ['*'] })
    const forbidden = await rejection(() => service.remove(wide, { revision: 0 }, manager))
    expect(forbidden.message).toBe(ACCOUNT_MESSAGES.higherRoleToEdit)
    expect(forbidden.details).toEqual({ outside: ['*'] })
    const missing = await rejection(() => service.remove(999_999n, { revision: 0 }, root))
    expect(missing.code).toBe(CommonErrorCodes.ERR_NO_ROLE)
  })

  it("사용자 없는 '*' 역할은 지울 수 있다 — 잔존 셈이 바뀌지 않는다", async () => {
    const lonely = await seedRole(t.db, { roleName: 'remove-lonely-star', permissions: ['*'] })
    await expect(service.remove(lonely, { revision: 0 }, root)).resolves.toBeDefined()
  })
})

describe('create — 동시 만들기(§14 R5-5 · R7-4)', () => {
  it('🔴 커밋 전 다른 만들기가 있으면 그것을 기다렸다가 그 뒤 순서를 받는다 — 순서 값이 겹치지 않는다', async () => {
    const top = await t.db
      .selectFrom('roles')
      .select((eb) => eb.fn.max('displayOrder').as('maxOrder'))
      .executeTakeFirstOrThrow()
    const held = Number(top.maxOrder ?? 0) + 1
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query(
          `insert into roles (role_name, permissions, display_order) values ('concurrent-held', '[]', ?)`,
          [held],
        ),
      () =>
        service.create({ roleName: 'concurrent-mine', isDefault: false, permissions: [] }, root),
    )
    if (!result.ok) throw result.error
    const rows = await t.db
      .selectFrom('roles')
      .select(['roleName', 'displayOrder'])
      .where('roleName', 'in', ['concurrent-held', 'concurrent-mine'])
      .orderBy('displayOrder')
      .execute()
    expect(rows).toEqual([
      { roleName: 'concurrent-held', displayOrder: held },
      { roleName: 'concurrent-mine', displayOrder: held + 1 },
    ])
  })

  it('🔴 두 만들기의 순서 셈이 서로의 INSERT 앞에 겹쳐도 순서 값은 겹치지 않는다 — 진 쪽은 409 다시 시도(2d-3 스펙 §14 R3)', async () => {
    const open = () => createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
    const holder = await open()
    const observer = await open()
    try {
      await holder.beginTransaction()
      const rows = await holder.query(
        'select display_order from roles order by display_order desc limit 1 for update',
      )
      const held = Number(rows[0]?.display_order ?? 0) + 1
      const pending = settle(
        service.create({ roleName: 'overlap-mine', isDefault: false, permissions: [] }, root),
      )
      let waited = false
      for (let i = 0; i < 100 && !waited; i += 1) {
        waited = (await lockWaitsIn(observer, t.name)) > 0
        if (!waited) await sleep(25)
      }
      expect(waited).toBe(true)
      await holder
        .query(`insert into roles (role_name, permissions, display_order) values (?, ?, ?)`, [
          'overlap-held',
          '[]',
          held,
        ])
        .catch(() => undefined)
      await holder.commit().catch(() => undefined)
      const result = await pending
      const existing = await t.db
        .selectFrom('roles')
        .select(['roleName', 'displayOrder'])
        .where('roleName', 'in', ['overlap-held', 'overlap-mine'])
        .execute()
      const values = existing.map((row) => row.displayOrder)
      expect(new Set(values).size).toBe(values.length)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(BusinessError)
        expect((result.error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
        expect(existing.some((row) => row.roleName === 'overlap-mine')).toBe(false)
      } else {
        expect(existing.some((row) => row.roleName === 'overlap-mine')).toBe(true)
      }
    } finally {
      await holder.rollback().catch(() => undefined)
      await holder.end()
      await observer.end()
    }
  })
})
