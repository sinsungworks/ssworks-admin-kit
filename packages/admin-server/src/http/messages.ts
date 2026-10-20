import { IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AUDIT_MESSAGES } from '../audit/errors.js'
import { AUTH_MESSAGES } from '../auth/errors.js'
import { IP_ACCESS_MESSAGES } from '../ip-access/errors.js'
import { LEGAL_MESSAGES } from '../legal/errors.js'
import { SESSION_MESSAGES } from '../sessions/errors.js'
import { TEAM_MESSAGES } from '../teams/errors.js'
import type { ErrorBody } from './error-response.js'

// 정본: 없음 — 2g 스펙 M1–M10(ringside 보고 §2). 서버 오류 문구를 쓰는 쪽 용어로 덮는다. 문구를 쓰는 곳(26곳 · 순수 판정
//   함수)은 고치지 않고, 기동 때 "기본 글자 → 덮을 글자" 표를 만들어 예외 필터 한 곳이 4xx 본문에 적용한다.
// 🔴 "용어 하나 바꾸기" 를 만들지 않는다 — 한국어 조사(을/를 · 은/는)가 단어의 받침에 따라 바뀐다(스펙 §2-1).

/**
 * 묶음 → 서버 문구 표(얼림 — 각 값은 서버가 쓰는 그 표 객체). 키를 보고 테스트에서 비교한다.
 * 🔴 새 문구 표(`export const *_MESSAGES`)를 만들면 여기에 더한다 — `messages.test.ts` 의 정적 검사가 잡는다(M10).
 *    `GUARD_MESSAGES` 는 5xx 라 고정 문구로 가려져 넣지 않는다.
 */
export const ADMIN_SERVER_DEFAULT_MESSAGES = Object.freeze({
  auth: AUTH_MESSAGES,
  accounts: ACCOUNT_MESSAGES,
  sessions: SESSION_MESSAGES,
  audit: AUDIT_MESSAGES,
  teams: TEAM_MESSAGES,
  legal: LEGAL_MESSAGES,
  ipAccess: IP_ACCESS_MESSAGES,
  /** admin-shared 스키마 문구 — 서버 검증 400 의 칸 오류로 나간다 */
  ipAccessSchema: IP_ACCESS_SCHEMA_MESSAGES,
})

type DefaultMessages = typeof ADMIN_SERVER_DEFAULT_MESSAGES

/** `AdminServerModule` 옵션 `messages` — 묶음별로 바꿀 키만 */
export type AdminServerMessages = {
  readonly [G in keyof DefaultMessages]?: Partial<Record<keyof DefaultMessages[G], string>>
}

/**
 * 쓰는 쪽 덮기를 "기본 글자 → 덮을 글자" 표로 편다(2g M3).
 * 🔴 기동에서 멈춘다(문제를 모아 한 번에): 모르는 묶음 · 키(오타), 문자열이 아니거나 trim 해서 빈 값, 같은 기본 글자를 서로 다르게
 *    덮음(M4 — `accounts.noUser` 와 `sessions.noUser` 는 같은 글자다. 같은 값이면 된다). 기본값과 같은 덮기는 표에 넣지 않는다
 *    — 그래도 그 자리의 주장으로 보고 충돌을 잰다(같은 글자의 다른 자리를 다르게 덮으면 멈춘다).
 */
export function resolveAdminMessages(
  messages: AdminServerMessages | undefined,
): ReadonlyMap<string, string> {
  const tables = ADMIN_SERVER_DEFAULT_MESSAGES as unknown as Readonly<
    Record<string, Readonly<Record<string, string>>>
  >
  const claims = new Map<string, { value: string; place: string }>()
  const problems: string[] = []
  for (const [group, entries] of Object.entries(messages ?? {})) {
    const table = Object.hasOwn(tables, group) ? tables[group] : undefined
    if (table === undefined) {
      problems.push(`모르는 묶음: ${group}`)
      continue
    }
    if (entries === undefined) continue
    if (typeof entries !== 'object' || entries === null) {
      problems.push(`묶음 값이 객체가 아니다: ${group}`)
      continue
    }
    for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
      const place = `${group}.${key}`
      if (!Object.hasOwn(table, key)) {
        problems.push(`모르는 키: ${place}`)
        continue
      }
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`빈 문구: ${place}`)
        continue
      }
      const base = table[key] as string
      // 기본값과 같은 값도 "이 자리는 기본 그대로" 라는 주장이다 — 충돌을 재고, 표에는 마지막에 다른 것만 옮긴다.
      const earlier = claims.get(base)
      if (earlier !== undefined && earlier.value !== value) {
        problems.push(`같은 기본 문구를 다르게 덮는다: ${earlier.place} · ${place} — 「${base}」`)
        continue
      }
      if (earlier === undefined) claims.set(base, { value, place })
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `AdminServerModule 옵션 messages 를 해석할 수 없다 — ${problems.join(' / ')}. 키는 ADMIN_SERVER_DEFAULT_MESSAGES 에 있다.`,
    )
  }
  const overrides = new Map<string, string>()
  for (const [base, claim] of claims) {
    if (claim.value !== base) overrides.set(base, claim.value)
  }
  return overrides
}

/**
 * 4xx 본문의 `message` 와 `details.issues[].message` 를 표로 바꾼다(2g M6). 바꿀 것이 없으면 같은 객체를 돌려준다.
 * 🔴 새 객체로 만든다 — 예외의 `details` 를 고치지 않는다. `issues` 밖의 `details` 는 건드리지 않는다. 5xx 는 부르는 쪽(필터)이 거른다.
 */
export function applyMessageOverrides(
  body: ErrorBody,
  overrides: ReadonlyMap<string, string>,
): ErrorBody {
  const message = overrides.get(body.message) ?? body.message
  const details = overrideIssues(body.details, overrides)
  if (message === body.message && details === body.details) return body
  return { ...body, message, ...(details === undefined ? {} : { details }) }
}

function overrideIssues(details: unknown, overrides: ReadonlyMap<string, string>): unknown {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return details
  const issues = (details as { issues?: unknown }).issues
  if (!Array.isArray(issues)) return details
  let changed = false
  const next = issues.map((issue: unknown) => {
    if (typeof issue !== 'object' || issue === null) return issue
    const text = (issue as { message?: unknown }).message
    if (typeof text !== 'string') return issue
    const replaced = overrides.get(text)
    if (replaced === undefined) return issue
    changed = true
    return { ...(issue as Record<string, unknown>), message: replaced }
  })
  return changed ? { ...(details as Record<string, unknown>), issues: next } : details
}
