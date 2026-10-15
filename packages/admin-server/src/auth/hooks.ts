import type { Request } from 'express'

// 정본: 없음 — 2c(감사) · 2f(IP 접근 제어)가 꽂을 자리(스펙 ⑧ H1). hangang 은 인증 서비스 · 가드가 감사 · IP 를 직접
//   불렀다 — 여기서는 선택 주입 토큰 둘로 뺀다. 판정 순서(2f-2a): 로그인 = (정책이 있으면) IP → 비밀번호 → 잠김 → 퇴사,
//   매 요청 = 세션 → 사용자 → 퇴사 → IP, refresh · 유예 = IP → 퇴사.

export interface AdminAccessContext {
  clientIp: string | null
  userNo: bigint
  /** 대표 팀 하나(또는 빈 배열) — 다중 팀은 범위 밖(hangang R34) */
  teamNos: readonly bigint[]
}

/**
 * `ADMIN_ACCESS_POLICY`. 🔴 boolean 만 돌려준다 — 거부의 응답은 패키지가 만든다(스펙 B7): 로그인은 같은 401
 * `ERR_LOGIN_FAILED`(details 없음 — 주소 때문임을 흘리지 않는다), 가드 · refresh · 유예는 403 `ERR_IP_NOT_ALLOWED` +
 * `details.clientIp`. 정책은 있는 계정의 로그인 시도마다 비밀번호 확인 **앞에서** 불린다(호출 수 · 부수 효과에 유의) — 매 요청 ·
 * refresh 에서도 그대로 불린다.
 */
export interface AdminAccessPolicy {
  allows(context: AdminAccessContext): Promise<boolean>
}

/** 인증 이벤트. 🔴 비밀번호 · 토큰 · 해시를 싣지 않는다 */
export type AdminAuthEvent =
  | { type: 'login.success'; userNo: bigint; sessionNo: bigint }
  | { type: 'login.fail'; userId: string; userNo: bigint | null; loginFailCount: number | null }
  | {
      type: 'login.blocked'
      reason: 'resigned' | 'ip' | 'locked'
      userId: string
      userNo: bigint
    }
  | {
      type: 'token.refresh'
      userNo: bigint
      sessionNo: bigint
      rotatedFrom: bigint
      grace: boolean
    }
  | { type: 'token.reuse'; userNo: bigint; sessionNo: bigint; revokedCount: number }
  | { type: 'logout'; userNo: bigint; sessionNo: bigint }
  | { type: 'password.change'; userNo: bigint; sessionNo: bigint; revokedCount: number }
  | { type: 'access.blocked'; reason: 'ip'; userNo: bigint; sessionNo: bigint }

/** `ADMIN_AUTH_EVENTS`. 🔴 던져도 인증은 계속된다 — 패키지가 잡아 Logger.warn(스펙 B8) */
export interface AdminAuthEventSink {
  record(event: AdminAuthEvent, req: Request): Promise<void>
}
