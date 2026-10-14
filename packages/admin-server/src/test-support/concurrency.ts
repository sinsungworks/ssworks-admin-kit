import { createConnection, type Connection } from 'mariadb'
import type { TestDatabase } from './db.js'
import { testDbServer } from './db-url.js'

// 테스트 전용 — 경합 재현. 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 다른 트랜잭션이 행을 쥔 채로 있는 동안 서비스 메서드(공개 경로)를 부르고, 잠시 뒤 그 트랜잭션을 커밋한다 — 잠금 순서 ·
// 읽기 뷰 회귀를 결정적으로 잰다(2d 스펙 §14 R7). 부품을 따로 부르면 순서 회귀를 못 잡는다.

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

/**
 * 원시 연결이 트랜잭션을 열고 `hold` 로 잠금 · 쓰기를 쥔 채 `during()` 을 시작한다. `waitMs` 뒤 그 트랜잭션을 커밋하고
 * `during()` 의 결과를 돌려준다. 🔴 실패해도 롤백 · 종료한다 — 쥔 잠금이 남으면 afterAll 의 DROP DATABASE 가 막힌다.
 */
export async function whileHeld<T>(
  t: TestDatabase,
  hold: (connection: Connection) => Promise<unknown>,
  during: () => Promise<T>,
  waitMs = 300,
): Promise<Settled<T>> {
  const connection = await createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
  try {
    await connection.beginTransaction()
    await hold(connection)
    const pending = settle(during())
    await sleep(waitMs)
    await connection.commit()
    return await pending
  } finally {
    await connection.rollback().catch(() => undefined)
    await connection.end()
  }
}
