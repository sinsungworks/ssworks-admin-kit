import {
  IP_ACCESS_SCHEMA_MESSAGES,
  IP_CIDR_MAX_LENGTH,
  IP_RULE_DESCRIPTION_MAX_LENGTH,
  ipCidrSchema,
  parseCidr,
  type AdminIpPreview,
  type AdminIpPreviewItem,
  type AdminIpPreviewQuery,
  type AdminIpRule,
  type AdminIpRuleCreate,
  type AdminIpRuleUpdate,
  type AdminTeamNode,
  type IpLockoutStatus,
  type IpScopeType,
} from '@ssworks/admin-shared'
import type { ApiError } from '../../api/error.js'

// IP 접근 제어 화면의 타입 · 문구 · 순수 함수 — `useIpAccessRules` · `useIpPreview` · `IpAccessManager` 가 함께 쓴다(3g 스펙 C1).
//
// 정본: hangang-home apps/admin/src/pages/settings/ip-access-messages.ts
// 바꾼 점:
//  - 용어를 킷 README 로 — 사용자 · 팀 · 전체(hangang 계정 · 팀 · 전역).
//  - 🔴 CIDR 검증을 화면도 서버와 같은 파서(admin-shared `ipCidrSchema`)로 한다(2f-1 스펙 P1). hangang 은 "형식 판정은 서버만"
//    이라 비었는가 · 길이만 봤다 — 킷은 파서가 하나라 화면 검증이 곧 서버 판정이다.
//  - 미리보기 호출 게이트를 "/ 뒤에 한 글자"(hangang)가 아니라 그 파서 통과로(I9).
//  - 대상을 번호로 치던 칸을 후보 고르기로(④ T1) — 경로 항목(`flattenTeamPaths`) · 사용자 항목 글자.
//  - 세션 끊기 제안 문구 전부를 버렸다(⑥ S2 — 킷 서버는 매 요청 IP 를 본다).
//  - 문구는 `messages` 부분 덮어쓰기로 바꾼다(C2).

export interface IpUserOption {
  userNo: bigint
  userId: string
  userName: string
}

/** 재인증일 때만 currentPassword 가 있다. 본문에 실을지는 어댑터가 정한다(useRoleEditor 와 같음) */
export interface IpWriteContext {
  currentPassword?: string
}

/** 칸 값은 문자열 — scopeRefNo '' = 없음 */
export interface IpRuleForm {
  scopeType: IpScopeType
  scopeRefNo: string
  cidr: string
  description: string
}

export type IpRuleFormField = keyof IpRuleForm

/** 서버 검증 오류가 칸 아래에 보이는 키(`useWriteFlow` 의 `fields`) */
export const IP_RULE_FORM_FIELDS: readonly IpRuleFormField[] = Object.freeze([
  'scopeType',
  'scopeRefNo',
  'cidr',
  'description',
])

export type IpPreviewOp = 'create' | 'update' | 'delete'

export type IpPreviewState =
  'loading' | 'ready' | 'pending-input' | 'forbidden' | 'stale' | 'failed'

export interface IpPreviewView {
  state: IpPreviewState
  op: IpPreviewOp | null
  result: AdminIpPreview | null
  /** 한 번 받으면 뒤의 실패로 지우지 않는다(I2) */
  clientIp: string | null
}

/** 미리보기가 무엇을 묻는가 — op null = 현행 */
export type IpPreviewTarget =
  | { op: null }
  | { op: 'create'; form: IpRuleForm }
  | { op: 'update'; ruleNo: bigint; form: IpRuleForm }
  | { op: 'delete'; ruleNo: bigint }

export interface IpSelectItem {
  value: string
  title: string
}

export interface IpAccessAlert {
  kind: 'error' | 'warning'
  text: string
}

export type IpGateKind = 'create' | 'update' | 'remove'

export interface IpAccessMessages {
  scopeUser: string
  scopeTeam: string
  scopeGlobal: string
  layer: (scope: string) => string
  layerNone: string
  statusLocked: string
  statusPasses: string
  statusUnknown: string
  cardTitle: string
  currentIp: (ip: string) => string
  currentIpUnknown: string
  unknownAddress: string
  passLine: (passes: boolean, ip: string, current: boolean) => string
  basisCurrent: string
  basisCreate: string
  basisUpdate: string
  basisDelete: string
  summaryEvaluated: (total: number) => string
  summaryNoImpact: string
  summaryUnknownOnly: (unknown: number) => string
  summaryNewlyLocked: (newly: number, already: number, unknown: number) => string
  summaryBlockedSessions: (count: number) => string
  summaryRuleSetChanged: (count: number) => string
  self: string
  sessionsNone: string
  sessionsBlocked: (active: number, blocked: number) => string
  sessionsUnknownDenied: (unknown: number) => string
  sessionsUnknownUndetermined: (unknown: number) => string
  ruleSetChanged: string
  ruleSetChangedUnknown: string
  ruleSetChangedNow: (status: string) => string
  previewLoading: string
  previewPendingInput: string
  previewForbidden: string
  previewStale: string
  previewFailed: string
  globalAllowRemoval: string
  hintLayerShadow: string
  hintServerDefence: string
  hintSessionsStay: string
  hintRecovery: string
  gateHead: (kind: IpGateKind, scope: string, cidr: string) => string
  irreversible: string
  gateImpactNone: string
  gateImpactLocked: (count: number) => string
  gateImpactUnknown: string
  createTitle: string
  updateTitle: string
  removeTitle: string
  createConfirm: string
  updateConfirm: string
  removeConfirm: string
  savedWithoutPreview: string
  conflictWithIp: (message: string, ip: string) => string
  conflictWithoutMessage: string
  revisionConflict: (scope: string, cidr: string) => string
  ruleGone: string
  discardTitle: string
  discardMessage: string
  discardConfirm: string
  editorCreateTitle: string
  editorEditTitle: string
  scopeLabel: string
  teamLabel: string
  userLabel: string
  teamNumberLabel: string
  userNumberLabel: string
  cidrLabel: string
  descriptionLabel: string
  cidrHint: string
  numberPlaceholder: string
  save: string
  cancel: string
  teamNoPermissionHint: string
  userNoPermissionHint: string
  teamsFailed: string
  userSearchHint: string
  userSearchEmpty: string
  userSearchFailed: string
  scopeRefRequired: string
  scopeRefDigits: string
  cidrRequired: string
  cidrInvalid: string
  cidrTooLong: string
  descriptionTooLong: string
  listTitle: string
  sortLabel: string
  createButton: string
  columnScope: string
  columnCidr: string
  columnDescription: string
  edit: string
  remove: string
  editLabel: (rule: string) => string
  removeLabel: (rule: string) => string
  editing: string
  deadTarget: string
  emptyTitle: string
  loadFailed: string
  retry: string
}

export const DEFAULT_IP_ACCESS_MESSAGES: Readonly<IpAccessMessages> =
  Object.freeze<IpAccessMessages>({
    scopeUser: '사용자',
    scopeTeam: '팀',
    scopeGlobal: '전체',
    layer: (scope) => `${scope} 층`,
    // 🔴 "없음"으로 적지 않는다 — 채택된 층이 없으면 어떤 주소로도 못 들어온다(기본 거부 · hangang)
    layerNone: '규칙 없음(기본 거부)',
    statusLocked: '잠김',
    statusPasses: '통과',
    // 🔴 "통과"로 읽히면 안 된다 — 주소를 아는 활성 세션이 없어 판정 자체가 불가능하다(hangang)
    statusUnknown: '판정 불가',
    cardTitle: '접속 상태와 변경 영향',
    currentIp: (ip) => `현재 접속 IP: ${ip}`,
    // 🔴 빈 칸으로 그리지 않는다 — "IP 가 없다"로 읽힌다(I2 · hangang)
    currentIpUnknown: '현재 접속 IP 를 아직 확인하지 못했습니다.',
    unknownAddress: '알 수 없는 주소',
    passLine: (passes, ip, current) =>
      current
        ? passes
          ? `지금 접속(${ip})은 현행 규칙을 통과합니다.`
          : `지금 접속(${ip})이 현행 규칙을 통과하지 못합니다.`
        : passes
          ? `이 변경 뒤에도 지금 접속(${ip})은 통과합니다.`
          : `이 변경 뒤에는 지금 접속(${ip})이 통과하지 못합니다 — 서버가 저장을 거부합니다(409).`,
    basisCurrent: '아래는 현행 규칙 기준입니다.',
    basisCreate: '아래는 지금 만들려는 규칙을 더했을 때 기준입니다.',
    basisUpdate: '아래는 지금 편집 중인 값으로 바꿨을 때 기준입니다.',
    basisDelete: '아래는 선택한 규칙을 지웠을 때 기준입니다.',
    summaryEvaluated: (total) => `사용자 ${total}명을 평가했습니다.`,
    summaryNoImpact: '이 변경으로 새로 잠기는 사용자는 없습니다.',
    summaryUnknownOnly: (unknown) =>
      `판정 불가 ${unknown}명은 활성 세션의 접속 주소를 몰라 확인할 수 없습니다.`,
    summaryNewlyLocked: (newly, already, unknown) =>
      `🔴 이 변경으로 ${newly}명이 새로 잠깁니다. 변경 전에도 잠겨 있던 ${already}명과 판정 불가 ${unknown}명은 따로 셉니다.`,
    summaryBlockedSessions: (count) =>
      `이 규칙이 거부하는 활성 세션은 평가 대상 전원을 합쳐 ${count}개입니다.`,
    summaryRuleSetChanged: (count) =>
      `🔴 잠기지는 않지만 적용되는 규칙이 달라지는 사용자가 ${count}명 있습니다 — 지금 세션은 살아 있어도 허용 주소가 좁아졌으면 다음에 다른 곳에서 붙을 때 막힙니다.`,
    self: '본인',
    sessionsNone: '활성 세션 없음',
    sessionsBlocked: (active, blocked) => `활성 세션 ${active}개 중 ${blocked}개가 거부됩니다`,
    sessionsUnknownDenied: (unknown) =>
      `(그중 ${unknown}개는 접속 주소가 기록되지 않았지만, 채택될 층이 없어 주소와 무관하게 거부가 확정입니다)`,
    sessionsUnknownUndetermined: (unknown) =>
      ` — 그 수 밖에 접속 주소가 기록되지 않은 세션이 ${unknown}개 더 있어 통과할지 거부될지 판정할 수 없습니다`,
    ruleSetChanged: '적용되는 규칙이 달라집니다',
    ruleSetChangedUnknown: '🔴 활성 세션의 접속 주소를 몰라 통과할지 판정할 수 없습니다',
    ruleSetChangedNow: (status) => `지금은 ${status}`,
    previewLoading: '이 변경의 영향을 확인하는 중입니다…',
    previewPendingInput:
      '범위 · 대상 · CIDR 을 다 채우면 이 변경으로 누가 잠기는지 여기에 표시됩니다.',
    previewForbidden:
      '변경 영향과 현재 접속 IP 는 IP 관리 권한이 있을 때 보입니다. 지금은 규칙 목록만 볼 수 있습니다.',
    previewStale:
      '이미 지워진 규칙입니다 — 다른 관리자가 방금 지운 것으로 보입니다. 목록을 새로 불러왔습니다.',
    // 🔴 "영향 없음"으로 떨어뜨리지 않는다(hangang)
    previewFailed:
      '이 변경의 영향을 확인하지 못했습니다 — 다른 사용자가 잠기는지 알 수 없는 상태로 저장하게 됩니다.',
    globalAllowRemoval:
      '🔴 이 변경은 전체 허용 행을 없앱니다. 전체 허용은 IPv4(0.0.0.0/0)와 IPv6(::/0) 두 행이고 계열이 서로를 통과시키지 않습니다 — 한 행만 없애도 그 계열로 접속하는 사람이 모두 잠깁니다. 지우는 것뿐 아니라 범위를 좁히는 수정도 같은 일이고, 내 접속이 다른 계열이면 서버 검사(409)도 위 미리보기도 이것을 잡지 못합니다.',
    hintLayerShadow:
      '평가는 사용자 → 팀 → 전체 순으로 가장 가까운 층 하나만 채택합니다. 그 사람에게 사용자 규칙이 하나라도 있으면 팀 · 전체 규칙은 보지 않습니다 — 전체 허용을 더 넣는 것으로는 풀리지 않습니다. 어느 층에도 규칙이 없으면 거부입니다.',
    hintServerDefence:
      '이 미리보기는 예고입니다. 실제로 막는 것은 저장할 때 요청자 주소를 다시 평가하는 서버 검사(409)이고, 그 검사도 요청자 본인만 봅니다.',
    hintSessionsStay:
      '규칙은 저장 즉시 모든 요청에 적용됩니다. 세션은 끊지 않으므로 허용된 주소로 돌아오면 같은 세션을 씁니다. 끊어야 하면 세션 화면에서 끊으세요.',
    hintRecovery:
      '잠긴 사람은 로그인이 막혀 이 화면에 들어올 수 없습니다. 복구는 DB 직접 조작입니다. 위 목록에는 지금 이 화면을 보는 당신도 들어 있을 수 있으니 「본인」 표시를 확인하세요.',
    gateHead: (kind, scope, cidr) =>
      `${scope} 범위의 「${cidr}」 규칙을 ${kind === 'create' ? '만듭니다' : kind === 'update' ? '저장합니다' : '지웁니다'}.`,
    irreversible: '지운 규칙은 되돌릴 수 없습니다.',
    gateImpactNone: '이 변경으로 새로 잠기는 사용자는 없습니다.',
    gateImpactLocked: (count) => `🔴 이 변경으로 ${count}명이 새로 잠깁니다.`,
    gateImpactUnknown:
      '이 변경의 영향을 확인하지 못했습니다 — 누가 잠기는지 모르는 채로 진행합니다.',
    createTitle: 'IP 규칙 만들기',
    updateTitle: 'IP 규칙 저장',
    removeTitle: 'IP 규칙 삭제',
    createConfirm: '만들기',
    updateConfirm: '저장',
    removeConfirm: '삭제',
    savedWithoutPreview:
      '저장했지만 이 변경으로 누가 잠기는지는 확인하지 못했습니다 — 「아무도 안 잠깁니다」가 아닙니다. 목록을 새로 불러와 영향을 다시 확인하세요.',
    conflictWithIp: (message, ip) => `${message} 서버가 본 지금 주소: ${ip}`,
    conflictWithoutMessage:
      '지금 상태에서는 이 변경을 적용할 수 없습니다 — 이 규칙으로 바꾸면 지금 접속한 위치에서 로그인할 수 없게 되거나, 로그인할 수 있는 전체 권한 사용자가 한 명도 남지 않습니다.',
    revisionConflict: (scope, cidr) =>
      `다른 관리자가 먼저 이 규칙을 바꿨습니다. 새로 불러온 값(${scope} · ${cidr})을 확인한 뒤 다시 저장하세요. 고치던 값은 그대로 두었습니다.`,
    ruleGone: '이미 지워진 규칙입니다. 목록을 새로 불러왔습니다.',
    discardTitle: '고친 값 버리기',
    discardMessage: '편집 중인 IP 규칙의 고친 값을 버립니다.',
    discardConfirm: '버리기',
    editorCreateTitle: '새 IP 규칙',
    editorEditTitle: 'IP 규칙 수정',
    scopeLabel: '범위',
    teamLabel: '대상 팀',
    userLabel: '대상 사용자',
    teamNumberLabel: '팀 번호',
    userNumberLabel: '사용자 번호',
    cidrLabel: 'CIDR',
    descriptionLabel: '설명',
    cidrHint:
      '프리픽스 길이까지 적습니다 — 한 주소만 허용하려면 /32(IPv4) 또는 /128(IPv6) 입니다. 예: 203.0.113.0/24 · 2001:db8::/32',
    numberPlaceholder: '숫자만',
    save: '저장',
    cancel: '취소',
    teamNoPermissionHint: '팀 목록을 볼 권한이 없어 번호로 고릅니다.',
    userNoPermissionHint: '사용자 목록을 볼 권한이 없어 번호로 고릅니다.',
    teamsFailed: '팀 목록을 불러오지 못했습니다. 편집을 다시 열면 다시 불러옵니다.',
    userSearchHint: '이름이나 아이디를 입력하세요.',
    userSearchEmpty: '맞는 사람이 없습니다.',
    userSearchFailed: '검색하지 못했습니다. 다시 입력해 보세요.',
    scopeRefRequired: '대상을 고르거나 번호를 입력하세요.',
    scopeRefDigits: '번호는 숫자만 입력하세요.',
    cidrRequired: 'CIDR 을 입력하세요.',
    cidrInvalid: IP_ACCESS_SCHEMA_MESSAGES.cidr,
    cidrTooLong: `CIDR 은 ${IP_CIDR_MAX_LENGTH}자를 넘을 수 없습니다.`,
    descriptionTooLong: `설명은 ${IP_RULE_DESCRIPTION_MAX_LENGTH}자를 넘을 수 없습니다.`,
    listTitle: '규칙 목록',
    sortLabel: '정렬: 범위 → 번호(고정)',
    createButton: '새 규칙',
    columnScope: '범위',
    columnCidr: 'CIDR',
    columnDescription: '설명',
    edit: '수정',
    remove: '삭제',
    editLabel: (rule) => `${rule} 규칙 수정`,
    removeLabel: (rule) => `${rule} 규칙 삭제`,
    editing: '편집 중',
    deadTarget: '대상 없음 — 아무에게도 걸리지 않음',
    emptyTitle: 'IP 규칙이 하나도 없습니다 — 지금은 모든 접속이 거부됩니다',
    loadFailed: 'IP 규칙을 불러오지 못했습니다.',
    retry: '다시 시도',
  })

// ── 범위 · 폼 ────────────────────────────────────────────────────────

/** 서버 `queryBigIntSchema` 와 같은 폭(부호 없는 20자리) */
const UNSIGNED_DIGITS = /^[0-9]{1,20}$/

/** 🔴 가까운 층부터 — 그 순서가 곧 평가 순서다(hangang) */
export const IP_SCOPE_ORDER: readonly IpScopeType[] = Object.freeze(['user', 'team', 'global'])

export function scopeTypeLabel(scopeType: IpScopeType, messages: IpAccessMessages): string {
  if (scopeType === 'user') return messages.scopeUser
  if (scopeType === 'team') return messages.scopeTeam
  return messages.scopeGlobal
}

export function scopeTypeItems(messages: IpAccessMessages): IpSelectItem[] {
  return IP_SCOPE_ORDER.map((value) => ({ value, title: scopeTypeLabel(value, messages) }))
}

export function emptyIpRuleForm(): IpRuleForm {
  return { scopeType: 'global', scopeRefNo: '', cidr: '', description: '' }
}

export function ruleToForm(
  rule: Pick<AdminIpRule, 'scopeType' | 'scopeRefNo' | 'cidr' | 'description'>,
): IpRuleForm {
  return {
    scopeType: rule.scopeType,
    scopeRefNo: rule.scopeRefNo == null ? '' : String(rule.scopeRefNo),
    cidr: rule.cidr,
    description: rule.description ?? '',
  }
}

export function sameIpRuleForm(a: IpRuleForm, b: IpRuleForm): boolean {
  return IP_RULE_FORM_FIELDS.every((key) => a[key] === b[key])
}

/** 🔴 범위를 바꾸면 대상을 비운다 — 팀 번호가 사용자 번호로, 본 적 없는 번호가 다시 나타나지 않게(I19) */
export function withScopeType(form: IpRuleForm, scopeType: IpScopeType): IpRuleForm {
  return form.scopeType === scopeType ? { ...form } : { ...form, scopeType, scopeRefNo: '' }
}

/**
 * 칸 오류(키 → 문구 목록). 맞으면 빈 객체. 🔴 비밀번호를 묻기 전에 본다(I14 ② · hangang).
 * CIDR 은 서버와 같은 파서(`ipCidrSchema`)다 — 화면이 통과시킨 값을 서버가 거부하는 일이 없다.
 */
export function ipRuleFormProblems(
  form: IpRuleForm,
  messages: IpAccessMessages,
): Record<string, string[]> {
  const problems: Record<string, string[]> = {}
  if (form.scopeType !== 'global') {
    const refNo = form.scopeRefNo.trim()
    if (refNo === '') problems.scopeRefNo = [messages.scopeRefRequired]
    else if (!UNSIGNED_DIGITS.test(refNo)) problems.scopeRefNo = [messages.scopeRefDigits]
  }
  const cidr = form.cidr.trim()
  if (cidr === '') problems.cidr = [messages.cidrRequired]
  else if (cidr.length > IP_CIDR_MAX_LENGTH) problems.cidr = [messages.cidrTooLong]
  else if (!ipCidrSchema.safeParse(cidr).success) problems.cidr = [messages.cidrInvalid]
  if (form.description.trim().length > IP_RULE_DESCRIPTION_MAX_LENGTH) {
    problems.description = [messages.descriptionTooLong]
  }
  return problems
}

/** 미리보기를 부를 만한가 — CIDR 이 그 파서를 통과하고, 전체가 아니면 대상 번호가 숫자다(I9) */
export function isIpRuleFormPreviewable(form: IpRuleForm): boolean {
  if (form.scopeType !== 'global' && !UNSIGNED_DIGITS.test(form.scopeRefNo.trim())) return false
  return ipCidrSchema.safeParse(form.cidr).success
}

/**
 * 미리보기 질의. 🔴 `null`(부르지 않음)과 `{}`(현행)는 다르다 — 덜 찬 폼을 현행으로 떨어뜨리면 "아무도 안 잠김"이
 * 보인다(I9). 🔴 전체 범위는 scopeRefNo 를 싣지 않는다.
 */
export function previewQueryOf(target: IpPreviewTarget): AdminIpPreviewQuery | null {
  if (target.op === null) return {}
  if (target.op === 'delete') return { op: 'delete', ruleNo: target.ruleNo }
  const { form } = target
  if (!isIpRuleFormPreviewable(form)) return null
  const query: AdminIpPreviewQuery = {
    op: target.op,
    scopeType: form.scopeType,
    cidr: form.cidr.trim(),
  }
  if (target.op === 'update') query.ruleNo = target.ruleNo
  if (form.scopeType !== 'global') query.scopeRefNo = BigInt(form.scopeRefNo.trim())
  return query
}

/** 감시용 문자열 키. 🔴 질의 하나를 문자열로 본다 — 여럿을 따로 보면 요청이 두 번 나간다(hangang) */
export function previewQueryKey(query: AdminIpPreviewQuery | null): string {
  if (query === null) return 'none'
  return [
    query.op ?? 'current',
    query.ruleNo ?? '',
    query.scopeType ?? '',
    query.scopeRefNo ?? '',
    query.cidr ?? '',
  ]
    .map(String)
    .join('|')
}

function descriptionOf(form: IpRuleForm): string | null {
  const text = form.description.trim()
  return text === '' ? null : text
}

/** 만들기 본문. bigint 는 킷 API 클라이언트 코덱이 싣는다 */
export function toCreateBody(form: IpRuleForm): AdminIpRuleCreate {
  return {
    scopeType: form.scopeType,
    scopeRefNo: form.scopeType === 'global' ? null : BigInt(form.scopeRefNo.trim()),
    cidr: form.cidr.trim(),
    description: descriptionOf(form),
  }
}

/** 🔴 수정 본문은 네 칸과 revision 을 늘 싣는다 — 생략이 "그대로"로 읽히는 부분 갱신에 기대지 않는다(I16) */
export function toUpdateBody(form: IpRuleForm, revision: number): AdminIpRuleUpdate {
  return { ...toCreateBody(form), revision }
}

// ── 대상 · 범위 표기 ─────────────────────────────────────────────────

const TEAM_PATH_SEPARATOR = ' › '

/** 팀 트리 → "본사 › 고객지원 › 상담센터" 경로 항목. 트리 순서(서버의 displayOrder) 그대로 */
export function flattenTeamPaths(tree: readonly AdminTeamNode[]): IpSelectItem[] {
  const out: IpSelectItem[] = []
  const walk = (nodes: readonly AdminTeamNode[], trail: readonly string[]): void => {
    for (const node of nodes) {
      const path = [...trail, node.teamName]
      out.push({ value: String(node.teamNo), title: path.join(TEAM_PATH_SEPARATOR) })
      walk(node.children, path)
    }
  }
  walk(tree, [])
  return out
}

export function userOptionTitle(option: Pick<IpUserOption, 'userName' | 'userId'>): string {
  return `${option.userName} (${option.userId})`
}

type RuleScope = Pick<AdminIpRule, 'scopeType' | 'scopeRefNo' | 'scopeName' | 'scopeUserId'>

/** 규칙 범위 한 줄. 🔴 대상이 지워졌으면(scopeName null) 이름을 지어내지 않는다 — 번호만(I22 · hangang) */
export function ruleScopeTitle(rule: RuleScope, messages: IpAccessMessages): string {
  const label = scopeTypeLabel(rule.scopeType, messages)
  if (rule.scopeType === 'global') return label
  if (rule.scopeName == null) return `${label} #${rule.scopeRefNo ?? '?'}`
  const name =
    rule.scopeType === 'user' && rule.scopeUserId != null
      ? userOptionTitle({ userName: rule.scopeName, userId: rule.scopeUserId })
      : rule.scopeName
  return `${label} · ${name}`
}

/** 범위 아래 줄 — 번호, 또는 대상 없음 안내. 전체는 없음 */
export function ruleScopeSub(rule: RuleScope, messages: IpAccessMessages): string | null {
  if (rule.scopeType === 'global') return null
  if (rule.scopeName == null) return messages.deadTarget
  return `#${rule.scopeRefNo}`
}

/** 편집 중인 폼의 범위 — 고른 대상 글자가 있으면 그것, 없으면 번호 */
export function formScopeTitle(
  form: IpRuleForm,
  targetTitle: string | null,
  messages: IpAccessMessages,
): string {
  const label = scopeTypeLabel(form.scopeType, messages)
  if (form.scopeType === 'global') return label
  return targetTitle != null ? `${label} · ${targetTitle}` : `${label} #${form.scopeRefNo.trim()}`
}

// ── 미리보기 문구 ────────────────────────────────────────────────────

export function layerLabel(layer: IpScopeType | null, messages: IpAccessMessages): string {
  return layer == null ? messages.layerNone : messages.layer(scopeTypeLabel(layer, messages))
}

export function statusLabel(status: IpLockoutStatus, messages: IpAccessMessages): string {
  if (status === 'locked') return messages.statusLocked
  if (status === 'passes') return messages.statusPasses
  return messages.statusUnknown
}

/** ① 현재 접속 IP. 🔴 모르면 빈 칸이 아니라 문장(I2) */
export function currentIpLine(clientIp: string | null, messages: IpAccessMessages): string {
  return clientIp == null ? messages.currentIpUnknown : messages.currentIp(clientIp)
}

/** ② 통과 여부. 🔴 ready 일 때만 — 미리보기가 없으면 통과 여부를 말하지 않는다(I3) */
export function passLine(view: IpPreviewView, messages: IpAccessMessages): string | null {
  if (view.state !== 'ready' || view.result == null) return null
  return messages.passLine(
    view.result.clientPasses,
    view.result.clientIp ?? messages.unknownAddress,
    view.op === null,
  )
}

/** 기준 줄. 🔴 안 적으면 현행 스냅샷을 변경 뒤 예측으로 읽는다(I4) */
export function basisLine(op: IpPreviewOp | null, messages: IpAccessMessages): string {
  if (op === 'create') return messages.basisCreate
  if (op === 'update') return messages.basisUpdate
  if (op === 'delete') return messages.basisDelete
  return messages.basisCurrent
}

/** ③ 요약(hangang `previewSummaryLine`). 🔴 새로 잠김 · 이미 잠김 · 판정 불가를 가른다 */
export function previewSummaryLine(
  summary: AdminIpPreview['summary'],
  messages: IpAccessMessages,
): string {
  const parts = [messages.summaryEvaluated(summary.total)]
  if (summary.newlyLocked === 0) {
    parts.push(messages.summaryNoImpact)
    if (summary.unknown > 0) parts.push(messages.summaryUnknownOnly(summary.unknown))
  } else {
    parts.push(
      messages.summaryNewlyLocked(summary.newlyLocked, summary.alreadyLocked, summary.unknown),
    )
  }
  // 🔴 잠기는 사람이 0명이어도 거부 세션 수를 적는다 — 가장 흔한 좁히기에서 그 값이 사라진다(hangang)
  parts.push(messages.summaryBlockedSessions(summary.blockedSessions))
  // 🔴 이 줄이 없으면 "전체 허용을 사무실 대역으로 좁히기"가 아무 신호도 내지 않는다(hangang)
  if (summary.ruleSetChangedOnly > 0)
    parts.push(messages.summaryRuleSetChanged(summary.ruleSetChangedOnly))
  return parts.join(' ')
}

/**
 * 세션 줄. 🔴 층이 있으면 주소 모르는 세션은 판정 불가, 없으면 주소와 무관하게 거부 확정 — 한 문장으로 찍으면
 * 죽는 세션 수를 조용히 줄여 적는다(hangang `sessionLine`).
 */
export function sessionLine(item: AdminIpPreviewItem, messages: IpAccessMessages): string {
  if (item.activeSessionCount === 0) return messages.sessionsNone
  const head = messages.sessionsBlocked(item.activeSessionCount, item.blockedSessionCount)
  if (item.unknownIpSessionCount === 0) return head
  return item.layerAfter == null
    ? `${head}${messages.sessionsUnknownDenied(item.unknownIpSessionCount)}`
    : `${head}${messages.sessionsUnknownUndetermined(item.unknownIpSessionCount)}`
}

/** 🔴 자기 자신을 "다른 사람"으로 그리지 않는다 — 서버가 고른 목록에 본인이 섞여 온다(I6 · hangang) */
function whoLine(item: AdminIpPreviewItem, self: boolean, messages: IpAccessMessages): string {
  return self
    ? `🔴 ${item.userName}(${item.userId} · ${messages.self})`
    : `${item.userName}(${item.userId})`
}

function layersOf(item: AdminIpPreviewItem, messages: IpAccessMessages): string {
  return `${layerLabel(item.layerBefore, messages)} → ${layerLabel(item.layerAfter, messages)}`
}

export function lockedItemLine(
  item: AdminIpPreviewItem,
  self: boolean,
  messages: IpAccessMessages,
): string {
  return `${whoLine(item, self, messages)} — ${layersOf(item, messages)} · ${sessionLine(item, messages)}`
}

/** 🔴 "잠긴다"와 같은 강도로 적지 않는다 — 멀쩡한 변경을 되돌리게 된다(hangang) */
export function changedItemLine(
  item: AdminIpPreviewItem,
  self: boolean,
  messages: IpAccessMessages,
): string {
  const risk =
    item.statusAfter === 'unknown'
      ? messages.ruleSetChangedUnknown
      : messages.ruleSetChangedNow(statusLabel(item.statusAfter, messages))
  return `${whoLine(item, self, messages)} — ${layersOf(item, messages)} · ${messages.ruleSetChanged} · ${risk}`
}

/** 새로 잠기는 사람. 🔴 서버 순서(위험도 순)를 다시 정렬하지 않는다 */
export function lockedItemsOf(view: IpPreviewView): AdminIpPreviewItem[] {
  if (view.state !== 'ready' || view.result == null) return []
  return view.result.items.filter((item) => item.becomesLocked)
}

/** 잠기지는 않는데 적용 규칙이 달라지는 사람 — 잠기는 사람과 겹치지 않게 */
export function changedItemsOf(view: IpPreviewView): AdminIpPreviewItem[] {
  if (view.state !== 'ready' || view.result == null) return []
  return view.result.items.filter((item) => item.ruleSetChanged && !item.becomesLocked)
}

/** ③ 자리 문구. 🔴 state 와 result 를 함께 본다 — 어긋나도 던지지 않는다(hangang) */
export function impactLine(view: IpPreviewView, messages: IpAccessMessages): string {
  if (view.state === 'ready' && view.result != null)
    return previewSummaryLine(view.result.summary, messages)
  if (view.state === 'loading') return messages.previewLoading
  if (view.state === 'pending-input') return messages.previewPendingInput
  if (view.state === 'forbidden') return messages.previewForbidden
  if (view.state === 'stale') return messages.previewStale
  return messages.previewFailed
}

// ── 전체 허용 · 관문 · 409 ───────────────────────────────────────────

/**
 * 전체 허용 CIDR 의 주소 계열(IPv4 = 4, IPv6 = 16). 전체 허용이 아니면 null.
 * 🔴 문자열 대조가 아니라 서버와 같은 파서(`parseCidr`)로 판정한다 — 프리픽스 0 이면 전체 허용이고(`::0/0` ·
 * `0.0.0.0/00` · `1.2.3.4/0` · `::ffff:0.0.0.0/96` 도 같다), 계열이 다르면 서로를 통과시키지 않는다.
 */
function globalAllowFamily(cidr: string | null): number | null {
  if (cidr == null) return null
  const parsed = parseCidr(cidr.trim())
  return parsed !== null && parsed.prefix === 0 ? parsed.net.length : null
}

export function isGlobalAllowCidr(cidr: string): boolean {
  return globalAllowFamily(cidr) !== null
}

/**
 * 이 변경이 전체 허용 행을 없애는가. before = 손대는 규칙의 지금 CIDR(만들기면 null), after = 바꾼 뒤(삭제면 null).
 * 🔴 범위가 아니라 CIDR 로 판정한다 — 범위로 재면 ㉠ 좁은 전체 규칙 삭제에 거짓 경고, ㉡ ::/0 을 좁히는 수정에 침묵(I7 · hangang).
 * 🔴 계열별로 본다 — 0.0.0.0/0 을 ::/0 으로 바꾸는 수정은 IPv4 접속자를 모두 잠그는데 서버 검사(409)도 미리보기도 잡지 못한다.
 */
export function removesGlobalAllow(before: string | null, after: string | null): boolean {
  const family = globalAllowFamily(before)
  return family !== null && globalAllowFamily(after) !== family
}

/** 관문 창의 영향 한 줄. 🔴 미리보기를 못 받았으면 "0명"이 아니라 "확인하지 못했다"(I12) */
export function gateImpact(view: IpPreviewView, messages: IpAccessMessages): string {
  if (view.state !== 'ready' || view.result == null) return messages.gateImpactUnknown
  const count = view.result.summary.newlyLocked
  return count > 0 ? messages.gateImpactLocked(count) : messages.gateImpactNone
}

export interface IpGateText {
  kind: IpGateKind
  scope: string
  cidr: string
  /** 재인증 창이 삭제 확인을 겸할 때 — 확인 창은 스스로 "되돌릴 수 없습니다"를 그린다 */
  irreversible: boolean
  globalRemoval: boolean
  view: IpPreviewView
}

/** 관문 문구 = 머리말 + (되돌릴 수 없음) + (전체 허용 경고) + 영향 한 줄 — 결정 지점에 사실을 둔다(I13) */
export function gateMessage(input: IpGateText, messages: IpAccessMessages): string {
  const parts = [messages.gateHead(input.kind, input.scope, input.cidr)]
  if (input.irreversible) parts.push(messages.irreversible)
  if (input.globalRemoval) parts.push(messages.globalAllowRemoval)
  parts.push(gateImpact(input.view, messages))
  return parts.join(' ')
}

/**
 * 409 ERR_COMMON_CONFLICT 알림 글자. 🔴 한 코드가 두 뜻(자기 잠금 · 전권자 잔존)을 나른다 — 킷 문구로 바꾸지 않고
 * 서버 문구를 그대로 쓴다(I17 · hangang). 자기 잠금이면 서버가 실은 details.clientIp 를 덧붙인다.
 */
export function conflictAlertText(
  error: Pick<ApiError, 'message' | 'details'>,
  messages: IpAccessMessages,
): string {
  const text = error.message.trim()
  const message = text === '' ? messages.conflictWithoutMessage : text
  const details = error.details
  const clientIp =
    typeof details === 'object' && details !== null && 'clientIp' in details
      ? (details as { clientIp?: unknown }).clientIp
      : null
  return typeof clientIp === 'string' && clientIp !== ''
    ? messages.conflictWithIp(message, clientIp)
    : message
}
