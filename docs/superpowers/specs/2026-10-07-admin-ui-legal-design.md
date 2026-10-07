# admin-ui 약관(법적 문서 편집 · 발행 · 이력) 설계 (Phase 1 PR #3e)

작성일: 2026-10-07 · 상태: 확정(구현 전) · 선행: PR #3a 스펙(`2026-10-03-admin-ui-list-write-design.md`) §2 결정 ④(CodeMirror 필수 peer · 엔트리 하나) · §4-3 `useWriteFlow`, PR #3d 스펙(`2026-10-07-admin-ui-teams-design.md`) §4-4(`useTeamTree` 모양 · `write` 도우미) · §11, `docs/phase0-reports/fe-pages.md` §2 · §3 · §4

## 1. 목표

axion · gise 에 400~500줄씩 복사돼 있는 약관 화면(종류 탭 · 편집기 | 미리보기 · 발행 · 이력)을 패키지에 넣는다. 새 관리자 앱은 어댑터 넷만 넘기면 화면이 선다. 두 정본이 지켜 온 동작을 잃지 않는다 — append-only 발행은 확인을 거치고, 미발행과 로드 실패를 가르고, 탭을 바꿔도 초안이 조용히 사라지지 않는다.

- admin-shared 에 마크다운 렌더러(`renderMarkdown`)와 약관 스키마를 둔다. 관리자 미리보기 · Phase 2 서버(공개 `bodyHtml`) · 공개 웹이 **같은 함수**를 쓴다.
- admin-ui 에 부품 `MarkdownEditor`(CodeMirror) · `MarkdownView`, 흐름 `useLegalDocuments`, 화면 한 벌 `LegalDocumentEditor` 를 넣는다.

새 의존:

- admin-ui 필수 peer **`codemirror` · `@codemirror/state`**(3a 결정 ④).
- admin-shared `dependencies` 에 **`markdown-it`**(admin-shared 의 첫 런타임 의존).

## 2. 결정

### 2-1. 3e 경계 결정 (2026-10-07)

결정 문서(HTML)로 고른 뒤 설계 절마다 승인받았다. 다섯 가지 모두 권장안이다.

| 결정                     | 확정                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ① 조립 단위              | **L1** — `useLegalDocuments`(흐름) + `LegalDocumentEditor`(화면 한 벌). 부품 `MarkdownEditor` · `MarkdownView` 도 따로 export                                |
| ② 마크다운 렌더러 자리   | **R1** — `renderMarkdown` 을 admin-shared 에(markdown-it 의존). 관리자 미리보기 · 서버 · 공개 웹이 한 함수를 쓴다                                            |
| ③ CodeMirror peer · 꾸밈 | **C1** — peer 는 `codemirror` · `@codemirror/state` 둘. 문법 강조 없음(두 정본과 같음), 색은 Vuetify CSS 변수. `@codemirror/theme-one-dark` 쓰지 않음        |
| ④ 화면 배치              | **S1** — gise 형: 종류 탭 → 시행 정보 한 줄 → 편집기 \| 미리보기 → 발행 → 이력                                                                               |
| ⑤ 동시 발행 보호         | **V2** — 발행 본문에 `baseLegalDocNo`(편집을 시작한 판 번호, 미발행이면 `null`). 그사이 다른 판이 나왔으면 서버가 409 `ERR_COMMON_REVISION_CONFLICT` 로 거절 |
| 릴리스                   | changeset minor(두 패키지). 새 필수 peer 설치가 소비자가 할 일                                                                                               |

결정 문서의 "이의 없으면 이대로" 열 가지도 확정이다. 아래 D-목록에 녹였다. 탭 전환 확인, 페이지 이탈은 `isDirty` + `useDirtyGuard`, 미발행 · 실패 구분, 발행 잠금 조건, 확인 관문, 재조회, 불러오는 동안 읽기 전용, 이력 [보기] 버튼, 종류는 소비자 몫, 범위 밖 목록이다.

### 2-2. 3e 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 🔴 **렌더러는 하나다.** `renderMarkdown`(admin-shared)만 `new MarkdownIt({ html: false, linkify: true, breaks: false })` 를 갖는다. `html: false` 가 저장형 XSS 방어의 전부다(별도 sanitizer 없음, 두 정본 같음). 킷 전체에서 `v-html` 은 `MarkdownView` 한 곳이고 그 결과만 그린다. 렌더 결과에 `target` 같은 속성을 덧붙이지 않는다 — 공개 원문과 같아야 한다                                |
| D2  | `renderMarkdown` 은 인스턴스를 처음 부를 때 만든다(import 만으로는 부작용 없음). markdown-it 은 `sideEffects` 를 선언하지 않아, 안 쓰는 소비자 번들에서 실제로 빠지는지는 번들러 판단이다                                                                                                                                                                                                      |
| D3  | 🔴 **초안은 받은 그대로 보관한다**(트림 · 개행 정규화 금지). `MarkdownEditor` 는 받은 값과 문서가 같으면 아무것도 안 한다. 부모가 고쳐서 돌려주면 한글 조합 중에 문서가 치환돼 글자가 깨진다. 공백 검사는 발행 판정에서 한다                                                                                                                                                                   |
| D4  | 외부 변경(종류 전환 · 불러오기)은 문서 **전체 치환** + `Transaction.addToHistory.of(false)` + 킷의 `Annotation`(외부 표시)으로 dispatch 한다. `updateListener` 는 외부 표시가 있는 트랜잭션을 emit 하지 않는다(정본의 모듈 플래그 대신). 전체 치환은 이전 문서의 되돌리기 기록을 흡수해 비운다 — gise 설치본으로 탐침(치환 뒤 `undoDepth` 0, `undo()` false). 그래서 상태를 새로 만들지 않는다 |
| D5  | `readonly` 는 `EditorState.readOnly` + `.cm-content` 의 `aria-readonly="true"` 다. `EditorView.editable` 은 끄지 않는다 — 포커스 · 선택 · 복사 · 찾기는 된다. Tab 은 묶지 않는다(`indentWithTab` 없음) — 키보드 사용자가 편집기 밖으로 나갈 수 있다                                                                                                                                            |
| D6  | 편집기 색은 `EditorView.theme` 에 Vuetify CSS 변수로 칠한다(③ C1). 다크 판정 `EditorView.darkTheme.of(useTheme().current.value.dark)` 을 `Compartment` 로 두고 테마가 바뀌면 다시 설정한다(찾기 패널 등 CodeMirror 기본 요소가 따른다). 줄바꿈 `EditorView.lineWrapping` 을 켠다 — 약관 문단은 한 줄이 아주 길다(정본은 가로 스크롤)                                                           |
| D7  | 🔴 **`kind` 를 바꾸는 자리는 `switchKind` 하나**이고 초안부터 비운다(gise). 재조회가 실패해도 이전 종류의 본문이 새 탭에 남지 않는다 — "이용약관 탭에 개인정보 본문" 상태에서 발행하면 되돌릴 수 없다. 탭은 `:model-value="kind"` + `@update:model-value` 로만 묶는다. 부모가 `kind` 를 바꿔야만 탭이 움직이므로, 확인을 취소했을 때 탭을 되돌리는 코드가 없다(gise 실측 — 킷 테스트로 고정)   |
| D8  | 🔴 **`isDirty = draft !== baseBody`.** `baseBody` 는 셋 중 하나다. 불러오기 성공이면 `current?.body ?? ''`, 발행 성공이면 **방금 보낸 본문**, 종류 전환이면 `''`. 이 기준이 없으면 탭마다 확인을 띄우거나(훈련된 무시) 아예 안 띄운다(유실) — gise                                                                                                                                             |
| D9  | **현재본 응답이 왔을 때 초안이 더러우면(`draft !== 그때의 baseBody`) 초안을 지키고 기준만 새 본문으로 바꾼다. 깨끗하면 초안도 새 본문으로.** 충돌 뒤 재조회와 일반 재조회가 같은 규칙을 쓴다. 공개된 `reload()` 가 편집 중인 초안을 덮지 않는다. 설계 ④ 의 `keepDraft` 인자를 이 규칙으로 대신했다                                                                                             |
| D10 | 🔴 **확인 순간에 같은 판정을 다시 본다.** 요청 때와 확인 때 모두 `publishable()`(발행 중 여부 제외) 함수를 부르고, 확인 때는 `kind` 가 요청 때와 같은지도 본다. 대화상자가 열린 사이 권한 회수 · 재조회가 일어날 수 있다. gise 는 두 곳에 같은 조건을 글자 그대로 두었다                                                                                                                       |
| D11 | 🔴 **발행 성공 즉시 `baseBody = 보낸 본문`, 그다음 재조회.** 재조회가 실패해도 방금 발행한 본문이 "미저장 초안" 으로 보이지 않는다. 번호 · 해시 · 발행일은 낙관적으로 채우지 않고 재조회 결과를 쓴다(두 정본)                                                                                                                                                                                  |
| D12 | 충돌(409 `ERR_COMMON_REVISION_CONFLICT`)은 `useWriteFlow` 의 `onConflict` 로 받아 처리됨으로 표시한다(전역 토스트 없음). `conflict = true`, 현재본 · 이력 재조회(D9 로 초안 유지). 안내는 닫을 수 있고 다음 발행 성공 · 종류 전환에서 내린다. 그 밖의 발행 실패는 `useWriteFlow` 기본대로 전역 토스트(서버 `message`), 초안 유지, 재조회 없음                                                  |
| D13 | 읽기(현재본 · 이력 · 원문) 실패는 처리됨으로 표시하지 않는다 — 화면 안 경고와 전역 토스트가 둘 다 뜬다(3d `useTeamTree` 와 같음). 현재본 실패는 발행 잠금 + 편집기 읽기 전용 + [다시 시도]. 이력 재조회 실패는 직전 목록을 남기고 경고(gise). 종류 전환 때는 비운다                                                                                                                            |
| D14 | 늦은 응답은 현재본 · 이력 · 원문이 각자 가진 시퀀스 번호와 `disposed`(스코프 해제)로 버린다. axion 의 "탭이 바뀌었으면 버림" 을 일반화한 것이다                                                                                                                                                                                                                                                |
| D15 | **미발행은 어댑터가 `null` 로 알린다.** 킷은 404 를 해석하지 않는다 — 잘못 설정한 주소의 404 가 "미발행" 으로 읽히면 비교할 본 없이 발행하게 된다(gise 가 막으려던 상황). 404 를 내는 서버(axion · gise)는 어댑터에서 바꾼다(README 예시)                                                                                                                                                      |
| D16 | 발행 막힘 이유(`publishBlock`)는 순서가 있다: `readonly` → `loading` → `loadFailed` → `empty` → `tooLong` → `unchanged`. 화면은 첫 이유를 버튼 옆 글자로 보인다(`loading` 은 진행 막대로 대신). 정본은 버튼만 꺼져 운영자가 이유를 몰랐다(gise 주석)                                                                                                                                           |
| D17 | **화면 한 벌.** 대화상자 셋(발행 확인 · 초안 버리기 · 판 원문)이 `LegalDocumentEditor` 안에 있다. 페이지는 `v-bind="legal.editor.value"` 한 줄(3d README 와 같은 `.value`)                                                                                                                                                                                                                     |
| D18 | 미리보기 · 원문 대화상자의 링크는 새 탭으로 연다(`MarkdownView` `linkTarget="_blank"` — 클릭을 가로채 `window.open(href, '_blank', 'noopener,noreferrer')`). 그 탭에서 이동하면 발행 전 초안이 사라진다                                                                                                                                                                                        |
| D19 | 현재본 불러오기가 실패한 동안에는 시행 정보 줄과 이력의 "시행 중" 칩을 숨긴다. 직전 값이 낡았을 수 있다                                                                                                                                                                                                                                                                                        |
| D20 | 발행자 표기는 이름 → 없으면 `#번호` → 둘 다 없으면 "-" 이다(axion 의 번호 대체 + gise 의 "-")                                                                                                                                                                                                                                                                                                  |
| D21 | 날짜 기본 표기 `formatDateTime`(`YYYY-MM-DD HH:mm` 현지 시각)을 `components/session/session-table.ts` 에서 `utils/format-date-time.ts` 로 옮겨 `SessionTable` 과 함께 쓴다. 패키지 내부 함수라 공개 API 는 그대로다. 바꾸려면 `formatDate` prop(`SessionTable` 과 같은 이름)                                                                                                                   |

## 3. 정본과 흡수 목록

| 산출물                | 정본                                                                                              | 흡수할 것                                                                                                                                                                      | 버릴 것                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `renderMarkdown`      | gise `packages/shared/src/content/markdown.ts`(+ axion `markdown-view.util.ts`, 같은 옵션)        | 옵션 셋, 모듈 하나에 인스턴스 하나, 빈 값은 `''`, "테스트가 곧 계약" 주석                                                                                                      | 모듈 로드 때 인스턴스 생성(→ D2)                                                                                                                                         |
| 약관 스키마           | axion `shared/src/schemas/legal.schema.ts` · gise `shared/src/legal/schema.ts`                    | 해시는 서버만 계산(본문에 `contentHash` 없음), 본문 최대 1,000,000자, 이력 행에 본문 없음, 발행자 nullable(FK `SET NULL`), `publishedAt` 은 ISO 문자열(gise — `Date` 아님)     | 종류 enum 하드코딩(→ 소비자 몫), axion `consentCount`(→ 소비자 열 확장), axion `z.coerce.date()`                                                                         |
| `MarkdownView`        | gise `apps/admin/src/components/MarkdownView.vue` · axion `components/common/MarkdownView.vue`    | `v-html` 단일 진입점과 안전 근거 주석, `word-break`                                                                                                                            | `data-test` 속성                                                                                                                                                         |
| `MarkdownEditor`      | axion · gise `legal.vue` 의 CodeMirror 조립(`basicSetup` · `updateListener` · 외부 변경 dispatch) | 전체 치환 + 기록 제외, 언마운트 때 `destroy`, 높이 420px, monospace 13px, "호스트를 `v-if` 뒤에 두지 않는다"(gise 실측)                                                        | one-dark Compartment(→ D6), 모듈 플래그(→ D4 Annotation), 줄바꿈 없음(→ D6)                                                                                              |
| `useLegalDocuments`   | gise `pages/settings/legal.vue` 의 흐름 + axion 의 늦은 응답 버림                                 | `switchKind` 단일 지점 · 초안 먼저 비움, `loadedBody` 기준 dirty, 404 와 실패 구분 · 실패 시 발행 잠금, 확인 순간 재검사, 낙관적 갱신 금지, 이력 실패 시 직전 목록 유지 · 경고 | 페이지에 흩어진 상태, `hasCode(error, NOT_FOUND)` 판정(→ D15 어댑터 `null`), 페이지 안 API 호출(→ 어댑터), 동시 발행 무방비(→ ⑤ V2)                                      |
| `LegalDocumentEditor` | gise `legal.vue` 템플릿(배치) + axion 시행 정보 · 해시 8자 · 발행자 대체                          | 탭 = 종류, 2단 분할, 발행 버튼 `:disabled` 식, 이력 [보기] 버튼, 확인 문구 · 버리기 문구                                                                                       | axion 현재본 카드(→ ④ S1), axion 행 클릭 상세(→ 버튼), axion 동의 안내 3줄(→ 소비자 `messages`), 고정 열 집합(→ `historyHeaders`), `VSnackbar`(→ `onDone` · 전역 토스트) |

## 4. 공개 API

### 4-1. admin-shared 렌더러 (`src/markdown.ts`)

```ts
/** 마크다운 원문 → 안전한 HTML. null · undefined · '' 은 ''. 예외를 던지지 않는다 */
export function renderMarkdown(source: string | null | undefined): string
```

머리 주석에 출처 · 바꾼 점(D2) · 🔴 `html: false` 가 방어의 전부라는 점 · "서버 · 공개 웹도 이 함수를 쓴다" 를 적는다.

### 4-2. admin-shared 약관 스키마 (`src/legal.ts`)

```ts
export const LEGAL_BODY_MAX_LENGTH = 1_000_000

/** 공백만이면 '본문을 입력하세요.', 넘치면 '본문은 1,000,000자를 넘을 수 없습니다.' — 트림하지 않는다(D3) */
export const legalBodySchema: z.ZodType<string>

export interface AdminLegalDocument {
  legalDocNo: bigint
  kind: string
  body: string
  /** sha256 hex 64자(소문자). 서버만 계산한다 */
  contentHash: string
  /** ISO 8601 UTC(`z.iso.datetime()`, 세션 스키마와 같음) */
  publishedAt: string
  /** 발행자 계정이 지워지면 null(FK ON DELETE SET NULL) */
  publishedByUserNo: bigint | null
  publishedByUserName: string | null
}
export const adminLegalDocumentSchema // 위 인터페이스와 추론 타입이 같다(타입 테스트)

export type AdminLegalHistoryItem = Omit<AdminLegalDocument, 'body'>
export const adminLegalHistoryItemSchema // adminLegalDocumentSchema.omit({ body: true })

export const adminLegalCurrentSchema // z.object({ item: adminLegalDocumentSchema.nullable() }) — null = 미발행
export const adminLegalHistorySchema // z.object({ items: z.array(adminLegalHistoryItemSchema) }) — 최신순 전량

export interface AdminLegalPublish {
  kind: string
  body: string
  /** 편집을 시작한 판 번호. 미발행 상태에서 시작했으면 null(⑤ V2) */
  baseLegalDocNo: bigint | null
}
export const adminLegalPublishSchema // kind: z.string().min(1), body: legalBodySchema, baseLegalDocNo: z.bigint().nullable()

export const adminLegalPublishResultSchema // z.object({ legalDocNo: z.bigint(), contentHash: 해시 })
export type AdminLegalPublishResult = { legalDocNo: bigint; contentHash: string }
```

종류(`kind`)는 `string` 이다. 값 집합은 소비자 카탈로그이고, 서버 검증은 Phase 2 모듈 옵션(§9)이 한다.

### 4-3. `MarkdownView`

| 이름         | 타입 · 기본                       | 뜻                                                                                                      |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `source`     | `string \| null` · `null`         | 마크다운 원문                                                                                           |
| `linkTarget` | `'_self' \| '_blank'` · `'_self'` | `'_blank'` 면 본문 안 `a[href]` 클릭을 가로채 `window.open(href, '_blank', 'noopener,noreferrer')`(D18) |
| `#empty`     | 슬롯                              | 렌더 결과가 `''` 일 때                                                                                  |

- 템플릿: `<div class="markdown-view" v-html="html" />`. 🔴 안전 근거 주석을 머리와 템플릿 양쪽에 둔다. eslint `vue/no-v-html` 이 걸리면 이 한 줄에서만 끈다.
- 스타일(`<style scoped>` + `:deep()`, 순수 CSS):
  - 제목 `h1`~`h6`: 1.5rem → 1rem, 위 1em · 아래 0.5em, 첫 요소의 위 여백은 0
  - 문단 · 목록: 아래 0.75em, 목록 들여쓰기 1.5em
  - 표: 테두리 `rgba(var(--v-border-color), var(--v-border-opacity))`, 칸 6px 10px, 표가 넓으면 그 안에서 가로 스크롤
  - 인용: 왼쪽 3px 선 + medium emphasis
  - 코드: `rgba(var(--v-theme-on-surface), 0.06)` 배경, monospace
  - 링크: primary
  - 이미지: `max-width: 100%`
  - 감싸개: `overflow-wrap: anywhere`

### 4-4. `MarkdownEditor`

| 이름                | 타입 · 기본            | 뜻                                                     |
| ------------------- | ---------------------- | ------------------------------------------------------ |
| `modelValue`        | `string`               | 본문                                                   |
| `readonly`          | `boolean` · `false`    | D5                                                     |
| `label`             | `string` · `'본문'`    | `.cm-content` 의 `aria-label`                          |
| `height`            | `string` · `'420px'`   | 바깥 틀 높이. 넘치는 본문은 안에서 스크롤              |
| `update:modelValue` | emit `(value: string)` | 사용자가 문서를 바꿨을 때만(외부 변경은 내보내지 않음) |

조립 순서:

1. `basicSetup`
2. `EditorView.lineWrapping`
3. Compartment 셋: 읽기 전용(`EditorState.readOnly` + `aria-readonly`), 다크 판정(`EditorView.darkTheme`), 접근성 이름(`EditorView.contentAttributes`)
4. Vuetify 변수 테마
5. `updateListener`

`EditorView`(`codemirror` 재내보내기) · `basicSetup` 은 `codemirror` 에서, `EditorState` · `Compartment` · `Transaction` · `Annotation` 은 `@codemirror/state` 에서 가져온다. 마운트에서 만들고 언마운트에서 `destroy()` 한다. 루트 요소가 곧 호스트다(`v-if` 뒤에 두지 않음).

테마 색:

| 요소         | 색                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 배경 · 글자  | `rgb(var(--v-theme-surface))` · `rgb(var(--v-theme-on-surface))`                                                            |
| 줄 번호 영역 | 배경 `rgba(var(--v-theme-on-surface), 0.04)` · 글자 `rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity))`     |
| 현재 줄      | `rgba(var(--v-theme-on-surface), 0.04)`                                                                                     |
| 선택 · 커서  | `rgba(var(--v-theme-primary), 0.2)` · `rgb(var(--v-theme-on-surface))`                                                      |
| 테두리       | `rgba(var(--v-border-color), var(--v-border-opacity))`, 포커스 때 `rgb(var(--v-theme-primary))`. CodeMirror 점선 outline 끔 |
| 글꼴         | monospace 13px                                                                                                              |

### 4-5. `useLegalDocuments`

```ts
export interface LegalKindOption<K extends string = string> {
  value: K
  label: string
}

export type LegalPublishBlock =
  'readonly' | 'loading' | 'loadFailed' | 'empty' | 'tooLong' | 'unchanged'

export interface LegalDialogText {
  title: string
  message: string
  confirmLabel: string
}

export interface LegalMessages {
  /** 기본 `${kindLabel} 새 버전을 발행했습니다.` */
  published: (kindLabel: string) => string
  /** 기본 제목 `${kindLabel} 새 버전 발행` · '발행하면 새 버전이 바로 시행됩니다. 기존 버전은 이력에 그대로 남습니다.' · '발행' */
  publishConfirm: (kindLabel: string) => LegalDialogText
  /** 기본 '편집 중인 내용 버리기' · `발행하지 않은 ${fromLabel} 편집 내용이 있습니다. '${toLabel}' 탭으로 넘어가면 편집 내용이 사라집니다.` · '버리고 이동' */
  discardConfirm: (fromLabel: string, toLabel: string) => LegalDialogText
}

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
  /** 기본 () => true. 요청 · 확인 순간에 다시 부른다(D10) */
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
  'onUpdate:modelValue': (open: boolean) => void // false → closeDetail
  onRetry: () => void
}

export interface LegalDocumentEditorBindings<K extends string, R> {
  kinds: readonly LegalKindOption<K>[]
  kind: K
  current: AdminLegalDocument | null
  loading: boolean
  loadFailed: boolean
  modelValue: string // = draft
  readonly: boolean
  canPublish: boolean
  publishBlock: LegalPublishBlock | null
  submitting: boolean
  conflict: boolean
  history: readonly R[]
  historyLoading: boolean
  historyFailed: boolean
  publishDialog: ConfirmDialogBindings // useWriteFlow.confirmDialog
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

export interface LegalDocumentsController<K extends string, R> {
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

export function useLegalDocuments<
  K extends string,
  R extends AdminLegalHistoryItem = AdminLegalHistoryItem,
>(options: UseLegalDocumentsOptions<K, R>): LegalDocumentsController<K, R>
```

#### 4-5-1. 흐름

1. **불러오기.** 현재본과 이력을 나란히 부르고, 각자 시퀀스 번호를 갖는다(D14).
   - 현재본 성공이면 `current = doc` 이다. 그 시점에 초안이 깨끗하면 `draft = baseBody = doc?.body ?? ''` 로, 더러우면 `baseBody` 만 바꾼다(D9).
   - 현재본 실패면 `currentError = e` 이고 `current` · 초안은 그대로 둔다.
   - 이력 성공이면 `history = items` 이다. 실패면 `historyError = e` 이고 직전 목록을 남긴다.
2. **종류.** `selectKind(next)` 는 같은 종류 · 목록에 없는 종류 · 발행 중이면 무시한다.
   - 초안이 더러우면 `discard = { open: true, pendingKind: next }` 만 연다. 종류는 그대로다.
   - 깨끗하면 `switchKind(next)` 를 부른다.
   - "버리고 이동" 은 `pendingKind` 가 아직 유효하고 발행 중이 아닐 때 `switchKind` 를 부른다. 취소는 닫기만 한다.
   - `switchKind` 는 `kind = next` 로 바꾸고, `draft = baseBody = ''` · `current = null` · `history = []` · `conflict = false` 로 비우고, 원문 대화상자를 닫은 뒤 불러온다(D7).
3. **판정.**
   - `publishable()` 은 D16 순서로 첫 이유를 낸다. 조건은 이렇다:
     - `readonly`: 어댑터가 없거나 `!canWrite()`
     - `loading`: 현재본 불러오는 중
     - `loadFailed`: 현재본 실패
     - `empty`: `draft.trim() === ''`
     - `tooLong`: `draft.length > LEGAL_BODY_MAX_LENGTH`
     - `unchanged`: `draft === baseBody`
   - `canPublish = publishable() === null && !submitting` 이다.
   - 편집기 `readonly` 는 `readonly` · `loading` · `loadFailed` 중 하나이거나 발행 중일 때다.
4. **발행.** `requestPublish()` 는 `canPublish` 가 아니면 무시한다.
   - `k = kind` 를 잡아 두고, 3d 와 같은 `write` 도우미로 `useWriteFlow.run({ gate: 'confirm', reversible: false, ...publishConfirm(라벨), onConflict })` 을 부른다.
   - 액션 안에서 `kind === k && publishable() === null` 을 다시 본다(D10). 아니면 보내지 않는다(`attempted = false`).
   - 통과하면 `sent = draft` 를 잡고 `publish({ kind: k, body: sent, baseLegalDocNo: current?.legalDocNo ?? null })` 를 부른다.
5. **결과.**
   - 보내지 않았으면 끝이다.
   - 성공이면 `baseBody = sent`, `conflict = false`, 재조회, `onDone({ action: 'published', kind: k, message })` 순이다(D11).
   - 충돌이면 `conflict = true` 로 두고 재조회한다(D12).
   - 그 밖 실패는 아무것도 하지 않는다(전역 토스트).
6. **원문.** `openDetail(row)` 는 `detail = { open: true, row, document: null, loading: true, error: null }` 로 열고 `loadOne(row.legalDocNo)` 를 부른다. 시퀀스 번호로 늦은 응답을 버린다. 실패는 `error` 와 [다시 시도] 다. `closeDetail` 은 닫고 번호를 올린다.
7. **해제.** `onScopeDispose` 에서 `disposed = true` 로 두고, 이후 도착한 응답은 상태를 바꾸지 않는다.

### 4-6. `LegalDocumentEditor`

`<script setup lang="ts" generic="K extends string, R extends AdminLegalHistoryItem">`

props 는 `LegalDocumentEditorBindings<K, R>` 의 상태 전부와 아래 컴포넌트 전용이다. emits 는 `selectKind` · `update:modelValue` · `publish` · `reloadCurrent` · `reloadHistory` · `openDetail` · `dismissConflict` 이다.

| 컴포넌트 전용    | 타입 · 기본                                                                  | 뜻                                                                            |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `historyHeaders` | `readonly { title: string; key: string; width?: number \| string }[]` · `[]` | 이력 표에 더할 열. [보기] 앞에 붙는다. 값은 슬롯 `item.<key>` 로(없으면 원값) |
| `formatDate`     | `(iso: string) => string`                                                    | 기본 `formatDateTime`(D21)                                                    |
| `editorHeight`   | `string` · `'420px'`                                                         | 편집기 · 미리보기 높이                                                        |
| `messages`       | `Partial<LegalDocumentEditorMessages>`                                       | 아래                                                                          |

배치(위에서 아래로):

1. **종류 탭.** `VTabs`(`aria-label` = `kindTabs`)에 `:model-value="kind"` + `@update:model-value` 를 단다(D7). 발행 중이면 끈다.
2. **시행 정보.** 상태별로 하나를 보인다.
   - 불러오는 중: `VProgressLinear`
   - 실패: error `VAlert` + [다시 시도]
   - 미발행: info `VAlert`
   - 시행 중: 칩 "시행 중" + `currentLine`. 실패 중이면 숨긴다(D19).
3. **충돌 안내.** warning `VAlert` closable(`conflict`).
4. **편집기 | 미리보기.**
   - CSS grid `repeat(auto-fit, minmax(min(100%, 360px), 1fr))` 라 좁으면 저절로 쌓인다.
   - 편집기는 `MarkdownEditor`(`label` = `editorLabel(라벨)`)다. 불러오는 중에도 숨기지 않고 `readonly` 로 둔다.
   - 미리보기는 `VCard` outlined, 같은 높이에 안에서 스크롤한다. `MarkdownView linkTarget="_blank"` 와 `#empty` = `previewEmpty` 를 쓴다.
5. **발행.** 막힘 이유 글자(D16, `loading` 제외) + `VBtn` primary. `:disabled="!canPublish"` · `:loading="submitting"` 한 벌이다(킷 규약).
6. **발행 이력.**
   - 제목과, 이력이 실패했으면 warning `VAlert` + [다시 시도] 를 둔다.
   - `VDataTable` 클라이언트 페이지 10행, 정렬 끔, 행 키 `String(legalDocNo)`.
   - 열은 번호(시행 중 칩, D19) · 발행일 · 발행자(D20) · 해시 8자(monospace) · 더한 열 · [보기](`VBtn` text, `aria-label` = `viewLabel(번호)`) 다.
   - 빈 목록이면 `historyEmpty` 를 보인다.
7. **대화상자.**
   - `ConfirmDialog v-bind="publishDialog"`
   - `ConfirmDialog v-bind="discardDialog"`(`reversible: false` — 초안은 서버 어디에도 없다)
   - `BaseDialog`(제목 `detailTitle`, `max-width` 900, scrollable): 머리 줄 `detailMeta`, 불러오는 중 · 실패 + [다시 시도] · `MarkdownView linkTarget="_blank"`, [닫기] 는 늘 켬(`BaseDialog` 는 `persistent` 기본)

```ts
export interface LegalDocumentEditorMessages {
  kindTabs: string // '문서 종류'
  editorLabel: (kindLabel: string) => string // `${kindLabel} 본문`
  preview: string // '미리보기'
  previewEmpty: string // '미리 볼 내용이 없습니다.'
  currentChip: string // '시행 중'
  currentLine: (publishedAt: string, publisher: string, hash: string) => string // `${publishedAt} 발행 · ${publisher} · 해시 ${hash}`
  notPublished: (kindLabel: string) => string // `아직 발행된 ${kindLabel} 문서가 없습니다. 본문을 작성해 발행하세요.`
  loadFailed: string // '현재본을 불러오지 못했습니다. 다시 불러오기 전까지 발행할 수 없습니다.'
  retry: string // '다시 시도'
  /** 날짜가 있으면 `다른 관리자가 ${publishedAt}에 새 버전을 …`, null 이면(재조회 실패) `다른 관리자가 새 버전을 …` — 뒤는 같다:
   *  '… 발행했습니다. 이력에서 새 판을 확인한 뒤 다시 발행하세요. 다시 발행하면 그 판을 대체합니다.' */
  conflict: (publishedAt: string | null) => string
  publish: string // '새 버전 발행'
  blocked: Record<Exclude<LegalPublishBlock, 'loading'>, string> // 발행 권한이 없습니다. / 현재본을 불러온 뒤 발행할 수 있습니다. / 본문을 입력하세요. / 본문은 1,000,000자를 넘을 수 없습니다. / 시행 중인 판과 내용이 같습니다.
  historyTitle: string // '발행 이력'
  historyFailed: string // '발행 이력을 불러오지 못했습니다. 아래 목록이 최신이 아닐 수 있습니다.'
  historyEmpty: string // '발행 이력이 없습니다.'
  headers: { legalDocNo: string; publishedAt: string; publisher: string; contentHash: string } // 번호 · 발행일 · 발행자 · 해시
  view: string // '보기'
  viewLabel: (legalDocNo: bigint) => string // `${legalDocNo}번 판 원문 보기`
  detailTitle: string // '판 원문'
  detailMeta: (legalDocNo: bigint, publishedAt: string, publisher: string, hash: string) => string // `${no}번 · ${publishedAt} · ${publisher} · 해시 ${hash}`
  detailFailed: string // '원문을 불러오지 못했습니다.'
  close: string // '닫기'
}
```

`legal-document.ts` 에 `shortHash(hash)`(앞 8자, 빈 값 '-')와 `publisherLabel(name, userNo)`(D20)를 순수 함수로 둔다.

## 5. 의존성

- `@ssworks/admin-shared` `dependencies` 에 `"markdown-it": "^15.0.2"`(자체 타입 포함 — `@types/markdown-it` 불필요, 설치본 확인).
- `@ssworks/admin-ui` `peerDependencies` 에 `"codemirror": "^6.0.2"` · `"@codemirror/state": "^6.7.6"`(필수, 2026-10-07 npm 최신 = 개발 설치본 — 3d 의 he-tree 하한과 같은 방식), `devDependencies` 에 같은 판. `vite.config.ts` `external` 에 `/^codemirror$/` · `/^@codemirror\//`.
- `@codemirror/view` 를 직접 들이지 않는다 — `EditorView` 는 `codemirror` 가 다시 내보낸다(`codemirror@6.0.2` `dist/index.d.ts` 확인).
- 설치 때 `ERR_PNPM_IGNORED_BUILDS` 가 나면 3d R1 처럼 `allowBuilds` 로 다룬다.

## 6. 파일

| 파일                                                                | 내용                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/admin-shared/src/markdown.ts` · `markdown.test.ts`        | §4-1                                                                                           |
| `packages/admin-shared/src/legal.ts` · `legal.test.ts`              | §4-2                                                                                           |
| `packages/admin-shared/src/index.ts` · `package.json` · `README.md` | 내보내기 · 의존 · 절                                                                           |
| `packages/admin-ui/src/utils/format-date-time.ts`                   | D21(옮김). `session-table.ts` 는 여기서 가져온다                                               |
| `packages/admin-ui/src/components/markdown/MarkdownView.vue`        | §4-3                                                                                           |
| `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`      | §4-4                                                                                           |
| `packages/admin-ui/src/components/legal/legal-document.ts`          | 타입 · `LegalMessages` · `LegalDocumentEditorMessages` 기본값 · `shortHash` · `publisherLabel` |
| `packages/admin-ui/src/composables/useLegalDocuments.ts`            | §4-5                                                                                           |
| `packages/admin-ui/src/components/legal/LegalDocumentEditor.vue`    | §4-6                                                                                           |
| `*.test.ts` · `*.render.test.ts`(옆에)                              | §7                                                                                             |
| `packages/admin-ui/src/index.ts`                                    | "── 마크다운 · 약관 ──" 절                                                                     |
| `packages/admin-ui/package.json` · `vite.config.ts` · `README.md`   | §5 · §8                                                                                        |
| `.changeset/admin-ui-legal.md`                                      | §8                                                                                             |

## 7. 테스트 계약

- **`renderMarkdown`**(🔴 계약 — 지우면 `html: true` 로 바꿔도 아무도 모른다):
  - `<script>alert(1)</script>` 는 `&lt;script&gt;` 로 나오고 `<script` 가 없다.
  - `<img src=x onerror=alert(1)>` 는 이스케이프된다.
  - `[x](javascript:alert(1))` · `![x](javascript:alert(1))` · `[x](data:text/html,…)` 에는 `href` · `src` 가 없다.
  - 평문 `https://example.com` 은 링크가 된다.
  - 줄 하나 바꿈은 `<br>` 이 아니다.
  - `null` · `undefined` · `''` 는 `''` 다.
  - 같은 입력이면 같은 출력이다.
- **약관 스키마:**
  - bigint 번호 · `publishedAt` UTC 만(오프셋 `+09:00` 거부)
  - 해시 64자 소문자 hex(63자 · 대문자 거부)
  - 발행자 null 둘
  - 본문 공백만 거부 · 최대 통과 · 최대+1 거부 · 앞뒤 공백 보존
  - 이력 행은 `body` 없이 통과
  - `baseLegalDocNo: null` 통과
  - `kind: ''` 거부
  - 인터페이스와 추론 타입 일치(타입 테스트)
- **`MarkdownView`**(happy-dom):
  - 제목 · 목록 · 링크 요소가 그려진다.
  - script 요소와 `onerror` 속성이 없다.
  - `javascript:` 링크에 `href` 가 없다.
  - 빈 값과 `null` 이면 `#empty` 를 보인다.
  - `_blank` 면 링크 클릭의 기본 동작이 막히고 `window.open(href, '_blank', 'noopener,noreferrer')` 를 부른다. `_self` 면 개입하지 않는다.
- **`MarkdownEditor`**(happy-dom, `aria-label` 로 `.cm-content` 를 찾고 `EditorView.findFromDOM` + `dispatch` — gise 2026-09-23 실측 방법):
  - 초기값이 문서가 된다.
  - 사용자 변경 → `update:modelValue` 한 번(문서 전체).
  - prop 교체 → 문서가 바뀌고 emit 없음, `undoDepth` 0.
  - 같은 값 prop → 치환 없음(문서 객체 동일).
  - `readonly` 켜고 끄기에 `state.readOnly` · `aria-readonly` 가 따라간다.
  - `label`
  - Vuetify 테마를 dark 로 바꾸면 `darkTheme` facet 이 true.
  - `cm-lineWrapping` 클래스
  - 언마운트 → 뷰 파괴
- **`useLegalDocuments`**(DOM 없이. 어댑터는 직접 푸는 Promise, 대화상자는 바인딩의 `onConfirm` 을 부른다):
  - 첫 불러오기 · 미발행 `null` · 현재본 실패와 회복 · 이력 실패 시 직전 유지
  - 종류 전환: 깨끗 · 더러움(확인만 열림 · 취소 · 버리고 이동) · 같은 · 없는 · 발행 중 무시 · 옛 응답 버림
  - 막힘 이유 여섯과 순서, 상한 경계
  - 확인 → 본문 · 기준 번호(미발행이면 `null`)
  - 성공: 깨끗해짐(재조회가 실패해도) · 재조회 · `onDone`
  - 충돌: 처리됨 · 초안 유지 · 기준 = 새 판 · 재발행은 새 번호
  - 그 밖 실패: 처리 표시 없음 · 초안 유지 · 재조회 없음
  - 확인 대기 중 `canWrite` false → 안 보냄
  - D9: 더러울 때 `reload()` 가 초안을 지킨다
  - 초안 보존(앞뒤 공백 · `\r\n`)
  - 원문: 열기 · 실패 · 다시 시도 · 늦은 응답 버림
  - 해제 뒤 응답 무시
  - `initialKind` 경고 · 빈 `kinds` 예외
- **`LegalDocumentEditor`**(happy-dom, `installVisualViewport()`, 바인딩을 손으로):
  - 탭 라벨과 선택. 다른 탭을 누르면 `selectKind` 를 쏘고 선택 표시는 옛 탭에 남는다(D7 — 킷에서 고정). 발행 중이면 탭이 꺼진다.
  - 시행 정보 · 미발행 · 진행 · 실패와 [다시 시도] · 실패 중 칩 숨김
  - 충돌 안내와 닫기
  - 편집기 `aria-label` · `readonly` 전달 · 입력 emit
  - 미리보기 · 빈 문구 · 새 탭 링크
  - 발행 버튼 상태 · 막힘 글자 다섯 · 클릭 emit · `submitting` loading
  - 이력: 열 · 해시 8자 · 발행자 3단계 · [보기] emit · 더한 열과 슬롯 · 실패 · 빈 목록
  - 원문 대화상자 각 상태와 [닫기]
  - `formatDate`
- **흐름 + 화면 함께**(`useLegalDocuments.render.test.ts`):
  - 발행 끝까지(확인 대화상자 "발행" 클릭)
  - 입력 뒤 탭 클릭 → 버리기 대화상자 → 취소면 탭 · 편집기 본문 그대로, "버리고 이동" 이면 새 종류
  - 충돌 안내가 뜨고 편집기 본문은 그대로
- 테스트 전용 `data-testid` 를 심지 않는다 — 접근 이름 · 글자 · `name` 으로 찾는다.

## 8. 릴리스 · 문서

- changeset **minor**(admin-shared · admin-ui, `fixed` 묶음).
  - 첫 줄은 **소비자가 할 일**이다: `pnpm add codemirror @codemirror/state`. 약관 화면을 쓰지 않아도 필요하다(필수 peer, 3a ④).
  - 내용: 새 API(§4), 서버 계약(§9). 기존 API 동작은 바뀌지 않는다.
- **admin-shared README:** `renderMarkdown`(서버 · 공개 웹도 이것을 써야 하는 이유), 약관 스키마, 서버 계약 요약.
- **admin-ui README:**
  - peer 표에 두 줄, API 표 행
  - "## 약관" 절:
    - 페이지 예시: 어댑터 넷 · `useDirtyGuard(() => legal.isDirty.value)` · 열 더하기
    - 404 를 내는 서버용 어댑터 예시: `ApiError` 404 를 잡아 `handled = true` 로 두고 `null` 을 돌려준다
    - 알려진 한계: 입력마다 미리보기 렌더
    - 수동 확인 항목: 한글 입력 · 다크 전환 색
- **진행 문서:** `CLAUDE.md` · `docs/HANDOFF.md` · `docs/01-phase0.md` §8 진행표를 갱신한다. 3e 완료는 **Phase 1 완료**이고, 다음은 Phase 2 다. 테스트 수는 `pnpm check` 결과로 적는다.
- **3d 에서 미룬 문서 손질:** README hangang 예시의 `…` 를 고치고, `HANDOFF.md` "검증" 행의 "PR #1 시점 142 테스트" 를 현재 수로 바꾼다.
- **플랜 Task 에서 먼저 확인할 위험:**
  - ① CodeMirror 가 킷 happy-dom 환경(Vuetify 와 함께)에서 마운트되는가. 안 되면 `test/setup.ts` 보강.
  - ② 제네릭 SFC(`LegalDocumentEditor`)의 선언이 `vite-plugin-dts` 로 빌드되는가. 3d `TeamUserList` 선례.
  - ③ admin-shared tsconfig(`types: []`, ES lib)에서 markdown-it 타입이 풀리는가.
- 끝에 `/smoke`: 패킹한 tarball 을 `codemirror` · `@codemirror/state` 와 함께 임시 Vite 앱에 설치해 typecheck · build 한다. Windows 긴 경로 때문에 짧은 `%TEMP%` 경로에서 돌린다.

## 9. Phase 2 서버 계약 (이 PR 에서 구현하지 않음)

| 요청                                      | 본문                             | 응답 · 오류                                                                                                                                                                          |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET admin/legal-documents/current?kind=` | —                                | `{ item: AdminLegalDocument \| null }` — 미발행이면 200 + `null`                                                                                                                     |
| `GET admin/legal-documents?kind=`         | —                                | `{ items: AdminLegalHistoryItem[] }` 최신순 전량(페이지 없음 — 발행은 드물다, 두 정본 같음)                                                                                          |
| `GET admin/legal-documents/:legalDocNo`   | —                                | `AdminLegalDocument` · 없으면 404 `ERR_COMMON_NOT_FOUND`                                                                                                                             |
| `POST admin/legal-documents`              | `{ kind, body, baseLegalDocNo }` | `{ legalDocNo, contentHash }` · 기준 판이 지금 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT` · 시행본과 본문이 같으면 409 `ERR_COMMON_CONFLICT`("이전 버전과 내용이 같습니다.") |

- 🔴 `contentHash = sha256(body)`(utf8, hex 소문자)는 서버만 계산한다. 클라이언트가 보낸 해시를 믿으면 동의 기록 스냅샷을 위조할 수 있다(axion · gise).
- 🔴 같은 종류의 발행은 한 트랜잭션에서 직렬화한다. 순서는 ① `(지금 시행본 번호 ?? null) !== baseLegalDocNo` 면 revision 충돌, ② 그다음 같은 본문 검사다. 남이 먼저 발행한 것이 진짜 원인이기 때문이다.
- "시행본" 은 종류별로 `publishedAt` 이 가장 늦은 판이다(같으면 큰 번호).
- append-only 다 — 수정 · 삭제 경로가 없다. 발행자 FK 는 `ON DELETE SET NULL`, `publishedByUserName` 은 사용자 조인으로 파생한다(gise).
- 종류 값은 소비자 카탈로그(모듈 옵션)로 `z.enum` 검증한다. 권한은 읽기와 발행을 따로 둔다(gise `SETTING_LEGAL_READ` · `SETTING_LEGAL_PUBLISH`). 발행은 감사 로그에 남긴다.
- 공개 조회는 범위 밖이고 참고로만 적는다: `GET legal/:kind` → `{ kind, legalDocNo, bodyHtml: renderMarkdown(body), publishedAt }`, 미발행이면 404(fail-closed, gise). 관리 계약을 재사용하지 않는다(gise — 필드가 공개로 새지 않게).
- 기존 서버는 어댑터에서 맞춘다.
  - axion: `{ success, data }` 봉투, 미발행 404 `ERR_LEGAL_NOT_PUBLISHED` → `null`, `baseLegalDocNo` 무시, `publishedAt` Date 를 ISO 로.
  - gise: 404 → `null`, 필드 이름 바꾸기(`legalDocumentNo` → `legalDocNo` · `publishBy` → `publishedByUserNo` · `publishByName` → `publishedByUserName`).

## 10. 비범위 · 보류

- 공개 약관 페이지 · 가입 동의 기록(`userConsents`) · 재동의 흐름 — 소비자 웹 · 서버.
- 종류를 `z.enum` 으로 좁히는 서버 검증 — Phase 2 모듈 옵션.
- 초안 임시 저장 · 예약 발행 · 판 비교(diff) · 편집 툴바 · 이미지 업로드 · 마크다운 문법 강조(③ C2 를 고르지 않음).
- 미리보기 디바운스 — 실제 약관 크기에서 필요 없다. 알려진 한계로 README 에 적는다.
- 이력 서버 페이지 — 발행은 드물다.
- Phase 2 서버 구현 — §9 계약만.

## 11. 리뷰 중점 (테스트가 못 잡는 것)

1. **한글 IME 조합** — happy-dom 에서 재현할 수 없다. 초안이 받은 그대로 왕복하는지(D3) 코드 경로를 리뷰로 본다.
2. **`@codemirror/state` 두 벌** — `/smoke` 에서 패킹한 소비 앱이 빌드되는지 본다.
3. **아주 긴 본문** — 입력마다 미리보기를 렌더한다(알려진 한계).
4. **테마 전환 색** — 잴 수 없다. 수동 확인 항목.
5. **확인 대화상자가 열린 사이의 경합** — 테스트로 고정한 경로 밖에 빠진 것이 없는지 본다.
