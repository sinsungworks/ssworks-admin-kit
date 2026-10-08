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
