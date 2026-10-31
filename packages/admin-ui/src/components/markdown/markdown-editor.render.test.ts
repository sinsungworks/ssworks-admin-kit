// @vitest-environment happy-dom
import { undoDepth } from '@tiptap/pm/history'
import type { Editor } from '@tiptap/vue-3'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import MarkdownEditor from './MarkdownEditor.vue'
import { MARKDOWN_EDITOR_EMIT_DELAY_MS } from './markdown-editor.js'

installVisualViewport()

// 편집기는 `defineExpose({ editor })` 로 얻는다(스펙 W14). 치기는 ProseMirror 트랜잭션(`insertContent`)이고, emit 은 디바운스라
// `blur` 이벤트로 flush 한다(W3) — 타이머 없이 결정적. 디바운스 자체는 실제 타이머 한 건으로만 본다.

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

function editorOf(w: VueWrapper): Editor {
  const editor = (w.vm as unknown as { editor: Editor | undefined }).editor
  expect(editor, '가드 — 마운트 뒤 editor 가 노출된다').toBeTruthy()
  return editor!
}

const content = (label = '본문') =>
  document.querySelector<HTMLElement>(`.ProseMirror[aria-label="${label}"]`)
const toolbar = (label = '본문') =>
  document.querySelector<HTMLElement>(`[role="toolbar"][aria-label="${label} 서식"]`)
const toolButton = (name: string) =>
  document.querySelector<HTMLButtonElement>(`[role="toolbar"] button[aria-label="${name}"]`)
const sourceArea = (label = '본문') =>
  document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)

/** 문서 끝 글자 자리 — 마지막 블록이 텍스트 블록일 때 */
const endOf = (editor: Editor) => editor.state.doc.content.size - 1

/** 사람이 친 것처럼 — 문서 끝에 글자(flush 는 하지 않는다) */
function type(editor: Editor, text: string): void {
  editor.chain().setTextSelection(endOf(editor)).insertContent(text).run()
}

/** 포커스를 잃는다 → 대기 중 emit 이 flush 된다 */
function blur(editor: Editor): void {
  editor.view.dom.dispatchEvent(new FocusEvent('blur'))
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('MarkdownEditor — 값 · emit', () => {
  it('초기 modelValue 가 문서가 되고 마운트 때 emit 하지 않는다', async () => {
    const w = mountEditor()
    expect(editorOf(w).getMarkdown()).toBe('# 제1조')
    await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS + 50)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('🔴 구분선 · 그림으로 끝나는 본문도 마운트 때 값이 바뀌지 않는다(trailingNode 없음 — W6)', async () => {
    const w = mountEditor({ modelValue: '위\n\n---' })
    expect(editorOf(w).getMarkdown()).toBe('위\n\n---')
    await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS + 50)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('치고 포커스를 잃으면 update:modelValue 한 번, 값은 Markdown 전체', () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, ' 총칙')
    expect(w.emitted('update:modelValue')).toBeUndefined()
    blur(editor)
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조 총칙']])
  })

  it('연달아 치면 디바운스 뒤 emit 한 번(실제 타이머)', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
    type(editor, '나')
    await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS / 2)
    expect(w.emitted('update:modelValue')).toBeUndefined()
    await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS)
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가나']])
  })

  it('🔴 prop 교체 → 문서가 바뀌고 emit 없음, 되돌리기 기록이 빈다(D4)', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, ' 수정')
    blur(editor)
    expect(undoDepth(editor.state), '가드 — 사용자 편집이 기록됐다').toBeGreaterThan(0)
    await w.setProps({ modelValue: '# 개인정보처리방침' })
    expect(editor.getMarkdown()).toBe('# 개인정보처리방침')
    expect(w.emitted('update:modelValue')).toHaveLength(1)
    expect(undoDepth(editor.state)).toBe(0)
    expect(editor.isActive('heading', { level: 1 })).toBe(true)
  })

  it('🔴 emit 한 값이 돌아오면 문서를 치환하지 않는다 — 한글 조합이 이어지는 조건(D3)', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
    blur(editor)
    const before = editor.state.doc
    await w.setProps({ modelValue: '# 제1조가' })
    expect(editor.state.doc).toBe(before)
  })

  it('🔴 디바운스 중에 더 친 뒤 앞 emit 값이 돌아와도 치환하지 않는다(W4 — lastEmitted)', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
    blur(editor)
    type(editor, '나')
    const before = editor.state.doc
    await w.setProps({ modelValue: '# 제1조가' })
    expect(editor.state.doc).toBe(before)
    await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS + 50)
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가'], ['# 제1조가나']])
  })

  it('외부 변경 중 대기 중이던 emit 은 버린다 — 외부 값이 이긴다', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
    await w.setProps({ modelValue: '# 새 문서' })
    await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS + 50)
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(editor.getMarkdown()).toBe('# 새 문서')
  })

  it('언마운트하면 대기 중 emit 을 먼저 flush 하고 편집기를 파괴한다', () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
    w.unmount()
    wrapper = null
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가']])
    expect(editor.isDestroyed).toBe(true)
  })
})

describe('MarkdownEditor — readonly · label · height', () => {
  it('readonly 를 켜고 끄면 isEditable · aria-readonly · 도구 단추 · 원문 textarea 가 따라간다', async () => {
    const w = mountEditor({ readonly: true })
    const editor = editorOf(w)
    expect(editor.isEditable).toBe(false)
    expect(content()!.getAttribute('aria-readonly')).toBe('true')
    expect(toolButton('굵게')!.disabled).toBe(true)
    expect(sourceArea()!.readOnly).toBe(true)
    await w.setProps({ readonly: false })
    expect(editor.isEditable).toBe(true)
    expect(content()!.hasAttribute('aria-readonly')).toBe(false)
    expect(sourceArea()!.readOnly).toBe(false)
  })

  it('readonly 가 켜질 때 대기 중 emit 을 flush 한다', async () => {
    const w = mountEditor()
    type(editorOf(w), '가')
    await w.setProps({ readonly: true })
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가']])
  })

  it('label 이 편집 영역 · 도구 막대 · 원문 textarea 의 접근 이름이 되고, 바꾸면 따라간다', async () => {
    const w = mountEditor({ label: '이용약관 본문' })
    expect(content('이용약관 본문')).toBeTruthy()
    expect(toolbar('이용약관 본문')).toBeTruthy()
    expect(sourceArea('이용약관 본문')).toBeTruthy()
    await w.setProps({ label: '개인정보처리방침 본문' })
    expect(content('개인정보처리방침 본문')).toBeTruthy()
    expect(content('이용약관 본문')).toBeNull()
    expect(toolbar('개인정보처리방침 본문')).toBeTruthy()
  })

  it('편집 영역은 textbox · multiline 이다', () => {
    mountEditor()
    expect(content()!.getAttribute('role')).toBe('textbox')
    expect(content()!.getAttribute('aria-multiline')).toBe('true')
  })

  it('height 가 바깥 틀 높이가 된다', () => {
    const w = mountEditor({ height: '300px' })
    expect((w.element as HTMLElement).style.height).toBe('300px')
    expect(w.classes()).toContain('markdown-editor')
  })
})

describe('MarkdownEditor — 도구 막대', () => {
  it('열두 단추가 기본 문구의 접근 이름을 갖고, messages 로 바뀐다', async () => {
    mountEditor()
    for (const name of [
      '굵게',
      '기울임',
      '취소선',
      '제목 2',
      '제목 3',
      '인용',
      '글머리 목록',
      '번호 목록',
      '링크',
      '구분선',
      '되돌리기',
      '다시 실행',
    ]) {
      expect(toolButton(name), name).toBeTruthy()
    }
    wrapper!.unmount()
    wrapper = null
    document.body.innerHTML = ''
    mountEditor({ messages: { bold: 'Bold', toolbar: (label: string) => `${label} tools` } })
    expect(toolButton('Bold')).toBeTruthy()
    expect(document.querySelector('[role="toolbar"][aria-label="본문 tools"]')).toBeTruthy()
  })

  it('선택한 글자에 굵게 → 직렬화에 **…**, 단추가 눌린 상태가 된다', async () => {
    const w = mountEditor({ modelValue: '본문' })
    const editor = editorOf(w)
    editor.commands.setTextSelection({ from: 1, to: 3 })
    await flushPromises()
    toolButton('굵게')!.click()
    await flushPromises()
    expect(editor.isActive('bold')).toBe(true)
    expect(toolButton('굵게')!.getAttribute('aria-pressed')).toBe('true')
    blur(editor)
    expect(w.emitted('update:modelValue')).toEqual([['**본문**']])
  })

  it('제목 2 · 글머리 목록 · 인용 · 구분선', async () => {
    const w = mountEditor({ modelValue: '본문' })
    const editor = editorOf(w)
    editor.commands.setTextSelection(2)
    // 단추의 잠김 상태는 렌더 뒤에 맞는다 — 클릭 사이마다 한 틱 기다린다(사람은 틱 사이에 못 누른다)
    const click = async (name: string) => {
      await flushPromises()
      toolButton(name)!.click()
    }
    await click('제목 2')
    expect(editor.getMarkdown()).toBe('## 본문')
    await click('제목 2')
    await click('글머리 목록')
    expect(editor.getMarkdown()).toBe('- 본문')
    await click('글머리 목록')
    await click('인용')
    expect(editor.getMarkdown()).toBe('> 본문')
    await click('인용')
    editor.commands.setTextSelection(endOf(editor))
    await click('구분선')
    // 문서 끝 구분선 뒤에 TipTap 이 빈 문단을 두어 캐럿을 둔다 — 문서 끝 빈 문단은 `""` + 구분자(A7 · K6, 렌더에는 없다)
    expect(editor.getMarkdown()).toBe('본문\n\n---\n\n')
  })

  it('되돌리기 · 다시 실행', async () => {
    const w = mountEditor({ modelValue: '본문' })
    const editor = editorOf(w)
    await flushPromises()
    expect(toolButton('되돌리기')!.disabled).toBe(true)
    type(editor, ' 더')
    await flushPromises()
    expect(toolButton('되돌리기')!.disabled).toBe(false)
    toolButton('되돌리기')!.click()
    expect(editor.getMarkdown()).toBe('본문')
    await flushPromises()
    toolButton('다시 실행')!.click()
    expect(editor.getMarkdown()).toBe('본문 더')
  })

  it('단추를 눌러도 브라우저 prompt · confirm · alert 가 불리지 않는다', async () => {
    // happy-dom 에는 prompt · confirm · alert 가 없다 — 있다면 불렸을 것을 가짜로 잰다
    const prompt = vi.fn(() => null)
    const confirm = vi.fn(() => false)
    const alert = vi.fn()
    vi.stubGlobal('prompt', prompt)
    vi.stubGlobal('confirm', confirm)
    vi.stubGlobal('alert', alert)
    try {
      const w = mountEditor({ modelValue: '본문' })
      editorOf(w).commands.setTextSelection({ from: 1, to: 3 })
      await flushPromises()
      for (const button of document.querySelectorAll<HTMLButtonElement>(
        '[role="toolbar"] button',
      )) {
        if (!button.disabled) button.click()
      }
      expect(prompt).not.toHaveBeenCalled()
      expect(confirm).not.toHaveBeenCalled()
      expect(alert).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('MarkdownEditor — 원문 전환', () => {
  const modeButton = (name: string) =>
    buttonByText(name, document.querySelector('[role="toolbar"]')!)!

  it('기본은 서식이고 원문 textarea 는 숨어 있다 · defaultMode 로 바꾼다', () => {
    mountEditor()
    expect(sourceArea()!.style.display).toBe('none')
    expect(content()!.closest<HTMLElement>('.markdown-editor__wysiwyg')!.style.display).toBe('')
    wrapper!.unmount()
    wrapper = null
    document.body.innerHTML = ''
    mountEditor({ defaultMode: 'source' })
    expect(sourceArea()!.style.display).toBe('')
    expect(sourceArea()!.value).toBe('# 제1조')
  })

  it('「원문」 → textarea 가 보이고 값은 modelValue, 서식 단추는 꺼진다', async () => {
    mountEditor()
    modeButton('원문').click()
    await flushPromises()
    expect(sourceArea()!.style.display).toBe('')
    expect(sourceArea()!.value).toBe('# 제1조')
    expect(toolButton('굵게')!.disabled).toBe(true)
  })

  it('원문으로 갈 때 대기 중 emit 을 flush 한다', async () => {
    const w = mountEditor()
    type(editorOf(w), '가')
    modeButton('원문').click()
    await flushPromises()
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가']])
  })

  it('원문에서 치면 즉시 emit 이고, 「서식」으로 돌아오면 문서가 새 값 · 되돌리기 기록 0', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    modeButton('원문').click()
    await flushPromises()
    sourceArea()!.value = '# 제2조\n\n본문'
    sourceArea()!.dispatchEvent(new Event('input'))
    expect(w.emitted('update:modelValue')).toEqual([['# 제2조\n\n본문']])
    await w.setProps({ modelValue: '# 제2조\n\n본문' })
    modeButton('서식').click()
    await flushPromises()
    expect(editor.getMarkdown()).toBe('# 제2조\n\n본문')
    expect(undoDepth(editor.state)).toBe(0)
    expect(w.emitted('update:modelValue')).toHaveLength(1)
  })

  it('원문 모드에서 온 외부 변경은 textarea 에 보이고, 서식으로 돌아오면 문서에 반영된다', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    modeButton('원문').click()
    await flushPromises()
    await w.setProps({ modelValue: '# 바깥' })
    expect(sourceArea()!.value).toBe('# 바깥')
    expect(editor.getMarkdown()).toBe('# 제1조')
    modeButton('서식').click()
    await flushPromises()
    expect(editor.getMarkdown()).toBe('# 바깥')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('건드리지 않고 원문 ↔ 서식을 오가면 emit 도 문서 치환도 없다', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    const before = editor.state.doc
    modeButton('원문').click()
    await flushPromises()
    modeButton('서식').click()
    await flushPromises()
    expect(editor.state.doc).toBe(before)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('readonly 에서도 원문을 볼 수 있다(textarea 는 readonly)', async () => {
    mountEditor({ readonly: true })
    modeButton('원문').click()
    await flushPromises()
    expect(sourceArea()!.style.display).toBe('')
    expect(sourceArea()!.readOnly).toBe(true)
  })
})

describe('MarkdownEditor — 링크', () => {
  const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active')
  const hrefInput = () => dialog()!.querySelector<HTMLInputElement>('input')!

  async function openLinkOn(editor: Editor, from: number, to: number) {
    editor.commands.setTextSelection({ from, to })
    await flushPromises()
    toolButton('링크')!.click()
    await flushPromises()
    expect(dialog(), '가드 — 링크 대화상자가 열렸다').toBeTruthy()
  }

  function typeHref(value: string): void {
    hrefInput().value = value
    hrefInput().dispatchEvent(new Event('input'))
  }

  it('선택이 없고 링크 위도 아니면 단추가 꺼진다', async () => {
    const w = mountEditor({ modelValue: '본문' })
    editorOf(w).commands.setTextSelection(2)
    await flushPromises()
    expect(toolButton('링크')!.disabled).toBe(true)
  })

  it('선택 → 주소 적용 → [글](https://…) · 스킴이 없으면 https:// 를 붙인다', async () => {
    const w = mountEditor({ modelValue: '본문' })
    const editor = editorOf(w)
    await openLinkOn(editor, 1, 3)
    expect(hrefInput().value).toBe('')
    typeHref('example.com/a b')
    buttonByText('적용', dialog()!)!.click()
    await flushPromises()
    expect(dialog()).toBeNull()
    blur(editor)
    expect(w.emitted('update:modelValue')).toEqual([['[본문](https://example.com/a%20b)']])
  })

  it('링크 위에서 열면 주소가 채워지고, 지우기로 링크가 사라진다', async () => {
    const w = mountEditor({ modelValue: '[본문](https://a.example)' })
    const editor = editorOf(w)
    await openLinkOn(editor, 2, 2)
    expect(hrefInput().value).toBe('https://a.example')
    buttonByText('링크 지우기', dialog()!)!.click()
    await flushPromises()
    blur(editor)
    expect(w.emitted('update:modelValue')).toEqual([['본문']])
  })

  it('빈 주소로 적용해도 링크를 지운다', async () => {
    const w = mountEditor({ modelValue: '[본문](https://a.example)' })
    const editor = editorOf(w)
    await openLinkOn(editor, 2, 2)
    typeHref('  ')
    buttonByText('적용', dialog()!)!.click()
    await flushPromises()
    blur(editor)
    expect(w.emitted('update:modelValue')).toEqual([['본문']])
  })

  it('javascript: 주소는 거부 — 닫히지 않고 「사용할 수 없는 주소입니다.」, 문서는 그대로', async () => {
    const w = mountEditor({ modelValue: '본문' })
    const editor = editorOf(w)
    await openLinkOn(editor, 1, 3)
    typeHref('javascript:alert(1)')
    buttonByText('적용', dialog()!)!.click()
    await flushPromises()
    expect(dialog()).toBeTruthy()
    expect(dialog()!.textContent).toContain('사용할 수 없는 주소입니다.')
    expect(editor.getMarkdown()).toBe('본문')
  })
})
