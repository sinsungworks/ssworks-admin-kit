import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { actorOf, judgeAccountCommand, outsideOf, type AccountCommand } from './account-command.js'
import { ACCOUNT_MESSAGES } from './errors.js'

const root = { userNo: 1n, permissions: ['*'] }
const manager = {
  userNo: 2n,
  permissions: ['org.users:read', 'org.users:write', 'org.roles:write'],
}

function rejection(run: () => void): BusinessError {
  try {
    run()
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('던지지 않았다')
}

function expectForbidden(run: () => void, message: string, outside?: string[]): void {
  const error = rejection(run)
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  expect(error.message).toBe(message)
  if (outside !== undefined) expect(error.details).toEqual({ outside })
}

describe('judgeAccountCommand — 역할', () => {
  it('role.create — 새 권한을 덮어야 한다', () => {
    expect(() =>
      judgeAccountCommand(manager, { kind: 'role.create', next: ['org.users:read'] }),
    ).not.toThrow()
    expectForbidden(
      () =>
        judgeAccountCommand(manager, {
          kind: 'role.create',
          next: ['org.users:read', 'setting.auditLog:read'],
        }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['setting.auditLog:read'],
    )
    expectForbidden(
      () => judgeAccountCommand(manager, { kind: 'role.create', next: ['*'] }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['*'],
    )
  })

  it('🔴 role.update — permissions 가 없으면 넓은 역할도 통과(3b §9 — 이름 · 기본 여부는 고칠 수 있다)', () => {
    expect(() =>
      judgeAccountCommand(manager, { kind: 'role.update', current: ['*'] }),
    ).not.toThrow()
  })

  it('role.update — permissions 가 있으면 현재 · 새 권한을 모두 덮어야 한다', () => {
    expectForbidden(
      () =>
        judgeAccountCommand(manager, {
          kind: 'role.update',
          current: ['*'],
          next: ['org.users:read'],
        }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['*'],
    )
    expectForbidden(
      () =>
        judgeAccountCommand(manager, {
          kind: 'role.update',
          current: ['org.users:read'],
          next: ['org.users:read', 'board.posts:read'],
        }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['board.posts:read'],
    )
    expect(() =>
      judgeAccountCommand(manager, {
        kind: 'role.update',
        current: ['org.users:write'],
        next: ['org.users:read'],
      }),
    ).not.toThrow()
  })

  it('role.delete — 현재 권한을 덮어야 한다', () => {
    expectForbidden(
      () =>
        judgeAccountCommand(manager, { kind: 'role.delete', current: ['setting.auditLog:read'] }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['setting.auditLog:read'],
    )
    expect(() => judgeAccountCommand(manager, { kind: 'role.delete', current: [] })).not.toThrow()
  })
})

describe('judgeAccountCommand — 사용자 · 세션', () => {
  it('user.create — 줄 역할을 덮어야 한다', () => {
    expectForbidden(
      () => judgeAccountCommand(manager, { kind: 'user.create', grant: ['*'] }),
      ACCOUNT_MESSAGES.higherRoleToGrant,
      ['*'],
    )
  })

  it('user.update — 대상의 현재 역할 + 새 역할, 자기 계정 허용(이름 · 팀 · 내리는 역할)', () => {
    expectForbidden(
      () => judgeAccountCommand(manager, { kind: 'user.update', targetUserNo: 9n, current: ['*'] }),
      ACCOUNT_MESSAGES.higherAccount,
      ['*'],
    )
    expectForbidden(
      () =>
        judgeAccountCommand(manager, {
          kind: 'user.update',
          targetUserNo: 9n,
          current: [],
          grant: ['setting.auditLog:read'],
        }),
      ACCOUNT_MESSAGES.higherRoleToGrant,
      ['setting.auditLog:read'],
    )
    expect(() =>
      judgeAccountCommand(manager, {
        kind: 'user.update',
        targetUserNo: manager.userNo,
        current: manager.permissions,
        grant: ['org.users:read'],
      }),
    ).not.toThrow()
  })

  it("🔴 자기 계정의 퇴사 · 퇴사일 · 초기화 · 잠금 해제는 403 selfAccount — 덮기보다 먼저('*' 행위자도)", () => {
    for (const kind of [
      'user.resign',
      'user.resignDate',
      'user.passwordReset',
      'user.unlock',
    ] as const) {
      const error = rejection(() =>
        judgeAccountCommand(root, { kind, targetUserNo: root.userNo, current: ['*'] }),
      )
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
      expect(error.message).toBe(ACCOUNT_MESSAGES.selfAccount)
      expectForbidden(
        () => judgeAccountCommand(manager, { kind, targetUserNo: 9n, current: ['*'] }),
        ACCOUNT_MESSAGES.higherAccount,
        ['*'],
      )
      expect(() =>
        judgeAccountCommand(root, { kind, targetUserNo: 9n, current: ['*'] }),
      ).not.toThrow()
    }
  })

  it('user.rehire — 자기 계정 허용(퇴사 예정인 본인), 넓은 계정은 403', () => {
    expect(() =>
      judgeAccountCommand(manager, {
        kind: 'user.rehire',
        targetUserNo: manager.userNo,
        current: [],
      }),
    ).not.toThrow()
    expectForbidden(
      () => judgeAccountCommand(manager, { kind: 'user.rehire', targetUserNo: 9n, current: ['*'] }),
      ACCOUNT_MESSAGES.higherAccount,
    )
  })

  it('session.target — 세션 주인의 역할을 덮어야 한다, 본인은 늘 통과', () => {
    expectForbidden(
      () =>
        judgeAccountCommand(manager, { kind: 'session.target', targetUserNo: 9n, current: ['*'] }),
      ACCOUNT_MESSAGES.higherAccountSessions,
      ['*'],
    )
    expect(() =>
      judgeAccountCommand(manager, {
        kind: 'session.target',
        targetUserNo: manager.userNo,
        current: manager.permissions,
      }),
    ).not.toThrow()
  })

  it("'*' 행위자는 무엇이든 덮는다(자기 계정 넷만 빼고)", () => {
    const commands: AccountCommand[] = [
      { kind: 'role.create', next: ['*'] },
      { kind: 'role.update', current: ['*'], next: ['*'] },
      { kind: 'role.delete', current: ['*'] },
      { kind: 'user.create', grant: ['*'] },
      { kind: 'user.update', targetUserNo: 9n, current: ['*'], grant: ['*'] },
      { kind: 'session.target', targetUserNo: 9n, current: ['*'] },
    ]
    for (const command of commands) expect(() => judgeAccountCommand(root, command)).not.toThrow()
  })
})

describe('outsideOf · actorOf', () => {
  it("덮지 못한 키만 중복 없이, 행위자가 '*' 면 빈 배열", () => {
    expect(outsideOf(['a'], ['a', 'b', 'b', 'c'])).toEqual(['b', 'c'])
    expect(outsideOf(['*'], ['a', '*'])).toEqual([])
    expect(outsideOf([], ['*'])).toEqual(['*'])
  })

  it("대상에 '*' 가 섞여 있으면(정규화 전) 정확히 ['*'] — 스펙 §5-2", () => {
    expect(outsideOf(['a'], ['b', '*'])).toEqual(['*'])
  })

  it('주체에서 userNo · permissions 만 꺼낸다', () => {
    expect(actorOf({ userNo: 5n, permissions: ['x'] })).toEqual({ userNo: 5n, permissions: ['x'] })
  })
})
