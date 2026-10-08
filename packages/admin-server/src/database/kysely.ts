import { MariadbDialect } from '@kim5257/kysely-mariadb-dialect'
import { CamelCasePlugin, Kysely, type KyselyPlugin } from 'kysely'
import { createPool } from 'mariadb'
import { BooleanTransformPlugin } from './boolean-transform.plugin.js'
import { adminPoolConfig, type AdminDbConnection } from './connection.js'

// 정본: hangang-home apps/api/src/core/database/database.module.ts(createDb) · gise database.module.ts(플러그인 순서 주석)
//       + crm kysely-plugins.ts(maintainNestedObjectKeys)
// 바꾼 점: 접속 정보를 인자로 받는다. Nest 를 import 하지 않는다(러너가 읽는다).

/**
 * 앱과 마이그레이션 러너가 함께 쓰는 플러그인. 부를 때마다 새 인스턴스.
 *
 * 🔴 순서가 의미를 갖는다 — Kysely 는 transformResult 를 배열 순서대로 돈다. boolean 판정이 snake 원본 키를 먼저 본다.
 * 🔴 `maintainNestedObjectKeys: true` — 없으면 JSON 컬럼 안쪽의 snake 키까지 camel 로 바뀐다(crm 2026-09-15 사고).
 *    hangang · gise 의 앱과 러너에는 이 옵션이 없었다.
 */
export function adminKyselyPlugins(): KyselyPlugin[] {
  return [new BooleanTransformPlugin(), new CamelCasePlugin({ maintainNestedObjectKeys: true })]
}

/**
 * 🔴 앱(`AdminServerModule`)과 마이그레이션 러너(`kysely.config.ts`)가 **같은 이 함수**로 만든다. 풀 옵션 · 플러그인이
 *    두 벌이 되면 갈리고, 갈린 쪽이 조용히 틀린 바이트를 쓴다.
 * 🔴 풀은 만들자마자 백그라운드로 연결을 시도한다(gise). 다 쓰면 `destroy()` 로 닫는다.
 */
export function createAdminKysely<DB>(connection: AdminDbConnection): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new MariadbDialect({ pool: createPool(adminPoolConfig(connection)) }),
    plugins: adminKyselyPlugins(),
  })
}
