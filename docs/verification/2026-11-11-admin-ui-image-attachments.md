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

이 기록 뒤 커밋:

```
0af195c fix(admin-ui): 포커스한 적 없는 편집기 — 끝 위치를 마지막 글 블록 안으로(빈 문서의 앞 빈 문단 회귀 D1)
b0fdd3d docs: PR #3k 실브라우저 확인 — 확인용 앱 aksu(실서버 · tarball) V1 ~ V12
4834b83 docs: PR #3k 검증 기록 — pnpm check · changeset status · dist
```

- `0af195c` 뒤 admin-ui 85 파일 · 1494 테스트(D1 렌더 테스트 +2)

최종 리뷰(§4) 고침 뒤 커밋:

```
28ecc61 feat(admin-ui): 등록에 없는 blob: 그림을 저장하지 않는다 — strays · commit 거부 · 약관 발행 막기(최종 리뷰 I2)
5666aad fix(admin-ui): 포커스한 적 없는 편집기의 끝 자리를 최상위로(목록 · 인용 안으로 들어가지 않게) · 편집기 뿌리에서 파일 드롭이 페이지를 떠나지 않게
ce70186 docs: PR #3k 실브라우저 재확인 — D1 고침(0af195c) 뒤 V1 · V11
```

- `28ecc61` 에서 `pnpm check` · `pnpm format:check` 둘 다 **종료 코드 0** — admin-ui 85 파일 · 1508 테스트 · 워크스페이스 189 파일 · 2499 테스트
- 플랜이 적은 수(admin-ui 1486 · 워크스페이스 2477)보다 **+22** — 리뷰 뒤 고칠 때 더한 테스트: 태스크 리뷰 +6(위) · D1 +2(`0af195c`) · I1 · M1 +4(`5666aad` — 1498) · I2 +10(`28ecc61` — 1508)
- 이 기록을 마감한 커밋은 문서와 주석 한 곳(`useLegalDocuments.ts`)만 고쳐 수가 같다 — 바꾼 파일 `prettier --check`(changeset · README · HANDOFF · `useLegalDocuments.ts` — 이 기록은 `.prettierignore` 의 `docs/verification/`) · 그 파일 `eslint` · `changeset status --verbose`(admin-ui minor → fixed 라 세 패키지 0.14.0 · major 없음)를 다시 돌려 모두 종료 코드 0

## 2. 확인용 앱(`$LOCALAPPDATA/Temp/aksu` — Task 9)

2026-11-11 · 워크트리 `4834b83` 에서 `pnpm build` 뒤 pack.

| 단계 | 결과 |
| --- | --- |
| tarball | `ssworks-admin-shared-0.13.0.tgz`(75,970 B) · `ssworks-admin-ui-0.13.0.tgz`(467,906 B) · `ssworks-admin-server-0.13.0.tgz`(351,494 B) — 번호가 플랜과 같아 `file:` 이름 그대로 |
| 서버 설치 | `pnpm install` 깨끗(148 패키지 · ignored builds 없음 → `allowBuilds` 불필요). 해소 판 `@nestjs/*` 12.4.2 · kysely 0.29.8 · mariadb 3.5.5 · sharp 0.35.5 · zod 4.6.7 · typescript 6.0.3 |
| 서버 빌드 | `tsc -p tsconfig.json` 오류 0 |
| DB · 시드 | `admin-kit-test-db` 는 멈춰 있어 `docker start`(끝나고 다시 멈춤). `aksu` 만들기 → `장 13개 적용` · `계정 admin / admin1234` |
| 서버 기동 | `/api/health` → `{"success":true,"data":{"ok":true}}` · 기동 로그에 오류 · 경고 없음 · 라우트 표에 uploads POST · DELETE · media GET |
| 웹 설치 | `pnpm install` 깨끗(159 패키지). vue 3.5.45 · vuetify 4.3.3 · axios 1.21.1 · vite 8.3.7 · vue-tsc 3.3.14 · tiptap 3.32.0 |
| `pnpm peers check` | `No peer dependency issues found` |
| `vue-tsc --noEmit` | 오류 0 |
| `vite build` | 통과 — `index-*.js` 1,200.46 kB(gzip 399.98 kB) 크기 경고만 |

확인용 앱 코드를 고친 곳: **없다** — 플랜 Step 2 · Step 5 의 코드가 그대로 `tsc` · `vue-tsc` · `vite build` 를 통과했다.

도구 쪽 편차(킷 · 앱 코드는 그대로):

- V1 의 파일 고르기 창 — OS 창은 도구로 닫을 수 없어, `HTMLInputElement.prototype.click` 을 잠깐 가로채(파일 입력이면 기록만 하고 창은 열지 않는다) **실제 마우스 클릭**으로 단추를 눌렀다. 창이 실제로 뜨는 것은 사람 확인 몫(§5).
- 토스트는 `MutationObserver` 로 `.v-snackbar` 글자를 모았다(사라진 뒤에도 남게). 같은 토스트가 바깥 · 안쪽 요소로 두 번 잡혀 기록에 두 줄씩 남는다 — 화면에는 하나.
- 콘솔 도구(claude-in-chrome)는 console API 메시지만 준다 — 브라우저가 찍는 네트워크 실패 줄(409 · 503 · 502 · 404)은 잡지 않는다.

## 3. 실브라우저(Task 9)

Chrome(claude-in-chrome) 새 탭 하나 · `http://localhost:5181` · admin 로그인. 이벤트는 플랜 Step 7 의 `window.aksu` 도우미로 페이지 안에서 만들었다(ProseMirror · Vue 처리기 · 네트워크 · 서버 · DB 는 진짜). 리뷰 뒤 바뀐 동작(포커스한 적 없는 서식 편집기는 문서 끝에 넣는다 · 사라진 편집기는 파일을 버린다 · dispose 뒤 commit 은 던진다 · readonly 는 파일을 받지 않는다)을 기대에 반영했다 — readonly 드롭은 탭이 그림 파일로 떠나므로 브라우저에서 돌리지 않았다.

| #   | 기대 | 실제 | 판정 |
| --- | --- | --- | --- |
| V1  | 「이미지 넣기」 단추 · 파일 창 · 편집기에 그림 둘(순서대로) · 미리보기 `blob:` 둘 · 업로드 요청 없음 | 편집기 셋 모두 단추 있음. 실제 클릭 → 그 편집기의 숨은 입력(`accept` `image/jpeg,image/png,image/webp,image/gif` · `multiple`)에 `click` 1회. `choose(a, b)` → 편집기 `<p></p><img a><img b><p></p>`(포커스한 적 없어 문서 끝) · 미리보기 `blob:` 둘(96×64 로드) · 입력 `value` 비움 · `/api/` 요청 0 | 통과 — 앞 빈 문단(**D1**)은 `0af195c` 로 고쳐 재확인(V1′) |
| V2  | 파일만 `true` · 그림 하나 더 / 글자와 함께면 글자만 | 첫째 `true` · 그림 3. 둘째도 `true` 지만 ProseMirror 기본 글자 붙여넣기가 막은 것(prosemirror-view `editHandlers.paste` 가 `clipboardData` 의 글자를 넣고 `preventDefault`) — 킷은 맡지 않았다: 그림 3 그대로 · 새 문단 「표 글자」 만. **기대 정정**: 둘째 반환값은 `true` 가 맞다 | 통과 |
| V3  | `true` · 놓은 자리(편집 영역 머리)에 그림 · 탭 그대로 | `true` · 새 그림이 첫 블록(앞 빈 문단 위) · `location.href` 그대로 | 통과 |
| V4  | 원문 캐럿 자리에 `![](blob:…)` 줄 · 서식으로 돌아오면 그림 노드 | 캐럿을 `&nbsp;` 줄 끝(76)에 두고 붙여넣기 → `preventDefault` · 그 자리에 빈 줄로 띄운 `![](blob:…)` 줄 · 캐럿은 그 줄 뒤(146) · textarea 포커스 유지. 「서식」 → 그림 노드 5(같은 차례) · 미리보기 5 | 통과 |
| V5  | 경고 토스트 둘(문구 그대로) · 편집기 그대로 | 둘 다 `true`. 주황 토스트 「장당 최대 10MB를 넘어 1장을 넣지 않았습니다.」 → 「지원하지 않는 형식이라 1장을 넣지 않았습니다. (JPG · PNG · WebP · GIF)」 · 편집기 innerHTML 같음(그림 5) · 요청 0 | 통과 |
| V6  | 업로드 201 × 그림 수 → 발행 201 · 성공 토스트 · 편집기 그림이 `/api/media/legal/…` · 「바뀜」 없음 | `POST /api/admin/uploads?purpose=legal` 201 × 5 → `POST /api/admin/legal-documents` 201 → 중계 GET 200 × 5 → current · 이력 200. 편집기 · 미리보기 그림 5 모두 `/api/media/legal/2026/11/….webp`(로드됨) · 단추 꺼짐 + 「시행 중인 판과 내용이 같습니다.」. 성공 토스트는 이 회차엔 읽기 전에 사라졌고 V8 재발행에서 「이용약관 새 버전을 발행했습니다.」 로 확인 | 통과 |
| V7  | 원문에 `/api/media/legal/…` · 행 `legalDocument` · `deleted` 0 · 중계 200 · 304 | [보기] 대화상자 그림 5 모두 `/api/media/legal/…`. `GET /legal-documents/1` 의 body 에 `blob:` 없음. DB 행 1 ~ 5 `ref_type legalDocument` · `ref_id 1` · `deleted 0`(행 차례는 등록 차례 a · b · c · e · f). `media-check.mjs` → `첫 요청 200 image/webp public, max-age=600 same-site "5a88ec9116897b21"` · `If-None-Match 304` | 통과 |
| V8  | 업로드 201 × 2 → 발행 409 → DELETE 200 × 2 · 노란 충돌 안내 · 전역 오류 토스트 없음 · 초안 `blob:` 그대로 · 두 행 `deleted` 1 · 다시 발행하면 새로 올라가 201 | `other-publish.mjs` → `201`(legalDocNo 2). 브라우저 발행 → 업로드 201 × 2 → 발행 **409** → `DELETE /api/admin/uploads/legal/2026/11/….webp` 200 × 2 → current · 이력 재조회. `v-alert text-warning` 「다른 관리자가 2026-11-11 20:08에 새 버전을 발행했습니다. …」 · 토스트 기록 0 · 초안 `blob:` 둘 그대로(로드됨). DB 행 6 · 7 `ref NULL` · `deleted 1`. 다시 발행 → 업로드 201 × 2(새 키) → 201 · 성공 토스트 · 행 8 · 9 `legalDocument 3` | 통과 |
| V9  | 업로드 503 · 토스트 「이미지 저장소를 사용할 수 없습니다. …」(「서버 내부 오류」 아님) · 발행 요청 없음 · 초안 그대로 · 새 행 없음 | `storage-off` → 업로드 **503** 1회 · 발행 요청 없음 · 빨간 토스트 「이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.」. 같은 조건의 직접 요청 응답 본문은 `{"success":false,"code":"ERR_UPLOAD_UNAVAILABLE","message":"서버 내부 오류가 발생했습니다."}` — 서버가 가린 문구를 코드로 바꿨다. 초안 `blob:` 그대로 · 진행 `0 / 0 · busy false` · DB 9 행 그대로 | 통과 |
| V10 | 오류 토스트 하나(프록시 문구) · 초안 그대로 · 재기동 뒤 새 미첨부 행 없음 | 서버 끔 → 업로드 **502** 1회(vite 프록시 `ECONNREFUSED`) · 발행 요청 없음 · 토스트 하나 「Request failed with status code 502」 · 초안 `blob:` 둘 그대로. 재기동 뒤 DB 9 행 그대로. 덧붙여 재기동 뒤 다시 발행 → 업로드 201 × 2 → 201(4번 판 · 행 10 · 11 첨부) | 통과 |
| V11 | 첫째 둘 · 둘째 하나 · 경고 「두 본문 합쳐 3장까지라 1장을 넣지 않았습니다.」 · count 3 · 업로드 201 × 3 · `<pre>` 치환본 · 편집기 그림 안 깨짐 | 첫째 2 · 둘째 1 · 경고 그 문구 · count 3. commit → 업로드 201 × 3 · `<pre>` 에 두 본문의 `/api/media/legal/…` 치환본 · count 0. **편집기 그림은 깨진다**(중계 404 × 3) — 서버 설계(`admin-server/src/media/media.controller.ts:16` 「첨부된 행만 200, 미첨부 · 지움 표시는 404」): 이 페이지는 서버에 저장하지 않아(`sync` 없음) 행 12 ~ 14 가 미첨부로 남는다. 파일은 저장소에 있다(`uploads/legal/2026/11/` 92 ~ 94 B). **기대 정정** — 킷 결함 아님(V6 · V8 처럼 저장이 첨부하면 보인다). `<pre>` 두 본문 모두 첫 줄이 `&nbsp;` → **D1**(`0af195c` 로 고쳐 재확인 — V11′) | 통과(기대 정정) |
| V12 | V1 ~ V11 내내 콘솔 오류 · 경고 없음 | console API 오류 · 경고 0(vite `connecting` · `connected` debug 만) · Vue 경고 없음. vite `dev.log` 에 V10 의 `http proxy error: /api/admin/uploads?purpose=legal` · `ECONNREFUSED 127.0.0.1:4100` 한 줄(예상) | 통과 |
| D1  | (V1 · V11 에서 나온 것) 빈 편집기에 그림만 넣으면 본문이 그림으로 시작한다 | 처음 확인(`4834b83` tarball): 포커스한 적 없는 빈 서식 편집기에 넣으면 처음의 빈 문단이 그림 **앞**에 남아 첫 블록이 `&nbsp;` — V1 `<p></p><img><img><p></p>` · V11 `<pre>` 두 본문이 `&nbsp;\n\n![](…)` 로 시작(포커스한 뒤면 `<img><p></p>`). 원인: `MarkdownEditor.vue` 의 끝 자리 `doc.content.size`(마지막 블록 **뒤**) | **고침** — `0af195c`(끝 자리 `Selection.atEnd(doc).to`) · 재확인 통과(아래) |

### 재확인 — D1 고침(`0af195c`) 뒤 V1 · V11

- tarball: 워크트리 `0af195c` 에서 `pnpm build` 뒤 셋 다시 pack(`ssworks-admin-ui-0.13.0.tgz` 468,100 B · shared · server 크기 그대로). 판이 0.13.0 그대로라 웹 · 서버 모두 `pnpm install --force`(서버 `tsc` 다시 오류 0) · 웹 `node_modules/.vite` 비움. 설치된 `@ssworks/admin-ui/dist/index.js` 의 `atEnd` 1곳(`… ? a.state.selection.to : St.atEnd(a.state.doc).to`) — 바꾸기 전 0. `pnpm peers check` 문제 없음 · `vue-tsc` 오류 0
- 스택: `docker start admin-kit-test-db` → `aksu` 새로 → `장 13개 적용` · 계정 → 서버(4100) · 웹(5181) 백그라운드 · health 200
- 도구 편차: 이 회차 탭에서는 로그인 클릭 뒤 확장 프로그램의 마우스 입력이 페이지에 닿지 않았다(capture 단계 `pointerdown` · `mousedown` · `click` 기록 0 · `elementFromPoint` 는 그 단추). 그래서 발행 · 확인 · 배열 commit · 원문/서식 단추는 DOM `click()` 으로 눌렀다(Vue 처리기 · 네트워크는 같다). 「이미지 넣기」 → 숨은 입력 `click` 배선은 첫 회차의 실제 클릭으로만 확인했다

| #   | 기대 | 실제 | 판정 |
| --- | --- | --- | --- |
| V1′ | 포커스한 적 없는 빈 편집기 · 그림 둘 → DOM 이 `<img>` 로 시작 · 발행 원문에 그림 앞 `&nbsp;` 없음 | 이용약관 편집기(포커스 안 함 · `<p></p>`) `choose(a, b)` → DOM `<img a><img b><p></p>` · 미리보기 둘. 발행 → 업로드 201 × 2 → 201 · 중계 200 × 2 · 토스트 「이용약관 새 버전을 발행했습니다.」. 1번 판 원문 `![](/api/media/legal/2026/11/OEkj….webp)\n\n![](/api/media/legal/2026/11/YYcE….webp)\n\n` — `&nbsp;` 없음(끝 `\n\n` 은 K6 의 끝 빈 문단) · DB 행 1 · 2 `legalDocument 1` | 통과 |
| V11′ | 두 `<pre>` 본문이 `&nbsp;` 로 시작하지 않는다 | 두 편집기 모두 포커스 안 함 · `<p></p>`. 붙여넣기 → 첫째 `<img><img><p></p>` · 둘째 `<img><p></p>` · 경고 「두 본문 합쳐 3장까지라 1장을 넣지 않았습니다.」 · count 3. 배열 commit → 업로드 201 × 3 · `<pre>` `["![](/api/media/legal/2026/11/oUlt….webp)\n\n![](/api/media/legal/2026/11/J0V3….webp)\n\n", "![](/api/media/legal/2026/11/6-Bd….webp)\n\n"]` — 둘 다 그림으로 시작 · count 0. 중계 404 × 3 은 V11 과 같은 미첨부(행 3 ~ 5 `ref NULL` — 기대 정정 그대로) | 통과 |
| 글 끝 | 포커스한 적 없는 편집기에 글이 있으면 그 글 뒤에 붙는다 | `other-publish.mjs` 로 글 문단이 끝에 붙은 2번 판을 낸 뒤 새로 고침 → 편집기(포커스 안 함) `<img><img><p></p><p>다른 관리자 2026-11-11T11:23:20.312Z</p>` → `choose(t)` → `…<p>다른 관리자 …</p><img t><p></p>` — 글 문단 바로 뒤 · 사이에 빈 문단 없음. 원문 `…\n\n다른 관리자 …\n\n![](blob:…)\n\n`(그 앞의 `&nbsp;` 은 2번 판 원문에 이미 있던 빈 문단 — other-publish 가 `\n\n` 로 끝난 본문에 `\n\n` 을 이어 붙였다 · 넣기 전 DOM 에 있었다) | 통과 |
| 콘솔 | 오류 · 경고 없음 | console API 오류 · 경고 0(vite debug 만) · 서버 로그 ERROR · WARN 0 · vite `dev.log` 오류 0 | 통과 |

## 4. 최종 리뷰(Task 10)

opus whole-branch 리뷰(`bc5f238..ce70186`) — **Critical 0 · Important 2**. 둘 다 고친 뒤 같은 리뷰어(opus)가 다시 리뷰해 해소를 확인했다.

| # | 지적 | 고침 |
| --- | --- | --- |
| I1 | D1 고침(`0af195c` — `Selection.atEnd(doc).to`)이 덜 됐다 — 마지막 블록이 목록 · 인용이면 가장 깊은 글 블록으로 들어가 그림이 그 안에 갇힌다 | `5666aad` — 최상위 맨 끝, 마지막 블록이 빈 글 블록이면 그 안(그림이 대신한다). 렌더 테스트 |
| M1 | readonly 편집기 · 도구 막대에 놓은 파일을 브라우저가 열어 SPA 를 떠난다(약관은 발행 중 readonly — 초안 유실) | `5666aad` — `attachments` 가 있으면 편집기 뿌리가 파일 끌기(`dragover` · `drop`)의 기본 동작만 막는다(넣지 않는다). 렌더 테스트 |
| README 셋(Minor) | CSP `img-src blob:` · 스코프 밖에서 만든 레지스트리는 `dispose()` 직접 · `commit` 에 `string \| string[]` 유니온은 좁힌 뒤 | `5666aad` README 「그림 첨부」 |
| I2 | 등록에 없는 `blob:` 그림(다른 편집기 · 레지스트리에서 복사 · 저장 뒤 다시 붙임 · 「원문」 에서 고친 주소)은 올라가지 않고 그대로 저장돼 공개 화면에서 깨진다 | 사용자 결정 「킷이 저장 때 막는다」 → `28ecc61` — `strays(본문 \| 본문들)` · `commit` 이 업로드 전에 `Error(messages.stray(n))` · 약관 `'strayImages'` · 문구 `ImageAttachmentMessages.stray` · `blocked.strayImages`. 마감 커밋에서 changeset · README 저장 예시(`strays` 선검사)를 맞췄다 |
| M2 · M3 · M7 | 넘김 — `docs/HANDOFF.md` 「PR #3k 가 넘긴 것」 | — |

- Sonnet 5.5 서브에이전트가 이 작업에서 안전장치 API 오류로 두 번 멈췄다(그중 하나가 I2 고침) — 사용자 결정으로 opus 가 다시 했다.

## 5. 남은 것

- ~~D1~~ — `0af195c` 로 고쳐 V1 · V11 재확인 통과(§3)
- ~~최종 리뷰(Task 10)~~ — §4. I1 · M1 · I2 고침은 실브라우저를 다시 돌리지 않고 테스트(렌더 · 단위)와 탐침으로 확인했다
- 사람이 눈으로 볼 것(도구로 못 한 것): 「이미지 넣기」 가 OS 파일 창을 실제로 연다 · OS 클립보드 붙여넣기(스크린숏 · 이미지 복사) · 탐색기에서 끌어 놓기 · 편집 영역 밖 드롭(도구 막대는 아무것도 넣지 않고 페이지도 떠나지 않는다 — `5666aad` · 편집기 밖 페이지는 브라우저 기본 — P12) · readonly 편집기 위 드롭(넣지 않고 페이지도 떠나지 않는다 — `5666aad`)
- 확인용 앱 `$LOCALAPPDATA/Temp/aksu`(서버 · 웹 · tarball 셋)는 지웠다(2026-11-12). DB `aksu` 는 앞서 지웠고 `admin-kit-test-db` 는 멈춰 있다
- push · PR · 병합 · 발행은 사람이 한다
