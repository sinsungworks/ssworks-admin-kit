import { z } from 'zod'

// 세션 코어 계약 — Phase 2 서버와 admin-ui `SessionTable` · `useSessions` 가 같은 모양을 본다.
//
// 정본: hangang-home apps/api/src/modules/sessions(컬럼 · 라우트) + kim5257-crm-v5
//       packages/shared/src/schemas/session.schema.ts(관리자 목록 행)
// 바꾼 점:
//  - 필드명은 hangang 컬럼(`loginAt` · `lastAccessAt`)을 따른다. gise 의 `lastActiveAt` 은 실제로는 행 생성
//    시각이라 뜻이 다르다. 원문은 `userAgent` — 화면이 `describeUserAgent()` 로 해석한다(crm 의 서버 해석
//    `device{}` 를 버렸다).
//  - crm 고유의 `source`(web · API 키) · `apiKeyName` 은 넣지 않는다 — 프로젝트가 `.extend()` 로 더한다.
//  - 🔴 `.refine()` 을 걸지 않는다(3b §11 R1) — 소비자의 `.extend()` · `.omit()` 을 막지 않는다.
//
// 🔴 시각은 와이어에서 ISO UTC 문자열(`Z`)이다. 킷 JSON 코덱은 `"BigInt(n)"` 만 되살리고 날짜는 문자열로 둔다.

export const adminSessionSchema = z.object({
  sessionNo: z.bigint(),
  /** 브라우저 원문. 화면이 `describeUserAgent()` 로 해석한다. 없으면 null */
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  loginAt: z.string().datetime(),
  lastAccessAt: z.string().datetime(),
  expireAt: z.string().datetime(),
  /** 🔴 요청한 사람이 지금 쓰는 세션인가 — 목록에서 끊지 못하게 막는 근거다(3c 스펙 D4) */
  isCurrent: z.boolean(),
})

/** 관리자 전체 목록 행 — 누구의 세션인지가 더 붙는다 */
export const adminSessionListItemSchema = adminSessionSchema.extend({
  userNo: z.bigint(),
  userId: z.string(),
  userName: z.string(),
})

/** "다른 세션 모두" · "사용자 전체" 의 응답. 화면은 이 개수가 있을 때만 개수를 말한다 */
export const adminSessionRevokeResultSchema = z.object({ revokedCount: z.number().int().min(0) })

export type AdminSession = z.infer<typeof adminSessionSchema>
export type AdminSessionListItem = z.infer<typeof adminSessionListItemSchema>
export type AdminSessionRevokeResult = z.infer<typeof adminSessionRevokeResultSchema>
