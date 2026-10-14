import { randomInt } from 'node:crypto'

// 정본: ssworks-gise-home apps/api/src/modules/accounts/temporary-password.ts
// 바꾼 점: 없음 — 알파벳 · 길이 · randomInt · 주입 가능한 pick 그대로(3c §9 계약: 16자, 혼동 문자 I O l o 0 1 제외).
// 🔴 Math.random 을 쓰지 않는다 — 예측할 수 있는 난수는 임시 비밀번호를 추측하게 한다. randomInt 는 모듈로 편향이 없다.

export const TEMPORARY_PASSWORD_LENGTH = 16

/** 56자 — 대문자 24(I · O 제외) · 소문자 24(l · o 제외) · 숫자 8(0 · 1 제외) */
export const TEMPORARY_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** `pick(max)` 는 [0, max) 정수 — 테스트가 주입한다 */
export function generateTemporaryPassword(
  pick: (max: number) => number = (max) => randomInt(max),
): string {
  let password = ''
  for (let index = 0; index < TEMPORARY_PASSWORD_LENGTH; index += 1) {
    password += TEMPORARY_PASSWORD_ALPHABET.charAt(pick(TEMPORARY_PASSWORD_ALPHABET.length))
  }
  return password
}
