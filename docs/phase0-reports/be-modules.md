# Phase 0 — 백엔드 조직/권한/설정 모듈 대조 보고서

대상: `/home/claude/phase0` 하위 4개 프로젝트 (node_modules 없음, 오프라인 정독).

| 약칭 | 프로젝트 | 백엔드 src 루트 | shared |
|---|---|---|---|
| **crm** | kim5257-crm-v5 | `kim5257-crm-v5/packages/backend-core/src` (라이브러리) + `kim5257-crm-v5/apps/base/backend/src` (앱) | `kim5257-crm-v5/packages/shared/src` |
| **axion** | ssworks-axion-admin | `ssworks-axion-admin/packages/backend/src` | `ssworks-axion-admin/packages/shared/src` |
| **gise** | ssworks-gise-home | `ssworks-gise-home/apps/api/src` | `ssworks-gise-home/packages/shared/src` |
| **hangang** | hangang-home | `hangang-home/apps/api/src` | `hangang-home/packages/shared/src` |

모듈 디렉터리 실측(`ls modules/`):

| | crm backend-core | crm app(base) | axion | hangang | gise |
|---|---|---|---|---|---|
| modules/ | auth, ip-access, roles, sessions, system-general-settings, teams, users | audit-logs | account-policy, app-settings, auth, roles, sessions, teams, users | audit-logs, auth, ip-access, roles, sessions, teams, users | accounts, auth |

> gise는 users/roles/sessions 관리가 `modules/accounts/` 한 모듈에 합쳐져 있고, **teams·audit-logs·employment-periods 모듈이 없다**. axion은 **audit-logs 모듈이 없다**(032 마이그레이션의 `suspension_log`는 팀 정지 로그일 뿐 감사 로그가 아님). crm의 audit-logs는 backend-core가 아니라 앱(`apps/base/backend`)에 있다.

---

## 1. 모듈별 비교

### 1.1 users (gise: accounts)

#### 파일·라인 수

| 파일 | crm | axion | hangang | gise |
|---|---|---|---|---|
| controller | `modules/users/users.controller.ts` 234 | `modules/users/users.controller.ts` 111 | `modules/users/users.controller.ts` 196 | `modules/accounts/admin-users.controller.ts` 103 / `admin-user-sessions.controller.ts` 48 / `admin-roles.controller.ts` 72 |
| service | `users.service.ts` 789 | `users.service.ts` 735 | `users.service.ts` 920 | `accounts.service.ts` 439 + `accounts.repository.ts` 471 + `account-policy.ts` 262 + `temporary-password.ts` 16 |
| dto | `users.dto.ts` 37 (`@anatine/zod-nestjs`) | `users.dto.ts` 26 (`nestjs-zod`) | `users.dto.ts` 98 (로컬 zod, `parseBody`) | 없음 — shared `account/schema.ts` 203 + 컨트롤러 `ZodValidationPipe` |
| module | `users.module.ts` (클래스명 `UsersModules`, `SystemGeneralSettingsModule` import) | `users.module.ts` | `users.module.ts` | `accounts.module.ts` 16 (`ACCOUNTS_REPOSITORY` 토큰) |
| spec | `users.service.spec.ts` 235 | 9개(contract-suspension 407, employment 297, findall 93, partner-fields 236, partner-guard 204, role-assignment 221, suspension 221, employment-periods.migration 37, service 50) — **실 MariaDB 필요 통합 테스트** | `users.dto.test.ts` 52 | 없음(대상 범위 내) |

#### 컨트롤러 엔드포인트

| 기능 | crm `@Controller('users')` | axion `@Controller('users')` | hangang `@Controller('admin/users')` | gise `@Controller('admin/users')` |
|---|---|---|---|---|
| 목록 | GET `/` | GET `/` | GET `/` | GET `/` |
| 단건 | GET `:userNo` | GET `:userNo` | GET `:userNo` | 없음 |
| 생성 | POST `/` | POST `/` | POST `/` | POST `/` (임시비밀번호 응답) |
| 수정 | PATCH `:userNo` | PATCH `:userNo` | PATCH `:userNo` | PATCH `:userNo` |
| 퇴사 | PATCH `:userNo/resign` | PATCH `:userNo/resign` | POST `:userNo/resign` | POST `:userNo/deactivate` (204) |
| 퇴사일 수정 | PATCH `:userNo/resign-date` | PATCH `:userNo/resign-date` | PATCH `:userNo/resign-date` | 없음 |
| 재입사 | POST `:userNo/rehire` | POST `:userNo/rehire` | POST `:userNo/rehire` | POST `:userNo/reactivate` (204) |
| 재직 이력 | GET `:userNo/employment-periods` | GET `:userNo/employment-periods` | GET `:userNo/employment-periods` | 없음 |
| 비밀번호 초기화 | PATCH `:userNo/password` | POST `:userNo/reset-password` | PATCH `:userNo/password` | POST `:userNo/password-reset` |
| 잠금 해제 | 없음 | 없음 | 없음 | POST `:userNo/unlock` (204) |
| 세션 | (sessions 모듈) | (sessions 모듈) | (sessions 모듈) | `admin/users/:userNo/sessions` GET / DELETE `:sessionNo` / POST `revoke-all` |
| 권한 게이트 | **없음**(`@Audit`만) | `USERS_CREATE/READ/UPDATE` 전 라우트 | `ORG_USERS_READ/WRITE` 전 라우트 | `ACCOUNT_USER_READ/MANAGE` 전 라우트 |
| 감사 | `@Audit` (AuditService.attachTarget/Meta/Diff) | 없음 | `@Audit` 6개 쓰기 라우트 | 없음(Logger.log) |
| 재인증 | 없음 | 없음 | **모든 쓰기 body에 `currentPassword`**(`reauthPasswordSchema`) | 없음 |

#### 서비스 책임 (읽은 근거)

| 항목 | crm | axion | hangang | gise |
|---|---|---|---|---|
| 생성 | 트랜잭션: users + teamUserMap + userEmploymentPeriods(`recordedTimezone`=`SystemGeneralSettingsService.getTimezone()`) | 동일 + 역할 capability 검사(`assertRoleWithinCapability`), 파트너 역할 거부(`ERR_USER_PARTNER_ROLE_MANAGED`), 파트너 팀 가드 | 동일 + reauth(트랜잭션 밖) + `assertGrantWithinActor`(권한 단조성) + `recordedTimezone:'UTC'` 고정 | `mutate()` = `runWriteTransaction` → `lockSnapshotInTransaction` → `judgeAccountCommand`(순수 판정) → apply; 임시비밀번호 생성 |
| 목록 | innerJoin teams/roles; `resigned` 3상태(undefined/true/false); `teamNo===0n`=미배정; `recursive`→`teamClosure`; `filter.userId` LIKE(이스케이프 없음); `parseSortConditions` 다중 정렬 | `resigned` 기본 false(엄격 탭); `filter.keyword`(userId OR userName); `excludePartner`; 응답에 `isPartner, memberCount, isAdmin('*' 보유)` 추가 | 단일 `sortBy`; `escapeLike` 적용; `recursive/resigned`는 문자열 `'true'|'false'` | `page/size/q/status(all|active|inactive)`; `{items,total:number}` |
| 퇴사 | 활성 period ≤1 불변식, 누락 period 치유, `isResigned`면 세션 폐기 | 세션 폐기 `SessionsService.revokeByUser(userNo, trx)` | `lockSuperAdminGuard`/`countReachableSuperAdmins`/`assertSuperAdminSurvives` | `deactivate`: 라이브 세션 폐기; `lastSuperAdmin`, 자기 계정 금지 판정 |
| 재입사 | period 신규 insert, `joinAt` 갱신 | `forUpdate`, `ERR_USER_NOT_RESIGNED` 409, `ERR_USER_INVALID_JOIN_DATE` | 동일 계열 + 감사 | `reactivate` |
| 비밀번호 초기화 | `generateSecureString(16)` 반환, 세션 폐기 **없음** | `randomBytes(8).hex`; 소셜 전용(`password==null`)은 `ERR_PASSWORD_NOT_SET` | `randomBytes(15).base64url`; `isPasswordChangeRequired=true`; 세션 폐기(`revokedReason:'terminated'`) | 16자(I/O/l/o/0/1 제외 알파벳) 임시비밀번호; `isPasswordChangeRequired`; 세션 폐기 |
| `me` | `findMeByUserNo` → permissions, scopes, hiddenDbFilters, scheduleMaskScope/EditScope | + `isPartner, hasPassword, suspension` | (auth 모듈) | (auth 모듈) |

#### (a) users 테이블 컬럼 — 공통 vs 프로젝트 특화

| 컬럼 | crm `core/database/tables/users.table.ts` | axion `users.table.ts` | hangang `users.table.ts` | gise (`accounts.repository.ts`/DDL) |
|---|---|---|---|---|
| PK | `userNo` bigint | `userNo` | `userNo` | `userNo` |
| 로그인 ID | `userId` varchar(64) UNIQUE | `userId` (refine: `@` 금지) | `userId` | `loginId` UNIQUE |
| 비밀번호 | `password` char(128) NOT NULL | `password` **nullable**(소셜 로그인) | `password` | `passwordHash` |
| 표시명 | `userName` | `userName` | `userName` | `displayName` |
| 전화 | `userPhone` | `userPhone` | **없음** | 없음 |
| 이메일 | 없음 | `email`, `emailVerifiedAt`(031) | 없음 | 없음 |
| 역할 | `roleNo` nullable FK restrict | `roleNo` | `roleNo` **NOT NULL** | `roleNo` nullable |
| 재직 | `joinAt`, `resignAt` (캐시; 정본은 `userEmploymentPeriods`) | 동일 | 동일 (`date` 타입) | 없음 → `isActive` |
| 잠금/실패 | 없음 | 없음 | `loginFailCount`, `lockUntil` | `failedLoginCount`, `lockedUntil` |
| 비번 변경 강제 | 없음 | 없음 | `isPasswordChangeRequired` | `isPasswordChangeRequired` |
| 마지막 로그인 | 없음 | 없음 | 없음 | `lastLoginAt`, `lastLoginIp` |
| 타임스탬프 | `createAt`, `updateAt` | 동일 | 동일 | 동일 |

**공통 코어(4/4 또는 3/4)**: `userNo, userId(loginId), password(passwordHash), userName(displayName), roleNo, createAt, updateAt`.
**3/4 공통**: `joinAt/resignAt` + `userEmploymentPeriods`(crm·axion·hangang).
**프로젝트 특화**: `userPhone`(crm·axion), `email/emailVerifiedAt`(axion), `isPasswordChangeRequired/loginFailCount/lockUntil`(hangang·gise), `lastLoginAt/Ip`(gise), `isActive`(gise).

`userEmploymentPeriods` 차이: crm `{periodNo,userNo,joinAt,resignAt,reason,recordedTimezone,createdBy}`; axion `createdByUserNo`, `recordedTimezone` 없음; hangang `date` 타입 + FK restrict.

#### (d) 소프트 삭제 / 활성화 / 승인 대기

| | crm | axion | hangang | gise |
|---|---|---|---|---|
| 모델 | 재직 기간(period) 기반. `resignAt` 있으면 퇴사. 물리 삭제 없음 | 동일 + 팀 `suspendedAt`(정지) | 동일 + `lockUntil`(로그인 잠금) | `isActive` 불리언 + `lockedUntil` |
| 승인 대기(pending) 상태 | **없음** | 없음 | 없음 | 없음 |
| 물리 삭제 API | 없음 | 없음 | 없음 | 없음 |

→ 4개 모두 "승인 대기" 개념은 없음. 상태 축은 **재직/퇴사(period)** 계열 3개 vs **isActive** 1개.

#### (e) 비밀번호 정책 / 임시 비밀번호

| | crm | axion | hangang | gise |
|---|---|---|---|---|
| 생성 시 비밀번호 | `createUserSchema` 필수 입력 | 필수(소셜 계정은 null 허용) | 필수 min 8 | 서버 생성 임시비밀번호 응답(`{user, temporaryPassword}`) |
| 초기화 결과 | `{newPassword}` 평문 1회 반환 | `{newPassword}` | `{newPassword}` | `{temporaryPassword}` |
| 길이/알파벳 | 16자 `generateSecureString` | 16 hex | 20자 base64url | 16자, 혼동문자 제외 |
| 변경 강제 플래그 | 없음 | 없음 | `isPasswordChangeRequired` | `isPasswordChangeRequired` |
| 정책 상수 | 없음 | 없음 | dto min 8 | `ACCOUNT_LIMITS{passwordMin 12, passwordMax 200}` (`shared/src/account/limits.ts` 15) |

#### DTO / zod 스키마 (users)

| | crm `shared/src/schemas/user.schema.ts` 134 | axion `user.schema.ts` 153 | hangang `modules/users/users.dto.ts` 98 | gise `shared/src/account/schema.ts` 203 |
|---|---|---|---|---|
| base | `userBaseSchema{userId,userName,userPhone,joinAt,teamNo,roleNo}` | 동일 + `email` | `createUserSchema{userId,password,userName,roleNo,teamNo 필수,joinAt?,currentPassword}` | `adminAccountUserSchema{userNo,loginId,displayName,roleNo|null,roleName|null,isActive,lockedUntil(ISO|null),isPasswordChangeRequired,lastLoginAt,createAt}` — **날짜 ISO 문자열** |
| update | `omit(userId).partial()` | 동일 | partial + refine(비어있지 않음, currentPassword 제외) | `strictObject` partial |
| 목록 응답 항목 | user + teamNo/teamName/roleName | `userListItemSchema` + `isPartner, memberCount, isAdmin` | user + teamName/roleName | `adminAccountUserSchema` |
| 응답 검증 | 없음 | 없음 | 없음 | **응답 `strictObject` 검증** |

### 1.2 roles

#### 파일·라인 수

| 파일 | crm | axion | hangang | gise |
|---|---|---|---|---|
| controller | `modules/roles/roles.controller.ts` 178 | 103 | 147 | `modules/accounts/admin-roles.controller.ts` 72 |
| service | `roles.service.ts` 249 | 335 | 395 (+`permissions.normalize.ts` 73, 테스트 49/56) | accounts.service 내 |
| dto | 22 | 20 | 76 | shared `adminRoleSchema` |
| spec | `roles.service.spec.ts` 56 | 6개(partner-role-seed 105, role-is-partner 43, assignable 170, default 75, partner-attribute 105, plan-lock 139) | normalize 테스트 2개 | — |

#### 엔드포인트

| 기능 | crm `roles` | axion `roles` | hangang `admin/roles` | gise `admin/roles` |
|---|---|---|---|---|
| 목록 | GET `/` (**게이트 없음** — 드롭다운용 주석) | GET `/` `ROLES_READ` | GET `/` `ORG_ROLES_READ` (flat 페이징) | GET `/` `RequireAnyPermissions(ROLE_READ, USER_READ)` → `{items}` |
| 단건 | GET `:roleNo` (게이트 없음) | GET `:roleNo` | GET `:roleNo` → `{item}` | 없음 |
| 생성 | POST `/` `SETTING_ETC_UPDATE` → `{roleNo}` | POST `/` `ROLES_CREATE` | POST → `{roleNo}` (reauth) | POST → `{role}` |
| 수정 | PATCH `:roleNo` | PATCH `:roleNo` | PATCH `:roleNo` → `{}` (reauth) | PATCH `:roleNo` (`revision` 필수) → `{role}` |
| 순서 이동 | PATCH `:roleNo/move` `{displayOrder}` | PATCH `:roleNo/move` | PATCH `:roleNo/move` → `{}` (reauth 없음) | 없음 |
| 삭제 | DELETE `:roleNo` (plain delete) | DELETE `:roleNo` | DELETE `:roleNo` (body `currentPassword`; 사용자 연결 시 `ERR_COMMON_CONFLICT`) | DELETE `:roleNo?revision=N` 204 (`roleInUse` 판정) |

#### (b) 역할-권한 저장 방식

| | crm `roles.table.ts` | axion `roles.table.ts` | hangang `roles.table.ts` | gise DDL |
|---|---|---|---|---|
| permissions | **JSON 문자열 배열** (`stringifyJSON`) | JSON 문자열 배열 | `ColumnType<Permission[], string, string>` JSON | JSON (read `unknown`, zod 검증) |
| 검증 | `z.array(z.enum(ALL_PERMISSION_VALUES))` 폐쇄집합 | 동일 | `z.array(z.enum(PERMISSION_VALUES))` + `normalizePermissions`('*' 왕복, write⇒read, delete⇒read+write, 정규 순서) | `rolePermissionListSchema`(중복 금지, `'*'` 단독) |
| 와일드카드 | `'*'` | `'*'` (`isAdmin`) | `'*'` | `'*'` |
| 추가 컬럼 | `scopes` JSON(own/team/all), `hiddenDbFilters` JSON, `scheduleMaskScope`, `scheduleEditScope`, `displayOrder`, `isDefault` | `scopes`, `isPartner`, `displayOrder`, `isDefault` + **조인 테이블 `roleAssignableMap{roleNo, assignableRoleNo}`** | `displayOrder`, `isDefault` (7컬럼) | `displayOrder`, `isDefault`, **`revision`**(낙관적 동시성) |
| roleName 유니크 | 없음(varchar 64) | 없음 | **UNIQUE**(014, `ERR_DUPLICATE_ROLE_NAME`) | **UNIQUE** |
| 비트/조인 방식 | 없음 | 조인은 assignable 관계에만 | 없음 | 없음 |

→ 4/4 **JSON 문자열 배열 + 폐쇄 enum**으로 통일되어 있음. 조인 테이블·비트마스크는 없음.

#### 권한 카탈로그 (shared)

| | crm `constants/permissions.const.ts` 162 | axion 77 | hangang 118 + `permission.schema.ts` 36 | gise `auth/permissions.ts` 174 |
|---|---|---|---|---|
| 형식 | `'db.assigned:*'`, `'org.users:*'`, `'org.teams:*'`, `'setting.etc:*'`, `'setting.ipAddress:*'`, `'setting.apiKey'`, `'setting.auditLog:read'`, `'setting.session'`, `'setting.base:manage'`, `'system:reset/backup'`, statistics/attendance/schedule/contract/stock + `DB_EDIT_ITEM_KEYS.map(editItemPermission)` 동적 | `users/teams/roles/programs/partners(+convert)/members:create|read|update|delete`, `balances:read`, `licenses:*`, `downloadLinks:*`, `settings:read|update`, `sessions:read|manage` | 12 리소스 × read/write(/delete) = 25키 + `'*'`; `PERMISSION_RESOURCES` (`content.pages/uploads/popups`, `board.posts/settings`, `org.users/teams/roles`, `setting.site/storage/ipAccess/auditLog`) | `account.user:read|manage`, `account.role:read|manage`, `account.session:manage`, `auditLog:read`(모듈 없음) + `hasPermission/hasAnyPermission/coversPermissions` |
| scopes | `scopes.const.ts` `SCOPES{own,team,all}` + `SCOPE_RESOURCES` 20여 개 + `expandScopes` | `SCOPE_RESOURCES ['users','teams','roles','members','partners']` + `expandScopes` | 없음 | 없음 |

#### roles 서비스 특징

| | crm | axion | hangang | gise |
|---|---|---|---|---|
| displayOrder | max+1 | max+1 | max+1 | `ACCOUNT_LIMITS.roleDisplayOrderMax 9999` |
| 생성/수정 제약 | 없음 | capability 검사(행위자 권한·scope 내), `roleAssignableMap` set-replace, `ERR_ROLE_SELF_ASSIGNABLE`, plan lock(`loadTopology` basic/premium/sub → `ERR_ROLE_PLAN_LOCKED`), `isDefault` 배타 | `assertUniqueRoleName`, 단조성(`monotonicity.ts`), superadmin 생존 | `judgeAccountCommand`: 자기 역할 금지, `coversPermissions` 지배, `revisionMismatch` 409, `lastSuperAdmin` |
| 목록 부가 | — | `partnerCount` 서브쿼리 | — | `userCount` |

### 1.3 teams

| 파일 | crm | axion | hangang | gise |
|---|---|---|---|---|
| controller | `modules/teams/teams.controller.ts` 233 | 157 | 116 | **없음** |
| service | 364 | 615 (+ spec guards 333, suspension 371) | 413 + `team-closure.service.ts` 112 | — |
| dto | 20 | 20 | 25 | — |

#### 엔드포인트

| 기능 | crm `teams` (게이트 없음, `@Audit`) | axion `teams` (`TEAMS_*`) | hangang `admin/teams` (`ORG_TEAMS_*`, `@Audit`) |
|---|---|---|---|
| 트리 | GET `/` (root 고정 `1n`) → TeamNode | GET `/` (root=`loadTopology().rootTeamNo`) | GET `tree` → `{item: node|null}` (root 동적 탐색) |
| 부분 트리 | GET `:rootNo` | GET `:rootNo` | 없음 |
| flat 목록 | 없음 | 없음 | GET `/` (`parentTeamNo` 포함) |
| 단건 | GET `:teamNo/single` → `{teamNo,teamName}` | GET `:teamNo/single` | GET `:teamNo` → `{item}` |
| 생성 | POST `/` `{teamName,parentTeamNo}` → `{teamNo}` | POST | POST → `{teamNo}` |
| 이름 변경 | PATCH `:teamNo/name` | PATCH `:teamNo/name` | PATCH `:teamNo` `{teamName}` → `{}` |
| 이동 | PATCH `:teamNo/move` `{parentTeamNo nullable, displayOrder}` (같은 부모→moveOrder) | PATCH `:teamNo/move` | PATCH `:teamNo/move` `{parentTeamNo?, displayOrder}` → `{}` |
| 삭제 | DELETE `:teamNo` (서브트리, FK cascade) | DELETE | DELETE `:teamNo` (구성원 있으면 차단, `forUpdate`) |
| 정지/재개 | 없음 | PATCH `:teamNo/suspend` / `resume` `{reason?}` | 없음 |

#### (c) 팀 계층 저장

| | crm | axion | hangang |
|---|---|---|---|
| 테이블 | `teams{teamNo,teamName,displayOrder,createAt,updateAt}` + **`teamClosure{ancestorNo,descendantNo,depth}`** + `teamUserMap{teamNo,userNo,joinAt}` PK(teamNo,userNo) cascade | 동일 + `teams.suspendedAt` | 동일 + teamName **UNIQUE**(`ERR_DUPLICATE_TEAM_NAME`) |
| parent_id 컬럼 | 없음(클로저 테이블에서 depth=1 조회) | 없음 | 없음(응답에 `parentTeamNo` 계산) |
| TeamNode | `{teamNo,teamName,displayOrder,children}` | + `suspendedAt,isManaged,isDedicated` | `{teamNo,teamName,displayOrder,children}` |
| 특화 로직 | — | dedicated/managed 팀 가드(`ERR_TEAM_SYSTEM_MANAGED`), 낙오 파트너 가드(`ERR_COMMON_IN_USE`), `ERR_TEAM_SELF_SUSPEND`, `suspensionLog` insert | superadmin 생존 검사(팀 이동 시), 구성원 존재 시 삭제 차단 |

→ 3/3 **클로저 테이블** 방식. 루트 노드 식별만 다름(crm 고정 1, axion topology 설정, hangang 동적).

### 1.4 audit-logs

| | crm (`apps/base/backend/src/modules/audit-logs/`) | hangang (`modules/audit-logs/`) | axion | gise |
|---|---|---|---|---|
| 파일 | controller 27 / dto 10 / service 132 | controller 47 / dto 36 / module 17 / service 194 | **없음** | **없음**(`auditLog:read` 권한 키만 존재) |
| 라우트 | `@Controller('audit-logs')` GET `/` `SETTING_AUDIT_LOG_READ` | `@Controller('admin/audit-logs')` GET `/` `SETTING_AUDIT_LOG_READ` | | |
| 필터 | principalType, principalRefNo, action(LIKE prefix, **이스케이프 없음**), targetType, targetRefNo, dateFrom, dateTo; sort createAt만; count 쿼리 중복 | principalRefNo, action(prefix LIKE **escaped**), targetType, targetRefNo, dateFrom, dateTo, sortOrder; sortBy 없음; 암호문 마스킹 | | |
| 항목 스키마 | shared `audit-log.schema.ts` 60: `{logNo,principalType('user'|'apiKey'|'anonymous'),principalRefNo,issuerUserNo,issuerUserName,action,targetType,targetRefNo,method,path,statusCode,ip,userAgent,meta,createAt}` | 로컬 dto; 테이블에 `principalType/issuerUserNo` **없음** | | |
| action 카탈로그 | shared `audit-actions.ts` 329 (`user.created`, `role.updated`, `team.deleted` …) | `core/audit/audit-actions.const.ts` (`org.user.create`, `org.role.move`, `auth.login.blocked.locked` …) — **네이밍 상이** | | |
| 기록 방식 | `@Audit` 데코레이터 + `AuditService.attachTarget/attachMeta/attachDiff` | 동일 패턴 이식 | — | — |

### 1.5 설정 모듈 (system-general-settings / app-settings / account-policy)

| | crm `system-general-settings` | axion `app-settings` | axion `account-policy` | hangang | gise |
|---|---|---|---|---|---|
| 파일 | controller 42 / branding.controller 118 / dto 24 / service 391; shared schema 122 | controller 40 / service 38 / spec 124; shared schema 18 | controller 116 / service 108 / spec 181+209; shared schema 300 | `siteSettings` key-value 테이블 존재(모듈 미해당, 미정독) | 없음 |
| 라우트 | `system-settings/general` GET(누구나)/PATCH(`SETTING_BASE_MANAGE`) → `{settings}`; `system-settings/branding` GET `public`(@Public), GET `assets/:kind`(@Public), POST/DELETE `assets/:kind`(게이트) | `app-settings` GET(`SETTINGS_READ`)/PATCH(`SETTINGS_UPDATE`) → `{reportingTzOffset}` | `settings/account-policy` GET/PATCH/GET `impact` | | |
| 저장 | 단일 행 id=1, 캐시; 컬럼 `timezone, lateThresholdTime, memoEditableMinutes, memoSubmitKey, appTitle, companyName, logoAssetId, faviconAssetId, deviceCallEnabled` | 싱글톤 `app_settings{id=1, reportingTzOffset default -9, updatedByUserNo}`; **`BalanceRollupService.rebuildAll` 의존**(도메인 결합) | `accountPolicySettings{allowedPrefixes,deniedPrefixes}` JSON 싱글톤 + `memberAccountExceptions` + `memberAccountPolicyLog`; `updateAt`을 낙관적 토큰으로 사용 | | |
| 성격 | 범용 시스템 설정 + 브랜딩(공용 가능) + CRM 특화(late/memo/deviceCall) 혼재 | 도메인 특화 | **MT4 회원 계좌번호 prefix 정책** — "사용자 계정 정책"이 아님 | | |

### 1.6 (f) 페이지네이션 / 정렬 / 검색 규약

| | crm `shared/src/schemas/pagination.schema.ts` 88 | axion `pagination.schema.ts` 51 | hangang (모듈별 dto) | gise |
|---|---|---|---|---|
| page | `page ≥1 default 1` | 동일 | `page default 1` | `page` |
| 크기 | `itemsPerPage 1..10000 default 100` | 동일 | `itemsPerPage 1..100 default 20` | `size ≤100 default 20` (`listSizeMax`) |
| 정렬 | `sortBy[]/sortOrder[]` 배열(`toArray`), `parseSortConditions`, `createQuerySchema({sortableColumns, defaultSortColumn, defaultSortOrder, filterShape})` | 동일 | 단일 `sortBy` enum + `sortOrder` (users default createAt desc, roles default displayOrder asc) | 없음 |
| 검색 | `filter[userId]` 객체(`z.object(filterShape).partial().optional()`) | `filter[keyword]` | flat 쿼리 `userId`, `roleName` | `q`, `status` |
| 불리언 | zod coerce | coerce | `'true'|'false'` 문자열 enum | — |
| 응답 | `{success:true,data:{items,total:bigint,page,itemsPerPage}}` (`paginationRespSchema`) | 동일 | `toWireSafe({items,total,page,itemsPerPage})` 봉투 없음 | `{items,total:number}` |
| 오류 | `errorRespSchema{success:false,code,message,details?}` + `BusinessException(ErrorCodes,msg,HttpStatus)` + `safeExecute` | 동일 | `{statusCode,code,message,details?}` (`ERR_COMMON_VALIDATION` 등) | `{statusCode,code,message,issues}` + `ACCOUNT_ERROR_MESSAGES` |

---

## 2. 정본(canonical) 후보와 근거

**정본 후보: `kim5257-crm-v5/packages/backend-core` (users/roles/teams/system-general-settings) 를 골격으로, hangang의 보안 강화와 gise의 계정 상태 모델을 흡수.**

근거(읽은 사실 기준):

| # | 근거 | 위치 |
|---|---|---|
| 1 | crm만 **이미 라이브러리 패키지(backend-core)로 분리**되어 앱(`apps/base/backend`)이 이를 소비하는 구조. axion은 crm에서 파생된 흔적(동일 `createQuerySchema`, 동일 클로저 테이블, 동일 employment-periods, 동일 `{success,data}` 봉투)으로 crm이 조상 | `kim5257-crm-v5/packages/backend-core/src/modules/*`, `ssworks-axion-admin/packages/shared/src/schemas/pagination.schema.ts` |
| 2 | 스키마·shared 분리가 가장 완전(user/role/team/pagination/response/audit-log/system-general-settings 모두 shared에 존재) | `kim5257-crm-v5/packages/shared/src/schemas/` |
| 3 | 감사 로그 기록 패턴(`@Audit` + attachTarget/Meta/Diff)이 crm에 원형, hangang이 그대로 이식 | crm `apps/base/backend/src/modules/audit-logs/`, hangang `modules/audit-logs/` |
| 4 | 단, crm은 **권한 게이트가 users/teams 전 라우트에 없고** roles만 부분 게이트, LIKE 이스케이프 없음, 비밀번호 초기화 후 세션 폐기 없음, roleName/teamName UNIQUE 없음 → 그대로 패키지화 불가 | `users.controller.ts`, `teams.controller.ts`, `roles.controller.ts`, `users.service.ts` |
| 5 | hangang이 위 결함을 모두 보강(전 라우트 `@RequirePermissions`, reauth `currentPassword`, `monotonicity.ts`/superadmin 생존, `permissions.normalize.ts`, UNIQUE 이름, `escapeLike`, `isPasswordChangeRequired`/`lockUntil`, 초기화 시 세션 폐기) → 보안 로직의 정본 | `hangang-home/apps/api/src/modules/{users,roles,teams}/` |
| 6 | gise의 `account-policy.ts`(순수 판정 함수 + `revision`)와 `temporary-password.ts`, 응답 `strictObject` 검증은 테스트 용이성이 가장 높은 설계 → 판정 로직 정본 | `ssworks-gise-home/apps/api/src/modules/accounts/account-policy.ts` |
| 7 | axion은 partner/topology/plan-lock/suspension 등 도메인 결합이 users/roles/teams 서비스 안에 깊이 박혀 있어(users.service 735줄 중 상당수) 정본으로 부적합. 다만 `roleAssignableMap`, `isDefault` 배타, capability 검사(`role-assignment.utils.ts`)는 재사용 가치 있음 | `ssworks-axion-admin/packages/backend/src/modules/{users,roles,teams}/` |

라우트 prefix는 hangang/gise의 `admin/*`가 관리자 패키지 목적에 맞고, 응답 봉투는 4개 중 crm/axion(`{success,data}`) vs hangang/gise(plain)로 2:2 갈림 → 패키지에서 **옵션화** 필요(§3).

---

## 3. 확장 포인트 (`@ssworks/admin-server` 가정)

### 3.1 프로젝트별 차이가 발생한 지점과 흡수 방식

| 차이 지점 | 실측 편차 | 흡수 방식 |
|---|---|---|
| 사용자 확장 컬럼 | `userPhone`(crm/axion), `email/emailVerifiedAt`(axion), `lastLoginAt/Ip`(gise) | 코어 컬럼 고정 + **`userExtensionSchema: ZodObject` 주입**. 서비스는 `select(['users.*'])`에 확장 컬럼 이름 배열을 병합하고, create/update DTO는 `createUserSchema.merge(ext)`로 조합. 확장 컬럼은 `users` 테이블에 프로젝트 마이그레이션이 `addColumn` |
| 계정 상태 모델 | period(3) vs isActive(1) | 코어는 **period + `isPasswordChangeRequired/loginFailCount/lockUntil`** 채택(hangang 컬럼 집합). gise식 `isActive`는 `resignAt IS NULL`로 파생 가능(역방향 불가) |
| 권한 카탈로그 | 4개 모두 다른 키 집합, 모두 `z.enum(폐쇄집합)` | **`PermissionCatalog` 주입** (`forRoot({ permissions: readonly string[], resources })`). 패키지는 `org.users/teams/roles`, `setting.auditLog:read`, `setting.session` 등 자체 키를 내장하고 프로젝트 키를 병합해 `ALL_PERMISSION_VALUES`를 런타임 생성. hangang의 `normalizePermissions`(write⇒read 함의)는 옵션 |
| 역할 확장 컬럼 | crm `scopes/hiddenDbFilters/scheduleMask/EditScope`, axion `scopes/isPartner/roleAssignableMap`, gise `revision` | `roleExtensionSchema` 주입 + 서비스 훅. `scopes`는 crm/axion 2/4 공통이므로 **옵션 플러그인**(`scopes.const` 형식 동일 `expandScopes`) |
| 훅 | crm: employment period `recordedTimezone`를 `SystemGeneralSettingsService`에서 조회; axion: create 시 partner 팀/역할 가드, resign 시 `SessionsService.revokeByUser(trx)`; hangang: superadmin 생존; gise: `judgeAccountCommand` | `onUserCreating(dto, trx)`, `onUserCreated(user, trx)`, `onUserResigning(user, trx)`, `onRoleSaving(role, actor)`, `onTeamDeleting` 형태의 **트랜잭션 인자 포함 훅**. 판정형 훅은 gise처럼 순수 함수(`judge*`)로 두면 테스트 가능 |
| 컨트롤러 prefix | `users`/`roles`/`teams`(crm, axion) vs `admin/users`…(hangang, gise) | `forRoot({ routePrefix: 'admin' })` → `@Controller()`는 동적 모듈에서 `path` 주입(Nest `RouterModule` 또는 팩토리 컨트롤러) |
| 응답 봉투 | `{success,data}` vs plain | 인터셉터로 봉투 선택(`envelope: 'success-data' | 'plain'`). 서비스는 항상 plain 반환 |
| 페이지네이션 | 배열 sortBy/filter 객체 vs flat 단일 sortBy | 패키지는 crm `createQuerySchema` 채택(상위 호환: flat 단일값도 `toArray`로 수용). `itemsPerPage` 상한은 옵션(crm 10000 / hangang·gise 100) |
| 재인증 | hangang만 `currentPassword` | `reauth: boolean` 옵션 → 데코레이터/파이프로 body에서 검증 후 제거 |
| 감사 액션 이름 | crm `user.created` vs hangang `org.user.create` | 패키지가 액션 상수 소유(하나로 확정), 프로젝트는 확장 액션만 추가 |
| 루트 팀 식별 | 고정 1 / topology / 동적 | `rootTeamResolver()` 옵션, 기본은 hangang식 동적 탐색 |
| 세션 폐기 | 초기화·퇴사 시 세션 폐기 유무 | `SessionsService` 인터페이스(`revokeByUser(userNo, trx)`)를 패키지 내부 제공 |

### 3.2 "코어 테이블은 패키지 마이그레이션, 확장 컬럼은 프로젝트 마이그레이션" 실현 가능성 — **가능(조건부)**

실측 근거:
- 4개 모두 Kysely 마이그레이션(`createTable/addColumn`)을 사용하며, axion은 crm의 `001_init` 이후 `031`(email), `032`(suspension_log) 등 **증분 `addColumn`으로 확장한 전례**가 있음 → 코어 DDL + 후속 확장 DDL 분리는 이미 실무에서 동작 중.
- Kysely `Database` 타입은 인터페이스이므로 `declare module` 병합 또는 `Database & ProjectTables` 교차 타입으로 확장 컬럼을 타입에 추가 가능(axion `database.types.ts` 패턴).
- `CamelCasePlugin` 사용이 4/4 공통이라 컬럼 네이밍 충돌 없음.

조건/리스크:
1. **마이그레이션 순서**: 패키지 마이그레이션(예 `0001_admin_core_*`)이 프로젝트 마이그레이션보다 먼저 실행되도록 provider가 두 폴더를 합쳐 정렬해야 함. kysely-ctl 단일 폴더 가정이므로 커스텀 `MigrationProvider` 필요.
2. **FK 방향**: 확장 테이블(예 axion `roleAssignableMap`, `memberAccountExceptions`)이 코어 테이블을 참조하는 것은 문제없으나, 코어가 확장을 참조하면 안 됨 — 현재 crm `users.roleNo→roles`, `teamUserMap→teams/users`만 존재해 충족.
3. **NOT NULL 확장 컬럼**: 프로젝트가 `addColumn(... notNull)`을 추가하면 패키지 `insert`가 실패 → 확장 컬럼은 nullable/default 필수, 또는 `onUserCreating` 훅에서 값 채우기.
4. **UNIQUE 정책 차이**(roleName/teamName): 패키지 코어 DDL에 UNIQUE를 넣으면 crm/axion 기존 데이터 마이그레이션 시 중복 검사 필요.
5. `password` nullable(axion 소셜)은 코어 DDL을 nullable로 두고 `hasPassword` 파생하는 편이 안전(axion `ERR_PASSWORD_NOT_SET` 처리 존재).

---

## 4. A/B/X 배정

| 대상 | 배정 | 근거 |
|---|---|---|
| users 모듈(생성/수정/목록/단건/퇴사/재입사/퇴사일/재직이력/비밀번호 초기화) | **A** | 3/4 동일 엔드포인트 집합, gise도 동치 기능 보유 |
| users 코어 컬럼 + employment periods + `isPasswordChangeRequired/loginFailCount/lockUntil` | **A** | §1.1(a) |
| `userPhone`, `email/emailVerifiedAt`, `lastLoginAt/Ip` | **B**(프로젝트 확장 컬럼) | 프로젝트별 상이 |
| gise `isActive`/`unlock` | **A**(unlock 엔드포인트) / **X**(isActive 컬럼 — period로 대체) | |
| roles 모듈(CRUD + move + JSON permissions + isDefault + displayOrder) | **A** | 4/4 동일 저장 방식 |
| `revision` 낙관적 동시성(gise) | **A**(옵션) | 다른 3개는 없음이나 무해 |
| roleName/teamName UNIQUE | **A** | hangang·gise 채택, 데이터 정합성 |
| `permissions.normalize`(hangang), monotonicity/superadmin 생존, `judgeAccountCommand` | **A** | 보안 필수 로직 |
| `scopes`(own/team/all) + `expandScopes` | **B**(옵션 플러그인) | crm·axion 2/4, 동일 형식 |
| `hiddenDbFilters`, `scheduleMaskScope/EditScope` | **X** | crm CRM 전용 |
| `isPartner`, `roleAssignableMap`, plan lock, topology, dedicated/managed 팀, suspend/resume, `suspensionLog` | **X** | axion 파트너 도메인 |
| 역할 capability 검사(`role-assignment.utils.ts`) | **B** | scopes 플러그인과 함께 선택 |
| teams 모듈(클로저 테이블, tree/flat/single, move, name, delete) | **A** | 3/3 동일 구조 |
| 루트 팀 식별 규칙 | **B** | 프로젝트별 상이 |
| audit-logs 모듈(조회 + `@Audit`/AuditService) | **A** | crm·hangang 동일 패턴 |
| audit action 카탈로그 내용 | **A**(코어 액션) + **B**(프로젝트 추가 액션) | 이름 규칙 통일 필요 |
| 권한 카탈로그 내용 | **A**(org.users/teams/roles, setting.auditLog/session) + **B**(도메인 키) | §3.1 |
| 페이지네이션/응답/오류 스키마(`createQuerySchema`, `paginationRespSchema`, `errorRespSchema`) | **A** | crm shared |
| 응답 봉투/route prefix/reauth/itemsPerPage 상한 | **B**(forRoot 옵션) | 2:2 갈림 |
| system-general-settings: `timezone, appTitle, companyName, logo/favicon` + branding public 라우트 | **A** | 범용 |
| system-general-settings: `lateThresholdTime, memoEditableMinutes, memoSubmitKey, deviceCallEnabled` | **X** | CRM 전용 |
| axion app-settings(`reportingTzOffset` + BalanceRollup) | **X** | 도메인 결합 |
| axion account-policy(MT4 계좌 prefix) | **X** | 이름만 "account policy", 사용자 계정과 무관 |
| gise admin-user-sessions 라우트(`admin/users/:userNo/sessions`) | **A**(sessions 모듈과 통합 검토) | 다른 3개는 sessions 모듈에 존재(범위 외) |
| 임시 비밀번호 생성기(gise `temporary-password.ts`) | **A** | 혼동문자 제외, 가장 명확 |
| 백엔드 통합 spec(axion, 실 DB 필요) | **B/X** | 패키지는 gise식 순수 판정 단위테스트 채택 |

---

## 5. 프론트엔드 계약 — 엔드포인트별 응답 형태 (실측)

봉투: crm/axion = `{success:true, data:<아래>}`, hangang/gise = `<아래>` 그대로. 오류: crm/axion `{success:false,code,message,details?}`; hangang `{statusCode,code,message,details?}`; gise `{statusCode,code,message,issues}`.

### users

| 엔드포인트 | crm | axion | hangang | gise |
|---|---|---|---|---|
| GET 목록 | `{items:UserListItem[], total:bigint, page, itemsPerPage}` | 동일 + item에 `isPartner,memberCount,isAdmin` | `toWireSafe({items,total,page,itemsPerPage})` | `{items:AdminAccountUser[], total:number}` |
| GET 단건 | `{item}` | `{item}` | `{item}` | — |
| POST 생성 | `{item}` | `{userNo}` | `{item}` | `{user, temporaryPassword}` |
| PATCH 수정 | `{item}` | `{success:true}` | `{item}` | `{user}` |
| 퇴사 | `{item}` | `{success:true}` | `{item}` | 204 |
| 퇴사일 수정 | `{item}` | `{success:true}` | `{item}` | — |
| 재입사 | `{item}` | `{success:true}` | `{item}` | 204 |
| 재직 이력 | `{items:EmploymentPeriodItem[]}` | `{items}` | `{items}` | — |
| 비밀번호 초기화 | `{newPassword}` | `{newPassword}` | `{newPassword}` | `{temporaryPassword}` |
| unlock | — | — | — | 204 |

UserListItem 공통 필드(3/4): `userNo,userId,userName,roleNo,roleName,teamNo,teamName,joinAt,resignAt,createAt,updateAt`; crm/axion `userPhone`; axion `email`; gise는 `loginId/displayName/isActive/lockedUntil/isPasswordChangeRequired/lastLoginAt` + **날짜 ISO 문자열**(다른 3개는 Date 직렬화, bigint는 문자열).

### roles

| 엔드포인트 | crm | axion | hangang | gise |
|---|---|---|---|---|
| GET 목록 | `{items:Role[], total, page, itemsPerPage}` | 동일 + `partnerCount` | `{items,total,page,itemsPerPage}` | `{items:AdminRole[]}` (`userCount,revision` 포함) |
| GET 단건 | `{item}` | `{item}` | `{item}` | — |
| POST | `{roleNo}` | `{roleNo}` | `{roleNo}` | `{role}` |
| PATCH | `{success:true}` | `{success:true}` | `{}` | `{role}` |
| move | `{success:true}` | `{success:true}` | `{}` | — |
| DELETE | `{success:true}` | `{success:true}` | `{}` | 204 |

Role 항목: 공통 `roleNo,roleName,permissions:string[],displayOrder,isDefault,createAt,updateAt`; crm + `scopes,hiddenDbFilters,scheduleMaskScope,scheduleEditScope`; axion + `scopes,isPartner,assignableRoleNos`; gise + `revision,userCount`.

### teams

| 엔드포인트 | crm | axion | hangang |
|---|---|---|---|
| 트리 | `TeamNode` (`{teamNo,teamName,displayOrder,children[]}`) | `TeamNode` + `suspendedAt,isManaged,isDedicated` | GET `tree` → `{item: TeamNode|null}` |
| flat | — | — | GET `/` → `{items:[{teamNo,teamName,displayOrder,parentTeamNo}]}` |
| 단건 | `{teamNo,teamName}` | 동일 | `{item}` |
| POST | `{teamNo}` | `{teamNo}` | `{teamNo}` |
| name/move/delete | `{success:true}` | `{success:true}` | `{}` |
| suspend/resume | — | `{success:true}` | — |

### audit-logs

| | crm | hangang |
|---|---|---|
| GET | `{items:AuditLogItem[], total, page, itemsPerPage}`; item `{logNo,principalType,principalRefNo,issuerUserNo,issuerUserName,action,targetType,targetRefNo,method,path,statusCode,ip,userAgent,meta,createAt}` | `{items,total,page,itemsPerPage}`; item에 `principalType/issuerUserNo` 없음 |

### settings

| | crm | axion |
|---|---|---|
| GET/PATCH general | `{settings:{timezone,lateThresholdTime,memoEditableMinutes,memoSubmitKey,appTitle,companyName,logoAssetId,faviconAssetId,deviceCallEnabled}}` | `{reportingTzOffset}` |
| GET branding public | `{appTitle,companyName,logoEtag,faviconEtag}` | — |
| account-policy | — | `{allowedPrefixes,deniedPrefixes,updateAt}` / impact 카운트 |

### 프론트 계약 통일 시 결정 필요 항목
1. 봉투(`{success,data}` vs plain) — 옵션화 또는 plain 확정.
2. 쓰기 응답(`{item}` vs `{success:true}` vs `{}` vs 204) — hangang/crm의 `{item}` 반환이 프론트 갱신에 가장 유용.
3. `total` 타입(bigint→string vs number), 날짜(Date vs ISO 문자열) — gise식 ISO 문자열 + number가 클라이언트 처리 단순.
4. 목록 쿼리 형식(`filter[key]`/배열 sortBy vs flat) — 패키지 `createQuerySchema`가 flat 단일값을 수용하므로 상위 호환 가능.
