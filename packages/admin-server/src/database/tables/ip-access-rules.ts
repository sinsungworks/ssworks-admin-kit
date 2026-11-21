import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/ip-access-rules.table.ts
// 바꾼 점: revision 을 더했다. updateAt 은 revision 이 오르는 쓰기가 current_timestamp 로 같이 쓴다(장 0002 users 와 같다).

export interface AdminIpAccessRulesTable {
  ruleNo: Generated<bigint>
  /** 🔴 코어(`'global' | 'team' | 'user'`) 또는 확장 범위 이름 — ENUM 이 아니다(장 주석). 관리자 판정은 코어 셋만 읽는다 */
  scopeType: string
  /** 🔴 다형 참조라 FK 가 없다 — global 이면 null */
  scopeRefNo: bigint | null
  /** IPv4 · IPv6 CIDR(최대 43자) — admin-shared `parseCidr` 가 읽는다 */
  cidr: string
  description: string | null
  revision: Generated<number>
  createAt: ColumnType<Date, never, never>
  /** 🔴 ON UPDATE 없음 — 수정 쓰기가 `current_timestamp` 로 같이 쓴다 */
  updateAt: ColumnType<Date, never, Date>
}
