import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { accountsConfig, testPrincipal } from '../test-support/accounts.js'
import { seedRole } from '../test-support/auth.js'
import { snapshotKysely, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminRolesService } from './roles.service.js'

// 🔴 잔존으로 감싼 역할 수정 · 삭제는 대상 역할을 잠근 뒤에 셈한다(2d-3 스펙 ① A · C3). 역할 이동은 센티넬 · revision 없이
//    역할 행을 바꾼다 — 옛 순서(센티넬 → 셈 → 역할 잠금)는 스냅샷 격리 ON 에서 1020 → 409 였다(2d-3 스펙 §14 R1-6).
//    공개 서비스 메서드를 거친다. 🔴 seedRole 은 늘 permissions 를 명시한다(기본 ['*']). 사용자는 만들지 않는다.

let t: TestDatabase
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

/** 이동 모양 — 역할 행을 잡고 displayOrder 만 바꾼다(revision 그대로) */
function moving(roleNo: bigint) {
  return async (connection: Connection) => {
    await connection.query('select role_no from roles where role_no = ? for update', [roleNo])
    await connection.query(
      'update roles set display_order = display_order + 100 where role_no = ?',
      [roleNo],
    )
  }
}

describe.each([
  ['ON', true],
  ['OFF', false],
] as const)('스냅샷 격리 %s', (label, snapshot) => {
  it('🔴 권한 수정 — 그 역할의 이동이 커밋되기를 기다렸다 성공하고 이동한 순서를 본다', async () => {
    const roleNo = await seedRole(t.db, {
      roleName: `snap-update-${label}`,
      permissions: ['org.users:read'],
    })
    const db = await snapshotKysely(t, snapshot)
    try {
      const service = new AdminRolesService(db, accountsConfig(), undefined)
      const result = await whileHeld(t, moving(roleNo), () =>
        service.update(
          roleNo,
          { revision: 0, permissions: ['org.users:read', 'org.roles:read'] },
          root,
        ),
      )
      if (!result.ok) throw result.error
      expect(result.value.item).toMatchObject({
        revision: 1,
        permissions: ['org.users:read', 'org.roles:read'],
      })
      expect(result.value.item.displayOrder).toBeGreaterThanOrEqual(100)
    } finally {
      await db.destroy()
    }
  })

  it('🔴 삭제 — 그 역할의 이동이 커밋되기를 기다렸다 지운다', async () => {
    const roleNo = await seedRole(t.db, {
      roleName: `snap-remove-${label}`,
      permissions: ['org.users:read'],
    })
    const db = await snapshotKysely(t, snapshot)
    try {
      const service = new AdminRolesService(db, accountsConfig(), undefined)
      const result = await whileHeld(t, moving(roleNo), () =>
        service.remove(roleNo, { revision: 0 }, root),
      )
      if (!result.ok) throw result.error
    } finally {
      await db.destroy()
    }
    expect(
      await t.db.selectFrom('roles').select('roleNo').where('roleNo', '=', roleNo).execute(),
    ).toEqual([])
  })
})

describe('스냅샷 격리 ON — 기본 켜기', () => {
  it('🔴 다른 기본 역할 잠금은 잠금 단계에 있다 — 그 역할의 이동이 커밋되기를 기다렸다 기본을 넘겨받는다', async () => {
    // 🔴 lockOtherDefaults 를 쓰기 단계(읽기 뷰가 열린 뒤)로 옮기면 ON 에서 1020 → 409 ERR_COMMON_CONFLICT 가 된다(§14 R4).
    const seeder = new AdminRolesService(t.db, accountsConfig(), undefined)
    const d = await seeder.create(
      { roleName: 'snap-default-d', isDefault: true, permissions: ['org.users:read'] },
      root,
    )
    const r = await seeder.create(
      { roleName: 'snap-default-r', isDefault: false, permissions: ['org.users:read'] },
      root,
    )
    const db = await snapshotKysely(t, true)
    try {
      const service = new AdminRolesService(db, accountsConfig(), undefined)
      const result = await whileHeld(t, moving(d.roleNo), () =>
        service.update(
          r.roleNo,
          { revision: 0, isDefault: true, permissions: ['org.users:read'] },
          root,
        ),
      )
      if (!result.ok) throw result.error
      expect(result.value.clearedDefaults).toEqual([d.roleNo])
      expect(result.value.item.isDefault).toBe(true)
    } finally {
      await db.destroy()
    }
    const rows = await t.db
      .selectFrom('roles')
      .select(['roleNo', 'isDefault'])
      .where('roleNo', 'in', [d.roleNo, r.roleNo])
      .execute()
    expect(rows.find((row) => row.roleNo === d.roleNo)?.isDefault).toBe(false)
    expect(rows.find((row) => row.roleNo === r.roleNo)?.isDefault).toBe(true)
  })
})
