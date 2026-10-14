import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GUARD_LOCK_SUPER_ADMIN } from '../accounts/super-admin.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { GUARD_LOCK_TEAM_TREE, GUARD_MESSAGES, lockGuardRow } from './guard-locks.js'

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

describe('guardLocks 시드 행', () => {
  it('🔴 장의 리터럴과 이름 상수가 같다 — 잔존(0009) · 팀 트리(0010)', async () => {
    const rows = await t.db
      .selectFrom('guardLocks')
      .select('lockName')
      .orderBy('lockName')
      .execute()
    expect(rows).toEqual([{ lockName: GUARD_LOCK_SUPER_ADMIN }, { lockName: GUARD_LOCK_TEAM_TREE }])
  })
})

describe('lockGuardRow', () => {
  it('행이 있으면 잡고 끝난다', async () => {
    await expect(
      t.db.transaction().execute((trx) => lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)),
    ).resolves.toBeUndefined()
  })

  it('🔴 행이 없으면 500 ERR_COMMON_INTERNAL + details.lockName — 조용히 보호 없이 쓰지 않는다', async () => {
    const error = await t.db
      .transaction()
      .execute((trx) => lockGuardRow(trx, 'noSuchLock'))
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_INTERNAL)
    expect((error as BusinessError).message).toBe(GUARD_MESSAGES.missing)
    expect((error as BusinessError).details).toEqual({ lockName: 'noSuchLock' })
  })
})
