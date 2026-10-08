import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/sessions.table.ts + gise 003(유예창 컬럼)
// 바꾼 점: `deviceInfo` → `userAgent`, `loginAt` 을 넣을 수 있게, `lastAccessAt` 을 쓸 수 있게, 유예창 컬럼 둘.

/** 🔴 `'rotated'` 만 재사용 판정 대상이다. `null` 은 아직 폐기되지 않은 세션 */
export type AdminSessionRevokeReason = 'rotated' | 'terminated' | 'reuse_detected'

export interface AdminSessionsTable {
  sessionNo: Generated<bigint>
  userNo: bigint
  /** 🔴 sha256(토큰) hex 64자. 이름이 원문을 암시하면 나중에 누군가 원문을 넣는다(hangang) */
  refreshTokenHash: string
  userAgent: string | null
  ipAddress: string | null
  /** 🔴 회전이 새 행에 옛 값을 옮겨 담는다 — 넣을 수 있고 고칠 수 없다 */
  loginAt: ColumnType<Date, Date | undefined, never>
  /** 🔴 ON UPDATE 없음 — 앱이 직접 쓴다 */
  lastAccessAt: ColumnType<Date, Date | undefined, Date>
  expireAt: Date
  isRevoked: Generated<boolean>
  revokedReason: AdminSessionRevokeReason | null
  revokedAt: Date | null
  replacedBySessionNo: bigint | null
}
