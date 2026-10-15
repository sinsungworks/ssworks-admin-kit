import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/007_ip_access_rules.migration.ts(+ 부트스트랩 시드의 global 허용 두 행)
// 바꾼 점:
//  - revision 을 더했다 — Phase 0 §4 #4 쓰기 보호(2f-1 스펙 2-2 #2). updateAt 에 ON UPDATE 를 두지 않는다(장 0002 정정과 같다).
//  - cidr · scopeType 은 ascii_bin(hangang ascii_ci) — DB 는 비교 · 정렬 · UNIQUE 에 쓰지 않는다. CIDR 을 읽는 것은 admin-shared
//    parseCidr 하나다.
//  - global 허용 두 행을 장이 넣는다(2f-1 스펙 ③ D1) — hangang 은 부트스트랩 시드였다. 평가가 기본 거부라 모듈을 import 한 순간
//    아무도 못 들어오는 일이 없게. 장 0009 가 가드 행을 시드하는 것과 같다. 인자 타입 Kysely<unknown>(2a R2).
// 🔴 scopeType 에 ENUM · CHECK 를 두지 않는다 — 값을 더할 때 ALTER 가 필요하고 ENUM 정렬은 선언 순서다(hangang). 입구는 zod.
// 🔴 scopeRefNo 는 다형 참조라 FK 가 없다 — 팀 삭제는 가리키는 규칙이 있으면 409(2f-1 스펙 ⑤ T1), 사용자는 패키지에 삭제 경로가
//    없다.
// 🔴 0.0.0.0/0 과 ::/0 은 두 행이어야 한다 — 계열이 다르면 매칭하지 않는다(::/0 이 IPv4 를 통과시키지 않는다).

type IpAccessRules = {
  ipAccessRules: {
    scopeType: string
    scopeRefNo: bigint | null
    cidr: string
    description: string | null
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('ipAccessRules')
    .addColumn('ruleNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('scopeType', 'varchar(16)', (col) =>
      col.notNull().modifyFront(ASCII_BIN).modifyEnd(comment("'global' | 'team' | 'user'")),
    )
    .addColumn('scopeRefNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('global 이면 NULL. 다형 참조라 FK 가 없다')),
    )
    .addColumn('cidr', 'varchar(43)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('IPv4 · IPv6 CIDR(최대 43자). admin-shared parseCidr 가 읽는다')),
    )
    .addColumn('description', 'varchar(200)', (col) =>
      col.modifyEnd(comment('이 규칙이 왜 있는가')),
    )
    .addColumn('revision', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('낙관적 잠금. 수정마다 오른다')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updateAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxIpAccessRulesScope')
    .on('ipAccessRules')
    .columns(['scopeType', 'scopeRefNo'])
    .execute()

  await db
    .withTables<IpAccessRules>()
    .insertInto('ipAccessRules')
    .values([
      {
        scopeType: 'global',
        scopeRefNo: null,
        cidr: '0.0.0.0/0',
        description: '기본 허용(IPv4) — 지우거나 좁히기 전에 미리보기를 본다',
      },
      {
        scopeType: 'global',
        scopeRefNo: null,
        cidr: '::/0',
        description: '기본 허용(IPv6) — 지우거나 좁히기 전에 미리보기를 본다',
      },
    ])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('ipAccessRules').execute()
}
