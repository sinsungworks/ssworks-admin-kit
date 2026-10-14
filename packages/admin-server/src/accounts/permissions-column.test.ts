import { describe, expect, it } from 'vitest'
import { readPermissionsColumn } from './permissions-column.js'

describe('readPermissionsColumn', () => {
  it('파싱된 배열 · JSON 문자열 둘 다 — 문자열 원소만', () => {
    expect(readPermissionsColumn(['a', 'b'])).toEqual(['a', 'b'])
    expect(readPermissionsColumn('["a","*"]')).toEqual(['a', '*'])
    expect(readPermissionsColumn(['a', 1, null, 'b'])).toEqual(['a', 'b'])
  })

  it('🔴 배열이 아니거나 깨진 JSON 이면 null — 부르는 쪽이 경고하고 빈 권한으로 본다(fail-closed)', () => {
    expect(readPermissionsColumn({ a: 1 })).toBeNull()
    expect(readPermissionsColumn('{not json')).toBeNull()
    expect(readPermissionsColumn(null)).toBeNull()
  })
})
