import type { PermissionCatalog } from '@ssworks/admin-shared'
import type { AdminServerOptions } from '../options.js'

// 정본: 없음 — 2d 스펙 ① C1 · ⑦ R1 · B4 · B12. 역할 · 사용자 모듈이 함께 읽는 코어 옵션의 해석.

/**
 * 서버가 쓰는 카탈로그의 부분(2d 스펙 B4). admin-shared `definePermissions()` 결과가 그대로 들어간다(§14 R1-1).
 * `permissionListSchema` 를 쓰지 않는다 — zod 열거형 문구가 카탈로그 값 전부를 나열한다(R1-7).
 */
export type AdminPermissionCatalog = Pick<
  PermissionCatalog<Record<string, string>, string>,
  'ALL_PERMISSION_VALUES' | 'isPermission' | 'implies' | 'normalize'
>

export interface ResolvedAccountsConfig {
  readonly catalog: AdminPermissionCatalog
  /** 켜면 역할 · 사용자 쓰기가 본문 currentPassword 로 재인증한다(⑦ R1) */
  readonly reauth: boolean
}

/**
 * 🔴 기동에서 멈춘다: 카탈로그 없음 · 모양이 아님, `reauth` 가 boolean 이 아님, 슬롯 맵의 키가 카탈로그 밖(B12 — 오타가
 *    조용히 403 으로 남지 않게. 2c R4 는 모르는 **슬롯** 이름을, 이것은 모르는 **키**를 막는다).
 */
export function resolveAccountsConfig(
  options: Pick<AdminServerOptions, 'permissionCatalog' | 'reauth' | 'permissions'>,
  moduleName: string,
): ResolvedAccountsConfig {
  const catalog = options.permissionCatalog
  if (catalog === undefined || catalog === null) {
    throw new Error(
      `${moduleName} 은 permissionCatalog 옵션이 있어야 한다 — admin-shared definePermissions() 결과를 AdminServerModule 옵션에 넘긴다.`,
    )
  }
  if (!isCatalog(catalog)) {
    throw new Error(
      `${moduleName} 의 permissionCatalog 모양이 다르다 — admin-shared definePermissions() 결과인지, admin-shared 가 implies · normalize 를 내는 판인지(설치가 둘이 아닌지) 확인한다.`,
    )
  }
  if (options.reauth !== undefined && typeof options.reauth !== 'boolean') {
    throw new Error('reauth 는 true · false 여야 한다.')
  }
  const strays = Object.entries(options.permissions ?? {})
    .filter(([, key]) => typeof key === 'string' && !catalog.isPermission(key))
    .map(([slot, key]) => `${slot} → ${String(key)}`)
  if (strays.length > 0) {
    throw new Error(`permissions 의 키가 permissionCatalog 에 없다(오타?): ${strays.join(', ')}`)
  }
  return Object.freeze({ catalog, reauth: options.reauth === true })
}

function isCatalog(value: unknown): value is AdminPermissionCatalog {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    Array.isArray(candidate.ALL_PERMISSION_VALUES) &&
    typeof candidate.isPermission === 'function' &&
    typeof candidate.normalize === 'function' &&
    typeof candidate.implies === 'object' &&
    candidate.implies !== null
  )
}
