import type { AdminRolesTable } from './tables/roles.js'
import type { AdminSessionsTable } from './tables/sessions.js'
import type { AdminTeamClosureTable } from './tables/team-closure.js'
import type { AdminTeamUserMapTable } from './tables/team-user-map.js'
import type { AdminTeamsTable } from './tables/teams.js'
import type { AdminUserEmploymentPeriodsTable } from './tables/user-employment-periods.js'
import type { AdminUsersTable } from './tables/users.js'

// 정본: hangang-home apps/api/src/core/database/types.ts(테이블 파일 분리 + 조합)
// 바꾼 점: 코어 7키만. 쓰는 쪽은 `interface Database extends AdminDatabase { posts: PostsTable }` 로 넓힌다 — 코어 테이블에
//   컬럼을 더하려면 `users: AdminUsersTable & { email: string | null }`. 🔴 패키지 코드는 더한 컬럼을 모르므로 NOT NULL
//   확장 컬럼은 DEFAULT 를 둬야 한다(Phase 0 §5).

export interface AdminDatabase {
  roles: AdminRolesTable
  users: AdminUsersTable
  teams: AdminTeamsTable
  teamClosure: AdminTeamClosureTable
  teamUserMap: AdminTeamUserMapTable
  userEmploymentPeriods: AdminUserEmploymentPeriodsTable
  sessions: AdminSessionsTable
}

export type {
  AdminRolesTable,
  AdminSessionsTable,
  AdminTeamClosureTable,
  AdminTeamUserMapTable,
  AdminTeamsTable,
  AdminUserEmploymentPeriodsTable,
  AdminUsersTable,
}
export type { AdminSessionRevokeReason } from './tables/sessions.js'
