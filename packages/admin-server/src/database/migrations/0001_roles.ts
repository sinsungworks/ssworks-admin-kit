import { sql, type Kysely } from 'kysely'
import { JSON_BIN, TABLE_OPTIONS, UTF8_CI, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/001_roles.migration.ts + 014_roles_role_name_unique.migration.ts
// 바꾼 점:
//  - roleName UNIQUE 를 첫 장에서 건다(hangang 은 014 에서 중복 진단 뒤). 새 스키마라 진단할 기존 행이 없다.
//  - `revision` 을 더했다 — Phase 0 §4 #4(쓰기 보호 revision 기본). 수정 · 삭제 성공마다 서비스가 올리고 이동은 올리지
//    않는다(3b §9).
//  - 순서 · 기본 표시 인덱스 둘을 더했다(2d-3 스펙 ③ I1) — 미발행 장을 고쳤다(2d-2 의 0002 정정과 같은 길). 인덱스가 없는
//    DB 도 2d-2 와 같이 돈다(전 행 잠금일 뿐 — 빠지면 500 인 가드 행과 다르다).
//  - 인자 타입은 `Kysely<unknown>`(스펙 R2). 🔴 현재의 Database 타입에 묶지 않는다 — 마이그레이션은 얼어붙은 이력이다.
// 🔴 순서상 첫째다 — users 가 이 테이블을 FK 로 참조한다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('roles')
    .addColumn('roleNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('roleName', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('직책 이름')),
    )
    .addColumn('permissions', 'json', (col) =>
      col
        .notNull()
        .modifyFront(JSON_BIN)
        .modifyEnd(comment("권한 키 배열. 전권자는 ['*'] 한 원소")),
    )
    .addColumn('displayOrder', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('화면 표시 순서')),
    )
    // 🔴 'tinyint(1)' 문자열은 Kysely 의 ColumnDataType 폐집합에 없다 — sql 템플릿으로 넘기는 것이 Kysely 문서의 우회다.
    .addColumn('isDefault', sql`tinyint(1)`, (col) =>
      col.notNull().defaultTo(0).modifyEnd(comment('신규 계정의 기본 직책')),
    )
    .addColumn('revision', 'integer', (col) =>
      col
        .unsigned()
        .notNull()
        .defaultTo(0)
        .modifyEnd(comment('낙관적 잠금. 수정 · 삭제마다 오른다(이동은 아님)')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updateAt', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint('uqRolesRoleName', ['roleName'])
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  // 🔴 만들기의 순서 셈(끝 행 FOR UPDATE) · 이동의 구간 UPDATE · 다른 기본 역할 찾기가 이 인덱스로 그 행만 잠근다. 없으면 전 행을
  //    훑어 잠가 사용자 역할 변경 · 다른 역할 쓰기와 교착한다(2d-3 스펙 §14 R1-7 ~ R1-9 — 역할 몇 개뿐인 표에서도 인덱스를 탄다).
  await db.schema
    .createIndex('idxRolesDisplayOrder')
    .on('roles')
    .columns(['displayOrder'])
    .execute()
  await db.schema.createIndex('idxRolesIsDefault').on('roles').columns(['isDefault']).execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('roles').execute()
}
