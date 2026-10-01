// @ssworks/admin-server — Phase 2 에서 채운다.
//
// 계획(docs/phase0/admin-kit-phase0.md §2-3 · §3-2):
//   AdminServerModule.forRoot(options) · DatabaseModule(KYSELY 토큰) · AuthGuard/PermissionGuard
//   · AuthService(login-policy/refresh-policy/AUTH_REPOSITORY) · SessionsModule · IpAccessModule
//   · AuditModule · BusinessExceptionFilter · ZodValidationPipe · Users/Roles/Teams/AuditLogs 모듈
//   · 코어 마이그레이션 export.
//
// 지금은 패키지 자리만 잡아 둔 상태라 export 가 없다.
export const ADMIN_SERVER_PHASE = 'scaffold' as const
