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
