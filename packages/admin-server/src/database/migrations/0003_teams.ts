import { sql, type Kysely } from 'kysely'
import { TABLE_OPTIONS, UTF8_CI, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/003_teams.migration.ts
// 바꾼 점: 없음(인자 타입만 — 스펙 R2).
// 🔴 teamName UNIQUE 가 동시 요청의 최종 방어선이다. 서비스는 그 위반을 ERR_DUPLICATE_TEAM_NAME 으로 바꿔 낸다(3d §9).
// 계층은 teamClosure 에만 있다 — teams 에 parentNo 가 없다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('teams')
    .addColumn('teamNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('teamName', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('팀 이름')),
    )
    .addColumn('displayOrder', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('형제 사이 표시 순서')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updateAt', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint('uqTeamsName', ['teamName'])
    .modifyEnd(TABLE_OPTIONS)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('teams').execute()
}
