import { sql, type Kysely } from 'kysely'
import { TABLE_OPTIONS, UTF8_CI, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/002_users.migration.ts
// 바꾼 점:
//  - `password` 를 varchar(255) 로 — hangang 은 char(128). argon2id 인코딩은 97자 안팎이나 매개변수가 바뀌면 는다(gise).
//    이름은 hangang · crm · axion 의 `password` — 기본 AUTH_REPOSITORY(2b)가 기대는 이름이다.
//  - `revision` 을 더했다(Phase 0 §4 #4). 쓰는 법은 2d 가 정한다.
// 🔴 roleNo 는 NOT NULL + FK restrict(스펙 F15) — 직책 없는 계정이 생기지 않고, 쓰는 중인 역할 삭제는 DB 가 막는다.
// 🔴 관리자 계정은 `users` 를 그대로 쓴다(hangang §7-1) — 인증 가드 · 감사가 users/userNo 를 전제한다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('userNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('userId', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('로그인 아이디')),
    )
    .addColumn('password', 'varchar(255)', (col) =>
      col.notNull().modifyEnd(comment('argon2id 해시. 원문을 저장하지 않는다')),
    )
    .addColumn('userName', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('표시 이름')),
    )
    .addColumn('roleNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('joinAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('현재 활성 재직 사이클의 캐시. 원천은 userEmploymentPeriods')),
    )
    .addColumn('resignAt', 'timestamp', (col) => col.modifyEnd(comment('NULL 이 아니면 퇴사')))
    .addColumn('isPasswordChangeRequired', sql`tinyint(1)`, (col) =>
      col
        .notNull()
        .defaultTo(0)
        .modifyEnd(comment('임시 비밀번호 — 첫 로그인에서 변경을 요구한다')),
    )
    .addColumn('loginFailCount', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('연속 로그인 실패 횟수')),
    )
    .addColumn('lockUntil', 'datetime', (col) => col.modifyEnd(comment('이 시각까지 로그인 잠김')))
    .addColumn('revision', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('낙관적 잠금')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updateAt', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint('uqUsersUserId', ['userId'])
    .addForeignKeyConstraint('fkUsersRole', ['roleNo'], 'roles', ['roleNo'], (cb) =>
      cb.onDelete('restrict').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('users').execute()
}
