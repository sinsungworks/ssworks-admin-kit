---
'@ssworks/admin-ui': patch
---

`createApiClient` 의 쿼리 직렬화가 boolean 을 `'1'` · `''` 대신 `'true'` · `'false'` 로 보낸다 — admin-shared `queryBooleanSchema`(admin-server 목록 필터)가 받는 모양이다. 전에는 `TeamUserList` 의 "하위 팀 포함" 같은 boolean 필터가 admin-server 에서 400 이었다.

쓰는 쪽이 할 일: 없음. 자체 서버가 `'1'` · `''` 를 기대했다면 그 서버가 `'true'` · `'false'` 도 받게 한다.
