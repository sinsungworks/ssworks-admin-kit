import { createHash } from 'node:crypto'

// 정본: ssworks-ringside apps/api/src/uploads/media-http.ts(ETag · If-None-Match · 캐시 수명)
// 바꾼 점: 경로가 `media/:purpose/:yyyy/:mm/:file`(Express 5 — 와일드카드 대신 네 파라미터, 스펙 U5). ETag 는 앞 16자.
// 🔴 컨트롤러 경로는 'media' 로 고정이다(데코레이터는 정적) — 공개 경로 옵션 mediaPath 는 '/media' 로 끝나야 한다(uploads/options.ts).

export const MEDIA_CONTROLLER_PATH = 'media'

/** 캐시 수명(초) — 지움 표시가 공유 캐시에서 이 안에 사라진다 */
export const MEDIA_MAX_AGE_SECONDS = 600

/** ETag — 키의 sha256 앞 16자(따옴표). 키의 내용은 바뀌지 않는다(새 그림은 새 키) */
export function mediaEtag(key: string): string {
  return `"${createHash('sha256').update(key).digest('hex').slice(0, 16)}"`
}

/** If-None-Match 가 이 ETag 를 가리키는가 — 목록 · 약한 표기(W/) · `*` */
export function etagMatches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false
  return header.split(',').some((raw) => {
    const tag = raw.trim().replace(/^W\//, '')
    return tag === '*' || tag === etag
  })
}
