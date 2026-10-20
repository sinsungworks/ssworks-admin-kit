import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AUDIT_MESSAGES } from '../audit/errors.js'
import { AUTH_MESSAGES } from '../auth/errors.js'
import { IP_ACCESS_MESSAGES } from '../ip-access/errors.js'
import { LEGAL_MESSAGES } from '../legal/errors.js'
import { SESSION_MESSAGES } from '../sessions/errors.js'
import { TEAM_MESSAGES } from '../teams/errors.js'
import {
  ADMIN_SERVER_DEFAULT_MESSAGES,
  applyMessageOverrides,
  resolveAdminMessages,
  type AdminServerMessages,
} from './messages.js'

describe('ADMIN_SERVER_DEFAULT_MESSAGES(2g M1 · M2)', () => {
  it('묶음 여덟은 서버가 쓰는 그 표 객체이고 모두 얼려 있다', () => {
    expect(ADMIN_SERVER_DEFAULT_MESSAGES).toEqual({
      auth: AUTH_MESSAGES,
      accounts: ACCOUNT_MESSAGES,
      sessions: SESSION_MESSAGES,
      audit: AUDIT_MESSAGES,
      teams: TEAM_MESSAGES,
      legal: LEGAL_MESSAGES,
      ipAccess: IP_ACCESS_MESSAGES,
      ipAccessSchema: IP_ACCESS_SCHEMA_MESSAGES,
    })
    const tables = {
      auth: AUTH_MESSAGES,
      accounts: ACCOUNT_MESSAGES,
      sessions: SESSION_MESSAGES,
      audit: AUDIT_MESSAGES,
      teams: TEAM_MESSAGES,
      legal: LEGAL_MESSAGES,
      ipAccess: IP_ACCESS_MESSAGES,
      ipAccessSchema: IP_ACCESS_SCHEMA_MESSAGES,
    } as const
    for (const [group, table] of Object.entries(tables)) {
      expect(ADMIN_SERVER_DEFAULT_MESSAGES[group as keyof typeof tables]).toBe(table)
    }
    expect(Object.isFrozen(ADMIN_SERVER_DEFAULT_MESSAGES)).toBe(true)
    for (const table of Object.values(ADMIN_SERVER_DEFAULT_MESSAGES)) {
      expect(Object.isFrozen(table)).toBe(true)
    }
  })

  it('🔴 서버의 문구 표(export const *_MESSAGES)는 모두 묶음에 있거나 제외 목록에 있다(M10)', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
    const sourceFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return name === 'test-support' ? [] : sourceFiles(path)
        return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : []
      })
    const found = sourceFiles(srcDir).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/^export const ([A-Z_]+_MESSAGES)[ :=]/gm)].map(
        (match) => match[1],
      ),
    )
    const grouped = [
      'AUTH_MESSAGES',
      'ACCOUNT_MESSAGES',
      'SESSION_MESSAGES',
      'AUDIT_MESSAGES',
      'TEAM_MESSAGES',
      'LEGAL_MESSAGES',
      'IP_ACCESS_MESSAGES',
    ]
    // GUARD_MESSAGES — 5xx 라 고정 문구로 가려진다(M1). ADMIN_SERVER_DEFAULT_MESSAGES — 묶음 자체
    const excluded = ['GUARD_MESSAGES', 'ADMIN_SERVER_DEFAULT_MESSAGES']
    expect([...found].sort()).toEqual([...grouped, ...excluded].sort())
  })
})

describe('resolveAdminMessages(2g M3 · M4)', () => {
  it('없거나 빈 옵션은 빈 표', () => {
    expect(resolveAdminMessages(undefined).size).toBe(0)
    expect(resolveAdminMessages({}).size).toBe(0)
  })

  it('키별 덮기 → 기본 글자에서 덮을 글자로', () => {
    const map = resolveAdminMessages({
      accounts: { noUser: '운영자를 찾을 수 없습니다.' },
      ipAccess: { noScopeUser: '대상 운영자를 찾을 수 없습니다.' },
      ipAccessSchema: { scopeRefRequired: '팀 · 운영자 규칙은 대상을 골라야 합니다.' },
    })
    expect(map.get(ACCOUNT_MESSAGES.noUser)).toBe('운영자를 찾을 수 없습니다.')
    expect(map.get(IP_ACCESS_MESSAGES.noScopeUser)).toBe('대상 운영자를 찾을 수 없습니다.')
    expect(map.get(IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired)).toBe(
      '팀 · 운영자 규칙은 대상을 골라야 합니다.',
    )
    expect(map.size).toBe(3)
  })

  it('같은 기본 글자를 같은 값으로 덮으면 된다 · 기본값과 같은 덮기는 표에 없다', () => {
    const map = resolveAdminMessages({
      accounts: { noUser: '운영자를 찾을 수 없습니다.', noRole: ACCOUNT_MESSAGES.noRole },
      sessions: { noUser: '운영자를 찾을 수 없습니다.' },
    })
    expect(map.size).toBe(1)
    expect(map.has(ACCOUNT_MESSAGES.noRole)).toBe(false)
  })

  it('🔴 같은 기본 글자를 다르게 덮으면 두 자리를 적고 멈춘다', () => {
    expect(() =>
      resolveAdminMessages({
        accounts: { noUser: '운영자를 찾을 수 없습니다.' },
        sessions: { noUser: '회원을 찾을 수 없습니다.' },
      }),
    ).toThrow('같은 기본 문구를 다르게 덮는다: accounts.noUser · sessions.noUser')
  })

  it('🔴 기본값을 적은 자리도 주장이다 — 같은 글자의 다른 자리를 다르게 덮으면 멈춘다', () => {
    expect(() =>
      resolveAdminMessages({
        accounts: { noUser: ACCOUNT_MESSAGES.noUser },
        sessions: { noUser: '운영자를 찾을 수 없습니다.' },
      }),
    ).toThrow('같은 기본 문구를 다르게 덮는다: accounts.noUser · sessions.noUser')
  })

  it('🔴 모르는 묶음 · 키 · 빈 값 · 문자열 아님은 모아서 멈춘다', () => {
    expect(() =>
      resolveAdminMessages({
        acounts: { noUser: 'x' },
        accounts: { noUsr: 'x', noRole: '  ', noTeam: 3 },
      } as unknown as AdminServerMessages),
    ).toThrow(
      '모르는 묶음: acounts / 모르는 키: accounts.noUsr / 빈 문구: accounts.noRole / 빈 문구: accounts.noTeam',
    )
  })
})

describe('applyMessageOverrides(2g M6)', () => {
  const map = new Map([
    ['없음', '덮인 없음'],
    ['칸 오류', '덮인 칸 오류'],
  ])

  it('message 와 details.issues[].message 를 바꾸고 나머지는 그대로 — 원본을 고치지 않는다', () => {
    const issues = [
      { path: ['a'], code: 'custom', message: '칸 오류' },
      { path: ['b'], code: 'custom', message: '그대로' },
    ]
    const body = {
      success: false as const,
      code: 'ERR_COMMON_VALIDATION',
      message: '칸 오류',
      details: { issues, extra: 1 },
    }
    expect(applyMessageOverrides(body, map)).toEqual({
      success: false,
      code: 'ERR_COMMON_VALIDATION',
      message: '덮인 칸 오류',
      details: {
        issues: [
          { path: ['a'], code: 'custom', message: '덮인 칸 오류' },
          { path: ['b'], code: 'custom', message: '그대로' },
        ],
        extra: 1,
      },
    })
    expect(body.message).toBe('칸 오류')
    expect(issues[0]?.message).toBe('칸 오류')
  })

  it('표에 없으면 같은 객체를 돌려준다', () => {
    const body = { success: false as const, code: 'ERR_COMMON_NOT_FOUND', message: '모름' }
    expect(applyMessageOverrides(body, map)).toBe(body)
  })

  it('🔴 details 가 객체가 아니거나 issues 항목이 이상해도 던지지 않는다', () => {
    const weird = {
      success: false as const,
      code: 'ERR_COMMON_VALIDATION',
      message: '없음',
      details: { issues: ['문자열', null, { path: [] }, { message: 3 }, { message: '칸 오류' }] },
    }
    expect(applyMessageOverrides(weird, map)).toEqual({
      ...weird,
      message: '덮인 없음',
      details: {
        issues: ['문자열', null, { path: [] }, { message: 3 }, { message: '덮인 칸 오류' }],
      },
    })
    const listDetails = { success: false as const, code: 'X', message: '모름', details: [1, 2] }
    expect(applyMessageOverrides(listDetails, map)).toBe(listDetails)
  })
})
