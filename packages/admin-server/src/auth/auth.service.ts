import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import type { Kysely, Transaction } from 'kysely'
import { runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { validationError } from '../http/validation.js'
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
import { isLocked, needsReset } from './login-policy.js'
import type { ResolvedAuthConfig } from './options.js'
import { checkPasswordWithCounter } from './password-check.js'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js'
import type { AdminPrincipal } from './principal.js'
import { createRefreshToken, hashRefreshToken } from './refresh-token.js'
import { judgeRotatedReuse } from './refresh-policy.js'
import { requestMetaOf } from './request-meta.js'
import { AdminSessionStore, type AdminSessionRow, type NewSessionInput } from './session.store.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.service.ts(로그인 · 회전 · 유예 · 재사용 · 로그아웃 멱등) +
//       hangang-home modules/auth/auth.service.ts(로그인 순서: 비밀번호 → 퇴사 → IP → 잠금 — 여기서는 잠금이 퇴사 앞) · core/guards/auth.guard.ts
//       (매 요청: 세션 → 사용자 → 퇴사 → IP) + ssworks-axion-admin checkSession(sessionNo, userNo) 소유 대조
// 바꾼 점:
//  - 사용자 쪽은 AUTH_REPOSITORY, 세션은 AdminSessionStore(스펙 ⑤ A1). Kysely 를 직접 쓰는 곳은 비밀번호 변경
//    트랜잭션 하나(Task 10).
//  - 감사 직접 호출 대신 ADMIN_AUTH_EVENTS, IP 평가 대신 ADMIN_ACCESS_POLICY — 둘 다 선택(스펙 ⑧ H1).
//  - 퇴사는 resignAt ≤ now(스펙 ④ R1 — hangang 사이트 시간대 · gise isActive 대신).
//  - 로그인 실패는 401 ERR_LOGIN_FAILED(hangang 은 404 ERR_NO_USER).
//  - 잠김은 맞은 비밀번호 바로 다음 — 잠긴 동안은 같은 401(최종 리뷰 F1). hangang · gise 는 423 이었다.
//  - 클라이언트 IP 는 코어 옵션 clientIp 출처(config.clientIp)로 읽는다(2f-1 스펙 ④ C1).
//  - refresh · 유예 발급에도 IP 를 본다(2f-1 스펙 P11) — hangang 은 refresh 가 @Public 이라 막힌 주소에서도 회전했다.
//  - 🔴 회전 · 유예 발급은 users 를 세션보다 먼저 공유 잠금으로 잡는다(lockCredential 'share' — 2f-2a 스펙 A7 · A8). 퇴사 ·
//    초기화 · 본인 비밀번호 변경(users X → 세션)과 같은 순서라 교착이 없다(2d R10-3). IP 는 그 트랜잭션 앞 — 잠금을 쥔 채
//    정책을 묻지 않는다(그래서 refresh 는 IP → 퇴사 순서).
//  - 🔴 로그인 순서는 IP → 비밀번호 → 확정 트랜잭션(잠김 → 퇴사 → 되돌림 → 세션)이다(2f-2a 스펙 ② I1 · A1 · A2). 막힌 주소는
//    비밀번호를 보지 않고 같은 401 — 정답 오라클 · 바깥의 잠금 DoS 가 없다(hangang · 2b 는 비밀번호 뒤 IP 403 이었다). 확정
//    트랜잭션이 users 를 세션보다 먼저 잠그고 그 행으로 판정해, 검증 뒤 커밋된 초기화 · 즉시 퇴사를 본다(로그인 TOCTOU).

export interface AdminTokenPair {
  accessToken: string
  refreshToken: string
}

/** IP 판정 하나의 결과(2f-2a 스펙 A13) — 판정만 담는다. 이벤트 · 오류는 부른 쪽이 낸다 */
type IpVerdict = { allowed: true } | { allowed: false; clientIp: string | null }

/** 로그인 확정 트랜잭션의 판정(2f-2a 스펙 A2) — 트랜잭션은 값을 돌려주고 이벤트 · 오류는 커밋 뒤에 낸다 */
type LoginOutcome =
  | { kind: 'ok'; sessionNo: bigint }
  | { kind: 'stale'; loginFailCount: number | null }
  | { kind: 'locked' }
  | { kind: 'resigned' }

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger('AdminAuthService')

  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
    @Inject(AUTH_REPOSITORY) private readonly repo: AdminAuthRepository,
    private readonly sessions: AdminSessionStore,
    private readonly tokens: AdminAccessTokenService,
    /** 비밀번호 변경 트랜잭션 */
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Optional() @Inject(ADMIN_ACCESS_POLICY) private readonly accessPolicy?: AdminAccessPolicy,
    @Optional() @Inject(ADMIN_AUTH_EVENTS) private readonly events?: AdminAuthEventSink,
  ) {}

  /**
   * 🔴 순서: (정책이 있으면) IP → 비밀번호 → 확정 트랜잭션(잠김 → 퇴사 → 되돌림 → 세션)(2f-2a 스펙 §5-1). 존재 · 잠김 · 퇴사는
   * 비밀번호를 아는 사람에게만 드러난다(gise · hangang 코드 리뷰 I1). IP 는 비밀번호보다 먼저라 막힌 주소에서는 아무것도
   * 드러나지 않는다. 실패 카운터는 비밀번호가 틀렸을 때만 오르고(hangang I2) 성공 직전에만 되돌린다.
   */
  async login(input: { userId: string; password: string }, req: Request): Promise<AdminTokenPair> {
    const now = new Date()
    const credential = await this.repo.findCredentialByUserId(input.userId)

    if (credential == null) {
      // 🔴 없는 계정에도 argon2 를 한 번 태운다 — 응답 시간으로 계정이 열거되지 않게(gise). 결과는 버린다. IP 는 보지 않는다 —
      //    응답이 어차피 같은 401 이다.
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password)
      await this.emit(
        { type: 'login.fail', userId: input.userId, userNo: null, loginFailCount: null },
        req,
      )
      throw this.loginFailed()
    }

    // 🔴 IP 는 비밀번호보다 먼저다(2f-2a 스펙 ② I1 · A4) — 막힌 주소에서는 비밀번호 · 잠김 · 퇴사를 보지 않는다. 맞은 비밀번호에만
    //    다른 응답(403)을 주면 막힌 주소에서도 정답을 알아내고, 틀린 비밀번호를 세면 바깥에서 계정을 잠근다. 더미 argon2 로 없는
    //    계정 · 틀린 비밀번호와 같은 비용을 치른다.
    const verdict = await this.ipVerdict(credential.userNo, req)
    if (!verdict.allowed) {
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password)
      await this.emit(
        { type: 'login.blocked', reason: 'ip', userId: input.userId, userNo: credential.userNo },
        req,
      )
      throw this.loginFailed()
    }

    const check = await checkPasswordWithCounter(
      this.db,
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
      throw this.loginFailed()
    }

    const issued = this.newSession(credential.userNo, req, now)
    const outcome = await runWriteTransaction(this.db, async (trx): Promise<LoginOutcome> => {
      // 🔴 첫 문장이 잠금 읽기다(2f-2a 스펙 A2) — users 를 세션보다 먼저 잡고(초기화 · 퇴사와 같은 순서), 스냅샷 격리 ON 에서도
      //    읽기 뷰를 먼저 열지 않는다. 판정은 이 행으로 한다 — 검증 전에 읽은 credential 로 하면 그사이 커밋된 초기화 · 즉시 퇴사를
      //    못 보고 옛 비밀번호의 세션을 남긴다(로그인 TOCTOU).
      const locked = await this.repo.lockCredential(trx, credential.userNo, 'update')
      // 검증한 뒤 비밀번호가 바뀌었다(초기화 · 본인 변경) — 대입 시도가 아니니 세지 않는다(스펙 A3).
      if (locked == null || locked.passwordHash !== credential.passwordHash) {
        return { kind: 'stale', loginFailCount: locked?.loginFailCount ?? null }
      }
      // 🔴 잠김은 퇴사보다 먼저 — 잠긴 동안은 맞든 틀리든 같은 401 이다(2b 최종 리뷰 F1, 2026-10-13 사용자 결정).
      if (isLocked(locked.lockUntil, now)) return { kind: 'locked' }
      if (isResigned(locked.resignAt, now)) return { kind: 'resigned' }
      // 되돌림은 성공 직전에만 — 잠김 · 퇴사 · IP 로 막힌 맞은 비밀번호는 카운터를 그대로 둔다(스펙 §6 #3).
      if (needsReset(locked)) {
        await this.repo.writeLoginState(trx, credential.userNo, {
          loginFailCount: 0,
          lockUntil: null,
        })
      }
      const sessionNo = await this.sessions.create({ ...issued.input, loginAt: now }, trx)
      return { kind: 'ok', sessionNo }
    })

    if (outcome.kind === 'ok') {
      await this.emit(
        { type: 'login.success', userNo: credential.userNo, sessionNo: outcome.sessionNo },
        req,
      )
      return {
        accessToken: this.tokens.sign({ userNo: credential.userNo, sessionNo: outcome.sessionNo }),
        refreshToken: issued.refreshToken,
      }
    }
    if (outcome.kind === 'resigned') {
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
    if (outcome.kind === 'locked') {
      await this.emit(
        {
          type: 'login.blocked',
          reason: 'locked',
          userId: input.userId,
          userNo: credential.userNo,
        },
        req,
      )
      throw this.loginFailed()
    }
    await this.emit(
      {
        type: 'login.fail',
        userId: input.userId,
        userNo: credential.userNo,
        loginFailCount: outcome.loginFailCount,
      },
      req,
    )
    throw this.loginFailed()
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

    const verdict = await this.ipVerdict(record.userNo, req, record.teamNo)
    if (!verdict.allowed) {
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
      throw ipNotAllowed(verdict.clientIp)
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

  /**
   * 회전(스펙 §5-3 · 2f-2a 스펙 §5-2). 🔴 'rotated' 만 재사용 판정 대상이다 — 'terminated'(로그아웃 · 강제 종료)를 재사용으로
   * 보면 세션 하나를 끊었을 뿐인데 전 기기가 로그아웃된다(hangang 011).
   */
  async refresh(refreshToken: string | undefined, req: Request): Promise<AdminTokenPair> {
    if (refreshToken == null) {
      throw new BusinessError(
        CommonErrorCodes.ERR_COMMON_UNAUTHORIZED,
        AUTH_MESSAGES.refreshMissing,
      )
    }
    const now = new Date()
    const row = await this.sessions.findByRefreshHash(hashRefreshToken(refreshToken))
    if (row == null) {
      throw new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshInvalid)
    }

    if (row.isRevoked) {
      // P2 — 다른 탭의 회전이 이 읽기보다 먼저 커밋됐다.
      if (row.revokedReason === 'rotated') return this.reuseOfRotated(row, req, now)
      throw refreshEnded()
    }

    if (isSessionExpired(row.expireAt, now)) {
      // 🔴 EXPIRED_TOKEN 이 아니다 — 그것은 "액세스 토큰이 만료됐으니 갱신하라" 는 신호다. 갱신 안에서 그 코드를 쓰면
      //    반드시 실패할 왕복을 하나 더 태운다(gise).
      throw new BusinessError(CommonErrorCodes.ERR_SESSION_EXPIRED, AUTH_MESSAGES.refreshExpired)
    }

    // 🔴 퇴사는 회전 전에 막는다 — 새 토큰을 내주지 않는다. 강제 변경 · 잠김은 회전한다.
    const issued = this.newSession(row.userNo, req, now)
    const sessionNo = await this.underUserLock(row, req, now, (trx) =>
      this.sessions.rotate(trx, { sessionNo: row.sessionNo, loginAt: row.loginAt }, issued.input),
    )
    if (sessionNo == null) {
      // P1 — 두 요청이 위의 읽기를 둘 다 통과한 뒤 조건부 UPDATE 에서 갈렸다(정본이 놓친 경로 — 실제로는 이쪽이 더 잦다, gise).
      // 또는 초기화 · 퇴사 · 로그아웃이 먼저 끊었다. 🔴 트랜잭션 밖에서 다시 읽는다 — 위의 row 는 회전 전 스냅숏이다.
      const current = await this.sessions.findByNo(row.sessionNo)
      if (current == null || current.revokedReason !== 'rotated') throw refreshEnded()
      // 🔴 유예가 꺼져 있으면 전량 폐기하지 않는다 — 흔한 탭 경쟁 한 번에 전 기기가 로그아웃된다(hangang).
      if (this.config.refreshGraceMs === 0) {
        throw new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshRaced)
      }
      return this.reuseOfRotated(current, req, now)
    }

    await this.emit(
      {
        type: 'token.refresh',
        userNo: row.userNo,
        sessionNo,
        rotatedFrom: row.sessionNo,
        grace: false,
      },
      req,
    )
    return {
      accessToken: this.tokens.sign({ userNo: row.userNo, sessionNo }),
      refreshToken: issued.refreshToken,
    }
  }

  /**
   * 🔴 액세스 토큰이 만료된 상태에서도 성공해야 쿠키가 지워진다 — @Public 이라 주체가 없고, refresh 쿠키가 세션을
   * 지목한다(gise C1). 이미 폐기된 행 · 모르는 토큰은 아무 일도 하지 않는다(멱등).
   */
  async logout(refreshToken: string | undefined, req: Request): Promise<void> {
    if (refreshToken == null) return
    const row = await this.sessions.findByRefreshHash(hashRefreshToken(refreshToken))
    // 🔴 이미 폐기된 행은 건드리지 않는다 — 'rotated' 를 'terminated' 로 덮으면 재사용 탐지가 꺼진다(gise).
    if (row == null || row.isRevoked) return
    if ((await this.sessions.revoke(row.sessionNo, 'terminated', new Date())) > 0) {
      await this.emit({ type: 'logout', userNo: row.userNo, sessionNo: row.sessionNo }, req)
    }
  }

  /**
   * 내 비밀번호 변경(스펙 §5-4). 본문은 이미 쓰는 쪽 정책 스키마를 지났다 — 길이 · 새 = 현재는 400 이 저절로 났다.
   * 🔴 잠김을 먼저 본다(gise — 이미 인증된 본인이라 계정 존재를 숨길 이유가 없다). 틀린 현재 비밀번호는 로그인 실패로
   *    센다(스펙 B2) — 세션을 쥔 사람이 이 경로로 비밀번호를 대입하지 못하게.
   */
  async changePassword(
    principal: AdminPrincipal,
    body: { currentPassword: string; newPassword: string },
    req: Request,
  ): Promise<void> {
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
      body.currentPassword,
      now,
      this.config.lockout,
    )
    if (!check.ok) {
      // 🔴 3c W1 — admin-ui PasswordChangeForm 이 이 경로를 '현재 비밀번호' 칸 옆에 낸다.
      throw validationError([
        {
          path: ['currentPassword'],
          code: 'custom',
          message: AUTH_MESSAGES.currentPasswordMismatch,
        },
      ])
    }

    // 🔴 argon2 는 트랜잭션 밖이다.
    const newHash = await hashPassword(body.newPassword)
    const revokedCount = await runWriteTransaction(this.db, async (trx) => {
      const changed = await this.repo.changePassword(
        trx,
        credential.userNo,
        credential.passwordHash,
        newHash,
      )
      // 검증 뒤 다른 쓰기(다른 세션의 변경 · 관리자 초기화)가 먼저 커밋했다(gise).
      if (changed === 0) {
        throw new BusinessError(
          CommonErrorCodes.ERR_COMMON_CONFLICT,
          AUTH_MESSAGES.passwordConflict,
        )
      }
      // 현재 세션은 남기고 나머지를 끊는다(gise · 3c §9).
      return this.sessions.revokeAllOfUser(credential.userNo, 'terminated', now, {
        exceptSessionNo: principal.sessionNo,
        trx,
      })
    })
    // 커밋 뒤에 낸다(스펙 B8). 같은 트랜잭션 감사는 2c 가 정한다.
    await this.emit(
      {
        type: 'password.change',
        userNo: credential.userNo,
        sessionNo: principal.sessionNo,
        revokedCount,
      },
      req,
    )
  }

  /** P1 · P2 가 같은 답을 내도록 판정을 한 곳에 둔다(gise). */
  private async reuseOfRotated(
    row: AdminSessionRow,
    req: Request,
    now: Date,
  ): Promise<AdminTokenPair> {
    const successor =
      row.replacedBySessionNo == null ? null : await this.sessions.findByNo(row.replacedBySessionNo)

    if (judgeRotatedReuse(row, successor, now, this.config.refreshGraceMs) === 'grace') {
      // 🔴 새 세션을 하나 더 준다. 이긴 탭의 세션은 건드리지 않는다 — 원문을 저장하지 않으니 같은 쿠키를 줄 수 없고,
      //    두 응답 중 나중에 도착한 쪽이 쿠키를 덮어도 살아 있는 토큰만 남아야 한다(gise). 링크는 하지 않는다.
      const issued = this.newSession(row.userNo, req, now)
      const sessionNo = await this.underUserLock(row, req, now, (trx) =>
        this.sessions.create({ ...issued.input, loginAt: row.loginAt }, trx),
      )
      await this.emit(
        {
          type: 'token.refresh',
          userNo: row.userNo,
          sessionNo,
          rotatedFrom: row.sessionNo,
          grace: true,
        },
        req,
      )
      return {
        accessToken: this.tokens.sign({ userNo: row.userNo, sessionNo }),
        refreshToken: issued.refreshToken,
      }
    }

    // 🔴 정상 클라이언트라면 버렸을 값이다. 그 값을 가진 다른 주체가 있으니 누가 진짜인지 알 수 없다 — 전부 끊는다.
    const revokedCount = await this.sessions.revokeAllOfUser(row.userNo, 'reuse_detected', now)
    await this.emit(
      { type: 'token.reuse', userNo: row.userNo, sessionNo: row.sessionNo, revokedCount },
      req,
    )
    throw new BusinessError(CommonErrorCodes.ERR_REFRESH_REUSED, AUTH_MESSAGES.refreshReused)
  }

  /**
   * 회전 · 유예 발급(2f-2a 스펙 A7 · A8) — IP(비잠금) → 트랜잭션: users 공유 잠금(첫 문장) → 계정 없음 401 · 퇴사 403 → write.
   * 🔴 users 를 세션보다 먼저 잡는다 — 즉시 퇴사 · 초기화 · 본인 비밀번호 변경(users X → 세션 X)과 같은 순서라 교착이 없다
   *    (2d R10-3). 공유 잠금이라 같은 사용자의 다른 세션 회전과는 줄을 서지 않는다(회전은 users 를 쓰지 않아 승격이 없다).
   * 🔴 IP 는 트랜잭션 앞이다 — 잠금을 쥔 채 정책을 묻지 않는다. 막혀도 회전 대상 행은 그대로라 허용된 주소에서 같은 토큰을
   *    다시 보내면 회전한다(2f-1 스펙 P11). 없음 · 퇴사는 이벤트가 없어 트랜잭션 안에서 던진다 — 롤백할 쓰기가 없다(§14 R2-⑧).
   */
  private async underUserLock<R>(
    row: AdminSessionRow,
    req: Request,
    now: Date,
    write: (trx: Transaction<AdminDatabase>) => Promise<R>,
  ): Promise<R> {
    const verdict = await this.ipVerdict(row.userNo, req)
    if (!verdict.allowed) {
      await this.emit(
        { type: 'access.blocked', reason: 'ip', userNo: row.userNo, sessionNo: row.sessionNo },
        req,
      )
      throw ipNotAllowed(verdict.clientIp)
    }
    return runWriteTransaction(this.db, async (trx) => {
      const credential = await this.repo.lockCredential(trx, row.userNo, 'share')
      if (credential == null) throw sessionInvalid()
      if (isResigned(credential.resignAt, now)) {
        throw new BusinessError(CommonErrorCodes.ERR_RESIGNED_USER, AUTH_MESSAGES.resigned)
      }
      return write(trx)
    })
  }

  /**
   * IP 판정 하나(2f-2a 스펙 A13) — 로그인 · 가드 · refresh · 유예 발급이 부른다. 정책이 없으면(IP 모듈 없음) 늘 허용.
   * 대표 팀은 `teamNo` 를 주면 그것(가드 — 이미 읽은 주체), 아니면 findPrincipal(가드와 같은 MIN(teamNo) — hangang R34).
   */
  private async ipVerdict(
    userNo: bigint,
    req: Request,
    teamNo?: bigint | null,
  ): Promise<IpVerdict> {
    if (this.accessPolicy == null) return { allowed: true }
    const team =
      teamNo !== undefined ? teamNo : ((await this.repo.findPrincipal(userNo))?.teamNo ?? null)
    const { clientIp } = requestMetaOf(req, this.config.clientIp)
    const allowed = await this.accessPolicy.allows({
      clientIp,
      userNo,
      teamNos: team == null ? [] : [team],
    })
    return allowed ? { allowed: true } : { allowed: false, clientIp }
  }

  /** 새 refresh 토큰과 세션 입력(loginAt 제외). 원문은 응답 쿠키로만 나가고 DB 에는 해시만 들어간다. */
  private newSession(
    userNo: bigint,
    req: Request,
    now: Date,
  ): { refreshToken: string; input: Omit<NewSessionInput, 'loginAt'> } {
    const meta = requestMetaOf(req, this.config.clientIp)
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

  /** 로그인 401 — 정책이 주입됐으면 접속 위치까지 말한다(2f-2a 스펙 A5). 한 배포 안에서 모든 로그인 실패가 같은 문구다 */
  private loginFailed(): BusinessError {
    return new BusinessError(
      CommonErrorCodes.ERR_LOGIN_FAILED,
      this.accessPolicy == null ? AUTH_MESSAGES.loginFailed : AUTH_MESSAGES.loginFailedWithIp,
    )
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

function refreshEnded(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.refreshEnded)
}

function sessionInvalid(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.sessionInvalid)
}

function ipNotAllowed(clientIp: string | null): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_IP_NOT_ALLOWED, AUTH_MESSAGES.ipNotAllowed, {
    clientIp,
  })
}
