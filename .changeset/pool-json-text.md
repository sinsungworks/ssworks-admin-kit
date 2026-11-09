---
'@ssworks/admin-server': minor
---

DB 풀이 JSON 컬럼을 원문 글자로 받는다 — `adminPoolConfig` 에 `autoJsonMap: false`(드라이버 기본 true — MariaDB 는 JSON 을 LONGTEXT + 확장 메타데이터 `json` 으로 보내므로 이 옵션 하나가 가른다). 드라이버 기본값은 JSON 컬럼을 표준 `JSON.parse` 로 풀어 세 가지가 깨졌다(MariaDB 12.3.3 · 11.4 실측 — Pingly P0-3 검토).

- 최상위 JSON 문자열(`'"reject"'`)이 JS 문자열 `reject` 로 와 원문과 구분되지 않는다 — `readJsonColumn` 이 다시 파싱하다 `SyntaxError` 를 던지고, `'"123"'` 은 숫자 `123` 이 된다.
- 쿼리 모양마다 갈린다 — 열 그대로 · 파생 테이블 · `JSON_EXTRACT` 는 파싱된 값, `COALESCE` 로 감싸면 글자.
- 쓰는 쪽 BigInt 코덱(`parseJSON`)을 끼울 자리가 없다 — 값 안의 `"BigInt(n)"` 이 문자열로 남아 zod `z.bigint()` 가 실패한다.

이제 쿼리 모양 · 값 모양과 상관없이 늘 글자다. `readJsonColumn` 은 그대로 맞게 동작한다(글자면 `JSON.parse`).

**쓰는 쪽이 할 일:**

1. JSON 컬럼을 `readJsonColumn` 없이 객체로 쓰던 곳은 글자를 받는다 — `readJsonColumn` + zod 로 읽는다. 값에 bigint(`"BigInt(n)"`)가 들어 있으면 글자를 admin-shared `parseJSON` 에 넘긴다.
2. Kysely `jsonArrayFrom` · `jsonObjectFrom`(MySQL 도우미)이나 `JSON_OBJECT` · `JSON_ARRAYAGG` 결과도 글자다 — 같은 방법으로 읽는다.
3. `JSON_EXTRACT` 결과는 따옴표가 붙은 JSON 글자다(`'"active"'`). 스칼라 하나가 필요하면 `JSON_VALUE` · `JSON_UNQUOTE` 를 쓰거나 글자를 파싱한다.
4. `adminPoolConfig` 를 거치지 않고 만든 풀(직접 `createPool`)은 드라이버 기본값 그대로다 — 앱 · 러너 · 시드 · 테스트 모두 `adminPoolConfig` 로 만든다.
