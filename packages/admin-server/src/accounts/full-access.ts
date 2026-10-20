import { ALL_PERMISSION } from '@ssworks/admin-shared'
import type { AdminPermissionMap } from '../auth/permission-slots.js'
import { validationError } from '../http/validation.js'
import { ACCOUNT_MESSAGES } from './errors.js'
import type { AdminPermissionCatalog } from './options.js'

// 정본: 없음 — 2g 스펙 F3 · F6(ringside 보고 §3). 2f-1 README 의 "ipAccess.manage 는 전체 권한 관리자에게만" 을 킷이 강제한다.

/**
 * 🔴 전권 전용 키(카탈로그 `fullAccessOnly`)는 `'*'` 역할만 갖는다(2g F3). 정규화를 지난 권한을 받는다 — `'*'` 가 있으면
 * 정확히 `['*']` 라 걸리지 않는다. 어기면 400 `ERR_COMMON_VALIDATION` + `issues[{ path: ['permissions'] }]`.
 * 본문만 보는 검사라 트랜잭션 앞에서 부른다(F4). 이름 · 기본 표시만 고치는 수정 · 사용자 배정은 부르지 않는다(결정 ④).
 */
export function assertFullAccessOnly(
  catalog: Pick<AdminPermissionCatalog, 'fullAccessOnly'>,
  permissions: readonly string[],
): void {
  if (permissions.includes(ALL_PERMISSION)) return
  const marked = new Set<string>(catalog.fullAccessOnly)
  if (!permissions.some((permission) => marked.has(permission))) return
  throw validationError(
    [{ path: ['permissions'], code: 'custom', message: ACCOUNT_MESSAGES.fullAccessOnly }],
    ACCOUNT_MESSAGES.fullAccessOnly,
  )
}

/**
 * 🔴 기동 검사(2g F6) — IP 모듈을 켠 앱에서 `ipAccess.manage` 의 키는 전권 전용이어야 한다. 그 슬롯은 사실상 전권급이다 — 좁은
 * 보유자도 마지막 도달 가능 전권자를 뺀 전권자를 가두고 일반 관리자를 모두 잠글 수 있다(2f-1 스펙 §9-2 s1). 슬롯이 없으면
 * IP 모듈 자신의 슬롯 검사가 멈추고, 키가 `'*'` 면 이미 전권만 가진다.
 */
export function assertIpManageFullAccessOnly(
  permissions: Readonly<AdminPermissionMap> | undefined,
  catalog: Pick<AdminPermissionCatalog, 'fullAccessOnly'>,
  ipAccess: boolean,
): void {
  if (!ipAccess) return
  const key = permissions?.['ipAccess.manage']
  if (key === undefined || key === ALL_PERMISSION || catalog.fullAccessOnly.includes(key)) return
  throw new Error(
    `AdminRolesModule — IP 접근 제어를 켰다면 ipAccess.manage 의 키(${key})를 전권 전용으로 표시한다: definePermissions(…, { fullAccessOnly: ['${key}'] }). 그 슬롯은 사실상 전권급이다 — 일반 역할이 가지면 다른 관리자를 모두 잠글 수 있다.`,
  )
}
