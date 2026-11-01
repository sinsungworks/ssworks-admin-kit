import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, TABLE_OPTIONS, comment } from './_shared.js'

// 정본: ssworks-ringside packages/db/src/migrations/1792292005397_create_uploads.ts(열 구성 · 인덱스 셋 · 미첨부 24시간)
// 바꾼 점:
//  - 이름은 admin-shared 계약(storageKey · refType · refId · uploadedByUserNo) · camelCase 열(CamelCasePlugin) · PK uploadNo.
//  - 올린 사람 FK 는 users SET NULL(약관 발행자와 같다) — 계정을 지워도 첨부된 그림은 남는다. ringside 는 RESTRICT.
//  - CHECK(ref_type ⇔ ref_id ⇔ attached_at) 는 두지 않는다 — 쓰는 곳이 attach.ts · sweep.ts 둘뿐이고 MariaDB CHECK 는 옵티마이저 힌트가 없다.
//  - mime 열이 없다 — 저장 형식은 언제나 WebP(스펙 U1).
//  - attached_at · deleted_at 은 DATETIME(앱 시계 · UTC 프로세스) — TIMESTAMP 는 첫 열에 암묵 DEFAULT/ON UPDATE 가 붙는 판이 있다.
//  - created_at 은 DB 시계(CURRENT_TIMESTAMP), attached_at · deleted_at 은 앱이 쓴다(new Date()). created_at < ? 에 앱 Date 를 넘겨도
//    안전하다 — 풀이 세션 timezone 'Z' 로 고정하고(database/connection.ts) createAdminKysely 가 프로세스 TZ = UTC 를 지킨다.
// 🔴 ref_type 폭 64 = CoreAuditTargets 폭(AUDIT_TARGET_TYPE_MAX_LENGTH) — 첨부 대상 이름을 감사 대상 이름과 같은 값으로 쓴다(스펙 §2 끝).
// 🔴 idx_uploads_uploader(uploaded_by_user_no, upload_no) 는 미첨부 셈, idx_uploads_deleted(deleted_at, created_at) 는 정리 잡의
//    두 문장(미첨부 보관 초과 · 지움 표시 묶음)이 탄다. idx_uploads_ref(ref_type, ref_id) 는 미디어 조회 · 첨부 · 동기화 질의가 탄다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('uploads')
    .addColumn('uploadNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('storageKey', 'varchar(128)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(
          comment('<용도>/<yyyy>/<mm>/<base64url 32자>.webp — admin-shared UPLOAD_KEY_PATTERN'),
        ),
    )
    .addColumn('purpose', 'varchar(32)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('용도. 폐집합의 정본은 옵션 uploads.purposes')),
    )
    .addColumn('uploadedByUserNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('올린 관리자. NULL = 계정이 지워졌다')),
    )
    .addColumn('bytes', 'integer', (col) =>
      col.unsigned().notNull().modifyEnd(comment('저장한 WebP 크기')),
    )
    .addColumn('width', 'integer', (col) => col.unsigned().notNull())
    .addColumn('height', 'integer', (col) =>
      col.unsigned().notNull().modifyEnd(comment('움짤은 한 프레임 높이')),
    )
    .addColumn('refType', 'varchar(64)', (col) =>
      col
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('첨부 대상 종류(감사 대상 이름 — legalDocument …). NULL = 미첨부')),
    )
    .addColumn('refId', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('첨부 대상 번호. 다형 참조라 FK 가 없다')),
    )
    .addColumn('attachedAt', 'datetime', (col) => col.modifyEnd(comment('첨부 시각(앱 시계 UTC)')))
    .addColumn('deletedAt', 'datetime', (col) =>
      col.modifyEnd(comment('지움 표시(앱 시계 UTC) — 객체는 정리 잡이 지운 뒤 행을 지운다')),
    )
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addUniqueConstraint('uqUploadsStorageKey', ['storageKey'])
    .addForeignKeyConstraint(
      'fkUploadsUploadedBy',
      ['uploadedByUserNo'],
      'users',
      ['userNo'],
      (cb) => cb.onDelete('set null').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxUploadsUploader')
    .on('uploads')
    .columns(['uploadedByUserNo', 'uploadNo'])
    .execute()
  await db.schema.createIndex('idxUploadsRef').on('uploads').columns(['refType', 'refId']).execute()
  await db.schema
    .createIndex('idxUploadsDeleted')
    .on('uploads')
    .columns(['deletedAt', 'createdAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('uploads').execute()
}
