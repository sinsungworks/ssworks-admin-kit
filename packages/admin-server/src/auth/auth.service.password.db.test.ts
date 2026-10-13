import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  createAuthKit,
  fakeRequest,
  seedRole,
  seedUser,
  type AuthKit,
} from '../test-support/auth.js'
import { AdminAuthService } from './auth.service.js'
import { AUTH_MESSAGES } from './errors.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'
import { hashPassword } from './password.js'
import type { AdminPrincipal } from './principal.js'

let t: TestDatabase
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db)
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(promise: Promise<unknown>): Promise<BusinessError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('거부되지 않았다')
}

const later = (ms: number) => new Date(Date.now() + ms)

async function signedIn(kit: AuthKit, input: Parameters<typeof seedUser>[1] = { roleNo }) {
  const user = await seedUser(t.db, input)
  const tokens = await kit.service.login(
    { userId: user.userId, password: user.password },
    fakeRequest(),
  )
  const principal: AdminPrincipal = await kit.service.authenticate(
    tokens.accessToken,
    fakeRequest(),
  )
  return { user, tokens, principal }
}

async function failCount(kit: AuthKit, userNo: bigint): Promise<number> {
  return (await kit.repo.findCredentialByNo(userNo))!.loginFailCount
}

describe('changePassword', () => {
  it('🔴 틀린 현재 비밀번호 — 400 ERR_COMMON_VALIDATION + issues[currentPassword], 카운터 +1(3c W1 · 스펙 B2)', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    const error = await rejection(
      kit.service.changePassword(
        principal,
        { currentPassword: 'wrong', newPassword: 'brand-new-pass' },
        fakeRequest(),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(error.details).toEqual({
      issues: [
        {
          path: ['currentPassword'],
          code: 'custom',
          message: AUTH_MESSAGES.currentPasswordMismatch,
        },
      ],
    })
    expect(await failCount(kit, user.userNo)).toBe(1)
  })

  it('잠긴 계정 — 423, 검증하지 않아 카운터가 그대로', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 5, lockUntil: later(60_000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(
      kit.service.changePassword(
        principal,
        { currentPassword: user.password, newPassword: 'brand-new-pass' },
        fakeRequest(),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_ACCOUNT_LOCKED)
    expect(await failCount(kit, user.userNo)).toBe(5)
  })

  it('성공 — 새 비밀번호로만 로그인 · 플래그 해제 · 카운터 0 · 다른 세션 terminated · 현재 세션 유지 · password.change', async () => {
    const kit = createAuthKit(t)
    const { user, tokens, principal } = await signedIn(kit, {
      roleNo,
      isPasswordChangeRequired: true,
      loginFailCount: 2,
    })
    const other = await kit.service.login(
      { userId: user.userId, password: user.password },
      fakeRequest(),
    )
    const rotatedFrom = await kit.service.login(
      { userId: user.userId, password: user.password },
      fakeRequest(),
    )
    await kit.service.refresh(rotatedFrom.refreshToken, fakeRequest())

    await kit.service.changePassword(
      principal,
      { currentPassword: user.password, newPassword: 'brand-new-pass' },
      fakeRequest(),
    )

    expect(await kit.repo.findCredentialByNo(user.userNo)).toMatchObject({
      isPasswordChangeRequired: false,
      loginFailCount: 0,
      lockUntil: null,
    })
    await expect(
      kit.service.login({ userId: user.userId, password: 'brand-new-pass' }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
    const old = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(old.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)

    const otherError = await rejection(kit.service.refresh(other.refreshToken, fakeRequest()))
    expect(otherError.code).toBe(CommonErrorCodes.ERR_INVALID_TOKEN)
    await expect(
      kit.service.authenticate(tokens.accessToken, fakeRequest()),
    ).resolves.toMatchObject({
      sessionNo: principal.sessionNo,
    })
    const rotatedRow = await t.db
      .selectFrom('sessions')
      .select('revokedReason')
      .where('userNo', '=', user.userNo)
      .where('revokedReason', '=', 'rotated')
      .execute()
    expect(rotatedRow).toHaveLength(1)
    expect(kit.events.events.find((event) => event.type === 'password.change')).toEqual({
      type: 'password.change',
      userNo: user.userNo,
      sessionNo: principal.sessionNo,
      revokedCount: 2,
    })
  })

  it('🔴 검증 뒤 다른 쓰기가 먼저 해시를 바꿨으면 409 ERR_COMMON_CONFLICT — 아무것도 바뀌지 않는다', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    const staleHash = await hashPassword(user.password)

    class StaleRepository extends KyselyAuthRepository {
      override async findCredentialByNo(userNo: bigint) {
        const row = await super.findCredentialByNo(userNo)
        return row == null ? null : { ...row, passwordHash: staleHash }
      }
    }

    const service = new AdminAuthService(
      kit.config,
      new StaleRepository(t.db),
      kit.store,
      kit.tokens,
      t.db,
    )
    const error = await rejection(
      service.changePassword(
        principal,
        { currentPassword: user.password, newPassword: 'brand-new-pass' },
        fakeRequest(),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(AUTH_MESSAGES.passwordConflict)
    await expect(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    ).resolves.toHaveProperty('accessToken')
  })
})

describe('AdminReauthService', () => {
  it('틀리면 403 ERR_REAUTH_REQUIRED + 카운터 +1, 맞으면 카운터를 되돌린다', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    const error = await rejection(kit.reauth.verify(principal, 'wrong'))
    expect(error.code).toBe(CommonErrorCodes.ERR_REAUTH_REQUIRED)
    expect(error.message).toBe(AUTH_MESSAGES.reauthFailed)
    expect(await failCount(kit, user.userNo)).toBe(1)
    await kit.reauth.verify(principal, user.password)
    expect(await failCount(kit, user.userNo)).toBe(0)
  })

  it('잠긴 계정은 423', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 5, lockUntil: later(60_000) })
      .where('userNo', '=', user.userNo)
      .execute()
    const error = await rejection(kit.reauth.verify(principal, user.password))
    expect(error.code).toBe(CommonErrorCodes.ERR_ACCOUNT_LOCKED)
  })
})

describe('🔴 비밀번호 확인 세 자리가 카운터 하나를 쓴다(스펙 B2)', () => {
  it('로그인 2 + 변경 2 + 재인증 1 = 5회 → 잠김 → 맞은 비밀번호로도 로그인 423', async () => {
    const kit = createAuthKit(t)
    const { user, principal } = await signedIn(kit)
    for (let i = 0; i < 2; i += 1) {
      await rejection(kit.service.login({ userId: user.userId, password: 'wrong' }, fakeRequest()))
      await rejection(
        kit.service.changePassword(
          principal,
          { currentPassword: 'wrong', newPassword: 'brand-new-pass' },
          fakeRequest(),
        ),
      )
    }
    await rejection(kit.reauth.verify(principal, 'wrong'))
    expect(await failCount(kit, user.userNo)).toBe(5)
    const error = await rejection(
      kit.service.login({ userId: user.userId, password: user.password }, fakeRequest()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_ACCOUNT_LOCKED)
  })
})
