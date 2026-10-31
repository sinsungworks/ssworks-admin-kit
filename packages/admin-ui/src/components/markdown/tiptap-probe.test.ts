// @vitest-environment happy-dom
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { Editor } from '@tiptap/vue-3'
import { describe, expect, it } from 'vitest'

// 임시 탐침(Task 1) — happy-dom 에서 TipTap 이 마운트 · 파싱 · 직렬화 · 포커스 · blur 되는지. Task 3 의 하니스가 대신하면 지운다.
describe('tiptap probe', () => {
  it('mounts, parses markdown, serializes, focuses, blurs', () => {
    const host = document.createElement('div')
    document.body.append(host)
    let blurred = 0
    const editor = new Editor({
      element: host,
      extensions: [Markdown, StarterKit.configure({ trailingNode: false })],
      content: '# 제1조\n\n본문',
      contentType: 'markdown',
      injectCSS: false,
      onBlur: () => {
        blurred += 1
      },
    })
    expect(host.querySelector('.ProseMirror')).toBeTruthy()
    expect(editor.getMarkdown()).toBe('# 제1조\n\n본문')
    editor.commands.focus('end')
    editor.commands.insertContent('x')
    expect(editor.getMarkdown()).toBe('# 제1조\n\n본문x')
    editor.view.dom.dispatchEvent(new FocusEvent('blur'))
    expect(blurred).toBe(1)
    editor.chain().focus().toggleBold().run()
    editor.destroy()
  })
})
