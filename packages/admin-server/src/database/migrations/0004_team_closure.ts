import type { Kysely } from 'kysely'
import { TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/004_team_closure.migration.ts
// 바꾼 점: 없음(인자 타입만 — 스펙 R2).
// 🔴 계층 정보는 여기에만 있다. 트리거 · 프로시저가 없으므로 유지는 전적으로 애플리케이션 책임이다(2e).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('teamClosure')
    .addColumn('ancestorNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('descendantNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('depth', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('0 이면 자기 참조')),
    )
    .addPrimaryKeyConstraint('pkTeamClosure', ['ancestorNo', 'descendantNo'])
    .addForeignKeyConstraint('fkTeamClosureAncestor', ['ancestorNo'], 'teams', ['teamNo'], (cb) =>
      cb.onDelete('cascade').onUpdate('cascade'),
    )
    .addForeignKeyConstraint(
      'fkTeamClosureDescendant',
      ['descendantNo'],
      'teams',
      ['teamNo'],
      (cb) => cb.onDelete('cascade').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxTeamClosureDescendant')
    .on('teamClosure')
    .columns(['descendantNo'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('teamClosure').execute()
}
