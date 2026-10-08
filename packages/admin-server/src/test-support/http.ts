import type { ModuleMetadata } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test, type TestingModuleBuilder } from '@nestjs/testing'
import { configureAdminApp } from '../http/configure-admin-app.js'

// 테스트 전용 — 운영 main.ts 와 같은 배선(configureAdminApp)으로 앱을 띄운다. 🔴 빌드에서 빠진다(tsconfig.build.json).

export interface HttpAppOptions {
  /** false 면 configureAdminApp 을 부르지 않는다 — 부팅 검사 테스트 */
  configure?: boolean
  jsonLimit?: string | number
  /** 테스트 모듈 빌더를 고친다 — 예: KYSELY 를 가짜로 */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder
}

export async function createHttpApp(
  metadata: ModuleMetadata,
  options: HttpAppOptions = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule(metadata)
  if (options.override) builder = options.override(builder)
  const ref = await builder.compile()
  const app = ref.createNestApplication<NestExpressApplication>({ logger: false })
  if (options.configure !== false) {
    configureAdminApp(app, options.jsonLimit === undefined ? {} : { jsonLimit: options.jsonLimit })
  }
  await app.init()
  return app
}
