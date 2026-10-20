// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Plugin } from 'vue'
import type {
  AdminIpPreview,
  AdminIpPreviewItem,
  AdminIpPreviewQuery,
  AdminIpRule,
  AdminTeamNode,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import {
  DEFAULT_IP_ACCESS_MESSAGES as M,
  type IpUserOption,
} from '../components/ip-access/ip-access.js'
import { createAdminUi } from '../context/admin-ui.js'
import { IP_PREVIEW_DEBOUNCE_MS } from './useIpPreview.js'
import { REMOTE_SEARCH_DEBOUNCE_MS } from './useRemoteSearch.js'
import {
  useIpAccessRules,
  type IpAccessRules,
  type UseIpAccessRulesOptions,
} from './useIpAccessRules.js'

// 정본: hangang-home ip-access.render.test.ts(상시 카드 · 편집 패널 · 본인 표시 · 권한 없음)를 composable 에 대고 잰다.

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 12n,
  scopeType: 'team',
  scopeRefNo: 4n,
  scopeName: '상담센터',
  scopeUserId: null,
  cidr: '203.0.113.0/24',
  description: '상담센터 사무실',
  revision: 3,
  createAt: '2026-10-01T00:00:00.000Z',
  updateAt: '2026-10-02T00:00:00.000Z',
  ...over,
})

const GLOBAL_V4 = rule({
  ruleNo: 1n,
  scopeType: 'global',
  scopeRefNo: null,
  scopeName: null,
  cidr: '0.0.0.0/0',
  description: '기본 허용(IPv4)',
  revision: 0,
})
const TEAM = rule()
const USER = rule({
  ruleNo: 20n,
  scopeType: 'user',
  scopeRefNo: 3n,
  scopeName: '김운영',
  scopeUserId: 'ops01',
  cidr: '203.0.113.7/32',
})
const RULES = [GLOBAL_V4, TEAM, USER]

const previewItem = (over: Partial<AdminIpPreviewItem> = {}): AdminIpPreviewItem => ({
  userNo: 7n,
  userId: 'cs07',
  userName: '이상담',
  layerBefore: 'global',
  layerAfter: 'team',
  statusBefore: 'passes',
  statusAfter: 'locked',
  becomesLocked: true,
  ruleSetChanged: true,
  activeSessionCount: 1,
  blockedSessionCount: 1,
  unknownIpSessionCount: 0,
  ...over,
})

const previewResult = (over: Partial<AdminIpPreview> = {}): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 14,
    newlyLocked: 0,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
  ...over,
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function setup(over: Partial<UseIpAccessRulesOptions> = {}, plugins: Plugin[] = []) {
  const adapters = {
    list: vi.fn(async () => RULES),
    preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    remove: vi.fn(async () => ({})),
  }
  let ip!: IpAccessRules<AdminIpRule>
  wrapper = mount(
    defineComponent({
      setup() {
        ip = useIpAccessRules({ ...adapters, canManage: () => true, ...over })
        return () => h('div')
      },
    }),
    { global: { plugins } },
  )
  await flushPromises()
  return { ...adapters, ip }
}

describe('useIpAccessRules — 목록 · 현행 미리보기', () => {
  it('처음 — 목록과 현행 미리보기를 부른다', async () => {
    const { list, preview, ip } = await setup()
    expect(list).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith({})
    const m = ip.manager.value
    expect(m.rules).toEqual(RULES)
    expect(m.loading).toBe(false)
    expect(m.preview).toMatchObject({ state: 'ready', op: null, clientIp: '203.0.113.7' })
    expect(m.editing).toBeNull()
  })

  it('목록 실패 — loadFailed · 직전 목록 유지 · [다시 시도]로 회복', async () => {
    const list = vi
      .fn<() => Promise<readonly AdminIpRule[]>>()
      .mockResolvedValueOnce(RULES)
      .mockRejectedValueOnce(new ApiError('x', { status: 500, raw: null }))
      .mockResolvedValueOnce([TEAM])
    const { ip } = await setup({ list })
    await ip.reload()
    expect(ip.manager.value.loadFailed).toBe(true)
    expect(ip.manager.value.rules).toEqual(RULES)
    ip.manager.value.onRetry()
    await flushPromises()
    expect(ip.manager.value.loadFailed).toBe(false)
    expect(ip.manager.value.rules).toEqual([TEAM])
  })

  it('🔴 관리 권한이 없으면 — 미리보기 forbidden · 편집을 열지 않는다', async () => {
    const { preview, ip } = await setup({ canManage: () => false })
    expect(preview).not.toHaveBeenCalled()
    expect(ip.manager.value.preview.state).toBe('forbidden')
    expect(ip.manager.value.canManage).toBe(false)
    expect(await ip.openCreate()).toBe(false)
    expect(ip.editing.value).toBeNull()
  })
})

describe('useIpAccessRules — 편집 패널', () => {
  it('새 규칙 — 빈 폼 · 미리보기는 pending-input', async () => {
    const { ip } = await setup()
    expect(await ip.openCreate()).toBe(true)
    expect(ip.manager.value.editing).toBe('new')
    expect(ip.manager.value.form).toEqual({
      scopeType: 'global',
      scopeRefNo: '',
      cidr: '',
      description: '',
    })
    expect(ip.manager.value.preview).toMatchObject({ state: 'pending-input', op: 'create' })
  })

  it('수정 — 규칙 값으로 채우고 300ms 뒤 수정 미리보기', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { preview, ip } = await setup()
    await ip.openEdit(TEAM)
    expect(ip.form.value).toEqual({
      scopeType: 'team',
      scopeRefNo: '4',
      cidr: '203.0.113.0/24',
      description: '상담센터 사무실',
    })
    expect(ip.manager.value.preview.state).toBe('loading')
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(preview).toHaveBeenLastCalledWith({
      op: 'update',
      ruleNo: 12n,
      scopeType: 'team',
      scopeRefNo: 4n,
      cidr: '203.0.113.0/24',
    })
  })

  it('🔴 범위를 바꾸면 대상을 비운다 — 팀 번호가 사용자 번호로 남지 않게', async () => {
    const { ip } = await setup()
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'user' })
    expect(ip.form.value).toMatchObject({ scopeType: 'user', scopeRefNo: '' })
  })

  it('CIDR 칸을 떠날 때 형식 오류를 보이고, 다시 고치면 내린다', async () => {
    const { ip } = await setup()
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '10.0.0.1' })
    ip.manager.value.onCidrBlur()
    expect(ip.manager.value.fieldErrors.cidr).toEqual([M.cidrInvalid])
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '10.0.0.0/8' })
    expect(ip.manager.value.fieldErrors.cidr).toBeUndefined()
  })

  it('🔴 고친 값이 있으면 버릴지 묻는다 — 취소면 그대로, 버리면 넘어간다', async () => {
    const { ip } = await setup()
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '10.0.0.0/8' })
    const first = ip.openCreate()
    await flushPromises()
    expect(ip.manager.value.discardDialog).toMatchObject({
      modelValue: true,
      title: M.discardTitle,
      reversible: false,
    })
    ip.manager.value.discardDialog['onUpdate:modelValue'](false)
    expect(await first).toBe(false)
    expect(ip.editing.value).toBe(TEAM)
    const second = ip.openCreate()
    await flushPromises()
    ip.manager.value.discardDialog.onConfirm()
    expect(await second).toBe(true)
    expect(ip.editing.value).toBe('new')
  })

  it('고친 값이 없으면 묻지 않고 닫는다', async () => {
    const { ip } = await setup()
    await ip.openEdit(TEAM)
    expect(await ip.closeEditor()).toBe(true)
    expect(ip.manager.value.discardDialog.modelValue).toBe(false)
    expect(ip.editing.value).toBeNull()
  })

  it('🔴 미리보기 404 — 목록을 다시 부르고, 편집 중인 규칙이 사라졌으면 패널을 닫는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const list = vi
      .fn<() => Promise<readonly AdminIpRule[]>>()
      .mockResolvedValueOnce(RULES)
      .mockResolvedValue([GLOBAL_V4, USER])
    const preview = vi
      .fn(async (_query: AdminIpPreviewQuery) => previewResult())
      .mockResolvedValueOnce(previewResult())
      .mockRejectedValueOnce(new ApiError('없음', { status: 404, raw: null }))
    const { ip } = await setup({ list, preview })
    await ip.openEdit(TEAM)
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(list).toHaveBeenCalledTimes(2)
    expect(ip.editing.value).toBeNull()
    expect(ip.manager.value.alerts).toEqual([{ kind: 'warning', text: M.ruleGone }])
  })

  it('전체 허용 규칙을 좁히면 globalAllowRemoval', async () => {
    const { ip } = await setup()
    await ip.openEdit(GLOBAL_V4)
    expect(ip.manager.value.globalAllowRemoval).toBe(false)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '203.0.113.0/24' })
    expect(ip.manager.value.globalAllowRemoval).toBe(true)
  })
})

describe('useIpAccessRules — 층 목록 scopes(3i)', () => {
  const values = (items: readonly { value: string }[]) => items.map((item) => item.value)

  it('기본은 층 셋', async () => {
    const { ip } = await setup()
    expect(values(ip.manager.value.scopeItems)).toEqual(['user', 'team', 'global'])
  })

  it('🔴 팀 없는 앱 — 사용자 · 전체만, 넘긴 순서와 무관하게 평가 순서', async () => {
    const { ip } = await setup({ scopes: ['global', 'user'] })
    await ip.openCreate()
    expect(values(ip.manager.value.scopeItems)).toEqual(['user', 'global'])
    expect(ip.form.value.scopeType).toBe('global')
  })

  it('전체가 빠지면 새 규칙은 가장 가까운 층 · 연 순간 고친 값이 없다', async () => {
    const { ip } = await setup({ scopes: ['user', 'team'] })
    await ip.openCreate()
    expect(ip.form.value).toEqual({ scopeType: 'user', scopeRefNo: '', cidr: '', description: '' })
    expect(await ip.closeEditor()).toBe(true)
    expect(ip.manager.value.discardDialog.modelValue).toBe(false)
  })

  it('목록 밖 층의 기존 규칙 — 열면 그 층이 선택지에 있고, 다른 층으로 바꾸면 사라진다', async () => {
    const { ip } = await setup({ scopes: ['user', 'global'] })
    await ip.openEdit(TEAM)
    expect(values(ip.manager.value.scopeItems)).toEqual(['user', 'team', 'global'])
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'user' })
    expect(ip.form.value.scopeType).toBe('user')
    expect(values(ip.manager.value.scopeItems)).toEqual(['user', 'global'])
  })

  it('🔴 목록 밖 층으로는 바꾸지 않는다 — 다시 팀으로 돌아갈 수 없다(3i S4)', async () => {
    const { ip } = await setup({ scopes: ['user', 'global'] })
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'team', scopeRefNo: '4' })
    expect(ip.form.value.scopeType).toBe('global')
    expect(await ip.closeEditor()).toBe(true)
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'user' })
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'team' })
    expect(ip.form.value.scopeType).toBe('user')
  })
})

describe('useIpAccessRules — 대상 후보', () => {
  const tree: AdminTeamNode[] = [
    {
      teamNo: 1n,
      teamName: '본사',
      displayOrder: 0,
      children: [{ teamNo: 4n, teamName: '상담센터', displayOrder: 0, children: [] }],
    },
  ]

  it('팀 — 편집을 열 때 불러 경로 항목으로', async () => {
    const loadTeams = vi.fn(async () => tree)
    const { ip } = await setup({ loadTeams })
    expect(loadTeams).not.toHaveBeenCalled()
    await ip.openEdit(TEAM)
    await flushPromises()
    expect(loadTeams).toHaveBeenCalledTimes(1)
    expect(ip.manager.value.teamMode).toBe('select')
    expect(ip.manager.value.teamItems).toEqual([
      { value: '1', title: '본사' },
      { value: '4', title: '본사 › 상담센터' },
    ])
  })

  it('🔴 팀 권한 게터가 거짓이면 부르지 않고 번호 칸 · 이유', async () => {
    const loadTeams = vi.fn(async () => tree)
    const { ip } = await setup({ loadTeams, canLoadTeams: () => false })
    await ip.openEdit(TEAM)
    await flushPromises()
    expect(loadTeams).not.toHaveBeenCalled()
    expect(ip.manager.value.teamMode).toBe('number')
    expect(ip.manager.value.teamHint).toBe(M.teamNoPermissionHint)
  })

  it('팀 후보 실패 — teamsFailed · 처리됨 · 지금 대상은 이름으로 남는다', async () => {
    const error = new ApiError('x', { status: 500, raw: null })
    const loadTeams = vi.fn(async (): Promise<AdminTeamNode[]> => {
      throw error
    })
    const { ip } = await setup({ loadTeams })
    await ip.openEdit(TEAM)
    await flushPromises()
    expect(ip.manager.value.teamsFailed).toBe(true)
    expect(error.handled).toBe(true)
    expect(ip.manager.value.teamItems).toEqual([{ value: '4', title: '상담센터' }])
  })

  it('🔴 버린 팀 후보 요청의 실패도 처리됨 — 새 요청의 결과를 보인다', async () => {
    const error = new ApiError('x', { status: 500, raw: null })
    let rejectFirst!: (e: unknown) => void
    const loadTeams = vi
      .fn<() => Promise<AdminTeamNode[]>>()
      .mockReturnValueOnce(
        new Promise<AdminTeamNode[]>((_, reject) => {
          rejectFirst = reject
        }),
      )
      .mockResolvedValueOnce(tree)
    const { ip } = await setup({ loadTeams })
    await ip.openEdit(TEAM)
    await ip.openEdit(USER)
    await flushPromises()
    expect(loadTeams).toHaveBeenCalledTimes(2)
    rejectFirst(error)
    await flushPromises()
    expect(error.handled).toBe(true)
    expect(ip.manager.value.teamsFailed).toBe(false)
    expect(ip.manager.value.teamItems).toEqual([
      { value: '1', title: '본사' },
      { value: '4', title: '본사 › 상담센터' },
    ])
  })

  it('사용자 — 300ms 뒤 검색, 수정 때는 지금 대상을 이름(아이디)으로', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const options: IpUserOption[] = [{ userNo: 9n, userId: 'park', userName: '박보안' }]
    const searchUsers = vi.fn(async () => options)
    const { ip } = await setup({ searchUsers })
    await ip.openEdit(USER)
    expect(ip.manager.value.userMode).toBe('search')
    expect(ip.manager.value.userItems).toEqual([{ value: '3', title: '김운영 (ops01)' }])
    ip.manager.value.onSearchUsers('박')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(searchUsers).toHaveBeenCalledWith('박')
    expect(ip.manager.value.userItems).toEqual([
      { value: '3', title: '김운영 (ops01)' },
      { value: '9', title: '박보안 (park)' },
    ])
  })

  it('🔴 사용자 권한 게터가 거짓이면 부르지 않고 번호 칸 · 이유', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const searchUsers = vi.fn(async () => [] as IpUserOption[])
    const { ip } = await setup({ searchUsers, canSearchUsers: () => false })
    ip.manager.value.onSearchUsers('박')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(searchUsers).not.toHaveBeenCalled()
    expect(ip.manager.value.userMode).toBe('number')
    expect(ip.manager.value.userHint).toBe(M.userNoPermissionHint)
  })
})

describe('useIpAccessRules — 카드 바인딩', () => {
  const items = [
    previewItem({ userNo: 1n, userId: 'ops01', userName: '김운영' }),
    previewItem({ userNo: 2n, becomesLocked: false, ruleSetChanged: true }),
  ]

  it('잠기는 사람 · 규칙만 바뀌는 사람 · 🔴 본인 판정 기본은 로그인한 아이디', async () => {
    const plugins = [
      createAdminUi({
        user: () => ({ userId: 'ops01', userName: '김운영', permissions: ['*'] }),
        logout: async () => {},
      }),
    ]
    const { ip } = await setup({ preview: vi.fn(async () => previewResult({ items })) }, plugins)
    const m = ip.manager.value
    expect(m.lockedItems.map((i) => i.userNo)).toEqual([1n])
    expect(m.changedItems.map((i) => i.userNo)).toEqual([2n])
    expect(m.isSelf(items[0]!)).toBe(true)
    expect(m.isSelf(items[1]!)).toBe(false)
  })

  it('isSelf 옵션이 기본을 대신한다 · 컨텍스트가 없으면 본인 표시만 빠진다', async () => {
    const { ip } = await setup({
      preview: vi.fn(async () => previewResult({ items })),
      isSelf: (i) => i.userNo === 2n,
    })
    expect(ip.manager.value.isSelf(items[1]!)).toBe(true)
    wrapper?.unmount()
    const other = await setup({ preview: vi.fn(async () => previewResult({ items })) })
    expect(other.ip.manager.value.isSelf(items[0]!)).toBe(false)
  })

  it('문구 덮어쓰기 · 범위 항목', async () => {
    const { ip } = await setup({ messages: { hintRecovery: '런북: runbook/ip.md' } })
    expect(ip.manager.value.messages.hintRecovery).toBe('런북: runbook/ip.md')
    expect(ip.manager.value.messages.save).toBe('저장')
    expect(ip.manager.value.scopeItems.map((i) => i.value)).toEqual(['user', 'team', 'global'])
  })

  it('reload — 목록과 카드(현재 IP)를 함께 다시 부른다', async () => {
    const { list, preview, ip } = await setup()
    await ip.reload()
    await flushPromises()
    expect(list).toHaveBeenCalledTimes(2)
    expect(preview).toHaveBeenCalledTimes(2)
  })
})
