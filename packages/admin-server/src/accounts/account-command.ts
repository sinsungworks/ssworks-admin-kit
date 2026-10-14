import {
  ALL_PERMISSION,
  BusinessError,
  CommonErrorCodes,
  coversPermissions,
} from '@ssworks/admin-shared'
import type { AdminPrincipal } from '../auth/principal.js'
import { ACCOUNT_MESSAGES } from './errors.js'

// 정본: ssworks-gise-home apps/api/src/modules/accounts/account-policy.ts `judgeAccountCommand` · `judgeSessionTarget`
// 바꾼 점:
//  - 스냅숏 전체가 아니라 서비스가 잠그고 읽은 권한 집합을 명령에 싣는다 — 전량 잠금을 쓰지 않는다(2d 스펙 ④ G1).
//  - 자기 계정은 되돌릴 수 없는 넷(퇴사 · 퇴사일 · 초기화 · 잠금 해제)과 재입사를 막는다(③ SF1 · 2d-3 스펙 ④ S1 — 퇴사
//    예정인 본인의 자기 재입사는 자기 퇴사일 정정과 효과가 같다). 자기 역할의 권한 수정은 허용한다(3b onSelfRoleSaved) —
//    마지막 관리자는 잔존 검사(super-admin.ts)가 지킨다.
//  - 역할 수정은 permissions 가 있을 때만 덮기를 본다(3b §9 — 넓은 역할의 이름은 고칠 수 있다).
//  - revision · 쓰는 중 · 마지막 관리자는 여기서 보지 않는다 — 잠근 행과 셈을 가진 서비스가 본다(2d 스펙 B7).
//  - 403 에 details.outside(덮지 못한 키 — hangang 화면이 문구를 만들던 모양).
// 🔴 2b 의 auth/account-policy.ts(isResigned · isSessionExpired)와 다른 파일이다 — 이름이 겹쳐 이 파일은 account-command.

export interface AccountActor {
  readonly userNo: bigint
  readonly permissions: readonly string[]
}

/** 2d 스펙 §5-2. 권한 집합은 서비스가 트랜잭션 안에서 잠그고 읽은 값이다 */
export type AccountCommand =
  | { kind: 'role.create'; next: readonly string[] }
  | { kind: 'role.update'; current: readonly string[]; next?: readonly string[] }
  | { kind: 'role.delete'; current: readonly string[] }
  | { kind: 'user.create'; grant: readonly string[] }
  | {
      kind: 'user.update'
      targetUserNo: bigint
      current: readonly string[]
      grant?: readonly string[]
    }
  | {
      kind: 'user.resign' | 'user.resignDate' | 'user.rehire' | 'user.passwordReset' | 'user.unlock'
      targetUserNo: bigint
      current: readonly string[]
    }
  | { kind: 'session.target'; targetUserNo: bigint; current: readonly string[] }

export function actorOf(principal: Pick<AdminPrincipal, 'userNo' | 'permissions'>): AccountActor {
  return { userNo: principal.userNo, permissions: principal.permissions }
}

/** 덮지 못한 키(중복 없이). 행위자가 '*' 면 빈 배열, 대상이 '*' 면 '*' 가 들어간다 */
export function outsideOf(granted: readonly string[], target: readonly string[]): string[] {
  if (granted.includes(ALL_PERMISSION)) return []
  // 정규화 전 대상(['b', '*'])도 스펙 §5-2 대로 정확히 ['*'] 다
  if (target.includes(ALL_PERMISSION)) return [ALL_PERMISSION]
  return [...new Set(target.filter((permission) => !granted.includes(permission)))]
}

/** 거부면 403 `ERR_COMMON_FORBIDDEN` 을 던진다. 순서: 자기 계정 → 현재 권한 → 줄 권한 */
export function judgeAccountCommand(actor: AccountActor, command: AccountCommand): void {
  const demand = (target: readonly string[], message: string): void => {
    if (coversPermissions(actor.permissions, target)) return
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_FORBIDDEN, message, {
      outside: outsideOf(actor.permissions, target),
    })
  }

  switch (command.kind) {
    case 'role.create':
      demand(command.next, ACCOUNT_MESSAGES.higherRoleToEdit)
      return
    case 'role.update':
      if (command.next === undefined) return
      demand(command.current, ACCOUNT_MESSAGES.higherRoleToEdit)
      demand(command.next, ACCOUNT_MESSAGES.higherRoleToEdit)
      return
    case 'role.delete':
      demand(command.current, ACCOUNT_MESSAGES.higherRoleToEdit)
      return
    case 'user.create':
      demand(command.grant, ACCOUNT_MESSAGES.higherRoleToGrant)
      return
    case 'user.update':
      demand(command.current, ACCOUNT_MESSAGES.higherAccount)
      if (command.grant !== undefined) demand(command.grant, ACCOUNT_MESSAGES.higherRoleToGrant)
      return
    case 'user.resign':
    case 'user.resignDate':
    case 'user.rehire':
    case 'user.passwordReset':
    case 'user.unlock':
      // 🔴 되돌릴 수 없는 넷 — 자기 퇴사는 그 즉시 로그아웃되고, 자기 초기화는 임시 비밀번호를 보기 전에 세션이 끊긴다(hangang 화면 문구).
      //    재입사도 — 퇴사 예정인 본인이 자기 퇴사를 거두는 길이다(2d-3 스펙 ④ S1).
      if (command.targetUserNo === actor.userNo) {
        throw new BusinessError(CommonErrorCodes.ERR_COMMON_FORBIDDEN, ACCOUNT_MESSAGES.selfAccount)
      }
      demand(command.current, ACCOUNT_MESSAGES.higherAccount)
      return
    case 'session.target':
      demand(command.current, ACCOUNT_MESSAGES.higherAccountSessions)
      return
    default: {
      const exhaustive: never = command
      throw new Error(`모르는 계정 명령: ${String((exhaustive as { kind?: unknown }).kind)}`)
    }
  }
}
