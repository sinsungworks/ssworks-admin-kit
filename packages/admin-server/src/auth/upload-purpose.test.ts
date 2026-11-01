import { describe, expect, it } from 'vitest'
import type { UploadPurposeGrant } from '../uploads/options.js'
import { grantsUploadPurpose, requestedUploadPurpose } from './upload-purpose.js'

const table = new Map<string, UploadPurposeGrant>([
  ['legal', { slot: 'legal.publish', permissions: [] }],
  ['notice', { slot: null, permissions: ['board.posts:write', 'board.posts:read'] }],
])
const permissions = { 'legal.publish': 'setting.legal:publish' }

describe('requestedUploadPurpose(스펙 U6)', () => {
  it('query.purpose 가 먼저, 없으면 params.purpose — 문자열 하나 · 형식 안일 때만', () => {
    expect(requestedUploadPurpose({ query: { purpose: 'legal' }, params: {} })).toBe('legal')
    expect(requestedUploadPurpose({ query: {}, params: { purpose: 'notice' } })).toBe('notice')
    expect(
      requestedUploadPurpose({ query: { purpose: 'legal' }, params: { purpose: 'notice' } }),
    ).toBe('legal')
    expect(requestedUploadPurpose({ query: { purpose: ['a', 'b'] }, params: {} })).toBeNull()
    expect(requestedUploadPurpose({ query: { purpose: 'bad kind' }, params: {} })).toBeNull()
    expect(requestedUploadPurpose({ query: {}, params: {} })).toBeNull()
    expect(requestedUploadPurpose({})).toBeNull()
  })
})

describe('grantsUploadPurpose', () => {
  it('슬롯 용도 — 이어진 키를 가져야 참, 이어지지 않은 슬롯은 거짓', () => {
    expect(grantsUploadPurpose(table, permissions, ['setting.legal:publish'], 'legal')).toBe(true)
    expect(grantsUploadPurpose(table, permissions, ['*'], 'legal')).toBe(true)
    expect(grantsUploadPurpose(table, permissions, ['setting.legal:read'], 'legal')).toBe(false)
    expect(grantsUploadPurpose(table, {}, ['*'], 'legal')).toBe(false)
  })

  it('권한 키 용도 — 전부(AND) 가져야 참', () => {
    expect(
      grantsUploadPurpose(table, permissions, ['board.posts:write', 'board.posts:read'], 'notice'),
    ).toBe(true)
    expect(grantsUploadPurpose(table, permissions, ['board.posts:write'], 'notice')).toBe(false)
    expect(grantsUploadPurpose(table, permissions, ['*'], 'notice')).toBe(true)
  })

  it('🔴 모르는 용도 · null · 표 없음은 거짓(fail-closed)', () => {
    expect(grantsUploadPurpose(table, permissions, ['*'], 'nope')).toBe(false)
    expect(grantsUploadPurpose(table, permissions, ['*'], null)).toBe(false)
    expect(grantsUploadPurpose(undefined, permissions, ['*'], 'legal')).toBe(false)
  })
})
