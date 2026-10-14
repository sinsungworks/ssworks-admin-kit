import { createQuerySchema, queryBigIntSchema, queryBooleanSchema } from '@ssworks/admin-shared'
import { expressionBuilder, sql, type Expression, type SqlBool } from 'kysely'
import { z } from 'zod'
import { likeContains } from '../database/like.js'
import type { AdminUsersTable } from '../database/tables/users.js'
import type { AdminDatabase } from '../database/types.js'

// 정본: hangang-home apps/api/src/modules/users/users.dto.ts(정렬 열 · 검색어 · 팀 필터) + ssworks-gise-home like.ts
// 바꾼 점: 서버 내부 스키마다(2d 스펙 §2-2 #13 — 화면은 어댑터). 🔴 boolean 쿼리는 'true' · 'false' 만(queryBooleanSchema —
//   crm · axion 의 z.coerce.boolean() 은 "false" 를 참으로 읽었다). 팀 필터는 소속 전체로(B9 — 대표 팀이 아니다), 하위 팀은
//   closure 자기 행에 기대지 않는다(§14 R6-3). resigned 는 퇴사 예정(효력 시각 미래)을 포함한다.

export const USER_KEYWORD_MAX_LENGTH = 64

export const adminUserListQuerySchema = createQuerySchema({
  sortableColumns: ['userId', 'userName', 'joinAt', 'resignAt', 'createAt', 'updateAt'] as const,
  defaultSortColumn: 'createAt',
  filterShape: {
    /** 아이디 · 이름 부분일치. 앞뒤 공백을 떼고, 비면 조건 없음 */
    keyword: z.string().trim().max(USER_KEYWORD_MAX_LENGTH),
    /** 소속 팀(대표 팀이 아니라 소속 전체 — B9). 3d TeamUserList 가 보낸다 */
    teamNo: queryBigIntSchema,
    /** teamNo 와 함께일 때만 뜻이 있다 — 하위 팀 포함 */
    recursive: queryBooleanSchema,
    /** active = 퇴사 처리 없음, resigned = 퇴사 · 퇴사 예정 */
    status: z.enum(['active', 'resigned']),
  },
})

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>

type UsersAlias = AdminDatabase & { u: AdminUsersTable }

/** 목록 조건 — 수 세기와 행 읽기가 같은 식을 쓴다. 조건이 없으면 1 = 1 */
export function userListCondition(filter: AdminUserListQuery['filter']): Expression<SqlBool> {
  const eb = expressionBuilder<UsersAlias, 'u'>()
  const conditions: Expression<SqlBool>[] = []
  if (filter?.keyword) {
    const pattern = likeContains(filter.keyword)
    conditions.push(
      eb.or([
        sql<SqlBool>`${sql.ref('u.userId')} like ${pattern} escape '!'`,
        sql<SqlBool>`${sql.ref('u.userName')} like ${pattern} escape '!'`,
      ]),
    )
  }
  const teamNo = filter?.teamNo
  if (teamNo !== undefined) {
    const recursive = filter?.recursive === true
    conditions.push(
      eb.exists(
        eb
          .selectFrom('teamUserMap as m')
          .select('m.userNo')
          .whereRef('m.userNo', '=', 'u.userNo')
          .where((inner) =>
            recursive
              ? // 🔴 직접 소속을 따로 본다 — closure 의 자기 행(depth 0)에 기대지 않는다(§14 R6-3)
                inner.or([
                  inner('m.teamNo', '=', teamNo),
                  inner(
                    'm.teamNo',
                    'in',
                    inner
                      .selectFrom('teamClosure as c')
                      .select('c.descendantNo')
                      .where('c.ancestorNo', '=', teamNo),
                  ),
                ])
              : inner('m.teamNo', '=', teamNo),
          ),
      ),
    )
  }
  if (filter?.status === 'active') conditions.push(eb('u.resignAt', 'is', null))
  if (filter?.status === 'resigned') conditions.push(eb('u.resignAt', 'is not', null))
  return eb.and(conditions)
}
