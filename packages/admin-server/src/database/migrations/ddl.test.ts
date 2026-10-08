import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { adminKyselyPlugins } from '../kysely.js'
import * as roles from './0001_roles.js'
import * as users from './0002_users.js'
import * as teams from './0003_teams.js'
import * as teamClosure from './0004_team_closure.js'
import * as teamUserMap from './0005_team_user_map.js'
import * as userEmploymentPeriods from './0006_user_employment_periods.js'
import * as sessions from './0007_sessions.js'

// 🔴 마이그레이션 DDL 을 소스 문자열이 아니라 **컴파일된 SQL** 로 잰다(hangang migrations-ddl.test.ts).
//    `sql` 템플릿 안의 식별자는 CamelCasePlugin 이 바꾸지 않는다 — hangang 037 이 그 자리에서 실제 DB 적용 때 죽었다.
//    플러그인은 앱과 같은 `adminKyselyPlugins()`.

type Chapter = { up(db: Kysely<unknown>): Promise<void>; down(db: Kysely<unknown>): Promise<void> }

const CHAPTERS: [string, Chapter][] = [
  ['0001_roles', roles],
  ['0002_users', users],
  ['0003_teams', teams],
  ['0004_team_closure', teamClosure],
  ['0005_team_user_map', teamUserMap],
  ['0006_user_employment_periods', userEmploymentPeriods],
  ['0007_sessions', sessions],
]

async function capture(run: (db: Kysely<unknown>) => Promise<void>): Promise<string[]> {
  const statements: string[] = []
  const db = new Kysely<unknown>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (kysely) => new MysqlIntrospector(kysely),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
    plugins: adminKyselyPlugins(),
    log: (event) => {
      if (event.level === 'query') statements.push(event.query.sql)
    },
  })
  await run(db)
  await db.destroy()
  return statements
}

/** 문자열 리터럴 · 백틱 식별자를 비운 나머지 */
function outsideQuotes(statement: string): string {
  return statement.replace(/'(?:[^']|'')*'/g, "''").replace(/`[^`]*`/g, '``')
}

describe.each(CHAPTERS)('%s', (_id, chapter) => {
  it('up — 백틱 식별자는 전부 snake_case', async () => {
    const statements = await capture((db) => chapter.up(db))
    expect(statements.length).toBeGreaterThan(0)
    const identifiers = statements.flatMap((s) =>
      [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? ''),
    )
    expect(identifiers.filter((name) => !/^[a-z0-9_]+$/.test(name))).toEqual([])
  })

  it('🔴 up — 따옴표 밖에 camelCase 토큰이 없다', async () => {
    const statements = await capture((db) => chapter.up(db))
    const camel = statements.flatMap(
      (s) => outsideQuotes(s).match(/\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g) ?? [],
    )
    expect(camel).toEqual([])
  })

  it('up 의 CREATE TABLE 은 InnoDB · utf8mb4_bin 을 명시한다', async () => {
    const statements = await capture((db) => chapter.up(db))
    for (const statement of statements.filter((s) => s.startsWith('create table'))) {
      expect(statement).toContain('engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin')
    }
  })

  it('down 도 돈다', async () => {
    expect((await capture((db) => chapter.down(db))).length).toBeGreaterThan(0)
  })
})
