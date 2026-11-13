// @vitest-environment happy-dom
import { renderMarkdown } from '@ssworks/admin-shared'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMarkdownHarness,
  mountHost,
  sameStructure,
  type MarkdownHarness,
} from '../../test/markdown-harness.js'
import { imageFile, transferOf } from '../../test/image-transfer.js'
import {
  filesOf,
  hasFiles,
  insertImagesAt,
  pastedFiles,
  sourceWithImages,
} from './editor-images.js'

// 그림 넣기 도우미 — 마운트한 편집기(하니스)에서 잰다. 넣은 문서마다 doc.check() 와 렌더에 그림이 보이는지를 보고, 문서 끝 빈
// 문단이 없는 갈래(문단 가운데 · 첫머리)는 렌더 구조(둘째 오라클)까지 본다 — 문서 끝 빈 문단은 렌더하지 않는 알려진 차이(K6)다.

const A = 'blob:test/u001'
const B = 'blob:test/u002'

let h: MarkdownHarness

beforeEach(() => {
  h = createMarkdownHarness(mountHost())
})

afterEach(() => {
  h.destroy()
  document.body.innerHTML = ''
})

/** 본문을 넣고 at 에 그림들을 넣은 뒤 Markdown — doc.check() 와 렌더의 그림 순서를 함께 본다 */
function inserted(markdown: string, at: number | 'end', urls: readonly string[]): string {
  h.roundTrip(markdown)
  const editor = h.editor
  const pos = at === 'end' ? editor.state.doc.content.size - 1 : at
  editor.commands.setTextSelection(pos)
  insertImagesAt(editor, editor.state.selection.to, urls)
  editor.state.doc.check()
  const out = editor.getMarkdown()
  const rendered = [...renderMarkdown(out).matchAll(/<img src="([^"]*)"/g)].map((m) => m[1])
  expect(rendered, `렌더의 그림 — ${out}`).toEqual(urls)
  return out
}

/** 캐럿 — 글자 선택이고 그 텍스트 블록의 글자 · 블록 안 자리 */
function caret(): { text: string; offset: number } {
  const { selection } = h.editor.state
  expect(selection, '가드 — 캐럿은 글자 선택이다(그림이 선택돼 있지 않다)').toBeInstanceOf(
    TextSelection,
  )
  return { text: selection.$from.parent.textContent, offset: selection.$from.parentOffset }
}

describe('filesOf · pastedFiles', () => {
  it('파일은 형식과 상관없이 모두 — 없으면 빈 배열', () => {
    const files = [imageFile('a.png'), imageFile('b.pdf', 4, 'application/pdf')]
    expect(filesOf(transferOf(files)).map((f) => f.name)).toEqual(['a.png', 'b.pdf'])
    expect(filesOf(null)).toEqual([])
    expect(filesOf(transferOf([]))).toEqual([])
  })

  it('hasFiles — 파일이 실렸거나 types 에 Files 가 있으면(dragover 의 브라우저 모양)', () => {
    expect(hasFiles(transferOf([imageFile('a.png')]))).toBe(true)
    expect(hasFiles(transferOf([], '글자'))).toBe(false)
    expect(hasFiles({ types: ['Files'], files: [] } as unknown as DataTransfer)).toBe(true)
    expect(hasFiles(null)).toBe(false)
  })

  it('붙여넣기는 글자가 없을 때만 — 글자가 함께 오면(문서 복사) 빈 배열 = 기본 붙여넣기', () => {
    expect(pastedFiles(transferOf([imageFile('a.png')])).map((f) => f.name)).toEqual(['a.png'])
    expect(pastedFiles(transferOf([imageFile('a.png')], '표 글자'))).toEqual([])
    expect(pastedFiles(undefined)).toEqual([])
  })
})

describe('insertImagesAt(C4 — 입력 규칙과 같은 자리 · 캐럿 규칙)', () => {
  it('문단 끝 — 그림 뒤에 빈 문단을 만들어 캐럿을 둔다(문서 끝 빈 문단은 `""` + 구분자 — K6)', () => {
    expect(inserted('본문', 'end', [A])).toBe(`본문\n\n![](${A})\n\n`)
    expect(caret()).toEqual({ text: '', offset: 0 })
  })

  it('여러 장은 순서대로 이어 넣는다', () => {
    expect(inserted('본문', 'end', [A, B])).toBe(`본문\n\n![](${A})\n\n![](${B})\n\n`)
    expect(caret()).toEqual({ text: '', offset: 0 })
  })

  it('문단 가운데 — 문단을 가르고 캐럿은 뒷글 첫머리 · 편집기 구조가 렌더와 같다', () => {
    expect(inserted('앞뒤', 2, [A])).toBe(`앞\n\n![](${A})\n\n뒤`)
    expect(caret()).toEqual({ text: '뒤', offset: 0 })
    sameStructure(h, h.editor.getMarkdown())
    expect(inserted('앞뒤', 2, [A, B])).toBe(`앞\n\n![](${A})\n\n![](${B})\n\n뒤`)
    expect(caret()).toEqual({ text: '뒤', offset: 0 })
    sameStructure(h, h.editor.getMarkdown())
  })

  it('문단 첫머리 — 그 문단 앞에 넣고 캐럿은 그 문단 첫머리', () => {
    expect(inserted('본문', 1, [A])).toBe(`![](${A})\n\n본문`)
    expect(caret()).toEqual({ text: '본문', offset: 0 })
    sameStructure(h, h.editor.getMarkdown())
  })

  it('빈 문서 · 제목 뒤', () => {
    expect(inserted('', 'end', [A])).toBe(`![](${A})\n\n`)
    expect(inserted('# 제목', 'end', [A])).toBe(`# 제목\n\n![](${A})\n\n`)
  })

  it('그림을 고른 채(NodeSelection) — 그 그림 뒤에 넣는다', () => {
    h.roundTrip('![](https://a.example/x.png)')
    h.editor.commands.setNodeSelection(0)
    expect(h.editor.state.selection).toBeInstanceOf(NodeSelection)
    insertImagesAt(h.editor, h.editor.state.selection.to, [A])
    h.editor.state.doc.check()
    expect(h.editor.getMarkdown()).toBe(`![](https://a.example/x.png)\n\n![](${A})\n\n`)
  })

  it('여러 장도 트랜잭션 하나다(되돌리기 한 번) · 빈 목록은 트랜잭션을 내지 않는다', () => {
    h.roundTrip('본문')
    let transactions = 0
    h.editor.on('transaction', () => {
      transactions += 1
    })
    insertImagesAt(h.editor, 3, [A, B])
    expect(transactions).toBe(1)
    insertImagesAt(h.editor, 1, [])
    expect(transactions).toBe(1)
  })
})

describe('sourceWithImages — 원문 textarea', () => {
  it('앞뒤 글이 있으면 빈 줄로 띄우고 캐럿은 마지막 그림 줄 뒤', () => {
    const result = sourceWithImages('앞뒤', 1, [A])
    expect(result.value).toBe(`앞\n\n![](${A})\n\n뒤`)
    expect(result.caret).toBe(`앞\n\n![](${A})`.length)
  })

  it('이미 빈 줄 · 줄바꿈이 있으면 그만큼만 더한다 · 여러 장은 빈 줄로', () => {
    expect(sourceWithImages('앞\n\n뒤', 3, [A]).value).toBe(`앞\n\n![](${A})\n\n뒤`)
    expect(sourceWithImages('앞\n', 2, [A, B]).value).toBe(`앞\n\n![](${A})\n\n![](${B})`)
    expect(sourceWithImages('앞\n뒤', 1, [A]).value).toBe(`앞\n\n![](${A})\n\n뒤`)
  })

  it('빈 값 · 범위 밖 자리', () => {
    expect(sourceWithImages('', 0, [A])).toEqual({ value: `![](${A})`, caret: `![](${A})`.length })
    expect(sourceWithImages('본문', 99, [A]).value).toBe(`본문\n\n![](${A})`)
    expect(sourceWithImages('본문', -3, [A]).value).toBe(`![](${A})\n\n본문`)
  })
})
