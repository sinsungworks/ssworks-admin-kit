// @ssworks/admin-server — 관리자 API 공통 NestJS 모듈 (Phase 2).
// 진입점: `.`(전부) · `./runner`(Nest 무의존) · `./migrations/<id>`(코어 장 하나 — 스텁이 가리킨다).

export * from './runner.js'

export { AdminServerModule } from './admin-server.module.js'
export type {
  AdminServerOptions,
  AdminServerStaticOptions,
  AdminServerAsyncOptions,
} from './options.js'
export { KYSELY, ADMIN_SERVER_OPTIONS } from './tokens.js'

export { configureAdminApp, type ConfigureAdminAppOptions } from './http/configure-admin-app.js'
export { AdminEnvelopeInterceptor, RawResponse } from './http/envelope.interceptor.js'
export { AdminExceptionFilter } from './http/exception.filter.js'
export { ZodValidationPipe, ParseBigIntPipe } from './http/pipes.js'
export { validationError } from './http/validation.js'
export { LIKE_ESCAPE, escapeLike, likeContains, likePrefix } from './database/like.js'

// 인증(PR 2b)
export { AdminAuthModule } from './auth/admin-auth.module.js'
export { AUTH_REPOSITORY, ADMIN_ACCESS_POLICY, ADMIN_AUTH_EVENTS } from './tokens.js'
export type { AdminAuthOptions, AdminAuthCookieOptions } from './auth/options.js'
export type { AdminPermissionSlot, AdminPermissionMap } from './auth/permission-slots.js'
export type {
  AdminAuthRepository,
  AdminCredential,
  AdminPrincipalRecord,
  AdminLoginState,
} from './auth/auth.repository.js'
export { KyselyAuthRepository } from './auth/kysely-auth.repository.js'
export { getAdminPrincipal, type AdminPrincipal, type AdminMe } from './auth/principal.js'
export {
  Public,
  SelfOnly,
  RequirePermissions,
  RequireAnyPermissions,
  CurrentAdmin,
} from './auth/decorators.js'
export type {
  AdminAccessContext,
  AdminAccessPolicy,
  AdminAuthEvent,
  AdminAuthEventSink,
} from './auth/hooks.js'
export { AdminReauthService } from './auth/reauth.service.js'

// 세션 · 감사(PR 2c)
export { Audit, type AuditOptions } from './audit/audit.decorator.js'
export { attachAuditTarget, attachAuditMeta, attachAuditDiff } from './audit/audit-bag.js'
export type { AdminAuditOptions } from './audit/options.js'
