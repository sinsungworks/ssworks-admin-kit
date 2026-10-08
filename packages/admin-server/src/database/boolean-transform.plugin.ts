import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely'

// 정본: ssworks-gise-home apps/api/src/core/database/plugins/boolean-transform.plugin.ts(정규식판)
// 바꾼 점: 없음. hangang · crm 의 허용목록판은 버렸다.
//
// 🔴 tinyint(1) → boolean. **컬럼명 접두 `is` / `has` 로 판단한다.** MariaDB 에 boolean 타입은 없다 — `BOOLEAN` 은
//    `TINYINT(1)` 별칭이고 드라이버는 0/1 을 준다. 타입만 boolean 이고 값이 0 이면 예외 없이 조용히 틀린다.
// 🔴 허용목록을 두지 않는다. 예외를 등록하기 시작하면 규칙이 규칙이 아니게 된다 — 컬럼명을 고친다.
// `is_revoked`(snake)와 `isRevoked`(camel)를 모두 받는다 — CamelCasePlugin 과의 순서가 바뀌어도 조용히 죽지 않게.
// `island` · `hash` · `history` 처럼 접두를 우연히 품은 이름은 걸리지 않는다.
const BOOLEAN_COLUMN = /^(?:is|has)(?:_[a-z0-9]|[A-Z0-9])/

export class BooleanTransformPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return args.node
  }

  transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return Promise.resolve({
      ...args.result,
      rows: args.result.rows.map((row) => this.transformRow(row)),
    })
  }

  private transformRow(row: UnknownRow): UnknownRow {
    const out: UnknownRow = {}
    for (const [key, value] of Object.entries(row)) {
      out[key] = BOOLEAN_COLUMN.test(key) && (value === 0 || value === 1) ? Boolean(value) : value
    }
    return out
  }
}
