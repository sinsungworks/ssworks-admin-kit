import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { sql, type Generated } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { readJsonColumn } from './json.js'
import { runQuery, runWriteTransaction } from './run.js'

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

async function insertRole(roleName: string): Promise<bigint> {
  const result = await t.db
    .insertInto('roles')
    .values({ roleName, permissions: JSON.stringify(['*']) })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

async function insertUser(roleNo: bigint, userId: string): Promise<bigint> {
  const result = await t.db
    .insertInto('users')
    .values({ userId, password: 'hash', userName: '사용자', roleNo })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

async function rejection(promise: Promise<unknown>): Promise<BusinessError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('거부되지 않았다')
}

describe('왕복', () => {
  it('bigint PK · boolean · revision · JSON 배열', async () => {
    const roleNo = await insertRole('왕복 확인')
    expect(typeof roleNo).toBe('bigint')
    const role = await t.db
      .selectFrom('roles')
      .selectAll()
      .where('roleNo', '=', roleNo)
      .executeTakeFirstOrThrow()
    expect(role.roleNo).toBe(roleNo)
    expect(role.isDefault).toBe(false)
    expect(role.revision).toBe(0)
    expect(readJsonColumn(role.permissions)).toEqual(['*'])
  })

  it('🔴 풀이 세션 time_zone 을 +00:00 으로 맞추고 저장 바이트는 UTC 다(timezone Z)', async () => {
    // 드라이버 timezone 옵션은 Date 직렬화가 아니라 세션 time_zone 만 바꾼다 — 직렬화는 프로세스 TZ 몫이라
    // assertUtcTimezone 이 따로 막는다. 그래서 옵션 자체는 세션 값으로 잰다('local' 이면 SYSTEM 이 된다).
    const session = await sql<{ tz: string }>`select @@session.time_zone as tz`.execute(t.db)
    expect(session.rows[0]?.tz).toBe('+00:00')

    const roleNo = await insertRole('시각 확인')
    const userNo = await insertUser(roleNo, 'time-check')
    const lockUntil = new Date('2026-03-04T05:06:07.000Z')
    await t.db.updateTable('users').set({ lockUntil }).where('userNo', '=', userNo).execute()
    const stored = await sql<{ raw: string }>`
      select cast(lock_until as char) as raw from users where user_no = ${userNo}
    `.execute(t.db)
    expect(stored.rows[0]?.raw).toBe('2026-03-04 05:06:07')
    const user = await t.db
      .selectFrom('users')
      .select(['lockUntil'])
      .where('userNo', '=', userNo)
      .executeTakeFirstOrThrow()
    expect(user.lockUntil?.toISOString()).toBe('2026-03-04T05:06:07.000Z')
  })

  it('🔴 JSON 컬럼 안쪽 snake 키를 바꾸지 않는다(maintainNestedObjectKeys)', async () => {
    await sql`create table json_probe (probe_no bigint unsigned primary key auto_increment, payload json not null)`.execute(
      t.db,
    )
    const probe = t.db.withTables<{ jsonProbe: { probeNo: Generated<bigint>; payload: unknown } }>()
    await probe
      .insertInto('jsonProbe')
      .values({ payload: JSON.stringify({ inner_key: { deep_key: 1 } }) })
      .execute()
    const row = await probe.selectFrom('jsonProbe').selectAll().executeTakeFirstOrThrow()
    expect(readJsonColumn(row.payload)).toEqual({ inner_key: { deep_key: 1 } })
  })

  it('세션 — loginAt 을 넣을 수 있고 폐기 UPDATE 가 lastAccessAt 을 바꾸지 않는다', async () => {
    const roleNo = await insertRole('세션 확인')
    const userNo = await insertUser(roleNo, 'session-check')
    const loginAt = new Date('2026-01-01T00:00:00.000Z')
    const lastAccessAt = new Date('2026-01-02T00:00:00.000Z')
    const inserted = await t.db
      .insertInto('sessions')
      .values({
        userNo,
        refreshTokenHash: 'a'.repeat(64),
        userAgent: 'Mozilla/5.0',
        ipAddress: '203.0.113.7',
        loginAt,
        lastAccessAt,
        expireAt: new Date('2026-02-01T00:00:00.000Z'),
      })
      .executeTakeFirstOrThrow()
    const sessionNo = inserted.insertId as bigint
    await t.db
      .updateTable('sessions')
      .set({ isRevoked: true, revokedReason: 'terminated', revokedAt: new Date() })
      .where('sessionNo', '=', sessionNo)
      .execute()
    const session = await t.db
      .selectFrom('sessions')
      .selectAll()
      .where('sessionNo', '=', sessionNo)
      .executeTakeFirstOrThrow()
    expect(session.loginAt.toISOString()).toBe(loginAt.toISOString())
    expect(session.lastAccessAt.toISOString()).toBe(lastAccessAt.toISOString())
    expect(session.isRevoked).toBe(true)
    expect(session.revokedReason).toBe('terminated')
  })
})

describe('mapError 실물', () => {
  it('🔴 UNIQUE(대소문자만 다른 아이디 — ci) → ERR_COMMON_DUPLICATED, 메시지에 snake 제약 이름', async () => {
    const roleNo = await insertRole('UNIQUE 확인')
    await insertUser(roleNo, 'Admin')
    const error = await rejection(runQuery(() => insertUser(roleNo, 'admin')))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_DUPLICATED)
    const cause = error.cause as { code?: string; message?: string }
    expect(cause.code).toBe('ER_DUP_ENTRY')
    expect(cause.message).toContain('uq_users_user_id')
  })

  it('쓰는 중인 역할 삭제 → ERR_COMMON_IN_USE', async () => {
    const roleNo = await insertRole('사용 중')
    await insertUser(roleNo, 'in-use')
    const error = await rejection(
      runQuery(() => t.db.deleteFrom('roles').where('roleNo', '=', roleNo).execute()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_IN_USE)
  })

  it('없는 역할로 사용자 삽입 → ERR_COMMON_BAD_REQUEST', async () => {
    const error = await rejection(runQuery(() => insertUser(999_999n, 'no-role')))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
  })
})

describe('runWriteTransaction', () => {
  it('안에서 던지면 롤백된다', async () => {
    const before = await t.db
      .selectFrom('roles')
      .select(({ fn }) => fn.countAll<bigint>().as('n'))
      .executeTakeFirstOrThrow()
    const error = await rejection(
      runWriteTransaction(t.db, async (trx) => {
        await trx
          .insertInto('roles')
          .values({ roleName: '롤백될 역할', permissions: '[]' })
          .execute()
        throw new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, '중간 실패')
      }),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    const after = await t.db
      .selectFrom('roles')
      .select(({ fn }) => fn.countAll<bigint>().as('n'))
      .executeTakeFirstOrThrow()
    expect(after.n).toBe(before.n)
  })

  it('안의 드라이버 오류도 코드 있는 오류로', async () => {
    await insertRole('트랜잭션 중복')
    const error = await rejection(
      runWriteTransaction(t.db, async (trx) => {
        await trx
          .insertInto('roles')
          .values({ roleName: '트랜잭션 중복', permissions: '[]' })
          .execute()
      }),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_DUPLICATED)
  })
})
