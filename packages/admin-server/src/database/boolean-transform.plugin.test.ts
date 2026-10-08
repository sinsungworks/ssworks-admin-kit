import type { PluginTransformResultArgs, UnknownRow } from 'kysely'
import { describe, expect, it } from 'vitest'
import { BooleanTransformPlugin } from './boolean-transform.plugin.js'

async function transform(rows: UnknownRow[]): Promise<UnknownRow[]> {
  const result = await new BooleanTransformPlugin().transformResult({
    queryId: { queryId: 'q' },
    result: { rows },
  } as unknown as PluginTransformResultArgs)
  return result.rows
}

describe('BooleanTransformPlugin', () => {
  it('is_ · has_ · isX · hasX 의 0/1 을 boolean 으로', async () => {
    expect(await transform([{ is_revoked: 1, has_child: 0, isDefault: 1, hasX: 0 }])).toEqual([
      { is_revoked: true, has_child: false, isDefault: true, hasX: false },
    ])
  })

  it('접두를 우연히 품은 이름은 그대로', async () => {
    const row = { island: 1, hash: 0, history: 1, is: 1, isolated: 0 }
    expect(await transform([row])).toEqual([row])
  })

  it('0/1 이 아닌 값은 그대로', async () => {
    const row = { is_x: 2, is_y: null, is_z: '1' }
    expect(await transform([row])).toEqual([row])
  })
})
