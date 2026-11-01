---
'@ssworks/admin-shared': minor
'@ssworks/admin-server': minor
---

편집기 이미지 업로드 서버(PR 2h — `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md`). 편집기가 올린 그림을 WebP 로 다시 만들어 저장소(파일 시스템 · S3 호환)에 두고, 본문을 저장하는 쓰기가 같은 트랜잭션에서 문서에 첨부하며, 첨부된 그림만 공개 중계한다. admin-ui 쪽(그림 넣기)은 PR #3k 다.

- admin-shared: 업로드 계약 `uploads.ts` — 키 · 용도 패턴(`UPLOAD_KEY_PATTERN` · `UPLOAD_PURPOSE_PATTERN` · `isUploadKey` · `uploadPurposeOf` · `uploadUrl`) · `LEGAL_UPLOAD_PURPOSE` · `DEFAULT_MEDIA_PATH` · 정책(`UploadPolicy` · `DEFAULT_UPLOAD_POLICY`) · `collectUploadKeys`(렌더 출력의 `<img src>` 에서 키를 모은다 — 서버 첨부 · 클라이언트 남은 칸이 같은 함수) · 스키마(`uploadPurposeQuerySchema` · `adminUploadCreatedSchema`). 코어 오류 코드 `ERR_UPLOAD_*` 여섯(415 · 413 · 400 · 409 · 404 · 503), 코어 감사 액션 `upload.create` · `upload.delete` 와 대상 `upload`.
- admin-server: `AdminUploadsModule`(`POST /admin/uploads?purpose=` 원시 이미지 바이트 · `DELETE /admin/uploads/:purpose/:yyyy/:mm/:file` · sharp 재인코딩 · 정리 잡) · `AdminMediaModule`(`GET /media/:purpose/:yyyy/:mm/:file` — 첨부된 것만 · ETag · `@Public`) · 코어 옵션 `uploads`(`storage` · `mediaPath` · `purposes` · `policy` · `sweep`) · 저장소 `AdminObjectStorage` · `createFileSystemStorage` · 서브패스 `@ssworks/admin-server/storage/s3`(`createS3ObjectStorage`) · 장 `0013_admin_uploads`(표 `admin_uploads`) · `@RequireUploadPurpose()` · `attachUploads` · `syncUploads`(엄격 — 같은 refType 과 refId) · `AttachUploadsInput.keys` · `AdminUploadsService.collectKeys` · `attach` · `sync` · `sweep`. 약관 발행이 본문 속 그림을 새 판에 첨부한다(감사 meta `attachedUploads`).
- peer: admin-server 의 `@ssworks/admin-shared` 하한 `>=0.10.0`, 새 필수 peer `sharp@^0.35`, 선택 peer `@aws-sdk/client-s3@^3`.

**쓰는 쪽이 할 일:**

1. `pnpm add sharp@^0.35` — 필수 peer다(`.` 진입점이 import 때 싣는다 — 업로드를 안 쓰는 앱도). 네이티브 모듈이라 배포 이미지에서 설치한다. S3 호환 저장소를 쓰면 `pnpm add @aws-sdk/client-s3@^3`.
2. 업로드를 쓰면 `AdminServerModule` 옵션에 `uploads: { storage: createFileSystemStorage({ root }) /* 또는 createS3ObjectStorage(...) */, purposes: { … } }`.
3. 마이그레이션 폴더에 스텁 `export { up, down } from '@ssworks/admin-server/migrations/0013_admin_uploads'` — 모든 장 필수라 업로드를 안 써도 더한다.
4. `AppModule` 에 `AdminUploadsModule` · `AdminMediaModule` 을 import 한다 — 🔴 `AdminServerModule.forRootAsync(...)` 를 먼저(종료 때 정리 타이머가 DB 풀보다 먼저 멈춘다).
5. 앱 전역 접두사가 `api` 가 아니면 `uploads.mediaPath` 를 `'/<접두사>/media'` 로(앞 `/` 필수).
6. 🔴 코어 유니온이 넓어진다 — `Record<CommonErrorCode, …>` · `Record<CoreAuditAction, …>` · `Record<CoreAuditTarget, …>` 를 자기 표로 둔 앱은 새 키(`ERR_UPLOAD_*` 여섯 · `upload.create` · `upload.delete` · `upload`)를 채운다.
7. 약관만 쓰는 앱은 발행 감사 meta 에 `attachedUploads: 0` 이 더 실리는 것뿐이다.

README 「이미지 업로드」(배선 · 라우트 · 첨부 · 정리 잡 · 재인코딩 · 저장소).
