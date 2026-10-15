import { Inject, Injectable, Logger } from '@nestjs/common'
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
// 2f-2a(스펙 A15 · ④ W1): 진단 경고 둘 — 주소를 못 읽어 막았을 때(clientIp · trust proxy 오설정), global 층 규칙이 없을 때.
//   인스턴스당 한 번씩, 추가 쿼리 없이 이미 읽은 규칙 · 받은 주소로 판정한다. 주소 값을 싣지 않는다.

/** 서버 로그 문구(화면에 나가지 않는다) */
export const IP_POLICY_WARNINGS = {
  nullClientIp:
    '클라이언트 IP 를 읽지 못해 막았다 — 코어 옵션 clientIp 와 Express trust proxy 를 확인한다.',
  noGlobalRule:
    'global 층 IP 규칙이 없다 — 사용자 · 팀 규칙이 없는 계정은 어디서도 들어오지 못한다(README "잠겼을 때").',
} as const

@Injectable()
export class IpAccessPolicy implements AdminAccessPolicy {
  private readonly logger = new Logger('IpAccessPolicy')
  /** 🔴 인스턴스당 한 번씩 — 매 인증 요청이 부르므로 요청마다 남기면 로그가 쌓인다 */
  private warnedNullIp = false
  private warnedNoGlobal = false

  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  async allows(context: AdminAccessContext): Promise<boolean> {
    const rules = await runQuery(() => ipRuleSetQuery(this.db).execute())
    this.diagnose(context.clientIp, rules)
    return evaluateIpAccess(context.clientIp, rules, {
      userNo: context.userNo,
      teamNos: context.teamNos,
    })
  }

  private diagnose(clientIp: string | null, rules: readonly { scopeType: string }[]): void {
    if (clientIp === null && !this.warnedNullIp) {
      this.warnedNullIp = true
      this.logger.warn(IP_POLICY_WARNINGS.nullClientIp)
    }
    if (!this.warnedNoGlobal && !rules.some((rule) => rule.scopeType === 'global')) {
      this.warnedNoGlobal = true
      this.logger.warn(IP_POLICY_WARNINGS.noGlobalRule)
    }
  }
}
