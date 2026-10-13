import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import {
  ADMIN_ACCESS_POLICY,
  ADMIN_AUTH_CONFIG,
  ADMIN_AUTH_EVENTS,
  AUTH_REPOSITORY,
  KYSELY,
} from '../tokens.js'
import { AdminAccessTokenService } from './access-token.service.js'
import { isResigned, isSessionExpired } from './account-policy.js'
import type { AdminAuthRepository } from './auth.repository.js'
import { AUTH_MESSAGES } from './errors.js'
import type { AdminAccessPolicy, AdminAuthEvent, AdminAuthEventSink } from './hooks.js'
import { isLocked, needsReset, nextLoginState } from './login-policy.js'
import type { ResolvedAuthConfig } from './options.js'
import { checkPasswordWithCounter } from './password-check.js'
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password.js'
import type { AdminPrincipal } from './principal.js'
import { createRefreshToken, hashRefreshToken } from './refresh-token.js'
import { requestMetaOf } from './request-meta.js'
import { AdminSessionStore, type NewSessionInput } from './session.store.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.service.ts(로그인 · 회전 · 유예 · 재사용 · 로그아웃 멱등) +
//       hangang-home modules/auth/auth.service.ts(로그인 순서: 비밀번호 → 퇴사 → IP → 잠금) · core/guards/auth.guard.ts
//       (매 요청: 세션 → 사용자 → 퇴사 → IP) + ssworks-axion-admin checkSession(sessionNo, userNo) 소유 대조
// 바꾼 점:
//  - 사용자 쪽은 AUTH_REPOSITORY, 세션은 AdminSessionStore(스펙 ⑤ A1). Kysely 를 직접 쓰는 곳은 비밀번호 변경
//    트랜잭션 하나(Task 10).
//  - 감사 직접 호출 대신 ADMIN_AUTH_EVENTS, IP 평가 대신 ADMIN_ACCESS_POLICY — 둘 다 선택(스펙 ⑧ H1).
//  - 퇴사는 resignAt ≤ now(스펙 ④ R1 — hangang 사이트 시간대 · gise isActive 대신).
//  - 로그인 실패는 401 ERR_LOGIN_FAILED(hangang 은 404 ERR_NO_USER).

export interface AdminTokenPair {
  accessToken: string
  refreshToken: string
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger('AdminAuthService')

  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
    @Inject(AUTH_REPOSITORY) private readonly repo: AdminAuthRepository,
    private readonly sessions: AdminSessionStore,
    private readonly tokens: AdminAccessTokenService,
    /** 비밀번호 변경 트랜잭션(Task 10) */
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Optional() @Inject(ADMIN_ACCESS_POLICY) private readonly accessPolicy?: AdminAccessPolicy,
    @Optional() @Inject(ADMIN_AUTH_EVENTS) private readonly events?: AdminAuthEventSink,
  ) {}

  /**
   * 🔴 비밀번호 검증이 먼저다 — 존재 · 잠김 · 퇴사는 비밀번호를 아는 사람에게만 드러난다(gise · hangang 코드 리뷰 I1).
   * 실패 카운터는 비밀번호가 틀렸을 때만 오른다(hangang I2).
   */
  async login(input: { userId: string; password: string }, req: Request): Promise<AdminTokenPair> {
    const now = new Date()
    const credential = await this.repo.findCredentialByUserId(input.userId)

    if (credential == null) {
      // 🔴 없는 계정에도 argon2 를 한 번 태운다 — 응답 시간으로 계정이 열거되지 않게(gise). 결과는 버린다.
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password)
      await this.emit(
        { type: 'login.fail', userId: input.userId, userNo: null, loginFailCount: null },
        req,
      )
      throw loginFailed()
    }

    const check = await checkPasswordWithCounter(
      this.repo,
      credential,
      input.password,
      now,
      this.config.lockout,
    )
    if (!check.ok) {
      await this.emit(
        {
          type: 'login.fail',
          userId: input.userId,
          userNo: credential.userNo,
          loginFailCount: check.state.loginFailCount,
        },
        req,
      )
      throw loginFailed()
    }

    // 여기부터는 비밀번호가 맞았다 — 존재를 숨길 이유가 없다.
    if (isResigned(credential.resignAt, now)) {
      await this.emit(
        {
          type: 'login.blocked',
          reason: 'resigned',
          userId: input.userId,
          userNo: credential.userNo,
        },
        req,
      )
      throw new BusinessError(CommonErrorCodes.ERR_RESIGNED_USER, AUTH_MESSAGES.resigned)
    }

    if (this.accessPolicy != null) {
      const principal = await this.repo.findPrincipal(credential.userNo)
      const { clientIp } = requestMetaOf(req)
      const allowed = await this.accessPolicy.allows({
        clientIp,
        userNo: credential.userNo,
        teamNos: principal?.teamNo == null ? [] : [principal.teamNo],
      })
      if (!allowed) {
        await this.emit(
          { type: 'login.blocked', reason: 'ip', userId: input.userId, userNo: credential.userNo },
          req,
        )
        throw ipNotAllowed(clientIp)
      }
    }

    // 🔴 맞은 비밀번호도 잠긴 동안에는 막는다 — 잠금 중에 맞힌 대입이 통과하면 잠금이 무의미하다. 카운터는 건드리지 않는다.
    if (isLocked(credential.lockUntil, now)) {
      await this.emit(
        {
          type: 'login.blocked',
          reason: 'locked',
          userId: input.userId,
          userNo: credential.userNo,
        },
        req,
      )
      throw new BusinessError(CommonErrorCodes.ERR_ACCOUNT_LOCKED, AUTH_MESSAGES.locked)
    }

    if (needsReset(credential)) {
      await this.repo.saveLoginState(
        credential.userNo,
        nextLoginState(credential, 'success', now, this.config.lockout),
      )
    }

    const issued = this.newSession(credential.userNo, req, now)
    const sessionNo = await this.sessions.create({ ...issued.input, loginAt: now })
    await this.emit({ type: 'login.success', userNo: credential.userNo, sessionNo }, req)
    return {
      accessToken: this.tokens.sign({ userNo: credential.userNo, sessionNo }),
      refreshToken: issued.refreshToken,
    }
  }

  /**
   * 매 요청 — AdminAuthGuard 가 부른다. DB 왕복 둘(세션 · 주체). 🔴 권한은 토큰에 싣지 않고 매 요청 읽는다 — 역할을
   * 바꾸면 다음 요청부터 반영된다(gise). lastAccessAt 은 쓰지 않는다(15분마다 회전이 새 행을 만든다).
   */
  async authenticate(accessToken: string | undefined, req: Request): Promise<AdminPrincipal> {
    if (accessToken == null) {
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_UNAUTHORIZED, AUTH_MESSAGES.unauthorized)
    }
    const now = new Date()
    const claims = this.tokens.verify(accessToken, now)

    const session = await this.sessions.findByNo(claims.sessionNo)
    // 🔴 세션 행의 userNo 를 토큰과 대조한다(axion) — 서명 키가 새면 남의 세션 번호를 붙여 오는 것을 막는다.
    if (session == null || session.isRevoked || session.userNo !== claims.userNo) {
      throw sessionInvalid()
    }
    if (isSessionExpired(session.expireAt, now)) {
      throw new BusinessError(CommonErrorCodes.ERR_SESSION_EXPIRED, AUTH_MESSAGES.sessionExpired)
    }

    const record = await this.repo.findPrincipal(claims.userNo)
    if (record == null) throw sessionInvalid()
    if (isResigned(record.resignAt, now)) {
      throw new BusinessError(CommonErrorCodes.ERR_RESIGNED_USER, AUTH_MESSAGES.resigned)
    }

    if (this.accessPolicy != null) {
      const { clientIp } = requestMetaOf(req)
      const allowed = await this.accessPolicy.allows({
        clientIp,
        userNo: record.userNo,
        teamNos: record.teamNo == null ? [] : [record.teamNo],
      })
      if (!allowed) {
        // 🔴 거부를 던지기 전에 남긴다 — 감사 인터셉터는 가드 뒤라 이 요청을 보지 못한다(hangang I4).
        await this.emit(
          {
            type: 'access.blocked',
            reason: 'ip',
            userNo: record.userNo,
            sessionNo: session.sessionNo,
          },
          req,
        )
        throw ipNotAllowed(clientIp)
      }
    }

    return {
      userNo: record.userNo,
      sessionNo: session.sessionNo,
      userId: record.userId,
      userName: record.userName,
      roleNo: record.roleNo,
      roleName: record.roleName,
      teamNo: record.teamNo,
      teamName: record.teamName,
      // 🔴 강제 변경 계정은 권한을 비운다(gise) — 가드의 허용 표시와 함께 이중으로 막는다.
      permissions: record.isPasswordChangeRequired ? [] : record.permissions,
      isPasswordChangeRequired: record.isPasswordChangeRequired,
    }
  }

  /** 새 refresh 토큰과 세션 입력(loginAt 제외). 원문은 응답 쿠키로만 나가고 DB 에는 해시만 들어간다. */
  private newSession(
    userNo: bigint,
    req: Request,
    now: Date,
  ): { refreshToken: string; input: Omit<NewSessionInput, 'loginAt'> } {
    const meta = requestMetaOf(req)
    const refreshToken = createRefreshToken()
    return {
      refreshToken,
      input: {
        userNo,
        refreshTokenHash: hashRefreshToken(refreshToken),
        userAgent: meta.userAgent,
        ipAddress: meta.clientIp,
        now,
        expireAt: new Date(now.getTime() + this.config.refreshTtlMs),
      },
    }
  }

  /** 🔴 기록기가 던져도 인증은 계속된다(스펙 B8). 메시지에 이벤트 내용을 싣지 않는다. */
  private async emit(event: AdminAuthEvent, req: Request): Promise<void> {
    if (this.events == null) return
    try {
      await this.events.record(event, req)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`인증 이벤트 ${event.type} 를 기록하지 못했다: ${reason}`)
    }
  }
}

function loginFailed(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_LOGIN_FAILED, AUTH_MESSAGES.loginFailed)
}

function sessionInvalid(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.sessionInvalid)
}

function ipNotAllowed(clientIp: string | null): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_IP_NOT_ALLOWED, AUTH_MESSAGES.ipNotAllowed, {
    clientIp,
  })
}
