import type { AdminServerOptions } from '../options.js'

// 정본: 없음 — 2e 스펙 ⑨ K1 · B14. 네 정본은 종류를 enum 으로 박았다(gise PRIVACY · TERMS, axion TERMS · PRIVACY · REFUND).
// 🔴 기동에서 멈춘다 — 종류가 비면 발행할 수 없는 모듈이 뜨고, 형식 밖 값은 열(varchar(32) ascii_bin)에 맞지 않는다.
//    문제를 모아 한 번에 던진다(2c §5-8 과 같은 방식).

/** 코어 옵션 `legal` — `AdminLegalModule` 을 쓰면 필수 */
export interface AdminLegalOptions {
  /** 발행할 수 있는 종류 — 쓰는 쪽 카탈로그. 예: ['TERMS', 'PRIVACY']. 원소는 영숫자 · `_` 1~32자, 겹치지 않는다 */
  kinds: readonly string[]
}

export interface ResolvedLegalConfig {
  /** 검증을 지난 종류 — 하나 이상(z.enum 에 그대로 넘긴다) */
  readonly kinds: readonly [string, ...string[]]
}

const KIND = /^[A-Za-z0-9_]{1,32}$/

export function resolveLegalConfig(
  options: Pick<AdminServerOptions, 'legal'>,
  moduleName: string,
): ResolvedLegalConfig {
  const legal: unknown = options.legal
  if (typeof legal !== 'object' || legal === null) {
    throw new Error(
      `${moduleName} 은 legal 옵션이 있어야 한다 — AdminServerModule 옵션에 legal: { kinds: ['TERMS', 'PRIVACY'] } 를 더한다.`,
    )
  }
  const kinds: unknown = (legal as { kinds?: unknown }).kinds
  const problems: string[] = []
  if (!Array.isArray(kinds) || kinds.length === 0) {
    problems.push('legal.kinds 는 비어 있지 않은 배열이어야 한다')
  } else {
    const seen = new Set<string>()
    kinds.forEach((kind: unknown, index: number) => {
      if (typeof kind !== 'string' || !KIND.test(kind)) {
        problems.push(
          `legal.kinds[${index}] — 영숫자 · '_' 1~32자가 아니다: ${JSON.stringify(kind)}`,
        )
      } else if (seen.has(kind)) {
        problems.push(`legal.kinds 에 겹친 종류: ${kind}`)
      } else {
        seen.add(kind)
      }
    })
  }
  if (problems.length > 0) {
    throw new Error(`${moduleName} 의 legal 옵션이 맞지 않다 — ${problems.join(' / ')}`)
  }
  const resolved = Object.freeze([...(kinds as string[])]) as unknown as readonly [
    string,
    ...string[],
  ]
  return Object.freeze({ kinds: resolved })
}
