import type { Request } from 'express'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.controller.ts `sessionMeta`
// 바꾼 점: 없으면 null(gise 는 '0.0.0.0'). 클라이언트 IP 의 출처(X-Real-IP 우선 · trust proxy)는 2f 가 다시 본다.

export interface RequestMeta {
  clientIp: string | null
  userAgent: string | null
}

/** 🔴 clientIp 는 req.ip 그대로다 — trust proxy 는 쓰는 쪽 main.ts 몫이다. 세션 행 · IP 정책 · 이벤트가 같은 값을 본다. */
export function requestMetaOf(req: Request): RequestMeta {
  const userAgent = req.headers['user-agent']
  return {
    clientIp: typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : null,
    userAgent: typeof userAgent === 'string' && userAgent.length > 0 ? userAgent : null,
  }
}
