import { sql, type Kysely } from 'kysely'
import { TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/005_team_user_map.migration.ts
// 바꾼 점: 없음(인자 타입만 — 스펙 R2).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('teamUserMap')
    .addColumn('teamNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('userNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('joinAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('이 팀에 배정된 시각')),
    )
    .addPrimaryKeyConstraint('pkTeamUserMap', ['teamNo', 'userNo'])
    .addForeignKeyConstraint('fkTeamUserMapTeam', ['teamNo'], 'teams', ['teamNo'], (cb) =>
      cb.onDelete('cascade').onUpdate('cascade'),
    )
    .addForeignKeyConstraint('fkTeamUserMapUser', ['userNo'], 'users', ['userNo'], (cb) =>
      cb.onDelete('cascade').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema.createIndex('idxTeamUserMapUser').on('teamUserMap').columns(['userNo']).execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('teamUserMap').execute()
}
