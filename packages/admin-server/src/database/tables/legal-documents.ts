import type { ColumnType } from 'kysely'

// 정본: ssworks-gise-home 006_legal_documents 장 · 약관 행 타입(publishedAt 은 DB 가 채우는 Managed 열)
// 바꾼 점: 이름은 admin-shared 계약(legalDocNo · publishedByUserNo), PK bigint. audit-logs 처럼 AppendOnly 로
//   모든 열의 갱신 타입을 never 로 막는다(append-only 를 타입으로).

/** 넣을 수 있고 고칠 수 없다 */
type AppendOnly<T> = ColumnType<T, T, never>

/** 🔴 append-only — 앱은 INSERT 와 SELECT 만 한다(legal/legal-append-only.test.ts). 모든 열이 UPDATE 불가 */
export interface AdminLegalDocumentsTable {
  /** AUTO_INCREMENT — 앱이 넣지도 고치지도 않는다(audit-logs 의 logNo 와 같다) */
  legalDocNo: ColumnType<bigint, never, never>
  /** 옵션 legal.kinds 의 값 — ascii_bin(대소문자를 가른다) */
  kind: AppendOnly<string>
  /** 마크다운 원문 — 트림하지 않은 그대로가 해시 대상이다 */
  body: AppendOnly<string>
  /** 🔴 sha256(body) hex 64자 소문자 — 서버만 셈한다 */
  contentHash: AppendOnly<string>
  /** 🔴 DB 시계 — 넣지도 고치지도 않는다(append-only 를 타입으로) */
  publishedAt: ColumnType<Date, never, never>
  /** 계정이 지워지면 null(FK ON DELETE SET NULL) — 바꾸는 것은 DB 뿐, 앱은 고치지 않는다 */
  publishedByUserNo: AppendOnly<bigint | null>
}
