# 검증 — admin-ui MarkdownEditor WYSIWYG (PR #3j, 2026-11-01)

스펙 `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md` §8 · 플랜 `docs/superpowers/plans/2026-11-01-admin-ui-wysiwyg-editor.md`.

## 1. 저장소

- 브랜치 `feat/admin-ui-wysiwyg-editor` · 끝 커밋 `(마지막 절에 적는다)`
- `pnpm check` 초록(lint → typecheck → test → build → check:dts) — admin-ui 1399 테스트(81 파일) · 워크스페이스 2293 테스트(172 파일)
- `pnpm format:check` 통과
- `changeset status --verbose` — minor: admin-ui → fixed 라 admin-shared · admin-server · admin-ui 모두 0.10.0, major 없음
- 어댑터를 끄면 빨개지는 건수(왕복 픽스처 189건 중): ⑥ 줄머리 이스케이프 28 · ⑨ 문단 관용 읽기 5 · ⑩ 읽기 정규화 22(`editor-markdown.test.ts` 머리)
- dist(`packages/admin-ui/dist/index.js`): `codemirror` 문자열 없음 · `@tiptap/*` · `marked` 는 external import 로 남음 · `@floating-ui` 는 킷이 직접 import 하지 않아 없음(peer 만)
- happy-dom 20.14.6 에서 TipTap `Editor` 가 마운트 · 포커스 · blur 된다(Task 1 탐침 — 21 로 올릴 필요 없었다)

## 2. 스모크(`$LOCALAPPDATA/Temp/aksj`)

- tarball: `ssworks-admin-shared-0.9.0.tgz` · `ssworks-admin-ui-0.9.0.tgz`(+3j, 0.10.0 예정분) · peer 열넷(`@tiptap/*` 열둘 3.32.0 · marked 17.0.6 · @floating-ui/dom 1.8.0) + vue 3.5.44 · vuetify 4.3.1 · vue-router 5.4.0 · pinia 4.1.0 · @vue/devtools-api 8.2.1 · he-tree · axios · zod
- `pnpm install` 깨끗 · `pnpm peers check` — "No peer dependency issues found"
- `vue-tsc --noEmit` 통과(App.vue 가 `MarkdownEditor`(`default-mode` · `messages` · `readonly`) · `MarkdownView` · `LegalDocumentEditor` · `DEFAULT_MARKDOWN_EDITOR_MESSAGES` · `MarkdownEditorMode` 타입 · `import * as kit` · `@ssworks/admin-ui/vite` 의 `vuetifyLayerOrder` 를 쓴다)
- `vite build` 통과(index 1,390 kB — mdi 폰트 · Vuetify 전체 · TipTap 포함, 경고만)

## 3. 템플릿 `preset/admin`(`kim5257-project-template`, 로컬 브랜치 — push 는 사람)

- worktree(`$LOCALAPPDATA/Temp/akt-admin`, 579c2b6 에서) → 커밋 `b12d263` "chore: 킷 0.10.0 — MarkdownEditor WYSIWYG peer(codemirror 둘 → @tiptap/* 열둘 · marked · @floating-ui/dom) · vuetifyLayerOrder" → worktree 삭제(로컬 브랜치 `preset/admin` 에 남음)
- 바꾼 것: `packages/frontend/package.json`(codemirror 둘 제거 · `@tiptap/*` 열둘 3.32.0 · marked `^17.0.6` · @floating-ui/dom `^1.8.0` · 킷 핀 0.5.0 → 0.10.0) · `packages/backend/package.json`(admin-server · admin-shared 0.10.0) · `packages/frontend/vite.config.mts`(`vuetifyLayerOrder()` 첫 플러그인). 템플릿 CLAUDE.md 는 codemirror 를 말하지 않아 그대로.
- 확인(로컬 tarball 0.9.0+3j 셋을 루트 `pnpm.overrides` 로 임시 지정 — 커밋 안 함): `pnpm install`(pnpm 10.33 — 템플릿 `packageManager`) 통과(기존 경고 하나뿐: `unplugin-fonts` 의 peer `vite@^2~^7` vs 8.0.2 — 이 PR 과 무관) · `pnpm --filter @project/frontend typecheck`(`vue-tsc --build --force`) exit 0 · `build-only`(`vite build`) exit 0. 그 뒤 `git checkout -- package.json pnpm-lock.yaml`.
- 🔴 `pnpm-lock.yaml` 은 0.10.0 공개 뒤 사람이 `pnpm install` 로 갱신한다(지금은 npm 에 없다).

## 4. 실브라우저(Google Chrome — Claude in Chrome, 스모크 앱 `vite dev` 5179, 2026-11-01)

| 항목                                                                    | 기대                                                     | 실제                                                                                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 마운트(구분선으로 끝나는 본문)                                          | emit 0 · 값 그대로                                       | emits 0 · 값 그대로(`\n\n` 안 붙음) · `.ProseMirror` role=textbox · aria-label=이용약관 본문                                                               |
| 제목 끝에 ' 추가' 타자(execCommand insertText)                          | 즉시는 emit 없음 · 200ms 뒤 값 · 미리보기 갱신            | 즉시 emits 0 · 350ms 뒤 emits 1 · 값 `# 제1조 (목적) 추가` · 미리보기 h1 동일                                                                             |
| 굵게 · 제목 2 · 번호 목록 · 구분선 단추                                 | 값에 `**` · `## ` · `1.` · `---` · 미리보기 같은 구조    | `**이 약관은 서비스 이용을 정한다.**` · `> ## 인용` · `1. 하나\n2. 둘` · 인용 끝 구분선 `> ---\n>\n> &nbsp;`(뒤 빈 문단) — 미리보기 strong · h2 · ol · hr 2 |
| 되돌리기                                                                | 구분선 전으로 · 다시 실행 켜짐                           | hr 1 · 다시 실행 enabled                                                                                                                                   |
| 링크: 선택 → 단추 → `example.com/a b` Enter                             | 닫힘 · `[…](https://example.com/a%20b)` · prompt 없음    | 닫힘 · 값 그대로 · 미리보기 href `https://example.com/a%20b` · `window.prompt/confirm/alert` 호출 0                                                        |
| 링크 위에서 다시 열기 · `javascript:alert(1)` 적용                      | 주소 채워짐 · 열린 채 「사용할 수 없는 주소입니다.」      | 주소 채워짐 · 열린 채 문구 · 값 그대로 · 취소로 닫힘                                                                                                       |
| 원문(Markdown) 전환 · textarea 고침 · 서식 복귀                         | 값 보존 · 즉시 emit · 문서 반영 · 되돌리기 비활성        | textarea 보임 · 값 같음 · 굵게 disabled · 서식 호스트 숨김 · 고치자 emit +1 · 서식 복귀 뒤 h1 「원문에서 고침」 · `1\. 번호 아님` 문단 · 되돌리기 disabled |
| 외부 변경 단추                                                          | 문서 치환 · emit 없음 · 되돌리기 비활성                  | h1 「바깥에서 바꾼 문서」 · emits 변화 없음 · 되돌리기 disabled                                                                                            |
| 테마 전환                                                               | 편집기 배경 · 글자색이 따라옴                            | 틀 배경 `rgb(255,255,255)` → `rgb(33,33,33)` · 글자 `rgb(0,0,0)` → `rgb(255,255,255)`                                                                      |
| 평문 붙여넣기(`2026. 11. 7.` · `1.` · `-` · `#` 줄)                      | 값 이스케이프 · 미리보기 문단                            | `2026\. 11. 7. UFC 322` · `1\. 존 존스…` · `\- 메인 이벤트` · `\# 기대 순위` — 미리보기 H1 P P P P P(목록 · 제목 없음)                                      |
| 실제 키: `A` Shift+Enter `B` Enter `C`                                  | `A  \nB\n\nC`                                            | `새 본문A  \nB\n\nC ` · 미리보기 `<br>`                                                                                                                    |
| 실제 키: ` ![x](https://cdn.example.com/a.png)`(기본 Image 입력 규칙)   | 그림 노드                                                | 그림 노드 + **`<p>)</p>` 꼬리**(TipTap nodeInputRule) → `EditorImage` 로 고침                                                                              |
| 실제 키: 같은 것(`EditorImage` 뒤, 재빌드 · 재설치)                     | 그림 노드 · 꼬리 없음 · 미리보기 img                     | 값 `… 정한다. \n\n![x](…)\n\n- 하나…` · img 1 · 꼬리 문단 없음 · 미리보기 img · emits 1 — 캐럿은 NodeSelection 이라 캐럿 이동을 더함(§5)                    |
| 실제 키: ` ![x](…)뒤글`(캐럿 이동 뒤, 재빌드 · 재설치 — 4402b92)       | 그림 뒤 글자 자리에서 타자가 이어진다 · 그림 안 지워짐    | img 1 · NodeSelection 아님 · `뒤글` 이 다음 텍스트 블록(첫 목록 항목 「뒤글하나」)에 들어감 · 값 `…정한다. \n\n![x](…)\n\n- 뒤글하나…` · 미리보기 img |
| 콘솔                                                                    | 오류 없음                                                | 오류 · 예외 없음(네 번 확인)                                                                                                                               |

## 5. 남은 것

- 그림 입력 규칙 뒤 캐럿은 그림 뒤 **첫 글자 자리**(다음 텍스트 블록의 첫머리 — ringside 넣기 도우미와 같은 선택)다. 그림 바로 뒤에 새 문단을 원하면 Enter 한 번(사람 확인에서 어색하면 빈 문단을 늘 만드는 쪽으로 바꾼다 — 가운데 빈 문단은 `&nbsp;` 로 렌더되는 대가가 있다).
- 한글 IME(데스크톱 Chrome · Android Chrome · iOS Safari) · 붙여넣기(스크린숏 · Word · 한글 문서) · 도구 막대 클릭 뒤 포커스 · 되돌리기 범위 — 사람 확인(HANDOFF 「PR #3j 가 넘긴 것」).
- 스모크 앱(`$LOCALAPPDATA/Temp/aksj`)은 남겨 두었다 — 사람 확인에 쓰고 지운다. `pnpm install` 이 `file:` tarball 을 lockfile 의 integrity 로 재사용하므로 tarball 을 다시 만들면 `pnpm-lock.yaml` 을 지우고 설치한다.
