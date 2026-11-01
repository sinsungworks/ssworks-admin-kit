# admin-kit 편집기 이미지 업로드 설계 (PR 2h · PR #3k)

작성일: 2026-11-01 · 상태: 확정(구현 전) · 입력: 사용자 요구 둘(① API 업로드 + 경로 vs base64 검토 ② 업로드는 **본문 저장 단계**에서 — 작성 뒤 취소 시 고아 파일 방지) · 선행: PR #3j 스펙(`2026-11-01-admin-ui-wysiwyg-editor-design.md` — 결정 ② Image 입력 규칙 · A4 · A13 "업로드 없음" · K5′) · 2e 약관 스펙(`2026-10-14-admin-server-teams-legal-design.md` — 발행 트랜잭션 · 잠금 순서) · 2c 감사 스펙 · 참조 ringside(`C:\workspace\ssworks-ringside`) p1b 이미지 업로드 스펙(`docs/superpowers/specs/2026-10-21-p1b-image-uploads-design.md` — U1~U18) · p1d 편집기 이미지 스펙(`2026-10-23-p1d-editor-images-design.md`) · 코드 `apps/api/src/uploads/*` · `apps/web/app/utils/uploads.ts` · `upload-queue.ts`

## 1. 목표

`MarkdownEditor` 에 **이미지 첨부**를 넣는다. 편집 중에는 브라우저 안(`blob:`)에만 두고, **저장(발행) 시점**에 차례로 올려 본문의 주소를 바꾼 뒤 저장한다 — 작성하다 그만두면 서버에 아무것도 남지 않는다. 업로드 API · 저장소 추상 · 재인코딩 · 중계 · 첨부 · 정리는 킷(admin-server)이 제공하고, 저장소 구현은 파일 시스템과 S3 호환 둘을 싣는다.

| #   | 항목                                   | 하는 것                                                                                                                              |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | 그림을 API 로 올리고 **경로**를 넣는다 | base64 는 쓰지 않는다(§2-1 결정 ①). 본문에는 `<mediaPath>/<키>` 가 들어간다                                                          |
| R2  | 업로드는 저장 단계에서                 | 편집 중 `blob:` + 레지스트리(`useImageAttachments`) → `commit(markdown, save)` 가 올리고 치환하고 저장한다                           |
| R3  | 실패하면 되돌린다                      | 업로드 · 저장 어느 쪽이 실패하든 방금 올린 키를 `DELETE` 로 지운다. 지우기도 실패한 것만 정리 잡(미첨부 24시간)                      |
| R4  | 킷이 서버 쪽을 다 갖는다               | `AdminUploadsModule`(업로드 · 삭제 · 첨부 · 정리) · `AdminMediaModule`(중계) · 저장소 인터페이스 + 파일 시스템 + S3 · 장 `0013`      |
| R5  | 올린 파일은 서버가 다시 만든다         | `sharp` 재인코딩 — 매직 바이트 판별 · 픽셀 · 프레임 상한 · 방향 · 축소 · WebP · 메타데이터 제거 · 동시성 문                          |
| R6  | 용도마다 쓰기 권한                     | `POST /uploads?purpose=<p>` 는 그 용도의 본문을 쓸 수 있는 사람만(`legal → legal.publish`, 앱 용도는 옵션 등록). 첨부 때도 용도 검사 |
| R7  | 약관이 첫 소비자                       | `useLegalDocuments` · `LegalDocumentEditor` 배선 · 약관 발행 트랜잭션이 첨부                                                         |

- 성공 기준: `pnpm check` 초록 · `pnpm test:db`(11.4 · 12.3) 초록 · 스모크 앱에서 단추 · 붙여넣기 · 드롭 → 발행 → `/api/media/...` 로 그림이 보임 · 서버를 끄고 발행하면 올린 것이 지워짐(서버 로그 · 표) · 콘솔 오류 없음 · `LegalDocumentEditor` 변경은 prop 통과 하나.
- PR 둘: **PR 2h**(admin-shared + admin-server) → **PR #3k**(admin-ui — peer 하한을 2h 가 실리는 admin-shared 판으로). 템플릿 `preset/admin` · ringside 적용은 별도 세션(HANDOFF 에 입력만).

## 2. 결정

### 2-1. 경계 결정 (2026-11-01 브레인스토밍 — 질문 여섯 + 접근 하나)

| 결정                        | 확정                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 경로 vs base64            | **경로.** base64 는 본문이 1.37배로 불고(약관 상한 1,000,000자 — 사진 한 장이 넘긴다), append-only 판마다 그림이 복제되며, 원문 탭이 읽을 수 없게 되고, 킷 편집기는 `data:` 그림을 노드로 만들지 않는다(#3j K5′). 자족성(저장소가 바뀌어도 옛 판이 보인다)은 중계 경로(⑤)가 대신 준다 — 주소가 공급자와 무관하다                                                                                                                                                            |
| ② 서버 범위(질문 1)         | **B — admin-server 가 저장소 추상 업로드 모듈까지.** "UI + 어댑터 계약만" 도 가능했지만 사용자가 킷 안에 두기로 했다                                                                                                                                                                                                                                                                                                                                                        |
| ③ 저장소 구현(질문 2)       | **B — 인터페이스 + 파일 시스템 + S3 호환.** S3 는 서브패스 `@ssworks/admin-server/storage/s3` · 선택 peer `@aws-sdk/client-s3`(`.` 진입점은 import 하지 않는다)                                                                                                                                                                                                                                                                                                             |
| ④ 재인코딩(질문 3)          | **A — `sharp` 재인코딩(ringside U3).** peer `sharp` 필수 — 네이티브 모듈은 소비자 환경에서 설치된다                                                                                                                                                                                                                                                                                                                                                                         |
| ⑤ 보여 주는 길(질문 4)      | **A — API 중계 + 첨부 상태 판정.** 첨부된 것만 보이고 미첨부 · 지움 표시는 404. 미디어 라우트는 **신원을 읽지 않는다** — 편집 중 그림은 `blob:` 이라 서버가 미첨부를 보여 줄 일이 없고, 약관처럼 공개 웹(관리자 쿠키 없음)이 보여 주는 본문도 그대로 되며, 캐시가 단순하고 공개 API 에도 같은 모듈을 올릴 수 있다. 키는 무작위 32자. 비공개 미디어(열람 훅)는 하지 않는다(질문 4-C 미선택 — §11)                                                                            |
| ⑥ 업로드 권한(질문 5)       | **A — 용도(purpose)마다 쓰기 슬롯.** 전역 가드의 넷째 선언 `@RequireUploadPurpose()`(§2-2 U6)                                                                                                                                                                                                                                                                                                                                                                               |
| ⑦ 저장 실패 뒤 고아(질문 6) | **A — 즉시 되돌림 + 정리 잡 안전망.** multipart 한 요청(원자)은 Markdown 을 받는 모든 쓰기 API 가 multipart 가 되고 봉투 · 검증 파이프 · `useWriteFlow` 의 JSON 전제를 깨서 버렸다. "올린 것을 유지하고 재시도에 재사용" 은 포기 · 탭 닫힘이 전부 정리 잡 몫이라 버렸다                                                                                                                                                                                                     |
| ⑧ 임시 그림 표현(접근 1)    | **`blob:` 주소 + 첨부 레지스트리 composable.** v-model 은 Markdown 문자열 그대로(원문 탭 · 미리보기 · 더티 판정 무변경 — `renderMarkdown` 은 `blob:` 을 통과시킨다, 실측). 편집기 `defineExpose` 방식은 바인딩으로 흐르는 `useLegalDocuments` 가 ref 에 닿을 수 없어 버렸고, 자리표시 토큰(`pending:id`)은 노드 뷰 · 렌더 훅이 둘 다 필요해 지금 소비자(자동 저장 없음)에겐 과해 버렸다. 레지스트리 공개 표면(`add` · `commit`)만 잡아 두면 뒤에 토큰 방식으로 넓힐 수 있다 |

### 2-2. 서버 설계 결정 (U)

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U1  | 키 `<용도>/<yyyy>/<mm>/<base64url 32자>.webp` — 용도 `^[A-Za-z0-9_]{1,32}$`(약관 종류와 같은 폭), 연월 UTC, 저장 형식은 언제나 WebP. 추측할 수 없다. 키가 경로 탐색 문자를 품을 수 없음을 패턴이 보장한다                                                                                                                                                                                                                                                                            |
| U2  | 업로드 본문은 **원시 이미지 바이트**(`Content-Type: image/jpeg · png · webp · gif`). multipart 가 아니다 — 이미지 형식은 CORS 단순 요청 형식이 아니라 다른 출처는 사전 요청에서 막히고(CSRF — 같은 출처 + 비단순 본문 규약), 파서를 붙이지 않는다. 컨트롤러가 요청 스트림을 직접 읽는다(`readImageBody(req, maxBytes)` — 상한을 넘는 순간 읽기를 끊고 413). JSON 파서는 `image/*` 를 건드리지 않아 스트림이 온전하다. 압축 본문(`Content-Encoding`)은 받지 않는다(415)               |
| U3  | 재인코딩은 **트랜잭션 밖**: 스트림 읽기 → 미첨부 상한 검사(비잠금 셈 — 근사치면 충분) → 재인코딩 → 저장소 PUT → 짧은 트랜잭션 INSERT → 201. INSERT 실패면 PUT 한 객체를 best-effort 삭제                                                                                                                                                                                                                                                                                             |
| U4  | `DELETE /uploads/:purpose/:yyyy/:mm/:file`(키의 네 조각 — Express 5 는 `:key(*)` 정규식 파라미터를 지원하지 않는다) 는 **본인 · 미첨부 · 미삭제** 행만 `deletedAt` 표시(객체는 정리 잡이). 그 밖은 전부 404 `ERR_UPLOAD_NOT_FOUND` — 없음 · 남의 것 · 첨부됨을 가르지 않는다. 네 조각을 이어 붙인 뒤 `isUploadKey` 를 지나야 조회한다                                                                                                                                                |
| U5  | 중계 `GET <mediaPath 마지막 조각>/<용도>/<yyyy>/<mm>/<파일>` — `@Public()` · `@RawResponse()` · 접두사 밖(`AdminMediaModule` 은 `ADMIN_ROUTE_MODULES` 에 넣지 않는다). 첨부됨 · 미삭제 행만 200. `ETag`(키의 sha256 앞 16자 · 강한 태그) 304, `Cache-Control: public, max-age=600`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Content-Disposition: inline`. 404 · 503 은 `no-store`. 저장소 스트림은 버퍼링 없이 `StreamableFile`             |
| U6  | 권한 선언 `@RequireUploadPurpose()` — `AdminPermissionGuard` 가 아는 **넷째 선언**(슬롯 · 필수 · 하나라도 다음). 가드가 `query.purpose`(POST) 또는 `params.purpose`(DELETE) 에서 용도를 읽어 코어 옵션 `uploads.purposes` 로 푼다 — `slot` 이면 `permissions` 맵의 키(`grantsSlot`), `permissions` 면 적힌 키 전부(`hasPermission`). 모르는 용도 · 형식 밖 · 미등록은 403. 가드는 옵션만 읽고 업로드 모듈을 주입받지 않는다(순환 없음). fail-closed 는 그대로(선언 없는 라우트 403)  |
| U7  | 용도 등록: 옵션 `uploads.purposes` + `AdminLegalModule` 이 등록돼 있으면 `legal → { slot: 'legal.publish' }` 자동. 앱이 같은 이름을 적으면 기동에서 멈춘다. 검사(`onModuleInit`): 용도 형식 · 겹침 · 슬롯 존재(`assertPermissionSlots`) · 권한 키가 카탈로그 안(`permissionCatalog` 가 있을 때) · `assertAuthModuleRegistered`                                                                                                                                                       |
| U8  | 첨부 `attachUploads(trx, { markdown, purpose, refType, refId, actorUserNo })`: `collectUploadKeys(markdown, mediaPath)` 로 키를 모아(본문당 장수 초과 → 409 `ERR_UPLOAD_LIMIT`) 행을 `FOR UPDATE` 로 읽고 키마다 ① 존재 · 미삭제 · 같은 용도 ② "본인 미첨부" **또는** "이미 같은 `refType` 에 첨부됨"(약관 새 판이 앞 판 그림을 다시 씀) — 아니면 404 `ERR_UPLOAD_NOT_FOUND` 로 **저장 전체 실패**. ②-미첨부만 `refType · refId · attachedAt` 을 채운다. 반환 `{ attached: number }` |
| U9  | `syncUploads(trx, { markdown, purpose, refType, refId, actorUserNo })` — 제자리 수정 문서용(앱 몫). `attachUploads` 뒤 같은 `refType · refId` 의 첨부 중 본문에서 빠진 키를 `deletedAt` 표시(ringside U8). 약관은 쓰지 않는다(append-only)                                                                                                                                                                                                                                           |
| U10 | 약관 발행: INSERT 뒤 **같은 트랜잭션**에서 `attachUploads(trx, { purpose: 'legal', refType: CoreAuditTargets.LEGAL_DOCUMENT, refId: legalDocNo })`. `AdminUploadsModule` 이 없으면(`@Optional()` 주입 null) 건너뛴다 — 우리 경로가 본문에 있어도 평범한 링크. 감사 meta `attachedUploads: n`. 잠금 순서: 약관 가드 행 → `legalDocuments` → `uploads`                                                                                                                                 |
| U11 | 정리 `AdminUploadsService.sweep(now)` — ① 미첨부 · 미삭제 · `createdAt < now − pendingTtlHours` 를 지움 표시 ② 지움 표시 행을 100개씩 객체 삭제 → 행 삭제(객체 없음은 통과 · 저장소 오류면 그 행은 남겨 다음 회차 + `warn`). 멱등(여러 인스턴스 겹쳐도 됨). 모듈이 `onApplicationBootstrap` 에서 `setInterval(…).unref()`, `onApplicationShutdown` 에서 멈춤. 옵션 `sweep: false` 면 앱 워커가 직접 부른다(export)                                                                   |
| U12 | 저장소 호출은 서비스가 감싼다 — `put · get · delete` 가 던지면 503 `ERR_UPLOAD_UNAVAILABLE` + `logger.warn`(S3 구현은 문구에서 접근 키 · 비밀 키를 가린다). 저장소 예외가 그 바깥으로 나가지 않는다                                                                                                                                                                                                                                                                                  |
| U13 | 감사: `POST` → `UPLOAD_CREATE`(meta `{ key, purpose, bytes, width, height }`), `DELETE` → `UPLOAD_DELETE`(meta `{ key, purpose }`). 본문 · 바이트는 싣지 않는다. 정리 잡은 감사가 아니라 `logger.log` 한 줄(건수)                                                                                                                                                                                                                                                                    |
| U14 | `mediaPath` 기본 `'/api/media'` — 본문에 적는 공개 경로. 업로드 응답의 `url` 은 `<mediaPath>/<키>` 로 서버가 조립한다(클라이언트는 `url` 만 쓴다). 중계 컨트롤러 경로는 그 **마지막 조각**(`media`)이고 앱 전역 접두사(`api`)가 앞에 붙는다. 둘이 어긋나면 그림만 안 보인다(저장은 됨) — README 한 줄 + 스모크 체크                                                                                                                                                                  |

### 2-3. 저장소 · 재인코딩 결정 (S)

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `AdminObjectStorage { put(key, body: Buffer, contentType): Promise<void>; get(key): Promise<{ body: Readable; contentLength: number } \| null>; delete(key): Promise<void> }` — `get` 은 없으면 `null`, `delete` 는 없어도 성공. 옵션 `uploads.storage` 로 받는다(`forRootAsync` 면 팩토리 안에서 만든다)                                                                                                                                                                               |
| S2  | 파일 시스템 `createFileSystemStorage({ root })`: `<root>/<키>`. 키는 패턴을 지난 것만 오지만 `path.resolve` 뒤 `root` 안인지 한 번 더 본다. `put` 은 `<파일>.tmp-<무작위>` 에 쓰고 `rename`(반쪽 파일 방지) · 상위 폴더 `mkdir -p`. `get` 은 `stat` 뒤 `createReadStream`. 의존성 없음                                                                                                                                                                                                  |
| S3  | S3 호환 `createS3ObjectStorage({ bucket, region?, endpoint?, credentials?, forcePathStyle?, prefix? })` — `PutObject · GetObject · DeleteObject`. 시험은 클라이언트 주입(`client?: S3Client`)으로 보낸 명령을 잰다(실 버킷 없음). 서브패스 `./storage/s3`, `@aws-sdk/client-s3` 는 선택 peer(`peerDependenciesMeta.optional`) + devDependency(빌드 · d.ts)                                                                                                                              |
| S4  | 재인코딩 `encodeUpload(input, policy)`(ringside `encode.ts` 이식): ① 매직 바이트 JPEG · PNG · GIF · WebP 아니면 415(SVG · HEIC · AVIF · TIFF 거름) ② `metadata()` 로 머리만 읽어 픽셀(너비 × 프레임 높이 × 프레임 수) · 프레임 상한을 **풀기 전** 검사 → 400 ③ 정지 이미지 `autoOrient`, 긴 변 > 상한이면 비율 유지 축소(키우지 않음), 움짤은 `animated` 로 열어 움직이는 WebP ④ 메타데이터 미탑재(`withMetadata` 를 부르지 않는다) ⑤ 결과 > 장당 상한 413, 디코드 실패 · 15초 초과 400 |
| S5  | 동시성 문 `EncodeGate`(ringside 이식): 프로세스당 동시 2 · 대기열 8 · 대기 5초 초과 503 `ERR_UPLOAD_UNAVAILABLE`. 재인코딩을 시작한 뒤의 실패는 행을 만들지 않으니 미첨부 칸을 쓰지 않는다                                                                                                                                                                                                                                                                                              |
| S6  | 정책 `UploadPolicy`(admin-shared 기본값 · 서버 옵션이 덮음): `maxBytes 10 MiB` · `maxLongEdge 2048` · `maxInputPixels 40_000_000` · `maxFrames 100` · `webpQuality 82` · `maxPerBody 20` · `maxPendingPerUser 50` · `pendingTtlHours 24`                                                                                                                                                                                                                                                |

### 2-4. 클라이언트 설계 결정 (C)

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `useImageAttachments(options)` 가 파일 ↔ `blob:` 대응표를 갖는다. `add(files, body)` 는 형식 → 크기 → 남은 칸(`maxPerBody − collectUploadKeys(body).length − body 안 등록 blob 수 − 이번에 받은 수`) 순으로 거르고 사유별로 `onRejected` 한 번씩, 받아들인 것의 `blob:` 주소를 순서대로 돌려준다                                                                                                                 |
| C2  | `commit(markdown, save)` — 본문에 **남아 있는** 등록 주소만(문자열 포함 검사 — UUID 라 오탐 없음) 차례로 `upload(file)` → 전부 치환 → `save(치환본)`. 성공이면 그 그림의 URL 해제 · 등록 삭제. 업로드 · `save` 어느 쪽이 던지든 방금 올린 키를 `remove(key)` 로 best-effort(실패 삼킴) 지우고 **원래 예외를 다시 던진다**. 초안 문자열은 건드리지 않는다. 진행 중 재진입은 거부(`busy`). 503 도 자동 재시도 없음 |
| C3  | `MarkdownEditor` prop `attachments?: ImageAttachments`. 있을 때만 그림 단추(`mdi-image-plus` + 숨은 `<input type=file multiple accept=UPLOAD_CONTENT_TYPES.join(',')>`) · ProseMirror `handlePaste` · `handleDrop`(파일이 있을 때만 가로챔 — 글자는 기본 동작) · 원문 textarea 의 `paste` · `drop`(`![](blob:…)` 줄을 캐럿 자리에). 없으면 지금과 같다. `readonly` 면 셋 다 꺼진다                               |
| C4  | 넣기는 `EditorImage` 입력 규칙과 같은 자리 규칙 — `insertContentAt` 로 그림 블록, 캐럿은 그림 뒤(#3j A4 캐럿 규칙 재사용). 여러 장은 순서대로 이어 넣는다. 드롭은 `view.posAtCoords` 자리                                                                                                                                                                                                                        |
| C5  | 편집기는 토스트를 띄우지 않는다 — 거부는 레지스트리 `onRejected` 로 페이지가. `attachments.busy` 동안 편집기를 잠그지 않는다(저장 흐름의 `submitting` 이 이미 잠근다)                                                                                                                                                                                                                                            |
| C6  | `ApiClient.api.uploadFile<T>(url, file, config?)` — `transformRequest: [(d) => d]` · `Content-Type: file.type` 으로 Blob 을 그대로 보낸다(기본 `post` 는 bigint JSON 직렬화를 거친다). 응답 봉투는 평소대로                                                                                                                                                                                                      |
| C7  | `useLegalDocuments` 옵션 `attachments?`. 있으면 `requestPublish` 의 action 이 `attachments.commit(draft, (body) => publish({ kind, body, baseLegalDocNo }))`. `editor` 바인딩에 `attachments` 가 실려 `LegalDocumentEditor`(prop 통과) → `MarkdownEditor`. 용도는 페이지가 어댑터에서 정한다                                                                                                                     |
| C8  | 레지스트리는 그림을 지웠다 되돌려도(Ctrl+Z) · 외부 변경(재조회 · 초안 버리기)이 와도 그대로다 — 저장 때 본문에 있는 것만 올라간다. 스코프 해제 때 남은 URL 전부 해제                                                                                                                                                                                                                                             |

## 3. 정본 (ringside — 읽기만 · 킷 규약으로 옮긴다)

| ringside                                                                      | 킷                                                         | 바꾸는 점                                                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/contracts/uploads.ts`(키 · 형식)                         | admin-shared `uploads.ts`                                  | 용도 접두사를 `post\|article` 고정에서 옵션 용도로 · 정책 기본값 · `collectUploadKeys` 를 Markdown 입력으로 |
| `packages/shared/src/uploads/render.ts` `collectMediaKeys`                    | admin-shared `collectUploadKeys(markdown, mediaPath)`      | HTML 이 아니라 Markdown 을 받아 안에서 `renderMarkdown` · `mediaPath` 인자                                  |
| `apps/api/src/uploads/encode.ts` · `EncodeGate`                               | admin-server `uploads/encode.ts`                           | 정책 타입을 admin-shared `UploadPolicy` 로 · 오류 팩토리를 킷 `BusinessError` 로                            |
| `apps/api/src/uploads/upload-body.ts`(express.raw 미들웨어)                   | admin-server `uploads/read-body.ts`(스트림 직접 읽기)      | 미들웨어 대신 컨트롤러가 읽는다(U2 — RouterModule 접두사와 무관)                                            |
| `apps/api/src/uploads/media.controller.ts` · `media-http.ts`                  | admin-server `media/media.controller.ts` · `media-http.ts` | 신원 · 분석글 판정 제거(⑤) · 첨부됨만 200                                                                   |
| `apps/api/src/uploads/uploads.service.ts`(미첨부 셈 · 생성)                   | admin-server `uploads/uploads.service.ts`                  | 회원 → 관리자 · 용도 옵션 · `releasePending` 대신 `DELETE` + 정리                                           |
| `@ringside/db` `createS3ObjectStorage` · `uploads` 표                         | admin-server `storage/s3.ts` · 장 `0013_uploads`           | 인터페이스를 킷 S1 로 좁힘 · 열 이름 camelCase 계약(`storageKey · refType · refId`)                         |
| `apps/web/app/utils/uploads.ts`(`planUploads` · 사유 · 문구)                  | admin-ui `composables/image-attachments.ts`(순수)          | 즉시 업로드 큐 → 저장 시점 `commit` · 축소(`image-shrink`) 제외                                             |
| `apps/web/app/utils/upload-queue.ts`                                          | (대체) `useImageAttachments.commit`                        | 차례 올리기 골격만 — 세션 확인 · 토스트 제거(킷은 예외를 그대로 올린다)                                     |
| `apps/web/app/components/ring/RingMarkdownEditor.vue`(단추 · 붙여넣기 · 드롭) | admin-ui `MarkdownEditor.vue`                              | textarea 이벤트 → ProseMirror `handlePaste · handleDrop` + 원문 textarea 이벤트                             |

## 4. 공개 API

### 4-1. admin-shared (`uploads.ts` · `error-codes.ts` · `audit.ts`)

```ts
export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const UPLOAD_PURPOSE_PATTERN = /^[A-Za-z0-9_]{1,32}$/
export const UPLOAD_KEY_PATTERN = /^([A-Za-z0-9_]{1,32})\/\d{4}\/\d{2}\/[A-Za-z0-9_-]{32}\.webp$/
export function isUploadKey(value: string): boolean
export function uploadPurposeOf(key: string): string | null
export const DEFAULT_MEDIA_PATH = '/api/media'
export interface UploadPolicy { maxBytes; maxLongEdge; maxInputPixels; maxFrames; webpQuality; maxPerBody; maxPendingPerUser; pendingTtlHours }
export const DEFAULT_UPLOAD_POLICY: Readonly<UploadPolicy>
export function collectUploadKeys(markdown: string, mediaPath?: string): string[]   // 중복 없음 · 순서 유지
export const uploadPurposeSchema: z.ZodString
export const adminUploadCreatedSchema = z.object({ key, url, width, height, bytes })
export type AdminUploadCreated
// CommonErrorCodes 에 더함(상태는 코어 표에):
//   ERR_UPLOAD_UNSUPPORTED_TYPE 415 · ERR_UPLOAD_TOO_LARGE 413 · ERR_UPLOAD_INVALID_IMAGE 400
//   ERR_UPLOAD_LIMIT 409 · ERR_UPLOAD_NOT_FOUND 404 · ERR_UPLOAD_UNAVAILABLE 503
// CoreAuditActions.UPLOAD_CREATE = 'upload.create' · UPLOAD_DELETE = 'upload.delete' · CoreAuditTargets.UPLOAD = 'upload'
//   라벨 「이미지 올리기」 · 「이미지 지우기」 · 「업로드」
```

### 4-2. admin-server

```ts
// 옵션
interface AdminServerOptions { uploads?: AdminUploadsOptions }
interface AdminUploadsOptions {
  storage: AdminObjectStorage
  mediaPath?: string                                   // 기본 DEFAULT_MEDIA_PATH
  purposes?: Record<string, { slot?: AdminPermissionSlot; permissions?: readonly string[] }>
  policy?: Partial<UploadPolicy>
  sweep?: { intervalMinutes?: number } | false         // 기본 { intervalMinutes: 60 }
}
// 모듈
export class AdminUploadsModule   // ADMIN_ROUTE_MODULES 에 더한다(접두사 안) — POST /uploads · DELETE /uploads/:purpose/:yyyy/:mm/:file
export class AdminMediaModule     // 접두사 밖 — GET <media>/:purpose/:yyyy/:mm/:file
// 저장소
export interface AdminObjectStorage { put; get; delete }
export function createFileSystemStorage(options: { root: string }): AdminObjectStorage
// 서브패스 '@ssworks/admin-server/storage/s3'
export function createS3ObjectStorage(options: { bucket; region?; endpoint?; credentials?; forcePathStyle?; prefix?; client? }): AdminObjectStorage
// 첨부(앱 쓰기 라우트가 트랜잭션 안에서 부른다)
export function attachUploads(trx, input: { markdown; purpose; refType; refId: bigint; actorUserNo: bigint; mediaPath? }): Promise<{ attached: number }>
export function syncUploads(trx, input: 같은 모양): Promise<{ attached: number; detached: number }>
// 정리(앱 워커용)
export class AdminUploadsService { sweep(now?: Date): Promise<{ marked: number; deleted: number; failed: number }> }
// 선언
export function RequireUploadPurpose(): CustomDecorator<string>
// 표
interface AdminDatabase { uploads: AdminUploadsTable }
// 장
'0013_uploads'
```

라우트(접두사 `/admin` 기준):

| 메서드 · 경로                                    | 선언                                                        | 본문 · 응답                                            |
| ------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------ |
| `POST /admin/uploads?purpose=<p>`                | `@RequireUploadPurpose()` · `@Audit(UPLOAD_CREATE, UPLOAD)` | 원시 이미지 → `201 { key, url, width, height, bytes }` |
| `DELETE /admin/uploads/:purpose/:yyyy/:mm/:file` | `@RequireUploadPurpose()` · `@Audit(UPLOAD_DELETE, UPLOAD)` | → `200 { success: true, data: null }` · 그 밖 404      |
| `GET /api/media/:purpose/:yyyy/:mm/:file`        | `@Public()` · `@RawResponse()`                              | `image/webp` 스트림 · 304 · 404 · 503                  |

### 4-3. admin-ui

```ts
export function useImageAttachments(options: {
  upload: (file: File) => Promise<AdminUploadCreated>
  remove?: (key: string) => Promise<void>
  policy?: Partial<Pick<UploadPolicy, 'maxBytes' | 'maxPerBody'>>
  mediaPath?: string
  onRejected?: (notice: ImageAttachmentRejection) => void // { reason: 'type' | 'size' | 'full'; count: number; message: string }
  messages?: Partial<ImageAttachmentMessages>
}): ImageAttachments
export interface ImageAttachments {
  add(files: readonly File[], body: string): string[]
  commit<T>(markdown: string, save: (final: string) => Promise<T>): Promise<T>
  busy: Readonly<Ref<boolean>>
  progress: Readonly<Ref<{ done: number; total: number }>>
  dispose(): void
}
export const DEFAULT_IMAGE_ATTACHMENT_MESSAGES // rejectedType · rejectedSize · rejectedFull · uploading(n, m)
// MarkdownEditor props: + attachments?: ImageAttachments ; messages: + image
// LegalDocumentEditor props: + attachments?: ImageAttachments
// useLegalDocuments options: + attachments?: ImageAttachments ; editor 바인딩에 attachments
// ApiClient.api: + uploadFile<T>(url, file, config?)
// 오류 문구 표: ERR_UPLOAD_* 여섯의 기본 문구
```

## 5. 흐름

### 5-1. 편집 중

편집기 단추 · 붙여넣기 · 드롭 → `attachments.add(files, 현재 본문)` → 받아들인 `blob:` 마다 그림 블록 `insertContentAt`(캐럿은 그림 뒤) → `onUpdate` 디바운스 emit(평소와 같음) → 부모 초안에 `![](blob:…)` → `MarkdownView` 미리보기에 그림이 보인다(`renderMarkdown` 통과). 원문 탭에서도 같은 줄이 보인다.

### 5-2. 저장 (약관 발행 기준)

```
requestPublish → useWriteFlow.run({ gate: 'confirm', action })
action = attachments.commit(draft, (body) => publish({ kind, body, baseLegalDocNo }))
  commit: pending = 등록 주소 중 draft 에 포함된 것(순서 = 등록 순)
          for each: created = await upload(file)          // POST /admin/uploads?purpose=legal
                    uploaded.push(created.key); map[blob] = created.url
          final = draft 의 blob 들을 url 로 전부 치환
          try   result = await save(final)                // POST /admin/legal-documents
                → 성공: revoke(pending) · 등록 삭제 · return result
          catch → for key of uploaded: await remove(key).catch(() => {})   // DELETE /admin/uploads/<key>
                → rethrow
```

서버(`AdminLegalService.publish`): 가드 행 잠금 → 시행본 `FOR UPDATE` → 같은 본문 409 → INSERT → **`attachUploads(trx, …)`** → 커밋 → 응답. 첨부가 던지면 트랜잭션이 통째로 롤백되고 클라이언트 되돌림이 돈다.

### 5-3. 업로드 요청 하나 (`POST /uploads`)

인증 가드 → 권한 가드(`@RequireUploadPurpose` — 용도 → 권한) → 컨트롤러: Content-Type 검사(415) → `readImageBody`(413) → 미첨부 상한(409) → `EncodeGate.run(encodeUpload)`(415 · 400 · 413 · 503) → 키 생성 → 저장소 PUT(503) → INSERT(실패면 PUT 객체 best-effort 삭제) → 감사 meta → 201.

### 5-4. 중계 (`GET /api/media/…`)

키 조립 · 패턴(404) → 행 조회(첨부됨 · 미삭제 — 아니면 404) → `If-None-Match` 일치면 304(저장소 안 부름) → 저장소 `get`(null 404 + warn · 던짐 503) → 머리글 → `StreamableFile`. 스트림 도중 오류는 `warn` 만(응답은 이미 시작).

### 5-5. 정리

매 `intervalMinutes`: ① `UPDATE uploads SET deletedAt = now WHERE refType IS NULL AND deletedAt IS NULL AND createdAt < now − ttl` ② `SELECT … WHERE deletedAt IS NOT NULL ORDER BY uploadNo LIMIT 100` → 객체 `delete` → 행 `DELETE`(객체 삭제가 던진 행은 건너뜀 · 다음 회차). 결과 건수 `logger.log`.

### 5-6. 전역 잠금 순서 (2e §5-1 · 2f-1 §5-5 에 더함)

`guardLocks(legalPublish)` → `legalDocuments` → `uploads`. 앱 라우트가 `attachUploads` 를 부를 때도 자기 문서 행을 먼저 잠그고 `uploads` 는 **마지막**이다(README).

## 6. 오류 · 경계 사례

| 상황                                                       | 처리                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 형식 밖 · 너무 큼 · 칸 없음(클라이언트)                    | 등록하지 않고 `onRejected`(사유별 한 번). 받아들인 장만 넣는다                                                                                   |
| 업로드 n장째 실패(415 · 413 · 400 · 409 · 503 · 연결)      | 멈춤 → 앞서 올린 키 `remove` → 원래 예외 재던짐. 초안 `blob:` 그대로. 다시 저장하면 전부 다시 올린다                                             |
| 본문 저장 실패(409 revision · 400 · 404 첨부 거부 · 연결)  | 같은 되돌림. `useWriteFlow` 평소 분류(충돌 `onConflict` · 검증 `fieldErrors`)                                                                    |
| `remove` 실패                                              | 삼킨다. 미첨부 24시간 뒤 정리 잡                                                                                                                 |
| 세션 만료 중 업로드(401)                                   | API 클라이언트 기존 갱신 · 로그아웃 경로. 예외는 되돌림을 탄다                                                                                   |
| 저장 성공인데 응답 유실(클라이언트는 실패로 봄)            | 되돌림 `DELETE` 가 "첨부됨" 이라 404 → 삼킴. 서버 상태 정상                                                                                      |
| 같은 그림을 두 번 넣음                                     | `blob:` 하나 · 본문 두 번 → 업로드 한 번 · 치환 두 번                                                                                            |
| 그림을 넣었다 지움                                         | 본문에 없으니 올라가지 않음. URL 은 스코프 해제 때                                                                                               |
| 원문 탭에서 `blob:` 주소를 손으로 고침                     | 등록 주소와 다르면 올라가지 않고 그대로 저장 → 서버 첨부는 우리 키가 아니라 무시 · 그림은 깨진 채. README "원문 탭에서 `blob:` 을 고치지 않는다" |
| 약관 새 판이 앞 판의 `/api/media/legal/…` 을 그대로 씀     | U8 ② "이미 같은 refType 에 첨부됨" 통과. refId 는 첫 판 그대로                                                                                   |
| 남의 미첨부 키 · 다른 용도 키 · 지움 표시 키를 본문에 적음 | 첨부 404 로 저장 전체 실패(열거 방어 — 사유를 가르지 않음)                                                                                       |
| 본문당 장수 초과                                           | 클라이언트 `full` 이 먼저, 뚫고 오면 서버 첨부 409 `ERR_UPLOAD_LIMIT`                                                                            |
| 미첨부 상한(사람당)                                        | 업로드 409. 되돌림이 정상이면 거의 닿지 않는다                                                                                                   |
| `mediaPath` 와 실제 라우트 어긋남                          | 그림만 안 보임(저장은 됨). README · 스모크 체크                                                                                                  |
| 저장소 꺼짐                                                | 업로드 503 · 중계 503(`no-store`) · 정리 잡은 그 행을 남기고 `warn`                                                                              |
| `AdminUploadsModule` 없이 본문에 우리 경로                 | `@Optional()` — 첨부 생략 · 평범한 링크                                                                                                          |
| `Content-Encoding` 있는 업로드                             | 415(압축 폭탄 — 풀지 않는다)                                                                                                                     |
| 재인코딩 결과가 원본보다 큼(팔레트 PNG → truecolor)        | 결과 기준으로 413 — 되돌림 뒤 사용자가 작은 그림으로. 원본 보존 분기는 두지 않는다(ringside 와 다름 — 저장 형식 WebP 하나를 지킨다)              |

오류 표(코어 `CommonErrorCodes` 추가분):

| 코드                          | 상태 | 어디서                                                 | 기본 문구(서버 `UPLOAD_MESSAGES` · admin-ui 표)              |
| ----------------------------- | ---- | ------------------------------------------------------ | ------------------------------------------------------------ |
| `ERR_UPLOAD_UNSUPPORTED_TYPE` | 415  | Content-Type · 매직 바이트 · `Content-Encoding`        | 지원하지 않는 이미지 형식입니다. (JPG · PNG · WebP · GIF)    |
| `ERR_UPLOAD_TOO_LARGE`        | 413  | 원본 상한 · 결과 상한                                  | 이미지가 너무 큽니다. (장당 최대 10MB)                       |
| `ERR_UPLOAD_INVALID_IMAGE`    | 400  | 머리 못 읽음 · 픽셀 · 프레임 · 디코드 실패 · 시간 초과 | 이미지를 읽을 수 없습니다.                                   |
| `ERR_UPLOAD_LIMIT`            | 409  | 사람당 미첨부 상한 · 본문당 장수(첨부)                 | 이미지 수가 한도를 넘었습니다.                               |
| `ERR_UPLOAD_NOT_FOUND`        | 404  | DELETE · 첨부 검사 · 중계                              | 이미지를 찾을 수 없습니다.                                   |
| `ERR_UPLOAD_UNAVAILABLE`      | 503  | 저장소 오류 · 재인코딩 대기 초과                       | 이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요. |

## 7. 의존성

| 패키지       | 변경                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admin-shared | 없음(zod · markdown-it 기존)                                                                                                                                                                                                       |
| admin-server | peer **`sharp ^0.35`**(필수 — 재인코딩) · 선택 peer **`@aws-sdk/client-s3 ^3.0.0`**(`peerDependenciesMeta.optional`) · dev 둘 다. `exports` 에 `./storage/s3` 추가. `./runner` 는 둘 다 import 하지 않는다(`runner-graph.test.ts`) |
| admin-ui     | 없음. peer `@ssworks/admin-shared` 하한 → 2h 가 실리는 판                                                                                                                                                                          |
| 루트         | `pnpm.onlyBuiltDependencies` 에 `sharp`(pnpm 10 은 빌드 스크립트를 기본 차단) · CI 는 `sharp` 의 사전 빌드 바이너리를 쓴다                                                                                                         |

## 8. 파일

```
packages/admin-shared/src/
  uploads.ts · uploads.test.ts                 # 키 · 형식 · 정책 · 스키마 · collectUploadKeys
  error-codes.ts(+6) · audit.ts(+3 · 라벨) · index.ts
packages/admin-server/src/
  uploads/
    uploads.module.ts · uploads.controller.ts · uploads.service.ts
    options.ts(resolveUploadsConfig — 용도 · 정책 · 정리) · options.test.ts
    encode.ts(encodeUpload · EncodeGate · sniffFormat) · encode.test.ts(픽스처 fixtures/*.png|jpg|gif|webp)
    read-body.ts · read-body.test.ts
    attach.ts(attachUploads · syncUploads) · attach.db.test.ts
    sweep.ts · sweep.db.test.ts
    errors.ts(UPLOAD_MESSAGES + 팩토리 여섯)
    uploads.http.test.ts(프로브 · 메모리 저장소)
  media/
    media.module.ts · media.controller.ts · media-http.ts(etag · 머리글) · media-http.test.ts · media.http.test.ts
  storage/
    object-storage.ts(인터페이스) · file-system.ts · file-system.test.ts · s3.ts(서브패스 진입점 → dist/storage/s3.js) · s3.test.ts
  test-support/memory-storage.ts(시험용 메모리 저장소 — HTTP 프로브 · 정리 테스트가 쓴다)
  auth/permission.guard.ts(+넷째 선언) · tokens.ts(+REQUIRE_UPLOAD_PURPOSE · ADMIN_UPLOADS_CONFIG) · auth/upload-purpose.ts(선언 · 해석) · 테스트
  database/migrations/0013_uploads.ts · index.ts · tables/uploads.ts · types.ts
  legal/legal.service.ts(+attachUploads @Optional) · legal.service.db.test.ts(+첨부)
  admin-server.module.ts(ADMIN_ROUTE_MODULES + AdminUploadsModule) · options.ts(+uploads) · index.ts
  http/messages.ts(ADMIN_SERVER_DEFAULT_MESSAGES + UPLOAD_MESSAGES)
packages/admin-ui/src/
  composables/image-attachments.ts(순수 — 거르기 · 치환 · 사유 문구) · image-attachments.test.ts
  composables/useImageAttachments.ts · useImageAttachments.test.ts
  composables/useLegalDocuments.ts(+attachments) · 테스트
  components/markdown/MarkdownEditor.vue(+단추 · paste · drop) · markdown-editor.ts(+messages.image) · markdown-editor.render.test.ts(+)
  components/legal/LegalDocumentEditor.vue(+prop 통과)
  api/client.ts(+uploadFile) · client.test.ts · api/error-messages(ERR_UPLOAD_*)
  index.ts
docs/superpowers/plans/YYYY-MM-DD-admin-server-uploads.md · YYYY-MM-DD-admin-ui-image-attachments.md(플랜 작성일 — PR 2h · PR #3k)
```

## 9. 테스트 계약

### 9-1. 단위 · HTTP (`pnpm check`)

- admin-shared: 키 패턴(용도 폭 · 연월 · 32자 · 확장자 · `../` · 대소문자) · `uploadPurposeOf` · `collectUploadKeys`(코드 블록 안 무시 · 링크 `[x](/api/media/…)` 는 그림이 아니라 무시 · 중복 하나 · `mediaPath` 불일치 무시 · 참조식 그림 · 제목 있는 그림) · 정책 기본값 · 오류 코드 상태 여섯 · 감사 라벨 · 개수 테스트 갱신.
- admin-server 단위: `sniffFormat` 넷 + 거름(SVG · BMP) · `readImageBody`(정상 · 상한 초과에서 중단 · 빈 본문 · `Content-Encoding`) · `EncodeGate`(동시 2 · 대기열 8 · 대기 초과 503 · 던져도 문 반환) · `encodeUpload` 실 sharp 픽스처(1×1 PNG → WebP · EXIF 방향 6 JPEG 가 돌려짐 · 3000px 가 2048 로 · 2프레임 GIF → 움직이는 WebP · 픽셀 폭탄 머리 400 · 잘린 JPEG 400 · 결과 EXIF 없음) · 용도 해석(슬롯 · 키 · 미등록 · 형식 밖 · DELETE 키 접두사) · 옵션 검증(용도 형식 · 겹침 · `legal` 자동 · 슬롯 없음 · `sweep: false`) · 파일 시스템 저장소(임시 폴더 — put/get/delete · 없음 null · 반쪽 파일 없음 · `root` 밖 거부) · S3 저장소(주입 클라이언트가 받은 `PutObject · GetObject · DeleteObject` 입력 · `NoSuchKey` → null · 오류 문구 키 가림) · 정적 검사(`.` 진입점이 `storage/s3` · `@aws-sdk` 를 import 하지 않음 · `./runner` 무의존 · `legal-append-only` 그대로).
- admin-server HTTP(프로브 모듈 · 메모리 저장소 · **실 sharp** 와 작은 픽스처 — 재인코딩을 가짜로 바꾸지 않는다, `sharp` 는 dev 의존이라 `pnpm check` 에서 돈다): `POST` 201 모양 · 415(Content-Type · 매직) · 413 · 400 · 409(미첨부 상한) · 403(권한 없음 · 모르는 용도 · 선언 없는 라우트 fail-closed 회귀) · `DELETE` 200 · 404(남의 것 · 첨부됨 · 없음) · 감사 한 줄씩(meta 키) · 중계 200 머리글 다섯 · 304 · 404(미첨부 · 지움) · 503 `no-store` · 중계가 `@Public()`(세션 없이).
- admin-ui(happy-dom): `image-attachments.ts` 순수(거르기 순서 · 남은 칸 셈 · 치환 · 사유 묶음) · `useImageAttachments`(`createObjectURL` 스텁 · `add` 순서 · `commit` 업로드 순서 · 본문에 남은 것만 · 성공 뒤 `revokeObjectURL` · 업로드 실패 되돌림(앞선 키만) · `save` 실패 되돌림 · `remove` 실패 삼킴 · 재진입 거부 · `dispose` 해제) · 편집기(단추 유무 · readonly 꺼짐 · 파일 붙여넣기 → 그림 노드 + `doc.check()` · 글자 붙여넣기 기본 동작 유지 · 드롭 · 원문 탭 붙여넣기 줄 · 여러 장 순서 · 캐럿) · `useLegalDocuments`(`attachments` 있을 때 `publish` 인자가 치환본 · 실패 때 초안 보존 · 없을 때 무변경) · `uploadFile` 이 Blob 그대로 + `Content-Type`.

### 9-2. 실 MariaDB (`pnpm test:db` — 11.4 · 12.3)

- 장 `0013` up/down 왕복 · `AdminDatabase.uploads` 타입 일치.
- 첨부 네 갈래(본인 미첨부 → 채움 · 같은 refType 재사용 통과 · 남의 미첨부 404 · 지움 표시 404 · 다른 용도 404) · 본문당 장수 409 · 모르는 키(우리 경로 아님) 무시.
- 약관 발행이 첨부를 채우고 감사 meta 에 `attachedUploads` · 첨부 실패가 발행을 롤백.
- `syncUploads` 가 빠진 키를 지움 표시하고 남은 키는 그대로.
- 정리: 보관 초과만 표시 · 100개 묶음 · 객체 없는 행 삭제 · 저장소 오류 행 보존 · 두 번 돌려도 같은 결과.
- 경합: 두 발행이 같은 미첨부 키를 첨부 — 하나만 성공 · 잠금 순서(가드 행 → 문서 → uploads)로 교착 없음.

### 9-3. 실브라우저 (스모크 앱 + Chrome 도구)

단추로 고르기 · 스크린숏 붙여넣기 · 파일 드롭 · 미리보기에 보임 · 발행 → 이력 원문이 `/api/media/legal/…` · 그림이 중계로 보임(네트워크 200 · 304) · 서버를 끄고 발행 → 오류 토스트 · 초안 보존 · 서버 켜고 표에 미첨부 없음(되돌림 확인) · 콘솔 오류 없음. 한글 IME 중 붙여넣기 · 모바일은 사람.

### 9-4. 리뷰 초점 (테스트가 못 잡는 것)

- 스트림 읽기가 상한에서 **소켓을 닫지 않고** 남은 본문을 버리는지(클라이언트가 413 을 받게).
- `EncodeGate` 가 예외 경로에서도 문을 돌려주는지.
- 되돌림이 "방금 올린 키" 만 지우는지(앞 저장의 키 · 이미 첨부된 키를 건드리지 않음).
- 미디어 라우트가 어떤 경로로도 미첨부 · 지움 표시를 내보내지 않는지(열거 방어).
- `legal.service.ts` 의 `@Optional()` 주입이 모듈 미등록에서 null 인지(Nest 는 미해결 provider 를 undefined 로 준다 — `?? null`).

## 10. 릴리스 · 문서

- changeset: admin-shared **minor**(계약 · 코어 코드 · 감사 카탈로그) · admin-server **minor**(모듈 둘 · 저장소 · 장 0013 · peer `sharp` 필수 — 소비자가 할 것: `sharp` 설치 · `uploads` 옵션 · 장 스텁 `0013` · 중계 경로 `mediaPath` 확인 · `onlyBuiltDependencies`) · admin-ui **minor**(`useImageAttachments` · 편집기 prop · `uploadFile` · peer 하한).
- README(admin-server): 「이미지 업로드」 절 — 옵션 · 저장소 둘 · 용도 등록 · 앱 라우트에서 `attachUploads` · 잠금 순서 · 정리 · `mediaPath` 와 전역 접두사 · 공개 API 에 `AdminMediaModule` 만 올리기 · S3 서브패스.
- README(admin-ui): 「마크다운 편집기」 절 갱신 — 그림(업로드 있음 · `useImageAttachments` · 저장 시점 · 되돌림 · 자동 저장은 `commit` 을 거친다 · 원문 탭 `blob:` 손대지 않기) · `useLegalDocuments.attachments` · `uploadFile`.
- CLAUDE.md admin-server 절: 업로드 규칙 두 줄(재인코딩 · 저장소는 트랜잭션 밖 / `uploads` 는 잠금 순서의 마지막 / 미디어 라우트는 첨부됨만).
- `docs/01-phase0.md` §8 표 · CLAUDE.md 진행 표 두 줄 · HANDOFF(ringside 적용 입력 — 자기 업로드 모듈을 킷 것으로 바꿀지는 ringside 가 정한다 · 템플릿 `preset/admin` 입력).

## 11. 비범위 · 보류

- 브라우저 쪽 축소(ringside WF2) — 서버가 줄인다. 관리자는 대개 데스크톱.
- 비공개 미디어(열람 훅 · 서명 URL) — 질문 4-C 미선택. 첨부 = 공개. 필요해지면 `refType` 별 판정 훅 스펙을 연다.
- multipart · 한 요청 원자 저장 · 자리표시 토큰(접근 3) · 자동 저장.
- 그림 alt · 제목 편집 대화상자 · 크기 조절 · 정렬 · 캡션.
- 업로드 목록 관리 화면 · 정책을 DB 설정으로(ringside `uploads.policy`) — 옵션 상수로 충분.
- S3 presigned 직접 업로드 · CDN · 지운 문서의 그림 30일 유예(ringside U16 — 킷은 `syncUploads` 가 표시하고 다음 정리에 지운다).
- 템플릿 `preset/admin` · ringside 적용 — 별도 세션.

## 12. 플랜에서 먼저 확인할 위험

1. **`sharp` 설치 경로**: pnpm 10 `onlyBuiltDependencies` · CI(ubuntu) 사전 빌드 바이너리 · Windows 로컬. 플랜 Task 1 에서 `pnpm add` 뒤 `pnpm check` 가 도는지부터.
2. **RouterModule 접두사와 `@Controller()` 경로 파라미터**: `GET media/:purpose/:yyyy/:mm/:file` · `DELETE uploads/:purpose/:yyyy/:mm/:file` 이 Express 5 라우터에서 그대로 맞는지(`.webp` 가 든 마지막 조각 — Express 5 는 `:name(regex)` · `*` 를 지원하지 않아 네 파라미터로 받는다) — 프로브로 먼저.
3. **전역 가드 넷째 선언**: `permission.guard.ts` 의 분기 추가가 기존 fail-closed 회귀 테스트(`auth.guard.*` · `permission.guard.*`)를 깨지 않는지 — 분기는 "선언이 있을 때만".
4. **요청 스트림 직접 읽기와 Nest 의 본문 파서 순서**: `configureAdminApp` 의 JSON 파서가 `image/*` 를 지나치는지(type 불일치) · `@Req()` 로 받은 스트림이 소비되지 않았는지.
5. **`@Optional()` 주입**: 약관 모듈이 업로드 설정을 선택적으로 받는 방식이 Nest 12 에서 모듈 미등록을 깔끔히 null 로 주는지.
6. **happy-dom 의 `URL.createObjectURL`**: 없으면 스텁 — 테스트 하니스에 넣는다.
7. **TipTap `handleDrop` 과 기본 그림 드롭**: ProseMirror 는 파일 드롭을 기본으로 처리하지 않지만 브라우저가 그림을 열지 않도록 `preventDefault` 가 필요 — 실브라우저에서 확인.

## 13. 구현 중 정정 (PR 2h — 2026-11-02)

스펙과 다르게 한 것 · 스펙이 정하지 않아 구현이 정한 것과 그 이유. PR #3k 는 여기부터 읽는다.

- **U4 · §4-2 DELETE 경로**: `DELETE /uploads/:purpose/:yyyy/:mm/:file` — 키의 네 조각. Express 5(path-to-regexp v8)는 `:key(*)` 같은 정규식 파라미터가 없다.
- **U5 CORP**: 중계의 `Cross-Origin-Resource-Policy` 는 `same-site`(ringside 는 `same-origin`) — API 와 웹을 서브도메인으로 나눠 배치해도(`api.example.com` → `www.example.com`) 그림이 보이게. 다른 사이트의 핫링크는 그대로 막는다.
- **U14 중계 경로**: 컨트롤러 경로는 `media` 고정(데코레이터는 정적)이다 — `mediaPath` 는 `'<앱 전역 접두사>/media'` 이고 `/media` 로 끝나지 않으면 기동에서 멈춘다.
- **§6 413 문구**: `ERR_UPLOAD_TOO_LARGE` 문구에 숫자를 넣지 않는다 — 상한은 정책이라 `details.maxBytes` 로 싣고 화면이 붙인다.
- **§6 · §9-1 503 문구**: `ERR_UPLOAD_UNAVAILABLE` 의 문구는 서버가 보내지 않는다 — 5xx 는 고정 문구로 가린다(코어 설계, 코드는 남는다). admin-ui 가 코드로 문구를 고른다(PR #3k).
- **U6 용도 읽기**: 가드는 용도를 `query.purpose` 또는 `params.purpose` **하나**에서 읽는다 — 둘 다 오면 403(가드와 핸들러가 다른 값을 보는 혼동된 대리인을 막는다 · 리뷰).
- **U7 권한 키 검사**: 앱 용도의 `permissions` 키를 권한 카탈로그와 대조하지 않는다 — 슬롯은 `permissions` 맵에 이어졌는지만 본다(그것으로 충분).
- **U8 · U9 엄격한 sync**: `syncUploads` 는 이미 첨부된 키가 같은 refType **과 refId** 여야 통과한다(`strictRef`). `attachUploads`(약관)는 U8 ② 그대로(같은 refType). 다른 문서의 그림을 적은 저장은 404 — 복사해 쓰려면 다시 올린다. 한 문서의 수정이 다른 문서의 그림을 지우지 못하게.
- **§4-2 첨부 시그니처**: `attachUploads` 는 `{ attached, keys }` 를 돌려준다(`syncUploads` 는 `detached` 를 더한다). `attach` · `sync` · `attachUploads` · `syncUploads` 의 첫 인자는 `Transaction<AdminDatabase>` — 쓰는 쪽 `Transaction<Database>` 가 그대로 들어가고 트랜잭션 밖 호출은 타입이 막는다.
- **U10 · §5-2 키 모으기는 트랜잭션 밖**: `AdminUploadsService.collectKeys`(Markdown 렌더 · 본문당 장수 409)를 트랜잭션 밖에서 부르고 안에는 `keys`(`AttachUploadsInput.keys`)를 넘긴다 — 가드를 쥔 채 1,000,000자를 렌더하지 않게(실측 약 0.1~1.2초). 그래서 약관 발행의 `ERR_UPLOAD_LIMIT` 가 기준 판 `REVISION_CONFLICT` 보다 먼저 난다.
- **U10 `@Optional()`**: Nest 의 `@Optional()` 주입은 모듈이 없으면 null 이 아니라 undefined 다. 모듈을 등록했는데 조용히 첨부를 건너뛰지 않게 `uploads.module.test` 가 약관 서비스에 주입됐음을 단언한다.
- **§9-2 경합**: 같은 사람의 두 발행이 같은 키를 쓰면 둘 다 성공한다(U8 ② · 가드 행이 직렬화). 새 경합 테스트는 더하지 않았다 — 가드 행과 기존 약관 경합 테스트가 덮는다. 정리 잡의 `markExpiredUploads` 와 발행이 미첨부 키 둘을 반대 순서로 잠그는 교착은 이론상 가능하나 1213 → 409(다시 시도)로 끝난다.
- **U11 정리 잡**: 한 틱 최대 `SWEEP_MAX_BATCHES`(10)묶음 · `intervalMinutes` 는 35,791 이하(Node 타이머 상한 2^31-1 ms — 넘으면 1 ms 로 떨어진다) · 겹침 방지 플래그 · 타이머는 `onModuleDestroy` 에서도 멈춘다(코어 모듈을 먼저 import 하면 풀보다 먼저). 객체 삭제에 실패한 행이 100개 이상 쌓이면 뒤 행이 밀리는 것은 받아들였다(회차 사이 상태 없음 — 저장소가 돌아오면 따라잡는다).
- **U2 끊긴 연결**: 본문을 다 받기 전의 스트림 error · 조기 close 는 400 `ERR_COMMON_BAD_REQUEST` + `UPLOAD_MESSAGES.aborted` — 흔들리는 연결이 5xx 로그 소음이 되지 않게.
- **U3 미등록 용도 방어**: `create` 는 등록되지 않은 용도를 400 검증 오류로 거부한다 — 가드 뒤의 방어(서비스를 직접 부르는 앱 코드용).
- **S5 재인코딩 문**: `EncodeGate` 는 `useFactory` 로 앱마다 하나다(`useValue` 면 프로세스의 모든 앱이 나눈다) — 프로세스당 앱이 하나면 같다.
- **S4 색역**: 메타데이터를 싣지 않으므로 광색역(ICC) 이미지는 sRGB 로 변환된 뒤 프로파일이 빠진다 — 색역 손실은 의도다.
- **§4-1 더한 것**: admin-shared `LEGAL_UPLOAD_PURPOSE = 'legal'`(서버 자동 등록 · admin-ui `?purpose=` 공용) · admin-server `UPLOAD_MESSAGES.aborted`.
- **§7 sharp 로드**: `.` 진입점이 import 때 `sharp` 를 싣는다 — 필수 peer 라 업로드를 안 쓰는 앱도 설치한다. `./runner` 는 싣지 않는다(`s3-isolation.test.ts`).
- **중계 모듈 주입**: 중계 컨트롤러의 `AdminUploadsService` 주입은 `@Optional()` — 업로드 모듈 없이 `AdminMediaModule` 만 올리면 Nest DI 오류 대신 `onModuleInit` 이 안내 문구로 기동을 멈춘다.
- **§9-1 HTTP 계약 층**: 업로드 · 중계의 HTTP 계약은 DB 없는 프로브가 아니라 `*.http.db.test.ts` 다(인증 가드가 DB 를 읽는다). 재인코딩 테스트는 실 sharp 로 돈다.
