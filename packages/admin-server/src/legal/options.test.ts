import { describe, expect, it } from 'vitest'
import { resolveLegalConfig } from './options.js'

const resolve = (legal: unknown) => resolveLegalConfig({ legal } as never, 'AdminLegalModule')

function messageOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('던지지 않았다')
}

describe('resolveLegalConfig(2e 스펙 B14)', () => {
  it('종류를 그대로 돌려준다 — 얼려서', () => {
    const config = resolve({ kinds: ['TERMS', 'PRIVACY', 'refund_v2'] })
    expect(config.kinds).toEqual(['TERMS', 'PRIVACY', 'refund_v2'])
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.kinds)).toBe(true)
  })

  it('🔴 옵션이 없으면 기동에서 멈춘다 — 무엇을 더할지 문구에', () => {
    for (const legal of [undefined, null, 'TERMS']) {
      expect(messageOf(() => resolve(legal))).toBe(
        "AdminLegalModule 은 legal 옵션이 있어야 한다 — AdminServerModule 옵션에 legal: { kinds: ['TERMS', 'PRIVACY'] } 를 더한다.",
      )
    }
  })

  it('빈 배열 · 배열 아님', () => {
    for (const kinds of [[], undefined, 'TERMS', { 0: 'TERMS' }]) {
      expect(messageOf(() => resolve({ kinds }))).toBe(
        'AdminLegalModule 의 legal 옵션이 맞지 않다 — legal.kinds 는 비어 있지 않은 배열이어야 한다',
      )
    }
  })

  it('🔴 형식 밖(앞 공백 · 33자 · 한글 · 빈 문자열 · 문자열 아님)과 겹침을 모아 한 번에 — 32자는 된다', () => {
    const long = 'A'.repeat(33)
    const message = messageOf(() =>
      resolve({ kinds: ['TERMS', ' TERMS', long, '약관', '', 7, 'TERMS', 'B'.repeat(32)] }),
    )
    expect(message).toBe(
      'AdminLegalModule 의 legal 옵션이 맞지 않다 — ' +
        [
          `legal.kinds[1] — 영숫자 · '_' 1~32자가 아니다: " TERMS"`,
          `legal.kinds[2] — 영숫자 · '_' 1~32자가 아니다: "${long}"`,
          `legal.kinds[3] — 영숫자 · '_' 1~32자가 아니다: "약관"`,
          `legal.kinds[4] — 영숫자 · '_' 1~32자가 아니다: ""`,
          `legal.kinds[5] — 영숫자 · '_' 1~32자가 아니다: 7`,
          'legal.kinds 에 겹친 종류: TERMS',
        ].join(' / '),
    )
  })
})
