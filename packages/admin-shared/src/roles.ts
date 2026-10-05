import { z } from 'zod'

// 역할(직책) 코어 계약 — Phase 2 서버와 admin-ui `useRoleEditor` 가 같은 모양을 본다.
//
// 정본: ssworks-gise-home 역할 DTO(revision 낙관적 잠금) · hangang-home apps/admin/src/api/roles.api.ts
//       (공통 필드 · 이동 본문 분리)
// 바꾼 점:
//  - 네 프로젝트 공통 필드 + gise `revision` 만 둔다. `createAt` · `updateAt` · gise `userCount` 는 화면이 쓰지
//    않으므로 소비자가 `.extend()` 로 더한다.
//  - 🔴 `permissions` 는 `string[]` 이다. 프로젝트가 `.extend({ permissions: permissionListSchema })` 로 좁힌다 —
//    패키지는 권한 키를 모른다.
//  - 🔴 `.refine()` 을 걸지 않는다. zod 4 는 refinement 가 있는 객체 스키마의 `.omit()` · `.pick()` 을 던진다
//    (4.6.5 실측). 그러면 프로젝트가 필드를 덜어 낼 수 없고, `revision` 을 끄는 경로(`.omit({ revision: true })`)
//    도 막힌다. "수정할 값이 없다" 검사는 서버가 원하면 따로 건다.
//
// 🔴 `'*'`(전체 권한)는 `permissions` 안에서 정확히 `['*']` 하나로만 쓴다. 스키마는 강제하지 않고 서버 정규화가
//    맡는다(hangang `permissions.normalize.ts` 규칙 ①).

/** hangang `maxlength` 64. Phase 2 컬럼 길이와 맞춘다. */
const roleNameSchema = z.string().min(1).max(64)
/** 🔴 Phase 0 §4 "쓰기 보호는 revision 기본". 수정 · 삭제 성공마다 서버가 올린다. 이동은 올리지 않는다. */
const revisionSchema = z.number().int().min(0)

export const adminRoleSchema = z.object({
  roleNo: z.bigint(),
  roleName: roleNameSchema,
  displayOrder: z.number().int().min(0),
  isDefault: z.boolean(),
  permissions: z.array(z.string()),
  revision: revisionSchema,
})

export const adminRoleCreateSchema = z.object({
  roleName: roleNameSchema,
  isDefault: z.boolean(),
  permissions: z.array(z.string()),
})

/** 부분 갱신. 🔴 `revision` 만 필수다 — 낙관적 잠금은 끄는 경로가 없다(3b 스펙 §2-1). */
export const adminRoleUpdateSchema = z.object({
  roleName: roleNameSchema.optional(),
  isDefault: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
  revision: revisionSchema,
})

/**
 * 🔴 `revision` 이 없다 — 순서는 내용이 아니다. 이동이 `revision` 을 올리면 남이 순서만 바꿔도 편집 중인 사람의
 *    저장이 충돌로 떨어진다(3b 스펙 D1). 서버는 이웃의 `displayOrder` 를 목표로 받아 구간을 재번호한다.
 */
export const adminRoleMoveSchema = z.object({ displayOrder: z.number().int().min(0) })

export const adminRoleRemoveSchema = z.object({ revision: revisionSchema })

export type AdminRole = z.infer<typeof adminRoleSchema>
export type AdminRoleCreate = z.infer<typeof adminRoleCreateSchema>
export type AdminRoleUpdate = z.infer<typeof adminRoleUpdateSchema>
export type AdminRoleMove = z.infer<typeof adminRoleMoveSchema>
export type AdminRoleRemove = z.infer<typeof adminRoleRemoveSchema>
