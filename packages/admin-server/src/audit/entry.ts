import type { Request } from 'express'
import type { AdminPrincipal } from '../auth/principal.js'
import { requestMetaOf } from '../auth/request-meta.js'
import type { AuditDeclaration } from './audit.decorator.js'
import { readAuditBag } from './audit-bag.js'
import { serializeAuditMeta } from './scrub.js'

// 정본: hangang-home apps/api/src/core/audit/audit.interceptor.ts `write` · `pickTargetRefNo` + audit.service.ts
//       `record`(폭 자르기) · `extractPath`
// 바꾼 점: 행 만들기를 순수 함수로 꺼냈다 — 인터셉터와 인증 이벤트 sink 가 같은 요청 필드를 쓴다. 대상 id 는 붙인 값이
//   먼저(2c 스펙 B6), 자르기는 코드 포인트 단위(서로게이트 반쪽을 남기지 않는다).

/**
 * 🔴 0008 장의 컬럼 폭과 같다 — 넘으면 STRICT 모드에서 INSERT 가 죽어 행이 빠진다(hangang C1 · A6). 오류 코드는 쓰는 쪽이
 *    정하므로 길 수 있다. 액션 · 대상 종류는 카탈로그가 폭을 지킨다(defineAuditCatalog · 기동 검사).
 */
export const AUDIT_COLUMN_WIDTHS = Object.freeze({
  method: 8,
  path: 255,
  ip: 45,
  userAgent: 255,
  errorCode: 64,
})

const UNSIGNED_DIGITS = /^[0-9]{1,20}$/
const UNSIGNED_BIGINT_MAX = 18446744073709551615n

export interface AuditOutcome {
  status: number
  /** 실패면 응답 봉투의 code, 성공이면 null */
  errorCode: string | null
}

/** 감사 행 한 줄 — `AdminAuditLogsTable` 의 넣는 모양 */
export interface AuditInsert {
  actorUserNo: bigint | null
  sessionNo: bigint | null
  action: string
  targetType: string | null
  targetRefNo: bigint | null
  method: string
  path: string
  statusCode: number
  errorCode: string | null
  ip: string | null
  userAgent: string | null
  meta: string | null
}

export interface AuditRequestFields {
  method: string
  path: string
  ip: string | null
  userAgent: string | null
}

export function clampCodePoints(value: string, max: number): string {
  const points = [...value]
  return points.length <= max ? value : points.slice(0, max).join('')
}

/** 🔴 쿼리를 뗀다 — 검색어 · 필터가 감사 경로에 섞여 들어간다(hangang) */
function pathOf(req: Request): string {
  const raw: unknown = req.originalUrl ?? req.url
  const url = typeof raw === 'string' ? raw : ''
  const queryIndex = url.indexOf('?')
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}

export function requestFieldsOf(req: Request): AuditRequestFields {
  const meta = requestMetaOf(req)
  return {
    method: clampCodePoints(
      typeof req.method === 'string' ? req.method : '',
      AUDIT_COLUMN_WIDTHS.method,
    ),
    path: clampCodePoints(pathOf(req), AUDIT_COLUMN_WIDTHS.path),
    ip: meta.clientIp == null ? null : clampCodePoints(meta.clientIp, AUDIT_COLUMN_WIDTHS.ip),
    userAgent:
      meta.userAgent == null
        ? null
        : clampCodePoints(meta.userAgent, AUDIT_COLUMN_WIDTHS.userAgent),
  }
}

function toBigIntOrNull(value: unknown): bigint | null {
  if (typeof value !== 'string' || !UNSIGNED_DIGITS.test(value)) return null
  const parsed = BigInt(value)
  return parsed <= UNSIGNED_BIGINT_MAX ? parsed : null
}

/**
 * 대상 id(2c 스펙 B6): 붙인 값 → `paramKey` 경로 변수 → 숫자 경로 변수가 정확히 하나면 그것 → null.
 * 🔴 숫자 경로 변수가 둘 이상이면 고르지 않는다 — 조용히 엉뚱한 값을 고르는 대신 null(hangang). 그때는 attachAuditTarget.
 */
export function pickTargetRefNo(
  req: Request,
  paramKey: string | undefined,
  attached: bigint | undefined,
): bigint | null {
  if (attached !== undefined) return attached
  const params = (req.params ?? {}) as Record<string, unknown>
  if (paramKey !== undefined) {
    const named = toBigIntOrNull(params[paramKey])
    if (named !== null) return named
  }
  const numeric = Object.values(params)
    .map(toBigIntOrNull)
    .filter((value): value is bigint => value !== null)
  return numeric.length === 1 ? (numeric[0] ?? null) : null
}

export function clampErrorCode(code: string | null): string | null {
  return code == null ? null : clampCodePoints(code, AUDIT_COLUMN_WIDTHS.errorCode)
}

export function buildAuditEntry(
  req: Request,
  principal: AdminPrincipal,
  options: AuditDeclaration,
  outcome: AuditOutcome,
  secretKeys: ReadonlySet<string>,
): AuditInsert {
  const bag = readAuditBag(req)
  return {
    actorUserNo: principal.userNo,
    sessionNo: principal.sessionNo,
    action: options.action,
    targetType: options.targetType ?? null,
    targetRefNo: pickTargetRefNo(req, options.paramKey, bag?.targetRefNo),
    ...requestFieldsOf(req),
    statusCode: outcome.status,
    errorCode: clampErrorCode(outcome.errorCode),
    meta: bag ? serializeAuditMeta(bag.meta, secretKeys) : null,
  }
}
