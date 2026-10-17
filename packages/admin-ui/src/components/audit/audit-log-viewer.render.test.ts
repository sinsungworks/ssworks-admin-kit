// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import { VAutocomplete } from 'vuetify/components'
import { coreAuditCatalog, type AdminAuditLog } from '@ssworks/admin-shared'
import { useAuditLogs, type AuditLogViewerBindings } from '../../composables/useAuditLogs.js'
import type { ServerTableParams } from '../../composables/useServerTable.js'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import AuditLogViewer from './AuditLogViewer.vue'
import {
  CORE_AUDIT_ACTION_GROUPS,
  DEFAULT_AUDIT_LOG_MESSAGES as M,
  buildActionOptions,
  emptyAuditLogDraft,
  targetOptions,
  type AuditLogFilter,
} from './audit-log.js'

// 정본: hangang-home apps/admin/src/pages/settings/audit-logs.render.test.ts(셀 글자 · 글자 펼침 버튼 · 한 행만 펼침 ·
//       가린 항목 · 빈 상태 두 갈래 · 읽기 전용)를 킷 화면에 대고 잰다.

installVisualViewport()

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
  userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  meta: {
    before: { roleName: '상담원', permissions: ['users.read'] },
    after: { roleName: '상담 매니저', permissions: ['users.read', 'sessions.read'] },
    clearedDefaults: ['상담원 기본'],
  },
  createAt: '2026-10-18T05:03:21.000Z',
  ...over,
})

const ROWS: AdminAuditLog[] = [
  log(),
  log({
    logNo: 2n,
    actorUserNo: null,
    actorUserId: null,
    actorUserName: null,
    sessionNo: null,
    action: 'auth.login.fail',
    targetType: null,
    targetRefNo: null,
    method: 'POST',
    path: '/admin/auth/login',
    statusCode: 401,
    errorCode: 'ERR_LOGIN_FAILED',
    ip: '198.51.100.24',
    userAgent: null,
    meta: null,
    createAt: '2026-10-18T04:58:02.000Z',
  }),
  log({
    logNo: 3n,
    actorUserNo: 41n,
    actorUserId: null,
    actorUserName: null,
    action: 'members.points.adjust',
    targetType: 'member',
    targetRefNo: 90211n,
    statusCode: 500,
    errorCode: 'ERR_COMMON_INTERNAL',
    ip: null,
    meta: { before: { apiSecret: '***', memo: 'a' }, after: { apiSecret: '***', memo: 'a' } },
    createAt: '2026-10-17T09:02:44.000Z',
  }),
]

/** 시간대와 무관하게 — 화면 시각 대신 ISO 를 그대로 잘라 쓴다 */
const utc = (iso: string) => iso.slice(0, 19).replace('T', ' ')

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function bindings(
  over: Partial<AuditLogViewerBindings<AdminAuditLog>> = {},
): AuditLogViewerBindings<AdminAuditLog> {
  return {
    draft: emptyAuditLogDraft(),
    'onUpdate:draft': vi.fn(),
    actorMode: 'number',
    actorHint: null,
    actorItems: [],
    actorSearching: false,
    actorSearchFailed: false,
    onSearchActors: vi.fn(),
    actionItems: buildActionOptions(coreAuditCatalog, CORE_AUDIT_ACTION_GROUPS, M),
    targetItems: targetOptions(coreAuditCatalog),
    filterError: null,
    onApply: vi.fn(),
    onReset: vi.fn(),
    rows: ROWS,
    itemsLength: 128,
    page: 1,
    itemsPerPage: 20,
    'onUpdate:page': vi.fn(),
    'onUpdate:itemsPerPage': vi.fn(),
    loading: false,
    loadFailed: false,
    onRetry: vi.fn(),
    filtered: false,
    expanded: [],
    'onUpdate:expanded': vi.fn(),
    onFilterByActor: vi.fn(),
    catalog: coreAuditCatalog,
    fieldLabels: {},
    messages: M,
    ...over,
  }
}

async function mountViewer(b: AuditLogViewerBindings<AdminAuditLog>) {
  wrapper = mount(AuditLogViewer as Component, {
    props: { ...b, formatDate: utc },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return b
}

const bodyRows = () => [...document.querySelectorAll('.audit-log-table tbody tr')] as HTMLElement[]
const text = () => document.body.textContent ?? ''

describe('AuditLogViewer — 셀', () => {
  it('시각 · 행위자 · 동작(라벨 + 코드) · 대상 · 결과 · IP', async () => {
    await mountViewer(bindings())
    const first = bodyRows()[0]!.textContent ?? ''
    for (const part of [
      '2026-10-18 05:03:21',
      '김운영 (ops01)',
      '역할 수정',
      'org.role.update',
      '역할 #3',
      '200 · 성공',
      '203.0.113.7',
    ]) {
      expect(first).toContain(part)
    }
  })

  it('실패 행 — 계정 없음 · 거부 칩 + errorCode · 대상 — · 이 사람 기록만 버튼 없음', async () => {
    await mountViewer(bindings())
    const second = bodyRows()[1]!
    expect(second.textContent).toContain('계정 없음')
    expect(second.textContent).toContain('401 · 거부')
    expect(second.textContent).toContain('ERR_LOGIN_FAILED')
    expect(buttonByText('이 사람 기록만', second)).toBeUndefined()
  })

  it('번호만 있는 행위자 · 🔴 모르는 동작은 코드 그대로 한 번 · 서버 오류 · IP 없음', async () => {
    await mountViewer(bindings())
    const third = bodyRows()[2]!.textContent ?? ''
    expect(third).toContain('#41 (계정 정보 없음)')
    expect(third).toContain('members.points.adjust')
    expect(third).not.toContain('members.points.adjust (members.points.adjust)')
    expect(third).toContain('member #90211')
    expect(third).toContain('500 · 서버 오류')
    expect(third).toContain('—')
  })

  it('이 사람 기록만 — 접근 이름이 사람을 가리키고, 행을 넘긴다', async () => {
    const b = await mountViewer(bindings())
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="김운영 (ops01) 기록만 보기"]',
    )
    expect(button?.textContent?.trim()).toBe('이 사람 기록만')
    button!.click()
    expect(b.onFilterByActor).toHaveBeenCalledWith(ROWS[0])
  })

  it('머리 줄 — 읽기 전용 안내 · 총 건수 · 정렬 고정', async () => {
    await mountViewer(bindings())
    expect(text()).toContain('읽기 전용 기록입니다. 삭제 · 수정할 수 없습니다.')
    expect(text()).toContain('총 128건')
    expect(text()).toContain('정렬: 최신순(고정)')
  })
})

describe('AuditLogViewer — 펼침', () => {
  it('🔴 "내역"을 누르면 그 행의 키(logNo 문자열)만 올린다', async () => {
    const b = await mountViewer(bindings())
    buttonByText('내역')!.click()
    await flushPromises()
    expect(b['onUpdate:expanded']).toHaveBeenCalledWith(['1'])
  })

  it('펼친 행 — 바뀐 항목(필드 라벨) · 기타 기록 · 요청 줄 · 세션 · User-Agent · 한 행만', async () => {
    await mountViewer(bindings({ expanded: ['1'], fieldLabels: { roleName: '역할 이름' } }))
    const detail = document.querySelectorAll('.audit-log-detail')
    expect(detail).toHaveLength(1)
    const t = detail[0]!.textContent ?? ''
    for (const part of [
      '바뀐 항목',
      '역할 이름',
      'roleName',
      '상담원',
      '상담 매니저',
      '["users.read","sessions.read"]',
      '기타 기록',
      'clearedDefaults',
      '요청',
      'PATCH /admin/roles/3',
      '세션 #4182',
      'User-Agent',
    ]) {
      expect(t).toContain(part)
    }
    expect(buttonByText('접기')).toBeDefined()
  })

  it('🔴 가린 항목은 이름만 — *** 를 그리지 않는다', async () => {
    await mountViewer(bindings({ expanded: ['3'] }))
    const t = document.querySelector('.audit-log-detail')?.textContent ?? ''
    expect(t).toContain('가려진 항목: apiSecret — 값은 표시하지 않습니다')
    expect(t).toContain('바뀐 항목 없음')
    expect(t).not.toContain('***')
  })

  it('기록이 없으면 그렇게 적는다 · User-Agent 가 없으면 그 줄이 없다', async () => {
    await mountViewer(bindings({ expanded: ['2'] }))
    const t = document.querySelector('.audit-log-detail')?.textContent ?? ''
    expect(t).toContain('기록된 변경 내역이 없습니다')
    expect(t).not.toContain('User-Agent')
  })
})

describe('AuditLogViewer — 빈 상태 · 실패', () => {
  it('🔴 아직 없음과 조건에 맞는 것 없음을 가른다', async () => {
    await mountViewer(bindings({ rows: [], itemsLength: 0 }))
    expect(text()).toContain('아직 기록이 없습니다')
    wrapper!.unmount()
    document.body.innerHTML = ''
    await mountViewer(bindings({ rows: [], itemsLength: 0, filtered: true }))
    expect(text()).toContain('조건에 맞는 기록이 없습니다')
    expect(text()).not.toContain('아직 기록이 없습니다')
  })

  it('조회 실패 — 알림과 [다시 시도], 빈 상태 문구는 없다', async () => {
    const b = await mountViewer(bindings({ rows: [], itemsLength: 0, loadFailed: true }))
    expect(text()).toContain('감사 로그를 불러오지 못했습니다.')
    expect(text()).not.toContain('아직 기록이 없습니다')
    buttonByText('다시 시도')!.click()
    expect(b.onRetry).toHaveBeenCalled()
  })
})

describe('AuditLogViewer — 필터', () => {
  const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)

  it('번호 모드 — 입력은 update:draft, 번호 칸 Enter 는 적용', async () => {
    const b = await mountViewer(bindings())
    const actor = wrapper!.find('input[name="actorUserNo"]')
    await actor.setValue('12')
    expect(b['onUpdate:draft']).toHaveBeenLastCalledWith({
      ...emptyAuditLogDraft(),
      actorUserNo: '12',
    })
    await wrapper!.find('input[name="targetRefNo"]').trigger('keyup', { key: 'Enter' })
    expect(b.onApply).toHaveBeenCalledTimes(1)
    expect(input('from')?.type).toBe('date')
    expect(input('to')?.type).toBe('date')
  })

  it('[적용] · [초기화]', async () => {
    const b = await mountViewer(bindings())
    buttonByText('적용')!.click()
    buttonByText('초기화')!.click()
    expect(b.onApply).toHaveBeenCalledTimes(1)
    expect(b.onReset).toHaveBeenCalledTimes(1)
  })

  it('경고 · 권한 안내 · 힌트', async () => {
    await mountViewer(
      bindings({ filterError: M.rangeReversed, actorHint: M.actorNoPermissionHint }),
    )
    expect(text()).toContain(M.rangeReversed)
    expect(text()).toContain(M.actorNoPermissionHint)
    expect(text()).toContain(M.periodHint)
    expect(text()).toContain(M.actionHint)
  })

  it('동작 칸 — 묶음이 먼저', async () => {
    await mountViewer(bindings())
    const action = wrapper!
      .findAllComponents(VAutocomplete)
      .find((c) => c.props('label') === '동작')!
    expect((action.props('items') as { title: string }[])[0]!.title).toBe('[묶음] 인증 (auth.*)')
  })

  it('검색 모드 — 검색어를 알리고, 🔴 고른 항목 글자로는 다시 알리지 않는다', async () => {
    const b = await mountViewer(
      bindings({
        actorMode: 'search',
        draft: { ...emptyAuditLogDraft(), actorUserNo: '12' },
        actorItems: [{ value: '12', title: '김운영 (ops01)' }],
      }),
    )
    const actor = wrapper!
      .findAllComponents(VAutocomplete)
      .find((c) => c.props('label') === '행위자')!
    expect(actor.props('modelValue')).toBe('12')
    actor.vm.$emit('update:search', '김')
    actor.vm.$emit('update:search', '김운영 (ops01)')
    expect(b.onSearchActors).toHaveBeenCalledTimes(1)
    expect(b.onSearchActors).toHaveBeenCalledWith('김')
    actor.vm.$emit('update:modelValue', null)
    expect(b['onUpdate:draft']).toHaveBeenLastCalledWith(emptyAuditLogDraft())
  })
})

describe('흐름 + 화면 — useAuditLogs 와 함께', () => {
  it('입력은 조회하지 않고, [적용] · 내역 · 이 사람 기록만이 끝까지 닿는다', async () => {
    const fetch = vi.fn(async (_params: ServerTableParams<AuditLogFilter>) => ({
      items: ROWS,
      total: ROWS.length,
    }))
    wrapper = mount(
      defineComponent({
        setup() {
          const audit = useAuditLogs({ fetch })
          return () => h(AuditLogViewer as Component, { ...audit.viewer.value, formatDate: utc })
        },
      }),
      { attachTo: document.body, global: { plugins: [vuetify] } },
    )
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)

    await wrapper.find('input[name="targetRefNo"]').setValue('3')
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    buttonByText('적용')!.click()
    await flushPromises()
    expect(fetch.mock.lastCall?.[0].filter).toEqual({ targetRefNo: 3n })

    buttonByText('내역')!.click()
    await flushPromises()
    expect(document.querySelector('.audit-log-detail')?.textContent).toContain('바뀐 항목')

    document
      .querySelector<HTMLButtonElement>('button[aria-label="김운영 (ops01) 기록만 보기"]')!
      .click()
    await flushPromises()
    expect(fetch.mock.lastCall?.[0].filter).toEqual({ actorUserNo: 12n, targetRefNo: 3n })
  })
})
