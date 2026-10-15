import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { PERMISSION_SLOT } from '../tokens.js'
import {
  ADMIN_PERMISSION_SLOTS,
  RequirePermissionSlot,
  assertPermissionSlots,
  resolvePermissionMap,
} from './permission-slots.js'

class Routes {
  @RequirePermissionSlot('sessions.read')
  read() {}

  @RequirePermissionSlot('roles.read', 'users.read')
  either() {}
}

describe('RequirePermissionSlot', () => {
  it('슬롯 이름을 얼린 배열 메타데이터로 남긴다', () => {
    expect(Reflect.getMetadata(PERMISSION_SLOT, Routes.prototype.read)).toEqual(['sessions.read'])
    const either = Reflect.getMetadata(PERMISSION_SLOT, Routes.prototype.either) as unknown[]
    expect(either).toEqual(['roles.read', 'users.read'])
    expect(Object.isFrozen(either)).toBe(true)
  })
})

describe('resolvePermissionMap', () => {
  it('아는 슬롯만 얼린 사본으로', () => {
    const resolved = resolvePermissionMap({ 'sessions.read': 'org.users:read' })
    expect(resolved).toEqual({ 'sessions.read': 'org.users:read' })
    expect(Object.isFrozen(resolved)).toBe(true)
    expect(resolvePermissionMap(undefined)).toEqual({})
  })

  it('🔴 모르는 슬롯(오타)은 기동에서 멈춘다', () => {
    expect(() =>
      resolvePermissionMap({ 'session.read': 'x' } as unknown as Record<string, string>),
    ).toThrow('모르는 권한 슬롯이 있다: session.read')
  })

  it('빈 키 · 공백 키 · 문자열 아닌 키는 멈춘다', () => {
    for (const key of ['', '   ', 1]) {
      expect(() =>
        resolvePermissionMap({ 'sessions.read': key } as unknown as Record<string, string>),
      ).toThrow("permissions['sessions.read']")
    }
  })

  it('슬롯은 열셋 — 2c 셋 + 역할 둘(2d-1) + 사용자 둘(2d-2) + 팀 둘(2e-1) + 약관 둘(2e-2) + IP 둘(2f-1)', () => {
    expect(ADMIN_PERMISSION_SLOTS).toEqual([
      'sessions.read',
      'sessions.manage',
      'auditLogs.read',
      'roles.read',
      'roles.manage',
      'users.read',
      'users.manage',
      'teams.read',
      'teams.manage',
      'legal.read',
      'legal.publish',
      'ipAccess.read',
      'ipAccess.manage',
    ])
  })
})

describe('assertPermissionSlots', () => {
  it('다 이어졌으면 통과', () => {
    expect(() =>
      assertPermissionSlots(
        { 'sessions.read': 'a', 'sessions.manage': 'b' },
        ['sessions.read', 'sessions.manage'],
        'AdminSessionsModule',
      ),
    ).not.toThrow()
  })

  it('🔴 빠진 슬롯을 모아 한 번에 — 배선 예시와 함께', () => {
    expect(() =>
      assertPermissionSlots({ 'sessions.read': '  ' }, ['sessions.read', 'sessions.manage'], 'M'),
    ).toThrow(
      "M 의 권한 슬롯이 이어지지 않았다: sessions.read, sessions.manage — AdminServerModule 옵션에 permissions: { 'sessions.read': '<프로젝트 권한 키>', 'sessions.manage': '<프로젝트 권한 키>' } 를 더한다.",
    )
    expect(() => assertPermissionSlots(undefined, ['auditLogs.read'], 'M')).toThrow(
      'auditLogs.read',
    )
  })
})
