# admin-ui 편집기 그림 첨부(PR #3k) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `MarkdownEditor` 에 그림 첨부를 넣는다 — 편집 중에는 브라우저 안(`blob:`)에만 두고 저장할 때 올려 주소를 바꾼 뒤 저장하는 레지스트리 `useImageAttachments`(문자열 · 배열 `commit` · `count` · `room`), 편집기의 그림 단추 · 파일 붙여넣기 · 끌어 놓기(서식 · 원문), `ApiClient.api.uploadFile`, 업로드 오류 문구(503 은 코드로), `useLegalDocuments.attachments` 배선까지(스펙 §2-4 C1 ~ C8 · §14 C9 ~ C14).

**Architecture:** 순수 규칙(`composables/image-attachments.ts` — 남은 칸 · 거르기 · 사유 묶음 · 치환)과 상태(`useImageAttachments` — 파일 ↔ `blob:` 대응표 · 저장 시점 commit · 되돌림)를 나누고, 편집기 쪽 넣기는 Vue 무의존 도우미(`components/markdown/editor-images.ts` — 그림 블록 넣기 · 원문 줄 넣기 · 클립보드 판정)로 뺀다. `MarkdownEditor` 는 prop `attachments` 하나로 그 둘을 잇고(붙여넣기 `handlePaste` · 끌어 놓기 `handleDOMEvents.drop` · 원문 textarea 이벤트 · 숨은 파일 입력), 약관은 `useLegalDocuments` 의 발행 action 을 `attachments.commit(초안, 발행)` 으로 감싼다. 업로드 실패 문구는 `api/upload-errors.ts` 표가 **같은 ApiError** 의 message 를 바꿔 전역 토스트가 그 문구를 띄운다.

**Tech Stack:** Vue 3.5 · Vuetify 4 · TipTap 3.32.0(`@tiptap/core` · `@tiptap/pm` · `@tiptap/vue-3`) · axios 1 · `@ssworks/admin-shared` 업로드 계약(0.11.0 부터) · vitest 5 + happy-dom 20 · TypeScript 6.0

**스펙:** `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` — §2-4 C1 ~ C8 · §4-3 · §5-1 · §5-2 · §6(admin-ui 행) · §8 admin-ui 파일 · §9-1 admin-ui · §9-3 · §10 · §12 위험 #6 · #7 · **§13(PR 2h 정정 — 503 문구는 코드로 · `LEGAL_UPLOAD_PURPOSE` · 413 은 `details.maxBytes`)** · **§14(C9 ~ C14 — sseng-home 요구)**. 어긋나면 스펙이 이기되, 이 플랜이 스펙을 정정하거나 스펙이 정하지 않아 정한 것은 「플랜이 정한 것」 표에 적었고 Task 7 이 스펙 §15 로 옮긴다. 정본(읽기만): `C:\workspace\ssworks-ringside` 의 `apps/web/app/utils/uploads.ts`(거르기 · 사유) · `upload-queue.ts`(차례 올리기) · `editor-image-insert.ts`(한 트랜잭션 넣기) · `components/ring/RingMarkdownEditor.vue`(붙여넣기 · 끌어 놓기). 앞 플랜 `docs/superpowers/plans/2026-11-01-admin-server-uploads.md`(PR 2h) · `2026-11-01-admin-ui-wysiwyg-editor.md`(#3j).

**구현자 규칙(모든 Task):** 테스트를 먼저 쓰고 **구현 전에 돌려 RED 를 보고서에 붙인다**(명령 · 실패 몇 줄). 그다음 구현 · GREEN · 커밋. 🔴 표시가 붙은 테스트는 구현 뒤 해당 줄을 일부러 되돌려 RED 를 한 번 더 보고 되돌린다. 리뷰어는 이 플랜의 그 Task 와 「Global Constraints」 · 「플랜이 정한 것」 을 먼저 다 읽고 리뷰한다. 이 플랜의 코드는 작성 때 저장소 밖 사본(gitignore 된 `packages/admin-ui/coverage/probe/ui` — 지웠다)에서 테스트 · vue-tsc · eslint · prettier · vite build 를 모두 통과한 것이다 — 그대로 옮기면 된다.

---

## 작성 때 확인한 것 (2026-11-11 — 워크트리 `feat/admin-ui-image-attachments` · bc5f238)

소스와 탐침(happy-dom 20 · 실제 vitest)으로 판정했다. 줄 번호는 bc5f238 기준.

| #   | 확인한 것                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 근거                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | admin-ui 에는 **오류 코드 → 문구 표가 없다**. 화면 문구는 `ApiError.message`(서버 문구) 그대로고, 전역 토스트는 앱의 `onError` 가 `toast.error(error.message)` 로 띄운다. 코드를 보는 곳은 `field-errors.ts` · `useWriteFlow.ts` · `useIpAccessRules.ts` 뿐 → 스펙 §8 의 `api/error-messages` 자리를 새 파일 `api/upload-errors.ts` 로 만든다                                                                                                                                                                        | `grep ERR_ packages/admin-ui/src` · README 「최소 배선」 `onError`                                                                                                                                       |
| K2  | 서버는 5xx 의 **문구만** 가린다 — `BusinessError` 503 은 `{ code: 'ERR_UPLOAD_UNAVAILABLE', message: '서버 내부 오류가 발생했습니다.' }`(details 도 뺀다). 4xx 는 서버 문구 · details 그대로(413 `details.maxBytes`)                                                                                                                                                                                                                                                                                                 | `admin-server/src/http/error-response.ts:31 · 110-123` · `uploads/errors.ts:7-61` · 탐침(503 응답 → `ApiError{status 503, code, message 가림}`)                                                          |
| K3  | `ApiError.message` 는 대입할 수 있다(`Error` 의 own property). 클라이언트는 `onError` 를 **한 매크로태스크 뒤** 같은 객체로 부른다 — 마이크로태스크 안에서 message · `handled` 를 바꾸면 토스트가 그것을 본다                                                                                                                                                                                                                                                                                                        | `api/client.ts:207-222` · `api/error.ts:9-34` · 탐침(대입 후 읽기)                                                                                                                                       |
| K4  | `useWriteFlow` 는 revision 충돌 · 칸 오류를 **동기로** `handled` 표시한다 — action 이 예외를 다시 던지기 전에 네트워크 왕복(되돌림 DELETE)을 기다리면 그사이 `onError` 가 먼저 돌아 같은 오류가 전역 토스트로도 뜬다 → commit 은 되돌림을 기다리지 않는다                                                                                                                                                                                                                                                            | `composables/useWriteFlow.ts:187-247`(`caught.handled = true` 201 · 220 · 227)                                                                                                                           |
| K5  | `createApiClient` 인스턴스 기본 `Content-Type: application/json`, 요청 인터셉터는 FormData 와 평범한 객체만 손댄다. happy-dom 의 `File` 은 toString 태그가 `[object Object]` 라 axios 기본 transformRequest 가 **JSON 으로 바꾼다**(탐침: 본문 `{"type":"image/png","lastModified":…}` · `application/json`). `transformRequest: [(d) => d]` + `Content-Type: file.type` 이면 파일 그대로 · `image/png`                                                                                                              | `api/client.ts:102 · 122-136` · 탐침                                                                                                                                                                     |
| K6  | `renderMarkdown` 은 `blob:` 그림을 통과시킨다(`<p><img src="blob:…" alt=""></p>`), `collectUploadKeys` 는 `blob:` 을 세지 않는다(`[]`), 편집기 왕복은 `![](blob:…)` 를 그대로 둔다(그림 노드 · `앞\n\n![](blob:…)\n\n뒤` 동일). #3j K5′ 의 `data:` 제외는 붙여넣은 **HTML** 에만 걸린다                                                                                                                                                                                                                              | 탐침 · `editor-markdown.test.ts:589-592`                                                                                                                                                                 |
| K7  | happy-dom 20: `URL.createObjectURL` · `revokeObjectURL` 있음(`blob:nodedata:<uuid>`) · `DataTransfer` + `items.add(file)` → `files` 찬다(`types` 는 `['image/png']` — `'Files'` 아님) · `ClipboardEvent` 의 `clipboardData` 받음 · **`DragEvent` 는 생성자의 `dataTransfer` · `clientX/Y` 를 버린다**(`defineProperty` 로 심으면 된다) · `input.files = dt.files` 대입 · `input.value = ''` 로 비움 · textarea `setSelectionRange` 됨 · 마운트한 편집기의 `view.posAtCoords` 는 던지지 않는다(`{ pos, inside: -1 }`) | 탐침(스펙 §12 위험 #6 — 스텁은 결정적 주소가 필요해서 둔다)                                                                                                                                              |
| K8  | ProseMirror 1.42.8 붙여넣기: 파일만 있어 slice 가 없어도 `handlePaste` 를 부르고, true 면 기본 동작을 막는다. 끌어 놓기: **`posAtCoords` 가 null 이면 `handleDrop` 을 부르지 않고 기본 동작도 막지 않는다**(→ 브라우저가 파일을 연다). `handleDOMEvents` 는 편집 불가여도 돈다, `editHandlers`(paste · drop) 는 편집 가능할 때만. dragover · dragenter 는 편집 가능하면 막는다                                                                                                                                       | `node_modules/.pnpm/prosemirror-view@1.42.8/.../dist/index.js` `doPaste` · `handleDrop` · `initInput` · `editHandlers.dragover` · 탐침(readonly 편집기: handlePaste 안 불림 · handleDOMEvents.drop 불림) |
| K9  | `MarkdownEditor` 의 `editorProps` 는 만들 때(163) · readonly 감시(207) · label 감시(213) 세 곳에서 `{ attributes }` 만 넘긴다 — 처리기를 더하면 세 곳이 같은 묶음을 넘겨야 한다(`viewProps()`) · `flush()`(112-116)는 대기 중일 때만 emit · 원문 textarea 는 `:value` + `@input`(455-463) · 도구 키 타입 `Exclude<…>`(235-247)                                                                                                                                                                                       | `components/markdown/MarkdownEditor.vue`                                                                                                                                                                 |
| K10 | `EditorImage` 입력 규칙의 캐럿 규칙(#3j A4)은 규칙 안 익명 함수(221-236)다 — 붙여넣기 · 끌어 놓기도 같은 규칙을 써야 하므로 `moveCaretAfterImage(tr)` 로 꺼낸다. 탐침: `insertContentAt` + 이 규칙을 한 `commands.command` 안에서 장마다 되풀이하면 트랜잭션 하나 · `doc.check()` 통과 · 결과 `본문\n\n![](u1)\n\n![](u2)\n\n`(끝 빈 문단 — K6 알려진 차이) · 문단 가운데 `앞\n\n![](u1)\n\n뒤`                                                                                                                      | `components/markdown/editor-markdown.ts:198-242` · 탐침                                                                                                                                                  |
| K11 | `useLegalDocuments.requestPublish`(321-363)는 확인 순간 기준 판(`baseNo`)을 검사한 **같은 틱**에 `current.value?.legalDocNo` 로 보낸다(347). 그림을 올리면 그 사이에 비동기 틈이 생겨 재조회가 current 를 바꿀 수 있다 → 확인한 `baseNo` 로 보낸다. 성공 뒤 `baseBody = sent`(359) — 재조회가 실패하면 초안에 해제된 `blob:` 이 남는다                                                                                                                                                                               | `composables/useLegalDocuments.ts`                                                                                                                                                                       |
| K12 | admin-shared 업로드 계약(0.11.0 부터): `UPLOAD_CONTENT_TYPES`(17) · `LEGAL_UPLOAD_PURPOSE = 'legal'`(23) · `DEFAULT_MEDIA_PATH`(28) · `UploadPolicy`(30) · `DEFAULT_UPLOAD_POLICY`(49 — `maxBytes 10_485_760` · `maxPerBody 20`) · `collectUploadKeys(markdown, mediaPath)`(82) · `AdminUploadCreated`(118 — `{ key, url, width, height, bytes }`) · `CommonErrorCodes.ERR_UPLOAD_*` 여섯. admin-ui peer 하한은 지금 `workspace:>=0.4.0 <1.0.0` → `>=0.11.0`(HANDOFF 「다음 플랜」)                                  | `admin-shared/src/uploads.ts` · `error-codes.ts:87-97` · `CHANGELOG.md` 0.11.0 · `admin-ui/package.json:46`                                                                                              |
| K13 | `peer-deps.test.ts` — 소스의 바깥 import 는 모두 필수 peer 여야 한다. 새 import 는 `@ssworks/admin-shared` · `@tiptap/pm`(`/view` · `/model`) · `@tiptap/core` 뿐 — 모두 이미 peer. `default-messages.test.ts` 는 공개 `DEFAULT_*` 를 목록으로 들고 얼림을 잰다 — 새 둘을 더한다                                                                                                                                                                                                                                     | `src/peer-deps.test.ts` · `src/default-messages.test.ts:8-18`                                                                                                                                            |
| K14 | 저장소 안에 실브라우저 확인용 앱이 **없다** — #3j 는 `$LOCALAPPDATA/Temp/aksj`(스모크 앱), 실서버 확인은 `aksv`/`akss`(2026-10-16 플랜 Task 1 레시피)를 저장소 밖에 만들었고 지금은 셋 다 없다. → Task 9 가 실서버(admin-server tarball + Docker MariaDB) + 확인용 웹(admin-ui tarball)을 `$LOCALAPPDATA/Temp/aksu` 에 새로 세운다                                                                                                                                                                                   | `ls $LOCALAPPDATA/Temp` · `docs/verification/2026-11-01-admin-ui-wysiwyg-editor.md` · `docs/superpowers/plans/2026-10-16-aksv-real-server.md`                                                            |
| K15 | admin-server README 663 절 첫 문단이 "admin-ui 쪽은 PR #3k — 아직 나오지 않았다" 고 적는다 — Task 7 이 고친다. `.changeset/README.md` 표의 admin-ui 하한(`>=0.4.0`)도                                                                                                                                                                                                                                                                                                                                                | `packages/admin-server/README.md:665` · `.changeset/README.md`                                                                                                                                           |

## 기준 수

작성 때 `pnpm --filter @ssworks/admin-ui test` → **81 파일 · 1414 테스트** 초록(2026-11-11 17:09). 워크스페이스 `pnpm test` → 185 파일 · 2405 테스트. admin-shared · admin-server 소스는 바꾸지 않는다(README 한 문단만) — 워크스페이스 끝 수는 189 파일 · 2477 테스트.

| Task | 더하는 것                                                                                    | 파일 | 테스트   |
| ---- | -------------------------------------------------------------------------------------------- | ---- | -------- |
| 기준 |                                                                                              | 81   | 1414     |
| 1    | `client.test.ts` +4 · 새 `upload-errors.test.ts` 6                                           | 82   | 1424     |
| 2    | 새 `image-attachments.test.ts` 8                                                             | 83   | 1432     |
| 3    | 새 `useImageAttachments.test.ts` 23(`it.each` 3 포함)                                        | 84   | 1455     |
| 4    | 새 `editor-images.test.ts` 13(`editor-markdown.test.ts` 198 은 그대로 초록)                  | 85   | 1468     |
| 5    | `markdown-editor.render.test.ts` 35 → 45(+10)                                                | 85   | 1478     |
| 6    | `useLegalDocuments.test.ts` 48 → 53(+5) · `legal-document-editor.render.test.ts` 35 → 36(+1) | 85   | 1484     |
| 7    | `default-messages.test.ts` 12 → 14(+2 — `it.each` 둘)                                        | 85   | **1486** |

수가 어긋나면 멈추고 무엇이 더 · 덜 돌았는지 보고한다(다른 파일이 깨졌을 수 있다).

## 플랜이 정한 것 (스펙과 다르거나 스펙이 정하지 않은 것 — Task 7 이 스펙 §15 로)

| #   | 정한 것                                                                                                                                                                                                                                                                                                                                         | 까닭                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **되돌림을 기다리지 않는다**(§5-2 의사 코드는 `await remove(key)` 뒤 다시 던짐) — remove 를 시작만 하고 원래 예외를 곧바로 다시 던진다. 되돌림 실패는 `ApiError.handled = true` 로 삼킨다                                                                                                                                                       | K3 · K4 — 기다리면 useWriteFlow 가 처리한 충돌 · 칸 오류가 전역 토스트로도 뜬다. 되돌림 404(저장 성공 · 응답 유실) 토스트도 막는다                                     |
| P2  | 오류 문구 표는 `api/upload-errors.ts`(`DEFAULT_UPLOAD_ERROR_MESSAGES` · `uploadErrorMessage` · `formatMegabytes`). commit 은 **업로드 단계**의 실패만 같은 ApiError 의 message 를 이 표로 바꾼다(여섯 코드 — 503 은 코드로, 413 은 `(장당 최대 10MB)` 를 붙여). 저장(save) 단계 오류는 손대지 않는다. 레지스트리 옵션 `errorMessages` 를 더한다 | K1 · K2 · K3 — 새 객체로 던지면 지연 onError 가 옛 객체(가린 문구)로 토스트를 띄운다. save 의 업로드 코드(첨부 409 · 404)는 4xx 라 서버 문구(앱이 덮은 것 포함)가 맞다 |
| P3  | 끌어 놓기는 `handleDrop` 이 아니라 `handleDOMEvents.drop`. `view.dragging`(편집기 안 끌기)은 ProseMirror 몫                                                                                                                                                                                                                                     | K8 — posAtCoords 가 null 이면 handleDrop 이 안 불리고 기본 동작이 살아 브라우저가 그림을 연다(초안 유실)                                                               |
| P4  | 붙여넣기는 **글자 없이 파일만** 올 때만 맡는다(스펙 "파일이 있을 때만")                                                                                                                                                                                                                                                                         | ringside 실측 — Word · 엑셀 · 웹 문서 복사는 글자와 함께 내용의 그림 한 장을 싣는다                                                                                    |
| P5  | 그림 단추는 **원문 모드에서도** 켜진다(캐럿 자리에 `![](blob:…)` 줄). 꺼지는 것은 readonly 뿐. 원문 끌어 놓기도 캐럿 자리. 원문 dragover 는 파일을 끌 때 막는다(`types` 의 `'Files'`)                                                                                                                                                           | 원문 붙여넣기 · 끌어 놓기가 이미 같은 넣기를 쓴다. 브라우저는 dragover 동안 `files` 를 비워 둔다                                                                       |
| P6  | 넣는 자리는 선택 **끝**(`selection.to`)이고 고른 글자를 지우지 않는다. 여러 장은 한 트랜잭션. 캐럿 규칙은 `moveCaretAfterImage` 로 꺼내 입력 규칙과 함께 쓴다. 넣은 뒤 편집기에 포커스                                                                                                                                                          | K10 · ringside 와 같다                                                                                                                                                 |
| P7  | 약관도 발행 성공 뒤 **초안 · 기준을 치환본으로** 바꾼다(§14 C14 는 "약관은 해당 없다") · 기준 판 번호는 확인한 `baseNo` 로 보낸다                                                                                                                                                                                                               | K11 — 재조회 실패 때 해제된 blob: 이 초안에 남는다 · 업로드가 만든 비동기 틈에 기준이 조용히 옮겨지면 409 없이 덮어쓴다                                                |
| P8  | 문구 모양: `rejectedType(count)` · `rejectedSize(count, maxBytes)` · `rejectedFull(count)` · `uploading(done, total)`. `rejectedFull` 은 한도 숫자가 없다                                                                                                                                                                                       | `room`(C9)을 쓰는 앱의 한도는 킷이 모른다                                                                                                                              |
| P9  | 재진입은 `Error('useImageAttachments: commit 이 이미 진행 중이다')` 로 거부 · dispose 뒤 `add` 는 `[]` · 진행 중 commit 은 시작 때 붙잡은 파일로 끝까지 · 남은 칸 `clampRoom`(0 이하 · NaN → 0, 소수 내림, Infinity 그대로)                                                                                                                     | 스펙이 정하지 않음                                                                                                                                                     |
| P10 | `uploadFile<T>(url, file: Blob, config?)` — 형식이 비면 `application/octet-stream`(서버 415), 호출자 headers 위에 Content-Type 을 덮는다                                                                                                                                                                                                        | K5                                                                                                                                                                     |
| P11 | 공개 이름 더함: `ImageAttachmentProgress` · `ImageAttachmentRejectReason` · `DEFAULT_UPLOAD_ERROR_MESSAGES` · `UploadErrorMessages` · `uploadErrorMessage` · `MarkdownEditorMessages.image`(「이미지 넣기」) · `LegalDocumentEditorBindings.attachments?`                                                                                       | 스펙 §4-3 의 "오류 문구 표" · 바인딩 통과                                                                                                                              |
| P12 | 편집 영역 밖(도구 막대 · 페이지)에 놓은 파일은 다루지 않는다(브라우저 기본) — README 에 적는다                                                                                                                                                                                                                                                  | 페이지 전역 문제 · 킷 범위 밖(위험으로 남긴다)                                                                                                                         |

## Global Constraints

- 저장소 규약(`CLAUDE.md` admin-ui 절): Vuetify 는 `vuetify/components` 명시 import · 순수 CSS `<style scoped>` · `console.log` 금지(`warn` · `error` 만) · 내부 상대 import 는 `.js` 확장자(`.vue` 는 그대로) · `import type` 분리(`verbatimModuleSyntax`) · 테스트 머리 `// @vitest-environment happy-dom`(DOM 이 필요할 때) · 오버레이 테스트는 `installVisualViewport()` 모듈 최상단 · 테스트 전용 `data-testid` 금지 · 브라우저 `prompt` · `confirm` · `alert` 금지 · `:loading` 은 `:disabled` 와 한 벌 · Boolean prop 에 `undefined` 기본값 금지(객체 prop 의 `undefined` 기본값은 `vue/require-default-prop` 때문에 둔다).
- prettier(세미콜론 없음 · 작은따옴표 · 100자 · `vueIndentScriptAndStyle`). 🔴 정규식에 백슬래시 문자 클래스(`\d` · `\s`)를 새로 쓰지 않는다 — Write/Edit 도구가 `\u` 꼴을 디코드한다. 이 플랜의 새 코드에는 없다(`[^A-Za-z0-9]` · `[^"]*` 로 적었다).
- 🔴 `packages/admin-shared` · `packages/admin-server` 의 **소스를 바꾸지 않는다**(admin-server README 한 문단만 — Task 7). 바꾸게 되면 멈추고 보고한다.
- 명령: 한 파일 `pnpm --filter @ssworks/admin-ui exec vitest run <경로>` · 패키지 `pnpm --filter @ssworks/admin-ui test` · 타입 `pnpm --filter @ssworks/admin-ui typecheck` · lint `pnpm exec eslint packages/admin-ui/src` · 모양 `pnpm exec prettier --check packages/admin-ui/src` (모두 저장소 루트에서). Windows · Git Bash — `> /dev/null` 금지(`NUL` 파일이 생긴다). 파일은 Write/Edit 도구로(셸로 쓰면 백슬래시가 깨진다).
- 커밋: 한국어 conventional(`feat(admin-ui): …`), 본문 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`. **push · PR · 병합 · 발행은 사람**(「사람이 할 일」).
- 이름(Task 사이에서 그대로 쓴다): `uploadErrorMessage(error, messages?)` · `formatMegabytes(bytes)` · `DEFAULT_UPLOAD_ERROR_MESSAGES` · `UploadErrorMessages`(Task 1) / `clampRoom` · `planAttachments` · `rejectionNotices` · `urlsInBodies` · `replaceUrls` · `DEFAULT_IMAGE_ATTACHMENT_MESSAGES` · `ImageAttachmentMessages` · `ImageAttachmentRejection` · `ImageAttachmentRejectReason` · `AttachmentPlan`(Task 2) / `useImageAttachments` · `UseImageAttachmentsOptions` · `ImageAttachments` · `ImageAttachmentProgress` · 시험 도구 `imageFile` · `stubObjectUrls` · `transferOf` · `pasteEvent` · `dragEvent`(Task 3) / `moveCaretAfterImage` · `filesOf` · `hasFiles` · `pastedFiles` · `insertImagesAt` · `sourceWithImages`(Task 4) / `MarkdownEditor` prop `attachments` · 내부 `viewProps` · `attachFiles`(Task 5) / `UseLegalDocumentsOptions.attachments` · `LegalDocumentEditorBindings.attachments`(Task 6).

## 파일 지도

| 파일                                                                 | 책임                                                                                                | Task  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----- |
| `packages/admin-ui/src/api/upload-errors.ts` (새)                    | ERR_UPLOAD_* 여섯의 화면 문구 · `uploadErrorMessage` · `formatMegabytes`                            | 1     |
| `packages/admin-ui/src/api/client.ts`                                | `api.uploadFile` — 원시 바이트 POST                                                                 | 1     |
| `packages/admin-ui/src/composables/image-attachments.ts` (새)        | 순수 규칙 — 남은 칸 · 거르기 · 사유 묶음 · 본문 속 등록 주소 · 치환 · 기본 문구                     | 2     |
| `packages/admin-ui/src/test/image-transfer.ts` (새)                  | 시험 도구 — 파일 · blob: 대역 · 붙여넣기 · 끌어 놓기 이벤트                                         | 3     |
| `packages/admin-ui/src/composables/useImageAttachments.ts` (새)      | 레지스트리 — add · commit(문자열 · 배열) · count · busy · progress · dispose · 되돌림 · 문구 바꾸기 | 3     |
| `packages/admin-ui/src/components/markdown/editor-markdown.ts`       | `moveCaretAfterImage` 꺼내기(입력 규칙이 쓴다)                                                      | 4     |
| `packages/admin-ui/src/components/markdown/editor-images.ts` (새)    | 편집기 넣기 도우미 — 클립보드 판정 · 그림 블록 넣기 · 원문 줄 넣기                                  | 4     |
| `packages/admin-ui/src/components/markdown/markdown-editor.ts`       | `messages.image`                                                                                    | 5     |
| `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`       | prop `attachments` · 그림 단추 · 숨은 파일 입력 · 붙여넣기 · 끌어 놓기 · 원문 이벤트 · add 앞 flush | 5     |
| `packages/admin-ui/src/composables/useLegalDocuments.ts`             | 옵션 `attachments` · 발행 = commit · 성공 뒤 초안 치환 · 바인딩                                     | 6     |
| `packages/admin-ui/src/components/legal/LegalDocumentEditor.vue`     | prop `attachments` 통과                                                                             | 6     |
| `packages/admin-ui/src/index.ts` · `default-messages.test.ts`        | 공개 API                                                                                            | 7     |
| `packages/admin-ui/package.json` · `.changeset/*` · README 들 · 문서 | peer 하한 · changeset · README · CLAUDE.md · phase0 §8 · HANDOFF · 스펙 §15                         | 7     |
| `docs/verification/2026-11-11-admin-ui-image-attachments.md` (새)    | 검증 기록(전체 검사 · 실브라우저)                                                                   | 8 · 9 |

---

<!-- prettier-ignore-start -->
<!-- 아래 Task 의 코드 조각은 넣을 자리의 들여쓰기(.vue <script> 2칸 등)를 그대로 지닌다 — prettier 가 마크다운 속 코드를 다시 쓰지 않게 -->

### Task 1: api 층 — `ApiClient.api.uploadFile` · 업로드 오류 문구 표

**Files:**

- Create: `packages/admin-ui/src/api/upload-errors.ts`
- Create: `packages/admin-ui/src/api/upload-errors.test.ts`
- Modify: `packages/admin-ui/src/api/client.ts:42-51`(인터페이스) · `:236-240`(구현)
- Modify: `packages/admin-ui/src/api/client.test.ts`(158행 `describe('ApiError 정규화 · onError'` 앞에 describe 하나)

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `packages/admin-ui/src/api/upload-errors.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { CommonErrorCodes } from '@ssworks/admin-shared'
import { ApiError } from './error.js'
import {
  DEFAULT_UPLOAD_ERROR_MESSAGES,
  formatMegabytes,
  uploadErrorMessage,
} from './upload-errors.js'

const apiError = (code: string | undefined, details?: unknown, message = '서버 문구') =>
  new ApiError(message, { status: 400, code, details, raw: null })

describe('formatMegabytes', () => {
  it('MiB 를 소수 한 자리까지 — 끝 0 없음', () => {
    expect(formatMegabytes(10_485_760)).toBe('10MB')
    expect(formatMegabytes(1_572_864)).toBe('1.5MB')
    expect(formatMegabytes(5_000_000)).toBe('4.8MB')
  })
})

describe('uploadErrorMessage(스펙 §6 · §13)', () => {
  it('4xx 다섯은 서버와 같은 기본 글자', () => {
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE))).toBe(
      '지원하지 않는 이미지 형식입니다. (JPG · PNG · WebP · GIF)',
    )
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE))).toBe(
      '이미지를 읽을 수 없습니다.',
    )
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_LIMIT))).toBe(
      '이미지 수가 한도를 넘었습니다.',
    )
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND))).toBe(
      '이미지를 찾을 수 없습니다.',
    )
  })

  it('🔴 503 은 서버가 가린 문구 대신 코드로 고른다', () => {
    const masked = new ApiError('서버 내부 오류가 발생했습니다.', {
      status: 503,
      code: CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
      raw: null,
    })
    expect(uploadErrorMessage(masked)).toBe(
      '이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
    )
  })

  it('🔴 413 은 details.maxBytes 를 붙이고, 없거나 이상하면 숫자 없이', () => {
    const tooLarge = (details?: unknown) =>
      uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_TOO_LARGE, details))
    expect(tooLarge({ maxBytes: 10_485_760 })).toBe('이미지가 너무 큽니다. (장당 최대 10MB)')
    expect(tooLarge()).toBe('이미지가 너무 큽니다.')
    expect(tooLarge({ maxBytes: '10MB' })).toBe('이미지가 너무 큽니다.')
    expect(tooLarge({ maxBytes: 0 })).toBe('이미지가 너무 큽니다.')
  })

  it('업로드 코드가 아니거나 ApiError 가 아니면 null — 서버 문구를 그대로 쓴다', () => {
    expect(uploadErrorMessage(apiError('ERR_COMMON_REVISION_CONFLICT'))).toBeNull()
    expect(uploadErrorMessage(apiError(undefined))).toBeNull()
    expect(uploadErrorMessage(new Error(CommonErrorCodes.ERR_UPLOAD_LIMIT))).toBeNull()
  })

  it('messages 로 일부만 덮는다', () => {
    const messages = { limit: '사진과 본문 그림은 합쳐 20장까지입니다.' }
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_LIMIT), messages)).toBe(
      '사진과 본문 그림은 합쳐 20장까지입니다.',
    )
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND), messages)).toBe(
      DEFAULT_UPLOAD_ERROR_MESSAGES.notFound,
    )
  })
})
```

- [ ] **Step 2: `client.test.ts` 에 describe 를 더한다** — `describe('ApiError 정규화 · onError', () => {`(158행) 바로 앞에:

```ts
describe('uploadFile — 원시 바이트 업로드(이미지 업로드 스펙 C6)', () => {
  const created = {
    key: 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
    url: '/api/media/legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
    width: 1,
    height: 1,
    bytes: 3,
  }

  it('파일을 그대로 POST — Content-Type 은 파일 형식, 쿼리 · 봉투는 평소대로', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ok(created))
    const file = new File(['abc'], 'a.png', { type: 'image/png' })
    const result = await client.api.uploadFile('/admin/uploads', file, {
      params: { purpose: 'legal' },
    })
    expect(result).toEqual(created)
    expect(seen[0]?.method).toBe('post')
    expect(seen[0]?.url).toBe('/admin/uploads')
    expect(seen[0]?.params).toEqual({ purpose: 'legal' })
    expect(seen[0]?.data).toBe(file)
    expect(String(seen[0]?.headers['Content-Type'])).toBe('image/png')
  })

  it('🔴 Blob 으로 못 알아보는 파일 객체도 JSON 으로 바뀌지 않는다(happy-dom 의 File 태그)', async () => {
    // axios 기본 transformRequest 는 toString 태그로 Blob 을 알아본다 — 태그가 다르면 평범한 객체로 읽어 JSON 으로 바꿨다
    class TaglessBlob extends Blob {
      get [Symbol.toStringTag]() {
        return 'Object'
      }
    }
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ok(created))
    const blob = new TaglessBlob(['abc'], { type: 'image/webp' })
    await client.api.uploadFile('/admin/uploads', blob)
    expect(seen[0]?.data).toBe(blob)
    expect(String(seen[0]?.headers['Content-Type'])).toBe('image/webp')
  })

  it('형식이 비면 application/octet-stream — 서버가 415 로 거른다', async () => {
    const client = createApiClient({ baseURL: '/api' })
    const seen = stub(client, () => ok(created))
    await client.api.uploadFile('/admin/uploads', new Blob(['abc']))
    expect(String(seen[0]?.headers['Content-Type'])).toBe('application/octet-stream')
  })

  it('실패는 다른 요청과 같다 — 코드 · details 를 품은 ApiError, onError 는 한 매크로태스크 뒤', async () => {
    const onError = vi.fn()
    const client = createApiClient({ baseURL: '/api', onError })
    stub(client, () => ({
      status: 413,
      body: {
        success: false,
        code: 'ERR_UPLOAD_TOO_LARGE',
        message: '이미지가 너무 큽니다.',
        details: { maxBytes: 10_485_760 },
      },
    }))
    const failure = client.api.uploadFile(
      '/admin/uploads',
      new File(['x'], 'a.gif', { type: 'image/gif' }),
    )
    await expect(failure).rejects.toMatchObject({
      status: 413,
      code: 'ERR_UPLOAD_TOO_LARGE',
      details: { maxBytes: 10_485_760 },
    })
    expect(onError).not.toHaveBeenCalled()
    await macrotask()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

```

- [ ] **Step 3: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/api/`
Expected: FAIL — `upload-errors.test.ts` 는 `Failed to resolve import "./upload-errors.js"`, `client.test.ts` 의 새 넷은 `client.api.uploadFile is not a function`. 기존 32 는 초록.

- [ ] **Step 4: 문구 표를 쓴다** — `packages/admin-ui/src/api/upload-errors.ts`

```ts
import { CommonErrorCodes } from '@ssworks/admin-shared'
import { ApiError } from './error.js'

// 업로드 오류 코드(ERR_UPLOAD_* 여섯)의 화면 문구 — 스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §6 표 · §13.
// 4xx 다섯의 기본 글자는 서버 `UPLOAD_MESSAGES`(admin-server uploads/errors.ts)와 같다.
// 🔴 503 `ERR_UPLOAD_UNAVAILABLE` 은 서버가 문구를 보내지 않는다 — 코어 필터가 5xx 본문을 「서버 내부 오류가 발생했습니다.」 로
//    가린다(코드는 남는다). 그래서 화면 문구는 코드로 고른다.
// 🔴 413 의 상한은 서버 문구에 없다 — `details.maxBytes` 로 오고 화면이 붙인다(정책이라 문구에 숫자를 박지 않는다).

export interface UploadErrorMessages {
  unsupportedType: string
  /** maxBytes — 서버 `details.maxBytes`(없으면 null) */
  tooLarge: (maxBytes: number | null) => string
  invalidImage: string
  limit: string
  notFound: string
  unavailable: string
}

const MEBIBYTE = 1_048_576

/** 바이트 → `10MB` · `1.5MB`(소수 한 자리까지 · 끝 0 없음) */
export function formatMegabytes(bytes: number): string {
  return `${Number((bytes / MEBIBYTE).toFixed(1))}MB`
}

/** 기본 문구 — 🔴 얼린다(앱이 펼쳐 일부만 덮는다) */
export const DEFAULT_UPLOAD_ERROR_MESSAGES: Readonly<UploadErrorMessages> =
  Object.freeze<UploadErrorMessages>({
    unsupportedType: '지원하지 않는 이미지 형식입니다. (JPG · PNG · WebP · GIF)',
    tooLarge: (maxBytes) =>
      maxBytes == null
        ? '이미지가 너무 큽니다.'
        : `이미지가 너무 큽니다. (장당 최대 ${formatMegabytes(maxBytes)})`,
    invalidImage: '이미지를 읽을 수 없습니다.',
    limit: '이미지 수가 한도를 넘었습니다.',
    notFound: '이미지를 찾을 수 없습니다.',
    unavailable: '이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
  })

function maxBytesOf(details: unknown): number | null {
  if (typeof details !== 'object' || details === null) return null
  const value = (details as { maxBytes?: unknown }).maxBytes
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** 업로드 오류의 화면 문구 — `ApiError` 이고 코드가 ERR_UPLOAD_* 여섯 중 하나일 때만. 그 밖은 null(서버 문구 그대로) */
export function uploadErrorMessage(
  error: unknown,
  messages: Partial<UploadErrorMessages> = {},
): string | null {
  if (!(error instanceof ApiError)) return null
  const text: UploadErrorMessages = { ...DEFAULT_UPLOAD_ERROR_MESSAGES, ...messages }
  switch (error.code) {
    case CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE:
      return text.unsupportedType
    case CommonErrorCodes.ERR_UPLOAD_TOO_LARGE:
      return text.tooLarge(maxBytesOf(error.details))
    case CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE:
      return text.invalidImage
    case CommonErrorCodes.ERR_UPLOAD_LIMIT:
      return text.limit
    case CommonErrorCodes.ERR_UPLOAD_NOT_FOUND:
      return text.notFound
    case CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE:
      return text.unavailable
    default:
      return null
  }
}
```

- [ ] **Step 5: `uploadFile` 을 더한다** — `packages/admin-ui/src/api/client.ts`

인터페이스 `ApiClient.api` 의 `del` 줄(50행) 바로 뒤에:

```ts
    /**
     * 파일 하나를 **원시 바이트**로 POST 한다(multipart 아님 — admin-server `POST /admin/uploads?purpose=`).
     * `Content-Type` 은 파일 형식. 응답 봉투 · bigint · 401 갱신 · `onError` 는 다른 요청과 같다.
     */
    uploadFile<T = unknown>(url: string, file: Blob, config?: AxiosRequestConfig): Promise<T>
```

구현의 `del: withBody('delete'),`(239행) 바로 뒤에:

```ts
      // 🔴 인스턴스 기본 `Content-Type: application/json` 이 남으면 서버가 415 다 — 파일 형식으로 덮는다. axios 기본
      //    transformRequest 는 Blob 으로 못 알아본 File(happy-dom — 태그가 `[object File]` 이 아니다)을 JSON 으로 바꿔
      //    바이트가 증발한다 — 그대로 넘긴다(스펙 C6). 요청 인터셉터의 bigint 코덱은 평범한 객체만 탄다.
      uploadFile: <T>(url: string, file: Blob, config?: AxiosRequestConfig) =>
        request<T>({
          ...config,
          url,
          method: 'post',
          data: file,
          transformRequest: [(data: unknown) => data],
          headers: { ...config?.headers, 'Content-Type': file.type || 'application/octet-stream' },
        }),
```

- [ ] **Step 6: GREEN · 타입**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/api/`
Expected: PASS — `client.test.ts` 36 · `field-errors.test.ts` 6 · `upload-errors.test.ts` 6(48).

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0.

- [ ] **Step 7: 🔴 RED 다시 보기** — `client.ts` 의 `transformRequest: [(data: unknown) => data],` 한 줄을 지우고 `pnpm --filter @ssworks/admin-ui exec vitest run src/api/client.test.ts` → `🔴 Blob 으로 못 알아보는 파일 객체도…` 하나만 FAIL(받은 data 가 `{}` JSON 글자). 줄을 되살리고 다시 PASS. `upload-errors.ts` 의 `ERR_UPLOAD_UNAVAILABLE` 갈래를 지우면 503 테스트가 FAIL — 되살린다.

- [ ] **Step 8: lint · 모양 · 커밋**

Run: `pnpm exec eslint packages/admin-ui/src/api && pnpm exec prettier --check packages/admin-ui/src/api`
Expected: 오류 · 경고 0.

```bash
git add packages/admin-ui/src/api/upload-errors.ts packages/admin-ui/src/api/upload-errors.test.ts packages/admin-ui/src/api/client.ts packages/admin-ui/src/api/client.test.ts
git commit -m "feat(admin-ui): ApiClient.uploadFile · 업로드 오류 문구 표(ERR_UPLOAD_* — 503 은 코드로 · 413 은 상한을 붙인다)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 순수 규칙 `composables/image-attachments.ts`

**Files:**

- Create: `packages/admin-ui/src/composables/image-attachments.ts`
- Create: `packages/admin-ui/src/composables/image-attachments.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `packages/admin-ui/src/composables/image-attachments.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMAGE_ATTACHMENT_MESSAGES,
  clampRoom,
  planAttachments,
  rejectionNotices,
  replaceUrls,
  urlsInBodies,
} from './image-attachments.js'

const MB = 1_048_576
const file = (name: string, type: string, size = 100) => ({ name, type, size })

describe('clampRoom(C1 · C9)', () => {
  it('0 이하 · NaN 은 0, 소수는 내림, Infinity 는 그대로', () => {
    expect(clampRoom(3)).toBe(3)
    expect(clampRoom(2.7)).toBe(2)
    expect(clampRoom(0)).toBe(0)
    expect(clampRoom(-4)).toBe(0)
    expect(clampRoom(Number.NaN)).toBe(0)
    expect(clampRoom(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('planAttachments — 형식 → 크기 → 칸(C1)', () => {
  it('받을 수 있는 넷(JPG · PNG · WebP · GIF)만 · 장당 상한 이하만 · 칸은 앞에서부터', () => {
    const files = [
      file('a.png', 'image/png'),
      file('b.svg', 'image/svg+xml'),
      file('c.jpg', 'image/jpeg', 11 * MB),
      file('d.webp', 'image/webp'),
      file('e.gif', 'image/gif'),
      file('f.heic', 'image/heic'),
    ]
    const plan = planAttachments(files, { room: 2, maxBytes: 10 * MB })
    expect(plan.accepted.map((f) => f.name)).toEqual(['a.png', 'd.webp'])
    expect(plan.rejected).toEqual({ type: 2, size: 1, full: 1 })
  })

  it('🔴 형식이 크기보다, 크기가 칸보다 먼저 — 큰 SVG 는 「형식」, 칸이 없어도 큰 PNG 는 「크기」', () => {
    const plan = planAttachments(
      [file('big.svg', 'image/svg+xml', 20 * MB), file('big.png', 'image/png', 20 * MB)],
      { room: 0, maxBytes: 10 * MB },
    )
    expect(plan.rejected).toEqual({ type: 1, size: 1, full: 0 })
  })

  it('상한과 같은 크기는 받는다 · 칸 0 이면 전부 full', () => {
    expect(
      planAttachments([file('a.png', 'image/png', 10 * MB)], { room: 1, maxBytes: 10 * MB })
        .accepted,
    ).toHaveLength(1)
    const full = planAttachments([file('a.png', 'image/png'), file('b.png', 'image/png')], {
      room: 0,
      maxBytes: 10 * MB,
    })
    expect(full).toEqual({ accepted: [], rejected: { type: 0, size: 0, full: 2 } })
  })
})

describe('rejectionNotices — 사유마다 하나', () => {
  it('형식 · 크기 · 칸 순서, 0 은 빠지고 문구에 장수 · 상한이 들어간다', () => {
    expect(
      rejectionNotices({ type: 2, size: 1, full: 3 }, DEFAULT_IMAGE_ATTACHMENT_MESSAGES, 10 * MB),
    ).toEqual([
      {
        reason: 'type',
        count: 2,
        message: '지원하지 않는 형식이라 2장을 넣지 않았습니다. (JPG · PNG · WebP · GIF)',
      },
      { reason: 'size', count: 1, message: '장당 최대 10MB를 넘어 1장을 넣지 않았습니다.' },
      { reason: 'full', count: 3, message: '이미지 수가 한도를 넘어 3장을 넣지 않았습니다.' },
    ])
    expect(
      rejectionNotices({ type: 0, size: 0, full: 1 }, DEFAULT_IMAGE_ATTACHMENT_MESSAGES, 10 * MB),
    ).toHaveLength(1)
    expect(
      rejectionNotices({ type: 0, size: 0, full: 0 }, DEFAULT_IMAGE_ATTACHMENT_MESSAGES, 10 * MB),
    ).toEqual([])
  })

  it('진행 문구', () => {
    expect(DEFAULT_IMAGE_ATTACHMENT_MESSAGES.uploading(1, 3)).toBe('이미지 올리는 중 (1/3)')
  })
})

describe('urlsInBodies · replaceUrls(C2 · C10 · C11)', () => {
  const A = 'blob:http://localhost/0b9c7a1e-2f3d-4c5b-8a6e-1f2d3c4b5a69'
  const B = 'blob:http://localhost/7d1e9c20-4b3a-4f6e-9a8b-2c3d4e5f6a7b'
  const C = 'blob:http://localhost/9e8d7c6b-5a49-4382-a170-6f5e4d3c2b1a'

  it('본문 어느 하나라도 품은 주소만 — 주어진(등록) 순서 그대로', () => {
    expect(urlsInBodies([A, B, C], [`![](${C})`, `글 ![](${A})`])).toEqual([A, C])
    expect(urlsInBodies([A, B], ['그림 없음'])).toEqual([])
    expect(urlsInBodies([A], [])).toEqual([])
  })

  it('같은 주소가 여러 번이면 모두 바꾼다 · 모르는 주소는 그대로', () => {
    const replacements = new Map([[A, '/api/media/legal/2026/11/a.webp']])
    expect(replaceUrls(`![](${A})\n\n![x](${A})\n\n![](${B})`, replacements)).toBe(
      `![](/api/media/legal/2026/11/a.webp)\n\n![x](/api/media/legal/2026/11/a.webp)\n\n![](${B})`,
    )
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/image-attachments.test.ts`
Expected: FAIL — `Failed to resolve import "./image-attachments.js"`.

- [ ] **Step 3: 구현한다** — `packages/admin-ui/src/composables/image-attachments.ts`

```ts
import { UPLOAD_CONTENT_TYPES } from '@ssworks/admin-shared'
import { formatMegabytes } from '../api/upload-errors.js'

// 편집기 그림 첨부의 순수 규칙(스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §2-4 C1 · C2 · §14 C9 ·
// C10) — 남은 칸 · 거르기(형식 → 크기 → 칸) · 사유 묶음 · 본문 속 등록 주소 · 주소 치환 · 기본 문구. 상태는 useImageAttachments.ts.
//
// 정본: ssworks-ringside apps/web/app/utils/uploads.ts(planUploads · rejectionNotices — 거르는 순서 · 사유마다 알림 하나)
// 바꾼 점:
//  - 고른 즉시 올리는 큐가 아니라 저장 시점 commit 이라 "올리는 중" 칸이 없다 — 남은 칸은 본문의 우리 키 + 본문 안 등록 blob(C1)
//    또는 앱이 센 room(C9).
//  - 사유 넷(형식 · 크기 · 줄이기 · 칸) → 셋 — 브라우저 줄이기는 비범위(스펙 §11, 서버가 줄인다).
//  - 문구는 토스트 제목 · 설명 둘이 아니라 한 문장 — 알림은 앱이 onRejected 로 띄운다(C5).

export type ImageAttachmentRejectReason = 'type' | 'size' | 'full'

/** 거른 파일 알림 — 사유마다 하나 */
export interface ImageAttachmentRejection {
  reason: ImageAttachmentRejectReason
  /** 그 사유로 넣지 않은 장수 */
  count: number
  message: string
}

export interface ImageAttachmentMessages {
  rejectedType: (count: number) => string
  /** maxBytes — 장당 상한(정책) */
  rejectedSize: (count: number, maxBytes: number) => string
  /** 🔴 본문 밖 그림과 합친 한도(room — C9)를 쓰는 앱은 덮는다 — 한도의 말은 앱의 말이다 */
  rejectedFull: (count: number) => string
  /** 저장 중 진행 — 앱이 `progress` 로 그릴 때 쓴다(킷 화면은 그리지 않는다) */
  uploading: (done: number, total: number) => string
}

/** 기본 문구 — 🔴 얼린다(앱이 펼쳐 일부만 덮는다) */
export const DEFAULT_IMAGE_ATTACHMENT_MESSAGES: Readonly<ImageAttachmentMessages> =
  Object.freeze<ImageAttachmentMessages>({
    rejectedType: (count) =>
      `지원하지 않는 형식이라 ${count}장을 넣지 않았습니다. (JPG · PNG · WebP · GIF)`,
    rejectedSize: (count, maxBytes) =>
      `장당 최대 ${formatMegabytes(maxBytes)}를 넘어 ${count}장을 넣지 않았습니다.`,
    rejectedFull: (count) => `이미지 수가 한도를 넘어 ${count}장을 넣지 않았습니다.`,
    uploading: (done, total) => `이미지 올리는 중 (${done}/${total})`,
  })

const ACCEPTED_TYPES: ReadonlySet<string> = new Set(UPLOAD_CONTENT_TYPES)
const REASON_ORDER: readonly ImageAttachmentRejectReason[] = ['type', 'size', 'full']

/** 남은 칸 — 0 이하 · NaN 은 0, 소수는 내림. Infinity 는 그대로(앱이 한도를 두지 않는다) */
export function clampRoom(room: number): number {
  return Number.isNaN(room) || room <= 0 ? 0 : Math.floor(room)
}

export interface AttachmentPlan<F> {
  /** 받아들인 것 — 고른 순서 그대로 */
  accepted: F[]
  /** 사유별 장수 */
  rejected: Record<ImageAttachmentRejectReason, number>
}

/** 형식 → 크기 → 칸 순서로 거른다(C1). 칸은 앞에서부터 채운다 — 뒤의 것이 `full` 이 된다 */
export function planAttachments<F extends { type: string; size: number }>(
  files: readonly F[],
  limits: { room: number; maxBytes: number },
): AttachmentPlan<F> {
  const plan: AttachmentPlan<F> = { accepted: [], rejected: { type: 0, size: 0, full: 0 } }
  let room = limits.room
  for (const file of files) {
    if (!ACCEPTED_TYPES.has(file.type)) plan.rejected.type += 1
    else if (file.size > limits.maxBytes) plan.rejected.size += 1
    else if (room <= 0) plan.rejected.full += 1
    else {
      plan.accepted.push(file)
      room -= 1
    }
  }
  return plan
}

/** 사유별 장수 → 알림(형식 · 크기 · 칸 순서, 0 은 뺀다) */
export function rejectionNotices(
  rejected: Readonly<Record<ImageAttachmentRejectReason, number>>,
  messages: ImageAttachmentMessages,
  maxBytes: number,
): ImageAttachmentRejection[] {
  return REASON_ORDER.flatMap((reason) => {
    const count = rejected[reason]
    if (count === 0) return []
    const message =
      reason === 'type'
        ? messages.rejectedType(count)
        : reason === 'size'
          ? messages.rejectedSize(count, maxBytes)
          : messages.rejectedFull(count)
    return [{ reason, count, message }]
  })
}

/**
 * 본문(들) 중 하나라도 품은 주소만 — 주어진 순서(등록 순서)를 지킨다(C2 · C10 · C11).
 * 🔴 문자열 포함 검사다 — blob: 주소는 UUID 라 다른 주소의 일부가 되지 않는다
 */
export function urlsInBodies(urls: Iterable<string>, bodies: readonly string[]): string[] {
  return [...urls].filter((url) => bodies.some((body) => body.includes(url)))
}

/** 본문의 주소를 모두 바꾼다(같은 주소가 여러 번이면 모두) */
export function replaceUrls(markdown: string, replacements: ReadonlyMap<string, string>): string {
  let out = markdown
  for (const [from, to] of replacements) out = out.split(from).join(to)
  return out
}
```

- [ ] **Step 4: GREEN · 타입**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/image-attachments.test.ts`
Expected: PASS(8).

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0.

- [ ] **Step 5: 🔴 RED 다시 보기** — `planAttachments` 의 첫 두 갈래 순서를 바꿔(크기를 형식보다 먼저) `🔴 형식이 크기보다…` 가 FAIL 하는 것을 보고 되돌린다.

- [ ] **Step 6: lint · 모양 · 커밋**

Run: `pnpm exec eslint packages/admin-ui/src/composables && pnpm exec prettier --check packages/admin-ui/src/composables`
Expected: 0.

```bash
git add packages/admin-ui/src/composables/image-attachments.ts packages/admin-ui/src/composables/image-attachments.test.ts
git commit -m "feat(admin-ui): 그림 첨부 순수 규칙 — 남은 칸 · 거르기 · 사유 묶음 · 치환(image-attachments)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 레지스트리 `useImageAttachments` · 시험 도구

**Files:**

- Create: `packages/admin-ui/src/test/image-transfer.ts`(시험 도구 — Task 4 · 5 · 6 도 쓴다)
- Create: `packages/admin-ui/src/composables/useImageAttachments.ts`
- Create: `packages/admin-ui/src/composables/useImageAttachments.test.ts`

- [ ] **Step 1: 시험 도구를 쓴다** — `packages/admin-ui/src/test/image-transfer.ts`(`src/test/**` 는 빌드 · d.ts · peer 검사에서 빠진다)

```ts
import { vi } from 'vitest'

// 그림 첨부 시험 도구 — 파일 · blob: 주소 대역 · 붙여넣기 · 끌어 놓기 이벤트. DataTransfer · ClipboardEvent · DragEvent 를 쓰는
// 테스트 파일은 머리에 `// @vitest-environment happy-dom` 을 단다(File · URL 은 Node 에도 있다).
// 🔴 happy-dom 20 의 DragEvent 는 생성자의 dataTransfer · clientX · clientY 를 받지 않는다(실측 2026-11-11) — dataTransfer 는
//    defineProperty 로 심고, 놓은 자리는 `view.posAtCoords` 를 spy 로 정한다. ClipboardEvent 의 clipboardData 는 받는다.

/** 이미지 파일 — 기본 PNG 4바이트 */
export function imageFile(name: string, size = 4, type = 'image/png'): File {
  return new File([new Uint8Array(size)], name, { type })
}

/**
 * `URL.createObjectURL` · `revokeObjectURL` 대역 — `blob:test/u001` 처럼 길이가 같은 결정적 주소를 낸다(실제 주소의 UUID 처럼 한 주소가
 * 다른 주소의 앞부분이 되지 않는다). 되돌리기는 `vi.restoreAllMocks()`
 */
export function stubObjectUrls(): { created: string[]; revoked: string[] } {
  const created: string[] = []
  const revoked: string[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:test/u${String(created.length + 1).padStart(3, '0')}`
    created.push(url)
    return url
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    revoked.push(url)
  })
  return { created, revoked }
}

/** 파일(과 글자)을 실은 DataTransfer */
export function transferOf(files: readonly File[], text = ''): DataTransfer {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  if (text !== '') transfer.setData('text/plain', text)
  return transfer
}

export function pasteEvent(files: readonly File[], text = ''): ClipboardEvent {
  return new ClipboardEvent('paste', {
    clipboardData: transferOf(files, text),
    bubbles: true,
    cancelable: true,
  })
}

/** drop · dragover — dataTransfer 를 심는다(머리 주석) */
export function dragEvent(type: 'drop' | 'dragover', files: readonly File[]): DragEvent {
  const event = new DragEvent(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: transferOf(files) })
  return event
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다** — `packages/admin-ui/src/composables/useImageAttachments.test.ts`(DOM 없음 — Node 의 `File` · `URL`)

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { CommonErrorCodes, type AdminUploadCreated } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { imageFile as png, stubObjectUrls } from '../test/image-transfer.js'
import { useImageAttachments, type UseImageAttachmentsOptions } from './useImageAttachments.js'

// DOM 없이 흐름만 잰다(Node 의 File · URL). blob: 주소는 결정적인 대역(stubObjectUrls)이다.

const MB = 1_048_576
const KEY_A = 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp'

let revoked: string[] = []

beforeEach(() => {
  revoked = stubObjectUrls().revoked
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 올린 결과 — 파일 이름으로 키를 만든다(이름은 영숫자 32자로 채운다) */
function createdFor(file: File): AdminUploadCreated {
  const id = file.name
    .replace(/[^A-Za-z0-9]/g, '')
    .padEnd(32, 'x')
    .slice(0, 32)
  const key = `legal/2026/11/${id}.webp`
  return { key, url: `/api/media/${key}`, width: 1, height: 1, bytes: file.size }
}

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

/** 기본 대역(upload · remove · onRejected)으로 만든다 — 덮은 어댑터는 테스트가 들고 있는 것을 잰다 */
function setup(overrides: Partial<UseImageAttachmentsOptions> = {}) {
  const uploaded: string[] = []
  const upload = vi.fn(async (file: File) => {
    uploaded.push(file.name)
    return createdFor(file)
  })
  const remove = vi.fn(async (_key: string): Promise<unknown> => undefined)
  const onRejected = vi.fn()
  const attachments = useImageAttachments({ upload, remove, onRejected, ...overrides })
  return { attachments, uploaded, upload, remove, onRejected }
}

describe('useImageAttachments — add(C1)', () => {
  it('받아들인 것의 blob: 주소를 고른 순서로 · 거른 것은 사유마다 onRejected 한 번', () => {
    const { attachments, onRejected } = setup()
    const urls = attachments.add(
      [
        png('a.png'),
        new File(['x'], 'b.svg', { type: 'image/svg+xml' }),
        png('c.png', 11 * MB),
        new File(['x'], 'd.gif', { type: 'image/gif' }),
        new File(['x'], 'e.txt', { type: 'text/plain' }),
      ],
      '',
    )
    expect(urls).toEqual(['blob:test/u001', 'blob:test/u002'])
    expect(onRejected.mock.calls).toEqual([
      [
        {
          reason: 'type',
          count: 2,
          message: '지원하지 않는 형식이라 2장을 넣지 않았습니다. (JPG · PNG · WebP · GIF)',
        },
      ],
      [{ reason: 'size', count: 1, message: '장당 최대 10MB를 넘어 1장을 넣지 않았습니다.' }],
    ])
  })

  it('남은 칸 = maxPerBody − 본문의 우리 키 − 본문 안 등록 blob − 이번에 앞서 받은 수', () => {
    const { attachments, onRejected } = setup({ policy: { maxPerBody: 3 } })
    const [first] = attachments.add([png('a.png')], '')
    const body = `![](/api/media/${KEY_A})\n\n![](${first})`
    expect(attachments.add([png('b.png'), png('c.png')], body)).toEqual(['blob:test/u002'])
    expect(onRejected).toHaveBeenLastCalledWith({
      reason: 'full',
      count: 1,
      message: '이미지 수가 한도를 넘어 1장을 넣지 않았습니다.',
    })
  })

  it('본문에서 지운 등록 그림은 칸을 쓰지 않는다 · 같은 그림이 두 번이어도 하나', () => {
    const { attachments } = setup({ policy: { maxPerBody: 2 } })
    const [a] = attachments.add([png('a.png')], '')
    attachments.add([png('b.png')], `![](${a})`)
    expect(attachments.add([png('c.png')], `![](${a})\n\n![](${a})`)).toHaveLength(1)
  })

  it('C9 — room 이 있으면 maxPerBody 셈 대신 쓰이고, 한 add 안에서 앞서 받은 수만큼 준다', () => {
    const room = vi.fn(() => 2)
    const { attachments, onRejected } = setup({ room, policy: { maxPerBody: 1 } })
    const body = `![](/api/media/${KEY_A})`
    expect(attachments.add([png('a.png'), png('b.png'), png('c.png')], body)).toHaveLength(2)
    expect(room).toHaveBeenCalledTimes(1)
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ reason: 'full', count: 1 }))
  })

  it.each([0, -1, Number.NaN])('C9 — room() 이 %s 면 전부 full', (value) => {
    const { attachments, onRejected } = setup({ room: () => value })
    expect(attachments.add([png('a.png'), png('b.png')], '')).toEqual([])
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ reason: 'full', count: 2 }))
  })

  it('policy.maxBytes · messages 를 따른다', () => {
    const { attachments, onRejected } = setup({
      policy: { maxBytes: 2 * MB },
      messages: { rejectedSize: (count, max) => `${count}장 · ${max}` },
    })
    attachments.add([png('a.png', 3 * MB)], '')
    expect(onRejected).toHaveBeenCalledWith({
      reason: 'size',
      count: 1,
      message: `1장 · ${2 * MB}`,
    })
  })
})

describe('useImageAttachments — count(C10)', () => {
  it('본문(들)에 남은 등록 주소의 수 — 같은 주소 둘 · 여러 본문은 하나, 미등록 blob 은 세지 않는다', () => {
    const { attachments } = setup()
    const [a, b] = attachments.add([png('a.png'), png('b.png')], '')
    expect(attachments.count(`![](${a})\n\n![](${a})`)).toBe(1)
    expect(attachments.count([`![](${a})`, `![](${a})\n\n![](${b})`])).toBe(2)
    expect(attachments.count('![](blob:test/u999)')).toBe(0)
    expect(attachments.count([])).toBe(0)
  })
})

describe('useImageAttachments — commit(C2)', () => {
  it('본문에 남은 등록 주소만 등록 순서로 올려 모두 치환한 본문으로 save — 성공 뒤 그 주소만 해제', async () => {
    const { attachments, uploaded } = setup()
    const [a, b, gone] = attachments.add([png('a.png'), png('b.png'), png('gone.png')], '')
    const save = vi.fn(async (final: string) => `saved:${final.length}`)
    const draft = `![](${b})\n\n글\n\n![](${a})\n\n![](${b})`
    const result = await attachments.commit(draft, save)
    expect(uploaded).toEqual(['a.png', 'b.png'])
    const urlA = createdFor(png('a.png')).url
    const urlB = createdFor(png('b.png')).url
    expect(save).toHaveBeenCalledWith(`![](${urlB})\n\n글\n\n![](${urlA})\n\n![](${urlB})`)
    expect(result).toBe(`saved:${save.mock.calls[0]![0].length}`)
    expect(revoked).toEqual([a, b])
    expect(attachments.count([`![](${a})`, `![](${b})`, `![](${gone})`])).toBe(1)
  })

  it('C8 — 등록은 본문과 무관하다: 본문에 없던 그림은 올라가지 않고, 되돌려 다시 넣으면 다음 저장에 올라간다', async () => {
    const { attachments, uploaded } = setup()
    const [a] = attachments.add([png('a.png')], '')
    await attachments.commit('그림을 지운 본문', async () => undefined)
    expect(uploaded).toEqual([])
    await attachments.commit(`![](${a})`, async () => undefined)
    expect(uploaded).toEqual(['a.png'])
  })

  it('업로드 n장째 실패 → 앞서 올린 키만 remove · 원래 예외를 다시 던진다 · save 없음 · 등록은 그대로', async () => {
    const failure = new ApiError('x', { status: 400, code: 'ERR_X', raw: null })
    const upload = vi.fn(async (file: File) => {
      if (file.name === 'b.png') throw failure
      return createdFor(file)
    })
    const { attachments, remove } = setup({ upload })
    const [a, b, c] = attachments.add([png('a.png'), png('b.png'), png('c.png')], '')
    const save = vi.fn(async () => undefined)
    const draft = `![](${a})\n\n![](${b})\n\n![](${c})`
    await expect(attachments.commit(draft, save)).rejects.toBe(failure)
    expect(upload).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(createdFor(png('a.png')).key)
    expect(revoked).toEqual([])
    expect(attachments.count(draft)).toBe(3)
  })

  it('save 실패 → 올린 키 모두 remove · 원래 예외 · 다시 저장하면 전부 다시 올린다', async () => {
    const conflict = new ApiError('다른 관리자가 먼저 발행했습니다.', {
      status: 409,
      code: 'ERR_COMMON_REVISION_CONFLICT',
      raw: null,
    })
    const { attachments, remove, uploaded } = setup()
    const [a, b] = attachments.add([png('a.png'), png('b.png')], '')
    const draft = `![](${a})\n\n![](${b})`
    await expect(attachments.commit(draft, async () => Promise.reject(conflict))).rejects.toBe(
      conflict,
    )
    expect(remove.mock.calls).toEqual([
      [createdFor(png('a.png')).key],
      [createdFor(png('b.png')).key],
    ])
    expect(conflict.message).toBe('다른 관리자가 먼저 발행했습니다.')
    await attachments.commit(draft, async () => undefined)
    expect(uploaded).toEqual(['a.png', 'b.png', 'a.png', 'b.png'])
  })

  it('🔴 되돌림을 기다리지 않는다 — remove 가 끝나기 전에 commit 이 거부된다(handled 계약)', async () => {
    const pending = deferred<undefined>()
    const remove = vi.fn(() => pending.promise)
    const { attachments } = setup({ remove })
    const [a] = attachments.add([png('a.png')], '')
    const failure = new Error('save')
    await expect(attachments.commit(`![](${a})`, async () => Promise.reject(failure))).rejects.toBe(
      failure,
    )
    expect(remove).toHaveBeenCalledTimes(1)
    expect(attachments.busy.value).toBe(false)
    pending.resolve(undefined)
  })

  it('remove 실패는 삼킨다 — ApiError 는 handled(전역 토스트로 두 번 알리지 않는다) · remove 가 없으면 되돌리지 않는다', async () => {
    const gone = new ApiError('이미지를 찾을 수 없습니다.', {
      status: 404,
      code: CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
      raw: null,
    })
    const { attachments } = setup({ remove: vi.fn(async () => Promise.reject(gone)) })
    const [a] = attachments.add([png('a.png')], '')
    await expect(
      attachments.commit(`![](${a})`, async () => Promise.reject(new Error('save'))),
    ).rejects.toThrow('save')
    await flush()
    expect(gone.handled).toBe(true)

    const bare = useImageAttachments({ upload: async (file) => createdFor(file) })
    const [b] = bare.add([png('b.png')], '')
    await expect(
      bare.commit(`![](${b})`, async () => Promise.reject(new Error('x'))),
    ).rejects.toThrow('x')
  })

  it('🔴 업로드 실패 문구 — 같은 ApiError 의 message 를 코드로 바꾼다(503 · 413) · errorMessages 로 덮는다', async () => {
    const unavailable = new ApiError('서버 내부 오류가 발생했습니다.', {
      status: 503,
      code: CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
      raw: null,
    })
    const first = setup({ upload: vi.fn(async () => Promise.reject(unavailable)) })
    const [a] = first.attachments.add([png('a.png')], '')
    await expect(first.attachments.commit(`![](${a})`, async () => undefined)).rejects.toBe(
      unavailable,
    )
    expect(unavailable.message).toBe('이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.')

    const tooLarge = new ApiError('이미지가 너무 큽니다.', {
      status: 413,
      code: CommonErrorCodes.ERR_UPLOAD_TOO_LARGE,
      details: { maxBytes: 5 * MB },
      raw: null,
    })
    const second = setup({
      upload: vi.fn(async () => Promise.reject(tooLarge)),
      errorMessages: { tooLarge: (max) => `너무 큼 ${max}` },
    })
    const [b] = second.attachments.add([png('b.png')], '')
    await expect(second.attachments.commit(`![](${b})`, async () => undefined)).rejects.toBe(
      tooLarge,
    )
    expect(tooLarge.message).toBe(`너무 큼 ${5 * MB}`)
  })

  it('save 가 던진 업로드 코드 오류는 문구를 바꾸지 않는다 — 서버 4xx 문구 그대로', async () => {
    const limit = new ApiError('사진과 본문 그림은 합쳐 20장까지입니다.', {
      status: 409,
      code: CommonErrorCodes.ERR_UPLOAD_LIMIT,
      raw: null,
    })
    const { attachments } = setup()
    const [a] = attachments.add([png('a.png')], '')
    await expect(attachments.commit(`![](${a})`, async () => Promise.reject(limit))).rejects.toBe(
      limit,
    )
    expect(limit.message).toBe('사진과 본문 그림은 합쳐 20장까지입니다.')
  })

  it('busy · progress — 업로드마다 done 이 오르고, 진행 중 commit 은 거부되며, 끝나면 0/0', async () => {
    const gates = [deferred<void>(), deferred<void>()]
    const upload = vi.fn(async (file: File) => {
      await gates[file.name === 'a.png' ? 0 : 1]!.promise
      return createdFor(file)
    })
    const { attachments } = setup({ upload })
    const [a, b] = attachments.add([png('a.png'), png('b.png')], '')
    const save = vi.fn(async () => 'ok')
    const running = attachments.commit(`![](${a})\n\n![](${b})`, save)
    expect(attachments.busy.value).toBe(true)
    expect(attachments.progress.value).toEqual({ done: 0, total: 2 })
    await expect(attachments.commit('다른 본문', save)).rejects.toThrow('이미 진행 중')
    await expect(attachments.commit(['다른 본문'], async () => 'x')).rejects.toThrow('이미 진행 중')
    gates[0]!.resolve()
    await flush()
    expect(attachments.progress.value).toEqual({ done: 1, total: 2 })
    gates[1]!.resolve()
    await expect(running).resolves.toBe('ok')
    expect(save).toHaveBeenCalledTimes(1)
    expect(attachments.busy.value).toBe(false)
    expect(attachments.progress.value).toEqual({ done: 0, total: 0 })
  })
})

describe('useImageAttachments — 배열 commit(C11)', () => {
  it('모든 본문의 등록 주소를 등록 순서로 한 번씩 올리고 본문마다 치환 — finals 는 같은 길이 · 순서', async () => {
    const { attachments, uploaded } = setup()
    const [a, b, c] = attachments.add([png('a.png'), png('b.png'), png('c.png')], '')
    const save = vi.fn(async (finals: string[]) => finals.length)
    const bodies = [`![](${c})`, '그림 없음', `![](${a})\n\n![](${c})`]
    await expect(attachments.commit(bodies, save)).resolves.toBe(3)
    expect(uploaded).toEqual(['a.png', 'c.png'])
    const urlA = createdFor(png('a.png')).url
    const urlC = createdFor(png('c.png')).url
    expect(save).toHaveBeenCalledWith([`![](${urlC})`, '그림 없음', `![](${urlA})\n\n![](${urlC})`])
    expect(revoked).toEqual([a, c])
    expect(attachments.count(`![](${b})`)).toBe(1)
  })

  it('빈 배열이면 업로드 없이 save([])', async () => {
    const { attachments, upload } = setup()
    attachments.add([png('a.png')], '')
    const save = vi.fn(async (finals: string[]) => finals)
    await expect(attachments.commit([], save)).resolves.toEqual([])
    expect(upload).not.toHaveBeenCalled()
  })

  it('업로드 n장째 실패 · save 실패 둘 다 이번 commit 이 올린 키만 지운다', async () => {
    const failure = new Error('업로드')
    const upload = vi.fn(async (file: File) => {
      if (file.name === 'c.png') throw failure
      return createdFor(file)
    })
    const { attachments, remove } = setup({ upload })
    const [a, b, c] = attachments.add([png('a.png'), png('b.png'), png('c.png')], '')
    await attachments.commit([`![](${a})`], async () => undefined)
    expect(remove).not.toHaveBeenCalled()

    await expect(
      attachments.commit([`![](${b})`, `![](${c})`], async () => undefined),
    ).rejects.toBe(failure)
    expect(remove.mock.calls).toEqual([[createdFor(png('b.png')).key]])

    remove.mockClear()
    await expect(
      attachments.commit([`![](${b})`], async () => Promise.reject(new Error('save'))),
    ).rejects.toThrow('save')
    expect(remove.mock.calls).toEqual([[createdFor(png('b.png')).key]])
  })
})

describe('useImageAttachments — 해제(C8)', () => {
  it('dispose — 남은 주소를 모두 해제하고, 그 뒤 add 는 빈 배열 · count 0', () => {
    const { attachments } = setup()
    const [a, b] = attachments.add([png('a.png'), png('b.png')], '')
    attachments.dispose()
    expect(revoked).toEqual([a, b])
    expect(attachments.add([png('c.png')], '')).toEqual([])
    expect(attachments.count(`![](${a})`)).toBe(0)
  })

  it('만든 스코프가 끝나면 저절로 해제한다', () => {
    const scope = effectScope()
    const attachments = scope.run(() =>
      useImageAttachments({ upload: async (file) => createdFor(file) }),
    )!
    const [a] = attachments.add([png('a.png')], '')
    scope.stop()
    expect(revoked).toEqual([a])
  })
})
```

- [ ] **Step 3: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useImageAttachments.test.ts`
Expected: FAIL — `Failed to resolve import "./useImageAttachments.js"`.

- [ ] **Step 4: 구현한다** — `packages/admin-ui/src/composables/useImageAttachments.ts`

```ts
import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import {
  DEFAULT_MEDIA_PATH,
  DEFAULT_UPLOAD_POLICY,
  collectUploadKeys,
  type AdminUploadCreated,
  type UploadPolicy,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { uploadErrorMessage, type UploadErrorMessages } from '../api/upload-errors.js'
import {
  DEFAULT_IMAGE_ATTACHMENT_MESSAGES,
  clampRoom,
  planAttachments,
  rejectionNotices,
  replaceUrls,
  urlsInBodies,
  type ImageAttachmentMessages,
  type ImageAttachmentRejection,
} from './image-attachments.js'

// 편집기 그림 첨부 레지스트리(스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §2-4 C1 · C2 · C8 ·
// §14 C9 ~ C13) — 편집 중에는 파일 ↔ `blob:` 주소 대응표만 갖고, 저장(commit) 때 본문에 남은 등록 주소만 차례로 올려 주소를
// 바꾼 뒤 save 를 부른다. 작성하다 그만두면 서버에 아무것도 남지 않는다. v-model 은 Markdown 그대로(`![](blob:…)`)라 원문 탭 ·
// 미리보기(renderMarkdown 은 blob: 을 통과시킨다) · 더티 판정이 바뀌지 않는다.
//
// 정본: ssworks-ringside apps/web/app/utils/upload-queue.ts(한 장씩 차례 올리기 골격)
// 바꾼 점: 고른 즉시가 아니라 저장 시점에 올린다(결정 ⑧) · 세션 확인 · 토스트 · 미첨부 비우기를 뺐다 — 예외는 그대로 다시 던진다 ·
//   실패하면 이번에 올린 키를 지운다(R3) · 본문 여럿(C11) · 앱이 세는 남은 칸(C9).
//
// 🔴 되돌림(remove)을 기다리지 않고 원래 예외를 곧바로 다시 던진다. 기다리면 그사이 createApiClient 의 지연 onError(한
//    매크로태스크 뒤)가 먼저 돌아, useWriteFlow 가 처리할 오류(revision 충돌 · 칸 오류 — `handled`)까지 전역 토스트로 뜬다.
//    되돌림 실패는 `handled` 로 표시해 삼킨다 — 원래 실패가 이미 알려졌고, 남은 것은 서버 정리 잡(미첨부 24시간)이 지운다.
// 🔴 업로드 실패 문구는 **같은** ApiError 의 message 를 바꾼다(uploadErrorMessage — 503 은 서버가 문구를 가린다). 새 객체로
//    던지면 지연 onError 가 옛 객체(「서버 내부 오류가 발생했습니다.」)로 토스트를 띄운다.
// 🔴 레지스트리는 본문을 지켜보지 않는다(C8) — 지웠다 되돌린 그림 · 외부 변경 · 원문 탭 편집과 무관하게, 저장 순간 본문에 있는 등록
//    주소만 올라간다. 편집기 여럿이 하나를 나눠 써도 된다(C13) — 해제는 만든 스코프가 끝날 때.

export interface UseImageAttachmentsOptions {
  /** 파일 하나를 올린다 — 보통 `(file) => api.uploadFile('/admin/uploads', file, { params: { purpose } })` */
  upload: (file: File) => Promise<AdminUploadCreated>
  /** 되돌림 — 보통 `` (key) => api.del(`/admin/uploads/${key}`) ``. 없으면 남은 것은 서버 정리 잡 몫 */
  remove?: (key: string) => Promise<unknown>
  /** 클라이언트가 먼저 거르는 상한(최종 판정은 서버). 기본 admin-shared `DEFAULT_UPLOAD_POLICY` */
  policy?: Partial<Pick<UploadPolicy, 'maxBytes' | 'maxPerBody'>>
  /** 본문의 우리 그림을 세는 경로 — 서버 `uploads.mediaPath`. 기본 `'/api/media'` */
  mediaPath?: string
  /** 더 넣을 수 있는 장수를 앱이 센다(C9 — 본문 밖 그림 · 다른 본문 포함). 있으면 maxPerBody 셈 대신 쓴다 */
  room?: () => number
  /** 거른 파일 — 사유마다 한 번(형식 · 크기 · 칸 순서). 편집기는 토스트를 띄우지 않는다(C5) */
  onRejected?: (notice: ImageAttachmentRejection) => void
  messages?: Partial<ImageAttachmentMessages>
  /** 업로드 실패 문구(ERR_UPLOAD_* 여섯). 기본 `DEFAULT_UPLOAD_ERROR_MESSAGES` */
  errorMessages?: Partial<UploadErrorMessages>
}

export interface ImageAttachmentProgress {
  done: number
  total: number
}

export interface ImageAttachments {
  /** 파일을 거르고 받아들인 것의 `blob:` 주소를 고른 순서로. body = 지금 본문(남은 칸 셈 — `room` 이 있으면 보지 않는다) */
  add(files: readonly File[], body: string): string[]
  /** 본문에 남은 등록 주소를 등록 순서로 올리고 주소를 바꿔 `save(치환본)`. 실패하면 이번에 올린 키를 지우고 원래 예외를 다시 던진다(C2) */
  commit<T>(markdown: string, save: (final: string) => Promise<T>): Promise<T>
  /** 본문 여럿 — 모든 본문에 남은 등록 주소를 한 번씩 올리고 본문마다 바꿔 같은 순서 · 길이로 `save(finals)`(C11) */
  commit<T>(markdowns: readonly string[], save: (finals: string[]) => Promise<T>): Promise<T>
  /** 본문(들)에 남은 등록 주소의 수 — 같은 주소는 여러 번 · 여러 본문에 있어도 하나(C10) */
  count(markdown: string | readonly string[]): number
  /** commit 진행 중 */
  busy: Readonly<Ref<boolean>>
  /** commit 의 업로드 진행 — 끝나면 `{ done: 0, total: 0 }` */
  progress: Readonly<Ref<ImageAttachmentProgress>>
  /** 남은 `blob:` 주소를 모두 해제한다 — 만든 스코프가 끝날 때 저절로 */
  dispose(): void
}

export function useImageAttachments(options: UseImageAttachmentsOptions): ImageAttachments {
  const maxBytes = options.policy?.maxBytes ?? DEFAULT_UPLOAD_POLICY.maxBytes
  const maxPerBody = options.policy?.maxPerBody ?? DEFAULT_UPLOAD_POLICY.maxPerBody
  const mediaPath = options.mediaPath ?? DEFAULT_MEDIA_PATH
  const messages: ImageAttachmentMessages = {
    ...DEFAULT_IMAGE_ATTACHMENT_MESSAGES,
    ...options.messages,
  }
  /** `blob:` 주소 → 파일. Map 의 순서가 등록 순서다 */
  const files = new Map<string, File>()
  const busy = ref(false)
  const progress = shallowRef<ImageAttachmentProgress>({ done: 0, total: 0 })
  let disposed = false

  const bodiesOf = (markdown: string | readonly string[]): readonly string[] =>
    typeof markdown === 'string' ? [markdown] : markdown

  function count(markdown: string | readonly string[]): number {
    return urlsInBodies(files.keys(), bodiesOf(markdown)).length
  }

  function add(input: readonly File[], body: string): string[] {
    if (disposed || input.length === 0) return []
    const room = clampRoom(
      options.room
        ? options.room()
        : maxPerBody - collectUploadKeys(body, mediaPath).length - count(body),
    )
    const plan = planAttachments(input, { room, maxBytes })
    for (const notice of rejectionNotices(plan.rejected, messages, maxBytes)) {
      options.onRejected?.(notice)
    }
    return plan.accepted.map((file) => {
      const url = URL.createObjectURL(file)
      files.set(url, file)
      return url
    })
  }

  /** 업로드 실패 문구 — 같은 객체의 message 를 바꾼다(머리 주석) */
  function localize(error: unknown): void {
    const text = uploadErrorMessage(error, options.errorMessages)
    if (text != null && error instanceof ApiError) error.message = text
  }

  /** 이번 commit 이 올린 키를 지운다 — 기다리지 않는다(머리 주석). 실패는 handled 로 삼킨다 */
  function rollback(keys: readonly string[]): void {
    const remove = options.remove
    if (remove == null) return
    for (const key of keys) {
      void (async () => {
        try {
          await remove(key)
        } catch (error) {
          if (error instanceof ApiError) error.handled = true
        }
      })()
    }
  }

  async function run<T>(
    bodies: readonly string[],
    save: (finals: string[]) => Promise<T>,
  ): Promise<T> {
    if (busy.value) throw new Error('useImageAttachments: commit 이 이미 진행 중이다')
    busy.value = true
    // 🔴 시작할 때의 대응을 붙잡는다 — 도중에 dispose 돼도 이번 commit 은 끝까지 간다
    const queue = urlsInBodies(files.keys(), bodies).map((url) => ({
      url,
      file: files.get(url) as File,
    }))
    progress.value = { done: 0, total: queue.length }
    const uploaded: string[] = []
    const replacements = new Map<string, string>()
    try {
      for (const item of queue) {
        let created: AdminUploadCreated
        try {
          created = await options.upload(item.file)
        } catch (error) {
          localize(error)
          throw error
        }
        uploaded.push(created.key)
        replacements.set(item.url, created.url)
        progress.value = { done: progress.value.done + 1, total: queue.length }
      }
      const result = await save(bodies.map((body) => replaceUrls(body, replacements)))
      for (const { url } of queue) {
        URL.revokeObjectURL(url)
        files.delete(url)
      }
      return result
    } catch (error) {
      rollback(uploaded)
      throw error
    } finally {
      busy.value = false
      progress.value = { done: 0, total: 0 }
    }
  }

  function commit<T>(markdown: string, save: (final: string) => Promise<T>): Promise<T>
  function commit<T>(
    markdowns: readonly string[],
    save: (finals: string[]) => Promise<T>,
  ): Promise<T>
  function commit<T>(
    input: string | readonly string[],
    save: ((final: string) => Promise<T>) | ((finals: string[]) => Promise<T>),
  ): Promise<T> {
    if (typeof input === 'string') {
      const one = save as (final: string) => Promise<T>
      return run([input], (finals) => one(finals[0] ?? ''))
    }
    return run(input, save as (finals: string[]) => Promise<T>)
  }

  function dispose(): void {
    disposed = true
    for (const url of files.keys()) URL.revokeObjectURL(url)
    files.clear()
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  return { add, commit, count, busy, progress, dispose }
}
```

- [ ] **Step 5: GREEN · 타입**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useImageAttachments.test.ts`
Expected: PASS(23).

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0.

- [ ] **Step 6: 🔴 RED 다시 보기**
  - `rollback(uploaded)` 를 `await Promise.all(uploaded.map((key) => options.remove?.(key)))` 로 바꾸면 적어도 `🔴 되돌림을 기다리지 않는다` 가 5초 시간 초과로 FAIL(remove 실패 테스트도 다른 예외로 FAIL) — 되돌린다.
  - `localize(error)` 줄을 지우면 `🔴 업로드 실패 문구` 가 FAIL(「서버 내부 오류가 발생했습니다.」) — 되돌린다.

- [ ] **Step 7: lint · 모양 · 커밋**

Run: `pnpm exec eslint packages/admin-ui/src/composables packages/admin-ui/src/test && pnpm exec prettier --check packages/admin-ui/src/composables packages/admin-ui/src/test`
Expected: 0.

```bash
git add packages/admin-ui/src/test/image-transfer.ts packages/admin-ui/src/composables/useImageAttachments.ts packages/admin-ui/src/composables/useImageAttachments.test.ts
git commit -m "feat(admin-ui): useImageAttachments — blob: 레지스트리 · 저장 시점 commit(문자열 · 배열) · count · room · 되돌림

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 편집기 넣기 도우미 `editor-images.ts` · `moveCaretAfterImage` 꺼내기

**Files:**

- Modify: `packages/admin-ui/src/components/markdown/editor-markdown.ts:198-242`(캐럿 규칙을 함수로)
- Create: `packages/admin-ui/src/components/markdown/editor-images.ts`
- Create: `packages/admin-ui/src/components/markdown/editor-images.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `packages/admin-ui/src/components/markdown/editor-images.test.ts`

```ts
// @vitest-environment happy-dom
import { renderMarkdown } from '@ssworks/admin-shared'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMarkdownHarness,
  mountHost,
  sameStructure,
  type MarkdownHarness,
} from '../../test/markdown-harness.js'
import { imageFile, transferOf } from '../../test/image-transfer.js'
import {
  filesOf,
  hasFiles,
  insertImagesAt,
  pastedFiles,
  sourceWithImages,
} from './editor-images.js'

// 그림 넣기 도우미 — 마운트한 편집기(하니스)에서 잰다. 넣은 문서마다 doc.check() 와 렌더에 그림이 보이는지를 보고, 문서 끝 빈
// 문단이 없는 갈래(문단 가운데 · 첫머리)는 렌더 구조(둘째 오라클)까지 본다 — 문서 끝 빈 문단은 렌더하지 않는 알려진 차이(K6)다.

const A = 'blob:test/u001'
const B = 'blob:test/u002'

let h: MarkdownHarness

beforeEach(() => {
  h = createMarkdownHarness(mountHost())
})

afterEach(() => {
  h.destroy()
  document.body.innerHTML = ''
})

/** 본문을 넣고 at 에 그림들을 넣은 뒤 Markdown — doc.check() 와 렌더의 그림 순서를 함께 본다 */
function inserted(markdown: string, at: number | 'end', urls: readonly string[]): string {
  h.roundTrip(markdown)
  const editor = h.editor
  const pos = at === 'end' ? editor.state.doc.content.size - 1 : at
  editor.commands.setTextSelection(pos)
  insertImagesAt(editor, editor.state.selection.to, urls)
  editor.state.doc.check()
  const out = editor.getMarkdown()
  const rendered = [...renderMarkdown(out).matchAll(/<img src="([^"]*)"/g)].map((m) => m[1])
  expect(rendered, `렌더의 그림 — ${out}`).toEqual(urls)
  return out
}

/** 캐럿 — 글자 선택이고 그 텍스트 블록의 글자 · 블록 안 자리 */
function caret(): { text: string; offset: number } {
  const { selection } = h.editor.state
  expect(selection, '가드 — 캐럿은 글자 선택이다(그림이 선택돼 있지 않다)').toBeInstanceOf(
    TextSelection,
  )
  return { text: selection.$from.parent.textContent, offset: selection.$from.parentOffset }
}

describe('filesOf · pastedFiles', () => {
  it('파일은 형식과 상관없이 모두 — 없으면 빈 배열', () => {
    const files = [imageFile('a.png'), imageFile('b.pdf', 4, 'application/pdf')]
    expect(filesOf(transferOf(files)).map((f) => f.name)).toEqual(['a.png', 'b.pdf'])
    expect(filesOf(null)).toEqual([])
    expect(filesOf(transferOf([]))).toEqual([])
  })

  it('hasFiles — 파일이 실렸거나 types 에 Files 가 있으면(dragover 의 브라우저 모양)', () => {
    expect(hasFiles(transferOf([imageFile('a.png')]))).toBe(true)
    expect(hasFiles(transferOf([], '글자'))).toBe(false)
    expect(hasFiles({ types: ['Files'], files: [] } as unknown as DataTransfer)).toBe(true)
    expect(hasFiles(null)).toBe(false)
  })

  it('붙여넣기는 글자가 없을 때만 — 글자가 함께 오면(문서 복사) 빈 배열 = 기본 붙여넣기', () => {
    expect(pastedFiles(transferOf([imageFile('a.png')])).map((f) => f.name)).toEqual(['a.png'])
    expect(pastedFiles(transferOf([imageFile('a.png')], '표 글자'))).toEqual([])
    expect(pastedFiles(undefined)).toEqual([])
  })
})

describe('insertImagesAt(C4 — 입력 규칙과 같은 자리 · 캐럿 규칙)', () => {
  it('문단 끝 — 그림 뒤에 빈 문단을 만들어 캐럿을 둔다(문서 끝 빈 문단은 `""` + 구분자 — K6)', () => {
    expect(inserted('본문', 'end', [A])).toBe(`본문\n\n![](${A})\n\n`)
    expect(caret()).toEqual({ text: '', offset: 0 })
  })

  it('여러 장은 순서대로 이어 넣는다', () => {
    expect(inserted('본문', 'end', [A, B])).toBe(`본문\n\n![](${A})\n\n![](${B})\n\n`)
    expect(caret()).toEqual({ text: '', offset: 0 })
  })

  it('문단 가운데 — 문단을 가르고 캐럿은 뒷글 첫머리 · 편집기 구조가 렌더와 같다', () => {
    expect(inserted('앞뒤', 2, [A])).toBe(`앞\n\n![](${A})\n\n뒤`)
    expect(caret()).toEqual({ text: '뒤', offset: 0 })
    sameStructure(h, h.editor.getMarkdown())
    expect(inserted('앞뒤', 2, [A, B])).toBe(`앞\n\n![](${A})\n\n![](${B})\n\n뒤`)
    expect(caret()).toEqual({ text: '뒤', offset: 0 })
    sameStructure(h, h.editor.getMarkdown())
  })

  it('문단 첫머리 — 그 문단 앞에 넣고 캐럿은 그 문단 첫머리', () => {
    expect(inserted('본문', 1, [A])).toBe(`![](${A})\n\n본문`)
    expect(caret()).toEqual({ text: '본문', offset: 0 })
    sameStructure(h, h.editor.getMarkdown())
  })

  it('빈 문서 · 제목 뒤', () => {
    expect(inserted('', 'end', [A])).toBe(`![](${A})\n\n`)
    expect(inserted('# 제목', 'end', [A])).toBe(`# 제목\n\n![](${A})\n\n`)
  })

  it('그림을 고른 채(NodeSelection) — 그 그림 뒤에 넣는다', () => {
    h.roundTrip('![](https://a.example/x.png)')
    h.editor.commands.setNodeSelection(0)
    expect(h.editor.state.selection).toBeInstanceOf(NodeSelection)
    insertImagesAt(h.editor, h.editor.state.selection.to, [A])
    h.editor.state.doc.check()
    expect(h.editor.getMarkdown()).toBe(`![](https://a.example/x.png)\n\n![](${A})\n\n`)
  })

  it('여러 장도 트랜잭션 하나다(되돌리기 한 번) · 빈 목록은 트랜잭션을 내지 않는다', () => {
    h.roundTrip('본문')
    let transactions = 0
    h.editor.on('transaction', () => {
      transactions += 1
    })
    insertImagesAt(h.editor, 3, [A, B])
    expect(transactions).toBe(1)
    insertImagesAt(h.editor, 1, [])
    expect(transactions).toBe(1)
  })
})

describe('sourceWithImages — 원문 textarea', () => {
  it('앞뒤 글이 있으면 빈 줄로 띄우고 캐럿은 마지막 그림 줄 뒤', () => {
    const result = sourceWithImages('앞뒤', 1, [A])
    expect(result.value).toBe(`앞\n\n![](${A})\n\n뒤`)
    expect(result.caret).toBe(`앞\n\n![](${A})`.length)
  })

  it('이미 빈 줄 · 줄바꿈이 있으면 그만큼만 더한다 · 여러 장은 빈 줄로', () => {
    expect(sourceWithImages('앞\n\n뒤', 3, [A]).value).toBe(`앞\n\n![](${A})\n\n뒤`)
    expect(sourceWithImages('앞\n', 2, [A, B]).value).toBe(`앞\n\n![](${A})\n\n![](${B})`)
    expect(sourceWithImages('앞\n뒤', 1, [A]).value).toBe(`앞\n\n![](${A})\n\n뒤`)
  })

  it('빈 값 · 범위 밖 자리', () => {
    expect(sourceWithImages('', 0, [A])).toEqual({ value: `![](${A})`, caret: `![](${A})`.length })
    expect(sourceWithImages('본문', 99, [A]).value).toBe(`본문\n\n![](${A})`)
    expect(sourceWithImages('본문', -3, [A]).value).toBe(`![](${A})\n\n본문`)
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/editor-images.test.ts`
Expected: FAIL — `Failed to resolve import "./editor-images.js"`.

- [ ] **Step 3: 캐럿 규칙을 꺼낸다** — `packages/admin-ui/src/components/markdown/editor-markdown.ts`

🔴 바로 위의 `IMAGE_INPUT` 정규식(196행 — 백슬래시가 든 줄)은 건드리지 않는다. 198행 `/**` 부터 `export const EditorImage = Image.extend({` 줄까지(198-206)를 아래로 바꾼다:

```ts
/**
 * 그림을 넣은 트랜잭션의 캐럿(A4). 🔴 `insertContentAt` 은 그림을 NodeSelection 으로 남겨 다음 타자가 그림을 지운다(ringside C1 과
 * 같은 함정) — 그림 **바로 뒤**로 옮긴다. 바로 뒤가 텍스트 블록(글자를 가른 뒷부분)이면 그 첫머리, 아니면(문서 끝 · 뒤가 목록 ·
 * 구분선) 빈 문단을 만들어 거기에 둔다 — 멀리 있는 목록 항목으로 튀지 않는다(리뷰 사소 #4). 그림이 선택돼 있지 않으면(문단
 * 가운데였으면 insertContentAt 이 뒷글 문단 첫머리에 글자 선택을 둔다) 그대로 둔다. 입력 규칙(EditorImage)과 붙여넣기 · 끌어
 * 놓기 · 그림 단추(editor-images.ts `insertImagesAt`)가 같은 규칙을 쓴다(이미지 업로드 스펙 C4).
 */
export function moveCaretAfterImage(tr: Transaction): void {
  const { selection } = tr
  if (!(selection instanceof NodeSelection)) return
  const after = selection.to
  const next = tr.doc.resolve(after).nodeAfter
  if (next?.isTextblock) {
    tr.setSelection(TextSelection.create(tr.doc, after + 1))
    return
  }
  const paragraph = tr.doc.type.schema.nodes.paragraph
  if (paragraph === undefined) return
  tr.insert(after, paragraph.create())
  tr.setSelection(TextSelection.create(tr.doc, after + 1))
}

/**
 * 그림(A4) — 기본 `Image` 에 입력 규칙만 바꿔 끼운다. 기본 `nodeInputRule` 은 블록 노드를 문단 가운데 넣을 때 친 마지막 글자 `)` 를
 * 그림 뒤 새 문단(`<p>)</p>`)에 남긴다(TipTap 3.32.0 — happy-dom · 실브라우저 Chrome 둘 다, 2026-11-01). 여기서는 친 글자를 넣지 않고
 * `![…](…)` 글자 자리에 그림을 넣는다(`insertContentAt` 이 문단을 가른다). 거르기는 없다(결정 ②) — 거르기는 앱 몫.
 * 🔴 넣은 뒤 캐럿을 그림 **바로 뒤**로 옮긴다(moveCaretAfterImage)
 */
export const EditorImage = Image.extend({
```

그리고 같은 파일 입력 규칙 안의 `.command(({ tr }) => {` 부터 그 닫는 `})` 까지(221-236 — 안에 `// 문단 가운데였으면 …` 주석과 캐럿 옮기기가 있다. 앞의 `.insertContentAt(…)` · 뒤의 `.run()` 은 그대로)를 아래로 바꾼다:

```ts
            .command(({ tr }) => {
              moveCaretAfterImage(tr)
              return true
            })
```

(`Transaction` · `NodeSelection` · `TextSelection` 은 18행에서 이미 import 한다.)

- [ ] **Step 4: 도우미를 쓴다** — `packages/admin-ui/src/components/markdown/editor-images.ts`

```ts
import type { Editor } from '@tiptap/core'
import { moveCaretAfterImage } from './editor-markdown.js'

// 편집기에 그림 넣기(이미지 업로드 스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §2-4 C3 · C4) —
// 붙여넣기 · 끌어 놓기 · 그림 단추가 받은 파일의 `blob:` 주소를 넣는다. 순수 모듈(Vue 무의존) — 화면은 MarkdownEditor.vue.
//
// 정본: ssworks-ringside apps/web/app/utils/editor-image-insert.ts(insertMediaImage — 한 트랜잭션 · 캐럿)
//       + apps/web/app/components/ring/RingMarkdownEditor.vue(handlePaste — 글자가 함께 오면 기본 붙여넣기)
// 바꾼 점: 업로드가 끝날 때마다 한 장씩이 아니라 받은 장을 한 번에 넣는다(blob: — 기다릴 것이 없다 · 앵커 매핑 없음). 캐럿은
//   EditorImage 입력 규칙과 같은 moveCaretAfterImage(#3j A4). 원문 textarea 넣기를 더했다.

/** 클립보드 · 끌어 놓기의 파일 — 형식은 거르지 않는다(레지스트리 add 가 「형식」 사유로 알린다) */
export function filesOf(transfer: DataTransfer | null | undefined): File[] {
  return transfer == null ? [] : [...transfer.files]
}

/**
 * 파일을 끌고 있는가 — 🔴 브라우저는 dragover 동안 `files` 를 비워 둔다(보호 모드) — `types` 의 'Files' 로 본다. drop 에서는 `files`
 * 가 찬다(happy-dom 은 `types` 에 'Files' 를 싣지 않는다 — 둘 다 본다)
 */
export function hasFiles(transfer: DataTransfer | null | undefined): boolean {
  return transfer != null && (transfer.types.includes('Files') || transfer.files.length > 0)
}

/**
 * 붙여넣기에서 편집기가 맡을 파일 — 글자가 없을 때만(스크린숏 · 이미지 복사). 글자가 함께 오면 빈 배열(기본 붙여넣기) —
 * Word · 엑셀 · 웹 문서 복사는 내용의 그림 한 장을 함께 싣는다(ringside 실측)
 */
export function pastedFiles(transfer: DataTransfer | null | undefined): File[] {
  if (transfer == null || transfer.getData('text/plain') !== '') return []
  return filesOf(transfer)
}

/**
 * 그림 블록을 at 에 차례로 넣는다 — 한 트랜잭션(되돌리기 한 번). 장마다 moveCaretAfterImage(그림 바로 뒤 글자 자리 · 없으면 빈
 * 문단)를 따르고, 다음 장은 그 캐럿 자리에 넣는다. at 은 문서 범위로 자른다
 */
export function insertImagesAt(editor: Editor, at: number, urls: readonly string[]): void {
  if (urls.length === 0) return
  editor.commands.command(({ tr, commands }) => {
    let pos = Math.min(Math.max(0, at), tr.doc.content.size)
    for (const src of urls) {
      commands.insertContentAt(pos, { type: 'image', attrs: { src, alt: '', title: null } })
      moveCaretAfterImage(tr)
      pos = tr.selection.from
    }
    return true
  })
}

/**
 * 원문 textarea 에 그림 줄 — at(캐럿) 자리에 `![](주소)` 를 빈 줄로 띄워 넣는다(앞뒤 글이 있으면 빈 줄 하나씩). 고른 글자는
 * 지우지 않는다. caret 은 마지막 그림 줄 바로 뒤
 */
export function sourceWithImages(
  value: string,
  at: number,
  urls: readonly string[],
): { value: string; caret: number } {
  const position = Math.min(Math.max(0, at), value.length)
  const before = value.slice(0, position)
  const after = value.slice(position)
  const block = urls.map((url) => `![](${url})`).join('\n\n')
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const trail =
    after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const head = `${before}${lead}${block}`
  return { value: `${head}${trail}${after}`, caret: head.length }
}
```

- [ ] **Step 5: GREEN — 새 테스트와 어댑터 회귀**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/`
Expected: PASS — `editor-images.test.ts` 13 · `editor-markdown.test.ts` 198(입력 규칙 캐럿 — A4 테스트가 꺼낸 함수를 지킨다) · 나머지 그대로.

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0.

- [ ] **Step 6: 🔴 RED 다시 보기** — `insertImagesAt` 의 `moveCaretAfterImage(tr)` 줄을 지우면 「문단 끝」 · 「여러 장」 · 「빈 문서 · 제목 뒤」 · 「그림을 고른 채」 넷이 FAIL(작성 때 실측 — 캐럿이 그림을 고른 채 남아 다음 장이 앞에 들어가거나 가드가 걸린다) — 되돌린다.

- [ ] **Step 7: lint · 모양 · 커밋**

Run: `pnpm exec eslint packages/admin-ui/src/components/markdown && pnpm exec prettier --check packages/admin-ui/src/components/markdown`
Expected: 0.

```bash
git add packages/admin-ui/src/components/markdown/editor-markdown.ts packages/admin-ui/src/components/markdown/editor-images.ts packages/admin-ui/src/components/markdown/editor-images.test.ts
git commit -m "feat(admin-ui): 편집기 그림 넣기 도우미 — insertImagesAt · 원문 줄 · 붙여넣기 판정 · moveCaretAfterImage 꺼내기

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `MarkdownEditor` prop `attachments` — 그림 단추 · 붙여넣기 · 끌어 놓기 · 원문 · add 앞 flush

**Files:**

- Modify: `packages/admin-ui/src/components/markdown/markdown-editor.ts:17-18 · 48-49`(`image` 문구)
- Modify: `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`(import · 머리 주석 · props · ref · `viewProps` · 만들 때 · 감시 둘 · 첨부 함수 · 도구 키 · 템플릿 둘)
- Modify: `packages/admin-ui/src/components/markdown/markdown-editor.render.test.ts`(import · 끝에 describe 하나)

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `packages/admin-ui/src/components/markdown/markdown-editor.render.test.ts`

머리 import(2-8행)를 아래로 바꾼다:

```ts
import { undoDepth } from '@tiptap/pm/history'
import { Slice } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/vue-3'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminUploadCreated } from '@ssworks/admin-shared'
import { useImageAttachments } from '../../composables/useImageAttachments.js'
import {
  dragEvent,
  imageFile,
  pasteEvent,
  stubObjectUrls,
  transferOf,
} from '../../test/image-transfer.js'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import MarkdownEditor from './MarkdownEditor.vue'
import { MARKDOWN_EDITOR_EMIT_DELAY_MS } from './markdown-editor.js'
```

파일 끝(`describe('MarkdownEditor — 링크', …)` 닫는 `})` 뒤)에:

```ts

describe('MarkdownEditor — 그림 첨부(이미지 업로드 C3 · C4 · C5 · C12 · C13)', () => {
  // 레지스트리는 실물(useImageAttachments)이다 — blob: 주소만 대역(stubObjectUrls). 편집기 테스트는 올리지 않는다.
  beforeEach(() => {
    stubObjectUrls()
  })

  function registry(onRejected = vi.fn()) {
    return useImageAttachments({
      upload: async (): Promise<AdminUploadCreated> => {
        throw new Error('편집기 테스트는 올리지 않는다')
      },
      onRejected,
    })
  }

  const imageButton = () => toolButton('이미지 넣기')
  const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')
  const modeButton = (name: string) =>
    buttonByText(name, document.querySelector('[role="toolbar"]')!)!

  /** 숨은 파일 입력으로 고른 것처럼 */
  function choose(files: readonly File[]): void {
    const input = fileInput()!
    input.files = transferOf(files).files
    input.dispatchEvent(new Event('change'))
  }

  it('attachments 가 없으면 그림 단추 · 파일 입력이 없고, 파일 붙여넣기는 막지 않는다', () => {
    const w = mountEditor({ modelValue: '본문' })
    expect(imageButton()).toBeNull()
    expect(fileInput()).toBeNull()
    const paste = pasteEvent([imageFile('a.png')])
    content()!.dispatchEvent(paste)
    expect(paste.defaultPrevented).toBe(false)
    expect(editorOf(w).getMarkdown()).toBe('본문')
  })

  it('그림 단추 — 숨은 파일 입력(서버가 받는 형식 넷 · 여러 장)을 연다 · 문구는 messages.image', async () => {
    mountEditor({ attachments: registry() })
    expect(imageButton()).toBeTruthy()
    const input = fileInput()!
    expect(input.hidden).toBe(true)
    expect(input.multiple).toBe(true)
    expect(input.accept).toBe('image/jpeg,image/png,image/webp,image/gif')
    const click = vi.spyOn(input, 'click')
    imageButton()!.click()
    expect(click).toHaveBeenCalledTimes(1)
    wrapper!.unmount()
    wrapper = null
    document.body.innerHTML = ''
    mountEditor({ attachments: registry(), messages: { image: 'Image' } })
    expect(toolButton('Image')).toBeTruthy()
  })

  it('고른 파일 → 캐럿 자리에 그림 노드(고른 순서) · 즉시 update:modelValue · 입력을 비운다', () => {
    const w = mountEditor({ attachments: registry() })
    const editor = editorOf(w)
    editor.commands.setTextSelection(endOf(editor))
    choose([imageFile('a.png'), imageFile('b.gif', 4, 'image/gif')])
    editor.state.doc.check()
    const value = '# 제1조\n\n![](blob:test/u001)\n\n![](blob:test/u002)\n\n'
    expect(editor.getMarkdown()).toBe(value)
    expect(w.emitted('update:modelValue')).toEqual([[value]])
    expect(fileInput()!.files).toHaveLength(0)
  })

  it('파일만 붙여넣으면 그림 노드 + doc.check() · 기본 동작을 막는다 — 글자가 함께 오면 기본 붙여넣기', () => {
    const attachments = registry()
    const w = mountEditor({ modelValue: '본문', attachments })
    const editor = editorOf(w)
    editor.commands.setTextSelection(endOf(editor))
    const paste = pasteEvent([imageFile('a.png')])
    content()!.dispatchEvent(paste)
    expect(paste.defaultPrevented).toBe(true)
    editor.state.doc.check()
    expect(editor.getMarkdown()).toBe('본문\n\n![](blob:test/u001)\n\n')

    const add = vi.spyOn(attachments, 'add')
    editor.commands.setTextSelection(3)
    content()!.dispatchEvent(pasteEvent([imageFile('b.png')], '글자'))
    expect(add).not.toHaveBeenCalled()
    expect(editor.getMarkdown()).toBe('본문글자\n\n![](blob:test/u001)\n\n')
  })

  it('거른 파일은 넣지 않는다 — 알림은 레지스트리 onRejected 몫(편집기는 토스트를 띄우지 않는다)', () => {
    const onRejected = vi.fn()
    const w = mountEditor({ modelValue: '본문', attachments: registry(onRejected) })
    const editor = editorOf(w)
    editor.commands.setTextSelection(endOf(editor))
    content()!.dispatchEvent(
      pasteEvent([imageFile('a.svg', 4, 'image/svg+xml'), imageFile('b.png')]),
    )
    expect(editor.getMarkdown()).toBe('본문\n\n![](blob:test/u001)\n\n')
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ reason: 'type', count: 1 }))
    expect(document.querySelector('.v-snackbar')).toBeNull()
  })

  it('끌어 놓기 — 놓은 자리(posAtCoords)에 넣고 기본 동작을 막는다 · 편집기 안에서 끄는 것은 ProseMirror 몫', () => {
    const attachments = registry()
    const w = mountEditor({ modelValue: '앞뒤', attachments })
    const editor = editorOf(w)
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 2, inside: -1 })
    const drop = dragEvent('drop', [imageFile('a.png')])
    content()!.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    editor.state.doc.check()
    expect(editor.getMarkdown()).toBe('앞\n\n![](blob:test/u001)\n\n뒤')

    const add = vi.spyOn(attachments, 'add')
    editor.view.dragging = { slice: Slice.empty, move: true }
    content()!.dispatchEvent(dragEvent('drop', [imageFile('b.png')]))
    expect(add).not.toHaveBeenCalled()
  })

  it('readonly 면 셋 다 꺼진다 — readonly 를 풀면 다시 받는다', async () => {
    const attachments = registry()
    const add = vi.spyOn(attachments, 'add')
    const w = mountEditor({ modelValue: '본문', attachments, readonly: true })
    expect(imageButton()!.disabled).toBe(true)
    content()!.dispatchEvent(pasteEvent([imageFile('a.png')]))
    content()!.dispatchEvent(dragEvent('drop', [imageFile('b.png')]))
    modeButton('원문').click()
    await flushPromises()
    sourceArea()!.dispatchEvent(pasteEvent([imageFile('c.png')]))
    expect(add).not.toHaveBeenCalled()
    modeButton('서식').click()
    await w.setProps({ readonly: false })
    expect(imageButton()!.disabled).toBe(false)
    content()!.dispatchEvent(pasteEvent([imageFile('d.png')]))
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('원문 — 붙여넣기 · 끌어 놓기 · 그림 단추는 캐럿 자리에 `![](blob:…)` 줄 · 즉시 emit · 서식으로 돌아오면 그림 노드', async () => {
    const w = mountEditor({ modelValue: '앞뒤', attachments: registry() })
    modeButton('원문').click()
    await flushPromises()
    const area = sourceArea()!
    area.setSelectionRange(1, 1)
    const paste = pasteEvent([imageFile('a.png')])
    area.dispatchEvent(paste)
    expect(paste.defaultPrevented).toBe(true)
    const once = '앞\n\n![](blob:test/u001)\n\n뒤'
    expect(area.value).toBe(once)
    expect(area.selectionEnd).toBe('앞\n\n![](blob:test/u001)'.length)
    expect(w.emitted('update:modelValue')).toEqual([[once]])

    const over = dragEvent('dragover', [imageFile('b.png')])
    area.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    const drop = dragEvent('drop', [imageFile('b.png')])
    area.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    choose([imageFile('c.png')])
    const thrice = '앞\n\n![](blob:test/u001)\n\n![](blob:test/u002)\n\n![](blob:test/u003)\n\n뒤'
    expect(area.value).toBe(thrice)
    expect(w.emitted('update:modelValue')).toHaveLength(3)

    modeButton('서식').click()
    await flushPromises()
    expect(content()!.querySelectorAll('img')).toHaveLength(3)
    expect(editorOf(w).getMarkdown()).toBe(thrice)
  })

  it('🔴 C12 — 디바운스 중에 그림을 넣으면 대기 중인 update:modelValue 가 add 보다 먼저 나간다', () => {
    const log: string[] = []
    const attachments = registry()
    const add = attachments.add
    vi.spyOn(attachments, 'add').mockImplementation((files, body) => {
      log.push(`add:${body}`)
      return add(files, body)
    })
    const w = mountEditor({
      attachments,
      'onUpdate:modelValue': (value: string) => log.push(`emit:${value}`),
    })
    const editor = editorOf(w)
    type(editor, '가')
    type(editor, '나')
    content()!.dispatchEvent(pasteEvent([imageFile('a.png')]))
    expect(log).toEqual([
      'emit:# 제1조가',
      'emit:# 제1조가나',
      'add:# 제1조가나',
      'emit:# 제1조가나\n\n![](blob:test/u001)\n\n',
    ])
  })

  it('C13 — 레지스트리 하나를 편집기 둘이 나눠 쓴다: 각자 넣은 그림이 하나의 count 에 잡히고, 하나가 사라져도 등록은 남는다', () => {
    const attachments = registry()
    const values = ['첫째', '둘째']
    const mountOne = (index: number, label: string) =>
      mount(MarkdownEditor, {
        props: {
          modelValue: values[index]!,
          label,
          attachments,
          'onUpdate:modelValue': (value: string) => {
            values[index] = value
          },
        },
        attachTo: document.body,
        global: { plugins: [vuetify] },
      })
    const first = mountOne(0, '첫째 본문')
    const second = mountOne(1, '둘째 본문')
    try {
      content('첫째 본문')!.dispatchEvent(pasteEvent([imageFile('a.png')]))
      content('둘째 본문')!.dispatchEvent(pasteEvent([imageFile('b.png')]))
      expect(values.every((value) => value.includes('blob:test/'))).toBe(true)
      expect(attachments.count(values)).toBe(2)
      second.unmount()
      expect(attachments.count(values)).toBe(2)
    } finally {
      first.unmount()
    }
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/markdown-editor.render.test.ts`
Expected: 새 describe 의 열 중 「attachments 가 없으면 …」 만 PASS, 나머지 아홉 FAIL(그림 단추 `null` · 파일 입력 없음 · 붙여넣은 그림 없음 · `defaultPrevented` false 등). 기존 35 는 초록.

- [ ] **Step 3: 문구** — `packages/admin-ui/src/components/markdown/markdown-editor.ts`

인터페이스의 `redo: string`(18행) 뒤에:

```ts
  /** 그림 단추 — `attachments` 를 줄 때만 보인다 */
  image: string
```

기본값의 `redo: '다시 실행',`(49행) 뒤에:

```ts
    image: '이미지 넣기',
```

- [ ] **Step 4: 편집기를 고친다** — `packages/admin-ui/src/components/markdown/MarkdownEditor.vue`

(4-1) import(2-7행)를 아래로 바꾼다(`./markdown-editor.js` · `MarkdownLinkDialog` import 는 그대로 뒤에 남는다):

```ts
  import { UPLOAD_CONTENT_TYPES } from '@ssworks/admin-shared'
  import { history } from '@tiptap/pm/history'
  import { NodeSelection, Plugin } from '@tiptap/pm/state'
  import type { EditorView } from '@tiptap/pm/view'
  import { Editor } from '@tiptap/vue-3'
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import { VBtn, VBtnToggle, VDivider } from 'vuetify/components'
  import type { ImageAttachments } from '../../composables/useImageAttachments.js'
  import {
    filesOf,
    hasFiles,
    insertImagesAt,
    pastedFiles,
    sourceWithImages,
  } from './editor-images.js'
  import { createMarkdownEditorExtensions, normalizeLinkHref } from './editor-markdown.js'
```

(4-2) 머리 주석의 「링크는 BaseDialog(브라우저 prompt 금지). 도구 막대 문구는 …」 줄(28행) 뒤에:

```ts
  //  - 그림 첨부(이미지 업로드 스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` C3 · C4 · C5 · C12 · C13) —
  //    `attachments`(useImageAttachments)를 주면 그림 단추 · 파일 붙여넣기 · 파일 끌어 놓기(서식 · 원문 둘 다)가 켜진다. 편집기는
  //    `blob:` 그림만 넣고, 올리기는 저장 때 레지스트리 commit 이 한다. 거른 파일 알림은 레지스트리 onRejected(토스트 없음).
  //    레지스트리 하나를 편집기 여럿이 나눠 써도 된다. readonly 면 셋 다 꺼진다.
```

(4-3) props — `messages?: Partial<MarkdownEditorMessages>`(50행) 뒤에:

```ts
      /** 그림 첨부 레지스트리(useImageAttachments). 없으면 그림 단추 · 파일 붙여넣기 · 끌어 놓기가 없다 */
      attachments?: ImageAttachments
```

기본값 `messages: () => ({}),`(57행) 뒤에(객체 prop 은 `vue/require-default-prop` 경고 때문에 `undefined` 를 적는다):

```ts
      attachments: undefined,
```

(4-4) `const linkHref = ref('')`(82행) 뒤 · `function contentAttributes()` 앞에:

```ts

  const fileInput = ref<HTMLInputElement | null>(null)
  const sourceArea = ref<HTMLTextAreaElement | null>(null)
  /** 그림 단추의 파일 고르기 창 — 서버가 받는 원본 형식 넷 */
  const imageAccept = UPLOAD_CONTENT_TYPES.join(',')
  /** 그림을 받을 수 있는가 — 레지스트리가 있고 쓸 수 있을 때 */
  const canAttach = computed(() => props.attachments != null && !props.readonly)
```

`function contentAttributes()` 의 닫는 `}`(92행) 뒤에:

```ts

  /** 서식 편집기의 ProseMirror props — 만들 때 · readonly · label 이 바뀔 때 같은 묶음을 넘긴다(처리기가 한 벌이다) */
  function viewProps() {
    return {
      attributes: contentAttributes(),
      handlePaste: onWysiwygPaste,
      handleDOMEvents: { drop: onWysiwygDrop },
    }
  }
```

(4-5) 세 곳의 `editorProps` 를 `viewProps()` 로:

- 163행 `editorProps: { attributes: contentAttributes() },` → `editorProps: viewProps(),`
- 207행 `editor.value?.setOptions({ editorProps: { attributes: contentAttributes() } })` → `editor.value?.setOptions({ editorProps: viewProps() })`
- 213행 `() => editor.value?.setOptions({ editorProps: { attributes: contentAttributes() } }),` → `() => editor.value?.setOptions({ editorProps: viewProps() }),`

(4-6) `function onSourceInput(…) { … }`(226-231) 닫는 `}` 뒤 · `interface Tool` 앞에:

```ts

  // ── 그림 첨부 ─────────────────────────────────────────────────────

  /**
   * 받은 파일을 레지스트리에 넣고, 받아들인 그림을 지금 모드의 캐럿 자리에 넣는다. at = 서식 문서의 자리(끌어 놓기 — 없으면 선택 끝).
   * 🔴 add 전에 디바운스 중인 변경을 내보낸다(C12) — 앱의 v-model 이 편집기보다 늦으면 room() 이 남은 칸을 크게 센다.
   *    다른 편집기의 디바운스는 막지 못한다 — 앱의 저장 전 검사(count)와 서버 첨부(409)가 막는다
   */
  function attachFiles(files: readonly File[], at?: number): void {
    const attachments = props.attachments
    if (attachments == null || props.readonly || files.length === 0) return
    flush()
    const urls = attachments.add(files, lastEmitted)
    if (urls.length === 0) return
    if (mode.value === 'source') {
      insertIntoSource(urls)
      return
    }
    const instance = editor.value
    if (instance == null || instance.isDestroyed) return
    insertImagesAt(instance, at ?? instance.state.selection.to, urls)
    instance.view.focus()
  }

  /** 원문 textarea 의 캐럿 자리에 그림 줄 — 친 것과 같이 즉시 emit */
  function insertIntoSource(urls: readonly string[]): void {
    const area = sourceArea.value
    if (area == null) return
    const next = sourceWithImages(area.value, area.selectionEnd, urls)
    area.value = next.value
    area.setSelectionRange(next.caret, next.caret)
    area.focus()
    lastEmitted = next.value
    wysiwygStale = true
    emit('update:modelValue', next.value)
  }

  /** 서식 붙여넣기 — 글자 없이 파일만 올 때만 맡는다(true 면 ProseMirror 가 기본 동작을 막는다) */
  function onWysiwygPaste(_view: EditorView, event: ClipboardEvent): boolean {
    if (!canAttach.value) return false
    const files = pastedFiles(event.clipboardData)
    if (files.length === 0) return false
    attachFiles(files)
    return true
  }

  /**
   * 서식 끌어 놓기 — 바깥 파일만 맡는다. 🔴 `handleDrop` 이 아니라 `handleDOMEvents.drop` 이다 — ProseMirror 는 놓은 자리를 못 찾으면
   * (posAtCoords 가 null) handleDrop 을 부르지 않고 기본 동작도 막지 않아 브라우저가 그림 파일을 열어 버린다(초안 유실). 편집기 안에서
   * 끄는 그림 · 글자(`view.dragging` — 크롬은 그림 노드를 끌 때 파일도 싣는다)는 ProseMirror 몫이다
   */
  function onWysiwygDrop(view: EditorView, event: DragEvent): boolean {
    if (!canAttach.value || view.dragging != null) return false
    const files = filesOf(event.dataTransfer)
    if (files.length === 0) return false
    event.preventDefault()
    attachFiles(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos)
    return true
  }

  function onSourcePaste(event: ClipboardEvent): void {
    if (!canAttach.value) return
    const files = pastedFiles(event.clipboardData)
    if (files.length === 0) return
    event.preventDefault()
    attachFiles(files)
  }

  /** 원문에 파일을 놓을 수 있게 — 막지 않으면 브라우저가 그 자리 놓기를 받지 않고 파일을 연다 */
  function onSourceDragOver(event: DragEvent): void {
    if (canAttach.value && hasFiles(event.dataTransfer)) event.preventDefault()
  }

  /** 원문 끌어 놓기 — 놓은 자리가 아니라 캐럿 자리에 넣는다(textarea 는 놓은 글자 자리를 알려 주지 않는다) */
  function onSourceDrop(event: DragEvent): void {
    if (!canAttach.value) return
    const files = filesOf(event.dataTransfer)
    if (files.length === 0) return
    event.preventDefault()
    attachFiles(files)
  }

  function pickFiles(): void {
    fileInput.value?.click()
  }

  function onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = '' // 같은 파일을 다시 고를 수 있게
    attachFiles(files)
  }
```

(4-7) `interface Tool` 의 키 `Exclude<…>` 목록 끝 `| 'linkInvalid'`(246행) 뒤에 `| 'image'` 한 줄(그림 단추는 도구 묶음이 아니라 따로 그린다).

(4-8) 템플릿 — 도구 묶음 `</template>`(433행) 뒤 · `<!-- Vuetify 는 role · aria-pressed 를 달지 않는다 …-->` 주석 앞에:

```vue
      <!-- 그림 단추는 두 모드 모두에서 쓴다(원문이면 캐럿 자리에 `![](blob:…)` 줄) -->
      <template v-if="attachments">
        <VDivider class="markdown-editor__divider" vertical />
        <VBtn
          :aria-label="text.image"
          :disabled="readonly"
          icon="mdi-image-plus"
          size="small"
          :title="text.image"
          variant="text"
          @click="pickFiles"
        />
        <input
          ref="fileInput"
          :accept="imageAccept"
          hidden
          multiple
          type="file"
          @change="onFilesPicked"
        />
      </template>
```

(4-9) 원문 textarea(455-463)를 아래로 바꾼다:

```vue
      <textarea
        v-show="mode === 'source'"
        ref="sourceArea"
        :aria-label="label"
        class="markdown-editor__source"
        :readonly="readonly"
        spellcheck="false"
        :value="modelValue"
        @dragover="onSourceDragOver"
        @drop="onSourceDrop"
        @input="onSourceInput"
        @paste="onSourcePaste"
      />
```

- [ ] **Step 5: GREEN · 회귀 · 타입**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/markdown/`
Expected: PASS — `markdown-editor.render.test.ts` 45(기존 35 + 10) · `editor-images.test.ts` 13 · `editor-markdown.test.ts` 198 · 나머지 그대로.

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/legal/`
Expected: PASS(약관 편집기가 MarkdownEditor 를 쓴다 — 회귀 없음).

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0.

- [ ] **Step 6: 🔴 RED 다시 보기**
  - `attachFiles` 의 `flush()` 한 줄을 지우면 `🔴 C12 …` 하나만 FAIL(작성 때 실측 — `add:# 제1조가` 가 두 번째 emit 보다 먼저) — 되돌린다.
  - `onWysiwygDrop` 의 `|| view.dragging != null` 을 지우면 「끌어 놓기 …」 가 FAIL(`add` 가 불린다) — 되돌린다.

- [ ] **Step 7: lint · 모양 · 커밋**

Run: `pnpm exec eslint packages/admin-ui/src/components/markdown && pnpm exec prettier --check packages/admin-ui/src/components/markdown`
Expected: 오류 · 경고 0(`vue/require-default-prop` 경고가 나면 (4-3) 의 `attachments: undefined` 가 빠진 것이다).

```bash
git add packages/admin-ui/src/components/markdown/markdown-editor.ts packages/admin-ui/src/components/markdown/MarkdownEditor.vue packages/admin-ui/src/components/markdown/markdown-editor.render.test.ts
git commit -m "feat(admin-ui): MarkdownEditor attachments — 그림 단추 · 파일 붙여넣기 · 끌어 놓기(서식 · 원문) · add 앞 flush · 편집기 여럿이 한 레지스트리

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `useLegalDocuments.attachments` · `LegalDocumentEditor` prop 통과

**Files:**

- Modify: `packages/admin-ui/src/composables/useLegalDocuments.ts`(import · 머리 주석 · 옵션 · 바인딩 타입 · `requestPublish` · 바인딩)
- Modify: `packages/admin-ui/src/components/legal/LegalDocumentEditor.vue`(import · prop · 기본값 · `MarkdownEditor` 에 넘김)
- Modify: `packages/admin-ui/src/composables/useLegalDocuments.test.ts`(import · 끝에 describe)
- Modify: `packages/admin-ui/src/components/legal/legal-document-editor.render.test.ts`(import · it 하나)

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `packages/admin-ui/src/composables/useLegalDocuments.test.ts`

머리 import(1-13행)를 아래로 바꾼다:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import {
  LEGAL_BODY_MAX_LENGTH,
  type AdminLegalDocument,
  type AdminLegalHistoryItem,
  type AdminUploadCreated,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { imageFile, stubObjectUrls } from '../test/image-transfer.js'
import { useImageAttachments } from './useImageAttachments.js'
import {
  useLegalDocuments,
  type LegalDocumentsController,
  type UseLegalDocumentsOptions,
} from './useLegalDocuments.js'
```

파일 끝(`describe('useLegalDocuments — 해제', …)` 닫는 `})` 뒤)에:

```ts

describe('useLegalDocuments — 그림 첨부(이미지 업로드 C7 · C14)', () => {
  // 레지스트리는 실물(useImageAttachments) · blob: 주소만 대역. 올리기 · 지우기 어댑터는 vi.fn
  const KEY = 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp'
  const MEDIA = `/api/media/${KEY}`
  const uploaded: AdminUploadCreated = { key: KEY, url: MEDIA, width: 1, height: 1, bytes: 4 }

  beforeEach(() => {
    stubObjectUrls()
  })

  function withImage(
    overrides: Parameters<typeof useImageAttachments>[0] = {
      upload: vi.fn(async () => uploaded),
    },
  ) {
    const upload = vi.fn(overrides.upload)
    const remove = vi.fn(async (_key: string): Promise<unknown> => undefined)
    const attachments = useImageAttachments({ remove, ...overrides, upload })
    const [blob] = attachments.add([imageFile('a.png')], '')
    return { attachments, upload, remove, blob: blob! }
  }

  it('바인딩에 attachments 가 실린다 — 없으면 undefined', async () => {
    const { attachments } = withImage()
    expect(setup({ attachments }).legal.editor.value.attachments).toBe(attachments)
    expect(setup().legal.editor.value.attachments).toBeUndefined()
  })

  it('발행 = commit(초안, 발행) — 서버로 치환본, 성공 뒤 초안 · 기준도 치환본(재조회가 실패해도 blob: 이 남지 않는다)', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockRejectedValueOnce(apiError(500, 'ERR_COMMON_INTERNAL'))
    const { attachments, upload, blob } = withImage()
    const { legal, publish } = setup({ loadCurrent, attachments })
    await flush()
    legal.setDraft(`# 이용약관 v12\n\n![](${blob})\n`)
    void legal.requestPublish()
    await confirmPublish(legal)
    const final = `# 이용약관 v12\n\n![](${MEDIA})\n`
    expect(upload).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith({ kind: 'TERMS', body: final, baseLegalDocNo: 12n })
    expect(legal.loadFailed.value).toBe(true)
    expect(legal.draft.value).toBe(final)
    expect(legal.isDirty.value).toBe(false)
    expect(attachments.count(`![](${blob})`)).toBe(0)
  })

  it('업로드 실패 — 발행하지 않고 초안(blob:)을 지킨다 · 처리 표시 없이 전역 토스트(문구는 코드로)', async () => {
    const unavailable = apiError(503, 'ERR_UPLOAD_UNAVAILABLE', '서버 내부 오류가 발생했습니다.')
    const { attachments, blob } = withImage({ upload: async () => Promise.reject(unavailable) })
    const { legal, publish } = setup({ attachments })
    await flush()
    const draft = `# 이용약관 v12\n\n![](${blob})\n`
    legal.setDraft(draft)
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(publish).not.toHaveBeenCalled()
    expect(legal.draft.value).toBe(draft)
    expect(legal.isDirty.value).toBe(true)
    expect(unavailable.handled).toBe(false)
    expect(unavailable.message).toBe('이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.')
  })

  it('발행 409 — 올린 그림을 지우고(되돌림) 충돌 안내 · 초안(blob:) 보존 · 다시 발행하면 다시 올린다', async () => {
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
    const { attachments, upload, remove, blob } = withImage()
    const { legal } = setup({ publish, loadCurrent, attachments })
    await flush()
    const draft = `# 내 편집\n\n![](${blob})\n`
    legal.setDraft(draft)
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(remove).toHaveBeenCalledWith(KEY)
    expect(conflict.handled).toBe(true)
    expect(legal.conflict.value).toBe(true)
    expect(legal.draft.value).toBe(draft)

    void legal.requestPublish()
    await confirmPublish(legal)
    expect(upload).toHaveBeenCalledTimes(2)
    expect(publish).toHaveBeenLastCalledWith({
      kind: 'TERMS',
      body: `# 내 편집\n\n![](${MEDIA})\n`,
      baseLegalDocNo: 13n,
    })
  })

  it('🔴 기준 판은 확인한 번호로 보낸다 — 그림을 올리는 사이 재조회가 새 판을 가져와도(서버가 409 를 낸다)', async () => {
    const gate = deferred<AdminUploadCreated>()
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValue(TERMS_13)
    const { attachments, blob } = withImage({ upload: () => gate.promise })
    const { legal, publish } = setup({ loadCurrent, attachments })
    await flush()
    legal.setDraft(`# 내 편집\n\n![](${blob})\n`)
    void legal.requestPublish()
    legal.editor.value.publishDialog.onConfirm()
    await legal.reload()
    expect(legal.current.value?.legalDocNo).toBe(13n)
    gate.resolve(uploaded)
    await flush()
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ baseLegalDocNo: 12n }))
  })
})
```

- [ ] **Step 2: `legal-document-editor.render.test.ts` 에 it 하나** — import 의 `import type { AdminLegalDocument, AdminLegalHistoryItem } from '@ssworks/admin-shared'`(6행) 뒤에:

```ts
import { useImageAttachments } from '../../composables/useImageAttachments.js'
```

`describe('LegalDocumentEditor — 편집기 · 미리보기', …)` 의 첫 it(「편집기 이름은 「종류 본문」이고 readonly 를 넘긴다」) 뒤에:

```ts

  it('attachments 를 편집기에 그대로 넘긴다 — 있으면 그림 단추, 없으면 없다(이미지 업로드 C7)', () => {
    const imageButton = () =>
      document.querySelector('[role="toolbar"] button[aria-label="이미지 넣기"]')
    mountEditor()
    expect(imageButton()).toBeNull()
    wrapper!.unmount()
    wrapper = null
    document.body.innerHTML = ''
    const attachments = useImageAttachments({
      upload: async () => Promise.reject(new Error('올리지 않는다')),
    })
    const w = mountEditor({ attachments })
    expect(imageButton()).toBeTruthy()
    expect(w.findComponent(MarkdownEditor).props('attachments')).toBe(attachments)
  })
```

- [ ] **Step 3: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useLegalDocuments.test.ts src/components/legal/legal-document-editor.render.test.ts`
Expected: 새 여섯 중 다섯 FAIL(작성 때 실측) — 바인딩 `attachments` 가 `undefined` · `publish` 가 `blob:` 본문으로 불림 · 업로드가 안 불림(「업로드 실패」 는 publish 가 불려 FAIL) · 그림 단추 없음. `🔴 기준 판은 확인한 번호로 …` 는 지금 코드에서는 업로드 틈이 없어 그냥 PASS 한다(Step 7 이 RED 를 따로 본다). 기존 48 + 35 는 초록.

- [ ] **Step 4: 흐름을 고친다** — `packages/admin-ui/src/composables/useLegalDocuments.ts`

(4-1) `} from '../components/legal/legal-document.js'`(21행) 뒤에:

```ts
import type { ImageAttachments } from './useImageAttachments.js'
```

(4-2) 머리 주석 마지막 줄 `// 🔴 읽기 실패는 처리됨으로 표시하지 않는다(D13) …`(43행) 뒤에:

```ts
// 🔴 그림 첨부(`attachments` — 이미지 업로드 스펙 C7)가 있으면 발행은 `attachments.commit(초안, 발행)` 이다 — 그림을 올리고 주소를
//    바꾼 본문(치환본)이 서버로 간다. 성공하면 초안 · 기준도 치환본으로 바꾼다(C14) — 재조회가 실패해도 해제된 blob: 이 초안에
//    남지 않게. 실패하면 commit 이 올린 것을 지우고, 초안(blob: 그대로)은 남는다.
```

(4-3) `UseLegalDocumentsOptions` 의 `immediate?: boolean`(71행) 뒤에:

```ts
  /**
   * 그림 첨부 레지스트리(useImageAttachments — 용도는 페이지가 upload 어댑터에서 정한다, 보통 `LEGAL_UPLOAD_PURPOSE`).
   * 있으면 편집기에 그림 넣기가 켜지고 발행이 그림을 올린 뒤 치환본을 보낸다
   */
  attachments?: ImageAttachments
```

(4-4) `LegalDocumentEditorBindings` 의 `detailDialog: LegalDetailDialogBindings<R>`(104행) 뒤에:

```ts
  /** 옵션 `attachments` 그대로 — 편집기로 간다 */
  attachments?: ImageAttachments
```

(4-5) `requestPublish` — `let attempted = false` 다음 줄 `let sent = ''`(329행)를 아래로 바꾼다:

```ts
    /** 확인 순간의 초안(그림이 있으면 blob: 주소 그대로) */
    let drafted = ''
    /** 서버로 보낸 본문 — 그림이 있으면 치환본 */
    let sent = ''
```

action 안의 `attempted = true` 뒤 다섯 줄(343-348 — `sent = draft.value` 부터 `await doPublish({ … })` 의 닫는 `})` 까지)을 아래로 바꾼다:

```ts
        drafted = draft.value
        // 🔴 기준 판은 확인한 그 번호(baseNo)로 보낸다 — 그림을 올리는 사이 재조회가 current 를 새 판으로 바꿔도 409 가 난다
        const send = async (body: string): Promise<void> => {
          sent = body
          await doPublish({ kind: k, body, baseLegalDocNo: baseNo })
        }
        const attachments = options.attachments
        await (attachments == null ? send(drafted) : attachments.commit(drafted, send))
```

성공 뒤의 두 줄(358-359)

```ts
    // 🔴 재조회보다 먼저(D11)
    baseBody.value = sent
```

을 아래로 바꾼다:

```ts
    // 🔴 재조회보다 먼저(D11). 그림을 올렸으면 초안도 치환본으로(C14) — 발행 중에는 편집기가 잠겨 초안이 그대로다
    if (draft.value === drafted) draft.value = sent
    baseBody.value = sent
```

(4-6) 바인딩 `editor` 의 `detailDialog: { … },` 닫는 줄(452행 `    },`) 뒤 · `onSelectKind: selectKind,` 앞에:

```ts
    attachments: options.attachments,
```

- [ ] **Step 5: 약관 화면이 prop 을 넘긴다** — `packages/admin-ui/src/components/legal/LegalDocumentEditor.vue`

(5-1) `import type { AdminLegalDocument, AdminLegalHistoryItem } from '@ssworks/admin-shared'`(13행) 뒤에:

```ts
  import type { ImageAttachments } from '../../composables/useImageAttachments.js'
```

(5-2) props 의 `detailDialog: LegalDetailDialogBindings<R>`(68행) 뒤에:

```ts
      /** 그림 첨부 레지스트리 — 편집기로 그대로 간다(useLegalDocuments 옵션 `attachments` 가 바인딩에 싣는다) */
      attachments?: ImageAttachments
```

기본값 객체 맨 앞(`historyHeaders: () => [],` 77행 앞)에:

```ts
      attachments: undefined,
```

(5-3) 템플릿 `<MarkdownEditor`(222행) 바로 다음 줄에 `:attachments="attachments"` 를 넣는다(속성 알파벳 순서 — `:height` 앞):

```vue
      <MarkdownEditor
        :attachments="attachments"
        :height="editorHeight"
```

- [ ] **Step 6: GREEN · 회귀 · 타입**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useLegalDocuments.test.ts src/composables/useLegalDocuments.render.test.ts src/components/legal/`
Expected: PASS — `useLegalDocuments.test.ts` 53 · `useLegalDocuments.render.test.ts` 3 · `legal-document-editor.render.test.ts` 36 · `legal-document.test.ts` 7.

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0.

- [ ] **Step 7: 🔴 RED 다시 보기** — `send` 의 `baseLegalDocNo: baseNo` 를 원래의 `baseLegalDocNo: current.value?.legalDocNo ?? null` 로 되돌리면 `🔴 기준 판은 확인한 번호로 …` 가 FAIL(13n 으로 나간다) — 되돌린다. `if (draft.value === drafted) draft.value = sent` 를 지우면 「발행 = commit …」 이 FAIL(초안에 blob: 이 남는다) — 되돌린다.

- [ ] **Step 8: lint · 모양 · 커밋**

Run: `pnpm exec eslint packages/admin-ui/src && pnpm exec prettier --check packages/admin-ui/src`
Expected: 오류 · 경고 0.

```bash
git add packages/admin-ui/src/composables/useLegalDocuments.ts packages/admin-ui/src/composables/useLegalDocuments.test.ts packages/admin-ui/src/components/legal/LegalDocumentEditor.vue packages/admin-ui/src/components/legal/legal-document-editor.render.test.ts
git commit -m "feat(admin-ui): useLegalDocuments.attachments — 발행이 그림을 올리고 치환본을 보낸다 · 성공 뒤 초안 치환 · LegalDocumentEditor prop 통과

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 공개 API · peer 하한 · changeset · README · 진행 문서 · 스펙 §15

**Files:**

- Modify: `packages/admin-ui/src/index.ts` · `packages/admin-ui/src/default-messages.test.ts:8-18`
- Modify: `packages/admin-ui/package.json:46`(peer 하한)
- Create: `.changeset/admin-ui-image-attachments.md`
- Modify: `.changeset/README.md`(「0.x 동안의 peer 범위」 표 · 하한 문단)
- Modify: `packages/admin-ui/README.md`(Peer 표 114 · export 표 151 · 172 · 「마크다운 편집기」 903 · 새 절 「그림 첨부」 · 「약관」 918-947)
- Modify: `packages/admin-server/README.md:665`(「이미지 업로드」 첫 문단)
- Modify: `CLAUDE.md`(진행 표 · admin-ui 절) · `docs/01-phase0.md` §8 · `docs/HANDOFF.md`
- Modify: `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md`(끝에 §15)

- [ ] **Step 1: 실패하는 테스트** — `packages/admin-ui/src/default-messages.test.ts` 의 `DEFAULTS` 끝(`DEFAULT_MARKDOWN_EDITOR_MESSAGES: …,` 뒤)에:

```ts
  DEFAULT_IMAGE_ATTACHMENT_MESSAGES: kit.DEFAULT_IMAGE_ATTACHMENT_MESSAGES,
  DEFAULT_UPLOAD_ERROR_MESSAGES: kit.DEFAULT_UPLOAD_ERROR_MESSAGES,
```

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/default-messages.test.ts`
Expected: FAIL 둘 — `expected undefined to be type of 'object'`(아직 index 에서 나오지 않는다). 기존 12 는 초록.

- [ ] **Step 2: export** — `packages/admin-ui/src/index.ts`

「API 클라이언트」 묶음의 `export { ApiError } from './api/error.js'`(134행) 뒤에:

```ts
export {
  DEFAULT_UPLOAD_ERROR_MESSAGES,
  uploadErrorMessage,
  type UploadErrorMessages,
} from './api/upload-errors.js'
```

「마크다운 · 약관」 묶음의 `} from './components/markdown/markdown-editor.js'` 뒤(`LegalDocumentEditor` export 앞)에:

```ts
export {
  useImageAttachments,
  type UseImageAttachmentsOptions,
  type ImageAttachments,
  type ImageAttachmentProgress,
} from './composables/useImageAttachments.js'
export {
  DEFAULT_IMAGE_ATTACHMENT_MESSAGES,
  type ImageAttachmentMessages,
  type ImageAttachmentRejection,
  type ImageAttachmentRejectReason,
} from './composables/image-attachments.js'
```

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/default-messages.test.ts src/peer-deps.test.ts src/no-cycles.test.ts`
Expected: PASS — `default-messages.test.ts` 14 · `peer-deps` 2 · `no-cycles` 15.

- [ ] **Step 3: peer 하한** — `packages/admin-ui/package.json` 의 `"@ssworks/admin-shared": "workspace:>=0.4.0 <1.0.0",`(peerDependencies)를 `"@ssworks/admin-shared": "workspace:>=0.11.0 <1.0.0",` 로. 그다음:

Run: `pnpm install`
Expected: `Done`. `git status` 에 `pnpm-lock.yaml` 이 바뀌어 있으면 함께 커밋한다(peer 범위만 바꿔 바뀌지 않는 것이 보통이다).

- [ ] **Step 4: changeset** — `.changeset/admin-ui-image-attachments.md`

````markdown
---
'@ssworks/admin-ui': minor
---

편집기 그림 첨부(PR #3k — `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §2-4 · §4-3 · §14 · §15). 편집 중 그림은 브라우저 안(`blob:`)에만 두고 **저장할 때** 올려 주소를 바꾼 뒤 저장한다 — 작성하다 그만두면 서버에 아무것도 남지 않는다. 서버는 admin-server 0.11.0 의 `AdminUploadsModule` · `AdminMediaModule`.

- `useImageAttachments({ upload, remove?, policy?, mediaPath?, room?, onRejected?, messages?, errorMessages? })` → `add(files, body)` · `commit(본문, save)` · `commit([본문들], save)` · `count(본문 | 본문들)` · `busy` · `progress` · `dispose`. 거르기(형식 → 장당 크기 → 남은 칸)는 사유마다 `onRejected` 한 번. 업로드 · 저장 어느 쪽이 실패하든 이번에 올린 그림을 지우고(`remove`) 원래 예외를 다시 던진다. `room` 이 있으면 남은 칸을 앱이 센다(본문 밖 사진 · 본문 여럿과 합친 한도).
- `MarkdownEditor` prop `attachments` — 도구 막대 「이미지 넣기」 · 파일만 든 붙여넣기 · 파일 끌어 놓기(서식 · 원문). 문구 `messages.image`. 레지스트리 하나를 편집기 여럿이 나눠 써도 된다.
- `useLegalDocuments` 옵션 `attachments` · `LegalDocumentEditor` prop `attachments` — 발행이 그림을 올리고 치환본을 보낸다(성공하면 초안도 치환본으로).
- `ApiClient.api.uploadFile(url, file, config?)` — 파일을 원시 바이트로 POST(`Content-Type` = 파일 형식).
- 업로드 오류 문구 `DEFAULT_UPLOAD_ERROR_MESSAGES` · `uploadErrorMessage(error)` — 503 은 서버가 문구를 가리므로 코드로 고르고 413 은 상한을 붙인다. 레지스트리는 업로드 실패의 같은 `ApiError` 문구를 이것으로 바꾼다(전역 토스트가 그 문구를 띄운다).
- 기본 문구 `DEFAULT_IMAGE_ATTACHMENT_MESSAGES`(얼림).

**쓰는 쪽이 할 일**

1. 🔴 peer `@ssworks/admin-shared` 하한이 `>=0.11.0` 이 됐다 — 세 패키지를 같은 번호로 설치한다.
2. 그림을 쓰지 않는 앱은 할 일 없음. `MarkdownEditorMessages` 를 자기 타입으로 **전부** 채워 두는 앱(부분 덮기가 아닌)은 `image` 키를 더한다.
3. 그림을 쓰는 앱: 서버에 `AdminUploadsModule` · `AdminMediaModule`(admin-server README 「이미지 업로드」), 화면에 `useImageAttachments` → 편집기 `:attachments`, 저장은 `attachments.commit(초안, save)`. 🔴 `save` 안에서 받은 치환본으로 초안 · 「바뀜」 기준을 바꾼다 — 성공 뒤 `blob:` 주소는 해제된다(admin-ui README 「그림 첨부」).
````

- [ ] **Step 5: `.changeset/README.md`** — 「0.x 동안의 peer 범위」 표의 admin-ui 행을

```markdown
| admin-ui     | `workspace:>=0.11.0 <1.0.0`  | `>=0.11.0 <1.0.0` |
```

로 바꾸고, 그 아래 문단의 "**admin-ui 의 하한**도 같은 규칙이다 — PR #3f(감사 로그 화면)부터 `>=0.4.0` 이다. `coreAuditCatalog` 를 런타임에 쓰기 때문이다." 뒤에 한 문장: "PR #3k(편집기 그림 첨부)부터 `>=0.11.0` 이다 — 업로드 계약(`UPLOAD_CONTENT_TYPES` · `DEFAULT_UPLOAD_POLICY` · `collectUploadKeys` · `CommonErrorCodes.ERR_UPLOAD_*`)을 런타임에 쓴다."

- [ ] **Step 6: admin-ui README** — `packages/admin-ui/README.md`

(6-1) 「Peer 의존」 표의 `@ssworks/admin-shared` 행 설명을 `` `>=0.11.0 <1.0.0` — 감사 카탈로그 · 오류 코드 · 스키마 · 업로드 계약. 세 패키지를 같은 번호로 설치한다 `` 로.

(6-2) 「셸 · 내비게이션 · 인프라」 export 표 — 세 군데:

- `createApiClient` 행 설명 끝(`onError` 콜백 뒤)에 이 글자를 붙인다:

```text
 · `api.uploadFile`(원시 바이트 업로드)
```

- `MarkdownEditor` 행 설명의 첫 줄 글자를 둘째 줄로 바꾼다:

```text
`messages`, `editor` · `flush()` expose
`messages` · `attachments`(그림 첨부), `editor` · `flush()` expose
```

- `MarkdownEditor` 행 바로 아래에 새 행:

```markdown
| `useImageAttachments` · `UseImageAttachmentsOptions` · `ImageAttachments` · `ImageAttachmentProgress` · `ImageAttachmentMessages` · `ImageAttachmentRejection` · `ImageAttachmentRejectReason` · `DEFAULT_IMAGE_ATTACHMENT_MESSAGES` · `uploadErrorMessage` · `UploadErrorMessages` · `DEFAULT_UPLOAD_ERROR_MESSAGES` | 편집기 그림 첨부 레지스트리 — 편집 중 `blob:` · 저장 때 올린다(`commit`). 업로드 오류 문구. 아래 「그림 첨부」 |
```

(6-3) 「마크다운 편집기」 절의 `- **그림** — 업로드 UI 는 없다. …` 줄(903)을:

```markdown
- **그림** — `![alt](주소)` 를 치거나 붙여 넣은 HTML 의 `<img>` 가 그림 노드가 된다. 킷은 그림 주소를 거르지 않는다(거르기는 앱 몫 — 렌더 쪽에서). 파일을 올려 넣으려면 `attachments` — 아래 「그림 첨부」.
```

(6-4) 「마크다운 편집기」 절 마지막 bullet(「테스트가 잴 수 없어 사람이 확인하는 것 — …」) 뒤 · `## 약관` 앞에 새 절:

````markdown
### 그림 첨부

`attachments`(`useImageAttachments`)를 주면 도구 막대에 「이미지 넣기」 단추가 생기고, 파일 붙여넣기 · 끌어 놓기를 받는다. 편집 중 그림은 브라우저 안(`blob:`)에만 있고 **저장할 때** 올라간다 — 작성하다 그만두면 서버에 아무것도 남지 않는다. 서버는 admin-server README 「이미지 업로드」(`AdminUploadsModule` · `AdminMediaModule`).

```ts
const attachments = useImageAttachments({
  upload: (file) =>
    api.uploadFile<AdminUploadCreated>('/admin/uploads', file, { params: { purpose: 'notice' } }),
  remove: (key) => api.del(`/admin/uploads/${key}`),
  onRejected: (notice) => toast.warning(notice.message),
})

// 저장 — 본문에 남은 그림을 올리고, 주소를 바꾼 본문(final)으로 저장한다
await flow.run({
  action: () =>
    attachments.commit(draft.value, async (final) => {
      await api.put(`/admin/notices/${noticeNo}`, { body: final })
      draft.value = final // 🔴 저장 뒤 초안을 치환본으로(아래)
      savedBody.value = final
    }),
})
```

```vue
<MarkdownEditor v-model="draft" :attachments="attachments" />
```

- **넣기** — 단추(여러 장) · 파일만 든 붙여넣기(스크린숏 · 이미지 복사 — 글자가 함께 오면 기본 붙여넣기다. Word · 엑셀 복사는 글자와 함께 그림 한 장을 싣는다) · 파일 끌어 놓기(놓은 자리). 「원문」 탭에서도 캐럿 자리에 `![](blob:…)` 줄이 들어간다. `readonly` 면 셋 다 꺼진다.
- **거르기** — 형식(JPG · PNG · WebP · GIF) → 장당 크기(`policy.maxBytes`, 기본 10MB) → 남은 칸. 남은 칸은 `policy.maxPerBody`(기본 20) − 본문의 우리 그림(`mediaPath`, 기본 `/api/media`) − 본문 안 `blob:`. 거른 것은 사유마다 `onRejected` 한 번(편집기는 토스트를 띄우지 않는다). 최종 판정은 서버다.
- **저장(`commit`)** — 본문에 **남아 있는** 그림만 등록 순서로 하나씩 올리고 주소를 모두 바꿔 `save` 를 부른다. 지웠다 되돌린 그림도 저장 순간 본문에 있으면 올라간다. 업로드 · `save` 어느 쪽이 실패하든 이번에 올린 그림을 지우고(`remove` — 기다리지 않는다) 원래 예외를 다시 던진다. 초안(`blob:`)은 그대로라 다시 저장하면 다시 올린다. 진행 중에 다시 부르면 거부한다. `busy` · `progress`(`{ done, total }`)로 진행을 그릴 수 있다(`DEFAULT_IMAGE_ATTACHMENT_MESSAGES.uploading`).
- 🔴 **저장 뒤 초안을 치환본으로 바꾼다** — 성공하면 그 `blob:` 주소는 해제된다. `save` 안에서 받은 `final(s)` 로 초안과 「바뀜」 판정 기준을 바꾸지 않으면 편집기의 그림이 깨지고 「바뀜」 이 남는다. `useLegalDocuments` 는 이것을 스스로 한다.
- **실패 문구** — 업로드 실패는 같은 `ApiError` 의 문구를 킷 표(`DEFAULT_UPLOAD_ERROR_MESSAGES` — `errorMessages` 로 덮는다)로 바꾼다. 503 은 서버가 문구를 가리므로 코드로 고르고, 413 은 상한을 붙인다(「이미지가 너무 큽니다. (장당 최대 10MB)」). 전역 토스트(`onError`)가 그 문구를 띄운다. 직접 그리는 화면은 `uploadErrorMessage(error)`.
- **본문 여럿 · 합 한도**(카드 하나에 편집기 여럿 · 본문 밖 사진과 합친 한도) — 레지스트리 하나를 편집기 여럿에 넘기고 `room: () => 한도 − 사진 수 − attachments.count([본문들])` 로 남은 칸을 앱이 센다(그때 `messages.rejectedFull` 은 앱의 말로). 저장은 `attachments.commit([본문1, 본문2], async (finals) => …)` — 같은 길이 · 순서의 치환본. 편집기는 그림을 넣기 전에 자기 디바운스를 내보내(`flush`) `room()` 이 늦은 값을 보지 않게 한다 — 다른 편집기의 디바운스(200ms 안에 편집기를 바꿔 붙여넣기)는 앱의 저장 전 검사(`count`)와 서버 첨부(409)가 막는다.
- 🔴 **「원문」 탭에서 `blob:` 주소를 고치지 않는다** — 등록 주소와 달라지면 올라가지 않고 그대로 저장돼 그림이 깨진다.
- 레지스트리는 만든 스코프(컴포넌트)가 끝날 때 남은 주소를 해제한다(`dispose`). 편집기 하나가 사라져도 등록은 남는다 — 본문은 앱이 갖고 있다.
- 편집 영역 밖(도구 막대 · 페이지)에 놓은 파일은 브라우저 기본 동작(파일 열기)이다 — 킷은 페이지 전역 끌어 놓기를 막지 않는다.
- 테스트가 잴 수 없어 사람이 확인하는 것 — OS 클립보드 스크린숏 붙여넣기 · 탐색기에서 끌어 놓기 · 한글 조합 중 붙여넣기 · 모바일.
````

(6-5) 「약관」 → 「Phase 2 서버를 쓰는 새 서비스」 코드: `const legal = useLegalDocuments({` 앞에

```ts
const attachments = useImageAttachments({
  upload: (file) =>
    api.uploadFile<AdminUploadCreated>('/admin/uploads', file, {
      params: { purpose: LEGAL_UPLOAD_PURPOSE },
    }),
  remove: (key) => api.del(`/admin/uploads/${key}`),
  onRejected: (notice) => toast.warning(notice.message),
})
```

를 넣고, `onDone: (e) => toast.success(e.message),` 뒤에 `  attachments, // 그림 첨부(선택) — 서버에 AdminUploadsModule · AdminMediaModule 이 있을 때` 한 줄. 아래 bullet 목록 끝에:

```markdown
- `attachments`(선택) — 편집기에 그림 넣기가 켜지고 발행이 `attachments.commit(초안, 발행)` 이 된다. 업로드 · 발행 어느 쪽이 실패하든 올린 그림을 지우고 초안(`blob:`)은 남는다(409 충돌 안내는 그대로). 성공하면 초안을 치환본으로 바꾼다. 용도는 `LEGAL_UPLOAD_PURPOSE`(`'legal'` — 서버는 `AdminLegalModule` 이 있으면 자동 등록, 권한은 `legal.publish` 슬롯) — 「마크다운 편집기」 → 「그림 첨부」.
```

- [ ] **Step 7: admin-server README** — `packages/admin-server/README.md` 665행 첫 문장 "편집기(admin-ui `MarkdownEditor`)가 그림을 올리고 본문에 `![](/api/media/<키>)` 를 넣는다(admin-ui 쪽은 PR #3k — 아직 나오지 않았다. 그 전에는 앱이 `POST /admin/uploads` 를 직접 부른다)." 를 아래로 바꾼다(문단의 나머지는 그대로):

```markdown
편집기(admin-ui `MarkdownEditor` + `useImageAttachments` — admin-ui README 「그림 첨부」)는 편집 중 그림을 브라우저 안(`blob:`)에 두고, 저장할 때 `POST /admin/uploads` 로 올려 본문의 주소를 `/api/media/<키>` 로 바꾼 뒤 저장한다(실패하면 올린 것을 `DELETE` 로 지운다).
```

- [ ] **Step 8: CLAUDE.md**

(8-1) 진행 표의 「Phase 2 후속 PR 2h …」 행 바로 아래에:

```markdown
| Phase 1 후속 PR #3k — 편집기 그림 첨부(`useImageAttachments` · `MarkdownEditor` `attachments` · `ApiClient.uploadFile` · 업로드 오류 문구 · `useLegalDocuments.attachments` · peer 하한 0.11.0) | 완료 | 스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md`(§14 · §15) · 플랜 `docs/superpowers/plans/2026-11-11-admin-ui-image-attachments.md` · 검증 `docs/verification/2026-11-11-admin-ui-image-attachments.md` |
```

(8-2) 「### `@ssworks/admin-ui`」 절 마지막 bullet 뒤에:

```markdown
- 그림 첨부는 저장 시점이다 — 편집기는 `blob:` 만 넣고 `useImageAttachments().commit` 이 올린다. 🔴 commit 은 되돌림(remove)을 기다리지 않고 원래 예외를 곧바로 다시 던진다 — 기다리면 `ApiError.handled` 계약(한 매크로태스크)이 깨져 useWriteFlow 가 처리한 오류가 전역 토스트로도 뜬다. 업로드 실패 문구는 새 오류를 만들지 않고 같은 ApiError 의 message 를 바꾼다(503 은 서버가 가린다 — `api/upload-errors.ts`). 편집기의 ProseMirror props 는 `viewProps()` 한 벌(만들 때 · readonly · label)이고, 파일 끌어 놓기는 `handleDOMEvents.drop` 이다(`handleDrop` 은 놓은 자리를 못 찾으면 불리지 않아 브라우저가 파일을 연다).
```

- [ ] **Step 9: `docs/01-phase0.md` §8** — 「이미지 업로드 서버 PR 2h(2026-11-02) 완료 — …」 문단 끝의 ` PR #3k(admin-ui) 가 다음.` 을 지우고, 그 문단 뒤(「다음:」 앞)에 새 문단(`<완료일>` 은 실제 날짜로):

```markdown
admin-ui 편집기 그림 첨부 PR #3k(<완료일>) 완료 — `useImageAttachments`(`blob:` 레지스트리 · 저장 시점 `commit` 문자열 · 배열 · `count` · `room` · 되돌림) · `MarkdownEditor` `attachments`(그림 단추 · 파일 붙여넣기 · 끌어 놓기 — 서식 · 원문) · `ApiClient.uploadFile` · 업로드 오류 문구(503 은 코드로) · `useLegalDocuments.attachments` · peer 하한 0.11.0(스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §2-4 · §14 · §15 · 플랜 `docs/superpowers/plans/2026-11-11-admin-ui-image-attachments.md` · 검증 `docs/verification/2026-11-11-admin-ui-image-attachments.md`). 입력 셋째(sseng-home §14 C9 ~ C14)를 함께 실었다.
```

- [ ] **Step 10: HANDOFF** — `docs/HANDOFF.md`

(10-1) 머리 `# HANDOFF — 2026-11-02` 의 날짜를 완료일로.

(10-2) 「지금 상태」 admin-ui 행(11행)의 끝 — 아래 첫 줄의 글자(그 행에 한 번만 있다) — 바로 뒤, 닫는 `|` 앞에 둘째 줄의 글자를 붙인다:

```text
0.10.0 예정 · **`main` push 는 사람이 한다**)
 · **PR #3k**(편집기 그림 첨부 — `useImageAttachments` · `MarkdownEditor` `attachments` · `uploadFile` · 약관 첨부 — 브랜치 `feat/admin-ui-image-attachments`, 0.14.0 예정 · **push · PR 은 사람**)
```

(10-3) 「다음 플랜」 행(16행)의 첫 문장 — `**PR 2h 뒤**: PR #3k —` 로 시작해 `admin-ui peer admin-shared 하한 0.11.0.` 으로 끝나는 글자 — 를 아래로 바꾼다(뒤의 `**PR #3i · 2g 뒤**: …` 는 그대로):

```markdown
**PR #3k 뒤**(편집기 그림 첨부 — 브랜치 `feat/admin-ui-image-attachments`): 사람이 브랜치 push → PR → CI → `main` 병합 → Version Packages PR(0.14.0 ×3 — admin-ui minor · major 없음) 병합 → `pnpm stage approve` ×3 → 태그. 그다음 sseng-home 이 공개 하루 뒤 설치해 자기 설계서 §6-5 를 고쳐 잇는다(스펙 §14 C9 ~ C14 — 아래 「PR #3k 가 넘긴 것」) · ringside · 템플릿 입력.
```

(10-4) 「알려진 미확인·보류」 의 「PR #3j 가 넘긴 것」 묶음 끝(`## 작업 폴더 밖에 남은 것` 제목 바로 앞)에:

```markdown
- **PR #3k 가 넘긴 것(<완료일>)** — 스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md`(§14 · §15) · 플랜 `docs/superpowers/plans/2026-11-11-admin-ui-image-attachments.md` · 검증 `docs/verification/2026-11-11-admin-ui-image-attachments.md`
  - 킷이 정한 것(스펙 §15): 되돌림을 기다리지 않는다(`handled` 계약) · 업로드 실패 문구는 같은 ApiError 의 message 를 코드로 바꾼다(503 · 413 상한) · 끌어 놓기는 `handleDOMEvents.drop` · 붙여넣기는 글자 없이 파일만 · 그림 단추는 원문에서도 · 약관도 발행 뒤 초안을 치환본으로 · 기준 판은 확인한 번호로.
  - **sseng-home 적용(0.14.0 공개 하루 뒤 설치)**: 자기 설계서 §6-5 를 고쳐 잇는다 — 사례 · 공지 본문은 레지스트리 하나 + `room: () => 20 − 사진 수 − attachments.count([본문])` + `messages.rejectedFull`(합 한도 문구), 사업영역 카드는 카드마다 레지스트리 하나를 편집기 여럿에 넘기고 `commit([설명들], save)`. 🔴 `save` 안에서 받은 `finals` 로 초안 · 바뀜 기준을 바꾼다(C14). 자기 원시 업로드(`postRaw`)는 `api.uploadFile` 로 바꿀 수 있다(같은 원시 바이트 · Content-Type).
  - **ringside · 템플릿 입력**: ringside 는 자기 즉시 업로드 큐를 둘지 킷 레지스트리(저장 시점)로 갈지 정한다 — 킷은 정본(`upload-queue.ts`)과 달리 고른 즉시 올리지 않는다. 템플릿 `preset/admin` 약관 페이지에 `useImageAttachments`(용도 `LEGAL_UPLOAD_PURPOSE`) 한 벌 — 서버 쪽 입력은 「작업 폴더 밖에 남은 것」 의 PR 2h 줄.
  - 사람이 확인할 것: OS 클립보드 스크린숏 붙여넣기 · 탐색기에서 끌어 놓기 · 한글 조합 중 붙여넣기(ProseMirror 는 조합 중 붙여넣기를 브라우저에 맡긴다) · 모바일 · 편집 영역 밖(도구 막대 · 페이지) 드롭(브라우저가 파일을 연다 — 킷 범위 밖). 실브라우저 결과는 검증 기록.
```

- [ ] **Step 11: 스펙 §15** — `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` 끝에(`<완료일>` 은 실제 날짜로):

```markdown

## 15. 구현 중 정정 (PR #3k — <완료일>)

스펙과 다르게 한 것 · 스펙이 정하지 않아 구현(플랜 `docs/superpowers/plans/2026-11-11-admin-ui-image-attachments.md` 「플랜이 정한 것」)이 정한 것과 그 이유.

- **§5-2 · C2 되돌림을 기다리지 않는다**: 의사 코드의 `await remove(key)` 뒤 다시 던지기를 "remove 를 시작만 하고 원래 예외를 곧바로 다시 던진다" 로 바꿨다. 기다리면 `createApiClient` 의 지연 `onError`(한 매크로태스크 뒤)가 먼저 돌아 useWriteFlow 가 처리할 revision 충돌 · 칸 오류까지 전역 토스트로 뜬다(`ApiError.handled` 계약). 되돌림 실패는 `handled` 로 표시해 삼킨다(저장 성공 · 응답 유실의 404 토스트도 막는다).
- **§4-3 · §6 · §8 오류 문구 표**: admin-ui 에 코드 → 문구 표가 없어 `api/upload-errors.ts`(`DEFAULT_UPLOAD_ERROR_MESSAGES` · `uploadErrorMessage`)를 새로 뒀다(§8 의 `api/error-messages` 자리). commit 이 **업로드 단계** 실패의 같은 ApiError message 를 이 표로 바꾼다 — 503 은 코드로, 413 은 `details.maxBytes` 를 붙여 「(장당 최대 10MB)」. 저장(save) 단계 오류는 바꾸지 않는다(4xx 서버 문구 그대로). 레지스트리 옵션 `errorMessages` 를 더했다.
- **C3 끌어 놓기는 `handleDOMEvents.drop`**: ProseMirror(1.42.8)는 놓은 자리(`posAtCoords`)를 못 찾으면 `handleDrop` 을 부르지 않고 기본 동작도 막지 않아 브라우저가 그림 파일을 연다(초안 유실). 편집기 안 끌기(`view.dragging`)는 ProseMirror 몫으로 둔다.
- **C3 붙여넣기는 글자 없이 파일만 올 때**: 클립보드에 글자가 함께 오면(Word · 엑셀 · 웹 문서 복사는 내용의 그림 한 장을 싣는다) 기본 붙여넣기다(ringside 와 같다).
- **C3 그림 단추는 원문 모드에서도**: 원문 textarea 의 캐럿 자리에 `![](blob:…)` 줄을 넣는다. 꺼지는 것은 readonly 뿐이다. 원문 끌어 놓기도 캐럿 자리다. 원문 dragover 는 파일을 끌 때 막는다(브라우저는 dragover 동안 `files` 를 비워 둔다 — `types` 의 `'Files'` 로 본다).
- **C4 넣는 자리**: 선택이 있으면 지우지 않고 선택 끝에 넣는다. 여러 장은 한 트랜잭션(되돌리기 한 번). 캐럿 규칙은 `EditorImage` 입력 규칙의 것을 `moveCaretAfterImage` 로 꺼내 함께 쓴다. 넣은 뒤 편집기에 포커스.
- **C7 · C14 약관도 초안을 치환본으로 · 기준 판은 확인한 번호로**: §14 C14 는 약관을 "발행 뒤 이력을 다시 읽어 해당 없다" 고 했지만 재조회가 실패하면 해제된 `blob:` 이 초안에 남는다 — 발행 성공 뒤 초안 · 비교 기준을 보낸 치환본으로 바꾼다. 기준 판 번호는 확인 순간의 번호로 보낸다 — 그림을 올리는 비동기 틈에 재조회가 current 를 새 판으로 바꿔도 409 가 나게(전에는 틈이 없었다).
- **C1 문구 모양**: `rejectedType(count)` · `rejectedSize(count, maxBytes)` · `rejectedFull(count)` · `uploading(done, total)`. `rejectedFull` 은 한도 숫자를 싣지 않는다 — `room`(C9)을 쓰는 앱의 한도는 킷이 모른다.
- **C2 재진입 · 해제**: 진행 중 commit 은 `Error('useImageAttachments: commit 이 이미 진행 중이다')` 로 거부한다(보통은 useWriteFlow 의 submitting 이 먼저 막는다). dispose 뒤 `add` 는 빈 배열, 진행 중 commit 은 시작할 때 붙잡은 파일로 끝까지 간다. 남은 칸은 0 이하 · NaN 이면 0, 소수는 내림, Infinity 는 그대로.
- **C6 `uploadFile(url, file: Blob, config?)`**: 형식이 비면 `application/octet-stream`(서버 415). `transformRequest` 는 그대로 넘김 — happy-dom 의 File 은 태그가 `[object File]` 이 아니라 axios 가 JSON 으로 바꿨다(실측).
- **공개 이름 더한 것**: `ImageAttachmentProgress` · `ImageAttachmentRejectReason` · `DEFAULT_UPLOAD_ERROR_MESSAGES` · `UploadErrorMessages` · `uploadErrorMessage` · `MarkdownEditorMessages.image`(「이미지 넣기」) · `LegalDocumentEditorBindings.attachments?`.
- **편집 영역 밖 드롭**: 도구 막대 · 페이지에 놓은 파일은 다루지 않는다(브라우저 기본 — 페이지 전역 문제). README 에 적었다.
```

(실브라우저 확인 · 리뷰에서 더 바뀐 것이 있으면 Task 9 · 10 이 이 절에 줄을 더한다.)

- [ ] **Step 12: 모양 · 검사 · 커밋**

Run: `pnpm format && pnpm format:check`
Expected: 통과(표가 다시 정렬된다. `docs/verification` · `CHANGELOG.md` 는 prettier 밖).

Run: `pnpm --filter @ssworks/admin-ui test`
Expected: **85 파일 · 1486 테스트** 초록(「기준 수」).

```bash
git add packages/admin-ui/src/index.ts packages/admin-ui/src/default-messages.test.ts packages/admin-ui/package.json pnpm-lock.yaml .changeset/admin-ui-image-attachments.md .changeset/README.md packages/admin-ui/README.md packages/admin-server/README.md CLAUDE.md docs/01-phase0.md docs/HANDOFF.md docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md
git commit -m "docs(admin-ui): 그림 첨부 공개 API · peer 하한 0.11.0 · changeset minor · README 「그림 첨부」 · 진행 문서 · 스펙 §15

Co-Authored-By: Claude <noreply@anthropic.com>"
```

(`pnpm-lock.yaml` 이 바뀌지 않았으면 `git add` 가 아무것도 더하지 않는다 — 그대로 둔다.)

---

### Task 8: 전체 검사 · changeset status · 검증 기록 시작

**Files:**

- Create: `docs/verification/2026-11-11-admin-ui-image-attachments.md`

- [ ] **Step 1: admin-shared · admin-server 소스가 그대로인지** — `pnpm test:db` 를 생략하는 근거다

Run: `git diff --stat bc5f238..HEAD -- packages/admin-shared/src packages/admin-server/src`
Expected: 출력 없음. 무엇이든 나오면 멈추고 보고한다(그때는 `pnpm db:test:up` 뒤 `pnpm test:db` 를 돌려야 한다 — 11.4 · 12.3 둘).

- [ ] **Step 2: `pnpm check`**

Run: `pnpm check`
Expected: lint → typecheck → test → build → check:dts 모두 초록. admin-ui 85 파일 · 1486 테스트, 워크스페이스 189 파일 · 2477 테스트(작성 때 185 · 2405 + 4 · 72).

- [ ] **Step 3: 빌드 산출 · changeset**

Run: `node -e "const s=require('fs').readFileSync('packages/admin-ui/dist/index.js','utf8');console.log(['useImageAttachments','uploadErrorMessage','DEFAULT_IMAGE_ATTACHMENT_MESSAGES','DEFAULT_UPLOAD_ERROR_MESSAGES'].map((n)=>n+':'+s.includes(n)).join(' '))"`
Expected: 넷 다 `true`.

Run: `node -e "const s=require('fs').readFileSync('packages/admin-ui/dist/composables/useImageAttachments.d.ts','utf8');console.log((s.match(/commit<T>/g)||[]).length, s.includes('count(markdown'))"`
Expected: `2 true`(겹쳐 쓰기 둘이 d.ts 에 남는다).

Run: `pnpm changeset status --verbose`
Expected: `@ssworks/admin-ui` minor → `fixed` 라 세 패키지 0.14.0, major 없음.

Run: `pnpm format:check`
Expected: 통과.

- [ ] **Step 4: 검증 기록을 쓴다** — `docs/verification/2026-11-11-admin-ui-image-attachments.md`(prettier 밖 — 손으로 정렬, `<…>` 는 실측으로 채우고 남기지 않는다)

```markdown
# 검증 — admin-ui 편집기 그림 첨부 (PR #3k, <완료일>)

스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §9-1 · §9-3 · §14 · §15 · 플랜 `docs/superpowers/plans/2026-11-11-admin-ui-image-attachments.md`.

## 1. 저장소

- 브랜치 `feat/admin-ui-image-attachments` · 바탕 `bc5f238` · 끝 커밋 `<해시>`(이 기록 커밋 직전)
- 작성 때 기준: admin-ui 81 파일 · 1414 테스트 · 워크스페이스 185 파일 · 2405 테스트
- `pnpm check` 초록 — admin-ui <85> 파일 · <1486> 테스트 · 워크스페이스 <n>
- `pnpm format:check` 통과
- `changeset status --verbose` — minor: admin-ui → fixed 라 세 패키지 0.14.0, major 없음
- admin-shared · admin-server 소스 변경 없음(`git diff --stat bc5f238..HEAD -- packages/admin-shared/src packages/admin-server/src` 빈 출력) → `pnpm test:db` 생략
- dist: `useImageAttachments` · `uploadErrorMessage` · 기본 문구 둘이 `index.js` 에, `commit<T>` 겹쳐 쓰기 둘이 d.ts 에

## 2. 확인용 앱(`$LOCALAPPDATA/Temp/aksu` — Task 9)

## 3. 실브라우저(Task 9)

## 4. 최종 리뷰(Task 10)

## 5. 남은 것
```

작성 때 워크스페이스 합계(`pnpm test` — 2026-11-11, bc5f238): **185 파일 · 2405 테스트**. 이 값을 §1 의 둘째 줄에 옮겨 적는다(끝 수는 189 파일 · 2477 테스트).

- [ ] **Step 5: 커밋**

```bash
git add docs/verification/2026-11-11-admin-ui-image-attachments.md
git commit -m "docs: PR #3k 검증 기록 — pnpm check · changeset status · dist

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 실브라우저 확인 — 확인용 앱 aksu(실서버 + 확인용 웹)

스펙 §9-3: 단추 · 붙여넣기 · 끌어 놓기 · 미리보기에 보임 · 발행 → 이력 원문이 `/api/media/legal/…` · 그림이 중계로 보임(200 · 304) · 실패하면 오류 토스트 · 초안 보존 · 되돌림(표에 미첨부가 남지 않음) · 콘솔 오류 없음. 저장소 안에 확인용 앱이 없어(작성 때 확인 K14) `$LOCALAPPDATA/Temp/aksu` 에 새로 세운다 — 서버는 2026-10-16 확인 플랜의 akss 레시피(`docs/superpowers/plans/2026-10-16-aksv-real-server.md` Task 1)를 업로드 모듈만으로 줄인 것, 웹은 #3j 스모크(`aksj`)처럼 tarball 소비 앱이다. 이 앱의 `vue-tsc` · `vite build` 가 `/smoke`(`.claude/commands/smoke.md`)를 대신한다. **저장소에는 검증 기록만 남는다.**

🔴 이 Task 의 코드는 작성 때 **돌려 보지 못했다**(플랜 작성 범위 밖 — Docker · 설치가 필요하다). 옵션 이름 · 칸 이름이 어긋나 `tsc` 가 멈추면 코드가 아니라 패키지 d.ts(`node_modules/@ssworks/admin-server/dist/**/*.d.ts`)를 정본으로 고친다. 확인 중 킷 결함이 나오면 superpowers:systematic-debugging 으로 원인을 확정하고, 작은 것은 워크트리에서 TDD 로 고친 뒤(테스트 → RED → 수정 → GREEN → `pnpm check`) tarball 을 다시 만들어 바꿔 끼우고(Step 1 → web `pnpm install`), 스펙 §15 에 한 줄 · 커밋. 설계 판단이 필요하면 멈추고 보고한다.

**경로:** `AKSU="$LOCALAPPDATA/Temp/aksu"`(Git Bash). 서버 4100 · 웹 5181. DB `admin-kit-test-db`(33306) 의 `aksu`.

- [ ] **Step 1: tarball 셋**

```bash
AKSU="$LOCALAPPDATA/Temp/aksu"
node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" "$AKSU"
mkdir -p "$AKSU/server/src" "$AKSU/web/src"
cd /c/workspace/ssworks-admin-kit/.worktrees/admin-ui-image-attachments
pnpm build
pnpm --filter @ssworks/admin-shared pack --pack-destination "$AKSU"
pnpm --filter @ssworks/admin-ui pack --pack-destination "$AKSU"
pnpm --filter @ssworks/admin-server pack --pack-destination "$AKSU"
ls "$AKSU"
```

Expected: `ssworks-admin-shared-0.13.0.tgz` · `ssworks-admin-ui-0.13.0.tgz` · `ssworks-admin-server-0.13.0.tgz`(번호가 다르면 아래 두 `package.json` 의 `file:` 이름을 그 번호로).

- [ ] **Step 2: 서버 파일** — `$AKSU/server/`

`package.json`:

```json
{
  "name": "aksu-server",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.8.1",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@kim5257/kysely-mariadb-dialect": "^0.2.0",
    "@nestjs/common": "^12.1.2",
    "@nestjs/core": "^12.1.2",
    "@nestjs/platform-express": "^12.1.2",
    "@ssworks/admin-server": "file:../ssworks-admin-server-0.13.0.tgz",
    "@ssworks/admin-shared": "file:../ssworks-admin-shared-0.13.0.tgz",
    "kysely": "^0.29.6",
    "mariadb": "^3.5.4",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "sharp": "^0.35.5",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^24.0.0",
    "typescript": "~6.0.3"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`.env`:

```
DB_HOST=127.0.0.1
DB_PORT=33306
DB_USER=root
DB_PASSWORD=admin-kit-test
DB_NAME=aksu
ADMIN_JWT_SECRET=aksu-image-attachments-check-jwt-secret-0123
```

`src/app.module.ts`:

```ts
// aksu — PR #3k 실브라우저 확인용 쓰는 쪽 서버(B). 코어 + 인증 · 감사 · 약관 · 업로드 · 중계. 저장소는 파일 시스템(uploads/).
import { existsSync } from 'node:fs'
import { Controller, Get, Module } from '@nestjs/common'
import {
  AdminAuditModule,
  AdminAuthModule,
  AdminLegalModule,
  AdminMediaModule,
  AdminServerModule,
  AdminUploadsModule,
  Public,
  adminDbConnectionFromEnv,
  createFileSystemStorage,
  requireEnv,
  type AdminObjectStorage,
} from '@ssworks/admin-server'

@Public()
@Controller('health')
class HealthController {
  @Get()
  ok() {
    return { ok: true }
  }
}

/** 확인용 스위치 — 서버 폴더에 `storage-off` 파일이 있으면 저장소 put 이 던진다(503 확인 · 재기동 없이) */
function switchableStorage(): AdminObjectStorage {
  const files = createFileSystemStorage({ root: 'uploads' })
  return {
    put: (key, body, contentType) =>
      existsSync('storage-off')
        ? Promise.reject(new Error('aksu: storage-off'))
        : files.put(key, body, contentType),
    get: (key) => files.get(key),
    delete: (key) => files.delete(key),
  }
}

@Module({
  imports: [
    // 🔴 코어 모듈을 먼저(종료 때 정리 타이머가 DB 풀보다 먼저 멈춘다 — admin-server 0.11.0 changeset)
    AdminServerModule.forRootAsync({
      useFactory: () => {
        requireEnv(['ADMIN_JWT_SECRET'])
        return {
          db: adminDbConnectionFromEnv(),
          auth: { jwtSecret: process.env.ADMIN_JWT_SECRET! },
          permissions: {
            'legal.read': 'settings.legal:read',
            'legal.publish': 'settings.legal:publish',
            'auditLogs.read': 'settings.auditLog:read',
          },
          legal: { kinds: ['TERMS', 'PRIVACY'] },
          uploads: { storage: switchableStorage() },
        }
      },
    }),
    AdminAuthModule,
    AdminAuditModule,
    AdminLegalModule,
    AdminUploadsModule,
    AdminMediaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

`src/main.ts`:

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { assertUtcTimezone, configureAdminApp, loadDotEnv } from '@ssworks/admin-server'
import { AppModule } from './app.module.js'

loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('aksu')
const app = await NestFactory.create<NestExpressApplication>(AppModule)
configureAdminApp(app)
app.setGlobalPrefix('api')
app.enableShutdownHooks()
await app.listen(4100, '127.0.0.1')
```

`seed.mjs`(장 열셋 + 관리자 하나 — 장은 패키지 장 모듈을 Kysely Migrator 로 직접 돌린다. 스텁 · kysely-ctl 이 필요 없다):

```js
// aksu 시드 — 장 열셋을 적용하고 관리자 하나(admin / admin1234 · 전체 권한)를 넣는다. DB 는 비어 있어야 한다(Step 4).
import { Migrator } from 'kysely/migration'
import {
  ADMIN_MIGRATIONS,
  adminDbConnectionFromEnv,
  assertUtcTimezone,
  createAdminKysely,
  hashPassword,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

loadDotEnv(new URL('./.env', import.meta.url))
assertUtcTimezone('aksu seed')
const db = createAdminKysely(adminDbConnectionFromEnv())
try {
  const chapters = Object.fromEntries(
    await Promise.all(
      ADMIN_MIGRATIONS.map(async (id) => [
        id,
        await import(`@ssworks/admin-server/migrations/${id}`),
      ]),
    ),
  )
  const migrator = new Migrator({ db, provider: { getMigrations: async () => chapters } })
  const { error, results } = await migrator.migrateToLatest()
  if (error) throw error
  console.log(`장 ${results?.length ?? 0}개 적용`)
  const role = await db
    .insertInto('roles')
    .values({ roleName: '관리자', permissions: JSON.stringify(['*']) })
    .executeTakeFirstOrThrow()
  await db
    .insertInto('users')
    .values({
      userId: 'admin',
      password: await hashPassword('admin1234'),
      userName: '관리자',
      roleNo: role.insertId,
    })
    .execute()
  console.log('계정 admin / admin1234')
} finally {
  await db.destroy()
}
```

`other-publish.mjs`(다른 관리자 — 브라우저와 따로 로그인해 이용약관 새 판을 낸다. 브라우저의 다음 발행이 409 가 된다):

```js
const base = 'http://127.0.0.1:4100/api/admin'
const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: 'admin', password: 'admin1234' }),
})
if (!login.ok) throw new Error(`로그인 ${login.status} ${await login.text()}`)
const cookie = login.headers
  .getSetCookie()
  .map((line) => line.split(';')[0])
  .join('; ')
const current = await (
  await fetch(`${base}/legal-documents/current?kind=TERMS`, { headers: { cookie } })
).json()
const item = current.data.item
const response = await fetch(`${base}/legal-documents`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({
    kind: 'TERMS',
    body: `${item?.body ?? '# 이용약관'}\n\n다른 관리자 ${new Date().toISOString()}`,
    baseLegalDocNo: item?.legalDocNo ?? null,
  }),
})
console.log('다른 관리자 발행', response.status, await response.text())
```

`media-check.mjs`(중계 머리글 · 304 — `node media-check.mjs <키>`):

```js
const url = `http://127.0.0.1:4100/api/media/${process.argv[2]}`
const first = await fetch(url)
const etag = first.headers.get('etag')
console.log(
  '첫 요청',
  first.status,
  first.headers.get('content-type'),
  first.headers.get('cache-control'),
  first.headers.get('cross-origin-resource-policy'),
  etag,
)
const again = await fetch(url, { headers: { 'if-none-match': etag ?? '' } })
console.log('If-None-Match', again.status)
```

- [ ] **Step 3: 서버 설치 · 빌드**

```bash
cd "$LOCALAPPDATA/Temp/aksu/server"
pnpm install
pnpm build
```

Expected: 설치 · `tsc` 오류 0. `pnpm install` 이 `ERR_PNPM_IGNORED_BUILDS` 로 멈추면 그 패키지를 `$AKSU/server/pnpm-workspace.yaml` 에 `allowBuilds:` / `<패키지>: false` 로 적고 다시(sharp · `@node-rs/argon2` 는 사전 빌드 바이너리라 설치 스크립트가 필요 없다).

- [ ] **Step 4: DB · 시드 · 서버 띄우기**

```bash
docker ps --filter name=admin-kit-test-db --format "{{.Status}}"
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists aksu; create database aksu character set utf8mb4 collate utf8mb4_bin"
cd "$LOCALAPPDATA/Temp/aksu/server" && TZ=UTC node seed.mjs
```

Expected: 컨테이너 `Up …`(없으면 저장소 루트에서 `pnpm db:test:up`, 멈춰 있으면 `docker start admin-kit-test-db`) · `장 13개 적용` · `계정 admin / admin1234`.

서버를 Bash `run_in_background: true` 로:

```bash
cd "$LOCALAPPDATA/Temp/aksu/server" && TZ=UTC node dist/main.js > server.log 2>&1
```

그다음 포그라운드에서 `curl -s http://127.0.0.1:4100/api/health` → `{"success":true,"data":{"ok":true}}`(몇 초 걸리면 다시). `server.log` 에 기동 오류가 없다.

- [ ] **Step 5: 확인용 웹 파일** — `$AKSU/web/`

`package.json`:

```json
{
  "name": "aksu-web",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.8.1",
  "scripts": {
    "dev": "vite --port 5181 --strictPort",
    "build": "vite build",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@floating-ui/dom": "^1.8.0",
    "@he-tree/vue": "^2.10.5",
    "@mdi/font": "^7.4.47",
    "@ssworks/admin-shared": "file:../ssworks-admin-shared-0.13.0.tgz",
    "@ssworks/admin-ui": "file:../ssworks-admin-ui-0.13.0.tgz",
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
    "@vue/devtools-api": "^8.2.1",
    "axios": "^1.13.0",
    "marked": "^17.0.6",
    "pinia": "^4.1.0",
    "vue": "^3.5.21",
    "vue-router": "^4.6.0",
    "vuetify": "^4.0.5",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.1",
    "typescript": "~6.0.3",
    "vite": "^8.2.0",
    "vue-tsc": "^3.1.1"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
# he-tree 의 하위 의존 vue-demi 설치 스크립트는 돌리지 않는다(admin-ui README 「Peer 의존」)
allowBuilds:
  vue-demi: false
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

`vite.config.ts`:

```ts
import vue from '@vitejs/plugin-vue'
import { vuetifyLayerOrder } from '@ssworks/admin-ui/vite'
import { defineConfig } from 'vite'

// 같은 출처 — /api 를 aksu 서버로(쿠키 · 중계 그림이 그대로 간다)
export default defineConfig({
  plugins: [vue(), vuetifyLayerOrder()],
  server: { proxy: { '/api': 'http://127.0.0.1:4100' } },
})
```

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>aksu — 그림 첨부 확인</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/client.ts`:

```ts
import { createApiClient, createToast } from '@ssworks/admin-ui'

// 확인용 앱(B) — admin-ui README 「최소 배선」 (가) 갈래: baseURL '/api/admin'
export const toast = createToast()

export const client = createApiClient({
  baseURL: '/api/admin',
  onError: (error) => {
    if (error.status === 401) return
    toast.error(error.message)
  },
})

export const { api } = client
```

`src/main.ts`:

```ts
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import '@ssworks/admin-ui/style.css'
import { createApp } from 'vue'
import { createAdminVuetify } from '@ssworks/admin-ui'
import App from './App.vue'
import { toast } from './client'

createApp(App).use(createAdminVuetify()).use(toast).mount('#app')
```

`src/App.vue`:

```vue
<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { VApp, VBtn, VContainer, VDivider, VMain, VTextField } from 'vuetify/components'
  import { AdminToast } from '@ssworks/admin-ui'
  import { api } from './client'
  import LegalPage from './LegalPage.vue'
  import SharedPage from './SharedPage.vue'

  const signedIn = ref(false)
  const userId = ref('admin')
  const password = ref('admin1234')

  async function signIn(): Promise<void> {
    await api.post('/auth/login', { userId: userId.value, password: password.value })
    signedIn.value = true
  }

  onMounted(async () => {
    try {
      await api.get('/auth/me')
      signedIn.value = true
    } catch {
      signedIn.value = false
    }
  })
</script>

<template>
  <VApp>
    <VMain>
      <VContainer>
        <form v-if="!signedIn" @submit.prevent="signIn">
          <VTextField v-model="userId" label="아이디" />
          <VTextField v-model="password" label="비밀번호" type="password" />
          <VBtn type="submit">로그인</VBtn>
        </form>
        <template v-else>
          <LegalPage />
          <VDivider class="my-8" />
          <SharedPage />
        </template>
      </VContainer>
    </VMain>
    <AdminToast />
  </VApp>
</template>
```

`src/LegalPage.vue`(admin-ui README 「약관」 · 「그림 첨부」 그대로):

```vue
<script setup lang="ts">
  import {
    LEGAL_UPLOAD_PURPOSE,
    type AdminLegalCurrent,
    type AdminLegalDocument,
    type AdminLegalHistory,
    type AdminUploadCreated,
  } from '@ssworks/admin-shared'
  import { LegalDocumentEditor, useImageAttachments, useLegalDocuments } from '@ssworks/admin-ui'
  import { api, toast } from './client'

  const attachments = useImageAttachments({
    upload: (file) =>
      api.uploadFile<AdminUploadCreated>('/uploads', file, {
        params: { purpose: LEGAL_UPLOAD_PURPOSE },
      }),
    remove: (key) => api.del(`/uploads/${key}`),
    onRejected: (notice) => toast.warning(notice.message),
  })

  const legal = useLegalDocuments({
    kinds: [
      { value: 'TERMS', label: '이용약관' },
      { value: 'PRIVACY', label: '개인정보처리방침' },
    ],
    loadCurrent: (kind) =>
      api
        .get<AdminLegalCurrent>('/legal-documents/current', { params: { kind } })
        .then((r) => r.item),
    loadHistory: (kind) =>
      api.get<AdminLegalHistory>('/legal-documents', { params: { kind } }).then((r) => r.items),
    loadOne: (legalDocNo) => api.get<AdminLegalDocument>(`/legal-documents/${legalDocNo}`),
    publish: (body) => api.post('/legal-documents', body),
    onDone: (event) => toast.success(event.message),
    attachments,
  })
</script>

<template>
  <h2>약관</h2>
  <LegalDocumentEditor v-bind="legal.editor.value" />
  <p>
    업로드 진행 {{ attachments.progress.value.done }} / {{ attachments.progress.value.total }} ·
    busy {{ attachments.busy.value }}
  </p>
</template>
```

`src/SharedPage.vue`(§14 C9 · C11 · C13 — 편집기 둘 · 레지스트리 하나 · 합 한도 3 · 배열 commit. 서버에 본문을 저장하지 않는다 — 올린 그림은 미첨부로 남아 정리 잡 몫):

```vue
<script setup lang="ts">
  import { ref } from 'vue'
  import { VBtn } from 'vuetify/components'
  import { LEGAL_UPLOAD_PURPOSE, type AdminUploadCreated } from '@ssworks/admin-shared'
  import { MarkdownEditor, useImageAttachments } from '@ssworks/admin-ui'
  import { api, toast } from './client'

  const LIMIT = 3
  const first = ref('')
  const second = ref('')
  const finals = ref<string[]>([])

  const attachments = useImageAttachments({
    upload: (file) =>
      api.uploadFile<AdminUploadCreated>('/uploads', file, {
        params: { purpose: LEGAL_UPLOAD_PURPOSE },
      }),
    remove: (key) => api.del(`/uploads/${key}`),
    room: () => LIMIT - attachments.count([first.value, second.value]),
    onRejected: (notice) => toast.warning(notice.message),
    messages: {
      rejectedFull: (count) => `두 본문 합쳐 ${LIMIT}장까지라 ${count}장을 넣지 않았습니다.`,
    },
  })

  async function save(): Promise<void> {
    try {
      await attachments.commit([first.value, second.value], async (result) => {
        finals.value = result
        first.value = result[0] ?? ''
        second.value = result[1] ?? ''
      })
    } catch {
      // 오류는 클라이언트 onError 가 토스트로 알렸다
    }
  }
</script>

<template>
  <h2>편집기 둘 · 레지스트리 하나(합 {{ LIMIT }}장)</h2>
  <MarkdownEditor v-model="first" :attachments="attachments" height="200px" label="첫째 본문" />
  <MarkdownEditor v-model="second" :attachments="attachments" height="200px" label="둘째 본문" />
  <p>등록 그림 수(count): {{ attachments.count([first, second]) }}</p>
  <VBtn :disabled="attachments.busy.value" :loading="attachments.busy.value" @click="save">
    배열 commit(서버 저장 없음)
  </VBtn>
  <pre>{{ finals }}</pre>
</template>
```

- [ ] **Step 6: 웹 설치 · 타입 · 빌드(스모크) · 띄우기**

```bash
cd "$LOCALAPPDATA/Temp/aksu/web"
pnpm install
pnpm peers check
pnpm typecheck
pnpm build
```

Expected: 설치 깨끗 · `pnpm peers check` "No peer dependency issues found" · `vue-tsc` 오류 0 · `vite build` 통과(크기 경고만). 그다음 Bash `run_in_background: true` 로 `cd "$LOCALAPPDATA/Temp/aksu/web" && pnpm dev`.

- [ ] **Step 7: Chrome 으로 확인한다** — claude-in-chrome(ToolSearch 로 `tabs_context_mcp` · `tabs_create_mcp` · `navigate` · `computer` · `read_page` · `javascript_tool` · `read_console_messages` · `read_network_requests` 를 한 번에 싣는다. 없으면 이 Step 을 사람에게 넘기고 기록에 적는다). `http://localhost:5181` 새 탭 → 로그인(admin / admin1234).

OS 클립보드 · 탐색기 끌기는 도구로 못 한다 — 같은 이벤트를 페이지 안에서 만든다(실브라우저의 ProseMirror · Vue 처리기 · 네트워크는 진짜다). `javascript_tool` 에 먼저 이 도우미를 싣는다:

```js
window.aksu = {
  async png(name, color) {
    const canvas = Object.assign(document.createElement('canvas'), { width: 96, height: 64 })
    const g = canvas.getContext('2d')
    g.fillStyle = color
    g.fillRect(0, 0, 96, 64)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    return new File([blob], name, { type: 'image/png' })
  },
  transfer(files, text) {
    const t = new DataTransfer()
    for (const f of files) t.items.add(f)
    if (text) t.setData('text/plain', text)
    return t
  },
  editor: (label) => document.querySelector(`.ProseMirror[aria-label="${label}"]`),
  frame: (label) => window.aksu.editor(label).closest('.markdown-editor'),
  async paste(label, files, text) {
    const e = new ClipboardEvent('paste', {
      clipboardData: window.aksu.transfer(files, text),
      bubbles: true,
      cancelable: true,
    })
    window.aksu.editor(label).dispatchEvent(e)
    return e.defaultPrevented
  },
  async drop(label, files) {
    const el = window.aksu.editor(label)
    const r = el.getBoundingClientRect()
    const e = new DragEvent('drop', {
      dataTransfer: window.aksu.transfer(files),
      clientX: r.left + 24,
      clientY: r.top + 12,
      bubbles: true,
      cancelable: true,
    })
    el.dispatchEvent(e)
    return e.defaultPrevented
  },
  choose(label, files) {
    const input = window.aksu.frame(label).querySelector('input[type="file"]')
    input.files = window.aksu.transfer(files).files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  },
}
'ok'
```

항목(결과는 검증 기록 §3 표로 — 기대 · 실제):

| #   | 하는 것                                                                                                                                                   | 기대                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | 「이미지 넣기」 단추가 도구 막대에 있다 · 누르면 파일 고르기 창이 열린다(눈으로 — 닫는다). 이어서 `await aksu.choose('이용약관 본문', [await aksu.png('a.png', '#d33'), await aksu.png('b.png', '#33d')])` | 편집기에 그림 둘(순서대로) · 미리보기에 `<img src="blob:…">` 둘 · 네트워크에 업로드 요청 **없음**                                                                                                     |
| V2  | `await aksu.paste('이용약관 본문', [await aksu.png('c.png', '#3a3')])` 그리고 `await aksu.paste('이용약관 본문', [await aksu.png('d.png', '#aa3')], '표 글자')` | 첫째 `true` · 그림 하나 더 · 둘째 `false` · 글자 「표 글자」 만 들어감(그림 없음)                                                                                                                    |
| V3  | `await aksu.drop('이용약관 본문', [await aksu.png('e.png', '#a3a')])`                                                                                      | `true`(기본 동작 막힘) · 놓은 자리(편집 영역 머리)에 그림 · 탭이 그림 파일로 바뀌지 않는다                                                                                                           |
| V4  | 「원문」 → textarea 캐럿을 둔 채 `aksu.frame('이용약관 본문').querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: aksu.transfer([await aksu.png('f.png', '#3aa')]), bubbles: true, cancelable: true }))` → 「서식」 | 원문에 `![](blob:…)` 줄 · 서식으로 돌아오면 그림 노드                                                                                                                                                 |
| V5  | 11MB 파일: `await aksu.paste('이용약관 본문', [new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', { type: 'image/png' })])` · SVG: `await aksu.paste('이용약관 본문', [new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })])` | 경고 토스트 「장당 최대 10MB를 넘어 1장을 넣지 않았습니다.」 · 「지원하지 않는 형식이라 1장을 넣지 않았습니다. (JPG · PNG · WebP · GIF)」 · 편집기 그대로                                         |
| V6  | 「발행」 → 확인                                                                                                                                             | 네트워크: `POST /api/admin/uploads?purpose=legal` 201 × 그림 수 → `POST /api/admin/legal-documents` 201 · 성공 토스트 · 편집기 그림이 `/api/media/legal/…` 로(깨지지 않음) · 「바뀜」 없음(발행 단추 꺼짐) |
| V7  | 이력 [보기] · DB `docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test aksu -e "select upload_no, storage_key, ref_type, ref_id, deleted_at is not null as deleted from admin_uploads order by upload_no"` · `node $AKSU/server/media-check.mjs <키 하나>` | 원문에 `/api/media/legal/…` · 행마다 `ref_type` = `legalDocument` · `deleted` 0 · 첫 요청 `200 image/webp public, max-age=600 same-site "<태그>"` · `If-None-Match 304`                       |
| V8  | 되돌림(409): 그림 둘을 새로 넣고 → `cd $AKSU/server && node other-publish.mjs`(201) → 브라우저에서 「발행」 → 확인                                          | 업로드 201 × 2 → 발행 409 → `DELETE /api/admin/uploads/legal/…` 200 × 2 · 충돌 안내(노란 알림) · 🔴 **전역 오류 토스트 없음**(handled) · 초안의 그림 그대로(`blob:`) · DB: 방금 두 행 `deleted` 1 · 다시 「발행」 하면 새로 올라가 201 |
| V9  | 503: `touch $AKSU/server/storage-off` → 그림 하나 넣고 「발행」 → 확인 → `rm $AKSU/server/storage-off`                                                     | 업로드 503 · 오류 토스트 「이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.」(「서버 내부 오류」 가 아니다) · 발행 요청 없음 · 초안 그대로 · DB 새 행 없음                         |
| V10 | 서버를 끄고(백그라운드 셸 멈춤) 그림 하나 넣어 「발행」 → 서버를 다시 띄운다(Step 4 의 명령)                                                              | 오류 토스트 하나(프록시 오류 문구) · 초안 그대로 · 다시 띄운 뒤 DB 에 새 미첨부 행 없음                                                                                                              |
| V11 | 아래 「편집기 둘」: `await aksu.paste('첫째 본문', [await aksu.png('g.png', '#d33'), await aksu.png('h.png', '#33d')])` → `await aksu.paste('둘째 본문', [await aksu.png('i.png', '#3a3'), await aksu.png('j.png', '#aa3')])` → 「배열 commit」 | 첫째 둘 · 둘째 하나만 들어가고 경고 「두 본문 합쳐 3장까지라 1장을 넣지 않았습니다.」 · count 3 · commit 뒤 업로드 201 × 3 · `<pre>` 에 두 본문의 `/api/media/legal/…` 치환본 · 편집기 그림 안 깨짐 |
| V12 | 콘솔(`read_console_messages`)                                                                                                                              | V1 ~ V11 내내 오류 · 경고 없음(V10 의 네트워크 실패 줄은 제외 — 적어 둔다)                                                                                                                          |

- [ ] **Step 8: 끄고 지운다 · 기록**

서버 · 웹 백그라운드 셸을 멈추고(안 멈추면 PowerShell `Get-NetTCPConnection -LocalPort 4100,5181 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }`), `docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists aksu"`. `$AKSU` 폴더는 Task 10 리뷰가 끝날 때까지 둔다(사람 확인에 쓸 수 있다 — 검증 기록 §5 에 적는다).

검증 기록 §2(tarball 이름 · 설치 · `peers check` · `vue-tsc` · `vite build` 결과) · §3(V1 ~ V12 표 — 기대 · 실제)을 채우고 커밋:

```bash
git add docs/verification/2026-11-11-admin-ui-image-attachments.md
git commit -m "docs: PR #3k 실브라우저 확인 — 확인용 앱 aksu(실서버 · tarball) V1 ~ V12

Co-Authored-By: Claude <noreply@anthropic.com>"
```

(확인 중 킷을 고쳤으면 그 커밋들이 이 앞에 있고, 스펙 §15 에 줄이 더해져 있다.)

---

### Task 10: 최종 리뷰 · 마무리

- [ ] **Step 1: 리뷰** — `superpowers:requesting-code-review` 로 `superpowers:code-reviewer`(**model: opus** — 최종 whole-branch 리뷰)에게 `bc5f238..HEAD` 를 스펙(§2-4 · §9-4 · §13 · §14 · §15)과 이 플랜 「플랜이 정한 것」 에 대조해 리뷰받는다. 리뷰어에게 줄 초점:
  - 되돌림이 **이번 commit 이 올린 키만** 지우는가 — 앞 저장의 키 · 이미 첨부된 키 · 다른 commit 의 키를 건드리지 않는가(§9-4). 되돌림을 기다리지 않는 것이 `handled` 계약과 맞물리는가(P1 · K4).
  - 업로드 실패 문구 바꾸기가 업로드 단계에만 걸리는가, 같은 객체인가(P2 · K3).
  - `blob:` 해제 — 성공 뒤 · dispose 때만, 실패 때는 남는가. 메모리 누수 경로(편집기 언마운트 · 레지스트리 공유).
  - 편집기: `viewProps()` 세 곳 · `handleDOMEvents.drop` 과 `view.dragging` · readonly 에서 셋 다 꺼짐 · add 앞 `flush`(C12) · 원문 넣기의 `lastEmitted` · `wysiwygStale` · 숨은 파일 입력의 접근성(`hidden`).
  - 약관: `baseNo` 로 보내기 · 성공 뒤 초안 치환이 D3 · D11 과 어긋나지 않는가.
  - 공개 API 이름 · d.ts(겹쳐 쓰기) · README 와 코드가 맞는가.
- [ ] **Step 2: 반영** — Critical · Important 는 TDD 로 고치고(테스트 → RED → 수정 → GREEN) 커밋, 나머지는 HANDOFF 「PR #3k 가 넘긴 것」 에 한 줄씩. 스펙과 다르게 고친 것은 §15 에 한 줄.
- [ ] **Step 3: 마지막 검사**

Run: `pnpm check && pnpm format:check`
Expected: 초록. 테스트 수가 리뷰 반영으로 늘었으면 검증 기록 §1 을 고친다.

- [ ] **Step 4: 기록 · 정리 · 커밋** — 검증 기록 §4(리뷰 판정 · 고친 것 · 넘긴 것) · §5(남은 것 — 사람 확인 · `$AKSU` 를 지웠는지) · §1 끝 커밋 해시를 채운다. `$AKSU` 를 지운다(`node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" "$LOCALAPPDATA/Temp/aksu"`) — 사람이 확인에 쓰겠다고 했으면 남기고 §5 에 적는다.

```bash
git add docs/verification/2026-11-11-admin-ui-image-attachments.md docs/HANDOFF.md docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md
git commit -m "docs: PR #3k 최종 리뷰 반영 · 검증 기록 마감

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 5: 멈춘다** — `git status` 깨끗 · `git log --oneline bc5f238..HEAD` 를 보고서에 붙인다. **push · PR · 병합을 하지 않는다**(아래 「사람이 할 일」). 워크트리를 지우지 않는다.

---

## 사람이 할 일 (실행자는 하지 않는다)

1. 결과 검토 뒤 브랜치 `feat/admin-ui-image-attachments` push → PR(`main` 으로) → CI 초록 → 병합.
2. release 워크플로가 연 **Version Packages PR**(0.14.0 ×3 — admin-ui minor 가 `fixed` 로 셋을 올린다 · major 없음) 확인 · 병합 → CI 가 npm 에 스테이징.
3. `pnpm stage list` → `pnpm stage approve <stage-id>` ×3(2FA) → `git pull && pnpm changeset tag && git push --tags` → provenance 확인(`.changeset/README.md` 5).
4. 사람 눈 확인(검증 기록 §5): OS 클립보드 스크린숏 붙여넣기 · 탐색기에서 끌어 놓기 · 한글 조합 중 붙여넣기 · 모바일 · 편집 영역 밖 드롭 · 다크 테마의 그림 단추.
5. sseng-home: 0.14.0 공개 하루 뒤(`minimumReleaseAge`) 설치하고 자기 설계서 §6-5 를 고쳐 잇는다(HANDOFF 「PR #3k 가 넘긴 것」). ringside · 템플릿 `preset/admin` 입력도 거기.
6. 병합 뒤 워크트리 정리(`git worktree remove .worktrees/admin-ui-image-attachments` — 폴더가 남으면 손으로 지운다).

---

## 자체 점검 (플랜 작성 뒤)

- **스펙 대조**: C1(Task 2 `planAttachments` · Task 3 add) · C2(Task 3 commit · 되돌림 — P1) · C3(Task 5 단추 · 붙여넣기 · 끌어 놓기 · 원문 · readonly — P3 · P4 · P5) · C4(Task 4 `insertImagesAt` · `moveCaretAfterImage` · Task 5 posAtCoords) · C5(Task 5 「거른 파일 …」 — 토스트 없음 · busy 로 잠그지 않음) · C6(Task 1) · C7(Task 6) · C8(Task 3 「C8 …」 · 해제) · C9(Task 3 room) · C10(Task 3 count) · C11(Task 3 배열 commit) · C12(Task 5 🔴 C12) · C13(Task 5 C13 · Task 9 V11) · C14(Task 6 · README · P7) · §4-3(Task 7 index) · §5-1 · §5-2(Task 5 · 6 · 9) · §6 admin-ui 행(Task 1 문구 · Task 3 실패 갈래 · Task 9 V8 ~ V10) · §8 admin-ui 파일(파일 지도 — `api/error-messages` → `api/upload-errors.ts`) · §9-1 admin-ui(Task 1 ~ 6) · §9-3(Task 9) · §9-4(Task 10 초점) · §10(Task 7 changeset · README · CLAUDE.md · phase0 · HANDOFF) · §12 위험 #6(K7 · 시험 도구) · #7(P3 · Task 9 V3) · §13(K2 · Task 1 · 7 — `LEGAL_UPLOAD_PURPOSE` 는 README · 확인용 앱의 어댑터) · §14 테스트 계약(Task 3 · 5 — 디바운스 · 공유) · §14 릴리스(Task 7 changeset — 0.14.0). 빠진 것 없음.
- **자리표시**: `<완료일>` · `<해시>` · 검증 기록의 `<…>` 는 실측 · 날짜를 적으라는 지시다(남기지 않는다).
- **이름 일관성**: Global Constraints 의 이름 목록을 Task 1 ~ 7 이 그대로 쓴다 — `uploadErrorMessage(error, messages)` · `formatMegabytes` 는 Task 1 정의 · Task 2 · 3 사용, `clampRoom` · `planAttachments` · `rejectionNotices` · `urlsInBodies` · `replaceUrls` 는 Task 2 정의 · Task 3 사용, `imageFile` · `stubObjectUrls` · `transferOf` · `pasteEvent` · `dragEvent` 는 Task 3 정의 · Task 4 · 5 · 6 사용, `moveCaretAfterImage` · `filesOf` · `hasFiles` · `pastedFiles` · `insertImagesAt` · `sourceWithImages` 는 Task 4 정의 · Task 5 사용, `ImageAttachments` 는 Task 3 정의 · Task 5 · 6 사용.
- **수**: 작성 때 사본에서 Task 순서대로 쌓아 81 → 85 파일 · 1414 → 1486 테스트를 확인했다.


<!-- prettier-ignore-end -->
