# @ssworks/admin-server

관리자 API 공통 NestJS 모듈 — NestJS 12 · Kysely 0.29 · MariaDB. **Phase 2 진행 중**이고 `private: true` 라 아직 발행하지 않는다(Phase 2 마지막 PR 뒤 첫 발행).

지금 들어 있는 것은 응답 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 스키마 8장(PR 2a · 2c)과 관리자 인증(PR 2b — 로그인 · refresh 회전 · 가드 · 재인증), 세션 관리 · 감사(PR 2c)다. 사용자 · 역할 · 팀 · 약관 · IP 접근 제어는 다음 PR 에서 붙는다 — 지도는 저장소 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1.

## 설치

```bash
pnpm add @ssworks/admin-server @ssworks/admin-shared zod \
  @nestjs/common@^12 @nestjs/core@^12 @nestjs/platform-express@^12 \
  kysely@^0.29 mariadb@^3 @kim5257/kysely-mariadb-dialect@^0.2 reflect-metadata rxjs
pnpm add -D kysely-ctl@^0.21 @types/express   # 마이그레이션 러너(kysely.config.ts) · Express 타입 — 쓰는 쪽 개발 도구
```

- Node 22 이상, ESM 전용. tsconfig 는 `module` · `moduleResolution` `NodeNext`, `experimentalDecorators` · `emitDecoratorMetadata` 를 켠다.
- Express 만 지원한다(`@nestjs/platform-express`).

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

| 장 ID                          | 테이블                    |
| ------------------------------ | ------------------------- |
| `0001_roles`                   | `roles`                   |
| `0002_users`                   | `users`                   |
| `0003_teams`                   | `teams`                   |
| `0004_team_closure`            | `team_closure`            |
| `0005_team_user_map`           | `team_user_map`           |
| `0006_user_employment_periods` | `user_employment_periods` |
| `0007_sessions`                | `sessions`                |
| `0008_audit_logs`              | `audit_logs`              |

🔴 패키지가 새 장을 내면 changeset 이 알린다 — 스텁 한 줄을 더한다. `assertAdminMigrationStubs` 가 빠진 장을 잡는다. 시드(첫 관리자 계정 · 역할)는 프로젝트 몫이다.

## 환경 변수

| 이름                    | 필수 | 기본  | 뜻                                                                                                         |
| ----------------------- | ---- | ----- | ---------------------------------------------------------------------------------------------------------- |
| `DB_HOST`               | 예   |       |                                                                                                            |
| `DB_PORT`               |      | 3306  | 양의 정수가 아니면 기동 실패                                                                               |
| `DB_USER`               | 예   |       |                                                                                                            |
| `DB_PASSWORD`           | 예   |       |                                                                                                            |
| `DB_NAME`               | 예   |       | gise 처럼 `DB_DATABASE` 를 쓰면 `AdminDbConnection` 을 직접 만든다                                         |
| `DB_POOL_LIMIT`         |      | 10    | `× API 프로세스 수` 가 DB `max_connections` 여유 안이어야 한다                                             |
| `DB_ACQUIRE_TIMEOUT_MS` |      | 10000 |                                                                                                            |
| `TZ`                    | 예   |       | `UTC` — 아니면 `assertUtcTimezone` 이 기동을 멈춘다                                                        |
| `ADMIN_JWT_SECRET`      | 예   |       | 액세스 토큰 HS256 비밀키(32자 이상). 🔴 패키지가 직접 읽지 않는다 — `auth.jwtSecret` 으로 넘기는 예시 이름 |

풀 안전 옵션(`timezone: 'Z'` · 숫자 옵션 넷 · `logParam: false`)은 바꿀 수 없다.

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

- 비밀번호가 먼저다 — 틀리면 언제나 401 `ERR_LOGIN_FAILED`(없는 아이디 · 퇴사 · 잠긴 계정도 같은 응답). 5회 틀리면 15분 잠긴다 — 로그인 · 비밀번호 변경 · 재인증이 한 카운터를 원자적으로 쓴다. 🔴 잠긴 동안의 로그인은 비밀번호가 맞아도 같은 401 이다(정답 여부를 흘리지 않는다). 잠기지 않았고 맞으면 퇴사 403 → IP 403 순서. 로그인된 본인의 비밀번호 변경 · 재인증은 잠김을 423 으로 알린다.
- 퇴사: `users.resignAt` 은 **효력 시각**이다 — 그 시각부터 로그인 · 요청 · 갱신이 403 `ERR_RESIGNED_USER`. "퇴사일 당일까지 근무" 는 쓸 때 다음 날 0시(기준 시간대)로 바꿔 넣는다.
- 강제 변경(`isPasswordChangeRequired`): 로그인은 되고 `/me` 가 `permissions: []` 와 플래그를 낸다. 그 밖의 라우트는 403 `ERR_PASSWORD_CHANGE_REQUIRED`. admin-ui `createAdminGuard({ isPasswordChangeRequired })` 가 변경 화면으로 보낸다.
- 민감 작업 재인증: 서비스 진입부에서 `await reauth.verify(admin, body.currentPassword)`(`AdminReauthService`, 틀리면 403 `ERR_REAUTH_REQUIRED`). 🔴 트랜잭션 안에서 부르지 않는다.
- 로그인 시도 제한(IP 단위)은 쓰는 쪽이 edge(nginx) · `@nestjs/throttler` 로 건다. 패키지는 계정 잠금과 argon2 비용을 맡는다.

### 사용자 테이블이 다를 때

컬럼 매핑 옵션은 없다. `AdminAuthRepository` 다섯 메서드를 구현해 바꾼다.

```ts
@Injectable()
class MyAuthRepository implements AdminAuthRepository {
  // findCredentialByUserId · findCredentialByNo · findPrincipal · updateLoginState · changePassword
  // 예: isActive 컬럼이면 resignAt: row.isActive ? null : new Date(0)
}

AdminAuthModule.withRepository(MyAuthRepository, { imports: [MyUsersDataModule] })
```

🔴 `updateLoginState` 는 원자적이어야 한다(행 잠금 또는 compare-and-set). `changePassword` 의 `trx` 는 `Transaction<AdminDatabase>` 라 자기 Database 타입으로 단언해 쓴다.

### 시드 · IP 자리

- 첫 관리자는 `@ssworks/admin-server/runner` 의 `hashPassword` 로 만든다(Nest 없이).
- 인증 이벤트(로그인 · 갱신 · 재사용 · 로그아웃 · 비밀번호 변경)는 `AdminAuditModule` 이 감사 행으로 남긴다(아래 "감사"). `ADMIN_ACCESS_POLICY`(IP 판정)는 IP 접근 제어(2f)가 채운다.

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
    },
  }),
})
```

- 🔴 import 한 기능 모듈의 슬롯이 없거나, 모르는 슬롯(오타) · 빈 키가 있으면 기동에서 멈춘다. 슬롯 판정은 `@RequirePermissions` 와 같은 층이다(`'*'` 는 이어진 슬롯을 통과한다).
- 키 이름은 프로젝트 카탈로그가 정한다 — hangang 은 `org.users:*`, gise 는 `account.session:manage`.

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
- 남의 세션을 끊을 때의 권한 상승 검사(낮은 관리자가 전권자의 세션을 끊는 것)는 사용자 · 역할 PR(2d)이 붙인다.

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
