import { sql } from 'kysely'
import { createConnection, type Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  holdGuard,
  lockWaitsIn,
  sleep,
  snapshotKysely,
  underHeld,
  whileHeld,
} from './concurrency.js'
import { createTestDatabase, type TestDatabase } from './db.js'
import { testDbServer } from './db-url.js'

// whileHeld 자체의 계약(2e 스펙 §9-3 [1] 이월 4). 행 하나(guardLocks 의 시험 행)를 원시 연결이 쥐고 푼다.

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
  await t.db
    .insertInto('guardLocks')
    .values({ lockName: 'heldProbe', description: 'start' })
    .execute()
})

afterAll(async () => {
  await t?.drop()
})

const holdWith = (value: string) => (connection: Connection) =>
  connection.query("update guard_locks set description = ? where lock_name = 'heldProbe'", [value])

const lockedRead = () =>
  t.db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('guardLocks')
      .select('description')
      .where('lockName', '=', 'heldProbe')
      .forUpdate()
      .executeTakeFirstOrThrow()
    return row.description
  })

const plainRead = async () =>
  (
    await t.db
      .selectFrom('guardLocks')
      .select('description')
      .where('lockName', '=', 'heldProbe')
      .executeTakeFirstOrThrow()
  ).description

describe('whileHeld', () => {
  it('🔴 during 이 잠금을 기다리기 시작하면 곧바로 커밋한다 — 기다린 뒤 커밋된 값을 본다', async () => {
    const started = Date.now()
    const result = await whileHeld(t, holdWith('held-1'), lockedRead)
    expect(result).toEqual({ ok: true, value: 'held-1', reached: true })
    // 대기를 못 보면 기본 5초 뒤에야 커밋한다
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('기다리지 않는 during 은 끝나는 대로 커밋한다 — 커밋 전 값을 읽었다', async () => {
    const before = await plainRead()
    const started = Date.now()
    const result = await whileHeld(t, holdWith('held-2'), plainRead)
    expect(result).toEqual({ ok: true, value: before, reached: false })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(await plainRead()).toBe('held-2')
  })

  it('시간 초과면 커밋한 뒤 during 을 기다린다', async () => {
    const result = await whileHeld(
      t,
      holdWith('held-3'),
      async () => {
        await sleep(600)
        return plainRead()
      },
      { timeoutMs: 150 },
    )
    expect(result).toEqual({ ok: true, value: 'held-3', reached: false })
  })

  it('waiters — 그만큼이 다 기다릴 때까지 커밋하지 않는다', async () => {
    const result = await whileHeld(
      t,
      holdWith('held-4'),
      async () => {
        const started = Date.now()
        const first = lockedRead().then(() => Date.now() - started)
        await sleep(300)
        const second = lockedRead().then(() => Date.now() - started)
        return Promise.all([first, second])
      },
      { waiters: 2 },
    )
    expect(result.reached).toBe(true)
    if (!result.ok) throw result.error
    // 첫째는 둘째가 기다리기 시작한(300ms 뒤) 다음에야 풀렸다
    expect(result.value[0]).toBeGreaterThanOrEqual(250)
  })
})

describe('underHeld', () => {
  it('🔴 run 이 쥔 행을 기다리면 waited true — 풀린 뒤 커밋된 값을 본다', async () => {
    const { waited, result } = await underHeld(t, holdWith('under-1'), lockedRead)
    expect(waited).toBe(true)
    expect(result).toEqual({ ok: true, value: 'under-1' })
  })

  it('기다리지 않는 run 은 waited false — 쥔 쪽 커밋 전 값을 읽었다', async () => {
    const before = await plainRead()
    const { waited, result } = await underHeld(t, holdWith('under-2'), plainRead)
    expect(waited).toBe(false)
    expect(result).toEqual({ ok: true, value: before })
    expect(await plainRead()).toBe('under-2')
  })

  it('holdGuard — 가드 행 하나를 쥔다(그 행의 잠금 읽기가 기다린다)', async () => {
    const { waited, result } = await underHeld(t, holdGuard('heldProbe'), lockedRead)
    expect(waited).toBe(true)
    if (!result.ok) throw result.error
  })
})

describe('lockWaitsIn', () => {
  // 데이터베이스 만들기가 10~15초 걸린다 — 테스트 본문(20초)이 아니라 훅(60초)에서 만들고 지운다.
  let other: TestDatabase

  beforeAll(async () => {
    other = await createTestDatabase()
  })

  afterAll(async () => {
    await other?.drop()
  })

  it('🔴 다른 데이터베이스(병렬 테스트 파일)의 대기는 세지 않는다', async () => {
    const open = (database: string) =>
      createConnection({ ...testDbServer(), database, timezone: 'Z' })
    const holder = await open(other.name)
    const waiter = await open(other.name)
    const observer = await open(t.name)
    try {
      await other.db
        .insertInto('guardLocks')
        .values({ lockName: 'otherProbe', description: 'x' })
        .execute()
      await holder.beginTransaction()
      await holder.query(
        "select lock_name from guard_locks where lock_name = 'otherProbe' for update",
      )
      await waiter.beginTransaction()
      const pending = waiter
        .query("select lock_name from guard_locks where lock_name = 'otherProbe' for update")
        .catch(() => undefined)
      let seen = 0
      for (let i = 0; i < 40 && seen === 0; i += 1) {
        seen = await lockWaitsIn(observer, other.name)
        if (seen === 0) await sleep(25)
      }
      expect(seen).toBe(1)
      expect(await lockWaitsIn(observer, t.name)).toBe(0)
      await holder.commit()
      await pending
    } finally {
      await holder.rollback().catch(() => undefined)
      await waiter.rollback().catch(() => undefined)
      for (const connection of [holder, waiter, observer]) await connection.end()
    }
  })
})

describe('snapshotKysely', () => {
  it('🔴 ON · OFF 를 연결마다 걸고, 돌려주기 전에 단언한다 — 전역 값은 그대로', async () => {
    const globalOf = async () =>
      Number(
        (await sql<{ v: number }>`select @@global.innodb_snapshot_isolation as v`.execute(t.db))
          .rows[0]?.v,
      )
    const before = await globalOf()
    for (const snapshot of [true, false]) {
      const db = await snapshotKysely(t, snapshot)
      try {
        const row = await sql<{
          v: number
        }>`select @@session.innodb_snapshot_isolation as v`.execute(db)
        expect(Number(row.rows[0]?.v)).toBe(snapshot ? 1 : 0)
      } finally {
        await db.destroy()
      }
    }
    expect(await globalOf()).toBe(before)
  })
})
