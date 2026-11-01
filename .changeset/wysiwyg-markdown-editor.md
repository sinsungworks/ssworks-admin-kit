---
'@ssworks/admin-ui': minor
---

`MarkdownEditor` 를 WYSIWYG(TipTap 3 + `@tiptap/markdown`) + 「원문」 전환으로 바꿨다(PR #3j — `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md`). v-model 은 그대로 Markdown 문자열이고 props(`modelValue` · `readonly` · `label` · `height`)도 그대로라 `LegalDocumentEditor` · 앱 코드는 바뀌지 않는다.

**쓰는 쪽이 할 일:** CodeMirror peer 둘을 빼고 TipTap peer 를 **같은 판**으로 더한다.

```
pnpm remove codemirror @codemirror/state
pnpm add @tiptap/core@3.32.0 @tiptap/pm@3.32.0 @tiptap/vue-3@3.32.0 @tiptap/starter-kit@3.32.0 @tiptap/markdown@3.32.0 @tiptap/extension-image@3.32.0 @tiptap/extension-code@3.32.0 @tiptap/extension-paragraph@3.32.0 @tiptap/extension-document@3.32.0 @tiptap/extension-code-block@3.32.0 @tiptap/extension-list@3.32.0 @tiptap/extension-text@3.32.0 marked@^17.0.6 @floating-ui/dom@^1.0.0
```

- 🔴 `@tiptap/*` 열둘은 **정확 판 3.32.0** 으로 — TipTap 은 패키지끼리 정확 판 peer 다. 킷을 올릴 때 열둘을 함께 올린다.
- 편집기: 도구 막대(굵게 · 기울임 · 취소선 | 제목 2 · 3 | 인용 · 글머리 · 번호 | 링크 · 구분선 | 되돌리기 · 다시) · 「서식 | 원문」 토글(원문은 평문 textarea, 같은 값) · 링크 대화상자(`BaseDialog` — 브라우저 `prompt` 없음). 새 선택 props `defaultMode`(`'wysiwyg' | 'source'`) · `messages`(`MarkdownEditorMessages`, 기본 `DEFAULT_MARKDOWN_EDITOR_MESSAGES` export) · `defineExpose({ editor, flush })`. 링크 주소는 스킴이 없으면 `https://`(같은 사이트 안 `/` · `#` · `?` · `./` 는 그대로).
- 편집기에 보이는 것이 `renderMarkdown` 과 같아지게 어댑터 열(줄바꿈 `breaks` · 원문 HTML 은 글자 · 밑줄 없음 · 그림 보존 · 줄머리 이스케이프 · 빈 문단 `&nbsp;` · 코드 펜스 길이 · 중첩 목록 관용 읽기 · 글자 문단 속 그림 분리)을 둔다 — 왕복 테스트(렌더 동일 · 구조 · 4회 왕복 · `doc.check()`)가 지킨다.
- 🔴 `update:modelValue` 는 서식 모드에서 **첫 변경은 즉시, 이어지는 변경은 200ms 멈추면**(최대 1초마다) 나간다 — 더티 판정은 바로 서고, 마지막 글자들은 조금 늦을 수 있다. 포커스를 잃으면 · 원문 전환 · `readonly` · 언마운트 · `pagehide` 때 즉시. 라우트 가드 · 단축키 저장 앞에서는 expose 된 `flush()` 를 부른다. 입력 직후 값을 재는 앱 테스트는 편집 영역(`.ProseMirror`)에 `blur` 를 보내거나 `flush()` 한 뒤 잰다.
- 🔴 첫 사용자 편집에서 본문 전체가 다시 직렬화돼 Markdown 표기가 바뀐다(`\*` · `1\.` · `&lt;` · `  \n` · `&nbsp;` · 끝 개행 없음 …). 렌더는 같다. 표기를 지키며 고치려면 「원문」.
- `LegalDocumentEditor` 기본 도움말(`messages.editorHint`)이 "Enter 는 새 문단, Shift+Enter 는 줄바꿈입니다. Markdown 원문을 직접 고치려면 「원문」으로 바꾸세요." 로 바뀌었다 — 덮어 쓰는 앱은 그대로.
- README 「마크다운 편집기」(모드 · 키 · 표기 변화 · 붙여넣기 · 알려진 차이).
