import { coreAuditCatalog, type AuditCatalog } from '@ssworks/admin-shared'
import { resolveClientIpSource, type AdminClientIpSource } from '../auth/request-meta.js'
import { secretKeySet } from './scrub.js'

// 정본: 없음 — Phase 0 §3-2 `audit: { enabled, sink?, catalog, blacklist }` 를 실제로 갈리는 값만 남겼다(2c 스펙 §4-1).
//   enabled 는 모듈 import, sink 는 내부(ADMIN_AUTH_EVENTS), blacklist 는 secretKeys, 파티셔닝은 없다.

export interface AdminAuditOptions {
  /** admin-shared `defineAuditCatalog()` 결과. 없으면 코어 카탈로그 */
  catalog?: AuditCatalog
  /** 기본 비밀 키에 더한다(2c 스펙 B1). 대소문자 무시 — 기본 키를 뺄 수는 없다 */
  secretKeys?: readonly string[]
}

export interface ResolvedAuditConfig {
  catalog: AuditCatalog
  /** 소문자 */
  secretKeys: ReadonlySet<string>
  /** 코어 옵션 clientIp(2f-1 ④ C1) — 감사 행 ip 의 출처. 인증과 같은 해석 */
  clientIp: AdminClientIpSource
}

export function resolveAuditConfig(
  options: AdminAuditOptions | undefined,
  clientIp?: unknown,
): ResolvedAuditConfig {
  const extra = options?.secretKeys ?? []
  for (const key of extra) {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error('audit.secretKeys 는 빈 문자열이 아닌 키 이름이어야 한다.')
    }
  }
  return Object.freeze({
    catalog: options?.catalog ?? coreAuditCatalog,
    secretKeys: secretKeySet(extra),
    clientIp: resolveClientIpSource(clientIp),
  })
}
