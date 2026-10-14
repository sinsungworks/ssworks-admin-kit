import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { snapshotKysely, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { periodsOf, seedPeriod, userRow } from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 🔴 MariaDB 11.6.2+ 는 innodb_snapshot_isolation=ON 이 기본이다(hangang 은 11.6.2, CI 는 11.4 — 풀 initSql 로 켠다,
//    §14 R7-8). 잔존으로 감싼 퇴사는 셈(비잠금)이 읽기 뷰를 먼저 연다. 그 뒤 · 대상 잠금 전에 대상의 로그인 실패(센티넬 없는
//    users UPDATE)가 커밋되면 ON 은 409 다시 시도(ER_CHECKREAD), OFF 는 기다렸다가 최신 행으로 진행한다(§14 R5-6 · R7-1).
//    공개 서비스 메서드(resign)를 거친다 — 부품을 따로 부르면 순서 회귀를 못 잡는다.

let t: TestDatabase
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

async function target(userId: string) {
  const roleNo = await seedRole(t.db, {
    roleName: `${userId}-role`,
    permissions: ['org.users:read'],
  })
  const user = await seedUser(t.db, { roleNo, userId })
  await seedPeriod(t.db, { userNo: user.userNo, joinDate: '2025-01-02' })
  return user
}

/** 로그인 실패 한 번(2b updateLoginState 와 같은 모양) — 센티넬을 잡지 않는다 */
function loginFailure(userNo: bigint) {
  return async (connection: Connection) => {
    await connection.query('select login_fail_count from users where user_no = ? for update', [
      userNo,
    ])
    await connection.query(
      'update users set login_fail_count = login_fail_count + 1 where user_no = ?',
      [userNo],
    )
  }
}

describe('퇴사 · 스냅샷 격리(§14 R5-6 · R7-1)', () => {
  it('🔴 ON — 셈 뒤 대상의 로그인 실패가 커밋되면 409 ERR_COMMON_CONFLICT(원인 ER_CHECKREAD) · 아무것도 바뀌지 않는다', async () => {
    const user = await target('snap-on')
    const db = await snapshotKysely(t, true)
    try {
      const service = new AdminUsersService(db, usersConfig(), new AdminSessionStore(db), undefined)
      const result = await whileHeld(t, loginFailure(user.userNo), () =>
        service.resign(user.userNo, { resignDate: '2030-01-31' }, root),
      )
      if (result.ok) throw new Error('409 를 기대했다')
      expect(result.error).toBeInstanceOf(BusinessError)
      const error = result.error as BusinessError
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
      expect((error.cause as { code?: string }).code).toBe('ER_CHECKREAD')
    } finally {
      await db.destroy()
    }
    expect(await userRow(t.db, user.userNo)).toMatchObject({
      resignAt: null,
      revision: 0,
      loginFailCount: 1,
    })
    expect((await periodsOf(t.db, user.userNo)).map((period) => period.resignDate)).toEqual([null])
  })

  it('OFF(11.4 기본) — 같은 순서에서 기다렸다가 최신 행으로 퇴사한다', async () => {
    const user = await target('snap-off')
    const db = await snapshotKysely(t, false)
    try {
      const service = new AdminUsersService(db, usersConfig(), new AdminSessionStore(db), undefined)
      const result = await whileHeld(t, loginFailure(user.userNo), () =>
        service.resign(user.userNo, { resignDate: '2030-01-31' }, root),
      )
      if (!result.ok) throw result.error
    } finally {
      await db.destroy()
    }
    expect(await userRow(t.db, user.userNo)).toMatchObject({ revision: 1, loginFailCount: 1 })
    expect((await periodsOf(t.db, user.userNo)).map((period) => period.resignDate)).toEqual([
      '2030-01-31',
    ])
  })
})
