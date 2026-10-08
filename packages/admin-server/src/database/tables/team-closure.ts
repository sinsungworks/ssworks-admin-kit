// 정본: hangang-home apps/api/src/core/database/tables/team-closure.table.ts
// 바꾼 점: 없음.

export interface AdminTeamClosureTable {
  ancestorNo: bigint
  descendantNo: bigint
  /** 0 이면 자기 참조 */
  depth: number
}
