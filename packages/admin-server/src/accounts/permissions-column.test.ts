import { describe, expect, it } from 'vitest'
import { permissionsOrEmpty, readPermissionsColumn } from './permissions-column.js'

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

describe('permissionsOrEmpty', () => {
  it('🔴 깨진 열은 역할 번호만 담아 경고하고 [](fail-closed)', () => {
    const warnings: string[] = []
    const logger = { warn: (message: string) => warnings.push(message) }
    expect(permissionsOrEmpty({ roleNo: 3n, permissions: '["a","b"]' }, logger)).toEqual(['a', 'b'])
    expect(permissionsOrEmpty({ roleNo: 4n, permissions: '{"a":1}' }, logger)).toEqual([])
    expect(warnings).toEqual(['역할 4 의 permissions 가 배열이 아니다 — 빈 권한으로 본다.'])
  })
})
