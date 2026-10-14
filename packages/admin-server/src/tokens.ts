// 주입 토큰 · 메타데이터 키. 🔴 기능 모듈은 admin-server.module.ts 가 아니라 이 파일에서 토큰을 가져온다 — 코어 모듈이
//    기능 모듈 목록을 import 하므로(RouterModule) 반대 방향 import 는 순환이 된다.

/** `Kysely<AdminDatabase>`. 쓰는 쪽은 `@Inject(KYSELY) db: Kysely<Database>` 로 받는다. */
export const KYSELY = Symbol('KYSELY')

/** 해석된 `AdminServerOptions` */
export const ADMIN_SERVER_OPTIONS = Symbol('ADMIN_SERVER_OPTIONS')

/** `@RawResponse()` 가 남기는 메타데이터 키 */
export const RAW_RESPONSE = 'admin-kit:raw-response'

/**
 * 내부 — 해석된 인증 설정(`ResolvedAuthConfig`). `AdminAuthModule` 이 코어 옵션의 `auth` · `passwordPolicy` 로 만든다.
 * index 에 내지 않는다.
 */
export const ADMIN_AUTH_CONFIG = Symbol('ADMIN_AUTH_CONFIG')

/** `AdminAuthRepository` — 사용자 테이블을 읽고 쓰는 교체 지점(스펙 ⑤ A1). 교체는 `AdminAuthModule.withRepository` */
export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY')

/** 2f 가 제공하는 IP 접근 정책(선택, `AdminAccessPolicy`). 제공하는 모듈은 전역으로 내보낸다 */
export const ADMIN_ACCESS_POLICY = Symbol('ADMIN_ACCESS_POLICY')

/** 2c 가 제공하는 인증 이벤트 기록기(선택, `AdminAuthEventSink`). 제공하는 모듈은 전역으로 내보낸다 */
export const ADMIN_AUTH_EVENTS = Symbol('ADMIN_AUTH_EVENTS')

/** 데코레이터 메타데이터 키 — 🔴 `admin-kit:` 접두라 쓰는 쪽 `isPublic` 키와 섞이지 않는다 */
export const IS_PUBLIC = 'admin-kit:public'
export const IS_SELF_ONLY = 'admin-kit:self-only'
export const REQUIRED_PERMISSIONS = 'admin-kit:permissions'
export const ANY_PERMISSIONS = 'admin-kit:any-permissions'
/** 내부 — 강제 변경 계정에도 여는 라우트(me · password) */
export const ALLOW_PASSWORD_CHANGE = 'admin-kit:allow-password-change'
/** 내부 — 패키지 라우트의 권한 슬롯(2c 스펙 ① P1). 키는 `AdminServerOptions.permissions` 가 준다 */
export const PERMISSION_SLOT = 'admin-kit:permission-slot'
/** `@Audit()` 이 남기는 메타데이터 키(2c) */
export const AUDIT_META = 'admin-kit:audit'

/** 내부 — 해석된 감사 설정(`ResolvedAuditConfig`). `AdminAuditModule` 이 코어 옵션의 `audit` 로 만든다 */
export const ADMIN_AUDIT_CONFIG = Symbol('ADMIN_AUDIT_CONFIG')

/** 내부 — `AdminAuthModule.withRepository` 가 넣는 교체 구현. AUTH_REPOSITORY 팩토리가 있으면 쓴다(스펙 B6) */
export const CUSTOM_AUTH_REPOSITORY = Symbol('CUSTOM_AUTH_REPOSITORY')

/** 내부 — 해석된 계정 설정(`ResolvedAccountsConfig`). 역할 · 사용자 모듈이 코어 옵션의 `permissionCatalog` · `reauth` 로 만든다(2d) */
export const ADMIN_ACCOUNTS_CONFIG = Symbol('ADMIN_ACCOUNTS_CONFIG')
