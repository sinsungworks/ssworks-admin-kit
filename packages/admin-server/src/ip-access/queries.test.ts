import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { adminKyselyPlugins } from '../database/kysely.js'
import type { AdminDatabase } from '../database/types.js'
import {
  activeSessionsQuery,
  activeUsersQuery,
  identifiedRulesQuery,
  ruleViewQuery,
  teamMappingsQuery,
} from './queries.js'
import { ipRuleSetQuery } from './rule-set.js'

// 🔴 미리보기 · 목록 쿼리를 컴파일된 SQL 로 잰다(hangang ip-access.preview.test.ts) — 틀리면 화면은 그럴듯한데 사람이 목록에서
//    조용히 빠진다. 앱과 같은 플러그인(CamelCasePlugin)을 건다.

const db = new Kysely<AdminDatabase>({
  dialect: {
    createAdapter: () => new MysqlAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new MysqlIntrospector(kysely),
    createQueryCompiler: () => new MysqlQueryCompiler(),
  },
  plugins: adminKyselyPlugins(),
})
const now = new Date('2026-10-15T00:00:00.000Z')

describe('미리보기 쿼리(P12)', () => {
  it('🔴 오늘 로그인할 수 있는 사용자 — resignAt 은 효력 시각, 팀 배정 조건이 없다', () => {
    const compiled = activeUsersQuery(db, now).compile()
    expect(compiled.sql).toContain('from `users`')
    expect(compiled.sql).toContain('(`resign_at` is null or `resign_at` > ?)')
    expect(compiled.sql).not.toContain('team_user_map')
    expect(compiled.parameters).toEqual([now])
  })

  it('활성 세션 — 폐기 안 됨 ∧ 만료 안 됨', () => {
    const compiled = activeSessionsQuery(db, [1n, 2n], now).compile()
    expect(compiled.sql).toContain('from `sessions`')
    expect(compiled.sql).toContain('`user_no` in (?, ?)')
    expect(compiled.sql).toContain('`is_revoked` = ?')
    expect(compiled.sql).toContain('`expire_at` > ?')
  })

  it('팀 배정은 전량 — 대표 팀은 buildLockoutCandidates 가 고른다', () => {
    expect(teamMappingsQuery(db, [1n]).compile().sql).toBe(
      'select `user_no`, `team_no` from `team_user_map` where `user_no` in (?)',
    )
  })
})

describe('규칙 읽기', () => {
  it('🔴 잠금이 없다 — 정책(매 인증) · 미리보기 · 목록', () => {
    for (const query of [ipRuleSetQuery(db), identifiedRulesQuery(db), ruleViewQuery(db)]) {
      expect(query.compile().sql.toLowerCase()).not.toContain('for update')
    }
  })

  it('목록 — 범위별 대상 이름 LEFT JOIN · 정렬 scopeType → ruleNo', () => {
    const sql = ruleViewQuery(db).compile().sql
    expect(sql).toContain(
      'left join `teams` as `t` on `t`.`team_no` = `r`.`scope_ref_no` and `r`.`scope_type` = ?',
    )
    expect(sql).toContain(
      'left join `users` as `u` on `u`.`user_no` = `r`.`scope_ref_no` and `r`.`scope_type` = ?',
    )
    expect(sql).toContain('order by `r`.`scope_type`, `r`.`rule_no`')
  })
})
