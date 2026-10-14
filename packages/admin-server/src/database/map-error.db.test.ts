import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { sql } from 'kysely'
import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { runWriteTransaction } from './run.js'

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

// 🔴 MariaDB 11.6.2+ 는 innodb_snapshot_isolation=ON 이 기본이다(CI 는 11.4 — 세션 변수로 켠다). 읽기 뷰가 열린 트랜잭션이
//    그 뒤 다른 트랜잭션이 바꾼 행을 잠금 읽기하면 ER_CHECKREAD(1020)가 난다 — 데드락과 같은 409 다시 시도로 나가야 한다.
describe('mapError 실물 — ER_CHECKREAD(1020)', () => {
  it('읽기 뷰가 열린 뒤 남이 바꾼 행을 FOR UPDATE → 409 ERR_COMMON_CONFLICT', async () => {
    const inserted = await t.db
      .insertInto('roles')
      .values({ roleName: '스냅샷 확인', permissions: '[]' })
      .executeTakeFirstOrThrow()
    const roleNo = inserted.insertId as bigint

    const other = await createConnection({ ...testDbServer(), database: t.name })
    try {
      let caught: unknown
      try {
        await runWriteTransaction(t.db, async (trx) => {
          await sql`set session innodb_snapshot_isolation = ON`.execute(trx)
          await sql`select count(*) as n from roles`.execute(trx)
          await other.query('update roles set role_name = ? where role_no = ?', [
            '스냅샷 바뀜',
            roleNo.toString(),
          ])
          await sql`select role_no from roles where role_no = ${roleNo} for update`.execute(trx)
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(BusinessError)
      const error = caught as BusinessError
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
      expect(error.message).toBe('동시 처리 충돌입니다. 다시 시도해 주세요.')
      expect((error.cause as { code?: string }).code).toBe('ER_CHECKREAD')
    } finally {
      await other.end()
    }
  })
})
