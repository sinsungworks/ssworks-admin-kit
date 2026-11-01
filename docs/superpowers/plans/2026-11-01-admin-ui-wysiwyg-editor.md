# admin-ui `MarkdownEditor` WYSIWYG 전환 구현 플랜 (PR #3j)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `MarkdownEditor`(CodeMirror 6)를 TipTap 3 + `@tiptap/markdown` WYSIWYG + 「원문」 전환으로 바꾸되 공개 API(props 넷 · `update:modelValue` Markdown 문자열)와 `LegalDocumentEditor` · 소비자 코드는 그대로 둔다.

**Architecture:** 어댑터(marked 토크나이저 · TipTap 확장 `.extend` · 읽기 정규화)는 Vue 무의존 순수 모듈 `editor-markdown.ts` · `editor-markdown-normalize.ts` 에 두고(ringside 코드 이식), 화면 `MarkdownEditor.vue` 는 그 확장 묶음으로 `@tiptap/vue-3` `Editor` 를 호스트 `<div>` 에 직접 마운트한다. emit 은 200ms 트레일링 디바운스 + flush(blur · 전환 · readonly · 언마운트), 외부 변경은 `setContent` 뒤 `EditorState.create` 로 되돌리기 기록을 비운다. 테스트는 happy-dom `<div>` 에 마운트한 하니스가 오라클 넷(렌더 동일 · 구조 · 4회 왕복 · `doc.check()`)을 건다.

**Tech Stack:** Vue 3 · Vuetify 4 · `@tiptap/*` 3.32.0(core · pm · vue-3 · starter-kit · markdown · extension-image · extension-code · extension-paragraph · extension-document · extension-code-block · extension-list · extension-text) · `marked` 17 · vitest 5 + happy-dom · admin-shared `renderMarkdown`.

**스펙:** `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md`(결정 번호 W · A · 경계 ①~⑥ 은 거기 것). **정본(이식 원본):** `C:\workspace\ringside-lanes\p1d\apps\web\app\utils\editor-markdown.ts` · `editor-markdown-normalize.ts` · `editor-markdown.test.ts` · `editor-markdown-normalize.test.ts`(11/3 뒤에는 `C:\workspace\ssworks-ringside` `main` 같은 경로). 읽기만 한다.

**규약 요약(CLAUDE.md):** prettier(세미콜론 없음 · 작은따옴표 · 100자 · `vueIndentScriptAndStyle`), `import type` 분리, 내부 상대 import 는 `.js` 확장자, `.vue` 는 그대로, `console.log` 금지, Vuetify 는 `vuetify/components` 명시 import, 테스트 머리 `// @vitest-environment happy-dom`, 오버레이 테스트는 `installVisualViewport()` 모듈 최상단, `data-testid` 금지. 커밋은 한국어 conventional commits + `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. 브랜치 `feat/admin-ui-wysiwyg-editor`(스펙 커밋 `2882df6` 이 첫 커밋). Windows 에서 `> /dev/null` 금지.

**파일 구조:**

| 파일                                                                     | 책임                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `packages/admin-ui/src/components/markdown/editor-markdown-normalize.ts` | 읽은 문서 JSON 정규화(⑩) — 순수 함수                                                      |
| `packages/admin-ui/src/components/markdown/editor-markdown.ts`           | marked 옵션 · 토크나이저 · TipTap 확장 `.extend` · `normalizeLinkHref` · 확장 묶음 팩토리 |
| `packages/admin-ui/src/components/markdown/markdown-editor.ts`           | 타입 · 기본 문구 · 디바운스 상수                                                          |
| `packages/admin-ui/src/components/markdown/MarkdownLinkDialog.vue`       | 링크 대화상자(내부)                                                                       |
| `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`           | 화면 — 도구 막대 · 모드 · emit · 외부 변경                                                |
| `packages/admin-ui/src/test/markdown-harness.ts`                         | 시험 하니스 + 오라클 도우미                                                               |
| `packages/admin-ui/src/components/markdown/*.test.ts`                    | 어댑터 · 왕복 · 정규화 · 편집기 render 테스트                                             |

---

### Task 1: 의존성 교체 · 탐침

**Files:**

- Modify: `packages/admin-ui/package.json`
- Modify: `packages/admin-ui/vite.config.ts:31-42`
- Create(임시): `packages/admin-ui/src/components/markdown/tiptap-probe.test.ts`

- [ ] **Step 1: package.json 의 peer · dev 의존을 바꾼다**

`peerDependencies` 를 아래로 통째로 바꾼다(알파벳 순):

```json
  "peerDependencies": {
    "@floating-ui/dom": "^1.0.0",
    "@he-tree/vue": "^2.10.5",
    "@ssworks/admin-shared": "workspace:>=0.4.0 <1.0.0",
    "@tiptap/core": "3.32.0",
    "@tiptap/extension-code": "3.32.0",
    "@tiptap/extension-code-block": "3.32.0",
    "@tiptap/extension-document": "3.32.0",
    "@tiptap/extension-image": "3.32.0",
    "@tiptap/extension-list": "3.32.0",
    "@tiptap/extension-paragraph": "3.32.0",
    "@tiptap/extension-text": "3.32.0",
    "@tiptap/markdown": "3.32.0",
    "@tiptap/pm": "3.32.0",
    "@tiptap/starter-kit": "3.32.0",
    "@tiptap/vue-3": "3.32.0",
    "axios": "^1.7",
    "marked": "^17.0.6",
    "pinia": "^4.0.0",
    "vue": "^3.5.0",
    "vue-router": "^4.5 || ^5",
    "vuetify": "^4.0.0"
  },
```

`devDependencies` 에서 `@codemirror/commands` · `@codemirror/state` · `codemirror` 세 줄을 지우고 아래를 더한다(알파벳 순 자리에):

```json
    "@floating-ui/dom": "^1.8.0",
    "@tiptap/core": "3.32.0",
    "@tiptap/extension-code": "3.32.0",
    "@tiptap/extension-code-block": "3.32.0",
    "@tiptap/extension-document": "3.32.0",
    "@tiptap/extension-image": "3.32.0",
    "@tiptap/extension-list": "3.32.0",
    "@tiptap/extension-paragraph": "3.32.0",
    "@tiptap/extension-text": "3.32.0",
    "@tiptap/markdown": "3.32.0",
    "@tiptap/pm": "3.32.0",
    "@tiptap/starter-kit": "3.32.0",
    "@tiptap/vue-3": "3.32.0",
    "marked": "^17.0.6",
```

`description` 끝에 ` · 마크다운 WYSIWYG 편집기(TipTap)` 를 덧붙이지 않는다(설명은 그대로).

- [ ] **Step 2: vite.config.ts external 을 바꾼다**

`/^codemirror$/,` · `/^@codemirror\//,` 두 줄을 지우고 그 자리에:

```ts
        /^@tiptap\//,
        'marked',
        /^@floating-ui\//,
```

- [ ] **Step 3: 설치**

Run: `pnpm install`
Expected: `Done` · `@tiptap/*` 열둘 3.32.0 · `marked 17.x` · `@floating-ui/dom 1.8.x` 가 admin-ui 에 들어오고 peer 경고 없음. pnpm 12 의 `minimumReleaseAge` 에 걸리면(3.32.0 은 2주 넘었다 — 걸릴 일 없음) 사람에게 알린다.

- [ ] **Step 4: 탐침 테스트를 쓴다**

`packages/admin-ui/src/components/markdown/tiptap-probe.test.ts`:

```ts
// @vitest-environment happy-dom
import { Editor } from '@tiptap/vue-3'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
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
```

- [ ] **Step 5: 탐침을 돌린다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/tiptap-probe.test.ts`
Expected: PASS. 실패가 `window`/`Range`/`Selection`/`MutationObserver` 쪽이면 `packages/admin-ui/package.json` 의 `happy-dom` 을 `^21.0.0` 으로 올리고 `pnpm install` 뒤 다시 돌린다(ringside 는 21.0.2 에서 확인). 그래도 실패면 멈추고 사람에게 알린다.

- [ ] **Step 6: 기존 CodeMirror 테스트 셋이 이제 깨지는 것을 확인하고 커밋**

Run: `pnpm --filter @ssworks/admin-ui test`
Expected: `codemirror.render.test.ts` · `markdown-editor.render.test.ts` · 약관 render 테스트 둘이 "Cannot find package 'codemirror'" 로 FAIL(뒤 Task 가 고친다). 탐침은 PASS.

```bash
git add packages/admin-ui/package.json packages/admin-ui/vite.config.ts pnpm-lock.yaml packages/admin-ui/src/components/markdown/tiptap-probe.test.ts
git commit -m "chore(admin-ui): CodeMirror peer 둘 → TipTap 3.32.0 열둘 · marked · @floating-ui/dom — 탐침 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 읽기 정규화 모듈(⑩) 이식

**Files:**

- Create: `packages/admin-ui/src/components/markdown/editor-markdown-normalize.ts`
- Create: `packages/admin-ui/src/components/markdown/editor-markdown-normalize.test.ts`

- [ ] **Step 1: 테스트를 옮긴다**

원본 `…/p1d/apps/web/app/utils/editor-markdown-normalize.test.ts`(101줄) 를 그대로 복사하고 다음만 바꾼다:

1. import 를 `import { splitImagesOutOfTextblocks } from './editor-markdown-normalize.js'` 로(`.js` 확장자).
2. `const img = (src = '/api/media/x.webp')` → `const img = (src = 'https://cdn.example.com/x.png')`.
3. `describe` 제목의 `(spec 4.2 ⑩)` → `(스펙 A10 — ⑩)`.
4. 파일 머리에 `// @vitest-environment happy-dom` 은 **달지 않는다**(순수 함수 — node 로 돈다).

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/editor-markdown-normalize.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 모듈을 옮긴다**

원본 `editor-markdown-normalize.ts`(115줄)를 그대로 복사하고 머리 주석만 아래로 바꾼다(코드는 한 글자도 바꾸지 않는다 — `import type { JSONContent } from '@tiptap/core'` 그대로):

```ts
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
```

- [ ] **Step 4: 통과 확인 · 커밋**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/editor-markdown-normalize.test.ts`
Expected: PASS 12.

```bash
git add packages/admin-ui/src/components/markdown/editor-markdown-normalize.ts packages/admin-ui/src/components/markdown/editor-markdown-normalize.test.ts
git commit -m "feat(admin-ui): 편집기 읽기 정규화 splitImagesOutOfTextblocks 이식(어댑터 ⑩)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 시험 하니스 + 왕복 테스트(이식)

**Files:**

- Create: `packages/admin-ui/src/test/markdown-harness.ts`
- Create: `packages/admin-ui/src/components/markdown/editor-markdown.test.ts`

- [ ] **Step 1: 하니스를 쓴다**

`packages/admin-ui/src/test/markdown-harness.ts`:

```ts
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
  /** 지금 문서의 편집기 HTML — 게시 렌더와 구조를 견줄 때 */
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
// 첫째 오라클(Markdown → 편집기 → Markdown 의 렌더가 같다)은 편집기 문서 → Markdown → 게시 렌더 쪽을 보지 못한다 — 글자로
// 붙여넣은 `1. 존 존스` 가 편집기에는 문단, 게시에는 목록이었다. 둘째 오라클은 편집기 HTML(getHTML)과 렌더의 블록 구조를 견준다.

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
      out += escapeText((child.textContent ?? '').replace(/[\s\u00a0]+/g, ' '))
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
```

- [ ] **Step 2: 왕복 테스트를 옮긴다 — 머리**

`packages/admin-ui/src/components/markdown/editor-markdown.test.ts` 머리:

```ts
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
// 어댑터를 하나씩 끄면 빨개지는 건수(구현 뒤 실측해 적는다): ⑥ 줄머리 이스케이프 __ · ⑨ 관용 읽기 __ · ⑩ 읽기 정규화 __.

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
```

- [ ] **Step 3: 왕복 테스트를 옮긴다 — 원본 묶음 대응표**

원본 `editor-markdown.test.ts` 의 `describe` 묶음을 아래 표대로 옮긴다. "그대로" 는 복사해 `renderPublicMarkdown` → `renderMarkdown`, `md.*` 호출은 그대로(이름이 같다), `MEDIA` → `IMG`, 주석의 `spec 4.2 ①` 식 참조는 `스펙 A1` 식으로 바꾼다는 뜻이다.

| 원본 묶음(줄)                       | 처리                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isMediaImageSrc`(142-172)          | **뺀다**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `normalizeLinkHref`(173-214)        | 그대로. 마지막 사례("인코딩한 주소로 건 링크는 게시 렌더에서 끊기지 않는다")도 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `openableLinkHref`(215-235)         | **뺀다**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `escapeLineStart`(236-326)          | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `codeFence`(327-339)                | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 라운드트립 — 문단 · 줄바꿈(340-350) | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 원문 HTML 은 글자(351-360)          | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 이스케이프 글자(361-367)            | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 줄머리 이스케이프 보존(368-378)     | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 취소선(379-382)                     | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 파이프 표(383-390)                  | 그대로(`same(…, { structure: false })`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 이미지(391-413)                     | **바꾼다** — Step 4 의 「그림 보존」 묶음으로 대체                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `MediaImage` 입력 규칙 끔(414-465)  | **바꾼다** — Step 4 의 「입력 규칙 켬」 묶음으로 대체                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 블록 서식(466-482)                  | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 코드 블록 백틱 줄(483-493)          | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 인라인 서식 · 링크(494-503)         | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 코드와 겹친 서식(504-509)           | 그대로(제목을 "코드와 겹친 서식(`Code.extend({ excludes: 'code' })` — 스펙 A3)" 로)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 빈 문단(510-587)                    | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 셋째 오라클 중첩 목록(588-657)      | 592-631 그대로. 633-656(`insertMediaImage`)은 `openEditor('1. 근거\n   - 하위 문장\n2. 둘째')` + `insertImageAfter(editor, '하위 문장')` 로 — 단 그림을 글자 **끝**에 넣으므로 기대는 `1. 근거\n   - 하위 문장\n     ![](${IMG})\n2. 둘째` 이고 `stableOver(written)[1] === written` · 렌더에 `<img` 포함을 본다                                                                                                                                                                                                                                                            |
| 읽기 정규화(659-758)                | 662-694 그대로(`MEDIA` → `IMG`). 696-757: `reopenAndEdit` 그대로, 723-752 의 `insertMediaImage(first, end, MEDIA)` → `insertImageAfter(first, word)`(선택 이동 줄은 지운다), 754-757 그대로                                                                                                                                                                                                                                                                                                                                                                                 |
| 둘째 오라클(760-821)                | 그대로                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| HTML 붙여넣기 — 이미지(823-839)     | **바꾼다** — Step 4 「그림 보존」 묶음에 합친다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 알려진 차이(841-1029)               | 842-847("문장 가운데 외부 이미지 …") **뺀다**(킷은 보존 — Step 4 에서 다룬다). 863-872(K22) 그대로(`MEDIA` → `IMG`, 렌더 기대의 ` loading="lazy"` 를 지운다 — 킷 renderMarkdown 은 `loading` 을 붙이지 않는다; 실측 값으로 고정). 957-972(K16 · K18) 그대로(`MEDIA` → `IMG`, 렌더 정규식은 그대로 맞는다). 989-1006(인용 끝 그림 — `insertMediaImage`) → `openEditor('> 인용 글')` + `insertImageAfter(editor, '인용 글')`, 기대 `> 인용 글\n>\n> ![](${IMG})`(킷은 그림 뒤 빈 문단을 만들지 않는다 — 넣기 도우미가 없다) · `stableOver(saved)[1] === saved`. 나머지 그대로 |

- [ ] **Step 4: 킷 고유 묶음을 더한다**

파일 끝에:

```ts
describe('라운드트립 — 그림은 보존한다(스펙 A4 — 킷은 거르지 않는다)', () => {
  it('외부 그림이 그대로 남는다', () => same(`앞\n\n![](${IMG})\n\n뒤`))
  it('alt · title 도 남는다', () => same(`![사진](${IMG} "제목")`))
  it('붙여넣은 <img> 는 노드가 된다 — alt · title 을 지킨다', () => {
    expect(md.fromHtml(`<p>앞</p><img src="${IMG}" alt="a" title="t"><p>뒤</p>`)).toBe(
      `앞\n\n![a](${IMG} "t")\n\n뒤`,
    )
  })
  it('K5′ data: 그림은 노드가 되지 않는다(allowBase64 기본 false) — 한 줄짜리는 alt 글자가 문단으로 남는다(기대 출력 고정)', () => {
    const once = md.roundTrip('![x](data:image/png;base64,AAAA)')
    expect(once).toBe('x')
    expect(md.fromHtml('<p>앞</p><img src="data:image/png;base64,AAAA"><p>뒤</p>')).toBe('앞\n\n뒤')
  })
})

describe('Image 입력 규칙 — 켜 둔다(결정 ②): `![alt](src)` 를 치면 그림 노드', () => {
  it('문단에 친 `![x](주소)` 가 그림 노드가 되고 문서가 유효하다', () => {
    const editor = openEditor('앞')
    editor.commands.setTextSelection(2)
    // 입력 규칙은 마지막 글자를 "친" 트랜잭션에서 돈다 — 앞부분을 넣고 `)` 를 handleTextInput 으로 친다
    editor.commands.insertContent(`![x](${IMG}`)
    const { from } = editor.state.selection
    editor.view.someProp('handleTextInput', (f) => f(editor.view, from, from, ')'))
    editor.state.doc.check()
    expect(editor.getMarkdown()).toBe(`앞\n\n![x](${IMG})`)
    expect(md.roundTrip(editor.getMarkdown())).toBe(editor.getMarkdown())
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
```

`normalizeBlocks` 를 import 했으니 쓰이지 않으면 import 에서 뺀다(원본 읽기 정규화 묶음의 `sameStructureOf` 가 쓴다 — 그대로 옮기면 쓰인다).

- [ ] **Step 5: 실패 확인**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/editor-markdown.test.ts`
Expected: FAIL — `./editor-markdown.js` 모듈 없음.

- [ ] **Step 6: 커밋(테스트만 — 다음 Task 가 초록으로 만든다)**

```bash
git add packages/admin-ui/src/test/markdown-harness.ts packages/admin-ui/src/components/markdown/editor-markdown.test.ts
git commit -m "test(admin-ui): 편집기 왕복 하니스 · 오라클 넷 · 픽스처 이식(아직 빨강)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 어댑터 모듈 `editor-markdown.ts` 이식

**Files:**

- Create: `packages/admin-ui/src/components/markdown/editor-markdown.ts`

- [ ] **Step 1: 모듈을 쓴다**

원본 `…/p1d/apps/web/app/utils/editor-markdown.ts` 를 바탕으로 아래 전문을 쓴다(원본에서 뺀 것: `isMediaImageSrc` · `openableLinkHref` · `MediaImage` · `EditorMarkdown` 하니스 · `Code`/`HorizontalRule` 미러링. 더한 것: `EditorCode` · `createMarkdownEditorExtensions`).

````ts
import { Extension, type Content, type JSONContent } from '@tiptap/core'
import Code from '@tiptap/extension-code'
import CodeBlock from '@tiptap/extension-code-block'
import Document from '@tiptap/extension-document'
import Image from '@tiptap/extension-image'
import { ListItem } from '@tiptap/extension-list'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Markdown, type MarkdownExtensionOptions } from '@tiptap/markdown'
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
/** Markdown 링크 대상 `[글](주소)` 를 끊는 글자 — @tiptap/markdown 은 주소를 그대로 적는다(꺾쇠 감싸기 없음) */
const HREF_BREAKING = /[\s()<>]/gu

/** encodeURIComponent 는 괄호를 남긴다 — 괄호만 손으로 */
function percentEncode(char: string): string {
  if (char === '(') return '%28'
  if (char === ')') return '%29'
  return encodeURIComponent(char)
}

/**
 * 링크 대화상자 주소(A11) — 다듬고, 스킴이 없으면 https://. 비면 null(링크를 지운다).
 * 안쪽 공백(전각 포함) · 괄호 · 꺾쇠는 퍼센트 인코딩한다 — 그대로 두면 직렬화한 `[글](주소)` 가 공백 · `)` 에서 끊겨 렌더가 링크를
 * 잃는다. 그 밖의 글자는 그대로(이미 인코딩된 `%xx` 도 두 번 인코딩하지 않는다)
 */
export function normalizeLinkHref(input: string): string | null {
  const value = input.trim()
  if (value === '') return null
  const href = HAS_SCHEME.test(value) ? value : `https://${value}`
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

/** 코드 마크가 굵게 · 기울임 · 링크와 겹친다(기본은 `excludes: '_'` — 전부 배제해 `[\`코드\`](url)` 가 링크를 잃었다) */
export const EditorCode = Code.extend({ excludes: 'code' })

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

/** 원문이 빈 문단 표지뿐인 문단 — 앞뒤 공백 · 줄바꿈이 붙어 와도(중첩 번호 목록 토크나이저가 한 칸 어긋나게 넘긴다) */
const EMPTY_PARAGRAPH_SOURCE = /^[ \t\n]*(?:&nbsp;| )[ \t\n]*$/
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
    Image,
    EditorDocument,
    EditorParagraph,
    EditorText,
    EditorListItem,
    EditorCodeBlock,
    ImageSplitOnParse,
  ]
}
````

- [ ] **Step 2: 테스트를 돌린다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/editor-markdown.test.ts`
Expected: 대부분 PASS. "기대 출력 고정" 사례(K5′ · K22 의 렌더 문자열 · 인용 끝 그림 · 입력 규칙)는 실측 값이 다를 수 있다 — **렌더가 안전하고(원문 HTML 이 글자) 구조가 맞으면** 실측 값으로 기대를 고치고 그 사례 주석에 "실측 고정" 을 적는다. 어댑터 묶음(①~③ · ⑤~⑩)의 사례가 빨가면 모듈 이식을 다시 본다(원본과 글자 대조).

- [ ] **Step 3: 어댑터를 하나씩 꺼 보고 건수를 적는다**

`createMarkdownEditorExtensions` 에서 `EditorParagraph` 의 `renderMarkdown` 줄머리 이스케이프(`.map(...)` 을 `out` 그대로 돌려주기) · `parseMarkdown` 관용 읽기(`return parsed`) · `ImageSplitOnParse`(배열에서 빼기)를 **각각** 임시로 끄고 테스트를 돌려 빨간 건수를 테스트 파일 머리 주석의 `__` 에 적는다. 끈 것은 되돌린다(`git diff` 로 모듈이 원래대로인지 본다).

- [ ] **Step 4: 탐침 삭제 · lint · 커밋**

`packages/admin-ui/src/components/markdown/tiptap-probe.test.ts` 를 지운다.

Run: `pnpm lint && pnpm --filter @ssworks/admin-ui typecheck`
Expected: 초록(편집기 render 테스트 셋의 codemirror import 오류는 남는다 — typecheck 가 그것으로 빨가면 Task 7 · 9 뒤에 다시 본다. `import type` 규칙 · `.js` 확장자 위반이 없어야 한다).

```bash
git add -A packages/admin-ui/src/components/markdown
git commit -m "feat(admin-ui): 마크다운 편집기 충실도 어댑터 이식(①~③ · ⑤~⑩ · Code excludes) — 왕복 픽스처 초록

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 타입 · 기본 문구 · export

**Files:**

- Create: `packages/admin-ui/src/components/markdown/markdown-editor.ts`
- Modify: `packages/admin-ui/src/index.ts:229-232`
- Modify: `packages/admin-ui/src/default-messages.test.ts:8-17`

- [ ] **Step 1: 테스트에 기본 문구를 더한다**

`default-messages.test.ts` 의 `DEFAULTS` 에 한 줄:

```ts
  DEFAULT_MARKDOWN_EDITOR_MESSAGES: kit.DEFAULT_MARKDOWN_EDITOR_MESSAGES,
```

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/default-messages.test.ts`
Expected: FAIL(또는 typecheck 오류) — export 없음.

- [ ] **Step 2: 모듈을 쓴다**

`packages/admin-ui/src/components/markdown/markdown-editor.ts`:

```ts
// 마크다운 편집기의 타입 · 기본 문구 · 상수. `MarkdownEditor.vue` 와 `MarkdownLinkDialog.vue` 가 쓴다(스펙 W13 · ③).

/** 편집 방식 — 서식(WYSIWYG) · 원문(Markdown textarea) */
export type MarkdownEditorMode = 'wysiwyg' | 'source'

export interface MarkdownEditorMessages {
  bold: string
  italic: string
  strike: string
  heading2: string
  heading3: string
  blockquote: string
  bulletList: string
  orderedList: string
  link: string
  horizontalRule: string
  undo: string
  redo: string
  /** 모드 토글의 두 단추 */
  modeWysiwyg: string
  modeSource: string
  /** 모드 토글의 접근 이름 */
  modeToggle: string
  /** 도구 막대의 접근 이름 — `label` 을 받는다 */
  toolbar: (label: string) => string
  linkTitle: string
  linkHref: string
  linkApply: string
  linkRemove: string
  linkCancel: string
  /** 링크 확장이 주소를 거부했을 때(`javascript:` 등) */
  linkInvalid: string
}

/** 기본 문구 — 공개(3i E1). 🔴 얼린다(E3) — 앱이 펼쳐 일부만 덮는다 */
export const DEFAULT_MARKDOWN_EDITOR_MESSAGES: Readonly<MarkdownEditorMessages> =
  Object.freeze<MarkdownEditorMessages>({
    bold: '굵게',
    italic: '기울임',
    strike: '취소선',
    heading2: '제목 2',
    heading3: '제목 3',
    blockquote: '인용',
    bulletList: '글머리 목록',
    orderedList: '번호 목록',
    link: '링크',
    horizontalRule: '구분선',
    undo: '되돌리기',
    redo: '다시 실행',
    modeWysiwyg: '서식',
    modeSource: '원문',
    modeToggle: '편집 방식',
    toolbar: (label) => `${label} 서식`,
    linkTitle: '링크',
    linkHref: '주소',
    linkApply: '적용',
    linkRemove: '링크 지우기',
    linkCancel: '취소',
    linkInvalid: '사용할 수 없는 주소입니다.',
  })

/**
 * 서식 모드 `update:modelValue` 트레일링 디바운스(ms — 스펙 결정 ③ · W3). 입력마다 `getMarkdown()` 전체 직렬화 + 부모 재렌더가
 * O(n) 이라 큰 본문(약관 상한 1,000,000자)에서 키 경로에서 뺀다. 포커스를 잃으면 · 원문으로 전환하면 · readonly 가 켜지면 ·
 * 언마운트하면 바로 flush 한다. 🔴 prop 이 아니다 — 0 을 줄 수 있으면 D3(같은 값 echo) 전제가 다시 성능과 충돌한다.
 */
export const MARKDOWN_EDITOR_EMIT_DELAY_MS = 200
```

- [ ] **Step 3: index.ts export**

`index.ts` 의 `export { default as MarkdownEditor } …` 줄 바로 아래에:

```ts
export {
  DEFAULT_MARKDOWN_EDITOR_MESSAGES,
  type MarkdownEditorMode,
  type MarkdownEditorMessages,
} from './components/markdown/markdown-editor.js'
```

- [ ] **Step 4: 통과 · 커밋**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/default-messages.test.ts`
Expected: PASS(아홉 항목).

```bash
git add packages/admin-ui/src/components/markdown/markdown-editor.ts packages/admin-ui/src/index.ts packages/admin-ui/src/default-messages.test.ts
git commit -m "feat(admin-ui): MarkdownEditor 기본 문구 · 모드 타입 · 디바운스 상수 export

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 링크 대화상자(내부 부품)

**Files:**

- Create: `packages/admin-ui/src/components/markdown/MarkdownLinkDialog.vue`
- Create: `packages/admin-ui/src/components/markdown/markdown-link-dialog.render.test.ts`

- [ ] **Step 1: 테스트를 쓴다**

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import { DEFAULT_MARKDOWN_EDITOR_MESSAGES } from './markdown-editor.js'
import MarkdownLinkDialog from './MarkdownLinkDialog.vue'

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active')
const input = () => dialog()!.querySelector<HTMLInputElement>('input')!

async function open(
  props: { href?: string; hasLink?: boolean; apply?: (href: string) => boolean } = {},
) {
  const apply = props.apply ?? vi.fn(() => true)
  const remove = vi.fn()
  wrapper = mount(MarkdownLinkDialog, {
    props: {
      modelValue: true,
      href: props.href ?? '',
      hasLink: props.hasLink ?? false,
      apply,
      remove,
      messages: DEFAULT_MARKDOWN_EDITOR_MESSAGES,
      'onUpdate:modelValue': (value: boolean) => wrapper?.setProps({ modelValue: value }),
    },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return { apply, remove }
}

describe('MarkdownLinkDialog', () => {
  it('열면 제목 · 주소 칸(열 때의 href) · 단추 셋', async () => {
    await open({ href: 'https://a.example' })
    expect(dialog()!.textContent).toContain('링크')
    expect(input().value).toBe('https://a.example')
    for (const text of ['링크 지우기', '취소', '적용']) {
      expect(buttonByText(text, dialog()!), text).toBeTruthy()
    }
  })

  it('적용 → apply(입력값) 가 참이면 닫힌다', async () => {
    const { apply } = await open()
    input().value = 'example.com'
    input().dispatchEvent(new Event('input'))
    buttonByText('적용', dialog()!)!.click()
    await flushPromises()
    expect(apply).toHaveBeenCalledWith('example.com')
    expect(dialog()).toBeNull()
  })

  it('Enter 도 적용이다', async () => {
    const { apply } = await open()
    input().value = 'example.com'
    input().dispatchEvent(new Event('input'))
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(apply).toHaveBeenCalledWith('example.com')
  })

  it('apply 가 거짓이면 닫히지 않고 「사용할 수 없는 주소입니다.」 — 다시 치면 사라진다', async () => {
    await open({ apply: vi.fn(() => false) })
    input().value = 'javascript:alert(1)'
    input().dispatchEvent(new Event('input'))
    buttonByText('적용', dialog()!)!.click()
    await flushPromises()
    expect(dialog()).toBeTruthy()
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain(
      '사용할 수 없는 주소입니다.',
    )
    input().value = 'https://ok.example'
    input().dispatchEvent(new Event('input'))
    await flushPromises()
    expect(dialog()!.textContent).not.toContain('사용할 수 없는 주소입니다.')
  })

  it('링크 지우기는 hasLink 일 때만 켜지고, 누르면 remove 뒤 닫힌다', async () => {
    const first = await open({ hasLink: false })
    expect(buttonByText('링크 지우기', dialog()!)!.disabled).toBe(true)
    wrapper!.unmount()
    wrapper = null
    document.body.innerHTML = ''
    const { remove } = await open({ hasLink: true, href: 'https://a.example' })
    expect(first.remove).not.toHaveBeenCalled()
    buttonByText('링크 지우기', dialog()!)!.click()
    await flushPromises()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeNull()
  })

  it('취소는 아무것도 부르지 않고 닫는다', async () => {
    const { apply, remove } = await open()
    buttonByText('취소', dialog()!)!.click()
    await flushPromises()
    expect(apply).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('🔴 다시 열면 그때의 href 로 채운다 — 열린 채로는 바깥 href 가 바뀌어도 치던 글자를 지우지 않는다', async () => {
    await open({ href: 'https://a.example' })
    input().value = 'https://typing'
    input().dispatchEvent(new Event('input'))
    await wrapper!.setProps({ href: 'https://changed.example' })
    expect(input().value).toBe('https://typing')
    await wrapper!.setProps({ modelValue: false })
    await flushPromises()
    await wrapper!.setProps({ modelValue: true })
    await flushPromises()
    expect(input().value).toBe('https://changed.example')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-link-dialog.render.test.ts`
Expected: FAIL — 컴포넌트 없음.

- [ ] **Step 3: 컴포넌트를 쓴다**

`packages/admin-ui/src/components/markdown/MarkdownLinkDialog.vue`:

```vue
<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { VBtn, VTextField } from 'vuetify/components'
  import BaseDialog from '../common/BaseDialog.vue'
  import type { MarkdownEditorMessages } from './markdown-editor.js'

  // 마크다운 편집기의 링크 대화상자(스펙 W12) — 내부 부품(export 안 함). 🔴 브라우저 `prompt` 를 쓰지 않는다(저장소 규약).
  //
  // 정본: ssworks-ringside apps/web/app/components/ring/RingEditorLinkPopover.vue 의 흐름(열 때만 주소 채움 · 적용 실패 힌트)
  // 바꾼 점: 팝오버 대신 킷 `BaseDialog` · 「열기」 단추 없음(미리보기의 새 탭 링크가 있다) · 적용 · 지우기는 함수 prop 으로
  //          받는다 — 성공 여부(링크 확장의 `setLink` 가 `javascript:` 등을 거부하면 거짓)를 바로 안다.
  //
  // 🔴 주소 칸은 **열 때만** 채운다(`watch(modelValue)`). `href` prop 에 동기화하면 열린 채 선택이 다시 매핑될 때 치던 주소가 지워진다.

  const props = defineProps<{
    modelValue: boolean
    /** 열 때 채울 주소 — 링크 위면 지금 주소, 아니면 '' */
    href: string
    /** 지금 선택이 링크 위인가 — 「링크 지우기」 를 켠다 */
    hasLink: boolean
    /** 적용. 거짓을 돌려주면 닫지 않고 `linkInvalid` 를 보인다 */
    apply: (href: string) => boolean
    remove: () => void
    messages: MarkdownEditorMessages
  }>()

  const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

  const input = ref('')
  const error = ref('')

  watch(
    () => props.modelValue,
    (open) => {
      if (!open) return
      input.value = props.href
      error.value = ''
    },
    { immediate: true },
  )

  function close(): void {
    emit('update:modelValue', false)
  }

  function onApply(): void {
    if (props.apply(input.value)) {
      close()
      return
    }
    error.value = props.messages.linkInvalid
  }

  function onRemove(): void {
    props.remove()
    close()
  }
</script>

<template>
  <BaseDialog
    max-width="480"
    :model-value="modelValue"
    :title="messages.linkTitle"
    type="none"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VTextField
      v-model="input"
      autofocus
      :error-messages="error ? [error] : []"
      :label="messages.linkHref"
      placeholder="https://"
      @keydown.enter.prevent="onApply"
      @update:model-value="error = ''"
    />
    <template #actions>
      <VBtn :disabled="!hasLink" variant="text" @click="onRemove">{{ messages.linkRemove }}</VBtn>
      <VBtn variant="text" @click="close">{{ messages.linkCancel }}</VBtn>
      <VBtn color="primary" @click="onApply">{{ messages.linkApply }}</VBtn>
    </template>
  </BaseDialog>
</template>
```

Vuetify 의 `VTextField` 오류 문구는 `.v-messages` 안에 `role="alert"` 로 그려진다 — 테스트의 `[role="alert"]` 가 그것이다. 아니면(버전 차이) 문구 아래 `<p role="alert">` 를 따로 그린다.

- [ ] **Step 4: 통과 · 커밋**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-link-dialog.render.test.ts`
Expected: PASS 7.

```bash
git add packages/admin-ui/src/components/markdown/MarkdownLinkDialog.vue packages/admin-ui/src/components/markdown/markdown-link-dialog.render.test.ts
git commit -m "feat(admin-ui): 마크다운 편집기 링크 대화상자(BaseDialog — prompt 없음)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `MarkdownEditor.vue` 다시 쓰기 — 계약 테스트(D3 · D4 · readonly · label · height · destroy · 디바운스)

**Files:**

- Rewrite: `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`
- Rewrite: `packages/admin-ui/src/components/markdown/markdown-editor.render.test.ts`
- Delete: `packages/admin-ui/src/components/markdown/codemirror.render.test.ts`

- [ ] **Step 1: render 테스트를 다시 쓴다(1부 — 계약)**

`markdown-editor.render.test.ts` 전체를 아래로 바꾼다(2부 — 도구 막대 · 모드 · 링크는 Task 8 이 같은 파일에 더한다):

```ts
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
```

- [ ] **Step 2: 실패 확인 · 옛 CodeMirror 테스트 삭제**

`packages/admin-ui/src/components/markdown/codemirror.render.test.ts` 를 지운다.

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-editor.render.test.ts`
Expected: FAIL — 컴포넌트가 아직 CodeMirror(`codemirror` 를 찾지 못함).

- [ ] **Step 3: 컴포넌트를 다시 쓴다**

`packages/admin-ui/src/components/markdown/MarkdownEditor.vue` 전문:

```vue
<script setup lang="ts">
  import { EditorState } from '@tiptap/pm/state'
  import { Editor } from '@tiptap/vue-3'
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import { VBtn, VBtnToggle, VDivider } from 'vuetify/components'
  import { createMarkdownEditorExtensions, normalizeLinkHref } from './editor-markdown.js'
  import {
    DEFAULT_MARKDOWN_EDITOR_MESSAGES,
    MARKDOWN_EDITOR_EMIT_DELAY_MS,
    type MarkdownEditorMessages,
    type MarkdownEditorMode,
  } from './markdown-editor.js'
  import MarkdownLinkDialog from './MarkdownLinkDialog.vue'

  // 마크다운 본문 편집기 — TipTap 3 + @tiptap/markdown WYSIWYG 와 「원문」(Markdown textarea) 전환을 `v-model` 하나로 감싼다.
  // v-model 은 Markdown 문자열이다(스펙 `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md`).
  //
  // 정본: ssworks-ringside apps/web/app/components/ring/RingMarkdownEditor.vue(Nuxt UI UEditor 조립 · 도구 묶음)
  //       + 이 파일의 전 판(CodeMirror 6 — 3e D3 · D4 · D5 계약 · Vuetify 토큰 색)
  // 바꾼 점:
  //  - 엔진 TipTap(`@tiptap/vue-3` Editor 를 호스트 <div> 에 직접 마운트 — `EditorContent` 없이도 vue-3 Editor 의 반응성은 온다).
  //  - 충실도 어댑터는 editor-markdown.ts(화면과 시험 하니스가 같은 확장 묶음).
  //  - 「원문」 모드 — 평문 textarea, 같은 v-model, 값 변환 없음(약관 표기 보존 · IME 탈출구 — 결정 ①).
  //  - emit 디바운스 200ms(결정 ③) — 큰 본문에서 입력마다 전체 직렬화하지 않는다. 포커스 잃음 · 전환 · readonly · 언마운트에서 flush.
  //  - 링크는 BaseDialog(브라우저 prompt 금지). 도구 막대 문구는 `messages`.
  //
  // 🔴 받은 값(prop)이 마지막으로 합의한 값(`lastEmitted`)과 같으면 아무것도 하지 않는다(D3). 디바운스 뒤 부모가 돌려준 값은 그 사이 더
  //    친 글자 때문에 지금 문서와 다를 수 있어 문서와 비교하면 조합 중 치환이 일어난다 — 그래서 `lastEmitted` 와 비교한다(W4).
  // 🔴 외부 변경은 `setContent` 뒤 상태를 새로 만든다(`EditorState.create`) — setContent 만으로는 history 에 남아 Ctrl+Z 가 앞 문서를
  //    되살린다(D4). @tiptap/vue-3 Editor 는 state 를 `beforeTransaction` 에서 비추므로 updateState 뒤 빈 트랜잭션 하나로 맞춘다.
  // 🔴 첫 내용 · 외부 변경 · 모드 전환은 emit 하지 않는다 — 사용자 트랜잭션에서만(W6). StarterKit `trailingNode: false` 가 그 전제다.
  // 🔴 호스트 <div> 는 v-show 로만 가린다 — 편집기를 매번 새로 만들지 않는다(W2). 쓰는 쪽도 이 컴포넌트를 v-if 뒤에 두지 말고
  //    불러오는 동안 `readonly` 로 둔다(LegalDocumentEditor).
  // 개행은 `\n` 으로 정규화된다(marked · ProseMirror) — CRLF 본문은 첫 입력부터 LF 로 나간다(W17).

  const props = withDefaults(
    defineProps<{
      modelValue: string
      readonly?: boolean
      label?: string
      height?: string
      /** 처음 보일 편집 방식. 기본 'wysiwyg'(서식). 'source' 는 Markdown 원문 textarea */
      defaultMode?: MarkdownEditorMode
      messages?: Partial<MarkdownEditorMessages>
    }>(),
    {
      readonly: false,
      label: '본문',
      height: '420px',
      defaultMode: 'wysiwyg',
      messages: () => ({}),
    },
  )

  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

  const text = computed<MarkdownEditorMessages>(() => ({
    ...DEFAULT_MARKDOWN_EDITOR_MESSAGES,
    ...props.messages,
  }))

  const host = ref<HTMLElement | null>(null)
  const editor = shallowRef<Editor>()
  const mode = ref<MarkdownEditorMode>(props.defaultMode)
  /** 이 컴포넌트가 마지막으로 부모와 합의한 값 — 초기 prop · emit 한 값 · 외부에서 받은 값 · 원문에서 친 값 */
  let lastEmitted = props.modelValue
  /** 원문 모드에서 값이 바뀌어 서식 편집기 문서가 낡았다 — 서식으로 돌아올 때 맞춘다 */
  let wysiwygStale = false
  let pending: ReturnType<typeof setTimeout> | null = null

  const linkOpen = ref(false)
  const linkHref = ref('')

  function contentAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': props.label,
    }
    if (props.readonly) attributes['aria-readonly'] = 'true'
    return attributes
  }

  function cancelPending(): void {
    if (pending == null) return
    clearTimeout(pending)
    pending = null
  }

  /** 대기 중인 emit 을 지금 보낸다 — 값이 합의한 값과 같으면 보내지 않는다(친 뒤 지운 경우) */
  function flush(): void {
    if (pending == null) return
    cancelPending()
    const instance = editor.value
    if (instance == null || instance.isDestroyed) return
    const markdown = instance.getMarkdown()
    if (markdown === lastEmitted) return
    lastEmitted = markdown
    emit('update:modelValue', markdown)
  }

  function scheduleEmit(): void {
    cancelPending()
    pending = setTimeout(flush, MARKDOWN_EDITOR_EMIT_DELAY_MS)
  }

  /** 외부 변경(D4) — 문서 치환 + 되돌리기 기록 비움. emit 하지 않는다 */
  function replaceExternal(value: string): void {
    const instance = editor.value
    if (instance == null) return
    cancelPending()
    instance.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    const { view } = instance
    view.updateState(
      EditorState.create({
        schema: view.state.schema,
        doc: view.state.doc,
        plugins: view.state.plugins,
      }),
    )
    // @tiptap/vue-3 Editor 의 `state` 는 beforeTransaction 에서 비춘 값이다 — 빈 트랜잭션으로 새 상태를 알린다(history 제외 · update 없음)
    view.dispatch(view.state.tr.setMeta('addToHistory', false).setMeta('preventUpdate', true))
    lastEmitted = value
    wysiwygStale = false
  }

  onMounted(() => {
    editor.value = new Editor({
      element: host.value!,
      extensions: createMarkdownEditorExtensions(),
      content: props.modelValue,
      contentType: 'markdown',
      editable: !props.readonly,
      injectCSS: false,
      editorProps: { attributes: contentAttributes() },
      onUpdate: scheduleEmit,
      onBlur: flush,
    })
  })

  onBeforeUnmount(() => {
    flush()
    editor.value?.destroy()
    editor.value = undefined
  })

  watch(
    () => props.modelValue,
    (value) => {
      if (value === lastEmitted) return
      if (mode.value === 'source') {
        lastEmitted = value
        wysiwygStale = true
        return
      }
      const instance = editor.value
      if (instance == null) return
      if (value === instance.getMarkdown()) {
        lastEmitted = value
        return
      }
      replaceExternal(value)
    },
  )

  watch(
    () => props.readonly,
    (readonly) => {
      if (readonly) flush()
      editor.value?.setEditable(!readonly, false)
      editor.value?.setOptions({ editorProps: { attributes: contentAttributes() } })
    },
  )

  watch(
    () => props.label,
    () => editor.value?.setOptions({ editorProps: { attributes: contentAttributes() } }),
  )

  function setMode(next: unknown): void {
    if ((next !== 'wysiwyg' && next !== 'source') || next === mode.value) return
    if (next === 'source') flush()
    mode.value = next
    if (next === 'wysiwyg' && wysiwygStale) replaceExternal(lastEmitted)
  }

  function onSourceInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value
    lastEmitted = value
    wysiwygStale = true
    emit('update:modelValue', value)
  }

  interface Tool {
    key: Exclude<
      keyof MarkdownEditorMessages,
      'modeWysiwyg' | 'modeSource' | 'modeToggle' | 'toolbar' | `link${string}`
    >
    icon: string
    active: boolean
    disabled: boolean
    run: () => void
  }

  /** 도구 묶음(W10) — `editor.state` 가 반응형이라 선택이 바뀌면 다시 셈한다 */
  const tools = computed<Tool[][]>(() => {
    const instance = editor.value
    if (instance == null) return []
    const chain = () => instance.chain().focus()
    const can = () => instance.can().chain().focus()
    const tool = (
      key: Tool['key'],
      icon: string,
      run: () => void,
      enabled: boolean,
      active = false,
    ): Tool => ({ key, icon, active, disabled: !enabled, run })
    return [
      [
        tool(
          'bold',
          'mdi-format-bold',
          () => chain().toggleBold().run(),
          can().toggleBold().run(),
          instance.isActive('bold'),
        ),
        tool(
          'italic',
          'mdi-format-italic',
          () => chain().toggleItalic().run(),
          can().toggleItalic().run(),
          instance.isActive('italic'),
        ),
        tool(
          'strike',
          'mdi-format-strikethrough-variant',
          () => chain().toggleStrike().run(),
          can().toggleStrike().run(),
          instance.isActive('strike'),
        ),
      ],
      [
        tool(
          'heading2',
          'mdi-format-header-2',
          () => chain().toggleHeading({ level: 2 }).run(),
          can().toggleHeading({ level: 2 }).run(),
          instance.isActive('heading', { level: 2 }),
        ),
        tool(
          'heading3',
          'mdi-format-header-3',
          () => chain().toggleHeading({ level: 3 }).run(),
          can().toggleHeading({ level: 3 }).run(),
          instance.isActive('heading', { level: 3 }),
        ),
      ],
      [
        tool(
          'blockquote',
          'mdi-format-quote-close',
          () => chain().toggleBlockquote().run(),
          can().toggleBlockquote().run(),
          instance.isActive('blockquote'),
        ),
        tool(
          'bulletList',
          'mdi-format-list-bulleted',
          () => chain().toggleBulletList().run(),
          can().toggleBulletList().run(),
          instance.isActive('bulletList'),
        ),
        tool(
          'orderedList',
          'mdi-format-list-numbered',
          () => chain().toggleOrderedList().run(),
          can().toggleOrderedList().run(),
          instance.isActive('orderedList'),
        ),
      ],
      [
        tool(
          'link',
          'mdi-link-variant',
          openLink,
          !instance.state.selection.empty || instance.isActive('link'),
          instance.isActive('link'),
        ),
        tool(
          'horizontalRule',
          'mdi-minus',
          () => chain().setHorizontalRule().run(),
          can().setHorizontalRule().run(),
        ),
      ],
      [
        tool('undo', 'mdi-undo', () => chain().undo().run(), can().undo().run()),
        tool('redo', 'mdi-redo', () => chain().redo().run(), can().redo().run()),
      ],
    ]
  })

  const toolsDisabled = computed(() => props.readonly || mode.value === 'source')

  function openLink(): void {
    const instance = editor.value
    if (instance == null) return
    const href = instance.getAttributes('link').href
    linkHref.value = typeof href === 'string' ? href : ''
    linkOpen.value = true
  }

  /** 적용 — 빈 값이면 링크를 지운다. 링크 확장이 주소를 거부하면(`javascript:` 등) 거짓 → 대화상자가 힌트를 보인다 */
  function applyLink(input: string): boolean {
    const instance = editor.value
    if (instance == null) return false
    const href = normalizeLinkHref(input)
    if (href == null) {
      removeLink()
      return true
    }
    return instance.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  function removeLink(): void {
    editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
  }

  defineExpose({ editor })
</script>

<template>
  <div class="markdown-editor" :style="{ height }">
    <div :aria-label="text.toolbar(label)" class="markdown-editor__toolbar" role="toolbar">
      <template v-for="(group, index) in tools" :key="index">
        <VDivider v-if="index > 0" class="markdown-editor__divider" vertical />
        <VBtn
          v-for="tool in group"
          :key="tool.key"
          :active="tool.active"
          :aria-label="text[tool.key]"
          :aria-pressed="tool.active ? 'true' : undefined"
          :disabled="toolsDisabled || tool.disabled"
          :icon="tool.icon"
          size="small"
          :title="text[tool.key]"
          variant="text"
          @click="tool.run"
        />
      </template>
      <VBtnToggle
        :aria-label="text.modeToggle"
        class="markdown-editor__mode"
        density="compact"
        mandatory
        :model-value="mode"
        variant="outlined"
        @update:model-value="setMode"
      >
        <VBtn size="small" value="wysiwyg">{{ text.modeWysiwyg }}</VBtn>
        <VBtn size="small" value="source">{{ text.modeSource }}</VBtn>
      </VBtnToggle>
    </div>
    <div class="markdown-editor__body">
      <div v-show="mode === 'wysiwyg'" ref="host" class="markdown-editor__wysiwyg" />
      <textarea
        v-show="mode === 'source'"
        :aria-label="label"
        class="markdown-editor__source"
        :readonly="readonly"
        spellcheck="false"
        :value="modelValue"
        @input="onSourceInput"
      />
    </div>
    <MarkdownLinkDialog
      v-model="linkOpen"
      :apply="applyLink"
      :has-link="editor?.isActive('link') ?? false"
      :href="linkHref"
      :messages="text"
      :remove="removeLink"
    />
  </div>
</template>

<style scoped>
  .markdown-editor {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 4px;
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
  }

  .markdown-editor:focus-within {
    border-color: rgb(var(--v-theme-primary));
  }

  .markdown-editor__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .markdown-editor__divider {
    align-self: stretch;
    height: auto;
    margin: 4px;
  }

  .markdown-editor__mode {
    margin-left: auto;
  }

  .markdown-editor__body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .markdown-editor__wysiwyg {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .markdown-editor__source {
    display: block;
    width: 100%;
    height: 100%;
    padding: 12px 16px;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    color: inherit;
    font-family: monospace;
    font-size: 13px;
    line-height: 1.5;
  }

  /* injectCSS: false — ProseMirror 기본 규칙 중 필요한 것만 */
  .markdown-editor__wysiwyg :deep(.ProseMirror) {
    flex: 1;
    padding: 12px 16px;
    outline: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.6;
    caret-color: rgb(var(--v-theme-on-surface));
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror ::selection) {
    background: rgba(var(--v-theme-primary), 0.2);
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror-selectednode) {
    outline: 2px solid rgba(var(--v-theme-primary), 0.6);
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror-gapcursor) {
    position: relative;
    display: none;
    pointer-events: none;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror-gapcursor::after) {
    content: '';
    position: absolute;
    top: -2px;
    display: block;
    width: 20px;
    border-top: 1px solid rgb(var(--v-theme-on-surface));
    animation: markdown-editor-blink 1.1s steps(2, start) infinite;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror-focused .ProseMirror-gapcursor) {
    display: block;
  }

  @keyframes markdown-editor-blink {
    to {
      visibility: hidden;
    }
  }

  /* 본문 타이포 — MarkdownView 와 같은 규칙 */
  .markdown-editor__wysiwyg :deep(.ProseMirror :is(h1, h2, h3, h4, h5, h6)) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror h1) {
    font-size: 1.5rem;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror h2) {
    font-size: 1.3rem;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror h3) {
    font-size: 1.15rem;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror :is(h4, h5, h6)) {
    font-size: 1rem;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror > :first-child) {
    margin-top: 0;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror :is(p, ul, ol, blockquote, pre)) {
    margin: 0 0 0.75em;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror :is(ul, ol)) {
    padding-left: 1.5em;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror li > :is(ul, ol)) {
    margin-bottom: 0;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror li > p) {
    margin-bottom: 0;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror blockquote) {
    padding-left: 12px;
    border-left: 3px solid rgba(var(--v-border-color), var(--v-border-opacity));
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror code) {
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: monospace;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror pre) {
    padding: 8px 12px;
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    overflow-x: auto;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror pre code) {
    padding: 0;
    background: none;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror a) {
    color: rgb(var(--v-theme-primary));
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror img) {
    display: block;
    max-width: 100%;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror hr) {
    margin: 1em 0;
    border: 0;
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
</style>
```

- [ ] **Step 4: 테스트 · typecheck**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-editor.render.test.ts`
Expected: PASS 15. 자주 걸리는 것 — ① `editor.chain().focus()` 가 happy-dom 에서 던지면 `focus()` 를 도구 실행에서만 쓰고 테스트는 `focus` 없는 명령을 부르는지 본다(Task 1 탐침이 지나갔으면 괜찮다). ② `aria-pressed` 에 `undefined` 를 주면 Vue 가 속성을 지운다 — 의도다. ③ `VBtnToggle` 의 `@update:model-value` 페이로드가 unknown 이라 `setMode(next: unknown)` 이 좁힌다.

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 약관 render 테스트 둘(`codemirror` import)만 빨갛다 — Task 9 가 고친다.

- [ ] **Step 5: 커밋**

```bash
git add -A packages/admin-ui/src/components/markdown
git commit -m "feat(admin-ui): MarkdownEditor 를 TipTap WYSIWYG + 원문 전환으로 — D3 · D4 · readonly · label · 디바운스 계약

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 편집기 테스트 2부 — 도구 막대 · 모드 전환 · 링크 · 문구

**Files:**

- Modify: `packages/admin-ui/src/components/markdown/markdown-editor.render.test.ts`(끝에 더한다)
- Modify(필요하면): `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`

- [ ] **Step 1: 테스트를 더한다**

파일 끝에:

```ts
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
    toolButton('제목 2')!.click()
    expect(editor.getMarkdown()).toBe('## 본문')
    toolButton('제목 2')!.click()
    toolButton('글머리 목록')!.click()
    expect(editor.getMarkdown()).toBe('- 본문')
    toolButton('글머리 목록')!.click()
    toolButton('인용')!.click()
    expect(editor.getMarkdown()).toBe('> 본문')
    toolButton('인용')!.click()
    editor.commands.setTextSelection(endOf(editor))
    toolButton('구분선')!.click()
    expect(editor.getMarkdown()).toBe('본문\n\n---')
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

  it('단추를 눌러도 브라우저 prompt · confirm · alert 가 불리지 않는다', () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const w = mountEditor({ modelValue: '본문' })
    editorOf(w).commands.setTextSelection({ from: 1, to: 3 })
    for (const button of document.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')) {
      if (!button.disabled) button.click()
    }
    expect(prompt).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(alert).not.toHaveBeenCalled()
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
    hrefInput().value = 'example.com/a b'
    hrefInput().dispatchEvent(new Event('input'))
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
    hrefInput().value = '  '
    hrefInput().dispatchEvent(new Event('input'))
    buttonByText('적용', dialog()!)!.click()
    await flushPromises()
    blur(editor)
    expect(w.emitted('update:modelValue')).toEqual([['본문']])
  })

  it('javascript: 주소는 거부 — 닫히지 않고 「사용할 수 없는 주소입니다.」, 문서는 그대로', async () => {
    const w = mountEditor({ modelValue: '본문' })
    const editor = editorOf(w)
    await openLinkOn(editor, 1, 3)
    hrefInput().value = 'javascript:alert(1)'
    hrefInput().dispatchEvent(new Event('input'))
    buttonByText('적용', dialog()!)!.click()
    await flushPromises()
    expect(dialog()).toBeTruthy()
    expect(dialog()!.textContent).toContain('사용할 수 없는 주소입니다.')
    expect(editor.getMarkdown()).toBe('본문')
  })
})
```

- [ ] **Step 2: 돌리고 고친다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-editor.render.test.ts`
Expected: PASS(1부 15 + 2부 17). 걸릴 만한 것과 대응:

- `aria-pressed` 가 안 보이면 VBtn 이 `active` 로 `aria-pressed` 를 스스로 붙이지 않는다는 뜻 — 템플릿의 `:aria-pressed` 가 그래서 있다.
- 되돌리기 단추의 `disabled` 가 안 바뀌면 `tools` computed 가 `editor.state` 를 읽고 있는지(`can()`·`isActive` 는 `instance.state` 를 거친다 — vue-3 Editor 의 getter) 본다. 그래도 안 되면 `editor.on('transaction', () => tick.value++)` 식의 카운터 ref 를 두고 `tools` 가 읽게 한다(`useDebouncedRef` 가 rAF 로 늦춘다 — 테스트는 `await flushPromises()` 뒤 `await new Promise(requestAnimationFrame)` 두 번).
- 링크 적용 뒤 `[본문](https://example.com/a%20b)` 의 인코딩은 `normalizeLinkHref`(공백 → `%20`) 몫이다.

- [ ] **Step 3: lint · 커밋**

Run: `pnpm lint`
Expected: 초록.

```bash
git add -A packages/admin-ui/src/components/markdown
git commit -m "test(admin-ui): MarkdownEditor 도구 막대 · 원문 전환 · 링크 대화상자 · 문구

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 약관 테스트 보정 · 도움말 문구

**Files:**

- Modify: `packages/admin-ui/src/components/legal/legal-document.ts:91-92`
- Modify: `packages/admin-ui/src/components/legal/legal-document-editor.render.test.ts:1-10, 130-131, 211-239`
- Modify: `packages/admin-ui/src/composables/useLegalDocuments.render.test.ts:1-20, 100-111`

- [ ] **Step 1: `editorHint` 기본 문구(W16)**

`legal-document.ts` 의 `editorHint` 를:

```ts
    /** 편집기 아래 작성 도움말 — Enter 문단 · Shift+Enter 줄바꿈 · 원문 탭(WYSIWYG — PR #3j W16) */
    editorHint:
      'Enter 는 새 문단, Shift+Enter 는 줄바꿈입니다. Markdown 원문을 직접 고치려면 「원문」으로 바꾸세요.',
```

(인터페이스의 JSDoc 도 같은 뜻으로 고친다 — `줄바꿈 · 문단 · 인용 끝내기(마크다운 규칙을 모르는 관리자용, 3e §12 R7)` → `Enter 문단 · Shift+Enter 줄바꿈 · 원문 탭(3j W16)`.)

- [ ] **Step 2: `legal-document-editor.render.test.ts`**

1. `import { EditorView } from 'codemirror'` 를 지우고 `import type { Editor } from '@tiptap/vue-3'` 와 `import MarkdownEditor from '../markdown/MarkdownEditor.vue'` 를 더한다(import 정렬은 prettier · eslint 에 맞춘다).
2. `const content = (label: string) => document.querySelector<HTMLElement>(\`.cm-content[aria-label="${label}"]\`)`→`.ProseMirror[aria-label="${label}"]`.
3. '입력하면 update:modelValue' 를:

```ts
it('입력하면 update:modelValue — 포커스를 잃을 때(디바운스 flush)', () => {
  const w = mountEditor()
  const editor = (w.findComponent(MarkdownEditor).vm as unknown as { editor: Editor }).editor
  editor
    .chain()
    .setTextSelection(editor.state.doc.content.size - 1)
    .splitBlock()
    .insertContent('본문')
    .run()
  editor.view.dom.dispatchEvent(new FocusEvent('blur'))
  expect(w.emitted('update:modelValue')).toEqual([['# 제1조\n\n본문']])
})
```

4. 도움말 기대 문구를 새 기본값으로.

- [ ] **Step 3: `useLegalDocuments.render.test.ts`**

1. `import { EditorView } from 'codemirror'` → `import type { Editor } from '@tiptap/vue-3'` + `import MarkdownEditor from '../components/markdown/MarkdownEditor.vue'`.
2. `editorView(label)` · `type(label, text)` 를:

```ts
function editorOf(label: string): Editor {
  const content = document.querySelector<HTMLElement>(`.ProseMirror[aria-label="${label}"]`)
  expect(content, `가드 — "${label}" 편집 영역이 있다`).toBeTruthy()
  const component = wrapper!.findComponent(MarkdownEditor)
  return (component.vm as unknown as { editor: Editor }).editor
}

/** 사람이 친 것처럼 — 문서 끝에 새 문단으로 글자를 넣고 포커스를 잃는다(emit 디바운스 flush) */
async function type(label: string, text: string) {
  const editor = editorOf(label)
  editor
    .chain()
    .setTextSelection(editor.state.doc.content.size - 1)
    .splitBlock()
    .insertContent(text)
    .run()
  editor.view.dom.dispatchEvent(new FocusEvent('blur'))
  await flushPromises()
}
```

(`wrapper` 변수 이름은 그 파일의 `setup()` 이 마운트한 래퍼 이름을 따른다 — 파일 머리를 읽고 맞춘다. `editorView` 를 쓰던 다른 자리가 있으면 `editorOf` 로.)

3. 기대 본문: 제목 뒤 Enter 가 문단이므로 `'# 이용약관 v12\n제2조'` 모양은 모두 `'# 이용약관 v12\n\n제2조'` 가 된다. 테스트를 돌려 빨간 단언마다 `\n<친 글자>` → `\n\n<친 글자>` 로 고친다(규칙은 이것 하나 — 다른 모양의 차이가 나오면 멈추고 원인을 본다).

- [ ] **Step 4: 돌린다**

Run: `pnpm --filter @ssworks/admin-ui test`
Expected: 전부 PASS(admin-ui). 약관 흐름 테스트의 다른 단언(발행 · 충돌 · 탭)은 손대지 않았는데 빨가면 흐름이 아니라 치기 도우미를 의심한다.

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm lint`
Expected: 초록.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-ui/src/components/legal packages/admin-ui/src/composables/useLegalDocuments.render.test.ts
git commit -m "test(admin-ui): 약관 테스트를 TipTap 편집기로 · 편집기 도움말 기본 문구(Enter 문단 · 원문 탭)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: README · changeset · 진행 문서

**Files:**

- Modify: `packages/admin-ui/README.md`(「Peer 의존」 110-134 · export 표 171 · 「약관」 뒤 새 절 · 「알려진 한계 · 수동 확인」 961-966)
- Create: `.changeset/wysiwyg-markdown-editor.md`
- Modify: `CLAUDE.md`(진행표 · 패키지 표 admin-ui 행 · 코드 규약 admin-ui 절)
- Modify: `docs/01-phase0.md:215` 뒤
- Modify: `docs/HANDOFF.md`(「지금 상태」 admin-ui 행 끝 · 「PR 2g 가 넘긴 것」 뒤)

- [ ] **Step 1: README 「Peer 의존」**

표의 `codemirror` · `@codemirror/state` 두 행을 지우고 그 자리에:

```markdown
| `@tiptap/core` · `@tiptap/pm` · `@tiptap/vue-3` · `@tiptap/starter-kit` · `@tiptap/markdown` · `@tiptap/extension-image` · `@tiptap/extension-code` · `@tiptap/extension-paragraph` · `@tiptap/extension-document` · `@tiptap/extension-code-block` · `@tiptap/extension-list` · `@tiptap/extension-text` | 예 | `MarkdownEditor` · `LegalDocumentEditor`(약관 편집기). 🔴 **정확 판 `3.32.0`** — TipTap 은 패키지끼리 정확 판 peer 라 열둘을 같은 판으로 설치한다 |
| `marked` | 예 | `^17.0.6` — `@tiptap/markdown` 의 의존이기도 하다. 편집기가 `Tokenizer` 를 상속해 렌더(markdown-it)와 토큰을 맞춘다 |
| `@floating-ui/dom` | 예 | `^1.0.0` — `@tiptap/vue-3` 의 필수 peer |
```

🔴 문단을 "`pinia`·`axios`·`@he-tree/vue`·`@tiptap/*`·`marked`·`@floating-ui/dom` 도 **필수**다. …" 로 고치고 마지막 문장(CodeMirror 테마 패키지)을 "TipTap 의 CSS(`injectCSS`)는 쓰지 않는다 — 편집기 색은 Vuetify 테마를 따른다." 로.

- [ ] **Step 2: README export 표**

`MarkdownEditor` 행을:

```markdown
| `MarkdownEditor` · `MarkdownEditorMode` · `MarkdownEditorMessages` · `DEFAULT_MARKDOWN_EDITOR_MESSAGES` | WYSIWYG(TipTap) + 「원문」 전환 편집기 `v-model`(Markdown 문자열). `readonly` · `label`(aria) · `height` · `defaultMode` · `messages`, `editor` expose. 아래 「마크다운 편집기」 |
```

- [ ] **Step 3: README 새 절 「마크다운 편집기」**

「약관」 절(`## 약관`) 바로 앞에:

````markdown
## 마크다운 편집기

`MarkdownEditor` 는 보이는 대로 쓰는(WYSIWYG) 편집기다. 엔진은 TipTap 3 + `@tiptap/markdown`, 값(`v-model`)은 언제나 Markdown 문자열이라 서버 · 렌더(`renderMarkdown`) · `LegalDocumentEditor` 는 그대로다. 편집기에 보이는 것이 `renderMarkdown` 결과와 같아지게 편집기 쪽을 맞췄다(충실도 어댑터 — `src/components/markdown/editor-markdown.ts` 머리 주석).

```vue
<MarkdownEditor v-model="body" label="운영 원칙" height="360px" />
<MarkdownEditor v-model="body" default-mode="source" :messages="{ modeSource: 'Markdown' }" />
```
````

- **두 모드** — 도구 막대 오른쪽 「서식 | 원문」. 원문은 평문 textarea(같은 값 · 변환 없음)다. 옛 원고를 그대로 붙여 넣거나 표기를 정확히 다듬을 때, 한글 입력이 말썽일 때 쓴다. `defaultMode: 'source'` 로 원문부터 열 수 있다.
- **도구 막대** — 굵게 · 기울임 · 취소선 | 제목 2 · 3 | 인용 · 글머리 · 번호 | 링크 · 구분선 | 되돌리기 · 다시 실행. 제목 1 과 코드 단추는 없다(문서 제목은 페이지 몫 · 코드는 입력 규칙으로). 문구는 `messages`(기본값 `DEFAULT_MARKDOWN_EDITOR_MESSAGES`).
- **키** — Enter 는 새 문단, Shift+Enter 는 줄바꿈(`  \n`). 입력 규칙: `**굵게**` · `*기울임*` · `# ` · `- ` · `1. ` · `> ` · `` `코드` `` · ` ``` ` · `---` · `![alt](주소)`. 목록 안 Tab 은 들여쓰기다.
- **링크** — 글자를 고른 뒤 링크 단추 → 대화상자(브라우저 `prompt` 없음). 스킴이 없으면 `https://` 를 붙이고 공백 · 괄호는 퍼센트 인코딩한다. `javascript:` 같은 주소는 거부한다.
- **그림** — 업로드 UI 는 없다. `![alt](주소)` 를 치거나 붙여 넣은 HTML 의 `<img>` 가 그림 노드가 된다. 킷은 그림 주소를 거르지 않는다(거르기는 앱 몫 — 렌더 쪽에서).
- 🔴 **emit 은 입력 뒤 200ms 안에**(디바운스) — 큰 본문에서 입력마다 전체를 직렬화하지 않기 위해서다. 포커스를 잃으면 · 원문으로 바꾸면 · `readonly` 가 켜지면 · 언마운트하면 바로 나간다. 입력 직후 값을 재는 앱 테스트는 편집 영역에 `blur` 를 보낸 뒤 잰다. 원문 textarea 는 즉시 emit.
- 🔴 **표기가 바뀐다** — 한 글자만 고쳐도 본문 전체가 다시 직렬화된다. 인라인 기호 `\*` `\_` `\[` `\~` · 줄머리 `1\.` `\-` `\#` · `<` `>` `&` → `&lt;` `&gt;` `&amp;` · 줄 하나 바꿈 → `  \n` · 목록 들여쓰기 2칸 · 빈 문단 → `&nbsp;`. **렌더는 같다**(왕복 테스트가 지킨다). 약관처럼 원문이 그대로 보관되는 곳에서는 "표기만 다른 새 판"이 생길 수 있다 — 표기를 지키며 고치려면 「원문」에서 고친다.
- **붙여넣기** — HTML 은 서식으로, 평문은 줄마다 문단으로 들어온다. 평문으로 붙여넣은 **Markdown 원문은 Markdown 으로 읽히지 않는다**(`1.` · `-` · `#` 로 시작하는 줄은 글자로 지킨다) — 원문 탭에 붙여 넣는다.
- **큰 본문** — 5만 자(문단 125개)에서 키당 수백 ms 였던 직렬화가 디바운스로 키 경로에서 빠진다. 수십만 자는 원문 탭을 권한다.
- **알려진 차이**(렌더가 같거나 보이는 모양만 다르다 — 어댑터 테스트가 기대 출력으로 고정): 이름 있는 엔티티(`&copy;`)는 글자 · 할 일 목록 `- [ ]` 는 보통 목록 · 느슨한 목록은 촘촘하게 · 기호가 섞인 이웃 목록은 `-` 하나 · 목록 안 빈 줄은 편집기에만 · 문서 끝 빈 문단은 렌더하지 않음 · 맨 `www.` 주소는 링크가 된다(렌더가 바뀌는 드문 경우) · 표는 편집기에 파이프 글자로 보이고 렌더는 표 · `data:` 그림은 들어오지 않는다(alt 글자만) · 링크 걸린 그림은 링크를 잃는다 · 글자 문단 속 그림은 따로 선 블록이 된다.
- **`editor`**(`defineExpose`) — TipTap `Editor` 인스턴스(마운트 뒤). 테스트 · 고급 소비자의 탈출구이고, 안정성 약속은 props · emit 까지다 — TipTap 판을 올리면 바뀔 수 있다.
- 테스트가 잴 수 없어 사람이 확인하는 것 — 한글 입력(데스크톱 · Android Chrome · iOS Safari), 붙여넣기(스크린숏 · Word · 한글 문서), 도구 단추 클릭 뒤 포커스, 되돌리기 범위, 다크 테마 색.

````

- [ ] **Step 4: README 「약관」 의 「알려진 한계 · 수동 확인」**

- "CodeMirror 는 개행을 `\n` 으로 정규화한다…" → "편집기(TipTap · marked)는 개행을 `\n` 으로 정규화한다. CRLF 로 저장된 본문은 첫 입력부터 LF 로 바뀐다."
- "Enter 한 번은 줄바꿈, 빈 줄은 문단 나눔이다…" → "서식 모드에서 Enter 는 새 문단, Shift+Enter 는 줄바꿈이다. 원문 모드는 Markdown 그대로(`renderMarkdown` 의 `breaks: true` — Enter 한 번이 줄바꿈, 빈 줄이 문단). 편집기 아래 도움말(`messages.editorHint`)이 이것을 알린다. 한 글자만 고쳐도 본문 전체의 Markdown 표기가 다시 쓰인다 — 「마크다운 편집기」."
- 마지막 문장 "2026-10-08 Windows 브라우저에서 모두 통과했다. 편집기를 바꾸면 다시 본다." → "CodeMirror 판은 2026-10-08 에 통과했고, TipTap 판(0.10.0)은 사람 확인이 남아 있다(HANDOFF 「PR #3j 가 넘긴 것」)."

- [ ] **Step 5: changeset**

`.changeset/wysiwyg-markdown-editor.md`:

```markdown
---
'@ssworks/admin-ui': minor
---

`MarkdownEditor` 를 WYSIWYG(TipTap 3 + `@tiptap/markdown`) + 「원문」 전환으로 바꿨다(PR #3j — `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md`). v-model 은 그대로 Markdown 문자열이고 props(`modelValue` · `readonly` · `label` · `height`)도 그대로라 `LegalDocumentEditor` · 앱 코드는 바뀌지 않는다.

**쓰는 쪽이 할 일:** CodeMirror peer 둘을 빼고 TipTap peer 를 **같은 판**으로 더한다.

````

pnpm remove codemirror @codemirror/state
pnpm add @tiptap/core@3.32.0 @tiptap/pm@3.32.0 @tiptap/vue-3@3.32.0 @tiptap/starter-kit@3.32.0 @tiptap/markdown@3.32.0 @tiptap/extension-image@3.32.0 @tiptap/extension-code@3.32.0 @tiptap/extension-paragraph@3.32.0 @tiptap/extension-document@3.32.0 @tiptap/extension-code-block@3.32.0 @tiptap/extension-list@3.32.0 @tiptap/extension-text@3.32.0 marked@^17.0.6 @floating-ui/dom@^1.0.0

```

- 🔴 `@tiptap/*` 열둘은 **정확 판 3.32.0** 으로 — TipTap 은 패키지끼리 정확 판 peer 다. 킷을 올릴 때 열둘을 함께 올린다.
- 편집기: 도구 막대(굵게 · 기울임 · 취소선 | 제목 2 · 3 | 인용 · 글머리 · 번호 | 링크 · 구분선 | 되돌리기 · 다시) · 「서식 | 원문」 토글(원문은 평문 textarea, 같은 값) · 링크 대화상자(`BaseDialog` — 브라우저 `prompt` 없음). 새 선택 props `defaultMode`(`'wysiwyg' | 'source'`) · `messages`(`MarkdownEditorMessages`, 기본 `DEFAULT_MARKDOWN_EDITOR_MESSAGES` export) · `defineExpose({ editor })`.
- 편집기에 보이는 것이 `renderMarkdown` 과 같아지게 어댑터 열(줄바꿈 `breaks` · 원문 HTML 은 글자 · 밑줄 없음 · 그림 보존 · 줄머리 이스케이프 · 빈 문단 `&nbsp;` · 코드 펜스 길이 · 중첩 목록 관용 읽기 · 글자 문단 속 그림 분리)을 둔다 — 왕복 테스트(렌더 동일 · 구조 · 4회 왕복 · `doc.check()`)가 지킨다.
- 🔴 `update:modelValue` 는 서식 모드에서 **200ms 디바운스**다(포커스를 잃으면 · 원문 전환 · `readonly` · 언마운트 때 즉시). 입력 직후 값을 재는 앱 테스트는 편집 영역에 `blur` 이벤트를 보낸 뒤 잰다.
- 🔴 첫 사용자 편집에서 본문 전체가 다시 직렬화돼 Markdown 표기가 바뀐다(`\*` · `1\.` · `&lt;` · `  \n` · `&nbsp;` …). 렌더는 같다. 표기를 지키며 고치려면 「원문」.
- `LegalDocumentEditor` 기본 도움말(`messages.editorHint`)이 "Enter 는 새 문단, Shift+Enter 는 줄바꿈입니다. Markdown 원문을 직접 고치려면 「원문」으로 바꾸세요." 로 바뀌었다 — 덮어 쓰는 앱은 그대로.
- README 「마크다운 편집기」(모드 · 키 · 표기 변화 · 붙여넣기 · 알려진 차이).
```

- [ ] **Step 6: CLAUDE.md**

1. 패키지 표 admin-ui 행은 그대로.
2. 진행표 「Phase 2 후속 PR 2g」 행 아래에:

```markdown
| Phase 1 후속 PR #3j — `MarkdownEditor` WYSIWYG(TipTap 3 + `@tiptap/markdown` · 「원문」 전환 · 충실도 어댑터 열 · emit 디바운스 · CodeMirror peer 제거) | 완료 | 스펙 `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md` · 플랜 `docs/superpowers/plans/2026-11-01-admin-ui-wysiwyg-editor.md` · 검증 `docs/verification/2026-11-01-admin-ui-wysiwyg-editor.md` |
```

3. 「### `@ssworks/admin-ui`」 규약 절 끝에:

```markdown
- 브라우저 `prompt` · `confirm` · `alert` 를 쓰지 않는다 — 묻는 것은 `BaseDialog` · 킷 확인 창(`createConfirm`). `MarkdownEditor` 는 TipTap 이고 값은 Markdown 이다 — 렌더(`renderMarkdown`)를 편집기에 맞추지 않고 편집기(`editor-markdown.ts` 어댑터)를 렌더에 맞춘다. 어댑터를 고치면 왕복 테스트의 오라클 넷(렌더 동일 · 구조 · 4회 왕복 · `doc.check()`)이 지킨다.
```

- [ ] **Step 7: `docs/01-phase0.md` §8**

"전권 전용 · 서버 문구 PR 2g(2026-10-20) 완료 — …" 문단 뒤(「다음:」 앞)에:

```markdown
admin-ui `MarkdownEditor` WYSIWYG PR #3j(2026-11-01) 완료 — TipTap 3 + `@tiptap/markdown`(ProseMirror · marked) + 「원문」 전환, 공개 API(props 넷 · Markdown v-model) 그대로, 충실도 어댑터 열(ringside p1d 코드 이식) · 오라클 넷 · emit 디바운스 200ms · CodeMirror peer 둘 → TipTap peer 열둘(정확 판 3.32.0) + marked + @floating-ui/dom(스펙 `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md` · 플랜 `docs/superpowers/plans/2026-11-01-admin-ui-wysiwyg-editor.md` · 검증 `docs/verification/2026-11-01-admin-ui-wysiwyg-editor.md`). 입력은 ringside 기능 요청(`docs/reports/2026-10-31-admin-kit-report-wysiwyg-editor.md`). 템플릿 `preset/admin` 의존 · 핀은 함께 고쳤다(push 는 사람).
```

- [ ] **Step 8: HANDOFF**

1. 머리 날짜 `# HANDOFF — 2026-10-20` → `2026-11-01`.
2. 「지금 상태」 admin-ui 행 끝에 ` · **PR #3j**(MarkdownEditor WYSIWYG — TipTap 3.32.0 + @tiptap/markdown · 원문 전환 · 어댑터 열 · 디바운스 · CodeMirror peer 제거 — \`main\` 에 로컬 병합, 0.10.0 예정)` 를 더한다.
3. 「PR 2g 가 넘긴 것」 묶음 뒤에:

```markdown
- **PR #3j 가 넘긴 것(2026-11-01)** — 입력 `docs/reports/2026-10-31-admin-kit-report-wysiwyg-editor.md` · 스펙 `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md` · 플랜 `docs/superpowers/plans/2026-11-01-admin-ui-wysiwyg-editor.md` · 검증 `docs/verification/2026-11-01-admin-ui-wysiwyg-editor.md`
  - 킷이 정한 것(보고문이 맡긴 넷): 「원문」 탭 둔다 · Image `![]()` 입력 규칙 켠다(킷은 거르지 않는다) · emit 디바운스 200ms(상수 — 포커스 잃음 · 전환 · readonly · 언마운트 flush) · 어댑터 export 는 **나중**(넷째 패키지 후보 — admin-shared 는 서버가 import 하고 admin-ui 서브패스는 Vuetify peer 를 끌어온다. ringside 웹이 복사본을 걷고 싶을 때 스펙을 연다). peer 는 보고문 11 + `@tiptap/extension-code`(기본 Code 가 다른 마크를 전부 배제해 링크 걸린 코드가 링크를 잃는다 — Nuxt UI 처럼 `excludes: 'code'`).
  - **ringside 적용법(0.10.0 공개 하루 뒤 설치 — `minimumReleaseAge`, 자동으로 붙은 `minimumReleaseAgeExclude` 는 커밋하지 않는다)**: ① `pnpm-workspace.yaml` 카탈로그에서 `codemirror` · `@codemirror/state` 빼고 `@tiptap/vue-3` 3.32.0 · `@tiptap/extension-code` 3.32.0(web 이 이미 핀한 열 + vue-3 — 같은 판) · `@floating-ui/dom` 더함 ② `apps/admin/package.json` 에 열넷 ③ 세 패키지 0.10.0 ④ CLAUDE.md 킷 절 peer 목록 · "he-tree · codemirror" 문장 ⑤ 상향 점검 목록의 `markdown.test.ts` · `render.test.ts`(렌더는 안 바뀌었다 — 초록 확인만) ⑥ `MarkdownSettingField` 무변경 — 입력 직후 값을 재는 테스트가 있으면 편집 영역에 `blur` 뒤 ⑦ 사람 브라우저 확인은 운영 원칙 폼 하나(한글 IME · 붙여넣기 · 원문 전환). 알려진 킷 결함 메모에 넣을 것 없음.
  - **템플릿 세션 입력**(`preset/admin` — 이번에 한 것 · 남은 것): 한 것 — `packages/frontend/package.json` codemirror 둘 → TipTap 열둘 + marked + @floating-ui/dom · 킷 핀 0.5.0 → 0.10.0(frontend · backend) · `vite.config.mts` `vuetifyLayerOrder()`(로컬 브랜치 `preset/admin` 커밋, push 는 사람 · 🔴 `pnpm-lock.yaml` 은 0.10.0 공개 뒤 `pnpm install` 로 갱신). 남은 것(그대로) — `64px` → `var(--v-layout-top, 64px)` · 감사 로그 · IP 접근 제어 페이지 · `useRoleEditor({ fullAccessOnly })` · 카탈로그 `fullAccessOnly`(「PR #3h · #3i · 2g 가 넘긴 것」).
  - 사람이 확인할 것: 한글 IME(데스크톱 Chrome · Android Chrome · iOS Safari — 조합 중 외부 값 변경 · 조합 끝과 emit 타이밍 · 디바운스 200ms 와 조합) · 붙여넣기(스크린숏 · 평문 `1.`/`-`/날짜 줄 · Word · 한글 문서 HTML) · 도구 막대 클릭 뒤 포커스 복귀 · 되돌리기 범위 · 다크 테마 색(편집기 · 대화상자) · 약관 화면에서 한 글자 고쳐 발행 → 표기 변화 확인(렌더 같음).
  - TipTap 3.32.0 버그 둘(ringside 가 보고 여부를 정한다 — 킷은 어댑터 ⑨ · ⑩ 으로 비켜 간다): `@tiptap/extension-list` 번호 목록 토크나이저의 중첩 둘째 문단 어긋남 · `@tiptap/markdown` 이 글자 문단 속 그림을 인라인으로 읽음. TipTap 을 올릴 때 오라클 ③ · ④ 와 테스트 머리의 "끄면 빨개지는 건수" 가 어댑터를 걷어도 되는지 알려 준다.
  - 어댑터 export(넷째 패키지) · 이미지 업로드 · 표 편집은 비범위(스펙 §10).
```

- [ ] **Step 9: prettier · 커밋**

Run: `pnpm format && pnpm format:check`
Expected: 통과(CHANGELOG · docs/reports · verification 은 ignore).

```bash
git add packages/admin-ui/README.md .changeset/wysiwyg-markdown-editor.md CLAUDE.md docs/01-phase0.md docs/HANDOFF.md
git commit -m "docs: PR #3j — README 「마크다운 편집기」 · changeset minor · 진행 문서 · HANDOFF 넘긴 것

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: 전체 검사 · changeset status · 스모크 · 검증 기록

**Files:**

- Create: `docs/verification/2026-11-01-admin-ui-wysiwyg-editor.md`

- [ ] **Step 1: `pnpm check`**

Run: `pnpm check`
Expected: lint → typecheck → test → build → check:dts 모두 초록. 테스트 수(admin-ui · 워크스페이스)를 적어 둔다. 빌드 산출 `packages/admin-ui/dist/index.js` 에 `codemirror` 문자열이 없고 `@tiptap/` import 가 external 로 남아 있다:

Run: `node -e "const s=require('fs').readFileSync('packages/admin-ui/dist/index.js','utf8');console.log(/codemirror/.test(s), /from\s+['\"]@tiptap\//.test(s), /from\s+['\"]marked['\"]/.test(s))"`
Expected: `false true true`.

- [ ] **Step 2: changeset status**

Run: `pnpm changeset status --verbose`
Expected: `@ssworks/admin-ui` minor → fixed 라 세 패키지 0.10.0, major 없음.

- [ ] **Step 3: `/smoke`**

`/smoke` 스킬 절차대로(짧은 경로 `%LOCALAPPDATA%\Temp\aksj`): tarball(admin-shared · admin-ui) + peer 열넷(`@tiptap/*` 3.32.0 · marked · @floating-ui/dom · pinia 4 · @vue/devtools-api 8 · he-tree · axios · vue-router · vuetify) 설치 → `pnpm peers check` 경고 없음 → App.vue 가 `MarkdownEditor`(`default-mode="source"` · `:messages`) · `LegalDocumentEditor` · `DEFAULT_MARKDOWN_EDITOR_MESSAGES` · `MarkdownEditorMode` 타입을 쓴다 → `vue-tsc --noEmit` → `vite build`. 스모크 앱은 지우지 말고 둔다(Task 13 실브라우저가 `vite dev` 로 쓴다).

- [ ] **Step 4: 검증 기록을 쓴다**

`docs/verification/2026-11-01-admin-ui-wysiwyg-editor.md`(prettier ignore 대상 — 손으로 정렬):

```markdown
# 검증 — admin-ui MarkdownEditor WYSIWYG (PR #3j, 2026-11-01)

스펙 `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md` §8.

## 1. 저장소

- 브랜치 `feat/admin-ui-wysiwyg-editor` · 끝 커밋 `<해시>`(이 기록 커밋 직전)
- `pnpm check` 초록 — admin-ui <n> 테스트 · 워크스페이스 <n>
- `pnpm format:check` 통과
- `changeset status` — minor: admin-ui → 세 패키지 0.10.0, major 없음
- 어댑터를 끄면 빨개지는 건수: ⑥ <n> · ⑨ <n> · ⑩ <n>(`editor-markdown.test.ts` 머리)
- dist: `codemirror` 없음 · `@tiptap/*` · `marked` external

## 2. 스모크(`$LOCALAPPDATA/Temp/aksj`)

- tarball: admin-shared 0.9.0 · admin-ui 0.9.0(+3j) · peer 열넷 · `pnpm peers check` <결과>
- `vue-tsc --noEmit` <결과> · `vite build` <결과>

## 3. 템플릿(Task 12)

## 4. 실브라우저(Task 13)

## 5. 남은 것
```

`<…>` 자리는 실측으로 채운다(남기지 않는다).

- [ ] **Step 5: 커밋**

```bash
git add docs/verification/2026-11-01-admin-ui-wysiwyg-editor.md
git commit -m "docs: PR #3j 검증 기록 — pnpm check · changeset status · 스모크

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: 템플릿 `preset/admin`(worktree · push 는 사람)

**Files(템플릿 저장소 `C:\workspace\kim5257-project-template`, 브랜치 `preset/admin`):**

- Modify: `packages/frontend/package.json`
- Modify: `packages/backend/package.json`
- Modify: `packages/frontend/vite.config.mts`
- Modify(있으면): `CLAUDE.md` 의 킷 peer 문장

- [ ] **Step 1: worktree 를 만든다**

```bash
cd /c/workspace/kim5257-project-template
git fetch origin
git worktree add "$LOCALAPPDATA/Temp/akt-admin" -b preset/admin origin/preset/admin
```

(로컬 브랜치 `preset/admin` 이 이미 있으면 `-b` 없이 `git worktree add "$LOCALAPPDATA/Temp/akt-admin" preset/admin`.)

- [ ] **Step 2: 의존 · 핀**

worktree 의 `packages/frontend/package.json` `dependencies`: `"@codemirror/state"` · `"codemirror"` 두 줄을 지우고, `"@ssworks/admin-shared": "0.10.0"` · `"@ssworks/admin-ui": "0.10.0"`, 그리고 알파벳 자리에:

```json
    "@floating-ui/dom": "^1.8.0",
    "@tiptap/core": "3.32.0",
    "@tiptap/extension-code": "3.32.0",
    "@tiptap/extension-code-block": "3.32.0",
    "@tiptap/extension-document": "3.32.0",
    "@tiptap/extension-image": "3.32.0",
    "@tiptap/extension-list": "3.32.0",
    "@tiptap/extension-paragraph": "3.32.0",
    "@tiptap/extension-text": "3.32.0",
    "@tiptap/markdown": "3.32.0",
    "@tiptap/pm": "3.32.0",
    "@tiptap/starter-kit": "3.32.0",
    "@tiptap/vue-3": "3.32.0",
    "marked": "^17.0.6",
```

`packages/backend/package.json`: `"@ssworks/admin-server": "0.10.0"` · `"@ssworks/admin-shared": "0.10.0"`.

- [ ] **Step 3: `vuetifyLayerOrder()`**

`packages/frontend/vite.config.mts`: import 줄에 `import { vuetifyLayerOrder } from '@ssworks/admin-ui/vite';` 를 더하고(세미콜론 — 템플릿 규약), `plugins: [` 첫 항목으로 `vuetifyLayerOrder(),` 를 넣는다(순서 무관). 위에 주석 한 줄: `// 킷 0.8.0 이상 — Vuetify CSS 레이어 순서를 <head> 맨 앞에 선언한다(admin-ui README 「Vuetify 프리셋」)`.

- [ ] **Step 4: CLAUDE.md(템플릿)**

`git grep -n -i codemirror` 로 템플릿 CLAUDE.md · docs 를 찾아 "codemirror" 를 말하는 peer 문장을 "`@tiptap/*` 열둘(정확 판) · `marked` · `@floating-ui/dom`" 으로 고친다. 없으면 건너뛴다.

- [ ] **Step 5: 로컬 tarball 로 설치 · typecheck · build 를 확인한다(lockfile 은 커밋하지 않는다)**

킷에서 `pnpm -r build` 뒤 tarball 셋을 만든다(`pnpm --filter @ssworks/admin-shared pack --pack-destination "$LOCALAPPDATA/Temp/aksj"` 등 — Task 11 스모크가 만든 둘 + admin-server). worktree 의 루트 `package.json` 에 **임시로**:

```json
  "pnpm": { "overrides": { "@ssworks/admin-shared": "file:<tarball 경로>", "@ssworks/admin-ui": "file:<…>", "@ssworks/admin-server": "file:<…>" } }
```

을 넣고 `pnpm install` → `pnpm --filter @project/frontend typecheck` → `pnpm --filter @project/frontend build`(둘 다 통과해야 한다) → 임시 overrides 와 `pnpm-lock.yaml` 변경을 `git checkout -- package.json pnpm-lock.yaml` 로 되돌린다. 실패하면(예: `@floating-ui/dom` 미해석 · peer 경고) 원인을 고친 뒤 다시.

- [ ] **Step 6: 커밋 · worktree 정리**

```bash
cd "$LOCALAPPDATA/Temp/akt-admin"
git add packages/frontend/package.json packages/backend/package.json packages/frontend/vite.config.mts CLAUDE.md
git commit -m "chore: 킷 0.10.0 — MarkdownEditor WYSIWYG peer(codemirror 둘 → @tiptap/* 열둘 · marked · @floating-ui/dom) · vuetifyLayerOrder

잠금 파일은 0.10.0 공개 뒤 pnpm install 로 갱신한다.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
cd /c/workspace/kim5257-project-template
git worktree remove "$LOCALAPPDATA/Temp/akt-admin"
git log --oneline -1 preset/admin
```

(`CLAUDE.md` 를 안 고쳤으면 `git add` 에서 뺀다.) 검증 기록 §3 에 결과(커밋 해시 · typecheck · build)를 적고 킷 저장소에 커밋한다.

---

### Task 13: 실브라우저 확인 · 최종 리뷰 · 병합 준비

- [ ] **Step 1: 스모크 앱을 띄운다**

`$LOCALAPPDATA/Temp/aksj` 에서 `pnpm exec vite --port 5179`(백그라운드). App.vue 에 `MarkdownEditor` 하나 + `MarkdownView` 미리보기 + 값 표시 `<pre>` 가 있게 한다(없으면 더한다 — 스모크 앱만 고친다).

- [ ] **Step 2: Chrome 도구로 확인한다**(이 세션의 `mcp__claude-in-chrome__*` — ToolSearch 로 한 번에 로드. 없으면 사람에게 넘기고 기록에 적는다)

| 항목                                                 | 기대                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| 글자 치기 → 200ms 뒤 `<pre>` 값 갱신 · 미리보기 동일 | 값 `본문…`, 미리보기 `<p>`                                  |
| 굵게 · 제목 2 · 글머리 · 인용 · 구분선 단추          | 값에 `**` · `## ` · `- ` · `> ` · `---`, 미리보기 같은 구조 |
| 링크: 선택 → 단추 → 대화상자 → `example.com` Enter   | `[…](https://example.com)` · `prompt` 없음                  |
| 링크: `javascript:alert(1)`                          | 「사용할 수 없는 주소입니다.」 · 대화상자 열린 채           |
| 원문 → textarea 에 같은 값 · 고치기 → 서식에 반영    | 값 보존 · 되돌리기 비활성                                   |
| 평문 붙여넣기 `1. 존 존스\n- 메인\n# 기대`           | 값 `1\. …` · 미리보기 문단 셋                               |
| Shift+Enter · Enter                                  | `  \n` · `\n\n`                                             |
| 건드리지 않은 본문(구분선으로 끝남) 마운트           | 값 그대로(`\n\n` 안 붙음)                                   |
| 다크 테마(`vuetify.theme.change('dark')`)            | 편집기 배경 · 글자 · 대화상자 색이 따라옴                   |
| 콘솔                                                 | 오류 없음                                                   |

결과를 검증 기록 §4 표로 적는다. 한글 IME · 모바일은 §5 「남은 것」에 사람 확인으로.

- [ ] **Step 3: 최종 리뷰**

`superpowers:requesting-code-review` 로 `superpowers:code-reviewer`(model: opus) 에게 브랜치 전체를 스펙 대조로 리뷰받는다 — 중점은 스펙 §9(W4 `lastEmitted` 경로 · W5 updateState 뒤 반응성 · flush 빠지는 경로 · A3 겹친 마크 직렬화 · 입력 규칙 그림 · 접근성). Critical · Important 는 고치고 커밋, 나머지는 HANDOFF 「넘긴 것」에.

- [ ] **Step 4: 마무리**

Run: `pnpm check && pnpm format:check`
Expected: 초록.

검증 기록 끝 커밋 해시를 채우고 커밋. 그다음 `superpowers:finishing-a-development-branch` — 이 저장소 관례는 `main` 에 로컬 병합(`git checkout main && git merge --no-ff feat/admin-ui-wysiwyg-editor`), **push 는 사람**(`git push` 는 허용 목록에서 거부). 병합 커밋 메시지 `feat(admin-ui): PR #3j — MarkdownEditor WYSIWYG(TipTap 3 + @tiptap/markdown · 원문 전환)`.

---

## 자체 점검(플랜 작성 뒤)

- 스펙 대조: R1 도구 막대(Task 7 · 8) · R2 어댑터 ①~⑩(Task 2 · 4) + 오라클 넷(Task 3) · R3 원문 탭(Task 7 · 8) · R4 D3 · D4(Task 7) · R5 디바운스(Task 7) · R6 peer(Task 1) · W16 도움말(Task 9) · §7 문서(Task 10) · §7-4 템플릿(Task 12) · §8 검증(Task 11 · 13). 결정 ②(입력 규칙) Task 3 Step 4. 결정 ⑤ `EditorCode` Task 4.
- 이름 일관성: `createMarkdownEditorExtensions` · `markdownOptions` · `KitFidelityTokenizer` · `STARTER_KIT_OPTIONS` · `EditorCode` · `EditorParagraph` · `EditorDocument` · `EditorListItem` · `EditorText` · `EditorCodeBlock` · `ImageSplitOnParse` · `escapeLineStart` · `codeFence` · `normalizeLinkHref`(Task 3 · 4), `createMarkdownHarness` · `mountHost` · `normalizeBlocks` · `same` · `sameStructure` · `stableOver`(Task 3), `MARKDOWN_EDITOR_EMIT_DELAY_MS` · `DEFAULT_MARKDOWN_EDITOR_MESSAGES` · `MarkdownEditorMessages` · `MarkdownEditorMode`(Task 5 · 7 · 8), `MarkdownLinkDialog` props `modelValue` · `href` · `hasLink` · `apply` · `remove` · `messages`(Task 6 · 7).
- 자리 표시: 검증 기록의 `<…>` 는 실측으로 채우는 자리이고 테스트 머리의 `__` 도 같다(Task 4 Step 3) — 남기지 않는다.
