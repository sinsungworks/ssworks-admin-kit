import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { accountsConfig, testPrincipal } from '../test-support/accounts.js'
import { seedRole } from '../test-support/auth.js'
import { lockWaitsIn, settle, sleep, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { AdminRolesService } from './roles.service.js'

// 🔴 역할 인덱스 둘(idx_roles_display_order · idx_roles_is_default — 장 0001, 2d-3 스펙 ③ I1)이 역할 쓰기의 잠금을 그
//    행으로 좁히는지 직접 잰다. 원시 연결이 상관없는 역할 행 하나(held)만 쥔 채 쓰기가 잠금 대기에 들어가면 전 행을 훑어
//    잠근 것이다(인덱스가 없을 때 — 2d-3 스펙 §14 R1-7). 2e-1 teams.guard.db.test.ts 의 "잠금 대기 관찰" 모양.
//    🔴 사용자는 만들지 않는다. held 는 순서 맨 앞 · 기본 아님 · **끝 아님**(뒤에 idx-tail 을 둔다 — held 가 끝 행이면 만들기의
//    끝 행 잠금이 정당하게 held 를 기다린다)이고 뒤 테스트들은 held 를 건드리지 않는다.

let t: TestDatabase
let service: AdminRolesService
let held: bigint
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminRolesService(t.db, accountsConfig(), undefined)
  held = (await service.create({ roleName: 'idx-held', isDefault: false, permissions: [] }, root))
    .roleNo
  await service.create({ roleName: 'idx-tail', isDefault: false, permissions: [] }, root)
})

afterAll(async () => {
  await t?.drop()
})

/** 원시 연결이 held 행만 쥔 채 write 를 시작한다 — write 가 잠금 대기에 들어갔는지(waited)와 풀린 뒤의 결과 */
async function underHeldRole(
  write: () => Promise<unknown>,
): Promise<{ waited: boolean; result: Settled<unknown> }> {
  const open = () => createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
  const holder = await open()
  const observer = await open()
  try {
    await holder.beginTransaction()
    await holder.query('select role_no from roles where role_no = ? for update', [held])
    let finished = false
    const pending = settle(write()).then((result) => {
      finished = true
      return result
    })
    let waited = false
    for (let i = 0; i < 100 && !finished && !waited; i += 1) {
      waited = (await lockWaitsIn(observer, t.name)) > 0
      if (!waited) await sleep(25)
    }
    await holder.commit()
    return { waited, result: await pending }
  } finally {
    await holder.rollback().catch(() => undefined)
    await holder.end()
    await observer.end()
  }
}

async function orderOf(roleNo: bigint): Promise<number> {
  const row = await t.db
    .selectFrom('roles')
    .select('displayOrder')
    .where('roleNo', '=', roleNo)
    .executeTakeFirstOrThrow()
  return row.displayOrder
}

describe('🔴 역할 쓰기는 상관없는 역할 행을 기다리지 않는다(③ I1)', () => {
  it('만들기 — 순서 셈이 상관없는 역할 행을 잠그지 않는다(인덱스 끝 행과 그 위 틈만)', async () => {
    const { waited, result } = await underHeldRole(() =>
      service.create({ roleName: 'idx-create', isDefault: false, permissions: [] }, root),
    )
    expect(waited).toBe(false)
    if (!result.ok) throw result.error
  })

  it('기본 켜기 수정 — 다른 기본 역할 찾기가 기본 표시 행만 잠근다', async () => {
    await service.create({ roleName: 'idx-default-old', isDefault: true, permissions: [] }, root)
    const next = await service.create(
      { roleName: 'idx-default-new', isDefault: false, permissions: [] },
      root,
    )
    const { waited, result } = await underHeldRole(() =>
      service.update(next.roleNo, { revision: 0, isDefault: true }, root),
    )
    expect(waited).toBe(false)
    if (!result.ok) throw result.error
    const defaults = await t.db
      .selectFrom('roles')
      .select('roleNo')
      .where('isDefault', '=', true)
      .execute()
    expect(defaults).toEqual([{ roleNo: next.roleNo }])
  })

  it('이동 — 구간 UPDATE 가 구간 행만 잠근다', async () => {
    const a = await service.create(
      { roleName: 'idx-move-a', isDefault: false, permissions: [] },
      root,
    )
    const b = await service.create(
      { roleName: 'idx-move-b', isDefault: false, permissions: [] },
      root,
    )
    const slot = await orderOf(a.roleNo)
    const { waited, result } = await underHeldRole(() => service.move(b.roleNo, slot))
    expect(waited).toBe(false)
    if (!result.ok) throw result.error
    expect(await orderOf(b.roleNo)).toBe(slot)
    expect(await orderOf(a.roleNo)).toBe(slot + 1)
    expect(await orderOf(held)).toBe(1)
  })
})

describe('순서 시드가 0 여럿일 때(Review Focus 4)', () => {
  // 데이터베이스 만들기는 느리다 — 테스트 본문(20초)이 아니라 훅(60초)에서 한다.
  let u: TestDatabase

  beforeAll(async () => {
    u = await createTestDatabase()
  })

  afterAll(async () => {
    await u?.drop()
  })

  it('만들기는 끝 행 + 1 = 1, 그다음은 2 — 시드의 0 은 그대로', async () => {
    await seedRole(u.db, { roleName: 'zero-a', permissions: [] })
    await seedRole(u.db, { roleName: 'zero-b', permissions: [] })
    const own = new AdminRolesService(u.db, accountsConfig(), undefined)
    await own.create({ roleName: 'zero-new-1', isDefault: false, permissions: [] }, root)
    await own.create({ roleName: 'zero-new-2', isDefault: false, permissions: [] }, root)
    const rows = await u.db
      .selectFrom('roles')
      .select(['roleName', 'displayOrder'])
      .orderBy('displayOrder')
      .orderBy('roleNo')
      .execute()
    expect(rows).toEqual([
      { roleName: 'zero-a', displayOrder: 0 },
      { roleName: 'zero-b', displayOrder: 0 },
      { roleName: 'zero-new-1', displayOrder: 1 },
      { roleName: 'zero-new-2', displayOrder: 2 },
    ])
  })
})
