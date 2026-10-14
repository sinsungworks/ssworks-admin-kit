---
'@ssworks/admin-server': minor
---

**쓰는 쪽이 할 일:** 없음(새 DB). 장 `0001_roles` 를 이미 돌린 개발 DB 는 역할 인덱스 둘이 없어도 2d-2 와 같이 돈다 — 맞추려면 `CREATE INDEX idx_roles_display_order ON roles (display_order)` · `CREATE INDEX idx_roles_is_default ON roles (is_default)`. 본인 재입사 `POST /users/:userNo/rehire` 는 이제 403 `ERR_COMMON_FORBIDDEN` 이다.

admin-server 계정 정리(Phase 2 PR 2d-3): 전권자 잔존 쓰기(역할 권한 수정 · 삭제 · 사용자 역할 변경 · 퇴사)가 대상 · 줄 역할 · 팀 · 다른 기본 역할을 잠근 뒤에 전권자 수를 센다 — 감사 before · 응답 item 이 낡지 않고, MariaDB 11.6.2+ 의 스냅샷 격리에서 대상 로그인 · 팀 이름 바꾸기 · 역할 이동과 겹쳐도 409 가 나지 않는다. 역할 표에 순서 · 기본 표시 인덱스를 더해 역할 만들기 · 이동 · 기본 켜기가 그 행만 잠근다. 퇴사 예정인 본인의 자기 재입사를 403 으로 막는다. `timeZone` 옵션은 정규 이름으로 바꿔 쓴다(`'asia/seoul'` → `'Asia/Seoul'`). 초기화 · 즉시 퇴사의 끊은 세션 수는 살아 있던 세션만 센다. 아직 `private` 이라 npm 에 나가지 않는다.
