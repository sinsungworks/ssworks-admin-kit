import { Inject, Injectable } from '@nestjs/common'
import { evaluateIpAccess } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminAccessContext, AdminAccessPolicy } from '../auth/hooks.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import { ipRuleSetQuery } from './rule-set.js'

// 정본: hangang-home apps/api/src/core/guards/auth.guard.ts · modules/auth/auth.service.ts(로그인 IP 게이팅) +
//       ip-access.service.ts loadRules
// 바꾼 점: 2b 가 만든 ADMIN_ACCESS_POLICY 자리를 채운다 — boolean 만 돌려주고 403 은 인증 서비스가 던진다(2b B7).
// 🔴 매 인증 요청이 부른다 — 잠금 없이 규칙 전량(세 열)을 읽는다. 캐시하지 않는다(2f-1 스펙 P2 · ⑥ A) — 인스턴스가 여럿이면
//    다른 인스턴스가 낡은 규칙으로 통과시키는 창이 생긴다.

@Injectable()
export class IpAccessPolicy implements AdminAccessPolicy {
  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  async allows(context: AdminAccessContext): Promise<boolean> {
    const rules = await runQuery(() => ipRuleSetQuery(this.db).execute())
    return evaluateIpAccess(context.clientIp, rules, {
      userNo: context.userNo,
      teamNos: context.teamNos,
    })
  }
}
