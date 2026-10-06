import { describe, expect, it } from 'vitest'
import {
  adminSessionListItemSchema,
  adminSessionRevokeResultSchema,
  adminSessionSchema,
} from './sessions.js'

const SESSION = {
  sessionNo: 1n,
  userAgent: 'Mozilla/5.0',
  ipAddress: '10.0.0.1',
  loginAt: '2026-10-05T00:00:00.000Z',
  lastAccessAt: '2026-10-05T01:00:00.000Z',
  expireAt: '2026-10-12T01:00:00.000Z',
  isCurrent: false,
}

describe('adminSessionSchema', () => {
  it('세션 행을 받는다', () => {
    expect(adminSessionSchema.parse(SESSION)).toEqual(SESSION)
  })

  it('🔴 isCurrent 는 필수다 — 현재 세션을 목록에서 끊지 못하게 막는 근거다', () => {
    const { isCurrent: _isCurrent, ...withoutCurrent } = SESSION
    expect(adminSessionSchema.safeParse(withoutCurrent).success).toBe(false)
  })

  it('userAgent · ipAddress 는 null 을 허용하고 문자열이 아닌 값은 거부한다', () => {
    expect(
      adminSessionSchema.safeParse({ ...SESSION, userAgent: null, ipAddress: null }).success,
    ).toBe(true)
    expect(adminSessionSchema.safeParse({ ...SESSION, userAgent: 1 }).success).toBe(false)
  })

  it('🔴 시각은 ISO UTC 문자열(Z)만 받는다 — 와이어에서 날짜는 문자열이다', () => {
    expect(
      adminSessionSchema.safeParse({ ...SESSION, loginAt: '2026-10-05 00:00:00' }).success,
    ).toBe(false)
    expect(adminSessionSchema.safeParse({ ...SESSION, loginAt: new Date() }).success).toBe(false)
  })

  it('🔴 UTC 가 아닌 오프셋(+09:00)은 거부한다', () => {
    expect(
      adminSessionSchema.safeParse({ ...SESSION, loginAt: '2026-10-06T09:00:00+09:00' }).success,
    ).toBe(false)
  })

  it('sessionNo 는 bigint 다', () => {
    expect(adminSessionSchema.safeParse({ ...SESSION, sessionNo: 1 }).success).toBe(false)
  })
})

describe('adminSessionListItemSchema · adminSessionRevokeResultSchema', () => {
  it('목록 행은 사용자 필드가 더 붙는다', () => {
    const item = { ...SESSION, userNo: 7n, userId: 'kim', userName: '김' }
    expect(adminSessionListItemSchema.parse(item)).toEqual(item)
    expect(adminSessionListItemSchema.safeParse(SESSION).success).toBe(false)
  })

  it('끊기 결과는 0 이상 정수 개수다', () => {
    expect(adminSessionRevokeResultSchema.parse({ revokedCount: 3 })).toEqual({ revokedCount: 3 })
    expect(adminSessionRevokeResultSchema.safeParse({ revokedCount: -1 }).success).toBe(false)
    expect(adminSessionRevokeResultSchema.safeParse({ revokedCount: 1.5 }).success).toBe(false)
  })
})
