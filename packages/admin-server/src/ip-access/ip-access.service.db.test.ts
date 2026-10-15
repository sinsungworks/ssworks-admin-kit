import { BusinessError, CommonErrorCodes, IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AdminReauthService } from '../auth/reauth.service.js'
import { FakeReauth, testPrincipal } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  ipAccessConfig,
  ipRulesOf,
  resetIpRules,
  seedIpRule,
  seedSessionFrom,
} from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { IpAccessPolicy } from './ip-access.policy.js'
import { AdminIpAccessService } from './ip-access.service.js'

// IP 서비스(2f-1 스펙 §5-3 · §5-6 · §5-7 · §6). 🔴 규칙은 DB 전역 상태 — beforeEach 로 시드 두 행만 남긴다. 요청자(actor)는
// 일반 관리자(전권 아님)라 잔존 셈에 걸리지 않는다 — 잔존은 ip-access.survival.db.test.ts.

let t: TestDatabase
let service: AdminIpAccessService
let plain: bigint
let actor: SeededUser
let other: SeededUser
const ACTOR_IP = '203.0.113.9'

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminIpAccessService(t.db, ipAccessConfig(), undefined)
  plain = await seedRole(t.db, { roleName: 'svc-plain', permissions: [] })
  actor = await seedUser(t.db, { roleNo: plain, userId: 'svc-actor', userName: '규칙 담당' })
  other = await seedUser(t.db, { roleNo: plain, userId: 'svc-other', userName: '다른 사람' })
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

const me = () => testPrincipal(actor.userNo, ['setting.ipAccess:write'])

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

const issueOf = (error: BusinessError) =>
  (error.details as { issues: { path: unknown[]; message: string }[] }).issues.map((issue) => [
    issue.path.join('.'),
    issue.message,
  ])

describe('목록', () => {
  it('시드 두 행 · 정렬 global → team → user · 대상 이름 · 아이디 · ISO 시각', async () => {
    const team = await seedTeam(t.db, 'svc-list-team')
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: actor.userNo, cidr: '203.0.113.0/24' })
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8' })
    const { items } = await service.list()
    expect(
      items.map((item) => [item.scopeType, item.cidr, item.scopeName, item.scopeUserId]),
    ).toEqual([
      ['global', '0.0.0.0/0', null, null],
      ['global', '::/0', null, null],
      ['team', '10.0.0.0/8', 'svc-list-team', null],
      ['user', '203.0.113.0/24', '규칙 담당', 'svc-actor'],
    ])
    expect(items[0]?.createAt).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/)
    expect(items[0]?.revision).toBe(0)
  })
})

describe('만들기', () => {
  it('item 을 돌려준다 — revision 0 · 설명 · 대상 이름', async () => {
    const team = await seedTeam(t.db, 'svc-create-team')
    const { item } = await service.create(
      { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8', description: '사무실' },
      me(),
      ACTOR_IP,
    )
    expect(item).toMatchObject({
      scopeType: 'team',
      scopeRefNo: team,
      scopeName: 'svc-create-team',
      cidr: '10.0.0.0/8',
      description: '사무실',
      revision: 0,
    })
    expect(await ipRulesOf(t.db)).toHaveLength(3)
  })

  it('가리키는 팀 · 사용자가 없으면 400 scopeRefNo · 범위 불변식 위반도 400', async () => {
    const noTeam = await failure(
      service.create(
        { scopeType: 'team', scopeRefNo: 999_999n, cidr: '10.0.0.0/8' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(noTeam.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(issueOf(noTeam)).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTeam]])
    const noUser = await failure(
      service.create(
        { scopeType: 'user', scopeRefNo: 999_999n, cidr: '10.0.0.0/8' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(issueOf(noUser)).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeUser]])
    const forbidden = await failure(
      service.create({ scopeType: 'global', scopeRefNo: 1n, cidr: '10.0.0.0/8' }, me(), ACTOR_IP),
    )
    expect(issueOf(forbidden)).toEqual([
      ['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden],
    ])
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('🔴 자기 잠금 — 요청자 주소를 막는 규칙은 409 + clientIp, 쓰지 않는다', async () => {
    const error = await failure(
      service.create(
        { scopeType: 'user', scopeRefNo: actor.userNo, cidr: '10.0.0.0/8' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(IP_ACCESS_MESSAGES.selfLockout)
    expect(error.details).toEqual({ clientIp: ACTOR_IP })
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('남만 막는 규칙은 된다 · 주소를 모르는 요청자(null)는 늘 자기 잠금이다(fail-closed)', async () => {
    await service.create(
      { scopeType: 'user', scopeRefNo: other.userNo, cidr: '10.0.0.0/8' },
      me(),
      ACTOR_IP,
    )
    const error = await failure(
      service.create({ scopeType: 'global', scopeRefNo: null, cidr: '10.0.0.0/8' }, me(), null),
    )
    expect(error.details).toEqual({ clientIp: null })
  })
})

describe('수정', () => {
  it('revision 409 · 없는 규칙 404', async () => {
    const [v4] = await resetIpRules(t.db)
    const stale = await failure(
      service.update(v4!, { cidr: '0.0.0.0/0', revision: 5 }, me(), ACTOR_IP),
    )
    expect(stale.code).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
    expect(stale.message).toBe(IP_ACCESS_MESSAGES.ruleRevisionMismatch)
    const missing = await failure(service.update(999_999n, { revision: 0 }, me(), ACTOR_IP))
    expect(missing.code).toBe(CommonErrorCodes.ERR_COMMON_NOT_FOUND)
    expect(missing.message).toBe(IP_ACCESS_MESSAGES.ruleNotFound)
  })

  it('🔴 병합 결과의 범위 불변식 — global 행에 scopeType 만 user 로 보내면 400, 그대로', async () => {
    const [v4] = await resetIpRules(t.db)
    const error = await failure(
      service.update(v4!, { scopeType: 'user', revision: 0 }, me(), ACTOR_IP),
    )
    expect(issueOf(error)).toEqual([['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired]])
    expect((await ipRulesOf(t.db))[0]).toMatchObject({ scopeType: 'global', revision: 0 })
  })

  it('성공 — revision + 1 · before · after · 대상 바꾸기(global → team)', async () => {
    const [, v6] = await resetIpRules(t.db)
    const team = await seedTeam(t.db, 'svc-update-team')
    const result = await service.update(
      v6!,
      { scopeType: 'team', scopeRefNo: team, description: '바뀜', revision: 0 },
      me(),
      ACTOR_IP,
    )
    expect(result.item).toMatchObject({ scopeType: 'team', scopeRefNo: team, revision: 1 })
    // resetIpRules 의 시드 행은 설명이 없다(장의 시드 문구가 아니다)
    expect(result.before).toEqual({
      scopeType: 'global',
      scopeRefNo: null,
      cidr: '::/0',
      description: null,
    })
    expect(result.after).toEqual({
      scopeType: 'team',
      scopeRefNo: team,
      cidr: '::/0',
      description: '바뀜',
    })
  })

  it('🔴 자기 잠금 — v4 global 을 요청자 밖으로 좁히면 409, revision 그대로', async () => {
    const [v4] = await resetIpRules(t.db)
    const error = await failure(
      service.update(v4!, { cidr: '10.0.0.0/8', revision: 0 }, me(), ACTOR_IP),
    )
    expect(error.message).toBe(IP_ACCESS_MESSAGES.selfLockout)
    expect((await ipRulesOf(t.db))[0]).toMatchObject({ cidr: '0.0.0.0/0', revision: 0 })
  })
})

describe('삭제', () => {
  it('🔴 요청자 계열(v4)의 global 을 지우면 자기 잠금 409 — 다른 계열(v6)은 지워진다 · before', async () => {
    const [v4, v6] = await resetIpRules(t.db)
    const error = await failure(service.remove(v4!, { revision: 0 }, me(), ACTOR_IP))
    expect(error.message).toBe(IP_ACCESS_MESSAGES.selfLockout)
    const { before } = await service.remove(v6!, { revision: 0 }, me(), ACTOR_IP)
    expect(before).toMatchObject({ scopeType: 'global', cidr: '::/0' })
    expect((await ipRulesOf(t.db)).map((row) => row.cidr)).toEqual(['0.0.0.0/0'])
  })

  it('revision 409 · 없는 규칙 404', async () => {
    const [v4] = await resetIpRules(t.db)
    expect((await failure(service.remove(v4!, { revision: 1 }, me(), ACTOR_IP))).code).toBe(
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    expect((await failure(service.remove(999_999n, { revision: 0 }, me(), ACTOR_IP))).code).toBe(
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
  })
})

describe('재인증(reauth 켬)', () => {
  it('currentPassword 가 틀리면 403 ERR_REAUTH_REQUIRED — 트랜잭션 전에 멈춘다', async () => {
    const reauth = new FakeReauth()
    const guarded = new AdminIpAccessService(
      t.db,
      ipAccessConfig(true),
      reauth as unknown as AdminReauthService,
    )
    const error = await failure(
      guarded.create(
        { scopeType: 'global', scopeRefNo: null, cidr: '10.0.0.0/8', currentPassword: 'wrong' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_REAUTH_REQUIRED)
    await guarded.create(
      {
        scopeType: 'global',
        scopeRefNo: null,
        cidr: '203.0.113.0/24',
        currentPassword: 'right-password',
      },
      me(),
      ACTOR_IP,
    )
    expect(reauth.calls).toEqual(['wrong', 'right-password'])
  })
})

describe('미리보기', () => {
  it('op 없음 — 지금 상태 · 요청자 통과', async () => {
    await seedSessionFrom(t.db, actor.userNo, ACTOR_IP)
    const preview = await service.preview({}, me(), ACTOR_IP)
    expect(preview.clientIp).toBe(ACTOR_IP)
    expect(preview.clientPasses).toBe(true)
    expect(preview.items.find((item) => item.userId === 'svc-actor')).toMatchObject({
      statusBefore: 'passes',
      statusAfter: 'passes',
      becomesLocked: false,
    })
  })

  it('🔴 create — 요청자를 막는 규칙이면 clientPasses false · 그 사람 becomesLocked(저장은 409 다)', async () => {
    await seedSessionFrom(t.db, actor.userNo, ACTOR_IP)
    const preview = await service.preview(
      { op: 'create', scopeType: 'user', scopeRefNo: actor.userNo, cidr: '10.0.0.0/8' },
      me(),
      ACTOR_IP,
    )
    expect(preview.clientPasses).toBe(false)
    expect(preview.items[0]).toMatchObject({ userId: 'svc-actor', becomesLocked: true })
  })

  it('🔴 Review Focus 4 — 지운 규칙의 update 미리보기는 404', async () => {
    const error = await failure(
      service.preview(
        { op: 'update', ruleNo: 999_999n, scopeType: 'global', cidr: '::/0' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_NOT_FOUND)
  })

  it('퇴사자는 빠지고 퇴사 예정자 · 무소속 계정은 남는다(P12)', async () => {
    await seedUser(t.db, {
      roleNo: plain,
      userId: 'svc-gone',
      resignAt: new Date(Date.now() - 60_000),
    })
    await seedUser(t.db, {
      roleNo: plain,
      userId: 'svc-leaving',
      resignAt: new Date(Date.now() + 86_400_000),
    })
    const ids = (await service.preview({}, me(), ACTOR_IP)).items.map((item) => item.userId)
    expect(ids).toContain('svc-leaving')
    expect(ids).toContain('svc-other')
    expect(ids).not.toContain('svc-gone')
  })

  it('Review Focus 5 — 큰 번호 팀에만 팀 규칙이면 그 사람은 global 층이다', async () => {
    const small = await seedTeam(t.db, 'svc-rf5-small')
    const big = await seedTeam(t.db, 'svc-rf5-big')
    const split = await seedUser(t.db, { roleNo: plain, userId: 'svc-rf5' })
    await addToTeam(t.db, small, split.userNo)
    await addToTeam(t.db, big, split.userNo)
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: big, cidr: '10.0.0.0/8' })
    const item = (await service.preview({}, me(), ACTOR_IP)).items.find(
      (row) => row.userId === 'svc-rf5',
    )
    expect(item?.layerBefore).toBe('global')
  })
})

describe('정책(ADMIN_ACCESS_POLICY 구현)', () => {
  it('시드만 있으면 v4 · v6 통과 · null 은 거부 · user 규칙이 global 을 지운다', async () => {
    const policy = new IpAccessPolicy(t.db)
    const context = { userNo: actor.userNo, teamNos: [] }
    expect(await policy.allows({ ...context, clientIp: '198.51.100.1' })).toBe(true)
    expect(await policy.allows({ ...context, clientIp: '2001:db8::1' })).toBe(true)
    expect(await policy.allows({ ...context, clientIp: null })).toBe(false)
    await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: actor.userNo, cidr: '10.0.0.0/8' })
    expect(await policy.allows({ ...context, clientIp: '198.51.100.1' })).toBe(false)
    expect(await policy.allows({ ...context, clientIp: '10.9.9.9' })).toBe(true)
  })
})
