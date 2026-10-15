import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { AdminRolesService } from '../roles/roles.service.js'
import { accountsConfig, testPrincipal, usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { holdGuard, underHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { resetIpRules, seedIpRule } from '../test-support/ip-access.js'
import { AdminUsersService } from '../users/users.service.js'
import { ACCOUNT_MESSAGES } from './errors.js'
import { GUARD_LOCK_SUPER_ADMIN, countSuperAdmins } from './super-admin.js'

// IP 를 아는 잔존 셈(2f-1 스펙 ② R1 · P3 · P4 · P5 — hangang A1). 셈은 재직 ∧ '*' ∧ 적용 층이 global. 🔴 셈은 DB 전역 상태라
// 시나리오 테스트는 retireStars 로 이 파일의 전권자를 모두 퇴사시키고 시작한다. 규칙은 beforeEach 로 시드 두 행만 남긴다.

let t: TestDatabase
let star: bigint
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
  star = await seedRole(t.db, { roleName: 'ip-star', permissions: ['*'] })
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

const count = (ipAware: boolean) =>
  t.db.transaction().execute((trx) => countSuperAdmins(trx, { ipAware }))

/** 이 파일의 전권자(star 역할)를 모두 퇴사시킨다 — 시나리오가 "마지막 전권자" 에서 시작하게 */
async function retireStars(): Promise<void> {
  await t.db
    .updateTable('users')
    .set({ resignAt: new Date(Date.now() - 60_000) })
    .where('roleNo', '=', star)
    .where('resignAt', 'is', null)
    .execute()
}

async function failure(promise: Promise<unknown>): Promise<BusinessError> {
  const error = await promise.then(
    () => {
      throw new Error('실패를 기대했다')
    },
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BusinessError)
  return error as BusinessError
}

const users = (ipAware: boolean) =>
  new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined, ipAware)

const teamsOf = async (userNo: bigint) =>
  (
    await t.db
      .selectFrom('teamUserMap')
      .select('teamNo')
      .where('userNo', '=', userNo)
      .orderBy('teamNo')
      .execute()
  ).map((row) => row.teamNo)

describe('countSuperAdmins — ipAware', () => {
  it('🔴 적용 층이 global 인 전권자만 센다 — user 규칙 · 대표 팀의 팀 규칙에 묶인 전권자는 빼고, 무소속은 센다', async () => {
    const beforeIp = await count(true)
    const beforePlain = await count(false)
    const fencedTeam = await seedTeam(t.db, 'cnt-fenced')
    const openTeam = await seedTeam(t.db, 'cnt-open')
    const farTeam = await seedTeam(t.db, 'cnt-far')
    await seedUser(t.db, { roleNo: star, userId: 'cnt-free' })
    const pinned = await seedUser(t.db, { roleNo: star, userId: 'cnt-pinned' })
    const teamed = await seedUser(t.db, { roleNo: star, userId: 'cnt-teamed' })
    // Review Focus 5 — 두 팀에 걸쳤고 큰 번호 팀에만 팀 규칙: 대표 팀(작은 번호)에는 규칙이 없으니 global 이다
    const split = await seedUser(t.db, { roleNo: star, userId: 'cnt-split' })
    await addToTeam(t.db, fencedTeam, teamed.userNo)
    await addToTeam(t.db, openTeam, split.userNo)
    await addToTeam(t.db, farTeam, split.userNo)
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: pinned.userNo, cidr: '10.0.0.0/8' })
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: fencedTeam, cidr: '10.0.0.0/8' })
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: farTeam, cidr: '10.0.0.0/8' })
    expect((await count(true)) - beforeIp).toBe(2)
    expect((await count(false)) - beforePlain).toBe(4)
  })

  it('🔴 global 규칙이 하나도 없으면 IP 를 아는 셈은 0 — IP 모듈이 없는 셈은 규칙을 보지 않는다(P3)', async () => {
    await seedUser(t.db, { roleNo: star, userId: 'cnt-none' })
    await resetIpRules(t.db, [])
    expect(await count(true)).toBe(0)
    expect(await count(false)).toBeGreaterThan(0)
  })
})

describe('사용자 수정의 teamNo — 잔존 지점(P5)', () => {
  it('🔴 teamNo 만 바꾸는 수정도 잔존 가드를 잡는다', async () => {
    const plain = await seedRole(t.db, { roleName: 'tn-plain', permissions: [] })
    const user = await seedUser(t.db, { roleNo: plain, userId: 'tn-guard' })
    const team = await seedTeam(t.db, 'tn-guard-team')
    const { waited, result } = await underHeld(t, holdGuard(GUARD_LOCK_SUPER_ADMIN), () =>
      users(false).update(user.userNo, { teamNo: team, revision: 0 }, root),
    )
    expect(waited).toBe(true)
    if (!result.ok) throw result.error
  })

  it('🔴 시나리오 B — 마지막 도달 가능 전권자를 팀 규칙이 있는 팀으로 옮기면 409, 소속 그대로 · IP 모듈이 없으면 된다', async () => {
    await retireStars()
    const last = await seedUser(t.db, { roleNo: star, userId: 'tn-last' })
    const fenced = await seedTeam(t.db, 'tn-fenced')
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: fenced, cidr: '10.0.0.0/8' })
    const error = await failure(
      users(true).update(last.userNo, { teamNo: fenced, revision: 0 }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await teamsOf(last.userNo)).toEqual([])
    const done = await users(false).update(last.userNo, { teamNo: fenced, revision: 0 }, root)
    expect(done.item.teamNo).toBe(fenced)
  })
})

describe('역할 서비스 — 토큰이 있으면 IP 를 아는 셈(P3)', () => {
  it('🔴 도달 가능한 마지막 전권자의 역할에서 * 를 빼면 409 — user 규칙에 묶인 다른 전권자는 세지 않는다', async () => {
    await retireStars()
    const solo = await seedRole(t.db, { roleName: 'rl-solo', permissions: ['*'] })
    await seedUser(t.db, { roleNo: solo, userId: 'rl-free' })
    const pinned = await seedUser(t.db, { roleNo: star, userId: 'rl-pinned' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: pinned.userNo, cidr: '10.0.0.0/8' })
    const roles = (ipAware: boolean) =>
      new AdminRolesService(t.db, accountsConfig(), undefined, ipAware)
    const error = await failure(roles(true).update(solo, { permissions: [], revision: 0 }, root))
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    // 토큰이 없으면 pinned 도 센다(2 → 1) — 된다
    await roles(false).update(solo, { permissions: [], revision: 0 }, root)
  })
})
