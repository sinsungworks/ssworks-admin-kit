import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminUsersService } from './users.service.js'

// 사용자 팀 소속 쓰기(replaceTeam) — 같은 팀이면 건너뛴다(2e 스펙 B13 · 이월 6).

let t: TestDatabase
let service: AdminUsersService
let roleNo: bigint
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db))
  roleNo = await seedRole(t.db, { roleName: 'ut-role', permissions: [] })
})

afterAll(async () => {
  await t?.drop()
})

const membership = (userNo: bigint) =>
  t.db
    .selectFrom('teamUserMap')
    .select(['teamNo', 'joinAt'])
    .where('userNo', '=', userNo)
    .orderBy('teamNo')
    .execute()

describe('replaceTeam', () => {
  it('🔴 같은 팀으로 다시 저장해도 배정 시각(joinAt)이 그대로다(B13)', async () => {
    const team = await seedTeam(t.db, 'ut-same')
    const user = await seedUser(t.db, { roleNo, userId: 'ut-same-user' })
    const assigned = new Date('2026-01-02T03:04:05.000Z')
    await t.db
      .insertInto('teamUserMap')
      .values({ teamNo: team, userNo: user.userNo, joinAt: assigned })
      .execute()
    await service.update(user.userNo, { revision: 0, teamNo: team }, root)
    expect(await membership(user.userNo)).toEqual([{ teamNo: team, joinAt: assigned }])
  })

  it('두 팀 소속에 그중 한 팀을 주면 하나로 줄어든다', async () => {
    const a = await seedTeam(t.db, 'ut-two-a')
    const b = await seedTeam(t.db, 'ut-two-b')
    const user = await seedUser(t.db, { roleNo, userId: 'ut-two-user' })
    await t.db
      .insertInto('teamUserMap')
      .values([
        { teamNo: a, userNo: user.userNo },
        { teamNo: b, userNo: user.userNo },
      ])
      .execute()
    await service.update(user.userNo, { revision: 0, teamNo: a }, root)
    expect((await membership(user.userNo)).map((row) => row.teamNo)).toEqual([a])
  })

  it('빈 소속에 null 이면 아무것도 쓰지 않고 통과한다', async () => {
    const user = await seedUser(t.db, { roleNo, userId: 'ut-none-user' })
    await service.update(user.userNo, { revision: 0, teamNo: null }, root)
    expect(await membership(user.userNo)).toEqual([])
  })
})
