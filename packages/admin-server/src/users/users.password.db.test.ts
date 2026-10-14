import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { verifyPassword } from '../auth/password.js'
import type { AdminReauthService } from '../auth/reauth.service.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { FakeReauth, testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { liveSessionCount, seedSession, userRow } from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 비밀번호 초기화 · 잠금 해제(2d 스펙 §5-6 · 3c §9). 잔존과 무관 — '*' 사용자를 만들지 않는다.

let t: TestDatabase
let service: AdminUsersService
let plainRole: bigint
let wideRole: bigint
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.users:read', 'org.users:write'])
const PAST = new Date('2020-01-01T00:00:00.000Z')

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined)
  plainRole = await seedRole(t.db, { roleName: 'p-plain', permissions: ['org.users:read'] })
  wideRole = await seedRole(t.db, {
    roleName: 'p-wide',
    permissions: ['org.users:read', 'org.users:write', 'org.roles:read', 'org.roles:write'],
  })
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

/** 잠긴 계정 — 수정일은 과거로 박아 둔다(바뀌지 않음을 잰다) */
async function locked(userId: string) {
  const user = await seedUser(t.db, {
    roleNo: plainRole,
    userId,
    loginFailCount: 5,
    lockUntil: new Date(Date.now() + 600_000),
  })
  await t.db
    .updateTable('users')
    .set({ updateAt: PAST })
    .where('userNo', '=', user.userNo)
    .execute()
  return user
}

describe('resetPassword', () => {
  it('🔴 임시 비밀번호 · 강제 변경 · 잠금 풀림 · 세션 폐기 — revision · updateAt 그대로(⑧ V1 · 공통 5)', async () => {
    const user = await locked('p-reset')
    await seedSession(t.db, user.userNo)
    await seedSession(t.db, user.userNo)
    const { temporaryPassword, revokedCount } = await service.resetPassword(user.userNo, {}, root)
    expect(temporaryPassword).toHaveLength(16)
    expect(revokedCount).toBe(2)
    expect(await liveSessionCount(t.db, user.userNo)).toBe(0)
    const row = await userRow(t.db, user.userNo)
    expect(await verifyPassword(row.password, temporaryPassword)).toBe(true)
    expect(await verifyPassword(row.password, user.password)).toBe(false)
    expect(row).toMatchObject({
      isPasswordChangeRequired: true,
      loginFailCount: 0,
      lockUntil: null,
      revision: 0,
    })
    expect(row.updateAt.toISOString()).toBe(PAST.toISOString())
  })

  it('본인 403 selfAccount · 넓은 계정 403 · 없는 사용자 404 — 비밀번호 그대로', async () => {
    const me = await seedUser(t.db, { roleNo: plainRole, userId: 'p-self' })
    const self = await rejection(() =>
      service.resetPassword(me.userNo, {}, testPrincipal(me.userNo, ['*'])),
    )
    expect(self.message).toBe(ACCOUNT_MESSAGES.selfAccount)
    expect(await verifyPassword((await userRow(t.db, me.userNo)).password, me.password)).toBe(true)

    const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'p-wide' })
    const higher = await rejection(() => service.resetPassword(wide.userNo, {}, manager))
    expect(higher.message).toBe(ACCOUNT_MESSAGES.higherAccount)
    expect(higher.details).toEqual({ outside: ['org.roles:read', 'org.roles:write'] })

    expect((await rejection(() => service.resetPassword(999_999n, {}, root))).code).toBe(
      CommonErrorCodes.ERR_NO_USER,
    )
  })
})

describe('unlock', () => {
  it('잠긴 계정의 카운터 · 잠금을 풀고 이전 값을 돌려준다 — revision · updateAt 그대로', async () => {
    const user = await locked('p-unlock')
    const before = await userRow(t.db, user.userNo)
    const previous = await service.unlock(user.userNo, {}, root)
    expect(previous).toEqual({ lockUntil: before.lockUntil, loginFailCount: 5 })
    const row = await userRow(t.db, user.userNo)
    expect(row).toMatchObject({ loginFailCount: 0, lockUntil: null, revision: 0 })
    expect(row.updateAt.toISOString()).toBe(PAST.toISOString())
  })

  it('잠기지 않아도 된다(B16 — 멱등) · 본인 403 · 넓은 계정 403', async () => {
    const free = await seedUser(t.db, { roleNo: plainRole, userId: 'p-free' })
    expect(await service.unlock(free.userNo, {}, root)).toEqual({
      lockUntil: null,
      loginFailCount: 0,
    })
    expect(
      (await rejection(() => service.unlock(free.userNo, {}, testPrincipal(free.userNo, ['*']))))
        .message,
    ).toBe(ACCOUNT_MESSAGES.selfAccount)
    const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'p-wide-unlock' })
    expect((await rejection(() => service.unlock(wide.userNo, {}, manager))).message).toBe(
      ACCOUNT_MESSAGES.higherAccount,
    )
  })
})

describe('재인증(reauth: true)', () => {
  it('틀리면 403 ERR_REAUTH_REQUIRED 이고 쓰지 않는다, 맞으면 쓴다 — 끄면 묻지 않는다', async () => {
    const reauth = new FakeReauth()
    const guarded = new AdminUsersService(
      t.db,
      usersConfig(true),
      new AdminSessionStore(t.db),
      reauth as unknown as AdminReauthService,
    )
    const user = await locked('p-reauth')
    const wrong = await rejection(() =>
      guarded.resetPassword(user.userNo, { currentPassword: 'nope' }, root),
    )
    expect(wrong.code).toBe(CommonErrorCodes.ERR_REAUTH_REQUIRED)
    expect(await verifyPassword((await userRow(t.db, user.userNo)).password, user.password)).toBe(
      true,
    )
    await guarded.unlock(user.userNo, { currentPassword: 'right-password' }, root)
    await guarded.create(
      {
        userId: 'p-reauth-new',
        userName: '재인증',
        roleNo: plainRole,
        teamNo: null,
        currentPassword: 'right-password',
      },
      root,
    )
    expect(reauth.calls).toEqual(['nope', 'right-password', 'right-password'])

    const silent = new FakeReauth()
    const open = new AdminUsersService(
      t.db,
      usersConfig(false),
      new AdminSessionStore(t.db),
      silent as unknown as AdminReauthService,
    )
    await open.unlock(user.userNo, { currentPassword: 'anything' }, root)
    expect(silent.calls).toEqual([])
  })
})
