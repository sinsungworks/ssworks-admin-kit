# admin-server 세션 · 감사 설계 (Phase 2 PR 2c)

작성일: 2026-10-14 · 상태: 확정(구현 전) · 선행: 2a 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1(Phase 2 지도 · §1-3 의 2c 행 · §1-4 공통 결정), 2b 스펙 `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` §4-6(`ADMIN_AUTH_EVENTS`) · §11 · §14, 3c 스펙 `docs/superpowers/specs/2026-10-06-admin-ui-sessions-passwords-design.md` §4-1 · §9 · §10, `docs/01-phase0.md` §2(감사 로그 행) · §3-2(`audit` 행) · §4, `docs/HANDOFF.md` "알려진 미확인 · 보류" 의 2c 항목

이 문서는 2c 의 범위만 쓴다. Phase 2 전체 지도 · 순서 · 공통 결정은 2a 스펙 §1, 인증 · 가드 · 세션 저장소는 2b 스펙이 그대로 유효하다.

## 1. 목표

2a 스펙 §1-3 의 2c 행:

> `SessionsModule` 6라우트(3c §9) · `AuditModule`(`@Audit` · 인터셉터 · `scrubSecrets` · `foldBigInts` · 코어 액션 + 병합) · `auditLogs` 장 · `AuditLogsModule` · 인증 경로 감사 연결

끝 상태 — 실 MariaDB 의 HTTP 계약으로 증명한다:

- 세션 목록 행이 admin-shared `adminSessionListItemSchema` 로 파싱된다. `isCurrent` 는 요청한 사람의 세션에만 true 다.
- 지금 쓰는 세션은 목록 라우트로 끊지 못한다(400). 남의 세션 · 없는 세션 · 이미 끝난 세션은 같은 404 다.
- "사용자 전체" · "다른 세션 모두" 는 `{ revokedCount }` 를 돌려준다.
- 세션 끊기 · 인증 이벤트가 감사 행으로 남는다. meta 의 비밀 필드는 `***` 다.
- 핸들러에서 실패한 요청도 상태 · 오류 코드와 함께 기록된다.
- 감사 조회가 행위자 · 액션(접두 · 정확) · 대상 · 반열림 기간으로 거른다.

쓰는 쪽은 이 PR 이 끝나면 `AdminServerOptions` 의 `permissions` 맵(슬롯 셋)과 `AdminAuditModule` · `AdminSessionsModule` import 두 줄로, admin-ui `useSessions` · `SessionTable` 에 붙는 세션 관리와 감사 기록 · 조회를 갖는다.

## 2. 결정

### 2-1. 경계 결정 (2026-10-14, 결정 문서 HTML — 모두 권장안)

| #               | 확정                                                                                                                                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 권한 키       | **P1** — 패키지 라우트는 슬롯 이름(`sessions.read` · `sessions.manage` · `auditLogs.read`)을 선언하고, 쓰는 쪽이 `AdminServerOptions.permissions` 로 프로젝트 키를 잇는다. 권한 가드가 슬롯을 키로 바꿔 판정한다. import 한 모듈의 슬롯이 맵에 없으면 기동에서 멈춘다. 2d~2f 가 같은 틀을 쓴다 |
| ② 세션 경로     | **R1** — `/admin/sessions` 컨트롤러 하나. hangang 다섯 라우트 + `POST /sessions/me/revoke-others`                                                                                                                                                                                              |
| ③ 현재 세션     | **C1** — 400 `ERR_COMMON_BAD_REQUEST`, 문구는 gise                                                                                                                                                                                                                                             |
| ④ 감사 기반     | **A1** — hangang `@Audit` + 전역 인터셉터                                                                                                                                                                                                                                                      |
| ⑤ 쓰기 시점     | **T1** — 업무 커밋 뒤, 응답 전에 기다린다, 실패는 경고(`Logger.warn`)만. 비밀번호 변경 이벤트도 2b 대로 커밋 뒤(2b B8 을 바꾸지 않는다)                                                                                                                                                        |
| ⑥ 감사 장       | **TB2** — hangang 009 + `errorCode` · `sessionNo`, 행위자 · IP 는 NULL 허용(익명은 0 대신 NULL)                                                                                                                                                                                                |
| ⑦ 액션 카탈로그 | **K1** — admin-shared `defineAuditCatalog(코어 ∪ 프로젝트)` + 감사 행 · 조회 스키마. 모르는 액션을 단 `@Audit` 은 기동에서 멈춘다                                                                                                                                                              |
| ⑧ 실패 요청     | **F1** — 핸들러에서 던진 실패만. 상태 · 코드는 `resolveErrorResponse` 가 낸 값                                                                                                                                                                                                                 |
| ⑨ 기능 장       | **M1** — 모든 장 필수(`assertAdminMigrationStubs` 는 지금처럼 장 목록 전부를 요구한다)                                                                                                                                                                                                         |
| ⑩ 모듈          | **MD1** — `AdminSessionsModule` · `AdminAuditModule` 둘(감사 모듈 = 인터셉터 · 서비스 · 인증 이벤트 sink · 조회 라우트)                                                                                                                                                                        |
| ⑪ 대상 검사     | **D1** — 남의 세션을 다룰 때의 권한 상승 검사는 2d 가 판정 함수를 만들 때 붙인다                                                                                                                                                                                                               |
| ⑫ 고아 세션     | **O1** — 유예 발급이 남기는 세션은 목록에 그대로 보인다. README 에 적는다                                                                                                                                                                                                                      |
| ⑬ 분할          | **S1** — 한 PR                                                                                                                                                                                                                                                                                 |

### 2-2. 공통 결정 (정본이 같거나 계약이 정한 것 — 이의 없음)

1. **목록은 살아 있는 세션만.** "살아 있음" = `isRevoked = false AND expireAt > now`(gise · axion · crm). hangang 은 폐기 행도 보였지만 계약 스키마에 `isRevoked` 가 없다. `refreshTokenHash` 는 어느 select 에도 넣지 않는다(hangang).
2. **`isCurrent` = 행의 `sessionNo` 가 주체의 `sessionNo` 와 같다.** 액세스 토큰의 `sessionNo` 다(네 정본이 같다). 쿠키 해시를 다시 대조하지 않는다. 요청마다 계산한다.
3. **없는 · 남의 · 이미 끝난 세션 = 404.** `ERR_COMMON_NOT_FOUND`, 문구는 gise. 폐기는 살아 있는 행만 바꾸는 조건부 UPDATE 한 문장이고 0행이면 404 다 — 존재를 드러내지 않고, 회전과 겹쳐도 같은 답이다.
4. **사유는 `terminated`.** 2b 의 재사용 탐지는 `rotated` 만 보므로 끊긴 세션의 refresh 재제시는 401 `ERR_INVALID_TOKEN` 뿐이다. "사용자 전체" 는 현재 세션도 포함한다(본인이면 로그아웃 — admin-ui `onSelfSignedOut` 계약). 0건도 `{ revokedCount: 0 }`.
5. **검색 · 정렬.** 검색어는 아이디 · 이름 부분일치(`likeContains`, `!` 이스케이프 + SQL `ESCAPE '!'` — gise). 빈 검색어는 조건 없음. 기본 정렬 `lastAccessAt` 내림차순, 같으면 `sessionNo` 내림차순. 정렬 열은 `lastAccessAt` · `loginAt` · `expireAt`(hangang).
6. **감사 쓰기 성질은 hangang 이 고친 판 그대로.** 응답 전에 기록을 기다린다(I2). `catchError` 를 성공 경로 앞에 둔다. 기록은 절대 던지지 않고 경고만 남긴다(I7 — 경고에 meta · IP · UA 를 싣지 않는다). IP · 경로 · UA · 메서드를 컬럼 폭으로 자른다(C1). `scrubSecrets` 는 배열 · 중첩까지(I5). 바꾼 점: `attachAuditMeta` 경로도 소독한다(§2-3 B2).
7. **bigint 는 접어서 저장한다.** `foldBigInts`: bigint → 십진 문자열, Date → ISO. `stringifyJSON` 의 `"BigInt(n)"` 래퍼는 화면이 meta 를 다시 `JSON.stringify` 할 때 던진다(hangang).
8. **대상 id.** 핸들러가 붙인 값 → `@Audit({ paramKey })` 경로 변수 → 숫자 경로 변수가 정확히 하나일 때 그것 → null(hangang 자동 + crm `paramKey` — Phase 0 §2). 순서는 §2-3 B6.
9. **조회는 `GET /admin/audit-logs` 하나, 읽기 전용, `@Audit` 없음.** 필터는 hangang(행위자 · 액션 접두 또는 정확 일치 · 대상 종류 · 대상 id · 기간 `[from, to)` 반열림 — `<=` 가 마지막 날을 통째로 뺐다). 페이징은 admin-shared 규약, 행위자 아이디 · 이름은 users LEFT JOIN. 보존 기간 · 파티셔닝 · 청소는 B(hangang 도 36개월이라 적고 구현하지 않았다).
10. **판정은 순수 함수로 꺼낸다.** 예외 필터의 상태 · 코드 · 마스킹 판정을 `resolveErrorResponse(exception, errorCodes)` 로 꺼내 필터와 감사가 같은 답을 쓴다(2a 최종 리뷰 이월). 로그는 필터만 쓴다.
11. **인증 이벤트는 sink 가 감사 행으로 쓴다.** 인증 컨트롤러에 `@Audit` 을 붙이지 않는다 — 로그인 · refresh · 로그아웃이 `@Public` 이라 인터셉터가 주체를 모른다(hangang 은 서비스가 직접 썼다). 계정 없는 `login.fail` 의 행위자는 NULL.

### 2-3. 설계 결정 (설계안 ① · ② · ③ 승인 2026-10-14)

| #   | 결정                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | 비밀 키 비교는 대소문자를 가리지 않는다(hangang 은 가렸다). 기본 목록 `password` · `currentPassword` · `newPassword` · `passwordHash` · `refreshToken` · `refreshTokenHash` · `accessToken` · `token` · `secret` · `keyHash`, 쓰는 쪽은 `audit.secretKeys` 로 더한다(뺄 수는 없다)                  |
| B2  | `attachAuditTarget` · `attachAuditMeta` · `attachAuditDiff` 는 서비스 메서드가 아니라 함수다(hangang 메서드도 DI 상태를 쓰지 않았다). 요청의 감사 가방에 원본만 쌓고, 소독은 인터셉터가 쓸 때 `secretKeys` 로 한 번에 한다 — `attachAuditMeta` 도 저절로 소독된다                                   |
| B3  | 세션 전체 목록에 `filter[userNo]` 를 둔다(hangang) — 사용자 상세 화면이 그 사람의 세션만 본다                                                                                                                                                                                                       |
| B4  | 🔴 세션 · 감사 목록은 코어 `users` 의 `userId` · `userName` 을 직접 JOIN 한다. `AUTH_REPOSITORY` 교체는 인증 경로만 흡수한다 — 모든 장이 필수(⑨ M1)라 users 는 코어 모양이고, 2d UsersModule 도 같은 식으로 읽는다                                                                                  |
| B5  | 감사 컬럼 이름은 hangang `principalRefNo` 대신 `actorUserNo`(gise). `principalRefNo` 는 crm 의 API 키 주체에서 온 이름이라 사용자만 있는 킷에서 뜻이 흐리고, 대상 쪽 `targetRefNo` 와 헷갈린다. 응답 행은 `actorUserId` · `actorUserName` 을 더한다                                                 |
| B6  | 대상 id 는 핸들러가 명시한 값(`attachAuditTarget`)이 먼저다 — hangang 은 자동 추출이 먼저였다. 명시는 의도다. 경로 변수가 BigInt 로 읽히지 않으면 그 갈래를 건너뛴다                                                                                                                                |
| B7  | `scrubSecrets` 는 순환 참조를 `'[Circular]'`, 깊이 20 을 넘으면 `'[Depth]'` 로 바꾼다 — 둘 다 `JSON.stringify` 가 던져 행이 통째로 빠지는 것을 막는다                                                                                                                                               |
| B8  | meta 는 직렬화 길이 64 KiB(UTF-8 바이트)를 넘으면 `{"_truncated":true,"bytes":n}` 로 바꿔 쓴다. 넘는 meta 는 INSERT 를 `max_allowed_packet` 에 걸리게 해 행을 잃는다                                                                                                                                |
| B9  | `AdminSessionStore.revokeAllOfUser` 에 옵션 `liveOnly` 를 더한다 — 세션 라우트가 끊은 개수에 이미 만료된 행을 세지 않는다(gise). 2b 호출부(재사용 탐지 · 비밀번호 변경)는 지금 동작 그대로                                                                                                          |
| B10 | LIKE 도우미는 셋: `escapeLike(term)` · `likeContains(term)` · `likePrefix(term)`, 이스케이프 문자 `LIKE_ESCAPE = '!'`(gise · hangang 공통 — `NO_BACKSLASH_ESCAPES` 와 무관). `ESCAPE '!'` 는 SQL 정적 텍스트로 쓴다(바인딩할 수 없는 문법 리터럴이다)                                               |
| B11 | `@Public` 라우트에 붙은 `@Audit` 은 기동에서 멈춘다 — 주체가 없어 영원히 기록되지 않는 선언이다(hangang 은 테스트로 막았다)                                                                                                                                                                         |
| B12 | 감사 기록 실패 경고는 한 줄: `감사 기록 실패 — actor=… action=… METHOD path status=…: 오류 문구`. meta · IP · UA 는 싣지 않는다. 드라이버 오류 문구는 그대로 싣는다 — 풀이 `logParam: false` 라 바인딩 값이 문구에 나오지 않는다(2a)                                                                |
| B13 | 쿼리스트링의 bigint 는 admin-shared `queryBigIntSchema` 로 읽는다 — 숫자만 든 문자열(또는 bigint)을 bigint 로, 빈 문자열 · 부호 · 소수 · 공백은 거부. 🔴 `z.coerce.bigint()` 를 쓰지 않는다 — `BigInt('')` 는 `0n` 이다. admin-ui `serializeParams` 는 bigint 를 십진 문자열, Date 를 ISO 로 보낸다 |
| B14 | 감사 조회의 `from < to` 는 서버가 본다(400 `ERR_COMMON_VALIDATION` + `issues[{ path: ['filter', 'to'] }]`). 🔴 admin-shared 스키마에 `.refine()` 을 걸지 않는다(3b §11 R1 — 쓰는 쪽 `.extend()` 를 막는다)                                                                                          |

## 3. 정본과 흡수 목록

| 산출물                            | 정본                                                                                                                  | 흡수할 것                                                                                                                                   | 버릴 것                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `sessions/*`                      | hangang `modules/sessions`(5라우트 · 컬럼 · `terminated`) + gise `auth/admin-me.*` · `accounts/admin-user-sessions.*` | hangang 경로 · 남의 세션 404 · `runQuery` 감싸기, gise 현재 세션 거부 · `revoke-others` · `{ revokedCount }` · 살아 있는 행 조건 · 404 문구 | hangang 폐기 행 노출, gise `lastActiveAt`(실제로는 생성 시각) · 50개 상한 · 본인 대상 금지(admin-ui 계약과 어긋남) |
| `session.store.ts` 확장           | gise `listLiveSessionsOfUser` · `revokeOwnOtherSessionsInTransaction` · axion `activeSessionsQuery`(검색)             | 살아 있는 행 조건 · 그 사용자 · 지금 세션 제외 · 끊은 개수                                                                                  | axion 의 존재 확인 없는 폐기 · 사유 없는 폐기                                                                      |
| `database/like.ts`                | gise `core/database/like.ts` · hangang `shared/utils/escape-like.ts`                                                  | `!` 한 번 이스케이프 · 정적 `ESCAPE '!'` · 접두/포함 도우미                                                                                 | 백슬래시 기본 이스케이프                                                                                           |
| `audit/audit.interceptor.ts`      | hangang `core/audit/audit.interceptor.ts`                                                                             | 메타 없으면 통과 · `catchError` → `mergeMap` 순서 · 기다림 · 절대 reject 하지 않는 `write` · 숫자 경로 변수 하나 규칙                       | `err.getStatus()`(→ `resolveErrorResponse`), `req.user`(→ `req.admin`)                                             |
| `audit/scrub.ts`                  | hangang `audit.service.ts` `scrubSecrets` · `foldBigInts` · `META_FIELD_BLACKLIST`                                    | 재귀 · 키는 남기고 값만 가림 · Date 보존 · 표준 `JSON.stringify`                                                                            | 대소문자 구분 비교(B1), 프로젝트 키(`s3*Enc` — 쓰는 쪽 `secretKeys`), 읽을 때 다시 가리기(`maskCiphertext`)        |
| `audit/audit-bag.ts` · `entry.ts` | hangang `attachDiff` · `attachMeta` · `attachTarget` · `extractPath` + crm `paramKey`                                 | 화이트리스트 diff · 쿼리를 뗀 경로 · 명시 대상                                                                                              | 서비스 메서드 형태(B2)                                                                                             |
| `audit/audit.service.ts`          | hangang `AuditService.record`                                                                                         | 폭 자르기(C1 · A6) · 삼키고 경고(I7)                                                                                                        | `recordFromRequest` 공개(→ sink 내부)                                                                              |
| `audit/auth-events.ts`            | hangang `auth.service.ts` `denyAndRecord` · `recordFromRequest` 호출 다섯 갈래                                        | 갈래마다 액션 · 응답과 같은 상태                                                                                                            | 서비스 직접 호출(→ 2b `ADMIN_AUTH_EVENTS`)                                                                         |
| `audit/audit-logs.*`              | hangang `modules/audit-logs`(필터 · 반열림 · `actionMatch`) + gise 읽기 쪽 관용(액션은 그냥 문자열)                   | 접두/정확 · 기간 반열림 · LEFT JOIN 행위자 · `createAt, logNo` 정렬                                                                         | hangang `actionLabel` 응답 필드(→ 화면이 카탈로그로), gise `/actors` 라우트                                        |
| `0008_audit_logs.ts`              | hangang `009_audit_logs.migration.ts`(+ gise 017 의 `sessionNo`)                                                      | 컬럼 폭 · 인덱스 셋 · users FK 없음 · 단일 PK · 파티셔닝 없음                                                                               | `principalRefNo` 이름(B5) · NOT NULL 익명 0 · `ip` NOT NULL                                                        |
| admin-shared `audit.ts`           | hangang `shared/constants/audit.const.ts`(액션 · 라벨 · 대상) + admin-shared `defineErrorCodes`(병합 틀)              | 코어 액션 이름 · 한국어 라벨 · 개수를 테스트로 고정                                                                                         | 프로젝트 액션(→ 쓰는 쪽), `AUDIT_ACTION_GROUPS`(화면 몫)                                                           |
| `http/error-response.ts`          | 2a `AdminExceptionFilter.toBody`                                                                                      | 분기 · 🔴 주석 그대로                                                                                                                       | 판정 안의 로그 호출(→ 반환값 `log`)                                                                                |

## 4. 공개 API

### 4-1. 옵션 (`src/options.ts` 에 더한다)

```ts
export interface AdminServerOptions {
  // …2a · 2b 그대로
  /** 패키지 라우트의 권한 슬롯 → 프로젝트 권한 키(① P1). import 한 모듈의 슬롯이 없으면 기동에서 멈춘다 */
  permissions?: Partial<Record<AdminPermissionSlot, string>>
  /** `AdminAuditModule` 이 읽는다 */
  audit?: AdminAuditOptions
}

/** 2c 의 셋. 2d~2f 가 늘린다 — 유니온이 늘어나는 것은 하위 호환이다 */
export type AdminPermissionSlot = 'sessions.read' | 'sessions.manage' | 'auditLogs.read'

export interface AdminAuditOptions {
  /** admin-shared `defineAuditCatalog()` 결과. 없으면 코어 카탈로그 */
  catalog?: AuditCatalog
  /** 기본 비밀 키에 더한다(B1). 대소문자 무시 */
  secretKeys?: readonly string[]
}
```

- 슬롯 판정은 권한 선언과 같은 층이다 — `@SelfOnly` 보다 먼저 본다(2b §14 R3). 슬롯과 `@RequirePermissions` 가 함께 있으면 둘 다 통과해야 한다.
- 슬롯 → 라우트: `sessions.read` = `GET /sessions` · `sessions.manage` = `DELETE /sessions/:sessionNo` · `DELETE /sessions/user/:userNo` · `auditLogs.read` = `GET /audit-logs`. 본인 세션 셋은 `@SelfOnly`.
- 🔴 실행 중에 슬롯이 맵에 없으면 403(fail-closed) — 기동 검사를 피한 조합(테스트 하네스 · 수동 조립)의 방어선이다.

### 4-2. 모듈

```ts
@Module({ controllers: [AdminSessionsController], providers: [AdminSessionsService] })
export class AdminSessionsModule implements OnModuleInit {}

@Global()
@Module({
  imports: [DiscoveryModule],
  controllers: [AdminAuditLogsController],
  providers: [
    AdminAuditService,
    AdminAuditLogsService,
    ADMIN_AUDIT_CONFIG(내부),
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
    { provide: ADMIN_AUTH_EVENTS, useClass: AdminAuditEventSink },
  ],
  exports: [ADMIN_AUTH_EVENTS],
})
export class AdminAuditModule implements OnModuleInit, OnApplicationBootstrap {}
```

- 둘 다 정적 모듈이다(`forRoot` · `withRepository` 같은 변형 없음) — 같은 정적 모듈을 두 번 import 해도 Nest 가 하나로 합친다. `ADMIN_ROUTE_MODULES` 에 둘을 더한다(`routePrefix` 가 붙는다).
- `AdminAuditModule` 은 전역이다 — `ADMIN_AUTH_EVENTS` 를 `AdminAuthService` 의 `@Optional()` 주입이 받는다.
- `AdminAuthModule` 은 `AdminSessionStore` 를 export 에 더한다(패키지 안에서만 쓴다 — index 에 내지 않는다).
- 기동 검사는 §5-8.

### 4-3. admin-shared `src/audit.ts` (minor)

```ts
export const CoreAuditActions = {
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAIL: 'auth.login.fail',
  AUTH_LOGIN_BLOCKED_INACTIVE: 'auth.login.blocked.inactive',
  AUTH_LOGIN_BLOCKED_IP: 'auth.login.blocked.ip',
  AUTH_LOGIN_BLOCKED_LOCKED: 'auth.login.blocked.locked',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_TOKEN_REFRESH: 'auth.token.refresh',
  AUTH_TOKEN_REUSE: 'auth.token.reuse',
  AUTH_PASSWORD_CHANGE: 'auth.password.change',
  AUTH_ACCESS_BLOCKED_IP: 'auth.access.blocked.ip',
  SESSION_REVOKE: 'session.revoke',
  SESSION_REVOKE_USER: 'session.revoke.user',
  SESSION_REVOKE_SELF: 'session.revoke.self',
  SESSION_REVOKE_OTHERS: 'session.revoke.others',
} as const
export const CoreAuditTargets = { USER: 'user', SESSION: 'session' } as const
export type CoreAuditAction = (typeof CoreAuditActions)[keyof typeof CoreAuditActions]
export type CoreAuditTarget = (typeof CoreAuditTargets)[keyof typeof CoreAuditTargets]
export const CORE_AUDIT_ACTION_LABELS: Readonly<Record<CoreAuditAction, string>> // hangang 문구
export const CORE_AUDIT_TARGET_LABELS: Readonly<Record<CoreAuditTarget, string>> // 사용자 · 세션

export interface AuditCatalog<
  A extends Record<string, string> = Record<never, never>,
  T extends Record<string, string> = Record<never, never>,
> {
  readonly AuditActions: Readonly<typeof CoreAuditActions> & Readonly<A>
  readonly AuditTargets: Readonly<typeof CoreAuditTargets> & Readonly<T>
  readonly ACTION_VALUES: readonly (CoreAuditAction | A[keyof A])[]
  readonly TARGET_VALUES: readonly (CoreAuditTarget | T[keyof T])[]
  isAuditAction(value: string): value is CoreAuditAction | A[keyof A]
  isAuditTarget(value: string): value is CoreAuditTarget | T[keyof T]
  /** 모르는 값(옛 행 · 지운 액션)은 원문 그대로 */
  labelOf(action: string): string
  targetLabelOf(target: string): string
}

export function defineAuditCatalog<
  const A extends Record<string, string> = Record<never, never>,
  const T extends Record<string, string> = Record<never, never>,
>(project?: {
  actions?: A
  targets?: T
  /** 프로젝트 액션은 전부 필수, 코어 액션은 덮어쓰기(선택) */
  labels?: Record<A[keyof A], string> & Partial<Record<CoreAuditAction, string>>
  targetLabels?: Record<T[keyof T], string> & Partial<Record<CoreAuditTarget, string>>
}): AuditCatalog<A, T>
export const coreAuditCatalog: AuditCatalog

/** 쿼리스트링 bigint(B13) — 숫자만 든 문자열 또는 bigint → bigint */
export const queryBigIntSchema: z.ZodType<bigint>

export const adminAuditLogSchema: z.ZodObject<{
  logNo: bigint
  actorUserNo: bigint | null
  actorUserId: string | null
  actorUserName: string | null
  sessionNo: bigint | null
  action: string // 🔴 열린 문자열 — 새 판이 쓴 행도 옛 화면이 읽는다(gise)
  targetType: string | null
  targetRefNo: bigint | null
  method: string
  path: string
  statusCode: number
  errorCode: string | null
  ip: string | null
  userAgent: string | null
  meta: unknown
  createAt: string // ISO
}>
export const adminAuditLogQuerySchema // createQuerySchema(정렬 createAt, filter 아래)
//   filter: { actorUserNo, action(1~128), actionMatch: 'prefix' | 'exact', targetType(1~64), targetRefNo, from, to(ISO) }
export type AdminAuditLog · AdminAuditLogQuery
```

- `defineAuditCatalog` 는 던진다: 프로젝트 키가 코어 키와 겹칠 때, 프로젝트 값이 코어 값(또는 서로)과 겹칠 때, 라벨이 빠졌을 때(`defineErrorCodes` 와 같은 틀).
- 테스트가 코어 액션 14 · 대상 2 · 라벨 수를 고정한다(hangang 개수 테스트 — 산문의 개수는 낡는다).
- 🔴 `.refine()` 을 걸지 않는다(B14).

### 4-4. 감사 데코레이터 · 가방 함수 (index)

```ts
export function Audit(options: {
  action: string
  targetType?: string
  /** 대상 id 로 읽을 경로 변수 이름(crm) */
  paramKey?: string
}): CustomDecorator<string>

export function attachAuditTarget(req: Request, targetRefNo: bigint): void
/** 얕게 병합 */
export function attachAuditMeta(req: Request, patch: Record<string, unknown>): void
/** `fields` 에 적힌 키만 before · after 로 담는다 */
export function attachAuditDiff(
  req: Request,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): void
```

- 가방은 요청 객체의 비공개 심볼 자리다 — Express `Request` 를 증강하지 않는다(2b 주체와 같은 방식).
- 프로젝트 액션 유니온으로 좁히려면 쓰는 쪽이 감싼다: `const AuditAs = (o: { action: ProjectAction; … }) => Audit(o)`.

### 4-5. LIKE 도우미 (index — `src/database/like.ts`)

```ts
export const LIKE_ESCAPE = '!'
export function escapeLike(term: string): string // ! · % · _ 를 한 번에
export function likeContains(term: string): string // %…%
export function likePrefix(term: string): string // …%
```

쓰는 법: `` sql`${sql.ref('u.userId')} like ${likeContains(k)} escape '!'` `` — 빈 문자열은 부르는 쪽이 거른다(`'%%'` 는 전부다).

### 4-6. 세션 라우트 (`AdminSessionsController`, `@Controller('sessions')` → `/{전역 prefix}/admin/sessions/…`)

| 라우트                            | 권한              | 입력 → 응답                                                                                                                                                                          | 감사                                                                  |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `GET /sessions`                   | `sessions.read`   | `createQuerySchema`(정렬 `lastAccessAt` · `loginAt` · `expireAt`, `filter[keyword]`(trim, ≤ 64) · `filter[userNo]`) → `{ items: AdminSessionListItem[], total, page, itemsPerPage }` | —                                                                     |
| `DELETE /sessions/:sessionNo`     | `sessions.manage` | → `{}`                                                                                                                                                                               | `session.revoke` · 대상 `session`                                     |
| `DELETE /sessions/user/:userNo`   | `sessions.manage` | → `{ revokedCount }` · 없는 사용자 404 `ERR_NO_USER`                                                                                                                                 | `session.revoke.user` · 대상 `user` · meta `{ revokedCount }`         |
| `GET /sessions/me`                | `@SelfOnly`       | → `{ items: AdminSession[] }`(전량 — 3c §10)                                                                                                                                         | —                                                                     |
| `DELETE /sessions/me/:sessionNo`  | `@SelfOnly`       | → `{}`                                                                                                                                                                               | `session.revoke.self` · 대상 `session`                                |
| `POST /sessions/me/revoke-others` | `@SelfOnly`       | → `{ revokedCount }`                                                                                                                                                                 | `session.revoke.others` · 대상 `user`(본인) · meta `{ revokedCount }` |

- 세션 쿼리 스키마는 서버 내부다(`sessions/sessions.query.ts`) — 화면은 어댑터라 스키마를 읽지 않는다.
- `POST /me/revoke-others` 는 200 이다(`@HttpCode(200)` — 생성이 아니다). `DELETE /me/others` 로 두지 않는다 — `DELETE /me/:sessionNo` 와 겹친다.

### 4-7. 감사 조회 라우트 (`AdminAuditLogsController`, `@Controller('audit-logs')`)

| 라우트            | 권한             | 입력 → 응답                                                                          |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `GET /audit-logs` | `auditLogs.read` | `adminAuditLogQuerySchema` → `{ items: AdminAuditLog[], total, page, itemsPerPage }` |

### 4-8. 감사 장 `0008_audit_logs` (`@ssworks/admin-server/migrations/0008_audit_logs`)

| 컬럼          | 타입                                         | 비고                                                   |
| ------------- | -------------------------------------------- | ------------------------------------------------------ |
| `logNo`       | bigint unsigned PK auto_increment            |                                                        |
| `actorUserNo` | bigint unsigned NULL                         | 행위자. NULL = 계정을 특정할 수 없음(익명 로그인 실패) |
| `sessionNo`   | bigint unsigned NULL                         | 행위자의 세션(⑥ TB2). FK 없음                          |
| `action`      | varchar(128) NOT NULL `UTF8_CI`              |                                                        |
| `targetType`  | varchar(64) NULL `UTF8_CI`                   |                                                        |
| `targetRefNo` | bigint unsigned NULL                         |                                                        |
| `method`      | varchar(8) NOT NULL                          |                                                        |
| `path`        | varchar(255) NOT NULL                        | 쿼리를 뗀 경로                                         |
| `statusCode`  | smallint unsigned NOT NULL                   |                                                        |
| `errorCode`   | varchar(64) NULL `ASCII_BIN`                 | 실패면 응답 봉투의 `code`(⑥ TB2)                       |
| `ip`          | varchar(45) NULL                             |                                                        |
| `userAgent`   | varchar(255) NULL                            |                                                        |
| `meta`        | json NULL `JSON_BIN`                         | 소독 · 접기 뒤 표준 JSON(공통 7)                       |
| `createAt`    | timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP |                                                        |

- 인덱스: `idxAuditLogsActor(actorUserNo, createAt)` · `idxAuditLogsTarget(targetType, targetRefNo, createAt)` · `idxAuditLogsAction(action, createAt)`.
- 🔴 users · sessions FK 를 두지 않는다 — 계정 삭제(CASCADE)가 흔적을 지우지 않게(hangang). 파티셔닝 없음 · 단일 PK(hangang 이 crm 의 RANGE 파티션을 걷어냈다).
- `ADMIN_MIGRATIONS` 에 `'0008_audit_logs'` 를 더한다 — 스텁 정규식 `[a-z_]+` 에 맞는다.
- 테이블 타입 `AdminAuditLogsTable` 을 `AdminDatabase.auditLogs` 로 더한다.

### 4-9. 내부(index 밖)

`resolveErrorResponse` · `scrubSecrets` · `foldBigInts` · `serializeAuditMeta` · `buildAuditEntry` · `auditEntryOfAuthEvent` · `AdminAuditService` · `AdminAuditInterceptor` · `AdminAuditEventSink` · 슬롯 데코레이터 `RequirePermissionSlot` · `assertPermissionSlots` · `assertAuthModuleRegistered` · `AdminSessionsService` · `SESSION_MESSAGES`.

## 5. 흐름

### 5-1. 감사 인터셉터 (`AdminAuditInterceptor`)

전역 순서: 인증 가드 → 권한 가드 → Nest 가 성공 상태를 정한다(`setStatus` — POST 201 · `@HttpCode`, 설치된 `@nestjs/core` `router-execution-context.js` 에서 확인) → 인터셉터들 → 핸들러. 봉투 인터셉터와의 선후는 상관없다 — 감사는 반환값을 읽지 않는다.

```
intercept(context, next)
 ├ getType() !== 'http' ───────────── 그대로 통과
 ├ @Audit 메타 없음(메서드 → 클래스) ─ 그대로 통과
 └ next.handle().pipe(
     catchError(err ⇒ from(write(req, outcomeOf(err))) ⇒ throwError(() => err)),
     mergeMap(value ⇒ from(write(req, { status: res.statusCode, errorCode: null })) ⇒ value),
   )
outcomeOf(err) = resolveErrorResponse(err, errorCodes) → { status, errorCode: body.code }

write(req, outcome)            🔴 절대 reject 하지 않는다
 ├ 주체 없음 ──────────────── 기록하지 않는다(기동 검사가 @Public + @Audit 을 미리 막는다 — B11)
 ├ entry = buildAuditEntry(req, meta, outcome, secretKeys)
 └ AdminAuditService.insert(entry)  자기 연결 · 커밋 뒤 · 기다린다(⑤ T1)
```

- 🔴 `catchError` 가 `mergeMap` 앞이다 — 반대면 성공 경로 기록이 실패할 때 catchError 가 그것을 다시 잡아 같은 요청이 두 번 기록된다(hangang).
- 실패는 핸들러 안에서 던진 것만 온다(⑧ F1). 가드의 401 · 403 · 강제 변경 403 은 인터셉터 앞에서 끝난다.

### 5-2. 행 만들기 (`buildAuditEntry` — 순수 함수)

| 컬럼                        | 값                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `actorUserNo` · `sessionNo` | 주체의 `userNo` · `sessionNo`                                                                   |
| `action` · `targetType`     | `@Audit` 메타                                                                                   |
| `targetRefNo`               | `attachAuditTarget` 값 → `paramKey` 경로 변수 → 숫자 경로 변수가 정확히 하나면 그것 → null(B6)  |
| `method` · `path`           | `req.method` · `originalUrl` 에서 쿼리를 뗀 것. 8 · 255 코드 포인트로 자른다                    |
| `statusCode` · `errorCode`  | 성공 `res.statusCode` · null / 실패 `resolveErrorResponse` 의 상태 · `body.code`                |
| `ip` · `userAgent`          | `requestMetaOf(req)`(2b) — 45 · 255 코드 포인트로 자른다(C1). `clientIp` 출처는 2f 가 다시 본다 |
| `meta`                      | 가방(`before` · `after` · 얕은 meta) → `serializeAuditMeta`(§5-3) → 문자열 또는 NULL            |

### 5-3. 소독 · 접기 (`audit/scrub.ts`)

1. `scrubSecrets(value, keys)` — 일반 객체 · 배열을 내려가며 키 이름이 비밀 키와 대소문자 무시로 같으면 값을 `'***'` 로 바꾸고 키는 남긴다. Date 는 건드리지 않는다. 순환 `'[Circular]'` · 깊이 20 초과 `'[Depth]'`(B7).
2. `foldBigInts(value)` — bigint → 십진 문자열, Date → ISO, 배열 · 일반 객체 재귀.
3. `serializeAuditMeta(bag, keys)` = 비면 null, 아니면 `JSON.stringify(foldBigInts(scrubSecrets(bag, keys)))` — UTF-8 64 KiB 를 넘으면 `{"_truncated":true,"bytes":n}`(B8). 던지지 않는다 — 실패하면 `{"_unserializable":true}`.

### 5-4. `resolveErrorResponse` (`http/error-response.ts`)

```ts
export function resolveErrorResponse(
  exception: unknown,
  errorCodes?: Pick<ErrorCodeTable<Record<string, string>>, 'httpStatusFor'>,
): {
  status: number
  body: { success: false; code: string; message: string; details?: unknown }
  /** 5xx · 처리되지 않은 예외만 — 필터가 찍는다 */
  log?: { message: string; reason: unknown; details?: unknown }
}
```

- `AdminExceptionFilter.toBody` 의 분기 · 🔴 주석(상태 정규화가 마스킹보다 먼저 · 5xx 에서 details 빼기 · Express 4xx · 처리되지 않은 예외)을 그대로 옮기고, `this.log(...)` 호출만 반환값 `log` 로 바꾼다.
- 필터: `try { resolveErrorResponse } catch { 500 고정 }` → `log` 가 있으면 찍는다 → `send`. 🔴 "반드시 응답" 불변식은 그대로다.
- 감사: `status` 와 `body.code` 만 쓰고 `log` 는 버린다 — 같은 오류가 두 번 찍히지 않는다. 필터와 같은 `errorCodes`(`ADMIN_SERVER_OPTIONS.errorCodes`)를 쓴다.

### 5-5. 인증 이벤트 sink (`audit/auth-events.ts`)

```
AdminAuditEventSink.record(event, req)
 ├ e = auditEntryOfAuthEvent(event)   순수 함수 — 아래 표
 ├ entry = { ...e, method · path · ip · userAgent ← req }
 └ AdminAuditService.insert(entry)    던지지 않는다. 2b emit 도 한 번 더 잡는다(B8)
```

| 이벤트                     | 액션                                                 | 대상 · `sessionNo` 컬럼                         | 상태 · 코드                       |
| -------------------------- | ---------------------------------------------------- | ----------------------------------------------- | --------------------------------- |
| `login.success`            | `auth.login.success`                                 | user = userNo · 새 세션                         | 200                               |
| `login.fail`               | `auth.login.fail`, meta `{ userId, loginFailCount }` | user = userNo(없으면 대상 · 행위자 NULL) · NULL | 401 `ERR_LOGIN_FAILED`            |
| `login.blocked` `resigned` | `auth.login.blocked.inactive`, meta `{ userId }`     | user · NULL                                     | 403 `ERR_RESIGNED_USER`           |
| `login.blocked` `ip`       | `auth.login.blocked.ip`, meta `{ userId }`           | user · NULL                                     | 403 `ERR_IP_NOT_ALLOWED`          |
| `login.blocked` `locked`   | `auth.login.blocked.locked`, meta `{ userId }`       | user · NULL                                     | 401 `ERR_LOGIN_FAILED`(2b §14 R7) |
| `token.refresh`            | `auth.token.refresh`, meta `{ rotatedFrom, grace }`  | session = 새 세션 · 새 세션                     | 200                               |
| `token.reuse`              | `auth.token.reuse`, meta `{ revokedCount }`          | session = 제시된 세션 · 제시된 세션             | 401 `ERR_REFRESH_REUSED`          |
| `logout`                   | `auth.logout`                                        | session · 그 세션                               | 200                               |
| `password.change`          | `auth.password.change`, meta `{ revokedCount }`      | user = 본인 · 지금 세션                         | 200                               |
| `access.blocked`           | `auth.access.blocked.ip`                             | session · 그 세션                               | 403 `ERR_IP_NOT_ALLOWED`          |

- 행위자는 이벤트의 `userNo`(없으면 NULL). 이벤트에는 상태가 실려 오지 않는다 — 이 표가 순수 함수이고, 테스트가 2b 오류 표(2b 스펙 §6)와 `CommonErrorCodes` 에 맞춰 고정한다.
- 🔴 `login.fail` 의 meta `userId` 는 사람이 친 원문이다 — 비밀번호를 아이디 칸에 친 사고가 그대로 남는다(hangang 도 같다). README 에 적는다.

### 5-6. 세션 판정 (`AdminSessionsService`)

"살아 있음" = `isRevoked = false AND expireAt > now`. 폐기는 모두 이 조건을 단 UPDATE 한 문장이다 — 회전 · 다른 폐기와 겹쳐도 InnoDB 잠금 읽기가 가른다. 사유 `terminated`, `revokedAt = now`.

```
GET /sessions                    sessions.read
  sessions ⋈ users  WHERE 살아 있음
    [AND (u.userId LIKE :k ESCAPE '!' OR u.userName LIKE :k ESCAPE '!')]  k = likeContains(trim(keyword)), 비면 조건 없음
    [AND s.userNo = :userNo]
  ORDER BY 정렬…, s.sessionNo DESC · LIMIT/OFFSET + 같은 조건 COUNT
  ⇒ { items(isCurrent = sessionNo === 주체.sessionNo), total: bigint, page, itemsPerPage }

DELETE /sessions/:sessionNo      sessions.manage
 ├ sessionNo === 주체.sessionNo ── 400 ERR_COMMON_BAD_REQUEST
 ├ UPDATE … WHERE sessionNo AND 살아 있음 → 0행 ── 404 ERR_COMMON_NOT_FOUND
 └ 200 {}

DELETE /sessions/user/:userNo    sessions.manage
 ├ users 에 없음 ── 404 ERR_NO_USER
 └ revokeAllOfUser(userNo, 'terminated', now, { liveOnly: true }) → n ⇒ 200 { revokedCount: n }
   attachAuditMeta({ revokedCount: n })   본인이면 지금 세션도 끊긴다 — 다음 요청이 401

GET /sessions/me                 @SelfOnly
  WHERE userNo = 주체 AND 살아 있음 ORDER BY lastAccessAt DESC, sessionNo DESC ⇒ { items }

DELETE /sessions/me/:sessionNo   @SelfOnly
 ├ 지금 세션 ── 400
 ├ UPDATE … WHERE sessionNo AND userNo = 주체 AND 살아 있음 → 0행 ── 404   남의 세션 · 없음 · 끝남이 같은 답
 └ 200 {}

POST /sessions/me/revoke-others  @SelfOnly
  revokeAllOfUser(주체, 'terminated', now, { exceptSessionNo: 주체.sessionNo, liveOnly: true }) → n
  attachAuditTarget(주체.userNo) · attachAuditMeta({ revokedCount: n }) ⇒ 200 { revokedCount: n }
```

- 지금 세션 검사가 폐기 UPDATE 보다 먼저다 — 본인 세션이라 존재를 드러낼 것이 없다.
- 경로 변수는 `ParseBigIntPipe`, 쿼리는 `ZodValidationPipe`(2a). 강제 변경 계정은 본인 라우트도 403 이다(허용 표시가 없다 — gise 와 같다).
- `AdminSessionStore` 에 더하는 것: `listLive(query)` → `{ rows, total }` · `listLiveOfUser(userNo, now)` · `revokeLive(sessionNo, now, { userNo? })` · `revokeAllOfUser` 의 `liveOnly`(B9). 모두 `runQuery` 로 감싼다(hangang A5).

### 5-7. 감사 조회 (`AdminAuditLogsService`)

```
query = adminAuditLogQuerySchema  (filter.actionMatch 기본 'prefix')
from ≥ to ── 400 ERR_COMMON_VALIDATION + issues[{ path: ['filter','to'] }] (B14)
auditLogs a ⟕ users u ON u.userNo = a.actorUserNo
  [a.actorUserNo = :actorUserNo]
  [a.action LIKE :p ESCAPE '!']   p = likePrefix(action) — session.revoke 접두는 .user · .self · .others 도 잡는다
  [a.action = :action]            actionMatch = 'exact'
  [a.targetType = :t] [a.targetRefNo = :r]
  [a.createAt ≥ :from] [a.createAt < :to]   반열림
ORDER BY a.createAt {order}, a.logNo {order} · LIMIT/OFFSET + 같은 조건 COUNT
⇒ items: AdminAuditLog(meta = readJsonColumn(meta)), total: bigint, page, itemsPerPage
```

### 5-8. 기동 검사

| 검사                      | 어디서                                               | 멈추는 조건                                                                                                                              |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 인증 모듈                 | 두 모듈 `onModuleInit`(`assertAuthModuleRegistered`) | `AdminAuthModule` 이 앱에 없다 — 가드 없이 라우트가 열린다                                                                               |
| 권한 슬롯                 | 두 모듈 `onModuleInit`(`assertPermissionSlots`)      | 자기 슬롯이 `permissions` 에 없거나 빈 문자열. 빠진 것을 모아 한 번에, 배선 예시와 함께                                                  |
| 카탈로그                  | `AdminAuditModule.onApplicationBootstrap`            | 앱의 모든 컨트롤러(`DiscoveryService`) 메서드 · 클래스의 `@Audit` 중 카탈로그에 없는 액션 · 대상 종류 — `Controller.method` 로 모아 보고 |
| `@Public` + `@Audit`(B11) | 같은 훑기                                            | 같은 메서드(또는 클래스)에 둘이 함께 있다                                                                                                |

## 6. 오류 표

새 코드는 없다. 문구는 `sessions/errors.ts` 의 `SESSION_MESSAGES` 한 곳에 둔다(2b `AUTH_MESSAGES` 와 같은 방식).

| 자리                    | 상태 · 코드                  | 문구                                                                                   |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| 지금 세션 끊기(둘 다)   | 400 `ERR_COMMON_BAD_REQUEST` | `지금 쓰는 세션은 여기서 끝낼 수 없습니다. 로그아웃을 쓰세요.`                         |
| 없는 · 남의 · 끝난 세션 | 404 `ERR_COMMON_NOT_FOUND`   | `세션을 찾을 수 없습니다. 이미 끝났거나 갱신됐을 수 있습니다.`                         |
| 없는 사용자             | 404 `ERR_NO_USER`            | `사용자를 찾을 수 없습니다.`                                                           |
| 감사 기간 거꾸로        | 400 `ERR_COMMON_VALIDATION`  | `issues[{ path: ['filter','to'], message: '끝 시각은 시작 시각보다 뒤여야 합니다.' }]` |
| 슬롯 없음(실행 중)      | 403 `ERR_COMMON_FORBIDDEN`   | 2b 권한 거부 문구                                                                      |
| 쿼리 · 경로 변수 오류   | 400 `ERR_COMMON_VALIDATION`  | 2a 검증 파이프                                                                         |

## 7. 의존성

- 새 의존성 없음. `DiscoveryModule` 은 `@nestjs/core`(peer).
- admin-shared 에 새 export(§4-3) — 고친 뒤 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server 가 본다(CLAUDE.md). admin-ui 는 바뀌지 않는다.

## 8. 파일

```
packages/admin-shared/src/
  audit.ts · audit.test.ts                   카탈로그 · queryBigIntSchema · 감사 행 · 조회 스키마
  index.ts                                   export 더함
packages/admin-server/src/
  http/error-response.ts · .test.ts          resolveErrorResponse(새)
  http/exception.filter.ts                   판정을 위임(동작 그대로)
  database/like.ts · .test.ts                LIKE 도우미
  database/migrations/0008_audit_logs.ts     감사 장
  database/migrations/index.ts               ADMIN_MIGRATIONS · CHAPTERS 에 더함
  database/tables/audit-logs.ts · types.ts   AdminAuditLogsTable · AdminDatabase.auditLogs
  auth/permission-slots.ts · .test.ts        슬롯 타입 · RequirePermissionSlot · assertPermissionSlots · assertAuthModuleRegistered
  auth/permission.guard.ts                   슬롯 갈래
  auth/admin-auth.module.ts                  AdminSessionStore export
  auth/session.store.ts · .db.test.ts        목록 · 조건부 폐기 · liveOnly
  sessions/errors.ts · sessions.query.ts · sessions.service.ts · sessions.controller.ts · sessions.module.ts
  sessions/*.test.ts · sessions.http.db.test.ts
  audit/audit.decorator.ts · audit-bag.ts · scrub.ts · entry.ts · audit.service.ts · audit.interceptor.ts
  audit/auth-events.ts · audit-logs.service.ts · audit-logs.controller.ts · catalog-check.ts · audit.module.ts
  audit/*.test.ts · audit.http.db.test.ts
  options.ts · tokens.ts · admin-server.module.ts(ADMIN_ROUTE_MODULES) · index.ts
  test-support/                              세션 · 감사 앱 부트 · 감사 프로브 컨트롤러 · 감사 행 읽기
packages/admin-server/README.md              세션 · 감사 절
.changeset/admin-server-sessions-audit.md    admin-server minor · admin-shared minor
docs/01-phase0.md · docs/HANDOFF.md · CLAUDE.md
```

## 9. 테스트 계약

### 9-1. 단위 (`pnpm check`)

- `resolveErrorResponse`: 기존 필터 분기마다 상태 · 코드 · 본문이 이전과 같다. 5xx · 처리되지 않은 예외만 `log` 를 돌려준다. 기존 필터 · http-contract 테스트가 손대지 않고 초록이다.
- `scrubSecrets` · `foldBigInts` · `serializeAuditMeta`: 대소문자 무시 · 배열 · 중첩 · Date 보존 · 순환 · 깊이 · 64 KiB 상한 · bigint 문자열 · 프로젝트 `secretKeys`.
- `buildAuditEntry`: 대상 id 우선순위(B6) · 쿼리를 뗀 경로 · 폭 자르기(코드 포인트).
- `auditEntryOfAuthEvent`: 이벤트 8종 × 갈래 — 액션 · 대상 · 상태 · 코드를 2b 오류 표 · `CommonErrorCodes` 로 고정.
- 인터셉터(가짜 감사 서비스): POST 는 201 로 기록 · 실패는 필터와 같은 상태 · 코드 · 기록이 던져도 응답은 그대로 · 성공 경로 기록 실패에도 행은 하나 · 주체 없음 · 비HTTP 는 기록 없음.
- 권한 가드 슬롯: 맵의 키로 판정 · `@SelfOnly` 보다 먼저 · 실행 중 슬롯 없음 403 · 슬롯과 `@RequirePermissions` 는 AND.
- LIKE: `!` · `%` · `_` 를 한 번만 이스케이프(`!` 를 두 번 이스케이프하지 않는다).
- admin-shared: 카탈로그 병합 · 키 · 값 겹침 · 라벨 빠짐 · 코어 라벨 덮어쓰기 · `labelOf` 의 모르는 값 · 개수 고정 · `queryBigIntSchema`(빈 문자열 · 부호 · 소수 거부) · 감사 행 · 조회 스키마 파싱.

### 9-2. DB 없는 HTTP (`pnpm check`)

- 기동 검사 넷이 각각 멈추고 문구에 빠진 것이 이름으로 나온다(인증 모듈 · 슬롯 · 카탈로그 · `@Public` + `@Audit`).
- 쿠키 없는 세션 · 감사 라우트는 401(가드가 DB 에 닿기 전에 끝난다).

### 9-3. 실 MariaDB (`pnpm test:db`, 파일마다 새 데이터베이스)

- 0008 장: up · down, DDL(컬럼 · NULL 허용 · 인덱스 · 콜레이션), 스텁 검사가 장 8개를 요구한다.
- 세션 저장소: 만료 · 폐기 행은 목록에서 빠진다 · 검색어의 `%` · `_` · `!` 를 글자 그대로 찾는다 · 대소문자 무시(UTF8_CI) · `liveOnly` 개수 · 조건부 폐기 0행.
- 세션 HTTP: 행이 `adminSessionListItemSchema` · `adminSessionSchema` 로 파싱 · `isCurrent` · 지금 세션 400 · 남의 세션 404(없는 세션과 같은 본문) · `{ revokedCount }` · 본인 "사용자 전체" 뒤 다음 요청 401 · 슬롯에 이은 키가 없는 주체 403.
- 감사 HTTP: 세션 끊기 넷이 행으로 남고 대상 · meta · `sessionNo` 가 맞다 · 프로브 라우트의 `password` · `Token`(대소문자) 이 `***` · 실패 요청이 `statusCode` · `errorCode` 와 함께 남는다 · 로그인 성공 · 실패(없는 아이디 → 행위자 NULL) · refresh · 로그아웃이 sink 로 행이 된다 · 조회의 접두 · 정확 · 반열림 · 거꾸로 기간 400 · 행위자 아이디 · 이름 JOIN.

### 9-4. 리뷰 초점 (플랜 · 리뷰어에게 넘긴다)

1. 인터셉터의 `catchError` · `mergeMap` 순서 — 바뀌면 같은 요청이 두 번 기록된다.
2. 판정을 꺼낸 뒤에도 필터의 "반드시 응답" 불변식 — 판정이 던져도 500 봉투가 나간다.
3. 404 응답으로 남의 세션과 없는 세션을 가를 수 없다 — 본문 · 상태 · 코드가 같다.
4. 기동 검사가 모듈이 빠진 조합을 모두 잡는다 — 인증 모듈 없이 세션 모듈만 import 한 앱이 뜨지 않는다.
5. 소독이 `attachAuditMeta` 경로까지 덮는다 — 가방의 모든 갈래가 `serializeAuditMeta` 하나를 지난다.

## 10. 릴리스 · 문서

- **changeset**(`.changeset/admin-server-sessions-audit.md`, admin-server **minor** · admin-shared **minor**). 첫 줄은 쓰는 쪽이 할 일: 마이그레이션 폴더에 `0008_audit_logs` 스텁 한 줄을 더한다(⑨ M1 — 빠지면 `assertAdminMigrationStubs` 가 멈춘다), `AdminServerOptions.permissions` 에 슬롯 셋을 잇고 `AdminAuditModule` · `AdminSessionsModule` 을 import 한다. 이어서 새 API 요약. admin-server 는 미발행이라 npm 에는 admin-shared 만 나간다(2a §1-4 #7).
- **admin-server README** "세션 · 감사" 절: 배선과 슬롯 맵(hangang · gise 키 예시), 세션 라우트 표와 admin-ui `useSessions` 어댑터 배선 예시, 지금 세션 거부 · 404 규칙, 고아 세션(⑫ O1 — 유예 발급이 남기는 행, "다른 세션 모두" 가 쓸어 낸다), `@Audit` · `attachAudit*` 사용법과 대상 id 규칙, 카탈로그 정의(`defineAuditCatalog`) · 기동 검사, `secretKeys` · meta 상한, `login.fail` 의 아이디 원문 위험, 실패 요청 범위(가드 거부는 남지 않는다), 보존 · 청소는 B.
- **`docs/01-phase0.md`**: §3-2 `audit` 행을 실제 옵션(`audit: { catalog, secretKeys }` — `enabled` 는 모듈 import, `sink` 는 내부, `blacklist` → `secretKeys`, 파티셔닝 없음)으로, `permissions` 행을 더한다. §2-3 아래 "PR 2c 경계 결정(2026-10-14)" 한 단락. §8 admin-server 행.
- **`docs/HANDOFF.md` · `CLAUDE.md`**: 진행 표에 2c 완료, 다음 플랜은 2d 사용자 · 역할(2a 스펙 §1-3 의 2d 행 + 이 스펙 ⑪ D1 — 세션 관리 라우트에 권한 상승 검사 · 슬롯 추가). HANDOFF "알려진 미확인" 의 닫힌 항목: 2a 이월 "2c 전" 둘(`resolveErrorResponse` · 기능 장 필수 — ⑨ M1), 2b 이월 2c 항목(목록 메서드 · `ADMIN_AUTH_EVENTS` · 같은 트랜잭션 여부 — ⑤ T1 · `emit` 기다림 — T1 이 유지 · sink 오류 문구 — B12 · 고아 세션 — ⑫ O1).

## 11. 비범위 · 보류

- 남의 세션 관리의 권한 상승 검사 · 역할 정규화 → 2d(⑪ D1). admin-server 는 Phase 2 끝까지 private 이다.
- 사용자 · 역할 · 팀 · 약관 · IP 액션(`org.*` · `setting.ipAccess.*`)과 그 슬롯 → 2d · 2e · 2f 가 코어 카탈로그 · `AdminPermissionSlot` 에 더한다.
- 감사 보존 기간 · 청소 스케줄러 · 파티셔닝 → B(hangang 도 구현하지 않았다).
- 감사 화면(admin-ui) · 행위자 목록 라우트(gise `/actors`) · 내보내기 → 필요해질 때. 카탈로그 · 행 스키마는 admin-shared 에 있다.
- 가드 거부(401 · 권한 403) 기록 → ⑧ F1. IP 차단은 2b 가 `access.blocked` 이벤트를 내고 sink 가 기록한다.
- 읽기 라우트 감사(gise 는 목록 · 단건도 남겼다) → 쓰는 쪽이 자기 GET 라우트에 `@Audit` 을 붙일 수 있다. 패키지 GET 라우트는 기록하지 않는다.
- 같은 트랜잭션 감사 · `recordInTransaction` → ⑤ T1(필요하면 하위 호환으로 더한다).
- crm API 키 주체 · `issuerUserNo` · 세션 `source`.
- 고아 세션 숨김 · 청소 → ⑫ O1. 만료 세션 행 청소 스케줄러 → B(2b §11).
- 요청마다 `lastAccessAt` 갱신 — 2b 공통 3 그대로(회전이 15분마다 새 행을 만든다).

## 12. 플랜에서 먼저 확인할 위험

플랜을 쓰기 전에 스크래치(`%TEMP%` 짧은 경로)와 실 MariaDB 11.4 에서 확인하고 결과를 §14 에 적는다.

1. **기능 모듈의 `APP_INTERCEPTOR` 가 앱 전체에 걸리고**, `catchError` 에서 `throwError(() => err)` 로 다시 던진 원래 예외를 전역 필터가 그대로 받는가(Nest 12.1.2). 봉투 인터셉터와의 선후가 모듈 import 순서로 바뀌어도 감사 행 · 응답이 같은가.
2. **전역 모듈이 낸 `ADMIN_AUTH_EVENTS` 를 `AdminAuthService` 의 `@Optional()` 주입이 받는가** — `AdminAuditModule` 을 `AdminAuthModule` 보다 뒤에 import 해도.
3. **`DiscoveryService` 로 `RouterModule` 아래 컨트롤러 · 쓰는 쪽 컨트롤러까지 훑고**, `onApplicationBootstrap` 에서 던지면 `app.init()`(테스트 하네스 `createHttpApp`)이 거부되는가. `onModuleInit` 의 인증 모듈 검사에 `ModulesContainer` 를 쓸 수 있는가(2b R9 와 같은 방식).
4. **MariaDB 11.4**: Kysely `sql` 의 `like ${p} escape '!'` 바인딩, UTF8_CI 대소문자 무시, `!` · `%` · `_` 글자 그대로 검색. JSON 별칭 컬럼(LONGTEXT + `JSON_VALID` 체크)에 문자열 INSERT 와 `readJsonColumn` 왕복, `JSON_BIN` 콜레이션 지정이 그대로 먹는가.
5. **쿼리스트링**: admin-ui `serializeParams` 의 출력(`filter[userNo]=3` · `filter[from]=…Z`)을 2a `query parser: 'extended'` 가 `filter` 객체로 풀고 `queryBigIntSchema` · `z.iso.datetime()` 이 받는가. 빈 값(`filter[userNo]=`)은 400 인가.

## 13. 선행 문서 정정

- **2a 스펙 §1-3 2c 행** "`AuditModule` · `AuditLogsModule`" → `AdminAuditModule` 하나(⑩ MD1). 2a 스펙 본문은 고치지 않고 이 절이 이긴다.
- **2b 스펙 B8** "같은 트랜잭션 감사는 2c 가 정한다" → ⑤ T1(커밋 뒤). 2b 동작은 바뀌지 않는다.
- **3c 스펙 §9** 세션 6라우트의 URL 을 이 스펙 §4-6 이 정한다.
- **Phase 0 보고(`docs/phase0-reports/be-core-auth.md` 의 감사 절)** "gise 감사 없음" 은 낡았다 — gise 는 M11a 감사(서비스 명시 호출 · 같은 트랜잭션 · 닫힌 context)가 있다(2026-10-14 실측). hangang 카탈로그는 "55 키" 가 아니라 액션 45 · 대상 12 다. 보고서 본문은 고치지 않고 이 절이 이긴다.
- **Phase 0 §3-2 표**: §10 대로.

## 14. 구현 중 정정

§12 의 확인 결과와 구현 · 리뷰에서 바뀐 것을 `R<n>` 으로 더한다. 아직 없다.
