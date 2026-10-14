import type { AdminPrincipal } from '../auth/principal.js'
import type { AdminReauthService } from '../auth/reauth.service.js'
import type { ResolvedAccountsConfig } from './options.js'

// 정본: 2d-1 AdminRolesService.reauth — 역할 · 사용자 서비스가 같은 길을 쓴다(2d 스펙 ⑦ R1).
// 🔴 트랜잭션 밖 · 권한 가드 뒤에서 부른다 — argon2 가 행 잠금을 쥔 채 돌지 않게(2b §4-7).

/** reauth 가 꺼져 있으면 아무것도 하지 않는다. 켜져 있으면 currentPassword 를 확인한다(틀리면 403 ERR_REAUTH_REQUIRED) */
export async function reauthenticate(
  config: Pick<ResolvedAccountsConfig, 'reauth'>,
  service: AdminReauthService | undefined,
  principal: AdminPrincipal,
  password: string | undefined,
): Promise<void> {
  if (!config.reauth) return
  if (service === undefined) {
    // 모듈 기동 검사(assertAuthModuleRegistered)가 막았어야 한다 — 수동 조립의 방어선.
    throw new Error('AdminReauthService 가 없다 — AdminAuthModule 을 import 한다.')
  }
  await service.verify(principal, password ?? '')
}
