import { z } from 'zod'
import { queryBigIntSchema } from './audit.js'

// IP 접근 제어 계약 — Phase 2 서버(@ssworks/admin-server AdminIpAccessModule)와 쓰는 쪽 IP 화면이 같은 파서 · 평가 · 모양을 본다.
//
// 정본: hangang-home apps/api/src/core/utils/request-ip.util.ts(normalizeIp · 파서 · ipInCidr — R16 · R30) +
//       apps/api/src/modules/ip-access/ip-evaluation.ts(층 · 평가) · ip-access.dto.ts(범위 불변식 · 미리보기 쿼리)
// 바꾼 점:
//  - 프레임워크 무의존 패키지로 옮겼다 — 화면의 CIDR 검증이 서버 평가와 같은 파서를 쓴다(2f-1 스펙 P1).
//  - getClientIp(헤더 순서)는 옮기지 않는다 — 클라이언트 IP 의 출처는 서버 코어 옵션 clientIp 다(2f-1 스펙 ④ C1).
//  - evaluateIpAccess 가 null 주소를 받는다 — 모르면 거부(fail-closed).
//  - 범위 불변식은 함수(ipScopeProblem)로 낸다 — 객체 스키마에 refine 을 걸면 서버가 재인증 칸을 extend 할 수 없다(zod 4).
//  - 미리보기 쿼리는 판별 합집합 대신 평평한 객체 + superRefine — 빠진 칸이 그 칸의 오류로 나온다.
//  - 정규식에 백슬래시 문자 클래스를 쓰지 않는다(저장소 규칙) — [0-9] 로 적는다.
//  - 파서 조이기(2f-2b 스펙 §5-5): ::ffff: 는 점 표기 앞에서만 떼고, 내장 IPv4 는 마지막 그룹에만, 루프백 CIDR 접기는 /128 에만,
//    v4-mapped 영역은 ::ffff:a.b.c.d 꼴만 받는다.
// 🔴 CIDR 을 읽는 곳은 parseCidr 하나다(hangang R30). 검증과 평가가 다른 파서를 쓰면 "저장은 됐는데 아무도 안 통과하는" 규칙이
//    생긴다 — ipInCidr 은 잘못된 문자열에 예외 대신 false 를 낸다.
// 🔴 기본 거부 · 가장 가까운 층 하나(user → team → global). 앞 층에 규칙이 하나라도 있으면 뒤는 보지 않는다 — user 규칙 한 줄이
//    global 허용을 통째로 지운다. 그래서 서버가 자기 잠금 · 잔존을 검사한다.

export type IpScopeType = 'global' | 'team' | 'user'

export const IP_SCOPE_TYPES = ['global', 'team', 'user'] as const satisfies readonly IpScopeType[]

export interface IpRule {
  scopeType: IpScopeType
  /** global 이면 null. team · user 의 번호(다형 참조) */
  scopeRefNo: bigint | null
  cidr: string
}

export interface IpSubject {
  userNo: bigint
  /** 🔴 대표 팀 하나(가장 작은 teamNo) 또는 빈 배열 — 서버 인증과 같은 팀을 넘긴다 */
  teamNos: readonly bigint[]
}

export interface IpScope {
  scopeType: IpScopeType
  scopeRefNo: bigint | null
}

export interface ParsedCidr {
  /** 정규화된 네트워크 주소 — 길이 4(IPv4) 또는 16(IPv6) */
  net: Uint8Array
  /** net 의 계열 기준 프리픽스(v4-mapped 표기는 96 을 뺀 값, `::1/128` 은 `127.0.0.1/32` 로 접혀 32) */
  prefix: number
}

const IPV4_OCTET = /^(0|[1-9][0-9]{0,2})$/
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/
const PREFIX_DIGITS = /^[0-9]{1,3}$/
/** 점 표기 IPv4 를 담은 v4-mapped 머리. 🔴 점 표기 앞에서만 뗀다 — `::ffff:1::` 을 `1::` 로 바꾸지 않는다 */
const V4_MAPPED_DOTTED = /^::ffff:(?=[0-9]+[.])/i

/** `::ffff:a.b.c.d` → `a.b.c.d`, IPv6 루프백 → `127.0.0.1`. 🔴 서버의 세션 · 감사 · 정책이 이 값을 같이 쓴다 */
export function normalizeIp(ip: string): string {
  const unmapped = ip.replace(V4_MAPPED_DOTTED, '')
  if (unmapped === '::1' || unmapped === '0:0:0:0:0:0:0:1') return '127.0.0.1'
  return unmapped
}

function parseIpv4(ip: string): Uint8Array | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const out = new Uint8Array(4)
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i] ?? ''
    // 🔴 선행 0 을 거부한다 — '010' 을 8진수로 읽는 구현이 있어 판정이 갈린다(hangang)
    if (!IPV4_OCTET.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    out[i] = value
  }
  return out
}

/** 마지막 그룹이 IPv4 표기(`::ffff:1.2.3.4`)면 16비트 그룹 둘로 편다 */
function expandEmbeddedIpv4(groups: string[]): string[] | null {
  const last = groups[groups.length - 1]
  if (last === undefined || !last.includes('.')) return groups
  const v4 = parseIpv4(last)
  if (v4 === null) return null
  const [a = 0, b = 0, c = 0, d = 0] = v4
  return [...groups.slice(0, -1), ((a << 8) | b).toString(16), ((c << 8) | d).toString(16)]
}

function parseIpv6(ip: string): Uint8Array | null {
  let text = ip
  const zone = text.indexOf('%')
  if (zone >= 0) text = text.slice(0, zone)
  const gap = text.indexOf('::')
  if (gap !== text.lastIndexOf('::')) return null
  const split = (part: string): string[] => (part === '' ? [] : part.split(':'))
  // 🔴 내장 IPv4 는 주소 전체의 마지막 그룹에만 — `::` 앞쪽(`1.2.3.4::`)의 점 표기는 아래 16진 그룹 검사에서 떨어진다
  const head = gap >= 0 ? split(text.slice(0, gap)) : expandEmbeddedIpv4(split(text))
  const tail = gap >= 0 ? expandEmbeddedIpv4(split(text.slice(gap + 2))) : []
  if (head === null || tail === null) return null
  const total = head.length + tail.length
  if (gap >= 0 ? total > 8 : total !== 8) return null
  const groups =
    gap >= 0 ? [...head, ...Array.from({ length: 8 - total }, () => '0'), ...tail] : head
  const out = new Uint8Array(16)
  for (let i = 0; i < 8; i += 1) {
    const group = groups[i] ?? ''
    if (!IPV6_GROUP.test(group)) return null
    const value = parseInt(group, 16)
    out[i * 2] = value >> 8
    out[i * 2 + 1] = value & 0xff
  }
  // 🔴 v4-mapped 영역(::ffff:0:0/96)은 `::ffff:a.b.c.d` 꼴만 받는다 — 그 꼴은 normalizeIp · parseCidr 가 먼저 v4 로 접으므로
  //    여기 온 것은 16진 · 풀어 쓴 표기다. 받으면 저장은 되고 아무도 통과하지 못한다(hangang R16).
  if (isV4MappedBytes(out)) return null
  return out
}

/** 앞 80비트가 0 이고 다음 16비트가 ffff — `::ffff:0:0/96` 안의 주소 */
function isV4MappedBytes(bytes: Uint8Array): boolean {
  for (let i = 0; i < 10; i += 1) if (bytes[i] !== 0) return false
  return bytes[10] === 0xff && bytes[11] === 0xff
}

function parseIp(ip: string): Uint8Array | null {
  return ip.includes(':') ? parseIpv6(ip) : parseIpv4(ip)
}

/** 주소 하나로 읽히는가(정규화 뒤). 쉼표로 이어 붙은 값 · 빈 값 · 이름은 거짓 */
export function isValidIp(ip: string): boolean {
  return parseIp(normalizeIp(ip)) !== null
}

function prefixMatches(a: Uint8Array, b: Uint8Array, prefix: number): boolean {
  const fullBytes = prefix >> 3
  const restBits = prefix & 7
  for (let i = 0; i < fullBytes; i += 1) if (a[i] !== b[i]) return false
  if (restBits === 0) return true
  const mask = (0xff << (8 - restBits)) & 0xff
  return ((a[fullBytes] ?? 0) & mask) === ((b[fullBytes] ?? 0) & mask)
}

/**
 * CIDR 하나를 읽는다. 형식이 아니면 null.
 * 🔴 접히는 경우는 둘뿐이다(2f-2b 스펙 §5-5) — 점 표기 v4-mapped(`::ffff:203.0.113.0/120` — 마지막 32비트가 v4 라
 *    프리픽스에서 96 을 빼고, 96 미만이면 v4 로 표현할 수 없어 거부한다 · hangang R16)와 `/128` 루프백(한 주소라
 *    `127.0.0.1/32`). 루프백의 다른 프리픽스는 비트 그대로 IPv6 망이다 — `::1/120` 을 127.0.0.0/24 로 읽지 않는다.
 */
export function parseCidr(cidr: string): ParsedCidr | null {
  const slash = cidr.lastIndexOf('/')
  if (slash < 0) return null
  const prefixText = cidr.slice(slash + 1)
  if (!PREFIX_DIGITS.test(prefixText)) return null
  const rawNet = cidr.slice(0, slash)
  const prefix = Number(prefixText)
  if (V4_MAPPED_DOTTED.test(rawNet)) {
    if (prefix < 96) return null
    return withinFamily(parseIpv4(rawNet.replace(V4_MAPPED_DOTTED, '')), prefix - 96)
  }
  // 여기서 normalizeIp 가 바꾸는 것은 루프백 표기뿐이다(v4-mapped 는 위에서 끝났다)
  const loopback = normalizeIp(rawNet) !== rawNet
  if (loopback && prefix === 128) return withinFamily(parseIpv4('127.0.0.1'), 32)
  return withinFamily(parseIp(rawNet), prefix)
}

function withinFamily(net: Uint8Array | null, prefix: number): ParsedCidr | null {
  if (net === null || prefix > net.length * 8) return null
  return { net, prefix }
}

/** 저장해도 되는 CIDR 인가 — 🔴 ipInCidr 과 같은 파서다 */
export function isValidCidr(cidr: string): boolean {
  return parseCidr(cidr) !== null
}

/** 주소가 CIDR 에 드는가. 🔴 계열이 다르면 늘 false — `::/0` 이 IPv4 를 통과시키지 않는다 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr)
  if (parsed === null) return false
  const address = parseIp(normalizeIp(ip))
  if (address === null || parsed.net.length !== address.length) return false
  return prefixMatches(address, parsed.net, parsed.prefix)
}

/** 🔴 가까운 순서. 앞 층에 규칙이 하나라도 있으면 뒤는 보지 않는다 */
const LAYERS: readonly IpScopeType[] = ['user', 'team', 'global']

/** 이 사람에게 걸리는 그 층의 규칙 */
export function ipLayerRules(
  layer: IpScopeType,
  rules: readonly IpRule[],
  subject: IpSubject,
): IpRule[] {
  switch (layer) {
    case 'user':
      return rules.filter((rule) => rule.scopeType === 'user' && rule.scopeRefNo === subject.userNo)
    case 'team':
      return rules.filter(
        (rule) =>
          rule.scopeType === 'team' &&
          rule.scopeRefNo !== null &&
          subject.teamNos.includes(rule.scopeRefNo),
      )
    case 'global':
      return rules.filter((rule) => rule.scopeType === 'global')
  }
}

/**
 * 이 사람에게 실제로 적용되는 층 하나. 걸리는 규칙이 없으면 null(= 기본 거부).
 * 🔴 판정을 두 번 적지 않는다 — 서버의 정책 · 잔존 셈 · 미리보기 · 자기 잠금이 이 함수를 쓴다(hangang A1).
 */
export function applicableIpLayer(
  rules: readonly IpRule[],
  subject: IpSubject,
): IpScopeType | null {
  for (const layer of LAYERS) {
    if (ipLayerRules(layer, rules, subject).length > 0) return layer
  }
  return null
}

/** 이 주소로 이 사람이 들어올 수 있는가. 🔴 주소가 null 이거나 층이 없으면 false */
export function evaluateIpAccess(
  ip: string | null,
  rules: readonly IpRule[],
  subject: IpSubject,
): boolean {
  if (ip === null) return false
  const layer = applicableIpLayer(rules, subject)
  if (layer === null) return false
  return ipLayerRules(layer, rules, subject).some((rule) => ipInCidr(ip, rule.cidr))
}

export const IP_ACCESS_SCHEMA_MESSAGES = Object.freeze({
  cidr: 'IPv4 · IPv6 CIDR 형식이 아닙니다. 예: 203.0.113.0/24, 2001:db8::/32',
  scopeRefRequired: '팀 · 사용자 규칙은 대상을 골라야 합니다.',
  scopeRefForbidden: '전체 규칙에는 대상을 두지 않습니다.',
  previewField: '이 미리보기에는 이 칸이 필요합니다.',
})

/**
 * 범위 불변식 — global 이면 대상이 없고, team · user 면 있다. 어기면 문구, 아니면 null.
 * 🔴 서버의 만들기 파이프와 수정의 **병합 결과**가 같은 함수로 본다(hangang R30 — PATCH 가 scopeType 만 바꿔 죽은 행을 만든다).
 */
export function ipScopeProblem(scope: IpScope): string | null {
  if (scope.scopeType === 'global') {
    return scope.scopeRefNo === null ? null : IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden
  }
  return scope.scopeRefNo === null ? IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired : null
}

export function isValidIpScope(scope: IpScope): boolean {
  return ipScopeProblem(scope) === null
}

/** IPv6 CIDR 최대 43자 — 장 0012 의 cidr 열 폭 */
export const IP_CIDR_MAX_LENGTH = 43
export const IP_RULE_DESCRIPTION_MAX_LENGTH = 200

export const ipScopeTypeSchema = z.enum(IP_SCOPE_TYPES)

/** 🔴 앞뒤 공백을 뗀 뒤 같은 파서로 본다(Review Focus 3) — 형식 오류는 한 문구 */
export const ipCidrSchema = z
  .string()
  .trim()
  .max(IP_CIDR_MAX_LENGTH)
  .refine(isValidCidr, { message: IP_ACCESS_SCHEMA_MESSAGES.cidr })

/** 이 규칙이 왜 있는가. 빈 문자열은 null 로 */
const descriptionSchema = z
  .string()
  .trim()
  .max(IP_RULE_DESCRIPTION_MAX_LENGTH)
  .nullable()
  .transform((value) => (value === '' ? null : value))

/** 🔴 Phase 0 §4 "쓰기 보호는 revision 기본". 수정 · 삭제 성공마다 서버가 올린다 */
const revisionSchema = z.number().int().min(0)

export const adminIpRuleSchema = z.object({
  ruleNo: z.bigint(),
  scopeType: ipScopeTypeSchema,
  scopeRefNo: z.bigint().nullable(),
  /** 팀 이름 · 사용자 이름. global 이거나 대상이 지워졌으면 null */
  scopeName: z.string().nullable(),
  /** 사용자 규칙의 로그인 아이디. 그 밖은 null */
  scopeUserId: z.string().nullable(),
  cidr: z.string(),
  description: z.string().nullable(),
  revision: revisionSchema,
  createAt: z.iso.datetime(),
  updateAt: z.iso.datetime(),
})

export const adminIpRuleListSchema = z.object({ items: z.array(adminIpRuleSchema) })

/** 만들기 201 · 수정 200 의 응답 */
export const adminIpRuleItemSchema = z.object({ item: adminIpRuleSchema })

/** 🔴 refine 을 걸지 않는다 — 범위 불변식은 ipScopeProblem 이 본다(서버 파이프가 재인증 칸을 extend 한 뒤 건다) */
export const adminIpRuleCreateSchema = z.object({
  scopeType: ipScopeTypeSchema,
  scopeRefNo: z.bigint().nullable(),
  cidr: ipCidrSchema,
  description: descriptionSchema.optional(),
})

/** 부분 갱신. 🔴 revision 만 필수다. scopeRefNo: null 은 "대상 없음", 생략은 "그대로" — 병합 결과는 서버가 본다 */
export const adminIpRuleUpdateSchema = z.object({
  scopeType: ipScopeTypeSchema.optional(),
  scopeRefNo: z.bigint().nullable().optional(),
  cidr: ipCidrSchema.optional(),
  description: descriptionSchema.optional(),
  revision: revisionSchema,
})

export const adminIpRuleRemoveSchema = z.object({ revision: revisionSchema })

export const IP_PREVIEW_OPS = ['create', 'update', 'delete'] as const

/**
 * 미리보기 쿼리(`GET /admin/ip-access/preview`). op 가 없으면 지금 상태다. create · update 는 바뀔 규칙 전체
 * (scopeType · scopeRefNo · cidr), update · delete 는 대상 ruleNo 를 받는다.
 */
export const adminIpPreviewQuerySchema = z
  .object({
    op: z.enum(IP_PREVIEW_OPS).optional(),
    ruleNo: queryBigIntSchema.optional(),
    scopeType: ipScopeTypeSchema.optional(),
    scopeRefNo: queryBigIntSchema.optional(),
    cidr: ipCidrSchema.optional(),
  })
  .superRefine((query, ctx) => {
    const need = (key: 'ruleNo' | 'scopeType' | 'cidr', present: boolean): void => {
      if (!present) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: IP_ACCESS_SCHEMA_MESSAGES.previewField,
        })
      }
    }
    if (query.op === 'update' || query.op === 'delete') need('ruleNo', query.ruleNo !== undefined)
    if (query.op === 'create' || query.op === 'update') {
      need('scopeType', query.scopeType !== undefined)
      need('cidr', query.cidr !== undefined)
      if (query.scopeType !== undefined) {
        const problem = ipScopeProblem({
          scopeType: query.scopeType,
          scopeRefNo: query.scopeRefNo ?? null,
        })
        if (problem !== null)
          ctx.addIssue({ code: 'custom', path: ['scopeRefNo'], message: problem })
      }
    }
  })

/** locked = 이 규칙으로는 못 들어온다 · passes = 활성 세션 주소 하나라도 통과 · unknown = 층은 있는데 주소를 아는 세션이 0 */
export const ipLockoutStatusSchema = z.enum(['locked', 'passes', 'unknown'])

const countSchema = z.number().int().min(0)

export const adminIpPreviewItemSchema = z.object({
  userNo: z.bigint(),
  userId: z.string(),
  userName: z.string(),
  layerBefore: ipScopeTypeSchema.nullable(),
  layerAfter: ipScopeTypeSchema.nullable(),
  statusBefore: ipLockoutStatusSchema,
  statusAfter: ipLockoutStatusSchema,
  /** 🔴 변경 전에 안 잠겨 있던 사람만 참 */
  becomesLocked: z.boolean(),
  /** 이 사람에게 적용되는 층 · CIDR 집합이 달라지는가(상태가 그대로여도 참일 수 있다) */
  ruleSetChanged: z.boolean(),
  activeSessionCount: countSchema,
  blockedSessionCount: countSchema,
  unknownIpSessionCount: countSchema,
})

export const adminIpPreviewSchema = z.object({
  /** 요청자의 지금 주소(서버 clientIp 출처) */
  clientIp: z.string().nullable(),
  /** 🔴 저장 때 자기 잠금이 쓰는 바로 그 판정 — false 면 저장이 409 다 */
  clientPasses: z.boolean(),
  summary: z.object({
    total: countSchema,
    newlyLocked: countSchema,
    alreadyLocked: countSchema,
    unknown: countSchema,
    /** 🔴 items 전원의 blockedSessionCount 합 — "이 변경이 끊는 기기 수" 가 아니라 거부되는 활성 세션 수 */
    blockedSessions: countSchema,
    ruleSetChangedOnly: countSchema,
  }),
  items: z.array(adminIpPreviewItemSchema),
})

export type IpLockoutStatus = z.infer<typeof ipLockoutStatusSchema>
export type AdminIpRule = z.infer<typeof adminIpRuleSchema>
export type AdminIpRuleList = z.infer<typeof adminIpRuleListSchema>
export type AdminIpRuleItem = z.infer<typeof adminIpRuleItemSchema>
export type AdminIpRuleCreate = z.infer<typeof adminIpRuleCreateSchema>
export type AdminIpRuleUpdate = z.infer<typeof adminIpRuleUpdateSchema>
export type AdminIpRuleRemove = z.infer<typeof adminIpRuleRemoveSchema>
export type AdminIpPreviewQuery = z.infer<typeof adminIpPreviewQuerySchema>
export type AdminIpPreviewItem = z.infer<typeof adminIpPreviewItemSchema>
export type AdminIpPreview = z.infer<typeof adminIpPreviewSchema>
