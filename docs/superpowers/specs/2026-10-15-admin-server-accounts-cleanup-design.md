# admin-server 계정 정리 설계 (Phase 2 PR 2d-3)

작성일: 2026-10-15 · 상태: 확정(구현 전) · 선행: 2d 스펙 `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` §5-3(잔존) · §5-4 · §5-6 · B7 · B16 · ③ SF1 · ⑤ TZ1 · §14 R5-6 · R7 · R9-2 · R9-3 · R10-2 · R10-3, 2e 스펙 `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md` §2-1 이월 표 · §5-1(전역 잠금 순서) · §14 R1 · R3, 2c 스펙 B9(`liveOnly`), `docs/HANDOFF.md` "PR 2d-2 최종 리뷰가 넘긴 것" · "PR 2e-1 최종 리뷰가 넘긴 것"

이 문서는 2d-3 의 범위만 쓴다. 계정 판정 · 잔존 · 사용자 쓰기는 2d 스펙, 팀 · 전역 잠금 순서는 2e 스펙이 그대로 유효하고, 이 문서가 바꾸는 줄은 §13 에 모았다. 새 라우트 · 새 모듈 · 새 장이 없는 정리 PR 이다.

## 1. 목표

2e 스펙 §2-1 이월 표의 2d-3 몫(1 · 2 · 5 · 7 · 8 나머지 · 9)과 2e-1 최종 리뷰가 더한 한 건을 닫는다. 브랜치 `feat/admin-server-accounts-cleanup`. 끝 상태, 실 MariaDB 로:

- **잔존 순서 재배치(이월 1 + 2e-1).** 잔존으로 감싼 쓰기 넷(역할 권한 수정 · 역할 삭제 · 사용자 역할 변경 · 퇴사)이 "센티넬 → 잠금 단계 → 셈 → 쓰기 단계 → 후 셈" 으로 돈다. 스냅샷 격리 OFF 의 낡은 감사 before · item(2d R9-2 · R10-2)과 ON 의 1020 → 409(대상 로그인 실패 — R7-1, 같은 팀 이름 바꾸기 · 이동 — 2e-1 `lockTeam`)가 사라진다.
- **역할 전수 스캔 잠금(이월 2).** 역할 만들기의 순서 셈 · 다른 기본 역할 찾기 · 이동의 구간 UPDATE 가 역할 표 전 행 대신 인덱스 구간만 잠근다(2d R9-3).
- **`timeZone` 정규화(이월 5).** 기동이 정규 이름으로 바꿔 두고, 셈과 감사 meta 가 그 이름을 쓴다.
- **`revokedCount` 의 `liveOnly`(이월 7).** 초기화 · 즉시 퇴사가 만료된 미폐기 세션을 건드리지도 세지도 않는다.
- **테스트 빈틈(이월 8 나머지).** `lockGrantRole` 의 `forUpdate` 회귀 · correct · rehire 의 B7 · 치유 + 400 롤백 · `day()` 의 KST 자정.
- **본인 재입사 403(이월 9).** 퇴사 예정인 본인이 자기 재입사로 퇴사를 거두지 못한다.

쓰는 쪽이 할 일은 없다(새 DB). 이미 장 0001 을 돌린 개발 DB 는 역할 인덱스 둘이 없을 뿐 동작은 2d-2 와 같다(§10).

PR 순서: 2e-1 → **2d-3** → 2e-2 약관 → 2f.

## 2. 결정

### 2-1. 경계 결정 (2026-10-15, 결정 문서 HTML "PR 2d-3 경계 결정" — 모두 권장안)

| #                     | 확정                                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 잔존 API            | **A** — 잠금 단계 콜백. `withSuperAdminSurvival(trx, { lock, write })` 가 센티넬 → `lock()` → 셈 → `write(locked)` → 후 셈 → 판정을 쥔다. `lock()` 이 돌려준 값이 `write` 의 인자다                                                                                          |
| ② 잠금 단계에 넣는 것 | **R1** — 남이 대상 행 잠금 없이 바꿀 수 있는 결정 행: 대상 `users ⋈ roles` · 줄 역할 · 팀 · (역할 수정) 다른 기본 역할. 판정 · revision · 상태 검사도 잠금 단계(B7 순서). 그 사용자 행 아래에서만 바뀌는 행(그 사용자의 소속 · 재직 이력)과 세션 폐기는 쓰기 단계            |
| ③ 역할 전수 스캔      | **I1** — 인덱스 `idx_roles_display_order (displayOrder)` · `idx_roles_is_default (isDefault)` 를 **장 0001 정정**(미발행)으로 더한다. 만들기의 순서 셈은 `ORDER BY displayOrder DESC LIMIT 1 FOR UPDATE`. §12 (c) 가 받치지 않으면 K(그대로 + README)로 내리고 §14 에 적는다 |
| ④ 본인 재입사         | **S1** — `account-command.ts` 의 자기 계정 갈래(퇴사 · 퇴사일 · 초기화 · 잠금 해제)에 `user.rehire` 를 더한다. 문구 `selfAccount` 그대로. 2d B16 정정                                                                                                                        |
| ⑤ `timeZone`          | **N1** — `resolveTimeZone` 이 `resolvedOptions().timeZone`(정규 이름)을 돌려준다. `'asia/seoul'` → `'Asia/Seoul'`, `'US/Eastern'` → `'America/New_York'`, `'Etc/UTC'` → `'UTC'`(Node 24.21 · ICU 78.3 실측). 오프셋 · 약어 거부(IANA 모양 정규식)는 그대로                   |
| ⑥ `liveOnly`          | **L1** — 비밀번호 초기화 · 즉시 퇴사 둘 다 `revokeAllOfUser(…, { trx, liveOnly: true })`. 바뀌는 것은 감사 meta `revokedCount` 뿐이다                                                                                                                                        |
| ⑦ 테스트 빈틈         | **T1** — 넷 모두(§9-2). `day()` 는 같은 모양인 두 파일(`users.http.db.test.ts` · `users.employment.db.test.ts`) 모두 고친다                                                                                                                                                  |
| ⑧ 스펙 자리           | **P1** — 이 문서. 2d 스펙 §14 R11 · 2e 스펙 §14 R4 가 한 줄씩 이 문서를 가리킨다                                                                                                                                                                                             |

### 2-2. 공통 결정 (이의 없음)

1. **잠금 규칙은 그대로.** 센티넬이 트랜잭션 첫 문장 · 셈에 `FOR UPDATE` 금지 · 한 트랜잭션에 가드 행 하나 · 전역 잠금 순서(2e §5-1). 셈은 비잠금이라 옮겨도 잠금 순서가 바뀌지 않는다 — 바뀌는 것은 읽기 뷰가 열리는 자리뿐이다. 셈을 늘리기만 하는 쓰기(역할 · 사용자 만들기 · 재입사)는 센티넬을 잡지 않는다.
2. **새 라우트 · 모듈 · 장 · 오류 코드 · 문구가 없다.** admin-shared 는 바뀌지 않는다. `docs/01-phase0.md` §4 프로토콜도 바뀌지 않는다.
3. **HTTP 계약 변경은 하나** — `POST /users/:userNo/rehire` 를 본인에게 부르면 403 `ERR_COMMON_FORBIDDEN` `selfAccount`(전에는 200).
4. **범위 밖**: 2b `rotate` 잠금 순서 · 로그인 TOCTOU(이월 3 — 2f), 2e-1 이 넘긴 오류 코드 총수 테스트 · 테스트 강도 항목(HANDOFF 에 그대로).

### 2-3. 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **`LockedWrite<L, T> = { lock: () => Promise<L>; write: (locked: L) => Promise<T> }`**(`accounts/super-admin.ts`). `withSuperAdminSurvival<L, T>(trx, steps)` 하나만 바뀐다 — 옛 시그니처 `(trx, write)` 는 지운다(내부 함수 · 미발행). 잔존이 필요 없는 갈래(역할을 안 바꾸는 사용자 수정 · 권한을 안 바꾸는 역할 수정)는 같은 두 단계를 `steps.write(await steps.lock())` 로 부른다 — 갈래마다 같은 판정 · 잠금 순서가 된다 |
| C2  | 🔴 **잠금 단계에는 잠금 읽기와 판정만 둔다.** `lock()` 안에 비잠금 SELECT(보기 읽기 `readUser` · `findRole` · 쓰는 중 검사 · 셈)가 끼면 읽기 뷰가 셈보다 먼저 열려 재배치가 무너진다. 타입으로는 못 막는다 — 🔴 주석과 경합 테스트(셈을 `lock()` 앞으로 되돌려 RED)가 지킨다                                                                                                                                                  |
| C3  | **잠금 단계 표**(② R1). 역할 권한 수정: `lockRole` → 판정 → revision → (기본을 켬) `lockOtherDefaults`. 역할 삭제: `lockRole` → 판정 → revision. 사용자 역할 변경: `lockUser`(users ⋈ roles) → `lockGrantRole` → 판정 → revision → `lockTeam`(teamNo 가 null 이 아닐 때). 퇴사: `lockUser` → 판정 → 이미 퇴사 409. 나머지(보기 읽기 · 재직 이력 잠금 · 소속 바꿈 · UPDATE · 세션 폐기 · 쓰는 중 검사)는 쓰기 단계             |
| C4  | **`clearOtherDefaults` 를 둘로 나눈다** — `lockOtherDefaults(trx, except): Promise<bigint[]>`(잠금 읽기)와 `clearDefaults(trx, roleNos)`(UPDATE · revision + 1). 역할 수정은 앞을 잠금 단계에, 뒤를 쓰기 단계에 둔다. 역할 만들기는 둘을 차례로 부른다(지금과 같은 순서 — 기본 끄기 → 순서 셈 → INSERT)                                                                                                                       |
| C5  | **세션 폐기는 쓰기 단계에 남긴다.** 세션을 잠금 단계에서 잠그면 대상의 refresh 회전과의 교착(2d R10-3 — 회전이 옛 세션 행을 잡고 users S 를 기다림)에서 바꾼 행이 적은 퇴사 쪽이 희생자가 되기 쉽다(지금은 대개 회전). 남는 것은 ON 에서 대상의 로그아웃 · 다른 관리자의 세션 끊기가 셈과 폐기 사이에 커밋될 때의 1020 → 409 다 — §12 (a) 가 재고 §14 에 적는다                                                               |
| C6  | **역할 순서 셈**: `SELECT displayOrder FROM roles ORDER BY displayOrder DESC LIMIT 1 FOR UPDATE`(인덱스 끝 한 행). 빈 표면 1(지금과 같음). `MAX(…) FOR UPDATE` 는 옵티마이저가 "Select tables optimized away" 로 인덱스 끝을 직접 읽어 잠그지 않을 수 있다 — §12 (c) 가 두 모양을 같이 잰다. 이동(`move`)과 다른 기본 역할 찾기는 쿼리를 바꾸지 않는다 — 인덱스가 생기면 구간 · 일치 행만 잠근다(§12 (c))                     |
| C7  | **본인 재입사**: `AccountCommand` 의 `user.rehire` 변형을 지우고 `'user.resign' \| 'user.resignDate' \| 'user.passwordReset' \| 'user.unlock' \| 'user.rehire'` 한 변형으로 묶는다. 자기 계정 검사가 덮기보다 먼저(`'*'` 행위자도 403), 판정이 상태 검사보다 먼저(B7)라 재직 중인 본인도 409 가 아니라 403 이다                                                                                                               |
| C8  | **`resolveTimeZone`**: 정규식 통과 → `formatterFor(value).resolvedOptions().timeZone` 을 돌려준다(형식기 캐시는 입력 이름 그대로 — 정규 이름으로 한 번 더 만들어진다). `ResolvedUsersConfig.timeZone` 이 정규 이름이 되고, 셈 · 감사 meta `timeZone` · 응답 날짜가 모두 그 이름을 쓴다                                                                                                                                        |
| C9  | **주석 정리**: `user-view.ts` 의 "알려진 동작 — 낡은 before" 단락과 `super-admin.ts` 머리의 순서 설명을 새 순서로 고친다. `users.employment.db.test.ts` 경합 테스트의 "알려진 동작" 주석을 지운다                                                                                                                                                                                                                             |

## 3. 정본

정본에서 새로 가져오는 것은 없다. `super-admin.ts` 머리 주석의 정본(hangang `monotonicity.ts`) 줄에 "바꾼 점: 셈을 대상 잠금 뒤로(잠금 단계 콜백) — hangang 은 센티넬 → 셈 → 대상 잠금이었다(2d-3)" 를 더한다.

## 4. 공개 API

- `index.ts` 에 내는 것이 바뀌지 않는다(`withSuperAdminSurvival` · `resolveTimeZone` 은 내부).
- HTTP: 본인 재입사 403(§2-2 #3).
- 옵션: `timeZone` 의 표기가 정규 이름으로 바뀌어 감사 meta 에 남는다(셈은 같다).
- 스키마: 장 0001 이 `roles` 에 인덱스 둘을 더 만든다. `AdminDatabase` 타입은 그대로.

## 5. 흐름

### 5-1. 잔존 (`accounts/super-admin.ts`)

```
withSuperAdminSurvival(trx, { lock, write })
  ① lockSuperAdminGuard(trx)                     🔴 트랜잭션 첫 문장
  ② locked = await lock()                         🔴 잠금 읽기 · 판정만(C2)
  ③ before = countSuperAdmins(trx)                🔴 비잠금 — 이 트랜잭션의 첫 비잠금 읽기라 읽기 뷰가 여기서 열린다
  ④ result = await write(locked)
  ⑤ assertSuperAdminSurvives(before, countSuperAdmins(trx)) ── 409 lastSuperAdmin
```

- 🔴 ③ 이 ② 뒤인 이유: 셈이 읽기 뷰를 연다. 그 앞에서 잠근 행은 기다리는 사이 커밋된 남의 쓰기를 포함해 뷰에 최신으로 보이고(OFF — before · item 이 낡지 않는다), 뷰가 열린 뒤 그 행을 다시 잠금 읽기 · UPDATE 해도 1020 이 아니다(ON).
- 🔴 ③ 이 여전히 맞는 이유: 센티넬이 셈을 줄이는 쓰기를 모두 줄 세운다. ① 과 ③ 사이에 커밋될 수 있는 것은 셈을 늘리는 쓰기(만들기 · 재입사)와 셈과 무관한 쓰기(로그인 · 회전)뿐이다.
- 🔴 ③ 에 `FOR UPDATE` 를 붙이지 않는다(2d §5-3 그대로).

### 5-2. 역할 (`roles/roles.service.ts`)

```
POST /roles                                                 (센티넬 없음)
  runWriteTransaction
    isDefault ⇒ cleared = lockOtherDefaults(trx, null) · clearDefaults(trx, cleared)
    top = SELECT displayOrder FROM roles ORDER BY displayOrder DESC LIMIT 1 FOR UPDATE    (C6)
    INSERT roles(…, displayOrder = (top ?? 0) + 1)

PATCH /roles/:roleNo
  steps = {
    lock:  row = lockRole ─ 404 · judge role.update ─ 403 · revision ─ 409
           clearing = (isDefault 를 켬 ∧ row 는 아직 아님) ? lockOtherDefaults(trx, roleNo) : []
    write: clearDefaults(trx, clearing) · UPDATE roles(본문에 있는 것, revision + 1) ─ 중복 400
  }
  next ? withSuperAdminSurvival(trx, steps) : steps.write(await steps.lock())
  item = findRole(trx)                                       (트랜잭션 안 보기 읽기 — 2d §14 R5-2)

DELETE /roles/:roleNo
  withSuperAdminSurvival(trx, {
    lock:  row = lockRole ─ 404 · judge role.delete ─ 403 · revision ─ 409
    write: SELECT 1 FROM users WHERE roleNo LIMIT 1 ─ 409 IN_USE · DELETE
  })

PATCH /roles/:roleNo/move                                   (쿼리 그대로 — 인덱스가 구간만 잠그게 한다)
```

- 역할 삭제의 쓰는 중 검사는 비잠금이다(쓰기 단계). 역할 행을 X 로 쥐었으므로 그 역할을 새로 배정하는 쓰기(`lockGrantRole` · FK S 검사)는 커밋하지 못한다 — 셈이 연 뷰에서 보지 못한 배정이 없다. 놓쳐도 FK restrict 가 같은 409 로 받친다(2d B11 그대로).

### 5-3. 사용자 (`users/users.service.ts`)

```
PATCH /users/:userNo
  steps = {
    lock:  target = lockUser ─ 404
           grant = roleNo ? lockGrantRole ─ 400 roleNo : undefined
           judge user.update ─ 403 · revision ─ 409
           teamNo != null ⇒ lockTeam ─ 400 teamNo
    write: before = readUser · joinDate ⇒ correctJoinDate · 'teamNo' ∈ 본문 ⇒ replaceTeam · UPDATE users
  }
  roleNo ? withSuperAdminSurvival(trx, steps) : steps.write(await steps.lock())
  item = readUser(trx)

POST /users/:userNo/resign
  withSuperAdminSurvival(trx, {
    lock:  target = lockUser ─ 404 · judge user.resign ─ 403 · resignAt ≠ NULL ─ 409 alreadyResigned
    write: before = readUser · lockActivePeriods · (치유) · 구간 UPDATE · users UPDATE
           effective ≤ now ⇒ revokeAllOfUser(…, { trx, liveOnly: true })            (⑥ L1)
           item = readUser
  })

POST /users/:userNo/rehire          judge 가 본인이면 403 selfAccount(C7) — 나머지 그대로
POST /users/:userNo/password-reset  revokeAllOfUser(…, { trx, liveOnly: true })       (⑥ L1)
```

- 수정의 잠금 순서는 users → roles(대상 · 줄) → teams → (teamUserMap · 재직 이력) 그대로다(2d R9-1 · 2e §5-1). 바뀐 것은 셈과 `before` 보기 읽기가 `lockTeam` 뒤로 간 것뿐이다.
- `lockTeam` 을 잠금 단계에 두면 사용자 수정의 오류 순서가 404 → 400 roleNo → 403 → 409 revision → 400 teamNo 로 지금과 같다.

### 5-4. 바뀌는 경합 결과

| 경합                                                             | 지금                                      | 2d-3 뒤                                                  |
| ---------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| 퇴사가 대상 잠금을 기다리는 동안 같은 계정 재입사 커밋(OFF)      | 성공 · 감사 before 가 재입사 전(낡음)     | 성공 · before `resignDate: null`(최신)                   |
| 퇴사 ∥ 대상 로그인 실패(ON)                                      | 409 `ER_CHECKREAD`                        | 성공(OFF 와 같은 결과)                                   |
| 사용자 역할 변경 ∥ 같은 팀 이름 바꾸기 · 이동(ON)                | 409 `ER_CHECKREAD`(2e-1 이월)             | 성공                                                     |
| 역할 권한 수정 ∥ 그 역할 이동(ON — 이동은 revision 을 안 올린다) | 409 `ER_CHECKREAD`                        | 성공                                                     |
| 역할 만들기 ∥ 다른 역할을 쥔 사용자 쓰기                         | 만들기가 기다린다(전 행 잠금) · 드문 교착 | 기다리지 않는다(인덱스 끝 한 행 — §12 (c))               |
| 즉시 퇴사 ∥ 대상 로그아웃(ON)                                    | 409(셈 뒤 커밋이면)                       | 그대로 — §12 (a) 로 재고 §14 · README 에 적는다          |
| 역할 만들기 둘 — 순서 셈이 서로의 INSERT 앞에 겹침               | 줄을 선다(전 행 잠금)                     | 드물게 1213 → 409(진 쪽) · 순서 값은 겹치지 않음(§14 R3) |

## 6. 오류 표

새 문구가 없다. 바뀌는 자리 하나:

| 자리                      | 상태 · 코드                | 문구                                                                                                                 |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 본인 재입사(재직 중 포함) | 403 `ERR_COMMON_FORBIDDEN` | `ACCOUNT_MESSAGES.selfAccount`(`내 계정에는 이 작업을 할 수 없습니다. 다른 관리자에게 요청하세요.`) — `details` 없음 |

## 7. 의존성

새 의존성 없다. admin-shared 를 고치지 않는다.

## 8. 파일

```
packages/admin-server/src/
  accounts/super-admin.ts · super-admin.db.test.ts      LockedWrite · 셈 자리(C1 · C2) · 머리 주석
  accounts/account-command.ts · .test.ts                user.rehire 자기 계정 403(C7)
  accounts/calendar.ts · .test.ts · options.test.ts     resolveTimeZone 정규 이름(C8)
  database/migrations/0001_roles.ts · ddl.test.ts       인덱스 둘(③ I1)
  database/migrations/migrations.db.test.ts             인덱스 존재(information_schema.statistics)
  roles/roles.service.ts                                잠금 단계 · lockOtherDefaults · clearDefaults · 순서 셈(C4 · C6)
  roles/roles.service.db.test.ts · roles.order.db.test.ts · (새) roles.snapshot.db.test.ts
  users/users.service.ts · user-view.ts(주석)           잠금 단계 · liveOnly(C3 · C9 · ⑥)
  users/users.employment.db.test.ts · users.snapshot.db.test.ts · users.write.db.test.ts ·
    users.password.db.test.ts · users.http.db.test.ts   §9
packages/admin-server/README.md                         역할 · 권한 / 사용자 · 계정 절
.changeset/admin-server-accounts-cleanup.md             admin-server minor
docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md   §14 R11
docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md   §14 R4
docs/01-phase0.md §8 · docs/HANDOFF.md · CLAUDE.md
```

플랜은 `docs/superpowers/plans/2026-10-15-admin-server-accounts-cleanup.md`.

## 9. 테스트 계약

TDD — 실패하는 테스트부터. 구현자는 테스트를 먼저 만들고 구현 전에 돌려 RED 를 보고서에 붙인다. 🔴 잠금 · 순서 테스트는 구현 뒤 해당 줄을 일부러 되돌려 RED 를 한 번 더 본다. 경합 테스트는 공개 서비스 메서드를 거친다.

### 9-1. 단위 (`pnpm check`)

- `judgeAccountCommand`: `user.rehire` 본인 403 `selfAccount`(`'*'` 행위자도 — 덮기보다 먼저), 남은 넓은 계정 403 `higherAccount`(지금 테스트의 "자기 계정 허용" 을 뒤집는다).
- `resolveTimeZone`: `'asia/seoul'` → `'Asia/Seoul'` · `'US/Eastern'` → `'America/New_York'` · `'Etc/UTC'` → `'UTC'` · `'Asia/Seoul'` 그대로 · 기본값. 오프셋 · 약어 · 모르는 이름은 그대로 멈춘다. `resolveUsersConfig({ timeZone: 'asia/seoul' })` 의 `timeZone` 이 `'Asia/Seoul'`.
- ddl: 0001 이 ``create index `idx_roles_display_order` on `roles` (`display_order`)`` · ``create index `idx_roles_is_default` on `roles` (`is_default`)`` 를 낸다(컴파일된 SQL).

### 9-2. 실 MariaDB (`pnpm test:db`)

- **잔존(`super-admin.db.test.ts`)** — 지금 넷(409 · 통과 · 센티넬 없음 500 · write skew 경합)을 `{ lock, write }` 로 옮긴다. 🔴 새로: 원시 연결이 대상 행을 쥐고 바꾼 채 → `lock()` 이 그 행을 잠금 읽기, `write()` 의 비잠금 읽기가 바뀐 값을 본다(셈이 `lock()` 뒤에 뷰를 연다). RED: 셈을 `lock()` 앞으로 옮기면 옛 값.
- **이월 1 · 2e-1(경합 — `whileHeld`, 순서를 되돌려 RED)**
  - (r1) `users.employment` 퇴사 ∥ 재입사 커밋(OFF) — before `resignDate: null`. RED: 옛 순서면 `'2025-12-31'`.
  - (r2) `users.snapshot` 퇴사 ∥ 대상 로그인 실패 — ON 성공(`loginFailCount` 1 · revision 1 · 퇴사일 기록), OFF 그대로 성공. RED: 옛 순서면 ON 409 `ER_CHECKREAD`.
  - (r3) `users.snapshot` ON — 원시 연결이 가드 `teamTree` · 팀 행을 쥐고 이름을 바꾼 채 → 사용자 수정(`roleNo` · 그 `teamNo`)이 기다렸다 성공. RED: 옛 순서면 409.
  - (r4) `roles.snapshot`(새) ON — 원시 연결이 역할 행을 쥐고 `displayOrder` 를 바꾼 채(이동 모양) → 그 역할의 권한 수정이 기다렸다 성공 · revision + 1. 역할 삭제도 같은 모양으로 성공. RED: 옛 순서면 409.
- **이월 2(역할 인덱스 — 2e-1 `teams.guard` 의 "잠금 대기 관찰" 모양)**
  - (i1) 원시 연결이 순서 맨 끝이 아닌 역할 행 하나를 `FOR UPDATE` 로 쥔 채 → 역할 만들기가 잠금 대기 없이 끝난다. RED: 순서 셈을 인덱스 없이(또는 장에서 인덱스를 빼고) 돌리면 대기.
  - (i2) 같은 모양으로 기본 역할이 아닌 다른 역할을 쥔 채 → 다른 역할의 기본 켜기 수정이 잠금 대기 없이 끝난다.
  - (i3) 원시 연결이 이동 구간 밖 역할을 쥔 채 → 이동이 잠금 대기 없이 끝난다.
  - 동시 만들기 둘(지금 `roles.order` 테스트 — 앞 만들기가 이미 INSERT 한 순서)이 그대로 초록 — 인덱스 끝 잠금이 줄을 세운다. 두 순서 셈이 서로의 INSERT 앞에 겹치는 순서는 진 쪽 409 · 순서 값 겹침 없음(§14 R3, 같은 파일의 '겹친 동시 만들기').
  - 장: 새 DB 의 `information_schema.statistics` 에 두 인덱스가 있다.
- **이월 5** — 정규 이름은 단위가 잰다. 퇴사 감사 meta `timeZone` 은 HTTP 테스트가 이미 잰다(옵션이 정규 이름이면 그대로).
- **이월 7(`liveOnly`)** — 살아 있는 세션 하나 · 만료된 미폐기 세션 하나를 둔 계정: 초기화 · 즉시 퇴사의 `revokedCount` 가 1, 만료 행은 `isRevoked = false` 그대로.
- **이월 8**
  - `lockGrantRole` 회귀: 원시 연결이 줄 역할을 쥐고 권한을 `["*"]` 로 바꾼 채 → 좁은 관리자의 사용자 만들기 · 역할 바꾸는 수정이 기다렸다 403 `higherRoleToGrant`, 계정 · 역할 그대로. RED: `lockGrantRole` 의 `forUpdate` 를 빼면 201 · 200(낡은 권한으로 판정 — 권한 상승).
  - B7: 넓은 대상에 좁은 관리자 — 재직 중 대상의 퇴사일 정정(409 `notResigned` 자리) · 재직 중 대상의 재입사(409 자리)가 403 `higherAccount`.
  - 치유 + 400 롤백: 재직 이력 없는 계정을 입사일(`users.joinAt` 의 기준 시간대 날짜) 앞 날짜로 퇴사 → 400 `issues[resignDate]`, 재직 이력이 비어 있고 `revision` 그대로.
  - `day()`: 두 파일 머리에서 `const TODAY = todayIn(TZ)` 한 번, `day = (offset) => addDays(TODAY, offset)`.
- **이월 9** — 서비스: 퇴사 예정 본인의 재입사 403 `selfAccount` · 재직 중 본인도 403(409 아님) · 남(넓지 않은)은 200. HTTP: 본인 재입사 403 봉투(`code` · `message`, `details` 없음).

### 9-3. 리뷰 초점 (플랜 · 리뷰어에게 넘긴다)

1. `lock()` 안에 비잠금 읽기가 없는가(C2) — `readUser` · `findRole` · 쓰는 중 검사 · 셈이 쓰기 단계에만 있는가. 잠금 단계의 판정 · revision · 상태 검사 순서가 B7 그대로인가.
2. 잠금 단계가 C3 표와 같은가 — 대상 · 줄 역할 · 팀 · 다른 기본 역할이 모두 셈 앞, 소속 · 재직 이력 · 세션은 뒤. 전역 잠금 순서(2e §5-1)가 Task 사이에 어긋나지 않는가.
3. 경합 테스트가 공개 서비스 메서드를 거치고 순서를 되돌려 RED 를 봤는가 — 그 RED 가 다른 잠금(가드 · 행 잠금)에 가려지지 않는가.
4. 역할 인덱스: 순서 셈이 인덱스 끝 한 행만 잠그고 동시 만들기가 여전히 줄을 서는가, 다른 기본 역할 찾기 · 이동 구간이 인덱스를 타는가(작은 표 EXPLAIN — §12 (c)).
5. 본인 재입사 403 이 상태 검사보다 먼저인가, `liveOnly` 가 감사 숫자 밖에 바꾸는 것이 없는가, `timeZone` 정규 이름이 셈 · 감사 meta 에 같이 쓰이는가.

## 10. 릴리스 · 문서

- **changeset** `.changeset/admin-server-accounts-cleanup.md` — admin-server **minor**(본인 재입사 403 이 HTTP 계약을 바꾼다). 첫 줄은 쓰는 쪽이 할 일: "없음(새 DB). 장 0001 을 이미 돌린 개발 DB 는 역할 인덱스 둘이 없어도 2d-2 와 같이 돈다 — 맞추려면 `CREATE INDEX idx_roles_display_order ON roles (display_order)` · `CREATE INDEX idx_roles_is_default ON roles (is_default)`". admin-server 는 미발행이라 npm 에는 나가지 않는다.
- **admin-server README**: "사용자 · 계정" — 자기 계정 문단에 재입사를 더하고 "재입사(퇴사 예정인 본인)는 된다" 를 지운다, 동시 쓰기 재시도 문단을 2d-3 결과(§5-4)로 고친다, `timeZone` 은 정규 이름으로 바꿔 쓴다. "역할 · 권한" — 동시 쓰기 재시도 문단(만들기 교착 문장).
- **`docs/01-phase0.md`** §8 admin-server 행. **HANDOFF** — "PR 2d-2 최종 리뷰가 넘긴 것" 의 2d-3 항목 · "PR 2e-1 최종 리뷰가 넘긴 것" 의 스냅샷 1020 항목을 닫고, 다음 플랜을 2e-2 약관으로. **CLAUDE.md** — 진행 표, admin-server 규약의 잔존 줄("센티넬 → 잠금 단계 → 셈").
- **쓰는 쪽 스모크**(`%TEMP%\akss`, 새 DB — 장 0001 을 바꿨으므로): tarball → 스텁 10장 → 시드 → 기동 → 역할 만들기 · 수정 · 이동 → 사용자 만들기 · 역할 변경 · 퇴사 · 본인 재입사 403 → 감사 행.

## 11. 비범위 · 보류

- 2b `rotate` 잠금 순서(users 먼저 FOR SHARE) · 로그인 TOCTOU — 2f(이월 3). 즉시 퇴사 · 초기화와 회전의 드문 교착(2d R10-3)은 그대로다.
- 세션 폐기의 잠금 단계 이동(C5) — 로그아웃 경합의 1020 은 받아들인다.
- 역할 이동끼리 · 겹치는 구간의 교착, "사용자의 지금 역할이 기본 역할이고 새 역할이 켜는 역할" 인 기본 켜기 교착 — 인덱스가 좁히지만 없애지 않는다(409 다시 시도).
- 2e-1 이 넘긴 오류 코드 총수 테스트 · 테스트 강도 항목.
- 두 역할 만들기의 순서 셈이 서로의 INSERT 앞에 겹칠 때의 드문 교착(1213 → 409 다시 시도 — §14 R3). 순서 값은 겹치지 않는다.

## 12. 플랜에서 먼저 확인할 위험

플랜을 쓰기 전에 패키지 DB 하네스의 임시 프로브(`src/zz-probe-*.db.test.ts` — 다 재면 지운다)와 실 MariaDB 11.4 로 재고 결과를 §14 R1 에 적는다.

1. **(a) 재배치 뒤 잔존 쓰기 ∥ 대상.** 퇴사 · 역할 바꾸는 수정을 새 순서로 돌리며 원시 연결이 대상의 로그인 실패(users UPDATE) · refresh 회전(sessions UPDATE → INSERT) · 로그아웃(sessions UPDATE 만)을 쥐고 있을 때 — ON · OFF 에서 1020 과 낡은 before 가 사라지는가, 교착이 없는가. 회전은 R10-3 교착이 그대로인지(희생자가 어느 쪽인지), 로그아웃은 셈 뒤 커밋이면 ON 1020 인지(C5).
2. **(b) 사용자 역할 변경 ∥ 팀 이름 바꾸기 · 이동**(원시 연결이 `teamTree` 가드 · 팀 행을 쥠) — ON 에서 1020 이 사라지는가.
3. **(c) 역할 인덱스.** 역할 몇 개(3 · 5 · 20)뿐인 표에서 — `ORDER BY displayOrder DESC LIMIT 1 FOR UPDATE` · `MAX(displayOrder) FOR UPDATE` · `WHERE isDefault = 1 [AND roleNo != ?] FOR UPDATE` · 이동 구간 UPDATE 의 EXPLAIN 과 실제 잠금(원시 연결이 다른 행을 쥐었을 때 기다리는가). 동시 만들기 둘이 여전히 줄을 서고 순서 값이 겹치지 않는가(빈 표 · 행 하나 포함). 만들기 ∥ 사용자 역할 변경, 기본 켜기 ∥ 사용자 역할 변경의 교착 재현이 사라지는가.
4. **(d) 그 밖.** 역할 권한 수정 ∥ 그 역할 이동(ON) 1020 이 사라지는가. `LockedWrite<L, T>` 제네릭 추론이 tsc strict 를 지나는가(`lock` 이 `Promise<LockedUser>` 를 돌려줄 때 `write` 의 인자 타입).

## 13. 선행 문서 정정

- **2d 스펙** — §14 R11 한 줄이 이 문서를 가리킨다: B16 "재입사는 자기 계정도 허용한다" → 본인 재입사 403(③ SF1 에 더함). §5-3 흐름 "① 센티넬 ② before ③ 대상 행" → 센티넬 → 잠금 단계 → before(이 문서 §5-1). §5-4 만들기 "displayOrder = MAX(displayOrder) + 1" → 인덱스 끝 잠금 읽기(C6). §5-6 재입사 판정 "403 higherAccount" → `selfAccount` · `higherAccount`. R9-2 · R9-3 · R10-2 의 "후속" 은 이 PR 이 닫는다.
- **2e 스펙** — §14 R4 한 줄: §2-1 이월 표 1 · 2 · 5 · 7 · 8 나머지 · 9 와 2e-1 최종 리뷰의 스냅샷 1020 을 2d-3 이 닫았다. §5-1 표의 사용자 쓰기 행 순서는 그대로다(셈 자리만 `lockTeam` 뒤로).
- **CLAUDE.md** · **HANDOFF** · **01-phase0** — §10 대로.

## 14. 구현 중 정정

§12 의 확인 결과와 구현 · 리뷰에서 바뀐 것을 `R<n>` 으로 더한다.

- **R1 — §12 위험 실측(2026-10-15, 플랜 전, MariaDB 11.4.13 · `REPEATABLE-READ` · `innodb_snapshot_isolation` 세션 변수로 ON · OFF · 패키지 DB 하네스의 임시 프로브 두 파일 — 지웠다).** 설계를 바꾼 것은 없다. 경계 결정 ①~③ 을 실측으로 받쳤다. 서비스 대신 같은 문장 순서를 원시 연결로 돌려 옛 순서(센티넬 → 셈 → 대상 잠금)와 새 순서(센티넬 → 대상 잠금 → 셈)를 나란히 쟀다.
  1. **(a1) 퇴사 ∥ 대상 로그인 실패**(원시 연결이 users 행을 쥐고 `login_fail_count + 1`). 옛 순서: OFF 는 성공하지만 셈 뒤 보기 읽기가 `login_fail_count = 0`(낡음 — R9-2 재현), ON 은 대상 잠금 읽기가 `ER_CHECKREAD`. 새 순서: OFF · ON 모두 성공하고 보기 읽기가 1(최신). 둘 다 대상 잠금에서 기다렸다(잠금 대기 관찰).
  2. **(a2) 즉시 퇴사 ∥ refresh 회전 — 회전이 퇴사의 대상 잠금 뒤에 시작**(옛 세션 UPDATE → 새 세션 INSERT 가 FK 로 users S 를 기다림 → 퇴사의 세션 폐기가 옛 세션 행을 기다림). OFF · ON 모두 교착 1213 이고 희생자는 **회전**, 퇴사는 그대로 성공한다(2d R10-3 그대로 — 퇴사가 users · 구간을 먼저 바꿔 무겁다). C5(세션을 쓰기 단계에 남김)의 근거.
  3. **(a2b) 회전이 먼저**(옛 UPDATE · 새 INSERT 로 users S 를 쥠). 퇴사가 대상 잠금에서 기다렸다 회전 커밋 뒤 성공, 폐기 1행(새 세션). ON 에서도 1020 없음.
  4. **(a3) 셈 뒤 · 폐기 전에 대상 로그아웃 커밋**(세션 UPDATE 만, autocommit). OFF 성공(남은 1행 폐기), ON 은 퇴사의 세션 폐기 UPDATE 가 `ER_CHECKREAD` — `liveOnly` 조건이 있어도 없어도 같다. C5 가 받아들인 남는 경합이다(README "동시 쓰기 재시도").
  5. **(b) 사용자 역할 변경 ∥ 같은 팀 이름 바꾸기 · 이동**(원시 연결이 `teamTree` 가드 · 팀 행을 쥐고 이름 또는 `display_order` 를 바꿈). 옛 순서: ON `ER_CHECKREAD`(2e-1 이월 재현), OFF 성공이지만 보기 읽기의 팀 이름이 바뀌기 전 값. 새 순서: OFF · ON 모두 성공하고 보기 읽기가 바뀐 이름 · 순서를 본다.
  6. **(d) 역할 권한 수정 ∥ 그 역할 이동**(원시 연결이 역할 행을 쥐고 `display_order` 만 바꿈 — revision 안 올림). 옛 순서 ON `ER_CHECKREAD`, 새 순서 ON · OFF 성공.
  7. **(c) 역할 인덱스 — 잠금 범위.** 인덱스가 없으면 역할 3 · 5 · 20 개 모두에서 네 쿼리(`ORDER BY displayOrder DESC LIMIT 1 FOR UPDATE` · `MAX(displayOrder) FOR UPDATE` · `WHERE isDefault = 1 [AND roleNo != ?] FOR UPDATE` · 이동 구간 UPDATE)가 EXPLAIN `ALL`(구간 UPDATE 는 `index/PRIMARY`)이고 상관없는 역할 행 하나를 쥔 연결을 기다린다(1205). 인덱스 둘을 더하면 작은 표에서도 옵티마이저가 인덱스를 탄다 — 끝 행 셈 `index/idx_roles_display_order`, `MAX` `Select tables optimized away`, 기본 찾기 `ref/idx_roles_is_default`, 구간 UPDATE `range/idx_roles_display_order` — 그리고 상관없는 행을 기다리지 않는다. 끝 행 셈 · `MAX` 둘 다 끝 행(M)을 쥔 연결은 기다린다(끝 행을 잠근다). 기본 찾기는 기본 역할 행을 쥔 연결을 기다린다.
  8. **(c) 동시 만들기 둘**(A 가 셈 · INSERT 를 쥔 채 B 가 같은 셈) — 인덱스 유무 · 두 쿼리 모양 · 빈 표 · 행 하나 · 다섯 모두 B 가 기다렸다 A 의 값 + 1 을 받는다(겹침 없음). `MAX … FOR UPDATE` 도 인덱스에서 끝 행을 잠그지만, C6 은 옵티마이저의 "optimized away" 에 기대지 않는 끝 행 셈을 그대로 쓴다.
  9. **(c) 교착 재현.** D1 만들기 ∥ 사용자 역할 변경(사용자가 지금 역할 A 를 쥐고 끝 역할 M 을 줄 역할로): 인덱스 없음 → 1213(사용자 쪽 희생), 인덱스 → 만들기가 기다리지 않고 둘 다 성공. D2 기본 켜기(R 을 쥐고 다른 기본 찾기) ∥ 사용자 역할 변경(지금 역할 A ≠ 기본 D 를 쥐고 R 을 줄 역할로): 인덱스 없음 → 1213, 인덱스 → 교착 없음(사용자가 R 을 기다릴 뿐). 사용자의 지금 역할이 기본 역할 D 면 인덱스가 있어도 1213 — §11 이 받아들인 남는 경합이다.
  10. **(d) 타입.** `LockedWrite<L, T>` 를 받는 함수에 객체 리터럴 `{ lock, write }` 를 넘기면 `write` 의 인자가 `lock` 의 결과 타입(`LockedUser` 등)으로 추론되고, 어긋난 인자 타입은 tsc 오류다(`@ts-expect-error` 로 확인) — admin-server `tsc --noEmit` 초록.
- **R2 — 플랜이 더한 작은 결정 넷(2026-10-15, 2d-3 플랜).** ① 인덱스 잠금 범위 테스트(i1~i3)와 순서 시드 0 테스트는 새 파일 `roles/roles.index.db.test.ts` 에 둔다(§8 정정 — `roles.order` 는 이동 · 삭제가 순서 값을 재므로 다른 역할을 섞지 않는다). ② 잔존 경합 r3(사용자 역할 변경 ∥ 팀 이름) · r4(역할 수정 · 삭제 ∥ 이동)는 ON · OFF 둘 다 돈다 — OFF 는 낡은 item(R10-2)을, ON 은 1020 을 잡는다. ③ 단계를 호출 밖에서 선언하는 곳(역할 · 사용자 수정 — 잔존 없는 갈래가 같은 단계를 부른다)은 `LockedWrite<L, T>` 로 타입을 적는다 — 인자를 안 쓰는 `write` 를 `steps.write(locked)` 로 부를 수 있게. ④ `resolveTimeZone` 테스트의 링크 이름 기대값은 Intl 이 내는 값이다 — ICU 78.3 은 `'America/Argentina/Buenos_Aires'` 를 `'America/Buenos_Aires'` 로 낸다(ICU 판마다 다를 수 있다).
- **R3 — 구현 · 리뷰 중 바뀐 것(2026-10-15, 2d-3 SDD).** ① 역할 인덱스의 끝 행 잠금 읽기(C6)는 끝 행과 그 위 틈(supremum)을 잠근다. 두 역할 만들기의 순서 셈이 서로의 INSERT 앞에 겹치면 뒤 읽기가 그 틈을 기다리고, 앞 만들기의 INSERT(insert-intention)가 그 대기와 엇갈려 1213 → 409 다시 시도로 끝난다(대개 뒤 쪽이 희생). 옛 전수 스캔은 이 창에서 줄을 섰다. 순서 값은 어느 쪽이든 겹치지 않는다. 받아들인다 — 더 흔한 경로인 역할 만들기 ∥ 사용자 역할 변경 교착(R1-9 D1)이 사라지는 쪽을 택했고, 그 대안(guardLocks 순서 행)은 새 장이 필요하다. `roles.order.db.test.ts` 의 '겹친 동시 만들기' 테스트가 "순서 값이 겹치지 않고, 진 쪽은 409 `ERR_COMMON_CONFLICT`" 를 고정한다. 태스크 리뷰 실측(MariaDB 11.4.13): 역할 1 · 3 개, 끝 행 셈 · `MAX` 두 모양 모두 뒤 만들기 1213. 기본 켜기 만들기 둘은 지금 기본 역할의 `roleNo` 가 가장 크면 같은 1213. R1-8 은 "앞 만들기가 이미 INSERT 한 뒤" 순서만 쟀다. ② 판정 · 잠금 순서 · 계약은 바뀌지 않았다 — 태스크 리뷰가 넘긴 작은 것(주석 · 테스트 강도)은 HANDOFF "PR 2d-3 최종 리뷰가 넘긴 것" 에 둔다.
