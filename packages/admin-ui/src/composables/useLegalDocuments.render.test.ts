// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { EditorView } from 'codemirror'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import type { AdminLegalDocument, AdminLegalHistoryItem } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import LegalDocumentEditor from '../components/legal/LegalDocumentEditor.vue'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import {
  useLegalDocuments,
  type LegalDocumentsController,
  type UseLegalDocumentsOptions,
} from './useLegalDocuments.js'

// 흐름과 실제 화면(LegalDocumentEditor · MarkdownEditor · ConfirmDialog)을 붙여 사람이 하는 순서대로 돌린다 — 편집기에
// 입력하고, 버튼을 누르고, 대화상자 버튼을 누른다. 세부 판정은 useLegalDocuments.test.ts · legal-document-editor.render.test.ts.

installVisualViewport()

const KINDS = [
  { value: 'TERMS', label: '이용약관' },
  { value: 'PRIVACY', label: '개인정보처리방침' },
] as const
type Kind = (typeof KINDS)[number]['value']

const HASH = '0123456789abcdef'.repeat(4)

function doc(legalDocNo: number, kind: Kind, body: string): AdminLegalDocument {
  return {
    legalDocNo: BigInt(legalDocNo),
    kind,
    body,
    contentHash: HASH,
    publishedAt: '2026-09-01T05:00:00.000Z',
    publishedByUserNo: 7n,
    publishedByUserName: '김관리',
  }
}

function item(d: AdminLegalDocument): AdminLegalHistoryItem {
  return {
    legalDocNo: d.legalDocNo,
    kind: d.kind,
    contentHash: d.contentHash,
    publishedAt: d.publishedAt,
    publishedByUserNo: d.publishedByUserNo,
    publishedByUserName: d.publishedByUserName,
  }
}

const TERMS_12 = doc(12, 'TERMS', '# 이용약관 v12\n')
const TERMS_13 = doc(13, 'TERMS', '# 이용약관 v13(다른 관리자)\n')
const PRIVACY_5 = doc(5, 'PRIVACY', '# 개인정보처리방침 v5\n')

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(options: Partial<UseLegalDocumentsOptions<Kind>> = {}) {
  const adapters = {
    loadCurrent: vi.fn(async (kind: Kind) => (kind === 'TERMS' ? TERMS_12 : PRIVACY_5)),
    loadHistory: vi.fn(async (kind: Kind) =>
      kind === 'TERMS' ? [item(TERMS_12)] : [item(PRIVACY_5)],
    ),
    loadOne: vi.fn(async () => TERMS_12),
    publish: vi.fn(async () => ({ legalDocNo: 13n, contentHash: HASH })),
    onDone: vi.fn(),
    ...options,
  }
  let legal!: LegalDocumentsController<Kind>
  wrapper = mount(
    defineComponent({
      setup() {
        legal = useLegalDocuments<Kind>({ kinds: KINDS, ...adapters })
        return () => h(LegalDocumentEditor as Component, legal.editor.value)
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return { legal, ...adapters }
}

const activeDialog = () =>
  document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body

async function clickInDialog(text: string) {
  const target = buttonByText(text, activeDialog())
  expect(target, `가드 — 대화상자에 "${text}" 버튼이 있다`).toBeTruthy()
  target!.click()
  await flushPromises()
}

function editorView(label: string): EditorView {
  const content = document.querySelector<HTMLElement>(`.cm-content[aria-label="${label}"]`)
  expect(content, `가드 — "${label}" 편집 영역이 있다`).toBeTruthy()
  return EditorView.findFromDOM(content!)!
}

/** 사람이 친 것처럼 문서 끝에 붙인다 */
async function type(label: string, text: string) {
  const view = editorView(label)
  view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: 'input.type' })
  await flushPromises()
}

const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
const tab = (label: string) => tabs().find((t) => t.textContent?.trim() === label)
const selectedTab = () =>
  tabs()
    .find((t) => t.classList.contains('v-tab--selected'))
    ?.textContent?.trim()

describe('useLegalDocuments + LegalDocumentEditor', () => {
  it('입력 → [새 버전 발행] → 확인 "발행" → 요청 · 재조회 · onDone, 다시 "변경 없음"', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(doc(13, 'TERMS', '# 이용약관 v12\n제2조'))
    const { publish, onDone } = await setup({ loadCurrent })

    await type('이용약관 본문', '제2조')
    buttonByText('새 버전 발행')!.click()
    await flushPromises()
    expect(activeDialog().textContent).toContain('이용약관 새 버전 발행')
    expect(activeDialog().textContent).toContain('이 작업은 되돌릴 수 없습니다.')
    expect(publish).not.toHaveBeenCalled()

    await clickInDialog('발행')
    expect(publish).toHaveBeenCalledWith({
      kind: 'TERMS',
      body: '# 이용약관 v12\n제2조',
      baseLegalDocNo: 12n,
    })
    expect(loadCurrent).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({
      action: 'published',
      kind: 'TERMS',
      message: '이용약관 새 버전을 발행했습니다.',
    })
    expect(buttonByText('새 버전 발행')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('시행 중인 판과 내용이 같습니다.')
  })

  it('🔴 입력 뒤 다른 탭 → 버리기 확인 — 취소면 탭 · 본문 그대로, "버리고 이동" 이면 새 종류', async () => {
    await setup()
    await type('이용약관 본문', '내 편집')

    tab('개인정보처리방침')!.click()
    await flushPromises()
    expect(activeDialog().textContent).toContain('편집 중인 내용 버리기')
    await clickInDialog('취소')
    expect(selectedTab()).toBe('이용약관')
    expect(editorView('이용약관 본문').state.doc.toString()).toBe('# 이용약관 v12\n내 편집')

    tab('개인정보처리방침')!.click()
    await flushPromises()
    await clickInDialog('버리고 이동')
    expect(selectedTab()).toBe('개인정보처리방침')
    expect(editorView('개인정보처리방침 본문').state.doc.toString()).toBe('# 개인정보처리방침 v5\n')
  })

  it('🔴 revision 충돌 — 안내가 뜨고 편집기 본문은 그대로, 다시 발행할 수 있다', async () => {
    const conflict = new ApiError('다른 관리자가 먼저 발행했습니다.', {
      status: 409,
      code: 'ERR_COMMON_REVISION_CONFLICT',
      raw: null,
    })
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValue(TERMS_13)
    await setup({ loadCurrent, publish: vi.fn(async () => Promise.reject(conflict)) })

    await type('이용약관 본문', '내 편집')
    buttonByText('새 버전 발행')!.click()
    await flushPromises()
    await clickInDialog('발행')

    expect(conflict.handled).toBe(true)
    expect(document.body.textContent).toContain('다른 관리자가')
    expect(editorView('이용약관 본문').state.doc.toString()).toBe('# 이용약관 v12\n내 편집')
    expect(buttonByText('새 버전 발행')!.disabled).toBe(false)
  })
})
