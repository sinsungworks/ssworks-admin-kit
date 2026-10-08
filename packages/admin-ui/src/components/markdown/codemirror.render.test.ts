// @vitest-environment happy-dom
import { undo, undoDepth } from '@codemirror/commands'
import { EditorState, Transaction } from '@codemirror/state'
import { basicSetup, EditorView } from 'codemirror'
import { afterEach, describe, expect, it } from 'vitest'

// CodeMirror 계약 — `MarkdownEditor` 가 기대는 CodeMirror 6 동작을 킷의 happy-dom 에서 고정한다(3e 스펙 §8 위험 ① · D4).
// gise 는 happy-dom 에서 `EditorView.findFromDOM` + `dispatch` 가 동작함을 2026-09-23 에 실측했다(legal-page.test.ts).
// `@codemirror/commands` 는 이 테스트만 쓰는 devDependency 다(peer 아님 — 패키지 소스는 import 하지 않는다).

let view: EditorView | null = null

afterEach(() => {
  view?.destroy()
  view = null
  document.body.innerHTML = ''
})

function make(doc: string): EditorView {
  const parent = document.createElement('div')
  document.body.append(parent)
  view = new EditorView({ parent, state: EditorState.create({ doc, extensions: [basicSetup] }) })
  return view
}

describe('CodeMirror 계약(happy-dom)', () => {
  it('마운트하면 편집 가능한 .cm-content 가 생기고, 호스트 · 편집 영역으로 뷰를 찾는다', () => {
    const v = make('# 제1조')
    const host = v.dom.parentElement!
    expect(host.querySelector('.cm-editor')).toBe(v.dom)
    expect(v.contentDOM.getAttribute('contenteditable')).toBe('true')
    expect(EditorView.findFromDOM(host)).toBe(v)
    expect(EditorView.findFromDOM(v.contentDOM)).toBe(v)
  })

  it('🔴 전체 치환 + addToHistory(false) 는 이전 문서의 되돌리기 기록을 비운다(D4)', () => {
    const v = make('이용약관 본문')
    v.dispatch({ changes: { from: v.state.doc.length, insert: ' 제1조' }, userEvent: 'input.type' })
    expect(
      undoDepth(v.state),
      '가드 — 같은 @codemirror/commands 인스턴스라 사용자 편집이 기록된다',
    ).toBeGreaterThan(0)
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: '개인정보처리방침 본문' },
      annotations: [Transaction.addToHistory.of(false)],
    })
    expect(undoDepth(v.state)).toBe(0)
    expect(undo(v)).toBe(false)
    expect(v.state.doc.toString()).toBe('개인정보처리방침 본문')
  })

  it('개행은 \\n 으로 정규화된다 — CRLF 본문은 첫 입력부터 LF 로 나간다', () => {
    const v = make('가\r\n나')
    expect(v.state.doc.toString()).toBe('가\n나')
  })
})
