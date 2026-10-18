// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import type { AdminIpPreview, AdminIpPreviewItem, AdminIpRule } from '@ssworks/admin-shared'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import IpPreviewCard from './IpPreviewCard.vue'
import IpRuleTable from './IpRuleTable.vue'
import { DEFAULT_IP_ACCESS_MESSAGES as M, type IpPreviewView } from './ip-access.js'

// 정본: hangang-home ip-access.render.test.ts §7-1 ①②③(현재 IP 상시 · 통과 여부 · 잠기는 사람) · 목록 셀 · 대상 없음.

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

const RULES = [
  rule({
    ruleNo: 1n,
    scopeType: 'global',
    scopeRefNo: null,
    scopeName: null,
    cidr: '0.0.0.0/0',
    description: '기본 허용(IPv4)',
  }),
  rule(),
  rule({ ruleNo: 9n, scopeRefNo: 9n, scopeName: null, cidr: '192.0.2.0/24', description: null }),
  rule({
    ruleNo: 20n,
    scopeType: 'user',
    scopeRefNo: 3n,
    scopeName: '김운영',
    scopeUserId: 'ops01',
    cidr: '203.0.113.7/32',
  }),
]

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
  activeSessionCount: 2,
  blockedSessionCount: 2,
  unknownIpSessionCount: 0,
  ...over,
})

const result = (over: Partial<AdminIpPreview> = {}): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 14,
    newlyLocked: 1,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 2,
    ruleSetChangedOnly: 1,
  },
  items: [],
  ...over,
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

const text = () => document.body.textContent ?? ''

function mountCard(over: Record<string, unknown> = {}) {
  const view: IpPreviewView = {
    state: 'ready',
    op: 'update',
    result: result(),
    clientIp: '203.0.113.7',
  }
  wrapper = mount(IpPreviewCard as Component, {
    props: {
      preview: view,
      lockedItems: [previewItem()],
      changedItems: [
        previewItem({
          userNo: 8n,
          userId: 'cs03',
          userName: '정재택',
          becomesLocked: false,
          statusAfter: 'unknown',
        }),
      ],
      isSelf: (item: AdminIpPreviewItem) => item.userId === 'cs07',
      globalAllowRemoval: false,
      messages: M,
      ...over,
    },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
}

describe('IpPreviewCard', () => {
  it('🔴 ① 현재 IP · ② 통과 · 기준 · ③ 요약 · 두 목록 · 본인 · 상시 문단', () => {
    mountCard()
    for (const part of [
      M.cardTitle,
      '현재 접속 IP: 203.0.113.7',
      '이 변경 뒤에도 지금 접속(203.0.113.7)은 통과합니다.',
      M.basisUpdate,
      '🔴 이 변경으로 1명이 새로 잠깁니다.',
      '🔴 이상담(cs07 · 본인) — 전체 층 → 팀 층',
      '정재택(cs03) — 전체 층 → 팀 층 · 적용되는 규칙이 달라집니다',
      M.hintLayerShadow,
      M.hintServerDefence,
      M.hintSessionsStay,
      M.hintRecovery,
    ]) {
      expect(text()).toContain(part)
    }
    expect(text()).not.toContain(M.globalAllowRemoval)
  })

  it('🔴 미리보기가 없으면 통과 여부를 말하지 않고, 현재 IP 는 모른다고 적는다', () => {
    mountCard({
      preview: { state: 'failed', op: 'create', result: null, clientIp: null },
      lockedItems: [],
      changedItems: [],
    })
    expect(text()).toContain(M.currentIpUnknown)
    expect(text()).not.toContain('통과합니다')
    expect(text()).toContain(M.previewFailed)
    expect(text()).toContain(M.basisCreate)
  })

  it('전체 허용 제거 경고', () => {
    mountCard({ globalAllowRemoval: true })
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(M.globalAllowRemoval)
  })
})

function mountTable(over: Record<string, unknown> = {}) {
  const listeners = { onCreate: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onRetry: vi.fn() }
  wrapper = mount(IpRuleTable as Component, {
    props: {
      rules: RULES,
      loading: false,
      loadFailed: false,
      canManage: true,
      editing: null,
      busy: false,
      messages: M,
      ...listeners,
      ...over,
    },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  return listeners
}

const rows = () => [...document.querySelectorAll('.ip-rule-table tbody tr')] as HTMLElement[]

describe('IpRuleTable', () => {
  it('범위 셀 — 전체 · 팀 이름 + 번호 · 🔴 대상 없음 · 사용자 이름(아이디)', () => {
    mountTable()
    expect(rows()[0]!.textContent).toContain('전체')
    expect(rows()[1]!.textContent).toContain('팀 · 상담센터')
    expect(rows()[1]!.textContent).toContain('#4')
    expect(rows()[2]!.textContent).toContain('팀 #9')
    expect(rows()[2]!.textContent).toContain(M.deadTarget)
    expect(rows()[2]!.textContent).toContain('—')
    expect(rows()[3]!.textContent).toContain('사용자 · 김운영 (ops01)')
  })

  it('머리 — 제목 · 정렬 고정 · 쪽 넘김 없음', () => {
    mountTable()
    expect(text()).toContain(M.listTitle)
    expect(text()).toContain(M.sortLabel)
    expect(document.querySelector('.v-data-table-footer')).toBeNull()
  })

  it('작업 — 규칙을 가리키는 접근 이름 · 이벤트 · 편집 중 표시', async () => {
    const listeners = mountTable({ editing: RULES[1] })
    const edit = document.querySelector<HTMLButtonElement>(
      'button[aria-label="팀 · 상담센터 203.0.113.0/24 규칙 수정"]',
    )
    expect(edit?.textContent?.trim()).toBe(M.edit)
    edit!.click()
    expect(listeners.onEdit).toHaveBeenCalledWith(RULES[1])
    document
      .querySelector<HTMLButtonElement>('button[aria-label="전체 0.0.0.0/0 규칙 삭제"]')!
      .click()
    expect(listeners.onRemove).toHaveBeenCalledWith(RULES[0])
    expect(rows()[1]!.textContent).toContain(M.editing)
    expect(rows()[0]!.textContent).not.toContain(M.editing)
    buttonByText(M.createButton)!.click()
    expect(listeners.onCreate).toHaveBeenCalled()
    await flushPromises()
  })

  it('🔴 관리 권한이 없으면 작업 열과 [새 규칙]이 없다', () => {
    mountTable({ canManage: false })
    expect(buttonByText(M.createButton)).toBeUndefined()
    expect(buttonByText(M.edit)).toBeUndefined()
    expect(buttonByText(M.remove)).toBeUndefined()
  })

  it('쓰기 중이면 버튼이 꺼진다', () => {
    mountTable({ busy: true })
    expect(buttonByText(M.createButton)!.disabled).toBe(true)
    expect(buttonByText(M.edit)!.disabled).toBe(true)
  })

  it('빈 목록 — 모든 접속이 거부된다는 안내 · [새 규칙]', () => {
    const listeners = mountTable({ rules: [] })
    expect(text()).toContain(M.emptyTitle)
    const buttons = [...document.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === M.createButton,
    )
    buttons[buttons.length - 1]!.click()
    expect(listeners.onCreate).toHaveBeenCalled()
  })

  it('조회 실패 — 알림과 [다시 시도], 빈 상태 문구는 없다', () => {
    const listeners = mountTable({ rules: [], loadFailed: true })
    expect(text()).toContain(M.loadFailed)
    expect(text()).not.toContain(M.emptyTitle)
    buttonByText(M.retry)!.click()
    expect(listeners.onRetry).toHaveBeenCalled()
  })
})
