import { CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminDatabase } from '../database/types.js'
import { RecordingEvents, SwitchablePolicy, fakeRequest } from '../test-support/auth.js'
import { failure } from '../test-support/errors.js'
import { AdminAccessTokenService } from './access-token.service.js'
import type { AdminAuthRepository, AdminCredential } from './auth.repository.js'
import { AdminAuthService } from './auth.service.js'
import { AUTH_MESSAGES } from './errors.js'
import { resolveAuthConfig } from './options.js'
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password.js'
import type { AdminSessionStore } from './session.store.js'

// 🔴 막힌 주소 · 없는 계정의 로그인은 실제 해시를 보지 않고 더미 argon2 를 한 번 태운다(2f-2a 스펙 A4 · §14 R2-②) — 응답
//    시간이 틀린 비밀번호와 같아 계정 · 정답이 드러나지 않는다. argon2 호출을 세려고 password 모듈의 verifyPassword 를 갈아 끼운다.
vi.mock('./password.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyPassword: vi.fn(async () => true),
}))

const config = resolveAuthConfig({ jwtSecret: 's'.repeat(32) }, undefined, undefined, undefined)

const credential: AdminCredential = {
  userNo: 7n,
  passwordHash: 'real-hash',
  resignAt: null,
  loginFailCount: 2,
  lockUntil: null,
  isPasswordChangeRequired: false,
}

function fakeRepo(found: AdminCredential | null) {
  return {
    findCredentialByUserId: vi.fn(async () => found),
    findCredentialByNo: vi.fn(async () => found),
    findPrincipal: vi.fn(async () => null),
    lockCredential: vi.fn(async () => found),
    writeLoginState: vi.fn(async () => undefined),
    changePassword: vi.fn(async () => 0),
  } satisfies AdminAuthRepository
}

function service(
  repo: AdminAuthRepository,
  policy: SwitchablePolicy | undefined,
  events: RecordingEvents,
) {
  return new AdminAuthService(
    config,
    repo,
    {} as AdminSessionStore,
    new AdminAccessTokenService(config),
    {} as Kysely<AdminDatabase>,
    policy,
    events,
  )
}

beforeEach(() => {
  vi.mocked(verifyPassword).mockClear()
})

describe('login — 비밀번호를 보기 전에 끝나는 갈래', () => {
  it('🔴 막힌 주소 — 더미 해시로 한 번만 확인하고 카운터 · 잠금 읽기를 건드리지 않는다, 401 · login.blocked:ip', async () => {
    const repo = fakeRepo(credential)
    const policy = new SwitchablePolicy()
    policy.allow = false
    const events = new RecordingEvents()
    const error = await failure(
      service(repo, policy, events).login(
        { userId: 'u7', password: 'typed' },
        fakeRequest({ ip: '203.0.113.9' }),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    expect(error.details).toBeUndefined()
    expect(vi.mocked(verifyPassword).mock.calls).toEqual([[DUMMY_PASSWORD_HASH, 'typed']])
    expect(repo.lockCredential).not.toHaveBeenCalled()
    expect(repo.writeLoginState).not.toHaveBeenCalled()
    expect(policy.calls).toEqual([{ clientIp: '203.0.113.9', userNo: 7n, teamNos: [] }])
    expect(events.types()).toEqual(['login.blocked:ip'])
  })

  it('없는 계정 — 정책을 부르지 않고 더미 해시로 한 번, 정책이 있으면 문구는 loginFailedWithIp', async () => {
    const policy = new SwitchablePolicy()
    const error = await failure(
      service(fakeRepo(null), policy, new RecordingEvents()).login(
        { userId: 'ghost', password: 'typed' },
        fakeRequest(),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_LOGIN_FAILED)
    expect(error.message).toBe(AUTH_MESSAGES.loginFailedWithIp)
    expect(vi.mocked(verifyPassword).mock.calls).toEqual([[DUMMY_PASSWORD_HASH, 'typed']])
    expect(policy.calls).toEqual([])
  })

  it('정책이 없으면 로그인 401 문구는 loginFailed 그대로', async () => {
    const error = await failure(
      service(fakeRepo(null), undefined, new RecordingEvents()).login(
        { userId: 'ghost', password: 'typed' },
        fakeRequest(),
      ),
    )
    expect(error.message).toBe(AUTH_MESSAGES.loginFailed)
  })
})
