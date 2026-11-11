// @vitest-environment happy-dom
import { undoDepth } from '@tiptap/pm/history'
import { Slice } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/vue-3'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminUploadCreated } from '@ssworks/admin-shared'
import { useImageAttachments } from '../../composables/useImageAttachments.js'
import {
  dragEvent,
  imageFile,
  pasteEvent,
  stubObjectUrls,
  transferOf,
} from '../../test/image-transfer.js'
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
    for (const modelValue of ['위\n\n---', '위\n\n![](https://cdn.example.com/a.png)']) {
      const w = mountEditor({ modelValue })
      expect(editorOf(w).getMarkdown()).toBe(modelValue)
      await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS + 50)
      expect(w.emitted('update:modelValue'), modelValue).toBeUndefined()
      w.unmount()
      wrapper = null
      document.body.innerHTML = ''
    }
  })

  it('🔴 버스트의 첫 변경은 즉시 emit — 부모의 더티 판정이 바로 선다. 포커스를 잃어도 같은 값은 다시 내지 않는다', () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, ' 총칙')
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조 총칙']])
    blur(editor)
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조 총칙']])
  })

  it('이어지는 변경은 디바운스 — 멈춘 뒤 emit 한 번(실제 타이머)', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
    type(editor, '나')
    type(editor, '다')
    await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS / 2)
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가']])
    await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS)
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가'], ['# 제1조가나다']])
  })

  it('expose 한 flush() 로 대기 중 emit 을 바로 보낸다(라우트 가드 · 단축키 저장 전)', () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
    type(editor, '나')
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가']])
    ;(w.vm as unknown as { flush: () => void }).flush()
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가'], ['# 제1조가나']])
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

  it('🔴 즉시 emit 한 값의 echo 가 디바운스 중에 돌아와도 치환하지 않는다(W4 — lastEmitted)', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
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
    type(editor, '나')
    await w.setProps({ modelValue: '# 새 문서' })
    await wait(MARKDOWN_EDITOR_EMIT_DELAY_MS + 50)
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가']])
    expect(editor.getMarkdown()).toBe('# 새 문서')
  })

  it('언마운트하면 대기 중 emit 을 먼저 flush 하고 편집기를 파괴한다', () => {
    // 언마운트 중의 emit 은 wrapper.emitted() 에 남지 않을 수 있다 — 리스너로 직접 받는다
    const seen: string[] = []
    const w = mountEditor({ 'onUpdate:modelValue': (value: string) => seen.push(value) })
    const editor = editorOf(w)
    type(editor, '가')
    type(editor, '나')
    expect(seen).toEqual(['# 제1조가'])
    w.unmount()
    wrapper = null
    expect(seen).toEqual(['# 제1조가', '# 제1조가나'])
    expect(editor.isDestroyed).toBe(true)
  })

  it('pagehide 가 오면 대기 중 emit 을 보낸다 — 새로 고침 · 탭 닫기 전에 부모가 최신 값을 갖는다', () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
    type(editor, '나')
    window.dispatchEvent(new Event('pagehide'))
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가'], ['# 제1조가나']])
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
    type(editorOf(w), '나')
    await w.setProps({ readonly: true })
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가'], ['# 제1조가나']])
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

  it('선택한 글자에 굵게 → 직렬화에 **…**, 단추가 눌린 상태가 된다(토글형은 aria-pressed true/false)', async () => {
    const w = mountEditor({ modelValue: '본문' })
    const editor = editorOf(w)
    editor.commands.setTextSelection({ from: 1, to: 3 })
    await flushPromises()
    expect(toolButton('굵게')!.getAttribute('aria-pressed')).toBe('false')
    expect(toolButton('구분선')!.hasAttribute('aria-pressed')).toBe(false)
    toolButton('굵게')!.click()
    await flushPromises()
    expect(editor.isActive('bold')).toBe(true)
    expect(toolButton('굵게')!.getAttribute('aria-pressed')).toBe('true')
    blur(editor)
    expect(w.emitted('update:modelValue')).toEqual([['**본문**']])
  })

  it('그림을 고른(NodeSelection) 상태에서는 링크 단추가 꺼진다', async () => {
    const w = mountEditor({ modelValue: '![](https://cdn.example.com/a.png)' })
    const editor = editorOf(w)
    editor.commands.setNodeSelection(0)
    await flushPromises()
    expect(editor.state.selection.empty).toBe(false)
    expect(toolButton('링크')!.disabled).toBe(true)
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

  it('기본은 서식이고 원문 textarea 는 숨어 있다 · defaultMode 로 바꾼다 · 토글은 group 에 aria-pressed', () => {
    mountEditor()
    expect(sourceArea()!.style.display).toBe('none')
    expect(content()!.closest<HTMLElement>('.markdown-editor__wysiwyg')!.style.display).toBe('')
    const group = document.querySelector('[role="group"][aria-label="편집 방식"]')
    expect(group).toBeTruthy()
    expect(modeButton('서식').getAttribute('aria-pressed')).toBe('true')
    expect(modeButton('원문').getAttribute('aria-pressed')).toBe('false')
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

  it('원문에서 고쳤다가 같은 값으로 되돌리면 서식 문서 · 되돌리기 기록을 지키고 emit 도 없다', async () => {
    const w = mountEditor()
    const editor = editorOf(w)
    type(editor, '가')
    expect(undoDepth(editor.state)).toBeGreaterThan(0)
    const before = editor.state.doc
    modeButton('원문').click()
    await flushPromises()
    sourceArea()!.value = '# 다른 값'
    sourceArea()!.dispatchEvent(new Event('input'))
    sourceArea()!.value = '# 제1조가'
    sourceArea()!.dispatchEvent(new Event('input'))
    modeButton('서식').click()
    await flushPromises()
    expect(editor.state.doc).toBe(before)
    expect(undoDepth(editor.state)).toBeGreaterThan(0)
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조가'], ['# 다른 값'], ['# 제1조가']])
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

describe('MarkdownEditor — 그림 첨부(이미지 업로드 C3 · C4 · C5 · C12 · C13)', () => {
  // 레지스트리는 실물(useImageAttachments)이다 — blob: 주소만 대역(stubObjectUrls). 편집기 테스트는 올리지 않는다.
  beforeEach(() => {
    stubObjectUrls()
  })

  function registry(onRejected = vi.fn()) {
    return useImageAttachments({
      upload: async (): Promise<AdminUploadCreated> => {
        throw new Error('편집기 테스트는 올리지 않는다')
      },
      onRejected,
    })
  }

  const imageButton = () => toolButton('이미지 넣기')
  const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')
  const modeButton = (name: string) =>
    buttonByText(name, document.querySelector('[role="toolbar"]')!)!

  /** 숨은 파일 입력으로 고른 것처럼 */
  function choose(files: readonly File[]): void {
    const input = fileInput()!
    input.files = transferOf(files).files
    input.dispatchEvent(new Event('change'))
  }

  it('attachments 가 없으면 그림 단추 · 파일 입력이 없고, 파일 붙여넣기는 막지 않는다', () => {
    const w = mountEditor({ modelValue: '본문' })
    expect(imageButton()).toBeNull()
    expect(fileInput()).toBeNull()
    const paste = pasteEvent([imageFile('a.png')])
    content()!.dispatchEvent(paste)
    expect(paste.defaultPrevented).toBe(false)
    expect(editorOf(w).getMarkdown()).toBe('본문')
  })

  it('그림 단추 — 숨은 파일 입력(서버가 받는 형식 넷 · 여러 장)을 연다 · 문구는 messages.image', async () => {
    mountEditor({ attachments: registry() })
    expect(imageButton()).toBeTruthy()
    const input = fileInput()!
    expect(input.hidden).toBe(true)
    expect(input.multiple).toBe(true)
    expect(input.accept).toBe('image/jpeg,image/png,image/webp,image/gif')
    const click = vi.spyOn(input, 'click')
    imageButton()!.click()
    expect(click).toHaveBeenCalledTimes(1)
    wrapper!.unmount()
    wrapper = null
    document.body.innerHTML = ''
    mountEditor({ attachments: registry(), messages: { image: 'Image' } })
    expect(toolButton('Image')).toBeTruthy()
  })

  it('고른 파일 → 캐럿 자리에 그림 노드(고른 순서) · 즉시 update:modelValue · 입력을 비운다', () => {
    const w = mountEditor({ attachments: registry() })
    const editor = editorOf(w)
    editor.commands.setTextSelection(endOf(editor))
    choose([imageFile('a.png'), imageFile('b.gif', 4, 'image/gif')])
    editor.state.doc.check()
    const value = '# 제1조\n\n![](blob:test/u001)\n\n![](blob:test/u002)\n\n'
    expect(editor.getMarkdown()).toBe(value)
    expect(w.emitted('update:modelValue')).toEqual([[value]])
    expect(fileInput()!.files).toHaveLength(0)
  })

  it('파일만 붙여넣으면 그림 노드 + doc.check() · 기본 동작을 막는다 — 글자가 함께 오면 기본 붙여넣기', () => {
    const attachments = registry()
    const w = mountEditor({ modelValue: '본문', attachments })
    const editor = editorOf(w)
    editor.commands.setTextSelection(endOf(editor))
    const paste = pasteEvent([imageFile('a.png')])
    content()!.dispatchEvent(paste)
    expect(paste.defaultPrevented).toBe(true)
    editor.state.doc.check()
    expect(editor.getMarkdown()).toBe('본문\n\n![](blob:test/u001)\n\n')

    const add = vi.spyOn(attachments, 'add')
    editor.commands.setTextSelection(3)
    content()!.dispatchEvent(pasteEvent([imageFile('b.png')], '글자'))
    expect(add).not.toHaveBeenCalled()
    expect(editor.getMarkdown()).toBe('본문글자\n\n![](blob:test/u001)\n\n')
  })

  it('거른 파일은 넣지 않는다 — 알림은 레지스트리 onRejected 몫(편집기는 토스트를 띄우지 않는다)', () => {
    const onRejected = vi.fn()
    const w = mountEditor({ modelValue: '본문', attachments: registry(onRejected) })
    const editor = editorOf(w)
    editor.commands.setTextSelection(endOf(editor))
    content()!.dispatchEvent(
      pasteEvent([imageFile('a.svg', 4, 'image/svg+xml'), imageFile('b.png')]),
    )
    expect(editor.getMarkdown()).toBe('본문\n\n![](blob:test/u001)\n\n')
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ reason: 'type', count: 1 }))
    expect(document.querySelector('.v-snackbar')).toBeNull()
  })

  it('끌어 놓기 — 놓은 자리(posAtCoords)에 넣고 기본 동작을 막는다 · 편집기 안에서 끄는 것은 ProseMirror 몫', () => {
    const attachments = registry()
    const w = mountEditor({ modelValue: '앞뒤', attachments })
    const editor = editorOf(w)
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 2, inside: -1 })
    const drop = dragEvent('drop', [imageFile('a.png')])
    content()!.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    editor.state.doc.check()
    expect(editor.getMarkdown()).toBe('앞\n\n![](blob:test/u001)\n\n뒤')

    const add = vi.spyOn(attachments, 'add')
    editor.view.dragging = { slice: Slice.empty, move: true }
    content()!.dispatchEvent(dragEvent('drop', [imageFile('b.png')]))
    expect(add).not.toHaveBeenCalled()
  })

  it('readonly 면 셋 다 꺼진다 — readonly 를 풀면 다시 받는다', async () => {
    const attachments = registry()
    const add = vi.spyOn(attachments, 'add')
    const w = mountEditor({ modelValue: '본문', attachments, readonly: true })
    expect(imageButton()!.disabled).toBe(true)
    content()!.dispatchEvent(pasteEvent([imageFile('a.png')]))
    content()!.dispatchEvent(dragEvent('drop', [imageFile('b.png')]))
    modeButton('원문').click()
    await flushPromises()
    sourceArea()!.dispatchEvent(pasteEvent([imageFile('c.png')]))
    expect(add).not.toHaveBeenCalled()
    modeButton('서식').click()
    await w.setProps({ readonly: false })
    expect(imageButton()!.disabled).toBe(false)
    content()!.dispatchEvent(pasteEvent([imageFile('d.png')]))
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('원문 — 붙여넣기 · 끌어 놓기 · 그림 단추는 캐럿 자리에 `![](blob:…)` 줄 · 즉시 emit · 서식으로 돌아오면 그림 노드', async () => {
    const w = mountEditor({ modelValue: '앞뒤', attachments: registry() })
    modeButton('원문').click()
    await flushPromises()
    const area = sourceArea()!
    area.setSelectionRange(1, 1)
    const paste = pasteEvent([imageFile('a.png')])
    area.dispatchEvent(paste)
    expect(paste.defaultPrevented).toBe(true)
    const once = '앞\n\n![](blob:test/u001)\n\n뒤'
    expect(area.value).toBe(once)
    expect(area.selectionEnd).toBe('앞\n\n![](blob:test/u001)'.length)
    expect(w.emitted('update:modelValue')).toEqual([[once]])

    const over = dragEvent('dragover', [imageFile('b.png')])
    area.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    const drop = dragEvent('drop', [imageFile('b.png')])
    area.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    choose([imageFile('c.png')])
    const thrice = '앞\n\n![](blob:test/u001)\n\n![](blob:test/u002)\n\n![](blob:test/u003)\n\n뒤'
    expect(area.value).toBe(thrice)
    expect(w.emitted('update:modelValue')).toHaveLength(3)

    modeButton('서식').click()
    await flushPromises()
    expect(content()!.querySelectorAll('img')).toHaveLength(3)
    expect(editorOf(w).getMarkdown()).toBe(thrice)
  })

  it('🔴 C12 — 디바운스 중에 그림을 넣으면 대기 중인 update:modelValue 가 add 보다 먼저 나간다', () => {
    const log: string[] = []
    const attachments = registry()
    const add = attachments.add
    vi.spyOn(attachments, 'add').mockImplementation((files, body) => {
      log.push(`add:${body}`)
      return add(files, body)
    })
    const w = mountEditor({
      attachments,
      'onUpdate:modelValue': (value: string) => log.push(`emit:${value}`),
    })
    const editor = editorOf(w)
    type(editor, '가')
    type(editor, '나')
    content()!.dispatchEvent(pasteEvent([imageFile('a.png')]))
    expect(log).toEqual([
      'emit:# 제1조가',
      'emit:# 제1조가나',
      'add:# 제1조가나',
      'emit:# 제1조가나\n\n![](blob:test/u001)\n\n',
    ])
  })

  it('C13 — 레지스트리 하나를 편집기 둘이 나눠 쓴다: 각자 넣은 그림이 하나의 count 에 잡히고, 하나가 사라져도 등록은 남는다', () => {
    const attachments = registry()
    const values = ['첫째', '둘째']
    const mountOne = (index: number, label: string) =>
      mount(MarkdownEditor, {
        props: {
          modelValue: values[index]!,
          label,
          attachments,
          'onUpdate:modelValue': (value: string) => {
            values[index] = value
          },
        },
        attachTo: document.body,
        global: { plugins: [vuetify] },
      })
    const first = mountOne(0, '첫째 본문')
    const second = mountOne(1, '둘째 본문')
    try {
      content('첫째 본문')!.dispatchEvent(pasteEvent([imageFile('a.png')]))
      content('둘째 본문')!.dispatchEvent(pasteEvent([imageFile('b.png')]))
      expect(values.every((value) => value.includes('blob:test/'))).toBe(true)
      expect(attachments.count(values)).toBe(2)
      second.unmount()
      expect(attachments.count(values)).toBe(2)
    } finally {
      first.unmount()
    }
  })
})
