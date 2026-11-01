import {
  DEFAULT_MEDIA_PATH,
  DEFAULT_UPLOAD_POLICY,
  UPLOAD_PURPOSE_PATTERN,
  type UploadPolicy,
} from '@ssworks/admin-shared'
import {
  ADMIN_PERMISSION_SLOTS,
  type AdminPermissionMap,
  type AdminPermissionSlot,
} from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import type { AdminObjectStorage } from '../storage/object-storage.js'

// 정본: 없음 — 2h 스펙 U7 · U14 · S6. 약관 종류 옵션(legal/options.ts)과 같은 방식(문제를 모아 한 번에 · 기동에서 멈춤).
// 🔴 legal 용도는 AdminLegalModule 이 등록돼 있을 때만 자동으로 들어간다 — 앱이 같은 이름을 적으면 멈춘다(두 곳이 다른 권한을 주장할 수 없게).
// 🔴 mediaPath 는 '/media' 로 끝나야 한다 — 중계 컨트롤러 경로가 'media' 로 고정이라(데코레이터는 정적) 앞 조각만 앱 전역 접두사다.

export interface AdminUploadPurposeOptions {
  /** 패키지 슬롯 — 그 슬롯에 이어진 권한 키를 가져야 이 용도로 올릴 수 있다 */
  slot?: AdminPermissionSlot
  /** 앱 권한 키(AND) — 슬롯 대신. 둘 중 하나만 */
  permissions?: readonly string[]
}

export interface AdminUploadsOptions {
  /** 객체 저장소 — `createFileSystemStorage` · `createS3ObjectStorage`(`@ssworks/admin-server/storage/s3`) */
  storage: AdminObjectStorage
  /** 본문에 적는 공개 경로. 기본 '/api/media'. 🔴 '/media' 로 끝나야 한다 — 앞은 앱 전역 접두사. 조각은 영숫자 · '_' · '-' 만(점 없음) */
  mediaPath?: string
  /** 앱 용도 → 권한. `legal` 은 AdminLegalModule 이 자동 등록한다(적으면 기동에서 멈춤) */
  purposes?: Record<string, AdminUploadPurposeOptions>
  /** admin-shared DEFAULT_UPLOAD_POLICY 를 덮는다 */
  policy?: Partial<UploadPolicy>
  /** 정리 잡 주기. 기본 { intervalMinutes: 60 }. false 면 앱이 `AdminUploadsService.sweep()` 을 직접 돌린다 */
  sweep?: { intervalMinutes?: number } | false
}

export interface UploadPurposeGrant {
  readonly slot: AdminPermissionSlot | null
  readonly permissions: readonly string[]
}

export interface ResolvedUploadsConfig {
  readonly storage: AdminObjectStorage
  readonly mediaPath: string
  readonly purposes: ReadonlyMap<string, UploadPurposeGrant>
  readonly policy: Readonly<UploadPolicy>
  /** null = 끔 */
  readonly sweepIntervalMs: number | null
}

const MEDIA_PATH = /^(\/[A-Za-z0-9_-]+)*\/media$/
const POSITIVE_INT = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

function isStorage(value: unknown): value is AdminObjectStorage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return ['put', 'get', 'delete'].every((name) => typeof candidate[name] === 'function')
}

export function resolveUploadsConfig(
  options: Pick<AdminServerOptions, 'uploads' | 'permissions'>,
  hasLegalModule: boolean,
  moduleName: string,
): ResolvedUploadsConfig {
  const uploads: unknown = options.uploads
  if (typeof uploads !== 'object' || uploads === null) {
    throw new Error(
      `${moduleName} 은 uploads 옵션이 있어야 한다 — AdminServerModule 옵션에 uploads: { storage: createFileSystemStorage({ root: './uploads' }) } 를 더한다.`,
    )
  }
  const input = uploads as Record<string, unknown>
  const permissions: Readonly<AdminPermissionMap> = options.permissions ?? {}
  const problems: string[] = []

  if (!isStorage(input.storage)) {
    problems.push(
      'uploads.storage 는 put · get · delete 를 가진 저장소여야 한다(createFileSystemStorage · createS3ObjectStorage)',
    )
  }

  const mediaPath = input.mediaPath === undefined ? DEFAULT_MEDIA_PATH : input.mediaPath
  if (typeof mediaPath !== 'string' || !MEDIA_PATH.test(mediaPath)) {
    problems.push(
      `uploads.mediaPath 는 '/media' 로 끝나는 경로여야 한다(예: '/api/media'): ${JSON.stringify(mediaPath)}`,
    )
  }

  const purposes = new Map<string, UploadPurposeGrant>()
  if (hasLegalModule) purposes.set('legal', { slot: 'legal.publish', permissions: [] })
  const declared = input.purposes
  if (declared !== undefined) {
    if (typeof declared !== 'object' || declared === null) {
      problems.push('uploads.purposes 는 { 용도: { slot | permissions } } 객체여야 한다')
    } else {
      for (const [name, raw] of Object.entries(declared as Record<string, unknown>)) {
        const place = UPLOAD_PURPOSE_PATTERN.test(name)
          ? `uploads.purposes.${name}`
          : `uploads.purposes[${JSON.stringify(name)}]`
        if (name === 'legal' && hasLegalModule) {
          problems.push(`${place} — legal 용도는 AdminLegalModule 이 자동으로 등록한다(빼라)`)
          continue
        }
        if (!UPLOAD_PURPOSE_PATTERN.test(name)) {
          problems.push(`${place} — 용도는 영숫자 · '_' 1~32자여야 한다`)
          continue
        }
        const grant = resolveGrant(raw, permissions, place, problems)
        if (grant !== null) purposes.set(name, grant)
      }
    }
  }

  const policy = resolvePolicy(input.policy, problems)
  const sweepIntervalMs = resolveSweep(input.sweep, problems)

  if (problems.length > 0) {
    throw new Error(`${moduleName} 의 uploads 옵션이 맞지 않다 — ${problems.join(' / ')}`)
  }
  return Object.freeze({
    storage: input.storage as AdminObjectStorage,
    mediaPath: mediaPath as string,
    purposes,
    policy,
    sweepIntervalMs,
  })
}

function resolveGrant(
  raw: unknown,
  permissions: Readonly<AdminPermissionMap>,
  place: string,
  problems: string[],
): UploadPurposeGrant | null {
  if (typeof raw !== 'object' || raw === null) {
    problems.push(`${place} — { slot } 또는 { permissions } 객체여야 한다`)
    return null
  }
  const { slot, permissions: keys } = raw as { slot?: unknown; permissions?: unknown }
  if (slot !== undefined && keys !== undefined) {
    problems.push(`${place} — slot 과 permissions 중 하나만 적는다`)
    return null
  }
  if (slot === undefined && keys === undefined) {
    problems.push(`${place} — slot 또는 permissions 가 있어야 한다`)
    return null
  }
  if (slot !== undefined) {
    const known: readonly string[] = ADMIN_PERMISSION_SLOTS
    if (typeof slot !== 'string' || !known.includes(slot)) {
      problems.push(`${place} — 모르는 슬롯: ${String(slot)}`)
      return null
    }
    const key = permissions[slot as AdminPermissionSlot]
    if (typeof key !== 'string' || key.trim() === '') {
      problems.push(`${place} — 슬롯 ${slot} 가 permissions 에 이어지지 않았다`)
      return null
    }
    return Object.freeze({ slot: slot as AdminPermissionSlot, permissions: Object.freeze([]) })
  }
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.some((key) => typeof key !== 'string' || key.trim() === '')
  ) {
    problems.push(`${place} — permissions 는 빈 문자열이 아닌 권한 키의 배열이어야 한다`)
    return null
  }
  return Object.freeze({ slot: null, permissions: Object.freeze([...(keys as string[])]) })
}

function resolvePolicy(raw: unknown, problems: string[]): Readonly<UploadPolicy> {
  const policy: UploadPolicy = { ...DEFAULT_UPLOAD_POLICY }
  if (raw === undefined) return Object.freeze(policy)
  if (typeof raw !== 'object' || raw === null) {
    problems.push('uploads.policy 는 객체여야 한다')
    return Object.freeze(policy)
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.hasOwn(DEFAULT_UPLOAD_POLICY, key)) {
      problems.push(`uploads.policy 에 모르는 키: ${key}`)
      continue
    }
    const name = key as keyof UploadPolicy
    if (name === 'webpQuality') {
      if (!POSITIVE_INT(value) || value > 100) {
        problems.push(`uploads.policy.webpQuality 는 1~100 의 정수여야 한다: ${String(value)}`)
        continue
      }
    } else if (!POSITIVE_INT(value)) {
      problems.push(`uploads.policy.${name} 는 1 이상의 정수여야 한다: ${String(value)}`)
      continue
    }
    policy[name] = value
  }
  return Object.freeze(policy)
}

function resolveSweep(raw: unknown, problems: string[]): number | null {
  if (raw === false) return null
  if (raw === undefined) return 60 * 60_000
  if (typeof raw !== 'object' || raw === null) {
    problems.push('uploads.sweep 는 false 또는 { intervalMinutes } 여야 한다')
    return null
  }
  const minutes = (raw as { intervalMinutes?: unknown }).intervalMinutes
  if (minutes === undefined) return 60 * 60_000
  if (!POSITIVE_INT(minutes)) {
    problems.push(`uploads.sweep.intervalMinutes 는 1 이상의 정수여야 한다: ${String(minutes)}`)
    return null
  }
  return minutes * 60_000
}
