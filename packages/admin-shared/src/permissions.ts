import { z } from 'zod'

/**
 * 권한 카탈로그 팩토리.
 *
 * 정본: ssworks-gise-home `packages/shared/src/auth/permissions.ts` (판정 함수·zod 폐집합)
 *       + hangang-home `composables/usePermission.ts` 의 `PermissionCheck` 인터페이스.
 *
 * 네 참조 프로젝트의 권한 규칙은 전부 같다 — `'*'` 는 접두 와일드카드가 아니라
 * **정확히 이 한 문자열**이고, 가지고 있으면 모든 판정을 단락한다. AND(`hasPermission`)는
 * `every`, OR(`hasAnyPermission`)는 `some` 이다.
 *
 * 🔴 **빈 요구 목록은 둘 다 false 다(fail-closed).** crm·axion·hangang 은 `[].every()` 가
 *    참이라 AND 가 빈 인자에 통과했고, gise 만 false 로 막았다. 패키지는 gise 규칙을
 *    따른다 — 데코레이터나 가드를 빈 인자로 선언하는 실수가 "아무 권한도 필요 없음" 으로
 *    읽히면 안 된다. 메뉴 필터처럼 "선언이 없으면 통과" 가 맞는 자리는 부르는 쪽이 길이를
 *    먼저 본다.
 *
 * 카탈로그 **내용**은 프로젝트가 소유한다. 패키지는 모양과 판정만 제공한다:
 *
 * ```ts
 * export const permissions = definePermissions({
 *   ORG_USERS_READ: 'org.users:read',
 *   ORG_USERS_WRITE: 'org.users:write',
 * })
 * export const { PERMISSIONS, ALL_PERMISSION_VALUES, permissionSchema } = permissions
 * export type Permission = PermissionOf<typeof permissions>
 * ```
 */

/** 전체 권한. 최고 관리자 역할에만 부여한다. */
export const ALL_PERMISSION = '*' as const
export type AllPermission = typeof ALL_PERMISSION

/**
 * 메뉴·가드·화면이 주입받는 판정기. `usePermission()` 의 반환과 같은 모양이다.
 * 메뉴 필터와 라우트 가드가 **같은 판정기**를 받아야 "메뉴는 보이는데 라우트는 403" 이
 * 생기지 않는다.
 */
export interface PermissionCheck<P extends string = string> {
  /** 나열한 권한을 **전부** 가져야 참 (AND). 빈 인자는 거짓. */
  hasPermission(...required: P[]): boolean
  /** 나열한 권한 중 **하나라도** 있으면 참 (OR). 빈 인자는 거짓. */
  hasAnyPermission(...required: P[]): boolean
}

/**
 * AND 판정 — 요구한 권한을 전부 가져야 true.
 *
 * `granted` 를 `readonly string[]` 로 받는 이유는 DB 에서 읽은 검증 전 문자열 배열을
 * 그대로 넘길 수 있게 하기 위함이다.
 */
export function hasPermission(granted: readonly string[], ...required: readonly string[]): boolean {
  if (granted.includes(ALL_PERMISSION)) return true
  if (required.length === 0) return false
  return required.every((permission) => granted.includes(permission))
}

/** OR 판정 — 요구한 권한 중 하나라도 있으면 true. 빈 요구 목록은 false. */
export function hasAnyPermission(
  granted: readonly string[],
  ...required: readonly string[]
): boolean {
  if (granted.includes(ALL_PERMISSION)) return true
  if (required.length === 0) return false
  return required.some((permission) => granted.includes(permission))
}

/**
 * 지배 판정 — `granted` 에 `'*'` 가 있으면 참, 아니면 `target` 의 모든 권한이 `granted`
 * 에 있을 때 참이다. 빈 `target` 은 참이다.
 *
 * 역할 편집 화면이 "자기보다 넓은 권한을 부여하는" 권한 상승을 막을 때 쓴다.
 */
export function coversPermissions(granted: readonly string[], target: readonly string[]): boolean {
  if (granted.includes(ALL_PERMISSION)) return true
  return target.every((permission) => granted.includes(permission))
}

/** `granted` 를 지연 평가하는 판정기를 만든다. 스토어·요청 주체 어느 쪽에나 붙일 수 있다. */
export function createPermissionCheck<P extends string = string>(
  granted: () => readonly string[],
): PermissionCheck<P> {
  return {
    hasPermission: (...required) => hasPermission(granted(), ...required),
    hasAnyPermission: (...required) => hasAnyPermission(granted(), ...required),
  }
}

export interface DefinePermissionsOptions<E extends string = never> {
  /**
   * 카탈로그 객체 밖에서 파생되는 유효 권한 값. crm-v5 의 `db.edit.<item>` 처럼 상수
   * 객체로 나열하지 않고 생성하는 키가 있을 때 쓴다. `ALL_PERMISSION_VALUES` 와 zod
   * 스키마에 함께 들어간다.
   */
  extraValues?: readonly E[]
}

export interface PermissionCatalog<T extends Record<string, string>, E extends string = never> {
  /** 프로젝트가 넘긴 카탈로그 + `ALL: '*'`. 화면·서버가 상수로 참조한다. */
  readonly PERMISSIONS: Readonly<T> & { readonly ALL: AllPermission }
  /**
   * 유효한 권한 문자열 전체 — 정본(single source of truth). zod 스키마·런타임 Set·
   * 역할 편집 카탈로그가 전부 여기서 파생된다. 소비처가 각자 목록을 만들지 않는다.
   */
  readonly ALL_PERMISSION_VALUES: readonly (T[keyof T] | E | AllPermission)[]
  /** `roles.permissions` 컬럼과 `/auth/me` 응답을 검증하는 스키마. */
  readonly permissionSchema: z.ZodType<T[keyof T] | E | AllPermission>
  readonly permissionListSchema: z.ZodType<(T[keyof T] | E | AllPermission)[]>
  /** 임의 문자열이 유효한 권한인지 좁힌다. */
  isPermission(value: string): value is T[keyof T] | E | AllPermission
  /**
   * 모르는 권한 문자열을 걸러낸다. 권한 하나를 카탈로그에서 제거해도 DB 의
   * `roles.permissions` 에는 옛 문자열이 남는다 — 그 값이 응답 검증에서 던지지 않도록
   * 조용히 떨어뜨린다.
   */
  toPermissions(values: readonly string[]): (T[keyof T] | E | AllPermission)[]
  hasPermission(granted: readonly string[], ...required: (T[keyof T] | E)[]): boolean
  hasAnyPermission(granted: readonly string[], ...required: (T[keyof T] | E)[]): boolean
  coversPermissions(granted: readonly string[], target: readonly string[]): boolean
  createCheck(granted: () => readonly string[]): PermissionCheck<T[keyof T] | E>
}

/** `definePermissions()` 반환값에서 권한 유니온 타입을 뽑는다. */
export type PermissionOf<C> =
  C extends PermissionCatalog<infer T, infer E> ? T[keyof T] | E | AllPermission : never

/**
 * 프로젝트 권한 카탈로그를 정의한다. `ALL: '*'` 는 자동으로 들어간다.
 *
 * ⚠️ `ALL_PERMISSION_VALUES` 에 명시 타입 주석을 붙이지 않는 이유(gise 원본 주석):
 *    주석 없이 두면 배열 타입이 우변에서 추론되어 `Permission` 유니온과 구조적으로
 *    결합된 상태를 유지한다. `Permission[]` 로 넓히면 부분집합을 그냥 받아줘 "카탈로그에
 *    더했는데 정본 배열에 안 더한" 실수를 컴파일이 못 잡는다. 팩토리는 그 결합을
 *    `Object.values()` 로 구조적으로 보장한다.
 */
export function definePermissions<const T extends Record<string, string>, E extends string = never>(
  catalog: T,
  options: DefinePermissionsOptions<E> = {},
): PermissionCatalog<T, E> {
  type P = T[keyof T] | E | AllPermission

  if ('ALL' in catalog && catalog.ALL !== ALL_PERMISSION) {
    throw new Error(
      `definePermissions: 'ALL' 키는 패키지가 '*' 로 예약한다 (받은 값: ${String(catalog.ALL)})`,
    )
  }

  const PERMISSIONS = Object.freeze({ ...catalog, ALL: ALL_PERMISSION }) as Readonly<T> & {
    readonly ALL: AllPermission
  }

  // 카탈로그가 `ALL: '*'` 를 이미 들고 있어도(gise·crm 관례) '*' 는 끝에 한 번만 둔다.
  const values = [
    ...(Object.values(catalog) as string[]).filter((value) => value !== ALL_PERMISSION),
    ...(options.extraValues ?? []),
    ALL_PERMISSION,
  ] as P[]

  const duplicated = values.filter((value, index) => values.indexOf(value) !== index)
  if (duplicated.length > 0) {
    throw new Error(`definePermissions: 권한 값이 중복된다: ${[...new Set(duplicated)].join(', ')}`)
  }

  const ALL_PERMISSION_VALUES: readonly P[] = Object.freeze(values)
  const permissionSet: ReadonlySet<string> = new Set(ALL_PERMISSION_VALUES)

  const permissionSchema = z.enum(values as [P, ...P[]])
  const permissionListSchema = z.array(permissionSchema)

  function isPermission(value: string): value is P {
    return permissionSet.has(value)
  }

  return {
    PERMISSIONS,
    ALL_PERMISSION_VALUES,
    permissionSchema,
    permissionListSchema,
    isPermission,
    toPermissions: (list) => list.filter(isPermission),
    hasPermission,
    hasAnyPermission,
    coversPermissions,
    createCheck: (granted) => createPermissionCheck<T[keyof T] | E>(granted),
  }
}
