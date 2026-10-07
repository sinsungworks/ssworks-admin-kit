# admin-ui 약관(법적 문서 편집 · 발행 · 이력) Implementation Plan (Phase 1 PR #3e)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** axion · gise 에 복사돼 있던 약관 화면(종류 탭 · 편집기 | 미리보기 · 발행 · 이력)을 `@ssworks/admin-shared`(렌더러 · 스키마)와 `@ssworks/admin-ui`(`MarkdownView` · `MarkdownEditor` · `useLegalDocuments` · `LegalDocumentEditor`)로 옮긴다.

**Architecture:**

- **admin-shared:** `renderMarkdown`(markdown-it `html: false`)과 약관 스키마를 둔다. 관리자 미리보기 · Phase 2 서버 · 공개 웹이 같은 함수를 쓴다.
- **admin-ui 부품:** CodeMirror 를 `v-model` 로 감싼 `MarkdownEditor` 와 킷 유일의 `v-html` 자리 `MarkdownView`.
- **admin-ui 흐름 · 화면:** 흐름 composable `useLegalDocuments` 가 화면 한 벌 `LegalDocumentEditor` 의 바인딩을 낸다. 페이지는 `v-bind="legal.editor.value"` 한 줄이다(3d `useTeamTree` 와 같은 짝).

**Tech Stack:** Vue 3.5 · Vuetify 4.2 · CodeMirror 6(`codemirror` 6.0.2 · `@codemirror/state` 6.7.6) · markdown-it 15 · zod 4 · vitest 4 + happy-dom · @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-10-07-admin-ui-legal-design.md` — 결정 D1~D21 · §4 공개 API · §7 테스트 계약 · §9 서버 계약. 플랜과 스펙이 어긋나면 스펙이 이긴다.

**Branch:** `feat/admin-ui-legal`(스펙 커밋 `c8d05ea` 위). `main` 에서 직접 작업하지 않는다.

## Global Constraints

- **새 의존:**
  - admin-shared `dependencies`: `"markdown-it": "^15.0.2"`(자체 타입 포함 — `@types/markdown-it` 를 들이지 않는다)
  - admin-ui `peerDependencies`(필수) + `devDependencies`: `"codemirror": "^6.0.2"` · `"@codemirror/state": "^6.7.6"`
  - admin-ui `devDependencies` 만: `@codemirror/commands`(테스트 전용, peer 아님)
  - `@codemirror/view` · `@codemirror/theme-one-dark` · `@codemirror/lang-markdown` 은 들이지 않는다.
- **킷 규약:**
  - SFC 는 Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import 한다.
  - 스타일은 순수 CSS `<style scoped>`(sass 없음)다. 전역 CSS 를 import 하지 않는다.
  - 스토어 · 라우터를 import 하지 않는다.
- **import 규칙:**
  - `import type` 을 분리한다(eslint `consistent-type-imports`).
  - 내부 상대 import 는 `.js` 확장자(`./legal-document.js`)를 쓰고, `.vue` 는 그대로 둔다.
- **`console.log` 금지:** `warn` · `error` 만 쓴다.
- **머리 주석:** 정본에서 가져온 파일은 머리 주석에 **출처**(`정본: …`)와 **바꾼 점**을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- **제출 버튼:** `:disabled` 와 `:loading` 을 늘 한 벌로 둔다(`:loading` 은 클릭을 안 막는다).
- **`v-model`:** 기본 `modelValue` 하나만 쓴다. 이름 있는 모델(`v-model:draft`)을 만들지 않는다.
- **Boolean prop:** `undefined` 기본값을 주지 않는다.
- **테스트:**
  - 파일은 `src/**/*.test.ts` 이고, DOM 이 필요하면 파일 머리에 `// @vitest-environment happy-dom` 을 단다.
  - 오버레이(VDialog)를 여는 테스트는 `installVisualViewport()` 를 모듈 최상단에서 부른다.
  - 색 · 높이는 재지 않는다. 테스트 전용 `data-testid` 를 심지 않는다 — 사람이 읽는 글자 · `aria-label` · `name` 으로 찾는다.
- **문구는 스펙 §4 기본값 그대로다(한국어).** 예:
  - '새 버전 발행'
  - '시행 중'
  - '편집 중인 내용 버리기'
  - '버리고 이동'
  - '발행하면 새 버전이 바로 시행됩니다. 기존 버전은 이력에 그대로 남습니다.'
- **`LEGAL_BODY_MAX_LENGTH = 1_000_000`.**
- **포맷:** prettier(세미콜론 없음 · 작은따옴표 · 100자 · `vueIndentScriptAndStyle`)를 따른다. Task 끝마다 `pnpm format` 이 아니라 `pnpm exec prettier --write <바꾼 파일들>` 을 돌린다.
- **Windows · Linux 양쪽:**
  - `> /dev/null` · `2>/dev/null` 금지(Windows 에서 `NUL` 파일이 생긴다).
  - 파일을 python · sed 로 다시 쓰지 않는다(개행이 뒤집힌다). 개행은 LF.
- **admin-shared 를 고친 뒤:** `pnpm --filter @ssworks/admin-shared build` 를 돌려야 admin-ui 가 본다(`dist/` 로 import).
- **커밋:** 한국어 conventional commits 이고, 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>` 이다. `git push` 하지 않는다.

## Review Focus

테스트가 원리적으로 못 잡거나 일부만 잡는 것. 리뷰어는 각 줄을 코드 경로로 확인한다.

1. **한글 IME 조합** — 조합 중 입력 → emit → 부모 → prop 으로 돌아온 값이 문서와 같아 치환이 일어나지 않아야 조합이 이어진다. happy-dom 은 조합을 재현할 수 없다.
   - 고정하는 테스트: 전제 조건 "같은 값이 돌아오면 문서 객체가 그대로" 는 Task 4 에서, "초안은 받은 그대로 보관" 은 Task 5 에서 고정한다.
   - 리뷰로 볼 것: `useLegalDocuments.setDraft` 와 `LegalDocumentEditor` 사이에 값을 고치는 코드(트림 · 정규화)가 없는지.
2. **`@codemirror/state` 두 벌** — 소비자 설치에서 두 벌이 실리면 CodeMirror 가 깨진다.
   - Task 2 의 계약 테스트가 "같은 인스턴스" 가드를 갖는다.
   - Task 8 의 `/smoke` 가 패킹한 소비 앱의 typecheck · build 로 확인한다.
3. **아주 긴 본문** — 입력마다 미리보기를 렌더한다(디바운스 없음).
   - 상한 경계(최대 통과 · 최대+1 막힘)는 Task 1 · Task 5 에서 고정한다.
   - 성능은 알려진 한계로 README 에 적는다(Task 8).
4. **테마 전환 색** — 색은 잴 수 없다.
   - Task 4 가 `EditorView.darkTheme` 판정이 Vuetify 테마를 따르는지 고정한다.
   - 색 자체는 README 의 수동 확인 항목이다(Task 8).
5. **확인 대화상자가 열린 사이의 경합** — 권한 회수 · 종류 전환 · 재조회.
   - Task 5 가 "확인 대기 중 `canWrite` false → 안 보냄" 과 "확인 대기 중 종류가 바뀜 → 안 보냄" 을 고정한다.
   - 리뷰로 볼 것: 액션 안에서 `publishable()` 과 `kind` 를 다시 보는지.

## 파일 구조

| 파일                                                                                                                                 | 책임                           | Task  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ----- |
| `packages/admin-shared/src/markdown.ts` · `markdown.test.ts`                                                                         | `renderMarkdown` — 안전한 HTML | 1     |
| `packages/admin-shared/src/legal.ts` · `legal.test.ts`                                                                               | 약관 스키마 · 상수             | 1     |
| `packages/admin-shared/src/index.ts` · `package.json`                                                                                | export · markdown-it 의존      | 1     |
| `packages/admin-ui/package.json` · `vite.config.ts`                                                                                  | CodeMirror peer · external     | 2     |
| `packages/admin-ui/src/utils/format-date-time.ts`                                                                                    | 날짜 기본 표기(옮김)           | 2     |
| `packages/admin-ui/src/components/session/session-table.ts` · `SessionTable.vue` · `session-table.render.test.ts`                    | 옮긴 함수를 가져다 씀          | 2     |
| `packages/admin-ui/src/components/markdown/codemirror.render.test.ts`                                                                | CodeMirror 계약(happy-dom)     | 2     |
| `packages/admin-ui/src/components/markdown/MarkdownView.vue` · `markdown-view.render.test.ts`                                        | 마크다운 보기                  | 3     |
| `packages/admin-ui/src/components/markdown/MarkdownEditor.vue` · `markdown-editor.render.test.ts`                                    | CodeMirror `v-model`           | 4     |
| `packages/admin-ui/src/components/legal/legal-document.ts`                                                                           | 타입 · 기본 문구 · 표기 함수   | 5 · 6 |
| `packages/admin-ui/src/composables/useLegalDocuments.ts` · `useLegalDocuments.test.ts`                                               | 흐름                           | 5     |
| `packages/admin-ui/src/components/legal/LegalDocumentEditor.vue` · `legal-document-editor.render.test.ts` · `legal-document.test.ts` | 화면 한 벌                     | 6     |
| `packages/admin-ui/src/composables/useLegalDocuments.render.test.ts`                                                                 | 흐름 + 화면 함께               | 7     |
| `packages/admin-ui/src/index.ts`                                                                                                     | "── 마크다운 · 약관 ──" 절     | 7     |
| 두 패키지 `README.md` · `.changeset/admin-ui-legal.md` · `CLAUDE.md` · `docs/HANDOFF.md` · `docs/01-phase0.md`                       | 문서                           | 8     |

---

### Task 1: admin-shared — `renderMarkdown` · 약관 스키마

**Files:**

- Modify: `packages/admin-shared/package.json`(의존 추가 — pnpm 명령으로)
- Create: `packages/admin-shared/src/markdown.ts`, `packages/admin-shared/src/markdown.test.ts`
- Create: `packages/admin-shared/src/legal.ts`, `packages/admin-shared/src/legal.test.ts`
- Modify: `packages/admin-shared/src/index.ts`(끝에 두 절 추가)

**Interfaces:**

- Consumes: 없음(zod 는 이미 peer)
- Produces(뒤 Task 가 `@ssworks/admin-shared` 에서 import):
  - `renderMarkdown(source: string | null | undefined): string`
  - `LEGAL_BODY_MAX_LENGTH: 1_000_000` · `legalBodySchema`
  - `interface AdminLegalDocument { legalDocNo: bigint; kind: string; body: string; contentHash: string; publishedAt: string; publishedByUserNo: bigint | null; publishedByUserName: string | null }`
  - `type AdminLegalHistoryItem = Omit<AdminLegalDocument, 'body'>`
  - `interface AdminLegalPublish { kind: string; body: string; baseLegalDocNo: bigint | null }`
  - `type AdminLegalPublishResult = { legalDocNo: bigint; contentHash: string }`
  - 스키마: `adminLegalDocumentSchema` · `adminLegalHistoryItemSchema` · `adminLegalCurrentSchema`(`{ item }`) · `adminLegalHistorySchema`(`{ items }`) · `adminLegalPublishSchema` · `adminLegalPublishResultSchema`
  - 타입: `AdminLegalCurrent` · `AdminLegalHistory`

- [ ] **Step 1: markdown-it 을 의존으로 넣는다**

Run: `pnpm --filter @ssworks/admin-shared add markdown-it@^15.0.2`
Expected: `packages/admin-shared/package.json` 에 `"dependencies": { "markdown-it": "^15.0.2" }` 가 생긴다(위치는 pnpm 이 정한다). `pnpm-lock.yaml` 갱신. `@types/markdown-it` 는 넣지 않는다 — 15 는 `dist/markdown-it.d.mts` 를 자체로 싣는다.

- [ ] **Step 2: `renderMarkdown` 테스트를 쓴다(🔴 계약)**

Create `packages/admin-shared/src/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown.js'

// 🔴 이 파일이 곧 계약이다(gise `test/content-markdown.test.ts` 와 같은 뜻) — XSS 묶음을 지우면 `html: true` 로
//    바꿔도 아무도 모른다. 관리자 미리보기 · 서버 공개 렌더 · 공개 웹이 모두 이 함수를 쓴다(3e 스펙 D1).

describe('renderMarkdown — 🔴 원문 HTML · 위험한 링크를 막는다', () => {
  it('원문 <script> 는 이스케이프된다', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('원문 <img onerror> 는 이스케이프된다', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it.each([
    ['링크 javascript:', '[x](javascript:alert(1))'],
    ['이미지 javascript:', '![x](javascript:alert(1))'],
    ['링크 data:text/html', '[x](data:text/html,<script>alert(1)</script>)'],
  ])('%s 는 href · src 가 되지 않는다', (_label, source) => {
    const html = renderMarkdown(source)
    expect(html).not.toMatch(/href="javascript:|src="javascript:|href="data:/i)
    expect(html).not.toContain('<script')
  })
})

describe('renderMarkdown — 렌더', () => {
  it('제목 · 목록을 그린다', () => {
    expect(renderMarkdown('# 제1조')).toBe('<h1>제1조</h1>\n')
    expect(renderMarkdown('- 가\n- 나')).toBe('<ul>\n<li>가</li>\n<li>나</li>\n</ul>\n')
  })

  it('평문 URL 을 링크로 만든다(linkify)', () => {
    expect(renderMarkdown('문의: https://example.com/help')).toContain(
      '<a href="https://example.com/help">https://example.com/help</a>',
    )
  })

  it('줄 하나 바꿈은 <br> 이 아니다(breaks: false)', () => {
    expect(renderMarkdown('첫 줄\n둘째 줄')).toBe('<p>첫 줄\n둘째 줄</p>\n')
  })

  it.each([null, undefined, ''])('%s 는 빈 문자열', (source) => {
    expect(renderMarkdown(source)).toBe('')
  })

  it('같은 입력이면 같은 출력이다', () => {
    const source = '# 제1조\n\n본문 [도움말](https://example.com)'
    expect(renderMarkdown(source)).toBe(renderMarkdown(source))
  })
})
```

- [ ] **Step 3: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-shared exec vitest run src/markdown.test.ts`
Expected: FAIL — `Failed to resolve import "./markdown.js"`(파일 없음)

- [ ] **Step 4: `markdown.ts` 를 쓴다**

Create `packages/admin-shared/src/markdown.ts`:

```ts
import MarkdownIt from 'markdown-it'

// 마크다운 → 안전한 HTML. 관리자 미리보기(admin-ui `MarkdownView`) · 서버(공개 `bodyHtml`) · 공개 웹이 이 함수
// 하나를 쓴다.
//
// 정본: ssworks-gise-home packages/shared/src/content/markdown.ts
//       (ssworks-axion-admin packages/frontend/src/components/common/markdown-view.util.ts 와 같은 옵션)
// 바꾼 점:
//  - 인스턴스를 처음 부를 때 만든다 — import 만으로는 아무 일도 일어나지 않게(3e 스펙 D2). markdown-it 이
//    `sideEffects` 를 선언하지 않아, 안 쓰는 소비자 번들에서 실제로 빠지는지는 번들러가 판단한다.
//
// 🔴 이 파일이 admin-shared 에 있는 이유: 관리자 미리보기와 공개 렌더가 **같은 함수**를 써야 "관리자가 본 미리보기" 와
//    "사용자가 동의한 원문" 이 갈리지 않는다(gise). 렌더러가 두 벌이면 한쪽만 고쳐진다.
// 🔴 보안 표면 전체가 아래 옵션이다. 별도 sanitizer 도, markdown-it 플러그인도 없다.
//    - `html: false` — 원문 HTML 을 통째로 이스케이프한다. **저장형 XSS 방어의 전부다.** true 로 바꾸지 않는다.
//    - `javascript:` · `vbscript:` · `file:` · `data:`(이미지 제외) 링크는 markdown-it 기본 `validateLink` 가 막는다.
//    그래서 `markdown.test.ts` 가 곧 계약이다.

let md: MarkdownIt | undefined

/** 마크다운 원문 → 안전한 HTML. null · undefined · '' 은 '' */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return ''
  md ??= new MarkdownIt({ html: false, linkify: true, breaks: false })
  return md.render(source)
}
```

- [ ] **Step 5: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-shared exec vitest run src/markdown.test.ts`
Expected: PASS(12). 타입 해석이 실패하면(`Cannot find module 'markdown-it'` 또는 default import 오류) `pnpm --filter @ssworks/admin-shared typecheck` 출력과 함께 멈추고 보고한다(스펙 §8 위험 ③).

- [ ] **Step 6: 약관 스키마 테스트를 쓴다**

Create `packages/admin-shared/src/legal.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'
import {
  LEGAL_BODY_MAX_LENGTH,
  adminLegalCurrentSchema,
  adminLegalDocumentSchema,
  adminLegalHistoryItemSchema,
  adminLegalHistorySchema,
  adminLegalPublishResultSchema,
  adminLegalPublishSchema,
  legalBodySchema,
  type AdminLegalDocument,
  type AdminLegalHistoryItem,
  type AdminLegalPublish,
} from './legal.js'

const HASH = '0123456789abcdef'.repeat(4)

const DOC: AdminLegalDocument = {
  legalDocNo: 12n,
  kind: 'TERMS',
  body: '# 제1조 (목적)\n',
  contentHash: HASH,
  publishedAt: '2026-09-01T05:00:00.000Z',
  publishedByUserNo: 7n,
  publishedByUserName: '김관리',
}

describe('adminLegalDocumentSchema', () => {
  it('문서를 받는다', () => {
    expect(adminLegalDocumentSchema.parse(DOC)).toEqual(DOC)
  })

  it('번호는 bigint 다', () => {
    expect(adminLegalDocumentSchema.safeParse({ ...DOC, legalDocNo: 12 }).success).toBe(false)
  })

  it('🔴 publishedAt 은 UTC ISO 만 — 오프셋 · 공백 표기는 거부한다', () => {
    expect(
      adminLegalDocumentSchema.safeParse({ ...DOC, publishedAt: '2026-09-01T14:00:00+09:00' })
        .success,
    ).toBe(false)
    expect(
      adminLegalDocumentSchema.safeParse({ ...DOC, publishedAt: '2026-09-01 05:00:00' }).success,
    ).toBe(false)
  })

  it('해시는 sha256 hex 소문자 64자', () => {
    expect(adminLegalDocumentSchema.safeParse({ ...DOC, contentHash: HASH.slice(1) }).success).toBe(
      false,
    )
    expect(
      adminLegalDocumentSchema.safeParse({ ...DOC, contentHash: HASH.toUpperCase() }).success,
    ).toBe(false)
  })

  it('발행자는 둘 다 null 일 수 있다(계정이 지워지면 FK SET NULL)', () => {
    const orphan = { ...DOC, publishedByUserNo: null, publishedByUserName: null }
    expect(adminLegalDocumentSchema.parse(orphan)).toEqual(orphan)
  })

  it('종류는 빈 문자열이 아니다', () => {
    expect(adminLegalDocumentSchema.safeParse({ ...DOC, kind: '' }).success).toBe(false)
  })

  it('인터페이스와 추론 타입이 같다', () => {
    expectTypeOf<z.infer<typeof adminLegalDocumentSchema>>().toEqualTypeOf<AdminLegalDocument>()
    expectTypeOf<
      z.infer<typeof adminLegalHistoryItemSchema>
    >().toEqualTypeOf<AdminLegalHistoryItem>()
    expectTypeOf<z.infer<typeof adminLegalPublishSchema>>().toEqualTypeOf<AdminLegalPublish>()
  })
})

describe('이력 · 현재본 응답', () => {
  it('이력 행은 본문 없이 받고, 본문이 와도 버린다', () => {
    const { body, ...row } = DOC
    expect(body).toBe('# 제1조 (목적)\n')
    expect(adminLegalHistoryItemSchema.parse(row)).toEqual(row)
    expect(adminLegalHistoryItemSchema.parse(DOC)).not.toHaveProperty('body')
  })

  it('이력 목록은 { items }', () => {
    expect(adminLegalHistorySchema.parse({ items: [] })).toEqual({ items: [] })
  })

  it('현재본은 { item } — null 이 미발행이다', () => {
    expect(adminLegalCurrentSchema.parse({ item: null })).toEqual({ item: null })
    expect(adminLegalCurrentSchema.parse({ item: DOC })).toEqual({ item: DOC })
    expect(adminLegalCurrentSchema.safeParse({}).success).toBe(false)
  })
})

describe('legalBodySchema · adminLegalPublishSchema', () => {
  it('공백뿐이면 거부하고 문구를 낸다', () => {
    const result = legalBodySchema.safeParse('  \n\t ')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('본문을 입력하세요.')
  })

  it('최대 길이까지 받고 하나 넘으면 거부한다', () => {
    expect(LEGAL_BODY_MAX_LENGTH).toBe(1_000_000)
    expect(legalBodySchema.safeParse('가'.repeat(LEGAL_BODY_MAX_LENGTH)).success).toBe(true)
    const result = legalBodySchema.safeParse('가'.repeat(LEGAL_BODY_MAX_LENGTH + 1))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('본문은 1,000,000자를 넘을 수 없습니다.')
  })

  it('🔴 본문을 트림하지 않는다 — 앞뒤 공백 · CRLF 를 그대로 둔다(D3)', () => {
    expect(legalBodySchema.parse('  본문 \r\n')).toBe('  본문 \r\n')
  })

  it('기준 판 번호는 bigint 이거나 null(미발행에서 시작)', () => {
    expect(
      adminLegalPublishSchema.parse({ kind: 'TERMS', body: '본문', baseLegalDocNo: null }),
    ).toEqual({
      kind: 'TERMS',
      body: '본문',
      baseLegalDocNo: null,
    })
    expect(
      adminLegalPublishSchema.parse({ kind: 'TERMS', body: '본문', baseLegalDocNo: 12n })
        .baseLegalDocNo,
    ).toBe(12n)
    expect(adminLegalPublishSchema.safeParse({ kind: 'TERMS', body: '본문' }).success).toBe(false)
  })

  it('🔴 발행 본문에 contentHash 가 없다 — 와도 버린다(해시는 서버만 계산)', () => {
    const parsed = adminLegalPublishSchema.parse({
      kind: 'TERMS',
      body: '본문',
      baseLegalDocNo: null,
      contentHash: HASH,
    })
    expect(parsed).not.toHaveProperty('contentHash')
  })

  it('발행 결과는 번호와 해시', () => {
    expect(adminLegalPublishResultSchema.parse({ legalDocNo: 13n, contentHash: HASH })).toEqual({
      legalDocNo: 13n,
      contentHash: HASH,
    })
    expect(
      adminLegalPublishResultSchema.safeParse({ legalDocNo: 13n, contentHash: 'x' }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 7: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-shared exec vitest run src/legal.test.ts`
Expected: FAIL — `Failed to resolve import "./legal.js"`

- [ ] **Step 8: `legal.ts` 를 쓴다**

Create `packages/admin-shared/src/legal.ts`:

```ts
import { z } from 'zod'

// 약관 · 개인정보처리방침 같은 법적 문서의 관리 계약 — Phase 2 서버와 admin-ui `useLegalDocuments` 가 같은 모양을
// 본다.
//
// 정본: ssworks-axion-admin packages/shared/src/schemas/legal.schema.ts
//       + ssworks-gise-home packages/shared/src/legal/schema.ts
// 바꾼 점:
//  - 종류(`kind`)는 문자열이다. 값 집합은 소비자 카탈로그이고(axion TERMS · PRIVACY · REFUND / gise PRIVACY · TERMS)
//    서버 검증은 Phase 2 모듈 옵션이 한다(3e 스펙 §9).
//  - 시각은 ISO UTC 문자열이다(gise) — axion 의 `z.coerce.date()` 는 추론 타입이 Date 인데 화면이 받는 값은 문자열이었다.
//  - 이름: 번호 `legalDocNo`(axion), 발행자 `publishedByUserNo` · `publishedByUserName`(둘 다 nullable — gise 의 FK SET NULL).
//  - 발행 본문에 `baseLegalDocNo`(편집을 시작한 판)를 싣는다 — 동시 발행 보호(3e ⑤ V2). 두 정본에 없었다.
//  - 현재본 응답은 `{ item: 문서 | null }` — 미발행을 404 가 아니라 null 로 알린다(3e D15).
//
// 🔴 발행 본문에 `contentHash` 가 없다. 해시는 서버가 sha256(body) 로 계산하는 유일한 값이다 — 클라이언트가 보낸 해시를
//    믿으면 동의 기록의 스냅샷을 위조할 수 있다(axion · gise).
// 🔴 본문을 트림하지 않는다 — 편집기에서 받은 그대로가 해시 대상이다(3e D3). 공백 검사는 `regex` 로 한다.
// 🔴 객체 스키마에 `.refine()` 을 걸지 않는다(3b §11 R1) — 소비자의 `.extend()` · `.omit()` 을 막지 않는다.

export const LEGAL_BODY_MAX_LENGTH = 1_000_000

/** 공백만이면 거부, 최대 1,000,000자. 트림하지 않는다 */
export const legalBodySchema = z
  .string()
  .max(
    LEGAL_BODY_MAX_LENGTH,
    `본문은 ${LEGAL_BODY_MAX_LENGTH.toLocaleString('en-US')}자를 넘을 수 없습니다.`,
  )
  .regex(/\S/, '본문을 입력하세요.')

/** sha256 hex 소문자 64자 — 서버만 계산한다 */
const contentHashSchema = z.string().regex(/^[0-9a-f]{64}$/)

export interface AdminLegalDocument {
  legalDocNo: bigint
  kind: string
  body: string
  /** sha256 hex 소문자 64자. 서버만 계산한다 */
  contentHash: string
  /** ISO 8601 UTC(세션 스키마와 같은 `z.iso.datetime()`) */
  publishedAt: string
  /** 발행자 계정이 지워지면 null(FK ON DELETE SET NULL) */
  publishedByUserNo: bigint | null
  publishedByUserName: string | null
}

export const adminLegalDocumentSchema = z.object({
  legalDocNo: z.bigint(),
  kind: z.string().min(1),
  body: z.string(),
  contentHash: contentHashSchema,
  publishedAt: z.iso.datetime(),
  publishedByUserNo: z.bigint().nullable(),
  publishedByUserName: z.string().nullable(),
})

/** 이력 행 — 본문을 싣지 않는다(목록이 문서 전량을 끌어오지 않게) */
export type AdminLegalHistoryItem = Omit<AdminLegalDocument, 'body'>
export const adminLegalHistoryItemSchema = adminLegalDocumentSchema.omit({ body: true })

/** 현재 시행본 — `item: null` 이 미발행(정상 시작 상태) */
export const adminLegalCurrentSchema = z.object({ item: adminLegalDocumentSchema.nullable() })
export type AdminLegalCurrent = z.infer<typeof adminLegalCurrentSchema>

/** 발행 이력 — 최신순 전량(페이지 없음, 발행은 드물다) */
export const adminLegalHistorySchema = z.object({ items: z.array(adminLegalHistoryItemSchema) })
export type AdminLegalHistory = z.infer<typeof adminLegalHistorySchema>

export interface AdminLegalPublish {
  kind: string
  body: string
  /** 편집을 시작한 판 번호. 미발행 상태에서 시작했으면 null(3e ⑤ V2) */
  baseLegalDocNo: bigint | null
}

export const adminLegalPublishSchema = z.object({
  kind: z.string().min(1),
  body: legalBodySchema,
  baseLegalDocNo: z.bigint().nullable(),
})

export const adminLegalPublishResultSchema = z.object({
  legalDocNo: z.bigint(),
  contentHash: contentHashSchema,
})
export type AdminLegalPublishResult = z.infer<typeof adminLegalPublishResultSchema>
```

- [ ] **Step 9: export 를 더한다**

Modify `packages/admin-shared/src/index.ts` — 파일 끝(`./team-tree.js` 절 뒤)에 붙인다:

```ts
export { renderMarkdown } from './markdown.js'

export {
  LEGAL_BODY_MAX_LENGTH,
  legalBodySchema,
  adminLegalDocumentSchema,
  adminLegalHistoryItemSchema,
  adminLegalCurrentSchema,
  adminLegalHistorySchema,
  adminLegalPublishSchema,
  adminLegalPublishResultSchema,
  type AdminLegalDocument,
  type AdminLegalHistoryItem,
  type AdminLegalCurrent,
  type AdminLegalHistory,
  type AdminLegalPublish,
  type AdminLegalPublishResult,
} from './legal.js'
```

- [ ] **Step 10: 통과 · 타입 · 빌드**

Run:

```bash
pnpm --filter @ssworks/admin-shared test
pnpm --filter @ssworks/admin-shared typecheck
pnpm --filter @ssworks/admin-shared build
```

Expected:

- test: 전부 PASS(기존 139 + 이번 것)
- typecheck: 오류 0
- build: `dist/markdown.js` · `dist/legal.js` 생성

`expectTypeOf(...).toEqualTypeOf` 가 typecheck 에서 실패하면 인터페이스를 고친다. 스키마를 고치지 않는다 — 스키마가 스펙 §4-2 와 같다.

- [ ] **Step 11: 포맷 · lint · 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/markdown.ts packages/admin-shared/src/markdown.test.ts packages/admin-shared/src/legal.ts packages/admin-shared/src/legal.test.ts packages/admin-shared/src/index.ts packages/admin-shared/package.json
pnpm exec eslint packages/admin-shared/src
git add packages/admin-shared pnpm-lock.yaml
git commit -F - <<'EOF'
feat(admin-shared): renderMarkdown · 약관 스키마(발행 기준 판 번호 포함)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 2: admin-ui 바탕 — CodeMirror 필수 peer · external · `formatDateTime` 옮기기 · CodeMirror 계약

**Files:**

- Modify: `packages/admin-ui/package.json`(pnpm 명령으로)
- Modify: `packages/admin-ui/vite.config.ts:31-39`(`external` 배열)
- Create: `packages/admin-ui/src/utils/format-date-time.ts`
- Modify: `packages/admin-ui/src/components/session/session-table.ts`(`pad` · `formatDateTime` 제거)
- Modify: `packages/admin-ui/src/components/session/SessionTable.vue:7`(import)
- Modify: `packages/admin-ui/src/components/session/session-table.render.test.ts:8`(import)
- Create: `packages/admin-ui/src/components/markdown/codemirror.render.test.ts`

**Interfaces:**

- Consumes: Task 1 의 admin-shared `dist/`(이 Task 는 아직 쓰지 않음)
- Produces:
  - `formatDateTime(iso: string): string` — `packages/admin-ui/src/utils/format-date-time.ts`. 패키지 내부용이고 index 에서 내보내지 않는다.
  - 설치된 `codemirror` · `@codemirror/state` · `@codemirror/commands`(dev)

- [ ] **Step 1: CodeMirror 를 필수 peer + dev 로, commands 를 dev 로 넣는다**

Run:

```bash
pnpm --filter @ssworks/admin-ui add --save-peer codemirror@^6.0.2 @codemirror/state@^6.7.6
pnpm --filter @ssworks/admin-ui add -D @codemirror/commands
pnpm install --frozen-lockfile
```

Expected:

- `packages/admin-ui/package.json` 의 `peerDependencies` 와 `devDependencies` 둘 다에 `"codemirror": "^6.0.2"` · `"@codemirror/state": "^6.7.6"` 이 있다. `devDependencies` 에는 `@codemirror/commands`(pnpm 이 고른 `^6.x`)도 있다.
- `pnpm install --frozen-lockfile` 이 종료 코드 0 이다.

`ERR_PNPM_IGNORED_BUILDS` 로 실패하면 출력에 나온 패키지를 `pnpm-workspace.yaml` 의 기존 `allowBuilds:` 아래에 `<이름>: false` 로 더하고 다시 돌린다. 3d R1 과 같은 처리이고, 이 경우 스펙 §11 정정 거리로 보고한다.

- [ ] **Step 2: 빌드에서 CodeMirror 를 외부로 둔다**

Modify `packages/admin-ui/vite.config.ts` — `external` 배열 끝(`/^@he-tree\/vue(\/.*)?$/,` 다음)에 두 줄:

```ts
        /^@he-tree\/vue(\/.*)?$/,
        /^codemirror$/,
        /^@codemirror\//,
      ],
```

- [ ] **Step 3: CodeMirror 계약 테스트를 쓴다**

Create `packages/admin-ui/src/components/markdown/codemirror.render.test.ts`:

```ts
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
```

- [ ] **Step 4: 계약 테스트를 돌린다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/codemirror.render.test.ts`
Expected: PASS(3).

실패하면 Task 를 멈추고 출력을 그대로 보고한다. 특히 happy-dom 에 없는 DOM API(`getClientRects` · `MutationObserver` 등)로 마운트가 깨지는 경우다. 이것은 스펙 §8 위험 ① 이고, `test/setup.ts` 보강을 결정해야 한다. 가드 메시지("같은 @codemirror/commands 인스턴스")로 실패하면 `pnpm why @codemirror/commands` 출력을 함께 보고한다.

- [ ] **Step 5: `formatDateTime` 을 utils 로 옮긴다**

Create `packages/admin-ui/src/utils/format-date-time.ts`:

```ts
// 날짜 기본 표기 — `SessionTable` · `LegalDocumentEditor` 가 함께 쓴다(3e 스펙 D21). 패키지 내부용(index 에서 내보내지 않는다).
//
// 정본: ssworks-gise-home apps/admin/src/types/session.ts 의 표기(3c 에서 session-table.ts 에 두었던 것을 옮겼다)

const pad = (value: number) => String(value).padStart(2, '0')

/** 브라우저 현지 시각 `YYYY-MM-DD HH:mm`. 형식이 틀린 값은 원문 그대로(gise). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

Modify `packages/admin-ui/src/components/session/session-table.ts` — 아래 블록(지금 12~19행)을 지운다:

```ts
const pad = (value: number) => String(value).padStart(2, '0')

/** 브라우저 현지 시각 `YYYY-MM-DD HH:mm`. 형식이 틀린 값은 원문 그대로(gise). 패키지 내부용. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

머리 주석의 "SessionTable 의 행 타입과 날짜 표기." 는 "SessionTable 의 행 타입. 날짜 표기는 `utils/format-date-time.ts`." 로 바꾼다.

Modify `packages/admin-ui/src/components/session/SessionTable.vue:7`:

```ts
import { type SessionTableRow } from './session-table.js'
import { formatDateTime } from '../../utils/format-date-time.js'
```

(기존 한 줄 `import { formatDateTime, type SessionTableRow } from './session-table.js'` 를 위 두 줄로 바꾼다. 같은 줄에 `type` 만 남으면 eslint 가 `import type { SessionTableRow }` 로 고치라고 하면 그대로 따른다.)

Modify `packages/admin-ui/src/components/session/session-table.render.test.ts:8` — `formatDateTime` 을 새 자리에서 가져온다:

```ts
import { type SessionTableRow } from './session-table.js'
import { formatDateTime } from '../../utils/format-date-time.js'
```

- [ ] **Step 6: 세션 테스트 · 전체 admin-ui 테스트 · 타입**

Run:

```bash
pnpm --filter @ssworks/admin-ui exec vitest run src/components/session
pnpm --filter @ssworks/admin-ui test
pnpm --filter @ssworks/admin-ui typecheck
```

Expected: 전부 PASS / 오류 0.

- `peer-deps.test.ts` 는 아직 소스가 CodeMirror 를 import 하지 않으므로 그대로 초록이다.
- admin-ui 테스트 수는 731 + 3 이다.

- [ ] **Step 7: 포맷 · lint · 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/package.json packages/admin-ui/vite.config.ts packages/admin-ui/src/utils/format-date-time.ts packages/admin-ui/src/components/session/session-table.ts packages/admin-ui/src/components/session/SessionTable.vue packages/admin-ui/src/components/session/session-table.render.test.ts packages/admin-ui/src/components/markdown/codemirror.render.test.ts
pnpm exec eslint packages/admin-ui/src/components/session packages/admin-ui/src/components/markdown packages/admin-ui/src/utils
git add packages/admin-ui pnpm-lock.yaml pnpm-workspace.yaml
git commit -F - <<'EOF'
chore(admin-ui): CodeMirror 필수 peer · formatDateTime 을 utils 로 · CodeMirror 계약 테스트

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 3: `MarkdownView` — 킷 유일의 `v-html` 자리

**Files:**

- Create: `packages/admin-ui/src/components/markdown/MarkdownView.vue`
- Test: `packages/admin-ui/src/components/markdown/markdown-view.render.test.ts`

**Interfaces:**

- Consumes: `renderMarkdown` from `@ssworks/admin-shared`(Task 1 — `dist/` 가 빌드돼 있어야 한다)
- Produces: `MarkdownView` 이다(뒤의 `LegalDocumentEditor` 가 쓴다).
  - props: `source?: string | null`(기본 `null`) · `linkTarget?: '_self' | '_blank'`(기본 `'_self'`)
  - 슬롯: `#empty`
  - 루트 클래스: `markdown-view`(빈 값이면 `markdown-view markdown-view--empty`)

- [ ] **Step 1: 테스트를 쓴다**

Create `packages/admin-ui/src/components/markdown/markdown-view.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { vuetify } from '../../test/setup.js'
import MarkdownView from './MarkdownView.vue'

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function view(props: Record<string, unknown>, slots: Record<string, () => string> = {}) {
  wrapper = mount(MarkdownView, {
    props,
    slots,
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  return wrapper
}

/** 링크를 눌러 본다. 문서 끝에서 기본 이동을 막아 happy-dom 이 실제로 이동하지 않게 하고, 그 전에 컴포넌트가 막았는지 기록한다 */
function clickLink(anchor: Element): boolean {
  let preventedByComponent = false
  const guard = (event: Event) => {
    preventedByComponent = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', guard)
  try {
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  } finally {
    document.removeEventListener('click', guard)
  }
  return preventedByComponent
}

describe('MarkdownView', () => {
  it('마크다운을 요소로 그린다', () => {
    const w = view({ source: '# 제1조\n\n- 가\n- 나\n\n[도움말](https://example.com/help)' })
    expect(w.find('h1').text()).toBe('제1조')
    expect(w.findAll('li').map((li) => li.text())).toEqual(['가', '나'])
    expect(w.find('a').attributes('href')).toBe('https://example.com/help')
  })

  it('🔴 원문 HTML 은 실행되지 않는다 — script 요소 · onerror 속성이 없다', () => {
    const w = view({ source: '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>' })
    expect(w.element.querySelector('script')).toBeNull()
    expect(w.element.querySelector('[onerror]')).toBeNull()
    expect(w.text()).toContain('<script>alert(1)</script>')
  })

  it('🔴 javascript: 링크는 링크가 되지 않는다', () => {
    const w = view({ source: '[x](javascript:alert(1))' })
    expect(w.element.querySelector('a')).toBeNull()
  })

  it.each([null, '', undefined])('빈 값(%s)이면 #empty 를 보인다', (source) => {
    const w = view({ source }, { empty: () => '미리 볼 내용이 없습니다.' })
    expect(w.text()).toBe('미리 볼 내용이 없습니다.')
    expect(w.classes()).toContain('markdown-view--empty')
  })

  it("linkTarget '_blank' — 링크 클릭의 기본 이동을 막고 새 탭으로 연다", () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const w = view({ source: '[도움말](https://example.com/help)', linkTarget: '_blank' })
    expect(clickLink(w.find('a').element)).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/help', '_blank', 'noopener,noreferrer')
  })

  it("linkTarget '_blank' — 링크 밖을 누르면 개입하지 않는다", () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const w = view({ source: '본문 [도움말](https://example.com/help)', linkTarget: '_blank' })
    w.find('p').element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).not.toHaveBeenCalled()
  })

  it("linkTarget '_self'(기본) — 클릭에 개입하지 않는다", () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const w = view({ source: '[도움말](https://example.com/help)' })
    expect(clickLink(w.find('a').element)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-view.render.test.ts`
Expected: FAIL — `Failed to resolve import "./MarkdownView.vue"`

- [ ] **Step 3: `MarkdownView.vue` 를 쓴다**

Create `packages/admin-ui/src/components/markdown/MarkdownView.vue`:

```vue
<script setup lang="ts">
  import { computed } from 'vue'
  import { renderMarkdown } from '@ssworks/admin-shared'

  // 마크다운 본문 보기 — 킷에서 `v-html` 을 쓰는 유일한 자리.
  //
  // 정본: ssworks-gise-home apps/admin/src/components/MarkdownView.vue
  //       (+ ssworks-axion-admin packages/frontend/src/components/common/MarkdownView.vue — 같은 골격)
  // 바꾼 점:
  //  - 렌더러를 admin-shared `renderMarkdown` 으로 — 서버 · 공개 웹과 같은 함수(3e ② R1 · D1).
  //  - `linkTarget="_blank"` 면 본문 링크 클릭을 가로채 새 탭으로 연다 — 미리보기에서 링크를 눌러 발행 전 초안을 잃지
  //    않게(3e D18). 렌더된 HTML 은 건드리지 않는다(공개 원문과 같아야 한다).
  //  - `#empty` 슬롯, 본문 타이포 스타일(Vuetify 토큰). `data-test` 속성은 뺐다.
  //
  // 🔴 `v-html` 안전 근거: `html` 은 `renderMarkdown`(markdown-it `html: false`)의 결과이고 원문 HTML 은 전부 이스케이프돼
  //    있다. 그 전제가 깨지면(= html: true) 이 `v-html` 이 곧바로 저장형 XSS 실행 지점이 된다. 다른 곳에 `v-html` 을
  //    더하지 말고 이 컴포넌트를 쓴다.

  const props = withDefaults(
    defineProps<{
      source?: string | null
      linkTarget?: '_self' | '_blank'
    }>(),
    { source: null, linkTarget: '_self' },
  )

  defineSlots<{ empty?(): unknown }>()

  const html = computed(() => renderMarkdown(props.source))

  function onClick(event: MouseEvent): void {
    if (props.linkTarget !== '_blank') return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a[href]')
    if (anchor == null) return
    event.preventDefault()
    window.open(anchor.getAttribute('href') ?? '', '_blank', 'noopener,noreferrer')
  }
</script>

<template>
  <div v-if="html === ''" class="markdown-view markdown-view--empty"><slot name="empty" /></div>
  <!-- 🔴 v-html 안전 근거는 머리 주석 — html 은 renderMarkdown({ html: false }) 의 결과다 -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-else class="markdown-view" @click="onClick" v-html="html" />
</template>

<style scoped>
  .markdown-view {
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .markdown-view--empty {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .markdown-view :deep(:is(h1, h2, h3, h4, h5, h6)) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-view :deep(h1) {
    font-size: 1.5rem;
  }

  .markdown-view :deep(h2) {
    font-size: 1.3rem;
  }

  .markdown-view :deep(h3) {
    font-size: 1.15rem;
  }

  .markdown-view :deep(:is(h4, h5, h6)) {
    font-size: 1rem;
  }

  .markdown-view > :deep(:first-child) {
    margin-top: 0;
  }

  .markdown-view :deep(:is(p, ul, ol, blockquote, pre, table)) {
    margin: 0 0 0.75em;
  }

  .markdown-view :deep(:is(ul, ol)) {
    padding-left: 1.5em;
  }

  .markdown-view :deep(li > :is(ul, ol)) {
    margin-bottom: 0;
  }

  .markdown-view :deep(table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
  }

  .markdown-view :deep(:is(th, td)) {
    padding: 6px 10px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .markdown-view :deep(blockquote) {
    padding-left: 12px;
    border-left: 3px solid rgba(var(--v-border-color), var(--v-border-opacity));
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .markdown-view :deep(code) {
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: monospace;
  }

  .markdown-view :deep(pre) {
    padding: 8px 12px;
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    overflow-x: auto;
  }

  .markdown-view :deep(pre code) {
    padding: 0;
    background: none;
  }

  .markdown-view :deep(a) {
    color: rgb(var(--v-theme-primary));
  }

  .markdown-view :deep(img) {
    max-width: 100%;
  }

  .markdown-view :deep(hr) {
    margin: 1em 0;
    border: 0;
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
</style>
```

- [ ] **Step 4: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-view.render.test.ts`
Expected: PASS(9).

`Failed to resolve import "@ssworks/admin-shared"` 이 아니라 `renderMarkdown is not a function` 이면 Task 1 Step 10 의 admin-shared 빌드를 다시 돌린다.

- [ ] **Step 5: 타입 · lint · 커밋**

```bash
pnpm --filter @ssworks/admin-ui typecheck
pnpm exec prettier --write packages/admin-ui/src/components/markdown/MarkdownView.vue packages/admin-ui/src/components/markdown/markdown-view.render.test.ts
pnpm exec eslint packages/admin-ui/src/components/markdown
git add packages/admin-ui/src/components/markdown
git commit -F - <<'EOF'
feat(admin-ui): MarkdownView — renderMarkdown 단일 v-html · 새 탭 링크

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

eslint 가 `vue/no-v-html` 경고를 내면 템플릿의 `eslint-disable-next-line` 주석이 `v-else` div 바로 윗줄에 있는지 본다. 그 사이에 다른 줄을 두지 않는다.

---

### Task 4: `MarkdownEditor` — CodeMirror `v-model`

**Files:**

- Create: `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`
- Test: `packages/admin-ui/src/components/markdown/markdown-editor.render.test.ts`

**Interfaces:**

- Consumes: `codemirror`(`basicSetup` · `EditorView`), `@codemirror/state`(`Annotation` · `Compartment` · `EditorState` · `Transaction`), `vuetify` `useTheme`
- Produces: `MarkdownEditor` 다(뒤의 `LegalDocumentEditor` 가 쓴다).
  - props: `modelValue: string` · `readonly?: boolean`(false) · `label?: string`('본문') · `height?: string`('420px')
  - emit `update:modelValue(value: string)` — 사용자 변경만
  - 루트 요소 클래스 `markdown-editor`(= CodeMirror 호스트)
  - 편집 영역 `.cm-content` 에 `aria-label` = `label`, 읽기 전용이면 `aria-readonly="true"`

- [ ] **Step 1: 테스트를 쓴다**

Create `packages/admin-ui/src/components/markdown/markdown-editor.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { undoDepth } from '@codemirror/commands'
import { mount, type VueWrapper } from '@vue/test-utils'
import { EditorView } from 'codemirror'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createAdminVuetify } from '../../vuetify/createAdminVuetify.js'
import MarkdownEditor from './MarkdownEditor.vue'

// 편집기를 찾고 움직이는 방법은 gise apps/admin/test/legal-page.test.ts:334-355 와 같다 — `EditorView.findFromDOM` 으로 실제
// 뷰를 얻어 `dispatch` 하면 운영 코드의 updateListener 를 그대로 지난다(happy-dom 실측 2026-09-23). 테마를 바꾸므로 공용
// `vuetify` 대신 이 파일 전용 인스턴스를 쓴다.

const vuetify = createAdminVuetify({ theme: { defaultTheme: 'light' } })

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

const content = (label = '본문') =>
  document.querySelector<HTMLElement>(`.cm-content[aria-label="${label}"]`)

function editorView(label = '본문'): EditorView {
  const element = content(label)
  expect(element, `가드 — aria-label "${label}" 인 편집 영역이 있다`).toBeTruthy()
  const view = EditorView.findFromDOM(element!)
  expect(view, '가드 — EditorView 를 찾았다').toBeTruthy()
  return view!
}

/** 사용자가 친 것처럼 — 외부 표시 없는 트랜잭션 */
function type(view: EditorView, text: string): void {
  view.dispatch({
    changes: { from: view.state.doc.length, insert: text },
    userEvent: 'input.type',
  })
}

describe('MarkdownEditor', () => {
  it('초기 modelValue 가 문서가 된다', () => {
    mountEditor()
    expect(editorView().state.doc.toString()).toBe('# 제1조')
  })

  it('사용자 변경 → update:modelValue 한 번, 값은 문서 전체', () => {
    const w = mountEditor()
    type(editorView(), '\n본문')
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조\n본문']])
  })

  it('🔴 prop 교체 → 문서가 바뀌고 emit 없음, 되돌리기 기록이 빈다(D4)', async () => {
    const w = mountEditor()
    const view = editorView()
    type(view, ' 수정')
    expect(
      undoDepth(view.state),
      '가드 — 사용자 편집이 기록됐다(같은 @codemirror/commands 인스턴스)',
    ).toBeGreaterThan(0)
    await w.setProps({ modelValue: '# 개인정보처리방침' })
    expect(view.state.doc.toString()).toBe('# 개인정보처리방침')
    expect(w.emitted('update:modelValue')).toHaveLength(1)
    expect(undoDepth(view.state)).toBe(0)
  })

  it('🔴 같은 값이 돌아오면 문서를 치환하지 않는다 — 한글 조합이 이어지는 조건(D3)', async () => {
    const w = mountEditor()
    const view = editorView()
    type(view, '가')
    const before = view.state.doc
    await w.setProps({ modelValue: '# 제1조가' })
    expect(view.state.doc).toBe(before)
  })

  it('readonly 를 켜고 끄면 state.readOnly · aria-readonly 가 따라간다', async () => {
    const w = mountEditor({ readonly: true })
    const view = editorView()
    expect(view.state.readOnly).toBe(true)
    expect(content()!.getAttribute('aria-readonly')).toBe('true')
    await w.setProps({ readonly: false })
    expect(view.state.readOnly).toBe(false)
    expect(content()!.hasAttribute('aria-readonly')).toBe(false)
  })

  it('🔴 readonly 여도 편집 영역은 포커스를 받는다 — 선택 · 복사 · 찾기(D5)', () => {
    mountEditor({ readonly: true })
    expect(content()!.getAttribute('contenteditable')).toBe('true')
  })

  it('label 이 편집 영역의 aria-label 이 되고, 바꾸면 따라간다', async () => {
    const w = mountEditor({ label: '이용약관 본문' })
    expect(content('이용약관 본문')).toBeTruthy()
    await w.setProps({ label: '개인정보처리방침 본문' })
    expect(content('개인정보처리방침 본문')).toBeTruthy()
    expect(content('이용약관 본문')).toBeNull()
  })

  it('Vuetify 테마를 dark 로 바꾸면 darkTheme 판정이 따른다(D6)', async () => {
    mountEditor()
    const view = editorView()
    expect(view.state.facet(EditorView.darkTheme)).toBe(false)
    try {
      await vuetify.theme.change('dark')
      await nextTick()
      expect(view.state.facet(EditorView.darkTheme)).toBe(true)
    } finally {
      await vuetify.theme.change('light')
    }
  })

  it('긴 줄을 줄바꿈한다(cm-lineWrapping)', () => {
    mountEditor()
    expect(content()!.classList.contains('cm-lineWrapping')).toBe(true)
  })

  it('height 가 바깥 틀 높이가 된다', () => {
    const w = mountEditor({ height: '300px' })
    expect((w.element as HTMLElement).style.height).toBe('300px')
    expect(w.classes()).toContain('markdown-editor')
  })

  it('언마운트하면 뷰를 파괴한다', () => {
    const destroy = vi.spyOn(EditorView.prototype, 'destroy')
    const w = mountEditor()
    w.unmount()
    wrapper = null
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-editor.render.test.ts`
Expected: FAIL — `Failed to resolve import "./MarkdownEditor.vue"`

- [ ] **Step 3: `MarkdownEditor.vue` 를 쓴다**

Create `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`:

```vue
<script setup lang="ts">
  import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state'
  import { basicSetup, EditorView } from 'codemirror'
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useTheme } from 'vuetify'

  // 마크다운 본문 편집기 — CodeMirror 6 을 `v-model` 하나로 감싼다.
  //
  // 정본: ssworks-axion-admin packages/frontend/src/pages/settings/legal.vue:152-216
  //       (= ssworks-gise-home apps/admin/src/pages/settings/legal.vue:252-314 — gise 가 axion 을 옮겼다)
  // 바꾼 점:
  //  - 색을 Vuetify CSS 변수로 칠한다 — `@codemirror/theme-one-dark` 를 쓰지 않는다(3e ③ C1). 다크 판정
  //    `EditorView.darkTheme` 은 Vuetify 테마를 따른다(찾기 패널 같은 CodeMirror 기본 요소가 이 판정을 본다).
  //  - 긴 줄을 줄바꿈한다(`lineWrapping`) — 약관 문단은 한 줄이 아주 길다. 정본은 가로 스크롤이었다(D6).
  //  - `readonly`(편집만 막음 — 포커스 · 선택 · 복사 · 찾기는 됨, D5) · `label`(aria) · `height` props.
  //  - 외부 변경 표시를 모듈 플래그(`applyingExternalDraft`) 대신 트랜잭션의 `Annotation` 으로 한다(D4).
  //
  // 🔴 받은 값과 문서가 같으면 아무것도 하지 않는다. 입력 → emit → 부모 → prop 으로 돌아온 값이 같아야 한글 조합이
  //    이어진다. 부모가 값을 고쳐서(트림 · 개행 정규화) 돌려주면 조합 중에 문서가 치환돼 글자가 깨진다(D3).
  // 🔴 외부 변경은 문서 전체 치환 + 되돌리기 기록 제외다. 전체 치환이 이전 문서의 편집 기록을 흡수해 비우므로
  //    (`codemirror.render.test.ts`) 다른 종류의 본문으로 바뀐 뒤 Ctrl+Z 가 앞 문서의 편집을 되살리지 않는다(D4).
  // 🔴 루트 요소가 곧 호스트다. 호스트를 `v-if` 뒤에 두면 `new EditorView({ parent: null })` 이 예외 없이 붙지 않아
  //    편집기 자리가 조용히 빈다(gise 실측). 쓰는 쪽도 불러오는 동안 숨기지 말고 `readonly` 로 둔다.
  // 🔴 CodeMirror 는 개행을 `\n` 으로 정규화한다. CRLF 본문은 처음 그릴 때는 그대로 두지만(외부 변경은 emit 하지 않는다)
  //    첫 입력부터 LF 로 나간다.
  // Tab 은 묶지 않는다(`indentWithTab` 없음) — 키보드 사용자가 Tab 으로 편집기 밖으로 나갈 수 있어야 한다.

  const props = withDefaults(
    defineProps<{
      modelValue: string
      readonly?: boolean
      label?: string
      height?: string
    }>(),
    { readonly: false, label: '본문', height: '420px' },
  )

  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

  const host = ref<HTMLElement | null>(null)
  const theme = useTheme()
  /** 이 트랜잭션은 바깥(prop)에서 왔다 — 되돌려 emit 하지 않는다 */
  const external = Annotation.define<boolean>()
  const readonlyCompartment = new Compartment()
  const labelCompartment = new Compartment()
  const darkCompartment = new Compartment()
  let view: EditorView | null = null

  const readonlyExtension = (readonly: boolean) => [
    EditorState.readOnly.of(readonly),
    EditorView.contentAttributes.of(readonly ? { 'aria-readonly': 'true' } : {}),
  ]
  const labelExtension = (label: string) => EditorView.contentAttributes.of({ 'aria-label': label })
  const darkExtension = (dark: boolean) => EditorView.darkTheme.of(dark)

  /** 색은 Vuetify 토큰 — 앱 테마가 바뀌면 CSS 변수가 바뀌어 저절로 따라온다 */
  const vuetifyTheme = EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'rgb(var(--v-theme-surface))',
      color: 'rgb(var(--v-theme-on-surface))',
      fontSize: '13px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'monospace' },
    '.cm-content': { caretColor: 'rgb(var(--v-theme-on-surface))' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'rgb(var(--v-theme-on-surface))' },
    '.cm-gutters': {
      backgroundColor: 'rgba(var(--v-theme-on-surface), 0.04)',
      color: 'rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity))',
      border: 'none',
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: 'rgba(var(--v-theme-on-surface), 0.04)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: 'rgba(var(--v-theme-primary), 0.2)' },
  })

  onMounted(() => {
    view = new EditorView({
      parent: host.value!,
      state: EditorState.create({
        doc: props.modelValue,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          readonlyCompartment.of(readonlyExtension(props.readonly)),
          labelCompartment.of(labelExtension(props.label)),
          darkCompartment.of(darkExtension(theme.current.value.dark)),
          vuetifyTheme,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            if (update.transactions.some((tr) => tr.annotation(external))) return
            emit('update:modelValue', update.state.doc.toString())
          }),
        ],
      }),
    })
  })

  watch(
    () => props.modelValue,
    (value) => {
      if (view == null) return
      const doc = view.state.doc.toString()
      if (value === doc) return
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: value },
        annotations: [Transaction.addToHistory.of(false), external.of(true)],
      })
    },
  )

  watch(
    () => props.readonly,
    (readonly) => {
      view?.dispatch({ effects: readonlyCompartment.reconfigure(readonlyExtension(readonly)) })
    },
  )

  watch(
    () => props.label,
    (label) => {
      view?.dispatch({ effects: labelCompartment.reconfigure(labelExtension(label)) })
    },
  )

  watch(
    () => theme.current.value.dark,
    (dark) => {
      view?.dispatch({ effects: darkCompartment.reconfigure(darkExtension(dark)) })
    },
  )

  onBeforeUnmount(() => {
    view?.destroy()
    view = null
  })
</script>

<template>
  <div ref="host" class="markdown-editor" :style="{ height }" />
</template>

<style scoped>
  .markdown-editor {
    overflow: hidden;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 4px;
  }

  .markdown-editor:focus-within {
    border-color: rgb(var(--v-theme-primary));
  }
</style>
```

- [ ] **Step 4: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-editor.render.test.ts`
Expected: PASS(11).

다크 테마 테스트가 `vuetify.theme.change is not a function` 으로 실패하면 Vuetify 4.2.3 타입(`node_modules/vuetify/lib/composables/theme.d.ts` 의 `ThemeInstance.change`)을 확인한다. 같은 일을 하는 공개 API(`theme.global.name.value = 'dark'`)로 바꾸되 테스트의 뜻은 유지한다.

- [ ] **Step 5: peer 검사 · 타입 · lint · 커밋**

```bash
pnpm --filter @ssworks/admin-ui exec vitest run src/peer-deps.test.ts
pnpm --filter @ssworks/admin-ui typecheck
pnpm exec prettier --write packages/admin-ui/src/components/markdown/MarkdownEditor.vue packages/admin-ui/src/components/markdown/markdown-editor.render.test.ts
pnpm exec eslint packages/admin-ui/src/components/markdown
git add packages/admin-ui/src/components/markdown
git commit -F - <<'EOF'
feat(admin-ui): MarkdownEditor — CodeMirror v-model · readonly · Vuetify 색

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

`peer-deps.test.ts` 는 이제 소스가 `codemirror` · `@codemirror/state` 를 import 하므로 그 둘이 peer 인지 검사한다(Task 2 에서 넣었다). `@codemirror/commands` 는 테스트 파일에서만 쓰므로 검사 대상이 아니다.

---

### Task 5: `useLegalDocuments` — 흐름

**Files:**

- Create: `packages/admin-ui/src/components/legal/legal-document.ts`(흐름 쪽 타입 · 기본 문구 — Task 6 이 화면 쪽을 더한다)
- Create: `packages/admin-ui/src/composables/useLegalDocuments.ts`
- Test: `packages/admin-ui/src/composables/useLegalDocuments.test.ts`(DOM 없음)

**Interfaces:**

- Consumes:
  - `@ssworks/admin-shared`: `LEGAL_BODY_MAX_LENGTH` · `AdminLegalDocument` · `AdminLegalHistoryItem` · `AdminLegalPublish`(Task 1)
  - `./useWriteFlow.js`: `useWriteFlow()` · `ConfirmDialogBindings`
    - `run({ gate: 'confirm', reversible, title, message, confirmLabel, action, onConflict })` 는 성공 true, 취소 · 실패 false 로 끝난다.
    - `onConflict` 가 끝날 때까지 `submitting` 이 true 로 남는다.
    - `ERR_COMMON_REVISION_CONFLICT` 에 `onConflict` 가 있으면 `handled = true` 로 표시한다.
- Produces:
  - `legal-document.ts`: `LegalKindOption<K>` · `LegalPublishBlock` · `LegalDialogText` · `LegalMessages` · `DEFAULT_LEGAL_MESSAGES`
  - `useLegalDocuments.ts` 의 타입: `UseLegalDocumentsOptions<K, R>` · `LegalDoneEvent<K>` · `LegalDetailDialogBindings<R>` · `LegalDocumentEditorBindings<K, R>` · `LegalDocumentsController<K, R>`
  - `useLegalDocuments.ts` 의 함수: `useLegalDocuments<K, R>(options)`
  - 모양은 스펙 §4-5 그대로다. `editor` 바인딩 키는 이렇다:
    - 상태: `kinds` · `kind` · `current` · `loading` · `loadFailed` · `modelValue` · `readonly` · `canPublish` · `publishBlock` · `submitting` · `conflict` · `history` · `historyLoading` · `historyFailed`
    - 대화상자: `publishDialog` · `discardDialog` · `detailDialog`
    - 리스너: `onSelectKind` · `'onUpdate:modelValue'` · `onPublish` · `onReloadCurrent` · `onReloadHistory` · `onOpenDetail` · `onDismissConflict`

- [ ] **Step 1: 흐름 쪽 타입 · 문구를 쓴다**

Create `packages/admin-ui/src/components/legal/legal-document.ts`:

```ts
// 약관 화면의 타입 · 기본 문구. `useLegalDocuments`(흐름)와 `LegalDocumentEditor`(화면)가 함께 쓴다.

/** 탭 하나 — 종류 값과 화면 이름. 값 집합은 소비자 카탈로그다(킷은 하드코딩하지 않는다) */
export interface LegalKindOption<K extends string = string> {
  value: K
  label: string
}

/**
 * 발행이 막힌 첫 이유. 순서가 있다(3e 스펙 D16): readonly → loading → loadFailed → empty → tooLong → unchanged.
 * 화면은 `loading` 을 뺀 다섯을 버튼 옆 글자로 보인다.
 */
export type LegalPublishBlock =
  'readonly' | 'loading' | 'loadFailed' | 'empty' | 'tooLong' | 'unchanged'

export interface LegalDialogText {
  title: string
  message: string
  confirmLabel: string
}

/** 흐름이 내는 문구 — 발행 완료 알림 · 발행 확인 · 초안 버리기 확인 */
export interface LegalMessages {
  published: (kindLabel: string) => string
  publishConfirm: (kindLabel: string) => LegalDialogText
  discardConfirm: (fromLabel: string, toLabel: string) => LegalDialogText
}

export const DEFAULT_LEGAL_MESSAGES: LegalMessages = {
  published: (kindLabel) => `${kindLabel} 새 버전을 발행했습니다.`,
  publishConfirm: (kindLabel) => ({
    title: `${kindLabel} 새 버전 발행`,
    // 🔴 ConfirmDialog 가 reversible: false 로 「이 작업은 되돌릴 수 없습니다.」를 스스로 붙인다 — 여기서 반복하지 않는다
    message: '발행하면 새 버전이 바로 시행됩니다. 기존 버전은 이력에 그대로 남습니다.',
    confirmLabel: '발행',
  }),
  discardConfirm: (fromLabel, toLabel) => ({
    title: '편집 중인 내용 버리기',
    message: `발행하지 않은 ${fromLabel} 편집 내용이 있습니다. '${toLabel}' 탭으로 넘어가면 편집 내용이 사라집니다.`,
    confirmLabel: '버리고 이동',
  }),
}
```

- [ ] **Step 2: 테스트를 쓴다**

Create `packages/admin-ui/src/composables/useLegalDocuments.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import {
  LEGAL_BODY_MAX_LENGTH,
  type AdminLegalDocument,
  type AdminLegalHistoryItem,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import {
  useLegalDocuments,
  type LegalDocumentsController,
  type UseLegalDocumentsOptions,
} from './useLegalDocuments.js'

// DOM 없이 흐름만 잰다. 대화상자는 바인딩의 `onConfirm` · `onUpdate:modelValue` 를 직접 부른다. 어댑터는 직접 푸는
// Promise(deferred)로 응답 순서를 만든다. 화면과 함께 도는 시나리오는 `useLegalDocuments.render.test.ts`(Task 7).

const KINDS = [
  { value: 'TERMS', label: '이용약관' },
  { value: 'PRIVACY', label: '개인정보처리방침' },
] as const
type Kind = (typeof KINDS)[number]['value']

const HASH = '0123456789abcdef'.repeat(4)

function doc(legalDocNo: number, kind: Kind, body: string): AdminLegalDocument {
  return {
    legalDocNo: BigInt(legalDocNo),
    kind,
    body,
    contentHash: HASH,
    publishedAt: '2026-09-01T05:00:00.000Z',
    publishedByUserNo: 7n,
    publishedByUserName: '김관리',
  }
}

function item(d: AdminLegalDocument): AdminLegalHistoryItem {
  return {
    legalDocNo: d.legalDocNo,
    kind: d.kind,
    contentHash: d.contentHash,
    publishedAt: d.publishedAt,
    publishedByUserNo: d.publishedByUserNo,
    publishedByUserName: d.publishedByUserName,
  }
}

const TERMS_12 = doc(12, 'TERMS', '# 이용약관 v12\n')
const TERMS_13 = doc(13, 'TERMS', '# 이용약관 v13(다른 관리자)\n')
const PRIVACY_5 = doc(5, 'PRIVACY', '# 개인정보처리방침 v5\n')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const apiError = (status: number, code: string, message = '실패') =>
  new ApiError(message, { status, code, raw: null })

const scopes: EffectScope[] = []

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.restoreAllMocks()
})

function setup(options: Partial<UseLegalDocumentsOptions<Kind>> = {}) {
  const loadCurrent = vi.fn(async (kind: Kind) => (kind === 'TERMS' ? TERMS_12 : PRIVACY_5))
  const loadHistory = vi.fn(async (kind: Kind) =>
    kind === 'TERMS' ? [item(TERMS_12)] : [item(PRIVACY_5)],
  )
  const loadOne = vi.fn(async (legalDocNo: bigint) => (legalDocNo === 12n ? TERMS_12 : PRIVACY_5))
  const publish = vi.fn(async () => ({ legalDocNo: 13n, contentHash: HASH }))
  const onDone = vi.fn()
  const scope = effectScope()
  scopes.push(scope)
  const legal = scope.run(() =>
    useLegalDocuments<Kind>({
      kinds: KINDS,
      loadCurrent,
      loadHistory,
      loadOne,
      publish,
      onDone,
      ...options,
    }),
  )!
  return { legal, scope, loadCurrent, loadHistory, loadOne, publish, onDone }
}

/** 확인 대화상자에서 "발행" 을 누른 것과 같다 */
async function confirmPublish(legal: LegalDocumentsController<Kind>) {
  legal.editor.value.publishDialog.onConfirm()
  await flush()
}

describe('useLegalDocuments — 불러오기', () => {
  it('처음 종류의 현재본 · 이력을 부르고, 초안은 본문 · 깨끗하다', async () => {
    const { legal, loadCurrent, loadHistory } = setup()
    await flush()
    expect(loadCurrent).toHaveBeenCalledWith('TERMS')
    expect(loadHistory).toHaveBeenCalledWith('TERMS')
    expect(legal.kind.value).toBe('TERMS')
    expect(legal.current.value).toEqual(TERMS_12)
    expect(legal.draft.value).toBe('# 이용약관 v12\n')
    expect(legal.isDirty.value).toBe(false)
    expect(legal.history.value).toEqual([item(TERMS_12)])
    expect(legal.publishBlock.value).toBe('unchanged')
    expect(legal.canPublish.value).toBe(false)
    expect(legal.editor.value.readonly).toBe(false)
  })

  it('immediate: false 면 부르지 않는다', async () => {
    const { loadCurrent, loadHistory } = setup({ immediate: false })
    await flush()
    expect(loadCurrent).not.toHaveBeenCalled()
    expect(loadHistory).not.toHaveBeenCalled()
  })

  it('initialKind 로 시작하고, 목록에 없으면 경고 뒤 첫 종류', async () => {
    const { legal } = setup({ initialKind: 'PRIVACY' })
    await flush()
    expect(legal.kind.value).toBe('PRIVACY')

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const other = setup({ initialKind: 'REFUND' as Kind })
    expect(other.legal.kind.value).toBe('TERMS')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('kinds 가 비면 만들 때 예외', () => {
    expect(() => setup({ kinds: [] })).toThrow()
  })

  it('미발행(null)이면 빈 초안 · empty, 쓰면 발행할 수 있다', async () => {
    const { legal } = setup({ loadCurrent: vi.fn(async () => null) })
    await flush()
    expect(legal.current.value).toBeNull()
    expect(legal.draft.value).toBe('')
    expect(legal.loadFailed.value).toBe(false)
    expect(legal.publishBlock.value).toBe('empty')
    legal.setDraft('# 이용약관\n')
    expect(legal.canPublish.value).toBe(true)
  })

  it('불러오는 동안은 loading · 읽기 전용', async () => {
    const pending = deferred<AdminLegalDocument | null>()
    const { legal } = setup({ loadCurrent: vi.fn(() => pending.promise) })
    expect(legal.loading.value).toBe(true)
    expect(legal.publishBlock.value).toBe('loading')
    expect(legal.editor.value.readonly).toBe(true)
    pending.resolve(TERMS_12)
    await flush()
    expect(legal.loading.value).toBe(false)
    expect(legal.editor.value.readonly).toBe(false)
  })

  it('현재본 실패 → 잠금 · 읽기 전용, 다시 시도로 회복', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockRejectedValueOnce(apiError(500, 'ERR_COMMON_INTERNAL'))
      .mockResolvedValueOnce(TERMS_12)
    const { legal } = setup({ loadCurrent })
    await flush()
    expect(legal.loadFailed.value).toBe(true)
    expect(legal.draft.value).toBe('')
    expect(legal.publishBlock.value).toBe('loadFailed')
    expect(legal.editor.value.readonly).toBe(true)

    legal.editor.value.onReloadCurrent()
    await flush()
    expect(legal.loadFailed.value).toBe(false)
    expect(legal.draft.value).toBe('# 이용약관 v12\n')
  })

  it('🔴 읽기 실패는 처리됨으로 표시하지 않는다 — 전역 토스트도 알린다(D13)', async () => {
    const error = apiError(500, 'ERR_COMMON_INTERNAL')
    setup({ loadCurrent: vi.fn(async () => Promise.reject(error)) })
    await flush()
    expect(error.handled).toBe(false)
  })

  it('이력 재조회가 실패하면 직전 목록을 남기고 historyFailed', async () => {
    const loadHistory = vi
      .fn<(kind: Kind) => Promise<readonly AdminLegalHistoryItem[]>>()
      .mockResolvedValueOnce([item(TERMS_12)])
      .mockRejectedValueOnce(apiError(500, 'ERR_COMMON_INTERNAL'))
      .mockResolvedValueOnce([item(TERMS_13), item(TERMS_12)])
    const { legal } = setup({ loadHistory })
    await flush()
    legal.editor.value.onReloadHistory()
    await flush()
    expect(legal.historyFailed.value).toBe(true)
    expect(legal.history.value).toEqual([item(TERMS_12)])
    legal.editor.value.onReloadHistory()
    await flush()
    expect(legal.historyFailed.value).toBe(false)
    expect(legal.history.value).toHaveLength(2)
  })

  it('🔴 초안이 더러울 때 reload() 는 초안을 지키고 기준만 새 본문으로(D9)', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(TERMS_13)
    const { legal } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 내 편집\n')
    await legal.reload()
    expect(legal.current.value).toEqual(TERMS_13)
    expect(legal.draft.value).toBe('# 내 편집\n')
    expect(legal.isDirty.value).toBe(true)
  })

  it('깨끗할 때 reload() 는 초안도 새 본문으로', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(TERMS_13)
    const { legal } = setup({ loadCurrent })
    await flush()
    await legal.reload()
    expect(legal.draft.value).toBe(TERMS_13.body)
    expect(legal.isDirty.value).toBe(false)
  })

  it('🔴 초안은 받은 그대로 보관한다 — 앞뒤 공백 · CRLF(D3)', async () => {
    const { legal } = setup()
    await flush()
    legal.editor.value['onUpdate:modelValue']('  본문 \r\n')
    expect(legal.draft.value).toBe('  본문 \r\n')
    expect(legal.editor.value.modelValue).toBe('  본문 \r\n')
  })
})

describe('useLegalDocuments — 종류 전환', () => {
  it('깨끗하면 바로 옮기고 새 종류를 불러온다', async () => {
    const { legal, loadCurrent } = setup()
    await flush()
    legal.editor.value.onSelectKind('PRIVACY')
    expect(legal.kind.value).toBe('PRIVACY')
    await flush()
    expect(loadCurrent).toHaveBeenLastCalledWith('PRIVACY')
    expect(legal.draft.value).toBe('# 개인정보처리방침 v5\n')
    expect(legal.history.value).toEqual([item(PRIVACY_5)])
  })

  it('🔴 옛 종류의 늦은 응답은 버린다', async () => {
    const terms = deferred<AdminLegalDocument | null>()
    const loadCurrent = vi.fn((kind: Kind) =>
      kind === 'TERMS' ? terms.promise : Promise.resolve(PRIVACY_5),
    )
    const { legal } = setup({ loadCurrent })
    legal.selectKind('PRIVACY')
    await flush()
    terms.resolve(TERMS_12)
    await flush()
    expect(legal.kind.value).toBe('PRIVACY')
    expect(legal.current.value).toEqual(PRIVACY_5)
    expect(legal.draft.value).toBe(PRIVACY_5.body)
  })

  it('더러우면 확인만 열리고 종류는 그대로 — 취소하면 아무 일도 없다', async () => {
    const { legal, loadCurrent } = setup()
    await flush()
    legal.setDraft('# 내 편집\n')
    legal.selectKind('PRIVACY')
    const dialog = legal.editor.value.discardDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.title).toBe('편집 중인 내용 버리기')
    expect(dialog.message).toBe(
      "발행하지 않은 이용약관 편집 내용이 있습니다. '개인정보처리방침' 탭으로 넘어가면 편집 내용이 사라집니다.",
    )
    expect(dialog.confirmLabel).toBe('버리고 이동')
    expect(dialog.reversible).toBe(false)
    expect(legal.kind.value).toBe('TERMS')

    dialog['onUpdate:modelValue'](false)
    expect(legal.editor.value.discardDialog.modelValue).toBe(false)
    expect(legal.kind.value).toBe('TERMS')
    expect(legal.draft.value).toBe('# 내 편집\n')
    expect(loadCurrent).toHaveBeenCalledTimes(1)
  })

  it('"버리고 이동" 이면 초안을 버리고 옮긴다', async () => {
    const { legal } = setup()
    await flush()
    legal.setDraft('# 내 편집\n')
    legal.selectKind('PRIVACY')
    legal.editor.value.discardDialog.onConfirm()
    expect(legal.editor.value.discardDialog.modelValue).toBe(false)
    expect(legal.kind.value).toBe('PRIVACY')
    await flush()
    expect(legal.draft.value).toBe(PRIVACY_5.body)
  })

  it('🔴 옮기면 초안부터 비운다 — 새 종류 조회가 실패해도 앞 종류 본문이 남지 않는다(D7)', async () => {
    const loadCurrent = vi.fn(async (kind: Kind) => {
      if (kind === 'PRIVACY') throw apiError(500, 'ERR_COMMON_INTERNAL')
      return TERMS_12
    })
    const { legal } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 내 편집\n')
    legal.selectKind('PRIVACY')
    legal.editor.value.discardDialog.onConfirm()
    await flush()
    expect(legal.kind.value).toBe('PRIVACY')
    expect(legal.draft.value).toBe('')
    expect(legal.current.value).toBeNull()
    expect(legal.loadFailed.value).toBe(true)
  })

  it('같은 종류 · 없는 종류는 무시한다', async () => {
    const { legal, loadCurrent } = setup()
    await flush()
    legal.selectKind('TERMS')
    legal.selectKind('REFUND' as Kind)
    expect(legal.kind.value).toBe('TERMS')
    expect(legal.editor.value.discardDialog.modelValue).toBe(false)
    expect(loadCurrent).toHaveBeenCalledTimes(1)
  })

  it('발행 중에는 전환을 무시한다', async () => {
    const pending = deferred<unknown>()
    const { legal } = setup({ publish: vi.fn(() => pending.promise) })
    await flush()
    legal.setDraft('# 이용약관 v12 수정\n')
    void legal.requestPublish()
    legal.editor.value.publishDialog.onConfirm()
    await flush()
    expect(legal.submitting.value).toBe(true)
    legal.selectKind('PRIVACY')
    expect(legal.kind.value).toBe('TERMS')
    expect(legal.editor.value.discardDialog.modelValue).toBe(false)
    pending.resolve({})
    await flush()
  })
})

describe('useLegalDocuments — 발행 판정', () => {
  it.each([
    ['publish 어댑터 없음', { publish: undefined }, '# 수정\n', 'readonly'],
    ['canWrite false', { canWrite: () => false }, '# 수정\n', 'readonly'],
    ['공백뿐', {}, '  \n\t', 'empty'],
    ['최대 + 1', {}, '가'.repeat(LEGAL_BODY_MAX_LENGTH + 1), 'tooLong'],
    ['시행본과 같음', {}, '# 이용약관 v12\n', 'unchanged'],
    ['최대 길이', {}, '가'.repeat(LEGAL_BODY_MAX_LENGTH), null],
  ] as const)('%s → %s', async (_label, options, body, expected) => {
    const { legal } = setup(options as Partial<UseLegalDocumentsOptions<Kind>>)
    await flush()
    legal.setDraft(body)
    expect(legal.publishBlock.value).toBe(expected)
    expect(legal.canPublish.value).toBe(expected === null)
  })

  it('🔴 이유는 순서대로 첫 것 — 권한 없음이 불러오는 중보다 먼저', () => {
    const { legal } = setup({
      canWrite: () => false,
      loadCurrent: vi.fn(() => new Promise<AdminLegalDocument | null>(() => {})),
    })
    expect(legal.loading.value).toBe(true)
    expect(legal.publishBlock.value).toBe('readonly')
  })

  it('canWrite 가 반응형 게터면 판정이 따라간다', async () => {
    const allowed = ref(true)
    const { legal } = setup({ canWrite: () => allowed.value })
    await flush()
    legal.setDraft('# 수정\n')
    expect(legal.canPublish.value).toBe(true)
    allowed.value = false
    expect(legal.publishBlock.value).toBe('readonly')
    expect(legal.editor.value.readonly).toBe(true)
  })
})

describe('useLegalDocuments — 발행', () => {
  it('확인 → 초안 · 기준 판 번호로 요청 → 깨끗 · 재조회 · onDone', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(doc(13, 'TERMS', '# 이용약관 v12\n제2조\n'))
    const { legal, publish, onDone } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 이용약관 v12\n제2조\n')
    void legal.requestPublish()
    const dialog = legal.editor.value.publishDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.title).toBe('이용약관 새 버전 발행')
    expect(dialog.message).toBe(
      '발행하면 새 버전이 바로 시행됩니다. 기존 버전은 이력에 그대로 남습니다.',
    )
    expect(dialog.confirmLabel).toBe('발행')
    expect(dialog.reversible).toBe(false)
    expect(publish).not.toHaveBeenCalled()

    await confirmPublish(legal)
    expect(publish).toHaveBeenCalledWith({
      kind: 'TERMS',
      body: '# 이용약관 v12\n제2조\n',
      baseLegalDocNo: 12n,
    })
    expect(loadCurrent).toHaveBeenCalledTimes(2)
    expect(legal.current.value?.legalDocNo).toBe(13n)
    expect(legal.isDirty.value).toBe(false)
    expect(onDone).toHaveBeenCalledWith({
      action: 'published',
      kind: 'TERMS',
      message: '이용약관 새 버전을 발행했습니다.',
    })
  })

  it('미발행에서 시작했으면 baseLegalDocNo: null', async () => {
    const { legal, publish } = setup({ loadCurrent: vi.fn(async () => null) })
    await flush()
    legal.setDraft('# 이용약관\n')
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(publish).toHaveBeenCalledWith({
      kind: 'TERMS',
      body: '# 이용약관\n',
      baseLegalDocNo: null,
    })
  })

  it('확인을 취소하면 요청 · 재조회가 없다', async () => {
    const { legal, publish, loadCurrent } = setup()
    await flush()
    legal.setDraft('# 수정\n')
    const done = legal.requestPublish()
    legal.editor.value.publishDialog['onUpdate:modelValue'](false)
    await done
    expect(publish).not.toHaveBeenCalled()
    expect(loadCurrent).toHaveBeenCalledTimes(1)
  })

  it('막혀 있으면 확인 대화상자도 열지 않는다', async () => {
    const { legal } = setup()
    await flush()
    await legal.requestPublish()
    expect(legal.editor.value.publishDialog.modelValue).toBe(false)
  })

  it('🔴 성공 뒤 재조회가 실패해도 방금 보낸 본문은 깨끗하다(D11)', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockRejectedValueOnce(apiError(500, 'ERR_COMMON_INTERNAL'))
    const { legal } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 이용약관 v13\n')
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(legal.loadFailed.value).toBe(true)
    expect(legal.draft.value).toBe('# 이용약관 v13\n')
    expect(legal.isDirty.value).toBe(false)
  })

  it('🔴 revision 충돌 → 처리됨 · 초안 유지 · 기준 = 새 판, 다시 발행하면 새 번호로(D12)', async () => {
    const conflict = apiError(
      409,
      'ERR_COMMON_REVISION_CONFLICT',
      '다른 관리자가 먼저 발행했습니다.',
    )
    const publish = vi
      .fn<(body: unknown) => Promise<unknown>>()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ legalDocNo: 14n, contentHash: HASH })
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValue(TERMS_13)
    const { legal, onDone } = setup({ publish, loadCurrent })
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    await confirmPublish(legal)

    expect(conflict.handled).toBe(true)
    expect(legal.conflict.value).toBe(true)
    expect(legal.draft.value).toBe('# 내 편집\n')
    expect(legal.current.value).toEqual(TERMS_13)
    expect(legal.isDirty.value).toBe(true)
    expect(legal.canPublish.value).toBe(true)
    expect(onDone).not.toHaveBeenCalled()

    void legal.requestPublish()
    await confirmPublish(legal)
    expect(publish).toHaveBeenLastCalledWith({
      kind: 'TERMS',
      body: '# 내 편집\n',
      baseLegalDocNo: 13n,
    })
    expect(legal.conflict.value).toBe(false)
  })

  it('충돌 안내는 닫을 수 있고, 종류를 바꾸면 내린다', async () => {
    const { legal } = setup({
      publish: vi.fn(async () => Promise.reject(apiError(409, 'ERR_COMMON_REVISION_CONFLICT'))),
    })
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(legal.conflict.value).toBe(true)
    legal.editor.value.onDismissConflict()
    expect(legal.conflict.value).toBe(false)

    // 다시 충돌시킨 뒤 종류를 바꾼다 — 초안이 더러우니 버리기 확인을 거친다
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(legal.conflict.value).toBe(true)
    legal.selectKind('PRIVACY')
    legal.editor.value.discardDialog.onConfirm()
    expect(legal.conflict.value).toBe(false)
  })

  it('그 밖의 실패는 처리 표시 없이(전역 토스트) — 초안 유지 · 재조회 없음', async () => {
    const error = apiError(500, 'ERR_COMMON_INTERNAL')
    const { legal, loadCurrent, onDone } = setup({
      publish: vi.fn(async () => Promise.reject(error)),
    })
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(error.handled).toBe(false)
    expect(legal.draft.value).toBe('# 내 편집\n')
    expect(legal.conflict.value).toBe(false)
    expect(loadCurrent).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('🔴 확인 대기 중 권한이 사라지면 보내지 않는다(D10)', async () => {
    let allowed = true
    const { legal, publish, loadCurrent, onDone } = setup({ canWrite: () => allowed })
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    allowed = false
    await confirmPublish(legal)
    expect(publish).not.toHaveBeenCalled()
    expect(loadCurrent).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('🔴 확인 대기 중 종류가 바뀌었으면 보내지 않는다(D10)', async () => {
    const { legal, publish } = setup()
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    // 대화상자가 열린 사이 다른 경로(페이지 코드)가 종류를 바꿨다 — 초안이 더러우니 버리기 확인을 거친다
    legal.selectKind('PRIVACY')
    legal.editor.value.discardDialog.onConfirm()
    await flush()
    await confirmPublish(legal)
    expect(publish).not.toHaveBeenCalled()
  })
})

describe('useLegalDocuments — 원문', () => {
  it('보기 → 불러오는 중 → 원문', async () => {
    const one = deferred<AdminLegalDocument>()
    const { legal, loadOne } = setup({ loadOne: vi.fn(() => one.promise) })
    await flush()
    legal.editor.value.onOpenDetail(item(TERMS_12))
    let dialog = legal.editor.value.detailDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.row).toEqual(item(TERMS_12))
    expect(dialog.loading).toBe(true)
    expect(loadOne).toHaveBeenCalledWith(12n)
    one.resolve(TERMS_12)
    await flush()
    dialog = legal.editor.value.detailDialog
    expect(dialog.loading).toBe(false)
    expect(dialog.document).toEqual(TERMS_12)
  })

  it('실패 → failed, 다시 시도로 회복', async () => {
    const loadOne = vi
      .fn<(legalDocNo: bigint) => Promise<AdminLegalDocument>>()
      .mockRejectedValueOnce(apiError(500, 'ERR_COMMON_INTERNAL'))
      .mockResolvedValueOnce(TERMS_12)
    const { legal } = setup({ loadOne })
    await flush()
    legal.editor.value.onOpenDetail(item(TERMS_12))
    await flush()
    expect(legal.editor.value.detailDialog.failed).toBe(true)
    legal.editor.value.detailDialog.onRetry()
    await flush()
    expect(legal.editor.value.detailDialog.failed).toBe(false)
    expect(legal.editor.value.detailDialog.document).toEqual(TERMS_12)
  })

  it('🔴 닫은 뒤 · 다른 행을 연 뒤 도착한 응답은 버린다', async () => {
    const first = deferred<AdminLegalDocument>()
    const second = deferred<AdminLegalDocument>()
    const loadOne = vi
      .fn<(legalDocNo: bigint) => Promise<AdminLegalDocument>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { legal } = setup({ loadOne })
    await flush()
    void legal.openDetail(item(TERMS_12))
    void legal.openDetail(item(TERMS_13))
    first.resolve(TERMS_12)
    await flush()
    expect(legal.editor.value.detailDialog.document).toBeNull()
    legal.editor.value.detailDialog['onUpdate:modelValue'](false)
    second.resolve(TERMS_13)
    await flush()
    expect(legal.editor.value.detailDialog.modelValue).toBe(false)
    expect(legal.editor.value.detailDialog.document).toBeNull()
  })
})

describe('useLegalDocuments — 해제', () => {
  it('🔴 스코프가 해제된 뒤 도착한 응답은 상태를 바꾸지 않는다', async () => {
    const pending = deferred<AdminLegalDocument | null>()
    const { legal, scope } = setup({ loadCurrent: vi.fn(() => pending.promise) })
    scope.stop()
    pending.resolve(TERMS_12)
    await flush()
    expect(legal.current.value).toBeNull()
    expect(legal.draft.value).toBe('')
  })
})
```

- [ ] **Step 3: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useLegalDocuments.test.ts`
Expected: FAIL — `Failed to resolve import "./useLegalDocuments.js"`

- [ ] **Step 4: `useLegalDocuments.ts` 를 쓴다**

Create `packages/admin-ui/src/composables/useLegalDocuments.ts`:

```ts
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  type ComputedRef,
  type Ref,
} from 'vue'
import {
  LEGAL_BODY_MAX_LENGTH,
  type AdminLegalDocument,
  type AdminLegalHistoryItem,
  type AdminLegalPublish,
} from '@ssworks/admin-shared'
import {
  DEFAULT_LEGAL_MESSAGES,
  type LegalKindOption,
  type LegalMessages,
  type LegalPublishBlock,
} from '../components/legal/legal-document.js'
import { useWriteFlow, type ConfirmDialogBindings } from './useWriteFlow.js'

// 약관 화면의 흐름 — 종류 전환(초안 확인) · 현재본 · 이력 · 원문 조회 · 발행(확인 → 저장 → 충돌).
//
// 정본: ssworks-gise-home apps/admin/src/pages/settings/legal.vue(흐름)
//       + ssworks-axion-admin packages/frontend/src/pages/settings/legal.vue(종류가 바뀐 뒤 늦은 응답 버림)
// 바꾼 점:
//  - 페이지에 흩어진 상태를 composable 하나로, API 직접 호출을 어댑터 넷으로(3e ① L1). 화면은 `editor` 바인딩 한 벌이다.
//  - 미발행 판정을 404(`hasCode(error, NOT_FOUND)`) 대신 어댑터의 `null` 로 한다(D15).
//  - 동시 발행 보호 — 발행 본문에 `baseLegalDocNo` 를 싣는다. 409 revision 충돌이면 초안을 지키고 기준만 새 판으로
//    바꾼다(3e ⑤ V2 · D12).
//  - 현재본 응답이 왔을 때 초안이 더러우면 지킨다(D9) — 정본은 늘 덮었다.
//  - 발행이 막힌 이유를 순서대로 낸다(`publishBlock`, D16) — 정본은 버튼만 꺼져 운영자가 이유를 몰랐다.
//
// 🔴 `kind` 를 바꾸는 자리는 `switchKind` 하나이고 초안부터 비운다(D7). 재조회가 실패해도 앞 종류의 본문이 새 탭에
//    남지 않는다 — "이용약관 탭에 개인정보 본문" 상태에서 발행하면 append-only 라 되돌릴 수 없다(gise).
// 🔴 `isDirty = draft !== baseBody`(D8). 이 기준이 없으면 탭마다 확인을 띄우거나(훈련된 무시) 아예 안 띄운다(유실).
// 🔴 확인 순간에 같은 판정을 다시 본다(D10) — 대화상자가 열린 사이 권한 회수 · 재조회 · 종류 전환이 있었을 수 있다.
//    gise 는 두 곳에 같은 조건을 글자 그대로 두었다. 여기는 `publishable()` 한 함수를 두 번 부른다.
// 🔴 발행 성공 즉시 `baseBody = 보낸 본문`, 그다음 재조회(D11). 번호 · 해시 · 발행일은 낙관적으로 채우지 않는다.
// 🔴 초안은 받은 그대로 보관한다(D3) — 고쳐서 돌려주면 한글 조합 중에 편집기 문서가 치환된다.
// 🔴 읽기 실패는 처리됨으로 표시하지 않는다(D13) — 화면 안 경고와 전역 토스트가 둘 다 뜬다(3d useTeamTree 와 같음).

export interface LegalDoneEvent<K extends string = string> {
  action: 'published'
  kind: K
  message: string
}

export interface UseLegalDocumentsOptions<
  K extends string,
  R extends AdminLegalHistoryItem = AdminLegalHistoryItem,
> {
  /** 탭 순서. 비어 있으면 만들 때 Error */
  kinds: readonly LegalKindOption<K>[]
  /** 기본 kinds[0]. 목록에 없으면 console.warn 후 kinds[0] */
  initialKind?: K
  /** null = 미발행(D15) */
  loadCurrent: (kind: K) => Promise<AdminLegalDocument | null>
  /** 최신순 전량 */
  loadHistory: (kind: K) => Promise<readonly R[]>
  loadOne: (legalDocNo: bigint) => Promise<AdminLegalDocument>
  /** 없으면 읽기 전용 */
  publish?: (body: AdminLegalPublish) => Promise<unknown>
  /** 기본 () => true. 요청 · 확인 순간에 다시 부른다(D10). 반응형 게터면 화면 판정도 따라간다 */
  canWrite?: () => boolean
  onDone?: (event: LegalDoneEvent<K>) => void | Promise<void>
  messages?: Partial<LegalMessages>
  /** 기본 true — 만들자마자 첫 종류를 불러온다 */
  immediate?: boolean
}

export interface LegalDetailDialogBindings<R> {
  modelValue: boolean
  row: R | null
  document: AdminLegalDocument | null
  loading: boolean
  failed: boolean
  /** false → 닫기 */
  'onUpdate:modelValue': (open: boolean) => void
  onRetry: () => void
}

/** `<LegalDocumentEditor v-bind="legal.editor.value" />` — props 와 리스너 이름은 컴포넌트 그대로 */
export interface LegalDocumentEditorBindings<K extends string, R> {
  kinds: readonly LegalKindOption<K>[]
  kind: K
  current: AdminLegalDocument | null
  loading: boolean
  loadFailed: boolean
  /** 초안 */
  modelValue: string
  readonly: boolean
  canPublish: boolean
  publishBlock: LegalPublishBlock | null
  submitting: boolean
  conflict: boolean
  history: readonly R[]
  historyLoading: boolean
  historyFailed: boolean
  publishDialog: ConfirmDialogBindings
  discardDialog: ConfirmDialogBindings
  detailDialog: LegalDetailDialogBindings<R>
  onSelectKind: (kind: K) => void
  'onUpdate:modelValue': (value: string) => void
  onPublish: () => void
  onReloadCurrent: () => void
  onReloadHistory: () => void
  onOpenDetail: (row: R) => void
  onDismissConflict: () => void
}

export interface LegalDocumentsController<K extends string, R = AdminLegalHistoryItem> {
  kind: Readonly<Ref<K>>
  current: Readonly<Ref<AdminLegalDocument | null>>
  draft: Readonly<Ref<string>>
  isDirty: ComputedRef<boolean>
  loading: Readonly<Ref<boolean>>
  loadFailed: ComputedRef<boolean>
  history: Readonly<Ref<readonly R[]>>
  historyLoading: Readonly<Ref<boolean>>
  historyFailed: ComputedRef<boolean>
  conflict: Readonly<Ref<boolean>>
  canPublish: ComputedRef<boolean>
  publishBlock: ComputedRef<LegalPublishBlock | null>
  submitting: Readonly<Ref<boolean>>
  selectKind: (kind: K) => void
  setDraft: (value: string) => void
  requestPublish: () => Promise<void>
  /** 현재본 + 이력. 초안이 더러우면 지킨다(D9) */
  reload: () => Promise<void>
  reloadCurrent: () => Promise<void>
  reloadHistory: () => Promise<void>
  openDetail: (row: R) => Promise<void>
  closeDetail: () => void
  dismissConflict: () => void
  editor: ComputedRef<LegalDocumentEditorBindings<K, R>>
}

interface DetailState<R> {
  open: boolean
  row: R | null
  document: AdminLegalDocument | null
  loading: boolean
  failed: boolean
}

export function useLegalDocuments<
  K extends string,
  R extends AdminLegalHistoryItem = AdminLegalHistoryItem,
>(options: UseLegalDocumentsOptions<K, R>): LegalDocumentsController<K, R> {
  const kinds = options.kinds
  if (kinds.length === 0) throw new Error('useLegalDocuments: kinds 가 비어 있다')
  const messages: LegalMessages = { ...DEFAULT_LEGAL_MESSAGES, ...options.messages }
  const canWrite = options.canWrite ?? (() => true)

  const isKind = (value: unknown): value is K => kinds.some((option) => option.value === value)
  const labelOf = (value: K): string =>
    kinds.find((option) => option.value === value)?.label ?? value

  function initialKind(): K {
    const wanted = options.initialKind
    if (wanted === undefined || isKind(wanted)) return wanted ?? kinds[0]!.value
    console.warn(
      `useLegalDocuments: initialKind '${wanted}' 이(가) kinds 에 없어 첫 종류로 시작한다`,
    )
    return kinds[0]!.value
  }

  const kind = ref(initialKind()) as Ref<K>
  const current = shallowRef<AdminLegalDocument | null>(null)
  const currentLoading = ref(false)
  const currentFailed = ref(false)
  const draft = ref('')
  /** 초안의 비교 기준(D8) */
  const baseBody = ref('')
  const history = shallowRef<readonly R[]>([])
  const historyLoading = ref(false)
  const historyFailed = ref(false)
  const conflict = ref(false)
  const detail = shallowRef<DetailState<R>>({
    open: false,
    row: null,
    document: null,
    loading: false,
    failed: false,
  })
  const discard = shallowRef<{ open: boolean; pendingKind: K | null }>({
    open: false,
    pendingKind: null,
  })

  const flow = useWriteFlow()
  let currentSeq = 0
  let historySeq = 0
  let detailSeq = 0
  /** 🔴 화면이 사라진 뒤 도착한 응답은 상태를 바꾸지 않는다 */
  let disposed = false
  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
    })
  }

  const isDirty = computed(() => draft.value !== baseBody.value)

  // ── 불러오기 ──────────────────────────────────────────────────────

  async function loadCurrent(k: K): Promise<void> {
    if (disposed) return
    const seq = ++currentSeq
    currentLoading.value = true
    currentFailed.value = false
    try {
      const document = await options.loadCurrent(k)
      if (disposed || seq !== currentSeq) return
      // 🔴 그 시점에 초안이 더러우면 지키고 기준만 바꾼다(D9) — 충돌 뒤 재조회 · reload() 가 편집을 덮지 않게
      const keep = draft.value !== baseBody.value
      current.value = document
      baseBody.value = document?.body ?? ''
      if (!keep) draft.value = baseBody.value
    } catch {
      if (disposed || seq !== currentSeq) return
      // current · 초안은 그대로 — 화면이 실패 경고 · 잠금을 보인다(D13)
      currentFailed.value = true
    } finally {
      if (seq === currentSeq) currentLoading.value = false
    }
  }

  async function loadHistory(k: K): Promise<void> {
    if (disposed) return
    const seq = ++historySeq
    historyLoading.value = true
    try {
      const items = await options.loadHistory(k)
      if (disposed || seq !== historySeq) return
      history.value = items
      historyFailed.value = false
    } catch {
      if (disposed || seq !== historySeq) return
      // 직전 목록은 남긴다 — 화면이 "최신이 아닐 수 있다" 고 알린다(gise)
      historyFailed.value = true
    } finally {
      if (seq === historySeq) historyLoading.value = false
    }
  }

  async function load(k: K): Promise<void> {
    await Promise.all([loadCurrent(k), loadHistory(k)])
  }

  // ── 판정 ──────────────────────────────────────────────────────────

  /** 발행이 막힌 첫 이유(D16). 발행 중 여부는 보지 않는다 — 확인 순간의 재검사(D10)가 같은 함수를 쓴다 */
  function publishable(): LegalPublishBlock | null {
    if (options.publish == null || !canWrite()) return 'readonly'
    if (currentLoading.value) return 'loading'
    if (currentFailed.value) return 'loadFailed'
    if (draft.value.trim() === '') return 'empty'
    if (draft.value.length > LEGAL_BODY_MAX_LENGTH) return 'tooLong'
    if (draft.value === baseBody.value) return 'unchanged'
    return null
  }

  const publishBlock = computed(publishable)
  const canPublish = computed(() => publishBlock.value === null && !flow.submitting.value)
  /** 편집기 잠금 — 쓸 수 없거나 비교할 본이 없거나(불러오는 중 · 실패) 발행 중일 때. 빈 본문 · 변경 없음은 잠그지 않는다 */
  const editorReadonly = computed(() => {
    const block = publishBlock.value
    return (
      block === 'readonly' || block === 'loading' || block === 'loadFailed' || flow.submitting.value
    )
  })

  // ── 종류 ──────────────────────────────────────────────────────────

  /** 🔴 `kind` 를 바꾸는 유일한 자리 — 초안부터 비운다(D7) */
  function switchKind(next: K): void {
    kind.value = next
    draft.value = ''
    baseBody.value = ''
    current.value = null
    history.value = []
    historyFailed.value = false
    conflict.value = false
    closeDetail()
    void load(next)
  }

  function selectKind(next: K): void {
    if (next === kind.value || !isKind(next) || flow.submitting.value) return
    if (isDirty.value) {
      discard.value = { open: true, pendingKind: next }
      return
    }
    switchKind(next)
  }

  function confirmDiscard(): void {
    const next = discard.value.pendingKind
    discard.value = { open: false, pendingKind: null }
    if (next == null || next === kind.value || flow.submitting.value) return
    switchKind(next)
  }

  function cancelDiscard(): void {
    discard.value = { open: false, pendingKind: null }
  }

  // ── 발행 ──────────────────────────────────────────────────────────

  async function requestPublish(): Promise<void> {
    const doPublish = options.publish
    if (doPublish == null || !canPublish.value) return
    const k = kind.value
    const label = labelOf(k)
    const text = messages.publishConfirm(label)
    let attempted = false
    let sent = ''
    const ok = await flow.run({
      gate: 'confirm',
      reversible: false,
      title: text.title,
      message: text.message,
      confirmLabel: text.confirmLabel,
      action: async () => {
        // 🔴 확인 순간에 다시 본다(D10)
        if (kind.value !== k || publishable() !== null) return
        attempted = true
        sent = draft.value
        await doPublish({
          kind: k,
          body: sent,
          baseLegalDocNo: current.value?.legalDocNo ?? null,
        })
      },
      onConflict: async () => {
        // 409 revision — 다른 관리자가 그사이 발행했다. 초안을 지키고 기준만 새 판으로(D9 · D12). 이 함수가 끝날 때까지
        // useWriteFlow 가 submitting 을 유지하므로 재조회 동안 발행 · 종류 전환이 잠긴다.
        conflict.value = true
        await load(k)
      },
    })
    if (!ok || !attempted) return
    // 🔴 재조회보다 먼저(D11)
    baseBody.value = sent
    conflict.value = false
    await load(k)
    await options.onDone?.({ action: 'published', kind: k, message: messages.published(label) })
  }

  // ── 원문 ──────────────────────────────────────────────────────────

  async function openDetail(row: R): Promise<void> {
    if (disposed) return
    const seq = ++detailSeq
    detail.value = { open: true, row, document: null, loading: true, failed: false }
    try {
      const document = await options.loadOne(row.legalDocNo)
      if (disposed || seq !== detailSeq) return
      detail.value = { ...detail.value, document, loading: false }
    } catch {
      if (disposed || seq !== detailSeq) return
      detail.value = { ...detail.value, failed: true, loading: false }
    }
  }

  /** 닫은 뒤 도착한 응답은 버린다(번호를 올린다). 내용은 남겨 닫히는 동안 깜빡이지 않게 한다 */
  function closeDetail(): void {
    detailSeq += 1
    detail.value = { ...detail.value, open: false, loading: false }
  }

  // ── 그 밖 ─────────────────────────────────────────────────────────

  /** 🔴 받은 그대로(D3) */
  function setDraft(value: string): void {
    draft.value = value
  }

  const reloadCurrent = () => loadCurrent(kind.value)
  const reloadHistory = () => loadHistory(kind.value)
  const reload = () => load(kind.value)
  const dismissConflict = () => {
    conflict.value = false
  }

  const discardDialog = computed<ConfirmDialogBindings>(() => {
    const pending = discard.value.pendingKind
    const text = messages.discardConfirm(
      labelOf(kind.value),
      pending == null ? '' : labelOf(pending),
    )
    return {
      modelValue: discard.value.open,
      'onUpdate:modelValue': (open: boolean) => {
        if (!open) cancelDiscard()
      },
      title: text.title,
      message: text.message,
      confirmLabel: text.confirmLabel,
      // 🔴 초안은 서버 어디에도 없다 — 버리면 되돌릴 방법이 없다(gise)
      reversible: false,
      submitting: false,
      onConfirm: confirmDiscard,
    }
  })

  const editor = computed<LegalDocumentEditorBindings<K, R>>(() => ({
    kinds,
    kind: kind.value,
    current: current.value,
    loading: currentLoading.value,
    loadFailed: currentFailed.value,
    modelValue: draft.value,
    readonly: editorReadonly.value,
    canPublish: canPublish.value,
    publishBlock: publishBlock.value,
    submitting: flow.submitting.value,
    conflict: conflict.value,
    history: history.value,
    historyLoading: historyLoading.value,
    historyFailed: historyFailed.value,
    publishDialog: flow.confirmDialog.value,
    discardDialog: discardDialog.value,
    detailDialog: {
      modelValue: detail.value.open,
      row: detail.value.row,
      document: detail.value.document,
      loading: detail.value.loading,
      failed: detail.value.failed,
      'onUpdate:modelValue': (open: boolean) => {
        if (!open) closeDetail()
      },
      onRetry: () => {
        const row = detail.value.row
        if (row != null) void openDetail(row)
      },
    },
    onSelectKind: selectKind,
    'onUpdate:modelValue': setDraft,
    onPublish: () => {
      void requestPublish()
    },
    onReloadCurrent: () => {
      void reloadCurrent()
    },
    onReloadHistory: () => {
      void reloadHistory()
    },
    onOpenDetail: (row: R) => {
      void openDetail(row)
    },
    onDismissConflict: dismissConflict,
  }))

  if (options.immediate ?? true) void load(kind.value)

  return {
    kind,
    current,
    draft,
    isDirty,
    loading: currentLoading,
    loadFailed: computed(() => currentFailed.value),
    history,
    historyLoading,
    historyFailed: computed(() => historyFailed.value),
    conflict,
    canPublish,
    publishBlock,
    submitting: flow.submitting,
    selectKind,
    setDraft,
    requestPublish,
    reload,
    reloadCurrent,
    reloadHistory,
    openDetail,
    closeDetail,
    dismissConflict,
    editor,
  }
}
```

- [ ] **Step 5: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useLegalDocuments.test.ts`
Expected: PASS(41 — `it.each` 6건 포함). 한 건씩 실패를 읽고 고친다.

- 테스트의 기대를 바꾸지 않는다. 기대가 스펙 D-목록과 어긋난다고 판단되면 고치지 말고 보고한다.
- `'발행 중에는 전환을 무시한다'` 가 `submitting` false 로 실패하면 `flush()` 가 `execute` 진입을 기다렸는지 본다. `onConfirm` → `execute` 는 동기로 `submitting = true` 를 세운다.

- [ ] **Step 6: 타입 · lint · 커밋**

```bash
pnpm --filter @ssworks/admin-ui typecheck
pnpm exec prettier --write packages/admin-ui/src/components/legal/legal-document.ts packages/admin-ui/src/composables/useLegalDocuments.ts packages/admin-ui/src/composables/useLegalDocuments.test.ts
pnpm exec eslint packages/admin-ui/src/components/legal packages/admin-ui/src/composables
git add packages/admin-ui/src/components/legal packages/admin-ui/src/composables/useLegalDocuments.ts packages/admin-ui/src/composables/useLegalDocuments.test.ts
git commit -F - <<'EOF'
feat(admin-ui): useLegalDocuments — 종류 전환 확인 · 발행 확인 · revision 충돌

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 6: `LegalDocumentEditor` — 화면 한 벌

**Files:**

- Modify: `packages/admin-ui/src/components/legal/legal-document.ts`(화면 문구 · 표기 함수 추가)
- Create: `packages/admin-ui/src/components/legal/LegalDocumentEditor.vue`
- Test: `packages/admin-ui/src/components/legal/legal-document.test.ts`(순수 함수 · 문구)
- Test: `packages/admin-ui/src/components/legal/legal-document-editor.render.test.ts`

**Interfaces:**

- Consumes:
  - Task 3 `MarkdownView` · Task 4 `MarkdownEditor`
  - Task 5 `LegalKindOption` · `LegalPublishBlock` · `LegalDetailDialogBindings<R>`(from `../../composables/useLegalDocuments.js`)
  - `ConfirmDialogBindings`(from `../../composables/useWriteFlow.js`)
  - `formatDateTime`(Task 2) · `AdminTableHeader`(`../table/data-table.js`) · `BaseDialog` · `ConfirmDialog`
- Produces:
  - `LegalDocumentEditor` 컴포넌트(`generic="K extends string, R extends AdminLegalHistoryItem"`)
    - props: `LegalDocumentEditorBindings<K, R>` 의 상태 전부 + `historyHeaders?` · `formatDate?` · `editorHeight?` · `messages?`
    - emits: `selectKind(kind: K)` · `update:modelValue(value: string)` · `publish()` · `reloadCurrent()` · `reloadHistory()` · `openDetail(row: R)` · `dismissConflict()`
    - 슬롯 `item.<key>`(더한 열)
  - `legal-document.ts`: `LegalDocumentEditorMessages` · `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES` · `shortHash(hash)` · `publisherLabel(name, userNo)`

- [ ] **Step 1: 화면 문구 · 표기 함수 테스트를 쓴다**

Create `packages/admin-ui/src/components/legal/legal-document.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES as MESSAGES,
  publisherLabel,
  shortHash,
} from './legal-document.js'

describe('shortHash', () => {
  it('앞 8자', () => {
    expect(shortHash('a1b2c3d4' + 'e'.repeat(56))).toBe('a1b2c3d4')
  })

  it('비었으면 "-"', () => {
    expect(shortHash('')).toBe('-')
    expect(shortHash(null)).toBe('-')
  })
})

describe('publisherLabel — 이름 → #번호 → "-"(D20)', () => {
  it('이름이 있으면 이름', () => {
    expect(publisherLabel('김관리', 7n)).toBe('김관리')
  })

  it('이름이 없으면 #번호(axion)', () => {
    expect(publisherLabel(null, 7n)).toBe('#7')
  })

  it('둘 다 없으면 "-"(gise — 계정이 지워짐)', () => {
    expect(publisherLabel(null, null)).toBe('-')
  })
})

describe('화면 기본 문구', () => {
  it('충돌 안내 — 날짜를 알면 넣고, 모르면 뺀다', () => {
    expect(MESSAGES.conflict('2026-10-07 10:12')).toBe(
      '다른 관리자가 2026-10-07 10:12에 새 버전을 발행했습니다. 이력에서 새 판을 확인한 뒤 다시 발행하세요. 다시 발행하면 그 판을 대체합니다.',
    )
    expect(MESSAGES.conflict(null)).toBe(
      '다른 관리자가 새 버전을 발행했습니다. 이력에서 새 판을 확인한 뒤 다시 발행하세요. 다시 발행하면 그 판을 대체합니다.',
    )
  })

  it('너무 김 — 상한을 천 단위로 끊어 적는다', () => {
    expect(MESSAGES.blocked.tooLong).toBe('본문은 1,000,000자를 넘을 수 없습니다.')
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/legal/legal-document.test.ts`
Expected: FAIL — `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES` · `publisherLabel` · `shortHash` 가 없다(undefined)

- [ ] **Step 3: `legal-document.ts` 에 화면 쪽을 더한다**

Modify `packages/admin-ui/src/components/legal/legal-document.ts`.

(1) 파일 맨 위, 첫 주석 줄 다음에 import 를 둔다:

```ts
// 약관 화면의 타입 · 기본 문구. `useLegalDocuments`(흐름)와 `LegalDocumentEditor`(화면)가 함께 쓴다.

import { LEGAL_BODY_MAX_LENGTH } from '@ssworks/admin-shared'
```

(2) 파일 끝에 붙인다:

```ts
/** 화면이 내는 문구. 흐름 문구(`LegalMessages`)와 나눈다(3d 와 같은 분리) */
export interface LegalDocumentEditorMessages {
  kindTabs: string
  editorLabel: (kindLabel: string) => string
  preview: string
  previewEmpty: string
  currentChip: string
  currentLine: (publishedAt: string, publisher: string, hash: string) => string
  notPublished: (kindLabel: string) => string
  loadFailed: string
  retry: string
  /** 날짜를 모르면(재조회 실패) null */
  conflict: (publishedAt: string | null) => string
  publish: string
  /** 발행이 막힌 이유 — `loading` 은 진행 막대가 대신한다 */
  blocked: Record<Exclude<LegalPublishBlock, 'loading'>, string>
  historyTitle: string
  historyFailed: string
  historyEmpty: string
  headers: { legalDocNo: string; publishedAt: string; publisher: string; contentHash: string }
  view: string
  viewLabel: (legalDocNo: bigint) => string
  detailTitle: string
  detailMeta: (legalDocNo: bigint, publishedAt: string, publisher: string, hash: string) => string
  detailFailed: string
  close: string
}

const CONFLICT_TAIL =
  '발행했습니다. 이력에서 새 판을 확인한 뒤 다시 발행하세요. 다시 발행하면 그 판을 대체합니다.'

export const DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES: LegalDocumentEditorMessages = {
  kindTabs: '문서 종류',
  editorLabel: (kindLabel) => `${kindLabel} 본문`,
  preview: '미리보기',
  previewEmpty: '미리 볼 내용이 없습니다.',
  currentChip: '시행 중',
  currentLine: (publishedAt, publisher, hash) =>
    `${publishedAt} 발행 · ${publisher} · 해시 ${hash}`,
  notPublished: (kindLabel) =>
    `아직 발행된 ${kindLabel} 문서가 없습니다. 본문을 작성해 발행하세요.`,
  loadFailed: '현재본을 불러오지 못했습니다. 다시 불러오기 전까지 발행할 수 없습니다.',
  retry: '다시 시도',
  conflict: (publishedAt) =>
    publishedAt == null
      ? `다른 관리자가 새 버전을 ${CONFLICT_TAIL}`
      : `다른 관리자가 ${publishedAt}에 새 버전을 ${CONFLICT_TAIL}`,
  publish: '새 버전 발행',
  blocked: {
    readonly: '발행 권한이 없습니다.',
    loadFailed: '현재본을 불러온 뒤 발행할 수 있습니다.',
    empty: '본문을 입력하세요.',
    tooLong: `본문은 ${LEGAL_BODY_MAX_LENGTH.toLocaleString('en-US')}자를 넘을 수 없습니다.`,
    unchanged: '시행 중인 판과 내용이 같습니다.',
  },
  historyTitle: '발행 이력',
  historyFailed: '발행 이력을 불러오지 못했습니다. 아래 목록이 최신이 아닐 수 있습니다.',
  historyEmpty: '발행 이력이 없습니다.',
  headers: { legalDocNo: '번호', publishedAt: '발행일', publisher: '발행자', contentHash: '해시' },
  view: '보기',
  viewLabel: (legalDocNo) => `${legalDocNo}번 판 원문 보기`,
  detailTitle: '판 원문',
  detailMeta: (legalDocNo, publishedAt, publisher, hash) =>
    `${legalDocNo}번 · ${publishedAt} · ${publisher} · 해시 ${hash}`,
  detailFailed: '원문을 불러오지 못했습니다.',
  close: '닫기',
}

/**
 * 해시 표시용 앞 8자. 관리자가 판을 눈으로 가려내는 용도이지 그 자체가 증거는 아니다 — 전체 값은 서버에 있다(axion
 * `legal.util.ts`). 비었으면 "-".
 */
export function shortHash(hash: string | null | undefined): string {
  return hash ? hash.slice(0, 8) : '-'
}

/**
 * 발행자 표기(3e D20): 이름 → 없으면 `#번호`(axion — 이름이 바뀌거나 비어도 추적할 수 있게) → 둘 다 없으면 "-"(gise —
 * 계정이 지워지면 FK SET NULL 로 둘 다 빈다).
 */
export function publisherLabel(name: string | null, userNo: bigint | null): string {
  if (name != null && name !== '') return name
  if (userNo != null) return `#${userNo}`
  return '-'
}
```

- [ ] **Step 4: 순수 함수 테스트 통과를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/legal/legal-document.test.ts`
Expected: PASS(7)

- [ ] **Step 5: 화면 렌더 테스트를 쓴다**

Create `packages/admin-ui/src/components/legal/legal-document-editor.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { EditorView } from 'codemirror'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, type Component } from 'vue'
import type { AdminLegalDocument, AdminLegalHistoryItem } from '@ssworks/admin-shared'
import type { ConfirmDialogBindings } from '../../composables/useWriteFlow.js'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import { formatDateTime } from '../../utils/format-date-time.js'
import LegalDocumentEditor from './LegalDocumentEditor.vue'

// 바인딩을 손으로 넘겨 화면만 잰다. 흐름과 함께 도는 시나리오는 composables/useLegalDocuments.render.test.ts(Task 7).

installVisualViewport()

const KINDS = [
  { value: 'TERMS', label: '이용약관' },
  { value: 'PRIVACY', label: '개인정보처리방침' },
] as const

const HASH = 'a1b2c3d4' + 'e'.repeat(56)
const AT = '2026-09-01T05:00:00.000Z'

const CURRENT: AdminLegalDocument = {
  legalDocNo: 12n,
  kind: 'TERMS',
  body: '# 제1조\n',
  contentHash: HASH,
  publishedAt: AT,
  publishedByUserNo: 7n,
  publishedByUserName: '김관리',
}

const row = (
  legalDocNo: number,
  name: string | null,
  userNo: bigint | null,
): AdminLegalHistoryItem => ({
  legalDocNo: BigInt(legalDocNo),
  kind: 'TERMS',
  contentHash: HASH,
  publishedAt: AT,
  publishedByUserNo: userNo,
  publishedByUserName: name,
})

const ROWS = [row(12, '김관리', 7n), row(11, null, 7n), row(10, null, null)]

/** 날짜 표기를 고정해 시간대와 무관하게 잰다 */
const F = (iso: string) => `F(${iso})`

function closedDialog(): ConfirmDialogBindings {
  return {
    modelValue: false,
    'onUpdate:modelValue': vi.fn(),
    title: '',
    message: '',
    reversible: false,
    submitting: false,
    onConfirm: vi.fn(),
  }
}

function bindings(overrides: Record<string, unknown> = {}) {
  return {
    kinds: KINDS,
    kind: 'TERMS',
    current: CURRENT,
    loading: false,
    loadFailed: false,
    modelValue: '# 제1조\n',
    readonly: false,
    canPublish: true,
    publishBlock: null,
    submitting: false,
    conflict: false,
    history: ROWS,
    historyLoading: false,
    historyFailed: false,
    publishDialog: closedDialog(),
    discardDialog: closedDialog(),
    detailDialog: {
      modelValue: false,
      row: null,
      document: null,
      loading: false,
      failed: false,
      'onUpdate:modelValue': vi.fn(),
      onRetry: vi.fn(),
    },
    formatDate: F,
    ...overrides,
  }
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function mountEditor(overrides: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  wrapper = mount(LegalDocumentEditor as Component, {
    props: bindings(overrides),
    slots,
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  return wrapper
}

const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
const tab = (label: string) => tabs().find((t) => t.textContent?.trim() === label)
const selectedTab = () =>
  tabs()
    .find((t) => t.classList.contains('v-tab--selected'))
    ?.textContent?.trim()
const activeDialog = () =>
  document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body
const headTitles = () =>
  [...document.querySelectorAll('.legal-document-editor__history thead th')].map(
    (th) => th.textContent?.trim() ?? '',
  )
const tableRows = () => [...document.querySelectorAll('.legal-document-editor__history tbody tr')]
const cells = (tr: Element) =>
  [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim() ?? '')
const content = (label: string) =>
  document.querySelector<HTMLElement>(`.cm-content[aria-label="${label}"]`)

describe('LegalDocumentEditor — 탭', () => {
  it('종류 라벨을 탭으로 그리고 kind 가 선택이다', () => {
    mountEditor()
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['이용약관', '개인정보처리방침'])
    expect(selectedTab()).toBe('이용약관')
    expect(document.querySelector('[aria-label="문서 종류"]')).toBeTruthy()
  })

  it('🔴 다른 탭을 누르면 selectKind 를 쏘고, 부모가 kind 를 바꾸기 전엔 선택이 그대로다(D7)', async () => {
    const w = mountEditor()
    tab('개인정보처리방침')!.click()
    await flushPromises()
    expect(w.emitted('selectKind')).toEqual([['PRIVACY']])
    expect(selectedTab()).toBe('이용약관')
    await w.setProps({ kind: 'PRIVACY' })
    expect(selectedTab()).toBe('개인정보처리방침')
  })

  it('발행 중이면 탭이 꺼진다', () => {
    mountEditor({ submitting: true })
    expect(tabs().every((t) => t.disabled)).toBe(true)
  })
})

describe('LegalDocumentEditor — 시행 정보', () => {
  it('시행 중 칩과 발행일 · 발행자 · 해시 8자', () => {
    const w = mountEditor()
    const line = w.find('.legal-document-editor__current')
    expect(line.text()).toContain('시행 중')
    expect(line.text()).toContain(`F(${AT}) 발행 · 김관리 · 해시 a1b2c3d4`)
  })

  it('미발행이면 종류 이름을 넣어 안내한다', () => {
    const w = mountEditor({ current: null })
    expect(w.text()).toContain('아직 발행된 이용약관 문서가 없습니다. 본문을 작성해 발행하세요.')
  })

  it('불러오는 중이면 진행 막대를 보이고 시행 정보는 없다', () => {
    const w = mountEditor({ loading: true })
    expect(w.find('.v-progress-linear').exists()).toBe(true)
    expect(w.find('.legal-document-editor__current').exists()).toBe(false)
  })

  it('🔴 실패면 안내 + [다시 시도], 시행 정보 · 이력의 시행 중 칩을 숨긴다(D19)', () => {
    const w = mountEditor({ loadFailed: true })
    expect(w.text()).toContain(
      '현재본을 불러오지 못했습니다. 다시 불러오기 전까지 발행할 수 없습니다.',
    )
    expect(w.find('.legal-document-editor__current').exists()).toBe(false)
    expect(w.text()).not.toContain('시행 중')
    buttonByText('다시 시도', w.element)!.click()
    expect(w.emitted('reloadCurrent')).toHaveLength(1)
  })
})

describe('LegalDocumentEditor — 충돌', () => {
  it('새 판의 발행일을 넣어 안내하고, 닫으면 dismissConflict', async () => {
    const w = mountEditor({ conflict: true })
    expect(w.text()).toContain(
      `다른 관리자가 F(${AT})에 새 버전을 발행했습니다. 이력에서 새 판을 확인한 뒤 다시 발행하세요. 다시 발행하면 그 판을 대체합니다.`,
    )
    await w.find('.v-alert__close button').trigger('click')
    expect(w.emitted('dismissConflict')).toHaveLength(1)
  })

  it('현재본을 모르면(실패) 날짜 없이 안내한다', () => {
    const w = mountEditor({ conflict: true, loadFailed: true })
    expect(w.text()).toContain('다른 관리자가 새 버전을 발행했습니다.')
  })
})

describe('LegalDocumentEditor — 편집기 · 미리보기', () => {
  it('편집기 이름은 「종류 본문」이고 readonly 를 넘긴다', () => {
    mountEditor({ readonly: true })
    expect(content('이용약관 본문')?.getAttribute('aria-readonly')).toBe('true')
  })

  it('입력하면 update:modelValue', () => {
    const w = mountEditor()
    const view = EditorView.findFromDOM(content('이용약관 본문')!)!
    view.dispatch({
      changes: { from: view.state.doc.length, insert: '본문' },
      userEvent: 'input.type',
    })
    expect(w.emitted('update:modelValue')).toEqual([['# 제1조\n본문']])
  })

  it('미리보기가 초안을 그리고, 비면 안내한다', async () => {
    const w = mountEditor()
    const preview = () => document.querySelector('[aria-label="미리보기"]')!
    expect(preview().querySelector('h1')?.textContent).toBe('제1조')
    await w.setProps({ modelValue: '' })
    expect(preview().textContent).toContain('미리 볼 내용이 없습니다.')
  })

  it('미리보기의 링크는 새 탭으로 연다(D18)', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    mountEditor({ modelValue: '[도움말](https://example.com/help)' })
    const anchor = document.querySelector('[aria-label="미리보기"] a')!
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).toHaveBeenCalledWith('https://example.com/help', '_blank', 'noopener,noreferrer')
  })
})

describe('LegalDocumentEditor — 발행', () => {
  it('누르면 publish, 발행 중이면 loading', async () => {
    const w = mountEditor()
    buttonByText('새 버전 발행', w.element)!.click()
    expect(w.emitted('publish')).toHaveLength(1)
    await w.setProps({ submitting: true })
    expect(buttonByText('새 버전 발행', w.element)?.classList.contains('v-btn--loading')).toBe(true)
  })

  it('canPublish 가 아니면 꺼진다', () => {
    const w = mountEditor({ canPublish: false, publishBlock: 'unchanged' })
    expect(buttonByText('새 버전 발행', w.element)!.disabled).toBe(true)
  })

  it.each([
    ['readonly', '발행 권한이 없습니다.'],
    ['loadFailed', '현재본을 불러온 뒤 발행할 수 있습니다.'],
    ['empty', '본문을 입력하세요.'],
    ['tooLong', '본문은 1,000,000자를 넘을 수 없습니다.'],
    ['unchanged', '시행 중인 판과 내용이 같습니다.'],
  ] as const)('막힌 이유 %s → 「%s」', (block, message) => {
    const w = mountEditor({ canPublish: false, publishBlock: block })
    expect(w.find('.legal-document-editor__hint').text()).toBe(message)
  })

  it('불러오는 중(loading)은 글자 없이 진행 막대가 대신한다', () => {
    const w = mountEditor({ canPublish: false, publishBlock: 'loading', loading: true })
    expect(w.find('.legal-document-editor__hint').exists()).toBe(false)
  })
})

describe('LegalDocumentEditor — 이력', () => {
  it('열 머리 · 번호 · 발행일 · 발행자 대체 · 해시 8자 · 시행 중 칩', () => {
    mountEditor()
    expect(headTitles()).toEqual(['번호', '발행일', '발행자', '해시', ''])
    const [first, second, third] = tableRows().map(cells)
    expect(first![0]).toMatch(/^12\s*시행 중$/)
    expect(first!.slice(1)).toEqual([`F(${AT})`, '김관리', 'a1b2c3d4', '보기'])
    expect(second!.slice(0, 3)).toEqual(['11', `F(${AT})`, '#7'])
    expect(third![2]).toBe('-')
  })

  it('[보기] → openDetail(행) — 키보드로 닿는 버튼이다', () => {
    const w = mountEditor()
    document.querySelector<HTMLButtonElement>('button[aria-label="11번 판 원문 보기"]')!.click()
    expect(w.emitted('openDetail')).toEqual([[ROWS[1]]])
  })

  it('더한 열은 [보기] 앞에 붙고, 슬롯이 있으면 슬롯으로 그린다', () => {
    mountEditor(
      {
        history: ROWS.map((r, index) => ({ ...r, consentCount: index + 1 })),
        historyHeaders: [{ title: '동의', key: 'consentCount' }],
      },
      {
        'item.consentCount': ({ item }: { item: { consentCount: number } }) =>
          h('span', `${item.consentCount}건`),
      },
    )
    expect(headTitles()).toEqual(['번호', '발행일', '발행자', '해시', '동의', ''])
    expect(cells(tableRows()[0]!)[4]).toBe('1건')
  })

  it('슬롯이 없으면 더한 열은 원값', () => {
    mountEditor({
      history: ROWS.map((r) => ({ ...r, consentCount: 3 })),
      historyHeaders: [{ title: '동의', key: 'consentCount' }],
    })
    expect(cells(tableRows()[0]!)[4]).toBe('3')
  })

  it('이력 실패면 경고 + [다시 시도] → reloadHistory', () => {
    const w = mountEditor({ historyFailed: true })
    expect(w.text()).toContain(
      '발행 이력을 불러오지 못했습니다. 아래 목록이 최신이 아닐 수 있습니다.',
    )
    buttonByText('다시 시도', w.element)!.click()
    expect(w.emitted('reloadHistory')).toHaveLength(1)
  })

  it('빈 목록이면 안내한다', () => {
    const w = mountEditor({ history: [] })
    expect(w.text()).toContain('발행 이력이 없습니다.')
  })
})

describe('LegalDocumentEditor — 대화상자', () => {
  function openDetail(overrides: Record<string, unknown>) {
    return mountEditor({
      detailDialog: {
        modelValue: true,
        row: ROWS[0],
        document: null,
        loading: false,
        failed: false,
        'onUpdate:modelValue': vi.fn(),
        onRetry: vi.fn(),
        ...overrides,
      },
    })
  }

  it('원문 — 머리 줄과 불러오는 중', async () => {
    openDetail({ loading: true })
    await flushPromises()
    const dialog = activeDialog()
    expect(dialog.textContent).toContain('판 원문')
    expect(dialog.textContent).toContain(`12번 · F(${AT}) · 김관리 · 해시 a1b2c3d4`)
    expect(dialog.querySelector('.v-progress-linear')).toBeTruthy()
  })

  it('원문 — 실패면 안내 + [다시 시도] → onRetry', async () => {
    const onRetry = vi.fn()
    openDetail({ failed: true, onRetry })
    await flushPromises()
    expect(activeDialog().textContent).toContain('원문을 불러오지 못했습니다.')
    buttonByText('다시 시도', activeDialog())!.click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('원문 — 본문을 그리고, [닫기] 는 onUpdate:modelValue(false)', async () => {
    const onClose = vi.fn()
    openDetail({ document: CURRENT, 'onUpdate:modelValue': onClose })
    await flushPromises()
    expect(activeDialog().querySelector('h1')?.textContent).toBe('제1조')
    buttonByText('닫기', activeDialog())!.click()
    await flushPromises()
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('확인 바인딩을 ConfirmDialog 에 그대로 넘긴다', async () => {
    const onConfirm = vi.fn()
    mountEditor({
      discardDialog: {
        ...closedDialog(),
        modelValue: true,
        title: '편집 중인 내용 버리기',
        message: '발행하지 않은 이용약관 편집 내용이 있습니다.',
        confirmLabel: '버리고 이동',
        onConfirm,
      },
    })
    await flushPromises()
    expect(activeDialog().textContent).toContain('편집 중인 내용 버리기')
    buttonByText('버리고 이동', activeDialog())!.click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('LegalDocumentEditor — 표기', () => {
  it('formatDate 를 주지 않으면 formatDateTime(현지 YYYY-MM-DD HH:mm)', () => {
    const w = mountEditor({ formatDate: undefined })
    expect(w.find('.legal-document-editor__current').text()).toContain(formatDateTime(AT))
  })
})
```

- [ ] **Step 6: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/legal/legal-document-editor.render.test.ts`
Expected: FAIL — `Failed to resolve import "./LegalDocumentEditor.vue"`

- [ ] **Step 7: `LegalDocumentEditor.vue` 를 쓴다**

Create `packages/admin-ui/src/components/legal/LegalDocumentEditor.vue`:

```vue
<script setup lang="ts" generic="K extends string, R extends AdminLegalHistoryItem">
  import { computed } from 'vue'
  import {
    VAlert,
    VBtn,
    VCard,
    VChip,
    VDataTable,
    VProgressLinear,
    VTab,
    VTabs,
  } from 'vuetify/components'
  import type { AdminLegalDocument, AdminLegalHistoryItem } from '@ssworks/admin-shared'
  import type { LegalDetailDialogBindings } from '../../composables/useLegalDocuments.js'
  import type { ConfirmDialogBindings } from '../../composables/useWriteFlow.js'
  import { formatDateTime } from '../../utils/format-date-time.js'
  import BaseDialog from '../common/BaseDialog.vue'
  import ConfirmDialog from '../common/ConfirmDialog.vue'
  import MarkdownEditor from '../markdown/MarkdownEditor.vue'
  import MarkdownView from '../markdown/MarkdownView.vue'
  import type { AdminTableHeader } from '../table/data-table.js'
  import {
    DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES,
    publisherLabel,
    shortHash,
    type LegalDocumentEditorMessages,
    type LegalKindOption,
    type LegalPublishBlock,
  } from './legal-document.js'

  // 약관 화면 한 벌 — 종류 탭 · 시행 정보 · 편집기 | 미리보기 · 발행 · 이력 · 대화상자 셋(발행 확인 · 초안 버리기 · 판 원문).
  // 흐름은 `useLegalDocuments` 가 갖고, 이 컴포넌트는 그 바인딩(`legal.editor.value`)을 받아 그리고 이벤트만 낸다.
  //
  // 정본: ssworks-gise-home apps/admin/src/pages/settings/legal.vue 템플릿(배치 — 3e ④ S1)
  //       + ssworks-axion-admin packages/frontend/src/pages/settings/legal.vue(시행 정보 · 해시 8자 · 발행자 대체 표기)
  // 바꾼 점:
  //  - axion 의 현재본 카드를 시행 정보 한 줄로 바꿨다 — 본문은 편집기 · 미리보기에 이미 보인다.
  //  - 이력 상세를 행 클릭(axion)이 아니라 [보기] 버튼(gise)으로 연다 — 키보드로 닿는다.
  //  - 발행이 막힌 이유를 버튼 옆 글자로(D16), 동시 발행 충돌 안내(⑤ V2).
  //  - 이력 표에 소비자 열(`historyHeaders` + `item.<key>` 슬롯) — axion 의 동의 건수 같은 것.
  //  - `VSnackbar` · 페이지 제목 · 카드 틀이 없다 — 알림은 `onDone` 으로 페이지가, 틀은 페이지 레이아웃이 맡는다.
  //
  // 🔴 탭은 `:model-value="kind"` + `@update:model-value` 로만 묶는다(D7). 부모가 `kind` 를 바꿔야만 탭이 움직이므로
  //    확인을 취소했을 때 탭을 되돌리는 코드가 없다. `v-model` 이면 먼저 움직인 뒤 되돌려야 하고, 그 되돌리는 경로가 곧
  //    초안을 버릴 자리가 된다(gise).
  // 🔴 편집기는 불러오는 동안에도 숨기지 않고 `readonly` 로 둔다 — `MarkdownEditor` 를 `v-if` 뒤에 두지 않는다.
  // 🔴 실패 중에는 시행 정보 줄과 이력의 「시행 중」 칩을 숨긴다(D19) — 직전 값이 낡았을 수 있다.

  const props = withDefaults(
    defineProps<{
      kinds: readonly LegalKindOption<K>[]
      kind: K
      current: AdminLegalDocument | null
      loading: boolean
      loadFailed: boolean
      /** 초안 */
      modelValue: string
      readonly: boolean
      canPublish: boolean
      publishBlock: LegalPublishBlock | null
      submitting: boolean
      conflict: boolean
      history: readonly R[]
      historyLoading: boolean
      historyFailed: boolean
      publishDialog: ConfirmDialogBindings
      discardDialog: ConfirmDialogBindings
      detailDialog: LegalDetailDialogBindings<R>
      /** 이력 표에 더할 열 — [보기] 앞에 붙는다. 값은 슬롯 `item.<key>`(없으면 원값) */
      historyHeaders?: readonly AdminTableHeader[]
      /** 날짜 표기. 기본 `YYYY-MM-DD HH:mm`(현지 시각) — `SessionTable` 과 같은 이름 · 같은 기본값 */
      formatDate?(iso: string): string
      editorHeight?: string
      messages?: Partial<LegalDocumentEditorMessages>
    }>(),
    {
      historyHeaders: () => [],
      formatDate: undefined,
      editorHeight: '420px',
      messages: () => ({}),
    },
  )

  const emit = defineEmits<{
    selectKind: [kind: K]
    'update:modelValue': [value: string]
    publish: []
    reloadCurrent: []
    reloadHistory: []
    openDetail: [row: R]
    dismissConflict: []
  }>()

  defineSlots<{ [name: `item.${string}`]: (props: { item: R }) => unknown }>()

  const text = computed<LegalDocumentEditorMessages>(() => ({
    ...DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES,
    ...props.messages,
  }))

  const kindLabel = computed(
    () => props.kinds.find((option) => option.value === props.kind)?.label ?? props.kind,
  )

  const format = (iso: string) => (props.formatDate ? props.formatDate(iso) : formatDateTime(iso))

  const status = computed<'loading' | 'failed' | 'none' | 'current'>(() => {
    if (props.loading) return 'loading'
    if (props.loadFailed) return 'failed'
    return props.current == null ? 'none' : 'current'
  })

  const currentLine = computed(() => {
    const current = props.current
    if (current == null) return ''
    return text.value.currentLine(
      format(current.publishedAt),
      publisherLabel(current.publishedByUserName, current.publishedByUserNo),
      shortHash(current.contentHash),
    )
  })

  const conflictText = computed(() =>
    text.value.conflict(
      props.current != null && !props.loadFailed ? format(props.current.publishedAt) : null,
    ),
  )

  const blockedText = computed(() => {
    const block = props.publishBlock
    return block == null || block === 'loading' ? '' : text.value.blocked[block]
  })

  /** 🔴 실패 중에는 칩도 숨긴다(D19) */
  const currentNo = computed(() => (props.loadFailed ? null : (props.current?.legalDocNo ?? null)))
  const isCurrentRow = (row: R) => currentNo.value != null && row.legalDocNo === currentNo.value

  const headers = computed<AdminTableHeader[]>(() => [
    { title: text.value.headers.legalDocNo, key: 'legalDocNo', sortable: false, width: 140 },
    { title: text.value.headers.publishedAt, key: 'publishedAt', sortable: false, width: 160 },
    { title: text.value.headers.publisher, key: 'publisher', sortable: false },
    { title: text.value.headers.contentHash, key: 'contentHash', sortable: false, width: 110 },
    ...props.historyHeaders.map((header) => ({ sortable: false, ...header })),
    { title: '', key: 'actions', sortable: false, align: 'end', width: 90 },
  ])

  const rows = computed(() => props.history as R[])
  /** bigint 는 Vue 키 타입이 아니다 — 문자열로 */
  const rowKey = (row: R) => String(row.legalDocNo)

  function rawValue(row: R, key: string): string {
    const value = (row as unknown as Record<string, unknown>)[key]
    return value == null ? '' : String(value)
  }

  const detailMeta = computed(() => {
    const row = props.detailDialog.row
    if (row == null) return ''
    return text.value.detailMeta(
      row.legalDocNo,
      format(row.publishedAt),
      publisherLabel(row.publishedByUserName, row.publishedByUserNo),
      shortHash(row.contentHash),
    )
  })

  /** `VTabs` 의 페이로드는 unknown 이다 — 종류 목록 안으로 좁혀서 낸다 */
  function onTab(value: unknown): void {
    const next = props.kinds.find((option) => option.value === value)
    if (next == null || next.value === props.kind) return
    emit('selectKind', next.value)
  }
</script>

<template>
  <div class="legal-document-editor">
    <VTabs
      :aria-label="text.kindTabs"
      density="compact"
      :model-value="kind"
      @update:model-value="onTab"
    >
      <VTab
        v-for="option in kinds"
        :key="option.value"
        :disabled="submitting"
        :value="option.value"
      >
        {{ option.label }}
      </VTab>
    </VTabs>

    <VProgressLinear v-if="status === 'loading'" indeterminate />
    <VAlert v-else-if="status === 'failed'" density="compact" type="error" variant="tonal">
      {{ text.loadFailed }}
      <template #append>
        <VBtn size="small" variant="text" @click="emit('reloadCurrent')">{{ text.retry }}</VBtn>
      </template>
    </VAlert>
    <VAlert v-else-if="status === 'none'" density="compact" type="info" variant="tonal">
      {{ text.notPublished(kindLabel) }}
    </VAlert>
    <div v-else class="legal-document-editor__current">
      <VChip color="primary" size="small" variant="tonal">{{ text.currentChip }}</VChip>
      <span>{{ currentLine }}</span>
    </div>

    <VAlert
      v-if="conflict"
      closable
      density="compact"
      type="warning"
      variant="tonal"
      @click:close="emit('dismissConflict')"
    >
      {{ conflictText }}
    </VAlert>

    <div class="legal-document-editor__split">
      <MarkdownEditor
        :height="editorHeight"
        :label="text.editorLabel(kindLabel)"
        :model-value="modelValue"
        :readonly="readonly"
        @update:model-value="(value: string) => emit('update:modelValue', value)"
      />
      <VCard
        :aria-label="text.preview"
        class="legal-document-editor__preview"
        role="region"
        :style="{ height: editorHeight }"
        variant="outlined"
      >
        <MarkdownView link-target="_blank" :source="modelValue">
          <template #empty>{{ text.previewEmpty }}</template>
        </MarkdownView>
      </VCard>
    </div>

    <div class="legal-document-editor__publish">
      <span v-if="blockedText" class="legal-document-editor__hint">{{ blockedText }}</span>
      <VBtn color="primary" :disabled="!canPublish" :loading="submitting" @click="emit('publish')">
        {{ text.publish }}
      </VBtn>
    </div>

    <section :aria-label="text.historyTitle" class="legal-document-editor__history">
      <div class="legal-document-editor__history-title">{{ text.historyTitle }}</div>
      <VAlert v-if="historyFailed" density="compact" type="warning" variant="tonal">
        {{ text.historyFailed }}
        <template #append>
          <VBtn size="small" variant="text" @click="emit('reloadHistory')">{{ text.retry }}</VBtn>
        </template>
      </VAlert>
      <VDataTable
        density="comfortable"
        :headers="headers"
        :item-value="rowKey"
        :items="rows"
        :items-per-page="10"
        :loading="historyLoading"
        :no-data-text="text.historyEmpty"
      >
        <template #item.legalDocNo="{ item }">
          <span class="legal-document-editor__no">
            <span>{{ item.legalDocNo }}</span>
            <VChip v-if="isCurrentRow(item)" color="primary" size="x-small" variant="tonal">
              {{ text.currentChip }}
            </VChip>
          </span>
        </template>
        <template #item.publishedAt="{ item }">{{ format(item.publishedAt) }}</template>
        <template #item.publisher="{ item }">
          {{ publisherLabel(item.publishedByUserName, item.publishedByUserNo) }}
        </template>
        <template #item.contentHash="{ item }">
          <code>{{ shortHash(item.contentHash) }}</code>
        </template>
        <template
          v-for="header in historyHeaders"
          :key="header.key"
          #[`item.${header.key}`]="{ item }"
        >
          <slot :item="item" :name="`item.${header.key}`">{{ rawValue(item, header.key) }}</slot>
        </template>
        <template #item.actions="{ item }">
          <VBtn
            :aria-label="text.viewLabel(item.legalDocNo)"
            size="small"
            variant="text"
            @click="emit('openDetail', item)"
          >
            {{ text.view }}
          </VBtn>
        </template>
      </VDataTable>
    </section>

    <ConfirmDialog v-bind="publishDialog" />
    <ConfirmDialog v-bind="discardDialog" />
    <BaseDialog
      :confirm-label="text.close"
      max-width="900"
      :model-value="detailDialog.modelValue"
      :title="text.detailTitle"
      type="ok"
      @update:model-value="detailDialog['onUpdate:modelValue']"
    >
      <div class="legal-document-editor__detail">
        <div v-if="detailMeta" class="legal-document-editor__meta">{{ detailMeta }}</div>
        <VProgressLinear v-if="detailDialog.loading" indeterminate />
        <VAlert v-else-if="detailDialog.failed" density="compact" type="error" variant="tonal">
          {{ text.detailFailed }}
          <template #append>
            <VBtn size="small" variant="text" @click="detailDialog.onRetry()">{{
              text.retry
            }}</VBtn>
          </template>
        </VAlert>
        <MarkdownView v-else link-target="_blank" :source="detailDialog.document?.body ?? null" />
      </div>
    </BaseDialog>
  </div>
</template>

<style scoped>
  .legal-document-editor {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .legal-document-editor__current {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .legal-document-editor__split {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
    gap: 12px;
  }

  .legal-document-editor__split > * {
    min-width: 0;
  }

  .legal-document-editor__preview {
    padding: 16px;
    overflow-y: auto;
  }

  .legal-document-editor__publish {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px 16px;
  }

  .legal-document-editor__hint,
  .legal-document-editor__meta {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .legal-document-editor__history {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .legal-document-editor__history-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .legal-document-editor__no {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .legal-document-editor__detail {
    display: grid;
    gap: 12px;
    width: 100%;
  }
</style>
```

- [ ] **Step 8: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/legal`
Expected: PASS(legal-document 7 + 렌더 32).

실패를 읽는 법:

- **`'🔴 다른 탭을 누르면 …'` 에서 선택 표시가 옮겨 갔다:** `VTabs` 에 `v-model` 이 아니라 `:model-value` + `@update:model-value` 가 둘 다 붙었는지 본다. 둘 다 있어야 Vuetify 가 "제어됨" 으로 본다. 그래도 옮겨 가면 Vuetify 동작 차이다. 멈추고 보고한다(D7 을 다시 정해야 한다).
- **`'.v-alert__close button'` 을 못 찾는다:** Vuetify 4.2.3 의 닫기 버튼 구조를 렌더 결과(`w.html()`)로 확인하고 선택자를 맞춘다. 테스트의 뜻(닫기 → `dismissConflict`)은 유지한다.
- **이력 첫 칸 정규식이 어긋난다:** `cells()` 출력을 찍어 공백 모양을 본다. 숫자와 칩 글자가 함께 있는지만 재도록 정규식을 고친다.

- [ ] **Step 9: 빌드 선언 확인(스펙 §8 위험 ②) · 타입 · lint · 커밋**

```bash
pnpm --filter @ssworks/admin-ui typecheck
pnpm --filter @ssworks/admin-ui build
pnpm exec prettier --write packages/admin-ui/src/components/legal
pnpm exec eslint packages/admin-ui/src/components/legal
git add packages/admin-ui/src/components/legal
git commit -F - <<'EOF'
feat(admin-ui): LegalDocumentEditor — 약관 화면 한 벌

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

`build` 가 제네릭 SFC 선언에서 실패하면(`vite-plugin-dts`) 멈추고 오류를 보고한다. 3d `TeamUserList`(`generic="R extends TeamUserRow"`)는 통과했으므로 `K` 와 `R` 두 개일 때만의 문제인지 본다. 안 되면 `K` 를 `string` 으로 고정하는 안을 함께 적는다. 이 Task 는 아직 `index.ts` 에서 내보내지 않으므로, 빌드 확인은 Task 7 의 export 뒤에도 다시 한다.

---

### Task 7: 흐름 + 화면 함께 · index export

**Files:**

- Test: `packages/admin-ui/src/composables/useLegalDocuments.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts`(파일 끝에 절 추가)

**Interfaces:**

- Consumes: Task 3~6 의 전부
- Produces: 패키지 공개 API
  - 컴포넌트: `MarkdownView` · `MarkdownEditor` · `LegalDocumentEditor`
  - 함수: `useLegalDocuments`
  - 타입: `UseLegalDocumentsOptions` · `LegalDocumentsController` · `LegalDocumentEditorBindings` · `LegalDetailDialogBindings` · `LegalDoneEvent` · `LegalKindOption` · `LegalPublishBlock` · `LegalDialogText` · `LegalMessages` · `LegalDocumentEditorMessages`
  - `shortHash` · `publisherLabel` · `formatDateTime` 은 내보내지 않는다(내부용).

- [ ] **Step 1: 함께 도는 시나리오 테스트를 쓴다**

Create `packages/admin-ui/src/composables/useLegalDocuments.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { EditorView } from 'codemirror'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import type { AdminLegalDocument, AdminLegalHistoryItem } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import LegalDocumentEditor from '../components/legal/LegalDocumentEditor.vue'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import {
  useLegalDocuments,
  type LegalDocumentsController,
  type UseLegalDocumentsOptions,
} from './useLegalDocuments.js'

// 흐름과 실제 화면(LegalDocumentEditor · MarkdownEditor · ConfirmDialog)을 붙여 사람이 하는 순서대로 돌린다 — 편집기에
// 입력하고, 버튼을 누르고, 대화상자 버튼을 누른다. 세부 판정은 useLegalDocuments.test.ts · legal-document-editor.render.test.ts.

installVisualViewport()

const KINDS = [
  { value: 'TERMS', label: '이용약관' },
  { value: 'PRIVACY', label: '개인정보처리방침' },
] as const
type Kind = (typeof KINDS)[number]['value']

const HASH = '0123456789abcdef'.repeat(4)

function doc(legalDocNo: number, kind: Kind, body: string): AdminLegalDocument {
  return {
    legalDocNo: BigInt(legalDocNo),
    kind,
    body,
    contentHash: HASH,
    publishedAt: '2026-09-01T05:00:00.000Z',
    publishedByUserNo: 7n,
    publishedByUserName: '김관리',
  }
}

function item(d: AdminLegalDocument): AdminLegalHistoryItem {
  return {
    legalDocNo: d.legalDocNo,
    kind: d.kind,
    contentHash: d.contentHash,
    publishedAt: d.publishedAt,
    publishedByUserNo: d.publishedByUserNo,
    publishedByUserName: d.publishedByUserName,
  }
}

const TERMS_12 = doc(12, 'TERMS', '# 이용약관 v12\n')
const TERMS_13 = doc(13, 'TERMS', '# 이용약관 v13(다른 관리자)\n')
const PRIVACY_5 = doc(5, 'PRIVACY', '# 개인정보처리방침 v5\n')

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(options: Partial<UseLegalDocumentsOptions<Kind>> = {}) {
  const adapters = {
    loadCurrent: vi.fn(async (kind: Kind) => (kind === 'TERMS' ? TERMS_12 : PRIVACY_5)),
    loadHistory: vi.fn(async (kind: Kind) =>
      kind === 'TERMS' ? [item(TERMS_12)] : [item(PRIVACY_5)],
    ),
    loadOne: vi.fn(async () => TERMS_12),
    publish: vi.fn(async () => ({ legalDocNo: 13n, contentHash: HASH })),
    onDone: vi.fn(),
    ...options,
  }
  let legal!: LegalDocumentsController<Kind>
  wrapper = mount(
    defineComponent({
      setup() {
        legal = useLegalDocuments<Kind>({ kinds: KINDS, ...adapters })
        return () => h(LegalDocumentEditor as Component, legal.editor.value)
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return { legal, ...adapters }
}

const activeDialog = () =>
  document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body

async function clickInDialog(text: string) {
  const target = buttonByText(text, activeDialog())
  expect(target, `가드 — 대화상자에 "${text}" 버튼이 있다`).toBeTruthy()
  target!.click()
  await flushPromises()
}

function editorView(label: string): EditorView {
  const content = document.querySelector<HTMLElement>(`.cm-content[aria-label="${label}"]`)
  expect(content, `가드 — "${label}" 편집 영역이 있다`).toBeTruthy()
  return EditorView.findFromDOM(content!)!
}

/** 사람이 친 것처럼 문서 끝에 붙인다 */
async function type(label: string, text: string) {
  const view = editorView(label)
  view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: 'input.type' })
  await flushPromises()
}

const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
const tab = (label: string) => tabs().find((t) => t.textContent?.trim() === label)
const selectedTab = () =>
  tabs()
    .find((t) => t.classList.contains('v-tab--selected'))
    ?.textContent?.trim()

describe('useLegalDocuments + LegalDocumentEditor', () => {
  it('입력 → [새 버전 발행] → 확인 "발행" → 요청 · 재조회 · onDone, 다시 "변경 없음"', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(doc(13, 'TERMS', '# 이용약관 v12\n제2조'))
    const { publish, onDone } = await setup({ loadCurrent })

    await type('이용약관 본문', '제2조')
    buttonByText('새 버전 발행')!.click()
    await flushPromises()
    expect(activeDialog().textContent).toContain('이용약관 새 버전 발행')
    expect(activeDialog().textContent).toContain('이 작업은 되돌릴 수 없습니다.')
    expect(publish).not.toHaveBeenCalled()

    await clickInDialog('발행')
    expect(publish).toHaveBeenCalledWith({
      kind: 'TERMS',
      body: '# 이용약관 v12\n제2조',
      baseLegalDocNo: 12n,
    })
    expect(loadCurrent).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({
      action: 'published',
      kind: 'TERMS',
      message: '이용약관 새 버전을 발행했습니다.',
    })
    expect(buttonByText('새 버전 발행')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('시행 중인 판과 내용이 같습니다.')
  })

  it('🔴 입력 뒤 다른 탭 → 버리기 확인 — 취소면 탭 · 본문 그대로, "버리고 이동" 이면 새 종류', async () => {
    await setup()
    await type('이용약관 본문', '내 편집')

    tab('개인정보처리방침')!.click()
    await flushPromises()
    expect(activeDialog().textContent).toContain('편집 중인 내용 버리기')
    await clickInDialog('취소')
    expect(selectedTab()).toBe('이용약관')
    expect(editorView('이용약관 본문').state.doc.toString()).toBe('# 이용약관 v12\n내 편집')

    tab('개인정보처리방침')!.click()
    await flushPromises()
    await clickInDialog('버리고 이동')
    expect(selectedTab()).toBe('개인정보처리방침')
    expect(editorView('개인정보처리방침 본문').state.doc.toString()).toBe('# 개인정보처리방침 v5\n')
  })

  it('🔴 revision 충돌 — 안내가 뜨고 편집기 본문은 그대로, 다시 발행할 수 있다', async () => {
    const conflict = new ApiError('다른 관리자가 먼저 발행했습니다.', {
      status: 409,
      code: 'ERR_COMMON_REVISION_CONFLICT',
      raw: null,
    })
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValue(TERMS_13)
    await setup({ loadCurrent, publish: vi.fn(async () => Promise.reject(conflict)) })

    await type('이용약관 본문', '내 편집')
    buttonByText('새 버전 발행')!.click()
    await flushPromises()
    await clickInDialog('발행')

    expect(conflict.handled).toBe(true)
    expect(document.body.textContent).toContain('다른 관리자가')
    expect(editorView('이용약관 본문').state.doc.toString()).toBe('# 이용약관 v12\n내 편집')
    expect(buttonByText('새 버전 발행')!.disabled).toBe(false)
  })
})
```

- [ ] **Step 2: 돌려 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useLegalDocuments.render.test.ts`
Expected: PASS(3).

Task 3~6 의 단위 테스트가 초록인데 여기서 실패하면, 원인은 부품 사이 배선이다. 대개 바인딩 키 이름이 어긋났거나(`onSelectKind` ↔ emit `selectKind`) 대화상자 바인딩 전달이 빠진 경우다. 고치는 쪽은 `useLegalDocuments.ts` 의 `editor` 바인딩 또는 `LegalDocumentEditor.vue` 다. 테스트를 고치지 않는다.

- [ ] **Step 3: index 에 절을 더한다**

Modify `packages/admin-ui/src/index.ts` — 파일 끝(`./components/team/team-user-list.js` 내보내기 뒤)에 붙인다:

```ts
// ── 마크다운 · 약관 ───────────────────────────────────────────────────
export { default as MarkdownView } from './components/markdown/MarkdownView.vue'
export { default as MarkdownEditor } from './components/markdown/MarkdownEditor.vue'
export { default as LegalDocumentEditor } from './components/legal/LegalDocumentEditor.vue'
export {
  type LegalKindOption,
  type LegalPublishBlock,
  type LegalDialogText,
  type LegalMessages,
  type LegalDocumentEditorMessages,
} from './components/legal/legal-document.js'
export {
  useLegalDocuments,
  type UseLegalDocumentsOptions,
  type LegalDocumentsController,
  type LegalDocumentEditorBindings,
  type LegalDetailDialogBindings,
  type LegalDoneEvent,
} from './composables/useLegalDocuments.js'
```

- [ ] **Step 4: 전체 테스트 · 타입 · 빌드(선언 포함)**

Run:

```bash
pnpm --filter @ssworks/admin-ui test
pnpm --filter @ssworks/admin-ui typecheck
pnpm --filter @ssworks/admin-ui build
```

Expected:

- test: 전부 PASS — `peer-deps.test.ts` 도 초록이다.
- build 산출물:
  - `dist/index.d.ts` 에 `LegalDocumentEditor` · `useLegalDocuments` · `MarkdownEditor` · `MarkdownView` 가 있다.
  - `dist/index.js` 에 `codemirror` · `@codemirror/state` 가 **import 로 남아 있다**(번들에 싣지 않는다 — external).

확인 명령:

```bash
node -e "const s=require('fs').readFileSync('packages/admin-ui/dist/index.js','utf8');console.log(/from\s*['\"]codemirror['\"]/.test(s), /from\s*['\"]@codemirror\/state['\"]/.test(s), /class EditorView/.test(s))"
```

Expected: `true true false`(import 두 개는 남고, `EditorView` 구현은 번들에 없다).

- [ ] **Step 5: 포맷 · lint · 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/src/index.ts packages/admin-ui/src/composables/useLegalDocuments.render.test.ts
pnpm exec eslint packages/admin-ui/src/index.ts packages/admin-ui/src/composables
git add packages/admin-ui/src/index.ts packages/admin-ui/src/composables/useLegalDocuments.render.test.ts
git commit -F - <<'EOF'
feat(admin-ui): 마크다운 · 약관 공개 API — 흐름과 화면을 함께 잰 시나리오

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 8: 문서 · changeset · 스모크 · 전체 검사

**Files:**

- Modify: `packages/admin-shared/README.md`
- Modify: `packages/admin-ui/README.md`(peer 표 · 🔴 문단 · API 표 · 조직 절의 `…` · 끝에 "## 약관")
- Create: `.changeset/admin-ui-legal.md`
- Modify: `CLAUDE.md`(진행 표) · `docs/HANDOFF.md` · `docs/01-phase0.md` §8

**Interfaces:**

- Consumes: Task 1~7 의 공개 API(이름 그대로)
- Produces: 없음(문서)

- [ ] **Step 1: admin-shared README**

Modify `packages/admin-shared/README.md` — export 표의 마지막 행(`parseJSON` … 행) 다음에 두 행을 더한다:

```markdown
| `renderMarkdown(source)` | 마크다운 → 안전한 HTML(markdown-it `html: false` · `linkify`). 관리자 미리보기 · 서버 공개 렌더 · 공개 웹이 **같은 함수**를 쓴다 |
| `adminLegalDocumentSchema` · `adminLegalHistoryItemSchema` · `adminLegalCurrentSchema` · `adminLegalHistorySchema` · `adminLegalPublishSchema` · `adminLegalPublishResultSchema` · `legalBodySchema` · `LEGAL_BODY_MAX_LENGTH` | 약관 계약 — 현재본 `{ item \| null }`(null = 미발행), 이력 `{ items }`(본문 없음), 발행 `{ kind, body, baseLegalDocNo }`(해시는 서버만 계산) |
```

그리고 파일 끝(`definePermissions` 예시 코드 블록 뒤)에 붙인다:

````markdown
## 마크다운 렌더

`renderMarkdown` 은 약관처럼 관리자가 쓰고 사용자가 동의하는 본문을 그린다. 🔴 관리자 미리보기(admin-ui `MarkdownView`)와 공개 쪽(서버가 내는 `bodyHtml` · 공개 웹)이 이 함수 하나를 써야 "관리자가 본 미리보기" 와 "사용자가 동의한 원문" 이 갈리지 않는다. `html: false` 가 저장형 XSS 방어의 전부다 — 옵션을 바꾸지 않는다. `markdown-it` 은 이 패키지의 의존으로 함께 설치된다.

```ts
import { renderMarkdown } from '@ssworks/admin-shared'

// 공개 조회 응답(예) — 미발행이면 404(fail-closed)
return {
  kind,
  legalDocNo: doc.legalDocNo,
  bodyHtml: renderMarkdown(doc.body),
  publishedAt: doc.publishedAt,
}
```

발행은 `baseLegalDocNo`(편집을 시작한 판, 미발행이면 null)를 싣는다. 서버는 같은 종류의 발행을 직렬화하고, 지금 시행본 번호가 다르면 409 `ERR_COMMON_REVISION_CONFLICT`, 본문이 시행본과 같으면 409 `ERR_COMMON_CONFLICT` 를 낸다(`docs/superpowers/specs/2026-10-07-admin-ui-legal-design.md` §9).
````

- [ ] **Step 2: admin-ui README — peer · API 표 · 조직 예시 손질**

Modify `packages/admin-ui/README.md`:

(1) "## Peer 의존" 표 마지막 행(`@he-tree/vue`) 다음에:

```markdown
| `codemirror` | 예 | `MarkdownEditor` · `LegalDocumentEditor`(약관 편집기) |
| `@codemirror/state` | 예 | 같음 — `codemirror` 가 쓰는 것과 같은 인스턴스여야 한다 |
```

(2) 표 아래 🔴 문단 고치기:

- 첫 문장 "🔴 `pinia`·`axios`·`@he-tree/vue` 도 **필수**다." 를 "🔴 `pinia`·`axios`·`@he-tree/vue`·`codemirror`·`@codemirror/state` 도 **필수**다." 로 바꾼다.
- 문단 끝에 이 문장을 더한다: "CodeMirror 테마 패키지(`@codemirror/theme-one-dark`)는 필요 없다 — 편집기 색은 Vuetify 테마를 따른다."

(3) API 표 마지막 행(`TeamUserList` …) 다음에 네 행:

```markdown
| `MarkdownView` | 마크다운 본문 보기 — `renderMarkdown` 결과를 그리는 킷 유일의 `v-html`. `linkTarget="_blank"` 면 본문 링크를 새 탭으로. `#empty` 슬롯 |
| `MarkdownEditor` | CodeMirror 6 편집기 `v-model`. `readonly`(편집만 막음 — 포커스 · 선택 · 찾기는 됨) · `label`(aria) · `height`. 색은 Vuetify 테마 |
| `useLegalDocuments` · `UseLegalDocumentsOptions` · `LegalDocumentsController` · `LegalDocumentEditorBindings` · `LegalDetailDialogBindings` · `LegalDoneEvent` · `LegalKindOption` · `LegalPublishBlock` · `LegalMessages` · `LegalDialogText` | 약관 흐름 headless — 종류 전환(초안 확인) · 현재본 · 이력 · 원문 · 발행(확인 → 저장 → revision 충돌) |
| `LegalDocumentEditor` · `LegalDocumentEditorMessages` | 약관 화면 한 벌 — 탭 · 시행 정보 · 편집기 \| 미리보기 · 발행 · 이력 · 대화상자 셋. `v-bind="legal.editor.value"` |
```

(4) 조직 절 "### hangang 형 서버(루트 하나 · 순서 값)" 예시의 `…` 한 줄(3d 에서 미룬 손질)을 바꾼다. 예시 끝 `})` 바로 윗줄, `canAct: (node, action) => !(node.teamNo === rootNo && …),` 다음 줄에 있는 `  …` 한 줄이다. 이것을 다음 주석 한 줄로 바꾼다:

```ts
// create · rename · remove · canWrite · onDone 은 위 「Phase 2 서버」 예와 같다
```

- [ ] **Step 3: admin-ui README — "## 약관" 절**

Modify `packages/admin-ui/README.md` — 파일 끝에 붙인다:

````markdown
## 약관

이용약관 · 개인정보처리방침 같은 법적 문서의 편집 · 발행 · 이력 화면. 발행은 append-only 라 되돌릴 수 없다 — 확인을 거치고, 다른 관리자가 그사이 발행했으면 서버가 revision 충돌로 거절한다(내 초안은 남는다). 페이지 제목 · 카드 틀 · 메뉴는 템플릿 몫이다.

### Phase 2 서버를 쓰는 새 서비스

```ts
const legal = useLegalDocuments({
  kinds: [
    { value: 'TERMS', label: '이용약관' },
    { value: 'PRIVACY', label: '개인정보처리방침' },
  ],
  loadCurrent: (kind) =>
    api
      .get<AdminLegalCurrent>('/admin/legal-documents/current', { params: { kind } })
      .then((r) => r.item),
  loadHistory: (kind) =>
    api.get<AdminLegalHistory>('/admin/legal-documents', { params: { kind } }).then((r) => r.items),
  loadOne: (legalDocNo) => api.get<AdminLegalDocument>(`/admin/legal-documents/${legalDocNo}`),
  publish: (body) => api.post('/admin/legal-documents', body),
  canWrite: () => can('settings.legal:publish'),
  onDone: (e) => toast.success(e.message),
})
useDirtyGuard(() => legal.isDirty.value) // 라우트 이탈 · 새로고침 때 미발행 초안 확인 — 라우터는 페이지 몫
```

```vue
<PanelLayout title="약관 · 개인정보처리방침">
  <LegalDocumentEditor v-bind="legal.editor.value" />
</PanelLayout>
```

- `publish` 를 주지 않거나 `canWrite()` 가 false 면 읽기 전용이다. 버튼 옆에 "발행 권한이 없습니다." 가 보인다.
- 탭 전환은 초안이 있으면 "편집 중인 내용 버리기" 확인을 거친다. 취소하면 탭도 초안도 그대로다.
- 쿼리(`?kind=`)와 맞추려면 `initialKind` 로 시작하고 `legal.kind` 를 지켜본다.

### 이력 표에 열 더하기

```vue
<LegalDocumentEditor
  v-bind="legal.editor.value"
  :history-headers="[{ title: '동의', key: 'consentCount', width: 90 }]"
>
  <template #item.consentCount="{ item }">{{ item.consentCount }}건</template>
</LegalDocumentEditor>
```

행 타입은 `useLegalDocuments<'TERMS' | 'PRIVACY', AdminLegalHistoryItem & { consentCount: number }>(…)` 처럼 넓힌다.

### 미발행을 404 로 내는 서버(axion · gise 형)

```ts
loadCurrent: async (kind) => {
  try {
    return await legalApi.current(kind)
  } catch (error) {
    // 🔴 미발행만 null 로 — 그 밖의 실패는 그대로 던져 "불러오지 못함"(발행 잠금)으로 보이게 한다
    if (error instanceof ApiError && error.status === 404) {
      error.handled = true // 전역 토스트를 막는다(정상 시작 상태다)
      return null
    }
    throw error
  }
},
publish: ({ kind, body }) => legalApi.publish({ kind, body }), // 기준 판 번호를 모르는 서버 — 동시 발행 보호 없음
```

킷은 404 를 스스로 "미발행" 으로 읽지 않는다. 잘못 설정한 주소의 404 가 미발행으로 보이면, 비교할 본 없이 발행하게 되기 때문이다.

### 알려진 한계 · 수동 확인

- 미리보기는 입력마다 다시 렌더한다. 실제 약관 크기(수십 KB)에서는 문제가 없고, 상한(100만 자) 근처에서는 느려질 수 있다.
- CodeMirror 는 개행을 `\n` 으로 정규화한다. CRLF 로 저장된 본문은 첫 입력부터 LF 로 바뀐다.
- 테스트가 잴 수 없어 사람이 확인할 것:
  - 한글 입력이 끊기지 않는가(조합 중 글자 깨짐)
  - 다크 테마에서 편집기 색 · 선택 영역이 읽히는가
````

- [ ] **Step 4: changeset**

Create `.changeset/admin-ui-legal.md`:

```markdown
---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

PR #3e — 약관(법적 문서 편집 · 발행 · 이력).

- **소비자가 할 일: `pnpm add codemirror @codemirror/state`** — admin-ui 의 새 필수 peer 다. 엔트리가 하나라 약관 화면을 안 써도 번들러가 해석해야 한다. CodeMirror 테마 패키지는 필요 없다(편집기 색은 Vuetify 테마).
- admin-shared 새 API: `renderMarkdown`(markdown-it `html: false`, 새 의존 `markdown-it`). 약관 스키마 — `adminLegalDocumentSchema` · `adminLegalHistoryItemSchema` · `adminLegalCurrentSchema` · `adminLegalHistorySchema` · `adminLegalPublishSchema` · `adminLegalPublishResultSchema` · `legalBodySchema` · `LEGAL_BODY_MAX_LENGTH`.
- admin-ui 새 API: `MarkdownView` · `MarkdownEditor`(CodeMirror) · `useLegalDocuments` · `LegalDocumentEditor`.
- 서버 계약:
  - 현재본 `{ item | null }`(미발행 = null), 이력 `{ items }`(최신순 전량).
  - 발행 `{ kind, body, baseLegalDocNo }` → `{ legalDocNo, contentHash }`. 해시는 서버만 계산한다.
  - 기준 판이 지금 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`, 본문이 같으면 409 `ERR_COMMON_CONFLICT`.
  - 미발행을 404 로 내는 기존 서버는 어댑터에서 `null` 로 바꾼다(README).
- 기존 API 동작은 바뀌지 않는다.
```

- [ ] **Step 5: 전체 검사로 테스트 수를 얻는다**

Run: `pnpm check`
Expected: lint → typecheck → test → build 전부 초록. 출력에서 admin-shared · admin-ui · 워크스페이스 테스트 수를 적어 둔다(다음 Step 에 쓴다).

`pnpm format:check` 도 돌린다. 빨갛다면 `pnpm exec prettier --write` 를 Task 8 에서 바꾼 파일에만 돌리고 다시 본다.

- [ ] **Step 6: 진행 문서**

N(shared) · N(ui) · N(전체) 는 Step 5 의 수다.

- `CLAUDE.md` "진행 상태와 다음 단계" 표:
  - `**Phase 1 PR #3e — 약관(CodeMirror)**` 행을 이 행으로 바꾼다: `| Phase 1 PR #3e — `MarkdownView`·`MarkdownEditor`(CodeMirror) · `useLegalDocuments`·`LegalDocumentEditor`·`renderMarkdown`· 약관 스키마 | 완료 | 스펙`docs/superpowers/specs/2026-10-07-admin-ui-legal-design.md`· 플랜`docs/superpowers/plans/2026-10-08-admin-ui-legal.md` |`
  - `Phase 2 — admin-server` 행의 상태를 `**다음**` 으로, 단계 이름을 굵게(`**Phase 2 — admin-server**`) 한다.
- `docs/HANDOFF.md`:
  - "지금 상태" 표:
    - admin-shared 행: "Phase 1 완료(PR #3e 렌더러 · 약관 스키마 포함). N(shared) 테스트" 로 고친다.
    - admin-ui 행 끝: "**PR #3e**(`MarkdownView` · `MarkdownEditor` · `useLegalDocuments` · `LegalDocumentEditor`, CodeMirror 필수 peer)는 `feat/admin-ui-legal` 에서 구현 완료 — **Phase 1 완료**. N(ui) 테스트." 로 고친다. 731 은 지운다.
    - "검증" 행의 "(PR #1 시점 142 테스트)" 를 "(PR #3e 시점 워크스페이스 N(전체) 테스트)" 로 바꾼다. 3d 에서 미룬 손질이다.
    - "다음 플랜" 행: "Phase 2 — admin-server(`docs/01-phase0.md` §2-3 · §3-2, 3c · 3d · 3e 스펙 §9 서버 계약). 직전 PR #3e: 스펙 `docs/superpowers/specs/2026-10-07-admin-ui-legal-design.md` · 플랜 `docs/superpowers/plans/2026-10-08-admin-ui-legal.md`".
  - "첫 세션에서 할 일" 3번: "다음은 **PR #3e**" 를 "**PR #3e** 완료 — Phase 1 끝. 다음은 **Phase 2**(admin-server)" 로 바꾼다.
  - "발행 전에 사람이 해야 하는 것" 의 Version Packages 문단 끝에 이 문장을 더한다: "3e 는 새 필수 peer(`codemirror` · `@codemirror/state`)가 있어 changeset 에 소비자 설치 안내를 적었다."
- `docs/01-phase0.md` §8 표:
  - admin-shared 행 상태: "**완료** — N(shared) 테스트(PR #3e 렌더러 · 약관 스키마 포함), tsc 빌드".
  - admin-ui 행 끝에 "**PR #3e 완료**(브랜치 `feat/admin-ui-legal`) — `MarkdownView` · `MarkdownEditor` · `useLegalDocuments` · `LegalDocumentEditor`, admin-shared `renderMarkdown` · 약관 스키마, CodeMirror 필수 peer. 누적 **N(ui) 테스트**(admin-ui). **Phase 1 완료**" 를 더한다.
  - 표 아래 "다음: admin-ui PR #3e(약관), 그 뒤 admin-server." 를 "다음: Phase 2 admin-server." 로 바꾼다.

- [ ] **Step 7: 스모크 — 패킹한 tarball 을 소비 앱에서**

`.claude/commands/smoke.md` 절차를 따른다. 3e 에서 달라지는 점:

- **설치 목록:** 소비 앱 의존에 `codemirror` · `@codemirror/state` · `@he-tree/vue@^2.10.5` · `pinia` · `axios` · `vue-router` 를 함께 넣는다(admin-ui 필수 peer 전부). `pnpm-workspace.yaml` 또는 `package.json` 의 `pnpm.allowBuilds` 에 `vue-demi: false` 를 둔다(3d R1).
- **`App.vue` 에 쓸 것:** `LegalDocumentEditor` 를 `useLegalDocuments` 바인딩으로 한 번 쓰고, `MarkdownView` · `MarkdownEditor` 도 한 번씩 쓴다.
  - 어댑터는 `async () => null` · `async () => []` 같은 빈 함수로 둔다.
  - `renderMarkdown` 과 약관 스키마는 `@ssworks/admin-shared` 에서 import 해 한 번씩 쓴다.
- **경로:** 🔴 Windows 에서는 OS 임시 디렉터리가 길면 pnpm 설치가 `os error 3` 으로 깨진다. 짧은 경로(예: `%TEMP%\aks`)에서 한다.
- **통과 기준:** `pnpm install` → `vue-tsc --noEmit` → `vite build` 셋 다 통과. 빌드 산출물에 CodeMirror 가 한 벌만 실렸는지도 본다 — `@codemirror/state` 의 `class EditorState` 정의가 번들에 한 번만 나타나야 한다(리뷰 중점 2).
- **정리:** 결과만 보고하고 임시 폴더는 지운다.

- [ ] **Step 8: 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/README.md packages/admin-ui/README.md .changeset/admin-ui-legal.md CLAUDE.md docs/HANDOFF.md docs/01-phase0.md
pnpm format:check
git add packages/admin-shared/README.md packages/admin-ui/README.md .changeset/admin-ui-legal.md CLAUDE.md docs/HANDOFF.md docs/01-phase0.md
git commit -F - <<'EOF'
docs: PR #3e — README 약관 절, changeset(CodeMirror 필수 peer), 진행 문서(Phase 1 완료)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

## 스펙 대조표 (자체 검토)

| 스펙                                                                                             | Task                                           |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| §4-1 `renderMarkdown` · D1 · D2                                                                  | 1                                              |
| §4-2 약관 스키마 · D3(트림 안 함) · D15(`{ item \| null }`)                                      | 1                                              |
| §5 의존 · external                                                                               | 1 · 2                                          |
| D21 `formatDateTime` 이동                                                                        | 2                                              |
| §8 위험 ① CodeMirror happy-dom · D4 탐침 고정                                                    | 2                                              |
| §4-3 `MarkdownView` · D18                                                                        | 3                                              |
| §4-4 `MarkdownEditor` · D3 · D4 · D5 · D6                                                        | 4                                              |
| §4-5 `useLegalDocuments` · D7 · D8 · D9 · D10 · D11 · D12 · D13 · D14 · D16                      | 5                                              |
| §4-6 `LegalDocumentEditor` · D7(탭 고정) · D16(글자) · D17 · D18 · D19 · D20 · D21(`formatDate`) | 6                                              |
| §8 위험 ② 제네릭 SFC 선언                                                                        | 6 · 7                                          |
| §7 흐름 + 화면 함께                                                                              | 7                                              |
| §8 릴리스 · 문서 · 3d 미룬 손질 · `/smoke`                                                       | 8                                              |
| §9 서버 계약                                                                                     | 8(README · changeset 에 요약) — 구현은 Phase 2 |
| §11 리뷰 중점                                                                                    | 위 "Review Focus"                              |
