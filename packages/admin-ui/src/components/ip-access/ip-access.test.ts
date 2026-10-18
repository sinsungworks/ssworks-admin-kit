import { describe, expect, it } from 'vitest'
import {
  IP_ACCESS_SCHEMA_MESSAGES,
  type AdminIpRule,
  type AdminTeamNode,
} from '@ssworks/admin-shared'
import {
  DEFAULT_IP_ACCESS_MESSAGES as M,
  IP_RULE_FORM_FIELDS,
  emptyIpRuleForm,
  flattenTeamPaths,
  formScopeTitle,
  ipRuleFormProblems,
  isIpRuleFormPreviewable,
  previewQueryKey,
  previewQueryOf,
  ruleScopeSub,
  ruleScopeTitle,
  ruleToForm,
  sameIpRuleForm,
  scopeTypeItems,
  toCreateBody,
  toUpdateBody,
  userOptionTitle,
  withScopeType,
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
