import { describe, expect, it } from 'vitest'
import {
  IP_ACCESS_SCHEMA_MESSAGES,
  type AdminIpPreview,
  type AdminIpPreviewItem,
  type AdminIpRule,
  type AdminTeamNode,
  type IpScopeType,
} from '@ssworks/admin-shared'
import {
  DEFAULT_IP_ACCESS_MESSAGES as M,
  IP_RULE_FORM_FIELDS,
  changedItemLine,
  changedItemsOf,
  conflictAlertText,
  currentIpLine,
  defaultIpScope,
  emptyIpRuleForm,
  flattenTeamPaths,
  formScopeTitle,
  gateImpact,
  gateMessage,
  impactLine,
  ipRuleFormProblems,
  isGlobalAllowCidr,
  isIpRuleFormPreviewable,
  layerLabel,
  lockedItemLine,
  lockedItemsOf,
  passLine,
  basisLine,
  previewQueryKey,
  previewQueryOf,
  previewSummaryLine,
  removesGlobalAllow,
  resolveIpScopes,
  ruleScopeSub,
  ruleScopeTitle,
  ruleToForm,
  sameIpRuleForm,
  scopeTypeItems,
  sessionLine,
  statusLabel,
  toCreateBody,
  toUpdateBody,
  userOptionTitle,
  withScopeType,
  type IpPreviewView,
  type IpRuleForm,
} from './ip-access.js'

// 정본: hangang-home apps/admin/src/pages/settings/ip-access-messages.ts 의 판정 사례를 킷 계약(사용자 · 팀 · 전체,
//       admin-shared 의 같은 CIDR 파서)으로 옮겼다.

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 12n,
  scopeType: 'team',
  scopeRefNo: 4n,
  scopeName: '상담센터',
  scopeUserId: null,
  cidr: '203.0.113.0/24',
  description: '상담센터 사무실',
  revision: 3,
  createAt: '2026-10-01T00:00:00.000Z',
  updateAt: '2026-10-02T00:00:00.000Z',
  ...over,
})

const form = (over: Partial<IpRuleForm> = {}): IpRuleForm => ({ ...emptyIpRuleForm(), ...over })

describe('범위 · 폼', () => {
  it('🔴 범위 항목은 가까운 층부터 — 그 순서가 평가 순서다', () => {
    expect(scopeTypeItems(M)).toEqual([
      { value: 'user', title: '사용자' },
      { value: 'team', title: '팀' },
      { value: 'global', title: '전체' },
    ])
  })

  it('새 폼은 전체 범위 · 빈 칸', () => {
    expect(emptyIpRuleForm()).toEqual({
      scopeType: 'global',
      scopeRefNo: '',
      cidr: '',
      description: '',
    })
  })

  it('층 목록 — 평가 순서로 펴고 중복은 한 번 · 빈 목록 · 모르는 값은 던진다(3i S1)', () => {
    expect(resolveIpScopes()).toEqual(['user', 'team', 'global'])
    expect(resolveIpScopes(['global', 'user', 'global'])).toEqual(['user', 'global'])
    expect(Object.isFrozen(resolveIpScopes(['user']))).toBe(true)
    expect(() => resolveIpScopes([])).toThrow(/scopes/)
    expect(() => resolveIpScopes(['user', 'teams' as IpScopeType])).toThrow(/teams/)
  })

  it('새 폼의 층 — 전체가 있으면 전체, 없으면 가장 가까운 층(3i S3)', () => {
    expect(defaultIpScope(['user', 'team', 'global'])).toBe('global')
    expect(defaultIpScope(['user', 'team'])).toBe('user')
    expect(defaultIpScope(['team'])).toBe('team')
    expect(emptyIpRuleForm('user')).toEqual({
      scopeType: 'user',
      scopeRefNo: '',
      cidr: '',
      description: '',
    })
  })

  it('층 선택지 — 목록 밖의 지금 층은 제 순번 자리에 남는다(3i S2)', () => {
    const values = (items: { value: string }[]) => items.map((item) => item.value)
    expect(values(scopeTypeItems(M, ['user', 'global']))).toEqual(['user', 'global'])
    expect(values(scopeTypeItems(M, ['user', 'global'], 'team'))).toEqual([
      'user',
      'team',
      'global',
    ])
    expect(values(scopeTypeItems(M, ['user', 'global'], 'global'))).toEqual(['user', 'global'])
  })

  it('규칙 → 폼 — 번호는 문자열, null 은 빈 칸', () => {
    expect(ruleToForm(rule())).toEqual({
      scopeType: 'team',
      scopeRefNo: '4',
      cidr: '203.0.113.0/24',
      description: '상담센터 사무실',
    })
    expect(
      ruleToForm(
        rule({ scopeType: 'global', scopeRefNo: null, scopeName: null, description: null }),
      ),
    ).toEqual({ scopeType: 'global', scopeRefNo: '', cidr: '203.0.113.0/24', description: '' })
  })

  it('같은 폼인가 — 네 칸 모두', () => {
    expect(IP_RULE_FORM_FIELDS).toEqual(['scopeType', 'scopeRefNo', 'cidr', 'description'])
    expect(sameIpRuleForm(form({ cidr: 'a' }), form({ cidr: 'a' }))).toBe(true)
    expect(sameIpRuleForm(form({ cidr: 'a' }), form({ cidr: 'a ' }))).toBe(false)
  })

  it('🔴 범위를 바꾸면 대상을 비운다 — 팀 번호가 사용자 번호로 남지 않게', () => {
    const team = form({ scopeType: 'team', scopeRefNo: '4', cidr: '10.0.0.0/8' })
    expect(withScopeType(team, 'user')).toEqual({ ...team, scopeType: 'user', scopeRefNo: '' })
    expect(withScopeType(team, 'global')).toEqual({ ...team, scopeType: 'global', scopeRefNo: '' })
    expect(withScopeType(team, 'team')).toEqual(team)
  })
})

describe('칸 검증 — 비밀번호를 묻기 전에', () => {
  it('맞으면 빈 객체', () => {
    expect(ipRuleFormProblems(form({ cidr: '203.0.113.0/24' }), M)).toEqual({})
    expect(
      ipRuleFormProblems(form({ scopeType: 'team', scopeRefNo: ' 4 ', cidr: '::/0' }), M),
    ).toEqual({})
  })

  it('대상 — 팀 · 사용자는 번호가 있어야 하고 숫자만, 전체는 보지 않는다', () => {
    expect(ipRuleFormProblems(form({ scopeType: 'team', cidr: '10.0.0.0/8' }), M)).toEqual({
      scopeRefNo: [M.scopeRefRequired],
    })
    expect(
      ipRuleFormProblems(form({ scopeType: 'user', scopeRefNo: 'abc', cidr: '10.0.0.0/8' }), M),
    ).toEqual({ scopeRefNo: [M.scopeRefDigits] })
    expect(ipRuleFormProblems(form({ scopeRefNo: 'abc', cidr: '10.0.0.0/8' }), M)).toEqual({})
  })

  it('CIDR — 빈 값 · 43자 초과 · 🔴 서버와 같은 파서(프리픽스 없음 · 선행 0)', () => {
    expect(ipRuleFormProblems(form(), M).cidr).toEqual([M.cidrRequired])
    expect(ipRuleFormProblems(form({ cidr: '1'.repeat(44) }), M).cidr).toEqual([M.cidrTooLong])
    expect(ipRuleFormProblems(form({ cidr: '10.0.0.1' }), M).cidr).toEqual([
      IP_ACCESS_SCHEMA_MESSAGES.cidr,
    ])
    expect(ipRuleFormProblems(form({ cidr: '010.0.0.0/8' }), M).cidr).toEqual([
      IP_ACCESS_SCHEMA_MESSAGES.cidr,
    ])
  })

  it('설명 — 200자 초과', () => {
    expect(
      ipRuleFormProblems(form({ cidr: '10.0.0.0/8', description: 'x'.repeat(201) }), M).description,
    ).toEqual([M.descriptionTooLong])
    expect(
      ipRuleFormProblems(form({ cidr: '10.0.0.0/8', description: 'x'.repeat(200) }), M),
    ).toEqual({})
  })
})

describe('미리보기 질의', () => {
  const ready = form({ cidr: ' 203.0.113.0/24 ' })

  it('칸이 다 찼는가 — CIDR 은 같은 파서, 팀 · 사용자는 숫자 번호', () => {
    expect(isIpRuleFormPreviewable(ready)).toBe(true)
    expect(isIpRuleFormPreviewable(form({ cidr: '203.0.113.0/' }))).toBe(false)
    expect(isIpRuleFormPreviewable(form({ scopeType: 'team', cidr: '10.0.0.0/8' }))).toBe(false)
    expect(
      isIpRuleFormPreviewable(form({ scopeType: 'team', scopeRefNo: '4', cidr: '10.0.0.0/8' })),
    ).toBe(true)
  })

  it('🔴 패널 닫힘은 {}(현행), 덜 찬 폼은 null(부르지 않음) — 둘은 다르다', () => {
    expect(previewQueryOf({ op: null })).toEqual({})
    expect(previewQueryOf({ op: 'create', form: form() })).toBeNull()
    expect(previewQueryOf({ op: 'create', form: form({ cidr: '10.0.0.1' }) })).toBeNull()
    expect(
      previewQueryOf({
        op: 'update',
        ruleNo: 12n,
        form: form({ scopeType: 'team', scopeRefNo: 'abc', cidr: '10.0.0.0/8' }),
      }),
    ).toBeNull()
  })

  it('🔴 전체 범위는 scopeRefNo 를 싣지 않는다 · CIDR 은 앞뒤 공백을 뗀다', () => {
    const query = previewQueryOf({ op: 'create', form: ready })
    expect(query).toEqual({ op: 'create', scopeType: 'global', cidr: '203.0.113.0/24' })
    expect(Object.keys(query ?? {})).not.toContain('scopeRefNo')
  })

  it('수정 · 삭제는 ruleNo 를 싣는다', () => {
    expect(
      previewQueryOf({
        op: 'update',
        ruleNo: 12n,
        form: form({ scopeType: 'team', scopeRefNo: '4', cidr: '10.0.0.0/8' }),
      }),
    ).toEqual({ op: 'update', ruleNo: 12n, scopeType: 'team', scopeRefNo: 4n, cidr: '10.0.0.0/8' })
    expect(previewQueryOf({ op: 'delete', ruleNo: 12n })).toEqual({ op: 'delete', ruleNo: 12n })
  })

  it('질의 키 — null 과 현행이 다르고, 같은 질의는 같은 키', () => {
    expect(previewQueryKey(null)).toBe('none')
    expect(previewQueryKey({})).not.toBe(previewQueryKey(null))
    const a = previewQueryOf({ op: 'create', form: ready })
    const b = previewQueryOf({ op: 'create', form: form({ cidr: '203.0.113.0/24' }) })
    expect(previewQueryKey(a)).toBe(previewQueryKey(b))
    expect(previewQueryKey(a)).not.toBe(
      previewQueryKey(previewQueryOf({ op: 'create', form: form({ cidr: '203.0.113.0/25' }) })),
    )
  })
})

describe('본문', () => {
  it('만들기 — 번호는 bigint, 전체는 null, 빈 설명은 null, 앞뒤 공백 뗌', () => {
    expect(
      toCreateBody(
        form({
          scopeType: 'team',
          scopeRefNo: ' 4 ',
          cidr: ' 10.0.0.0/8 ',
          description: ' 사무실 ',
        }),
      ),
    ).toEqual({ scopeType: 'team', scopeRefNo: 4n, cidr: '10.0.0.0/8', description: '사무실' })
    expect(toCreateBody(form({ cidr: '::/0' }))).toEqual({
      scopeType: 'global',
      scopeRefNo: null,
      cidr: '::/0',
      description: null,
    })
  })

  it('🔴 수정 — 네 칸과 revision 을 늘 싣는다(부분 갱신에 기대지 않는다)', () => {
    const body = toUpdateBody(form({ cidr: '10.0.0.0/8' }), 3)
    expect(body).toEqual({
      scopeType: 'global',
      scopeRefNo: null,
      cidr: '10.0.0.0/8',
      description: null,
      revision: 3,
    })
    expect(Object.keys(body).sort()).toEqual([
      'cidr',
      'description',
      'revision',
      'scopeRefNo',
      'scopeType',
    ])
  })
})

describe('대상 · 범위 표기', () => {
  const tree: AdminTeamNode[] = [
    {
      teamNo: 1n,
      teamName: '본사',
      displayOrder: 0,
      children: [
        {
          teamNo: 2n,
          teamName: '고객지원',
          displayOrder: 0,
          children: [{ teamNo: 3n, teamName: '상담센터', displayOrder: 0, children: [] }],
        },
        { teamNo: 4n, teamName: '개발', displayOrder: 1, children: [] },
      ],
    },
  ]

  it('팀 트리 → 경로 항목 — 트리 순서 그대로', () => {
    expect(flattenTeamPaths(tree)).toEqual([
      { value: '1', title: '본사' },
      { value: '2', title: '본사 › 고객지원' },
      { value: '3', title: '본사 › 고객지원 › 상담센터' },
      { value: '4', title: '본사 › 개발' },
    ])
    expect(flattenTeamPaths([])).toEqual([])
  })

  it('사용자 항목 글자', () => {
    expect(userOptionTitle({ userName: '김운영', userId: 'ops01' })).toBe('김운영 (ops01)')
  })

  it('규칙 범위 — 전체 · 팀 이름 · 사용자 이름(아이디) · 🔴 대상이 지워졌으면 번호만', () => {
    expect(
      ruleScopeTitle(rule({ scopeType: 'global', scopeRefNo: null, scopeName: null }), M),
    ).toBe('전체')
    expect(ruleScopeTitle(rule(), M)).toBe('팀 · 상담센터')
    expect(
      ruleScopeTitle(
        rule({ scopeType: 'user', scopeRefNo: 3n, scopeName: '김운영', scopeUserId: 'ops01' }),
        M,
      ),
    ).toBe('사용자 · 김운영 (ops01)')
    expect(ruleScopeTitle(rule({ scopeRefNo: 9n, scopeName: null }), M)).toBe('팀 #9')
  })

  it('규칙 범위 아래 줄 — 번호, 대상 없음, 전체는 없음', () => {
    expect(ruleScopeSub(rule(), M)).toBe('#4')
    expect(ruleScopeSub(rule({ scopeRefNo: 9n, scopeName: null }), M)).toBe(M.deadTarget)
    expect(
      ruleScopeSub(rule({ scopeType: 'global', scopeRefNo: null, scopeName: null }), M),
    ).toBeNull()
  })

  it('폼 범위 — 고른 대상 글자가 있으면 그것, 없으면 번호', () => {
    expect(formScopeTitle(form(), null, M)).toBe('전체')
    expect(formScopeTitle(form({ scopeType: 'team', scopeRefNo: '3' }), '본사 › 상담센터', M)).toBe(
      '팀 · 본사 › 상담센터',
    )
    expect(formScopeTitle(form({ scopeType: 'team', scopeRefNo: '3' }), null, M)).toBe('팀 #3')
  })
})

const previewItem = (over: Partial<AdminIpPreviewItem> = {}): AdminIpPreviewItem => ({
  userNo: 7n,
  userId: 'cs07',
  userName: '이상담',
  layerBefore: 'global',
  layerAfter: 'team',
  statusBefore: 'passes',
  statusAfter: 'locked',
  becomesLocked: true,
  ruleSetChanged: true,
  activeSessionCount: 2,
  blockedSessionCount: 2,
  unknownIpSessionCount: 0,
  ...over,
})

const previewResult = (over: Partial<AdminIpPreview> = {}): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 14,
    newlyLocked: 0,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
  ...over,
})

const view = (over: Partial<IpPreviewView> = {}): IpPreviewView => ({
  state: 'ready',
  op: 'update',
  result: previewResult(),
  clientIp: '203.0.113.7',
  ...over,
})

describe('층 · 상태 · 카드 줄', () => {
  it('🔴 층 없음은 "기본 거부"로, 판정 불가는 통과로 읽히지 않게', () => {
    expect(layerLabel(null, M)).toBe('규칙 없음(기본 거부)')
    expect(layerLabel('team', M)).toBe('팀 층')
    expect(statusLabel('locked', M)).toBe('잠김')
    expect(statusLabel('passes', M)).toBe('통과')
    expect(statusLabel('unknown', M)).toBe('판정 불가')
  })

  it('🔴 현재 IP — 모르면 빈 칸이 아니라 문장', () => {
    expect(currentIpLine(null, M)).toBe('현재 접속 IP 를 아직 확인하지 못했습니다.')
    expect(currentIpLine('203.0.113.7', M)).toBe('현재 접속 IP: 203.0.113.7')
  })

  it('🔴 통과 여부는 ready 일 때만 — 지어내지 않는다', () => {
    expect(passLine(view({ state: 'loading', result: null }), M)).toBeNull()
    expect(passLine(view({ state: 'failed', result: null }), M)).toBeNull()
    expect(passLine(view(), M)).toBe('이 변경 뒤에도 지금 접속(203.0.113.7)은 통과합니다.')
    expect(passLine(view({ result: previewResult({ clientPasses: false }) }), M)).toBe(
      '이 변경 뒤에는 지금 접속(203.0.113.7)이 통과하지 못합니다 — 서버가 저장을 거부합니다(409).',
    )
    expect(passLine(view({ op: null }), M)).toBe('지금 접속(203.0.113.7)은 현행 규칙을 통과합니다.')
  })

  it('서버가 주소를 못 읽었으면 "알 수 없는 주소"', () => {
    expect(
      passLine(view({ result: previewResult({ clientIp: null, clientPasses: false }) }), M),
    ).toContain('지금 접속(알 수 없는 주소)')
  })

  it('🔴 기준 줄 — 현행인지 바꾼 뒤인지 늘 적는다', () => {
    expect(basisLine(null, M)).toBe(M.basisCurrent)
    expect(basisLine('create', M)).toBe(M.basisCreate)
    expect(basisLine('update', M)).toBe(M.basisUpdate)
    expect(basisLine('delete', M)).toBe(M.basisDelete)
  })
})

describe('영향 요약 · 사람 줄', () => {
  const base = previewResult().summary

  it('0명 — 영향 없음 · 🔴 그래도 거부 세션 수를 적는다', () => {
    expect(previewSummaryLine(base, M)).toBe(
      '사용자 14명을 평가했습니다. 이 변경으로 새로 잠기는 사용자는 없습니다. 이 규칙이 거부하는 활성 세션은 평가 대상 전원을 합쳐 0개입니다.',
    )
  })

  it('판정 불가만 있으면 따로 적는다 — 0 으로 치지 않는다', () => {
    expect(previewSummaryLine({ ...base, unknown: 2 }, M)).toContain('판정 불가 2명은')
  })

  it('🔴 새로 잠김 · 이미 잠김 · 판정 불가를 가른다', () => {
    expect(
      previewSummaryLine(
        { ...base, newlyLocked: 2, alreadyLocked: 1, unknown: 1, blockedSessions: 3 },
        M,
      ),
    ).toBe(
      '사용자 14명을 평가했습니다. 🔴 이 변경으로 2명이 새로 잠깁니다. 변경 전에도 잠겨 있던 1명과 판정 불가 1명은 따로 셉니다. 이 규칙이 거부하는 활성 세션은 평가 대상 전원을 합쳐 3개입니다.',
    )
  })

  it('🔴 규칙만 바뀌는 사람 수 — 없으면 "전체 허용 좁히기"가 아무 신호도 안 낸다', () => {
    expect(previewSummaryLine({ ...base, ruleSetChangedOnly: 3 }, M)).toContain(
      '적용되는 규칙이 달라지는 사용자가 3명',
    )
  })

  it('🔴 세션 줄 세 갈래 — 층이 없으면 주소 모르는 세션도 거부 확정, 있으면 판정 불가', () => {
    expect(sessionLine(previewItem({ activeSessionCount: 0, blockedSessionCount: 0 }), M)).toBe(
      '활성 세션 없음',
    )
    expect(sessionLine(previewItem(), M)).toBe('활성 세션 2개 중 2개가 거부됩니다')
    expect(sessionLine(previewItem({ layerAfter: null, unknownIpSessionCount: 1 }), M)).toContain(
      '주소와 무관하게 거부가 확정',
    )
    expect(sessionLine(previewItem({ unknownIpSessionCount: 1 }), M)).toContain(
      '판정할 수 없습니다',
    )
  })

  it('잠기는 사람 줄 — 층 전 → 후 · 세션 · 🔴 본인 표시', () => {
    expect(lockedItemLine(previewItem(), false, M)).toBe(
      '이상담(cs07) — 전체 층 → 팀 층 · 활성 세션 2개 중 2개가 거부됩니다',
    )
    expect(lockedItemLine(previewItem(), true, M)).toBe(
      '🔴 이상담(cs07 · 본인) — 전체 층 → 팀 층 · 활성 세션 2개 중 2개가 거부됩니다',
    )
  })

  it('규칙만 바뀌는 사람 줄 — 판정 불가면 🔴, 아니면 지금 상태', () => {
    expect(
      changedItemLine(previewItem({ becomesLocked: false, statusAfter: 'unknown' }), false, M),
    ).toBe(
      '이상담(cs07) — 전체 층 → 팀 층 · 적용되는 규칙이 달라집니다 · 🔴 활성 세션의 접속 주소를 몰라 통과할지 판정할 수 없습니다',
    )
    expect(
      changedItemLine(previewItem({ becomesLocked: false, statusAfter: 'passes' }), false, M),
    ).toContain('지금은 통과')
  })

  it('목록 둘 — ready 일 때만, 서버 순서 그대로, 겹치지 않게', () => {
    const items = [
      previewItem({ userNo: 1n, becomesLocked: true }),
      previewItem({ userNo: 2n, becomesLocked: false, ruleSetChanged: true }),
      previewItem({ userNo: 3n, becomesLocked: false, ruleSetChanged: false }),
      previewItem({ userNo: 4n, becomesLocked: true }),
    ]
    const ready = view({ result: previewResult({ items }) })
    expect(lockedItemsOf(ready).map((i) => i.userNo)).toEqual([1n, 4n])
    expect(changedItemsOf(ready).map((i) => i.userNo)).toEqual([2n])
    expect(lockedItemsOf(view({ state: 'loading', result: null }))).toEqual([])
  })

  it('③ 자리 문구 — 상태마다, ready 인데 result 가 없어도 던지지 않는다', () => {
    expect(impactLine(view(), M)).toContain('사용자 14명을 평가했습니다.')
    expect(impactLine(view({ state: 'loading', result: null }), M)).toBe(M.previewLoading)
    expect(impactLine(view({ state: 'pending-input', result: null }), M)).toBe(
      M.previewPendingInput,
    )
    expect(impactLine(view({ state: 'forbidden', result: null }), M)).toBe(M.previewForbidden)
    expect(impactLine(view({ state: 'stale', result: null }), M)).toBe(M.previewStale)
    expect(impactLine(view({ state: 'failed', result: null }), M)).toBe(M.previewFailed)
    expect(impactLine(view({ state: 'ready', result: null }), M)).toBe(M.previewFailed)
  })
})

describe('전체 허용 · 관문 · 409', () => {
  it('전체 허용 CIDR 은 둘뿐', () => {
    expect(isGlobalAllowCidr(' 0.0.0.0/0 ')).toBe(true)
    expect(isGlobalAllowCidr('::/0')).toBe(true)
    expect(isGlobalAllowCidr('0.0.0.0/1')).toBe(false)
    expect(isGlobalAllowCidr('0:0:0:0:0:0:0:0/0')).toBe(true)
    expect(isGlobalAllowCidr('잘못된')).toBe(false)
  })

  it('🔴 파서로 판정 — 계열을 바꾸는 수정 · /0 의 모든 표기', () => {
    expect(removesGlobalAllow('0.0.0.0/0', '::/0')).toBe(true)
    expect(removesGlobalAllow('::/0', '0.0.0.0/0')).toBe(true)
    expect(removesGlobalAllow('::0/0', null)).toBe(true)
    expect(removesGlobalAllow('0.0.0.0/0', '0.0.0.0/00')).toBe(false)
    expect(removesGlobalAllow('::ffff:0.0.0.0/96', null)).toBe(true)
  })

  it('🔴 범위가 아니라 CIDR 로 판정 — ㉠ 좁은 전체 규칙 삭제는 경고 아님, ㉡ ::/0 을 좁히는 수정은 경고', () => {
    expect(removesGlobalAllow('0.0.0.0/0', null)).toBe(true)
    expect(removesGlobalAllow('::/0', '2001:db8::/32')).toBe(true)
    expect(removesGlobalAllow('203.0.113.0/24', null)).toBe(false)
    expect(removesGlobalAllow('0.0.0.0/0', '0.0.0.0/0')).toBe(false)
    expect(removesGlobalAllow(null, '0.0.0.0/0')).toBe(false)
  })

  it('관문 영향 한 줄 — ready 면 새로 잠김 수, 아니면 "확인하지 못했다"', () => {
    expect(
      gateImpact(
        view({
          result: previewResult({ summary: { ...previewResult().summary, newlyLocked: 2 } }),
        }),
        M,
      ),
    ).toBe('🔴 이 변경으로 2명이 새로 잠깁니다.')
    expect(gateImpact(view(), M)).toBe(M.gateImpactNone)
    expect(gateImpact(view({ state: 'failed', result: null }), M)).toBe(M.gateImpactUnknown)
  })

  it('관문 문구 — 머리말 · 되돌릴 수 없음 · 전체 허용 경고 · 영향 순서', () => {
    expect(
      gateMessage(
        {
          kind: 'remove',
          scope: '전체',
          cidr: '::/0',
          irreversible: true,
          globalRemoval: true,
          view: view(),
        },
        M,
      ),
    ).toBe(
      [
        '전체 범위의 「::/0」 규칙을 지웁니다.',
        M.irreversible,
        M.globalAllowRemoval,
        M.gateImpactNone,
      ].join(' '),
    )
    expect(
      gateMessage(
        {
          kind: 'create',
          scope: '팀 · 상담센터',
          cidr: '10.0.0.0/8',
          irreversible: false,
          globalRemoval: false,
          view: view(),
        },
        M,
      ),
    ).toBe(`팀 · 상담센터 범위의 「10.0.0.0/8」 규칙을 만듭니다. ${M.gateImpactNone}`)
  })

  it('🔴 409 — 서버 문구 그대로 + 서버가 본 주소, 문구가 비면 고정 안내', () => {
    expect(
      conflictAlertText(
        { message: '이 변경을 저장하면 …', details: { clientIp: '203.0.113.7' } },
        M,
      ),
    ).toBe('이 변경을 저장하면 … 서버가 본 지금 주소: 203.0.113.7')
    expect(conflictAlertText({ message: '전권자가 남지 않습니다.', details: undefined }, M)).toBe(
      '전권자가 남지 않습니다.',
    )
    expect(conflictAlertText({ message: ' ', details: { clientIp: null } }, M)).toBe(
      M.conflictWithoutMessage,
    )
  })
})
