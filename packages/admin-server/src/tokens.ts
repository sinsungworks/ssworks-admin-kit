// 주입 토큰 · 메타데이터 키. 🔴 기능 모듈은 admin-server.module.ts 가 아니라 이 파일에서 토큰을 가져온다 — 코어 모듈이
//    기능 모듈 목록을 import 하므로(RouterModule) 반대 방향 import 는 순환이 된다.

/** `Kysely<AdminDatabase>`. 쓰는 쪽은 `@Inject(KYSELY) db: Kysely<Database>` 로 받는다. */
export const KYSELY = Symbol('KYSELY')

/** 해석된 `AdminServerOptions` */
export const ADMIN_SERVER_OPTIONS = Symbol('ADMIN_SERVER_OPTIONS')

/** `@RawResponse()` 가 남기는 메타데이터 키 */
export const RAW_RESPONSE = 'admin-kit:raw-response'
