import type { JSONContent } from '@tiptap/core'

// 읽은 문서 JSON 정규화(스펙 A10 — 어댑터 ⑩). 순수 모듈 — 편집기 배선은 editor-markdown.ts `ImageSplitOnParse`.
//
// 정본: ssworks-ringside apps/web/app/utils/editor-markdown-normalize.ts (p1d 2026-10-31 — ringside 소유, 킷이 가져왔다)
// 바꾼 점: 없음(주석만). 킷은 그림을 거르지 않지만 이 정규화는 거르기와 무관하다 — 그림이 어디서 왔든 텍스트 블록 밖으로 낸다.
//
// `@tiptap/markdown` 은 글자와 같은 Markdown 문단에 든 그림(`a\n![](…)` · `앞 ![](…) 뒤` · `## 제목 ![](…)` · 목록 항목의
// `- a\n  ![](…)`)을 그 문단의 인라인 내용으로 읽는다(Paragraph.parseMarkdown 은 그림 한 장뿐인 문단만 따로 본다). 그림은
// 블록 노드라 스키마에 어긋난 문서가 되고, TipTap 은 enableContentCheck 가 꺼져 있어 말없이 받는다 — 그 문단을 고치는 순간
// (타자 · 굵게) TransformError 를 던진다. 옛 원고(`글\n![](…)`)가 모두 닿는다.

/** 기본 텍스트 블록 — 편집기 배선은 스키마의 isTextblock 으로 고른다 */
export const DEFAULT_TEXTBLOCKS: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
  'codeBlock',
])

const IMAGE = 'image'
const LIST_ITEM = 'listItem'
const PARAGRAPH = 'paragraph'
const HARD_BREAK = 'hardBreak'
/** 블록 자리에 홀로 서면 문단에 싸야 하는 인라인 */
const INLINE = new Set(['text', HARD_BREAK])

/** 가르는 자리에서 버릴 것 — hardBreak · 공백뿐인 글자 */
function isSeam(node: JSONContent | undefined): boolean {
  if (node === undefined) return false
  return node.type === HARD_BREAK || (node.type === 'text' && (node.text ?? '').trim() === '')
}

/** 가르는 자리(trimStart — 그림 뒤 머리, trimEnd — 그림 앞 꼬리)의 hardBreak · 공백뿐인 글자를 걷고 가장자리 글자의 공백을 다듬는다 */
function trimRun(run: readonly JSONContent[], trimStart: boolean, trimEnd: boolean): JSONContent[] {
  let start = 0
  let end = run.length
  if (trimStart) while (start < end && isSeam(run[start])) start += 1
  if (trimEnd) while (end > start && isSeam(run[end - 1])) end -= 1
  const nodes = run.slice(start, end)
  const first = nodes[0]
  if (trimStart && first?.type === 'text')
    nodes[0] = { ...first, text: (first.text ?? '').trimStart() }
  const last = nodes.at(-1)
  if (trimEnd && last?.type === 'text') {
    nodes[nodes.length - 1] = { ...last, text: (last.text ?? '').trimEnd() }
  }
  return nodes
}

/** 그림을 품은 텍스트 블록 하나를 앞 블록 · 그림 · 뒤 블록으로 가른다(같은 종류 · 속성). 빈 블록은 만들지 않는다 */
function splitTextblock(node: JSONContent): JSONContent[] {
  const out: JSONContent[] = []
  let run: JSONContent[] = []
  let afterImage = false
  const flush = (beforeImage: boolean) => {
    const content = trimRun(run, afterImage, beforeImage)
    if (content.length > 0) out.push({ ...node, content })
    run = []
  }
  for (const child of node.content ?? []) {
    if (child.type !== IMAGE) {
      run.push(child)
      continue
    }
    flush(true)
    // 블록 그림에는 마크를 둘 수 없다(인라인일 때 링크 등이 걸려 왔을 수 있다)
    const { marks: _marks, ...image } = child
    out.push(image)
    afterImage = true
  }
  flush(false)
  return out
}

/**
 * 텍스트 블록(textblocks — 문단 · 제목 · 코드 블록) 안에 든 그림을 블록으로 꺼낸다 — 앞 글 · 그림 · 뒤 글. 그림에 붙은 hardBreak 와
 * 가르는 자리의 공백은 버리고, 비게 된 블록은 만들지 않는다. 같은 김에 블록 자리에 홀로 선 인라인(글자 · hardBreak)은 문단에 싼다 —
 * 바로 앞이 빈 문단이면 거기에 넣는다(할 일 목록 표시 `- [ ] 할 일` 을 TipTap 이 항목 안 빈 문단 + 맨 글자로 읽는다).
 * 목록 항목은 스키마가 문단을 첫 자식으로 요구하므로(`paragraph block*`) 첫 자식이 문단이 아니면 빈 문단을 앞에 둔다(그림으로 시작하는
 * 항목 · 내용 없는 항목). 바꿀 것이 없으면 같은 모양을 돌려준다
 */
export function splitImagesOutOfTextblocks(
  json: JSONContent,
  textblocks: ReadonlySet<string> = DEFAULT_TEXTBLOCKS,
): JSONContent {
  if (textblocks.has(json.type ?? '')) return json
  if (!Array.isArray(json.content) && json.type !== LIST_ITEM) return json
  const content: JSONContent[] = []
  // 홀로 선 인라인을 받는 문단의 자리 — 블록이 오면 끊긴다
  let strayAt = -1
  for (const child of json.content ?? []) {
    const isTextblock = textblocks.has(child.type ?? '')
    if (INLINE.has(child.type ?? '')) {
      const previous = content.at(-1)
      if (strayAt < 0 && previous?.type === PARAGRAPH && (previous.content?.length ?? 0) === 0) {
        strayAt = content.length - 1
      } else if (strayAt < 0) {
        content.push({ type: PARAGRAPH })
        strayAt = content.length - 1
      }
      const target = content[strayAt] ?? { type: PARAGRAPH }
      content[strayAt] = { ...target, content: [...(target.content ?? []), child] }
      continue
    }
    strayAt = -1
    if (isTextblock && child.content?.some((inline) => inline.type === IMAGE)) {
      content.push(...splitTextblock(child))
    } else {
      content.push(isTextblock ? child : splitImagesOutOfTextblocks(child, textblocks))
    }
  }
  if (json.type === LIST_ITEM && content[0]?.type !== PARAGRAPH)
    content.unshift({ type: PARAGRAPH })
  return { ...json, content }
}
