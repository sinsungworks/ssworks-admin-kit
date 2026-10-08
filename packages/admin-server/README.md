# @ssworks/admin-server

관리자 API 공통 NestJS 모듈 — NestJS 12 · Kysely 0.29 · MariaDB. **Phase 2 진행 중**이고 `private: true` 라 아직 발행하지 않는다(Phase 2 마지막 PR 뒤 첫 발행).

지금(PR 2a) 들어 있는 것은 응답 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 스키마 7장이다. 인증 · 세션 · 감사 · 사용자 · 역할 · 팀 · 약관 · IP 접근 제어는 다음 PR 에서 붙는다 — 지도는 저장소 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1.

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

🔴 패키지가 새 장을 내면 changeset 이 알린다 — 스텁 한 줄을 더한다. `assertAdminMigrationStubs` 가 빠진 장을 잡는다. 시드(첫 관리자 계정 · 역할)는 프로젝트 몫이다.

## 환경 변수

| 이름                    | 필수 | 기본  | 뜻                                                                 |
| ----------------------- | ---- | ----- | ------------------------------------------------------------------ |
| `DB_HOST`               | 예   |       |                                                                    |
| `DB_PORT`               |      | 3306  | 양의 정수가 아니면 기동 실패                                       |
| `DB_USER`               | 예   |       |                                                                    |
| `DB_PASSWORD`           | 예   |       |                                                                    |
| `DB_NAME`               | 예   |       | gise 처럼 `DB_DATABASE` 를 쓰면 `AdminDbConnection` 을 직접 만든다 |
| `DB_POOL_LIMIT`         |      | 10    | `× API 프로세스 수` 가 DB `max_connections` 여유 안이어야 한다     |
| `DB_ACQUIRE_TIMEOUT_MS` |      | 10000 |                                                                    |
| `TZ`                    | 예   |       | `UTC` — 아니면 `assertUtcTimezone` 이 기동을 멈춘다                |

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

## admin-ui 와 맞물리기

```ts
createApiClient({
  baseURL: '/api/admin',
  refreshPath: '/auth/refresh',
  noRetryPaths: ['/auth/login'],
})
```

봉투(`envelope: 'success-data'`)와 bigint 코덱은 admin-ui 기본값과 같다. 오류 `code` · `details.issues` 는 `ApiError` · `toFieldErrors` 가 그대로 읽는다.

## 테스트(이 저장소)

```bash
pnpm db:test:up   # docker mariadb:11.4, 포트 33306
pnpm test:db      # 실 MariaDB 층 — ADMIN_TEST_DB_URL 로 다른 서버
pnpm db:test:down
```

`pnpm check` 는 DB 없이 돈다(단위 · DB 없는 HTTP 계약). CI 는 `db` 잡이 `pnpm test:db` 를 필수로 돈다.
