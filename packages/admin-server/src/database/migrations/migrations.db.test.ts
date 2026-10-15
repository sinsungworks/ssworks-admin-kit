import { sql } from 'kysely'
import { NO_MIGRATIONS } from 'kysely/migration'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../test-support/db.js'
import { ADMIN_MIGRATIONS } from './index.js'

const CORE_TABLES = [
  'audit_logs',
  'guard_locks',
  'legal_documents',
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
  // 전체 장 통과를 세 번 도는 한 테스트다 — 다른 파일이 병렬로 DDL 을 돌리는 전체 실행에서 전역 20초를 넘겼다. 이 테스트만 90초.
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
  }, 90_000)

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
    // 🔴 사용자 수정일은 revision 이 오를 때만 바뀐다(2d 스펙 ⑧ U1 · §14 R7-3)
    expect(column('users', 'update_at').extra.toLowerCase()).not.toContain('on update')
    // 🔴 폐기 UPDATE 가 마지막 활동 시각을 바꾸지 않는다
    expect(column('sessions', 'last_access_at').extra.toLowerCase()).not.toContain('on update')
    expect(column('sessions', 'replaced_by_session_no').columnType).toBe('bigint(20) unsigned')
    expect(column('sessions', 'user_agent').columnType).toBe('varchar(512)')
    // 감사 장(2c 스펙 §4-8) — 행위자 · 세션 · IP 는 NULL 허용(⑥ TB2)
    expect(column('audit_logs', 'action').collationName).toBe('utf8mb4_unicode_ci')
    expect(column('audit_logs', 'error_code').collationName).toBe('ascii_bin')
    expect(column('audit_logs', 'actor_user_no').isNullable).toBe('YES')
    expect(column('audit_logs', 'session_no').isNullable).toBe('YES')
    expect(column('audit_logs', 'ip').isNullable).toBe('YES')
    expect(column('audit_logs', 'method').isNullable).toBe('NO')
    expect(column('audit_logs', 'status_code').columnType).toBe('smallint(5) unsigned')
    expect(column('audit_logs', 'user_agent').columnType).toBe('varchar(255)')
    // 약관 장(2e 스펙 공통 8)
    expect(column('legal_documents', 'kind').collationName).toBe('ascii_bin')
    expect(column('legal_documents', 'kind').columnType).toBe('varchar(32)')
    expect(column('legal_documents', 'content_hash').collationName).toBe('ascii_bin')
    expect(column('legal_documents', 'content_hash').columnType).toBe('char(64)')
    expect(column('legal_documents', 'body').columnType).toBe('mediumtext')
    expect(column('legal_documents', 'body').collationName).toBe('utf8mb4_bin')
    expect(column('legal_documents', 'legal_doc_no').columnType).toBe('bigint(20) unsigned')
    expect(column('legal_documents', 'published_by_user_no').columnType).toBe('bigint(20) unsigned')
    expect(column('legal_documents', 'published_by_user_no').isNullable).toBe('YES')
    expect(column('legal_documents', 'published_at').isNullable).toBe('NO')
    // 🔴 append-only — 발행 시각에 ON UPDATE 가 없다(explicit_defaults_for_timestamp=OFF 에서도)
    expect(column('legal_documents', 'published_at').extra.toLowerCase()).not.toContain('on update')
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
        'legal_documents.fk_legal_documents_published_by',
      ].sort(),
    )
  })

  it('🔴 약관 발행자 FK 는 SET NULL — 계정을 지워도 발행 이력이 남는다(2e 스펙 공통 8)', async () => {
    const result = await sql<{ constraintName: string; deleteRule: string; updateRule: string }>`
      select constraint_name, delete_rule, update_rule
        from information_schema.referential_constraints
       where constraint_schema = ${t.name} and table_name = 'legal_documents'
    `.execute(t.db)
    expect(result.rows).toEqual([
      {
        constraintName: 'fk_legal_documents_published_by',
        deleteRule: 'SET NULL',
        updateRule: 'CASCADE',
      },
    ])
  })

  it('인덱스', async () => {
    const result = await sql<{ indexName: string }>`
      select distinct index_name from information_schema.statistics where table_schema = ${t.name}
    `.execute(t.db)
    const names = result.rows.map((row) => row.indexName)
    for (const expected of [
      'idx_roles_display_order',
      'idx_roles_is_default',
      'idx_team_closure_descendant',
      'idx_team_user_map_user',
      'idx_user_employment_periods_user_join',
      'idx_user_employment_periods_active',
      'idx_sessions_user',
      'idx_sessions_expire_at',
      'idx_audit_logs_actor',
      'idx_audit_logs_target',
      'idx_audit_logs_action',
      'idx_legal_documents_kind_published',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('0009 · 0010 · 0011 — 센티넬 행이 이름마다 하나다(lock_name PK)', async () => {
    const rows = await t.db.selectFrom('guardLocks').selectAll().orderBy('lockName').execute()
    expect(rows).toEqual([
      { lockName: 'legalPublish', description: expect.stringContaining('FOR UPDATE') },
      { lockName: 'superAdminSurvival', description: expect.stringContaining('FOR UPDATE') },
      { lockName: 'teamTree', description: expect.stringContaining('FOR UPDATE') },
    ])
  })
})
