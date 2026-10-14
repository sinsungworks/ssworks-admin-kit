import { BusinessError, CommonErrorCodes, definePermissions } from '@ssworks/admin-shared'
import type { ResolvedAccountsConfig, ResolvedUsersConfig } from '../accounts/options.js'
import type { AdminPrincipal } from '../auth/principal.js'

// 테스트 전용 — 역할 · 사용자 판정의 카탈로그와 주체(2d). 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).

/** 함의: write ⇒ read, posts delete ⇒ write ⇒ read(연쇄). 카탈로그 순서가 정규화 순서다 */
export const TEST_CATALOG = definePermissions(
  {
    USERS_READ: 'org.users:read',
    USERS_WRITE: 'org.users:write',
    ROLES_READ: 'org.roles:read',
    ROLES_WRITE: 'org.roles:write',
    AUDIT_LOG_READ: 'setting.auditLog:read',
    POSTS_READ: 'board.posts:read',
    POSTS_WRITE: 'board.posts:write',
    POSTS_DELETE: 'board.posts:delete',
  },
  {
    implies: {
      'org.users:write': ['org.users:read'],
      'org.roles:write': ['org.roles:read'],
      'board.posts:write': ['board.posts:read'],
      'board.posts:delete': ['board.posts:write'],
    },
  },
)

export function accountsConfig(reauth = false): ResolvedAccountsConfig {
  return Object.freeze({ catalog: TEST_CATALOG, reauth })
}

/** 사용자 서비스 설정 — 기준 시간대 기본 Asia/Seoul */
export function usersConfig(reauth = false, timeZone = 'Asia/Seoul'): ResolvedUsersConfig {
  return Object.freeze({ catalog: TEST_CATALOG, reauth, timeZone })
}

/** 판정에 쓰는 주체 — userNo · permissions 만 의미가 있다 */
export function testPrincipal(userNo: bigint, permissions: readonly string[]): AdminPrincipal {
  return {
    userNo,
    sessionNo: 1n,
    userId: `u${userNo}`,
    userName: '시험',
    roleNo: 1n,
    roleName: '시험',
    teamNo: null,
    teamName: null,
    permissions,
    isPasswordChangeRequired: false,
  }
}

/** `AdminReauthService` 대역 — 'right-password' 만 받는다. 받은 값을 차례로 남긴다 */
export class FakeReauth {
  readonly calls: string[] = []

  async verify(_principal: AdminPrincipal, password: string): Promise<void> {
    this.calls.push(password)
    if (password !== 'right-password') {
      throw new BusinessError(CommonErrorCodes.ERR_REAUTH_REQUIRED, '비밀번호가 올바르지 않습니다.')
    }
  }
}
