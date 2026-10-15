# admin-server 약관 (Phase 2 PR 2e-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2e 스펙 [2] 대로 약관 모듈 `AdminLegalModule` 을 만든다 — 현재본 `{ item | null }` · 이력 최신순 전량(본문 없음) · 단건(문서 그대로) · 발행 201 `{ legalDocNo, contentHash }`, 기준 판이 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`, 시행본과 같은 본문이면 409 `ERR_COMMON_CONFLICT`. 같은 종류 동시 발행 둘은 하나만 된다. 해시는 서버만 셈하고 표는 append-only 다.

**Architecture:** 장 `0011_legal_documents` 가 `legalDocuments` 표와 `guardLocks` 행 `legalPublish` 를 더한다. 발행은 트랜잭션 밖에서 sha256 을 셈한 뒤 `lockGuardRow(trx, GUARD_LOCK_LEGAL_PUBLISH)`(첫 문장) → 시행본 잠금 읽기(`… ORDER BY publishedAt DESC, legalDocNo DESC LIMIT 1 FOR UPDATE`) → 기준 판 검사 → 같은 해시 검사 → INSERT 다. 종류는 코어 옵션 `legal.kinds` 를 기동에서 검증하고 `z.enum` 주입형 파이프로 쿼리 · 본문을 좁힌다.

**Tech Stack:** NestJS 12.1 (ESM · NodeNext) · Kysely 0.29 + MariaDB 11.4 · zod 4 · vitest 4 · supertest · TypeScript 5.9

**Spec:** `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md` 의 **[2]** 몫 — §1(2e-2 끝 상태) · §2-1 ⑨ K1 · ⑩ L1 · ⑪ A1 · ⑫ J1 · §2-2 #1 · #2 · #5 · #8~#15 · §2-3 B2 · B14 · B15 · B16 · §4-1~§4-4 · §4-6 · §4-7 · §4-8 · §5-1 · §5-7 · §5-8 · §6(약관 행) · §8(2e-2) · §9 [2] · §10 [2] · §11 · §13 · **§14 R1-5 · R4 · R5(이 플랜 전 실측 — 특히 R5-1 의 RED 정정)**. 화면 계약은 3e 스펙 `docs/superpowers/specs/2026-10-07-admin-ui-legal-design.md` §4-2 · §9. 어긋나면 스펙이 이긴다. 직전 PR 2d-3 플랜: `docs/superpowers/plans/2026-10-15-admin-server-accounts-cleanup.md`, 모듈 · 장 · 경합 테스트 모양은 2e-1 플랜 `docs/superpowers/plans/2026-10-14-admin-server-teams.md`.

**구현자 규칙(모든 Task):** 테스트를 먼저 만들고 **구현 전에 돌려 RED 를 보고서에 붙인다**(실패 메시지 몇 줄 · 명령과 출력). 그다음 구현 · GREEN · 커밋. 🔴 표시가 붙은 잠금 · 순서 테스트는 구현 뒤에 해당 줄을 일부러 되돌려 RED 를 한 번 더 보고(보고서에 명령 · 출력을 적고) 되돌린다. 실험이 RED 를 내지 않으면 이유와 함께 적는다. 리뷰어는 이 플랜의 해당 Task 와 Global Constraints 를 **먼저 다 읽고** 리뷰한다.

## Global Constraints

- ESM 전용 · `module: NodeNext`. 내부 상대 import 는 `.js` 확장자. `console.log` 금지(`Logger.warn` · `error` 만).
- `admin-server/src` 는 `import type` 분리 규칙의 예외다(DI 메타데이터) — 단 데코레이터가 붙은 시그니처에 쓰는 **인터페이스 · 타입 별칭은 `import type`**(TS1272: `AdminLegalPublish` · `AdminPrincipal` · `LegalKindQuery` · `Request`), DI 로 받는 **클래스는 일반 import**.
- 정본에서 옮긴 파일은 머리 주석에 `정본:` · `바꾼 점:` · `🔴` 를 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 🔴 **발행 순서**(스펙 §5-7 · ⑩ L1 · B15): `legalContentHash(body)`(트랜잭션 밖) → `runWriteTransaction` 콜백의 **첫 문장** `lockGuardRow(trx, GUARD_LOCK_LEGAL_PUBLISH)` → 시행본 **잠금 읽기**(`.forUpdate()`) → `(current?.legalDocNo ?? null) !== baseLegalDocNo` 면 409 `ERR_COMMON_REVISION_CONFLICT` → `current?.contentHash === contentHash` 면 409 `ERR_COMMON_CONFLICT` → INSERT. 🔴 발행 트랜잭션에 비잠금 SELECT 를 두지 않는다 — 스냅샷 격리 ON 에서 발행자 `users` 행이 그사이 바뀌면 INSERT 의 FK 검사가 1020 → 409 가 된다(§14 R5-5).
- 🔴 **시행본 = 종류별 (`publishedAt` DESC, `legalDocNo` DESC) 첫 행**(공통 9). 현재본 · 이력 · 발행의 읽기가 모두 같은 두 키다. `publishedAt` 은 DB 시계(초 단위)라 앱이 넣지 않는다.
- 🔴 **append-only**(공통 11): `legalDocuments` 에 `updateTable` · `deleteFrom` · 원시 `update legal_documents` · `delete from legal_documents` 를 쓰지 않는다(장 `down()` 의 `dropTable` 만 예외). 수정 · 삭제 라우트 · 서비스 메서드가 없다.
- 🔴 **해시는 서버만**(3e §9): `sha256(body, 'utf8')` hex 소문자. 본문을 트림 · 정규화하지 않는다(3e D3). 클라이언트가 보낸 `contentHash` 는 zod 가 버린다. 🔴 본문을 감사 meta · 로그 · 오류 본문에 싣지 않는다 — 감사 meta 는 `{ kind, baseLegalDocNo, contentHash, length }` 뿐(공통 12).
- 응답 모양(공통 5 · 3e §9): 현재본 `{ item: AdminLegalDocument | null }` · 이력 `{ items: AdminLegalHistoryItem[] }`(본문 없음) · 단건은 **문서 그대로**(`{ item }` 이 아니다) · 발행 **201** `{ legalDocNo, contentHash }`. `publishedAt` 은 서비스 경계에서 `toISOString()`(B16). `publishedByUserName` 은 `LEFT JOIN users` 의 `userName`(발행자 SET NULL 이면 둘 다 null).
- 오류 문구(스펙 §6 — `legal/errors.ts` 의 `LEGAL_MESSAGES` 한 곳): `notFound` = `문서를 찾을 수 없습니다.`(404 `ERR_COMMON_NOT_FOUND`) · `revisionConflict` = `다른 관리자가 먼저 새 버전을 발행했습니다. 새로 불러온 내용을 확인하세요.`(409 `ERR_COMMON_REVISION_CONFLICT`) · `sameContent` = `이전 버전과 내용이 같습니다.`(409 `ERR_COMMON_CONFLICT`). 모르는 종류는 zod `ko` 문구 그대로 `잘못된 옵션: "TERMS"또는 "PRIVACY" 중 하나여야 합니다`(§14 R5-3).
- 이름: 슬롯 `'legal.read'` · `'legal.publish'`(⑥ P1), 감사 액션 `setting.legal.publish` "약관 발행" · 대상 `legalDocument` "약관"(공통 2), 장 `0011_legal_documents`, 가드 행 `legalPublish`(상수 `GUARD_LOCK_LEGAL_PUBLISH` — `database/guard-locks.ts`), 토큰 `ADMIN_LEGAL_CONFIG`, 라우트 `@Controller('legal-documents')`. DB 이름은 snake_case(`legal_documents` · `fk_legal_documents_published_by` · `idx_legal_documents_kind_published`).
- 종류 옵션(B14): `legal.kinds` 는 비어 있지 않은 배열, 원소 `^[A-Za-z0-9_]{1,32}$`, 겹침 없음 — 어기면 `AdminLegalModule` 설정 팩토리가 기동에서 문제를 모아 멈춘다. `kind` 열은 `ascii_bin` 이라 대소문자를 가른다(`terms` ≠ `TERMS`).
- 테스트: 단위 · DB 없는 HTTP 는 `*.test.ts`(`pnpm check`), 실 MariaDB 는 `*.db.test.ts`(Docker 컨테이너 `admin-kit-test-db` 가 떠 있어야 한다). 🔴 DB 테스트 하나만 돌리는 명령은 `pnpm --filter @ssworks/admin-server test:db <이름>` — `--` 를 넣으면 거르지 않는다. 단위는 `pnpm --filter @ssworks/admin-server test <이름>`. lint 는 **루트 `pnpm lint`**(패키지에 lint 스크립트가 없다), 타입은 `pnpm --filter @ssworks/admin-server typecheck`, 전체는 `pnpm check` · `pnpm test:db`.
- 🔴 `pnpm test:db` 는 한 번에 하나만 돌린다 — 겹치면 공유 DB 서버의 DDL 부하로 거짓 실패한다.
- 🔴 테스트 본문(`it`)에서 `createTestDatabase()` 를 부르지 않는다 — `beforeAll` · `afterAll`(hookTimeout 60초)에서. 장을 여러 번 도는 테스트만 그 `it` 에 긴 시간 한도를 준다. 전역 `testTimeout` 은 올리지 않는다(2d-3 스펙 §14 R4).
- 🔴 DB 테스트는 앞 테스트의 잔여에 기대지 않는다 — 서비스 테스트는 테스트마다 고유한 종류 문자열(`svc_flow` …)을 쓰고, HTTP 테스트는 종류가 둘(TERMS · PRIVACY)뿐이라 발행 기준을 늘 그때의 현재본에서 읽는다. 🔴 이름 · 아이디는 `utf8mb4_unicode_ci` 다 — 대소문자 · 끝 공백만으로 가르지 않는다. `seedRole(t.db)` 의 기본 권한은 `['*']` — 늘 `permissions` 를 명시한다.
- 🔴 원시 연결(`mariadb.createConnection`)은 `try/finally` 로 롤백 · 종료한다(`whileHeld` 가 한다). 기다리는 동안 거부될 수 있는 프로미스는 `settle` 로 바로 받아 둔다. 원시 SQL 의 식별자는 snake_case 다(`guard_locks` · `legal_documents` · `user_no`). 스냅샷 Kysely 는 `await snapshotKysely(t, on)` 으로 만들고 `finally`/`afterAll` 에서 `destroy()` 한다.
- 🔴 경합 테스트는 **공개 서비스 메서드**를 거친다. 잠금 대기는 `whileHeld`(STATUS 폴링)로 본다 — `information_schema.innodb_trx` 는 서버 전역 캐시라 쓰지 않는다(2e 스펙 §14 R1-6). 🔴 원시 연결이 쥔 행이 서비스가 정당하게 기다릴 행이면, 그 테스트가 무엇을 재는지(RED 실험이 실제로 RED 인지)를 Task 가 적은 대로 확인한다(§14 R5-1).
- 테스트 코드도 린트를 통과한다(쓰이지 않는 변수 · import 없음). 같은 범위의 지역 변수 이름을 겹쳐 쓰지 않는다. bigint 가 든 HTTP 본문은 `stringifyJSON` 으로 보낸다(`sendJson`).
- admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server 가 본다(`dist/` import).
- 셸: Windows(Git Bash) · Linux 양쪽. 🔴 출력을 `/dev/null` 로 보내지 않는다(Windows 에 `NUL` 파일이 생긴다) — 출력 억제 자체를 하지 않는다. 파일을 python · sed 로 다시 쓰지 않는다(LF). pnpm 설치는 짧은 `%TEMP%` 경로에서 한다.
- 🔴 도구 입력의 백슬래시 이스케이프는 JSON 으로 풀린다 — 새 코드 · 테스트에 백슬래시를 쓰지 않는다(줄바꿈은 `String.fromCharCode(10)`, 따옴표가 겹치면 템플릿 리터럴). 백슬래시가 든 줄을 고쳤다면 `node -e` 와 `charCodeAt` 으로 그 자리 바이트를 확인한다.
- 플랜의 코드 블록은 prettier 를 거치지 않았다 — 커밋 전에 바꾼 파일에 `pnpm exec prettier --write <파일…>` 을 돌린다. 긴 마크다운은 두 번 돌리고 `--check` 한다.
- 커밋: 한국어 conventional commits. 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `gh pr merge` · `pnpm release` · `npm publish` · `pnpm stage approve` 는 하지 않는다.

## Review Focus

스펙이 함의하지만 스펙의 테스트 목록이 재지 않는, 사람이 먼저 부딪힐 입력 다섯. 각 줄의 테스트를 담당 Task 에 넣었다.

1. **1,000,000자 한글 본문(JSON 3,000,048 바이트)** — 기본 `jsonLimit` 1mb 앱은 413 `ERR_COMMON_PAYLOAD_TOO_LARGE` 봉투, `jsonLimit: '4mb'` 앱은 201 이고 단건이 같은 본문을 돌려주며 감사 meta 는 길이만 싣는다. → Task 7 "jsonLimit" · Task 4 "mediumtext".
2. **끝 공백 · 줄바꿈(LF ↔ CRLF)만 다른 본문** — 트림 · 정규화 없이 다른 판(같은 본문 409 가 아니다)이고 원문 그대로 돌아온다. → Task 3 해시 벡터 · Task 4 "끝 공백 · 줄바꿈".
3. **본문에 `contentHash` 를 실어 보낸 요청** — 무시하고 서버가 셈한 해시를 돌려준다. → Task 3 파이프 · Task 7 "contentHash 무시".
4. **`?kind=` 가 빠졌거나 배열(`?kind=TERMS&kind=PRIVACY`) · 소문자(`terms`)인 조회** — 500 이 아니라 400 `issues[{ path: ['kind'] }]`. → Task 3 쿼리 파이프 · Task 7 "모르는 종류".
5. **옛 판(시행본이 아닌)과 같은 본문으로 되돌리는 발행** — 같은 본문 검사는 시행본하고만 하므로 201 이다. → Task 4 "같은 본문".

## 파일 구조

| 파일                                                                                                                                                                                                                                                                                     | 책임                                                  | Task |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---- |
| `packages/admin-shared/src/audit.ts` · `audit.test.ts`                                                                                                                                                                                                                                   | 약관 액션 · 대상 · 라벨 · 개수 30 · 5                 | 1    |
| `database/guard-locks.ts` · (새) `database/migrations/0011_legal_documents.ts` · `migrations/index.ts` · (새) `database/tables/legal-documents.ts` · `database/types.ts` · `runner.ts` · `migrations/ddl.test.ts` · `index.test.ts` · `migrations.db.test.ts` · `guard-locks.db.test.ts` | 장 · 표 타입 · 가드 상수                              | 2    |
| (새) `legal/options.ts` · `options.test.ts` · `errors.ts` · `content-hash.ts` · `content-hash.test.ts` · `legal.body.ts` · `legal.body.test.ts` · `options.ts` · `tokens.ts`                                                                                                             | 종류 옵션 검증 · 문구 · 해시 · 주입형 파이프          | 3    |
| (새) `legal/legal.service.ts` · `legal.service.db.test.ts` · `legal-append-only.test.ts`                                                                                                                                                                                                 | 현재본 · 이력 · 단건 · 발행 · append-only 정적 검사   | 4    |
| (새) `legal/legal.guard.db.test.ts` · `legal.race.db.test.ts`                                                                                                                                                                                                                            | 가드 직접 관찰 · 동시 발행(OFF · ON) · 스냅샷 FK 1020 | 5    |
| (새) `legal/legal.controller.ts` · `legal.module.ts` · `legal.module.test.ts` · `auth/permission-slots.ts` · `.test.ts` · `admin-server.module.ts` · `index.ts` · `test-support/accounts.ts` · `test-support/admin-app.ts`                                                               | 네 라우트 · 모듈 · 슬롯 둘 · 배선 · 테스트 앱         | 6    |
| (새) `legal/legal.http.db.test.ts`                                                                                                                                                                                                                                                       | 3e §9 전 행 · 감사 행 · jsonLimit                     | 7    |
| `packages/admin-server/README.md` · `.changeset/admin-server-legal.md` · 스펙 §14 · `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`                                                                                                                                                | 문서 · 릴리스 · 스모크                                | 8    |

(Task 2~7 의 경로는 `packages/admin-server/src/` 부터 적는다.)

**플랜 전 실측(스펙 §14 R5 에 적었다):** 가드가 있으면 32 갈래 겹침 순서 중 가드 쪽 16 갈래 모두 진 쪽이 기준 판 409 이고 스냅샷 ON 에서도 1020 이 없다. 가드만 빼면 진 쪽이 교착 1213(→ 409 `CONFLICT`)이 되거나 그대로 기준 판 409 이고, 가드와 잠금 읽기를 함께 빼야 둘 다 성공한다 — 그래서 경합 RED 는 Task 5 의 둘(가드 직접 관찰 · INSERT 앞에 맞춘 경합)로 가른다. 스냅샷 ON 에서 비잠금 읽기는 발행자 행이 바뀌면 FK 검사가 1020 이다(B15). 발행 ∥ 계정 삭제는 발행자 자신이 시행본도 냈을 때만 드문 1213(희생자 삭제)이다. 시행본 잠금 읽기는 인덱스 `ref` · 행 3개만 잠근다. Kysely 가 내는 SQL 은 ``select `legal_doc_no`, `content_hash` from `legal_documents` where `kind` = ? order by `published_at` desc, `legal_doc_no` desc limit ? for update`` 이고 장 DDL 은 Task 2 의 원문 그대로다(컴파일 실측).

**권장 모델(Subagent-driven):** 구현 — Task 1 haiku(명세 확정 1~2파일), 나머지 sonnet. 리뷰 — Task 2 · 4 · 5(장 · 발행 · 경합) opus, Task 1 · 3 · 6 · 7 · 8 sonnet. 최종 whole-branch 리뷰 opus.

---

### Task 1: admin-shared — 약관 감사 액션 · 대상

**Files:**

- Modify: `packages/admin-shared/src/audit.ts`(머리 주석 한 줄 · `CoreAuditActions` · `CoreAuditTargets` · 라벨 둘)
- Modify: `packages/admin-shared/src/audit.test.ts`(개수 · 대상 목록 · 새 테스트 · `defineAuditCatalog` 개수)

**Interfaces:**

- Produces: `CoreAuditActions.LEGAL_PUBLISH = 'setting.legal.publish'` · `CoreAuditTargets.LEGAL_DOCUMENT = 'legalDocument'` — Task 6 컨트롤러의 `@Audit` 와 Task 7 감사 테스트가 쓴다.

- [ ] **Step 1: 테스트를 고친다**

`packages/admin-shared/src/audit.test.ts`:

① 첫 `it` 을 통째로 바꾼다:

```ts
it('🔴 액션 30 · 대상 5 · 라벨이 하나씩 — 개수는 이 테스트가 고정한다(산문의 개수는 낡는다)', () => {
  expect(Object.values(CoreAuditActions)).toHaveLength(30)
  expect(Object.values(CoreAuditTargets)).toEqual([
    'user',
    'session',
    'role',
    'team',
    'legalDocument',
  ])
  expect(Object.keys(CORE_AUDIT_ACTION_LABELS).sort()).toEqual(
    [...Object.values(CoreAuditActions)].sort(),
  )
  expect(Object.keys(CORE_AUDIT_TARGET_LABELS).sort()).toEqual([
    'legalDocument',
    'role',
    'session',
    'team',
    'user',
  ])
})
```

② `it('팀 액션(2e-1) — …')` 블록 다음(같은 `describe('코어 카탈로그')` 안)에 더한다:

```ts
it('약관 액션(2e-2) — setting.legal.publish · 대상 legalDocument 와 라벨', () => {
  expect(CoreAuditActions.LEGAL_PUBLISH).toBe('setting.legal.publish')
  expect(CoreAuditTargets.LEGAL_DOCUMENT).toBe('legalDocument')
  expect(coreAuditCatalog.labelOf('setting.legal.publish')).toBe('약관 발행')
  expect(coreAuditCatalog.targetLabelOf('legalDocument')).toBe('약관')
})
```

③ `describe('defineAuditCatalog')` 의 첫 `it` 에서 두 줄을 바꾼다:

```ts
expect(catalog.ACTION_VALUES).toHaveLength(31)
expect(catalog.TARGET_VALUES).toEqual(['user', 'session', 'role', 'team', 'legalDocument', 'post'])
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-shared test audit`
Expected: FAIL — `expected [ …29 items… ] to have a length of 30`, `LEGAL_PUBLISH` 가 `undefined`.

- [ ] **Step 3: `audit.ts` 를 고친다**

① 머리 주석(`바꾼 점:` 첫 항목)의 `팀(2e-1). 약관 · IP 액션은 2e-2 · 2f 가 더한다.` 를 `팀(2e-1) · 약관(2e-2). IP 액션은 2f 가 더한다.` 로 바꾼다(그 줄의 나머지는 그대로).

② `CoreAuditActions` 의 `TEAM_MOVE: 'org.team.move',` 다음 줄에 `  LEGAL_PUBLISH: 'setting.legal.publish',` 를 더한다.

③ `CoreAuditTargets` 의 `TEAM: 'team',` 다음 줄에 `  LEGAL_DOCUMENT: 'legalDocument',` 를 더한다.

④ `CORE_AUDIT_ACTION_LABELS` 의 `'org.team.move': '팀 이동',` 다음 줄에 `  'setting.legal.publish': '약관 발행',` 를 더한다.

⑤ `CORE_AUDIT_TARGET_LABELS` 의 `team: '팀',` 다음 줄에 `  legalDocument: '약관',` 를 더한다.

- [ ] **Step 4: GREEN · 빌드**

```bash
pnpm --filter @ssworks/admin-shared test
pnpm --filter @ssworks/admin-shared typecheck
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server test audit
pnpm lint
```

Expected: 모두 PASS. admin-server 감사 단위 테스트(카탈로그 검사)는 코어 액션이 늘어도 그대로 초록이다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts
git add packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts
git commit -m "feat(admin-shared): 약관 감사 액션 setting.legal.publish · 대상 legalDocument" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 장 `0011_legal_documents` · 표 타입 · 가드 이름 상수

**Files:**

- Modify: `database/guard-locks.ts`(상수 하나)
- Create: `database/migrations/0011_legal_documents.ts`
- Modify: `database/migrations/index.ts`(import · `ADMIN_MIGRATIONS` · `CHAPTERS`)
- Create: `database/tables/legal-documents.ts`
- Modify: `database/types.ts` · `runner.ts`
- Modify: `database/migrations/ddl.test.ts` · `index.test.ts` · `migrations.db.test.ts` · `database/guard-locks.db.test.ts`

**Interfaces:**

- Consumes: `lockGuardRow`(이미 있음), `_shared.ts` 의 `ASCII_BIN` · `TABLE_OPTIONS` · `comment`.
- Produces:
  - `export const GUARD_LOCK_LEGAL_PUBLISH = 'legalPublish'`(`database/guard-locks.ts`) — Task 4 가 쓴다.
  - `export interface AdminLegalDocumentsTable`(`database/tables/legal-documents.ts`) · `AdminDatabase.legalDocuments` — Task 4 의 Kysely 쿼리 타입. `publishedAt: ColumnType<Date, never, never>` 라 Kysely 로는 넣을 수 없다(테스트의 같은 초 시드는 원시 `sql` 로).
  - `ADMIN_MIGRATIONS` 열한 번째 `'0011_legal_documents'`.

- [ ] **Step 1: 장 테스트를 고친다**

① `database/migrations/index.test.ts`:

- `it('0001~0010 순서', …)` 를 바꾼다:

```ts
it('0001~0011 순서', () => {
  expect(ADMIN_MIGRATIONS).toEqual([
    '0001_roles',
    '0002_users',
    '0003_teams',
    '0004_team_closure',
    '0005_team_user_map',
    '0006_user_employment_periods',
    '0007_sessions',
    '0008_audit_logs',
    '0009_guard_locks',
    '0010_team_tree_lock',
    '0011_legal_documents',
  ])
})
```

- `it('🔴 순서 어긋남 — …')` 의 기대 문자열을 바꾼다:

```ts
expect(findStubProblems(swapped)).toEqual([
  '파일 이름 순서가 장 순서와 다르다 — 지금: 0002_users, 0001_roles, 0003_teams, 0004_team_closure, ' +
    '0005_team_user_map, 0006_user_employment_periods, 0007_sessions, 0008_audit_logs, 0009_guard_locks, 0010_team_tree_lock, 0011_legal_documents / 맞는 순서: 0001_roles, ' +
    '0002_users, 0003_teams, 0004_team_closure, 0005_team_user_map, 0006_user_employment_periods, 0007_sessions, ' +
    '0008_audit_logs, 0009_guard_locks, 0010_team_tree_lock, 0011_legal_documents',
])
```

- `it('🔴 빠진 장을 모아 한 번에 던진다', …)` 의 마지막 `expect` 다음에 한 줄을 더한다:

```ts
expect(() => assertAdminMigrationStubs(dir)).toThrow('빠진 장 0011_legal_documents')
```

(스텁 파일 이름은 이미 세 자리 `011_…` 로 만든다 — 2e 스펙 §14 R2 ②.)

② `database/migrations/ddl.test.ts`:

- import 줄 `import * as teamTreeLock from './0010_team_tree_lock.js'` 다음에 `import * as legalDocuments from './0011_legal_documents.js'` 를 더한다.
- `CHAPTERS` 배열의 `['0010_team_tree_lock', teamTreeLock],` 다음에 `['0011_legal_documents', legalDocuments],` 를 더한다.
- `describe('0010_team_tree_lock', …)` 블록 다음에 더한다:

```ts
describe('0011_legal_documents', () => {
  it('표 · 인덱스 · 가드 행 — 열 정의 원문(2e 스펙 공통 8 · §4-7)', async () => {
    const statements = await capture((db) => legalDocuments.up(db))
    expect(statements).toHaveLength(3)
    const [table = '', index, seed = ''] = statements
    expect(table).toMatch(/^create table `legal_documents`/)
    for (const fragment of [
      '`legal_doc_no` bigint unsigned primary key auto_increment',
      '`kind` varchar(32) collate ascii_bin not null',
      '`body` mediumtext not null',
      '`content_hash` char(64) collate ascii_bin not null',
      '`published_at` timestamp default CURRENT_TIMESTAMP not null',
      '`published_by_user_no` bigint unsigned comment',
      'constraint `fk_legal_documents_published_by` foreign key (`published_by_user_no`) references `users` (`user_no`) on delete set null on update cascade',
    ]) {
      expect(table).toContain(fragment)
    }
    expect(index).toBe(
      'create index `idx_legal_documents_kind_published` on `legal_documents` (`kind`, `published_at`)',
    )
    expect(seed).toMatch(/^insert into `guard_locks`/)
  })

  it('🔴 kind 에 CHECK · ENUM 이 없다 — 종류 폐집합의 정본은 옵션 legal.kinds(gise)', async () => {
    const [table = ''] = await capture((db) => legalDocuments.up(db))
    const outside = outsideQuotes(table).toLowerCase()
    expect(outside).not.toContain('check')
    expect(outside).not.toContain('enum')
  })

  it('down 은 가드 행을 지우고 표를 버린다', async () => {
    expect(await capture((db) => legalDocuments.down(db))).toEqual([
      'delete from `guard_locks` where `lock_name` = ?',
      'drop table `legal_documents`',
    ])
  })
})
```

③ `database/migrations/migrations.db.test.ts`:

- `CORE_TABLES` 의 `'guard_locks',` 다음에 `'legal_documents',` 를 더한다.
- `it('collation · NULL · ON UPDATE · 타입을 스키마에서 잰다', …)` 의 마지막 `expect` 다음에 더한다:

```ts
// 약관 장(2e 스펙 공통 8)
expect(column('legal_documents', 'kind').collationName).toBe('ascii_bin')
expect(column('legal_documents', 'kind').columnType).toBe('varchar(32)')
expect(column('legal_documents', 'content_hash').collationName).toBe('ascii_bin')
expect(column('legal_documents', 'content_hash').columnType).toBe('char(64)')
expect(column('legal_documents', 'body').columnType).toBe('mediumtext')
expect(column('legal_documents', 'body').collationName).toBe('utf8mb4_bin')
expect(column('legal_documents', 'legal_doc_no').columnType).toBe('bigint(20) unsigned')
expect(column('legal_documents', 'published_by_user_no').columnType).toBe('bigint(20) unsigned')
expect(column('legal_documents', 'published_by_user_no').isNullable).toBe('YES')
expect(column('legal_documents', 'published_at').isNullable).toBe('NO')
// 🔴 append-only — 발행 시각에 ON UPDATE 가 없다(explicit_defaults_for_timestamp=OFF 에서도)
expect(column('legal_documents', 'published_at').extra.toLowerCase()).not.toContain('on update')
```

- `it('🔴 제약 이름은 snake_case …')` 의 목록 `'sessions.fk_sessions_user',` 다음에 `'legal_documents.fk_legal_documents_published_by',` 를 더한다.
- 그 `it` 다음에 더한다:

```ts
it('🔴 약관 발행자 FK 는 SET NULL — 계정을 지워도 발행 이력이 남는다(2e 스펙 공통 8)', async () => {
  const result = await sql<{ constraintName: string; deleteRule: string; updateRule: string }>`
      select constraint_name, delete_rule, update_rule
        from information_schema.referential_constraints
       where constraint_schema = ${t.name} and table_name = 'legal_documents'
    `.execute(t.db)
  expect(result.rows).toEqual([
    {
      constraintName: 'fk_legal_documents_published_by',
      deleteRule: 'SET NULL',
      updateRule: 'CASCADE',
    },
  ])
})
```

- `it('인덱스', …)` 의 목록 `'idx_audit_logs_action',` 다음에 `'idx_legal_documents_kind_published',` 를 더한다.
- `it('0009 · 0010 — 센티넬 행이 이름마다 하나다(lock_name PK)', …)` 를 바꾼다:

```ts
it('0009 · 0010 · 0011 — 센티넬 행이 이름마다 하나다(lock_name PK)', async () => {
  const rows = await t.db.selectFrom('guardLocks').selectAll().orderBy('lockName').execute()
  expect(rows).toEqual([
    { lockName: 'legalPublish', description: expect.stringContaining('FOR UPDATE') },
    { lockName: 'superAdminSurvival', description: expect.stringContaining('FOR UPDATE') },
    { lockName: 'teamTree', description: expect.stringContaining('FOR UPDATE') },
  ])
})
```

④ `database/guard-locks.db.test.ts`:

- import 를 `import { GUARD_LOCK_LEGAL_PUBLISH, GUARD_LOCK_TEAM_TREE, GUARD_MESSAGES, lockGuardRow } from './guard-locks.js'` 로.
- `describe('guardLocks 시드 행')` 의 `it` 을 바꾼다:

```ts
it('🔴 장의 리터럴과 이름 상수가 같다 — 약관 발행(0011) · 잔존(0009) · 팀 트리(0010)', async () => {
  const rows = await t.db.selectFrom('guardLocks').select('lockName').orderBy('lockName').execute()
  expect(rows).toEqual([
    { lockName: GUARD_LOCK_LEGAL_PUBLISH },
    { lockName: GUARD_LOCK_SUPER_ADMIN },
    { lockName: GUARD_LOCK_TEAM_TREE },
  ])
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

```bash
pnpm --filter @ssworks/admin-server test migrations
pnpm --filter @ssworks/admin-server test:db migrations
pnpm --filter @ssworks/admin-server test:db guard-locks
```

Expected: 단위는 `Failed to load url ./0011_legal_documents.js`(ddl) · 순서 목록 불일치(index). DB 는 `legal_documents` 가 없어 표 목록 · 열 · 제약 · 가드 행이 FAIL, `guard-locks` 는 `GUARD_LOCK_LEGAL_PUBLISH` 가 `undefined`.

- [ ] **Step 3: 가드 이름 상수를 더한다**

`database/guard-locks.ts` 의 `export const GUARD_LOCK_TEAM_TREE = 'teamTree'` 다음에 더한다:

```ts
/** 장 0011 의 시드 행 이름 — 약관 발행(2e 스펙 ⑩ L1). 같은 값인지는 guard-locks.db.test.ts 가 잰다 */
export const GUARD_LOCK_LEGAL_PUBLISH = 'legalPublish'
```

- [ ] **Step 4: 장을 쓴다**

`database/migrations/0011_legal_documents.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, TABLE_OPTIONS, comment } from './_shared.js'

// 정본: ssworks-gise-home apps/api/src/core/database/migrations/006_legal_documents.migration.ts
// 바꾼 점:
//  - PK 는 bigint unsigned(gise 는 integer) — 쓰는 쪽 동의 기록이 legalDocNo 를 FK 로 걸 때 그 타입을 맞춘다.
//  - kind 는 varchar(32) ascii_bin(gise varchar(16)) — 종류 옵션 형식 ^[A-Za-z0-9_]{1,32}$ 와 같은 폭(2e 스펙 B14).
//  - 발행자는 publishedByUserNo(gise publishBy) — admin-shared 계약 이름 그대로. FK 는 gise 와 같은 SET NULL.
//  - 약관 발행 직렬화 행 legalPublish 를 같은 장에 넣는다(2e 스펙 ⑩ L1 · ⑪ A1). 인자 타입 Kysely<unknown>(2a R2).
// 🔴 append-only 다 — 수정은 새 판 INSERT 다. 동의한 문서가 사후에 바뀌면 동의 기록의 증거 능력이 사라진다(gise · axion).
//    소스에 UPDATE · DELETE 경로가 없음을 legal/legal-append-only.test.ts 가 지킨다.
// 🔴 kind 에 CHECK · ENUM 을 두지 않는다 — 종류 폐집합의 정본은 옵션 legal.kinds 이고 입구는 zod 가 막는다(gise).
// 🔴 publishedAt 은 DB 시계(초 단위)다 — 앱이 넣지 않는다(axion 은 앱 시계). 같은 초 발행이 실제로 나므로 시행본은
//    (publishedAt DESC, legalDocNo DESC) 두 키로 고른다(gise).
// 🔴 발행자 FK 는 SET NULL — 관리자 계정을 지워도 발행 이력이 남는다(axion 의 NOT NULL + RESTRICT 는 계정 삭제를 막았다).
// 🔴 시드 이름은 상수 import 없이 리터럴이다 — 장은 한 번 적용되면 고정이다. database/guard-locks.ts 의
//    GUARD_LOCK_LEGAL_PUBLISH 와 같은 값인지는 guard-locks.db.test.ts 가 잰다.

type GuardLocks = { guardLocks: { lockName: string; description: string } }

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('legalDocuments')
    .addColumn('legalDocNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('kind', 'varchar(32)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('종류. 폐집합의 정본은 옵션 legal.kinds')),
    )
    .addColumn('body', sql`mediumtext`, (col) => col.notNull().modifyEnd(comment('마크다운 원문')))
    .addColumn('contentHash', 'char(64)', (col) =>
      col.notNull().modifyFront(ASCII_BIN).modifyEnd(comment('sha256(body) hex. 서버만 셈한다')),
    )
    .addColumn('publishedAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('발행 시각(DB 시계). 시행본 정렬 1차 키')),
    )
    .addColumn('publishedByUserNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('발행자. NULL = 계정이 지워졌다')),
    )
    .addForeignKeyConstraint(
      'fkLegalDocumentsPublishedBy',
      ['publishedByUserNo'],
      'users',
      ['userNo'],
      (cb) => cb.onDelete('set null').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  // 🔴 종류마다 시행본을 고르는 인덱스 — UNIQUE 가 아니다. PK 가 꼬리에 붙어 두 키 정렬을 덮는다(filesort 없이 행 셋만
  //    잠근다 — 2e 스펙 §14 R5-6)
  await db.schema
    .createIndex('idxLegalDocumentsKindPublished')
    .on('legalDocuments')
    .columns(['kind', 'publishedAt'])
    .execute()

  await db
    .withTables<GuardLocks>()
    .insertInto('guardLocks')
    .values({
      lockName: 'legalPublish',
      description:
        '약관 발행을 종류와 관계없이 직렬화한다. 각 발행 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다',
    })
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db
    .withTables<GuardLocks>()
    .deleteFrom('guardLocks')
    .where('lockName', '=', 'legalPublish')
    .execute()
  await db.schema.dropTable('legalDocuments').execute()
}
```

`database/migrations/index.ts`:

- import 줄 `import * as teamTreeLock from './0010_team_tree_lock.js'` 다음에 `import * as legalDocuments from './0011_legal_documents.js'`.
- `ADMIN_MIGRATIONS` 의 `'0010_team_tree_lock',` 다음에 `'0011_legal_documents',`.
- `CHAPTERS` 의 `'0010_team_tree_lock': teamTreeLock,` 다음에 `'0011_legal_documents': legalDocuments,`.

(스텁 정규식 `\d{4}_[a-z_]+` 에 그대로 맞는다 — 숫자 든 장 id 가 아니다.)

- [ ] **Step 5: 표 타입을 쓴다**

`database/tables/legal-documents.ts`:

```ts
import type { ColumnType, Generated } from 'kysely'

// 정본: ssworks-gise-home 006_legal_documents 장 · 약관 행 타입(publishedAt 은 DB 가 채우는 Managed 열)
// 바꾼 점: 이름은 admin-shared 계약(legalDocNo · publishedByUserNo), PK bigint.

/** 🔴 append-only — 앱은 INSERT 와 SELECT 만 한다(legal/legal-append-only.test.ts) */
export interface AdminLegalDocumentsTable {
  legalDocNo: Generated<bigint>
  /** 옵션 legal.kinds 의 값 — ascii_bin(대소문자를 가른다) */
  kind: string
  /** 마크다운 원문 — 트림하지 않은 그대로가 해시 대상이다 */
  body: string
  /** 🔴 sha256(body) hex 64자 소문자 — 서버만 셈한다 */
  contentHash: string
  /** 🔴 DB 시계 — 넣지도 고치지도 않는다(append-only 를 타입으로) */
  publishedAt: ColumnType<Date, never, never>
  /** 계정이 지워지면 null(FK ON DELETE SET NULL) */
  publishedByUserNo: bigint | null
}
```

`database/types.ts`:

- import 목록에 `import type { AdminLegalDocumentsTable } from './tables/legal-documents.js'` 를 (`guard-locks.js` 다음에) 더한다.
- 주석의 `코어 9키만` 을 `코어 10키만` 으로.
- `AdminDatabase` 의 `guardLocks: AdminGuardLocksTable` 다음 줄에 `  legalDocuments: AdminLegalDocumentsTable` 를 더한다.
- `export type { … }` 목록의 `AdminGuardLocksTable,` 다음에 `AdminLegalDocumentsTable,` 를 더한다.

`runner.ts` 의 `export type { … } from './database/types.js'` 목록에서 `AdminGuardLocksTable,` 다음에 `  AdminLegalDocumentsTable,` 를 더한다(index 는 `export * from './runner.js'` 로 그대로 낸다 — 스펙 §4-8).

- [ ] **Step 6: GREEN**

```bash
pnpm --filter @ssworks/admin-server test migrations
pnpm --filter @ssworks/admin-server test runner
pnpm --filter @ssworks/admin-server typecheck
pnpm --filter @ssworks/admin-server test:db migrations
pnpm --filter @ssworks/admin-server test:db guard-locks
pnpm lint
```

Expected: 모두 PASS(`runner-graph.test.ts` 포함 — 새 장 · 표 파일은 kysely 만 import 한다).

- [ ] **Step 7: 🔴 RED 실험**

장의 시드 리터럴 `lockName: 'legalPublish'`(up 의 것)를 `'legalPublishX'` 로 바꾸고 `pnpm --filter @ssworks/admin-server test:db guard-locks` → FAIL(상수와 리터럴이 갈림)을 본 뒤 되돌린다. 이어서 `.onDelete('set null')` 을 `.onDelete('restrict')` 로 바꾸고 `pnpm --filter @ssworks/admin-server test:db migrations` → FK 규칙 테스트 FAIL 을 본 뒤 되돌린다. 보고서에 두 명령과 실패 줄을 적는다.

- [ ] **Step 8: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/database
git add packages/admin-server/src/database packages/admin-server/src/runner.ts
git commit -m "feat(admin-server): 장 0011_legal_documents — 약관 표 · legalPublish 가드 행 · 표 타입" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 종류 옵션 · 문구 · 해시 · 주입형 파이프

**Files:**

- Create: `legal/options.ts` · `legal/options.test.ts`
- Create: `legal/errors.ts`
- Create: `legal/content-hash.ts` · `legal/content-hash.test.ts`
- Create: `legal/legal.body.ts` · `legal/legal.body.test.ts`
- Modify: `options.ts`(`legal` 옵션) · `tokens.ts`(`ADMIN_LEGAL_CONFIG`)

**Interfaces:**

- Consumes: admin-shared `adminLegalPublishSchema` · `AdminLegalPublish` · `BusinessError` · `CommonErrorCodes`, `ZodValidationPipe`(`http/pipes.ts`).
- Produces(Task 4 · 6 · 7 이 쓴다):
  - `export interface AdminLegalOptions { kinds: readonly string[] }` · `export interface ResolvedLegalConfig { readonly kinds: readonly [string, ...string[]] }` · `export function resolveLegalConfig(options: Pick<AdminServerOptions, 'legal'>, moduleName: string): ResolvedLegalConfig`(`legal/options.ts`)
  - `export const LEGAL_MESSAGES` · `legalNotFound()` · `legalRevisionConflict()` · `legalSameContent()`(`legal/errors.ts`, 모두 `BusinessError` 를 돌려준다)
  - `export function legalContentHash(body: string): string`(`legal/content-hash.ts`)
  - `export interface LegalKindQuery { kind: string }` · `LegalPublishBodyPipe`(`PipeTransform<unknown, AdminLegalPublish>`) · `LegalKindQueryPipe`(`PipeTransform<unknown, LegalKindQuery>`)(`legal/legal.body.ts`)
  - `AdminServerOptions.legal?: AdminLegalOptions` · `export const ADMIN_LEGAL_CONFIG = Symbol('ADMIN_LEGAL_CONFIG')`

- [ ] **Step 1: 단위 테스트 셋을 쓴다**

`legal/options.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveLegalConfig } from './options.js'

const resolve = (legal: unknown) => resolveLegalConfig({ legal } as never, 'AdminLegalModule')

function messageOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('던지지 않았다')
}

describe('resolveLegalConfig(2e 스펙 B14)', () => {
  it('종류를 그대로 돌려준다 — 얼려서', () => {
    const config = resolve({ kinds: ['TERMS', 'PRIVACY', 'refund_v2'] })
    expect(config.kinds).toEqual(['TERMS', 'PRIVACY', 'refund_v2'])
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.kinds)).toBe(true)
  })

  it('🔴 옵션이 없으면 기동에서 멈춘다 — 무엇을 더할지 문구에', () => {
    for (const legal of [undefined, null, 'TERMS']) {
      expect(messageOf(() => resolve(legal))).toBe(
        "AdminLegalModule 은 legal 옵션이 있어야 한다 — AdminServerModule 옵션에 legal: { kinds: ['TERMS', 'PRIVACY'] } 를 더한다.",
      )
    }
  })

  it('빈 배열 · 배열 아님', () => {
    for (const kinds of [[], undefined, 'TERMS', { 0: 'TERMS' }]) {
      expect(messageOf(() => resolve({ kinds }))).toBe(
        'AdminLegalModule 의 legal 옵션이 맞지 않다 — legal.kinds 는 비어 있지 않은 배열이어야 한다',
      )
    }
  })

  it('🔴 형식 밖(앞 공백 · 33자 · 한글 · 빈 문자열 · 문자열 아님)과 겹침을 모아 한 번에 — 32자는 된다', () => {
    const long = 'A'.repeat(33)
    const message = messageOf(() =>
      resolve({ kinds: ['TERMS', ' TERMS', long, '약관', '', 7, 'TERMS', 'B'.repeat(32)] }),
    )
    expect(message).toBe(
      'AdminLegalModule 의 legal 옵션이 맞지 않다 — ' +
        [
          `legal.kinds[1] — 영숫자 · '_' 1~32자가 아니다: " TERMS"`,
          `legal.kinds[2] — 영숫자 · '_' 1~32자가 아니다: "${long}"`,
          `legal.kinds[3] — 영숫자 · '_' 1~32자가 아니다: "약관"`,
          `legal.kinds[4] — 영숫자 · '_' 1~32자가 아니다: ""`,
          `legal.kinds[5] — 영숫자 · '_' 1~32자가 아니다: 7`,
          'legal.kinds 에 겹친 종류: TERMS',
        ].join(' / '),
    )
  })
})
```

`legal/content-hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { legalContentHash } from './content-hash.js'

const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)

describe('legalContentHash — sha256(body, utf8) hex 소문자(3e §9)', () => {
  it('알려진 벡터 — 빈 문자열 · 한글 · CRLF · LF', () => {
    expect(legalContentHash('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(legalContentHash('약관')).toBe(
      '79928e09de12ead932f6a6f7c0c2f9493f492eb419e4c3e9d4e991a851c15d21',
    )
    expect(legalContentHash(['a', 'b'].join(CRLF))).toBe(
      '18745f36a05e29072709042d6062ce54f1b08ff36c27ba80c39f81fb010c8ce2',
    )
    expect(legalContentHash(['a', 'b'].join(LF))).toBe(
      '7e18f737311b2dc3b2f269dd78396b0351f14fb66efa879f768cb23181883c78',
    )
  })

  it('🔴 트림 · 정규화하지 않는다 — 끝 공백 · 줄바꿈만 달라도 다른 해시(Review Focus 2)', () => {
    expect(legalContentHash('본문 ')).not.toBe(legalContentHash('본문'))
    expect(legalContentHash(['가', '나'].join(CRLF))).not.toBe(
      legalContentHash(['가', '나'].join(LF)),
    )
  })
})
```

`legal/legal.body.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { LegalKindQueryPipe, LegalPublishBodyPipe } from './legal.body.js'
import { resolveLegalConfig } from './options.js'

const config = resolveLegalConfig({ legal: { kinds: ['TERMS', 'PRIVACY'] } }, 'AdminLegalModule')
const publishPipe = new LegalPublishBodyPipe(config)
const queryPipe = new LegalKindQueryPipe(config)
const UNKNOWN_KIND = '잘못된 옵션: "TERMS"또는 "PRIVACY" 중 하나여야 합니다'

type Issue = { path: unknown[]; code: string; message: string }

function rejectionOf(run: () => unknown): BusinessError {
  try {
    run()
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('던지지 않았다')
}

function issuesOf(run: () => unknown): Issue[] {
  const error = rejectionOf(run)
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
  return (error.details as { issues: Issue[] }).issues
}

describe('LegalPublishBodyPipe', () => {
  it('종류는 옵션 안만 · 본문을 트림하지 않는다 · 보낸 contentHash 는 버린다(Review Focus 3)', () => {
    expect(
      publishPipe.transform({
        kind: 'PRIVACY',
        body: '  본문  ',
        baseLegalDocNo: 3n,
        contentHash: '0'.repeat(64),
      }),
    ).toEqual({ kind: 'PRIVACY', body: '  본문  ', baseLegalDocNo: 3n })
  })

  it('🔴 모르는 종류 400 issues[kind] — zod ko 열거 문구(§14 R5-3), 대소문자를 가른다', () => {
    for (const kind of ['REFUND', 'terms', '', 3]) {
      expect(
        issuesOf(() => publishPipe.transform({ kind, body: 'x', baseLegalDocNo: null })),
      ).toEqual([{ path: ['kind'], code: 'invalid_value', message: UNKNOWN_KIND }])
    }
  })

  it('본문 검증은 admin-shared 그대로 — 공백만 · 1,000,001자 · 기준 판 빠짐 · 숫자 기준 판', () => {
    expect(
      issuesOf(() => publishPipe.transform({ kind: 'TERMS', body: '   ', baseLegalDocNo: null })),
    ).toEqual([{ path: ['body'], code: 'invalid_format', message: '본문을 입력하세요.' }])
    expect(
      issuesOf(() =>
        publishPipe.transform({ kind: 'TERMS', body: 'x'.repeat(1_000_001), baseLegalDocNo: null }),
      ),
    ).toEqual([
      { path: ['body'], code: 'too_big', message: '본문은 1,000,000자를 넘을 수 없습니다.' },
    ])
    for (const body of [
      { kind: 'TERMS', body: 'x' },
      { kind: 'TERMS', body: 'x', baseLegalDocNo: 5 },
    ]) {
      expect(issuesOf(() => publishPipe.transform(body)).map((issue) => issue.path)).toEqual([
        ['baseLegalDocNo'],
      ])
    }
  })
})

describe('LegalKindQueryPipe', () => {
  it('종류 하나 — 다른 쿼리 키는 버린다', () => {
    expect(queryPipe.transform({ kind: 'TERMS', page: '2' })).toEqual({ kind: 'TERMS' })
  })

  it('🔴 빠짐 · 배열 · 모르는 값 · 소문자 400 issues[kind] — 500 이 아니다(Review Focus 4)', () => {
    for (const value of [
      {},
      { kind: ['TERMS', 'PRIVACY'] },
      { kind: 'REFUND' },
      { kind: 'terms' },
    ]) {
      expect(issuesOf(() => queryPipe.transform(value))).toEqual([
        { path: ['kind'], code: 'invalid_value', message: UNKNOWN_KIND },
      ])
    }
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test legal`
Expected: FAIL — `Failed to load url ./options.js` · `./content-hash.js` · `./legal.body.js`.

- [ ] **Step 3: 토큰 · 코어 옵션**

`tokens.ts` 끝에 더한다:

```ts
/** 내부 — 해석된 약관 설정(`ResolvedLegalConfig`). `AdminLegalModule` 이 코어 옵션의 `legal` 로 만든다(2e-2) */
export const ADMIN_LEGAL_CONFIG = Symbol('ADMIN_LEGAL_CONFIG')
```

`options.ts`:

- import 목록에 `import type { AdminLegalOptions } from './legal/options.js'` 를 (`./database/connection.js` 다음에) 더한다.
- `AdminServerOptions` 의 `timeZone?: string` 다음(인터페이스 끝)에 더한다:

```ts
  /**
   * 약관 종류 카탈로그(2e 스펙 ⑨ K1) — 예: `{ kinds: ['TERMS', 'PRIVACY'] }`. 🔴 `AdminLegalModule` 을 쓰면 필수 — 없거나
   * 종류가 비었거나 형식(영숫자 · `_` 1~32자) 밖 · 겹침이면 기동에서 멈춘다(B14). admin-ui `useLegalDocuments` 의 `kinds`
   * 와 한 상수에서 만든다.
   */
  legal?: AdminLegalOptions
```

- [ ] **Step 4: `legal/options.ts` · `errors.ts` · `content-hash.ts`**

`legal/options.ts`:

```ts
import type { AdminServerOptions } from '../options.js'

// 정본: 없음 — 2e 스펙 ⑨ K1 · B14. 네 정본은 종류를 enum 으로 박았다(gise PRIVACY · TERMS, axion TERMS · PRIVACY · REFUND).
// 🔴 기동에서 멈춘다 — 종류가 비면 발행할 수 없는 모듈이 뜨고, 형식 밖 값은 열(varchar(32) ascii_bin)에 맞지 않는다.
//    문제를 모아 한 번에 던진다(2c §5-8 과 같은 방식).

/** 코어 옵션 `legal` — `AdminLegalModule` 을 쓰면 필수 */
export interface AdminLegalOptions {
  /** 발행할 수 있는 종류 — 쓰는 쪽 카탈로그. 예: ['TERMS', 'PRIVACY']. 원소는 영숫자 · `_` 1~32자, 겹치지 않는다 */
  kinds: readonly string[]
}

export interface ResolvedLegalConfig {
  /** 검증을 지난 종류 — 하나 이상(z.enum 에 그대로 넘긴다) */
  readonly kinds: readonly [string, ...string[]]
}

const KIND = /^[A-Za-z0-9_]{1,32}$/

export function resolveLegalConfig(
  options: Pick<AdminServerOptions, 'legal'>,
  moduleName: string,
): ResolvedLegalConfig {
  const legal: unknown = options.legal
  if (typeof legal !== 'object' || legal === null) {
    throw new Error(
      `${moduleName} 은 legal 옵션이 있어야 한다 — AdminServerModule 옵션에 legal: { kinds: ['TERMS', 'PRIVACY'] } 를 더한다.`,
    )
  }
  const kinds: unknown = (legal as { kinds?: unknown }).kinds
  const problems: string[] = []
  if (!Array.isArray(kinds) || kinds.length === 0) {
    problems.push('legal.kinds 는 비어 있지 않은 배열이어야 한다')
  } else {
    const seen = new Set<string>()
    kinds.forEach((kind: unknown, index: number) => {
      if (typeof kind !== 'string' || !KIND.test(kind)) {
        problems.push(
          `legal.kinds[${index}] — 영숫자 · '_' 1~32자가 아니다: ${JSON.stringify(kind)}`,
        )
      } else if (seen.has(kind)) {
        problems.push(`legal.kinds 에 겹친 종류: ${kind}`)
      } else {
        seen.add(kind)
      }
    })
  }
  if (problems.length > 0) {
    throw new Error(`${moduleName} 의 legal 옵션이 맞지 않다 — ${problems.join(' / ')}`)
  }
  const resolved = Object.freeze([...(kinds as string[])]) as unknown as readonly [
    string,
    ...string[],
  ]
  return Object.freeze({ kinds: resolved })
}
```

`legal/errors.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'

// 정본: ssworks-gise-home apps/api/src/modules/legal/legal.service.ts(같은 본문 · 없는 문서 문구 — axion 도 같은 글자)
//       + 3e 스펙 §9(기준 판 409)
// 바꾼 점: 한 표에 모은다(teams/errors.ts 와 같은 방식). 같은 본문은 코어 ERR_COMMON_CONFLICT(axion 은 ERR_LEGAL_UNCHANGED),
//   기준 판 충돌은 ERR_COMMON_REVISION_CONFLICT — 두 정본에 없던 검사다(3e ⑤ V2).

export const LEGAL_MESSAGES = Object.freeze({
  notFound: '문서를 찾을 수 없습니다.',
  revisionConflict: '다른 관리자가 먼저 새 버전을 발행했습니다. 새로 불러온 내용을 확인하세요.',
  sameContent: '이전 버전과 내용이 같습니다.',
})

export function legalNotFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, LEGAL_MESSAGES.notFound)
}

/** 기준 판이 지금 시행본이 아니다 — 남이 먼저 발행했다(3e §9 ①) */
export function legalRevisionConflict(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    LEGAL_MESSAGES.revisionConflict,
  )
}

/** 시행본과 본문(해시)이 같다(3e §9 ②) */
export function legalSameContent(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, LEGAL_MESSAGES.sameContent)
}
```

`legal/content-hash.ts`:

```ts
import { createHash } from 'node:crypto'

// 정본: ssworks-gise-home · ssworks-axion-admin legal.service.ts(createHash('sha256').update(body, 'utf8').digest('hex'))
// 바꾼 점: 서비스에서 떼어 냈다 — 단위 테스트가 Nest 를 싣지 않게.
// 🔴 해시는 서버만 셈한다 — 클라이언트가 보낸 해시를 믿으면 동의 기록의 스냅샷을 위조할 수 있다(3e §9). 본문을 트림 ·
//    정규화하지 않는다(3e D3 — 편집기에서 받은 그대로가 해시 대상이다).

/** sha256(body, utf8) hex 소문자 64자 */
export function legalContentHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}
```

- [ ] **Step 5: `legal/legal.body.ts`**

```ts
import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import { adminLegalPublishSchema } from '@ssworks/admin-shared'
import type { AdminLegalPublish } from '@ssworks/admin-shared'
import { z } from 'zod'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_LEGAL_CONFIG } from '../tokens.js'
import type { ResolvedLegalConfig } from './options.js'

// 정본: ssworks-gise-home apps/api/src/modules/legal/admin-legal.controller.ts(legalKindQuerySchema · publishLegalDocumentSchema)
// 바꾼 점: 종류 열거가 런타임 옵션(legal.kinds)이라 주입형 파이프로 만든다(users.body.ts 와 같은 방식, 2e 스펙 B14).
//   `@Body(클래스)` · `@Query(클래스)` 로 넘기면 Nest 가 모듈 안에서 만든다 — 모듈 provider 에 적지 않는다.
// 🔴 본문은 admin-shared adminLegalPublishSchema 그대로다(본문 트림 없음 · 1,000,000자 · 공백만 거부). 해시 칸이 없다 —
//    클라이언트가 보낸 contentHash 는 zod 가 버린다(서버만 셈한다).

export interface LegalKindQuery {
  kind: string
}

@Injectable()
export class LegalPublishBodyPipe implements PipeTransform<unknown, AdminLegalPublish> {
  private readonly pipe: ZodValidationPipe<AdminLegalPublish>

  constructor(@Inject(ADMIN_LEGAL_CONFIG) config: ResolvedLegalConfig) {
    this.pipe = new ZodValidationPipe(
      adminLegalPublishSchema.extend({ kind: z.enum(config.kinds) }),
    )
  }

  transform(value: unknown): AdminLegalPublish {
    return this.pipe.transform(value)
  }
}

/** `?kind=` — 빠짐 · 배열 · 모르는 값은 400 issues[kind](§14 R5-3) */
@Injectable()
export class LegalKindQueryPipe implements PipeTransform<unknown, LegalKindQuery> {
  private readonly pipe: ZodValidationPipe<LegalKindQuery>

  constructor(@Inject(ADMIN_LEGAL_CONFIG) config: ResolvedLegalConfig) {
    this.pipe = new ZodValidationPipe(z.object({ kind: z.enum(config.kinds) }))
  }

  transform(value: unknown): LegalKindQuery {
    return this.pipe.transform(value)
  }
}
```

- [ ] **Step 6: GREEN**

```bash
pnpm --filter @ssworks/admin-server test legal
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS. `z.enum(config.kinds)` 의 타입이 맞지 않으면(zod 4 는 `readonly string[]` 를 받는다 — §14 R5-3) 원인을 보고서에 적고 `z.enum([...config.kinds] as [string, ...string[]])` 로 고친다.

- [ ] **Step 7: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/legal packages/admin-server/src/options.ts packages/admin-server/src/tokens.ts
git add packages/admin-server/src/legal packages/admin-server/src/options.ts packages/admin-server/src/tokens.ts
git commit -m "feat(admin-server): 약관 종류 옵션 검증 · 문구 · 서버 해시 · 종류 열거 파이프" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 약관 서비스 — 현재본 · 이력 · 단건 · 발행 · append-only

**Files:**

- Create: `legal/legal.service.ts`
- Create: `legal/legal.service.db.test.ts`
- Create: `legal/legal-append-only.test.ts`

**Interfaces:**

- Consumes: `GUARD_LOCK_LEGAL_PUBLISH` · `lockGuardRow`(Task 2 · 2e-1), `runQuery` · `runWriteTransaction`(`database/run.ts`), `legalContentHash` · `legalNotFound` · `legalRevisionConflict` · `legalSameContent` · `LEGAL_MESSAGES`(Task 3), `transactionOnly`(`test-support/accounts.ts`).
- Produces(Task 5 · 6 · 7 이 쓴다): `@Injectable() export class AdminLegalService`, 생성자 `(@Inject(KYSELY) db: Kysely<AdminDatabase>)`:
  - `current(kind: string): Promise<{ item: AdminLegalDocument | null }>`
  - `history(kind: string): Promise<{ items: AdminLegalHistoryItem[] }>`
  - `findOne(legalDocNo: bigint): Promise<AdminLegalDocument>` — 없으면 `legalNotFound()`
  - `publish(body: AdminLegalPublish, actorUserNo: bigint): Promise<AdminLegalPublishResult>` — `{ legalDocNo: bigint; contentHash: string }`

- [ ] **Step 1: 서비스 DB 테스트를 쓴다**

`legal/legal.service.db.test.ts`:

```ts
import {
  BusinessError,
  CommonErrorCodes,
  adminLegalCurrentSchema,
  adminLegalDocumentSchema,
  adminLegalHistorySchema,
} from '@ssworks/admin-shared'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transactionOnly } from '../test-support/accounts.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { legalContentHash } from './content-hash.js'
import { LEGAL_MESSAGES } from './errors.js'
import { AdminLegalService } from './legal.service.js'

// 약관 서비스(2e 스펙 §5-7 · §9-3 [2]) — 종류 검증은 파이프 몫이라 서비스는 아무 문자열이나 받는다. 테스트마다 고유한 종류
// 문자열(svc_…)을 써서 앞 테스트의 판에 기대지 않는다.

const REVISION = CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT
const CONFLICT = CommonErrorCodes.ERR_COMMON_CONFLICT
const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)

let t: TestDatabase
let service: AdminLegalService
let actor: SeededUser
let role: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminLegalService(t.db)
  role = await seedRole(t.db, { roleName: '약관 서비스', permissions: [] })
  actor = await seedUser(t.db, { roleNo: role, userId: 'legal-actor', userName: '약관 담당' })
})

afterAll(async () => {
  await t?.drop()
})

const publishAs = (kind: string, body: string, baseLegalDocNo: bigint | null) =>
  service.publish({ kind, body, baseLegalDocNo }, actor.userNo)

/** 🔴 publishedAt 은 Kysely 로 넣을 수 없다(ColumnType<Date, never, never>) — 같은 초 시드는 원시 SQL(snake_case) */
async function seedAt(kind: string, body: string, publishedAt: string): Promise<bigint> {
  const result = await sql`
    insert into legal_documents (kind, body, content_hash, published_at, published_by_user_no)
    values (${kind}, ${body}, ${legalContentHash(body)}, ${publishedAt}, null)
  `.execute(t.db)
  return result.insertId as bigint
}

describe('읽기', () => {
  it('미발행이면 현재본 { item: null } · 이력 { items: [] }(3e D15)', async () => {
    expect(await service.current('svc_none')).toEqual({ item: null })
    expect(await service.history('svc_none')).toEqual({ items: [] })
  })

  it('발행 → 현재본 · 이력 · 단건 — 해시는 서버가 셈하고 publishedAt 은 ISO, 발행자 이름은 조인', async () => {
    const kind = 'svc_flow'
    const first = await publishAs(kind, '첫 판', null)
    expect(first.contentHash).toBe(legalContentHash('첫 판'))
    const current = await service.current(kind)
    expect(adminLegalCurrentSchema.parse(current)).toEqual(current)
    expect(current.item).toEqual({
      legalDocNo: first.legalDocNo,
      kind,
      body: '첫 판',
      contentHash: first.contentHash,
      publishedAt: current.item?.publishedAt,
      publishedByUserNo: actor.userNo,
      publishedByUserName: '약관 담당',
    })
    expect(new Date(current.item?.publishedAt ?? '').toISOString()).toBe(current.item?.publishedAt)

    const second = await publishAs(kind, '둘째 판', first.legalDocNo)
    expect((await service.current(kind)).item?.legalDocNo).toBe(second.legalDocNo)
    const history = await service.history(kind)
    expect(adminLegalHistorySchema.parse(history)).toEqual(history)
    expect(history.items.map((item) => item.legalDocNo)).toEqual([
      second.legalDocNo,
      first.legalDocNo,
    ])
    // 🔴 이력에 본문이 없다 — 목록이 문서 전량을 끌어오지 않게
    for (const item of history.items) expect(Object.keys(item)).not.toContain('body')
    const one = await service.findOne(first.legalDocNo)
    expect(adminLegalDocumentSchema.parse(one)).toEqual(one)
    expect(one).toMatchObject({ legalDocNo: first.legalDocNo, body: '첫 판' })
  })

  it('없는 번호 404 ERR_COMMON_NOT_FOUND', async () => {
    await expect(service.findOne(999_999_999n)).rejects.toMatchObject({
      code: CommonErrorCodes.ERR_COMMON_NOT_FOUND,
      message: LEGAL_MESSAGES.notFound,
    })
  })

  it('🔴 같은 초 두 판은 번호가 큰 쪽이 현재본 — publishedAt 이 먼저다(이력 · 발행 기준도 같은 두 키, gise 🔴)', async () => {
    const kind = 'svc_same_second'
    const a = await seedAt(kind, '같은 초 A', '2026-01-01 00:00:05')
    const b = await seedAt(kind, '같은 초 B', '2026-01-01 00:00:05')
    const late = await seedAt(kind, '큰 번호 · 이른 시각', '2026-01-01 00:00:00')
    const { item } = await service.current(kind)
    expect(item?.legalDocNo).toBe(b)
    expect(item?.publishedAt).toBe('2026-01-01T00:00:05.000Z')
    expect((await service.history(kind)).items.map((row) => row.legalDocNo)).toEqual([b, a, late])
    await expect(publishAs(kind, '새 판', late)).rejects.toMatchObject({ code: REVISION })
    const next = await publishAs(kind, '새 판', b)
    expect((await service.current(kind)).item?.legalDocNo).toBe(next.legalDocNo)
  })

  it('발행자 계정을 지워도 이력이 남는다 — publishedByUserNo · 이름 null(FK SET NULL)', async () => {
    const kind = 'svc_gone'
    const gone = await seedUser(t.db, { roleNo: role, userId: 'legal-gone', userName: '떠난 사람' })
    const { legalDocNo } = await service.publish(
      { kind, body: '떠나기 전 판', baseLegalDocNo: null },
      gone.userNo,
    )
    expect((await service.current(kind)).item?.publishedByUserName).toBe('떠난 사람')
    await t.db.deleteFrom('users').where('userNo', '=', gone.userNo).execute()
    expect((await service.history(kind)).items).toEqual([
      expect.objectContaining({ legalDocNo, publishedByUserNo: null, publishedByUserName: null }),
    ])
    expect(await service.findOne(legalDocNo)).toMatchObject({
      body: '떠나기 전 판',
      publishedByUserNo: null,
      publishedByUserName: null,
    })
  })
})

describe('발행', () => {
  it('🔴 시행본과 같은 본문 409 ERR_COMMON_CONFLICT — 옛 판과 같은 본문(되돌리기)은 된다(Review Focus 5)', async () => {
    const kind = 'svc_same'
    const v1 = await publishAs(kind, '본문 A', null)
    await expect(publishAs(kind, '본문 A', v1.legalDocNo)).rejects.toMatchObject({
      code: CONFLICT,
      message: LEGAL_MESSAGES.sameContent,
    })
    const v2 = await publishAs(kind, '본문 B', v1.legalDocNo)
    const v3 = await publishAs(kind, '본문 A', v2.legalDocNo)
    expect(v3.contentHash).toBe(v1.contentHash)
    expect((await service.history(kind)).items).toHaveLength(3)
  })

  it('🔴 끝 공백 · 줄바꿈만 다른 본문은 다른 판이다 — 트림 · 정규화하지 않는다(Review Focus 2)', async () => {
    const kind = 'svc_ws'
    const lf = ['첫 줄', '둘째 줄'].join(LF)
    const crlf = ['첫 줄', '둘째 줄'].join(CRLF)
    const v1 = await publishAs(kind, lf, null)
    const v2 = await publishAs(kind, crlf, v1.legalDocNo)
    const v3 = await publishAs(kind, `${crlf} `, v2.legalDocNo)
    expect(new Set([v1.contentHash, v2.contentHash, v3.contentHash]).size).toBe(3)
    expect((await service.findOne(v3.legalDocNo)).body).toBe(`${crlf} `)
  })

  it('🔴 낡은 기준 409 ERR_COMMON_REVISION_CONFLICT — 같은 본문이어도 기준 판 검사가 먼저(3e §9)', async () => {
    const kind = 'svc_stale'
    await expect(publishAs(kind, '첫 판', 999n)).rejects.toMatchObject({
      code: REVISION,
      message: LEGAL_MESSAGES.revisionConflict,
    })
    const v1 = await publishAs(kind, '첫 판', null)
    const v2 = await publishAs(kind, '둘째 판', v1.legalDocNo)
    // 시행본(둘째 판)과 같은 본문 + 낡은 기준 — CONFLICT 가 아니라 REVISION_CONFLICT
    await expect(publishAs(kind, '둘째 판', v1.legalDocNo)).rejects.toMatchObject({
      code: REVISION,
    })
    await expect(publishAs(kind, '셋째 판', null)).rejects.toMatchObject({ code: REVISION })
    expect((await service.history(kind)).items.map((item) => item.legalDocNo)).toEqual([
      v2.legalDocNo,
      v1.legalDocNo,
    ])
  })

  it('종류마다 따로 — 기준 판도 종류별이고, 다른 종류에는 같은 본문을 낼 수 있다', async () => {
    const termsLike = await publishAs('svc_kind_a', '공통 본문', null)
    const privacyLike = await publishAs('svc_kind_b', '공통 본문', null)
    expect(privacyLike.contentHash).toBe(termsLike.contentHash)
    await expect(publishAs('svc_kind_b', '다른 본문', termsLike.legalDocNo)).rejects.toMatchObject({
      code: REVISION,
    })
    expect((await service.current('svc_kind_a')).item?.legalDocNo).toBe(termsLike.legalDocNo)
  })

  it('mediumtext — 1,000,000자 한글 본문이 같게 왕복하고 해시가 맞다(Review Focus 1)', async () => {
    const body = '가'.repeat(1_000_000)
    const { legalDocNo, contentHash } = await publishAs('svc_big', body, null)
    const one = await service.findOne(legalDocNo)
    expect(one.body.length).toBe(1_000_000)
    expect(one.body === body).toBe(true)
    expect(contentHash).toBe(legalContentHash(body))
  })

  it('🔴 발행은 트랜잭션 밖에서 쿼리를 시작하지 않는다 — 검사와 쓰기가 한 트랜잭션(gise 는 밖이었다)', async () => {
    const inside = new AdminLegalService(transactionOnly(t.db))
    const result = await inside.publish(
      { kind: 'svc_trx', body: '트랜잭션 판', baseLegalDocNo: null },
      actor.userNo,
    )
    expect(result.contentHash).toBe(legalContentHash('트랜잭션 판'))
  })

  it('실패는 BusinessError 로 — 드라이버 오류가 아니다', async () => {
    const error = await publishAs('svc_err', '본문', 1n).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BusinessError)
  })
})
```

`legal/legal-append-only.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 정본: ssworks-gise-home apps/api/test/legal/legal-append-only.test.ts(소스 텍스트 게이트 · 여는 괄호까지만 비교)
// 바꾼 점: 이 패키지는 테스트가 src 안에 있다 — `*.test.ts` · test-support 를 뺀다(이 파일 자신이 찾는 글자를 담는다). 원시
//   SQL(`update legal_documents` · `delete from legal_documents`)도 찾고, 대소문자를 무시한다.
// 🔴 legalDocuments 는 append-only 다(2e 스펙 공통 11) — 동의한 문서가 사후에 바뀌면 동의 기록의 증거 능력이 사라진다.
//    실행 결과가 아니라 코드 존재 자체를 잠근다. 장 폴더는 뺀다 — down() 의 dropTable 은 마이그레이션 CLI 의 스키마
//    롤백이지 요청 경로의 행 변형이 아니다(gise).

const SRC = fileURLToPath(new URL('../', import.meta.url))
const MIGRATIONS = join('database', 'migrations') + sep
const TEST_SUPPORT = 'test-support' + sep
const FORBIDDEN = [
  "updateTable('legalDocuments",
  "deleteFrom('legalDocuments",
  'update legal_documents',
  'delete from legal_documents',
]

function sources(): { path: string; content: string }[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter(
      (entry) =>
        entry.endsWith('.ts') &&
        !entry.endsWith('.test.ts') &&
        !entry.startsWith(MIGRATIONS) &&
        !entry.startsWith(TEST_SUPPORT),
    )
    .map((entry) => ({ path: entry, content: readFileSync(join(SRC, entry), 'utf8') }))
}

describe('약관 append-only 정적 검사(2e 스펙 공통 11)', () => {
  it('🔴 legalDocuments 에 UPDATE · DELETE 경로가 없다', () => {
    const found = sources()
    // 🔴 빈 목록은 공허하게 통과한다 — 약관 서비스를 실제로 읽었는지 함께 본다
    expect(found.map((source) => source.path)).toContain(join('legal', 'legal.service.ts'))
    for (const { path, content } of found) {
      const lower = content.toLowerCase()
      for (const pattern of FORBIDDEN) {
        expect(lower.includes(pattern.toLowerCase()), `${path} 에 ${pattern}`).toBe(false)
      }
    }
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

```bash
pnpm --filter @ssworks/admin-server test append-only
pnpm --filter @ssworks/admin-server test:db legal.service
```

Expected: 정적 검사 FAIL — `expected [ … ] to include 'legal/legal.service.ts'`(Windows 는 `legal\legal.service.ts`). DB 는 `Failed to load url ./legal.service.js`.

- [ ] **Step 3: 서비스를 쓴다**

`legal/legal.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import type {
  AdminLegalDocument,
  AdminLegalHistoryItem,
  AdminLegalPublish,
  AdminLegalPublishResult,
} from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { GUARD_LOCK_LEGAL_PUBLISH, lockGuardRow } from '../database/guard-locks.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import { legalContentHash } from './content-hash.js'
import { legalNotFound, legalRevisionConflict, legalSameContent } from './errors.js'

// 정본: ssworks-gise-home apps/api/src/modules/legal/legal.service.ts · legal.repository.ts(두 정렬 키 · LEFT JOIN · 이력
//       본문 제외 · toISOString · 같은 본문 409) + ssworks-axion-admin legal.service.ts(발행 응답 { legalDocNo, contentHash })
// 바꾼 점:
//  - 미발행 현재본은 404 가 아니라 { item: null }(3e D15 — 두 정본은 404). 단건은 문서 그대로(3e §9).
//  - 🔴 발행은 한 트랜잭션이다 — guardLocks 행 legalPublish 가 첫 문장(⑩ L1), 시행본 잠금 읽기(B15), 기준 판 검사(3e ⑤ V2 —
//    두 정본에 없었다) → 같은 본문 검사 → INSERT. gise 는 트랜잭션 없이 검사 · 삽입이라 동시 발행 둘이 모두 들어갔다.
//  - 리포지토리 층을 두지 않는다(팀 · 역할 서비스와 같은 모양) — 테이블 교체 지점이 필요 없다.
// 🔴 append-only — 수정 · 삭제 메서드를 만들지 않는다(legal-append-only.test.ts 가 소스 전체를 본다).
// 🔴 시행본 = 종류별 (publishedAt DESC, legalDocNo DESC) 첫 행. publishedAt 은 초 단위라 같은 초 발행이 실제로 난다 — 두 키 중
//    하나라도 빠지면 "현재본" 이 요청마다 달라진다(gise). 현재본 · 이력 · 발행의 읽기가 같은 두 키다.

type HistoryRow = {
  legalDocNo: bigint
  kind: string
  contentHash: string
  publishedAt: Date
  publishedByUserNo: bigint | null
  publishedByUserName: string | null
}

type DocumentRow = HistoryRow & { body: string }

@Injectable()
export class AdminLegalService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  /** 시행본 — 미발행이면 { item: null }(3e D15) */
  async current(kind: string): Promise<{ item: AdminLegalDocument | null }> {
    const row = await runQuery(() =>
      this.documents()
        .select('d.body')
        .where('d.kind', '=', kind)
        .orderBy('d.publishedAt', 'desc')
        .orderBy('d.legalDocNo', 'desc')
        .limit(1)
        .executeTakeFirst(),
    )
    return { item: row === undefined ? null : toDocument(row) }
  }

  /** 발행 이력 최신순 전량 — 🔴 본문 없음(목록이 문서 전량을 끌어오지 않게. 발행은 드물어 페이지가 없다 — 3e §9) */
  async history(kind: string): Promise<{ items: AdminLegalHistoryItem[] }> {
    const rows = await runQuery(() =>
      this.documents()
        .where('d.kind', '=', kind)
        .orderBy('d.publishedAt', 'desc')
        .orderBy('d.legalDocNo', 'desc')
        .execute(),
    )
    return { items: rows.map(toHistoryItem) }
  }

  /** 판 하나(본문 포함) — 옛 판도 */
  async findOne(legalDocNo: bigint): Promise<AdminLegalDocument> {
    const row = await runQuery(() =>
      this.documents().select('d.body').where('d.legalDocNo', '=', legalDocNo).executeTakeFirst(),
    )
    if (row === undefined) throw legalNotFound()
    return toDocument(row)
  }

  /**
   * 새 판을 낸다 — 기준 판이 지금 시행본이 아니면 409 REVISION_CONFLICT, 시행본과 본문이 같으면 409 CONFLICT(3e §9 의 순서).
   * 🔴 해시는 서버만 셈한다 — 클라이언트 해시를 믿으면 동의 기록의 스냅샷을 위조할 수 있다.
   */
  async publish(body: AdminLegalPublish, actorUserNo: bigint): Promise<AdminLegalPublishResult> {
    // 트랜잭션 밖에서 — 1,000,000자 본문의 sha256 이 가드를 쥔 채 돌지 않게
    const contentHash = legalContentHash(body.body)
    return runWriteTransaction(this.db, async (trx) => {
      // 🔴 첫 문장(⑩ L1) — 같은 종류 동시 발행을 한 줄로 세운다. 앞에 비잠금 SELECT 를 두면 읽기 뷰가 먼저 열려 스냅샷 격리
      //    ON 에서 INSERT 의 FK 검사(발행자 users 행)가 1020 을 만난다(§14 R5-5). 가드가 없으면 진 쪽이 기준 판 409 가 아니라
      //    교착 409 가 된다(§14 R5-1).
      await lockGuardRow(trx, GUARD_LOCK_LEGAL_PUBLISH)
      // 🔴 잠금 읽기(B15) — 가드 아래라 비잠금이어도 최신이지만, 비잠금 읽기는 읽기 뷰를 열어 위 1020 의 길을 낸다
      const current = await trx
        .selectFrom('legalDocuments')
        .select(['legalDocNo', 'contentHash'])
        .where('kind', '=', body.kind)
        .orderBy('publishedAt', 'desc')
        .orderBy('legalDocNo', 'desc')
        .limit(1)
        .forUpdate()
        .executeTakeFirst()
      // 🔴 기준 판이 먼저 — 남이 먼저 발행한 것이 진짜 원인이다(3e §9). 같은 본문이어도 낡은 기준이면 REVISION_CONFLICT
      if ((current?.legalDocNo ?? null) !== body.baseLegalDocNo) throw legalRevisionConflict()
      if (current?.contentHash === contentHash) throw legalSameContent()
      const inserted = await trx
        .insertInto('legalDocuments')
        .values({
          kind: body.kind,
          body: body.body,
          contentHash,
          publishedByUserNo: actorUserNo,
        })
        .executeTakeFirstOrThrow()
      const legalDocNo = inserted.insertId
      if (legalDocNo === undefined) {
        throw new Error('legalDocuments INSERT 가 insertId 를 돌려주지 않았다.')
      }
      return { legalDocNo, contentHash }
    })
  }

  /**
   * 발행자 이름은 users 조인으로 파생한다 — 🔴 LEFT JOIN(발행자 SET NULL 이면 이름도 null). INNER 면 지운 계정이 낸 판이
   * 이력에서 통째로 사라진다(gise — axion 은 NOT NULL 이라 INNER 였다).
   */
  private documents() {
    return this.db
      .selectFrom('legalDocuments as d')
      .leftJoin('users as u', 'u.userNo', 'd.publishedByUserNo')
      .select([
        'd.legalDocNo',
        'd.kind',
        'd.contentHash',
        'd.publishedAt',
        'd.publishedByUserNo',
        'u.userName as publishedByUserName',
      ])
  }
}

function toHistoryItem(row: HistoryRow): AdminLegalHistoryItem {
  return {
    legalDocNo: row.legalDocNo,
    kind: row.kind,
    contentHash: row.contentHash,
    // 🔴 계약은 ISO 문자열이다(B16 — gise). 변환은 서비스 경계에서 한다
    publishedAt: row.publishedAt.toISOString(),
    publishedByUserNo: row.publishedByUserNo,
    publishedByUserName: row.publishedByUserName ?? null,
  }
}

function toDocument(row: DocumentRow): AdminLegalDocument {
  return { ...toHistoryItem(row), body: row.body }
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm --filter @ssworks/admin-server test append-only
pnpm --filter @ssworks/admin-server test:db legal.service
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
```

Expected: PASS. (실 DB 테스트의 1,000,000자 본문은 몇 초 걸릴 수 있다 — 20초 한도 안이다. 넘으면 그 `it` 에만 한도를 주고 보고서에 적는다.)

- [ ] **Step 5: 🔴 RED 실험**

① `legal.service.ts` 의 `publish` 에서 검사 두 줄의 순서를 바꿔(같은 해시 검사를 기준 판 검사 앞으로) `pnpm --filter @ssworks/admin-server test:db legal.service` → "낡은 기준 … 같은 본문이어도 기준 판 검사가 먼저" FAIL(`ERR_COMMON_CONFLICT` 가 나온다)을 보고 되돌린다.
② `current` 의 `.orderBy('d.legalDocNo', 'desc')` 한 줄을 지우고 같은 명령 → "같은 초 두 판" FAIL 을 보고 되돌린다. (MariaDB 가 같은 초 두 행을 우연히 큰 번호 먼저 낼 수 있다 — 그러면 RED 가 안 보인다. 보이지 않으면 그 사실을 적는다.)
③ `legal.service.ts` 의 클래스 아래에 주석 한 줄 `// updateTable('legalDocuments')` 를 더하고 `pnpm --filter @ssworks/admin-server test append-only` → FAIL 을 보고 지운다.
보고서에 명령과 실패 줄을 적는다.

- [ ] **Step 6: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/legal
git add packages/admin-server/src/legal
git commit -m "feat(admin-server): 약관 서비스 — 현재본 null · 이력 · 단건 · 가드 아래 발행(기준 판 → 같은 본문) · append-only 정적 검사" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 경합 — 가드 직접 관찰 · 동시 발행 · 스냅샷 FK

**Files:**

- Create: `legal/legal.guard.db.test.ts`
- Create: `legal/legal.race.db.test.ts`

**Interfaces:**

- Consumes: `AdminLegalService`(Task 4), `legalContentHash`(Task 3), `whileHeld` · `settle` · `snapshotKysely` · `lockWaitsIn` · `sleep` · `Settled`(`test-support/concurrency.ts`), `seedRole` · `seedUser`.
- Produces: 없음(테스트만). 이 Task 는 구현을 바꾸지 않는다 — Task 4 뒤라 GREEN 으로 시작하고, RED 는 Step 3 의 실험으로 본다.

**RED 예측 대조(스펙 §14 R5-1 — 원시 연결이 쥔 행이 RED 를 가리지 않는가):**

| 테스트                    | 원시 연결이 쥔 것                       | 서비스가 그 행을 정당하게 기다리나                       | 실험                                 | 예측                                                                                                                                                                   |
| ------------------------- | --------------------------------------- | -------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| guard "가드를 잡는다"     | `guard_locks` 행 `legalPublish`         | 예 — 그것이 재는 대상이다                                | `lockGuardRow` 줄을 뺀다             | 대기 없음 → `waited` false → RED(결정적 — 다른 행을 쥐지 않으므로 가려지지 않는다)                                                                                     |
| race (r1) · (r2) OFF · ON | 발행자 `users` 행(FOR UPDATE)           | 예 — INSERT 의 FK S. 두 발행을 INSERT 앞에 맞추려고 쥔다 | 가드 + `forUpdate` 를 함께 뺀다      | 두 시행본 읽기가 비잠금 → 둘 다 INSERT → `['ok', 'ok']` → RED(결정적)                                                                                                  |
| race (r1) · (r2)          | 〃                                      | 〃                                                       | 가드만 뺀다                          | 둘째의 잠금 읽기가 첫째의 행에서 기다리는 사이 첫째의 INSERT → 교착 1213 → `ERR_COMMON_CONFLICT` → RED. 그대로 `REVISION_CONFLICT` 가 나오면 가린 것이니 관찰을 적는다 |
| snapshot (s1) ON          | 발행자 `users` 행(UPDATE — 값을 바꾼다) | 예 — INSERT 의 FK S                                      | 시행본 읽기의 `.forUpdate()` 만 뺀다 | 비잠금 읽기가 읽기 뷰를 연 뒤 원시 연결이 커밋 → FK 검사 1020 → 409 `ERR_COMMON_CONFLICT` → RED(§14 R5-5)                                                              |

- [ ] **Step 1: 가드 직접 관찰 테스트를 쓴다**

`legal/legal.guard.db.test.ts`:

```ts
import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { lockWaitsIn, settle, sleep, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { AdminLegalService } from './legal.service.js'

// 🔴 발행이 guardLocks 행 legalPublish 를 잡는지 직접 잰다(2e 스펙 ⑩ L1). 동시 발행 테스트(legal.race)는 시행본 행 잠금 ·
//    교착이 진 쪽을 409 로 끝내 가드가 빠져도 409 하나는 남는다(§14 R5-1) — 여기서는 원시 연결이 가드 행 하나만 쥐므로, 발행이
//    잠금 대기에 들어가는 것은 가드를 잡으려 했다는 뜻이다(2e-1 teams.guard 와 같은 모양).

let t: TestDatabase
let service: AdminLegalService
let actor: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminLegalService(t.db)
  const role = await seedRole(t.db, { roleName: '약관 가드', permissions: [] })
  actor = (await seedUser(t.db, { roleNo: role, userId: 'legal-guard' })).userNo
})

afterAll(async () => {
  await t?.drop()
})

/** 원시 연결이 가드 행만 쥔 채 run 을 시작한다 — run 이 잠금 대기에 들어갔는지(waited)와 풀린 뒤의 결과 */
async function underHeldGuard<T>(
  run: () => Promise<T>,
): Promise<{ waited: boolean; result: Settled<T> }> {
  const open = () => createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
  const holder = await open()
  const observer = await open()
  try {
    await holder.beginTransaction()
    await holder.query(
      "select lock_name from guard_locks where lock_name = 'legalPublish' for update",
    )
    let finished = false
    const pending = settle(run()).then((result) => {
      finished = true
      return result
    })
    let waited = false
    for (let i = 0; i < 100 && !finished && !waited; i += 1) {
      waited = (await lockWaitsIn(observer, t.name)) > 0
      if (!waited) await sleep(25)
    }
    await holder.commit()
    return { waited, result: await pending }
  } finally {
    await holder.rollback().catch(() => undefined)
    await holder.end()
    await observer.end()
  }
}

describe('🔴 발행은 가드 행 legalPublish 를 잡는다(⑩ L1)', () => {
  it('첫 발행 · 다음 발행 — 가드를 쥔 동안 잠금 대기에 들어가고, 풀리면 성공한다', async () => {
    const kind = 'guard_kind'
    const first = await underHeldGuard(() =>
      service.publish({ kind, body: '첫 판', baseLegalDocNo: null }, actor),
    )
    expect(first.waited).toBe(true)
    if (!first.result.ok) throw first.result.error
    const firstNo = first.result.value.legalDocNo
    const next = await underHeldGuard(() =>
      service.publish({ kind, body: '둘째 판', baseLegalDocNo: firstNo }, actor),
    )
    expect(next.waited).toBe(true)
    if (!next.result.ok) throw next.result.error
  })

  it('읽기 셋은 가드를 잡지 않는다 — 가드를 쥔 동안에도 기다리지 않고 끝난다', async () => {
    const kind = 'guard_read'
    const { legalDocNo } = await service.publish(
      { kind, body: '읽기 판', baseLegalDocNo: null },
      actor,
    )
    const reads: [string, () => Promise<unknown>][] = [
      ['current', () => service.current(kind)],
      ['history', () => service.history(kind)],
      ['findOne', () => service.findOne(legalDocNo)],
    ]
    for (const [name, read] of reads) {
      const { waited, result } = await underHeldGuard(read)
      expect(waited, name).toBe(false)
      if (!result.ok) throw result.error
    }
  })
})
```

- [ ] **Step 2: 동시 발행 · 스냅샷 테스트를 쓴다**

`legal/legal.race.db.test.ts`:

```ts
import { BusinessError } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdminDatabase } from '../database/types.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { settle, snapshotKysely, whileHeld, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { legalContentHash } from './content-hash.js'
import { AdminLegalService } from './legal.service.js'

// 🔴 같은 종류 동시 발행(2e 스펙 ⑩ L1 · B15 · §14 R5). 원시 연결이 발행자 users 행을 X 로 쥔 채 두 발행을 시작한다 — INSERT
//    의 FK 검사(발행자 행 S 잠금)가 거기서 기다리므로, 가드가 없으면 두 시행본 읽기가 서로의 INSERT 앞에 놓인다(R5-1 의
//    "읽기 둘이 INSERT 앞" 순서). 가드가 있으면 둘째는 가드에서 기다린다 — 대기 둘을 본 뒤 커밋한다.
// 🔴 가드가 빠져도 진 쪽 409 는 남는다(교착 1213 → ERR_COMMON_CONFLICT) — 코드가 REVISION_CONFLICT 인지까지 잰다. 가드를
//    잡는지는 legal.guard 가 직접 잰다.

let t: TestDatabase
let actor: SeededUser
let renamed: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, { roleName: '약관 경합', permissions: [] })
  actor = await seedUser(t.db, { roleNo: role, userId: 'legal-race' })
  renamed = await seedUser(t.db, { roleNo: role, userId: 'legal-s1' })
})

afterAll(async () => {
  await t?.drop()
})

/** 발행자 users 행을 X 로 쥔다 — 발행 INSERT 의 FK 검사(S)가 여기서 기다린다 */
const holdPublisher = (userNo: bigint) => (connection: Connection) =>
  connection.query('select user_no from users where user_no = ? for update', [userNo])

const codeOf = (result: Settled<unknown>): string =>
  result.ok
    ? 'ok'
    : result.error instanceof BusinessError
      ? result.error.code
      : String(result.error)

async function rowCount(db: Kysely<AdminDatabase>, kind: string): Promise<number> {
  const rows = await db
    .selectFrom('legalDocuments')
    .select('legalDocNo')
    .where('kind', '=', kind)
    .execute()
  return rows.length
}

describe.each([false, true])('🔴 같은 종류 동시 발행 — 스냅샷 격리 %s', (snapshot) => {
  let db: Kysely<AdminDatabase>
  let service: AdminLegalService
  const suffix = snapshot ? 'on' : 'off'

  beforeAll(async () => {
    db = await snapshotKysely(t, snapshot)
    service = new AdminLegalService(db)
  })

  afterAll(async () => {
    await db?.destroy()
  })

  const publishBoth = (kind: string, base: bigint | null) => () =>
    Promise.all([
      settle(service.publish({ kind, body: 'A 판', baseLegalDocNo: base }, actor.userNo)),
      settle(service.publish({ kind, body: 'B 판', baseLegalDocNo: base }, actor.userNo)),
    ])

  it('(r1) 같은 기준 판 둘 — 하나는 발행, 하나는 409 ERR_COMMON_REVISION_CONFLICT', async () => {
    const kind = `race_r1_${suffix}`
    const first = await service.publish({ kind, body: '첫 판', baseLegalDocNo: null }, actor.userNo)
    const outcome = await whileHeld(
      t,
      holdPublisher(actor.userNo),
      publishBoth(kind, first.legalDocNo),
      { waiters: 2 },
    )
    if (!outcome.ok) throw outcome.error
    expect(outcome.value.map(codeOf).sort()).toEqual(['ERR_COMMON_REVISION_CONFLICT', 'ok'])
    expect(await rowCount(db, kind)).toBe(2)
  })

  it('(r2) 첫 발행 둘(baseLegalDocNo: null) — 같다', async () => {
    const kind = `race_r2_${suffix}`
    const outcome = await whileHeld(t, holdPublisher(actor.userNo), publishBoth(kind, null), {
      waiters: 2,
    })
    if (!outcome.ok) throw outcome.error
    expect(outcome.value.map(codeOf).sort()).toEqual(['ERR_COMMON_REVISION_CONFLICT', 'ok'])
    expect(await rowCount(db, kind)).toBe(1)
  })
})

describe('🔴 스냅샷 격리 ON — 발행 중에 발행자 행이 바뀌어도(B15 · §14 R5-5)', () => {
  it('(s1) 원시 연결이 발행자 users 행을 바꾼 채 → 발행이 FK 검사에서 기다렸다가 성공한다(1020 없음)', async () => {
    const db = await snapshotKysely(t, true)
    try {
      const service = new AdminLegalService(db)
      const kind = 'race_s1'
      const first = await service.publish(
        { kind, body: '첫 판', baseLegalDocNo: null },
        renamed.userNo,
      )
      const outcome = await whileHeld(
        t,
        (connection) =>
          connection.query('update users set user_name = ? where user_no = ?', [
            '바뀐 이름',
            renamed.userNo,
          ]),
        () =>
          service.publish(
            { kind, body: '둘째 판', baseLegalDocNo: first.legalDocNo },
            renamed.userNo,
          ),
      )
      if (!outcome.ok) throw outcome.error
      expect(outcome.value.contentHash).toBe(legalContentHash('둘째 판'))
      expect(await rowCount(db, kind)).toBe(2)
    } finally {
      await db.destroy()
    }
  })
})
```

- [ ] **Step 3: GREEN · 🔴 RED 실험**

```bash
pnpm --filter @ssworks/admin-server test:db legal.guard
pnpm --filter @ssworks/admin-server test:db legal.race
```

Expected: 둘 다 PASS(구현은 Task 4 에서 끝났다).

그다음 위 "RED 예측 대조" 표의 실험 넷을 차례로 한다 — 매번 `legal.service.ts` 의 해당 줄을 바꾸고, 해당 파일을 돌리고, 결과를 적고, 되돌린다.

1. `await lockGuardRow(trx, GUARD_LOCK_LEGAL_PUBLISH)` 줄을 주석으로 → `test:db legal.guard` → "첫 발행 · 다음 발행" FAIL(`waited` false).
2. 같은 줄을 주석으로 둔 채 `test:db legal.race` → (r1) · (r2) 가 OFF · ON 모두 `['ERR_COMMON_CONFLICT', 'ok']` 로 FAIL 할 것으로 본다. `REVISION_CONFLICT` 로 통과하는 갈래가 있으면 그 갈래와 관찰을 적는다(가린 것).
3. 가드 줄과 시행본 읽기의 `.forUpdate()` 를 함께 빼고 `test:db legal.race` → (r1) · (r2) 가 `['ok', 'ok']` 와 행 수 3 · 2 로 FAIL.
4. 가드는 두고 `.forUpdate()` 만 빼고 `test:db legal.race` → (s1) 이 409 `ERR_COMMON_CONFLICT`(1020)로 FAIL. (r1) · (r2) 는 통과할 수 있다(가드가 줄을 세운다 — 2e 스펙 §14 R5-1 의 "가드 + 비잠금 읽기").

마지막에 `git diff packages/admin-server/src/legal/legal.service.ts` 가 비었는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/legal/legal.guard.db.test.ts packages/admin-server/src/legal/legal.race.db.test.ts
pnpm lint
git add packages/admin-server/src/legal/legal.guard.db.test.ts packages/admin-server/src/legal/legal.race.db.test.ts
git commit -m "test(admin-server): 약관 발행 경합 — 가드 직접 관찰 · 동시 발행 OFF · ON · 스냅샷 FK 1020" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 컨트롤러 네 라우트 · `AdminLegalModule` · 슬롯 둘 · 배선

**Files:**

- Modify: `auth/permission-slots.ts` · `auth/permission-slots.test.ts`
- Create: `legal/legal.controller.ts` · `legal/legal.module.ts` · `legal/legal.module.test.ts`
- Modify: `admin-server.module.ts`(`ADMIN_ROUTE_MODULES`) · `index.ts`
- Modify: `test-support/accounts.ts`(`TEST_CATALOG`) · `test-support/admin-app.ts`

**Interfaces:**

- Consumes: `AdminLegalService`(Task 4), `LegalPublishBodyPipe` · `LegalKindQueryPipe` · `LegalKindQuery` · `resolveLegalConfig` · `ADMIN_LEGAL_CONFIG`(Task 3), `CoreAuditActions.LEGAL_PUBLISH` · `CoreAuditTargets.LEGAL_DOCUMENT`(Task 1), `assertAuthModuleRegistered` · `assertPermissionSlots` · `RequirePermissionSlot` · `CurrentAdmin` · `Audit` · `attachAuditTarget` · `attachAuditMeta` · `ParseBigIntPipe`.
- Produces(Task 7 · 8 이 쓴다):
  - `AdminPermissionSlot` 에 `'legal.read'` · `'legal.publish'`, `ADMIN_PERMISSION_SLOTS` 열하나.
  - `export class AdminLegalModule`(index 에서 낸다) · `export type { AdminLegalOptions }`(index).
  - 테스트 앱: `TEST_PERMISSIONS['legal.read'] = 'setting.legal:read'` · `['legal.publish'] = 'setting.legal:publish'`, `export const TEST_LEGAL_KINDS = Object.freeze(['TERMS', 'PRIVACY'] as const)`, `bootAdminApp(db, { reauth?, timeZone?, jsonLimit? })` 이 `legal: { kinds: TEST_LEGAL_KINDS }` · `AdminLegalModule` 을 싣는다.

- [ ] **Step 1: 슬롯 · 모듈 테스트를 쓴다(RED)**

`auth/permission-slots.test.ts` 의 `it('슬롯은 아홉 — …')` 를 바꾼다:

```ts
it('슬롯은 열하나 — 2c 셋 + 역할 둘(2d-1) + 사용자 둘(2d-2) + 팀 둘(2e-1) + 약관 둘(2e-2)', () => {
  expect(ADMIN_PERMISSION_SLOTS).toEqual([
    'sessions.read',
    'sessions.manage',
    'auditLogs.read',
    'roles.read',
    'roles.manage',
    'users.read',
    'users.manage',
    'teams.read',
    'teams.manage',
    'legal.read',
    'legal.publish',
  ])
})
```

`legal/legal.module.test.ts`:

```ts
import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { AdminLegalModule } from './legal.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = { 'legal.read': 'setting.legal:read', 'legal.publish': 'setting.legal:publish' }
const LEGAL = { kinds: ['TERMS', 'PRIVACY'] }

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
        legal: LEGAL,
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminLegalModule 배선', () => {
  it('뜨면 네 라우트가 /admin/legal-documents 아래에 있고 쿠키 없이는 401(가드가 DB · 파이프에 닿기 전에 끝난다)', async () => {
    const server = (await boot([AdminAuthModule, AdminLegalModule])).getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/legal-documents/current?kind=TERMS'],
      ['get', '/admin/legal-documents/current'],
      ['get', '/admin/legal-documents?kind=TERMS'],
      ['get', '/admin/legal-documents/1'],
      ['post', '/admin/legal-documents'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 수정 · 삭제 라우트가 없다 — PATCH · PUT · DELETE 는 404(append-only, 공통 11)', async () => {
    const server = (await boot([AdminAuthModule, AdminLegalModule])).getHttpServer()
    for (const method of ['patch', 'put', 'delete'] as const) {
      const response = await request(server)[method]('/admin/legal-documents/1')
      expect(response.status, method).toBe(404)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminLegalModule])).rejects.toThrow(
      'AdminLegalModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 약관 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminLegalModule], { permissions: {} })).rejects.toThrow(
      'AdminLegalModule 의 권한 슬롯이 이어지지 않았다: legal.read, legal.publish',
    )
  })

  it('🔴 legal 옵션이 없거나 형식 밖이면 기동에서 멈춘다(B14 · §5-8)', async () => {
    await expect(boot([AdminAuthModule, AdminLegalModule], { legal: undefined })).rejects.toThrow(
      'AdminLegalModule 은 legal 옵션이 있어야 한다',
    )
    await expect(
      boot([AdminAuthModule, AdminLegalModule], {
        legal: { kinds: ['TERMS', 'TERMS', 'bad kind'] },
      }),
    ).rejects.toThrow(
      `AdminLegalModule 의 legal 옵션이 맞지 않다 — legal.kinds 에 겹친 종류: TERMS / legal.kinds[2] — 영숫자 · '_' 1~32자가 아니다: "bad kind"`,
    )
  })

  it('permissionCatalog 없이도 뜬다 — 약관 모듈은 카탈로그를 읽지 않는다(§4-4)', async () => {
    await expect(boot([AdminAuthModule, AdminLegalModule])).resolves.toBeDefined()
  })

  it('감사 모듈과 함께 뜬다 — 약관 @Audit 액션이 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminLegalModule], {
        permissions: { ...PERMISSIONS, 'auditLogs.read': 'setting.auditLog:read' },
      }),
    ).resolves.toBeDefined()
  })
})
```

("형식 밖" 기대 문자열은 따옴표가 겹쳐 템플릿 리터럴로 쓴다 — 백슬래시를 쓰지 않는다. 문제 순서는 배열 순서 — 1번째 원소 겹침이 2번째 원소 형식보다 먼저다.)

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test permission-slots legal.module`
Expected: FAIL — 슬롯 목록 불일치, `Failed to load url ./legal.module.js`.

- [ ] **Step 3: 슬롯 둘을 더한다**

`auth/permission-slots.ts`:

- 주석 `/** 2c 의 셋 + 2d 의 역할 둘 · 사용자 둘 + 2e-1 의 팀 둘. 2e-2 · 2f 가 늘린다 — …` 를 `/** 2c 의 셋 + 2d 의 역할 둘 · 사용자 둘 + 2e-1 의 팀 둘 + 2e-2 의 약관 둘. 2f 가 늘린다 — 유니온이 늘어나는 것은 하위 호환이다 */` 로.
- 유니온의 `| 'teams.manage'` 다음에 `  | 'legal.read'` · `  | 'legal.publish'` 두 줄.
- `ADMIN_PERMISSION_SLOTS` 의 `'teams.manage',` 다음에 `'legal.read',` · `'legal.publish',`.

- [ ] **Step 4: 컨트롤러 · 모듈을 쓴다**

`legal/legal.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common'
import { CoreAuditActions, CoreAuditTargets } from '@ssworks/admin-shared'
import type { AdminLegalPublish } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe } from '../http/pipes.js'
import { LegalKindQueryPipe, LegalPublishBodyPipe } from './legal.body.js'
import type { LegalKindQuery } from './legal.body.js'
import { AdminLegalService } from './legal.service.js'

// 정본: ssworks-gise-home apps/api/src/modules/legal/admin-legal.controller.ts(네 라우트 · 고정 경로를 번호 경로 앞에) +
//       ssworks-axion-admin legal.controller.ts(GET / 이 이력 · 발행 응답)
// 바꾼 점: 권한은 슬롯(2c ① P1 — gise SETTING_LEGAL_READ · PUBLISH 가 그대로 두 슬롯). 현재본은 `current` 경로 + { item | null }
//   (gise 는 GET / 이 현재본 · /history 가 이력이었다 — 3e §9 계약은 axion 처럼 GET / 이 이력). 종류는 옵션 열거(B14).
//   발행 감사 setting.legal.publish(공통 2).
// 🔴 `current` 를 `:legalDocNo` 보다 먼저 선언한다 — 뒤집히면 'current' 가 번호 경로로 잡혀 ParseBigIntPipe 400 이 난다(gise).
// 🔴 수정 · 삭제 라우트가 없다 — append-only(공통 11).
// 🔴 감사 meta 에 본문을 싣지 않는다(공통 12) — 종류 · 기준 판 · 해시 · 길이만. 감사 행은 가방에 붙인 값만 기록하고 요청
//    본문을 담지 않는다(2c 인터셉터).

@Controller('legal-documents')
export class AdminLegalController {
  constructor(private readonly legal: AdminLegalService) {}

  /** 시행본 — 미발행이면 { item: null }(3e D15) */
  @RequirePermissionSlot('legal.read')
  @Get('current')
  current(@Query(LegalKindQueryPipe) query: LegalKindQuery) {
    return this.legal.current(query.kind)
  }

  /** 발행 이력 최신순 전량 — 본문 없음 */
  @RequirePermissionSlot('legal.read')
  @Get()
  history(@Query(LegalKindQueryPipe) query: LegalKindQuery) {
    return this.legal.history(query.kind)
  }

  /** 판 하나(본문 포함) — 문서 그대로(3e §9 — `{ item }` 이 아니다) */
  @RequirePermissionSlot('legal.read')
  @Get(':legalDocNo')
  findOne(@Param('legalDocNo', ParseBigIntPipe) legalDocNo: bigint) {
    return this.legal.findOne(legalDocNo)
  }

  @RequirePermissionSlot('legal.publish')
  @Audit({ action: CoreAuditActions.LEGAL_PUBLISH, targetType: CoreAuditTargets.LEGAL_DOCUMENT })
  @Post()
  async publish(
    @Body(LegalPublishBodyPipe) body: AdminLegalPublish,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const result = await this.legal.publish(body, admin.userNo)
    attachAuditTarget(req, result.legalDocNo)
    attachAuditMeta(req, {
      kind: body.kind,
      baseLegalDocNo: body.baseLegalDocNo,
      contentHash: result.contentHash,
      length: body.body.length,
    })
    return result
  }
}
```

`legal/legal.module.ts`:

```ts
import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_LEGAL_CONFIG, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminLegalController } from './legal.controller.js'
import { AdminLegalService } from './legal.service.js'
import { resolveLegalConfig } from './options.js'

// 정본: ssworks-gise-home apps/api/src/modules/legal/legal.module.ts
// 바꾼 점: 패키지 기능 모듈(2e 스펙 §4-4) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다. 공개 조회
//   컨트롤러(gise public-legal)는 내지 않는다 — 쓰는 쪽 몫(공통 14). 카탈로그 · reauth 를 읽지 않는다.
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 종류 옵션은 이 모듈의 provider 다 — 없음 · 형식 밖은 그 팩토리가 기동에서 멈춘다(B14). 주입형 파이프(legal.body.ts)는
//    providers 에 적지 않는다(`@Body(클래스)` 를 Nest 가 모듈 안에서 만든다).
// 🔴 장 0011_legal_documents(표 + guardLocks 행 legalPublish)가 있어야 돈다 — 없으면 발행마다 500(lockGuardRow). 스텁 검사가
//    먼저 막는다(모든 장 필수 — 2c ⑨ M1).

@Module({
  controllers: [AdminLegalController],
  providers: [
    {
      provide: ADMIN_LEGAL_CONFIG,
      useFactory: (options: AdminServerOptions) => resolveLegalConfig(options, 'AdminLegalModule'),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminLegalService,
  ],
})
export class AdminLegalModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminLegalModule')
    assertPermissionSlots(
      this.options.permissions,
      ['legal.read', 'legal.publish'],
      'AdminLegalModule',
    )
  }
}
```

- [ ] **Step 5: 배선 · 테스트 앱**

`admin-server.module.ts`: import 목록의 `import { AdminTeamsModule } from './teams/teams.module.js'` 다음에 `import { AdminLegalModule } from './legal/legal.module.js'`, `ADMIN_ROUTE_MODULES` 의 `AdminTeamsModule,` 다음에 `AdminLegalModule,`.

`index.ts` 끝에 더한다:

```ts
// 약관(PR 2e-2)
export { AdminLegalModule } from './legal/legal.module.js'
export type { AdminLegalOptions } from './legal/options.js'
```

(`AdminLegalDocumentsTable` 은 Task 2 에서 runner 로 이미 나간다. 서비스 · 파이프 · 문구 · 해시 · 가드 상수는 내지 않는다 — 스펙 §4-8.)

`test-support/accounts.ts` 의 `TEST_CATALOG`: 첫 인자 끝(`TEAMS_WRITE: 'org.teams:write',` 다음)에 `LEGAL_READ: 'setting.legal:read',` · `LEGAL_PUBLISH: 'setting.legal:publish',`, `implies` 끝(`'org.teams:write': ['org.teams:read'],` 다음)에 `'setting.legal:publish': ['setting.legal:read'],`. 🔴 역할 · 사용자 모듈은 슬롯 맵의 키가 카탈로그 안인지 기동에서 본다(2d B12) — 빠뜨리면 `bootAdminApp` 을 쓰는 모든 HTTP 테스트가 기동에서 멈춘다.

`test-support/admin-app.ts`:

- 머리 주석의 `(2c · 2d 역할 · 사용자 · 2e-1 팀)` 을 `(2c · 2d 역할 · 사용자 · 2e-1 팀 · 2e-2 약관)` 으로.
- import 에 `import { AdminLegalModule } from '../legal/legal.module.js'` 를 (`AdminAuthModule` import 다음, 알파벳 순서를 지켜) 더한다.
- `TEST_PERMISSIONS` 의 `'teams.manage': 'org.teams:write',` 다음에 `'legal.read': 'setting.legal:read',` · `'legal.publish': 'setting.legal:publish',`.
- `TEST_PERMISSIONS` 다음에 더한다:

```ts
/** 약관 종류(2e-2) — 쓰는 쪽 카탈로그 예시. HTTP 테스트의 모르는 종류 문구가 이 둘을 나열한다 */
export const TEST_LEGAL_KINDS = Object.freeze(['TERMS', 'PRIVACY'] as const)
```

- `AdminAppOptions` 끝에 더한다:

```ts
  /** JSON 본문 한도(configureAdminApp). 기본 1mb — 약관 4mb 확인(⑫ J1) */
  jsonLimit?: string
```

- `bootAdminApp` 을 바꾼다:

```ts
export function bootAdminApp(
  db: AdminDbConnection,
  options: AdminAppOptions = {},
): Promise<NestExpressApplication> {
  return createHttpApp(
    {
      imports: [
        AdminServerModule.forRoot({
          db,
          auth: { jwtSecret: TEST_JWT_SECRET },
          permissions: TEST_PERMISSIONS,
          permissionCatalog: TEST_CATALOG,
          reauth: options.reauth ?? false,
          ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
          audit: { catalog: TEST_AUDIT_CATALOG, secretKeys: ['apiKey'] },
          legal: { kinds: TEST_LEGAL_KINDS },
        }),
        AdminAuthModule,
        AdminAuditModule,
        AdminSessionsModule,
        AdminRolesModule,
        AdminUsersModule,
        AdminTeamsModule,
        AdminLegalModule,
        AuditProbeModule,
      ],
    },
    options.jsonLimit === undefined ? {} : { jsonLimit: options.jsonLimit },
  )
}
```

- [ ] **Step 6: GREEN — 단위 · 기존 HTTP 계약 전부**

```bash
pnpm --filter @ssworks/admin-server test
pnpm --filter @ssworks/admin-server typecheck
pnpm lint
pnpm test:db
```

Expected: 모두 PASS. `pnpm test:db` 는 `bootAdminApp` 을 쓰는 모든 HTTP DB 테스트가 약관 모듈을 싣고도 그대로 초록인지 본다(혼자 돌린다).

- [ ] **Step 7: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/legal packages/admin-server/src/auth/permission-slots.ts packages/admin-server/src/auth/permission-slots.test.ts packages/admin-server/src/admin-server.module.ts packages/admin-server/src/index.ts packages/admin-server/src/test-support/accounts.ts packages/admin-server/src/test-support/admin-app.ts
git add packages/admin-server/src
git commit -m "feat(admin-server): AdminLegalModule — 약관 네 라우트 · 슬롯 legal.read · legal.publish · 종류 옵션 기동 검사 · 배선" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 실 MariaDB HTTP 계약 — 3e §9 전 행 · 감사 행 · jsonLimit

**Files:**

- Create: `legal/legal.http.db.test.ts`

**Interfaces:**

- Consumes: `bootAdminApp(db, { jsonLimit })` · `TEST_LEGAL_KINDS`(Task 6), `legalContentHash`(Task 3), `LEGAL_MESSAGES`(Task 3), admin-shared `adminLegalCurrentSchema` · `adminLegalHistorySchema` · `adminLegalDocumentSchema` · `adminLegalPublishResultSchema` · `errorRespSchema` · `parseJSON` · `stringifyJSON` · `CoreAuditActions`.
- Produces: 없음(테스트만 — Task 6 뒤라 GREEN 으로 시작한다. 어긋나면 구현을 고치고 보고서에 적는다).

- [ ] **Step 1: HTTP 계약 테스트를 쓴다**

`legal/legal.http.db.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminLegalCurrentSchema,
  adminLegalDocumentSchema,
  adminLegalHistorySchema,
  adminLegalPublishResultSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { legalContentHash } from './content-hash.js'
import { LEGAL_MESSAGES } from './errors.js'

// 실 MariaDB 의 약관 HTTP 계약(2e 스펙 §9-3 [2]) — admin-ui useLegalDocuments 가 기대는 3e §9 그대로.
// 🔴 종류는 테스트 앱의 TEST_LEGAL_KINDS(TERMS · PRIVACY) 둘뿐이라 이 파일의 테스트가 같은 종류를 나눠 쓴다 — 발행 기준은
//    늘 그때의 현재본에서 읽고(currentNo), 본문은 테스트마다 다르게 쓴다. PRIVACY 는 첫 describe 가 처음 발행한다.
// 🔴 bigint 가 든 본문은 stringifyJSON 으로 보낸다(supertest 의 .send(object) 는 bigint 에서 던진다).

const DOCUMENT_KEYS = [
  'body',
  'contentHash',
  'kind',
  'legalDocNo',
  'publishedAt',
  'publishedByUserName',
  'publishedByUserNo',
]
const HISTORY_KEYS = DOCUMENT_KEYS.filter((key) => key !== 'body')
const UNKNOWN_KIND = '잘못된 옵션: "TERMS"또는 "PRIVACY" 중 하나여야 합니다'
const LEGAL_PATH = '/admin/legal-documents'

let t: TestDatabase
let app: NestExpressApplication
let big: NestExpressApplication
let publisher: SeededUser
let reader: SeededUser
let member: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  const publisherRole = await seedRole(t.db, {
    roleName: '약관 담당',
    permissions: ['setting.legal:read', 'setting.legal:publish'],
  })
  const readerRole = await seedRole(t.db, {
    roleName: '약관 조회',
    permissions: ['setting.legal:read'],
  })
  const memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  publisher = await seedUser(t.db, {
    roleNo: publisherRole,
    userId: 'legal-publisher',
    userName: '약관 담당자',
  })
  reader = await seedUser(t.db, { roleNo: readerRole, userId: 'legal-reader' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'member' })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  big = await bootAdminApp(connection, { jsonLimit: '4mb' })
})

afterAll(async () => {
  await app?.close()
  await big?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>
type Pending = ReturnType<Agent['post']>

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

function sendJson(pending: Pending, body: unknown): Pending {
  return pending.set('Content-Type', 'application/json').send(stringifyJSON(body))
}

/** 성공 봉투 { success: true, data } 를 풀고 data 의 키 집합이 정확히 keys 인지 잰다 */
function envelope(response: Response, keys: string[]): Record<string, unknown> {
  const body = parseJSON<{ success: boolean; data: Record<string, unknown> }>(response.text)
  expect(body.success).toBe(true)
  expect(Object.keys(body.data).sort()).toEqual([...keys].sort())
  return body.data
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

/** 감사 행에는 bigint 열이 있다 — JSON.stringify 가 던지지 않게 문자열로 */
const plain = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? String(item) : item))

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function currentNo(agent: Agent, kind: string): Promise<bigint | null> {
  const response = await agent.get(`${LEGAL_PATH}/current`).query({ kind }).expect(200)
  return adminLegalCurrentSchema.parse(data(response)).item?.legalDocNo ?? null
}

async function publish(
  agent: Agent,
  kind: string,
  body: string,
): Promise<{ legalDocNo: bigint; contentHash: string }> {
  const baseLegalDocNo = await currentNo(agent, kind)
  const response = await sendJson(agent.post(LEGAL_PATH), { kind, body, baseLegalDocNo }).expect(
    201,
  )
  envelope(response, ['contentHash', 'legalDocNo'])
  return adminLegalPublishResultSchema.parse(data(response))
}

async function auditRowOf(legalDocNo: bigint) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', CoreAuditActions.LEGAL_PUBLISH)
    .where('targetRefNo', '=', legalDocNo)
    .executeTakeFirstOrThrow()
}

async function lastFailedRow(statusCode: number) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', CoreAuditActions.LEGAL_PUBLISH)
    .where('statusCode', '=', statusCode)
    .orderBy('logNo', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow()
}

describe('PRIVACY — 이 파일에서 처음 발행하는 종류', () => {
  it('미발행 현재본 200 { item: null } · 이력 { items: [] } → 첫 발행(baseLegalDocNo: null) 201 → 감사 meta 의 기준 판 null', async () => {
    const agent = await signIn(publisher)
    const empty = await agent.get(`${LEGAL_PATH}/current?kind=PRIVACY`).expect(200)
    expect(envelope(empty, ['item'])).toEqual({ item: null })
    const none = await agent.get(`${LEGAL_PATH}?kind=PRIVACY`).expect(200)
    expect(envelope(none, ['items'])).toEqual({ items: [] })

    const body = '개인정보처리방침 첫 판'
    const created = await publish(agent, 'PRIVACY', body)
    expect(created.contentHash).toBe(legalContentHash(body))
    const row = await auditRowOf(created.legalDocNo)
    expect(row).toMatchObject({
      targetType: 'legalDocument',
      actorUserNo: publisher.userNo,
      statusCode: 201,
      errorCode: null,
    })
    expect(row.meta).toEqual({
      kind: 'PRIVACY',
      baseLegalDocNo: null,
      contentHash: created.contentHash,
      length: body.length,
    })
  })
})

describe('읽기 · 권한', () => {
  it('🔴 legal.read 만으로 읽기 셋 200 · 발행 403(details 없음) — 슬롯 없는 계정은 읽기도 403', async () => {
    const { legalDocNo } = await publish(await signIn(publisher), 'TERMS', '읽기 권한용 판')
    const readerAgent = await signIn(reader)
    await readerAgent.get(`${LEGAL_PATH}/current?kind=TERMS`).expect(200)
    await readerAgent.get(`${LEGAL_PATH}?kind=TERMS`).expect(200)
    await readerAgent.get(`${LEGAL_PATH}/${legalDocNo}`).expect(200)
    const denied = expectError(
      await sendJson(readerAgent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: '권한 없는 판',
        baseLegalDocNo: legalDocNo,
      }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      '권한이 없습니다.',
    )
    expect(denied.details).toBeUndefined()
    expectError(
      await (await signIn(member)).get(`${LEGAL_PATH}/current?kind=TERMS`),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('🔴 모르는 · 빠진 · 배열 · 소문자 종류 400 issues[kind] — 쿼리 둘과 발행 본문(Review Focus 4)', async () => {
    const agent = await signIn(publisher)
    for (const path of [`${LEGAL_PATH}/current`, LEGAL_PATH]) {
      for (const query of ['?kind=REFUND', '', '?kind=TERMS&kind=PRIVACY', '?kind=terms']) {
        const body = expectError(
          await agent.get(`${path}${query}`),
          400,
          CommonErrorCodes.ERR_COMMON_VALIDATION,
        )
        expect(body.details, `${path}${query}`).toEqual({
          issues: [{ path: ['kind'], code: 'invalid_value', message: UNKNOWN_KIND }],
        })
      }
    }
    const published = expectError(
      await sendJson(agent.post(LEGAL_PATH), { kind: 'REFUND', body: 'x', baseLegalDocNo: null }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(published.details)).toEqual([['kind']])
  })

  it('단건 — 없는 번호 404 · 숫자 아닌 번호 400 issues[legalDocNo]', async () => {
    const agent = await signIn(reader)
    expectError(
      await agent.get(`${LEGAL_PATH}/999999999`),
      404,
      CommonErrorCodes.ERR_COMMON_NOT_FOUND,
      LEGAL_MESSAGES.notFound,
    )
    const invalid = expectError(
      await agent.get(`${LEGAL_PATH}/abc`),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(invalid.details)).toEqual([['legalDocNo']])
  })
})

describe('발행 — 3e §9', () => {
  it('201 { legalDocNo, contentHash } → 현재본 · 이력 · 단건 — 키 집합 · admin-shared 스키마 · 해시 = sha256(body)', async () => {
    const agent = await signIn(publisher)
    const body = '이용약관 계약 판'
    const created = await publish(agent, 'TERMS', body)
    expect(created.contentHash).toBe(legalContentHash(body))

    const current = await agent.get(`${LEGAL_PATH}/current?kind=TERMS`).expect(200)
    const currentData = envelope(current, ['item'])
    expect(Object.keys(currentData.item as object).sort()).toEqual(DOCUMENT_KEYS)
    const item = adminLegalCurrentSchema.parse(data(current)).item
    expect(item).toEqual({
      legalDocNo: created.legalDocNo,
      kind: 'TERMS',
      body,
      contentHash: created.contentHash,
      publishedAt: item?.publishedAt,
      publishedByUserNo: publisher.userNo,
      publishedByUserName: '약관 담당자',
    })

    const history = await agent.get(`${LEGAL_PATH}?kind=TERMS`).expect(200)
    const rawItems = envelope(history, ['items']).items as object[]
    // 🔴 이력에 본문이 없다
    for (const raw of rawItems) expect(Object.keys(raw).sort()).toEqual(HISTORY_KEYS)
    const items = adminLegalHistorySchema.parse(data(history)).items
    expect(items[0]?.legalDocNo).toBe(created.legalDocNo)
    for (let i = 1; i < items.length; i += 1) {
      const newer = items[i - 1]
      const older = items[i]
      if (newer === undefined || older === undefined) continue
      expect(newer.publishedAt >= older.publishedAt).toBe(true)
    }

    // 🔴 단건은 문서 그대로 — `{ item }` 이 아니다(3e §9 · admin-ui README api.get<AdminLegalDocument>)
    const single = await agent.get(`${LEGAL_PATH}/${created.legalDocNo}`).expect(200)
    envelope(single, DOCUMENT_KEYS)
    expect(adminLegalDocumentSchema.parse(data(single))).toEqual(item)
  })

  it('🔴 본문에 contentHash 를 실어 보내도 무시한다 — 서버가 셈한 값만(Review Focus 3)', async () => {
    const agent = await signIn(publisher)
    const body = '해시 위조 시도 판'
    const response = await sendJson(agent.post(LEGAL_PATH), {
      kind: 'TERMS',
      body,
      baseLegalDocNo: await currentNo(agent, 'TERMS'),
      contentHash: '0'.repeat(64),
    }).expect(201)
    expect(adminLegalPublishResultSchema.parse(data(response)).contentHash).toBe(
      legalContentHash(body),
    )
  })

  it('🔴 409 둘 — 같은 본문 ERR_COMMON_CONFLICT · 낡은 기준 ERR_COMMON_REVISION_CONFLICT(같은 본문이어도 기준 판이 먼저)', async () => {
    const agent = await signIn(publisher)
    const first = await publish(agent, 'TERMS', '충돌 시험 첫 판')
    expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: '충돌 시험 첫 판',
        baseLegalDocNo: first.legalDocNo,
      }),
      409,
      CommonErrorCodes.ERR_COMMON_CONFLICT,
      LEGAL_MESSAGES.sameContent,
    )
    const second = await publish(agent, 'TERMS', '충돌 시험 둘째 판')
    expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: '충돌 시험 둘째 판',
        baseLegalDocNo: first.legalDocNo,
      }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      LEGAL_MESSAGES.revisionConflict,
    )
    expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: '충돌 시험 새 판',
        baseLegalDocNo: null,
      }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    expect(await currentNo(agent, 'TERMS')).toBe(second.legalDocNo)
  })

  it('🔴 본문 검증 400 issues — 공백만 · 1,000,001자 · baseLegalDocNo 빠짐 · 숫자 기준 판', async () => {
    const agent = await signIn(publisher)
    const blank = expectError(
      await sendJson(agent.post(LEGAL_PATH), { kind: 'TERMS', body: '   ', baseLegalDocNo: null }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(blank.details)).toEqual([['body']])
    const long = expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body: 'x'.repeat(1_000_001),
        baseLegalDocNo: null,
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(long.details)).toEqual([['body']])
    const missing = expectError(
      await sendJson(agent.post(LEGAL_PATH), { kind: 'TERMS', body: 'x' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(missing.details)).toEqual([['baseLegalDocNo']])
    const numeric = expectError(
      await agent
        .post(LEGAL_PATH)
        .set('Content-Type', 'application/json')
        .send('{"kind":"TERMS","body":"x","baseLegalDocNo":5}'),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(numeric.details)).toEqual([['baseLegalDocNo']])
  })

  it('🔴 jsonLimit — 1,000,000자 한글 본문(3MB)은 기본 1mb 앱에서 413 봉투, 4mb 앱에서 201 · 같은 본문 왕복 · 감사는 길이만(⑫ J1 · Review Focus 1)', async () => {
    const body = '약'.repeat(1_000_000)
    const small = await signIn(publisher)
    expectError(
      await sendJson(small.post(LEGAL_PATH), {
        kind: 'TERMS',
        body,
        baseLegalDocNo: await currentNo(small, 'TERMS'),
      }),
      413,
      CommonErrorCodes.ERR_COMMON_PAYLOAD_TOO_LARGE,
      '요청 본문이 너무 큽니다.',
    )
    const bigAgent = await signIn(publisher, big)
    const created = await publish(bigAgent, 'TERMS', body)
    expect(created.contentHash).toBe(legalContentHash(body))
    const single = await bigAgent.get(`${LEGAL_PATH}/${created.legalDocNo}`).expect(200)
    const document = adminLegalDocumentSchema.parse(data(single))
    expect(document.body.length).toBe(1_000_000)
    expect(document.body === body).toBe(true)
    const row = await auditRowOf(created.legalDocNo)
    expect(row.meta).toMatchObject({ length: 1_000_000 })
    expect(JSON.stringify(row.meta).length).toBeLessThan(400)
  }, 60_000)
})

describe('감사', () => {
  it('🔴 발행 행 — 대상 legalDocument · 번호 · meta 원문 { kind, baseLegalDocNo, contentHash, length }, 본문 없음(공통 12)', async () => {
    const agent = await signIn(publisher)
    const base = await currentNo(agent, 'TERMS')
    const body = '감사 표식 본문 AUDIT-BODY-MARKER'
    const response = await sendJson(agent.post(LEGAL_PATH), {
      kind: 'TERMS',
      body,
      baseLegalDocNo: base,
    }).expect(201)
    const created = adminLegalPublishResultSchema.parse(data(response))
    const row = await auditRowOf(created.legalDocNo)
    expect(row).toMatchObject({
      action: CoreAuditActions.LEGAL_PUBLISH,
      targetType: 'legalDocument',
      targetRefNo: created.legalDocNo,
      actorUserNo: publisher.userNo,
      statusCode: 201,
      errorCode: null,
    })
    expect(row.meta).toEqual({
      kind: 'TERMS',
      baseLegalDocNo: base === null ? null : String(base),
      contentHash: created.contentHash,
      length: body.length,
    })
    expect(plain(row)).not.toContain('AUDIT-BODY-MARKER')
  })

  it('🔴 실패한 발행(409 · 400)도 행으로 남고 meta 는 null — 본문이 실리지 않는다', async () => {
    const agent = await signIn(publisher)
    const body = '실패 감사 표식 FAIL-BODY-MARKER'
    expectError(
      await sendJson(agent.post(LEGAL_PATH), {
        kind: 'TERMS',
        body,
        baseLegalDocNo: 999_999_999n,
      }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    expect(await lastFailedRow(409)).toMatchObject({
      errorCode: CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      targetRefNo: null,
      meta: null,
    })
    expectError(
      await sendJson(agent.post(LEGAL_PATH), { kind: 'REFUND', body, baseLegalDocNo: null }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(await lastFailedRow(400)).toMatchObject({
      errorCode: CommonErrorCodes.ERR_COMMON_VALIDATION,
      meta: null,
    })
    const rows = await t.db
      .selectFrom('auditLogs')
      .selectAll()
      .where('action', '=', CoreAuditActions.LEGAL_PUBLISH)
      .execute()
    expect(plain(rows)).not.toContain('FAIL-BODY-MARKER')
  })
})
```

🔴 사전 대조(이 파일에서 걸리기 쉬운 것): ① `publish` 도우미 이름과 지역 변수 이름이 겹치지 않는다(`published` · `created` · `first` · `second` 를 쓴다). ② 감사 표의 `meta` 는 파싱된 JSON 이다(2e-1 팀 HTTP 테스트와 같다) — 행 전체를 문자열로 볼 때는 bigint 열 때문에 `plain()` 을 쓴다. ③ 413 은 본문 파서가 내므로 감사 행이 남지 않는다(가드 · 인터셉터 앞). ④ zod 4 의 정규식 실패 코드는 `invalid_format` 으로 본다(Task 3) — 다르면 실제 값으로 고치고 보고서에 적는다.

- [ ] **Step 2: 돌린다**

```bash
pnpm --filter @ssworks/admin-server test:db legal.http
pnpm lint
```

Expected: PASS. 실패하면 계약(테스트)이 맞는지 스펙 §4-6 · 3e §9 와 대조하고, 구현이 틀렸으면 고쳐 그 사실을 보고서에 적는다.

- [ ] **Step 3: 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/legal/legal.http.db.test.ts
git add packages/admin-server/src/legal/legal.http.db.test.ts
git commit -m "test(admin-server): 약관 HTTP 계약 — 3e §9 전 행 · 감사 meta 원문 · jsonLimit 413 · 4mb" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 쓰는 쪽 스모크 · README · changeset · 진행 문서

**Files:**

- Modify: `packages/admin-server/README.md`
- Create: `.changeset/admin-server-legal.md`
- Modify: `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md`(§14 R6)
- Modify: `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`
- Create(저장소 밖): `$TEMP/akss/` 아래 앱 파일들

- [ ] **Step 1: README 를 고친다**

`packages/admin-server/README.md`:

① 둘째 단락의 `코어 스키마 10장(PR 2a · 2c · 2d-1 · 2e-1)` 을 `코어 스키마 11장(PR 2a · 2c · 2d-1 · 2e-1 · 2e-2)` 으로, `팀(PR 2e-1)이다. 약관 · IP 접근 제어는 다음 PR 에서 붙는다` 를 `팀(PR 2e-1), 약관(PR 2e-2)이다. IP 접근 제어는 다음 PR 에서 붙는다` 로.

② 장 표의 ``| `0010_team_tree_lock` …`` 행 다음에 행을 더한다:

```md
| `0011_legal_documents` | `legal_documents` + `guard_locks` 에 행 하나(약관 발행) |
```

③ "## 권한 슬롯" 예시 객체의 `'teams.manage': …` 줄 다음에 두 줄을 더한다:

```ts
      'legal.read': 'setting.legal:read', // GET /legal-documents…
      'legal.publish': 'setting.legal:publish', // POST /legal-documents
```

④ "## 팀" 절 다음, "## admin-ui 와 맞물리기" **앞**에 절을 더한다:

````md
## 약관

이용약관 · 개인정보처리방침 같은 법적 문서의 판(版) 관리. 판은 **append-only** 다 — 수정 · 삭제가 없고 새 판을 발행한다. 각 종류의 시행본은 가장 늦게 발행된 판이다.

```ts
// 한 상수에서 서버 옵션과 admin-ui 탭을 만든다
export const LEGAL_KINDS = ['TERMS', 'PRIVACY'] as const

imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      // …
      legal: { kinds: LEGAL_KINDS },
      permissions: {
        // …
        'legal.read': 'setting.legal:read',
        'legal.publish': 'setting.legal:publish',
      },
    }),
  }),
  AdminAuthModule,
  AdminLegalModule,
]
```

마이그레이션 폴더에 스텁 한 줄을 더한다(모든 장 필수 — 이미 장을 돌린 DB 도 `kysely migrate` 한 번으로 따라온다):

```ts
// src/database/migrations/011_admin_legal_documents.migration.ts
export { up, down } from '@ssworks/admin-server/migrations/0011_legal_documents'
```

| 라우트                                     | 슬롯            | 본문 → 응답                                                          | 감사                                                                          |
| ------------------------------------------ | --------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /admin/legal-documents/current?kind=` | `legal.read`    | → `{ item: AdminLegalDocument \| null }` — 미발행이면 `null`(200)    | —                                                                             |
| `GET /admin/legal-documents?kind=`         | `legal.read`    | → `{ items: AdminLegalHistoryItem[] }` 최신순 전량, 본문 없음        | —                                                                             |
| `GET /admin/legal-documents/:legalDocNo`   | `legal.read`    | → `AdminLegalDocument`(문서 그대로) · 없으면 404                     | —                                                                             |
| `POST /admin/legal-documents`              | `legal.publish` | `{ kind, body, baseLegalDocNo }` → 201 `{ legalDocNo, contentHash }` | `setting.legal.publish`(meta `{ kind, baseLegalDocNo, contentHash, length }`) |

- `legal.kinds` 는 비어 있지 않고 원소가 영숫자 · `_` 1~32자 · 겹침 없음이어야 한다 — 어기면 기동에서 멈춘다. 모르는 종류(쿼리 · 본문)는 400 `issues[{ path: ['kind'] }]`. 종류는 대소문자를 가른다.
- admin-ui `useLegalDocuments` 배선(admin-ui README "약관")이 그대로 맞는다 — 위 `baseURL: '/api/admin'` 이면 `loadCurrent: (kind) => api.get<AdminLegalCurrent>('/legal-documents/current', { params: { kind } }).then((r) => r.item)` · `loadHistory: (kind) => api.get<AdminLegalHistory>('/legal-documents', { params: { kind } }).then((r) => r.items)` · ``loadOne: (no) => api.get<AdminLegalDocument>(`/legal-documents/${no}`)`` · `publish: (body) => api.post('/legal-documents', body)`. 미발행은 404 가 아니라 `{ item: null }` 이라 어댑터가 404 를 바꿔 읽을 필요가 없다. 탭의 `kinds` 는 위 `LEGAL_KINDS` 에서 만든다.
- **발행 409 둘**: 편집을 시작한 판(`baseLegalDocNo`, 미발행에서 시작했으면 `null`)이 지금 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`(다른 관리자가 먼저 발행했다 — admin-ui 가 충돌 안내를 띄운다), 시행본과 본문이 같으면 409 `ERR_COMMON_CONFLICT` `이전 버전과 내용이 같습니다.` 기준 판 검사가 먼저다. 옛 판의 본문으로 되돌리는 발행은 된다.
- **해시는 서버만 셈한다** — `contentHash = sha256(body)`(utf8, hex 소문자). 본문을 트림 · 정규화하지 않으므로 끝 공백 · 줄바꿈만 달라도 다른 판이다. 본문에 해시를 실어 보내도 무시한다.
- **본문 크기**: 본문은 1,000,000자까지(admin-shared `LEGAL_BODY_MAX_LENGTH`)지만, 한글 1,000,000자의 JSON 은 약 3MB 라 기본 본문 한도 1mb 에서 413 `ERR_COMMON_PAYLOAD_TOO_LARGE` 가 난다. 긴 약관을 받으려면 `configureAdminApp(app, { jsonLimit: '4mb' })`.
- **동시 발행**: 발행은 `guard_locks` 행 `legalPublish` 에서 종류와 관계없이 하나씩 돈다 — 같은 판을 기준으로 둘이 동시에 발행하면 하나만 되고 다른 하나는 기준 판 409 다. 발행 중인 관리자의 계정을 쓰는 쪽이 동시에 지우면 드물게 409(교착) · 400 이 난다 — 다시 보내면 된다.
- **발행자 계정을 지워도** 판은 남는다(`published_by_user_no` 는 SET NULL — `publishedByUserNo` · `publishedByUserName` 이 `null`).
- **공개 조회는 쓰는 쪽 몫이다**(관리 계약을 재사용하지 않는다 — 필드가 공개로 새지 않게). 예:

```ts
@Public()
@Controller('legal')
export class PublicLegalController {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  @Get(':kind')
  async current(@Param('kind') kind: string) {
    const row = (LEGAL_KINDS as readonly string[]).includes(kind)
      ? await this.db
          .selectFrom('legalDocuments')
          .select(['legalDocNo', 'kind', 'body', 'publishedAt'])
          .where('kind', '=', kind)
          .orderBy('publishedAt', 'desc')
          .orderBy('legalDocNo', 'desc')
          .limit(1)
          .executeTakeFirst()
      : undefined
    // 🔴 미발행은 404(fail-closed) — 공개 쪽이 "없음" 을 정상으로 받으면 방침 없이 동의를 받는 길이 생긴다
    if (row === undefined)
      throw new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, '문서를 찾을 수 없습니다.')
    return {
      kind: row.kind,
      legalDocNo: row.legalDocNo,
      bodyHtml: renderMarkdown(row.body), // admin-shared — 관리 화면 미리보기와 같은 렌더러
      publishedAt: row.publishedAt.toISOString(),
    }
  }
}
```

- **동의 기록**(가입 동의 등)은 쓰는 쪽 표다. 판 번호를 FK 로 걸면 `legal_doc_no` 는 `bigint unsigned` 다. 시행본은 (`published_at` DESC, `legal_doc_no` DESC) 첫 행이다 — 같은 초 발행이 있으니 두 키를 다 쓴다.
- 재인증(`reauth`)은 약관 발행에 걸리지 않는다 — 낡은 쓰기는 기준 판이 막는다.
````

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-legal.md`:

```md
---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0011_legal_documents` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0011_legal_documents'` — 모든 장 필수, 이미 돌린 DB 는 `kysely migrate` 한 번). 약관 모듈을 쓰면 `AdminServerModule` 옵션에 `legal: { kinds: ['TERMS', 'PRIVACY'] }`(쓰는 쪽 종류 카탈로그)와 `permissions` 의 슬롯 `'legal.read'` · `'legal.publish'` 를 잇고 `AdminLegalModule` 을 import 한다. 한글 1,000,000자 본문을 받으려면 `configureAdminApp(app, { jsonLimit: '4mb' })`.

admin-server 약관(Phase 2 PR 2e-2): `AdminLegalModule` — `/admin/legal-documents` 네 라우트(현재본 `{ item | null }` · 이력 최신순 전량(본문 없음) · 단건 · 발행 201 `{ legalDocNo, contentHash }`). 기준 판이 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`, 시행본과 같은 본문이면 409 `ERR_COMMON_CONFLICT`. 해시는 서버가 sha256 으로 셈하고 표는 append-only 다. 발행은 `guard_locks` 행 `legalPublish` 로 직렬화된다. 종류 옵션이 없거나 형식 밖이면 기동에서 멈춘다. 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: 코어 감사 액션 `setting.legal.publish`("약관 발행")와 대상 `legalDocument`("약관").
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
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "package/dist/legal/.*[.]js$"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "package/dist/database/migrations/0011_legal_documents[.]js$"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "test-support|[.]test[.]js" || echo "테스트 파일 없음"
```

Expected: tarball 둘, `dist/legal/*.js` · `0011_legal_documents.js` 가 보이고 마지막 줄은 `테스트 파일 없음`.

`$TEMP/akss/package.json` · `tsconfig.json` · `.env` · `kysely.config.ts` · `src/main.ts` 는 2c 플랜 Task 13 Step 3(`docs/superpowers/plans/2026-10-14-admin-server-sessions-audit.md`)과 같다 — 그대로 옮겨 쓰고 tarball 이름만 `ls` 결과로 맞춘다. 포트 4100 이 쓰이고 있으면 `main.ts` 와 `check.mjs` 의 포트를 함께 다른 값으로 바꾼다. 스텁은 2e-1 의 열(2d-1 플랜 Task 13 Step 3 의 아홉 + `010_admin_team_tree_lock.ts`)에 하나를 더한 열하나다:

```ts
// $TEMP/akss/src/migrations/011_admin_legal_documents.ts
export { up, down } from '@ssworks/admin-server/migrations/0011_legal_documents'
```

`$TEMP/akss/src/seed.ts` 는 2d-2 플랜 Task 13 Step 3 과 같다(역할 `최고 관리자`(`'*'`) · `직원`(`org.users:read`) · 계정 `admin`).

`$TEMP/akss/src/app.module.ts` — 2e-1 의 파일(2e-1 플랜 Task 10 Step 3: 2d-2 의 파일 + 팀 줄)에서 바꾼다: import 에 `AdminLegalModule` 을 더하고, `permissions` 에 `'legal.read': 'setting.legal:read'` · `'legal.publish': 'setting.legal:publish'` 를, 옵션에 `legal: { kinds: ['TERMS', 'PRIVACY'] }` 를, `imports` 의 `AdminTeamsModule,` 다음에 `AdminLegalModule,` 를 더한다. 🔴 `permissions` 에 이은 약관 키도 `permissionCatalog` 안이어야 한다 — 역할 · 사용자 모듈의 슬롯 키 검사(2d B12)가 기동에서 멈춘다. 카탈로그에 `LEGAL_READ: 'setting.legal:read'` · `LEGAL_PUBLISH: 'setting.legal:publish'` 를 더한다.

`$TEMP/akss/check.mjs` — 2d-1 플랜의 `send` · `show` · `bigint` · `waitForServer` · `login` 도우미 그대로, 본문을 바꾼다:

```js
await waitForServer()
const admin = await login('admin', 'smoke-pass-1234')
const write = (method, path, body) => send(path, { method, cookie: admin, body })
const read = (path) => send(path, { cookie: admin })
const docNoOf = (response) => JSON.parse(response.text).data.legalDocNo // "BigInt(n)" — 그대로 보낸다

show('legal-current-empty', await read('/admin/legal-documents/current?kind=TERMS'))
const first = await write('POST', '/admin/legal-documents', {
  kind: 'TERMS',
  body: '# 이용약관 제1조 목적',
  baseLegalDocNo: null,
})
show('legal-publish', first)
show(
  'legal-same-body',
  await write('POST', '/admin/legal-documents', {
    kind: 'TERMS',
    body: '# 이용약관 제1조 목적',
    baseLegalDocNo: docNoOf(first),
  }),
)
const second = await write('POST', '/admin/legal-documents', {
  kind: 'TERMS',
  body: '# 이용약관 제1조 목적 · 제2조 정의',
  baseLegalDocNo: docNoOf(first),
})
show('legal-publish-2', second)
show(
  'legal-stale-base',
  await write('POST', '/admin/legal-documents', {
    kind: 'TERMS',
    body: '# 낡은 기준에서 쓴 판',
    baseLegalDocNo: docNoOf(first),
  }),
)
show('legal-current', await read('/admin/legal-documents/current?kind=TERMS'))
show('legal-history', await read('/admin/legal-documents?kind=TERMS'))
show('legal-one', await read(`/admin/legal-documents/${bigint(docNoOf(first))}`))
show('legal-unknown-kind', await read('/admin/legal-documents/current?kind=REFUND'))
show('audit-logs', await read('/admin/audit-logs?itemsPerPage=20&filter%5Baction%5D=setting.legal'))
```

🔴 시나리오 대조(서버 규칙을 어기지 않는가): 첫 발행은 미발행 상태라 기준 판 `null` · 같은 본문 재발행은 기준 판이 맞아 `CONFLICT` 로 가른다 · 둘째 발행은 첫 판 기준이고 본문이 달라 201 · 낡은 기준은 첫 판(이제 시행본이 아님) 기준이라 `REVISION_CONFLICT` · 본문에 백슬래시 · 줄바꿈이 없다.

- [ ] **Step 4: 설치 · 빌드 · 마이그레이션 · 시드**

```bash
cd "$TEMP/akss"
pnpm install
pnpm build
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists akss; create database akss"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akss -e "select lock_name from guard_locks order by lock_name; show create table legal_documents"
```

Expected: 설치 성공 · 마이그레이션 11장 · 시드 성공. `guard_locks` 세 행(`legalPublish` · `superAdminSurvival` · `teamTree`), `legal_documents` 의 `kind` · `content_hash` 가 `CHARACTER SET ascii COLLATE ascii_bin`, FK `ON DELETE SET NULL`. `tsc` 는 2a 때의 제3자 d.ts 6건 말고는 오류가 없다(있으면 기록하고 `skipLibCheck: true` 로 한 번 더 돌린다).

- [ ] **Step 5: 기동 · 요청**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected(본문은 줄여 적는다):

- `legal-current-empty 200 {"success":true,"data":{"item":null}}`
- `legal-publish 201 {"success":true,"data":{"legalDocNo":"BigInt(1)","contentHash":"…64자…"}}`
- `legal-same-body 409 {…"code":"ERR_COMMON_CONFLICT","message":"이전 버전과 내용이 같습니다."…}`
- `legal-publish-2 201 {…"legalDocNo":"BigInt(2)"…}`
- `legal-stale-base 409 {…"code":"ERR_COMMON_REVISION_CONFLICT","message":"다른 관리자가 먼저 새 버전을 발행했습니다. 새로 불러온 내용을 확인하세요."…}`
- `legal-current 200 {…"item":{"legalDocNo":"BigInt(2)",…"body":"# 이용약관 제1조 목적 · 제2조 정의",…"publishedByUserName":…}}`
- `legal-history 200 {…"items":[{…"BigInt(2)"…},{…"BigInt(1)"…}]}` — 본문 키 없음
- `legal-one 200 {"success":true,"data":{"legalDocNo":"BigInt(1)",…"body":"# 이용약관 제1조 목적"…}}` — `item` 으로 감싸지 않음
- `legal-unknown-kind 400 {…"code":"ERR_COMMON_VALIDATION",…"path":["kind"]…}`
- `audit-logs 200 {…}` — `setting.legal.publish` 넷이 최신순으로 409 `ERR_COMMON_REVISION_CONFLICT`(낡은 기준) · 201(둘째 판) · 409 `ERR_COMMON_CONFLICT`(같은 본문) · 201(첫 판). 201 행의 meta 는 `{ kind, baseLegalDocNo, contentHash, length }` 이고 본문이 없다, 409 행의 meta 는 `null`.

셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
```

- [ ] **Step 7: 스펙 §14 · 진행 문서를 고친다**

숫자(N · M · W)는 저장소 루트에서 `pnpm check` · `pnpm test:db` 를 돌린 결과로 채운다(admin-server 테스트 수 · DB 테스트 수 · 워크스페이스 합계).

**스펙 `docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md` §14** 끝에 더한다:

```md
- **R6 — 플랜이 더한 작은 결정(2026-10-15, 2e-2 플랜).** ① 해시를 `legal/content-hash.ts` 로 따로 둔다 — 단위 테스트가 Nest 를 싣지 않게. ② 주입형 파이프(`LegalPublishBodyPipe` · `LegalKindQueryPipe`)는 모듈 `providers` 에 적지 않는다(`@Body(클래스)` · `@Query(클래스)` 를 Nest 가 모듈 안에서 만든다 — users.body 와 같은 방식). §4-4 의 "쿼리 · 본문 파이프" 를 providers 에 둔다는 줄은 이것으로 읽는다. ③ 테스트 앱 `bootAdminApp` 이 `jsonLimit` 을 받는다(⑫ J1 의 4mb 확인). ④ 실패한 발행(409 · 400)의 감사 행은 meta 가 `null` 이다 — 가방에 붙이는 것은 성공 뒤다(팀과 같다). ⑤ 동시 발행 테스트는 원시 연결이 발행자 `users` 행을 쥐어 두 발행을 INSERT 앞에 맞추고(FK S 대기), 가드는 `legal.guard` 가 가드 행만 쥔 채 직접 잰다(R5-1).
```

구현 · 리뷰 중 바뀐 것이 있으면 `R7` 이하로 더한다.

**`docs/01-phase0.md`**

① §3-2 표에서 첫 칸이 `` 옵션 없음 — `AdminTeamsModule` import 가 켠다(2e-1) …`` 인 행 다음에 행을 더한다:

```md
| `legal: { kinds }`(2e-2 코어 — 쓰는 쪽 종류 카탈로그, 영숫자 · `_` 1~32자) — `AdminLegalModule` import 가 켠다. 공개 조회 · 동의 기록은 B | 없음(약관 모듈을 쓰면 필수 — 기동 검사). 발행 직렬화(`guard_locks` 행 `legalPublish`) · 기준 판 409 → 같은 본문 409 · 서버 해시 · append-only | gise 종류 enum 하드코딩 · 트랜잭션 없는 발행, axion 발행자 NOT NULL + RESTRICT · 앱 시계 |
```

② §8 표 `@ssworks/admin-server` 행 상태 칸 끝(`… 다음 2e-2 약관`)을 바꾼다:

```md
… 다음 2e-2 약관. **PR 2e-2 완료**(`feat/admin-server-legal`, 2026-10-15) — `AdminLegalModule`(현재본 `{ item | null }` · 이력 · 단건 · 발행) · 장 0011(`legal_documents` · `legalPublish` 가드) · 종류 옵션 `legal.kinds` · 서버 sha256 · append-only 정적 검사. N 테스트 + 실 MariaDB M. 플랜 `docs/superpowers/plans/2026-10-15-admin-server-legal.md`. 다음 2f
```

③ 표 아래 `다음: Phase 2 PR 2e-2 약관(…) → 2f.` 줄을 바꾼다:

```md
다음: Phase 2 PR 2f — IP 접근 제어 · 인증 경로 이월(HANDOFF "다음 플랜" — 브레인스토밍부터).
```

**`docs/HANDOFF.md`**

- `@ssworks/admin-server` 행에서 2d-3 의 숫자 문장(`501 테스트 + 실 MariaDB 337.`)을 지우고, 그 행 끝에 더한다: ``**PR 2e-2**(약관 — `AdminLegalModule` 네 라우트 · 장 0011 `legal_documents` + `legalPublish` 가드 · 종류 옵션 `legal.kinds` 기동 검사 · 서버 sha256 · 기준 판 409 → 같은 본문 409 · append-only 정적 검사, admin-shared 약관 감사 액션)은 `feat/admin-server-legal` 에서 구현 완료(2026-10-15). N 테스트 + 실 MariaDB M.``
- "검증" 행 끝에 더한다: `PR 2e-2 는 Windows 에서 pnpm check · pnpm test:db 초록(차례로 세 번), 쓰는 쪽 스모크($TEMP/akss — 새 DB · 스텁 11 → 시드 → 기동 → 미발행 현재본 null → 발행 201 → 같은 본문 409 → 낡은 기준 409 → 시행본 · 이력 · 단건 → 감사 행(본문 없음))를 통과했다.`
- "다음 플랜" 행을 바꾼다: `Phase 2 PR 2f — 이월을 모아 브레인스토밍부터(새 브랜치): ADMIN_ACCESS_POLICY 구현 · clientIp 출처(trust proxy · X-Real-IP 우선), IP 슬롯 · setting.ipAccess.* 액션 · 장, 2e 스펙 §5-1 메모(팀 변경의 잔존 영향 — IP 층 도달 가능성, 가드 행 둘의 고정 순서), 2d-2 이월 3(rotate 잠금 순서 users 먼저 FOR SHARE · 로그인 TOCTOU), 첫 발행 전 AdminDbConnection 의 TLS(ssl) · socketPath. 직전 PR 2e-2: 플랜 docs/superpowers/plans/2026-10-15-admin-server-legal.md`
- "PR 2c 가 넘긴 것" 의 `2e · 2f: 팀 · 약관 · IP 슬롯과 액션(…) … → 팀은 **2e-1 에서 닫음**(약관은 2e-2, IP 는 2f)` 끝을 ` → 팀은 **2e-1 에서 닫음**, 약관은 **2e-2 에서 닫음**(IP 는 2f)` 로 바꾼다.
- 최종 리뷰가 넘긴 것이 있으면 `- **PR 2e-2 최종 리뷰가 넘긴 것(2026-10-15)**` 항목으로 더한다(Step 9 뒤에 채운다).

**`CLAUDE.md`**

- 패키지 표의 admin-server 행 설명을 `NestJS 12 모듈 (Phase 2 진행 — 2a 기반 · 2b 인증 · 2c 세션 · 감사 · 2d 역할 · 사용자 · 2e-1 팀 · 2d-3 계정 정리 · 2e-2 약관 완료)` 로.
- `### @ssworks/admin-server (Phase 2)` 목록 끝에 한 줄을 더한다:

```md
- 약관 발행은 `lockGuardRow(trx, GUARD_LOCK_LEGAL_PUBLISH)` 가 트랜잭션 첫 문장이고 시행본 읽기(`publishedAt` DESC, `legalDocNo` DESC)는 `FOR UPDATE` 다 — 비잠금 읽기는 스냅샷 격리 ON 에서 INSERT 의 FK 검사를 1020 으로 만든다(2e 스펙 B15 · §14 R5-5). `legalDocuments` 는 append-only — UPDATE · DELETE 경로를 만들지 않는다(`legal-append-only.test.ts`). 해시는 서버만 셈하고 본문은 감사 meta 에 싣지 않는다.
```

- 진행 표의 `**Phase 2 PR 2e-2 — 약관**` 행을 `Phase 2 PR 2e-2 — 약관(`AdminLegalModule`· 장 0011 ·`legalPublish` 가드 · 종류 옵션 · 서버 해시)` · `완료` · `스펙 docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md · 플랜 docs/superpowers/plans/2026-10-15-admin-server-legal.md` 로 바꾸고, 그 아래에 `**Phase 2 PR 2f — IP 접근 제어 · 인증 경로 이월**` · `**다음**` · `HANDOFF "다음 플랜"` 행을 더한다.

- [ ] **Step 8: 포맷 · 확인 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-legal.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-legal.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md
pnpm format:check
pnpm check
pnpm test:db
```

Expected: prettier 두 번째 실행은 `(unchanged)` 뿐, `format:check` · `check` · `test:db` 초록. 작업 공간(`.superpowers/sdd/`)의 md 때문에 `format:check` 가 실패하면 그 경로만 원인인지 보고, 작업 공간을 지운 뒤 다시 돌린다.

```bash
git add packages/admin-server/README.md .changeset/admin-server-legal.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md docs/superpowers/specs/2026-10-14-admin-server-teams-legal-design.md
git commit -m "docs: PR 2e-2 약관 — README 약관 절, changeset, 진행 문서, 다음은 2f" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 9: 최종 리뷰 · 머지 방법**

컨트롤러가 전체 `pnpm test:db` 를 **차례로 세 번** 돌려 흔들림을 본다(흔들리면 `--reporter=json --outputFile <스크래치 경로>` 로 파일별 시간을 뽑아 원인을 찾는다). 그다음 whole-branch 최종 리뷰(opus)를 받고 반영한 뒤(반영 커밋마다 `pnpm check` · `pnpm test:db`), 리뷰가 넘긴 것을 HANDOFF 에 적고 superpowers:finishing-a-development-branch 로 머지 방법을 묻는다.

---

## 스펙 대조표 (자체 검토)

| 스펙(2e-2 몫)                                                                                                                                                                    | Task              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| §1 끝 상태 — 3e §9 전 행 · 동시 발행 하나만 · 서버 해시 · append-only                                                                                                            | 4 · 5 · 7         |
| ⑨ K1 종류 옵션 `legal.kinds` · B14 기동 검증 · `z.enum` 주입형 파이프                                                                                                            | 3 · 6             |
| ⑩ L1 `legalPublish` 가드 · 첫 문장                                                                                                                                               | 2 · 4 · 5         |
| ⑪ A1 장 `0011_legal_documents`(표 + 가드 시드) · 스텁 11장                                                                                                                       | 2 · 8             |
| ⑫ J1 `jsonLimit` 1mb 그대로 · README 413 · 4mb                                                                                                                                   | 7 · 8             |
| 공통 1 슬롯 둘(9 → 11 — §14 R5-7) · 2 감사 액션 · 대상(30 · 5) · 5 응답 모양                                                                                                     | 1 · 6 · 7         |
| 공통 8 표(열 · 콜레이션 · FK SET NULL · 인덱스 · CHECK 없음) · 9 두 키 · 10 검사 순서 · 11 append-only · 12 감사 meta · 13 라우트 순서 · 14 공개 조회 B · 15 admin-shared 스키마 | 2 · 4 · 6 · 7 · 8 |
| B2 가드 이름 상수 자리 · B14 · B15 잠금 읽기 · B16 `toISOString()`                                                                                                               | 2 · 3 · 4 · 5     |
| §4-1 admin-shared · §4-2 옵션 · §4-3 슬롯 · §4-4 모듈 · §4-6 라우트 · §4-7 장 · §4-8 index                                                                                       | 1 · 2 · 3 · 6     |
| §5-1 잠금 순서(legalPublish → legalDocuments → users S) · §5-7 흐름 · §5-8 기동 검사                                                                                             | 4 · 5 · 6         |
| §6 오류 표(약관 행)                                                                                                                                                              | 3 · 4 · 7         |
| §9-1 단위(종류 옵션 · 해시 벡터) · §9-2 DB 없는 HTTP(기동 검사 · 401) · §9-3 [2] DB(장 · 서비스 · HTTP · 경합)                                                                   | 2~7               |
| §10 [2] README · changeset · 01-phase0 · HANDOFF · CLAUDE · 스모크                                                                                                               | 8                 |
| §11 비범위(공개 조회 · 동의 기록 · 예약 발행 · 이력 페이지 · 시계 역행) — 만들지 않는다                                                                                          | (없음) · 8 README |
| §13 선행 문서 정정 — 3e §9 단건(문서 그대로) · 01-phase0 §3-2                                                                                                                    | 7 · 8             |
| §14 R1-5 · R5(실측 — 특히 R5-1 RED 정정 · R5-5 B15 근거 · R5-2 계정 삭제 교착)                                                                                                   | 4 · 5 · 8         |

### §9-4 리뷰 초점 5 → 어디서 재는가

해시를 서버만 셈하는가 — Task 3 파이프(보낸 `contentHash` 를 버림) · Task 7 "contentHash 무시". 본문이 감사 · 로그 · 오류 본문에 없는가 — Task 7 감사 두 테스트(성공 meta 원문 · 실패 meta null · 표식 문자열 없음), 리뷰어는 `legal/` 의 `Logger` · `BusinessError` details 에 본문이 들어가는 줄이 없는지 본다. 검사 순서가 기준 판 → 같은 본문인가 — Task 4 "낡은 기준 … 같은 본문이어도" · Step 5 RED ①. 가드가 첫 문장인가 — Task 5 `legal.guard` · RED 1, 리뷰어는 `publish` 의 `runWriteTransaction` 콜백 첫 줄이 `lockGuardRow` 이고 그 뒤 읽기가 `.forUpdate()` 인지 본다.
