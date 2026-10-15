import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { adminKyselyPlugins } from '../database/kysely.js'
import type { AdminDatabase } from '../database/types.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'

// 🔴 잠금 읽기의 SQL 끝을 잰다(2f-2a 스펙 A9 · §14 R1-⑤) — MariaDB 11.4 는 FOR SHARE 를 1064 로 거부한다. Kysely forShare() 로
//    돌아가면 모든 토큰 회전이 500 이 된다. 앱과 같은 플러그인(CamelCasePlugin)을 건다.

function recordingDb(sqls: string[]): Kysely<AdminDatabase> {
  return new Kysely<AdminDatabase>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (kysely) => new MysqlIntrospector(kysely),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
    plugins: adminKyselyPlugins(),
    log: (event) => {
      if (event.level === 'query') sqls.push(event.query.sql)
    },
  })
}

describe('KyselyAuthRepository — 잠금 읽기 · 카운터 쓰기 SQL', () => {
  it.each([
    ['share', / lock in share mode$/],
    ['update', / for update$/],
  ] as const)('lockCredential(%s)', async (mode, ending) => {
    const sqls: string[] = []
    const db = recordingDb(sqls)
    const repo = new KyselyAuthRepository(db)
    const row = await db.transaction().execute((trx) => repo.lockCredential(trx, 7n, mode))
    expect(row).toBeNull()
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toMatch(ending)
    expect(sqls[0]).not.toContain('for share')
    expect(sqls[0]).toContain('from `users` where `user_no` = ?')
  })

  it('writeLoginState 는 잠금 두 컬럼만 쓴다', async () => {
    const sqls: string[] = []
    const db = recordingDb(sqls)
    const repo = new KyselyAuthRepository(db)
    await db
      .transaction()
      .execute((trx) => repo.writeLoginState(trx, 7n, { loginFailCount: 3, lockUntil: null }))
    expect(sqls).toEqual([
      'update `users` set `login_fail_count` = ?, `lock_until` = ? where `user_no` = ?',
    ])
  })
})
