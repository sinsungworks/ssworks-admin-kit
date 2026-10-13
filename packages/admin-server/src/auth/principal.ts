import type { Request } from 'express'

// 정본: hangang-home apps/api/src/core/guards/auth.guard.ts `AuthenticatedUser` + ssworks-gise-home
//       core/auth/authenticated-admin.ts(권한은 매 요청 DB · 강제 변경이면 빈 배열)
// 바꾼 점: 주체를 req.admin 에 둔다(회원 인증 passport 의 req.user 와 가른다 — 스펙 ⑦ N1). Express Request 를 전역
//   증강하지 않는다 — getAdminPrincipal · @CurrentAdmin 으로 꺼낸다. 프로젝트 필드(crm scopes 등)는 없다.

export interface AdminPrincipal {
  userNo: bigint
  sessionNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  teamNo: bigint | null
  teamName: string | null
  /** 🔴 강제 변경 계정은 [](gise) — 권한 라우트가 저절로 403 이 된다 */
  permissions: readonly string[]
  isPasswordChangeRequired: boolean
}

/** `GET /auth/me` 응답 — admin-ui `AdminUserInfo` 의 상위 집합(스펙 §4-5) */
export interface AdminMe {
  userNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  teamNo?: bigint
  teamName?: string
  permissions: readonly string[]
  isPasswordChangeRequired: boolean
}

type WithAdmin = Request & { admin?: AdminPrincipal }

export function getAdminPrincipal(req: Request): AdminPrincipal | undefined {
  return (req as WithAdmin).admin
}

export function setAdminPrincipal(req: Request, principal: AdminPrincipal): void {
  ;(req as WithAdmin).admin = principal
}

/** 🔴 필드를 하나씩 옮긴다 — 주체에 무엇이 더해져도 응답으로 새지 않는다. 팀이 없으면 키를 뺀다. */
export function toAdminMe(principal: AdminPrincipal): AdminMe {
  return {
    userNo: principal.userNo,
    userId: principal.userId,
    userName: principal.userName,
    roleNo: principal.roleNo,
    roleName: principal.roleName,
    ...(principal.teamNo == null ? {} : { teamNo: principal.teamNo }),
    ...(principal.teamName == null ? {} : { teamName: principal.teamName }),
    permissions: principal.permissions,
    isPasswordChangeRequired: principal.isPasswordChangeRequired,
  }
}
