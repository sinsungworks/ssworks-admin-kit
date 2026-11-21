import { isCoreIpScopeType } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import type { ResolvedIpAccessConfig } from './options.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts findAll(행 모양)
// 바꾼 점: 2f-1 P13(팀 · 사용자 LEFT JOIN 이름)을 서비스에서 옮겼고, 확장 범위 대상 이름을 범위마다 쓰는 쪽 훅(target.names)
//   한 번으로 붙인다(확장 범위 스펙 §4-4). 받지 못한 번호 · 범위 전체 · 등록이 빠진 범위는 null.
// 🔴 훅이 던지면 그대로 던진다 — 이름을 숨기면 대상이 사라진 것처럼 보인다.

/** 목록 · 응답의 행 — admin-shared adminIpRuleSchema 와 같은 모양(시각은 ISO 문자열) */
export type AdminIpRuleView = {
  ruleNo: bigint
  scopeType: string
  scopeRefNo: bigint | null
  scopeName: string | null
  scopeUserId: string | null
  cidr: string
  description: string | null
  revision: number
  createAt: string
  updateAt: string
}

/** ruleViewQuery 의 행 */
export type RuleViewRow = {
  ruleNo: bigint
  scopeType: string
  scopeRefNo: bigint | null
  teamName: string | null
  userName: string | null
  userId: string | null
  cidr: string
  description: string | null
  revision: number
  createAt: Date
  updateAt: Date
}

/** 행들 → 응답 모양. 🔴 db 는 쓰기 트랜잭션일 수 있다(쓴 뒤 응답) — 훅도 같은 연결로 읽는다 */
export async function toRuleViews(
  db: Kysely<AdminDatabase>,
  config: Pick<ResolvedIpAccessConfig, 'extraScopes'>,
  rows: readonly RuleViewRow[],
): Promise<AdminIpRuleView[]> {
  const wanted = new Map<string, Set<bigint>>()
  for (const row of rows) {
    if (isCoreIpScopeType(row.scopeType) || row.scopeRefNo === null) continue
    if (!config.extraScopes.has(row.scopeType)) continue
    const refNos = wanted.get(row.scopeType) ?? new Set<bigint>()
    refNos.add(row.scopeRefNo)
    wanted.set(row.scopeType, refNos)
  }
  const names = new Map<string, ReadonlyMap<bigint, string>>()
  for (const [scopeType, refNos] of wanted) {
    const scope = config.extraScopes.get(scopeType)
    if (scope !== undefined) names.set(scopeType, await scope.target.names(db, [...refNos]))
  }
  return rows.map((row) => toRuleView(row, names.get(row.scopeType)))
}

function scopeNameOf(
  row: RuleViewRow,
  extraNames: ReadonlyMap<bigint, string> | undefined,
): string | null {
  if (row.scopeType === 'team') return row.teamName
  if (row.scopeType === 'user') return row.userName
  if (row.scopeType === 'global' || row.scopeRefNo === null) return null
  return extraNames?.get(row.scopeRefNo) ?? null
}

function toRuleView(
  row: RuleViewRow,
  extraNames: ReadonlyMap<bigint, string> | undefined,
): AdminIpRuleView {
  return {
    ruleNo: row.ruleNo,
    scopeType: row.scopeType,
    scopeRefNo: row.scopeRefNo,
    scopeName: scopeNameOf(row, extraNames),
    scopeUserId: row.scopeType === 'user' ? row.userId : null,
    cidr: row.cidr,
    description: row.description,
    revision: row.revision,
    createAt: row.createAt.toISOString(),
    updateAt: row.updateAt.toISOString(),
  }
}
