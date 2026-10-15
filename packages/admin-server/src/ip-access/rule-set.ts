import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts loadRules(평가에 필요한 세 열)
// 바꾼 점: 쿼리 하나로 둔다 — IP 정책(매 인증) · 잔존 셈 · 자기 잠금 판정이 같은 모양을 읽는다(2f-1 스펙 P2 · P4 · P6).
// 🔴 비잠금 읽기다. 여기에 FOR UPDATE 를 붙이지 않는다 — 인증 hot path 가 서로를 막고, 잔존 셈의 잠금은 교착 배치다(hangang).

export function ipRuleSetQuery(db: Kysely<AdminDatabase>) {
  return db.selectFrom('ipAccessRules').select(['scopeType', 'scopeRefNo', 'cidr'])
}
