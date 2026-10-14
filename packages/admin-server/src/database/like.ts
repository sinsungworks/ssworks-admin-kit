// 정본: ssworks-gise-home apps/api/src/core/database/like.ts(`likeContains` · `!`) + hangang-home
//       packages/shared/src/utils/escape-like.ts(`escapeLike` — 한 번에 바꾼다)
// 바꾼 점: 접두 도우미 `likePrefix` 를 더했다(hangang 감사 액션 필터가 손으로 `+ '%'` 했다).
//
// 쓰는 법: sql`${sql.ref('u.userId')} like ${likeContains(term)} escape '!'` — 빈 문자열은 부르는 쪽이 거른다('%%' 는 전부).
// 🔴 이스케이프 문자는 '!' 다 — MariaDB 기본 이스케이프(백슬래시)는 NO_BACKSLASH_ESCAPES 에서 뜻이 바뀐다.
// 🔴 `escape '!'` 는 SQL 정적 텍스트로 쓴다 — 문법 리터럴이라 바인딩할 수 없다.

export const LIKE_ESCAPE = '!'

const SPECIAL = /[!%_]/g

/** 🔴 한 번의 치환으로 셋을 다 바꾼다 — '!' 를 먼저, '%' 를 나중에 바꾸면 앞에서 넣은 '!' 를 다시 이스케이프한다. */
export function escapeLike(term: string): string {
  return term.replace(SPECIAL, (char) => `${LIKE_ESCAPE}${char}`)
}

/** `%…%` — 부분일치 */
export function likeContains(term: string): string {
  return `%${escapeLike(term)}%`
}

/** `…%` — 접두 일치(감사 액션 `session.revoke` → `.user` · `.self` · `.others` 도) */
export function likePrefix(term: string): string {
  return `${escapeLike(term)}%`
}
