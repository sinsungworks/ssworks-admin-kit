# @ssworks/admin-server

## 0.14.0

## 0.13.0

### Minor Changes

- 4d46f29: DB 풀이 JSON 컬럼을 원문 글자로 받는다 — `adminPoolConfig` 에 `autoJsonMap: false`(드라이버 기본 true — MariaDB 는 JSON 을 LONGTEXT + 확장 메타데이터 `json` 으로 보내므로 이 옵션 하나가 가른다). 드라이버 기본값은 JSON 컬럼을 표준 `JSON.parse` 로 풀어 세 가지가 깨졌다(MariaDB 12.3.3 · 11.4 실측 — Pingly P0-3 검토).

  - 최상위 JSON 문자열(`'"reject"'`)이 JS 문자열 `reject` 로 와 원문과 구분되지 않는다 — `readJsonColumn` 이 다시 파싱하다 `SyntaxError` 를 던지고, `'"123"'` 은 숫자 `123` 이 된다.
  - 쿼리 모양마다 갈린다 — 열 그대로 · 파생 테이블 · `JSON_EXTRACT` 는 파싱된 값, `COALESCE` 로 감싸면 글자.
  - 쓰는 쪽 BigInt 코덱(`parseJSON`)을 끼울 자리가 없다 — 값 안의 `"BigInt(n)"` 이 문자열로 남아 zod `z.bigint()` 가 실패한다.

  이제 쿼리 모양 · 값 모양과 상관없이 늘 글자다. `readJsonColumn` 은 그대로 맞게 동작한다(글자면 `JSON.parse`).

  **쓰는 쪽이 할 일:**

  1. JSON 컬럼을 `readJsonColumn` 없이 객체로 쓰던 곳은 글자를 받는다 — `readJsonColumn` + zod 로 읽는다. 값에 bigint(`"BigInt(n)"`)가 들어 있으면 글자를 admin-shared `parseJSON` 에 넘긴다.
  2. Kysely `jsonArrayFrom` · `jsonObjectFrom`(MySQL 도우미)이나 `JSON_OBJECT` · `JSON_ARRAYAGG` 결과도 글자다 — 같은 방법으로 읽는다.
  3. `JSON_EXTRACT` 결과는 따옴표가 붙은 JSON 글자다(`'"active"'`). 스칼라 하나가 필요하면 `JSON_VALUE` · `JSON_UNQUOTE` 를 쓰거나 글자를 파싱한다.
  4. `adminPoolConfig` 를 거치지 않고 만든 풀(직접 `createPool`)은 드라이버 기본값 그대로다 — 앱 · 러너 · 시드 · 테스트 모두 `adminPoolConfig` 로 만든다.

## 0.12.0

## 0.11.0

### Minor Changes

- 7f3c2f8: 편집기 이미지 업로드 서버(PR 2h — `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md`). 편집기가 올린 그림을 WebP 로 다시 만들어 저장소(파일 시스템 · S3 호환)에 두고, 본문을 저장하는 쓰기가 같은 트랜잭션에서 문서에 첨부하며, 첨부된 그림만 공개 중계한다. admin-ui 쪽(그림 넣기)은 PR #3k 다.

  - admin-shared: 업로드 계약 `uploads.ts` — 키 · 용도 패턴(`UPLOAD_KEY_PATTERN` · `UPLOAD_PURPOSE_PATTERN` · `isUploadKey` · `uploadPurposeOf` · `uploadUrl`) · `LEGAL_UPLOAD_PURPOSE` · `DEFAULT_MEDIA_PATH` · 정책(`UploadPolicy` · `DEFAULT_UPLOAD_POLICY`) · `collectUploadKeys`(렌더 출력의 `<img src>` 에서 키를 모은다 — 서버 첨부 · 클라이언트 남은 칸이 같은 함수) · 스키마(`uploadPurposeQuerySchema` · `adminUploadCreatedSchema`). 코어 오류 코드 `ERR_UPLOAD_*` 여섯(415 · 413 · 400 · 409 · 404 · 503), 코어 감사 액션 `upload.create` · `upload.delete` 와 대상 `upload`.
  - admin-server: `AdminUploadsModule`(`POST /admin/uploads?purpose=` 원시 이미지 바이트 · `DELETE /admin/uploads/:purpose/:yyyy/:mm/:file` · sharp 재인코딩 · 정리 잡) · `AdminMediaModule`(`GET /media/:purpose/:yyyy/:mm/:file` — 첨부된 것만 · ETag · `@Public`) · 코어 옵션 `uploads`(`storage` · `mediaPath` · `purposes` · `policy` · `sweep`) · 저장소 `AdminObjectStorage` · `createFileSystemStorage` · 서브패스 `@ssworks/admin-server/storage/s3`(`createS3ObjectStorage`) · 장 `0013_admin_uploads`(표 `admin_uploads`) · `@RequireUploadPurpose()` · `attachUploads` · `syncUploads`(엄격 — 같은 refType 과 refId) · `AttachUploadsInput.keys` · `AdminUploadsService.collectKeys` · `attach` · `sync` · `sweep`. 약관 발행이 본문 속 그림을 새 판에 첨부한다(감사 meta `attachedUploads`).
  - peer: admin-server 의 `@ssworks/admin-shared` 하한 `>=0.11.0`, 새 필수 peer `sharp@^0.35`, 선택 peer `@aws-sdk/client-s3@^3`.

  **쓰는 쪽이 할 일:**

  1. `pnpm add sharp@^0.35` — 필수 peer다(`.` 진입점이 import 때 싣는다 — 업로드를 안 쓰는 앱도). 네이티브 모듈이라 배포 이미지에서 설치한다. S3 호환 저장소를 쓰면 `pnpm add @aws-sdk/client-s3@^3`.
  2. 업로드를 쓰면 `AdminServerModule` 옵션에 `uploads: { storage: createFileSystemStorage({ root }) /* 또는 createS3ObjectStorage(...) */, purposes: { … } }`.
  3. 마이그레이션 폴더에 스텁 `export { up, down } from '@ssworks/admin-server/migrations/0013_admin_uploads'` — 모든 장 필수라 업로드를 안 써도 더한다.
  4. `AppModule` 에 `AdminUploadsModule` · `AdminMediaModule` 을 import 한다 — 🔴 `AdminServerModule.forRootAsync(...)` 를 먼저(종료 때 정리 타이머가 DB 풀보다 먼저 멈춘다).
  5. 앱 전역 접두사가 `api` 가 아니면 `uploads.mediaPath` 를 `'/<접두사>/media'` 로(앞 `/` 필수).
  6. 🔴 코어 유니온이 넓어진다 — `Record<CommonErrorCode, …>` · `Record<CoreAuditAction, …>` · `Record<CoreAuditTarget, …>` 를 자기 표로 둔 앱은 새 키(`ERR_UPLOAD_*` 여섯 · `upload.create` · `upload.delete` · `upload`)를 채운다.
  7. 약관만 쓰는 앱은 발행 감사 meta 에 `attachedUploads: 0` 이 더 실리는 것뿐이다.
  8. 앱 문서(공지 · 게시글)에 그림을 붙이면 만들기 · 고치기 · 지우기(빈 본문) 모두 `uploads.sync(...)` 다 — `attach` 는 append-only 문서만 쓴다(한 종류에 섞으면 다른 문서가 빌려 쓴 그림이 지움 표시된다).

  README 「이미지 업로드」(배선 · 라우트 · 첨부 · 정리 잡 · 재인코딩 · 저장소).

## 0.10.0

## 0.9.0

### Minor Changes

- 68c4343: ringside 둘째 보고 반영(PR 2g — `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md`).

  - admin-shared: `definePermissions(…, { fullAccessOnly })` · 카탈로그 `fullAccessOnly` — 전체 권한(`'*'`) 역할만 가질 수 있는 키. 표시 없는 키가 표시된 키를 함의하면 정의할 때 던진다.
  - admin-server:
    - 역할 만들기 · 권한 수정에 전권 전용 키가 있고 `'*'` 가 아니면 400 `ERR_COMMON_VALIDATION`(`issues[{ path: ['permissions'] }]`). 이름 · 기본 표시만 고치는 수정 · 사용자 배정은 보지 않는다 — 업그레이드 전에 그 키를 받은 역할은 효력이 그대로다(README 「역할 · 권한」 정리 절차).
    - 🔴 IP 접근 제어(`AdminIpAccessModule`)를 켠 앱은 카탈로그에 `fullAccessOnly: [<ipAccess.manage 키>]` 를 더해야 `AdminRolesModule` 이 기동한다. 그 키를 다른 슬롯이나 앱 기능의 권한으로도 쓰고 있었다면 그것까지 전권 전용이 된다 — IP 관리 전용 키로 나눈다.
    - 🔴 peer `@ssworks/admin-shared` 하한 0.9.0(`>=0.9.0 <1.0.0`) — 카탈로그 모양 검사가 `fullAccessOnly` 를 요구한다.
    - `AdminServerModule` 옵션 `messages` — 서버 오류 문구를 키별로 덮는다(키는 `ADMIN_SERVER_DEFAULT_MESSAGES`, 타입 `AdminServerMessages`). 같은 기본 글자는 함께 바뀌고, 오타 · 같은 글자를 다르게 덮기는 기동에서 멈춘다. 5xx 고정 문구 · 로그 · 감사는 그대로.
  - admin-ui: `useRoleEditor({ fullAccessOnly })` — 표시된 칸은 꺼져 있으면 켤 수 없다(켜진 기존 역할은 끌 수 있다). 보통 `catalog.fullAccessOnly` 를 넘긴다.

## 0.8.0

## 0.7.0

## 0.6.0

## 0.5.0

### Patch Changes

- e0ed863: **쓰는 쪽이 할 일:** admin-ui 를 쓰는 앱은 `pnpm add pinia@^4 @vue/devtools-api@^8` — admin-ui 의 peer `pinia` 가 `^4.0.0` 이 됐다(Pinia 3 은 더 받지 않는다). `@vue/devtools-api` 는 Pinia 4 의 필수 peer 다(admin-ui 는 import 하지 않아 peer 로 두지 않는다). admin-shared · admin-server 만 쓰는 앱은 할 일 없음.

  admin-ui: peer `pinia ^4.0.0`. 코드는 바뀌지 않았다 — Pinia 4 의 변경은 ESM 전용 · devtools-api 8 뿐이다(4.1.0 에서 시험).

  세 패키지: 셋 모두 TypeScript 6.0.3 으로 빌드한 dist · d.ts. 동작 변경 없음 — 발행물 차이는 표기뿐이다(admin-ui d.ts 7곳의 유니온 순서 · 슬롯 임시 이름 · `PermissionCheck<string>` 기본값 펼침과 번들 제어 흐름 표기, admin-server 주석 한 줄이고 admin-shared 는 같다). export · 타입 · 런타임 동작은 같다. 저장소 도구는 TypeScript 6.0.3 · Vitest 5 · ESLint 10 · typescript-eslint 8.71 이고, 실 DB 테스트는 MariaDB 11.4 · 12.3 두 버전에서 돈다.

## 0.4.1

## 0.4.0

### Minor Changes

- 6fc9c4b: **쓰는 쪽이 할 일:** 없음(새 DB). 장 `0001_roles` 를 이미 돌린 개발 DB 는 역할 인덱스 둘이 없어도 2d-2 와 같이 돈다 — 맞추려면 `CREATE INDEX idx_roles_display_order ON roles (display_order)` · `CREATE INDEX idx_roles_is_default ON roles (is_default)`. 본인 재입사 `POST /users/:userNo/rehire` 는 이제 403 `ERR_COMMON_FORBIDDEN` 이다.

  admin-server 계정 정리(Phase 2 PR 2d-3): 전권자 잔존 쓰기(역할 권한 수정 · 삭제 · 사용자 역할 변경 · 퇴사)가 대상 · 줄 역할 · 팀 · 다른 기본 역할을 잠근 뒤에 전권자 수를 센다 — 감사 before · 응답 item 이 낡지 않고, MariaDB 11.6.2+ 의 스냅샷 격리에서 대상 로그인 · 팀 이름 바꾸기 · 역할 이동과 겹쳐도 409 가 나지 않는다. 역할 표에 순서 · 기본 표시 인덱스를 더해 역할 만들기 · 이동 · 기본 켜기가 그 행만 잠근다 — 다만 동시에 만드는 둘, 또는 만들기가 순서 맨 끝 역할의 삭제 · 이동 · 기본 켜기와 겹치면 드물게 409(다시 시도)다. 퇴사 예정인 본인의 자기 재입사를 403 으로 막는다. `timeZone` 옵션은 Intl(ICU) 가 내는 이름으로 바꿔 쓴다(`'asia/seoul'` → `'Asia/Seoul'` — 대개 정규 이름, 일부는 옛 이름이며 ICU 판에 따라 다르다). 초기화 · 즉시 퇴사의 끊은 세션 수는 살아 있던 세션만 센다. 아직 `private` 이라 npm 에 나가지 않는다.

- c4463e3: **쓰는 쪽이 할 일:** `AdminAuthModule.withRepository` 로 리포지토리를 바꿨다면 `updateLoginState` 를 지우고 `lockCredential(trx, userNo, 'share' | 'update')`(받은 트랜잭션 위의 잠금 읽기 — 🔴 `'share'` 는 `LOCK IN SHARE MODE`, MariaDB 는 `FOR SHARE` 를 받지 않는다 · 잠그는 행은 `sessions.user_no` FK 가 가리키는 그 `users` 행) · `writeLoginState(trx, userNo, state)`(잠금 두 컬럼만)를 구현한다. 카운터의 원자성은 이제 패키지가 맡는다. 두 원시 모두 받은 `trx` 위에서만 쓰고, `lockCredential` 의 `passwordHash` 는 `findCredentialByUserId` 와 같은 값이어야 한다. `AdminReauthService`(공개 export)는 이제 `KYSELY` 도 주입받는다 — 손으로 만드는 코드는 Kysely 를 세 번째 인자로 넘긴다. 직접 만든 `ADMIN_ACCESS_POLICY` 는 이제 있는 계정의 로그인 시도마다 비밀번호 확인 앞에서 불린다(매 요청 · refresh 에서는 그대로 불린다). 로그인 화면은 IP 로 막힌 로그인에서 `IpBlockedDialog` 대신 로그인 실패 문구를 보인다.

  admin-server 인증 경로(Phase 2 PR 2f-2a): 로그인은 IP(정책이 있을 때) → 비밀번호 → 확정 트랜잭션(잠근 사용자 행으로 잠김 · 퇴사 판정 → 카운터 되돌림 → 세션). 막힌 주소의 로그인은 403 `ERR_IP_NOT_ALLOWED` 대신 비밀번호를 보지 않고 401 `ERR_LOGIN_FAILED`(감사 행도 401 — 액션 `auth.login.blocked.ip` 그대로)이고, 막힌 주소의 틀린 비밀번호는 세지 않는다. 잠김 · 퇴사로 막힌 맞은 비밀번호는 카운터를 되돌리지 않는다. IP 정책이 있으면 로그인 401 문구가 모두 "… 허용되지 않은 접속 위치입니다." 다. 검증과 확정 사이에 초기화 · 즉시 퇴사가 커밋되면 세션을 남기지 않는다(401 · 403). 토큰 회전 · 유예 발급은 사용자 행을 공유 잠금으로 먼저 잡아 즉시 퇴사 · 비밀번호 초기화 · 본인 비밀번호 변경과 교착하지 않고, IP 를 퇴사보다 먼저 본다(퇴사했고 막힌 주소면 403 IP). 회전이 초기화 · 퇴사 · 로그아웃에 지면 401 문구가 "세션이 종료되었습니다" 다. IP 정책의 진단 경고 둘(주소 없음 · global 규칙 없음). 아직 `private` 이라 npm 에 나가지 않는다.

- 2a03132: **쓰는 쪽이 할 일:** `AdminServerModule.forRootAsync` 의 `useFactory` 에 `auth: { jwtSecret }`(32자 이상 — 보통 `ADMIN_JWT_SECRET`)과 선택 `passwordPolicy` 를 더하고 `AdminAuthModule` 을 import 한다. `AdminAuthModule` 은 전역이다 — AppModule 에서 한 번만 import 한다(두 번이면 기동에서 멈춘다). 🔴 인증 · 권한 가드가 **앱 전역**이다 — 관리자가 아닌 컨트롤러(회원 · 공개 · 헬스체크 · 웹훅)에 `@Public()` 을 붙인다(안 붙이면 401). 관리자 라우트는 `@RequirePermissions` · `@RequireAnyPermissions` · `@SelfOnly` 중 하나를 선언한다(없으면 403). `users.resignAt` 은 퇴사 **효력 시각**으로 쓴다.

  admin-server 인증(Phase 2 PR 2b): `AdminAuthModule`(+`withRepository`) — `/admin/auth/{login,refresh,logout,me,password}`, argon2id 비밀번호, JWT 액세스(HS256 · 15분) + sha256 저장 refresh 회전(7일), 재사용 탐지(30초 유예창), 계정 잠금(5회 · 15분, 로그인 · 변경 · 재인증이 원자적으로 공용, 잠긴 동안의 로그인은 같은 401), 퇴사 · 강제 변경, fail-closed 권한 가드와 데코레이터(`@Public` · `@SelfOnly` · `@RequirePermissions` · `@RequireAnyPermissions` · `@CurrentAdmin`), `AdminReauthService`, `AUTH_REPOSITORY` · `KyselyAuthRepository`, 선택 주입 `ADMIN_ACCESS_POLICY` · `ADMIN_AUTH_EVENTS`. 러너 진입점에 `hashPassword` · `verifyPassword`. 새 dependencies `@nestjs/jwt` · `@node-rs/argon2`. 아직 `private` 이라 npm 에 나가지 않는다.

- a2c82fb: **쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0012_ip_access_rules` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0012_ip_access_rules'` — 🔴 모든 장 필수, global 허용 두 행이 시드된다). IP 접근 제어를 쓰면 `permissions` 에 슬롯 `'ipAccess.read'` · `'ipAccess.manage'` 를 잇고 `AdminIpAccessModule` 을 import 한다(역할 · 사용자 모듈을 쓰면 두 키도 `permissionCatalog` 안이어야 한다). 엣지 프록시가 `X-Real-IP` 를 덮어쓰면 코어 옵션 `clientIp: 'x-real-ip'`(아니면 `app.set('trust proxy', …)` 로 `req.ip` 를 맞춘다). 세션 · 감사의 IP 는 이제 정규화 값이다(`::ffff:127.0.0.1` → `127.0.0.1`). 사용자 수정의 `teamNo` 변경이 마지막 전권자에서 409 일 수 있고, IP 규칙이 가리키는 팀의 삭제는 409 `ERR_TEAM_HAS_IP_RULES` 다. refresh 가 막힌 주소에서 403 `ERR_IP_NOT_ALLOWED` 다. 쓰는 쪽 감사 카탈로그가 `setting.ipAccess.*` · `ipAccessRule`(또는 키 `IP_ACCESS_*` · `IP_ACCESS_RULE`)을 이미 정의했다면 겹침 검사가 던진다.

  admin-server IP 접근 제어(Phase 2 PR 2f-1): `AdminIpAccessModule` — `/admin/ip-access` 다섯 라우트(목록 · 미리보기 · 만들기 201 `{ item }` · 수정 `{ item }` · 삭제 `{}`). 평가는 사용자 > 팀 > 전체 중 가장 가까운 층 하나 · 기본 거부 · IPv4 · IPv6, 로그인 · 매 요청 · refresh 가 막힌 주소에 403. 요청자 자신을 막는 변경은 409 `ERR_COMMON_CONFLICT` + `clientIp`, 마지막 도달 가능 전권자를 없애는 변경은 409. 전권자 잔존 셈은 IP 모듈이 있으면 적용 층이 global 인 사람만 센다. 코어 옵션 `clientIp`(`'req.ip'` 기본 · `'x-real-ip'`). 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: IP 파서 · 평가(`normalizeIp` · `isValidIp` · `parseCidr` · `isValidCidr` · `ipInCidr` · `applicableIpLayer` · `evaluateIpAccess` · `ipScopeProblem`), 규칙 · 미리보기 스키마(`ipCidrSchema` · `adminIpRule*Schema` · `adminIpPreview*Schema`), 코어 감사 액션 `setting.ipAccess.create` · `update` · `delete`("IP 규칙 추가 · 수정 · 삭제") · 대상 `ipAccessRule`("IP 규칙"), 오류 코드 `ERR_TEAM_HAS_IP_RULES`(409).

- 2c611d0: **쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0011_legal_documents` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0011_legal_documents'` — 모든 장 필수, 이미 돌린 DB 는 `kysely migrate` 한 번). 약관 모듈을 쓰면 `AdminServerModule` 옵션에 `legal: { kinds: ['TERMS', 'PRIVACY'] }`(쓰는 쪽 종류 카탈로그)와 `permissions` 의 슬롯 `'legal.read'` · `'legal.publish'` 를 잇고 `AdminLegalModule` 을 import 한다. 한글 1,000,000자 본문을 받으려면 `configureAdminApp(app, { jsonLimit: '4mb' })`.

  admin-server 약관(Phase 2 PR 2e-2): `AdminLegalModule` — `/admin/legal-documents` 네 라우트(현재본 `{ item | null }` · 이력 최신순 전량(본문 없음) · 단건 · 발행 201 `{ legalDocNo, contentHash }`). 기준 판이 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`, 시행본과 같은 본문이면 409 `ERR_COMMON_CONFLICT`. 해시는 서버가 sha256 으로 셈하고 표는 append-only 다. 발행은 `guard_locks` 행 `legalPublish` 로 직렬화된다. 종류 옵션이 없거나 형식 밖이면 기동에서 멈춘다. 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: 코어 감사 액션 `setting.legal.publish`("약관 발행")와 대상 `legalDocument`("약관"). 쓰는 쪽 감사 카탈로그(`defineAuditCatalog`)가 같은 값(`setting.legal.publish` · `legalDocument`)이나 키(`LEGAL_PUBLISH` · `LEGAL_DOCUMENT`)를 이미 정의했다면 겹침 검사로 던지므로 지운다.

- c37879f: **쓰는 쪽이 할 일:** 없음. admin-server 는 이제 `@ssworks/admin-shared` `>=0.4.0 <1.0.0` 을 peer 로 요구한다(첫 발행 때 같은 번호끼리 설치한다). DB 를 TLS 로 붙이려면 `DB_SSL=true` 나 `DB_SSL_CA`, 유닉스 소켓이면 `DB_SOCKET_PATH`(선택 — README "DB TLS · 소켓").

  admin-server 첫 발행 준비(Phase 2 PR 2f-2b): `AdminDbConnection` 에 TLS(`ssl` — mariadb 드라이버 옵션 그대로) · 유닉스 소켓(`socketPath`), `host` 는 선택(`host` 와 `socketPath` 중 하나만 — 아니면 기동 실패, 소켓은 `port` · `ssl` 과 함께 쓰지 않는다). `adminDbConnectionFromEnv` 가 `DB_SSL=true`(Node 기본 CA 묶음 · MariaDB 11.4.1+ 자체 서명은 드라이버 지문 검증) · `DB_SSL_CA`(PEM 파일 — 그 CA 로 체인 · 호스트 이름 검증) · `DB_SOCKET_PATH` 를 읽는다. 빠진 env 문구가 `DB_HOST(또는 DB_SOCKET_PATH)` 를 말한다. 검증 끄기 · 호스트 이름 생략 · 클라이언트 인증서는 코드로(README). 앱과 마이그레이션 러너가 같은 풀 옵션을 쓴다. 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: `skipLibCheck: false` 에서 `dist/pagination.d.ts` 의 TS2536 3건(`createQuerySchema`)을 없앴다 — 추론 결과는 같다. IP 파서: `::ffff:` 는 점 표기 IPv4 앞에서만 떼고(`::ffff:1::/120` 거부 · `::ffff:1:2:3:4:5:6` 받음), 내장 IPv4 는 마지막 그룹에만(`1.2.3.4::` 거부), `::1` 접기는 `/128` 에만(`::1/64` 는 IPv6 망 `::/64` · `::1/120` 은 더 이상 127.0.0.0/24 가 아니다), v4-mapped 영역은 `::ffff:a.b.c.d` 꼴만 받는다(`::ffff:7f00:1` · `0:0:0:0:0:ffff:1.2.3.4` 거부).

- 91a0374: **쓰는 쪽이 할 일:** 마이그레이션 폴더에 스텁 한 줄을 더한다 — `export { up, down } from '@ssworks/admin-server/migrations/0009_guard_locks'`(🔴 모든 장이 필수다). 역할 모듈을 쓰면 `AdminServerModule` 옵션에 `permissionCatalog`(admin-shared `definePermissions()` 결과 — 함의 표는 `{ implies }`)와 슬롯 `'roles.read'` · `'roles.manage'` 를 더하고 `AdminRolesModule` 을 import 한다. 슬롯 맵의 키는 카탈로그 안이어야 한다(기동에서 멈춘다). `@Audit` 인자 타입 이름이 `AuditOptions` → `AuditDeclaration` 으로 바뀌었다. 남의 세션 끊기(`DELETE /sessions/:sessionNo` · `/sessions/user/:userNo`)는 이제 그 사람의 역할 권한을 덮어야 한다(아니면 403).

  admin-server 역할 · 판정(Phase 2 PR 2d-1): `AdminRolesModule` — `/admin/roles` 다섯 라우트(전량 목록 · 만들기 `{ roleNo }` · 수정 `{ item }` · 이동 · 삭제, revision 409 · 이동은 revision 없음 · 기본 역할 하나 · 이름 중복은 `roleName` 필드 오류 · 쓰는 중 409). 권한 정규화(`'*'` 접기 · 함의 · 카탈로그 순서), 지배 판정(403 `details.outside`), 전권자 잔존(장 `0009_guard_locks` 센티넬 · 409), 선택 재인증(`reauth`). MariaDB 11.6.2+ 의 `ER_CHECKREAD`(1020)는 이제 409 `ERR_COMMON_CONFLICT` 다시 시도로 매핑된다. 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: `definePermissions(catalog, { implies })` — 카탈로그의 `implies`(검증된 함의 표 · admin-ui `useRoleEditor({ implies })` 에 그대로) · `normalize(list)`. 코어 감사 액션에 역할 넷(`org.role.create` · `update` · `delete` · `move`)과 대상 `role`.

- bc6de50: **쓰는 쪽이 할 일:** 마이그레이션 폴더에 스텁 한 줄을 더한다 — `export { up, down } from '@ssworks/admin-server/migrations/0008_audit_logs'`(🔴 모든 장이 필수다 — 빠지면 `assertAdminMigrationStubs` 가 멈춘다). `AdminServerModule` 옵션에 `permissions: { 'sessions.read', 'sessions.manage', 'auditLogs.read' }`(프로젝트 권한 키)와 선택 `audit: { catalog, secretKeys }` 를 더하고 `AdminAuditModule` · `AdminSessionsModule` 을 import 한다. 프로젝트 감사 액션은 admin-shared `defineAuditCatalog` 로 정의한다 — 카탈로그 밖 액션을 단 `@Audit` 은 기동에서 멈춘다.

  admin-server 세션 · 감사(Phase 2 PR 2c): `AdminSessionsModule` — `/admin/sessions` 6라우트(전체 목록 · 내 세션 · 하나 끝내기 · 사용자 전체 · 내 세션 하나 · 다른 세션 모두, 지금 세션 400 · 남의 세션 404 · `{ revokedCount }`). `AdminAuditModule` — `@Audit` · 전역 감사 인터셉터(성공 · 실패, 응답 전에 기다림, 실패는 경고) · `attachAuditTarget` · `attachAuditMeta` · `attachAuditDiff` · 비밀 키 소독 · 인증 이벤트 기록(`ADMIN_AUTH_EVENTS`) · `GET /admin/audit-logs`. 권한 슬롯(`AdminServerOptions.permissions` · `AdminPermissionSlot`), 감사 장 `0008_audit_logs`, LIKE 도우미 `escapeLike` · `likeContains` · `likePrefix`. 예외 필터의 판정을 꺼냈다(동작 같음). 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: 감사 카탈로그(`CoreAuditActions` · `CoreAuditTargets` · 한국어 라벨 · `defineAuditCatalog` · `coreAuditCatalog`), 감사 행 · 조회 스키마(`adminAuditLogSchema` · `adminAuditLogQuerySchema`), 쿼리스트링 bigint 스키마 `queryBigIntSchema`.

- 6688f49: **쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0010_team_tree_lock` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0010_team_tree_lock'` — 모든 장 필수, 이미 돌린 DB 는 `kysely migrate` 한 번). 팀 모듈을 쓰면 `AdminServerModule` 옵션의 `permissions` 에 슬롯 `'teams.read'` · `'teams.manage'` 를 잇고 `AdminTeamsModule` 을 import 한다.

  admin-server 팀(Phase 2 PR 2e-1): `AdminTeamsModule` — `/admin/teams` 다섯 라우트(트리 — 루트 여럿 · `teams.read` ∨ `users.read`, 만들기 201 `{ teamNo }`, 이름 바꾸기, 이동 — 기준 형제 번호 `{ parentTeamNo, beforeTeamNo }` · 서버가 받는 형제 묶음을 다시 매김, 삭제 — 하위 팀째). 순환 이동 400 `ERR_TEAM_MOVE_CYCLE`, 소속 있는 삭제 409 `ERR_TEAM_HAS_MEMBERS` + `memberCount`, 이름 중복 409 `ERR_DUPLICATE_TEAM_NAME`. 팀 쓰기는 `guard_locks` 행 `teamTree` 로 직렬화된다. 사용자 수정이 같은 팀으로 다시 저장하면 소속을 건드리지 않는다(배정 시각 유지). 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: 오류 코드 `ERR_TEAM_HAS_MEMBERS`(409) · `ERR_TEAM_MOVE_CYCLE`(400), 코어 감사 액션에 팀 넷(`org.team.create` · `update` · `delete` · `move`)과 대상 `team`.

- 504dfa2: **쓰는 쪽이 할 일:** 사용자 모듈을 쓰면 `AdminServerModule` 옵션의 `permissions` 에 슬롯 `'users.read'` · `'users.manage'` 를 잇고 `AdminUsersModule` 을 import 한다(`permissionCatalog` 필수, 선택 `timeZone` — 기본 `'Asia/Seoul'`). 🔴 장 `0002_users` 를 고쳤다(`users.updateAt` 의 `ON UPDATE CURRENT_TIMESTAMP` 를 뺐다) — 이미 장을 돌린 개발 DB 는 다시 만든다. `GET /roles` 는 이제 `users.read` 로도 읽힌다. admin-shared 역할 이름(`roleNameSchema`)이 앞뒤 공백을 뗀다.

  admin-server 사용자 · 계정(Phase 2 PR 2d-2): `AdminUsersModule` — `/admin/users` 열 라우트(목록 — 팀 · 하위 팀 · 상태 · 검색어 · 대표 팀, 단건, 재직 이력, 만들기 — 서버 임시 비밀번호 `{ item, temporaryPassword }`, 수정 — revision, 퇴사 — 기준 시간대 다음 날 0시 효력 · 지난 날짜는 즉시 세션 폐기, 퇴사일 정정, 재입사, 비밀번호 초기화, 잠금 해제). 자기 계정 넷 403 · 권한 상승 403 · 전권자 잔존 409 · 활성 구간 ≤ 1. 입사 · 퇴사일은 TIMESTAMP 열이 담는 1970-01-02 ~ 2038-01-18 만 받는다(밖은 칸 오류 400 — `calendarDateSchema` 보다 좁다). 역할: 만들기 · 수정의 결과를 트랜잭션 안에서 읽고, 꺼진 기본 역할을 감사 meta `clearedDefaults` 로 남기고, 동시 만들기의 순서 값이 겹치지 않는다. 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: 사용자 계약 스키마(`adminUserSchema` · 만들기 · 수정 · 퇴사 · 퇴사일 · 재입사 본문 · 만들기 결과 · 재직 이력, `calendarDateSchema`), `queryBooleanSchema`(`'true'` · `'false'` 만), 코어 감사 액션에 사용자 일곱(`org.user.*`), `roleNameSchema` trim.

## 0.3.0

### Minor Changes

- 682ec81: **쓰는 쪽이 할 일(첫 발행 때):** peer 를 설치한다 — `pnpm add @nestjs/common@^12 @nestjs/core@^12 @nestjs/platform-express@^12 kysely@^0.29 mariadb@^3 @kim5257/kysely-mariadb-dialect@^0.2 reflect-metadata rxjs zod @ssworks/admin-shared`(Node 22 이상). `kysely-ctl@^0.21` 은 개발 의존으로 설치한다(`pnpm add -D kysely-ctl@^0.21`, 마이그레이션 러너). `main.ts` 에서 `configureAdminApp(app)` 을 `listen()` 전에 부른다(빠뜨리면 기동에서 멈춘다). `kysely.config.ts` 는 `@ssworks/admin-server/runner` 의 `createAdminKysely` · `assertAdminMigrationStubs` 를 쓰고, 마이그레이션 폴더에 코어 장 스텁 7개(`export { up, down } from '@ssworks/admin-server/migrations/0001_roles'` …)를 둔다.

  admin-server 기반(Phase 2 PR 2a): `AdminServerModule.forRoot` · `forRootAsync`(`admin/` prefix · `KYSELY`), `configureAdminApp`, 응답 봉투(`@RawResponse()`), `AdminExceptionFilter`, `ZodValidationPipe` · `ParseBigIntPipe` · `validationError`, `runQuery` · `runWriteTransaction` · `mapError` · `readJsonColumn`, `AdminDatabase` 와 코어 스키마 7장(`ADMIN_MIGRATIONS`), `loadDotEnv` · `requireEnv` · `assertUtcTimezone`. `createAdminKysely` 는 프로세스 실효 타임존이 UTC 가 아니면 풀을 만들기 전에 던진다(앱 · 러너 · 시드 공통). 아직 `private` 이라 npm 에 나가지 않는다.

## 0.2.0
