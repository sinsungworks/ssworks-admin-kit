import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import {
  getAdminPrincipal,
  setAdminPrincipal,
  toAdminMe,
  type AdminPrincipal,
} from './principal.js'

const principal: AdminPrincipal = {
  userNo: 7n,
  sessionNo: 70n,
  userId: 'admin',
  userName: '관리자',
  roleNo: 1n,
  roleName: '최고 관리자',
  teamNo: 3n,
  teamName: '운영팀',
  permissions: ['*'],
  isPasswordChangeRequired: false,
}

describe('toAdminMe', () => {
  it('sessionNo 를 빼고 나머지를 싣는다', () => {
    expect(toAdminMe(principal)).toEqual({
      userNo: 7n,
      userId: 'admin',
      userName: '관리자',
      roleNo: 1n,
      roleName: '최고 관리자',
      teamNo: 3n,
      teamName: '운영팀',
      permissions: ['*'],
      isPasswordChangeRequired: false,
    })
  })

  it('팀이 없으면 teamNo · teamName 키를 뺀다(AdminUserInfo 의 ?:)', () => {
    const me = toAdminMe({ ...principal, teamNo: null, teamName: null })
    expect(me).not.toHaveProperty('teamNo')
    expect(me).not.toHaveProperty('teamName')
  })
})

describe('getAdminPrincipal · setAdminPrincipal', () => {
  it('req.admin 에 두고 꺼낸다', () => {
    const req = {} as Request
    expect(getAdminPrincipal(req)).toBeUndefined()
    setAdminPrincipal(req, principal)
    expect(getAdminPrincipal(req)).toBe(principal)
    expect((req as unknown as { admin: unknown }).admin).toBe(principal)
  })
})
