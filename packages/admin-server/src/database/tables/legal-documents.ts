import type { ColumnType, Generated } from 'kysely'

// 정본: ssworks-gise-home 006_legal_documents 장 · 약관 행 타입(publishedAt 은 DB 가 채우는 Managed 열)
// 바꾼 점: 이름은 admin-shared 계약(legalDocNo · publishedByUserNo), PK bigint.

/** 🔴 append-only — 앱은 INSERT 와 SELECT 만 한다(legal/legal-append-only.test.ts) */
export interface AdminLegalDocumentsTable {
  legalDocNo: Generated<bigint>
  /** 옵션 legal.kinds 의 값 — ascii_bin(대소문자를 가른다) */
  kind: string
  /** 마크다운 원문 — 트림하지 않은 그대로가 해시 대상이다 */
  body: string
  /** 🔴 sha256(body) hex 64자 소문자 — 서버만 셈한다 */
  contentHash: string
  /** 🔴 DB 시계 — 넣지도 고치지도 않는다(append-only 를 타입으로) */
  publishedAt: ColumnType<Date, never, never>
  /** 계정이 지워지면 null(FK ON DELETE SET NULL) */
  publishedByUserNo: bigint | null
}
