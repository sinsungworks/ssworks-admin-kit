import type { Transaction } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { noParentTeam, noTeam } from './errors.js'
import type { ClosureLink, SiblingOrder } from './move.js'

// 정본: hangang-home apps/api/src/modules/teams/team-closure.service.ts(subtreeTeamNos · 조상 복사 · 깊이 1 = 상위 팀) ·
//       teams.service.ts(형제 구간)
// 바꾼 점: 팀 쓰기의 읽기는 모두 잠금 읽기다(2e 스펙 B3 — 예외는 삭제의 소속 셈 하나). 자기 행에 기대지 않는다(④ C1) — 대상은
//   부르는 쪽이 따로 넣고, closure 는 depth > 0 만 읽는다. hangang 은 비잠금 · 자기 행 의존이었다.
// 🔴 이 조각들보다 lockGuardRow(trx, GUARD_LOCK_TEAM_TREE) 가 먼저, 트랜잭션의 첫 문장이어야 한다(① G1).
// 🔴 팀 쓰기 안에서 teams 와 teamClosure 잠금이 엇갈린다(lockTeamRow 는 teams → closure, lockDescendants 는 closure → teams,
//    이어서 lockParentTeam 은 teams). 안전한 것은 teamClosure 를 잠그는 모든 트랜잭션이 teamTree 가드를 쥐기 때문이다 —
//    가드 없이 teamClosure 를 쓰는 쓰기를 더하면 교착한다.

type Trx = Transaction<AdminDatabase>

export interface LockedTeam {
  teamNo: bigint
  teamName: string
  displayOrder: number
  /** 깊이 1 조상. null = 최상위 */
  parentTeamNo: bigint | null
}

/** 대상 팀 행과 그 깊이 1 closure 행을 잠근다. 상위 팀 번호만 돌려줄 뿐 상위 팀 행은 잠그지 않는다 — 없으면 404 ERR_NO_TEAM */
export async function lockTeamRow(trx: Trx, teamNo: bigint): Promise<LockedTeam> {
  const row = await trx
    .selectFrom('teams as t')
    .leftJoin('teamClosure as p', (join) =>
      join.onRef('p.descendantNo', '=', 't.teamNo').on('p.depth', '=', 1),
    )
    .select(['t.teamNo', 't.teamName', 't.displayOrder', 'p.ancestorNo as parentTeamNo'])
    .where('t.teamNo', '=', teamNo)
    .orderBy('p.ancestorNo')
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw noTeam()
  return { ...row, parentTeamNo: row.parentTeamNo ?? null }
}

/** 상위 팀(만들기 · 이동의 받는 쪽) — 없으면 404 ERR_NO_TEAM 상위 팀 문구 */
export async function lockParentTeam(trx: Trx, teamNo: bigint): Promise<void> {
  const row = await trx
    .selectFrom('teams')
    .select('teamNo')
    .where('teamNo', '=', teamNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw noParentTeam()
}

/** 조상(깊이 > 0, 깊이 순) — 자기 행은 읽지 않는다 */
export async function lockAncestors(trx: Trx, teamNo: bigint): Promise<ClosureLink[]> {
  const rows = await trx
    .selectFrom('teamClosure')
    .select(['ancestorNo', 'depth'])
    .where('descendantNo', '=', teamNo)
    .where('depth', '>', 0)
    .orderBy('depth')
    .forUpdate()
    .execute()
  return rows.map((row) => ({ teamNo: row.ancestorNo, depth: row.depth }))
}

/** 자손(깊이 > 0) — 깊이 · 순서 · 번호 순. 팀 행도 함께 잠근다(삭제 · 이동의 서브트리) */
export async function lockDescendants(
  trx: Trx,
  teamNo: bigint,
): Promise<(ClosureLink & { teamName: string })[]> {
  const rows = await trx
    .selectFrom('teamClosure as c')
    .innerJoin('teams as t', 't.teamNo', 'c.descendantNo')
    .select(['t.teamNo', 't.teamName', 'c.depth'])
    .where('c.ancestorNo', '=', teamNo)
    .where('c.depth', '>', 0)
    .orderBy('c.depth')
    .orderBy('t.displayOrder')
    .orderBy('t.teamNo')
    .forUpdate()
    .execute()
  return rows.map((row) => ({ teamNo: row.teamNo, teamName: row.teamName, depth: row.depth }))
}

/**
 * 상위 팀의 자식 — (displayOrder, teamNo) 순, exclude 제외. parentTeamNo null = 최상위(깊이 1 조상이 없는 팀).
 * parentTeamNo 가 null(최상위 묶음)이면 쿼리가 teams 전 행을(훑는 closure 행과 함께) X 잠그므로, 최상위 만들기 · 이동은
 * 그동안 팀을 고르는 사용자 만들기 · 수정을 잠깐 기다리게 한다(안전 — 사용자 쓰기는 팀 행을 하나만 잡아 교착하지 않는다).
 */
export async function lockSiblings(
  trx: Trx,
  parentTeamNo: bigint | null,
  exclude: bigint | null,
): Promise<SiblingOrder[]> {
  const rows =
    parentTeamNo === null
      ? await trx
          .selectFrom('teams as t')
          .leftJoin('teamClosure as p', (join) =>
            join.onRef('p.descendantNo', '=', 't.teamNo').on('p.depth', '=', 1),
          )
          .select(['t.teamNo', 't.displayOrder'])
          .where('p.ancestorNo', 'is', null)
          .orderBy('t.displayOrder')
          .orderBy('t.teamNo')
          .forUpdate()
          .execute()
      : await trx
          .selectFrom('teamClosure as c')
          .innerJoin('teams as t', 't.teamNo', 'c.descendantNo')
          .select(['t.teamNo', 't.displayOrder'])
          .where('c.ancestorNo', '=', parentTeamNo)
          .where('c.depth', '=', 1)
          .orderBy('t.displayOrder')
          .orderBy('t.teamNo')
          .forUpdate()
          .execute()
  return rows
    .filter((row) => row.teamNo !== exclude)
    .map((row) => ({ teamNo: row.teamNo, displayOrder: row.displayOrder }))
}
