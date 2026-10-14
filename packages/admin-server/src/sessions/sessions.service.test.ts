import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { describe, expect, it } from 'vitest'
import type { AdminPrincipal } from '../auth/principal.js'
import type {
  AdminSessionListRow,
  AdminSessionMeta,
  AdminSessionStore,
  LiveSessionQuery,
} from '../auth/session.store.js'
import type { AdminDatabase } from '../database/types.js'
import { SESSION_MESSAGES } from './errors.js'
import { adminSessionListQuerySchema } from './sessions.query.js'
import { AdminSessionsService } from './sessions.service.js'

const principal: AdminPrincipal = {
  userNo: 3n,
  sessionNo: 9n,
  userId: 'admin',
  userName: '관리자',
  roleNo: 1n,
  roleName: '역할',
  teamNo: null,
  teamName: null,
  permissions: ['*'],
  isPasswordChangeRequired: false,
}

function meta(sessionNo: bigint): AdminSessionMeta {
  const at = new Date('2026-10-14T00:00:00.000Z')
  return {
    sessionNo,
    userAgent: 'UA',
    ipAddress: null,
    loginAt: at,
    lastAccessAt: at,
    expireAt: at,
  }
}

class FakeStore {
  revokeLiveCalls: { sessionNo: bigint; options: { userNo?: bigint } }[] = []
  revokeAllCalls: { userNo: bigint; reason: string; options: unknown }[] = []
  liveCount = 1
  lastQuery: LiveSessionQuery | null = null

  async revokeLive(sessionNo: bigint, _now: Date, options: { userNo?: bigint } = {}) {
    this.revokeLiveCalls.push({ sessionNo, options })
    return this.liveCount
  }

  async revokeAllOfUser(userNo: bigint, reason: string, _now: Date, options: unknown) {
    this.revokeAllCalls.push({ userNo, reason, options })
    return 2
  }

  async listLive(query: LiveSessionQuery) {
    this.lastQuery = query
    const rows: AdminSessionListRow[] = [9n, 10n].map((no) => ({
      ...meta(no),
      userNo: 3n,
      userId: 'admin',
      userName: '관리자',
    }))
    return { rows, total: 2n }
  }

  async listLiveOfUser() {
    return [meta(9n), meta(10n)]
  }
}

function service(store: FakeStore): AdminSessionsService {
  return new AdminSessionsService(
    store as unknown as AdminSessionStore,
    undefined as unknown as Kysely<AdminDatabase>,
  )
}

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error('BusinessError 가 아니다')
}

describe('AdminSessionsService', () => {
  it('🔴 지금 세션이면 UPDATE 를 보내지 않고 400 — 관리자 하나 · 내 세션 하나 둘 다', async () => {
    const store = new FakeStore()
    for (const run of [
      () => service(store).revoke(9n, principal),
      () => service(store).revokeMine(9n, principal),
    ]) {
      const error = await rejection(run)
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
      expect(error.message).toBe(SESSION_MESSAGES.currentSession)
    }
    expect(store.revokeLiveCalls).toEqual([])
  })

  it('🔴 0행이면 같은 404 — 내 세션 하나는 내 userNo 로만 끊는다', async () => {
    const store = new FakeStore()
    store.liveCount = 0
    const admin = await rejection(() => service(store).revoke(11n, principal))
    const mine = await rejection(() => service(store).revokeMine(11n, principal))
    for (const error of [admin, mine]) {
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_NOT_FOUND)
      expect(error.message).toBe(SESSION_MESSAGES.notFound)
    }
    expect(store.revokeLiveCalls).toEqual([
      { sessionNo: 11n, options: {} },
      { sessionNo: 11n, options: { userNo: 3n } },
    ])
  })

  it('다른 세션 모두는 지금 세션을 빼고 살아 있는 것만 terminated 로', async () => {
    const store = new FakeStore()
    expect(await service(store).revokeOthers(principal)).toBe(2)
    expect(store.revokeAllCalls).toEqual([
      { userNo: 3n, reason: 'terminated', options: { exceptSessionNo: 9n, liveOnly: true } },
    ])
  })

  it('목록 — isCurrent 는 주체의 세션만, 빈 검색어는 넘기지 않는다', async () => {
    const store = new FakeStore()
    const result = await service(store).list(
      adminSessionListQuerySchema.parse({
        page: '2',
        itemsPerPage: '5',
        filter: { keyword: ' ', userNo: '3' },
      }),
      principal,
    )
    expect(result.items.map((item) => [item.sessionNo, item.isCurrent])).toEqual([
      [9n, true],
      [10n, false],
    ])
    expect(result).toMatchObject({ total: 2n, page: 2, itemsPerPage: 5 })
    expect(store.lastQuery).toMatchObject({
      userNo: 3n,
      offset: 5,
      limit: 5,
      sort: [{ column: 'lastAccessAt', order: 'desc' }],
    })
    expect(store.lastQuery).not.toHaveProperty('keyword')
  })

  it('내 세션 — 전량에 isCurrent', async () => {
    const result = await service(new FakeStore()).listMine(principal)
    expect(result.items.map((item) => item.isCurrent)).toEqual([true, false])
  })
})
