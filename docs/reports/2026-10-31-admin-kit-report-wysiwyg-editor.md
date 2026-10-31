# admin-kit 요청 — `MarkdownEditor`를 WYSIWYG(TipTap 3 · Markdown 왕복)으로 (2026-10-31)

> **상태: 전달 가능(2026-11-01).** ringside 웹(p1d)의 같은 전환이 끝나(2026-10-31, `lane/p1d` — 11/3 `main` 병합 예정) 거기서 검증한 충실도 규칙 · 테스트 오라클 · 수치를 아래 "웹 구현에서 검증한 것"에 덧붙였다(사용자 결정 2026-10-31 — 웹 먼저). 사람이 이 파일을 admin-kit 프로젝트(`../ssworks-admin-kit`)의 `docs/reports/`에 같은 이름으로 복사해 전달한다(앞 보고 둘과 같은 방식 — 킷 HANDOFF "PR #3h · #3i 가 넘긴 것"). 반영된 킷 버전이 나오면 이 줄을 고친다(`2026-10-20-admin-kit-report-ugc-links.md`와 같은 방식). 아직 남은 관찰 하나(한글 IME — ringside 사람 확인 8.2)는 결과가 나오면 따로 알린다.

ringside(링사이드)가 킷 `@ssworks/admin-ui` 0.8.0의 `MarkdownEditor`(CodeMirror 6)를 서비스 설정 "전문가 운영 원칙" 폼에 쓰다 나온 것이다. 결함 보고가 아니라 **기능 요청**이다 — 운영자가 Markdown 문법 없이 쓰도록 편집기를 보이는 대로 쓰는(WYSIWYG) 방식으로 바꾸되 v-model은 지금처럼 Markdown 문자열로 둔다. ringside는 `node_modules`를 고치거나 킷 코드를 복사하지 않았고, 킷 규약(프로젝트마다 같아야 하는 것은 킷 — 복사 금지)대로 관리자 앱에 따로 만들지도 않았다.

## 무엇

- 지금: `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`는 CodeMirror 6 `basicSetup` + Vuetify 토큰 테마 + `lineWrapping`. props `modelValue` · `readonly` · `label` · `height`. 쓰는 곳은 킷 `LegalDocumentEditor`(약관 — 편집기 | `MarkdownView` 미리보기, 본문 상한 1,000,000자)와 ringside `apps/admin/src/components/settings/MarkdownSettingField.vue`(운영 원칙 — 편집기 | 서비스와 같은 렌더의 미리 보기, 20,000자).
- 요청: 같은 공개 API(props 넷 · `update:modelValue`)로 **WYSIWYG 편집기 + "원문(Markdown)" 전환**을 제공한다. 렌더(admin-shared `renderMarkdown` — markdown-it `html:false` · `linkify` · `breaks:true`)는 바꾸지 않는다.
- ringside는 같은 날 서비스 웹(Nuxt UI 4.11 `UEditor` — TipTap 3 + `@tiptap/markdown`)에도 같은 전환을 정했다(p1d spec `docs/superpowers/specs/2026-10-31-p1d-wysiwyg-editor-design.md`). 엔진 · 충실도 규칙을 맞추면 서비스 · 관리자가 같은 Markdown 표기를 낸다.

## 제안 (ringside 사용자 결정 2026-10-31 — 킷 spec에서 다시 정해도 된다)

| # | 항목 | 제안 |
|---|---|---|
| 1 | 엔진 | **TipTap 3 + `@tiptap/markdown`**(ProseMirror · marked). Vue 3 프레임워크 무관 헤드리스라 Vuetify 앱에 든다. v-model은 Markdown 문자열 그대로(`content-type="markdown"`과 같은 식 — `getMarkdown()` · `setContent(md)`) |
| 2 | 모드 | WYSIWYG 기본 + **"원문" 전환**(`VBtnToggle` "서식 \| 원문"). 원문은 **평문 `<textarea>`**(monospace, 같은 v-model) — 운영자는 Markdown에 익숙하고(axion · gise), 기존 원고를 그대로 붙여 넣거나 표기를 정확히 다듬을 자리와 IME · 충실도 문제의 탈출구가 필요하다. 전환은 값 변환 없음(v-model이 이미 Markdown) |
| 3 | CodeMirror | **뺀다** — 편집기 스택을 하나로. peer `codemirror` · `@codemirror/state` 제거 |
| 4 | 도구 막대 | `VBtn`(mdi 아이콘) 묶음: 굵게 · 기울임 · 취소선 \| 제목 2 · 3(약관은 "제1조" 구조 — H1은 문서 제목이라 뺌) \| 인용 · 글머리 · 번호 \| 링크(킷 `BaseDialog` + `VTextField` — 브라우저 `prompt` 없음) · 구분선 \| 되돌리기 · 다시. 코드 단추 없음. 선택 prop `toolbar?: false`로 숨김 |
| 5 | 충실도(서비스 웹과 같은 규칙) | ① `markedOptions.breaks: true`(킷 `breaks:true`와 맞춤 — 옛 원고의 줄 하나 바꿈이 붙지 않게; 직렬화는 `  \n`) ② 원문 HTML은 글자 — marked `Tokenizer` 상속으로 블록 `html` · 인라인 `tag` 토큰을 글자 토큰으로(인라인 html은 `@tiptap/markdown` 파서 안에 박혀 있어 TipTap 확장으로는 못 가로챈다 — ringside 확인) ③ 밑줄 · 할 일 목록 · 멘션 끔(렌더에 없다) ④ 이미지는 node로 보존만(올리기 UI 없음 — 킷에 업로드 개념이 없다. 외부 이미지 거르기는 ringside 몫이라 킷은 거르지 않는다) |
| 6 | 기존 설계 결정 | D3(받은 값과 지금 직렬화 값이 같으면 치환 안 함 — 한글 조합) 그대로. D4(외부 변경 — emit 없음 · 되돌리기 기록 비움)는 `setContent`만으로는 기록이 남아 Ctrl+Z가 앞 문서를 되살리니 **상태를 새로 만든다**(`view.updateState(EditorState.create({ doc, plugins }))` — history 초기화). D5(readonly)는 `setEditable(false)` + `aria-readonly`(선택 · 복사는 되고 CodeMirror 찾기 패널은 사라진다 — README 문구 고침). D6(테마)은 `.ProseMirror` scoped CSS + Vuetify CSS 변수(다크는 변수라 자동) |
| 7 | 공개 API | props 넷 유지 + 선택 props(`toolbar` · `defaultMode`), `defineExpose({ editor })`. `LegalDocumentEditor` · ringside `MarkdownSettingField`는 무변경 — 미리보기 칸은 둘 다 둔다(약관은 "관리자가 본 미리보기 = 사용자가 동의한 원문"의 보증, 운영 원칙은 서비스 렌더 + 이미지 알림) |
| 8 | peers | 빼기 2(`codemirror` · `@codemirror/state`), 더하기 7(`@tiptap/core` · `@tiptap/pm` · `@tiptap/vue-3` · `@tiptap/starter-kit` · `@tiptap/markdown` · `@tiptap/extension-image` · `@floating-ui/dom` — `@tiptap/vue-3`의 필수 peer). 🔴 TipTap은 패키지끼리 **정확 판** peer(`@tiptap/pm: 3.32.0`) — 소비자는 `@tiptap/*`를 같은 판으로. `vite.config` external에 `/^@tiptap\//` · `@floating-ui/dom`. changeset **minor**(0.x — 세 패키지 fixed), 첫 줄 "소비자가 할 일: `pnpm remove codemirror @codemirror/state && pnpm add @tiptap/…`". 템플릿 `preset/admin`도 같이 |
| 9 | 테스트 | render test 11건을 옮긴다(편집기는 `defineExpose`로). 라운드트립 픽스처(`@tiptap/markdown` `MarkdownManager` — DOM 없이 `parse` · `serialize`): `renderMarkdown(serialize(parse(md))) === renderMarkdown(md)`. 🔴 ProseMirror가 happy-dom 20에서 마운트되는가(Range · Selection · MutationObserver) — 플랜 첫 Task에서 탐침, 안 되면 그 파일만 `// @vitest-environment jsdom`. `/smoke`는 패킹 tarball + TipTap peers |

## 함께 본 것 · 위험

- **발행 본문 표기 변화** — 한 글자만 고쳐도 문서 전체가 재직렬화돼(이스케이프 `\*` · `&lt;` · `  \n` · 목록 들여쓰기) 옛 원고의 Markdown 표기가 바뀐다. 렌더 HTML은 같게 지키지만(9번 테스트), 약관은 append-only 발행이라 **"표기만 다른 새 판"**이 생길 수 있다 — 발행 확인 창 문구나 README 주의 한 줄. 운영 원칙(설정 값 · revision)은 덜 민감. 원문 전환(2번)이 "표기를 바꾸지 않고 고치기"의 길이다.
- **큰 본문 성능** — 입력마다 전체 문서를 `getMarkdown()`으로 직렬화(O(n)). 약관 상한 1,000,000자지만 실제 2~5만 자 — 10만 자 측정, 느리면 emit 디바운스(D3 조건 유지).
- 한글 IME는 happy-dom으로 재현할 수 없다(3e와 같음) — 사람 확인(데스크톱 · Android Chrome).
- 번들은 대체로 중립(CodeMirror ↔ TipTap 비슷). `sideEffects`에 `**/*.vue`라 편집기는 지금처럼 모든 소비자 번들에 든다.
- 소비자 넷(ringside · 템플릿 · 향후)이 peer 7개를 같은 판으로 맞춰야 한다.

## ringside가 지금 하는 것 · 받을 일

- 지금은 0.8.0 `MarkdownEditor`(CodeMirror)를 그대로 쓴다. 서비스 웹 전환(p1d)은 끝났고 그 결과(어댑터 규칙 · 오라클 · 수치)는 아래 절에 있다 — IME 관찰만 사람 확인 뒤 따로.
- 킷 새 판(0.10.0 예상 — 0.9.0은 2026-10-20에 나왔고 ringside는 아직 0.8.0)이 나오면 **공개 하루 뒤**(pnpm 12 `minimumReleaseAge`) 세 패키지를 함께 올리고 `pnpm-workspace.yaml` 카탈로그(codemirror 둘 빼기 · `@tiptap/*` 더하기 — web이 이미 핀한 3.32.0과 같은 판, 아래 "peers" 줄) · `apps/admin/package.json` · CLAUDE.md 킷 절(peer 목록 · "he-tree · codemirror" 문장 · 알려진 결함 재확인) · 상향 점검 목록(`kit-messages.test.ts` · `audit-catalog.test.ts` · `IP_SEED_RULES` · `render.test.ts` · `markdown.test.ts` · `banned-words.test.ts` · web `editor-markdown.test.ts`) · 13절 결정 · 15절 판을 고친다. 사람 브라우저 확인은 운영 원칙 폼 하나(약관 모듈은 켜지 않는다).

## 웹 구현에서 검증한 것 (2026-10-31 — 전달 판에 덧붙임)

ringside 서비스 웹이 같은 엔진(TipTap 3.32.0 + `@tiptap/markdown` 3.32.0 + marked 17.0.6, Nuxt UI 4.11 `UEditor`)으로 게시판 · 분석글 본문 편집기를 바꾸면서 확인한 것이다. 게시 렌더는 킷 `renderMarkdown`을 그대로 쓰는 `renderPublicMarkdown`(+ 이미지 거르기 · 링크 `rel`)이라 **아래 규칙은 킷 렌더에 대해 검증된 것**이다 — 이미지 거르기(④)만 ringside 몫이고 나머지는 킷에 그대로 해당한다. 코드는 ringside `apps/web/app/utils/editor-markdown.ts`(어댑터 전부 · 시험 하니스) · `editor-markdown-normalize.ts`(읽기 정규화, 순수 함수) · `editor-image-insert.ts`(그림 넣기 — 킷에 업로드가 없어 참고만) · 테스트 259건(`*.test.ts` 같은 폴더), 설계 근거는 spec `docs/superpowers/specs/2026-10-31-p1d-wysiwyg-editor-design.md` 머리 "구현 사실" · 4.2 · 8.1 · 9절. 11/3 병합 전에는 워크트리 `C:\workspace\ringside-lanes\p1d`, 뒤에는 `C:\workspace\ssworks-ringside` `main`. ringside 소유 코드라 킷이 가져가도 된다(금지는 킷 → ringside 복사뿐).

### 제안표를 고치는 것

- **5번 충실도 — 넷이 아니라 열이다.** 처음 넷(① `breaks` ② 원문 HTML 토크나이저 ③ 렌더에 없는 서식 끔 ④ 이미지)은 그대로 맞았고, 리뷰(헤드리스 탐침 · 4회 이상 왕복 · `doc.check()`)가 여섯을 더 찾았다. 하나라도 빼면 운영자가 보이는 대로 쓴 글이 게시에서 다르게 나오거나, 저장할수록 망가지거나, 다시 열어 고칠 때 던진다.

| # | 어댑터 | 왜 |
|---|---|---|
| ① | `markedOptions: { gfm: true, breaks: true }` — 직렬화는 `  \n` | 킷 `breaks:true`와 같게. Shift+Enter = 줄바꿈, Enter = 문단 |
| ② | marked `Tokenizer` 상속 — 블록 `html` · 인라인 `tag` · **`table`** · **`del`** 네 메서드를 덮는다(`html` · `tag` · `table` → `undefined`로 글자 폴백, `del`은 `~~`만) | 인라인 `tag`는 `@tiptap/markdown` 파서 안에 박혀 TipTap 확장으로 못 가로챈다. `table`: TipTap에 표 확장이 없어 토큰을 안 만들어야 파이프 글자가 원문 그대로 보존돼 게시가 표로 나온다(편집기에는 글자). `del`: marked gfm은 `~` 하나도 취소선인데 markdown-it은 `~~`만이다 — 계획에 없던 발견 |
| ③ | `underline: false` · 할 일 목록 · 멘션 끔. 제목 스키마는 1~6 그대로(옛 원고 보존), 도구만 2 · 3 | 그대로 |
| ④ | 이미지 — 킷은 보존만(거르지 않는다). 단 `Image`의 `![alt](src)` **입력 규칙은 `parseHTML` · `parseMarkdown`을 건너뛴다** — 거르기가 있는 쪽(ringside)은 꺼야 했다(`addInputRules() { return [] }`). 킷은 입력 규칙을 둘지 스스로 정한다(운영자가 그림 주소를 치는 유일한 길) | ringside 사실 |
| ⑤ | 링크 기본대로, `openOnClick: false` | 편집 중 클릭으로 떠나지 않는다 |
| ⑥ | **`Paragraph.extend` 줄머리 이스케이프** — `renderMarkdown`(직렬화) 출력을 줄마다 손질: 줄머리(앞 공백 0~3칸) `1.` `1)` · `-` `+` · `#`~`######` · 줄바꿈 뒤 `===` `---`는 첫 표지 글자를 `\`로, 문단 첫 줄의 4칸 이상 들여쓰기(공백 · 탭)는 첫 글자를 `&#32;` · `&#9;`로(`@tiptap/markdown`이 숫자 엔티티를 풀어 왕복이 같다). 줄바꿈 뒤 줄의 앞 공백은 버린다(CommonMark도 버린다) | `@tiptap/markdown`은 인라인 기호(`` \`*_[]~ ``)만 이스케이프한다 — 글자로 붙여넣은 `2026. 11. 7. UFC 322` · `1. 존 존스` · `- 메인` · `# 기대`가 게시에서 `<ol start="2026">` · 목록 · `<h1>`이 됐다. 약관은 "제1조" 식 글자 줄이 많아 특히 중요하다 |
| ⑦ | **빈 문단** — 목록 밖(문서 · 인용)의 빈 문단은 `&nbsp;`로 적고(기본 `Paragraph.parseMarkdown`이 빈 문단으로 되읽는다), 문서 끝 빈 문단만 `""`(`Document.extend` — 끝 문단을 떼고 구분자만), 목록 안 빈 문단은 `""` + `ListItem.extend`가 첫 자식 뒤 빈 문단을 적지 않는다(목록 안 빈 줄은 편집기에만 보인다 — K15) | 기본 직렬화는 빈 문단을 `""`로 적어 편집기의 빈 줄이 게시에서 사라졌다. 목록 안 `&nbsp;`는 TipTap 번호 목록 토크나이저(⑨)와 맞지 않아 글자로 되읽힌다 |
| ⑧ | `CodeBlock.extend` — 펜스 길이 = 본문의 가장 긴 백틱 줄 + 1(최소 3, 언어 유지) | 기본은 늘 ```라 본문에 ``` 줄이 있으면 일찍 닫힌다 |
| ⑨ | **중첩 목록 관용 읽기** — `Paragraph.parseMarkdown`: 원문이 `&nbsp;`(U+00A0)뿐이면 앞뒤 공백 · 줄바꿈이 붙어도 빈 문단, 줄머리(첫머리 · `hardBreak` 뒤) 앞 공백 · 탭 버림(첫 줄 들여쓰기 표지 `&#32;` · `&#9;`는 둔다). `Text.extend` — 블록 `text` 토큰에 인라인 토큰이 있으면 `helpers.parseInline`으로 읽는다 | `@tiptap/extension-list` 3.32.0 번호 목록 토크나이저 버그(아래 "TipTap 버그") — 중첩 항목 둘째 문단부터 저장마다 한 칸씩 들여써져 4번째 저장에 코드 블록, 5번째에 사라지고, 글머리 안 번호 항목 둘째 문단의 `&amp;` · `\*`가 저장마다 `&amp;amp;` · `\\\*`로 불어났다. 번호 목록 토크나이저를 끄는 건 안 된다(항목 안 인라인 서식이 깨진다) |
| ⑩ | **읽기 정규화** — 텍스트 블록(문단 · 제목 · 코드 블록) 안 그림 노드를 앞 글 · 그림 · 뒤 글로 가르고, 홀로 선 글자는 문단에 싸고, 목록 항목 첫 자식은 문단으로(순수 함수, ProseMirror JSON 입력 · 출력). `Extension`(priority 50 — Markdown 확장의 `onBeforeCreate` 뒤)이 그 편집기의 `editor.markdown.parse`를 감싸고 첫 내용(`editor.options.content`)도 정규화한다 — `setContent` · `insertContent(At)`(markdown)이 다 거친다. `ListItem.extend`가 빈 첫 문단 + 그림이면 그림을 표지 줄에(`- ![](…)`) 적는다 | `@tiptap/markdown`은 글자와 한 Markdown 문단 · 제목 · 목록 항목에 든 그림(`a\n![](…)` · `앞 ![](…) 뒤` · `## 제목 ![](…)` · `- a\n  ![](…)` · 연속 그림)을 **인라인**으로 읽어 스키마에 어긋난 문서를 만들고, TipTap은 `enableContentCheck: false`라 말없이 받는다. 그 문단을 고치는 순간(타자 · 굵게) `TransformError: Invalid content for node paragraph` — 브라우저에서는 글자가 사라지고 단추가 듣지 않는다. 그림이 든 옛 원고 전부가 해당한다 |

- **🔴 구현 함정 셋(제안표 어디에도 없던 것)**
  - `@tiptap/markdown`은 `markedInstance.setOptions(markedOptions)`를 불러 **전역 `marked` 싱글턴을 오염**시킨다 → 옵션에 `marked: new Marked()` 인스턴스를 준다(타입이 `typeof marked`라 캐스트 하나).
  - 토크나이저는 **`markedOptions.tokenizer`(Lexer 옵션 경로)로만** 먹는다 — `marked.use({ tokenizer })`는 프로토타입 메서드(클래스 상속)를 무시한다. 상속 대신 객체 리터럴로 덮어도 된다는 뜻이 아니라, 옵션 경로에 인스턴스를 넣으라는 뜻이다.
  - StarterKit 3의 **`TrailingNode`가 마운트 때 끝 블록 뒤에 빈 문단을 붙여** 값이 `+"\n\n"`로 바뀐다 → `trailingNode: false`. 안 끄면 D3("받은 값과 지금 직렬화 값이 같으면 치환 안 함")의 전제가 깨지고 건드리지 않은 원고가 더티로 보인다(ringside는 이탈 확인 창이 떴다). Gapcursor로 마지막 블록 뒤로 갈 수 있다.
- **8번 peers — 7이 아니라 더 많다.** web이 실제로 정확 판 3.32.0으로 핀한 것: `@tiptap/core` · `pm` · `starter-kit` · `markdown` · `extension-image` · **`extension-paragraph` · `extension-document` · `extension-code-block` · `extension-list` · `extension-text`**(어댑터 ⑥~⑩의 `.extend` 대상 — StarterKit이 설치는 하지만 import하려면 직접 선언) + **`marked` 17.0.6**(`Marked` 클래스 · `Tokenizer` 상속). 킷은 여기에 `@tiptap/vue-3`(+ `@floating-ui/dom`). web만 쓰는 `extension-code` · `extension-horizontal-rule`은 Nuxt UI 조립을 하니스가 따라 하느라 넣은 것이라 킷에는 필요 없다. StarterKit 옵션에서 `document` · `paragraph` · `text` · `listItem` · `codeBlock: false`로 끄고 `.extend`한 것을 `extensions`로 더한다(같은 이름 확장이 둘이면 안 된다). 소비자 "할 일"의 패키지 수가 그만큼 는다 — changeset 첫 줄에 정확히 적는다.
- **9번 테스트 — 탐침 결과와 오라클 넷.**
  - happy-dom 21.0.2에서 `Editor`가 마운트된다(jsdom 불필요). 🔴 `@tiptap/core` `Editor`는 `element: null`이어도 생성 때 `window`를 요구한다(`createDocument → elementFromString`) — 파일마다 `// @vitest-environment happy-dom`. 🔴 `element: null` 편집기에는 **플러그인이 없다**(TipTap은 마운트 때 더한다 — 입력 규칙 · 붙여넣기 · 자동 링크 · history) → happy-dom `<div>`에 마운트한 편집기로 시험한다. `MarkdownManager`만 따로 쓰는 "DOM 없이 parse · serialize"는 ⑩(편집기 인스턴스의 `parse`를 감싼다)을 못 거치니 편집기 통째로가 맞다.
  - 오라클 넷 — 첫째만으로는 세 번 틀렸다. ① **렌더 동일**: `renderMarkdown(serialize(parse(md))) === renderMarkdown(md)` + 멱등(두 번째 왕복 바이트 동일) + 빈 출력 가드. ② **구조**(최종 리뷰가 더함): 편집기 `getHTML()`과 `renderMarkdown(getMarkdown())`의 블록 구조가 같은가 — 편집기 문서 → 게시 쪽 구멍(⑥ ⑦ ⑧)은 ①이 못 본다(①은 Markdown에서 출발한다). 속성 · 공백 · ProseMirror 전용 모양만 무시. ③ **`stableOver(n = 4)`**(재리뷰가 더함): 4번 왕복해 둘째 왕복부터 바이트가 같고 렌더가 첫 왕복과 같은가 — 저장마다 쌓이는 변화(⑨ 들여쓰기 · 엔티티)는 두 번 왕복으론 안 보인다. ④ **`doc.check()`**(재재리뷰가 더함): 내용을 넣을 때마다(`setContent` · HTML · 붙여넣기 · 그림 넣기) — TipTap은 어긋난 문서를 말없이 받으므로(⑩) 이것 없이는 "다시 열어 고치면 던진다"를 테스트가 못 잡는다(정규화 전 5건이 이것으로만 빨개졌다).
  - 픽스처 모양: Markdown 왕복 54 · HTML(편집기에서 출발) 22 · 중첩 목록 Markdown 7 · HTML 7 · 옛 원고(그림 든 문단) 10 · 알려진 차이 22(기대 출력 고정). 어댑터를 하나씩 끄면 빨개지는 건수를 적어 두면(⑥ 22 · ⑨ 15 · ⑩ 5) 나중에 어댑터를 걷을 수 있는지 판단하기 쉽다.
- **6번 D3 · D4** — web은 Nuxt UI v-model이라 D4(외부 변경 — 상태 새로 만들기)는 검증하지 않았다. 제안 그대로 둔다. D3는 `trailingNode: false` 없이는 성립하지 않는다(위).
- **2번 원문 전환 · 4번 도구 막대** — web은 WYSIWYG만(원문 탭 없음, 사용자 결정 WE3)이라 "원문" 탭은 검증 밖이지만 **그대로 권한다**: 아래 "표기 변화" 때문에 약관에는 탈출구가 필요하다. 링크는 팝오버 · 대화상자(브라우저 `prompt` 금지 — Nuxt UI 기본 핸들러도 `prompt`였다) · `openOnClick: false` · 주소 칸은 **열 때만** 채운다(`selectionUpdate`에 동기화하면 열린 채 선택이 다시 매핑될 때 치던 주소가 지워졌다) · 적용 전 정규화(안쪽 공백 · 괄호 · 꺾쇠 퍼센트 인코딩, 스킴 없으면 `https://`) · "열기"는 http · https · mailto만 · 실패(`setLink` false)면 "사용할 수 없는 주소" 힌트.

### 표기 변화 — 약관 "표기만 다른 새 판"의 실제 목록

한 글자만 고쳐도 문서 전체가 재직렬화돼 Markdown 원문이 바뀐다(렌더는 같다). web이 확인한 변화: 인라인 기호 `\` 이스케이프(`\*` `\_` `\[` `\~`) · 줄머리 `\`(`1\.` `\-` `\#`, ⑥) · `<` `>` `&` → `&lt;` `&gt;` `&amp;` · 줄 하나 바꿈 → `  \n` · 목록 들여쓰기 2칸 · 목록 밖 빈 문단 → `&nbsp;`(⑦) · 느슨한 목록 → 촘촘한 목록(K8) · 기호 섞인 이웃 목록 → `-` 하나(K9) · `- [ ] x` → `- x`(K4) · `~~**x**~~` → `**~~x~~**`(K3) · 맨 `www.` 주소 → `[www.…](http://www.…)`(K12 — TipTap autolink는 잇고 킷 linkify는 잇지 않아 게시도 링크가 된다, 렌더가 바뀌는 드문 경우) · 펜스 길이(⑧) · 글자 문단 속 그림 → 따로 선 블록(⑩, `글\n![](…)` → `글\n\n![](…)` — 게시가 `<p>글<br><img></p>`에서 `<p>글</p><p><img></p>`로, K18). 알려진 차이 전체는 spec 9절 K1~K22 — 킷 렌더에 그대로 해당하는 것은 K1(이름 있는 엔티티 `&copy;`는 글자) · K2(문단 가운데 홀로 선 블록 태그 줄은 문단을 가른다) · K3 · K4 · K6(문서 끝 빈 문단은 게시하지 않음) · K7~K15 · K17 · K19 · K20, 그림이 든 원고에 K16 · K18 · K21 · K22(링크 걸린 그림은 링크를 잃는다 — 블록 그림에 마크를 둘 수 없다), K5(외부 그림 거르기)는 ringside만. 발행 확인 창 문구나 README 주의 한 줄(제안 "함께 본 것" 첫 줄)이 맞다.

### 성능 (데스크톱 Chrome — 키 하나당 입력 → 화면 갱신)

| 본문 | 키당 지연 | long task |
|---|---|---|
| 2만 자 · 문단 50개 | 2~85 ms | 75 ms |
| 5만 자 · 문단 125개 | 159~279 ms | — |
| 5만 자 · 한 문단 | 186~703 ms | 695 ms |

입력마다 `getMarkdown()` 전체 직렬화 + 화면 갱신이다. 약관 상한 1,000,000자면 **emit 디바운스(D3 조건 유지)가 거의 필수**이고, 그래도 수십만 자는 "원문" 탭으로 쓰는 게 맞다 — README에 적을 거리. ringside도 분석글 상한 5만 자에서 디바운스를 다음 spec 후보로 적었다.

### TipTap 3.32.0 버그 둘 (ringside가 보고 여부를 정한다 — 킷은 알고만 있으면 된다)

- `@tiptap/extension-list` OrderedList `markdownTokenizer`: `buildNestedStructure`가 중첩 항목의 둘째 문단부터 한 칸 어긋나게 lexer에 넘기고(`1. a\n   - b\n\n     c` → 저장마다 `c` 앞 공백 +1), 글머리 안 번호 항목의 둘째 문단부터는 블록 `text` 토큰으로 `parseListItems`에 보내 기본 `@tiptap/extension-text` `parseMarkdown`(`token.text` 원문 그대로 — 엔티티 · 백슬래시를 풀지 않는다)으로 읽힌다. 어댑터 ⑨로 비켜 간다.
- `@tiptap/markdown`이 글자 문단 · 제목 · 목록 항목 속 그림을 인라인으로 읽는다(`Paragraph.parseMarkdown`은 그림 한 장뿐인 문단만 따로 보고, `ListItem.parseMarkdown` · `parseListItems`는 `helpers.parseInline`을 바로 부른다). 어댑터 ⑩으로 비켜 간다.
- TipTap을 올릴 때 오라클 ③ · ④가 고쳐졌는지 · 어댑터를 걷어도 되는지 알려 준다. 킷이 올리면 ringside도 같은 판으로 맞춘다(peer 정확 판).

### 자동화로 못 본 것 (킷도 사람 확인)

한글 IME(Android Chrome · iOS Safari — 조합 중 외부 값 변경 · 조합 끝과 emit 타이밍), 붙여넣기(스크린숏 · 평문 `1.`/`-`/날짜 줄 · Word · 한글 문서에서 복사한 HTML), 도구 막대 클릭 뒤 포커스 복귀, 되돌리기 범위. ringside 사람 확인(spec 8.2)의 IME 관찰이 나오면 따로 알린다. 데스크톱 Chrome에서 자동화로 본 것(서식 · 입력 규칙 · 링크 · 올리기 → 게시 렌더 동일 · 다시 열어도 값 같음 · 붙여넣은 `1.`/`-`/`#`/날짜 줄이 게시에서도 문단 · 중첩 목록 안 그림 글을 세 번 저장해도 구조 불변 · 콘솔 오류 없음)은 통과했다.

### 선택 — 어댑터를 킷이 export하면 (킷이 정한다)

어댑터 ①~③ · ⑤~⑩과 오라클 넷은 프레임워크 무관(TipTap 확장 + marked `Tokenizer` + 순수 함수)이라 킷이 공개 export로 두면 ringside 웹이 자기 복사본을 걷고 쓸 수 있다(공개 렌더를 킷 `renderMarkdown` 하나로 모은 것과 같은 방향). 그렇게 하면 `@ssworks/admin-shared` 본체에 `@tiptap/*`을 들이지 말고 별도 엔트리(예: `@ssworks/admin-shared/editor`) 또는 새 패키지로 — admin-shared는 서버(admin-api · api · worker)도 import한다. 그림 거르기(④ `src` 판정 함수)와 그림 넣기(업로드)는 소비자 몫이라 옵션 · 훅으로 열어 둔다. 지금 요청의 범위는 아니다 — 킷 spec에서 "지금 · 나중 · 안 함"만 정해 주면 ringside가 맞춘다.

## 검토 기록

ringside `.superpowers/2026-10-31-admin-kit-wysiwyg-editor-review.md`(스크래치 — 후보 A · A′ · B · C 비교, K1~K11 상세). 이 보고문이 그 요약이다.
