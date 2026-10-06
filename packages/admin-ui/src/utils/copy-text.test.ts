// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copy-text.js'

// 정본: hangang-home apps/admin/src/pages/org/users.render.test.ts 의 복사 3갈래.

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('copyText', () => {
  it("🔴 클립보드 API 가 없으면 'unavailable' — 보안 컨텍스트가 아닌 사내 http 주소", async () => {
    setClipboard(undefined)
    expect(await copyText('Ab3dEf7h')).toBe('unavailable')
  })

  it("writeText 가 없어도 'unavailable'", async () => {
    setClipboard({})
    expect(await copyText('Ab3dEf7h')).toBe('unavailable')
  })

  it("쓰기가 거부되면 'failed' — 던지지 않는다", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) })
    expect(await copyText('Ab3dEf7h')).toBe('failed')
  })

  it("성공하면 'done' — 값을 그대로 쓴다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    expect(await copyText('Ab3dEf7h')).toBe('done')
    expect(writeText).toHaveBeenCalledWith('Ab3dEf7h')
  })
})
