# @ssworks/admin-shared

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

- a2c82fb: **쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0012_ip_access_rules` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0012_ip_access_rules'` — 🔴 모든 장 필수, global 허용 두 행이 시드된다). IP 접근 제어를 쓰면 `permissions` 에 슬롯 `'ipAccess.read'` · `'ipAccess.manage'` 를 잇고 `AdminIpAccessModule` 을 import 한다(역할 · 사용자 모듈을 쓰면 두 키도 `permissionCatalog` 안이어야 한다). 엣지 프록시가 `X-Real-IP` 를 덮어쓰면 코어 옵션 `clientIp: 'x-real-ip'`(아니면 `app.set('trust proxy', …)` 로 `req.ip` 를 맞춘다). 세션 · 감사의 IP 는 이제 정규화 값이다(`::ffff:127.0.0.1` → `127.0.0.1`). 사용자 수정의 `teamNo` 변경이 마지막 전권자에서 409 일 수 있고, IP 규칙이 가리키는 팀의 삭제는 409 `ERR_TEAM_HAS_IP_RULES` 다. refresh 가 막힌 주소에서 403 `ERR_IP_NOT_ALLOWED` 다. 쓰는 쪽 감사 카탈로그가 `setting.ipAccess.*` · `ipAccessRule`(또는 키 `IP_ACCESS_*` · `IP_ACCESS_RULE`)을 이미 정의했다면 겹침 검사가 던진다.

  admin-server IP 접근 제어(Phase 2 PR 2f-1): `AdminIpAccessModule` — `/admin/ip-access` 다섯 라우트(목록 · 미리보기 · 만들기 201 `{ item }` · 수정 `{ item }` · 삭제 `{}`). 평가는 사용자 > 팀 > 전체 중 가장 가까운 층 하나 · 기본 거부 · IPv4 · IPv6, 로그인 · 매 요청 · refresh 가 막힌 주소에 403. 요청자 자신을 막는 변경은 409 `ERR_COMMON_CONFLICT` + `clientIp`, 마지막 도달 가능 전권자를 없애는 변경은 409. 전권자 잔존 셈은 IP 모듈이 있으면 적용 층이 global 인 사람만 센다. 코어 옵션 `clientIp`(`'req.ip'` 기본 · `'x-real-ip'`). 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: IP 파서 · 평가(`normalizeIp` · `isValidIp` · `parseCidr` · `isValidCidr` · `ipInCidr` · `applicableIpLayer` · `evaluateIpAccess` · `ipScopeProblem`), 규칙 · 미리보기 스키마(`ipCidrSchema` · `adminIpRule*Schema` · `adminIpPreview*Schema`), 코어 감사 액션 `setting.ipAccess.create` · `update` · `delete`("IP 규칙 추가 · 수정 · 삭제") · 대상 `ipAccessRule`("IP 규칙"), 오류 코드 `ERR_TEAM_HAS_IP_RULES`(409).

- 2c611d0: **쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0011_legal_documents` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0011_legal_documents'` — 모든 장 필수, 이미 돌린 DB 는 `kysely migrate` 한 번). 약관 모듈을 쓰면 `AdminServerModule` 옵션에 `legal: { kinds: ['TERMS', 'PRIVACY'] }`(쓰는 쪽 종류 카탈로그)와 `permissions` 의 슬롯 `'legal.read'` · `'legal.publish'` 를 잇고 `AdminLegalModule` 을 import 한다. 한글 1,000,000자 본문을 받으려면 `configureAdminApp(app, { jsonLimit: '4mb' })`.

  admin-server 약관(Phase 2 PR 2e-2): `AdminLegalModule` — `/admin/legal-documents` 네 라우트(현재본 `{ item | null }` · 이력 최신순 전량(본문 없음) · 단건 · 발행 201 `{ legalDocNo, contentHash }`). 기준 판이 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`, 시행본과 같은 본문이면 409 `ERR_COMMON_CONFLICT`. 해시는 서버가 sha256 으로 셈하고 표는 append-only 다. 발행은 `guard_locks` 행 `legalPublish` 로 직렬화된다. 종류 옵션이 없거나 형식 밖이면 기동에서 멈춘다. 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: 코어 감사 액션 `setting.legal.publish`("약관 발행")와 대상 `legalDocument`("약관"). 쓰는 쪽 감사 카탈로그(`defineAuditCatalog`)가 같은 값(`setting.legal.publish` · `legalDocument`)이나 키(`LEGAL_PUBLISH` · `LEGAL_DOCUMENT`)를 이미 정의했다면 겹침 검사로 던지므로 지운다.

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

### Patch Changes

- c37879f: **쓰는 쪽이 할 일:** 없음. admin-server 는 이제 `@ssworks/admin-shared` `>=0.4.0 <1.0.0` 을 peer 로 요구한다(첫 발행 때 같은 번호끼리 설치한다). DB 를 TLS 로 붙이려면 `DB_SSL=true` 나 `DB_SSL_CA`, 유닉스 소켓이면 `DB_SOCKET_PATH`(선택 — README "DB TLS · 소켓").

  admin-server 첫 발행 준비(Phase 2 PR 2f-2b): `AdminDbConnection` 에 TLS(`ssl` — mariadb 드라이버 옵션 그대로) · 유닉스 소켓(`socketPath`), `host` 는 선택(`host` 와 `socketPath` 중 하나만 — 아니면 기동 실패, 소켓은 `port` · `ssl` 과 함께 쓰지 않는다). `adminDbConnectionFromEnv` 가 `DB_SSL=true`(Node 기본 CA 묶음 · MariaDB 11.4.1+ 자체 서명은 드라이버 지문 검증) · `DB_SSL_CA`(PEM 파일 — 그 CA 로 체인 · 호스트 이름 검증) · `DB_SOCKET_PATH` 를 읽는다. 빠진 env 문구가 `DB_HOST(또는 DB_SOCKET_PATH)` 를 말한다. 검증 끄기 · 호스트 이름 생략 · 클라이언트 인증서는 코드로(README). 앱과 마이그레이션 러너가 같은 풀 옵션을 쓴다. 아직 `private` 이라 npm 에 나가지 않는다.

  admin-shared: `skipLibCheck: false` 에서 `dist/pagination.d.ts` 의 TS2536 3건(`createQuerySchema`)을 없앴다 — 추론 결과는 같다. IP 파서: `::ffff:` 는 점 표기 IPv4 앞에서만 떼고(`::ffff:1::/120` 거부 · `::ffff:1:2:3:4:5:6` 받음), 내장 IPv4 는 마지막 그룹에만(`1.2.3.4::` 거부), `::1` 접기는 `/128` 에만(`::1/64` 는 IPv6 망 `::/64` · `::1/120` 은 더 이상 127.0.0.0/24 가 아니다), v4-mapped 영역은 `::ffff:a.b.c.d` 꼴만 받는다(`::ffff:7f00:1` · `0:0:0:0:0:ffff:1.2.3.4` 거부).

## 0.3.0

### Minor Changes

- ce1a85f: PR #3e — 약관(법적 문서 편집 · 발행 · 이력).

  - **소비자가 할 일: `pnpm add codemirror @codemirror/state`** — admin-ui 의 새 필수 peer 다. 엔트리가 하나라 약관 화면을 안 써도 번들러가 해석해야 한다. CodeMirror 테마 패키지는 필요 없다(편집기 색은 Vuetify 테마).
  - admin-shared 새 API: `renderMarkdown`(markdown-it `html: false` · `breaks: true` — Enter 한 번이 줄바꿈, 새 의존 `markdown-it`). axion · gise 의 렌더러는 `breaks: false` 였으므로, 그 본문을 옮겨 오면 문단 안의 줄 하나 바꿈이 줄바꿈으로 보인다. 약관 스키마 — `adminLegalDocumentSchema` · `adminLegalHistoryItemSchema` · `adminLegalCurrentSchema` · `adminLegalHistorySchema` · `adminLegalPublishSchema` · `adminLegalPublishResultSchema` · `legalBodySchema` · `LEGAL_BODY_MAX_LENGTH`.
  - admin-ui 새 API: `MarkdownView` · `MarkdownEditor`(CodeMirror) · `useLegalDocuments` · `LegalDocumentEditor`.
  - 서버 계약:
    - 현재본 `{ item | null }`(미발행 = null), 이력 `{ items }`(최신순 전량).
    - 발행 `{ kind, body, baseLegalDocNo }` → `{ legalDocNo, contentHash }`. 해시는 서버만 계산한다.
    - 기준 판이 지금 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`, 본문이 같으면 409 `ERR_COMMON_CONFLICT`.
    - 미발행을 404 로 내는 기존 서버는 어댑터에서 `null` 로 바꾼다(README).
  - 기존 API 동작은 바뀌지 않는다.

- b6edaa9: PR #3a — 목록 · 쓰기 기반.

  - admin-ui 새 API: `useServerTable` · `useQuerySyncedFilter` · 코덱 층(`queryCodec` · `withDefault` · `bindQueryCodecs`) · `useWriteFlow` · `toFieldErrors`.
  - admin-shared 새 오류 코드 `ERR_COMMON_REVISION_CONFLICT`(409). `ERR_COMMON_CONFLICT` 는 상태 전이 충돌 전용이다 — 서버는 revision 불일치에 새 코드를 보낼 것.
  - **동작 변경:** `createApiClient` 의 `onError` 가 **한 매크로태스크 뒤에** 불리고, 호출처가 `error.handled = true` 로 표시한 오류는 건너뛴다. `onError` 가 거부 직후 동기로 불린다고 기대하던 코드·테스트는 한 틱 기다리도록 고칠 것.
  - `ApiError` 에 `handled: boolean` 필드가 생겼다.

- 02c1bdb: PR #3b — 역할 · 설정.

  - admin-shared 새 스키마: `adminRoleSchema` · `adminRoleCreateSchema` · `adminRoleUpdateSchema` · `adminRoleMoveSchema` · `adminRoleRemoveSchema` 와 각 타입. 🔴 수정 · 삭제 본문에 `revision` 이 필수다. 이동은 `revision` 을 싣지도 올리지도 않는다.
  - admin-ui 새 API: `PermissionMatrix` · `assertMatrixCoversPermissions` · `useRoleEditor` · `SettingsShell`, 앱 스토어 `refresh()`. `useRoleEditor` 의 `fields` 옵션(기본 `['roleName']`)은 저장 검증 오류 중 처리됨(전역 토스트 없음)으로 볼 키다 — 폼이 `isDefault` · `permissions` 오류도 그리면 더할 것.
  - `useWriteFlow` 의 `run({ fields })`: 검증 오류는 키가 전부 `fields` 안일 때만 처리됨(전역 토스트 없음)이다. `fields` 를 안 주면 `fieldErrors` 는 채우되 전역 토스트도 뜬다 — 폼을 그리는 쓰기는 `fields` 를 넘길 것. 재인증 관문의 `currentPassword` 오류는 다이얼로그 안에 보인다.
  - 서버 계약: 역할 목록은 전량 · `displayOrder` 오름차순, revision 불일치는 409 `ERR_COMMON_REVISION_CONFLICT`, 이동 목표는 이웃의 `displayOrder` 이고 서버가 구간을 재번호한다.

- 62478d8: PR #3c — 세션 · 비밀번호.

  - admin-shared 새 API: `adminSessionSchema` · `adminSessionListItemSchema` · `adminSessionRevokeResultSchema`, `describeUserAgent()`, `definePasswordPolicy()`(기본 8 · 200자, `changePasswordSchema` 는 새 = 현재를 `newPassword` 경로 오류로), `adminTemporaryPasswordSchema`.
  - admin-ui 새 API: `SessionTable` · `useSessions`(전량 · 서버 페이징, 끝내기 · 다른 세션 모두 · 사용자 전체) · `TemporaryPasswordDialog`(`v-model` 이 곧 값) · `PasswordChangeForm` · `copyText`.
  - `AdminUserInfo.isPasswordChangeRequired?` — `createAdminGuard({ isPasswordChangeRequired })` 에 잇는다.
  - 서버 계약: 세션 행의 `isCurrent` · `lastAccessAt` · `userAgent`, 현재 세션은 목록에서 끊지 못함, 임시 비밀번호 응답 키 `temporaryPassword`, 틀린 현재 비밀번호는 `ERR_COMMON_VALIDATION` + `currentPassword` 경로.
  - `PasswordField` 가 호출하는 쪽의 `autocomplete` 를 덮어쓰지 않는다(이전에는 늘 `off` — `ReauthDialog` 의 `current-password` 포함).

- 81d9ce8: PR #3d — 조직(팀 트리 · 팀 인원).

  - **소비자가 할 일: `pnpm add @he-tree/vue@^2.10.5`** — admin-ui 의 새 필수 peer 다(엔트리가 하나라 `TeamTree` 를 안 써도 번들러가 해석해야 한다). he-tree CSS 는 import 하지 않아도 된다.
  - **pnpm 10 이상이면 `vue-demi` 빌드 스크립트를 명시로 정한다.** he-tree 의 하위 의존 `vue-demi` 의 postinstall 을 pnpm 이 막고, pnpm 12 는 `pnpm install` 이 `ERR_PNPM_IGNORED_BUILDS` 로 멈춘다. `pnpm-workspace.yaml` 에 `allowBuilds:` / `vue-demi: false` 를 둔다(Vue 3 에서는 그 스크립트가 Vue 2 용 파일 전환뿐이라 필요 없다).
  - admin-shared 새 API: 팀 스키마(`adminTeamNodeSchema` · `adminTeamTreeSchema` · `adminTeamCreateSchema` · `adminTeamRenameSchema` · `adminTeamMoveSchema` · `adminTeamMoveBodySchema` · `teamNameSchema`, 이름 64자), 트리 함수(`sortTeamTree` · `flattenTeamTree` · `filterTeamTree` · `findTeamPlacement` · `siblingMove` · `moveTargets` · `toDisplayOrderMove` · `indentTeamName`).
  - admin-ui 새 API: `TeamTree`(he-tree, 노드 안 입력칸 · `draggable`) · `useTeamTree` · `TeamMoveDialog` · `TeamUserList`(쪽 나눔).
  - 서버 계약: 트리 응답 `{ items }`(루트 여럿), 이동 본문은 기준 형제 번호 `{ parentTeamNo, beforeTeamNo }`(서버가 순서 값을 계산, 순환 검사), 소속 계정이 있는 팀 삭제는 `ERR_TEAM_HAS_MEMBERS`. 기존 순서 값 서버는 `toDisplayOrderMove()` 로 맞춘다.
  - 기존 API 동작은 바뀌지 않는다.

### Patch Changes

- 73097db: 브라우저 확인(2026-10-08) 수정.

  - **`useRoleEditor` 결함 수정:** 수정 저장은 성공했는데 이어지는 재조회가 실패(예: 자기 직책에서 읽기 권한을 꺼 403)하면 `isDirty` 가 참으로 남아, 화면을 떠날 때 `useDirtyGuard` 가 "저장하지 않은 변경 사항" 을 물었다. 이제 비교 기준을 방금 저장한 값으로 맞춘다. 자기 직책 저장 뒤의 재조회 403 은 처리됨으로 표시해 오류 토스트가 깜빡이지 않는다.
  - **`TeamUserList` 결함 수정:** 목록이 스스로 스크롤 상자가 되어, 스크롤하기 전에 다음 쪽을 끝까지 다 불렀다(큰 팀이면 모든 쪽을 한꺼번에). 이제 스크롤은 목록 칸 한 곳에서 일어나고 끝에 닿을 때만 다음 쪽을 부른다.
  - **토스트 결함 수정:** 떠 있는 토스트를 새 토스트가 바꾸면 남은 시간만큼만 보였다(오류를 띄우고 4초 뒤 다른 오류를 띄우면 2초). 이제 표시 시간을 처음부터 센다.
  - **대화상자 포커스:** `BaseDialog` · `ConfirmDialog` · `ReauthDialog`(와 그 위의 대화상자)는 닫히면 연 곳으로 포커스를 돌려준다. `ReauthDialog` 는 열면 비밀번호 칸에 포커스를 둔다 — 누르지 않고 바로 친다.
  - **`TemporaryPasswordDialog`:** 복사 버튼이 값 칸 오른쪽 아이콘 버튼(접근 이름 "임시 비밀번호 복사")으로 옮겨졌다. 아래 동작 줄의 "복사" 버튼은 없어지고 "닫기" 만 남는다. 버튼 글자 "복사" 로 찾던 소비자 E2E 테스트는 접근 이름으로 찾도록 고칠 것.
  - **admin-shared 타입 결함 수정:** `adminTeamNodeSchema` 의 타입을 `z.ZodType<AdminTeamNode>` 로 적었다. 발행 d.ts 가 재귀를 지워 `AdminTeamTree['items']` 가 `AdminTeamNode[]` 에 들어가지 않던 것(README 의 `useTeamTree` load 예시가 컴파일되지 않음)을 고친다. 노드 스키마의 `.extend()` 같은 객체 메서드는 이제 없다.

## 0.2.0

### Minor Changes

- 14e4b9f: Phase 1 첫 발행.

  - admin-shared: `definePermissions` · `defineScopes` · `defineErrorCodes` / `BusinessError` · 응답 봉투 스키마 · `createQuerySchema` / `createPaginatedRespSchema` · BigInt JSON 코덱
  - admin-ui: `CardLayout` `PanelLayout` `ColumnLayout` `ColumnPane` · `BaseDialog` `ConfirmDialog` `ReauthDialog` `EmptyState` `PasswordField` · `DataTablePanel` `DataTableBody` · `createToast` / `AdminToast` / `useToast` · `createAdminVuetify` · `createUsePermission`
  - admin-ui (셸·내비게이션·인프라): `createAdminUi` / `useAdminUi` · `AdminShell` `AuthShell` `AppBar` `MainMenu` `MainMenuItem` `IpBlockedDialog` · `filterMenu` `buildMenu` `flattenRoutes` `assertParentAnyPermissionsCoverChildren` · `defineAdminRoute` / `AdminRouteMeta` `createAdminGuard` `createTitleGuard` `installChunkRecovery` `safeRedirect` · `createApiClient` / `ApiError` · `createAppStore` / `SessionNotEstablishedError` · `useDirtyGuard` `useTableSelection`
  - 패키지는 같은 번호로 함께 오른다. admin-ui 의 `@ssworks/admin-shared` peer 범위는 0.x 동안 `^0` 이니 같은 번호끼리 설치한다.
  - admin-ui 새 peer 의존: `vue-router` · `pinia` · `axios` — 셋 다 **필수**. 엔트리가 하나라 `createAppStore`·`createApiClient` 를 안 써도 번들러가 `pinia`·`axios` 를 해석해야 한다. 패키지는 `RouteMeta` 를 증강하지 않는다 — 소비 프로젝트의 `env.d.ts` 가 한다.
