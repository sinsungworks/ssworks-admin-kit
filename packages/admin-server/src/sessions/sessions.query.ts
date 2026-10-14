import { createQuerySchema, queryBigIntSchema } from '@ssworks/admin-shared'
import { z } from 'zod'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.dto.ts(정렬 열 · userNo 필터) + axion 검색어
// 바꾼 점: 서버 내부 스키마다 — admin-ui useSessions 는 어댑터라 이 스키마를 읽지 않는다(2c 스펙 §4-6). 폐기 행 필터
//   (hangang isRevoked)는 없다 — 목록은 살아 있는 세션만이다(공통 1).

export const SESSION_KEYWORD_MAX_LENGTH = 64

export const adminSessionListQuerySchema = createQuerySchema({
  sortableColumns: ['lastAccessAt', 'loginAt', 'expireAt'] as const,
  defaultSortColumn: 'lastAccessAt',
  filterShape: {
    /** 아이디 · 이름 부분일치. 앞뒤 공백을 떼고, 비면 조건 없음 */
    keyword: z.string().trim().max(SESSION_KEYWORD_MAX_LENGTH),
    /** 한 사용자의 세션만 — 사용자 상세 화면(2c 스펙 B3) */
    userNo: queryBigIntSchema,
  },
})

export type AdminSessionListQuery = z.infer<typeof adminSessionListQuerySchema>
