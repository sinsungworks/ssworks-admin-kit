import { describe, expect, it } from 'vitest'
import {
  META_MAX_BYTES,
  foldBigInts,
  scrubSecrets,
  secretKeySet,
  serializeAuditMeta,
} from './scrub.js'

const keys = secretKeySet()

describe('scrubSecrets', () => {
  it('🔴 비밀 키는 대소문자 무시로 값만 가린다 — 배열 · 중첩까지(hangang I5)', () => {
    expect(
      scrubSecrets(
        {
          Password: 'p',
          TOKEN: 't',
          nested: { secret: 's', keep: 1 },
          list: [{ newPassword: 'n' }, 'plain'],
          currentPassword: { deep: 'whole' },
        },
        keys,
      ),
    ).toEqual({
      Password: '***',
      TOKEN: '***',
      nested: { secret: '***', keep: 1 },
      list: [{ newPassword: '***' }, 'plain'],
      currentPassword: '***',
    })
  })

  it('쓰는 쪽 키를 더한다', () => {
    expect(scrubSecrets({ apiKey: 'k', name: 'n' }, secretKeySet(['ApiKey']))).toEqual({
      apiKey: '***',
      name: 'n',
    })
  })

  it('Date 는 건드리지 않는다', () => {
    const at = new Date('2026-10-14T00:00:00.000Z')
    expect((scrubSecrets({ at }, keys) as { at: Date }).at).toBe(at)
  })

  it('🔴 순환은 [Circular] — 형제가 같은 객체를 가리키는 것은 순환이 아니다', () => {
    const loop: Record<string, unknown> = { name: 'a' }
    loop.self = loop
    expect(scrubSecrets(loop, keys)).toEqual({ name: 'a', self: '[Circular]' })
    const shared = { x: 1 }
    expect(scrubSecrets({ a: shared, b: shared }, keys)).toEqual({ a: { x: 1 }, b: { x: 1 } })
  })

  it('🔴 깊이 20 에서 [Depth]', () => {
    let deep: Record<string, unknown> = { leaf: true }
    for (let i = 0; i < 25; i += 1) deep = { n: deep }
    let cursor = scrubSecrets(deep, keys) as Record<string, unknown>
    for (let i = 0; i < 19; i += 1) cursor = cursor.n as Record<string, unknown>
    expect(cursor.n).toBe('[Depth]')
  })
})

describe('🔴 일반 객체 밖 — JSON.stringify 가 직렬화하는 모든 객체(최종 리뷰 F1)', () => {
  class Dto {
    constructor(
      public userNo: number,
      public newPassword: string,
      public nested: { token: string },
    ) {}
  }

  it('클래스 인스턴스 안의 비밀도 가린다', () => {
    const text = serializeAuditMeta({ body: new Dto(3, 'plain-new', { token: 't' }) }, keys)
    expect(text).toBe('{"body":{"userNo":3,"newPassword":"***","nested":{"token":"***"}}}')
  })

  it('toJSON 이 돌려주는 값을 걷는다', () => {
    const withToJson = { toJSON: () => ({ password: 'p', keep: 1 }) }
    expect(serializeAuditMeta({ x: withToJson }, keys)).toBe('{"x":{"password":"***","keep":1}}')
  })

  it('클래스 인스턴스 안의 bigint 도 접는다 — 자리표시로 떨어지지 않는다', () => {
    expect(serializeAuditMeta({ body: new Dto(3, 'p', { token: 't' }), id: 1n }, keys)).not.toBe(
      '{"_unserializable":true}',
    )
    class Holder {
      id = 9n
    }
    expect(serializeAuditMeta({ h: new Holder() }, keys)).toBe('{"h":{"id":"9"}}')
  })

  it('클래스 인스턴스를 지나는 순환은 [Circular]', () => {
    class Node {
      self: unknown
    }
    const node = new Node()
    node.self = node
    expect(scrubSecrets({ node }, keys)).toEqual({ node: { self: '[Circular]' } })
    expect(serializeAuditMeta({ node }, keys)).toBe('{"node":{"self":"[Circular]"}}')
  })
})

describe('foldBigInts', () => {
  it('bigint → 십진 문자열, Date → ISO, 잘못된 Date → null', () => {
    expect(
      foldBigInts({
        a: 1n,
        at: new Date('2026-10-14T00:00:00.000Z'),
        list: [2n, { b: 3n }],
        bad: new Date(Number.NaN),
      }),
    ).toEqual({ a: '1', at: '2026-10-14T00:00:00.000Z', list: ['2', { b: '3' }], bad: null })
  })
})

describe('serializeAuditMeta', () => {
  it('비면 null, 아니면 소독 · 접기 뒤 표준 JSON', () => {
    expect(serializeAuditMeta({}, keys)).toBeNull()
    expect(serializeAuditMeta({ revokedCount: 2, userNo: 5n, password: 'p' }, keys)).toBe(
      '{"revokedCount":2,"userNo":"5","password":"***"}',
    )
  })

  it('🔴 UTF-8 64 KiB 를 넘으면 자리표시 — 글자 수가 아니라 바이트로 잰다', () => {
    const text = serializeAuditMeta({ body: '가'.repeat(30_000) }, keys)
    const bytes = Buffer.byteLength(JSON.stringify({ body: '가'.repeat(30_000) }), 'utf8')
    expect(bytes).toBeGreaterThan(META_MAX_BYTES)
    expect(text).toBe(`{"_truncated":true,"bytes":${bytes}}`)
  })

  it('직렬화가 던지면 자리표시 — 행을 잃지 않는다', () => {
    const exploding = new (class {
      toJSON(): never {
        throw new Error('boom')
      }
    })()
    expect(serializeAuditMeta({ exploding }, keys)).toBe('{"_unserializable":true}')
  })
})
