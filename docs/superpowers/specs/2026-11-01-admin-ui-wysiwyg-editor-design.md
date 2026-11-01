# admin-ui `MarkdownEditor` WYSIWYG 전환 설계 (PR #3j)

작성일: 2026-11-01 · 상태: 확정(구현 전) · 입력: `docs/reports/2026-10-31-admin-kit-report-wysiwyg-editor.md`(ringside 기능 요청 — 제안 표 1~9 + 「웹 구현에서 검증한 것」이 5 · 8 · 9 를 고친다. 충돌하면 그 절이 맞다) · 선행: PR #3e 스펙(`2026-10-07-admin-ui-legal-design.md` — D3 · D4 · D5 · D6, §4-4) · ringside p1d 스펙(`ssworks-ringside` `docs/superpowers/specs/2026-10-31-p1d-wysiwyg-editor-design.md` 4.2 · 8.1 · 9절 — 어댑터 ①~⑩ · 오라클 넷 · 알려진 차이 K1~K22) · ringside 코드 `apps/web/app/utils/editor-markdown.ts` · `editor-markdown-normalize.ts` · 같은 폴더 테스트(ringside 소유 — 킷이 가져가도 된다. 11/3 전 `C:\workspace\ringside-lanes\p1d`, 뒤 `C:\workspace\ssworks-ringside` `main`)

## 1. 목표

`@ssworks/admin-ui` 의 `MarkdownEditor`(CodeMirror 6 — Markdown 원문 편집)를 **보이는 대로 쓰는(WYSIWYG) 편집기 + 「원문(Markdown)」 전환**으로 바꾼다. 엔진은 TipTap 3 + `@tiptap/markdown`(ProseMirror · marked). 공개 API(props `modelValue` · `readonly` · `label` · `height`, `update:modelValue` 는 Markdown 문자열)는 그대로라 `LegalDocumentEditor` 와 소비자 코드(ringside `MarkdownSettingField`)는 바뀌지 않는다. 렌더(admin-shared `renderMarkdown` — markdown-it `html:false` · `linkify` · `breaks:true`)는 건드리지 않고, **편집기 쪽을 렌더에 맞춘다**(충실도 어댑터 ①~⑩ 전부).

| #   | 항목                                                     | 하는 것                                                                                                                        |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| R1  | 운영자가 Markdown 문법 없이 쓴다                         | TipTap 3 WYSIWYG + 도구 막대(굵게 · 기울임 · 취소선 \| 제목 2 · 3 \| 인용 · 글머리 · 번호 \| 링크 · 구분선 \| 되돌리기 · 다시) |
| R2  | 보이는 것 = 게시(렌더)되는 것                            | 충실도 어댑터 ①~⑩(§2-3) + 오라클 넷(§6)                                                                                        |
| R3  | 표기를 보존하며 고칠 탈출구(약관 append-only · IME 문제) | 「원문」 탭 — 평문 `<textarea>`, 같은 v-model, 값 변환 없음                                                                    |
| R4  | 한글 조합 · 외부 변경 규칙(3e D3 · D4)을 지킨다          | 받은 값과 같으면 치환 안 함 · 외부 변경은 상태 새로 만들기(되돌리기 기록 비움)                                                 |
| R5  | 큰 본문(약관 상한 1,000,000자)에서 입력이 끊기지 않는다  | `update:modelValue` 트레일링 디바운스 200ms + flush(포커스 잃음 · 모드 전환 · readonly · 언마운트)                             |
| R6  | 편집기 스택을 하나로                                     | CodeMirror peer 둘 제거 · TipTap peer 12 + `marked` + `@floating-ui/dom`                                                       |

- 성공 기준: `pnpm check` 초록 · 오라클 넷을 거는 왕복 픽스처가 모두 초록 · 기존 render 테스트의 계약(D3 · D4 · readonly · label · height · destroy)이 TipTap 위에서 그대로 · `LegalDocumentEditor` 소스 무변경 · tarball 스모크(새 peer 로 `vue-tsc` · `vite build`) 통과 · 실브라우저에서 도구 막대 · 링크 대화상자 · 원문 전환 · 붙여넣기 · 콘솔 오류 없음.
- 템플릿(`kim5257-project-template` `preset/admin`)은 이번에 **함께 고친다**(사용자 지시 — 읽기 전용 규약의 예외). push 는 사람.

## 2. 결정

### 2-1. 경계 결정 (2026-11-01 — 보고문이 킷에 맡긴 넷 + 범위)

| 결정                      | 확정                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 「원문(Markdown)」 탭   | **둔다**(권장안). 서식 \| 원문 `VBtnToggle`. 원문은 평문 `<textarea>`(monospace · 같은 v-model · 값 변환 없음). 약관은 append-only 라 "표기만 다른 새 판"을 피할 길이 필요하고, IME · 충실도 문제의 탈출구다. 원문에서 친 것은 즉시 emit(디바운스 없음 — 싸다)                                                                                                                                                                                                                                          |
| ② Image `![]()` 입력 규칙 | **켠다**(TipTap `Image` 기본). 킷은 그림을 거르지 않으니(보고문 ④ — 거르기는 ringside 몫) 입력 규칙을 끌 이유가 없고, WYSIWYG 에서 그림 주소를 넣는 유일한 길이다. 붙여넣은 HTML `<img>` · Markdown `![]()` 도 그대로 노드. 업로드 UI 는 없다(킷에 업로드 개념이 없다). 🔴 입력 규칙이 만든 문서가 `doc.check()` 를 통과하는지 테스트가 본다 — 실패하면 끈다(원문 탭이 길이다)                                                                                                                          |
| ③ emit 디바운스           | **한다 — 트레일링 200ms**(상수, prop 아님). 입력마다 `getMarkdown()` 전체 직렬화 + 부모 재렌더(미리보기)가 O(n) 이라(보고문 성능 표 — 5만 자 한 문단 키당 186~703ms) 상한 1,000,000자에서는 필수다. **flush**: 편집기가 포커스를 잃을 때 · 원문으로 전환 · `readonly` 가 켜질 때 · 언마운트. D3 는 `lastEmitted` 비교로 지킨다(§2-2 W4). 원문 textarea 는 디바운스 없음                                                                                                                                 |
| ④ 어댑터 export           | **나중**. admin-shared 는 서버가 import 하니 `@tiptap/*` 을 들일 수 없고, admin-ui 의 서브패스도 admin-ui peer(vuetify · pinia …) 설치를 요구해 Nuxt 웹에 맞지 않다. 맞는 모양은 **넷째 패키지**(예: `@ssworks/markdown-editor`, fixed 묶음)인데 이번 범위가 아니다. 이번엔 어댑터를 Vue 무의존 순수 모듈(`editor-markdown.ts` · `editor-markdown-normalize.ts`)로 두어 나중에 파일 이동으로 꺼낼 수 있게 한다. ringside 웹은 자기 복사본을 유지한다                                                    |
| ⑤ peers                   | 보고문 11 + **`@tiptap/extension-code`** = `@tiptap/*` 12(정확 판 3.32.0) + `marked ^17.0.6` + `@floating-ui/dom ^1.0.0`. StarterKit 기본 `Code` 는 다른 마크를 전부 배제(`excludes: '_'`)해 `**굵은 \`코드\`**`·`[\`코드\`](url)`의 굵게 · 링크가 떨어져 렌더가 갈린다 — Nuxt UI 처럼`Code.extend({ excludes: 'code' })`(§2-3 A3). `extension-horizontal-rule`은 필요 없다(StarterKit 것 그대로).`@tiptap/starter-kit`은 개별 확장을 재export 하지 않아`.extend` 대상은 직접 peer 여야 한다(pnpm 엄격) |
| ⑥ 범위                    | admin-ui 하나 · 스펙 하나 · PR 하나(#3j). admin-shared · admin-server 는 코드 변경 없음(fixed 라 번호만 0.10.0). 템플릿 `preset/admin` 은 의존 · 핀 · `vuetifyLayerOrder()` 만(§7-4). ringside 저장소는 읽기만                                                                                                                                                                                                                                                                                          |

버린 안과 이유:

- ① 원문 탭 없음(ringside 웹 WE3): 웹은 회원이 쓰고 이미지 거르기가 있어 WYSIWYG 만으로 충분했다. 킷은 약관(append-only · 법적 원문)이 첫 소비자라 표기 보존이 필요하다.
- ③ 디바운스를 문서 크기로 켜고 끄기(2만 자 넘을 때만): 경로가 둘이면 테스트 · 소비자 기대가 갈린다. 디바운스를 prop 으로: 소비자가 0 을 주면 D3 전제가 다시 성능과 충돌한다 — 상수로 둔다. 부모(미리보기)만 늦추기: 직렬화 자체가 키당 비용이라 해결이 아니다.
- ④ 지금 export(admin-ui 메인 엔트리): ringside 웹이 admin-ui 를 설치해야 하는데 peer 가 Vuetify · Pinia 다. admin-shared 서브패스 `./editor`: 서버 번들러가 admin-shared 를 해석할 때 `@tiptap/*` 이 없어 깨질 수 있고(peer 로 두면 서버도 설치) 패키지 경계(프레임워크 무의존)가 흐려진다.
- ⑤ `extension-code` 를 빼고 알려진 차이로 고정: 링크 걸린 코드가 링크를 잃는 것은 "보이는 모양만 다름"이 아니라 정보 손실이다.
- 도구 막대 숨김 prop(`toolbar: false` — 보고문 4): 숨길 소비자가 없다(YAGNI). 필요하면 나중에 더한다 — 더하기만이라 호환이다.
- 발행 확인 창에 "표기가 바뀐다" 문구: 한 글자 고침마다 뜨는 경고는 훈련된 무시가 된다. README 「알려진 한계」 한 줄 + 원문 탭이 답이다.
- 렌더가 같으면 "변경 없음"으로 발행 막기(`useLegalDocuments` 의 `unchanged` 를 `renderMarkdown` 비교로): 표기를 일부러 고치는 운영자를 막는다. 하지 않는다.

### 2-2. 편집기 설계 결정 (W)

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | 조립: `@tiptap/vue-3` `useEditor` + `EditorContent`. `extensions: createMarkdownEditorExtensions()`(§2-3) · `content: props.modelValue` · `contentType: 'markdown'` · `editable: !readonly` · `injectCSS: false`(라이브러리가 소비자 `<head>` 에 `<style>` 을 심지 않는다 — 필요한 규칙 `white-space: pre-wrap` · gapcursor 는 scoped CSS 에) · `editorProps.attributes`: `role="textbox"` · `aria-multiline="true"` · `aria-label=label` · readonly 면 `aria-readonly="true"`                                                                                                                                                                                                                                       |
| W2  | 모드 `mode: 'wysiwyg' \| 'source'`(내부 ref, 초기값 prop `defaultMode` 기본 `'wysiwyg'`). 둘 다 마운트해 두고(`v-show`) 보이는 쪽만 바꾼다 — TipTap 을 매번 새로 만들지 않는다. 원문은 `<textarea :value="modelValue" @input>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| W3  | 🔴 **emit(디바운스)**: TipTap `onUpdate` → 200ms 타이머 → `flush()`: `md = editor.getMarkdown()`, `md !== lastEmitted` 면 `lastEmitted = md` · emit. 포커스 잃음(`onBlur`) · 원문 전환 · readonly 켜짐 · 언마운트(`onBeforeUnmount` — destroy 전)에서 `flush()`. 원문 textarea `input` 은 `lastEmitted = value` · `wysiwygStale = true` · 즉시 emit                                                                                                                                                                                                                                                                                                                                                                  |
| W4  | 🔴 **prop 감시(D3)**: `value === lastEmitted` 면 무시(우리 echo — 디바운스 중이라도 같다). 원문 모드면 `lastEmitted = value` · `wysiwygStale = true` 만(서식으로 돌아올 때 맞춘다). 서식 모드에서 `value === editor.getMarkdown()` 이면 `lastEmitted = value` 만(부모가 같은 값을 다시 준 경우). 그 밖은 외부 변경 → 대기 중 emit 취소 · W5. 🔴 echo 판정이 `lastEmitted` 비교인 이유: 디바운스 뒤 부모가 돌려준 값은 그 사이 더 친 글자 때문에 지금 문서와 다를 수 있다 — 문서와만 비교하면 조합 중 치환이 일어난다                                                                                                                                                                                                 |
| W5  | 🔴 **외부 변경(D4)**: `editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })` 뒤 **상태를 새로 만든다** — `view.updateState(EditorState.create({ schema, doc: view.state.doc, plugins: view.state.plugins }))`. 되돌리기 기록이 비어 Ctrl+Z 가 앞 문서를 되살리지 않는다(`setContent` 만으로는 history 에 남는다 — 보고문 6). `lastEmitted = value`. 서식으로 돌아올 때 `wysiwygStale` 이면 같은 길                                                                                                                                                                                                                                                                                      |
| W6  | 🔴 **첫 내용은 emit 하지 않는다**(D3 전제). 마운트 · 외부 변경 · 모드 전환 어디서도 emit 이 없고, 사용자 트랜잭션에서만 난다. StarterKit `trailingNode: false` 가 아니면 마운트 때 끝 블록 뒤에 빈 문단이 붙어 값이 `+"\n\n"` 로 바뀌고 건드리지 않은 원고가 더티가 된다(보고문 함정 ③). 첫 사용자 편집에서 문서 전체가 재직렬화돼 옛 원고의 표기가 바뀌는 것(이스케이프 · `  \n` · `&nbsp;` …)은 받아들인다 — README 「알려진 한계」                                                                                                                                                                                                                                                                                |
| W7  | `readonly`: `editor.setEditable(!readonly, false)` + `aria-readonly`(`setOptions({ editorProps })`). 도구 막대 단추 전부 `disabled`, 원문 textarea `readonly`. 모드 전환은 readonly 에서도 된다(보기만). 선택 · 복사는 된다. 3e D5 의 "찾기 패널" 문구는 지운다(CodeMirror 기능)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| W8  | `label`: `.ProseMirror` `aria-label` · textarea `aria-label` · 도구 막대 `role="toolbar" aria-label="${label} 서식"` · 모드 토글 `aria-label="편집 방식"`. 바뀌면 `editor.setOptions({ editorProps: { attributes } })`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| W9  | `height`: 바깥 틀(도구 막대 포함) 높이. 틀은 `display:flex; flex-direction:column`, 도구 막대는 고정, 본문 영역이 `flex:1; min-height:0; overflow:auto`. `.ProseMirror { min-height:100%; padding: 12px 16px }`. 원문 textarea 는 `height:100%; resize:none; font-family: monospace; font-size: 13px`                                                                                                                                                                                                                                                                                                                                                                                                                |
| W10 | 도구 막대(`VBtn` `variant="text" size="small"` + mdi 아이콘 + `aria-label` · `title`): 굵게 `mdi-format-bold` · 기울임 `mdi-format-italic` · 취소선 `mdi-format-strikethrough-variant` \| 제목 2 `mdi-format-header-2` · 제목 3 `mdi-format-header-3` \| 인용 `mdi-format-quote-close` · 글머리 `mdi-format-list-bulleted` · 번호 `mdi-format-list-numbered` \| 링크 `mdi-link-variant` · 구분선 `mdi-minus` \| 되돌리기 `mdi-undo` · 다시 `mdi-redo`. 켜진 서식은 `active`(`editor.isActive`). `can()` 이 거짓이면 `disabled`. 명령은 `chain().focus().…run()` — 클릭 뒤 포커스가 편집기로 돌아온다. H1 단추 없음(문서 제목) · 코드 단추 없음(입력 규칙 `` ` `` · ``` 는 된다). 제목 스키마는 1~6(옛 원고 보존)     |
| W11 | 모드 토글: 도구 막대 오른쪽 `VBtnToggle`(`mandatory` · `density="compact"`) 「서식」 「원문」. 원문으로 갈 때 `flush()`(textarea 가 최신 값을 보인다). 서식으로 올 때 `wysiwygStale` 이면 W5(되돌리기 기록도 비운다 — 다른 편집기에서 바뀐 문서다)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| W12 | 🔴 **링크는 `BaseDialog`**(브라우저 `prompt` · `confirm` 금지 — 저장소 규약). 내부 부품 `MarkdownLinkDialog.vue`(export 안 함): `type="none"` + `VTextField`(주소) + 단추 [링크 지우기] [취소] [적용]. 링크 단추는 선택이 비었고 링크 위도 아니면 `disabled`(글자 없이 링크만 넣는 갈래는 없다). 열 때만 주소 칸을 채운다(`editor.getAttributes('link').href` — 열린 채 선택이 다시 매핑돼도 치던 주소를 지우지 않는다, 보고문). Enter = 적용. 적용 = `normalizeLinkHref`(§2-3 A10) → null 이면 링크 지우기, 아니면 `chain().focus().extendMarkRange('link').setLink({ href }).run()` — 거짓이면 닫지 않고 「사용할 수 없는 주소입니다.」(`role="alert"`). 「열기」 단추는 두지 않는다(미리보기의 새 탭 링크가 있다) |
| W13 | 문구는 `messages?: Partial<MarkdownEditorMessages>` + `DEFAULT_MARKDOWN_EDITOR_MESSAGES`(얼림 · export — 3i E1 · E3 규약). 키: 도구 12 · 모드 2(`modeWysiwyg` '서식' · `modeSource` '원문') · `modeToggle`('편집 방식') · `toolbar(label)`(`${label} 서식`) · 링크 대화상자 6(`linkTitle` '링크' · `linkHref` '주소' · `linkApply` '적용' · `linkRemove` '링크 지우기' · `linkCancel` '취소' · `linkInvalid` '사용할 수 없는 주소입니다.')                                                                                                                                                                                                                                                                           |
| W14 | `defineExpose({ editor })` — TipTap `Editor`(`ShallowRef`, 마운트 전 `undefined`). 테스트와 고급 소비자의 탈출구. README 에 "안정성 약속은 props · emit 까지, `editor` 는 TipTap 판을 따라 바뀔 수 있다"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| W15 | 색 · 타이포: `.ProseMirror` scoped CSS 에 Vuetify CSS 변수(배경 `surface` · 글자 `on-surface` · 선택 `primary` 0.2 · 테두리 `border-color`, 포커스 `primary`) — 다크는 변수라 자동(D6 의 `darkTheme` 판정 · Compartment 는 사라진다). 본문 타이포는 `MarkdownView` 와 같은 규칙(제목 · 목록 · 인용 · 코드 · 구분선 · 그림 `max-width:100%`). 선택된 노드(그림 · 구분선) `.ProseMirror-selectednode` 는 `primary` 외곽선. gapcursor 규칙 포함(`injectCSS: false`)                                                                                                                                                                                                                                                     |
| W16 | 3e 의 `LegalDocumentEditor` 기본 도움말 `editorHint` 를 WYSIWYG 에 맞게 바꾼다 — "Enter 는 새 문단, Shift+Enter 는 줄바꿈입니다. Markdown 원문을 직접 고치려면 「원문」으로 바꾸세요." 소비자가 `messages.editorHint` 를 덮었으면 그대로다(기본값만 바뀜 — changeset 에 적는다). `LegalDocumentEditor.vue` 소스는 바꾸지 않는다(문구는 `legal-document.ts`)                                                                                                                                                                                                                                                                                                                                                          |
| W17 | CRLF: marked · ProseMirror 가 개행을 `\n` 으로 정규화한다 — 첫 입력부터 LF(지금과 같다). 원문 textarea 는 브라우저가 `\n` 으로 준다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| W18 | 붙여넣기: HTML 은 ProseMirror `DOMParser`(스키마대로 — 원문 HTML 이 아니라 서식으로), 평문은 줄마다 문단(ProseMirror 기본). **평문으로 붙여넣은 Markdown 원문은 Markdown 으로 읽히지 않는다**(`@tiptap/markdown` 에 붙여넣기 처리가 없다) — 원문 탭에 붙여 넣는다(README). 줄머리 `1.` · `-` · `#` 는 ⑥ 이 글자로 지킨다                                                                                                                                                                                                                                                                                                                                                                                             |

### 2-3. 충실도 어댑터 (A — 보고문 ①~⑩, ringside 코드를 옮긴다)

파일 `packages/admin-ui/src/components/markdown/editor-markdown.ts`(Vue 무의존) · `editor-markdown-normalize.ts`(순수). 머리 주석에 정본 `ssworks-ringside apps/web/app/utils/editor-markdown.ts` · `editor-markdown-normalize.ts` 와 바꾼 점을 적는다.

| #   | 어댑터                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 킷에서 바꾼 점                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| A1  | ① `markedOptions: { gfm: true, breaks: true, tokenizer }` — `\n` 하나 = `hardBreak`(킷 `breaks:true`), 직렬화는 `  \n`. Shift+Enter = 줄바꿈 · Enter = 문단                                                                                                                                                                                                                                                                                            | 그대로                                                                                    |
| A2  | ② `KitFidelityTokenizer extends Tokenizer` — `html` · `tag` · `table` → `undefined`(글자 폴백), `del` 은 `~~` 만. 🔴 `markedOptions.tokenizer` 경로로만 먹는다(`marked.use()` 는 프로토타입 메서드를 무시). 🔴 `marked: new Marked()` 인스턴스 — 안 주면 `setOptions` 가 전역 `marked` 싱글턴을 오염시킨다. 편집기마다 새 인스턴스(Lexer 가 인스턴스에 options · rules 를 꽂는다)                                                                      | 그대로(함정 ①②)                                                                           |
| A3  | ③ StarterKit: `underline: false` · `link: { openOnClick: false }` · `trailingNode: false` · `document` · `paragraph` · `text` · `listItem` · `codeBlock` · **`code`** `: false`(아래 `.extend` 로 바꿔 끼움 — 같은 이름 확장이 둘이면 안 된다). 할 일 목록 · 멘션 없음. 제목 스키마 1~6. **`EditorCode = Code.extend({ excludes: 'code' })`** — 코드가 굵게 · 기울임 · 링크와 겹친다(markdown-it 과 같다)                                              | `code` 끄고 `EditorCode` 더함(결정 ⑤)                                                     |
| A4  | ④ `Image`(`@tiptap/extension-image` 기본 — `inline: false` · `allowBase64: false`) 그대로. 거르기 없음 · 입력 규칙 켬(결정 ②)                                                                                                                                                                                                                                                                                                                          | `MediaImage` 대신 기본 `Image`                                                            |
| A5  | ⑤ 링크 기본대로 + `openOnClick: false`. autolink 는 TipTap · 킷 linkify 둘 다 된다(`www.` 는 K12)                                                                                                                                                                                                                                                                                                                                                      | 그대로                                                                                    |
| A6  | ⑥ `EditorParagraph.renderMarkdown` — `this.parent` 출력을 줄마다 `escapeLineStart`: 줄머리(앞 공백 0~3) `1.` `1)` · `-` `+` · `#`~`######` · 줄바꿈 뒤 `===` `---` 는 첫 표지 글자를 `\` 로, 문단 첫 줄의 4칸 이상 들여쓰기(공백 · 탭)는 첫 글자를 `&#32;` · `&#9;` 로. 줄바꿈 뒤 줄의 앞 공백은 버린다. 빈 문단은 목록 밖(`ctx.level === 0`) `&nbsp;` · 목록 안 `""`                                                                                  | 그대로                                                                                    |
| A7  | ⑦ `EditorDocument.renderMarkdown` — 문서 끝 빈 문단만 `""`(떼고 `\n\n`). `EditorListItem.renderMarkdown` — 첫 자식 뒤 빈 문단은 적지 않음 · 빈 첫 문단 + 그림이면 그림을 표지 줄에(`- ![](…)`) · 빈 첫 문단 + 문단이면 빈 문단 버림                                                                                                                                                                                                                    | 그대로                                                                                    |
| A8  | ⑧ `EditorCodeBlock.renderMarkdown` — 펜스 = 본문의 가장 긴 백틱 줄 + 1(최소 3, 언어 유지)                                                                                                                                                                                                                                                                                                                                                              | 그대로                                                                                    |
| A9  | ⑨ `EditorParagraph.parseMarkdown` 관용 읽기 — `&nbsp;`(U+00A0)뿐이면 앞뒤 공백 · 줄바꿈이 붙어도 빈 문단, 줄머리(첫머리 · `hardBreak` 뒤) 앞 공백 · 탭 버림(첫 줄 들여쓰기 표지 `&#32;` · `&#9;` 는 둠). `EditorText.parseMarkdown` — 블록 `text` 토큰에 인라인 토큰이 있으면 `helpers.parseInline`(`@tiptap/extension-list` 3.32.0 번호 목록 토크나이저 버그 비켜 가기 — 끄면 안 된다)                                                                | 그대로                                                                                    |
| A10 | ⑩ `splitImagesOutOfTextblocks(json, textblocks)`(순수) + `ImageSplitOnParse`(`Extension`, `name: 'kitImageSplitOnParse'`, `priority: 50` — Markdown 확장(100)의 `onBeforeCreate` 뒤) 가 `editor.markdown.parse` 를 감싸고 첫 내용 JSON(`editor.options.content`)도 정규화 — 텍스트 블록(스키마 `isTextblock`) 안 그림을 앞 글 · 그림 · 뒤 글로, 홀로 선 인라인은 문단에, 목록 항목 첫 자식은 문단으로. `setContent` · `insertContent(At)` 가 다 거친다 | 이름만(`ring…` → `kit…`)                                                                  |
| A11 | `normalizeLinkHref(input)` — trim · 비면 null · 스킴 없으면 `https://` · 안쪽 공백(전각 포함) · `(` `)` · `<` `>` 는 퍼센트 인코딩(직렬화 `[글](주소)` 가 끊기지 않게). `openableLinkHref` 는 가져오지 않는다(열기 단추 없음)                                                                                                                                                                                                                          | `openableLinkHref` 뺌                                                                     |
| A12 | `createMarkdownEditorExtensions()` → `[Markdown.configure(markdownOptions()), StarterKit.configure(STARTER_KIT_OPTIONS), EditorCode, Image, EditorDocument, EditorParagraph, EditorText, EditorListItem, EditorCodeBlock, ImageSplitOnParse]` — 화면(`MarkdownEditor.vue`)과 시험 하니스가 **같은 함수**를 부른다(직렬화에 닿는 확장이 같아야 왕복 테스트가 편집기를 대변한다)                                                                         | ringside `editorExtensions()` 에서 Nuxt UI 미러링(HorizontalRule · 이미지 거르기)을 뺀 것 |
| A13 | 가져오지 않는 것: `isMediaImageSrc` · `MediaImage` · `editor-image-insert.ts`(업로드 — 킷에 없다) · `openableLinkHref`                                                                                                                                                                                                                                                                                                                                 |                                                                                           |

### 2-4. 알려진 차이(킷 — README 「알려진 한계」에 요약)

ringside K1~K22 중 킷 렌더에 그대로 해당하는 것: K1(이름 있는 엔티티 `&copy;` 는 글자) · K2(문단 가운데 홀로 선 블록 태그 줄은 문단을 가른다 — 킷은 `<br>`) · K3(`~~**x**~~` → `**~~x~~**`) · K4(`- [ ] x` → `- x`) · K6(문서 끝 빈 문단은 게시 안 함) · K7(옛 원고의 빈 줄 여럿은 `&nbsp;` 문단으로) · K8(느슨한 → 촘촘한 목록) · K9(기호 섞인 이웃 목록 → `-` 하나) · K10(줄바꿈 가로지르는 굵게는 줄마다) · K11(문단 끝 `  \n` 은 공백 둘) · K12(맨 `www.` 는 링크가 된다 — 렌더가 바뀌는 드문 경우) · K13(붙여넣은 HTML 링크 주소의 공백은 인코딩 안 함) · K14(첫 항목이 빈 글머리 목록) · K15(목록 안 빈 줄은 편집기에만) · K17 · K19 · K20. 그림이 든 원고: K16 · K18 · K21 · K22(링크 걸린 그림은 링크를 잃는다). **K5 는 해당 없음**(킷은 외부 · `data:` 그림도 보존 — `data:` 는 `allowBase64: false` 라 노드가 되지 않고 alt 글자가 남는다 → 킷 고유 차이 K5′ 로 고정). **표**는 편집기에 파이프 글자로 보이고 게시는 표(원문 보존). **코드와 겹친 서식**은 A3 으로 해결(차이 아님).

## 3. 공개 API

```ts
// MarkdownEditor.vue — props 넷은 그대로, 선택 둘 더함
defineProps<{
  modelValue: string
  readonly?: boolean // false
  label?: string // '본문'
  height?: string // '420px'
  /** 처음 보일 편집 방식. 기본 'wysiwyg'(서식). 'source' 는 Markdown 원문 textarea */
  defaultMode?: MarkdownEditorMode
  messages?: Partial<MarkdownEditorMessages>
}>()
defineEmits<{ 'update:modelValue': [value: string] }>() // Markdown 문자열. 서식 모드는 입력 뒤 200ms 안에(포커스를 잃으면 즉시), 원문 모드는 즉시
defineExpose<{ editor: Editor | undefined }>() // TipTap Editor — 마운트 뒤
```

```ts
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
  modeWysiwyg: string
  modeSource: string
  modeToggle: string
  toolbar: (label: string) => string
  linkTitle: string
  linkHref: string
  linkApply: string
  linkRemove: string
  linkCancel: string
  linkInvalid: string
}
export const DEFAULT_MARKDOWN_EDITOR_MESSAGES: Readonly<MarkdownEditorMessages> // 얼림
```

`index.ts` 더함: `MarkdownEditorMode` · `MarkdownEditorMessages` · `DEFAULT_MARKDOWN_EDITOR_MESSAGES`. 어댑터 · 하니스는 export 하지 않는다(결정 ④).

`LegalDocumentEditor` · `useLegalDocuments` · ringside `MarkdownSettingField` 는 무변경. 미리보기 칸은 둘 다 둔다(약관은 "관리자가 본 미리보기 = 사용자가 동의한 원문"의 보증, 운영 원칙은 서비스 렌더 확인).

## 4. 의존성

| 변경 | 패키지                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 뺌   | peer · dev `codemirror` · `@codemirror/state`, dev `@codemirror/commands`                                                                                                                                                                                                                                                                                                                                                                        |
| 더함 | peer(dev 도 같은 판) `@tiptap/core` · `@tiptap/pm` · `@tiptap/vue-3` · `@tiptap/starter-kit` · `@tiptap/markdown` · `@tiptap/extension-image` · `@tiptap/extension-code` · `@tiptap/extension-paragraph` · `@tiptap/extension-document` · `@tiptap/extension-code-block` · `@tiptap/extension-list` · `@tiptap/extension-text` **`3.32.0`(정확 판 — `^` 없음)** · `marked` `^17.0.6` · `@floating-ui/dom` `^1.0.0`(`@tiptap/vue-3` 의 필수 peer) |

- 🔴 TipTap 은 패키지끼리 정확 판 peer(`@tiptap/pm: 3.32.0`)다 — 소비자는 `@tiptap/*` 열둘을 **같은 판**으로 설치한다. 킷을 올릴 때 열둘을 함께 올리고 ringside 도 같은 판으로 맞춘다(ringside 웹이 3.32.0 핀 — 보고문).
- `marked` 는 `@tiptap/markdown` 의 의존(`^17.0.1`)이기도 하다 — `^17.0.6` 이면 한 복사본으로 dedupe 된다. 킷은 `Marked` · `Tokenizer` 를 직접 import 한다(`Tokenizer` 상속).
- `vite.config.ts` external: `/^codemirror$/` · `/^@codemirror\//` 빼고 `/^@tiptap\//` · `'marked'` · `/^@floating-ui\//` 더함.
- happy-dom: 지금 `^20.0.0`(20.14.6). 첫 Task 탐침에서 `Editor` 마운트가 안 되면 `^21`(ringside 는 21.0.2 에서 확인) — dev 만.
- admin-shared · admin-server: 코드 · peer 변경 없음(fixed 라 0.10.0 으로 번호만).
- 번들: `sideEffects` 에 `**/*.vue` 라 편집기는 지금처럼 모든 소비자 번들에 든다(CodeMirror ↔ TipTap 대체로 중립 — 보고문).

## 5. 파일

| 파일                                                                                                                               | 변경                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/admin-ui/src/components/markdown/editor-markdown.ts`                                                                     | 새 — A1~A3 · A5~A12(Vue 무의존)                                                                             |
| `packages/admin-ui/src/components/markdown/editor-markdown-normalize.ts`                                                           | 새 — A10 순수 함수                                                                                          |
| `packages/admin-ui/src/components/markdown/markdown-editor.ts`                                                                     | 새 — `MarkdownEditorMode` · `MarkdownEditorMessages` · `DEFAULT_MARKDOWN_EDITOR_MESSAGES` · `EMIT_DELAY_MS` |
| `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`                                                                     | 다시 쓴다 — W1~W18                                                                                          |
| `packages/admin-ui/src/components/markdown/MarkdownLinkDialog.vue`                                                                 | 새(내부) — W12                                                                                              |
| `packages/admin-ui/src/components/legal/legal-document.ts`                                                                         | `editorHint` 기본 문구(W16)                                                                                 |
| `packages/admin-ui/src/test/markdown-harness.ts`                                                                                   | 새 — 시험 하니스(§6 H) · 오라클 도우미(`sameRender` · `sameStructure` · `stableOver`)                       |
| `packages/admin-ui/src/components/markdown/editor-markdown.test.ts` · `editor-markdown-normalize.test.ts`                          | 새 — §6-1                                                                                                   |
| `packages/admin-ui/src/components/markdown/markdown-editor.render.test.ts`                                                         | 다시 쓴다 — §6-2                                                                                            |
| `packages/admin-ui/src/components/markdown/codemirror.render.test.ts`                                                              | 삭제                                                                                                        |
| `packages/admin-ui/src/components/legal/legal-document-editor.render.test.ts` · `src/composables/useLegalDocuments.render.test.ts` | 편집기 찾기 · 치기 도우미를 TipTap 으로(§6-3)                                                               |
| `packages/admin-ui/src/default-messages.test.ts`                                                                                   | `DEFAULT_MARKDOWN_EDITOR_MESSAGES` 추가                                                                     |
| `packages/admin-ui/src/index.ts`                                                                                                   | export 셋                                                                                                   |
| `packages/admin-ui/package.json` · `vite.config.ts`                                                                                | §4                                                                                                          |
| `packages/admin-ui/README.md`                                                                                                      | §7-2                                                                                                        |
| `.changeset/*.md`                                                                                                                  | admin-ui minor(§7-1)                                                                                        |
| `CLAUDE.md` · `docs/01-phase0.md` §8 · `docs/HANDOFF.md`                                                                           | §7-3                                                                                                        |
| `docs/verification/2026-11-01-admin-ui-wysiwyg-editor.md`                                                                          | §8                                                                                                          |
| 템플릿 `kim5257-project-template` `preset/admin`                                                                                   | §7-4                                                                                                        |

## 6. 테스트 계약

🔴 모든 편집기 테스트는 `// @vitest-environment happy-dom`(`@tiptap/core` `Editor` 는 `element: null` 이어도 `window` 를 요구한다). 🔴 `element: null` 편집기에는 플러그인이 없다(입력 규칙 · 붙여넣기 · 자동 링크 · history 는 마운트 때 붙는다) — 하니스는 happy-dom `<div>` 에 **마운트한** 편집기다. `MarkdownManager` 만 따로 쓰지 않는다(⑩ 은 편집기 인스턴스의 `parse` 를 감싼다).

**H. 하니스**(`src/test/markdown-harness.ts`) — `createMarkdownHarness(element)` → `{ roundTrip(md), fromHtml(html), pasteText(text), html(), editor, destroy() }`. 내용을 넣을 때마다 **`editor.state.doc.check()`**(오라클 ④). 오라클 도우미:

- ① `same(source)` — `renderMarkdown(roundTrip(source)) === renderMarkdown(source)` + 빈 출력 가드 + 멱등(`roundTrip(once) === once`) + ② 구조.
- ② `sameStructure(markdown)` — 편집기 `getHTML()` 과 `renderMarkdown(markdown)` 의 블록 구조 비교. 무시하는 것만: 속성(a `href` · img `src` `alt` · ol `start` 만 남김) · 공백(nbsp 포함) · ProseMirror 전용 모양(`ProseMirror-trailingBreak` · `div[data-type=horizontalRule]` → `<hr>`) · li 첫 `<p>` · 그림만 든 `<p>`. 표 사례만 끈다.
- ③ `stableOver(source, n = 4)` — 4번 왕복해 둘째 왕복부터 바이트가 같고 렌더가 첫 왕복과 같다.
- ④ `doc.check()` — 하니스가 넣을 때마다.

### 6-1. 어댑터 · 왕복 (`editor-markdown.test.ts` · `editor-markdown-normalize.test.ts`)

ringside 픽스처를 옮기되 미디어 전용은 뺀다. 묶음과 최소 건수:

- 문단 · 줄바꿈(①) 4 · 원문 HTML 은 글자(②) 7 · 이스케이프 글자 3 · 줄머리 이스케이프 보존(⑥) 8 · 취소선 `~~` 만 2 · 표 글자 보존 2(구조 끔) · 블록 서식 14 · 코드 펜스(⑧) 3 · 인라인 · 링크 7 · 코드와 겹친 서식(A3) 3 · 빈 문단(⑦) 7 · 셋째 오라클 중첩 목록(⑨) Markdown 7 + HTML 7 · 읽기 정규화(⑩) 사례 10 + 순수 함수 12 · 둘째 오라클 전용(글자 붙여넣기 `2026. 11. 7.` · `1.` · `-` · `#` · `앞<br>---` · 들여쓰기 · 맨 URL · 좋은 입력 대조) 6 · `escapeLineStart` 단위 20+ · `codeFence` 6 · `normalizeLinkHref` 10 · 알려진 차이(§2-4 — 기대 출력 고정) 18.
- 킷 고유: **그림 보존** — `![alt](https://example.com/a.png "제목")` 왕복 동일 · 붙여넣은 `<img src="https://…">` 노드 · `data:` 는 노드가 되지 않는다(K5′ 고정) · 친 `![x](https://…)` 가 입력 규칙으로 그림 노드가 되고 `doc.check()` 통과 · 직렬화 `![x](https://…)`(결정 ②).
- 🔴 함정 고정: `marked` 전역 싱글턴이 오염되지 않는다(하니스 둘을 만든 뒤 전역 `marked.defaults.breaks` 가 기본값 그대로) · 토크나이저가 옵션 경로로 먹는다(`<b>x</b>` 가 글자) · `trailingNode: false`(그림 · 구분선으로 끝나는 문서의 첫 왕복이 `+"\n\n"` 이 아니다).
- 어댑터를 하나씩 끄면 빨개지는 건수를 테스트 파일 머리 주석에 적는다(⑥ · ⑨ · ⑩ — 나중에 TipTap 을 올려 걷을 수 있는지 판단).

### 6-2. 편집기 (`markdown-editor.render.test.ts` — 다시 쓴다)

편집기는 `wrapper.vm.editor`(expose)로 얻고, 치기는 `editor.commands.insertContent` 또는 `view.dispatch(tr.insertText)` 뒤 **`editor.commands.blur()` 로 flush**(타이머 없이 결정적). 디바운스 자체는 실제 타이머 한 건으로 본다.

- 초기 `modelValue` 가 문서(`getMarkdown()` 동일) · 마운트 때 emit 없음(그림으로 끝나는 본문 포함 — `trailingNode: false`).
- 치고 blur → `update:modelValue` 한 번, 값은 Markdown 전체. 연속으로 두 번 친 뒤 230ms 기다리면 emit 한 번(디바운스 — 실제 타이머).
- 🔴 D4: 친 뒤 prop 교체 → 문서가 바뀌고 emit 없음 · `undoDepth(editor.state) === 0`(`@tiptap/pm/history`).
- 🔴 D3: 친 뒤 같은 값(우리가 emit 한 값)이 돌아오면 문서 객체(`editor.state.doc`)가 그대로다. 디바운스 중에 더 친 뒤 앞 emit 값이 돌아와도 치환하지 않는다(W4 — `lastEmitted`).
- readonly 켜고 끄면 `editor.isEditable` · `.ProseMirror[aria-readonly]` · 도구 막대 단추 `disabled` · textarea `readonly` 가 따라간다. 켤 때 대기 중 emit 이 flush 된다.
- label 이 `.ProseMirror` `aria-label` · 도구 막대 `aria-label`("… 서식") 이 되고 바꾸면 따라간다.
- height 가 바깥 틀 높이 · 루트 클래스 `markdown-editor`.
- 언마운트하면 `destroy` · 대기 중 emit 이 먼저 flush.
- 모드: 토글 「원문」 → textarea 가 보이고 값이 `modelValue` · 치면 즉시 emit · 「서식」으로 돌아오면 문서가 새 값(되돌리기 기록 0) · 건드리지 않고 왕복하면 emit 없음.
- 도구 막대: 글자 선택 뒤 굵게 → emit 에 `**…**` · 제목 2 → `## ` · 글머리 → `- ` · 되돌리기 → 전 값. 단추 `aria-label` 이 기본 문구 · `messages` 로 바뀐다.
- 링크 대화상자(`installVisualViewport()` 모듈 최상단): 선택 없음 → 단추 disabled · 선택 뒤 열기 → 주소 칸 빈 값 · `example.com` 적용 → `[글](https://example.com)` · 링크 위에서 열면 주소가 채워짐 · 지우기 → 링크 없음 · `javascript:alert(1)` → 닫히지 않고 「사용할 수 없는 주소입니다.」 · 브라우저 `prompt` 가 불리지 않는다(`vi.spyOn(window, 'prompt')`).
- `default-messages.test.ts`: `DEFAULT_MARKDOWN_EDITOR_MESSAGES` 가 index 에서 나오고 얼려 있다.

### 6-3. 약관 테스트 보정

`legal-document-editor.render.test.ts` · `useLegalDocuments.render.test.ts` 의 `.cm-content[aria-label]` · `EditorView.findFromDOM` 을 `.ProseMirror[aria-label]` + `wrapper.findComponent(MarkdownEditor).vm.editor` 로, 치기 도우미는 "문서 끝에 새 문단으로 글자 넣기 + blur". 기대 본문은 `'# 제1조\n본문'` → `'# 제1조\n\n본문'` 식으로 고친다(제목 뒤 Enter 는 문단). `editorHint` 기대 문구(W16). 그 밖의 단언은 그대로 — 흐름(`useLegalDocuments`)은 바뀌지 않았다는 증거.

## 7. 릴리스 · 문서

### 7-1. changeset

`@ssworks/admin-ui` **minor**(fixed 라 세 패키지 0.10.0). 첫 줄 — **쓰는 쪽이 할 일**:

```
pnpm remove codemirror @codemirror/state
pnpm add @tiptap/core@3.32.0 @tiptap/pm@3.32.0 @tiptap/vue-3@3.32.0 @tiptap/starter-kit@3.32.0 @tiptap/markdown@3.32.0 @tiptap/extension-image@3.32.0 @tiptap/extension-code@3.32.0 @tiptap/extension-paragraph@3.32.0 @tiptap/extension-document@3.32.0 @tiptap/extension-code-block@3.32.0 @tiptap/extension-list@3.32.0 @tiptap/extension-text@3.32.0 marked@^17.0.6 @floating-ui/dom@^1.0.0
```

이어서: 🔴 `@tiptap/*` 열둘은 같은 판 · `MarkdownEditor` 가 WYSIWYG + 원문 전환(props · emit 그대로, `defaultMode` · `messages` · `editor` expose 더함) · 🔴 emit 디바운스 200ms(포커스 잃으면 즉시 — 입력 직후 값을 재는 앱 테스트는 blur 뒤) · 첫 사용자 편집에서 본문 전체가 재직렬화돼 Markdown 표기가 바뀐다(렌더 같음 — 표기 보존은 원문 탭) · `LegalDocumentEditor` 기본 도움말 문구 변경 · README 「마크다운 편집기」.

### 7-2. README(admin-ui)

- 「Peer 의존」 표: CodeMirror 둘 → `@tiptap/*` 열둘(정확 판) · `marked` · `@floating-ui/dom`. 🔴 문단의 필수 peer 목록 갱신(CodeMirror 테마 문장 삭제).
- export 표: `MarkdownEditor` 설명(WYSIWYG + 원문 · `defaultMode` · `messages` · `editor`) · `MarkdownEditorMode` · `MarkdownEditorMessages` · `DEFAULT_MARKDOWN_EDITOR_MESSAGES`.
- 새 절 **「마크다운 편집기」**: 두 모드 · 도구 막대 · 키(Enter 문단 · Shift+Enter 줄바꿈 · 입력 규칙 `**` `# ` `- ` `> ` `` ` `` `---` · 목록 안 Tab 들여쓰기) · 링크 대화상자 · 그림(주소 치기 · 붙여넣기 — 업로드 없음) · emit 디바운스(앱 테스트는 blur) · 🔴 표기 변화(약관 "표기만 다른 새 판" — 원문 탭) · 붙여넣은 Markdown 원문은 원문 탭에 · 큰 본문(수십만 자는 원문 탭 권장) · 알려진 차이(§2-4 요약) · `editor` expose 의 안정성.
- 「약관」 절 「알려진 한계 · 수동 확인」: CodeMirror 문장 둘 → TipTap(개행 LF · 도움말 문구 · 한글 IME 는 사람 확인 — 데스크톱 · Android Chrome · iOS Safari · "편집기를 바꾸면 다시 본다" 가 이번이다).

### 7-3. 진행 문서

- `CLAUDE.md`: 진행표에 PR #3j 행 · 패키지 표의 admin-ui 성격 줄은 그대로 · 코드 규약 admin-ui 절에 한 줄("브라우저 `prompt` · `confirm` · `alert` 를 쓰지 않는다 — 대화상자는 `BaseDialog` · 확인 창").
- `docs/01-phase0.md` §8: PR #3j 줄.
- `docs/HANDOFF.md` 「PR #3j 가 넘긴 것(2026-11-01)」 — 입력 · 스펙 · 플랜 경로 · **ringside 적용법**(0.10.0 공개 하루 뒤: ① 카탈로그에서 codemirror 둘 빼고 `@tiptap/*` 열둘 3.32.0 + `marked` 17.0.6 + `@floating-ui/dom` ② `apps/admin/package.json` 같은 것 ③ CLAUDE.md 킷 절 peer 목록 · "he-tree · codemirror" 문장 ④ 상향 점검 목록의 `markdown.test.ts` · `render.test.ts` ⑤ `MarkdownSettingField` 무변경 — 입력 직후 값을 재는 테스트가 있으면 blur ⑥ 사람 브라우저 확인은 운영 원칙 폼) · **템플릿 세션 입력**(이번에 한 것과 남은 것 — §7-4) · **어댑터 export 는 나중**(넷째 패키지 후보 — ringside 웹이 복사본을 걷고 싶을 때 스펙을 연다) · 사람 확인(한글 IME 데스크톱 · Android Chrome · iOS Safari, 붙여넣기 — 스크린숏 · Word · 한글 문서, 도구 막대 클릭 뒤 포커스, 되돌리기 범위) · TipTap 3.32.0 버그 둘(번호 목록 토크나이저 · 글자 문단 속 그림 인라인 읽기 — 올릴 때 오라클 ③ · ④ 가 알려 준다, 보고는 ringside 가 정한다).

### 7-4. 템플릿 `preset/admin`(사용자 지시 — 함께 고친다, push 는 사람)

- 작업은 템플릿 저장소의 **worktree**(스크래치패드 아래)에서 — 지금 체크아웃(`preset/auth`)을 건드리지 않는다. 커밋 뒤 worktree 는 지우고 로컬 브랜치 `preset/admin` 만 남긴다.
- `packages/frontend/package.json`: `codemirror` · `@codemirror/state` 빼고 `@tiptap/*` 열둘 `3.32.0` · `marked` `^17.0.6` · `@floating-ui/dom` `^1.0.0` 더함. 킷 핀 `@ssworks/admin-shared` · `@ssworks/admin-ui` `0.5.0 → 0.10.0`, `packages/backend/package.json` 의 `@ssworks/admin-server` · `@ssworks/admin-shared` 도 `0.10.0`.
- `packages/frontend/vite.config.mts` `plugins` 에 `vuetifyLayerOrder()`(`import { vuetifyLayerOrder } from '@ssworks/admin-ui/vite'`) — 0.8.0 이상 핀이 요구하는 한 줄(「PR #3h 가 넘긴 것」). 그 밖의 밀린 입력(`64px` → `var(--v-layout-top, 64px)` · 감사 로그 · IP 페이지 · `useRoleEditor({ fullAccessOnly })` · 카탈로그 `fullAccessOnly`)은 **하지 않는다** — HANDOFF 에 남긴 그대로.
- 🔴 `pnpm-lock.yaml` 은 0.10.0 이 npm 에 공개된 뒤 사람이 `pnpm install` 로 갱신한다(지금은 해석되지 않는다). 그 전 확인은 §8 의 tarball 스모크로.
- `CLAUDE.md`(템플릿) 의 킷 peer 문장이 CodeMirror 를 말하면 고친다.

## 8. 검증

- `pnpm check` 초록(lint → typecheck → test → build → check:dts) · `pnpm format:check`.
- `changeset status`: admin-ui minor → 세 패키지 0.10.0, major 없음.
- `/smoke`(`%LOCALAPPDATA%\Temp\aksj`): 짧은 경로 · tarball(admin-shared · admin-ui) · 새 peer 열넷 설치 · `pnpm peers check` 경고 없음 · `vue-tsc --noEmit` · `vite build`. App.vue 가 `MarkdownEditor`(`defaultMode` · `messages`) · `LegalDocumentEditor` 를 쓴다.
- 템플릿 스모크: `preset/admin` 임시 clone 에 로컬 tarball 셋을 `overrides` 로 꽂아 `pnpm install` · frontend `typecheck` · `build`(lockfile 은 커밋하지 않는다).
- 실브라우저(이 세션의 Chrome 도구, 스모크 앱 `vite dev`): 도구 막대 단추마다 서식 → 미리보기(`MarkdownView`) 동일 · 링크 대화상자(prompt 없음 · Enter 적용 · 지우기 · 잘못된 주소 힌트) · 원문 ↔ 서식 전환(값 보존 · 원문에서 고친 것이 서식에 반영) · 글자 붙여넣기(`1.` · `-` · `#` 줄이 문단) · 되돌리기 · 다크 테마 색 · 콘솔 오류 없음 · 건드리지 않은 본문의 emit 없음(이탈 확인 없음). 한글 IME · 모바일은 사람.
- 성능 참고 측정(가능하면): 5만 자 문단 125개에서 키 입력 → 화면 갱신(디바운스로 직렬화가 키 경로에서 빠졌는지).
- 결과는 `docs/verification/2026-11-01-admin-ui-wysiwyg-editor.md`.

## 9. 리뷰 중점 (테스트가 못 잡는 것)

- W4 — `lastEmitted` 가 모든 경로(초기 · emit · 외부 · 원문 입력 · 모드 전환)에서 갱신되는지. 한 경로라도 빠지면 조합 중 치환(D3 위반)이나 외부 변경 무시가 생긴다.
- W5 — `view.updateState` 로 상태를 새로 만든 뒤 TipTap 의 vue-3 반응성(`isActive` 갱신 · `editor.state` getter)이 새 상태를 보는지. `setEditable` · `setOptions` 가 그 뒤에도 바르게 동작하는지.
- W3 — 디바운스 flush 가 빠지는 경로: 라우트 이탈로 언마운트되는 순간(이탈 확인 뒤) · 발행 단추 mousedown(blur → flush → 부모 갱신 → click 순서).
- A3 — `Code.extend({ excludes: 'code' })` 로 코드가 다른 마크와 겹칠 때 직렬화 순서(`**\`x\`**` vs `` `**x**` ``)가 markdown-it 렌더와 같은지(구조 오라클이 본다).
- 결정 ② — 입력 규칙이 만든 그림 노드가 문단 가운데서도 스키마에 맞는지(`doc.check()`).
- 접근성 — 도구 막대의 키보드 탐색(Tab 으로 편집기 → 도구 막대 → 토글), 토글 · 단추의 이름.

## 10. 비범위

- 어댑터 · 하니스 export(결정 ④ — 나중, 넷째 패키지) · 이미지 업로드 · 외부 이미지 거르기(ringside) · 표 편집 · 할 일 목록 · 밑줄 · 글자 색 · 선택 시 뜨는 막대(bubble) · 슬래시 명령 · 멘션 · 자동 저장.
- 렌더(`renderMarkdown`) 변경 · `useLegalDocuments` 흐름 변경 · "렌더 같으면 변경 없음" 판정.
- 템플릿의 밀린 입력(§7-4) · ringside 저장소 · TipTap 버그 보고(ringside 가 정한다) · Node 26.

## 11. 구현 중 정정 (2026-11-01)

- W1: `useEditor` + `EditorContent` 대신 `@tiptap/vue-3` `Editor` 를 호스트 `<div>` 에 직접 마운트한다(`v-show` 와 맞고 테스트가 동기적). vue-3 Editor 의 반응성(reactiveState)은 rAF 두 번 뒤 트리거되는 디바운스 ref 라 도구 막대는 `onTransaction` 카운터로 다시 그린다.
- W5: `view.updateState(EditorState.create(…))` 로 history 를 비우면 vue-3 Editor 가 비추는 state 가 낡아 다음 dispatch 가 옛 state 에 적용돼 history 가 되살아났다(실측) — `unregisterPlugin('history')` + `registerPlugin(history())` 공개 API 로 비운다.
- 결정 ② · A4: 기본 `Image` 의 `nodeInputRule` 은 블록 그림을 문단 가운데 넣을 때 친 마지막 글자 `)` 를 그림 뒤 새 문단에 남긴다(happy-dom · Chrome 둘 다) — `EditorImage` 가 입력 규칙만 바꿔 끼운다(`![…](…)` 글자 자리에 그림, 친 글자는 넣지 않음). 입력 규칙은 켠 채다.
- 소스에 ` ` 를 적으면 편집 도구가 글자(U+00A0)로 써 eslint `no-irregular-whitespace` 에 걸린다 — `String.fromCharCode(160)`.
- 템플릿(§7-4)은 로컬 tarball(0.9.0 + 3j) overrides 로 install · frontend typecheck · build 를 확인했다(lockfile 은 되돌림).
- 최종 리뷰(opus) 반영:
  - 결정 ③ · W3 · §3: 디바운스는 **첫 변경 즉시(leading) + 이어지는 변경 200ms 트레일링 + 최대 1초**로 — 순수 트레일링은 부모의 `isDirty` 가 버스트 동안 거짓이라 blur 없는 이탈(F5 · router.push)에서 확인 없이 떠났다. `flush()` 를 expose 하고 `beforeunload` · `pagehide` 에서 flush. leading emit 의 echo 는 `lastEmitted` 가 가리므로 D3 는 그대로다.
  - A3 · §2-4: `Code.extend({ excludes: 'code' })` 만으로는 코드 구간 **일부**에 걸린 마크(도구 막대로 코드 안에서 굵게 시작)를 `@tiptap/markdown` 이 코드 안 `**` · `<strong>` 원문 HTML 로 적어 렌더가 갈렸다 — `EditorCode` 의 `appendTransaction` 이 바뀐 텍스트 블록의 코드 구간마다 구간 전체를 덮지 않는 마크를 뗀다(Markdown 코드 스팬 안에는 서식이 없다). 테스트는 "편집 경로 오라클"(명령 뒤 편집기 구조 = 직렬화의 렌더)로.
  - W8 · §9 접근성: Vuetify 가 role · `aria-pressed` 를 달지 않아 모드 토글에 `role="group"` + 두 단추 `aria-pressed`, 토글형 도구는 `'true' | 'false'`, 동작형은 없음.
  - A4 캐럿: 그림 뒤가 문단이면 그 첫머리, 아니면 빈 문단(멀리 있는 목록 항목으로 튀지 않는다). A11: 같은 사이트 안 주소(`/` · `#` · `?` · `./`)에는 `https://` 를 붙이지 않는다. W5: history 재등록은 지금 걸린 플러그인의 spec 으로. W11: 원문에서 고쳤다 같은 값으로 되돌리면 문서 · 기록을 지킨다. W12: 조합 중 Enter 는 적용이 아니고 그림(NodeSelection)에는 링크 단추가 꺼진다. W15: `.ProseMirror-hideselection` · `font-variant-ligatures: none` · `pre { white-space: pre-wrap }`.
  - 하지 않은 것: 도구 막대 roving tabindex(APG — Tab 정지 14개, 선택 과제 → HANDOFF).
