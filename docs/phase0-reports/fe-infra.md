# Phase 0 대조 보고 — 프론트 인프라(인증·권한·상태·라우팅·API 클라이언트)

대상 루트: `kim5257-crm-v5`(crm), `ssworks-axion-admin`(axion), `ssworks-gise-home`(gise), `hangang-home`(hangang), 참고 `kim5257-project-template`(tpl). 모든 경로는 `/home/claude/phase0/` 기준. 줄 수는 `wc -l` 실측.

> 미추출로 읽지 못한 파일(결론에 영향 있는 것만): axion `utils/route-permission.ts`·`utils/post-auth-redirect.ts`(auth-guard가 import), gise `api/error.ts`(useFieldErrors가 import), 각 프로젝트의 `RouteMeta` 타입 증강 파일(env.d.ts 류 — grep 결과 `interface RouteMeta` 선언이 추출본에 없음). 아래에서 이들에 관한 서술은 import 시그니처에서 확인 가능한 범위로 한정했다.

---

## 0. 계보(누가 누구를 포팅했나)

| 파일 | 계보 근거(주석 원문) |
|---|---|
| `hangang-home/apps/admin/src/composables/usePermission.ts:4` | `ported from kim5257-crm-v5@99eb3797 packages/frontend-core/src/composables/usePermission.ts` — 수정 ① `getScope()` 제거(scope 축 없음, `/auth/me`가 scopes 미반환), ② import 경로 명시 |
| `hangang-home/apps/admin/src/api/client.ts:7` | `ported from kim5257-crm-v5@99eb3797 .../api/client.ts` — 수정 여섯(console.log 제거, 빈 handleAuthFailure 채움, 큐 진입 시 `_retry` 세움, useSSE 의존 제거, BigInt 유지, transformResponse 방어) + M7(갱신 실패 시 대기 큐 reject) |
| `hangang-home/apps/admin/src/api/auth.api.ts:4` | `ported from kim5257-crm-v5@99eb3797 .../api/auth.api.ts` — zod parse 제거, `{success,data}` 봉투 제거, `currentPassword` 필드명 |
| `hangang-home/apps/admin/src/stores/app.ts:6` | `ported from kim5257-crm-v5@99eb3797 .../stores/app.ts` — 스토어에서 라우팅 제거, SSE·systemSettings 제거, `clearSession()` 신설 |
| `hangang-home/apps/admin/src/router/index.ts:14` | `ported from kim5257-crm-v5@99eb3797 apps/base/frontend/src/router/index.ts` — 파일 기반 라우팅 폐기, `!to.meta.isPublic`, 판정을 `guard.ts`로 추출 |
| `hangang-home/apps/admin/src/main.ts:7` | `ported from kim5257-crm-v5@99eb3797 .../main.ts` — pinia를 router보다 먼저, `isReady().then()` 마운트 |
| `hangang-home/packages/shared/src/constants/permissions.const.ts:8` | `ported from kim5257-crm-v5@8589ec2a` — 구조만, 항목 새로(25키), 액션 어휘 `read/write/delete` |
| `hangang-home/packages/shared/src/schemas/permission.schema.ts:7` | `ported from kim5257-crm-v5@8589ec2a role.schema.ts:13,16` — `z.enum(폐집합)` 구조만 |
| `hangang-home/packages/shared/src/errors/error-codes.ts:4` | `ported from kim5257-crm-v5@8589ec2a error-codes.schema.ts` — 공용 9개만 + 자체 코드 |
| `hangang-home/packages/shared/src/utils/bigint-json.ts:9` | `ported from kim5257-crm-v5@8589ec2a bigint-json.utils.ts` + B9 이스케이프 |
| `ssworks-gise-home/packages/shared/src/json/bigint-json.ts:4` | `hangang-home packages/shared/src/utils/bigint-json.ts(커밋 2cc40c0)를 이식` — replacer/reviver 함수를 별도 export |
| `ssworks-gise-home/packages/shared/src/auth/permissions.ts:105-121` | crm-v5 `permissions.const.ts:130-148`의 `ALL_PERMISSION_VALUES` 주석("⚠️ 소비처가 … 명시 타입 주석을 붙이지 마라")을 거의 그대로 계승 — 명시 포팅 주석은 없으나 문장 단위로 동일 |
| axion 전반 | crm-v5와 같은 골격(client·store·main_menu·settings_menu 구조 동일)이나 포팅 주석 없음. `validateStatus: () => true`·`zod/v4`는 tpl과 동일 → tpl 계열 |

계보 요약: **crm-v5 → hangang(명시 포팅, 가장 많이 다듬음) → gise(bigint·권한 헬퍼 일부 재이식)**, **tpl → axion**(tpl은 crm-v5의 축소판). hangang은 매 파일에 "상류 대비 수정 n개"를 적어 두어 crm-v5의 결함 목록으로도 읽힌다.

---

## 1. 역할별 대조표

### 1-1. usePermission (권한 판정 훅)

| | crm | axion | gise | hangang |
|---|---|---|---|---|
| 경로 | `kim5257-crm-v5/packages/frontend-core/src/composables/usePermission.ts` | `ssworks-axion-admin/packages/frontend/src/composables/usePermission.ts` | `ssworks-gise-home/apps/admin/src/composables/usePermission.ts` | `hangang-home/apps/admin/src/composables/usePermission.ts` (+ `usePermission.test.ts` 73줄) |
| 줄 수 | 31 | 28 | 24 | 44 |
| `'*'` 처리 | `userPermissions.includes(PERMISSIONS.ALL)` → 즉시 true (정확히 `'*'` 한 문자열) | 동일 | shared `hasPermission(granted, ...)`에 위임 — 동일 규칙 | 동일. 주석 :14 "`'*'`는 접두 와일드카드가 아니다. 서버 `permission.guard.ts:60`과 같은 규칙" + 테스트 :47 |
| AND / OR | `hasPermission`=every, `hasAnyPermission`=some | 동일 | 동일 | 동일 |
| 빈 인자 | `every([])`=true / `some([])`=false (호출부가 길이 검사) | 동일 | **shared 헬퍼가 `required.length===0 → false`** (fail-closed, `permissions.ts:151-157`) | crm과 동일 비대칭. 테스트 :63 "인자가 없으면 AND는 참, OR은 거짓 — 부르는 쪽이 길이를 먼저 본다" |
| scope 축 | `getScope(resource): Scope|undefined` 있음 | 있음(`as Scope` 캐스트) | 없음 | 없음(의도적 제거) |
| 판정 로직 위치 | 훅 안 | 훅 안 | **`@gise/shared`** (`auth/permissions.ts:155-165`, 프론트·백 공용) | 훅 안 + `PermissionCheck` 인터페이스 export(:41) — 메뉴/가드가 같은 판정기를 주입받음 |
| 권한 소스 | `appStore.userInfo?.permissions` | 동일 | 동일(computed) | 동일 |

핵심 차이: 4곳 모두 **"`'*'` 단락 → every/some"** 규칙은 동일. 갈리는 지점은 (a) scope 축 유무, (b) 빈 인자 처리(gise만 fail-closed), (c) 판정 함수가 프론트 훅 안에 있는가 shared에 있는가.

### 1-2. 권한 상수 · 스키마 (shared)

| | crm | axion | gise | hangang | tpl |
|---|---|---|---|---|---|
| 상수 파일 | `packages/shared/src/constants/permissions.const.ts` 162줄 | 같은 경로 77줄 | `packages/shared/src/auth/permissions.ts` 174줄 | `packages/shared/src/constants/permissions.const.ts` 118줄 | 없음 |
| 정의 방식 | `as const` 객체 + `type Permission = typeof[keyof] \| DbEditItemPermission`(파생 유니온 합성) | `as const` 객체 + typeof 유니온 | `as const` 객체 + typeof 유니온 | `as const` 객체 + typeof 유니온 | — |
| 정본 배열 | `ALL_PERMISSION_VALUES = [...Object.values, ...DB_EDIT 파생]` (타입 주석 금지 주석 :143) | 없음(`Object.values` 즉석) | `ALL_PERMISSION_VALUES = Object.values(PERMISSIONS)` | `PERMISSION_VALUES = Object.values(PERMISSIONS) as Permission[]` | — |
| 런타임 가드 | `isPermission`, `toPermissions`(:157-163) | 동일(:71-77) | 동일(:131-143) + `hasPermission/hasAnyPermission/coversPermissions` | 없음 | — |
| zod 스키마 | `schemas/role.schema.ts:21 permissionSchema = z.array(z.enum(ALL_PERMISSION_VALUES))` | `role.schema.ts:9 z.array(z.enum(Object.values(PERMISSIONS) as [string,...]))` — **string으로 넓힘** | `permissionSchema = z.enum(ALL_PERMISSION_VALUES)`, `permissionListSchema = z.array(...)` 상수 파일 안에 동거 | `schemas/permission.schema.ts:31 z.array(z.enum(PERMISSION_VALUES as [Permission,...]))` — 타입 유지 | — |
| 액션 어휘 | create/read/update/delete/export/manage/check 등 혼합, 키 `domain.sub:action` | `resource:action` 단일 축(점 없음) | `domain[.sub]:action` (manage/moderate/promote 등 도메인 동사) | `resource:read\|write\|delete` 로 통일 (12 리소스 × 2~3) + `PERMISSION_RESOURCES` 배열 | — |
| scope 상수 | `scopes.const.ts` 63줄: `SCOPES{own,team,all}`, `SCOPE_RESOURCES` 16개, `RawScopes/ExpandedScopes`, `expandScopes()` (기본 own) | 35줄: 동일 구조, 리소스 5개 | 없음 | 없음 | — |
| zod 버전 | `zod` | `zod/v4` | `zod` | `zod` | `zod/v4` |

프론트·백 공유 방식: 4곳 모두 pnpm workspace 패키지(`@crm/shared`·`@axion-admin/shared`·`@gise/shared`·`@hangang/shared`)를 배럴 import. hangang `index.ts:4`는 "프레임워크에 의존하지 않는다 — NestJS·Vue import 금지"를 명시하고 `BusinessException` 등을 shared에서 배제(`error-codes.ts:8-13`). gise는 `BusinessError`(plain Error 상속, `errors/codes.ts:96`)와 `httpStatusFor()` 코드→상태 테이블을 shared에 둠. gise `index.ts:1-2` "package.json exports 맵에 하위 경로가 없어 내부 파일 직접 import는 실패" — 반면 crm `frontend-core/package.json`은 `"./*": "./src/*"`로 파일 단위 import 허용(`sessions.api.ts:1 '@crm/frontend-core/api/client.ts'`).

### 1-3. 응답 envelope · 에러 코드 · BigInt

| | crm | axion / tpl | gise | hangang |
|---|---|---|---|---|
| 성공 envelope | `{success:true, data}` (`response.schema.ts:10-25`, data 없는 오버로드 있음) | 동일, data 필수 오버로드만 | **봉투 없음**(성공은 본문 그대로; `client.ts:9`) | **봉투 없음**(`auth.api.ts:10`) |
| 실패 envelope | `{success:false, code, message, details?}` | `{success:false, code, message}` (details 없음) | `{statusCode, code, message, details?}` (`client.ts:10`) | `{statusCode, code: ErrorCode, message, details?}` (`client.ts:34`) |
| 에러 코드 정의 | `ErrorCodes` as const 객체, 값=키 (`ERR_COMMON_*` 9 + 도메인) 88줄 | 동일 방식, 186줄(도메인 매우 많음) / tpl 14줄 | `ERROR_CODES` 키≠값(`VALIDATION_FAILED: 'ERR_VALIDATION_FAILED'`), `HTTP_STATUS_BY_CODE: Record<ErrorCode, number>` 로 상태 매핑 강제 | `ErrorCodes` 값=키 + `ERROR_CODE_VALUES`; 상태 매핑은 api 쪽 `status-map.ts`(주석 :41, 미추출) |
| BigInt | `bigint-json.utils.ts` 21줄, `BigInt(n)` 래퍼, 이스케이프 없음 | 22줄, 동일 | `json/bigint-json.ts` 55줄: hangang B9 이식 + `bigintJsonReplacer/Reviver` 함수 export | `utils/bigint-json.ts` 92줄: **B9 — 충돌 문자열 `\` 이스케이프** (`ESCAPE_NEEDED_PATTERN`, 한 겹 벗김) |

### 1-4. API 클라이언트

| | crm `frontend-core/src/api/client.ts` 153줄 | axion `packages/frontend/src/api/client.ts` 120줄 (+spec 72) | gise `apps/admin/src/api/client.ts` 114줄 | hangang `apps/admin/src/api/client.ts` 333줄 (+test 519) | tpl 71줄 |
|---|---|---|---|---|---|
| baseURL | `VITE_API_BASE_URL \|\| '/api'` | 동일 | `'/api/v1'` 고정 | `VITE_API_BASE_URL \|\| '/api/v1'` | `'/api'` |
| `validateStatus` | 기본(4xx/5xx reject) | **`() => true`** (에러 인터셉터 사실상 미사용, 성공 핸들러에서 401 처리) | 기본 | 기본 | `() => true` |
| paramsSerializer | 커스텀(boolean→'1'/'', Date→ISO, 배열, 중첩객체 `k[sub]`) | 동일 | **없음**(axios 기본) | 동일(crm 복사) | 동일 |
| transformResponse | `parseJSON(data)` 무조건 | 동일 | 문자열·비어있지 않을 때만, try/catch 원문 반환 | 동일(gise와 같은 방어) | 무조건 |
| request 인터셉터 | `X-SSE-Client-Id` 헤더(`useSSE` 의존) + FormData/Blob 제외 stringifyJSON | FormData/Blob 제외 stringifyJSON | 동일 | FormData면 **`Content-Type` 헤더 삭제**(axios 1.19 formDataToJSON 회피, :190-200) | axion 동일 |
| 401 refresh 방식 | `isRefreshing` 플래그 + `pendingRequestList` 큐(resolve만), `_retry` 플래그, `/auth/refresh` 자신 401은 `handleAuthFailure()` | `isRefreshing` 단일 플래그, 큐 없음(동시 401은 그대로 반환), `NO_RETRY_PATHS=['/auth/login','/public/download-links']` 경로 판정 | **`refreshInFlight` 공유 Promise 합류**(`refreshOnce()`), `_retry`, 실패 통지는 공유 promise `.catch` 한 곳 | crm 큐 방식 + `{resolve, reject}` 큐, 실패 시 `rejectPendingRequests()`, 큐 진입 전 `_retry=true` | 없음 |
| 인증 실패 처리 | `handleAuthFailure(){ // TODO }` **빈 함수** | 없음(catch에서 원 응답 반환) | `onAuthFailure(handler)` 등록 API → `main.ts:13`에서 `router.replace('/login')` 등록 | 동적 import로 `useAppStore().clearSession()` + `router.currentRoute===START_LOCATION`이면 이동 안 함, 아니면 `/login?redirect=` | 없음 |
| IP 차단 | `ERR_IP_NOT_ALLOWED` && url≠`/auth/login` → 동적 import `useAppStore().setIpBlocked(clientIp)` | 없음 | 없음 | 동일하되 `/auth/login` 제외 없음(`IpBlockedDialog`를 `App.vue:35` 최상위에 둠) | 없음 |
| 그 외 | — | 403 `ERR_ACCOUNT_SUSPENDED` → `window.dispatchEvent('account-suspended')` | — | `api.{get,post,patch,put,del}` 얇은 래퍼, `del()`이 body 실음(재인증 비밀번호) | — |
| 순환 의존 회피 | `import('../stores/app.ts')` 동적 | 정적 의존 없음 | 콜백 등록(`onAuthFailure`) — 의존 역전 | 동적 import 둘(`stores/app`, `router/index`) | — |

### 1-5. auth / me / sessions API

| | crm | axion | gise | hangang |
|---|---|---|---|---|
| 파일 | `frontend-core/src/api/auth.api.ts` 30, `sessions.api.ts` 38 | `api/auth.ts` 141, `api/sessions.ts` 48 | `api/me.ts` 33 (auth 호출은 `stores/app.ts`가 `apiClient` 직접 호출) | `api/auth.api.ts` 51 |
| me() 검증 | `getMeRespSchema.parse(data)` (zod) | `data` 그대로(타입만) | `toPermissions()`로 모르는 권한 **필터**(store :68) | 타입만(`MeResp` 6필드 수제 인터페이스) |
| 로그인 응답 | `ApiResp` | `ApiResp`(봉투 반환, 429 구분) | void(실패는 throw) | `{isPasswordChangeRequired}` |
| 세션 API | findAll/findMine/revoke/revokeByUser/revokeMine, zod parse | 동일 5개, 로컬 `ApiEnvelope<T>` 타입 재정의(:8) | `fetchMySessions/revokeMySession/revokeMyOtherSessions` (`/auth/me/sessions*`) | 없음(세션 패널은 `org.users`에 흡수, `permissions.const.ts:54`) |
| 세션 스키마 | `session.schema.ts` 68줄: `device{browser,os,deviceType}`, `source: web\|api`, `apiKeyName` | 38줄: `deviceInfo: string` 단일 | `types/session.ts` 9줄 `SessionTableRow{sessionNo, userAgent, ipAddress?, isCurrent?, lastActiveAt, expireAt}` | — |

### 1-6. 스토어

| | crm `frontend-core/src/stores/app.ts` 114 | axion `stores/app.ts` 141 (+spec) | gise `stores/app.ts` 148 | hangang `stores/app.ts` 132 (+test 111) · `session-error.ts` 22 | tpl 8 |
|---|---|---|---|---|---|
| 상태 | initialized, authorized, userInfo, ipBlocked, blockedIp | initialized, authorized, userInfo, `suspension`(computed) | initialized, authorized, userInfo, **permissionDenied(403)**, authError, passwordChangeRequired, displayName | initialized, authorized, userInfo, ipBlocked, blockedIp | 빈 state |
| `initialize()` 부수효과 | **스토어가 `useRoute/useRouter`(auto-import)로 `/login`↔`/` 리다이렉트** + SSE connect + `useSystemSettingsStore().load()` | `{redirect}` 옵션; 가드는 `redirect:false`로 호출(START_LOCATION 경합 주석 :26-32); DEV 목 인증(`localStorage dev_mock_auth`) | **라우팅 없음**; 401/403 구분(`permissionDenied`) | **라우팅 없음**(수정 ①); `clearSession()` 추가 | — |
| 실패 판정 | `ErrorCodes.ERR_INVALID_TOKEN/EXPIRED_TOKEN` 외에는 `console.warn` | 봉투 `success` 필드 | `HttpStatusCode.Forbidden` → permissionDenied | 전부 삼킴(미인증이 정상경로) | — |
| login 후 | `initialize()` | 실패 봉투면 initialize 생략 | `!authorized → throw Error(authError)` | `!authorized → throw SessionNotEstablishedError` (Secure 쿠키 http 수신 케이스) | — |
| logout | logout API → `initialize()` 재호출(주석: 무의미한 401+refresh 2회) | 동일 | 로컬 상태만 비움, 실패 warn | `clearSession()`만(재초기화 안 함) | — |
| 기타 스토어 | `system-settings.ts` 135줄(timezone·브랜딩·appTitle·logo etag) — 도메인 필드 다수(`lateThresholdTime`, `memoSubmitKey`, `deviceCallEnabled`) | 없음 | `stores/index.ts` `createPinia()` | — | — |

### 1-7. 라우터 · 가드 · 메뉴 연결 방식

| | crm | axion | gise | hangang | tpl |
|---|---|---|---|---|---|
| 라우트 소스 | `vue-router/auto-routes`(unplugin-vue-router ^0.15) + `virtual:generated-layouts`(vite-plugin-vue-layouts-next ^1.0) — `router/index.ts` 77줄 | 동일 가상 모듈 사용(`router/index.ts:7-9`) — 단 package.json에 unplugin-vue-router 미기재(추출본 기준), `vue-router ^5.0.3` | 동일(unplugin ^0.15, layouts-next ^2.1) — `index.ts` 31줄 | **수제 `routes.ts` 375줄**(RouteRecordRaw[], 지연 import), 레이아웃은 `meta.layout` — `vue-router ^4.5.1` | auto-routes + `typed-router.d.ts` 70줄(생성물) |
| typed-router | crm `apps/base/frontend`에 typed-router.d.ts 미추출(있을 것으로 추정 불가 — 미확인) | 미추출 | 미추출 | 해당 없음 | 있음 |
| 가드 위치 | `index.ts:39-68` 인라인 | `auth-guard.ts` 104줄 순수 함수 `authGuard(to, appStore)` (+spec 14 케이스) | `guards.ts` 79줄 `createAuthGuard(deps)` **의존성 주입 팩토리** + `createTitleGuard(appTitle)` | `guard.ts` 64줄 `resolveGuard(to, ctx)` 순수 함수 (+test) | 없음 |
| 가드 순서 | init → `needNonAuth&&authorized → '/'` → 미인증&&`path!=='/login'` → `/login?redirect` → permissions(AND)/anyPermissions(OR) → `/403` | `meta.public` 조기 반환 → init(`redirect:false`) → 미인증: `/`면 `/intro`, 아니면 `/login?redirect` → 인증됨&&`isPublicAuthRoute` → `takePostAuthRedirect()??'/'` → `canEnterRoute(permissions, meta, {isPartner})` 실패 시 **`/`** | init → 미인증: `/login` 통과, `permissionDenied`면 `/403`, 아니면 `/login?redirect` → 인증됨&&`/login` → `/` → `isPasswordChangeRequired` → `/password` 강제 → AND/OR → `/403` | init → `needNonAuth` → `!isPublic` 미인증 → **명시 선언 검사(isPublic/selfOnly/permissions/anyPermissions 전무 → `/403`, fail-closed)** → AND/OR → `/403` | — |
| 공개 라우트 판정 | 경로 문자열 `'/login'` | `PUBLIC_AUTH_ROUTES` 배열 정확 일치(`public-routes.ts`) + `meta.public` 별도 축 | 경로 문자열 `'/login'`, `'/403'`, `PASSWORD_CHANGE_PATH` | `meta.isPublic` / `meta.needNonAuth` / `meta.selfOnly` | — |
| meta 키 | `needNonAuth`, `permissions`, `anyPermissions`, `title` | `public`, `permissions`, `anyPermissions`, `partnerOnly`(route-permission.ts 미추출), `layout` | `permissions`, `anyPermissions`, `title`, `layout` | `isPublic`, `needNonAuth`, `selfOnly`, `permissions`, `anyPermissions`, `title`, `layout`, **`menu:{group?, icon}`** | — |
| 메뉴 소스 | **별도 data**: `data/main_menu.ts` 145줄(`permission?` 단일 + `anyPermissions?`, `subMenu`), `data/settings_menu.ts` 131줄 | 별도 data: `main_menu.ts` 117(+`partnerOnly`), `settings_menu.ts` 153(서버 `assertWildcard`와 맞추려 `PERMISSIONS.ALL`을 메뉴에만 거는 항목 다수) | 별도 data: `data/main_menu.ts` 202줄 + `filterMainMenu(items, granted)` 재귀 필터(shared 헬퍼 사용), `isPending` 플래그 | **라우트에서 파생**: `router/menu.ts` 129줄 `buildMenu(routes)`(최상위만, `meta.menu` 있는 것만, `MENU_GROUPS` 4개) + `filterMenu(nodes, check: PermissionCheck)` | — |
| 메뉴↔가드 정합 | 각자 권한 키 보유(갈릴 수 있음) | 갈림을 주석으로 관리(`settings_menu.ts:39-46`) | 각자 보유; `menu-routes.test.ts`(미추출)가 라우트 존재 검사 | 출처 하나 — `menu.test.ts:34` "항목의 권한이 그 라우트의 meta와 글자 그대로 같다" | — |
| 권한 키 생성 | 상수 직접 참조 | 상수 직접 참조(`definePage`) | 상수 직접 참조 | `permissionOf(resource, action)` — 카탈로그 조회, 없으면 **모듈 로드 시 throw**(`routes.ts:52-59`) | — |
| 부모/자식 meta | — | — | — | `/settings` 부모 `anyPermissions` = 자식 `permissions` 합집합(vue-router 얕은 병합 대응, :281-291); 자식 path 절대경로; `flatten-routes.ts` 26줄 | — |
| afterEach title | `useSystemSettingsStore().appTitle` | 없음 | `createTitleGuard('기세녀 관리자')` | `SITE_NAME`(`constants.ts` 7줄 `'통합 관리자'`) + `site-identity.test.ts`가 index.html `<title>`과 대조 | — |
| 청크 404 복구 | `index.ts:21-37` 인라인(`location.assign(to.fullPath)`) | 없음 | 없음 | `recovery.ts` 69줄: `reloadTarget(router, fullPath)`=`router.resolve().href`(base 포함), `clearFlagWhenSettled` 양팔 | — |
| 기타 | — | `scrollBehavior`(해시 스크롤) | `safe-redirect.ts` 19줄(`//`·`\` 차단 오픈리다이렉트 방어) | — | — |
| RouteMeta 타입 증강 | 미추출 | 미추출 | 미추출 | 미추출(`guard.test.ts`만 `RouteMeta` 언급) | — |

### 1-8. 권한 카탈로그 프레젠테이션(역할 편집 화면용)

| | crm `data/permission_list.ts` 111 | axion `data/permission_matrix.ts` 98 | gise `data/permission-catalog.ts` 83 | hangang |
|---|---|---|---|---|
| 형태 | `permissionGroups[]{categoryName, actionSet('crud'\|'readonly'\|...), permissionList[{permissionId, permissionName, excludeActions?}]}` — 셀 = `${id}:${action}` | `permissionMatrix[]{id,label,columns[{action,label}],rows[{resource,label}]}` + `isScopeResource()` | `PERMISSION_LABELS` (`satisfies Record<CatalogPermission,string>` — 라벨 누락을 타입으로 잠금) + `PERMISSION_CATALOG` = 도메인 접두로 자동 그룹핑 | 프론트 data 없음; shared `PERMISSION_RESOURCES`(12)가 매트릭스 행 |
| 권한 정본과의 관계 | 문자열 조합(정본과 갈릴 수 있음) | 문자열 조합(주석 :8 "존재 여부의 원본은 PERMISSIONS") | `ALL_PERMISSION_VALUES`에서 파생(정본과 갈릴 수 없음) | 정본에서 파생 |

### 1-9. 그 외 composables(공용화 가치)

| 파일 | 줄 | 판단 |
|---|---|---|
| crm `composables/useQuerySyncedFilter.ts` 275 | `utils/queryCodec`(미추출) 의존, `filterSpec` 코덱 기반, debounce·`flushUrl`·`onInbound`·`ownPath` 캡처. 설계 문서 참조. | **A 후보**(범용) — 단 `queryCodec` 동반 필요, 기술 부채 주석(TDZ·상세 라우트 한계) 그대로 옮겨야 함 |
| gise `composables/useRouteQuerySync.ts` 74 | 콜백 3개(`read/toQuery/reload`) 주입 최소형, `JSON.stringify` 금지 게이트 대응 | 같은 문제의 경량 대안. 둘 중 하나로 통일 필요 — 코덱형(crm)이 타입 안전, 콜백형(gise)이 의존 0 |
| gise `useDirtyGuard.ts` 22 | `window.confirm` + beforeunload + `onBeforeRouteLeave` | **A** — 의존 vue/vue-router뿐 |
| gise `useFieldErrors.ts` 148 | `ERROR_CODES.VALIDATION_FAILED` + `details.issues[{path,message}]` 형식, `payload.` 접두 제거, provide/inject 소비 추적 | **B/X 경계** — 서버 검증 이슈 형식과 `@/api/error`(미추출)에 결합. 형식(issues 배열)을 패키지 계약으로 못박으면 A 가능 |
| crm `useTableSelection.ts` 119 | Set+shallowRef 반전 선택, 의존 vue만 | **A** |
| crm `useUserPreferences.ts` 69 | `userPreferencesApi`·`UserPreferences` 타입(`@crm/shared`) 의존, 모듈 스코프 싱글턴 | **B** — API 엔드포인트·타입 주입 없이는 못 옮김 |

---

## 2. 정본 후보와 이유

| 역할 | 정본 후보 | 이유 | 보완할 것 |
|---|---|---|---|
| 권한 판정 함수 | **gise `packages/shared/src/auth/permissions.ts:146-174`** (`hasPermission/hasAnyPermission/coversPermissions`, `granted: readonly string[]`) | 프론트·백이 같은 함수를 쓰는 유일한 구현. 빈 인자 fail-closed. `coversPermissions`(지배 판정)까지 있어 역할 편집 화면의 권한 상승 방지에 쓸 수 있음 | hangang 테스트(`usePermission.test.ts`)의 5케이스를 옮겨 붙이되 "빈 인자 AND=true" 케이스는 gise 규칙(false)으로 갱신. hangang `PermissionCheck` 인터페이스를 함께 export |
| usePermission 훅 | gise 훅(shared 위임) + hangang의 `PermissionCheck` export | 훅에는 로직이 없어야 함(gise 방식) | scope는 옵션 확장(§3) |
| 권한 상수 구조 | crm/gise의 `ALL_PERMISSION_VALUES`(타입 주석 없이 추론) + hangang `PERMISSION_RESOURCES` + gise `permissionSchema = z.enum(ALL_PERMISSION_VALUES)` | hangang `permission.schema.ts:24-33`이 지적한 대로 `[Permission,...]` 타입을 잃지 않는 형태. gise는 정본 배열·zod·Set 세 소비처를 한 파일에 둬 갈림 원천 차단 | 카탈로그 자체는 프로젝트 소유 — 패키지는 **팩토리**만(§3) |
| API 클라이언트 | **hangang `apps/admin/src/api/client.ts`** | crm 대비 결함 6+1개 수정(빈 handleAuthFailure, 큐 reject, `_retry` 재진입, 방어적 parse, FormData Content-Type), 519줄 테스트 | 순환 의존 회피를 hangang 동적 import 대신 **gise `onAuthFailure()` 콜백 등록**으로 교체(테스트 가능·라우터/스토어 무의존). refresh 합류는 gise `refreshInFlight` 공유 Promise가 큐보다 단순하며 동등(둘 다 1회 통지). `paramsSerializer`는 crm 것 유지. `ErrorResp` 형태는 `{statusCode, code, message, details?}`(hangang/gise, 봉투 없음)로 — 단 crm/axion 백엔드는 `{success,data}` 봉투이므로 envelope 어댑터 옵션 필요(§3) |
| 스토어 | **hangang `stores/app.ts`**(라우팅 없음) + gise의 `permissionDenied`(401/403 구분) + `SessionNotEstablishedError` | crm은 스토어가 `useRoute/useRouter`를 auto-import로 부르고 리다이렉트까지 해 순환·테스트 불가·가드와 판단 중복(axion이 `{redirect:false}` 우회로 인정). hangang은 순수 상태 | `userInfo` 형태를 제네릭 `TMe`로. `ipBlocked`는 옵션 |
| 라우터 가드 | **gise `router/guards.ts` `createAuthGuard(deps)`** 의존성 주입 형태 + **hangang `guard.ts`의 fail-closed 명시 선언 검사** + axion의 `isPublicAuthRoute` 배열 방식 대신 hangang `meta.isPublic/needNonAuth/selfOnly` | gise는 store·router 무의존(deps 주입)이라 패키지에 그대로 들어감. hangang은 "meta 없으면 403"으로 새 라우트 실수를 잡음 | gise는 `/login`·`/403`·`/password` 문자열을 가드 안에 박음 → deps로 옮김 |
| 메뉴 | **hangang `router/menu.ts`** (`buildMenu(routes)`/`filterMenu(nodes, check)`) | 메뉴가 라우트 meta에서 파생돼 메뉴↔가드 권한이 구조적으로 같음(`menu.test.ts:34`). crm/axion/gise는 별도 data라 갈림 가능(axion `settings_menu.ts` 주석이 그 비용을 보여줌) | 최상위만 순회는 hangang 요구 2.2 사정 — 패키지는 `depth` 옵션. `MENU_GROUPS` 주입. 하위 인페이지 메뉴(`settings_menu`)는 hangang 구조(부모 `children` + `anyPermissions` 합집합)로 대체 가능하나 합집합 검증 헬퍼 필요 |
| 라우트 정의 | hangang 수제 `routes.ts` 방식 **또는** unplugin `definePage` — 정본 정하기 어려움 | 4곳 중 3곳(crm·axion·gise)이 파일 기반 라우팅, hangang만 수제. 파일 기반은 `meta.menu` 파생·라우트 표 테스트가 어렵고(axion `auth-guard.ts:13-17` 가상 모듈 테스트 불가 문제), 수제는 페이지 추가 시 표 수정 필요 | 패키지는 **`RouteRecordRaw[]`를 받는 것만** 보장하고, 파일 기반 프로젝트는 `routes` from `vue-router/auto-routes`를 넘기면 됨(`setupLayouts(routes)` 결과도 RouteRecordRaw[]). `buildMenu`가 `meta.menu`를 읽으므로 `definePage({meta:{menu:{...}}})`로도 동작 |
| BigInt JSON | **gise `json/bigint-json.ts`** | hangang B9 이스케이프 + replacer/reviver 함수 export(Express/Nest 배선용) | 그대로 `@ssworks/admin-shared`로 |
| 에러 코드 | gise `errors/codes.ts` 구조(`Record<ErrorCode, number>` 상태 매핑 강제) + hangang 공용 코드 목록 | 코드→상태 매핑 누락을 컴파일이 잡음. `BusinessError`가 plain Error라 브라우저 안전 | 값 명명은 hangang(`ERR_COMMON_*`, 값=키)과 gise(`ERR_*` 짧게) 중 택일 — crm·axion·hangang 3곳이 `ERR_COMMON_*` |
| 청크 404 복구 | hangang `router/recovery.ts` | base 포함 URL(`router.resolve().href`), 거부 팔 정리, 테스트 있음 | 그대로 A |
| 세션 API/타입 | crm `session.schema.ts`(device 파싱·source 축) | 가장 풍부 | 도메인 필드(`apiKeyName`)는 옵션화 |

---

## 3. 확장점(패키지가 주입받는 API 형태)

### 3-1. 권한 (`@ssworks/admin-shared`)

```ts
// 프로젝트 shared 가 호출
export function definePermissions<const T extends Record<string, string>>(
  catalog: T & { ALL: '*' },
  opts?: { extraValues?: readonly string[] },   // crm 의 db.edit.* 파생값
) {
  type Permission = T[keyof T] | (typeof opts extends { extraValues: infer E } ? E[number] : never);
  const values = [...Object.values(catalog), ...(opts?.extraValues ?? [])]; // 타입 주석 금지
  const set = new Set<string>(values);
  return {
    PERMISSIONS: catalog, ALL_PERMISSION_VALUES: values,
    permissionSchema: z.enum(values as [Permission, ...Permission[]]),
    permissionListSchema: z.array(...),
    isPermission: (v: string): v is Permission => set.has(v),
    toPermissions, hasPermission, hasAnyPermission, coversPermissions, // gise 구현, '*' 단락
  };
}
```
- scope 축은 별도 `defineScopes(resources)`(crm/axion `expandScopes` 그대로)로 분리. 없는 프로젝트는 호출 안 함.

### 3-2. 판정 훅 (`@ssworks/admin-ui`)

```ts
export interface PermissionCheck<P extends string = string> {
  hasPermission(...p: P[]): boolean; hasAnyPermission(...p: P[]): boolean;
}
export function createUsePermission<P extends string>(
  granted: () => readonly string[],          // () => useAppStore().userInfo?.permissions ?? []
  impl: Pick<ReturnType<typeof definePermissions>, 'hasPermission'|'hasAnyPermission'>,
): () => PermissionCheck<P>
```

### 3-3. 라우터·가드·메뉴

```ts
export function createAdminGuard<P extends string>(deps: {
  ensureInitialized(): Promise<void>; isAuthorized(): boolean;
  isPermissionDenied?(): boolean;           // gise 403
  isPasswordChangeRequired?(): boolean;     // gise /password
  check: PermissionCheck<P>;
  paths?: { login?: string; forbidden?: string; passwordChange?: string; home?: string }; // 기본 '/login','/403','/password','/'
  failClosed?: boolean;                     // hangang: 명시 선언 없으면 forbidden
  onUnauthorizedHome?: () => RouteLocationRaw | void; // axion '/intro'
}): NavigationGuard

export function createTitleGuard(appTitle: string | (() => string)): NavigationHookAfter  // gise + crm(systemSettings 동적)
export function installChunkRecovery(router: Router, storage?: Storage): void             // hangang recovery.ts

export function buildMenu<P extends string>(routes: readonly RouteRecordRaw[], opts: {
  groups: readonly { key: string; title: string }[]; depth?: 1 | 'all';
}): MenuNode<P>[]
export function filterMenu<P extends string>(nodes, check: PermissionCheck<P>): MenuNode<P>[]
export function flattenRoutes(routes): RouteRecordRaw[]
export function assertParentAnyPermissionsCoverChildren(routes): void   // hangang route-meta.test 계약을 런타임/테스트 헬퍼로
```
- `RouteMeta` 증강은 패키지가 `declare module 'vue-router' { interface RouteMeta { isPublic?, needNonAuth?, selfOnly?, permissions?: string[], anyPermissions?: string[], title?, layout?, menu?: {group?, icon} } }`로 제공하되 `permissions`의 원소 타입은 `string`으로 둘 수밖에 없음(모듈 증강은 제네릭 불가) → 프로젝트가 `permissionOf()`(hangang `routes.ts:52`)류 헬퍼로 좁힘.

### 3-4. API 클라이언트

```ts
export function createApiClient(opts: {
  baseURL: string;
  refreshPath?: string;                     // '/auth/refresh'
  noRetryPaths?: string[];                  // axion NO_RETRY_PATHS
  envelope?: 'none' | 'success-data';       // hangang/gise vs crm/axion
  onAuthFailure?: () => void;               // gise 콜백. 없으면 등록 API 사용
  onError?: (ctx: { code?: string; status?: number; details?: unknown }) => void; // IP 차단·정지 계정 훅
  bigint?: { parse: typeof parseJSON; stringify: typeof stringifyJSON }; // 기본 admin-shared
}): { apiClient: AxiosInstance; api: ThinWrapper; onAuthFailure(handler): void }
```
- `ErrorResp` 정규화: `{ status, code, message, details }` 한 형태로 노출하고 봉투 유무는 `envelope`가 흡수.

### 3-5. 스토어

```ts
export function createAppStore<TMe extends { permissions: readonly string[] }>(opts: {
  fetchMe(): Promise<TMe>; login(dto): Promise<unknown>; logout(): Promise<void>;
  isForbidden?(e: unknown): boolean;        // gise permissionDenied
  sanitize?(me: TMe): TMe;                  // toPermissions 필터
}) // 반환: initialized, authorized, userInfo: Ref<TMe|null>, permissionDenied, clearSession, initialize, login(throw SessionNotEstablishedError), logout
```

---

## 4. A/B/X 배정

| 파일(정본 기준) | 배정 | 비고 |
|---|---|---|
| gise `shared/src/auth/permissions.ts`(판정 함수·`isPermission`·`toPermissions`·zod 팩토리 부분) | **A** `admin-shared` | 카탈로그 객체 자체는 B(프로젝트 소유) |
| crm/axion `scopes.const.ts`(`expandScopes`, 타입) | **A**(옵션 모듈) | `SCOPE_RESOURCES` 목록은 B |
| hangang `permission.schema.ts` / crm `role.schema.ts`의 `permissionSchema` | A로 흡수(팩토리 반환값) | — |
| gise `json/bigint-json.ts` | **A** | crm/axion/tpl/hangang 판은 폐기 |
| gise `errors/codes.ts` 구조(`httpStatusFor`, `BusinessError`) + 공용 코드 10개 | **A** (공용 코드) / 도메인 코드 **B** | `ErrorCode` 유니온을 프로젝트가 확장할 수 있게 `defineErrorCodes(common ∪ project)` |
| crm `response.schema.ts`(`createSuccessRespSchema`, `ApiResp`) | **A**(envelope 옵션 사용 프로젝트만) | hangang/gise는 미사용 |
| crm `session.schema.ts` / gise `types/session.ts` | **B** | 세션 필드가 프로젝트마다 다름(device 파싱 vs userAgent) |
| crm `auth.schema.ts` `getMeRespItemSchema` / hangang `MeResp` / gise `AdminUserInfo`(`types/admin.ts`) | **B** | `TMe` 제네릭으로 주입 |
| hangang `api/client.ts`(+gise onAuthFailure·refreshInFlight) | **A** `admin-ui/api` | 도메인 훅(IP 차단·정지)은 `onError` 콜백으로 |
| crm `auth.api.ts`, `sessions.api.ts`; axion `auth.ts`, `sessions.ts`; gise `me.ts`; hangang `auth.api.ts` | **B** | 엔드포인트·검증 방식이 다름. 패키지는 `createAuthApi({paths, parseMe})` 템플릿 정도 |
| hangang `stores/app.ts` + `session-error.ts` + gise `permissionDenied` | **A**(`createAppStore<TMe>`) | crm의 SSE·systemSettings 호출은 프로젝트 래퍼(B)에서 |
| crm `stores/system-settings.ts` | **X** | `lateThresholdTime`·`memoSubmitKey`·`deviceCallEnabled` 등 CRM 도메인. 브랜딩(`appTitle/logoUrl`) 부분만 별도 A 후보 |
| gise/crm `stores/index.ts`(createPinia) | **B**(템플릿 3줄) | — |
| gise `router/guards.ts` + hangang `guard.ts` 병합 | **A**(`createAdminGuard`) | — |
| axion `router/auth-guard.ts`, `public-routes.ts` | **B/X** | `/intro`·`takePostAuthRedirect`·`partnerOnly`·`/reset-password` 예외는 axion 특화. `isPublicAuthRoute` 배열 방식은 `meta.isPublic`으로 대체 |
| hangang `router/menu.ts`, `flatten-routes.ts` | **A** | `MENU_GROUPS`는 B |
| hangang `router/recovery.ts` | **A** | — |
| gise `router/safe-redirect.ts` | **A** | 19줄, 의존 0 |
| hangang `router/routes.ts` | **B**(템플릿: login·dashboard·403·catch-all 4행 + `permissionOf` 헬퍼) | 나머지 행은 X |
| crm/axion `router/index.ts`, gise `router/index.ts` | **B**(템플릿) | `createRouter` + 가드 배선 15줄 내외 |
| crm/axion/gise `data/main_menu.ts`, `settings_menu.ts` | **X** (라우트 파생 메뉴로 대체) | 전환 불가 프로젝트는 `MainMenuItem` 타입만 A |
| crm `data/permission_list.ts`, axion `data/permission_matrix.ts` | **X** | gise `permission-catalog.ts`의 **자동 그룹핑 + `satisfies Record<CatalogPermission,string>` 라벨 잠금** 패턴만 A(`buildPermissionCatalog(values, groups)`) |
| hangang `constants.ts`(`SITE_NAME`), `site-identity.test.ts` | **B** | 테스트는 템플릿에 포함 가치 있음(index.html title 대조) |
| crm `useQuerySyncedFilter.ts`(+`utils/queryCodec` 미추출) | **A** | gise `useRouteQuerySync.ts`는 X(A로 대체) — 단 gise의 `JSON.stringify` 금지 게이트가 있으면 코덱 구현 확인 필요 |
| gise `useDirtyGuard.ts`, crm `useTableSelection.ts` | **A** | — |
| gise `useFieldErrors.ts` | **A 조건부** | `{code:'ERR_VALIDATION_FAILED', details:{issues:[{path,message}]}}` 형식을 admin-shared 계약으로 승격할 때만. `payload.` 접두 제거는 옵션 |
| crm `useUserPreferences.ts` | **B** | API·타입 주입 필요 |
| tpl `typed-router.d.ts`, `router/index.ts`, `stores/app.ts`, `api/client.ts` | **X** | 모두 상위 프로젝트에 포함됨 |

---

## 5. 걸림돌

1. **순환 의존 store ↔ router ↔ api** — crm `stores/app.ts:11-12`가 `useRoute/useRouter`를 auto-import로 호출하고 `router/index.ts:8`이 store를 import, `client.ts:105`가 store를 동적 import. hangang은 `client.ts:108-111`에서 store·router 둘 다 동적 import. gise는 `onAuthFailure()` 등록으로 client→router 간선을 끊었고 store는 router를 모른다(유일하게 순환 0). 패키지에서는 gise 방식(콜백 등록) + 가드 deps 주입으로만 성립. 또한 hangang `main.ts:13-15`가 지적한 **pinia를 router보다 먼저 등록**해야 하는 순서 제약을 `installAdmin(app)` 같은 단일 진입점으로 강제할 필요.

2. **RouteMeta 모듈 증강의 제네릭 불가** — `permissions: Permission[]`를 프로젝트 타입으로 좁히려면 각 프로젝트가 자기 `declare module 'vue-router'`를 써야 하는데 패키지도 같은 인터페이스를 증강하면 **중복 선언 충돌**(동일 프로퍼티 다른 타입은 컴파일 오류). 패키지는 `string[]`로 두고 프로젝트가 좁히지 않거나, 패키지가 증강을 아예 하지 않고 `AdminRouteMeta<P>` 타입 + `defineAdminRoute<P>()` 헬퍼만 제공하는 두 선택지. 4개 프로젝트의 증강 파일이 추출본에 없어 현재 어떤 선언인지 미확인.

3. **파일 기반 라우팅(unplugin-vue-router) vs 수제 라우트 표** — crm·axion·gise는 `vue-router/auto-routes`·`virtual:generated-layouts` 가상 모듈, hangang은 수제. 가상 모듈은 vitest에서 resolve 실패(axion `auth-guard.ts:13-17` 실측)라 가드 로직을 분리해야만 테스트 가능. hangang `buildMenu`가 `meta.menu`를 읽는 방식은 `definePage`로도 채울 수 있으나, 파일 기반에서는 **라우트 선언 순서 = 메뉴 순서**(hangang `menu.ts:57`)가 파일명 정렬로 바뀌어 `order` 필드가 추가로 필요. vue-router 메이저도 갈림(axion ^5.0.3, crm/hangang ^4.5.1).

4. **응답 envelope 불일치** — crm/axion `{success:true,data}` vs gise/hangang 봉투 없음·에러 `{statusCode,code,message,details}`. axion은 `validateStatus:()=>true`라 실패가 reject가 아닌 resolve(`stores/app.ts:106-113`)이고 crm/gise/hangang은 reject. 하나의 `createAppStore`가 둘을 다루려면 `fetchMe()`를 프로젝트가 정규화해 넘기는 수밖에 없음(§3-5).

5. **패키지 스코프 alias·상대경로** — crm은 `@crm/frontend-core/api/client.ts`처럼 **파일 단위 deep import**(`sessions.api.ts:1`, `router/index.ts:7-9`)와 `../api/client.ts`(확장자 `.ts`) 혼용; axion/hangang은 `.js` 확장자 ESM 스타일; gise는 확장자 없음 + `@/` alias(`useFieldErrors.ts:4`). 패키지화 시 `exports` 맵을 배럴로 고정하면(gise `index.ts:1-2` 방식) crm식 deep import는 전부 깨짐. tsconfig `moduleResolution`·확장자 정책을 먼저 통일해야 함.

6. **권한 판정 의미론 차이** — 빈 인자: crm/axion/hangang `hasPermission()`=true, gise=false. hangang `filterMenu`는 길이를 먼저 보므로 gise 규칙으로 바꿔도 동작하지만, crm `router/index.ts:57`처럼 `requiredPermissions?.length` 검사 없이 호출하는 곳이 있으면 결과가 뒤집힘. 정본을 gise(fail-closed)로 잡을 경우 이식 시 전수 확인 필요.

7. **scope 축** — crm/axion만 `scopes`(own/team/all)를 `getMeRespItemSchema`·`usePermission.getScope`·`permission_matrix.isScopeResource`에서 씀. 패키지 판정 훅에 scope를 넣으면 gise/hangang이 빈 타입을 들고 다녀야 하므로 별도 옵션 모듈로 분리해야 함(§3-1).

8. **zod 버전 갈림** — axion/tpl `zod/v4`, crm/gise/hangang `zod`. `z.enum` 튜플 타입 요구(`[string, ...string[]]`)가 버전에 따라 달라 팩토리에서 `as [P, ...P[]]` 단언을 통일해야 함(hangang `permission.schema.ts:24-33`이 이 단언의 타입 유지 이유를 적음).

9. **테스트 자산의 이식** — hangang 라우터 계약 테스트(`route-meta.test.ts` 235줄, `recovery.test.ts` 92행대 "index.ts가 실제로 이 모듈을 쓴다" 소스 grep 검사)는 `routes.ts` **원문 문자열을 정규식 파싱**(`routes.ts:270-276`)하므로 패키지 헬퍼로 옮길 수 없고 템플릿(B)에 남겨야 함.

10. **미추출로 확정 못 한 것** — axion `utils/route-permission.ts`(`canEnterRoute`, `partnerOnly` 축), `utils/post-auth-redirect.ts`, gise `api/error.ts`(`hasCode/errorBody`), crm `utils/queryCodec.ts`, 각 프로젝트 `RouteMeta` 증강, hangang `IpBlockedDialog.vue`. A 배정한 `useQuerySyncedFilter`·`useFieldErrors`는 이들 확인 후 확정.
