---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

PR #3e — 약관(법적 문서 편집 · 발행 · 이력).

- **소비자가 할 일: `pnpm add codemirror @codemirror/state`** — admin-ui 의 새 필수 peer 다. 엔트리가 하나라 약관 화면을 안 써도 번들러가 해석해야 한다. CodeMirror 테마 패키지는 필요 없다(편집기 색은 Vuetify 테마).
- admin-shared 새 API: `renderMarkdown`(markdown-it `html: false` · `breaks: true` — Enter 한 번이 줄바꿈, 새 의존 `markdown-it`). axion · gise 의 렌더러는 `breaks: false` 였으므로, 그 본문을 옮겨 오면 문단 안의 줄 하나 바꿈이 줄바꿈으로 보인다. 약관 스키마 — `adminLegalDocumentSchema` · `adminLegalHistoryItemSchema` · `adminLegalCurrentSchema` · `adminLegalHistorySchema` · `adminLegalPublishSchema` · `adminLegalPublishResultSchema` · `legalBodySchema` · `LEGAL_BODY_MAX_LENGTH`.
- admin-ui 새 API: `MarkdownView` · `MarkdownEditor`(CodeMirror) · `useLegalDocuments` · `LegalDocumentEditor`.
- 서버 계약:
  - 현재본 `{ item | null }`(미발행 = null), 이력 `{ items }`(최신순 전량).
  - 발행 `{ kind, body, baseLegalDocNo }` → `{ legalDocNo, contentHash }`. 해시는 서버만 계산한다.
  - 기준 판이 지금 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`, 본문이 같으면 409 `ERR_COMMON_CONFLICT`.
  - 미발행을 404 로 내는 기존 서버는 어댑터에서 `null` 로 바꾼다(README).
- 기존 API 동작은 바뀌지 않는다.
