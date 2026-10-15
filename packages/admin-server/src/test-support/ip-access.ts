import type { IpScopeType } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 테스트 전용 — IP 규칙 시드 · 초기화(2f-1). 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 🔴 규칙은 DB 전역 상태다 — 규칙을 바꾸는 테스트 파일은 beforeEach 로 resetIpRules 를 부른다.

export interface IpRuleSeed {
  scopeType: IpScopeType
  scopeRefNo?: bigint | null
  cidr: string
  description?: string | null
}

/** 장 0012 의 시드와 같은 두 행 */
export const SEED_IP_RULES: readonly IpRuleSeed[] = Object.freeze([
  { scopeType: 'global', cidr: '0.0.0.0/0' },
  { scopeType: 'global', cidr: '::/0' },
])

export async function seedIpRule(db: Kysely<AdminDatabase>, input: IpRuleSeed): Promise<bigint> {
  const result = await db
    .insertInto('ipAccessRules')
    .values({
      scopeType: input.scopeType,
      scopeRefNo: input.scopeRefNo ?? null,
      cidr: input.cidr,
      description: input.description ?? null,
    })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

/** 규칙을 모두 지우고 rules(기본 — 장의 시드 두 행)만 넣는다. 넣은 번호를 차례로 돌려준다 */
export async function resetIpRules(
  db: Kysely<AdminDatabase>,
  rules: readonly IpRuleSeed[] = SEED_IP_RULES,
): Promise<bigint[]> {
  await db.deleteFrom('ipAccessRules').execute()
  const ruleNos: bigint[] = []
  for (const rule of rules) ruleNos.push(await seedIpRule(db, rule))
  return ruleNos
}

/** 지금 규칙 — ruleNo 순 */
export function ipRulesOf(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('ipAccessRules')
    .select(['ruleNo', 'scopeType', 'scopeRefNo', 'cidr', 'description', 'revision'])
    .orderBy('ruleNo')
    .execute()
}
