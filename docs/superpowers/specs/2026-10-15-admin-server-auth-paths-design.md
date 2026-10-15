# admin-server 인증 경로 설계 (Phase 2 PR 2f-2a)

작성일: 2026-10-15 · 상태: 확정(구현 전) · 선행: 2b 스펙 `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` B7 · §4-3 · §5-1 · §5-3 · §14 R2 · R7 · R8, 2d 스펙 `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` §14 R10-3, 2d-3 스펙 `docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md` C5 · §12 (a2), 2f-1 스펙 `docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md` P2 · P11 · §9-2, `docs/HANDOFF.md` "PR 2d-2 최종 리뷰가 넘긴 것" · "PR 2f-1 최종 리뷰가 넘긴 것"

이 문서는 2f-2a 의 범위만 쓴다. 인증 판정 · 훅 자리는 2b 스펙, 사용자 쓰기의 잠금 순서는 2d · 2d-3 스펙, IP 평가는 2f-1 스펙이 그대로 유효하고, 이 문서가 바꾸는 줄은 §13 에 모았다.

## 1. 목표

admin-server 첫 발행 전에 인증 경로의 이월을 닫는다. 브랜치 `feat/admin-server-auth-paths`. 끝 상태, 실 MariaDB 로:

- **회전 교착 없음(2d R10-3)** — 회전 · 유예 발급이 users 행을 세션보다 먼저 잡는다. 즉시 퇴사 · 비밀번호 초기화 · 본인 비밀번호 변경과 겹쳐도 1213 이 없다.
- **로그인 TOCTOU 없음** — 비밀번호 검증과 세션 INSERT 사이에 커밋된 초기화 · 즉시 퇴사가 옛 비밀번호의 세션을 남기지 않는다.
- **막힌 주소의 로그인은 비밀번호를 보지 않는다** — 정답 오라클 · 카운터 되돌림 · 바깥의 잠금 DoS 가 사라진다.
- **`AdminAuthRepository` 확정** — 발행 전에 트랜잭션을 받는 잠금 원시 둘로 바꾼다.
- **정리** — IP 판정 블록 넷을 도우미 하나로, `clientIp` 인자 필수, IP 진단 경고 둘, `whileHeld` 단언 강제 · `failure()` 한 벌.

쓰는 쪽이 할 일: `AdminAuthModule.withRepository` 로 리포지토리를 바꾼 프로젝트만 메서드 둘을 고친다(§10).

PR 순서: 2f-1 → **2f-2a** → 2f-2b(첫 발행 준비 — DB TLS · socketPath · peer 하한 · `pagination.d.ts` TS2536 · IP 파서 조이기) → 확인용 앱 실서버 확인 → admin-server 첫 발행(결정 ⑥ V1).

## 2. 결정

### 2-1. 경계 결정 (2026-10-15, 브레인스토밍 — 모두 권장안)

| #            | 확정                                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 범위       | **N1** — 2f-2 를 둘로 나눈다. 2f-2a = 인증 경로 이월 + 테스트 정리(이 문서). 2f-2b = 첫 발행 준비. 인증 경로는 공개 인터페이스(`AdminAuthRepository`)를 바꾸므로 먼저, peer 하한은 발행 직전에 정한다                            |
| ② 로그인 IP  | **I1** — 비밀번호보다 먼저 IP 를 본다. 막히면 더미 argon2 → `login.blocked`(ip) → 401 `ERR_LOGIN_FAILED`. 카운터를 올리지도 되돌리지도 않는다. 2b R7(잠긴 동안 같은 401)과 같은 원칙 — 막힌 사용자의 혼란은 문구로 덜어 준다(A5) |
| ③ 리포지토리 | **P1** — `updateLoginState` 를 지우고 `lockCredential(trx, userNo, mode)` · `writeLoginState(trx, userNo, state)` 를 더한다. 트랜잭션과 카운터 원자성은 패키지가 맡는다                                                          |
| ④ 진단 경고  | **W1** — `IpAccessPolicy.allows()` 안의 경고 둘(null 클라이언트 IP · global 층 없음), 인스턴스당 한 번                                                                                                                           |
| ⑤ 설계 묶음  | 설계 ① 로그인 흐름, ② 회전 · 유예 · 잠금 순서, ③ 리포지토리 · 내부 도우미, ④ 테스트, ⑤ 응답 변화 · 문서 승인                                                                                                                     |

### 2-2. 공통 결정 (이의 없음)

1. **사용자 쓰기 쪽은 바꾸지 않는다.** 퇴사 · 초기화 · 본인 변경은 지금처럼 users X → 세션 X 다. 인증 경로가 그 순서에 맞춘다.
2. **argon2 는 트랜잭션 밖**(CLAUDE.md). 확정 · 회전 트랜잭션 안에는 잠금 읽기 · 판정 · 쓰기만 있다.
3. **이벤트는 커밋 뒤.** 트랜잭션은 판정 결과를 값으로 돌려주고, 이벤트 · 오류는 바깥에서 낸다 — 롤백된 일을 기록하지 않는다.
4. **공개 계약 유지**: `AdminAuthEvent` 모양, `AdminAccessPolicy` · `ADMIN_ACCESS_POLICY`, 가드 · refresh 의 403 봉투 · `details.clientIp`.
5. **범위 밖**: 2f-2b 몫(①), 로그인 시도 제한(IP 단위 throttling)과 계정 유무 타이밍 대칭화(2b 후속 — throttling 층과 함께), 가드 판정 순서(퇴사 → IP — 그대로).

### 2-3. 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | **로그인 순서** — 계정 읽기(비잠금) → IP(정책이 있을 때 · 비잠금) → 비밀번호(argon2) → 확정 트랜잭션(잠김 → 퇴사 → 카운터 되돌림 → 세션 INSERT). 없는 계정은 IP 를 보지 않는다 — 응답이 어차피 같은 401 이다(§5-1)                                                                                                                                                                                                                         |
| A2  | **확정 트랜잭션** — 첫 문장이 `lockCredential(trx, userNo, 'update')`. 해시가 비밀번호 검증 때와 다르거나 행이 없으면 `stale`. 잠김 · 퇴사 판정은 잠근 행으로 한다. 카운터가 `{0, null}` 이 아니면 `writeLoginState` 로 되돌리고, 세션은 같은 트랜잭션에 INSERT 한다. 🔴 첫 문장이 잠금 읽기라 스냅샷 격리 ON 에서도 읽기 뷰가 먼저 열리지 않는다(1020 없음)                                                                               |
| A3  | **`stale`** → `login.fail`(`loginFailCount` = 잠근 행의 값, 행이 없으면 `null`) → 401. **세지 않는다** — 검증 때는 맞은 비밀번호라 대입 시도가 아니다                                                                                                                                                                                                                                                                                      |
| A4  | **막힌 로그인** — 비밀번호 · 잠김 · 퇴사를 보지 않는다. 더미 argon2(`DUMMY_PASSWORD_HASH` — 없는 계정과 같은 비용) → `login.blocked`(ip) → 401. 대표 팀은 `findPrincipal`(2f-1 P4 와 같은 `MIN(teamNo)`)                                                                                                                                                                                                                                   |
| A5  | **로그인 401 문구** — `ADMIN_ACCESS_POLICY` 가 주입됐으면 로그인의 모든 401(없는 계정 · 틀림 · 잠김 · 막힘 · stale)이 `AUTH_MESSAGES.loginFailedWithIp` 다. 한 배포 안에서 실패 문구가 하나라 오라클이 없고, 정상 사용자는 "접속 위치일 수 있다" 를 안다. 정책이 없으면 지금 `loginFailed` 그대로                                                                                                                                          |
| A6  | **감사** — `login.blocked`(ip) 의 감사 행은 `statusCode` 401 · `errorCode` `ERR_LOGIN_FAILED`(액션 `auth.login.blocked.ip` 는 그대로). 2b R7 의 잠김과 같다 — 감사는 응답과 같은 코드를 남기고 사유는 액션이 말한다. 가드 · refresh 의 `access.blocked` 는 403 `ERR_IP_NOT_ALLOWED` 그대로                                                                                                                                                 |
| A7  | **회전** — IP(비잠금) → 회전 트랜잭션: 첫 문장 `lockCredential(trx, userNo, 'share')` → 없음 401 `sessionInvalid` · 퇴사 403 → `sessions.rotate(trx, …)`. `null`(진 쪽)의 재조회는 트랜잭션 밖(2b §14 R2 그대로). 재조회 행이 `'rotated'` 면 재사용 판정, 그 밖이면(초기화 · 퇴사 · 로그아웃 · 세션 끊기가 먼저 끊음) 401 `refreshEnded`                                                                                                   |
| A8  | **유예 발급**(`reuseOfRotated` 의 grace) — A7 과 같은 IP → 트랜잭션(`lockCredential('share')` → 퇴사 → `sessions.create(…, trx)`)                                                                                                                                                                                                                                                                                                          |
| A9  | **S 잠금은 `LOCK IN SHARE MODE`** — 🔴 MariaDB 11.4 는 `FOR SHARE` 를 1064 로 거부한다(2026-10-15 실측). `KyselyAuthRepository` 는 Kysely `.forShare()` 대신 ``.modifyEnd(sql`lock in share mode`)`` 를 쓴다. 단위 테스트가 컴파일 SQL 의 끝을 단언한다. X 가 아니라 S 인 이유: 같은 사용자의 두 탭이 서로 다른 세션을 회전해도 줄을 서지 않는다(회전은 users 를 쓰지 않으니 승격이 없다)                                                  |
| A10 | **카운터 도우미** — 내부 `updateLoginState(db, repo, userNo, next)`(`auth/password-check.ts`): 트랜잭션 → `lockCredential('update')` → 행 없으면 `next({0, null})` 를 쓰지 않고 돌려줌 → `next(current)` → 바뀌었을 때만 `writeLoginState`. 2b R8 의 원자성 · "안 바뀌면 쓰지 않음" 을 그대로 옮긴다. `checkPasswordWithCounter` 는 `db` 인자를 받는다. 🔴 `writeLoginState` 는 같은 트랜잭션의 `lockCredential('update')` 뒤에서만 부른다 |
| A11 | **재인증 · 본인 비밀번호 변경** — 진입 판정(비잠금 잠김 423)과 기대 해시 CAS 는 그대로. 재인증은 `KYSELY` 를 주입받아 `needsReset` 이면 A10 도우미로 되돌린다                                                                                                                                                                                                                                                                              |
| A12 | **세션 저장소**(내부 — index 밖) — `create(input, trx?)` · `rotate(trx, old, next)`. `rotate` 는 스스로 트랜잭션을 열지 않는다. 한 트랜잭션 안의 순서(옛 행 조건부 폐기 → INSERT → 링크)는 그대로                                                                                                                                                                                                                                          |
| A13 | **IP 판정 도우미** — `AdminAuthService` 의 `ipVerdict(userNo, req, teamNo?)` → `{ allowed: true } \| { allowed: false; clientIp }`. 판정만 하고 이벤트 · 오류는 부른 쪽이 낸다(로그인 → `login.blocked` + 401, 가드 · refresh · 유예 → `access.blocked` + 403). `teamNo` 를 주면(가드 — 이미 읽은 주체) `findPrincipal` 을 건너뛴다. 정책이 없으면 늘 허용. `assertActive` · `assertAllowedForRefresh` 는 지운다                           |
| A14 | **`clientIp` 필수** — `resolveAuthConfig(…, clientIp)` · `resolveAuditConfig(…, clientIp)` 의 인자를 선택 → 필수로(내부 함수 — 부르는 곳이 이미 넘긴다)                                                                                                                                                                                                                                                                                    |
| A15 | **진단 경고(W1)** — `IpAccessPolicy` 인스턴스 필드 둘로 한 번씩. ① `context.clientIp === null`: `클라이언트 IP 를 읽지 못해 막았다 — 코어 옵션 clientIp 와 Express trust proxy 를 확인한다.` ② 읽은 규칙에 `scopeType === 'global'` 행이 없음: `global 층 IP 규칙이 없다 — 사용자 · 팀 규칙이 없는 계정은 어디서도 들어오지 못한다(README "잠겼을 때").` 추가 쿼리 없음. 값(주소)을 싣지 않는다                                            |
| A16 | **`whileHeld`** — 옵션이 필수가 되고 `expectWait: boolean` 을 받는다. `reached !== expectWait` 면 정리(롤백 · 연결 종료)를 마친 뒤 던진다 — 26 곳이 의도를 적고, 새 호출이 단언을 빠뜨릴 수 없다. `afterReached?: (connection) => Promise<unknown>` 을 더한다 — 대기에 닿은 뒤 · 커밋 전에 쥔 쪽이 다음 문장을 보낸다(§9-2 R1 ~ R3). 이미 `reached` 를 단언하는 네 곳의 단언은 지운다                                                      |
| A17 | **`failure()`** — 여섯 벌(`super-admin.ip` · `ip-access.service` · `ip-access.survival` · `teams.delete` · `teams.move` · `teams.service` db 테스트)을 `test-support/errors.ts` 하나로                                                                                                                                                                                                                                                     |

## 3. 정본

새 정본은 없다 — 2b 가 이식한 흐름을 고친다. 바뀌는 두 곳의 근거:

- 로그인 순서 — hangang `auth.service.ts` 는 비밀번호 → 퇴사 → IP(403), 2b 는 비밀번호 → 잠김 → 퇴사 → IP(403)였다. 2f-1 최종 리뷰가 막힌 주소의 오라클 · 카운터 되돌림을 넘겼고, 이 문서가 IP 를 비밀번호 앞으로 옮긴다(② I1). hangang 은 IP 모듈이 늘 켜진 단일 프로젝트라 403 문구를 택했다.
- 회전 — gise · hangang 은 회전을 트랜잭션 하나로 묶지 않았다(2b B3). 2b 가 묶었고, 이 문서가 그 트랜잭션의 첫 문장을 users S 로 바꾼다.

## 4. 공개 API

```ts
// auth/auth.repository.ts — 다섯 → 여섯
export interface AdminAuthRepository {
  findCredentialByUserId(userId: string): Promise<AdminCredential | null> // 그대로
  findCredentialByNo(userNo: bigint): Promise<AdminCredential | null> // 그대로
  findPrincipal(userNo: bigint): Promise<AdminPrincipalRecord | null> // 그대로
  /**
   * 🔴 받은 트랜잭션 위의 잠금 읽기 — 'update' = FOR UPDATE, 'share' = LOCK IN SHARE MODE(MariaDB 는 FOR SHARE 를 받지
   * 않는다). sessions FK(fkSessionsUser)가 가리키는 그 users 행을 잠근다 — 다른 행을 잠그면 회전과의 순서가 깨진다. 없으면 null
   */
  lockCredential(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    mode: 'share' | 'update',
  ): Promise<AdminCredential | null>
  /** 잠금 두 컬럼만 쓴다. 호출부가 같은 트랜잭션에서 lockCredential('update') 로 잠갔다 */
  writeLoginState(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    state: AdminLoginState,
  ): Promise<void>
  changePassword(/* 그대로 */): Promise<number>
  // updateLoginState — 지운다(원자성은 패키지 도우미가 맡는다, A10)
}
```

그 밖의 공개 export 는 바뀌지 않는다. `AUTH_MESSAGES`(`loginFailedWithIp` 를 더한다) · `AdminSessionStore` · 설정 해석 함수는 index 밖이다.

## 5. 흐름

### 5-1. 로그인 (`AdminAuthService.login`)

```
cred = repo.findCredentialByUserId(userId)                          (비잠금)
├ null ─────────── verifyPassword(DUMMY) · login.fail(userNo null) → 401
├ 정책 있음 → ipVerdict(cred.userNo, req)                           (비잠금 — findPrincipal 의 대표 팀)
│   └ 막힘 ──── verifyPassword(DUMMY) · login.blocked(ip) → 401     (카운터 그대로 — A4)
├ verifyPassword(cred.passwordHash, password)                        (트랜잭션 밖)
│   └ 틀림 ──── updateLoginState(next FAIL — A10) · login.fail → 401
└ 확정 트랜잭션
     locked = repo.lockCredential(trx, userNo, 'update')             🔴 첫 문장
     locked == null 또는 locked.passwordHash !== cred.passwordHash ── 'stale'
     isLocked(locked.lockUntil, now) ─────────────────────────────── 'locked'
     isResigned(locked.resignAt, now) ────────────────────────────── 'resigned'
     needsReset(locked) → repo.writeLoginState(trx, userNo, {0, null})
     sessionNo = sessions.create({ …, loginAt: now }, trx) ────────── 'ok'
   커밋 뒤
     stale → login.fail → 401 (세지 않음)        locked → login.blocked(locked) → 401
     resigned → login.blocked(resigned) → 403     ok → login.success → 토큰
```

401 문구는 A5. 판정이 `ok` 가 아닌 갈래는 쓰지 않았으니 커밋해도 빈 트랜잭션이다.

경합: 초기화 · 즉시 퇴사가 검증과 확정 사이에 커밋되면 확정의 잠금 읽기가 새 해시 · 새 `resignAt` 을 본다(stale 401 · 퇴사 403 — 세션 없음). 확정이 먼저 잠그면 저쪽(users X → 세션)이 그 커밋을 기다렸다가 새 세션까지 끊는다(`liveOnly` — 새 세션은 살아 있다).

### 5-2. 회전 · 유예 발급 (`refresh` · `reuseOfRotated`)

```
row = sessions.findByRefreshHash(hash)                              (비잠금 — 그대로)
├ 없음 401 · 폐기(rotated → 재사용 판정 / 그 밖 401 refreshEnded) · 만료 401 — 그대로
├ ipVerdict(row.userNo, req)  막힘 ── access.blocked(ip) → 403      (A13 — 퇴사보다 먼저)
└ 회전 트랜잭션
     cred = repo.lockCredential(trx, row.userNo, 'share')            🔴 첫 문장 · LOCK IN SHARE MODE
     cred == null ── 'gone' → 401 sessionInvalid
     isResigned ──── 'resigned' → 403
     sessionNo = sessions.rotate(trx, old, next)   null ── 'raced'
   커밋 뒤
     ok → token.refresh → 토큰
     raced → sessions.findByNo(row.sessionNo)                        (트랜잭션 밖 — 2b §14 R2)
             revokedReason === 'rotated' → reuseOfRotated(재조회 행)
             그 밖 → 401 refreshEnded

reuseOfRotated 의 grace 갈래: ipVerdict → 트랜잭션(lockCredential('share') → 퇴사 → sessions.create(…, trx)) → token.refresh(grace)
reuse 갈래(전량 폐기) — 그대로
```

### 5-3. 잠금 순서 — 모든 경로가 users 를 세션보다 먼저 잡는다

| 경로                                    | 순서                                                    |
| --------------------------------------- | ------------------------------------------------------- |
| 로그인 확정                             | users X → 세션 INSERT(FK 검사 S — 이미 X)               |
| 회전                                    | users **S** → 옛 세션 X → 새 세션 INSERT → 옛 세션 링크 |
| 유예 발급                               | users **S** → 세션 INSERT                               |
| 본인 비밀번호 변경                      | users X(기대 해시 UPDATE) → 다른 세션 X — 그대로        |
| 초기화 · 즉시 퇴사                      | (잔존 가드 →) users X → … → 세션 X — 그대로             |
| 실패 카운터 · 재인증 되돌림             | users X 만                                              |
| 로그아웃 · 세션 끊기 · 재사용 전량 폐기 | 세션만(한 문장) — 그대로                                |

2d R10-3 의 교착(회전이 옛 세션 X 를 쥐고 FK 검사로 users S 를 기다림 ↔ 퇴사 · 초기화 · 본인 변경이 users X 를 쥐고 세션 X 를 기다림)이 사라진다. 회전이 users 를 먼저 기다리므로 저쪽이 커밋하면 회전은 퇴사 403 또는 0행(raced → 401 `refreshEnded`)으로 끝나고, 회전이 먼저 잡았다면 저쪽이 회전 커밋을 기다렸다가 새 세션까지 끊는다. 같은 세션의 두 회전(P1)은 둘 다 S 를 쥔 채 옛 세션 행 X 에서 갈린다 — 회전은 users 를 쓰지 않아 S → X 승격이 없다.

남는 것: 재사용 전량 폐기(세션만, `userNo` 색인 범위 잠금) ∥ 같은 사용자의 회전(옛 세션 X → INSERT 의 삽입 의도 잠금)은 드물게 1213 일 수 있다 — 전부터 있었고 재사용 탐지는 공격 상황이라 받아들인다(§12 (d) 에서 한 번 잰다).

### 5-4. IP 판정 도우미와 진단 경고

```ts
private async ipVerdict(userNo: bigint, req: Request, teamNo?: bigint | null):
  Promise<{ allowed: true } | { allowed: false; clientIp: string | null }>
// 정책 없음 → 허용. teamNo 가 undefined 면 findPrincipal(userNo)?.teamNo ?? null.
// clientIp = requestMetaOf(req, config.clientIp).clientIp
```

부르는 자리 넷: 로그인(A4) · 가드 `authenticate`(이미 읽은 `record.teamNo` — 순서는 퇴사 → IP 그대로) · refresh · 유예 발급. 진단 경고는 `IpAccessPolicy.allows()` 가 이미 읽은 규칙 · 받은 `clientIp` 로 낸다(A15).

## 6. 응답 변화

| #   | 변화                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 막힌 주소의 로그인: 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp` → **401 `ERR_LOGIN_FAILED`**(details 없음). 감사 행은 액션 그대로 · 401 · `ERR_LOGIN_FAILED`(A6) |
| 2   | 막힌 주소의 틀린 비밀번호는 세지 않는다 — 잠기지 않는다                                                                                                            |
| 3   | 잠김 · 퇴사로 막힌 맞은 비밀번호는 카운터를 되돌리지 않는다(되돌림은 성공 직전에만)                                                                                |
| 4   | IP 정책이 있으면 로그인 401 문구가 모두 `loginFailedWithIp`                                                                                                        |
| 5   | refresh · 유예 발급은 IP 를 퇴사보다 먼저 본다 — 퇴사했고 막힌 주소이기도 하면 403 `ERR_IP_NOT_ALLOWED`(전에는 403 `ERR_RESIGNED_USER`)                            |
| 6   | 회전이 초기화 · 퇴사 · 로그아웃 · 세션 끊기에 지면 401 `ERR_INVALID_TOKEN` 문구가 `refreshRaced` → `refreshEnded`                                                  |
| 7   | 검증과 확정 사이에 비밀번호가 바뀐 로그인은 401(stale — 전에는 옛 비밀번호로 세션이 생겼다), 퇴사가 끼면 403(전에는 세션이 생겼다)                                 |
| 8   | `AdminAuthRepository` — `updateLoginState` 를 지우고 `lockCredential` · `writeLoginState` 를 더했다                                                                |
| 9   | IP 진단 경고 둘(인스턴스당 한 번)                                                                                                                                  |

## 7. 의존성

새 의존성 없다. admin-shared · admin-ui 는 바뀌지 않는다.

## 8. 파일

```
packages/admin-server/src/
  auth/auth.repository.ts · kysely-auth.repository.ts                 §4 · A9
    (테스트) kysely-auth.repository.db.test.ts · kysely-auth.repository.test.ts(새 — 컴파일 SQL)
  auth/password-check.ts                                              A10 — updateLoginState 도우미 · db 인자
  auth/auth.service.ts                                                A1 ~ A8 · A13
    (테스트) auth.service.login.db.test.ts · auth.service.refresh.db.test.ts · auth.service.password.db.test.ts ·
             auth.http.db.test.ts · auth.race.db.test.ts(새 — §9-2 R1 ~ R4 · L1 · L2)
  auth/reauth.service.ts                                              A11 — KYSELY 주입
  auth/session.store.ts · session.store.db.test.ts                    A12
  auth/errors.ts                                                      loginFailedWithIp
  auth/options.ts · audit/options.ts (+ 부르는 곳)                   A14
  audit/auth-events.ts · auth-events.test.ts                          A6
  ip-access/ip-access.policy.ts · ip-access.policy.test.ts(새)        A15
  ip-access/ip-access.auth.db.test.ts                                 막힌 로그인 401 · refresh 순서
  test-support/concurrency.ts · concurrency.db.test.ts · errors.ts(새)  A16 · A17
  (whileHeld 를 부르는 db 테스트 열한 파일 · failure() 여섯 파일)
  decorator-metadata.test.ts                                          AdminReauthService 생성자
packages/admin-server/README.md                                       §10
.changeset/admin-server-auth-paths.md                                 admin-server minor
docs/superpowers/specs/(2b · 2d · 2d-3 · 2f-1 스펙)                   §13
docs/01-phase0.md · docs/HANDOFF.md · CLAUDE.md
```

플랜은 `docs/superpowers/plans/2026-10-15-admin-server-auth-paths.md`.

## 9. 테스트 계약

TDD — 실패하는 테스트부터. 구현자는 테스트를 먼저 만들고 구현 전에 돌려 RED 를 보고서에 붙인다. 🔴 잠금 · 순서 테스트는 구현 뒤 해당 줄을 일부러 되돌려 RED 를 한 번 더 본다(예: 회전 트랜잭션의 `lockCredential('share')` 를 지우면 R1 이 1213). 경합 테스트는 공개 서비스 메서드를 거친다.

### 9-1. 단위 (`pnpm check`)

- **리포지토리 컴파일 SQL**: `lockCredential(…, 'share')` 가 `lock in share mode` 로 끝나고 `for share` 가 없다, `'update'` 는 `for update`. `writeLoginState` 는 두 컬럼만 쓴다.
- **로그인 판정(가짜 리포지토리 · 정책)**: 없는 계정은 정책을 부르지 않는다. 막히면 `verifyPassword` 가 더미 해시로 한 번 · `updateLoginState` · `lockCredential` 을 부르지 않는다. 정책이 있으면 401 문구가 모두 `loginFailedWithIp`, 없으면 `loginFailed`.
- **감사**: `login.blocked`(ip) → 401 · `ERR_LOGIN_FAILED`, `access.blocked` 는 403 · `ERR_IP_NOT_ALLOWED` 그대로.
- **진단 경고**: null `clientIp` 두 번 → `warn` 한 번, global 없는 규칙 두 번 → `warn` 한 번, global 이 있고 주소가 있으면 0 번. 문구에 주소가 없다.
- **설정 해석**: 인자가 필수가 된 뒤 부르는 곳(모듈 팩토리 · 기존 단위 테스트)이 모두 `clientIp` 를 넘긴다 — typecheck 가 잰다.
- **decorator-metadata**: `AdminReauthService` 의 새 생성자.

### 9-2. 실 MariaDB (`pnpm test:db`)

- **리포지토리**: `lockCredential` 두 모드가 실제로 잠근다 — 원시 연결이 `'update'` 로 쥔 동안 다른 `'update'` · `'share'` 가 기다린다(`whileHeld` `expectWait: true`), `'share'` 로 쥔 동안 다른 `'share'` 는 기다리지 않는다(`expectWait: false`). `writeLoginState` 가 두 컬럼만 바꾼다. 도우미 `updateLoginState` — 병렬 틀린 비밀번호 다섯이 정확히 5 를 센다(2b R8 그대로), 바뀌지 않으면 쓰지 않는다(`updateAt` 그대로 — 장 0002).
- **경합(`auth.race.db.test.ts`)** — 원시 연결이 사용자 쓰기를 흉내 낸다:

| #   | 장면                                                                                                        | 기대                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| R1  | 즉시 퇴사 흉내(users FOR UPDATE + `resign_at` 과거) ∥ refresh → `afterReached` 로 그 사용자 세션 폐기       | 교착 없음 · refresh 403 퇴사 · 새 세션 행 없음 — 스냅샷 격리 OFF · ON |
| R2  | 초기화 흉내(users FOR UPDATE + 새 해시) ∥ refresh → `afterReached` 세션 폐기                                | 교착 없음 · 401 `refreshEnded`                                        |
| R3  | 본인 비밀번호 변경 흉내(기대 해시 UPDATE) ∥ 같은 사용자의 다른 세션 refresh → `afterReached` 다른 세션 폐기 | 교착 없음 · 401 `refreshEnded`                                        |
| R4  | 같은 사용자 두 세션의 refresh 를 동시에                                                                     | 둘 다 성공                                                            |
| L1  | 초기화 흉내가 users 를 쥔 채 로그인(옛 비밀번호) — 검증을 지나 확정에서 기다림 → 커밋                       | 401 · 세션 없음 · 카운터 그대로 — OFF · ON                            |
| L2  | 즉시 퇴사 흉내로 같은 장면                                                                                  | 403 · 세션 없음 — OFF · ON                                            |

RED: R1 ~ R3 은 회전 트랜잭션의 `lockCredential('share')` 를 빼면 1213(→ 409), L1 · L2 는 확정 트랜잭션 대신 예전 순서(검증 전 스냅숏으로 판정 → 별도 INSERT)면 세션이 생긴다.

- **IP 먼저 로그인(`ip-access.auth.db.test.ts` · `auth.service.login.db.test.ts`)**: 막힌 주소 + 맞은 비밀번호 → 401 · `login.blocked`(ip) · 감사 행 401 · 카운터 그대로(3 이면 3). 막힌 주소 + 틀린 비밀번호 다섯 → `lockUntil` NULL · 카운터 그대로. 막힌 주소 + 잠김 · 퇴사 → 401. 허용 주소 + 퇴사 + 맞은 비밀번호 → 403 · 카운터 되돌리지 않음. 허용 주소 정상 로그인 · 감사 행 그대로.
- **refresh 순서**: 퇴사 + 막힌 주소 → 403 IP · `access.blocked`. 정책이 거부하면 회전 전에 403 · 행 그대로(2f-1 그대로). 유예 발급도 같다.
- **HTTP(`auth.http.db.test.ts`)**: 막힌 로그인 401 봉투(`details` 없음 · 문구 `loginFailedWithIp`) · 쿠키 없음.
- **기존 기대값**: 로그인 403 IP · `refreshRaced`(초기화 · 퇴사 경합) · refresh 퇴사 → IP 순서를 기대하는 곳을 고친다.

### 9-3. 테스트 도우미

- `concurrency.db.test.ts`: `expectWait` 가 맞으면 결과를 돌려주고, 틀리면 던지되 쥔 연결 · 관찰 연결이 닫힌다(뒤의 DROP DATABASE 가 막히지 않는다). `afterReached` 가 대기에 닿은 뒤 · 커밋 전에 돈다(그 문장이 쓴 값을 기다린 쪽이 본다).
- 열한 파일의 `whileHeld` 26 곳이 `expectWait` 를 적는다. 바뀐 뒤 `pnpm test:db` 전량 초록.

### 9-4. 리뷰 초점 (플랜 · 리뷰어에게 넘긴다)

1. 로그인 확정 · 회전 · 유예 트랜잭션의 첫 문장이 `lockCredential` 인가 — 세션 행을 users 보다 먼저 잡는 경로가 없는가.
2. argon2(`verifyPassword` · `hashPassword`)가 어떤 트랜잭션 안에도 없는가.
3. 이벤트가 트랜잭션 콜백 안에서 나가지 않는가.
4. 막힌 로그인이 비밀번호 · 카운터 · 잠김 · 퇴사를 건드리지 않는가, 정책이 있을 때 로그인 401 문구가 하나인가.
5. `'share'` 가 `lock in share mode` 인가(`forShare()` 아님).
6. `writeLoginState` 가 같은 트랜잭션의 `lockCredential('update')` 없이 불리는 곳이 없는가.
7. 가드 · refresh 의 403 봉투 · `details.clientIp` 가 그대로인가.

## 10. 릴리스 · 문서

- **changeset** `.changeset/admin-server-auth-paths.md` — admin-server **minor**(아직 private — 기록용). 첫 줄은 쓰는 쪽이 할 일: "`AdminAuthModule.withRepository` 로 리포지토리를 바꿨다면 `updateLoginState` 를 지우고 `lockCredential(trx, userNo, 'share' | 'update')`(🔴 `'share'` 는 `LOCK IN SHARE MODE` — MariaDB 는 `FOR SHARE` 를 받지 않는다) · `writeLoginState(trx, userNo, state)` 를 구현한다." 이어서 §6 의 1 ~ 7.
- **admin-server README**: "인증" 절의 순서 문장(IP(정책이 있을 때) → 비밀번호 → 잠김 → 퇴사, 막힌 로그인은 401 · 문구), "사용자 테이블이 다를 때"(여섯 메서드 · 잠그는 행 🔴 · `LOCK IN SHARE MODE`), "IP 접근 제어"(막힌 로그인 401 · refresh 는 IP 먼저 · 진단 경고 둘), "동시 쓰기 재시도"(회전 ∥ 퇴사 · 초기화 · 본인 변경의 교착이 사라짐 — 재사용 ∥ 회전만 남음).
- **`docs/01-phase0.md`** §8 admin-server 행. **HANDOFF** — "PR 2d-2 최종 리뷰가 넘긴 것" 의 rotate · TOCTOU, "PR 2f-1 최종 리뷰가 넘긴 것" 의 `whileHeld` · 판정 블록 · `clientIp` · 진단 경고 · 로그인 IP 순서 · `failure()` 를 닫고, 다음 플랜을 2f-2b 로. **CLAUDE.md** — 진행 표(2f-2 → 2f-2a 완료 · 2f-2b 다음), admin-server 규약에 한 줄: "인증 경로는 users 를 세션보다 먼저 잡는다 — 로그인 확정은 `lockCredential('update')`, 회전 · 유예는 `lockCredential('share')`(`LOCK IN SHARE MODE` — MariaDB 는 `FOR SHARE` 1064)가 트랜잭션 첫 문장. IP 로 막힌 로그인은 비밀번호를 보지 않고 같은 401."
- **쓰는 쪽 스모크**(`%TEMP%\akss`, 새 DB): tarball → 스텁 12장 → 시드 → 기동 → 로그인 · 회전 · 로그아웃 → user 규칙으로 자기 주소를 막는 다른 계정 → 그 계정 로그인 401(문구) · 감사 행 401 → 초기화 뒤 옛 refresh 401.

## 11. 비범위 · 보류

- 2f-2b 몫(① N1).
- 로그인 시도 제한(IP 단위) · 계정 유무 타이밍 대칭화 — 2b 후속 그대로(throttling 층과 함께).
- 재사용 전량 폐기 ∥ 회전의 드문 1213(§5-3) — 측정만 하고 받아들인다.
- 본인 비밀번호 변경 · 재인증의 진입 잠김 판정(비잠금 423) — 로그인된 본인이라 오라클 문제가 없고, 카운터 쓰기는 원자적이다.
- 가드의 판정 순서(퇴사 → IP) — 트랜잭션이 없어 바꿀 이유가 없다.

## 12. 플랜에서 먼저 확인할 위험

플랜을 쓰기 전에 패키지 DB 하네스의 임시 프로브(`src/zz-probe-*.db.test.ts` — 다 재면 지운다)와 실 MariaDB 11.4 로 재고 결과를 §14 R1 에 적는다.

1. **(a) R10-3 재현.** 지금 코드에 `afterReached` 모양(원시 연결: users FOR UPDATE → refresh 가 옛 세션 X 를 쥐고 FK 에서 기다림 → 원시 연결이 세션 폐기)이 실제로 1213 인가, 희생자가 어느 쪽인가 — R1 ~ R3 의 RED 가 성립하는지. 새 순서(users S 첫 문장)에서는 refresh 가 users 에서 기다리고 교착이 없는가.
2. **(b) S 잠금.** `LOCK IN SHARE MODE` 를 쥔 회전의 옛 세션 UPDATE · 새 세션 INSERT(FK 검사 S)가 추가 대기 없이 지나는가. 같은 사용자 두 회전이 서로 막지 않는가.
3. **(c) 스냅샷 격리 ON.** 확정 트랜잭션(FOR UPDATE → 조건부 UPDATE → INSERT) · 회전 트랜잭션(LOCK IN SHARE MODE → UPDATE → INSERT → UPDATE)에 1020 이 없는가 — 원시 연결이 그 사용자 행을 바꾸고 커밋한 뒤 시작해도.
4. **(d) 재사용 전량 폐기 ∥ 회전** — 결과를 잰다(1213 의 빈도 · 희생자). 영구 테스트는 만들지 않는다.
5. **(e) Kysely 0.29** — ``.modifyEnd(sql`lock in share mode`)`` 가 `where` 뒤에 붙는가(컴파일 SQL), `Transaction` 위에서도 같은가.
6. **(f) 기존 기대값의 수** — 로그인 403 IP · refresh 퇴사 → IP 순서 · `refreshRaced` 를 기대하는 테스트, `whileHeld` 26 곳의 기대(`reached` true / false)를 센다.

## 13. 선행 문서 정정

- **2b 스펙** — §14 에 한 줄: §5-1 로그인 순서가 IP(정책이 있을 때) → 비밀번호 → 확정 트랜잭션(잠김 → 퇴사 → 되돌림 → 세션)으로, 막힌 로그인은 401(② I1 · A5 · A6), §4-3 리포지토리 · R8 의 `updateLoginState` 가 `lockCredential` · `writeLoginState` 로(원자성은 패키지 도우미 — A10), §5-3 회전이 users S 첫 문장 · IP → 퇴사 순서(A7 · A8).
- **2d 스펙** — §14 에 한 줄: R10-3(즉시 퇴사 · 초기화 ∥ 회전의 교착)이 2f-2a 에서 닫혔다(§5-3).
- **2d-3 스펙** — §14 에 한 줄: C5 의 근거 중 회전 교착이 사라졌다 — 세션 폐기를 쓰기 단계에 두는 배치는 그대로(ON 의 대상 로그아웃 1020 → 409 는 남는다).
- **2f-1 스펙** — §14 에 한 줄: P11 의 순서(퇴사 → IP)가 IP → 퇴사로(A7), §9-2 "로그인 403(비밀번호 맞은 뒤)" 이 401(비밀번호 전 — ② I1), P2 에 진단 경고(A15).
- **`docs/01-phase0.md`** · **CLAUDE.md** · **HANDOFF** — §10 대로.

## 14. 구현 중 정정

§12 의 확인 결과와 구현 · 리뷰에서 바뀐 것을 `R<n>` 으로 더한다.
