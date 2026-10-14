# admin-server 사용자 · 역할 설계 (Phase 2 PR 2d)

작성일: 2026-10-14 · 상태: 확정(구현 전) · 선행: 2a 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1(Phase 2 지도 · §1-3 의 2d 행 · §1-4 공통 결정) · §6(코어 장), 2b 스펙 `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` ④ R1 · B2 · B9 · §4-7(`AdminReauthService`), 2c 스펙 `docs/superpowers/specs/2026-10-14-admin-server-sessions-audit-design.md` ① P1 · ④ A1 · ⑨ M1 · ⑪ D1 · B4 · R7, 3b 스펙 `docs/superpowers/specs/2026-10-04-admin-ui-roles-settings-design.md` §4-1 · §4-4 · §9, 3c 스펙 `docs/superpowers/specs/2026-10-06-admin-ui-sessions-passwords-design.md` §4-3 · §9, 3d 스펙 `docs/superpowers/specs/2026-10-07-admin-ui-teams-design.md` §4-6(`TeamUserList`), `docs/01-phase0.md` §3-2(users · roles 행) · §4, `docs/HANDOFF.md` "알려진 미확인 · 보류" 의 2d 항목

이 문서는 2d 의 범위만 쓴다. Phase 2 전체 지도 · 순서 · 공통 결정은 2a 스펙 §1, 인증 · 가드 · 세션 저장소는 2b, 슬롯 · 감사는 2c 스펙이 그대로 유효하다. 2d 는 **한 스펙 · 두 PR** 이다(⓪ S2) — 각 줄의 **[1]** 은 2d-1 역할 · 판정, **[2]** 는 2d-2 사용자 · 계정이다.

## 1. 목표

2a 스펙 §1-3 의 2d 행:

> `UsersModule`(목록 · 단건 · 생성 · 수정 · 퇴사 · 재입사 · 퇴사일 · 재직 이력 · 비밀번호 초기화 · 잠금 해제) · `RolesModule` · `judgeAccountCommand` · `permissions.normalize` · 권한 상승 검사 · 전권자 잔존(`guardLocks` 장) · 임시 비밀번호 — 끝 상태: 3b §9 전부, 3c 비밀번호 초기화

**2d-1 역할 · 판정** (브랜치 `feat/admin-server-users-roles`) — 끝 상태, 실 MariaDB HTTP 계약으로:

- 3b §9 의 모든 행: 역할 목록 전량 · `displayOrder` 순, 수정 · 삭제의 `revision` 409 와 성공 시 증가, 이동은 `revision` 을 받지도 올리지도 않음, 이웃 목표값까지 구간 재번호, `permissions` 정규화(`'*'` 접기 · 함의 · 카탈로그 순서), 권한 상승 검사는 `permissions` 가 본문에 있을 때만, 만들기 `{ roleNo }`, 기본 역할 하나.
- 마지막 전체 권한 재직자를 없애는 역할 수정 · 삭제는 409, 동시 요청도 `guardLocks` 행이 줄 세운다.
- 남의 세션 끊기(2c 의 두 라우트)는 세션 주인이 나보다 넓으면 403(2c ⑪ D1).

**2d-2 사용자 · 계정** (2d-1 병합 뒤 새 브랜치 `feat/admin-server-users`) — 끝 상태:

- 3c §9 비밀번호 초기화: 서버가 만든 16자 임시 비밀번호, `isPasswordChangeRequired = true`, 대상 세션을 같은 트랜잭션에서 폐기, 응답 `{ temporaryPassword }`.
- 계정 만들기가 임시 비밀번호를 돌려주고, 그 값으로 로그인하면 2b 강제 변경 흐름에 들어간다.
- 퇴사일 당일까지 로그인되고 기준 시간대의 다음 날 0시부터 막힌다. 지난 날짜면 그 자리에서 세션이 끊긴다.
- 3d `TeamUserList` 가 기대는 목록 필터(`teamNo` · `recursive` · `keyword`) · 쪽 나눔.

쓰는 쪽은 2d-1 뒤 `permissionCatalog` 옵션 · 역할 슬롯 둘 · `AdminRolesModule` import 로 admin-ui `useRoleEditor` 를 실서버에 붙이고, 2d-2 뒤 사용자 슬롯 둘 · `AdminUsersModule` import 로 사용자 관리 화면(B)을 붙인다.

## 2. 결정

### 2-1. 경계 결정 (2026-10-14, 결정 문서 HTML — 모두 권장안)

| #                 | 확정                                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⓪ 분할            | **S2** — 한 스펙 · 두 PR. 2d-1 역할 · 판정(카탈로그 옵션 · 정규화 · 판정 함수 · `guardLocks` · 역할 5라우트 · 세션 끊기 검사) → 2d-2 사용자 · 계정(사용자 10라우트 · 재직 이력 · 임시 비밀번호 · 잠금 해제). 2d-2 플랜은 2d-1 병합 뒤에 쓴다                                                                   |
| ① 권한 카탈로그   | **C1** — 코어 옵션 `permissionCatalog`(admin-shared `definePermissions` 결과). 카탈로그가 함의 표(`implies`)와 `normalize` 를 든다 — 서버와 `useRoleEditor({ implies })` 가 같은 표를 쓴다. 카탈로그 밖 키는 400                                                                                               |
| ② 권한 상승 검사  | **E1** — 지배 판정(gise 형, 3b 계약에 맞춤). 대상의 현재 권한 · 새 권한을 모두 덮어야 한다. 역할 수정은 `permissions` 가 본문에 있을 때만(3b §9). 남의 세션 끊기 포함(2c ⑪ D1)                                                                                                                                 |
| ③ 자기 계정       | **SF1** — 자기 계정의 퇴사 · 퇴사일 정정 · 비밀번호 초기화 · 잠금 해제만 403. 자기 이름 · 팀 · 역할(내리는 쪽) 바꾸기와 자기 역할의 권한 수정은 허용(3b `onSelfRoleSaved` · 2c "사용자 전체" 본인 허용 그대로)                                                                                                 |
| ④ 전권자 잔존     | **G1** — 장 `0009_guard_locks`(테이블 + 센티넬 행 `superAdminSurvival`). 잔존을 줄일 수 있는 쓰기가 트랜잭션 첫 문장에서 그 행을 `FOR UPDATE` 로 잡고 전후로 센다(hangang)                                                                                                                                     |
| ⑤ 퇴사일          | **Z1** — 본문은 날짜(`YYYY-MM-DD`). 서버가 효력 시각 = 기준 시간대에서 **퇴사일 다음 날 0시**의 UTC 순간을 계산한다. 2b 인증은 그대로(`resignAt ≤ now`). **TZ1** — `timeZone` 옵션 기본 `'Asia/Seoul'`, 기동에서 IANA 이름 검증                                                                                |
| ⑥ 생성 비밀번호   | **P1** — 서버가 임시 비밀번호를 만든다. 응답 `{ item, temporaryPassword }`, `isPasswordChangeRequired = true`                                                                                                                                                                                                  |
| ⑦ 재인증          | **R1** — 코어 옵션 `reauth: boolean`(기본 false). 켜면 역할 만들기 · 수정 · 삭제와 사용자 쓰기 전부가 본문 `currentPassword` 를 요구한다(목록 · 이동 제외). 서비스 진입부 · 트랜잭션 밖에서 `AdminReauthService.verify`                                                                                        |
| ⑧ 사용자 revision | **V1** — 편집 폼이 보여 주는 값이 바뀔 때만. `PATCH /users/:userNo` 가 요구하고 수정 · 퇴사 · 퇴사일 정정 · 재입사가 올린다. 비밀번호 초기화 · 잠금 해제 · 본인 비밀번호 변경 · 로그인 실패는 올리지 않는다(2b B9 의 답). **U1** — 0002 장의 `updateAt` 에서 `ON UPDATE` 를 빼고 revision 이 오를 때 같이 쓴다 |
| ⑨ 팀 소속         | **T1** — 사용자 쓰기가 팀 하나(`teamNo: bigint \| null`)를 받는다. 쓰기는 그 사용자 소속을 지우고 넣는다(axion). 목록 · 단건은 대표 팀(가장 작은 `teamNo` — 2b R34)을 LEFT JOIN                                                                                                                                |
| ⑩ 확장 필드       | **X1** — 지금은 없음(B). 확장 필드는 쓰는 쪽 자기 라우트가 다룬다. `users.extension` 은 필요해지면 하위 호환으로 더한다                                                                                                                                                                                        |
| ⑪ 역할 목록 권한  | **L1** — `GET /roles` 는 `roles.read` ∨ `users.read`(gise). 슬롯 선언이 "하나라도" 를 받는다                                                                                                                                                                                                                   |
| ⑫ 기본 역할       | **D1** — 하나만. 만들기 · 수정이 `isDefault = true` 면 같은 트랜잭션에서 다른 역할의 표시를 끄고 그 역할들의 `revision` 을 올린다. 0개는 허용                                                                                                                                                                  |
| ⑬ 오류 코드       | **K1** — 새 코드 없음. 본문 필드에 붙는 위반(날짜 순서 · 없는 역할 · 팀 · 이름 중복 — B1)은 400 `ERR_COMMON_VALIDATION` + `issues`, 상태 전이 · 마지막 관리자는 409 `ERR_COMMON_CONFLICT`, 쓰는 중 역할은 409 `ERR_COMMON_IN_USE`, 권한 상승 · 자기 계정은 403 `ERR_COMMON_FORBIDDEN`                          |

### 2-2. 공통 결정 (정본이 같거나 계약이 정한 것 — 이의 없음)

1. **슬롯 넷.** [1] `roles.read` · `roles.manage`, [2] `users.read` · `users.manage` — `AdminPermissionSlot` 은 일곱이 된다. 비밀번호 초기화 · 잠금 해제도 `users.manage`.
2. **감사 액션.** [1] `org.role.create · update · delete · move`, 대상 `role`. [2] `org.user.create · update · resign · resignDate.update · rehire · password.reset · unlock`(hangang 이름 + gise unlock). 코어 액션 14 → 18 → 25, 대상 2 → 3. 라벨 · 개수 테스트를 함께 고친다. 사용자 · 역할 쓰기 라우트는 전부 `@Audit`.
3. **역할 목록 · 이동.** 목록은 전량 `{ items }`(`displayOrder`, `roleNo` 오름차순 — 3b §9). 새 역할은 마지막 + 1. 이동은 hangang 구간 재번호, 목표값을 [가장 작은 값, 가장 큰 값] 으로 자르고, revision 을 싣지도 올리지도 않는다(3b D1).
4. **이름 중복.** 사전 검사 없이 UNIQUE 제약 이름으로 가린다 — `uq_roles_role_name` · `uq_users_user_id`(2a F10 · R3). 응답 모양은 §2-3 B1(400 필드 검증 오류)이 정한다 — 결정 문서의 "→ `ERR_DUPLICATE_*`" 는 B1 이 고쳤다(§13).
5. **임시 비밀번호.** gise 생성기 — 16자, `I O l o 0 1` 을 뺀 56자 알파벳, `crypto.randomInt`(3c §9). 초기화 = 해시 교체 · `isPasswordChangeRequired = true` · 잠금 해제(카운터 0 · `lockUntil` NULL — gise) · 대상의 살아 있는 세션 폐기를 한 트랜잭션, argon2 는 밖. 응답 `{ temporaryPassword }`.
6. **퇴사와 세션.** 효력 시각이 이미 지났으면 그 사용자 세션을 같은 트랜잭션에서 `terminated` 로 폐기한다. 미래면 두고 인증이 그 시각에 막는다(hangang · axion). 퇴사일 정정 · 재입사는 세션을 건드리지 않는다(hangang).
7. **재직 이력.** 활성 구간 ≤ 1 은 서비스가 지킨다(사용자 행 `FOR UPDATE` — DB 는 부분 UNIQUE 가 없다, 0006 장 주석). 퇴사할 때 활성 구간이 없으면 `users.joinAt` 으로 치유한다(시드가 이력 없이 만든 계정 — hangang · crm). 퇴사일 ≥ 활성 구간 입사일, 재입사일 > 직전 퇴사일(Z1 에서 같은 날은 근무가 겹친다 — axion), 정정은 마지막 구간만.
8. **사용자 목록.** 팀 LEFT JOIN(무소속도 보인다 — hangang · crm 은 INNER 라 사라졌다), 검색어는 아이디 · 이름 부분일치(`likeContains`), `filter[teamNo]` · `filter[recursive]`(3d `TeamUserList`), `filter[status]` = `active` | `resigned`(퇴사 예정 포함). 🔴 boolean 쿼리는 `'true'` · `'false'` 만 — `z.coerce.boolean()` 은 `"false"` 를 참으로 읽는다(crm · axion 결함). 정렬은 열 허용 목록 + `userNo` 보조.
9. **잠금 해제** `POST /users/:userNo/unlock` — 실패 카운터 0 · `lockUntil` NULL(gise). revision 을 올리지 않는다.
10. **응답 모양**(§4 #2 · 3b · 3c). 역할 만들기 `{ roleNo }`(3b §9) · 수정 `{ item }` · 삭제 · 이동 `{}`. 사용자 만들기 `{ item, temporaryPassword }` · 수정 · 퇴사 · 퇴사일 · 재입사 `{ item }` · 초기화 `{ temporaryPassword }` · 잠금 해제 `{}`.
11. **감사 소독.** 만들기 · 초기화의 임시 비밀번호와 재인증 `currentPassword` 는 감사 가방에 넣지 않는다(1차). 넣어도 2c 소독이 `***` 로 가린다(2차). HTTP 테스트가 행 meta 원문에 그 값이 **없음**을 잰다(2c 최종 리뷰 F1).
12. **이름 정리.** [1] `@Audit` 인자 타입 `AuditOptions` → `AuditDeclaration` — 모듈 옵션 `AdminAuditOptions` 와 헷갈린다(2c 이월). 미발행이라 비용이 없다.
13. **계약 스키마를 admin-shared 에 먼저**(3b 역할 스키마와 같은 방식, `.refine()` 없음). 사용자 행은 날짜를 `joinDate` · `resignDate`(`YYYY-MM-DD`)와 효력 시각 `resignAt`(ISO)으로 나눠 싣는다. 목록 쿼리 스키마는 서버 내부다(2c 세션 쿼리와 같은 방식 — 화면은 어댑터).

### 2-3. 설계 결정 (설계안 ① · ② · ③ 승인 2026-10-14)

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **이름 중복은 400 필드 검증 오류다**(설계 ② 확인 N1). `ERR_COMMON_VALIDATION` + `issues[{ path: ['roleName'] }]` "이미 있는 역할 이름입니다." · `['userId']` "이미 있는 아이디입니다." — 3b D5("길이 · 중복은 서버 검증이 `fieldErrors` 로 온다")와 admin-ui `toFieldErrors`(`ERR_COMMON_VALIDATION` 만 칸 오류로)에 맞춘다. `ERR_DUPLICATE_ROLE_NAME` · `ERR_DUPLICATE_USER_ID` 는 코드표에 남기고 킷 라우트는 쓰지 않는다                                                                                                                                   |
| B2  | 🔴 **2a 장 주석을 지킨다**(설계 ② 검토 정정). `userEmploymentPeriods.recordedTimezone` 은 "기록 시점 **프로세스** TZ" 그대로 늘 `'UTC'`(`assertUtcTimezone` 이 보장). 기준 시간대(`timeZone`)는 날짜 → 효력 시각 계산에만 쓰고 저장하지 않는다 — 어느 시간대로 셈했는지는 퇴사 · 정정 · 재입사 감사 meta 의 `timeZone` 이 남긴다. `createdBy` 도 주석대로 최초 입사 행(만들기 · 치유)은 NULL, 재입사 행만 행위자                                                                                                                                              |
| B3  | 날짜 열에는 그날의 UTC 자정 `Date` 를 넘긴다(hangang). 프로세스 TZ = UTC 라 드라이버가 그 날짜로 쓴다 — 날짜 열의 정확성도 2a R8 의 가드 하나에 기댄다. 테이블 타입(`Date`)을 바꾸지 않는다                                                                                                                                                                                                                                                                                                                                                                   |
| B4  | 서버가 쓰는 카탈로그 모양은 좁힌 타입 `AdminPermissionCatalog` = `Pick<PermissionCatalog<…>, 'ALL_PERMISSION_VALUES' \| 'isPermission' \| 'implies' \| 'normalize'>` 다. 프로젝트 카탈로그가 이 자리에 들어간다(§14 R1-1)                                                                                                                                                                                                                                                                                                                                     |
| B5  | 본문 스키마는 런타임 옵션(카탈로그 · `reauth`)에 달려 주입형 파이프로 만든다(2b `LoginBodyPipe` 와 같은 방식). `permissions` 는 원소마다 `catalog.isPermission` 으로 거르는 배열 스키마로 바꿔 끼운다 — 모르는 키는 `issues[{ path: ['permissions', i], message: '알 수 없는 권한입니다.' }]`(zod 기본 문구는 카탈로그 값 전부를 나열한다 — §14 R1-7). `reauth: true` 면 `currentPassword: string(1..256)` 을 더한다. 꺼져 있으면 보낸 `currentPassword` 는 버려진다(zod 기본 strip). 본문이 없는 쓰기(초기화 · 잠금 해제)는 `reauth` 일 때만 본문을 검증한다 |
| B6  | 역할 목록 · 수정 응답의 `permissions` 는 **저장된 그대로**(문자열 배열이 아니면 `[]` + 경고 — 2b `findPrincipal` 과 같은 fail-closed)다. 읽을 때 정규화하지 않는다 — 인증 가드가 읽는 값과 화면이 보이는 값이 같아야 한다. 카탈로그에서 지운 옛 키는 화면(`orderedPermissions`)이 버리고 다음 저장에서 빠진다                                                                                                                                                                                                                                                 |
| B7  | 판정 순서: 대상 행 잠금 → 존재(404) → 판정(자기 계정 → 현재 권한 → 줄 권한, 403) → revision(409) → 상태 전이(409) → 쓰기 → 잔존(409). 권한 없는 사람에게 revision · 상태를 드러내지 않는다(gise)                                                                                                                                                                                                                                                                                                                                                              |
| B8  | 🔴 사용자 쓰기는 대상을 `users ⋈ roles … FOR UPDATE` 로 잠근다 — 역할 행도 함께 잠가, 판정하는 동안 그 역할의 권한이 바뀌지 않게 한다(바뀌면 덮기 판정이 낡은 권한으로 통과한다). 교착 여부는 §12-3 으로 잰다                                                                                                                                                                                                                                                                                                                                                 |
| B9  | 사용자 목록의 `teamNo` 필터는 대표 팀이 아니라 **소속 전체**로 거른다(`EXISTS teamUserMap … [⋈ teamClosure]`). 행이 보이는 팀 이름은 대표 팀이다                                                                                                                                                                                                                                                                                                                                                                                                              |
| B10 | 응답의 `joinDate` · `resignDate` 는 **마지막 재직 구간**의 날짜다(원천). 구간이 없는 시드 계정은 `joinDate = dateIn(users.joinAt, timeZone)` · `resignDate = null`. `lockUntil` 은 미래일 때만 싣고 아니면 null(gise)                                                                                                                                                                                                                                                                                                                                         |
| B11 | 역할 삭제도 잔존 잠금을 잡는다 — 쓰는 중인 역할 검사(409 `IN_USE`)가 먼저라 지금은 닿지 않는 방어선이다(hangang). 쓰는 중 검사가 스냅숏 때문에 놓친 배정은 FK restrict 가 같은 409 로 받친다(2a F15 · `mapError`)                                                                                                                                                                                                                                                                                                                                             |
| B12 | 기동 검사 하나 더: 역할 · 사용자 모듈은 `permissions` 슬롯 맵의 **모든** 키가 `permissionCatalog` 에 있는지 본다. 슬롯 키 오타가 조용히 403 이 되는 길을 막는다(2c R4 의 연장)                                                                                                                                                                                                                                                                                                                                                                                |
| B13 | 내부 `RequirePermissionSlot(...slots)` 는 "하나라도" 판정이다. 메타는 배열이고, 맵에 이어지지 않은 슬롯은 거짓으로 센다(fail-closed 그대로 — 2c §4-1 🔴)                                                                                                                                                                                                                                                                                                                                                                                                      |
| B14 | 판정 함수는 2d-1 에서 사용자 명령까지 모두 만든다 — 세션 대상 판정이 같은 함수이고, 2d-2 는 호출만 더한다                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| B15 | `startOfDayIn` 은 그날 0시가 없으면(DST 가 0시에 시작) 그날의 첫 순간을 돌려준다. 기준 시간대는 `Intl` 로 풀리는 IANA 이름만 — `+09:00` 같은 오프셋 표기는 기동에서 거부(hangang `isValidTimeZone`)                                                                                                                                                                                                                                                                                                                                                           |
| B16 | 재입사는 자기 계정도 허용한다(퇴사 예정인 본인). 잠금 해제는 잠겨 있지 않아도 200 이다(멱등)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 3. 정본과 흡수 목록

| 산출물                                                | 정본                                                                                                                         | 흡수할 것                                                                                            | 버릴 것                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| admin-shared `permissions.ts` `implies` · `normalize` | hangang `modules/roles/permissions.normalize.ts`                                                                             | `'*'` 왕복 항등(`['*']` 하나), 함의 닫힘, 중복 접기 · 카탈로그 순서                                  | 액션 이름 규칙(`write ⇒ read`) 하드코딩(→ 명시 `implies` 표 — 3b `useRoleEditor` 와 같은 모양), 서버 전용 표 + 화면 손 사본     |
| `accounts/account-policy.ts`                          | gise `modules/accounts/account-policy.ts` `judgeAccountCommand` · `judgeSessionTarget`                                       | 덮기 판정(현재 · 새), 자기 계정 규칙, 문구, 판정 순서(존재 → 자기 → 덮기 → revision)                 | 전량 스냅숏(→ 서비스가 잠그고 읽은 권한을 명령에 싣는다, ④ G1), `selfRole` 금지(→ ③ SF1), 마지막 관리자 투영(→ 잔존 셈)         |
| `accounts/super-admin.ts`                             | hangang `core/permissions/monotonicity.ts` `lockSuperAdminGuard` · `assertSuperAdminSurvives`                                | 센티넬 행 첫 문장 잠금 · 셈에 `FOR UPDATE` 금지 · "있었는데 0" · `Transaction` 만 받음 · 행 없음 500 | IP 층(`applicableIpLayer` → 2f), `LIKE '%"*"%'`(→ `JSON_CONTAINS`, §12-2), `assertGrantWithinActor`(→ 덮기 판정)                |
| `0009_guard_locks`                                    | hangang `012_guard_locks` · `013_guard_lock_super_admin_seed`                                                                | 테이블 모양 · 주석 · 리터럴 시드                                                                     | 두 장 분리(→ 한 장)                                                                                                             |
| `roles/*`                                             | hangang `modules/roles`(라우트 · 이동 구간 재번호 · 재인증 · 감사 diff) + gise revision + axion 기본 역할 배타               | 이동 알고리즘 · 쓰는 중 409 · diff 필드 셋, 수정 · 삭제 revision, 기본 역할 끄기                     | 쪽 나눈 목록(→ 전량 3b §9), 이름 사전 검사(→ 제약 이름 B1), 목표값 미보정(→ 자르기), 만들기에서 빠진 기본 역할 배타(axion 결함) |
| `sessions.service.ts` D1                              | gise `judgeSessionTarget`                                                                                                    | 세션 주인 덮기                                                                                       | 본인 금지(→ 2c "사용자 전체" 본인 허용 유지)                                                                                    |
| `users/*` [2]                                         | hangang `modules/users`(퇴사 · 정정 · 재입사 · 치유 · 세션 폐기 · 감사) + gise 생성 · 초기화 · 잠금 해제 + crm 활성 구간 ≤ 1 | 재직 이력 규칙 · 문구, 즉시 퇴사 세션 폐기, 임시 비밀번호 생성 응답, 잠금 해제, LIKE 이스케이프      | INNER JOIN 팀(→ LEFT), 서버 자기 보호 없음(→ ③ SF1), `z.coerce.date`(→ 날짜 문자열), `z.coerce.boolean`(→ `'true'` · `'false'`) |
| `accounts/calendar.ts` [2]                            | hangang `packages/shared/src/utils/site-time.ts`                                                                             | 기준 시간대 오늘 · `Intl` 형식기 캐시 · 오프셋 표기 거부                                             | 인증 쪽 날짜 비교(→ 2b 효력 시각 비교 그대로, ⑤ Z1)                                                                             |
| `accounts/temporary-password.ts` [2]                  | gise `modules/accounts/temporary-password.ts`                                                                                | 알파벳 · 길이 · `randomInt` · 주입 가능한 `pick`                                                     | —                                                                                                                               |

## 4. 공개 API

### 4-1. admin-shared (두 PR 모두 minor)

```ts
// [1] permissions.ts
export interface DefinePermissionsOptions<E extends string = never> {
  extraValues?: readonly E[]
  /**
   * 함의 표 — 키를 켜면 값의 키들이 함께 켜진다(연쇄를 펼친다). 예: `{ 'org.users:write': ['org.users:read'] }`.
   * 정의할 때 던진다: 키 · 값이 카탈로그 밖 · `'*'` · 자기 자신. 순환은 허용한다(닫힘이 멈춘다).
   */
  implies?: Partial<Record<string, readonly string[]>> // 시그니처에서는 카탈로그 값 유니온으로 좁힌다
}
export interface PermissionCatalog<T, E> {
  // …기존
  /** 검증된 함의 표. admin-ui `useRoleEditor({ implies })` 에 그대로 넘긴다 */
  readonly implies: Readonly<Partial<Record<T[keyof T] | E, readonly (T[keyof T] | E)[]>>>
  /**
   * 역할 권한 정규화(3b §9). `'*'` 가 있으면 `['*']` → 아니면 함의 닫힘 → 카탈로그 순서 · 중복 제거.
   * 카탈로그 밖 키는 버린다(서버는 본문 파이프가 `isPermission` 으로 먼저 거른다 — B5).
   */
  normalize(values: readonly string[]): (T[keyof T] | E | AllPermission)[]
}

// [1] audit.ts — CoreAuditActions 에 더함
ROLE_CREATE: 'org.role.create' · ROLE_UPDATE: 'org.role.update' · ROLE_DELETE: 'org.role.delete' · ROLE_MOVE: 'org.role.move'
CoreAuditTargets.ROLE = 'role'
// 라벨: 역할 생성 · 역할 수정 · 역할 삭제 · 역할 표시 순서 변경 · 대상 '역할'

// [2] audit.ts
USER_CREATE: 'org.user.create' · USER_UPDATE: 'org.user.update' · USER_RESIGN: 'org.user.resign'
USER_RESIGN_DATE_UPDATE: 'org.user.resignDate.update' · USER_REHIRE: 'org.user.rehire'
USER_PASSWORD_RESET: 'org.user.password.reset' · USER_UNLOCK: 'org.user.unlock'
// 라벨: 사용자 생성 · 사용자 수정 · 퇴사 처리 · 퇴사일 정정 · 재입사 처리 · 비밀번호 초기화 · 잠금 해제

// [2] pagination.ts
/** 쿼리스트링 boolean — 'true' · 'false' 만(또는 boolean). 🔴 z.coerce.boolean() 은 "false" 를 참으로 읽는다 */
export const queryBooleanSchema: z.ZodType<boolean>

// [2] users.ts (새 파일)
export const USER_ID_MAX_LENGTH = 64 · USER_NAME_MAX_LENGTH = 64 · EMPLOYMENT_REASON_MAX_LENGTH = 255
/** 'YYYY-MM-DD' — 실제 달력 날짜만(2026-02-30 거부) */
export const calendarDateSchema: z.ZodType<string>
export const adminUserSchema = z.object({
  userNo: z.bigint(), userId: z.string(), userName: z.string(),
  roleNo: z.bigint(), roleName: z.string(),
  teamNo: z.bigint().nullable(), teamName: z.string().nullable(),   // 대표 팀
  joinDate: calendarDateSchema, resignDate: calendarDateSchema.nullable(),
  /** 퇴사 효력 시각(2b ④ R1). 미래면 퇴사 예정 */
  resignAt: z.iso.datetime().nullable(),
  isPasswordChangeRequired: z.boolean(),
  /** 미래일 때만. 아니면 null */
  lockUntil: z.iso.datetime().nullable(),
  revision: z.number().int().min(0),
  createAt: z.iso.datetime(), updateAt: z.iso.datetime(),
})
export const adminUserCreateSchema   // { userId(trim 1..64), userName(trim 1..64), roleNo: bigint, teamNo: bigint | null, joinDate?: 날짜 }
export const adminUserCreateResultSchema // { item: adminUserSchema, temporaryPassword }
export const adminUserUpdateSchema   // { revision, userName?, roleNo?, teamNo?: bigint | null, joinDate? }
export const adminUserResignSchema   // { resignDate, reason?: string(≤255) | null }
export const adminUserResignDateSchema // 같은 모양
export const adminUserRehireSchema   // { joinDate, reason? }
export const adminEmploymentPeriodSchema // { periodNo, joinDate, resignDate | null, reason | null, recordedTimezone, createdBy | null, createdByName | null, createAt }
// 타입: AdminUser · AdminUserCreate · AdminUserCreateResult · AdminUserUpdate · AdminUserResign · AdminUserResignDate · AdminUserRehire · AdminEmploymentPeriod
```

- 🔴 `.refine()` 을 걸지 않는다(3b §11 R1 — 쓰는 쪽 `.extend()` · `.omit()` 을 막지 않는다). `adminUserUpdateSchema` 의 "바꿀 값 없음" 검사도 하지 않는다 — revision 만 와도 저장이다(gise 도 PATCH 마다 올린다).
- `implies` 는 3b `useRoleEditor` 의 `implies` 옵션과 같은 모양이다 — README 의 역할 화면 배선 예시가 `implies: permissions.implies` 로 넘긴다.

### 4-2. 옵션 (`src/options.ts` 에 더한다)

```ts
export interface AdminServerOptions {
  // …2a · 2b · 2c 그대로
  /** [1] admin-shared `definePermissions()` 결과. `AdminRolesModule` · `AdminUsersModule` 을 쓰면 필수(B4 · B12) */
  permissionCatalog?: AdminPermissionCatalog
  /** [1] 기본 false. 켜면 역할 · 사용자 쓰기가 본문 `currentPassword` 로 재인증한다(⑦ R1) */
  reauth?: boolean
  /** [2] 날짜(입사일 · 퇴사일)를 읽는 기준 시간대. IANA 이름, 기본 'Asia/Seoul'(⑤ TZ1 · B15) */
  timeZone?: string
}

export type AdminPermissionCatalog = Pick<
  PermissionCatalog<Record<string, string>, string>,
  'ALL_PERMISSION_VALUES' | 'isPermission' | 'implies' | 'normalize'
>
```

### 4-3. 슬롯 (`auth/permission-slots.ts`)

```ts
export type AdminPermissionSlot =
  | 'sessions.read'
  | 'sessions.manage'
  | 'auditLogs.read'
  | 'roles.read'
  | 'roles.manage' // [1]
  | 'users.read'
  | 'users.manage' // [2]
/** 내부 — 하나라도 통과하면 통과(B13) */
export function RequirePermissionSlot(
  ...slots: [AdminPermissionSlot, ...AdminPermissionSlot[]]
): CustomDecorator<string>
```

### 4-4. 모듈

```ts
@Module({ controllers: [AdminRolesController], providers: [AdminRolesService, 본문 파이프] })
export class AdminRolesModule implements OnModuleInit {}   // [1]

@Module({ controllers: [AdminUsersController], providers: [AdminUsersService, AdminSessionStore, 본문 파이프] })
export class AdminUsersModule implements OnModuleInit {}   // [2]
```

- 둘 다 정적 모듈이고 `ADMIN_ROUTE_MODULES` 에 더한다(`routePrefix` 가 붙는다). `AdminReauthService` 는 전역 `AdminAuthModule` 이 낸다(2b R9). 사용자 모듈은 세션 폐기에 `AdminSessionStore` 를 자기 provider 로 둔다(2c R2 와 같은 이유).
- 기동 검사는 §5-7.

### 4-5. 역할 라우트 [1] (`AdminRolesController`, `@Controller('roles')`)

| 라우트                      | 슬롯                                      | 본문 → 응답                                                          | 감사                                  |
| --------------------------- | ----------------------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| `GET /roles`                | `roles.read` ∨ `users.read`(2d-2 가 더함) | → `{ items: AdminRole[] }` 전량                                      | —                                     |
| `POST /roles`               | `roles.manage`                            | `adminRoleCreateSchema`(+ 카탈로그 · 재인증) → 201 `{ roleNo }`      | `org.role.create` · role · diff       |
| `PATCH /roles/:roleNo`      | `roles.manage`                            | `adminRoleUpdateSchema`(+ 카탈로그 · 재인증) → `{ item: AdminRole }` | `org.role.update` · diff              |
| `PATCH /roles/:roleNo/move` | `roles.manage`                            | `adminRoleMoveSchema` → `{}`                                         | `org.role.move` · meta `{ from, to }` |
| `DELETE /roles/:roleNo`     | `roles.manage`                            | `adminRoleRemoveSchema`(+ 재인증) → `{}`                             | `org.role.delete` · diff              |

### 4-6. 사용자 라우트 [2] (`AdminUsersController`, `@Controller('users')`)

| 라우트                                  | 슬롯           | 본문 → 응답                                                           | 감사                                       |
| --------------------------------------- | -------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| `GET /users`                            | `users.read`   | 목록 쿼리(§5-6) → `{ items: AdminUser[], total, page, itemsPerPage }` | —                                          |
| `GET /users/:userNo`                    | `users.read`   | → `{ item }`                                                          | —                                          |
| `GET /users/:userNo/employment-periods` | `users.read`   | → `{ items: AdminEmploymentPeriod[] }`                                | —                                          |
| `POST /users`                           | `users.manage` | `adminUserCreateSchema` → 201 `{ item, temporaryPassword }`           | `org.user.create` · user · diff            |
| `PATCH /users/:userNo`                  | `users.manage` | `adminUserUpdateSchema` → `{ item }`                                  | `org.user.update` · diff                   |
| `POST /users/:userNo/resign`            | `users.manage` | `adminUserResignSchema` → `{ item }`                                  | `org.user.resign` · diff · meta            |
| `PATCH /users/:userNo/resign-date`      | `users.manage` | `adminUserResignDateSchema` → `{ item }`                              | `org.user.resignDate.update` · diff · meta |
| `POST /users/:userNo/rehire`            | `users.manage` | `adminUserRehireSchema` → `{ item }`                                  | `org.user.rehire` · diff · meta            |
| `POST /users/:userNo/password-reset`    | `users.manage` | (재인증이면 `{ currentPassword }`) → `{ temporaryPassword }`          | `org.user.password.reset` · meta           |
| `POST /users/:userNo/unlock`            | `users.manage` | (재인증이면 `{ currentPassword }`) → `{}`                             | `org.user.unlock` · meta                   |

- 상태를 바꾸는 `POST` 는 200 이다(`@HttpCode(200)` — 생성이 아니다). `POST /users` 만 201.
- 2d-2 는 `GET /roles` 의 슬롯 선언에 `users.read` 를 더한다(⑪ L1). 사용자 모듈이 없는 앱에서 `users.read` 가 맵에 없으면 그 갈래는 거짓이다(B13).

### 4-7. 장

- **[1] `0009_guard_locks`** (`@ssworks/admin-server/migrations/0009_guard_locks`): `guardLocks(lockName varchar(32) PK '잠금 이름. 행 하나가 곧 직렬화 지점 하나다', description varchar(200) NOT NULL)` + 시드 행 `('superAdminSurvival', "전체 권한('*') 재직자 수를 줄일 수 있는 쓰기를 직렬화한다. 각 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다")`. 시드는 상수 import 없이 리터럴(hangang 013). `down()` 은 테이블째 지운다. `ADMIN_MIGRATIONS` 에 더하고(스텁 정규식 `[a-z_]+` 에 맞는다), `AdminDatabase.guardLocks` · `AdminGuardLocksTable` 을 더한다. 모든 장 필수(2c ⑨ M1) — 쓰는 쪽은 스텁 한 줄을 더한다.
- **[2] `0002_users` 정정**(⑧ U1): `updateAt` 에서 `ON UPDATE CURRENT_TIMESTAMP` 를 뺀다(`DEFAULT CURRENT_TIMESTAMP` 는 남긴다). 테이블 타입 `updateAt: ColumnType<Date, never, Date>`. 미발행이라 장을 고칠 수 있다(2a ⑥ V1). 이미 장을 돌린 개발 DB 는 다시 만든다(README · changeset).

### 4-8. index 에 내는 것 · 내지 않는 것

- 낸다: `AdminRolesModule` [1] · `AdminUsersModule` [2] · `AdminPermissionCatalog` 타입 · 넓어진 `AdminPermissionSlot` · `AuditDeclaration`(이름 바꿈) · `AdminGuardLocksTable` 타입.
- 내지 않는다: `AdminRolesService` · `AdminUsersService` · `judgeAccountCommand` · 잔존 함수 · 날짜 함수 · 임시 비밀번호 생성기 · 본문 파이프 · `ACCOUNT_MESSAGES` · 사용자 목록 쿼리 스키마.

## 5. 흐름

### 5-1. 날짜와 효력 시각 [2] (`accounts/calendar.ts` — 순수 함수)

```
todayIn(timeZone, now)          기준 시간대의 오늘 → 'YYYY-MM-DD'
startOfDayIn(date, timeZone)    그날 0시(기준 시간대)의 UTC 순간. 0시가 없는 날은 그날 첫 순간(B15)
effectiveResignAt(date, tz)     = startOfDayIn(date + 1일, tz)
dateIn(instant, timeZone)       순간 → 그 시간대의 날짜
toDateColumn(date)              'YYYY-MM-DD' → 그날 UTC 자정 Date(B3)
fromDateColumn(value)           DATE 열의 Date → 'YYYY-MM-DD'(UTC 기준)
```

| 입력(`timeZone: 'Asia/Seoul'`) | 저장                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| 퇴사일 `2026-10-31`            | 구간 `resignAt = 2026-10-31`(DATE) · 사용자 `resignAt = 2026-10-31T15:00:00Z`(11-01 0시 KST) |
| 지금 막기                      | 퇴사일 = 어제 → 효력 = 오늘 0시 → 이미 지남 → 세션 폐기                                      |
| 입사일 `2026-11-02`            | 구간 `joinAt = 2026-11-02` · 사용자 `joinAt = 2026-11-01T15:00:00Z`                          |

- 2b 인증은 바꾸지 않는다 — `isResigned(resignAt, now) = resignAt ≤ now` 하나다.
- 🔴 `recordedTimezone` 은 늘 `'UTC'`(B2). 기준 시간대를 바꿔도 이미 저장된 효력 시각 · 날짜는 그대로다(README).
- `timeZone` 검증: `new Intl.DateTimeFormat('en-US', { timeZone })` 이 던지면, 또는 IANA 모양(`Area/City` · `UTC`)이 아니면 기동에서 멈춘다.

### 5-2. 판정 [1] (`accounts/account-policy.ts` — 순수 함수)

```ts
interface AccountActor {
  userNo: bigint
  permissions: readonly string[]
}
type AccountCommand =
  | { kind: 'role.create'; next: readonly string[] }
  | { kind: 'role.update'; current: readonly string[]; next?: readonly string[] }
  | { kind: 'role.delete'; current: readonly string[] }
  | { kind: 'user.create'; grant: readonly string[] }
  | {
      kind: 'user.update'
      targetUserNo: bigint
      current: readonly string[]
      grant?: readonly string[]
    }
  | { kind: 'user.rehire'; targetUserNo: bigint; current: readonly string[] }
  | {
      kind: 'user.resign' | 'user.resignDate' | 'user.passwordReset' | 'user.unlock'
      targetUserNo: bigint
      current: readonly string[]
    }
  | { kind: 'session.target'; targetUserNo: bigint; current: readonly string[] }
export function judgeAccountCommand(actor: AccountActor, command: AccountCommand): void // 거부면 BusinessError 403
```

| 명령                                                                     | 자기 계정             | 덮어야 할 것(`coversPermissions(actor.permissions, …)`) | 문구 키                               |
| ------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------- | ------------------------------------- |
| `role.create`                                                            | —                     | `next`                                                  | `higherRoleToEdit`                    |
| `role.update`                                                            | 허용                  | `next` 가 있을 때만 `current` · `next`                  | `higherRoleToEdit`                    |
| `role.delete`                                                            | 허용                  | `current`                                               | `higherRoleToEdit`                    |
| `user.create`                                                            | —                     | `grant`                                                 | `higherRoleToGrant`                   |
| `user.update`                                                            | 허용                  | `current` + `grant` 가 있으면 `grant`                   | `higherAccount` · `higherRoleToGrant` |
| `user.rehire`                                                            | 허용(B16)             | `current`                                               | `higherAccount`                       |
| `user.resign` · `user.resignDate` · `user.passwordReset` · `user.unlock` | **403 `selfAccount`** | `current`                                               | `higherAccount`                       |
| `session.target`                                                         | 허용                  | `current`                                               | `higherAccountSessions`               |

- 순서는 자기 계정 → `current` → `grant`/`next`. 덮지 못하면 403 `ERR_COMMON_FORBIDDEN` + `details.outside`(덮지 못한 키 — 상대에 `'*'` 가 있으면 `['*']`, hangang 화면이 읽던 모양).
- "자기 역할 권한 수정 허용" 은 덮기와 부딪히지 않는다 — `current` 는 행위자 자신의 권한이라 덮이고, `next` 에 자기에게 없는 키를 더하면 거부된다. 마지막 관리자가 사라지는 것은 잔존(§5-3)이 막는다.

### 5-3. 전권자 잔존 [1] (`accounts/super-admin.ts`)

```
대상 쓰기: 역할 권한 수정 · 역할 삭제(B11) · 사용자 역할 변경 · 사용자 퇴사          (2f: IP 규칙 쓰기 · 팀 변경)

runWriteTransaction(db, trx ⇒
  ① lockSuperAdminGuard(trx)    SELECT lockName FROM guardLocks WHERE lockName = 'superAdminSurvival' FOR UPDATE
                                   행 없음 ── 500 ERR_COMMON_INTERNAL guardMissing          🔴 트랜잭션 첫 문장
  ② before = countSuperAdmins(trx)                                                         🔴 FOR UPDATE 를 붙이지 않는다
  ③ 대상 행 FOR UPDATE · 판정 · 쓰기
  ④ after = countSuperAdmins(trx)
  ⑤ assertSuperAdminSurvives(before, after)   before ≥ 1 && after = 0 ── 409 ERR_COMMON_CONFLICT lastSuperAdmin
)

countSuperAdmins = SELECT COUNT(*) FROM users u JOIN roles r ON r.roleNo = u.roleNo
                    WHERE u.resignAt IS NULL AND JSON_CONTAINS(r.permissions, '"*"')       (§12-2)
```

- 🔴 ① 이 첫 문장인 이유: InnoDB REPEATABLE READ 는 첫 **비잠금** SELECT 에서 읽기 뷰를 만든다. 그 전에 셈을 읽으면 앞서 이 행을 쥐었던 트랜잭션이 커밋한 결과를 못 본다(hangang).
- 🔴 ② 에 `FOR UPDATE` 를 붙이면 대상 행 잠금과 전 행 스캔이 엇갈려 교착한다(hangang). 셈을 늘리기만 하는 쓰기(역할 · 사용자 만들기 · 재입사)는 잠그지 않는다.
- 한 트랜잭션은 `guardLocks` 행을 둘 이상 잡지 않는다. 잠금 함수는 `Transaction` 만 받는다(트랜잭션 밖에서 부를 수 없게).
- 퇴사 예정(`resignAt` 미래)도 곧바로 셈에서 빠진다 — 보수적이다. 잠긴 계정 · 강제 변경 계정은 센다(스스로 풀 수 있다).

### 5-4. 역할 [1] (`AdminRolesService`)

`[reauth]` = `reauth: true` 일 때만 `AdminReauthService.verify(주체, body.currentPassword)` — 권한 가드 뒤, 트랜잭션 밖(2b §4-7).

```
GET /roles
  SELECT roleNo, roleName, permissions, displayOrder, isDefault, revision FROM roles ORDER BY displayOrder, roleNo
  permissions = 저장된 문자열 배열(B6) ⇒ { items }

POST /roles
  [reauth] · next = catalog.normalize(body.permissions)
  judge role.create(next) ─────────────────────────── 403
  runWriteTransaction
    isDefault ⇒ UPDATE roles SET isDefault = 0, revision = revision + 1 WHERE isDefault = 1     (⑫ D1)
    displayOrder = MAX(displayOrder) + 1 (빈 표면 1)
    INSERT roles(roleName, permissions = JSON(next), isDefault, displayOrder)
      ER_DUP uq_roles_role_name ──────────────────── 400 issues roleName (B1)
  attachAuditTarget(roleNo) · attachAuditDiff(null, after, ROLE_FIELDS) ⇒ 201 { roleNo }

PATCH /roles/:roleNo
  [reauth] · next = body.permissions ? normalize : 없음
  runWriteTransaction
    next ⇒ ① lockSuperAdminGuard ② before
    ③ row = SELECT … WHERE roleNo FOR UPDATE ───────── 404 ERR_NO_ROLE
    ④ judge role.update(row.permissions, next) ──────── 403
    ⑤ body.revision ≠ row.revision ──────────────────── 409 ERR_COMMON_REVISION_CONFLICT
    ⑥ isDefault 를 켬(row 는 아직 아님) ⇒ 다른 기본 역할 끔(revision + 1)
    ⑦ UPDATE roles SET 본문에 있는 것, revision + 1 ── 중복 이름 400 issues roleName
    next ⇒ ⑧ after · assertSuperAdminSurvives ────────── 409 lastSuperAdmin
  커밋 뒤 다시 읽어 attachAuditDiff(before, after, ROLE_FIELDS) ⇒ { item }

PATCH /roles/:roleNo/move  (재인증 · revision 없음)
  runWriteTransaction
    row = SELECT … FOR UPDATE ───────────────────────── 404
    [lo, hi] = MIN · MAX(displayOrder) · target = clamp(body.displayOrder, lo, hi)
    target = from ⇒ 쓰기 없음
    from < target ⇒ UPDATE … displayOrder − 1 WHERE from < displayOrder ≤ target
    from > target ⇒ UPDATE … displayOrder + 1 WHERE target ≤ displayOrder < from
    UPDATE row SET displayOrder = target
  attachAuditMeta({ from, to: target }) ⇒ {}

DELETE /roles/:roleNo  { revision [, currentPassword] }
  [reauth]
  runWriteTransaction
    ① lockSuperAdminGuard ② before
    ③ row FOR UPDATE ─────────────────────────────────── 404
    ④ judge role.delete(row.permissions) ─────────────── 403
    ⑤ revision ───────────────────────────────────────── 409 REVISION_CONFLICT
    ⑥ SELECT 1 FROM users WHERE roleNo LIMIT 1 ──────── 409 ERR_COMMON_IN_USE roleInUse
    ⑦ DELETE  (놓친 배정은 FK restrict → mapError 가 같은 409 — B11)
    ⑧ after · assertSuperAdminSurvives
  attachAuditDiff(before, null, ROLE_FIELDS) ⇒ {}

ROLE_FIELDS = ['roleName', 'isDefault', 'permissions']
```

- 🔴 중복 이름 판정은 제약 이름(`uq_roles_role_name` · `uq_users_user_id` — CamelCasePlugin 이 snake 로 바꾼 이름, 2a R3)을 본다. `runWriteTransaction` 이 `mapError` 로 `ERR_COMMON_DUPLICATED` 를 만들어도 원본이 `cause` 에 남으므로, 서비스가 트랜잭션 밖에서 `cause.code === 'ER_DUP_ENTRY'` 이고 메시지에 그 이름이 있으면 B1 의 필드 검증 오류로 바꾼다(§14 R1-6). 다른 UNIQUE 위반은 `ERR_COMMON_DUPLICATED` 그대로다.
- 기본 역할 두 개를 동시에 켜는 경합은 §12-4 로 잰다 — 교착이면 `mapError` 가 409 "동시 처리 충돌" 로 내고 화면이 다시 읽는다(3b §4-4-2 #6).

### 5-5. 세션 끊기 권한 상승 검사 [1] (`AdminSessionsService` — 2c ⑪ D1)

```
DELETE /sessions/:sessionNo
  지금 세션 ──────────────────────────────────────── 400 (그대로)
  owner = sessions s ⋈ users u ⋈ roles r WHERE s.sessionNo AND 살아 있음 → { userNo, permissions }
    없음 ──────────────────────────────────────────── 404 (그대로 — 없는 · 끝난 세션과 같은 본문)
  judge session.target(owner) ───────────────────── 403 higherAccountSessions
  revokeLive(…) = 0 ───────────────────────────────── 404 (경합)

DELETE /sessions/user/:userNo
  target = users ⋈ roles WHERE userNo ────────────── 404 ERR_NO_USER
  judge session.target(target) ──────────────────── 403
  revokeAllOfUser(…, { liveOnly }) ⇒ { revokedCount }
```

- 본인은 늘 통과한다(자기 권한은 자기를 덮는다). 본인 라우트 셋(`/sessions/me…`)은 바뀌지 않는다. 403 이 세션의 존재를 드러내지만 이 라우트를 부르는 사람은 보통 `sessions.read` 로 목록을 볼 수 있다 — 남의 세션 404 규칙(2c 공통 3)은 본인 라우트의 것이다.

### 5-6. 사용자 [2] (`AdminUsersService`)

**목록 쿼리**(서버 내부 `users/users.query.ts`, `createQuerySchema`):

```
sortableColumns: userId · userName · joinAt · resignAt · createAt · updateAt   기본 createAt desc, userNo 보조
filter: keyword  string trim ≤ 64(빈 값은 조건 없음)
        teamNo   queryBigIntSchema
        recursive queryBooleanSchema(기본 false — teamNo 와 함께일 때만 뜻이 있다)
        status   'active' | 'resigned'(없으면 전부)

users u ⋈ roles r
  ⟕ teams t ON t.teamNo = (SELECT MIN(teamNo) FROM teamUserMap WHERE userNo = u.userNo)                 대표 팀
  ⟕ userEmploymentPeriods p ON p.periodNo = (SELECT periodNo FROM userEmploymentPeriods
                                              WHERE userNo = u.userNo ORDER BY joinAt DESC, periodNo DESC LIMIT 1)
  [keyword]  u.userId LIKE :k ESCAPE '!' OR u.userName LIKE :k ESCAPE '!'        k = likeContains(keyword)
  [teamNo]   EXISTS (SELECT 1 FROM teamUserMap m [JOIN teamClosure c ON c.descendantNo = m.teamNo AND c.ancestorNo = :teamNo]
                     WHERE m.userNo = u.userNo [AND m.teamNo = :teamNo])           (B9)
  [status]   u.resignAt IS NULL / IS NOT NULL
⇒ { items: AdminUser[](B10), total: bigint, page, itemsPerPage }
```

`GET /users/:userNo` — 같은 투영 · 없음 404 `ERR_NO_USER`. `GET /users/:userNo/employment-periods` — 사용자 없음 404, `ORDER BY joinAt DESC, periodNo DESC`, `createdBy` 를 users 에 LEFT JOIN 해 `createdByName`.

**쓰기 공통 앞부분**:

```
[reauth]                                                         트랜잭션 밖
[만들기 · 초기화] temp = generateTemporaryPassword() · hash = hashPassword(temp)   트랜잭션 밖 🔴 argon2
runWriteTransaction
  [잔존 대상] lockSuperAdminGuard · before                        🔴 첫 문장
  target = SELECT u.…, r.permissions FROM users u JOIN roles r … WHERE u.userNo FOR UPDATE ── 404 ERR_NO_USER (B8)
  judge user.<명령> ──────────────────────────────────────────── 403
  …
```

```
POST /users  { userId, userName, roleNo, teamNo, joinDate? }       잔존 잠금 없음
  joinDate ??= todayIn(timeZone)
  role 없음 ─────────────────────── 400 issues roleNo
  judge user.create(role.permissions) ── 403 higherRoleToGrant
  teamNo 이고 팀 없음 ───────────── 400 issues teamNo
  INSERT users(userId, password = hash, userName, roleNo, joinAt = startOfDayIn(joinDate),
               isPasswordChangeRequired = 1, updateAt = now)
    ER_DUP uq_users_user_id ──────── 400 issues userId (B1)
  teamNo ⇒ INSERT teamUserMap
  INSERT 구간(joinAt = toDateColumn(joinDate), recordedTimezone = 'UTC', createdBy = NULL)     (B2)
  attachAuditTarget(userNo) · diff(null → USER_FIELDS) ⇒ 201 { item, temporaryPassword }

PATCH /users/:userNo  { revision, userName?, roleNo?, teamNo?, joinDate? }
  roleNo ⇒ lockSuperAdminGuard · before
  target FOR UPDATE ──────────────── 404
  roleNo ⇒ 새 역할 없음 ──────────── 400 issues roleNo
  judge user.update(target, 새 역할) ── 403
  revision ≠ ─────────────────────── 409 REVISION_CONFLICT
  joinDate ⇒ 마지막 구간 정정
      구간 없음 ──────────────────── 409 noPeriodForJoin
      ≤ 직전 구간 퇴사일 · > 이 구간 퇴사일 ── 400 issues joinDate
      UPDATE 그 구간 joinAt
  'teamNo' ∈ 본문 ⇒ 팀 검사(400 teamNo) · DELETE teamUserMap WHERE userNo · non-null ⇒ INSERT
  UPDATE users SET 본문에 있는 것(joinAt = startOfDayIn), revision + 1, updateAt = now
  roleNo ⇒ after · 잔존 ─────────── 409 lastSuperAdmin
  diff(before → after, USER_FIELDS) ⇒ { item }

POST /users/:userNo/resign  { resignDate, reason? }
  lockSuperAdminGuard · before      🔴 늘 — 퇴사 예정도 셈에서 빠진다
  target FOR UPDATE ──────────────── 404
  judge user.resign ──────────────── 403 selfAccount · higherAccount
  target.resignAt ≠ NULL ─────────── 409 alreadyResigned
  활성 구간(resignAt IS NULL) ≥ 2 ─── 409 periodCorrupted
  활성 구간 0 ⇒ 치유 INSERT(joinAt = toDateColumn(dateIn(users.joinAt, tz)), 'UTC', createdBy NULL) · healed
  resignDate < 구간 joinDate ──────── 400 issues resignDate
  UPDATE 구간 SET resignAt = toDateColumn(resignDate), reason
  effective = effectiveResignAt(resignDate, tz)
  UPDATE users SET resignAt = effective, revision + 1, updateAt = now
  effective ≤ now ⇒ revokeAllOfUser(userNo, 'terminated', now, { trx }) → n
  after · 잔존 ───────────────────── 409 lastSuperAdmin
  diff resignDate · resignAt · meta { reason, revokedCount, healedPeriod?, timeZone } ⇒ { item }

PATCH /users/:userNo/resign-date  { resignDate, reason? }           잔존 잠금 없음(resignAt 이 NULL 아닌 채)
  target FOR UPDATE ──────────────── 404
  judge user.resignDate ──────────── 403 selfAccount · higherAccount
  target.resignAt = NULL ─────────── 409 notResigned
  마지막 구간 없음 ───────────────── 409 noPeriodForResign
  resignDate < 구간 joinDate ──────── 400 issues resignDate
  UPDATE 구간 SET resignAt [, reason — 본문에 있을 때만]
  UPDATE users SET resignAt = effectiveResignAt(…), revision + 1, updateAt = now
  diff resignDate · resignAt · meta { reason?, timeZone } ⇒ { item }

POST /users/:userNo/rehire  { joinDate, reason? }                  잔존 잠금 없음(늘기만 한다)
  target FOR UPDATE ──────────────── 404
  judge user.rehire ──────────────── 403 higherAccount
  target.resignAt = NULL ─────────── 409 notResignedForRehire
  활성 구간 있음 ──────────────────── 409 activePeriodExists
  joinDate ≤ 마지막 구간 퇴사일 ───── 400 issues joinDate
  INSERT 구간(joinAt, reason, 'UTC', createdBy = 주체)
  UPDATE users SET joinAt = startOfDayIn(joinDate), resignAt = NULL, revision + 1, updateAt = now
  diff joinDate · resignDate · meta { reason, timeZone } ⇒ { item }

POST /users/:userNo/password-reset
  target FOR UPDATE ──────────────── 404
  judge user.passwordReset ───────── 403 selfAccount · higherAccount
  UPDATE users SET password = hash, isPasswordChangeRequired = 1, loginFailCount = 0, lockUntil = NULL
                                      (revision · updateAt 그대로 — ⑧ V1)
  revokeAllOfUser(userNo, 'terminated', now, { trx }) → n
  attachAuditMeta({ revokedCount: n }) ⇒ { temporaryPassword }      🔴 temp 는 가방에 넣지 않는다

POST /users/:userNo/unlock
  target FOR UPDATE · judge user.unlock(selfAccount · higherAccount)
  UPDATE users SET loginFailCount = 0, lockUntil = NULL   (revision · updateAt 그대로)
  attachAuditMeta({ lockUntil: 이전, loginFailCount: 이전 }) ⇒ {}

USER_FIELDS = ['userId', 'userName', 'roleNo', 'roleName', 'teamNo', 'teamName', 'joinDate']
```

- 🔴 비밀번호 해시 교체는 코어 `users.password` 를 직접 쓴다 — 관리 쿼리는 코어 users 를 읽고 쓴다(2c B4). `AUTH_REPOSITORY.changePassword` 는 본인 변경(기대 해시 조건)용이다.
- 🔴 2b `updateLoginState` 는 이제 `updateAt` 을 바꾸지 않는다(U1) — 로그인 실패가 "수정일" 을 움직이지 않는다는 것을 DB 테스트가 잰다.

### 5-7. 기동 검사

| 검사                       | 어디서                                    | 멈추는 조건                                                                           |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| 인증 모듈                  | 역할 · 사용자 모듈 `onModuleInit`         | `AdminAuthModule` 이 없다(`assertAuthModuleRegistered`)                               |
| 권한 슬롯                  | 〃                                        | 자기 슬롯(`roles.*` · `users.*`)이 맵에 없다(`assertPermissionSlots`)                 |
| 카탈로그                   | 〃                                        | `permissionCatalog` 가 없거나 모양이 아니다                                           |
| 슬롯 키가 카탈로그 안(B12) | 〃                                        | `permissions` 맵의 어떤 키가 `catalog.isPermission` 거짓이다 — 빠진 것을 모아 한 번에 |
| 기준 시간대 [2]            | 사용자 모듈 `onModuleInit`                | `timeZone` 이 IANA 이름으로 풀리지 않는다(B15)                                        |
| 카탈로그 액션(2c)          | `AdminAuditModule.onApplicationBootstrap` | 새 `@Audit` 액션이 카탈로그에 있어야 한다 — 코어에 더하므로 저절로 통과               |

## 6. 오류 표

새 코드는 없다(⑬ K1). 문구는 `accounts/errors.ts` 의 `ACCOUNT_MESSAGES` 한 곳에 둔다(2b `AUTH_MESSAGES` 와 같은 방식). 판정 문구는 gise, 재직 문구는 hangang 을 다듬었다.

| 자리                               | 상태 · 코드                        | 문구                                                                                                                 |
| ---------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 모르는 권한 키                     | 400 `ERR_COMMON_VALIDATION`        | `issues[{ path: ['permissions', i] }]` `알 수 없는 권한입니다.`(B5)                                                  |
| 역할 이름 중복                     | 400 `ERR_COMMON_VALIDATION`        | `roleName` `이미 있는 역할 이름입니다.`                                                                              |
| 아이디 중복                        | 400 `ERR_COMMON_VALIDATION`        | `userId` `이미 있는 아이디입니다.`                                                                                   |
| 본문의 없는 역할 · 팀              | 400 `ERR_COMMON_VALIDATION`        | `roleNo` `역할을 찾을 수 없습니다.` · `teamNo` `팀을 찾을 수 없습니다.`                                              |
| 퇴사일 < 입사일                    | 400 `ERR_COMMON_VALIDATION`        | `resignDate` `퇴사일은 입사일과 같거나 뒤여야 합니다.`                                                               |
| 재입사일 ≤ 직전 퇴사일             | 400 `ERR_COMMON_VALIDATION`        | `joinDate` `재입사일은 직전 퇴사일 다음 날부터입니다.`                                                               |
| 입사일 정정 범위 밖                | 400 `ERR_COMMON_VALIDATION`        | `joinDate` `입사일은 직전 퇴사일 다음 날부터 이번 퇴사일까지입니다.`                                                 |
| 자기 계정                          | 403 `ERR_COMMON_FORBIDDEN`         | `내 계정에는 이 작업을 할 수 없습니다. 다른 관리자에게 요청하세요.`                                                  |
| 넓은 계정                          | 403 `ERR_COMMON_FORBIDDEN`         | `내 권한보다 넓은 권한을 가진 계정은 바꿀 수 없습니다.` + `details.outside`                                          |
| 넓은 역할 주기                     | 403 `ERR_COMMON_FORBIDDEN`         | `내 권한보다 넓은 역할은 줄 수 없습니다.` + `details.outside`                                                        |
| 넓은 역할 만들기 · 바꾸기 · 지우기 | 403 `ERR_COMMON_FORBIDDEN`         | `내 권한보다 넓은 역할은 만들거나 바꾸거나 지울 수 없습니다.` + `details.outside`                                    |
| 넓은 계정의 세션                   | 403 `ERR_COMMON_FORBIDDEN`         | `내 권한보다 넓은 권한을 가진 계정의 세션은 다룰 수 없습니다.` + `details.outside`                                   |
| 없는 역할 · 사용자(경로)           | 404 `ERR_NO_ROLE` · `ERR_NO_USER`  | `역할을 찾을 수 없습니다.` · `사용자를 찾을 수 없습니다.`                                                            |
| 역할 revision                      | 409 `ERR_COMMON_REVISION_CONFLICT` | `다른 관리자가 먼저 이 역할을 바꿨습니다. 새로 불러온 내용을 확인하세요.`                                            |
| 사용자 revision                    | 409 `ERR_COMMON_REVISION_CONFLICT` | `다른 관리자가 먼저 이 계정을 바꿨습니다. 새로 불러온 내용을 확인하세요.`                                            |
| 쓰는 중인 역할 삭제                | 409 `ERR_COMMON_IN_USE`            | `이 역할을 가진 계정이 있어 지울 수 없습니다. 계정의 역할을 먼저 바꾸세요.`                                          |
| 마지막 전체 권한                   | 409 `ERR_COMMON_CONFLICT`          | `이 변경 뒤에는 전체 권한을 가진 재직 관리자가 한 명도 남지 않습니다. 먼저 다른 관리자에게 전체 권한 역할을 주세요.` |
| 이미 퇴사                          | 409 `ERR_COMMON_CONFLICT`          | `이미 퇴사 처리된 사용자입니다.`                                                                                     |
| 재직 중 퇴사일 정정                | 409 `ERR_COMMON_CONFLICT`          | `재직 중인 사용자는 퇴사일을 정정할 수 없습니다.`                                                                    |
| 재직 중 재입사                     | 409 `ERR_COMMON_CONFLICT`          | `재직 중인 사용자는 재입사 처리할 수 없습니다.`                                                                      |
| 활성 구간 있음(재입사)             | 409 `ERR_COMMON_CONFLICT`          | `이미 활성 근무 이력이 있어 재입사 처리할 수 없습니다.`                                                              |
| 구간 없음(정정)                    | 409 `ERR_COMMON_CONFLICT`          | `근무 이력이 없어 입사일을 정정할 수 없습니다.` · `근무 이력이 없어 퇴사일을 정정할 수 없습니다.`                    |
| 구간 손상                          | 409 `ERR_COMMON_CONFLICT`          | `근무 이력이 손상되어(활성 구간 중복) 처리할 수 없습니다. 관리자에게 문의하세요.`                                    |
| 센티넬 행 없음                     | 500 `ERR_COMMON_INTERNAL`          | 응답은 2a 고정 문구, 로그에 `동시성 보호 설정이 없어 처리할 수 없습니다.`                                            |
| 재인증 실패 · 잠김                 | 403 `ERR_REAUTH_REQUIRED` · 423    | 2b 그대로                                                                                                            |

## 7. 의존성

- 새 의존성 없다. `node:crypto` `randomInt`(임시 비밀번호) · `Intl.DateTimeFormat`(날짜)은 Node 내장이다.
- admin-shared 에 새 export(§4-1) — 고친 뒤 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server 가 본다(CLAUDE.md). admin-ui 는 바뀌지 않는다(README 의 `implies` 배선 예시만).

## 8. 파일

```
2d-1 역할 · 판정
packages/admin-shared/src/
  permissions.ts · .test.ts                 implies · normalize
  audit.ts · .test.ts                       역할 액션 4 · 대상 role · 개수 18 · 3
packages/admin-server/src/
  options.ts                                permissionCatalog · reauth · AdminPermissionCatalog
  accounts/options.ts · .test.ts            카탈로그 · 슬롯 키 기동 검사(B12)
  accounts/account-policy.ts · .test.ts     judgeAccountCommand
  accounts/super-admin.ts · .db.test.ts     잠금 · 셈 · 판정
  accounts/errors.ts                        ACCOUNT_MESSAGES
  accounts/reauth-body.ts                   재인증 본문 조각(B5)
  auth/permission-slots.ts · permission.guard.ts · .test.ts   슬롯 둘 · "하나라도"(B13)
  audit/audit.decorator.ts 외 사용처        AuditOptions → AuditDeclaration
  database/migrations/0009_guard_locks.ts · index.ts
  database/tables/guard-locks.ts · types.ts
  roles/roles.body.ts · roles.service.ts · roles.controller.ts · roles.module.ts · move.ts
  roles/*.test.ts · roles.service.db.test.ts · roles.http.db.test.ts
  sessions/sessions.service.ts · .test.ts · sessions.http.db.test.ts   D1
  admin-server.module.ts(ADMIN_ROUTE_MODULES) · index.ts
  test-support/                             카탈로그 픽스처 · 역할 시드 · 역할 앱 부트
packages/admin-server/README.md             "역할 · 권한" 절
.changeset/admin-server-roles.md            admin-server minor · admin-shared minor

2d-2 사용자 · 계정
packages/admin-shared/src/
  users.ts · .test.ts                       사용자 계약 스키마 · calendarDateSchema
  pagination.ts · .test.ts                  queryBooleanSchema
  audit.ts · .test.ts                       사용자 액션 7 · 개수 25 · 3
  index.ts
packages/admin-server/src/
  options.ts                                timeZone
  accounts/calendar.ts · .test.ts           §5-1
  accounts/temporary-password.ts · .test.ts
  database/migrations/0002_users.ts · tables/users.ts     updateAt(U1)
  users/users.query.ts · users.body.ts · users.service.ts · users.controller.ts · users.module.ts
  users/*.test.ts · users.service.db.test.ts · users.http.db.test.ts
  roles/roles.controller.ts                 GET /roles 에 users.read
  auth/kysely-auth.repository.db.test.ts    로그인 실패가 updateAt 을 바꾸지 않음
  admin-server.module.ts · index.ts · test-support/
packages/admin-server/README.md             "사용자 · 계정" 절
.changeset/admin-server-users.md            admin-server minor · admin-shared minor

두 PR 모두: docs/01-phase0.md · docs/HANDOFF.md · CLAUDE.md
```

정본에서 가져온 파일은 머리 주석에 정본 · 바꾼 점 · 🔴(지우면 사고가 나는 이유)를 적는다(/port 규약). 플랜은 `docs/superpowers/plans/2026-10-14-admin-server-roles.md`(2d-1) · `…-admin-server-users.md`(2d-2, 2d-1 병합 뒤).

## 9. 테스트 계약

TDD — 실패하는 테스트부터. 세 층(2a D1). 구현자는 테스트를 먼저 만들고 구현 전에 돌려 RED 를 보고서에 붙인다.

### 9-1. 단위 (`pnpm check`)

- [1] `definePermissions` `implies`: 카탈로그 밖 키 · 값, `'*'`, 자기 자신은 던짐 · 순환 허용. `normalize`: `'*'` 가 섞이면 `['*']` · 연쇄 함의(`delete ⇒ write ⇒ read`) · 순환에서 멈춤 · 카탈로그 순서 · 중복 제거 · 모르는 키 버림 · 빈 배열.
- [1] 감사 카탈로그: 코어 액션 18 · 대상 3 · 라벨 수 고정. [2] 25 · 3.
- [1] `judgeAccountCommand`: §5-2 표의 모든 행 × (자기 · 덮음 · 못 덮음 · `'*'` 행위자 · `'*'` 대상), `details.outside` 내용, 순서(자기 계정이 덮기보다 먼저).
- [1] `assertSuperAdminSurvives`: 1 → 0 거부 · 0 → 0 통과 · 2 → 1 통과. 이동 구간 계산(`move.ts`): 위 · 아래 · 같음 · 범위 밖 자르기.
- [1] 슬롯: "하나라도" · 이어지지 않은 슬롯은 거짓 · `@RequirePermissions` 와 AND(2c 그대로). 옵션 해석: 카탈로그 없음 · 슬롯 키가 카탈로그 밖(모아서 한 번에).
- [1] 본문 파이프: `reauth` 켬/끔에 따른 `currentPassword` · 카탈로그 밖 키의 `issues` 경로.
- [2] 날짜: `todayIn` 경계(UTC 15:00 = KST 자정) · `startOfDayIn`(Asia/Seoul · America/New_York 서머타임 앞뒤 · 0시가 없는 날) · `effectiveResignAt` · `dateIn` · 잘못된 시간대 · 오프셋 표기 거부.
- [2] 임시 비밀번호: 길이 16 · 알파벳 밖 글자 없음 · 주입한 `pick` 으로 결정적 · 혼동 문자 없음.
- [2] 스키마: `calendarDateSchema`(2026-02-30 거부 · 윤년) · `queryBooleanSchema`(`'false'` → false, `'0'` · `''` 거부) · 사용자 행 · 본문 · 결과 파싱.

### 9-2. DB 없는 HTTP (`pnpm check`)

- 기동 검사 넷(§5-7)이 각각 멈추고 문구에 빠진 것이 이름으로 나온다. [2] 잘못된 `timeZone`.
- 쿠키 없는 역할 · 사용자 라우트는 401(가드가 DB 에 닿기 전에 끝난다).

### 9-3. 실 MariaDB (`pnpm test:db`, 파일마다 새 데이터베이스)

- [1] 0009 장: up · down · DDL(PK · 콜레이션) · 시드 행 · 스텁 검사가 장 9개를 요구.
- [1] 잔존: 셈 쿼리(`'*'` · 퇴사 · 퇴사 예정), 🔴 잠금 경합(연결 둘 — 앞 트랜잭션이 센티넬을 쥔 채 마지막 관리자 역할의 권한을 지우고 커밋하면, 기다리던 뒤 트랜잭션의 셈이 그 결과를 본다), 센티넬 행이 없으면 500.
- [1] 역할 HTTP — 3b §9 전 행: 목록 순서 · 전량, 만들기의 정규화(`'*'` 접기 · 함의 · 순서) · 모르는 키 400 · `{ roleNo }`, 수정의 revision 409 · 성공 시 +1 · `permissions` 없으면 넓은 역할 이름도 고침 · 있으면 403, 기본 역할 배타와 꺼진 역할 revision +1, 이동의 구간 재번호 · 자르기 · revision 그대로, 삭제의 쓰는 중 409 `IN_USE` · revision 409, 마지막 관리자 409(수정 · 삭제), 이름 중복 400 `issues[0].path = ['roleName']`, 재인증 켬(없음 400 · 틀림 403 `ERR_REAUTH_REQUIRED` · 맞음 200), 응답이 admin-shared `adminRoleSchema` 로 파싱.
- [1] 세션 D1: 넓은 계정 세션 끊기 403 · 같은 권한 · 좁은 계정 통과 · 본인 통과 · 404 갈래 그대로.
- [1] 감사: 역할 쓰기 넷이 행으로 남고 diff · meta 가 맞다, `reauth` 켬에서 meta 원문에 `currentPassword` 값이 없다.
- [2] 사용자 목록: 검색어의 `%` · `_` · `!` 를 글자로, 하위 팀 포함 · 제외, 상태, 무소속 계정이 보임, 대표 팀, 정렬, `filter[recursive]=false` 가 거짓.
- [2] 만들기 → 임시 비밀번호로 로그인 → `/me` 의 `isPasswordChangeRequired` → 변경 뒤 권한 · 첫 구간 `createdBy` NULL · `recordedTimezone` `'UTC'` · 아이디 중복 400 `userId` · 없는 역할 400 · 넓은 역할 403.
- [2] 수정: revision 409 · +1 · `updateAt` 이 바뀜, 역할 변경의 잔존 409, 팀 바꾸기 · 빼기, 입사일 정정 범위, 본인 이름 바꾸기 통과.
- [2] 퇴사: 어제 날짜 → 그 사용자의 다음 요청 403 `ERR_RESIGNED_USER` · 세션 폐기, 미래 날짜 → 세션 유지(DB 의 `resignAt` 을 과거로 옮기면 403), 본인 403, 넓은 계정 403, 이미 퇴사 409, 치유(구간 없는 시드 계정), 마지막 관리자 409, 효력 시각이 기준 시간대 다음 날 0시.
- [2] 정정 · 재입사: 같은 날 재입사 400 · 다음 날 통과 · 재입사 뒤 로그인.
- [2] 초기화: 임시 비밀번호로 로그인 · 대상의 다른 세션 폐기 · 잠금 풀림 · revision · `updateAt` 그대로 · 본인 403.
- [2] 잠금 해제: 잠긴 계정 → 로그인 성공 · 잠기지 않아도 200 · 본인 403.
- [2] 감사 비밀: 만들기 · 초기화 행 meta 원문에 임시 비밀번호 문자열이 없다, `reauth` 켬에서 `currentPassword` 값이 없다.
- [2] U1: 로그인 실패 · 잠금이 `users.updateAt` 을 바꾸지 않는다.

### 9-4. 리뷰 초점 (플랜 · 리뷰어에게 넘긴다)

1. 잔존 잠금이 대상 쓰기 넷 모두에서 **첫 문장**인가 — 앞에 비잠금 SELECT 가 끼면 셈이 낡는다.
2. 판정이 쓰기보다 먼저이고, 대상 역할 행이 판정 동안 잠겨 있는가(B8).
3. 날짜 → 효력 시각 계산이 한 함수만 지나는가, 날짜 열이 UTC 자정 `Date` 로 쓰이는가(B3).
4. 임시 비밀번호 · `currentPassword` 가 응답 밖(감사 · 로그 · 오류 본문)으로 새는 길이 없는가.
5. 역할 수정이 `permissions` 없는 본문에서 덮기 · 잔존을 건너뛰는가(3b §9) — 넓은 역할의 이름 고치기가 열려 있어야 한다.

## 10. 릴리스 · 문서

- **changeset**: 2d-1 `.changeset/admin-server-roles.md`, 2d-2 `.changeset/admin-server-users.md` — 둘 다 admin-server **minor** · admin-shared **minor**. 첫 줄은 쓰는 쪽이 할 일: [1] 마이그레이션 폴더에 `0009_guard_locks` 스텁 한 줄(⑨ M1), `permissionCatalog` 옵션, 슬롯 `roles.read` · `roles.manage`, `AdminRolesModule` import, `AuditOptions` → `AuditDeclaration`. [2] 슬롯 `users.read` · `users.manage`, `AdminUsersModule` import, 선택 `timeZone`, 🔴 0002 장 정정이라 이미 돌린 개발 DB 는 다시 만든다. admin-server 는 미발행이라 npm 에는 admin-shared 만 나간다(2a §1-4 #7).
- **admin-server README**: [1] "역할 · 권한" 절 — 카탈로그 정의(`implies`) · 옵션 배선 · 슬롯 맵(hangang · gise 키 예시) · `useRoleEditor` 어댑터 배선(`implies: permissions.implies` · `reauth` · `DELETE` 본문) · 권한 상승 규칙 표 · 전권자 잔존과 `guardLocks` 장 · 이동 · 기본 역할 · 남의 세션 끊기 403. [2] "사용자 · 계정" 절 — 라우트 표, 날짜와 효력 시각(기준 시간대 · "당일까지 근무" · 지금 막기 = 어제 · 시간대를 바꿔도 저장값은 그대로), 임시 비밀번호(`TemporaryPasswordDialog` `mode="create"` · `"reset"` 배선), 자기 계정 403 넷, 팀 소속(대표 팀), 확장 필드는 쓰는 쪽 라우트(⑩ X1 — NOT NULL 확장 컬럼은 DEFAULT), `TeamUserList` 어댑터 예시, 시드에서 이력 없이 만든 계정의 치유.
- **`docs/01-phase0.md`**: §3-2 의 `users` · `roles` 행을 실제 옵션으로(`permissionCatalog` · `reauth` · `timeZone` — `extensionSchema` · `hooks` 는 ⑩ X1 로 보류, `revision` · `normalize` · `superAdminSurvival` 은 고정 동작, `passwordPolicy` 는 2b 코어 옵션), §2-3 아래 "PR 2d 경계 결정(2026-10-14)" 한 단락, §8 admin-server 행.
- **`docs/HANDOFF.md` · `CLAUDE.md`**: 진행 표에 2d-1 · 2d-2. 2d-1 이 끝나면 다음은 2d-2, 2d-2 가 끝나면 다음 플랜은 2e 팀 · 약관. HANDOFF "알려진 미확인" 의 닫힌 항목: 2b 이월 넷(`resignAt` 효력 시각 계산 — ⑤ Z1, `revision` — ⑧ V1, 재인증 — ⑦ R1, `updateAt` — ⑧ U1), 2c 이월 넷(D1 · 슬롯 · 액션 · 이름 정리).
- **쓰는 쪽 스모크**(`%TEMP%\akss`): 두 PR 끝마다 — tarball 설치 → 스텁 9장 → 시드(러너 `hashPassword` · `'*'` 역할) → 기동 → [1] 역할 CRUD · 이동 · 마지막 관리자 409 · 감사 행, [2] 사용자 만들기 → 임시 비밀번호 로그인 → 강제 변경 · 초기화 · 퇴사 · 감사 행.

## 11. 비범위 · 보류

- 사용자 확장 필드 · 트랜잭션 훅 → ⑩ X1(필요해지면 `users.extension` 을 하위 호환으로).
- 팀 모듈(트리 · 이동 · 삭제)과 팀 변경의 잔존 영향 → 2e · 2f. IP 층을 넣은 "도달 가능한" 전권자 셈 → 2f(hangang `applicableIpLayer`).
- 여러 팀 소속 쓰기(⑨ T1 은 팀 하나), 퇴사 취소 라우트(정본 어디에도 없다 — 미래 퇴사는 퇴사일 정정으로 미룬다).
- 역할 단건 `GET /roles/:roleNo`(화면이 쓰지 않는다), 역할의 `userCount`(gise — 쓰는 쪽이 `.extend`).
- scope 축(crm · axion `scopes`) · 할당 가능 역할(axion `roleAssignableMap`) → B.
- 사용자 물리 삭제 — 네 정본 모두 없다.
- 계정 수 많을 때의 목록 성능(대표 팀 · 마지막 구간 상관 서브쿼리) — 관리자 규모에서는 문제없다. 필요하면 인덱스 · 조인 모양을 바꾼다.

## 12. 플랜에서 먼저 확인할 위험

플랜을 쓰기 전에 스크래치(`%TEMP%` 짧은 경로)와 실 MariaDB 11.4 에서 확인하고 결과를 §14 R1 에 적는다.

1. **카탈로그 타입 할당**: `definePermissions({ … }, { implies })` 결과가 `AdminPermissionCatalog`(좁힌 `Pick`) 자리에 tsc 로 들어가는가 — `permissionListSchema` 의 `ZodType` 공변성 · `isPermission` 타입 술어(2c R3 함정).
2. **`JSON_CONTAINS(permissions, '"*"')`** 가 JSON 별칭(`longtext … CHECK (json_valid)`) 열에서 되는가, `['a','*']` · `['*']` · `[]` · `['a*']` 를 맞게 가르는가.
3. **잠금 순서**: (a) 연결 A 가 센티넬 행을 쥔 채 `'*'` 역할 권한을 바꾸고 커밋하면, 기다리던 연결 B 의 셈이 그 결과를 보는가 (b) 사용자 쓰기의 `users ⋈ roles … FOR UPDATE` 가 두 테이블 행을 다 잠그는가 (c) 그 잠금과 역할 수정(센티넬 → 역할 행)이 교착하는가.
4. **기본 역할 경합**: 연결 둘이 동시에 `isDefault = true` 역할을 만들면 끝에 기본 역할이 하나인가, 아니면 교착(→ 409)인가 — 둘이 남는 결과만 아니면 된다.
5. **날짜**: 프로세스 TZ = UTC 에서 UTC 자정 `Date` 를 `DATE` 열에 쓰고 읽으면 같은 날짜인가. `Intl` 로 `startOfDayIn` 을 Asia/Seoul · America/New_York · 0시가 없는 날(America/Sao_Paulo 2018-11-04)에 맞게 낼 수 있는가.
6. **중복 이름 판정**: 트랜잭션 안 `ER_DUP_ENTRY` 의 메시지에 `uq_roles_role_name` 이 실리는가(`logParam: false` 에서도 — 2a R3), `runWriteTransaction` 이 `mapError` 로 감싼 뒤 `cause` 로 그 값을 읽을 수 있는가.
7. **본문 스키마**: `adminRoleCreateSchema.extend({ permissions: catalog.permissionListSchema })` 의 실패가 `issues[{ path: ['permissions', i] }]` 를 내는가, 2a 검증 파이프의 한국어 로케일 문구.

## 13. 선행 문서 정정

- **2a 스펙 §1-3 2d 행** "`UsersModule` · `RolesModule`" → `AdminUsersModule` · `AdminRolesModule`, "`permissions.normalize`" → admin-shared `catalog.normalize`(① C1). 2a 스펙 본문은 고치지 않고 이 절이 이긴다.
- **2a 장 주석은 그대로다**(B2) — `recordedTimezone` "기록 시점 프로세스 TZ. 패키지는 항상 UTC" · `createdBy` "최초 입사 행은 NULL". 바뀌는 장은 0002 의 `updateAt`(⑧ U1)뿐이다.
- **2b B9** "비밀번호 변경이 `users.revision` 의 충돌 대상인지는 2d 가 정한다" → 올리지 않는다(⑧ V1).
- **2c ⑪ D1** → §5-5 로 닫는다.
- **결정 문서 공통 결정 4** "UNIQUE 위반 → `ERR_DUPLICATE_ROLE_NAME` · `ERR_DUPLICATE_USER_ID`" → B1(400 필드 검증 오류, 3b D5 그대로).
- **Phase 0 §3-2 표** · **HANDOFF** · **CLAUDE.md**: §10 대로.

## 14. 구현 중 정정

§12 의 확인 결과와 구현 · 리뷰에서 바뀐 것을 `R<n>` 으로 더한다.

- **R1 — §12 일곱 위험 실측(2026-10-14, 플랜 전, MariaDB 11.4 · Node 24 · 패키지 DB 하네스의 임시 프로브 — 지웠다).** 설계를 바꾼 것은 7(문구)과 5(오프셋 거부) 둘이다.
  1. `definePermissions` 결과(`extraValues` 있음 · 없음)가 `Pick<PermissionCatalog<Record<string, string>, string>, 'ALL_PERMISSION_VALUES' | 'isPermission' | 'permissionListSchema'>` 에도, 넓은 `PermissionCatalog<Record<string, string>, string>` 에도 tsc 오류 없이 들어간다. 2c R3 의 함정(`AuditCatalog` 의 기본 타입 인자)은 여기서는 생기지 않는다. 새 멤버 `implies` · `normalize` 는 읽기 전용 표 · 반환 위치라 공변이다.
  2. `JSON_CONTAINS(permissions, '"*"')` 는 JSON 별칭 열에서 원소 `'*'` 만 가른다 — `['a', '*']` · `['*']` 참, `[]` · `['a*']` · `['x']` 거짓. 바인딩 값 · 정적 리터럴 모두 같다. hangang 의 `LIKE '%"*"%'` 로 내리지 않는다.
  3. (a) 연결 A 가 센티넬 행을 쥔 채 마지막 `'*'` 역할의 권한을 바꾸고 커밋하면, 센티넬을 기다리던(≈ 0.4초) 트랜잭션 B 의 셈은 그 결과(0)를 본다 — 잠금이 첫 문장이면 읽기 뷰가 그 뒤에 만들어진다. (b) `users ⋈ roles … FOR UPDATE` 는 두 테이블의 행을 다 잠근다(다른 연결의 두 UPDATE 가 `ER_LOCK_WAIT_TIMEOUT`). (c) 역할 수정(센티넬 → 셈 → 역할 행 잠금)과 초기화(사용자 ⋈ 역할 잠금 → 사용자 · 세션 UPDATE)는 어느 쪽이 먼저여도 교착하지 않는다.
  4. 연결 둘이 동시에 "다른 기본 역할 끄기 → 기본 역할 INSERT" 를 하면 뒤의 UPDATE 가 앞 커밋을 기다렸다가 그 행까지 끈다 — 끝에 기본 역할은 하나(뒤의 것)다. 교착 · 오류 없음.
  5. 프로세스 TZ = UTC 에서 UTC 자정 `Date` 를 `DATE` 열에 쓰고 읽으면 같은 날짜다(윤일 포함, `cast(… as char)` 도 같은 문자열). `Intl.DateTimeFormat.formatToParts` 두 번 보정으로 `startOfDayIn` 이 Asia/Seoul · America/New_York(서머타임 앞뒤) · 0시가 없는 날(America/Sao_Paulo 2018-11-04 → `03:00Z` = 현지 01:00)에 맞다. 🔴 Node 24 의 `Intl` 은 `'+09:00'` 같은 오프셋 시간대를 **받아들인다** — B15 의 "오프셋 표기 거부" 는 `Intl` 이 아니라 IANA 모양 정규식(hangang `isValidTimeZone`)이 해야 한다.
  6. 트랜잭션 안 `ER_DUP_ENTRY`(1062)의 메시지는 `Duplicate entry 'DUP6' for key 'uq_roles_role_name'` 이다(`logParam: false` 에서도 키 이름이 실린다 — 2a R3). `runWriteTransaction` 이 `mapError` 로 감싼 뒤에도 `cause.message` 로 읽힌다 — 서비스는 트랜잭션 밖에서 `cause` 를 보고 B1 의 필드 검증 오류로 바꿀 수 있다.
  7. `adminRoleCreateSchema.extend({ permissions: catalog.permissionListSchema })` 의 실패는 `issues[{ path: ['permissions', 1] }]` 로 맞게 나오지만, 문구가 zod 한국어 로케일의 열거형 문구로 **카탈로그 값 전부를 나열**한다("잘못된 옵션: "org.users:read"또는 …"). 키가 수십 개면 읽을 수 없다 → B5 를 고쳤다: 원소마다 `catalog.isPermission` 으로 거르고 `알 수 없는 권한입니다.` 를 낸다. 그래서 `AdminPermissionCatalog` 에서 `permissionListSchema` 를 뺐다(B4).
- **R2 — 판정 파일은 `accounts/account-command.ts` 다(§8 정정, 2d-1 플랜 작성 2026-10-14).** 2b 의 `auth/account-policy.ts`(`isResigned` · `isSessionExpired`)와 이름이 겹친다.
- **R3 — 역할 · 사용자 모듈은 `AdminReauthService` 를 `@Optional()` 로 받고, 해석된 계정 설정은 모듈 provider `ADMIN_ACCOUNTS_CONFIG` 가 `resolveAccountsConfig` 로 만든다(§4-4 보강, 플랜).** 인증 모듈이 빠진 앱이 DI 해석 오류가 아니라 `assertAuthModuleRegistered` 의 문구로 멈추게 한다(2c R2 와 같은 이유). 카탈로그 없음 · 슬롯 키 오타(B12)는 그 팩토리가 기동에서 멈춘다.
- **R4 — 세션 권한 상승 검사의 조회 둘(`findLiveOwner` · `findUserTarget`)은 `AdminSessionStore` 에 두고, `AdminSessionsService` 는 `KYSELY` 를 받지 않는다(§5-5 보강, 플랜).** 단위 테스트가 가짜 저장소로 판정 갈래를 잰다. 역할 권한 열이 깨졌으면 인증 가드처럼 빈 권한으로 본다(그 계정은 지금 아무 권한도 없다).
- **R5 — 2d-1 최종 리뷰 이월 여섯 건(2026-10-14, 결정 문서 HTML "PR 2d-2 이월 결정" — 모두 권장안).** 2d-2 에서 닫는다.
  1. **M1 옛 키 판정 → 판정은 저장된 그대로(M1-B).** 카탈로그에서 빠진 키 · 나중에 더한 `implies` 때문에 좁은 관리자가 그 역할(2d-1)과 그 역할의 계정(2d-2 사용자 쓰기 전부)을 다루지 못하는 것은 fail-closed 로 둔다. 판정 전에 카탈로그 밖 키를 거르면, 쓰는 쪽 코드가 지운 키로 아직 무언가를 막을 때 좁은 관리자가 그 계정의 비밀번호를 초기화하고 로그인해 그 키를 얻는다 — 서버는 그런 코드를 찾을 수 없다. 복구 절차("`'*'` 관리자가 그 역할 · 관리자 역할을 한 번 다시 저장한다 — 화면이 옛 키를 버리고 `normalize` 가 함의를 닫는다")를 README "사용자 · 계정" 절에 적는다. 코드는 바뀌지 않는다.
  2. **M2 → 쓰기의 결과는 그 트랜잭션에서 읽는다(M2-A).** 사용자 쓰기는 응답 `item` · 감사 `after` 를 같은 트랜잭션 안에서 읽는다. 역할 수정도 커밋 뒤 `findOne` 을 트랜잭션 안으로 옮긴다(§5-4 "커밋 뒤 다시 읽어" 정정).
  3. **M3 → 감사 meta `clearedDefaults`(M3-A).** ⑫ D1 로 꺼진 다른 기본 역할의 번호를 역할 만들기 · 수정 감사 meta 에 `clearedDefaults: [roleNo…]` 로 싣는다(없으면 키 없음). 끄기 전에 `SELECT roleNo … WHERE isDefault = 1 FOR UPDATE`.
  4. **M6 → admin-shared `roleNameSchema` 에 `.trim()`(M6-A).** `z.string().trim().min(1).max(64)` — 사용자 스키마(§4-1 `userId` · `userName` trim)와 한 규칙. 필드 수준 검사라 쓰는 쪽 `.omit()` · `.extend()` 를 막지 않는다(플랜 전 실측). admin-shared minor(이 PR 의 changeset).
  5. **displayOrder 동률 → 만들기의 `MAX(displayOrder)` 에 `FOR UPDATE`(DO-A).** 동시 만들기가 줄을 서 순서 값이 겹치지 않는다. 동시 만들기 DB 테스트를 둔다.
  6. **스냅샷 격리 → ON · OFF 경합 DB 테스트 + 쓰기 안 읽기는 모두 잠금 읽기(SI-A).** 잔존으로 감싼 사용자 쓰기는 셈(비잠금)이 읽기 뷰를 먼저 연다. ON(11.6.2+ 기본)에서는 셈 뒤 · 대상 잠금 전에 대상 행이 바뀌면 잠금 읽기가 `ER_CHECKREAD` → 409 다시 시도, OFF(11.4 기본)에서는 잠금을 기다린 뒤의 **비잠금** 읽기가 낡은 뷰를 본다(겹친 재입사의 활성 구간을 못 봐 치유가 활성 구간 둘을 만든다). 그래서 🔴 사용자 쓰기 트랜잭션 안의 읽기(대상 · 새 역할 · 팀 · 재직 이력)는 잔존 셈을 빼고 모두 `FOR UPDATE` 다. 테스트는 공개 서비스 메서드(퇴사)를 거친다.
- **R6 — 스펙 글자 정정 셋(2026-10-14, 같은 결정 문서에서 승인).**
  1. **즉시 퇴사 뒤 그 사용자의 다음 요청은 401 `ERR_INVALID_TOKEN` 이다(§9-3 정정).** 같은 트랜잭션에서 세션을 끊으므로 인증 가드가 세션 단계에서 멈춘다(2b 순서). 403 `ERR_RESIGNED_USER` 는 그 사용자의 **로그인**과, 미래 퇴사일을 DB 에서 과거로 옮긴 뒤의 요청에서 잰다.
  2. **`users.updateAt` 은 DB 시계로 쓴다(§5-6 정정).** 만들기는 기본값(`createAt` 과 같은 문장 시각 — 흐름의 "`updateAt = now`" 를 지운다), 수정 · 퇴사 · 퇴사일 · 재입사는 `updateAt = CURRENT_TIMESTAMP`. 테이블 타입 `ColumnType<Date, never, Date>` 와 맞고, 컨테이너 시계가 앞서도 수정일이 생성일보다 앞서지 않는다.
  3. **하위 팀 포함 필터는 직접 소속을 따로 본다(§5-6 · B9 보강).** `m.teamNo = :teamNo OR m.teamNo IN (SELECT descendantNo FROM teamClosure WHERE ancestorNo = :teamNo)` — `teamClosure` 의 자기 행(depth 0)에 기대지 않는다. 팀 모듈(2e) 전이라 closure 를 손으로 시드하는 쪽이 자기 행을 빠뜨려도 직접 소속이 사라지지 않는다.
