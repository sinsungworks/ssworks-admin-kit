---
'@ssworks/admin-server': minor
---

**쓰는 쪽이 할 일:** `AdminAuthModule.withRepository` 로 리포지토리를 바꿨다면 `updateLoginState` 를 지우고 `lockCredential(trx, userNo, 'share' | 'update')`(받은 트랜잭션 위의 잠금 읽기 — 🔴 `'share'` 는 `LOCK IN SHARE MODE`, MariaDB 는 `FOR SHARE` 를 받지 않는다 · 잠그는 행은 `sessions.user_no` FK 가 가리키는 그 `users` 행) · `writeLoginState(trx, userNo, state)`(잠금 두 컬럼만)를 구현한다. 카운터의 원자성은 이제 패키지가 맡는다. 두 원시 모두 받은 `trx` 위에서만 쓰고, `lockCredential` 의 `passwordHash` 는 `findCredentialByUserId` 와 같은 값이어야 한다. `AdminReauthService`(공개 export)는 이제 `KYSELY` 도 주입받는다 — 손으로 만드는 코드는 Kysely 를 세 번째 인자로 넘긴다. 직접 만든 `ADMIN_ACCESS_POLICY` 는 이제 있는 계정의 로그인 시도마다 비밀번호 확인 앞에서 불린다(매 요청 · refresh 에서는 그대로 불린다). 로그인 화면은 IP 로 막힌 로그인에서 `IpBlockedDialog` 대신 로그인 실패 문구를 보인다.

admin-server 인증 경로(Phase 2 PR 2f-2a): 로그인은 IP(정책이 있을 때) → 비밀번호 → 확정 트랜잭션(잠근 사용자 행으로 잠김 · 퇴사 판정 → 카운터 되돌림 → 세션). 막힌 주소의 로그인은 403 `ERR_IP_NOT_ALLOWED` 대신 비밀번호를 보지 않고 401 `ERR_LOGIN_FAILED`(감사 행도 401 — 액션 `auth.login.blocked.ip` 그대로)이고, 막힌 주소의 틀린 비밀번호는 세지 않는다. 잠김 · 퇴사로 막힌 맞은 비밀번호는 카운터를 되돌리지 않는다. IP 정책이 있으면 로그인 401 문구가 모두 "… 허용되지 않은 접속 위치입니다." 다. 검증과 확정 사이에 초기화 · 즉시 퇴사가 커밋되면 세션을 남기지 않는다(401 · 403). 토큰 회전 · 유예 발급은 사용자 행을 공유 잠금으로 먼저 잡아 즉시 퇴사 · 비밀번호 초기화 · 본인 비밀번호 변경과 교착하지 않고, IP 를 퇴사보다 먼저 본다(퇴사했고 막힌 주소면 403 IP). 회전이 초기화 · 퇴사 · 로그아웃에 지면 401 문구가 "세션이 종료되었습니다" 다. IP 정책의 진단 경고 둘(주소 없음 · global 규칙 없음). 아직 `private` 이라 npm 에 나가지 않는다.
