import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, JSON_BIN, TABLE_OPTIONS, UTF8_CI, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/009_audit_logs.migration.ts + ssworks-gise-home 017_audit_logs
//       (sessionNo)
// 바꾼 점:
//  - 행위자 컬럼은 `actorUserNo`(gise) — hangang `principalRefNo` 는 crm API 키 주체에서 온 이름이다(2c 스펙 B5).
//  - 행위자 · IP 는 NULL 을 허용한다 — 계정을 특정할 수 없는 로그인 실패는 0 대신 NULL(2c 스펙 ⑥ TB2).
//  - `errorCode`(실패면 응답 봉투의 code) · `sessionNo`(행위자의 세션)를 더했다(⑥ TB2).
// 🔴 users · sessions FK 를 두지 않는다 — 계정 삭제(CASCADE)가 감사 흔적을 지우면 안 된다(hangang).
// 🔴 파티셔닝 · 복합 PK 를 쓰지 않는다 — crm 의 RANGE 파티션은 운영 cron 이 없어 p_future 에 쌓였다(hangang 이 걷어냈다).
//    보존 · 청소는 쓰는 쪽(B) 몫이다.
// 🔴 폭은 audit/entry.ts 의 AUDIT_COLUMN_WIDTHS 와 같다 — 넘는 값은 STRICT 모드에서 INSERT 를 죽여 행이 빠진다(hangang C1).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('auditLogs')
    .addColumn('logNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('actorUserNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('행위자 userNo. NULL = 계정을 특정할 수 없음')),
    )
    .addColumn('sessionNo', 'bigint', (col) => col.unsigned().modifyEnd(comment('행위자의 세션')))
    .addColumn('action', 'varchar(128)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('감사 카탈로그 액션')),
    )
    .addColumn('targetType', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).modifyEnd(comment('대상 종류')),
    )
    .addColumn('targetRefNo', 'bigint', (col) => col.unsigned().modifyEnd(comment('대상 번호')))
    .addColumn('method', 'varchar(8)', (col) => col.notNull())
    .addColumn('path', 'varchar(255)', (col) =>
      col.notNull().modifyEnd(comment('쿼리를 뗀 요청 경로')),
    )
    .addColumn('statusCode', 'smallint', (col) => col.unsigned().notNull())
    .addColumn('errorCode', 'varchar(64)', (col) =>
      col.modifyFront(ASCII_BIN).modifyEnd(comment('실패면 응답 봉투의 code')),
    )
    .addColumn('ip', 'varchar(45)', (col) =>
      col.modifyEnd(comment('요청 IP. IPv4-mapped IPv6 최대 45자')),
    )
    .addColumn('userAgent', 'varchar(255)')
    .addColumn('meta', 'json', (col) =>
      col.modifyFront(JSON_BIN).modifyEnd(comment('소독 · bigint 접기를 거친 JSON')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxAuditLogsActor')
    .on('auditLogs')
    .columns(['actorUserNo', 'createAt'])
    .execute()
  await db.schema
    .createIndex('idxAuditLogsTarget')
    .on('auditLogs')
    .columns(['targetType', 'targetRefNo', 'createAt'])
    .execute()
  await db.schema
    .createIndex('idxAuditLogsAction')
    .on('auditLogs')
    .columns(['action', 'createAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('auditLogs').execute()
}
