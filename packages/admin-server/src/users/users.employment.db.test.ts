import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, dateIn, effectiveResignAt, todayIn } from '../accounts/calendar.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  liveSessionCount,
  periodsOf,
  seedPeriod,
  seedSession,
  userRow,
} from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 퇴사 · 퇴사일 정정 · 재입사(2d 스펙 §5-1 · §5-6). 🔴 공유 데이터베이스에는 '*' 사용자를 만들지 않는다 — 잔존 409 는 자기
// 데이터베이스(describe '잔존'). 날짜는 기준 시간대(Asia/Seoul)의 오늘에서 센다.

const TZ = 'Asia/Seoul'
const day = (offset: number) => addDays(todayIn(TZ), offset)

let t: TestDatabase
let service: AdminUsersService
let plainRole: bigint
let wideRole: bigint
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.users:read', 'org.users:write'])

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined)
  plainRole = await seedRole(t.db, { roleName: 'e-plain', permissions: ['org.users:read'] })
  wideRole = await seedRole(t.db, {
    roleName: 'e-wide',
    permissions: ['org.users:read', 'org.users:write', 'org.roles:read', 'org.roles:write'],
  })
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

/** 활성 구간 하나를 가진 재직자 */
async function employee(userId: string, joinDate = '2025-01-02') {
  const user = await seedUser(t.db, { roleNo: plainRole, userId })
  await seedPeriod(t.db, { userNo: user.userNo, joinDate })
  return user
}

const issue = (path: string, message: string) => ({
  issues: [{ path: [path], code: 'custom', message }],
})

describe('resign', () => {
  it('🔴 어제 → 효력 시각(오늘 0시)이 지났다 — 그 사용자 세션을 같은 트랜잭션에서 끊는다(공통 6)', async () => {
    const user = await employee('r-yesterday')
    await seedSession(t.db, user.userNo)
    await seedSession(t.db, user.userNo)
    const result = await service.resign(
      user.userNo,
      { resignDate: day(-1), reason: ' 개인 사정 ' },
      root,
    )
    expect(result.meta).toEqual({ reason: '개인 사정', revokedCount: 2, timeZone: TZ })
    expect(await liveSessionCount(t.db, user.userNo)).toBe(0)
    const row = await userRow(t.db, user.userNo)
    expect(row.resignAt?.toISOString()).toBe(effectiveResignAt(day(-1), TZ).toISOString())
    expect(row.revision).toBe(1)
    expect(await periodsOf(t.db, user.userNo)).toEqual([
      {
        joinDate: '2025-01-02',
        resignDate: day(-1),
        reason: '개인 사정',
        recordedTimezone: 'UTC',
        createdBy: null,
      },
    ])
    expect(result.before).toMatchObject({ resignDate: null, resignAt: null, revision: 0 })
    expect(result.item).toMatchObject({ resignDate: day(-1), revision: 1 })
  })

  it('🔴 오늘 → "당일까지 근무" — 효력은 내일 0시, 세션은 그대로(Review Focus 1)', async () => {
    const user = await employee('r-today')
    await seedSession(t.db, user.userNo)
    const result = await service.resign(user.userNo, { resignDate: day(0) }, root)
    expect(result.meta).toMatchObject({ revokedCount: 0 })
    expect(await liveSessionCount(t.db, user.userNo)).toBe(1)
    const resignAt = (await userRow(t.db, user.userNo)).resignAt
    if (resignAt === null) throw new Error('resignAt 이 비었다')
    expect(resignAt.toISOString()).toBe(effectiveResignAt(day(0), TZ).toISOString())
    expect(dateIn(resignAt, TZ)).toBe(day(1))
    expect(resignAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('미래 퇴사일 → 퇴사 예정, 세션 유지', async () => {
    const user = await employee('r-future')
    await seedSession(t.db, user.userNo)
    const result = await service.resign(user.userNo, { resignDate: day(30) }, root)
    expect(result.meta).toMatchObject({ revokedCount: 0 })
    expect(await liveSessionCount(t.db, user.userNo)).toBe(1)
  })

  it('🔴 입사 당일 퇴사는 된다 · 하루 앞은 400 resignDate(Review Focus 4)', async () => {
    const same = await employee('r-same-day', '2026-01-05')
    await expect(
      service.resign(same.userNo, { resignDate: '2026-01-05' }, root),
    ).resolves.toBeDefined()
    const early = await employee('r-early', '2026-01-05')
    const error = await rejection(() =>
      service.resign(early.userNo, { resignDate: '2026-01-04' }, root),
    )
    expect(error.details).toEqual(issue('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin))
    expect((await userRow(t.db, early.userNo)).resignAt).toBeNull()
  })

  it('본인 403 selfAccount · 넓은 계정 403 higherAccount + outside · 이미 퇴사 409', async () => {
    const me = await employee('r-self')
    const self = await rejection(() =>
      service.resign(me.userNo, { resignDate: day(1) }, testPrincipal(me.userNo, ['*'])),
    )
    expect(self.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(self.message).toBe(ACCOUNT_MESSAGES.selfAccount)

    const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'r-wide' })
    const higher = await rejection(() =>
      service.resign(wide.userNo, { resignDate: day(1) }, manager),
    )
    expect(higher.message).toBe(ACCOUNT_MESSAGES.higherAccount)
    expect(higher.details).toEqual({ outside: ['org.roles:read', 'org.roles:write'] })

    const gone = await employee('r-gone')
    await service.resign(gone.userNo, { resignDate: day(5) }, root)
    const again = await rejection(() => service.resign(gone.userNo, { resignDate: day(6) }, root))
    expect(again.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(again.message).toBe(ACCOUNT_MESSAGES.alreadyResigned)
  })

  it('🔴 권한 없는 사람에게는 이미 퇴사여도 409 가 아니라 403 — 판정이 먼저(B7)', async () => {
    const wide = await seedUser(t.db, {
      roleNo: wideRole,
      userId: 'r-b7',
      resignAt: new Date(Date.now() + 86_400_000),
    })
    const error = await rejection(() =>
      service.resign(wide.userNo, { resignDate: day(1) }, manager),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })

  it('활성 구간이 없으면 users.joinAt 으로 치유한다(공통 7) · 둘이면 409 periodCorrupted', async () => {
    const seeded = await seedUser(t.db, {
      roleNo: plainRole,
      userId: 'r-heal',
      joinAt: new Date('2025-03-01T15:00:00.000Z'),
    })
    const result = await service.resign(seeded.userNo, { resignDate: '2025-12-31' }, root)
    expect(result.meta).toMatchObject({ healedPeriod: true })
    expect(await periodsOf(t.db, seeded.userNo)).toEqual([
      {
        joinDate: '2025-03-02',
        resignDate: '2025-12-31',
        reason: null,
        recordedTimezone: 'UTC',
        createdBy: null,
      },
    ])

    const broken = await employee('r-broken')
    await seedPeriod(t.db, { userNo: broken.userNo, joinDate: '2025-06-01' })
    const error = await rejection(() => service.resign(broken.userNo, { resignDate: day(1) }, root))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.periodCorrupted)
  })

  it('효력 시각은 기준 시간대의 다음 날 0시 — America/New_York 서머타임 시작일(⑤ Z1)', async () => {
    const newYork = new AdminUsersService(
      t.db,
      usersConfig(false, 'America/New_York'),
      new AdminSessionStore(t.db),
      undefined,
    )
    const user = await employee('r-new-york')
    const result = await newYork.resign(user.userNo, { resignDate: '2030-03-09' }, root)
    // 2030-03-10 이 서머타임 시작일 — 그날 0시는 아직 EST(-5)
    expect(result.item.resignAt?.toISOString()).toBe('2030-03-10T05:00:00.000Z')
    expect(result.meta).toMatchObject({ timeZone: 'America/New_York' })
  })

  it('🔴 퇴사가 대상 잠금을 기다리는 동안 재입사가 커밋되면 그 구간을 본다 — 활성 구간이 둘이 되지 않는다(§14 R5-6 · R7-2)', async () => {
    const user = await seedUser(t.db, {
      roleNo: plainRole,
      userId: 'r-race',
      resignAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2025-01-02',
      resignDate: '2025-12-31',
    })
    const result = await whileHeld(
      t,
      async (connection) => {
        await connection.query('select user_no from users where user_no = ? for update', [
          user.userNo,
        ])
        await connection.query(
          `insert into user_employment_periods (user_no, join_at, recorded_timezone, created_by) values (?, '2026-02-01', 'UTC', 1)`,
          [user.userNo],
        )
        await connection.query(
          'update users set resign_at = null, revision = revision + 1 where user_no = ?',
          [user.userNo],
        )
      },
      () => service.resign(user.userNo, { resignDate: '2030-01-31' }, root),
    )
    if (!result.ok) throw result.error
    expect(result.value.meta).not.toHaveProperty('healedPeriod')
    expect(
      (await periodsOf(t.db, user.userNo)).map((period) => [period.joinDate, period.resignDate]),
    ).toEqual([
      ['2025-01-02', '2025-12-31'],
      ['2026-02-01', '2030-01-31'],
    ])
  })
})

describe('correctResignDate', () => {
  it('마지막 구간과 효력 시각을 고친다 · revision + 1 · 세션은 건드리지 않는다 · 사유는 보낼 때만', async () => {
    const user = await employee('d-fix')
    await service.resign(user.userNo, { resignDate: day(10), reason: '이직' }, root)
    await seedSession(t.db, user.userNo)
    const result = await service.correctResignDate(user.userNo, { resignDate: day(-1) }, root)
    expect(result.item).toMatchObject({ resignDate: day(-1), revision: 2 })
    expect(result.meta).toEqual({ timeZone: TZ })
    expect((await userRow(t.db, user.userNo)).resignAt?.toISOString()).toBe(
      effectiveResignAt(day(-1), TZ).toISOString(),
    )
    expect(await liveSessionCount(t.db, user.userNo)).toBe(1)
    expect((await periodsOf(t.db, user.userNo))[0]?.reason).toBe('이직')

    const cleared = await service.correctResignDate(
      user.userNo,
      { resignDate: day(-1), reason: null },
      root,
    )
    expect(cleared.meta).toEqual({ reason: null, timeZone: TZ })
    expect((await periodsOf(t.db, user.userNo))[0]?.reason).toBeNull()
  })

  it('재직 중 409 notResigned · 구간 없음 409 · 입사일 앞 400 · 본인 403', async () => {
    const active = await employee('d-active')
    expect(
      (
        await rejection(() =>
          service.correctResignDate(active.userNo, { resignDate: day(1) }, root),
        )
      ).message,
    ).toBe(ACCOUNT_MESSAGES.notResigned)

    const bare = await seedUser(t.db, {
      roleNo: plainRole,
      userId: 'd-bare',
      resignAt: new Date(Date.now() + 86_400_000),
    })
    expect(
      (await rejection(() => service.correctResignDate(bare.userNo, { resignDate: day(1) }, root)))
        .message,
    ).toBe(ACCOUNT_MESSAGES.noPeriodForResign)

    const early = await employee('d-early', '2026-01-05')
    await service.resign(early.userNo, { resignDate: '2026-02-01' }, root)
    const before = await rejection(() =>
      service.correctResignDate(early.userNo, { resignDate: '2026-01-04' }, root),
    )
    expect(before.details).toEqual(issue('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin))

    const me = await employee('d-self')
    await service.resign(me.userNo, { resignDate: day(10) }, root)
    expect(
      (
        await rejection(() =>
          service.correctResignDate(
            me.userNo,
            { resignDate: day(11) },
            testPrincipal(me.userNo, ['*']),
          ),
        )
      ).message,
    ).toBe(ACCOUNT_MESSAGES.selfAccount)
  })
})

describe('rehire', () => {
  it('🔴 같은 날 재입사는 400(근무가 겹친다) · 다음 날은 된다 — 새 구간 기록자 = 행위자 · 효력 시각 지움', async () => {
    const user = await employee('h-back')
    await service.resign(user.userNo, { resignDate: '2026-03-31' }, root)
    const same = await rejection(() =>
      service.rehire(user.userNo, { joinDate: '2026-03-31' }, root),
    )
    expect(same.details).toEqual(issue('joinDate', ACCOUNT_MESSAGES.rehireNotAfterResign))

    const result = await service.rehire(
      user.userNo,
      { joinDate: '2026-04-01', reason: '복직' },
      root,
    )
    expect(result.item).toMatchObject({
      joinDate: '2026-04-01',
      resignDate: null,
      resignAt: null,
      revision: 2,
    })
    expect(result.before).toMatchObject({ resignDate: '2026-03-31' })
    expect(result.meta).toEqual({ reason: '복직', timeZone: TZ })
    expect(await periodsOf(t.db, user.userNo)).toEqual([
      {
        joinDate: '2025-01-02',
        resignDate: '2026-03-31',
        reason: null,
        recordedTimezone: 'UTC',
        createdBy: null,
      },
      {
        joinDate: '2026-04-01',
        resignDate: null,
        reason: '복직',
        recordedTimezone: 'UTC',
        createdBy: root.userNo,
      },
    ])
    expect((await userRow(t.db, user.userNo)).joinAt.toISOString()).toBe('2026-03-31T15:00:00.000Z')
  })

  it('재직 중 409 · 활성 구간이 남아 있으면 409 · 본인도 된다(B16) · 넓은 계정 403', async () => {
    const active = await employee('h-active')
    expect(
      (await rejection(() => service.rehire(active.userNo, { joinDate: day(1) }, root))).message,
    ).toBe(ACCOUNT_MESSAGES.notResignedForRehire)

    const odd = await seedUser(t.db, {
      roleNo: plainRole,
      userId: 'h-odd',
      resignAt: new Date(Date.now() - 86_400_000),
    })
    await seedPeriod(t.db, { userNo: odd.userNo, joinDate: '2025-01-02' })
    expect(
      (await rejection(() => service.rehire(odd.userNo, { joinDate: day(1) }, root))).message,
    ).toBe(ACCOUNT_MESSAGES.activePeriodExists)

    const me = await employee('h-self')
    await service.resign(me.userNo, { resignDate: day(10) }, root)
    await expect(
      service.rehire(
        me.userNo,
        { joinDate: day(11) },
        testPrincipal(me.userNo, ['org.users:read', 'org.users:write']),
      ),
    ).resolves.toBeDefined()

    const wide = await seedUser(t.db, {
      roleNo: wideRole,
      userId: 'h-wide',
      resignAt: new Date(Date.now() - 86_400_000),
    })
    expect(
      (await rejection(() => service.rehire(wide.userNo, { joinDate: day(1) }, manager))).message,
    ).toBe(ACCOUNT_MESSAGES.higherAccount)
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

  it('🔴 마지막 전체 권한 재직자를 퇴사(퇴사 예정 포함)시키면 409 lastSuperAdmin · 치유 구간도 롤백', async () => {
    const star = await seedRole(u.db, { roleName: 'only-star', permissions: ['*'] })
    const last = await seedUser(u.db, { roleNo: star, userId: 'only-admin' })
    const error = await rejection(() => survival.resign(last.userNo, { resignDate: day(30) }, root))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await userRow(u.db, last.userNo)).toMatchObject({ resignAt: null, revision: 0 })
    expect(await periodsOf(u.db, last.userNo)).toEqual([])
  })
})
