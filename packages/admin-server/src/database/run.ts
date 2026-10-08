import type { Kysely, Transaction } from 'kysely'
import { mapError } from './map-error.js'

// 정본: hangang-home apps/api/src/core/database/write-transaction.ts + ssworks-gise-home apps/api/src/core/database/run.ts
// 바꾼 점: `Kysely<Database>` 에 묶지 않고 제네릭이다 — 쓰는 쪽 Database 로도 부른다. gise 의 `label` 인자 · 트랜잭션 안
//   네트워크 I/O 단언(tx-context)은 옮기지 않았다(스펙 §11).
//
// 🔴 이 봉투가 없으면 드라이버 오류(데드락 · 연결 거부)가 코드 없는 맨 500 으로 나간다. 관리자 SPA 는 `code` 로만
//    분기하므로 재시도 안내도 못 한다(hangang 최종 수정 A5).

/** 트랜잭션 없이 DB 를 만지는 자리(읽기 하나 · 단문 쓰기)의 봉투. */
export async function runQuery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw mapError(error)
  }
}

/**
 * 쓰기 트랜잭션. 안에서 던지면 롤백되고 드라이버 오류는 코드 있는 `BusinessError` 가 된다. 서비스가 던진
 * `BusinessError`(409 · 404 …)는 그대로 통과한다.
 *
 * 🔴 재인증(argon2)을 이 안에서 부르지 않는다 — 수십 ms 의 해시가 행 잠금을 쥔 채 돈다(hangang password-recheck).
 */
export async function runWriteTransaction<DB, T>(
  db: Kysely<DB>,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction().execute(fn)
  } catch (error) {
    throw mapError(error)
  }
}
