import type { Request } from 'express'

// 정본: hangang-home apps/api/src/core/audit/audit.service.ts `attachDiff` · `attachMeta` · `attachTarget`
// 바꾼 점: 서비스 메서드가 아니라 함수다(2c 스펙 B2) — hangang 메서드도 DI 상태를 쓰지 않았다. 가방에는 원본만 쌓고, 소독은
//   인터셉터가 쓸 때 한 번에 한다(`serializeAuditMeta`) — attachAuditMeta 경로도 저절로 소독된다(hangang 은 소독하지 않았다).
//   Express Request 를 증강하지 않는다 — 비공개 심볼 자리(2b 주체와 같은 방식).

const AUDIT_BAG = Symbol('admin-kit:audit-bag')

export interface AuditBag {
  targetRefNo?: bigint
  meta: Record<string, unknown>
}

type WithBag = Request & { [AUDIT_BAG]?: AuditBag }

function bagOf(req: Request): AuditBag {
  const holder = req as WithBag
  // 🔴 meta 는 null-prototype 이다(최종 리뷰 F1) — JSON 본문의 자기 "__proto__" 키를 일반 객체에 `Object.assign` 하면 `[[Set]]` 이
  //    프로토타입을 바꿔 그 패치 전체가 소독을 빠져나간다. null-prototype 에서는 그냥 데이터 키다.
  holder[AUDIT_BAG] ??= { meta: Object.create(null) as Record<string, unknown> }
  return holder[AUDIT_BAG]
}

export function readAuditBag(req: Request): AuditBag | undefined {
  return (req as WithBag)[AUDIT_BAG]
}

/** 경로 변수로 대상을 알 수 없을 때(생성 · "다른 세션 모두") 핸들러가 붙인다. 🔴 자동 추출보다 먼저다(B6) */
export function attachAuditTarget(req: Request, targetRefNo: bigint): void {
  bagOf(req).targetRefNo = targetRefNo
}

/** meta 에 얕게 병합한다. 비밀 키 값은 기록할 때 가린다 */
export function attachAuditMeta(req: Request, patch: Record<string, unknown>): void {
  Object.assign(bagOf(req).meta, patch)
}

/**
 * 변경 전 · 후에서 `fields` 에 적힌 자기 키만 골라 meta 의 before · after 로 둔다.
 * 🔴 본문 같은 큰 필드를 fields 에 넣지 않는다 — meta 64 KiB 상한(B8)에 걸려 자리표시만 남는다.
 */
export function attachAuditDiff(
  req: Request,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): void {
  const pick = (source: Record<string, unknown> | null | undefined): Record<string, unknown> => {
    // 🔴 null-prototype — `__proto__` 라는 필드 이름도 대입이 아니라 데이터로 남는다(최종 리뷰 F1)
    const picked = Object.create(null) as Record<string, unknown>
    if (source == null) return picked
    for (const field of fields) if (Object.hasOwn(source, field)) picked[field] = source[field]
    return picked
  }
  Object.assign(bagOf(req).meta, { before: pick(before), after: pick(after) })
}
