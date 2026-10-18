import { describe, expect, it } from 'vitest'
import { coreAuditCatalog, defineAuditCatalog } from '@ssworks/admin-shared'
import {
  CORE_AUDIT_ACTION_GROUPS,
  DEFAULT_AUDIT_LOG_MESSAGES as M,
  actorOptionTitle,
  actorText,
  auditFilterProblem,
  auditResultOf,
  auditResultText,
  buildActionOptions,
  decodeAuditLogQuery,
  diffAuditMeta,
  encodeAuditLogQuery,
  emptyAuditLogDraft,
  isEmptyAuditLogDraft,
  mergeActionGroups,
  metaJson,
  normalizeAuditLogDraft,
  sameAuditLogDraft,
  targetOptions,
  targetText,
  toActionFilter,
  toAuditFilter,
  type AuditLogDraft,
} from './audit-log.js'

// 정본: hangang-home apps/admin/src/pages/settings/audit-logs-messages.test.ts 의 사례를 킷 행 모양으로 옮겼다.

const project = defineAuditCatalog({
  actions: { POINT_ADJUST: 'members.points.adjust', POINT_GRANT: 'members.points.grant' },
  targets: { MEMBER: 'member' },
  labels: { 'members.points.adjust': '포인트 조정', 'members.points.grant': '포인트 지급' },
  targetLabels: { member: '회원' },
})

const draft = (over: Partial<AuditLogDraft> = {}): AuditLogDraft => ({
  ...emptyAuditLogDraft(),
  ...over,
})
const localMidnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

describe('결과 갈래', () => {
  it.each([
    [199, 'success'],
    [200, 'success'],
    [299, 'success'],
    [300, 'redirect'],
    [399, 'redirect'],
    [400, 'denied'],
    [499, 'denied'],
    [500, 'error'],
  ] as const)('%i → %s', (status, kind) => {
    expect(auditResultOf(status)).toBe(kind)
  })

  it('🔴 숫자와 글자를 함께 낸다 — 색으로만 가르지 않는다', () => {
    expect(auditResultText(401, M)).toBe('401 · 거부')
    expect(auditResultText(503, M)).toBe('503 · 서버 오류')
    expect(auditResultText(201, M)).toBe('201 · 성공')
  })
})

describe('행위자 · 대상 표기', () => {
  const actor = (
    actorUserNo: bigint | null,
    actorUserId: string | null,
    actorUserName: string | null,
  ) => ({
    actorUserNo,
    actorUserId,
    actorUserName,
  })

  it('이름(아이디) → #번호 (계정 정보 없음) → 계정 없음', () => {
    expect(actorText(actor(12n, 'ops01', '김운영'), M)).toBe('김운영 (ops01)')
    expect(actorText(actor(12n, 'ops01', null), M)).toBe('— (ops01)')
    expect(actorText(actor(41n, null, null), M)).toBe('#41 (계정 정보 없음)')
    expect(actorText(actor(null, null, null), M)).toBe('계정 없음')
  })

  it('자동완성 항목 — 퇴사자는 표시를 붙인다', () => {
    expect(
      actorOptionTitle({ userNo: 30n, userId: 'old03', userName: '이퇴사', resigned: true }, M),
    ).toBe('이퇴사 (old03) · 퇴사')
    expect(actorOptionTitle({ userNo: 12n, userId: 'ops01', userName: '김운영' }, M)).toBe(
      '김운영 (ops01)',
    )
  })

  it('대상 — 라벨 #번호 · 종류 없음 — · 모르는 종류는 원문', () => {
    expect(targetText({ targetType: 'role', targetRefNo: 3n }, coreAuditCatalog)).toBe('역할 #3')
    expect(targetText({ targetType: 'role', targetRefNo: null }, coreAuditCatalog)).toBe('역할')
    expect(targetText({ targetType: null, targetRefNo: null }, coreAuditCatalog)).toBe('—')
    expect(targetText({ targetType: 'widget', targetRefNo: 9n }, coreAuditCatalog)).toBe(
      'widget #9',
    )
  })
})

describe('동작 항목', () => {
  it('묶음 목록 — 코어 뒤에 프로젝트를 더하고, prefix 가 같으면 라벨만 덮는다', () => {
    const merged = mergeActionGroups([
      { prefix: 'org.user', label: '직원' },
      { prefix: 'members.points.', label: '포인트' },
    ])
    expect(merged.map((g) => g.prefix)).toEqual([
      ...CORE_AUDIT_ACTION_GROUPS.map((g) => g.prefix),
      'members.points',
    ])
    expect(merged.find((g) => g.prefix === 'org.user')?.label).toBe('직원')
    // 코어 상수는 바뀌지 않는다
    expect(CORE_AUDIT_ACTION_GROUPS.find((g) => g.prefix === 'org.user')?.label).toBe('사용자')
  })

  it('🔴 묶음 값은 끝에 점 — 묶음이 먼저, 개별은 카탈로그 순서', () => {
    const items = buildActionOptions(coreAuditCatalog, mergeActionGroups(), M)
    expect(items[0]).toEqual({ value: 'auth.', title: '[묶음] 인증 (auth.*)' })
    expect(items.filter((i) => i.value.endsWith('.')).map((i) => i.value)).toEqual([
      'auth.',
      'auth.login.',
      'session.',
      'org.role.',
      'org.user.',
      'org.team.',
      'setting.',
    ])
    const individual = items.filter((i) => !i.value.endsWith('.'))
    expect(individual.map((i) => i.value)).toEqual([...coreAuditCatalog.ACTION_VALUES])
    expect(individual[0]).toEqual({
      value: 'auth.login.success',
      title: '로그인 성공 (auth.login.success)',
    })
  })

  it('🔴 걸리는 액션이 하나뿐인 묶음은 항목이 되지 않는다', () => {
    const items = buildActionOptions(
      project,
      mergeActionGroups([
        { prefix: 'setting.legal', label: '약관' },
        { prefix: 'members.points', label: '포인트' },
      ]),
      M,
    )
    expect(items.some((i) => i.value === 'setting.legal.')).toBe(false)
    expect(items).toContainEqual({
      value: 'members.points.',
      title: '[묶음] 포인트 (members.points.*)',
    })
    expect(items).toContainEqual({
      value: 'members.points.adjust',
      title: '포인트 조정 (members.points.adjust)',
    })
  })

  it('라벨이 코드와 같으면(모르는 코드) 한 번만 적는다', () => {
    expect(M.actionItem('x.y', 'x.y')).toBe('x.y')
  })

  it('🔴 끝 점이면 prefix, 아니면 exact — session.revoke 는 exact 다', () => {
    expect(toActionFilter('')).toBeNull()
    expect(toActionFilter('org.role.')).toEqual({ action: 'org.role.', actionMatch: 'prefix' })
    expect(toActionFilter('org.role.update')).toEqual({
      action: 'org.role.update',
      actionMatch: 'exact',
    })
    expect(toActionFilter('session.revoke')).toEqual({
      action: 'session.revoke',
      actionMatch: 'exact',
    })
  })

  it('대상 종류 — 라벨 가나다순, 값은 코드', () => {
    const items = targetOptions(project)
    const titles = items.map((i) => i.title)
    expect(titles.indexOf('사용자')).toBeLessThan(titles.indexOf('팀'))
    expect(titles.indexOf('팀')).toBeLessThan(titles.indexOf('회원'))
    expect(items).toContainEqual({ value: 'member', title: '회원' })
  })
})

describe('diffAuditMeta', () => {
  it('meta 가 없으면 아무것도 없다', () => {
    expect(diffAuditMeta(null, M.absent)).toEqual({
      hasDiff: false,
      changes: [],
      masked: [],
      rest: null,
    })
    expect(diffAuditMeta(undefined, M.absent).rest).toBeNull()
  })

  it('before · after 없이 다른 키만 — 기타 기록', () => {
    expect(diffAuditMeta({ rotated: true }, M.absent)).toEqual({
      hasDiff: false,
      changes: [],
      masked: [],
      rest: { rotated: true },
    })
  })

  it('바뀐 항목만 — 같은 값은 빼고, 문자열이 아니면 JSON, 나머지 키는 rest', () => {
    const diff = diffAuditMeta(
      {
        before: { roleName: '상담원', isDefault: false, permissions: ['a'] },
        after: { roleName: '상담 매니저', isDefault: false, permissions: ['a', 'b'] },
        clearedDefaults: ['상담원 기본'],
      },
      M.absent,
    )
    expect(diff.hasDiff).toBe(true)
    expect(diff.changes).toEqual([
      { key: 'roleName', before: '상담원', after: '상담 매니저' },
      { key: 'permissions', before: '["a"]', after: '["a","b"]' },
    ])
    expect(diff.rest).toEqual({ clearedDefaults: ['상담원 기본'] })
  })

  it('만들기 · 삭제 — 한쪽에 없는 키는 (없음)', () => {
    expect(
      diffAuditMeta({ before: {}, after: { cidr: '203.0.113.0/24' } }, M.absent).changes,
    ).toEqual([{ key: 'cidr', before: '(없음)', after: '203.0.113.0/24' }])
    expect(diffAuditMeta({ before: { cidr: '0.0.0.0/0' }, after: {} }, M.absent).changes).toEqual([
      { key: 'cidr', before: '0.0.0.0/0', after: '(없음)' },
    ])
  })

  it('🔴 가린 값(***)은 표에서 빼고 이름만 모은다', () => {
    const diff = diffAuditMeta(
      { before: { apiSecret: '***', memo: 'a' }, after: { apiSecret: '***', memo: 'b' } },
      M.absent,
    )
    expect(diff.masked).toEqual(['apiSecret'])
    expect(diff.changes).toEqual([{ key: 'memo', before: 'a', after: 'b' }])
  })

  it('같은 값뿐이면 hasDiff 는 참, 바뀐 항목은 없다', () => {
    const diff = diffAuditMeta({ before: { a: 1 }, after: { a: 1 } }, M.absent)
    expect(diff).toEqual({ hasDiff: true, changes: [], masked: [], rest: null })
  })

  it('객체가 아닌 meta · 객체가 아닌 before 는 통째로 기타 기록 — 던지지 않는다', () => {
    expect(diffAuditMeta([1, 2], M.absent)).toEqual({
      hasDiff: false,
      changes: [],
      masked: [],
      rest: [1, 2],
    })
    expect(diffAuditMeta('x', M.absent).rest).toBe('x')
    expect(diffAuditMeta({ before: [1], after: [2] }, M.absent)).toEqual({
      hasDiff: false,
      changes: [],
      masked: [],
      rest: { before: [1], after: [2] },
    })
    // 서버의 64 KiB 자리표시
    expect(diffAuditMeta({ _truncated: true, bytes: 70000 }, M.absent).rest).toEqual({
      _truncated: true,
      bytes: 70000,
    })
  })

  it('metaJson — 들여쓴 JSON, bigint 가 섞여도 던지지 않는다', () => {
    expect(metaJson({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(() => metaJson({ n: 1n })).not.toThrow()
  })
})

describe('입력값', () => {
  it('비었는가 · 같은가 · 앞뒤 공백 떼기', () => {
    expect(isEmptyAuditLogDraft(emptyAuditLogDraft())).toBe(true)
    expect(isEmptyAuditLogDraft(draft({ action: 'auth.' }))).toBe(false)
    expect(sameAuditLogDraft(draft({ action: 'auth.' }), draft({ action: 'auth.' }))).toBe(true)
    expect(sameAuditLogDraft(draft({ action: 'auth.' }), draft({ action: 'auth.login.' }))).toBe(
      false,
    )
    expect(normalizeAuditLogDraft(draft({ targetRefNo: ' 3 ', actorUserNo: '12 ' }))).toEqual(
      draft({ targetRefNo: '3', actorUserNo: '12' }),
    )
  })

  it('번호 칸은 앞의 0 을 떼어 URL 코덱과 같은 꼴로 맞춘다 — 숫자가 아니면 그대로', () => {
    expect(normalizeAuditLogDraft(draft({ actorUserNo: ' 007 ', targetRefNo: '0' }))).toEqual(
      draft({ actorUserNo: '7', targetRefNo: '0' }),
    )
    expect(normalizeAuditLogDraft(draft({ actorUserNo: 'abc' })).actorUserNo).toBe('abc')
  })

  it('검증 — 번호 형식 · 날짜 형식 · 기간 역전, 같은 날 · 한쪽만은 정상', () => {
    expect(auditFilterProblem(draft(), M)).toBeNull()
    expect(auditFilterProblem(draft({ actorUserNo: 'abc' }), M)).toBe(M.actorRefInvalid)
    expect(auditFilterProblem(draft({ actorUserNo: '1'.repeat(21) }), M)).toBe(M.actorRefInvalid)
    expect(auditFilterProblem(draft({ targetRefNo: '1.5' }), M)).toBe(M.targetRefInvalid)
    expect(auditFilterProblem(draft({ from: '2026-02-30' }), M)).toBe(M.dateInvalid)
    expect(auditFilterProblem(draft({ from: '2026-10-18', to: '2026-10-01' }), M)).toBe(
      M.rangeReversed,
    )
    expect(auditFilterProblem(draft({ from: '2026-10-18', to: '2026-10-18' }), M)).toBeNull()
    expect(auditFilterProblem(draft({ to: '2026-10-18' }), M)).toBeNull()
  })

  it('서버 필터 — 빈 칸은 키째 빠지고, 번호는 bigint, 날짜는 반열림 ISO', () => {
    expect(toAuditFilter(emptyAuditLogDraft())).toEqual({})
    const filter = toAuditFilter(
      draft({
        actorUserNo: '12',
        action: 'org.role.',
        targetType: 'role',
        targetRefNo: '3',
        from: '2026-10-01',
        to: '2026-10-18',
      }),
    )
    expect(filter).toEqual({
      actorUserNo: 12n,
      action: 'org.role.',
      actionMatch: 'prefix',
      targetType: 'role',
      targetRefNo: 3n,
      from: localMidnight(2026, 10, 1),
      to: localMidnight(2026, 10, 19),
    })
    expect(Object.keys(toAuditFilter(draft({ action: 'auth.logout' })))).toEqual([
      'action',
      'actionMatch',
    ])
  })
})

describe('URL 코덱(A6)', () => {
  it('키를 읽어 입력값으로 — 날짜는 로컬 YYYY-MM-DD 그대로', () => {
    expect(
      decodeAuditLogQuery({
        actor: '12',
        action: 'org.role.',
        targetType: 'role',
        targetRefNo: '3',
        from: '2026-10-01',
        to: '2026-10-18',
      }),
    ).toEqual(
      draft({
        actorUserNo: '12',
        action: 'org.role.',
        targetType: 'role',
        targetRefNo: '3',
        from: '2026-10-01',
        to: '2026-10-18',
      }),
    )
  })

  it('🔴 틀린 키는 없는 것으로 — 앞자리 0 · 문자 번호 · 없는 날짜 · 넘친 길이', () => {
    expect(
      decodeAuditLogQuery({
        actor: '007',
        targetRefNo: 'abc',
        from: '2026-02-30',
        to: 'x',
        action: 'a'.repeat(129),
        targetType: 't'.repeat(65),
      }),
    ).toEqual(emptyAuditLogDraft())
  })

  it('🔴 거꾸로 된 기간은 둘 다 버린다 — 서버에 400 을 보내지 않는다', () => {
    expect(decodeAuditLogQuery({ from: '2026-10-18', to: '2026-10-01' })).toEqual(
      emptyAuditLogDraft(),
    )
  })

  it('반복 키는 첫 값 · 빈 값은 없음', () => {
    expect(decodeAuditLogQuery({ actor: ['5', '6'], action: '' })).toEqual(
      draft({ actorUserNo: '5' }),
    )
  })

  it('빈 칸은 URL 에서 뺀다', () => {
    expect(encodeAuditLogQuery(emptyAuditLogDraft())).toEqual({})
    expect(encodeAuditLogQuery(draft({ actorUserNo: '12', to: '2026-10-18' }))).toEqual({
      actor: '12',
      to: '2026-10-18',
    })
  })
})
