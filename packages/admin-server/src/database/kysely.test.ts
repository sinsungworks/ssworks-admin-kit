import {
  CamelCasePlugin,
  type PluginTransformResultArgs,
  type QueryResult,
  type UnknownRow,
} from 'kysely'
import { describe, expect, it } from 'vitest'
import { BooleanTransformPlugin } from './boolean-transform.plugin.js'
import { adminKyselyPlugins } from './kysely.js'

describe('adminKyselyPlugins', () => {
  it('🔴 [BooleanTransform, CamelCase] 순서 — boolean 판정이 snake 원본 키를 먼저 본다', () => {
    const plugins = adminKyselyPlugins()
    expect(plugins).toHaveLength(2)
    expect(plugins[0]).toBeInstanceOf(BooleanTransformPlugin)
    expect(plugins[1]).toBeInstanceOf(CamelCasePlugin)
  })

  it('🔴 JSON 컬럼 안쪽의 snake 키를 바꾸지 않는다(maintainNestedObjectKeys — crm 사고)', async () => {
    let result: QueryResult<UnknownRow> = {
      rows: [{ is_default: 1, extra_data: { inner_key: { deep_key: 1 } } }],
    }
    for (const plugin of adminKyselyPlugins()) {
      result = await plugin.transformResult({
        queryId: { queryId: 'q' },
        result,
      } as unknown as PluginTransformResultArgs)
    }
    expect(result.rows).toEqual([{ isDefault: true, extraData: { inner_key: { deep_key: 1 } } }])
  })

  it('부를 때마다 새 인스턴스', () => {
    expect(adminKyselyPlugins()[0]).not.toBe(adminKyselyPlugins()[0])
  })
})
