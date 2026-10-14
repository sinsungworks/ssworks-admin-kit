import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startOfDayIn, todayIn } from '../accounts/calendar.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { verifyPassword } from '../auth/password.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, transactionOnly, usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { periodsOf, seedPeriod, userRow } from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 만들기 · 수정(2d 스펙 §5-6). 🔴 이 파일의 공유 데이터베이스에는 '*' 사용자를 만들지 않는다 — 잔존 409 는 자기 데이터베이스를
// 따로 쓴다(describe '잔존'). 각 테스트는 자기 아이디 접두어로 시드한다.

let t: TestDatabase
let service: AdminUsersService
let plainRole: bigint
let wideRole: bigint
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.users:read', 'org.users:write'])
const WIDE = ['org.users:read', 'org.users:write', 'org.roles:read', 'org.roles:write']

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined)
  plainRole = await seedRole(t.db, { roleName: 'w-plain', permissions: ['org.users:read'] })
  wideRole = await seedRole(t.db, { roleName: 'w-wide', permissions: WIDE })
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

function fresh(userId: string) {
  return seedUser(t.db, { roleNo: plainRole, userId, userName: `${userId} 이름` })
}

const issue = (path: string, message: string) => ({
  issues: [{ path: [path], code: 'custom', message }],
})

describe('create', () => {
  it('🔴 임시 비밀번호(16자)를 돌려주고 해시만 저장 · 강제 변경 · 첫 구간은 기록자 없음 · UTC · 팀(⑥ P1 · B2)', async () => {
    const team = await seedTeam(t.db, 'c-team')
    const { item, temporaryPassword } = await service.create(
      {
        userId: 'c-new',
        userName: '새 사람',
        roleNo: plainRole,
        teamNo: team,
        joinDate: '2026-11-02',
      },
      root,
    )
    expect(temporaryPassword).toHaveLength(16)
    const row = await userRow(t.db, item.userNo)
    expect(row.password).not.toBe(temporaryPassword)
    expect(await verifyPassword(row.password, temporaryPassword)).toBe(true)
    expect(row.isPasswordChangeRequired).toBe(true)
    // 스펙 §5-1 표 — 입사일 2026-11-02 의 0시(KST)
    expect(row.joinAt.toISOString()).toBe('2026-11-01T15:00:00.000Z')
    expect(await periodsOf(t.db, item.userNo)).toEqual([
      {
        joinDate: '2026-11-02',
        resignDate: null,
        reason: null,
        recordedTimezone: 'UTC',
        createdBy: null,
      },
    ])
    expect(item).toMatchObject({
      userId: 'c-new',
      userName: '새 사람',
      roleNo: plainRole,
      teamNo: team,
      teamName: 'c-team',
      joinDate: '2026-11-02',
      resignDate: null,
      isPasswordChangeRequired: true,
      revision: 0,
    })
  })

  it('입사일이 없으면 기준 시간대의 오늘 · 팀 없음', async () => {
    const before = todayIn('Asia/Seoul')
    const { item } = await service.create(
      { userId: 'c-today', userName: '오늘', roleNo: plainRole, teamNo: null },
      root,
    )
    expect([before, todayIn('Asia/Seoul')]).toContain(item.joinDate)
    expect(item.teamNo).toBeNull()
  })

  it('🔴 아이디 중복 — 대소문자 · 끝 공백만 달라도 400 issues userId(Review Focus 2 · B1)', async () => {
    await service.create({ userId: 'c-Dup', userName: 'a', roleNo: plainRole, teamNo: null }, root)
    for (const userId of ['c-dup', 'C-DUP', 'c-Dup ']) {
      const error = await rejection(() =>
        service.create({ userId, userName: 'b', roleNo: plainRole, teamNo: null }, root),
      )
      expect(error.code, userId).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect(error.details).toEqual(issue('userId', ACCOUNT_MESSAGES.duplicateUserId))
    }
  })

  it('없는 역할 400 roleNo · 없는 팀 400 teamNo — 아무것도 만들지 않는다', async () => {
    const noRole = await rejection(() =>
      service.create({ userId: 'c-norole', userName: 'a', roleNo: 999_999n, teamNo: null }, root),
    )
    expect(noRole.details).toEqual(issue('roleNo', ACCOUNT_MESSAGES.noRole))
    const noTeam = await rejection(() =>
      service.create(
        { userId: 'c-noteam', userName: 'a', roleNo: plainRole, teamNo: 999_999n },
        root,
      ),
    )
    expect(noTeam.details).toEqual(issue('teamNo', ACCOUNT_MESSAGES.noTeam))
    expect(
      await t.db
        .selectFrom('users')
        .select('userNo')
        .where('userId', 'in', ['c-norole', 'c-noteam'])
        .execute(),
    ).toEqual([])
  })

  it('🔴 TIMESTAMP 범위 밖 입사일은 400 — 500 이 아니다(최종 리뷰 F1) · 수정도 같다', async () => {
    const error = await rejection(() =>
      service.create(
        {
          userId: 'c-range',
          userName: 'a',
          roleNo: plainRole,
          teamNo: null,
          joinDate: '1969-06-01',
        },
        root,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(error.details).toEqual(issue('joinDate', ACCOUNT_MESSAGES.dateOutOfRange))
    expect(
      await t.db.selectFrom('users').select('userNo').where('userId', '=', 'c-range').execute(),
    ).toEqual([])

    const user = await fresh('c-range-update')
    const updated = await rejection(() =>
      service.update(user.userNo, { revision: 0, joinDate: '2040-01-01' }, root),
    )
    expect(updated.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(updated.details).toEqual(issue('joinDate', ACCOUNT_MESSAGES.dateOutOfRange))
    expect((await userRow(t.db, user.userNo)).revision).toBe(0)
  })

  it('넓은 역할은 줄 수 없다 — 403 higherRoleToGrant + details.outside', async () => {
    const error = await rejection(() =>
      service.create({ userId: 'c-wide', userName: 'a', roleNo: wideRole, teamNo: null }, manager),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherRoleToGrant)
    expect(error.details).toEqual({ outside: ['org.roles:read', 'org.roles:write'] })
  })

  it('🔴 결과는 같은 트랜잭션에서 읽는다(§14 R5-2)', async () => {
    const strict = new AdminUsersService(
      transactionOnly(t.db),
      usersConfig(),
      new AdminSessionStore(t.db),
      undefined,
    )
    const { item } = await strict.create(
      { userId: 'c-in-trx', userName: 'a', roleNo: plainRole, teamNo: null },
      root,
    )
    expect(item.userId).toBe('c-in-trx')
  })
})

describe('update', () => {
  it('revision 이 다르면 409, 맞으면 +1 · updateAt 은 DB 시계로 바뀐다(⑧ V1 · §14 R6-2)', async () => {
    const user = await fresh('u-rev')
    const past = new Date('2020-01-01T00:00:00.000Z')
    await t.db
      .updateTable('users')
      .set({ updateAt: past })
      .where('userNo', '=', user.userNo)
      .execute()
    const conflict = await rejection(() =>
      service.update(user.userNo, { revision: 3, userName: 'x' }, root),
    )
    expect(conflict.code).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
    expect(conflict.message).toBe(ACCOUNT_MESSAGES.userRevisionMismatch)

    const { item, before } = await service.update(
      user.userNo,
      { revision: 0, userName: '바뀐 이름' },
      root,
    )
    expect(before).toMatchObject({ userName: 'u-rev 이름', revision: 0 })
    expect(item).toMatchObject({ userName: '바뀐 이름', revision: 1 })
    const row = await userRow(t.db, user.userNo)
    expect(row.updateAt.getTime()).toBeGreaterThan(past.getTime())
    expect(row.updateAt.getTime()).toBeGreaterThanOrEqual(row.createAt.getTime())
  })

  it('🔴 권한 없는 사람에게는 revision 이 틀려도 409 가 아니라 403 — 판정이 먼저(B7)', async () => {
    const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'u-b7-wide' })
    const error = await rejection(() =>
      service.update(wide.userNo, { revision: 9, userName: 'x' }, manager),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherAccount)
    expect(error.details).toEqual({ outside: ['org.roles:read', 'org.roles:write'] })
    expect((await userRow(t.db, wide.userNo)).revision).toBe(0)
  })

  it('본인 이름은 바꾼다(③ SF1) · 본인에게 넓은 역할은 줄 수 없다', async () => {
    const me = await fresh('u-self')
    const self = testPrincipal(me.userNo, ['org.users:read', 'org.users:write'])
    await service.update(me.userNo, { revision: 0, userName: '내 이름' }, self)
    const error = await rejection(() =>
      service.update(me.userNo, { revision: 1, roleNo: wideRole }, self),
    )
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherRoleToGrant)
    expect((await userRow(t.db, me.userNo)).roleNo).toBe(plainRole)
  })

  it('🔴 팀 바꾸기는 소속을 하나로 · null 은 비운다 · 없는 팀은 400 이고 그대로(Review Focus 5 · ⑨ T1)', async () => {
    const a = await seedTeam(t.db, 'u-team-a')
    const b = await seedTeam(t.db, 'u-team-b')
    const c = await seedTeam(t.db, 'u-team-c')
    const user = await fresh('u-teams')
    await addToTeam(t.db, a, user.userNo)
    await addToTeam(t.db, b, user.userNo)
    const memberships = async () =>
      (
        await t.db
          .selectFrom('teamUserMap')
          .select('teamNo')
          .where('userNo', '=', user.userNo)
          .orderBy('teamNo')
          .execute()
      ).map((row) => row.teamNo)

    const moved = await service.update(user.userNo, { revision: 0, teamNo: c }, root)
    expect(await memberships()).toEqual([c])
    expect(moved.before.teamNo).toBe(a)
    expect(moved.item).toMatchObject({ teamNo: c, teamName: 'u-team-c' })

    const missing = await rejection(() =>
      service.update(user.userNo, { revision: 1, teamNo: 999_999n }, root),
    )
    expect(missing.details).toEqual(issue('teamNo', ACCOUNT_MESSAGES.noTeam))
    expect(await memberships()).toEqual([c])

    await service.update(user.userNo, { revision: 1, teamNo: null }, root)
    expect(await memberships()).toEqual([])
  })

  it('입사일 정정 — 마지막 구간만, 직전 퇴사일 다음 날부터 이번 퇴사일까지(400 joinDate) · 구간 없음 409', async () => {
    const user = await fresh('u-join')
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2024-01-02',
      resignDate: '2024-06-30',
    })
    await seedPeriod(t.db, { userNo: user.userNo, joinDate: '2025-03-04' })
    for (const joinDate of ['2024-06-30', '2024-01-01']) {
      const error = await rejection(() =>
        service.update(user.userNo, { revision: 0, joinDate }, root),
      )
      expect(error.details, joinDate).toEqual(
        issue('joinDate', ACCOUNT_MESSAGES.joinDateOutOfRange),
      )
    }
    const { item } = await service.update(
      user.userNo,
      { revision: 0, joinDate: '2024-07-01' },
      root,
    )
    expect(item.joinDate).toBe('2024-07-01')
    expect((await periodsOf(t.db, user.userNo)).map((p) => [p.joinDate, p.resignDate])).toEqual([
      ['2024-01-02', '2024-06-30'],
      ['2024-07-01', null],
    ])
    expect((await userRow(t.db, user.userNo)).joinAt.toISOString()).toBe(
      startOfDayIn('2024-07-01', 'Asia/Seoul').toISOString(),
    )

    const resigned = await fresh('u-join-resigned')
    await seedPeriod(t.db, {
      userNo: resigned.userNo,
      joinDate: '2025-01-02',
      resignDate: '2025-05-31',
    })
    const late = await rejection(() =>
      service.update(resigned.userNo, { revision: 0, joinDate: '2025-06-01' }, root),
    )
    expect(late.details).toEqual(issue('joinDate', ACCOUNT_MESSAGES.joinDateOutOfRange))

    const bare = await fresh('u-join-none')
    const conflict = await rejection(() =>
      service.update(bare.userNo, { revision: 0, joinDate: '2025-01-01' }, root),
    )
    expect(conflict.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(conflict.message).toBe(ACCOUNT_MESSAGES.noPeriodForJoin)
  })

  it('없는 사용자 404 · 없는 역할 400 roleNo', async () => {
    expect((await rejection(() => service.update(999_999n, { revision: 0 }, root))).code).toBe(
      CommonErrorCodes.ERR_NO_USER,
    )
    const user = await fresh('u-norole')
    const error = await rejection(() =>
      service.update(user.userNo, { revision: 0, roleNo: 999_999n }, root),
    )
    expect(error.details).toEqual(issue('roleNo', ACCOUNT_MESSAGES.noRole))
  })

  it('🔴 결과는 같은 트랜잭션에서 읽는다(§14 R5-2) — 역할 변경(잔존 감쌈) 갈래도', async () => {
    const user = await fresh('u-in-trx')
    const strict = new AdminUsersService(
      transactionOnly(t.db),
      usersConfig(),
      new AdminSessionStore(t.db),
      undefined,
    )
    const { item } = await strict.update(
      user.userNo,
      { revision: 0, userName: 'in trx', roleNo: plainRole },
      root,
    )
    expect(item).toMatchObject({ userName: 'in trx', revision: 1 })
  })
})

describe('잔존(자기 데이터베이스)', () => {
  let u: TestDatabase
  let survival: AdminUsersService

  beforeAll(async () => {
    u = await createTestDatabase()
    survival = new AdminUsersService(u.db, usersConfig(), new AdminSessionStore(u.db), undefined)
  })

  afterAll(async () => {
    await u?.drop()
  })

  it('🔴 마지막 전체 권한 재직자의 역할을 내리면 409 lastSuperAdmin · 그대로', async () => {
    const star = await seedRole(u.db, { roleName: 'only-star', permissions: ['*'] })
    const plain = await seedRole(u.db, { roleName: 'only-plain', permissions: [] })
    const last = await seedUser(u.db, { roleNo: star, userId: 'only-admin' })
    const error = await rejection(() =>
      survival.update(last.userNo, { revision: 0, roleNo: plain }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await userRow(u.db, last.userNo)).toMatchObject({ roleNo: star, revision: 0 })
  })
})
