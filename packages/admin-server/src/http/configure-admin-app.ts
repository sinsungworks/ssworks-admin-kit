import type { NestExpressApplication } from '@nestjs/platform-express'
import { bigintJsonReplacer, bigintJsonReviver } from '@ssworks/admin-shared'
import cookieParser from 'cookie-parser'

// 정본: ssworks-gise-home apps/api/src/core/config/bootstrap.ts(configureApp) · body-limits.ts,
//       kim5257-crm-v5 · ssworks-axion-admin main.ts(query parser)
// 바꾼 점:
//  - 전역 prefix · trust proxy 는 여기 없다 — 쓰는 쪽(prefix) · 2f(클라이언트 IP) 몫.
//  - `jsonLimit` 하나만 받는다. gise 는 옵션을 금지했다(main 과 테스트 배선이 갈리지 않게) — 패키지는 프로젝트마다 한도가
//    다를 수 있어 하나만 연다. 패키지 테스트 하네스도 이 함수를 그대로 부른다.
//  - `query parser: 'extended'` 를 더했다 — admin-ui 가 `filter[key]=…` 로 보낸다. Express 5 기본(`simple`)은 객체로
//    만들지 않는다. extended 파서는 `__proto__` 키를 버린다(2026-10-08 실측).

export interface ConfigureAdminAppOptions {
  /** JSON 본문 한도. 기본 `'1mb'`(Express 기본 100kb 는 관리자 저장 본문에 모자란다 — gise) */
  jsonLimit?: string | number
}

/**
 * `NestFactory.create()` 뒤, `listen()` · `init()` 전에 부른다. 🔴 빠뜨리면 `AdminServerModule` 이 기동에서 멈춘다.
 * 순서: cookie-parser → JSON 본문(한도 · bigint reviver) → `json replacer` → 쿼리 파서.
 */
export function configureAdminApp(
  app: NestExpressApplication,
  options: ConfigureAdminAppOptions = {},
): void {
  app.use(cookieParser())
  // 🔴 reviver 가 없으면 본문의 `"BigInt(n)"` 이 문자열로 남아 bigint 를 요구하는 스키마가 거부한다(gise 뮤테이션 관측).
  //    이 호출 뒤 Nest 는 자기 JSON 파서를 다시 붙이지 않는다(스펙 R1).
  app.useBodyParser('json', { limit: options.jsonLimit ?? '1mb', reviver: bigintJsonReviver })
  // 🔴 없으면 `res.json()` 의 JSON.stringify 가 bigint 에서 던져 성공 응답이 500 이 된다(gise 뮤테이션 관측).
  app.set('json replacer', bigintJsonReplacer)
  app.set('query parser', 'extended')
}
