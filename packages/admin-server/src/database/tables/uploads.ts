import type { ColumnType, Generated } from 'kysely'

// 정본: ssworks-ringside packages/db(uploads 표 타입) — 장 0013 과 같은 열.
// 바꾼 점: camelCase 계약 · uploadedByUserNo nullable(FK SET NULL).

export interface AdminUploadsTable {
  uploadNo: Generated<bigint>
  /** admin-shared UPLOAD_KEY_PATTERN — ascii_bin UNIQUE */
  storageKey: string
  /** 옵션 uploads.purposes 의 키 — 키의 첫 조각과 같다 */
  purpose: string
  /** 올린 관리자. 계정이 지워지면 null */
  uploadedByUserNo: bigint | null
  bytes: number
  width: number
  /** 움짤은 한 프레임 높이 */
  height: number
  /** 첨부 대상 종류(감사 대상 이름). null = 미첨부 */
  refType: string | null
  refId: bigint | null
  attachedAt: Date | null
  /** 지움 표시 — 정리 잡이 객체를 지운 뒤 행을 지운다 */
  deletedAt: Date | null
  /** 🔴 DB 시계 — 넣지도 고치지도 않는다 */
  createdAt: ColumnType<Date, never, never>
}
