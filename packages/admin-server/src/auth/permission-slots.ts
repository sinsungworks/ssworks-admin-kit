import { SetMetadata, type CustomDecorator } from '@nestjs/common'
import { PERMISSION_SLOT } from '../tokens.js'

// 정본: 없음 — 패키지 라우트의 권한 키를 쓰는 쪽이 잇는 자리(2c 스펙 ① P1). 네 정본은 라우트에 자기 키를 박았다
//   (hangang org.users:read · gise account.session:manage · axion sessions:read · crm setting.session:read).
// 🔴 패키지는 권한 키를 하드코딩하지 않는다 — 슬롯 이름만 선언하고 키는 AdminServerOptions.permissions 가 준다.

/** 2c 의 셋 + 2d 의 역할 둘 · 사용자 둘 + 2e-1 의 팀 둘 + 2e-2 의 약관 둘 + 2f-1 의 IP 둘 — 유니온이 늘어나는 것은 하위 호환이다 */
export type AdminPermissionSlot =
  | 'sessions.read'
  | 'sessions.manage'
  | 'auditLogs.read'
  | 'roles.read'
  | 'roles.manage'
  | 'users.read'
  | 'users.manage'
  | 'teams.read'
  | 'teams.manage'
  | 'legal.read'
  | 'legal.publish'
  | 'ipAccess.read'
  | 'ipAccess.manage'

export const ADMIN_PERMISSION_SLOTS: readonly AdminPermissionSlot[] = Object.freeze([
  'sessions.read',
  'sessions.manage',
  'auditLogs.read',
  'roles.read',
  'roles.manage',
  'users.read',
  'users.manage',
  'teams.read',
  'teams.manage',
  'legal.read',
  'legal.publish',
  'ipAccess.read',
  'ipAccess.manage',
])

export type AdminPermissionMap = Partial<Record<AdminPermissionSlot, string>>

/**
 * 내부 — 패키지 라우트가 권한 슬롯을 선언한다. index 에 내지 않는다.
 * 여럿이면 "하나라도"(2d 스펙 B13 — 역할 목록은 `roles.read` ∨ `users.read`). 이어지지 않은 슬롯은 거짓으로 센다.
 * 🔴 권한 선언과 같은 층이라 `@SelfOnly` 보다 먼저 판정한다(2b 스펙 §14 R3).
 */
export function RequirePermissionSlot(
  ...slots: [AdminPermissionSlot, ...AdminPermissionSlot[]]
): CustomDecorator<string> {
  return SetMetadata(PERMISSION_SLOT, Object.freeze([...slots]))
}

/** 코어 옵션의 `permissions` 를 해석한다. 🔴 모르는 슬롯(오타) · 빈 키는 기동에서 멈춘다 — 조용히 무시되면 403 만 남는다 */
export function resolvePermissionMap(
  permissions: AdminPermissionMap | undefined,
): Readonly<AdminPermissionMap> {
  const known: readonly string[] = ADMIN_PERMISSION_SLOTS
  const resolved: AdminPermissionMap = {}
  for (const [slot, key] of Object.entries(permissions ?? {})) {
    if (!known.includes(slot)) {
      throw new Error(
        `permissions 에 모르는 권한 슬롯이 있다: ${slot} — 쓸 수 있는 슬롯: ${ADMIN_PERMISSION_SLOTS.join(', ')}`,
      )
    }
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error(`permissions['${slot}'] 는 빈 문자열이 아닌 권한 키여야 한다.`)
    }
    resolved[slot as AdminPermissionSlot] = key
  }
  return Object.freeze(resolved)
}

/** 기동 검사 — 모듈이 쓰는 슬롯이 모두 이어졌는가. 빠진 것을 모아 한 번에 던진다(2c 스펙 §5-8) */
export function assertPermissionSlots(
  permissions: Readonly<AdminPermissionMap> | undefined,
  slots: readonly AdminPermissionSlot[],
  moduleName: string,
): void {
  const missing = slots.filter((slot) => {
    const key = permissions?.[slot]
    return typeof key !== 'string' || key.trim() === ''
  })
  if (missing.length === 0) return
  const example = missing.map((slot) => `'${slot}': '<프로젝트 권한 키>'`).join(', ')
  throw new Error(
    `${moduleName} 의 권한 슬롯이 이어지지 않았다: ${missing.join(', ')} — AdminServerModule 옵션에 permissions: { ${example} } 를 더한다.`,
  )
}
