# admin-server 사용자 · 계정 (Phase 2 PR 2d-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@ssworks/admin-server` 에 사용자 관리(`AdminUsersModule` — 목록 · 단건 · 재직 이력 · 만들기 · 수정 · 퇴사 · 퇴사일 정정 · 재입사 · 비밀번호 초기화 · 잠금 해제)를 더하고, 2d-1 이 넘긴 역할 쪽 이월 정리(트랜잭션 안 결과 읽기 · 꺼진 기본 역할 감사 · 순서 값 동률 · 이름 trim)를 닫는다. 쓰는 쪽은 사용자 슬롯 둘과 `AdminUsersModule` import 로 사용자 관리 화면(B)을 실서버에 붙인다.

**Architecture:** 날짜는 본문에서 `'YYYY-MM-DD'` 로 받고, 효력 시각(퇴사일 다음 날 0시 — 기준 시간대 `timeZone`, 기본 Asia/Seoul)은 순수 함수 `accounts/calendar.ts` 하나가 셈한다. 사용자 쓰기는 대상 `users ⋈ roles` 를 `FOR UPDATE` 로 잠그고 2d-1 판정 `judgeAccountCommand` 를 부른 뒤 쓴다 — 전체 권한 재직자를 줄일 수 있는 쓰기(역할 변경 · 퇴사)는 `withSuperAdminSurvival` 로 감싸고, 쓰기 안의 결정 읽기는 모두 잠금 읽기다(스냅샷 격리 · 낡은 읽기 — 스펙 §14 R5-6 · R7). 계정 만들기 · 초기화는 서버가 만든 16자 임시 비밀번호를 트랜잭션 밖에서 해시하고 응답에만 싣는다.

**Tech Stack:** NestJS 12.1 (ESM · NodeNext) · Kysely 0.29 + MariaDB 11.4 · zod 4 · vitest 4 · supertest · TypeScript 5.9

**Spec:** `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` — 결정 ⓪~⑬(§2-1) · 공통 1~13(§2-2) · 설계 B1~B16(§2-3) · §4-1 · §4-2 · §4-3 · §4-6 · §4-7 · §5-1 · §5-6 · §5-7 · §6 · §9 [2] · §14 R1 · R5(이월 결정) · R6(글자 정정) · R7(실측). 이 플랜은 그 스펙의 **[2]**(2d-2) 부분과 R5 이다. 어긋나면 스펙이 이긴다. 직전 PR 2d-1 플랜: `docs/superpowers/plans/2026-10-14-admin-server-roles.md`.

**구현자 규칙(모든 Task):** 테스트를 먼저 만들고 **구현 전에 돌려 RED 를 보고서에 붙인다**(실패 메시지 몇 줄). 그다음 구현 · GREEN · 커밋. 🔴 표시가 붙은 순서 · 잠금 테스트는 구현 뒤에 해당 두 줄을 일부러 바꿔 RED 를 한 번 더 보고(보고서에 적고) 되돌린다. 리뷰어는 이 플랜의 해당 Task 와 Global Constraints 를 **먼저 다 읽고** 리뷰한다.

## Global Constraints

- ESM 전용 · `module: NodeNext`. 내부 상대 import 는 `.js` 확장자. `console.log` 금지(`Logger.warn` · `error` 만).
- `admin-server/src` 는 `import type` 분리 규칙의 예외다(DI 메타데이터) — 단 데코레이터가 붙은 시그니처(생성자 · 핸들러 매개변수)에 쓰는 **인터페이스 · 타입 별칭은 `import type`**(TS1272), DI 로 받는 **클래스는 일반 import**.
- 정본에서 옮긴 파일은 머리 주석에 `정본:` 과 `바꾼 점:` 을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 패키지는 권한 키를 하드코딩하지 않는다 — 슬롯 이름만: `'users.read'` · `'users.manage'`(이 PR), 2c · 2d-1 의 `'sessions.read'` · `'sessions.manage'` · `'auditLogs.read'` · `'roles.read'` · `'roles.manage'`.
- 사용자 테이블 컬럼 차이는 `AUTH_REPOSITORY` 교체로 흡수한다 — 사용자 목록 · 관리 쿼리는 코어 `users` 를 직접 읽고 쓴다(2c B4). 컬럼 매핑 옵션을 만들지 않는다. 확장 필드는 없다(⑩ X1).
- **날짜**: 본문 · 응답의 날짜는 `'YYYY-MM-DD'`(admin-shared `calendarDateSchema`). 퇴사 효력 시각 = 기준 시간대에서 **퇴사일 다음 날 0시**의 UTC 순간 — 🔴 `effectiveResignAt` 한 함수만 지난다. 입사 시각 캐시 `users.joinAt = startOfDayIn(입사일)`. 날짜 열(`userEmploymentPeriods.joinAt` · `resignAt`)에는 `toDateColumn`(그날 UTC 자정 `Date` — B3)으로 쓰고 `fromDateColumn` 으로 읽는다. 🔴 `recordedTimezone` 은 늘 `'UTC'`(B2), 기준 시간대는 퇴사 · 정정 · 재입사 감사 meta 의 `timeZone` 이 남긴다. 기준 시간대 기본 `'Asia/Seoul'`.
- **revision**: `PATCH /users/:userNo` 본문에 필수, 다르면 409 `ERR_COMMON_REVISION_CONFLICT`. 수정 · 퇴사 · 퇴사일 정정 · 재입사가 `revision + 1` 과 함께 `updateAt = current_timestamp`(DB 시계 — §14 R6-2)를 쓴다. 🔴 초기화 · 잠금 해제 · 로그인 실패 · 본인 비밀번호 변경은 `revision` · `updateAt` 을 바꾸지 않는다(⑧ V1 · U1). 만들기는 `updateAt` 을 쓰지 않는다(DB 기본값).
- **전권자 잔존**: 역할을 바꾸는 수정 · 퇴사만 `withSuperAdminSurvival(trx, write)` — 🔴 트랜잭션의 첫 호출. 만들기 · 퇴사일 정정 · 재입사 · 초기화 · 잠금 해제는 센티넬을 잡지 않는다(셈을 줄이지 않는다).
- 🔴 **잠금 읽기**: 사용자 쓰기 트랜잭션 안의 결정 읽기 — 대상(`users ⋈ roles`) · 줄 역할 · 팀 · 재직 이력 — 는 모두 `FOR UPDATE` 다(§14 R5-6 · R7-1 · R7-2). 비잠금은 잔존 셈과 **보기 읽기**(`readUser` — 응답 `item` · 감사 before/after)뿐이고, 보기 읽기 결과로 판정하지 않는다.
- **판정 순서(B7)**: 대상 잠금 → 없음 404 `ERR_NO_USER` → (본문의 역할 없음 400) → 판정 403 → revision · 상태 409 → 쓰기 → 잔존 409. 권한 없는 사람에게 revision · 상태를 드러내지 않는다.
- 🔴 argon2(`hashPassword` · 재인증 `AdminReauthService.verify`)는 트랜잭션 밖에서만 부른다.
- 🔴 임시 비밀번호와 `currentPassword` 는 응답 밖(감사 가방 · 로그 · 오류 본문)으로 내지 않는다. 컨트롤러는 그 값을 `attachAuditMeta` · `attachAuditDiff` 에 넘기지 않는다.
- 오류 문구(정확히 이 글자 — `accounts/errors.ts` 의 `ACCOUNT_MESSAGES`, 2d-1 문구는 그대로):
  - `사용자를 찾을 수 없습니다.` — 404 `ERR_NO_USER`
  - `역할을 찾을 수 없습니다.` — 400 `ERR_COMMON_VALIDATION` `issues[{ path: ['roleNo'] }]`(본문)
  - `팀을 찾을 수 없습니다.` — 400 `issues[{ path: ['teamNo'] }]`
  - `이미 있는 아이디입니다.` — 400 `issues[{ path: ['userId'] }]`(B1)
  - `퇴사일은 입사일과 같거나 뒤여야 합니다.` — 400 `issues[{ path: ['resignDate'] }]`
  - `재입사일은 직전 퇴사일 다음 날부터입니다.` — 400 `issues[{ path: ['joinDate'] }]`
  - `입사일은 직전 퇴사일 다음 날부터 이번 퇴사일까지입니다.` — 400 `issues[{ path: ['joinDate'] }]`
  - `다른 관리자가 먼저 이 계정을 바꿨습니다. 새로 불러온 내용을 확인하세요.` — 409 `ERR_COMMON_REVISION_CONFLICT`
  - `이미 퇴사 처리된 사용자입니다.` · `재직 중인 사용자는 퇴사일을 정정할 수 없습니다.` · `재직 중인 사용자는 재입사 처리할 수 없습니다.` · `이미 활성 근무 이력이 있어 재입사 처리할 수 없습니다.` · `근무 이력이 없어 입사일을 정정할 수 없습니다.` · `근무 이력이 없어 퇴사일을 정정할 수 없습니다.` · `근무 이력이 손상되어(활성 구간 중복) 처리할 수 없습니다. 관리자에게 문의하세요.` — 409 `ERR_COMMON_CONFLICT`
  - 2d-1 그대로: `내 계정에는 이 작업을 할 수 없습니다. 다른 관리자에게 요청하세요.` · `내 권한보다 넓은 권한을 가진 계정은 바꿀 수 없습니다.` · `내 권한보다 넓은 역할은 줄 수 없습니다.`(403 + `details.outside`) · `이 변경 뒤에는 전체 권한을 가진 재직 관리자가 한 명도 남지 않습니다. 먼저 다른 관리자에게 전체 권한 역할을 주세요.`(409) · `현재 비밀번호를 입력하세요.`(400 `currentPassword`)
- 감사 액션(admin-shared `CoreAuditActions`, 대상 `user`): `org.user.create` · `org.user.update` · `org.user.resign` · `org.user.resignDate.update` · `org.user.rehire` · `org.user.password.reset` · `org.user.unlock`. 라벨 `사용자 생성` · `사용자 수정` · `퇴사 처리` · `퇴사일 정정` · `재입사 처리` · `비밀번호 초기화` · `잠금 해제`.
- 재인증(`reauth: true`): 사용자 쓰기 일곱 라우트 모두 본문 `currentPassword`(1~256)를 서비스 진입부 · 트랜잭션 밖에서 확인한다(목록 · 단건 · 이력 제외). 빠짐 · 빈 값은 파이프의 400 `issues[{ path: ['currentPassword'] }]` — 비밀번호를 대조하지 않는다(실패 카운터 0). 끄면 보낸 `currentPassword` 는 버린다. 본문 없는 초기화 · 잠금 해제도 같은 400 이다.
- admin-shared 스키마에 객체 수준 `.refine()` 을 걸지 않는다(3b §11 R1 — 필드 수준 검사는 된다, §14 R7-6). admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server 가 새 export 를 본다.
- 테스트: 단위 · DB 없는 HTTP 는 `*.test.ts`(`pnpm check`), 실 MariaDB 는 `*.db.test.ts`(Docker 컨테이너 `admin-kit-test-db` 가 떠 있어야 한다). 🔴 DB 테스트 하나만 돌리는 명령은 `pnpm --filter @ssworks/admin-server test:db <이름>` — `--` 를 넣으면 거르지 않는다. 단위는 `pnpm --filter <패키지> test <이름>`. lint 는 **루트 `pnpm lint`**(패키지에 lint 스크립트가 없다), 타입은 `pnpm --filter <패키지> typecheck`, 전체는 `pnpm check` · `pnpm test:db`.
- 🔴 DB 테스트는 앞 테스트의 잔여에 기대지 않는다 — 테스트마다 자기 시드 · 고유 이름(아이디 접두어)을 쓴다. `seedRole(t.db)` 의 기본 권한은 `['*']` 다 — 잔존 셈을 재는 테스트는 **자기 데이터베이스**를 따로 만들고 `permissions` 를 늘 명시한다.
- 🔴 원시 연결(`mariadb.createConnection`)은 `try/finally` 로 롤백 · 종료한다(`test-support/concurrency.ts` 의 `whileHeld` 가 한다). 기다리는 동안 거부될 수 있는 프로미스는 `settle` 로 바로 받아 둔다.
- 의도한 `Logger.warn` 은 `vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)` 로 가두고 단언한다.
- 테스트 코드도 린트를 통과한다(쓰이지 않는 변수 · import 없음). bigint 가 든 본문은 supertest `.send(object)` 가 던지므로 admin-shared `stringifyJSON` 으로 보낸다(Task 12 `sendJson`).
- 셸: Windows(Git Bash) · Linux 양쪽. 🔴 출력을 `/dev/null` 로 보내지 않는다(Windows 에 `NUL` 파일이 생긴다) — 출력 억제 자체를 하지 않는다. 파일을 python · sed 로 다시 쓰지 않는다(LF). pnpm 설치는 짧은 `%TEMP%` 경로에서 한다.
- 🔴 도구 입력의 백슬래시 이스케이프는 JSON 으로 풀린다 — 새 코드 · 테스트에 백슬래시를 쓰지 않는다(정규식은 `[0-9]` 같은 문자 클래스, 슬래시가 든 정규식은 `new RegExp('…/…')`). 백슬래시가 든 줄을 고쳤다면 `node -e` 와 `charCodeAt` 으로 그 자리 바이트를 확인한다.
- 플랜의 코드 블록은 prettier 를 거치지 않았다 — 커밋 전에 바꾼 파일에 `pnpm exec prettier --write <파일…>` 을 돌린다(줄 바꿈만 바뀐다). 마지막 Task 의 `pnpm format:check` 가 지킨다.
- 커밋: 한국어 conventional commits. 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `gh pr merge` · `pnpm release` · `npm publish` · `pnpm stage approve` 는 하지 않는다.

## Review Focus

스펙이 함의하지만 다른 테스트가 재지 않는, 사람이 가장 먼저 부딪힐 입력 다섯. 각 줄의 테스트를 담당 Task 에 넣었다.

1. **오늘 날짜로 퇴사**("퇴사일 당일까지 근무") — 효력 시각은 기준 시간대 **내일 0시**라 세션이 끊기지 않고(`revokedCount` 0) 오늘은 계속 로그인된다. → Task 9 "오늘".
2. **아이디의 앞뒤 공백 · 대소문자만 다른 아이디**(`' Kim '`, `'KIM'` vs `'kim'`) — 공백을 떼고 저장하고, 콜레이션(`utf8mb4_unicode_ci` · PAD SPACE)이 같은 아이디로 보아 400 `issues[{ path: ['userId'] }]`. → Task 8 "아이디 중복", Task 11 파이프, Task 12 HTTP.
3. **재인증 켬에서 본문 없이 보낸 초기화 · 잠금 해제**(Content-Type 도 없음) — 400 `issues[{ path: ['currentPassword'] }]`(루트 경로 오류가 아니다), 비밀번호를 대조하지 않는다. → Task 11 `users.body.test.ts`, Task 12 "재인증".
4. **입사 당일 퇴사**(퇴사일 = 입사일) — 허용("같거나 뒤"), 하루 앞이면 400 `resignDate`. → Task 9 "입사 당일".
5. **두 팀에 속한 계정**(테이블은 허용 — 2e · 쓰는 쪽 시드가 만들 수 있다) — 목록은 가장 작은 `teamNo` 를 보이고 한 번만 나오며, `PATCH { teamNo }` 는 소속을 하나로 만든다. → Task 7 "대표 팀", Task 8 "팀 바꾸기".

## 파일 구조

| 파일                                                                                                                                | 책임                                                                                       | Task     |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| `packages/admin-shared/src/users.ts` · `pagination.ts` · `index.ts`                                                                 | 사용자 계약 스키마 · `calendarDateSchema` · `queryBooleanSchema`                           | 1        |
| `packages/admin-shared/src/audit.ts` · `roles.ts`                                                                                   | 사용자 감사 액션 7 · 역할 이름 trim(R5-4)                                                  | 2        |
| `packages/admin-server/src/accounts/calendar.ts` · `temporary-password.ts`                                                          | 날짜 · 효력 시각 · 기준 시간대 검증 · 임시 비밀번호                                        | 3        |
| `packages/admin-server/src/options.ts` · `accounts/options.ts` · `accounts/errors.ts` · `auth/permission-slots.ts`                  | `timeZone` · `resolveUsersConfig` · 사용자 문구 · 슬롯 둘                                  | 4        |
| `packages/admin-server/src/database/migrations/0002_users.ts` · `tables/users.ts`                                                   | `updateAt` 의 ON UPDATE 제거(U1)                                                           | 5        |
| `packages/admin-server/src/accounts/reauth.ts` · `permissions-column.ts` · `roles/roles.service.ts` · `roles.controller.ts`         | 재인증 · 권한 읽기 공용화, 역할 이월 정리(R5-2 · 3 · 5), `GET /roles` 의 `users.read`      | 6        |
| `packages/admin-server/src/users/errors.ts` · `user-view.ts` · `users.query.ts` · `users.service.ts`                                | 오류 만들기 · 보기 투영 · 목록 쿼리 · 서비스(읽기 셋)                                      | 7        |
| `packages/admin-server/src/users/user-locks.ts` · `employment.ts` · `users.service.ts`                                              | 잠금 읽기 · 재직 이력 도우미 · 만들기 · 수정                                               | 8        |
| `packages/admin-server/src/users/users.service.ts` · `employment.ts`                                                                | 퇴사 · 퇴사일 정정 · 재입사                                                                | 9        |
| `packages/admin-server/src/users/users.service.ts`                                                                                  | 비밀번호 초기화 · 잠금 해제 · 스냅샷 격리 테스트                                           | 10       |
| `packages/admin-server/src/users/users.body.ts` · `users.controller.ts` · `users.module.ts` · `admin-server.module.ts` · `index.ts` | 본문 파이프 · 열 라우트 · 모듈 · 배선                                                      | 11       |
| `packages/admin-server/src/users/users.http.db.test.ts`                                                                             | 실 MariaDB HTTP 계약 · 감사 비밀                                                           | 12       |
| `packages/admin-server/src/test-support/accounts.ts` · `users.ts` · `concurrency.ts` · `auth.ts` · `admin-app.ts`                   | `usersConfig` · `transactionOnly` · 이력 · 세션 시드 · `whileHeld` · 스냅샷 연결 · 앱 부트 | 4 · 6~11 |
| `packages/admin-server/README.md` · `.changeset/admin-server-users.md` · `docs/*` · `CLAUDE.md`                                     | 문서 · 릴리스 · 스모크                                                                     | 13       |

**플랜 작성 중 확인한 것(스펙 §14 에 이미 적었다):** R5(이월 여섯 건 — M1 은 README 만), R6(즉시 퇴사 뒤 401 · `updateAt` DB 시계 · 하위 팀 직접 소속), R7(실측 여덟 건). 플랜이 더한 작은 결정 둘 — 재입사 감사 diff 에 효력 시각 `resignAt` 을 더한다(재입사가 지우는 값, §5-6 의 `joinDate · resignDate` 에 한 칸), 퇴사의 meta 는 치유했을 때 `healedPeriod: true` 를 싣는다 — 은 Task 13 에서 §14 R8 로 적는다.

**권장 모델(Subagent-driven):** 구현 — Task 1 · 2 · 3 · 5 haiku(명세 확정 1~2파일), 나머지 sonnet. 리뷰 — Task 6 · 8 · 9 · 10(잠금 · 동시성 · 판정) opus, 나머지 sonnet. 최종 whole-branch 리뷰 opus.

---

### Task 1: admin-shared — 사용자 계약 스키마 · `calendarDateSchema` · `queryBooleanSchema`

**Files:**

- Create: `packages/admin-shared/src/users.ts`
- Create: `packages/admin-shared/src/users.test.ts`
- Modify: `packages/admin-shared/src/pagination.ts`(끝에 `queryBooleanSchema`)
- Modify: `packages/admin-shared/src/pagination.test.ts`(끝에 describe 하나)
- Modify: `packages/admin-shared/src/index.ts`

**Interfaces:**

- Produces: `calendarDateSchema` · `adminUserSchema` · `adminUserCreateSchema` · `adminUserCreateResultSchema` · `adminUserUpdateSchema` · `adminUserResignSchema` · `adminUserResignDateSchema` · `adminUserRehireSchema` · `adminEmploymentPeriodSchema` · 상수 `USER_ID_MAX_LENGTH` · `USER_NAME_MAX_LENGTH` · `EMPLOYMENT_REASON_MAX_LENGTH`, 타입 `AdminUser` · `AdminUserCreate` · `AdminUserCreateResult` · `AdminUserUpdate` · `AdminUserResign` · `AdminUserResignDate` · `AdminUserRehire` · `AdminEmploymentPeriod`, `queryBooleanSchema`(출력 `boolean`).
- `AdminUserCreate` = `{ userId: string; userName: string; roleNo: bigint; teamNo: bigint | null; joinDate?: string }`, `AdminUserUpdate` = `{ revision: number; userName?: string; roleNo?: bigint; teamNo?: bigint | null; joinDate?: string }`, `AdminUserResign` · `AdminUserResignDate` = `{ resignDate: string; reason?: string | null }`, `AdminUserRehire` = `{ joinDate: string; reason?: string | null }`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-shared/src/users.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  adminEmploymentPeriodSchema,
  adminUserCreateResultSchema,
  adminUserCreateSchema,
  adminUserRehireSchema,
  adminUserResignDateSchema,
  adminUserResignSchema,
  adminUserSchema,
  adminUserUpdateSchema,
  calendarDateSchema,
} from './users.js'

const ROW = {
  userNo: 7n,
  userId: 'kim',
  userName: '김사원',
  roleNo: 2n,
  roleName: '운영자',
  teamNo: null,
  teamName: null,
  joinDate: '2026-03-02',
  resignDate: null,
  resignAt: null,
  isPasswordChangeRequired: true,
  lockUntil: null,
  revision: 0,
  createAt: '2026-03-01T15:00:00.000Z',
  updateAt: '2026-03-01T15:00:00.000Z',
}

describe('calendarDateSchema', () => {
  it("실제 달력 날짜만 — 윤일은 받고 '2026-02-30' 은 거부", () => {
    expect(calendarDateSchema.parse('2026-10-31')).toBe('2026-10-31')
    expect(calendarDateSchema.parse('2028-02-29')).toBe('2028-02-29')
    expect(calendarDateSchema.safeParse('2027-02-29').success).toBe(false)
    expect(calendarDateSchema.safeParse('2026-02-30').success).toBe(false)
    expect(calendarDateSchema.safeParse('2026-13-01').success).toBe(false)
  })

  it('모양이 틀리면 이슈 하나 — 없는 날짜 문구를 겹쳐 내지 않는다', () => {
    for (const value of ['2026-1-01', '26-01-01', '2026/01/01', '0999-01-01', 'abc', '']) {
      const result = calendarDateSchema.safeParse(value)
      expect(result.success, value).toBe(false)
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        '날짜는 YYYY-MM-DD 로 적습니다.',
      ])
    }
    expect(calendarDateSchema.safeParse('2026-02-30').error?.issues[0]?.message).toBe(
      '없는 날짜입니다.',
    )
  })
})

describe('adminUserSchema', () => {
  it('와이어 행(시각은 ISO 문자열)을 읽는다', () => {
    expect(adminUserSchema.parse(ROW)).toEqual(ROW)
    expect(
      adminUserSchema.parse({
        ...ROW,
        teamNo: 3n,
        teamName: '영업',
        resignDate: '2026-10-31',
        resignAt: '2026-10-31T15:00:00.000Z',
        lockUntil: '2030-01-01T00:00:00.000Z',
      }).resignAt,
    ).toBe('2026-10-31T15:00:00.000Z')
  })

  it('🔴 객체 refine 이 없다 — 쓰는 쪽이 .omit · .extend 로 고친다(3b §11 R1 · §14 R7-6)', () => {
    const { revision: _revision, ...withoutRevision } = ROW
    expect(adminUserSchema.omit({ revision: true }).parse(withoutRevision)).toEqual(withoutRevision)
    const extended = adminUserSchema.extend({ userPhone: z.string().nullable() })
    expect(extended.parse({ ...ROW, userPhone: null }).userPhone).toBeNull()
  })
})

describe('본문 스키마', () => {
  it('만들기 — 아이디 · 이름은 앞뒤 공백을 떼고 1~64자, 팀은 null 허용, 입사일은 생략 가능', () => {
    expect(
      adminUserCreateSchema.parse({
        userId: ' kim ',
        userName: ' 김사원 ',
        roleNo: 2n,
        teamNo: null,
      }),
    ).toEqual({ userId: 'kim', userName: '김사원', roleNo: 2n, teamNo: null })
    expect(
      adminUserCreateSchema.safeParse({ userId: '  ', userName: 'a', roleNo: 2n, teamNo: null })
        .success,
    ).toBe(false)
    expect(
      adminUserCreateSchema.safeParse({
        userId: 'a'.repeat(65),
        userName: 'a',
        roleNo: 2n,
        teamNo: null,
      }).success,
    ).toBe(false)
    expect(
      adminUserCreateSchema.safeParse({ userId: 'a', userName: 'a', roleNo: 2, teamNo: null })
        .success,
    ).toBe(false)
    expect(
      adminUserCreateSchema.parse({
        userId: 'a',
        userName: 'a',
        roleNo: 2n,
        teamNo: 3n,
        joinDate: '2026-11-02',
      }).joinDate,
    ).toBe('2026-11-02')
  })

  it('수정 — revision 만 와도 된다(바꿀 값 없음 검사 없음), teamNo 는 null 과 생략을 가른다', () => {
    expect(adminUserUpdateSchema.parse({ revision: 0 })).toEqual({ revision: 0 })
    expect(adminUserUpdateSchema.safeParse({ userName: 'a' }).success).toBe(false)
    expect(adminUserUpdateSchema.parse({ revision: 1, teamNo: null })).toEqual({
      revision: 1,
      teamNo: null,
    })
  })

  it('퇴사 · 퇴사일 · 재입사 — 날짜 필수, 사유는 생략 · null · 255자까지', () => {
    expect(adminUserResignSchema.parse({ resignDate: '2026-10-31' })).toEqual({
      resignDate: '2026-10-31',
    })
    expect(adminUserResignDateSchema.parse({ resignDate: '2026-10-31', reason: null })).toEqual({
      resignDate: '2026-10-31',
      reason: null,
    })
    expect(adminUserRehireSchema.safeParse({ reason: '복직' }).success).toBe(false)
    expect(
      adminUserResignSchema.safeParse({ resignDate: '2026-10-31', reason: 'a'.repeat(256) })
        .success,
    ).toBe(false)
  })

  it('만들기 결과 · 재직 이력 행', () => {
    expect(
      adminUserCreateResultSchema.parse({ item: ROW, temporaryPassword: 'Ab3dEf7hJk9mNp2q' }),
    ).toEqual({ item: ROW, temporaryPassword: 'Ab3dEf7hJk9mNp2q' })
    const period = {
      periodNo: 1n,
      joinDate: '2025-01-02',
      resignDate: null,
      reason: null,
      recordedTimezone: 'UTC',
      createdBy: null,
      createdByName: null,
      createAt: '2025-01-02T00:00:00.000Z',
    }
    expect(adminEmploymentPeriodSchema.parse(period)).toEqual(period)
  })
})
```

`packages/admin-shared/src/pagination.test.ts` — 첫 줄 import 목록에 `queryBooleanSchema` 를 더하고(`./pagination.js` 에서) 파일 끝에 더한다:

```ts
describe('queryBooleanSchema', () => {
  it("🔴 'true' · 'false' 만 — z.coerce.boolean() 은 'false' 를 참으로 읽는다(crm · axion 결함)", () => {
    expect(queryBooleanSchema.parse('true')).toBe(true)
    expect(queryBooleanSchema.parse('false')).toBe(false)
    expect(queryBooleanSchema.parse(true)).toBe(true)
    for (const value of ['1', '0', '', ' true', 'TRUE', 'yes']) {
      expect(queryBooleanSchema.safeParse(value).success, value).toBe(false)
    }
  })

  it('createQuerySchema 의 filter 에서 쓴다', () => {
    const schema = createQuerySchema({
      sortableColumns: ['createAt'] as const,
      defaultSortColumn: 'createAt',
      filterShape: { recursive: queryBooleanSchema },
    })
    expect(schema.parse({ filter: { recursive: 'false' } }).filter).toEqual({ recursive: false })
  })
})
```

(`createQuerySchema` 가 그 파일 import 에 이미 없으면 함께 더한다.)

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-shared test users pagination`
Expected: FAIL — `users.test.ts` 는 `Failed to resolve import "./users.js"`, `pagination.test.ts` 는 `queryBooleanSchema` 가 undefined.

- [ ] **Step 3: 구현한다**

`packages/admin-shared/src/users.ts`:

```ts
import { z } from 'zod'

// 사용자 · 계정 코어 계약 — Phase 2 서버(@ssworks/admin-server AdminUsersModule)와 쓰는 쪽 사용자 관리 화면(B)이 같은
// 모양을 본다.
//
// 정본: hangang-home apps/admin/src/api/users.api.ts(행 · 퇴사 · 재입사 · 퇴사일 본문) + ssworks-gise-home 계정 DTO(생성
//       응답 { user, temporaryPassword }) + kim5257-crm-v5 · ssworks-axion-admin(팀 하나)
// 바꾼 점:
//  - 날짜는 'YYYY-MM-DD' 문자열(입사일 · 퇴사일)과 효력 시각 resignAt(ISO)으로 나눈다(2d 스펙 ⑤ Z1 · §2-2 #13). hangang ·
//    axion 은 날짜를 UTC 자정 시각으로 실어 브라우저 시간대에 따라 하루가 밀렸다.
//  - 생성 응답 키는 item(킷 응답 모양), 임시 비밀번호 키는 temporaryPassword(3c D1).
//  - 팀은 하나(teamNo: bigint | null — ⑨ T1). 행의 팀은 대표 팀(가장 작은 teamNo — 2b R34).
//  - 🔴 객체에 `.refine()` 을 걸지 않는다(3b §11 R1). 필드 수준 검사(달력 날짜 · trim)는 쓰는 쪽 `.omit()` · `.extend()` 를
//    막지 않는다(2d 스펙 §14 R7-6). "바꿀 값 없음" 검사도 없다 — revision 만 와도 저장이다.

export const USER_ID_MAX_LENGTH = 64
export const USER_NAME_MAX_LENGTH = 64
export const EMPLOYMENT_REASON_MAX_LENGTH = 255

/** 연도 1000~9999(DATE 열 범위) · 월 · 일 두 자리 */
const CALENDAR_DATE = /^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/

function isCalendarDate(value: string): boolean {
  // 🔴 모양이 틀린 값은 여기서 통과시킨다 — 모양 문구 하나만 내고 "없는 날짜" 를 겹쳐 내지 않는다
  if (!CALENDAR_DATE.test(value)) return true
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/** 'YYYY-MM-DD' — 실제 달력 날짜만(2026-02-30 거부 · 윤일 허용) */
export const calendarDateSchema = z
  .string()
  .regex(CALENDAR_DATE, '날짜는 YYYY-MM-DD 로 적습니다.')
  .refine(isCalendarDate, '없는 날짜입니다.')

const userIdSchema = z.string().trim().min(1).max(USER_ID_MAX_LENGTH)
const userNameSchema = z.string().trim().min(1).max(USER_NAME_MAX_LENGTH)
const reasonSchema = z.string().trim().max(EMPLOYMENT_REASON_MAX_LENGTH).nullable()
/** 🔴 Phase 0 §4 "쓰기 보호는 revision 기본". 수정 · 퇴사 · 퇴사일 · 재입사가 올린다(⑧ V1) */
const revisionSchema = z.number().int().min(0)

export const adminUserSchema = z.object({
  userNo: z.bigint(),
  userId: z.string(),
  userName: z.string(),
  roleNo: z.bigint(),
  roleName: z.string(),
  /** 대표 팀(가장 작은 teamNo). 무소속이면 null */
  teamNo: z.bigint().nullable(),
  teamName: z.string().nullable(),
  /** 마지막 재직 구간의 입사일(원천). 이력이 없는 시드 계정은 users.joinAt 의 기준 시간대 날짜 */
  joinDate: calendarDateSchema,
  /** 마지막 재직 구간의 퇴사일. 재직 중이면 null */
  resignDate: calendarDateSchema.nullable(),
  /** 퇴사 효력 시각(기준 시간대의 퇴사일 다음 날 0시 — 2b ④ R1). 미래면 퇴사 예정 */
  resignAt: z.iso.datetime().nullable(),
  isPasswordChangeRequired: z.boolean(),
  /** 잠김이 미래일 때만. 아니면 null(gise) */
  lockUntil: z.iso.datetime().nullable(),
  revision: revisionSchema,
  createAt: z.iso.datetime(),
  /** 편집 폼이 보이는 값이 바뀐 시각 — 로그인 실패 · 비밀번호 변경은 바꾸지 않는다(⑧ U1) */
  updateAt: z.iso.datetime(),
})

export const adminUserCreateSchema = z.object({
  userId: userIdSchema,
  userName: userNameSchema,
  roleNo: z.bigint(),
  teamNo: z.bigint().nullable(),
  /** 없으면 기준 시간대의 오늘 */
  joinDate: calendarDateSchema.optional(),
})

/** 🔴 temporaryPassword 는 이 응답에서 한 번만 보인다 — 서버는 저장하지도 감사에 남기지도 않는다 */
export const adminUserCreateResultSchema = z.object({
  item: adminUserSchema,
  temporaryPassword: z.string().min(1),
})

/** 부분 갱신. 🔴 revision 만 필수 — 낙관적 잠금은 끄는 경로가 없다. teamNo: null 은 "소속 없음", 생략은 "그대로" */
export const adminUserUpdateSchema = z.object({
  revision: revisionSchema,
  userName: userNameSchema.optional(),
  roleNo: z.bigint().optional(),
  teamNo: z.bigint().nullable().optional(),
  /** 마지막 재직 구간의 입사일 정정 */
  joinDate: calendarDateSchema.optional(),
})

/** 퇴사 — 퇴사일 당일까지 근무한다. 지금 막으려면 어제 날짜(⑤ Z1) */
export const adminUserResignSchema = z.object({
  resignDate: calendarDateSchema,
  reason: reasonSchema.optional(),
})

/** 퇴사일 정정 — 마지막 구간만. reason 을 생략하면 그대로 둔다 */
export const adminUserResignDateSchema = z.object({
  resignDate: calendarDateSchema,
  reason: reasonSchema.optional(),
})

/** 재입사 — 직전 퇴사일 다음 날부터 */
export const adminUserRehireSchema = z.object({
  joinDate: calendarDateSchema,
  reason: reasonSchema.optional(),
})

export const adminEmploymentPeriodSchema = z.object({
  periodNo: z.bigint(),
  joinDate: calendarDateSchema,
  resignDate: calendarDateSchema.nullable(),
  reason: z.string().nullable(),
  /** 기록 시점 프로세스 TZ — 패키지는 늘 'UTC'(어느 기준 시간대로 셈했는지는 감사 meta 가 남긴다) */
  recordedTimezone: z.string(),
  /** 기록한 관리자. 최초 입사 행은 null */
  createdBy: z.bigint().nullable(),
  createdByName: z.string().nullable(),
  createAt: z.iso.datetime(),
})

export type AdminUser = z.infer<typeof adminUserSchema>
export type AdminUserCreate = z.infer<typeof adminUserCreateSchema>
export type AdminUserCreateResult = z.infer<typeof adminUserCreateResultSchema>
export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>
export type AdminUserResign = z.infer<typeof adminUserResignSchema>
export type AdminUserResignDate = z.infer<typeof adminUserResignDateSchema>
export type AdminUserRehire = z.infer<typeof adminUserRehireSchema>
export type AdminEmploymentPeriod = z.infer<typeof adminEmploymentPeriodSchema>
```

`packages/admin-shared/src/pagination.ts` 끝에 더한다:

```ts
/**
 * 쿼리스트링 boolean — `'true'` · `'false'`(또는 boolean)만. 🔴 `z.coerce.boolean()` 을 쓰지 않는다 — `Boolean('false')` 는
 * true 다(crm · axion 결함). `'1'` · `'0'` · `''` 는 거부한다.
 */
export const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
])
```

`packages/admin-shared/src/index.ts` — `./pagination.js` export 목록의 `toListQuery,` 다음 줄에 `queryBooleanSchema,` 를 더하고, `./roles.js` export 블록 **뒤**에 블록 하나를 더한다:

```ts
export {
  USER_ID_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  EMPLOYMENT_REASON_MAX_LENGTH,
  calendarDateSchema,
  adminUserSchema,
  adminUserCreateSchema,
  adminUserCreateResultSchema,
  adminUserUpdateSchema,
  adminUserResignSchema,
  adminUserResignDateSchema,
  adminUserRehireSchema,
  adminEmploymentPeriodSchema,
  type AdminUser,
  type AdminUserCreate,
  type AdminUserCreateResult,
  type AdminUserUpdate,
  type AdminUserResign,
  type AdminUserResignDate,
  type AdminUserRehire,
  type AdminEmploymentPeriod,
} from './users.js'
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-shared test users pagination`
Expected: PASS.

Run: `pnpm --filter @ssworks/admin-shared typecheck` · `pnpm lint`
Expected: 오류 없음.

- [ ] **Step 5: 빌드하고 커밋한다**

```bash
pnpm --filter @ssworks/admin-shared build
git add packages/admin-shared/src/users.ts packages/admin-shared/src/users.test.ts packages/admin-shared/src/pagination.ts packages/admin-shared/src/pagination.test.ts packages/admin-shared/src/index.ts
git commit -m "feat(admin-shared): 사용자 계약 스키마 · calendarDateSchema · queryBooleanSchema" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: admin-shared — 사용자 감사 액션 일곱 · 역할 이름 trim(R5-4)

**Files:**

- Modify: `packages/admin-shared/src/audit.ts`
- Modify: `packages/admin-shared/src/audit.test.ts`
- Modify: `packages/admin-shared/src/roles.ts`
- Modify: `packages/admin-shared/src/roles.test.ts`

**Interfaces:**

- Produces: `CoreAuditActions.USER_CREATE` · `USER_UPDATE` · `USER_RESIGN` · `USER_RESIGN_DATE_UPDATE` · `USER_REHIRE` · `USER_PASSWORD_RESET` · `USER_UNLOCK`(값은 Global Constraints). 대상은 기존 `CoreAuditTargets.USER`(`'user'`). 코어 액션 25 · 대상 3.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-shared/src/audit.test.ts`:

① 첫 테스트의 이름과 개수를 바꾼다:

```ts
  it('🔴 액션 25 · 대상 3 · 라벨이 하나씩 — 개수는 이 테스트가 고정한다(산문의 개수는 낡는다)', () => {
    expect(Object.values(CoreAuditActions)).toHaveLength(25)
```

② `'역할 액션(2d) …'` 테스트 **뒤**에 더한다:

```ts
it('사용자 액션(2d-2) — hangang 이름 org.user.* + gise 잠금 해제와 라벨', () => {
  expect([
    CoreAuditActions.USER_CREATE,
    CoreAuditActions.USER_UPDATE,
    CoreAuditActions.USER_RESIGN,
    CoreAuditActions.USER_RESIGN_DATE_UPDATE,
    CoreAuditActions.USER_REHIRE,
    CoreAuditActions.USER_PASSWORD_RESET,
    CoreAuditActions.USER_UNLOCK,
  ]).toEqual([
    'org.user.create',
    'org.user.update',
    'org.user.resign',
    'org.user.resignDate.update',
    'org.user.rehire',
    'org.user.password.reset',
    'org.user.unlock',
  ])
  expect(coreAuditCatalog.labelOf('org.user.resignDate.update')).toBe('퇴사일 정정')
  expect(coreAuditCatalog.labelOf('org.user.password.reset')).toBe('비밀번호 초기화')
  expect(coreAuditCatalog.labelOf('org.user.unlock')).toBe('잠금 해제')
})
```

③ `defineAuditCatalog` describe 의 `expect(catalog.ACTION_VALUES).toHaveLength(19)` 를 `toHaveLength(26)` 으로.

`packages/admin-shared/src/roles.test.ts` — `'roleName 은 1~64자다'` 테스트 **뒤**에 더한다:

```ts
it('🔴 roleName 은 앞뒤 공백을 떼고 잰다 — 공백뿐이면 거부(2d 스펙 §14 R5-4)', () => {
  expect(
    adminRoleCreateSchema.parse({ roleName: '  운영자 ', isDefault: false, permissions: [] })
      .roleName,
  ).toBe('운영자')
  expect(
    adminRoleCreateSchema.safeParse({ roleName: ' ', isDefault: false, permissions: [] }).success,
  ).toBe(false)
  expect(adminRoleUpdateSchema.parse({ revision: 0, roleName: '관리자 ' }).roleName).toBe('관리자')
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-shared test audit roles`
Expected: FAIL — 개수 `expected 18 to have length 25`, 사용자 액션 `undefined`, trim `expected '  운영자 ' to be '운영자'`.

- [ ] **Step 3: 구현한다**

`packages/admin-shared/src/audit.ts`:

① 머리 주석에서 "코어 액션은 인증 · 세션(2c) · 역할(2d)." 로 시작하는 줄을 바꾼다:

```ts
//  - 코어 액션은 인증 · 세션(2c) · 역할 · 사용자(2d). 팀 · IP 액션은 2e · 2f 가 더한다. 프로젝트 액션은 `defineAuditCatalog`.
```

② `CoreAuditActions` 의 `ROLE_MOVE: 'org.role.move',` 다음에 더한다:

```ts
  USER_CREATE: 'org.user.create',
  USER_UPDATE: 'org.user.update',
  USER_RESIGN: 'org.user.resign',
  USER_RESIGN_DATE_UPDATE: 'org.user.resignDate.update',
  USER_REHIRE: 'org.user.rehire',
  USER_PASSWORD_RESET: 'org.user.password.reset',
  USER_UNLOCK: 'org.user.unlock',
```

③ `CORE_AUDIT_ACTION_LABELS` 의 `'org.role.move': '역할 표시 순서 변경',` 다음에 더한다:

```ts
  'org.user.create': '사용자 생성',
  'org.user.update': '사용자 수정',
  'org.user.resign': '퇴사 처리',
  'org.user.resignDate.update': '퇴사일 정정',
  'org.user.rehire': '재입사 처리',
  'org.user.password.reset': '비밀번호 초기화',
  'org.user.unlock': '잠금 해제',
```

`packages/admin-shared/src/roles.ts` — `roleNameSchema` 줄과 그 위 주석을 바꾼다:

```ts
/** hangang `maxlength` 64. 🔴 앞뒤 공백을 뗀 뒤 잰다 — `" "` 는 이름이 아니다(2d 스펙 §14 R5-4, 사용자 이름과 같은 규칙) */
const roleNameSchema = z.string().trim().min(1).max(64)
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-shared test`
Expected: PASS(admin-shared 전체 — 기존 `.omit` 테스트도 그대로 통과한다).

Run: `pnpm --filter @ssworks/admin-shared typecheck` · `pnpm lint`
Expected: 오류 없음.

- [ ] **Step 5: 빌드하고 커밋한다**

```bash
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server test roles
git add packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts packages/admin-shared/src/roles.ts packages/admin-shared/src/roles.test.ts
git commit -m "feat(admin-shared): 사용자 감사 액션 일곱 · 역할 이름 앞뒤 공백 떼기" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: admin-server 역할 단위 테스트는 그대로 PASS(이름 trim 은 역할 본문 파이프에 저절로 걸린다).

---

### Task 3: 날짜 · 효력 시각 · 임시 비밀번호(순수 함수)

**Files:**

- Create: `packages/admin-server/src/accounts/calendar.ts`
- Create: `packages/admin-server/src/accounts/calendar.test.ts`
- Create: `packages/admin-server/src/accounts/temporary-password.ts`
- Create: `packages/admin-server/src/accounts/temporary-password.test.ts`

**Interfaces:**

- Produces(`accounts/calendar.ts`): `DEFAULT_TIME_ZONE = 'Asia/Seoul'` · `dateIn(instant: Date, timeZone: string): string` · `todayIn(timeZone: string, now?: Date): string` · `addDays(date: string, days: number): string` · `startOfDayIn(date: string, timeZone: string): Date` · `effectiveResignAt(date: string, timeZone: string): Date` · `toDateColumn(date: string): Date` · `fromDateColumn(value: Date): string` · `resolveTimeZone(value: unknown): string`(던지는 문구는 `timeZone 은 IANA 시간대 이름이어야 한다` 로 시작).
- Produces(`accounts/temporary-password.ts`): `TEMPORARY_PASSWORD_LENGTH = 16` · `TEMPORARY_PASSWORD_ALPHABET`(56자) · `generateTemporaryPassword(pick?: (max: number) => number): string`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/accounts/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIME_ZONE,
  addDays,
  dateIn,
  effectiveResignAt,
  fromDateColumn,
  resolveTimeZone,
  startOfDayIn,
  toDateColumn,
  todayIn,
} from './calendar.js'

const iso = (date: Date) => date.toISOString()

describe('todayIn · dateIn', () => {
  it('🔴 UTC 15:00 = KST 자정 — 경계 앞뒤', () => {
    expect(todayIn('Asia/Seoul', new Date('2026-10-31T14:59:59Z'))).toBe('2026-10-31')
    expect(todayIn('Asia/Seoul', new Date('2026-10-31T15:00:00Z'))).toBe('2026-11-01')
    expect(todayIn('UTC', new Date('2026-10-31T15:00:00Z'))).toBe('2026-10-31')
    expect(dateIn(new Date('2026-03-08T04:59:59Z'), 'America/New_York')).toBe('2026-03-07')
  })
})

describe('startOfDayIn · effectiveResignAt', () => {
  it('Asia/Seoul — 스펙 §5-1 표 그대로', () => {
    expect(iso(effectiveResignAt('2026-10-31', 'Asia/Seoul'))).toBe('2026-10-31T15:00:00.000Z')
    expect(iso(startOfDayIn('2026-11-02', 'Asia/Seoul'))).toBe('2026-11-01T15:00:00.000Z')
  })

  it('America/New_York — 서머타임 시작 · 끝 앞뒤', () => {
    expect(iso(startOfDayIn('2026-03-08', 'America/New_York'))).toBe('2026-03-08T05:00:00.000Z')
    expect(iso(startOfDayIn('2026-03-09', 'America/New_York'))).toBe('2026-03-09T04:00:00.000Z')
    expect(iso(startOfDayIn('2026-11-01', 'America/New_York'))).toBe('2026-11-01T04:00:00.000Z')
    expect(iso(startOfDayIn('2026-11-02', 'America/New_York'))).toBe('2026-11-02T05:00:00.000Z')
  })

  it('🔴 0시가 없는 날은 그날의 첫 순간(B15) — 0시에 시계를 되돌리는 날도 그날의 0시', () => {
    // 2018-11-04 0시에 서머타임 시작(0시 → 1시) — 그날의 첫 순간은 현지 01:00 = 03:00Z(§14 R1-5)
    expect(iso(startOfDayIn('2018-11-04', 'America/Sao_Paulo'))).toBe('2018-11-04T03:00:00.000Z')
    // 2019-02-17 0시에 서머타임 끝(0시 → 전날 23시) — 그날 0시는 한 번, 03:00Z
    expect(iso(startOfDayIn('2019-02-17', 'America/Sao_Paulo'))).toBe('2019-02-17T03:00:00.000Z')
  })

  it('달 · 해 · 윤일 넘김', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(iso(effectiveResignAt('2026-12-31', 'Asia/Seoul'))).toBe('2026-12-31T15:00:00.000Z')
    expect(iso(effectiveResignAt('2028-02-28', 'UTC'))).toBe('2028-02-29T00:00:00.000Z')
  })
})

describe('toDateColumn · fromDateColumn', () => {
  it('🔴 날짜 열에는 그날 UTC 자정 Date(B3) — 오가도 같은 날짜', () => {
    expect(iso(toDateColumn('2028-02-29'))).toBe('2028-02-29T00:00:00.000Z')
    expect(fromDateColumn(toDateColumn('2028-02-29'))).toBe('2028-02-29')
    expect(fromDateColumn(new Date('2026-01-05T00:00:00.000Z'))).toBe('2026-01-05')
  })
})

describe('resolveTimeZone', () => {
  it('없으면 Asia/Seoul, IANA 이름은 그대로', () => {
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE)
    expect(DEFAULT_TIME_ZONE).toBe('Asia/Seoul')
    for (const zone of ['UTC', 'Asia/Seoul', 'America/Argentina/Buenos_Aires', 'Etc/GMT+9']) {
      expect(resolveTimeZone(zone)).toBe(zone)
    }
  })

  it('🔴 오프셋 표기 · 약어 · 모르는 이름 · 문자열 아님은 멈춘다(B15 — Node 의 Intl 은 +09:00 을 받는다, §14 R1-5)', () => {
    for (const value of ['+09:00', 'KST', 'Asia/Seoull', ' Asia/Seoul', '', 9, null]) {
      expect(() => resolveTimeZone(value), String(value)).toThrow(
        'timeZone 은 IANA 시간대 이름이어야 한다',
      )
    }
  })
})
```

`packages/admin-server/src/accounts/temporary-password.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from './temporary-password.js'

describe('generateTemporaryPassword', () => {
  it('🔴 16자 · 56자 알파벳 · 혼동 문자 I O l o 0 1 없음(3c §9)', () => {
    expect(TEMPORARY_PASSWORD_LENGTH).toBe(16)
    expect(TEMPORARY_PASSWORD_ALPHABET).toHaveLength(56)
    expect(new Set(TEMPORARY_PASSWORD_ALPHABET).size).toBe(56)
    for (const confusing of 'IOlo01') expect(TEMPORARY_PASSWORD_ALPHABET).not.toContain(confusing)
    for (let round = 0; round < 200; round += 1) {
      const password = generateTemporaryPassword()
      expect(password).toHaveLength(16)
      for (const char of password) expect(TEMPORARY_PASSWORD_ALPHABET).toContain(char)
    }
  })

  it('주입한 pick 으로 결정적이다 — 매번 알파벳 길이를 상한으로 묻는다', () => {
    const asked: number[] = []
    const pick = (max: number) => {
      asked.push(max)
      return asked.length - 1
    }
    expect(generateTemporaryPassword(pick)).toBe(TEMPORARY_PASSWORD_ALPHABET.slice(0, 16))
    expect(asked).toEqual(Array.from({ length: 16 }, () => 56))
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test calendar temporary-password`
Expected: FAIL — `Failed to resolve import "./calendar.js"` · `"./temporary-password.js"`.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/accounts/calendar.ts`:

```ts
// 정본: hangang-home packages/shared/src/utils/site-time.ts(기준 시간대의 오늘 · Intl 형식기 캐시 · isValidTimeZone)
// 바꾼 점:
//  - 인증 쪽 날짜 비교를 옮기지 않는다 — 인증은 효력 시각(resignAt ≤ now) 하나다(2d 스펙 ⑤ Z1). 날짜 → 효력 시각 계산은
//    여기 한 곳(startOfDayIn · effectiveResignAt)만 지난다.
//  - 0시가 없는 날(서머타임이 0시에 시작 — America/Sao_Paulo 2018-11-04)은 그날의 첫 순간(B15). 오프셋 표기(`+09:00`)는
//    Node 의 Intl 이 받아들이므로 IANA 모양 정규식이 거부한다(§14 R1-5).
// 🔴 날짜 열(DATE)에는 그날의 UTC 자정 Date 를 넘긴다(B3) — 프로세스 TZ = UTC(assertUtcTimezone)라 드라이버가 그 날짜로
//    쓰고 읽는다(§14 R1-5). 테이블 타입(Date)을 바꾸지 않는다.

/** 기준 시간대 기본값(⑤ TZ1) — 네 정본이 모두 KST 서비스다 */
export const DEFAULT_TIME_ZONE = 'Asia/Seoul'

/** `UTC` 또는 `Area/City`(…/…) — 오프셋 표기 · 약어(KST)는 거부. 슬래시가 들어 RegExp 생성자로 쓴다 */
const IANA_TIME_ZONE = new RegExp('^(UTC|[A-Za-z]+(/[A-Za-z0-9_+-]+)+)$')

const formatters = new Map<string, Intl.DateTimeFormat>()

/** 🔴 hourCycle h23 — en-US 의 24시 표기(자정 = 24)가 끼면 날짜가 하루 밀린다 */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** 그 순간의 그 시간대 벽시계 */
function wallClock(instant: Date, timeZone: string): WallClock {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  }
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

function formatDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

function dateParts(date: string): [number, number, number] {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number)
  return [year, month, day]
}

/** 순간 → 그 시간대의 날짜 'YYYY-MM-DD' */
export function dateIn(instant: Date, timeZone: string): string {
  const clock = wallClock(instant, timeZone)
  return formatDate(clock.year, clock.month, clock.day)
}

/** 기준 시간대의 오늘 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dateIn(now, timeZone)
}

/** 'YYYY-MM-DD' 에 days 일을 더한다(달 · 해 · 윤일 넘김) */
export function addDays(date: string, days: number): string {
  const [year, month, day] = dateParts(date)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** 그 순간의 벽시계를 UTC 로 읽은 값 − 그 순간(초 단위) = 그 시간대의 오프셋(ms) */
function offsetAt(epochMs: number, timeZone: string): number {
  const clock = wallClock(new Date(epochMs), timeZone)
  const asUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  )
  return asUtc - Math.floor(epochMs / 1000) * 1000
}

/**
 * 그날 0시(기준 시간대)의 UTC 순간. 오프셋을 두 번 보정한다 — 서머타임 경계 앞뒤에서 맞는다(§14 R1-5).
 * 🔴 0시가 없는 날(서머타임이 0시에 시작)은 그날의 첫 순간을 돌려준다(B15). 후보 둘 중 그 날짜인 것만 고르고, 0시 정각이
 *    있으면 그것, 없으면 이른 것.
 */
export function startOfDayIn(date: string, timeZone: string): Date {
  const [year, month, day] = dateParts(date)
  const midnight = Date.UTC(year, month - 1, day)
  const first = midnight - offsetAt(midnight, timeZone)
  const second = midnight - offsetAt(first, timeZone)
  const sameDay = [first, second].filter(
    (candidate) => dateIn(new Date(candidate), timeZone) === date,
  )
  const exact = sameDay.find((candidate) => {
    const clock = wallClock(new Date(candidate), timeZone)
    return clock.hour === 0 && clock.minute === 0 && clock.second === 0
  })
  if (exact !== undefined) return new Date(exact)
  if (sameDay.length > 0) return new Date(Math.min(...sameDay))
  // 하루 넘게 뛰는 오프셋은 없다 — 닿으면 계산이 틀린 것이다
  throw new Error(`${timeZone} 에서 ${date} 의 시작 시각을 셈할 수 없다.`)
}

/** 퇴사일 D 의 효력 시각 = 기준 시간대 D + 1 일 0시(⑤ Z1 — "퇴사일 당일까지 근무"). 🔴 효력 시각은 이 함수만 셈한다 */
export function effectiveResignAt(date: string, timeZone: string): Date {
  return startOfDayIn(addDays(date, 1), timeZone)
}

/** 'YYYY-MM-DD' → 그날 UTC 자정 Date — DATE 열에 넘기는 값(B3) */
export function toDateColumn(date: string): Date {
  const [year, month, day] = dateParts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

/** DATE 열에서 읽은 Date → 'YYYY-MM-DD'(쓸 때 UTC 자정이었다) */
export function fromDateColumn(value: Date): string {
  return formatDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
}

/**
 * 코어 옵션 `timeZone` 을 푼다. 없으면 'Asia/Seoul'.
 * 🔴 기동에서 멈춘다: IANA 모양이 아님(`+09:00` · `KST`) · Intl 이 모르는 이름(B15).
 */
export function resolveTimeZone(value: unknown): string {
  if (typeof value === 'undefined') return DEFAULT_TIME_ZONE
  if (typeof value === 'string' && IANA_TIME_ZONE.test(value)) {
    try {
      formatterFor(value)
      return value
    } catch {
      // Intl 이 모르는 이름 — 아래 문구로 멈춘다
    }
  }
  throw new Error(
    `timeZone 은 IANA 시간대 이름이어야 한다(예: 'Asia/Seoul' · 'UTC' — '+09:00' 같은 오프셋 표기는 안 된다). 받은 값: ${String(value)}`,
  )
}
```

`packages/admin-server/src/accounts/temporary-password.ts`:

```ts
import { randomInt } from 'node:crypto'

// 정본: ssworks-gise-home apps/api/src/modules/accounts/temporary-password.ts
// 바꾼 점: 없음 — 알파벳 · 길이 · randomInt · 주입 가능한 pick 그대로(3c §9 계약: 16자, 혼동 문자 I O l o 0 1 제외).
// 🔴 Math.random 을 쓰지 않는다 — 예측할 수 있는 난수는 임시 비밀번호를 추측하게 한다. randomInt 는 모듈로 편향이 없다.

export const TEMPORARY_PASSWORD_LENGTH = 16

/** 56자 — 대문자 24(I · O 제외) · 소문자 24(l · o 제외) · 숫자 8(0 · 1 제외) */
export const TEMPORARY_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** `pick(max)` 는 [0, max) 정수 — 테스트가 주입한다 */
export function generateTemporaryPassword(
  pick: (max: number) => number = (max) => randomInt(max),
): string {
  let password = ''
  for (let index = 0; index < TEMPORARY_PASSWORD_LENGTH; index += 1) {
    password += TEMPORARY_PASSWORD_ALPHABET.charAt(pick(TEMPORARY_PASSWORD_ALPHABET.length))
  }
  return password
}
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test calendar temporary-password`
Expected: PASS.

Run: `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint`
Expected: 오류 없음. `runner-graph.test.ts` 는 이 파일들을 끌어오지 않는다(러너가 import 하지 않는다).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/accounts/calendar.ts packages/admin-server/src/accounts/calendar.test.ts packages/admin-server/src/accounts/temporary-password.ts packages/admin-server/src/accounts/temporary-password.test.ts
git commit -m "feat(admin-server): 날짜 · 효력 시각 · 기준 시간대 검증 · 임시 비밀번호 생성기" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 옵션 `timeZone` · 사용자 슬롯 둘 · 사용자 계정 설정 · 사용자 문구

**Files:**

- Modify: `packages/admin-server/src/options.ts`
- Modify: `packages/admin-server/src/accounts/options.ts` · `accounts/options.test.ts`
- Modify: `packages/admin-server/src/accounts/errors.ts`
- Modify: `packages/admin-server/src/auth/permission-slots.ts` · `auth/permission-slots.test.ts`
- Modify: `packages/admin-server/src/test-support/accounts.ts`
- Modify: `packages/admin-server/src/test-support/admin-app.ts`

**Interfaces:**

- Consumes: `resolveTimeZone`(Task 3).
- Produces: `AdminServerOptions.timeZone?: string` · `ResolvedUsersConfig extends ResolvedAccountsConfig { readonly timeZone: string }` · `resolveUsersConfig(options, moduleName): ResolvedUsersConfig` · 슬롯 `'users.read'` · `'users.manage'` · `ACCOUNT_MESSAGES` 의 새 키(아래) · test-support `usersConfig(reauth?: boolean, timeZone?: string): ResolvedUsersConfig` · `TEST_PERMISSIONS` 에 `'users.read': 'org.users:read'` · `'users.manage': 'org.users:write'`.
- 새 `ACCOUNT_MESSAGES` 키: `noTeam` · `duplicateUserId` · `userRevisionMismatch` · `resignBeforeJoin` · `rehireNotAfterResign` · `joinDateOutOfRange` · `alreadyResigned` · `notResigned` · `notResignedForRehire` · `activePeriodExists` · `noPeriodForJoin` · `noPeriodForResign` · `periodCorrupted`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/accounts/options.test.ts` — import 를 `import { resolveAccountsConfig, resolveUsersConfig } from './options.js'` 로 바꾸고 파일 끝에 더한다:

```ts
describe('resolveUsersConfig', () => {
  it('계정 설정 + 기준 시간대(기본 Asia/Seoul) — 얼린 설정', () => {
    const config = resolveUsersConfig({ permissionCatalog: catalog }, 'AdminUsersModule')
    expect(config).toEqual({ catalog, reauth: false, timeZone: 'Asia/Seoul' })
    expect(Object.isFrozen(config)).toBe(true)
    expect(
      resolveUsersConfig({ permissionCatalog: catalog, timeZone: 'UTC', reauth: true }, 'M'),
    ).toMatchObject({ reauth: true, timeZone: 'UTC' })
  })

  it('🔴 timeZone 이 IANA 이름이 아니면 멈춘다(B15) — 카탈로그 검사는 그대로', () => {
    expect(() =>
      resolveUsersConfig({ permissionCatalog: catalog, timeZone: '+09:00' }, 'AdminUsersModule'),
    ).toThrow('timeZone 은 IANA 시간대 이름이어야 한다')
    expect(() => resolveUsersConfig({}, 'AdminUsersModule')).toThrow(
      'AdminUsersModule 은 permissionCatalog 옵션이 있어야 한다',
    )
  })
})
```

`packages/admin-server/src/auth/permission-slots.test.ts`:

① `@RequirePermissionSlot('roles.read', 'users.read' as never)` 의 ` as never` 를 지운다.

② `'슬롯은 다섯 — 2c 셋 + 역할 둘(2d-1)'` 테스트를 바꾼다:

```ts
it('슬롯은 일곱 — 2c 셋 + 역할 둘(2d-1) + 사용자 둘(2d-2)', () => {
  expect(ADMIN_PERMISSION_SLOTS).toEqual([
    'sessions.read',
    'sessions.manage',
    'auditLogs.read',
    'roles.read',
    'roles.manage',
    'users.read',
    'users.manage',
  ])
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test options permission-slots`
Expected: FAIL — `resolveUsersConfig is not a function`, 슬롯 배열에 `users.read` · `users.manage` 없음.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/options.ts` — `reauth?: boolean` 다음에 더한다:

```ts
  /**
   * 날짜(입사일 · 퇴사일)를 읽는 기준 시간대 — IANA 이름(`'Asia/Seoul'` · `'UTC'`). 기본 `'Asia/Seoul'`(2d 스펙 ⑤ TZ1).
   * 퇴사일 D 의 효력 시각은 이 시간대의 D 다음 날 0시다. 🔴 바꿔도 이미 저장된 효력 시각 · 날짜는 그대로다.
   * `AdminUsersModule` 이 기동에서 검증한다(`'+09:00'` 같은 오프셋 표기는 거부).
   */
  timeZone?: string
```

`packages/admin-server/src/accounts/options.ts`:

① import 에 더한다: `import { resolveTimeZone } from './calendar.js'`

② 머리 주석 `// 정본: 없음 — 2d 스펙 ① C1 · ⑦ R1 · B4 · B12. …` 줄 끝에 ` 사용자 모듈은 기준 시간대(⑤ TZ1 · B15)를 더한다.` 를 붙인다.

③ 파일 끝(`isCatalog` 앞)에 더한다:

```ts
/** 사용자 모듈의 설정 — 계정 설정 + 기준 시간대. 같은 토큰(ADMIN_ACCOUNTS_CONFIG)으로 낸다(역할 모듈과 각자의 provider) */
export interface ResolvedUsersConfig extends ResolvedAccountsConfig {
  /** 날짜(입사일 · 퇴사일)를 읽는 기준 시간대 — IANA 이름 */
  readonly timeZone: string
}

/** 🔴 기동에서 멈춘다: resolveAccountsConfig 의 셋 + timeZone 이 IANA 이름이 아님(B15) */
export function resolveUsersConfig(
  options: Pick<AdminServerOptions, 'permissionCatalog' | 'reauth' | 'permissions' | 'timeZone'>,
  moduleName: string,
): ResolvedUsersConfig {
  const accounts = resolveAccountsConfig(options, moduleName)
  return Object.freeze({ ...accounts, timeZone: resolveTimeZone(options.timeZone) })
}
```

`packages/admin-server/src/accounts/errors.ts` — 머리 주석의 `// 바꾼 점: 한 표에 모은다(…). 사용자 상태 문구는 2d-2 가 더한다.` 를 `// 바꾼 점: 한 표에 모은다(2b AUTH_MESSAGES · 2c SESSION_MESSAGES 와 같은 방식). 재직 문구는 hangang 을 다듬었다(2d 스펙 §6).` 로 바꾸고, `noUser` 다음 줄부터 아래 키를 더한다(기존 키 순서는 그대로 두고 `guardMissing` 앞에):

```ts
  noTeam: '팀을 찾을 수 없습니다.',
  duplicateUserId: '이미 있는 아이디입니다.',
  userRevisionMismatch: '다른 관리자가 먼저 이 계정을 바꿨습니다. 새로 불러온 내용을 확인하세요.',
  resignBeforeJoin: '퇴사일은 입사일과 같거나 뒤여야 합니다.',
  rehireNotAfterResign: '재입사일은 직전 퇴사일 다음 날부터입니다.',
  joinDateOutOfRange: '입사일은 직전 퇴사일 다음 날부터 이번 퇴사일까지입니다.',
  alreadyResigned: '이미 퇴사 처리된 사용자입니다.',
  notResigned: '재직 중인 사용자는 퇴사일을 정정할 수 없습니다.',
  notResignedForRehire: '재직 중인 사용자는 재입사 처리할 수 없습니다.',
  activePeriodExists: '이미 활성 근무 이력이 있어 재입사 처리할 수 없습니다.',
  noPeriodForJoin: '근무 이력이 없어 입사일을 정정할 수 없습니다.',
  noPeriodForResign: '근무 이력이 없어 퇴사일을 정정할 수 없습니다.',
  periodCorrupted:
    '근무 이력이 손상되어(활성 구간 중복) 처리할 수 없습니다. 관리자에게 문의하세요.',
```

`packages/admin-server/src/auth/permission-slots.ts`:

```ts
/** 2c 의 셋 + 2d 의 역할 둘 · 사용자 둘. 2e~2f 가 늘린다 — 유니온이 늘어나는 것은 하위 호환이다 */
export type AdminPermissionSlot =
  | 'sessions.read'
  | 'sessions.manage'
  | 'auditLogs.read'
  | 'roles.read'
  | 'roles.manage'
  | 'users.read'
  | 'users.manage'

export const ADMIN_PERMISSION_SLOTS: readonly AdminPermissionSlot[] = Object.freeze([
  'sessions.read',
  'sessions.manage',
  'auditLogs.read',
  'roles.read',
  'roles.manage',
  'users.read',
  'users.manage',
])
```

`packages/admin-server/src/test-support/accounts.ts`:

① import 를 바꾼다: `import type { ResolvedAccountsConfig, ResolvedUsersConfig } from '../accounts/options.js'`

② `accountsConfig` 다음에 더한다:

```ts
/** 사용자 서비스 설정 — 기준 시간대 기본 Asia/Seoul */
export function usersConfig(reauth = false, timeZone = 'Asia/Seoul'): ResolvedUsersConfig {
  return Object.freeze({ catalog: TEST_CATALOG, reauth, timeZone })
}
```

`packages/admin-server/src/test-support/admin-app.ts` — `TEST_PERMISSIONS` 에 두 줄을 더한다:

```ts
  'users.read': 'org.users:read',
  'users.manage': 'org.users:write',
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test options permission-slots`
Expected: PASS.

Run: `pnpm --filter @ssworks/admin-server test` · `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint`
Expected: PASS · 오류 없음(새 슬롯은 맵에 있어도 그 모듈이 없으면 쓰이지 않는다).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/options.ts packages/admin-server/src/accounts/options.ts packages/admin-server/src/accounts/options.test.ts packages/admin-server/src/accounts/errors.ts packages/admin-server/src/auth/permission-slots.ts packages/admin-server/src/auth/permission-slots.test.ts packages/admin-server/src/test-support/accounts.ts packages/admin-server/src/test-support/admin-app.ts
git commit -m "feat(admin-server): timeZone 옵션 · 사용자 슬롯 둘 · 사용자 계정 설정 · 재직 문구" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 장 `0002_users` 정정 — `updateAt` 의 ON UPDATE 제거(⑧ U1)

**Files:**

- Modify: `packages/admin-server/src/database/migrations/0002_users.ts`
- Modify: `packages/admin-server/src/database/tables/users.ts`
- Modify: `packages/admin-server/src/database/migrations/ddl.test.ts`
- Modify: `packages/admin-server/src/database/migrations/migrations.db.test.ts`
- Modify: `packages/admin-server/src/auth/kysely-auth.repository.db.test.ts`

**Interfaces:**

- Produces: `AdminUsersTable.updateAt: ColumnType<Date, never, Date>` — INSERT 는 받지 않고(DB 기본값), UPDATE 는 ``sql<Date>`current_timestamp` `` 로 쓴다(§14 R6-2 · R7-7).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/database/migrations/ddl.test.ts` — `describe('0002_users', …)` 안에 더한다:

```ts
it('🔴 updateAt 에 ON UPDATE 가 없다(2d 스펙 ⑧ U1) — 로그인 실패 · 비밀번호 변경이 "수정일" 을 움직이지 않게', async () => {
  const [statement = ''] = await capture((db) => users.up(db))
  const start = statement.indexOf('`update_at`')
  const updateAt = statement.slice(start, statement.indexOf('constraint', start)).toLowerCase()
  expect(updateAt).toContain('default current_timestamp')
  expect(updateAt).not.toContain('on update')
})
```

`packages/admin-server/src/database/migrations/migrations.db.test.ts` — `expect(column('roles', 'update_at').extra.toLowerCase()).toContain('on update')` 줄 다음에 더한다:

```ts
// 🔴 사용자 수정일은 revision 이 오를 때만 바뀐다(2d 스펙 ⑧ U1 · §14 R7-3)
expect(column('users', 'update_at').extra.toLowerCase()).not.toContain('on update')
```

`packages/admin-server/src/auth/kysely-auth.repository.db.test.ts` — 파일 끝에 더한다:

```ts
describe('🔴 updateAt(2d 스펙 ⑧ U1)', () => {
  it('로그인 실패 · 잠금 · 본인 비밀번호 변경이 "수정일" 을 움직이지 않는다', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo, userId: 'u1-update-at' })
    const past = new Date('2020-01-01T00:00:00.000Z')
    await t.db
      .updateTable('users')
      .set({ updateAt: past })
      .where('userNo', '=', user.userNo)
      .execute()

    await repo.updateLoginState(user.userNo, () => ({
      loginFailCount: 5,
      lockUntil: new Date(Date.now() + 60_000),
    }))
    const credential = await repo.findCredentialByNo(user.userNo)
    if (credential === null) throw new Error('자격 증명이 없다')
    await runWriteTransaction(t.db, (trx) =>
      repo.changePassword(trx, user.userNo, credential.passwordHash, 'replaced-hash'),
    )

    const row = await t.db
      .selectFrom('users')
      .select(['updateAt', 'loginFailCount', 'password'])
      .where('userNo', '=', user.userNo)
      .executeTakeFirstOrThrow()
    expect(row.password).toBe('replaced-hash')
    expect(row.loginFailCount).toBe(0)
    expect(row.updateAt.toISOString()).toBe(past.toISOString())
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test ddl`
Expected: FAIL — `expected '… default current_timestamp on update current_timestamp …' not to contain 'on update'`.

Run: `pnpm --filter @ssworks/admin-server test:db kysely-auth.repository migrations`
Expected: FAIL — `updateAt` 이 `2020-01-01T00:00:00.000Z` 가 아니라 지금 시각, `update_at` 의 extra 에 `on update current_timestamp`. (`set({ updateAt })` 는 아직 타입 오류지만 vitest 는 타입을 보지 않는다 — Step 3 이 타입을 고친다.)

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/database/migrations/0002_users.ts`:

① 머리 주석에서 "을 더했다(Phase 0 §4 #4). 쓰는 법은 2d 가 정한다." 로 끝나는 줄을 바꾼다:

```ts
//  - `revision` 을 더했다(Phase 0 §4 #4). 수정 · 퇴사 · 퇴사일 정정 · 재입사가 올린다(2d 스펙 ⑧ V1).
//  - 🔴 `updateAt` 에 ON UPDATE 를 두지 않는다(2d 스펙 ⑧ U1) — 로그인 실패 · 잠금 · 본인 비밀번호 변경마다 "수정일" 이
//    움직였다. revision 이 오르는 쓰기가 `current_timestamp` 로 같이 쓴다. 미발행이라 장을 고쳤다(2a ⑥ V1).
```

② `updateAt` 컬럼을 바꾼다:

```ts
    .addColumn('updateAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
```

`packages/admin-server/src/database/tables/users.ts`:

① 머리 주석 `// 바꾼 점: …` 줄 끝에 ` updateAt 은 revision 과 함께 쓴다(2d ⑧ U1).` 를 붙인다.

② `updateAt` 줄을 바꾼다:

```ts
/**
 * 편집 폼이 보이는 값이 바뀐 시각 — revision 이 오르는 쓰기(수정 · 퇴사 · 퇴사일 · 재입사)가 `current_timestamp` 로 같이
 * 쓴다(2d 스펙 ⑧ U1 · §14 R6-2). 🔴 ON UPDATE 가 없다 — 로그인 실패 · 잠금 · 비밀번호 변경은 바꾸지 않는다.
 */
updateAt: ColumnType<Date, never, Date>
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test ddl` · `pnpm --filter @ssworks/admin-server test:db kysely-auth.repository migrations`
Expected: PASS.

Run: `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint` · `pnpm test:db`
Expected: 오류 없음 · 실 DB 전체 PASS(2b · 2c · 2d-1 의 어떤 테스트도 `updateAt` 자동 갱신에 기대지 않는다).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/database/migrations/0002_users.ts packages/admin-server/src/database/tables/users.ts packages/admin-server/src/database/migrations/ddl.test.ts packages/admin-server/src/database/migrations/migrations.db.test.ts packages/admin-server/src/auth/kysely-auth.repository.db.test.ts
git commit -m "fix(admin-server): 장 0002 users.updateAt 의 ON UPDATE 를 뺀다 — 로그인 실패가 수정일을 움직이지 않게" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 역할 이월 정리 — 결과는 트랜잭션 안에서 · `clearedDefaults` · 순서 값 잠금 · `GET /roles` 의 `users.read`

**Files:**

- Create: `packages/admin-server/src/accounts/reauth.ts`
- Modify: `packages/admin-server/src/accounts/permissions-column.ts` · `accounts/permissions-column.test.ts`
- Modify: `packages/admin-server/src/roles/roles.service.ts`(파일 전체)
- Modify: `packages/admin-server/src/roles/roles.controller.ts`
- Create: `packages/admin-server/src/test-support/concurrency.ts`
- Modify: `packages/admin-server/src/test-support/accounts.ts`(`transactionOnly`)
- Modify: `packages/admin-server/src/roles/roles.service.db.test.ts` · `roles/roles.order.db.test.ts` · `roles/roles.http.db.test.ts`

**Interfaces:**

- Produces: `reauthenticate(config: Pick<ResolvedAccountsConfig, 'reauth'>, service: AdminReauthService | undefined, principal: AdminPrincipal, password: string | undefined): Promise<void>` · `permissionsOrEmpty(row: { roleNo: bigint; permissions: unknown }, logger: { warn(message: string): void }): string[]`.
- Produces(역할 서비스 반환 모양 바뀜): `create(...)` → `{ roleNo: bigint; after: RoleAuditView; clearedDefaults: bigint[] }`, `update(...)` → `{ item: AdminRoleView; before: RoleAuditView; after: RoleAuditView; clearedDefaults: bigint[] }`.
- Produces(test-support): `transactionOnly<DB>(db: Kysely<DB>): Kysely<DB>`(트랜잭션 밖에서 쿼리를 시작하면 던지는 대역) · `sleep(ms)` · `settle(promise): Promise<Settled<T>>`(`{ ok: true; value } | { ok: false; error }`) · `whileHeld<T>(t, hold, during, waitMs = 300): Promise<Settled<T>>`(원시 연결이 `hold` 로 잠금을 쥔 채 `during()` 을 시작하고 `waitMs` 뒤 커밋한다).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/test-support/concurrency.ts`(테스트 도우미 — 이 Task 의 테스트가 쓴다):

```ts
import { createConnection, type Connection } from 'mariadb'
import type { TestDatabase } from './db.js'
import { testDbServer } from './db-url.js'

// 테스트 전용 — 경합 재현. 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 다른 트랜잭션이 행을 쥔 채로 있는 동안 서비스 메서드(공개 경로)를 부르고, 잠시 뒤 그 트랜잭션을 커밋한다 — 잠금 순서 ·
// 읽기 뷰 회귀를 결정적으로 잰다(2d 스펙 §14 R7). 부품을 따로 부르면 순서 회귀를 못 잡는다.

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

/** 🔴 기다리는 동안 거부돼도 "처리되지 않은 거부" 로 터지지 않게 바로 받아 둔다 */
export function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

/**
 * 원시 연결이 트랜잭션을 열고 `hold` 로 잠금 · 쓰기를 쥔 채 `during()` 을 시작한다. `waitMs` 뒤 그 트랜잭션을 커밋하고
 * `during()` 의 결과를 돌려준다. 🔴 실패해도 롤백 · 종료한다 — 쥔 잠금이 남으면 afterAll 의 DROP DATABASE 가 막힌다.
 */
export async function whileHeld<T>(
  t: TestDatabase,
  hold: (connection: Connection) => Promise<unknown>,
  during: () => Promise<T>,
  waitMs = 300,
): Promise<Settled<T>> {
  const connection = await createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
  try {
    await connection.beginTransaction()
    await hold(connection)
    const pending = settle(during())
    await sleep(waitMs)
    await connection.commit()
    return await pending
  } finally {
    await connection.rollback().catch(() => undefined)
    await connection.end()
  }
}
```

`packages/admin-server/src/test-support/accounts.ts` — import 에 `import type { Kysely } from 'kysely'` 를 더하고 파일 끝에 더한다:

```ts
/** 트랜잭션 밖에서 쿼리를 시작하는 메서드들 — 서비스가 쓰기의 결과를 커밋 뒤에 읽으면 여기서 걸린다 */
const OUTSIDE_TRANSACTION = new Set([
  'selectFrom',
  'selectNoFrom',
  'insertInto',
  'replaceInto',
  'updateTable',
  'deleteFrom',
  'mergeInto',
  'with',
])

/**
 * 🔴 쓰기의 결과는 그 트랜잭션에서 읽는다(2d 스펙 §14 R5-2)를 재는 대역 — `transaction()` 은 그대로 통과하고, 트랜잭션 밖에서
 *    쿼리를 시작하면 던진다. 읽기 메서드(list 등)를 부르는 테스트에는 쓰지 않는다.
 */
export function transactionOnly<DB>(db: Kysely<DB>): Kysely<DB> {
  return new Proxy(db, {
    get(target, key) {
      if (typeof key === 'string' && OUTSIDE_TRANSACTION.has(key)) {
        throw new Error(`트랜잭션 밖에서 ${key} 를 불렀다 — 쓰기의 결과는 그 트랜잭션에서 읽는다`)
      }
      // 🔴 수신자를 원본으로 — Kysely 는 #private 필드를 쓴다. 프록시를 this 로 넘기면 게터가 던진다.
      const value: unknown = Reflect.get(target, key, target)
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value
    },
  })
}
```

`packages/admin-server/src/accounts/permissions-column.test.ts` — import 를 `import { permissionsOrEmpty, readPermissionsColumn } from './permissions-column.js'` 로 바꾸고 파일 끝에 더한다:

```ts
describe('permissionsOrEmpty', () => {
  it('🔴 깨진 열은 역할 번호만 담아 경고하고 [](fail-closed)', () => {
    const warnings: string[] = []
    const logger = { warn: (message: string) => warnings.push(message) }
    expect(permissionsOrEmpty({ roleNo: 3n, permissions: '["a","b"]' }, logger)).toEqual(['a', 'b'])
    expect(permissionsOrEmpty({ roleNo: 4n, permissions: '{"a":1}' }, logger)).toEqual([])
    expect(warnings).toEqual(['역할 4 의 permissions 가 배열이 아니다 — 빈 권한으로 본다.'])
  })
})
```

(이 파일에 `describe` import 가 없으면 `import { describe, expect, it } from 'vitest'` 로 맞춘다.)

`packages/admin-server/src/roles/roles.service.db.test.ts`:

① import 에 `transactionOnly` 를 더한다: `import { FakeReauth, accountsConfig, testPrincipal, transactionOnly } from '../test-support/accounts.js'`

② `'기본 역할로 만들면 다른 기본 역할을 끄고 그 revision 을 올린다(⑫ D1)'` 테스트에서 `second` 를 만든 다음 줄에 더한다:

```ts
// 끈 역할 번호를 돌려준다 — 감사 meta clearedDefaults(§14 R5-3). first 를 만들 때 다른 기본 역할은 모두 꺼졌다
expect(second.clearedDefaults).toEqual([first.roleNo])
expect(
  (await service.create({ roleName: 'default-plain', isDefault: false, permissions: [] }, root))
    .clearedDefaults,
).toEqual([])
```

③ `'기본 역할을 켜면 다른 기본 역할을 끄고, 끄면 0개도 허용한다'` 테스트의 `await service.update(b.roleNo, { revision: 0, isDefault: true }, root)` 를 바꾼다:

```ts
const switched = await service.update(b.roleNo, { revision: 0, isDefault: true }, root)
expect(switched.clearedDefaults).toEqual([a.roleNo])
```

④ `describe('update', …)` 끝(마지막 `it` 뒤)에 더한다:

```ts
it('🔴 만들기 · 수정의 결과는 같은 트랜잭션에서 읽는다(§14 R5-2) — 트랜잭션 밖 쿼리는 던지는 대역으로 잰다', async () => {
  const strict = new AdminRolesService(transactionOnly(t.db), accountsConfig(), undefined)
  const { roleNo } = await strict.create(
    { roleName: 'in-trx-role', isDefault: false, permissions: [] },
    root,
  )
  const result = await strict.update(roleNo, { revision: 0, roleName: 'in-trx-role2' }, root)
  expect(result.item).toMatchObject({ roleNo, roleName: 'in-trx-role2', revision: 1 })
  expect(result.after.roleName).toBe('in-trx-role2')
})
```

`packages/admin-server/src/roles/roles.order.db.test.ts`:

① import 에 더한다: `import { whileHeld } from '../test-support/concurrency.js'`

② 파일 끝에 더한다:

```ts
describe('create — 동시 만들기(§14 R5-5 · R7-4)', () => {
  it('🔴 커밋 전 다른 만들기가 있으면 그것을 기다렸다가 그 뒤 순서를 받는다 — 순서 값이 겹치지 않는다', async () => {
    const top = await t.db
      .selectFrom('roles')
      .select((eb) => eb.fn.max('displayOrder').as('maxOrder'))
      .executeTakeFirstOrThrow()
    const held = Number(top.maxOrder ?? 0) + 1
    const result = await whileHeld(
      t,
      (connection) =>
        connection.query(
          `insert into roles (role_name, permissions, display_order) values ('concurrent-held', '[]', ?)`,
          [held],
        ),
      () =>
        service.create({ roleName: 'concurrent-mine', isDefault: false, permissions: [] }, root),
    )
    if (!result.ok) throw result.error
    const rows = await t.db
      .selectFrom('roles')
      .select(['roleName', 'displayOrder'])
      .where('roleName', 'in', ['concurrent-held', 'concurrent-mine'])
      .orderBy('displayOrder')
      .execute()
    expect(rows).toEqual([
      { roleName: 'concurrent-held', displayOrder: held },
      { roleName: 'concurrent-mine', displayOrder: held + 1 },
    ])
  })
})
```

`packages/admin-server/src/roles/roles.http.db.test.ts`:

① `describe('목록', …)` 안에 더한다:

```ts
it('🔴 users.read 만 있어도 목록을 읽는다(⑪ L1 — 사용자 폼의 역할 고르기)', async () => {
  const readerRole = await seedRole(t.db, {
    roleName: 'http-user-reader',
    permissions: ['org.users:read'],
  })
  const reader = await seedUser(t.db, { roleNo: readerRole, userId: 'user-reader' })
  const items = await roles(await signIn(reader))
  expect(items.map((item) => item.roleName)).toContain('http-user-reader')
})
```

② `describe('감사', …)` 끝에 더한다:

```ts
it('기본 역할을 켜서 꺼진 역할은 meta.clearedDefaults 로 남는다(§14 R5-3) — 꺼진 것이 없으면 키도 없다', async () => {
  const agent = await signIn(boss)
  const first = await create(agent, {
    roleName: 'audit-default-1',
    isDefault: true,
    permissions: [],
  })
  const second = await create(agent, {
    roleName: 'audit-default-2',
    isDefault: true,
    permissions: [],
  })
  const [created] = await auditRows(CoreAuditActions.ROLE_CREATE, second)
  expect(created?.meta).toMatchObject({ clearedDefaults: [String(first)] })

  await agent.patch(`/admin/roles/${first}`).send({ revision: 1, isDefault: true }).expect(200)
  const [updated] = await auditRows(CoreAuditActions.ROLE_UPDATE, first)
  expect(updated?.meta).toMatchObject({ clearedDefaults: [String(second)] })

  const plain = await create(agent, { roleName: 'audit-plain', isDefault: false, permissions: [] })
  const [plainRow] = await auditRows(CoreAuditActions.ROLE_CREATE, plain)
  expect(Object.keys(plainRow?.meta as Record<string, unknown>)).not.toContain('clearedDefaults')
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test permissions-column`
Expected: FAIL — `permissionsOrEmpty is not a function`.

Run: `pnpm --filter @ssworks/admin-server test:db roles`
Expected: FAIL 넷 — `clearedDefaults` 가 undefined(서비스 둘), 트랜잭션 밖 대역이 `트랜잭션 밖에서 selectFrom 를 불렀다`(update 의 커밋 뒤 `findOne`), 동시 만들기가 `[held, held]`(비잠금 MAX — 순서 값이 겹친다), `users.read` 목록이 403, 감사 meta 에 `clearedDefaults` 없음.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/accounts/reauth.ts`:

```ts
import type { AdminPrincipal } from '../auth/principal.js'
import type { AdminReauthService } from '../auth/reauth.service.js'
import type { ResolvedAccountsConfig } from './options.js'

// 정본: 2d-1 AdminRolesService.reauth — 역할 · 사용자 서비스가 같은 길을 쓴다(2d 스펙 ⑦ R1).
// 🔴 트랜잭션 밖 · 권한 가드 뒤에서 부른다 — argon2 가 행 잠금을 쥔 채 돌지 않게(2b §4-7).

/** reauth 가 꺼져 있으면 아무것도 하지 않는다. 켜져 있으면 currentPassword 를 확인한다(틀리면 403 ERR_REAUTH_REQUIRED) */
export async function reauthenticate(
  config: Pick<ResolvedAccountsConfig, 'reauth'>,
  service: AdminReauthService | undefined,
  principal: AdminPrincipal,
  password: string | undefined,
): Promise<void> {
  if (!config.reauth) return
  if (service === undefined) {
    // 모듈 기동 검사(assertAuthModuleRegistered)가 막았어야 한다 — 수동 조립의 방어선.
    throw new Error('AdminReauthService 가 없다 — AdminAuthModule 을 import 한다.')
  }
  await service.verify(principal, password ?? '')
}
```

`packages/admin-server/src/accounts/permissions-column.ts` 끝에 더한다:

```ts
/** 판정에 쓰는 역할 권한. 🔴 깨졌으면 역할 번호만 담아 경고하고 [](2b findPrincipal 과 같은 fail-closed) */
export function permissionsOrEmpty(
  row: { roleNo: bigint; permissions: unknown },
  logger: { warn(message: string): void },
): string[] {
  const parsed = readPermissionsColumn(row.permissions)
  if (parsed !== null) return parsed
  logger.warn(`역할 ${row.roleNo} 의 permissions 가 배열이 아니다 — 빈 권한으로 본다.`)
  return []
}
```

`packages/admin-server/src/roles/roles.service.ts` — 파일 전체를 바꾼다:

```ts
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely, Transaction } from 'kysely'
import { actorOf, judgeAccountCommand } from '../accounts/account-command.js'
import { isDuplicateOf } from '../accounts/duplicate.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import { permissionsOrEmpty } from '../accounts/permissions-column.js'
import { reauthenticate } from '../accounts/reauth.js'
import { withSuperAdminSurvival } from '../accounts/super-admin.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { validationError } from '../http/validation.js'
import { ADMIN_ACCOUNTS_CONFIG, KYSELY } from '../tokens.js'
import { planRoleMove } from './move.js'

// 정본: hangang-home apps/api/src/modules/roles/roles.service.ts(목록 · 만들기 · 수정 · 이동 구간 재번호 · 쓰는 중 409 ·
//       잔존 · 재인증) + ssworks-gise-home revision · 판정 + ssworks-axion-admin 기본 역할 배타
// 바꾼 점:
//  - 목록은 전량(3b §9 — hangang 은 쪽을 나눴다). 권한은 저장된 그대로 낸다(2d 스펙 B6).
//  - 정규화는 카탈로그 normalize(① C1), 권한 상승은 지배 판정(② E1 — hangang 은 새 집합만 봤다).
//  - 수정 · 삭제는 revision(gise). 이동은 revision 을 받지도 올리지도 않는다(3b D1).
//  - 기본 역할은 하나 — 만들기에서도 끈다(axion 은 수정에서만 껐다, ⑫ D1). 끈 역할 번호를 돌려준다 — 감사 meta
//    clearedDefaults(§14 R5-3).
//  - 이름 중복은 제약 이름으로 가려 400 roleName 필드 오류(B1 — hangang 은 사전 검사였고 경합 때 일반 코드로 샜다).
//  - 수정의 응답 item · 감사 after 는 같은 트랜잭션에서 읽는다(§14 R5-2 — 커밋 뒤에 읽으면 그 사이 남의 쓰기가 섞였다).
//  - 새 역할의 displayOrder 는 MAX … FOR UPDATE 로 셈한다(§14 R5-5 · R7-4 — 동시 만들기가 같은 값을 받으면 이동으로도 못
//    가른다).
// 🔴 재인증(argon2)은 트랜잭션 밖 · 권한 가드 뒤(2b §4-7).

export type AdminRoleView = {
  roleNo: bigint
  roleName: string
  displayOrder: number
  isDefault: boolean
  permissions: string[]
  revision: number
}

/** 감사 diff 의 모양 — 타입 별칭이라 `Record<string, unknown>` 자리에 들어간다 */
export type RoleAuditView = {
  roleName: string
  isDefault: boolean
  permissions: readonly string[]
}

export const ROLE_AUDIT_FIELDS = ['roleName', 'isDefault', 'permissions'] as const

export interface AdminRoleCreateBody {
  roleName: string
  isDefault: boolean
  permissions: string[]
  currentPassword?: string
}

export interface AdminRoleUpdateBody {
  revision: number
  roleName?: string
  isDefault?: boolean
  permissions?: string[]
  currentPassword?: string
}

export interface AdminRoleRemoveBody {
  revision: number
  currentPassword?: string
}

const ROLE_COLUMNS = [
  'roleNo',
  'roleName',
  'permissions',
  'displayOrder',
  'isDefault',
  'revision',
] as const

type RoleRow = {
  roleNo: bigint
  roleName: string
  permissions: unknown
  displayOrder: number
  isDefault: boolean
  revision: number
}

@Injectable()
export class AdminRolesService {
  private readonly logger = new Logger('AdminRolesService')

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_ACCOUNTS_CONFIG) private readonly config: ResolvedAccountsConfig,
    // 🔴 @Optional — AdminAuthModule 이 빠진 앱이 DI 해석 오류가 아니라 모듈 기동 검사의 문구로 멈추게(2c R2 와 같은 이유)
    @Optional() private readonly reauthService?: AdminReauthService,
  ) {}

  async list(): Promise<{ items: AdminRoleView[] }> {
    const rows = await runQuery(() =>
      this.db
        .selectFrom('roles')
        .select(ROLE_COLUMNS)
        .orderBy('displayOrder', 'asc')
        .orderBy('roleNo', 'asc')
        .execute(),
    )
    return { items: rows.map((row) => this.view(row)) }
  }

  async create(
    body: AdminRoleCreateBody,
    principal: AdminPrincipal,
  ): Promise<{ roleNo: bigint; after: RoleAuditView; clearedDefaults: bigint[] }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const next = this.config.catalog.normalize(body.permissions)
    judgeAccountCommand(actorOf(principal), { kind: 'role.create', next })
    // 만들기는 잔존을 늘리기만 한다 — 센티넬을 잡지 않는다(§5-3).
    const created = await this.guardRoleName(() =>
      runWriteTransaction(this.db, async (trx) => {
        const clearedDefaults = body.isDefault ? await clearOtherDefaults(trx, null) : []
        // 🔴 FOR UPDATE — 동시 만들기 둘이 같은 MAX 를 읽으면 순서 값이 겹친다(§14 R5-5 · R7-4)
        const top = await trx
          .selectFrom('roles')
          .select((eb) => eb.fn.max('displayOrder').as('maxOrder'))
          .forUpdate()
          .executeTakeFirst()
        const result = await trx
          .insertInto('roles')
          .values({
            roleName: body.roleName,
            permissions: JSON.stringify(next),
            isDefault: body.isDefault,
            displayOrder: Number(top?.maxOrder ?? 0) + 1,
          })
          .executeTakeFirstOrThrow()
        if (result.insertId === undefined) {
          throw new Error('roles INSERT 가 insertId 를 돌려주지 않았다.')
        }
        return { roleNo: result.insertId, clearedDefaults }
      }),
    )
    return {
      ...created,
      after: { roleName: body.roleName, isDefault: body.isDefault, permissions: next },
    }
  }

  async update(
    roleNo: bigint,
    body: AdminRoleUpdateBody,
    principal: AdminPrincipal,
  ): Promise<{
    item: AdminRoleView
    before: RoleAuditView
    after: RoleAuditView
    clearedDefaults: bigint[]
  }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const next =
      body.permissions === undefined ? undefined : this.config.catalog.normalize(body.permissions)
    const actor = actorOf(principal)
    return this.guardRoleName(() =>
      runWriteTransaction(this.db, async (trx) => {
        const write = async (): Promise<{ before: RoleAuditView; clearedDefaults: bigint[] }> => {
          const row = await lockRole(trx, roleNo)
          const current = this.permissionsOf(row)
          // 🔴 판정이 revision 보다 먼저다 — 권한 없는 사람에게 revision 상태를 드러내지 않는다(2d 스펙 B7).
          judgeAccountCommand(actor, { kind: 'role.update', current, next })
          if (body.revision !== row.revision) {
            throw new BusinessError(
              CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
              ACCOUNT_MESSAGES.roleRevisionMismatch,
            )
          }
          const clearedDefaults =
            body.isDefault === true && !row.isDefault ? await clearOtherDefaults(trx, roleNo) : []
          await trx
            .updateTable('roles')
            .set((eb) => ({
              ...(body.roleName === undefined ? {} : { roleName: body.roleName }),
              ...(body.isDefault === undefined ? {} : { isDefault: body.isDefault }),
              ...(next === undefined ? {} : { permissions: JSON.stringify(next) }),
              revision: eb('revision', '+', 1),
            }))
            .where('roleNo', '=', roleNo)
            .execute()
          return {
            before: { roleName: row.roleName, isDefault: row.isDefault, permissions: current },
            clearedDefaults,
          }
        }
        // 🔴 권한을 바꾸는 수정만 잔존을 줄일 수 있다 — 센티넬이 트랜잭션의 첫 문장이 되게 감싼다(§5-3).
        const { before, clearedDefaults } =
          next === undefined ? await write() : await withSuperAdminSurvival(trx, write)
        // 🔴 같은 트랜잭션에서 읽는다 — 응답 · 감사 after 가 이 쓰기의 결과다(§14 R5-2)
        const item = this.view(await findRole(trx, roleNo))
        return {
          item,
          before,
          after: {
            roleName: item.roleName,
            isDefault: item.isDefault,
            permissions: item.permissions,
          },
          clearedDefaults,
        }
      }),
    )
  }

  /** 🔴 재인증 · revision 없음(3b D1 — 순서는 내용이 아니다). 대상 행을 잠그고 구간을 옮긴다 */
  async move(roleNo: bigint, displayOrder: number): Promise<{ from: number; to: number }> {
    return runWriteTransaction(this.db, async (trx) => {
      const row = await lockRole(trx, roleNo)
      const range = await trx
        .selectFrom('roles')
        .select((eb) => [eb.fn.min('displayOrder').as('lo'), eb.fn.max('displayOrder').as('hi')])
        .executeTakeFirstOrThrow()
      const plan = planRoleMove(
        row.displayOrder,
        displayOrder,
        Number(range.lo ?? row.displayOrder),
        Number(range.hi ?? row.displayOrder),
      )
      const shift = plan.shift
      if (shift !== null) {
        await trx
          .updateTable('roles')
          .set((eb) => ({ displayOrder: eb('displayOrder', shift.delta > 0 ? '+' : '-', 1) }))
          .where('displayOrder', '>=', shift.min)
          .where('displayOrder', '<=', shift.max)
          .where('roleNo', '!=', roleNo)
          .execute()
        await trx
          .updateTable('roles')
          .set({ displayOrder: plan.to })
          .where('roleNo', '=', roleNo)
          .execute()
      }
      return { from: plan.from, to: plan.to }
    })
  }

  async remove(
    roleNo: bigint,
    body: AdminRoleRemoveBody,
    principal: AdminPrincipal,
  ): Promise<{ before: RoleAuditView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = actorOf(principal)
    // 🔴 쓰는 중 검사가 먼저라 잔존은 지금은 닿지 않는 방어선이다(hangang · 2d 스펙 B11). 쓰는 중 검사가 스냅숏 때문에 놓친
    //    배정은 FK restrict 가 받친다 — mapError 가 같은 409 ERR_COMMON_IN_USE 로 바꾼다(2a F15).
    const before = await runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(trx, async () => {
        const row = await lockRole(trx, roleNo)
        const current = this.permissionsOf(row)
        judgeAccountCommand(actor, { kind: 'role.delete', current })
        if (body.revision !== row.revision) {
          throw new BusinessError(
            CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
            ACCOUNT_MESSAGES.roleRevisionMismatch,
          )
        }
        const used = await trx
          .selectFrom('users')
          .select('userNo')
          .where('roleNo', '=', roleNo)
          .limit(1)
          .executeTakeFirst()
        if (used !== undefined) {
          throw new BusinessError(CommonErrorCodes.ERR_COMMON_IN_USE, ACCOUNT_MESSAGES.roleInUse)
        }
        await trx.deleteFrom('roles').where('roleNo', '=', roleNo).execute()
        return { roleName: row.roleName, isDefault: row.isDefault, permissions: current }
      }),
    )
    return { before }
  }

  private async guardRoleName<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (isDuplicateOf(error, 'uq_roles_role_name')) {
        throw validationError(
          [{ path: ['roleName'], code: 'custom', message: ACCOUNT_MESSAGES.duplicateRoleName }],
          ACCOUNT_MESSAGES.duplicateRoleName,
        )
      }
      throw error
    }
  }

  private permissionsOf(row: { roleNo: bigint; permissions: unknown }): string[] {
    return permissionsOrEmpty(row, this.logger)
  }

  private view(row: RoleRow): AdminRoleView {
    return {
      roleNo: row.roleNo,
      roleName: row.roleName,
      displayOrder: row.displayOrder,
      isDefault: row.isDefault,
      permissions: this.permissionsOf(row),
      revision: row.revision,
    }
  }
}

async function lockRole(trx: Transaction<AdminDatabase>, roleNo: bigint): Promise<RoleRow> {
  const row = await trx
    .selectFrom('roles')
    .select(ROLE_COLUMNS)
    .where('roleNo', '=', roleNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw noRole()
  return row
}

/** 트랜잭션 안의 보기 읽기 — 자기 쓰기가 보인다 */
async function findRole(trx: Transaction<AdminDatabase>, roleNo: bigint): Promise<RoleRow> {
  const row = await trx
    .selectFrom('roles')
    .select(ROLE_COLUMNS)
    .where('roleNo', '=', roleNo)
    .executeTakeFirst()
  if (row === undefined) throw noRole()
  return row
}

/**
 * ⑫ D1 — 다른 기본 역할을 끄고 그 revision 을 올린다(내용이 바뀌었다 — 그 역할을 열어 둔 편집자는 409 를 받는다).
 * 끈 역할 번호를 돌려준다(감사 meta clearedDefaults — §14 R5-3).
 */
async function clearOtherDefaults(
  trx: Transaction<AdminDatabase>,
  except: bigint | null,
): Promise<bigint[]> {
  let found = trx.selectFrom('roles').select('roleNo').where('isDefault', '=', true).forUpdate()
  if (except !== null) found = found.where('roleNo', '!=', except)
  const roleNos = (await found.execute()).map((row) => row.roleNo)
  if (roleNos.length === 0) return []
  await trx
    .updateTable('roles')
    .set((eb) => ({ isDefault: false, revision: eb('revision', '+', 1) }))
    .where('roleNo', 'in', roleNos)
    .execute()
  return roleNos
}

function noRole(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_ROLE, ACCOUNT_MESSAGES.noRole)
}
```

`packages/admin-server/src/roles/roles.controller.ts`:

① `list` 위 두 줄을 바꾼다:

```ts
  /** 전량 · displayOrder 순(3b §9). 🔴 users.read 도 연다(⑪ L1 — 사용자 폼의 역할 고르기). 맵에 없는 슬롯은 거짓(B13) */
  @RequirePermissionSlot('roles.read', 'users.read')
```

② `create` 본문을 바꾼다:

```ts
const { roleNo, after, clearedDefaults } = await this.roles.create(body, admin)
attachAuditTarget(req, roleNo)
attachAuditDiff(req, null, after, ROLE_AUDIT_FIELDS)
if (clearedDefaults.length > 0) attachAuditMeta(req, { clearedDefaults })
return { roleNo }
```

③ `update` 본문을 바꾼다:

```ts
const { item, before, after, clearedDefaults } = await this.roles.update(roleNo, body, admin)
attachAuditDiff(req, before, after, ROLE_AUDIT_FIELDS)
if (clearedDefaults.length > 0) attachAuditMeta(req, { clearedDefaults })
return { item }
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test permissions-column roles` · `pnpm --filter @ssworks/admin-server test:db roles`
Expected: PASS.

🔴 순서 회귀 확인: `create` 의 MAX 쿼리에서 `.forUpdate()` 한 줄을 지우고 `pnpm --filter @ssworks/admin-server test:db roles.order` → 동시 만들기가 `[held, held]` 로 FAIL 하는 것을 보고서에 적고 되돌린다. `update` 의 `findRole(trx, …)` 를 트랜잭션 밖 읽기로 바꾸면 `in-trx` 테스트가 FAIL 하는 것도 같은 방식으로 한 번 본다.

Run: `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint`
Expected: 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/accounts/reauth.ts packages/admin-server/src/accounts/permissions-column.ts packages/admin-server/src/accounts/permissions-column.test.ts packages/admin-server/src/roles/roles.service.ts packages/admin-server/src/roles/roles.controller.ts packages/admin-server/src/test-support/concurrency.ts packages/admin-server/src/test-support/accounts.ts packages/admin-server/src/roles/roles.service.db.test.ts packages/admin-server/src/roles/roles.order.db.test.ts packages/admin-server/src/roles/roles.http.db.test.ts
git commit -m "fix(admin-server): 역할 이월 정리 — 결과는 트랜잭션 안에서, 꺼진 기본 역할 감사, 순서 값 잠금, 목록에 users.read" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 사용자 읽기 — 보기 투영 · 목록 쿼리 · 목록 · 단건 · 재직 이력

**Files:**

- Create: `packages/admin-server/src/users/errors.ts`
- Create: `packages/admin-server/src/users/user-view.ts` · `users/user-view.test.ts`
- Create: `packages/admin-server/src/users/users.query.ts` · `users/users.query.test.ts`
- Create: `packages/admin-server/src/users/users.service.ts`
- Create: `packages/admin-server/src/users/users.read.db.test.ts`
- Create: `packages/admin-server/src/test-support/users.ts`
- Modify: `packages/admin-server/src/test-support/auth.ts`(`seedUser` 에 `joinAt`)

**Interfaces:**

- Consumes: `dateIn` · `fromDateColumn` · `toDateColumn`(Task 3), `ResolvedUsersConfig` · `ACCOUNT_MESSAGES` 새 키(Task 4), admin-shared `queryBooleanSchema`(Task 1).
- Produces(`users/errors.ts`): `noUser(): BusinessError`(404 `ERR_NO_USER`) · `userConflict(message): BusinessError`(409 `ERR_COMMON_CONFLICT`) · `fieldError(field, message): BusinessError`(400 `ERR_COMMON_VALIDATION` + `issues[{ path: [field], code: 'custom', message }]`) · `userRevisionConflict(): BusinessError`(409 `ERR_COMMON_REVISION_CONFLICT`).
- Produces(`users/user-view.ts`): `type AdminUserView`(키 열다섯 — `userNo userId userName roleNo roleName teamNo teamName joinDate resignDate resignAt isPasswordChangeRequired lockUntil revision createAt updateAt`, 시각은 `Date`) · `interface UserViewRow` · `userViewQuery(db: Kysely<AdminDatabase>)` · `toUserView(row, timeZone, now): AdminUserView` · `readUser(db: Kysely<AdminDatabase>, userNo, timeZone): Promise<AdminUserView>`(없으면 404 — 트랜잭션도 받는다) · `USER_AUDIT_FIELDS` · `RESIGN_AUDIT_FIELDS` · `REHIRE_AUDIT_FIELDS`.
- Produces(`users/users.query.ts`): `adminUserListQuerySchema` · `type AdminUserListQuery` · `userListCondition(filter): Expression<SqlBool>` · `USER_KEYWORD_MAX_LENGTH`.
- Produces(`users/users.service.ts`): `class AdminUsersService` — 생성자 `(db: Kysely<AdminDatabase>, config: ResolvedUsersConfig, sessions: AdminSessionStore, reauthService?: AdminReauthService)`, `list(query): Promise<Paginated<AdminUserView>>` · `findOne(userNo): Promise<AdminUserView>` · `periods(userNo): Promise<{ items: AdminEmploymentPeriodView[] }>`, `type AdminEmploymentPeriodView`. Task 8~10 이 쓰기 메서드를 더한다.
- Produces(test-support): `SeedUserInput.joinAt?: Date` · `seedPeriod(db, { userNo, joinDate, resignDate?, reason?, createdBy? }): Promise<bigint>` · `seedClosure(db, ancestorNo, descendantNo, depth)` · `periodsOf(db, userNo): Promise<PeriodRow[]>`(입사일 · 번호 오름차순, 날짜는 `'YYYY-MM-DD'`) · `userRow(db, userNo)` · `seedSession(db, userNo): Promise<bigint>` · `liveSessionCount(db, userNo): Promise<number>`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/test-support/auth.ts`:

① `SeedUserInput` 에 `joinAt?: Date` 를 더한다(`resignAt?` 앞에, 주석 `/** 없으면 DB 기본값(지금) */`).

② `seedUser` 의 `.values({ … })` 안 `roleNo: input.roleNo,` 다음에 `joinAt: input.joinAt,` 를 더한다(`ColumnType<Date, Date | undefined, Date>` 라 undefined 면 DB 기본값).

`packages/admin-server/src/test-support/users.ts`:

```ts
import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import { fromDateColumn, toDateColumn } from '../accounts/calendar.js'
import { AdminSessionStore } from '../auth/session.store.js'
import type { AdminDatabase } from '../database/types.js'

// 테스트 전용 — 재직 이력 · 팀 계층 · 세션 시드와 읽기(2d-2). 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).

export async function seedPeriod(
  db: Kysely<AdminDatabase>,
  input: {
    userNo: bigint
    joinDate: string
    resignDate?: string | null
    reason?: string | null
    createdBy?: bigint | null
  },
): Promise<bigint> {
  const result = await db
    .insertInto('userEmploymentPeriods')
    .values({
      userNo: input.userNo,
      joinAt: toDateColumn(input.joinDate),
      resignAt: input.resignDate == null ? null : toDateColumn(input.resignDate),
      reason: input.reason ?? null,
      recordedTimezone: 'UTC',
      createdBy: input.createdBy ?? null,
    })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

/** 팀 계층 한 줄 — 팀 모듈(2e) 전이라 손으로 넣는다. 🔴 자기 행(depth 0)은 넣지 않을 수 있다(§14 R6-3) */
export async function seedClosure(
  db: Kysely<AdminDatabase>,
  ancestorNo: bigint,
  descendantNo: bigint,
  depth: number,
): Promise<void> {
  await db.insertInto('teamClosure').values({ ancestorNo, descendantNo, depth }).execute()
}

export interface PeriodRow {
  joinDate: string
  resignDate: string | null
  reason: string | null
  recordedTimezone: string
  createdBy: bigint | null
}

/** 그 사용자의 재직 구간 — 입사일 · 번호 오름차순 */
export async function periodsOf(db: Kysely<AdminDatabase>, userNo: bigint): Promise<PeriodRow[]> {
  const rows = await db
    .selectFrom('userEmploymentPeriods')
    .select(['joinAt', 'resignAt', 'reason', 'recordedTimezone', 'createdBy'])
    .where('userNo', '=', userNo)
    .orderBy('joinAt')
    .orderBy('periodNo')
    .execute()
  return rows.map((row) => ({
    joinDate: fromDateColumn(row.joinAt),
    resignDate: row.resignAt === null ? null : fromDateColumn(row.resignAt),
    reason: row.reason,
    recordedTimezone: row.recordedTimezone,
    createdBy: row.createdBy,
  }))
}

/** users 행의 쓰기 관련 열 */
export function userRow(db: Kysely<AdminDatabase>, userNo: bigint) {
  return db
    .selectFrom('users')
    .select([
      'userName',
      'roleNo',
      'joinAt',
      'resignAt',
      'revision',
      'updateAt',
      'createAt',
      'password',
      'isPasswordChangeRequired',
      'loginFailCount',
      'lockUntil',
    ])
    .where('userNo', '=', userNo)
    .executeTakeFirstOrThrow()
}

/** 살아 있는 세션 하나 — 하루 뒤 만료 */
export function seedSession(db: Kysely<AdminDatabase>, userNo: bigint): Promise<bigint> {
  const now = new Date()
  return new AdminSessionStore(db).create({
    userNo,
    refreshTokenHash: randomBytes(32).toString('hex'),
    userAgent: null,
    ipAddress: null,
    loginAt: now,
    now,
    expireAt: new Date(now.getTime() + 86_400_000),
  })
}

export async function liveSessionCount(db: Kysely<AdminDatabase>, userNo: bigint): Promise<number> {
  const row = await db
    .selectFrom('sessions')
    .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
    .where('userNo', '=', userNo)
    .where('isRevoked', '=', false)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}
```

`packages/admin-server/src/users/user-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { toUserView, type UserViewRow } from './user-view.js'

const NOW = new Date('2026-10-14T00:00:00.000Z')

const ROW: UserViewRow = {
  userNo: 1n,
  userId: 'kim',
  userName: '김사원',
  roleNo: 2n,
  roleName: '운영자',
  teamNo: null,
  teamName: null,
  joinAt: new Date('2026-03-01T15:30:00.000Z'),
  periodJoinAt: null,
  periodResignAt: null,
  resignAt: null,
  isPasswordChangeRequired: false,
  lockUntil: null,
  revision: 0,
  createAt: new Date('2026-03-01T15:30:00.000Z'),
  updateAt: new Date('2026-03-01T15:30:00.000Z'),
}

describe('toUserView', () => {
  it('구간이 없으면 users.joinAt 의 기준 시간대 날짜 · resignDate null(B10)', () => {
    expect(toUserView(ROW, 'Asia/Seoul', NOW)).toMatchObject({
      joinDate: '2026-03-02',
      resignDate: null,
    })
    expect(toUserView(ROW, 'UTC', NOW).joinDate).toBe('2026-03-01')
  })

  it('구간이 있으면 마지막 구간의 날짜(DATE 열의 UTC 자정)', () => {
    const view = toUserView(
      {
        ...ROW,
        periodJoinAt: new Date('2025-01-02T00:00:00.000Z'),
        periodResignAt: new Date('2026-10-31T00:00:00.000Z'),
        resignAt: new Date('2026-10-31T15:00:00.000Z'),
      },
      'Asia/Seoul',
      NOW,
    )
    expect(view).toMatchObject({ joinDate: '2025-01-02', resignDate: '2026-10-31' })
    expect(view.resignAt?.toISOString()).toBe('2026-10-31T15:00:00.000Z')
  })

  it('lockUntil 은 미래일 때만(gise) — 지난 잠금은 null', () => {
    const future = new Date('2026-10-14T00:10:00.000Z')
    expect(toUserView({ ...ROW, lockUntil: future }, 'UTC', NOW).lockUntil).toBe(future)
    expect(
      toUserView({ ...ROW, lockUntil: new Date('2026-10-13T23:59:59.000Z') }, 'UTC', NOW).lockUntil,
    ).toBeNull()
  })

  it('키 열다섯 — 해시 · 실패 카운터는 싣지 않는다', () => {
    expect(Object.keys(toUserView(ROW, 'UTC', NOW)).sort()).toEqual([
      'createAt',
      'isPasswordChangeRequired',
      'joinDate',
      'lockUntil',
      'resignAt',
      'resignDate',
      'revision',
      'roleName',
      'roleNo',
      'teamName',
      'teamNo',
      'updateAt',
      'userId',
      'userName',
      'userNo',
    ])
  })
})
```

`packages/admin-server/src/users/users.query.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adminUserListQuerySchema } from './users.query.js'

describe('adminUserListQuerySchema', () => {
  it('기본 — 1쪽 · 20개 · createAt 내림차순 · 필터 없음', () => {
    expect(adminUserListQuerySchema.parse({})).toEqual({
      page: 1,
      itemsPerPage: 20,
      sortBy: ['createAt'],
      sortOrder: ['desc'],
    })
  })

  it("🔴 filter[recursive] 는 'true' · 'false' 만 — 'false' 는 거짓, '0' · '' 는 거부", () => {
    expect(adminUserListQuerySchema.parse({ filter: { recursive: 'false' } }).filter).toEqual({
      recursive: false,
    })
    for (const recursive of ['0', '', '1']) {
      expect(adminUserListQuerySchema.safeParse({ filter: { recursive } }).success, recursive).toBe(
        false,
      )
    }
  })

  it('filter[teamNo] 는 0 이상 정수 문자열 — 빈 값 · 부호는 거부', () => {
    expect(adminUserListQuerySchema.parse({ filter: { teamNo: '12' } }).filter?.teamNo).toBe(12n)
    for (const teamNo of ['', '-1', ' 3']) {
      expect(adminUserListQuerySchema.safeParse({ filter: { teamNo } }).success, teamNo).toBe(false)
    }
  })

  it('keyword 는 앞뒤 공백을 떼고 64자까지 · status 는 active · resigned · 정렬 열 밖은 거부', () => {
    expect(adminUserListQuerySchema.parse({ filter: { keyword: ' kim ' } }).filter?.keyword).toBe(
      'kim',
    )
    expect(
      adminUserListQuerySchema.safeParse({ filter: { keyword: 'a'.repeat(65) } }).success,
    ).toBe(false)
    expect(adminUserListQuerySchema.safeParse({ filter: { status: 'gone' } }).success).toBe(false)
    expect(adminUserListQuerySchema.safeParse({ sortBy: 'password' }).success).toBe(false)
    expect(adminUserListQuerySchema.parse({ sortBy: 'resignAt', sortOrder: 'asc' })).toMatchObject({
      sortBy: ['resignAt'],
      sortOrder: ['asc'],
    })
  })
})
```

`packages/admin-server/src/users/users.read.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { seedClosure, seedPeriod } from '../test-support/users.js'
import { adminUserListQuerySchema } from './users.query.js'
import { AdminUsersService } from './users.service.js'

// 사용자 읽기 셋(2d 스펙 §5-6) — 각 테스트는 자기 아이디 접두어로 시드하고 그 접두어로 거른다.

let t: TestDatabase
let service: AdminUsersService
let roleNo: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined)
  roleNo = await seedRole(t.db, { roleName: '읽기 역할', permissions: ['org.users:read'] })
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

function list(input: Record<string, unknown>) {
  return service.list(adminUserListQuerySchema.parse({ itemsPerPage: 100, ...input }))
}

const ids = (items: readonly { userId: string }[]) => items.map((item) => item.userId)

describe('목록 투영', () => {
  it('대표 팀 · 마지막 구간의 날짜 · 지난 잠금은 null(B10)', async () => {
    const team = await seedTeam(t.db, 'proj-team')
    const user = await seedUser(t.db, {
      roleNo,
      userId: 'proj-user',
      lockUntil: new Date(Date.now() - 60_000),
    })
    await addToTeam(t.db, team, user.userNo)
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2024-01-02',
      resignDate: '2024-06-30',
    })
    await seedPeriod(t.db, { userNo: user.userNo, joinDate: '2025-03-04' })
    const { items } = await list({ filter: { keyword: 'proj-user' } })
    expect(items).toEqual([
      expect.objectContaining({
        userNo: user.userNo,
        userId: 'proj-user',
        roleNo,
        roleName: '읽기 역할',
        teamNo: team,
        teamName: 'proj-team',
        joinDate: '2025-03-04',
        resignDate: null,
        resignAt: null,
        lockUntil: null,
        isPasswordChangeRequired: false,
        revision: 0,
      }),
    ])
  })

  it('🔴 무소속 계정도 보인다(LEFT JOIN) · 구간이 없으면 users.joinAt 의 기준 시간대 날짜', async () => {
    const user = await seedUser(t.db, {
      roleNo,
      userId: 'solo-user',
      joinAt: new Date('2026-03-01T15:30:00.000Z'),
    })
    const { items } = await list({ filter: { keyword: 'solo-user' } })
    expect(items).toEqual([
      expect.objectContaining({
        userNo: user.userNo,
        teamNo: null,
        teamName: null,
        joinDate: '2026-03-02',
        resignDate: null,
      }),
    ])
  })

  it('🔴 두 팀 소속은 가장 작은 teamNo 로 한 번만 나온다(Review Focus 5)', async () => {
    const first = await seedTeam(t.db, 'two-team-a')
    const second = await seedTeam(t.db, 'two-team-b')
    const user = await seedUser(t.db, { roleNo, userId: 'two-team-user' })
    await addToTeam(t.db, second, user.userNo)
    await addToTeam(t.db, first, user.userNo)
    const { items } = await list({ filter: { keyword: 'two-team-user' } })
    expect(items.map((item) => [item.teamNo, item.teamName])).toEqual([[first, 'two-team-a']])
    const bySecond = await list({ filter: { keyword: 'two-team', teamNo: String(second) } })
    expect(ids(bySecond.items)).toEqual(['two-team-user'])
  })
})

describe('검색어', () => {
  it("🔴 '%' · '_' · '!' 는 글자다(LIKE 이스케이프) — 아이디와 이름 모두 본다", async () => {
    for (const userId of ['kw-50%off', 'kw-50xoff', 'kw-a_b', 'kw-axb', 'kw-c!d', 'kw-cd']) {
      await seedUser(t.db, { roleNo, userId })
    }
    await seedUser(t.db, { roleNo, userId: 'kw-name', userName: '이름%검색' })
    expect(ids((await list({ filter: { keyword: '50%' } })).items)).toEqual(['kw-50%off'])
    expect(ids((await list({ filter: { keyword: 'a_b' } })).items)).toEqual(['kw-a_b'])
    expect(ids((await list({ filter: { keyword: 'c!d' } })).items)).toEqual(['kw-c!d'])
    expect(ids((await list({ filter: { keyword: '이름%' } })).items)).toEqual(['kw-name'])
  })
})

describe('팀 필터(B9 · §14 R6-3)', () => {
  it('🔴 소속 전체로 거르고, 하위 팀 포함은 closure 자기 행 없이도 직접 소속을 잡는다', async () => {
    const parent = await seedTeam(t.db, 'tree-parent')
    const child = await seedTeam(t.db, 'tree-child')
    // 자기 행(depth 0)을 일부러 넣지 않는다
    await seedClosure(t.db, parent, child, 1)
    const direct = await seedUser(t.db, { roleNo, userId: 'tree-direct' })
    const nested = await seedUser(t.db, { roleNo, userId: 'tree-nested' })
    await seedUser(t.db, { roleNo, userId: 'tree-none' })
    await addToTeam(t.db, parent, direct.userNo)
    await addToTeam(t.db, child, nested.userNo)
    const of = async (filter: Record<string, unknown>) =>
      ids(
        (
          await list({
            filter: { keyword: 'tree-', ...filter },
            sortBy: 'userId',
            sortOrder: 'asc',
          })
        ).items,
      )
    expect(await of({ teamNo: String(parent) })).toEqual(['tree-direct'])
    expect(await of({ teamNo: String(parent), recursive: 'false' })).toEqual(['tree-direct'])
    expect(await of({ teamNo: String(parent), recursive: 'true' })).toEqual([
      'tree-direct',
      'tree-nested',
    ])
    expect(await of({ teamNo: String(child), recursive: 'true' })).toEqual(['tree-nested'])
    // 팀 없이 recursive 만은 조건이 아니다
    expect(await of({ recursive: 'true' })).toEqual(['tree-direct', 'tree-nested', 'tree-none'])
  })
})

describe('상태 · 정렬 · 쪽', () => {
  it('active 는 퇴사 처리 없음, resigned 는 퇴사 · 퇴사 예정', async () => {
    await seedUser(t.db, { roleNo, userId: 'st-active' })
    await seedUser(t.db, { roleNo, userId: 'st-gone', resignAt: new Date(Date.now() - 86_400_000) })
    await seedUser(t.db, {
      roleNo,
      userId: 'st-leaving',
      resignAt: new Date(Date.now() + 86_400_000),
    })
    const of = async (status: string) =>
      ids(
        (await list({ filter: { keyword: 'st-', status }, sortBy: 'userId', sortOrder: 'asc' }))
          .items,
      )
    expect(await of('active')).toEqual(['st-active'])
    expect(await of('resigned')).toEqual(['st-gone', 'st-leaving'])
  })

  it('정렬 열 + userNo 보조 · total 은 bigint · page · itemsPerPage 그대로', async () => {
    for (const userId of ['pg-c', 'pg-a', 'pg-b']) await seedUser(t.db, { roleNo, userId })
    const page = await service.list(
      adminUserListQuerySchema.parse({
        filter: { keyword: 'pg-' },
        sortBy: 'userId',
        sortOrder: 'asc',
        itemsPerPage: 2,
        page: 2,
      }),
    )
    expect(page).toMatchObject({ total: 3n, page: 2, itemsPerPage: 2 })
    expect(ids(page.items)).toEqual(['pg-c'])
    // 기본 createAt 내림차순 — 같은 초에 만든 셋은 userNo 내림차순(나중 것이 먼저)
    expect(ids((await list({ filter: { keyword: 'pg-' } })).items)).toEqual([
      'pg-b',
      'pg-a',
      'pg-c',
    ])
  })
})

describe('단건 · 재직 이력', () => {
  it('단건은 목록 행과 같다 · 없으면 404 ERR_NO_USER', async () => {
    const user = await seedUser(t.db, { roleNo, userId: 'one-user' })
    const [listed] = (await list({ filter: { keyword: 'one-user' } })).items
    expect(await service.findOne(user.userNo)).toEqual(listed)
    const missing = await rejection(() => service.findOne(999_999n))
    expect(missing.code).toBe(CommonErrorCodes.ERR_NO_USER)
    expect(missing.message).toBe(ACCOUNT_MESSAGES.noUser)
  })

  it('이력은 입사일 내림차순 · 기록자 이름(LEFT JOIN) · recordedTimezone UTC · 없는 사용자 404', async () => {
    const recorder = await seedUser(t.db, { roleNo, userId: 'hist-admin', userName: '기록자' })
    const user = await seedUser(t.db, { roleNo, userId: 'hist-user' })
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2024-01-02',
      resignDate: '2024-06-30',
      reason: '이직',
    })
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2025-03-04',
      reason: '복직',
      createdBy: recorder.userNo,
    })
    const { items } = await service.periods(user.userNo)
    expect(
      items.map((period) => [
        period.joinDate,
        period.resignDate,
        period.reason,
        period.createdBy,
        period.createdByName,
        period.recordedTimezone,
      ]),
    ).toEqual([
      ['2025-03-04', null, '복직', recorder.userNo, '기록자', 'UTC'],
      ['2024-01-02', '2024-06-30', '이직', null, null, 'UTC'],
    ])
    expect((await rejection(() => service.periods(999_999n))).code).toBe(
      CommonErrorCodes.ERR_NO_USER,
    )
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test user-view users.query` · `pnpm --filter @ssworks/admin-server test:db users.read`
Expected: FAIL — `Failed to resolve import "./user-view.js"` · `"./users.query.js"` · `"./users.service.js"`.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/users/errors.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { validationError } from '../http/validation.js'

// 정본: 없음 — 사용자 서비스 · 잠금 도우미가 같은 오류를 만든다(2d 스펙 §6 · ⑬ K1). 문구는 ACCOUNT_MESSAGES 한 곳.

export function noUser(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_USER, ACCOUNT_MESSAGES.noUser)
}

/** 상태 전이 · 재직 구간 위반 — 409 ERR_COMMON_CONFLICT */
export function userConflict(message: string): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, message)
}

/** 본문 칸에 붙는 위반 — 400 ERR_COMMON_VALIDATION + issues[{ path: [field] }](B1 — admin-ui toFieldErrors 가 칸에 단다) */
export function fieldError(field: string, message: string): BusinessError {
  return validationError([{ path: [field], code: 'custom', message }], message)
}

export function userRevisionConflict(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    ACCOUNT_MESSAGES.userRevisionMismatch,
  )
}
```

`packages/admin-server/src/users/user-view.ts`:

```ts
import type { Kysely } from 'kysely'
import { dateIn, fromDateColumn } from '../accounts/calendar.js'
import type { AdminDatabase } from '../database/types.js'
import { noUser } from './errors.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(목록 투영 — 역할 · 팀 JOIN) + 2b
//       kysely-auth.repository.ts(대표 팀 R34)
// 바꾼 점:
//  - 팀은 LEFT JOIN — 무소속 계정도 보인다(hangang · crm 은 INNER 라 사라졌다). 대표 팀 = 가장 작은 teamNo(인증과 같은 팀).
//  - 날짜는 마지막 재직 구간에서(B10 — 원천). 구간이 없는 시드 계정은 users.joinAt 의 기준 시간대 날짜.
//  - lockUntil 은 미래일 때만(gise) — 지난 잠금은 잠금이 아니다. 해시 · 실패 카운터는 싣지 않는다.
// 🔴 이 투영은 보기 읽기다(응답 item · 감사 before/after). 판정에 쓰지 않는다 — 판정은 잠금 읽기(user-locks.ts ·
//    employment.ts)로 한다(§14 R5-6). 잔존으로 감싼 쓰기 안에서는 셈이 연 읽기 뷰를 보므로, 잠금을 기다린 사이 다른
//    쓰기가 바꾼 곁가지(대표 팀 이름 등)가 낡을 수 있다 — 자기 쓰기는 늘 보인다.

/** 응답 행 — 타입 별칭이라 감사 diff 의 `Record<string, unknown>` 자리에 들어간다 */
export type AdminUserView = {
  userNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  teamNo: bigint | null
  teamName: string | null
  joinDate: string
  resignDate: string | null
  resignAt: Date | null
  isPasswordChangeRequired: boolean
  lockUntil: Date | null
  revision: number
  createAt: Date
  updateAt: Date
}

/** 만들기 · 수정 감사 diff 의 칸(2d 스펙 §5-6) */
export const USER_AUDIT_FIELDS = [
  'userId',
  'userName',
  'roleNo',
  'roleName',
  'teamNo',
  'teamName',
  'joinDate',
] as const
/** 퇴사 · 퇴사일 정정 */
export const RESIGN_AUDIT_FIELDS = ['resignDate', 'resignAt'] as const
/** 재입사 — 재입사가 지우는 효력 시각까지(§14 R8) */
export const REHIRE_AUDIT_FIELDS = ['joinDate', 'resignDate', 'resignAt'] as const

export interface UserViewRow {
  userNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  teamNo: bigint | null
  teamName: string | null
  joinAt: Date
  periodJoinAt: Date | null
  periodResignAt: Date | null
  resignAt: Date | null
  isPasswordChangeRequired: boolean
  lockUntil: Date | null
  revision: number
  createAt: Date
  updateAt: Date
}

/** 목록 · 단건이 같은 투영을 쓴다(트랜잭션도 받는다 — Transaction 은 Kysely 다) */
export function userViewQuery(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('users as u')
    .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
    .leftJoin('teams as t', (join) =>
      join.on((eb) =>
        eb(
          't.teamNo',
          '=',
          eb
            .selectFrom('teamUserMap as m')
            .select((sub) => sub.fn.min('m.teamNo').as('teamNo'))
            .whereRef('m.userNo', '=', 'u.userNo'),
        ),
      ),
    )
    .leftJoin('userEmploymentPeriods as p', (join) =>
      join.on((eb) =>
        eb(
          'p.periodNo',
          '=',
          eb
            .selectFrom('userEmploymentPeriods as q')
            .select('q.periodNo')
            .whereRef('q.userNo', '=', 'u.userNo')
            .orderBy('q.joinAt', 'desc')
            .orderBy('q.periodNo', 'desc')
            .limit(1),
        ),
      ),
    )
    .select([
      'u.userNo',
      'u.userId',
      'u.userName',
      'u.roleNo',
      'r.roleName',
      't.teamNo',
      't.teamName',
      'u.joinAt',
      'p.joinAt as periodJoinAt',
      'p.resignAt as periodResignAt',
      'u.resignAt',
      'u.isPasswordChangeRequired',
      'u.lockUntil',
      'u.revision',
      'u.createAt',
      'u.updateAt',
    ])
}

export function toUserView(row: UserViewRow, timeZone: string, now: Date): AdminUserView {
  return {
    userNo: row.userNo,
    userId: row.userId,
    userName: row.userName,
    roleNo: row.roleNo,
    roleName: row.roleName,
    teamNo: row.teamNo,
    teamName: row.teamName,
    joinDate:
      row.periodJoinAt === null ? dateIn(row.joinAt, timeZone) : fromDateColumn(row.periodJoinAt),
    resignDate: row.periodResignAt === null ? null : fromDateColumn(row.periodResignAt),
    resignAt: row.resignAt,
    isPasswordChangeRequired: row.isPasswordChangeRequired,
    lockUntil:
      row.lockUntil !== null && row.lockUntil.getTime() > now.getTime() ? row.lockUntil : null,
    revision: row.revision,
    createAt: row.createAt,
    updateAt: row.updateAt,
  }
}

/** 한 사용자의 보기. 없으면 404 ERR_NO_USER */
export async function readUser(
  db: Kysely<AdminDatabase>,
  userNo: bigint,
  timeZone: string,
): Promise<AdminUserView> {
  const row = await userViewQuery(db).where('u.userNo', '=', userNo).executeTakeFirst()
  if (row === undefined) throw noUser()
  return toUserView(row, timeZone, new Date())
}
```

`packages/admin-server/src/users/users.query.ts`:

```ts
import { createQuerySchema, queryBigIntSchema, queryBooleanSchema } from '@ssworks/admin-shared'
import { expressionBuilder, sql, type Expression, type SqlBool } from 'kysely'
import { z } from 'zod'
import { likeContains } from '../database/like.js'
import type { AdminUsersTable } from '../database/tables/users.js'
import type { AdminDatabase } from '../database/types.js'

// 정본: hangang-home apps/api/src/modules/users/users.dto.ts(정렬 열 · 검색어 · 팀 필터) + ssworks-gise-home like.ts
// 바꾼 점: 서버 내부 스키마다(2d 스펙 §2-2 #13 — 화면은 어댑터). 🔴 boolean 쿼리는 'true' · 'false' 만(queryBooleanSchema —
//   crm · axion 의 z.coerce.boolean() 은 "false" 를 참으로 읽었다). 팀 필터는 소속 전체로(B9 — 대표 팀이 아니다), 하위 팀은
//   closure 자기 행에 기대지 않는다(§14 R6-3). resigned 는 퇴사 예정(효력 시각 미래)을 포함한다.

export const USER_KEYWORD_MAX_LENGTH = 64

export const adminUserListQuerySchema = createQuerySchema({
  sortableColumns: ['userId', 'userName', 'joinAt', 'resignAt', 'createAt', 'updateAt'] as const,
  defaultSortColumn: 'createAt',
  filterShape: {
    /** 아이디 · 이름 부분일치. 앞뒤 공백을 떼고, 비면 조건 없음 */
    keyword: z.string().trim().max(USER_KEYWORD_MAX_LENGTH),
    /** 소속 팀(대표 팀이 아니라 소속 전체 — B9). 3d TeamUserList 가 보낸다 */
    teamNo: queryBigIntSchema,
    /** teamNo 와 함께일 때만 뜻이 있다 — 하위 팀 포함 */
    recursive: queryBooleanSchema,
    /** active = 퇴사 처리 없음, resigned = 퇴사 · 퇴사 예정 */
    status: z.enum(['active', 'resigned']),
  },
})

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>

type UsersAlias = AdminDatabase & { u: AdminUsersTable }

/** 목록 조건 — 수 세기와 행 읽기가 같은 식을 쓴다. 조건이 없으면 1 = 1 */
export function userListCondition(filter: AdminUserListQuery['filter']): Expression<SqlBool> {
  const eb = expressionBuilder<UsersAlias, 'u'>()
  const conditions: Expression<SqlBool>[] = []
  if (filter?.keyword) {
    const pattern = likeContains(filter.keyword)
    conditions.push(
      eb.or([
        sql<SqlBool>`${sql.ref('u.userId')} like ${pattern} escape '!'`,
        sql<SqlBool>`${sql.ref('u.userName')} like ${pattern} escape '!'`,
      ]),
    )
  }
  const teamNo = filter?.teamNo
  if (teamNo !== undefined) {
    const recursive = filter?.recursive === true
    conditions.push(
      eb.exists(
        eb
          .selectFrom('teamUserMap as m')
          .select('m.userNo')
          .whereRef('m.userNo', '=', 'u.userNo')
          .where((inner) =>
            recursive
              ? // 🔴 직접 소속을 따로 본다 — closure 의 자기 행(depth 0)에 기대지 않는다(§14 R6-3)
                inner.or([
                  inner('m.teamNo', '=', teamNo),
                  inner(
                    'm.teamNo',
                    'in',
                    inner
                      .selectFrom('teamClosure as c')
                      .select('c.descendantNo')
                      .where('c.ancestorNo', '=', teamNo),
                  ),
                ])
              : inner('m.teamNo', '=', teamNo),
          ),
      ),
    )
  }
  if (filter?.status === 'active') conditions.push(eb('u.resignAt', 'is', null))
  if (filter?.status === 'resigned') conditions.push(eb('u.resignAt', 'is not', null))
  return eb.and(conditions)
}
```

`packages/admin-server/src/users/users.service.ts`:

```ts
import { Inject, Injectable, Optional } from '@nestjs/common'
import { toListQuery, type Paginated } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { fromDateColumn } from '../accounts/calendar.js'
import type { ResolvedUsersConfig } from '../accounts/options.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_ACCOUNTS_CONFIG, KYSELY } from '../tokens.js'
import { noUser } from './errors.js'
import { readUser, toUserView, userViewQuery, type AdminUserView } from './user-view.js'
import { userListCondition, type AdminUserListQuery } from './users.query.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(목록 · 퇴사 · 정정 · 재입사 · 치유 · 세션 폐기 · 감사) +
//       ssworks-gise-home 계정 서비스(생성 임시 비밀번호 · 초기화 · 잠금 해제) + kim5257-crm-v5(활성 구간 ≤ 1)
// 바꾼 점:
//  - 목록은 팀 LEFT JOIN · 소속 전체 필터 · 마지막 구간 날짜(B9 · B10). 관리 쿼리는 코어 users 를 직접 읽는다(2c B4).
//  - 쓰기는 대상 users ⋈ roles 를 잠그고 judgeAccountCommand 로 판정한다(② E1 · B8) — 정본 넷 중 서버 자기 보호는 gise 뿐.
//  - 날짜 ↔ 효력 시각은 accounts/calendar.ts 하나(⑤ Z1).
// 🔴 재인증 · argon2 는 트랜잭션 밖 · 권한 가드 뒤(2b §4-7). 임시 비밀번호는 응답에만 — 감사 가방 · 로그에 넣지 않는다.

/** 재직 이력 한 줄 — 날짜는 'YYYY-MM-DD' */
export type AdminEmploymentPeriodView = {
  periodNo: bigint
  joinDate: string
  resignDate: string | null
  reason: string | null
  recordedTimezone: string
  createdBy: bigint | null
  createdByName: string | null
  createAt: Date
}

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_ACCOUNTS_CONFIG) private readonly config: ResolvedUsersConfig,
    private readonly sessions: AdminSessionStore,
    // 🔴 @Optional — AdminAuthModule 이 빠진 앱이 DI 해석 오류가 아니라 모듈 기동 검사의 문구로 멈추게(2c R2 와 같은 이유)
    @Optional() private readonly reauthService?: AdminReauthService,
  ) {}

  async list(query: AdminUserListQuery): Promise<Paginated<AdminUserView>> {
    const { offset, limit, sort } = toListQuery(query)
    const where = userListCondition(query.filter)
    const now = new Date()
    return runQuery(async () => {
      const counted = await this.db
        .selectFrom('users as u')
        .where(where)
        .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
        .executeTakeFirstOrThrow()
      let rows = userViewQuery(this.db).where(where)
      for (const { column, order } of sort) rows = rows.orderBy(`u.${column}`, order)
      const result = await rows.orderBy('u.userNo', 'desc').limit(limit).offset(offset).execute()
      return {
        items: result.map((row) => toUserView(row, this.config.timeZone, now)),
        total: BigInt(counted.n),
        page: query.page,
        itemsPerPage: query.itemsPerPage,
      }
    })
  }

  findOne(userNo: bigint): Promise<AdminUserView> {
    return runQuery(() => readUser(this.db, userNo, this.config.timeZone))
  }

  /** 입사일 내림차순 · 기록자 이름(LEFT JOIN — 최초 입사 행은 기록자 없음). 사용자가 없으면 404 */
  periods(userNo: bigint): Promise<{ items: AdminEmploymentPeriodView[] }> {
    return runQuery(async () => {
      const user = await this.db
        .selectFrom('users')
        .select('userNo')
        .where('userNo', '=', userNo)
        .executeTakeFirst()
      if (user === undefined) throw noUser()
      const rows = await this.db
        .selectFrom('userEmploymentPeriods as p')
        .leftJoin('users as c', 'c.userNo', 'p.createdBy')
        .select([
          'p.periodNo',
          'p.joinAt',
          'p.resignAt',
          'p.reason',
          'p.recordedTimezone',
          'p.createdBy',
          'c.userName as createdByName',
          'p.createAt',
        ])
        .where('p.userNo', '=', userNo)
        .orderBy('p.joinAt', 'desc')
        .orderBy('p.periodNo', 'desc')
        .execute()
      return {
        items: rows.map((row) => ({
          periodNo: row.periodNo,
          joinDate: fromDateColumn(row.joinAt),
          resignDate: row.resignAt === null ? null : fromDateColumn(row.resignAt),
          reason: row.reason,
          recordedTimezone: row.recordedTimezone,
          createdBy: row.createdBy,
          createdByName: row.createdByName,
          createAt: row.createAt,
        })),
      }
    })
  }
}
```

(`sessions` · `reauthService` 는 Task 8~10 의 쓰기 메서드가 쓴다 — 생성자를 지금 정해 두어 테스트의 조립이 바뀌지 않게 한다.)

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test user-view users.query` · `pnpm --filter @ssworks/admin-server test:db users.read`
Expected: PASS.

🔴 확인: `userListCondition` 의 `recursive` 갈래에서 `inner('m.teamNo', '=', teamNo),` 줄을 빼고 `test:db users.read` → `tree-direct` 가 하위 팀 포함 목록에서 사라져 FAIL 하는 것을 보고서에 적고 되돌린다.

Run: `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint`
Expected: 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/users packages/admin-server/src/test-support/users.ts packages/admin-server/src/test-support/auth.ts
git commit -m "feat(admin-server): 사용자 읽기 — 보기 투영 · 목록 쿼리(팀 · 하위 팀 · 상태 · 검색어) · 단건 · 재직 이력" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 사용자 만들기 · 수정 — 잠금 읽기 · 임시 비밀번호 · 팀 · 입사일 정정 · 잔존

**Files:**

- Create: `packages/admin-server/src/users/user-locks.ts`
- Create: `packages/admin-server/src/users/employment.ts`
- Modify: `packages/admin-server/src/users/users.service.ts`
- Create: `packages/admin-server/src/users/users.write.db.test.ts`

**Interfaces:**

- Consumes: `judgeAccountCommand` · `actorOf`(2d-1), `withSuperAdminSurvival`(2d-1), `reauthenticate` · `permissionsOrEmpty`(Task 6), `todayIn` · `startOfDayIn` · `toDateColumn` · `fromDateColumn`(Task 3), `generateTemporaryPassword`(Task 3), `hashPassword`(2b `auth/password.ts`), `readUser`(Task 7), `fieldError` · `userConflict` · `userRevisionConflict` · `noUser`(Task 7), `isDuplicateOf`(2d-1).
- Produces(`users/user-locks.ts`): `interface LockedUser { userNo; roleNo; permissions: unknown; joinAt: Date; resignAt: Date | null; revision: number; loginFailCount: number; lockUntil: Date | null }` · `lockUser(trx, userNo): Promise<LockedUser>`(404) · `lockGrantRole(trx, roleNo): Promise<{ roleNo; permissions: unknown }>`(400 `roleNo`) · `lockTeam(trx, teamNo): Promise<void>`(400 `teamNo`) · `replaceTeam(trx, userNo, teamNo: bigint | null): Promise<void>`.
- Produces(`users/employment.ts`): `RECORDED_TIMEZONE = 'UTC'` · `interface LockedPeriod { periodNo: bigint; joinDate: string; resignDate: string | null }` · `lockLatestPeriods(trx, userNo): Promise<LockedPeriod[]>`([마지막, 직전]) · `insertPeriod(trx, { userNo, joinDate, reason, createdBy }): Promise<LockedPeriod>` · `correctJoinDate(trx, userNo, joinDate): Promise<void>`.
- Produces(서비스): `interface AdminUserCreateBody extends AdminUserCreate { currentPassword?: string }` · `interface AdminUserUpdateBody extends AdminUserUpdate { currentPassword?: string }` · `create(body, principal): Promise<{ item: AdminUserView; temporaryPassword: string }>` · `update(userNo, body, principal): Promise<{ item: AdminUserView; before: AdminUserView }>`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/users/users.write.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startOfDayIn, todayIn } from '../accounts/calendar.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { verifyPassword } from '../auth/password.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, transactionOnly, usersConfig } from '../test-support/accounts.js'
import { addToTeam, seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { periodsOf, seedPeriod, userRow } from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 만들기 · 수정(2d 스펙 §5-6). 🔴 이 파일의 공유 데이터베이스에는 '*' 사용자를 만들지 않는다 — 잔존 409 는 자기 데이터베이스를
// 따로 쓴다(describe '잔존'). 각 테스트는 자기 아이디 접두어로 시드한다.

let t: TestDatabase
let service: AdminUsersService
let plainRole: bigint
let wideRole: bigint
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.users:read', 'org.users:write'])
const WIDE = ['org.users:read', 'org.users:write', 'org.roles:read', 'org.roles:write']

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined)
  plainRole = await seedRole(t.db, { roleName: 'w-plain', permissions: ['org.users:read'] })
  wideRole = await seedRole(t.db, { roleName: 'w-wide', permissions: WIDE })
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

function fresh(userId: string) {
  return seedUser(t.db, { roleNo: plainRole, userId, userName: `${userId} 이름` })
}

const issue = (path: string, message: string) => ({
  issues: [{ path: [path], code: 'custom', message }],
})

describe('create', () => {
  it('🔴 임시 비밀번호(16자)를 돌려주고 해시만 저장 · 강제 변경 · 첫 구간은 기록자 없음 · UTC · 팀(⑥ P1 · B2)', async () => {
    const team = await seedTeam(t.db, 'c-team')
    const { item, temporaryPassword } = await service.create(
      {
        userId: 'c-new',
        userName: '새 사람',
        roleNo: plainRole,
        teamNo: team,
        joinDate: '2026-11-02',
      },
      root,
    )
    expect(temporaryPassword).toHaveLength(16)
    const row = await userRow(t.db, item.userNo)
    expect(row.password).not.toBe(temporaryPassword)
    expect(await verifyPassword(row.password, temporaryPassword)).toBe(true)
    expect(row.isPasswordChangeRequired).toBe(true)
    // 스펙 §5-1 표 — 입사일 2026-11-02 의 0시(KST)
    expect(row.joinAt.toISOString()).toBe('2026-11-01T15:00:00.000Z')
    expect(await periodsOf(t.db, item.userNo)).toEqual([
      {
        joinDate: '2026-11-02',
        resignDate: null,
        reason: null,
        recordedTimezone: 'UTC',
        createdBy: null,
      },
    ])
    expect(item).toMatchObject({
      userId: 'c-new',
      userName: '새 사람',
      roleNo: plainRole,
      teamNo: team,
      teamName: 'c-team',
      joinDate: '2026-11-02',
      resignDate: null,
      isPasswordChangeRequired: true,
      revision: 0,
    })
  })

  it('입사일이 없으면 기준 시간대의 오늘 · 팀 없음', async () => {
    const before = todayIn('Asia/Seoul')
    const { item } = await service.create(
      { userId: 'c-today', userName: '오늘', roleNo: plainRole, teamNo: null },
      root,
    )
    expect([before, todayIn('Asia/Seoul')]).toContain(item.joinDate)
    expect(item.teamNo).toBeNull()
  })

  it('🔴 아이디 중복 — 대소문자 · 끝 공백만 달라도 400 issues userId(Review Focus 2 · B1)', async () => {
    await service.create({ userId: 'c-Dup', userName: 'a', roleNo: plainRole, teamNo: null }, root)
    for (const userId of ['c-dup', 'C-DUP', 'c-Dup ']) {
      const error = await rejection(() =>
        service.create({ userId, userName: 'b', roleNo: plainRole, teamNo: null }, root),
      )
      expect(error.code, userId).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect(error.details).toEqual(issue('userId', ACCOUNT_MESSAGES.duplicateUserId))
    }
  })

  it('없는 역할 400 roleNo · 없는 팀 400 teamNo — 아무것도 만들지 않는다', async () => {
    const noRole = await rejection(() =>
      service.create({ userId: 'c-norole', userName: 'a', roleNo: 999_999n, teamNo: null }, root),
    )
    expect(noRole.details).toEqual(issue('roleNo', ACCOUNT_MESSAGES.noRole))
    const noTeam = await rejection(() =>
      service.create(
        { userId: 'c-noteam', userName: 'a', roleNo: plainRole, teamNo: 999_999n },
        root,
      ),
    )
    expect(noTeam.details).toEqual(issue('teamNo', ACCOUNT_MESSAGES.noTeam))
    expect(
      await t.db
        .selectFrom('users')
        .select('userNo')
        .where('userId', 'in', ['c-norole', 'c-noteam'])
        .execute(),
    ).toEqual([])
  })

  it('넓은 역할은 줄 수 없다 — 403 higherRoleToGrant + details.outside', async () => {
    const error = await rejection(() =>
      service.create({ userId: 'c-wide', userName: 'a', roleNo: wideRole, teamNo: null }, manager),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherRoleToGrant)
    expect(error.details).toEqual({ outside: ['org.roles:read', 'org.roles:write'] })
  })

  it('🔴 결과는 같은 트랜잭션에서 읽는다(§14 R5-2)', async () => {
    const strict = new AdminUsersService(
      transactionOnly(t.db),
      usersConfig(),
      new AdminSessionStore(t.db),
      undefined,
    )
    const { item } = await strict.create(
      { userId: 'c-in-trx', userName: 'a', roleNo: plainRole, teamNo: null },
      root,
    )
    expect(item.userId).toBe('c-in-trx')
  })
})

describe('update', () => {
  it('revision 이 다르면 409, 맞으면 +1 · updateAt 은 DB 시계로 바뀐다(⑧ V1 · §14 R6-2)', async () => {
    const user = await fresh('u-rev')
    const past = new Date('2020-01-01T00:00:00.000Z')
    await t.db
      .updateTable('users')
      .set({ updateAt: past })
      .where('userNo', '=', user.userNo)
      .execute()
    const conflict = await rejection(() =>
      service.update(user.userNo, { revision: 3, userName: 'x' }, root),
    )
    expect(conflict.code).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
    expect(conflict.message).toBe(ACCOUNT_MESSAGES.userRevisionMismatch)

    const { item, before } = await service.update(
      user.userNo,
      { revision: 0, userName: '바뀐 이름' },
      root,
    )
    expect(before).toMatchObject({ userName: 'u-rev 이름', revision: 0 })
    expect(item).toMatchObject({ userName: '바뀐 이름', revision: 1 })
    const row = await userRow(t.db, user.userNo)
    expect(row.updateAt.getTime()).toBeGreaterThan(past.getTime())
    expect(row.updateAt.getTime()).toBeGreaterThanOrEqual(row.createAt.getTime())
  })

  it('🔴 권한 없는 사람에게는 revision 이 틀려도 409 가 아니라 403 — 판정이 먼저(B7)', async () => {
    const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'u-b7-wide' })
    const error = await rejection(() =>
      service.update(wide.userNo, { revision: 9, userName: 'x' }, manager),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherAccount)
    expect(error.details).toEqual({ outside: ['org.roles:read', 'org.roles:write'] })
    expect((await userRow(t.db, wide.userNo)).revision).toBe(0)
  })

  it('본인 이름은 바꾼다(③ SF1) · 본인에게 넓은 역할은 줄 수 없다', async () => {
    const me = await fresh('u-self')
    const self = testPrincipal(me.userNo, ['org.users:read', 'org.users:write'])
    await service.update(me.userNo, { revision: 0, userName: '내 이름' }, self)
    const error = await rejection(() =>
      service.update(me.userNo, { revision: 1, roleNo: wideRole }, self),
    )
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherRoleToGrant)
    expect((await userRow(t.db, me.userNo)).roleNo).toBe(plainRole)
  })

  it('🔴 팀 바꾸기는 소속을 하나로 · null 은 비운다 · 없는 팀은 400 이고 그대로(Review Focus 5 · ⑨ T1)', async () => {
    const a = await seedTeam(t.db, 'u-team-a')
    const b = await seedTeam(t.db, 'u-team-b')
    const c = await seedTeam(t.db, 'u-team-c')
    const user = await fresh('u-teams')
    await addToTeam(t.db, a, user.userNo)
    await addToTeam(t.db, b, user.userNo)
    const memberships = async () =>
      (
        await t.db
          .selectFrom('teamUserMap')
          .select('teamNo')
          .where('userNo', '=', user.userNo)
          .orderBy('teamNo')
          .execute()
      ).map((row) => row.teamNo)

    const moved = await service.update(user.userNo, { revision: 0, teamNo: c }, root)
    expect(await memberships()).toEqual([c])
    expect(moved.before.teamNo).toBe(a)
    expect(moved.item).toMatchObject({ teamNo: c, teamName: 'u-team-c' })

    const missing = await rejection(() =>
      service.update(user.userNo, { revision: 1, teamNo: 999_999n }, root),
    )
    expect(missing.details).toEqual(issue('teamNo', ACCOUNT_MESSAGES.noTeam))
    expect(await memberships()).toEqual([c])

    await service.update(user.userNo, { revision: 1, teamNo: null }, root)
    expect(await memberships()).toEqual([])
  })

  it('입사일 정정 — 마지막 구간만, 직전 퇴사일 다음 날부터 이번 퇴사일까지(400 joinDate) · 구간 없음 409', async () => {
    const user = await fresh('u-join')
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2024-01-02',
      resignDate: '2024-06-30',
    })
    await seedPeriod(t.db, { userNo: user.userNo, joinDate: '2025-03-04' })
    for (const joinDate of ['2024-06-30', '2024-01-01']) {
      const error = await rejection(() =>
        service.update(user.userNo, { revision: 0, joinDate }, root),
      )
      expect(error.details, joinDate).toEqual(
        issue('joinDate', ACCOUNT_MESSAGES.joinDateOutOfRange),
      )
    }
    const { item } = await service.update(
      user.userNo,
      { revision: 0, joinDate: '2024-07-01' },
      root,
    )
    expect(item.joinDate).toBe('2024-07-01')
    expect((await periodsOf(t.db, user.userNo)).map((p) => [p.joinDate, p.resignDate])).toEqual([
      ['2024-01-02', '2024-06-30'],
      ['2024-07-01', null],
    ])
    expect((await userRow(t.db, user.userNo)).joinAt.toISOString()).toBe(
      startOfDayIn('2024-07-01', 'Asia/Seoul').toISOString(),
    )

    const resigned = await fresh('u-join-resigned')
    await seedPeriod(t.db, {
      userNo: resigned.userNo,
      joinDate: '2025-01-02',
      resignDate: '2025-05-31',
    })
    const late = await rejection(() =>
      service.update(resigned.userNo, { revision: 0, joinDate: '2025-06-01' }, root),
    )
    expect(late.details).toEqual(issue('joinDate', ACCOUNT_MESSAGES.joinDateOutOfRange))

    const bare = await fresh('u-join-none')
    const conflict = await rejection(() =>
      service.update(bare.userNo, { revision: 0, joinDate: '2025-01-01' }, root),
    )
    expect(conflict.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(conflict.message).toBe(ACCOUNT_MESSAGES.noPeriodForJoin)
  })

  it('없는 사용자 404 · 없는 역할 400 roleNo', async () => {
    expect((await rejection(() => service.update(999_999n, { revision: 0 }, root))).code).toBe(
      CommonErrorCodes.ERR_NO_USER,
    )
    const user = await fresh('u-norole')
    const error = await rejection(() =>
      service.update(user.userNo, { revision: 0, roleNo: 999_999n }, root),
    )
    expect(error.details).toEqual(issue('roleNo', ACCOUNT_MESSAGES.noRole))
  })

  it('🔴 결과는 같은 트랜잭션에서 읽는다(§14 R5-2) — 역할 변경(잔존 감쌈) 갈래도', async () => {
    const user = await fresh('u-in-trx')
    const strict = new AdminUsersService(
      transactionOnly(t.db),
      usersConfig(),
      new AdminSessionStore(t.db),
      undefined,
    )
    const { item } = await strict.update(
      user.userNo,
      { revision: 0, userName: 'in trx', roleNo: plainRole },
      root,
    )
    expect(item).toMatchObject({ userName: 'in trx', revision: 1 })
  })
})

describe('잔존(자기 데이터베이스)', () => {
  let u: TestDatabase
  let survival: AdminUsersService

  beforeAll(async () => {
    u = await createTestDatabase()
    survival = new AdminUsersService(u.db, usersConfig(), new AdminSessionStore(u.db), undefined)
  })

  afterAll(async () => {
    await u?.drop()
  })

  it('🔴 마지막 전체 권한 재직자의 역할을 내리면 409 lastSuperAdmin · 그대로', async () => {
    const star = await seedRole(u.db, { roleName: 'only-star', permissions: ['*'] })
    const plain = await seedRole(u.db, { roleName: 'only-plain', permissions: [] })
    const last = await seedUser(u.db, { roleNo: star, userId: 'only-admin' })
    const error = await rejection(() =>
      survival.update(last.userNo, { revision: 0, roleNo: plain }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await userRow(u.db, last.userNo)).toMatchObject({ roleNo: star, revision: 0 })
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db users.write`
Expected: FAIL — `service.create is not a function` · `service.update is not a function`.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/users/user-locks.ts`:

```ts
import type { Transaction } from 'kysely'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { AdminDatabase } from '../database/types.js'
import { fieldError, noUser } from './errors.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(대상 FOR UPDATE · 팀 지우고 넣기 — axion 과 같음) +
//       ssworks-gise-home account-policy.ts 의 판정 입력(대상의 역할 권한)
// 바꾼 점: 대상은 users ⋈ roles 를 함께 잠근다(B8 — 판정하는 동안 대상 역할의 권한이 바뀌지 않게, §14 R1-3b). 줄 역할 ·
//   팀도 잠근다.
// 🔴 사용자 쓰기 안의 결정 읽기는 모두 FOR UPDATE 다(2d 스펙 §14 R5-6 · R7-1 · R7-2) — 잔존으로 감싼 쓰기는 셈이 읽기 뷰를
//    먼저 열어, 비잠금 읽기는 잠금을 기다린 사이 커밋된 쓰기를 못 본다(11.4 기본). 잠금 읽기는 늘 최신 행을 본다.

export interface LockedUser {
  userNo: bigint
  roleNo: bigint
  /** 역할 열 그대로 — permissionsOrEmpty 로 읽는다 */
  permissions: unknown
  joinAt: Date
  resignAt: Date | null
  revision: number
  loginFailCount: number
  lockUntil: Date | null
}

/** 대상 사용자와 그 역할 행을 잠근다. 없으면 404 ERR_NO_USER */
export async function lockUser(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
): Promise<LockedUser> {
  const row = await trx
    .selectFrom('users as u')
    .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
    .select([
      'u.userNo',
      'u.roleNo',
      'r.permissions',
      'u.joinAt',
      'u.resignAt',
      'u.revision',
      'u.loginFailCount',
      'u.lockUntil',
    ])
    .where('u.userNo', '=', userNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw noUser()
  return row
}

/** 줄 역할 — 없으면 본문 칸 오류 400 roleNo(⑬ K1) */
export async function lockGrantRole(
  trx: Transaction<AdminDatabase>,
  roleNo: bigint,
): Promise<{ roleNo: bigint; permissions: unknown }> {
  const row = await trx
    .selectFrom('roles')
    .select(['roleNo', 'permissions'])
    .where('roleNo', '=', roleNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw fieldError('roleNo', ACCOUNT_MESSAGES.noRole)
  return row
}

/** 팀 — 없으면 본문 칸 오류 400 teamNo */
export async function lockTeam(trx: Transaction<AdminDatabase>, teamNo: bigint): Promise<void> {
  const row = await trx
    .selectFrom('teams')
    .select('teamNo')
    .where('teamNo', '=', teamNo)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) throw fieldError('teamNo', ACCOUNT_MESSAGES.noTeam)
}

/** 팀 하나로 바꾼다(⑨ T1 — axion 처럼 지우고 넣는다). null 이면 소속을 비운다 */
export async function replaceTeam(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
  teamNo: bigint | null,
): Promise<void> {
  if (teamNo !== null) await lockTeam(trx, teamNo)
  await trx.deleteFrom('teamUserMap').where('userNo', '=', userNo).execute()
  if (teamNo !== null) await trx.insertInto('teamUserMap').values({ teamNo, userNo }).execute()
}
```

`packages/admin-server/src/users/employment.ts`:

```ts
import type { Transaction } from 'kysely'
import { fromDateColumn, toDateColumn } from '../accounts/calendar.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { AdminDatabase } from '../database/types.js'
import { fieldError, userConflict } from './errors.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(퇴사 · 퇴사일 정정 · 재입사 · 치유 · 문구) + kim5257-crm-v5
//       (활성 구간 ≤ 1 — 0006 장 주석: DB 는 부분 UNIQUE 가 없어 서비스가 지킨다)
// 바꾼 점: 날짜는 'YYYY-MM-DD' 로 비교하고 열에는 UTC 자정 Date 로 쓴다(B3). recordedTimezone 은 늘 'UTC'(B2 — 2a 장 주석).
// 🔴 구간 읽기는 모두 FOR UPDATE(§14 R5-6 · R7-2) — 대상 사용자 잠금을 기다린 사이 커밋된 구간을 본다.

/** 🔴 2a 장 주석 그대로 — "기록 시점 프로세스 TZ. 패키지는 항상 UTC"(assertUtcTimezone). 기준 시간대는 감사 meta 가 남긴다 */
export const RECORDED_TIMEZONE = 'UTC'

export interface LockedPeriod {
  periodNo: bigint
  joinDate: string
  resignDate: string | null
}

function toPeriod(row: { periodNo: bigint; joinAt: Date; resignAt: Date | null }): LockedPeriod {
  return {
    periodNo: row.periodNo,
    joinDate: fromDateColumn(row.joinAt),
    resignDate: row.resignAt === null ? null : fromDateColumn(row.resignAt),
  }
}

/** 마지막 구간 둘 — [마지막, 직전](입사일 · 번호 내림차순) */
export async function lockLatestPeriods(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
): Promise<LockedPeriod[]> {
  const rows = await trx
    .selectFrom('userEmploymentPeriods')
    .select(['periodNo', 'joinAt', 'resignAt'])
    .where('userNo', '=', userNo)
    .orderBy('joinAt', 'desc')
    .orderBy('periodNo', 'desc')
    .limit(2)
    .forUpdate()
    .execute()
  return rows.map(toPeriod)
}

/** 새 활성 구간. 🔴 최초 입사 · 치유 행은 createdBy null, 재입사 행만 행위자(B2 — 2a 장 주석) */
export async function insertPeriod(
  trx: Transaction<AdminDatabase>,
  input: { userNo: bigint; joinDate: string; reason: string | null; createdBy: bigint | null },
): Promise<LockedPeriod> {
  const result = await trx
    .insertInto('userEmploymentPeriods')
    .values({
      userNo: input.userNo,
      joinAt: toDateColumn(input.joinDate),
      resignAt: null,
      reason: input.reason,
      recordedTimezone: RECORDED_TIMEZONE,
      createdBy: input.createdBy,
    })
    .executeTakeFirstOrThrow()
  if (result.insertId === undefined) {
    throw new Error('userEmploymentPeriods INSERT 가 insertId 를 돌려주지 않았다.')
  }
  return { periodNo: result.insertId, joinDate: input.joinDate, resignDate: null }
}

/** 입사일 정정 — 마지막 구간만. 직전 퇴사일 다음 날부터 이번 퇴사일까지(400 joinDate), 구간 없음 409 */
export async function correctJoinDate(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
  joinDate: string,
): Promise<void> {
  const [last, previous] = await lockLatestPeriods(trx, userNo)
  if (last === undefined) throw userConflict(ACCOUNT_MESSAGES.noPeriodForJoin)
  const afterPrevious = previous?.resignDate == null || joinDate > previous.resignDate
  const notAfterOwnResign = last.resignDate === null || joinDate <= last.resignDate
  if (!afterPrevious || !notAfterOwnResign) {
    throw fieldError('joinDate', ACCOUNT_MESSAGES.joinDateOutOfRange)
  }
  await trx
    .updateTable('userEmploymentPeriods')
    .set({ joinAt: toDateColumn(joinDate) })
    .where('periodNo', '=', last.periodNo)
    .execute()
}
```

`packages/admin-server/src/users/users.service.ts`:

① import 를 이렇게 바꾼다(Task 7 의 것에 더한 줄 포함 — 정렬은 prettier/eslint 에 맡긴다):

```ts
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  toListQuery,
  type AdminUserCreate,
  type AdminUserUpdate,
  type Paginated,
} from '@ssworks/admin-shared'
import { sql, type Kysely } from 'kysely'
import { actorOf, judgeAccountCommand } from '../accounts/account-command.js'
import { fromDateColumn, startOfDayIn, todayIn } from '../accounts/calendar.js'
import { isDuplicateOf } from '../accounts/duplicate.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { ResolvedUsersConfig } from '../accounts/options.js'
import { permissionsOrEmpty } from '../accounts/permissions-column.js'
import { reauthenticate } from '../accounts/reauth.js'
import { withSuperAdminSurvival } from '../accounts/super-admin.js'
import { generateTemporaryPassword } from '../accounts/temporary-password.js'
import { hashPassword } from '../auth/password.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_ACCOUNTS_CONFIG, KYSELY } from '../tokens.js'
import { correctJoinDate, insertPeriod } from './employment.js'
import { fieldError, noUser, userRevisionConflict } from './errors.js'
import { lockGrantRole, lockTeam, lockUser, replaceTeam } from './user-locks.js'
import { readUser, toUserView, userViewQuery, type AdminUserView } from './user-view.js'
import { userListCondition, type AdminUserListQuery } from './users.query.js'
```

② `AdminEmploymentPeriodView` 타입 다음에 본문 타입을 더한다:

```ts
export interface AdminUserCreateBody extends AdminUserCreate {
  currentPassword?: string
}

export interface AdminUserUpdateBody extends AdminUserUpdate {
  currentPassword?: string
}
```

③ 클래스 첫 줄(생성자 앞)에 `private readonly logger = new Logger('AdminUsersService')` 를 더한다.

④ `periods` 메서드 다음에 더한다:

```ts
  /**
   * 계정 만들기 — 서버가 임시 비밀번호를 만든다(⑥ P1). 잔존을 늘리기만 해 센티넬을 잡지 않는다(§5-3).
   * 🔴 임시 비밀번호는 돌려주기만 한다 — 저장은 해시, 감사 · 로그에는 남기지 않는다(공통 11).
   */
  async create(
    body: AdminUserCreateBody,
    principal: AdminPrincipal,
  ): Promise<{ item: AdminUserView; temporaryPassword: string }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const temporaryPassword = generateTemporaryPassword()
    // 🔴 argon2 는 트랜잭션 밖 — 해시가 행 잠금을 쥔 채 돌지 않게(2b §4-7)
    const passwordHash = await hashPassword(temporaryPassword)
    const timeZone = this.config.timeZone
    const joinDate = body.joinDate ?? todayIn(timeZone)
    const actor = actorOf(principal)
    const item = await this.guardUserId(() =>
      runWriteTransaction(this.db, async (trx) => {
        const role = await lockGrantRole(trx, body.roleNo)
        judgeAccountCommand(actor, { kind: 'user.create', grant: this.permissionsOf(role) })
        if (body.teamNo !== null) await lockTeam(trx, body.teamNo)
        const inserted = await trx
          .insertInto('users')
          .values({
            userId: body.userId,
            password: passwordHash,
            userName: body.userName,
            roleNo: body.roleNo,
            joinAt: startOfDayIn(joinDate, timeZone),
            isPasswordChangeRequired: true,
          })
          .executeTakeFirstOrThrow()
        const userNo = inserted.insertId
        if (userNo === undefined) throw new Error('users INSERT 가 insertId 를 돌려주지 않았다.')
        if (body.teamNo !== null) {
          await trx.insertInto('teamUserMap').values({ teamNo: body.teamNo, userNo }).execute()
        }
        await insertPeriod(trx, { userNo, joinDate, reason: null, createdBy: null })
        // 🔴 같은 트랜잭션에서 읽는다(§14 R5-2)
        return readUser(trx, userNo, timeZone)
      }),
    )
    return { item, temporaryPassword }
  }

  /**
   * 수정 — revision 필수(⑧ V1). 역할을 바꾸면 잔존을 줄일 수 있어 센티넬로 감싼다. 팀은 하나로 바꾸고(⑨ T1), 입사일은
   * 마지막 구간을 정정한다.
   */
  async update(
    userNo: bigint,
    body: AdminUserUpdateBody,
    principal: AdminPrincipal,
  ): Promise<{ item: AdminUserView; before: AdminUserView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const timeZone = this.config.timeZone
    const actor = actorOf(principal)
    return runWriteTransaction(this.db, async (trx) => {
      const write = async (): Promise<AdminUserView> => {
        const target = await lockUser(trx, userNo)
        const grant =
          body.roleNo === undefined
            ? undefined
            : this.permissionsOf(await lockGrantRole(trx, body.roleNo))
        // 🔴 판정이 revision 보다 먼저다 — 권한 없는 사람에게 revision 상태를 드러내지 않는다(B7)
        judgeAccountCommand(actor, {
          kind: 'user.update',
          targetUserNo: userNo,
          current: this.permissionsOf(target),
          grant,
        })
        if (body.revision !== target.revision) throw userRevisionConflict()
        const before = await readUser(trx, userNo, timeZone)
        if (body.joinDate !== undefined) await correctJoinDate(trx, userNo, body.joinDate)
        if (body.teamNo !== undefined) await replaceTeam(trx, userNo, body.teamNo)
        await trx
          .updateTable('users')
          .set((eb) => ({
            ...(body.userName === undefined ? {} : { userName: body.userName }),
            ...(body.roleNo === undefined ? {} : { roleNo: body.roleNo }),
            ...(body.joinDate === undefined
              ? {}
              : { joinAt: startOfDayIn(body.joinDate, timeZone) }),
            revision: eb('revision', '+', 1),
            updateAt: sql<Date>`current_timestamp`,
          }))
          .where('userNo', '=', userNo)
          .execute()
        return before
      }
      // 🔴 역할을 바꾸는 수정만 잔존을 줄일 수 있다 — 센티넬이 트랜잭션의 첫 문장이 되게 감싼다(§5-3)
      const before =
        body.roleNo === undefined ? await write() : await withSuperAdminSurvival(trx, write)
      // 🔴 같은 트랜잭션에서 읽는다 — 응답 · 감사 after 가 이 쓰기의 결과다(§14 R5-2)
      return { item: await readUser(trx, userNo, timeZone), before }
    })
  }
```

⑤ 클래스 끝(마지막 `}` 앞)에 private 도우미 둘을 더한다:

```ts
  /** 아이디 UNIQUE 위반을 400 userId 칸 오류로(B1 — 제약 이름으로 가른다, §14 R1-6) */
  private async guardUserId<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (isDuplicateOf(error, 'uq_users_user_id')) {
        throw fieldError('userId', ACCOUNT_MESSAGES.duplicateUserId)
      }
      throw error
    }
  }

  private permissionsOf(row: { roleNo: bigint; permissions: unknown }): string[] {
    return permissionsOrEmpty(row, this.logger)
  }
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test:db users.write`
Expected: PASS.

🔴 순서 회귀 확인(보고서에 적고 되돌린다):

1. `update` 의 `judgeAccountCommand(…)` 와 `if (body.revision !== target.revision) …` 두 줄을 바꿔 놓고 `test:db users.write` → B7 테스트가 409 로 FAIL.
2. `update` 의 `await withSuperAdminSurvival(trx, write)` 를 `await write()` 로 바꾸면 잔존 테스트가 FAIL.
3. `create` 의 마지막 `return readUser(trx, …)` 를 트랜잭션 밖 `this.findOne(userNo)` 로 옮기면 트랜잭션 대역 테스트가 FAIL.

Run: `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint`
Expected: 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/users
git commit -m "feat(admin-server): 사용자 만들기 · 수정 — 임시 비밀번호, 잠금 읽기, 팀 하나, 입사일 정정, 잔존" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 퇴사 · 퇴사일 정정 · 재입사 — 효력 시각 · 즉시 세션 폐기 · 치유 · 활성 구간 ≤ 1

**Files:**

- Modify: `packages/admin-server/src/users/employment.ts`(`lockActivePeriods` · `reasonOf`)
- Modify: `packages/admin-server/src/users/users.service.ts`
- Create: `packages/admin-server/src/users/users.employment.db.test.ts`

**Interfaces:**

- Consumes: `effectiveResignAt` · `dateIn` · `startOfDayIn` · `toDateColumn`(Task 3), `lockUser`(Task 8), `insertPeriod` · `lockLatestPeriods`(Task 8), `AdminSessionStore.revokeAllOfUser(userNo, 'terminated', now, { trx })`(2c), `whileHeld`(Task 6).
- Produces(`employment.ts`): `lockActivePeriods(trx, userNo): Promise<LockedPeriod[]>` · `reasonOf(reason: string | null | undefined): string | null`(앞뒤 공백을 떼고 비면 null).
- Produces(서비스): 본문 타입 `AdminUserResignBody` · `AdminUserResignDateBody` · `AdminUserRehireBody`(각 admin-shared 타입 + `currentPassword?`), `interface UserEmploymentResult { item: AdminUserView; before: AdminUserView; meta: Record<string, unknown> }`, `resign(userNo, body, principal)` · `correctResignDate(userNo, body, principal)` · `rehire(userNo, body, principal)` — 모두 `Promise<UserEmploymentResult>`.
- meta 모양: 퇴사 `{ reason, revokedCount, healedPeriod?: true, timeZone }`, 퇴사일 정정 `{ reason?, timeZone }`(사유는 본문에 있을 때만), 재입사 `{ reason, timeZone }`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/users/users.employment.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, dateIn, effectiveResignAt, todayIn } from '../accounts/calendar.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import {
  liveSessionCount,
  periodsOf,
  seedPeriod,
  seedSession,
  userRow,
} from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 퇴사 · 퇴사일 정정 · 재입사(2d 스펙 §5-1 · §5-6). 🔴 공유 데이터베이스에는 '*' 사용자를 만들지 않는다 — 잔존 409 는 자기
// 데이터베이스(describe '잔존'). 날짜는 기준 시간대(Asia/Seoul)의 오늘에서 센다.

const TZ = 'Asia/Seoul'
const day = (offset: number) => addDays(todayIn(TZ), offset)

let t: TestDatabase
let service: AdminUsersService
let plainRole: bigint
let wideRole: bigint
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.users:read', 'org.users:write'])

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined)
  plainRole = await seedRole(t.db, { roleName: 'e-plain', permissions: ['org.users:read'] })
  wideRole = await seedRole(t.db, {
    roleName: 'e-wide',
    permissions: ['org.users:read', 'org.users:write', 'org.roles:read', 'org.roles:write'],
  })
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

/** 활성 구간 하나를 가진 재직자 */
async function employee(userId: string, joinDate = '2025-01-02') {
  const user = await seedUser(t.db, { roleNo: plainRole, userId })
  await seedPeriod(t.db, { userNo: user.userNo, joinDate })
  return user
}

const issue = (path: string, message: string) => ({
  issues: [{ path: [path], code: 'custom', message }],
})

describe('resign', () => {
  it('🔴 어제 → 효력 시각(오늘 0시)이 지났다 — 그 사용자 세션을 같은 트랜잭션에서 끊는다(공통 6)', async () => {
    const user = await employee('r-yesterday')
    await seedSession(t.db, user.userNo)
    await seedSession(t.db, user.userNo)
    const result = await service.resign(
      user.userNo,
      { resignDate: day(-1), reason: ' 개인 사정 ' },
      root,
    )
    expect(result.meta).toEqual({ reason: '개인 사정', revokedCount: 2, timeZone: TZ })
    expect(await liveSessionCount(t.db, user.userNo)).toBe(0)
    const row = await userRow(t.db, user.userNo)
    expect(row.resignAt?.toISOString()).toBe(effectiveResignAt(day(-1), TZ).toISOString())
    expect(row.revision).toBe(1)
    expect(await periodsOf(t.db, user.userNo)).toEqual([
      {
        joinDate: '2025-01-02',
        resignDate: day(-1),
        reason: '개인 사정',
        recordedTimezone: 'UTC',
        createdBy: null,
      },
    ])
    expect(result.before).toMatchObject({ resignDate: null, resignAt: null, revision: 0 })
    expect(result.item).toMatchObject({ resignDate: day(-1), revision: 1 })
  })

  it('🔴 오늘 → "당일까지 근무" — 효력은 내일 0시, 세션은 그대로(Review Focus 1)', async () => {
    const user = await employee('r-today')
    await seedSession(t.db, user.userNo)
    const result = await service.resign(user.userNo, { resignDate: day(0) }, root)
    expect(result.meta).toMatchObject({ revokedCount: 0 })
    expect(await liveSessionCount(t.db, user.userNo)).toBe(1)
    const resignAt = (await userRow(t.db, user.userNo)).resignAt
    if (resignAt === null) throw new Error('resignAt 이 비었다')
    expect(resignAt.toISOString()).toBe(effectiveResignAt(day(0), TZ).toISOString())
    expect(dateIn(resignAt, TZ)).toBe(day(1))
    expect(resignAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('미래 퇴사일 → 퇴사 예정, 세션 유지', async () => {
    const user = await employee('r-future')
    await seedSession(t.db, user.userNo)
    const result = await service.resign(user.userNo, { resignDate: day(30) }, root)
    expect(result.meta).toMatchObject({ revokedCount: 0 })
    expect(await liveSessionCount(t.db, user.userNo)).toBe(1)
  })

  it('🔴 입사 당일 퇴사는 된다 · 하루 앞은 400 resignDate(Review Focus 4)', async () => {
    const same = await employee('r-same-day', '2026-01-05')
    await expect(
      service.resign(same.userNo, { resignDate: '2026-01-05' }, root),
    ).resolves.toBeDefined()
    const early = await employee('r-early', '2026-01-05')
    const error = await rejection(() =>
      service.resign(early.userNo, { resignDate: '2026-01-04' }, root),
    )
    expect(error.details).toEqual(issue('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin))
    expect((await userRow(t.db, early.userNo)).resignAt).toBeNull()
  })

  it('본인 403 selfAccount · 넓은 계정 403 higherAccount + outside · 이미 퇴사 409', async () => {
    const me = await employee('r-self')
    const self = await rejection(() =>
      service.resign(me.userNo, { resignDate: day(1) }, testPrincipal(me.userNo, ['*'])),
    )
    expect(self.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(self.message).toBe(ACCOUNT_MESSAGES.selfAccount)

    const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'r-wide' })
    const higher = await rejection(() =>
      service.resign(wide.userNo, { resignDate: day(1) }, manager),
    )
    expect(higher.message).toBe(ACCOUNT_MESSAGES.higherAccount)
    expect(higher.details).toEqual({ outside: ['org.roles:read', 'org.roles:write'] })

    const gone = await employee('r-gone')
    await service.resign(gone.userNo, { resignDate: day(5) }, root)
    const again = await rejection(() => service.resign(gone.userNo, { resignDate: day(6) }, root))
    expect(again.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(again.message).toBe(ACCOUNT_MESSAGES.alreadyResigned)
  })

  it('🔴 권한 없는 사람에게는 이미 퇴사여도 409 가 아니라 403 — 판정이 먼저(B7)', async () => {
    const wide = await seedUser(t.db, {
      roleNo: wideRole,
      userId: 'r-b7',
      resignAt: new Date(Date.now() + 86_400_000),
    })
    const error = await rejection(() =>
      service.resign(wide.userNo, { resignDate: day(1) }, manager),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  })

  it('활성 구간이 없으면 users.joinAt 으로 치유한다(공통 7) · 둘이면 409 periodCorrupted', async () => {
    const seeded = await seedUser(t.db, {
      roleNo: plainRole,
      userId: 'r-heal',
      joinAt: new Date('2025-03-01T15:00:00.000Z'),
    })
    const result = await service.resign(seeded.userNo, { resignDate: '2025-12-31' }, root)
    expect(result.meta).toMatchObject({ healedPeriod: true })
    expect(await periodsOf(t.db, seeded.userNo)).toEqual([
      {
        joinDate: '2025-03-02',
        resignDate: '2025-12-31',
        reason: null,
        recordedTimezone: 'UTC',
        createdBy: null,
      },
    ])

    const broken = await employee('r-broken')
    await seedPeriod(t.db, { userNo: broken.userNo, joinDate: '2025-06-01' })
    const error = await rejection(() => service.resign(broken.userNo, { resignDate: day(1) }, root))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.periodCorrupted)
  })

  it('효력 시각은 기준 시간대의 다음 날 0시 — America/New_York 서머타임 시작일(⑤ Z1)', async () => {
    const newYork = new AdminUsersService(
      t.db,
      usersConfig(false, 'America/New_York'),
      new AdminSessionStore(t.db),
      undefined,
    )
    const user = await employee('r-new-york')
    const result = await newYork.resign(user.userNo, { resignDate: '2030-03-09' }, root)
    // 2030-03-10 이 서머타임 시작일 — 그날 0시는 아직 EST(-5)
    expect(result.item.resignAt?.toISOString()).toBe('2030-03-10T05:00:00.000Z')
    expect(result.meta).toMatchObject({ timeZone: 'America/New_York' })
  })

  it('🔴 퇴사가 대상 잠금을 기다리는 동안 재입사가 커밋되면 그 구간을 본다 — 활성 구간이 둘이 되지 않는다(§14 R5-6 · R7-2)', async () => {
    const user = await seedUser(t.db, {
      roleNo: plainRole,
      userId: 'r-race',
      resignAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    await seedPeriod(t.db, {
      userNo: user.userNo,
      joinDate: '2025-01-02',
      resignDate: '2025-12-31',
    })
    const result = await whileHeld(
      t,
      async (connection) => {
        await connection.query('select user_no from users where user_no = ? for update', [
          user.userNo,
        ])
        await connection.query(
          `insert into user_employment_periods (user_no, join_at, recorded_timezone, created_by) values (?, '2026-02-01', 'UTC', 1)`,
          [user.userNo],
        )
        await connection.query(
          'update users set resign_at = null, revision = revision + 1 where user_no = ?',
          [user.userNo],
        )
      },
      () => service.resign(user.userNo, { resignDate: '2030-01-31' }, root),
    )
    if (!result.ok) throw result.error
    expect(result.value.meta).not.toHaveProperty('healedPeriod')
    expect(
      (await periodsOf(t.db, user.userNo)).map((period) => [period.joinDate, period.resignDate]),
    ).toEqual([
      ['2025-01-02', '2025-12-31'],
      ['2026-02-01', '2030-01-31'],
    ])
  })
})

describe('correctResignDate', () => {
  it('마지막 구간과 효력 시각을 고친다 · revision + 1 · 세션은 건드리지 않는다 · 사유는 보낼 때만', async () => {
    const user = await employee('d-fix')
    await service.resign(user.userNo, { resignDate: day(10), reason: '이직' }, root)
    await seedSession(t.db, user.userNo)
    const result = await service.correctResignDate(user.userNo, { resignDate: day(-1) }, root)
    expect(result.item).toMatchObject({ resignDate: day(-1), revision: 2 })
    expect(result.meta).toEqual({ timeZone: TZ })
    expect((await userRow(t.db, user.userNo)).resignAt?.toISOString()).toBe(
      effectiveResignAt(day(-1), TZ).toISOString(),
    )
    expect(await liveSessionCount(t.db, user.userNo)).toBe(1)
    expect((await periodsOf(t.db, user.userNo))[0]?.reason).toBe('이직')

    const cleared = await service.correctResignDate(
      user.userNo,
      { resignDate: day(-1), reason: null },
      root,
    )
    expect(cleared.meta).toEqual({ reason: null, timeZone: TZ })
    expect((await periodsOf(t.db, user.userNo))[0]?.reason).toBeNull()
  })

  it('재직 중 409 notResigned · 구간 없음 409 · 입사일 앞 400 · 본인 403', async () => {
    const active = await employee('d-active')
    expect(
      (
        await rejection(() =>
          service.correctResignDate(active.userNo, { resignDate: day(1) }, root),
        )
      ).message,
    ).toBe(ACCOUNT_MESSAGES.notResigned)

    const bare = await seedUser(t.db, {
      roleNo: plainRole,
      userId: 'd-bare',
      resignAt: new Date(Date.now() + 86_400_000),
    })
    expect(
      (await rejection(() => service.correctResignDate(bare.userNo, { resignDate: day(1) }, root)))
        .message,
    ).toBe(ACCOUNT_MESSAGES.noPeriodForResign)

    const early = await employee('d-early', '2026-01-05')
    await service.resign(early.userNo, { resignDate: '2026-02-01' }, root)
    const before = await rejection(() =>
      service.correctResignDate(early.userNo, { resignDate: '2026-01-04' }, root),
    )
    expect(before.details).toEqual(issue('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin))

    const me = await employee('d-self')
    await service.resign(me.userNo, { resignDate: day(10) }, root)
    expect(
      (
        await rejection(() =>
          service.correctResignDate(
            me.userNo,
            { resignDate: day(11) },
            testPrincipal(me.userNo, ['*']),
          ),
        )
      ).message,
    ).toBe(ACCOUNT_MESSAGES.selfAccount)
  })
})

describe('rehire', () => {
  it('🔴 같은 날 재입사는 400(근무가 겹친다) · 다음 날은 된다 — 새 구간 기록자 = 행위자 · 효력 시각 지움', async () => {
    const user = await employee('h-back')
    await service.resign(user.userNo, { resignDate: '2026-03-31' }, root)
    const same = await rejection(() =>
      service.rehire(user.userNo, { joinDate: '2026-03-31' }, root),
    )
    expect(same.details).toEqual(issue('joinDate', ACCOUNT_MESSAGES.rehireNotAfterResign))

    const result = await service.rehire(
      user.userNo,
      { joinDate: '2026-04-01', reason: '복직' },
      root,
    )
    expect(result.item).toMatchObject({
      joinDate: '2026-04-01',
      resignDate: null,
      resignAt: null,
      revision: 2,
    })
    expect(result.before).toMatchObject({ resignDate: '2026-03-31' })
    expect(result.meta).toEqual({ reason: '복직', timeZone: TZ })
    expect(await periodsOf(t.db, user.userNo)).toEqual([
      {
        joinDate: '2025-01-02',
        resignDate: '2026-03-31',
        reason: null,
        recordedTimezone: 'UTC',
        createdBy: null,
      },
      {
        joinDate: '2026-04-01',
        resignDate: null,
        reason: '복직',
        recordedTimezone: 'UTC',
        createdBy: root.userNo,
      },
    ])
    expect((await userRow(t.db, user.userNo)).joinAt.toISOString()).toBe('2026-03-31T15:00:00.000Z')
  })

  it('재직 중 409 · 활성 구간이 남아 있으면 409 · 본인도 된다(B16) · 넓은 계정 403', async () => {
    const active = await employee('h-active')
    expect(
      (await rejection(() => service.rehire(active.userNo, { joinDate: day(1) }, root))).message,
    ).toBe(ACCOUNT_MESSAGES.notResignedForRehire)

    const odd = await seedUser(t.db, {
      roleNo: plainRole,
      userId: 'h-odd',
      resignAt: new Date(Date.now() - 86_400_000),
    })
    await seedPeriod(t.db, { userNo: odd.userNo, joinDate: '2025-01-02' })
    expect(
      (await rejection(() => service.rehire(odd.userNo, { joinDate: day(1) }, root))).message,
    ).toBe(ACCOUNT_MESSAGES.activePeriodExists)

    const me = await employee('h-self')
    await service.resign(me.userNo, { resignDate: day(10) }, root)
    await expect(
      service.rehire(
        me.userNo,
        { joinDate: day(11) },
        testPrincipal(me.userNo, ['org.users:read', 'org.users:write']),
      ),
    ).resolves.toBeDefined()

    const wide = await seedUser(t.db, {
      roleNo: wideRole,
      userId: 'h-wide',
      resignAt: new Date(Date.now() - 86_400_000),
    })
    expect(
      (await rejection(() => service.rehire(wide.userNo, { joinDate: day(1) }, manager))).message,
    ).toBe(ACCOUNT_MESSAGES.higherAccount)
  })
})

describe('잔존(자기 데이터베이스)', () => {
  let u: TestDatabase
  let survival: AdminUsersService

  beforeAll(async () => {
    u = await createTestDatabase()
    survival = new AdminUsersService(u.db, usersConfig(), new AdminSessionStore(u.db), undefined)
  })

  afterAll(async () => {
    await u?.drop()
  })

  it('🔴 마지막 전체 권한 재직자를 퇴사(퇴사 예정 포함)시키면 409 lastSuperAdmin · 치유 구간도 롤백', async () => {
    const star = await seedRole(u.db, { roleName: 'only-star', permissions: ['*'] })
    const last = await seedUser(u.db, { roleNo: star, userId: 'only-admin' })
    const error = await rejection(() => survival.resign(last.userNo, { resignDate: day(30) }, root))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await userRow(u.db, last.userNo)).toMatchObject({ resignAt: null, revision: 0 })
    expect(await periodsOf(u.db, last.userNo)).toEqual([])
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db users.employment`
Expected: FAIL — `service.resign is not a function` · `correctResignDate` · `rehire` 도 같다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/users/employment.ts` 끝에 더한다:

```ts
/** 활성 구간(퇴사일 없음) 전부 — 둘 이상이면 손상(공통 7). 🔴 FOR UPDATE — 기다린 사이 생긴 구간을 본다(§14 R7-2) */
export async function lockActivePeriods(
  trx: Transaction<AdminDatabase>,
  userNo: bigint,
): Promise<LockedPeriod[]> {
  const rows = await trx
    .selectFrom('userEmploymentPeriods')
    .select(['periodNo', 'joinAt', 'resignAt'])
    .where('userNo', '=', userNo)
    .where('resignAt', 'is', null)
    .orderBy('periodNo')
    .forUpdate()
    .execute()
  return rows.map(toPeriod)
}

/** 사유 — 앞뒤 공백을 떼고, 비면 없음(null) */
export function reasonOf(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
```

`packages/admin-server/src/users/users.service.ts`:

① import 를 고친다 — admin-shared 에서 `type AdminUserRehire` · `type AdminUserResign` · `type AdminUserResignDate` 를 더하고, calendar 에서 `dateIn` · `effectiveResignAt` · `toDateColumn` 을 더하고, `./employment.js` 를 `import { correctJoinDate, insertPeriod, lockActivePeriods, lockLatestPeriods, reasonOf } from './employment.js'` 로, `./errors.js` 를 `import { fieldError, noUser, userConflict, userRevisionConflict } from './errors.js'` 로 바꾼다.

② 본문 타입(`AdminUserUpdateBody` 다음)에 더한다:

```ts
export interface AdminUserResignBody extends AdminUserResign {
  currentPassword?: string
}

export interface AdminUserResignDateBody extends AdminUserResignDate {
  currentPassword?: string
}

export interface AdminUserRehireBody extends AdminUserRehire {
  currentPassword?: string
}

/** 퇴사 · 퇴사일 정정 · 재입사의 결과 — 감사 diff 의 before 와 meta 를 함께 돌려준다 */
export interface UserEmploymentResult {
  item: AdminUserView
  before: AdminUserView
  meta: Record<string, unknown>
}
```

③ `update` 다음에 더한다:

```ts
  /**
   * 퇴사(⑤ Z1). 효력 시각(기준 시간대의 퇴사일 다음 날 0시)이 이미 지났으면 그 사용자의 세션을 같은 트랜잭션에서
   * 폐기한다 — 미래면 두고 인증이 그 시각에 막는다(공통 6). 활성 구간이 없으면 users.joinAt 으로 치유한다(공통 7).
   * 🔴 늘 잔존 잠금 — 퇴사 예정(미래)도 셈에서 곧바로 빠진다(§5-3).
   */
  async resign(
    userNo: bigint,
    body: AdminUserResignBody,
    principal: AdminPrincipal,
  ): Promise<UserEmploymentResult> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const timeZone = this.config.timeZone
    const actor = actorOf(principal)
    const reason = reasonOf(body.reason)
    const now = new Date()
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(trx, async () => {
        const target = await lockUser(trx, userNo)
        // 🔴 판정이 상태보다 먼저(B7)
        judgeAccountCommand(actor, {
          kind: 'user.resign',
          targetUserNo: userNo,
          current: this.permissionsOf(target),
        })
        if (target.resignAt !== null) throw userConflict(ACCOUNT_MESSAGES.alreadyResigned)
        const before = await readUser(trx, userNo, timeZone)
        const active = await lockActivePeriods(trx, userNo)
        if (active.length > 1) throw userConflict(ACCOUNT_MESSAGES.periodCorrupted)
        const healed = active[0] === undefined
        const period =
          active[0] ??
          (await insertPeriod(trx, {
            userNo,
            joinDate: dateIn(target.joinAt, timeZone),
            reason: null,
            createdBy: null,
          }))
        if (body.resignDate < period.joinDate) {
          throw fieldError('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin)
        }
        await trx
          .updateTable('userEmploymentPeriods')
          .set({ resignAt: toDateColumn(body.resignDate), reason })
          .where('periodNo', '=', period.periodNo)
          .execute()
        const effective = effectiveResignAt(body.resignDate, timeZone)
        await trx
          .updateTable('users')
          .set((eb) => ({
            resignAt: effective,
            revision: eb('revision', '+', 1),
            updateAt: sql<Date>`current_timestamp`,
          }))
          .where('userNo', '=', userNo)
          .execute()
        // 🔴 효력 시각이 이미 지났으면 같은 트랜잭션에서 끊는다 — 커밋되면 그 사용자의 다음 요청은 401(§14 R6-1)
        const revokedCount =
          effective.getTime() <= now.getTime()
            ? await this.sessions.revokeAllOfUser(userNo, 'terminated', now, { trx })
            : 0
        return {
          item: await readUser(trx, userNo, timeZone),
          before,
          meta: { reason, revokedCount, ...(healed ? { healedPeriod: true } : {}), timeZone },
        }
      }),
    )
  }

  /**
   * 퇴사일 정정 — 마지막 구간만. 잔존 잠금 없음(resignAt 이 NULL 아닌 채로 바뀐다). 세션은 건드리지 않는다(hangang) —
   * 과거로 당기면 인증이 다음 요청에서 막는다.
   */
  async correctResignDate(
    userNo: bigint,
    body: AdminUserResignDateBody,
    principal: AdminPrincipal,
  ): Promise<UserEmploymentResult> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const timeZone = this.config.timeZone
    const actor = actorOf(principal)
    const reason = body.reason === undefined ? undefined : reasonOf(body.reason)
    return runWriteTransaction(this.db, async (trx) => {
      const target = await lockUser(trx, userNo)
      judgeAccountCommand(actor, {
        kind: 'user.resignDate',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
      })
      if (target.resignAt === null) throw userConflict(ACCOUNT_MESSAGES.notResigned)
      const before = await readUser(trx, userNo, timeZone)
      const [last] = await lockLatestPeriods(trx, userNo)
      if (last === undefined) throw userConflict(ACCOUNT_MESSAGES.noPeriodForResign)
      if (body.resignDate < last.joinDate) {
        throw fieldError('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin)
      }
      await trx
        .updateTable('userEmploymentPeriods')
        .set({
          resignAt: toDateColumn(body.resignDate),
          ...(reason === undefined ? {} : { reason }),
        })
        .where('periodNo', '=', last.periodNo)
        .execute()
      await trx
        .updateTable('users')
        .set((eb) => ({
          resignAt: effectiveResignAt(body.resignDate, timeZone),
          revision: eb('revision', '+', 1),
          updateAt: sql<Date>`current_timestamp`,
        }))
        .where('userNo', '=', userNo)
        .execute()
      return {
        item: await readUser(trx, userNo, timeZone),
        before,
        meta: { ...(reason === undefined ? {} : { reason }), timeZone },
      }
    })
  }

  /** 재입사 — 잔존 잠금 없음(셈을 늘리기만 한다). 본인도 된다(B16 — 퇴사 예정인 본인) */
  async rehire(
    userNo: bigint,
    body: AdminUserRehireBody,
    principal: AdminPrincipal,
  ): Promise<UserEmploymentResult> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const timeZone = this.config.timeZone
    const actor = actorOf(principal)
    const reason = reasonOf(body.reason)
    return runWriteTransaction(this.db, async (trx) => {
      const target = await lockUser(trx, userNo)
      judgeAccountCommand(actor, {
        kind: 'user.rehire',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
      })
      if (target.resignAt === null) throw userConflict(ACCOUNT_MESSAGES.notResignedForRehire)
      const before = await readUser(trx, userNo, timeZone)
      if ((await lockActivePeriods(trx, userNo)).length > 0) {
        throw userConflict(ACCOUNT_MESSAGES.activePeriodExists)
      }
      const [last] = await lockLatestPeriods(trx, userNo)
      // ⑤ Z1 에서 같은 날은 근무가 겹친다 — 재입사일은 직전 퇴사일 다음 날부터(axion)
      if (last?.resignDate != null && body.joinDate <= last.resignDate) {
        throw fieldError('joinDate', ACCOUNT_MESSAGES.rehireNotAfterResign)
      }
      await insertPeriod(trx, {
        userNo,
        joinDate: body.joinDate,
        reason,
        createdBy: principal.userNo,
      })
      await trx
        .updateTable('users')
        .set((eb) => ({
          joinAt: startOfDayIn(body.joinDate, timeZone),
          resignAt: null,
          revision: eb('revision', '+', 1),
          updateAt: sql<Date>`current_timestamp`,
        }))
        .where('userNo', '=', userNo)
        .execute()
      return { item: await readUser(trx, userNo, timeZone), before, meta: { reason, timeZone } }
    })
  }
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test:db users.employment`
Expected: PASS.

🔴 순서 · 잠금 회귀 확인(보고서에 적고 되돌린다):

1. `lockActivePeriods` 의 `.forUpdate()` 를 지우고 `test:db users.employment` → 경합 테스트가 활성 구간 셋(치유 행 하나 더)으로 FAIL.
2. `resign` 의 `judgeAccountCommand(…)` 와 `if (target.resignAt !== null) …` 를 바꾸면 B7 테스트가 409 로 FAIL.
3. `resign` 의 `withSuperAdminSurvival(trx, async () => {…})` 감쌈을 풀면 잔존 테스트가 FAIL.

Run: `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint`
Expected: 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/users
git commit -m "feat(admin-server): 퇴사 · 퇴사일 정정 · 재입사 — 효력 시각, 즉시 세션 폐기, 치유, 잠금 읽기" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 비밀번호 초기화 · 잠금 해제 · 스냅샷 격리 경합 테스트(SI-A)

**Files:**

- Modify: `packages/admin-server/src/users/users.service.ts`
- Create: `packages/admin-server/src/users/users.password.db.test.ts`
- Create: `packages/admin-server/src/users/users.snapshot.db.test.ts`
- Modify: `packages/admin-server/src/test-support/concurrency.ts`(`snapshotKysely`)

**Interfaces:**

- Consumes: `generateTemporaryPassword`(Task 3), `hashPassword`(2b), `lockUser`(Task 8), `revokeAllOfUser`(2c), `whileHeld`(Task 6), `resign`(Task 9).
- Produces(서비스): `interface AdminUserReauthBody { currentPassword?: string }` · `resetPassword(userNo, body: AdminUserReauthBody, principal): Promise<{ temporaryPassword: string; revokedCount: number }>` · `unlock(userNo, body: AdminUserReauthBody, principal): Promise<{ lockUntil: Date | null; loginFailCount: number }>`(잠금 해제 전 값 — 감사 meta).
- Produces(test-support): `snapshotKysely(t: TestDatabase, snapshot: boolean): Kysely<AdminDatabase>` — 풀 `initSql` 로 연결마다 `innodb_snapshot_isolation` 을 켜거나 끈다(전역은 건드리지 않는다, §14 R7-8). 다 쓰면 `destroy()`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/test-support/concurrency.ts`:

① import 를 이렇게 바꾼다:

```ts
import { MariadbDialect } from '@kim5257/kysely-mariadb-dialect'
import { Kysely } from 'kysely'
import { createConnection, createPool, type Connection } from 'mariadb'
import { adminPoolConfig } from '../database/connection.js'
import { adminKyselyPlugins } from '../database/kysely.js'
import type { AdminDatabase } from '../database/types.js'
import type { TestDatabase } from './db.js'
import { testDbServer } from './db-url.js'
```

② 파일 끝에 더한다:

```ts
/**
 * innodb_snapshot_isolation 을 이 풀의 연결마다 켠(끈) Kysely — MariaDB 11.6.2+ 의 기본(ON)을 11.4 에서 잰다(§14 R7-8).
 * 🔴 SET GLOBAL 을 쓰지 않는다 — 테스트 파일은 같은 서버에서 병렬로 돈다. 다 쓰면 destroy() 한다.
 */
export function snapshotKysely(t: TestDatabase, snapshot: boolean): Kysely<AdminDatabase> {
  return new Kysely<AdminDatabase>({
    dialect: new MariadbDialect({
      pool: createPool({
        ...adminPoolConfig({ ...testDbServer(), database: t.name, connectionLimit: 2 }),
        initSql: `set session innodb_snapshot_isolation = ${snapshot ? 'ON' : 'OFF'}`,
      }),
    }),
    plugins: adminKyselyPlugins(),
  })
}
```

`packages/admin-server/src/users/users.password.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { verifyPassword } from '../auth/password.js'
import type { AdminReauthService } from '../auth/reauth.service.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { FakeReauth, testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { liveSessionCount, seedSession, userRow } from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 비밀번호 초기화 · 잠금 해제(2d 스펙 §5-6 · 3c §9). 잔존과 무관 — '*' 사용자를 만들지 않는다.

let t: TestDatabase
let service: AdminUsersService
let plainRole: bigint
let wideRole: bigint
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.users:read', 'org.users:write'])
const PAST = new Date('2020-01-01T00:00:00.000Z')

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminUsersService(t.db, usersConfig(), new AdminSessionStore(t.db), undefined)
  plainRole = await seedRole(t.db, { roleName: 'p-plain', permissions: ['org.users:read'] })
  wideRole = await seedRole(t.db, {
    roleName: 'p-wide',
    permissions: ['org.users:read', 'org.users:write', 'org.roles:read', 'org.roles:write'],
  })
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

/** 잠긴 계정 — 수정일은 과거로 박아 둔다(바뀌지 않음을 잰다) */
async function locked(userId: string) {
  const user = await seedUser(t.db, {
    roleNo: plainRole,
    userId,
    loginFailCount: 5,
    lockUntil: new Date(Date.now() + 600_000),
  })
  await t.db
    .updateTable('users')
    .set({ updateAt: PAST })
    .where('userNo', '=', user.userNo)
    .execute()
  return user
}

describe('resetPassword', () => {
  it('🔴 임시 비밀번호 · 강제 변경 · 잠금 풀림 · 세션 폐기 — revision · updateAt 그대로(⑧ V1 · 공통 5)', async () => {
    const user = await locked('p-reset')
    await seedSession(t.db, user.userNo)
    await seedSession(t.db, user.userNo)
    const { temporaryPassword, revokedCount } = await service.resetPassword(user.userNo, {}, root)
    expect(temporaryPassword).toHaveLength(16)
    expect(revokedCount).toBe(2)
    expect(await liveSessionCount(t.db, user.userNo)).toBe(0)
    const row = await userRow(t.db, user.userNo)
    expect(await verifyPassword(row.password, temporaryPassword)).toBe(true)
    expect(await verifyPassword(row.password, user.password)).toBe(false)
    expect(row).toMatchObject({
      isPasswordChangeRequired: true,
      loginFailCount: 0,
      lockUntil: null,
      revision: 0,
    })
    expect(row.updateAt.toISOString()).toBe(PAST.toISOString())
  })

  it('본인 403 selfAccount · 넓은 계정 403 · 없는 사용자 404 — 비밀번호 그대로', async () => {
    const me = await seedUser(t.db, { roleNo: plainRole, userId: 'p-self' })
    const self = await rejection(() =>
      service.resetPassword(me.userNo, {}, testPrincipal(me.userNo, ['*'])),
    )
    expect(self.message).toBe(ACCOUNT_MESSAGES.selfAccount)
    expect(await verifyPassword((await userRow(t.db, me.userNo)).password, me.password)).toBe(true)

    const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'p-wide' })
    const higher = await rejection(() => service.resetPassword(wide.userNo, {}, manager))
    expect(higher.message).toBe(ACCOUNT_MESSAGES.higherAccount)
    expect(higher.details).toEqual({ outside: ['org.roles:read', 'org.roles:write'] })

    expect((await rejection(() => service.resetPassword(999_999n, {}, root))).code).toBe(
      CommonErrorCodes.ERR_NO_USER,
    )
  })
})

describe('unlock', () => {
  it('잠긴 계정의 카운터 · 잠금을 풀고 이전 값을 돌려준다 — revision · updateAt 그대로', async () => {
    const user = await locked('p-unlock')
    const before = await userRow(t.db, user.userNo)
    const previous = await service.unlock(user.userNo, {}, root)
    expect(previous).toEqual({ lockUntil: before.lockUntil, loginFailCount: 5 })
    const row = await userRow(t.db, user.userNo)
    expect(row).toMatchObject({ loginFailCount: 0, lockUntil: null, revision: 0 })
    expect(row.updateAt.toISOString()).toBe(PAST.toISOString())
  })

  it('잠기지 않아도 된다(B16 — 멱등) · 본인 403 · 넓은 계정 403', async () => {
    const free = await seedUser(t.db, { roleNo: plainRole, userId: 'p-free' })
    expect(await service.unlock(free.userNo, {}, root)).toEqual({
      lockUntil: null,
      loginFailCount: 0,
    })
    expect(
      (await rejection(() => service.unlock(free.userNo, {}, testPrincipal(free.userNo, ['*']))))
        .message,
    ).toBe(ACCOUNT_MESSAGES.selfAccount)
    const wide = await seedUser(t.db, { roleNo: wideRole, userId: 'p-wide-unlock' })
    expect((await rejection(() => service.unlock(wide.userNo, {}, manager))).message).toBe(
      ACCOUNT_MESSAGES.higherAccount,
    )
  })
})

describe('재인증(reauth: true)', () => {
  it('틀리면 403 ERR_REAUTH_REQUIRED 이고 쓰지 않는다, 맞으면 쓴다 — 끄면 묻지 않는다', async () => {
    const reauth = new FakeReauth()
    const guarded = new AdminUsersService(
      t.db,
      usersConfig(true),
      new AdminSessionStore(t.db),
      reauth as unknown as AdminReauthService,
    )
    const user = await locked('p-reauth')
    const wrong = await rejection(() =>
      guarded.resetPassword(user.userNo, { currentPassword: 'nope' }, root),
    )
    expect(wrong.code).toBe(CommonErrorCodes.ERR_REAUTH_REQUIRED)
    expect(await verifyPassword((await userRow(t.db, user.userNo)).password, user.password)).toBe(
      true,
    )
    await guarded.unlock(user.userNo, { currentPassword: 'right-password' }, root)
    await guarded.create(
      {
        userId: 'p-reauth-new',
        userName: '재인증',
        roleNo: plainRole,
        teamNo: null,
        currentPassword: 'right-password',
      },
      root,
    )
    expect(reauth.calls).toEqual(['nope', 'right-password', 'right-password'])

    const silent = new FakeReauth()
    const open = new AdminUsersService(
      t.db,
      usersConfig(false),
      new AdminSessionStore(t.db),
      silent as unknown as AdminReauthService,
    )
    await open.unlock(user.userNo, { currentPassword: 'anything' }, root)
    expect(silent.calls).toEqual([])
  })
})
```

`packages/admin-server/src/users/users.snapshot.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminSessionStore } from '../auth/session.store.js'
import { testPrincipal, usersConfig } from '../test-support/accounts.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { snapshotKysely, whileHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { periodsOf, seedPeriod, userRow } from '../test-support/users.js'
import { AdminUsersService } from './users.service.js'

// 🔴 MariaDB 11.6.2+ 는 innodb_snapshot_isolation=ON 이 기본이다(hangang 은 11.6.2, CI 는 11.4 — 풀 initSql 로 켠다,
//    §14 R7-8). 잔존으로 감싼 퇴사는 셈(비잠금)이 읽기 뷰를 먼저 연다. 그 뒤 · 대상 잠금 전에 대상의 로그인 실패(센티넬 없는
//    users UPDATE)가 커밋되면 ON 은 409 다시 시도(ER_CHECKREAD), OFF 는 기다렸다가 최신 행으로 진행한다(§14 R5-6 · R7-1).
//    공개 서비스 메서드(resign)를 거친다 — 부품을 따로 부르면 순서 회귀를 못 잡는다.

let t: TestDatabase
const root = testPrincipal(900n, ['*'])

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

async function target(userId: string) {
  const roleNo = await seedRole(t.db, {
    roleName: `${userId}-role`,
    permissions: ['org.users:read'],
  })
  const user = await seedUser(t.db, { roleNo, userId })
  await seedPeriod(t.db, { userNo: user.userNo, joinDate: '2025-01-02' })
  return user
}

/** 로그인 실패 한 번(2b updateLoginState 와 같은 모양) — 센티넬을 잡지 않는다 */
function loginFailure(userNo: bigint) {
  return async (connection: Connection) => {
    await connection.query('select login_fail_count from users where user_no = ? for update', [
      userNo,
    ])
    await connection.query(
      'update users set login_fail_count = login_fail_count + 1 where user_no = ?',
      [userNo],
    )
  }
}

describe('퇴사 · 스냅샷 격리(§14 R5-6 · R7-1)', () => {
  it('🔴 ON — 셈 뒤 대상의 로그인 실패가 커밋되면 409 ERR_COMMON_CONFLICT(원인 ER_CHECKREAD) · 아무것도 바뀌지 않는다', async () => {
    const user = await target('snap-on')
    const db = snapshotKysely(t, true)
    try {
      const service = new AdminUsersService(db, usersConfig(), new AdminSessionStore(db), undefined)
      const result = await whileHeld(t, loginFailure(user.userNo), () =>
        service.resign(user.userNo, { resignDate: '2030-01-31' }, root),
      )
      if (result.ok) throw new Error('409 를 기대했다')
      expect(result.error).toBeInstanceOf(BusinessError)
      const error = result.error as BusinessError
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
      expect((error.cause as { code?: string }).code).toBe('ER_CHECKREAD')
    } finally {
      await db.destroy()
    }
    expect(await userRow(t.db, user.userNo)).toMatchObject({
      resignAt: null,
      revision: 0,
      loginFailCount: 1,
    })
    expect((await periodsOf(t.db, user.userNo)).map((period) => period.resignDate)).toEqual([null])
  })

  it('OFF(11.4 기본) — 같은 순서에서 기다렸다가 최신 행으로 퇴사한다', async () => {
    const user = await target('snap-off')
    const db = snapshotKysely(t, false)
    try {
      const service = new AdminUsersService(db, usersConfig(), new AdminSessionStore(db), undefined)
      const result = await whileHeld(t, loginFailure(user.userNo), () =>
        service.resign(user.userNo, { resignDate: '2030-01-31' }, root),
      )
      if (!result.ok) throw result.error
    } finally {
      await db.destroy()
    }
    expect(await userRow(t.db, user.userNo)).toMatchObject({ revision: 1, loginFailCount: 1 })
    expect((await periodsOf(t.db, user.userNo)).map((period) => period.resignDate)).toEqual([
      '2030-01-31',
    ])
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test:db users.password users.snapshot`
Expected: `users.password` 는 FAIL — `service.resetPassword is not a function` · `service.unlock is not a function`. `users.snapshot` 은 Task 9 의 `resign` 이 이미 있어 PASS 할 수 있다 — 그 테스트의 RED 는 Step 4 에서 본다(`snapshotKysely(t, true)` 를 `false` 로 바꾸면 ON 테스트가 `409 를 기대했다` 로 FAIL — 테스트가 정말 스냅샷 격리를 탄다는 증거).

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/users/users.service.ts`:

① 본문 타입(`UserEmploymentResult` 다음)에 더한다:

```ts
/** 본문 없는 쓰기(초기화 · 잠금 해제) — 재인증을 켜면 currentPassword 만 온다 */
export interface AdminUserReauthBody {
  currentPassword?: string
}
```

② `rehire` 다음에 더한다:

```ts
  /**
   * 비밀번호 초기화(3c §9) — 해시 교체 · 강제 변경 · 잠금 해제 · 대상의 살아 있는 세션 폐기를 한 트랜잭션에서(공통 5).
   * 🔴 revision · updateAt 은 그대로(⑧ V1 — 열어 둔 수정 폼을 떨어뜨리지 않는다). 해시는 트랜잭션 밖.
   * 🔴 코어 users.password 를 직접 쓴다 — AUTH_REPOSITORY.changePassword 는 본인 변경(기대 해시 조건)용이다(2c B4).
   * 🔴 임시 비밀번호는 돌려주기만 한다 — 감사 meta 에는 revokedCount 만.
   */
  async resetPassword(
    userNo: bigint,
    body: AdminUserReauthBody,
    principal: AdminPrincipal,
  ): Promise<{ temporaryPassword: string; revokedCount: number }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(temporaryPassword)
    const actor = actorOf(principal)
    const now = new Date()
    const revokedCount = await runWriteTransaction(this.db, async (trx) => {
      const target = await lockUser(trx, userNo)
      judgeAccountCommand(actor, {
        kind: 'user.passwordReset',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
      })
      await trx
        .updateTable('users')
        .set({
          password: passwordHash,
          isPasswordChangeRequired: true,
          loginFailCount: 0,
          lockUntil: null,
        })
        .where('userNo', '=', userNo)
        .execute()
      return this.sessions.revokeAllOfUser(userNo, 'terminated', now, { trx })
    })
    return { temporaryPassword, revokedCount }
  }

  /** 잠금 해제(gise) — 실패 카운터 0 · lockUntil NULL. 잠겨 있지 않아도 된다(B16). revision · updateAt 그대로 */
  async unlock(
    userNo: bigint,
    body: AdminUserReauthBody,
    principal: AdminPrincipal,
  ): Promise<{ lockUntil: Date | null; loginFailCount: number }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = actorOf(principal)
    return runWriteTransaction(this.db, async (trx) => {
      const target = await lockUser(trx, userNo)
      judgeAccountCommand(actor, {
        kind: 'user.unlock',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
      })
      await trx
        .updateTable('users')
        .set({ loginFailCount: 0, lockUntil: null })
        .where('userNo', '=', userNo)
        .execute()
      return { lockUntil: target.lockUntil, loginFailCount: target.loginFailCount }
    })
  }
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test:db users.password users.snapshot`
Expected: PASS.

🔴 확인(보고서에 적고 되돌린다):

1. `users.snapshot.db.test.ts` ON 테스트의 `snapshotKysely(t, true)` 를 `false` 로 → `409 를 기대했다` 로 FAIL.
2. `lockUser` 의 `.forUpdate()` 를 지우면 ON 테스트가 여전히 409 일 수 있다(뒤의 UPDATE 도 1020 이다) — 잠금 읽기의 회귀는 Task 9 의 경합 테스트가 잡는다. 이 확인은 하지 않는다.
3. `resetPassword` 의 `revokeAllOfUser(…, { trx })` 에서 `{ trx }` 를 빼면 `users.password` 의 세션 폐기가 같은 트랜잭션 밖이 된다 — 테스트는 여전히 통과할 수 있으므로 리뷰에서 본다(Review 주의).

Run: `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint`
Expected: 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/users packages/admin-server/src/test-support/concurrency.ts
git commit -m "feat(admin-server): 비밀번호 초기화 · 잠금 해제, 스냅샷 격리 ON · OFF 경합 테스트" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: 본문 파이프 · 컨트롤러 열 라우트 · `AdminUsersModule` · 배선

**Files:**

- Create: `packages/admin-server/src/users/users.body.ts` · `users/users.body.test.ts`
- Create: `packages/admin-server/src/users/users.controller.ts`
- Create: `packages/admin-server/src/users/users.module.ts` · `users/users.module.test.ts`
- Modify: `packages/admin-server/src/admin-server.module.ts`(`ADMIN_ROUTE_MODULES`)
- Modify: `packages/admin-server/src/index.ts`
- Modify: `packages/admin-server/src/test-support/admin-app.ts`

**Interfaces:**

- Consumes: 서비스 메서드 열(Task 7~10), 본문 타입 여섯(`AdminUserCreateBody` · `AdminUserUpdateBody` · `AdminUserResignBody` · `AdminUserResignDateBody` · `AdminUserRehireBody` · `AdminUserReauthBody`), `currentPasswordField`(2d-1 `accounts/reauth-body.ts`), `resolveUsersConfig`(Task 4), `USER_AUDIT_FIELDS` · `RESIGN_AUDIT_FIELDS` · `REHIRE_AUDIT_FIELDS`(Task 7).
- Produces: `UserCreateBodyPipe` · `UserUpdateBodyPipe` · `UserResignBodyPipe` · `UserResignDateBodyPipe` · `UserRehireBodyPipe` · `UserReauthBodyPipe`(생성자 `(config: ResolvedAccountsConfig)`), `AdminUsersController`, `AdminUsersModule`(index 에 낸다), test-support `bootAdminApp(db, { reauth?, timeZone? })` 가 `AdminUsersModule` 을 함께 띄운다.

| 라우트                                  | 슬롯           | 응답 · 상태                            | 감사                                                              |
| --------------------------------------- | -------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `GET /users`                            | `users.read`   | `{ items, total, page, itemsPerPage }` | —                                                                 |
| `GET /users/:userNo`                    | `users.read`   | `{ item }`                             | —                                                                 |
| `GET /users/:userNo/employment-periods` | `users.read`   | `{ items }`                            | —                                                                 |
| `POST /users`                           | `users.manage` | 201 `{ item, temporaryPassword }`      | `org.user.create` · 대상 붙임 · diff `USER_AUDIT_FIELDS`          |
| `PATCH /users/:userNo`                  | `users.manage` | `{ item }`                             | `org.user.update` · diff                                          |
| `POST /users/:userNo/resign`            | `users.manage` | 200 `{ item }`                         | `org.user.resign` · diff `RESIGN_AUDIT_FIELDS` · meta             |
| `PATCH /users/:userNo/resign-date`      | `users.manage` | `{ item }`                             | `org.user.resignDate.update` · diff · meta                        |
| `POST /users/:userNo/rehire`            | `users.manage` | 200 `{ item }`                         | `org.user.rehire` · diff `REHIRE_AUDIT_FIELDS` · meta             |
| `POST /users/:userNo/password-reset`    | `users.manage` | 200 `{ temporaryPassword }`            | `org.user.password.reset` · meta `{ revokedCount }`               |
| `POST /users/:userNo/unlock`            | `users.manage` | 200 `{}`                               | `org.user.unlock` · meta `{ lockUntil, loginFailCount }`(이전 값) |

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/users/users.body.test.ts`:

```ts
import { BusinessError, CommonErrorCodes, type ValidationIssue } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { usersConfig } from '../test-support/accounts.js'
import {
  UserCreateBodyPipe,
  UserReauthBodyPipe,
  UserResignBodyPipe,
  UserUpdateBodyPipe,
} from './users.body.js'

function issues(run: () => unknown): ValidationIssue[] {
  try {
    run()
  } catch (error) {
    if (error instanceof BusinessError) {
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      return (error.details as { issues: ValidationIssue[] }).issues
    }
    throw error
  }
  throw new Error('던지지 않았다')
}

const CURRENT_PASSWORD_ISSUE = [
  expect.objectContaining({
    path: ['currentPassword'],
    message: ACCOUNT_MESSAGES.currentPasswordRequired,
  }),
]

describe('사용자 본문 파이프', () => {
  it('만들기 — 아이디 · 이름 앞뒤 공백을 뗀다(Review Focus 2) · roleNo 는 bigint · 날짜는 달력 날짜', () => {
    const pipe = new UserCreateBodyPipe(usersConfig())
    expect(
      pipe.transform({ userId: ' Kim ', userName: ' 김사원 ', roleNo: 2n, teamNo: null }),
    ).toEqual({ userId: 'Kim', userName: '김사원', roleNo: 2n, teamNo: null })
    expect(
      issues(() => pipe.transform({ userId: 'a', userName: 'a', roleNo: 2, teamNo: null })).map(
        (issue) => issue.path,
      ),
    ).toEqual([['roleNo']])
    expect(
      issues(() =>
        pipe.transform({
          userId: 'a',
          userName: 'a',
          roleNo: 2n,
          teamNo: null,
          joinDate: '2026-02-30',
        }),
      ),
    ).toEqual([{ path: ['joinDate'], code: 'custom', message: '없는 날짜입니다.' }])
  })

  it('🔴 재인증 켬 — 빠짐 · 빈 값은 currentPassword 칸 오류, 본문이 아예 없어도(Review Focus 3)', () => {
    const create = new UserCreateBodyPipe(usersConfig(true))
    expect(
      issues(() => create.transform({ userId: 'a', userName: 'a', roleNo: 2n, teamNo: null })),
    ).toEqual(CURRENT_PASSWORD_ISSUE)
    const bare = new UserReauthBodyPipe(usersConfig(true))
    expect(issues(() => bare.transform(undefined))).toEqual(CURRENT_PASSWORD_ISSUE)
    expect(issues(() => bare.transform({ currentPassword: '' }))).toEqual(CURRENT_PASSWORD_ISSUE)
    expect(bare.transform({ currentPassword: 'pw' })).toEqual({ currentPassword: 'pw' })
  })

  it('재인증 끔 — 보낸 currentPassword 는 버린다 · 본문 없는 쓰기는 {}', () => {
    const resign = new UserResignBodyPipe(usersConfig(false))
    expect(
      resign.transform({ resignDate: '2026-10-31', currentPassword: 'x' }).currentPassword,
    ).toBeUndefined()
    const bare = new UserReauthBodyPipe(usersConfig(false))
    expect(bare.transform(undefined)).toEqual({})
    expect(bare.transform({ currentPassword: 'x' }).currentPassword).toBeUndefined()
  })

  it('수정 — revision 이 빠지면 revision 칸 오류', () => {
    const pipe = new UserUpdateBodyPipe(usersConfig())
    expect(issues(() => pipe.transform({ userName: 'a' })).map((issue) => issue.path)).toEqual([
      ['revision'],
    ])
  })
})
```

`packages/admin-server/src/users/users.module.test.ts`:

```ts
import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { AdminRolesModule } from '../roles/roles.module.js'
import { TEST_CATALOG } from '../test-support/accounts.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { AdminUsersModule } from './users.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = { 'users.read': 'org.users:read', 'users.manage': 'org.users:write' }

const apps: { close(): Promise<void> }[] = []

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
})

async function boot(imports: ModuleMetadata['imports'], options: Partial<AdminServerOptions> = {}) {
  const app = await createHttpApp({
    imports: [
      AdminServerModule.forRoot({
        db: unreachable,
        auth: { jwtSecret: TEST_JWT_SECRET },
        permissions: PERMISSIONS,
        permissionCatalog: TEST_CATALOG,
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminUsersModule 배선', () => {
  it('뜨면 열 라우트가 /admin/users 아래에 있고 쿠키 없이는 401(가드가 DB 에 닿기 전에 끝난다)', async () => {
    const app = await boot([AdminAuthModule, AdminUsersModule])
    const server = app.getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/users'],
      ['get', '/admin/users/1'],
      ['get', '/admin/users/1/employment-periods'],
      ['post', '/admin/users'],
      ['patch', '/admin/users/1'],
      ['post', '/admin/users/1/resign'],
      ['patch', '/admin/users/1/resign-date'],
      ['post', '/admin/users/1/rehire'],
      ['post', '/admin/users/1/password-reset'],
      ['post', '/admin/users/1/unlock'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminUsersModule])).rejects.toThrow(
      'AdminUsersModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 permissionCatalog 가 없으면 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminUsersModule], { permissionCatalog: undefined }),
    ).rejects.toThrow('AdminUsersModule 은 permissionCatalog 옵션이 있어야 한다')
  })

  it('🔴 timeZone 이 IANA 이름이 아니면 멈춘다(B15 — 오프셋 표기 · 오타)', async () => {
    for (const timeZone of ['+09:00', 'Asia/Seoull']) {
      await expect(
        boot([AdminAuthModule, AdminUsersModule], { timeZone }),
        timeZone,
      ).rejects.toThrow('timeZone 은 IANA 시간대 이름이어야 한다')
    }
  })

  it('🔴 사용자 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminUsersModule], { permissions: {} })).rejects.toThrow(
      'AdminUsersModule 의 권한 슬롯이 이어지지 않았다: users.read, users.manage',
    )
  })

  it('역할 · 감사 모듈과 함께 뜬다 — 사용자 @Audit 액션이 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminRolesModule, AdminUsersModule], {
        permissions: {
          ...PERMISSIONS,
          'roles.read': 'org.roles:read',
          'roles.manage': 'org.roles:write',
          'auditLogs.read': 'setting.auditLog:read',
        },
      }),
    ).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test users.body users.module`
Expected: FAIL — `Failed to resolve import "./users.body.js"` · `"./users.module.js"`.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/users/users.body.ts`:

```ts
import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import {
  adminUserCreateSchema,
  adminUserRehireSchema,
  adminUserResignDateSchema,
  adminUserResignSchema,
  adminUserUpdateSchema,
} from '@ssworks/admin-shared'
import { z } from 'zod'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import { currentPasswordField } from '../accounts/reauth-body.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_ACCOUNTS_CONFIG } from '../tokens.js'
import type {
  AdminUserCreateBody,
  AdminUserReauthBody,
  AdminUserRehireBody,
  AdminUserResignBody,
  AdminUserResignDateBody,
  AdminUserUpdateBody,
} from './users.service.js'

// 정본: hangang-home apps/api/src/modules/users/users.dto.ts(재인증 currentPassword) + admin-shared 사용자 스키마(2d 스펙 §4-1)
// 바꾼 점: 스키마가 런타임 옵션(reauth)에 달려 주입형 파이프로 만든다(2d-1 roles.body.ts 와 같은 방식, B5). `@Body(클래스)` 로
//   넘기면 Nest 가 모듈 안에서 만든다 — 모듈 provider 에 적지 않는다. 본문 없는 쓰기(초기화 · 잠금 해제)는 reauth 일 때만
//   본문을 검증한다 — 꺼져 있으면 무엇이 와도 {}.
// 🔴 Express 는 본문 없는 요청의 body 를 undefined 로 둔다 — {} 로 보고 검증해야 빠진 currentPassword 가 그 칸의 오류가
//    된다(루트 경로 오류면 admin-ui 재인증 창이 띄우지 못한다 — 3b D8).

@Injectable()
export class UserCreateBodyPipe implements PipeTransform<unknown, AdminUserCreateBody> {
  private readonly pipe: ZodValidationPipe<AdminUserCreateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserCreateSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserCreateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class UserUpdateBodyPipe implements PipeTransform<unknown, AdminUserUpdateBody> {
  private readonly pipe: ZodValidationPipe<AdminUserUpdateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserUpdateSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserUpdateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class UserResignBodyPipe implements PipeTransform<unknown, AdminUserResignBody> {
  private readonly pipe: ZodValidationPipe<AdminUserResignBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserResignSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserResignBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class UserResignDateBodyPipe implements PipeTransform<unknown, AdminUserResignDateBody> {
  private readonly pipe: ZodValidationPipe<AdminUserResignDateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserResignDateSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserResignDateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class UserRehireBodyPipe implements PipeTransform<unknown, AdminUserRehireBody> {
  private readonly pipe: ZodValidationPipe<AdminUserRehireBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserRehireSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserRehireBody {
    return this.pipe.transform(value)
  }
}

/** 초기화 · 잠금 해제 — 본문은 재인증 칸뿐이다 */
@Injectable()
export class UserReauthBodyPipe implements PipeTransform<unknown, AdminUserReauthBody> {
  private readonly pipe: ZodValidationPipe<AdminUserReauthBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      z.object({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserReauthBody {
    return this.pipe.transform(value ?? {})
  }
}
```

`packages/admin-server/src/users/users.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { CoreAuditActions, CoreAuditTargets } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditDiff, attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import { REHIRE_AUDIT_FIELDS, RESIGN_AUDIT_FIELDS, USER_AUDIT_FIELDS } from './user-view.js'
import {
  UserCreateBodyPipe,
  UserReauthBodyPipe,
  UserRehireBodyPipe,
  UserResignBodyPipe,
  UserResignDateBodyPipe,
  UserUpdateBodyPipe,
} from './users.body.js'
import { adminUserListQuerySchema } from './users.query.js'
import type { AdminUserListQuery } from './users.query.js'
import { AdminUsersService } from './users.service.js'
import type {
  AdminUserCreateBody,
  AdminUserReauthBody,
  AdminUserRehireBody,
  AdminUserResignBody,
  AdminUserResignDateBody,
  AdminUserUpdateBody,
} from './users.service.js'

// 정본: hangang-home apps/api/src/modules/users/users.controller.ts(라우트 · @Audit · 퇴사 · 재입사 · 퇴사일 분리) +
//       ssworks-gise-home 계정 컨트롤러(초기화 · 잠금 해제 · 생성 응답의 임시 비밀번호)
// 바꾼 점: 권한은 슬롯(2c ① P1). 응답은 만들기 201 { item, temporaryPassword } · 수정 · 퇴사 · 퇴사일 · 재입사 { item } ·
//   초기화 { temporaryPassword } · 잠금 해제 {}(§2-2 공통 10). 상태를 바꾸는 POST 는 200 이다(생성이 아니다).
// 🔴 임시 비밀번호는 응답에만 — attachAuditMeta · attachAuditDiff 에 넘기지 않는다(공통 11). 넘겨도 감사 소독이 가리지만
//    이것이 1차 방어선이다.

@Controller('users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /** 서버 페이징 · 팀(하위 팀) · 상태 · 검색어 — 3d TeamUserList 어댑터가 부른다 */
  @RequirePermissionSlot('users.read')
  @Get()
  list(@Query(new ZodValidationPipe(adminUserListQuerySchema)) query: AdminUserListQuery) {
    return this.users.list(query)
  }

  @RequirePermissionSlot('users.read')
  @Get(':userNo/employment-periods')
  periods(@Param('userNo', ParseBigIntPipe) userNo: bigint) {
    return this.users.periods(userNo)
  }

  @RequirePermissionSlot('users.read')
  @Get(':userNo')
  async findOne(@Param('userNo', ParseBigIntPipe) userNo: bigint) {
    return { item: await this.users.findOne(userNo) }
  }

  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_CREATE, targetType: CoreAuditTargets.USER })
  @Post()
  async create(
    @Body(UserCreateBodyPipe) body: AdminUserCreateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, temporaryPassword } = await this.users.create(body, admin)
    attachAuditTarget(req, item.userNo)
    attachAuditDiff(req, null, item, USER_AUDIT_FIELDS)
    return { item, temporaryPassword }
  }

  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_UPDATE, targetType: CoreAuditTargets.USER })
  @Patch(':userNo')
  async update(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserUpdateBodyPipe) body: AdminUserUpdateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before } = await this.users.update(userNo, body, admin)
    attachAuditDiff(req, before, item, USER_AUDIT_FIELDS)
    return { item }
  }

  /** 퇴사일 당일까지 근무한다 — 지금 막으려면 어제 날짜(⑤ Z1) */
  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_RESIGN, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post(':userNo/resign')
  async resign(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserResignBodyPipe) body: AdminUserResignBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, meta } = await this.users.resign(userNo, body, admin)
    attachAuditDiff(req, before, item, RESIGN_AUDIT_FIELDS)
    attachAuditMeta(req, meta)
    return { item }
  }

  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_RESIGN_DATE_UPDATE, targetType: CoreAuditTargets.USER })
  @Patch(':userNo/resign-date')
  async correctResignDate(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserResignDateBodyPipe) body: AdminUserResignDateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, meta } = await this.users.correctResignDate(userNo, body, admin)
    attachAuditDiff(req, before, item, RESIGN_AUDIT_FIELDS)
    attachAuditMeta(req, meta)
    return { item }
  }

  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_REHIRE, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post(':userNo/rehire')
  async rehire(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserRehireBodyPipe) body: AdminUserRehireBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, meta } = await this.users.rehire(userNo, body, admin)
    attachAuditDiff(req, before, item, REHIRE_AUDIT_FIELDS)
    attachAuditMeta(req, meta)
    return { item }
  }

  /** 🔴 임시 비밀번호는 응답에만 — 감사 meta 는 끊은 세션 수뿐 */
  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_PASSWORD_RESET, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post(':userNo/password-reset')
  async resetPassword(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserReauthBodyPipe) body: AdminUserReauthBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { temporaryPassword, revokedCount } = await this.users.resetPassword(userNo, body, admin)
    attachAuditMeta(req, { revokedCount })
    return { temporaryPassword }
  }

  /** 잠기지 않아도 200(B16). 감사 meta 는 풀기 전 값 */
  @RequirePermissionSlot('users.manage')
  @Audit({ action: CoreAuditActions.USER_UNLOCK, targetType: CoreAuditTargets.USER })
  @HttpCode(200)
  @Post(':userNo/unlock')
  async unlock(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @Body(UserReauthBodyPipe) body: AdminUserReauthBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    attachAuditMeta(req, await this.users.unlock(userNo, body, admin))
    return {}
  }
}
```

`packages/admin-server/src/users/users.module.ts`:

```ts
import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { resolveUsersConfig } from '../accounts/options.js'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import { AdminSessionStore } from '../auth/session.store.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_ACCOUNTS_CONFIG, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminUsersController } from './users.controller.js'
import { AdminUsersService } from './users.service.js'

// 정본: hangang-home apps/api/src/modules/users/users.module.ts
// 바꾼 점: 패키지 기능 모듈(2d 스펙 §4-4) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다.
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 AdminSessionStore 를 자기 provider 로 둔다(퇴사 · 초기화의 세션 폐기 — 2c R2 와 같은 이유). 해석된 설정(카탈로그 · reauth ·
//    기준 시간대)은 이 모듈의 provider 다 — 카탈로그 없음 · 슬롯 키 오타 · 잘못된 timeZone 은 그 팩토리가 기동에서 멈춘다
//    (B12 · B15).

@Module({
  controllers: [AdminUsersController],
  providers: [
    {
      provide: ADMIN_ACCOUNTS_CONFIG,
      useFactory: (options: AdminServerOptions) => resolveUsersConfig(options, 'AdminUsersModule'),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminSessionStore,
    AdminUsersService,
  ],
})
export class AdminUsersModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminUsersModule')
    assertPermissionSlots(
      this.options.permissions,
      ['users.read', 'users.manage'],
      'AdminUsersModule',
    )
  }
}
```

`packages/admin-server/src/admin-server.module.ts` — import 에 `import { AdminUsersModule } from './users/users.module.js'` 를 더하고 `ADMIN_ROUTE_MODULES` 끝에 `AdminUsersModule,` 를 더한다.

`packages/admin-server/src/index.ts` 끝에 더한다:

```ts
// 사용자 · 계정(PR 2d-2)
export { AdminUsersModule } from './users/users.module.js'
```

`packages/admin-server/src/test-support/admin-app.ts`:

① import 에 `import { AdminUsersModule } from '../users/users.module.js'` 를 더한다.

② `AdminAppOptions` 에 더한다:

```ts
  /** 사용자 날짜의 기준 시간대. 기본 Asia/Seoul */
  timeZone?: string
```

③ `forRoot({ … })` 의 `reauth: options.reauth ?? false,` 다음에 `...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),` 를, `imports` 의 `AdminRolesModule,` 다음에 `AdminUsersModule,` 를 더한다. 머리 주석의 `(2c · 2d-1 역할)` 을 `(2c · 2d 역할 · 사용자)` 로.

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test users.body users.module roles.module`
Expected: PASS.

Run: `pnpm --filter @ssworks/admin-server test` · `pnpm --filter @ssworks/admin-server test:db roles sessions audit`
Expected: PASS — `bootAdminApp` 을 쓰는 2c · 2d-1 HTTP 테스트가 사용자 모듈과 함께 그대로 뜬다(`TEST_PERMISSIONS` 에 사용자 슬롯이 있다 — Task 4).

Run: `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint` · `pnpm --filter @ssworks/admin-server build`
Expected: 오류 없음. `runner-graph.test.ts` 는 그대로 PASS(러너는 사용자 모듈을 끌어오지 않는다).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/users packages/admin-server/src/admin-server.module.ts packages/admin-server/src/index.ts packages/admin-server/src/test-support/admin-app.ts
git commit -m "feat(admin-server): AdminUsersModule — 열 라우트 · 본문 파이프 · 감사 · 기동 검사" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: 실 MariaDB HTTP 계약 — 봉투 · 로그인 흐름 · 재인증 일곱 라우트 · 감사 비밀

**Files:**

- Create: `packages/admin-server/src/users/users.http.db.test.ts`

**Interfaces:**

- Consumes: `bootAdminApp(db, { reauth })`(Task 11), admin-shared `stringifyJSON` · `parseJSON` · `adminUserSchema` · `adminUserCreateResultSchema` · `adminEmploymentPeriodSchema` · `errorRespSchema`, 2b 라우트 `POST /admin/auth/login` · `GET /admin/auth/me` · `PATCH /admin/auth/password`, `AUTH_MESSAGES.resigned`(2b `auth/errors.ts`).

이 Task 는 구현을 더하지 않는다 — Task 7~11 이 만든 것을 HTTP 계약으로 잰다. 실패하는 단언이 있으면 그 Task 의 코드를 고친다(테스트를 맞추지 않는다).

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/users/users.http.db.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminEmploymentPeriodSchema,
  adminUserCreateResultSchema,
  adminUserSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { addDays, todayIn } from '../accounts/calendar.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { AUTH_MESSAGES } from '../auth/errors.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { addToTeam, seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { seedClosure, seedPeriod } from '../test-support/users.js'

// 실 MariaDB 의 사용자 HTTP 계약(2d 스펙 §9-3 [2]) — 쓰는 쪽 사용자 화면(B)과 3c TemporaryPasswordDialog · 3d TeamUserList
// 어댑터가 기대는 모양. 🔴 bigint 가 든 본문은 stringifyJSON 으로 보낸다(supertest 의 .send(object) 는 bigint 에서 던진다).

const TZ = 'Asia/Seoul'
const day = (offset: number) => addDays(todayIn(TZ), offset)

let t: TestDatabase
let app: NestExpressApplication
let guarded: NestExpressApplication
let bossRole: bigint
let staffRole: bigint
let boss: SeededUser
let manager: SeededUser
let member: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  bossRole = await seedRole(t.db, { roleName: '최고 관리자', permissions: ['*'] })
  const managerRole = await seedRole(t.db, {
    roleName: '사용자 관리자',
    permissions: ['org.users:read', 'org.users:write', 'org.roles:read'],
  })
  const memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  staffRole = await seedRole(t.db, { roleName: '직원', permissions: ['org.users:read'] })
  boss = await seedUser(t.db, { roleNo: bossRole, userId: 'boss' })
  manager = await seedUser(t.db, { roleNo: managerRole, userId: 'user-manager' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'member' })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  guarded = await bootAdminApp(connection, { reauth: true })
})

afterAll(async () => {
  await app?.close()
  await guarded?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>
type Pending = ReturnType<Agent['post']>

// AdminUserView 의 키 전부(admin-shared adminUserSchema)
const USER_KEYS = [
  'createAt',
  'isPasswordChangeRequired',
  'joinDate',
  'lockUntil',
  'resignAt',
  'resignDate',
  'revision',
  'roleName',
  'roleNo',
  'teamName',
  'teamNo',
  'updateAt',
  'userId',
  'userName',
  'userNo',
]

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

/** 성공 봉투 { success: true, data } 를 풀고 data 의 키 집합이 정확히 keys 인지 잰다 */
function envelope(response: Response, keys: string[]): Record<string, unknown> {
  const body = parseJSON<{ success: boolean; data: Record<string, unknown> }>(response.text)
  expect(body.success).toBe(true)
  expect(Object.keys(body.data).sort()).toEqual([...keys].sort())
  return body.data
}

function expectItem(response: Response) {
  const item = envelope(response, ['item']).item as Record<string, unknown>
  expect(Object.keys(item).sort()).toEqual(USER_KEYS)
  return adminUserSchema.parse(item)
}

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

const issuePaths = (details: unknown) =>
  (details as { issues: { path: unknown[] }[] }).issues.map((issue) => issue.path)

function sendJson(pending: Pending, body: unknown): Pending {
  return pending.set('Content-Type', 'application/json').send(stringifyJSON(body))
}

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

function login(userId: string, password: string) {
  return request(app.getHttpServer()).post('/admin/auth/login').send({ userId, password })
}

async function createUser(agent: Agent, body: Record<string, unknown>) {
  const response = await sendJson(agent.post('/admin/users'), body).expect(201)
  return adminUserCreateResultSchema.parse(data(response))
}

/** 활성 구간 하나를 가진 직원 */
async function staff(userId: string): Promise<SeededUser> {
  const user = await seedUser(t.db, { roleNo: staffRole, userId })
  await seedPeriod(t.db, { userNo: user.userNo, joinDate: '2025-01-02' })
  return user
}

async function failCount(userNo: bigint): Promise<number> {
  const row = await t.db
    .selectFrom('users')
    .select('loginFailCount')
    .where('userNo', '=', userNo)
    .executeTakeFirstOrThrow()
  return row.loginFailCount
}

describe('목록 · 단건 · 이력', () => {
  it('봉투 키가 정확하다 · 행은 adminUserSchema · users.read 없으면 403', async () => {
    const agent = await signIn(boss)
    const response = await agent
      .get('/admin/users')
      .query({ 'filter[keyword]': 'boss' })
      .expect(200)
    const body = envelope(response, ['items', 'itemsPerPage', 'page', 'total'])
    for (const item of body.items as Record<string, unknown>[]) {
      expect(Object.keys(item).sort()).toEqual(USER_KEYS)
    }
    const list = z
      .object({ items: z.array(adminUserSchema), total: z.bigint() })
      .parse(data(response))
    expect(list.items.map((item) => item.userId)).toEqual(['boss'])
    expect(list.total).toBe(1n)
    expectError(
      await (await signIn(member)).get('/admin/users'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it("🔴 filter[recursive]=false 는 거짓(하위 팀 제외) · '0' 은 400 issues [filter, recursive](3d TeamUserList)", async () => {
    const parent = await seedTeam(t.db, 'http-parent')
    const child = await seedTeam(t.db, 'http-child')
    await seedClosure(t.db, parent, child, 1)
    const direct = await seedUser(t.db, { roleNo: staffRole, userId: 'http-direct' })
    const nested = await seedUser(t.db, { roleNo: staffRole, userId: 'http-nested' })
    await addToTeam(t.db, parent, direct.userNo)
    await addToTeam(t.db, child, nested.userNo)
    const agent = await signIn(boss)
    const ids = async (recursive: string) =>
      z
        .object({ items: z.array(adminUserSchema) })
        .parse(
          data(
            await agent
              .get('/admin/users')
              .query({
                'filter[teamNo]': String(parent),
                'filter[recursive]': recursive,
                sortBy: 'userId',
                sortOrder: 'asc',
              })
              .expect(200),
          ),
        )
        .items.map((item) => item.userId)
    expect(await ids('false')).toEqual(['http-direct'])
    expect(await ids('true')).toEqual(['http-direct', 'http-nested'])
    const bad = expectError(
      await agent.get('/admin/users').query({ 'filter[recursive]': '0' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(bad.details)).toEqual([['filter', 'recursive']])
  })

  it('단건 { item } · 이력 { items } · 없는 사용자 404 ERR_NO_USER', async () => {
    const user = await staff('http-one')
    const agent = await signIn(boss)
    expect(expectItem(await agent.get(`/admin/users/${user.userNo}`).expect(200)).userId).toBe(
      'http-one',
    )
    const periods = await agent.get(`/admin/users/${user.userNo}/employment-periods`).expect(200)
    envelope(periods, ['items'])
    const parsed = z.object({ items: z.array(adminEmploymentPeriodSchema) }).parse(data(periods))
    expect(parsed.items.map((period) => period.joinDate)).toEqual(['2025-01-02'])
    expectError(
      await agent.get('/admin/users/999999'),
      404,
      CommonErrorCodes.ERR_NO_USER,
      ACCOUNT_MESSAGES.noUser,
    )
    expectError(
      await agent.get('/admin/users/999999/employment-periods'),
      404,
      CommonErrorCodes.ERR_NO_USER,
    )
  })
})

describe('만들기 → 임시 비밀번호 로그인 → 강제 변경', () => {
  it('🔴 201 { item, temporaryPassword } · 그 값으로 로그인하면 /me 가 강제 변경 · 바꾸면 역할 권한', async () => {
    const agent = await signIn(boss)
    const before = todayIn(TZ)
    const response = await sendJson(agent.post('/admin/users'), {
      userId: ' http-new ',
      userName: ' 새 직원 ',
      roleNo: staffRole,
      teamNo: null,
    }).expect(201)
    const body = envelope(response, ['item', 'temporaryPassword'])
    expect(Object.keys(body.item as object).sort()).toEqual(USER_KEYS)
    const created = adminUserCreateResultSchema.parse(data(response))
    expect(created.item).toMatchObject({
      userId: 'http-new',
      userName: '새 직원',
      isPasswordChangeRequired: true,
      revision: 0,
    })
    expect([before, todayIn(TZ)]).toContain(created.item.joinDate)

    const fresh = request.agent(app.getHttpServer())
    await fresh
      .post('/admin/auth/login')
      .send({ userId: 'http-new', password: created.temporaryPassword })
      .expect(200)
    const me = await fresh.get('/admin/auth/me').expect(200)
    expect(me.body.data).toMatchObject({ isPasswordChangeRequired: true, permissions: [] })
    await fresh
      .patch('/admin/auth/password')
      .send({ currentPassword: created.temporaryPassword, newPassword: 'brand-new-pass-1' })
      .expect(200)
    expect((await fresh.get('/admin/auth/me').expect(200)).body.data).toMatchObject({
      isPasswordChangeRequired: false,
      permissions: ['org.users:read'],
    })
  })

  it('🔴 아이디 중복(앞뒤 공백 · 대소문자) 400 userId · 없는 역할 400 roleNo · 넓은 역할 403 details.outside', async () => {
    const agent = await signIn(boss)
    await createUser(agent, { userId: 'http-dup', userName: 'a', roleNo: staffRole, teamNo: null })
    for (const userId of [' HTTP-DUP ', 'http-dup']) {
      const error = expectError(
        await sendJson(agent.post('/admin/users'), {
          userId,
          userName: 'b',
          roleNo: staffRole,
          teamNo: null,
        }),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(error.details, userId).toEqual({
        issues: [{ path: ['userId'], code: 'custom', message: ACCOUNT_MESSAGES.duplicateUserId }],
      })
    }
    const noRole = expectError(
      await sendJson(agent.post('/admin/users'), {
        userId: 'http-norole',
        userName: 'a',
        roleNo: 999_999n,
        teamNo: null,
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(noRole.details).toEqual({
      issues: [{ path: ['roleNo'], code: 'custom', message: ACCOUNT_MESSAGES.noRole }],
    })
    const wide = expectError(
      await sendJson((await signIn(manager)).post('/admin/users'), {
        userId: 'http-wide',
        userName: 'a',
        roleNo: bossRole,
        teamNo: null,
      }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.higherRoleToGrant,
    )
    expect(wide.details).toEqual({ outside: ['*'] })
  })
})

describe('수정', () => {
  it('🔴 revision 이 빠지면 400 issues revision · 다르면 409 · 맞으면 { item } revision + 1', async () => {
    const agent = await signIn(boss)
    const { item } = await createUser(agent, {
      userId: 'http-edit',
      userName: '편집',
      roleNo: staffRole,
      teamNo: null,
    })
    const path = `/admin/users/${item.userNo}`
    const missing = expectError(
      await sendJson(agent.patch(path), { userName: 'x' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(missing.details)).toEqual([['revision']])
    expectError(
      await sendJson(agent.patch(path), { revision: 5, userName: 'x' }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      ACCOUNT_MESSAGES.userRevisionMismatch,
    )
    const updated = expectItem(
      await sendJson(agent.patch(path), { revision: 0, userName: '바뀐 편집' }).expect(200),
    )
    expect(updated).toMatchObject({ userName: '바뀐 편집', revision: 1 })
  })
})

describe('퇴사 · 퇴사일 · 재입사', () => {
  it('🔴 어제로 퇴사 — 그 사용자의 다음 요청은 401(세션이 같은 트랜잭션에서 끊겼다 — §14 R6-1) · 로그인은 403 ERR_RESIGNED_USER', async () => {
    const target = await staff('http-leaver')
    const victim = await signIn(target)
    const agent = await signIn(boss)
    expectItem(
      await sendJson(agent.post(`/admin/users/${target.userNo}/resign`), {
        resignDate: day(-1),
      }).expect(200),
    )
    expectError(await victim.get('/admin/auth/me'), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
    expectError(
      await login('http-leaver', target.password),
      403,
      CommonErrorCodes.ERR_RESIGNED_USER,
      AUTH_MESSAGES.resigned,
    )
  })

  it('미래로 퇴사 — 요청은 그대로, 효력 시각을 DB 에서 과거로 옮기면 다음 요청 403 ERR_RESIGNED_USER', async () => {
    const target = await staff('http-later')
    const victim = await signIn(target)
    const agent = await signIn(boss)
    await sendJson(agent.post(`/admin/users/${target.userNo}/resign`), {
      resignDate: day(30),
    }).expect(200)
    await victim.get('/admin/auth/me').expect(200)
    await t.db
      .updateTable('users')
      .set({ resignAt: new Date(Date.now() - 1000) })
      .where('userNo', '=', target.userNo)
      .execute()
    expectError(await victim.get('/admin/auth/me'), 403, CommonErrorCodes.ERR_RESIGNED_USER)
  })

  it('본인 퇴사 403 selfAccount · 넓은 계정 403 details.outside', async () => {
    const agent = await signIn(manager)
    expectError(
      await sendJson(agent.post(`/admin/users/${manager.userNo}/resign`), { resignDate: day(1) }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.selfAccount,
    )
    const wide = expectError(
      await sendJson(agent.post(`/admin/users/${boss.userNo}/resign`), { resignDate: day(1) }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.higherAccount,
    )
    expect(wide.details).toEqual({ outside: ['*'] })
  })

  it('퇴사일 정정 · 같은 날 재입사 400 · 다음 날 재입사 { item } — 재입사 뒤 로그인된다', async () => {
    const target = await staff('http-return')
    const agent = await signIn(boss)
    await sendJson(agent.post(`/admin/users/${target.userNo}/resign`), {
      resignDate: day(-2),
    }).expect(200)
    const fixed = expectItem(
      await sendJson(agent.patch(`/admin/users/${target.userNo}/resign-date`), {
        resignDate: day(-1),
      }).expect(200),
    )
    expect(fixed.resignDate).toBe(day(-1))
    const same = expectError(
      await sendJson(agent.post(`/admin/users/${target.userNo}/rehire`), { joinDate: day(-1) }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(same.details)).toEqual([['joinDate']])
    const back = expectItem(
      await sendJson(agent.post(`/admin/users/${target.userNo}/rehire`), {
        joinDate: day(0),
      }).expect(200),
    )
    expect(back).toMatchObject({ joinDate: day(0), resignDate: null, resignAt: null })
    await login('http-return', target.password).expect(200)
  })
})

describe('초기화 · 잠금 해제', () => {
  it('🔴 초기화 { temporaryPassword } — 그 값으로 로그인된다 · 대상의 다른 세션은 끊긴다', async () => {
    const target = await staff('http-reset')
    const victim = await signIn(target)
    const agent = await signIn(boss)
    const response = await agent.post(`/admin/users/${target.userNo}/password-reset`).expect(200)
    const body = envelope(response, ['temporaryPassword'])
    expectError(await victim.get('/admin/auth/me'), 401, CommonErrorCodes.ERR_INVALID_TOKEN)
    await login('http-reset', String(body.temporaryPassword)).expect(200)
  })

  it('잠금 해제 {} — 잠긴 계정이 맞은 비밀번호로 로그인된다 · 잠기지 않아도 200(B16)', async () => {
    const target = await seedUser(t.db, {
      roleNo: staffRole,
      userId: 'http-locked',
      loginFailCount: 5,
      lockUntil: new Date(Date.now() + 600_000),
    })
    expect((await login('http-locked', target.password)).status).toBe(401)
    const agent = await signIn(boss)
    expect((await agent.post(`/admin/users/${target.userNo}/unlock`).expect(200)).body).toEqual({
      success: true,
      data: {},
    })
    await login('http-locked', target.password).expect(200)
    await agent.post(`/admin/users/${target.userNo}/unlock`).expect(200)
  })
})

describe('재인증', () => {
  // 틀린 재인증 한 번은 실패 카운터에 센다(2b B2) — 단언이 먼저 실패해도 다음 테스트가 잠금에 걸리지 않게 되돌린다.
  afterEach(async () => {
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 0 })
      .where('userNo', '=', boss.userNo)
      .execute()
  })

  it('🔴 켬 — 쓰기 일곱 라우트 모두 빠짐 · 빈 값 400 currentPassword, 본문 없는 초기화 · 잠금 해제도(Review Focus 3) · 대조 없음', async () => {
    const agent = await signIn(boss, guarded)
    const { item } = await createUser(agent, {
      userId: 'reauth-target',
      userName: '재인증',
      roleNo: staffRole,
      teamNo: null,
      joinDate: day(-10),
      currentPassword: boss.password,
    })
    const base = `/admin/users/${item.userNo}`
    const routes: ['post' | 'patch', string, Record<string, unknown>][] = [
      [
        'post',
        '/admin/users',
        { userId: 'reauth-x', userName: 'a', roleNo: staffRole, teamNo: null },
      ],
      ['patch', base, { revision: 0, userName: 'x' }],
      ['post', `${base}/resign`, { resignDate: day(30) }],
      ['patch', `${base}/resign-date`, { resignDate: day(31) }],
      ['post', `${base}/rehire`, { joinDate: day(40) }],
      ['post', `${base}/password-reset`, {}],
      ['post', `${base}/unlock`, {}],
    ]
    for (const [method, path, body] of routes) {
      for (const extra of [{}, { currentPassword: '' }]) {
        const pending = method === 'post' ? agent.post(path) : agent.patch(path)
        const error = expectError(
          await sendJson(pending, { ...body, ...extra }),
          400,
          CommonErrorCodes.ERR_COMMON_VALIDATION,
        )
        expect(error.details, `${method} ${path}`).toEqual({
          issues: [
            expect.objectContaining({
              path: ['currentPassword'],
              message: ACCOUNT_MESSAGES.currentPasswordRequired,
            }),
          ],
        })
      }
    }
    for (const path of [`${base}/password-reset`, `${base}/unlock`]) {
      const error = expectError(await agent.post(path), 400, CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect(issuePaths(error.details), path).toEqual([['currentPassword']])
    }
    expect(await failCount(boss.userNo)).toBe(0)
    const row = await t.db
      .selectFrom('users')
      .select(['revision', 'resignAt'])
      .where('userNo', '=', item.userNo)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ revision: 0, resignAt: null })
  })

  it('켬 — 틀리면 403 ERR_REAUTH_REQUIRED · 맞으면 된다', async () => {
    const agent = await signIn(boss, guarded)
    const { item } = await createUser(agent, {
      userId: 'reauth-ok',
      userName: 'a',
      roleNo: staffRole,
      teamNo: null,
      currentPassword: boss.password,
    })
    expectError(
      await sendJson(agent.post(`/admin/users/${item.userNo}/unlock`), {
        currentPassword: 'wrong',
      }),
      403,
      CommonErrorCodes.ERR_REAUTH_REQUIRED,
    )
    await sendJson(agent.post(`/admin/users/${item.userNo}/password-reset`), {
      currentPassword: boss.password,
    }).expect(200)
  })

  it('끔 — 보낸 currentPassword 는 버린다(대조 없음 · 카운터 0)', async () => {
    const agent = await signIn(boss)
    const { item } = await createUser(agent, {
      userId: 'reauth-off',
      userName: 'a',
      roleNo: staffRole,
      teamNo: null,
      currentPassword: 'anything',
    })
    await sendJson(agent.post(`/admin/users/${item.userNo}/unlock`), {
      currentPassword: '',
    }).expect(200)
    expect(await failCount(boss.userNo)).toBe(0)
  })
})

describe('감사', () => {
  async function auditRows(action: string, targetRefNo: bigint) {
    return t.db
      .selectFrom('auditLogs')
      .selectAll()
      .where('action', '=', action)
      .where('targetRefNo', '=', targetRefNo)
      .orderBy('logNo', 'asc')
      .execute()
  }

  it('쓰기 일곱이 행으로 — 대상 user · diff · meta', async () => {
    const agent = await signIn(boss)
    const { item } = await createUser(agent, {
      userId: 'audit-user',
      userName: '감사',
      roleNo: staffRole,
      teamNo: null,
      joinDate: day(-10),
    })
    const base = `/admin/users/${item.userNo}`
    await sendJson(agent.patch(base), { revision: 0, userName: '감사2' }).expect(200)
    await sendJson(agent.post(`${base}/resign`), { resignDate: day(-1), reason: '이직' }).expect(
      200,
    )
    await sendJson(agent.patch(`${base}/resign-date`), { resignDate: day(-2) }).expect(200)
    await sendJson(agent.post(`${base}/rehire`), { joinDate: day(0) }).expect(200)
    await agent.post(`${base}/password-reset`).expect(200)
    await agent.post(`${base}/unlock`).expect(200)

    const [created] = await auditRows(CoreAuditActions.USER_CREATE, item.userNo)
    expect(created).toMatchObject({ targetType: 'user', actorUserNo: boss.userNo, statusCode: 201 })
    expect(created?.meta).toMatchObject({
      before: {},
      after: { userId: 'audit-user', userName: '감사', roleNo: String(staffRole), teamNo: null },
    })
    const [updated] = await auditRows(CoreAuditActions.USER_UPDATE, item.userNo)
    expect(updated?.meta).toMatchObject({
      before: { userName: '감사' },
      after: { userName: '감사2' },
    })
    const [resigned] = await auditRows(CoreAuditActions.USER_RESIGN, item.userNo)
    expect(resigned).toMatchObject({ statusCode: 200 })
    expect(resigned?.meta).toMatchObject({
      before: { resignDate: null, resignAt: null },
      after: { resignDate: day(-1) },
      reason: '이직',
      revokedCount: 0,
      timeZone: TZ,
    })
    const [fixed] = await auditRows(CoreAuditActions.USER_RESIGN_DATE_UPDATE, item.userNo)
    expect(fixed?.meta).toMatchObject({ after: { resignDate: day(-2) }, timeZone: TZ })
    const [rehired] = await auditRows(CoreAuditActions.USER_REHIRE, item.userNo)
    expect(rehired?.meta).toMatchObject({
      after: { joinDate: day(0), resignDate: null, resignAt: null },
      timeZone: TZ,
    })
    const [reset] = await auditRows(CoreAuditActions.USER_PASSWORD_RESET, item.userNo)
    expect(reset?.meta).toEqual({ revokedCount: 0 })
    const [unlocked] = await auditRows(CoreAuditActions.USER_UNLOCK, item.userNo)
    expect(unlocked?.meta).toEqual({ lockUntil: null, loginFailCount: 0 })
  })

  it('🔴 감사 행 meta 원문에 임시 비밀번호 · currentPassword 의 값과 키가 없다(공통 11 · 2c 최종 리뷰 F1)', async () => {
    const agent = await signIn(boss, guarded)
    const currentPassword = boss.password
    const created = await createUser(agent, {
      userId: 'audit-secret',
      userName: '비밀',
      roleNo: staffRole,
      teamNo: null,
      joinDate: day(-10),
      currentPassword,
    })
    const base = `/admin/users/${created.item.userNo}`
    const reset = await sendJson(agent.post(`${base}/password-reset`), {
      currentPassword,
    }).expect(200)
    const resetPassword = z
      .object({ temporaryPassword: z.string() })
      .parse(data(reset)).temporaryPassword
    await sendJson(agent.patch(base), { revision: 0, userName: '비밀2', currentPassword }).expect(
      200,
    )
    await sendJson(agent.post(`${base}/resign`), { resignDate: day(-1), currentPassword }).expect(
      200,
    )
    await sendJson(agent.patch(`${base}/resign-date`), {
      resignDate: day(-2),
      currentPassword,
    }).expect(200)
    await sendJson(agent.post(`${base}/rehire`), { joinDate: day(0), currentPassword }).expect(200)
    await sendJson(agent.post(`${base}/unlock`), { currentPassword }).expect(200)

    const rows = await t.db
      .selectFrom('auditLogs')
      .select(['action', 'meta'])
      .where('targetRefNo', '=', created.item.userNo)
      .where('action', 'like', 'org.user.%')
      .execute()
    expect(rows).toHaveLength(7)
    for (const row of rows) {
      const raw = JSON.stringify(row.meta)
      expect(raw, row.action).not.toContain(created.temporaryPassword)
      expect(raw, row.action).not.toContain(resetPassword)
      expect(raw, row.action).not.toContain(currentPassword)
      expect(raw, row.action).not.toContain('temporaryPassword')
      expect(raw, row.action).not.toContain('currentPassword')
    }
  })
})
```

- [ ] **Step 2: 돌린다**

Run: `pnpm --filter @ssworks/admin-server test:db users.http`
Expected: PASS. 실패하면 메시지를 보고서에 붙이고, 그 계약을 만든 Task 의 코드를 고친다(Task 11 컨트롤러 · 파이프가 대부분이다). 고친 뒤 다시 돌린다.

🔴 확인(보고서에 적고 되돌린다): `users.controller.ts` 의 `resetPassword` 에서 `attachAuditMeta(req, { revokedCount })` 를 `attachAuditMeta(req, { revokedCount, temporaryPassword })` 로 바꾸면 비밀 테스트가 `temporaryPassword` 키로 FAIL 한다(소독은 값을 `***` 로 가리지만 키는 남는다 — 1차 방어선이 컨트롤러라는 증거).

Run: `pnpm --filter @ssworks/admin-server typecheck` · `pnpm lint`
Expected: 오류 없음.

- [ ] **Step 3: 커밋한다**

```bash
git add packages/admin-server/src/users/users.http.db.test.ts
git commit -m "test(admin-server): 사용자 HTTP 계약 — 봉투 키, 임시 비밀번호 로그인, 퇴사 401 · 403, 재인증 일곱 라우트, 감사 비밀" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: 쓰는 쪽 스모크 · README · changeset · 진행 문서

**Files:**

- Modify: `packages/admin-server/README.md`
- Create: `.changeset/admin-server-users.md`
- Modify: `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md`(§14 R8 — 플랜이 더한 작은 결정, 구현 중 바뀐 것)
- Create(저장소 밖): `$TEMP/akss/` 아래 앱 파일들

- [ ] **Step 1: README 를 고친다**

`packages/admin-server/README.md`:

① 둘째 단락의 `…역할 관리 · 계정 판정(PR 2d-1)이다. 사용자 · 팀 · 약관 · IP 접근 제어는 다음 PR 에서 붙는다` 를 `…역할 관리 · 계정 판정(PR 2d-1), 사용자 · 계정(PR 2d-2)이다. 팀 · 약관 · IP 접근 제어는 다음 PR 에서 붙는다` 로 고친다.

② "## 권한 슬롯" 예시 객체의 `'roles.manage': …` 줄 다음에 두 줄을 더한다:

```ts
      'users.read': 'org.users:read', // GET /users… · GET /roles(역할 고르기)
      'users.manage': 'org.users:write', // POST · PATCH /users…
```

③ "## admin-ui 와 맞물리기" **앞**에 절을 더한다:

````md
## 사용자 · 계정

```ts
imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      …,
      permissionCatalog: permissions, // 🔴 사용자 모듈도 필수
      permissions: { …, 'users.read': 'org.users:read', 'users.manage': 'org.users:write' },
      timeZone: 'Asia/Seoul', // 기본값 — 입사일 · 퇴사일을 읽는 기준 시간대(IANA 이름)
    }),
  }),
  AdminAuthModule,
  AdminUsersModule, // /users 열 라우트
]
```

| 라우트                                  | 슬롯           | 본문 → 응답                                                                           |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `GET /users`                            | `users.read`   | 쿼리(아래) → `{ items, total, page, itemsPerPage }`                                   |
| `GET /users/:userNo`                    | `users.read`   | → `{ item }`                                                                          |
| `GET /users/:userNo/employment-periods` | `users.read`   | → `{ items }`(입사일 내림차순)                                                        |
| `POST /users`                           | `users.manage` | `{ userId, userName, roleNo, teamNo, joinDate? }` → 201 `{ item, temporaryPassword }` |
| `PATCH /users/:userNo`                  | `users.manage` | `{ revision, userName?, roleNo?, teamNo?, joinDate? }` → `{ item }`                   |
| `POST /users/:userNo/resign`            | `users.manage` | `{ resignDate, reason? }` → `{ item }`                                                |
| `PATCH /users/:userNo/resign-date`      | `users.manage` | `{ resignDate, reason? }` → `{ item }`                                                |
| `POST /users/:userNo/rehire`            | `users.manage` | `{ joinDate, reason? }` → `{ item }`                                                  |
| `POST /users/:userNo/password-reset`    | `users.manage` | (재인증이면 `{ currentPassword }`) → `{ temporaryPassword }`                          |
| `POST /users/:userNo/unlock`            | `users.manage` | (재인증이면 `{ currentPassword }`) → `{}`                                             |

목록 쿼리: `page` · `itemsPerPage` · `sortBy`(`userId` · `userName` · `joinAt` · `resignAt` · `createAt` · `updateAt`, 기본 `createAt` 내림차순) · `filter[keyword]`(아이디 · 이름 부분일치) · `filter[teamNo]`(소속 전체로 거른다) · `filter[recursive]`(`'true'` · `'false'` 만 — 하위 팀 포함) · `filter[status]`(`active` · `resigned` — 퇴사 예정 포함). 행의 팀은 **대표 팀**(가장 작은 `teamNo`)이고 무소속 계정도 보인다.

- **날짜와 효력 시각**: 본문 · 응답의 날짜는 `'YYYY-MM-DD'`. 퇴사일은 **그날까지 근무**한다 — 효력 시각(`resignAt`)은 기준 시간대(`timeZone`)에서 퇴사일 다음 날 0시이고, 인증은 그 시각부터 로그인 · 요청을 막는다. **지금 막으려면 어제 날짜**로 퇴사시킨다 — 그 사용자의 세션이 바로 끊긴다(다음 요청 401, 로그인 403 `ERR_RESIGNED_USER`). 미래 퇴사일은 세션을 두고 효력 시각에 막는다. 🔴 `timeZone` 을 바꿔도 이미 저장된 효력 시각 · 날짜는 그대로다. `+09:00` 같은 오프셋 표기는 기동에서 멈춘다.
- **임시 비밀번호**: 계정 만들기와 초기화는 서버가 만든 16자 임시 비밀번호를 **응답에서 한 번만** 돌려준다(저장은 해시, 감사에는 남지 않는다). 그 값으로 로그인하면 강제 변경 흐름이다(`/auth/me` 의 `isPasswordChangeRequired`). 초기화는 그 계정의 살아 있는 세션을 끊고 잠금도 푼다. admin-ui 배선:

```vue
<TemporaryPasswordDialog v-model="createdPassword" mode="create" :target="`${name}(${userId})`" />
<TemporaryPasswordDialog v-model="resetPassword" mode="reset" :target="label" sessions-revoked />
```

- **권한 상승 · 자기 계정**: 사용자 쓰기는 대상의 역할 권한을 덮어야 하고, 역할을 바꾸면 새 역할도 덮어야 한다(403 `details.outside`). 🔴 자기 계정의 퇴사 · 퇴사일 정정 · 비밀번호 초기화 · 잠금 해제는 403 — 다른 관리자에게 요청한다. 자기 이름 · 팀 바꾸기와 재입사(퇴사 예정인 본인)는 된다.
- **전권자 잔존**: 마지막 전체 권한(`'*'`) 재직자의 역할을 내리거나 퇴사(퇴사 예정 포함)시키면 409.
- **revision · 수정일**: `PATCH /users/:userNo` 는 `revision` 필수(다르면 409). 수정 · 퇴사 · 퇴사일 정정 · 재입사가 `revision` 과 `updateAt` 을 올린다. 초기화 · 잠금 해제 · 로그인 실패 · 본인 비밀번호 변경은 올리지 않는다 — 열어 둔 수정 폼이 떨어지지 않는다.
- **팀**: 사용자 쓰기는 팀 하나(`teamNo`, `null` 이면 무소속)를 받고 소속을 그 하나로 바꾼다. 여러 팀 소속은 팀 모듈(2e)의 몫이다.
- **재직 이력**: 퇴사 · 재입사마다 구간이 쌓인다. 재입사일은 직전 퇴사일 **다음 날**부터, 퇴사일은 입사일과 같거나 뒤. 시드에서 이력 없이 만든 계정은 첫 퇴사 때 `users.joinAt` 으로 구간을 치유한다.
- **확장 필드**(전화 · 이메일)는 패키지 라우트가 받지 않는다 — 쓰는 쪽 자기 라우트가 다룬다. 🔴 NOT NULL 확장 컬럼은 DEFAULT 를 둔다(패키지 INSERT 가 모른다).
- 🔴 **카탈로그를 바꿨을 때**: 카탈로그에서 키를 지우거나 `implies` 를 더했다면, 전체 권한(`'*'`) 관리자가 그 키를 가진 역할 · 관리자 역할을 **한 번 다시 저장**한다(화면이 옛 키를 버리고 서버가 함의를 채운다). 그 전에는 좁은 관리자가 그 역할 · 그 역할의 계정을 다루지 못한다(403 — 판정은 저장된 권한을 본다, 스펙 §14 R5-1).
- **동시 쓰기 재시도**: MariaDB 11.6.2+(`innodb_snapshot_isolation` 기본 ON)에서는 퇴사 · 역할 변경이 대상의 로그인과 겹치면 드물게 409 `ERR_COMMON_CONFLICT`("다시 시도해 주세요")로 끝난다 — 다시 보내면 된다.
- 감사: `org.user.create` · `update` · `resign` · `resignDate.update` · `rehire` · `password.reset` · `unlock`. 퇴사 · 정정 · 재입사 meta 에 사유 · 끊은 세션 수 · 기준 시간대가 남는다. 임시 비밀번호 · 재인증 비밀번호는 남지 않는다.

3d `TeamUserList` 어댑터:

```ts
const loadTeamUsers = (query: TeamUserQuery) =>
  api.get<{ items: AdminUser[]; total: bigint }>('/users', {
    params: {
      page: query.page,
      itemsPerPage: query.itemsPerPage,
      filter: { teamNo: query.teamNo, recursive: query.recursive, keyword: query.keyword },
    },
  })
```
````

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-users.md`:

```md
---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 사용자 모듈을 쓰면 `AdminServerModule` 옵션의 `permissions` 에 슬롯 `'users.read'` · `'users.manage'` 를 잇고 `AdminUsersModule` 을 import 한다(`permissionCatalog` 필수, 선택 `timeZone` — 기본 `'Asia/Seoul'`). 🔴 장 `0002_users` 를 고쳤다(`users.updateAt` 의 `ON UPDATE CURRENT_TIMESTAMP` 를 뺐다) — 이미 장을 돌린 개발 DB 는 다시 만든다. `GET /roles` 는 이제 `users.read` 로도 읽힌다. admin-shared 역할 이름(`roleNameSchema`)이 앞뒤 공백을 뗀다.

admin-server 사용자 · 계정(Phase 2 PR 2d-2): `AdminUsersModule` — `/admin/users` 열 라우트(목록 — 팀 · 하위 팀 · 상태 · 검색어 · 대표 팀, 단건, 재직 이력, 만들기 — 서버 임시 비밀번호 `{ item, temporaryPassword }`, 수정 — revision, 퇴사 — 기준 시간대 다음 날 0시 효력 · 지난 날짜는 즉시 세션 폐기, 퇴사일 정정, 재입사, 비밀번호 초기화, 잠금 해제). 자기 계정 넷 403 · 권한 상승 403 · 전권자 잔존 409 · 활성 구간 ≤ 1. 역할: 만들기 · 수정의 결과를 트랜잭션 안에서 읽고, 꺼진 기본 역할을 감사 meta `clearedDefaults` 로 남기고, 동시 만들기의 순서 값이 겹치지 않는다. 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: 사용자 계약 스키마(`adminUserSchema` · 만들기 · 수정 · 퇴사 · 퇴사일 · 재입사 본문 · 만들기 결과 · 재직 이력, `calendarDateSchema`), `queryBooleanSchema`(`'true'` · `'false'` 만), 코어 감사 액션에 사용자 일곱(`org.user.*`), `roleNameSchema` trim.
```

- [ ] **Step 3: tarball 을 만들고 스모크 앱을 쓴다**

```bash
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server build
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
mkdir -p "$TEMP/akss/src/migrations"
pnpm --filter @ssworks/admin-shared pack --pack-destination "$TEMP/akss"
pnpm --filter @ssworks/admin-server pack --pack-destination "$TEMP/akss"
ls "$TEMP/akss"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "package/dist/users/.*[.]js$"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "test-support|[.]test[.]js" || echo "테스트 파일 없음"
```

Expected: tarball 둘, `dist/users/*.js` 가 보이고 마지막 줄은 `테스트 파일 없음`.

`$TEMP/akss/package.json` · `tsconfig.json` · `.env` · `kysely.config.ts` · `src/main.ts` 는 2c 플랜 Task 13 Step 3(`docs/superpowers/plans/2026-10-14-admin-server-sessions-audit.md`)과 같다 — 그대로 옮겨 쓰고 tarball 이름만 `ls` 결과로 맞춘다. 스텁은 2d-1 과 같은 아홉이다(`009_admin_guard_locks.ts` 포함 — 2d-1 플랜 Task 13 Step 3).

`$TEMP/akss/src/seed.ts`:

```ts
import {
  adminDbConnectionFromEnv,
  assertUtcTimezone,
  createAdminKysely,
  hashPassword,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('seed')
const db = createAdminKysely(adminDbConnectionFromEnv())
try {
  const boss = await db
    .insertInto('roles')
    .values({ roleName: '최고 관리자', permissions: JSON.stringify(['*']), displayOrder: 1 })
    .executeTakeFirstOrThrow()
  await db
    .insertInto('roles')
    .values({ roleName: '직원', permissions: JSON.stringify(['org.users:read']), displayOrder: 2 })
    .execute()
  await db
    .insertInto('users')
    .values({
      userId: 'admin',
      password: await hashPassword('smoke-pass-1234'),
      userName: '관리자',
      roleNo: boss.insertId as bigint,
    })
    .execute()
} finally {
  await db.destroy()
}
```

`$TEMP/akss/src/app.module.ts` — 2d-1 플랜 Task 13 Step 3 의 파일에서 바꾼다: import 에 `AdminUsersModule` 을 더하고, `permissions` 에 `'users.read': 'org.users:read'` · `'users.manage': 'org.users:write'` 를, `imports` 의 `AdminRolesModule,` 다음에 `AdminUsersModule,` 를 더한다.

`$TEMP/akss/check.mjs` — 2d-1 플랜의 `send` · `show` · `bigint` · `waitForServer` · `login` 도우미 그대로, 본문을 바꾼다:

```js
await waitForServer()
const admin = await login('admin', 'smoke-pass-1234')

const roles = JSON.parse((await send('/admin/roles', { cookie: admin })).text).data.items
const staffRole = roles.find((role) => role.roleName === '직원').roleNo // "BigInt(2)" — 그대로 보낸다
const created = await send('/admin/users', {
  method: 'POST',
  cookie: admin,
  body: { userId: 'smoke-staff', userName: '스모크 직원', roleNo: staffRole, teamNo: null },
})
show('users-create', created)
const createdData = JSON.parse(created.text).data
const userNo = bigint(createdData.item.userNo)
const temporary = createdData.temporaryPassword

const staff = await login('smoke-staff', temporary)
show('me-forced', await send('/admin/auth/me', { cookie: staff }))
show(
  'password-change',
  await send('/admin/auth/password', {
    method: 'PATCH',
    cookie: staff,
    body: { currentPassword: temporary, newPassword: 'staff-pass-5678' },
  }),
)
show('me-after', await send('/admin/auth/me', { cookie: staff }))

const reset = await send(`/admin/users/${userNo}/password-reset`, { method: 'POST', cookie: admin })
show('users-reset', reset)
show('me-revoked', await send('/admin/auth/me', { cookie: staff }))
const second = JSON.parse(reset.text).data.temporaryPassword
await login('smoke-staff', second)

const yesterday = new Date(Date.now() + 9 * 3_600_000 - 86_400_000).toISOString().slice(0, 10)
show(
  'users-resign',
  await send(`/admin/users/${userNo}/resign`, {
    method: 'POST',
    cookie: admin,
    body: { resignDate: yesterday, reason: '스모크' },
  }),
)
show(
  'login-resigned',
  await send('/admin/auth/login', {
    method: 'POST',
    body: { userId: 'smoke-staff', password: second },
  }),
)
show('users-list', await send('/admin/users?filter%5Bstatus%5D=resigned', { cookie: admin }))
show(
  'audit-logs',
  await send('/admin/audit-logs?itemsPerPage=20&filter%5Baction%5D=org.user', { cookie: admin }),
)
```

- [ ] **Step 4: 설치 · 빌드 · 마이그레이션 · 시드**

🔴 장 0002 를 고쳤으므로 스모크 DB 는 새로 만든다.

```bash
cd "$TEMP/akss"
pnpm install
pnpm build
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists akss; create database akss"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akss -e "show create table users" | grep -i "update_at"
```

Expected: 설치 성공 · 마이그레이션 9장 · 시드 성공. `tsc` 는 2a 때의 제3자 d.ts 6건 말고는 오류가 없다(있으면 기록하고 `skipLibCheck: true` 로 한 번 더 돌린다). 마지막 줄의 `update_at` 정의에 `ON UPDATE` 가 없다.

- [ ] **Step 5: 기동 · 요청**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected(본문은 줄여 적는다):

- `users-create 201 {"success":true,"data":{"item":{…"userId":"smoke-staff"…"isPasswordChangeRequired":true…},"temporaryPassword":"…16자…"}}`
- `me-forced 200 {…"permissions":[],"isPasswordChangeRequired":true…}`
- `password-change 200` · `me-after 200 {…"permissions":["org.users:read"],"isPasswordChangeRequired":false…}`
- `users-reset 200 {"success":true,"data":{"temporaryPassword":"…"}}` · `me-revoked 401 {…"code":"ERR_INVALID_TOKEN"…}`
- `users-resign 200 {…"item":{…"resignDate":"<어제>","resignAt":"<오늘 0시 KST 의 UTC>"…}}`
- `login-resigned 403 {…"code":"ERR_RESIGNED_USER"…}`
- `users-list 200 {…"items":[{…"userId":"smoke-staff"…}],"total":"BigInt(1)"…}`
- `audit-logs 200 {…}` — 최신순으로 `org.user.resign`(meta `reason` · `revokedCount` · `timeZone`) · `org.user.password.reset`(meta `revokedCount` 만) · `org.user.create` — 🔴 어느 meta 에도 임시 비밀번호가 없다.

셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
```

- [ ] **Step 7: 스펙 §14 · 진행 문서를 고친다**

숫자(N · M · W)는 저장소 루트에서 `pnpm check` · `pnpm test:db` 를 돌린 결과로 채운다(admin-server 테스트 수 · DB 테스트 수 · 워크스페이스 합계).

**스펙 `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md`** §14 끝에 더한다(구현 중 바뀐 것이 더 있으면 R9~ 로 이어 적는다):

```md
- **R8 — 플랜이 더한 작은 결정 둘(2026-10-14, 2d-2 플랜).** 재입사 감사 diff 에 효력 시각 `resignAt` 을 더한다 — 재입사가 지우는 값이다(§5-6 의 `joinDate · resignDate` 에 한 칸). 퇴사의 감사 meta 는 치유했을 때 `healedPeriod: true` 를 싣는다(§5-6 의 `healedPeriod?`). 퇴사일 정정은 서비스 메서드 이름이 `correctResignDate` 다(라우트 `PATCH /users/:userNo/resign-date`).
```

**`docs/01-phase0.md`**

① §3-2 표에서 첫 칸이 `` `users: { extensionSchema?: ZodObject, hooks:… `` 로 시작하는 행의 **첫 칸만** 바꾼다:

```md
`timeZone`(코어, 기본 `'Asia/Seoul'` — 날짜 → 효력 시각) · `reauth`(2d-1 코어) · `passwordPolicy`(2b 코어)(2d-2) — `extensionSchema` · `hooks` 는 두지 않는다(⑩ X1 — 확장 필드는 쓰는 쪽 라우트)
```

② §8 표 `@ssworks/admin-server` 행 상태 칸 끝(`… 다음 2d-2 사용자 · 계정`)을 이렇게 바꾼다:

```md
… 다음 2d-2 사용자 · 계정. **PR 2d-2 완료**(`feat/admin-server-users`, 2026-10-14) — `AdminUsersModule`(목록 · 단건 · 재직 이력 · 만들기 · 수정 · 퇴사 · 퇴사일 정정 · 재입사 · 초기화 · 잠금 해제) · 기준 시간대 효력 시각 · 서버 임시 비밀번호 · 장 0002 정정(`updateAt`) · 역할 이월 정리. N 테스트 + 실 MariaDB M. 플랜 `docs/superpowers/plans/2026-10-14-admin-server-users.md`. 다음 2e 팀 · 약관
```

③ 표 아래 `다음: Phase 2 PR 2d-2 사용자 · 계정(…).` 줄을 바꾼다:

```md
다음: Phase 2 PR 2e 팀 · 약관(2a 스펙 §1-3 의 2e 행 — 팀 트리 · 이동 · 삭제, 약관 게시 · 이력).
```

**`docs/HANDOFF.md`**

- `@ssworks/admin-server` 행에서 2d-1 의 숫자 문장(`431 테스트 + 실 MariaDB 188.`)을 지우고, 그 행 끝에 더한다: ``**PR 2d-2**(사용자 · 계정 — `AdminUsersModule` 열 라우트 · 기준 시간대 효력 시각 · 서버 임시 비밀번호 · 장 0002 `updateAt` 정정 · 역할 이월 정리, admin-shared 사용자 스키마 · `queryBooleanSchema` · 사용자 감사 액션)은 `feat/admin-server-users` 에서 구현 완료(2026-10-14). N 테스트 + 실 MariaDB M.``
- "검증" 행 끝에 더한다: `PR 2d-2 는 Windows 에서 pnpm check · pnpm test:db 초록, 쓰는 쪽 스모크($TEMP/akss — 새 DB · 스텁 9 → 시드 → 기동 → 사용자 만들기 → 임시 비밀번호 로그인 → 강제 변경 → 초기화(세션 끊김) → 어제로 퇴사(로그인 403) → 감사 행에 임시 비밀번호 없음)를 통과했다.`
- "다음 플랜" 행을 바꾼다: `Phase 2 PR 2e 팀 · 약관 — 2a 스펙 §1-3 의 2e 행으로 브레인스토밍부터(새 브랜치). 직전 PR 2d-2: 플랜 docs/superpowers/plans/2026-10-14-admin-server-users.md`
- "PR 2b 가 넘긴 것" 후속 목록의 `` `users.updateAt` 이 로그인 실패마다 바뀜(2d 의 "수정일" 표시) → 2d-2(⑧ U1) `` 를 `→ **2d-2 에서 닫음**(장 0002 정정 — ⑧ U1)` 으로, 2d 항목 끝의 `사용자는 2d-2)` 뒤에 ` → **2d-2 에서 닫음**` 을 붙인다.
- "PR 2c 가 넘긴 것" 의 2d 항목 끝 `사용자 슬롯 · org.user.* 는 2d-2)` 뒤에 ` → **2d-2 에서 닫음**` 을 붙인다.
- "PR 2d-1 최종 리뷰가 넘긴 것" 제목 끝에 ` → **2d-2 에서 닫음**(스펙 §14 R5 — M1 은 README 복구 절차, 나머지 다섯은 코드)` 을 붙인다.
- 최종 리뷰가 넘긴 것이 있으면 `- **PR 2d-2 최종 리뷰가 넘긴 것(2026-10-14)**` 항목으로 더한다(Step 9 뒤에 채운다).

**`CLAUDE.md`**

- 패키지 표의 admin-server 행 설명을 `NestJS 12 모듈 (Phase 2 진행 — 2a 기반 · 2b 인증 · 2c 세션 · 감사 · 2d 역할 · 사용자 완료)` 로.
- `### @ssworks/admin-server (Phase 2)` 목록 끝에 한 줄을 더한다:

```md
- 사용자 날짜는 `'YYYY-MM-DD'` — 효력 시각(퇴사일 다음 날 0시, 기준 시간대 `timeZone`)은 `accounts/calendar.ts` 의 `effectiveResignAt` 하나로 셈한다. 사용자 쓰기 트랜잭션 안의 결정 읽기(대상 · 역할 · 팀 · 재직 이력)는 모두 `FOR UPDATE` 다(스냅샷 격리 · 낡은 읽기 — 스펙 §14 R5-6 · R7). 임시 비밀번호는 응답에만 싣는다.
```

- 진행 표의 `**Phase 2 PR 2d-2 — 사용자 · 계정**` 행을 `Phase 2 PR 2d-2 — 사용자 · 계정(`AdminUsersModule` · 효력 시각 · 임시 비밀번호 · 재직 이력 · 잠금 해제)` · `완료` · `스펙 docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md · 플랜 docs/superpowers/plans/2026-10-14-admin-server-users.md` 로 바꾸고, 그 아래에 `**Phase 2 PR 2e — 팀 · 약관**` · `**다음**` · `2a 스펙 §1-3 2e 행` 행을 더한다.

- [ ] **Step 8: 포맷 · 확인 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-users.md docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-users.md docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md
pnpm format:check
pnpm check
pnpm test:db
```

Expected: prettier 두 번째 실행은 `(unchanged)` 뿐, `format:check` · `check` · `test:db` 초록. 작업 공간(`.superpowers/sdd/`)의 md 때문에 `format:check` 가 실패하면 그 경로만 원인인지 보고, 작업 공간을 지운 뒤 다시 돌린다.

```bash
git add packages/admin-server/README.md .changeset/admin-server-users.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md
git commit -m "docs: PR 2d-2 사용자 · 계정 — README 사용자 · 계정 절, changeset, 진행 문서, 다음 플랜은 2e" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 9: 최종 리뷰 · 머지 방법**

whole-branch 최종 리뷰(opus)를 받고 반영한 뒤(반영 커밋마다 `pnpm check` · `pnpm test:db`), 리뷰가 넘긴 것을 HANDOFF 에 적고 superpowers:finishing-a-development-branch 로 머지 방법을 묻는다.

---

## 스펙 대조표 (자체 검토)

| 스펙(2d-2 몫)                                                                                    | Task                  |
| ------------------------------------------------------------------------------------------------ | --------------------- |
| ⓪ S2 — 이 플랜은 [2] · 이월(R5)                                                                  | 머리말 · 6 · 13       |
| ③ SF1 자기 계정 넷 403 · 이름 · 팀 · 재입사 허용                                                 | 8 · 9 · 10 · 12       |
| ④ G1 잔존 — 역할 변경 · 퇴사만 센티넬, 첫 호출                                                   | 8 · 9                 |
| ⑤ Z1 · TZ1 날짜 → 효력 시각 · `timeZone` 기본 · 검증                                             | 3 · 4 · 9 · 11        |
| ⑥ P1 서버 임시 비밀번호 `{ item, temporaryPassword }`                                            | 3 · 8 · 11 · 12       |
| ⑦ R1 재인증 — 사용자 쓰기 일곱 · 트랜잭션 밖                                                     | 6 · 8~11 · 12         |
| ⑧ V1 revision · U1 `updateAt`(장 0002 정정)                                                      | 5 · 8 · 9 · 10        |
| ⑨ T1 팀 하나 · 대표 팀 LEFT JOIN                                                                 | 7 · 8                 |
| ⑩ X1 확장 필드 없음(README)                                                                      | 13                    |
| ⑪ L1 `GET /roles` 의 `users.read`                                                                | 6                     |
| ⑬ K1 새 코드 없음 · 필드 오류 · 409 · 403                                                        | 4 · 7~10              |
| 공통 1 슬롯 둘 · 공통 2 사용자 액션 일곱                                                         | 2 · 4 · 11            |
| 공통 5 임시 비밀번호 생성기 · 초기화 한 트랜잭션                                                 | 3 · 10                |
| 공통 6 즉시 퇴사 세션 폐기 · 미래는 두기 · 정정 · 재입사는 세션 그대로                           | 9 · 12                |
| 공통 7 활성 구간 ≤ 1 · 치유 · 날짜 규칙 · 정정은 마지막 구간                                     | 8 · 9                 |
| 공통 8 목록 — LEFT JOIN · 검색어 이스케이프 · 팀 · 하위 팀 · 상태 · boolean 쿼리 · 정렬          | 1 · 7 · 12            |
| 공통 9 잠금 해제 · 공통 10 응답 모양 · 공통 11 감사 소독                                         | 10 · 11 · 12          |
| 공통 13 계약 스키마 먼저(admin-shared)                                                           | 1                     |
| B1 아이디 중복 400 · B2 recordedTimezone UTC · createdBy · B3 날짜 열 UTC 자정                   | 3 · 8 · 9             |
| B7 판정 순서 · B8 대상 ⋈ 역할 잠금 · B9 소속 전체 필터 · B10 마지막 구간 날짜 · lockUntil 미래만 | 7 · 8 · 9             |
| B15 0시 없는 날 · 오프셋 거부 · B16 재입사 본인 · 잠금 해제 멱등                                 | 3 · 9 · 10            |
| §4-7 장 0002 정정 · §5-7 기동 검사(시간대 · 슬롯 · 카탈로그 · 인증 모듈)                         | 5 · 11                |
| §9-1 · §9-2 · §9-3 [2] 테스트 계약 · §9-4 리뷰 초점                                              | 1~12                  |
| §10 README · changeset · 진행 문서 · 스모크                                                      | 13                    |
| §14 R5(이월 — M1 README · M2 · M3 · M6 · DO · SI) · R6(401 · DB 시계 · 직접 소속) · R7(실측)     | 2 · 5 · 6 · 7~10 · 13 |

### §9-4 리뷰 초점 → 어디서 재는가

1. 잔존 잠금이 첫 문장인가 — Task 8 · 9 의 잔존 테스트 + Task 9 경합 · Task 10 스냅샷 테스트(셈이 읽기 뷰를 연다는 전제를 잰다). 리뷰어는 `withSuperAdminSurvival` 앞에 쿼리가 없는지 본다.
2. 판정이 쓰기보다 먼저이고 대상 역할이 잠겨 있는가 — B7 테스트(Task 8 · 9), `lockUser` 의 `users ⋈ roles … FOR UPDATE`(Task 8).
3. 효력 시각이 한 함수만 지나는가 · 날짜 열이 UTC 자정인가 — `effectiveResignAt` 를 부르는 곳은 `resign` · `correctResignDate` 둘뿐(Task 9), `toDateColumn`(Task 3 · 8 · 9).
4. 임시 비밀번호 · `currentPassword` 가 새는 길 — Task 12 감사 비밀 테스트 · 컨트롤러 1차 방어선 확인. 리뷰어는 `Logger` 문구 · 오류 `details` 에 비밀이 실리는 곳이 없는지 본다.
5. 역할 수정이 `permissions` 없는 본문에서 덮기 · 잔존을 건너뛰는가 — 2d-1 테스트 그대로(Task 6 에서 깨지지 않음을 `test:db roles` 로 본다).
