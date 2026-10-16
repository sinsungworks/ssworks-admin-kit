---
'@ssworks/admin-ui': patch
---

`createApiClient` 의 쿼리 직렬화가 boolean 을 `'1'` · `''` 대신 `'true'` · `'false'` 로 보낸다 — admin-shared `queryBooleanSchema`(admin-server 목록 필터)가 받는 모양이다. 전에는 `TeamUserList` 의 "하위 팀 포함" 같은 boolean 필터가 admin-server 에서 400 이었다.

쓰는 쪽이 할 일: admin-server 와 `'true'` · `'false'` 를 받는 서버는 없음. 🔴 boolean 쿼리를 `z.coerce.boolean()` 으로 받는 자체 서버는 이제 `'false'` 를 참으로 읽는다(`Boolean('false') === true`) — 400 없이 뒤집힌 목록이 나온다. admin-shared `queryBooleanSchema` 나 `'true'` · `'false'` 를 가리는 스키마로 바꾼다. `'1'` · `''` 만 받던 서버도 `'true'` · `'false'` 를 받게 한다.
