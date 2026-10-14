import { coreAuditCatalog, defineAuditCatalog } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { resolveAuditConfig } from './options.js'

describe('resolveAuditConfig', () => {
  it('없으면 코어 카탈로그 · 기본 비밀 키', () => {
    const config = resolveAuditConfig(undefined)
    expect(config.catalog).toBe(coreAuditCatalog)
    expect(config.secretKeys.has('password')).toBe(true)
  })

  it('프로젝트 카탈로그 · 쓰는 쪽 비밀 키(소문자로)', () => {
    const catalog = defineAuditCatalog({ actions: { X: 'probe.x' }, labels: { 'probe.x': 'x' } })
    const config = resolveAuditConfig({ catalog, secretKeys: ['S3SecretKeyEnc'] })
    expect(config.catalog).toBe(catalog)
    expect(config.secretKeys.has('s3secretkeyenc')).toBe(true)
    expect(config.secretKeys.has('token')).toBe(true)
  })

  it('빈 비밀 키 이름은 기동에서 멈춘다', () => {
    expect(() => resolveAuditConfig({ secretKeys: [' '] })).toThrow('audit.secretKeys')
  })
})
