import type { FactoryProvider, ModuleMetadata } from '@nestjs/common'
import type { ErrorCodeTable, PasswordPolicy } from '@ssworks/admin-shared'
import type { AdminPermissionCatalog } from './accounts/options.js'
import type { AdminAuditOptions } from './audit/options.js'
import type { AdminAuthOptions } from './auth/options.js'
import type { AdminPermissionMap } from './auth/permission-slots.js'
import type { AdminClientIpSource } from './auth/request-meta.js'
import type { AdminDbConnection } from './database/connection.js'
import type { AdminServerMessages } from './http/messages.js'
import type { AdminLegalOptions } from './legal/options.js'

export interface AdminServerOptions {
  /** DB 접속. 보통 `adminDbConnectionFromEnv()` */
  db: AdminDbConnection
  /**
   * 프로젝트 오류 코드표(admin-shared `defineErrorCodes` 결과). 예외 필터가 `BusinessError` 의 상태를 여기서 찾는다.
   * 없으면 코어 표(`COMMON_ERROR_STATUS`). 표에 없는 코드는 500.
   */
  errorCodes?: Pick<ErrorCodeTable<Record<string, string>>, 'httpStatusFor'>
  /** `AdminAuthModule` 을 쓰면 필수 — 없으면 기동에서 멈춘다(스펙 §4-1) */
  auth?: AdminAuthOptions
  /** admin-shared `definePasswordPolicy()` 결과. 없으면 기본 정책(8 · 200). 인증(비밀번호 변경)과 2d 가 함께 읽는다 */
  passwordPolicy?: PasswordPolicy
  /**
   * 패키지 라우트의 권한 슬롯 → 프로젝트 권한 키(2c 스펙 ① P1). 예: `{ 'sessions.read': 'org.users:read' }`.
   * 🔴 import 한 기능 모듈의 슬롯이 없거나 모르는 슬롯이 있으면 기동에서 멈춘다.
   */
  permissions?: AdminPermissionMap
  /** `AdminAuditModule` 이 읽는다 — 카탈로그 · 더할 비밀 키(2c 스펙 §4-1) */
  audit?: AdminAuditOptions
  /**
   * 프로젝트 권한 카탈로그(admin-shared `definePermissions()` 결과 — 2d 스펙 ① C1). 역할 정규화 · 권한 키 검증이 쓴다.
   * 🔴 `AdminRolesModule` · `AdminUsersModule` 을 쓰면 필수 — 없으면 기동에서 멈춘다. 슬롯 맵의 키도 이 카탈로그 안이어야 한다.
   */
  permissionCatalog?: AdminPermissionCatalog
  /** 기본 false. 켜면 역할 · 사용자 쓰기가 본문 `currentPassword` 로 재인증한다(2d 스펙 ⑦ R1 · Phase 0 §4 #4) */
  reauth?: boolean
  /**
   * 날짜(입사일 · 퇴사일)를 읽는 기준 시간대 — IANA 이름(`'Asia/Seoul'` · `'UTC'`). 기본 `'Asia/Seoul'`(2d 스펙 ⑤ TZ1).
   * 퇴사일 D 의 효력 시각은 이 시간대의 D 다음 날 0시다. 🔴 바꿔도 이미 저장된 효력 시각 · 날짜는 그대로다.
   * `AdminUsersModule` 이 기동에서 검증한다(`'+09:00'` 같은 오프셋 표기는 거부).
   */
  timeZone?: string
  /**
   * 약관 종류 카탈로그(2e 스펙 ⑨ K1) — 예: `{ kinds: ['TERMS', 'PRIVACY'] }`. 🔴 `AdminLegalModule` 을 쓰면 필수 — 없거나
   * 종류가 비었거나 형식(영숫자 · `_` 1~32자) 밖 · 겹침이면 기동에서 멈춘다(B14). admin-ui `useLegalDocuments` 의 `kinds`
   * 와 한 상수에서 만든다.
   */
  legal?: AdminLegalOptions
  /**
   * 클라이언트 IP 의 출처(2f-1 스펙 ④ C1). 기본 `'req.ip'` — Express `trust proxy`(쓰는 쪽 main.ts)를 따른다. 엣지 프록시가
   * `X-Real-IP` 를 덮어쓰면 `'x-real-ip'`(헤더가 없으면 req.ip). 🔴 엣지 없이 노출된 서버에 `'x-real-ip'` 를 쓰면 헤더 한 줄로
   * IP 접근 제어를 우회한다. 세션 행 · 감사 · IP 정책이 같은 값을 본다. 두 값 밖이면 기동에서 멈춘다.
   */
  clientIp?: AdminClientIpSource
  /**
   * 서버 오류 문구를 키별로 덮는다(2g M1–M9) — 예: `{ accounts: { noUser: '운영자를 찾을 수 없습니다.' } }`. 키는
   * `ADMIN_SERVER_DEFAULT_MESSAGES`. 🔴 같은 기본 글자는 함께 바뀐다(`accounts.noUser` = `sessions.noUser`). 오타 · 같은 글자를
   * 다르게 덮기는 기동에서 멈춘다. 4xx 의 `message` · `details.issues[].message` 만 — 5xx 고정 문구 · 로그 · 감사는 그대로.
   */
  messages?: AdminServerMessages
}

/** 정적 옵션 — `RouterModule` 이 모듈 정의 시점의 값을 요구한다(스펙 F2). */
export interface AdminServerStaticOptions {
  /** 관리자 라우트 prefix. 기본 `'admin'`. `''` 이면 붙이지 않는다 */
  routePrefix?: string
}

export interface AdminServerAsyncOptions extends AdminServerStaticOptions {
  imports?: ModuleMetadata['imports']
  inject?: FactoryProvider['inject']
  // Nest 의 FactoryProvider 와 같은 모양 — 주입 인자 타입은 쓰는 쪽이 정한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => AdminServerOptions | Promise<AdminServerOptions>
}
