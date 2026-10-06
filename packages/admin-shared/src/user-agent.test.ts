import { describe, expect, it } from 'vitest'
import { describeUserAgent } from './user-agent.js'

// 정본: ssworks-gise-home apps/admin/test/user-agent.test.ts 의 표 기반 방식.

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  whaleWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Whale/3.27.254.15 Safari/537.36',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  edgeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  firefoxIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15',
  edgeIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/129.0.2792.84 Version/17.0 Mobile/15E148 Safari/604.1',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
}

describe('describeUserAgent', () => {
  it.each([
    ['Chrome Windows', UA.chromeWindows, 'Chrome · Windows'],
    ['🔴 Edge 원문에는 Chrome/ 이 들어 있다 — Edge 가 먼저', UA.edgeWindows, 'Edge · Windows'],
    ['Whale', UA.whaleWindows, 'Whale · Windows'],
    ['Samsung Internet', UA.samsungAndroid, 'Samsung Internet · Android'],
    ['Edge Android', UA.edgeAndroid, 'Edge · Android'],
    ['Safari macOS', UA.safariMac, 'Safari · macOS'],
    ['🔴 iOS 원문의 like Mac OS X 를 macOS 로 읽지 않는다', UA.safariIphone, 'Safari · iOS'],
    ['iOS Chrome(CriOS)', UA.chromeIphone, 'Chrome · iOS'],
    ['iOS Firefox(FxiOS)', UA.firefoxIphone, 'Firefox · iOS'],
    ['iPad Edge(EdgiOS)', UA.edgeIpad, 'Edge · iOS'],
    ['Firefox Linux', UA.firefoxLinux, 'Firefox · Linux'],
    ['ChromeOS', UA.chromeOs, 'Chrome · ChromeOS'],
  ])('%s', (_title, ua, expected) => {
    expect(describeUserAgent(ua)).toBe(expected)
  })

  it('하나만 알면 그것만, 둘 다 모르면 "알 수 없는 기기"', () => {
    expect(describeUserAgent('Firefox/130.0')).toBe('Firefox')
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) SomeBot/1.0')).toBe('Windows')
    expect(describeUserAgent('curl/8.4.0')).toBe('알 수 없는 기기')
  })

  it('원문이 없거나 공백뿐이면 "기기 정보 없음"', () => {
    expect(describeUserAgent(null)).toBe('기기 정보 없음')
    expect(describeUserAgent(undefined)).toBe('기기 정보 없음')
    expect(describeUserAgent('   ')).toBe('기기 정보 없음')
  })
})
