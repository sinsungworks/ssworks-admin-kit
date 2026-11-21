// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { AdminIpPreview, AdminIpPreviewQuery, AdminIpRule } from '@ssworks/admin-shared'
import type {
  IpExtraScopeOption,
  IpTargetOption,
} from '../components/ip-access/ip-scope-choices.js'
import {
  useIpAccessRules,
  type IpAccessRules,
  type UseIpAccessRulesOptions,
} from './useIpAccessRules.js'

// 한 범위 모드 · 미리 채운 만들기(확장 범위 스펙 §5-3 · §5-5 · X12).

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
const TOKEN_7 = rule({
  ruleNo: 30n,
  scopeType: 'shippingToken',
  scopeRefNo: 7n,
  scopeName: '작업대 1',
  cidr: '203.0.113.7/32',
  description: null,
})
const TOKEN_8 = rule({
  ruleNo: 32n,
  scopeType: 'shippingToken',
  scopeRefNo: 8n,
  scopeName: '작업대 2',
  cidr: '198.51.100.8/32',
  description: null,
})
const ALL_USB = rule({
  ruleNo: 31n,
  scopeType: 'shippingToken',
  scopeRefNo: null,
  cidr: '10.0.0.0/8',
  description: null,
})
const RULES = [GLOBAL_V4, TOKEN_7, ALL_USB, TOKEN_8]
const FOCUS_7 = { scopeType: 'shippingToken', scopeRefNo: 7n }

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

// 한 시험에서 setup 을 여러 번 부르므로 마운트한 것을 모아 afterEach 에서 모두 내린다
const wrappers: VueWrapper[] = []

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
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
  wrappers.push(
    mount(
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
    ),
  )
  await flushPromises()
  return { ...adapters, ip }
}

describe('한 범위 모드(focus — 스펙 §5-3)', () => {
  it('대상을 주면 — 그 토큰 · 모든 출고 USB 규칙만 · 선택지 둘 · 카드 없음', async () => {
    const { ip } = await setup({ focus: FOCUS_7 })
    expect(ip.rules.value).toEqual([TOKEN_7, ALL_USB])
    expect(ip.manager.value.rules).toEqual([TOKEN_7, ALL_USB])
    expect(ip.manager.value.showPreviewCard).toBe(false)
    await ip.openCreate()
    expect(ip.manager.value.scopeItems.map((item) => item.value)).toEqual([
      'shippingToken',
      'shippingToken:*',
    ])
  })

  it('대상을 안 주면 — 그 범위 전부', async () => {
    const { ip } = await setup({ focus: { scopeType: 'shippingToken' } })
    expect(ip.rules.value).toEqual([TOKEN_7, ALL_USB, TOKEN_8])
  })

  it('🔴 대상 고정 — 새 폼은 그 토큰 · 대상 칸은 fixed · 번호를 바꾸는 갱신은 무시', async () => {
    const { ip } = await setup({ focus: FOCUS_7 })
    await ip.openCreate()
    expect(ip.form.value).toMatchObject({ scopeType: 'shippingToken', scopeRefNo: '7' })
    expect(ip.manager.value.extraTarget).toMatchObject({ mode: 'fixed', fixedTitle: '작업대 1' })
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeRefNo: '8' })
    expect(ip.form.value.scopeRefNo).toBe('7')
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken:*' })
    expect(ip.form.value).toMatchObject({ scopeType: 'shippingToken:*', scopeRefNo: '' })
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'shippingToken' })
    expect(ip.form.value.scopeRefNo).toBe('7')
  })

  it('🔴 focus 범위가 extraScopes 에 없으면 setup 에서 던진다', () => {
    expect(() =>
      useIpAccessRules({
        list: vi.fn(async (): Promise<readonly AdminIpRule[]> => []),
        preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
        remove: vi.fn(async () => ({})),
        canManage: () => true,
        extraScopes: [shipping()],
        focus: { scopeType: 'apiKey' },
      }),
    ).toThrow(/focus/)
  })

  it('고정 대상의 이름을 모르면 번호로 표기한다', async () => {
    const { ip } = await setup({ focus: { scopeType: 'shippingToken', scopeRefNo: 99n } })
    await ip.openCreate()
    expect(ip.manager.value.extraTarget).toMatchObject({ mode: 'fixed', fixedTitle: '#99' })
  })

  it('🔴 서버 미리보기를 부르지 않는다 — 마운트 · 편집 열고 닫기 · 저장 · reload · 다시 시도', async () => {
    const { ip, preview } = await setup({ focus: FOCUS_7 })
    expect(preview).not.toHaveBeenCalled()
    await ip.openEdit(TOKEN_7)
    await ip.closeEditor()
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '203.0.113.9/32' })
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    const removing = ip.remove(TOKEN_7)
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    await removing
    await ip.reload()
    ip.manager.value.onRetry()
    await flushPromises()
    expect(preview).not.toHaveBeenCalled()
  })

  it('저장 뒤 재조회 — 다시 걸러 보인다', async () => {
    const { ip, list } = await setup({ focus: FOCUS_7 })
    list.mockResolvedValueOnce([
      ...RULES,
      rule({
        ruleNo: 33n,
        scopeType: 'shippingToken',
        scopeRefNo: 7n,
        scopeName: '작업대 1',
        cidr: '203.0.113.9/32',
      }),
    ])
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '203.0.113.9/32' })
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(ip.rules.value.map((item) => item.ruleNo)).toEqual([30n, 31n, 33n])
  })
})

describe('미리 채운 만들기(openCreate(prefill) — 스펙 §5-5 · R6c)', () => {
  const PREFILL = {
    scopeType: 'shippingToken',
    scopeRefNo: 8n,
    scopeName: '작업대 2',
    cidr: '203.0.113.50/32',
    description: '2026-11-21 출고 시도에서 허용',
  }

  it('패널이 그 값으로 열리고 관문 문구에 이름 · 저장 본문', async () => {
    const { ip, create } = await setup()
    expect(await ip.openCreate(PREFILL)).toBe(true)
    expect(ip.form.value).toEqual({
      scopeType: 'shippingToken',
      scopeRefNo: '8',
      cidr: '203.0.113.50/32',
      description: '2026-11-21 출고 시도에서 허용',
    })
    expect(ip.manager.value.extraTarget?.items[0]).toEqual({ value: '8', title: '작업대 2' })
    const saving = ip.save()
    await flushPromises()
    expect(ip.manager.value.confirmDialog.message).toContain('출고 토큰 · 작업대 2')
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(
      {
        scopeType: 'shippingToken',
        scopeRefNo: 8n,
        cidr: '203.0.113.50/32',
        description: '2026-11-21 출고 시도에서 허용',
      },
      {},
    )
  })

  it('🔴 미리 채운 값은 고친 값이다 — 닫을 때 버릴지 묻는다', async () => {
    const { ip } = await setup()
    await ip.openCreate(PREFILL)
    const closing = ip.closeEditor()
    await flushPromises()
    expect(ip.manager.value.discardDialog.modelValue).toBe(true)
    ip.manager.value.discardDialog.onConfirm()
    expect(await closing).toBe(true)
  })

  it('🔴 버리기 확인 뒤 권한을 다시 본다 — 회수됐으면 편집기는 그대로', async () => {
    let allowed = true
    const { ip } = await setup({ canManage: () => allowed })
    await ip.openCreate(PREFILL)
    const reopening = ip.openCreate({ ...PREFILL, scopeRefNo: 7n, cidr: '203.0.113.60/32' })
    await flushPromises()
    expect(ip.manager.value.discardDialog.modelValue).toBe(true)
    allowed = false
    ip.manager.value.discardDialog.onConfirm()
    expect(await reopening).toBe(false)
    expect(ip.editing.value).toBe('new')
    expect(ip.form.value).toMatchObject({ scopeRefNo: '8', cidr: '203.0.113.50/32' })
  })

  it('범위 전체로 연다', async () => {
    const { ip } = await setup()
    expect(
      await ip.openCreate({ scopeType: 'shippingToken', scopeRefNo: null, cidr: '10.0.0.0/8' }),
    ).toBe(true)
    expect(ip.form.value).toMatchObject({
      scopeType: 'shippingToken:*',
      scopeRefNo: '',
      cidr: '10.0.0.0/8',
    })
  })

  it('코어 사용자로도 연다(한 범위 모드가 아니면)', async () => {
    const { ip } = await setup()
    expect(
      await ip.openCreate({ scopeType: 'user', scopeRefNo: 3n, scopeName: '김운영 (ops01)' }),
    ).toBe(true)
    expect(ip.form.value).toMatchObject({ scopeType: 'user', scopeRefNo: '3' })
  })

  it('🔴 열지 않는다 — 권한 없음 · 모르는 범위 · wholeLabel 없는 범위 전체 · focus 밖 · 코어 global 에 대상', async () => {
    expect(await (await setup({ canManage: () => false })).ip.openCreate(PREFILL)).toBe(false)
    const { ip } = await setup({ extraScopes: [shipping({ wholeLabel: undefined })] })
    expect(await ip.openCreate({ scopeType: 'goneScope', scopeRefNo: 1n })).toBe(false)
    expect(await ip.openCreate({ scopeType: 'shippingToken', scopeRefNo: null })).toBe(false)
    expect(await ip.openCreate({ scopeType: 'global', scopeRefNo: 1n })).toBe(false)
    expect(ip.editing.value).toBeNull()
    const focused = await setup({ focus: FOCUS_7 })
    expect(await focused.ip.openCreate(PREFILL)).toBe(false)
    expect(await focused.ip.openCreate({ scopeType: 'user', scopeRefNo: 3n })).toBe(false)
    expect(await focused.ip.openCreate({ ...PREFILL, scopeRefNo: 7n })).toBe(true)
  })
})
