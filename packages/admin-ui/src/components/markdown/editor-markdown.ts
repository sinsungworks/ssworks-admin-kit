import {
  Extension,
  InputRule,
  combineTransactionSteps,
  getChangedRanges,
  type Content,
  type JSONContent,
} from '@tiptap/core'
import Code from '@tiptap/extension-code'
import CodeBlock from '@tiptap/extension-code-block'
import Document from '@tiptap/extension-document'
import Image from '@tiptap/extension-image'
import { ListItem } from '@tiptap/extension-list'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Markdown, type MarkdownExtensionOptions } from '@tiptap/markdown'
import type { Mark, MarkType, Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import StarterKit, { type StarterKitOptions } from '@tiptap/starter-kit'
import { Marked, Tokenizer, type Tokens } from 'marked'
import { splitImagesOutOfTextblocks } from './editor-markdown-normalize.js'

// 마크다운 편집기의 충실도 어댑터(스펙 §2-3 A1~A12) — 편집기에 보이는 것이 admin-shared `renderMarkdown`(markdown-it html:false ·
// linkify · breaks:true)과 같아지게 맞춘다. 순수 모듈(Vue 무의존) — 화면은 MarkdownEditor.vue, 시험 하니스는 src/test/markdown-harness.ts.
//
// 정본: ssworks-ringside apps/web/app/utils/editor-markdown.ts (p1d 2026-10-31 — ringside 소유, 킷이 가져왔다)
// 바꾼 점:
//  - 그림을 거르지 않는다(`MediaImage` · `isMediaImageSrc` 없음 — 기본 `Image`, 입력 규칙도 켠다. 거르기는 ringside 몫, 결정 ②).
//  - `Code.extend({ excludes: 'code' })` 를 여기서 끼운다(ringside 는 Nuxt UI 가 끼웠다 — 결정 ⑤). HorizontalRule 은 StarterKit 것.
//  - 하니스는 src/test 로, `openableLinkHref` 는 뺐다(열기 단추 없음).
// 🔴 `renderMarkdown` 옵션은 바꾸지 않는다(보안 표면) — 맞추는 쪽은 언제나 편집기다.

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
/** 같은 사이트 안 주소 — 경로 · 조각 · 쿼리 · 상대 경로에는 https:// 를 붙이지 않는다(약관의 「제3조」 조각 링크 같은 것, 리뷰 사소 #5) */
const SAME_SITE = /^(?:[/#?]|\.{1,2}\/)/
/** Markdown 링크 대상 `[글](주소)` 를 끊는 글자 — @tiptap/markdown 은 주소를 그대로 적는다(꺾쇠 감싸기 없음) */
const HREF_BREAKING = /[\s()<>]/gu

/** encodeURIComponent 는 괄호를 남긴다 — 괄호만 손으로 */
function percentEncode(char: string): string {
  if (char === '(') return '%28'
  if (char === ')') return '%29'
  return encodeURIComponent(char)
}

/**
 * 링크 대화상자 주소(A11) — 다듬고, 스킴도 없고 같은 사이트 안 주소(`/` · `#` · `?` · `./` · `../`)도 아니면 https://. 비면 null(링크를
 * 지운다). 안쪽 공백(전각 포함) · 괄호 · 꺾쇠는 퍼센트 인코딩한다 — 그대로 두면 직렬화한 `[글](주소)` 가 공백 · `)` 에서 끊겨 렌더가
 * 링크를 잃는다. 그 밖의 글자는 그대로(이미 인코딩된 `%xx` 도 두 번 인코딩하지 않는다)
 */
export function normalizeLinkHref(input: string): string | null {
  const value = input.trim()
  if (value === '') return null
  const href = HAS_SCHEME.test(value) || SAME_SITE.test(value) ? value : `https://${value}`
  return href.replace(HREF_BREAKING, percentEncode)
}

/**
 * StarterKit 설정(A3) — 밑줄은 렌더에 없다. 제목은 기본 1~6단계(옛 원고 보존 — 도구는 2 · 3만).
 * 🔴 trailingNode 끔 — 문서가 그림 · 목록 · 인용 · 구분선으로 끝나면 마운트 때 끝 블록 뒤에 빈 문단이 붙어 건드리지 않은 원고의
 *    값이 `본문 + "\n\n"` 로 바뀐다(D3 전제가 깨지고 이탈 확인이 뜬다). 마지막 블록 뒤로는 Gapcursor 로 갈 수 있다.
 * 문서 · 문단 · 글자 · 목록 항목 · 코드 블록 · 코드는 끄고 아래 `.extend` 한 것으로 바꿔 끼운다 — 같은 이름 확장이 둘이면 안 된다.
 */
export const STARTER_KIT_OPTIONS = {
  underline: false,
  link: { openOnClick: false },
  trailingNode: false,
  document: false,
  paragraph: false,
  text: false,
  listItem: false,
  codeBlock: false,
  code: false,
} satisfies Partial<StarterKitOptions>

type MarkedInstance = NonNullable<MarkdownExtensionOptions['marked']>

/**
 * marked 토크나이저(A2) — markdown-it(html:false · 표 기본)과 다른 토큰을 끈다.
 * - `html`(블록) · `tag`(인라인): 원문 HTML 을 토큰으로 내지 않으면 문단 글자로 떨어진다 = 렌더가 글자로 보이는 것과 같다.
 *   🔴 `@tiptap/markdown` 은 인라인 `html` 토큰을 파서 안에서 해석해(확장 `parseHTML`) TipTap 확장으로는 가로챌 수 없다 — 그래서 파서 앞단.
 * - `table`: TipTap 에 표 확장이 없어 토큰이 그냥 버려진다 — 글자로 두면 원문이 보존돼 렌더(markdown-it 은 표를 그린다)가 같다.
 *   편집기에서는 파이프 줄이 글자로 보이고, 줄 끝 공백 둘(hard break)로 직렬화돼 markdown-it 표 규칙이 다시 읽는다.
 * - `del`: 취소선은 `~~` 만 — marked gfm 은 `~` 하나도 받지만 markdown-it 은 둘만 받는다.
 * 🔴 Lexer 옵션 경로(`setOptions` → `defaults.tokenizer`)에서만 먹는다 — `marked.use()` · `new Marked({ tokenizer })` 는 own property 만
 *    복사해 프로토타입 메서드(이 클래스)를 무시한다. "원문 HTML 은 글자" 테스트가 죽으면 이 경로가 바뀐 것이다.
 * Lexer 가 인스턴스에 options · rules · lexer 를 꽂으므로 편집기마다 새로 만든다(markdownOptions).
 */
export class KitFidelityTokenizer extends Tokenizer {
  override html(): Tokens.HTML | undefined {
    return undefined
  }

  override tag(): Tokens.Tag | undefined {
    return undefined
  }

  override del(src: string, maskedSrc: string, prevChar?: string): Tokens.Del | undefined {
    return src.startsWith('~~') ? super.del(src, maskedSrc, prevChar) : undefined
  }

  override table(): Tokens.Table | undefined {
    return undefined
  }
}

/**
 * `@tiptap/markdown` 옵션(A1 · A2) — gfm + breaks(`\n` 하나가 줄바꿈) + 충실도 토크나이저.
 * 🔴 확장은 `markedInstance.setOptions(markedOptions)` 로 옵션을 심고 그 인스턴스의 lexer 로 파싱한다 — 인스턴스를 주지 않으면 전역
 *    `marked` 싱글턴의 기본값을 바꾼다(프로세스 전역 부작용). 편집기마다 새 Marked · 새 토크나이저.
 */
export function markdownOptions(): MarkdownExtensionOptions {
  return {
    marked: new Marked() as unknown as MarkedInstance,
    markedOptions: { gfm: true, breaks: true, tokenizer: new KitFidelityTokenizer() },
  }
}

/** 텍스트 블록 하나의 코드 구간(이어진 코드 마크 글자 노드들)마다, 구간 전체를 덮지 않는 다른 마크를 뗀다 */
function normalizeCodeRuns(
  tr: Transaction,
  block: ProseMirrorNode,
  blockPos: number,
  code: MarkType,
): boolean {
  let changed = false
  let run: { from: number; to: number; nodes: ProseMirrorNode[] } | null = null
  const flush = () => {
    if (run === null) return
    const others = new Map<MarkType, Mark>()
    for (const node of run.nodes) {
      for (const mark of node.marks) if (mark.type !== code) others.set(mark.type, mark)
    }
    for (const [type, mark] of others) {
      if (run.nodes.every((node) => mark.isInSet(node.marks))) continue
      tr.removeMark(run.from, run.to, type)
      changed = true
    }
    run = null
  }
  block.forEach((child, offset) => {
    const pos = blockPos + 1 + offset
    if (child.isText && code.isInSet(child.marks)) {
      if (run === null) run = { from: pos, to: pos + child.nodeSize, nodes: [child] }
      else {
        run.to = pos + child.nodeSize
        run.nodes.push(child)
      }
      return
    }
    flush()
  })
  flush()
  return changed
}

const CODE_RUNS_KEY = new PluginKey('kitCodeRuns')

/**
 * 코드 마크가 굵게 · 기울임 · 링크와 겹친다(기본은 `excludes: '_'` — 전부 배제해 `[\`코드\`](url)` · `**굵은 \`코드\`**` 가 바깥
 * 마크를 잃었다). 🔴 대신 겹침은 **코드 구간 전체를 덮는 마크**만 허용한다 — 구간 일부에만 걸린 마크(도구 막대로 코드 안에서 굵게를
 * 시작하는 것 같은)는 `@tiptap/markdown` 이 코드 안에 `**` 를 적거나 `<strong>` 원문 HTML 을 내어 렌더가 갈렸다(리뷰 중요 #1).
 * 트랜잭션이 바꾼 범위의 텍스트 블록만 본다(`getChangedRanges` — AddMarkStep 도 범위를 낸다)
 */
export const EditorCode = Code.extend({
  excludes: 'code',
  addProseMirrorPlugins() {
    const code = this.type
    return [
      new Plugin({
        key: CODE_RUNS_KEY,
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null
          const transform = combineTransactionSteps(oldState.doc, [...transactions])
          const tr = newState.tr
          const seen = new Set<number>()
          let changed = false
          for (const { newRange } of getChangedRanges(transform)) {
            newState.doc.nodesBetween(newRange.from, newRange.to, (node, pos) => {
              if (!node.isTextblock) return true
              if (!seen.has(pos)) {
                seen.add(pos)
                if (normalizeCodeRuns(tr, node, pos, code)) changed = true
              }
              return false
            })
          }
          return changed ? tr : null
        },
      }),
    ]
  },
})

/** TipTap `Image` 의 입력 규칙과 같은 모양 — 앞이 줄머리 · 공백인 `![alt](src "title")` 를 마지막 `)` 까지 쳤을 때 */
const IMAGE_INPUT = /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/

/**
 * 그림(A4) — 기본 `Image` 에 입력 규칙만 바꿔 끼운다. 기본 `nodeInputRule` 은 블록 노드를 문단 가운데 넣을 때 친 마지막 글자 `)` 를
 * 그림 뒤 새 문단(`<p>)</p>`)에 남긴다(TipTap 3.32.0 — happy-dom · 실브라우저 Chrome 둘 다, 2026-11-01). 여기서는 친 글자를 넣지 않고
 * `![…](…)` 글자 자리에 그림을 넣는다(`insertContentAt` 이 문단을 가른다). 거르기는 없다(결정 ②) — 거르기는 앱 몫.
 * 🔴 넣은 뒤 캐럿을 그림 **바로 뒤**로 옮긴다 — `insertContentAt` 은 그림을 NodeSelection 으로 남겨 다음 타자가 그림을 지운다
 *    (ringside C1 과 같은 함정). 바로 뒤가 문단(글자를 가른 뒷부분)이면 그 첫머리, 아니면(문서 끝 · 뒤가 목록 · 구분선) 빈 문단을
 *    만들어 거기에 둔다 — 멀리 있는 목록 항목으로 튀지 않는다(리뷰 사소 #4)
 */
export const EditorImage = Image.extend({
  addInputRules() {
    return [
      new InputRule({
        find: IMAGE_INPUT,
        handler: ({ range, match, chain }) => {
          const [whole, markup, alt, src, title] = match
          if (markup === undefined || src === undefined) return null
          const from = range.from + (whole.length - markup.length)
          chain()
            .deleteRange({ from, to: range.to })
            .insertContentAt(from, {
              type: this.name,
              attrs: { src, alt: alt ?? '', title: title ?? null },
            })
            .command(({ tr }) => {
              // 문단 가운데였으면 insertContentAt 이 뒷글 문단 첫머리에 글자 선택을 둔다 — 그대로. 그림이 선택돼 있을 때만 옮긴다
              const { selection } = tr
              if (!(selection instanceof NodeSelection)) return true
              const after = selection.to
              const next = tr.doc.resolve(after).nodeAfter
              if (next?.isTextblock) {
                tr.setSelection(TextSelection.create(tr.doc, after + 1))
                return true
              }
              const paragraph = tr.doc.type.schema.nodes.paragraph
              if (paragraph === undefined) return true
              tr.insert(after, paragraph.create())
              tr.setSelection(TextSelection.create(tr.doc, after + 1))
              return true
            })
            .run()
        },
      }),
    ]
  },
})

/**
 * 줄머리 블록 문법 — 앞 공백 0~3칸까지(CommonMark 가 블록 표지로 읽는 들여쓰기 폭). 첫 표지 글자 하나만 `\` 로 이스케이프한다.
 * `*` 글머리 · `***` · `___` · 펜스 ``` ~~~ · `[참조]:` 는 @tiptap/markdown 이 인라인 기호로 이미 이스케이프하고, `>` 는 `&gt;` 로 적는다
 */
const LINE_START_RULES: readonly (readonly [RegExp, string])[] = [
  // 번호 목록 `1.` `1)` — 한국식 날짜 `2026. 11. 7.` 도 여기 걸린다(번호는 9자리까지)
  [/^( {0,3})(\d{1,9})([.)])(?=[ \t]|$)/, '$1$2\\$3'],
  // 제목 `#`~`######` · 글머리 `+`
  [/^( {0,3})(#{1,6}|\+)(?=[ \t]|$)/, '$1\\$2'],
  // 글머리 `-` · `-` 와 공백뿐인 줄(setext 밑줄 `---` · 가로줄 `- - -`). `--- | ---`(표 구분 줄)는 건드리지 않는다
  [/^( {0,3})-(?=[ \t]|[- \t]*$)/, '$1\\-'],
  // setext 밑줄 `===`
  [/^( {0,3})=(?==*[ \t]*$)/, '$1\\='],
]

/** 4칸 이상 들여쓴 줄(탭 포함) — 문단 첫 줄이면 들여쓴 코드 블록이 된다 */
const CODE_INDENT = /^(?: {4}| {0,3}\t)/

/**
 * 문단 글자의 줄머리가 Markdown 블록 문법으로 읽히지 않게 이스케이프(A6) — @tiptap/markdown 은 인라인 기호만 이스케이프한다.
 * 번호 목록 `1.` `1)`(한국식 날짜 포함) · 글머리 `-` `+` · 제목 `#` · setext 밑줄 `===` `---`. 글자로 붙여넣거나 입력 규칙을
 * 되돌린 문단이 렌더 때 목록 · 제목이 되지 않는다. marked · markdown-it 둘 다 `\.` `\)` `\-` `\#` `\=` 를 글자로 읽으므로 다시
 * 열면 같은 글자 문단이고, 다시 직렬화해도 같다(멱등).
 * 4칸 이상 들여쓴 줄(친 공백 · 붙여넣은 탭)은 공백을 `\` 로 이스케이프할 수 없어 첫 글자를 숫자 엔티티(`&#32;` · `&#9;`)로 적는다 —
 * 코드 블록이 되지 않고, @tiptap/markdown 이 숫자 엔티티를 풀어 다시 열면 같은 글자다(렌더에서 앞 공백은 HTML 이 접는다).
 * 들여쓰기 표지는 문단 첫 줄(first)에만 — 줄바꿈 뒤 줄은 코드 블록을 열 수 없고, 그 앞 공백은 CommonMark 가 버린다
 */
export function escapeLineStart(line: string, { first = true }: { first?: boolean } = {}): string {
  if (first && CODE_INDENT.test(line)) {
    return `${line.startsWith('\t') ? '&#9;' : '&#32;'}${line.slice(1)}`
  }
  for (const [pattern, replacement] of LINE_START_RULES) {
    if (pattern.test(line)) return line.replace(pattern, replacement)
  }
  return line
}

/** 빈 문단을 렌더에 남기는 표지 — @tiptap/extension-paragraph 와 같은 글자(그 parseMarkdown 이 빈 문단으로 되읽는다) */
const EMPTY_PARAGRAPH_MARKDOWN = '&nbsp;'

function isEmptyParagraph(node: JSONContent | undefined): boolean {
  return node?.type === 'paragraph' && (node.content?.length ?? 0) === 0
}

/** U+00A0 — 글자 그대로 적으면 eslint no-irregular-whitespace 에 걸려 코드로 만든다 */
const NBSP = String.fromCharCode(160)
/** 원문이 빈 문단 표지뿐인 문단 — 앞뒤 공백 · 줄바꿈이 붙어 와도(중첩 번호 목록 토크나이저가 한 칸 어긋나게 넘긴다) */
const EMPTY_PARAGRAPH_SOURCE = new RegExp(`^[ \\t\\n]*(?:&nbsp;|${NBSP})[ \\t\\n]*$`)
/** 첫 줄 들여쓰기 표지(escapeLineStart) — 이 문단의 첫 줄 공백은 글자다 */
const INDENT_MARKER_SOURCE = /^[ \t\n]*(?:&#32;|&#9;)/
const LINE_START_BLANKS = /^[ \t]+/

/**
 * 줄머리(문단 첫머리 · hardBreak 뒤) 글자의 앞 공백 · 탭을 버린다 — CommonMark(markdown-it)가 문단 줄의 앞 공백을 버리는 것과 같다.
 * keepFirst — 첫 줄은 들여쓰기 표지로 적은 공백이라 둔다. 공백뿐인 글자 노드는 빠지고 다음 글자 노드가 줄머리를 잇는다
 */
function stripLineStartBlanks(content: readonly JSONContent[], keepFirst: boolean): JSONContent[] {
  const out: JSONContent[] = []
  let lineStart = !keepFirst
  for (const node of content) {
    if (lineStart && node.type === 'text') {
      const text = (node.text ?? '').replace(LINE_START_BLANKS, '')
      if (text === '') continue
      out.push(text === node.text ? node : { ...node, text })
      lineStart = false
      continue
    }
    out.push(node)
    lineStart = node.type === 'hardBreak'
  }
  return out
}

/**
 * 문단(A6 · A7 · A9) — 기본 읽기 · 직렬화(this.parent)에 손질만 한다.
 * 직렬화:
 * - 줄마다 escapeLineStart — 목록 항목 · 인용 안 문단도 문단이라 같이 덮인다(목록 표지 `- ` · 인용 `> ` 는 바깥 노드가 이 출력 앞에 붙인다)
 * - 빈 문단은 목록 밖(ctx.level 0 — 문서 · 인용)에서만 `&nbsp;` — 기본은 첫 빈 문단을 `""` 로 적어 렌더에서 사라졌다.
 *   문서 끝 빈 문단은 EditorDocument 가 `""` 로 둔다. 🔴 목록 안(ctx.level > 0 — 목록이 들여쓰기 깊이를 올린다)은 늘 `""` 이고 항목의
 *   첫 자식 뒤 빈 문단은 EditorListItem 이 아예 적지 않는다 — 빈 줄은 편집기에만 보인다(K15). TipTap 번호 목록 토크나이저
 *   (@tiptap/extension-list 3.32.0)가 중첩 항목의 둘째 문단부터 한 칸 어긋나게 넘기고, 글머리 안 번호 목록의 둘째 문단부터는 블록 `text`
 *   토큰으로 보내(EditorText 참고) 목록 안 `&nbsp;` 가 글자로 되읽히거나 저장마다 `&amp;` 로 불어났다
 * 읽기(관용):
 * - 원문이 `&nbsp;`(또는 U+00A0)뿐이면 앞뒤 공백이 붙어 와도 빈 문단 — 기본은 정확히 `&nbsp;` 만 받아 ` &nbsp;` 가 글자로 남았다
 * - 줄머리 앞 공백 · 탭은 버린다(stripLineStartBlanks) — 어긋난 한 칸이 저장마다 쌓여 4칸이면 코드 블록, 그다음 사라지던 것을 끊는다.
 *   원문 첫머리가 들여쓰기 표지(`&#32;` · `&#9;`)면 첫 줄은 둔다
 */
export const EditorParagraph = Paragraph.extend({
  parseMarkdown(token, helpers) {
    const parsed = this.parent?.(token, helpers) ?? []
    // 그림 한 장짜리 문단은 그림 노드(배열)로 온다 — 문단만 손질한다
    if (Array.isArray(parsed) || !('type' in parsed) || parsed.type !== 'paragraph') return parsed
    const raw = typeof token.raw === 'string' ? token.raw : ''
    if (EMPTY_PARAGRAPH_SOURCE.test(raw)) return { ...parsed, content: [] }
    const content = parsed.content ?? []
    return { ...parsed, content: stripLineStartBlanks(content, INDENT_MARKER_SOURCE.test(raw)) }
  },
  renderMarkdown(node, h, ctx) {
    if (isEmptyParagraph(node)) return ctx.level > 0 ? '' : EMPTY_PARAGRAPH_MARKDOWN
    const out = this.parent?.(node, h, ctx) ?? ''
    // 줄바꿈 뒤 줄은 앞 공백 · 탭을 버리고 이스케이프한다 — 목록 항목 안에서는 들여쓰기를 붙여 적으므로 4칸 넘는 앞 공백이 항목 내용
    // 기준으로는 0~3칸이 되어 중첩 목록 · 제목으로 렌더됐다. 그 공백은 렌더 때도 다시 열 때도 어차피 버려진다(CommonMark)
    return out
      .split('\n')
      .map((line, index) =>
        index === 0
          ? escapeLineStart(line)
          : escapeLineStart(line.replace(LINE_START_BLANKS, ''), { first: false }),
      )
      .join('\n')
  },
})

/**
 * 문서(A7) — 맨 끝 블록이 빈 문단이면 그 문단은 `""` 로 적는다. Enter 로 끝낸 글이 빈 줄을 렌더하지 않고, 다시 열어도 값이 같다
 * (`본문\n\n`). 문단은 다음 형제를 볼 수 없어(직렬화 문맥은 앞 노드뿐) 문서가 끝 문단을 떼고 구분자만 붙인다
 */
export const EditorDocument = Document.extend({
  renderMarkdown(node, h, ctx) {
    const content = node.content ?? []
    if (content.length < 2 || !isEmptyParagraph(content.at(-1))) {
      return this.parent?.(node, h, ctx) ?? ''
    }
    return `${this.parent?.({ ...node, content: content.slice(0, -1) }, h, ctx) ?? ''}\n\n`
  },
})

/**
 * 목록 항목(A7) — 첫 자식 뒤의 빈 문단은 적지 않는다. 목록 안 빈 문단은 `""`(EditorParagraph)인데, 기본 직렬화는 그래도 `\n\n` +
 * 들여쓰기만 남은 줄을 적는다. 그 줄이 항목 끝이면 다시 열 때 바깥(문서 · 인용)의 빈 문단으로 새어 나가 다음 저장에서 `&nbsp;` 로
 * 렌더됐다. 첫 자식은 그대로 둔다 — 스키마가 문단을 첫 자식으로 요구하고 빈 항목은 `- ` 다.
 * 빈 첫 문단 뒤에 블록이 이어지면 표지 줄을 비워 적지 않는다 — 기본은 `- \n  …` 인데 marked 는 빈 표지 줄 뒤 들여쓴 줄을 항목으로
 * 읽지 않아 두 번째 저장에 `-` 문단으로 바뀌었다. 그림이 이으면 그림을 표지 줄에(`- ![](…)` — 읽기 정규화가 다시 빈 첫 문단 +
 * 그림으로 가른다), 문단이 이으면 빈 첫 문단을 버린다(목록 안 빈 줄은 편집기에만 — K15)
 */
export const EditorListItem = ListItem.extend({
  renderMarkdown(node, h, ctx) {
    const [first, ...rest] = node.content ?? []
    const kept = rest.filter((child) => !isEmptyParagraph(child))
    if (first === undefined) return this.parent?.(node, h, ctx) ?? ''
    const [next, ...others] = kept
    if (isEmptyParagraph(first) && next?.type === 'image') {
      return (
        this.parent?.({ ...node, content: [{ ...first, content: [next] }, ...others] }, h, ctx) ??
        ''
      )
    }
    if (isEmptyParagraph(first) && next?.type === 'paragraph') {
      return this.parent?.({ ...node, content: kept }, h, ctx) ?? ''
    }
    if (kept.length === rest.length) return this.parent?.(node, h, ctx) ?? ''
    return this.parent?.({ ...node, content: [first, ...kept] }, h, ctx) ?? ''
  },
})

/**
 * 글자(A9) — 블록 수준 `text` 토큰(목록 항목 안 문단 자리)은 그 인라인 토큰으로 읽는다. 기본 Text.parseMarkdown 은 `token.text` 원문을
 * 그대로 글자로 만든다 — 엔티티(`&amp;` · `&lt;`)도 백슬래시 이스케이프(`\*` · `1\.`)도 풀지 않는다. 보통은 목록 항목이 인라인을 바로
 * 읽어 이 길을 타지 않지만, TipTap 번호 목록 토크나이저(@tiptap/extension-list 3.32.0 parseListItems)는 글머리 안 번호 목록 항목의
 * 둘째 문단부터 이 길로 보내 저장마다 `&amp;amp;` · `\\\*` 가 불어났다. 인라인 토큰이 없으면 기본대로
 */
export const EditorText = Text.extend({
  parseMarkdown(token, helpers) {
    if (Array.isArray(token.tokens) && token.tokens.length > 0)
      return helpers.parseInline(token.tokens)
    return this.parent?.(token, helpers) ?? []
  },
})

/** 코드 블록 펜스(A8) — 본문의 가장 긴 백틱 줄보다 하나 길게(최소 3). 본문에 ``` 줄이 있어도 펜스가 일찍 닫히지 않는다 */
export function codeFence(text: string): string {
  let longest = 0
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}

/** 코드 블록 — 기본 직렬화(```언어 … ```)의 펜스만 codeFence 길이로 바꾼다 */
export const EditorCodeBlock = CodeBlock.extend({
  renderMarkdown(node, h, ctx) {
    const out = this.parent?.(node, h, ctx) ?? ''
    const fence = codeFence((node.content ?? []).map((child) => child.text ?? '').join(''))
    if (fence.length === 3) return out
    return `${fence}${out.slice(3, -3)}${fence}`
  },
})

function isJsonDoc(content: Content | undefined): content is JSONContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    !Array.isArray(content) &&
    content.type === 'doc'
  )
}

/**
 * Markdown 읽기 뒤 정규화(A10) — 이 편집기의 MarkdownManager.parse 를 감싸 읽은 문서마다 splitImagesOutOfTextblocks 를 건다.
 * 문단 · 제목 · 글머리 항목 · 번호 목록 어느 갈래로 읽혔든 한 곳에서 고친다. setContent · insertContent(At)(contentType markdown)은
 * editor.markdown.parse 를 부르고, 첫 내용은 Markdown 확장의 onBeforeCreate 가 같은 매니저로 이미 JSON 으로 바꿔 둔다.
 * 🔴 Markdown 확장(우선순위 기본 100)의 onBeforeCreate 가 매니저를 만든 뒤에 돌아야 한다 — 우선순위를 낮춰 뒤에 둔다. 첫 내용은 그때
 *    이미 읽혔으므로 그 JSON 도 정규화한다
 */
export const ImageSplitOnParse = Extension.create({
  name: 'kitImageSplitOnParse',
  priority: 50,
  onBeforeCreate() {
    const manager = this.editor.markdown
    if (manager === undefined) return
    const textblocks = new Set(
      Object.values(this.editor.schema.nodes)
        .filter((type) => type.isTextblock)
        .map((type) => type.name),
    )
    const parse = manager.parse.bind(manager)
    manager.parse = (markdown: string) => splitImagesOutOfTextblocks(parse(markdown), textblocks)
    const { content } = this.editor.options
    if (isJsonDoc(content))
      this.editor.options.content = splitImagesOutOfTextblocks(content, textblocks)
  },
})

/**
 * 편집기 확장 묶음(A12) — 화면(MarkdownEditor.vue)과 시험 하니스가 **같은 함수**를 부른다. 직렬화에 닿는 확장이 같아야 왕복 테스트가
 * 실제 편집기를 대변한다. 편집기마다 새로 부른다(Markdown 옵션의 Marked 인스턴스가 편집기마다 하나).
 */
export function createMarkdownEditorExtensions() {
  return [
    Markdown.configure(markdownOptions()),
    StarterKit.configure(STARTER_KIT_OPTIONS),
    EditorCode,
    EditorImage,
    EditorDocument,
    EditorParagraph,
    EditorText,
    EditorListItem,
    EditorCodeBlock,
    ImageSplitOnParse,
  ]
}
