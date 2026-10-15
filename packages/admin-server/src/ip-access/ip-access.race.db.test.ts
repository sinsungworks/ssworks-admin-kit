import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GUARD_LOCK_SUPER_ADMIN } from '../accounts/super-admin.js'
import { AdminTeamsService } from '../teams/teams.service.js'
import { TEAM_MESSAGES } from '../teams/errors.js'
import { testPrincipal } from '../test-support/accounts.js'
import { seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import {
  holdGuard,
  settle,
  snapshotKysely,
  underHeld,
  whileHeld,
} from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { ipAccessConfig, ipRulesOf, resetIpRules } from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { AdminIpAccessService } from './ip-access.service.js'

// 🔴 IP 쓰기의 잠금(2f-1 스펙 §5-3 · §5-4 · §5-5 · §9-2 r1~r3). 공개 서비스 메서드를 거친다 — 부품을 따로 부르면 순서 회귀를
//    못 잡는다. 요청자는 일반 관리자라 잔존 셈은 늘 이미 0 이다(전권자 없음 — 잔존은 통과, 가드는 그대로 잡는다).

let t: TestDatabase
let a: SeededUser
let b: SeededUser
const A_IP = '10.1.2.3'
const B_IP = '192.168.1.2'

beforeAll(async () => {
  t = await createTestDatabase()
  const plain = await seedRole(t.db, { roleName: 'race-plain', permissions: [] })
  a = await seedUser(t.db, { roleNo: plain, userId: 'race-a' })
  b = await seedUser(t.db, { roleNo: plain, userId: 'race-b' })
})

afterAll(async () => {
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
})

const principal = (user: SeededUser) => testPrincipal(user.userNo, ['setting.ipAccess:write'])
const service = (db: TestDatabase['db'] = t.db) =>
  new AdminIpAccessService(db, ipAccessConfig(), undefined)

function codeOf(error: unknown): string | undefined {
  return error instanceof BusinessError ? error.code : undefined
}

describe('🔴 IP 쓰기 셋은 잔존 가드 행을 잡는다 — 읽기는 잡지 않는다', () => {
  it('만들기 · 수정 · 삭제는 가드를 쥔 동안 기다리고, 목록 · 미리보기는 기다리지 않는다', async () => {
    const [v4, v6] = await resetIpRules(t.db)
    const writes: [string, () => Promise<unknown>][] = [
      [
        'create',
        () =>
          service().create(
            { scopeType: 'global', scopeRefNo: null, cidr: '172.16.0.0/12' },
            principal(a),
            A_IP,
          ),
      ],
      [
        'update',
        () => service().update(v6!, { description: '가드', revision: 0 }, principal(a), A_IP),
      ],
      ['remove', () => service().remove(v6!, { revision: 1 }, principal(a), A_IP)],
    ]
    for (const [name, write] of writes) {
      const { waited, result } = await underHeld(t, holdGuard(GUARD_LOCK_SUPER_ADMIN), write)
      expect(waited, name).toBe(true)
      if (!result.ok) throw result.error
    }
    const reads: [string, () => Promise<unknown>][] = [
      ['list', () => service().list()],
      ['preview', () => service().preview({ op: 'delete', ruleNo: v4! }, principal(a), A_IP)],
    ]
    for (const [name, read] of reads) {
      const { waited, result } = await underHeld(t, holdGuard(GUARD_LOCK_SUPER_ADMIN), read)
      expect(waited, name).toBe(false)
      if (!result.ok) throw result.error
    }
  })
})

describe.each([
  ['ON', true],
  ['OFF', false],
] as const)('스냅샷 격리 %s', (label, snapshot) => {
  it('🔴 (r1a) 팀 삭제가 팀 행을 먼저 쥠 → 그 팀 규칙 만들기가 기다렸다 400 scopeRefNo(1020 없음)', async () => {
    const team = await seedTeam(t.db, `race-r1a-${label}`)
    const db = await snapshotKysely(t, snapshot)
    try {
      const result = await whileHeld(
        t,
        async (connection: Connection) => {
          await holdGuard('teamTree')(connection)
          await connection.query('select team_no from teams where team_no = ? for update', [team])
          await connection.query('delete from teams where team_no = ?', [team])
        },
        () =>
          service(db).create(
            { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8' },
            principal(a),
            A_IP,
          ),
      )
      expect(result.reached).toBe(true)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(codeOf(result.error)).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect((result.error as BusinessError).message).toBe(IP_ACCESS_MESSAGES.noScopeTeam)
    } finally {
      await db.destroy()
    }
  })

  it('🔴 (r1b) 규칙 쓰기가 팀 행을 먼저 쥠 → 팀 삭제가 기다렸다 그 규칙을 세어 409', async () => {
    const team = await seedTeam(t.db, `race-r1b-${label}`)
    const db = await snapshotKysely(t, snapshot)
    try {
      const result = await whileHeld(
        t,
        async (connection: Connection) => {
          await holdGuard(GUARD_LOCK_SUPER_ADMIN)(connection)
          await connection.query('select team_no from teams where team_no = ? for update', [team])
          await connection.query(
            "insert into ip_access_rules (scope_type, scope_ref_no, cidr) values ('team', ?, '10.0.0.0/8')",
            [team],
          )
        },
        () => new AdminTeamsService(db).remove(team),
      )
      expect(result.reached).toBe(true)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(codeOf(result.error)).toBe(CommonErrorCodes.ERR_TEAM_HAS_IP_RULES)
      expect((result.error as BusinessError).message).toBe(TEAM_MESSAGES.teamHasIpRules)
    } finally {
      await db.destroy()
    }
  })
})

describe('🔴 (r2) IP 쓰기끼리 가드에서 줄을 선다', () => {
  it('각자는 자기 잠금을 통과하는 삭제 둘(서로를 살리는 global 행) — 뒤의 쪽이 409, 행 하나가 남는다', async () => {
    const [toA, toB] = await resetIpRules(t.db, [
      { scopeType: 'global', cidr: '10.0.0.0/8' },
      { scopeType: 'global', cidr: '192.168.0.0/16' },
    ])
    // A(10.x)는 B 의 행을, B(192.168.x)는 A 의 행을 지운다 — 각자는 자기 행이 남아 통과한다. 둘 다 커밋되면 둘 다 잠긴다
    const result = await whileHeld(
      t,
      holdGuard(GUARD_LOCK_SUPER_ADMIN),
      () =>
        Promise.all([
          settle(service().remove(toB!, { revision: 0 }, principal(a), A_IP)),
          settle(service().remove(toA!, { revision: 0 }, principal(b), B_IP)),
        ]),
      { waiters: 2 },
    )
    expect(result.reached).toBe(true)
    if (!result.ok) throw result.error
    const outcomes = result.value
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1)
    const failed = outcomes.find((outcome) => !outcome.ok)
    expect(failed && !failed.ok ? (failed.error as BusinessError).message : '').toBe(
      IP_ACCESS_MESSAGES.selfLockout,
    )
    expect(await ipRulesOf(t.db)).toHaveLength(1)
  })
})

describe('🔴 (r3) 스냅샷 격리 ON — 참조 잠금이 읽기 뷰보다 먼저다', () => {
  it('대상 사용자의 로그인 실패가 행을 쥔 동안 그 사용자 규칙 만들기가 기다렸다 성공한다(1020 없음)', async () => {
    const db = await snapshotKysely(t, true)
    try {
      const result = await whileHeld(
        t,
        async (connection: Connection) => {
          await connection.query(
            'select login_fail_count from users where user_no = ? for update',
            [b.userNo],
          )
          await connection.query(
            'update users set login_fail_count = login_fail_count + 1 where user_no = ?',
            [b.userNo],
          )
        },
        () =>
          service(db).create(
            { scopeType: 'user', scopeRefNo: b.userNo, cidr: '10.0.0.0/8' },
            principal(a),
            A_IP,
          ),
      )
      expect(result.reached).toBe(true)
      if (!result.ok) throw result.error
      expect(result.value.item).toMatchObject({ scopeType: 'user', scopeRefNo: b.userNo })
    } finally {
      await db.destroy()
    }
  })
})
