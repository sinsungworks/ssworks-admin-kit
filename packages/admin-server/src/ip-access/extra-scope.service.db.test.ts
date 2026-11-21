import type { Request } from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  PROBE_SCOPE,
  createProbeTokens,
  ipAccessConfig,
  probeScope,
  resetIpRules,
  seedIpRule,
  seedProbeToken,
} from '../test-support/ip-access.js'
import { AdminIpExtraScopeService } from './extra-scope.service.js'

// 쓰는 쪽 판정 서비스(확장 범위 스펙 §4-6 · R2 · R3b · R4b · R8). 🔴 규칙은 DB 전역 상태 — beforeEach 로 시드 두 행만 남긴다.

let t: TestDatabase
let service: AdminIpExtraScopeService
let token: bigint
let other: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  await createProbeTokens(t.db)
  token = await seedProbeToken(t.db, '작업대 1')
  other = await seedProbeToken(t.db, '작업대 2')
  service = new AdminIpExtraScopeService(
    t.db,
    ipAccessConfig(false, 'req.ip', {
      extraScopes: [probeScope(), probeScope({ type: 'probeNoWhole', wholeScope: false })],
    }),
  )
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

describe('allows — 두 층 판정', () => {
  it('🔴 R3b — global 시드(0.0.0.0/0 · ::/0)만 있으면 어디서도 거부', async () => {
    expect(await service.allows(PROBE_SCOPE, token, '203.0.113.9')).toBe(false)
    expect(await service.allows(PROBE_SCOPE, token, '2001:db8::1')).toBe(false)
    expect(await service.rulesOf(PROBE_SCOPE)).toEqual([])
  })

  it('대상 층 · 🔴 가장 가까운 층 하나 · 범위 전체 층', async () => {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' })
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '203.0.113.0/24' })
    expect(await service.allows(PROBE_SCOPE, token, '203.0.113.9')).toBe(true)
    expect(await service.allows(PROBE_SCOPE, token, '192.0.2.1')).toBe(false)
    expect(await service.allows(PROBE_SCOPE, other, '192.0.2.1')).toBe(true)
  })

  it('🔴 주소가 null 이면 거부', async () => {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' })
    expect(await service.allows(PROBE_SCOPE, token, null)).toBe(false)
  })

  it('🔴 wholeScope: false — 범위 전체 행은 판정 · 읽기에서 빠진다', async () => {
    await seedIpRule(t.db, { scopeType: 'probeNoWhole', scopeRefNo: null, cidr: '0.0.0.0/0' })
    await seedIpRule(t.db, { scopeType: 'probeNoWhole', scopeRefNo: other, cidr: '10.0.0.0/8' })
    expect(await service.allows('probeNoWhole', token, '203.0.113.9')).toBe(false)
    expect(await service.rulesOf('probeNoWhole')).toEqual([
      { scopeType: 'probeNoWhole', scopeRefNo: other, cidr: '10.0.0.0/8' },
    ])
  })

  it('🔴 등록되지 않은 범위 · 코어 이름은 던진다(설정 오류 — fail-closed)', async () => {
    await expect(service.allows('gone', token, '203.0.113.9')).rejects.toThrow(
      '등록되지 않은 확장 범위다',
    )
    await expect(service.rulesOf('global')).rejects.toThrow('등록되지 않은 확장 범위다')
  })
})

describe('countRulesOf · clientIpOf', () => {
  it('그 대상 번호의 행만 센다 — 쓰는 쪽 트랜잭션 안에서도', async () => {
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '203.0.113.0/24' })
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '198.51.100.0/24' })
    await seedIpRule(t.db, { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '0.0.0.0/0' })
    expect(await service.countRulesOf(PROBE_SCOPE, token)).toBe(2)
    expect(await service.countRulesOf(PROBE_SCOPE, other)).toBe(0)
    const inside = await t.db
      .transaction()
      .execute((trx) => service.countRulesOf(PROBE_SCOPE, token, trx))
    expect(inside).toBe(2)
  })

  it('clientIpOf — 관리자 판정과 같은 출처 · 정규화', () => {
    const req = { ip: '::ffff:203.0.113.9', headers: {} } as unknown as Request
    expect(service.clientIpOf(req)).toBe('203.0.113.9')
  })
})
