import { describe, expect, it } from 'vitest'
import { toUserView, type UserViewRow } from './user-view.js'

const NOW = new Date('2026-10-14T00:00:00.000Z')

const ROW: UserViewRow = {
  userNo: 1n,
  userId: 'kim',
  userName: '김사원',
  roleNo: 2n,
  roleName: '운영자',
  teamNo: null,
  teamName: null,
  joinAt: new Date('2026-03-01T15:30:00.000Z'),
  periodJoinAt: null,
  periodResignAt: null,
  resignAt: null,
  isPasswordChangeRequired: false,
  lockUntil: null,
  revision: 0,
  createAt: new Date('2026-03-01T15:30:00.000Z'),
  updateAt: new Date('2026-03-01T15:30:00.000Z'),
}

describe('toUserView', () => {
  it('구간이 없으면 users.joinAt 의 기준 시간대 날짜 · resignDate null(B10)', () => {
    expect(toUserView(ROW, 'Asia/Seoul', NOW)).toMatchObject({
      joinDate: '2026-03-02',
      resignDate: null,
    })
    expect(toUserView(ROW, 'UTC', NOW).joinDate).toBe('2026-03-01')
  })

  it('구간이 있으면 마지막 구간의 날짜(DATE 열의 UTC 자정)', () => {
    const view = toUserView(
      {
        ...ROW,
        periodJoinAt: new Date('2025-01-02T00:00:00.000Z'),
        periodResignAt: new Date('2026-10-31T00:00:00.000Z'),
        resignAt: new Date('2026-10-31T15:00:00.000Z'),
      },
      'Asia/Seoul',
      NOW,
    )
    expect(view).toMatchObject({ joinDate: '2025-01-02', resignDate: '2026-10-31' })
    expect(view.resignAt?.toISOString()).toBe('2026-10-31T15:00:00.000Z')
  })

  it('lockUntil 은 미래일 때만(gise) — 지난 잠금은 null', () => {
    const future = new Date('2026-10-14T00:10:00.000Z')
    expect(toUserView({ ...ROW, lockUntil: future }, 'UTC', NOW).lockUntil).toBe(future)
    expect(
      toUserView({ ...ROW, lockUntil: new Date('2026-10-13T23:59:59.000Z') }, 'UTC', NOW).lockUntil,
    ).toBeNull()
  })

  it('키 열다섯 — 해시 · 실패 카운터는 싣지 않는다', () => {
    expect(Object.keys(toUserView(ROW, 'UTC', NOW)).sort()).toEqual([
      'createAt',
      'isPasswordChangeRequired',
      'joinDate',
      'lockUntil',
      'resignAt',
      'resignDate',
      'revision',
      'roleName',
      'roleNo',
      'teamName',
      'teamNo',
      'updateAt',
      'userId',
      'userName',
      'userNo',
    ])
  })
})
