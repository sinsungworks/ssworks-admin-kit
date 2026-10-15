import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  BusinessError,
  CommonErrorCodes,
  CoreAuditActions,
  CoreAuditTargets,
} from '@ssworks/admin-shared'
import type { Request } from 'express'
import type { AdminAuthEvent, AdminAuthEventSink } from '../auth/hooks.js'
import { resolveErrorResponse } from '../http/error-response.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_AUDIT_CONFIG, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminAuditService, reasonOf } from './audit.service.js'
import { clampErrorCode, requestFieldsOf } from './entry.js'
import type { ResolvedAuditConfig } from './options.js'
import { serializeAuditMeta } from './scrub.js'

// 정본: hangang-home apps/api/src/modules/auth/auth.service.ts `recordFromRequest` · `denyAndRecord` 호출 다섯 갈래
// 바꾼 점: 인증 서비스가 직접 부르지 않고 2b 의 ADMIN_AUTH_EVENTS 를 채운다(2b 스펙 ⑧ H1 · 2c 스펙 공통 11). 인증
//   컨트롤러의 로그인 · refresh · 로그아웃은 @Public 이라 인터셉터가 주체를 모른다 — 그래서 이벤트로 받는다.
//   실패의 상태는 resolveErrorResponse 로 낸다 — 쓰는 쪽 errorCodes 가 상태를 덮어도 필터가 보낸 값과 같다.

export interface AuthEventAudit {
  actorUserNo: bigint | null
  sessionNo: bigint | null
  action: string
  targetType: string | null
  targetRefNo: bigint | null
  /** null = 성공(200) */
  errorCode: string | null
  meta: Record<string, unknown> | null
}

const BLOCKED = {
  resigned: {
    action: CoreAuditActions.AUTH_LOGIN_BLOCKED_INACTIVE,
    errorCode: CommonErrorCodes.ERR_RESIGNED_USER,
  },
  ip: {
    action: CoreAuditActions.AUTH_LOGIN_BLOCKED_IP,
    errorCode: CommonErrorCodes.ERR_IP_NOT_ALLOWED,
  },
  // 🔴 잠긴 동안의 로그인은 실패와 같은 401 ERR_LOGIN_FAILED 다(2b 스펙 §14 R7) — 감사도 응답과 같은 코드를 남긴다.
  locked: {
    action: CoreAuditActions.AUTH_LOGIN_BLOCKED_LOCKED,
    errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
  },
} as const

/**
 * 인증 이벤트 → 감사 행의 의미 부분(2c 스펙 §5-5 표). 🔴 이벤트에는 비밀번호 · 토큰 · 해시가 없다(2b). `login.fail` 의
 * `userId` 는 사람이 친 원문이다 — 비밀번호를 아이디 칸에 친 사고가 그대로 남는다(README 에 적는다).
 */
export function auditEntryOfAuthEvent(event: AdminAuthEvent): AuthEventAudit {
  switch (event.type) {
    case 'login.success':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_LOGIN_SUCCESS,
        targetType: CoreAuditTargets.USER,
        targetRefNo: event.userNo,
        errorCode: null,
        meta: null,
      }
    case 'login.fail':
      return {
        actorUserNo: event.userNo,
        sessionNo: null,
        action: CoreAuditActions.AUTH_LOGIN_FAIL,
        targetType: event.userNo == null ? null : CoreAuditTargets.USER,
        targetRefNo: event.userNo,
        errorCode: CommonErrorCodes.ERR_LOGIN_FAILED,
        meta: { userId: event.userId, loginFailCount: event.loginFailCount },
      }
    case 'login.blocked':
      return {
        actorUserNo: event.userNo,
        sessionNo: null,
        action: BLOCKED[event.reason].action,
        targetType: CoreAuditTargets.USER,
        targetRefNo: event.userNo,
        errorCode: BLOCKED[event.reason].errorCode,
        meta: { userId: event.userId },
      }
    case 'token.refresh':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_TOKEN_REFRESH,
        targetType: CoreAuditTargets.SESSION,
        targetRefNo: event.sessionNo,
        errorCode: null,
        meta: { rotatedFrom: event.rotatedFrom, grace: event.grace },
      }
    case 'token.reuse':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_TOKEN_REUSE,
        targetType: CoreAuditTargets.SESSION,
        targetRefNo: event.sessionNo,
        errorCode: CommonErrorCodes.ERR_REFRESH_REUSED,
        meta: { revokedCount: event.revokedCount },
      }
    case 'logout':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_LOGOUT,
        targetType: CoreAuditTargets.SESSION,
        targetRefNo: event.sessionNo,
        errorCode: null,
        meta: null,
      }
    case 'password.change':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_PASSWORD_CHANGE,
        targetType: CoreAuditTargets.USER,
        targetRefNo: event.userNo,
        errorCode: null,
        meta: { revokedCount: event.revokedCount },
      }
    case 'access.blocked':
      return {
        actorUserNo: event.userNo,
        sessionNo: event.sessionNo,
        action: CoreAuditActions.AUTH_ACCESS_BLOCKED_IP,
        targetType: CoreAuditTargets.SESSION,
        targetRefNo: event.sessionNo,
        errorCode: CommonErrorCodes.ERR_IP_NOT_ALLOWED,
        meta: null,
      }
  }
}

/** `ADMIN_AUTH_EVENTS` 구현 — AdminAuditModule 이 전역으로 낸다(2c 스펙 §4-2, §14 R1-2 실측) */
@Injectable()
export class AdminAuditEventSink implements AdminAuthEventSink {
  constructor(
    private readonly audit: AdminAuditService,
    @Inject(ADMIN_AUDIT_CONFIG) private readonly config: ResolvedAuditConfig,
    @Optional() @Inject(ADMIN_SERVER_OPTIONS) private readonly options?: AdminServerOptions,
  ) {}

  /** 🔴 던지지 않는다 — 인증은 계속된다(2b 스펙 B8). 2b 의 emit 도 한 번 더 잡는다 */
  async record(event: AdminAuthEvent, req: Request): Promise<void> {
    try {
      const entry = auditEntryOfAuthEvent(event)
      await this.audit.insert({
        actorUserNo: entry.actorUserNo,
        sessionNo: entry.sessionNo,
        action: entry.action,
        targetType: entry.targetType,
        targetRefNo: entry.targetRefNo,
        ...requestFieldsOf(req, this.config.clientIp),
        statusCode:
          entry.errorCode == null
            ? 200
            : resolveErrorResponse(
                new BusinessError(entry.errorCode, entry.action),
                this.options?.errorCodes,
              ).status,
        errorCode: clampErrorCode(entry.errorCode),
        meta: entry.meta == null ? null : serializeAuditMeta(entry.meta, this.config.secretKeys),
      })
    } catch (error) {
      this.audit.warn(`인증 이벤트 ${event.type} 의 감사 기록 준비 실패: ${reasonOf(error)}`)
    }
  }
}
