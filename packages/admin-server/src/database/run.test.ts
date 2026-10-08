import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely, Transaction } from 'kysely'
import { describe, expect, it } from 'vitest'
import { runQuery, runWriteTransaction } from './run.js'

const dup = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' })

/** `db.transaction().execute(fn)` 만 흉내 낸다 — 진짜 롤백은 DB 층 테스트(Task 9)가 잰다 */
function fakeDb(trx: unknown): Kysely<unknown> {
  return {
    transaction: () => ({
      execute: <T>(fn: (t: Transaction<unknown>) => Promise<T>) => fn(trx as Transaction<unknown>),
    }),
  } as unknown as Kysely<unknown>
}

describe('runQuery', () => {
  it('값을 그대로 돌려준다', async () => {
    await expect(runQuery(async () => 42)).resolves.toBe(42)
  })

  it('드라이버 오류를 코드 있는 BusinessError 로', async () => {
    await expect(
      runQuery(async () => {
        throw dup
      }),
    ).rejects.toMatchObject({ code: CommonErrorCodes.ERR_COMMON_DUPLICATED, cause: dup })
  })
})

describe('runWriteTransaction', () => {
  it('트랜잭션 객체를 넘기고 값을 돌려준다', async () => {
    const trx = { marker: 'trx' }
    await expect(runWriteTransaction(fakeDb(trx), async (t) => t)).resolves.toBe(trx)
  })

  it('안에서 던진 드라이버 오류를 바꾼다', async () => {
    await expect(
      runWriteTransaction(fakeDb({}), async () => {
        throw dup
      }),
    ).rejects.toMatchObject({ code: CommonErrorCodes.ERR_COMMON_DUPLICATED })
  })

  it('BusinessError 는 그대로 통과한다', async () => {
    const error = new BusinessError(
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      '다른 곳에서 먼저 바뀌었습니다.',
    )
    await expect(
      runWriteTransaction(fakeDb({}), async () => {
        throw error
      }),
    ).rejects.toBe(error)
  })
})
