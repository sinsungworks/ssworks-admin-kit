import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { countSuperAdmins } from '../accounts/super-admin.js'
import { testPrincipal } from '../test-support/accounts.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  PROBE_SCOPE,
  createProbeTokens,
  ipAccessConfig,
  probeScope,
  resetIpRules,
  seedIpRule,
  seedProbeToken,
  seedSessionFrom,
} from '../test-support/ip-access.js'
import { AdminIpExtraScopeService } from './extra-scope.service.js'
import { IpAccessPolicy } from './ip-access.policy.js'
import { AdminIpAccessService } from './ip-access.service.js'

// R3 분리 보장(확장 범위 스펙 §2-2 #2 · §4-5 · §10-3). 🔴 두 방향 모두 — 확장 규칙이 관리자 판정에, 코어 규칙이 확장 판정에
// 쓰이지 않는다. 확장 규칙의 번호를 관리자의 userNo 와 일부러 같게 둔다(다형 참조가 섞이는지 본다).

let t: TestDatabase
let ip: AdminIpAccessService
let extra: AdminIpExtraScopeService
let policy: IpAccessPolicy
let superAdmin: SeededUser
let staff: SeededUser
let token: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  await createProbeTokens(t.db)
  token = await seedProbeToken(t.db, '작업대 1')
  const config = ipAccessConfig(false, 'req.ip', { extraScopes: [probeScope()] })
  ip = new AdminIpAccessService(t.db, config, undefined)
  extra = new AdminIpExtraScopeService(t.db, config)
  policy = new IpAccessPolicy(t.db)
  const all = await seedRole(t.db, { roleName: 'sep-super', permissions: ['*'] })
  const plain = await seedRole(t.db, { roleName: 'sep-plain', permissions: [] })
  superAdmin = await seedUser(t.db, { roleNo: all, userId: 'sep-super' })
  staff = await seedUser(t.db, { roleNo: plain, userId: 'sep-staff' })
  await seedSessionFrom(t.db, staff.userNo, '203.0.113.9')
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

/** 관리자 userNo 와 같은 번호 · 범위 전체를 가리키는 좁은 확장 규칙 — 관리자 층으로 읽히면 모두 잠긴다 */
async function seedShadowingExtraRules(): Promise<void> {
  for (const scopeRefNo of [superAdmin.userNo, staff.userNo, token, null]) {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo, cidr: '192.0.2.0/24' })
  }
}

describe('🔴 R3a — 확장 규칙은 관리자 판정에 쓰이지 않는다', () => {
  it('정책(로그인 · 매 요청 · 갱신이 부르는 판정)이 그대로다', async () => {
    const context = { clientIp: '203.0.113.9', userNo: staff.userNo, teamNos: [] }
    expect(await policy.allows(context)).toBe(true)
    await seedShadowingExtraRules()
    expect(await policy.allows(context)).toBe(true)
  })

  it('확장 규칙의 0.0.0.0/0 은 관리자를 통과시키지 않는다 — 코어 규칙이 없으면 거부', async () => {
    await resetIpRules(t.db, [
      { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' },
      { scopeType: PROBE_SCOPE, scopeRefNo: staff.userNo, cidr: '0.0.0.0/0' },
    ])
    expect(
      await policy.allows({ clientIp: '203.0.113.9', userNo: staff.userNo, teamNos: [] }),
    ).toBe(false)
  })

  it('전권자 잔존 셈이 그대로다', async () => {
    const count = () =>
      t.db.transaction().execute((trx) => countSuperAdmins(trx, { ipAware: true }))
    const before = await count()
    expect(before).toBe(1)
    await seedShadowingExtraRules()
    expect(await count()).toBe(before)
  })

  it('코어 쓰기의 자기 잠금 판정이 그대로다 — 확장 규칙이 요청자를 가리켜도 코어 쓰기가 된다', async () => {
    await seedShadowingExtraRules()
    const { item } = await ip.create(
      { scopeType: 'global', scopeRefNo: null, cidr: '198.51.100.0/24' },
      testPrincipal(staff.userNo, ['setting.ipAccess:write']),
      '203.0.113.9',
    )
    expect(item.scopeType).toBe('global')
  })

  it('미리보기의 요약 · 항목이 그대로다', async () => {
    const principal = testPrincipal(superAdmin.userNo, ['*'])
    const before = await ip.preview({}, principal, '203.0.113.9')
    await seedShadowingExtraRules()
    const after = await ip.preview({}, principal, '203.0.113.9')
    expect(after.summary).toEqual(before.summary)
    expect(after.items).toEqual(before.items)
    expect(after.clientPasses).toBe(before.clientPasses)
  })
})

describe('🔴 R3b — 코어 규칙은 확장 판정에 쓰이지 않는다', () => {
  it('global 시드 · 사용자 규칙(토큰 번호와 같은 번호)이 있어도 확장 규칙이 없으면 거부', async () => {
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: token, cidr: '0.0.0.0/0' })
    expect(await extra.allows(PROBE_SCOPE, token, '203.0.113.9')).toBe(false)
    expect(await extra.allows(PROBE_SCOPE, token, '2001:db8::1')).toBe(false)
  })

  it('확장 규칙을 더하면 그것만으로 판정한다', async () => {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '203.0.113.0/24' })
    expect(await extra.allows(PROBE_SCOPE, token, '203.0.113.9')).toBe(true)
    expect(await extra.allows(PROBE_SCOPE, token, '198.51.100.1')).toBe(false)
  })
})
