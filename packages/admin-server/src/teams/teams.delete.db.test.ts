import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedUser } from '../test-support/auth.js'
import { whileHeld, type Settled } from '../test-support/concurrency.js'
import { seedIpRule } from '../test-support/ip-access.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { closureOf, seedTeamUnder } from '../test-support/teams.js'
import { AdminUsersService } from '../users/users.service.js'
import { TEAM_MESSAGES } from './errors.js'
import { AdminTeamsService } from './teams.service.js'

// 팀 삭제(2e 스펙 §5-6 · ② D1 · ③ M1 · B4 · B7 · §9-3 [1]).

let t: TestDatabase
let service: AdminTeamsService
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminTeamsService(t.db)
  roleNo = await seedRole(t.db, { roleName: 'dl-role', permissions: [] })
})

afterAll(async () => {
  await t?.drop()
})

async function create(teamName: string, parentTeamNo: bigint | null): Promise<bigint> {
  return (await service.create({ teamName, parentTeamNo })).teamNo
}

const existing = async (teamNos: bigint[]) =>
  (
    await t.db
      .selectFrom('teams')
      .select('teamNo')
      .where('teamNo', 'in', teamNos)
      .orderBy('teamNo')
      .execute()
  ).map((row) => row.teamNo)

async function failure(promise: Promise<unknown>): Promise<BusinessError> {
  const error = await promise.then(
    () => {
      throw new Error('실패를 기대했다')
    },
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BusinessError)
  return error as BusinessError
}

describe('삭제', () => {
  it('하위 팀째 지우고 closure 를 정리한다 — before · 하위 팀 목록(깊이 · 순서 순)', async () => {
    const root = await create('dl-root', null)
    const target = await create('dl-target', root)
    const c1 = await create('dl-c1', target)
    const c2 = await create('dl-c2', target)
    const grand = await create('dl-grand', c1)
    const keep = await create('dl-keep', root)
    expect(await service.remove(target)).toEqual({
      before: { teamName: 'dl-target', parentTeamNo: root },
      descendants: [
        { teamNo: c1, teamName: 'dl-c1' },
        { teamNo: c2, teamName: 'dl-c2' },
        { teamNo: grand, teamName: 'dl-grand' },
      ],
    })
    expect(await existing([target, c1, c2, grand])).toEqual([])
    expect(await closureOf(t.db, [target, c1, c2, grand])).toEqual([])
    expect(await existing([root, keep])).toEqual([root, keep])
  })

  it('하위 팀이 없으면 descendants 는 [] · 최상위 팀의 parentTeamNo 는 null', async () => {
    const lone = await create('dl-lone', null)
    expect(await service.remove(lone)).toEqual({
      before: { teamName: 'dl-lone', parentTeamNo: null },
      descendants: [],
    })
  })

  it('🔴 퇴사자만 소속된 하위 팀 · 두 팀에 걸친 한 계정 — 409 memberCount 1, 아무것도 지우지 않는다(③ M1 · Review Focus 4)', async () => {
    const top = await create('dl-top', null)
    const sub1 = await create('dl-sub1', top)
    const sub2 = await create('dl-sub2', top)
    const resigned = await seedUser(t.db, {
      roleNo,
      userId: 'dl-resigned',
      resignAt: new Date(Date.now() - 86_400_000),
    })
    await addToTeam(t.db, sub1, resigned.userNo)
    await addToTeam(t.db, sub2, resigned.userNo)
    const error = await failure(service.remove(top))
    expect(error.code).toBe(CommonErrorCodes.ERR_TEAM_HAS_MEMBERS)
    expect(error.message).toBe(TEAM_MESSAGES.teamHasMembers)
    expect(error.details).toEqual({ memberCount: 1 })
    expect(await existing([top, sub1, sub2])).toEqual([top, sub1, sub2])
  })

  it('없는 팀 404', async () => {
    const error = await failure(service.remove(999_995n))
    expect(error.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(error.message).toBe(TEAM_MESSAGES.noTeam)
  })

  it('🔴 자기 행 없는 시드도 대상까지 지운다(④ C1 · B7 — hangang 은 자기 행이 없으면 대상이 남았다)', async () => {
    const parent = await seedTeamUnder(t.db, {
      teamName: 'dn-parent',
      parentTeamNo: null,
      selfRow: false,
    })
    const child = await seedTeamUnder(t.db, {
      teamName: 'dn-child',
      parentTeamNo: parent,
      selfRow: false,
    })
    await service.remove(parent)
    expect(await existing([parent, child])).toEqual([])
  })

  it('🔴 서브트리 팀을 가리키는 IP 규칙이 있으면 409 ERR_TEAM_HAS_IP_RULES + ruleCount, 아무것도 지우지 않는다(2f-1 ⑤ T1)', async () => {
    const top = await create('dl-ip-top', null)
    const sub = await create('dl-ip-sub', top)
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: sub, cidr: '10.0.0.0/8' })
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: top, cidr: '192.168.0.0/16' })
    const error = await failure(service.remove(top))
    expect(error.code).toBe(CommonErrorCodes.ERR_TEAM_HAS_IP_RULES)
    expect(error.message).toBe(TEAM_MESSAGES.teamHasIpRules)
    expect(error.details).toEqual({ ruleCount: 2 })
    expect(await existing([top, sub])).toEqual([top, sub])
  })

  it('소속 409 가 먼저다 — 소속과 규칙이 둘 다 있으면 ERR_TEAM_HAS_MEMBERS', async () => {
    const both = await create('dl-ip-both', null)
    const member = await seedUser(t.db, { roleNo, userId: 'dl-ip-member' })
    await addToTeam(t.db, both, member.userNo)
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: both, cidr: '10.0.0.0/8' })
    const error = await failure(service.remove(both))
    expect(error.code).toBe(CommonErrorCodes.ERR_TEAM_HAS_MEMBERS)
  })

  it('다른 팀 · global · user 규칙은 막지 않는다', async () => {
    const free = await create('dl-ip-free', null)
    const other = await create('dl-ip-other', null)
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: other, cidr: '10.0.0.0/8' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: free, cidr: '10.0.0.0/8' })
    expect((await service.remove(free)).before.teamName).toBe('dl-ip-free')
  })
})

describe('경합', () => {
  it('🔴 (a1) 소속을 넣는 중인 팀의 조상을 지우면 기다렸다가 그 소속을 보고 409 — 소속이 남는다(② D1)', async () => {
    const parent = await create('a1-parent', null)
    const child = await create('a1-child', parent)
    const user = await seedUser(t.db, { roleNo, userId: 'a1-joining' })
    const result = await whileHeld(
      t,
      async (connection) => {
        await connection.query('select team_no from teams where team_no = ? for update', [child])
        await connection.query('insert into team_user_map (team_no, user_no) values (?, ?)', [
          child,
          user.userNo,
        ])
      },
      () => service.remove(parent),
    )
    if (result.ok) throw new Error('409 를 기대했다')
    expect((result.error as BusinessError).code).toBe(CommonErrorCodes.ERR_TEAM_HAS_MEMBERS)
    expect((result.error as BusinessError).details).toEqual({ memberCount: 1 })
    expect(
      await t.db
        .selectFrom('teamUserMap')
        .select('teamNo')
        .where('userNo', '=', user.userNo)
        .execute(),
    ).toEqual([{ teamNo: child }])
  })

  it('🔴 (a2) 지우는 중인 팀으로의 사용자 만들기 · 수정은 기다렸다가 400 issues teamNo(이월 8 — lockTeam 의 forUpdate)', async () => {
    const goneForCreate = await create('a2-gone-create', null)
    const goneForUpdate = await create('a2-gone-update', null)
    const member = await seedUser(t.db, { roleNo, userId: 'a2-member' })
    const users = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db))
    const root = testPrincipal(900n, ['*'])
    const deleting = (teamNo: bigint) => async (connection: Connection) => {
      await connection.query(
        "select lock_name from guard_locks where lock_name = 'teamTree' for update",
      )
      await connection.query('select team_no from teams where team_no = ? for update', [teamNo])
      await connection.query('delete from teams where team_no in (?)', [teamNo])
    }
    const expectTeamField = (result: Settled<unknown>) => {
      if (result.ok) throw new Error('400 을 기대했다')
      const error = result.error as BusinessError
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect((error.details as { issues: { path: unknown[] }[] }).issues[0]?.path).toEqual([
        'teamNo',
      ])
    }
    expectTeamField(
      await whileHeld(t, deleting(goneForCreate), () =>
        users.create(
          { userId: 'a2-new', userName: '새 계정', roleNo, teamNo: goneForCreate },
          root,
        ),
      ),
    )
    expectTeamField(
      await whileHeld(t, deleting(goneForUpdate), () =>
        users.update(member.userNo, { revision: 0, teamNo: goneForUpdate }, root),
      ),
    )
  })
})
