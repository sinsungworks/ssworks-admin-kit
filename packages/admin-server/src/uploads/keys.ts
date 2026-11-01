import { randomBytes } from 'node:crypto'

// 정본: ssworks-ringside packages/db/src/uploads/keys.ts newUploadKey
// 바꾼 점: 접두사가 용도 문자열 그대로(옵션 검증을 지난 값). mediaUrl 은 admin-shared uploadUrl.

const RANDOM_BYTES = 24

/** 새 키 `<용도>/<yyyy>/<mm>/<base64url 32자>.webp` — 연월은 UTC. random 은 테스트가 결정적으로 바꾼다 */
export function newUploadKey(
  purpose: string,
  now: Date,
  random: (size: number) => Buffer = randomBytes,
): string {
  const bytes = random(RANDOM_BYTES)
  if (bytes.length !== RANDOM_BYTES) throw new Error(`키 무작위 바이트는 ${RANDOM_BYTES}바이트다`)
  const year = String(now.getUTCFullYear()).padStart(4, '0')
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${purpose}/${year}/${month}/${bytes.toString('base64url')}.webp`
}
