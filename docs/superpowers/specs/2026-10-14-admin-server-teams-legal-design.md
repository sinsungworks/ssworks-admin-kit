# admin-server 팀 · 약관 설계 (Phase 2 PR 2e)

작성일: 2026-10-14 · 상태: 확정(구현 전) · 선행: 2a 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1(Phase 2 지도 · §1-3 의 2e 행 · §1-4 공통 결정) · F10 · §14 R3(UNIQUE 이름은 DB 에서 snake_case), 2c 스펙 `docs/superpowers/specs/2026-10-14-admin-server-sessions-audit-design.md` ① P1(슬롯) · ⑨ M1(모든 장 필수), 2d 스펙 `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` §5-3(잔존 센티넬) · B7 · B13 · §11 · §14 R5-6 · R6-3 · R7 · R9 · R10, 3d 스펙 `docs/superpowers/specs/2026-10-07-admin-ui-teams-design.md` §4-1 · §4-2 · §9, 3e 스펙 `docs/superpowers/specs/2026-10-07-admin-ui-legal-design.md` §4-2 · §9, `docs/01-phase0.md` §3-2 · §4, `docs/HANDOFF.md` "PR 2c 가 넘긴 것" · "PR 2d-2 최종 리뷰가 넘긴 것"

이 문서는 2e 의 범위만 쓴다. Phase 2 지도 · 공통 결정은 2a 스펙 §1, 인증 · 가드는 2b, 슬롯 · 감사는 2c, 계정 판정 · 잔존 · 사용자 쓰기는 2d 스펙이 그대로 유효하다. 2e 는 **한 스펙 · 두 PR** 이다(⓪ S2) — 각 줄의 **[1]** 은 2e-1 팀, **[2]** 는 2e-2 약관이다.

## 1. 목표

2a 스펙 §1-3 의 2e 행:

> `TeamsModule`(3d §9) · admin-shared 에 `ERR_TEAM_HAS_MEMBERS` · `ERR_TEAM_MOVE_CYCLE` · 약관 모듈(3e §9, `legalDocuments` 장, 종류 카탈로그 옵션) — 끝 상태: 3d · 3e §9 표의 모든 행

**2e-1 팀** (브랜치 `feat/admin-server-teams`) — 끝 상태, 실 MariaDB HTTP 계약으로:

- 3d §9 의 모든 행: 트리 `{ items }`(루트 여럿 · 없으면 `[]`), 만들기 `{ teamNo }` · 이름 중복 409 `ERR_DUPLICATE_TEAM_NAME` · 없는 상위 팀 404 `ERR_NO_TEAM`, 이름 바꾸기 `{}`, 하위 팀째 지움 · 소속이 있으면 409 `ERR_TEAM_HAS_MEMBERS`, 이동 `{ parentTeamNo, beforeTeamNo }` → 서버가 `displayOrder` 를 셈 · 순환 400 `ERR_TEAM_MOVE_CYCLE` · 기준 형제 검사 400.
- 팀 쓰기 넷은 동시에 와도 closure 가 깨지지 않는다(① G1). 팀 삭제와 사용자 만들기 · 수정이 겹치면 교착 없이 줄을 서거나 409 · 400 으로 끝난다(② D1).
- 2d-2 이월 셋: `replaceTeam` 같은 팀 건너뛰기, `whileHeld` 잠금 대기 폴링 · 스냅샷 세션 단언, `lockTeam` 의 `forUpdate` 회귀 테스트.

**2e-2 약관** (2e-1 · 2d-3 병합 뒤 새 브랜치 `feat/admin-server-legal`) — 끝 상태:

- 3e §9 의 모든 행: 현재본 `{ item | null }`(미발행 200), 이력 최신순 전량(본문 없음), 단건(없으면 404), 발행 `{ legalDocNo, contentHash }` · 기준 판이 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT` · 시행본과 같은 본문 409 `ERR_COMMON_CONFLICT`.
- 같은 종류 동시 발행 둘은 하나만 되고 하나는 409 `REVISION_CONFLICT` 다(⑩ L1). `contentHash` 는 서버만 셈한다. append-only.

쓰는 쪽은 2e-1 뒤 장 스텁 한 줄(`0010_team_tree_lock`) · 팀 슬롯 둘 · `AdminTeamsModule` import 로 admin-ui `useTeamTree` 를 실서버에 붙이고, 2e-2 뒤 장 스텁 한 줄(`0011_legal_documents`) · 약관 슬롯 둘 · `legal.kinds` 옵션 · `AdminLegalModule` import 로 `useLegalDocuments` 를 붙인다.

PR 순서: 2e-1 → **2d-3 계정 정리**(2d-2 이월 중 사용자 · 역할 쪽 — §2-1 이월 표) → 2e-2 → 2f.

## 2. 결정

### 2-1. 경계 결정 (2026-10-14, 결정 문서 HTML — 모두 권장안)

| #                  | 확정                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⓪ 분할             | **S2** — 한 스펙 · 두 PR. 2e-1 팀(`feat/admin-server-teams`) → 2e-2 약관(`feat/admin-server-legal`). 2e-2 플랜은 2e-1 병합 뒤에 쓴다                                                                          |
| ① 팀 쓰기 직렬화   | **G1** — guardLocks 행 `teamTree`. 팀 쓰기 넷(만들기 · 이름 바꾸기 · 이동 · 삭제)이 트랜잭션 첫 문장에서 그 행을 `FOR UPDATE` 로 잡는다. 사용자 쓰기(`lockTeam`)는 잡지 않는다                                |
| ② 삭제의 소속 셈   | **D1** — 가드 → 대상 팀 → 하위 팀 행(closure ⋈ teams) `FOR UPDATE` → 소속 셈(**비잠금**, 그 트랜잭션의 첫 비잠금 읽기) → `DELETE teams`(CASCADE)                                                              |
| ③ 삭제를 막는 소속 | **M1** — 퇴사자 소속도 센다(hangang). 409 `ERR_TEAM_HAS_MEMBERS` + `details.memberCount`(계정 수)                                                                                                             |
| ④ closure 자기 행  | **C1** — 만들기가 자기 행(depth 0)을 넣되, 패키지 코드는 그 행에 기대지 않는다. 이동은 앱이 셈한 쌍으로 closure 를 지우고 넣는다                                                                              |
| ⑤ displayOrder     | **O1** — 만들기 = 형제 `MAX + 1`(형제가 없으면 0). 이동 = 받는 쪽 형제 묶음을 (`displayOrder`, `teamNo`) 순으로 읽어 대상을 끼우고 0..n-1 로 다시 매긴다(바뀐 행만 UPDATE). 떠난 묶음은 빈 번호를 남긴다      |
| ⑥ 권한 슬롯        | **P1** — [1] `teams.read` · `teams.manage`, [2] `legal.read` · `legal.publish`. `GET /teams/tree` 는 `teams.read` ∨ `users.read`(사용자 폼의 팀 고르기 — 2d ⑪ L1 과 같은 이유)                                |
| ⑦ 팀 감사          | **A1** — 액션 `org.team.create · update · delete · move`(hangang 이름 · 라벨), 대상 `team`. 삭제는 diff before `{ teamName, parentTeamNo }` + `meta.descendants: [{ teamNo, teamName }]`(하위 팀이 있을 때만) |
| ⑧ 팀 이름 중복     | **N1** — 409 `ERR_DUPLICATE_TEAM_NAME`(3d §9 계약 그대로). 사전 검사 없이 제약 이름 `uq_teams_name` 으로 판정한다                                                                                             |
| ⑨ 약관 종류        | **K1** — 코어 옵션 `legal: { kinds: ['TERMS', 'PRIVACY'] }`(문자열 배열). 기동에서 검증                                                                                                                       |
| ⑩ 약관 발행 직렬화 | **L1** — guardLocks 행 `legalPublish` 하나(모든 종류). 트랜잭션 첫 문장                                                                                                                                       |
| ⑪ 가드 행 시드     | **A1** — 새 장. [1] `0010_team_tree_lock`(시드 한 줄), [2] `0011_legal_documents`(표 + `legalPublish` 시드). 스텁 9 → 10 → 11                                                                                 |
| ⑫ 약관 본문 크기   | **J1** — `jsonLimit` 기본 1mb 그대로. README 에 413 과 `configureAdminApp(app, { jsonLimit: '4mb' })` 를 적는다                                                                                               |

**PR 2d-2 최종 리뷰가 넘긴 아홉 건**(같은 결정 문서 — 모두 권장안):

| #   | 건                                                                                | 어디서                                                                                              |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | (우선) 잔존 순서 재배치 — "센티넬 → 대상 잠금 → 셈"                               | **2d-3**(2e-1 다음 작은 PR)                                                                         |
| 2   | 역할 전수 스캔 잠금(`MAX … FOR UPDATE` · `clearOtherDefaults`)                    | **2d-3**(인덱스 또는 순서 잠금 행을 검토)                                                           |
| 3   | 2b `rotate` 잠금 순서(users 먼저 FOR SHARE) · 로그인 TOCTOU                       | **2f**(인증 경로를 다시 연다)                                                                       |
| 4   | `whileHeld` 300ms 고정 대기 → 잠금 대기 폴링, 스냅샷 ON 테스트의 풀 데우기 · 단언 | **2e-1**(첫 Task — 경합 테스트가 많이 는다)                                                         |
| 5   | `timeZone` 옵션 정규화(`resolvedOptions().timeZone`)                              | **2d-3**                                                                                            |
| 6   | `replaceTeam` 같은 팀 건너뛰기                                                    | **2e-1**                                                                                            |
| 7   | 초기화 `revokedCount` 의 `liveOnly`                                               | **2d-3**                                                                                            |
| 8   | 테스트 빈틈                                                                       | `lockTeam` 의 `forUpdate` 회귀는 **2e-1**(삭제 경합 테스트가 잰다), 나머지는 **2d-3**               |
| 9   | 퇴사 예정 본인의 자기 재입사(B16)                                                 | **2d-3** — 본인 재입사를 403 으로 막는다(SF1 의 자기 퇴사일 정정 403 과 효과가 같아서). 2d B16 정정 |

### 2-2. 공통 결정 (정본이 같거나 계약이 정한 것 — 이의 없음)

1. **슬롯 넷.** [1] `teams.read` · `teams.manage`, [2] `legal.read` · `legal.publish` — `AdminPermissionSlot` 은 아홉 → 열하나 → 열셋.
2. **감사 액션.** [1] `org.team.create` "팀 생성" · `org.team.update` "팀 수정" · `org.team.delete` "팀 삭제" · `org.team.move` "팀 이동", 대상 `team` "팀". [2] `setting.legal.publish` "약관 발행", 대상 `legalDocument` "약관". 코어 액션 25 → 29 → 30, 대상 3 → 4 → 5. 라벨 · 개수 테스트를 함께 고친다. 쓰기 라우트는 전부 `@Audit`.
3. **팀 쓰기는 재인증 · revision 이 없다**(3d §9 — 세 정본 모두 같음). `reauth: true` 여도 팀 라우트는 `currentPassword` 를 받지 않는다.
4. **새 오류 코드 둘**(admin-shared, minor): `ERR_TEAM_HAS_MEMBERS` 409 · `ERR_TEAM_MOVE_CYCLE` 400. 그 밖은 코어 코드다 — `ERR_NO_TEAM` 404 · `ERR_DUPLICATE_TEAM_NAME` 409 · `ERR_COMMON_VALIDATION` 400 · `ERR_COMMON_NOT_FOUND` 404 · `ERR_COMMON_REVISION_CONFLICT` · `ERR_COMMON_CONFLICT` 409.
5. **응답 모양**(3d · 3e §9). 팀: 트리 `{ items }` · 만들기 201 `{ teamNo }` · 이름 · 이동 · 삭제 `{}`. 약관: 현재본 `{ item }` · 이력 `{ items }` · 단건은 **문서 그대로**(3e §9 · admin-ui README `api.get<AdminLegalDocument>` — `{ item }` 이 아니다) · 발행 201 `{ legalDocNo, contentHash }`.
6. **트리 읽기**는 `teams ⟕ teamClosure(depth = 1)` 한 번으로 평면 목록을 읽어 메모리에서 조립한다(hangang `findAll` 모양 — 자기 행이 필요 없다). 형제는 (`displayOrder`, `teamNo`) 오름차순 — admin-ui `sortTeamTree` 의 "같으면 받은 순서" 와 맞는다.
7. **이동 검사**(3d §9): 없는 팀 404, 없는 상위 팀 404 `ERR_NO_TEAM`, 상위 팀이 자기 자신 · 하위 팀이면 400 `ERR_TEAM_MOVE_CYCLE`, `beforeTeamNo` 가 그 상위 팀의 자식이 아니면 400 `issues[{ path: ['beforeTeamNo'] }]`, `beforeTeamNo === teamNo` 도 400 `beforeTeamNo`. `parentTeamNo: null` 은 최상위로 옮기기다(루트 여럿).
8. **약관 표**(gise 006 바탕): `legalDocNo` bigint unsigned PK · `kind` varchar(32) `ascii_bin` · `body` mediumtext · `contentHash` char(64) `ascii_bin` · `publishedAt` timestamp DB 시계(DEFAULT `CURRENT_TIMESTAMP`, 초 단위) · `publishedByUserNo` bigint unsigned NULL + FK `ON DELETE SET NULL`. 인덱스 (`kind`, `publishedAt`), UNIQUE · CHECK 없음(gise — 종류 폐집합의 정본은 옵션).
9. **시행본** = 종류별 (`publishedAt` DESC, `legalDocNo` DESC) 첫 행. 초 단위라 같은 초 발행이 실제로 난다(gise 🔴). 이력 · 단건도 같은 두 키. 이력은 `LEFT JOIN users`(발행자 SET NULL), 본문 없음. `publishedByUserName` 은 조인으로 파생(`users.userName`).
10. **발행 검사 순서**(3e §9): 기준 판 ≠ 지금 시행본 번호(없으면 null) → 409 `ERR_COMMON_REVISION_CONFLICT`, 그다음 시행본과 같은 해시 → 409 `ERR_COMMON_CONFLICT` "이전 버전과 내용이 같습니다."(두 정본 공통 문구). 해시는 서버만 `sha256(body, 'utf8')` hex 소문자.
11. **append-only.** 약관 수정 · 삭제 라우트와 서비스 메서드가 없다. 소스에 `updateTable('legalDocuments')` · `deleteFrom('legalDocuments')` 가 없음을 재는 정적 테스트(gise `legal-append-only.test.ts`).
12. **약관 감사 meta** `{ kind, baseLegalDocNo, contentHash, length }` + 대상 `legalDocNo`. 🔴 본문을 싣지 않는다 — 감사 행은 가방에 붙인 값만 기록하고 요청 본문을 담지 않는다(2c 인터셉터, 2026-10-14 확인).
13. **약관 라우트 순서**: 고정 경로 `current` 를 `:legalDocNo` 보다 먼저 선언한다(gise). 모르는 종류(쿼리 · 본문) 400.
14. **공개 조회**(`GET legal/:kind` → `bodyHtml: renderMarkdown(body)`)는 쓰는 쪽 몫(B, 3e §9). README 에 예시만.
15. **계약 스키마는 admin-shared 에 이미 있다**(3d §4-1 · 3e §4-2). 서버는 그 스키마로 본문을 검증하고, 종류는 옵션으로 좁힌다(`adminLegalPublishSchema.extend({ kind: z.enum(kinds) })`).

### 2-3. 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | 🔴 **전역 잠금 순서**(아래 §5-1 표). 한 트랜잭션은 이 순서의 부분열만 잡고, guardLocks 행은 한 트랜잭션에 하나다(0009 장 주석). 팀 쓰기는 users · roles 를 잠그지 않고, 사용자 쓰기는 `teamTree` · `teamClosure` 를 잠그지 않는다 — 두 쪽이 만나는 곳은 팀 행 하나다                                                                                                                                                                                                                                                                          |
| B2  | **가드 행 잠금 함수를 하나로.** `database/guard-locks.ts` 의 `lockGuardRow(trx, lockName)` — 행이 없으면 500 `ERR_COMMON_INTERNAL` `guardMissing`(2d fail-loud). `accounts/super-admin.ts` 의 `lockSuperAdminGuard` 는 그것을 부른다(동작 · 문구 그대로). 이름 상수 `GUARD_LOCK_TEAM_TREE = 'teamTree'` [1] · `GUARD_LOCK_LEGAL_PUBLISH = 'legalPublish'` [2]. 장은 리터럴로 넣고 같은 값인지는 DB 테스트가 잰다(0009 와 같은 방식)                                                                                                           |
| B3  | **팀 쓰기의 읽기는 모두 잠금 읽기**(`FOR UPDATE`) — 예외는 ② D1 의 소속 셈 하나다. 가드 아래라 비잠금이어도 구조는 최신이지만, 비잠금 읽기가 하나라도 셈보다 앞서면 읽기 뷰가 먼저 열려 셈이 낡는다(D1 이 깨진다). 규칙을 하나로 둔다. closure 의 gap 잠금은 가드 아래라 다른 팀 쓰기와 다투지 않는다                                                                                                                                                                                                                                         |
| B4  | 🔴 **소속을 더하는 길은 모두 그 팀 행을 먼저 잡는다** — D1 이 기대는 불변식. 사용자 만들기 · 수정은 `lockTeam`(X), 그 밖의 `INSERT · UPDATE teamUserMap` 은 FK 검사가 부모 팀 행에 S 잠금을 건다(InnoDB). 서브트리 팀 행을 X 로 쥔 뒤에는 새 소속이 생기지 않고, 그 뒤 처음 여는 읽기 뷰는 기다리는 사이 커밋된 소속을 본다. 쓰는 쪽이 FK 를 끄고 넣는 길(`foreign_key_checks = 0`)은 보호 밖이다                                                                                                                                             |
| B5  | **이름 바꾸기도 가드를 잡는다** — 팀 행을 바꾸는 쓰기(이름 · 순서 · 지움)가 모두 줄을 서므로, 가드 뒤의 잠금 읽기 · UPDATE 가 스냅샷 격리 ON 에서 1020 을 만나지 않는다(그 사이 남이 바꾼 팀 행이 없다). 사용자 쓰기의 `lockTeam` 은 행을 바꾸지 않는다                                                                                                                                                                                                                                                                                       |
| B6  | **closure 갱신은 앱이 셈한 쌍으로**(④ C1). 만들기: `(새, 새, 0)` + 상위 팀과 그 조상 각각 `(조상, 새, 깊이 + 1)`. 이동(상위 팀이 바뀔 때): 서브트리 = 대상 ∪ `ancestorNo = 대상 ∧ depth > 0`, 옛 조상 = `descendantNo = 대상 ∧ depth > 0` → `DELETE … WHERE descendantNo IN 서브트리 AND ancestorNo IN 옛 조상` → 새 조상(새 상위 팀 깊이 0 ∪ 그 조상) × 서브트리 쌍을 깊이 `a.depth + d.depth + 1` 로 한 번에 INSERT. 자기 행은 지우지도 다시 넣지도 않는다(서브트리 안 쌍은 그대로 둔다) — 자기 행이 없는 시드는 없는 채로 남고 결과가 같다 |
| B7  | **삭제는 `DELETE teams WHERE teamNo IN (대상 ∪ 하위 팀)` 하나** — closure · 소속은 FK CASCADE(장 0004 · 0005). 하위 팀 목록은 `ancestorNo = 대상 ∧ depth > 0` 이고 대상은 따로 넣는다(자기 행에 기대지 않는다 — hangang 은 자기 행이 없으면 대상이 남았다)                                                                                                                                                                                                                                                                                    |
| B8  | **이동 계획은 순수 함수**(`teams/move.ts` `planTeamMove`). 입력: 받는 형제(대상 제외, (`displayOrder`, `teamNo`) 순) · 대상 · `beforeTeamNo` · 지금 형제 순서(같은 상위 팀일 때). 출력: 새 순서 · 바꿀 `{ teamNo, displayOrder }` 목록 · 대상의 새 값 · 제자리 여부. 🔴 같은 상위 팀이고 팀 순서가 바뀌지 않으면 제자리 — 쓰지 않는다(값이 빈 번호여도 다시 매기지 않는다 — 감사 before = after)                                                                                                                                              |
| B9  | **트리 조립은 순수 함수**(`teams/tree.ts` `buildTeamTree`). 행 순서 그대로 자식을 붙인다(쿼리가 정렬). closure 가 손상됐으면(같은 팀의 깊이 1 조상 둘 · 상위 팀이 목록에 없음 · 순환) `Logger.warn` 을 남기고, 깊이 1 조상 둘이면 작은 번호를 쓰며, 루트에서 닿지 않는 팀은 내지 않는다. 무한 반복이 없다                                                                                                                                                                                                                                     |
| B10 | **이동의 검사 순서**: 트랜잭션 밖 `beforeTeamNo === teamNo` 400 → 가드 → 대상 잠금(404) → 지금 상위 팀 · 서브트리 잠금 읽기 → 상위 팀이 대상 · 서브트리 안이면 400 순환 → 상위 팀 잠금(404) → 받는 형제 잠금 읽기 → `beforeTeamNo` 가 형제가 아니면 400 → 계획 → (상위 팀이 바뀌면) closure 갱신 → 형제 UPDATE                                                                                                                                                                                                                                |
| B11 | **삭제의 감사 하위 팀 목록**은 하위 팀 잠금 읽기 결과를 깊이 · 순서로 정렬한 `[{ teamNo, teamName }]` 이다(대상 제외). 없으면 `descendants` 키가 없다(역할 `clearedDefaults` 와 같은 규칙)                                                                                                                                                                                                                                                                                                                                                    |
| B12 | **이름 중복 판정**은 `isDuplicateOf(error, 'uq_teams_name')`(2d `accounts/duplicate.ts`) — 트랜잭션 밖에서 `cause` 를 보고 409 `ERR_DUPLICATE_TEAM_NAME` 으로 바꾼다. 콜레이션 `utf8mb4_unicode_ci`(PAD SPACE)라 대소문자 · 끝 공백만 다른 이름도 중복이다. 스키마 `teamNameSchema` 가 앞뒤 공백을 지운다                                                                                                                                                                                                                                     |
| B13 | **`replaceTeam` 같은 팀 건너뛰기**(이월 6). 사용자의 지금 소속을 `FOR UPDATE` 로 읽어, 요청이 그 팀 하나이거나(`[T]` → `T`) 빈 소속에 `null` 이면 지우지도 넣지도 않는다 — 배정 시각 `joinAt` 이 그대로이고 gap 잠금이 줄어든다. 잠금 순서는 users → roles → teams → teamUserMap 그대로                                                                                                                                                                                                                                                       |
| B14 | **약관 종류 옵션 검증**(⑨ K1) — `legal.kinds` 가 배열 · 비어 있지 않음 · 원소가 `^[A-Za-z0-9_]{1,32}$` · 겹침 없음. 어기면 `AdminLegalModule` 의 설정 팩토리가 기동에서 멈추고 문구에 문제를 모아 낸다. 열 폭 32 · `ascii_bin` 과 맞는다. 쿼리 · 본문 스키마는 기동에서 `z.enum(kinds)` 로 만든다(주입형 파이프 — 2d B5 와 같은 방식)                                                                                                                                                                                                         |
| B15 | **약관 발행의 읽기는 잠금 읽기다**(`… ORDER BY … LIMIT 1 FOR UPDATE`) — 가드 아래라 비잠금이어도 최신이지만, 잠금 읽기만 쓰면 읽기 뷰가 열리지 않아 INSERT 의 FK 검사(발행자 users 행 S 잠금)가 스냅샷 격리 ON 에서 1020 을 만날 길이 없다                                                                                                                                                                                                                                                                                                    |
| B16 | 응답 `publishedAt` 은 서비스 경계에서 `toISOString()`(gise — 계약은 ISO 문자열)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## 3. 정본과 흡수 목록

| 산출물                        | 정본                                                                                                         | 흡수할 것                                                                                                                                          | 버릴 것                                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `teams/*` [1]                 | hangang `modules/teams`(`teams.service` · `team-closure.service` · 라우트 · 감사) + axion 존재 검증(G12)     | 자기 행 + 상위 조상 복사 · 깊이 1 조상 = 상위 팀 · 평면 목록 쿼리(`findAll`) · DELETE teams → CASCADE · A3 "잠금 뒤 셈" 의 이유 · 감사 이름 · 라벨 | 단일 루트(→ 루트 여럿 · `parentTeamNo: null`), 숫자 `displayOrder` 이동(→ `beforeTeamNo` · 다시 매김), 순환 검사 없음(→ 400), 부모 존재 검증 없음(→ 404), 이름 사전 검사(→ 제약 이름), 트랜잭션 밖 디스패처 · 비잠금 서브트리 읽기(→ 가드 아래 잠금 읽기), 자기 행 의존 SQL(→ B6 · B7) |
| `0010_team_tree_lock` [1]     | hangang `013_guard_lock_super_admin_seed`                                                                    | 리터럴 시드 · 설명 문장                                                                                                                            | —                                                                                                                                                                                                                                                                                      |
| `database/guard-locks.ts` [1] | 2d `accounts/super-admin.ts` `lockSuperAdminGuard`                                                           | 행 없음 fail-loud                                                                                                                                  | 잠금 이름 고정(→ 인자)                                                                                                                                                                                                                                                                 |
| `legal/*` [2]                 | gise `modules/legal`(서비스 · 리포지토리 · 두 정렬 키 · LEFT JOIN · append-only 정적 검사) + axion 반환 모양 | sha256 서버 계산 · 같은 본문 409 문구 · 시행본 두 키 · 발행자 SET NULL · 이력 본문 제외 · `toISOString()` · 라우트 순서                            | 트랜잭션 없는 발행(→ 가드 · 기준 판 검사), 현재본 404(→ 200 + `null`), 종류 enum 하드코딩(→ 옵션), axion 발행자 NOT NULL + RESTRICT(→ SET NULL), axion 앱 시계(→ DB 시계)                                                                                                              |
| `0011_legal_documents` [2]    | gise `006_legal_documents`                                                                                   | 열 · 주석 · 인덱스 · FK SET NULL · CHECK 없음                                                                                                      | integer PK(→ bigint unsigned), `varchar(16)`(→ 32 · `ascii_bin`)                                                                                                                                                                                                                       |

## 4. 공개 API

### 4-1. admin-shared (두 PR 모두 minor)

```ts
// [1] error-codes.ts — CommonErrorCodes · COMMON_ERROR_STATUS 에 더함
/** 하위 팀까지 소속 계정이 있어 지울 수 없다 — details.memberCount */
ERR_TEAM_HAS_MEMBERS: 'ERR_TEAM_HAS_MEMBERS'   // 409
/** 팀을 자기 자신 · 하위 팀 아래로 옮기려 했다 */
ERR_TEAM_MOVE_CYCLE: 'ERR_TEAM_MOVE_CYCLE'     // 400

// [1] audit.ts
TEAM_CREATE: 'org.team.create' · TEAM_UPDATE: 'org.team.update' · TEAM_DELETE: 'org.team.delete' · TEAM_MOVE: 'org.team.move'
CoreAuditTargets.TEAM = 'team'
// 라벨: 팀 생성 · 팀 수정 · 팀 삭제 · 팀 이동 · 대상 '팀'

// [2] audit.ts
LEGAL_PUBLISH: 'setting.legal.publish'   // '약관 발행'
CoreAuditTargets.LEGAL_DOCUMENT = 'legalDocument'   // '약관'
```

- 팀 · 약관 계약 스키마는 이미 있다(3d §4-1 · 3e §4-2) — 바꾸지 않는다.
- 코어 오류 코드 수 · 상태표 테스트를 함께 고친다.

### 4-2. 옵션 (`src/options.ts` 에 더한다)

```ts
export interface AdminServerOptions {
  // …2a~2d 그대로
  /** [2] `AdminLegalModule` 을 쓰면 필수 — 없거나 형식이 아니면 기동에서 멈춘다(B14) */
  legal?: AdminLegalOptions
}

export interface AdminLegalOptions {
  /** 발행할 수 있는 종류 — 쓰는 쪽 카탈로그. 예: ['TERMS', 'PRIVACY']. 원소는 영숫자 · `_` 1~32자 */
  kinds: readonly string[]
}
```

[1] 은 옵션을 더하지 않는다(팀 모듈은 슬롯만 읽는다). 01-phase0 §3-2 의 `teams: { enabled, rootTeamResolver }` 줄은 지운다(§10 — 루트 여럿 · 모듈 import 가 켬).

### 4-3. 슬롯 (`auth/permission-slots.ts`)

```ts
export type AdminPermissionSlot =
  | /* 2c · 2d 의 일곱 */ …
  | 'teams.read'
  | 'teams.manage' // [1]
  | 'legal.read'
  | 'legal.publish' // [2]
```

### 4-4. 모듈

```ts
@Module({ controllers: [AdminTeamsController], providers: [AdminTeamsService] })
export class AdminTeamsModule implements OnModuleInit {}   // [1]

@Module({ controllers: [AdminLegalController], providers: [ADMIN_LEGAL_CONFIG 팩토리, AdminLegalService, 쿼리 · 본문 파이프] })
export class AdminLegalModule implements OnModuleInit {}   // [2]
```

- 둘 다 정적 모듈이고 `ADMIN_ROUTE_MODULES` 에 더한다(`routePrefix` 가 붙는다). 기동 검사는 §5-8.
- 팀 모듈은 `permissionCatalog` 를 요구하지 않는다(정규화 · 판정이 없다). 슬롯 키가 카탈로그 안인지(2d B12)는 역할 · 사용자 모듈이 이미 본다.

### 4-5. 팀 라우트 [1] (`AdminTeamsController`, `@Controller('teams')`)

| 라우트                      | 슬롯                        | 본문 → 응답                                | 감사                                                                                   |
| --------------------------- | --------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `GET /teams/tree`           | `teams.read` ∨ `users.read` | → `{ items: AdminTeamNode[] }`             | —                                                                                      |
| `POST /teams`               | `teams.manage`              | `adminTeamCreateSchema` → 201 `{ teamNo }` | `org.team.create` · team · 대상 + diff after `{ teamName, parentTeamNo }`              |
| `PATCH /teams/:teamNo`      | `teams.manage`              | `adminTeamRenameSchema` → `{}`             | `org.team.update` · diff `{ teamName }`                                                |
| `PATCH /teams/:teamNo/move` | `teams.manage`              | `adminTeamMoveBodySchema` → `{}`           | `org.team.move` · diff `{ parentTeamNo, displayOrder }`                                |
| `DELETE /teams/:teamNo`     | `teams.manage`              | (본문 없음) → `{}`                         | `org.team.delete` · diff before `{ teamName, parentTeamNo }` + meta `descendants`(B11) |

### 4-6. 약관 라우트 [2] (`AdminLegalController`, `@Controller('legal-documents')`)

| 라우트                               | 슬롯            | 본문 → 응답                                                               | 감사                                                                                                  |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /legal-documents/current?kind=` | `legal.read`    | → `{ item: AdminLegalDocument \| null }`                                  | —                                                                                                     |
| `GET /legal-documents?kind=`         | `legal.read`    | → `{ items: AdminLegalHistoryItem[] }` 최신순 전량                        | —                                                                                                     |
| `GET /legal-documents/:legalDocNo`   | `legal.read`    | → `AdminLegalDocument` · 없으면 404 `ERR_COMMON_NOT_FOUND`                | —                                                                                                     |
| `POST /legal-documents`              | `legal.publish` | `adminLegalPublishSchema` + 종류 enum → 201 `{ legalDocNo, contentHash }` | `setting.legal.publish` · legalDocument · 대상 + meta `{ kind, baseLegalDocNo, contentHash, length }` |

### 4-7. 장

- **[1] `0010_team_tree_lock`**: `guardLocks` 에 `('teamTree', '팀 트리 구조를 바꾸는 쓰기(만들기 · 이름 바꾸기 · 이동 · 삭제)를 직렬화한다. 각 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다')` 한 행. `down()` 은 그 행을 지운다. 표를 만들지 않는다 — `AdminDatabase` 는 그대로.
- **[2] `0011_legal_documents`**: `legalDocuments` 표(§2-2 #8, FK `fkLegalDocumentsPublishedBy` · 인덱스 `idxLegalDocumentsKindPublished`, 컬럼 주석) + `guardLocks` 에 `('legalPublish', '약관 발행을 종류와 관계없이 직렬화한다. 각 발행 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다')`. `down()` 은 행을 지우고 표를 버린다. `AdminDatabase.legalDocuments` · `AdminLegalDocumentsTable`(`publishedAt: ColumnType<Date, never, never>` — append-only 를 타입으로).
- `ADMIN_MIGRATIONS` 에 더한다(스텁 정규식 `[a-z_]+` 에 맞는다). 모든 장 필수(2c ⑨ M1) — 쓰는 쪽은 스텁 한 줄씩 더한다.

### 4-8. index 에 내는 것 · 내지 않는 것

- 낸다: `AdminTeamsModule` [1] · `AdminLegalModule` · `AdminLegalOptions` · `AdminLegalDocumentsTable` [2] · 넓어진 `AdminPermissionSlot`.
- 내지 않는다: 서비스 · `planTeamMove` · `buildTeamTree` · `lockGuardRow` · 가드 이름 상수 · 문구 표 · 파이프.

## 5. 흐름

### 5-1. 전역 잠금 순서 (B1)

```
superAdminSurvival(가드) → users → roles → teamTree(가드) → teams → teamClosure → teamUserMap · userEmploymentPeriods → sessions
legalPublish(가드) → legalDocuments (→ FK 검사로 발행자 users 행 S)
```

| 쓰기                       | 잡는 것(차례대로)                                                                                                      | 겹칠 때                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 사용자 만들기 · 수정(2d-2) | [잔존 가드] → users ⋈ roles → 줄 역할 → `lockTeam`(X) → teamUserMap · 재직 이력                                        | 팀 삭제와 그 팀 행에서 줄을 선다 — 삭제가 먼저면 400 `teamNo`, 사용자가 먼저면 삭제가 409       |
| 팀 만들기 [1]              | teamTree → 상위 팀 → 상위 조상 closure → 형제 → INSERT teams · closure                                                 | 다른 팀 쓰기와 가드에서 줄을 선다                                                               |
| 팀 이름 바꾸기 [1]         | teamTree → 대상 → UPDATE                                                                                               | 〃                                                                                              |
| 팀 이동 [1]                | teamTree → 대상 → 지금 상위 · 서브트리 · 옛 조상 closure → 상위 팀 → 받는 형제 → closure DELETE · INSERT → 형제 UPDATE | 〃. 사용자 쓰기와는 팀 행 하나(`lockTeam`)에서만 만난다 — 그쪽은 행 하나만 잡아 교착하지 않는다 |
| 팀 삭제 [1]                | teamTree → 대상 → 하위 팀 행 → 소속 셈(비잠금) → DELETE teams(CASCADE)                                                 | 위 사용자 쓰기 줄                                                                               |
| 약관 발행 [2]              | legalPublish → 시행본 잠금 읽기 → INSERT                                                                               | 다른 발행과 가드에서 줄을 선다 — 진 쪽은 기준 판 409                                            |

- 🔴 2f 메모: hangang 은 사용자 팀 변경에도 잔존 가드를 잡는다(IP 층 도달 가능성). 2f 가 팀 쓰기에 잔존 가드를 걸어야 하면 가드 행 둘의 고정 순서(`superAdminSurvival` → `teamTree`)를 0009 장 주석과 함께 그때 정한다. 2e 의 팀 변경은 잔존 셈(재직 ∧ `'*'`)을 바꾸지 않는다.

### 5-2. 트리 [1]

```
GET /teams/tree
  SELECT t.teamNo, t.teamName, t.displayOrder, p.ancestorNo AS parentTeamNo
    FROM teams t LEFT JOIN teamClosure p ON p.descendantNo = t.teamNo AND p.depth = 1
   ORDER BY t.displayOrder, t.teamNo, p.ancestorNo
  buildTeamTree(rows) (B9) ⇒ { items }
```

### 5-3. 만들기 [1]

```
POST /teams  { teamName(trim 1..64), parentTeamNo }
  runWriteTransaction
    ① lockGuardRow(trx, 'teamTree')                                         🔴 첫 문장
    ② parentTeamNo ≠ null ⇒ SELECT teamNo FROM teams WHERE teamNo FOR UPDATE ─ 없음 404 ERR_NO_TEAM 상위 팀
       ancestors = [{ parentTeamNo, 0 }] ∪ SELECT ancestorNo, depth FROM teamClosure
                                             WHERE descendantNo = parentTeamNo AND depth > 0 FOR UPDATE
    ③ siblings(parentTeamNo) FOR UPDATE — §5-5 ⑥ 과 같은 쿼리
       displayOrder = siblings 가 비면 0, 아니면 MAX + 1
    ④ INSERT teams(teamName, displayOrder) ─ ER_DUP uq_teams_name ─ (밖에서) 409 ERR_DUPLICATE_TEAM_NAME
    ⑤ INSERT teamClosure (새, 새, 0) + (a.ancestorNo, 새, a.depth + 1) for a in ancestors
  attachAuditTarget(teamNo) · attachAuditDiff(null, { teamName, parentTeamNo }, TEAM_FIELDS) ⇒ 201 { teamNo }
```

### 5-4. 이름 바꾸기 [1]

```
PATCH /teams/:teamNo  { teamName }
  runWriteTransaction
    ① lockGuardRow teamTree
    ② row = SELECT teamNo, teamName FROM teams WHERE teamNo FOR UPDATE ─ 404 ERR_NO_TEAM
    ③ UPDATE teams SET teamName ─ 중복 409
  attachAuditDiff({ teamName: 이전 }, { teamName }, ['teamName']) ⇒ {}
```

### 5-5. 이동 [1]

```
PATCH /teams/:teamNo/move  { parentTeamNo, beforeTeamNo }
  beforeTeamNo === teamNo ────────────────────────────────── 400 issues beforeTeamNo beforeIsSelf
  runWriteTransaction
    ① lockGuardRow teamTree
    ② target = SELECT teamNo, displayOrder FROM teams WHERE teamNo FOR UPDATE ─ 404 ERR_NO_TEAM
    ③ fromParent = SELECT ancestorNo FROM teamClosure WHERE descendantNo = teamNo AND depth = 1 FOR UPDATE (없으면 null)
       oldAncestors = SELECT ancestorNo FROM teamClosure WHERE descendantNo = teamNo AND depth > 0 FOR UPDATE
       subtree = [{ teamNo, 0 }] ∪ SELECT descendantNo, depth FROM teamClosure WHERE ancestorNo = teamNo AND depth > 0 FOR UPDATE
    ④ parentTeamNo ∈ subtree ──────────────────────────────── 400 ERR_TEAM_MOVE_CYCLE
    ⑤ parentTeamNo ≠ null ⇒ SELECT … FOR UPDATE ─ 404 ERR_NO_TEAM 상위 팀
    ⑥ siblings(parentTeamNo) FOR UPDATE, 대상 제외, ORDER BY displayOrder, teamNo
         parentTeamNo ≠ null: teamClosure c ⋈ teams t ON t.teamNo = c.descendantNo WHERE c.ancestorNo = parentTeamNo AND c.depth = 1
         parentTeamNo = null: teams t ⟕ teamClosure p ON (p.descendantNo = t.teamNo AND p.depth = 1) WHERE p.ancestorNo IS NULL
    ⑦ beforeTeamNo ≠ null ∧ beforeTeamNo ∉ siblings ──────────── 400 issues beforeTeamNo beforeNotSibling
    ⑧ plan = planTeamMove(…) (B8) — 제자리면 ⑨ ⑩ 을 건너뛴다
    ⑨ parentTeamNo ≠ fromParent ⇒ closure 갱신(B6)
         DELETE FROM teamClosure WHERE descendantNo IN subtree AND ancestorNo IN oldAncestors
         INSERT (a, d, a.depth + d.depth + 1) for a in ([{ parentTeamNo, 0 }] ∪ 그 조상), d in subtree   (parentTeamNo = null 이면 넣지 않는다)
    ⑩ plan.updates 마다 UPDATE teams SET displayOrder WHERE teamNo
  attachAuditDiff({ parentTeamNo: fromParent, displayOrder: target.displayOrder },
                  { parentTeamNo, displayOrder: plan.targetOrder }, ['parentTeamNo', 'displayOrder']) ⇒ {}
```

- 받는 묶음 순서: 형제(대상 제외)에서 `beforeTeamNo` 의 자리 앞에 대상을 끼운다. `null` 이면 끝. 그 순서의 i 번째에 `displayOrder = i`.
- 제자리: 같은 상위 팀이고 새 순서의 팀 번호열이 지금 형제 순서(대상 포함, 같은 정렬)와 같다. 그러면 `targetOrder = target.displayOrder` 이고 쓰기가 없다.
- admin-ui `siblingMove` · `findTeamPlacement` 이 내는 요청(3d §4-2)이 그대로 맞는다 — `up` 은 앞 형제 앞, `down` 은 그다음 형제 앞(없으면 `null` = 끝).

### 5-6. 삭제 [1]

```
DELETE /teams/:teamNo
  runWriteTransaction
    ① lockGuardRow teamTree
    ② target = SELECT t.teamNo, t.teamName, p.ancestorNo AS parentTeamNo
                 FROM teams t ⟕ teamClosure p ON (p.descendantNo = t.teamNo AND p.depth = 1)
                WHERE t.teamNo FOR UPDATE ─ 404 ERR_NO_TEAM
    ③ descendants = SELECT t.teamNo, t.teamName, c.depth FROM teamClosure c ⋈ teams t ON t.teamNo = c.descendantNo
                     WHERE c.ancestorNo = teamNo AND c.depth > 0 ORDER BY c.depth, t.displayOrder, t.teamNo FOR UPDATE
    ④ 🔴 memberCount = SELECT COUNT(DISTINCT userNo) FROM teamUserMap WHERE teamNo IN (대상 ∪ descendants)
         — 비잠금 · 이 트랜잭션의 첫 비잠금 읽기(D1 · B4). 앞에 비잠금 읽기를 두면 읽기 뷰가 먼저 열려 셈이 낡는다
       > 0 ──────────────────────────────────────────────── 409 ERR_TEAM_HAS_MEMBERS details { memberCount }
    ⑤ DELETE FROM teams WHERE teamNo IN (대상 ∪ descendants)    — closure · 소속은 CASCADE(소속은 ④ 로 0)
  attachAuditDiff({ teamName, parentTeamNo }, null, TEAM_FIELDS) · descendants 가 있으면 attachAuditMeta({ descendants }) ⇒ {}
```

### 5-7. 약관 [2]

```
POST /legal-documents  { kind ∈ kinds, body(legalBodySchema), baseLegalDocNo }
  contentHash = sha256(body, 'utf8').hex   (트랜잭션 밖)
  runWriteTransaction
    ① lockGuardRow(trx, 'legalPublish')                                    🔴 첫 문장
    ② current = SELECT legalDocNo, contentHash FROM legalDocuments WHERE kind
                 ORDER BY publishedAt DESC, legalDocNo DESC LIMIT 1 FOR UPDATE (B15)
    ③ (current?.legalDocNo ?? null) ≠ baseLegalDocNo ─────────── 409 ERR_COMMON_REVISION_CONFLICT
    ④ current?.contentHash = contentHash ──────────────────────── 409 ERR_COMMON_CONFLICT "이전 버전과 내용이 같습니다."
    ⑤ INSERT legalDocuments(kind, body, contentHash, publishedByUserNo = 주체)   — publishedAt 은 DB 시계
  attachAuditTarget(legalDocNo) · attachAuditMeta({ kind, baseLegalDocNo, contentHash, length: body.length }) ⇒ 201 { legalDocNo, contentHash }

GET current?kind=     ⇒ 위 정렬의 첫 행 ⟕ users ⇒ { item | null }
GET ?kind=            ⇒ 같은 정렬 전량, 본문 제외 ⟕ users ⇒ { items }
GET /:legalDocNo      ⇒ 그 행 ⟕ users ─ 없음 404 ERR_COMMON_NOT_FOUND ⇒ 문서
```

### 5-8. 기동 검사

| 검사              | 어디서                                    | 멈추는 조건                                                      |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| 인증 모듈         | 팀 · 약관 모듈 `onModuleInit`             | `AdminAuthModule` 이 없다(`assertAuthModuleRegistered`)          |
| 권한 슬롯         | 〃                                        | 자기 슬롯(`teams.*` · `legal.*`)이 맵에 없다                     |
| 약관 종류 [2]     | 약관 설정 팩토리                          | `legal` 옵션 없음 · `kinds` 가 B14 를 어김 — 문제를 모아 한 번에 |
| 카탈로그 액션(2c) | `AdminAuditModule.onApplicationBootstrap` | 코어에 더하므로 저절로 통과                                      |

## 6. 오류 표

팀 문구는 `teams/errors.ts` 의 `TEAM_MESSAGES`, 약관 문구는 `legal/errors.ts` 의 `LEGAL_MESSAGES` 한 곳에 둔다(2d `ACCOUNT_MESSAGES` 와 같은 방식). 사용자 본문의 없는 팀(400 `teamNo`)은 2d `ACCOUNT_MESSAGES.noTeam` 그대로다.

| 자리                        | 상태 · 코드                        | 문구                                                                                                                 |
| --------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 없는 팀(경로) [1]           | 404 `ERR_NO_TEAM`                  | `팀을 찾을 수 없습니다.`                                                                                             |
| 없는 상위 팀(만들기 · 이동) | 404 `ERR_NO_TEAM`                  | `상위 팀을 찾을 수 없습니다.`                                                                                        |
| 이름 중복                   | 409 `ERR_DUPLICATE_TEAM_NAME`      | `이미 있는 팀 이름입니다.`                                                                                           |
| 소속 있는 삭제              | 409 `ERR_TEAM_HAS_MEMBERS`         | `이 팀이나 하위 팀에 소속된 계정이 있어 지울 수 없습니다. 계정을 먼저 다른 팀으로 옮기세요.` + `details.memberCount` |
| 순환 이동                   | 400 `ERR_TEAM_MOVE_CYCLE`          | `팀을 자기 자신이나 하위 팀 아래로 옮길 수 없습니다.`                                                                |
| 기준 형제가 아님            | 400 `ERR_COMMON_VALIDATION`        | `issues[{ path: ['beforeTeamNo'] }]` `기준 팀이 옮겨 갈 상위 팀의 하위 팀이 아닙니다.`                               |
| 기준 형제 = 대상            | 400 `ERR_COMMON_VALIDATION`        | `issues[{ path: ['beforeTeamNo'] }]` `옮길 팀 자신을 기준 팀으로 고를 수 없습니다.`                                  |
| 모르는 종류 [2]             | 400 `ERR_COMMON_VALIDATION`        | `issues[{ path: ['kind'] }]`(zod 열거형 문구 — 종류는 몇 개뿐이라 나열해도 읽힌다)                                   |
| 없는 약관 판                | 404 `ERR_COMMON_NOT_FOUND`         | `문서를 찾을 수 없습니다.`                                                                                           |
| 기준 판이 시행본이 아님     | 409 `ERR_COMMON_REVISION_CONFLICT` | `다른 관리자가 먼저 새 버전을 발행했습니다. 새로 불러온 내용을 확인하세요.`                                          |
| 시행본과 같은 본문          | 409 `ERR_COMMON_CONFLICT`          | `이전 버전과 내용이 같습니다.`                                                                                       |
| 가드 행 없음                | 500 `ERR_COMMON_INTERNAL`          | 응답은 2a 고정 문구, 로그에 `동시성 보호 설정이 없어 처리할 수 없습니다.` + `lockName`                               |
| 교착 · 스냅샷 1020          | 409 `ERR_COMMON_CONFLICT`          | 2a `mapError` 그대로(`동시 처리 충돌입니다. 다시 시도해 주세요.`)                                                    |

## 7. 의존성

- 새 의존성 없다. `node:crypto` `createHash`(약관 해시)는 Node 내장이다.
- admin-shared 에 새 코드 · 액션(§4-1) — 고친 뒤 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server 가 본다. admin-ui 는 바뀌지 않는다.

## 8. 파일

```
2e-1 팀
packages/admin-shared/src/
  error-codes.ts · .test.ts                 ERR_TEAM_HAS_MEMBERS · ERR_TEAM_MOVE_CYCLE
  audit.ts · .test.ts                       팀 액션 4 · 대상 team · 개수 29 · 4
packages/admin-server/src/
  database/guard-locks.ts · .db.test.ts     lockGuardRow · 가드 이름 상수(B2)
  accounts/super-admin.ts                   lockSuperAdminGuard → lockGuardRow
  database/migrations/0010_team_tree_lock.ts · index.ts
  auth/permission-slots.ts                  슬롯 둘
  teams/errors.ts · tree.ts · move.ts       문구 · 트리 조립(B9) · 이동 계획(B8) — 순수
  teams/team-locks.ts                       팀 쓰기의 잠금 읽기 조각(대상 · 서브트리 · 형제)
  teams/teams.service.ts · teams.controller.ts · teams.module.ts
  teams/*.test.ts · teams.*.db.test.ts      §9
  users/user-locks.ts                       replaceTeam 같은 팀 건너뛰기(B13)
  test-support/concurrency.ts               whileHeld 잠금 대기 폴링 · 스냅샷 단언(이월 4)
  test-support/teams.ts · accounts.ts · admin-app.ts   팀 시드 · 카탈로그 키 · 슬롯 · 앱 부트
  admin-server.module.ts(ADMIN_ROUTE_MODULES) · index.ts
packages/admin-server/README.md             "팀" 절
.changeset/admin-server-teams.md            admin-server minor · admin-shared minor

2e-2 약관
packages/admin-shared/src/audit.ts · .test.ts           약관 액션 · 대상 · 개수 30 · 5
packages/admin-server/src/
  options.ts                                legal · AdminLegalOptions
  legal/options.ts · errors.ts · legal.body.ts · legal.service.ts · legal.controller.ts · legal.module.ts
  legal/*.test.ts · legal.*.db.test.ts · legal-append-only.test.ts
  database/migrations/0011_legal_documents.ts · index.ts · tables/legal-documents.ts · types.ts
  auth/permission-slots.ts · admin-server.module.ts · index.ts · test-support/
packages/admin-server/README.md             "약관" 절(jsonLimit · 공개 조회 예시)
.changeset/admin-server-legal.md            admin-server minor · admin-shared minor

두 PR 모두: docs/01-phase0.md · docs/HANDOFF.md · CLAUDE.md
```

정본에서 가져온 파일은 머리 주석에 정본 · 바꾼 점 · 🔴 를 적는다(/port 규약). 플랜은 `docs/superpowers/plans/2026-10-14-admin-server-teams.md`(2e-1) · `…-admin-server-legal.md`(2e-2, 2e-1 · 2d-3 병합 뒤).

## 9. 테스트 계약

TDD — 실패하는 테스트부터. 세 층(2a D1). 구현자는 테스트를 먼저 만들고 구현 전에 돌려 RED 를 보고서에 붙인다. 🔴 잠금 · 순서 테스트는 구현 뒤 해당 줄을 일부러 바꿔 RED 를 한 번 더 본다.

### 9-1. 단위 (`pnpm check`)

- [1] admin-shared: 오류 코드 둘의 상태 · 코드 수, 감사 코어 액션 29 · 대상 4 · 라벨 수.
- [1] `buildTeamTree`: 빈 목록 `[]` · 루트 여럿 · 깊이 3 · 형제 순서가 행 순서 · 깊이 1 조상 둘(작은 번호 + 경고) · 상위 팀이 목록에 없음(경고 · 뺌) · 순환(경고 · 뺌, 끝남).
- [1] `planTeamMove`: 같은 상위 팀의 위 · 아래 · 끝 · 제자리(빈 번호여도 쓰지 않음) · 동률(B · C 가 같은 값일 때 C 앞) · 다른 상위 팀 끝 · 다른 상위 팀 기준 앞 · 빈 형제 묶음(0) · 바뀐 행만 updates. admin-shared `siblingMove` · `findTeamPlacement` 결과를 그대로 넣었을 때의 기대 자리.
- [1] closure 쌍 셈(순수 — `move.ts`): 깊이 2 서브트리 × 조상 2 의 깊이 값, 최상위로 옮기면 넣을 쌍 없음.
- [2] 종류 옵션: 없음 · 빈 배열 · 형식 밖(공백 · 33자 · 한글) · 겹침을 모아 한 번에. 해시: 알려진 벡터(`''` · 한글 · 줄바꿈 그대로).

### 9-2. DB 없는 HTTP (`pnpm check`)

- 기동 검사(§5-8)가 각각 멈추고 문구에 빠진 것이 이름으로 나온다. [2] 잘못된 `legal.kinds`.
- 쿠키 없는 팀 · 약관 라우트는 401.

### 9-3. 실 MariaDB (`pnpm test:db`, 파일마다 새 데이터베이스)

- [1] 0010 장: up · down(행만 지움) · 시드 리터럴 = `GUARD_LOCK_TEAM_TREE` · 스텁 검사가 장 10개를 요구. `lockGuardRow` — 행이 없으면 500, 잔존 잠금이 그것을 거친다(2d 테스트 그대로 초록).
- [1] `whileHeld`(이월 4 — 수단은 §14 R1-6: `SHOW ENGINE INNODB STATUS` 의 TRANSACTIONS 절 ∩ processlist): 같은 데이터베이스의 잠금 대기를 보면 곧바로 커밋하고, `during` 이 기다리지 않고 끝나면 그대로 커밋하고, 시간 초과(기본 5초)면 커밋한 뒤 결과를 돌려준다. 다른 데이터베이스(병렬 테스트 파일)의 대기는 세지 않는다. 스냅샷 Kysely 는 만들 때 연결마다 `@@session.innodb_snapshot_isolation` 을 단언한다(풀 데우기). 2d 의 기존 경합 테스트가 그대로 초록이다.
- [1] 서비스: 만들기(최상위 · 하위 · closure 행(자기 행 포함) · 순서 `MAX + 1` / 0 · 없는 상위 404 · 중복 409 · 대소문자만 다른 이름 409), 이름(404 · 중복 409 · 자기 이름 그대로 통과), 이동(같은 상위 위 · 아래 · 끝 · 제자리 무쓰기 · 동률 다시 매김 · 다른 상위로 깊이 2 서브트리 — closure 전체가 기대 쌍과 같음 · 최상위로 · 순환(자기 · 자손) 400 · 기준 형제 아님 400 · 기준 = 대상 400 · 없는 상위 404), 삭제(서브트리째 · closure 정리 · 소속 409(퇴사자 포함 · `memberCount` 계정 수) · 404). 🔴 자기 행 없는 시드(쓰는 쪽이 손으로 넣은 closure)에서도 이동 · 삭제 · 트리가 맞다(C1).
- [1] 🔴 경합(공개 서비스 메서드 · `whileHeld` — 순서를 뒤집어 RED):
  - (a1) 원시 연결이 팀 s 를 `FOR UPDATE` 로 잡고 소속을 넣은 채 → 서비스 팀 삭제(s 의 조상)가 기다렸다 409 `ERR_TEAM_HAS_MEMBERS`. RED: 셈을 하위 팀 잠금 앞으로 옮기면 200 이 되고 소속이 CASCADE 로 사라진다(스냅샷 격리 ON 이면 DELETE 가 1020 → 409 — §14 R1-1).
  - (a2) 원시 연결이 가드 · 팀 행을 잡고 그 팀을 지운 채 → 서비스 사용자 만들기 · 수정(그 팀으로)이 기다렸다 400 `issues[teamNo]`. RED: `lockTeam` 의 `forUpdate` 를 빼면 비잠금 읽기가 팀을 보고 지나가 INSERT 의 FK 검사에서 400 `ERR_COMMON_BAD_REQUEST`(참조 대상 없음)가 된다(이월 8 의 `lockTeam` 회귀).
  - (b1) 원시 연결이 가드를 잡은 채 서브트리를 옮기는 중(closure 미커밋) → 서비스 하위 팀 만들기가 기다렸다 새 조상으로 closure 를 만든다. RED: 가드와 조상 읽기의 `forUpdate` 를 **함께** 빼면 옛 조상 쌍이 남는다(하나만 빼면 다른 하나가 줄을 세운다 — 둘이 겹친 방어다).
  - (b2) 같은 상황에서 사용자 목록(`filter[teamNo]` · `recursive`)은 옛 소속 집합을, 커밋 뒤에는 새 집합을 본다(비잠금 스냅샷 — 섞이지 않는다).
  - (c1) 서로 겹치지 않는 행을 잠그는 이동 둘(A → b 아래, B → a 아래)을 원시 연결이 가드를 쥔 동안 함께 시작 → 하나는 `{}`, 다른 하나는 400 `ERR_TEAM_MOVE_CYCLE`, closure 에 순환이 없다. RED: 가드를 빼면 400 순환이 아니라 교착 409 이거나 둘 다 성공(순환)으로 끝난다.
  - (c2) 동시 만들기 둘(같은 상위 팀) → 순서 값이 겹치지 않는다.
  - (s1) 스냅샷 격리 ON: 원시 연결이 가드를 쥐고 형제 팀 이름을 바꾼 채 → 서비스 이동이 기다렸다 성공(1020 없음). RED: 가드 앞에 비잠금 읽기를 두면 409.
- [1] 사용자 쓰기: `PATCH { teamNo: 같은 팀 }` 은 `teamUserMap.joinAt` 을 바꾸지 않는다(B13). 두 팀 소속에 같은 팀 하나를 주면 하나로 줄어든다.
- [1] 팀 HTTP — 3d §9 전 행: 봉투 `success: true` · `data` 키 집합 정확히(`{ items }` · `{ teamNo }` · `{}`), 201, 본문 검증 400 `issues`(빈 이름 · 65자 · 숫자 아닌 `parentTeamNo`), 403(슬롯 없음 — `details` 그대로), `users.read` 만으로 트리 200 · 쓰기 403, 응답이 admin-shared `adminTeamTreeSchema` · `adminTeamCreateResultSchema` 로 파싱, `reauth: true` 앱에서도 `currentPassword` 없이 통과.
- [1] 감사: 쓰기 넷이 행으로 남고 diff · meta 원문이 정확하다 — 만들기 after · 대상 번호, 이름 before/after, 이동 before/after(제자리면 같음), 삭제 before + `descendants`(하위 팀 없으면 키 없음).
- [2] 0011 장: up · down · DDL(콜레이션 · FK SET NULL · 인덱스) · 시드 리터럴 · 스텁 장 11개.
- [2] 서비스 · HTTP — 3e §9 전 행: 미발행 `{ item: null }` 200 · 발행 → 현재본 · 해시 = sha256 · 두 번째 발행이 현재본 · 이력 최신순 본문 없음 · 단건 본문 · 없는 번호 404 · 모르는 종류 400 · 같은 본문 409 CONFLICT · 낡은 기준 409 REVISION_CONFLICT(같은 본문이어도 기준 판 검사가 먼저) · 종류마다 따로 · 다른 종류 같은 본문 허용 · 같은 초 발행 둘(번호가 큰 쪽이 현재본) · 발행자 삭제 뒤 이력 남음(`publishedByUserNo` null) · `legal.read` 만으로 POST 403 · 감사 meta 에 본문 없음 · 응답이 admin-shared 스키마로 파싱.
- [2] 🔴 경합: 같은 기준 판의 동시 발행 둘(원시 연결이 가드를 쥔 동안 시작) → 201 하나 · 409 `REVISION_CONFLICT` 하나. 첫 발행(`baseLegalDocNo: null`) 둘도 같다. RED: 가드를 빼면 둘 다 201.

### 9-4. 리뷰 초점 (플랜 · 리뷰어에게 넘긴다)

1. 팀 쓰기 넷과 약관 발행 모두 가드가 트랜잭션 **첫 문장**인가 — 앞에 SELECT 가 끼면 읽기 뷰 · 1020 · 셈이 어긋난다.
2. 삭제의 소속 셈 앞에 비잠금 읽기가 없는가(D1), 소속을 더하는 모든 패키지 경로가 팀 행을 먼저 잡는가(B4).
3. closure 갱신 · 삭제 · 트리가 자기 행에 기대지 않는가(C1) — 자기 행 없는 시드에서 같은 결과인가.
4. 이동 계획이 admin-ui 의 요청(`siblingMove` · `findTeamPlacement` · `moveTargets`)과 맞는가 — 동률 · 빈 번호 · 끝 · 최상위.
5. [2] 해시를 서버만 셈하고, 본문이 감사 · 로그 · 오류 본문에 없고, 검사 순서가 기준 판 → 같은 본문인가.

## 10. 릴리스 · 문서

- **changeset**: 2e-1 `.changeset/admin-server-teams.md`, 2e-2 `.changeset/admin-server-legal.md` — 둘 다 admin-server **minor** · admin-shared **minor**. 첫 줄은 쓰는 쪽이 할 일: [1] 마이그레이션 폴더에 `0010_team_tree_lock` 스텁 한 줄, 슬롯 `teams.read` · `teams.manage`, `AdminTeamsModule` import. [2] `0011_legal_documents` 스텁 한 줄, 슬롯 `legal.read` · `legal.publish`, `legal: { kinds }` 옵션, `AdminLegalModule` import. admin-server 는 미발행이라 npm 에는 admin-shared 만 나간다(2a §1-4 #7).
- **admin-server README**: [1] "팀" 절 — 라우트 표, `useTeamTree` 어댑터 배선(admin-ui README 의 "Phase 2 서버" 예시가 그대로 맞음), 루트 여럿 · 최상위 옮기기(`topLevel`), 이동 규칙(`beforeTeamNo` · 서버가 순서를 다시 매김 · 순환 400), 삭제 409 와 퇴사자 소속, 이름 중복 409(대소문자 무시), 쓰는 쪽 시드의 closure(자기 행을 넣어도 안 넣어도 된다 · 깊이 1 조상이 상위 팀), 동시 쓰기(가드 · 409 다시 시도). [2] "약관" 절 — 라우트 표, `legal.kinds` 와 admin-ui `kinds` 를 한 상수에서, `useLegalDocuments` 어댑터(미발행 `null` · 단건은 문서 그대로), 발행 409 둘, `jsonLimit`(⑫ J1), 공개 조회 예시(`renderMarkdown`), 동의 기록이 `legalDocNo` 를 FK 로 걸 때 bigint unsigned.
- **`docs/01-phase0.md`**: §3-2 의 `teams: { enabled, rootTeamResolver }` 줄을 "옵션 없음 — `AdminTeamsModule` import, 루트 여럿, 루트 팀 규칙은 B(시드 · `canAct`)" 로 [1], `legal: { kinds }` 줄을 더한다 [2]. §2-3 아래 "PR 2e 경계 결정(2026-10-14)" 한 단락 [1]. §8 admin-server 행.
- **`docs/HANDOFF.md` · `CLAUDE.md`**: 진행 표에 2e-1 · 2d-3 · 2e-2. HANDOFF "알려진 미확인" 의 닫힌 항목 — 2c 이월(팀 · 약관 슬롯 · 액션), 2d-2 이월 4 · 6 · 8(일부) [1]. 2d-3 의 범위(이월 1 · 2 · 5 · 7 · 8 나머지 · 9)를 HANDOFF 에 적는다. CLAUDE.md 의 admin-server 규약 절에 팀 잠금 규칙(가드 첫 문장 · 소속 셈 앞 비잠금 읽기 금지 · 자기 행에 기대지 않음) 한 줄.
- **쓰는 쪽 스모크**(`%TEMP%\akss`, 새 DB): [1] tarball → 스텁 10장 → 시드 → 기동 → 팀 만들기 · 하위 팀 · 이동 · 순환 400 · 소속 있는 삭제 409 · 사용자 배정 → 감사 행. [2] 스텁 11장 → 발행 · 같은 본문 409 · 낡은 기준 409 · 시행본 조회 → 감사 행.

## 11. 비범위 · 보류

- 팀 단건 · 평면 목록 라우트(hangang `GET /teams` · `/teams/:teamNo`) — 화면이 쓰지 않는다(3d 는 트리 하나).
- 팀 고르기 대화상자(3d §10) · 시스템 팀 보호(axion G6 — 쓰는 쪽 `canAct` · 자기 라우트), 팀 정지(axion — X).
- 팀 변경의 잔존 영향(IP 층 도달 가능성) → 2f(§5-1 메모).
- 팀 쓰기의 재인증 · revision — 3d §9 그대로 없음.
- 약관 공개 조회 · 가입 동의 기록(`userConsents`) · 재동의 · 예약 발행 · 판 비교 — 쓰는 쪽(3e §10).
- 약관 이력 페이지 나눔 — 발행은 드물다(3e §9).
- 시계가 뒤로 가 늦은 발행의 `publishedAt` 이 앞 판보다 이르면 시행본이 앞 판으로 보인다 — 계약(`publishedAt` 먼저)을 지키고 받아들인다(DB 시계 하나라 드물다).

## 12. 플랜에서 먼저 확인할 위험

플랜을 쓰기 전에 짧은 `%TEMP%` 스크래치 프로브와 실 MariaDB 11.4 로 재고 결과를 §14 R1 에 적는다.

1. **(a) 삭제 ∥ 사용자 만들기 · 수정.** 원시 연결 A 가 팀 s 를 `FOR UPDATE`(또는 FK S 잠금만 — `INSERT teamUserMap`)로 잡고 소속을 넣은 채, B 가 가드 → 서브트리 `FOR UPDATE` → 비잠금 셈 → DELETE 를 하면 B 가 기다렸다 그 소속을 보는가. 반대로 B 가 먼저 잡으면 A 의 `lockTeam` · INSERT 가 기다렸다 행 없음 · FK 위반 중 무엇으로 끝나는가. 교착이 없는가. 스냅샷 격리 ON 에서도 같은가.
2. **(b) 이동 ∥ 하위 팀 만들기 · 하위 팀 필터 목록.** 가드 대기 뒤의 잠금 읽기가 앞 이동의 closure 를 보는가. 사용자 목록의 비잠금 읽기가 반쯤 고친 closure 를 보지 않는가.
3. **(c) 같은 종류 약관 동시 발행 둘** — 가드 아래 하나는 INSERT, 하나는 기준 판 409. 첫 발행(행 없음)도. 가드 없이 시행본 `FOR UPDATE` 만이면 첫 발행이 교착(1213)하는가(L2 를 고르지 않은 근거).
4. **(d) 팀 이름 UNIQUE** — 키 이름이 `uq_teams_name`(snake), 대소문자 · 끝 공백만 다른 이름이 중복, `isDuplicateOf` 가 `runWriteTransaction` 뒤 `cause` 로 읽는가. 스냅샷 격리 ON 에서 가드 없이 이동하면 1020 이 나고 `mapError` 가 409 로 내는가(B5 근거).
5. **(e) 그 밖의 가정**: `SELECT … LEFT JOIN … FOR UPDATE`(루트 형제) · `MAX` 없이 형제 목록 · `DELETE … WHERE a IN (…) AND b IN (…)` · 여러 줄 INSERT 가 Kysely 0.29 로 돈다. 가드 · 잠금 읽기만 지난 트랜잭션의 첫 비잠금 SELECT 가 그 시점 읽기 뷰를 여는가(`START TRANSACTION` 이 스냅숏을 미리 열지 않는다 — Kysely `db.transaction()`). `information_schema.innodb_trx ⋈ processlist` 로 같은 데이터베이스의 LOCK WAIT 를 셀 수 있는가(이월 4). mediumtext 1,000,000자 한글 왕복 · `jsonLimit` 1mb 에서 413.

## 13. 선행 문서 정정

- **2a 스펙 §1-3 2e 행** "`TeamsModule`" → `AdminTeamsModule` · `AdminLegalModule`. 2a 스펙 본문은 고치지 않고 이 절이 이긴다.
- **2d 스펙 B16** "재입사는 자기 계정도 허용한다(퇴사 예정인 본인)" → 2d-3 에서 본인 재입사 403(§2-1 이월 9). 2d-3 이 2d 스펙 §14 에 R 항목으로 적는다.
- **2d 스펙 §11** "팀 모듈과 팀 변경의 잔존 영향 → 2e · 2f" → 팀 모듈은 2e-1, 잔존 영향은 2f(§5-1 메모).
- **3e 스펙 §9 단건 응답** — 이미 문서 그대로다(바꾸지 않음, §2-2 #5 에 적었다).
- **Phase 0 §3-2 표** · **HANDOFF** · **CLAUDE.md**: §10 대로.

## 14. 구현 중 정정

§12 의 확인 결과와 구현 · 리뷰에서 바뀐 것을 `R<n>` 으로 더한다.

- **R1 — §12 위험 실측(2026-10-14, 플랜 전, MariaDB 11.4.13 · `REPEATABLE-READ` · `innodb_snapshot_isolation` 전역 OFF · 패키지 DB 하네스의 임시 프로브 — 지웠다).** 설계를 바꾼 것은 6(이월 4 의 수단) 하나다. 나머지는 경계 결정의 근거를 받쳤다.
  1. **(a1) 삭제 ∥ 소속 넣기.** 원시 연결이 팀 s 를 `FOR UPDATE` 로 잡거나(사용자 쓰기 모양) FK S 잠금만 건 채(`INSERT teamUserMap` 만) 소속을 넣고 있을 때, Kysely 트랜잭션이 가드 → 상위 팀 → 하위 팀 `FOR UPDATE` → 비잠금 셈을 하면 하위 팀 잠금에서 기다렸다가 커밋된 소속 1 을 센다 — 스냅샷 격리 OFF · ON 네 갈래 모두, 1020 없음. 셈을 하위 팀 잠금 **앞으로** 옮기면 OFF 는 0 을 보고 `DELETE teams` 가 CASCADE 로 방금 커밋된 소속을 지운다(조용한 유실 — hangang A3 가 막으려던 것), ON 은 그 DELETE 가 1020 → 409. D1 의 순서가 맞고 §9-3 (a1) 의 RED 가 결정적이다. 잠금 읽기만 지난 Kysely `db.transaction()` 의 첫 비잠금 SELECT 가 그 시점 읽기 뷰를 연다는 것도 이것이 보였다(`START TRANSACTION` 이 스냅숏을 미리 열지 않는다).
  2. **(a2) 삭제가 먼저.** 삭제가 가드 · 팀 행을 쥐고 지운 채면 사용자 쪽 `SELECT … FOR UPDATE`(`lockTeam`)는 기다렸다가 빈 결과 → 400 `teamNo`. 비잠금 SELECT 면 팀을 보고 지나가 `INSERT teamUserMap` 이 FK S 잠금을 기다렸다가 1452 `ER_NO_REFERENCED_ROW_2` → `mapError` 400 `ERR_COMMON_BAD_REQUEST`. §9-3 (a2) RED 가 결정적이다.
  3. **(a3) ② D1 의 근거.** 소속을 서브트리 밖 이웃 번호 팀으로 옮기는 사용자 수정(`lockTeam` X → `DELETE teamUserMap WHERE userNo` → INSERT)이 삭제와 겹치면, D2(셈 `FOR UPDATE`)는 교착 1213(사용자 INSERT 가 희생 → 409)이고 D1(비잠금 셈)은 교착 없이 삭제가 소속 1 을 보고 409, 사용자 수정은 성공한다.
  4. **(b) 이동 ∥ 하위 팀 만들기 · 목록.** 원시 연결이 가드를 쥐고 서브트리를 옮기는 중(closure DELETE · INSERT 미커밋)일 때 — 가드 + 잠금 읽기, 가드 없이 잠금 읽기 둘 다 기다렸다가 새 조상을 본다. 가드도 잠금 읽기도 없으면 옛 조상을 본다(§9-3 b1 의 "겹친 방어" 그대로). 사용자 목록 같은 비잠금 읽기는 커밋 전에는 옛 집합, 뒤에는 새 집합 — 반쯤 고친 closure 를 보지 않는다.
  5. **(c) 약관.** 가드 아래 동시 발행 둘은 첫 발행 · 기존 판 기준 모두 하나는 INSERT, 하나는 기준 판 충돌이다. 가드 없이 시행본 `FOR UPDATE` 만(L2)이면 첫 발행 둘이 1213 교착이다(⑩ L1 근거). 같은 초 두 판은 번호가 큰 쪽이 시행본, 발행자를 지우면 `publishedByUserNo` 가 NULL, 1,000,000자 한글(3,000,000 바이트)이 mediumtext 로 같게 왕복한다(`max_allowed_packet` 16MB). `jsonLimit` 1mb 의 413 은 2a HTTP 테스트가 이미 잰다.
  6. **(e) 🔴 이월 4 의 수단 정정 — `information_schema.innodb_trx` 폴링은 쓰지 못한다.** InnoDB 는 그 표(와 `innodb_lock_waits`)를 **서버 전역 캐시**로 내고, 마지막 읽기에서 0.1초가 지나지 않으면 새로 고치지 않는다. 다른 연결이 30ms 마다 읽으면 3초 동안 대기를 못 봤고(병렬로 도는 테스트 파일끼리 서로 막는다), 20ms 간격 폴링은 5초 내내 못 봤으며, 앞 테스트가 남긴 낡은 캐시가 첫 폴링에 "대기 중" 으로 보여 너무 일찍 커밋하기도 했다. `SHOW ENGINE INNODB STATUS` 는 캐시 없이 3ms 에 잡았다. → `whileHeld` 는 그 출력의 **TRANSACTIONS 절**에서 `LOCK WAIT` 가 든 트랜잭션 블록의 thread id 를 모으고, `information_schema.processlist`(캐시 없음)로 같은 데이터베이스(`db = t.name`)의 것만 남긴다. 🔴 LATEST DETECTED DEADLOCK 절에 지난 교착의 thread id 와 `LOCK WAIT` 글자가 남으므로 절을 잘라 읽는다. PROCESS 권한이 필요하다 — 로컬 컨테이너 · CI(`db` 잡) 모두 root.
  7. **(d) 이름 · 스냅샷.** `'dup'` · `'Dup '`(끝 공백) · `'DUP'` 은 `'Dup'` 과 중복이고 `' Dup'`(앞 공백)은 아니다(PAD SPACE 는 끝 공백만 — `teamNameSchema` 의 trim 이 막는다). `runWriteTransaction` 뒤에도 `isDuplicateOf(error, 'uq_teams_name')` 가 참이다(`mapError` 는 `ERR_COMMON_DUPLICATED` 로 감싸고 원본은 `cause`). 프로브의 하위 팀 이름 `…-A` 와 `…-a` 도 ci 콜레이션 중복으로 걸렸다 — 테스트 시드 이름은 대소문자만으로 가르지 않는다. 스냅샷 격리 ON 에서 비잠금 읽기 뒤 남이 바꾼 팀 행을 잠금 읽기하면 1020 → 409 `ERR_COMMON_CONFLICT`, 가드가 첫 문장이면 기다렸다가 성공한다(B5 근거).
  8. **(e) Kysely 0.29 모양.** 루트 형제 `LEFT JOIN … WHERE p.ancestorNo IS NULL … FOR UPDATE`, 형제 `JOIN … FOR UPDATE`, `DELETE … WHERE descendantNo IN (…) AND ancestorNo IN (…)`, 여러 줄 INSERT, `count(distinct userNo)` 가 돈다.
