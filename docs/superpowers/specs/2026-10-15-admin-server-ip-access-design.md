# admin-server IP 접근 제어 설계 (Phase 2 PR 2f-1)

작성일: 2026-10-15 · 상태: 확정(구현 전) · 선행: 2a 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1(2f 지도 행), 2b 스펙 `docs/superpowers/specs/2026-10-13-admin-server-auth-design.md` B7 · ⑧ H1 · §5(로그인 · 가드 · refresh) · §11, 2d 스펙 `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` §5-3(잔존), 2d-3 스펙 `docs/superpowers/specs/2026-10-15-admin-server-accounts-cleanup-design.md` ① A · C1 ~ C3, 2e 스펙 `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md` §5-1(전역 잠금 순서 · 2f 메모) · ② D1, `docs/01-phase0.md` §4 · ipAccess 행, `docs/HANDOFF.md` "다음 플랜" · "PR 2e-2 최종 리뷰가 넘긴 것"(테스트 도우미)

이 문서는 2f-1 의 범위만 쓴다. 인증 판정 순서 · 훅 자리는 2b 스펙, 잔존 · 잠금 단계는 2d · 2d-3 스펙, 팀 · 전역 잠금 순서는 2e 스펙이 그대로 유효하고, 이 문서가 바꾸는 줄은 §13 에 모았다.

## 1. 목표

Phase 2 의 마지막 기능 모듈 — 관리자 접속 위치 제한. 브랜치 `feat/admin-server-ip-access`. 끝 상태, 실 MariaDB 로:

- **`AdminIpAccessModule`** — `/admin/ip-access` 다섯 라우트(목록 · 미리보기 · 만들기 · 수정 · 삭제), 장 `0012_ip_access_rules` + 시드 두 행(global `0.0.0.0/0` · `::/0`).
- **평가** — user > team > global, 가장 가까운 층 하나만 채택, 기본 거부, IPv4 · IPv6. 로그인 · 매 요청 가드 · refresh 가 막힌 주소에 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp`(2b B7 계약 그대로).
- **`clientIp` 출처** — 코어 옵션 `clientIp: 'req.ip' | 'x-real-ip'`. 세션 행 · 감사 · IP 정책이 같은 정규화 값을 본다.
- **IP 를 아는 전권자 잔존** — 남의 전권자에게 user 규칙을 씌우거나(시나리오 A) 팀을 바꿔(시나리오 B) "어디서든 로그인할 수 있는 전권자" 를 0 으로 만드는 쓰기가 409.
- **자기 잠금 409 · 팀 삭제 409** — 요청자의 지금 접속이 막히는 규칙 변경, 규칙이 가리키는 팀의 삭제.
- **테스트 도우미 정리** — 2e-2 가 넘긴 `underHeldGuard` 복사본 · `whileHeld` 도달 여부(2f-1 의 경합 테스트가 쓰기 전에).

쓰는 쪽이 할 일: 장 스텁 한 줄(필수), IP 를 쓰면 슬롯 둘 · 모듈 import, 엣지 프록시 뒤면 `clientIp` 옵션(§10).

PR 순서: 2e-2 → **2f-1** → 2f-2(인증 경로 이월 · 첫 발행 준비) → admin-server 첫 발행(결정 ⑥ V1).

## 2. 결정

### 2-1. 경계 결정 (2026-10-15, 브레인스토밍 — 모두 권장안)

| #            | 확정                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 범위       | **S1** — 2f 를 둘로 나눈다. 2f-1 = IP 접근 제어(이 문서). 2f-2 = 인증 경로 이월(rotate 잠금 순서 · 로그인 TOCTOU) + 첫 발행 준비(DB TLS · socketPath · admin-shared peer 하한 · `pagination.d.ts` TS2536). 테스트 도우미 정리는 2f-1 첫 태스크로 당긴다 |
| ② 잔존 셈    | **R1** — hangang A1. IP 모듈이 있으면 셈 = 재직 ∧ `'*'` ∧ 적용 층이 `global`. 잔존 지점에 IP 쓰기 셋 · 사용자 `teamNo` 변경을 더한다. IP 모듈이 없으면 셈은 지금 그대로                                                                                 |
| ③ 기본 동작  | **D1** — 평가는 기본 거부(규칙 0개 = 아무도 못 들어옴). 장 0012 가 global 허용 두 행(`0.0.0.0/0` · `::/0`)을 시드한다 — 장 0009 가 가드 행을 시드하는 것과 같은 방식                                                                                    |
| ④ `clientIp` | **C1** — 코어 옵션 `clientIp?: 'req.ip' \| 'x-real-ip'`, 기본 `'req.ip'`(Express `trust proxy` 를 따른다). `'x-real-ip'` 는 엣지가 덮어쓰는 헤더만 읽고 없으면 `req.ip` — `X-Forwarded-For[0]` 폴백은 없다. 두 출처 모두 `normalizeIp` 를 지난다        |
| ⑤ 팀 규칙    | **T1** — 규칙이 가리키는 팀(서브트리 포함)의 삭제는 409 `ERR_TEAM_HAS_IP_RULES` + `ruleCount`. 규칙을 먼저 지우게 한다 — 규칙 삭제는 IP 모듈의 자기 잠금 · 잔존 · 감사를 지난다. 죽은 규칙 행이 생기지 않는다                                           |
| ⑥ 접근       | **A** — 전역 모듈 + 내부 표시 토큰. 정책은 요청마다 규칙을 비잠금으로 읽는다(캐시 없음). CIDR 파서 · 층 판정 · 평가는 순수 함수라 admin-shared 에 둔다                                                                                                  |
| ⑦ 설계 묶음  | 설계 ① 구성 · 데이터, ② 평가 · 인증 · 쓰기 흐름, ③ 라우트 · 미리보기 · 오류 · 테스트 승인. hangang 과 다른 둘: **refresh 에도 IP 검사**(새 동작), **자기 잠금은 쓴 뒤의 결과 상태로 판정**                                                              |

### 2-2. 공통 결정 (이의 없음)

1. **잠금 규칙은 그대로.** 가드 행이 트랜잭션 첫 문장 · 한 트랜잭션에 가드 행 하나 · 잠금 단계에는 잠금 읽기와 판정만(2d-3 C2) · 셈에 `FOR UPDATE` 금지. `ipAccessRules` 는 IP 쓰기가 대상 행을 잠그는 것 말고는 **비잠금으로만** 읽는다(정책 · 잔존 셈 · 팀 삭제 셈 · 미리보기 · 자기 잠금 판정).
2. **쓰기 보호 프로토콜**(`docs/01-phase0.md` §4): 규칙 행에 `revision`(수정 · 삭제 409). 재인증은 코어 `reauth` 옵션 — 역할 · 사용자와 같은 스위치다(hangang 은 늘 재인증).
3. **모듈 옵션이 없다.** import 하면 켜진다. phase0 표의 `ipAccess: { enabled, layers, inheritTeamAncestors, ipv6, seedRules }` 는 모두 고정 동작이 된다 — 층 셋 고정 · 조상 팀 상속 없음 · IPv6 항상 · 시드는 장.
4. **2b 공개 계약 유지.** `AdminAccessPolicy` · `AdminAccessContext` · `ADMIN_ACCESS_POLICY` 의 모양, 403 봉투 · `details.clientIp`, 인증 이벤트 모양이 그대로다.
5. **범위 밖**: 2f-2 몫(①), IP 관리 화면(규칙 표 · 미리보기 표시 — 템플릿 B), 미리보기에 잔존 결과 싣기(저장 409 문구가 설명한다).

### 2-3. 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **순수 함수는 admin-shared `ip-access.ts`** — `normalizeIp` · `isValidIp` · `parseCidr` · `isValidCidr` · `ipInCidr` · `applicableIpLayer` · `evaluateIpAccess`. 🔴 CIDR 을 읽는 곳은 `parseCidr` 하나다(hangang R30) — 서버 본문 스키마 · 화면 스키마 · 평가가 같은 파서를 쓴다. `evaluateIpAccess(ip: string \| null, …)` 는 `null` 이면 `false`(fail-closed)                                                                                                |
| P2  | **정책** `IpAccessPolicy implements AdminAccessPolicy`(`ip-access/ip-access.policy.ts`) — `allows()` 가 규칙 전량(세 열)을 비잠금으로 읽고 `evaluateIpAccess` 로 판정한다. 캐시 없음 — 인스턴스가 여럿일 때 낡은 규칙으로 통과시키는 창이 생긴다(⑥)                                                                                                                                                                                                            |
| P3  | **표시 토큰** `IP_ACCESS_ENABLED`(내부 — `tokens.ts`, index 에 내지 않는다). `AdminIpAccessModule`(전역)이 `true` 로 낸다. 역할 · 사용자 · IP 서비스가 `@Optional()` 로 받아 `withSuperAdminSurvival(trx, steps, { ipAware })` 에 넘긴다. 🔴 표 유무가 아니라 토큰 유무로 가른다 — 장은 모두 필수라 표는 늘 있다. IP 모듈을 안 쓰는 소비자가 시드 행을 지웠을 때 셈이 0 으로 떨어져 잔존이 조용히 꺼지면 안 된다                                               |
| P4  | **셈** `countSuperAdmins(trx, { ipAware })` — `false` 면 지금 SQL 그대로. `true` 면 재직 ∧ `'*'` 계정과 대표 팀(`MIN(teamNo)` — `kysely-auth.repository.ts` `findPrincipal` 과 같은 규칙)을 읽고, 규칙 전량을 비잠금으로 읽어 `applicableIpLayer(rules, { userNo, teamNos }) === 'global'` 만 센다. 🔴 셈 쿼리는 이 파일 하나다 — 지점마다 적으면 서로 다르게 센다(hangang). CIDR 이 그 사람의 주소를 통과시키는지는 보지 않는다 — "주소로 좁혀졌는가" 만 본다 |
| P5  | **사용자 수정** — `body.roleNo !== undefined \|\| body.teamNo !== undefined` 면 잔존으로 감싼다(IP 모듈 유무와 무관 — 갈래를 줄인다. 없으면 판정이 늘 통과). `teamNo` 의 `lockTeam` 은 이미 잠금 단계다(2d-3 C3)                                                                                                                                                                                                                                               |
| P6  | **IP 쓰기 셋** = `withSuperAdminSurvival(trx, { lock, write }, { ipAware: true })`(§5-3 표). 🔴 **자기 잠금은 쓴 뒤의 결과 상태로 판정한다** — `write` 끝에서 규칙 전량을 다시 읽어(자기 쓰기가 보인다) 요청자를 `evaluateIpAccess` 로 평가, 거부면 409 → 롤백. 요청자 = 주체의 `userNo` · 대표 팀 `teamNo` · 요청의 `clientIp`. hangang 의 "다음 규칙 시뮬레이션" 은 미리보기에만 남는다                                                                      |
| P7  | **참조 행 잠금(잠금 단계)** — 팀: `teams` FOR UPDATE(`lockTeam` 과 같은 쿼리, 없으면 400 `scopeRefNo`), 사용자: `users` FOR UPDATE(없으면 400 `scopeRefNo`). 수정은 **병합 결과**가 가리키는 참조만 잠근다. 팀 삭제와는 팀 행에서 줄을 선다(§5-4)                                                                                                                                                                                                              |
| P8  | **범위 불변식** — `scopeType === 'global'` ⇔ `scopeRefNo === null`. 만들기는 본문 스키마가, 수정은 서비스가 **병합 결과**에 대해 같은 함수 `isValidIpScope` 로 본다(hangang R30 — PATCH 가 `scopeType` 만 바꿔 어느 층에도 안 걸리는 행을 만드는 것). 어기면 400 칸 오류 `scopeRefNo`                                                                                                                                                                          |
| P9  | **팀 삭제** — 서브트리 팀 행을 잠근 뒤 소속 셈(지금) → 규칙 셈(`scopeType = 'team' ∧ scopeRefNo IN 서브트리`, 비잠금) → 있으면 409 `ERR_TEAM_HAS_IP_RULES` + `ruleCount`. 소속 409 가 먼저다. 팀 모듈은 IP 모듈 유무와 무관하게 센다(표는 늘 있다)                                                                                                                                                                                                             |
| P10 | **`clientIp` 출처** — 코어 모듈이 옵션을 해석해(두 값 밖이면 기동에서 멈춘다) 내부 토큰으로 내고, 인증 서비스 · 감사 기록이 `requestMetaOf(req, source)` 에 넘긴다. `'req.ip'`: `req.ip` 를 정규화. `'x-real-ip'`: 헤더가 문자열이고 IP 하나로 읽히면 그 정규화 값, 배열 · 쉼표 · 형식 오류면 `null`(fail-closed — 중복 헤더가 이어 붙은 값에서 앞쪽을 고르면 위조 값을 고른다), 헤더가 없으면 `req.ip` 정규화                                                 |
| P11 | **refresh IP 검사(새 동작)** — `refresh()` 의 `assertActive` 뒤, 유예 발급(`reuseOfRotated` 의 grace 갈래)의 `assertActive` 뒤. 대표 팀은 `findPrincipal`. 거부면 `access.blocked`(`reason: 'ip'`, `sessionNo` = 회전 대상 행) → 403. 판정 순서는 퇴사 → IP(로그인 · 가드와 같다). 막힌 주소에서 새 토큰을 찍어 내지 않는다                                                                                                                                    |
| P12 | **미리보기** — hangang `previewIpLockout` · `judgeIpLockout` · `appliedRuleFingerprint` · `lockoutGrade` · `buildLockoutCandidates` · `nextRulesOf` 를 `ip-access/preview.ts` 로 이식한다. 모집단은 오늘 로그인할 수 있는 사용자 전원(`resignAt IS NULL OR resignAt > now` — 우리 `resignAt` 은 효력 시각). 🔴 hangang 의 "팀 배정 있는 계정만" 은 뺀다 — 우리 인증은 무소속 계정도 통과시킨다(빈 `teamNos`)                                                   |
| P13 | **목록 행** — `scopeName`(팀 이름 · 사용자 이름) · `scopeUserId`(사용자일 때 아이디, 그 밖 `null`)를 `teams` · `users` LEFT JOIN 으로 싣는다. 쓰는 쪽이 `users` 행을 직접 지워 대상이 없는 사용자 규칙은 둘 다 `null`                                                                                                                                                                                                                                          |
| P14 | **문구** `IP_ACCESS_MESSAGES` 하나(`ip-access/errors.ts`) — 서비스 · 테스트가 같은 문구를 쓴다. 잔존 문구 `ACCOUNT_MESSAGES.lastSuperAdmin` 을 IP 를 아는 문장으로 넓힌다(IP 모듈이 없어도 참인 문장 — §6)                                                                                                                                                                                                                                                     |
| P15 | **테스트 도우미** — 잠금을 쥔 채 관찰하는 루프(teams.guard · legal.guard 의 `underHeldGuard`, roles.index 의 `underHeldRole`)를 `test-support/concurrency.ts` 로 모으고, observer 연결이 열리다 실패하면 holder 를 정리한다. `whileHeld` 가 대기 수에 닿았는지(`reached: boolean`)를 돌려준다 — 경합 테스트가 경합 창에 닿았음을 단언한다                                                                                                                      |

## 3. 정본

- `hangang-home apps/api/src/core/utils/request-ip.util.ts` — `normalizeIp` · 파서 · `ipInCidr`(R16 v4-mapped 접기 · 선행 0 거부 · 존 인덱스). **`getClientIp` 의 헤더 순서는 버린다**(④ C1).
- `hangang-home apps/api/src/modules/ip-access/ip-evaluation.ts` — 층 · 평가 · 미리보기 판정. `assertNotSelfLockout` 은 결과 판정으로 바꾼다(P6).
- `hangang-home apps/api/src/modules/ip-access/ip-access.service.ts` · `.controller.ts` · `.dto.ts` — CRUD · 미리보기 쿼리 셋 · 범위 불변식(R30) · 참조 검사(R28).
- `hangang-home apps/api/src/core/database/migrations/007_ip_access_rules.migration.ts` · `tables/ip-access-rules.table.ts` — 표 모양.
- `hangang-home apps/api/src/core/permissions/monotonicity.ts` `countReachableSuperAdmins` — A1(잔존 셈 · 여섯 지점).
- 테스트 이식: `ip-evaluation.test.ts`(489줄) · `request-ip.util.test.ts`(178) · `ip-access.preview.test.ts`(424) · `ip-access.dto.test.ts`(280).

hangang 에서 바꾼 점: 헤더 순서(④) · 잠금(규칙 전 구간 `FOR UPDATE` → 잔존 가드 행 — §5-3) · 자기 잠금 결과 판정(P6) · 재인증 옵션 · `revision` · 미리보기 모집단(P12) · refresh 검사(P11) · 팀 삭제 409(⑤) · 시드가 장(③) · 셈의 대표 팀(hangang 은 셈만 팀 전부를 실었다 — 로그인과 같은 대표 팀 하나로).

## 4. 공개 API

**admin-shared** (`src/ip-access.ts` — index 에 낸다)

- 함수: `normalizeIp` · `isValidIp` · `parseCidr` · `isValidCidr` · `ipInCidr` · `applicableIpLayer` · `evaluateIpAccess` · `isValidIpScope`.
- 타입: `IpScopeType`(`'global' | 'team' | 'user'`) · `IpRule` · `IpSubject` · `ParsedCidr`.
- 스키마: `ipCidrSchema`(trim · 1 ~ 43자 · `isValidCidr`) · `ipScopeTypeSchema` · `adminIpRuleSchema` · `adminIpRuleListSchema`(`{ items }`) · `adminIpRuleCreateSchema` · `adminIpRuleUpdateSchema` · `adminIpRuleRemoveSchema` · `adminIpPreviewQuerySchema` · `adminIpPreviewSchema`. `currentPassword` 는 역할 본문과 같은 방식(선택).
- 카탈로그: `CoreAuditActions.IP_ACCESS_CREATE` · `IP_ACCESS_UPDATE` · `IP_ACCESS_DELETE`(`setting.ipAccess.create` · `update` · `delete`, 라벨 `IP 규칙 추가` · `IP 규칙 수정` · `IP 규칙 삭제`) · `CoreAuditTargets.IP_ACCESS_RULE`(`ipAccessRule`, 라벨 `IP 규칙`) · `CommonErrorCodes.ERR_TEAM_HAS_IP_RULES`(409).

**admin-server** (index 에 낸다)

- `AdminIpAccessModule` · `AdminIpAccessRulesTable` · `AdminDatabase.ipAccessRules`.
- `AdminServerOptions.clientIp` · `AdminClientIpSource`(`'req.ip' | 'x-real-ip'`).
- `AdminPermissionSlot` 에 `'ipAccess.read'` · `'ipAccess.manage'`.
- 진입점 `./migrations/0012_ip_access_rules`.

내지 않는다: 서비스 · 정책 클래스 · 미리보기 함수 · `IP_ACCESS_ENABLED` · 출처 토큰 · 문구 표 · 파이프.

## 5. 흐름

### 5-1. 평가와 인증 연결

```
clientIp = requestMetaOf(req, source).clientIp      ← 'req.ip' | 'x-real-ip', normalizeIp
allows({ clientIp, userNo, teamNos: [대표 팀] })
  rules = SELECT scopeType, scopeRefNo, cidr FROM ipAccessRules        (비잠금)
  layer = applicableIpLayer(rules, subject)      user → team → global, 앞 층에 규칙이 하나라도 있으면 뒤는 안 본다
  layer == null → false (기본 거부)
  rulesOfLayer(layer).some(r => ipInCidr(clientIp, r.cidr))   ← clientIp null → false

로그인    비밀번호 → 잠김 → 퇴사 → IP ── false → login.blocked(ip) → 403 { clientIp }      (2b 그대로)
매 요청   세션 → 주체 → 퇴사 → IP ──── false → access.blocked(ip) → 403 { clientIp }     (2b 그대로)
refresh   세션 → 만료 → 퇴사 → IP ──── false → access.blocked(ip) → 403 { clientIp }     (P11 — 새 동작)
유예 발급 퇴사 → IP ───────────────── 〃
```

- 규칙을 바꿔도 세션을 끊지 않는다(hangang) — 막힌 주소의 요청이 가드에서 403 을 받는다. admin-ui 는 refresh 실패라 `onAuthFailure`(로그인 화면) + `onError`(IP 차단 대화상자)가 함께 돈다.
- 인증 요청의 DB 왕복이 둘에서 셋(세션 · 주체 · 규칙)이 된다. 규칙 표는 작고 인덱스 없이 전량을 읽는다.

### 5-2. 잔존 (`accounts/super-admin.ts`)

```
withSuperAdminSurvival(trx, { lock, write }, { ipAware })
  센티넬 superAdminSurvival (첫 문장) → lock() → before = countSuperAdmins(trx, { ipAware })
  → write(locked) → after = countSuperAdmins(trx, { ipAware }) → before ≥ 1 ∧ after < 1 이면 409
```

| 지점                       | 감싸는 조건                        | IP 로 셈이 줄어드는 경로                                    |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| 역할 권한 수정 · 역할 삭제 | 지금 그대로                        | —                                                           |
| 사용자 수정                | `roleNo` 또는 `teamNo` 가 있음(P5) | 시나리오 B — 전권자를 팀 규칙이 있는 팀으로 옮김            |
| 퇴사                       | 지금 그대로(늘)                    | —                                                           |
| IP 만들기 · 수정 · 삭제    | 늘(`ipAware: true`)                | 시나리오 A — 전권자에게 user 규칙, 마지막 global 행 삭제 등 |

- `ipAware` 는 IP 서비스가 아니면 `IP_ACCESS_ENABLED` 토큰 유무다(P3). IP 서비스는 늘 `true` 다.
- "있었는데 0 이 되면 거부" 그대로 — 전 전권자를 사무실 IP 로 묶은 조직(이미 0)에서 다른 쓰기가 막히지 않는다.

### 5-3. IP 쓰기 (`ip-access/ip-access.service.ts`)

재인증(옵션)은 트랜잭션 밖 · 권한 가드 뒤. 나머지는 `runWriteTransaction` 안의 `withSuperAdminSurvival(…, { ipAware: true })`:

| 쓰기   | 잠금 단계(잠금 읽기 · 판정만)                                                                           | 쓰기 단계(셈 뒤)                                                                |
| ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 만들기 | (불변식은 본문 스키마) 참조 행 잠금(P7)                                                                 | INSERT → 자기 잠금 판정(P6) → 결과 행 읽기                                      |
| 수정   | 대상 규칙 FOR UPDATE(없으면 404) → `revision` 409 → 병합 결과 불변식(P8) → 병합 결과의 참조 행 잠금(P7) | 전 행 읽기 → UPDATE(`revision + 1`, `updateAt`) → 자기 잠금 판정 → 결과 행 읽기 |
| 삭제   | 대상 규칙 FOR UPDATE(없으면 404) → `revision` 409                                                       | 전 행 읽기 → DELETE → 자기 잠금 판정                                            |

- 🔴 모든 IP 쓰기가 잔존 가드 행을 첫 문장으로 잡으므로 IP 쓰기끼리 직렬화된다 — hangang 의 "규칙 전 구간 FOR UPDATE → 가드" 2단 잠금이 필요 없고, 한 트랜잭션 = 가드 행 하나 규약도 지켜진다. 자기 잠금 · 셈이 읽는 규칙 전량은 가드 뒤 비잠금 읽기라 다른 IP 쓰기의 커밋을 모두 본다.
- 🔴 자기 잠금 판정은 셈 뒤(쓰기 단계)다 — 잠금 단계에 두면 비잠금 읽기가 뷰를 먼저 연다(2d-3 C2).
- 감사: 컨트롤러가 커밋 뒤 `attachAuditTarget` · `attachAuditDiff(before, after, IP_RULE_AUDIT_FIELDS)` — 필드 `scopeType` · `scopeRefNo` · `cidr` · `description`. 만들기 `(null, 행)`, 삭제 `(행, null)` — 지운 규칙은 감사에서만 복원된다. 409 로 롤백된 쓰기는 diff 를 붙이지 않는다(실패 행 meta `null` — 2e-2 R6 ④).

### 5-4. 팀 삭제 (`teams/teams.service.ts`)

```
teamTree 가드 → 대상 → 하위 팀 행(FOR UPDATE) → 소속 셈(비잠금, 첫 비잠금 읽기) → 규칙 셈(비잠금) → DELETE teams
                                                  └ > 0 → 409 TEAM_HAS_MEMBERS   └ > 0 → 409 TEAM_HAS_IP_RULES { ruleCount }
```

- 팀 삭제 ∥ 같은 팀(서브트리)을 가리키는 규칙 만들기 · 수정: 팀 행에서 줄을 선다. 규칙 쪽이 먼저 잠그면 팀 삭제가 기다린 뒤 연 읽기 뷰가 그 규칙을 보고 409. 팀 삭제가 먼저면 규칙 쪽 `lockTeam` 이 기다린 뒤 행이 없어 400 `scopeRefNo`.
- 규칙을 다른 범위로 옮기는 수정 ∥ 팀 삭제: 옛 팀은 잠그지 않는다. 팀 삭제가 커밋 전 규칙을 보면 409(그 순간에는 참), 커밋 뒤를 보면 통과 — 어느 쪽도 죽은 행을 남기지 않는다.

### 5-5. 전역 잠금 순서 (2e §5-1 갱신)

```
superAdminSurvival(가드) → users → roles → teamTree(가드) → teams → teamClosure → teamUserMap · userEmploymentPeriods → ipAccessRules → sessions
legalPublish(가드) → legalDocuments (→ FK 검사로 발행자 users 행 S)
```

| 쓰기                 | 잡는 것(차례대로)                                                                                                   | 겹칠 때                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| IP 만들기 · 수정     | 잔존 가드 → (수정 · 삭제: 대상 규칙) → (만들기 · 수정: users \| teams 참조 행 — 수정은 병합 결과) → INSERT · UPDATE | 다른 잔존 쓰기와 가드에서 줄을 선다. 팀 삭제와는 팀 행 하나에서 |
| IP 삭제              | 잔존 가드 → 대상 규칙 → DELETE                                                                                      | 〃                                                              |
| 사용자 수정(팀 변경) | 잔존 가드 → users ⋈ roles → 줄 역할 → `lockTeam` → teamUserMap                                                      | 2e 표 그대로 — 가드를 잡는 갈래가 늘었을 뿐 순서는 같다         |
| 팀 삭제              | teamTree → 대상 → 하위 팀 → 소속 셈 · 규칙 셈(비잠금) → DELETE                                                      | 2e 표 + 규칙 쓰기와 팀 행 하나에서                              |

- 🔴 2e §5-1 의 "2f 메모"(팀 쓰기에 잔존 가드가 필요하면 가드 행 둘의 고정 순서)는 **생기지 않는다**: 팀 쓰기 넷은 소속을 바꾸지 않아(삭제는 소속 있으면 409, 조상 상속 없음) 아무의 층도 바꾸지 않는다. 층을 바꾸는 것은 사용자 수정의 `teamNo` 이고, 그것은 이미 users 쪽 트랜잭션이다(가드 행 하나).
- 🔴 IP 수정은 대상 규칙 행을 먼저 잠그고(병합 결과를 알려면 규칙을 읽어야 한다) 그다음 참조 행을 잠근다 — 위 전역 순서의 teams → … → ipAccessRules 와 반대지만, ipAccessRules 행을 잠그는 트랜잭션은 모두 잔존 가드를 먼저 잡으므로 사이클이 생기지 않는다. 가드 없이 규칙 행을 잠그는 새 경로를 만들지 않는다.
- 이름만 바꾸는 사용자 수정(가드 없음)이 사용자 행을 X 로 쥐면, 그 사용자를 가리키는 IP 쓰기는 그 행만 기다린다 — 그쪽은 가드를 원하지 않으므로 사이클이 없다. 로그인의 `updateLoginState` 도 같다.

### 5-6. 미리보기 (`GET /ip-access/preview`)

```
now 한 번 → rules(ruleNo 포함, 비잠금) → next = nextRulesOf(rules, query)   ← op 없음: 지금 상태, 없는 ruleNo: 404
users   = 오늘 로그인할 수 있는 사용자 전원(resignAt IS NULL OR resignAt > now)
teams   = 대표 팀(MIN(teamNo))           ← 빈 userNos 면 쿼리하지 않는다(IN () 구문 오류)
sessions = 폐기 안 됨 ∧ 만료 안 됨의 ipAddress
→ previewIpLockout(candidates, rules, next) + { clientIp, clientPasses: evaluateIpAccess(clientIp, next, 요청자) }
```

- 잠금 · 트랜잭션 · 감사 · 재인증이 없다 — 읽은 순간의 스냅숏이라 저장이 409(자기 잠금 · 잔존 · revision)일 수 있다(README).
- 슬롯은 `ipAccess.manage` — 남의 접속 주소와 요청자 자신의 IP 를 내보인다(hangang).
- 쿼리는 모듈 수준 함수로 둬 컴파일된 SQL 을 단위 테스트가 잰다(hangang — 사람이 목록에서 조용히 빠지는 것을 막는다).

### 5-7. 목록 (`GET /ip-access`)

`ipAccessRules ⟕ teams(scopeType = 'team') ⟕ users(scopeType = 'user')`, 정렬 `scopeType`(문자 순 = global · team · user) → `ruleNo`. 페이징 없음(hangang).

## 6. 오류 표

| 자리                              | 상태 · 코드                               | 문구(`IP_ACCESS_MESSAGES` · `ACCOUNT_MESSAGES`)                                                                                                                                  |
| --------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CIDR 형식                         | 400 칸 오류 `cidr`                        | admin-shared `ipCidrSchema`: `IPv4 · IPv6 CIDR 형식이 아닙니다. 예: 203.0.113.0/24, 2001:db8::/32`                                                                               |
| 범위 불변식(만들기 · 병합 결과)   | 400 칸 오류 `scopeRefNo`                  | `scopeRefRequired`: `팀 · 사용자 규칙은 대상을 골라야 합니다.` / `scopeRefForbidden`: `전체 규칙에는 대상을 두지 않습니다.`                                                      |
| 참조 대상 없음                    | 400 칸 오류 `scopeRefNo`                  | `noScopeTeam`: `대상 팀을 찾을 수 없습니다.` / `noScopeUser`: `대상 사용자를 찾을 수 없습니다.`                                                                                  |
| 규칙 없음(수정 · 삭제 · 미리보기) | 404 `ERR_COMMON_NOT_FOUND`                | `ruleNotFound`: `IP 규칙을 찾을 수 없습니다.`                                                                                                                                    |
| revision                          | 409 `ERR_COMMON_REVISION_CONFLICT`        | `ruleRevisionMismatch`: `다른 관리자가 먼저 이 규칙을 바꿨습니다. 새로 불러온 내용을 확인하세요.`                                                                                |
| 자기 잠금                         | 409 `ERR_COMMON_CONFLICT` + `clientIp`    | `selfLockout`: `이 변경을 저장하면 지금 접속한 위치에서 로그인할 수 없게 됩니다.`                                                                                                |
| 잔존(모든 지점)                   | 409 `ERR_COMMON_CONFLICT`                 | `lastSuperAdmin`(넓힘): `이 변경 뒤에는 어디서든 로그인할 수 있는 전체 권한 관리자가 한 명도 남지 않습니다. 먼저 다른 관리자에게 전체 권한 역할을 주거나 접속 IP 제한을 푸세요.` |
| 팀 삭제                           | 409 `ERR_TEAM_HAS_IP_RULES` + `ruleCount` | `teamHasIpRules`: `이 팀(하위 팀 포함)을 가리키는 IP 규칙이 있어 지울 수 없습니다. 규칙을 먼저 지우세요.`                                                                        |
| 쓰는 중(1020 · 1213 · 1205)       | 409 `ERR_COMMON_CONFLICT`                 | 지금 매핑 그대로(다시 시도)                                                                                                                                                      |
| 차단(로그인 · 가드 · refresh)     | 403 `ERR_IP_NOT_ALLOWED` + `clientIp`     | `AUTH_MESSAGES.ipNotAllowed` 그대로                                                                                                                                              |
| `clientIp` 옵션 값                | 기동 실패                                 | `clientIp 는 'req.ip' 또는 'x-real-ip' 여야 한다.`                                                                                                                               |

## 7. 의존성

새 의존성 없다. admin-shared 를 고친다(새 파일 하나 · 카탈로그 · 오류 코드).

## 8. 파일

```
packages/admin-shared/src/
  ip-access.ts · ip-access.test.ts                       P1 · 스키마(§4) — hangang 파서 · 평가 · dto 테스트 이식
  audit.ts · audit.test.ts                               IP 액션 셋 · 대상 · 라벨 · 개수
  error-codes.ts · error-codes.test.ts                   ERR_TEAM_HAS_IP_RULES(409)
  index.ts
packages/admin-server/src/
  test-support/concurrency.ts (+ .db.test.ts)             P15 — underHeldGuard 모음 · whileHeld reached
  teams/teams.guard.db.test.ts · legal/legal.guard.db.test.ts · roles/roles.index.db.test.ts   복사본(underHeldGuard · underHeldRole)을 도우미로
  database/migrations/0012_ip_access_rules.ts · index.ts · ddl.test.ts · migrations.db.test.ts
  database/tables/ip-access-rules.ts · types.ts
  options.ts · admin-server.module.ts · tokens.ts         clientIp · 출처 토큰 · IP_ACCESS_ENABLED
  auth/request-meta.ts · .test.ts                         P10
  auth/auth.service.ts · auth.service.refresh.db.test.ts · auth.http.db.test.ts   P11 · 출처
  audit/entry.ts(· 감사 기록 주입 자리)                    출처
  auth/permission-slots.ts · .test.ts                     슬롯 둘
  accounts/super-admin.ts · super-admin.db.test.ts · errors.ts   P4 · 문구
  roles/roles.service.ts · users/users.service.ts         ipAware 주입 · P5
  teams/teams.service.ts · teams/errors.ts · teams.*.db.test.ts   P9
  ip-access/ip-access.module.ts · .controller.ts · .service.ts · .policy.ts · preview.ts · queries.ts ·
    errors.ts · ip-access.body.ts · (테스트) preview.test.ts · queries.test.ts · ip-access.module.test.ts ·
    ip-access.service.db.test.ts · ip-access.survival.db.test.ts · ip-access.race.db.test.ts ·
    ip-access.http.db.test.ts · ip-access.auth.db.test.ts
  decorator-metadata.test.ts · index.ts
packages/admin-server/README.md                          IP 접근 제어 절 · clientIp · 잔존 · 팀 삭제
.changeset/admin-server-ip-access.md                     admin-shared minor · admin-server minor
docs/superpowers/specs/(2b · 2d · 2e 스펙)               §13
docs/01-phase0.md · docs/HANDOFF.md · CLAUDE.md
```

플랜은 `docs/superpowers/plans/2026-10-15-admin-server-ip-access.md`.

## 9. 테스트 계약

TDD — 실패하는 테스트부터. 구현자는 테스트를 먼저 만들고 구현 전에 돌려 RED 를 보고서에 붙인다. 🔴 잠금 · 순서 테스트는 구현 뒤 해당 줄을 일부러 되돌려 RED 를 한 번 더 본다. 경합 테스트는 공개 서비스 메서드를 거치고 `whileHeld` 의 `reached` 를 단언한다.

### 9-1. 단위 (`pnpm check`)

- **admin-shared 파서 · 평가**(hangang `request-ip.util.test.ts` · `ip-evaluation.test.ts` 이식): v4 · v6 · v4-mapped(`::ffff:203.0.113.0/120` 이 `203.0.113.9` 를 통과, `/64` 같은 96 미만 거부), 선행 0 거부, 존 인덱스, `::` 두 번 거부, 계열이 다르면 false(`::/0` 이 IPv4 를 통과시키지 않는다), 가장 가까운 층 하나(user 규칙 하나면 global 무시), 층 없음 = false, `null` IP = false, 팀 층의 빈 `teamNos`.
- **admin-shared 스키마**(hangang `ip-access.dto.test.ts` 이식): CIDR trim · 43자 · 형식 문구, 범위 불변식(만들기), 수정 본문은 `revision` 필수 · 나머지 선택, 미리보기 쿼리의 `op` 별 필수 칸, bigint 래퍼, 카탈로그 액션 · 대상 · 라벨 개수, 오류 코드 상태 409.
- **`requestMetaOf`**: `'req.ip'` 정규화(`::ffff:127.0.0.1` → `127.0.0.1`, `::1` → `127.0.0.1`), `'x-real-ip'` — 헤더 하나 · 없음(→ `req.ip`) · 배열 · 쉼표(`'1.2.3.4, 5.6.7.8'`) · 형식 오류 → `null`. 옵션 해석 — 두 값 밖이면 멈춤, 기본 `'req.ip'`.
- **미리보기**(hangang `ip-access.preview.test.ts` 의 순수 부분 이식): 층 없음은 세션 전에 `locked` · 주소 미상 세션도 `blockedSessionCount` 에, `becomesLocked` 는 전에 안 잠겼던 사람만, `ruleSetChanged`(층 이름 포함 지문 · 중복 · 순서 무관), 정렬 등급, `summary.blockedSessions = Σ items`, 대표 팀 하나(`buildLockoutCandidates`), 무소속 · 무세션 계정이 남음. 쿼리 셋의 컴파일 SQL(재직 조건 `resignAt is null or resignAt > ?` · 팀 배정 조건 없음 · 세션 `isRevoked = false ∧ expireAt > ?`).
- **모듈**: 슬롯 둘 기동 검사 · 인증 모듈 미등록 기동 실패 · `ADMIN_ACCESS_POLICY` · `IP_ACCESS_ENABLED` 제공(전역), decorator-metadata 에 새 생성자.
- **ddl**: 0012 의 표 · 인덱스 `idx_ip_access_rules_scope` · 시드 두 행(컴파일된 SQL), 스텁 정규식이 0012 를 받는다.

### 9-2. 실 MariaDB (`pnpm test:db`)

- **도우미(P15)**: `underHeldGuard` 가 holder 를 쥐는 동안 쓰기가 잠금 대기에 닿는다 · observer 연결 실패에도 holder 가 풀린다, `whileHeld` 의 `reached` 가 닿으면 `true` · 시간 초과면 `false`. 옮긴 세 파일이 그대로 초록.
- **장**: 새 DB 에 표 · 인덱스 · 시드 두 행(global, `scopeRefNo` NULL).
- **정책**: 시드만 있을 때 아무 주소나 통과(v4 · v6), 시드를 지우면 거부, user 규칙 하나면 그 사람은 global 을 잃음, 대표 팀(소속 둘 — 작은 번호)의 팀 층.
- **잔존(`ip-access.survival.db.test.ts`)**
  - (s1) 시나리오 A — 전권자 S1 하나 · 요청자는 좁은 `ipAccess.manage` 관리자: S1 에게 user 규칙 만들기 → 409 `lastSuperAdmin`, 규칙 없음. 전권자가 둘이면 201.
  - (s2) 시나리오 B — 팀 규칙이 있는 팀 T, 전권자 S1 하나: 사용자 수정 `teamNo: T` → 409, 소속 그대로. RED: P5 의 `teamNo` 조건을 빼면 200.
  - (s3) 마지막 global 행 삭제(요청자는 user 규칙으로 자기 접속이 살아 있음) → 잔존 409(자기 잠금은 통과). 다른 global 행이 있으면 200.
  - (s4) 이미 0(전 전권자가 user 규칙) — 다른 IP 쓰기 · 역할 수정이 막히지 않는다.
  - (s5) IP 모듈 없음(`ipAware: false`) — 시드를 지운 DB 에서도 셈이 지금 그대로(재직 ∧ `'*'`) 라 마지막 전권자 퇴사가 409. RED: 표 유무로 가르면 통과.
- **자기 잠금**: 요청자 주소를 막는 만들기 · 수정 · 삭제 → 409 + `clientIp`, 규칙 그대로(롤백) · `revision` 그대로 · 감사 meta `null`. 다른 사람만 막는 변경은 통과.
- **CRUD**: 만들기 201 · 목록 정렬 · `scopeName` · `scopeUserId`, 수정의 병합 결과 불변식(global 행에 `scopeType: 'user'` 만 → 400 `scopeRefNo`), 없는 참조 400, revision 409, 없는 규칙 404, 삭제.
- **경합(`ip-access.race.db.test.ts` — `whileHeld`)**
  - (r1) 원시 연결이 팀 행을 쥔 채 삭제 모양 → 규칙 만들기가 기다렸다 400 `scopeRefNo`. 반대로 규칙 만들기가 팀 행을 쥔 채 → 팀 삭제가 기다렸다 409 `ERR_TEAM_HAS_IP_RULES`.
  - (r2) IP 쓰기 둘이 잔존 가드에서 줄을 선다 — global `10.0.0.0/8`(A 의 주소) · `192.168.0.0/16`(B 의 주소) 두 행에서 A 가 둘째를, B 가 첫째를 동시에 지운다. 각자는 자기 잠금을 통과하지만 둘이 다 커밋되면 둘 다 잠긴다 — 뒤의 쪽이 409 자기 잠금. RED: 가드를 빼면 둘 다 커밋.
  - (r3) 스냅샷 격리 ON — 원시 연결이 대상 사용자 행을 쥐고 이름을 바꾼 채 → 그 사용자를 가리키는 규칙 만들기가 기다렸다 성공(잠금 단계의 참조 잠금이 뷰보다 먼저). RED: 참조 잠금을 셈 뒤(쓰기 단계)로 옮기면 1020 → 409.
- **인증(`ip-access.auth.db.test.ts`)**: 막힌 주소 — 로그인 403(비밀번호 맞은 뒤) · 가드 403 · refresh 403 · 유예 발급 403, 감사 행 `auth.login.blocked.ip` · `auth.access.blocked.ip`. 규칙 변경 뒤 세션 행이 그대로. `'x-real-ip'` 옵션으로 헤더 주소가 판정 · 세션 행 · 감사 행에 같이 쓰인다.
- **HTTP 계약(`ip-access.http.db.test.ts`)**: §6 의 모든 행, 미리보기 응답(`clientIp` · `clientPasses` · `summary` · 정렬 · 없는 `ruleNo` 404), 슬롯(read 로 미리보기 403), 재인증 켬 → `currentPassword` 없으면 403 `ERR_REAUTH_REQUIRED`, 감사 diff 세 모양. 응답 봉투가 admin-shared 스키마로 파싱.
- **기존 테스트 기대값**: 세션 `ipAddress` · 감사 `ip` 가 정규화 값(`127.0.0.1`)으로 바뀌는 곳을 고친다.

### 9-3. 리뷰 초점 (플랜 · 리뷰어에게 넘긴다)

1. `ipAccessRules` 를 잠그는 곳이 IP 쓰기의 대상 행뿐인가 — 정책 · 셈 · 팀 삭제 · 미리보기 · 자기 잠금이 비잠금인가.
2. IP 쓰기의 잠금 단계에 비잠금 읽기가 없는가 — 참조 행 · 대상 규칙이 셈 앞, 전 행 읽기 · 자기 잠금이 셈 뒤(2d-3 C2).
3. 층 판정 · 대표 팀이 정책 · 셈 · 미리보기에서 같은 함수 · 같은 규칙인가(`applicableIpLayer` 하나, `MIN(teamNo)`).
4. `ipAware` 가 토큰 유무로만 정해지는가(표 · 행 유무가 아님), IP 서비스는 늘 `true` 인가.
5. `'x-real-ip'` 가 쉼표 · 배열 · 형식 오류를 `null` 로 내는가, 세션 · 감사 · 정책이 같은 값을 보는가.
6. refresh · 유예 발급의 IP 검사가 회전 · 새 세션 INSERT 앞인가, 판정 순서가 퇴사 → IP 인가.

## 10. 릴리스 · 문서

- **changeset** `.changeset/admin-server-ip-access.md` — admin-shared **minor**(IP 함수 · 스키마 · 액션 셋 · 대상 · 오류 코드), admin-server **minor**. 첫 줄은 쓰는 쪽이 할 일: "마이그레이션 폴더에 스텁 `export { up, down } from '@ssworks/admin-server/migrations/0012_ip_access_rules'` 한 줄(🔴 모든 장 필수 — 시드로 global 허용 두 행이 들어간다). IP 접근 제어를 쓰면 `permissions` 에 슬롯 `'ipAccess.read'` · `'ipAccess.manage'` 를 잇고 `AdminIpAccessModule` 을 import 한다. 엣지 프록시가 `X-Real-IP` 를 덮어쓰면 `clientIp: 'x-real-ip'`(아니면 `app.set('trust proxy', …)`). 세션 · 감사의 IP 가 정규화 값(`127.0.0.1`)으로 남는다. 사용자 수정의 `teamNo` 변경이 마지막 전권자에서 409 일 수 있다. 팀 삭제가 그 팀을 가리키는 IP 규칙이 있으면 409. refresh 가 막힌 주소에서 403 이다." 쓰는 쪽 감사 카탈로그가 `setting.ipAccess.*` · `ipAccessRule`(또는 키 `IP_ACCESS_*` · `IP_ACCESS_RULE`)을 이미 정의했다면 겹침 검사가 던진다(2e-1 · 2e-2 와 같다).
- **admin-server README**: "IP 접근 제어" 절(평가 규칙 · 기본 거부 · 시드 · 자기 잠금 · 잔존 · 미리보기가 스냅숏임 · 세션은 안 끊김 · 유닉스 소켓 뒤는 `'x-real-ip'` · 동시 쓰기 409 다시 시도), "인증" 절의 `clientIp` 출처 · refresh 의 IP 검사, "사용자 · 계정" 의 팀 변경 잔존, "팀" 의 삭제 409.
- **`docs/01-phase0.md`** §8 admin-server 행 · ipAccess 옵션 행(고정 동작). **HANDOFF** — "PR 2b 가 넘긴 것" 의 2f 항목 · "PR 2e-2 최종 리뷰가 넘긴 것" 의 테스트 도우미를 닫고, 다음 플랜을 2f-2 로. **CLAUDE.md** — 진행 표(2f → 2f-1 완료 · 2f-2 다음), admin-server 규약에 IP 줄("IP 쓰기는 잔존 가드가 첫 문장, 자기 잠금은 쓴 뒤 판정, 규칙 표는 대상 행 말고 비잠금").
- **쓰는 쪽 스모크**(`%TEMP%\akss`, 새 DB): tarball → 스텁 12장 → 시드 → 기동 → 규칙 목록(시드 둘) → user 규칙 만들기 → 미리보기 → 자기 잠금 409 → `clientIp: 'x-real-ip'` 로 다시 기동 → 헤더 주소가 막히면 403 → 감사 행.

## 11. 비범위 · 보류

- 2f-2 몫: rotate 잠금 순서(users 먼저 FOR SHARE) · 로그인 TOCTOU, DB TLS(`ssl`) · `socketPath`, admin-shared peer 하한, `pagination.d.ts` TS2536.
- IP 관리 화면(규칙 표 · 대상 고르기 · 미리보기 표시 · 재인증) — 템플릿 B. admin-ui 는 이미 `IpBlockedDialog` 를 갖고 있다.
- 미리보기의 잔존 결과(`survives`), 규칙 캐시, 조상 팀 상속 · role · apiKey 층(crm), 규칙 중복 막기(평가에 무해 — hangang 과 같다).
- 쓰는 쪽이 `users` 행을 직접 지웠을 때의 사용자 규칙 고아(목록에 `scopeName: null` — 패키지에 사용자 삭제 경로가 없다).
- 규칙 변경으로 세션 끊기(hangang 미리보기의 "세션 종료 제안" 은 화면 몫 — 세션 모듈의 기존 라우트로 한다).

## 12. 플랜에서 먼저 확인할 위험

플랜을 쓰기 전에 패키지 DB 하네스의 임시 프로브(`src/zz-probe-*.db.test.ts` — 다 재면 지운다)와 실 MariaDB 11.4 로 재고 결과를 §14 R1 에 적는다.

1. **(a) 참조 행 잠금 ∥ 사용자 · 팀 쓰기.** IP 쓰기가 사용자 행을 FOR UPDATE 하는 동안 그 사용자의 로그인 실패 · 이름만 바꾸는 수정 · refresh 회전이 기다리기만 하고 교착이 없는가. 팀 행을 쥔 동안 팀 이름 바꾸기 · 이동 · 삭제가 줄을 서는가. 스냅샷 격리 ON 에서 1020 이 없는가.
2. **(b) 팀 삭제 ∥ 규칙 쓰기** 양쪽 순서(§5-4) — ON · OFF 결과가 표와 같은가, 서브트리 하위 팀을 가리키는 규칙도 잡는가.
3. **(c) IP 를 아는 셈** — `MIN(teamNo)` 서브쿼리 + 규칙 전량 비잠금 읽기가 센티넬 뒤 첫 비잠금 읽기로 뷰를 여는 자리를 바꾸지 않는가(2d-3 재배치 테스트가 그대로 초록인가). 사용자 수정이 `teamNo` 만으로 가드를 잡게 된 뒤 `users.snapshot` · `users.team` 경합 테스트가 그대로인가.
4. **(d) refresh 에 주체 읽기를 더한 것** — `findPrincipal`(비잠금)이 회전 전에 들어가도 2b 의 회전 경합 테스트(P1 · P2 · 유예)가 그대로인가.
5. **(e) 헤더 모양** — Express 5 · Node 24 에서 `X-Real-IP` 를 두 번 보내면 `req.headers['x-real-ip']` 가 `'a, b'` 문자열인지 배열인지. supertest 의 `req.ip` 가 `::ffff:127.0.0.1` 인지(정규화로 바뀌는 기존 기대값의 수).

## 13. 선행 문서 정정

- **2b 스펙** — §14 에 한 줄: refresh · 유예 발급에 IP 검사(P11 — §5 refresh 흐름 "퇴사 → 회전" 이 "퇴사 → IP → 회전"), 세션 메타 `clientIp = req.ip ?? null` → `requestMetaOf(req, source)` 정규화 값(P10), §11 "IP 평가 · request-ip.util · trust proxy → 2f" 를 이 문서가 닫는다.
- **2d 스펙** — §14 에 한 줄: 잔존 셈이 IP 모듈이 있으면 도달 가능 전권자(② R1 · P4), 잔존 지점에 IP 쓰기 셋 · 사용자 `teamNo` 변경(P5), 문구 `lastSuperAdmin` 을 넓혔다.
- **2e 스펙** — §14 에 한 줄: §5-1 전역 잠금 순서에 `ipAccessRules`, "2f 메모" 는 생기지 않음(§5-5), 팀 삭제에 규칙 셈 409(⑤ T1).
- **2a 스펙** — §1 지도의 2f 행이 2f-1 · 2f-2 로 나뉘었다(① S1).
- **`docs/01-phase0.md`** — ipAccess 옵션 행: 옵션 없음 · 고정 동작(2-2 #3). **CLAUDE.md** · **HANDOFF** — §10 대로.

## 14. 구현 중 정정

§12 의 확인 결과와 구현 · 리뷰에서 바뀐 것을 `R<n>` 으로 더한다.

- **R1 — 플랜 전 실측(2026-10-15, MariaDB 11.4 · Node 24.21 · Express 5.2.1, 임시 프로브 `src/zz-probe-ip.db.test.ts` — 지움).** 규칙 표는 프로브가 §4 모양으로 만들었다.
  - ① (b) 팀 삭제 ∥ 규칙 쓰기 — 규칙 쪽(잔존 가드 → 팀 행 FOR UPDATE → INSERT)이 먼저 쥐면 팀 삭제 모양(teamTree → 팀 행 FOR UPDATE → 소속 셈 · 규칙 셈 비잠금)이 기다린 뒤 `{ members: 0, rules: 1 }` — ON · OFF 같다. 팀 삭제(teamTree → 팀 행 → DELETE)가 먼저 쥐면 규칙 쪽의 참조 잠금(가드 → 팀 행 FOR UPDATE)이 기다린 뒤 행 없음 — ON 에서도 1020 이 없다(잠금 읽기가 읽기 뷰보다 먼저다). §5-4 표 그대로다.
  - ② (a) 대상 사용자의 로그인 실패(users 행 FOR UPDATE → UPDATE)를 쥔 동안 규칙 쓰기 모양(가드 → users 행 FOR UPDATE → 셈 비잠금 → INSERT)이 기다렸다 성공 — ON · OFF 같다. 🔴 RED 모양(가드 → 셈 → users 행 FOR UPDATE)은 ON 에서 `1020 Record has changed since last read in table 'users'`, OFF 는 성공 — §9-2 (r3) 의 RED 실험이 실제로 RED 다.
  - ③ (c) 대표 팀 `LEFT JOIN (SELECT userNo, MIN(teamNo) … GROUP BY userNo)` — 소속 둘이면 작은 번호(`bigint`), 무소속이면 `null`. `json_contains(r.permissions, '"*"')` 와 함께 써도 그대로다. 사용자 수정이 `teamNo` 만으로 가드를 잡게 된 뒤의 기존 경합 테스트(`users.snapshot` · `users.team`)와 (d) refresh 의 회전 경합 테스트는 구현 Task 가 `pnpm test:db` 전량으로 잰다.
  - ④ (e) 헤더 — `X-Real-IP` 를 두 번 보내면 `req.headers['x-real-ip']` 는 배열이 아니라 `'1.2.3.4, 5.6.7.8'` 한 문자열이다(Node 가 이어 붙인다) — P10 의 쉼표 거부가 이 모양을 막는다. 헤더가 없으면 `undefined`. `listen(0, '127.0.0.1')` 의 `req.ip` 는 `'127.0.0.1'`, 듀얼스택(`'::'`)에 IPv4 로 붙으면 `'::ffff:127.0.0.1'`. 기존 테스트 중 `::ffff:` 값을 기대하는 것은 없다(서비스 테스트의 `fakeRequest` 는 `10.0.0.1` 등 일반 IPv4) — 정규화로 바뀌는 기대값은 `request-meta.test.ts` 뿐이다.
- **R2 — 플랜이 더한 작은 결정(2026-10-15, 2f-1 플랜).** ① 범위 불변식 문구 둘(`scopeRefRequired` · `scopeRefForbidden`)과 미리보기 빠진 칸 문구는 admin-shared `IP_ACCESS_SCHEMA_MESSAGES` 에 둔다(화면과 같은 문구) — §6 의 `IP_ACCESS_MESSAGES` 는 서버 문구 다섯(규칙 없음 · revision · 자기 잠금 · 대상 팀 · 대상 사용자)이다. 판정 함수는 `ipScopeProblem`(문구 또는 null) + `isValidIpScope`. ② 팀 삭제 문구는 `TEAM_MESSAGES.teamHasIpRules`(팀 문구 표). ③ `clientIp` 해석은 인증(`ResolvedAuthConfig.clientIp`) · 감사(`ResolvedAuditConfig.clientIp`) · IP 모듈(`ResolvedIpAccessConfig.clientIp`)이 같은 `resolveClientIpSource` 로 각자 한다 — 코어 토큰을 따로 두지 않는다. ④ 만들기 응답은 `{ item }`(역할의 `{ roleNo }` 와 다르다 — 화면이 revision · 대상 이름을 바로 쓴다). ⑤ 테스트 앱 `bootAdminApp` 이 IP 모듈을 늘 붙인다 — 모든 HTTP 테스트가 IP 판정 · IP 를 아는 잔존과 함께 돈다. ⑥ 잔존 (s2) 시나리오 B 는 `accounts/super-admin.ip.db.test.ts` 에 둔다(사용자 서비스의 셈 갈래와 같이). ⑦ `decorator-metadata.test.ts` 는 고치지 않는다(새 생성자를 재는 테스트가 아니다 — 모듈 테스트가 전역 주입을 잰다). ⑧ §5-5 의 IP 수정 잠금 순서를 코드(§5-3)대로 고쳤다 — 규칙 행 → 참조 행, 모든 규칙 행 잠금이 잔존 가드 뒤라 안전.
- **R(2f-2a) — 인증 연결(2026-10-15, 2f-2a 스펙).** P11 의 순서(퇴사 → IP)가 IP → 퇴사로 바뀌었다(2f-2a A7). §9-2 의 "로그인 403(비밀번호 맞은 뒤)" 은 401(비밀번호 전 — 2f-2a ② I1)이다. P2 정책에 진단 경고 둘(2f-2a A15).
- **R(2f-2b) — 파서 조이기(2026-10-15, 2f-2b 스펙 §5-5).** `normalizeIp` 는 `::ffff:` 를 점 표기 IPv4 앞에서만 떼고, 내장 IPv4 는 마지막 그룹에만, 루프백 CIDR 접기는 `/128` 에만(`::1/64` = `::/64`), v4-mapped 영역은 `::ffff:a.b.c.d` 꼴만 받는다. P1 의 함수 이름 · 단일 파서 원칙은 그대로다.
