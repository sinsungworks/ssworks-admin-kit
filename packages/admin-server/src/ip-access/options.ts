import { resolveClientIpSource, type AdminClientIpSource } from '../auth/request-meta.js'
import type { AdminServerOptions } from '../options.js'

// 정본: 없음 — 2f-1 스펙 2-2 #2 · #3. IP 모듈은 자기 옵션이 없다(phase0 ipAccess 옵션 다섯은 고정 동작). 코어 옵션 둘만 읽는다.

export interface ResolvedIpAccessConfig {
  /** 켜면 IP 쓰기가 본문 currentPassword 로 재인증한다 — 역할 · 사용자와 같은 스위치(코어 reauth) */
  readonly reauth: boolean
  /** 자기 잠금 · 미리보기가 보는 요청자 주소의 출처 — 인증과 같은 해석 */
  readonly clientIp: AdminClientIpSource
}

/** 🔴 기동에서 멈춘다: reauth 가 boolean 이 아님, clientIp 가 두 값 밖 */
export function resolveIpAccessConfig(
  options: Pick<AdminServerOptions, 'reauth' | 'clientIp'>,
): ResolvedIpAccessConfig {
  if (options.reauth !== undefined && typeof options.reauth !== 'boolean') {
    throw new Error('reauth 는 true · false 여야 한다.')
  }
  return Object.freeze({
    reauth: options.reauth === true,
    clientIp: resolveClientIpSource(options.clientIp),
  })
}
