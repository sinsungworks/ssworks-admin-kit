import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 정본: 없음 — 확장 범위 스펙 §4-6(쓰는 쪽 판정 · 규칙 수). 🔴 비잠금 · 캐시 없음(코어 정책과 같은 이유 — 2f-1 P2).
// 인덱스 idxIpAccessRulesScope(scopeType, scopeRefNo)를 탄다. 🔴 모듈 수준 함수다 — DB 없이 컴파일된 SQL 을 단위 시험이 잰다.

export interface ScopeRulesFilter {
  /** 범위 전체 층을 판정에 쓰는가 — 꺼졌으면 NULL 행을 뺀다(X7) */
  wholeScope: boolean
  /** 주면 그 대상 행(+ 켜져 있으면 범위 전체 행)만 */
  refNo?: bigint
}

/** 한 확장 범위의 규칙 — 판정에 필요한 세 열 */
export function scopeRulesQuery(
  db: Kysely<AdminDatabase>,
  scopeType: string,
  filter: ScopeRulesFilter,
) {
  const base = db
    .selectFrom('ipAccessRules')
    .select(['scopeType', 'scopeRefNo', 'cidr'])
    .where('scopeType', '=', scopeType)
    .orderBy('ruleNo')
  const { refNo } = filter
  if (refNo === undefined) {
    return filter.wholeScope ? base : base.where('scopeRefNo', 'is not', null)
  }
  return filter.wholeScope
    ? base.where((eb) => eb.or([eb('scopeRefNo', '=', refNo), eb('scopeRefNo', 'is', null)]))
    : base.where('scopeRefNo', '=', refNo)
}

/** 이 대상을 가리키는 규칙 수 — wholeScope 와 무관하게 그 번호의 행만 */
export function countScopeRulesQuery(db: Kysely<AdminDatabase>, scopeType: string, refNo: bigint) {
  return db
    .selectFrom('ipAccessRules')
    .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
    .where('scopeType', '=', scopeType)
    .where('scopeRefNo', '=', refNo)
}
