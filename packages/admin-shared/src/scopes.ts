import { z } from 'zod'

/**
 * 범위(scope) 축 — 선택 모듈.
 *
 * 정본: kim5257-crm-v5 `packages/shared/src/constants/scopes.const.ts`. crm·axion 만 쓰고
 * gise·hangang 에는 이 축이 없다. 그래서 권한 카탈로그(`definePermissions`)와 분리된
 * 별도 팩토리다 — 없는 프로젝트는 호출하지 않으면 된다.
 *
 * 의미: 어떤 리소스에 대해 "본인 것만(own) / 본인 팀 것(team) / 전체(all)" 중 어디까지
 * 보고 고칠 수 있는가. 권한(permission)이 **행위의 허용 여부**라면 scope 는 **행위의
 * 대상 범위**다. 역할(role)마다 `scopes: { '*': 'own', 'org.users': 'all' }` 꼴로 저장된다.
 */

export const SCOPES = {
  /** 본인 소유만 */
  OWN: 'own',
  /** 본인 팀 소유 */
  TEAM: 'team',
  /** 전체 */
  ALL: 'all',
} as const

export type Scope = (typeof SCOPES)[keyof typeof SCOPES]

export const SCOPE_VALUES = Object.values(SCOPES)
export const scopeSchema = z.enum(SCOPE_VALUES as [Scope, ...Scope[]])

/** 범위의 포함 순서 — own ⊂ team ⊂ all. 비교·정렬에 쓴다. */
const SCOPE_RANK: Record<Scope, number> = { own: 0, team: 1, all: 2 }

/** `a` 가 `b` 이상으로 넓은가 (all ≥ team ≥ own). */
export function scopeCovers(a: Scope, b: Scope): boolean {
  return SCOPE_RANK[a] >= SCOPE_RANK[b]
}

export interface DefineScopesOptions {
  /** 와일드카드도 리소스 값도 없을 때의 기본 범위. 상류 기본값은 `own` 이다. */
  defaultScope?: Scope
}

export interface ScopeCatalog<R extends string> {
  readonly SCOPE_RESOURCES: readonly R[]
  /** DB 에 저장되는 원본 — `'*'` 와일드카드 포함 가능, 부분 지정 가능. */
  readonly rawScopesSchema: z.ZodType<Partial<Record<'*' | R, Scope>>>
  isScopeResource(value: string): value is R
  /**
   * 와일드카드(`'*'`) 포함 가능한 원본 scopes 를 리소스별로 확장한다.
   *
   * ```ts
   * expandScopes({ '*': 'all' })                      // 전 리소스 all
   * expandScopes({ '*': 'own', 'org.users': 'all' })  // org.users 만 all, 나머지 own
   * expandScopes({})                                  // 전 리소스 defaultScope(own)
   * ```
   */
  expandScopes(scopes: Partial<Record<string, Scope>>): Record<R, Scope>
  /** 리소스 하나의 실효 범위. `expandScopes` 전체를 만들지 않고 하나만 볼 때. */
  resolveScope(scopes: Partial<Record<string, Scope>>, resource: R): Scope
}

export function defineScopes<const R extends string>(
  resources: readonly R[],
  options: DefineScopesOptions = {},
): ScopeCatalog<R> {
  const defaultScope = options.defaultScope ?? SCOPES.OWN
  const resourceSet: ReadonlySet<string> = new Set(resources)

  function isScopeResource(value: string): value is R {
    return resourceSet.has(value)
  }

  const rawScopesSchema = z
    .record(z.string(), scopeSchema)
    .refine((raw) => Object.keys(raw).every((key) => key === '*' || isScopeResource(key)), {
      message: 'scopes 에 정의되지 않은 리소스 키가 있다',
    }) as unknown as z.ZodType<Partial<Record<'*' | R, Scope>>>

  function resolveScope(scopes: Partial<Record<string, Scope>>, resource: R): Scope {
    return scopes[resource] ?? scopes['*'] ?? defaultScope
  }

  function expandScopes(scopes: Partial<Record<string, Scope>>): Record<R, Scope> {
    const result = {} as Record<R, Scope>
    for (const resource of resources) {
      result[resource] = resolveScope(scopes, resource)
    }
    return result
  }

  return {
    SCOPE_RESOURCES: Object.freeze([...resources]),
    rawScopesSchema,
    isScopeResource,
    expandScopes,
    resolveScope,
  }
}
