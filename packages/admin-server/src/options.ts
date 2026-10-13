import type { FactoryProvider, ModuleMetadata } from '@nestjs/common'
import type { ErrorCodeTable, PasswordPolicy } from '@ssworks/admin-shared'
import type { AdminAuthOptions } from './auth/options.js'
import type { AdminDbConnection } from './database/connection.js'

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
