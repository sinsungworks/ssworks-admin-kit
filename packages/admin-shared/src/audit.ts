import { z } from 'zod'
import { createQuerySchema } from './pagination.js'

// 감사 계약 — Phase 2 서버(@ssworks/admin-server AdminAuditModule)와 쓰는 쪽 감사 화면이 같은 이름 · 라벨을 본다.
//
// 정본: hangang-home packages/shared/src/constants/audit.const.ts(액션 · 라벨 · 대상) + 이 패키지 error-codes.ts
//       `defineErrorCodes`(코어 + 프로젝트 병합 틀)
// 바꾼 점:
//  - 코어 액션은 인증 · 세션(2c) · 역할(2d). 사용자 · 팀 · IP 액션은 2d-2~2f 가 더한다. 프로젝트 액션은 `defineAuditCatalog`.
//  - `session.revoke.others` 를 더했다(gise "다른 세션 모두").
//  - 행의 행위자는 `actorUserNo`(2c 스펙 B5). `action` 은 열린 문자열 — 새 판이 쓴 행도 옛 화면이 읽는다(gise).
//  - 🔴 `.refine()` 을 걸지 않는다(3b §11 R1) — 기간 순서는 서버가 본다(2c 스펙 B14).

export const AUDIT_ACTION_MAX_LENGTH = 128
export const AUDIT_TARGET_TYPE_MAX_LENGTH = 64

export const CoreAuditActions = {
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAIL: 'auth.login.fail',
  AUTH_LOGIN_BLOCKED_INACTIVE: 'auth.login.blocked.inactive',
  AUTH_LOGIN_BLOCKED_IP: 'auth.login.blocked.ip',
  AUTH_LOGIN_BLOCKED_LOCKED: 'auth.login.blocked.locked',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_TOKEN_REFRESH: 'auth.token.refresh',
  AUTH_TOKEN_REUSE: 'auth.token.reuse',
  AUTH_PASSWORD_CHANGE: 'auth.password.change',
  AUTH_ACCESS_BLOCKED_IP: 'auth.access.blocked.ip',
  SESSION_REVOKE: 'session.revoke',
  SESSION_REVOKE_USER: 'session.revoke.user',
  SESSION_REVOKE_SELF: 'session.revoke.self',
  SESSION_REVOKE_OTHERS: 'session.revoke.others',
  ROLE_CREATE: 'org.role.create',
  ROLE_UPDATE: 'org.role.update',
  ROLE_DELETE: 'org.role.delete',
  ROLE_MOVE: 'org.role.move',
} as const

export type CoreAuditAction = (typeof CoreAuditActions)[keyof typeof CoreAuditActions]

export const CoreAuditTargets = { USER: 'user', SESSION: 'session', ROLE: 'role' } as const

export type CoreAuditTarget = (typeof CoreAuditTargets)[keyof typeof CoreAuditTargets]

/** hangang 문구. 🔴 액션마다 하나 — 빠지면 화면 필터 목록에서 조용히 사라진다(crm 39건) */
export const CORE_AUDIT_ACTION_LABELS: Readonly<Record<CoreAuditAction, string>> = Object.freeze({
  'auth.login.success': '로그인 성공',
  'auth.login.fail': '로그인 실패',
  'auth.login.blocked.inactive': '로그인 차단 (퇴사 계정)',
  'auth.login.blocked.ip': '로그인 차단 (허용되지 않은 IP)',
  'auth.login.blocked.locked': '로그인 차단 (계정 잠김)',
  'auth.logout': '로그아웃',
  'auth.token.refresh': '토큰 갱신',
  'auth.token.reuse': '갱신 토큰 재사용 탐지 (전 세션 폐기)',
  'auth.password.change': '본인 비밀번호 변경',
  'auth.access.blocked.ip': '접근 차단 (허용되지 않은 IP)',
  'session.revoke': '세션 강제 종료',
  'session.revoke.user': '사용자 전 세션 강제 종료',
  'session.revoke.self': '본인 세션 종료',
  'session.revoke.others': '본인 다른 세션 모두 종료',
  'org.role.create': '역할 생성',
  'org.role.update': '역할 수정',
  'org.role.delete': '역할 삭제',
  'org.role.move': '역할 표시 순서 변경',
})

export const CORE_AUDIT_TARGET_LABELS: Readonly<Record<CoreAuditTarget, string>> = Object.freeze({
  user: '사용자',
  session: '세션',
  role: '역할',
})

/**
 * 🔴 기본 타입 인자는 넓은 `Record<string, string>` 이다 — 프로젝트 카탈로그(`AuditCatalog<{ X: 'x' }>`)를 서버 옵션
 *    `audit.catalog`(타입 `AuditCatalog`)에 넣을 수 있어야 한다. 좁은 기본값이면 타입 술어 · 값 배열이 할당되지 않는다.
 */
export interface AuditCatalog<
  A extends Record<string, string> = Record<string, string>,
  T extends Record<string, string> = Record<string, string>,
> {
  readonly AuditActions: Readonly<typeof CoreAuditActions> & Readonly<A>
  readonly AuditTargets: Readonly<typeof CoreAuditTargets> & Readonly<T>
  readonly ACTION_VALUES: readonly (CoreAuditAction | A[keyof A])[]
  readonly TARGET_VALUES: readonly (CoreAuditTarget | T[keyof T])[]
  isAuditAction(value: string): value is CoreAuditAction | A[keyof A]
  isAuditTarget(value: string): value is CoreAuditTarget | T[keyof T]
  /** 모르는 값(옛 행 · 지운 액션)은 원문 그대로 */
  labelOf(action: string): string
  targetLabelOf(target: string): string
}

export interface AuditCatalogInput<
  A extends Record<string, string>,
  T extends Record<string, string>,
> {
  actions?: A
  targets?: T
  /** 프로젝트 액션은 전부 필수, 코어 액션은 덮어쓰기(선택) */
  labels?: Record<A[keyof A], string> & Partial<Record<CoreAuditAction, string>>
  targetLabels?: Record<T[keyof T], string> & Partial<Record<CoreAuditTarget, string>>
}

function overlappingKeys(project: object, core: object): string[] {
  return Object.keys(project).filter((key) => Object.hasOwn(core, key))
}

function duplicatedValues(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index)
}

function lookup(table: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

/**
 * 프로젝트 감사 액션 · 대상을 코어에 병합한다(`defineErrorCodes` 와 같은 틀).
 *
 * ```ts
 * export const auditCatalog = defineAuditCatalog({
 *   actions: { BOARD_POST_CREATE: 'board.post.create' },
 *   targets: { POST: 'post' },
 *   labels: { 'board.post.create': '게시글 작성' },
 *   targetLabels: { post: '게시글' },
 * })
 * ```
 *
 * 던진다: 코어와 키가 겹칠 때, 값이 코어 · 서로와 겹칠 때, 라벨이 빠졌을 때, 폭(액션 128 · 대상 64)을 넘을 때.
 */
export function defineAuditCatalog<
  const A extends Record<string, string> = Record<never, never>,
  const T extends Record<string, string> = Record<never, never>,
>(input: AuditCatalogInput<A, T> = {}): AuditCatalog<A, T> {
  type Action = CoreAuditAction | A[keyof A]
  type Target = CoreAuditTarget | T[keyof T]

  const actions = input.actions ?? ({} as A)
  const targets = input.targets ?? ({} as T)
  const problems: string[] = []

  for (const key of overlappingKeys(actions, CoreAuditActions))
    problems.push(`코어 액션 키와 겹친다: ${key}`)
  for (const key of overlappingKeys(targets, CoreAuditTargets))
    problems.push(`코어 대상 키와 겹친다: ${key}`)

  const AuditActions = Object.freeze({ ...CoreAuditActions, ...actions })
  const AuditTargets = Object.freeze({ ...CoreAuditTargets, ...targets })
  const ACTION_VALUES = Object.freeze(Object.values(AuditActions) as Action[])
  const TARGET_VALUES = Object.freeze(Object.values(AuditTargets) as Target[])

  for (const value of duplicatedValues(ACTION_VALUES)) problems.push(`액션 값이 겹친다: ${value}`)
  for (const value of duplicatedValues(TARGET_VALUES)) problems.push(`대상 값이 겹친다: ${value}`)
  for (const value of ACTION_VALUES) {
    if (value.length === 0 || value.length > AUDIT_ACTION_MAX_LENGTH) {
      problems.push(`액션은 1~${AUDIT_ACTION_MAX_LENGTH}자: ${value}`)
    }
  }
  for (const value of TARGET_VALUES) {
    if (value.length === 0 || value.length > AUDIT_TARGET_TYPE_MAX_LENGTH) {
      problems.push(`대상 종류는 1~${AUDIT_TARGET_TYPE_MAX_LENGTH}자: ${value}`)
    }
  }

  const labels: Readonly<Record<string, string>> = Object.freeze({
    ...CORE_AUDIT_ACTION_LABELS,
    ...(input.labels ?? {}),
  })
  const targetLabels: Readonly<Record<string, string>> = Object.freeze({
    ...CORE_AUDIT_TARGET_LABELS,
    ...(input.targetLabels ?? {}),
  })
  for (const value of ACTION_VALUES) {
    if (!lookup(labels, value)) problems.push(`라벨이 없는 액션: ${value}`)
  }
  for (const value of TARGET_VALUES) {
    if (!lookup(targetLabels, value)) problems.push(`라벨이 없는 대상: ${value}`)
  }

  if (problems.length > 0) throw new Error(`defineAuditCatalog: ${problems.join(' / ')}`)

  const actionSet: ReadonlySet<string> = new Set(ACTION_VALUES)
  const targetSet: ReadonlySet<string> = new Set(TARGET_VALUES)
  return {
    AuditActions,
    AuditTargets,
    ACTION_VALUES,
    TARGET_VALUES,
    isAuditAction: (value): value is Action => actionSet.has(value),
    isAuditTarget: (value): value is Target => targetSet.has(value),
    labelOf: (action) => lookup(labels, action) ?? action,
    targetLabelOf: (target) => lookup(targetLabels, target) ?? target,
  }
}

export const coreAuditCatalog: AuditCatalog = defineAuditCatalog()

const UNSIGNED_DIGITS = /^[0-9]{1,20}$/
const UNSIGNED_BIGINT_MAX = 18446744073709551615n

/**
 * 쿼리스트링의 bigint(2c 스펙 B13). admin-ui `serializeParams` 는 bigint 를 십진 문자열로 보낸다.
 * 🔴 `z.coerce.bigint()` 를 쓰지 않는다 — `BigInt('')` 는 `0n`, `BigInt(' 3 ')` 은 `3n` 이다(2c 스펙 §14 R1-5).
 */
export const queryBigIntSchema = z.union([
  z.bigint().min(0n).max(UNSIGNED_BIGINT_MAX),
  z
    .string()
    .regex(UNSIGNED_DIGITS)
    .transform((value) => BigInt(value))
    .pipe(z.bigint().max(UNSIGNED_BIGINT_MAX)),
])

export const adminAuditLogSchema = z.object({
  logNo: z.bigint(),
  /** 행위자. null = 계정을 특정할 수 없음(없는 아이디의 로그인 실패) */
  actorUserNo: z.bigint().nullable(),
  actorUserId: z.string().nullable(),
  actorUserName: z.string().nullable(),
  sessionNo: z.bigint().nullable(),
  /** 🔴 열린 문자열 — 카탈로그 밖의 옛 · 새 액션도 읽는다. 라벨은 `catalog.labelOf` */
  action: z.string(),
  targetType: z.string().nullable(),
  targetRefNo: z.bigint().nullable(),
  method: z.string(),
  path: z.string(),
  statusCode: z.number().int(),
  /** 실패면 응답 봉투의 code */
  errorCode: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** 소독 · bigint 접기를 거친 JSON — bigint 는 십진 문자열이다 */
  meta: z.unknown(),
  createAt: z.iso.datetime(),
})

export type AdminAuditLog = z.infer<typeof adminAuditLogSchema>

/** `GET /admin/audit-logs` — 기간은 `[from, to)` 반열림. `actionMatch` 기본 'prefix'(서버) */
export const adminAuditLogQuerySchema = createQuerySchema({
  sortableColumns: ['createAt'] as const,
  defaultSortColumn: 'createAt',
  filterShape: {
    actorUserNo: queryBigIntSchema,
    action: z.string().min(1).max(AUDIT_ACTION_MAX_LENGTH),
    actionMatch: z.enum(['prefix', 'exact']),
    targetType: z.string().min(1).max(AUDIT_TARGET_TYPE_MAX_LENGTH),
    targetRefNo: queryBigIntSchema,
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  },
})

export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>
