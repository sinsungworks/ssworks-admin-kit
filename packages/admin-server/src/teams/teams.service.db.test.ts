import { Logger } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { settle, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { closure, closureOf, displayOrders, outline, seedTeamUnder } from '../test-support/teams.js'
import { TEAM_MESSAGES } from './errors.js'
import { AdminTeamsService } from './teams.service.js'

// 팀 서비스 — 트리 · 만들기 · 이름 바꾸기(2e 스펙 §5-2 ~ §5-4 · §9-3 [1]). 이름은 테스트마다 접두어로 가른다(🔴 대소문자만
// 다른 이름은 ci 콜레이션에서 같은 이름이다).

let t: TestDatabase
let service: AdminTeamsService

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminTeamsService(t.db)
})

afterAll(async () => {
  await t?.drop()
})

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

const pathsOf = async (prefix: string) =>
  outline((await service.tree()).items).filter((path) => path.startsWith(prefix))

describe('트리', () => {
  it('빈 저장소는 { items: [] } — 이 파일의 첫 테스트', async () => {
    expect(await service.tree()).toEqual({ items: [] })
  })

  it('루트 여럿 · 깊이 · 형제는 (displayOrder, teamNo) 순', async () => {
    const r1 = (await service.create({ teamName: 'tr-R1', parentTeamNo: null })).teamNo
    await service.create({ teamName: 'tr-R2', parentTeamNo: null })
    const a = (await service.create({ teamName: 'tr-A', parentTeamNo: r1 })).teamNo
    await service.create({ teamName: 'tr-B', parentTeamNo: r1 })
    await service.create({ teamName: 'tr-leaf', parentTeamNo: a })
    expect(await pathsOf('tr-')).toEqual([
      'tr-R1',
      'tr-R1/tr-A',
      'tr-R1/tr-A/tr-leaf',
      'tr-R1/tr-B',
      'tr-R2',
    ])
  })

  it('🔴 자기 행 없는 시드에서도 같은 트리(④ C1 · Review Focus 3)', async () => {
    const s1 = await seedTeamUnder(t.db, { teamName: 'sd-S1', parentTeamNo: null, selfRow: false })
    await seedTeamUnder(t.db, { teamName: 'sd-S2', parentTeamNo: s1, selfRow: false })
    expect(await pathsOf('sd-')).toEqual(['sd-S1', 'sd-S1/sd-S2'])
  })

  it('closure 가 손상되면(순환) 경고하고 닿는 팀만 낸다(B9)', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const p = await seedTeamUnder(t.db, { teamName: 'cy-p', parentTeamNo: null })
    const q = await seedTeamUnder(t.db, { teamName: 'cy-q', parentTeamNo: p })
    await t.db
      .insertInto('teamClosure')
      .values({ ancestorNo: q, descendantNo: p, depth: 1 })
      .execute()
    try {
      expect(await pathsOf('cy-')).toEqual([])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('closure 순환'))
    } finally {
      warn.mockRestore()
      await t.db.deleteFrom('teams').where('teamNo', 'in', [p, q]).execute()
    }
  })
})

describe('만들기', () => {
  it('최상위 · 하위 · 손자 — closure 에 자기 행과 조상 쌍, 순서는 형제 MAX + 1(없으면 0)', async () => {
    const root = (await service.create({ teamName: 'mk-root', parentTeamNo: null })).teamNo
    const first = (await service.create({ teamName: 'mk-first', parentTeamNo: root })).teamNo
    const second = (await service.create({ teamName: 'mk-second', parentTeamNo: root })).teamNo
    const grand = (await service.create({ teamName: 'mk-grand', parentTeamNo: first })).teamNo
    expect(await displayOrders(t.db, [first, second, grand])).toEqual([
      [first, 0],
      [second, 1],
      [grand, 0],
    ])
    expect(await closureOf(t.db, [root, first, grand])).toEqual(
      closure(
        [root, root, 0],
        [first, first, 0],
        [root, first, 1],
        [grand, grand, 0],
        [first, grand, 1],
        [root, grand, 2],
      ),
    )
  })

  it('최상위 형제도 MAX + 1 — 루트 둘의 순서가 이어진다', async () => {
    const a = (await service.create({ teamName: 'mk-rootA', parentTeamNo: null })).teamNo
    const b = (await service.create({ teamName: 'mk-rootB', parentTeamNo: null })).teamNo
    const orders = (await displayOrders(t.db, [a, b])).map(([, order]) => order)
    expect(orders[1]).toBe((orders[0] ?? 0) + 1)
  })

  it('🔴 자기 행 없는 상위 팀 아래에도 조상 쌍을 맞게 만든다(④ C1)', async () => {
    const p0 = await seedTeamUnder(t.db, { teamName: 'mk-p0', parentTeamNo: null, selfRow: false })
    const p1 = await seedTeamUnder(t.db, { teamName: 'mk-p1', parentTeamNo: p0, selfRow: false })
    const made = (await service.create({ teamName: 'mk-under', parentTeamNo: p1 })).teamNo
    expect(await closureOf(t.db, [made])).toEqual(
      closure([made, made, 0], [p1, made, 1], [p0, made, 2]),
    )
  })

  it('없는 상위 팀은 404 ERR_NO_TEAM 상위 팀 문구', async () => {
    const error = await failure(service.create({ teamName: 'mk-orphan', parentTeamNo: 999_999n }))
    expect(error.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(error.message).toBe(TEAM_MESSAGES.noParentTeam)
  })

  it('🔴 이름 중복은 409 ERR_DUPLICATE_TEAM_NAME — 대소문자 · 끝 공백만 달라도(Review Focus 2)', async () => {
    await service.create({ teamName: 'mk-Dup', parentTeamNo: null })
    for (const teamName of ['mk-dup', 'MK-DUP', 'mk-Dup ']) {
      const error = await failure(service.create({ teamName, parentTeamNo: null }))
      expect(error.code, teamName).toBe(CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME)
      expect(error.message).toBe(TEAM_MESSAGES.duplicateTeamName)
    }
  })

  it('🔴 동시 만들기 둘(같은 상위 팀)은 가드에서 줄을 서 순서 값이 겹치지 않는다(c2)', async () => {
    const parent = (await service.create({ teamName: 'mk-race', parentTeamNo: null })).teamNo
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query(
          "select lock_name from guard_locks where lock_name = 'teamTree' for update",
        ),
      () =>
        Promise.all([
          settle(service.create({ teamName: 'mk-race-1', parentTeamNo: parent })),
          settle(service.create({ teamName: 'mk-race-2', parentTeamNo: parent })),
        ]),
      { waiters: 2 },
    )
    if (!result.ok) throw result.error
    const made = result.value.map((outcome) => {
      if (!outcome.ok) throw outcome.error
      return outcome.value.teamNo
    })
    const orders = (await displayOrders(t.db, made)).map(([, order]) => order).sort((x, y) => x - y)
    expect(orders).toEqual([0, 1])
  })

  it('🔴 동시 만들기 둘(최상위)은 가드에서 줄을 서 순서 값이 겹치지 않는다(c2)', async () => {
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query(
          "select lock_name from guard_locks where lock_name = 'teamTree' for update",
        ),
      () =>
        Promise.all([
          settle(service.create({ teamName: 'mk-rroot-1', parentTeamNo: null })),
          settle(service.create({ teamName: 'mk-rroot-2', parentTeamNo: null })),
        ]),
      { waiters: 2 },
    )
    if (!result.ok) throw result.error
    const made = result.value.map((outcome) => {
      if (!outcome.ok) throw outcome.error
      return outcome.value.teamNo
    })
    const orders = (await displayOrders(t.db, made)).map(([, order]) => order).sort((x, y) => x - y)
    // 최상위에는 앞 테스트의 루트가 있다 — 값은 모르고, 겹치지 않고 이어지는지만 잰다
    expect(orders[1]).toBe((orders[0] ?? 0) + 1)
  })
})

describe('이름 바꾸기', () => {
  it('바꾸고 before 를 돌려준다 — 자기 이름을 대소문자만 바꿔 다시 저장해도 통과', async () => {
    const teamNo = (await service.create({ teamName: 'rn-Name', parentTeamNo: null })).teamNo
    expect(await service.rename(teamNo, { teamName: 'rn-name' })).toEqual({
      before: { teamName: 'rn-Name' },
    })
    const row = await t.db
      .selectFrom('teams')
      .select('teamName')
      .where('teamNo', '=', teamNo)
      .executeTakeFirstOrThrow()
    expect(row.teamName).toBe('rn-name')
  })

  it('없는 팀 404 · 남의 이름 409', async () => {
    const missing = await failure(service.rename(999_998n, { teamName: 'rn-x' }))
    expect(missing.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(missing.message).toBe(TEAM_MESSAGES.noTeam)
    await service.create({ teamName: 'rn-taken', parentTeamNo: null })
    const mine = (await service.create({ teamName: 'rn-mine', parentTeamNo: null })).teamNo
    const taken = await failure(service.rename(mine, { teamName: 'RN-TAKEN' }))
    expect(taken.code).toBe(CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME)
  })
})
