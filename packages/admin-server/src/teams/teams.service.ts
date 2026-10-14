import { Inject, Injectable, Logger } from '@nestjs/common'
import type {
  AdminTeamCreate,
  AdminTeamMoveBody,
  AdminTeamNode,
  AdminTeamRename,
} from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { isDuplicateOf } from '../accounts/duplicate.js'
import { GUARD_LOCK_TEAM_TREE, lockGuardRow } from '../database/guard-locks.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import { TEAM_MESSAGES, beforeTeamError, duplicateTeamName, moveCycle } from './errors.js'
import { closurePairs, planTeamMove, type ClosureLink } from './move.js'
import {
  lockAncestors,
  lockDescendants,
  lockParentTeam,
  lockSiblings,
  lockTeamRow,
} from './team-locks.js'
import { buildTeamTree } from './tree.js'

// 정본: hangang-home apps/api/src/modules/teams/teams.service.ts(트리 · 만들기 · 이름 · 이동 · 삭제 · A3 잠금 뒤 셈) ·
//       team-closure.service.ts(자기 행 + 상위 조상 복사 · reparent) + ssworks-axion-admin 존재 검증(G12)
// 바꾼 점:
//  - 루트가 여럿이다(3d §9 — hangang 은 단일 루트 · parentTeamNo 필수). 트리는 평면 목록을 메모리에서 조립한다(B9).
//  - 🔴 팀 쓰기 넷은 guardLocks 행 teamTree 를 트랜잭션 첫 문장에서 잡는다(① G1) — 겹치지 않는 행을 잠근 이동 둘이 순환을
//    만드는 길을 막는다. 이름 바꾸기도 잡는다(B5 — 팀 행을 바꾸는 쓰기가 모두 줄을 서서 스냅샷 격리 ON 의 1020 이 없다).
//  - 쓰기 안의 읽기는 모두 잠금 읽기(B3). closure 는 앱이 셈한 쌍으로 넣는다(④ C1 · B6 — 자기 행에 기대지 않는다).
//  - 이름 중복은 사전 검사 없이 제약 uq_teams_name 으로 가려 409(⑧ N1 · B12 — hangang 은 사전 검사였고 경합 때 일반 코드로 샜다).
//  - 상위 팀이 없으면 404(hangang 은 조용히 고아를 만들었다).

export type TeamAuditView = { teamName: string; parentTeamNo: bigint | null }
export type TeamPlacement = { parentTeamNo: bigint | null; displayOrder: number }

export const TEAM_AUDIT_FIELDS = ['teamName', 'parentTeamNo'] as const
export const TEAM_RENAME_AUDIT_FIELDS = ['teamName'] as const
export const TEAM_MOVE_AUDIT_FIELDS = ['parentTeamNo', 'displayOrder'] as const

@Injectable()
export class AdminTeamsService {
  private readonly logger = new Logger('AdminTeamsService')

  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  /** 루트 여럿 · 형제는 (displayOrder, teamNo) 순(공통 6). 상위 팀 = 깊이 1 조상 — 자기 행이 필요 없다 */
  async tree(): Promise<{ items: AdminTeamNode[] }> {
    const rows = await runQuery(() =>
      this.db
        .selectFrom('teams as t')
        .leftJoin('teamClosure as p', (join) =>
          join.onRef('p.descendantNo', '=', 't.teamNo').on('p.depth', '=', 1),
        )
        .select(['t.teamNo', 't.teamName', 't.displayOrder', 'p.ancestorNo as parentTeamNo'])
        .orderBy('t.displayOrder')
        .orderBy('t.teamNo')
        .orderBy('p.ancestorNo')
        .execute(),
    )
    const { items, warnings } = buildTeamTree(
      rows.map((row) => ({ ...row, parentTeamNo: row.parentTeamNo ?? null })),
    )
    if (warnings.length > 0)
      this.logger.warn(`팀 트리의 closure 가 손상됐다 — ${warnings.join(' / ')}`)
    return { items }
  }

  /** 상위 팀 아래(없으면 최상위) 맨 끝 — 형제 MAX + 1, 없으면 0(⑤ O1) */
  async create(body: AdminTeamCreate): Promise<{ teamNo: bigint }> {
    return this.guardName(() =>
      runWriteTransaction(this.db, async (trx) => {
        // 🔴 첫 문장(① G1)
        await lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)
        const parentTeamNo = body.parentTeamNo
        let ancestors: ClosureLink[] = []
        if (parentTeamNo !== null) {
          await lockParentTeam(trx, parentTeamNo)
          ancestors = [
            { teamNo: parentTeamNo, depth: 0 },
            ...(await lockAncestors(trx, parentTeamNo)),
          ]
        }
        const siblings = await lockSiblings(trx, parentTeamNo, null)
        const displayOrder = siblings.reduce(
          (top, sibling) => Math.max(top, sibling.displayOrder + 1),
          0,
        )
        const inserted = await trx
          .insertInto('teams')
          .values({ teamName: body.teamName, displayOrder })
          .executeTakeFirstOrThrow()
        const teamNo = inserted.insertId
        if (teamNo === undefined) throw new Error('teams INSERT 가 insertId 를 돌려주지 않았다.')
        await trx
          .insertInto('teamClosure')
          .values([
            { ancestorNo: teamNo, descendantNo: teamNo, depth: 0 },
            ...closurePairs(ancestors, [{ teamNo, depth: 0 }]),
          ])
          .execute()
        return { teamNo }
      }),
    )
  }

  async rename(teamNo: bigint, body: AdminTeamRename): Promise<{ before: { teamName: string } }> {
    return this.guardName(() =>
      runWriteTransaction(this.db, async (trx) => {
        // 🔴 첫 문장(B5 — 이름 바꾸기도 줄을 선다)
        await lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)
        const row = await lockTeamRow(trx, teamNo)
        await trx
          .updateTable('teams')
          .set({ teamName: body.teamName })
          .where('teamNo', '=', teamNo)
          .execute()
        return { before: { teamName: row.teamName } }
      }),
    )
  }

  /**
   * 기준 형제 앞(null 이면 끝)으로 — 받는 형제 묶음을 0..n-1 로 다시 매긴다(⑤ O1 · B8). 상위 팀이 바뀌면 closure 를 앱이 셈한
   * 쌍으로 다시 쓴다(B6). 검사 순서는 B10. 🔴 재인증 · revision 이 없다(3d §9).
   */
  async move(
    teamNo: bigint,
    body: AdminTeamMoveBody,
  ): Promise<{ before: TeamPlacement; after: TeamPlacement }> {
    if (body.beforeTeamNo === teamNo) throw beforeTeamError(TEAM_MESSAGES.beforeIsSelf)
    return runWriteTransaction(this.db, async (trx) => {
      // 🔴 첫 문장(① G1) — 서브트리 · 상위 팀 · 형제 읽기가 모두 앞선 팀 쓰기의 커밋 뒤를 본다
      await lockGuardRow(trx, GUARD_LOCK_TEAM_TREE)
      const target = await lockTeamRow(trx, teamNo)
      const oldAncestors = await lockAncestors(trx, teamNo)
      // 🔴 대상은 따로 넣는다 — closure 자기 행에 기대지 않는다(④ C1)
      const subtree: ClosureLink[] = [
        { teamNo, depth: 0 },
        ...(await lockDescendants(trx, teamNo)).map((link) => ({
          teamNo: link.teamNo,
          depth: link.depth,
        })),
      ]
      const parentTeamNo = body.parentTeamNo
      // 🔴 자기 자신 · 하위 팀 아래로는 못 간다 — hangang 에 없던 검사(3d §9). 받아들이면 closure 가 순환 · 고립된다
      if (parentTeamNo !== null && subtree.some((link) => link.teamNo === parentTeamNo)) {
        throw moveCycle()
      }
      let newAncestors: ClosureLink[] = []
      if (parentTeamNo !== null) {
        await lockParentTeam(trx, parentTeamNo)
        newAncestors = [
          { teamNo: parentTeamNo, depth: 0 },
          ...(await lockAncestors(trx, parentTeamNo)),
        ]
      }
      const siblings = await lockSiblings(trx, parentTeamNo, teamNo)
      const beforeTeamNo = body.beforeTeamNo
      if (beforeTeamNo !== null && !siblings.some((sibling) => sibling.teamNo === beforeTeamNo)) {
        throw beforeTeamError(TEAM_MESSAGES.beforeNotSibling)
      }
      const sameParent = parentTeamNo === target.parentTeamNo
      const plan = planTeamMove(
        siblings,
        { teamNo, displayOrder: target.displayOrder },
        beforeTeamNo,
        sameParent,
      )
      const before: TeamPlacement = {
        parentTeamNo: target.parentTeamNo,
        displayOrder: target.displayOrder,
      }
      if (plan.unchanged) return { before, after: before }
      if (!sameParent) {
        // 옛 바깥 조상 × 서브트리를 지우고 새 조상 × 서브트리를 넣는다. 서브트리 안 쌍(자기 행 포함)은 그대로 둔다(B6)
        const oldAncestorNos = oldAncestors.map((link) => link.teamNo)
        if (oldAncestorNos.length > 0) {
          await trx
            .deleteFrom('teamClosure')
            .where(
              'descendantNo',
              'in',
              subtree.map((link) => link.teamNo),
            )
            .where('ancestorNo', 'in', oldAncestorNos)
            .execute()
        }
        const rows = closurePairs(newAncestors, subtree)
        if (rows.length > 0) await trx.insertInto('teamClosure').values(rows).execute()
      }
      for (const update of plan.updates) {
        await trx
          .updateTable('teams')
          .set({ displayOrder: update.displayOrder })
          .where('teamNo', '=', update.teamNo)
          .execute()
      }
      return { before, after: { parentTeamNo, displayOrder: plan.targetOrder } }
    })
  }

  /** 이름 UNIQUE 위반을 409 ERR_DUPLICATE_TEAM_NAME 으로(B12 — 제약 이름은 DB 의 snake_case, 2a R3) */
  private async guardName<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (isDuplicateOf(error, 'uq_teams_name')) throw duplicateTeamName()
      throw error
    }
  }
}
