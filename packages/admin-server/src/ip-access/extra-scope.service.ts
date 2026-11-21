import { Inject, Injectable } from '@nestjs/common'
import { evaluateScopedIpAccess, type IpRule } from '@ssworks/admin-shared'
import type { Request } from 'express'
import type { Kysely } from 'kysely'
import { clientIpOf } from '../auth/request-meta.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_IP_ACCESS_CONFIG, KYSELY } from '../tokens.js'
import { countScopeRulesQuery, scopeRulesQuery } from './extra-scope-queries.js'
import type { ResolvedIpAccessConfig, ResolvedIpExtraScope } from './options.js'

// 정본: 없음 — 확장 범위 스펙 §4-6 · X10(R4b · R8). 쓰는 쪽 @Public() 가드가 매 요청 부른다 — 쓰는 쪽이 ipAccessRules 를 직접
//   질의하는 데 기대지 않게 한다. 범위 등록 · wholeScope 를 아는 쪽이 읽어야 거른 결과가 판정과 같다.
// 🔴 비잠금 · 캐시 없음(2f-1 P2 와 같은 이유 — 인스턴스가 여럿이면 낡은 규칙으로 통과시키는 창). 🔴 코어 규칙을 읽지 않는다(R3b).

@Injectable()
export class AdminIpExtraScopeService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_IP_ACCESS_CONFIG) private readonly config: ResolvedIpAccessConfig,
  ) {}

  /** 요청자 주소 — 관리자 판정 · 세션 · 감사와 같은 출처(코어 clientIp). 쓰는 쪽은 헤더를 직접 읽지 않는다 */
  clientIpOf(req: Request): string | null {
    return clientIpOf(req, this.config.clientIp)
  }

  /** 그 범위의 규칙(scopeType · scopeRefNo · cidr). wholeScope 가 꺼졌으면 NULL 행을 뺀다 */
  async rulesOf(scopeType: string): Promise<IpRule[]> {
    const scope = this.registered(scopeType)
    return runQuery(() =>
      scopeRulesQuery(this.db, scope.type, { wholeScope: scope.wholeScope }).execute(),
    )
  }

  /** 이 주소로 이 주체가 들어올 수 있는가 — 그 대상 · 범위 전체 행만 읽어 evaluateScopedIpAccess */
  async allows(scopeType: string, scopeRefNo: bigint, clientIp: string | null): Promise<boolean> {
    const scope = this.registered(scopeType)
    const rules = await runQuery(() =>
      scopeRulesQuery(this.db, scope.type, {
        wholeScope: scope.wholeScope,
        refNo: scopeRefNo,
      }).execute(),
    )
    return evaluateScopedIpAccess(clientIp, rules, { scopeType: scope.type, scopeRefNo })
  }

  /**
   * 이 대상을 가리키는 규칙 수(R8). db 에 쓰는 쪽 트랜잭션을 넘길 수 있다.
   * 🔴 쓰는 쪽은 대상 행을 FOR UPDATE 로 잠근 **뒤** 첫 비잠금 읽기로 부른다(팀 삭제의 소속 셈과 같은 이유 — 2e D1).
   */
  async countRulesOf(
    scopeType: string,
    scopeRefNo: bigint,
    db: Kysely<AdminDatabase> = this.db,
  ): Promise<number> {
    const scope = this.registered(scopeType)
    const row = await runQuery(() =>
      countScopeRulesQuery(db, scope.type, scopeRefNo).executeTakeFirstOrThrow(),
    )
    return Number(row.n)
  }

  /** 🔴 등록되지 않은 이름(코어 이름 포함)은 설정 오류다 — 던진다(쓰는 쪽 가드가 500 → 막힘) */
  private registered(scopeType: string): ResolvedIpExtraScope {
    const scope = this.config.extraScopes.get(scopeType)
    if (scope === undefined) {
      throw new Error(
        `AdminIpExtraScopeService — 등록되지 않은 확장 범위다: ${JSON.stringify(scopeType)} — AdminServerModule 옵션 ipAccess.extraScopes 에 더한다.`,
      )
    }
    return scope
  }
}
