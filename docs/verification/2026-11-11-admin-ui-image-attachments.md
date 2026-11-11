# 검증 — admin-ui 편집기 그림 첨부 (PR #3k, 2026-11-11)

스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §9-1 · §9-3 · §14 · §15 · 플랜 `docs/superpowers/plans/2026-11-11-admin-ui-image-attachments.md`.

## 1. 저장소

- 브랜치 `feat/admin-ui-image-attachments` · 바탕 `bc5f238` · 끝 커밋 `fa252b5`(이 기록 커밋 직전)
- 작성 때 기준: admin-ui 81 파일 · 1414 테스트 · 워크스페이스 185 파일 · 2405 테스트
- `pnpm check` 초록 — admin-ui 85 파일 · 1492 테스트 · 워크스페이스 189 파일 · 2483 테스트
- 리뷰 수정으로 더한 테스트 6: Task 3 +2(dispose 뒤 commit 거부 · 진행 중 해제 한 번) · Task 5 +4(사라진 편집기 · 포커스한 적 없으면 끝 · 드롭 자리 못 찾음 · 전부 거절된 드롭)
- `pnpm format:check` 통과
- `changeset status --verbose` — minor: admin-ui → fixed 라 세 패키지 0.14.0, major 없음
- admin-shared · admin-server 소스 변경 없음(`git diff --stat bc5f238..HEAD -- packages/admin-shared/src packages/admin-server/src` 빈 출력) → `pnpm test:db` 생략
- dist: `useImageAttachments` · `uploadErrorMessage` · 기본 문구 둘이 `index.js` 에, `commit<T>` 겹쳐 쓰기 둘이 d.ts 에

커밋 목록(`git log --oneline bc5f238..HEAD`):

```
fa252b5 docs(admin-ui): README 그림 첨부 — room 셈에 올라간 그림 · 저장 중 잠금과 덮어쓰기 가드 · baseURL 갈래
10d7b1e docs(admin-ui): 그림 첨부 공개 API · peer 하한 0.11.0 · changeset minor · README 「그림 첨부」 · 진행 문서 · 스펙 §15
fff49cd feat(admin-ui): useLegalDocuments.attachments — 발행이 그림을 올리고 치환본을 보낸다 · 성공 뒤 초안 치환 · LegalDocumentEditor prop 통과
cb1c852 fix(admin-ui): MarkdownEditor 그림 첨부 — 사라진 편집기에 등록하지 않는다 · 포커스한 적 없으면 문서 끝 · 원문 포커스 스크롤 막기
1363842 feat(admin-ui): MarkdownEditor attachments — 그림 단추 · 파일 붙여넣기 · 끌어 놓기(서식 · 원문) · add 앞 flush · 편집기 여럿이 한 레지스트리
d682cd2 feat(admin-ui): 편집기 그림 넣기 도우미 — insertImagesAt · 원문 줄 · 붙여넣기 판정 · moveCaretAfterImage 꺼내기
b1950c7 fix(admin-ui): useImageAttachments — dispose 뒤 commit 거부 · 진행 중 해제된 주소를 다시 해제하지 않는다
3995e43 feat(admin-ui): useImageAttachments — blob: 레지스트리 · 저장 시점 commit(문자열 · 배열) · count · room · 되돌림
923cf9f feat(admin-ui): 그림 첨부 순수 규칙 — 남은 칸 · 거르기 · 사유 묶음 · 치환(image-attachments)
c5d24f5 feat(admin-ui): ApiClient.uploadFile · 업로드 오류 문구 표(ERR_UPLOAD_* — 503 은 코드로 · 413 은 상한을 붙인다)
cb72255 docs: PR #3k 구현 플랜 — admin-ui 편집기 그림 첨부(useImageAttachments · MarkdownEditor attachments · uploadFile · 약관 배선)
```

## 2. 확인용 앱(`$LOCALAPPDATA/Temp/aksu` — Task 9)

(Task 9 에서)

## 3. 실브라우저(Task 9)

(Task 9 에서)

## 4. 최종 리뷰(Task 10)

(Task 10 에서)

## 5. 남은 것

- 실브라우저 확인(Task 9) · 최종 리뷰(Task 10)
- push · PR · 병합 · 발행은 사람이 한다
