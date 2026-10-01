/**
 * `route.query.redirect` 로 들어온 값이 동일 오리진 경로일 때만 그대로 돌려준다.
 * 그 외에는 전부 `fallback` 으로 떨어뜨린다 — 오픈 리다이렉트를 만들 수 있는 값은 신뢰하지 않는다.
 *
 * 정본: ssworks-gise-home `apps/admin/src/router/safe-redirect.ts`.
 * 바꾼 점: `fallback` 인자(기본 `/`)를 더했다.
 *
 * 🔴 `//host`(프로토콜 상대 URL)만 막아서는 부족하다. `/\host` 도 막아야 한다 — 브라우저는 URL 을
 * 파싱할 때 백슬래시를 슬래시와 동등하게 취급하므로 `/\evil.example` 도 `//evil.example` 과 똑같이
 * 외부 오리진으로 나간다. 백슬래시가 경로 어디에 있든(맨 앞이 아니어도) 신뢰하지 않는다.
 * 같은 이유로 제어 문자(탭·LF·CR 포함)도 거부한다 — 파서가 지운 뒤의 값이 `//host` 가 될 수 있다.
 * 이 두 부류(백슬래시·제어 문자)가 아는 우회 전부이며, 그 밖의 파서 특이점까지 보증하지는 않는다.
 */
export function safeRedirect(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback
  // 🔴 제어 문자(탭·LF·CR 포함)도 거부한다 — WHATWG URL 파서는 파싱 전에 탭·LF·CR 을 지우므로
  //    `/\t/evil.example` 이 `//evil.example` 로 바뀐다.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  return value
}
