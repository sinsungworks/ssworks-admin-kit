// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { defineAuditCatalog, type AdminAuditLog } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import {
  DEFAULT_AUDIT_LOG_MESSAGES as M,
  emptyAuditLogDraft,
  type AuditActorOption,
  type AuditLogDraft,
  type AuditLogFilter,
} from '../components/audit/audit-log.js'
import { REMOTE_SEARCH_DEBOUNCE_MS } from './useRemoteSearch.js'
import { useAuditLogs, type AuditLogs, type UseAuditLogsOptions } from './useAuditLogs.js'
import type { ServerTableParams } from './useServerTable.js'

// 정본: hangang-home apps/admin/src/pages/settings/audit-logs.render.test.ts(입력/적용 · 같은 조건 재적용 · 검증 실패 ·
//       권한 없으면 계정 목록 안 부름)를 composable 에 대고 잰다.

const log = (over: Partial<AdminAuditLog> = {}): AdminAuditLog => ({
  logNo: 1n,
  actorUserNo: 12n,
  actorUserId: 'ops01',
  actorUserName: '김운영',
  sessionNo: 4182n,
  action: 'org.role.update',
  targetType: 'role',
  targetRefNo: 3n,
  method: 'PATCH',
  path: '/admin/roles/3',
  statusCode: 200,
  errorCode: null,
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  meta: null,
  createAt: '2026-10-18T05:03:21.000Z',
  ...over,
})

type Fetch = (
  params: ServerTableParams<AuditLogFilter>,
) => Promise<{ items: AdminAuditLog[]; total: number }>

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function setup(over: Partial<UseAuditLogsOptions> = {}, rows: AdminAuditLog[] = [log()]) {
  const fetch = vi.fn<Fetch>(async () => ({ items: rows, total: rows.length }))
  let audit!: AuditLogs<AdminAuditLog>
  wrapper = mount(
    defineComponent({
      setup() {
        audit = useAuditLogs({ fetch, ...over })
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { fetch, audit }
}

const lastParams = (fetch: { mock: { lastCall?: [ServerTableParams<AuditLogFilter>] } }) =>
  fetch.mock.lastCall?.[0]

function edit(audit: AuditLogs<AdminAuditLog>, patch: Partial<AuditLogDraft>): void {
  audit.viewer.value['onUpdate:draft']({ ...audit.draft.value, ...patch })
}

describe('useAuditLogs — 조회 · 입력/적용', () => {
  it('첫 조회 1번 — 정렬 createAt desc 를 늘 싣고 필터는 비었다', async () => {
    const { fetch } = await setup()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith({
      page: 1,
      itemsPerPage: 20,
      sortBy: ['createAt'],
      sortOrder: ['desc'],
      filter: {},
    })
  })

  it('🔴 입력 중에는 조회하지 않는다 — [적용]에 한 번', async () => {
    const { fetch, audit } = await setup()
    edit(audit, { targetType: 'role', targetRefNo: '3' })
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(audit.apply()).toBe(true)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(lastParams(fetch)?.filter).toEqual({ targetType: 'role', targetRefNo: 3n })
  })

  it('🔴 같은 조건으로 다시 적용해도 다시 부른다(A2)', async () => {
    const { fetch, audit } = await setup()
    audit.apply()
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('같은 조건 재적용은 지금 쪽을 다시 부른다 — 1쪽으로 튀지 않는다', async () => {
    const { fetch, audit } = await setup()
    audit.viewer.value['onUpdate:page'](3)
    await flushPromises()
    audit.apply()
    await flushPromises()
    expect(lastParams(fetch)?.page).toBe(3)
  })

  it('조건이 바뀌면 1쪽부터', async () => {
    const { fetch, audit } = await setup()
    audit.viewer.value['onUpdate:page'](3)
    await flushPromises()
    edit(audit, { action: 'auth.' })
    audit.apply()
    await flushPromises()
    expect(lastParams(fetch)?.page).toBe(1)
    expect(lastParams(fetch)?.filter).toEqual({ action: 'auth.', actionMatch: 'prefix' })
  })

  it('검증 실패면 조회하지 않고 filterError — 입력값은 그대로, 고쳐 적용하면 내린다', async () => {
    const { fetch, audit } = await setup()
    edit(audit, { targetRefNo: 'abc' })
    expect(audit.apply()).toBe(false)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(audit.filterError.value).toBe(M.targetRefInvalid)
    expect(audit.viewer.value.filterError).toBe(M.targetRefInvalid)
    expect(audit.draft.value.targetRefNo).toBe('abc')
    edit(audit, { targetRefNo: '3' })
    expect(audit.apply()).toBe(true)
    expect(audit.filterError.value).toBeNull()
  })

  it('앞뒤 공백을 떼고 적용한다', async () => {
    const { audit } = await setup()
    edit(audit, { targetRefNo: ' 3 ' })
    audit.apply()
    expect(audit.applied.value.targetRefNo).toBe('3')
    expect(audit.draft.value.targetRefNo).toBe('3')
  })

  it('[초기화] — 입력값 · 적용값을 비우고 다시 부른다', async () => {
    const { fetch, audit } = await setup()
    edit(audit, { action: 'auth.' })
    audit.apply()
    await flushPromises()
    audit.reset()
    await flushPromises()
    expect(audit.draft.value).toEqual(emptyAuditLogDraft())
    expect(audit.applied.value).toEqual(emptyAuditLogDraft())
    expect(lastParams(fetch)?.filter).toEqual({})
  })

  it('filtered 는 적용값 기준이다', async () => {
    const { audit } = await setup()
    expect(audit.viewer.value.filtered).toBe(false)
    edit(audit, { action: 'auth.' })
    expect(audit.viewer.value.filtered).toBe(false)
    audit.apply()
    expect(audit.viewer.value.filtered).toBe(true)
  })
})

describe('useAuditLogs — 이 사람 기록만 · 펼침', () => {
  it('행위자만 바꿔 바로 조회하고, 입력 중이던 다른 칸은 적용값으로 돌아간다(A10)', async () => {
    const { fetch, audit } = await setup()
    edit(audit, { action: 'org.role.' })
    audit.apply()
    await flushPromises()
    edit(audit, { targetRefNo: '9' })
    audit.filterByActor(log({ actorUserNo: 7n }))
    await flushPromises()
    expect(audit.applied.value).toEqual({
      ...emptyAuditLogDraft(),
      action: 'org.role.',
      actorUserNo: '7',
    })
    expect(audit.draft.value).toEqual(audit.applied.value)
    expect(lastParams(fetch)?.filter).toEqual({
      actorUserNo: 7n,
      action: 'org.role.',
      actionMatch: 'prefix',
    })
  })

  it('행위자가 없는 행은 무시한다', async () => {
    const { fetch, audit } = await setup()
    audit.filterByActor(log({ actorUserNo: null, actorUserId: null, actorUserName: null }))
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('적용하면 펼친 행을 비운다', async () => {
    const { audit } = await setup()
    audit.viewer.value['onUpdate:expanded'](['1'])
    expect(audit.viewer.value.expanded).toEqual(['1'])
    edit(audit, { action: 'auth.' })
    audit.apply()
    expect(audit.viewer.value.expanded).toEqual([])
  })
})

describe('useAuditLogs — 바인딩', () => {
  it('행 · 총 개수 · 쪽 넘기기', async () => {
    const rows = [log(), log({ logNo: 2n })]
    const { fetch, audit } = await setup({}, rows)
    expect(audit.viewer.value.rows).toEqual(rows)
    expect(audit.viewer.value.itemsLength).toBe(2)
    audit.viewer.value['onUpdate:itemsPerPage'](50)
    await flushPromises()
    expect(lastParams(fetch)?.itemsPerPage).toBe(50)
  })

  it('조회 실패 — loadFailed, [다시 시도]로 회복', async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockRejectedValueOnce(new ApiError('x', { status: 500, raw: null }))
      .mockResolvedValue({ items: [log()], total: 1 })
    const { audit } = await setup({ fetch })
    expect(audit.viewer.value.loadFailed).toBe(true)
    audit.viewer.value.onRetry()
    await flushPromises()
    expect(audit.viewer.value.loadFailed).toBe(false)
    expect(audit.viewer.value.rows).toHaveLength(1)
  })

  it('카탈로그 · 프로젝트 묶음 · 대상 항목 · 문구 덮어쓰기', async () => {
    const catalog = defineAuditCatalog({
      actions: { POINT_ADJUST: 'members.points.adjust', POINT_GRANT: 'members.points.grant' },
      targets: { MEMBER: 'member' },
      labels: { 'members.points.adjust': '포인트 조정', 'members.points.grant': '포인트 지급' },
      targetLabels: { member: '회원' },
    })
    const { audit } = await setup({
      catalog,
      actionGroups: [{ prefix: 'members.points', label: '포인트' }],
      messages: { readOnlyNote: '바꾼 안내' },
      fieldLabels: { roleName: '역할 이름' },
    })
    const v = audit.viewer.value
    expect(v.actionItems).toContainEqual({
      value: 'members.points.',
      title: '[묶음] 포인트 (members.points.*)',
    })
    expect(v.targetItems).toContainEqual({ value: 'member', title: '회원' })
    expect(v.messages.readOnlyNote).toBe('바꾼 안내')
    expect(v.messages.apply).toBe('적용')
    expect(v.fieldLabels).toEqual({ roleName: '역할 이름' })
    expect(v.catalog).toBe(catalog)
  })
})

describe('useAuditLogs — 행위자 칸(A8 · A9)', () => {
  const OPTIONS: AuditActorOption[] = [
    { userNo: 12n, userId: 'ops01', userName: '김운영' },
    { userNo: 30n, userId: 'old03', userName: '이퇴사', resigned: true },
  ]

  it('어댑터가 없으면 번호 모드 · 안내 없음', async () => {
    const { audit } = await setup()
    expect(audit.viewer.value.actorMode).toBe('number')
    expect(audit.viewer.value.actorHint).toBeNull()
  })

  it('🔴 권한 게터가 거짓이면 번호 모드 · 안내 · 어댑터를 부르지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const searchActors = vi.fn(async () => OPTIONS)
    const { audit } = await setup({ searchActors, canSearchActors: () => false })
    expect(audit.viewer.value.actorMode).toBe('number')
    expect(audit.viewer.value.actorHint).toBe(M.actorNoPermissionHint)
    audit.viewer.value.onSearchActors('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(searchActors).not.toHaveBeenCalled()
  })

  it('검색 모드 — 300ms 뒤 부르고 항목을 만든다(퇴사 표시)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const searchActors = vi.fn(async () => OPTIONS)
    const { audit } = await setup({ searchActors })
    expect(audit.viewer.value.actorMode).toBe('search')
    audit.viewer.value.onSearchActors('김')
    expect(audit.viewer.value.actorSearching).toBe(true)
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(searchActors).toHaveBeenCalledWith('김')
    expect(audit.viewer.value.actorItems).toEqual([
      { value: '12', title: '김운영 (ops01)' },
      { value: '30', title: '이퇴사 (old03) · 퇴사' },
    ])
    expect(audit.viewer.value.actorSearching).toBe(false)
  })

  it('검색 실패 — actorSearchFailed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const searchActors = vi.fn(async (): Promise<AuditActorOption[]> => {
      throw new ApiError('x', { status: 500, raw: null })
    })
    const { audit } = await setup({ searchActors })
    audit.viewer.value.onSearchActors('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(audit.viewer.value.actorSearchFailed).toBe(true)
  })

  it('고른 값이 검색 결과에 없으면 이름표를 앞에 둔다 — 목록 행 → #번호(A9)', async () => {
    const searchActors = vi.fn(async () => [] as AuditActorOption[])
    const { audit } = await setup({ searchActors }, [log({ actorUserNo: 12n })])
    edit(audit, { actorUserNo: '12' })
    expect(audit.viewer.value.actorItems[0]).toEqual({ value: '12', title: '김운영 (ops01)' })
    edit(audit, { actorUserNo: '99' })
    expect(audit.viewer.value.actorItems[0]).toEqual({ value: '99', title: '#99' })
  })

  it('이 사람 기록만으로 들어온 행위자는 그 행의 이름표를 기억한다', async () => {
    const searchActors = vi.fn(async () => [] as AuditActorOption[])
    const { audit } = await setup({ searchActors }, [log()])
    audit.filterByActor(log({ actorUserNo: 77n, actorUserId: 'park', actorUserName: '박보안' }))
    await flushPromises()
    expect(audit.viewer.value.actorItems[0]).toEqual({ value: '77', title: '박보안 (park)' })
  })
})
