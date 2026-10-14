import {
  BusinessError,
  CommonErrorCodes,
  siblingMove,
  type AdminTeamNode,
} from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedUser } from '../test-support/auth.js'
import { settle, snapshotKysely, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { closure, closureOf, displayOrders, outline, seedTeamUnder } from '../test-support/teams.js'
import { adminUserListQuerySchema } from '../users/users.query.js'
import { AdminUsersService } from '../users/users.service.js'
import { TEAM_MESSAGES } from './errors.js'
import { AdminTeamsService } from './teams.service.js'

// 팀 이동(2e 스펙 §5-5 · B6 · B8 · B10 · §9-3 [1]). 🔴 팀 이름은 대소문자만으로 가르지 않는다(ci 콜레이션).

let t: TestDatabase
let service: AdminTeamsService

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminTeamsService(t.db)
})

afterAll(async () => {
  await t?.drop()
})

async function create(teamName: string, parentTeamNo: bigint | null): Promise<bigint> {
  return (await service.create({ teamName, parentTeamNo })).teamNo
}

function findNode(nodes: readonly AdminTeamNode[], teamNo: bigint): AdminTeamNode | undefined {
  for (const node of nodes) {
    if (node.teamNo === teamNo) return node
    const found = findNode(node.children, teamNo)
    if (found !== undefined) return found
  }
  return undefined
}

/** 그 상위 팀(null = 최상위)의 자식 이름 — 트리 순 */
async function childrenOf(parentTeamNo: bigint | null): Promise<string[]> {
  const items = (await service.tree()).items
  const nodes = parentTeamNo === null ? items : (findNode(items, parentTeamNo)?.children ?? [])
  return nodes.map((node) => node.teamName)
}

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

const issuePath = (error: BusinessError) =>
  (error.details as { issues: { path: unknown[] }[] }).issues[0]?.path

describe('같은 상위 팀', () => {
  it('기준 앞 · 끝 · 제자리 — before · after 를 돌려주고 제자리는 쓰지 않는다', async () => {
    const p = await create('sm-P', null)
    const s1 = await create('sm-1', p)
    const s2 = await create('sm-2', p)
    const s3 = await create('sm-3', p)
    expect(await service.move(s3, { parentTeamNo: p, beforeTeamNo: s2 })).toEqual({
      before: { parentTeamNo: p, displayOrder: 2 },
      after: { parentTeamNo: p, displayOrder: 1 },
    })
    expect(await childrenOf(p)).toEqual(['sm-1', 'sm-3', 'sm-2'])
    await service.move(s1, { parentTeamNo: p, beforeTeamNo: null })
    expect(await childrenOf(p)).toEqual(['sm-3', 'sm-2', 'sm-1'])
    expect(await displayOrders(t.db, [s1, s2, s3])).toEqual([
      [s1, 2],
      [s2, 1],
      [s3, 0],
    ])
    expect(await service.move(s1, { parentTeamNo: p, beforeTeamNo: null })).toEqual({
      before: { parentTeamNo: p, displayOrder: 2 },
      after: { parentTeamNo: p, displayOrder: 2 },
    })
  })

  it('🔴 동률 · 빈 번호 시드에서 siblingMove 대로 정확히 한 칸 — 그 묶음이 0..n-1 이 된다(Review Focus 1)', async () => {
    const p = await seedTeamUnder(t.db, { teamName: 'tie-P', parentTeamNo: null })
    const a = await seedTeamUnder(t.db, { teamName: 'tie-first', parentTeamNo: p })
    const b = await seedTeamUnder(t.db, { teamName: 'tie-second', parentTeamNo: p })
    const c = await seedTeamUnder(t.db, { teamName: 'tie-third', parentTeamNo: p })
    const up = siblingMove((await service.tree()).items, c, 'up')
    if (up === null) throw new Error('위로 갈 수 있어야 한다')
    await service.move(c, { parentTeamNo: up.parentTeamNo, beforeTeamNo: up.beforeTeamNo })
    expect(await childrenOf(p)).toEqual(['tie-first', 'tie-third', 'tie-second'])
    expect(await displayOrders(t.db, [a, b, c])).toEqual([
      [a, 0],
      [b, 2],
      [c, 1],
    ])

    const q = await seedTeamUnder(t.db, { teamName: 'gap-P', parentTeamNo: null })
    const x = await seedTeamUnder(t.db, { teamName: 'gap-x', parentTeamNo: q, displayOrder: 10 })
    const y = await seedTeamUnder(t.db, { teamName: 'gap-y', parentTeamNo: q, displayOrder: 20 })
    const z = await seedTeamUnder(t.db, { teamName: 'gap-z', parentTeamNo: q, displayOrder: 30 })
    const down = siblingMove((await service.tree()).items, x, 'down')
    if (down === null) throw new Error('아래로 갈 수 있어야 한다')
    await service.move(x, { parentTeamNo: down.parentTeamNo, beforeTeamNo: down.beforeTeamNo })
    expect(await childrenOf(q)).toEqual(['gap-y', 'gap-x', 'gap-z'])
    expect(await displayOrders(t.db, [x, y, z])).toEqual([
      [x, 1],
      [y, 0],
      [z, 2],
    ])
  })

  it('🔴 빈 번호 묶음의 제자리 이동은 아무것도 쓰지 않는다 — 최상위 제자리도 before = after', async () => {
    const p = await seedTeamUnder(t.db, { teamName: 'nw-P', parentTeamNo: null })
    const x = await seedTeamUnder(t.db, { teamName: 'nw-x', parentTeamNo: p, displayOrder: 10 })
    const y = await seedTeamUnder(t.db, { teamName: 'nw-y', parentTeamNo: p, displayOrder: 20 })
    const z = await seedTeamUnder(t.db, { teamName: 'nw-z', parentTeamNo: p, displayOrder: 30 })
    expect(await service.move(z, { parentTeamNo: p, beforeTeamNo: null })).toEqual({
      before: { parentTeamNo: p, displayOrder: 30 },
      after: { parentTeamNo: p, displayOrder: 30 },
    })
    expect(await service.move(x, { parentTeamNo: p, beforeTeamNo: y })).toEqual({
      before: { parentTeamNo: p, displayOrder: 10 },
      after: { parentTeamNo: p, displayOrder: 10 },
    })
    expect(await displayOrders(t.db, [x, y, z])).toEqual([
      [x, 10],
      [y, 20],
      [z, 30],
    ])
    const lastRoot = await create('nw-last-root', null)
    const rootMove = await service.move(lastRoot, { parentTeamNo: null, beforeTeamNo: null })
    expect(rootMove.after).toEqual(rootMove.before)
  })
})

describe('다른 상위 팀', () => {
  it('깊이 2 서브트리 — closure 전체가 기대 쌍과 같다 · 받는 쪽 끝 · 떠난 쪽은 빈 번호', async () => {
    const r1 = await create('mv-R1', null)
    const r2 = await create('mv-R2', null)
    const keep = await create('mv-keep', r1)
    const mid = await create('mv-mid', r1)
    const leaf = await create('mv-leaf', mid)
    const deep = await create('mv-deep', leaf)
    const z = await create('mv-z', r2)
    expect(await service.move(mid, { parentTeamNo: r2, beforeTeamNo: null })).toEqual({
      before: { parentTeamNo: r1, displayOrder: 1 },
      after: { parentTeamNo: r2, displayOrder: 1 },
    })
    expect(await closureOf(t.db, [mid, leaf, deep])).toEqual(
      closure(
        [mid, mid, 0],
        [r2, mid, 1],
        [leaf, leaf, 0],
        [mid, leaf, 1],
        [r2, leaf, 2],
        [deep, deep, 0],
        [leaf, deep, 1],
        [mid, deep, 2],
        [r2, deep, 3],
      ),
    )
    expect(await childrenOf(r1)).toEqual(['mv-keep'])
    expect(await childrenOf(r2)).toEqual(['mv-z', 'mv-mid'])
    expect(await displayOrders(t.db, [keep, z])).toEqual([
      [keep, 0],
      [z, 0],
    ])
  })

  it('기준 형제 앞으로 — 받는 묶음이 다시 매겨진다', async () => {
    const from = await create('bf-from', null)
    const to = await create('bf-to', null)
    const moving = await create('bf-moving', from)
    const first = await create('bf-first', to)
    const second = await create('bf-second', to)
    await service.move(moving, { parentTeamNo: to, beforeTeamNo: second })
    expect(await childrenOf(to)).toEqual(['bf-first', 'bf-moving', 'bf-second'])
    expect(await displayOrders(t.db, [moving, first, second])).toEqual([
      [moving, 1],
      [first, 0],
      [second, 2],
    ])
  })

  it('🔴 최상위로 — 다른 루트 바로 앞에 서고 closure 에 바깥 조상이 없다(Review Focus 5)', async () => {
    const root = await create('top-root', null)
    const after = await create('top-after', null)
    const child = await create('top-child', root)
    const grand = await create('top-grand', child)
    await service.move(child, { parentTeamNo: null, beforeTeamNo: after })
    const roots = await childrenOf(null)
    expect(roots.indexOf('top-child')).toBe(roots.indexOf('top-after') - 1)
    expect(await closureOf(t.db, [child, grand])).toEqual(
      closure([child, child, 0], [grand, grand, 0], [child, grand, 1]),
    )
    expect(await childrenOf(root)).toEqual([])
  })

  it('🔴 여러 단계 조상 사이로 옮겨도 closure 가 맞다 — 옛 바깥 조상 둘을 지우고 새 조상 셋을 넣는다', async () => {
    const a1 = await create('ml-a1', null)
    const a2 = await create('ml-a2', a1)
    const b1 = await create('ml-b1', null)
    const b2 = await create('ml-b2', b1)
    const b3 = await create('ml-b3', b2)
    const mover = await create('ml-mover', a2)
    const leaf = await create('ml-leaf', mover)
    await service.move(mover, { parentTeamNo: b3, beforeTeamNo: null })
    expect(await closureOf(t.db, [mover, leaf])).toEqual(
      closure(
        [mover, mover, 0],
        [b3, mover, 1],
        [b2, mover, 2],
        [b1, mover, 3],
        [leaf, leaf, 0],
        [mover, leaf, 1],
        [b3, leaf, 2],
        [b2, leaf, 3],
        [b1, leaf, 4],
      ),
    )
    expect(await childrenOf(a2)).toEqual([])
  })
})

describe('검사(B10)', () => {
  it('🔴 자기 자신 · 하위 팀 아래로는 400 ERR_TEAM_MOVE_CYCLE — closure 는 그대로', async () => {
    const top = await create('cy-top', null)
    const sub = await create('cy-sub', top)
    const before = await closureOf(t.db, [top, sub])
    for (const parentTeamNo of [top, sub]) {
      const error = await failure(service.move(top, { parentTeamNo, beforeTeamNo: null }))
      expect(error.code).toBe(CommonErrorCodes.ERR_TEAM_MOVE_CYCLE)
      expect(error.message).toBe(TEAM_MESSAGES.moveCycle)
    }
    expect(await closureOf(t.db, [top, sub])).toEqual(before)
  })

  it('기준 팀이 받는 쪽 자식이 아니면 · 대상 자신이면 400 issues beforeTeamNo', async () => {
    const p = await create('bv-P', null)
    const other = await create('bv-other', null)
    const moving = await create('bv-moving', p)
    const stranger = await create('bv-stranger', other)
    const notSibling = await failure(
      service.move(moving, { parentTeamNo: p, beforeTeamNo: stranger }),
    )
    expect(notSibling.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(notSibling.message).toBe(TEAM_MESSAGES.beforeNotSibling)
    expect(issuePath(notSibling)).toEqual(['beforeTeamNo'])
    const self = await failure(service.move(moving, { parentTeamNo: p, beforeTeamNo: moving }))
    expect(self.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(self.message).toBe(TEAM_MESSAGES.beforeIsSelf)
    expect(issuePath(self)).toEqual(['beforeTeamNo'])
  })

  it('없는 대상 404 팀 문구 · 없는 상위 팀 404 상위 팀 문구', async () => {
    const missing = await failure(
      service.move(999_997n, { parentTeamNo: null, beforeTeamNo: null }),
    )
    expect(missing.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(missing.message).toBe(TEAM_MESSAGES.noTeam)
    const team = await create('nf-team', null)
    const noParent = await failure(
      service.move(team, { parentTeamNo: 999_996n, beforeTeamNo: null }),
    )
    expect(noParent.code).toBe(CommonErrorCodes.ERR_NO_TEAM)
    expect(noParent.message).toBe(TEAM_MESSAGES.noParentTeam)
  })
})

describe('자기 행 없는 시드', () => {
  it('🔴 손으로 넣은 closure(자기 행 없음)에서도 이동이 맞다 — 자기 행을 만들지도 않는다(④ C1 · Review Focus 3)', async () => {
    const q0 = await seedTeamUnder(t.db, { teamName: 'ns-Q0', parentTeamNo: null, selfRow: false })
    const q1 = await seedTeamUnder(t.db, { teamName: 'ns-Q1', parentTeamNo: q0, selfRow: false })
    const q2 = await seedTeamUnder(t.db, { teamName: 'ns-Q2', parentTeamNo: q1, selfRow: false })
    const q3 = await seedTeamUnder(t.db, { teamName: 'ns-Q3', parentTeamNo: null, selfRow: false })
    await service.move(q1, { parentTeamNo: q3, beforeTeamNo: null })
    expect(await closureOf(t.db, [q1, q2])).toEqual(closure([q3, q1, 1], [q1, q2, 1], [q3, q2, 2]))
    expect(outline((await service.tree()).items).filter((path) => path.startsWith('ns-'))).toEqual([
      'ns-Q0',
      'ns-Q3',
      'ns-Q3/ns-Q1',
      'ns-Q3/ns-Q1/ns-Q2',
    ])
  })
})

describe('경합', () => {
  /** 원시 연결이 가드를 쥐고 mid · leaf 를 from 아래에서 to 아래로 옮기는 중(closure 미커밋) */
  const movingUnder =
    (mid: bigint, leaf: bigint, from: bigint, to: bigint) => async (connection: Connection) => {
      await connection.query(
        "select lock_name from guard_locks where lock_name = 'teamTree' for update",
      )
      await connection.query(
        'delete from team_closure where descendant_no in (?, ?) and ancestor_no in (?)',
        [mid, leaf, from],
      )
      await connection.query(
        'insert into team_closure (ancestor_no, descendant_no, depth) values (?, ?, 1), (?, ?, 2)',
        [to, mid, to, leaf],
      )
    }

  it('🔴 (b1) 이동 중의 하위 팀 만들기는 기다렸다가 새 조상으로 closure 를 만든다', async () => {
    const r1 = await create('b1-R1', null)
    const r2 = await create('b1-R2', null)
    const mid = await create('b1-mid', r1)
    const leaf = await create('b1-leaf', mid)
    const result = await whileHeld(t, movingUnder(mid, leaf, r1, r2), () =>
      service.create({ teamName: 'b1-new', parentTeamNo: leaf }),
    )
    if (!result.ok) throw result.error
    const made = result.value.teamNo
    expect(await closureOf(t.db, [made])).toEqual(
      closure([made, made, 0], [leaf, made, 1], [mid, made, 2], [r2, made, 3]),
    )
  })

  it('(b2) 같은 상황의 사용자 목록(하위 팀 포함)은 커밋 전 옛 집합 · 뒤 새 집합 — 섞이지 않는다', async () => {
    const r1 = await create('b2-R1', null)
    const r2 = await create('b2-R2', null)
    const mid = await create('b2-mid', r1)
    const leaf = await create('b2-leaf', mid)
    const roleNo = await seedRole(t.db, { roleName: 'b2-role', permissions: [] })
    const onMid = await seedUser(t.db, { roleNo, userId: 'b2-on-mid' })
    const onLeaf = await seedUser(t.db, { roleNo, userId: 'b2-on-leaf' })
    await addToTeam(t.db, mid, onMid.userNo)
    await addToTeam(t.db, leaf, onLeaf.userNo)
    const users = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db))
    const under = async (teamNo: bigint) =>
      (
        await users.list(
          adminUserListQuerySchema.parse({
            itemsPerPage: 100,
            filter: { teamNo: String(teamNo), recursive: 'true' },
          }),
        )
      ).items
        .map((user) => user.userId)
        .sort()
    const result = await whileHeld(t, movingUnder(mid, leaf, r1, r2), async () => ({
      r1: await under(r1),
      r2: await under(r2),
    }))
    if (!result.ok) throw result.error
    expect(result.value).toEqual({ r1: ['b2-on-leaf', 'b2-on-mid'], r2: [] })
    expect(await under(r1)).toEqual([])
    expect(await under(r2)).toEqual(['b2-on-leaf', 'b2-on-mid'])
  })

  it('🔴 (c1) 겹치지 않는 행을 잠그는 이동 둘(왼쪽 → 오른쪽 자식 아래, 오른쪽 → 왼쪽 자식 아래)은 하나만 된다 — 순환이 없다', async () => {
    const root = await create('c1-root', null)
    const left = await create('c1-left', root)
    const leftChild = await create('c1-left-child', left)
    const right = await create('c1-right', root)
    const rightChild = await create('c1-right-child', right)
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query(
          "select lock_name from guard_locks where lock_name = 'teamTree' for update",
        ),
      () =>
        Promise.all([
          settle(service.move(left, { parentTeamNo: rightChild, beforeTeamNo: null })),
          settle(service.move(right, { parentTeamNo: leftChild, beforeTeamNo: null })),
        ]),
      { waiters: 2 },
    )
    if (!result.ok) throw result.error
    const outcomes = result.value
      .map((outcome) => (outcome.ok ? 'ok' : String((outcome.error as BusinessError).code)))
      .sort()
    expect(outcomes).toEqual([CommonErrorCodes.ERR_TEAM_MOVE_CYCLE, 'ok'])
    const rows = await closureOf(t.db, [left, leftChild, right, rightChild])
    expect(rows.filter((row) => row.ancestorNo === row.descendantNo && row.depth > 0)).toEqual([])
    expect(
      outline((await service.tree()).items).filter((path) => path.startsWith('c1-')),
    ).toHaveLength(5)
  })

  it('🔴 (s1) 스냅샷 격리 ON — 가드를 기다린 이동은 그사이 이름이 바뀐 형제를 다시 매겨도 1020 이 아니다(B5)', async () => {
    const p = await create('s1-P', null)
    const first = await create('s1-first', p)
    const second = await create('s1-second', p)
    const snapshotDb = await snapshotKysely(t, true)
    try {
      const onSnapshot = new AdminTeamsService(snapshotDb)
      const result = await whileHeld(
        t,
        async (connection) => {
          await connection.query(
            "select lock_name from guard_locks where lock_name = 'teamTree' for update",
          )
          await connection.query('update teams set team_name = ? where team_no = ?', [
            's1-first-renamed',
            first,
          ])
        },
        () => onSnapshot.move(second, { parentTeamNo: p, beforeTeamNo: first }),
      )
      if (!result.ok) throw result.error
      expect(await childrenOf(p)).toEqual(['s1-second', 's1-first-renamed'])
    } finally {
      await snapshotDb.destroy()
    }
  })
})
