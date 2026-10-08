import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/006_sessions.migration.ts + 011_sessions_revoke_reason.migration.ts
//       + ssworks-gise-home 003_session_grace.migration.ts(유예창 컬럼)
// 바꾼 점:
//  - `deviceInfo` → `userAgent` — admin-shared `adminSessionSchema` 의 필드 이름이다. 응답에서 바꿔 담지 않는다.
//  - 유예창 컬럼 `revokedAt` · `replacedBySessionNo` 를 처음부터 둔다(gise 003, `replacedBySessionNo` 는 bigint). Phase 0
//    §4 #6 이 유예창을 옵션으로 정했고 쓸지는 2b 가 정한다.
//  - 🔴 `lastAccessAt` 에 `ON UPDATE` 를 두지 않는다 — 폐기 UPDATE 에도 반응해 마지막 활동 시각이 바뀐다. 앱이 직접 쓴다.
//  - 🔴 `loginAt` 은 앱이 넣을 수 있다 — 회전은 새 행을 만들고 옛 행의 loginAt 을 옮겨 담는다(2b). hangang 은 DB 기본값뿐이라
//    살아 있는 행의 "로그인 시각" 이 마지막 회전 시각이 됐다.
// 🔴 refresh 토큰 원문을 저장하지 않는다 — sha256 hex 64자만(hangang). 덤프 한 장이 유효 토큰 전량 유출이 되지 않는다.
// 🔴 `revokedReason` 은 'rotated' 만 재사용 판정 대상이다. 'terminated'(명시적 종료) · 'reuse_detected'(탐지 연쇄 폐기)는
//    "세션이 끝났다" 로만 응답한다 — 관리자 강제 종료가 재사용 탐지로 오인돼 전 기기가 로그아웃되던 문제를 닫는다(hangang 011).
// 🔴 `expireAt` · `revokedAt` 은 datetime — timestamp NOT NULL 을 DEFAULT 없이 두면 동작이 서버 전역
//    explicit_defaults_for_timestamp 에 달린다(hangang §16).
// 🔴 `replacedBySessionNo` 에 자기 참조 FK · 인덱스를 두지 않는다 — 읽기만 하고 조건으로 검색하지 않는다(gise 003).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('sessions')
    .addColumn('sessionNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('userNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('refreshTokenHash', 'char(64)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('sha256(refresh 토큰) hex. 원문을 저장하지 않는다')),
    )
    .addColumn('userAgent', 'varchar(512)', (col) => col.modifyEnd(comment('User-Agent 원문')))
    .addColumn('ipAddress', 'varchar(45)', (col) =>
      col.modifyEnd(comment('로그인 시점 IP. IPv4-mapped IPv6 최대 45자')),
    )
    .addColumn('loginAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('최초 로그인 시각. 회전이 옮겨 담는다')),
    )
    .addColumn('lastAccessAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('마지막 활동. 앱이 쓴다')),
    )
    .addColumn('expireAt', 'datetime', (col) =>
      col.notNull().modifyEnd(comment('refresh 만료. 애플리케이션이 항상 값을 넣는다')),
    )
    .addColumn('isRevoked', sql`tinyint(1)`, (col) =>
      col.notNull().defaultTo(0).modifyEnd(comment('폐기됨(회전 · 종료 · 재사용 탐지)')),
    )
    .addColumn('revokedReason', 'varchar(16)', (col) =>
      col.modifyEnd(comment("NULL | 'rotated' | 'terminated' | 'reuse_detected'")),
    )
    .addColumn('revokedAt', 'datetime', (col) =>
      col.modifyEnd(comment('폐기 시각. 유예창 판정 기준')),
    )
    .addColumn('replacedBySessionNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('회전으로 이 세션을 대체한 새 세션. 최초 회전만 기록한다')),
    )
    .addUniqueConstraint('uqSessionsRefreshTokenHash', ['refreshTokenHash'])
    .addForeignKeyConstraint('fkSessionsUser', ['userNo'], 'users', ['userNo'], (cb) =>
      cb.onDelete('cascade').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema.createIndex('idxSessionsUser').on('sessions').columns(['userNo']).execute()
  await db.schema.createIndex('idxSessionsExpireAt').on('sessions').columns(['expireAt']).execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('sessions').execute()
}
