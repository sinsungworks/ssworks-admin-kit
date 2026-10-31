// @vitest-environment happy-dom
import { renderMarkdown } from '@ssworks/admin-shared'
import { Editor } from '@tiptap/core'
import { marked } from 'marked'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createMarkdownHarness,
  mountHost,
  normalizeBlocks,
  same as sameWith,
  sameStructure as sameStructureWith,
  stableOver as stableOverWith,
} from '../../test/markdown-harness.js'
import {
  codeFence,
  createMarkdownEditorExtensions,
  escapeLineStart,
  normalizeLinkHref,
} from './editor-markdown.js'

// 어댑터 · 왕복 픽스처(스펙 §6-1). 정본: ssworks-ringside apps/web/app/utils/editor-markdown.test.ts(p1d 2026-10-31) — 미디어 전용
// (isMediaImageSrc · MediaImage · insertMediaImage · openableLinkHref)은 빼고, 킷 고유(그림 보존 · 입력 규칙 · 함정 고정)를 더했다.
// 어댑터를 하나씩 끄면 빨개지는 건수(2026-11-01 실측, 189건 중): ⑥ 줄머리 이스케이프 28 · ⑨ 문단 관용 읽기 5 · ⑩ 읽기 정규화 22.
// TipTap 을 올릴 때 다시 재면 어댑터를 걷어도 되는지 알 수 있다.

const md = createMarkdownHarness(mountHost())
afterAll(() => md.destroy())

const same = (source: string, options?: { structure?: boolean }) => sameWith(md, source, options)
const sameStructure = (markdown: string) => sameStructureWith(md, markdown)
const stableOver = (source: string, n?: number) => stableOverWith(md, source, n)

const IMG = 'https://cdn.example.com/a.png'

/** 마운트한 편집기 하나를 따로 만든다(저장 → 다시 열기 사례) */
function openEditor(content: string): Editor {
  return new Editor({
    element: mountHost(),
    extensions: createMarkdownEditorExtensions(),
    content,
    contentType: 'markdown',
    injectCSS: false,
  })
}

/** 글자 `word` 끝 위치에 그림을 넣는다(킷에는 업로드가 없다 — 블록 그림을 바로 넣는다) */
function insertImageAfter(editor: Editor, word: string, src = IMG): void {
  let end = -1
  editor.state.doc.descendants((node, pos) => {
    if (end < 0 && node.isText && node.text === word) end = pos + word.length
  })
  expect(end, `가드 — "${word}" 를 찾았다`).toBeGreaterThan(0)
  editor.commands.insertContentAt(end, { type: 'image', attrs: { src } })
  editor.state.doc.check()
}

describe('normalizeLinkHref — 링크 대화상자 주소(스펙 A11)', () => {
  it('스킴이 있으면 다듬기만', () => {
    expect(normalizeLinkHref(' https://example.com/a ')).toBe('https://example.com/a')
    expect(normalizeLinkHref('mailto:a@b.c')).toBe('mailto:a@b.c')
  })

  it('스킴이 없으면 https://', () => {
    expect(normalizeLinkHref('example.com/a')).toBe('https://example.com/a')
    expect(normalizeLinkHref('www.example.com')).toBe('https://www.example.com')
  })

  it('비면 null', () => {
    expect(normalizeLinkHref('')).toBeNull()
    expect(normalizeLinkHref('   ')).toBeNull()
  })

  it('안쪽 공백 · 괄호 · 꺾쇠는 퍼센트 인코딩 — 직렬화한 [글](주소)가 끊기지 않는다', () => {
    expect(normalizeLinkHref('https://example.com/a b')).toBe('https://example.com/a%20b')
    expect(normalizeLinkHref('example.com/위키_(동음이의)')).toBe(
      'https://example.com/위키_%28동음이의%29',
    )
    expect(normalizeLinkHref('https://example.com/?q=<a>')).toBe('https://example.com/?q=%3Ca%3E')
    expect(normalizeLinkHref('https://example.com/a\u3000b\tc')).toBe(
      'https://example.com/a%E3%80%80b%09c',
    )
  })

  it('이미 인코딩된 주소 · 그 밖의 글자는 그대로', () => {
    expect(normalizeLinkHref('https://example.com/a%20b?x=1&y=[2]#z')).toBe(
      'https://example.com/a%20b?x=1&y=[2]#z',
    )
  })

  it('인코딩한 주소로 건 링크는 렌더에서 끊기지 않는다', () => {
    const href = normalizeLinkHref('https://example.com/a b(c)') ?? ''
    const out = md.fromHtml(`<p><a href="${href}">링크</a></p>`)
    expect(out).toBe('[링크](https://example.com/a%20b%28c%29)')
    expect(renderMarkdown(out)).toContain('href="https://example.com/a%20b%28c%29"')
    sameStructure(out)
  })
})

describe('escapeLineStart — 줄머리 블록 문법 이스케이프(스펙 A6)', () => {
  it.each([
    ['1. 하나', '1\\. 하나'],
    ['1) 하나', '1\\) 하나'],
    ['2026. 11. 7. UFC 322', '2026\\. 11. 7. UFC 322'],
    ['1.', '1\\.'],
    ['- 메인 이벤트', '\\- 메인 이벤트'],
    ['-', '\\-'],
    ['+ 더하기', '\\+ 더하기'],
    ['# 기대 순위', '\\# 기대 순위'],
    ['###### 여섯', '\\###### 여섯'],
    ['---', '\\---'],
    ['- - -', '\\- - -'],
    ['===', '\\==='],
    ['=', '\\='],
    ['   1. 세 칸', '   1\\. 세 칸'],
    ['    네 칸', '&#32;   네 칸'],
    ['\t탭', '&#9;탭'],
    [' \t탭', '&#32;\t탭'],
  ])('%j → %j', (line, escaped) => {
    expect(escapeLineStart(line)).toBe(escaped)
  })

  it.each([
    '1.5배 빠르다',
    '#해시태그 #ufc',
    '-x',
    '--- | ---',
    '|---|---|',
    '선수 | 전적',
    '1234567890. 열 자리 번호',
    '==a',
    '#######',
    '본문 1. 가운데',
    '*별은 인라인이 이미 이스케이프',
  ])('블록 문법이 아니면 그대로 — %j', (line) => {
    expect(escapeLineStart(line)).toBe(line)
  })

  it('들여쓰기 표지는 문단 첫 줄만 — 줄바꿈 뒤 줄은 코드 블록을 열 수 없고 앞 공백은 CommonMark 가 버린다', () => {
    expect(escapeLineStart('    네 칸', { first: false })).toBe('    네 칸')
    expect(escapeLineStart('\t탭', { first: false })).toBe('\t탭')
    expect(escapeLineStart('1. 하나', { first: false })).toBe('1\\. 하나')
  })

  it.each([
    ['글머리 항목 · 4칸 글머리', 'bulletList', '    - x'],
    ['글머리 항목 · 4칸 제목', 'bulletList', '    # h'],
    ['번호 항목 · 5칸 글머리', 'orderedList', '     - x'],
    ['번호 항목 · 5칸 번호', 'orderedList', '     1. x'],
  ])(
    '목록 항목 안 줄바꿈 뒤 %s 는 글자로 렌더된다 — 앞 공백을 버리고 이스케이프',
    (_label, list, line) => {
      // 목록 항목은 줄바꿈 뒤 줄을 들여쓰지 않고 붙여 적는다 — 4칸 넘는 앞 공백이 항목 내용 기준 0~3칸이 되어 중첩 목록 · 제목이 됐다
      const editor = new Editor({
        element: null,
        extensions: createMarkdownEditorExtensions(),
        content: {
          type: 'doc',
          content: [
            {
              type: list,
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        { type: 'text', text: 'a' },
                        { type: 'hardBreak' },
                        { type: 'text', text: line },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        injectCSS: false,
      })
      const published = renderMarkdown(editor.getMarkdown())
      editor.destroy()
      expect(published.match(/<(?:ul|ol)/g), published).toHaveLength(1)
      expect(published, published).not.toMatch(/<h\d|<pre/)
      expect(published).toContain(line.trim())
    },
  )
})

describe('codeFence — 코드 블록 펜스 길이(스펙 A8)', () => {
  it.each([
    ['', '```'],
    ['백틱 없음', '```'],
    ['`하나`', '```'],
    ['``둘``', '```'],
    ['```\n안\n```', '````'],
    ['a ````` b', '``````'],
  ])('%j → %j', (text, fence) => {
    expect(codeFence(text)).toBe(fence)
  })
})

describe('라운드트립 — 문단 · 줄바꿈(스펙 A1 — ①)', () => {
  it('문단 하나', () => same('안녕하세요'))
  it('빈 줄은 문단', () => same('첫 문단\n\n둘째 문단'))
  it('🔴 줄 하나 바꿈은 줄바꿈(<br>) — 킷 breaks:true', () => {
    const source = '첫 줄\n둘째 줄\n셋째 줄'
    same(source)
    expect(renderMarkdown(md.roundTrip(source))).toContain('<br')
  })
  it('문단 안 줄바꿈 + 다음 문단', () => same('a\nb\n\nc'))
})

describe('라운드트립 — 원문 HTML 은 글자(스펙 A2 — ② 킷 html:false)', () => {
  it('인라인 태그', () => same('이건 <b>굵게</b> 아님'))
  it('스크립트도 글자', () => same('<script>alert(1)</script> 뒤'))
  it('블록 태그 단독', () => same('앞\n\n<div class="x">안</div>\n\n뒤'))
  it('꺾쇠 비교 · 하트', () => same('a < b 이고 <3'))
  it('기본 엔티티는 같은 렌더', () => same('A &amp; B &lt; C &gt; D'))
  it('따옴표 · 숫자 엔티티도 같은 렌더', () => same('"A" &quot;B&quot; &#39;C&#39;'))
  it('글자로 친 <br>', () => same('앞<br>뒤'))
})

describe('라운드트립 — Markdown 이스케이프 글자', () => {
  it('별 · 밑줄 · 대괄호 · 물결 · 역슬래시', () =>
    same('2*3=6, snake_case, [대괄호], ~물결~, C:\\\\경로'))
  it('물결 하나는 글자', () => same('~하나~ 와 ~~둘~~'))
  it('원문의 역슬래시 이스케이프', () => same('\\*별 아님\\* \\_밑줄 아님\\_'))
})

describe('라운드트립 — 원문의 줄머리 이스케이프는 지킨다(A6 — 전에는 풀려 목록 · 제목이 됐다)', () => {
  it('번호 아님', () => same('1\\. 번호 아님'))
  it('괄호 번호 아님', () => same('1\\) 번호 아님'))
  it('제목 아님', () => same('\\# 제목 아님'))
  it('글머리 아님', () => same('\\- 글머리 아님\n\n\\+ 더하기 아님'))
  it('줄바꿈 뒤 setext 밑줄 아님', () => same('앞\n\\---\n\n뒤\n\\==='))
  it('한국식 날짜', () => same('2026\\. 11\\. 7\\. UFC 322'))
  it('목록 항목 안의 번호 모양 글자 — 항목 표지는 그대로', () => same('- a\n- 1\\. b'))
  it('인용 안의 글머리 모양 글자', () => same('> \\- 인용 속 글자'))
})

describe('라운드트립 — 취소선(A2 — `~~` 만)', () => {
  it('물결 둘은 취소선', () => same('~~취소~~'))
})

describe('라운드트립 — 파이프 표는 글자로 보존(TipTap 에 표 확장이 없다)', () => {
  // 편집기에는 파이프 글자 문단, 렌더는 표 — 알려진 차이라 둘째 오라클은 끈다
  it('표 원문이 그대로 남아 렌더가 같다', () =>
    same('| 선수 | 전적 |\n|---|---|\n| A | 10-2 |\n| B | 8-4 |', { structure: false }))
  it('바깥 파이프 없는 표 — 구분 줄 `--- | ---` 는 줄머리 이스케이프가 건드리지 않는다', () =>
    same('선수 | 전적\n--- | ---\nA | 10-2', { structure: false }))
})

describe('라운드트립 — 블록 서식', () => {
  it('제목 1~3', () => same('# 하나\n\n## 둘\n\n### 셋\n\n본문'))
  it('글머리 목록', () => same('- a\n- b\n- c'))
  it('별 글머리도 같은 렌더', () => same('* a\n* b'))
  it('번호 목록 · 시작 번호', () => same('3. a\n4. b'))
  it('중첩 목록', () => same('- a\n  - a-1\n  - a-2\n- b'))
  it('인용', () => same('> 한 줄\n> 두 줄'))
  it('인용 안 목록', () => same('> - a\n> - b'))
  it('구분선', () => same('위\n\n---\n\n아래'))
  it('코드 블록(언어)', () => same('```js\nconst a = 1\n```'))
  it('코드 블록 안 Markdown 기호는 그대로', () => same('```\n**굵지 않음** <b>태그</b>\n```'))
  it('1) 번호 목록', () => same('1) a\n2) b'))
  it('+ 글머리', () => same('+ a\n+ b'))
  it('꼬리 # 제목', () => same('## 제목 ##'))
  it('setext 제목', () => same('제목\n===\n\n본문'))
})

describe('라운드트립 — 코드 블록 안 백틱 줄(스펙 A8)', () => {
  it('본문에 ``` 줄이 있는 펜스 — 펜스가 하나 길어진다', () => same('````\n```\ninner\n```\n````'))
  it('언어도 남는다', () => same('`````md\n````\n안\n````\n`````'))
  it('붙여넣은 <pre> 의 ``` 줄', () => {
    const out = md.fromHtml('<pre><code>```\nx\n```</code></pre>')
    expect(out).toBe('````\n```\nx\n```\n````')
    sameStructure(out)
    expect(md.roundTrip(out)).toBe(out)
  })
})

describe('라운드트립 — 인라인 서식 · 링크', () => {
  it('굵게 · 기울임 · 취소선 · 코드', () => same('**굵게** *기울임* ~~취소~~ `코드`'))
  it('밑줄 식 강조도 같은 렌더', () => same('__굵게__ _기울임_'))
  it('링크', () => same('[링사이드](https://ringside.example) 보기'))
  it('링크 제목', () => same('[a](https://example.com "제목")'))
  it('맨 URL(자동 링크)', () => same('주소 https://example.com/path?q=1 끝'))
  it('꺾쇠 자동 링크', () => same('<https://example.com>'))
  it('링크 안 서식', () => same('[**굵은 링크**](https://example.com)'))
})

describe("라운드트립 — 코드와 겹친 서식(`Code.extend({ excludes: 'code' })` — 스펙 A3)", () => {
  it('기울인 코드', () => same('*`x`*'))
  it('굵은 글 속 코드', () => same('**굵은 `코드`**'))
  it('코드 링크', () => same('[`코드 링크`](https://example.com)'))
})

describe('빈 문단 — 렌더에도 빈 줄(스펙 A7 — ⑦)', () => {
  it('가운데 빈 문단은 &nbsp; 문단 — 렌더 <p> 셋, 다시 열면 빈 문단', () => {
    const out = md.fromHtml('<p>a</p><p></p><p>b</p>')
    expect(out).toBe('a\n\n&nbsp;\n\nb')
    sameStructure(out)
    expect(renderMarkdown(out).match(/<p>/g)).toHaveLength(3)
    expect(md.roundTrip(out)).toBe(out)
    expect(md.html()).toBe('<p>a</p><p></p><p>b</p>')
  })

  it('빈 문단 둘은 &nbsp; 둘', () => {
    const out = md.fromHtml('<p>a</p><p></p><p></p><p>b</p>')
    expect(out).toBe('a\n\n&nbsp;\n\n&nbsp;\n\nb')
    sameStructure(out)
    expect(md.roundTrip(out)).toBe(out)
    expect(md.html()).toBe('<p>a</p><p></p><p></p><p>b</p>')
  })

  it('첫머리 빈 문단도 &nbsp;', () => {
    const out = md.fromHtml('<p></p><p>a</p>')
    expect(out).toBe('&nbsp;\n\na')
    sameStructure(out)
    expect(md.roundTrip(out)).toBe(out)
  })

  it('인용 안 빈 문단도 &nbsp;', () => {
    const out = md.fromHtml('<blockquote><p>q</p><p></p><p>r</p></blockquote>')
    expect(out).toBe('> q\n>\n> &nbsp;\n>\n> r')
    sameStructure(out)
    expect(md.roundTrip(out)).toBe(out)
    stableOver(out)
  })

  it('🔴 목록 안 빈 문단은 적지 않는다 — 항목 끝 빈 줄이 바깥으로 새어 다음 저장에 &nbsp; 로 렌더되지 않는다', () => {
    for (const [html, expected] of [
      ['<ul><li><p>a</p><p></p><p>b</p></li></ul>', '- a\n\n  b'],
      ['<ul><li><p>b</p><p></p></li></ul><p>c</p>', '- b\n\nc'],
      ['<ol><li><p>b</p><p></p></li></ol><p>c</p>', '1. b\n\nc'],
      ['<blockquote><ul><li><p>b</p><p></p></li></ul></blockquote>', '> - b'],
      [
        '<ul><li><p>a</p><blockquote><p>q</p><p></p></blockquote></li></ul>',
        '- a\n  > q\n  >\n  >',
      ],
    ] as const) {
      const out = md.fromHtml(html)
      expect(out, html).toBe(expected)
      expect(renderMarkdown(out), html).not.toMatch(/<p>[\s\u00a0]*<\/p>/)
      expect(stableOver(out)[1], html).toBe(out)
    }
  })

  it('목록 항목의 첫 빈 문단은 기본대로 `- ` · `1. ` — &nbsp; 면 촘촘한 항목이 글자로 되읽는다. 렌더에서도 빈 글머리', () => {
    for (const [html, expected, published] of [
      [
        '<ul><li><p>a</p></li><li><p></p></li></ul>',
        '- a\n- ',
        '<ul>\n<li>a</li>\n<li></li>\n</ul>\n',
      ],
      [
        '<ol><li><p></p></li><li><p>b</p></li></ol>',
        '1. \n2. b',
        '<ol>\n<li></li>\n<li>b</li>\n</ol>\n',
      ],
    ] as const) {
      const out = md.fromHtml(html)
      expect(out, html).toBe(expected)
      expect(renderMarkdown(out), html).toBe(published)
      sameStructure(out)
    }
    expect(md.roundTrip('- a\n- ')).toBe('- a\n- ')
  })

  it('빈 문서는 빈 값', () => {
    expect(md.fromHtml('<p></p>')).toBe('')
    expect(md.fromHtml('<p></p><p></p>')).toBe('')
  })
})

describe('셋째 오라클 — 중첩 목록은 여러 번 저장해도 그대로(스펙 A9 — ⑨ TipTap 번호 목록 토크나이저)', () => {
  // @tiptap/extension-list 3.32.0 번호 목록 토크나이저는 중첩 항목의 둘째 문단부터 한 칸 어긋나게 넘기고(저장마다 들여쓰기가 쌓여
  // 4칸이면 코드 블록, 그다음 사라졌다), 글머리 안 번호 목록 항목의 둘째 문단부터는 블록 `text` 토큰으로 보내 엔티티 · 이스케이프를
  // 풀지 않았다(저장마다 `&amp;amp;` · `\\\*`). EditorParagraph 관용 읽기 · EditorText 가 막는다
  it.each([
    ['번호 안 글머리 — 둘째 문단', '1. a\n   - b\n\n     c', '1. a\n   - b\n   \n     c'],
    ['번호 항목 둘째 문단', '1. a\n\n   b\n2. c', '1. a\n\n   b\n2. c'],
    ['글머리 안 번호 — 둘째 문단', '- a\n  1. b\n\n     c', '- a\n  1. b\n  \n     c'],
    ['옛 &nbsp; 문단(번호 항목 안)', '1. a\n\n   &nbsp;\n\n   b', '1. a\n\n   b'],
    ['옛 &nbsp; 문단(번호 안 글머리)', '1. a\n   - b\n   \n     &nbsp;', '1. a\n   - b'],
    ['들여쓰기 표지', '&#32;   네 칸', '&#32;   네 칸'],
    ['줄바꿈 뒤 들여쓰기 표지는 접힌다', 'a  \n&#32;   b', 'a  \nb'],
  ])('%s', (_label, source, once) => {
    expect(stableOver(source)[1]).toBe(once)
  })

  it.each([
    ['번호 안 글머리 · 둘째 문단', '<ol><li><p>a</p><ul><li><p>b</p><p>c</p></li></ul></li></ol>'],
    ['번호 안 글머리 · 빈 문단', '<ol><li><p>a</p><ul><li><p>b</p><p></p></li></ul></li></ol>'],
    [
      '번호 안 글머리 · 빈 문단 뒤 문단',
      '<ol><li><p>a</p><ul><li><p>b</p><p></p><p>c</p></li></ul></li></ol>',
    ],
    [
      '글머리 안 번호 · 둘째 문단',
      '<ul><li><p>a</p><ol><li><p>b</p><p>그냥 글</p></li></ol></li></ul>',
    ],
    ['글머리 안 번호 · 빈 문단', '<ul><li><p>a</p><ol><li><p>b</p><p></p></li></ol></li></ul>'],
    [
      '글머리 안 번호 · 둘째 문단의 엔티티 · 이스케이프',
      '<ul><li><p>a</p><ol><li><p>b</p><p>A &amp; B &lt;3 · 2*3 · [x] · a_b</p></li></ol></li></ul>',
    ],
    [
      '글머리 안 번호 · 둘째 문단 줄머리',
      '<ul><li><p>a</p><ol><li><p>b</p><p>1. 번호 아님</p></li></ol></li></ul>',
    ],
  ])('HTML %s', (_label, html) => {
    const out = md.fromHtml(html)
    const editorHtml = md.html()
    const passes = stableOver(out)
    expect(passes[1], html).toBe(out)
    // 글자가 저장마다 불어나지 않는다 — 다시 연 편집기도 처음과 같은 글자
    expect(md.html(), html).toBe(editorHtml.replace(/<p><\/p>/g, ''))
  })

  it('중첩 하위 항목 끝에 그림을 넣은 글 — 들여쓰기가 쌓여 뒤 블록이 코드 블록이 되거나 사라지지 않는다', () => {
    const editor = openEditor('1. 근거\n   - 하위 문장\n2. 둘째')
    insertImageAfter(editor, '하위 문장')
    const written = editor.getMarkdown()
    editor.destroy()
    expect(written).toBe(`1. 근거\n   - 하위 문장\n     ![](${IMG})\n2. 둘째`)
    const passes = stableOver(written)
    // 다시 열어도 그림은 따로 선 블록이다(읽기 정규화 — 전에는 앞 문단 안으로 들어가 스키마에 어긋났다)
    expect(passes[1]).toBe(written)
    expect(renderMarkdown(passes[1] ?? '')).toContain('<img')
  })
})

describe('읽기 정규화 — 글자와 한 문단에 든 그림은 따로 선 블록으로(스펙 A10 — ⑩ 스키마 유효 문서)', () => {
  // TipTap 은 `a\n![](…)` 의 그림을 문단 안 인라인으로 읽어 스키마에 어긋난 문서를 만들었다(enableContentCheck 꺼짐 — 말없이 받는다).
  // 그 문단을 고치면 TransformError — 하니스는 넣을 때마다 doc.check() 를 부르므로 아래 사례는 읽기만으로도 유효함이 확인된다
  it.each([
    ['옛 원고 — 글 줄바꿈 그림', `글\n![](${IMG})`, `글\n\n![](${IMG})`],
    ['옛 원고 — 문장 가운데 그림', `앞 ![](${IMG}) 뒤`, `앞\n\n![](${IMG})\n\n뒤`],
    ['옛 원고 — 그림 뒤 글', `![](${IMG}) 뒤`, `![](${IMG})\n\n뒤`],
    ['옛 원고 — 제목 속 그림', `## 제목 ![](${IMG})`, `## 제목\n\n![](${IMG})`],
    ['옛 원고 — 인용 속 줄바꿈 그림', `> 앞\n> ![](${IMG})`, `> 앞\n>\n> ![](${IMG})`],
    ['제목 붙은 그림 뒤 글', `![](${IMG} "t") 뒤`, `![](${IMG} "t")\n\n뒤`],
    ['연속 그림', `![](${IMG})\n![](${IMG})`, `![](${IMG})\n\n![](${IMG})`],
    ['글머리 항목 — 저장한 우리 출력', `- 경기 장면\n  ![](${IMG})`, `- 경기 장면\n  ![](${IMG})`],
    ['번호 항목 — 저장한 우리 출력', `1. 경기 장면\n   ![](${IMG})`, `1. 경기 장면\n   ![](${IMG})`],
    ['그림으로 시작하는 글머리 항목 — 그림을 표지 줄에', `- ![](${IMG})`, `- ![](${IMG})`],
  ])('%s', (_label, source, once) => {
    const passes = stableOver(source)
    expect(passes[1]).toBe(once)
    sameStructureOf(passes[1] ?? '')
  })

  /** 둘째 오라클을 문서 하나에 — 다시 읽은 편집기 HTML 과 그 렌더 */
  function sameStructureOf(markdown: string): void {
    md.roundTrip(markdown)
    const editorHtml = normalizeBlocks(md.html())
    // 목록 항목 안 그림은 TipTap 목록 직렬화가 한 줄로 붙여 적어 렌더에서는 줄바꿈 + 그림이다(K16) — 그 차이만 접고 견준다
    const published = normalizeBlocks(renderMarkdown(markdown)).replace(/<br>(?=<img)/g, '')
    expect(published, markdown).toBe(editorHtml)
  }

  /** 저장한 Markdown 을 새 편집기로 열어(첫 내용 경로) 항목 글자 안에서 타자 · 굵게를 해 본다 — 던지지 않고 문서가 유효하다 */
  function reopenAndEdit(saved: string, word: string): Editor {
    const editor = openEditor(saved)
    editor.state.doc.check()
    let at = -1
    editor.state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText && node.text?.includes(word) === true) at = pos + 1
    })
    expect(at, saved).toBeGreaterThan(0)
    expect(() => {
      editor.commands.setTextSelection(at)
      editor.commands.insertContent('x')
      editor.commands.setTextSelection({ from: at, to: at + 2 })
      editor.commands.toggleBold()
    }, saved).not.toThrow()
    editor.state.doc.check()
    return editor
  }

  it.each([
    ['글머리 항목 끝', '- 경기 장면\n- 다음', '경기 장면'],
    ['마지막 글머리 항목 끝', '- 경기 장면', '경기 장면'],
    ['번호 항목 끝', '1. 경기 장면\n2. 다음', '경기 장면'],
    ['중첩 하위 항목 끝', '1. 근거\n   - 하위\n2. 둘째', '하위'],
    ['맨 위 문단 끝', '경기 장면\n\n다음', '경기 장면'],
    ['인용 끝', '> 인용 글', '인용 글'],
  ])('%s에 그림을 넣고 저장 → 다시 열어 그 글자를 고쳐도 던지지 않는다', (_label, source, word) => {
    const first = openEditor(source)
    insertImageAfter(first, word)
    const saved = first.getMarkdown()
    first.destroy()
    const reopened = reopenAndEdit(saved, word)
    expect(reopened.getMarkdown()).toContain(`![](${IMG})`)
    reopened.destroy()
  })

  it('옛 원고 `글\\n![](…)` 을 열어 그 문단을 고쳐도 던지지 않는다(전에는 TransformError)', () => {
    reopenAndEdit(`경기 장면\n![](${IMG})`, '경기 장면').destroy()
    reopenAndEdit(`- 경기 장면\n  ![](${IMG})\n- 다음`, '경기 장면').destroy()
  })
})

describe('둘째 오라클 — 편집기 문서 → Markdown → 렌더의 구조가 편집기와 같다(A6)', () => {
  const PASTE = '경기 일정\n2026. 11. 7. UFC 322\n1. 존 존스 vs 은가누\n- 메인 이벤트\n# 기대 순위'

  it('글자 붙여넣기 — 날짜 · 번호 · 글머리 · 제목 모양 줄이 렌더에서도 문단이다', () => {
    const out = md.pasteText(PASTE)
    expect(out).toBe(
      '경기 일정\n\n2026\\. 11. 7. UFC 322\n\n1\\. 존 존스 vs 은가누\n\n\\- 메인 이벤트\n\n\\# 기대 순위',
    )
    sameStructure(out)
    expect(renderMarkdown(out)).not.toMatch(/<(?:ol|ul|h\d)/)
  })

  it('맨 URL 글자 붙여넣기 — 편집기도 링크로 잇는다(렌더 linkify 와 같다)', () => {
    const out = md.pasteText('주소 https://example.com 끝')
    expect(out).toBe('주소 [https://example.com](https://example.com) 끝')
    sameStructure(out)
  })

  it('들여쓴 글자 붙여넣기 — 렌더에서 코드 블록이 되지 않는다', () => {
    for (const text of ['    네 칸 들여쓰기', '\t탭 들여쓰기', '앞\n    네 칸']) {
      const out = md.pasteText(text)
      sameStructure(out)
      expect(renderMarkdown(out), text).not.toContain('<pre')
      expect(md.roundTrip(out), text).toBe(out)
    }
  })

  it.each([
    '<p>1. 하나</p>',
    '<p>1) 하나</p>',
    '<p>앞<br>---</p>',
    '<p>앞<br>===</p>',
    '<p>앞<br>1. 존 존스<br>2. 은가누</p>',
    '<p>앞<br>- 하나<br>- 둘</p>',
    '<p>+ 더하기</p>',
    '<p>- </p>',
    '<p># 제목 같은 글</p>',
    '<p>> 인용 아님</p>',
    '<p>앞<br>> 인용 아님</p>',
    '<p>a<br>***</p>',
    '<p>a<br>```</p>',
    '<p>a<br>~~~</p>',
    '<p>[참조]: /경로</p>',
    '<ul><li><p>1. 항목 속 번호</p></li><li><p>- 항목 속 글머리</p></li></ul>',
    '<blockquote><p># 인용 속 제목 모양</p></blockquote>',
    '<ol><li><p>a</p><ul><li><p>b</p></li></ul></li></ol>',
  ])('HTML %s', (html) => {
    const out = md.fromHtml(html)
    sameStructure(out)
    expect(md.roundTrip(out), `멱등 — ${html}`).toBe(out)
  })

  it('좋은 입력 — 문단 · 목록 · 제목 · 인용 · 구분선은 그대로 통과한다(오라클이 거짓 경보를 내지 않는다)', () => {
    const out = md.fromHtml(
      '<h2>제목</h2><p>본문 <strong>굵게</strong> <a href="https://example.com">링크</a></p><ul><li><p>하나</p></li><li><p>둘</p></li></ul><ol start="3"><li><p>셋</p></li></ol><blockquote><p>인용</p></blockquote><hr><p>끝</p>',
    )
    expect(out).toBe(
      '## 제목\n\n본문 **굵게** [링크](https://example.com)\n\n- 하나\n- 둘\n\n3. 셋\n\n> 인용\n\n---\n\n끝',
    )
    sameStructure(out)
  })
})

describe('라운드트립 — 그림은 보존한다(스펙 A4 — 킷은 거르지 않는다)', () => {
  it('외부 그림이 그대로 남는다', () => same(`앞\n\n![](${IMG})\n\n뒤`))
  it('alt · title 도 남는다', () => same(`![사진](${IMG} "제목")`))
  it('붙여넣은 <img> 는 노드가 된다 — alt · title 을 지킨다', () => {
    expect(md.fromHtml(`<p>앞</p><img src="${IMG}" alt="a" title="t"><p>뒤</p>`)).toBe(
      `앞\n\n![a](${IMG} "t")\n\n뒤`,
    )
  })
  it('K5′ Markdown 의 data: 그림은 보존되고(렌더 같음), 붙여넣은 HTML 의 data: <img> 는 들어오지 않는다(allowBase64 기본 false — 실측 고정)', () => {
    same('![x](data:image/png;base64,AAAA)')
    expect(md.html()).toBe('<img src="data:image/png;base64,AAAA" alt="x">')
    expect(md.fromHtml('<p>앞</p><img src="data:image/png;base64,AAAA"><p>뒤</p>')).toBe('앞\n\n뒤')
  })
})

describe('Image 입력 규칙 — 켜 둔다(결정 ②): `![alt](src)` 를 치면 그림 노드', () => {
  it('문단에 친 `![x](주소)` 가 그림 노드가 되고 문서가 유효하다', () => {
    const editor = openEditor('앞')
    editor.commands.setTextSelection(2)
    // 입력 규칙은 마지막 글자를 "친" 트랜잭션에서 돈다 — 앞부분을 넣고 `)` 를 handleTextInput 으로 친다(브라우저 타자와 같은 길).
    // Image 의 규칙은 앞이 줄머리나 공백이어야 맞는다(`(?:^|\s)`)
    editor.commands.insertContent(` ![x](${IMG}`)
    const { from } = editor.state.selection
    const handled = editor.view.someProp('handleTextInput', (f) => f(editor.view, from, from, ')'))
    expect(handled, '가드 — 입력 규칙이 받았다').toBe(true)
    editor.state.doc.check()
    let images = 0
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') images += 1
    })
    expect(images).toBe(1)
    const written = editor.getMarkdown()
    expect(written).toContain(`![x](${IMG})`)
    expect(renderMarkdown(written)).toContain(`<img src="${IMG}" alt="x">`)
    // handleTextInput 모사에서는 친 `)` 가 뒤 문단에 남는다(`앞 \n\n![x](…)\n\n)`) — 실브라우저에서 꼬리가 남는지는 사람 확인 항목
    expect(md.roundTrip(written)).toBe(written)
    editor.destroy()
  })
})

describe('🔴 구현 함정 고정(보고문 「웹 구현에서 검증한 것」)', () => {
  it('marked 전역 싱글턴을 오염시키지 않는다 — 편집기를 만들어도 marked.defaults.breaks 는 기본값', () => {
    const before = marked.defaults.breaks
    const other = createMarkdownHarness(mountHost())
    other.roundTrip('a\nb')
    expect(marked.defaults.breaks).toBe(before)
    expect(marked.defaults.tokenizer).toBeNull()
    other.destroy()
  })

  it('토크나이저가 옵션 경로로 먹는다 — 원문 HTML 이 글자', () => {
    expect(md.roundTrip('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;')
  })

  it('trailingNode 없음 — 구분선 · 그림으로 끝나는 문서의 왕복이 `\\n\\n` 을 덧붙이지 않는다', () => {
    expect(md.roundTrip('위\n\n---')).toBe('위\n\n---')
    expect(md.roundTrip(`위\n\n![](${IMG})`)).toBe(`위\n\n![](${IMG})`)
  })

  it('Code 는 다른 마크와 겹친다(excludes: code) — 링크 걸린 코드가 링크를 잃지 않는다', () => {
    const once = md.roundTrip('[`코드`](https://example.com)')
    expect(renderMarkdown(once)).toContain('<a href="https://example.com"><code>코드</code></a>')
  })
})

describe('라운드트립 — 알려진 차이(기대 출력 명시 — 스펙 §2-4)', () => {
  it('K4 할 일 목록 표시 [ ] 는 사라진다 — markdown-it 기본에 없고 TipTap 은 목록으로 읽는다', () => {
    expect(md.roundTrip('- [ ] 할 일')).toBe('- 할 일')
  })

  it('K4 체크한 할 일 표시 [x] 도 사라진다 — 옛 렌더에는 `[x]` 글자가 보였다', () => {
    const source = '- [x] 끝'
    expect(renderMarkdown(source)).toBe('<ul>\n<li>[x] 끝</li>\n</ul>\n')
    const once = md.roundTrip(source)
    expect(once).toBe('- 끝')
    expect(md.html()).toBe('<ul><li><p>끝</p></li></ul>')
    expect(renderMarkdown(once)).toBe('<ul>\n<li>끝</li>\n</ul>\n')
    expect(md.roundTrip(once)).toBe(once)
  })

  it('K22 링크 걸린 그림(옛 원고만 — 편집기는 만들 수 없다)은 링크를 잃는다 — 정규화가 따로 선 그림의 마크를 뗀다', () => {
    const source = `[![](${IMG})](https://example.com)`
    expect(renderMarkdown(source)).toBe(
      `<p><a href="https://example.com"><img src="${IMG}" alt=""></a></p>\n`,
    )
    const once = md.roundTrip(source)
    expect(once).toBe(`![](${IMG})`)
    expect(renderMarkdown(once)).toBe(`<p><img src="${IMG}" alt=""></p>\n`)
    expect(md.roundTrip(once)).toBe(once)
  })

  it('K1 이름 있는 엔티티(&copy; 등)는 글자로 남는다 — marked 는 기본 엔티티만 풀고 markdown-it 은 전부 푼다', () => {
    const once = md.roundTrip('A &copy; B')
    expect(once).toBe('A &amp;copy; B')
    expect(renderMarkdown(once)).toBe('<p>A &amp;copy; B</p>\n')
  })

  it('K2 문단 가운데 홀로 선 블록 태그 줄은 문단을 가른다(렌더는 <br>)', () => {
    const source = '앞\n<div>안</div>\n뒤'
    expect(renderMarkdown(source)).toBe('<p>앞<br>\n&lt;div&gt;안&lt;/div&gt;<br>\n뒤</p>\n')
    const once = md.roundTrip(source)
    expect(once).toBe('앞\n\n&lt;div&gt;안&lt;/div&gt;  \n뒤')
    expect(renderMarkdown(once)).toBe('<p>앞</p>\n<p>&lt;div&gt;안&lt;/div&gt;<br>\n뒤</p>\n')
  })

  it('K3 취소선 안 서식은 중첩 순서가 뒤집힌다 — 보이는 모양은 같다', () => {
    const once = md.roundTrip('~~**굵은 취소**~~')
    expect(once).toBe('**~~굵은 취소~~**')
    expect(renderMarkdown(once)).toBe('<p><strong><s>굵은 취소</s></strong></p>\n')
  })

  it('🔴 K6 문서 끝 빈 문단은 `""` — Enter 로 끝낸 글은 끝 빈 줄을 렌더하지 않는다(편집기에만 보인다)', () => {
    const out = md.fromHtml('<p>a</p><p></p>')
    expect(out).toBe('a\n\n')
    expect(renderMarkdown(out)).toBe('<p>a</p>\n')
    // 다시 열어도 값이 같다 — 이탈 확인이 켜지지 않는다
    expect(md.roundTrip(out)).toBe(out)
    expect(md.html()).toBe('<p>a</p><p></p>')
  })

  it('K7 옛 원고의 빈 줄 여럿은 편집기에 빈 문단으로 보이고, 다시 저장하면 &nbsp; 문단으로 렌더된다', () => {
    const source = 'a\n\n\n\nb'
    expect(renderMarkdown(source)).toBe('<p>a</p>\n<p>b</p>\n')
    const once = md.roundTrip(source)
    expect(md.html()).toBe('<p>a</p><p></p><p>b</p>')
    expect(once).toBe('a\n\n&nbsp;\n\nb')
    sameStructure(once)
  })

  it('K8 느슨한 목록은 촘촘한 목록이 된다 — 항목 간격만 다르다', () => {
    const once = md.roundTrip('- a\n\n- b')
    expect(once).toBe('- a\n- b')
    expect(renderMarkdown(once)).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n')
  })

  it('K9 글머리 기호가 바뀌는 이웃 목록은 편집기에 목록 둘, 렌더에는 느슨한 목록 하나', () => {
    const once = md.roundTrip('- a\n* b')
    expect(md.html()).toBe('<ul><li><p>a</p></li></ul><ul><li><p>b</p></li></ul>')
    expect(once).toBe('- a\n\n- b')
    expect(renderMarkdown(once)).toBe(
      '<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n',
    )
  })

  it('K10 줄바꿈을 가로지르는 굵게는 줄마다 나뉜다 — 보이는 모양은 같다', () => {
    const once = md.roundTrip('**a\nb**')
    expect(once).toBe('**a**  \n**b**')
    expect(renderMarkdown(once)).toBe('<p><strong>a</strong><br>\n<strong>b</strong></p>\n')
  })

  it('K11 문단 끝 줄바꿈(`a  \\n`)은 글자 끝 공백 둘로 남는다 — 편집기 · 렌더 둘 다 보이지 않는다', () => {
    const once = md.roundTrip('a  \n')
    expect(once).toBe('a  ')
    expect(md.html()).toBe('<p>a  </p>')
    expect(renderMarkdown(once)).toBe('<p>a</p>\n')
  })

  it('K12 맨 www 주소는 편집기가 링크로 읽어 http:// 링크 문법으로 바뀐다 — 옛 렌더는 글자(linkify 는 www 를 잇지 않는다)', () => {
    const source = 'www.example.com'
    expect(renderMarkdown(source)).toBe('<p>www.example.com</p>\n')
    const once = md.roundTrip(source)
    expect(once).toBe('[www.example.com](http://www.example.com)')
    sameStructure(once)
  })

  it('🔴 K15 목록 안 빈 줄(빈 문단)은 편집기에만 보이고 다시 열면 사라진다 — 렌더에도 없다', () => {
    const out = md.fromHtml('<ol><li><p>a</p><p></p><p>b</p></li></ol>')
    expect(md.html()).toBe('<ol><li><p>a</p><p></p><p>b</p></li></ol>')
    expect(out).toBe('1. a\n\n   b')
    expect(renderMarkdown(out)).toBe('<ol>\n<li>\n<p>a</p>\n<p>b</p>\n</li>\n</ol>\n')
    md.roundTrip(out)
    expect(md.html()).toBe('<ol><li><p>a</p><p>b</p></li></ol>')
  })

  it('K16 목록 항목 안 문단 바로 뒤 그림은 한 줄로 붙여 적힌다 — 렌더는 줄바꿈 + 그림, 편집기는 따로 선 그림(읽기 정규화)', () => {
    const out = md.fromHtml(`<ul><li><p>b</p><img src="${IMG}"></li></ul>`)
    expect(out).toBe(`- b\n  ![](${IMG})`)
    expect(md.roundTrip(out)).toBe(out)
    // 전에는 다시 열면 그림이 그 문단 안 인라인으로 들어가 스키마에 어긋났고, 그 글자를 고치면 TransformError 를 던졌다
    expect(md.html()).toMatch(/^<ul><li><p>b<\/p><img [^>]*><\/li><\/ul>$/)
    expect(renderMarkdown(out)).toMatch(/^<ul>\n<li>b<br>\n<img [^>]*><\/li>\n<\/ul>\n$/)
  })

  it('K18 맨 위 `글\\n![](…)`(옛 원고)은 고쳐 저장하면 문단 + 따로 선 그림으로 렌더된다 — 편집기가 보이는 두 블록과 같다', () => {
    const source = `a\n![](${IMG})`
    expect(renderMarkdown(source)).toMatch(/^<p>a<br>\n<img [^>]*><\/p>\n$/)
    const once = md.roundTrip(source)
    expect(once).toBe(`a\n\n![](${IMG})`)
    expect(renderMarkdown(once)).toMatch(/^<p>a<\/p>\n<p><img [^>]*><\/p>\n$/)
  })

  it('K19 빈 첫 줄 뒤 문단이 있는 목록 항목은 빈 줄을 버린다 — `- \\n\\n  b` 면 b 가 목록을 떠난다(CommonMark 빈 첫 줄 규칙)', () => {
    const out = md.fromHtml('<ul><li><p></p><p>b</p></li></ul>')
    expect(out).toBe('- b')
    expect(stableOver(out)[1]).toBe('- b')
  })

  it('K20 빈 문단으로 갈라 둔 이웃 하위 목록은 한 목록으로 합쳐진다(목록 안 빈 줄은 편집기에만 — K15)', () => {
    const out = md.fromHtml(
      '<ul><li><p>a</p><ul><li><p>x</p></li></ul><p></p><ul><li><p>y</p></li></ul></li></ul>',
    )
    expect(out).toBe('- a\n  - x\n  - y')
    md.roundTrip(out)
    expect(md.html()).toBe('<ul><li><p>a</p><ul><li><p>x</p></li><li><p>y</p></li></ul></li></ul>')
  })

  it('K21 인용 끝에 그림을 넣으면 `> ![](…)` 로 적힌다 — 인용 안이라 다시 열어도 그대로', () => {
    const editor = openEditor('> 인용 글')
    insertImageAfter(editor, '인용 글')
    const saved = editor.getMarkdown()
    editor.destroy()
    expect(saved).toBe(`> 인용 글\n>\n> ![](${IMG})`)
    expect(stableOver(saved)[1]).toBe(saved)
  })

  it('K17 옛 &nbsp; 문단이 글머리 안 번호 항목의 둘째 문단이면 한 번 글자로 남는다 — 그 뒤로는 그대로(이 갈래는 문단 읽기를 거치지 않는다)', () => {
    const passes = stableOver('- a\n  1. b\n  \n     &nbsp;')
    expect(passes[1]).toBe('- a\n  1. b\n  \n     &amp;nbsp;')
  })

  it('K14 첫 항목이 빈 글머리 목록은 다시 열면 모양이 바뀐다 — marked 파서 한계(번호 목록은 읽기 정규화로 그대로)', () => {
    // 번호 목록: 빈 첫 항목이 문단 없는(스키마에 어긋난) 항목으로 읽혔다 — 읽기 정규화가 빈 문단을 채워 그대로 남는다
    expect(md.roundTrip('1. \n2. b')).toBe('1. \n2. b')
    expect(md.html()).toBe('<ol><li><p></p></li><li><p>b</p></li></ol>')
    // 글머리 목록: marked 가 첫 `- ` 를 문단 글자로 읽는다 — 편집기 · 렌더 둘 다 `-` 문단 + 목록(둘째 오라클은 같다)
    const bullet = md.roundTrip('- \n- b')
    expect(bullet).toBe('\\- \n\n- b')
    expect(md.html()).toBe('<p>- </p><ul><li><p>b</p></li></ul>')
    sameStructure(bullet)
  })

  it('K13 붙여넣은 링크 주소의 공백은 인코딩하지 않는다 — 렌더에서 링크가 끊긴다(대화상자로 건 링크만 인코딩)', () => {
    const out = md.fromHtml('<p><a href="https://example.com/a b">공백 링크</a></p>')
    expect(out).toBe('[공백 링크](https://example.com/a b)')
    expect(renderMarkdown(out)).not.toContain('>공백 링크</a>')
  })
})
