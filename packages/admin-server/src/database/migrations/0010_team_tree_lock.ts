import type { Kysely } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/migrations/013_guard_lock_super_admin_seed.migration.ts(시드 한 줄 장)
// 바꾼 점: 팀 트리 직렬화 행(2e 스펙 ① G1 · ⑪ A1). 인자 타입 Kysely<unknown>(2a R2).
// 🔴 이름은 상수 import 없이 리터럴이다 — 장은 한 번 적용되면 고정이다. database/guard-locks.ts 의 GUARD_LOCK_TEAM_TREE 와
//    같은 값인지는 guard-locks.db.test.ts 가 잰다.
// 🔴 0009 를 고치지 않고 새 장으로 넣는다 — 이미 장을 돌린 DB 도 migrate 한 번으로 따라온다(⑪ A1).

type GuardLocks = { guardLocks: { lockName: string; description: string } }

export async function up(db: Kysely<unknown>): Promise<void> {
  await db
    .withTables<GuardLocks>()
    .insertInto('guardLocks')
    .values({
      lockName: 'teamTree',
      description:
        '팀 트리 구조를 바꾸는 쓰기(만들기 · 이름 바꾸기 · 이동 · 삭제)를 직렬화한다. 각 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다',
    })
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db
    .withTables<GuardLocks>()
    .deleteFrom('guardLocks')
    .where('lockName', '=', 'teamTree')
    .execute()
}
