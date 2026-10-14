// 정본: hangang-home apps/api/src/core/database/tables/guard-locks.table.ts
// 바꾼 점: 없음.

/** 직렬화 지점 — 행 하나를 `FOR UPDATE` 로 잡는다(2d 스펙 §5-3). 앱은 읽기 · 잠금만 하고 쓰지 않는다 */
export interface AdminGuardLocksTable {
  lockName: string
  description: string
}
