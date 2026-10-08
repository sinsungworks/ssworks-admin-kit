import type { ColumnType } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/team-user-map.table.ts
// 바꾼 점: 없음.

export interface AdminTeamUserMapTable {
  teamNo: bigint
  userNo: bigint
  /** DB 기본값이 있어 넣을 때 생략할 수 있다 */
  joinAt: ColumnType<Date, Date | undefined, Date>
}
