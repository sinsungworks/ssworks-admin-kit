// @ssworks/admin-server/runner — Nest 를 싣지 않는 것만. kysely.config.ts(마이그레이션 러너) · 시드 스크립트 ·
// main.ts 의 NestFactory 전 단계가 쓴다.
// 🔴 이 파일에서 닿는 상대 import 어디에도 @nestjs/* · express 가 없어야 한다(runner-graph.test.ts 가 지킨다).

export { parseDotEnv, loadDotEnv, requireEnv } from './config/env.js'
export { isEffectiveUtc, assertUtcTimezone } from './config/timezone.js'
export {
  type AdminDbConnection,
  adminPoolConfig,
  adminDbConnectionFromEnv,
  poolEnvInt,
} from './database/connection.js'
export { adminKyselyPlugins, createAdminKysely } from './database/kysely.js'
export { BooleanTransformPlugin } from './database/boolean-transform.plugin.js'
export { runQuery, runWriteTransaction } from './database/run.js'
export { mapError } from './database/map-error.js'
export { readJsonColumn } from './database/json.js'
export {
  ADMIN_MIGRATIONS,
  type AdminMigrationId,
  assertAdminMigrationStubs,
} from './database/migrations/index.js'
export type {
  AdminDatabase,
  AdminRolesTable,
  AdminUsersTable,
  AdminTeamsTable,
  AdminTeamClosureTable,
  AdminTeamUserMapTable,
  AdminUserEmploymentPeriodsTable,
  AdminSessionsTable,
  AdminSessionRevokeReason,
} from './database/types.js'
