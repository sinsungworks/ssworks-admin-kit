import { hash, verify } from '@node-rs/argon2'

// 정본: ssworks-gise-home apps/api/src/core/auth/password.util.ts (= hangang-home core/utils/password.util.ts —
//       네 정본의 매개변수가 같다)
// 바꾼 점: 더미 해시를 여기로 옮겼다(gise 는 auth.service.ts). 러너 진입점이 낸다 — 시드 스크립트(B)가 Nest 없이
//   계정을 만든다(스펙 B5).

/**
 * Argon2id, m=64MiB · t=3 · p=4.
 * 🔴 매개변수를 낮추지 마라 — 이 비용 자체가 로그인 · 비밀번호 변경 · 재인증의 두 번째 속도 제한이다(첫째는 edge 의
 *    IP 단위 제한, 쓰는 쪽 몫). 계정 잠금은 여기에 도움이 되지 않는다 — 잠긴 계정도 비밀번호 검증을 먼저 거친다(의도된
 *    순서, 스펙 §5-1).
 * 🔴 `algorithm` 은 숫자 2(Argon2id)다 — `@node-rs/argon2` 의 `Algorithm` 은 const enum 이라 `isolatedModules` 에서
 *    값으로 쓸 수 없다(스펙 §14 R1-2, gise 와 같다).
 */
const HASH_OPTIONS = {
  algorithm: 2,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
} as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS)
}

/**
 * 🔴 해시가 깨졌으면 던진다(`Decoding failed`) — 데이터 손상이 조용히 "비밀번호 틀림" 이 되지 않게 한다. 호출부를 지나
 *    500(마스킹)이 된다.
 */
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password)
}

/**
 * 존재하지 않는 계정에도 argon2 검증을 한 번 태워 응답 시간을 맞춘다 — 안 그러면 응답 지연 차이만으로 계정 존재 여부가
 * 열거된다(gise). 같은 매개변수여야 같은 비용이 든다(테스트가 접두를 고정한다). 값은 gise 의
 * `hashPassword('never-matches-anything')` 결과다.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$bZ+HSIFQZdx1rbnNqDhj7Q$J7M0y3oOHAddakZGqIdGM+1Lwtx6s+f/NZ77RsGuRwI'
