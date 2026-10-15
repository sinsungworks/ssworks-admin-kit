import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { AUDIT_COLUMN_WIDTHS } from '../../audit/entry.js'
import { adminKyselyPlugins } from '../kysely.js'
import * as roles from './0001_roles.js'
import * as users from './0002_users.js'
import * as teams from './0003_teams.js'
import * as teamClosure from './0004_team_closure.js'
import * as teamUserMap from './0005_team_user_map.js'
import * as userEmploymentPeriods from './0006_user_employment_periods.js'
import * as sessions from './0007_sessions.js'
import * as auditLogs from './0008_audit_logs.js'
import * as guardLocks from './0009_guard_locks.js'
import * as teamTreeLock from './0010_team_tree_lock.js'
import * as legalDocuments from './0011_legal_documents.js'

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
  ['0008_audit_logs', auditLogs],
  ['0009_guard_locks', guardLocks],
  ['0010_team_tree_lock', teamTreeLock],
  ['0011_legal_documents', legalDocuments],
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

describe('0001_roles', () => {
  it('🔴 순서 · 기본 표시 인덱스 둘 — 역할 쓰기가 전 행을 잠그지 않게(2d-3 스펙 ③ I1)', async () => {
    const statements = await capture((db) => roles.up(db))
    expect(statements).toContain(
      'create index `idx_roles_display_order` on `roles` (`display_order`)',
    )
    expect(statements).toContain('create index `idx_roles_is_default` on `roles` (`is_default`)')
  })
})

describe('0002_users', () => {
  it('🔴 resignAt 은 timestamp NULL 을 명시한다 — explicit_defaults_for_timestamp=OFF 에서 NOT NULL 이 되지 않게', async () => {
    const [statement] = await capture((db) => users.up(db))
    expect(statement).toContain('`resign_at` timestamp null')
  })

  it('🔴 updateAt 에 ON UPDATE 가 없다(2d 스펙 ⑧ U1) — 로그인 실패 · 비밀번호 변경이 "수정일" 을 움직이지 않게', async () => {
    const [statement = ''] = await capture((db) => users.up(db))
    const start = statement.indexOf('`update_at`')
    const updateAt = statement.slice(start, statement.indexOf('constraint', start)).toLowerCase()
    expect(updateAt).toContain('default current_timestamp')
    expect(updateAt).not.toContain('on update')
  })
})

describe('0008_audit_logs', () => {
  it('🔴 users · sessions FK 가 없다 — 계정 삭제가 감사 흔적을 지우지 않게', async () => {
    const statements = await capture((db) => auditLogs.up(db))
    expect(statements.join(' ').toLowerCase()).not.toContain('foreign key')
  })

  it('🔴 가변 길이 컬럼 너비가 AUDIT_COLUMN_WIDTHS 와 같다 — 끊는 쪽과 DB 가 어긋나면 행이 거부된다', async () => {
    const [statement] = await capture((db) => auditLogs.up(db))
    const widths = {
      method: AUDIT_COLUMN_WIDTHS.method,
      path: AUDIT_COLUMN_WIDTHS.path,
      ip: AUDIT_COLUMN_WIDTHS.ip,
      user_agent: AUDIT_COLUMN_WIDTHS.userAgent,
      error_code: AUDIT_COLUMN_WIDTHS.errorCode,
    }
    for (const [column, width] of Object.entries(widths)) {
      expect(statement).toContain(`\`${column}\` varchar(${width})`)
    }
  })

  it('status_code 는 smallint unsigned, meta 는 json + utf8mb4_bin', async () => {
    const [statement] = await capture((db) => auditLogs.up(db))
    expect(statement).toContain('`status_code` smallint unsigned not null')
    expect(statement).toContain('`meta` json collate utf8mb4_bin')
  })
})

describe('0009_guard_locks', () => {
  it('테이블을 만들고 센티넬 행을 넣는다 — 한 장(hangang 012 · 013 을 합침)', async () => {
    const statements = await capture((db) => guardLocks.up(db))
    expect(statements[0]).toMatch(/^create table `guard_locks`/)
    expect(statements.some((s) => s.startsWith('insert into `guard_locks`'))).toBe(true)
  })
})

describe('0010_team_tree_lock', () => {
  it('guardLocks 에 시드 한 줄 — 표를 만들지 않는다(2e 스펙 ⑪ A1)', async () => {
    const statements = await capture((db) => teamTreeLock.up(db))
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^insert into `guard_locks`/)
  })

  it('down 은 그 행만 지운다', async () => {
    const statements = await capture((db) => teamTreeLock.down(db))
    expect(statements).toEqual(['delete from `guard_locks` where `lock_name` = ?'])
  })
})

describe('0011_legal_documents', () => {
  it('표 · 인덱스 · 가드 행 — 열 정의 원문(2e 스펙 공통 8 · §4-7)', async () => {
    const statements = await capture((db) => legalDocuments.up(db))
    expect(statements).toHaveLength(3)
    const [table = '', index, seed = ''] = statements
    expect(table).toMatch(/^create table `legal_documents`/)
    for (const fragment of [
      '`legal_doc_no` bigint unsigned primary key auto_increment',
      '`kind` varchar(32) collate ascii_bin not null',
      '`body` mediumtext not null',
      '`content_hash` char(64) collate ascii_bin not null',
      '`published_at` timestamp default CURRENT_TIMESTAMP not null',
      '`published_by_user_no` bigint unsigned comment',
      'constraint `fk_legal_documents_published_by` foreign key (`published_by_user_no`) references `users` (`user_no`) on delete set null on update cascade',
    ]) {
      expect(table).toContain(fragment)
    }
    expect(index).toBe(
      'create index `idx_legal_documents_kind_published` on `legal_documents` (`kind`, `published_at`)',
    )
    expect(seed).toMatch(/^insert into `guard_locks`/)
  })

  it('🔴 kind 에 CHECK · ENUM 이 없다 — 종류 폐집합의 정본은 옵션 legal.kinds(gise)', async () => {
    const [table = ''] = await capture((db) => legalDocuments.up(db))
    const outside = outsideQuotes(table).toLowerCase()
    expect(outside).not.toContain('check')
    expect(outside).not.toContain('enum')
  })

  it('down 은 가드 행을 지우고 표를 버린다', async () => {
    expect(await capture((db) => legalDocuments.down(db))).toEqual([
      'delete from `guard_locks` where `lock_name` = ?',
      'drop table `legal_documents`',
    ])
  })
})

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
