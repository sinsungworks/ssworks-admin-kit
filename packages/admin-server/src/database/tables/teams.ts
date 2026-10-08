import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/teams.table.ts
// 바꾼 점: 없음.

export interface AdminTeamsTable {
  teamNo: Generated<bigint>
  teamName: string
  displayOrder: Generated<number>
  createAt: ColumnType<Date, never, never>
  updateAt: ColumnType<Date, never, never>
}
