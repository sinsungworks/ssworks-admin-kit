# Phase 0 대조 보고서 — 백엔드 코어 인프라 · 인증/세션

대상: `@ssworks/admin-server` 추출을 위한 4개 프로젝트(+템플릿) 대조. 범위는 main/app.module · core/database · guards/decorators/permissions · filters/errors/dto/json/pipes/throttler/config · core/audit · modules/auth · modules/sessions · modules/ip-access.
근거는 전부 `/home/claude/phase0` 아래 실제 파일. 줄 수는 `wc -l` 기준.

약칭: **CRM** = `kim5257-crm-v5`(공유 라이브러리 `packages/backend-core/src` + 앱 `apps/base/backend/src`) · **AX** = `ssworks-axion-admin/packages/backend/src` · **GI** = `ssworks-gise-home/apps/api/src` · **HG** = `hangang-home/apps/api/src` · **TPL** = `kim5257-project-template/packages/backend/src`.

> ⚠️ 발췌본에 **없는** 파일(main.ts 가 import 하는데 트리에 없음): CRM `core/pipe/zod-validation-pipe.ts`, CRM `core/filter/exception.filter.ts`, CRM `packages/backend-core/src/index.ts`(`CoreModules` export 원본), CRM `types/express.d.ts`. 또 **어느 프로젝트에도 `kysely.config.ts` 가 발췌되지 않았다**(주석으로만 존재 확인: HG `pool-options.ts:3`, CRM `kysely-plugins.ts:7` "kysely.config.ts 3벌"). 이 파일들에 대한 서술은 "참조하는 쪽 코드"에서 역추론한 것이며 별도 표기했다.

---

## 0. 버전·빌드 환경 (package.json 실측)

| 항목 | CRM (backend-core / base app) | AX | GI | HG | TPL |
|---|---|---|---|---|---|
| `type` | `module` / `module` | `module` | `module` | `module` | `module` |
| @nestjs/common·core | `^11.0.1` | `^11.1.17` | `^11.0.1` | `^11.0.1` | `^11.1.17` |
| @nestjs/jwt | `^11.0.2` | `^11.0.2` | `^11.0.2` | `^11.0.2` | 없음 |
| @nestjs/platform-express | `^11.0.1` | `^11.1.17` | `^11.0.1` | `^11.0.1` | `^11.1.17` |
| @nestjs/swagger | `^11.2.5` | `^11.2.6` | 없음 | 없음 | `^11.2.6` |
| @nestjs/throttler | 없음 | `^6.5.0` | 없음 | 없음 | 없음 |
| @nestjs/schedule | `^6.1.1` | `^6.1.3` | 없음 | `^12.0.1` | 없음 |
| kysely | `^0.28.11` | `^0.28.0` | `^0.28.17` | `^0.28.11` | 없음 |
| kysely-ctl | `^0.20.0`(app devDep) | `^0.20.0`(dep) | `^0.20.0`(devDep) | `^0.20.0`(devDep) | 없음 |
| @kim5257/kysely-mariadb-dialect | `^0.1.0` | `^0.1.0` | `^0.1.0` | `^0.1.0` | 없음 |
| mariadb | `^3.4.5` | `^3.0.0` | `^3.5.4` | `^3.4.5` | 없음 |
| zod | `^4.3.5` | 없음(shared 경유) | `^4.3.5` | `^4.3.5` | 없음 |
| zod↔Nest 브리지 | `@anatine/zod-nestjs ^2.0.12` | `nestjs-zod ^5.2.1` | 없음(자체 파이프) | 없음(자체 parseBody) | `nestjs-zod ^5.2.1` |
| @node-rs/argon2 | `^2.0.2` | `^2.0.2` | `^2.2.0` | `^2.0.2` | 없음 |
| luxon | `^3.7.2` | `^3.7.2` | 없음 | `^3.7.2` | 없음 |
| cookie-parser | `^1.4.7`(app) | `^1.4.7` | `^1.4.7` | `^1.4.7` | `^1.4.7` |
| 테스트 | jest 30 + ts-jest | vitest 4 | vitest 4 | vitest 4 | 없음 |
| Node engines | 미명시 | `>=24` | 미명시(@types/node 24) | 미명시(@types/node 26) | `>=24` |
| TS | `^5.7.3`/`^5.9.3` | `^5.9.3` | `~5.9.2` | `^5.7.2` | `^5.9.3` |
| tsconfig.base | target ESNext, `emitDecoratorMetadata`+`experimentalDecorators` | 동일(CRM 과 바이트 동일) | target ES2023, `noUncheckedIndexedAccess`, **데코레이터 옵션 없음**(앱 tsconfig 미발췌) | 미발췌 | CRM 과 동일; backend tsconfig `module: NodeNext` |
| scope alias | `@crm/shared`, `@crm/backend-core` (workspace:*) | `@axion-admin/shared` | `@gise/shared` | `@hangang/shared` | `@project/shared` |
| 마이그레이션 명령 | `npx kysely migrate` | `npx kysely migrate` | `kysely migrate latest` / `down` | `kysely migrate latest`, **`MIGRATION_DIR` env 로 테넌트 폴더 선택** | 없음 |

결론: NestJS **11 계열로 통일**, 전부 **ESM(`type: module`, `.js` 확장자 import)**, Kysely 0.28 + 같은 MariaDB dialect. 패키지 뼈대의 호환성 장벽은 낮다. 갈리는 것은 zod 브리지·테스트 러너·에러 봉투·세션 정책이다.

---

## 1. 역할별 대조표

### 1-1. 부트스트랩 (main.ts · app.module.ts)

| 항목 | CRM `apps/base/backend/src/main.ts`(68) · `app.module.ts`(52) | AX `main.ts`(76) · `app.module.ts`(42) | GI `main.ts`(71) · `app.module.ts`(75) · `core/config/bootstrap.ts`(50) | HG `main.ts`(65) · `app.module.ts`(112) | TPL `main.ts`(58) · `app.module.ts`(33) |
|---|---|---|---|---|---|
| env 로딩 | `nest start --env-file .env`(package.json) | 동일 + `import './core/set-timezone.js'` 최상단 | 코드 `loadDotEnv()`(이미 있는 키 안 덮음) → `assertUtcTimezone` → `requireEnv([...])` → `assertPublicBaseUrl` → `validateBootSecrets`(세 시크릿 상호 상이·32바이트 검사) | `loadDotEnv()` → `assertUtcTimezone` → `requireEnv(['DB_HOST','DB_PORT','DB_USER','DB_NAME','DB_PASSWORD','JWT_SECRET'])` | `nest start` |
| 전역 prefix | `'api'`, exclude `doc`, `doc/*path` | `GLOBAL_API_PREFIX` 상수(webhook-raw-body.ts) | `applyGlobalPrefix()` → `'api/v1'`, exclude `{path:'uploads/*key', method:GET}` — **setGlobalPrefix 호출 지점을 파일 하나로 봉인** | `'api/v1'`, exclude uploads GET (main.ts 인라인) | `'api'` |
| CORS | `enableCors({origin:['http://localhost:4000'],credentials:true})` | 동일 | **없음**(edge 가 유일 진입점, 주석으로 금지) | 없음 | 동일(AX) |
| 쿠키 파서 | `app.use(cookieParser())` | 동일 | `configureApp` 안 | main.ts | 동일 |
| JSON 본문 | `app.use(jsonParser)` — express.json + BigInt reviver(`core/json/json_transform.ts`) | 동일 + `limit:'3mb'` + 웹훅 raw body 선점 | `app.useBodyParser('json',{limit:'1mb', reviver: bigintJsonReviver})` + `app.set('json replacer', bigintJsonReplacer)` | 없음(Nest 기본 100kb, bigint 는 `toWireSafe()` 로 응답 직전 접음) | `app.use(jsonParser)` |
| 응답 직렬화 | `JsonTransformInterceptor`(useGlobalInterceptors) → `stringifyJSON` | 동일 | Express `json replacer` | 없음 — 컨트롤러가 `toWireSafe()` 호출 | 동일(CRM) |
| 전역 파이프 | `new ZodValidationPipe()` 자체 구현(파일 미발췌) + `patchNestjsSwagger()` | `nestjs-zod` `ZodValidationPipe` | **없음** | **없음** | `nestjs-zod` |
| 전역 필터 | `useGlobalFilters(new GlobalExceptionFilter())`(파일 미발췌) | `useGlobalFilters(new ApiExceptionFilter())` | `APP_FILTER: BusinessExceptionFilter`(DI) | `APP_FILTER: BusinessExceptionFilter`(DI) | `useGlobalFilters(new ApiExceptionFilter())` |
| trust proxy | 없음(헤더 직접 파싱) | 없음(설계상 끔, throttler 주석) | `applyTrustProxy()` → `'trust proxy' = 1` | 없음(`getClientIp` 가 X-Real-IP 우선 파싱) | 없음 |
| 모듈 등록 | `globSync('./core/**/*.module.ts','./modules/**/*.module.ts')` 자동 + `...CoreModules`(backend-core) | globSync + `ScheduleModule.forRoot()` | **명시 import 16개** | **명시 import 18개**(글롭 로더가 놓친 모듈 사고를 주석으로 기록) | globSync |
| APP_GUARD 순서 | `AuthGuard` → `PermissionGuard` | `AuthGuard` → `SuspensionGuard` → `PermissionGuard` | `AdminAuthGuard` → `PermissionGuard` → `AttendeeAuthGuard` | `AuthGuard` → `PermissionGuard` | 없음 |
| Swagger | 주석 처리("Zod4 와 @anatine/zod-nestjs 호환성 문제") | `shouldExposeSwagger()` 조건부 | 없음 | 없음 | 항상 |
| shutdown hooks | 없음 | 없음(DatabaseModule 은 onModuleDestroy 구현) | `app.enableShutdownHooks()` | 없음 | 없음 |
| listen | `PORT ?? 3000` | `PORT ?? 4000` | 4000 고정 | 4000 고정 | `PORT ?? 4000` |

핵심 차이: (1) globSync 자동 로더(CRM/AX/TPL) vs 명시 등록(GI/HG). 패키지화하면 `AdminServerModule.forRoot()` 가 명시 등록형이므로 자동 로더와 공존하려면 패키지 모듈이 `src/` 글롭에 안 잡히는 것이 오히려 유리하다. (2) BigInt 직렬화 위치가 셋(인터셉터 / json replacer / 수동 toWireSafe)으로 갈린다. (3) env 로딩 시점 — GI/HG 는 `JwtModule.registerAsync` 로 ESM 호이스팅 문제를 회피(HG `auth.module.ts:10-20`, GI `auth.module.ts:11-19`), CRM 은 `register({secret: process.env.JWT_SECRET || 'jwt-secret'})` 로 **공개 상수 폴백**(`backend-core/src/modules/auth/auth.module.ts:11`).

### 1-2. core/database

| 항목 | CRM `backend-core/src/core/database/` | AX `core/database/` | GI `core/database/` | HG `core/database/` |
|---|---|---|---|---|
| 주입 토큰 | `export const KYSELY = Symbol('KYSELY')` (`database.module.ts:9`) | 동일 (`:8`) | 동일 (`:9`) | 동일 (`:18`) |
| 모듈 | `@Global()`, `providers:[{provide:KYSELY,useFactory}, ScopeKeyGuard]`, `exports:[KYSELY]` (52줄) | `@Global()`, `onModuleDestroy → db.destroy()` (41줄) | `@Global()`, `createDb()` export, `onModuleDestroy` (38줄) | `@Global()`, `createDb()` export, destroy 없음 (52줄) |
| 풀 옵션 | `timezone:'auto'`, `decimalAsNumber:true`, `connectionLimit: poolEnvInt('DB_POOL_LIMIT',20,1)`(비정수면 fallback), `acquireTimeout`, `leakDetectionTimeout` | **하드코딩 기본값** `host 'localhost' / user 'root' / password '' / database 'app_db'`, `connectionLimit:10`, `timezone:'UTC'` | 별도 `pool.ts`(85줄, **Nest 미import — 마이그레이션 러너와 공유**): `timezone:'Z'`, `insertIdAsNumber:false`, `bigIntAsNumber:false`, `decimalAsNumber:false`, `checkNumberRange:true`, `logParam:false`, `poolEnvInt` 는 **비정수면 throw** | `pool-options.ts`(62줄, 같은 규약): `timezone:'Z'`, 4개 숫자옵션 false/true 명시, `logParam:false`, `poolEnvInt` throw |
| DB 이름 env | `DB_NAME` | `DB_NAME` | **`DB_DATABASE`** | `DB_NAME` |
| 플러그인 | `crmKyselyPlugins()` = `[BooleanTransformPlugin, CamelCasePlugin({maintainNestedObjectKeys:true})]` — JSON 컬럼 내부 키 오염 사고(2026-09-15) 기록 | `[BooleanTransformPlugin, CamelCasePlugin()]` | 동일(순서 주석) | 동일 |
| BooleanTransform 판정 | `is_`/`has_` 접두 + **허용목록 7개**(CRM 도메인 컬럼) | `is_`/`has_` 접두만 (35줄) | 정규식 `/^(?:is\|has)(?:_[a-z0-9]\|[A-Z0-9])/` — snake/camel 둘 다, 허용목록 금지 | `is_`/`has_` + **빈 허용목록**(비면 정상이라 주석) |
| Database 타입 위치 | `types.ts`(105줄) — `tables/*.table.ts` 49개 조합 | `database.types.ts`(119줄) — `tables/*.table.ts` 조합, 키 일부 snake(`balance_ops`, `app_settings`) | **`schema.ts` 단일 파일 710줄**(16테이블) + `Nullable<T>`·`Managed` 별칭 + `COLUMN_LIMITS` 상수 + `Selectable/Insertable` 별칭 | `types.ts`(79줄) — `tables/*.table.ts` 17개 + `Role/User/Session/…` 별칭 |
| 테이블 타입 표기 | `ColumnType<bigint, never, never>`(PK), `Generated<bigint>` 혼용 | `tables/README.md` 가 `ColumnType<S,I,U>` 패턴 문서화 | `Generated<bigint>` + `Nullable<T>` | `Generated<bigint>` + `ColumnType<Date,never,never>` |
| 트랜잭션/에러 봉투 | 없음(호출부 `safeExecute`) | `read-committed.util.ts` 등 도메인 유틸 | `run.ts`: `runQuery(label, fn)` · `runWriteTransaction(db,label,fn)` + `tx-context.ts`(AsyncLocalStorage 로 "트랜잭션 안 네트워크 I/O" 단언) — errno 1062/1213/1205 → `BusinessError` | `write-transaction.ts`: `runWriteTransaction(db, fn)` · `runQuery(fn)` → `mapError` |
| 기타 | `scope-key-guard.ts`(부팅 시 플러그인 자가검사), `helpers/*`(도메인 scope 필터) | `partner-*.util.ts` 등 도메인 유틸 다수 | `json-column.ts`(`readJsonColumn` — 드라이버 `autoJsonMap` 대응), `like.ts` | `column-widths.ts`(154줄), `upload-owners.ts` |

**마이그레이션 구조**

| 항목 | CRM `apps/base/backend/src/core/database/migrations/` | AX `core/database/migrations/` | GI `core/database/migrations/` | HG `core/database/migrations{,-infinity,-hojin}/` |
|---|---|---|---|---|
| 파일 수 | 35장, `001_init.migration.ts` **1946줄 통합**("001~012 를 하나로 통합") | 59장, `001_init` 231줄 | 16장, `001_auth` 202줄(roles/users/sessions) | 38장 + 테넌트 폴더 2개(27장씩) |
| 시그니처 | `up(db: Kysely<any>)` | **`up(db: Kysely<Database>)`** — 앱 타입에 결합 | `Kysely<any>` | `Kysely<any>` |
| 컬럼명 표기 | 빌더에 camelCase(`'roleNo'`) — CamelCasePlugin 이 snake 로 변환. raw SQL 은 snake(`audit_logs`, `create_at`) | camelCase 빌더 + raw SQL snake(`suspension_log`) | camelCase 빌더 + `_shared.ts` 헬퍼 | 동일 + `_shared.ts` |
| `_shared.ts` | 없음 | 없음 | `TABLE_OPTIONS`(utf8mb4_bin), `UTF8_CI`, `ASCII_BIN`, `UTF8_BIN`, `JSON_BIN`, `comment()` (34줄) | 동일 구성 + `ASCII_CI` (39줄) |
| 시드 | `001_init` 안에 시드(admin 사용자·IP 규칙) | `001_init` 안 `seedRoles/seedTeams/seedUsers` — **`admin/admin123` 고정** | `SEED_ROLES` export(관리자 `['*']`·편집자), 관리자 계정은 CLI `bin/create-admin.ts` | `010_bootstrap_seed`: users 0행 검증 → 랜덤 20자 비밀번호 stdout 출력 + `isPasswordChangeRequired:true` + 팀·고용이력·IP 규칙 |
| 앱 코드 의존 | `import { hashPassword } from '@crm/backend-core'` | `../../utils/password.util.js`, `@axion-admin/shared` `getNow` | `_shared.js` 만 | `../../utils/password.util.js`, `../seeds/bootstrap.js` |
| 테넌트 분기 | 없음 | 없음 | 없음 | `migrations-infinity/001_roles.migration.ts` = **8줄 재export 스텁** `export { up, down } from '../migrations/001_roles.migration.js'`; kysely-ctl `isMigration()` 이 `up` 만 보므로 동작(주석 명시) |
| 문서 | CLAUDE.md:193 (COMMENT 는 raw SQL 로) | `migrations.md`, `tables/README.md` | 없음(주석) | CLAUDE.md |

### 1-3. users / roles / teams / sessions / 기타 관리 테이블 스키마 차이

**roles**

| 컬럼 | CRM | AX | GI | HG |
|---|---|---|---|---|
| PK | `roleNo bigint unsigned` | 동일 | `integer unsigned` → 013 에서 bigint 로 승격 | `bigint unsigned` |
| roleName | varchar(64), UNIQUE 없음 | 동일 | varchar(64) `UTF8_CI` UNIQUE | varchar(64) `UTF8_CI`, 014 에서 UNIQUE 추가 |
| permissions | JSON default `'[]'` (`JSONColumnType<string[]>`) | 동일 | json `JSON_BIN` (`ColumnType<unknown,string,string>` — autoJsonMap 대응) | json (`ColumnType<Permission[],string,string>`) |
| scopes | **JSON `Record<ScopeResource,Scope>`** | 동일 + `isPartner`, `roleAssignableMap` 테이블 | 없음 | 없음 |
| CRM 전용 | `hiddenDbFilters`, `scheduleMaskScope`, `scheduleEditScope` | — | — | — |
| 기타 | displayOrder, isDefault | 동일 | + `revision`(016) | displayOrder, isDefault |

**users**

| 컬럼 | CRM | AX | GI | HG |
|---|---|---|---|---|
| 로그인 ID | `userId varchar(64) UNIQUE` | `userId` + **`email`/`emailVerifiedAt`**(이메일 로그인) | `loginId varchar(64) UTF8_CI UNIQUE` | `userId varchar(64) UTF8_CI UNIQUE` |
| 비밀번호 | `password char(128)` NOT NULL | `password` **NULL 허용**(소셜 전용) | `passwordHash varchar(255)` | `password char(128)` |
| 표시명 | `userName`, `userPhone` NOT NULL | 동일 | `displayName` | `userName`(phone 없음) |
| roleNo | NULL 허용, FK restrict (TS 는 non-null — 어긋남, HG 주석) | 동일 | NULL 허용, FK **set null** | **NOT NULL**, FK restrict |
| 재직 | `joinAt`, `resignAt` + `userEmploymentPeriods` | 동일 | `isActive` | `joinAt`, `resignAt` + `userEmploymentPeriods`(FK restrict 추가) |
| 잠금 | 없음 | 없음 | `failedLoginCount`, `lockedUntil`, `lastLoginAt`, `lastLoginIp` | `loginFailCount`, `lockUntil` |
| 첫 로그인 변경 | 없음 | 없음 | `isPasswordChangeRequired`(016) | `isPasswordChangeRequired`(002) |

**teams / teamClosure / teamUserMap**: CRM·AX·HG 동일 3테이블(HG 는 파일을 갈랐고 `teamName` UNIQUE 추가). AX `teams.suspendedAt` 추가. **GI 는 팀 개념 없음.**

**sessions**

| 컬럼 | CRM | AX | GI | HG |
|---|---|---|---|---|
| 토큰 저장 | **`refreshToken varchar(512) UNIQUE` 평문** | 동일 평문 | `refreshTokenHash varchar(255) ASCII_BIN UNIQUE` (sha256 hex) | `refreshTokenHash char(64) ASCII_BIN UNIQUE` |
| 메타 | `deviceInfo varchar(512)`, `ipAddress varchar(45)` | 동일 | `userAgent varchar(512)`, `ipAddress varchar(45)` | `deviceInfo`, `ipAddress` |
| 시각 | `loginAt`, `lastAccessAt`(ON UPDATE), `expireAt timestamp` | 동일 | `createAt`, `updateAt`, `expireAt datetime` | `loginAt`, `lastAccessAt`, `expireAt datetime` |
| 폐기 | `isRevoked` | `isRevoked` | `isRevoked`, `revokedReason varchar(32)`, **`revokedAt`, `replacedBySessionNo`**(003 유예창) | `isRevoked`, `revokedReason varchar(16)`(011: `rotated\|terminated\|reuse_detected`) |
| CRM 전용 | `issuedByApiKeyNo`(013) | — | — | — |
| FK | users cascade | 동일 | 동일 | 동일 |

**ipAccessRules**: CRM `scopeType` 5값(`user/team/role/global/apiKey`, `@crm/shared` `IpAccessScope`), `cidr` 폭 18(IPv4 전용); HG 3값 varchar(16) + `cidr varchar(43)`(IPv6). AX·GI 없음.

**auditLogs**: CRM `principalType varchar(16)`+`issuerUserNo`, `meta json`, 012 에서 **`(logNo, createAt)` 복합 PK + 분기 RANGE 파티셔닝**; HG `principalType/issuerUserNo` 제거, 단일 PK, `ip varchar(45)`, 인덱스 3종 동일. AX·GI 없음(AX 는 도메인별 `suspensionLog`/`licenseLog` 등만).

**HG 전용**: `guardLocks`(전권자 잔존 직렬화 행), `userEmploymentPeriods` FK.

### 1-4. 인증 방식 (auth.guard · auth.service · cookie)

| 항목 | CRM | AX | GI | HG |
|---|---|---|---|---|
| 파일 | `guards/auth.guard.ts`(211) · `modules/auth/auth.service.ts`(364) · `auth.controller.ts`(292) · `utils/cookie.util.ts`(28) | `auth.guard.ts`(60) · `auth.service.ts`(231) · `auth.controller.ts`(195) + 소셜/이메일/가입 8파일(≈2,300줄) | `guards/admin-auth.guard.ts`(92) · `auth.service.ts`(323) · `auth.repository.ts`(413) · `auth.controller.ts`(107) · `core/auth/cookies.ts`(95) · `login-policy.ts`(46) · `refresh-policy.ts`(67) | `guards/auth.guard.ts`(252) · `auth.service.ts`(640) · `auth.controller.ts`(141) · `utils/cookie.util.ts`(92) · `login-policy.ts`(63) · `token.util.ts`(24) |
| 전송 | httpOnly 쿠키 `accessToken`(path `/`, **strict**, 1h) · `refreshToken`(path `/api/auth`, 7d). **clear 는 path `/auth`** — set/clear 불일치(`cookie.util.ts:27`) | 동일 이름·strict·1h/7d, clear path `/api/auth` 로 고침 | 쿠키 `accessToken`(path `/`, lax, 15m) · `refreshToken`(path `/api/v1/auth`, 7d); set/clear 가 옵션 함수 공유; `secure = NODE_ENV==='production'` 호출 시점 평가 | 쿠키 **`hg_admin_at` / `hg_admin_rt`**(둘 다 path `/`, lax); `secure = X-Forwarded-Proto==='https' \|\| NODE_ENV==='production'`; set/clear 가 `req` 를 받아 같은 옵션 사용 |
| 액세스 토큰 | JWT, payload = `stringifyJSON({userNo,sessionNo,iat,exp})` **문자열 자체를 sign**(`auth.service.ts:287`), TTL 1h(luxon) | JWT `{data: stringifyJSON(payload)}`, `expiresIn:'1h'` | JWT `JSON.parse(stringifyJSON({userNo,sessionNo}))`(`"BigInt(N)"` 래퍼 문자열 클레임), `expiresIn: 900s` | 동일 방식, `'15m'` |
| 토큰 검증 실패 | `jwtService.verify` **try/catch 없음** → 만료가 500 (HG 주석 `auth.guard.ts:38-43` 이 지적) | 동일(try/catch 없음) | `TokenExpiredError → EXPIRED_TOKEN`, 그 외 `INVALID_TOKEN`; payload 형태(`typeof bigint`) 검사 | 동일 분기 |
| 리프레시 | 랜덤 64B hex **평문 저장**; `updateSession` 이 **같은 행**의 토큰·expireAt 을 갱신(회전이 아니라 연장, 7d rolling) | 동일 + `lastAccessAt` 갱신 | sha256 저장; **새 행 발급 + 옛 행 `rotated` 폐기** + `replacedBySessionNo` 링크; 조건부 UPDATE 0행 → 재조회; **30초 유예창**(교차 탭) + 시계 오차 5초; 유예 밖 재사용 → `revokeAllSessionsOfUser('reuse')` + `REFRESH_REUSED` | sha256 저장; 새 행 발급 + 옛 행 `rotated`; 0행(경쟁) → `INVALID_TOKEN` 만(전량 폐기 안 함); `rotated` 행 재제시 → 그 사용자 **살아있는 세션 전량** `reuse_detected` + 감사 `auth.token.reuse` |
| 세션 검사(가드) | `checkSession(sessionNo)` → 폐기/만료 401 | `checkSession(sessionNo, userNo)` **소유 대조**; 실패 시 `throw new Error(ErrorCodes.ERR_INVALID_TOKEN)` — HttpException 이 아니라 `ApiExceptionFilter` "기타 예외" 분기(500) 로 떨어짐(`auth.service.ts:218`, `api-exception.filter.ts:78-88` 기준) | `checkSession` → `INVALID_TOKEN`/`SESSION_EXPIRED`; `loadAdmin` 이 **매 요청 권한을 DB 에서 읽음** | `checkSession` + `usersService.findMeByUserNo`(팀·직책 INNER JOIN) |
| 주체 주입 | `request.user`(`AuthenticatedUser` + scopes 등 CRM 필드) 또는 `request.apiClient`(X-API-Key) | `request.user`(+ `isPartner`, `hasPassword`, `suspension`) | **`request.admin`**(`AuthenticatedAdmin`) / `request.attendee` 별도 주체 | `request.user`(`AuthenticatedUser`, `express.d.ts` 로 타입 확장) |
| 로그인 실패 응답 | `ERR_NO_USER` 404 (없음/비번오류 동일), 퇴사 403, IP 403 | **`ERR_LOGIN_FAILED` 401 단일** + `verifyDummyPassword`(타이밍 대칭) + `@Throttle 10/5min` | `INVALID_CREDENTIALS` 401 + DUMMY 해시; 비번 검증 **후** 잠금 검사(계정 열거 방지 순서); `ACCOUNT_LOCKED` 423 | `ERR_NO_USER` 404 + DUMMY; 순서: 비번 → 퇴사 → IP → 잠금; 5분기 전부 감사 기록 |
| 잠금 정책 | 없음 | 없음(IP throttler 만) | 5회 / 15분, `nextLoginState` 순수 함수(만료 후 카운터 리셋, 잠금 중 연장 금지) | **동일 알고리즘**(필드명만 `loginFailCount/lockUntil`) |
| 로그아웃 | `@Public`, 쿠키의 refreshToken 으로 폐기 | 동일 | `@Public`, refresh 쿠키로 폐기(`logoutByRefreshToken`, 이미 폐기면 no-op) | **`@SelfOnly`(인증 필요)**, `user.sessionNo` 로 폐기 + `@Audit` |
| /me | `@Get('me')` 데코 없음(fail-open 의존) | 동일 | `@AdminAuth()` | `@SelfOnly()`, bigint 필드 제외해 응답 |
| 비밀번호 변경 | `PATCH auth/password` | `PATCH auth/password` `@AllowWhenSuspended` | `POST auth/password` 별도 컨트롤러, `@AdminAuth` | `PATCH auth/password` `@SelfOnly` + `@Audit` |
| 재인증 | `password-recheck.ts` `assertUserPrincipalWithPassword(db, user, password)` | 없음(발췌 범위) | `AdminPasswordService` 내부 | `password-recheck.ts`(84) + `reauth-password.schema.ts` — users/roles/ip-access 저장에 재인증 요구 |
| 리포지토리 추상화 | 없음(서비스가 Kysely 직접) | 없음 | **`AUTH_REPOSITORY` 토큰 + `AuthRepository` 인터페이스 + `KyselyAuthRepository`** | 없음 |
| JWT 시크릿 | `process.env.JWT_SECRET \|\| 'jwt-secret'` | `getJwtSecret()` 필수·32자 하한 | `registerAsync` `process.env.JWT_SECRET`(main 에서 requireEnv) | 동일 |
| 도메인 특화 | X-API-Key 인증(`apiKeys` 테이블, `snst_` 접두), `/ext/v1/auth/introspect` | 소셜(Google)·이메일 OTP·셀프 가입·pending signup·SuspensionGuard | 참석자 구글 로그인(`AttendeeAuthGuard` 165줄, `origin-check.ts`) | 없음 |

### 1-5. 권한 가드 규칙

| 규칙 | CRM `permission.guard.ts`(127) | AX (61) | GI (93) | HG (66) |
|---|---|---|---|---|
| `@Public` 처리 | 통과 | 통과 | 통과(+ `@AttendeeAuth`, `@AttendeeAuthOptional` 도 통과) | 통과 |
| 데코레이터 부재 | **통과(fail-open)** `:53-59` | **통과(fail-open)** `:28-30` | **403 fail-closed**, 단 `@AdminAuth()` 면 통과 `:49-75`; 사유는 로그로만 | **403 fail-closed**, `@SelfOnly()` 면 통과 `:35,46-52` |
| 미인증 | 401 `Principal not authenticated` | 401 | 401 | 401 |
| `'*'` | `PERMISSIONS.ALL` 포함 시 전부 통과(정확 일치, user/apiClient 공통) | 동일 | `hasPermission()`(shared) 안에서 처리 — 정확 일치 | 정확 일치, 마커 부재 검사 **뒤**에 평가(전권자도 마커 없으면 403) |
| AND | `@RequirePermissions(...)` every | 동일 | `hasPermission(granted, ...required)` | every |
| OR | `@RequireAnyPermissions(...)` some | **없음** | `hasAnyPermission()` | some |
| 추가 게이트 | `@RequireEditItems(...)` → `allowedEditItems()` (CRM `db.*` 항목) | `SuspensionGuard`(별도 가드: 정지 계정의 non-GET 차단, `@AllowWhenSuspended` 예외) | — | — |
| scope | 가드에서 **판정 안 함**. `roles.scopes` 는 `AuthenticatedUser.scopes` 로 실려 도메인 헬퍼(`database/helpers/scope-filter.helper.ts`)가 쿼리 필터에 사용 | 동일(`member-scope.util.ts`, `team-scope.util.ts`) | 없음 | 없음 |
| 메타키 | `'isPublic'`, `'permissions'`, `'anyPermissions'`, `'editItems'` | `'isPublic'`, `'permissions'`, `'allowWhenSuspended'` | **`'gise:isPublic'`** 등 네임스페이스 접두 | `'isPublic'`, `'permissions'`, `'anyPermissions'`, `'isSelfOnly'` |
| Permission 타입 출처 | `@crm/shared` `PERMISSIONS`(`domain.resource:action`, 43+) | `@axion-admin/shared` | `@gise/shared` `PERMISSIONS`(40개) + `toPermissions()` 폐집합 필터 | `@hangang/shared`(`PERMISSION_VALUES`, `PERMISSION_RESOURCES`) |
| 전권자 보전 | 없음 | 없음 | 없음 | `core/permissions/monotonicity.ts`(284): `assertGrantWithinActor`, `lockSuperAdminGuard(trx)`(guardLocks 행 SELECT FOR UPDATE), `countReachableSuperAdmins`(IP 전역층 도달 가능한 `'*'` 보유자) |

### 1-6. zod 검증 방식

| | CRM | AX / TPL | GI | HG |
|---|---|---|---|---|
| 방식 | `@anatine/zod-nestjs` `createZodDto` (`auth.dto.ts`, `core/dto/*.dto.ts`) + 자체 `ZodValidationPipe` 전역(파일 미발췌) + `patchNestjsSwagger()` | `nestjs-zod` `createZodDto` + `ZodValidationPipe` 전역; 필터가 `ZodValidationException` 을 `ERR_COMMON_VALIDATION` 400 으로 | 자체 `core/pipes/zod-validation.pipe.ts`(33) — `@Body(new ZodValidationPipe(schema))` 매개변수 단위; 실패 시 `BusinessError(VALIDATION_FAILED, …, {issues:[{path,code,message}]})`(원문 `input` 제외) | 파이프 없음. 각 컨트롤러가 `parseBody(schema, body)` 지역 함수를 **복제**(`auth.controller.ts:28-36`, `sessions.controller.ts:108-116` 등) → `ERR_COMMON_VALIDATION` + `issues` 원문 |
| 스키마 위치 | `@crm/shared` | `@axion-admin/shared` | `@gise/shared` 또는 모듈 dto(`loginBodySchema`) | 모듈 `*.dto.ts`(zod 직접) |
| 문제 | zod 4 ↔ anatine 호환 문제로 Swagger 비활성(main.ts 주석) | — | — | 중복 코드, DTO 클래스 없음 |

### 1-7. 예외 필터 응답 포맷 · 에러 코드 체계

| | CRM | AX / TPL `api-exception.filter.ts`(130/120) | GI `business-exception.filter.ts`(442) | HG `business-exception.filter.ts`(58) |
|---|---|---|---|---|
| Catch 범위 | 미발췌(`GlobalExceptionFilter`) | `@Catch()` 전부 | `@Catch()` 전부 | **`@Catch(BusinessException)` 만** — raw 드라이버 오류는 Nest 기본 처리(그래서 `runQuery/mapError` 봉투 필수) |
| 본문 | (추정 불가) | `{ success:false, code, message }` — `statusCode` 없음, `stringifyJSON` | `{ statusCode, code, message, details? }` — `res.json()` + json replacer; 5xx 는 message 고정 문안·details 제거·로그 | `{ statusCode, code, message, details? }` — `stringifyJSON` 수동 send; 5xx `cause.stack` 로그 |
| 예외 클래스 | `BusinessException extends HttpException(code, message, status, details)` — 상태를 **호출부가 손으로** 지정 | 동일(details 없음) | `BusinessError extends Error(code, message, details, {cause})` — **shared 패키지**(Nest 비의존, 브라우저 번들 가능); 상태는 `httpStatusFor(code)` | `BusinessException(code, message, status, details, {cause})` + `businessError(code, message, details, options)` 가 `status-map.ts` `ERROR_STATUS` 로 상태 유도 |
| 코드 네이밍 | `ERR_COMMON_*` + 도메인(48개) | `ERR_COMMON_*` + `ERR_COMMON_IN_USE`, `ERR_COMMON_TOO_MANY_REQUESTS`, `ERR_LOGIN_FAILED`, `ERR_ACCOUNT_SUSPENDED`…(97개) | **`ERR_VALIDATION_FAILED` 등 `COMMON` 접두 없음**(16개), `ACCOUNT_LOCKED`→423, `REFRESH_REUSED`, `SESSION_EXPIRED` | `ERR_COMMON_*`(10) + 인증 9 + 조직 4 + 스토리지·콘텐츠(30개), `ERR_ACCOUNT_LOCKED`→403 |
| 드라이버 오류 매핑 | `mapError`: `ER_DUP_ENTRY`→409, `ECONNREFUSED`→503, `ETIMEDOUT`→504; **원본 cause 유실** | + `ER_ROW_IS_REFERENCED(_2)`→`ERR_COMMON_IN_USE` 409; `safeExecute` 가 매핑 결과 우선 | `run.ts` errno 1062→CONFLICT, 1213/1205→CONFLICT, 그 외 INTERNAL(cause 보존) | + `ER_NO_REFERENCED_ROW_2`→400, `ER_LOCK_WAIT_TIMEOUT`→504, `ER_LOCK_DEADLOCK`→409; cause 보존 |
| 같은 코드 다른 상태 | `ERR_RESIGNED_USER` 로그인 403 / 가드·refresh 401(HG `status-map.ts:5-8` 지적) | — | 불가(단일 표) | 불가(단일 표) |

### 1-8. 기타 core (json · throttler · config · types)

| | CRM | AX | GI | HG |
|---|---|---|---|---|
| json | `apps/base/.../core/json/json_transform.ts`(49): reviver 정규식 `^BigInt\([+-]?[0-9]*\)` (끝 앵커 없음) | `json-transform.ts`(70): 앵커 `$` + try/catch(설계 §10 지적), `webhook-raw-body.ts` | shared `bigintJsonReviver/Replacer` | shared `stringifyJSON` + `toWireSafe` |
| throttler | 없음 | `core/throttler/throttler.module.ts`(66): `ThrottlerModule.forRoot({throttlers:[{limit:10,ttl:300000}], getTracker: extractClientIp})`, **전역 가드 아님**, 로그인 라우트만 `@UseGuards(ThrottlerGuard)` | 없음(edge nginx 존 + argon2 비용) | 없음(edge + 계정 잠금) |
| config | 없음(env 직접) | `utils/app-env.util.ts`, `auth-env.util.ts`(getJwtSecret) 등 | `core/config/{env,timezone,boot-secrets,bootstrap,global-prefix,trust-proxy,body-limits}.ts` | `core/config/{env,timezone}.ts` |
| 클라이언트 IP | `request-ip.util.ts`: `x-forwarded-for` → `x-real-ip` → `x-remote-ip` → `req.ip`; IPv4 CIDR 만 | `request-info.util.ts`: `x-forwarded-for` → `socket.remoteAddress`, 45자 절단 | `req.ip`(trust proxy 1) | `request-ip.util.ts`(201): **`x-real-ip` 우선**, IPv4+**IPv6 CIDR** 파서 |
| Request 타입 확장 | `types/express.d.ts` 미발췌(`user`, `apiClient`, `auditMeta`, `auditTargetRefNo` 사용) | 미발췌 | 로컬 타입 `Request & {admin?}` | `core/types/express.d.ts`(33): `user`, `auditMeta`, `auditTargetRefNo` |

### 1-9. 감사 로그

| | CRM `backend-core/src/core/audit/` | HG `core/audit/` | AX / GI |
|---|---|---|---|
| 모듈 | `@Global`, `APP_INTERCEPTOR: AuditInterceptor`, `exports:[AuditService]` (19줄) | 동일(21줄) | **없음** |
| 데코레이터 | `@Audit({action, targetType?, paramKey?})` | `@Audit({action, targetType?})` — paramKey 대신 **경로 파라미터가 정확히 1개면 자동**, 아니면 `attachTarget` | — |
| 인터셉터 | `tap`/`catchError` 로 응답 상태 확정 후 `record`; 주체 `req.user` 또는 `req.apiClient`; 없으면 return | 동일 골격, 주체 `req.user` 만; write 전체 try/catch 로그 | — |
| 서비스 | `record`(INSERT 실패는 warn), `attachDiff(req,before,after,whitelist)`, `attachMeta`, `attachTarget`, `recordFromRequest` | 동일 API + `scrubSecrets()`(재귀 마스킹 `***`), `foldBigInts()`(bigint→string, Date→ISO), 컬럼 폭 절단 상수 | — |
| 블랙리스트 | `password, passwordHash, keyHash, refreshToken, accessToken, secret` | + `refreshTokenHash, s3AccessKeyEnc, s3SecretKeyEnc` | — |
| 액션 카탈로그 | `@crm/shared/schemas/audit-actions.ts`(43종, `AuditActions`, `AuditTargetTypes`, `ANONYMOUS_PRINCIPAL_REF_NO`) | `core/audit/audit-actions.const.ts`(379줄, 55키, `AuditAction` 유니온 타입, 한글 라벨 맵, `audit-catalog-count.test.ts` 로 수 고정) | — |
| @Public 라우트 | 컨트롤러가 `recordFromRequest` 직접 호출 | 서비스(`AuthService.login/refresh`)가 직접 호출, 가드의 IP 거부도 기록 | — |

---

## 2. 정본 후보와 이유

| 영역 | 정본 후보 | 이유 | 보완 출처 |
|---|---|---|---|
| DatabaseModule · 풀 옵션 · 플러그인 | **HG** `database.module.ts` + `pool-options.ts` | 풀 옵션 4종 명시(bigint/decimal/insertId/checkNumberRange), `logParam:false`(해시 유출 차단), `poolEnvInt` throw, Nest 미의존 옵션 파일(러너 공유). GI 와 사실상 동일 규약이고 GI 는 `onModuleDestroy` 까지 있음 | GI `onModuleDestroy`, CRM `maintainNestedObjectKeys:true`(JSON 컬럼 키 오염 사고 근거 — 정본에 **반드시** 반영) |
| BooleanTransformPlugin | **GI** 정규식판 | 허용목록 없이 snake/camel 양쪽 대응, 순서 의존 제거 | — |
| Database 타입 표기 | **HG** `tables/*.table.ts` 분리 + `types.ts` 조합 | 패키지가 테이블 타입을 개별 export 하기 좋음(GI 단일 710줄은 병합 어려움) | GI `Nullable<T>`/`Managed` 별칭, `COLUMN_LIMITS` 아이디어 |
| 마이그레이션 | **HG** 001~009 + 011 + `_shared.ts` | 테이블당 1장, collation 헬퍼, comment(), `Kysely<any>`, 재export 스텁 실증 | GI 003(유예창 컬럼 — 채택 시), GI `SEED_ROLES` export 방식, HG 010 부트스트랩 시드(랜덤 비밀번호+강제 변경) |
| sessions 스키마 | **HG** (해시 + `revokedReason`) | 평문 저장(CRM/AX) 배제. GI 의 `revokedAt/replacedBySessionNo` 는 유예창 옵션으로 확장 가능 | GI 003 |
| users 스키마 | **HG** 기본 컬럼 + 잠금·강제변경 | 잠금(`loginFailCount/lockUntil`)·`isPasswordChangeRequired` 를 갖고 팀/직책과 결합 | GI `isActive`, `lastLoginAt/Ip` 는 옵션 |
| AuthGuard | **HG** `auth.guard.ts` | JWT 예외 매핑, `checkSession` → 사용자 조회 → IP 평가 → `mapError` 봉투, 감사 기록. apiKey 경로 없음 | AX `checkSession(sessionNo, userNo)` 소유 대조(정본에 추가 권장 — HG/GI 는 없음), GI 의 payload `typeof bigint` 검사 |
| AuthService(로그인·회전) | **GI** `auth.service.ts` + `refresh-policy.ts` + `login-policy.ts` | 리포지토리 인터페이스 분리(`AUTH_REPOSITORY`) 덕분에 사용자 테이블 확장이 패키지 옵션으로 흡수 가능; 교차 탭 유예창은 실운영 문제(관리자 SPA 다중 탭) 해결; 잠금 알고리즘은 HG 와 동일 | HG 의 IP 평가·감사 5분기·`revokedReason` 3값(`terminated` 구분 → 관리자 강제종료가 재사용 오탐 안 됨) |
| 쿠키 | **HG** `cookie.util.ts` | set/clear 옵션 단일 함수, `secure` 를 proto‖NODE_ENV 로 fail-secure, lax, 이름 접두 분리 | GI 의 refresh 쿠키 path 축소(`/api/v1/auth`) — 옵션화 |
| PermissionGuard | **HG** (fail-closed + `@SelfOnly` + AND/OR) | CRM/AX 는 fail-open(HG 주석: 상류 22곳 데코레이터 0건). GI 도 fail-closed 지만 attendee 마커 얽힘 | GI `hasPermission/hasAnyPermission` 을 shared 순수 함수로 두는 방식(테스트 용이) |
| 예외 필터 · 에러 체계 | **GI** 필터 구조(`@Catch()` 전부·5xx 마스킹·소독) + **HG** `status-map.ts`(코드→상태 단일표) + `businessError()` | HG 필터는 `@Catch(BusinessException)` 만이라 raw 오류가 봉투 밖으로 샘(HG 자신의 `write-transaction.ts` 주석이 문제로 기록). 응답 본문은 `{statusCode, code, message, details?}` (GI/HG 동일) | AX `ER_ROW_IS_REFERENCED_2`, HG `ER_LOCK_*` 매핑 병합 |
| zod 검증 | **GI** `ZodValidationPipe(schema)` 매개변수 파이프 | 브리지 라이브러리 무의존(anatine 은 zod4 와 충돌해 Swagger 꺼짐, nestjs-zod 는 AX/TPL 만). 실패 응답에 `input` 미포함 | HG `parseBody` 중복 제거 |
| 감사 로그 | **HG** `core/audit/*` + `audit-logs.table.ts` | CRM 판에서 apiKey 주체 제거·`scrubSecrets`·`foldBigInts`·자동 targetRefNo·typed 카탈로그. 파티셔닝(CRM 012) 은 프로젝트 선택 | CRM `paramKey` 명시 옵션은 유지할 가치 있음(파라미터 2개 이상 라우트) |
| ip-access | **HG** `ip-evaluation.ts`(순수 함수 3층 `user>team>global`) + `request-ip.util.ts`(IPv6) | CRM 판은 role/apiKey 층·IPv4 전용·서비스 내부 판정. HG 는 순수 함수라 테스트·재사용 용이, 자기잠금 검사·잠금 미리보기까지 있음 | CRM `teamClosure` 조상 팀 상속(가까운 depth 우선)은 HG 에 없음(HG 는 직속 팀만) — 옵션 검토 |
| 세션 관리 모듈 | **HG** `sessions.*` (5라우트 · `revokedReason:'terminated'`) | 강제 종료가 `terminated` 로 기록돼 회전 재사용 판정과 분리 | CRM 의 목록 조회(`findAll` 페이지네이션·현재 세션 표시)는 DTO 참고 |
| 부트스트랩(main) | **GI** `configureApp()` 패턴 | main 과 테스트 부트스트랩이 같은 5단계를 공유 → 패키지가 `configureAdminApp(app)` 형태로 제공 가능 | HG `loadDotEnv/assertUtcTimezone/requireEnv` |

정리하면 **HG 가 코어 인프라 정본, GI 가 인증 서비스 정본**이다. HG 자체가 CRM 을 파일 단위로 이식하면서 수정 사유를 헤더에 남겼으므로(`// ported from kim5257-crm-v5@99eb3797 …`), CRM 대비 차이는 HG 헤더 주석으로 근거가 확보된다.

---

## 3. 확장점 — `AdminServerModule.forRoot(options)` 옵션 목록

읽은 코드에서 프로젝트마다 실제로 달랐던 값만 옵션으로 뽑았다.

| 옵션 | 타입(제안) | 근거(프로젝트 간 실차이) | 기본값 후보 |
|---|---|---|---|
| `db.token` | `symbol \| string` | 네 프로젝트 모두 `KYSELY = Symbol('KYSELY')` 를 **각자** 선언 → 패키지 심볼과 프로젝트 심볼이 다르면 이중 인스턴스. 패키지가 심볼을 export 하고 프로젝트가 재사용하거나, `forRoot({ db: { useExisting: PROJECT_KYSELY } })` 로 주입 | 패키지 export `KYSELY` |
| `db.createPool` / `db.poolOptions` | `() => Pool` 또는 `Partial<PoolConfig>` | timezone `'auto'`(CRM) vs `'Z'`(GI/HG) vs `'UTC'`(AX); `decimalAsNumber`; env 이름 `DB_NAME` vs `DB_DATABASE` | HG 옵션 세트 |
| `db.plugins` | `KyselyPlugin[]` | Boolean 허용목록(CRM 7개), `maintainNestedObjectKeys` | `[BooleanTransformPlugin, CamelCasePlugin({maintainNestedObjectKeys:true})]` |
| `auth.userTable` | 컬럼 매핑 `{ loginId:'userId'\|'loginId', passwordHash:'password'\|'passwordHash', displayName:'userName'\|'displayName', roleNo, active:'resignAt'\|'isActive', … }` 또는 `AuthRepository` 구현 교체 | GI(`loginId/passwordHash/displayName/isActive`) vs CRM·AX·HG(`userId/password/userName/resignAt`) | **`AUTH_REPOSITORY` 인터페이스 교체 방식**이 현실적(GI 실증). 컬럼 매핑 옵션은 Kysely 타입과 충돌 |
| `auth.userExtraColumns` / `principalMapper` | `(row) => Partial<AuthenticatedUser>` | AX `isPartner/hasPassword/suspension/scopes`, CRM `scopes/hiddenDbFilters/…`, HG `teamNo/teamName/isPasswordChangeRequired` | HG 필드 |
| `auth.accessTtl` / `refreshTtl` | `string \| number` | 1h(CRM/AX) vs 15m(GI/HG); 7d 공통 | `'15m'`, `'7d'` |
| `auth.refreshMode` | `'rotate' \| 'extend'` | CRM/AX 는 같은 행 연장, GI/HG 는 회전 | `'rotate'` |
| `auth.refreshGraceMs` | `number \| 0` | GI 30초 유예창(+`revokedAt/replacedBySessionNo` 컬럼 필요), HG 0 | `0`(컬럼 추가 마이그레이션 동반 시 활성) |
| `auth.reusePolicy` | `'revoke-all' \| 'reject-only'` | GI/HG revoke-all(`'rotated'` 재제시 시), 경쟁 0행은 둘 다 reject-only | `'revoke-all'` |
| `auth.lockout` | `{ maxFailures:5, lockMs:900000 } \| false` | GI/HG 동일 알고리즘, CRM/AX 없음 | on |
| `auth.loginFailureCode` | `'ERR_NO_USER' \| 'ERR_LOGIN_FAILED' \| 'ERR_INVALID_CREDENTIALS'` + status | 404(CRM/HG) vs 401(AX/GI) | 401 |
| `auth.jwtSecret` | `string \| () => string` | 폴백 유무·32자 하한(AX) | 필수, 32자 하한 |
| `auth.checkSessionOwnership` | `boolean` | AX 만 `(sessionNo, userNo)` 대조 | `true` |
| `auth.logoutRequiresAuth` | `boolean` | HG `@SelfOnly` vs 나머지 `@Public` | `false`(만료 후에도 쿠키 삭제 가능) |
| `cookies` | `{ accessName, refreshName, accessPath:'/', refreshPath:'/'\|'/api/v1/auth', sameSite:'lax'\|'strict', secure:'auto'\|boolean, domain? }` | 이름(`accessToken` vs `hg_admin_at`), path, strict/lax, secure 판정식 | HG 방식(`secure:'auto'` = proto‖NODE_ENV) |
| `globalPrefix` | `string` | `'api'` vs `'api/v1'` — refresh 쿠키 path 계산에 필요 | `'api/v1'` |
| `permissions.catalog` | `readonly string[]` + `ALL:'*'` | 프로젝트별 `PERMISSIONS` 집합이 전부 다름; 가드는 `'*'` 와 문자열 비교만 하므로 카탈로그는 **타입 파라미터** + 폐집합 검증용 `toPermissions` 로 받으면 됨 | 필수 |
| `permissions.failClosed` | `boolean` | fail-open(CRM/AX) vs closed(GI/HG) | `true` |
| `permissions.selfOnlyKey` / 마커 이름 | `string` | `@SelfOnly`(HG) vs `@AdminAuth`(GI) — 하나로 통일하고 alias export | `SelfOnly` |
| `permissions.extraGuards` | `Type<CanActivate>[]` | AX `SuspensionGuard`, CRM `RequireEditItems` | `[]` |
| `ipAccess` | `{ enabled, layers:['user','team','global'], inheritTeamAncestors:boolean, ipv6:boolean, seedRules }` | CRM 5층+조상 상속, HG 3층 직속 | HG |
| `teams.enabled` | `boolean` | GI 팀 없음 → `teamUserMap` INNER JOIN 을 끄거나 LEFT 로 | `true` |
| `audit` | `{ enabled, sink?: (entry)=>Promise<void>, catalog, blacklist:string[], principalTypes?:['user','apiKey'], partitioning:boolean }` | AX/GI 없음, CRM apiKey 주체·파티셔닝, HG 블랙리스트 확장 | HG + `sink` 기본은 `auditLogs` INSERT |
| `errors.codeMap` | `Record<ErrorCode, HttpStatus>` 확장 | 프로젝트별 코드 추가(HG 30, AX 97) · 같은 코드 다른 상태(ACCOUNT_LOCKED 403 vs 423) | 패키지 기본표 + 프로젝트 병합(중복 키는 프로젝트 우선) |
| `errors.responseShape` | `'statusCode' \| 'success'` | `{statusCode,code,message,details}`(GI/HG) vs `{success:false,code,message}`(AX/TPL) — 프론트 클라이언트가 분기하므로 호환 필요 | `'statusCode'` |
| `serialization.bigint` | `'interceptor' \| 'replacer' \| 'manual'` | 세 방식 공존 | `'replacer'`(GI `configureApp`) |
| `validation` | `'pipe' \| 'nestjs-zod'` | GI 파이프 vs AX nestjs-zod | 패키지는 자체 파이프 제공, nestjs-zod 는 프로젝트 선택 |
| `routes.prefix` | `{ auth:'auth', sessions:'sessions'\|'admin/sessions', ipAccess:'ip-access'\|'admin/ip-access' }` | HG 만 `admin/` 접두 | `'admin/'` 없음(프로젝트 컨트롤러 prefix 로 감쌈) |
| `bootstrap` | `configureAdminApp(app, {jsonLimit, trustProxy, prefixExclude})` 별도 함수 | GI `configureApp` 5단계 | — |

### 마이그레이션을 패키지에서 export 하는 방안 — 실현 가능성: **높음(조건부)**

근거:
1. HG `migrations-infinity/*.ts` 는 `export { up, down } from '../migrations/001_roles.migration.js'` **8줄 재export 스텁**이고, 주석이 "kysely-ctl 의 `isMigration()` 이 네임스페이스의 `up` 함수만 본다"고 실증. 따라서 프로젝트 `migrations/001_admin_roles.migration.ts` 가 `export { up, down } from '@ssworks/admin-server/migrations/001_roles.js'` 로 위임 가능.
2. GI/HG 마이그레이션은 `Kysely<any>` 라 앱 `Database` 타입에 결합되지 않음(AX 001 은 `Kysely<Database>` — 이 방식은 패키지화 불가).
3. 마이그레이션 외부 의존은 `_shared.ts` 헬퍼와 `hashPassword`(시드) 뿐 → 둘 다 패키지 안에 둘 수 있음.

조건·주의:
- **파일명 순서**: kysely-ctl 은 파일명 정렬로 실행하므로 패키지가 번호(`001_roles`…)를 고정하면 프로젝트의 도메인 마이그레이션은 그 뒤 번호부터. 패키지 버전업으로 새 장(예: `020_sessions_grace`)이 추가되면 프로젝트가 스텁을 **추가로 만들어야** 적용됨 — "패키지가 마이그레이션 목록을 export 하고 프로젝트 `kysely.config.ts` 의 `migrations.provider` 로 병합"하는 방식이 더 안전하나, `kysely.config.ts` 가 발췌되지 않아 현재 구성(`FileMigrationProvider` 로 추정)은 확인 불가.
- **테넌트/도메인 옵션과 스키마 결합**: `users` 확장 컬럼(AX email, GI isActive), `teams` 유무, `sessions` 유예 컬럼은 스키마 분기다. 패키지는 "코어 장"만 제공하고 확장은 프로젝트 ALTER 로 두는 것이 GI 003/016·HG 011/014 패턴과 일치한다.
- 시드는 마이그레이션에서 분리 권장(HG 010 은 users 0행 검증·stdout 비밀번호 출력 등 운영 절차 포함, CRM/AX 는 고정 비밀번호 시드).
- 컬럼명은 camelCase 빌더 + CamelCasePlugin 전제이므로 **러너의 플러그인 구성이 앱과 같아야** 한다(CRM `kysely-plugins.ts` 주석의 사고 사례). 패키지가 `createMigrationKysely()` 또는 `adminKyselyPlugins()` 를 함께 export 해야 한다.

---

## 4. A / B / X 배정

A = 패키지(`@ssworks/admin-server`), B = 템플릿 복사·프로젝트 소유, X = 도메인 특화 제외.

| 대상 | 배정 | 근거 |
|---|---|---|
| `DatabaseModule`(KYSELY 토큰·팩토리·플러그인·`poolEnvInt`) | **A** | 4/4 동일 골격, 옵션 차이만 |
| `BooleanTransformPlugin`, `adminKyselyPlugins()` | A | 허용목록은 옵션 |
| `Database` 코어 테이블 타입(`RolesTable/UsersTable/TeamsTable/TeamClosureTable/TeamUserMapTable/SessionsTable/IpAccessRulesTable/AuditLogsTable/UserEmploymentPeriodsTable`) | A(export) + 프로젝트가 `interface Database extends AdminDatabase {...}` | 5절 병합 방법 참조 |
| 마이그레이션 코어 장(roles/users/teams/closure/map/sessions/ip_access_rules/audit_logs/employment_periods/sessions_revoke_reason/roles_unique) + `_shared.ts` | A(export) + B(스텁 파일) | 3절 |
| 부트스트랩 시드(`010_bootstrap_seed`, `seeds/bootstrap.ts`) | **B** | 역할명·팀명·IP 규칙이 프로젝트 값(HG `SEED_ROLES` '최고관리자', GI '관리자/편집자', AX '관리자/일반') |
| `AuthGuard`, `PermissionGuard`, `@Public/@SelfOnly/@RequirePermissions/@RequireAnyPermissions/@CurrentUser/@Cookies/@Audit` | A | 메타키 문자열은 패키지 상수로 통일(GI `gise:` 접두는 버림) |
| `AuthService`(login/refresh/logout/checkSession), `login-policy.ts`, `refresh-policy.ts`, `token.util.ts`, `password.util.ts`(argon2id m=65536,t=3,p=4 — 4/4 동일) | A | GI 구조 + HG 정책 |
| `AuthRepository` 인터페이스 + `KyselyAuthRepository` | A(기본 구현) / B(교체 구현) | 사용자 테이블 확장 흡수 지점 |
| `AuthController`(login/refresh/logout/me/password) | A(옵션으로 라우트 prefix·응답 필드) | /me 응답 필드는 프로젝트 차이(HG bigint 제외) → `principalMapper` |
| `cookie.util.ts` | A | 옵션화 |
| `SessionsModule`(목록·강제종료·본인 종료) | A | 권한 키만 프로젝트 카탈로그에서 주입 |
| `IpAccessModule`(`ip-evaluation.ts`, `request-ip.util.ts`, CRUD) | A | 자기잠금 검사·미리보기(HG 635줄 서비스)는 A 에 두되 옵션. `role`/`apiKey` 층은 X |
| `AuditModule`(service·interceptor·decorator·table) | A | 카탈로그·블랙리스트·sink 옵션 |
| `audit-actions.const.ts`(프로젝트 액션 카탈로그) | **B** | 도메인 액션 포함. 패키지는 코어 액션(auth.*, session.*, ip.*, user/role/team.*)만 export 하고 프로젝트가 spread 병합 |
| 예외 필터·`BusinessException`·`businessError`·`mapError`·`runQuery/runWriteTransaction` | A | 코드 표는 병합형 |
| 에러 코드 상수(코어 `ERR_COMMON_*`, 인증 코드) | A(export) + B(프로젝트 확장) | 프론트도 쓰므로 Nest 비의존 서브패스(`@ssworks/admin-server/shared`)로 분리 필요(HG `error-codes.ts` 헤더가 shared 에 HttpException 을 두지 말라고 명시) |
| `ZodValidationPipe(schema)` | A | GI 판 |
| `JsonTransformInterceptor`/`jsonParser`/`configureAdminApp` | A(선택 export) | 프로젝트가 직렬화 방식 선택 |
| `env.ts`(`loadDotEnv/requireEnv`), `timezone.ts`(`assertUtcTimezone`) | A(유틸) | GI/HG 동일 |
| `main.ts`, `app.module.ts` | **B** | 프로젝트 고유 배선. 템플릿은 명시 등록형(HG/GI) 채택 |
| `password-recheck.ts`(재인증) | A | HG/CRM 동일 취지 |
| `monotonicity.ts` + `guardLocks` | A(옵션 `superAdminSurvival`) 또는 B | HG 만 있음, 하지만 관리자 공통 관심사. 1차는 B 권장(guardLocks 마이그레이션 동반) |
| `throttler.module.ts` | B | AX 만, edge 구성에 의존 |
| `SuspensionGuard`/`@AllowWhenSuspended` | X | AX 파트너 정지 도메인 |
| X-API-Key 인증·`apiKeys`·`/ext/v1/*`·`introspect` | X | CRM 외부 연동 |
| `RequireEditItems`/`GuardEditItemFields`/`scopes`/`scope-filter.helper` | X | CRM DB 항목 권한 |
| AX 소셜/이메일 OTP/셀프가입/pending signup(`social-*.ts`, `email-*.ts`, `signup.*`, `pending-state.service.ts`, `oauth/*`) | X | 도메인(향후 별도 플러그인 검토) |
| GI 참석자 주체(`AttendeeAuthGuard`, `attendee-principal.ts`, `origin-check.ts`, `@AttendeeAuth*`, `@CurrentAttendee`) | X | 회원 로그인 도메인 |
| GI `boot-secrets.ts`(OAUTH_ENCRYPTION_KEY) | X | 소셜 |
| CRM `scope-key-guard.ts` | A(부팅 자가검사로 일반화 가능) 또는 B | roles.scopes 전용이면 X |
| HG 테넌트 마이그레이션 폴더 | B | 프로젝트 배포 구조 |

---

## 5. 걸림돌

1. **NestJS 버전**: 전부 11.x(`^11.0.1`~`^11.1.17`) → peerDependency `@nestjs/common ^11` 로 충분. `@nestjs/schedule` 은 6.x(CRM/AX) vs 12.x(HG) 로 갈리나 이 범위 밖(패키지는 schedule 미의존 권장; HG `CleanupScheduleModule` 은 B).
2. **ESM/CJS**: 5/5 `type: module`, 상대 import 에 `.js` 확장자, TPL backend `module: NodeNext`. 패키지는 **ESM 전용**으로 배포(`exports` 맵 + `.js` 확장자). 데코레이터 메타데이터(`emitDecoratorMetadata`)는 소비 프로젝트 tsconfig 책임 — GI `tsconfig.base.json` 에는 없고 앱 tsconfig 가 미발췌라 확인 불가. CRM backend-core 가 `"main": "dist/index.js", "files": ["dist","src"]` 로 이미 같은 형태의 라이브러리 패키지로 동작 중(참고 모델). 단, jest 환경(CRM)은 `moduleNameMapper` 로 `.js` → 소스 매핑이 필요(CRM package.json `jest.moduleNameMapper` 참조), vitest(AX/GI/HG)는 불필요.
3. **scope alias 의존**: 코어 파일들이 `@crm/shared`, `@axion-admin/shared`, `@gise/shared`, `@hangang/shared` 에서 `ErrorCodes/PERMISSIONS/stringifyJSON/parseJSON/Permission/BusinessError` 를 가져온다. 패키지는 이 다섯을 **자체 서브패스로 제공**해야 하고, 프로젝트 shared 는 그것을 re-export 하는 형태로 바뀐다. 특히 (a) `stringifyJSON/parseJSON` 의 `"BigInt(N)"` 래퍼 문법이 프로젝트마다 재구현돼 있고 reviver 정규식이 다름(CRM 앵커 없음 vs AX 앵커) → 패키지 단일 구현 필수, (b) GI 의 `BusinessError` 는 shared(Nest 무의존)에 있고 HG/CRM 의 `BusinessException` 은 api(`HttpException` 상속)에 있음 → 패키지는 GI 방식(코어 오류 클래스는 Nest 무의존, 필터가 상태 매핑)이 프론트 공유에 유리.
4. **Database 타입 병합**: 네 프로젝트 모두 `Kysely<Database>` 의 `Database` 를 **자기 파일에서** 선언하고 `@Inject(KYSELY)` 로 받는다. 패키지 서비스는 `Kysely<AdminDatabase>` 로 컴파일되므로, 프로젝트는
   - `interface Database extends AdminDatabase { posts: PostsTable; … }` 로 확장(구조적 서브타입이라 `Kysely<Database>` 인스턴스를 패키지 `KYSELY` 토큰에 그대로 제공 가능 — Kysely 는 `Kysely<DB>` 가 공변이 아니므로 **타입 단언이 필요**할 수 있음. 실측 근거는 없음, 검증 항목),
   - 코어 테이블 확장(AX `users.email`, GI `users.isActive`, AX `roles.isPartner`)은 `AdminDatabase['users'] & { email: … }` 형태의 인터섹션으로만 가능하고, 패키지 코드는 확장 컬럼을 모르므로 **읽기 경로는 `AuthRepository` 교체**로 열어야 함(GI 실증). 컬럼명 자체가 다른 GI(`loginId/passwordHash/displayName`)는 리포지토리 교체 없이는 수용 불가.
   - `Database` 키 표기 불일치: AX 는 `balance_ops`, `app_settings` 등 snake 키 혼용 → 병합 시 충돌 없음(도메인 키)이나 규약 문서화 필요.
5. **에러 응답 봉투 불일치**: `{success:false,code,message}`(AX/TPL/CRM 추정) vs `{statusCode,code,message,details?}`(GI/HG). 프론트 API 클라이언트가 `code` 로 분기한다는 점은 공통이므로 `code` 만 보장하고 `responseShape` 옵션으로 과도기 지원.
6. **에러 코드 네이밍**: GI 만 `ERR_VALIDATION_FAILED`/`ERR_INTERNAL`(COMMON 접두 없음), 상태도 `ACCOUNT_LOCKED` 423 vs HG 403. 패키지 코드표를 채택하면 GI 프론트가 코드 문자열을 갈아야 함.
7. **인증 정책 차이의 마이그레이션 비용**: CRM/AX 는 refresh 평문 저장 + 같은 행 연장. 패키지(해시+회전) 채택 시 `sessions.refreshToken → refreshTokenHash` ALTER + 전 세션 무효화(재로그인)가 불가피. `revokedReason` 값 집합도 GI(`logout/reuse/rotated/admin`) vs HG(`rotated/terminated/reuse_detected`) 로 다르다.
8. **PermissionGuard fail-closed 전환 비용**: CRM/AX 는 데코레이터 없는 라우트가 통과에 의존(HG 주석: 상류 22곳 데코레이터 0건). 패키지 기본이 fail-closed 면 CRM/AX 이식 시 라우트마다 `@SelfOnly`/권한 마커를 붙여야 함 → `permissions.failClosed:false` 과도기 옵션 필요.
9. **kysely.config.ts 부재**: 마이그레이션 러너 구성(provider, 플러그인, 풀 공유 여부, HG `MIGRATION_DIR` 접두 가드)이 발췌에 없어 3절의 export 방안은 러너 파일 확인 후 확정해야 한다.
10. **Swagger/zod 브리지**: CRM 은 `@anatine/zod-nestjs` 가 zod 4 와 충돌해 Swagger 를 껐고, AX/TPL 은 `nestjs-zod`. 패키지가 DTO 클래스를 export 하지 않고 zod 스키마 + 파이프만 제공하면 브리지 의존이 사라지지만, Swagger 문서를 쓰는 AX 는 자체 `createZodDto` 래핑이 필요.
11. **globSync 자동 로더**: CRM/AX/TPL 은 `src/**/*.module.ts` 를 전부 import 하므로, 프로젝트가 패키지 모듈을 `forRoot()` 로 등록하면서 동시에 같은 이름의 로컬 모듈이 남아 있으면 이중 등록된다. 이식 시 로컬 `auth/sessions/ip-access` 모듈 삭제가 선행돼야 한다.
12. **BigInt 직렬화 3원화**: 인터셉터(CRM/AX/TPL) · json replacer(GI) · 수동 `toWireSafe`(HG). 패키지 컨트롤러가 bigint 를 반환하면 HG 방식 프로젝트에서는 500 이 난다(HG `auth.controller.ts:108-115` 가 그 이유로 /me 에서 bigint 를 뺐다). 패키지 컨트롤러 응답은 `configureAdminApp` 의 replacer 를 전제로 하거나, 응답 직전 fold 를 패키지 안에서 수행해야 한다.
13. **HG 사용자 조회의 INNER JOIN**: `findMeByUserNo` 가 `teamUserMap` 을 INNER JOIN 해 팀 미배정 계정이 401 (HG `team-user-map.table.ts:10-13`, `users.service.ts:362-364`). 팀이 없는 GI 형 프로젝트에서는 `teams.enabled:false` 시 LEFT JOIN 으로 바뀌어야 하고, 그 경우 IP `team` 층이 비는 것을 `evaluateIpAccess` 가 허용해야 한다(HG 주석이 정확히 이 부작용을 경고).
