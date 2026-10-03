import { describe, expect, it } from 'vitest'
import { ref, type Ref } from 'vue'
import { bindQueryCodecs, queryCodec, withDefault } from './query-codec.js'

describe('queryCodec — 기본 코덱', () => {
  it('string: 빈 문자열은 없음, 반복 키는 첫 값', () => {
    const codec = queryCodec.string()
    expect(codec.decode('abc')).toBe('abc')
    expect(codec.decode('')).toBeUndefined()
    expect(codec.decode(undefined)).toBeUndefined()
    expect(codec.decode(null)).toBeUndefined()
    expect(codec.decode(['a', 'b'])).toBe('a')
    expect(codec.encode('')).toBeUndefined()
    expect(codec.encode('x')).toBe('x')
  })

  it('int: 안전 정수만 — 범위 밖 · 소수 · 문자 · 너무 큰 수는 없음', () => {
    const codec = queryCodec.int({ min: 1, max: 100 })
    expect(codec.decode('3')).toBe(3)
    expect(codec.decode('0')).toBeUndefined()
    expect(codec.decode('101')).toBeUndefined()
    expect(codec.decode('1.5')).toBeUndefined()
    expect(codec.decode('abc')).toBeUndefined()
    expect(queryCodec.int().decode('99999999999999999999')).toBeUndefined()
    expect(queryCodec.int().decode('-4')).toBe(-4)
    expect(codec.encode(7)).toBe('7')
    expect(codec.encode(0)).toBeUndefined()
  })

  it("🔴 bool: '1'/'0' 만 — 'true'·'false' 는 형식이 틀린 값", () => {
    const codec = queryCodec.bool()
    expect(codec.decode('1')).toBe(true)
    expect(codec.decode('0')).toBe(false)
    expect(codec.decode('true')).toBeUndefined()
    expect(codec.decode('false')).toBeUndefined()
    expect(codec.encode(true)).toBe('1')
    expect(codec.encode(false)).toBe('0')
  })

  it('enumOf: 목록 밖 값은 없음', () => {
    const codec = queryCodec.enumOf(['active', 'locked'])
    expect(codec.decode('locked')).toBe('locked')
    expect(codec.decode('deleted')).toBeUndefined()
    expect(codec.encode('active')).toBe('active')
  })

  it('🔴 bigint: 0 이상 정수 — 앞자리 0 · 음수 · 지수 표기는 없음', () => {
    const codec = queryCodec.bigint()
    expect(codec.decode('12')).toBe(12n)
    expect(codec.decode('0')).toBe(0n)
    expect(codec.decode('012')).toBeUndefined()
    expect(codec.decode('-1')).toBeUndefined()
    expect(codec.decode('1e3')).toBeUndefined()
    expect(codec.encode(12n)).toBe('12')
    expect(codec.encode(-1n)).toBeUndefined()
  })

  it('array: 반복 키 — 틀린 원소는 버리고, 남은 게 없으면 없음', () => {
    const codec = queryCodec.array(queryCodec.int())
    expect(codec.decode(['1', 'x', '3'])).toEqual([1, 3])
    expect(codec.decode('5')).toEqual([5])
    expect(codec.decode(['x'])).toBeUndefined()
    expect(codec.decode(undefined)).toBeUndefined()
    expect(codec.encode([1, 2])).toEqual(['1', '2'])
    expect(codec.encode([])).toBeUndefined()
  })

  it('🔴 어떤 입력에도 던지지 않는다 — 주소창의 값으로 화면이 백지가 되면 안 된다', () => {
    const inputs = [undefined, null, '', ' ', '%', ['', null], 'NaN', '1'.repeat(400)]
    const codecs = [
      queryCodec.string(),
      queryCodec.int(),
      queryCodec.bool(),
      queryCodec.enumOf(['a']),
      queryCodec.bigint(),
      queryCodec.array(queryCodec.bigint()),
    ]
    for (const codec of codecs) {
      for (const input of inputs) expect(() => codec.decode(input)).not.toThrow()
    }
  })
})

describe('withDefault', () => {
  it('없거나 틀리면 기본값으로 읽는다', () => {
    const codec = withDefault(queryCodec.int({ min: 1 }), 1)
    expect(codec.decode(undefined)).toBe(1)
    expect(codec.decode('abc')).toBe(1)
    expect(codec.decode('4')).toBe(4)
    expect(codec.defaultValue).toBe(1)
  })

  it('기본값과 같으면 URL 에서 뺀다 — 배열 · bigint 는 값으로 비교', () => {
    const tags = withDefault(queryCodec.array(queryCodec.string()), ['a'])
    expect(tags.encode(['a'])).toBeUndefined()
    expect(tags.encode(['a', 'b'])).toEqual(['a', 'b'])
    const team = withDefault(queryCodec.bigint(), 1n)
    expect(team.encode(1n)).toBeUndefined()
    expect(team.encode(2n)).toBe('2')
  })
})

describe('bindQueryCodecs', () => {
  interface Filter {
    status: 'active' | 'locked'
    teamNo?: bigint
    q: string
    other: number
  }

  function bind(state: Ref<Filter>) {
    return bindQueryCodecs(state, {
      status: withDefault(queryCodec.enumOf(['active', 'locked']), 'active'),
      teamNo: queryCodec.bigint(),
      q: withDefault(queryCodec.string(), ''),
    })
  }

  it('read 는 spec 키만 새로 대입하고 다른 상태 키는 그대로 둔다', () => {
    const state = ref<Filter>({ status: 'locked', teamNo: 3n, q: 'x', other: 9 })
    bind(state).read({ teamNo: '7' })
    expect(state.value).toEqual({ status: 'active', teamNo: 7n, q: '', other: 9 })
  })

  it('toQuery 는 기본값 · undefined 를 뺀다', () => {
    const state = ref<Filter>({ status: 'active', q: '', other: 0 })
    expect(bind(state).toQuery()).toEqual({})
    state.value = { status: 'locked', teamNo: 12n, q: '김', other: 0 }
    expect(bind(state).toQuery()).toEqual({ status: 'locked', teamNo: '12', q: '김' })
  })

  it('왕복 — URL → 상태 → URL 이 같은 쿼리', () => {
    const state = ref<Filter>({ status: 'active', q: '', other: 0 })
    const binding = bind(state)
    binding.read({ status: 'locked', teamNo: '12', q: '김' })
    expect(binding.toQuery()).toEqual({ status: 'locked', teamNo: '12', q: '김' })
  })

  it('타입 — 기본값 없는 코덱은 undefined 를 허용하는 키에만 쓸 수 있다', () => {
    const state = ref<{ q: string; teamNo?: bigint }>({ q: '' })
    // @ts-expect-error — q 는 undefined 를 허용하지 않으므로 기본값 없는 코덱을 받을 수 없다
    bindQueryCodecs(state, { q: queryCodec.string() })
    const ok = bindQueryCodecs(state, {
      q: withDefault(queryCodec.string(), ''),
      teamNo: queryCodec.bigint(),
    })
    expect(typeof ok.read).toBe('function')
  })
})
