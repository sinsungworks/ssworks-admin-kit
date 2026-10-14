import { BusinessError, CommonErrorCodes, adminAuditLogQuerySchema } from '@ssworks/admin-shared'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AUDIT_MESSAGES } from './errors.js'
import { AdminAuditLogsService } from './audit-logs.service.js'

let t: TestDatabase
let service: AdminAuditLogsService
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminAuditLogsService(t.db)
  roleNo = await seedRole(t.db)
})

afterAll(async () => {
  await t?.drop()
})

/** 시각을 정해 넣는다 — 테이블 타입은 createAt 넣기를 막으므로(append-only) 원문 SQL 로 */
async function row(input: {
  actorUserNo: bigint | null
  action: string
  createAt: Date
  targetType?: string | null
  targetRefNo?: bigint | null
  meta?: string | null
}): Promise<void> {
  await sql`
    insert into audit_logs
      (actor_user_no, session_no, action, target_type, target_ref_no, method, path, status_code, error_code, ip, user_agent, meta, create_at)
    values
      (${input.actorUserNo}, ${null}, ${input.action}, ${input.targetType ?? null}, ${input.targetRefNo ?? null},
       ${'POST'}, ${'/x'}, ${200}, ${null}, ${null}, ${null}, ${input.meta ?? null}, ${input.createAt})
  `.execute(t.db)
}

const query = (raw: unknown) => adminAuditLogQuerySchema.parse(raw)
const at = (iso: string) => new Date(iso)

describe('AdminAuditLogsService.list', () => {
  it('액션 접두(기본) · 정확 일치 — 접두의 _ 는 글자 그대로', async () => {
    const user = await seedUser(t.db, { roleNo })
    for (const action of [
      'session.revoke',
      'session.revoke.user',
      'session.revoke.self',
      'session.revoke.others',
      'sessionxrevoke',
      'a_b.x',
      'aXb.x',
    ]) {
      await row({ actorUserNo: user.userNo, action, createAt: at('2026-10-01T00:00:00.000Z') })
    }
    const actions = async (filter: Record<string, unknown>) =>
      (await service.list(query({ filter: { actorUserNo: String(user.userNo), ...filter } }))).items
        .map((item) => item.action)
        .sort()

    expect(await actions({ action: 'session.revoke' })).toEqual([
      'session.revoke',
      'session.revoke.others',
      'session.revoke.self',
      'session.revoke.user',
    ])
    expect(await actions({ action: 'session.revoke', actionMatch: 'exact' })).toEqual([
      'session.revoke',
    ])
    expect(await actions({ action: 'a_b' })).toEqual(['a_b.x'])
  })

  it('🔴 기간은 [from, to) 반열림 — 끝 시각의 행은 빠진다', async () => {
    const user = await seedUser(t.db, { roleNo })
    for (const iso of [
      '2026-10-01T23:59:59.000Z',
      '2026-10-02T00:00:00.000Z',
      '2026-10-02T23:59:59.000Z',
      '2026-10-03T00:00:00.000Z',
    ]) {
      await row({ actorUserNo: user.userNo, action: 'period.check', createAt: at(iso) })
    }
    const result = await service.list(
      query({
        sortOrder: 'asc',
        filter: {
          actorUserNo: String(user.userNo),
          from: '2026-10-02T00:00:00.000Z',
          to: '2026-10-03T00:00:00.000Z',
        },
      }),
    )
    expect(result.items.map((item) => item.createAt.toISOString())).toEqual([
      '2026-10-02T00:00:00.000Z',
      '2026-10-02T23:59:59.000Z',
    ])
    expect(result.total).toBe(2n)
  })

  it('🔴 거꾸로 · 같은 기간은 400 + issues[filter.to](B14)', async () => {
    for (const to of ['2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z']) {
      const error = await service
        .list(query({ filter: { from: '2026-10-02T00:00:00.000Z', to } }))
        .catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(BusinessError)
      expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect((error as BusinessError).details).toEqual({
        issues: [{ path: ['filter', 'to'], code: 'custom', message: AUDIT_MESSAGES.periodOrder }],
      })
    }
  })

  it('행위자 아이디 · 이름 JOIN, 행위자 없음은 null, meta 는 파싱된 값', async () => {
    const user = await seedUser(t.db, { roleNo, userName: '감사대상' })
    await row({
      actorUserNo: user.userNo,
      action: 'join.check',
      createAt: at('2026-10-05T00:00:00.000Z'),
      meta: '{"revokedCount":"3"}',
    })
    await row({ actorUserNo: null, action: 'join.check', createAt: at('2026-10-05T00:00:01.000Z') })
    const result = await service.list(query({ filter: { action: 'join.check' } }))
    expect(result.items.map((item) => [item.actorUserId, item.actorUserName, item.meta])).toEqual([
      [null, null, null],
      [user.userId, '감사대상', { revokedCount: '3' }],
    ])
  })

  it('대상 필터 · 최신순(같은 시각은 logNo 내림차순) · 페이지', async () => {
    const user = await seedUser(t.db, { roleNo })
    const same = at('2026-10-06T00:00:00.000Z')
    for (let i = 0; i < 3; i += 1) {
      await row({
        actorUserNo: user.userNo,
        action: 'page.check',
        createAt: same,
        targetType: 'session',
        targetRefNo: 77n,
      })
    }
    await row({
      actorUserNo: user.userNo,
      action: 'page.check',
      createAt: same,
      targetType: 'user',
      targetRefNo: 77n,
    })
    const first = await service.list(
      query({ page: '1', itemsPerPage: '2', filter: { targetType: 'session', targetRefNo: '77' } }),
    )
    const second = await service.list(
      query({ page: '2', itemsPerPage: '2', filter: { targetType: 'session', targetRefNo: '77' } }),
    )
    expect(first.total).toBe(3n)
    expect(first.items).toHaveLength(2)
    expect(second.items).toHaveLength(1)
    const logNos = [...first.items, ...second.items].map((item) => item.logNo)
    expect(logNos).toEqual([...logNos].sort((a, b) => (a > b ? -1 : 1)))
  })
})
