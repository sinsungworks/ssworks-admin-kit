import {
  Inject,
  Injectable,
  Optional,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request, Response } from 'express'
import { catchError, from, map, mergeMap, throwError, type Observable } from 'rxjs'
import { getAdminPrincipal } from '../auth/principal.js'
import { resolveErrorResponse } from '../http/error-response.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_AUDIT_CONFIG, ADMIN_SERVER_OPTIONS, AUDIT_META } from '../tokens.js'
import type { AuditDeclaration } from './audit.decorator.js'
import { AdminAuditService, reasonOf } from './audit.service.js'
import { buildAuditEntry, type AuditOutcome } from './entry.js'
import type { ResolvedAuditConfig } from './options.js'

// 정본: hangang-home apps/api/src/core/audit/audit.interceptor.ts
// 바꾼 점:
//  - 실패의 상태 · 코드는 resolveErrorResponse — 예외 필터가 실제로 보내는 값과 같다(2c 스펙 공통 10 · ⑧ F1). hangang 은
//    `err.getStatus()` 라 BusinessError 가 모두 500 으로 남았다. 오류 코드 컬럼을 더 채운다(⑥ TB2).
//  - 주체는 req.admin(2b) — hangang 은 req.user.
// 순서(2c 스펙 §14 R1-1 실측): 가드 → Nest 가 성공 상태를 정한다 → 봉투 인터셉터 → 이 인터셉터 → 핸들러. 이 인터셉터는 봉투
//   안쪽이라 핸들러의 원래 반환값을 본다(읽지 않는다). 가드 거부(401 · 403)는 여기 오지 않는다.

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AdminAuditService,
    @Inject(ADMIN_AUDIT_CONFIG) private readonly config: ResolvedAuditConfig,
    @Optional() @Inject(ADMIN_SERVER_OPTIONS) private readonly options?: AdminServerOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const meta = this.reflector.getAllAndOverride<AuditDeclaration | undefined>(AUDIT_META, [
      context.getHandler(),
      context.getClass(),
    ])
    if (meta == null) return next.handle()

    const http = context.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()

    return next.handle().pipe(
      // 🔴 실패도 남긴다 — 기록을 **기다린 뒤** 원래 예외를 그대로 다시 던진다.
      // 🔴 catchError 가 mergeMap 앞이다 — 반대면 성공 경로 기록이 실패할 때 그것을 다시 잡아 같은 요청이 두 번 기록된다.
      catchError((error: unknown) =>
        from(this.write(req, meta, () => this.failureOf(error))).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
      // 성공 경로 — 응답을 내보내기 전에 기록을 기다린다(hangang I2 — tap(void) 는 행을 잃었다). 값은 그대로 흘린다.
      mergeMap((value: unknown) =>
        from(this.write(req, meta, () => ({ status: res.statusCode, errorCode: null }))).pipe(
          map(() => value),
        ),
      ),
    )
  }

  private failureOf(error: unknown): AuditOutcome {
    const resolved = resolveErrorResponse(error, this.options?.errorCodes)
    return { status: resolved.status, errorCode: resolved.body.code }
  }

  /**
   * 🔴 절대 reject 하지 않는다 — 기다리는 대상이라 reject 하면 감사 실패가 응답을 500 으로 만든다(상류의 "감사 누락 <
   *    서비스 차단" 이 뒤집힌다). insert 는 스스로 삼키고, 그 밖(판정 · 행 만들기)에서 나는 것을 여기서 삼킨다.
   */
  private async write(
    req: Request,
    meta: AuditDeclaration,
    outcome: () => AuditOutcome,
  ): Promise<void> {
    try {
      const principal = getAdminPrincipal(req)
      // 주체 없음 = @Public 라우트 — 기동 검사가 @Public + @Audit 을 미리 막는다(2c 스펙 B11).
      if (principal == null) return
      await this.audit.insert(
        buildAuditEntry(req, principal, meta, outcome(), this.config.secretKeys),
      )
    } catch (error) {
      this.audit.warn(`감사 기록 준비 실패 — action=${meta.action}: ${reasonOf(error)}`)
    }
  }
}
