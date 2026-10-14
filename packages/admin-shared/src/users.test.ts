import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  adminEmploymentPeriodSchema,
  adminUserCreateResultSchema,
  adminUserCreateSchema,
  adminUserRehireSchema,
  adminUserResignDateSchema,
  adminUserResignSchema,
  adminUserSchema,
  adminUserUpdateSchema,
  calendarDateSchema,
} from './users.js'

const ROW = {
  userNo: 7n,
  userId: 'kim',
  userName: '김사원',
  roleNo: 2n,
  roleName: '운영자',
  teamNo: null,
  teamName: null,
  joinDate: '2026-03-02',
  resignDate: null,
  resignAt: null,
  isPasswordChangeRequired: true,
  lockUntil: null,
  revision: 0,
  createAt: '2026-03-01T15:00:00.000Z',
  updateAt: '2026-03-01T15:00:00.000Z',
}

describe('calendarDateSchema', () => {
  it("실제 달력 날짜만 — 윤일은 받고 '2026-02-30' 은 거부", () => {
    expect(calendarDateSchema.parse('2026-10-31')).toBe('2026-10-31')
    expect(calendarDateSchema.parse('2028-02-29')).toBe('2028-02-29')
    expect(calendarDateSchema.safeParse('2027-02-29').success).toBe(false)
    expect(calendarDateSchema.safeParse('2026-02-30').success).toBe(false)
    expect(calendarDateSchema.safeParse('2026-13-01').success).toBe(false)
  })

  it('모양이 틀리면 이슈 하나 — 없는 날짜 문구를 겹쳐 내지 않는다', () => {
    for (const value of ['2026-1-01', '26-01-01', '2026/01/01', '0999-01-01', 'abc', '']) {
      const result = calendarDateSchema.safeParse(value)
      expect(result.success, value).toBe(false)
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        '날짜는 YYYY-MM-DD 로 적습니다.',
      ])
    }
    expect(calendarDateSchema.safeParse('2026-02-30').error?.issues[0]?.message).toBe(
      '없는 날짜입니다.',
    )
  })
})

describe('adminUserSchema', () => {
  it('와이어 행(시각은 ISO 문자열)을 읽는다', () => {
    expect(adminUserSchema.parse(ROW)).toEqual(ROW)
    expect(
      adminUserSchema.parse({
        ...ROW,
        teamNo: 3n,
        teamName: '영업',
        resignDate: '2026-10-31',
        resignAt: '2026-10-31T15:00:00.000Z',
        lockUntil: '2030-01-01T00:00:00.000Z',
      }).resignAt,
    ).toBe('2026-10-31T15:00:00.000Z')
  })

  it('🔴 객체 refine 이 없다 — 쓰는 쪽이 .omit · .extend 로 고친다(3b §11 R1 · §14 R7-6)', () => {
    const { revision: _revision, ...withoutRevision } = ROW
    expect(adminUserSchema.omit({ revision: true }).parse(withoutRevision)).toEqual(withoutRevision)
    const extended = adminUserSchema.extend({ userPhone: z.string().nullable() })
    expect(extended.parse({ ...ROW, userPhone: null }).userPhone).toBeNull()
  })
})

describe('본문 스키마', () => {
  it('만들기 — 아이디 · 이름은 앞뒤 공백을 떼고 1~64자, 팀은 null 허용, 입사일은 생략 가능', () => {
    expect(
      adminUserCreateSchema.parse({
        userId: ' kim ',
        userName: ' 김사원 ',
        roleNo: 2n,
        teamNo: null,
      }),
    ).toEqual({ userId: 'kim', userName: '김사원', roleNo: 2n, teamNo: null })
    expect(
      adminUserCreateSchema.safeParse({ userId: '  ', userName: 'a', roleNo: 2n, teamNo: null })
        .success,
    ).toBe(false)
    expect(
      adminUserCreateSchema.safeParse({
        userId: 'a'.repeat(65),
        userName: 'a',
        roleNo: 2n,
        teamNo: null,
      }).success,
    ).toBe(false)
    expect(
      adminUserCreateSchema.safeParse({ userId: 'a', userName: 'a', roleNo: 2, teamNo: null })
        .success,
    ).toBe(false)
    expect(
      adminUserCreateSchema.parse({
        userId: 'a',
        userName: 'a',
        roleNo: 2n,
        teamNo: 3n,
        joinDate: '2026-11-02',
      }).joinDate,
    ).toBe('2026-11-02')
  })

  it('수정 — revision 만 와도 된다(바꿀 값 없음 검사 없음), teamNo 는 null 과 생략을 가른다', () => {
    expect(adminUserUpdateSchema.parse({ revision: 0 })).toEqual({ revision: 0 })
    expect(adminUserUpdateSchema.safeParse({ userName: 'a' }).success).toBe(false)
    expect(adminUserUpdateSchema.parse({ revision: 1, teamNo: null })).toEqual({
      revision: 1,
      teamNo: null,
    })
  })

  it('퇴사 · 퇴사일 · 재입사 — 날짜 필수, 사유는 생략 · null · 255자까지', () => {
    expect(adminUserResignSchema.parse({ resignDate: '2026-10-31' })).toEqual({
      resignDate: '2026-10-31',
    })
    expect(adminUserResignDateSchema.parse({ resignDate: '2026-10-31', reason: null })).toEqual({
      resignDate: '2026-10-31',
      reason: null,
    })
    expect(adminUserRehireSchema.safeParse({ reason: '복직' }).success).toBe(false)
    expect(
      adminUserResignSchema.safeParse({ resignDate: '2026-10-31', reason: 'a'.repeat(256) })
        .success,
    ).toBe(false)
  })

  it('만들기 결과 · 재직 이력 행', () => {
    expect(
      adminUserCreateResultSchema.parse({ item: ROW, temporaryPassword: 'Ab3dEf7hJk9mNp2q' }),
    ).toEqual({ item: ROW, temporaryPassword: 'Ab3dEf7hJk9mNp2q' })
    const period = {
      periodNo: 1n,
      joinDate: '2025-01-02',
      resignDate: null,
      reason: null,
      recordedTimezone: 'UTC',
      createdBy: null,
      createdByName: null,
      createAt: '2025-01-02T00:00:00.000Z',
    }
    expect(adminEmploymentPeriodSchema.parse(period)).toEqual(period)
  })
})
