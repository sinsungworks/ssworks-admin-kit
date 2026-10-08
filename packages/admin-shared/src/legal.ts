import { z } from 'zod'

// 약관 · 개인정보처리방침 같은 법적 문서의 관리 계약 — Phase 2 서버와 admin-ui `useLegalDocuments` 가 같은 모양을
// 본다.
//
// 정본: ssworks-axion-admin packages/shared/src/schemas/legal.schema.ts
//       + ssworks-gise-home packages/shared/src/legal/schema.ts
// 바꾼 점:
//  - 종류(`kind`)는 문자열이다. 값 집합은 소비자 카탈로그이고(axion TERMS · PRIVACY · REFUND / gise PRIVACY · TERMS)
//    서버 검증은 Phase 2 모듈 옵션이 한다(3e 스펙 §9).
//  - 시각은 ISO UTC 문자열이다(gise) — axion 의 `z.coerce.date()` 는 추론 타입이 Date 인데 화면이 받는 값은 문자열이었다.
//  - 이름: 번호 `legalDocNo`(axion), 발행자 `publishedByUserNo` · `publishedByUserName`(둘 다 nullable — gise 의 FK SET NULL).
//  - 발행 본문에 `baseLegalDocNo`(편집을 시작한 판)를 싣는다 — 동시 발행 보호(3e ⑤ V2). 두 정본에 없었다.
//  - 현재본 응답은 `{ item: 문서 | null }` — 미발행을 404 가 아니라 null 로 알린다(3e D15).
//
// 🔴 발행 본문에 `contentHash` 가 없다. 해시는 서버가 sha256(body) 로 계산하는 유일한 값이다 — 클라이언트가 보낸 해시를
//    믿으면 동의 기록의 스냅샷을 위조할 수 있다(axion · gise).
// 🔴 본문을 트림하지 않는다 — 편집기에서 받은 그대로가 해시 대상이다(3e D3). 공백 검사는 `regex` 로 한다.
// 🔴 객체 스키마에 `.refine()` 을 걸지 않는다(3b §11 R1) — 소비자의 `.extend()` · `.omit()` 을 막지 않는다.

export const LEGAL_BODY_MAX_LENGTH = 1_000_000

/** 공백만이면 거부, 최대 1,000,000자. 트림하지 않는다 */
export const legalBodySchema = z
  .string()
  .max(
    LEGAL_BODY_MAX_LENGTH,
    `본문은 ${LEGAL_BODY_MAX_LENGTH.toLocaleString('en-US')}자를 넘을 수 없습니다.`,
  )
  .regex(/\S/, '본문을 입력하세요.')

/** sha256 hex 소문자 64자 — 서버만 계산한다 */
const contentHashSchema = z.string().regex(/^[0-9a-f]{64}$/)

export interface AdminLegalDocument {
  legalDocNo: bigint
  kind: string
  body: string
  /** sha256 hex 소문자 64자. 서버만 계산한다 */
  contentHash: string
  /** ISO 8601 UTC(세션 스키마와 같은 `z.iso.datetime()`) */
  publishedAt: string
  /** 발행자 계정이 지워지면 null(FK ON DELETE SET NULL) */
  publishedByUserNo: bigint | null
  publishedByUserName: string | null
}

export const adminLegalDocumentSchema = z.object({
  legalDocNo: z.bigint(),
  kind: z.string().min(1),
  body: z.string(),
  contentHash: contentHashSchema,
  publishedAt: z.iso.datetime(),
  publishedByUserNo: z.bigint().nullable(),
  publishedByUserName: z.string().nullable(),
})

/** 이력 행 — 본문을 싣지 않는다(목록이 문서 전량을 끌어오지 않게) */
export type AdminLegalHistoryItem = Omit<AdminLegalDocument, 'body'>
export const adminLegalHistoryItemSchema = adminLegalDocumentSchema.omit({ body: true })

/** 현재 시행본 — `item: null` 이 미발행(정상 시작 상태) */
export const adminLegalCurrentSchema = z.object({ item: adminLegalDocumentSchema.nullable() })
export type AdminLegalCurrent = z.infer<typeof adminLegalCurrentSchema>

/** 발행 이력 — 최신순 전량(페이지 없음, 발행은 드물다) */
export const adminLegalHistorySchema = z.object({ items: z.array(adminLegalHistoryItemSchema) })
export type AdminLegalHistory = z.infer<typeof adminLegalHistorySchema>

export interface AdminLegalPublish {
  kind: string
  body: string
  /** 편집을 시작한 판 번호. 미발행 상태에서 시작했으면 null(3e ⑤ V2) */
  baseLegalDocNo: bigint | null
}

export const adminLegalPublishSchema = z.object({
  kind: z.string().min(1),
  body: legalBodySchema,
  baseLegalDocNo: z.bigint().nullable(),
})

export const adminLegalPublishResultSchema = z.object({
  legalDocNo: z.bigint(),
  contentHash: contentHashSchema,
})
export type AdminLegalPublishResult = z.infer<typeof adminLegalPublishResultSchema>
