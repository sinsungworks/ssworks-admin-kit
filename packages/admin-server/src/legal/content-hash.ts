import { createHash } from 'node:crypto'

// 정본: ssworks-gise-home · ssworks-axion-admin legal.service.ts(createHash('sha256').update(body, 'utf8').digest('hex'))
// 바꾼 점: 서비스에서 떼어 냈다 — 단위 테스트가 Nest 를 싣지 않게.
// 🔴 해시는 서버만 셈한다 — 클라이언트가 보낸 해시를 믿으면 동의 기록의 스냅샷을 위조할 수 있다(3e §9). 본문을 트림 ·
//    정규화하지 않는다(3e D3 — 편집기에서 받은 그대로가 해시 대상이다).

/** sha256(body, utf8) hex 소문자 64자 */
export function legalContentHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}
