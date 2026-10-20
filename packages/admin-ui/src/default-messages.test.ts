// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import * as kit from './index.js'

// 3i E1 — 기본 문구는 공개다(3f/3g C2 · 3h S6 을 뒤집음). 앱이 덮을 키를 고르고 테스트에서 비교한다.
// 🔴 얼려 있어야 한다(E3) — 앱 한 곳의 대입이 킷 기본값을 모든 화면에서 바꾸지 않게.

const DEFAULTS: Record<string, object> = {
  DEFAULT_SESSION_TABLE_MESSAGES: kit.DEFAULT_SESSION_TABLE_MESSAGES,
  DEFAULT_IP_ACCESS_MESSAGES: kit.DEFAULT_IP_ACCESS_MESSAGES,
  DEFAULT_AUDIT_LOG_MESSAGES: kit.DEFAULT_AUDIT_LOG_MESSAGES,
  DEFAULT_TEAM_TREE_MESSAGES: kit.DEFAULT_TEAM_TREE_MESSAGES,
  DEFAULT_TEAM_USER_LIST_MESSAGES: kit.DEFAULT_TEAM_USER_LIST_MESSAGES,
  DEFAULT_TEAM_MESSAGES: kit.DEFAULT_TEAM_MESSAGES,
  DEFAULT_LEGAL_MESSAGES: kit.DEFAULT_LEGAL_MESSAGES,
  DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES: kit.DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES,
}

describe('기본 문구 export(3i E1–E4)', () => {
  it.each(Object.entries(DEFAULTS))('%s — index 에서 나오고 얼려 있다', (_name, value) => {
    expect(value).toBeTypeOf('object')
    expect(Object.keys(value).length).toBeGreaterThan(0)
    expect(Object.isFrozen(value)).toBe(true)
    for (const nested of Object.values(value)) {
      if (typeof nested === 'object' && nested !== null) expect(Object.isFrozen(nested)).toBe(true)
    }
  })

  it('🔴 기본값에 대입하면 던진다(strict) — 킷 기본값이 바뀌지 않는다', () => {
    const target = kit.DEFAULT_SESSION_TABLE_MESSAGES as { userColumn: string }
    expect(() => {
      target.userColumn = '운영자'
    }).toThrow(TypeError)
    expect(kit.DEFAULT_SESSION_TABLE_MESSAGES.userColumn).toBe('사용자')
  })

  it('앱이 펼쳐 덮은 객체는 보통 객체다 — 얼림이 펼치기를 막지 않는다', () => {
    const messages = { ...kit.DEFAULT_IP_ACCESS_MESSAGES, scopeUser: '운영자' }
    expect(messages.scopeUser).toBe('운영자')
    expect(messages.scopeTeam).toBe(kit.DEFAULT_IP_ACCESS_MESSAGES.scopeTeam)
    expect(Object.isFrozen(messages)).toBe(false)
  })

  it('CORE_AUDIT_ACTION_GROUPS — 배열과 항목이 얼려 있다 · org.user 라벨은 "사용자"(E4)', () => {
    expect(Object.isFrozen(kit.CORE_AUDIT_ACTION_GROUPS)).toBe(true)
    expect(kit.CORE_AUDIT_ACTION_GROUPS.every((group) => Object.isFrozen(group))).toBe(true)
    expect(kit.CORE_AUDIT_ACTION_GROUPS.find((g) => g.prefix === 'org.user')?.label).toBe('사용자')
  })
})
