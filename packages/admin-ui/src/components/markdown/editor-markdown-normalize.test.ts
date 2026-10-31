import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { splitImagesOutOfTextblocks } from './editor-markdown-normalize.js'

// 정본: ssworks-ringside apps/web/app/utils/editor-markdown-normalize.test.ts — 그림 주소만 바꿨다(킷은 거르지 않는다).

const text = (value: string, marks?: JSONContent['marks']): JSONContent =>
  marks === undefined ? { type: 'text', text: value } : { type: 'text', text: value, marks }
const br: JSONContent = { type: 'hardBreak' }
const img = (src = 'https://cdn.example.com/x.png'): JSONContent => ({
  type: 'image',
  attrs: { src },
})
const p = (...content: JSONContent[]): JSONContent =>
  content.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content }
const h2 = (...content: JSONContent[]): JSONContent => ({
  type: 'heading',
  attrs: { level: 2 },
  content,
})
const li = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content })
const ul = (...content: JSONContent[]): JSONContent => ({ type: 'bulletList', content })
const quote = (...content: JSONContent[]): JSONContent => ({ type: 'blockquote', content })
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

describe('splitImagesOutOfTextblocks — 텍스트 블록 안 그림을 블록으로(스펙 A10 — ⑩)', () => {
  it('글 · 줄바꿈 · 그림 → 문단 · 그림(그림 옆 hardBreak 는 버린다)', () => {
    expect(splitImagesOutOfTextblocks(doc(p(text('a'), br, img())))).toEqual(
      doc(p(text('a')), img()),
    )
  })

  it('앞 글 · 그림 · 뒤 글 → 문단 셋으로 갈라 가르는 자리 공백을 다듬는다', () => {
    expect(splitImagesOutOfTextblocks(doc(p(text('앞 '), img(), text(' 뒤'))))).toEqual(
      doc(p(text('앞')), img(), p(text('뒤'))),
    )
  })

  it('가르는 자리 밖의 공백은 둔다(문단 첫머리 들여쓰기 · 끝 공백)', () => {
    expect(splitImagesOutOfTextblocks(doc(p(text('    들여쓰기 '), img(), text(' 끝  '))))).toEqual(
      doc(p(text('    들여쓰기')), img(), p(text('끝  '))),
    )
  })

  it('그림 둘 사이 hardBreak · 공백뿐인 글자는 사라지고 빈 문단을 만들지 않는다', () => {
    expect(splitImagesOutOfTextblocks(doc(p(img('/1'), br, text('  '), br, img('/2'))))).toEqual(
      doc(img('/1'), img('/2')),
    )
  })

  it('제목은 같은 단계의 제목 둘로 가른다', () => {
    expect(splitImagesOutOfTextblocks(doc(h2(text('제목 '), img(), text(' 뒤'))))).toEqual(
      doc(h2(text('제목')), img(), h2(text('뒤'))),
    )
  })

  it('그림에 걸린 마크(링크 등)는 뗀다 — 블록 그림은 마크를 둘 수 없다', () => {
    const linked: JSONContent = {
      ...img(),
      marks: [{ type: 'link', attrs: { href: 'https://e.com' } }],
    }
    expect(splitImagesOutOfTextblocks(doc(p(text('a'), linked)))).toEqual(doc(p(text('a')), img()))
  })

  it('글자 마크는 지킨다', () => {
    const bold = [{ type: 'bold' }]
    expect(splitImagesOutOfTextblocks(doc(p(text('굵게 ', bold), img())))).toEqual(
      doc(p(text('굵게', bold)), img()),
    )
  })

  it('목록 항목 · 인용 안까지 내려간다', () => {
    expect(
      splitImagesOutOfTextblocks(
        doc(ul(li(p(text('a'), br, img()))), quote(p(text('q'), br, img()))),
      ),
    ).toEqual(doc(ul(li(p(text('a')), img())), quote(p(text('q')), img())))
  })

  it('목록 항목이 그림으로 시작하면 빈 문단을 앞에 둔다 — 스키마는 문단을 첫 자식으로 요구한다', () => {
    expect(splitImagesOutOfTextblocks(doc(ul(li(p(img())))))).toEqual(doc(ul(li(p(), img()))))
  })

  it('내용 없는 목록 항목에도 빈 문단을 채운다', () => {
    expect(splitImagesOutOfTextblocks(doc(ul({ type: 'listItem' }, li(p(text('b'))))))).toEqual(
      doc(ul(li(p()), li(p(text('b'))))),
    )
  })

  it('블록 자리에 홀로 선 글자는 문단에 싼다 — 바로 앞 빈 문단이 있으면 거기(할 일 목록 `- [ ] 할 일`)', () => {
    expect(splitImagesOutOfTextblocks(doc(ul(li(p(), text('할 일')))))).toEqual(
      doc(ul(li(p(text('할 일'))))),
    )
    expect(splitImagesOutOfTextblocks(doc(text('a'), br, text('b'), p(text('c'))))).toEqual(
      doc(p(text('a'), br, text('b')), p(text('c'))),
    )
  })

  it('바꿀 것이 없으면 같은 모양이다', () => {
    const plain = doc(p(text('a'), br, text('b')), ul(li(p(text('c')))), img(), {
      type: 'codeBlock',
      content: [text('x')],
    })
    expect(splitImagesOutOfTextblocks(plain)).toEqual(plain)
  })
})
