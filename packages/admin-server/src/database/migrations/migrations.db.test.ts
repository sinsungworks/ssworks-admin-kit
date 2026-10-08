import { sql } from 'kysely'
import { NO_MIGRATIONS } from 'kysely/migration'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../test-support/db.js'
import { ADMIN_MIGRATIONS } from './index.js'

const CORE_TABLES = [
  'roles',
  'sessions',
  'team_closure',
  'team_user_map',
  'teams',
  'user_employment_periods',
  'users',
]

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase({ migrate: false })
})

afterAll(async () => {
  await t?.drop()
})

async function coreTables(): Promise<string[]> {
  const rows = await sql<{ tableName: string }>`
    select table_name from information_schema.tables where table_schema = ${t.name}
  `.execute(t.db)
  return rows.rows
    .map((row) => row.tableName)
    .filter((name) => !name.startsWith('kysely_'))
    .sort()
}

async function migrationRows(): Promise<number> {
  const rows = await sql<{ n: string | number | bigint }>`
    select count(*) as n from kysely_migration
  `.execute(t.db)
  return Number(rows.rows[0]?.n)
}

describe('코어 마이그레이션(실 MariaDB 11.4)', () => {
  it('up → down → up', async () => {
    const first = await t.migrator.migrateToLatest()
    expect(first.error).toBeUndefined()
    expect(first.results?.map((result) => [result.migrationName, result.status])).toEqual(
      ADMIN_MIGRATIONS.map((id) => [id, 'Success']),
    )
    expect(await coreTables()).toEqual(CORE_TABLES)
    expect(await migrationRows()).toBe(ADMIN_MIGRATIONS.length)

    const down = await t.migrator.migrateTo(NO_MIGRATIONS)
    expect(down.error).toBeUndefined()
    expect(await coreTables()).toEqual([])
    expect(await migrationRows()).toBe(0)

    const again = await t.migrator.migrateToLatest()
    expect(again.error).toBeUndefined()
    expect(await coreTables()).toEqual(CORE_TABLES)
    expect(await migrationRows()).toBe(ADMIN_MIGRATIONS.length)
  })

  it('collation · NULL · ON UPDATE · 타입을 스키마에서 잰다', async () => {
    const result = await sql<{
      tableName: string
      columnName: string
      collationName: string | null
      isNullable: string
      extra: string
      columnType: string
    }>`
      select table_name, column_name, collation_name, is_nullable, extra, column_type
        from information_schema.columns where table_schema = ${t.name}
    `.execute(t.db)
    const column = (table: string, name: string) => {
      const found = result.rows.find((row) => row.tableName === table && row.columnName === name)
      if (!found) throw new Error(`${table}.${name} 없음`)
      return found
    }
    expect(column('users', 'user_id').collationName).toBe('utf8mb4_unicode_ci')
    expect(column('users', 'user_name').collationName).toBe('utf8mb4_unicode_ci')
    expect(column('roles', 'role_name').collationName).toBe('utf8mb4_unicode_ci')
    expect(column('teams', 'team_name').collationName).toBe('utf8mb4_unicode_ci')
    expect(column('sessions', 'refresh_token_hash').collationName).toBe('ascii_bin')
    expect(column('users', 'password').collationName).toBe('utf8mb4_bin')
    expect(column('users', 'role_no').isNullable).toBe('NO')
    // 🔴 explicit_defaults_for_timestamp=OFF 에서도 NULL 허용(R10)
    expect(column('users', 'resign_at').isNullable).toBe('YES')
    expect(column('roles', 'update_at').extra.toLowerCase()).toContain('on update')
    // 🔴 폐기 UPDATE 가 마지막 활동 시각을 바꾸지 않는다
    expect(column('sessions', 'last_access_at').extra.toLowerCase()).not.toContain('on update')
    expect(column('sessions', 'replaced_by_session_no').columnType).toBe('bigint(20) unsigned')
    expect(column('sessions', 'user_agent').columnType).toBe('varchar(512)')
  })

  it('🔴 제약 이름은 snake_case(CamelCasePlugin 이 이름도 바꾼다 — 스펙 R3)', async () => {
    const result = await sql<{ tableName: string; constraintName: string; constraintType: string }>`
      select table_name, constraint_name, constraint_type
        from information_schema.table_constraints where table_schema = ${t.name}
    `.execute(t.db)
    const names = result.rows
      .filter((row) => row.constraintType !== 'CHECK' && row.constraintType !== 'PRIMARY KEY')
      .map((row) => `${row.tableName}.${row.constraintName}`)
      .sort()
    expect(names).toEqual(
      [
        'roles.uq_roles_role_name',
        'users.uq_users_user_id',
        'users.fk_users_role',
        'teams.uq_teams_name',
        'team_closure.fk_team_closure_ancestor',
        'team_closure.fk_team_closure_descendant',
        'team_user_map.fk_team_user_map_team',
        'team_user_map.fk_team_user_map_user',
        'user_employment_periods.fk_user_employment_periods_user',
        'sessions.uq_sessions_refresh_token_hash',
        'sessions.fk_sessions_user',
      ].sort(),
    )
  })

  it('인덱스', async () => {
    const result = await sql<{ indexName: string }>`
      select distinct index_name from information_schema.statistics where table_schema = ${t.name}
    `.execute(t.db)
    const names = result.rows.map((row) => row.indexName)
    for (const expected of [
      'idx_team_closure_descendant',
      'idx_team_user_map_user',
      'idx_user_employment_periods_user_join',
      'idx_user_employment_periods_active',
      'idx_sessions_user',
      'idx_sessions_expire_at',
    ]) {
      expect(names).toContain(expected)
    }
  })
})
