// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { EditorView } from 'codemirror'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, type Component } from 'vue'
import type { AdminLegalDocument, AdminLegalHistoryItem } from '@ssworks/admin-shared'
import type { ConfirmDialogBindings } from '../../composables/useWriteFlow.js'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import { formatDateTime } from '../../utils/format-date-time.js'
import LegalDocumentEditor from './LegalDocumentEditor.vue'

// 바인딩을 손으로 넘겨 화면만 잰다. 흐름과 함께 도는 시나리오는 composables/useLegalDocuments.render.test.ts(Task 7).

installVisualViewport()

const KINDS = [
  { value: 'TERMS', label: '이용약관' },
  { value: 'PRIVACY', label: '개인정보처리방침' },
] as const

const HASH = 'a1b2c3d4' + 'e'.repeat(56)
const AT = '2026-09-01T05:00:00.000Z'

const CURRENT: AdminLegalDocument = {
  legalDocNo: 12n,
  kind: 'TERMS',
  body: '# 제1조\n',
  contentHash: HASH,
  publishedAt: AT,
  publishedByUserNo: 7n,
  publishedByUserName: '김관리',
}

const row = (
  legalDocNo: number,
  name: string | null,
  userNo: bigint | null,
): AdminLegalHistoryItem => ({
  legalDocNo: BigInt(legalDocNo),
  kind: 'TERMS',
  contentHash: HASH,
  publishedAt: AT,
  publishedByUserNo: userNo,
  publishedByUserName: name,
})

const ROWS = [row(12, '김관리', 7n), row(11, null, 7n), row(10, null, null)]

/** 날짜 표기를 고정해 시간대와 무관하게 잰다 */
const F = (iso: string) => `F(${iso})`

function closedDialog(): ConfirmDialogBindings {
  return {
    modelValue: false,
    'onUpdate:modelValue': vi.fn(),
    title: '',
    message: '',
    reversible: false,
    submitting: false,
    onConfirm: vi.fn(),
  }
}

function bindings(overrides: Record<string, unknown> = {}) {
  return {
    kinds: KINDS,
    kind: 'TERMS',
    current: CURRENT,
    loading: false,
    loadFailed: false,
    modelValue: '# 제1조\n',
    readonly: false,
    canPublish: true,
    publishBlock: null,
    submitting: false,
    conflict: false,
    history: ROWS,
    historyLoading: false,
    historyFailed: false,
    publishDialog: closedDialog(),
    discardDialog: closedDialog(),
    detailDialog: {
      modelValue: false,
      row: null,
      document: null,
      loading: false,
      failed: false,
      'onUpdate:modelValue': vi.fn(),
      onRetry: vi.fn(),
    },
    formatDate: F,
    ...overrides,
  }
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function mountEditor(overrides: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  wrapper = mount(LegalDocumentEditor as Component, {
    props: bindings(overrides),
    slots,
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  return wrapper
}

const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
const tab = (label: string) => tabs().find((t) => t.textContent?.trim() === label)
const selectedTab = () =>
  tabs()
    .find((t) => t.classList.contains('v-tab--selected'))
    ?.textContent?.trim()
const activeDialog = () =>
  document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body
const headTitles = () =>
  [...document.querySelectorAll('.legal-document-editor__history thead th')].map(
    (th) => th.textContent?.trim() ?? '',
  )
const tableRows = () => [...document.querySelectorAll('.legal-document-editor__history tbody tr')]
const cells = (tr: Element) =>
  [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim() ?? '')
const content = (label: string) =>
  document.querySelector<HTMLElement>(`.cm-content[aria-label="${label}"]`)

describe('LegalDocumentEditor — 탭', () => {
  it('종류 라벨을 탭으로 그리고 kind 가 선택이다', () => {
    mountEditor()
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['이용약관', '개인정보처리방침'])
    expect(selectedTab()).toBe('이용약관')
    expect(document.querySelector('[aria-label="문서 종류"]')).toBeTruthy()
  })

  it('🔴 다른 탭을 누르면 selectKind 를 쏘고, 부모가 kind 를 바꾸기 전엔 선택이 그대로다(D7)', async () => {
    const w = mountEditor()
    tab('개인정보처리방침')!.click()
    await flushPromises()
    expect(w.emitted('selectKind')).toEqual([['PRIVACY']])
    expect(selectedTab()).toBe('이용약관')
    await w.setProps({ kind: 'PRIVACY' })
    expect(selectedTab()).toBe('개인정보처리방침')
  })

  it('발행 중이면 탭이 꺼진다', () => {
    mountEditor({ submitting: true })
    expect(tabs().every((t) => t.disabled)).toBe(true)
  })
})

describe('LegalDocumentEditor — 시행 정보', () => {
  it('시행 중 칩과 발행일 · 발행자 · 해시 8자', () => {
    const w = mountEditor()
    const line = w.find('.legal-document-editor__current')
    expect(line.text()).toContain('시행 중')
    expect(line.text()).toContain(`F(${AT}) 발행 · 김관리 · 해시 a1b2c3d4`)
  })

  it('미발행이면 종류 이름을 넣어 안내한다', () => {
    const w = mountEditor({ current: null })
    expect(w.text()).toContain('아직 발행된 이용약관 문서가 없습니다. 본문을 작성해 발행하세요.')
  })

  it('불러오는 중이면 진행 막대를 보이고 시행 정보는 없다', () => {
    const w = mountEditor({ loading: true })
    expect(w.find('.v-progress-linear').exists()).toBe(true)
    expect(w.find('.legal-document-editor__current').exists()).toBe(false)
  })

  it('🔴 실패면 안내 + [다시 시도], 시행 정보 · 이력의 시행 중 칩을 숨긴다(D19)', () => {
    const w = mountEditor({ loadFailed: true })
    expect(w.text()).toContain(
      '현재본을 불러오지 못했습니다. 다시 불러오기 전까지 발행할 수 없습니다.',
    )
    expect(w.find('.legal-document-editor__current').exists()).toBe(false)
    expect(w.text()).not.toContain('시행 중')
    buttonByText('다시 시도', w.element)!.click()
    expect(w.emitted('reloadCurrent')).toHaveLength(1)
  })
})

describe('LegalDocumentEditor — 충돌', () => {
  it('새 판의 발행일을 넣어 안내하고, 닫으면 dismissConflict', async () => {
    const w = mountEditor({ conflict: true })
    expect(w.text()).toContain(
      `다른 관리자가 F(${AT})에 새 버전을 발행했습니다. 이력에서 새 판을 확인한 뒤 다시 발행하세요. 다시 발행하면 그 판을 대체합니다.`,
    )
    await w.find('.v-alert__close button').trigger('click')
    expect(w.emitted('dismissConflict')).toHaveLength(1)
  })

  it('현재본을 모르면(실패) 날짜 없이 안내한다', () => {
    const w = mountEditor({ conflict: true, loadFailed: true })
    expect(w.text()).toContain('다른 관리자가 새 버전을 발행했습니다.')
  })

  it('충돌 뒤 재조회 중에는 내 기준 날짜를 새 판처럼 보이지 않는다', () => {
    const w = mountEditor({ conflict: true, loading: true })
    const alert = w.find('.v-alert').text()
    expect(alert).toContain('다른 관리자가 새 버전을 발행했습니다.')
    expect(alert).not.toContain(`F(${AT})`)
  })
})

describe('LegalDocumentEditor — 편집기 · 미리보기', () => {
  it('편집기 이름은 「종류 본문」이고 readonly 를 넘긴다', () => {
    mountEditor({ readonly: true })
    expect(content('이용약관 본문')?.getAttribute('aria-readonly')).toBe('true')
  })

  it('입력하면 update:modelValue', () => {
    const w = mountEditor()
    const view = EditorView.findFromDOM(content('이용약관 본문')!)!
    view.dispatch({
      changes: { from: view.state.doc.length, insert: '본문' },
      userEvent: 'input.type',
    })
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조\n본문']])
  })

  it('미리보기가 초안을 그리고, 비면 안내한다', async () => {
    const w = mountEditor()
    const preview = () => document.querySelector('[aria-label="미리보기"]')!
    expect(preview().querySelector('h1')?.textContent).toBe('제1조')
    await w.setProps({ modelValue: '' })
    expect(preview().textContent).toContain('미리 볼 내용이 없습니다.')
  })

  it('편집기 아래에 작성 도움말(줄바꿈 · 문단 · 인용 끝내기)이 보이고, messages 로 바꿀 수 있다', async () => {
    const w = mountEditor()
    expect(w.find('.legal-document-editor__guide').text()).toBe(
      'Enter 한 번은 줄바꿈, 빈 줄은 문단 나눔입니다. 인용(>)과 목록은 빈 줄을 넣어야 끝납니다.',
    )
    await w.setProps({ messages: { editorHint: '사내 작성 규칙을 따르세요.' } })
    expect(w.find('.legal-document-editor__guide').text()).toBe('사내 작성 규칙을 따르세요.')
  })

  it('미리보기의 링크는 새 탭으로 연다(D18)', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    mountEditor({ modelValue: '[도움말](https://example.com/help)' })
    const anchor = document.querySelector('[aria-label="미리보기"] a')!
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).toHaveBeenCalledWith('https://example.com/help', '_blank', 'noopener,noreferrer')
  })
})

describe('LegalDocumentEditor — 발행', () => {
  it('누르면 publish, 발행 중이면 loading', async () => {
    const w = mountEditor()
    buttonByText('새 버전 발행', w.element)!.click()
    expect(w.emitted('publish')).toHaveLength(1)
    await w.setProps({ submitting: true })
    expect(buttonByText('새 버전 발행', w.element)?.classList.contains('v-btn--loading')).toBe(true)
  })

  it('canPublish 가 아니면 꺼진다', () => {
    const w = mountEditor({ canPublish: false, publishBlock: 'unchanged' })
    expect(buttonByText('새 버전 발행', w.element)!.disabled).toBe(true)
  })

  it.each([
    ['readonly', '발행 권한이 없습니다.'],
    ['loadFailed', '현재본을 불러온 뒤 발행할 수 있습니다.'],
    ['empty', '본문을 입력하세요.'],
    ['tooLong', '본문은 1,000,000자를 넘을 수 없습니다.'],
    ['unchanged', '시행 중인 판과 내용이 같습니다.'],
  ] as const)('막힌 이유 %s → 「%s」', (block, message) => {
    const w = mountEditor({ canPublish: false, publishBlock: block })
    expect(w.find('.legal-document-editor__hint').text()).toBe(message)
  })

  it('불러오는 중(loading)은 글자 없이 진행 막대가 대신한다', () => {
    const w = mountEditor({ canPublish: false, publishBlock: 'loading', loading: true })
    expect(w.find('.legal-document-editor__hint').exists()).toBe(false)
  })
})

describe('LegalDocumentEditor — 이력', () => {
  it('열 머리 · 번호 · 발행일 · 발행자 대체 · 해시 8자 · 시행 중 칩', () => {
    mountEditor()
    expect(headTitles()).toEqual(['번호', '발행일', '발행자', '해시', ''])
    const [first, second, third] = tableRows().map(cells)
    expect(first![0]).toMatch(/^12\s*시행 중$/)
    expect(first!.slice(1)).toEqual([`F(${AT})`, '김관리', 'a1b2c3d4', '보기'])
    expect(second!.slice(0, 3)).toEqual(['11', `F(${AT})`, '#7'])
    expect(third![2]).toBe('-')
  })

  it('[보기] → openDetail(행) — 키보드로 닿는 버튼이다', () => {
    const w = mountEditor()
    document.querySelector<HTMLButtonElement>('button[aria-label="11번 판 원문 보기"]')!.click()
    expect(w.emitted('openDetail')).toEqual([[ROWS[1]]])
  })

  it('더한 열은 [보기] 앞에 붙고, 슬롯이 있으면 슬롯으로 그린다', () => {
    mountEditor(
      {
        history: ROWS.map((r, index) => ({ ...r, consentCount: index + 1 })),
        historyHeaders: [{ title: '동의', key: 'consentCount' }],
      },
      {
        'item.consentCount': ({ item }: { item: { consentCount: number } }) =>
          h('span', `${item.consentCount}건`),
      },
    )
    expect(headTitles()).toEqual(['번호', '발행일', '발행자', '해시', '동의', ''])
    expect(cells(tableRows()[0]!)[4]).toBe('1건')
  })

  it('슬롯이 없으면 더한 열은 원값', () => {
    mountEditor({
      history: ROWS.map((r) => ({ ...r, consentCount: 3 })),
      historyHeaders: [{ title: '동의', key: 'consentCount' }],
    })
    expect(cells(tableRows()[0]!)[4]).toBe('3')
  })

  it('이력 실패면 경고 + [다시 시도] → reloadHistory', () => {
    const w = mountEditor({ historyFailed: true })
    expect(w.text()).toContain(
      '발행 이력을 불러오지 못했습니다. 아래 목록이 최신이 아닐 수 있습니다.',
    )
    buttonByText('다시 시도', w.element)!.click()
    expect(w.emitted('reloadHistory')).toHaveLength(1)
  })

  it('빈 목록이면 안내한다', () => {
    const w = mountEditor({ history: [] })
    expect(w.text()).toContain('발행 이력이 없습니다.')
  })

  it('이력 실패면 빈 목록 안내를 겹쳐 내지 않는다', () => {
    const w = mountEditor({ history: [], historyFailed: true })
    expect(w.text()).not.toContain('발행 이력이 없습니다.')
  })
})

describe('LegalDocumentEditor — 대화상자', () => {
  function openDetail(overrides: Record<string, unknown>) {
    return mountEditor({
      detailDialog: {
        modelValue: true,
        row: ROWS[0],
        document: null,
        loading: false,
        failed: false,
        'onUpdate:modelValue': vi.fn(),
        onRetry: vi.fn(),
        ...overrides,
      },
    })
  }

  it('원문 — 머리 줄과 불러오는 중', async () => {
    openDetail({ loading: true })
    await flushPromises()
    const dialog = activeDialog()
    expect(dialog.textContent).toContain('판 원문')
    expect(dialog.textContent).toContain(`12번 · F(${AT}) · 김관리 · 해시 a1b2c3d4`)
    expect(dialog.querySelector('.v-progress-linear')).toBeTruthy()
  })

  it('원문 — 실패면 안내 + [다시 시도] → onRetry', async () => {
    const onRetry = vi.fn()
    openDetail({ failed: true, onRetry })
    await flushPromises()
    expect(activeDialog().textContent).toContain('원문을 불러오지 못했습니다.')
    buttonByText('다시 시도', activeDialog())!.click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('원문 — 본문을 그리고, [닫기] 는 onUpdate:modelValue(false)', async () => {
    const onClose = vi.fn()
    openDetail({ document: CURRENT, 'onUpdate:modelValue': onClose })
    await flushPromises()
    expect(activeDialog().querySelector('h1')?.textContent).toBe('제1조')
    buttonByText('닫기', activeDialog())!.click()
    await flushPromises()
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('확인 바인딩을 ConfirmDialog 에 그대로 넘긴다', async () => {
    const onConfirm = vi.fn()
    mountEditor({
      discardDialog: {
        ...closedDialog(),
        modelValue: true,
        title: '편집 중인 내용 버리기',
        message: '발행하지 않은 이용약관 편집 내용이 있습니다.',
        confirmLabel: '버리고 이동',
        onConfirm,
      },
    })
    await flushPromises()
    expect(activeDialog().textContent).toContain('편집 중인 내용 버리기')
    buttonByText('버리고 이동', activeDialog())!.click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('LegalDocumentEditor — 표기', () => {
  it('formatDate 를 주지 않으면 formatDateTime(현지 YYYY-MM-DD HH:mm)', () => {
    const w = mountEditor({ formatDate: undefined })
    expect(w.find('.legal-document-editor__current').text()).toContain(formatDateTime(AT))
  })
})
