import type { CookieOptions, Request, Response } from 'express'
import type { ResolvedAuthConfig } from './options.js'

// 정본: hangang-home apps/api/src/core/utils/cookie.util.ts(set/clear 가 옵션 함수 하나를 공유 · 호출 시점 평가 ·
//       Secure fail-secure) + ssworks-gise-home apps/api/src/core/auth/cookies.ts(refresh 경로)
// 바꾼 점: 이름 · 경로 · SameSite · Secure · domain 이 옵션이다(스펙 ⑨ C1). `j:` 객체 쿠키를 "없음" 으로 읽는 readCookie 를
//   더했다(2a 최종 리뷰).

export interface AuthCookieTokens {
  accessToken: string
  refreshToken: string
}

/**
 * Secure `'auto'` 판정. 🔴 부를 때마다 읽는다 — 모듈 최상위 상수면 ESM import 호이스팅으로 main.ts 의 loadDotEnv() 보다
 * 먼저 굳어 `.env` 의 NODE_ENV 가 닿지 않는다(hangang A9-2).
 * 🔴 NODE_ENV 를 OR 로 둔다 — X-Forwarded-Proto 만 믿으면 클라이언트가 `http` 를 보내 Secure 를 벗길 수 있다(hangang 08편).
 * trust proxy 없이는 X-Forwarded-Proto 가 req.secure 를 바꾸지 않아 헤더를 직접 읽는다(스펙 §14 R1-5).
 */
export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true
  const header = req.headers['x-forwarded-proto']
  const raw = Array.isArray(header) ? header[0] : header
  const first = typeof raw === 'string' ? raw.split(',')[0]?.trim().toLowerCase() : undefined
  return first === 'https' || process.env.NODE_ENV === 'production'
}

/** 🔴 set 과 clear 가 이 함수 하나를 쓴다 — path · domain 이 어긋난 clearCookie 를 브라우저는 무시한다(crm 사고). */
function baseCookieOptions(req: Request, config: ResolvedAuthConfig, path: string): CookieOptions {
  const { cookies } = config
  return {
    httpOnly: true,
    sameSite: cookies.sameSite,
    secure: cookies.secure === 'auto' ? isSecureRequest(req) : cookies.secure,
    path,
    ...(cookies.domain === undefined ? {} : { domain: cookies.domain }),
  }
}

export function setAuthCookies(
  req: Request,
  res: Response,
  config: ResolvedAuthConfig,
  tokens: AuthCookieTokens,
): void {
  res.cookie(config.cookies.accessName, tokens.accessToken, {
    ...baseCookieOptions(req, config, '/'),
    maxAge: config.accessTtlMs,
  })
  res.cookie(config.cookies.refreshName, tokens.refreshToken, {
    ...baseCookieOptions(req, config, config.cookies.refreshPath),
    maxAge: config.refreshTtlMs,
  })
}

export function clearAuthCookies(req: Request, res: Response, config: ResolvedAuthConfig): void {
  res.clearCookie(config.cookies.accessName, baseCookieOptions(req, config, '/'))
  res.clearCookie(
    config.cookies.refreshName,
    baseCookieOptions(req, config, config.cookies.refreshPath),
  )
}

/**
 * 문자열이고 비어 있지 않을 때만 값. 🔴 cookie-parser 는 `j:` 로 시작하는 값을 JSON 으로 풀어 객체 · 배열을 줄 수 있다 —
 * 그대로 해시하면 `[object Object]` 를 해시한다(2a 최종 리뷰).
 */
export function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined
  const value = cookies?.[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
