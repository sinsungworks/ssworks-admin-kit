import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { snapshotKysely, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { periodsOf, seedPeriod, userRow } from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 🔴 MariaDB 11.6.2+ 는 innodb_snapshot_isolation=ON 이 기본이다(hangang 은 11.6.2, CI 는 11.4 — 풀 initSql 로 켠다,
//    2d §14 R7-8). 잔존으로 감싼 쓰기는 대상 · 줄 역할 · 팀을 잠근 **뒤에** 셈(비잠금)으로 읽기 뷰를 연다(2d-3 스펙 ① A).
//    그래서 대상의 로그인 실패 · 같은 팀의 이름 바꾸기가 그 잠금 전에 커밋돼도 ON 은 1020 이 아니라 기다렸다 성공하고, OFF 는
//    보기 읽기(before · item)가 낡지 않는다(2d-3 스펙 §14 R1-1 · R1-5). 옛 순서(센티넬 → 셈 → 대상 잠금)는 ON 409 · OFF 낡은
//    item 이었다. 공개 서비스 메서드를 거친다 — 부품을 따로 부르면 순서 회귀를 못 잡는다.

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

/** 팀 이름 바꾸기(2e-1 팀 쓰기 모양) — teamTree 가드 · 팀 행을 잡고 이름을 바꾼다. 사용자 잠금 없이 팀 행을 바꾼다 */
function renameTeam(teamNo: bigint, teamName: string) {
  return async (connection: Connection) => {
    await connection.query(
      `select lock_name from guard_locks where lock_name = 'teamTree' for update`,
    )
    await connection.query('select team_no from teams where team_no = ? for update', [teamNo])
    await connection.query('update teams set team_name = ? where team_no = ?', [teamName, teamNo])
  }
}

describe.each([
  ['ON', true],
  ['OFF', false],
] as const)('스냅샷 격리 %s', (label, snapshot) => {
  it('🔴 퇴사 — 대상의 로그인 실패가 커밋되기를 기다렸다 그 위에서 퇴사한다(1020 없음 · 2d-3 스펙 §5-4)', async () => {
    const user = await target(`snap-resign-${label}`)
    const db = await snapshotKysely(t, snapshot)
    try {
      const service = new AdminUsersService(db, usersConfig(), new AdminSessionStore(db), undefined)
      const result = await whileHeld(t, loginFailure(user.userNo), () =>
        service.resign(user.userNo, { resignDate: '2030-01-31' }, root),
      )
      if (!result.ok) throw result.error
      expect(result.value.before).toMatchObject({ resignDate: null, revision: 0 })
    } finally {
      await db.destroy()
    }
    expect(await userRow(t.db, user.userNo)).toMatchObject({ revision: 1, loginFailCount: 1 })
    expect((await periodsOf(t.db, user.userNo)).map((period) => period.resignDate)).toEqual([
      '2030-01-31',
    ])
  })

  it('🔴 역할 변경 — 같은 팀의 이름 바꾸기가 커밋되기를 기다렸다 바뀐 이름으로 성공한다(2e-1 이월 · lockTeam 이 셈 앞)', async () => {
    const user = await target(`snap-team-${label}`)
    const grant = await seedRole(t.db, {
      roleName: `snap-grant-${label}`,
      permissions: ['org.users:read'],
    })
    const team = await seedTeam(t.db, `snap-old-${label}`)
    const db = await snapshotKysely(t, snapshot)
    try {
      const service = new AdminUsersService(db, usersConfig(), new AdminSessionStore(db), undefined)
      const result = await whileHeld(t, renameTeam(team, `snap-new-${label}`), () =>
        service.update(user.userNo, { revision: 0, roleNo: grant, teamNo: team }, root),
      )
      if (!result.ok) throw result.error
      // OFF 에서 셈이 lockTeam 앞이면 item 의 팀 이름이 바뀌기 전 값이다(R10-2) — ON 이면 409
      expect(result.value.item).toMatchObject({
        roleNo: grant,
        teamNo: team,
        teamName: `snap-new-${label}`,
        revision: 1,
      })
    } finally {
      await db.destroy()
    }
  })
})
