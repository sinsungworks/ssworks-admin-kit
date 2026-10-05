import { ALL_PERMISSION } from '@ssworks/admin-shared'

// 역할 편집의 권한 배열 규칙 — `useRoleEditor` 전용(index 에서 내보내지 않는다).
//
// 정본: hangang-home apps/admin/src/pages/settings/roles-messages.ts
//       (`sortPermissions` · `samePermissionSet` · `togglePermission` · `IMPLIED_BY` · `dependentsOf`)
// 바꾼 점:
//  - 카탈로그(`CANONICAL_PERMISSION_ORDER`) · 함의 표(액션 단위 `IMPLIED_BY`)를 모듈 상수로 들지 않고 인자로 받는다.
//    함의는 액션이 아니라 **권한 키 단위**다(`{ 'org.users:write': ['org.users:read'] }`) — 자원마다 액션 어휘가
//    다른 프로젝트(gise)도 적을 수 있다.
//  - 함의를 연쇄로 펼친다. `delete ⇒ write ⇒ read` 를 적으면 `delete` 가 `read` 까지 켠다.

export type ImpliesMap = Readonly<Partial<Record<string, readonly string[]>>>

/** `catalog` 순서로 거른다. 🔴 `'*'` 와 카탈로그 밖 키는 버린다 — 매트릭스 모델에 `'*'` 가 들어오는 길을 막는다. */
export function orderedPermissions(catalog: readonly string[], list: readonly string[]): string[] {
  const granted = new Set(list)
  return catalog.filter((key) => key !== ALL_PERMISSION && granted.has(key))
}

/** `key` 가 연쇄로 함의하는 키 전부(너비 우선). `key` 자신은 빠진다. 순환이 있어도 멈춘다. */
export function impliedClosure(implies: ImpliesMap, key: string): string[] {
  const seen = new Set<string>([key])
  const queue = [key]
  const out: string[] = []
  for (let current = queue.shift(); current != null; current = queue.shift()) {
    for (const next of implies[current] ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      out.push(next)
      queue.push(next)
    }
  }
  return out
}

/**
 * 칸 하나를 켜거나 끈다 — 🔴 함의를 값에 **써 넣는다**(hangang §7-2 "표시만 하지 말라"). 화면은 부여됐다 하고
 * 저장소는 없다고 하면 안 된다.
 *
 * - 켤 때: `key` + 닫힘.
 * - 끌 때: `key` + `key` 를 닫힘에 포함하는 키. 🔴 끄는 방향은 `implies` 에서 **유도한다** — 두 번째 표를 받지
 *   않는다. 두 표가 갈리면 "읽기는 껐는데 편집은 켜진" 집합이 저장으로 나가고, 서버 정규화가 읽기를 되살려 화면과
 *   저장소가 갈린다.
 * - 🔴 카탈로그 밖 키와 `'*'` 는 함의로도 만들지 않는다. 결과는 카탈로그 순서다.
 */
export function togglePermission(
  catalog: readonly string[],
  implies: ImpliesMap,
  current: readonly string[],
  key: string,
  on: boolean,
): string[] {
  const valid = new Set(catalog)
  const granted = new Set(current)
  const affected = on
    ? [key, ...impliedClosure(implies, key)]
    : [
        key,
        ...catalog.filter((other) => other !== key && impliedClosure(implies, other).includes(key)),
      ]
  for (const target of affected) {
    if (target === ALL_PERMISSION || !valid.has(target)) continue
    if (on) granted.add(target)
    else granted.delete(target)
  }
  return orderedPermissions(catalog, [...granted])
}

/**
 * 두 전송값이 같은가 — 🔴 순서까지 보는 완전 대조다. 양쪽 다 `orderedPermissions` 를 지났거나 정확히 `['*']`
 * 이므로 순서가 다르면 그 자체가 결함이다. 집합 비교로 뭉개면 그 결함이 "같다" 로 삼켜진다(hangang).
 */
export function samePermissionList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}
