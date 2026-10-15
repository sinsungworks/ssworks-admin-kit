import { BusinessError, CommonErrorCodes, type IpRule } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import {
  buildLockoutCandidates,
  judgeIpLockout,
  nextRulesOf,
  previewIpLockout,
  type IdentifiedIpRule,
  type IpLockoutCandidate,
} from './preview.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-evaluation.test.ts(judgeIpLockout · buildLockoutCandidates ·
//       previewIpLockout) — 판정은 admin-shared 함수다(로그인과 같은 판정).

const subject = { userNo: 1n, teamNos: [10n] }
const rule = (
  scopeType: IpRule['scopeType'],
  cidr: string,
  scopeRefNo: bigint | null = null,
): IpRule => ({ scopeType, scopeRefNo, cidr })
const candidateOf = (
  userNo: bigint,
  userId: string,
  overrides: Partial<IpLockoutCandidate> = {},
): IpLockoutCandidate => ({
  userNo,
  userId,
  userName: `${userId} 님`,
  teamNos: [],
  sessionIps: [],
  ...overrides,
})

describe('judgeIpLockout', () => {
  it('🔴 층이 없으면 주소와 무관하게 locked — 주소 미상 세션도 거부 확정', () => {
    const judged = judgeIpLockout([], { userNo: 1n, teamNos: [] }, ['203.0.113.9', null])
    expect(judged).toEqual({
      layer: null,
      status: 'locked',
      blockedSessionCount: 2,
      unknownIpSessionCount: 1,
    })
  })

  it('통과하는 세션이 하나라도 있으면 passes — 거부되는 세션은 따로 센다', () => {
    const judged = judgeIpLockout([rule('global', '203.0.113.0/24')], subject, [
      '10.1.2.3',
      '203.0.113.9',
    ])
    expect(judged).toMatchObject({ layer: 'global', status: 'passes', blockedSessionCount: 1 })
  })

  it('🔴 층은 있는데 주소를 아는 세션이 0 이면 unknown — 잠겼다고 단정하지 않는다', () => {
    const rules = [rule('global', '203.0.113.0/24')]
    expect(judgeIpLockout(rules, subject, [null, null])).toMatchObject({
      status: 'unknown',
      blockedSessionCount: 0,
      unknownIpSessionCount: 2,
    })
    expect(judgeIpLockout(rules, subject, []).status).toBe('unknown')
  })

  it('🔴 v6 세션을 v4 규칙이 통과시키지 않는다', () => {
    const onlyV4 = [rule('global', '0.0.0.0/0')]
    expect(judgeIpLockout(onlyV4, subject, ['2001:db8::1']).status).toBe('locked')
    expect(
      judgeIpLockout([...onlyV4, rule('global', '::/0')], subject, ['2001:db8::1']).status,
    ).toBe('passes')
  })
})

describe('buildLockoutCandidates', () => {
  const users = [
    { userNo: 1n, userId: 'a-admin', userName: '가' },
    { userNo: 2n, userId: 'b-admin', userName: '나' },
  ]

  it('🔴 계정당 팀 하나 — 가장 작은 teamNo(로그인과 같은 대표 팀)', () => {
    const candidates = buildLockoutCandidates(
      users,
      [
        { userNo: 1n, teamNo: 30n },
        { userNo: 1n, teamNo: 10n },
        { userNo: 1n, teamNo: 20n },
      ],
      [],
    )
    expect(candidates[0]?.teamNos).toEqual([10n])
  })

  it('팀 · 세션이 없는 계정도 남는다 · 세션 주소를 계정별로 모은다(null 포함)', () => {
    const candidates = buildLockoutCandidates(
      users,
      [{ userNo: 1n, teamNo: 10n }],
      [
        { userNo: 1n, ipAddress: '203.0.113.9' },
        { userNo: 1n, ipAddress: null },
      ],
    )
    expect(candidates).toHaveLength(2)
    expect(candidates[0]?.sessionIps).toEqual(['203.0.113.9', null])
    expect(candidates[1]).toMatchObject({ teamNos: [], sessionIps: [] })
  })

  it('Review Focus 5 — 큰 번호 팀에만 팀 규칙이면 global 층이다', () => {
    const [candidate] = buildLockoutCandidates(
      [users[0]!],
      [
        { userNo: 1n, teamNo: 20n },
        { userNo: 1n, teamNo: 10n },
      ],
      [{ userNo: 1n, ipAddress: '203.0.113.9' }],
    )
    const rules = [rule('global', '0.0.0.0/0'), rule('team', '10.0.0.0/8', 20n)]
    expect(judgeIpLockout(rules, candidate!, candidate!.sessionIps)).toMatchObject({
      layer: 'global',
      status: 'passes',
    })
  })
})

describe('previewIpLockout', () => {
  const currentRules = [rule('global', '0.0.0.0/0'), rule('user', '10.0.0.0/8', 2n)]
  const nextRules = [rule('user', '10.0.0.0/8', 2n)]
  const newly = candidateOf(1n, 'a-newly', { sessionIps: ['203.0.113.9'] })
  const already = candidateOf(2n, 'b-already', { sessionIps: ['203.0.113.9'] })

  it('🔴 becomesLocked 는 변경 전에 안 잠겨 있던 사람만 · 층의 전후', () => {
    const { items, summary } = previewIpLockout([newly, already], currentRules, nextRules)
    const byId = Object.fromEntries(items.map((item) => [item.userId, item]))
    expect(byId['a-newly']).toMatchObject({
      statusBefore: 'passes',
      statusAfter: 'locked',
      becomesLocked: true,
      layerBefore: 'global',
      layerAfter: null,
    })
    expect(byId['b-already']).toMatchObject({
      statusBefore: 'locked',
      statusAfter: 'locked',
      becomesLocked: false,
    })
    expect(summary).toMatchObject({ total: 2, newlyLocked: 1, alreadyLocked: 1 })
  })

  it('🔴 items 는 등급 순 — 다섯이 각각 다른 등급, 아이디 알파벳 순과 어긋나게', () => {
    const rules = [
      rule('global', '0.0.0.0/0'),
      rule('user', '10.0.0.0/8', 2n),
      rule('user', '10.0.0.0/8', 4n),
    ]
    const next = [
      rule('global', '10.0.0.0/8'),
      rule('user', '10.0.0.0/8', 2n),
      rule('user', '10.0.0.0/8', 4n),
    ]
    const { items } = previewIpLockout(
      [
        candidateOf(5n, 'b-passes', { sessionIps: ['10.1.2.3'] }),
        candidateOf(4n, 'x-unknown', { sessionIps: [null] }),
        candidateOf(2n, 'a-already', { sessionIps: ['203.0.113.9'] }),
        candidateOf(3n, 'm-silent', { sessionIps: [null] }),
        candidateOf(1n, 'z-newly', { sessionIps: ['203.0.113.9'] }),
      ],
      rules,
      next,
    )
    const order = items.map((item) => item.userId)
    expect(order).toEqual(['z-newly', 'm-silent', 'a-already', 'x-unknown', 'b-passes'])
    // 🔴 공허 가드 — 알파벳 순서가 기대 순서와 달라야 정렬을 잰다
    expect([...order].sort()).not.toEqual(order)
  })

  it('같은 등급 안에서는 userId 오름차순', () => {
    const second = candidateOf(9n, 'z-newly', { sessionIps: ['203.0.113.9'] })
    const { items } = previewIpLockout([second, newly], currentRules, nextRules)
    expect(items.map((item) => item.userId)).toEqual(['a-newly', 'z-newly'])
  })

  it('🔴 blockedSessions 는 items 전원의 합 — 여전히 passes 인 사람이 잃는 세션도 센다', () => {
    const two = [
      candidateOf(1n, 'a-desk', { sessionIps: ['203.0.113.9', '10.1.2.3'] }),
      candidateOf(2n, 'b-desk', { sessionIps: ['203.0.113.10', '10.1.2.4'] }),
    ]
    const { items, summary } = previewIpLockout(
      two,
      [rule('global', '0.0.0.0/0')],
      [rule('global', '203.0.113.0/24')],
    )
    expect(summary.newlyLocked).toBe(0)
    expect(summary.blockedSessions).toBe(2)
    expect(summary.blockedSessions).toBe(
      items.reduce((sum, item) => sum + item.blockedSessionCount, 0),
    )
    expect(summary.ruleSetChangedOnly).toBe(2)
  })

  it('🔴 ruleSetChanged — unknown→unknown · locked→locked · 층만 바뀜 · 한쪽만 층 없음은 참', () => {
    const offline = candidateOf(1n, 'a-offline')
    expect(
      previewIpLockout([offline], [rule('global', '0.0.0.0/0')], [rule('global', '203.0.113.0/24')])
        .items[0]?.ruleSetChanged,
    ).toBe(true)
    const stuck = candidateOf(1n, 'a-stuck', { sessionIps: ['203.0.113.9'] })
    expect(
      previewIpLockout([stuck], [rule('user', '10.0.0.0/8', 1n)], [rule('user', '10.1.0.0/16', 1n)])
        .items[0],
    ).toMatchObject({ statusBefore: 'locked', statusAfter: 'locked', ruleSetChanged: true })
    const moved = candidateOf(1n, 'a-moved', { sessionIps: ['10.1.2.3'] })
    expect(
      previewIpLockout(
        [moved],
        [rule('global', '10.0.0.0/8')],
        [rule('global', '10.0.0.0/8'), rule('user', '10.0.0.0/8', 1n)],
      ).items[0],
    ).toMatchObject({ layerBefore: 'global', layerAfter: 'user', ruleSetChanged: true })
    expect(
      previewIpLockout([offline], [], [rule('global', '0.0.0.0/0')]).items[0]?.ruleSetChanged,
    ).toBe(true)
  })

  it('순서 · 중복만 바뀐 것 · 나에게 안 걸리는 층의 변경은 ruleSetChanged 가 아니다', () => {
    const anyone = candidateOf(1n, 'a-any', { sessionIps: ['203.0.113.9'] })
    expect(
      previewIpLockout(
        [anyone],
        [rule('global', '0.0.0.0/0'), rule('global', '10.0.0.0/8')],
        [rule('global', '10.0.0.0/8'), rule('global', '0.0.0.0/0'), rule('global', '0.0.0.0/0')],
      ).items[0]?.ruleSetChanged,
    ).toBe(false)
    expect(
      previewIpLockout(
        [anyone],
        [rule('global', '0.0.0.0/0'), rule('user', '10.0.0.0/8', 99n)],
        [rule('global', '0.0.0.0/0'), rule('user', '192.168.0.0/16', 99n)],
      ).summary.ruleSetChangedOnly,
    ).toBe(0)
  })

  it('🔴 v4 global 만 지우면 v4 세션 관리자만 새로 잠긴다 — 층은 그대로 global', () => {
    const { items, summary } = previewIpLockout(
      [
        candidateOf(1n, 'a-v4', { sessionIps: ['203.0.113.9'] }),
        candidateOf(2n, 'b-v6', { sessionIps: ['2001:db8::1'] }),
      ],
      [rule('global', '0.0.0.0/0'), rule('global', '::/0')],
      [rule('global', '::/0')],
    )
    expect(summary.newlyLocked).toBe(1)
    expect(items[0]).toMatchObject({ userId: 'a-v4', layerAfter: 'global', statusAfter: 'locked' })
  })

  it('summary 세 갈래가 items 의 사후 상태와 맞는다', () => {
    const unknown = candidateOf(3n, 'c-unknown')
    const { items, summary } = previewIpLockout([newly, already, unknown], currentRules, nextRules)
    expect(summary.newlyLocked + summary.alreadyLocked).toBe(
      items.filter((item) => item.statusAfter === 'locked').length,
    )
    expect(summary.unknown).toBe(items.filter((item) => item.statusAfter === 'unknown').length)
    expect(summary.total).toBe(items.length)
  })
})

describe('nextRulesOf', () => {
  const current: IdentifiedIpRule[] = [
    { ruleNo: 1n, scopeType: 'global', scopeRefNo: null, cidr: '0.0.0.0/0' },
    { ruleNo: 2n, scopeType: 'global', scopeRefNo: null, cidr: '::/0' },
  ]

  it('op 없음 · create · update · delete', () => {
    expect(nextRulesOf(current, {})).toEqual([
      { scopeType: 'global', scopeRefNo: null, cidr: '0.0.0.0/0' },
      { scopeType: 'global', scopeRefNo: null, cidr: '::/0' },
    ])
    expect(
      nextRulesOf(current, { op: 'create', scopeType: 'user', scopeRefNo: 7n, cidr: '10.0.0.0/8' }),
    ).toHaveLength(3)
    expect(
      nextRulesOf(current, {
        op: 'update',
        ruleNo: 1n,
        scopeType: 'global',
        cidr: '10.0.0.0/8',
      })[0],
    ).toEqual({ scopeType: 'global', scopeRefNo: null, cidr: '10.0.0.0/8' })
    expect(nextRulesOf(current, { op: 'delete', ruleNo: 2n })).toEqual([
      { scopeType: 'global', scopeRefNo: null, cidr: '0.0.0.0/0' },
    ])
  })

  it('🔴 Review Focus 4 — 없는 ruleNo 의 update · delete 는 404(낡은 화면을 숨기지 않는다)', () => {
    for (const query of [
      { op: 'delete' as const, ruleNo: 9n },
      { op: 'update' as const, ruleNo: 9n, scopeType: 'global' as const, cidr: '::/0' },
    ]) {
      let caught: unknown
      try {
        nextRulesOf(current, query)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(BusinessError)
      expect((caught as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_NOT_FOUND)
    }
  })
})
