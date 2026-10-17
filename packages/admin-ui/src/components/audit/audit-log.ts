import type { AdminAuditLog, AuditCatalog } from '@ssworks/admin-shared'
import { isDateOnly, localDayStartIso, localNextDayStartIso } from '../../utils/local-date.js'

// 감사 로그 화면의 타입 · 문구 · 순수 함수 — `useAuditLogs` 와 `AuditLogViewer` 가 함께 쓴다(3f 스펙 C1).
//
// 정본: hangang-home apps/admin/src/pages/settings/audit-logs-messages.ts
// 바꾼 점:
//  - 행위자는 `actorUserNo`(null = 계정을 특정할 수 없음)다. hangang 의 `principalRefNo = 0` 익명이 없다.
//  - 묶음 목록을 고정 표(`AUDIT_ACTION_GROUPS`)가 아니라 코어 기본 + 옵션으로 둔다(A5). 걸리는 액션이 둘 이상인 묶음만 항목이 된다.
//  - 묶음 값은 끝에 점을 붙이고, 값 하나로 prefix · exact 를 나른다(A4). hangang 은 `prefix:` · `exact:` 머리를 붙였다.
//  - 결과는 칩 + 글자(crm 칩 · hangang 글자). 문구는 `messages` 부분 덮어쓰기로 바꾼다(C2).
//  - 조회 오류 문구 해석(`resolveAuditLogsMessage`)은 옮기지 않는다 — 전역 토스트 몫이다(C7).

export interface AuditActorOption {
  userNo: bigint
  userId: string
  userName: string
  /** 퇴사자면 항목에 " · 퇴사" 를 붙인다 */
  resigned?: boolean
}

/** prefix 는 끝 점 없이('org.role'). 보낼 때 'org.role.' 로 만든다(A4) */
export interface AuditActionGroup {
  prefix: string
  label: string
}

/** 서버 `filter` 모양 그대로 — `useServerTable` 의 `filters()` 가 적용값에서 만든다 */
export interface AuditLogFilter {
  actorUserNo?: bigint
  action?: string
  actionMatch?: 'prefix' | 'exact'
  targetType?: string
  targetRefNo?: bigint
  from?: string
  to?: string
}

/** 칸 값은 모두 문자열이다 — '' = 전체(A1) */
export interface AuditLogDraft {
  actorUserNo: string
  action: string
  targetType: string
  targetRefNo: string
  from: string
  to: string
}

export interface AuditFilterItem {
  value: string
  title: string
}

export type AuditResultKind = 'success' | 'redirect' | 'denied' | 'error'

export interface AuditLogMessages {
  readOnlyNote: string
  periodHint: string
  actionHint: string
  fixedSortLabel: string
  total: (count: number) => string
  actorLabel: string
  actorNumberLabel: string
  actionLabel: string
  targetTypeLabel: string
  targetRefNoLabel: string
  fromLabel: string
  toLabel: string
  allPlaceholder: string
  numberPlaceholder: string
  apply: string
  reset: string
  actorNoPermissionHint: string
  actorSearchHint: string
  actorSearchEmpty: string
  actorSearchFailed: string
  resigned: string
  actorRefInvalid: string
  targetRefInvalid: string
  dateInvalid: string
  rangeReversed: string
  columnCreateAt: string
  columnActor: string
  columnAction: string
  columnTarget: string
  columnResult: string
  columnIp: string
  noActor: string
  unknownAccount: (actorUserNo: bigint) => string
  filterByActor: string
  filterByActorLabel: (actor: string) => string
  resultSuccess: string
  resultRedirect: string
  resultDenied: string
  resultError: string
  expand: string
  collapse: string
  expandLabel: (when: string, action: string, expanded: boolean) => string
  changesTitle: string
  changeField: string
  changeBefore: string
  changeAfter: string
  noChanges: string
  absent: string
  masked: (keys: readonly string[]) => string
  restTitle: string
  nothingRecorded: string
  requestLabel: string
  sessionLabel: (sessionNo: bigint) => string
  userAgentLabel: string
  emptyTitle: string
  filteredEmptyTitle: string
  loadFailed: string
  retry: string
  actionGroupItem: (label: string, prefix: string) => string
  actionItem: (label: string, action: string) => string
}

export const DEFAULT_AUDIT_LOG_MESSAGES: Readonly<AuditLogMessages> = Object.freeze({
  readOnlyNote: '읽기 전용 기록입니다. 삭제 · 수정할 수 없습니다.',
  periodHint: '기간은 이 컴퓨터의 시간대 기준이고, 끝 날짜의 하루 전체를 포함합니다.',
  actionHint: '[묶음]은 그 계열 전체를, 나머지는 그 동작 하나만 찾습니다.',
  fixedSortLabel: '정렬: 최신순(고정)',
  total: (count: number) => `총 ${count.toLocaleString('ko-KR')}건`,
  actorLabel: '행위자',
  actorNumberLabel: '행위자 번호',
  actionLabel: '동작',
  targetTypeLabel: '대상 종류',
  targetRefNoLabel: '대상 번호',
  fromLabel: '시작 날짜',
  toLabel: '끝 날짜',
  allPlaceholder: '전체',
  numberPlaceholder: '숫자만',
  apply: '적용',
  reset: '초기화',
  actorNoPermissionHint: '행위자 목록을 볼 권한이 없어 번호로 찾습니다.',
  actorSearchHint: '이름이나 아이디를 입력하세요.',
  actorSearchEmpty: '맞는 사람이 없습니다.',
  actorSearchFailed: '검색하지 못했습니다. 다시 입력해 보세요.',
  resigned: ' · 퇴사',
  actorRefInvalid: '행위자 번호는 숫자만 넣을 수 있습니다.',
  targetRefInvalid: '대상 번호는 숫자만 넣을 수 있습니다.',
  dateInvalid: '날짜는 YYYY-MM-DD 형식이어야 합니다.',
  rangeReversed: '시작 날짜가 끝 날짜보다 늦습니다. 기간을 고친 뒤 적용하세요.',
  columnCreateAt: '시각',
  columnActor: '행위자',
  columnAction: '동작',
  columnTarget: '대상',
  columnResult: '결과',
  columnIp: 'IP',
  noActor: '계정 없음',
  unknownAccount: (actorUserNo: bigint) => `#${actorUserNo} (계정 정보 없음)`,
  filterByActor: '이 사람 기록만',
  filterByActorLabel: (actor: string) => `${actor} 기록만 보기`,
  resultSuccess: '성공',
  resultRedirect: '이동',
  resultDenied: '거부',
  resultError: '서버 오류',
  expand: '내역',
  collapse: '접기',
  expandLabel: (when: string, action: string, expanded: boolean) =>
    `${when} ${action} ${expanded ? '내역 접기' : '내역 보기'}`,
  changesTitle: '바뀐 항목',
  changeField: '항목',
  changeBefore: '전',
  changeAfter: '후',
  noChanges: '바뀐 항목 없음',
  absent: '(없음)',
  masked: (keys: readonly string[]) => `가려진 항목: ${keys.join(', ')} — 값은 표시하지 않습니다`,
  restTitle: '기타 기록',
  nothingRecorded: '기록된 변경 내역이 없습니다',
  requestLabel: '요청',
  sessionLabel: (sessionNo: bigint) => `세션 #${sessionNo}`,
  userAgentLabel: 'User-Agent',
  emptyTitle: '아직 기록이 없습니다',
  filteredEmptyTitle: '조건에 맞는 기록이 없습니다',
  loadFailed: '감사 로그를 불러오지 못했습니다.',
  retry: '다시 시도',
  actionGroupItem: (label: string, prefix: string) => `[묶음] ${label} (${prefix}.*)`,
  // 라벨이 코드와 같으면(카탈로그 밖 코드) 한 번만 적는다
  actionItem: (label: string, action: string) =>
    label === action ? action : `${label} (${action})`,
})

// ── 입력값 ───────────────────────────────────────────────────────────

const DRAFT_KEYS = [
  'actorUserNo',
  'action',
  'targetType',
  'targetRefNo',
  'from',
  'to',
] as const satisfies readonly (keyof AuditLogDraft)[]

export function emptyAuditLogDraft(): AuditLogDraft {
  return { actorUserNo: '', action: '', targetType: '', targetRefNo: '', from: '', to: '' }
}

/** 칸마다 앞뒤 공백을 뗀다 — 번호 칸의 " 3 " 이 형식 오류가 되지 않게 */
export function normalizeAuditLogDraft(draft: AuditLogDraft): AuditLogDraft {
  const out = emptyAuditLogDraft()
  for (const key of DRAFT_KEYS) out[key] = draft[key].trim()
  return out
}

export function isEmptyAuditLogDraft(draft: AuditLogDraft): boolean {
  return DRAFT_KEYS.every((key) => draft[key] === '')
}

export function sameAuditLogDraft(a: AuditLogDraft, b: AuditLogDraft): boolean {
  return DRAFT_KEYS.every((key) => a[key] === b[key])
}

/** 서버 `queryBigIntSchema` 와 같은 폭(부호 없는 20자리) */
const UNSIGNED_DIGITS = /^[0-9]{1,20}$/

/** 형식 오류 문구, 없으면 null(A3). 기간은 같은 날이 정상이고 한쪽만 있어도 된다 */
export function auditFilterProblem(
  draft: AuditLogDraft,
  messages: AuditLogMessages,
): string | null {
  if (draft.actorUserNo !== '' && !UNSIGNED_DIGITS.test(draft.actorUserNo)) {
    return messages.actorRefInvalid
  }
  if (draft.targetRefNo !== '' && !UNSIGNED_DIGITS.test(draft.targetRefNo)) {
    return messages.targetRefInvalid
  }
  if (
    (draft.from !== '' && !isDateOnly(draft.from)) ||
    (draft.to !== '' && !isDateOnly(draft.to))
  ) {
    return messages.dateInvalid
  }
  // `YYYY-MM-DD` 는 자릿수가 고정이라 문자열 비교가 곧 날짜 비교다
  if (draft.from !== '' && draft.to !== '' && draft.from > draft.to) return messages.rangeReversed
  return null
}

/** 적용값 → 서버 필터. 빈 칸은 키째 뺀다 — 필터 키가 흔들리지 않고 `isFiltered` 기본 판정이 맞는다 */
export function toAuditFilter(applied: AuditLogDraft): AuditLogFilter {
  const filter: AuditLogFilter = {}
  if (UNSIGNED_DIGITS.test(applied.actorUserNo)) filter.actorUserNo = BigInt(applied.actorUserNo)
  const action = toActionFilter(applied.action)
  if (action != null) {
    filter.action = action.action
    filter.actionMatch = action.actionMatch
  }
  if (applied.targetType !== '') filter.targetType = applied.targetType
  if (UNSIGNED_DIGITS.test(applied.targetRefNo)) filter.targetRefNo = BigInt(applied.targetRefNo)
  const from = applied.from === '' ? null : localDayStartIso(applied.from)
  if (from != null) filter.from = from
  // 🔴 끝 날짜의 하루 전체를 포함한다 — 다음 날 0시를 보내고 서버가 `<` 로 비교한다(A7)
  const to = applied.to === '' ? null : localNextDayStartIso(applied.to)
  if (to != null) filter.to = to
  return filter
}

// ── 셀 표기 ──────────────────────────────────────────────────────────

export function auditResultOf(status: number): AuditResultKind {
  if (status >= 500) return 'error'
  if (status >= 400) return 'denied'
  if (status >= 300) return 'redirect'
  return 'success'
}

const RESULT_TEXT_KEY = {
  success: 'resultSuccess',
  redirect: 'resultRedirect',
  denied: 'resultDenied',
  error: 'resultError',
} as const satisfies Record<AuditResultKind, keyof AuditLogMessages>

/** 🔴 숫자와 글자를 함께 낸다 — 색으로만 가르면 렌더 테스트가 못 재고 색각 이상에도 안 보인다(hangang) */
export function auditResultText(status: number, messages: AuditLogMessages): string {
  return `${status} · ${messages[RESULT_TEXT_KEY[auditResultOf(status)]]}`
}

export function actorText(
  row: Pick<AdminAuditLog, 'actorUserNo' | 'actorUserId' | 'actorUserName'>,
  messages: AuditLogMessages,
): string {
  if (row.actorUserName != null || row.actorUserId != null) {
    return `${row.actorUserName ?? '—'} (${row.actorUserId ?? '—'})`
  }
  // users FK 가 없어 계정이 지워져도 행은 남는다 — 번호만 아는 행
  if (row.actorUserNo != null) return messages.unknownAccount(row.actorUserNo)
  return messages.noActor
}

export function actorOptionTitle(option: AuditActorOption, messages: AuditLogMessages): string {
  return `${option.userName} (${option.userId})${option.resigned === true ? messages.resigned : ''}`
}

/** 🔴 카탈로그에 없는 종류는 코드 그대로 낸다(`targetLabelOf` 가 그렇게 한다) — 등재 누락을 감추지 않는다 */
export function targetText(
  row: Pick<AdminAuditLog, 'targetType' | 'targetRefNo'>,
  catalog: AuditCatalog,
): string {
  if (row.targetType == null) return '—'
  const label = catalog.targetLabelOf(row.targetType)
  return row.targetRefNo == null ? label : `${label} #${row.targetRefNo}`
}

// ── 필터 항목 ────────────────────────────────────────────────────────

export const CORE_AUDIT_ACTION_GROUPS: readonly AuditActionGroup[] = Object.freeze([
  { prefix: 'auth', label: '인증' },
  { prefix: 'auth.login', label: '로그인' },
  { prefix: 'session', label: '세션' },
  { prefix: 'org.role', label: '역할' },
  { prefix: 'org.user', label: '사용자' },
  { prefix: 'org.team', label: '팀' },
  { prefix: 'setting', label: '설정' },
])

/** 코어 묶음 뒤에 프로젝트 묶음을 더한다. prefix 가 같으면 라벨만 덮는다. 끝 점은 떼고 받는다 */
export function mergeActionGroups(extra: readonly AuditActionGroup[] = []): AuditActionGroup[] {
  const merged = CORE_AUDIT_ACTION_GROUPS.map((group) => ({ ...group }))
  for (const group of extra) {
    const prefix = group.prefix.replace(/[.]+$/, '')
    const existing = merged.find((item) => item.prefix === prefix)
    if (existing != null) existing.label = group.label
    else merged.push({ prefix, label: group.label })
  }
  return merged
}

/**
 * 동작 항목 — 묶음이 먼저, 개별은 카탈로그 순서.
 * 🔴 묶음 값은 끝에 점을 붙인다(`org.role.`). 서버 prefix 는 `LIKE 'x%'` 라 점이 없으면 이웃 코드를 잡을 수 있다(A4).
 * 🔴 걸리는 액션이 둘 이상인 묶음만 항목이 된다 — 한 줄짜리 묶음은 개별 항목과 같다(A5).
 */
export function buildActionOptions(
  catalog: AuditCatalog,
  groups: readonly AuditActionGroup[],
  messages: AuditLogMessages,
): AuditFilterItem[] {
  const groupItems = groups
    .filter(
      (group) =>
        catalog.ACTION_VALUES.filter((action) => action.startsWith(`${group.prefix}.`)).length >= 2,
    )
    .map((group) => ({
      value: `${group.prefix}.`,
      title: messages.actionGroupItem(group.label, group.prefix),
    }))
  const actionItems = catalog.ACTION_VALUES.map((action) => ({
    value: action,
    title: messages.actionItem(catalog.labelOf(action), action),
  }))
  return [...groupItems, ...actionItems]
}

/**
 * 칸 값 → 서버 질의 둘. 끝이 점이면 묶음(prefix), 아니면 개별(exact).
 * 🔴 `session.revoke` 는 `session.revoke.user` 의 접두다 — 개별을 prefix 로 보내면 오류 없이 엉뚱한 행이 섞인다(hangang).
 */
export function toActionFilter(
  value: string,
): { action: string; actionMatch: 'prefix' | 'exact' } | null {
  if (value === '') return null
  return { action: value, actionMatch: value.endsWith('.') ? 'prefix' : 'exact' }
}

/** 대상 종류 — 라벨 가나다순. 값은 서버가 등가 비교하는 코드 그대로 */
export function targetOptions(catalog: AuditCatalog): AuditFilterItem[] {
  return catalog.TARGET_VALUES.map((value) => ({
    value,
    title: catalog.targetLabelOf(value),
  })).sort((a, b) => a.title.localeCompare(b.title, 'ko'))
}

// ── meta — 바뀐 항목만 전/후로 ───────────────────────────────────────

/** 서버가 쓸 때 가린 값. 🔴 화면은 풀거나 추측하지 않는다 */
export const MASKED_VALUE = '***'

export interface AuditMetaChange {
  key: string
  before: string
  after: string
}

export interface AuditMetaDiff {
  /** before · after 중 하나라도 객체로 실려 있었다 — 변경 내역을 남긴 행이다 */
  hasDiff: boolean
  /** 값이 달라진 항목만 */
  changes: AuditMetaChange[]
  /** 🔴 가린 항목 — 값이 `***` 라 바뀜을 판정할 수 없다. 이름만 낸다 */
  masked: string[]
  /** before · after 밖의 meta. 객체가 아닌 meta 는 통째로. 없으면 null */
  rest: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function show(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** 기타 기록 표시용 JSON — 던지지 않는다(bigint 등은 문자열로) */
export function metaJson(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, item: unknown) => (typeof item === 'bigint' ? String(item) : item),
      2,
    )
  } catch {
    return String(value)
  }
}

/**
 * 정본 hangang `diffMeta`. 킷 서버의 `attachAuditDiff` 가 같은 구조(`before` · `after` 평평한 객체 + 다른 키)를 쓴다(스펙 §9).
 * 객체가 아닌 meta(배열 · 문자열)와 객체가 아닌 before · after 는 기타 기록으로 남긴다 — 정보를 버리지 않는다.
 */
export function diffAuditMeta(meta: unknown, absent: string): AuditMetaDiff {
  if (meta === null || meta === undefined)
    return { hasDiff: false, changes: [], masked: [], rest: null }
  const record = asRecord(meta)
  if (record == null) return { hasDiff: false, changes: [], masked: [], rest: meta }

  const before = asRecord(record.before)
  const after = asRecord(record.after)
  const others = Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) => !((key === 'before' || key === 'after') && asRecord(value) != null),
    ),
  )
  const rest = Object.keys(others).length === 0 ? null : others
  if (before == null && after == null) return { hasDiff: false, changes: [], masked: [], rest }

  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  const changes: AuditMetaChange[] = []
  const masked: string[] = []
  for (const key of keys) {
    const b = before != null && Object.hasOwn(before, key) ? show(before[key]) : absent
    const a = after != null && Object.hasOwn(after, key) ? show(after[key]) : absent
    if (b === MASKED_VALUE || a === MASKED_VALUE) {
      masked.push(key)
      continue
    }
    if (b !== a) changes.push({ key, before: b, after: a })
  }
  return { hasDiff: true, changes, masked, rest }
}
