import { describe, expect, it } from 'vitest'
import { resolveIpAccessConfig, type AdminIpScopeTarget } from './options.js'

// 확장 범위 옵션(확장 범위 스펙 §4-1). 🔴 문제를 모아 한 번에 던진다 — 하나 고치고 다시 띄우기를 되풀이하지 않게.

const target: AdminIpScopeTarget = {
  async lock() {
    return true
  },
  async names() {
    return new Map()
  },
}

const resolve = (ipAccess: unknown) => resolveIpAccessConfig({ ipAccess: ipAccess as never })

describe('resolveIpAccessConfig — ipAccess', () => {
  it('없으면 확장 범위가 비었다 — 지금과 같다', () => {
    const config = resolveIpAccessConfig({})
    expect(config.extraScopes.size).toBe(0)
    expect(config.reauth).toBe(false)
    expect(config.clientIp).toBe('req.ip')
  })

  it('등록 — 이름 · 기본 wholeScope true · 끈 wholeScope · 옵션 순서', () => {
    const config = resolve({
      extraScopes: [
        { type: 'shippingToken', target },
        { type: 'apiKey', wholeScope: false, target },
      ],
    })
    expect([...config.extraScopes.keys()]).toEqual(['shippingToken', 'apiKey'])
    expect(config.extraScopes.get('shippingToken')).toMatchObject({
      type: 'shippingToken',
      wholeScope: true,
    })
    expect(config.extraScopes.get('apiKey')?.wholeScope).toBe(false)
    expect(config.extraScopes.get('apiKey')?.target).toBe(target)
  })

  it('빈 extraScopes 는 지금과 같다', () => {
    expect(resolve({ extraScopes: [] }).extraScopes.size).toBe(0)
    expect(resolve({}).extraScopes.size).toBe(0)
  })

  it.each<[string, unknown, string]>([
    ['객체가 아님', 'shippingToken', 'ipAccess 는 { extraScopes } 객체여야 한다'],
    ['모르는 키', { extra: [] }, 'ipAccess 에 모르는 키: extra'],
    ['배열이 아님', { extraScopes: {} }, 'ipAccess.extraScopes 는 배열이어야 한다'],
    [
      '항목이 객체가 아님',
      { extraScopes: ['x'] },
      'ipAccess.extraScopes[0] 는 { type, target } 객체여야 한다',
    ],
    [
      '이름 규칙 밖',
      { extraScopes: [{ type: 'Shipping', target }] },
      'ipAccess.extraScopes[0].type 은',
    ],
    [
      '🔴 코어 이름(대소문자 무시)',
      { extraScopes: [{ type: 'gLOBAL', target }] },
      'ipAccess.extraScopes[0].type 은',
    ],
    [
      'wholeScope 가 boolean 아님',
      { extraScopes: [{ type: 'a', wholeScope: 'yes', target }] },
      'ipAccess.extraScopes[0].wholeScope 는 true · false 여야 한다',
    ],
    [
      '훅 없음',
      { extraScopes: [{ type: 'a', target: { lock: () => true } }] },
      'ipAccess.extraScopes[0].target 은 lock · names 함수를 가진 객체여야 한다',
    ],
    [
      '🔴 권한 키(R7 없음)',
      { extraScopes: [{ type: 'a', target, permissions: { read: 'x', manage: 'y' } }] },
      'ipAccess.extraScopes[0].permissions — 확장 범위에는 권한 키를 두지 않는다',
    ],
    [
      '모르는 항목 키',
      { extraScopes: [{ type: 'a', target, label: '출고' }] },
      'ipAccess.extraScopes[0] 에 모르는 키: label',
    ],
    [
      '이름 겹침(대소문자 무시)',
      {
        extraScopes: [
          { type: 'shippingToken', target },
          { type: 'shippingtoken', target },
        ],
      },
      'ipAccess.extraScopes 의 이름이 겹친다: shippingtoken',
    ],
  ])('🔴 %s — 기동에서 멈춘다', (_name, ipAccess, message) => {
    expect(() => resolve(ipAccess)).toThrow('AdminIpAccessModule 의 ipAccess 옵션이 맞지 않다 — ')
    expect(() => resolve(ipAccess)).toThrow(message)
  })

  it('문제를 모아 한 번에 던진다', () => {
    expect(() =>
      resolve({
        extraScopes: [
          { type: 'Bad', target: null },
          { type: 'global', target },
        ],
      }),
    ).toThrow(
      /extraScopes\[0\]\.type .* \/ .*extraScopes\[0\]\.target .* \/ .*extraScopes\[1\]\.type/,
    )
  })
})
