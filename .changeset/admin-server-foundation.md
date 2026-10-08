---
'@ssworks/admin-server': minor
---

**쓰는 쪽이 할 일(첫 발행 때):** peer 를 설치한다 — `pnpm add @nestjs/common@^12 @nestjs/core@^12 @nestjs/platform-express@^12 kysely@^0.29 mariadb @kim5257/kysely-mariadb-dialect@^0.2 reflect-metadata rxjs zod @ssworks/admin-shared`(Node 22 이상). `main.ts` 에서 `configureAdminApp(app)` 을 `listen()` 전에 부른다(빠뜨리면 기동에서 멈춘다). `kysely.config.ts` 는 `@ssworks/admin-server/runner` 의 `createAdminKysely` · `assertAdminMigrationStubs` 를 쓰고, 마이그레이션 폴더에 코어 장 스텁 7개(`export { up, down } from '@ssworks/admin-server/migrations/0001_roles'` …)를 둔다.

admin-server 기반(Phase 2 PR 2a): `AdminServerModule.forRoot` · `forRootAsync`(`admin/` prefix · `KYSELY`), `configureAdminApp`, 응답 봉투(`@RawResponse()`), `AdminExceptionFilter`, `ZodValidationPipe` · `ParseBigIntPipe` · `validationError`, `runQuery` · `runWriteTransaction` · `mapError` · `readJsonColumn`, `AdminDatabase` 와 코어 스키마 7장(`ADMIN_MIGRATIONS`), `loadDotEnv` · `requireEnv` · `assertUtcTimezone`. 아직 `private` 이라 npm 에 나가지 않는다.
