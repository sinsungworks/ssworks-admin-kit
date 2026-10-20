// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import { VAutocomplete, VSelect } from 'vuetify/components'
import type { AdminIpPreview, AdminIpPreviewQuery, AdminIpRule } from '@ssworks/admin-shared'
import {
  useIpAccessRules,
  type IpAccessManagerBindings,
  type UseIpAccessRulesOptions,
} from '../../composables/useIpAccessRules.js'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import IpAccessManager from './IpAccessManager.vue'
import { DEFAULT_IP_ACCESS_MESSAGES as M, emptyIpRuleForm, scopeTypeItems } from './ip-access.js'

// 정본: hangang-home ip-access.render.test.ts(편집 패널이 대화상자가 아님 · 전체면 대상 칸 없음 · 저장 흐름)를
//       킷 화면 한 벌에 대고 잰다.

installVisualViewport()

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

const RULES = [rule()]

const result = (): AdminIpPreview => ({
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

const closedDialog = {
  modelValue: false,
  'onUpdate:modelValue': vi.fn(),
  title: 't',
  message: 'm',
  reversible: true,
  submitting: false,
  onConfirm: vi.fn(),
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function bindings(
  over: Partial<IpAccessManagerBindings<AdminIpRule>> = {},
): IpAccessManagerBindings<AdminIpRule> {
  return {
    rules: RULES,
    loading: false,
    loadFailed: false,
    onRetry: vi.fn(),
    canManage: true,
    editing: null,
    form: emptyIpRuleForm(),
    'onUpdate:form': vi.fn(),
    fieldErrors: {},
    onCidrBlur: vi.fn(),
    scopeItems: scopeTypeItems(M),
    teamMode: 'select',
    teamItems: [{ value: '4', title: '본사 › 상담센터' }],
    teamsLoading: false,
    teamsFailed: false,
    teamHint: null,
    userMode: 'search',
    userItems: [],
    usersSearching: false,
    usersFailed: false,
    userHint: null,
    onSearchUsers: vi.fn(),
    onOpenCreate: vi.fn(),
    onOpenEdit: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    onRemove: vi.fn(),
    submitting: false,
    busy: false,
    preview: { state: 'ready', op: null, result: result(), clientIp: '203.0.113.7' },
    lockedItems: [],
    changedItems: [],
    isSelf: () => false,
    globalAllowRemoval: false,
    alerts: [],
    onDismissAlert: vi.fn(),
    confirmDialog: { ...closedDialog },
    reauthDialog: {
      modelValue: false,
      'onUpdate:modelValue': vi.fn(),
      message: '',
      submitting: false,
      error: '',
      onConfirm: vi.fn(),
    },
    discardDialog: { ...closedDialog },
    messages: M,
    ...over,
  }
}

async function mountManager(b: IpAccessManagerBindings<AdminIpRule>) {
  wrapper = mount(IpAccessManager as Component, {
    props: { ...b },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return b
}

const text = () => document.body.textContent ?? ''
const input = (name: string) => wrapper!.find(`input[name="${name}"]`)

describe('IpAccessManager — 배치', () => {
  it('알림 → 카드 → 목록, 편집이 닫혀 있으면 패널이 없다', async () => {
    await mountManager(bindings())
    expect(text()).toContain(M.cardTitle)
    expect(text()).toContain(M.listTitle)
    expect(document.querySelector('.ip-rule-editor')).toBeNull()
  })

  it('알림 둘 — 닫으면 그 번호를 올린다', async () => {
    const b = await mountManager(
      bindings({
        alerts: [
          { kind: 'error', text: '409 문구' },
          { kind: 'warning', text: '충돌 문구' },
        ],
      }),
    )
    expect(text()).toContain('409 문구')
    expect(text()).toContain('충돌 문구')
    const closes = [...document.querySelectorAll('.v-alert button')] as HTMLButtonElement[]
    closes[1]!.click()
    expect(b.onDismissAlert).toHaveBeenCalledWith(1)
  })
})

describe('IpAccessManager — 편집 패널', () => {
  it('🔴 전체 범위면 대상 칸이 없다 · 패널은 대화상자가 아니다', async () => {
    await mountManager(bindings({ editing: 'new' }))
    expect(document.querySelector('.ip-rule-editor')).not.toBeNull()
    expect(document.querySelector('.v-dialog .ip-rule-editor')).toBeNull()
    expect(text()).toContain(M.editorCreateTitle)
    expect(input('scopeRefNo').exists()).toBe(false)
    expect(input('cidr').exists()).toBe(true)
  })

  it('칸 입력은 update:form · CIDR 칸을 떠나면 cidrBlur · 저장 · 취소', async () => {
    const b = await mountManager(bindings({ editing: 'new' }))
    await input('cidr').setValue('10.0.0.0/8')
    expect(b['onUpdate:form']).toHaveBeenLastCalledWith({
      ...emptyIpRuleForm(),
      cidr: '10.0.0.0/8',
    })
    await input('cidr').trigger('blur')
    expect(b.onCidrBlur).toHaveBeenCalled()
    buttonByText(M.save)!.click()
    expect(b.onSave).toHaveBeenCalled()
    buttonByText(M.cancel)!.click()
    expect(b.onCancel).toHaveBeenCalled()
  })

  it('범위 select 는 가까운 층부터', async () => {
    await mountManager(bindings({ editing: 'new' }))
    const scope = wrapper!
      .findAllComponents(VSelect)
      .find((c) => c.props('label') === M.scopeLabel)!
    expect((scope.props('items') as { value: string }[]).map((i) => i.value)).toEqual([
      'user',
      'team',
      'global',
    ])
  })

  it('칸 오류 · 저장 중 표시', async () => {
    await mountManager(
      bindings({
        editing: 'new',
        fieldErrors: { cidr: [M.cidrInvalid] },
        submitting: true,
        busy: true,
      }),
    )
    expect(text()).toContain(M.cidrInvalid)
    expect(buttonByText(M.save)!.disabled).toBe(true)
    expect(buttonByText(M.cancel)!.disabled).toBe(true)
  })

  it('수정 — 제목에 지금 규칙', async () => {
    await mountManager(
      bindings({
        editing: RULES[0],
        form: { scopeType: 'team', scopeRefNo: '4', cidr: '203.0.113.0/24', description: '' },
      }),
    )
    expect(text()).toContain(M.editorEditTitle)
    expect(text()).toContain('팀 · 상담센터 · 203.0.113.0/24')
  })

  it('대상 칸 — 팀 select · 사용자 검색 · 번호 칸과 이유', async () => {
    const team = { scopeType: 'team' as const, scopeRefNo: '4', cidr: '', description: '' }
    await mountManager(bindings({ editing: 'new', form: team }))
    const select = wrapper!
      .findAllComponents(VSelect)
      .find((c) => c.props('label') === M.teamLabel)!
    expect(select.props('modelValue')).toBe('4')
    wrapper!.unmount()
    document.body.innerHTML = ''

    const b = await mountManager(
      bindings({ editing: 'new', form: { ...team, scopeType: 'user', scopeRefNo: '' } }),
    )
    const search = wrapper!
      .findAllComponents(VAutocomplete)
      .find((c) => c.props('label') === M.userLabel)!
    search.vm.$emit('update:search', '김')
    expect(b.onSearchUsers).toHaveBeenCalledWith('김')
    wrapper!.unmount()
    document.body.innerHTML = ''

    await mountManager(
      bindings({
        editing: 'new',
        form: team,
        teamMode: 'number',
        teamHint: M.teamNoPermissionHint,
      }),
    )
    expect(input('scopeRefNo').exists()).toBe(true)
    expect(text()).toContain(M.teamNumberLabel)
    expect(text()).toContain(M.teamNoPermissionHint)
  })

  it('팀 후보 실패 문구', async () => {
    await mountManager(
      bindings({
        editing: 'new',
        form: { scopeType: 'team', scopeRefNo: '', cidr: '', description: '' },
        teamsFailed: true,
      }),
    )
    expect(text()).toContain(M.teamsFailed)
  })
})

describe('흐름 + 화면 — useIpAccessRules 와 함께', () => {
  async function mountFlow(reauth: boolean, extra: Partial<UseIpAccessRulesOptions> = {}) {
    const adapters = {
      list: vi.fn(async (): Promise<readonly AdminIpRule[]> => RULES),
      preview: vi.fn(async (_query: AdminIpPreviewQuery) => result()),
      create: vi.fn(async (): Promise<unknown> => ({})),
      update: vi.fn(async (): Promise<unknown> => ({})),
      remove: vi.fn(async (): Promise<unknown> => ({})),
    }
    wrapper = mount(
      defineComponent({
        setup() {
          const ip = useIpAccessRules({ ...adapters, canManage: () => true, reauth, ...extra })
          return () => h(IpAccessManager as Component, { ...ip.manager.value })
        },
      }),
      { attachTo: document.body, global: { plugins: [vuetify] } },
    )
    await flushPromises()
    return adapters
  }

  it('새 규칙 → CIDR → 저장 → 재인증 창 → 만들기', async () => {
    const adapters = await mountFlow(true)
    buttonByText(M.createButton)!.click()
    await flushPromises()
    await input('cidr').setValue('203.0.113.0/24')
    buttonByText(M.save)!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('전체 범위의 「203.0.113.0/24」 규칙을 만듭니다.')
    // reauth-dialog.render.test.ts 의 type() 과 같다 — `.value` 대입만으로는 v-model 이 안 먹는다
    const password = document.querySelector<HTMLInputElement>('input[name="currentPassword"]')!
    password.value = 'pw'
    password.dispatchEvent(new Event('input'))
    await flushPromises()
    // 관문 버튼 글자는 흐름이 넘긴 confirmLabel — 재인증 창 기본 「확인」이 아니다
    const confirm = [...document.querySelectorAll('.v-dialog button')].find(
      (b) => b.textContent?.trim() === M.createConfirm,
    ) as HTMLButtonElement
    confirm.click()
    await flushPromises()
    expect(adapters.create).toHaveBeenCalledWith(
      { scopeType: 'global', scopeRefNo: null, cidr: '203.0.113.0/24', description: null },
      { currentPassword: 'pw' },
    )
    expect(document.querySelector('.ip-rule-editor')).toBeNull()
  })

  it('삭제 → 확인 창(되돌릴 수 없음) → 지우기', async () => {
    const adapters = await mountFlow(false)
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="팀 · 상담센터 203.0.113.0/24 규칙 삭제"]',
      )!
      .click()
    await flushPromises()
    expect(document.body.textContent).toContain('이 작업은 되돌릴 수 없습니다.')
    const confirm = [...document.querySelectorAll('.v-dialog button')].find(
      (b) => b.textContent?.trim() === M.removeConfirm,
    ) as HTMLButtonElement
    confirm.click()
    await flushPromises()
    expect(adapters.remove).toHaveBeenCalledWith(RULES[0], { revision: 3 }, {})
  })

  it('🔴 고친 값이 있는 채 삭제 — 버리기 창이 먼저, 버리면 삭제 창 하나만(스펙 §8 위험 ④)', async () => {
    const adapters = await mountFlow(false)
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="팀 · 상담센터 203.0.113.0/24 규칙 수정"]',
      )!
      .click()
    await flushPromises()
    await input('description').setValue('바꾼 설명')
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="팀 · 상담센터 203.0.113.0/24 규칙 삭제"]',
      )!
      .click()
    await flushPromises()
    const activeDialogs = () => [...document.querySelectorAll('.v-dialog.v-overlay--active')]
    expect(activeDialogs()).toHaveLength(1)
    expect(activeDialogs()[0]!.textContent).toContain(M.discardMessage)
    const discard = [...document.querySelectorAll('.v-dialog.v-overlay--active button')].find(
      (b) => b.textContent?.trim() === M.discardConfirm,
    ) as HTMLButtonElement
    discard.click()
    await flushPromises()
    expect(activeDialogs()).toHaveLength(1)
    expect(activeDialogs()[0]!.textContent).toContain(
      '팀 · 상담센터 범위의 「203.0.113.0/24」 규칙을 지웁니다.',
    )
    expect(adapters.remove).not.toHaveBeenCalled()
    expect(document.querySelector('.ip-rule-editor')).toBeNull()
  })

  it('🔴 scopes: [user, global] — 층 select 에 팀이 없다(3i S1)', async () => {
    await mountFlow(false, { scopes: ['user', 'global'] })
    buttonByText(M.createButton)!.click()
    await flushPromises()
    const scope = wrapper!
      .findAllComponents(VSelect)
      .find((c) => c.props('label') === M.scopeLabel)!
    expect((scope.props('items') as { value: string }[]).map((i) => i.value)).toEqual([
      'user',
      'global',
    ])
  })
})
