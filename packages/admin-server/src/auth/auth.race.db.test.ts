import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createAuthKit,
  fakeRequest,
  seedRole,
  seedUser,
  type SeededUser,
} from '../test-support/auth.js'
import { settle, snapshotKysely, whileHeld, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AUTH_MESSAGES } from './errors.js'

// 인증 경로 ∥ 사용자 쓰기(2f-2a 스펙 §9-2). 원시 연결이 사용자 쓰기를 흉내 낸다 — 즉시 퇴사 · 비밀번호 초기화는 users 를
// 잠그고 바꾼 뒤 그 사용자의 세션을 끊는다(users X → 세션 X), 본인 비밀번호 변경은 users 를 바꾼 뒤 다른 세션을 끊는다.
// 🔴 afterReached 가 "잠근 뒤 세션을 끊는" 둘째 문장이다 — 예전 순서(회전이 옛 세션 X 를 쥐고 FK 검사에서 users S 를 기다림)면
//    이 문장이나 회전 중 하나가 교착 1213 이다(스펙 §14 R1-①).

let t: TestDatabase
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db, { roleName: '경합', permissions: ['user:read'] })
})

afterAll(async () => {
  await t?.drop()
})

const past = () => new Date(Date.now() - 60_000)

/** 기본 키트(t.db)로 로그인 — 세션 하나 */
async function signIn(user?: SeededUser) {
  const kit = createAuthKit(t, { policy: false })
  const seeded = user ?? (await seedUser(t.db, { roleNo }))
  const tokens = await kit.service.login(
    { userId: seeded.userId, password: seeded.password },
    fakeRequest(),
  )
  const sessionNo = kit.tokens.verify(tokens.accessToken, new Date()).sessionNo
  return { user: seeded, tokens, sessionNo }
}

const lockUser = (userNo: bigint) => (connection: Connection) =>
  connection.query('select user_no from users where user_no = ? for update', [userNo])

/** 그 사용자의 살아 있는 세션을 끊는다 — exceptSessionNo 는 남긴다(본인 비밀번호 변경) */
const revokeSessions =
  (userNo: bigint, exceptSessionNo: bigint = 0n) =>
  (connection: Connection) =>
    connection.query(
      "update sessions set is_revoked = 1, revoked_reason = 'terminated', revoked_at = ? where user_no = ? and session_no <> ? and is_revoked = 0",
      [new Date(), userNo, exceptSessionNo],
    )

async function sessionRows(userNo: bigint) {
  return t.db
    .selectFrom('sessions')
    .select(['sessionNo', 'isRevoked', 'revokedReason'])
    .where('userNo', '=', userNo)
    .orderBy('sessionNo')
    .execute()
}

function codeOf(result: Settled<unknown>): string {
  if (result.ok) return 'ok'
  return result.error instanceof BusinessError ? result.error.code : String(result.error)
}

function messageOf(result: Settled<unknown>): string | undefined {
  return !result.ok && result.error instanceof BusinessError ? result.error.message : undefined
}

describe('회전 ∥ 사용자 쓰기 — 2d R10-3', () => {
  it.each([false, true])(
    '🔴 (R1) 즉시 퇴사(users 잠금 → 세션 폐기) ∥ refresh — 교착 없이 403 퇴사, 새 세션 없음(스냅샷 격리 %s)',
    async (snapshot) => {
      const db = await snapshotKysely(t, snapshot)
      try {
        const kit = createAuthKit(t, { policy: false, db })
        const { user, tokens, sessionNo } = await signIn()
        const result = await whileHeld(
          t,
          async (connection) => {
            await lockUser(user.userNo)(connection)
            await connection.query('update users set resign_at = ? where user_no = ?', [
              past(),
              user.userNo,
            ])
          },
          () => kit.service.refresh(tokens.refreshToken, fakeRequest()),
          { expectWait: true, afterReached: revokeSessions(user.userNo) },
        )
        expect(result.afterReached?.ok).toBe(true)
        expect(codeOf(result)).toBe(CommonErrorCodes.ERR_RESIGNED_USER)
        expect(await sessionRows(user.userNo)).toEqual([
          { sessionNo, isRevoked: true, revokedReason: 'terminated' },
        ])
      } finally {
        await db.destroy()
      }
    },
  )

  it('🔴 (R2) 비밀번호 초기화(users 잠금 → 새 해시 → 세션 폐기) ∥ refresh — 교착 없이 401 refreshEnded', async () => {
    const kit = createAuthKit(t, { policy: false })
    const { user, tokens, sessionNo } = await signIn()
    const result = await whileHeld(
      t,
      async (connection) => {
        await lockUser(user.userNo)(connection)
        await connection.query(
          "update users set password = 'reset-hash', is_password_change_required = 1, login_fail_count = 0, lock_until = null where user_no = ?",
          [user.userNo],
        )
      },
      () => kit.service.refresh(tokens.refreshToken, fakeRequest()),
      { expectWait: true, afterReached: revokeSessions(user.userNo) },
    )
    expect(result.afterReached?.ok).toBe(true)
    expect(codeOf(result)).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(messageOf(result)).toBe(AUTH_MESSAGES.refreshEnded)
    expect(await sessionRows(user.userNo)).toEqual([
      { sessionNo, isRevoked: true, revokedReason: 'terminated' },
    ])
  })

  it('🔴 (R3) 본인 비밀번호 변경(users 갱신 → 다른 세션 폐기) ∥ 다른 세션의 refresh — 교착 없이 401 refreshEnded, 현재 세션은 산다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const first = await signIn()
    const other = await signIn(first.user)
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query("update users set password = 'changed-hash' where user_no = ?", [
          first.user.userNo,
        ]),
      () => kit.service.refresh(other.tokens.refreshToken, fakeRequest()),
      { expectWait: true, afterReached: revokeSessions(first.user.userNo, first.sessionNo) },
    )
    expect(result.afterReached?.ok).toBe(true)
    expect(codeOf(result)).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    expect(messageOf(result)).toBe(AUTH_MESSAGES.refreshEnded)
    expect((await sessionRows(first.user.userNo)).map((row) => row.isRevoked)).toEqual([
      false,
      true,
    ])
  })

  it('(R4) 같은 사용자 두 세션의 refresh 를 동시에 — 공유 잠금끼리 막지 않아 둘 다 회전한다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const first = await signIn()
    const second = await signIn(first.user)
    const results = await Promise.all([
      settle(kit.service.refresh(first.tokens.refreshToken, fakeRequest())),
      settle(kit.service.refresh(second.tokens.refreshToken, fakeRequest())),
    ])
    expect(results.map(codeOf)).toEqual(['ok', 'ok'])
    const rows = await sessionRows(first.user.userNo)
    expect(rows.filter((row) => !row.isRevoked)).toHaveLength(2)
    expect(rows.filter((row) => row.revokedReason === 'rotated')).toHaveLength(2)
  })

  it('Review Focus 3 — 같은 사용자의 로그인 확정(users X)이 쥔 동안의 refresh 는 기다렸다 회전한다', async () => {
    const kit = createAuthKit(t, { policy: false })
    const { user, tokens } = await signIn()
    const result = await whileHeld(
      t,
      lockUser(user.userNo),
      () => kit.service.refresh(tokens.refreshToken, fakeRequest()),
      { expectWait: true },
    )
    expect(codeOf(result)).toBe('ok')
  })
})
