import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/users.table.ts
// 바꾼 점: `revision` 추가.

export interface AdminUsersTable {
  userNo: Generated<bigint>
  userId: string
  /** argon2id 해시. 원문이 들어오는 일이 없어야 한다 */
  password: string
  userName: string
  roleNo: bigint
  /** 현재 활성 재직 사이클의 캐시 — 원천은 userEmploymentPeriods. DB 기본값이 있어 넣을 때 생략할 수 있다 */
  joinAt: ColumnType<Date, Date | undefined, Date>
  /** NULL 이 아니면 퇴사 */
  resignAt: Date | null
  isPasswordChangeRequired: Generated<boolean>
  loginFailCount: Generated<number>
  /** NULL 이 아니고 미래면 로그인 잠김 */
  lockUntil: Date | null
  revision: Generated<number>
  createAt: ColumnType<Date, never, never>
  updateAt: ColumnType<Date, never, never>
}
