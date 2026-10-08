import { sql, type Kysely } from 'kysely'
import { TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/008_user_employment_periods.migration.ts
// 바꾼 점: 없음(인자 타입만 — 스펙 R2).
// 🔴 userNo FK 는 RESTRICT — 계정을 지우는 경로를 만들지 않는다. 퇴사는 resignAt 으로 표현한다(hangang).
// ⚠️ "활성 사이클은 계정당 하나" 는 DB 가 강제하지 못한다(MariaDB 에 부분 UNIQUE 인덱스가 없다) — 서비스(2d)가 지킨다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('userEmploymentPeriods')
    .addColumn('periodNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('userNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('joinAt', 'date', (col) => col.notNull().modifyEnd(comment('입사일')))
    .addColumn('resignAt', 'date', (col) => col.modifyEnd(comment('NULL 이면 활성 사이클')))
    .addColumn('reason', 'varchar(255)', (col) => col.modifyEnd(comment('퇴사 · 재입사 사유')))
    .addColumn('recordedTimezone', 'varchar(64)', (col) =>
      col.notNull().modifyEnd(comment('기록 시점 프로세스 TZ. 패키지는 항상 UTC')),
    )
    .addColumn('createdBy', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('기록한 관리자. 최초 입사 행은 NULL')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addForeignKeyConstraint('fkUserEmploymentPeriodsUser', ['userNo'], 'users', ['userNo'], (cb) =>
      cb.onDelete('restrict').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxUserEmploymentPeriodsUserJoin')
    .on('userEmploymentPeriods')
    .columns(['userNo', 'joinAt'])
    .execute()

  await db.schema
    .createIndex('idxUserEmploymentPeriodsActive')
    .on('userEmploymentPeriods')
    .columns(['userNo', 'resignAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('userEmploymentPeriods').execute()
}
