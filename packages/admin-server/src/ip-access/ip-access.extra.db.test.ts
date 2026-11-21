import {
  CommonErrorCodes,
  IP_ACCESS_SCHEMA_MESSAGES,
  type BusinessError,
} from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GUARD_LOCK_SUPER_ADMIN } from '../accounts/super-admin.js'
import type { AdminReauthService } from '../auth/reauth.service.js'
import { FakeReauth, testPrincipal } from '../test-support/accounts.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { holdGuard, underHeld, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { failure } from '../test-support/errors.js'
import {
  PROBE_SCOPE,
  createProbeTokens,
  ipAccessConfig,
  ipRulesOf,
  probeScope,
  probeTokenTarget,
  resetIpRules,
  seedIpRule,
  seedProbeToken,
  type ProbeTargetCalls,
} from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { AdminIpAccessService } from './ip-access.service.js'

// 확장 범위 쓰기(확장 범위 스펙 §4-3 · X2 ~ X8). 🔴 규칙은 DB 전역 상태 — beforeEach 로 시드 두 행만 남긴다.

let t: TestDatabase
let service: AdminIpAccessService
let calls: ProbeTargetCalls
let actor: SeededUser
let token: bigint
let other: bigint
const ACTOR_IP = '203.0.113.9'

beforeAll(async () => {
  t = await createTestDatabase()
  await createProbeTokens(t.db)
  token = await seedProbeToken(t.db, '작업대 1')
  other = await seedProbeToken(t.db, '작업대 2')
  calls = { lock: [], names: [] }
  service = new AdminIpAccessService(
    t.db,
    ipAccessConfig(false, 'req.ip', {
      extraScopes: [
        probeScope({ target: probeTokenTarget(calls) }),
        probeScope({ type: 'probeNoWhole', wholeScope: false }),
      ],
    }),
    undefined,
  )
  const plain = await seedRole(t.db, { roleName: 'extra-plain', permissions: [] })
  actor = await seedUser(t.db, { roleNo: plain, userId: 'extra-actor' })
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
  calls.lock.length = 0
  calls.names.length = 0
})

const me = () => testPrincipal(actor.userNo, ['setting.ipAccess:write'])
const issueOf = (error: { details?: unknown }) =>
  (error.details as { issues: { path: unknown[]; message: string }[] }).issues.map((issue) => [
    issue.path.join('.'),
    issue.message,
  ])

describe('만들기', () => {
  it('대상 하나 — 훅이 잠그고 이름을 붙인다', async () => {
    const { item } = await service.create(
      { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '203.0.113.7/32', description: '출고장' },
      me(),
      ACTOR_IP,
    )
    expect(item).toMatchObject({
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      scopeName: '작업대 1',
      scopeUserId: null,
      cidr: '203.0.113.7/32',
      description: '출고장',
      revision: 0,
    })
    expect(calls.lock).toEqual([token])
  })

  it('범위 전체 — 잠글 대상이 없다 · 이름 null', async () => {
    const { item } = await service.create(
      { scopeType: PROBE_SCOPE, scopeRefNo: null, cidr: '198.51.100.0/24' },
      me(),
      ACTOR_IP,
    )
    expect(item).toMatchObject({ scopeRefNo: null, scopeName: null })
    expect(calls.lock).toEqual([])
  })

  it('🔴 대상이 없으면 400 scopeRefNo — 행을 넣지 않는다', async () => {
    const error = await failure(
      service.create(
        { scopeType: PROBE_SCOPE, scopeRefNo: 999_999n, cidr: '10.0.0.0/8' },
        me(),
        ACTOR_IP,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(issueOf(error)).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTarget]])
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('🔴 꺼진 범위 전체 · 모르는 범위 — 400(서비스도 본다)', async () => {
    expect(
      issueOf(
        await failure(
          service.create(
            { scopeType: 'probeNoWhole', scopeRefNo: null, cidr: '10.0.0.0/8' },
            me(),
            ACTOR_IP,
          ),
        ),
      ),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.wholeScopeOff]])
    expect(
      issueOf(
        await failure(
          service.create({ scopeType: 'gone', scopeRefNo: 1n, cidr: '10.0.0.0/8' }, me(), ACTOR_IP),
        ),
      ),
    ).toEqual([['scopeType', IP_ACCESS_MESSAGES.unknownScopeType]])
  })
})

describe('수정', () => {
  it('대상 바꾸기 · CIDR · revision 하나 오름 · before · after', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const { item, before, after } = await service.update(
      ruleNo,
      { scopeRefNo: other, cidr: '10.1.0.0/16', revision: 0 },
      me(),
      ACTOR_IP,
    )
    expect(item).toMatchObject({
      scopeRefNo: other,
      scopeName: '작업대 2',
      cidr: '10.1.0.0/16',
      revision: 1,
    })
    expect(before).toEqual({
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
      description: null,
    })
    expect(after).toEqual({
      scopeType: PROBE_SCOPE,
      scopeRefNo: other,
      cidr: '10.1.0.0/16',
      description: null,
    })
    expect(calls.lock).toEqual([other])
  })

  it('🔴 범위 종류는 바꿀 수 없다 — 코어로 · 다른 확장 범위로 · 코어에서 확장으로', async () => {
    const extraRule = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    for (const scopeType of ['global', 'probeNoWhole']) {
      const error = await failure(
        service.update(extraRule, { scopeType, scopeRefNo: null, revision: 0 }, me(), ACTOR_IP),
      )
      expect(issueOf(error)).toEqual([['scopeType', IP_ACCESS_MESSAGES.scopeTypeLocked]])
    }
    const [globalRule] = await resetIpRules(t.db)
    const error = await failure(
      service.update(
        globalRule!,
        { scopeType: PROBE_SCOPE, scopeRefNo: token, revision: 0 },
        me(),
        ACTOR_IP,
      ),
    )
    expect(issueOf(error)).toEqual([['scopeType', IP_ACCESS_MESSAGES.scopeTypeLocked]])
  })

  it('revision 이 다르면 409 · 대상이 없으면 400', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    expect(
      (await failure(service.update(ruleNo, { cidr: '10.2.0.0/16', revision: 5 }, me(), ACTOR_IP)))
        .code,
    ).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
    expect(
      issueOf(
        await failure(
          service.update(ruleNo, { scopeRefNo: 999_999n, revision: 0 }, me(), ACTOR_IP),
        ),
      ),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.noScopeTarget]])
  })

  it('🔴 꺼진 범위 전체로 바꾸기는 400', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: 'probeNoWhole',
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    expect(
      issueOf(
        await failure(service.update(ruleNo, { scopeRefNo: null, revision: 0 }, me(), ACTOR_IP)),
      ),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.wholeScopeOff]])
  })
})

describe('삭제 · 등록이 빠진 범위', () => {
  it('삭제 — before · revision 409', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    expect((await failure(service.remove(ruleNo, { revision: 3 }, me(), ACTOR_IP))).code).toBe(
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    const { before } = await service.remove(ruleNo, { revision: 0 }, me(), ACTOR_IP)
    expect(before).toEqual({
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
      description: null,
    })
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('🔴 등록이 빠진 범위의 행 — 수정은 400 scopeType · 삭제는 된다(X8)', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: 'goneScope',
      scopeRefNo: 1n,
      cidr: '10.0.0.0/8',
    })
    expect(
      issueOf(
        await failure(service.update(ruleNo, { cidr: '10.2.0.0/16', revision: 0 }, me(), ACTOR_IP)),
      ),
    ).toEqual([['scopeType', IP_ACCESS_MESSAGES.unknownScopeType]])
    await service.remove(ruleNo, { revision: 0 }, me(), ACTOR_IP)
    expect(await ipRulesOf(t.db)).toHaveLength(2)
  })

  it('없는 규칙 — 지금처럼 404', async () => {
    expect((await failure(service.remove(999_999n, { revision: 0 }, me(), ACTOR_IP))).code).toBe(
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
    )
  })
})

describe('🔴 확장 쓰기는 잔존 밖(X3)', () => {
  it('잔존 가드 행을 남이 쥐고 있어도 기다리지 않는다 — 만들기 · 수정 · 삭제', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const writes: (() => Promise<unknown>)[] = [
      () =>
        service.create(
          { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '10.9.0.0/16' },
          me(),
          ACTOR_IP,
        ),
      () => service.update(ruleNo, { cidr: '10.1.0.0/16', revision: 0 }, me(), ACTOR_IP),
      // revision: 1 — 바로 앞 수정이 올린 값에 기댄다(순서를 바꾸면 409)
      () => service.remove(ruleNo, { revision: 1 }, me(), ACTOR_IP),
    ]
    for (const write of writes) {
      const { waited, result } = await underHeld(t, holdGuard(GUARD_LOCK_SUPER_ADMIN), write)
      expect(waited).toBe(false)
      expect(result.ok).toBe(true)
    }
  })

  it('쓰는 쪽이 대상 행을 쥐고 있으면 기다린다(훅이 FOR UPDATE)', async () => {
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query('select token_no from probe_tokens where token_no = ? for update', [
          token,
        ]),
      () =>
        service.create(
          { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '10.8.0.0/16' },
          me(),
          ACTOR_IP,
        ),
      { expectWait: true },
    )
    expect(result.ok).toBe(true)
  })

  it('🔴 자기 잠금을 보지 않는다 — 요청자 주소와 무관한 확장 규칙도 저장된다', async () => {
    const { item } = await service.create(
      { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '192.0.2.0/24' },
      me(),
      null,
    )
    expect(item.cidr).toBe('192.0.2.0/24')
  })
})

describe('잠금 순서 · 갈래 재확인(X4 · X6)', () => {
  const holdRule = (ruleNo: bigint) => (connection: Connection) =>
    connection.query('select rule_no from ip_access_rules where rule_no = ? for update', [ruleNo])
  const conflictCode = (result: { ok: boolean; error?: unknown }) => {
    expect(result.ok).toBe(false)
    expect((result.error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
  }

  it('수정이 새 대상으로 옮길 때 그 대상 행을 기다린다', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query('select token_no from probe_tokens where token_no = ? for update', [
          other,
        ]),
      () => service.update(ruleNo, { scopeRefNo: other, revision: 0 }, me(), ACTOR_IP),
      { expectWait: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.item.scopeRefNo).toBe(other)
  })

  it('🔴 규칙 행이 먼저다 — 확장 수정 · 삭제는 규칙 행을 기다린다', async () => {
    const ruleNo = await seedIpRule(t.db, {
      scopeType: PROBE_SCOPE,
      scopeRefNo: token,
      cidr: '10.0.0.0/8',
    })
    const updated = await whileHeld(
      t,
      holdRule(ruleNo),
      () => service.update(ruleNo, { cidr: '10.1.0.0/16', revision: 0 }, me(), ACTOR_IP),
      { expectWait: true },
    )
    expect(updated.ok).toBe(true)
    const removed = await whileHeld(
      t,
      holdRule(ruleNo),
      () => service.remove(ruleNo, { revision: 1 }, me(), ACTOR_IP),
      { expectWait: true },
    )
    expect(removed.ok).toBe(true)
  })

  it('🔴 갈래 재확인 409 — 기다리는 사이 갈래가 바뀐 확장 수정 · 삭제', async () => {
    for (const write of ['update', 'remove'] as const) {
      const ruleNo = await seedIpRule(t.db, {
        scopeType: PROBE_SCOPE,
        scopeRefNo: token,
        cidr: '10.0.0.0/8',
      })
      const result = await whileHeld(
        t,
        holdRule(ruleNo),
        () =>
          write === 'update'
            ? service.update(ruleNo, { cidr: '10.2.0.0/16', revision: 0 }, me(), ACTOR_IP)
            : service.remove(ruleNo, { revision: 0 }, me(), ACTOR_IP),
        {
          expectWait: true,
          afterReached: (c) =>
            c.query(
              "update ip_access_rules set scope_type = 'global', scope_ref_no = null where rule_no = ?",
              [ruleNo],
            ),
        },
      )
      conflictCode(result)
    }
  })

  it('🔴 갈래 재확인 409 — 기다리는 사이 확장으로 바뀐 코어 수정', async () => {
    const ruleNo = await seedIpRule(t.db, { scopeType: 'global', cidr: '198.51.100.0/24' })
    const result = await whileHeld(
      t,
      holdRule(ruleNo),
      () => service.update(ruleNo, { cidr: '198.51.100.0/25', revision: 0 }, me(), ACTOR_IP),
      {
        expectWait: true,
        afterReached: (c) =>
          c.query(
            "update ip_access_rules set scope_type = 'probeToken', scope_ref_no = ? where rule_no = ?",
            [token, ruleNo],
          ),
      },
    )
    conflictCode(result)
  })
})

describe('재인증', () => {
  it('확장 쓰기도 reauth 를 지난다 — 틀린 비밀번호는 쓰지 않는다', async () => {
    const reauth = new FakeReauth()
    const guarded = new AdminIpAccessService(
      t.db,
      ipAccessConfig(true, 'req.ip', { extraScopes: [probeScope()] }),
      reauth as unknown as AdminReauthService,
    )
    await failure(
      guarded.create(
        { scopeType: PROBE_SCOPE, scopeRefNo: token, cidr: '10.0.0.0/8', currentPassword: 'wrong' },
        me(),
        ACTOR_IP,
      ),
    )
    await guarded.create(
      {
        scopeType: PROBE_SCOPE,
        scopeRefNo: token,
        cidr: '10.0.0.0/8',
        currentPassword: 'right-password',
      },
      me(),
      ACTOR_IP,
    )
    expect(reauth.calls).toEqual(['wrong', 'right-password'])
  })
})

it('형식 메시지 상수가 공유 표와 같은 출처다', () => {
  expect(IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid).toBe('범위 이름이 형식에 맞지 않습니다.')
})
