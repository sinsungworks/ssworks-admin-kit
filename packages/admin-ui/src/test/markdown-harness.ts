import { renderMarkdown } from '@ssworks/admin-shared'
import { Editor } from '@tiptap/core'
import { expect } from 'vitest'
import { createMarkdownEditorExtensions } from '../components/markdown/editor-markdown.js'

// 편집기 왕복 시험 하니스 — 쓰는 테스트 파일은 머리에 `// @vitest-environment happy-dom` 을 단다.
//
// 정본: ssworks-ringside apps/web/app/utils/editor-markdown.ts `createEditorMarkdown` + editor-markdown.test.ts 머리의 오라클 도우미
// 바꾼 점: 렌더 기준이 admin-shared `renderMarkdown`(ringside 는 그 위에 이미지 거르기를 얹은 renderPublicMarkdown) · 그림 거르기 없음.
//
// 🔴 마운트한 편집기만 — `element: null` 편집기에는 플러그인(입력 규칙 · 붙여넣기 · 자동 링크 · history)이 없어 화면을 대변하지 못한다.
// 🔴 내용을 넣을 때마다 `doc.check()`(오라클 ④) — TipTap 은 스키마에 어긋난 문서를 말없이 받고(enableContentCheck 꺼짐) 그 문단을
//    고치는 순간 던진다. 이것 없이는 "다시 열어 고치면 던진다" 를 테스트가 못 잡는다.

export interface MarkdownHarness {
  /** Markdown → 문서 → Markdown */
  roundTrip(markdown: string): string
  /** HTML(붙여넣기 경로) → 문서 → Markdown */
  fromHtml(html: string): string
  /** 빈 문서에 글자 붙여넣기(view.pasteText — 클립보드 글자 경로) → Markdown */
  pasteText(text: string): string
  /** 지금 문서의 편집기 HTML — 렌더와 구조를 견줄 때 */
  html(): string
  readonly editor: Editor
  destroy(): void
}

/** happy-dom 에 호스트 <div> 를 붙여 돌려준다 */
export function mountHost(): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  return host
}

export function createMarkdownHarness(element: Element): MarkdownHarness {
  const editor = new Editor({
    element,
    extensions: createMarkdownEditorExtensions(),
    content: '',
    contentType: 'markdown',
    injectCSS: false,
  })
  const checked = (): string => {
    editor.state.doc.check()
    return editor.getMarkdown()
  }
  return {
    roundTrip(markdown) {
      editor.commands.setContent(markdown, { contentType: 'markdown' })
      return checked()
    },
    fromHtml(html) {
      editor.commands.setContent(html, { contentType: 'html' })
      return checked()
    },
    pasteText(text) {
      editor.commands.setContent('', { contentType: 'markdown' })
      editor.commands.setTextSelection(1)
      editor.view.pasteText(text)
      return checked()
    },
    html: () => editor.getHTML(),
    editor,
    destroy: () => editor.destroy(),
  }
}

// ── 둘째 오라클의 눈 ─────────────────────────────────────────────────────────────────────────
// 첫째 오라클(Markdown → 편집기 → Markdown 의 렌더가 같다)은 편집기 문서 → Markdown → 렌더 쪽을 보지 못한다 — 글자로 붙여넣은
// `1. 존 존스` 가 편집기에는 문단, 렌더에는 목록이었다. 둘째 오라클은 편집기 HTML(getHTML)과 렌더의 블록 구조를 견준다.

const KEPT_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ['href'],
  img: ['src', 'alt'],
  ol: ['start'],
}
const VOID_TAGS = new Set(['br', 'hr', 'img'])

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 그림(과 <br>)만 든 문단 — markdown-it 은 그림 한 줄을 문단에 싸고 편집기는 블록 그림이다 */
function isImageOnlyParagraph(element: Element): boolean {
  if (element.tagName !== 'P' || element.textContent?.trim() !== '') return false
  const children = [...element.children]
  return (
    children.some((child) => child.tagName === 'IMG') &&
    children.every((child) => child.tagName === 'IMG' || child.tagName === 'BR')
  )
}

function canonical(parent: ParentNode): string {
  let out = ''
  for (const child of parent.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += escapeText((child.textContent ?? '').replace(/[\s ]+/g, ' '))
      continue
    }
    if (!(child instanceof Element)) continue
    const tag = child.tagName.toLowerCase()
    if (tag === 'br' && child.classList.contains('ProseMirror-trailingBreak')) continue
    if (tag === 'div' && child.getAttribute('data-type') === 'horizontalRule') {
      out += '<hr>'
      continue
    }
    const firstParagraphOfItem =
      tag === 'p' &&
      child.parentElement?.tagName === 'LI' &&
      child.parentElement.firstElementChild === child
    if (firstParagraphOfItem || isImageOnlyParagraph(child)) {
      out += canonical(child)
      continue
    }
    const attributes = (KEPT_ATTRIBUTES[tag] ?? [])
      .map((name) => [name, child.getAttribute(name) ?? ''] as const)
      .filter(([, value]) => value !== '')
      .map(([name, value]) => ` ${name}="${escapeText(value)}"`)
      .join('')
    out += VOID_TAGS.has(tag)
      ? `<${tag}${attributes}>`
      : `<${tag}${attributes}>${canonical(child)}</${tag}>`
  }
  return out
}

/**
 * 블록 구조만 남긴 HTML. 무시하는 것은 이것뿐이다 — 속성(a href · img src alt · ol start 만 남김) · 공백(nbsp 포함 — 빈 문단
 * `<p></p>` = `<p>&nbsp;</p>`) · ProseMirror 전용 모양(trailingBreak · horizontalRule 래퍼) · li 의 첫 <p>(촘촘한 목록) ·
 * 그림만 든 <p>
 */
export function normalizeBlocks(html: string): string {
  const root = document.createElement('div')
  root.innerHTML = html
  return canonical(root)
    .replace(/ ?(<[^>]+>) ?/g, '$1')
    .trim()
}

/** 둘째 오라클 — 지금 편집기 문서(h.html())가 그 직렬화(markdown)의 렌더와 같은 구조다 */
export function sameStructure(h: MarkdownHarness, markdown: string): void {
  expect(normalizeBlocks(renderMarkdown(markdown)), `렌더 구조 — ${markdown}`).toBe(
    normalizeBlocks(h.html()),
  )
}

/**
 * 편집기를 한 번 지난 Markdown 이 렌더에서 원문과 같고(첫째), 편집기에 보이는 구조가 그 렌더와 같고(둘째), 두 번 지나도
 * 그대로다(멱등). structure: false 는 알려진 차이(표 — 편집기에는 글자)만
 */
export function same(h: MarkdownHarness, source: string, { structure = true } = {}): void {
  expect(renderMarkdown(source), `원문 렌더가 비어 있다 — ${source}`).not.toBe('')
  const once = h.roundTrip(source)
  expect(renderMarkdown(once), `렌더 — ${source}`).toBe(renderMarkdown(source))
  if (structure) sameStructure(h, once)
  expect(h.roundTrip(once), `멱등 — ${source}`).toBe(once)
}

/**
 * 셋째 오라클 — n번 왕복해도 둘째 왕복부터 바이트가 같고, 렌더는 첫 왕복과 같다. 저장마다 한 칸씩 쌓이는 들여쓰기 · 불어나는
 * 엔티티를 잡는다. passes[0] 은 원문, passes[k] 는 k번 왕복
 */
export function stableOver(h: MarkdownHarness, source: string, n = 4): string[] {
  const passes = [source]
  for (let pass = 1; pass <= n; pass += 1) passes.push(h.roundTrip(passes[pass - 1] ?? ''))
  const firstRender = renderMarkdown(passes[1] ?? '')
  for (let pass = 2; pass <= n; pass += 1) {
    expect(passes[pass], `왕복 ${pass}회 — ${source}`).toBe(passes[2])
    expect(renderMarkdown(passes[pass] ?? ''), `렌더 ${pass}회 — ${source}`).toBe(firstRender)
  }
  return passes
}
