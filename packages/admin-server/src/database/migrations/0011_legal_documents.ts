import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, TABLE_OPTIONS, comment } from './_shared.js'

// 정본: ssworks-gise-home apps/api/src/core/database/migrations/006_legal_documents.migration.ts
// 바꾼 점:
//  - PK 는 bigint unsigned(gise 는 integer) — 쓰는 쪽 동의 기록이 legalDocNo 를 FK 로 걸 때 그 타입을 맞춘다.
//  - kind 는 varchar(32) ascii_bin(gise varchar(16)) — 종류 옵션 형식 ^[A-Za-z0-9_]{1,32}$ 와 같은 폭(2e 스펙 B14).
//  - 이름은 admin-shared 계약을 따른다 — PK legalDocumentNo → legalDocNo, 발행자 publishBy → publishedByUserNo,
//    FK fkLegalDocumentsPublishBy → fkLegalDocumentsPublishedBy(gise 006). FK 동작은 gise 와 같은 SET NULL.
//  - 약관 발행 직렬화 행 legalPublish 를 같은 장에 넣는다(2e 스펙 ⑩ L1 · ⑪ A1). 인자 타입 Kysely<unknown>(2a R2).
// 🔴 append-only 다 — 수정은 새 판 INSERT 다. 동의한 문서가 사후에 바뀌면 동의 기록의 증거 능력이 사라진다(gise · axion).
//    소스에 UPDATE · DELETE 경로가 없음을 legal/legal-append-only.test.ts 가 지킨다.
// 🔴 kind 에 CHECK · ENUM 을 두지 않는다 — 종류 폐집합의 정본은 옵션 legal.kinds 이고 입구는 zod 가 막는다(gise).
// 🔴 publishedAt 은 DB 시계(초 단위)다 — 앱이 넣지 않는다(axion 은 앱 시계). 같은 초 발행이 실제로 나므로 시행본은
//    (publishedAt DESC, legalDocNo DESC) 두 키로 고른다(gise).
// 🔴 발행자 FK 는 SET NULL — 관리자 계정을 지워도 발행 이력이 남는다(axion 의 NOT NULL + RESTRICT 는 계정 삭제를 막았다).
// 🔴 시드 이름은 상수 import 없이 리터럴이다 — 장은 한 번 적용되면 고정이다. database/guard-locks.ts 의
//    GUARD_LOCK_LEGAL_PUBLISH 와 같은 값인지는 guard-locks.db.test.ts 가 잰다.

type GuardLocks = { guardLocks: { lockName: string; description: string } }

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('legalDocuments')
    .addColumn('legalDocNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('kind', 'varchar(32)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('종류. 폐집합의 정본은 옵션 legal.kinds')),
    )
    .addColumn('body', sql`mediumtext`, (col) => col.notNull().modifyEnd(comment('마크다운 원문')))
    .addColumn('contentHash', 'char(64)', (col) =>
      col.notNull().modifyFront(ASCII_BIN).modifyEnd(comment('sha256(body) hex. 서버만 셈한다')),
    )
    .addColumn('publishedAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('발행 시각(DB 시계). 시행본 정렬 1차 키')),
    )
    .addColumn('publishedByUserNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('발행자. NULL = 계정이 지워졌다')),
    )
    .addForeignKeyConstraint(
      'fkLegalDocumentsPublishedBy',
      ['publishedByUserNo'],
      'users',
      ['userNo'],
      (cb) => cb.onDelete('set null').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  // 🔴 종류마다 시행본을 고르는 인덱스 — UNIQUE 가 아니다. PK 가 꼬리에 붙어 두 키 정렬을 덮는다(filesort 없이 행 셋만
  //    잠근다 — 2e 스펙 §14 R5-6)
  await db.schema
    .createIndex('idxLegalDocumentsKindPublished')
    .on('legalDocuments')
    .columns(['kind', 'publishedAt'])
    .execute()

  await db
    .withTables<GuardLocks>()
    .insertInto('guardLocks')
    .values({
      lockName: 'legalPublish',
      description:
        '약관 발행을 종류와 관계없이 직렬화한다. 각 발행 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다',
    })
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db
    .withTables<GuardLocks>()
    .deleteFrom('guardLocks')
    .where('lockName', '=', 'legalPublish')
    .execute()
  await db.schema.dropTable('legalDocuments').execute()
}
