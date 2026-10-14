---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 사용자 모듈을 쓰면 `AdminServerModule` 옵션의 `permissions` 에 슬롯 `'users.read'` · `'users.manage'` 를 잇고 `AdminUsersModule` 을 import 한다(`permissionCatalog` 필수, 선택 `timeZone` — 기본 `'Asia/Seoul'`). 🔴 장 `0002_users` 를 고쳤다(`users.updateAt` 의 `ON UPDATE CURRENT_TIMESTAMP` 를 뺐다) — 이미 장을 돌린 개발 DB 는 다시 만든다. `GET /roles` 는 이제 `users.read` 로도 읽힌다. admin-shared 역할 이름(`roleNameSchema`)이 앞뒤 공백을 뗀다.

admin-server 사용자 · 계정(Phase 2 PR 2d-2): `AdminUsersModule` — `/admin/users` 열 라우트(목록 — 팀 · 하위 팀 · 상태 · 검색어 · 대표 팀, 단건, 재직 이력, 만들기 — 서버 임시 비밀번호 `{ item, temporaryPassword }`, 수정 — revision, 퇴사 — 기준 시간대 다음 날 0시 효력 · 지난 날짜는 즉시 세션 폐기, 퇴사일 정정, 재입사, 비밀번호 초기화, 잠금 해제). 자기 계정 넷 403 · 권한 상승 403 · 전권자 잔존 409 · 활성 구간 ≤ 1. 입사 · 퇴사일은 TIMESTAMP 열이 담는 1970-01-02 ~ 2038-01-18 만 받는다(밖은 칸 오류 400 — `calendarDateSchema` 보다 좁다). 역할: 만들기 · 수정의 결과를 트랜잭션 안에서 읽고, 꺼진 기본 역할을 감사 meta `clearedDefaults` 로 남기고, 동시 만들기의 순서 값이 겹치지 않는다. 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: 사용자 계약 스키마(`adminUserSchema` · 만들기 · 수정 · 퇴사 · 퇴사일 · 재입사 본문 · 만들기 결과 · 재직 이력, `calendarDateSchema`), `queryBooleanSchema`(`'true'` · `'false'` 만), 코어 감사 액션에 사용자 일곱(`org.user.*`), `roleNameSchema` trim.
