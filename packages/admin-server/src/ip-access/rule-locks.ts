import type { IpScope } from '@ssworks/admin-shared'
import type { Transaction } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { IP_ACCESS_MESSAGES, ruleNotFound, scopeRefError } from './errors.js'
import type { ResolvedIpExtraScope } from './options.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts lockAllRules · assertScopeRefExists
// 바꾼 점:
//  - 규칙 전 구간 FOR UPDATE(hangang R31) 대신 대상 규칙 한 행만 잠근다 — IP 쓰기는 모두 잔존 가드 행을 첫 문장으로 잡아
//    서로 직렬화된다(2f-1 스펙 §5-3).
//  - 가리키는 팀 · 사용자 행을 FOR UPDATE 로 잠근다(P7) — hangang 은 비잠금 존재 확인이었다. 없으면 400 scopeRefNo.
// 🔴 둘 다 잠금 단계(셈 앞)에서 부른다 — 셈이 읽기 뷰를 연 뒤에 잠그면 스냅샷 격리 ON 에서 그 사이 바뀐 행이 1020 이다
//    (§14 R1-②). 🔴 팀 행 잠금이 팀 삭제와 줄을 세운다 — 규칙이 먼저면 삭제가 409, 삭제가 먼저면 여기서 400(§14 R1-①).

export interface LockedRule {
  ruleNo: bigint
  scopeType: string
  scopeRefNo: bigint | null
  cidr: string
  description: string | null
  revision: number
}

/** 대상 규칙 — FOR UPDATE. 없으면 404 */
export async function lockRule(
  trx: Transaction<AdminDatabase>,
  ruleNo: bigint,
): Promise<LockedRule> {
  const row = await trx
    .selectFrom('ipAccessRules')
    .select(['ruleNo', 'scopeType', 'scopeRefNo', 'cidr', 'description', 'revision'])
    .where('ruleNo', '=', ruleNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw ruleNotFound()
  return row
}

/** 가리키는 팀 · 사용자 행 — FOR UPDATE. 없으면 400 scopeRefNo. global(대상 없음)은 잠글 것이 없다 */
export async function lockScopeRef(trx: Transaction<AdminDatabase>, scope: IpScope): Promise<void> {
  const refNo = scope.scopeRefNo
  if (scope.scopeType === 'global' || refNo === null) return
  if (scope.scopeType === 'team') {
    const team = await trx
      .selectFrom('teams')
      .select('teamNo')
      .where('teamNo', '=', refNo)
      .forUpdate()
      .executeTakeFirst()
    if (team === undefined) throw scopeRefError(IP_ACCESS_MESSAGES.noScopeTeam)
    return
  }
  const user = await trx
    .selectFrom('users')
    .select('userNo')
    .where('userNo', '=', refNo)
    .forUpdate()
    .executeTakeFirst()
  if (user === undefined) throw scopeRefError(IP_ACCESS_MESSAGES.noScopeUser)
}

/**
 * 확장 범위 대상 — 쓰는 쪽 훅(target.lock)이 FOR UPDATE 로 잠근다. 없으면 400 scopeRefNo. 범위 전체(null)는 잠글 것이 없다
 * (확장 범위 스펙 X3 · X5). 🔴 잠금 순서는 규칙 행 → 쓰는 쪽 대상 행(X6) — 쓰는 쪽은 ipAccessRules 를 잠그지 않는다.
 */
export async function lockExtraScopeTarget(
  trx: Transaction<AdminDatabase>,
  scope: ResolvedIpExtraScope,
  refNo: bigint | null,
): Promise<void> {
  if (refNo === null) return
  if (!(await scope.target.lock(trx, refNo))) throw scopeRefError(IP_ACCESS_MESSAGES.noScopeTarget)
}
