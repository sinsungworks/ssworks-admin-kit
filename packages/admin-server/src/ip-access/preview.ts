import {
  applicableIpLayer,
  evaluateIpAccess,
  ipLayerRules,
  type AdminIpPreview,
  type AdminIpPreviewItem,
  type AdminIpPreviewQuery,
  type IpLockoutStatus,
  type IpRule,
  type IpScopeType,
  type IpSubject,
} from '@ssworks/admin-shared'
import { ruleNotFound } from './errors.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-evaluation.ts(judgeIpLockout · appliedRuleFingerprint · lockoutGrade ·
//       previewIpLockout · buildLockoutCandidates) + ip-access.service.ts nextRulesOf
// 바꾼 점:
//  - 층 · 평가는 admin-shared 함수다 — 로그인이 쓰는 바로 그 판정이다(hangang R30).
//  - nextRulesOf 는 평평한 쿼리(op · ruleNo · scopeType · scopeRefNo · cidr — admin-shared 스키마)를 받는다.
//  - 응답의 clientIp · clientPasses(hangang actorIp · actorPasses)는 서비스가 붙인다.
// 🔴 여기는 읽기다 — 아무것도 막지 않는다. 막는 것은 서버의 자기 잠금 · 잔존이고, 이 판정이 틀려도 조용하다 — 계약 테스트가
//    유일한 방어선이다(hangang). 판정을 다시 적지 않는다.

export interface IdentifiedIpRule extends IpRule {
  ruleNo: bigint
}

export interface IpLockoutCandidate {
  userNo: bigint
  userId: string
  userName: string
  /** 🔴 로그인 판정과 같은 대표 팀 하나(가장 작은 teamNo) 또는 빈 배열 — 전부 실으면 로그인과 다른 층을 고른다 */
  teamNos: readonly bigint[]
  /** 활성 세션의 접속 주소. null 은 주소가 남지 않은 세션 */
  sessionIps: readonly (string | null)[]
}

export interface IpLockoutJudgement {
  layer: IpScopeType | null
  status: IpLockoutStatus
  /** 이 규칙이 거부한다고 증명되는 활성 세션 수 */
  blockedSessionCount: number
  /** 주소가 없어 판정할 수 없는 활성 세션 수 */
  unknownIpSessionCount: number
}

export type IpLockoutPreview = Pick<AdminIpPreview, 'summary' | 'items'>

export function stripRuleNo(rule: IdentifiedIpRule): IpRule {
  return { scopeType: rule.scopeType, scopeRefNo: rule.scopeRefNo, cidr: rule.cidr }
}

/**
 * 한 사람이 이 규칙 아래 어떻게 되는가.
 * 🔴 층이 없으면 세션을 보기도 전에 locked — 기본 거부라 어떤 주소로도 못 들어온다. 이것을 unknown 으로 내면 가장 위험한
 *    변경(global 허용 삭제)을 미리보기가 삼킨다. 그때는 주소를 모르는 세션도 거부가 확정이다.
 */
export function judgeIpLockout(
  rules: readonly IpRule[],
  subject: IpSubject,
  sessionIps: readonly (string | null)[],
): IpLockoutJudgement {
  const layer = applicableIpLayer(rules, subject)
  const unknownIpSessionCount = sessionIps.filter((ip) => ip === null).length
  if (layer === null) {
    return {
      layer,
      status: 'locked',
      blockedSessionCount: sessionIps.length,
      unknownIpSessionCount,
    }
  }
  const known = sessionIps.filter((ip): ip is string => ip !== null)
  const passing = known.filter((ip) => evaluateIpAccess(ip, rules, subject)).length
  return {
    layer,
    // 주소를 아는 세션이 0 이면 잠겼다고 단정하지 않는다 — 그 사람이 어디서 접속할지 모른다. 층은 살아 있다
    status: known.length === 0 ? 'unknown' : passing > 0 ? 'passes' : 'locked',
    blockedSessionCount: known.length - passing,
    unknownIpSessionCount,
  }
}

/**
 * 🔴 이 사람에게 적용되는 규칙 집합의 지문 — 층 이름 + 그 층의 CIDR 집합(중복 · 순서 무관). 층 이름을 빼면
 *    `global 10/8` → `user 10/8` 이 같아진다. 층이 없으면 '(none)'. 구분자는 층 이름에도 CIDR 에도 없는 공백이다.
 */
function appliedRuleFingerprint(rules: readonly IpRule[], subject: IpSubject): string {
  const layer = applicableIpLayer(rules, subject)
  if (layer === null) return '(none)'
  const cidrs = [...new Set(ipLayerRules(layer, rules, subject).map((rule) => rule.cidr))].sort()
  return [layer, ...cidrs].join(' ')
}

/**
 * 🔴 정렬 등급 — 관리자는 목록 맨 위만 보고 저장한다. 0 이 가장 위험하다. ruleSetChanged + unknown(1)이 alreadyLocked(2)
 *    보다 위다 — 이 변경으로 허용 주소가 달라졌는데 결과를 못 보는 사람이 가장 위험한 침묵이다(hangang).
 */
function lockoutGrade(item: AdminIpPreviewItem): number {
  if (item.becomesLocked) return 0
  if (item.ruleSetChanged && item.statusAfter === 'unknown') return 1
  if (item.statusBefore === 'locked' && item.statusAfter === 'locked') return 2
  if (item.statusAfter === 'unknown') return 3
  return 4
}

/** 재직 관리자 전원에 대해 변경 전후를 대조한다. 🔴 전권자만이 아니다 — 일반 관리자가 잠기는 것을 막는 서버 가드는 없다 */
export function previewIpLockout(
  candidates: readonly IpLockoutCandidate[],
  currentRules: readonly IpRule[],
  nextRules: readonly IpRule[],
): IpLockoutPreview {
  const items = candidates.map((candidate): AdminIpPreviewItem => {
    const subject: IpSubject = { userNo: candidate.userNo, teamNos: candidate.teamNos }
    const before = judgeIpLockout(currentRules, subject, candidate.sessionIps)
    const after = judgeIpLockout(nextRules, subject, candidate.sessionIps)
    return {
      userNo: candidate.userNo,
      userId: candidate.userId,
      userName: candidate.userName,
      layerBefore: before.layer,
      layerAfter: after.layer,
      statusBefore: before.status,
      statusAfter: after.status,
      // 🔴 after 가 locked 인 것만 보면 이미 잠긴 사람이 "새로 잠긴다" 로 세어진다 — 관리자가 화면을 믿지 않게 된다
      becomesLocked: before.status !== 'locked' && after.status === 'locked',
      ruleSetChanged:
        appliedRuleFingerprint(currentRules, subject) !==
        appliedRuleFingerprint(nextRules, subject),
      activeSessionCount: candidate.sessionIps.length,
      blockedSessionCount: after.blockedSessionCount,
      unknownIpSessionCount: after.unknownIpSessionCount,
    }
  })
  items.sort((a, b) => {
    const grade = lockoutGrade(a) - lockoutGrade(b)
    if (grade !== 0) return grade
    // 🔴 localeCompare 를 쓰지 않는다 — 로케일에 따라 화면과 계약이 다른 배열을 본다. 아이디는 ASCII 다
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
  })
  return {
    summary: {
      total: items.length,
      newlyLocked: items.filter((item) => item.becomesLocked).length,
      alreadyLocked: items.filter(
        (item) => item.statusBefore === 'locked' && item.statusAfter === 'locked',
      ).length,
      unknown: items.filter((item) => item.statusAfter === 'unknown').length,
      // 🔴 전원의 합이다 — passes 인 사람의 다른 기기도 다음 요청에서 403 이다. 새로 잠기는 사람만 세면 가장 흔한 축소가 0
      blockedSessions: items.reduce((sum, item) => sum + item.blockedSessionCount, 0),
      ruleSetChangedOnly: items.filter((item) => item.ruleSetChanged && !item.becomesLocked).length,
    },
    items,
  }
}

/**
 * DB 행 셋(계정 · 팀 배정 · 활성 세션)을 평가 대상으로 묶는다.
 * 🔴 팀은 가장 작은 teamNo 하나 — 인증 findPrincipal 이 고르는 그 행이다. 🔴 팀 · 세션이 없는 계정도 남는다.
 */
export function buildLockoutCandidates(
  users: readonly { userNo: bigint; userId: string; userName: string }[],
  teamMappings: readonly { userNo: bigint; teamNo: bigint }[],
  sessions: readonly { userNo: bigint; ipAddress: string | null }[],
): IpLockoutCandidate[] {
  const primaryTeamOf = new Map<bigint, bigint>()
  for (const row of teamMappings) {
    const current = primaryTeamOf.get(row.userNo)
    if (current === undefined || row.teamNo < current) primaryTeamOf.set(row.userNo, row.teamNo)
  }
  const sessionIpsOf = new Map<bigint, (string | null)[]>()
  for (const row of sessions) {
    const list = sessionIpsOf.get(row.userNo) ?? []
    list.push(row.ipAddress)
    sessionIpsOf.set(row.userNo, list)
  }
  return users.map((user) => {
    const teamNo = primaryTeamOf.get(user.userNo)
    return {
      userNo: user.userNo,
      userId: user.userId,
      userName: user.userName,
      teamNos: teamNo === undefined ? [] : [teamNo],
      sessionIps: sessionIpsOf.get(user.userNo) ?? [],
    }
  })
}

/** create · update 의 바뀔 규칙 — 쿼리 스키마가 scopeType · cidr 을 요구한다(여기 오면 있다) */
function proposedRule(query: AdminIpPreviewQuery): IpRule {
  if (query.scopeType === undefined || query.cidr === undefined) {
    throw new Error('미리보기 쿼리 스키마가 create · update 에 scopeType · cidr 를 요구한다')
  }
  return { scopeType: query.scopeType, scopeRefNo: query.scopeRefNo ?? null, cidr: query.cidr }
}

/**
 * 쿼리가 말하는 변경을 적용한 뒤의 규칙 전량. 아무것도 안 쓴다.
 * 🔴 없는 ruleNo 는 404 다 — "바뀌는 것 없음" 으로 떨어뜨리면 지워진 규칙을 지우려는 관리자가 "아무도 안 잠긴다" 를 보고
 *    저장한다(Review Focus 4).
 */
export function nextRulesOf(
  current: readonly IdentifiedIpRule[],
  query: AdminIpPreviewQuery,
): IpRule[] {
  if (query.op === undefined) return current.map(stripRuleNo)
  if (query.op === 'create') return [...current.map(stripRuleNo), proposedRule(query)]
  if (!current.some((rule) => rule.ruleNo === query.ruleNo)) throw ruleNotFound()
  if (query.op === 'delete') {
    return current.filter((rule) => rule.ruleNo !== query.ruleNo).map(stripRuleNo)
  }
  return current.map((rule) =>
    rule.ruleNo === query.ruleNo ? proposedRule(query) : stripRuleNo(rule),
  )
}
