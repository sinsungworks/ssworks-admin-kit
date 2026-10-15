# @ssworks/admin-server

관리자 API 공통 NestJS 모듈 — NestJS 12 · Kysely 0.29 · MariaDB. **Phase 2 진행 중**이고 `private: true` 라 아직 발행하지 않는다(Phase 2 마지막 PR 뒤 첫 발행).

지금 들어 있는 것은 응답 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 스키마 12장(PR 2a · 2c · 2d-1 · 2e-1 · 2e-2 · 2f-1)과 관리자 인증(PR 2b — 로그인 · refresh 회전 · 가드 · 재인증), 세션 관리 · 감사(PR 2c), 역할 관리 · 계정 판정(PR 2d-1), 사용자 · 계정(PR 2d-2), 팀(PR 2e-1), 약관(PR 2e-2), IP 접근 제어(PR 2f-1)이다. 인증 경로 정리(PR 2f-2a)와 첫 발행 준비(PR 2f-2b — DB TLS · 소켓 · peer 하한)까지 들어 있다 — 지도는 저장소 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1.

## 설치

```bash
pnpm add @ssworks/admin-server @ssworks/admin-shared zod \
  @nestjs/common@^12 @nestjs/core@^12 @nestjs/platform-express@^12 \
  kysely@^0.29 mariadb@^3 @kim5257/kysely-mariadb-dialect@^0.2 reflect-metadata rxjs
pnpm add -D kysely-ctl@^0.21 @types/express   # 마이그레이션 러너(kysely.config.ts) · Express 타입 — 쓰는 쪽 개발 도구
```

- Node 22 이상, ESM 전용. tsconfig 는 `module` · `moduleResolution` `NodeNext`, `experimentalDecorators` · `emitDecoratorMetadata` 를 켠다.
- Express 만 지원한다(`@nestjs/platform-express`).
- `@ssworks/admin-shared` 는 `>=0.4.0 <1.0.0`(peer) — admin-kit 세 패키지는 같은 번호끼리 설치한다.

## 진입점

| import                                  | 내용                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `@ssworks/admin-server`                 | 전부                                                                                        |
| `@ssworks/admin-server/runner`          | Nest 를 싣지 않는 것만 — `kysely.config.ts` · 시드 스크립트 · `main.ts` 의 `NestFactory` 전 |
| `@ssworks/admin-server/migrations/<id>` | 코어 마이그레이션 장 하나(스텁이 가리킨다)                                                  |

## 최소 배선

```ts
// src/main.ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { assertUtcTimezone, configureAdminApp, loadDotEnv } from '@ssworks/admin-server'
import { AppModule } from './app.module.js'

loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('api')
const app = await NestFactory.create<NestExpressApplication>(AppModule)
configureAdminApp(app) // 🔴 빠뜨리면 app.init() 에서 멈춘다
app.setGlobalPrefix('api') // 관리자 라우트는 /api/admin/…
app.enableShutdownHooks() // 종료 때 DB 풀을 닫는다
await app.listen(4000)
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common'
import { AdminServerModule, adminDbConnectionFromEnv } from '@ssworks/admin-server'
import { projectErrors } from './errors.js'

@Module({
  imports: [
    // 🔴 forRootAsync — env 를 부팅 뒤에 읽는다. forRoot({ db: adminDbConnectionFromEnv() }) 는 import 평가 때 돌아
    //    main.ts 의 loadDotEnv() 보다 먼저다.
    AdminServerModule.forRootAsync({
      useFactory: () => ({ db: adminDbConnectionFromEnv(), errorCodes: projectErrors }),
    }),
  ],
})
export class AppModule {}
```

```ts
// kysely.config.ts — Nest 를 싣지 않는다
import { defineConfig } from 'kysely-ctl'
import {
  adminDbConnectionFromEnv,
  assertAdminMigrationStubs,
  assertUtcTimezone,
  createAdminKysely,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

loadDotEnv(new URL('./.env', import.meta.url))
assertUtcTimezone('마이그레이션 러너')
assertAdminMigrationStubs('src/database/migrations') // 빠진 스텁 · 순서 어긋남이면 시작 전에 멈춘다

export default defineConfig({
  kysely: () => createAdminKysely(adminDbConnectionFromEnv()), // 앱과 같은 풀 옵션 · 플러그인
  migrations: { migrationFolder: 'src/database/migrations' },
})
```

`createAdminKysely` 자체도 프로세스 실효 타임존이 UTC 가 아니면 던진다 — 앱 · 러너 · 시드가 모두 빨리 실패한다. 위 `assertUtcTimezone` 명시 호출은 그보다 일찍 실패하게 남긴 것이다.

코어 장마다 마이그레이션 폴더에 한 줄 스텁을 둔다. 번호는 프로젝트가 정한다 — 코어 장 순서(roles → users → …)만 지킨다.

```ts
// src/database/migrations/001_admin_roles.migration.ts
export { up, down } from '@ssworks/admin-server/migrations/0001_roles'
```

| 장 ID                          | 테이블                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| `0001_roles`                   | `roles`                                                     |
| `0002_users`                   | `users`                                                     |
| `0003_teams`                   | `teams`                                                     |
| `0004_team_closure`            | `team_closure`                                              |
| `0005_team_user_map`           | `team_user_map`                                             |
| `0006_user_employment_periods` | `user_employment_periods`                                   |
| `0007_sessions`                | `sessions`                                                  |
| `0008_audit_logs`              | `audit_logs`                                                |
| `0009_guard_locks`             | `guard_locks`(센티넬 행 하나)                               |
| `0010_team_tree_lock`          | `guard_locks` 에 행 하나(팀 트리)                           |
| `0011_legal_documents`         | `legal_documents` + `guard_locks` 에 행 하나(약관 발행)     |
| `0012_ip_access_rules`         | `ip_access_rules` + global 허용 두 행(`0.0.0.0/0` · `::/0`) |

🔴 패키지가 새 장을 내면 changeset 이 알린다 — 스텁 한 줄을 더한다. `assertAdminMigrationStubs` 가 빠진 장을 잡는다. 시드(첫 관리자 계정 · 역할)는 프로젝트 몫이다.

## 환경 변수

| 이름                    | 필수              | 기본  | 뜻                                                                                                              |
| ----------------------- | ----------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`               | 예(소켓이 아니면) |       |                                                                                                                 |
| `DB_PORT`               |                   | 3306  | 양의 정수가 아니면 기동 실패                                                                                    |
| `DB_SOCKET_PATH`        |                   |       | 유닉스 소켓 경로. `DB_HOST` · `DB_PORT` · `DB_SSL=true` · `DB_SSL_CA` 와 함께면 기동 실패(아래 "DB TLS · 소켓") |
| `DB_USER`               | 예                |       |                                                                                                                 |
| `DB_PASSWORD`           | 예                |       |                                                                                                                 |
| `DB_NAME`               | 예                |       | gise 처럼 `DB_DATABASE` 를 쓰면 `AdminDbConnection` 을 직접 만든다                                              |
| `DB_POOL_LIMIT`         |                   | 10    | `× API 프로세스 수` 가 DB `max_connections` 여유 안이어야 한다                                                  |
| `DB_ACQUIRE_TIMEOUT_MS` |                   | 10000 |                                                                                                                 |
| `DB_SSL`                |                   | 끔    | `true` 면 TLS 로 검증해 붙는다. `true` · `false` 밖이면 기동 실패                                               |
| `DB_SSL_CA`             |                   |       | PEM 파일 경로 — 그 CA 로 검증(TLS 를 켠다). 못 읽거나 PEM 이 아니거나 `DB_SSL=false` 와 함께면 기동 실패        |
| `TZ`                    | 예                |       | `UTC` — 아니면 `assertUtcTimezone` 이 기동을 멈춘다                                                             |
| `ADMIN_JWT_SECRET`      | 예                |       | 액세스 토큰 HS256 비밀키(32자 이상). 🔴 패키지가 직접 읽지 않는다 — `auth.jwtSecret` 으로 넘기는 예시 이름      |

풀 안전 옵션(`timezone: 'Z'` · 숫자 옵션 넷 · `logParam: false`)은 바꿀 수 없다.

### DB TLS · 소켓

- **TLS 켜기**: `DB_SSL=true` — Node 기본 CA 묶음(OS 신뢰 저장소가 아니다 — 사설 CA 는 `DB_SSL_CA` 로 고정하거나 `NODE_EXTRA_CA_CERTS`)으로 서버 인증서와 호스트 이름을 검증한다. MariaDB 11.4 이상은 인증서를 설정하지 않아도 TLS 를 켜고 자체 서명 인증서를 만드는데, mariadb 드라이버(3.4+)가 비밀번호에서 나온 지문으로 그 인증서를 검증한다 — 비밀번호 있는 계정 · TCP 접속이면 CA 없이 `DB_SSL=true` 로 된다.
- **CA 고정**: `DB_SSL_CA=/run/secrets/db-ca.pem` — 그 CA 로 체인 · 호스트 이름을 검증한다(TLS 를 켜고, 드라이버의 지문 검증은 꺼진다). 관리형 DB 가 주는 CA 묶음을 여기 둔다.
- **DB 쪽에서도 강제한다**: 서버 `require_secure_transport=ON` 또는 계정 `ALTER USER … REQUIRE SSL` — 앱 설정이 빠져도 평문 접속이 거부된다. `REQUIRE SSL` 계정은 TCP + TLS 로 붙는다 — 소켓 모드에는 TLS 를 얹지 않으므로 소켓으로 붙는 계정에는 걸지 않는다.
- **env 로 못 하는 것은 코드로** — 검증을 끄는 env 는 없다.

  ```ts
  // src/database/admin-db.ts — Nest 를 싣지 않는다(러너도 import 한다)
  import { readFileSync } from 'node:fs'
  import { adminDbConnectionFromEnv, type AdminDbConnection } from '@ssworks/admin-server/runner'

  // 인증서 이름이 접속 주소와 다를 때(Cloud SQL 처럼) — CA 체인만 검증하고 호스트 이름은 건너뛴다.
  // 클라이언트 인증서(mTLS)는 같은 자리에 key · cert 를 더한다. 🔴 함수다 — env 는 부를 때(부팅 뒤) 읽는다.
  export const adminDb = (): AdminDbConnection => ({
    ...adminDbConnectionFromEnv(),
    ssl: {
      ca: readFileSync('/run/secrets/db-ca.pem', 'utf8'),
      checkServerIdentity: () => undefined,
    },
  })
  ```

  ```ts
  // app.module.ts
  AdminServerModule.forRootAsync({
    useFactory: () => ({ db: adminDb(), errorCodes: projectErrors }),
  })
  // kysely.config.ts
  kysely: () => createAdminKysely(adminDb())
  ```

  🔴 코드로 만든 `ssl` 은 넘긴 곳에만 닿는다 — 앱과 러너가 같은 함수를 쓰게 한다(한쪽만 고치면 마이그레이션이 평문으로 돈다).

  🔴 `ssl: { rejectUnauthorized: false }` 는 검증을 끈다 — 암호화는 되지만 중간자를 막지 못한다. 쓰지 말고 CA 를 고정한다.

- **실측 범위**: MariaDB 11.4 + mariadb 드라이버 3.5.4 에서 `ssl: true` 지문 검증 · `REQUIRE SSL` 계정 · 엉뚱한 CA 거부를 실 DB 로 확인했다. 관리형 DB 의 CA 묶음 · 호스트 이름 검증 · 소켓 실접속은 재지 않았다 — 처음 붙을 때 `SHOW SESSION STATUS LIKE 'Ssl_cipher'` 가 비지 않은지 본다. peer `^3.4.0` 중 3.5.4 보다 낮은 mariadb 는 11.4 지문 경로를 확인하지 않았다.
- **소켓**: `DB_SOCKET_PATH=/run/mysqld/mysqld.sock`(Windows 는 명명 파이프 경로). `DB_HOST` · `DB_PORT` · `DB_SSL=true` · `DB_SSL_CA` 와 함께 두면 기동 실패다 — 접속 대상이 모호하고, 소켓은 로컬 연결이라 TLS 를 얹지 않는다. 객체로는 `{ socketPath, user, password, database }`(`host` 와 하나만).
- 앱(`AdminServerModule`)과 러너(`kysely.config.ts`)가 같은 `adminPoolConfig` 를 지나므로 **env** 하나로 둘 다 바뀐다(코드로 만든 `ssl` 은 위 공용 함수를 두 곳에 넘겨야 둘 다 바뀐다). 기본은 지금처럼 평문 TCP 다. 오류 메시지는 env 이름(과 파일 오류의 errno 코드)만 담는다.

## 응답 계약

- 성공 `{ success: true, data }` — 컨트롤러는 값만 돌려준다. bigint 는 `"BigInt(n)"`, Date 는 ISO 문자열(admin-shared 코덱). 반환값이 없으면 `data: null`. 봉투를 빼려면 `@RawResponse()`(웹훅 · 헬스 체크).
- 실패 `{ success: false, code, message, details? }` — 서비스는 admin-shared `BusinessError` 만 던진다. 상태는 코드표(`errorCodes` 또는 코어 표)가 정한다. 5xx 는 고정 문구이고 원문 · `cause` · `details` 는 로그로만 간다.
- 검증 — `@Body(new ZodValidationPipe(schema))`. 실패는 400 `ERR_COMMON_VALIDATION` + `details.issues[{ path, code, message }]`(`path` 는 배열, 보낸 원문은 싣지 않음). 서비스가 필드 오류를 낼 때는 `validationError([{ path: ['currentPassword'], message }])`. 경로 번호는 `@Param('teamNo', ParseBigIntPipe)`.
- DB 접근은 `runQuery(() => …)` · `runWriteTransaction(db, (trx) => …)` 로 감싼다 — 드라이버 오류가 코드 있는 오류(UNIQUE → `ERR_COMMON_DUPLICATED`, FK restrict → `ERR_COMMON_IN_USE` …)가 된다. 🔴 재인증(argon2)을 트랜잭션 안에서 부르지 않는다.
- `runQuery` · `runWriteTransaction` 안에서는 `BusinessError` 가 아닌 오류 — Nest `HttpException`(`NotFoundException` 등) 포함 — 가 모두 가려진 500 `INTERNAL` 이 된다. 쿼리 · 트랜잭션 안에서는 `BusinessError` 를 던진다.
- 쿼리는 extended 파서다(`filter[key]=…` 가 객체). 값 검증은 zod 로.

## 코어 스키마와 내 테이블

```ts
import type { AdminDatabase } from '@ssworks/admin-server'

export interface Database extends AdminDatabase {
  posts: PostsTable
}

// 주입: constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}
```

- 코어 테이블에 컬럼을 더하려면 `users: AdminUsersTable & { email: string | null }` 와 프로젝트 ALTER 장. 🔴 패키지 코드는 더한 컬럼을 모르므로 NOT NULL 확장 컬럼은 DEFAULT 를 둔다.
- 제약 · 인덱스 이름은 DB 에서 snake_case 다(`uq_users_user_id`) — `CamelCasePlugin` 이 바꾼다.
- JSON 컬럼(`roles.permissions`)은 `readJsonColumn()` + zod 로 읽는다.

## 인증

`AdminAuthModule` 을 import 하면 관리자 인증이 켜진다 — `/api/admin/auth/*` 라우트와 **앱 전역** 인증 · 권한 가드.

```ts
// src/app.module.ts
@Module({
  imports: [
    AdminServerModule.forRootAsync({
      useFactory: () => {
        requireEnv(['ADMIN_JWT_SECRET'])
        return {
          db: adminDbConnectionFromEnv(),
          auth: { jwtSecret: process.env.ADMIN_JWT_SECRET! }, // 🔴 32자 이상 — 짧으면 기동에서 멈춘다
          passwordPolicy, // admin-shared definePasswordPolicy() — 화면과 같이 쓴다. 생략하면 8 · 200
        }
      },
    }),
    AdminAuthModule, // 🔴 AppModule 에서 한 번만 import 한다 — 전역 모듈이다. 사용자 테이블 컬럼이 다르면 AdminAuthModule.withRepository(MyAuthRepository, { imports })
  ],
})
export class AppModule {}
```

| 라우트                 | 표시        | 본문 → 응답                                                                                                  |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `POST /auth/login`     | 공개        | `{ userId, password }` → 쿠키 둘, `data: null`                                                               |
| `POST /auth/refresh`   | 공개        | refresh 쿠키 → 쿠키 둘(회전), `data: null`                                                                   |
| `POST /auth/logout`    | 공개        | refresh 쿠키 → 두 쿠키를 지운다(늘 200)                                                                      |
| `GET /auth/me`         | `@SelfOnly` | `{ userNo, userId, userName, roleNo, roleName, teamNo?, teamName?, permissions, isPasswordChangeRequired }`  |
| `PATCH /auth/password` | `@SelfOnly` | `{ currentPassword, newPassword }`(`passwordPolicy.changePasswordSchema`) → `data: null`, 다른 세션을 끊는다 |

### 🔴 가드는 앱 전역이다

- 관리자 밖 컨트롤러(회원 · 공개 · 헬스체크 · 웹훅)는 클래스에 `@Public()` 을 붙인다. 안 붙이면 401 이다 — 구멍이 아니라 고장으로 드러난다.
- 관리자 라우트는 권한을 선언한다: `@RequirePermissions(...)`(AND) · `@RequireAnyPermissions(...)`(OR) · `@SelfOnly()`(인증만). 🔴 선언이 없으면 403(fail-closed) — `'*'` 권한도 막는다. 선언한 권한은 클래스 `@SelfOnly` 보다 우선한다. crm · axion 이식 과도기에만 `auth.failClosed: false`.
- 프로젝트 권한 타입으로 좁히려면 감싼다: `export const Require = (...p: Permission[]) => RequirePermissions(...p)`.
- 주체는 `@CurrentAdmin()`(`AdminPrincipal`) 으로 받는다 — `req.admin` 에 있어 회원 인증(passport)의 `req.user` 와 갈린다. 인터셉터에서는 `getAdminPrincipal(req)`.
- 마이크로서비스(`rpc`) · WebSocket(`ws`) 컨텍스트는 가드가 지나친다. GraphQL 같은 그 밖의 비HTTP 컨텍스트는 401 이다. 🔴 전역 가드가 어떤 가드보다 먼저, `@Public()` 을 읽기 전에 막으므로 같은 앱에서는 GraphQL 을 열 수 없다 — GraphQL 은 관리자 API 와 다른 앱(프로세스)에 둔다.

### 토큰 · 쿠키

- 액세스 = JWT HS256 15분, refresh = 512비트 난수 7일(DB 에는 sha256 만, 회전마다 새로). 둘 다 httpOnly 쿠키 `admin_at` · `admin_rt`, `Path=/`, `SameSite=Lax`.
- Secure 는 `'auto'` — `req.secure` 또는 `X-Forwarded-Proto` 첫 값이 https 또는 `NODE_ENV=production`. 🔴 http 개발 서버를 `NODE_ENV=production` 으로 띄우면 브라우저가 쿠키를 버린다 — admin-ui 스토어가 `SessionNotEstablishedError` 로 알린다.
- 옵션: `auth.accessTtlMs` · `refreshTtlMs` · `refreshGraceMs`(기본 30 000, 0 이면 끔) · `lockout: { maxFailures, lockMs }` · `cookies: { accessName, refreshName, refreshPath, sameSite, secure, domain }`. `refreshPath` 를 좁힐 때는 `logout` 까지 덮는 경로를 쓴다(예 `/api/admin/auth`) — `/auth/refresh` 만 덮으면 로그아웃이 세션을 끊지 못한다.
- 회전된 refresh 가 다시 오면 그 사용자의 세션을 전부 끊는다(재사용 탐지, 401 `ERR_REFRESH_REUSED`). 30초 유예창 안에서 다른 탭이 늦게 낸 같은 토큰은 새 세션을 하나 더 준다.

### 로그인 판정 · 강제 변경 · 재인증

- 순서: (IP 접근 제어를 켰으면) IP → 비밀번호 → 잠김 → 퇴사. 틀리면 언제나 401 `ERR_LOGIN_FAILED`(없는 아이디 · 퇴사 · 잠긴 계정도 같은 응답). 5회 틀리면 15분 잠긴다 — 로그인 · 비밀번호 변경 · 재인증이 한 카운터를 원자적으로 쓴다. 🔴 잠긴 동안의 로그인은 비밀번호가 맞아도 같은 401 이다(정답 여부를 흘리지 않는다). 🔴 막힌 주소의 로그인도 비밀번호를 보지 않고 같은 401 이다 — 막힌 주소에서는 정답을 알아낼 수도, 틀린 비밀번호로 계정을 잠글 수도 없다. IP 접근 제어를 켜면 로그인 401 문구가 모두 "… 허용되지 않은 접속 위치입니다." 까지 말한다. 잠기지 않았고 맞으면 퇴사 403. 카운터는 로그인에서는 성공할 때만 0 으로 돌아간다(재인증 성공 · 비밀번호 변경도 되돌린다). 로그인된 본인의 비밀번호 변경 · 재인증은 잠김을 423 으로 알린다.
- 퇴사: `users.resignAt` 은 **효력 시각**이다 — 그 시각부터 로그인 · 요청 · 갱신이 403 `ERR_RESIGNED_USER`. IP 접근 제어를 켜면 매 요청은 퇴사 다음에, 갱신은 퇴사보다 먼저 IP 를 본다(막히면 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp`). 로그인은 위의 순서다. "퇴사일 당일까지 근무" 는 쓸 때 다음 날 0시(기준 시간대)로 바꿔 넣는다.
- 강제 변경(`isPasswordChangeRequired`): 로그인은 되고 `/me` 가 `permissions: []` 와 플래그를 낸다. 그 밖의 라우트는 403 `ERR_PASSWORD_CHANGE_REQUIRED`. admin-ui `createAdminGuard({ isPasswordChangeRequired })` 가 변경 화면으로 보낸다.
- 민감 작업 재인증: 서비스 진입부에서 `await reauth.verify(admin, body.currentPassword)`(`AdminReauthService`, 틀리면 403 `ERR_REAUTH_REQUIRED`). 🔴 트랜잭션 안에서 부르지 않는다.
- 로그인 시도 제한(IP 단위)은 쓰는 쪽이 edge(nginx) · `@nestjs/throttler` 로 건다. 패키지는 계정 잠금과 argon2 비용을 맡는다.

### 사용자 테이블이 다를 때

컬럼 매핑 옵션은 없다. `AdminAuthRepository` 여섯 메서드를 구현해 바꾼다.

```ts
@Injectable()
class MyAuthRepository implements AdminAuthRepository {
  // findCredentialByUserId · findCredentialByNo · findPrincipal · lockCredential · writeLoginState · changePassword
  // 예: isActive 컬럼이면 resignAt: row.isActive ? null : new Date(0)
}

AdminAuthModule.withRepository(MyAuthRepository, { imports: [MyUsersDataModule] })
```

🔴 `lockCredential(trx, userNo, mode)` 는 받은 트랜잭션 위의 **잠금 읽기**다 — `'update'` 는 `FOR UPDATE`, `'share'` 는 `LOCK IN SHARE MODE`(MariaDB 는 `FOR SHARE` 를 받지 않는다 — Kysely `.forShare()` 를 쓰지 않는다). 잠그는 행은 `sessions.user_no` FK 가 가리키는 그 `users` 행이다 — 로그인 확정 · 토큰 회전이 이 잠금을 세션보다 먼저 잡아 퇴사 · 비밀번호 초기화와 교착하지 않는다. `writeLoginState` 는 잠금 두 컬럼(`loginFailCount` · `lockUntil`)만 쓴다 — 패키지가 같은 트랜잭션에서 먼저 `lockCredential(…, 'update')` 로 잠그므로 카운터의 원자성은 패키지가 맡는다. 받는 `trx` 는 `Transaction<AdminDatabase>` 라 자기 Database 타입으로 단언해 쓴다. 🔴 교체 구현이 지킬 것 셋: ① 두 원시 모두 **받은 `trx` 위에서만** 쓴다 — `writeLoginState` 를 다른 연결(`this.db`)로 쓰면 자기 요청이 쥔 X 잠금을 기다려 잠금 대기 초과가 되고 카운터가 오르지 않아 무차별 대입 잠금이 조용히 꺼진다, `lockCredential` 을 다른 연결로 하면 회전 교착과 로그인 TOCTOU 가 돌아온다. ② `lockCredential` 이 돌려주는 `passwordHash` 는 `findCredentialByUserId` 와 같은 컬럼 · 같은 값(정규화 없음)이어야 한다 — 로그인 확정이 둘을 비교하므로 다르면 모든 로그인이 "낡음" 401(`login.fail`)이 된다. ③ 그 트랜잭션에서 잠금 앞에 비잠금 SELECT 를 두지 않는다(스냅샷 격리 ON 이면 1020).

### 시드 · IP 자리

- 첫 관리자는 `@ssworks/admin-server/runner` 의 `hashPassword` 로 만든다(Nest 없이).
- 인증 이벤트(로그인 · 갱신 · 재사용 · 로그아웃 · 비밀번호 변경)는 `AdminAuditModule` 이 감사 행으로 남긴다(아래 "감사"). `ADMIN_ACCESS_POLICY`(IP 판정)는 `AdminIpAccessModule` 이 채운다(아래 "IP 접근 제어").
- 🔴 **클라이언트 IP 의 출처**는 코어 옵션 `clientIp` 다. 기본 `'req.ip'` — Express `trust proxy` 를 따른다(엣지 뒤면 `app.set('trust proxy', 1)` 등). 엣지 프록시(nginx `set_real_ip_from` + `proxy_set_header X-Real-IP`)가 `X-Real-IP` 를 덮어쓰면 `clientIp: 'x-real-ip'` — 헤더가 없으면 `req.ip`, 중복 · 형식 오류면 주소 없음(IP 정책이 막는다). 🔴 엣지 없이 노출된 서버에 `'x-real-ip'` 를 쓰면 헤더 한 줄로 IP 제한을 우회한다. 유닉스 소켓 뒤(`req.ip` 가 빈다)는 `'x-real-ip'` 를 쓴다. 세션 행 · 감사 행 · IP 정책이 같은 정규화 값(`::ffff:a.b.c.d` → `a.b.c.d`, `::1` → `127.0.0.1`)을 본다.

## 권한 슬롯

패키지 라우트는 권한 키를 박지 않는다 — **슬롯**을 선언하고 쓰는 쪽이 자기 권한 키를 잇는다.

```ts
AdminServerModule.forRootAsync({
  useFactory: () => ({
    db: adminDbConnectionFromEnv(),
    auth: { jwtSecret: process.env.ADMIN_JWT_SECRET! },
    permissions: {
      'sessions.read': 'org.users:read', // GET /sessions
      'sessions.manage': 'org.users:write', // DELETE /sessions/:sessionNo · /sessions/user/:userNo
      'auditLogs.read': 'setting.auditLog:read', // GET /audit-logs
      'roles.read': 'org.roles:read', // GET /roles
      'roles.manage': 'org.roles:write', // POST · PATCH · DELETE /roles…
      'users.read': 'org.users:read', // GET /users… · GET /roles(역할 고르기)
      'users.manage': 'org.users:write', // POST · PATCH /users…
      'teams.read': 'org.teams:read', // GET /teams/tree(users.read 로도 열린다 — 사용자 폼의 팀 고르기)
      'teams.manage': 'org.teams:write', // POST · PATCH · DELETE /teams…
      'legal.read': 'setting.legal:read', // GET /legal-documents…
      'legal.publish': 'setting.legal:publish', // POST /legal-documents
      'ipAccess.read': 'setting.ipAccess:read', // GET /ip-access
      'ipAccess.manage': 'setting.ipAccess:write', // GET /ip-access/preview · POST · PATCH · DELETE /ip-access…
    },
  }),
})
```

- 🔴 import 한 기능 모듈의 슬롯이 없거나, 모르는 슬롯(오타) · 빈 키가 있으면 기동에서 멈춘다. 슬롯 판정은 `@RequirePermissions` 와 같은 층이다(`'*'` 는 이어진 슬롯을 통과한다).
- 키 이름은 프로젝트 카탈로그가 정한다 — hangang 은 `org.users:*`, gise 는 `account.session:manage`.
- 🔴 역할 · 사용자 모듈을 쓰면 슬롯 맵의 키가 `permissionCatalog` 안이어야 한다 — 오타(`org.role:write`)는 기동에서 멈춘다.

## 세션 · 감사

```ts
imports: [
  AdminServerModule.forRootAsync({ useFactory: () => ({ …, permissions, audit: { catalog: auditCatalog } }) }),
  AdminAuthModule,
  AdminAuditModule, // 전역 감사 인터셉터 · 인증 이벤트 기록 · GET /audit-logs
  AdminSessionsModule, // /sessions 6라우트
]
```

🔴 둘 다 `AdminAuthModule` 이 있어야 뜬다(가드 없이 라우트가 열리지 않게). 감사 장 스텁(`0008_audit_logs`)은 모든 앱에 필수다.

### 세션

| 라우트                            | 권한              | 응답                                   | admin-ui `useSessions` 어댑터 |
| --------------------------------- | ----------------- | -------------------------------------- | ----------------------------- |
| `GET /sessions`                   | `sessions.read`   | `{ items, total, page, itemsPerPage }` | `fetch`(서버 페이징)          |
| `DELETE /sessions/:sessionNo`     | `sessions.manage` | `{}`                                   | `revoke`(관리자 표)           |
| `DELETE /sessions/user/:userNo`   | `sessions.manage` | `{ revokedCount }`                     | `revokeUser`                  |
| `GET /sessions/me`                | `@SelfOnly`       | `{ items }`(전량)                      | `list`                        |
| `DELETE /sessions/me/:sessionNo`  | `@SelfOnly`       | `{}`                                   | `revoke`(내 세션 표)          |
| `POST /sessions/me/revoke-others` | `@SelfOnly`       | `{ revokedCount }`                     | `revokeOthers`                |

- 행은 admin-shared `adminSessionSchema` · `adminSessionListItemSchema`. `isCurrent` 는 그 요청의 세션이다. 목록은 살아 있는 세션(끊기지 않고 만료 전)만이다.
- 전체 목록 쿼리: `filter[keyword]`(아이디 · 이름 부분일치) · `filter[userNo]` · 정렬 `lastAccessAt` · `loginAt` · `expireAt`.
- 🔴 지금 쓰는 세션은 이 라우트로 끊지 못한다(400) — 로그아웃이 정상 경로다. 남의 세션 · 없는 세션 · 이미 끝난 세션은 같은 404 다. 본인 계정의 "사용자 전체" 는 지금 세션까지 끊는다(다음 요청 401 — admin-ui `onSelfSignedOut`).
- 유예창(30초) 안에서 다른 탭이 옛 refresh 를 내면 세션이 하나 더 생긴다. 같은 브라우저라면 그중 하나는 아무도 쓰지 않는 행으로 만료(7일)까지 남는다 — 목록에 같은 기기가 두 번 보이면 그것이다. "다른 세션 모두" 가 쓸어 낸다.
- 🔴 남의 세션을 끊으려면 그 사람의 역할 권한을 덮어야 한다(아래 "권한 상승") — 낮은 관리자가 전권자의 세션을 끊으면 403 `details.outside`. 본인 세션은 늘 된다.

### 감사

```ts
// 프로젝트 액션은 admin-shared 카탈로그로 — 화면(감사 로그 조회)도 같은 라벨을 쓴다
export const auditCatalog = defineAuditCatalog({
  actions: { BOARD_POST_CREATE: 'board.post.create' },
  targets: { POST: 'post' },
  labels: { 'board.post.create': '게시글 작성' },
  targetLabels: { post: '게시글' },
})

@RequirePermissions('board.post:write')
@Audit({ action: 'board.post.create', targetType: 'post' })
@Post()
async create(@Body() body: PostBody, @Req() req: Request) {
  const postNo = await this.posts.create(body)
  attachAuditTarget(req, postNo) // 경로 변수로 대상을 알 수 없을 때
  attachAuditDiff(req, null, body, ['title', 'isNotice']) // 남길 필드만
  return { postNo }
}
```

- 성공 · 실패 모두 기록한다 — 인터셉터 체인 안에서 던져진 실패는 전부 남는다(핸들러가 던진 것, 그리고 `@Audit` 라우트의 검증 파이프 400 도 파이프가 체인 안에서 돈다). 가드가 거부한 요청(401 · 403 · 강제 비밀번호 변경)은 남지 않고, IP 차단은 인증 이벤트 sink 로 남는다. 응답 전에 기록을 기다리고, 기록이 실패해도 응답은 그대로다(경고 한 줄).
- 🔴 카탈로그에 없는 액션 · 대상 종류를 단 `@Audit`, `@Public` 라우트의 `@Audit` 은 기동에서 멈춘다.
- 대상 번호: `attachAuditTarget` → `@Audit({ paramKey })` 경로 변수 → 숫자 경로 변수가 하나뿐일 때 그것.
- meta 의 비밀 키(`password` · `token` · `secret` …, 대소문자 무시)는 `***` 로 남는다. 프로젝트 키는 `audit.secretKeys` 로 더한다. bigint 는 문자열로, 64 KiB 를 넘는 meta 는 `{ _truncated, bytes }` 로 남는다 — 본문 같은 큰 필드를 `attachAuditDiff` 에 넣지 않는다.
- 🔴 로그인 실패 행의 meta `userId` 는 사람이 친 원문이다 — 비밀번호를 아이디 칸에 치면 그대로 남는다. 감사 조회 권한을 그만큼 좁게 준다.
- 조회: `GET /audit-logs` — `filter[actorUserNo]` · `filter[action]` + `filter[actionMatch]`(`prefix` 기본 · `exact`) · `filter[targetType]` · `filter[targetRefNo]` · `filter[from]` · `filter[to]`(`[from, to)` — "다음 날 0시" 를 보낸다). 행은 admin-shared `adminAuditLogSchema`, 라벨은 `auditCatalog.labelOf(action)`.
- 보존 기간 · 청소 · 파티셔닝은 쓰는 쪽 몫이다(크론으로 오래된 행을 지운다).

## 역할 · 권한

```ts
// 프로젝트 shared — 카탈로그와 함의 표 하나를 서버 · 화면이 같이 쓴다
export const permissions = definePermissions(
  {
    USERS_READ: 'org.users:read',
    USERS_WRITE: 'org.users:write',
    ROLES_READ: 'org.roles:read',
    ROLES_WRITE: 'org.roles:write',
  },
  { implies: { 'org.users:write': ['org.users:read'], 'org.roles:write': ['org.roles:read'] } },
)
```

```ts
imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      …,
      permissionCatalog: permissions, // 🔴 역할 모듈을 쓰면 필수
      permissions: { …, 'roles.read': 'org.roles:read', 'roles.manage': 'org.roles:write' },
      reauth: false, // true 면 역할 만들기 · 수정 · 삭제가 본문 currentPassword 를 요구한다
    }),
  }),
  AdminAuthModule,
  AdminRolesModule, // /roles 다섯 라우트
]
```

| 라우트                      | 슬롯           | 본문 → 응답                                                      | admin-ui `useRoleEditor` 어댑터 |
| --------------------------- | -------------- | ---------------------------------------------------------------- | ------------------------------- |
| `GET /roles`                | `roles.read`   | → `{ items }`(전량 · `displayOrder` 순)                          | `list`                          |
| `POST /roles`               | `roles.manage` | `{ roleName, isDefault, permissions }` → 201 `{ roleNo }`        | `create`                        |
| `PATCH /roles/:roleNo`      | `roles.manage` | `{ revision, roleName?, isDefault?, permissions? }` → `{ item }` | `update`                        |
| `PATCH /roles/:roleNo/move` | `roles.manage` | `{ displayOrder }`(이웃의 값) → `{}`                             | `move`                          |
| `DELETE /roles/:roleNo`     | `roles.manage` | 본문 `{ revision }` → `{}`                                       | `remove`                        |

```ts
const roleApi: RoleEditorApi = {
  list: async () => (await api.get<{ items: AdminRole[] }>('/roles')).items,
  create: async (body, ctx) =>
    (await api.post<{ roleNo: bigint }>('/roles', { ...body, ...ctx })).roleNo,
  update: async (roleNo, body, ctx) =>
    void (await api.patch(`/roles/${roleNo}`, { ...body, ...ctx })),
  remove: async (roleNo, body, ctx) =>
    void (await api.del(`/roles/${roleNo}`, { ...body, ...ctx })),
  move: async (roleNo, body) => void (await api.patch(`/roles/${roleNo}/move`, body)),
}
useRoleEditor({
  api: roleApi,
  permissions: permissions.ALL_PERMISSION_VALUES,
  implies: permissions.implies, // 🔴 서버 정규화와 같은 표
  reauth: false, // 서버 reauth 와 같게
  canWrite: () => check.hasPermission('org.roles:write'),
})
```

- **정규화**: `'*'` 가 섞이면 `['*']` 하나, 아니면 함의를 펼쳐 카탈로그 순서로 저장한다. 카탈로그 밖 키는 400 `issues[{ path: ['permissions', i] }]`. 목록은 저장된 그대로 낸다 — 카탈로그에서 지운 옛 키는 화면이 버리고 다음 저장에서 빠진다.
- **권한 상승**: 행위자가 대상을 "덮어야" 한다(`coversPermissions`). 역할 만들기는 새 권한, 수정은 `permissions` 를 보낼 때만 현재 · 새 권한 둘 다, 삭제는 현재 권한. 남의 세션 끊기는 그 사람의 역할. 거부는 403 `details.outside`(덮지 못한 키). 🔴 `permissions` 없이 이름 · 기본 여부만 고치는 수정은 넓은 역할에도 열려 있다(3b `useRoleEditor` 가 그렇게 보낸다).
- **전권자 잔존**: 전체 권한(`'*'`) 재직자를 0 으로 만드는 역할 수정 · 삭제는 409 다. 동시 요청은 `guard_locks` 의 센티넬 행이 줄 세운다(장 `0009_guard_locks` — 모든 앱에 필수). 시드로 첫 전체 권한 계정을 만들기 전에는 0 이라 막히지 않는다.
- **동시 쓰기**: 역할 만들기 · 이동 · 기본 켜기는 순서 · 기본 표시 인덱스(장 `0001_roles`)로 그 행만 잠근다 — 다른 역할을 쓰는 사용자 쓰기와 엇갈리지 않는다. 두 관리자가 같은 순간에 역할을 만들거나, 만들기가 순서 맨 끝 역할의 삭제 · 이동 · 기본 켜기와 겹치면 드물게 한쪽이 409 `ERR_COMMON_CONFLICT` 다(순서 값은 겹치지 않는다) — 다시 보내면 된다. 역할 권한 수정 · 삭제는 그 역할의 이동과 겹쳐도 기다렸다가 끝난다(MariaDB 11.6.2+ 의 `innodb_snapshot_isolation` ON 에서도). 겹치는 구간을 옮기는 이동 둘, 또는 기본 역할을 쓰는 계정의 역할 변경과 다른 역할의 기본 켜기가 드물게 교착(1213)하면 409 `ERR_COMMON_CONFLICT`("다시 시도해 주세요")다 — 다시 보내면 된다(전권자 잔존은 그대로 지켜진다).
- **revision**: 수정 · 삭제 본문에 필수, 다르면 409 `ERR_COMMON_REVISION_CONFLICT`. 이동은 revision 을 받지도 올리지도 않는다(순서는 내용이 아니다).
- **기본 역할**은 하나다 — 켜면 다른 기본 역할이 꺼지고 그 revision 이 오른다(그 역할을 열어 둔 화면은 409 를 받는다).
- 이름 중복(대소문자 · 끝 공백 무시)은 400 `issues[{ path: ['roleName'] }]` — `useRoleEditor` 의 이름 칸 아래에 뜬다. 쓰는 중인 역할의 삭제는 409 `ERR_COMMON_IN_USE`.
- 감사: `org.role.create` · `update` · `move` · `delete`(diff `roleName` · `isDefault` · `permissions`). 재인증 비밀번호는 남지 않는다.

## 사용자 · 계정

```ts
imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      …,
      permissionCatalog: permissions, // 🔴 사용자 모듈도 필수
      permissions: { …, 'users.read': 'org.users:read', 'users.manage': 'org.users:write' },
      timeZone: 'Asia/Seoul', // 기본값 — 입사일 · 퇴사일을 읽는 기준 시간대(IANA 이름)
    }),
  }),
  AdminAuthModule,
  AdminUsersModule, // /users 열 라우트
]
```

| 라우트                                  | 슬롯           | 본문 → 응답                                                                           |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `GET /users`                            | `users.read`   | 쿼리(아래) → `{ items, total, page, itemsPerPage }`                                   |
| `GET /users/:userNo`                    | `users.read`   | → `{ item }`                                                                          |
| `GET /users/:userNo/employment-periods` | `users.read`   | → `{ items }`(입사일 내림차순)                                                        |
| `POST /users`                           | `users.manage` | `{ userId, userName, roleNo, teamNo, joinDate? }` → 201 `{ item, temporaryPassword }` |
| `PATCH /users/:userNo`                  | `users.manage` | `{ revision, userName?, roleNo?, teamNo?, joinDate? }` → `{ item }`                   |
| `POST /users/:userNo/resign`            | `users.manage` | `{ resignDate, reason? }` → `{ item }`                                                |
| `PATCH /users/:userNo/resign-date`      | `users.manage` | `{ resignDate, reason? }` → `{ item }`                                                |
| `POST /users/:userNo/rehire`            | `users.manage` | `{ joinDate, reason? }` → `{ item }`                                                  |
| `POST /users/:userNo/password-reset`    | `users.manage` | (재인증이면 `{ currentPassword }`) → `{ temporaryPassword }`                          |
| `POST /users/:userNo/unlock`            | `users.manage` | (재인증이면 `{ currentPassword }`) → `{}`                                             |

목록 쿼리: `page` · `itemsPerPage` · `sortBy`(`userId` · `userName` · `joinAt` · `resignAt` · `createAt` · `updateAt`, 기본 `createAt` 내림차순) · `filter[keyword]`(아이디 · 이름 부분일치) · `filter[teamNo]`(소속 전체로 거른다) · `filter[recursive]`(`'true'` · `'false'` 만 — 하위 팀 포함) · `filter[status]`(`active` · `resigned` — 퇴사 예정 포함). 행의 팀은 **대표 팀**(가장 작은 `teamNo`)이고 무소속 계정도 보인다.

- **날짜와 효력 시각**: 본문 · 응답의 날짜는 `'YYYY-MM-DD'`. 퇴사일은 **그날까지 근무**한다 — 효력 시각(`resignAt`)은 기준 시간대(`timeZone`)에서 퇴사일 다음 날 0시이고, 인증은 그 시각부터 로그인 · 요청을 막는다. **지금 막으려면 어제 날짜**로 퇴사시킨다 — 그 사용자의 세션이 바로 끊긴다(다음 요청 401, 로그인 403 `ERR_RESIGNED_USER`). (입사일이 어제 이전인 계정의 이야기다 — 퇴사일은 입사일과 같거나 뒤여야 해서 오늘 입사한 계정을 어제로 퇴사시키면 400 이다. 그런 계정은 퇴사일을 오늘로 두면 다음 날 0시에 막히고, 그 전에 막으려면 세션 끊기(`DELETE /sessions/user/:userNo`)를 함께 쓴다.) 미래 퇴사일은 세션을 두고 효력 시각에 막는다. 🔴 `timeZone` 을 바꿔도 이미 저장된 효력 시각 · 날짜는 그대로다. `+09:00` 같은 오프셋 표기는 기동에서 멈추고, 대소문자 · 옛 이름(`'asia/seoul'` · `'US/Eastern'`)은 Intl(ICU) 가 내는 이름(`'Asia/Seoul'` · `'America/New_York'` — 대개 정규 이름, 일부는 옛 이름이고 ICU 판에 따라 다르다)으로 바꿔 쓴다 — 감사 meta 의 `timeZone` 도 그 이름이다. 입사일은 기록이다 — 미래 입사일이어도 계정은 바로 로그인된다(인증은 효력 시각 resignAt 만 본다). 날짜는 1970-01-02 ~ 2038-01-18 범위만 받는다(TIMESTAMP 열 — 밖은 400).
- **임시 비밀번호**: 계정 만들기와 초기화는 서버가 만든 16자 임시 비밀번호를 **응답에서 한 번만** 돌려준다(저장은 해시, 감사에는 남지 않는다). 그 값으로 로그인하면 강제 변경 흐름이다(`/auth/me` 의 `isPasswordChangeRequired`). 초기화는 그 계정의 살아 있는 세션을 끊고 잠금도 푼다. admin-ui 배선:

```vue
<TemporaryPasswordDialog v-model="createdPassword" mode="create" :target="`${name}(${userId})`" />
<TemporaryPasswordDialog v-model="resetPassword" mode="reset" :target="label" sessions-revoked />
```

- **권한 상승 · 자기 계정**: 사용자 쓰기는 대상의 역할 권한을 덮어야 하고, 역할을 바꾸면 새 역할도 덮어야 한다(403 `details.outside`). 🔴 자기 계정의 퇴사 · 퇴사일 정정 · 재입사 · 비밀번호 초기화 · 잠금 해제는 403 — 다른 관리자에게 요청한다(퇴사 예정인 본인이 자기 재입사로 퇴사를 거두는 것도 막는다). 자기 이름 · 팀 바꾸기는 된다.
- **전권자 잔존**: 마지막 전체 권한(`'*'`) 재직자의 역할을 내리거나 퇴사(퇴사 예정 포함)시키면 409.
- **revision · 수정일**: `PATCH /users/:userNo` 는 `revision` 필수(다르면 409). 수정 · 퇴사 · 퇴사일 정정 · 재입사가 `revision` 과 `updateAt` 을 올린다. 초기화 · 잠금 해제 · 로그인 실패 · 본인 비밀번호 변경은 올리지 않는다 — 열어 둔 수정 폼이 떨어지지 않는다.
- **팀**: 사용자 쓰기는 팀 하나(`teamNo`, `null` 이면 무소속)를 받고 소속을 그 하나로 바꾼다. 여러 팀 소속은 팀 모듈(2e)의 몫이다.
- **재직 이력**: 퇴사 · 재입사마다 구간이 쌓인다. 재입사일은 직전 퇴사일 **다음 날**부터, 퇴사일은 입사일과 같거나 뒤. 시드에서 이력 없이 만든 계정은 첫 퇴사 때 `users.joinAt` 으로 구간을 치유한다.
- **확장 필드**(전화 · 이메일)는 패키지 라우트가 받지 않는다 — 쓰는 쪽 자기 라우트가 다룬다. 🔴 NOT NULL 확장 컬럼은 DEFAULT 를 둔다(패키지 INSERT 가 모른다).
- 🔴 **카탈로그를 바꿨을 때**: 카탈로그에서 키를 지우거나 `implies` 를 더했다면, 전체 권한(`'*'`) 관리자가 그 키를 가진 역할 · 관리자 역할을 **한 번 다시 저장**한다(화면이 옛 키를 버리고 서버가 함의를 채운다). 그 전에는 좁은 관리자가 그 역할 · 그 역할의 계정을 다루지 못한다(403 — 판정은 저장된 권한을 본다, 스펙 §14 R5-1).
- **전권자 잔존과 IP**: IP 접근 제어를 쓰면 "마지막 전체 권한 관리자" 를 셀 때 **어디서든 로그인할 수 있는**(적용 층이 global 인) 사람만 센다. 그래서 역할 변경 · 퇴사에 더해 **팀 변경**(`teamNo`)도 그 사람을 팀 규칙이 있는 팀으로 옮겨 마지막 도달 가능 전권자를 없애면 409 다. 이미 전권자 전원이 주소로 묶인 조직은 막지 않는다("있었는데 0 이 되는" 변경만 막는다).
- **동시 쓰기 재시도**: 역할 만들기는 순서 맨 끝 역할의 이동 · 삭제 · 기본 켜기 수정과 겹치면 드물게 교착(1213)해 409 다 — 다시 보내면 된다. 퇴사 · 역할 변경은 대상의 로그인 · 같은 팀의 이름 바꾸기 · 줄 역할의 이동과 겹쳐도 기다렸다가 끝난다(대상 · 역할 · 팀을 먼저 잠근 뒤 전권자 수를 센다). MariaDB 11.6.2+(`innodb_snapshot_isolation` 기본 ON)에서는 즉시 퇴사가 그 계정의 로그아웃(또는 다른 관리자의 세션 끊기)과 겹치면 드물게 409 `ERR_COMMON_CONFLICT`("다시 시도해 주세요")로 끝난다 — 다시 보내면 된다. 즉시 퇴사 · 비밀번호 초기화 · 본인 비밀번호 변경은 그 계정의 토큰 갱신 · 로그인과 겹쳐도 교착하지 않는다 — 갱신 · 로그인이 사용자 행을 먼저 기다렸다가 퇴사 403 · 끝난 세션 401 · 로그인 실패 401 로 끝난다(옛 비밀번호로 세션이 남지 않는다).
- 감사: `org.user.create` · `update` · `resign` · `resignDate.update` · `rehire` · `password.reset` · `unlock`. 퇴사 · 정정 · 재입사 meta 에 사유 · 끊은 세션 수 · 기준 시간대가 남는다(끊은 세션 수는 초기화와 같이 살아 있던 세션만 센다 — 만료된 세션은 건드리지 않는다). 임시 비밀번호 · 재인증 비밀번호는 남지 않는다.

3d `TeamUserList` 어댑터:

```ts
const loadTeamUsers = (query: TeamUserQuery) =>
  api.get<{ items: AdminUser[]; total: bigint }>('/users', {
    params: {
      page: query.page,
      itemsPerPage: query.itemsPerPage,
      filter: { teamNo: query.teamNo, recursive: query.recursive, keyword: query.keyword },
    },
  })
```

## 팀

```ts
imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      // …
      permissions: {
        // …
        'teams.read': 'org.teams:read',
        'teams.manage': 'org.teams:write',
      },
    }),
  }),
  AdminAuthModule,
  AdminTeamsModule,
]
```

마이그레이션 폴더에 스텁 한 줄을 더한다(모든 장 필수 — 이미 장을 돌린 DB 도 `kysely migrate` 한 번으로 따라온다):

```ts
// src/database/migrations/010_admin_team_tree_lock.migration.ts
export { up, down } from '@ssworks/admin-server/migrations/0010_team_tree_lock'
```

| 라우트                            | 슬롯                        | 본문 → 응답                                             | 감사                                  |
| --------------------------------- | --------------------------- | ------------------------------------------------------- | ------------------------------------- |
| `GET /admin/teams/tree`           | `teams.read` ∨ `users.read` | → `{ items: AdminTeamNode[] }` — 루트 여럿, 없으면 `[]` | —                                     |
| `POST /admin/teams`               | `teams.manage`              | `{ teamName, parentTeamNo }` → 201 `{ teamNo }`         | `org.team.create`                     |
| `PATCH /admin/teams/:teamNo`      | `teams.manage`              | `{ teamName }` → `{}`                                   | `org.team.update`                     |
| `PATCH /admin/teams/:teamNo/move` | `teams.manage`              | `{ parentTeamNo, beforeTeamNo }` → `{}`                 | `org.team.move`                       |
| `DELETE /admin/teams/:teamNo`     | `teams.manage`              | → `{}` — 하위 팀째                                      | `org.team.delete`(meta `descendants`) |

- admin-ui `useTeamTree` 배선(admin-ui README "조직")이 그대로 맞는다 — 아래 `baseURL: '/api/admin'` 이면 `load: () => api.get<AdminTeamTree>('/teams/tree').then((r) => r.items)`, ``move: ({ teamNo, ...body }) => api.patch(`/teams/${teamNo}/move`, body)``. 2열 인원 목록은 `GET /users?filter[teamNo]=…&filter[recursive]=true`("사용자 · 계정").
- **루트가 여럿이다.** `parentTeamNo: null` 이 최상위다. 화면에서 최상위 팀을 만들고 옮기려면 `useTeamTree({ topLevel: true })`. 루트 팀을 지우거나 옮기지 못하게 하려면 화면의 `canAct` 와 자기 라우트로 막는다(패키지는 시스템 팀을 모른다).
- **이동**은 기준 형제 번호다(`beforeTeamNo: null` = 맨 끝). 서버가 받는 형제 묶음을 0..n-1 로 다시 매긴다 — 시드의 빈 번호 · 같은 값은 그 묶음을 한 번 움직이면 사라진다. 자기 자신 · 하위 팀 아래로는 400 `ERR_TEAM_MOVE_CYCLE`, 기준 팀이 그 상위 팀의 자식이 아니면 400 `issues[beforeTeamNo]`, 없는 상위 팀은 404 `ERR_NO_TEAM`.
- **지우기**는 하위 팀째다. 서브트리에 소속 계정이 하나라도 있으면(퇴사자 포함) 409 `ERR_TEAM_HAS_MEMBERS` + `details.memberCount`(계정 수) — 먼저 `PATCH /admin/users/:userNo { teamNo }` 로 옮긴다. 서브트리 팀을 가리키는 IP 규칙이 있으면 409 `ERR_TEAM_HAS_IP_RULES` + `details.ruleCount` — 규칙을 먼저 지운다("IP 접근 제어").
- **이름**은 전체에서 하나다(같은 상위 팀 안이 아니다). 대소문자 · 끝 공백만 다른 이름도 같은 이름이라 409 `ERR_DUPLICATE_TEAM_NAME` 이다(`utf8mb4_unicode_ci`). 앞뒤 공백은 떼고 저장한다.
- 재인증 · revision 이 없다(`reauth: true` 여도).
- **쓰는 쪽 시드의 closure**: 계층은 `team_closure` 에만 있다. 상위 팀은 깊이 1 행이고, 조상마다 한 행(깊이 = 거리)을 넣는다. 자기 행(깊이 0)은 넣어도 안 넣어도 패키지 결과가 같다 — 패키지가 만드는 팀은 자기 행을 넣는다.
- **동시 쓰기**: 팀 쓰기(만들기 · 이름 · 이동 · 삭제)는 `guard_locks` 행 `teamTree` 에서 하나씩 돈다. 사용자 만들기 · 수정이 지우는 중인 팀을 고르면 기다렸다가 400 `issues[teamNo]`, 지우기가 소속을 넣는 중인 팀을 만나면 기다렸다가 409 다. 드문 잠금 충돌(교착, 또는 스냅샷 격리 ON 의 `ER_CHECKREAD` 1020)은 409 `ERR_COMMON_CONFLICT`("동시 처리 충돌입니다. 다시 시도해 주세요.")로 끝난다 — 클라이언트가 다시 보내면 된다.

## 약관

이용약관 · 개인정보처리방침 같은 법적 문서의 판(版) 관리. 판은 **append-only** 다 — 수정 · 삭제가 없고 새 판을 발행한다. 각 종류의 시행본은 가장 늦게 발행된 판이다.

```ts
// 한 상수에서 서버 옵션과 admin-ui 탭을 만든다
export const LEGAL_KINDS = ['TERMS', 'PRIVACY'] as const

imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      // …
      legal: { kinds: LEGAL_KINDS },
      permissions: {
        // …
        'legal.read': 'setting.legal:read',
        'legal.publish': 'setting.legal:publish',
      },
    }),
  }),
  AdminAuthModule,
  AdminLegalModule,
]
```

마이그레이션 폴더에 스텁 한 줄을 더한다(모든 장 필수 — 이미 장을 돌린 DB 도 `kysely migrate` 한 번으로 따라온다):

```ts
// src/database/migrations/011_admin_legal_documents.migration.ts
export { up, down } from '@ssworks/admin-server/migrations/0011_legal_documents'
```

| 라우트                                     | 슬롯            | 본문 → 응답                                                          | 감사                                                                          |
| ------------------------------------------ | --------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /admin/legal-documents/current?kind=` | `legal.read`    | → `{ item: AdminLegalDocument \| null }` — 미발행이면 `null`(200)    | —                                                                             |
| `GET /admin/legal-documents?kind=`         | `legal.read`    | → `{ items: AdminLegalHistoryItem[] }` 최신순 전량, 본문 없음        | —                                                                             |
| `GET /admin/legal-documents/:legalDocNo`   | `legal.read`    | → `AdminLegalDocument`(문서 그대로) · 없으면 404                     | —                                                                             |
| `POST /admin/legal-documents`              | `legal.publish` | `{ kind, body, baseLegalDocNo }` → 201 `{ legalDocNo, contentHash }` | `setting.legal.publish`(meta `{ kind, baseLegalDocNo, contentHash, length }`) |

- `legal.kinds` 는 비어 있지 않고 원소가 영숫자 · `_` 1~32자 · 겹침 없음이어야 한다 — 어기면 기동에서 멈춘다. 모르는 종류(쿼리 · 본문)는 400 `issues[{ path: ['kind'] }]`. 종류는 대소문자를 가른다.
- admin-ui `useLegalDocuments` 배선(admin-ui README "약관")이 그대로 맞는다 — 아래 `baseURL: '/api/admin'` 이면 `loadCurrent: (kind) => api.get<AdminLegalCurrent>('/legal-documents/current', { params: { kind } }).then((r) => r.item)` · `loadHistory: (kind) => api.get<AdminLegalHistory>('/legal-documents', { params: { kind } }).then((r) => r.items)` · ``loadOne: (no) => api.get<AdminLegalDocument>(`/legal-documents/${no}`)`` · `publish: (body) => api.post('/legal-documents', body)`. 미발행은 404 가 아니라 `{ item: null }` 이라 어댑터가 404 를 바꿔 읽을 필요가 없다. 탭의 `kinds` 는 위 `LEGAL_KINDS` 에서 만든다.
- **발행 409 둘**: 편집을 시작한 판(`baseLegalDocNo`, 미발행에서 시작했으면 `null`)이 지금 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`(다른 관리자가 먼저 발행했다 — admin-ui 가 충돌 안내를 띄운다), 시행본과 본문이 같으면 409 `ERR_COMMON_CONFLICT` `이전 버전과 내용이 같습니다.` 기준 판 검사가 먼저다. 옛 판의 본문으로 되돌리는 발행은 된다.
- **해시는 서버만 셈한다** — `contentHash = sha256(body)`(utf8, hex 소문자). 본문을 트림 · 정규화하지 않으므로 끝 공백 · 줄바꿈만 달라도 다른 판이다. 본문에 해시를 실어 보내도 무시한다.
- **본문 크기**: 본문은 1,000,000자까지(admin-shared `LEGAL_BODY_MAX_LENGTH`)지만, 한글 1,000,000자의 JSON 은 약 3MB 라 기본 본문 한도 1mb 에서 413 `ERR_COMMON_PAYLOAD_TOO_LARGE` 가 난다. 긴 약관을 받으려면 `configureAdminApp(app, { jsonLimit: '4mb' })`.
- **동시 발행**: 발행은 `guard_locks` 행 `legalPublish` 에서 종류와 관계없이 하나씩 돈다 — 같은 판을 기준으로 둘이 동시에 발행하면 하나만 되고 다른 하나는 기준 판 409 다. 발행 중인 관리자의 계정을 쓰는 쪽이 동시에 지우면 드물게 409(교착) · 400 이 난다 — 다시 보내면 된다.
- **발행자 계정을 지워도** 판은 남는다(`published_by_user_no` 는 SET NULL — `publishedByUserNo` · `publishedByUserName` 이 `null`).
- **공개 조회는 쓰는 쪽 몫이다**(관리 계약을 재사용하지 않는다 — 필드가 공개로 새지 않게). 예:

```ts
@Public()
@Controller('legal')
export class PublicLegalController {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  @Get(':kind')
  async current(@Param('kind') kind: string) {
    const row = (LEGAL_KINDS as readonly string[]).includes(kind)
      ? await this.db
          .selectFrom('legalDocuments')
          .select(['legalDocNo', 'kind', 'body', 'publishedAt'])
          .where('kind', '=', kind)
          .orderBy('publishedAt', 'desc')
          .orderBy('legalDocNo', 'desc')
          .limit(1)
          .executeTakeFirst()
      : undefined
    // 🔴 미발행은 404(fail-closed) — 공개 쪽이 "없음" 을 정상으로 받으면 방침 없이 동의를 받는 길이 생긴다
    if (row === undefined)
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, '문서를 찾을 수 없습니다.')
    return {
      kind: row.kind,
      legalDocNo: row.legalDocNo,
      bodyHtml: renderMarkdown(row.body), // admin-shared — 관리 화면 미리보기와 같은 렌더러
      publishedAt: row.publishedAt.toISOString(),
    }
  }
}
```

- **동의 기록**(가입 동의 등)은 쓰는 쪽 표다. 판 번호를 FK 로 걸면 `legal_doc_no` 는 `bigint unsigned` 다. 시행본은 (`published_at` DESC, `legal_doc_no` DESC) 첫 행이다 — 같은 초 발행이 있으니 두 키를 다 쓴다.
- 재인증(`reauth`)은 약관 발행에 걸리지 않는다 — 낡은 쓰기는 기준 판이 막는다.

## IP 접근 제어

관리자의 접속 위치를 제한한다. 규칙은 **사용자 > 팀 > 전체** 층이고, **가장 가까운 층 하나만** 본다 — 그 사람에게 사용자 규칙이 하나라도 있으면 팀 · 전체 규칙은 보지 않는다. 걸리는 규칙이 하나도 없으면 막는다(기본 거부). 장 `0012` 가 전체 허용 두 행(`0.0.0.0/0` · `::/0` — 계열이 다르면 매칭하지 않아 둘이다)을 넣으므로 클라이언트 주소를 읽을 수 있는 한 모듈을 붙여도 아무도 잠기지 않는다. 주소를 못 얻으면(`clientIp` 출처에서 읽지 못함 — `'x-real-ip'` 의 쉼표 · 배열 · 잘못된 헤더, 유닉스 소켓 등) 정책은 `null` 을 보고 규칙과 상관없이 **모두** 막는다(fail-closed) — 출처 설정을 먼저 확인한다.

```ts
imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      // …
      permissions: {
        // …
        'ipAccess.read': 'setting.ipAccess:read',
        'ipAccess.manage': 'setting.ipAccess:write',
      },
      clientIp: 'x-real-ip', // 엣지 프록시가 X-Real-IP 를 덮어쓸 때만(위 "시드 · IP 자리")
    }),
  }),
  AdminAuthModule,
  AdminIpAccessModule, // 옵션 없음 — import 하면 켜진다
]
```

마이그레이션 폴더에 스텁 한 줄을 더한다(모든 장 필수):

```ts
// src/database/migrations/012_admin_ip_access_rules.migration.ts
export { up, down } from '@ssworks/admin-server/migrations/0012_ip_access_rules'
```

| 라우트                            | 슬롯              | 본문 → 응답                                                                                                                          | 감사                                      |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `GET /admin/ip-access`            | `ipAccess.read`   | → `{ items }` 전량 — 정렬 전체 · 팀 · 사용자 → 번호, 행에 `scopeName`(팀 · 사용자 이름) · `scopeUserId`                              | —                                         |
| `GET /admin/ip-access/preview`    | `ipAccess.manage` | 쿼리 `op?`(create · update · delete) · `ruleNo` · `scopeType` · `scopeRefNo` · `cidr` → `{ clientIp, clientPasses, summary, items }` | —                                         |
| `POST /admin/ip-access`           | `ipAccess.manage` | `{ scopeType, scopeRefNo, cidr, description? }` → 201 `{ item }`                                                                     | `setting.ipAccess.create`(after)          |
| `PATCH /admin/ip-access/:ruleNo`  | `ipAccess.manage` | `{ revision, scopeType?, scopeRefNo?, cidr?, description? }` → `{ item }`                                                            | `setting.ipAccess.update`(before · after) |
| `DELETE /admin/ip-access/:ruleNo` | `ipAccess.manage` | `{ revision }` → `{}`                                                                                                                | `setting.ipAccess.delete`(before)         |

- **판정**: 매 요청 · 토큰 갱신이 IP 를 본다(갱신은 퇴사보다 먼저). 막히면 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp` — admin-ui `IpBlockedDialog` 가 읽는 값이다. 🔴 로그인은 비밀번호보다 먼저 IP 를 보고, 막히면 비밀번호를 확인하지 않은 채 틀린 비밀번호와 같은 401 `ERR_LOGIN_FAILED` 다(문구 "… 허용되지 않은 접속 위치입니다." — IP 접근 제어를 켜면 모든 로그인 실패가 이 문구다). 막힌 주소에서는 정답을 알아낼 수 없고 실패 카운터도 움직이지 않는다. 그래서 로그인 화면은 `IpBlockedDialog` 를 띄우지 않는다 — 로그인 뒤 막히면(매 요청 · 갱신) 띄운다. 감사 행 `auth.login.blocked.ip`(401) · `auth.access.blocked.ip`(403). 규칙을 바꿔도 세션은 끊지 않는다 — 막힌 주소의 요청이 403 을 받고, 규칙을 풀면 같은 세션이 다시 된다.
- **팀 규칙**은 그 사람의 **대표 팀**(가장 작은 팀 번호) 하나에만 걸린다(로그인 · 잔존 · 미리보기가 같은 팀을 본다). 하위 팀으로 내려가지 않는다.
- **CIDR**: IPv4 · IPv6, 프리픽스가 꼭 있어야 한다(`203.0.113.0/24` · `2001:db8::/32`). 앞뒤 공백은 뗀다. 호스트 비트가 남은 표기(`203.0.113.9/24`)는 네트워크처럼 매칭한다. IPv6 루프백 `::1` 은 `127.0.0.1` 로 접히므로 `::1` 을 허용하려면 `127.0.0.1/32` 나 `::1/128` 을 쓴다(`::1/64` 같은 다른 프리픽스는 IPv6 망으로 읽혀 루프백을 통과시키지 않는다). v4-mapped 는 `::ffff:a.b.c.d/96` 이상 꼴로만 받는다(16진 표기는 형식 오류). 화면도 admin-shared `ipCidrSchema` · `isValidCidr` 로 같은 파서를 쓴다.
- **자기 잠금**: 저장하면 **요청자의 지금 주소**가 막히는 변경은 409 `ERR_COMMON_CONFLICT` + `details.clientIp`(쓰지 않는다). 남만 막는 변경은 막지 않는다 — 저장 전에 **미리보기**로 누가 잠기는지 본다(`becomesLocked` · 등급순 정렬 · `blockedSessions`). 미리보기는 읽은 순간의 스냅숏이라 저장이 409 일 수 있다.
- **전권자 잔존**: 마지막 "어디서든 로그인할 수 있는 전체 권한 관리자" 를 없애는 규칙 변경(그 사람에게 사용자 규칙 · 마지막 전체 규칙 삭제 …)은 409 `lastSuperAdmin`.
- **잠겼을 때**: API 가 막는 것은 API 로 만든 잠금뿐이다(자기 잠금 · 전권자 잔존 · 팀 삭제 409). 사무실 · ISP 주소 변경, 엣지 설정 오류(주소 없음 → 모두 403), 모듈을 뺀 동안 SQL 로 시드를 지운 뒤 다시 붙임은 막지 못한다. 모듈 import 를 빼면 판정은 멈추지만 `/admin/ip-access` 라우트도 사라진다 — 복구는 SQL 이다. 사용자 규칙이 전체 규칙을 이기므로, 자기 규칙에 묶인 사람은 그 규칙을 지워야 풀린다.

  ```sql
  -- 전체 허용 두 행을 되살린다(장 0012 의 시드와 같다)
  INSERT INTO ip_access_rules (scope_type, scope_ref_no, cidr, description) VALUES
    ('global', NULL, '0.0.0.0/0', '기본 허용(IPv4)'),
    ('global', NULL, '::/0', '기본 허용(IPv6)');

  -- 특정 사용자 · 팀의 규칙을 지운다(번호를 바꿔 쓴다)
  DELETE FROM ip_access_rules WHERE scope_type = 'user' AND scope_ref_no = 12;
  DELETE FROM ip_access_rules WHERE scope_type = 'team' AND scope_ref_no = 3;
  ```

- **주의**: `ipAccess.manage` 는 사실상 전권급 슬롯이다 — 좁은 보유자도 마지막 도달 가능 전권자를 뺀 전권자를 가두고 일반 관리자를 모두 잠글 수 있다(2f-1 스펙 §9-2 s1 의 의도). 전체 권한 관리자에게만 준다. `AdminIpAccessModule` 이 `ADMIN_ACCESS_POLICY` 를 제공하므로 쓰는 쪽 자체 정책과 함께 쓰지 않는다. 미리보기 `op=update` 는 부분 패치가 아니라 **바뀐 뒤 규칙 전체**(`scopeType` · `scopeRefNo` · `cidr`)와 대상 `ruleNo` 를 받는다.
- **쓰기 보호**: 수정 · 삭제는 `revision`(409 `ERR_COMMON_REVISION_CONFLICT`). `reauth: true` 면 본문 `currentPassword`. 가리키는 팀 · 사용자가 없으면 400 `issues[scopeRefNo]`. 전체 규칙에 대상을 두거나 팀 · 사용자 규칙에 대상을 빼면 400 `issues[scopeRefNo]`.
- **팀 삭제**는 그 팀(하위 팀 포함)을 가리키는 규칙이 있으면 409 `ERR_TEAM_HAS_IP_RULES` — 규칙을 먼저 지운다.
- **동시 쓰기**: IP 쓰기는 `guard_locks` 행 `superAdminSurvival` 에서 역할 · 사용자의 잔존 쓰기와 함께 하나씩 돈다 — 두 관리자가 각자 통과하는 변경을 동시에 넣어도 뒤의 쪽이 자기 잠금 409 로 걸린다. 드문 잠금 충돌은 409 `ERR_COMMON_CONFLICT`("다시 시도해 주세요") — 다시 보내면 된다.
- **캐시 없음**: 매 인증 요청이 규칙 표를 읽는다(세션 · 주체 · 규칙 — DB 왕복 셋). 규칙 변경은 다음 요청부터 모든 인스턴스에 걸린다.
- **진단 경고**: 정책이 주소를 읽지 못해 막았을 때(`clientIp` 출처 · `trust proxy` 설정 오류)와 global 층 규칙이 하나도 없을 때 `IpAccessPolicy` 가 `Logger.warn` 을 정책 인스턴스당 한 번씩(보통 프로세스당 한 번) 남긴다 — 주소 값은 싣지 않는다. 모든 로그인이 401 로 막히면 이 경고와 감사 행 `auth.login.blocked.ip` 의 `ip` 칸(주소 없음이면 비었다)을 먼저 본다.

## admin-ui 와 맞물리기

```ts
createApiClient({
  baseURL: '/api/admin',
  refreshPath: '/auth/refresh',
  noRetryPaths: ['/auth/login'],
})
```

봉투(`envelope: 'success-data'`)와 bigint 코덱은 admin-ui 기본값과 같다. 오류 `code` · `details.issues` 는 `ApiError` · `toFieldErrors` 가 그대로 읽는다. 스토어는 `fetchMe: () => api.get('/auth/me')` · `login: (c) => api.post('/auth/login', c)` · `logout: () => api.post('/auth/logout')`, 강제 변경은 `createAdminGuard({ isPasswordChangeRequired: () => store.userInfo?.isPasswordChangeRequired === true })`, IP 차단은 `onError` 에서 `ERR_IP_NOT_ALLOWED` 와 `details.clientIp`(admin-ui README).

## 테스트(이 저장소)

```bash
pnpm db:test:up   # docker mariadb:11.4, 포트 33306
pnpm test:db      # 실 MariaDB 층 — ADMIN_TEST_DB_URL 로 다른 서버
pnpm db:test:down
```

`pnpm check` 는 DB 없이 돈다(단위 · DB 없는 HTTP 계약). CI 는 `db` 잡이 `pnpm test:db` 를 필수로 돈다.
