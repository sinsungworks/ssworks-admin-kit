import { z } from 'zod'

// 팀 코어 계약 — Phase 2 서버와 admin-ui `TeamTree` · `useTeamTree` 가 같은 모양을 본다.
//
// 정본: hangang-home apps/api/src/modules/teams(teams.dto.ts · 라우트)
//       + apps/admin/src/pages/org/teams-messages.ts(이름 64자 · 공백만인 이름 거부)
// 바꾼 점:
//  - 트리 응답은 루트가 여럿인 `{ items }` 다. hangang 의 `{ item: node | null }`(단일 루트)은 어댑터가 `[item]` 으로 감싼다.
//  - 🔴 이동 본문은 기준 형제 번호(`{ parentTeamNo, beforeTeamNo }`)다(3d 결정 ⑤ O3). 순서 값(`displayOrder`)은 서버가
//    계산한다 — 빈 번호가 있는 순서에서 화면이 값을 지어내지 않는다. 기존 서버는 `toDisplayOrderMove()` 로 바꾼다.
//  - 🔴 `.refine()` 을 걸지 않는다(3b §11 R1) — `.omit()` 이 깨진다.

export const TEAM_NAME_MAX_LENGTH = 64

/** 앞뒤 공백을 지운 1~64자 */
export const teamNameSchema = z
  .string()
  .trim()
  .min(1, '팀 이름을 입력하세요.')
  .max(TEAM_NAME_MAX_LENGTH, `팀 이름은 ${TEAM_NAME_MAX_LENGTH}자 이하로 정하세요.`)

export interface AdminTeamNode {
  teamNo: bigint
  teamName: string
  /** 형제 안에서만 뜻이 있다. 빈 번호가 있을 수 있다 */
  displayOrder: number
  children: AdminTeamNode[]
}

/**
 * 재귀 — zod 4 의 getter 꼴.
 * 🔴 타입을 `z.ZodType<AdminTeamNode>` 로 적는다. 추론에 맡기면 발행 d.ts 가 재귀 자리를 elided any 로 지워
 *    `children` 이 `Record<string, unknown>[]` 가 되고, 소비자 앱에서 `AdminTeamTree['items']` 가 `AdminTeamNode[]` 에
 *    들어가지 않는다(README 의 `useTeamTree` load 예시가 컴파일되지 않았다 — 3d 스펙 §11 R15). 저장소 안에서는 소스를
 *    보므로 드러나지 않는다 — admin-ui `team-types.test.ts` 가 발행 d.ts 로 잰다.
 */
export const adminTeamNodeSchema: z.ZodType<AdminTeamNode> = z.object({
  teamNo: z.bigint(),
  teamName: z.string(),
  displayOrder: z.number().int(),
  get children() {
    return z.array(adminTeamNodeSchema)
  },
})

/** `GET admin/teams/tree` — 루트가 여럿일 수 있고, 팀이 없으면 [] */
export const adminTeamTreeSchema = z.object({ items: z.array(adminTeamNodeSchema) })

export const adminTeamCreateSchema = z.object({
  teamName: teamNameSchema,
  /** null = 최상위 */
  parentTeamNo: z.bigint().nullable(),
})

export const adminTeamCreateResultSchema = z.object({ teamNo: z.bigint() })

export const adminTeamRenameSchema = z.object({ teamName: teamNameSchema })

/** 이동 요청(3d ⑤ O3). beforeTeamNo: null = 그 상위 팀 아래 맨 끝 */
export const adminTeamMoveSchema = z.object({
  teamNo: z.bigint(),
  parentTeamNo: z.bigint().nullable(),
  beforeTeamNo: z.bigint().nullable(),
})

/** `PATCH admin/teams/:teamNo/move` 본문 — teamNo 는 경로 */
export const adminTeamMoveBodySchema = adminTeamMoveSchema.omit({ teamNo: true })

export type AdminTeamTree = z.infer<typeof adminTeamTreeSchema>
export type AdminTeamCreate = z.infer<typeof adminTeamCreateSchema>
export type AdminTeamCreateResult = z.infer<typeof adminTeamCreateResultSchema>
export type AdminTeamRename = z.infer<typeof adminTeamRenameSchema>
export type AdminTeamMove = z.infer<typeof adminTeamMoveSchema>
export type AdminTeamMoveBody = z.infer<typeof adminTeamMoveBodySchema>
