import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safe-redirect.js'

// 신규 테스트. 동작의 정본은 gise-home `router/safe-redirect.ts`.
describe('safeRedirect', () => {
  it('동일 오리진 경로는 그대로 통과한다', () => {
    expect(safeRedirect('/a/b?c=1')).toBe('/a/b?c=1')
    expect(safeRedirect('/')).toBe('/')
  })

  it('프로토콜 상대 URL(//evil)을 거부한다', () => {
    expect(safeRedirect('//evil.example')).toBe('/')
  })

  it('백슬래시를 거부한다 — /\\evil, \\\\evil, 경로 중간의 백슬래시', () => {
    expect(safeRedirect('/\\evil.example')).toBe('/')
    expect(safeRedirect('\\\\evil.example')).toBe('/')
    expect(safeRedirect('/a\\b')).toBe('/')
  })

  it('제어 문자를 거부한다 — URL 파서가 탭·개행을 지우면 //evil 이 된다', () => {
    expect(safeRedirect('/\t/evil.example')).toBe('/')
    expect(safeRedirect('/\n/evil.example')).toBe('/')
    expect(safeRedirect('/\r/evil.example')).toBe('/')
    expect(safeRedirect('/a\u0000b')).toBe('/')
    expect(safeRedirect('/a\u007fb')).toBe('/')
  })

  it('절대 URL 을 거부한다', () => {
    expect(safeRedirect('http://evil.example')).toBe('/')
    expect(safeRedirect('https://evil.example/x')).toBe('/')
    expect(safeRedirect('javascript:alert(1)')).toBe('/')
  })

  it('문자열이 아니면 fallback 이다', () => {
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect(null)).toBe('/')
    expect(safeRedirect(['/a'])).toBe('/')
    expect(safeRedirect(123)).toBe('/')
  })

  it('fallback 을 지정할 수 있다', () => {
    expect(safeRedirect('//evil', '/home')).toBe('/home')
    expect(safeRedirect(undefined, '/home')).toBe('/home')
    expect(safeRedirect('/ok', '/home')).toBe('/ok')
  })
})
