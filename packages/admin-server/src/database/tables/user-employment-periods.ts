import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/user-employment-periods.table.ts
// 바꾼 점: 없음.

export interface AdminUserEmploymentPeriodsTable {
  periodNo: Generated<bigint>
  userNo: bigint
  /** 입사일(DATE) */
  joinAt: Date
  /** NULL 이면 활성 사이클 */
  resignAt: Date | null
  reason: string | null
  /** 기록 시점 프로세스 TZ. 패키지는 항상 'UTC' */
  recordedTimezone: string
  /** 기록한 관리자. 최초 입사 행은 NULL */
  createdBy: bigint | null
  createAt: ColumnType<Date, never, never>
}
