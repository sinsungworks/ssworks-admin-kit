// @vitest-environment happy-dom
import { undoDepth } from '@codemirror/commands'
import { mount, type VueWrapper } from '@vue/test-utils'
import { EditorView } from 'codemirror'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createAdminVuetify } from '../../vuetify/createAdminVuetify.js'
import MarkdownEditor from './MarkdownEditor.vue'

// 편집기를 찾고 움직이는 방법은 gise apps/admin/test/legal-page.test.ts:334-355 와 같다 — `EditorView.findFromDOM` 으로 실제
// 뷰를 얻어 `dispatch` 하면 운영 코드의 updateListener 를 그대로 지난다(happy-dom 실측 2026-09-23). 테마를 바꾸므로 공용
// `vuetify` 대신 이 파일 전용 인스턴스를 쓴다.

const vuetify = createAdminVuetify({ theme: { defaultTheme: 'light' } })

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function mountEditor(props: Record<string, unknown> = {}) {
  wrapper = mount(MarkdownEditor, {
    props: { modelValue: '# 제1조', ...props },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  return wrapper
}

const content = (label = '본문') =>
  document.querySelector<HTMLElement>(`.cm-content[aria-label="${label}"]`)

function editorView(label = '본문'): EditorView {
  const element = content(label)
  expect(element, `가드 — aria-label "${label}" 인 편집 영역이 있다`).toBeTruthy()
  const view = EditorView.findFromDOM(element!)
  expect(view, '가드 — EditorView 를 찾았다').toBeTruthy()
  return view!
}

/** 사용자가 친 것처럼 — 외부 표시 없는 트랜잭션 */
function type(view: EditorView, text: string): void {
  view.dispatch({
    changes: { from: view.state.doc.length, insert: text },
    userEvent: 'input.type',
  })
}

describe('MarkdownEditor', () => {
  it('초기 modelValue 가 문서가 된다', () => {
    mountEditor()
    expect(editorView().state.doc.toString()).toBe('# 제1조')
  })

  it('사용자 변경 → update:modelValue 한 번, 값은 문서 전체', () => {
    const w = mountEditor()
    type(editorView(), '\n본문')
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조\n본문']])
  })

  it('🔴 prop 교체 → 문서가 바뀌고 emit 없음, 되돌리기 기록이 빈다(D4)', async () => {
    const w = mountEditor()
    const view = editorView()
    type(view, ' 수정')
    expect(
      undoDepth(view.state),
      '가드 — 사용자 편집이 기록됐다(같은 @codemirror/commands 인스턴스)',
    ).toBeGreaterThan(0)
    await w.setProps({ modelValue: '# 개인정보처리방침' })
    expect(view.state.doc.toString()).toBe('# 개인정보처리방침')
    expect(w.emitted('update:modelValue')).toHaveLength(1)
    expect(undoDepth(view.state)).toBe(0)
  })

  it('🔴 같은 값이 돌아오면 문서를 치환하지 않는다 — 한글 조합이 이어지는 조건(D3)', async () => {
    const w = mountEditor()
    const view = editorView()
    type(view, '가')
    const before = view.state.doc
    await w.setProps({ modelValue: '# 제1조가' })
    expect(view.state.doc).toBe(before)
  })

  it('readonly 를 켜고 끄면 state.readOnly · aria-readonly 가 따라간다', async () => {
    const w = mountEditor({ readonly: true })
    const view = editorView()
    expect(view.state.readOnly).toBe(true)
    expect(content()!.getAttribute('aria-readonly')).toBe('true')
    await w.setProps({ readonly: false })
    expect(view.state.readOnly).toBe(false)
    expect(content()!.hasAttribute('aria-readonly')).toBe(false)
  })

  it('🔴 readonly 여도 편집 영역은 포커스를 받는다 — 선택 · 복사 · 찾기(D5)', () => {
    mountEditor({ readonly: true })
    expect(content()!.getAttribute('contenteditable')).toBe('true')
  })

  it('label 이 편집 영역의 aria-label 이 되고, 바꾸면 따라간다', async () => {
    const w = mountEditor({ label: '이용약관 본문' })
    expect(content('이용약관 본문')).toBeTruthy()
    await w.setProps({ label: '개인정보처리방침 본문' })
    expect(content('개인정보처리방침 본문')).toBeTruthy()
    expect(content('이용약관 본문')).toBeNull()
  })

  it('Vuetify 테마를 dark 로 바꾸면 darkTheme 판정이 따른다(D6)', async () => {
    mountEditor()
    const view = editorView()
    expect(view.state.facet(EditorView.darkTheme)).toBe(false)
    try {
      await vuetify.theme.change('dark')
      await nextTick()
      expect(view.state.facet(EditorView.darkTheme)).toBe(true)
    } finally {
      await vuetify.theme.change('light')
    }
  })

  it('긴 줄을 줄바꿈한다(cm-lineWrapping)', () => {
    mountEditor()
    expect(content()!.classList.contains('cm-lineWrapping')).toBe(true)
  })

  it('height 가 바깥 틀 높이가 된다', () => {
    const w = mountEditor({ height: '300px' })
    expect((w.element as HTMLElement).style.height).toBe('300px')
    expect(w.classes()).toContain('markdown-editor')
  })

  it('언마운트하면 뷰를 파괴한다', () => {
    const destroy = vi.spyOn(EditorView.prototype, 'destroy')
    const w = mountEditor()
    w.unmount()
    wrapper = null
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
