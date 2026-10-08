import { describe, expect, it } from 'vitest'
import { stringifyForLog, toJsonSafe } from './json-safe.js'

describe('toJsonSafe', () => {
  it('순환은 [circular], 형제는 남는다', () => {
    const node: Record<string, unknown> = { name: 'a' }
    node.self = node
    expect(toJsonSafe(node)).toEqual({ name: 'a', self: '[circular]' })
  })

  it('🔴 순환이 아닌 DAG 의 두 가지가 모두 남는다', () => {
    const child = { v: 1 }
    expect(toJsonSafe({ a: child, b: child })).toEqual({ a: { v: 1 }, b: { v: 1 } })
  })

  it('던지는 getter 는 그 키만 마커', () => {
    const value = {
      ok: 1,
      get bad(): never {
        throw new Error('getter')
      },
    }
    expect(toJsonSafe(value)).toEqual({ ok: 1, bad: '[unserializable]' })
  })

  it('깊이 상한에서 마커', () => {
    const root: Record<string, unknown> = {}
    let cursor = root
    for (let index = 0; index < 40; index += 1) {
      const next: Record<string, unknown> = {}
      cursor.next = next
      cursor = next
    }
    expect(JSON.stringify(toJsonSafe(root))).toContain('[max depth]')
  })

  it('Date 는 toJSON, bigint 는 그대로, NaN 은 null, undefined 키는 지우고 배열 안은 null', () => {
    expect(
      toJsonSafe({
        at: new Date('2026-01-02T03:04:05.000Z'),
        n: 3n,
        x: Number.NaN,
        u: undefined,
        list: [undefined, () => 1],
      }),
    ).toEqual({ at: '2026-01-02T03:04:05.000Z', n: 3n, x: null, list: [null, null] })
  })

  it('🔴 절대 던지지 않는다 — ownKeys 가 던지는 Proxy', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('no keys')
        },
      },
    )
    expect(toJsonSafe(hostile)).toBe('[unserializable]')
  })
})

describe('stringifyForLog', () => {
  it('bigint 를 "BigInt(n)" 래퍼로', () => {
    expect(stringifyForLog({ n: 3n })).toBe('{"n":"BigInt(3)"}')
  })
})
