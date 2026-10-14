import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  sql,
  type SqlBool,
} from 'kysely'
import { describe, expect, it } from 'vitest'
import type { AdminDatabase } from './types.js'
import { adminKyselyPlugins } from './kysely.js'
import { LIKE_ESCAPE, escapeLike, likeContains, likePrefix } from './like.js'

describe('escapeLike', () => {
  it('! · % · _ 앞에 ! 를 붙인다', () => {
    expect(escapeLike('a!b%c_d')).toBe('a!!b!%c!_d')
    expect(escapeLike('평범한 글')).toBe('평범한 글')
  })

  it('🔴 한 번에 바꾼다 — 이스케이프한 ! 를 다시 이스케이프하지 않는다', () => {
    expect(escapeLike('!%')).toBe('!!!%')
    expect(escapeLike(escapeLike('!'))).toBe('!!!!')
  })
})

describe('likeContains · likePrefix', () => {
  it('포함 · 접두 패턴', () => {
    expect(likeContains('50%')).toBe('%50!%%')
    expect(likePrefix('session.revoke')).toBe('session.revoke%')
    expect(likePrefix('a_b')).toBe('a!_b%')
  })

  it('빈 문자열은 전부다 — 부르는 쪽이 거른다', () => {
    expect(likeContains('')).toBe('%%')
  })

  it('이스케이프 문자는 ! 이고 SQL 에 정적 텍스트로 쓴다', () => {
    expect(LIKE_ESCAPE).toBe('!')
    const db = new Kysely<AdminDatabase>({
      dialect: {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new MysqlIntrospector(kysely),
        createQueryCompiler: () => new MysqlQueryCompiler(),
      },
      plugins: adminKyselyPlugins(),
    })
    const compiled = db
      .selectFrom('users')
      .select('userId')
      .where(sql<SqlBool>`${sql.ref('userId')} like ${likeContains('x')} escape '!'`)
      .compile()
    expect(compiled.sql).toBe("select `user_id` from `users` where `user_id` like ? escape '!'")
    expect(compiled.parameters).toEqual(['%x%'])
  })
})
