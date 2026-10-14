import { describe, expect, it } from 'vitest'
import {
  CORE_AUDIT_ACTION_LABELS,
  CORE_AUDIT_TARGET_LABELS,
  CoreAuditActions,
  CoreAuditTargets,
  adminAuditLogQuerySchema,
  adminAuditLogSchema,
  coreAuditCatalog,
  defineAuditCatalog,
  queryBigIntSchema,
} from './audit.js'

describe('코어 카탈로그', () => {
  it('🔴 액션 29 · 대상 4 · 라벨이 하나씩 — 개수는 이 테스트가 고정한다(산문의 개수는 낡는다)', () => {
    expect(Object.values(CoreAuditActions)).toHaveLength(29)
    expect(Object.values(CoreAuditTargets)).toEqual(['user', 'session', 'role', 'team'])
    expect(Object.keys(CORE_AUDIT_ACTION_LABELS).sort()).toEqual(
      [...Object.values(CoreAuditActions)].sort(),
    )
    expect(Object.keys(CORE_AUDIT_TARGET_LABELS).sort()).toEqual([
      'role',
      'session',
      'team',
      'user',
    ])
  })

  it('이름은 hangang 그대로 + session.revoke.others', () => {
    expect(CoreAuditActions.AUTH_LOGIN_BLOCKED_INACTIVE).toBe('auth.login.blocked.inactive')
    expect(CoreAuditActions.SESSION_REVOKE_OTHERS).toBe('session.revoke.others')
    expect(coreAuditCatalog.labelOf('session.revoke.others')).toBe('본인 다른 세션 모두 종료')
  })

  it('역할 액션(2d) — hangang 이름 org.role.* 와 라벨', () => {
    expect([
      CoreAuditActions.ROLE_CREATE,
      CoreAuditActions.ROLE_UPDATE,
      CoreAuditActions.ROLE_DELETE,
      CoreAuditActions.ROLE_MOVE,
    ]).toEqual(['org.role.create', 'org.role.update', 'org.role.delete', 'org.role.move'])
    expect(coreAuditCatalog.labelOf('org.role.move')).toBe('역할 표시 순서 변경')
    expect(coreAuditCatalog.targetLabelOf('role')).toBe('역할')
  })

  it('사용자 액션(2d-2) — hangang 이름 org.user.* + gise 잠금 해제와 라벨', () => {
    expect([
      CoreAuditActions.USER_CREATE,
      CoreAuditActions.USER_UPDATE,
      CoreAuditActions.USER_RESIGN,
      CoreAuditActions.USER_RESIGN_DATE_UPDATE,
      CoreAuditActions.USER_REHIRE,
      CoreAuditActions.USER_PASSWORD_RESET,
      CoreAuditActions.USER_UNLOCK,
    ]).toEqual([
      'org.user.create',
      'org.user.update',
      'org.user.resign',
      'org.user.resignDate.update',
      'org.user.rehire',
      'org.user.password.reset',
      'org.user.unlock',
    ])
    expect(coreAuditCatalog.labelOf('org.user.resignDate.update')).toBe('퇴사일 정정')
    expect(coreAuditCatalog.labelOf('org.user.password.reset')).toBe('비밀번호 초기화')
    expect(coreAuditCatalog.labelOf('org.user.unlock')).toBe('잠금 해제')
  })

  it('팀 액션(2e-1) — hangang 이름 org.team.* 와 라벨', () => {
    expect([
      CoreAuditActions.TEAM_CREATE,
      CoreAuditActions.TEAM_UPDATE,
      CoreAuditActions.TEAM_DELETE,
      CoreAuditActions.TEAM_MOVE,
    ]).toEqual(['org.team.create', 'org.team.update', 'org.team.delete', 'org.team.move'])
    expect(coreAuditCatalog.labelOf('org.team.create')).toBe('팀 생성')
    expect(coreAuditCatalog.labelOf('org.team.update')).toBe('팀 수정')
    expect(coreAuditCatalog.labelOf('org.team.delete')).toBe('팀 삭제')
    expect(coreAuditCatalog.labelOf('org.team.move')).toBe('팀 이동')
    expect(coreAuditCatalog.targetLabelOf('team')).toBe('팀')
  })
})

describe('defineAuditCatalog', () => {
  const catalog = defineAuditCatalog({
    actions: { BOARD_POST_CREATE: 'board.post.create' },
    targets: { POST: 'post' },
    labels: { 'board.post.create': '게시글 작성', 'auth.logout': '나가기' },
    targetLabels: { post: '게시글' },
  })

  it('코어 + 프로젝트를 합치고 코어 라벨을 덮어쓴다', () => {
    expect(catalog.AuditActions.BOARD_POST_CREATE).toBe('board.post.create')
    expect(catalog.AuditActions.AUTH_LOGOUT).toBe('auth.logout')
    expect(catalog.ACTION_VALUES).toHaveLength(30)
    expect(catalog.TARGET_VALUES).toEqual(['user', 'session', 'role', 'team', 'post'])
    expect(catalog.labelOf('board.post.create')).toBe('게시글 작성')
    expect(catalog.labelOf('auth.logout')).toBe('나가기')
    expect(catalog.targetLabelOf('post')).toBe('게시글')
    expect(catalog.isAuditAction('board.post.create')).toBe(true)
    expect(catalog.isAuditAction('board.post.delete')).toBe(false)
    expect(catalog.isAuditTarget('post')).toBe(true)
  })

  it('🔴 모르는 값은 원문 그대로 — Object.prototype 이름도', () => {
    expect(catalog.labelOf('old.removed.action')).toBe('old.removed.action')
    expect(catalog.labelOf('constructor')).toBe('constructor')
    expect(catalog.targetLabelOf('toString')).toBe('toString')
    expect(catalog.isAuditAction('constructor')).toBe(false)
  })

  it('🔴 코어 키 · 코어 값과 겹치면 던진다', () => {
    expect(() =>
      defineAuditCatalog({ actions: { AUTH_LOGOUT: 'x.logout' }, labels: { 'x.logout': 'x' } }),
    ).toThrow('AUTH_LOGOUT')
    expect(() =>
      defineAuditCatalog({ actions: { MY_LOGOUT: 'auth.logout' }, labels: {} as never }),
    ).toThrow('auth.logout')
  })

  it('🔴 라벨이 빠지면 던진다', () => {
    expect(() =>
      defineAuditCatalog({ actions: { A: 'a.b' }, labels: {} as Record<'a.b', string> }),
    ).toThrow('라벨이 없는 액션: a.b')
    expect(() =>
      defineAuditCatalog({ targets: { P: 'p' }, targetLabels: {} as Record<'p', string> }),
    ).toThrow('라벨이 없는 대상: p')
  })

  it('폭을 넘는 값은 던진다(액션 128 · 대상 64)', () => {
    const long = `a.${'x'.repeat(127)}`
    expect(() =>
      defineAuditCatalog({
        actions: { L: long },
        labels: { [long]: 'l' } as Record<string, string>,
      }),
    ).toThrow('128')
  })
})

describe('queryBigIntSchema', () => {
  it('숫자만 든 문자열 · bigint 를 bigint 로', () => {
    expect(queryBigIntSchema.parse('3')).toBe(3n)
    expect(queryBigIntSchema.parse(7n)).toBe(7n)
    expect(queryBigIntSchema.parse('18446744073709551615')).toBe(18446744073709551615n)
  })

  it('🔴 빈 문자열 · 공백 · 부호 · 소수 · 지수 · 범위 밖은 거부 — BigInt("") 는 0n 이다', () => {
    for (const value of ['', ' 3', '3 ', '-1', '+1', '1.5', '1e3', '18446744073709551616', 'abc']) {
      expect(queryBigIntSchema.safeParse(value).success, value).toBe(false)
    }
    expect(queryBigIntSchema.safeParse(-1n).success).toBe(false)
  })
})

describe('감사 행 · 조회 스키마', () => {
  const ROW = {
    logNo: 1n,
    actorUserNo: 3n,
    actorUserId: 'admin',
    actorUserName: '관리자',
    sessionNo: 9n,
    action: 'session.revoke',
    targetType: 'session',
    targetRefNo: 12n,
    method: 'DELETE',
    path: '/api/admin/sessions/12',
    statusCode: 200,
    errorCode: null,
    ip: '10.0.0.1',
    userAgent: 'UA',
    meta: { revokedCount: 1 },
    createAt: '2026-10-14T01:02:03.000Z',
  }

  it('행을 받는다 — 행위자 · 대상 · IP 는 null 허용, action 은 열린 문자열', () => {
    expect(adminAuditLogSchema.parse(ROW)).toEqual(ROW)
    expect(
      adminAuditLogSchema.parse({
        ...ROW,
        actorUserNo: null,
        actorUserId: null,
        actorUserName: null,
        sessionNo: null,
        targetType: null,
        targetRefNo: null,
        ip: null,
        action: 'future.action',
        meta: null,
      }).action,
    ).toBe('future.action')
  })

  it('조회 쿼리 — 와이어의 문자열을 읽고 정렬 기본은 createAt', () => {
    const parsed = adminAuditLogQuerySchema.parse({
      page: '2',
      itemsPerPage: '50',
      filter: {
        actorUserNo: '7',
        action: 'session.revoke',
        actionMatch: 'exact',
        targetType: 'session',
        targetRefNo: '12',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-02T00:00:00.000Z',
      },
    })
    expect(parsed).toEqual({
      page: 2,
      itemsPerPage: 50,
      sortBy: ['createAt'],
      sortOrder: ['desc'],
      filter: {
        actorUserNo: 7n,
        action: 'session.revoke',
        actionMatch: 'exact',
        targetType: 'session',
        targetRefNo: 12n,
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-02T00:00:00.000Z',
      },
    })
  })

  it('정렬 열은 createAt 뿐, 빈 액션 · 오프셋 시각은 거부', () => {
    expect(adminAuditLogQuerySchema.safeParse({ sortBy: 'action' }).success).toBe(false)
    expect(adminAuditLogQuerySchema.safeParse({ filter: { action: '' } }).success).toBe(false)
    expect(
      adminAuditLogQuerySchema.safeParse({ filter: { from: '2026-10-01T09:00:00+09:00' } }).success,
    ).toBe(false)
  })
})
