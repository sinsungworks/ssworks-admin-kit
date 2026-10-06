// 브라우저 원문(User-Agent) → "Chrome · Windows".
//
// 정본: ssworks-gise-home apps/admin/src/utils/user-agent.ts
// 바꾼 점: admin-shared 로 옮겼다 — 프레임워크 무관한 순수 함수라 Phase 2 서버가 감사 로그에 같은 문구를 쓸 수
//          있다. 입력에 `undefined` 를 더 받는다.
//
// 🔴 표의 순서가 규칙이다. 앞에서부터 처음 맞는 것을 쓴다.
//    - Edge · Whale · Samsung Internet 원문에는 `Chrome/` 이 들어 있고, Chrome 원문에는 `Safari/` 가 들어 있다.
//    - iOS 원문에는 `like Mac OS X` 가 들어 있다 — iOS 를 macOS 보다 먼저 본다.
//    - Android 원문에는 `Linux` 가 들어 있다 — Android 를 Linux 보다 먼저 본다.

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bWhale\//, 'Whale'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
]

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\bCrOS\b/, 'ChromeOS'],
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\b(?:Mac OS X|Macintosh)\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

function firstMatch(table: readonly (readonly [RegExp, string])[], text: string): string | null {
  for (const [pattern, name] of table) {
    if (pattern.test(text)) return name
  }
  return null
}

export function describeUserAgent(userAgent: string | null | undefined): string {
  const text = userAgent?.trim() ?? ''
  if (text === '') return '기기 정보 없음'
  const browser = firstMatch(BROWSERS, text)
  const system = firstMatch(SYSTEMS, text)
  if (browser != null && system != null) return `${browser} · ${system}`
  return browser ?? system ?? '알 수 없는 기기'
}
