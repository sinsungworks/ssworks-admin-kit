import { CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { ipAccessConfig, ipRulesOf, resetIpRules, seedIpRule } from '../test-support/ip-access.js'
import { failure } from '../test-support/errors.js'
import { AdminUsersService } from '../users/users.service.js'
import { AdminIpAccessService } from './ip-access.service.js'

// IP 쓰기의 잔존(2f-1 스펙 ② R1 · §9-2 s1 · s3 · s4 · s5 — s2 는 accounts/super-admin.ip.db.test.ts). 🔴 셈은 DB 전역 상태라
// beforeEach 가 규칙을 시드 두 행으로 되돌리고 star 역할의 전권자를 모두 퇴사시켜 테스트마다 "전권자 없음" 에서 시작한다. 요청자는 일반 관리자(전권 아님)다.

let t: TestDatabase
let star: bigint
let service: AdminIpAccessService
let requester: bigint
const REQUESTER_IP = '203.0.113.9'
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
  star = await seedRole(t.db, { roleName: 'sv-star', permissions: ['*'] })
  const plain = await seedRole(t.db, { roleName: 'sv-plain', permissions: [] })
  requester = (await seedUser(t.db, { roleNo: plain, userId: 'sv-requester' })).userNo
  service = new AdminIpAccessService(t.db, ipAccessConfig(), undefined)
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
  await t.db
    .updateTable('users')
    .set({ resignAt: new Date(Date.now() - 60_000) })
    .where('roleNo', '=', star)
    .where('resignAt', 'is', null)
    .execute()
})

const me = () => testPrincipal(requester, ['setting.ipAccess:write'])

describe('IP 쓰기의 잔존', () => {
  it('🔴 (s1) 시나리오 A — 마지막 도달 가능 전권자에게 user 규칙이면 409, 쓰지 않는다 · 전권자가 둘이면 된다', async () => {
    const last = await seedUser(t.db, { roleNo: star, userId: 'sv-a-last' })
    const error = await failure(
      service.create(
        { scopeType: 'user', scopeRefNo: last.userNo, cidr: '10.0.0.0/8' },
        me(),
        REQUESTER_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await ipRulesOf(t.db)).toHaveLength(2)
    await seedUser(t.db, { roleNo: star, userId: 'sv-a-second' })
    await service.create(
      { scopeType: 'user', scopeRefNo: last.userNo, cidr: '10.0.0.0/8' },
      me(),
      REQUESTER_IP,
    )
  })

  it('🔴 (s3) 마지막 global 행 삭제 — 요청자는 user 규칙으로 살아 있어도 잔존 409', async () => {
    await seedUser(t.db, { roleNo: star, userId: 'sv-c-star' })
    const [v4, v6] = await resetIpRules(t.db, [
      { scopeType: 'global', cidr: '0.0.0.0/0' },
      { scopeType: 'global', cidr: '::/0' },
      { scopeType: 'user', scopeRefNo: requester, cidr: '203.0.113.0/24' },
    ])
    await service.remove(v6!, { revision: 0 }, me(), REQUESTER_IP)
    const error = await failure(service.remove(v4!, { revision: 0 }, me(), REQUESTER_IP))
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect((await ipRulesOf(t.db)).map((row) => row.cidr)).toContain('0.0.0.0/0')
  })

  it('(s4) 이미 0(전권자 전원이 user 규칙) — 다른 IP 쓰기가 막히지 않는다', async () => {
    const pinned = await seedUser(t.db, { roleNo: star, userId: 'sv-d-pinned' })
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: pinned.userNo, cidr: '10.0.0.0/8' })
    const team = await seedTeam(t.db, 'sv-d-team')
    await service.create(
      { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8' },
      me(),
      REQUESTER_IP,
    )
  })

  it('🔴 (s5) IP 모듈 없음 — 규칙을 다 지운 DB 에서도 셈이 재직 ∧ * 라 마지막 전권자 퇴사가 409(토큰이 있으면 이미 0 이라 통과)', async () => {
    const lastPlain = await seedUser(t.db, { roleNo: star, userId: 'sv-e-last' })
    await resetIpRules(t.db, [])
    const users = (ipAware: boolean) =>
      new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined, ipAware)
    const error = await failure(
      users(false).resign(lastPlain.userNo, { resignDate: '2030-01-31' }, root),
    )
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    await users(true).resign(lastPlain.userNo, { resignDate: '2030-01-31' }, root)
  })
})
