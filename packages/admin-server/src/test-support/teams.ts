import type { AdminTeamNode } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 테스트 전용 — 팀 시드(쓰는 쪽 시드 흉내)와 closure · 트리 읽기(2e-1). 🔴 빌드에서 빠진다(tsconfig.build.json 의
// test-support 제외).

export interface ClosureTuple {
  ancestorNo: bigint
  descendantNo: bigint
  depth: number
}

const compareBig = (a: bigint, b: bigint): number => (a < b ? -1 : a > b ? 1 : 0)

export function compareClosure(a: ClosureTuple, b: ClosureTuple): number {
  return (
    compareBig(a.descendantNo, b.descendantNo) ||
    a.depth - b.depth ||
    compareBig(a.ancestorNo, b.ancestorNo)
  )
}

/** 그 팀들을 자손으로 가진 closure 행 전부 — (descendantNo, depth, ancestorNo) 순 */
export async function closureOf(
  db: Kysely<AdminDatabase>,
  descendants: readonly bigint[],
): Promise<ClosureTuple[]> {
  if (descendants.length === 0) return []
  const rows = await db
    .selectFrom('teamClosure')
    .select(['ancestorNo', 'descendantNo', 'depth'])
    .where('descendantNo', 'in', descendants)
    .execute()
  return rows.sort(compareClosure)
}

/** 기대 closure — [조상, 자손, 깊이] 를 closureOf 와 같은 순으로 */
export function closure(...rows: [bigint, bigint, number][]): ClosureTuple[] {
  return rows
    .map(([ancestorNo, descendantNo, depth]) => ({ ancestorNo, descendantNo, depth }))
    .sort(compareClosure)
}

/** 트리를 깊이 우선 경로로 — ['R1', 'R1/A', 'R1/A/a', 'R2'] */
export function outline(nodes: readonly AdminTeamNode[], prefix = ''): string[] {
  return nodes.flatMap((node) => {
    const path = prefix === '' ? node.teamName : `${prefix}/${node.teamName}`
    return [path, ...outline(node.children, path)]
  })
}

/**
 * 쓰는 쪽이 손으로 넣은 팀(시드 흉내). 상위 팀 = 깊이 1 행, 그 위 조상은 상위 팀의 depth > 0 행에서 센다.
 * 🔴 selfRow(기본 true)로 자기 행(depth 0)을 넣을지 고른다 — 패키지가 자기 행에 기대지 않는지 잰다(④ C1).
 */
export async function seedTeamUnder(
  db: Kysely<AdminDatabase>,
  input: {
    teamName: string
    parentTeamNo: bigint | null
    displayOrder?: number
    selfRow?: boolean
  },
): Promise<bigint> {
  const inserted = await db
    .insertInto('teams')
    .values({ teamName: input.teamName, displayOrder: input.displayOrder ?? 0 })
    .executeTakeFirstOrThrow()
  const teamNo = inserted.insertId as bigint
  if (input.selfRow ?? true) {
    await db
      .insertInto('teamClosure')
      .values({ ancestorNo: teamNo, descendantNo: teamNo, depth: 0 })
      .execute()
  }
  if (input.parentTeamNo !== null) {
    const ancestors = await db
      .selectFrom('teamClosure')
      .select(['ancestorNo', 'depth'])
      .where('descendantNo', '=', input.parentTeamNo)
      .where('depth', '>', 0)
      .execute()
    await db
      .insertInto('teamClosure')
      .values([
        { ancestorNo: input.parentTeamNo, descendantNo: teamNo, depth: 1 },
        ...ancestors.map((a) => ({
          ancestorNo: a.ancestorNo,
          descendantNo: teamNo,
          depth: a.depth + 1,
        })),
      ])
      .execute()
  }
  return teamNo
}

/** 그 팀들의 [번호, displayOrder] — 번호 순 */
export async function displayOrders(
  db: Kysely<AdminDatabase>,
  teamNos: readonly bigint[],
): Promise<[bigint, number][]> {
  const rows = await db
    .selectFrom('teams')
    .select(['teamNo', 'displayOrder'])
    .where('teamNo', 'in', teamNos)
    .orderBy('teamNo')
    .execute()
  return rows.map((row) => [row.teamNo, row.displayOrder])
}
