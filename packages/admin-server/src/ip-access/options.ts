import { isIpExtraScopeTypeName } from '@ssworks/admin-shared'
import type { Kysely, Transaction } from 'kysely'
import { resolveClientIpSource, type AdminClientIpSource } from '../auth/request-meta.js'
import type { AdminDatabase } from '../database/types.js'
import type { AdminServerOptions } from '../options.js'

// 정본: 없음 — 2f-1 스펙 2-2 #2 · #3(코어 옵션 reauth · clientIp) + 확장 범위 스펙 §4-1(ipAccess.extraScopes — IP 모듈의 첫 옵션).
// 🔴 확장 범위에는 권한 키가 없다(확장 범위 스펙 ① — R7 없음). 코어 슬롯 ipAccess.read · ipAccess.manage 가 모든 규칙을 다룬다.

/**
 * 확장 범위의 대상(쓰는 쪽 개체 — 출고 토큰 등)을 킷이 확인 · 표시하는 훅(확장 범위 스펙 X5).
 * 🔴 메서드 꼴로 선언한다 — 매개변수 이변성 덕에 쓰는 쪽이 `Transaction<Database>`(Database extends AdminDatabase)로 적어도
 *    옵션에 들어간다. 속성 꼴(`lock: (trx) => …`)로 바꾸면 strictFunctionTypes 가 막는다(options.types.test.ts).
 */
export interface AdminIpScopeTarget<DB extends AdminDatabase = AdminDatabase> {
  /** 🔴 쓰기 트랜잭션 안 — 대상 행을 FOR UPDATE 로 잠그고, 있으면 true. 없으면 400 issues[scopeRefNo] */
  lock(trx: Transaction<DB>, refNo: bigint): Promise<boolean>
  /** 목록 · 응답의 대상 이름. 없는 번호는 빼고 돌려준다(→ scopeName null). 빈 배열로는 부르지 않는다 */
  names(db: Kysely<DB>, refNos: readonly bigint[]): Promise<ReadonlyMap<bigint, string>>
}

export interface AdminIpExtraScope<DB extends AdminDatabase = AdminDatabase> {
  /** scope_type 값 — 영소문자로 시작하는 영숫자 1~16자, 코어 이름(global · team · user)과 대소문자 무시로 다름 */
  type: string
  /** 기본 true — scopeRefNo NULL(범위 전체) 규칙을 받고 판정에 쓴다(확장 범위 스펙 X7) */
  wholeScope?: boolean
  target: AdminIpScopeTarget<DB>
}

export interface AdminIpAccessOptions {
  /** 관리자 밖 주체에 거는 IP 규칙 범위. 없거나 비면 지금과 같다 */
  extraScopes?: readonly AdminIpExtraScope[]
}

export interface ResolvedIpExtraScope {
  readonly type: string
  readonly wholeScope: boolean
  readonly target: AdminIpScopeTarget
}

export interface ResolvedIpAccessConfig {
  /** 켜면 IP 쓰기가 본문 currentPassword 로 재인증한다 — 역할 · 사용자와 같은 스위치(코어 reauth) */
  readonly reauth: boolean
  /** 자기 잠금 · 미리보기 · 쓰는 쪽 판정이 보는 요청자 주소의 출처 — 인증과 같은 해석 */
  readonly clientIp: AdminClientIpSource
  /** 등록된 확장 범위 — 이름 → 설정(옵션 순서). 비었으면 지금과 같다 */
  readonly extraScopes: ReadonlyMap<string, ResolvedIpExtraScope>
}

const OPTION_KEYS: readonly string[] = ['extraScopes']
const SCOPE_KEYS: readonly string[] = ['type', 'wholeScope', 'target']

/** 🔴 기동에서 멈춘다: reauth 가 boolean 이 아님, clientIp 가 두 값 밖, ipAccess 형식 밖(문제를 모아 한 번에) */
export function resolveIpAccessConfig(
  options: Pick<AdminServerOptions, 'reauth' | 'clientIp' | 'ipAccess'>,
): ResolvedIpAccessConfig {
  if (options.reauth !== undefined && typeof options.reauth !== 'boolean') {
    throw new Error('reauth 는 true · false 여야 한다.')
  }
  return Object.freeze({
    reauth: options.reauth === true,
    clientIp: resolveClientIpSource(options.clientIp),
    extraScopes: resolveExtraScopes(options.ipAccess),
  })
}

function resolveExtraScopes(raw: unknown): ReadonlyMap<string, ResolvedIpExtraScope> {
  const scopes = new Map<string, ResolvedIpExtraScope>()
  if (raw === undefined) return scopes
  const problems: string[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    problems.push('ipAccess 는 { extraScopes } 객체여야 한다')
  } else {
    for (const key of Object.keys(raw)) {
      if (!OPTION_KEYS.includes(key)) problems.push(`ipAccess 에 모르는 키: ${key}`)
    }
    const list = (raw as { extraScopes?: unknown }).extraScopes
    if (list !== undefined && !Array.isArray(list)) {
      problems.push('ipAccess.extraScopes 는 배열이어야 한다')
    } else if (Array.isArray(list)) {
      // 🔴 대소문자 무시로 겹침을 본다 — ascii_bin 이라 DB 에서는 다른 값이지만 사람에게는 같은 이름이다
      const seen = new Set<string>()
      list.forEach((item: unknown, index) => {
        const scope = resolveExtraScope(item, `ipAccess.extraScopes[${index}]`, problems)
        if (scope === null) return
        const key = scope.type.toLowerCase()
        if (seen.has(key)) {
          problems.push(`ipAccess.extraScopes 의 이름이 겹친다: ${scope.type}`)
          return
        }
        seen.add(key)
        scopes.set(scope.type, scope)
      })
    }
  }
  if (problems.length > 0) {
    throw new Error(`AdminIpAccessModule 의 ipAccess 옵션이 맞지 않다 — ${problems.join(' / ')}`)
  }
  return scopes
}

function resolveExtraScope(
  raw: unknown,
  place: string,
  problems: string[],
): ResolvedIpExtraScope | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    problems.push(`${place} 는 { type, target } 객체여야 한다`)
    return null
  }
  const before = problems.length
  for (const key of Object.keys(raw)) {
    if (key === 'permissions') {
      problems.push(
        `${place}.permissions — 확장 범위에는 권한 키를 두지 않는다(코어 슬롯 ipAccess.read · ipAccess.manage 가 다룬다)`,
      )
    } else if (!SCOPE_KEYS.includes(key)) {
      problems.push(`${place} 에 모르는 키: ${key}`)
    }
  }
  const { type, wholeScope, target } = raw as {
    type?: unknown
    wholeScope?: unknown
    target?: unknown
  }
  if (typeof type !== 'string' || !isIpExtraScopeTypeName(type)) {
    problems.push(
      `${place}.type 은 영소문자로 시작하는 영숫자 1~16자이고 global · team · user 와 달라야 한다: ${JSON.stringify(type)}`,
    )
  }
  if (wholeScope !== undefined && typeof wholeScope !== 'boolean') {
    problems.push(`${place}.wholeScope 는 true · false 여야 한다`)
  }
  if (!isTarget(target)) {
    problems.push(`${place}.target 은 lock · names 함수를 가진 객체여야 한다`)
  }
  if (problems.length > before) return null
  return Object.freeze({
    type: type as string,
    wholeScope: wholeScope !== false,
    target: target as AdminIpScopeTarget,
  })
}

function isTarget(value: unknown): value is AdminIpScopeTarget {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.lock === 'function' && typeof candidate.names === 'function'
}
