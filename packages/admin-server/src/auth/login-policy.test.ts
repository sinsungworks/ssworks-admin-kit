import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCKOUT, isLocked, needsReset, nextLoginState } from './login-policy.js'

const now = new Date('2026-10-13T00:00:00.000Z')
const at = (ms: number) => new Date(now.getTime() + ms)

describe('isLocked', () => {
  it('lockUntil 이 지금보다 뒤면 잠김 — 같은 순간은 풀림', () => {
    expect(isLocked(null, now)).toBe(false)
    expect(isLocked(at(1), now)).toBe(true)
    expect(isLocked(at(0), now)).toBe(false)
    expect(isLocked(at(-1), now)).toBe(false)
  })
})

describe('nextLoginState', () => {
  it('기본값은 5회 · 15분', () => {
    expect(DEFAULT_LOCKOUT).toEqual({ maxFailures: 5, lockMs: 15 * 60 * 1000 })
  })

  it('실패 1~4회는 잠그지 않고 5회째 now + lockMs 로 잠근다', () => {
    let state: { loginFailCount: number; lockUntil: Date | null } = {
      loginFailCount: 0,
      lockUntil: null,
    }
    for (let count = 1; count <= 4; count += 1) {
      state = nextLoginState(state, 'fail', now)
      expect(state).toEqual({ loginFailCount: count, lockUntil: null })
    }
    expect(nextLoginState(state, 'fail', now)).toEqual({
      loginFailCount: 5,
      lockUntil: at(DEFAULT_LOCKOUT.lockMs),
    })
  })

  it('🔴 잠긴 동안의 실패는 카운트만 오르고 lockUntil 을 늘리지 않는다(1회 비용 DoS 방지)', () => {
    expect(nextLoginState({ loginFailCount: 5, lockUntil: at(60_000) }, 'fail', now)).toEqual({
      loginFailCount: 6,
      lockUntil: at(60_000),
    })
  })

  it('🔴 잠금이 끝난 뒤 첫 실패는 1부터 다시 센다 — 같은 순간도 끝난 것이다', () => {
    expect(nextLoginState({ loginFailCount: 5, lockUntil: at(0) }, 'fail', now)).toEqual({
      loginFailCount: 1,
      lockUntil: null,
    })
    expect(nextLoginState({ loginFailCount: 7, lockUntil: at(-1) }, 'fail', now)).toEqual({
      loginFailCount: 1,
      lockUntil: null,
    })
  })

  it('성공은 { 0, null } — 잠겨 있었어도', () => {
    expect(nextLoginState({ loginFailCount: 3, lockUntil: at(5000) }, 'success', now)).toEqual({
      loginFailCount: 0,
      lockUntil: null,
    })
  })

  it('lockout 값을 받는다', () => {
    expect(
      nextLoginState({ loginFailCount: 2, lockUntil: null }, 'fail', now, {
        maxFailures: 3,
        lockMs: 1000,
      }),
    ).toEqual({ loginFailCount: 3, lockUntil: at(1000) })
  })
})

describe('needsReset', () => {
  it('카운트나 잠금이 남아 있을 때만 참 — 성공 때 쓰기를 아낀다', () => {
    expect(needsReset({ loginFailCount: 0, lockUntil: null })).toBe(false)
    expect(needsReset({ loginFailCount: 1, lockUntil: null })).toBe(true)
    expect(needsReset({ loginFailCount: 0, lockUntil: at(-1000) })).toBe(true)
  })
})
