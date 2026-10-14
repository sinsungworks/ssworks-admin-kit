import { definePasswordPolicy, type PasswordPolicy } from '@ssworks/admin-shared'
import { DEFAULT_LOCKOUT, type LoginLockout } from './login-policy.js'
import { resolvePermissionMap, type AdminPermissionMap } from './permission-slots.js'

// 정본: 없음 — Phase 0 §3-2 표의 `auth` · `cookies` · `permissions` 행을 실제로 갈렸던 값만 남겨 옵션으로 만들었다
//   (스펙 §4-1). 해석 · 검증을 순수 함수 하나에 모은다 — 잘못된 설정은 첫 기동에서 드러난다.

export interface AdminAuthCookieOptions {
  /** 기본 'admin_at' */
  accessName?: string
  /** 기본 'admin_rt' */
  refreshName?: string
  /** refresh 쿠키 경로. 기본 '/'. 좁히려면 브라우저가 보는 경로(전역 prefix 포함)를 적는다. logout 까지 덮어야 한다 */
  refreshPath?: string
  /** 기본 'lax' */
  sameSite?: 'lax' | 'strict'
  /** 기본 'auto' = req.secure ‖ X-Forwarded-Proto 첫 값이 https ‖ NODE_ENV === 'production' */
  secure?: 'auto' | boolean
  domain?: string
}

export interface AdminAuthOptions {
  /** HS256 비밀키. 🔴 32자 이상 — 짧으면 기동 거부. 값은 어떤 오류 메시지에도 싣지 않는다 */
  jwtSecret: string
  /** 액세스 토큰 · 쿠키 수명(ms). 기본 900 000(15분). JWT exp 는 초 단위로 올림 */
  accessTtlMs?: number
  /** refresh 세션 수명(ms). 기본 604 800 000(7일). 회전마다 새 행이 다시 받는다 */
  refreshTtlMs?: number
  /** 회전된 토큰을 다른 탭이 늦게 내도 받아 주는 창(ms). 기본 30 000, 0 이면 끈다. accessTtlMs 미만 */
  refreshGraceMs?: number
  /** 기본 5회 · 900 000ms */
  lockout?: { maxFailures?: number; lockMs?: number }
  cookies?: AdminAuthCookieOptions
  /** 🔴 기본 true. false 면 권한 선언 없는 라우트가 인증만으로 통과한다(crm · axion 이식 과도기). 기동 때 경고 한 줄 */
  failClosed?: boolean
}

export interface ResolvedAuthCookies {
  accessName: string
  refreshName: string
  refreshPath: string
  sameSite: 'lax' | 'strict'
  secure: 'auto' | boolean
  domain: string | undefined
}

export interface ResolvedAuthConfig {
  jwtSecret: string
  accessTtlMs: number
  refreshTtlMs: number
  refreshGraceMs: number
  lockout: LoginLockout
  cookies: ResolvedAuthCookies
  failClosed: boolean
  passwordPolicy: PasswordPolicy
  permissions: Readonly<AdminPermissionMap>
}

export const MIN_JWT_SECRET_LENGTH = 32

const DEFAULT_ACCESS_TTL_MS = 15 * 60 * 1000
const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_REFRESH_GRACE_MS = 30_000
/** RFC 6265 토큰의 실용 부분집합 — 공백 · `;` · `=` 를 막는다 */
const COOKIE_NAME = /^[A-Za-z0-9_.-]+$/

function positiveInt(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${name} 은 양의 정수여야 한다.`)
  }
  return resolved
}

function cookieName(name: string, value: string | undefined, fallback: string): string {
  const resolved = value ?? fallback
  if (!COOKIE_NAME.test(resolved)) {
    throw new Error(`${name} 은 영문 · 숫자 · _ . - 로만 된 쿠키 이름이어야 한다.`)
  }
  return resolved
}

/**
 * 코어 옵션의 `auth` · `passwordPolicy` · `permissions` 를 해석한다. 🔴 메시지에는 옵션 이름만 담는다 — 비밀키 값을 싣지 않는다.
 */
export function resolveAuthConfig(
  auth: AdminAuthOptions | undefined,
  passwordPolicy: PasswordPolicy | undefined,
  permissions?: AdminPermissionMap,
): ResolvedAuthConfig {
  if (auth == null) {
    throw new Error(
      'AdminAuthModule 을 쓰려면 AdminServerModule 옵션에 auth.jwtSecret 이 있어야 한다.',
    )
  }
  if (typeof auth.jwtSecret !== 'string' || auth.jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`auth.jwtSecret 은 ${MIN_JWT_SECRET_LENGTH}자 이상이어야 한다.`)
  }

  const accessTtlMs = positiveInt('auth.accessTtlMs', auth.accessTtlMs, DEFAULT_ACCESS_TTL_MS)
  const refreshTtlMs = positiveInt('auth.refreshTtlMs', auth.refreshTtlMs, DEFAULT_REFRESH_TTL_MS)
  const refreshGraceMs = auth.refreshGraceMs ?? DEFAULT_REFRESH_GRACE_MS
  // 🔴 상한은 액세스 TTL 이다 — 창이 그것에 가까워지면 정상 탭의 다음 정기 갱신까지 창 안에 들어와 재사용 탐지가 사실상
  //    꺼진다(gise refresh-policy).
  if (!Number.isInteger(refreshGraceMs) || refreshGraceMs < 0 || refreshGraceMs >= accessTtlMs) {
    throw new Error('auth.refreshGraceMs 는 0 이상 auth.accessTtlMs 미만의 정수여야 한다.')
  }

  const lockout: LoginLockout = {
    maxFailures: positiveInt(
      'auth.lockout.maxFailures',
      auth.lockout?.maxFailures,
      DEFAULT_LOCKOUT.maxFailures,
    ),
    lockMs: positiveInt('auth.lockout.lockMs', auth.lockout?.lockMs, DEFAULT_LOCKOUT.lockMs),
  }

  const cookies = auth.cookies ?? {}
  const accessName = cookieName('auth.cookies.accessName', cookies.accessName, 'admin_at')
  const refreshName = cookieName('auth.cookies.refreshName', cookies.refreshName, 'admin_rt')
  if (accessName === refreshName) {
    throw new Error('auth.cookies.accessName 과 refreshName 이 같다.')
  }
  const refreshPath = cookies.refreshPath ?? '/'
  if (!refreshPath.startsWith('/')) {
    throw new Error('auth.cookies.refreshPath 는 / 로 시작해야 한다.')
  }

  return {
    jwtSecret: auth.jwtSecret,
    accessTtlMs,
    refreshTtlMs,
    refreshGraceMs,
    lockout,
    cookies: {
      accessName,
      refreshName,
      refreshPath,
      sameSite: cookies.sameSite ?? 'lax',
      secure: cookies.secure ?? 'auto',
      domain: cookies.domain,
    },
    failClosed: auth.failClosed ?? true,
    passwordPolicy: passwordPolicy ?? definePasswordPolicy(),
    permissions: resolvePermissionMap(permissions),
  }
}
