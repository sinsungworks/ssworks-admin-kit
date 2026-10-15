import { Inject, Injectable } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_AUTH_CONFIG, AUTH_REPOSITORY, KYSELY } from '../tokens.js'
import type { AdminAuthRepository } from './auth.repository.js'
import { AUTH_MESSAGES } from './errors.js'
import { isLocked, needsReset, nextLoginState } from './login-policy.js'
import type { ResolvedAuthConfig } from './options.js'
import { checkPasswordWithCounter, updateLoginState } from './password-check.js'
import type { AdminPrincipal } from './principal.js'

// 정본: hangang-home apps/api/src/core/utils/password-recheck.ts `assertUserPrincipalWithPassword`
// 바꾼 점:
//  - 실패를 로그인 카운터에 센다(스펙 B2 — hangang 은 세지 않았다). 잠긴 계정은 423.
//  - DB 를 리포지토리로 읽는다(사용자 테이블 교체 지점, 스펙 ⑤ A1).
//  - 2f-2a(스펙 A11): 카운터 트랜잭션을 위해 KYSELY 를 받는다 — 리포지토리는 트랜잭션을 열지 않는다.

/**
 * 민감 작업 재인증 — 저장 요청 본문에 실려 온 비밀번호로 행위자 본인을 다시 확인한다.
 *  - 별도 엔드포인트를 만들지 않는다. 유효창을 두지 않는다 — 창을 두면 XSS 가 그 안에서 민감 쓰기를 전부 태운다(hangang).
 *  - 🔴 권한이 먼저, 재인증이 나중 — 가드가 통과시킨 뒤 서비스 진입부에서 부른다. 권한 없는 사람에게 비밀번호를 묻지 않는다.
 *  - 🔴 트랜잭션 안에서 부르지 마라 — argon2 수백 ms 동안 이미 잡은 행 잠금을 쥔다(hangang, ER_LOCK_WAIT_TIMEOUT).
 *  - 내 비밀번호 변경에는 걸지 않는다 — 그 본문이 이미 현재 비밀번호를 요구한다.
 */
@Injectable()
export class AdminReauthService {
  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
    @Inject(AUTH_REPOSITORY) private readonly repo: AdminAuthRepository,
    /** 카운터 트랜잭션(2f-2a 스펙 A11) */
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
  ) {}

  async verify(principal: AdminPrincipal, password: string): Promise<void> {
    const now = new Date()
    const credential = await this.repo.findCredentialByNo(principal.userNo)
    if (credential == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }
    if (isLocked(credential.lockUntil, now)) {
      throw new BusinessError(CommonErrorCodes.ERR_ACCOUNT_LOCKED, AUTH_MESSAGES.locked)
    }
    const check = await checkPasswordWithCounter(
      this.db,
      this.repo,
      credential,
      password,
      now,
      this.config.lockout,
    )
    if (!check.ok) {
      // 화면의 재인증 창이 이 코드로 "다시 묻기" 를 판정한다(admin-ui useWriteFlow).
      throw new BusinessError(CommonErrorCodes.ERR_REAUTH_REQUIRED, AUTH_MESSAGES.reauthFailed)
    }
    if (needsReset(credential)) {
      await updateLoginState(this.db, this.repo, credential.userNo, (current) =>
        nextLoginState(current, 'success', now, this.config.lockout),
      )
    }
  }
}
