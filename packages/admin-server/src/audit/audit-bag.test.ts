import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { serializeAuditMeta, secretKeySet } from './scrub.js'
import { attachAuditDiff, attachAuditMeta, attachAuditTarget, readAuditBag } from './audit-bag.js'

const request = () => ({ params: {} }) as unknown as Request

describe('감사 가방', () => {
  it('붙인 것이 없으면 없다', () => {
    expect(readAuditBag(request())).toBeUndefined()
  })

  it('대상 · meta(얕은 병합, 뒤가 이긴다)', () => {
    const req = request()
    attachAuditTarget(req, 7n)
    attachAuditMeta(req, { a: 1, b: 1 })
    attachAuditMeta(req, { b: 2 })
    expect(readAuditBag(req)).toEqual({ targetRefNo: 7n, meta: { a: 1, b: 2 } })
  })

  it('diff 는 fields 에 적힌 자기 키만 — 상속 키 · 없는 키는 빼고, null 은 빈 객체', () => {
    const req = request()
    const before = Object.assign(Object.create({ inherited: 'x' }) as object, {
      roleName: '옛',
      extra: 1,
    })
    attachAuditDiff(req, before, null, ['roleName', 'inherited', 'missing'])
    expect(readAuditBag(req)?.meta).toEqual({ before: { roleName: '옛' }, after: {} })
  })

  it('가방은 요청의 열거 키를 늘리지 않는다(심볼 자리)', () => {
    const req = request()
    const keysBefore = Object.keys(req)
    attachAuditMeta(req, { a: 1 })
    expect(Object.keys(req)).toEqual(keysBefore)
  })

  it('🔴 __proto__ 키는 데이터로 남고 다른 키처럼 가려진다(최종 리뷰 F1)', () => {
    const req = request()
    attachAuditMeta(req, JSON.parse('{"__proto__":{"password":"x"},"password":"y"}') as never)
    const text = serializeAuditMeta(readAuditBag(req)!.meta, secretKeySet())
    expect(text).toBe('{"__proto__":{"password":"***"},"password":"***"}')
  })

  it('diff 의 __proto__ 필드도 데이터로 남는다', () => {
    const req = request()
    const before = JSON.parse('{"__proto__":{"token":"t"},"a":1}') as Record<string, unknown>
    attachAuditDiff(req, before, null, ['__proto__', 'a'])
    expect(serializeAuditMeta(readAuditBag(req)!.meta, secretKeySet())).toBe(
      '{"before":{"__proto__":{"token":"***"},"a":1},"after":{}}',
    )
  })
})
