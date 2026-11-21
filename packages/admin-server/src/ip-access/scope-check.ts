import { ipScopeProblem, isCoreIpScopeType } from '@ssworks/admin-shared'
import { IP_ACCESS_MESSAGES, scopeRefError, scopeTypeError } from './errors.js'
import type { ResolvedIpAccessConfig } from './options.js'

// 정본: 없음 — 확장 범위 스펙 §4-2 · §4-3 · X2. 범위 판정을 한 곳에 — 만들기 파이프와 수정의 병합 결과가 같은 함수를 쓴다
//   (hangang R30 — 다른 판정을 두 번 적으면 "저장은 됐는데 어느 층에도 안 걸리는" 행이 생긴다).

export interface RuleScope {
  scopeType: string
  scopeRefNo: bigint | null
}

export interface RuleScopeProblem {
  path: 'scopeType' | 'scopeRefNo'
  message: string
}

type ScopeConfig = Pick<ResolvedIpAccessConfig, 'extraScopes'>

/** 이 앱이 받는 범위 이름인가 — 코어 셋 ∪ 등록된 확장 범위 */
export function isKnownScopeType(config: ScopeConfig, scopeType: string): boolean {
  return isCoreIpScopeType(scopeType) || config.extraScopes.has(scopeType)
}

/** 범위 불변식 — 코어는 ipScopeProblem(global ⇔ 대상 없음), 확장은 등록 · wholeScope(X7 · X8). 맞으면 null */
export function ruleScopeProblem(config: ScopeConfig, scope: RuleScope): RuleScopeProblem | null {
  if (isCoreIpScopeType(scope.scopeType)) {
    const message = ipScopeProblem({ scopeType: scope.scopeType, scopeRefNo: scope.scopeRefNo })
    return message === null ? null : { path: 'scopeRefNo', message }
  }
  const extra = config.extraScopes.get(scope.scopeType)
  if (extra === undefined)
    return { path: 'scopeType', message: IP_ACCESS_MESSAGES.unknownScopeType }
  if (scope.scopeRefNo === null && !extra.wholeScope) {
    return { path: 'scopeRefNo', message: IP_ACCESS_MESSAGES.wholeScopeOff }
  }
  return null
}

/** ruleScopeProblem 이 있으면 400(그 칸) */
export function assertRuleScope(config: ScopeConfig, scope: RuleScope): void {
  const problem = ruleScopeProblem(config, scope)
  if (problem === null) return
  throw problem.path === 'scopeType'
    ? scopeTypeError(problem.message)
    : scopeRefError(problem.message)
}

/** 같은 갈래인가 — 코어끼리, 또는 같은 확장 범위(X2 — 수정은 갈래를 넘지 않는다) */
export function sameScopeFamily(a: string, b: string): boolean {
  return isCoreIpScopeType(a) ? isCoreIpScopeType(b) : a === b
}
