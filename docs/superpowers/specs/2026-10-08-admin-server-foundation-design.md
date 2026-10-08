# admin-server 기반 · 코어 스키마 설계 (Phase 2 PR 2a)

작성일: 2026-10-08 · 상태: 확정(구현 전) · 선행: `docs/01-phase0.md` §1(BE 정본) · §2-3 · §3-2 · §4 · §5, `docs/phase0-reports/be-core-auth.md` §1-2 · §1-6 · §1-7 · §1-8 · §3, `be-modules.md` §5, 3a~3e 스펙 §9(서버 계약)

이 문서는 둘을 담는다. §1 은 **Phase 2 전체 지도**(PR 목록 · 순서 · 공통 결정)이고, §2 부터는 첫 PR 2a 의 설계다. 다음 PR 의 스펙은 §1 을 선행으로 적고 자기 범위만 쓴다.

## 1. Phase 2 지도

### 1-1. 목표

`@ssworks/admin-server` 를 NestJS 12 + Kysely 0.29(MariaDB) 모듈로 채운다. 쓰는 쪽은 신규 서비스의 관리자 API 이고 클라이언트는 이미 만든 admin-ui 다. 정본 넷(hangang 코어 인프라 · gise 인증 서비스 · crm 모듈 골격 · axion 보강)이 복사-수정으로 갈라 둔 서버 코드를 한 벌로 모으고, admin-ui 가 기대는 계약(3a~3e §9, `01-phase0` §4)을 테스트로 증명한다.

### 1-2. 경계 결정 (2026-10-08)

결정 문서(HTML)로 골랐다. 모두 권장안이고, 버전 범위만 따로 물어 정했다.

| 결정             | 확정                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⓪ PR #2 머지     | **M1** — 2a 를 `main` 에 넣기 전에 Version Packages PR #2(0.3.0)를 사람이 머지한다. 0.3.0 = Phase 1 마무리                                                                                                                                                         |
| ⓐ §3-2 옵션표    | **T1** — `envelope` · `errors.responseShape` · `serialization.bigint` 를 지우고 "봉투 · bigint replacer 고정(§4 #1 · #3)" 으로 바꾼다. 2a 에서 고친다                                                                                                              |
| ① PR 분할        | **P6** — 여섯 PR(§1-3). 브랜딩 설정은 보류(쓰는 화면이 없고 로고 · 파비콘은 파일 저장(B)이 필요)                                                                                                                                                                   |
| ② 테스트         | **D1** — 세 층. ① 순수 단위 ② DB 없는 HTTP(프로브 컨트롤러) — 둘은 `pnpm check`. ③ 실 MariaDB 11.4(마이그레이션 · 질의 · 잠금 · 제약 · **모듈 라우트의 HTTP 계약**) — `pnpm test:db` 와 CI 필수 잡. Kysely 컴파일 SQL 비교는 마이그레이션 DDL 식별자 검사에만 쓴다 |
| ③ 마이그레이션   | **S1** — 스텁 파일. 패키지는 장을 `@ssworks/admin-server/migrations/<id>` 로 내고, 쓰는 쪽 폴더에 한 줄 재export 스텁을 둔다                                                                                                                                       |
| ④ 모듈 등록      | **R2** — 코어 `AdminServerModule.forRoot` · `forRootAsync` 하나 + 기능 모듈을 쓰는 쪽이 골라 import(`app.module.ts` 는 B)                                                                                                                                          |
| ⑤ 의존성         | **E1** — 쓰는 쪽과 인스턴스 · 타입을 공유하는 것은 peer, `@node-rs/argon2` · `cookie-parser` 만 `dependencies`                                                                                                                                                     |
| ⑥ `private` 해제 | **V1** — Phase 2 끝(2f + 확인용 앱 실서버 확인 뒤). 그때까지 마이그레이션 장 · 공개 API 를 고칠 수 있다. 첫 발행은 사람이 로컬 2FA 로                                                                                                                              |
| 버전 범위        | **최신만** — `@nestjs/*` `^12`, `kysely` `^0.29`, `@kim5257/kysely-mariadb-dialect` `^0.2`. 정본(Nest 11 · kysely 0.28)에서 옮길 때 판 차이를 실측해 고친다(§12)                                                                                                   |

### 1-3. PR 목록 · 순서 · 끝 상태

| PR · 브랜치                                              | 범위                                                                                                                                                                                                                                                                                        | 끝 상태 — 테스트로 증명하는 것                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2a 기반 · 코어 스키마** `feat/admin-server-foundation` | 이 문서 §2~                                                                                                                                                                                                                                                                                 | 봉투 · bigint · 오류 · 검증 경로, 코어 7장 up/down, 소비 스모크                                                                                                                                                                                                                                       |
| 2b 인증 `feat/admin-server-auth`                         | `password.util`(argon2id) · `password-recheck` · `cookie.util` · login/refresh 정책 · `AUTH_REPOSITORY` + Kysely 구현 · `AuthService` · `AuthGuard` · `PermissionGuard` · 데코레이터 · `AuthController`(login · refresh · logout · me · password) · 강제 변경. IP · 감사는 선택 주입 자리만 | 로그인 → 쿠키 → `/me` → 회전 → 옛 토큰 재제시 시 전 세션 폐기 + `ERR_REFRESH_REUSED`. 잠금 423, 자격 불일치 401 `ERR_LOGIN_FAILED`, 만료 `ERR_EXPIRED_TOKEN`, 표시 없는 라우트 403, 강제 변경 계정은 비밀번호 변경만, 틀린 현재 비밀번호 = `ERR_COMMON_VALIDATION` + `issues[currentPassword]`(3c W1) |
| 2c 세션 · 감사 `feat/admin-server-sessions-audit`        | `SessionsModule` 6라우트(3c §9) · `AuditModule`(`@Audit` · 인터셉터 · `scrubSecrets` · `foldBigInts` · 코어 액션 + 병합) · `auditLogs` 장 · `AuditLogsModule` · 인증 경로 감사 연결                                                                                                         | 세션 행이 `adminSessionListItemSchema` 로 파싱, `isCurrent`, 현재 세션 끊기 거부, 남의 세션 404, `{revokedCount}`, 감사 비밀 필드 `***`, 실패 요청 기록                                                                                                                                               |
| 2d 사용자 · 역할 `feat/admin-server-users-roles`         | `UsersModule`(목록 · 단건 · 생성 · 수정 · 퇴사 · 재입사 · 퇴사일 · 재직 이력 · 비밀번호 초기화 · 잠금 해제) · `RolesModule` · `judgeAccountCommand` · `permissions.normalize` · 권한 상승 검사 · 전권자 잔존(`guardLocks` 장) · 임시 비밀번호                                               | 3b §9 전부, 3c 비밀번호 초기화                                                                                                                                                                                                                                                                        |
| 2e 팀 · 약관 `feat/admin-server-teams-legal`             | `TeamsModule`(3d §9) · admin-shared 에 `ERR_TEAM_HAS_MEMBERS` · `ERR_TEAM_MOVE_CYCLE` · 약관 모듈(3e §9, `legalDocuments` 장, 종류 카탈로그 옵션)                                                                                                                                           | 3d · 3e §9 표의 모든 행                                                                                                                                                                                                                                                                               |
| 2f IP 접근 제어 `feat/admin-server-ip-access`            | `ipAccessRules` 장 · `ip-evaluation`(user > team > global, IPv4 · IPv6) · `request-ip.util` · CRUD · 자기 잠금 검사 · 미리보기 · 인증 경로 연결                                                                                                                                             | 평가 3층, 자기 잠금 저장 거부, 차단 IP 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp`(admin-ui README 배선이 읽는 값)                                                                                                                                                                                  |

순서는 2a → 2b → 2c → {2d, 2e, 2f}. 2d · 2e · 2f 는 서로 기대지 않는다 — admin-ui 화면이 기대는 2d · 2e 를 먼저, 화면 없는 IP 를 끝에 둔다. 감사(2c)가 사용자 · 역할보다 앞이라 `@Audit` 을 라우트와 함께 붙인다. 모든 PR 이 끝나면 확인용 앱 `%TEMP%\aksv` 를 가짜 서버 대신 실제 서버 + Docker MariaDB 에 붙여 체크리스트 1 · 2장 중 서버가 관여하는 항목을 다시 본다(범위는 그때 정한다).

### 1-4. 공통 결정 (모든 PR)

1. **라우트 자리.** 관리자 라우트는 인증까지 전부 `routePrefix`(기본 `admin`) 아래에 둔다(`admin/auth/login` · `admin/users` …). admin-ui 는 `baseURL: '/api/admin'`(전역 prefix 는 쓰는 쪽 몫)에 `/auth/login` · `/users` 로 부른다. 같은 서버의 회원용 `/auth` 와 겹치지 않는다.
2. **응답.** 컨트롤러는 값만 돌려주고 전역 인터셉터가 `{ success: true, data }` 로 싼다. bigint 는 Express `json replacer`(admin-shared `bigintJsonReplacer`), 요청 본문은 reviver. `configureAdminApp` 을 부르지 않은 앱은 기동에서 멈춘다.
3. **쿼리.** `query parser: 'extended'` — admin-ui 의 `filter[key]` 를 받는다(crm · axion 과 같음). 객체 주입은 zod 검증이 막는다.
4. **오류.** 서비스는 admin-shared `BusinessError` 만 던진다. 상태는 코드표 하나(`httpStatusFor`)가 정한다. 서버 전용 코드표를 만들지 않고, 새 코어 코드는 admin-shared 에 더한다.
5. **데이터 접근.** 서비스가 Kysely 를 직접 쓴다(hangang 형). 판정은 순수 함수(정책 · `judge*`)로 빼서 단위 테스트한다. 리포지토리 교체 지점은 `AUTH_REPOSITORY` 하나다(컬럼 매핑 옵션은 만들지 않는다).
6. **시간.** 프로세스 TZ 가 UTC 가 아니면 기동하지 않는다. 풀 `timezone: 'Z'`. 앱과 마이그레이션 러너는 같은 함수로 Kysely 를 만든다.
7. **changeset.** 미발행 동안에도 PR 마다 admin-server changeset(minor)을 쓴다 — 첫 발행의 CHANGELOG 가 된다. `fixed` 묶음이라 그사이 Version Packages 를 머지하면 세 패키지 버전이 함께 오르지만 admin-server 는 `private` 라 npm 에 나가지 않는다.

### 1-5. 확인한 사실 (2026-10-08 실측)

- kysely-ctl 0.20 · 0.21 은 `migrations.provider` 를 받는다(`migrationFolder` 와 배타). §3-2 의 "확인 필요" 가 풀렸다. 그러나 Kysely `Migrator` 는 이름순으로 정렬하고 이미 적용된 장보다 앞에 새 장이 오면 기본값(`allowUnorderedMigrations: false`)에서 거부한다 — 패키지 장과 쓰는 쪽 장이 따로 자라면 언젠가 그렇게 된다. 그래서 ③ S1.
- Express 5 의 기본 쿼리 파서는 `simple` 이라 `filter[userId]=…` 가 객체가 되지 않는다.
- `RouterModule`(`@nestjs/core` 11.2.1 · 12.1.2)은 모듈 클래스에 경로 메타데이터를 붙이고 컨테이너에 없는 모듈은 건너뛴다.
- Express 쪽 오류(본문 JSON 깨짐 · 본문 초과 · 없는 경로)도 Nest 가 `setErrorHandler` · `setNotFoundHandler` 로 전역 필터에 보낸다. JSON 깨짐은 `BadRequestException` 으로 바뀌어 오고, 본문 초과는 body-parser 의 `http-errors` 객체(`status` 413 · `expose: true`)가 **그대로** 온다(`routes-resolver.js` `mapExternalException`).
- zod 4.6.5 는 `safeParse(value, { error: z.locales.ko().localeError })` 로 요청마다 한국어 메시지를 건다. 스키마에 적은 문구가 이긴다.
- Nest 12 는 ESM 전용(`"type": "module"`)이고 여전히 `design:paramtypes`(레거시 데코레이터 + `emitDecoratorMetadata`)로 주입한다. `@nestjs/common` · `@nestjs/core` 가 `reflect-metadata` 를 스스로 import 한다. `@nestjs/platform-express` 12 는 `express` 5.2.1 · `path-to-regexp` 8.4.2 — 11.2 와 같다.
- kysely 0.29 는 `Migrator` · `MigrationProvider` 를 **`kysely/migration` 하위 경로**로 옮겼다(루트 export 에 없음). Node 22 이상. `CamelCasePlugin({ maintainNestedObjectKeys })` 은 그대로.
- `@kim5257/kysely-mariadb-dialect` 0.2.0 peer: `kysely >=0.28 <0.30`, `mariadb ^3`. kysely-ctl 0.21 peer: `kysely <0.30`, Node 22.
- 정본들이 쓰는 MariaDB 는 11.4 가 가장 많다.

## 2. 2a 목표

모든 후속 PR 이 기대는 바닥을 깐다. 이 PR 이 끝나면:

- 쓰는 쪽이 `AdminServerModule.forRootAsync` 한 줄과 `configureAdminApp(app)` 한 줄로 **봉투 · bigint · 오류 · 검증 · `admin/` prefix** 가 맞는 API 를 갖는다. 자기 컨트롤러도 같은 계약을 따른다.
- 코어 스키마 7장(roles · users · teams · teamClosure · teamUserMap · userEmploymentPeriods · sessions)을 스텁으로 적용하고, `interface Database extends AdminDatabase` 로 자기 테이블을 더한다.
- 마이그레이션 러너(`kysely.config.ts`)는 Nest 를 싣지 않는 `@ssworks/admin-server/runner` 만 import 하고, 앱과 같은 풀 옵션 · 플러그인을 쓴다.

기능 모듈은 아직 없다 — 인증부터는 2b.

## 3. 2a 결정 (설계안 승인 2026-10-08)

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | 진입점 셋: `@ssworks/admin-server`(전부) · `@ssworks/admin-server/runner`(Nest 무의존 — 러너 · 시드 · `main.ts` 의 `NestFactory` 전 단계) · `@ssworks/admin-server/migrations/<id>`(장 하나). 🔴 `runner` 의 import 그래프에 `@nestjs/*` 가 없다 — 테스트가 지킨다                                                                                                                                                                                           |
| F2  | `forRootAsync` 가 기본 경로다. ESM 은 import 를 먼저 평가하므로 `forRoot({ db: adminDbConnectionFromEnv() })` 는 `main.ts` 의 `loadDotEnv()` 보다 먼저 돈다. `routePrefix` 는 `RouterModule` 이 정적 값을 요구해 async 옵션에서도 정적 필드다                                                                                                                                                                                                                |
| F3  | prefix 는 코어 모듈이 `RouterModule.register` 로 붙인다. 목록은 패키지가 아는 기능 모듈 전체이고, 쓰는 쪽이 import 하지 않은 모듈은 `RouterModule` 이 건너뛴다(§1-5). 🔴 기능 모듈 파일은 코어 모듈 파일을 import 하지 않는다 — 토큰은 `tokens.ts` 에(순환 방지). 2a 의 목록은 비어 있고, 테스트는 내부 빌더에 프로브 모듈을 넘겨 잰다. `routePrefix: ''` 면 `RouterModule` 을 넣지 않는다                                                                   |
| F4  | 봉투는 **앱 전체**(전역 인터셉터) + `@RawResponse()` 로 뺀다. 반환값 `undefined` 는 `data: null`. `StreamableFile` · `Buffer` 는 건드리지 않는다. HTTP 가 아닌 컨텍스트는 통과                                                                                                                                                                                                                                                                               |
| F5  | 🔴 **replacer 부팅 검사.** `onApplicationBootstrap` 에서 Express `json replacer` 가 admin-shared `bigintJsonReplacer` 와 **같은 함수**인지 본다. 아니면 "`configureAdminApp(app)` 을 `app.init()` · `listen()` 전에 불러야 한다" 로 던진다. HTTP 어댑터가 없으면(애플리케이션 컨텍스트) 보지 않는다. 같은 함수가 아니라는 것은 admin-shared 가 두 벌 설치됐다는 뜻이기도 하다 — 그 상태는 `BusinessError` `instanceof` 도 깨지므로 기동에서 멈추는 것이 맞다 |
| F6  | 🔴 **필터는 replacer 에 기대지 않는다.** gise 소독기(순환 · 던지는 getter · 깊이 32 를 마커로)를 지난 본문을 `stringifyJSON` 으로 직접 보낸다. 이 필터에 온 요청은 반드시 응답을 받는다 — 본문 만들기가 던지면 500 고정 본문, 전송이 던지면 로그만. 헤더가 이미 나갔으면 다시 보내지 않는다                                                                                                                                                                  |
| F7  | 5xx 는 메시지 고정("서버 내부 오류가 발생했습니다.") · `details` 제외. 원문 · `cause` · `details` 는 Nest `Logger` 로만(소독 경계를 지나서). 4xx 는 로그를 남기지 않는다                                                                                                                                                                                                                                                                                     |
| F8  | 검증 실패 = 400 `ERR_COMMON_VALIDATION` + `details.issues[{ path, code, message }]`. 🔴 `path` 는 **배열 그대로**(admin-shared `validationDetailsSchema` · admin-ui `toFieldErrors` 계약 — gise 는 점으로 이어 보냈다). symbol 키는 `String()`. `input`(보낸 원문)은 싣지 않는다(비밀번호가 되돌아 나간다 — gise). 메시지는 요청마다 zod `ko` 로케일, 전역 `z.config` 는 건드리지 않는다                                                                     |
| F9  | `ParseBigIntPipe` — 경로 · 쿼리 매개변수 `"12"` → `12n`. 0 이상 정수(부호 없음), `BIGINT UNSIGNED` 상한까지. 아니면 F8 과 같은 400, `path: [매개변수 이름]`                                                                                                                                                                                                                                                                                                  |
| F10 | `mapError` 는 `BusinessError` 를 그대로 통과시키고, 드라이버 오류는 `code` 로 갈라 `BusinessError` 로 바꾼다(§5-5 표). 원본은 `cause`. 모르는 오류는 `ERR_COMMON_INTERNAL`. 🔴 UNIQUE 를 도메인 코드로 바꾸는 일(팀 이름 → `ERR_DUPLICATE_TEAM_NAME`)은 그 모듈이 제약 이름을 보고 한다 — `logParam: false` 여도 서버 메시지의 키 이름은 남는다                                                                                                              |
| F11 | `loadDotEnv(file)` 은 경로(`string \| URL`)를 받는다 — 정본은 자기 파일 위치에서 저장소 루트를 셌는데 패키지는 그 깊이를 모른다. `ENOENT` 만 조용히 넘기고 그 밖의 읽기 오류는 던진다(gise). 이미 있는 키를 덮지 않는다. 값을 로그 · 메시지에 담지 않는다                                                                                                                                                                                                    |
| F12 | 풀 옵션은 `adminPoolConfig()` 한 곳에서 고정한다 — `timezone: 'Z'` · `bigIntAsNumber` · `decimalAsNumber` · `insertIdAsNumber` 모두 false · `checkNumberRange: true` · 🔴 `logParam: false`(argon2 · refresh 해시가 오류 메시지로 새는 길, hangang A2). 쓰는 쪽이 바꿀 수 있는 것은 접속 정보와 `connectionLimit`(기본 10) · `acquireTimeout`(기본 10 000ms)뿐                                                                                               |
| F13 | 플러그인 `[BooleanTransformPlugin, CamelCasePlugin({ maintainNestedObjectKeys: true })]` — 순서가 의미를 갖는다(boolean 판정이 snake 원본 키를 먼저 본다). Boolean 판정은 gise 정규식판 `/^(?:is\|has)(?:_[a-z0-9]\|[A-Z0-9])/`, 허용목록 없음. 🔴 `maintainNestedObjectKeys` 는 hangang · gise 의 앱 · 러너에 없다 — crm 이 JSON 컬럼 안쪽 키 오염 사고(2026-09-15)로 넣었다. 앱과 러너가 같은 `adminKyselyPlugins()` 를 써서 갈리지 않는다                 |
| F14 | 코어 장은 hangang 001~006 · 008 · 011 · 014 를 바탕으로 한다. 바꾼 점: roles · users 에 `revision`(§4 #4), roleName UNIQUE 를 첫 장에, `password` varchar(255), `deviceInfo` → `userAgent`(admin-shared 계약 이름), 세션 유예창 컬럼(`revokedAt` · `replacedBySessionNo`, gise 003), `loginAt` 은 넣을 수 있게 · `lastAccessAt` 은 `ON UPDATE` 없이(§6-2)                                                                                                    |
| F15 | `users.roleNo` 는 **NOT NULL + FK restrict**(hangang). 직책 없는 계정이 생기지 않고, 쓰는 중인 역할 삭제는 DB 가 `ERR_COMMON_IN_USE` 로 막는다(3b 의 사용 중 삭제 거부와 맞음)                                                                                                                                                                                                                                                                               |
| F16 | `assertAdminMigrationStubs(folder)` — 폴더의 스텁을 읽어 ① 빠진 장 ② 파일 이름 순서가 장 순서와 어긋남(FK 때문에 roles 가 users 앞) ③ 모르는 · 겹친 ID 를 **한 번에 모아** 던진다. 쓰는 쪽 `kysely.config.ts` 가 부르면 `kysely migrate` 가 시작 전에 멈춘다                                                                                                                                                                                                 |
| F17 | JSON 컬럼의 SELECT 타입은 `unknown` 이고 `readJsonColumn()` 으로 읽는다(gise). `mariadb` 드라이버는 `autoJsonMap` 기본값 때문에 파싱된 값을 줄 때도, 문자열을 줄 때도 있다                                                                                                                                                                                                                                                                                   |

## 4. 정본과 흡수 목록

| 산출물                                          | 정본                                                                                            | 흡수할 것                                                                                                                       | 버릴 것                                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdminServerModule`                             | hangang `app.module.ts`(명시 등록) · gise `bootstrap.ts`                                        | 전역 필터 · 인터셉터를 DI 로(`APP_FILTER` · `APP_INTERCEPTOR`)                                                                  | 앱별 모듈 목록(→ B)                                                                                                                          |
| `configureAdminApp`                             | gise `core/config/bootstrap.ts` · `body-limits.ts`                                              | cookie-parser, `useBodyParser('json', { limit, reviver })`, `json replacer`, 본문 한도 1mb                                      | `applyGlobalPrefix`(→ 쓰는 쪽), `applyTrustProxy`(→ 2f), 옵션 금지 규칙(패키지는 `jsonLimit` 하나를 받는다)                                  |
| `+ query parser`                                | crm · axion `main.ts`                                                                           | `app.set('query parser', 'extended')`                                                                                           | —                                                                                                                                            |
| `AdminExceptionFilter`                          | gise `business-exception.filter.ts`                                                             | `@Catch()` 전부, 소독기, 5xx 마스킹, "반드시 응답", `logSafely`, 상태 정규화                                                    | `{ statusCode, … }` 본문(→ `{ success: false, … }`), 상태 역조회 표(→ 고정 표 §5-4)                                                          |
| `mapError` · `runQuery` · `runWriteTransaction` | hangang `error.util.ts` · `write-transaction.ts`, gise `run.ts`, axion `ER_ROW_IS_REFERENCED_2` | 매핑 표 · 원본 `cause` 보존 · "`safeExecute` 를 쓰지 않는다"                                                                    | `BusinessException extends HttpException`(→ admin-shared `BusinessError`), `safeExecute`, gise `label` 인자, tx 안 네트워크 I/O 단언(→ 보류) |
| `ZodValidationPipe`                             | gise `pipes/zod-validation.pipe.ts`                                                             | 매개변수 파이프, 파싱 결과 반환, `input` 제외                                                                                   | 점으로 이은 `path`(→ 배열), gise 코드 이름                                                                                                   |
| `DatabaseModule` 몫 · 풀                        | hangang `database.module.ts` · `pool-options.ts`, gise `pool.ts` · `database.module.ts`         | 숫자 옵션 넷 명시, `logParam: false`, `poolEnvInt` throw · 값 비노출, `onModuleDestroy` 에서 `destroy()`, Nest 무의존 옵션 파일 | 모듈이 `process.env` 를 직접 읽음(→ 옵션), `DB_DATABASE`(gise)                                                                               |
| 플러그인                                        | gise `boolean-transform.plugin.ts` + crm `maintainNestedObjectKeys`                             | 정규식판, 순서 주석                                                                                                             | hangang 허용목록                                                                                                                             |
| env · TZ                                        | hangang `config/env.ts` · `timezone.ts`, gise `env.ts`                                          | `parseDotEnv`(첫 `=` 뒤 전부) · 덮지 않음 · `ENOENT` 만 무시 · 이름만 담는 `requireEnv`, 실효 오프셋 세 시점                    | 모듈 위치 기준 루트 계산(→ 인자)                                                                                                             |
| 코어 장 · 테이블 타입                           | hangang `migrations/001~006 · 008 · 011 · 014` · `_shared.ts` · `tables/*.table.ts`, gise 003   | 테이블당 한 장, 이름 있는 제약, collation 헬퍼, `Kysely<any>`, `down()`, `tinyint(1)` 을 `sql` 로 넘기는 우회, 컬럼 주석        | 시드(010 → B), 테넌트 폴더, 014 의 중복 선행 진단(새 스키마라 필요 없음)                                                                     |
| `readJsonColumn`                                | gise `json-column.ts`                                                                           | 문자열이면 파싱, 잘못된 JSON 은 던짐                                                                                            | —                                                                                                                                            |

## 5. 공개 API

### 5-1. 진입점 (`package.json` `exports`)

```jsonc
{
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  "./runner": { "types": "./dist/runner.d.ts", "import": "./dist/runner.js" },
  "./migrations/*": {
    "types": "./dist/database/migrations/*.d.ts",
    "import": "./dist/database/migrations/*.js",
  },
  "./package.json": "./package.json",
}
```

`runner` 가 내는 것은 `.` 도 낸다(같은 모듈 인스턴스). `./migrations/*` 는 장 파일만 문서화한다 — `_shared` · `index` 도 닿지만 쓰지 않는다.

### 5-2. `AdminServerModule` (`admin-server.module.ts` · `options.ts` · `tokens.ts`)

```ts
export interface AdminServerOptions {
  /** DB 접속. 보통 `adminDbConnectionFromEnv()` */
  db: AdminDbConnection
  /**
   * 프로젝트 오류 코드표(admin-shared `defineErrorCodes` 결과). 필터가 `BusinessError` 의 상태를 여기서 찾는다.
   * 없으면 코어 표(`COMMON_ERROR_STATUS`). 표에 없는 코드는 500.
   */
  errorCodes?: Pick<ErrorCodeTable<Record<string, string>>, 'httpStatusFor'>
}

/** 정적 옵션 — `RouterModule` 이 모듈 정의 시점의 값을 요구한다(F2) */
export interface AdminServerStaticOptions {
  /** 관리자 라우트 prefix. 기본 `'admin'`. `''` 이면 붙이지 않는다 */
  routePrefix?: string
}

export interface AdminServerAsyncOptions extends AdminServerStaticOptions {
  imports?: ModuleMetadata['imports']
  inject?: FactoryProvider['inject']
  useFactory: (...args: any[]) => AdminServerOptions | Promise<AdminServerOptions>
}

export class AdminServerModule {
  static forRoot(options: AdminServerOptions & AdminServerStaticOptions): DynamicModule
  static forRootAsync(options: AdminServerAsyncOptions): DynamicModule
}

export const ADMIN_SERVER_OPTIONS: unique symbol // 해석된 AdminServerOptions
export const KYSELY: unique symbol // Kysely<AdminDatabase> — 쓰는 쪽은 @Inject(KYSELY) db: Kysely<Database>
```

- 동적 모듈은 `global: true`. 제공: `ADMIN_SERVER_OPTIONS` · `KYSELY`(`createAdminKysely(options.db)`) · `APP_FILTER` `AdminExceptionFilter` · `APP_INTERCEPTOR` `AdminEnvelopeInterceptor` · 부팅 검사(F5). 내보냄: `ADMIN_SERVER_OPTIONS` · `KYSELY`.
- `onModuleDestroy` 에서 `KYSELY` 를 `destroy()` 한다(풀이 생성 즉시 연결을 시도하고 재시도 타이머를 남긴다 — gise). 쓰는 쪽 `main.ts` 가 `app.enableShutdownHooks()` 를 부른다(README).
- 기능 모듈 목록(`ADMIN_ROUTE_MODULES`)은 내부 상수다. 2a 는 빈 배열, 2b 부터 모듈이 붙는다.

### 5-3. 러너 (`@ssworks/admin-server/runner`)

```ts
// config/env.ts
export function parseDotEnv(raw: string): Record<string, string>
export function loadDotEnv(file: string | URL): void
export function requireEnv(keys: readonly string[]): void // 없는 키의 이름만 담아 던진다

// config/timezone.ts
export function isEffectiveUtc(now?: Date): boolean // 지금 · 1월 1일 · 7월 1일 오프셋이 모두 0
export function assertUtcTimezone(context: string): void

// database/connection.ts
export interface AdminDbConnection {
  host: string
  port?: number // 기본 3306
  user: string
  password: string
  database: string
  connectionLimit?: number // 기본 10
  acquireTimeout?: number // ms, 기본 10_000
}
export function adminPoolConfig(connection: AdminDbConnection): PoolConfig // F12
/** DB_HOST · DB_PORT · DB_USER · DB_PASSWORD · DB_NAME · DB_POOL_LIMIT · DB_ACQUIRE_TIMEOUT_MS */
export function adminDbConnectionFromEnv(env?: Record<string, string | undefined>): AdminDbConnection
export function poolEnvInt(name: string, fallback: number, env?: Record<string, string | undefined>): number

// database/kysely.ts
export function adminKyselyPlugins(): KyselyPlugin[] // 부를 때마다 새 인스턴스
export function createAdminKysely<DB = AdminDatabase>(connection: AdminDbConnection): Kysely<DB>
export class BooleanTransformPlugin implements KyselyPlugin

// database/run.ts · map-error.ts · json.ts
export function runQuery<T>(fn: () => Promise<T>): Promise<T>
export function runWriteTransaction<DB, T>(db: Kysely<DB>, fn: (trx: Transaction<DB>) => Promise<T>): Promise<T>
export function mapError(error: unknown): BusinessError
export function readJsonColumn(value: unknown): unknown

// database/migrations/index.ts
export const ADMIN_MIGRATIONS: readonly AdminMigrationId[] // 0001_roles … 0007_sessions, 순서대로
export type AdminMigrationId = (typeof ADMIN_MIGRATIONS)[number]
export function assertAdminMigrationStubs(folder: string | URL): void // F16

// database/types.ts — 타입만
export interface AdminDatabase { roles; users; teams; teamClosure; teamUserMap; userEmploymentPeriods; sessions }
export type AdminRolesTable · AdminUsersTable · AdminTeamsTable · AdminTeamClosureTable · AdminTeamUserMapTable
  · AdminUserEmploymentPeriodsTable · AdminSessionsTable · AdminSessionRevokeReason
```

- `adminDbConnectionFromEnv` 는 `DB_HOST` · `DB_USER` · `DB_PASSWORD` · `DB_NAME` 이 없으면 **이름만** 담아 던진다(hangang 이름 — gise 의 `DB_DATABASE` 는 쓰는 쪽이 객체를 직접 만들어 넘긴다). 숫자는 `poolEnvInt`.
- `runWriteTransaction` 은 정본처럼 `Kysely<Database>` 에 묶지 않고 제네릭이다 — 쓰는 쪽 `Database` 로도 부른다.
- 🔴 재인증(argon2)을 트랜잭션 안에서 부르지 않는다(hangang `password-recheck` 헤더) — 주석으로 옮긴다.
- `assertAdminMigrationStubs`: 폴더(쓰는 쪽 cwd 기준, kysely-ctl `migrationFolder` 와 같음)의 `.ts` · `.mts` · `.js` · `.mjs`(`.d.ts` 제외)를 이름순(`Array#sort` — Kysely `Migrator` 와 같은 비교)으로 읽고 `@ssworks/admin-server/migrations/(\d{4}_[a-z_]+)` 를 찾는다. 오류 문구는 한국어로, 고칠 파일 이름과 빠진 ID 를 담는다.

### 5-4. HTTP (`.`)

```ts
export function configureAdminApp(app: NestExpressApplication, options?: { jsonLimit?: string | number }): void
// cookie-parser → useBodyParser('json', { limit: jsonLimit ?? '1mb', reviver: bigintJsonReviver })
// → set('json replacer', bigintJsonReplacer) → set('query parser', 'extended')

export function RawResponse(): CustomDecorator // F4

export class AdminEnvelopeInterceptor implements NestInterceptor // 전역 등록은 모듈이 한다
export class AdminExceptionFilter implements ExceptionFilter // 〃

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(schema: ZodType<T>)
}
export class ParseBigIntPipe implements PipeTransform<string, bigint>

/** 서비스가 필드 오류를 직접 낼 때(2b 의 틀린 현재 비밀번호 등) — F8 과 같은 모양의 BusinessError */
export function validationError(issues: ValidationIssue[], message?: string): BusinessError
```

필터의 분기:

| 들어온 것                                                | 상태                                                              | 코드                                                                    | 메시지                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `BusinessError`                                          | `errorCodes.httpStatusFor(code)`(없으면 코어 표, 표에 없으면 500) | 그대로                                                                  | 4xx 그대로 · 5xx 고정                                                     |
| `HttpException` 4xx                                      | 그대로                                                            | 아래 표                                                                 | 예외의 메시지(gise `messageOfHttpException`)                              |
| Express `http-errors`(`status` 400~499 · `expose: true`) | 그대로                                                            | 아래 표                                                                 | 고정 — 413 "요청 본문이 너무 큽니다.", 그 밖 "요청을 처리할 수 없습니다." |
| `HttpException` 5xx · 그 밖 모든 값                      | 503 · 504 는 그대로, 나머지 500                                   | `ERR_COMMON_UNAVAILABLE` · `ERR_COMMON_TIMEOUT` · `ERR_COMMON_INTERNAL` | 고정                                                                      |

상태 → 코드: 400 `ERR_COMMON_BAD_REQUEST` · 401 `ERR_COMMON_UNAUTHORIZED` · 403 `ERR_COMMON_FORBIDDEN` · 404 `ERR_COMMON_NOT_FOUND` · 409 `ERR_COMMON_CONFLICT` · 413 `ERR_COMMON_PAYLOAD_TOO_LARGE` · 429 `ERR_COMMON_TOO_MANY_REQUESTS` · 그 밖 4xx `ERR_COMMON_BAD_REQUEST`.

### 5-5. `mapError` 표

| 드라이버 `code`                              | `BusinessError`              | 메시지                                          | 근거                                                                      |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `ER_DUP_ENTRY`                               | `ERR_COMMON_DUPLICATED` 409  | 이미 존재하는 값입니다.                         | hangang                                                                   |
| `ER_ROW_IS_REFERENCED_2`                     | `ERR_COMMON_IN_USE` 409      | 다른 데이터가 참조하고 있어 처리할 수 없습니다. | axion. hangang 은 CONFLICT — admin-shared 에 FK restrict 전용 코드가 있다 |
| `ER_NO_REFERENCED_ROW_2`                     | `ERR_COMMON_BAD_REQUEST` 400 | 참조 대상이 없습니다.                           | hangang                                                                   |
| `ER_LOCK_DEADLOCK`                           | `ERR_COMMON_CONFLICT` 409    | 동시 처리 충돌입니다. 다시 시도해 주세요.       | hangang · gise                                                            |
| `ER_LOCK_WAIT_TIMEOUT` · `ETIMEDOUT`         | `ERR_COMMON_TIMEOUT` 504     | 처리가 지연되고 있습니다. 다시 시도해 주세요.   | hangang                                                                   |
| `ECONNREFUSED` · `ER_GET_CONNECTION_TIMEOUT` | `ERR_COMMON_UNAVAILABLE` 503 | 데이터베이스에 연결할 수 없습니다.              | hangang + 풀 대기 초과                                                    |
| 그 밖                                        | `ERR_COMMON_INTERNAL` 500    | 일시적인 오류가 발생했습니다.                   | 원본은 `cause`                                                            |

드라이버 오류는 `code` 문자열로 가른다 — `mariadb` 3.5.4 `SqlError` 는 서버 오류면 `ErrorCodes[errno]`, 클라이언트 오류(45000~45999)면 그 키를 `code` 에 싣는다(`ER_GET_CONNECTION_TIMEOUT` = 45028, 설치본 `lib/misc/errors.js` 실측).

## 6. 코어 스키마

### 6-1. 장 (`src/database/migrations/`)

공통: `Kysely<any>`, 모든 `createTable` 꼬리에 `TABLE_OPTIONS`(`engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin`), 사람이 입력하는 이름 · 아이디는 `UTF8_CI`(`utf8mb4_unicode_ci`), 토큰 · 해시는 `ASCII_BIN`, JSON 은 `JSON_BIN`, 제약 · 인덱스는 이름을 준다, `ifNotExists()` 없음, 모든 장에 `down()`. 시각 기본값은 `CURRENT_TIMESTAMP`. `tinyint(1)` 은 `sql` 템플릿으로 넘긴다(Kysely 의 `ColumnDataType` 폐집합에 없음). 컬럼명은 camelCase 로 쓰고 `CamelCasePlugin` 이 snake 로 바꾼다 — 🔴 `sql` 조각 안 식별자는 바뀌지 않는다(hangang 037).

| 장                             | 컬럼                                                                                                                                                                                                                                                                                                                                                                                                                            | 제약 · 인덱스                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0001_roles`                   | `roleNo` bigint unsigned PK AI · `roleName` varchar(64) ci NOT NULL · `permissions` json NOT NULL · `displayOrder` int unsigned NOT NULL 0 · `isDefault` tinyint(1) NOT NULL 0 · `revision` int unsigned NOT NULL 0 · `createAt` · `updateAt`(ON UPDATE)                                                                                                                                                                        | `uqRolesRoleName`                                                                                                                                |
| `0002_users`                   | `userNo` PK AI · `userId` varchar(64) ci NOT NULL · `password` varchar(255) NOT NULL · `userName` varchar(64) ci NOT NULL · `roleNo` bigint unsigned NOT NULL · `joinAt` timestamp NOT NULL now · `resignAt` timestamp NULL · `isPasswordChangeRequired` tinyint(1) NOT NULL 0 · `loginFailCount` int unsigned NOT NULL 0 · `lockUntil` datetime NULL · `revision` int unsigned NOT NULL 0 · `createAt` · `updateAt`            | `uqUsersUserId`, `fkUsersRole` → roles(restrict / cascade)                                                                                       |
| `0003_teams`                   | `teamNo` PK AI · `teamName` varchar(64) ci NOT NULL · `displayOrder` int unsigned NOT NULL 0 · `createAt` · `updateAt`                                                                                                                                                                                                                                                                                                          | `uqTeamsName`                                                                                                                                    |
| `0004_team_closure`            | `ancestorNo` · `descendantNo` bigint unsigned NOT NULL · `depth` int unsigned NOT NULL 0                                                                                                                                                                                                                                                                                                                                        | `pkTeamClosure`(둘), `fkTeamClosureAncestor` · `fkTeamClosureDescendant` → teams(cascade), `idxTeamClosureDescendant`                            |
| `0005_team_user_map`           | `teamNo` · `userNo` bigint unsigned NOT NULL · `joinAt` timestamp NOT NULL now                                                                                                                                                                                                                                                                                                                                                  | `pkTeamUserMap`(둘), `fkTeamUserMapTeam` · `fkTeamUserMapUser`(cascade), `idxTeamUserMapUser`                                                    |
| `0006_user_employment_periods` | `periodNo` PK AI · `userNo` NOT NULL · `joinAt` date NOT NULL · `resignAt` date NULL · `reason` varchar(255) NULL · `recordedTimezone` varchar(64) NOT NULL · `createdBy` bigint unsigned NULL · `createAt`                                                                                                                                                                                                                     | `fkUserEmploymentPeriodsUser`(restrict), `idxUserEmploymentPeriodsUserJoin`(userNo, joinAt) · `idxUserEmploymentPeriodsActive`(userNo, resignAt) |
| `0007_sessions`                | `sessionNo` PK AI · `userNo` NOT NULL · `refreshTokenHash` char(64) ascii_bin NOT NULL · `userAgent` varchar(512) NULL · `ipAddress` varchar(45) NULL · `loginAt` timestamp NOT NULL now · `lastAccessAt` timestamp NOT NULL now(ON UPDATE 없음) · `expireAt` datetime NOT NULL · `isRevoked` tinyint(1) NOT NULL 0 · `revokedReason` varchar(16) NULL · `revokedAt` datetime NULL · `replacedBySessionNo` bigint unsigned NULL | `uqSessionsRefreshTokenHash`, `fkSessionsUser`(cascade), `idxSessionsUser` · `idxSessionsExpireAt`                                               |

### 6-2. 정본에서 바꾼 점 (장 머리 주석에 그대로 적는다)

- **`revision`(roles · users).** `01-phase0` §4 #4 "roles · users · settings 코어 테이블에 revision". 역할은 3b §9 가 쓴다. 사용자 쪽 사용은 2d 가 정한다.
- **roleName UNIQUE 를 첫 장에.** hangang 은 014 에서 중복 진단 뒤 걸었다. 새 스키마라 처음부터.
- **`password` varchar(255).** hangang 은 char(128). argon2id 인코딩은 97자 안팎이나 매개변수가 바뀌면 는다(gise 와 같음). 이름은 hangang · crm · axion 의 `password` — 기본 `AUTH_REPOSITORY` 가 기대는 이름이다.
- **`deviceInfo` → `userAgent`.** admin-shared `adminSessionSchema` 의 필드 이름. 응답에서 바꿔 담지 않는다.
- **유예창 컬럼.** gise 003 의 `revokedAt`(datetime — `updateAt` 을 기준으로 쓰지 않는 이유는 gise 주석) · `replacedBySessionNo`(bigint — gise 는 integer. FK · 인덱스 없음, gise 근거). §4 #6 이 유예창을 옵션으로 정했고 쓸지는 2b 가 정한다.
- **`loginAt` 을 넣을 수 있게, `lastAccessAt` 은 `ON UPDATE` 없이.** 회전은 새 행을 만든다. hangang 은 `loginAt` 이 DB 기본값뿐이라 살아 있는 행의 로그인 시각이 마지막 회전 시각이 됐다(3c 세션 표가 그 값을 보인다). 2b 가 새 행에 옛 `loginAt` 을 옮겨 담는다. `ON UPDATE` 는 폐기 UPDATE 에도 반응해 마지막 활동 시각을 바꾼다 — 앱이 직접 쓴다.
- **`revokedReason` 값.** hangang 셋(`rotated` · `terminated` · `reuse_detected`)을 `AdminSessionRevokeReason` 으로 둔다. `'rotated'` 만 재사용 판정 대상이다(hangang 011 주석을 옮긴다). 2b 가 바꿀 수 있다(미발행).

### 6-3. 테이블 타입

hangang `tables/*.table.ts` 표기를 따른다. 자동 값은 `Generated<…>`, DB 가 채우고 앱이 쓰지 않는 시각은 `ColumnType<Date, never, never>`, 기본값이 있어 넣을 때 생략할 수 있는 시각은 `ColumnType<Date, Date | undefined, Date>`. 차이:

- `permissions` 는 `ColumnType<unknown, string, string>` — 읽기는 `readJsonColumn` + zod, 쓰기는 `JSON.stringify`(F17, gise). 프로젝트 권한 타입은 패키지가 모른다.
- `sessions.loginAt` 은 `ColumnType<Date, Date | undefined, never>`(넣을 수 있고 고칠 수 없다), `lastAccessAt` 은 `ColumnType<Date, Date | undefined, Date>`.
- 쓰는 쪽은 `interface Database extends AdminDatabase { posts: PostsTable }` 로 넓힌다. 코어 테이블 컬럼을 더하려면 `users: AdminUsersTable & { email: string | null }` — 패키지 코드는 더한 컬럼을 모르므로 NOT NULL 확장 컬럼은 DEFAULT 를 둬야 한다(`01-phase0` §5).

## 7. 의존성

- `peerDependencies`(⑤ E1, 버전 범위 결정): `@nestjs/common` · `@nestjs/core` · `@nestjs/platform-express` `^12.0.0`, `kysely` `^0.29.0`, `mariadb` `^3.4.0`, `@kim5257/kysely-mariadb-dialect` `^0.2.0`, `reflect-metadata` `^0.2.0`, `rxjs` `^7.8.0`, `zod` `^4.0.0`(유지), `@ssworks/admin-shared` `workspace:^0`(유지). `@nestjs/jwt` 는 2b.
- `dependencies`: `cookie-parser` `^1.4.7`. `@node-rs/argon2` 는 2b.
- `devDependencies`: 위 peer 의 개발 판(2026-10-08 최신 — Nest 12.1.2 · kysely 0.29.6 · mariadb 3.5.4 · dialect 0.2.0 · rxjs 7.8.2 · reflect-metadata 0.2.2), `@nestjs/testing` `^12.0.0`, `supertest` `^7.3.1`, `@types/supertest` `^7.2.1`, `@types/express` `^5.0.6`, `@types/cookie-parser` `^1.4.10`. kysely-ctl 은 들이지 않는다(스모크 앱이 설치한다).
- `engines.node` `>=22`(kysely 0.29 · kysely-ctl 0.21).
- `@nestjs/platform-express` peer 는 `configureAdminApp` 이 Express 설정을 만지기 때문이다 — Fastify 는 지원하지 않는다(정본 넷 모두 Express).

## 8. 파일

| 파일                                                                                                                                  | 내용                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/admin-server/src/index.ts`                                                                                                  | 전부 내보냄(러너 포함). `ADMIN_SERVER_PHASE` 는 지운다                        |
| `src/runner.ts`                                                                                                                       | §5-3 만                                                                       |
| `src/tokens.ts`                                                                                                                       | `KYSELY` · `ADMIN_SERVER_OPTIONS` · `RAW_RESPONSE` 메타 키                    |
| `src/options.ts`                                                                                                                      | §5-2 타입                                                                     |
| `src/admin-server.module.ts`                                                                                                          | `AdminServerModule` · 내부 빌더 · `ADMIN_ROUTE_MODULES` · 부팅 검사           |
| `src/config/env.ts` · `timezone.ts`                                                                                                   | §5-3                                                                          |
| `src/database/connection.ts` · `kysely.ts` · `boolean-transform.plugin.ts` · `run.ts` · `map-error.ts` · `json.ts`                    | §5-3 · §5-5                                                                   |
| `src/database/types.ts` · `tables/*.ts`                                                                                               | §6-3                                                                          |
| `src/database/migrations/_shared.ts` · `0001_roles.ts` … `0007_sessions.ts` · `index.ts`                                              | §6-1 · F16                                                                    |
| `src/http/configure-admin-app.ts` · `envelope.interceptor.ts` · `exception.filter.ts` · `json-safe.ts` · `pipes.ts` · `validation.ts` | §5-4                                                                          |
| `src/test-support/*`                                                                                                                  | 프로브 모듈 · HTTP 부트스트랩 · DB 하네스. 🔴 `tsconfig.build.json` 에서 뺀다 |
| `*.test.ts`(옆에) · `*.db.test.ts`                                                                                                    | §9                                                                            |
| `packages/admin-server/vitest.db.config.ts`                                                                                           | DB 층. 루트 projects 글롭(`vitest.config.*`)에 안 잡힌다                      |
| `packages/admin-server/package.json` · `tsconfig*.json` · `README.md`                                                                 | §5-1 · §7 · §10                                                               |
| 루트 `package.json`                                                                                                                   | `test:db` · `db:test:up` · `db:test:down`                                     |
| `.github/workflows/ci.yml`                                                                                                            | `db` 잡                                                                       |
| `.changeset/admin-server-foundation.md`                                                                                               | §10                                                                           |
| `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`                                                                                 | §10                                                                           |

## 9. 테스트 계약

- **단위(`pnpm check`):**
  - `parseDotEnv` — 주석 · 빈 줄 · 따옴표 · 첫 `=` 뒤 전부(base64 패딩) · 빈 값 무시. `loadDotEnv` — 이미 있는 키 유지 · 없는 파일 무시 · 디렉터리 경로면 던짐 · `URL` 인자. `requireEnv` — 이름만, 값 없음.
  - `isEffectiveUtc` — UTC · `Asia/Seoul` · `Europe/London`(겨울만 0 — 세 시점이 잡는다). `assertUtcTimezone` 문구에 context.
  - `poolEnvInt` — 없음 · 빈 문자열은 기본값, `ten` · `0` · `-1` · `1.5` 는 던짐, 메시지에 값이 없음. `adminDbConnectionFromEnv` — 빠진 이름 모아 던짐, 값 비노출. `adminPoolConfig` — F12 의 고정값(`logParam: false` 포함)과 기본 크기.
  - `BooleanTransformPlugin` — `is_x` · `has_x` · `isX` 의 0/1 → boolean, `island` · `hash` · `history` 는 그대로, 0/1 이 아닌 값은 그대로. `adminKyselyPlugins()` — 순서 · `maintainNestedObjectKeys`.
  - `mapError` — §5-5 표 전 행(가짜 드라이버 오류 객체), `BusinessError` 동일성, `cause` 보존.
  - `readJsonColumn` — 문자열 · 파싱된 값 · 잘못된 JSON 은 던짐.
  - 소독기 — 순환 · DAG(두 가지 모두 남음) · 던지는 getter · 깊이 상한 · `Date` · bigint 그대로 · `NaN` → null. 절대 던지지 않음.
  - `assertAdminMigrationStubs` — 다 있음 · 빠짐 · 순서 어긋남 · 모르는 ID · 겹침 · 문제 여럿을 한 번에 · `.d.ts` 무시 · 없는 폴더.
  - 마이그레이션 DDL — 7장 `up()` 을 DummyDriver + `MysqlQueryCompiler` + 앱 플러그인으로 돌려 나가는 SQL 의 백틱 식별자가 전부 snake_case, 따옴표 밖에 camelCase 토큰이 없음(hangang 037). `down()` 도 돈다.
  - 🔴 `runner` 그래프 — `src/runner.ts` 에서 상대 import 를 따라간 파일 어디에도 `@nestjs/` import 가 없다.
- **DB 없는 HTTP(`pnpm check`, 프로브 모듈 + supertest + `configureAdminApp`):**
  - 성공: `{ success: true, data }`, bigint → `"BigInt(n)"`, Date → ISO, `undefined` → `data: null`, `@RawResponse()` 는 맨몸, `StreamableFile` 통과.
  - 요청: 본문 `"BigInt(5)"` → 핸들러가 `5n` 을 받음, `?filter[a]=1&sortBy=x&sortBy=y` → `{ filter: { a: '1' }, sortBy: ['x', 'y'] }`, 쿠키를 읽음.
  - prefix: 내부 빌더에 프로브 모듈을 넘기면 `/admin/probe`, `routePrefix: ''` 면 `/probe`, 목록에 없는 모듈은 prefix 없음.
  - 오류: BusinessError 4xx 본문(`details` 포함) · 5xx 마스킹(`details` 빠짐, 로그에 원문) · `errorCodes` 의 프로젝트 코드 상태 · 표에 없는 코드 500 · `HttpException` 403 · 없는 경로 404 · 본문 1mb 초과 413 · 깨진 JSON 400 · `throw 'x'` 500 · bigint 를 든 `details` 직렬화 · 본문이 admin-shared `errorRespSchema` 로 파싱됨.
  - 검증: `ZodValidationPipe` 실패 본문이 `validationDetailsSchema` 로 파싱되고 `path` 가 배열(`['members', 0, 'name']`), 한국어 기본 문구, 스키마 문구 우선, `input` 없음, 성공 시 파싱 결과(기본값 · coerce 적용)가 핸들러에. `validationError()` 같은 모양. `ParseBigIntPipe` — `12` 통과, `-1` · `1.5` · `abc` · `18446744073709551616` 은 400 + `path: [이름]`.
  - 부팅 검사: `configureAdminApp` 없이 `app.init()` 은 던진다, 부른 뒤에는 통과, 애플리케이션 컨텍스트는 검사 없음.
- **실 MariaDB(`pnpm test:db`, 파일마다 새 데이터베이스):**
  - 7장 up → down → up, `kysely_migration` 행 수.
  - `information_schema` 실측: 컬럼 collation(`userId` · `roleName` · `teamName` ci, `refreshTokenHash` ascii_bin, 테이블 기본 utf8mb4_bin), 제약 이름, `lastAccessAt` 에 ON UPDATE 없음, `users.roleNo` NOT NULL.
  - `mapError` 실물: UNIQUE(`userId` 대소문자만 다른 값 — ci 라 중복) → DUPLICATED, 쓰는 중 역할 삭제 → IN_USE, 없는 roleNo 로 사용자 삽입 → BAD_REQUEST.
  - `runWriteTransaction` — 안에서 던지면 롤백, `BusinessError` 는 그대로.
  - 왕복: bigint PK(`insertId` · SELECT 가 bigint), `isDefault` · `isRevoked` boolean, `timezone: 'Z'` 로 넣은 `Date` 가 같은 순간으로 돌아옴, JSON 컬럼(임시 테이블)의 안쪽 camelCase 키가 그대로 · `permissions` 배열을 `readJsonColumn` 으로.
- 테스트 전용 `data-testid` 같은 표지를 소스에 심지 않는다. 프로브 모듈은 `src/test-support/` 에만 있다.

## 10. 릴리스 · 문서

- **changeset**(`.changeset/admin-server-foundation.md`, admin-server **minor**). 첫 줄은 쓰는 쪽이 할 일: peer 설치(`pnpm add @nestjs/common@^12 @nestjs/core@^12 @nestjs/platform-express@^12 kysely@^0.29 mariadb @kim5257/kysely-mariadb-dialect@^0.2 reflect-metadata rxjs zod @ssworks/admin-shared`), `main.ts` 에 `configureAdminApp(app)`, `kysely.config.ts` 를 러너로, 스텁 7개. 미발행이라 npm 에는 나가지 않는다(§1-4 #7).
- **admin-server README**: 진입점 셋, 최소 배선(`main.ts` · `app.module.ts` · `kysely.config.ts` · 스텁), 환경 변수 표, 봉투 · 오류 · 검증 계약(admin-ui 와 맞물리는 법), `@RawResponse`, `Database extends AdminDatabase`, 테스트 실행(`pnpm db:test:up` · `pnpm test:db`).
- **`docs/01-phase0.md`**: §3-2 표 정정(ⓐ T1 — 세 줄 삭제, 마이그레이션 줄 "확인 필요" 를 S1 결정과 순서 문제로, `db` 줄의 `useExisting` 을 보류로), §2-3 아래에 "Phase 2 경계 결정(2026-10-08)" 한 단락(이 스펙 §1-2 로 연결), §8 admin-server 행(2a 진행 · 테스트 수).
- **`docs/HANDOFF.md` · `CLAUDE.md`**: 진행 표에 Phase 2 줄을 PR 단위로, 다음 플랜. CLAUDE.md 의 "`@ssworks/admin-server` (Phase 2)" 규약 절에 진입점 · 테스트 층을 더한다.
- 머지 전: Version Packages PR #2 를 사람이 먼저 머지했는지 확인한다(⓪ M1).

## 11. 비범위 · 보류

- 인증 · 가드 · 데코레이터 · 비밀번호 해시(2b), `likeContains`(2c), trust proxy · 클라이언트 IP(2f).
- gise tx 안 네트워크 I/O 단언(`tx-context`) — 트랜잭션 안에서 외부 호출을 하는 모듈이 생기면.
- 쓰는 쪽이 이미 만든 Kysely 를 넘기는 길(§3-2 `db.useExisting`) — 필요한 프로젝트가 나오면.
- 마이그레이션 헬퍼(`TABLE_OPTIONS` 등)를 쓰는 쪽 장에 공개하는 일 — 프로젝트는 자기 `_shared.ts` 를 둔다.
- 시드 · 부트스트랩 계정(B). 브랜딩 설정(§1-2 ①).
- Fastify.

## 12. 플랜에서 먼저 확인할 위험

1. **vitest 가 `emitDecoratorMetadata` 를 내는가.** gise 는 같은 vitest 4 · vite 8 에서 클래스 생성자 주입 테스트가 돈다. 이 저장소 설정에서 재확인하고, 안 되면 생성자 주입을 전부 `@Inject(…)` 로 적는 규칙을 더한다.
2. **Nest 12 · kysely 0.29 판 차이.** 정본은 Nest 11 · kysely 0.28 이다. `Migrator` 는 `kysely/migration` 에서 import 한다. 그 밖의 API 차이는 컴파일 · 테스트로 잡고 구현하며 여는 "§13 구현 중 정정" 에 적는다.
3. **`useBodyParser` 를 부른 뒤 Nest 가 자기 JSON 파서를 다시 붙이지 않는가**(`isMiddlewareApplied`). 붙이면 reviver 없는 파서가 먼저 돈다 — 본문 bigint 테스트가 잡는다.
4. **vitest 의 DB 설정 경로.** `vitest run --config packages/admin-server/vitest.db.config.ts` 를 루트에서 부를 때 `include` 기준 경로.
5. **kysely-ctl 0.21 의 `kysely: () => Kysely` 설정 · 스텁 재export** 를 소비 스모크에서 실제로 돌린다(`jiti` 가 패키지 ESM 을 읽는가).
6. **Windows 긴 경로.** 스모크 앱은 `%TEMP%\akss` 처럼 짧은 경로에서.

플랜을 쓰며 1 · 3 · 4 를 스크래치(`%TEMP%\ak12`, Nest 12.1.2 · kysely 0.29.6 · vitest 4.1.11)와 실 MariaDB 11.4 에서 먼저 확인했다 — 결과는 §13.

## 13. 구현 중 정정 (2026-10-08)

- **R1 — 위험 1 · 3 · 4 해소(플랜 전 실측).** vitest 4.1.11 은 이 저장소와 같은 tsconfig(`verbatimModuleSyntax` · `isolatedModules` · `emitDecoratorMetadata`)에서 클래스 생성자 주입을 돌린다. `useBodyParser('json', { reviver })` 뒤 Nest 는 JSON 파서를 다시 붙이지 않는다(라우터 스택에 `jsonParser` 하나). DB 테스트는 `pnpm --filter @ssworks/admin-server test:db` 로 패키지 폴더에서 돌아 설정 경로 문제가 없다.
- **R2 — 장의 인자 타입은 `Kysely<unknown>` 이다(§6-1 "`Kysely<any>`" 정정).** 뜻은 같다 — 현재 스키마 타입에 묶지 않는다. `any` 는 eslint `no-explicit-any` 가 막고, `Kysely<unknown>` 을 받는 함수는 `Migration.up(db: Kysely<any>)` 자리에 그대로 들어간다.
- **R3 — 제약 · 인덱스 이름은 DB 에서 snake_case 다.** `CamelCasePlugin` 이 `addUniqueConstraint('uqUsersUserId')` 의 이름도 바꿔 `uq_users_user_id` 가 된다. 드라이버의 `ER_DUP_ENTRY` 메시지도 그 이름을 싣는다(`… for key 'uq_users_user_id'`, `logParam: false` 에서도). 2e 의 UNIQUE → 도메인 코드 판정은 snake 이름을 본다. 소스의 이름은 camelCase 그대로 둔다. `information_schema` 조회 결과의 키도 camelCase 로 바뀐다(`constraintName`).
- **R4 — `.env` 머리의 BOM 을 벗긴다(§5-3 · F11 보강).** 메모장이 저장한 UTF-8 BOM 이 첫 키에 붙으면 `DB_HOST` 가 "없다" 로 보인다.
- **R5 — 헤더가 이미 나간 뒤의 예외는 응답을 닫고 로그만 남긴다(F6 보강).** 다시 보내지 않되, 열린 응답을 그대로 두면 요청이 끝나지 않는다.
- **R6 — DB 테스트 기본 주소.** `ADMIN_TEST_DB_URL` 이 없으면 `pnpm db:test:up` 컨테이너(`mariadb://root:admin-kit-test@127.0.0.1:33306`)를 쓴다 — Windows 셸마다 env 설정법이 달라 기본값을 둔다. 붙지 못하면 60초 기다린 뒤 "`pnpm db:test:up` 을 먼저" 로 실패한다(§9 그대로). CI 는 값을 준다.
- **R7 — 실 MariaDB 11.4 실측(플랜 전).** `insertId` · BIGINT 는 bigint, JSON 컬럼은 드라이버가 파싱한 값을 주고 `maintainNestedObjectKeys` 가 안쪽 키를 지킨다, `ER_DUP_ENTRY` 의 `code` · `errno` 1062. Express 5 extended 쿼리 파서는 `__proto__` 키를 버린다. 닿지 않는 주소로 만든 풀을 곧바로 `destroy()` 해도 처리되지 않은 오류가 없다.
- **R8 — `timezone: 'Z'` 는 세션 `time_zone` 만 정한다(R7 · F12 정정, Task 9).** mariadb 3.5.4 는 Date 바인딩 값을 프로세스 로컬 시각으로 직렬화한다 — 프로세스가 KST 면 `'Z'` 여도 저장 바이트가 9시간 어긋난다(2026-10-08 실측). 저장 바이트를 지키는 것은 프로세스 TZ=UTC(`assertUtcTimezone`) 하나이고(hangang `kysely.config.ts` 주석과 같다), DB 테스트는 `@@session.time_zone = '+00:00'` 과 UTC 프로세스에서의 저장 문자열 · 왕복을 잰다. R7 의 "Date 가 같은 순간으로 돌아온다" 는 옵션의 증거가 아니다.
- **R9 — 예외 필터는 마스킹 판정 전에 상태를 400~599 정수로 고정한다(F6 · F7 보강, Task 5).** `httpStatusFor` 가 정수가 아닌 값을 주면(admin-shared `defineErrorCodes` 의 `httpStatusFor('constructor')` 는 함수를 준다, 손으로 쓴 표는 `undefined`) 4xx 경로로 빠져 500 응답에 원문 · `details` 가 실렸다. 범위 밖 · 정수 아님 → 500(마스킹). `HttpException` 의 1xx~3xx 상태도 500 이 된다.
- **R10 — `users.resignAt` 는 `timestamp NULL` 을 명시한다(§6-1 정정, 최종 리뷰).** `explicit_defaults_for_timestamp=OFF`(MariaDB 10.9 이하 기본 · DBA 설정)에서 수식어 없는 `timestamp` 는 `NOT NULL DEFAULT '0000-00-00 00:00:00'` 이 된다 — `resign_at IS NULL` 이 거짓이 되고 NULL 대입이 현재 시각을 쓴다(2026-10-08 실측). 플랜 코드가 hangang 002 를 따라 `NULL` 을 빠뜨렸다. 다른 `timestamp` 열은 모두 `NOT NULL` + 기본값이라 영향이 없다.
- **R11 — `createAdminKysely` 가 `assertUtcTimezone` 을 부른다(§1-4 #6 · R8, 최종 리뷰).** R8 로 프로세스 TZ 가 저장 바이트의 유일한 가드가 됐는데 플랜은 README 예시에만 두었다. 앱(`KYSELY` 팩토리) · 마이그레이션 러너 · 시드가 모두 이 함수를 지나므로 여기서 막는다. README 의 명시 호출 예시는 더 일찍 실패하게 남긴다.
