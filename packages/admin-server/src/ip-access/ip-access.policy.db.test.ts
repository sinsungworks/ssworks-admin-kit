import { Logger } from '@nestjs/common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { resetIpRules } from '../test-support/ip-access.js'
import { IP_POLICY_WARNINGS, IpAccessPolicy } from './ip-access.policy.js'

// 진단 경고(2f-2a 스펙 A15 · ④ W1) — 매 인증 요청이 부르므로 인스턴스당 한 번씩만 남고 주소를 싣지 않는다.

let t: TestDatabase
let userNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  const roleNo = await seedRole(t.db, { roleName: '진단', permissions: ['user:read'] })
  userNo = (await seedUser(t.db, { roleNo })).userNo
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('IpAccessPolicy 진단 경고', () => {
  it('클라이언트 IP 가 null 이라 막으면 한 번만 경고한다 — 주소가 있으면 경고하지 않는다', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const policy = new IpAccessPolicy(t.db)
    expect(await policy.allows({ clientIp: '198.51.100.1', userNo, teamNos: [] })).toBe(true)
    expect(warn).not.toHaveBeenCalled()
    expect(await policy.allows({ clientIp: null, userNo, teamNos: [] })).toBe(false)
    expect(await policy.allows({ clientIp: null, userNo, teamNos: [] })).toBe(false)
    expect(warn.mock.calls).toEqual([[IP_POLICY_WARNINGS.nullClientIp]])
  })

  it('global 층 규칙이 없으면 한 번만 경고한다', async () => {
    await resetIpRules(t.db, [{ scopeType: 'user', scopeRefNo: userNo, cidr: '10.0.0.0/8' }])
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const policy = new IpAccessPolicy(t.db)
    expect(await policy.allows({ clientIp: '10.1.1.1', userNo, teamNos: [] })).toBe(true)
    expect(await policy.allows({ clientIp: '10.1.1.1', userNo, teamNos: [] })).toBe(true)
    expect(warn.mock.calls).toEqual([[IP_POLICY_WARNINGS.noGlobalRule]])
  })

  it('경고 문구에 주소를 싣지 않는다', () => {
    expect(Object.values(IP_POLICY_WARNINGS).join(' ')).not.toMatch(/[0-9]+[.][0-9]+[.]/)
  })
})
