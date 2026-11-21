// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { AdminIpPreview, AdminIpPreviewQuery, AdminIpRule } from '@ssworks/admin-shared'
import { DEFAULT_IP_ACCESS_MESSAGES as M } from '../components/ip-access/ip-access.js'
import type {
  IpExtraScopeOption,
  IpTargetOption,
} from '../components/ip-access/ip-scope-choices.js'
import { REMOTE_SEARCH_DEBOUNCE_MS } from './useRemoteSearch.js'
import {
  useIpAccessRules,
  type IpAccessRules,
  type UseIpAccessRulesOptions,
} from './useIpAccessRules.js'

// 확장 범위 흐름(확장 범위 스펙 §5-1 ~ §5-4) — 선택지 · 대상 검색 · 미리보기 없음 · 저장 · 삭제 · 모르는 범위.

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 1n,
  scopeType: 'global',
  scopeRefNo: null,
  scopeName: null,
  scopeUserId: null,
  cidr: '0.0.0.0/0',
  description: '기본 허용(IPv4)',
  revision: 0,
  createAt: '2026-11-21T00:00:00.000Z',
  updateAt: '2026-11-21T00:00:00.000Z',
  ...over,
})
const GLOBAL_V4 = rule()
const TOKEN = rule({
  ruleNo: 30n,
  scopeType: 'shippingToken',
  scopeRefNo: 7n,
  scopeName: '작업대 1',
  cidr: '203.0.113.7/32',
  description: null,
})
const ALL_USB = rule({
  ruleNo: 31n,
  scopeType: 'shippingToken',
  scopeRefNo: null,
  cidr: '0.0.0.0/0',
  description: null,
})
const GONE = rule({
  ruleNo: 40n,
  scopeType: 'goneScope',
  scopeRefNo: 2n,
  cidr: '10.0.0.0/8',
  description: null,
})
const RULES = [GLOBAL_V4, GONE, TOKEN, ALL_USB]

const previewResult = (): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 3,
    newlyLocked: 0,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function shipping(over: Partial<IpExtraScopeOption> = {}): IpExtraScopeOption {
  return {
    type: 'shippingToken',
    label: '출고 토큰',
    wholeLabel: '모든 출고 USB',
    search: vi.fn(async (): Promise<readonly IpTargetOption[]> => [
      { refNo: 8n, name: '작업대 2' },
    ]),
    ...over,
  }
}

async function setup(over: Partial<UseIpAccessRulesOptions> = {}) {
  const adapters = {
    list: vi.fn(async (): Promise<readonly AdminIpRule[]> => RULES),
    preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
    create: vi.fn(async (): Promise<unknown> => ({})),
    update: vi.fn(async (): Promise<unknown> => ({})),
    remove: vi.fn(async (): Promise<unknown> => ({})),
  }
  let ip!: IpAccessRules<AdminIpRule>
  wrapper = mount(
    defineComponent({
      setup() {
        ip = useIpAccessRules({
          ...adapters,
          canManage: () => true,
          extraScopes: [shipping()],
          ...over,
        })
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { ...adapters, ip }
}

const values = (ip: IpAccessRules<AdminIpRule>) =>
  ip.manager.value.scopeItems.map((item) => item.value)

describe('선택지', () => {
  it('새 규칙 — 코어 셋 뒤에 출고 토큰 · 모든 출고 USB', async () => {
    const { ip } = await setup()
    await ip.openCreate()
    expect(values(ip)).toEqual(['user', 'team', 'global', 'shippingToken', 'shippingToken:*'])
    expect(ip.manager.value.scopeItems.slice(3).map((item) => item.title)).toEqual([
      '출고 토큰',
      '모든 출고 USB',
    ])
  })

  it('wholeLabel 이 없으면 범위 전체를 고를 수 없다', async () => {
    const { ip } = await setup({ extraScopes: [shipping({ wholeLabel: undefined })] })
    await ip.openCreate()
    expect(values(ip)).toEqual(['user', 'team', 'global', 'shippingToken'])
  })

  it('🔴 수정 — 확장 규칙은 그 범위 둘만 · 코어로 바꾸는 갱신은 버린다(X2)', async () => {
    const { ip } = await setup()
    await ip.openEdit(TOKEN)
    expect(values(ip)).toEqual(['shippingToken', 'shippingToken:*'])
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'global' })
    expect(ip.form.value.scopeType).toBe('shippingToken')
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken:*' })
    expect(ip.form.value).toMatchObject({ scopeType: 'shippingToken:*', scopeRefNo: '' })
  })

  it('🔴 코어 규칙 수정 — 코어만', async () => {
    const { ip } = await setup()
    await ip.openEdit(GLOBAL_V4)
    expect(values(ip)).toEqual(['user', 'team', 'global'])
  })

  it('🔴 setup 에서 던진다 — 이름 규칙 밖 · 코어 이름(컴포넌트 밖에서 불러도 첫머리에서 던진다 — 3i 시험과 같은 꼴)', () => {
    const adapters = {
      list: vi.fn(async (): Promise<readonly AdminIpRule[]> => []),
      preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      remove: vi.fn(async () => ({})),
    }
    for (const type of ['Bad', 'user']) {
      expect(() =>
        useIpAccessRules({ ...adapters, canManage: () => true, extraScopes: [shipping({ type })] }),
      ).toThrow(/extraScopes/)
    }
  })
})

describe('미리보기 · 대상 칸', () => {
  it("🔴 확장 선택지면 미리보기 어댑터를 부르지 않는다 — 'unrelated'", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { ip, preview } = await setup()
    preview.mockClear()
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(ip.preview.value.state).toBe('unrelated')
    expect(preview).not.toHaveBeenCalled()
  })

  it('대상 검색 — 300ms 뒤 쓰는 쪽 어댑터 · 후보 · 지금 대상 이름', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const search = vi.fn(async (): Promise<readonly IpTargetOption[]> => [
      { refNo: 8n, name: '작업대 2' },
    ])
    const { ip } = await setup({ extraScopes: [shipping({ search })] })
    await ip.openEdit(TOKEN)
    expect(ip.manager.value.extraTarget).toMatchObject({
      label: M.targetLabel('출고 토큰'),
      mode: 'search',
      items: [{ value: '7', title: '작업대 1' }],
    })
    ip.manager.value.onSearchTargets('작업')
    await vi.advanceTimersByTimeAsync(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(search).toHaveBeenCalledWith('작업')
    expect(ip.manager.value.extraTarget?.items).toEqual([
      { value: '7', title: '작업대 1' },
      { value: '8', title: '작업대 2' },
    ])
  })

  it('🔴 canSearch 가 거짓이면 부르지 않고 번호 칸 · 이유', async () => {
    const search = vi.fn(async (): Promise<readonly IpTargetOption[]> => [])
    const { ip } = await setup({ extraScopes: [shipping({ search, canSearch: () => false })] })
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken' })
    expect(ip.manager.value.extraTarget).toMatchObject({
      mode: 'number',
      numberLabel: M.targetNumberLabel('출고 토큰'),
      hint: M.targetNoPermissionHint,
    })
    ip.manager.value.onSearchTargets('작업')
    expect(search).not.toHaveBeenCalled()
  })

  it('범위 전체 · 코어 선택지에서는 확장 대상 칸이 없다', async () => {
    const { ip } = await setup()
    await ip.openEdit(ALL_USB)
    expect(ip.manager.value.extraTarget).toBeNull()
    await ip.openEdit(GLOBAL_V4)
    expect(ip.manager.value.extraTarget).toBeNull()
  })
})

describe('저장 · 삭제', () => {
  it('대상 하나 — 본문 · 관문 문구(대상 이름 · 무관) · 「미리보기 없이 저장」 경고 없음', async () => {
    const { ip, create, preview } = await setup()
    preview.mockClear()
    await ip.openEdit(TOKEN)
    await ip.closeEditor()
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken' })
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeRefNo: '7', cidr: '203.0.113.8/32' })
    const saving = ip.save()
    await flushPromises()
    const dialog = ip.manager.value.confirmDialog
    expect(dialog.message).toContain('출고 토큰 · 작업대 1')
    expect(dialog.message).toContain(M.gateImpactUnrelated)
    dialog.onConfirm()
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(
      { scopeType: 'shippingToken', scopeRefNo: 7n, cidr: '203.0.113.8/32', description: null },
      {},
    )
    expect(ip.manager.value.alerts).toEqual([])
    expect(preview).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'create' }))
  })

  it('범위 전체 — 본문 scopeRefNo null · 관문 「모든 출고 USB」', async () => {
    const { ip, create } = await setup()
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({
      ...ip.form.value,
      scopeType: 'shippingToken:*',
      cidr: '198.51.100.0/24',
    })
    const saving = ip.save()
    await flushPromises()
    expect(ip.manager.value.confirmDialog.message).toContain('모든 출고 USB')
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(
      { scopeType: 'shippingToken', scopeRefNo: null, cidr: '198.51.100.0/24', description: null },
      {},
    )
  })

  it('🔴 삭제 — 미리보기를 부르지 않고 · 0.0.0.0/0 이어도 전체 허용 경고가 없다', async () => {
    const { ip, remove, preview } = await setup()
    preview.mockClear()
    const removing = ip.remove(ALL_USB)
    await flushPromises()
    expect(ip.manager.value.globalAllowRemoval).toBe(false)
    const dialog = ip.manager.value.confirmDialog
    expect(dialog.message).toContain(M.gateImpactUnrelated)
    expect(dialog.message).not.toContain(M.globalAllowRemoval)
    dialog.onConfirm()
    expect(await removing).toBe(true)
    expect(remove).toHaveBeenCalledWith(ALL_USB, { revision: 0 }, {})
    expect(preview).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'delete' }))
  })

  it('🔴 모르는 범위 행 — 수정은 열리지 않고 삭제만 된다(X8)', async () => {
    const { ip, remove } = await setup()
    expect(ip.manager.value.canEditRule(GONE)).toBe(false)
    expect(ip.manager.value.canEditRule(TOKEN)).toBe(true)
    expect(await ip.openEdit(GONE)).toBe(false)
    const removing = ip.remove(GONE)
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await removing).toBe(true)
    expect(remove).toHaveBeenCalled()
  })

  it('목록 표기 — 바인딩 카탈로그로 확장 범위 이름을 그린다', async () => {
    const { ip } = await setup()
    expect(ip.manager.value.scopeCatalog.extra.get('shippingToken')?.label).toBe('출고 토큰')
    expect(ip.manager.value.showPreviewCard).toBe(true)
  })
})
