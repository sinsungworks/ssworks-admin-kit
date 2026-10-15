import { isValidIp, normalizeIp } from '@ssworks/admin-shared'
import type { Request } from 'express'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.controller.ts `sessionMeta` +
//       hangang-home apps/api/src/core/utils/request-ip.util.ts `getClientIp`(정규화 · X-Real-IP)
// 바꾼 점:
//  - 없으면 null(gise 는 '0.0.0.0').
//  - 출처를 코어 옵션 clientIp 로 고른다(2f-1 스펙 ④ C1 · P10). hangang 의 헤더 순서(X-Real-IP → XFF[0] → X-Remote-IP →
//    소켓)는 무조건 믿었다 — 엣지 프록시(set_real_ip_from) 없이 노출되면 헤더 한 줄로 IP 제한을 우회한다. 기본은 'req.ip'
//    (Express trust proxy — 쓰는 쪽 main.ts 몫).
//  - 두 출처 모두 normalizeIp 를 지나고 주소 하나로 읽혀야 한다 — 아니면 null. IP 정책은 null 을 거부한다(fail-closed).
// 🔴 세션 행 · 감사 · IP 정책이 이 값 하나를 본다.

/** 코어 옵션 `clientIp` — 클라이언트 IP 를 읽는 곳 */
export type AdminClientIpSource = 'req.ip' | 'x-real-ip'

export interface RequestMeta {
  clientIp: string | null
  userAgent: string | null
}

/** 🔴 기동에서 멈춘다 — 오타가 조용히 'req.ip' 로 떨어지면 엣지 뒤 배포가 모든 요청을 엣지 주소로 본다 */
export function resolveClientIpSource(value: unknown): AdminClientIpSource {
  if (value === undefined) return 'req.ip'
  if (value === 'req.ip' || value === 'x-real-ip') return value
  throw new Error("clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.")
}

function addressOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const normalized = normalizeIp(raw.trim())
  return isValidIp(normalized) ? normalized : null
}

/**
 * - `'req.ip'`: Express 의 `req.ip`.
 * - `'x-real-ip'`: 헤더가 있으면 그 값만. 🔴 배열 · 쉼표로 이어 붙은 값(중복 헤더 — Node 가 `'a, b'` 로 잇는다, 2f-1 스펙
 *   §14 R1-④) · 형식 오류 · 빈 값은 null — 앞쪽을 고르면 위조 값을 고른다. 헤더가 없으면 `req.ip`.
 */
export function clientIpOf(req: Request, source: AdminClientIpSource): string | null {
  if (source === 'x-real-ip') {
    const header = req.headers['x-real-ip']
    if (header !== undefined) return addressOf(header)
  }
  return addressOf(req.ip)
}

export function requestMetaOf(req: Request, source: AdminClientIpSource): RequestMeta {
  const userAgent = req.headers['user-agent']
  return {
    clientIp: clientIpOf(req, source),
    userAgent: typeof userAgent === 'string' && userAgent.length > 0 ? userAgent : null,
  }
}
