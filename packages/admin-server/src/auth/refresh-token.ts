import { createHash, randomBytes } from 'node:crypto'

// 정본: ssworks-gise-home apps/api/src/modules/auth/token.util.ts (= hangang-home modules/auth/token.util.ts)
// 바꾼 점: 없음. hangang 의 UNIQUE 충돌 재시도(3회)는 옮기지 않았다 — 512비트 난수라 충돌하지 않는다.

/** 64바이트 난수 → 128자 hex. 엔트로피 512비트. */
export function createRefreshToken(): string {
  return randomBytes(64).toString('hex')
}

/**
 * 🔴 sha256 이다, argon2 가 아니다. 이 값은 조회 키다(`where refreshTokenHash = ?`) — argon2 는 솔트가 매번 달라 값으로
 *    인덱스를 못 탄다. 솔트도 느린 KDF 도 필요 없는 이유는 입력이 이미 512비트 난수라 사전 공격 대상이 아니기 때문이고,
 *    목표는 "덤프가 새도 유효 토큰이 나오지 않는다" 하나다(gise · hangang).
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
