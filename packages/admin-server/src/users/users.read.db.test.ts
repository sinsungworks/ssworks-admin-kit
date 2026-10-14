import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { seedClosure, seedPeriod } from '../test-support/users.js'
import { adminUserListQuerySchema } from './users.query.js'
import { AdminUsersService } from './users.service.js'

// 사용자 읽기 셋(2d 스펙 §5-6) — 각 테스트는 자기 아이디 접두어로 시드하고 그 접두어로 거른다.

let t: TestDatabase
let service: AdminUsersService
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined)
  roleNo = await seedRole(t.db, { roleName: '읽기 역할', permissions: ['org.users:read'] })
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

function list(input: Record<string, unknown>) {
  return service.list(adminUserListQuerySchema.parse({ itemsPerPage: 100, ...input }))
}

const ids = (items: readonly { userId: string }[]) => items.map((item) => item.userId)

describe('목록 투영', () => {
  it('대표 팀 · 마지막 구간의 날짜 · 지난 잠금은 null(B10)', async () => {
    const team = await seedTeam(t.db, 'proj-team')
    const user = await seedUser(t.db, {
      roleNo,
      userId: 'proj-user',
      lockUntil: new Date(Date.now() - 60_000),
    })
    await addToTeam(t.db, team, user.userNo)
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2024-01-02',
      resignDate: '2024-06-30',
    })
    await seedPeriod(t.db, { userNo: user.userNo, joinDate: '2025-03-04' })
    const { items } = await list({ filter: { keyword: 'proj-user' } })
    expect(items).toEqual([
      expect.objectContaining({
        userNo: user.userNo,
        userId: 'proj-user',
        roleNo,
        roleName: '읽기 역할',
        teamNo: team,
        teamName: 'proj-team',
        joinDate: '2025-03-04',
        resignDate: null,
        resignAt: null,
        lockUntil: null,
        isPasswordChangeRequired: false,
        revision: 0,
      }),
    ])
  })

  it('🔴 무소속 계정도 보인다(LEFT JOIN) · 구간이 없으면 users.joinAt 의 기준 시간대 날짜', async () => {
    const user = await seedUser(t.db, {
      roleNo,
      userId: 'solo-user',
      joinAt: new Date('2026-03-01T15:30:00.000Z'),
    })
    const { items } = await list({ filter: { keyword: 'solo-user' } })
    expect(items).toEqual([
      expect.objectContaining({
        userNo: user.userNo,
        teamNo: null,
        teamName: null,
        joinDate: '2026-03-02',
        resignDate: null,
      }),
    ])
  })

  it('🔴 두 팀 소속은 가장 작은 teamNo 로 한 번만 나온다(Review Focus 5)', async () => {
    const first = await seedTeam(t.db, 'two-team-a')
    const second = await seedTeam(t.db, 'two-team-b')
    const user = await seedUser(t.db, { roleNo, userId: 'two-team-user' })
    await addToTeam(t.db, second, user.userNo)
    await addToTeam(t.db, first, user.userNo)
    const { items } = await list({ filter: { keyword: 'two-team-user' } })
    expect(items.map((item) => [item.teamNo, item.teamName])).toEqual([[first, 'two-team-a']])
    const bySecond = await list({ filter: { keyword: 'two-team', teamNo: String(second) } })
    expect(ids(bySecond.items)).toEqual(['two-team-user'])
  })
})

describe('검색어', () => {
  it("🔴 '%' · '_' · '!' 는 글자다(LIKE 이스케이프) — 아이디와 이름 모두 본다", async () => {
    for (const userId of ['kw-50%off', 'kw-50xoff', 'kw-a_b', 'kw-axb', 'kw-c!d', 'kw-cd']) {
      await seedUser(t.db, { roleNo, userId })
    }
    await seedUser(t.db, { roleNo, userId: 'kw-name', userName: '이름%검색' })
    expect(ids((await list({ filter: { keyword: '50%' } })).items)).toEqual(['kw-50%off'])
    expect(ids((await list({ filter: { keyword: 'a_b' } })).items)).toEqual(['kw-a_b'])
    expect(ids((await list({ filter: { keyword: 'c!d' } })).items)).toEqual(['kw-c!d'])
    expect(ids((await list({ filter: { keyword: '이름%' } })).items)).toEqual(['kw-name'])
  })
})

describe('팀 필터(B9 · §14 R6-3)', () => {
  it('🔴 소속 전체로 거르고, 하위 팀 포함은 closure 자기 행 없이도 직접 소속을 잡는다', async () => {
    const parent = await seedTeam(t.db, 'tree-parent')
    const child = await seedTeam(t.db, 'tree-child')
    // 자기 행(depth 0)을 일부러 넣지 않는다
    await seedClosure(t.db, parent, child, 1)
    const direct = await seedUser(t.db, { roleNo, userId: 'tree-direct' })
    const nested = await seedUser(t.db, { roleNo, userId: 'tree-nested' })
    await seedUser(t.db, { roleNo, userId: 'tree-none' })
    await addToTeam(t.db, parent, direct.userNo)
    await addToTeam(t.db, child, nested.userNo)
    const of = async (filter: Record<string, unknown>) =>
      ids(
        (
          await list({
            filter: { keyword: 'tree-', ...filter },
            sortBy: 'userId',
            sortOrder: 'asc',
          })
        ).items,
      )
    expect(await of({ teamNo: String(parent) })).toEqual(['tree-direct'])
    expect(await of({ teamNo: String(parent), recursive: 'false' })).toEqual(['tree-direct'])
    expect(await of({ teamNo: String(parent), recursive: 'true' })).toEqual([
      'tree-direct',
      'tree-nested',
    ])
    expect(await of({ teamNo: String(child), recursive: 'true' })).toEqual(['tree-nested'])
    // 팀 없이 recursive 만은 조건이 아니다
    expect(await of({ recursive: 'true' })).toEqual(['tree-direct', 'tree-nested', 'tree-none'])
  })
})

describe('상태 · 정렬 · 쪽', () => {
  it('active 는 퇴사 처리 없음, resigned 는 퇴사 · 퇴사 예정', async () => {
    await seedUser(t.db, { roleNo, userId: 'st-active' })
    await seedUser(t.db, { roleNo, userId: 'st-gone', resignAt: new Date(Date.now() - 86_400_000) })
    await seedUser(t.db, {
      roleNo,
      userId: 'st-leaving',
      resignAt: new Date(Date.now() + 86_400_000),
    })
    const of = async (status: string) =>
      ids(
        (await list({ filter: { keyword: 'st-', status }, sortBy: 'userId', sortOrder: 'asc' }))
          .items,
      )
    expect(await of('active')).toEqual(['st-active'])
    expect(await of('resigned')).toEqual(['st-gone', 'st-leaving'])
  })

  it('정렬 열 + userNo 보조 · total 은 bigint · page · itemsPerPage 그대로', async () => {
    for (const userId of ['pg-c', 'pg-a', 'pg-b']) await seedUser(t.db, { roleNo, userId })
    const page = await service.list(
      adminUserListQuerySchema.parse({
        filter: { keyword: 'pg-' },
        sortBy: 'userId',
        sortOrder: 'asc',
        itemsPerPage: 2,
        page: 2,
      }),
    )
    expect(page).toMatchObject({ total: 3n, page: 2, itemsPerPage: 2 })
    expect(ids(page.items)).toEqual(['pg-c'])
    // 기본 createAt 내림차순 — 같은 초에 만든 셋은 userNo 내림차순(나중 것이 먼저)
    expect(ids((await list({ filter: { keyword: 'pg-' } })).items)).toEqual([
      'pg-b',
      'pg-a',
      'pg-c',
    ])
  })
})

describe('단건 · 재직 이력', () => {
  it('단건은 목록 행과 같다 · 없으면 404 ERR_NO_USER', async () => {
    const user = await seedUser(t.db, { roleNo, userId: 'one-user' })
    const [listed] = (await list({ filter: { keyword: 'one-user' } })).items
    expect(await service.findOne(user.userNo)).toEqual(listed)
    const missing = await rejection(() => service.findOne(999_999n))
    expect(missing.code).toBe(CommonErrorCodes.ERR_NO_USER)
    expect(missing.message).toBe(ACCOUNT_MESSAGES.noUser)
  })

  it('이력은 입사일 내림차순 · 기록자 이름(LEFT JOIN) · recordedTimezone UTC · 없는 사용자 404', async () => {
    const recorder = await seedUser(t.db, { roleNo, userId: 'hist-admin', userName: '기록자' })
    const user = await seedUser(t.db, { roleNo, userId: 'hist-user' })
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2024-01-02',
      resignDate: '2024-06-30',
      reason: '이직',
    })
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2025-03-04',
      reason: '복직',
      createdBy: recorder.userNo,
    })
    const { items } = await service.periods(user.userNo)
    expect(
      items.map((period) => [
        period.joinDate,
        period.resignDate,
        period.reason,
        period.createdBy,
        period.createdByName,
        period.recordedTimezone,
      ]),
    ).toEqual([
      ['2025-03-04', null, '복직', recorder.userNo, '기록자', 'UTC'],
      ['2024-01-02', '2024-06-30', '이직', null, null, 'UTC'],
    ])
    expect((await rejection(() => service.periods(999_999n))).code).toBe(
      CommonErrorCodes.ERR_NO_USER,
    )
  })
})
