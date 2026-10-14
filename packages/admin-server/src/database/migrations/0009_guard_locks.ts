import type { Kysely } from 'kysely'
import { TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/012_guard_locks.migration.ts ·
//       013_guard_lock_super_admin_seed.migration.ts
// 바꾼 점: 테이블과 시드 행을 한 장에 둔다(2d 스펙 §4-7). 인자 타입 Kysely<unknown>(2a R2).
// 🔴 행 하나가 직렬화 지점 하나다. 한 트랜잭션은 이 테이블의 행을 둘 이상 잡지 않는다 — 잠금 순서가 갈려 교착한다.
// 🔴 시드 이름은 상수 import 없이 리터럴이다 — 장은 한 번 적용되면 고정이다. accounts/super-admin.ts 의
//    GUARD_LOCK_SUPER_ADMIN 과 같은 값인지는 super-admin.db.test.ts 가 잰다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('guardLocks')
    .addColumn('lockName', 'varchar(32)', (col) =>
      col.primaryKey().modifyEnd(comment('잠금 이름. 행 하나가 곧 직렬화 지점 하나다')),
    )
    .addColumn('description', 'varchar(200)', (col) =>
      col.notNull().modifyEnd(comment('이 행이 무엇을 직렬화하는지 — 행 자체가 문서다')),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db
    .withTables<{ guardLocks: { lockName: string; description: string } }>()
    .insertInto('guardLocks')
    .values({
      lockName: 'superAdminSurvival',
      description:
        "전체 권한('*') 재직자 수를 줄일 수 있는 쓰기를 직렬화한다. 각 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다",
    })
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('guardLocks').execute()
}
