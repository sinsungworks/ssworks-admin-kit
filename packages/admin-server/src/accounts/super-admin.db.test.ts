import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GUARD_MESSAGES } from '../database/guard-locks.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { ACCOUNT_MESSAGES } from './errors.js'
import {
  GUARD_LOCK_SUPER_ADMIN,
  countSuperAdmins,
  lockSuperAdminGuard,
  withSuperAdminSurvival,
} from './super-admin.js'

// 🔴 이 파일은 셈을 잰다 — seedRole 의 기본 권한이 ['*'] 이므로 늘 permissions 를 명시한다.

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

const count = (db: TestDatabase['db']) => db.transaction().execute((trx) => countSuperAdmins(trx))

describe('센티넬 행', () => {
  it('장의 리터럴과 잠금 함수의 이름이 같다', async () => {
    expect(
      await t.db
        .selectFrom('guardLocks')
        .select('lockName')
        .where('lockName', '=', GUARD_LOCK_SUPER_ADMIN)
        .execute(),
    ).toEqual([{ lockName: GUARD_LOCK_SUPER_ADMIN }])
  })
})

describe('countSuperAdmins', () => {
  it("재직 · '*' 만 센다 — 퇴사 · 퇴사 예정 · '*' 없는 역할 · 'a*' 는 빼고, '*' 와 다른 키가 섞여도 센다(§14 R1-2)", async () => {
    const before = await count(t.db)
    const star = await seedRole(t.db, { roleName: 'cnt-star', permissions: ['*'] })
    const mixed = await seedRole(t.db, {
      roleName: 'cnt-mixed',
      permissions: ['org.users:read', '*'],
    })
    const plain = await seedRole(t.db, { roleName: 'cnt-plain', permissions: ['org.users:read'] })
    const sub = await seedRole(t.db, { roleName: 'cnt-sub', permissions: ['a*'] })
    const empty = await seedRole(t.db, { roleName: 'cnt-empty', permissions: [] })
    await seedUser(t.db, { roleNo: star })
    await seedUser(t.db, { roleNo: mixed })
    await seedUser(t.db, { roleNo: star, resignAt: new Date(Date.now() - 60_000) })
    await seedUser(t.db, { roleNo: star, resignAt: new Date(Date.now() + 86_400_000) })
    await seedUser(t.db, { roleNo: plain })
    await seedUser(t.db, { roleNo: sub })
    await seedUser(t.db, { roleNo: empty })
    expect(await count(t.db)).toBe(before + 2)
  })
})

describe('lockSuperAdminGuard', () => {
  it('🔴 센티넬을 기다린 셈은 앞 트랜잭션의 커밋을 본다(§14 R1-3a — 잠금이 첫 문장이어야 하는 이유)', async () => {
    const role = await seedRole(t.db, { roleName: 'race-star', permissions: ['*'] })
    await seedUser(t.db, { roleNo: role })
    const baseline = await count(t.db)

    const holder = await createConnection({ ...testDbServer(), database: t.name })
    let waiting: Promise<{ waited: number; count: number }>
    try {
      await holder.beginTransaction()
      await holder.query(
        `select lock_name from guard_locks where lock_name = 'superAdminSurvival' for update`,
      )
      await holder.query(`update roles set permissions = '["org.users:read"]' where role_no = ?`, [
        role,
      ])

      const started = Date.now()
      waiting = t.db.transaction().execute(async (trx) => {
        await lockSuperAdminGuard(trx)
        return { waited: Date.now() - started, count: await countSuperAdmins(trx) }
      })
      await new Promise((resolve) => setTimeout(resolve, 400))
      await holder.commit()
    } finally {
      // 커밋 못 한 채 끝나면 센티넬 잠금이 남아 afterAll 의 DROP DATABASE 가 막힌다
      await holder.rollback().catch(() => undefined)
      await holder.end()
    }

    const result = await waiting
    expect(result.waited).toBeGreaterThanOrEqual(350)
    expect(result.count).toBe(baseline - 1)
  })
})

describe('withSuperAdminSurvival', () => {
  // 셈이 0 과 1 사이를 오가야 하므로 데이터베이스를 따로 쓴다.
  let u: TestDatabase

  beforeAll(async () => {
    u = await createTestDatabase()
  })

  afterAll(async () => {
    await u?.drop()
  })

  it('🔴 마지막 전체 권한 재직자를 없애는 쓰기는 409 이고 롤백된다', async () => {
    const role = await seedRole(u.db, { roleName: 'last-star', permissions: ['*'] })
    await seedUser(u.db, { roleNo: role })
    const error = await u.db
      .transaction()
      .execute((trx) =>
        withSuperAdminSurvival(trx, async () => {
          await trx
            .updateTable('roles')
            .set({ permissions: JSON.stringify(['org.users:read']) })
            .where('roleNo', '=', role)
            .execute()
        }),
      )
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect((error as BusinessError).message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    const after = await u.db
      .selectFrom('roles')
      .select('permissions')
      .where('roleNo', '=', role)
      .executeTakeFirstOrThrow()
    expect(after.permissions).toEqual(['*'])
  })

  it('하나가 남으면 통과하고 결과를 돌려준다', async () => {
    const role = await seedRole(u.db, { roleName: 'second-star', permissions: ['*'] })
    const user = await seedUser(u.db, { roleNo: role })
    await seedUser(u.db, { roleNo: role }) // 남을 한 명 — 앞 테스트가 남긴 상태에 기대지 않는다
    const result = await u.db.transaction().execute((trx) =>
      withSuperAdminSurvival(trx, async () => {
        await trx
          .updateTable('users')
          .set({ resignAt: new Date() })
          .where('userNo', '=', user.userNo)
          .execute()
        return 'done'
      }),
    )
    expect(result).toBe('done')
  })

  it('센티넬 행이 없으면 500 ERR_COMMON_INTERNAL — 쓰기 전에 멈춘다', async () => {
    await u.db.deleteFrom('guardLocks').where('lockName', '=', GUARD_LOCK_SUPER_ADMIN).execute()
    let written = false
    try {
      const error = await u.db
        .transaction()
        .execute((trx) =>
          withSuperAdminSurvival(trx, async () => {
            written = true
          }),
        )
        .catch((caught: unknown) => caught)
      expect(written).toBe(false)
      expect(error).toBeInstanceOf(BusinessError)
      expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_INTERNAL)
      expect((error as BusinessError).message).toBe(GUARD_MESSAGES.missing)
    } finally {
      await u.db
        .insertInto('guardLocks')
        .values({ lockName: GUARD_LOCK_SUPER_ADMIN, description: '테스트가 되돌림' })
        .execute()
    }
  })
})

describe('withSuperAdminSurvival 경합', () => {
  // 기준선(전권자 둘)이 알려져 있어야 하므로 데이터베이스를 따로 쓴다.
  let v: TestDatabase

  beforeAll(async () => {
    v = await createTestDatabase()
  })

  afterAll(async () => {
    await v?.drop()
  })

  it('🔴 둘 중 하나를 앞 트랜잭션이 내리는 동안 다른 하나를 내리면 409 — 잠금이 전 셈보다 먼저여야 한다(write skew)', async () => {
    const roleA = await seedRole(v.db, { roleName: 'skew-a', permissions: ['*'] })
    const roleB = await seedRole(v.db, { roleName: 'skew-b', permissions: ['*'] })
    await seedUser(v.db, { roleNo: roleA })
    await seedUser(v.db, { roleNo: roleB })
    expect(await count(v.db)).toBe(2)

    const holder = await createConnection({ ...testDbServer(), database: v.name })
    let waiting: Promise<unknown>
    try {
      await holder.beginTransaction()
      await holder.query(
        `select lock_name from guard_locks where lock_name = 'superAdminSurvival' for update`,
      )
      await holder.query(`update roles set permissions = '[]' where role_no = ?`, [roleA])

      waiting = v.db
        .transaction()
        .execute((trx) =>
          withSuperAdminSurvival(trx, async () => {
            await trx
              .updateTable('roles')
              .set({ permissions: JSON.stringify([]) })
              .where('roleNo', '=', roleB)
              .execute()
          }),
        )
        .catch((caught: unknown) => caught)
      await new Promise((resolve) => setTimeout(resolve, 400))
      await holder.commit()
    } finally {
      // 커밋 못 한 채 끝나면 센티넬 잠금이 남아 afterAll 의 DROP DATABASE 가 막힌다
      await holder.rollback().catch(() => undefined)
      await holder.end()
    }

    const error = await waiting
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect((error as BusinessError).message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    const b = await v.db
      .selectFrom('roles')
      .select('permissions')
      .where('roleNo', '=', roleB)
      .executeTakeFirstOrThrow()
    expect(b.permissions).toEqual(['*'])
  })
})
