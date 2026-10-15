import { MariadbDialect } from '@kim5257/kysely-mariadb-dialect'
import { Kysely, sql } from 'kysely'
import { createConnection, createPool, type Connection } from 'mariadb'
import { adminPoolConfig } from '../database/connection.js'
import { adminKyselyPlugins } from '../database/kysely.js'
import type { AdminDatabase } from '../database/types.js'
import type { TestDatabase } from './db.js'
import { testDbServer } from './db-url.js'
import { lockWaitThreadIds } from './lock-wait.js'

// 테스트 전용 — 경합 재현. 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 다른 트랜잭션이 행을 쥔 채로 있는 동안 서비스 메서드(공개 경로)를 부르고, 그 메서드가 잠금을 기다리기 시작하면 쥔 트랜잭션을
// 커밋한다 — 잠금 순서 · 읽기 뷰 회귀를 결정적으로 잰다(2d 스펙 §14 R7). 부품을 따로 부르면 순서 회귀를 못 잡는다.
// 바꾼 점(2e 스펙 이월 4 · §14 R1-6): 300ms 고정 대기 대신 잠금 대기를 본다 — 느린 CI 에서 서비스가 잠금에 닿기 전에 커밋해
//   경합을 재지 못하는 거짓 결과가 없다. 🔴 information_schema.innodb_trx 는 서버 전역 캐시라 쓰지 않는다(lock-wait.ts).
// 2f-1(스펙 P15): 잠금을 쥔 채 관찰하는 루프(teams.guard · legal.guard · roles.index 의 복사본)를 underHeld 로 모았고, whileHeld 가
//   대기에 닿았는지(reached)를 돌려준다 — 경합 테스트가 경합 창에 닿았음을 단언한다. 관찰 연결이 열리다 실패해도 쥔 연결을 닫는다.

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

/** 🔴 기다리는 동안 거부돼도 "처리되지 않은 거부" 로 터지지 않게 바로 받아 둔다 */
export function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

const POLL_MS = 25
const SNAPSHOT_POOL_SIZE = 2

function openRaw(t: TestDatabase): Promise<Connection> {
  return createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
}

/**
 * 이 데이터베이스에서 행 잠금을 기다리는 연결 수 — SHOW ENGINE INNODB STATUS 의 대기 thread id ∩ processlist 의
 * `db = database`. 🔴 PROCESS 권한이 필요하다(로컬 컨테이너 · CI 모두 root).
 */
export async function lockWaitsIn(observer: Connection, database: string): Promise<number> {
  const rows = (await observer.query('show engine innodb status')) as { Status?: string }[]
  const ids = lockWaitThreadIds(rows[0]?.Status ?? '')
  if (ids.length === 0) return 0
  const found = (await observer.query(
    'select count(*) as n from information_schema.processlist where db = ? and id in (?)',
    [database, ids],
  )) as { n: bigint | number }[]
  return Number(found[0]?.n ?? 0)
}

export interface WhileHeldOptions {
  /** 같은 데이터베이스에서 이만큼의 연결이 잠금을 기다리면 커밋한다. 기본 1 */
  waiters?: number
  /** 이 시간 안에 대기를 못 보면 그래도 커밋한다. 기본 5000ms */
  timeoutMs?: number
}

/**
 * 원시 연결이 트랜잭션을 열고 `hold` 로 잠금 · 쓰기를 쥔 채 `during()` 을 시작한다. 같은 데이터베이스에서 `waiters` 개의 연결이
 * 잠금을 기다리기 시작하면 — 또는 `during()` 이 기다리지 않고 끝나면, 또는 `timeoutMs` 가 지나면 — 그 트랜잭션을 커밋하고
 * `during()` 의 결과와 대기에 닿았는지(`reached`)를 돌려준다. 🔴 실패해도 롤백 · 종료한다 — 쥔 잠금이 남으면 afterAll 의
 * DROP DATABASE 가 막힌다. 관찰 연결이 열리다 실패해도 쥔 연결을 닫는다.
 */
export async function whileHeld<T>(
  t: TestDatabase,
  hold: (connection: Connection) => Promise<unknown>,
  during: () => Promise<T>,
  options: WhileHeldOptions = {},
): Promise<Settled<T> & { reached: boolean }> {
  const waiters = options.waiters ?? 1
  const deadline = Date.now() + (options.timeoutMs ?? 5000)
  const connection = await openRaw(t)
  let observer: Connection | undefined
  try {
    observer = await openRaw(t)
    await connection.beginTransaction()
    await hold(connection)
    let finished = false
    let reached = false
    const pending = settle(during()).then((result) => {
      finished = true
      return result
    })
    while (!finished && Date.now() < deadline) {
      if ((await lockWaitsIn(observer, t.name)) >= waiters) {
        reached = true
        break
      }
      await sleep(POLL_MS)
    }
    await connection.commit()
    return { ...(await pending), reached }
  } finally {
    await connection.rollback().catch(() => undefined)
    await connection.end()
    await observer?.end()
  }
}

/** 가드 행 하나를 FOR UPDATE 로 쥔다 — `underHeld` · `whileHeld` 의 hold 로 쓴다 */
export function holdGuard(lockName: string): (connection: Connection) => Promise<unknown> {
  return (connection) =>
    connection.query('select lock_name from guard_locks where lock_name = ? for update', [lockName])
}

export interface UnderHeld<T> {
  /** run 이 잠금 대기에 들어갔는가 */
  waited: boolean
  result: Settled<T>
}

/**
 * 원시 연결이 `hold` 로 잠금을 쥔 채 `run` 을 시작한다 — `run` 이 잠금 대기에 들어갔는지(`waited`)와, 쥔 트랜잭션을 커밋한 뒤의
 * 결과. `whileHeld` 와 달리 "기다리지 않았다" 도 답이다 — 쓰기가 가드를 잡는지(true) · 읽기가 가드를 안 잡는지(false)를 잰다.
 * 🔴 관찰 연결이 열리다 실패해도 쥔 연결을 닫는다(2e-2 최종 리뷰 — 옛 복사본은 holder 를 남겼다).
 */
export async function underHeld<T>(
  t: TestDatabase,
  hold: (connection: Connection) => Promise<unknown>,
  run: () => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<UnderHeld<T>> {
  const deadline = Date.now() + (options.timeoutMs ?? 2500)
  const holder = await openRaw(t)
  let observer: Connection | undefined
  try {
    observer = await openRaw(t)
    await holder.beginTransaction()
    await hold(holder)
    let finished = false
    const pending = settle(run()).then((result) => {
      finished = true
      return result
    })
    let waited = false
    while (!finished && !waited && Date.now() < deadline) {
      waited = (await lockWaitsIn(observer, t.name)) > 0
      if (!waited) await sleep(POLL_MS)
    }
    await holder.commit()
    return { waited, result: await pending }
  } finally {
    await holder.rollback().catch(() => undefined)
    await holder.end()
    await observer?.end()
  }
}

/**
 * innodb_snapshot_isolation 을 이 풀의 연결마다 켠(끈) Kysely — MariaDB 11.6.2+ 의 기본(ON)을 11.4 에서 잰다(2d §14 R7-8).
 * 🔴 SET GLOBAL 을 쓰지 않는다 — 테스트 파일은 같은 서버에서 병렬로 돈다. 다 쓰면 destroy() 한다.
 * 🔴 돌려주기 전에 풀의 연결 둘을 동시에 붙잡아 세션 값을 단언한다(풀 데우기 — 2e 이월 4). initSql 이 빠진 연결이 섞이면
 *    ON 을 잰다고 믿은 테스트가 OFF 를 잰다.
 */
export async function snapshotKysely(
  t: TestDatabase,
  snapshot: boolean,
): Promise<Kysely<AdminDatabase>> {
  const db = new Kysely<AdminDatabase>({
    dialect: new MariadbDialect({
      pool: createPool({
        ...adminPoolConfig({
          ...testDbServer(),
          database: t.name,
          connectionLimit: SNAPSHOT_POOL_SIZE,
        }),
        initSql: `set session innodb_snapshot_isolation = ${snapshot ? 'ON' : 'OFF'}`,
      }),
    }),
    plugins: adminKyselyPlugins(),
  })
  try {
    const values = await sessionSnapshotValues(db, SNAPSHOT_POOL_SIZE)
    const expected = snapshot ? 1 : 0
    if (values.some((value) => value !== expected)) {
      throw new Error(
        `innodb_snapshot_isolation 세션 값이 ${expected} 이 아니다: ${values.join(', ')}`,
      )
    }
    return db
  } catch (error) {
    await db.destroy()
    throw error
  }
}

/** 풀의 연결 n 개를 동시에 붙잡고(서로를 기다린다) 각자의 세션 값을 읽는다 */
async function sessionSnapshotValues(
  db: Kysely<AdminDatabase>,
  connections: number,
): Promise<number[]> {
  let arrived = 0
  let release: () => void = () => undefined
  const together = new Promise<void>((resolve) => {
    release = resolve
  })
  return Promise.all(
    Array.from({ length: connections }, () =>
      db.connection().execute(async (connection) => {
        const result = await sql<{
          value: number | bigint | string
        }>`select @@session.innodb_snapshot_isolation as value`.execute(connection)
        arrived += 1
        if (arrived === connections) release()
        await together
        return Number(result.rows[0]?.value)
      }),
    ),
  )
}
