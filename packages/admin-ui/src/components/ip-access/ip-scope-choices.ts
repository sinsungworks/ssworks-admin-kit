import { isCoreIpScopeType, isIpExtraScopeTypeName, type IpScopeType } from '@ssworks/admin-shared'
import type { IpAccessMessages, IpSelectItem } from './ip-access.js'

// IP 규칙 범위 선택지 — 코어 층(사용자 · 팀 · 전체)과 확장 범위(관리자 밖 주체 — 출고 토큰 등)를 한 칸에서 고른다.
//
// 정본: 없음 — 확장 범위 스펙 X11 · X12 · §5-1 ~ §5-3 · §5-5.
// 🔴 폼의 scopeType 은 선택지 키다 — 확장 범위의 범위 전체는 `<이름>:*`. `:*` 는 서버 이름 규칙(영숫자)에 들어갈 수 없어 대상
//    칸에 친 글자와 섞이지 않는다. 본문을 만들 때 parseScopeChoice 가 { scopeType, whole } 로 푼다.
// 🔴 수정은 갈래를 넘지 않는다(X2) — 코어 규칙은 코어 선택지만, 확장 규칙은 그 범위의 둘만.

/** 가까운 층부터 — 그 순서가 곧 평가 순서다(hangang) */
export const IP_SCOPE_ORDER: readonly IpScopeType[] = Object.freeze(['user', 'team', 'global'])

export interface IpTargetOption {
  refNo: bigint
  name: string
}

export interface IpExtraScopeOption {
  /** 서버 옵션 ipAccess.extraScopes[].type 과 같은 이름 — 쓰는 쪽이 한 상수에서 만든다 */
  type: string
  /** 범위 이름(예: '출고 토큰') */
  label: string
  /** 범위 전체 이름(예: '모든 출고 USB'). 없으면 범위 전체를 고를 수 없다 — 서버 wholeScope 와 맞춘다 */
  wholeLabel?: string
  /** 대상 검색 → 후보. 없으면 번호 칸 */
  search?: (keyword: string) => Promise<readonly IpTargetOption[]>
  /** 게터 — 기본 () => true. 거짓이면 번호 칸 + 이유 */
  canSearch?: () => boolean
}

/** 한 범위 모드(R6-1) — 값이다(X12). 다른 대상을 보이려면 쓰는 쪽이 :key 로 다시 만든다 */
export interface IpRuleFocus {
  /** extraScopes 에 있는 확장 범위 */
  scopeType: string
  /** 주면 그 대상의 규칙 + 범위 전체 규칙만, 안 주면 그 범위 전부 */
  scopeRefNo?: bigint
}

/** 다른 화면에서 만들기를 열 때 미리 채울 값(R6c) */
export interface IpRulePrefill {
  /** 코어 층 또는 확장 범위 이름 */
  scopeType: string
  /** null = 전체(코어) · 범위 전체(확장) */
  scopeRefNo: bigint | null
  /** 대상 칸 · 관문 문구에 보일 이름 */
  scopeName?: string
  cidr?: string
  description?: string
}

/** 화면이 다루는 범위 — setup 에서 한 번 푼다 */
export interface IpScopeCatalog {
  /** 코어 층 — useIpAccessRules 의 scopes 를 평가 순서로 편 것 */
  readonly core: readonly IpScopeType[]
  /** 확장 범위 — 넘긴 순서 */
  readonly extra: ReadonlyMap<string, IpExtraScopeOption>
  readonly focus: IpRuleFocus | null
}

export const CORE_SCOPE_CATALOG: IpScopeCatalog = Object.freeze({
  core: IP_SCOPE_ORDER,
  extra: new Map<string, IpExtraScopeOption>(),
  focus: null,
})

const WHOLE_SUFFIX = ':*'

export function wholeScopeKey(type: string): string {
  return `${type}${WHOLE_SUFFIX}`
}

export interface IpScopeChoice {
  /** 서버 범위 이름 */
  scopeType: string
  /** 대상이 없는 선택지인가 — 코어 전체 · 확장 범위 전체 */
  whole: boolean
}

export function parseScopeChoice(key: string): IpScopeChoice {
  if (key.endsWith(WHOLE_SUFFIX)) {
    return { scopeType: key.slice(0, -WHOLE_SUFFIX.length), whole: true }
  }
  return { scopeType: key, whole: key === 'global' }
}

/** 규칙(서버 모양) → 선택지 키 */
export function scopeChoiceKey(scopeType: string, scopeRefNo: bigint | null): string {
  if (isCoreIpScopeType(scopeType) || scopeRefNo !== null) return scopeType
  return wholeScopeKey(scopeType)
}

/** 확장 범위(코어 밖)의 선택지인가 — 등록이 빠진 범위 포함 */
export function isExtraChoice(key: string): boolean {
  return !isCoreIpScopeType(parseScopeChoice(key).scopeType)
}

/** 🔴 setup 에서 던진다 — 이름 규칙 밖 · 코어 이름 · 겹침(대소문자 무시) · focus 가 확장 범위 밖 */
export function resolveIpScopeCatalog(
  core: readonly IpScopeType[],
  extraScopes: readonly IpExtraScopeOption[] = [],
  focus: IpRuleFocus | null = null,
): IpScopeCatalog {
  const extra = new Map<string, IpExtraScopeOption>()
  const seen = new Set<string>()
  for (const scope of extraScopes) {
    const lower = scope.type.toLowerCase()
    if (!isIpExtraScopeTypeName(scope.type) || seen.has(lower)) {
      throw new Error(
        `useIpAccessRules 의 extraScopes[].type 은 영소문자로 시작하는 영숫자 1~16자이고 global · team · user · 다른 범위와 겹치지 않아야 한다: ${JSON.stringify(scope.type)}`,
      )
    }
    seen.add(lower)
    extra.set(scope.type, Object.freeze({ ...scope }))
  }
  if (focus !== null && !extra.has(focus.scopeType)) {
    throw new Error(
      `useIpAccessRules 의 focus.scopeType 은 extraScopes 에 있는 범위여야 한다: ${JSON.stringify(focus.scopeType)}`,
    )
  }
  return Object.freeze({ core, extra, focus: focus === null ? null : Object.freeze({ ...focus }) })
}

function coreLabel(scopeType: IpScopeType, messages: IpAccessMessages): string {
  if (scopeType === 'user') return messages.scopeUser
  if (scopeType === 'team') return messages.scopeTeam
  return messages.scopeGlobal
}

/** 선택지 이름 — 코어는 문구, 확장은 쓰는 쪽 label · wholeLabel, 모르는 범위는 이름 그대로 */
export function scopeChoiceLabel(
  key: string,
  messages: IpAccessMessages,
  catalog: IpScopeCatalog,
): string {
  const { scopeType, whole } = parseScopeChoice(key)
  if (isCoreIpScopeType(scopeType)) return coreLabel(scopeType, messages)
  const extra = catalog.extra.get(scopeType)
  if (extra === undefined) return scopeType
  if (!whole) return extra.label
  return extra.wholeLabel ?? messages.scopeWhole(extra.label)
}

/** 'all' = 만들기 · 'core' = 코어 규칙 수정 · { extra } = 그 확장 범위(규칙 수정 · 한 범위 모드) */
export type IpScopeFamily = 'all' | 'core' | { extra: string }

/**
 * 선택지 — 코어는 평가 순서, 확장은 넘긴 순서(대상 하나 → 범위 전체). `current` 가 목록 밖이면(편집을 연 기존 규칙) 그 자리에
 * 둔다 — 폼이 다른 선택지로 바뀌면 사라진다(3i S2).
 */
export function scopeChoiceItems(
  messages: IpAccessMessages,
  catalog: IpScopeCatalog,
  family: IpScopeFamily,
  current?: string,
): IpSelectItem[] {
  const keys: string[] = []
  if (family === 'all' || family === 'core') {
    for (const layer of IP_SCOPE_ORDER) {
      if (catalog.core.includes(layer) || layer === current) keys.push(layer)
    }
  }
  if (family !== 'core') {
    for (const [type, scope] of catalog.extra) {
      if (family !== 'all' && family.extra !== type) continue
      keys.push(type)
      const whole = wholeScopeKey(type)
      if (scope.wholeLabel !== undefined || current === whole) keys.push(whole)
    }
  }
  return keys.map((value) => ({ value, title: scopeChoiceLabel(value, messages, catalog) }))
}

/** 미리 채울 선택지 키 — 이 화면이 고를 수 없으면 null(확장 범위 스펙 §5-5) */
export function prefillScopeChoice(
  prefill: Pick<IpRulePrefill, 'scopeType' | 'scopeRefNo'>,
  catalog: IpScopeCatalog,
): string | null {
  const { scopeType, scopeRefNo } = prefill
  const focus = catalog.focus
  if (focus !== null) {
    if (scopeType !== focus.scopeType) return null
    if (scopeRefNo !== null && focus.scopeRefNo !== undefined && scopeRefNo !== focus.scopeRefNo) {
      return null
    }
  }
  if (isCoreIpScopeType(scopeType)) {
    if (!catalog.core.includes(scopeType)) return null
    return (scopeType === 'global') === (scopeRefNo === null) ? scopeType : null
  }
  const extra = catalog.extra.get(scopeType)
  if (extra === undefined) return null
  if (scopeRefNo === null) return extra.wholeLabel === undefined ? null : wholeScopeKey(scopeType)
  return scopeType
}
