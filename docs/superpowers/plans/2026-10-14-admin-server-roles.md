# admin-server 역할 · 판정 (Phase 2 PR 2d-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@ssworks/admin-server` 에 역할 관리(`AdminRolesModule` — 목록 · 만들기 · 수정 · 이동 · 삭제)와 계정 판정의 바닥(권한 정규화 · 지배 판정 · 전권자 잔존 `guardLocks`)을 더하고, 2c 세션 끊기 라우트에 권한 상승 검사를 붙인다. admin-ui `useRoleEditor` 가 실서버에 붙는다(3b §9 전부).

**Architecture:** 서버는 코어 옵션 `permissionCatalog`(admin-shared `definePermissions` 결과)로 프로젝트 권한 카탈로그를 안다 — 카탈로그가 함의 표 `implies` 와 `normalize` 를 들어 서버와 화면이 같은 표를 쓴다. 쓰기는 순수 판정 `judgeAccountCommand`(행위자가 대상의 현재 · 새 권한을 덮는가)를 트랜잭션 안에서 잠근 행으로 부르고, 전체 권한 재직자를 줄일 수 있는 쓰기는 장 `0009_guard_locks` 의 센티넬 행을 첫 문장에서 `FOR UPDATE` 로 잡아 전후로 센다.

**Tech Stack:** NestJS 12.1 (ESM · NodeNext) · Kysely 0.29 + MariaDB 11.4 · zod 4 · vitest 4 · supertest · TypeScript 5.9

**Spec:** `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` — 결정 ⓪~⑬(§2-1) · 공통 1~13(§2-2) · 설계 B1~B16(§2-3) · 흐름 §5-2 · §5-3 · §5-4 · §5-5 · §14 R1(실측). 이 플랜은 그 스펙의 **[1]**(2d-1) 부분이다. 어긋나면 스펙이 이긴다. 2d-2(사용자 · 계정)는 이 PR 병합 뒤 따로 플랜을 쓴다.

**구현자 규칙(모든 Task):** 테스트를 먼저 만들고 **구현 전에 돌려 RED 를 보고서에 붙인다**(실패 메시지 몇 줄). 그다음 구현 · GREEN · 커밋. 리뷰어는 이 플랜의 해당 Task 와 Global Constraints 를 **먼저 다 읽고** 리뷰한다.

## Global Constraints

- ESM 전용 · `module: NodeNext`. 내부 상대 import 는 `.js` 확장자. `console.log` 금지(`Logger.warn` · `error` 만).
- `admin-server/src` 는 `import type` 분리 규칙의 예외다(DI 메타데이터) — 단 데코레이터가 붙은 시그니처(생성자 · 핸들러 매개변수)에 쓰는 **인터페이스 · 타입 별칭은 `import type`**(TS1272), DI 로 받는 **클래스는 일반 import**.
- 정본에서 옮긴 파일은 머리 주석에 `정본:` 과 `바꾼 점:` 을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 패키지는 권한 키를 하드코딩하지 않는다 — 슬롯 이름만: `'roles.read'` · `'roles.manage'`(이 PR), 2c 의 `'sessions.read'` · `'sessions.manage'` · `'auditLogs.read'`.
- 정규화(3b §9): `'*'` 가 섞이면 정확히 `['*']`, 아니면 함의 닫힘 → 카탈로그 순서(`ALL_PERMISSION_VALUES` 순) · 중복 제거.
- 덮기 판정은 admin-shared `coversPermissions(내 권한, 대상)` — `'*'` 는 무엇이든 덮고, 빈 대상은 참이다.
- revision: 역할 수정 · 삭제 본문에 필수, 다르면 409 `ERR_COMMON_REVISION_CONFLICT`, 성공한 수정마다 +1. 🔴 **이동은 revision 을 받지도 올리지도 않는다**(3b D1). 기본 역할 끄기로 꺼진 역할은 +1(⑫ D1).
- 전권자 잔존: 🔴 센티넬 잠금 `SELECT … FROM guard_locks WHERE lock_name = 'superAdminSurvival' FOR UPDATE` 는 **트랜잭션 첫 문장**. 셈 쿼리에 `FOR UPDATE` 를 붙이지 않는다. 한 트랜잭션은 `guardLocks` 행을 둘 이상 잡지 않는다. 셈 = `users.resignAt IS NULL` 이고 역할 권한에 `JSON_CONTAINS(permissions, '"*"')`.
- 오류 문구(정확히 이 글자 — `accounts/errors.ts` 의 `ACCOUNT_MESSAGES`):
  - `역할을 찾을 수 없습니다.` — 404 `ERR_NO_ROLE`(경로) · 400 `issues[{ path: ['roleNo'] }]`(본문 — 2d-2)
  - `사용자를 찾을 수 없습니다.` — 404 `ERR_NO_USER`
  - `알 수 없는 권한입니다.` — 400 `ERR_COMMON_VALIDATION` `issues[{ path: ['permissions', i] }]`
  - `이미 있는 역할 이름입니다.` — 400 `ERR_COMMON_VALIDATION` `issues[{ path: ['roleName'] }]`(B1)
  - `현재 비밀번호를 입력하세요.` — 400 `ERR_COMMON_VALIDATION` `issues[{ path: ['currentPassword'] }]`(재인증 켬에서 빠짐 · 빈 값)
  - `내 계정에는 이 작업을 할 수 없습니다. 다른 관리자에게 요청하세요.` — 403 `ERR_COMMON_FORBIDDEN`
  - `내 권한보다 넓은 권한을 가진 계정은 바꿀 수 없습니다.` — 403 + `details.outside`
  - `내 권한보다 넓은 역할은 줄 수 없습니다.` — 403 + `details.outside`
  - `내 권한보다 넓은 역할은 만들거나 바꾸거나 지울 수 없습니다.` — 403 + `details.outside`
  - `내 권한보다 넓은 권한을 가진 계정의 세션은 다룰 수 없습니다.` — 403 + `details.outside`
  - `다른 관리자가 먼저 이 역할을 바꿨습니다. 새로 불러온 내용을 확인하세요.` — 409 `ERR_COMMON_REVISION_CONFLICT`
  - `이 역할을 가진 계정이 있어 지울 수 없습니다. 계정의 역할을 먼저 바꾸세요.` — 409 `ERR_COMMON_IN_USE`
  - `이 변경 뒤에는 전체 권한을 가진 재직 관리자가 한 명도 남지 않습니다. 먼저 다른 관리자에게 전체 권한 역할을 주세요.` — 409 `ERR_COMMON_CONFLICT`
  - `동시성 보호 설정이 없어 처리할 수 없습니다.` — 500 `ERR_COMMON_INTERNAL`(응답은 2a 고정 문구, 로그에 이 문구)
- 감사 액션(admin-shared `CoreAuditActions`): `org.role.create` · `org.role.update` · `org.role.delete` · `org.role.move`, 대상 `role`. 라벨 `역할 생성` · `역할 수정` · `역할 삭제` · `역할 표시 순서 변경` · 대상 `역할`.
- 재인증(`reauth: true`): 역할 만들기 · 수정 · 삭제 본문의 `currentPassword`(1~256)를 서비스 진입부 · 트랜잭션 밖에서 `AdminReauthService.verify` 로 확인한다. 이동 · 목록은 재인증 없음. 끄면 보낸 `currentPassword` 는 버린다.
- admin-shared 스키마에 `.refine()` 을 걸지 않는다(3b §11 R1). admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server 가 새 export 를 본다.
- 테스트: 단위 · DB 없는 HTTP 는 `*.test.ts`(`pnpm check`), 실 MariaDB 는 `*.db.test.ts`(`pnpm --filter @ssworks/admin-server test:db`, Docker 컨테이너 `admin-kit-test-db` 가 떠 있어야 한다). 테스트 전용 `data-testid` 없음. 테스트 프로브 모듈은 `ADMIN_ROUTE_MODULES` 밖이라 `/admin` prefix 가 붙지 않는다 — 프로브 컨트롤러 경로에는 `'admin/…'` 를 직접 쓴다(이 PR 은 프로브를 더하지 않는다).
- 🔴 DB 테스트에서 `seedRole(t.db)` 의 기본 권한은 `['*']` 다 — 잔존 셈을 재는 파일에서는 **늘 `permissions` 를 명시**한다(모르는 전체 권한 사용자가 셈을 바꾼다).
- 검증 명령: lint 는 **루트 `pnpm lint`**(패키지에 lint 스크립트가 없다), 타입은 `pnpm --filter @ssworks/admin-server typecheck` · `pnpm --filter @ssworks/admin-shared typecheck`, 단위는 `pnpm --filter <패키지> test <파일>`, 전체는 `pnpm check` · `pnpm test:db`.
- 셸: Windows(Git Bash) · Linux 양쪽. 🔴 출력을 `/dev/null` 로 보내지 않는다(Windows 에 `NUL` 파일이 생긴다) — 출력 억제 자체를 하지 않는다. 파일을 python · sed 로 다시 쓰지 않는다(LF).
- 🔴 도구 입력의 백슬래시 이스케이프는 JSON 으로 풀린다 — 새 코드 · 테스트에 백슬래시를 쓰지 않는다(정규식은 `[0-9]` 같은 문자 클래스, 문자열 안 따옴표는 템플릿 리터럴로). 백슬래시가 든 줄을 고쳤다면 `node -e` 와 `String.fromCharCode` · `charCodeAt` 로 그 자리 바이트를 확인한다.
- 커밋: 한국어 conventional commits. 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `gh pr merge` · `pnpm release` · `npm publish` · `pnpm stage approve` 는 하지 않는다.

## Review Focus

스펙이 함의하지만 다른 테스트가 재지 않는, 사람이 가장 먼저 부딪힐 입력 다섯. 각 줄의 테스트를 담당 Task 에 넣었다.

1. **대소문자만 · 끝 공백만 다른 역할 이름**(`'Admin'` vs `'admin'`, `'관리자 '` vs `'관리자'`) — `utf8mb4_unicode_ci`(PAD SPACE)라 같은 이름이다 → 400 `issues[{ path: ['roleName'] }]`. → Task 11 "이름 중복".
2. **카탈로그에서 지운 옛 키를 가진 역할** — 목록은 저장된 그대로 내고(B6), `permissions` 를 담은 수정은 옛 키 없이 저장된다(화면이 옛 키를 버린 배열을 보낸다). 옛 키를 그대로 다시 보내면 400 `알 수 없는 권한입니다.`. → Task 8 "옛 키", Task 11 "옛 키".
3. **이동 목표값이 범위 밖**(마지막보다 큰 값) — 맨 끝으로 간다(잘라서), 다른 역할의 순서에 구멍이 생기지 않는다. → Task 9 "자르기".
4. **권한이 하나도 없는 역할**(`permissions: []`) — 만들 수 있고(빈 집합은 누구나 덮는다) `[]` 로 저장된다. → Task 11 "빈 권한".
5. **재인증 켬에서 `currentPassword` 가 빈 문자열 · 빠짐** — 400 `issues[{ path: ['currentPassword'] }]` `현재 비밀번호를 입력하세요.`(admin-ui 재인증 창이 그 칸 오류로 띄운다 — 3b D8), 비밀번호를 대조하지 않는다(잠금 카운터가 오르지 않는다). → Task 10 `roles.body.test.ts`, Task 11 "재인증".

## 파일 구조

| 파일                                                                                                 | 책임                                                                             | Task   |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| `packages/admin-shared/src/permissions.ts`                                                           | `definePermissions({ implies })` · 카탈로그의 `implies` · `normalize`            | 1      |
| `packages/admin-shared/src/audit.ts`                                                                 | 역할 액션 4 · 대상 `role` · 라벨                                                 | 2      |
| `packages/admin-server/src/options.ts`                                                               | `permissionCatalog` · `reauth` 옵션                                              | 3      |
| `packages/admin-server/src/accounts/options.ts`                                                      | `AdminPermissionCatalog` · `resolveAccountsConfig`(카탈로그 · 슬롯 키 기동 검사) | 3      |
| `packages/admin-server/src/auth/permission-slots.ts` · `permission.guard.ts`                         | 슬롯 `roles.*` · "하나라도" 판정                                                 | 3      |
| `packages/admin-server/src/tokens.ts`                                                                | `ADMIN_ACCOUNTS_CONFIG`                                                          | 3      |
| `packages/admin-server/src/audit/*`                                                                  | `AuditOptions` → `AuditDeclaration` 이름                                         | 4      |
| `packages/admin-server/src/database/migrations/0009_guard_locks.ts` · `tables/guard-locks.ts`        | 장 · 테이블 타입                                                                 | 5      |
| `packages/admin-server/src/accounts/account-command.ts`                                              | `judgeAccountCommand` · `actorOf` · `outsideOf`                                  | 6      |
| `packages/admin-server/src/accounts/errors.ts`                                                       | `ACCOUNT_MESSAGES`                                                               | 6      |
| `packages/admin-server/src/accounts/permissions-column.ts`                                           | `readPermissionsColumn`                                                          | 6      |
| `packages/admin-server/src/accounts/super-admin.ts`                                                  | 센티넬 잠금 · 셈 · 판정 · `withSuperAdminSurvival`                               | 7      |
| `packages/admin-server/src/accounts/duplicate.ts`                                                    | `isDuplicateOf`(제약 이름 판정)                                                  | 8      |
| `packages/admin-server/src/roles/roles.service.ts`                                                   | 목록 · 만들기 · 수정(8) · 이동 · 삭제(9)                                         | 8 · 9  |
| `packages/admin-server/src/roles/move.ts`                                                            | `planRoleMove`(순수)                                                             | 9      |
| `packages/admin-server/src/accounts/reauth-body.ts` · `roles/roles.body.ts`                          | 재인증 칸 · 권한 목록 스키마 · 본문 파이프                                       | 10     |
| `packages/admin-server/src/roles/roles.controller.ts` · `roles.module.ts`                            | 라우트 다섯 · 감사 · 기동 검사                                                   | 10     |
| `packages/admin-server/src/test-support/accounts.ts` · `admin-app.ts`                                | `TEST_CATALOG` · 판정용 주체 · 역할 모듈을 붙인 앱                               | 8 · 11 |
| `packages/admin-server/src/auth/session.store.ts` · `sessions/sessions.service.ts` · `controller.ts` | 세션 주인 조회 · 권한 상승 검사                                                  | 12     |
| `packages/admin-server/README.md` · `.changeset/admin-server-roles.md` · `docs/*` · `CLAUDE.md`      | 문서 · 릴리스                                                                    | 13     |

**플랜 작성 중 정정(스펙 §14 R2~R4 에 적었다):**

- 판정 파일은 `accounts/account-command.ts` 다(스펙 §8 의 `account-policy.ts`) — 2b 의 `auth/account-policy.ts`(`isResigned` 등)와 이름이 겹친다.
- 역할 모듈은 `AdminReauthService` 를 `@Optional()` 로 받는다 — 인증 모듈이 빠진 앱이 DI 해석 오류가 아니라 `assertAuthModuleRegistered` 의 문구로 멈추게(2c R2 와 같은 이유). 해석된 계정 설정은 모듈 provider `ADMIN_ACCOUNTS_CONFIG` 가 만든다.
- 세션 권한 상승 검사의 조회 둘(`findLiveOwner` · `findUserTarget`)은 `AdminSessionStore` 에 둔다 — 세션 서비스가 `KYSELY` 를 직접 쓰지 않아 단위 테스트의 가짜 저장소로 잴 수 있다.

---

### Task 1: admin-shared — `definePermissions({ implies })` · `implies` · `normalize`

**Files:**

- Modify: `packages/admin-shared/src/permissions.ts`
- Modify: `packages/admin-shared/src/permissions.test.ts`

**Interfaces:**

- Consumes: 없음.
- Produces: `DefinePermissionsOptions<E, P>` 에 `implies?: Partial<Record<P, readonly P[]>>`. `PermissionCatalog<T, E>` 에 `readonly implies: Readonly<Partial<Record<T[keyof T] | E, readonly (T[keyof T] | E)[]>>>` 와 `normalize(values: readonly string[]): (T[keyof T] | E | AllPermission)[]`. Task 3 의 `AdminPermissionCatalog` 가 `'ALL_PERMISSION_VALUES' | 'isPermission' | 'implies' | 'normalize'` 를 Pick 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-shared/src/permissions.test.ts` 끝에 더한다:

```ts
describe('definePermissions — implies · normalize(2d 스펙 ① C1)', () => {
  const posts = definePermissions(
    {
      POSTS_READ: 'board.posts:read',
      POSTS_WRITE: 'board.posts:write',
      POSTS_DELETE: 'board.posts:delete',
      USERS_READ: 'org.users:read',
    },
    {
      implies: {
        'board.posts:write': ['board.posts:read'],
        'board.posts:delete': ['board.posts:write'],
      },
    },
  )

  it('연쇄 함의를 펼치고 카탈로그 순서로 낸다', () => {
    expect(posts.normalize(['board.posts:delete'])).toEqual([
      'board.posts:read',
      'board.posts:write',
      'board.posts:delete',
    ])
    expect(posts.normalize(['org.users:read', 'board.posts:write'])).toEqual([
      'board.posts:read',
      'board.posts:write',
      'org.users:read',
    ])
  })

  it("🔴 '*' 가 섞이면 정확히 ['*'] 하나 — 키 목록으로 펼치지 않는다(hangang 왕복 항등)", () => {
    expect(posts.normalize(['board.posts:read', '*'])).toEqual(['*'])
    expect(posts.normalize(['*'])).toEqual(['*'])
  })

  it('중복은 접고 카탈로그 밖 키는 버린다 · 빈 배열은 빈 배열', () => {
    expect(posts.normalize(['org.users:read', 'org.users:read', 'nope:read'])).toEqual([
      'org.users:read',
    ])
    expect(posts.normalize([])).toEqual([])
  })

  it('순환 함의에서 멈춘다', () => {
    const cyclic = definePermissions(
      { A: 'a:read', B: 'b:read' },
      { implies: { 'a:read': ['b:read'], 'b:read': ['a:read'] } },
    )
    expect(cyclic.normalize(['b:read'])).toEqual(['a:read', 'b:read'])
  })

  it('implies 는 검증된 얼린 표 — 없으면 {}', () => {
    expect(posts.implies).toEqual({
      'board.posts:write': ['board.posts:read'],
      'board.posts:delete': ['board.posts:write'],
    })
    expect(Object.isFrozen(posts.implies)).toBe(true)
    expect(definePermissions({ A: 'a:read' }).implies).toEqual({})
  })

  it('extraValues 도 함의의 키 · 값이 될 수 있다', () => {
    const withExtra = definePermissions(
      { A: 'a:read' },
      { extraValues: ['db.edit.x'] as const, implies: { 'db.edit.x': ['a:read'] } },
    )
    expect(withExtra.normalize(['db.edit.x'])).toEqual(['a:read', 'db.edit.x'])
  })

  it("🔴 카탈로그 밖 키 · 값, '*', 자기 자신은 정의할 때 던진다 — 문제를 모아 한 번에", () => {
    const base = { A: 'a:read', B: 'b:read' } as const
    expect(() => definePermissions(base, { implies: { 'x:read': ['a:read'] } as never })).toThrow(
      '함의 키가 카탈로그 밖이다: x:read',
    )
    expect(() => definePermissions(base, { implies: { 'a:read': ['x:read'] } as never })).toThrow(
      '함의 값이 카탈로그 밖이다: a:read → x:read',
    )
    expect(() => definePermissions(base, { implies: { 'a:read': ['*'] } as never })).toThrow(
      '함의 값이 카탈로그 밖이다: a:read → *',
    )
    expect(() => definePermissions(base, { implies: { '*': ['a:read'] } as never })).toThrow(
      '함의 키가 카탈로그 밖이다: *',
    )
    expect(() => definePermissions(base, { implies: { 'a:read': ['a:read'] } })).toThrow(
      '자기 자신을 함의한다: a:read',
    )
    expect(() => definePermissions(base, { implies: { 'x:read': ['y:read'] } as never })).toThrow(
      '함의 키가 카탈로그 밖이다: x:read / 함의 값이 카탈로그 밖이다: x:read → y:read',
    )
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-shared test permissions`
Expected: FAIL — `posts.normalize is not a function` · `implies` 가 `undefined`(보고서에 붙인다).

- [ ] **Step 3: 구현한다**

`packages/admin-shared/src/permissions.ts`:

① `DefinePermissionsOptions` 를 바꾼다:

```ts
export interface DefinePermissionsOptions<E extends string = never, P extends string = string> {
  /**
   * 카탈로그 객체 밖에서 파생되는 유효 권한 값. crm-v5 의 `db.edit.<item>` 처럼 상수
   * 객체로 나열하지 않고 생성하는 키가 있을 때 쓴다. `ALL_PERMISSION_VALUES` 와 zod
   * 스키마에 함께 들어간다.
   */
  extraValues?: readonly E[]
  /**
   * 함의 표 — 키를 켜면 값의 키들이 함께 켜진다(연쇄를 펼친다). 예: `{ 'org.users:write': ['org.users:read'] }`.
   * 정의할 때 던진다: 키 · 값이 카탈로그 밖 · `'*'` · 자기 자신. 순환은 허용한다(닫힘이 멈춘다).
   * 🔴 서버(`normalize`)와 admin-ui `useRoleEditor({ implies })` 가 이 표 하나를 쓴다 — hangang 은 서버 파일의 표와
   *    화면의 손 사본이 따로 있었다(갈리면 "읽기는 껐는데 편집은 켜진" 집합을 서버가 되살린다).
   */
  implies?: Partial<Record<P, readonly P[]>>
}
```

② `PermissionCatalog` 인터페이스 끝(`createCheck` 아래)에 더한다:

```ts
  /** 검증된 함의 표(얼린 사본). 없으면 `{}`. admin-ui `useRoleEditor({ implies })` 에 그대로 넘긴다 */
  readonly implies: Readonly<Partial<Record<T[keyof T] | E, readonly (T[keyof T] | E)[]>>>
  /**
   * 역할 권한 정규화(3b §9 · hangang `permissions.normalize.ts`). `'*'` 가 있으면 정확히 `['*']` → 아니면 함의 닫힘 →
   * 카탈로그 순서(`ALL_PERMISSION_VALUES`) · 중복 제거. 카탈로그 밖 키는 버린다(서버는 본문 검증이 먼저 막는다).
   */
  normalize(values: readonly string[]): (T[keyof T] | E | AllPermission)[]
```

③ `definePermissions` 시그니처의 `options` 타입을 바꾼다(🔴 `NoInfer` — 함의 표의 키가 `E` 추론에 끼어들지 않게):

```ts
export function definePermissions<const T extends Record<string, string>, E extends string = never>(
  catalog: T,
  options: DefinePermissionsOptions<E, NoInfer<T[keyof T] | E>> = {},
): PermissionCatalog<T, E> {
```

④ 함수 본문에서 `function isPermission(...)` 아래에 더한다:

```ts
const implies = freezeImplies(options.implies ?? {}, permissionSet)

function normalize(list: readonly string[]): P[] {
  if (list.includes(ALL_PERMISSION)) return [ALL_PERMISSION as P]
  const granted = new Set<string>()
  const pending = list.filter((value) => value !== ALL_PERMISSION && permissionSet.has(value))
  while (pending.length > 0) {
    const key = pending.pop() as string
    if (granted.has(key)) continue
    granted.add(key)
    if (Object.hasOwn(implies, key)) pending.push(...(implies[key] ?? []))
  }
  return ALL_PERMISSION_VALUES.filter((value) => value !== ALL_PERMISSION && granted.has(value))
}
```

⑤ 반환 객체에 두 줄을 더한다(`createCheck` 아래):

```ts
    implies: implies as PermissionCatalog<T, E>['implies'],
    normalize,
```

⑥ 파일 끝에 도우미를 더한다:

```ts
/** 함의 표를 검증해 얼린다. 문제를 모아 한 번에 던진다(`defineAuditCatalog` 와 같은 틀). */
function freezeImplies(
  table: Partial<Record<string, readonly string[]>>,
  known: ReadonlySet<string>,
): Readonly<Record<string, readonly string[]>> {
  const problems: string[] = []
  const entries: [string, readonly string[]][] = []
  for (const [key, values] of Object.entries(table)) {
    if (values === undefined) continue
    if (key === ALL_PERMISSION || !known.has(key))
      problems.push(`함의 키가 카탈로그 밖이다: ${key}`)
    for (const value of values) {
      if (value === ALL_PERMISSION || !known.has(value)) {
        problems.push(`함의 값이 카탈로그 밖이다: ${key} → ${value}`)
      } else if (value === key) {
        problems.push(`자기 자신을 함의한다: ${key}`)
      }
    }
    entries.push([key, Object.freeze([...new Set(values)])])
  }
  if (problems.length > 0) throw new Error(`definePermissions: ${problems.join(' / ')}`)
  // 🔴 Object.fromEntries 는 자기 속성으로 만든다 — `__proto__` 같은 키도 대입이 아니라 데이터다.
  return Object.freeze(Object.fromEntries(entries))
}
```

⑦ 파일 머리 주석의 예시 블록 아래에 한 줄을 더한다:

```ts
 * 역할 정규화의 함의 표는 `definePermissions(catalog, { implies })` — 서버(`normalize`)와 화면이 같은 표를 쓴다(2d).
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-shared test permissions && pnpm --filter @ssworks/admin-shared typecheck`
Expected: PASS · 오류 0.

- [ ] **Step 5: 빌드하고 커밋한다**

```bash
pnpm --filter @ssworks/admin-shared build
git add packages/admin-shared/src/permissions.ts packages/admin-shared/src/permissions.test.ts
git commit -m "feat(admin-shared): 권한 카탈로그의 함의 표 · normalize — 서버와 역할 편집 화면이 같은 표를 쓴다" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: admin-shared — 역할 감사 액션 · 대상

**Files:**

- Modify: `packages/admin-shared/src/audit.ts`
- Modify: `packages/admin-shared/src/audit.test.ts`

**Interfaces:**

- Consumes: 없음.
- Produces: `CoreAuditActions.ROLE_CREATE` · `ROLE_UPDATE` · `ROLE_DELETE` · `ROLE_MOVE`, `CoreAuditTargets.ROLE = 'role'` — Task 10 의 `@Audit` 이 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-shared/src/audit.test.ts`:

① `describe('코어 카탈로그'` 의 첫 테스트를 바꾼다:

```ts
it('🔴 액션 18 · 대상 3 · 라벨이 하나씩 — 개수는 이 테스트가 고정한다(산문의 개수는 낡는다)', () => {
  expect(Object.values(CoreAuditActions)).toHaveLength(18)
  expect(Object.values(CoreAuditTargets)).toEqual(['user', 'session', 'role'])
  expect(Object.keys(CORE_AUDIT_ACTION_LABELS).sort()).toEqual(
    [...Object.values(CoreAuditActions)].sort(),
  )
  expect(Object.keys(CORE_AUDIT_TARGET_LABELS).sort()).toEqual(['role', 'session', 'user'])
})
```

② 같은 `describe` 에 더한다:

```ts
it('역할 액션(2d) — hangang 이름 org.role.* 와 라벨', () => {
  expect([
    CoreAuditActions.ROLE_CREATE,
    CoreAuditActions.ROLE_UPDATE,
    CoreAuditActions.ROLE_DELETE,
    CoreAuditActions.ROLE_MOVE,
  ]).toEqual(['org.role.create', 'org.role.update', 'org.role.delete', 'org.role.move'])
  expect(coreAuditCatalog.labelOf('org.role.move')).toBe('역할 표시 순서 변경')
  expect(coreAuditCatalog.targetLabelOf('role')).toBe('역할')
})
```

③ `describe('defineAuditCatalog'` 의 첫 테스트에서 두 줄을 바꾼다:

```ts
expect(catalog.ACTION_VALUES).toHaveLength(19)
expect(catalog.TARGET_VALUES).toEqual(['user', 'session', 'role', 'post'])
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-shared test audit`
Expected: FAIL — 길이 14 ≠ 18 · `CoreAuditActions.ROLE_CREATE` 가 `undefined`.

- [ ] **Step 3: 구현한다**

`packages/admin-shared/src/audit.ts`:

① 머리 주석의 `- 코어 액션은 인증 · 세션만(2c). …` 줄을 바꾼다:

```ts
//  - 코어 액션은 인증 · 세션(2c) · 역할(2d). 사용자 · 팀 · IP 액션은 2d-2~2f 가 더한다. 프로젝트 액션은 `defineAuditCatalog`.
```

② `CoreAuditActions` 의 `SESSION_REVOKE_OTHERS` 아래에 더한다:

```ts
  ROLE_CREATE: 'org.role.create',
  ROLE_UPDATE: 'org.role.update',
  ROLE_DELETE: 'org.role.delete',
  ROLE_MOVE: 'org.role.move',
```

③ `CoreAuditTargets` 를 바꾼다:

```ts
export const CoreAuditTargets = { USER: 'user', SESSION: 'session', ROLE: 'role' } as const
```

④ `CORE_AUDIT_ACTION_LABELS` 의 `'session.revoke.others'` 아래에 더한다:

```ts
  'org.role.create': '역할 생성',
  'org.role.update': '역할 수정',
  'org.role.delete': '역할 삭제',
  'org.role.move': '역할 표시 순서 변경',
```

⑤ `CORE_AUDIT_TARGET_LABELS` 에 `role: '역할',` 을 더한다.

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-shared test audit && pnpm --filter @ssworks/admin-shared typecheck`
Expected: PASS.

- [ ] **Step 5: 빌드 · admin-server 감사 테스트 확인 · 커밋**

```bash
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server test audit
git add packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts
git commit -m "feat(admin-shared): 코어 감사 액션에 역할 넷(org.role.*) · 대상 role" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: admin-server 감사 테스트도 초록(개수를 고정한 곳은 admin-shared 뿐이다).

---

### Task 3: 옵션 · 역할 슬롯 · 슬롯 "하나라도" · 계정 설정 기동 검사

**Files:**

- Modify: `packages/admin-server/src/options.ts`
- Create: `packages/admin-server/src/accounts/options.ts`
- Create: `packages/admin-server/src/accounts/options.test.ts`
- Modify: `packages/admin-server/src/tokens.ts`
- Modify: `packages/admin-server/src/auth/permission-slots.ts`
- Modify: `packages/admin-server/src/auth/permission-slots.test.ts`
- Modify: `packages/admin-server/src/auth/permission.guard.ts`
- Modify: `packages/admin-server/src/auth/permission.guard.test.ts`

**Interfaces:**

- Consumes: Task 1 의 `PermissionCatalog['implies' | 'normalize']`.
- Produces:
  - `AdminServerOptions.permissionCatalog?: AdminPermissionCatalog` · `reauth?: boolean`.
  - `type AdminPermissionCatalog = Pick<PermissionCatalog<Record<string, string>, string>, 'ALL_PERMISSION_VALUES' | 'isPermission' | 'implies' | 'normalize'>`.
  - `interface ResolvedAccountsConfig { readonly catalog: AdminPermissionCatalog; readonly reauth: boolean }`.
  - `resolveAccountsConfig(options: Pick<AdminServerOptions, 'permissionCatalog' | 'reauth' | 'permissions'>, moduleName: string): ResolvedAccountsConfig`.
  - `ADMIN_ACCOUNTS_CONFIG: unique symbol`(tokens.ts).
  - `AdminPermissionSlot` 에 `'roles.read' | 'roles.manage'`, `RequirePermissionSlot(...slots: [AdminPermissionSlot, ...AdminPermissionSlot[]])` — 메타는 얼린 배열.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/accounts/options.test.ts`(새 파일):

```ts
import { definePermissions } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { resolveAccountsConfig } from './options.js'

const catalog = definePermissions({
  USERS_READ: 'org.users:read',
  USERS_WRITE: 'org.users:write',
  ROLES_READ: 'org.roles:read',
  ROLES_WRITE: 'org.roles:write',
})

describe('resolveAccountsConfig', () => {
  it('카탈로그를 담고 reauth 기본 false — 얼린 설정', () => {
    const config = resolveAccountsConfig({ permissionCatalog: catalog }, 'AdminRolesModule')
    expect(config.catalog).toBe(catalog)
    expect(config.reauth).toBe(false)
    expect(Object.isFrozen(config)).toBe(true)
    expect(resolveAccountsConfig({ permissionCatalog: catalog, reauth: true }, 'M').reauth).toBe(
      true,
    )
  })

  it('🔴 카탈로그가 없거나 모양이 아니면 모듈 이름과 함께 멈춘다', () => {
    expect(() => resolveAccountsConfig({}, 'AdminRolesModule')).toThrow(
      'AdminRolesModule 은 permissionCatalog 옵션이 있어야 한다',
    )
    expect(() =>
      resolveAccountsConfig({ permissionCatalog: { isPermission: () => true } as never }, 'M'),
    ).toThrow('M 은 permissionCatalog 옵션이 있어야 한다')
  })

  it('🔴 슬롯 맵의 키가 카탈로그에 없으면 모아서 멈춘다(B12 — 오타가 조용히 403 이 되지 않게)', () => {
    expect(() =>
      resolveAccountsConfig(
        {
          permissionCatalog: catalog,
          permissions: {
            'roles.read': 'org.roles:read',
            'roles.manage': 'org.role:write',
            'sessions.read': 'org.user:read',
          },
        },
        'M',
      ),
    ).toThrow(
      'permissions 의 키가 permissionCatalog 에 없다(오타?): roles.manage → org.role:write, sessions.read → org.user:read',
    )
  })

  it("'*' 키도 카탈로그 값이다", () => {
    expect(() =>
      resolveAccountsConfig(
        { permissionCatalog: catalog, permissions: { 'roles.read': '*' } },
        'M',
      ),
    ).not.toThrow()
  })

  it('reauth 가 boolean 이 아니면 멈춘다', () => {
    expect(() =>
      resolveAccountsConfig({ permissionCatalog: catalog, reauth: 'yes' as never }, 'M'),
    ).toThrow('reauth 는 true · false 여야 한다.')
  })
})
```

`packages/admin-server/src/auth/permission-slots.test.ts`:

① `class Routes` 를 바꾸고 `RequirePermissionSlot` 테스트를 바꾼다:

```ts
class Routes {
  @RequirePermissionSlot('sessions.read')
  read() {}

  @RequirePermissionSlot('roles.read', 'users.read' as never)
  either() {}
}

describe('RequirePermissionSlot', () => {
  it('슬롯 이름을 얼린 배열 메타데이터로 남긴다', () => {
    expect(Reflect.getMetadata(PERMISSION_SLOT, Routes.prototype.read)).toEqual(['sessions.read'])
    const either = Reflect.getMetadata(PERMISSION_SLOT, Routes.prototype.either) as unknown[]
    expect(either).toEqual(['roles.read', 'users.read'])
    expect(Object.isFrozen(either)).toBe(true)
  })
})
```

② `it('2c 의 슬롯은 셋'` 을 바꾼다:

```ts
it('슬롯은 다섯 — 2c 셋 + 역할 둘(2d-1)', () => {
  expect(ADMIN_PERMISSION_SLOTS).toEqual([
    'sessions.read',
    'sessions.manage',
    'auditLogs.read',
    'roles.read',
    'roles.manage',
  ])
})
```

`packages/admin-server/src/auth/permission.guard.test.ts`:

① `class SlotRoutes` 에 메서드 둘을 더한다:

```ts
  @RequirePermissionSlot('roles.read', 'sessions.read')
  either() {}

  @RequirePermissionSlot('roles.manage', 'auditLogs.read')
  eitherUnmapped() {}
```

② `describe('AdminPermissionGuard — 권한 슬롯(2c 스펙 ① P1)'` 안에 더한다:

```ts
it('슬롯 여럿은 "하나라도"(2d 스펙 B13) — 이어진 슬롯 하나만 가져도 통과', () => {
  expect(
    slotGuard().canActivate(context(slotRoutes, 'either', principal(['org.users:read']))),
  ).toBe(true)
  expect(() =>
    slotGuard().canActivate(context(slotRoutes, 'either', principal(['user:read']))),
  ).toThrow(BusinessError)
})

it("🔴 이어지지 않은 슬롯은 '*' 에게도 거짓 — 여럿이 다 이어지지 않으면 403", () => {
  const error = rejection(() =>
    slotGuard().canActivate(context(slotRoutes, 'eitherUnmapped', principal(['*']))),
  )
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test accounts/options permission-slots permission.guard`
Expected: FAIL — `Cannot find module './options.js'`(accounts) · 메타가 문자열 · 슬롯 셋.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/tokens.ts` 끝에 더한다:

```ts
/** 내부 — 해석된 계정 설정(`ResolvedAccountsConfig`). 역할 · 사용자 모듈이 코어 옵션의 `permissionCatalog` · `reauth` 로 만든다(2d) */
export const ADMIN_ACCOUNTS_CONFIG = Symbol('ADMIN_ACCOUNTS_CONFIG')
```

`packages/admin-server/src/accounts/options.ts`(새 파일):

```ts
import type { PermissionCatalog } from '@ssworks/admin-shared'
import type { AdminServerOptions } from '../options.js'

// 정본: 없음 — 2d 스펙 ① C1 · ⑦ R1 · B4 · B12. 역할 · 사용자 모듈이 함께 읽는 코어 옵션의 해석.

/**
 * 서버가 쓰는 카탈로그의 부분(2d 스펙 B4). admin-shared `definePermissions()` 결과가 그대로 들어간다(§14 R1-1).
 * `permissionListSchema` 를 쓰지 않는다 — zod 열거형 문구가 카탈로그 값 전부를 나열한다(R1-7).
 */
export type AdminPermissionCatalog = Pick<
  PermissionCatalog<Record<string, string>, string>,
  'ALL_PERMISSION_VALUES' | 'isPermission' | 'implies' | 'normalize'
>

export interface ResolvedAccountsConfig {
  readonly catalog: AdminPermissionCatalog
  /** 켜면 역할 · 사용자 쓰기가 본문 currentPassword 로 재인증한다(⑦ R1) */
  readonly reauth: boolean
}

/**
 * 🔴 기동에서 멈춘다: 카탈로그 없음 · 모양이 아님, `reauth` 가 boolean 이 아님, 슬롯 맵의 키가 카탈로그 밖(B12 — 오타가
 *    조용히 403 으로 남지 않게. 2c R4 는 모르는 **슬롯** 이름을, 이것은 모르는 **키**를 막는다).
 */
export function resolveAccountsConfig(
  options: Pick<AdminServerOptions, 'permissionCatalog' | 'reauth' | 'permissions'>,
  moduleName: string,
): ResolvedAccountsConfig {
  const catalog = options.permissionCatalog
  if (!isCatalog(catalog)) {
    throw new Error(
      `${moduleName} 은 permissionCatalog 옵션이 있어야 한다 — admin-shared definePermissions() 결과를 AdminServerModule 옵션에 넘긴다.`,
    )
  }
  if (options.reauth !== undefined && typeof options.reauth !== 'boolean') {
    throw new Error('reauth 는 true · false 여야 한다.')
  }
  const strays = Object.entries(options.permissions ?? {})
    .filter(([, key]) => typeof key === 'string' && !catalog.isPermission(key))
    .map(([slot, key]) => `${slot} → ${String(key)}`)
  if (strays.length > 0) {
    throw new Error(`permissions 의 키가 permissionCatalog 에 없다(오타?): ${strays.join(', ')}`)
  }
  return Object.freeze({ catalog, reauth: options.reauth === true })
}

function isCatalog(value: unknown): value is AdminPermissionCatalog {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    Array.isArray(candidate.ALL_PERMISSION_VALUES) &&
    typeof candidate.isPermission === 'function' &&
    typeof candidate.normalize === 'function' &&
    typeof candidate.implies === 'object' &&
    candidate.implies !== null
  )
}
```

`packages/admin-server/src/options.ts`:

① import 에 더한다: `import type { AdminPermissionCatalog } from './accounts/options.js'`

② `AdminServerOptions` 의 `audit` 아래에 더한다:

```ts
  /**
   * 프로젝트 권한 카탈로그(admin-shared `definePermissions()` 결과 — 2d 스펙 ① C1). 역할 정규화 · 권한 키 검증이 쓴다.
   * 🔴 `AdminRolesModule` · `AdminUsersModule` 을 쓰면 필수 — 없으면 기동에서 멈춘다. 슬롯 맵의 키도 이 카탈로그 안이어야 한다.
   */
  permissionCatalog?: AdminPermissionCatalog
  /** 기본 false. 켜면 역할 · 사용자 쓰기가 본문 `currentPassword` 로 재인증한다(2d 스펙 ⑦ R1 · Phase 0 §4 #4) */
  reauth?: boolean
```

`packages/admin-server/src/auth/permission-slots.ts`:

① 머리 주석의 `/** 2c 의 셋. …` 과 타입 · 상수를 바꾼다:

```ts
/** 2c 의 셋 + 2d-1 의 역할 둘. 2d-2~2f 가 늘린다 — 유니온이 늘어나는 것은 하위 호환이다 */
export type AdminPermissionSlot =
  'sessions.read' | 'sessions.manage' | 'auditLogs.read' | 'roles.read' | 'roles.manage'

export const ADMIN_PERMISSION_SLOTS: readonly AdminPermissionSlot[] = Object.freeze([
  'sessions.read',
  'sessions.manage',
  'auditLogs.read',
  'roles.read',
  'roles.manage',
])
```

② `RequirePermissionSlot` 를 바꾼다:

```ts
/**
 * 내부 — 패키지 라우트가 권한 슬롯을 선언한다. index 에 내지 않는다.
 * 여럿이면 "하나라도"(2d 스펙 B13 — 역할 목록은 `roles.read` ∨ `users.read`). 이어지지 않은 슬롯은 거짓으로 센다.
 * 🔴 권한 선언과 같은 층이라 `@SelfOnly` 보다 먼저 판정한다(2b 스펙 §14 R3).
 */
export function RequirePermissionSlot(
  ...slots: [AdminPermissionSlot, ...AdminPermissionSlot[]]
): CustomDecorator<string> {
  return SetMetadata(PERMISSION_SLOT, Object.freeze([...slots]))
}
```

`packages/admin-server/src/auth/permission.guard.ts` — `const slot = …` 부터 슬롯 판정까지를 바꾼다:

```ts
const slots = this.reflector.getAllAndOverride<readonly AdminPermissionSlot[] | undefined>(
  PERMISSION_SLOT,
  targets,
)
const required = this.reflector.getAllAndOverride<string[] | undefined>(
  REQUIRED_PERMISSIONS,
  targets,
)
const anyOf = this.reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSIONS, targets)
const hasSlots = slots != null && slots.length > 0
const hasRequired = required != null && required.length > 0
const hasAnyOf = anyOf != null && anyOf.length > 0

if (hasSlots || hasRequired || hasAnyOf) {
  // 🔴 이어지지 않은 슬롯은 '*' 도 거짓 — 기동 검사(assertPermissionSlots)를 피한 조합의 방어선이다(2c 스펙 §4-1).
  //    여럿이면 하나라도 이어져 있고 그 키를 가져야 통과다(2d 스펙 B13).
  if (hasSlots && !slots.some((slot) => this.grantsSlot(principal.permissions, slot))) {
    throw forbidden()
  }
  if (hasRequired && !hasPermission(principal.permissions, ...required)) throw forbidden()
  if (hasAnyOf && !hasAnyPermission(principal.permissions, ...anyOf)) throw forbidden()
  return true
}
```

같은 클래스에 메서드를 더한다(`canActivate` 아래):

```ts
  private grantsSlot(granted: readonly string[], slot: AdminPermissionSlot): boolean {
    const key = this.config.permissions[slot]
    return key != null && hasPermission(granted, key)
  }
```

머리 주석의 마지막 `-` 줄 아래에 더한다:

```ts
//  - 슬롯 여럿은 "하나라도"(2d 스펙 B13).
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test accounts/options permission-slots permission.guard sessions audit && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS(세션 · 감사 모듈 테스트도 — 슬롯 메타가 배열이 돼도 가드가 같은 답) · 오류 0.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/options.ts packages/admin-server/src/tokens.ts packages/admin-server/src/accounts/options.ts packages/admin-server/src/accounts/options.test.ts packages/admin-server/src/auth/permission-slots.ts packages/admin-server/src/auth/permission-slots.test.ts packages/admin-server/src/auth/permission.guard.ts packages/admin-server/src/auth/permission.guard.test.ts
git commit -m "feat(admin-server): permissionCatalog · reauth 옵션, 역할 슬롯 둘, 슬롯 여럿은 하나라도" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `AuditOptions` → `AuditDeclaration` 이름 정리

**Files:**

- Modify: `packages/admin-server/src/audit/audit.decorator.ts`
- Modify: `packages/admin-server/src/audit/audit.interceptor.ts`
- Modify: `packages/admin-server/src/audit/catalog-check.ts`
- Modify: `packages/admin-server/src/audit/entry.ts`
- Modify: `packages/admin-server/src/index.ts`

**Interfaces:**

- Produces: `export interface AuditDeclaration { action: string; targetType?: string; paramKey?: string }` — `Audit(declaration: AuditDeclaration)`. index 가 `type AuditDeclaration` 을 낸다(`AuditOptions` 는 없어진다 — 미발행이라 별칭을 두지 않는다).

- [ ] **Step 1: 지금 이름이 쓰이는 곳을 확인한다**

Run: `git grep -n "AuditOptions" -- packages/admin-server/src packages/admin-server/README.md`
Expected: `audit.decorator.ts` · `audit.interceptor.ts` · `catalog-check.ts` · `entry.ts` · `index.ts` 와 `AdminAuditOptions`(모듈 옵션 — 바꾸지 않는다). README 에는 없다.

- [ ] **Step 2: 이름을 바꾼다**

`packages/admin-server/src/audit/audit.decorator.ts` — 인터페이스와 함수 인자를 바꾸고 주석을 한 줄 더한다:

```ts
/** `@Audit()` 의 선언. 모듈 옵션 `AdminAuditOptions`(카탈로그 · 비밀 키)와 다른 것이다 — 이름이 헷갈려 2d 에서 바꿨다 */
export interface AuditDeclaration {
  action: string
  targetType?: string
  /** 대상 id 로 읽을 경로 변수 이름(crm). 없으면 숫자 경로 변수가 정확히 하나일 때 그것 */
  paramKey?: string
}

/**
 * 이 라우트를 감사 로그에 남긴다 — 성공 · 실패 모두(실패는 핸들러에서 던진 것만, 2c 스펙 ⑧ F1).
 * 🔴 `@Public()` 라우트에는 붙이지 않는다 — 주체가 없어 기록되지 않는다. 붙이면 기동에서 멈춘다(B11).
 */
export function Audit(declaration: AuditDeclaration): CustomDecorator<string> {
  return SetMetadata(AUDIT_META, Object.freeze({ ...declaration }))
}
```

`audit.interceptor.ts` · `catalog-check.ts` · `entry.ts` 에서 `AuditOptions` 를 `AuditDeclaration` 으로 바꾼다(import 줄과 쓰는 자리 모두 — Step 1 의 목록 그대로). `index.ts` 의 줄을 바꾼다:

```ts
export { Audit, type AuditDeclaration } from './audit/audit.decorator.js'
```

- [ ] **Step 3: 남은 이름이 없는지 · 타입 · 테스트**

Run: `git grep -n "AuditOptions" -- packages/admin-server/src && pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server test audit`
Expected: grep 은 `AdminAuditOptions` 줄만(`audit/options.ts` · `options.ts` · `index.ts`), 타입 오류 0, 감사 테스트 초록.

- [ ] **Step 4: 커밋한다**

```bash
git add packages/admin-server/src/audit packages/admin-server/src/index.ts
git commit -m "refactor(admin-server): @Audit 인자 타입 AuditOptions → AuditDeclaration — 모듈 옵션 AdminAuditOptions 와 헷갈림" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 장 `0009_guard_locks` · 테이블 타입

**Files:**

- Create: `packages/admin-server/src/database/migrations/0009_guard_locks.ts`
- Create: `packages/admin-server/src/database/tables/guard-locks.ts`
- Modify: `packages/admin-server/src/database/migrations/index.ts`
- Modify: `packages/admin-server/src/database/types.ts`
- Modify: `packages/admin-server/src/runner.ts`
- Modify: `packages/admin-server/src/database/migrations/index.test.ts`
- Modify: `packages/admin-server/src/database/migrations/ddl.test.ts`
- Modify: `packages/admin-server/src/database/migrations/migrations.db.test.ts`

**Interfaces:**

- Produces: `AdminDatabase.guardLocks: AdminGuardLocksTable`(`{ lockName: string; description: string }`), `ADMIN_MIGRATIONS` 의 아홉째 `'0009_guard_locks'`, 시드 행 `lockName = 'superAdminSurvival'` — Task 7 의 `GUARD_LOCK_SUPER_ADMIN` 과 같은 값.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/database/migrations/index.test.ts`:

① `it('0001~0008 순서'` 를 바꾼다:

```ts
it('0001~0009 순서', () => {
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
  ])
})
```

② `it('🔴 순서 어긋남 …'` 의 기대 문자열 두 군데 끝(`0008_audit_logs / 맞는 순서:` 앞, 그리고 마지막 `'0008_audit_logs'`)을 바꾼다:

```ts
expect(findStubProblems(swapped)).toEqual([
  '파일 이름 순서가 장 순서와 다르다 — 지금: 0002_users, 0001_roles, 0003_teams, 0004_team_closure, ' +
    '0005_team_user_map, 0006_user_employment_periods, 0007_sessions, 0008_audit_logs, 0009_guard_locks / 맞는 순서: 0001_roles, ' +
    '0002_users, 0003_teams, 0004_team_closure, 0005_team_user_map, 0006_user_employment_periods, 0007_sessions, ' +
    '0008_audit_logs, 0009_guard_locks',
])
```

③ `it('🔴 빠진 장을 모아 한 번에 던진다'` 의 기존 기대는 두고(정규식이 아직 맞는다), 그 아래에 한 줄을 더한다 — 🔴 기존 정규식의 백슬래시는 건드리지 않는다:

```ts
expect(() => assertAdminMigrationStubs(dir)).toThrow('빠진 장 0009_guard_locks')
```

`packages/admin-server/src/database/migrations/ddl.test.ts`:

① import 에 `import * as guardLocks from './0009_guard_locks.js'` 를 더하고, `CHAPTERS` 끝에 `['0009_guard_locks', guardLocks],` 를 더한다.

② `describe('0008_audit_logs'` 블록 아래에 더한다:

```ts
describe('0009_guard_locks', () => {
  it('테이블을 만들고 센티넬 행을 넣는다 — 한 장(hangang 012 · 013 을 합침)', async () => {
    const statements = await capture((db) => guardLocks.up(db))
    expect(statements[0]).toMatch(/^create table `guard_locks`/)
    expect(statements.some((s) => s.startsWith('insert into `guard_locks`'))).toBe(true)
  })
})
```

`packages/admin-server/src/database/migrations/migrations.db.test.ts`:

① `CORE_TABLES` 에 `'guard_locks',` 를 `'audit_logs',` 바로 아래에 더한다(이름순).

② 파일 끝 `describe` 안 마지막에 더한다:

```ts
it('0009 — 센티넬 행이 하나다(lock_name PK)', async () => {
  const rows = await t.db.selectFrom('guardLocks').selectAll().execute()
  expect(rows).toEqual([
    { lockName: 'superAdminSurvival', description: expect.stringContaining('FOR UPDATE') },
  ])
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test migrations`
Expected: FAIL — `Cannot find module './0009_guard_locks.js'` · 목록 8개.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/database/migrations/0009_guard_locks.ts`(새 파일):

```ts
import type { Kysely } from 'kysely'
import { TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/012_guard_locks.migration.ts ·
//       013_guard_lock_super_admin_seed.migration.ts
// 바꾼 점: 테이블과 시드 행을 한 장에 둔다(2d 스펙 §4-7). 인자 타입 Kysely<unknown>(2a R2).
// 🔴 행 하나가 직렬화 지점 하나다. 한 트랜잭션은 이 테이블의 행을 둘 이상 잡지 않는다 — 잠금 순서가 갈려 교착한다.
// 🔴 시드 이름은 상수 import 없이 리터럴이다 — 장은 한 번 적용되면 고정이다. accounts/super-admin.ts 의
//    GUARD_LOCK_SUPER_ADMIN 과 같은 값인지는 super-admin.db.test.ts 가 잰다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('guardLocks')
    .addColumn('lockName', 'varchar(32)', (col) =>
      col.primaryKey().modifyEnd(comment('잠금 이름. 행 하나가 곧 직렬화 지점 하나다')),
    )
    .addColumn('description', 'varchar(200)', (col) =>
      col.notNull().modifyEnd(comment('이 행이 무엇을 직렬화하는지 — 행 자체가 문서다')),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db
    .withTables<{ guardLocks: { lockName: string; description: string } }>()
    .insertInto('guardLocks')
    .values({
      lockName: 'superAdminSurvival',
      description:
        "전체 권한('*') 재직자 수를 줄일 수 있는 쓰기를 직렬화한다. 각 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다",
    })
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('guardLocks').execute()
}
```

`withTables` 가 `Kysely<unknown>` 에서 타입 오류를 내면(예상하지 않는다) INSERT 를 `sql` 로 바꾼다 — 🔴 `sql` 안 식별자는 CamelCasePlugin 이 바꾸지 않으므로 snake 로 쓴다:

```ts
await sql`insert into guard_locks (lock_name, description) values (${'superAdminSurvival'}, ${"전체 권한('*') 재직자 수를 줄일 수 있는 쓰기를 직렬화한다. 각 트랜잭션의 첫 문장에서 이 행을 FOR UPDATE 로 잡는다"})`.execute(
  db,
)
```

(그 경우 `import { sql, type Kysely } from 'kysely'`.)

`packages/admin-server/src/database/tables/guard-locks.ts`(새 파일):

```ts
// 정본: hangang-home apps/api/src/core/database/tables/guard-locks.table.ts
// 바꾼 점: 없음.

/** 직렬화 지점 — 행 하나를 `FOR UPDATE` 로 잡는다(2d 스펙 §5-3). 앱은 읽기 · 잠금만 하고 쓰지 않는다 */
export interface AdminGuardLocksTable {
  lockName: string
  description: string
}
```

`packages/admin-server/src/database/types.ts`: import `import type { AdminGuardLocksTable } from './tables/guard-locks.js'`, `AdminDatabase` 끝에 `guardLocks: AdminGuardLocksTable`, 머리 주석의 `코어 8키만` 을 `코어 9키만` 으로, 아래 `export type { … }` 목록에 `AdminGuardLocksTable,` 를 더한다.

`packages/admin-server/src/runner.ts` 의 `export type { … } from './database/types.js'` 목록에 `AdminGuardLocksTable,` 를 `AdminAuditLogsTable,` 아래에 더한다.

`packages/admin-server/src/database/migrations/index.ts`: `import * as guardLocks from './0009_guard_locks.js'` 를 더하고, `ADMIN_MIGRATIONS` 끝에 `'0009_guard_locks',`, `CHAPTERS` 끝에 `'0009_guard_locks': guardLocks,` 를 더한다.

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test migrations && pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server test:db migrations`
Expected: PASS — DDL 의 snake · camel 검사가 0009 에도 돈다, 실 DB 에서 up → down → up 과 센티넬 행.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/database packages/admin-server/src/runner.ts
git commit -m "feat(admin-server): 장 0009_guard_locks — 전권자 잔존을 직렬화하는 센티넬 행" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 판정 `judgeAccountCommand` · 문구 · 권한 열 읽기

**Files:**

- Create: `packages/admin-server/src/accounts/errors.ts`
- Create: `packages/admin-server/src/accounts/account-command.ts`
- Create: `packages/admin-server/src/accounts/account-command.test.ts`
- Create: `packages/admin-server/src/accounts/permissions-column.ts`
- Create: `packages/admin-server/src/accounts/permissions-column.test.ts`

**Interfaces:**

- Produces:
  - `ACCOUNT_MESSAGES`(Global Constraints 의 문구 — 키: `noRole` · `noUser` · `unknownPermission` · `duplicateRoleName` · `currentPasswordRequired` · `selfAccount` · `higherAccount` · `higherRoleToGrant` · `higherRoleToEdit` · `higherAccountSessions` · `roleRevisionMismatch` · `roleInUse` · `lastSuperAdmin` · `guardMissing`).
  - `interface AccountActor { readonly userNo: bigint; readonly permissions: readonly string[] }`, `type AccountCommand`(스펙 §5-2 그대로), `actorOf(principal: Pick<AdminPrincipal, 'userNo' | 'permissions'>): AccountActor`, `outsideOf(granted, target): string[]`, `judgeAccountCommand(actor, command): void`(거부면 `BusinessError` 403).
  - `readPermissionsColumn(value: unknown): string[] | null`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/accounts/account-command.test.ts`(새 파일):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { actorOf, judgeAccountCommand, outsideOf, type AccountCommand } from './account-command.js'
import { ACCOUNT_MESSAGES } from './errors.js'

const root = { userNo: 1n, permissions: ['*'] }
const manager = {
  userNo: 2n,
  permissions: ['org.users:read', 'org.users:write', 'org.roles:write'],
}

function rejection(run: () => void): BusinessError {
  try {
    run()
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('던지지 않았다')
}

function expectForbidden(run: () => void, message: string, outside?: string[]): void {
  const error = rejection(run)
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  expect(error.message).toBe(message)
  if (outside !== undefined) expect(error.details).toEqual({ outside })
}

describe('judgeAccountCommand — 역할', () => {
  it('role.create — 새 권한을 덮어야 한다', () => {
    expect(() =>
      judgeAccountCommand(manager, { kind: 'role.create', next: ['org.users:read'] }),
    ).not.toThrow()
    expectForbidden(
      () =>
        judgeAccountCommand(manager, {
          kind: 'role.create',
          next: ['org.users:read', 'setting.auditLog:read'],
        }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['setting.auditLog:read'],
    )
    expectForbidden(
      () => judgeAccountCommand(manager, { kind: 'role.create', next: ['*'] }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['*'],
    )
  })

  it('🔴 role.update — permissions 가 없으면 넓은 역할도 통과(3b §9 — 이름 · 기본 여부는 고칠 수 있다)', () => {
    expect(() =>
      judgeAccountCommand(manager, { kind: 'role.update', current: ['*'] }),
    ).not.toThrow()
  })

  it('role.update — permissions 가 있으면 현재 · 새 권한을 모두 덮어야 한다', () => {
    expectForbidden(
      () =>
        judgeAccountCommand(manager, {
          kind: 'role.update',
          current: ['*'],
          next: ['org.users:read'],
        }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['*'],
    )
    expectForbidden(
      () =>
        judgeAccountCommand(manager, {
          kind: 'role.update',
          current: ['org.users:read'],
          next: ['org.users:read', 'board.posts:read'],
        }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['board.posts:read'],
    )
    expect(() =>
      judgeAccountCommand(manager, {
        kind: 'role.update',
        current: ['org.users:write'],
        next: ['org.users:read'],
      }),
    ).not.toThrow()
  })

  it('role.delete — 현재 권한을 덮어야 한다', () => {
    expectForbidden(
      () =>
        judgeAccountCommand(manager, { kind: 'role.delete', current: ['setting.auditLog:read'] }),
      ACCOUNT_MESSAGES.higherRoleToEdit,
      ['setting.auditLog:read'],
    )
    expect(() => judgeAccountCommand(manager, { kind: 'role.delete', current: [] })).not.toThrow()
  })
})

describe('judgeAccountCommand — 사용자 · 세션', () => {
  it('user.create — 줄 역할을 덮어야 한다', () => {
    expectForbidden(
      () => judgeAccountCommand(manager, { kind: 'user.create', grant: ['*'] }),
      ACCOUNT_MESSAGES.higherRoleToGrant,
      ['*'],
    )
  })

  it('user.update — 대상의 현재 역할 + 새 역할, 자기 계정 허용(이름 · 팀 · 내리는 역할)', () => {
    expectForbidden(
      () => judgeAccountCommand(manager, { kind: 'user.update', targetUserNo: 9n, current: ['*'] }),
      ACCOUNT_MESSAGES.higherAccount,
      ['*'],
    )
    expectForbidden(
      () =>
        judgeAccountCommand(manager, {
          kind: 'user.update',
          targetUserNo: 9n,
          current: [],
          grant: ['setting.auditLog:read'],
        }),
      ACCOUNT_MESSAGES.higherRoleToGrant,
      ['setting.auditLog:read'],
    )
    expect(() =>
      judgeAccountCommand(manager, {
        kind: 'user.update',
        targetUserNo: manager.userNo,
        current: manager.permissions,
        grant: ['org.users:read'],
      }),
    ).not.toThrow()
  })

  it("🔴 자기 계정의 퇴사 · 퇴사일 · 초기화 · 잠금 해제는 403 selfAccount — 덮기보다 먼저('*' 행위자도)", () => {
    for (const kind of [
      'user.resign',
      'user.resignDate',
      'user.passwordReset',
      'user.unlock',
    ] as const) {
      const error = rejection(() =>
        judgeAccountCommand(root, { kind, targetUserNo: root.userNo, current: ['*'] }),
      )
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
      expect(error.message).toBe(ACCOUNT_MESSAGES.selfAccount)
      expectForbidden(
        () => judgeAccountCommand(manager, { kind, targetUserNo: 9n, current: ['*'] }),
        ACCOUNT_MESSAGES.higherAccount,
        ['*'],
      )
      expect(() =>
        judgeAccountCommand(root, { kind, targetUserNo: 9n, current: ['*'] }),
      ).not.toThrow()
    }
  })

  it('user.rehire — 자기 계정 허용(퇴사 예정인 본인), 넓은 계정은 403', () => {
    expect(() =>
      judgeAccountCommand(manager, {
        kind: 'user.rehire',
        targetUserNo: manager.userNo,
        current: [],
      }),
    ).not.toThrow()
    expectForbidden(
      () => judgeAccountCommand(manager, { kind: 'user.rehire', targetUserNo: 9n, current: ['*'] }),
      ACCOUNT_MESSAGES.higherAccount,
    )
  })

  it('session.target — 세션 주인의 역할을 덮어야 한다, 본인은 늘 통과', () => {
    expectForbidden(
      () =>
        judgeAccountCommand(manager, { kind: 'session.target', targetUserNo: 9n, current: ['*'] }),
      ACCOUNT_MESSAGES.higherAccountSessions,
      ['*'],
    )
    expect(() =>
      judgeAccountCommand(manager, {
        kind: 'session.target',
        targetUserNo: manager.userNo,
        current: manager.permissions,
      }),
    ).not.toThrow()
  })

  it("'*' 행위자는 무엇이든 덮는다(자기 계정 넷만 빼고)", () => {
    const commands: AccountCommand[] = [
      { kind: 'role.create', next: ['*'] },
      { kind: 'role.update', current: ['*'], next: ['*'] },
      { kind: 'role.delete', current: ['*'] },
      { kind: 'user.create', grant: ['*'] },
      { kind: 'user.update', targetUserNo: 9n, current: ['*'], grant: ['*'] },
      { kind: 'session.target', targetUserNo: 9n, current: ['*'] },
    ]
    for (const command of commands) expect(() => judgeAccountCommand(root, command)).not.toThrow()
  })
})

describe('outsideOf · actorOf', () => {
  it("덮지 못한 키만 중복 없이, 행위자가 '*' 면 빈 배열", () => {
    expect(outsideOf(['a'], ['a', 'b', 'b', 'c'])).toEqual(['b', 'c'])
    expect(outsideOf(['*'], ['a', '*'])).toEqual([])
    expect(outsideOf([], ['*'])).toEqual(['*'])
  })

  it('주체에서 userNo · permissions 만 꺼낸다', () => {
    expect(actorOf({ userNo: 5n, permissions: ['x'] })).toEqual({ userNo: 5n, permissions: ['x'] })
  })
})
```

`packages/admin-server/src/accounts/permissions-column.test.ts`(새 파일):

```ts
import { describe, expect, it } from 'vitest'
import { readPermissionsColumn } from './permissions-column.js'

describe('readPermissionsColumn', () => {
  it('파싱된 배열 · JSON 문자열 둘 다 — 문자열 원소만', () => {
    expect(readPermissionsColumn(['a', 'b'])).toEqual(['a', 'b'])
    expect(readPermissionsColumn('["a","*"]')).toEqual(['a', '*'])
    expect(readPermissionsColumn(['a', 1, null, 'b'])).toEqual(['a', 'b'])
  })

  it('🔴 배열이 아니거나 깨진 JSON 이면 null — 부르는 쪽이 경고하고 빈 권한으로 본다(fail-closed)', () => {
    expect(readPermissionsColumn({ a: 1 })).toBeNull()
    expect(readPermissionsColumn('{not json')).toBeNull()
    expect(readPermissionsColumn(null)).toBeNull()
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test account-command permissions-column`
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/accounts/errors.ts`(새 파일):

```ts
// 정본: ssworks-gise-home apps/api/src/modules/accounts/account-policy.ts `ACCOUNT_ERROR_MESSAGES`(판정 문구) +
//       hangang-home apps/api/src/modules/roles · users 서비스 문구
// 바꾼 점: 한 표에 모은다(2b AUTH_MESSAGES · 2c SESSION_MESSAGES 와 같은 방식). 사용자 상태 문구는 2d-2 가 더한다.

export const ACCOUNT_MESSAGES = Object.freeze({
  noRole: '역할을 찾을 수 없습니다.',
  noUser: '사용자를 찾을 수 없습니다.',
  unknownPermission: '알 수 없는 권한입니다.',
  duplicateRoleName: '이미 있는 역할 이름입니다.',
  currentPasswordRequired: '현재 비밀번호를 입력하세요.',
  selfAccount: '내 계정에는 이 작업을 할 수 없습니다. 다른 관리자에게 요청하세요.',
  higherAccount: '내 권한보다 넓은 권한을 가진 계정은 바꿀 수 없습니다.',
  higherRoleToGrant: '내 권한보다 넓은 역할은 줄 수 없습니다.',
  higherRoleToEdit: '내 권한보다 넓은 역할은 만들거나 바꾸거나 지울 수 없습니다.',
  higherAccountSessions: '내 권한보다 넓은 권한을 가진 계정의 세션은 다룰 수 없습니다.',
  roleRevisionMismatch: '다른 관리자가 먼저 이 역할을 바꿨습니다. 새로 불러온 내용을 확인하세요.',
  roleInUse: '이 역할을 가진 계정이 있어 지울 수 없습니다. 계정의 역할을 먼저 바꾸세요.',
  lastSuperAdmin:
    '이 변경 뒤에는 전체 권한을 가진 재직 관리자가 한 명도 남지 않습니다. 먼저 다른 관리자에게 전체 권한 역할을 주세요.',
  guardMissing: '동시성 보호 설정이 없어 처리할 수 없습니다.',
})
```

`packages/admin-server/src/accounts/account-command.ts`(새 파일):

```ts
import {
  ALL_PERMISSION,
  BusinessError,
  CommonErrorCodes,
  coversPermissions,
} from '@ssworks/admin-shared'
import type { AdminPrincipal } from '../auth/principal.js'
import { ACCOUNT_MESSAGES } from './errors.js'

// 정본: ssworks-gise-home apps/api/src/modules/accounts/account-policy.ts `judgeAccountCommand` · `judgeSessionTarget`
// 바꾼 점:
//  - 스냅숏 전체가 아니라 서비스가 잠그고 읽은 권한 집합을 명령에 싣는다 — 전량 잠금을 쓰지 않는다(2d 스펙 ④ G1).
//  - 자기 계정은 되돌릴 수 없는 넷만 막는다(③ SF1). 자기 역할의 권한 수정은 허용한다(3b onSelfRoleSaved) — 마지막
//    관리자는 잔존 검사(super-admin.ts)가 지킨다.
//  - 역할 수정은 permissions 가 있을 때만 덮기를 본다(3b §9 — 넓은 역할의 이름은 고칠 수 있다).
//  - revision · 쓰는 중 · 마지막 관리자는 여기서 보지 않는다 — 잠근 행과 셈을 가진 서비스가 본다(2d 스펙 B7).
//  - 403 에 details.outside(덮지 못한 키 — hangang 화면이 문구를 만들던 모양).
// 🔴 2b 의 auth/account-policy.ts(isResigned · isSessionExpired)와 다른 파일이다 — 이름이 겹쳐 이 파일은 account-command.

export interface AccountActor {
  readonly userNo: bigint
  readonly permissions: readonly string[]
}

/** 2d 스펙 §5-2. 권한 집합은 서비스가 트랜잭션 안에서 잠그고 읽은 값이다 */
export type AccountCommand =
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

export function actorOf(principal: Pick<AdminPrincipal, 'userNo' | 'permissions'>): AccountActor {
  return { userNo: principal.userNo, permissions: principal.permissions }
}

/** 덮지 못한 키(중복 없이). 행위자가 '*' 면 빈 배열, 대상이 '*' 면 '*' 가 들어간다 */
export function outsideOf(granted: readonly string[], target: readonly string[]): string[] {
  if (granted.includes(ALL_PERMISSION)) return []
  return [...new Set(target.filter((permission) => !granted.includes(permission)))]
}

/** 거부면 403 `ERR_COMMON_FORBIDDEN` 을 던진다. 순서: 자기 계정 → 현재 권한 → 줄 권한 */
export function judgeAccountCommand(actor: AccountActor, command: AccountCommand): void {
  const demand = (target: readonly string[], message: string): void => {
    if (coversPermissions(actor.permissions, target)) return
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_FORBIDDEN, message, {
      outside: outsideOf(actor.permissions, target),
    })
  }

  switch (command.kind) {
    case 'role.create':
      demand(command.next, ACCOUNT_MESSAGES.higherRoleToEdit)
      return
    case 'role.update':
      if (command.next === undefined) return
      demand(command.current, ACCOUNT_MESSAGES.higherRoleToEdit)
      demand(command.next, ACCOUNT_MESSAGES.higherRoleToEdit)
      return
    case 'role.delete':
      demand(command.current, ACCOUNT_MESSAGES.higherRoleToEdit)
      return
    case 'user.create':
      demand(command.grant, ACCOUNT_MESSAGES.higherRoleToGrant)
      return
    case 'user.update':
      demand(command.current, ACCOUNT_MESSAGES.higherAccount)
      if (command.grant !== undefined) demand(command.grant, ACCOUNT_MESSAGES.higherRoleToGrant)
      return
    case 'user.rehire':
      demand(command.current, ACCOUNT_MESSAGES.higherAccount)
      return
    case 'user.resign':
    case 'user.resignDate':
    case 'user.passwordReset':
    case 'user.unlock':
      // 🔴 되돌릴 수 없는 넷 — 자기 퇴사는 그 즉시 로그아웃되고, 자기 초기화는 임시 비밀번호를 보기 전에 세션이 끊긴다(hangang 화면 문구).
      if (command.targetUserNo === actor.userNo) {
        throw new BusinessError(CommonErrorCodes.ERR_COMMON_FORBIDDEN, ACCOUNT_MESSAGES.selfAccount)
      }
      demand(command.current, ACCOUNT_MESSAGES.higherAccount)
      return
    case 'session.target':
      demand(command.current, ACCOUNT_MESSAGES.higherAccountSessions)
      return
    default: {
      const exhaustive: never = command
      throw new Error(`모르는 계정 명령: ${String((exhaustive as { kind?: unknown }).kind)}`)
    }
  }
}
```

`packages/admin-server/src/accounts/permissions-column.ts`(새 파일):

```ts
import { readJsonColumn } from '../database/json.js'

// 정본: 2b KyselyAuthRepository.readPermissions(fail-closed) — 역할 서비스 · 세션 판정이 같은 읽기를 쓴다.

/**
 * `roles.permissions` → 문자열 배열(문자열 원소만). 🔴 배열이 아니거나 깨진 JSON 이면 null — 부르는 쪽이 역할 번호만
 *    담아 경고하고 빈 권한으로 본다(2b 와 같은 fail-closed — 500 으로 그 역할 전원을 막지 않는다).
 */
export function readPermissionsColumn(value: unknown): string[] | null {
  let parsed: unknown
  try {
    parsed = readJsonColumn(value)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed.filter((item): item is string => typeof item === 'string')
}
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test account-command permissions-column && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS · 오류 0.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/accounts
git commit -m "feat(admin-server): 계정 판정 judgeAccountCommand — 지배 판정 · 자기 계정 넷 · details.outside" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 전권자 잔존 — 센티넬 잠금 · 셈 · 판정

**Files:**

- Create: `packages/admin-server/src/accounts/super-admin.ts`
- Create: `packages/admin-server/src/accounts/super-admin.test.ts`
- Create: `packages/admin-server/src/accounts/super-admin.db.test.ts`

**Interfaces:**

- Consumes: Task 5 의 `AdminDatabase.guardLocks`, Task 6 의 `ACCOUNT_MESSAGES`.
- Produces: `GUARD_LOCK_SUPER_ADMIN = 'superAdminSurvival'`, `lockSuperAdminGuard(trx: Transaction<AdminDatabase>): Promise<void>`, `countSuperAdmins(trx): Promise<number>`, `assertSuperAdminSurvives(before: number, after: number): void`, `withSuperAdminSurvival<T>(trx, write: () => Promise<T>): Promise<T>` — Task 8 · 9 의 역할 쓰기, 2d-2 의 사용자 쓰기가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/accounts/super-admin.test.ts`(새 파일):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from './errors.js'
import { assertSuperAdminSurvives } from './super-admin.js'

describe('assertSuperAdminSurvives', () => {
  it('🔴 있었는데 0 이 되면 409 — 이미 0 인 저장소는 마비시키지 않는다(hangang · gise)', () => {
    let caught: unknown
    try {
      assertSuperAdminSurvives(1, 0)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(BusinessError)
    expect((caught as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect((caught as BusinessError).message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(() => assertSuperAdminSurvives(0, 0)).not.toThrow()
    expect(() => assertSuperAdminSurvives(2, 1)).not.toThrow()
    expect(() => assertSuperAdminSurvives(1, 1)).not.toThrow()
    expect(() => assertSuperAdminSurvives(1, 2)).not.toThrow()
  })
})
```

`packages/admin-server/src/accounts/super-admin.db.test.ts`(새 파일):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { ACCOUNT_MESSAGES } from './errors.js'
import {
  GUARD_LOCK_SUPER_ADMIN,
  countSuperAdmins,
  lockSuperAdminGuard,
  withSuperAdminSurvival,
} from './super-admin.js'

// 🔴 이 파일은 셈을 잰다 — seedRole 의 기본 권한이 ['*'] 이므로 늘 permissions 를 명시한다.

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

const count = (db: TestDatabase['db']) => db.transaction().execute((trx) => countSuperAdmins(trx))

describe('센티넬 행', () => {
  it('장의 리터럴과 잠금 함수의 이름이 같다', async () => {
    expect(await t.db.selectFrom('guardLocks').select('lockName').execute()).toEqual([
      { lockName: GUARD_LOCK_SUPER_ADMIN },
    ])
  })
})

describe('countSuperAdmins', () => {
  it("재직 · '*' 만 센다 — 퇴사 · 퇴사 예정 · '*' 없는 역할 · 'a*' 는 빼고, '*' 와 다른 키가 섞여도 센다(§14 R1-2)", async () => {
    const before = await count(t.db)
    const star = await seedRole(t.db, { roleName: 'cnt-star', permissions: ['*'] })
    const mixed = await seedRole(t.db, {
      roleName: 'cnt-mixed',
      permissions: ['org.users:read', '*'],
    })
    const plain = await seedRole(t.db, { roleName: 'cnt-plain', permissions: ['org.users:read'] })
    const sub = await seedRole(t.db, { roleName: 'cnt-sub', permissions: ['a*'] })
    const empty = await seedRole(t.db, { roleName: 'cnt-empty', permissions: [] })
    await seedUser(t.db, { roleNo: star })
    await seedUser(t.db, { roleNo: mixed })
    await seedUser(t.db, { roleNo: star, resignAt: new Date(Date.now() - 60_000) })
    await seedUser(t.db, { roleNo: star, resignAt: new Date(Date.now() + 86_400_000) })
    await seedUser(t.db, { roleNo: plain })
    await seedUser(t.db, { roleNo: sub })
    await seedUser(t.db, { roleNo: empty })
    expect(await count(t.db)).toBe(before + 2)
  })
})

describe('lockSuperAdminGuard', () => {
  it('🔴 센티넬을 기다린 셈은 앞 트랜잭션의 커밋을 본다(§14 R1-3a — 잠금이 첫 문장이어야 하는 이유)', async () => {
    const role = await seedRole(t.db, { roleName: 'race-star', permissions: ['*'] })
    await seedUser(t.db, { roleNo: role })
    const baseline = await count(t.db)

    const holder = await createConnection({ ...testDbServer(), database: t.name })
    await holder.beginTransaction()
    await holder.query(
      `select lock_name from guard_locks where lock_name = 'superAdminSurvival' for update`,
    )
    await holder.query(`update roles set permissions = '["org.users:read"]' where role_no = ?`, [
      role,
    ])

    const started = Date.now()
    const waiting = t.db.transaction().execute(async (trx) => {
      await lockSuperAdminGuard(trx)
      return { waited: Date.now() - started, count: await countSuperAdmins(trx) }
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
    await holder.commit()
    await holder.end()

    const result = await waiting
    expect(result.waited).toBeGreaterThanOrEqual(350)
    expect(result.count).toBe(baseline - 1)
  })
})

describe('withSuperAdminSurvival', () => {
  // 셈이 0 과 1 사이를 오가야 하므로 데이터베이스를 따로 쓴다.
  let u: TestDatabase

  beforeAll(async () => {
    u = await createTestDatabase()
  })

  afterAll(async () => {
    await u?.drop()
  })

  it('🔴 마지막 전체 권한 재직자를 없애는 쓰기는 409 이고 롤백된다', async () => {
    const role = await seedRole(u.db, { roleName: 'last-star', permissions: ['*'] })
    await seedUser(u.db, { roleNo: role })
    const error = await u.db
      .transaction()
      .execute((trx) =>
        withSuperAdminSurvival(trx, async () => {
          await trx
            .updateTable('roles')
            .set({ permissions: JSON.stringify(['org.users:read']) })
            .where('roleNo', '=', role)
            .execute()
        }),
      )
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BusinessError)
    expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect((error as BusinessError).message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    const after = await u.db
      .selectFrom('roles')
      .select('permissions')
      .where('roleNo', '=', role)
      .executeTakeFirstOrThrow()
    expect(after.permissions).toEqual(['*'])
  })

  it('하나가 남으면 통과하고 결과를 돌려준다', async () => {
    const role = await seedRole(u.db, { roleName: 'second-star', permissions: ['*'] })
    const user = await seedUser(u.db, { roleNo: role })
    const result = await u.db.transaction().execute((trx) =>
      withSuperAdminSurvival(trx, async () => {
        await trx
          .updateTable('users')
          .set({ resignAt: new Date() })
          .where('userNo', '=', user.userNo)
          .execute()
        return 'done'
      }),
    )
    expect(result).toBe('done')
  })

  it('센티넬 행이 없으면 500 ERR_COMMON_INTERNAL — 쓰기 전에 멈춘다', async () => {
    await u.db.deleteFrom('guardLocks').execute()
    try {
      const error = await u.db
        .transaction()
        .execute((trx) => withSuperAdminSurvival(trx, async () => 'never'))
        .catch((caught: unknown) => caught)
      expect((error as BusinessError).code).toBe(CommonErrorCodes.ERR_COMMON_INTERNAL)
      expect((error as BusinessError).message).toBe(ACCOUNT_MESSAGES.guardMissing)
    } finally {
      await u.db
        .insertInto('guardLocks')
        .values({ lockName: GUARD_LOCK_SUPER_ADMIN, description: '테스트가 되돌림' })
        .execute()
    }
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test super-admin && pnpm --filter @ssworks/admin-server test:db super-admin`
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/accounts/super-admin.ts`(새 파일):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { sql, type SqlBool, type Transaction } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { ACCOUNT_MESSAGES } from './errors.js'

// 정본: hangang-home apps/api/src/core/permissions/monotonicity.ts lockSuperAdminGuard · countReachableSuperAdmins ·
//       assertSuperAdminSurvives
// 바꾼 점:
//  - 셈은 재직(resignAt IS NULL) ∧ 역할에 '*'. IP 층(applicableIpLayer — "어디서든 로그인할 수 있는")은 2f 가 더한다.
//  - '*' 판정은 JSON_CONTAINS — hangang 의 LIKE '%"*"%' 는 문자열 매칭이라 '*' 를 품은 키에 오탐한다(2d 스펙 §14 R1-2).
//  - 잠금 · 전 셈 · 쓰기 · 후 셈 · 판정을 withSuperAdminSurvival 하나로 묶는다 — 부르는 쪽이 순서를 틀리지 않게.
// 🔴 잠금은 트랜잭션의 첫 문장이어야 한다 — InnoDB REPEATABLE READ 는 첫 **비잠금** SELECT 에서 읽기 뷰를 만든다. 그보다
//    먼저 셈을 읽으면 앞서 이 행을 쥐었던 트랜잭션의 커밋을 못 본다(§14 R1-3a 실측).
// 🔴 셈에 FOR UPDATE 를 붙이지 않는다 — 대상 행 잠금과 전 행 스캔이 엇갈려 교착한다(hangang).
// 🔴 한 트랜잭션은 guardLocks 행을 둘 이상 잡지 않는다. 이 함수들은 Transaction 만 받는다 — 트랜잭션 밖에서 부를 수 없게.
// 셈을 늘리기만 하는 쓰기(역할 · 사용자 만들기 · 재입사)는 잠그지 않는다 — 늘어나는 것은 놓쳐도 안전하다.

/** 장 0009 의 시드 행 이름 — 장은 리터럴로 넣는다(같은 값인지는 DB 테스트가 잰다) */
export const GUARD_LOCK_SUPER_ADMIN = 'superAdminSurvival'

export async function lockSuperAdminGuard(trx: Transaction<AdminDatabase>): Promise<void> {
  const row = await trx
    .selectFrom('guardLocks')
    .select('lockName')
    .where('lockName', '=', GUARD_LOCK_SUPER_ADMIN)
    .forUpdate()
    .executeTakeFirst()
  if (row === undefined) {
    // 🔴 장 0009 가 빠졌다 — 조용히 보호 없이 쓰지 않는다(hangang fail-loud). 스텁 검사가 먼저 막는다.
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_INTERNAL, ACCOUNT_MESSAGES.guardMissing, {
      lockName: GUARD_LOCK_SUPER_ADMIN,
    })
  }
}

/** 재직(퇴사 예정도 뺀다) · 역할에 '*' 가 있는 사용자 수 */
export async function countSuperAdmins(trx: Transaction<AdminDatabase>): Promise<number> {
  const row = await trx
    .selectFrom('users as u')
    .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
    .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
    .where('u.resignAt', 'is', null)
    .where(sql<SqlBool>`json_contains(${sql.ref('r.permissions')}, '"*"')`)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

/** "0 이면 거부" 가 아니라 "있었는데 0 이 되면 거부" — 이미 0 인 저장소를 마비시키지 않는다 */
export function assertSuperAdminSurvives(before: number, after: number): void {
  if (before >= 1 && after < 1) {
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, ACCOUNT_MESSAGES.lastSuperAdmin)
  }
}

/** 잔존을 줄일 수 있는 쓰기를 감싼다 — 센티넬 잠금(첫 문장) → 전 셈 → write → 후 셈 → 판정(던지면 롤백) */
export async function withSuperAdminSurvival<T>(
  trx: Transaction<AdminDatabase>,
  write: () => Promise<T>,
): Promise<T> {
  await lockSuperAdminGuard(trx)
  const before = await countSuperAdmins(trx)
  const result = await write()
  assertSuperAdminSurvives(before, await countSuperAdmins(trx))
  return result
}
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test super-admin && pnpm --filter @ssworks/admin-server test:db super-admin && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/accounts/super-admin.ts packages/admin-server/src/accounts/super-admin.test.ts packages/admin-server/src/accounts/super-admin.db.test.ts
git commit -m "feat(admin-server): 전권자 잔존 — guardLocks 센티넬 잠금 · 셈 · 있었는데 0 이면 409" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 역할 서비스 — 목록 · 만들기 · 수정

**Files:**

- Create: `packages/admin-server/src/accounts/duplicate.ts`
- Create: `packages/admin-server/src/accounts/duplicate.test.ts`
- Create: `packages/admin-server/src/test-support/accounts.ts`
- Create: `packages/admin-server/src/roles/roles.service.ts`
- Create: `packages/admin-server/src/roles/roles.service.db.test.ts`

**Interfaces:**

- Consumes: Task 3 `ResolvedAccountsConfig` · `ADMIN_ACCOUNTS_CONFIG`, Task 6 `judgeAccountCommand` · `actorOf` · `ACCOUNT_MESSAGES` · `readPermissionsColumn`, Task 7 `withSuperAdminSurvival`, 2b `AdminReauthService.verify(principal, password)`.
- Produces:
  - `isDuplicateOf(error: unknown, constraint: string): boolean`.
  - `type AdminRoleView = { roleNo: bigint; roleName: string; displayOrder: number; isDefault: boolean; permissions: string[]; revision: number }`.
  - `type RoleAuditView = { roleName: string; isDefault: boolean; permissions: readonly string[] }`, `ROLE_AUDIT_FIELDS = ['roleName', 'isDefault', 'permissions'] as const`.
  - `interface AdminRoleCreateBody { roleName: string; isDefault: boolean; permissions: string[]; currentPassword?: string }`, `AdminRoleUpdateBody { revision: number; roleName?: string; isDefault?: boolean; permissions?: string[]; currentPassword?: string }`, `AdminRoleRemoveBody { revision: number; currentPassword?: string }`.
  - `class AdminRolesService` — `list(): Promise<{ items: AdminRoleView[] }>`, `create(body, principal): Promise<{ roleNo: bigint; after: RoleAuditView }>`, `update(roleNo, body, principal): Promise<{ item: AdminRoleView; before: RoleAuditView; after: RoleAuditView }>`. 생성자 `(db: Kysely<AdminDatabase>, config: ResolvedAccountsConfig, reauthService?: AdminReauthService)`.
  - test-support: `TEST_CATALOG`, `accountsConfig(reauth?: boolean): ResolvedAccountsConfig`, `testPrincipal(userNo: bigint, permissions: readonly string[]): AdminPrincipal`, `class FakeReauth`(`'right-password'` 만 받는다, 받은 값을 `calls` 에).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/accounts/duplicate.test.ts`(새 파일):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { isDuplicateOf } from './duplicate.js'

const driverError = {
  code: 'ER_DUP_ENTRY',
  message: `(conn:7, no: 1062, SQLState: 23000) Duplicate entry 'ADMIN' for key 'uq_roles_role_name'`,
}

describe('isDuplicateOf', () => {
  it('드라이버 오류 · mapError 가 감싼 BusinessError 의 cause 둘 다 제약 이름으로 가른다(§14 R1-6)', () => {
    expect(isDuplicateOf(driverError, 'uq_roles_role_name')).toBe(true)
    const wrapped = new BusinessError(
      CommonErrorCodes.ERR_COMMON_DUPLICATED,
      '이미 존재하는 값입니다.',
      undefined,
      {
        cause: driverError,
      },
    )
    expect(isDuplicateOf(wrapped, 'uq_roles_role_name')).toBe(true)
  })

  it('다른 제약 · 다른 코드 · 객체가 아닌 값은 거짓', () => {
    expect(isDuplicateOf(driverError, 'uq_users_user_id')).toBe(false)
    expect(isDuplicateOf({ ...driverError, code: 'ER_LOCK_DEADLOCK' }, 'uq_roles_role_name')).toBe(
      false,
    )
    expect(isDuplicateOf('ER_DUP_ENTRY', 'uq_roles_role_name')).toBe(false)
    expect(
      isDuplicateOf(new BusinessError(CommonErrorCodes.ERR_NO_ROLE, 'x'), 'uq_roles_role_name'),
    ).toBe(false)
  })
})
```

`BusinessError` 생성자의 넷째 인자(`{ cause }`) 모양은 `packages/admin-shared/src/error-codes.ts` 의 `BusinessError` 를 보고 맞춘다 — `mapError` 가 쓰는 그대로다.

`packages/admin-server/src/roles/roles.service.db.test.ts`(새 파일):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { AdminReauthService } from '../auth/reauth.service.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { FakeReauth, accountsConfig, testPrincipal } from '../test-support/accounts.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminRolesService } from './roles.service.js'

// 🔴 이 파일은 잔존 셈을 잰다 — 사용자는 "마지막 관리자" 테스트에서만 만든다. seedRole 은 늘 permissions 를 명시한다.

let t: TestDatabase
let service: AdminRolesService
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.roles:read', 'org.roles:write', 'org.users:read'])

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminRolesService(t.db, accountsConfig(), undefined)
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

async function stored(roleNo: bigint) {
  return t.db
    .selectFrom('roles')
    .select(['roleName', 'permissions', 'displayOrder', 'isDefault', 'revision'])
    .where('roleNo', '=', roleNo)
    .executeTakeFirstOrThrow()
}

describe('list', () => {
  it('displayOrder, roleNo 오름차순 전량 — 권한은 저장된 그대로(옛 키 포함, B6)', async () => {
    const late = await seedRole(t.db, { roleName: 'list-late', permissions: ['org.users:read'] })
    const early = await seedRole(t.db, {
      roleName: 'list-early',
      permissions: ['old.key:read', 'org.users:read'],
    })
    await t.db.updateTable('roles').set({ displayOrder: 90 }).where('roleNo', '=', late).execute()
    await t.db.updateTable('roles').set({ displayOrder: 80 }).where('roleNo', '=', early).execute()
    const { items } = await service.list()
    const mine = items.filter((item) => item.roleName.startsWith('list-'))
    expect(mine.map((item) => item.roleName)).toEqual(['list-early', 'list-late'])
    expect(mine[0]).toMatchObject({
      roleNo: early,
      displayOrder: 80,
      isDefault: false,
      permissions: ['old.key:read', 'org.users:read'],
      revision: 0,
    })
    const orders = items.map((item) => item.displayOrder)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })
})

describe('create', () => {
  it("정규화해 저장한다 — '*' 접기 · 함의 · 카탈로그 순서, 마지막 + 1 · revision 0", async () => {
    const top = await t.db
      .selectFrom('roles')
      .select((eb) => eb.fn.max('displayOrder').as('maxOrder'))
      .executeTakeFirstOrThrow()
    const posts = await service.create(
      {
        roleName: 'create-posts',
        isDefault: false,
        permissions: ['board.posts:delete', 'org.users:write'],
      },
      root,
    )
    expect(await stored(posts.roleNo)).toMatchObject({
      permissions: [
        'org.users:read',
        'org.users:write',
        'board.posts:read',
        'board.posts:write',
        'board.posts:delete',
      ],
      displayOrder: Number(top.maxOrder ?? 0) + 1,
      revision: 0,
      isDefault: false,
    })
    expect(posts.after).toEqual({
      roleName: 'create-posts',
      isDefault: false,
      permissions: [
        'org.users:read',
        'org.users:write',
        'board.posts:read',
        'board.posts:write',
        'board.posts:delete',
      ],
    })
    const all = await service.create(
      { roleName: 'create-all', isDefault: false, permissions: ['org.users:read', '*'] },
      root,
    )
    expect((await stored(all.roleNo)).permissions).toEqual(['*'])
  })

  it('넓은 권한을 만들면 403 + details.outside', async () => {
    const error = await rejection(() =>
      service.create(
        { roleName: 'create-wide', isDefault: false, permissions: ['setting.auditLog:read'] },
        manager,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherRoleToEdit)
    expect(error.details).toEqual({ outside: ['setting.auditLog:read'] })
  })

  it('🔴 이름 중복(대소문자 무시)은 400 issues roleName — 제약 이름으로 가른다(B1)', async () => {
    await service.create({ roleName: 'Dup-Name', isDefault: false, permissions: [] }, root)
    const error = await rejection(() =>
      service.create({ roleName: 'dup-name', isDefault: false, permissions: [] }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(error.details).toEqual({
      issues: [{ path: ['roleName'], code: 'custom', message: ACCOUNT_MESSAGES.duplicateRoleName }],
    })
  })

  it('기본 역할로 만들면 다른 기본 역할을 끄고 그 revision 을 올린다(⑫ D1)', async () => {
    const first = await service.create(
      { roleName: 'default-first', isDefault: true, permissions: [] },
      root,
    )
    const second = await service.create(
      { roleName: 'default-second', isDefault: true, permissions: [] },
      root,
    )
    expect(await stored(first.roleNo)).toMatchObject({ isDefault: false, revision: 1 })
    expect(await stored(second.roleNo)).toMatchObject({ isDefault: true, revision: 0 })
    const defaults = await t.db
      .selectFrom('roles')
      .select('roleNo')
      .where('isDefault', '=', true)
      .execute()
    expect(defaults).toEqual([{ roleNo: second.roleNo }])
  })
})

describe('update', () => {
  it('revision 이 다르면 409, 맞으면 +1 · { item } · before/after', async () => {
    const { roleNo } = await service.create(
      { roleName: 'update-rev', isDefault: false, permissions: ['org.users:read'] },
      root,
    )
    const conflict = await rejection(() =>
      service.update(roleNo, { revision: 5, roleName: 'update-rev2' }, root),
    )
    expect(conflict.code).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
    expect(conflict.message).toBe(ACCOUNT_MESSAGES.roleRevisionMismatch)

    const result = await service.update(
      roleNo,
      { revision: 0, roleName: 'update-rev2', permissions: ['org.users:write'] },
      root,
    )
    expect(result.item).toMatchObject({
      roleNo,
      roleName: 'update-rev2',
      permissions: ['org.users:read', 'org.users:write'],
      revision: 1,
    })
    expect(result.before).toEqual({
      roleName: 'update-rev',
      isDefault: false,
      permissions: ['org.users:read'],
    })
    expect(result.after).toEqual({
      roleName: 'update-rev2',
      isDefault: false,
      permissions: ['org.users:read', 'org.users:write'],
    })
  })

  it('🔴 permissions 없는 본문은 넓은 역할의 이름도 고친다(3b §9), 있으면 403', async () => {
    const { roleNo } = await service.create(
      { roleName: 'update-wide', isDefault: false, permissions: ['*'] },
      root,
    )
    await expect(
      service.update(roleNo, { revision: 0, roleName: 'update-wide2' }, manager),
    ).resolves.toMatchObject({ item: { roleName: 'update-wide2', revision: 1 } })
    const error = await rejection(() =>
      service.update(roleNo, { revision: 1, permissions: ['org.users:read'] }, manager),
    )
    expect(error.message).toBe(ACCOUNT_MESSAGES.higherRoleToEdit)
    expect(error.details).toEqual({ outside: ['*'] })
  })

  it('옛 키는 permissions 를 담은 저장에서 빠진다(Review Focus 2)', async () => {
    const roleNo = await seedRole(t.db, {
      roleName: 'update-stale',
      permissions: ['old.key:read', 'org.users:read'],
    })
    await service.update(roleNo, { revision: 0, permissions: ['org.users:read'] }, root)
    expect((await stored(roleNo)).permissions).toEqual(['org.users:read'])
  })

  it('기본 역할을 켜면 다른 기본 역할을 끄고, 끄면 0개도 허용한다', async () => {
    const a = await service.create({ roleName: 'flag-a', isDefault: true, permissions: [] }, root)
    const b = await service.create({ roleName: 'flag-b', isDefault: false, permissions: [] }, root)
    await service.update(b.roleNo, { revision: 0, isDefault: true }, root)
    expect(await stored(a.roleNo)).toMatchObject({ isDefault: false })
    await service.update(b.roleNo, { revision: 1, isDefault: false }, root)
    const defaults = await t.db
      .selectFrom('roles')
      .select('roleNo')
      .where('isDefault', '=', true)
      .execute()
    expect(defaults).toEqual([])
  })

  it('없는 역할은 404 ERR_NO_ROLE', async () => {
    const error = await rejection(() =>
      service.update(999_999n, { revision: 0, roleName: 'x' }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_NO_ROLE)
    expect(error.message).toBe(ACCOUNT_MESSAGES.noRole)
  })

  it('🔴 마지막 전체 권한 재직자의 역할에서 * 를 빼면 409 · 그대로 남는다', async () => {
    const { roleNo } = await service.create(
      { roleName: 'last-admin-role', isDefault: false, permissions: ['*'] },
      root,
    )
    await seedUser(t.db, { roleNo, userId: 'last-admin' })
    const error = await rejection(() =>
      service.update(roleNo, { revision: 0, permissions: ['org.users:read'] }, root),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    expect(error.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
    expect(await stored(roleNo)).toMatchObject({ permissions: ['*'], revision: 0 })
  })
})

describe('재인증(reauth: true)', () => {
  it('틀리면 403 ERR_REAUTH_REQUIRED 이고 쓰지 않는다, 맞으면 쓴다 — 끄면 묻지 않는다', async () => {
    const reauth = new FakeReauth()
    const guarded = new AdminRolesService(
      t.db,
      accountsConfig(true),
      reauth as unknown as AdminReauthService,
    )
    const wrong = await rejection(() =>
      guarded.create(
        { roleName: 'reauth-role', isDefault: false, permissions: [], currentPassword: 'nope' },
        root,
      ),
    )
    expect(wrong.code).toBe(CommonErrorCodes.ERR_REAUTH_REQUIRED)
    expect(
      await t.db
        .selectFrom('roles')
        .select('roleNo')
        .where('roleName', '=', 'reauth-role')
        .execute(),
    ).toEqual([])
    await guarded.create(
      {
        roleName: 'reauth-role',
        isDefault: false,
        permissions: [],
        currentPassword: 'right-password',
      },
      root,
    )
    expect(reauth.calls).toEqual(['nope', 'right-password'])

    const silent = new FakeReauth()
    const open = new AdminRolesService(
      t.db,
      accountsConfig(false),
      silent as unknown as AdminReauthService,
    )
    await open.create(
      { roleName: 'reauth-off', isDefault: false, permissions: [], currentPassword: 'anything' },
      root,
    )
    expect(silent.calls).toEqual([])
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test duplicate && pnpm --filter @ssworks/admin-server test:db roles.service`
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/accounts/duplicate.ts`(새 파일):

```ts
import { BusinessError } from '@ssworks/admin-shared'

// 정본: 없음 — 2a F10 · R3 "UNIQUE 를 도메인 오류로 바꾸는 일은 그 모듈이 제약 이름을 보고 한다", 2d 스펙 §14 R1-6.

/**
 * 드라이버의 UNIQUE 위반이 이 제약 이름인가. `runWriteTransaction` 이 `mapError` 로 `ERR_COMMON_DUPLICATED` 를 만들어도
 * 원본은 `cause` 에 남는다. 제약 이름은 DB 의 snake_case 다(`uq_roles_role_name` — CamelCasePlugin 이 바꾼 이름).
 * `logParam: false` 에서도 메시지에 키 이름이 실린다(2a R3).
 */
export function isDuplicateOf(error: unknown, constraint: string): boolean {
  const source = error instanceof BusinessError ? (error as Error).cause : error
  if (typeof source !== 'object' || source === null) return false
  const { code, message } = source as { code?: unknown; message?: unknown }
  return (
    code === 'ER_DUP_ENTRY' && typeof message === 'string' && message.includes(`'${constraint}'`)
  )
}
```

`packages/admin-server/src/test-support/accounts.ts`(새 파일):

```ts
import { BusinessError, CommonErrorCodes, definePermissions } from '@ssworks/admin-shared'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import type { AdminPrincipal } from '../auth/principal.js'

// 테스트 전용 — 역할 · 사용자 판정의 카탈로그와 주체(2d). 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).

/** 함의: write ⇒ read, posts delete ⇒ write ⇒ read(연쇄). 카탈로그 순서가 정규화 순서다 */
export const TEST_CATALOG = definePermissions(
  {
    USERS_READ: 'org.users:read',
    USERS_WRITE: 'org.users:write',
    ROLES_READ: 'org.roles:read',
    ROLES_WRITE: 'org.roles:write',
    AUDIT_LOG_READ: 'setting.auditLog:read',
    POSTS_READ: 'board.posts:read',
    POSTS_WRITE: 'board.posts:write',
    POSTS_DELETE: 'board.posts:delete',
  },
  {
    implies: {
      'org.users:write': ['org.users:read'],
      'org.roles:write': ['org.roles:read'],
      'board.posts:write': ['board.posts:read'],
      'board.posts:delete': ['board.posts:write'],
    },
  },
)

export function accountsConfig(reauth = false): ResolvedAccountsConfig {
  return Object.freeze({ catalog: TEST_CATALOG, reauth })
}

/** 판정에 쓰는 주체 — userNo · permissions 만 의미가 있다 */
export function testPrincipal(userNo: bigint, permissions: readonly string[]): AdminPrincipal {
  return {
    userNo,
    sessionNo: 1n,
    userId: `u${userNo}`,
    userName: '시험',
    roleNo: 1n,
    roleName: '시험',
    teamNo: null,
    teamName: null,
    permissions,
    isPasswordChangeRequired: false,
  }
}

/** `AdminReauthService` 대역 — 'right-password' 만 받는다. 받은 값을 차례로 남긴다 */
export class FakeReauth {
  readonly calls: string[] = []

  async verify(_principal: AdminPrincipal, password: string): Promise<void> {
    this.calls.push(password)
    if (password !== 'right-password') {
      throw new BusinessError(CommonErrorCodes.ERR_REAUTH_REQUIRED, '비밀번호가 올바르지 않습니다.')
    }
  }
}
```

`packages/admin-server/src/roles/roles.service.ts`(새 파일 — 이 Task 는 목록 · 만들기 · 수정, Task 9 가 이동 · 삭제를 더한다):

```ts
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely, Transaction } from 'kysely'
import { actorOf, judgeAccountCommand } from '../accounts/account-command.js'
import { isDuplicateOf } from '../accounts/duplicate.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import { readPermissionsColumn } from '../accounts/permissions-column.js'
import { withSuperAdminSurvival } from '../accounts/super-admin.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { validationError } from '../http/validation.js'
import { ADMIN_ACCOUNTS_CONFIG, KYSELY } from '../tokens.js'

// 정본: hangang-home apps/api/src/modules/roles/roles.service.ts(목록 · 만들기 · 수정 · 이동 구간 재번호 · 쓰는 중 409 ·
//       잔존 · 재인증) + ssworks-gise-home revision · 판정 + ssworks-axion-admin 기본 역할 배타
// 바꾼 점:
//  - 목록은 전량(3b §9 — hangang 은 쪽을 나눴다). 권한은 저장된 그대로 낸다(2d 스펙 B6).
//  - 정규화는 카탈로그 normalize(① C1), 권한 상승은 지배 판정(② E1 — hangang 은 새 집합만 봤다).
//  - 수정 · 삭제는 revision(gise). 이동은 revision 을 받지도 올리지도 않는다(3b D1).
//  - 기본 역할은 하나 — 만들기에서도 끈다(axion 은 수정에서만 껐다, ⑫ D1).
//  - 이름 중복은 제약 이름으로 가려 400 roleName 필드 오류(B1 — hangang 은 사전 검사였고 경합 때 일반 코드로 샜다).
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
  ): Promise<{ roleNo: bigint; after: RoleAuditView }> {
    await this.reauth(principal, body.currentPassword)
    const next = this.config.catalog.normalize(body.permissions)
    judgeAccountCommand(actorOf(principal), { kind: 'role.create', next })
    // 만들기는 잔존을 늘리기만 한다 — 센티넬을 잡지 않는다(§5-3).
    const roleNo = await this.guardRoleName(() =>
      runWriteTransaction(this.db, async (trx) => {
        if (body.isDefault) await clearOtherDefaults(trx, null)
        const top = await trx
          .selectFrom('roles')
          .select((eb) => eb.fn.max('displayOrder').as('maxOrder'))
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
        return result.insertId
      }),
    )
    return {
      roleNo,
      after: { roleName: body.roleName, isDefault: body.isDefault, permissions: next },
    }
  }

  async update(
    roleNo: bigint,
    body: AdminRoleUpdateBody,
    principal: AdminPrincipal,
  ): Promise<{ item: AdminRoleView; before: RoleAuditView; after: RoleAuditView }> {
    await this.reauth(principal, body.currentPassword)
    const next =
      body.permissions === undefined ? undefined : this.config.catalog.normalize(body.permissions)
    const actor = actorOf(principal)
    const before = await this.guardRoleName(() =>
      runWriteTransaction(this.db, async (trx) => {
        const write = async (): Promise<RoleAuditView> => {
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
          if (body.isDefault === true && !row.isDefault) await clearOtherDefaults(trx, roleNo)
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
          return { roleName: row.roleName, isDefault: row.isDefault, permissions: current }
        }
        // 🔴 권한을 바꾸는 수정만 잔존을 줄일 수 있다 — 센티넬이 트랜잭션의 첫 문장이 되게 감싼다(§5-3).
        return next === undefined ? write() : withSuperAdminSurvival(trx, write)
      }),
    )
    const item = await this.findOne(roleNo)
    return {
      item,
      before,
      after: { roleName: item.roleName, isDefault: item.isDefault, permissions: item.permissions },
    }
  }

  private async findOne(roleNo: bigint): Promise<AdminRoleView> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('roles')
        .select(ROLE_COLUMNS)
        .where('roleNo', '=', roleNo)
        .executeTakeFirst(),
    )
    if (row === undefined) throw noRole()
    return this.view(row)
  }

  private async reauth(principal: AdminPrincipal, password: string | undefined): Promise<void> {
    if (!this.config.reauth) return
    if (this.reauthService === undefined) {
      // 모듈 기동 검사(assertAuthModuleRegistered)가 막았어야 한다 — 수동 조립의 방어선.
      throw new Error('AdminReauthService 가 없다 — AdminAuthModule 을 import 한다.')
    }
    await this.reauthService.verify(principal, password ?? '')
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
    const parsed = readPermissionsColumn(row.permissions)
    if (parsed !== null) return parsed
    this.logger.warn(`역할 ${row.roleNo} 의 permissions 가 배열이 아니다 — 빈 권한으로 본다.`)
    return []
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

/** ⑫ D1 — 다른 기본 역할을 끄고 그 revision 을 올린다(내용이 바뀌었다 — 그 역할을 열어 둔 편집자는 409 를 받는다) */
async function clearOtherDefaults(
  trx: Transaction<AdminDatabase>,
  except: bigint | null,
): Promise<void> {
  let query = trx
    .updateTable('roles')
    .set((eb) => ({ isDefault: false, revision: eb('revision', '+', 1) }))
    .where('isDefault', '=', true)
  if (except !== null) query = query.where('roleNo', '!=', except)
  await query.execute()
}

function noRole(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_ROLE, ACCOUNT_MESSAGES.noRole)
}
```

`ROLE_AUDIT_FIELDS` 는 Task 10 컨트롤러가 쓴다.

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test duplicate && pnpm --filter @ssworks/admin-server test:db roles.service && pnpm --filter @ssworks/admin-server typecheck && pnpm lint`
Expected: PASS · 오류 0.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/accounts/duplicate.ts packages/admin-server/src/accounts/duplicate.test.ts packages/admin-server/src/test-support/accounts.ts packages/admin-server/src/roles
git commit -m "feat(admin-server): 역할 서비스 — 목록 · 만들기 · 수정(정규화 · 지배 판정 · revision · 기본 역할 하나 · 잔존)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 역할 서비스 — 이동 · 삭제

**Files:**

- Create: `packages/admin-server/src/roles/move.ts`
- Create: `packages/admin-server/src/roles/move.test.ts`
- Modify: `packages/admin-server/src/roles/roles.service.ts`
- Create: `packages/admin-server/src/roles/roles.order.db.test.ts`

**Interfaces:**

- Consumes: Task 8 의 `AdminRolesService` · `lockRole` · `AdminRoleRemoveBody` · `RoleAuditView`.
- Produces: `planRoleMove(from: number, requested: number, lo: number, hi: number): RoleMovePlan`(`{ from; to; shift: { delta: 1 | -1; min: number; max: number } | null }`), `AdminRolesService.move(roleNo: bigint, displayOrder: number): Promise<{ from: number; to: number }>`, `AdminRolesService.remove(roleNo: bigint, body: AdminRoleRemoveBody, principal): Promise<{ before: RoleAuditView }>`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/roles/move.test.ts`(새 파일):

```ts
import { describe, expect, it } from 'vitest'
import { planRoleMove } from './move.js'

describe('planRoleMove — hangang 구간 재번호 + 자르기', () => {
  it('아래로: from < order ≤ to 를 한 칸 당긴다', () => {
    expect(planRoleMove(1, 3, 1, 5)).toEqual({
      from: 1,
      to: 3,
      shift: { delta: -1, min: 2, max: 3 },
    })
  })

  it('위로: to ≤ order < from 을 한 칸 민다', () => {
    expect(planRoleMove(4, 2, 1, 5)).toEqual({
      from: 4,
      to: 2,
      shift: { delta: 1, min: 2, max: 3 },
    })
  })

  it('같은 자리는 쓰기 없음', () => {
    expect(planRoleMove(2, 2, 1, 5)).toEqual({ from: 2, to: 2, shift: null })
  })

  it('🔴 범위 밖 목표는 [가장 작은 값, 가장 큰 값] 으로 자른다 — 구멍을 만들지 않는다(Review Focus 3)', () => {
    expect(planRoleMove(2, 99, 1, 5)).toEqual({
      from: 2,
      to: 5,
      shift: { delta: -1, min: 3, max: 5 },
    })
    expect(planRoleMove(3, 0, 1, 5)).toEqual({
      from: 3,
      to: 1,
      shift: { delta: 1, min: 1, max: 2 },
    })
  })
})
```

`packages/admin-server/src/roles/roles.order.db.test.ts`(새 파일):

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { seedRole, seedUser } from '../test-support/auth.js'
import { accountsConfig, testPrincipal } from '../test-support/accounts.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminRolesService } from './roles.service.js'

// 이동은 순서를 재므로 새 데이터베이스에서 역할 셋(1 · 2 · 3)으로 시작한다. 🔴 seedRole 은 늘 permissions 를 명시한다.

let t: TestDatabase
let service: AdminRolesService
const root = testPrincipal(900n, ['*'])
const manager = testPrincipal(901n, ['org.roles:read', 'org.roles:write'])
let a: bigint
let b: bigint
let c: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminRolesService(t.db, accountsConfig(), undefined)
  a = (await service.create({ roleName: 'order-a', isDefault: false, permissions: [] }, root))
    .roleNo
  b = (await service.create({ roleName: 'order-b', isDefault: false, permissions: [] }, root))
    .roleNo
  c = (await service.create({ roleName: 'order-c', isDefault: false, permissions: [] }, root))
    .roleNo
})

afterAll(async () => {
  await t?.drop()
})

async function rejection(run: () => Promise<unknown>): Promise<BusinessError> {
  const error = await run().catch((caught: unknown) => caught)
  if (error instanceof BusinessError) return error
  throw new Error(`BusinessError 가 아니다: ${String(error)}`)
}

async function orders(): Promise<[string, number, number][]> {
  const rows = await t.db
    .selectFrom('roles')
    .select(['roleName', 'displayOrder', 'revision'])
    .where('roleName', 'like', 'order-%')
    .orderBy('displayOrder')
    .execute()
  return rows.map((row) => [row.roleName, row.displayOrder, row.revision])
}

describe('move', () => {
  it('🔴 이웃 자리로 구간 재번호 — revision 은 그대로(3b D1)', async () => {
    expect(await service.move(c, 1)).toEqual({ from: 3, to: 1 })
    expect(await orders()).toEqual([
      ['order-c', 1, 0],
      ['order-a', 2, 0],
      ['order-b', 3, 0],
    ])
  })

  it('범위 밖 목표는 맨 끝으로 잘린다 · 같은 자리는 아무것도 바꾸지 않는다', async () => {
    expect(await service.move(a, 99)).toEqual({ from: 2, to: 3 })
    expect(await orders()).toEqual([
      ['order-c', 1, 0],
      ['order-b', 2, 0],
      ['order-a', 3, 0],
    ])
    expect(await service.move(a, 3)).toEqual({ from: 3, to: 3 })
  })

  it('없는 역할은 404', async () => {
    const error = await rejection(() => service.move(999_999n, 1))
    expect(error.code).toBe(CommonErrorCodes.ERR_NO_ROLE)
  })
})

describe('remove', () => {
  it('쓰는 중이면 409 ERR_COMMON_IN_USE · revision 이 다르면 409 REVISION_CONFLICT', async () => {
    const used = await seedRole(t.db, { roleName: 'remove-used', permissions: [] })
    await seedUser(t.db, { roleNo: used })
    const inUse = await rejection(() => service.remove(used, { revision: 0 }, root))
    expect(inUse.code).toBe(CommonErrorCodes.ERR_COMMON_IN_USE)
    expect(inUse.message).toBe(ACCOUNT_MESSAGES.roleInUse)

    const free = await seedRole(t.db, { roleName: 'remove-free', permissions: [] })
    const stale = await rejection(() => service.remove(free, { revision: 3 }, root))
    expect(stale.code).toBe(CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT)
  })

  it('지우고 before 를 돌려준다', async () => {
    const roleNo = await seedRole(t.db, { roleName: 'remove-ok', permissions: ['org.users:read'] })
    expect(await service.remove(roleNo, { revision: 0 }, root)).toEqual({
      before: { roleName: 'remove-ok', isDefault: false, permissions: ['org.users:read'] },
    })
    expect(
      await t.db.selectFrom('roles').select('roleNo').where('roleNo', '=', roleNo).execute(),
    ).toEqual([])
  })

  it('넓은 역할은 403, 없는 역할은 404', async () => {
    const wide = await seedRole(t.db, { roleName: 'remove-wide', permissions: ['*'] })
    const forbidden = await rejection(() => service.remove(wide, { revision: 0 }, manager))
    expect(forbidden.message).toBe(ACCOUNT_MESSAGES.higherRoleToEdit)
    expect(forbidden.details).toEqual({ outside: ['*'] })
    const missing = await rejection(() => service.remove(999_999n, { revision: 0 }, root))
    expect(missing.code).toBe(CommonErrorCodes.ERR_NO_ROLE)
  })

  it("사용자 없는 '*' 역할은 지울 수 있다 — 잔존 셈이 바뀌지 않는다", async () => {
    const lonely = await seedRole(t.db, { roleName: 'remove-lonely-star', permissions: ['*'] })
    await expect(service.remove(lonely, { revision: 0 }, root)).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test roles/move && pnpm --filter @ssworks/admin-server test:db roles.order`
Expected: FAIL — `./move.js` 없음 · `service.move is not a function`.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/roles/move.ts`(새 파일):

```ts
// 정본: hangang-home apps/api/src/modules/roles/roles.service.ts updateDisplayOrder(구간 재번호)
// 바꾼 점: 목표값을 [가장 작은 값, 가장 큰 값] 으로 자른다 — hangang 은 자르지 않아 큰 값이 구멍을 남겼다(2d 스펙 §2-2 공통 3).
//   계산을 순수 함수로 뺐다.

export interface RoleMovePlan {
  from: number
  /** 잘린 목표값 */
  to: number
  /** 다른 역할의 순서를 한 칸 옮길 구간(양끝 포함). 같은 자리면 null */
  shift: { delta: 1 | -1; min: number; max: number } | null
}

export function planRoleMove(
  from: number,
  requested: number,
  lo: number,
  hi: number,
): RoleMovePlan {
  const to = Math.min(Math.max(requested, lo), hi)
  if (to === from) return { from, to, shift: null }
  return from < to
    ? { from, to, shift: { delta: -1, min: from + 1, max: to } }
    : { from, to, shift: { delta: 1, min: to, max: from - 1 } }
}
```

`packages/admin-server/src/roles/roles.service.ts`:

① import 에 `import { planRoleMove } from './move.js'` 를 더한다.

② 클래스의 `update` 아래에 두 메서드를 더한다:

```ts
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
    await this.reauth(principal, body.currentPassword)
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
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test roles/move && pnpm --filter @ssworks/admin-server test:db roles && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS(Task 8 의 `roles.service.db.test.ts` 도).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/roles
git commit -m "feat(admin-server): 역할 이동(구간 재번호 · 자르기 · revision 없음) · 삭제(쓰는 중 409 · revision · 잔존)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 본문 파이프 · 컨트롤러 · `AdminRolesModule` · 배선

**Files:**

- Create: `packages/admin-server/src/accounts/reauth-body.ts`
- Create: `packages/admin-server/src/roles/roles.body.ts`
- Create: `packages/admin-server/src/roles/roles.body.test.ts`
- Create: `packages/admin-server/src/roles/roles.controller.ts`
- Create: `packages/admin-server/src/roles/roles.module.ts`
- Create: `packages/admin-server/src/roles/roles.module.test.ts`
- Modify: `packages/admin-server/src/admin-server.module.ts`
- Modify: `packages/admin-server/src/index.ts`

**Interfaces:**

- Consumes: Task 3 `resolveAccountsConfig` · `ADMIN_ACCOUNTS_CONFIG`, Task 8 · 9 `AdminRolesService` · 본문 타입 · `ROLE_AUDIT_FIELDS`.
- Produces: `currentPasswordField(reauth: boolean): z.ZodType<string | undefined>`, `permissionListSchema(catalog: AdminPermissionCatalog): z.ZodType<string[]>`, `REAUTH_PASSWORD_MAX_LENGTH = 256` — 2d-2 사용자 본문이 같은 것을 쓴다. `RoleCreateBodyPipe` · `RoleUpdateBodyPipe` · `RoleRemoveBodyPipe`. `AdminRolesModule`(index). 라우트 `/admin/roles` 다섯.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/roles/roles.body.test.ts`(새 파일):

```ts
import { BusinessError, CommonErrorCodes, type ValidationIssue } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { accountsConfig } from '../test-support/accounts.js'
import { RoleCreateBodyPipe, RoleRemoveBodyPipe, RoleUpdateBodyPipe } from './roles.body.js'

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

describe('역할 본문 파이프', () => {
  it('🔴 모르는 권한 키는 [permissions, i] 에 짧은 문구 — 카탈로그 값을 나열하지 않는다(§14 R1-7)', () => {
    const pipe = new RoleCreateBodyPipe(accountsConfig())
    expect(
      issues(() =>
        pipe.transform({
          roleName: 'r',
          isDefault: false,
          permissions: ['org.users:read', 'bogus'],
        }),
      ),
    ).toEqual([
      { path: ['permissions', 1], code: 'custom', message: ACCOUNT_MESSAGES.unknownPermission },
    ])
  })

  it("'*' 는 카탈로그 값이다", () => {
    const pipe = new RoleCreateBodyPipe(accountsConfig())
    expect(pipe.transform({ roleName: 'r', isDefault: false, permissions: ['*'] })).toMatchObject({
      permissions: ['*'],
    })
  })

  it('재인증 끔 — 보낸 currentPassword 는 무엇이든 버린다', () => {
    const pipe = new RoleCreateBodyPipe(accountsConfig(false))
    expect(
      pipe.transform({ roleName: 'r', isDefault: false, permissions: [], currentPassword: 12 }),
    ).toEqual({ roleName: 'r', isDefault: false, permissions: [] })
    expect(pipe.transform({ roleName: 'r', isDefault: false, permissions: [] })).toEqual({
      roleName: 'r',
      isDefault: false,
      permissions: [],
    })
  })

  it('🔴 재인증 켬 — 빠짐 · 빈 값은 currentPassword 필드 오류(Review Focus 5, 3b D8 재인증 창)', () => {
    const pipe = new RoleRemoveBodyPipe(accountsConfig(true))
    for (const body of [{ revision: 0 }, { revision: 0, currentPassword: '' }]) {
      expect(issues(() => pipe.transform(body))).toEqual([
        expect.objectContaining({
          path: ['currentPassword'],
          message: ACCOUNT_MESSAGES.currentPasswordRequired,
        }),
      ])
    }
    expect(pipe.transform({ revision: 0, currentPassword: 'pw' })).toEqual({
      revision: 0,
      currentPassword: 'pw',
    })
  })

  it('수정 본문 — revision 만 필수, 나머지는 선택(3b §4-1)', () => {
    const pipe = new RoleUpdateBodyPipe(accountsConfig())
    expect(pipe.transform({ revision: 2 })).toEqual({ revision: 2 })
    expect(issues(() => pipe.transform({ roleName: 'x' }))[0]?.path).toEqual(['revision'])
    expect(issues(() => pipe.transform({ revision: 0, permissions: ['nope'] }))[0]?.path).toEqual([
      'permissions',
      0,
    ])
  })
})
```

`packages/admin-server/src/roles/roles.module.test.ts`(새 파일):

```ts
import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_CATALOG } from '../test-support/accounts.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { AdminRolesModule } from './roles.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = { 'roles.read': 'org.roles:read', 'roles.manage': 'org.roles:write' }

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

describe('AdminRolesModule 배선', () => {
  it('뜨면 다섯 라우트가 /admin/roles 아래에 있고 쿠키 없이는 401', async () => {
    const app = await boot([AdminAuthModule, AdminRolesModule])
    const server = app.getHttpServer()
    for (const [method, path] of [
      ['get', '/admin/roles'],
      ['post', '/admin/roles'],
      ['patch', '/admin/roles/1'],
      ['patch', '/admin/roles/1/move'],
      ['delete', '/admin/roles/1'],
    ] as const) {
      const response = await request(server)[method](path)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다 — DI 오류가 아니라 이 문구로', async () => {
    await expect(boot([AdminRolesModule])).rejects.toThrow(
      'AdminRolesModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 permissionCatalog 가 없으면 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminRolesModule], { permissionCatalog: undefined }),
    ).rejects.toThrow('AdminRolesModule 은 permissionCatalog 옵션이 있어야 한다')
  })

  it('🔴 슬롯 맵의 키가 카탈로그 밖이면 멈춘다(B12)', async () => {
    await expect(
      boot([AdminAuthModule, AdminRolesModule], {
        permissions: { 'roles.read': 'org.role:read', 'roles.manage': 'org.roles:write' },
      }),
    ).rejects.toThrow(
      'permissions 의 키가 permissionCatalog 에 없다(오타?): roles.read → org.role:read',
    )
  })

  it('🔴 역할 슬롯이 빠지면 둘을 모아 멈춘다', async () => {
    await expect(boot([AdminAuthModule, AdminRolesModule], { permissions: {} })).rejects.toThrow(
      'AdminRolesModule 의 권한 슬롯이 이어지지 않았다: roles.read, roles.manage',
    )
  })

  it('감사 모듈과 함께 뜬다 — 역할 라우트의 @Audit 이 코어 카탈로그에 있다', async () => {
    await expect(boot([AdminAuthModule, AdminAuditModule, AdminRolesModule])).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test roles.body roles.module`
Expected: FAIL — `./roles.body.js` · `./roles.module.js` 없음.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/accounts/reauth-body.ts`(새 파일):

```ts
import { z } from 'zod'
import { ACCOUNT_MESSAGES } from './errors.js'
import type { AdminPermissionCatalog } from './options.js'

// 정본: hangang-home apps/api/src/core/utils/reauth-password.schema.ts(1..256 — 작업량 상한이지 정책이 아니다)
// 바꾼 점: 옵션(reauth)에 따라 켜고 끈다(2d 스펙 ⑦ R1 · B5). 끄면 보낸 값을 버린다 — 검증하지도 싣지도 않는다.

export const REAUTH_PASSWORD_MAX_LENGTH = 256

/**
 * 재인증 칸. 켜면 1~256자 필수 — 빠짐 · 빈 값은 그 칸의 필드 오류다(admin-ui 재인증 창이 띄운다, 3b D8). 🔴 파이프에서
 * 멈추므로 비밀번호를 대조하지 않는다 — 잠금 카운터가 오르지 않는다. 끄면 무엇이 와도 undefined.
 */
export function currentPasswordField(reauth: boolean): z.ZodType<string | undefined> {
  if (!reauth)
    return z
      .unknown()
      .optional()
      .transform(() => undefined)
  return z
    .string({ error: ACCOUNT_MESSAGES.currentPasswordRequired })
    .min(1, ACCOUNT_MESSAGES.currentPasswordRequired)
    .max(REAUTH_PASSWORD_MAX_LENGTH)
}

/** 권한 목록 — 원소마다 카탈로그로 거른다. 🔴 zod 열거형 문구는 카탈로그 값 전부를 나열한다(2d 스펙 §14 R1-7) */
export function permissionListSchema(catalog: AdminPermissionCatalog): z.ZodType<string[]> {
  return z.array(
    z.string().refine((value) => catalog.isPermission(value), {
      message: ACCOUNT_MESSAGES.unknownPermission,
    }),
  )
}
```

`packages/admin-server/src/roles/roles.body.ts`(새 파일):

```ts
import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import {
  adminRoleCreateSchema,
  adminRoleRemoveSchema,
  adminRoleUpdateSchema,
} from '@ssworks/admin-shared'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import { currentPasswordField, permissionListSchema } from '../accounts/reauth-body.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_ACCOUNTS_CONFIG } from '../tokens.js'
import type {
  AdminRoleCreateBody,
  AdminRoleRemoveBody,
  AdminRoleUpdateBody,
} from './roles.service.js'

// 정본: hangang-home apps/api/src/modules/roles/roles.dto.ts(재인증 currentPassword) + admin-shared 역할 스키마(3b §4-1)
// 바꾼 점: 스키마가 런타임 옵션(카탈로그 · reauth)에 달려 주입형 파이프로 만든다(2b LoginBodyPipe 와 같은 방식, 2d 스펙
//   B5). `@Body(클래스)` 로 넘기면 Nest 가 모듈 안에서 만든다 — 모듈 provider 에 적지 않는다(2b 와 같다).

@Injectable()
export class RoleCreateBodyPipe implements PipeTransform<unknown, AdminRoleCreateBody> {
  private readonly pipe: ZodValidationPipe<AdminRoleCreateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminRoleCreateSchema.extend({
        permissions: permissionListSchema(config.catalog),
        currentPassword: currentPasswordField(config.reauth),
      }),
    )
  }

  transform(value: unknown): AdminRoleCreateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class RoleUpdateBodyPipe implements PipeTransform<unknown, AdminRoleUpdateBody> {
  private readonly pipe: ZodValidationPipe<AdminRoleUpdateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminRoleUpdateSchema.extend({
        permissions: permissionListSchema(config.catalog).optional(),
        currentPassword: currentPasswordField(config.reauth),
      }),
    )
  }

  transform(value: unknown): AdminRoleUpdateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class RoleRemoveBodyPipe implements PipeTransform<unknown, AdminRoleRemoveBody> {
  private readonly pipe: ZodValidationPipe<AdminRoleRemoveBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminRoleRemoveSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminRoleRemoveBody {
    return this.pipe.transform(value)
  }
}
```

재인증 끔에서 `currentPassword` 키가 출력에 `undefined` 로 남으면 `toEqual` 은 없는 키와 같게 본다(테스트 그대로 통과). 끔 갈래가 빠진 키를 "필수" 로 거부하면(zod 판의 optional 전파 차이) `z.unknown().optional().transform(() => undefined)` 대신 `.optional()` 을 바깥에 한 번 더 감싼다 — `z.unknown().transform(() => undefined).optional()` — 그리고 그 사실을 보고서에 적는다.

`packages/admin-server/src/roles/roles.controller.ts`(새 파일):

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common'
import { CoreAuditActions, CoreAuditTargets, adminRoleMoveSchema } from '@ssworks/admin-shared'
import type { AdminRoleMove } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditDiff, attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import { RequirePermissionSlot } from '../auth/permission-slots.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'
import { RoleCreateBodyPipe, RoleRemoveBodyPipe, RoleUpdateBodyPipe } from './roles.body.js'
import { AdminRolesService, ROLE_AUDIT_FIELDS } from './roles.service.js'
import type {
  AdminRoleCreateBody,
  AdminRoleRemoveBody,
  AdminRoleUpdateBody,
} from './roles.service.js'

// 정본: hangang-home apps/api/src/modules/roles/roles.controller.ts(다섯 라우트 · @Audit · 재인증 본문 · 이동 분리)
// 바꾼 점: 권한은 슬롯(2c ① P1), 목록은 전량(3b §9), 응답은 만들기 { roleNo } · 수정 { item } · 이동 · 삭제 {}(§2-2 공통 10),
//   DELETE 본문에 revision(3b — hangang 은 재인증만).

@Controller('roles')
export class AdminRolesController {
  constructor(private readonly roles: AdminRolesService) {}

  /** 전량 · displayOrder 순(3b §9). 2d-2 가 users.read 를 더한다(⑪ L1 — 사용자 폼의 역할 고르기) */
  @RequirePermissionSlot('roles.read')
  @Get()
  list() {
    return this.roles.list()
  }

  @RequirePermissionSlot('roles.manage')
  @Audit({ action: CoreAuditActions.ROLE_CREATE, targetType: CoreAuditTargets.ROLE })
  @Post()
  async create(
    @Body(RoleCreateBodyPipe) body: AdminRoleCreateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { roleNo, after } = await this.roles.create(body, admin)
    attachAuditTarget(req, roleNo)
    attachAuditDiff(req, null, after, ROLE_AUDIT_FIELDS)
    return { roleNo }
  }

  /** 🔴 재인증 · revision 없음(3b D1). 목표값은 이웃의 displayOrder(admin-ui useRoleEditor) */
  @RequirePermissionSlot('roles.manage')
  @Audit({ action: CoreAuditActions.ROLE_MOVE, targetType: CoreAuditTargets.ROLE })
  @Patch(':roleNo/move')
  async move(
    @Param('roleNo', ParseBigIntPipe) roleNo: bigint,
    @Body(new ZodValidationPipe(adminRoleMoveSchema)) body: AdminRoleMove,
    @Req() req: Request,
  ) {
    attachAuditMeta(req, await this.roles.move(roleNo, body.displayOrder))
    return {}
  }

  @RequirePermissionSlot('roles.manage')
  @Audit({ action: CoreAuditActions.ROLE_UPDATE, targetType: CoreAuditTargets.ROLE })
  @Patch(':roleNo')
  async update(
    @Param('roleNo', ParseBigIntPipe) roleNo: bigint,
    @Body(RoleUpdateBodyPipe) body: AdminRoleUpdateBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { item, before, after } = await this.roles.update(roleNo, body, admin)
    attachAuditDiff(req, before, after, ROLE_AUDIT_FIELDS)
    return { item }
  }

  @RequirePermissionSlot('roles.manage')
  @Audit({ action: CoreAuditActions.ROLE_DELETE, targetType: CoreAuditTargets.ROLE })
  @Delete(':roleNo')
  async remove(
    @Param('roleNo', ParseBigIntPipe) roleNo: bigint,
    @Body(RoleRemoveBodyPipe) body: AdminRoleRemoveBody,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const { before } = await this.roles.remove(roleNo, body, admin)
    attachAuditDiff(req, before, null, ROLE_AUDIT_FIELDS)
    return {}
  }
}
```

`packages/admin-server/src/roles/roles.module.ts`(새 파일):

```ts
import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { resolveAccountsConfig } from '../accounts/options.js'
import { assertAuthModuleRegistered } from '../auth/module-check.js'
import { assertPermissionSlots } from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_ACCOUNTS_CONFIG, ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminRolesController } from './roles.controller.js'
import { AdminRolesService } from './roles.service.js'

// 정본: hangang-home apps/api/src/modules/roles/roles.module.ts
// 바꾼 점: 패키지 기능 모듈(2d 스펙 §4-4) — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin prefix 를 붙인다.
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 해석된 계정 설정은 이 모듈의 provider 다 — 카탈로그 없음 · 슬롯 키 오타는 그 팩토리가 기동에서 멈춘다(B12).

@Module({
  controllers: [AdminRolesController],
  providers: [
    {
      provide: ADMIN_ACCOUNTS_CONFIG,
      useFactory: (options: AdminServerOptions) =>
        resolveAccountsConfig(options, 'AdminRolesModule'),
      inject: [ADMIN_SERVER_OPTIONS],
    },
    AdminRolesService,
  ],
})
export class AdminRolesModule implements OnModuleInit {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_SERVER_OPTIONS) private readonly options: AdminServerOptions,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminRolesModule')
    assertPermissionSlots(
      this.options.permissions,
      ['roles.read', 'roles.manage'],
      'AdminRolesModule',
    )
  }
}
```

`packages/admin-server/src/admin-server.module.ts`: `import { AdminRolesModule } from './roles/roles.module.js'` 를 더하고 `ADMIN_ROUTE_MODULES` 를 `[AdminAuthModule, AdminAuditModule, AdminSessionsModule, AdminRolesModule]` 로.

`packages/admin-server/src/index.ts` 끝에 더한다:

```ts
// 역할 · 판정(PR 2d-1)
export { AdminRolesModule } from './roles/roles.module.js'
export type { AdminPermissionCatalog } from './accounts/options.js'
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test roles sessions.module audit.module && pnpm --filter @ssworks/admin-server typecheck && pnpm lint`
Expected: PASS — 역할 모듈 기동 검사 다섯 · 파이프, 세션 · 감사 모듈 배선 그대로(역할 모듈을 import 하지 않은 앱은 `RouterModule` 이 건너뛴다).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/accounts/reauth-body.ts packages/admin-server/src/roles packages/admin-server/src/admin-server.module.ts packages/admin-server/src/index.ts
git commit -m "feat(admin-server): AdminRolesModule — /admin/roles 다섯 라우트 · 재인증 본문 · 감사 · 기동 검사" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: 실 MariaDB HTTP 계약 — 3b §9 전부 · 감사

**Files:**

- Modify: `packages/admin-server/src/test-support/admin-app.ts`
- Create: `packages/admin-server/src/roles/roles.http.db.test.ts`

**Interfaces:**

- Consumes: Task 10 `AdminRolesModule`, Task 8 `TEST_CATALOG`.
- Produces: `bootAdminApp(db, options?: { reauth?: boolean })` — 역할 모듈 · 카탈로그 · 역할 슬롯이 붙은 앱. `TEST_PERMISSIONS` 에 `'roles.read': 'org.roles:read'` · `'roles.manage': 'org.roles:write'`.

- [ ] **Step 1: 테스트 앱에 역할 모듈을 붙인다**

`packages/admin-server/src/test-support/admin-app.ts`:

① import 에 `import { AdminRolesModule } from '../roles/roles.module.js'` · `import { TEST_CATALOG } from './accounts.js'` 를 더한다.

② `TEST_PERMISSIONS` 를 바꾼다:

```ts
export const TEST_PERMISSIONS = Object.freeze({
  'sessions.read': 'org.users:read',
  'sessions.manage': 'org.users:write',
  'auditLogs.read': 'setting.auditLog:read',
  'roles.read': 'org.roles:read',
  'roles.manage': 'org.roles:write',
})
```

③ `bootAdminApp` 을 바꾼다:

```ts
export interface AdminAppOptions {
  /** 역할(2d-1) · 사용자(2d-2) 쓰기의 재인증. 기본 false */
  reauth?: boolean
}

export function bootAdminApp(
  db: AdminDbConnection,
  options: AdminAppOptions = {},
): Promise<NestExpressApplication> {
  return createHttpApp({
    imports: [
      AdminServerModule.forRoot({
        db,
        auth: { jwtSecret: TEST_JWT_SECRET },
        permissions: TEST_PERMISSIONS,
        permissionCatalog: TEST_CATALOG,
        reauth: options.reauth ?? false,
        audit: { catalog: TEST_AUDIT_CATALOG, secretKeys: ['apiKey'] },
      }),
      AdminAuthModule,
      AdminAuditModule,
      AdminSessionsModule,
      AdminRolesModule,
      AuditProbeModule,
    ],
  })
}
```

머리 주석의 `(2c)` 를 `(2c · 2d-1 역할)` 로 고친다.

- [ ] **Step 2: 계약 테스트를 쓴다**

`packages/admin-server/src/roles/roles.http.db.test.ts`(새 파일):

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminRoleSchema,
  errorRespSchema,
  parseJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'

// 실 MariaDB 의 역할 HTTP 계약(2d 스펙 §9-3 [1]) — admin-ui useRoleEditor 가 기대는 3b §9 그대로.
// 🔴 이 파일은 잔존 셈을 잰다 — 전체 권한 사용자는 boss 하나뿐이다. seedRole 은 늘 permissions 를 명시한다.

let t: TestDatabase
let app: NestExpressApplication
let guarded: NestExpressApplication
let bossRole: bigint
let boss: SeededUser
let manager: SeededUser
let member: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  bossRole = await seedRole(t.db, { roleName: '최고 관리자', permissions: ['*'] })
  const managerRole = await seedRole(t.db, {
    roleName: '역할 관리자',
    permissions: ['org.roles:read', 'org.roles:write', 'org.users:read'],
  })
  const memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  boss = await seedUser(t.db, { roleNo: bossRole, userId: 'boss' })
  manager = await seedUser(t.db, { roleNo: managerRole, userId: 'role-manager' })
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

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data
const listSchema = z.object({ items: z.array(adminRoleSchema) })
const itemSchema = z.object({ item: adminRoleSchema })
const createdSchema = z.object({ roleNo: z.bigint() })

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function roles(agent: Agent) {
  return listSchema.parse(data(await agent.get('/admin/roles').expect(200))).items
}

async function roleNamed(agent: Agent, roleName: string) {
  const found = (await roles(agent)).find((role) => role.roleName === roleName)
  if (found === undefined) throw new Error(`역할 없음: ${roleName}`)
  return found
}

async function create(agent: Agent, body: Record<string, unknown>): Promise<bigint> {
  const response = await agent.post('/admin/roles').send(body).expect(201)
  return createdSchema.parse(data(response)).roleNo
}

describe('목록', () => {
  it('전량 · displayOrder 순 · adminRoleSchema 로 읽힌다 — roles.read 없는 계정은 403', async () => {
    const items = await roles(await signIn(boss))
    expect(items.map((item) => item.roleName)).toContain('최고 관리자')
    const orders = items.map((item) => item.displayOrder)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
    expectError(
      await (await signIn(member)).get('/admin/roles'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})

describe('만들기', () => {
  it("201 { roleNo } · 정규화(함의 · 카탈로그 순서 · '*' 접기)", async () => {
    const agent = await signIn(boss)
    const posts = await create(agent, {
      roleName: 'http-posts',
      isDefault: false,
      permissions: ['board.posts:delete'],
    })
    const all = await create(agent, {
      roleName: 'http-all',
      isDefault: false,
      permissions: ['org.users:read', '*'],
    })
    const items = await roles(agent)
    expect(items.find((item) => item.roleNo === posts)?.permissions).toEqual([
      'board.posts:read',
      'board.posts:write',
      'board.posts:delete',
    ])
    expect(items.find((item) => item.roleNo === all)?.permissions).toEqual(['*'])
  })

  it('빈 권한 역할도 만든다(Review Focus 4)', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, {
      roleName: 'http-empty',
      isDefault: false,
      permissions: [],
    })
    expect((await roles(agent)).find((item) => item.roleNo === roleNo)?.permissions).toEqual([])
  })

  it('모르는 권한 키는 400 issues [permissions, i]', async () => {
    const body = expectError(
      await (await signIn(boss)).post('/admin/roles').send({
        roleName: 'http-bogus',
        isDefault: false,
        permissions: ['org.users:read', 'bogus'],
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(body.details).toEqual({
      issues: [
        { path: ['permissions', 1], code: 'custom', message: ACCOUNT_MESSAGES.unknownPermission },
      ],
    })
  })

  it('넓은 권한은 403 + details.outside', async () => {
    const body = expectError(
      await (
        await signIn(manager)
      )
        .post('/admin/roles')
        .send({ roleName: 'http-wide', isDefault: false, permissions: ['setting.auditLog:read'] }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.higherRoleToEdit,
    )
    expect(body.details).toEqual({ outside: ['setting.auditLog:read'] })
  })

  it('🔴 이름 중복 — 대소문자 · 끝 공백만 달라도 400 issues roleName(Review Focus 1, B1)', async () => {
    const agent = await signIn(boss)
    await create(agent, { roleName: 'Http-Dup', isDefault: false, permissions: [] })
    for (const roleName of ['http-dup', 'Http-Dup ']) {
      const body = expectError(
        await agent.post('/admin/roles').send({ roleName, isDefault: false, permissions: [] }),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(body.details).toEqual({
        issues: [
          { path: ['roleName'], code: 'custom', message: ACCOUNT_MESSAGES.duplicateRoleName },
        ],
      })
    }
  })
})

describe('수정', () => {
  it('revision 이 다르면 409, 맞으면 { item } 의 revision + 1', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, { roleName: 'http-rev', isDefault: false, permissions: [] })
    expectError(
      await agent.patch(`/admin/roles/${roleNo}`).send({ revision: 7, roleName: 'http-rev2' }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      ACCOUNT_MESSAGES.roleRevisionMismatch,
    )
    const { item } = itemSchema.parse(
      data(
        await agent
          .patch(`/admin/roles/${roleNo}`)
          .send({ revision: 0, roleName: 'http-rev2', permissions: ['org.users:write'] })
          .expect(200),
      ),
    )
    expect(item).toMatchObject({
      roleName: 'http-rev2',
      permissions: ['org.users:read', 'org.users:write'],
      revision: 1,
    })
  })

  it('🔴 permissions 없는 본문은 넓은 역할의 이름도 고친다(3b §9), 있으면 403', async () => {
    const agent = await signIn(manager)
    const wide = await create(await signIn(boss), {
      roleName: 'http-wide-role',
      isDefault: false,
      permissions: ['*'],
    })
    await agent
      .patch(`/admin/roles/${wide}`)
      .send({ revision: 0, roleName: 'http-wide-role2' })
      .expect(200)
    expectError(
      await agent
        .patch(`/admin/roles/${wide}`)
        .send({ revision: 1, permissions: ['org.users:read'] }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.higherRoleToEdit,
    )
  })

  it('기본 역할은 하나 — 켜면 다른 기본 역할이 꺼지고 그 revision 이 오른다(⑫ D1)', async () => {
    const agent = await signIn(boss)
    const first = await create(agent, {
      roleName: 'http-default-1',
      isDefault: true,
      permissions: [],
    })
    const second = await create(agent, {
      roleName: 'http-default-2',
      isDefault: false,
      permissions: [],
    })
    await agent.patch(`/admin/roles/${second}`).send({ revision: 0, isDefault: true }).expect(200)
    const items = await roles(agent)
    expect(items.filter((item) => item.isDefault).map((item) => item.roleNo)).toEqual([second])
    expect(items.find((item) => item.roleNo === first)).toMatchObject({
      isDefault: false,
      revision: 1,
    })
  })

  it('🔴 마지막 전체 권한 재직자(boss)의 역할에서 * 를 빼면 409 — 그대로 남는다', async () => {
    const agent = await signIn(boss)
    const current = await roleNamed(agent, '최고 관리자')
    expectError(
      await agent
        .patch(`/admin/roles/${bossRole}`)
        .send({ revision: current.revision, permissions: ['org.roles:read'] }),
      409,
      CommonErrorCodes.ERR_COMMON_CONFLICT,
      ACCOUNT_MESSAGES.lastSuperAdmin,
    )
    expect((await roleNamed(agent, '최고 관리자')).permissions).toEqual(['*'])
  })

  it('옛 키 — 목록은 그대로 보이고, 다시 보내면 400, 빼고 보내면 빠진다(Review Focus 2)', async () => {
    const agent = await signIn(boss)
    const stale = await seedRole(t.db, {
      roleName: 'http-stale',
      permissions: ['old.key:read', 'org.users:read'],
    })
    expect((await roleNamed(agent, 'http-stale')).permissions).toEqual([
      'old.key:read',
      'org.users:read',
    ])
    expectError(
      await agent
        .patch(`/admin/roles/${stale}`)
        .send({ revision: 0, permissions: ['old.key:read', 'org.users:read'] }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    await agent
      .patch(`/admin/roles/${stale}`)
      .send({ revision: 0, permissions: ['org.users:read'] })
      .expect(200)
    expect((await roleNamed(agent, 'http-stale')).permissions).toEqual(['org.users:read'])
  })

  it('없는 역할 404 · 숫자가 아닌 경로 400', async () => {
    const agent = await signIn(boss)
    expectError(
      await agent.patch('/admin/roles/999999').send({ revision: 0, roleName: 'x' }),
      404,
      CommonErrorCodes.ERR_NO_ROLE,
      ACCOUNT_MESSAGES.noRole,
    )
    expectError(
      await agent.patch('/admin/roles/abc').send({ revision: 0, roleName: 'x' }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
  })
})

describe('이동 · 삭제', () => {
  it('🔴 이웃 자리로 구간 재번호 · revision 그대로 · {} — 범위 밖은 맨 끝', async () => {
    const agent = await signIn(boss)
    const one = await create(agent, { roleName: 'http-mv-1', isDefault: false, permissions: [] })
    await create(agent, { roleName: 'http-mv-2', isDefault: false, permissions: [] })
    const three = await create(agent, { roleName: 'http-mv-3', isDefault: false, permissions: [] })
    const target = (await roles(agent)).find((item) => item.roleNo === one)?.displayOrder
    expect(
      (await agent.patch(`/admin/roles/${three}/move`).send({ displayOrder: target }).expect(200))
        .body,
    ).toEqual({ success: true, data: {} })
    const moved = (await roles(agent)).filter((item) => item.roleName.startsWith('http-mv-'))
    expect(moved.map((item) => item.roleName)).toEqual(['http-mv-3', 'http-mv-1', 'http-mv-2'])
    expect(moved.map((item) => item.revision)).toEqual([0, 0, 0])

    await agent.patch(`/admin/roles/${three}/move`).send({ displayOrder: 999_999 }).expect(200)
    const items = await roles(agent)
    expect(items.at(-1)?.roleName).toBe('http-mv-3')
  })

  it('DELETE 본문 { revision } → {} · 쓰는 중 409 IN_USE · revision 409', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, { roleName: 'http-del', isDefault: false, permissions: [] })
    expectError(
      await agent.delete(`/admin/roles/${roleNo}`).send({ revision: 4 }),
      409,
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    )
    expect(
      (await agent.delete(`/admin/roles/${roleNo}`).send({ revision: 0 }).expect(200)).body,
    ).toEqual({
      success: true,
      data: {},
    })
    const current = await roleNamed(agent, '최고 관리자')
    expectError(
      await agent.delete(`/admin/roles/${bossRole}`).send({ revision: current.revision }),
      409,
      CommonErrorCodes.ERR_COMMON_IN_USE,
      ACCOUNT_MESSAGES.roleInUse,
    )
  })
})

describe('재인증(reauth: true)', () => {
  it('🔴 빠짐 · 빈 값 400 currentPassword(카운터 그대로) · 틀림 403 · 맞음 201 — 이동은 묻지 않는다', async () => {
    const agent = await signIn(boss, guarded)
    for (const extra of [{}, { currentPassword: '' }]) {
      const body = expectError(
        await agent
          .post('/admin/roles')
          .send({ roleName: 'reauth-http', isDefault: false, permissions: [], ...extra }),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(body.details).toEqual({
        issues: [
          expect.objectContaining({
            path: ['currentPassword'],
            message: ACCOUNT_MESSAGES.currentPasswordRequired,
          }),
        ],
      })
    }
    const counter = await t.db
      .selectFrom('users')
      .select('loginFailCount')
      .where('userNo', '=', boss.userNo)
      .executeTakeFirstOrThrow()
    expect(counter.loginFailCount).toBe(0)

    expectError(
      await agent.post('/admin/roles').send({
        roleName: 'reauth-http',
        isDefault: false,
        permissions: [],
        currentPassword: 'wrong',
      }),
      403,
      CommonErrorCodes.ERR_REAUTH_REQUIRED,
    )
    const response = await agent
      .post('/admin/roles')
      .send({
        roleName: 'reauth-http',
        isDefault: false,
        permissions: [],
        currentPassword: boss.password,
      })
      .expect(201)
    const roleNo = createdSchema.parse(data(response)).roleNo
    await agent.patch(`/admin/roles/${roleNo}/move`).send({ displayOrder: 1 }).expect(200)

    // 틀린 재인증 한 번은 실패 카운터에 셌다(2b B2) — 다음 테스트가 잠금에 걸리지 않게 되돌린다.
    await t.db
      .updateTable('users')
      .set({ loginFailCount: 0 })
      .where('userNo', '=', boss.userNo)
      .execute()
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

  it('만들기 · 수정 · 이동 · 삭제가 행으로 — 대상 role · diff · meta', async () => {
    const agent = await signIn(boss)
    const roleNo = await create(agent, {
      roleName: 'audit-role',
      isDefault: false,
      permissions: ['org.users:write'],
    })
    await agent
      .patch(`/admin/roles/${roleNo}`)
      .send({ revision: 0, roleName: 'audit-role2' })
      .expect(200)
    await agent.patch(`/admin/roles/${roleNo}/move`).send({ displayOrder: 1 }).expect(200)
    await agent.delete(`/admin/roles/${roleNo}`).send({ revision: 1 }).expect(200)

    const [created] = await auditRows(CoreAuditActions.ROLE_CREATE, roleNo)
    expect(created).toMatchObject({ targetType: 'role', actorUserNo: boss.userNo, statusCode: 201 })
    expect(created?.meta).toEqual({
      before: {},
      after: {
        roleName: 'audit-role',
        isDefault: false,
        permissions: ['org.users:read', 'org.users:write'],
      },
    })
    const [updated] = await auditRows(CoreAuditActions.ROLE_UPDATE, roleNo)
    expect(updated?.meta).toMatchObject({
      before: { roleName: 'audit-role' },
      after: { roleName: 'audit-role2' },
    })
    const [moved] = await auditRows(CoreAuditActions.ROLE_MOVE, roleNo)
    expect(moved?.meta).toMatchObject({ to: 1 })
    const [removed] = await auditRows(CoreAuditActions.ROLE_DELETE, roleNo)
    expect(removed?.meta).toMatchObject({ before: { roleName: 'audit-role2' }, after: {} })
  })

  it('🔴 재인증 켬 — 감사 행 meta 원문에 currentPassword 값이 없다(2c 최종 리뷰 F1)', async () => {
    const agent = await signIn(boss, guarded)
    const response = await agent
      .post('/admin/roles')
      .send({
        roleName: 'audit-reauth',
        isDefault: false,
        permissions: [],
        currentPassword: boss.password,
      })
      .expect(201)
    const roleNo = createdSchema.parse(data(response)).roleNo
    const [row] = await auditRows(CoreAuditActions.ROLE_CREATE, roleNo)
    expect(JSON.stringify(row?.meta)).not.toContain(boss.password)
  })
})
```

`meta` 의 `before: {}` 는 `attachAuditDiff(req, null, after, …)` 가 빈 객체를 만드는 2c 동작 그대로다 — 실제가 `null` 이면 2c `audit-bag.ts` 의 `pick(null)` 이 `{}` 를 돌려주는지 보고 기대를 그 동작에 맞춘다(2c 를 고치지 않는다).

- [ ] **Step 3: 돌린다**

Run: `pnpm --filter @ssworks/admin-server test:db roles.http sessions.http audit.http`
Expected: PASS — 역할 계약 전부, 세션 · 감사 HTTP 계약도 그대로(테스트 앱에 역할 모듈이 붙었을 뿐).

- [ ] **Step 4: 커밋한다**

```bash
git add packages/admin-server/src/test-support/admin-app.ts packages/admin-server/src/roles/roles.http.db.test.ts
git commit -m "test(admin-server): 역할 실 MariaDB HTTP 계약 — 3b §9 · 마지막 관리자 · 재인증 · 감사" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: 남의 세션 끊기의 권한 상승 검사(2c ⑪ D1)

**Files:**

- Modify: `packages/admin-server/src/auth/session.store.ts`
- Modify: `packages/admin-server/src/auth/session.store.db.test.ts`
- Modify: `packages/admin-server/src/sessions/sessions.service.ts`
- Modify: `packages/admin-server/src/sessions/sessions.service.test.ts`
- Modify: `packages/admin-server/src/sessions/sessions.controller.ts`
- Modify: `packages/admin-server/src/sessions/sessions.http.db.test.ts`

**Interfaces:**

- Consumes: Task 6 `judgeAccountCommand` · `actorOf` · `readPermissionsColumn` · `ACCOUNT_MESSAGES`.
- Produces: `interface AdminSessionTarget { userNo: bigint; roleNo: bigint; permissions: unknown }`, `AdminSessionStore.findLiveOwner(sessionNo: bigint, now: Date): Promise<AdminSessionTarget | null>`, `AdminSessionStore.findUserTarget(userNo: bigint): Promise<AdminSessionTarget | null>`. `AdminSessionsService` 생성자는 `(store: AdminSessionStore)` 하나, `revokeUser(userNo: bigint, principal: AdminPrincipal)`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-server/src/auth/session.store.db.test.ts` 끝에 더한다(파일의 `t` · `store` · `roleNo` · `input` 을 그대로 쓴다):

```ts
describe('findLiveOwner · findUserTarget(2d 스펙 §5-5)', () => {
  it('살아 있는 세션의 주인과 그 역할 권한 — 끝난 · 없는 세션은 null', async () => {
    const role = await seedRole(t.db, { roleName: 'owner-role', permissions: ['org.users:read'] })
    const user = await seedUser(t.db, { roleNo: role })
    const live = await store.create(input(user.userNo))
    const dead = await store.create(input(user.userNo))
    await store.revoke(dead, 'terminated', new Date())
    expect(await store.findLiveOwner(live, new Date())).toEqual({
      userNo: user.userNo,
      roleNo: role,
      permissions: ['org.users:read'],
    })
    expect(await store.findLiveOwner(dead, new Date())).toBeNull()
    expect(await store.findLiveOwner(999_999n, new Date())).toBeNull()
  })

  it('사용자와 그 역할 권한 — 없는 사용자는 null', async () => {
    const role = await seedRole(t.db, { roleName: 'target-role', permissions: ['*'] })
    const user = await seedUser(t.db, { roleNo: role })
    expect(await store.findUserTarget(user.userNo)).toEqual({
      userNo: user.userNo,
      roleNo: role,
      permissions: ['*'],
    })
    expect(await store.findUserTarget(999_999n)).toBeNull()
  })
})
```

`packages/admin-server/src/sessions/sessions.service.test.ts`:

① import 에 `import { ACCOUNT_MESSAGES } from '../accounts/errors.js'` 와 `AdminSessionTarget` 타입(`../auth/session.store.js` 의 type import 목록)을 더하고, `import type { Kysely } from 'kysely'` · `import type { AdminDatabase } from '../database/types.js'` 를 지운다.

② `class FakeStore` 에 더한다:

```ts
  owner: AdminSessionTarget | null = { userNo: 4n, roleNo: 2n, permissions: ['org.users:read'] }
  target: AdminSessionTarget | null = { userNo: 4n, roleNo: 2n, permissions: ['org.users:read'] }

  async findLiveOwner() {
    return this.owner
  }

  async findUserTarget() {
    return this.target
  }
```

③ `service` 함수를 바꾼다:

```ts
function service(store: FakeStore): AdminSessionsService {
  return new AdminSessionsService(store as unknown as AdminSessionStore)
}
```

④ `describe('AdminSessionsService'` 안에 더한다:

```ts
const narrow: AdminPrincipal = { ...principal, userNo: 5n, permissions: ['org.users:read'] }

it('🔴 세션 주인이 나보다 넓으면 403 — UPDATE 를 보내지 않는다(2c ⑪ D1)', async () => {
  const store = new FakeStore()
  store.owner = { userNo: 4n, roleNo: 1n, permissions: ['*'] }
  const error = await rejection(() => service(store).revoke(11n, narrow))
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_FORBIDDEN)
  expect(error.message).toBe(ACCOUNT_MESSAGES.higherAccountSessions)
  expect(error.details).toEqual({ outside: ['*'] })
  expect(store.revokeLiveCalls).toEqual([])
})

it('주인이 없으면(끝난 · 없는 세션) 판정 없이 같은 404', async () => {
  const store = new FakeStore()
  store.owner = null
  const error = await rejection(() => service(store).revoke(11n, narrow))
  expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_NOT_FOUND)
  expect(error.message).toBe(SESSION_MESSAGES.notFound)
  expect(store.revokeLiveCalls).toEqual([])
})

it('사용자 전체 — 없는 사용자 404 ERR_NO_USER, 넓은 사용자 403, 덮으면 끊는다', async () => {
  const missing = new FakeStore()
  missing.target = null
  expect((await rejection(() => service(missing).revokeUser(4n, narrow))).code).toBe(
    CommonErrorCodes.ERR_NO_USER,
  )
  const wide = new FakeStore()
  wide.target = { userNo: 4n, roleNo: 1n, permissions: ['*'] }
  expect((await rejection(() => service(wide).revokeUser(4n, narrow))).message).toBe(
    ACCOUNT_MESSAGES.higherAccountSessions,
  )
  expect(wide.revokeAllCalls).toEqual([])
  const ok = new FakeStore()
  expect(await service(ok).revokeUser(4n, narrow)).toBe(2)
  expect(ok.revokeAllCalls).toEqual([
    { userNo: 4n, reason: 'terminated', options: { liveOnly: true } },
  ])
})

it('깨진 권한 열은 빈 권한으로 본다 — 인증 가드와 같은 fail-closed(그 계정은 아무것도 못 한다)', async () => {
  const store = new FakeStore()
  store.owner = { userNo: 4n, roleNo: 1n, permissions: '{broken' }
  await expect(service(store).revoke(11n, narrow)).resolves.toBeUndefined()
})
```

`packages/admin-server/src/sessions/sessions.http.db.test.ts`:

① import 에 `import { ACCOUNT_MESSAGES } from '../accounts/errors.js'` 를 더한다.

② 파일 끝에 더한다:

```ts
describe('권한 상승 검사(2d 스펙 §5-5 — 2c ⑪ D1)', () => {
  it('🔴 나보다 넓은 계정의 세션 하나 · 사용자 전체 끊기는 403 — 그 세션은 살아 있다', async () => {
    const bossRole = await seedRole(t.db, { roleName: '세션 최고', permissions: ['*'] })
    const boss = await seedUser(t.db, { roleNo: bossRole })
    const bossAgent = await signIn(boss)
    const bossNo = await currentSessionNo(bossAgent)
    const agent = await signIn(await seedUser(t.db, { roleNo: managerRole }))

    expect(
      errorRespSchema.parse((await agent.delete(`/admin/sessions/${bossNo}`).expect(403)).body),
    ).toMatchObject({
      code: CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      message: ACCOUNT_MESSAGES.higherAccountSessions,
      details: { outside: ['*'] },
    })
    expectError(
      await agent.delete(`/admin/sessions/user/${boss.userNo}`),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      ACCOUNT_MESSAGES.higherAccountSessions,
    )
    await bossAgent.get('/admin/auth/me').expect(200)
  })

  it('같은 역할의 동료 세션은 끊는다', async () => {
    const agent = await signIn(await seedUser(t.db, { roleNo: managerRole }))
    const peer = await signIn(await seedUser(t.db, { roleNo: managerRole }))
    const peerNo = await currentSessionNo(peer)
    await agent.delete(`/admin/sessions/${peerNo}`).expect(200)
    expect((await peer.get('/admin/auth/me')).status).toBe(401)
  })
})
```

- [ ] **Step 2: 돌려 RED 를 본다**

Run: `pnpm --filter @ssworks/admin-server test sessions.service && pnpm --filter @ssworks/admin-server test:db session.store sessions.http`
Expected: FAIL — `store.findLiveOwner is not a function` · 넓은 세션이 200.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/auth/session.store.ts`:

① 다른 `export interface` 들 옆에 더한다:

```ts
/** 세션 끊기의 권한 상승 검사 대상(2d 스펙 §5-5). permissions 는 역할 열 그대로 — readPermissionsColumn 으로 읽는다 */
export interface AdminSessionTarget {
  userNo: bigint
  roleNo: bigint
  permissions: unknown
}
```

② `revokeLive` 아래에 더한다:

```ts
  /** 살아 있는 세션의 주인과 그 역할 권한. 끝났거나 없으면 null(2d 스펙 §5-5 — 2c ⑪ D1) */
  async findLiveOwner(sessionNo: bigint, now: Date): Promise<AdminSessionTarget | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('sessions as s')
        .innerJoin('users as u', 'u.userNo', 's.userNo')
        .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
        .select(['s.userNo', 'u.roleNo', 'r.permissions'])
        .where('s.sessionNo', '=', sessionNo)
        .where('s.isRevoked', '=', false)
        .where('s.expireAt', '>', now)
        .executeTakeFirst(),
    )
    return row ?? null
  }

  /** 사용자와 그 역할 권한. 없으면 null */
  async findUserTarget(userNo: bigint): Promise<AdminSessionTarget | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('users as u')
        .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
        .select(['u.userNo', 'u.roleNo', 'r.permissions'])
        .where('u.userNo', '=', userNo)
        .executeTakeFirst(),
    )
    return row ?? null
  }
```

`packages/admin-server/src/sessions/sessions.service.ts` — 파일 전체를 이렇게 바꾼다(목록 · 내 세션 · 내 세션 하나 · 다른 세션 모두는 그대로):

```ts
import { Injectable, Logger } from '@nestjs/common'
import { BusinessError, CommonErrorCodes, toListQuery, type Paginated } from '@ssworks/admin-shared'
import { actorOf, judgeAccountCommand } from '../accounts/account-command.js'
import { readPermissionsColumn } from '../accounts/permissions-column.js'
import type { AdminPrincipal } from '../auth/principal.js'
import {
  AdminSessionStore,
  type AdminSessionListRow,
  type AdminSessionMeta,
  type AdminSessionTarget,
} from '../auth/session.store.js'
import { SESSION_MESSAGES } from './errors.js'
import type { AdminSessionListQuery } from './sessions.query.js'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.service.ts(5라우트 · terminated · 남의 세션 404 · runQuery) +
//       ssworks-gise-home apps/api/src/modules/auth/admin-me.service.ts(지금 세션 거부 · revoke-others · { revokedCount })
//       + ssworks-gise-home account-policy.ts judgeSessionTarget(2d — 권한 상승 검사)
// 바꾼 점: 살아 있는 세션만(공통 1), isCurrent 는 액세스 토큰의 sessionNo(공통 2), 지금 세션 거부는 400(③ C1 — gise 403),
//   관리자 "사용자 전체" 는 본인에게도 열린다(admin-ui onSelfSignedOut — gise 는 막았다). 남의 세션은 주인의 역할을 덮어야
//   끊는다(2d 스펙 §5-5 — 2c ⑪ D1). 조회는 저장소에 둔다 — 이 서비스는 KYSELY 를 직접 쓰지 않는다(단위 테스트의 가짜 저장소).

export interface AdminSessionView extends AdminSessionMeta {
  isCurrent: boolean
}

export interface AdminSessionListView extends AdminSessionListRow {
  isCurrent: boolean
}

@Injectable()
export class AdminSessionsService {
  private readonly logger = new Logger('AdminSessionsService')

  constructor(private readonly store: AdminSessionStore) {}

  async list(
    query: AdminSessionListQuery,
    principal: AdminPrincipal,
  ): Promise<Paginated<AdminSessionListView>> {
    const { offset, limit, sort } = toListQuery(query)
    const keyword = query.filter?.keyword
    const userNo = query.filter?.userNo
    const { rows, total } = await this.store.listLive({
      now: new Date(),
      ...(keyword ? { keyword } : {}),
      ...(userNo === undefined ? {} : { userNo }),
      sort,
      offset,
      limit,
    })
    return {
      items: rows.map((row) => ({ ...row, isCurrent: row.sessionNo === principal.sessionNo })),
      total,
      page: query.page,
      itemsPerPage: query.itemsPerPage,
    }
  }

  async listMine(principal: AdminPrincipal): Promise<{ items: AdminSessionView[] }> {
    const rows = await this.store.listLiveOfUser(principal.userNo, new Date())
    return {
      items: rows.map((row) => ({ ...row, isCurrent: row.sessionNo === principal.sessionNo })),
    }
  }

  /**
   * 관리자 하나 끝내기. 🔴 지금 세션 검사가 먼저다 — 본인 세션이라 드러낼 것이 없다. 주인이 없으면(끝난 · 없는 세션) 판정
   * 없이 같은 404, 주인이 나보다 넓으면 403(2c ⑪ D1).
   */
  async revoke(sessionNo: bigint, principal: AdminPrincipal): Promise<void> {
    if (sessionNo === principal.sessionNo) throw currentSession()
    const now = new Date()
    const owner = await this.store.findLiveOwner(sessionNo, now)
    if (owner === null) throw notFound()
    this.judge(principal, owner)
    if ((await this.store.revokeLive(sessionNo, now)) === 0) throw notFound()
  }

  /** 사용자 전체. 본인이면 지금 세션도 끊긴다 — 다음 요청이 401(admin-ui onSelfSignedOut, 2c 스펙 공통 4) */
  async revokeUser(userNo: bigint, principal: AdminPrincipal): Promise<number> {
    const target = await this.store.findUserTarget(userNo)
    if (target === null) {
      throw new BusinessError(CommonErrorCodes.ERR_NO_USER, SESSION_MESSAGES.noUser)
    }
    this.judge(principal, target)
    return this.store.revokeAllOfUser(userNo, 'terminated', new Date(), { liveOnly: true })
  }

  /** 내 세션 하나. 🔴 남의 세션 · 없음 · 끝남이 같은 404 — 내 userNo 를 조건에 단 UPDATE 한 문장이 가른다 */
  async revokeMine(sessionNo: bigint, principal: AdminPrincipal): Promise<void> {
    if (sessionNo === principal.sessionNo) throw currentSession()
    const revoked = await this.store.revokeLive(sessionNo, new Date(), { userNo: principal.userNo })
    if (revoked === 0) throw notFound()
  }

  /** 다른 세션 모두 — 지금 세션을 뺀 살아 있는 것. 0 도 정상이다 */
  revokeOthers(principal: AdminPrincipal): Promise<number> {
    return this.store.revokeAllOfUser(principal.userNo, 'terminated', new Date(), {
      exceptSessionNo: principal.sessionNo,
      liveOnly: true,
    })
  }

  private judge(principal: AdminPrincipal, target: AdminSessionTarget): void {
    let current = readPermissionsColumn(target.permissions)
    if (current === null) {
      // 인증 가드(2b findPrincipal)와 같은 fail-closed — 그 계정은 지금 아무 권한도 없다.
      this.logger.warn(`역할 ${target.roleNo} 의 permissions 가 배열이 아니다 — 빈 권한으로 본다.`)
      current = []
    }
    judgeAccountCommand(actorOf(principal), {
      kind: 'session.target',
      targetUserNo: target.userNo,
      current,
    })
  }
}

function currentSession(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_BAD_REQUEST, SESSION_MESSAGES.currentSession)
}

function notFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, SESSION_MESSAGES.notFound)
}
```

`packages/admin-server/src/sessions/sessions.controller.ts` 의 `revokeUser` 를 바꾼다:

```ts
  @RequirePermissionSlot('sessions.manage')
  @Audit({ action: CoreAuditActions.SESSION_REVOKE_USER, targetType: CoreAuditTargets.USER })
  @Delete('user/:userNo')
  async revokeUser(
    @Param('userNo', ParseBigIntPipe) userNo: bigint,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const revokedCount = await this.sessions.revokeUser(userNo, admin)
    attachAuditMeta(req, { revokedCount })
    return { revokedCount }
  }
```

- [ ] **Step 4: 돌려 GREEN 을 본다**

Run: `pnpm --filter @ssworks/admin-server test sessions && pnpm --filter @ssworks/admin-server test:db session sessions audit && pnpm --filter @ssworks/admin-server typecheck && pnpm lint`
Expected: PASS — 2c 세션 · 감사 계약(대상은 권한 `[]` 인 구성원)도 그대로.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-server/src/auth/session.store.ts packages/admin-server/src/auth/session.store.db.test.ts packages/admin-server/src/sessions
git commit -m "feat(admin-server): 남의 세션 끊기에 권한 상승 검사 — 주인의 역할을 덮어야 끊는다(2c ⑪ D1)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: 쓰는 쪽 스모크 · README · changeset · 진행 문서

**Files:**

- Modify: `packages/admin-server/README.md`
- Create: `.changeset/admin-server-roles.md`
- Modify: `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md`(§14 — 구현 중 바뀐 것이 있을 때만)
- Create(저장소 밖): `$TEMP/akss/` 아래 앱 파일들

- [ ] **Step 1: README 를 고친다**

`packages/admin-server/README.md`:

① 둘째 단락의 첫 문장 끝(`…세션 관리 · 감사(PR 2c)다.`)을 `…세션 관리 · 감사(PR 2c), 역할 관리 · 계정 판정(PR 2d-1)이다.` 로, 이어지는 `사용자 · 역할 · 팀 …` 을 `사용자 · 팀 …` 으로 고친다.

② 장 표 끝에 한 줄:

```md
| `0009_guard_locks` | `guard_locks`(센티넬 행 하나) |
```

③ "## 권한 슬롯" 의 예시 객체에 두 줄을 더한다:

```ts
      'roles.read': 'org.roles:read', // GET /roles
      'roles.manage': 'org.roles:write', // POST · PATCH · DELETE /roles…
```

그리고 목록 끝에 한 줄:

```md
- 🔴 역할 · 사용자 모듈을 쓰면 슬롯 맵의 키가 `permissionCatalog` 안이어야 한다 — 오타(`org.role:write`)는 기동에서 멈춘다.
```

④ "### 세션" 목록의 마지막 줄(`- 남의 세션을 끊을 때의 권한 상승 검사 … 2d 이 붙인다.`)을 바꾼다:

```md
- 🔴 남의 세션을 끊으려면 그 사람의 역할 권한을 덮어야 한다(아래 "권한 상승") — 낮은 관리자가 전권자의 세션을 끊으면 403 `details.outside`. 본인 세션은 늘 된다.
```

⑤ "## admin-ui 와 맞물리기" **앞**에 절을 더한다:

````md
## 역할 · 권한

```ts
// 프로젝트 shared — 카탈로그와 함의 표 하나를 서버 · 화면이 같이 쓴다
export const permissions = definePermissions(
  {
    USERS_READ: 'org.users:read',
    USERS_WRITE: 'org.users:write',
    ROLES_READ: 'org.roles:read',
    ROLES_WRITE: 'org.roles:write',
  },
  { implies: { 'org.users:write': ['org.users:read'], 'org.roles:write': ['org.roles:read'] } },
)
```

```ts
imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      …,
      permissionCatalog: permissions, // 🔴 역할 모듈을 쓰면 필수
      permissions: { …, 'roles.read': 'org.roles:read', 'roles.manage': 'org.roles:write' },
      reauth: false, // true 면 역할 만들기 · 수정 · 삭제가 본문 currentPassword 를 요구한다
    }),
  }),
  AdminAuthModule,
  AdminRolesModule, // /roles 다섯 라우트
]
```

| 라우트                      | 슬롯           | 본문 → 응답                                                      | admin-ui `useRoleEditor` 어댑터 |
| --------------------------- | -------------- | ---------------------------------------------------------------- | ------------------------------- |
| `GET /roles`                | `roles.read`   | → `{ items }`(전량 · `displayOrder` 순)                          | `list`                          |
| `POST /roles`               | `roles.manage` | `{ roleName, isDefault, permissions }` → 201 `{ roleNo }`        | `create`                        |
| `PATCH /roles/:roleNo`      | `roles.manage` | `{ revision, roleName?, isDefault?, permissions? }` → `{ item }` | `update`                        |
| `PATCH /roles/:roleNo/move` | `roles.manage` | `{ displayOrder }`(이웃의 값) → `{}`                             | `move`                          |
| `DELETE /roles/:roleNo`     | `roles.manage` | 본문 `{ revision }` → `{}`                                       | `remove`                        |

```ts
const roleApi: RoleEditorApi = {
  list: async () => (await api.get<{ items: AdminRole[] }>('/roles')).items,
  create: async (body, ctx) =>
    (await api.post<{ roleNo: bigint }>('/roles', { ...body, ...ctx })).roleNo,
  update: async (roleNo, body, ctx) =>
    void (await api.patch(`/roles/${roleNo}`, { ...body, ...ctx })),
  remove: async (roleNo, body, ctx) =>
    void (await api.del(`/roles/${roleNo}`, { ...body, ...ctx })),
  move: async (roleNo, body) => void (await api.patch(`/roles/${roleNo}/move`, body)),
}
useRoleEditor({
  api: roleApi,
  permissions: permissions.ALL_PERMISSION_VALUES,
  implies: permissions.implies, // 🔴 서버 정규화와 같은 표
  reauth: false, // 서버 reauth 와 같게
  canWrite: () => check.hasPermission('org.roles:write'),
})
```

- **정규화**: `'*'` 가 섞이면 `['*']` 하나, 아니면 함의를 펼쳐 카탈로그 순서로 저장한다. 카탈로그 밖 키는 400 `issues[{ path: ['permissions', i] }]`. 목록은 저장된 그대로 낸다 — 카탈로그에서 지운 옛 키는 화면이 버리고 다음 저장에서 빠진다.
- **권한 상승**: 행위자가 대상을 "덮어야" 한다(`coversPermissions`). 역할 만들기는 새 권한, 수정은 `permissions` 를 보낼 때만 현재 · 새 권한 둘 다, 삭제는 현재 권한. 남의 세션 끊기는 그 사람의 역할. 거부는 403 `details.outside`(덮지 못한 키). 🔴 `permissions` 없이 이름 · 기본 여부만 고치는 수정은 넓은 역할에도 열려 있다(3b `useRoleEditor` 가 그렇게 보낸다).
- **전권자 잔존**: 전체 권한(`'*'`) 재직자를 0 으로 만드는 역할 수정 · 삭제는 409 다. 동시 요청은 `guard_locks` 의 센티넬 행이 줄 세운다(장 `0009_guard_locks` — 모든 앱에 필수). 시드로 첫 전체 권한 계정을 만들기 전에는 0 이라 막히지 않는다.
- **revision**: 수정 · 삭제 본문에 필수, 다르면 409 `ERR_COMMON_REVISION_CONFLICT`. 이동은 revision 을 받지도 올리지도 않는다(순서는 내용이 아니다).
- **기본 역할**은 하나다 — 켜면 다른 기본 역할이 꺼지고 그 revision 이 오른다(그 역할을 열어 둔 화면은 409 를 받는다).
- 이름 중복(대소문자 · 끝 공백 무시)은 400 `issues[{ path: ['roleName'] }]` — `useRoleEditor` 의 이름 칸 아래에 뜬다. 쓰는 중인 역할의 삭제는 409 `ERR_COMMON_IN_USE`.
- 감사: `org.role.create` · `update` · `move` · `delete`(diff `roleName` · `isDefault` · `permissions`). 재인증 비밀번호는 남지 않는다.
````

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-roles.md`:

```md
---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 스텁 한 줄을 더한다 — `export { up, down } from '@ssworks/admin-server/migrations/0009_guard_locks'`(🔴 모든 장이 필수다). 역할 모듈을 쓰면 `AdminServerModule` 옵션에 `permissionCatalog`(admin-shared `definePermissions()` 결과 — 함의 표는 `{ implies }`)와 슬롯 `'roles.read'` · `'roles.manage'` 를 더하고 `AdminRolesModule` 을 import 한다. 슬롯 맵의 키는 카탈로그 안이어야 한다(기동에서 멈춘다). `@Audit` 인자 타입 이름이 `AuditOptions` → `AuditDeclaration` 으로 바뀌었다. 남의 세션 끊기(`DELETE /sessions/:sessionNo` · `/sessions/user/:userNo`)는 이제 그 사람의 역할 권한을 덮어야 한다(아니면 403).

admin-server 역할 · 판정(Phase 2 PR 2d-1): `AdminRolesModule` — `/admin/roles` 다섯 라우트(전량 목록 · 만들기 `{ roleNo }` · 수정 `{ item }` · 이동 · 삭제, revision 409 · 이동은 revision 없음 · 기본 역할 하나 · 이름 중복은 `roleName` 필드 오류 · 쓰는 중 409). 권한 정규화(`'*'` 접기 · 함의 · 카탈로그 순서), 지배 판정(403 `details.outside`), 전권자 잔존(장 `0009_guard_locks` 센티넬 · 409), 선택 재인증(`reauth`). 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: `definePermissions(catalog, { implies })` — 카탈로그의 `implies`(검증된 함의 표 · admin-ui `useRoleEditor({ implies })` 에 그대로) · `normalize(list)`. 코어 감사 액션에 역할 넷(`org.role.create` · `update` · `delete` · `move`)과 대상 `role`.
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
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "package/dist/(roles|accounts)/.*[.]js$"
tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -E "test-support|[.]test[.]js" || echo "테스트 파일 없음"
```

Expected: tarball 둘, `dist/roles/*.js` · `dist/accounts/*.js` 가 보이고 마지막 줄은 `테스트 파일 없음`. 아래 `package.json` 의 tarball 이름을 `ls` 결과로 맞춘다(지금 판 0.3.0).

`$TEMP/akss/package.json` · `tsconfig.json` · `.env` · `kysely.config.ts` 는 2c 플랜 Task 13 Step 3 과 같다(`docs/superpowers/plans/2026-10-14-admin-server-sessions-audit.md` — 그대로 옮겨 쓴다). 스텁은 아홉 — 2c 의 여덟에 한 줄을 더한다:

```
009_admin_guard_locks.ts              export { up, down } from '@ssworks/admin-server/migrations/0009_guard_locks'
```

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
  const keeper = await db
    .insertInto('roles')
    .values({
      roleName: '역할 관리자',
      permissions: JSON.stringify(['org.roles:read', 'org.roles:write']),
      displayOrder: 2,
    })
    .executeTakeFirstOrThrow()
  await db
    .insertInto('users')
    .values([
      {
        userId: 'admin',
        password: await hashPassword('smoke-pass-1234'),
        userName: '관리자',
        roleNo: boss.insertId as bigint,
      },
      {
        userId: 'keeper',
        password: await hashPassword('smoke-pass-5678'),
        userName: '역할지기',
        roleNo: keeper.insertId as bigint,
      },
    ])
    .execute()
} finally {
  await db.destroy()
}
```

`$TEMP/akss/src/app.module.ts`:

```ts
import { Controller, Get, Module } from '@nestjs/common'
import {
  AdminAuditModule,
  AdminAuthModule,
  AdminRolesModule,
  AdminServerModule,
  AdminSessionsModule,
  Public,
  adminDbConnectionFromEnv,
  requireEnv,
} from '@ssworks/admin-server'
import { definePermissions } from '@ssworks/admin-shared'

const permissions = definePermissions(
  {
    USERS_READ: 'org.users:read',
    USERS_WRITE: 'org.users:write',
    ROLES_READ: 'org.roles:read',
    ROLES_WRITE: 'org.roles:write',
    AUDIT_LOG_READ: 'setting.auditLog:read',
    POSTS_READ: 'board.posts:read',
    POSTS_WRITE: 'board.posts:write',
  },
  {
    implies: {
      'org.users:write': ['org.users:read'],
      'org.roles:write': ['org.roles:read'],
      'board.posts:write': ['board.posts:read'],
    },
  },
)

@Public()
@Controller('health')
class HealthController {
  @Get()
  ok() {
    return { ok: true }
  }
}

@Module({
  imports: [
    AdminServerModule.forRootAsync({
      useFactory: () => {
        requireEnv(['ADMIN_JWT_SECRET'])
        return {
          db: adminDbConnectionFromEnv(),
          auth: { jwtSecret: process.env.ADMIN_JWT_SECRET! },
          permissionCatalog: permissions,
          permissions: {
            'sessions.read': 'org.users:read',
            'sessions.manage': 'org.users:write',
            'auditLogs.read': 'setting.auditLog:read',
            'roles.read': 'org.roles:read',
            'roles.manage': 'org.roles:write',
          },
        }
      },
    }),
    AdminAuthModule,
    AdminAuditModule,
    AdminSessionsModule,
    AdminRolesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

`$TEMP/akss/src/main.ts` 는 2c 와 같다.

`$TEMP/akss/check.mjs`:

```js
const base = 'http://127.0.0.1:4100/api'

async function send(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const cookies = Object.fromEntries(
    response.headers.getSetCookie().map((line) => {
      const pair = line.split(';')[0]
      const index = pair.indexOf('=')
      return [pair.slice(0, index), pair.slice(index + 1)]
    }),
  )
  return { status: response.status, text: await response.text(), cookies }
}

const show = (label, result) => console.log(label, result.status, result.text)
const bigint = (wrapped) => wrapped.slice('BigInt('.length, -1)

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${base}/health`)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error('서버가 뜨지 않았다 — server.log 를 본다')
}

async function login(userId, password) {
  const result = await send('/admin/auth/login', { method: 'POST', body: { userId, password } })
  if (result.status !== 200) throw new Error(`로그인 실패 ${result.status} ${result.text}`)
  return `admin_at=${result.cookies.admin_at}; admin_rt=${result.cookies.admin_rt}`
}

await waitForServer()
const admin = await login('admin', 'smoke-pass-1234')
const keeper = await login('keeper', 'smoke-pass-5678')

const created = await send('/admin/roles', {
  method: 'POST',
  cookie: admin,
  body: { roleName: '게시판 관리', isDefault: true, permissions: ['board.posts:write'] },
})
show('roles-create', created)
const roleNo = bigint(JSON.parse(created.text).data.roleNo)
show('roles-list', await send('/admin/roles', { cookie: admin }))
show(
  'roles-update',
  await send(`/admin/roles/${roleNo}`, {
    method: 'PATCH',
    cookie: admin,
    body: { revision: 0, roleName: '게시판 운영' },
  }),
)
show(
  'roles-move',
  await send(`/admin/roles/${roleNo}/move`, {
    method: 'PATCH',
    cookie: admin,
    body: { displayOrder: 1 },
  }),
)
show(
  'roles-last-admin',
  await send('/admin/roles/1', {
    method: 'PATCH',
    cookie: admin,
    body: { revision: 0, permissions: ['org.users:read'] },
  }),
)
show(
  'roles-keeper-wide',
  await send('/admin/roles', {
    method: 'POST',
    cookie: keeper,
    body: { roleName: '넓은 역할', isDefault: false, permissions: ['*'] },
  }),
)
show(
  'roles-delete',
  await send(`/admin/roles/${roleNo}`, { method: 'DELETE', cookie: admin, body: { revision: 1 } }),
)
show(
  'audit-logs',
  await send('/admin/audit-logs?itemsPerPage=10&filter%5Baction%5D=org.role', { cookie: admin }),
)
```

- [ ] **Step 4: 설치 · 빌드 · 마이그레이션 · 시드**

```bash
cd "$TEMP/akss"
pnpm install
pnpm build
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists akss; create database akss"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
```

Expected: 설치 성공. `tsc` 는 2a 때의 제3자 d.ts 6건(`@nestjs/platform-express` TS7016 3 · admin-shared `pagination.d.ts` TS2536 3) 말고는 오류가 없다 — 있으면 내용을 기록하고 `skipLibCheck: true` 로 한 번 더 돌려 패키지 쪽 오류가 없음을 확인한다. 마이그레이션 9장 · 시드 성공. `009_admin_guard_locks.ts` 를 잠시 옮겨 두고 `npx kysely migrate latest` 를 돌리면 `빠진 장 0009_guard_locks` 로 멈추는지 한 번 보고 되돌린다.

- [ ] **Step 5: 기동 · 요청**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected(본문은 줄여 적는다):

- `roles-create 201 {"success":true,"data":{"roleNo":"BigInt(3)"}}`
- `roles-list 200 {…"items":[…]}` — `게시판 관리` 의 `permissions` 가 `["board.posts:read","board.posts:write"]`, `isDefault: true`, `displayOrder: 3`
- `roles-update 200 {…"item":{…"roleName":"게시판 운영","revision":1…}}`
- `roles-move 200 {"success":true,"data":{}}`
- `roles-last-admin 409 {"success":false,"code":"ERR_COMMON_CONFLICT","message":"이 변경 뒤에는 전체 권한을 가진 재직 관리자가 한 명도 남지 않습니다. …"}`
- `roles-keeper-wide 403 {…"code":"ERR_COMMON_FORBIDDEN"…"details":{"outside":["*"]}}`
- `roles-delete 200 {"success":true,"data":{}}`
- `audit-logs 200 {…}` — 최신순으로 `org.role.delete` · `org.role.move` · `org.role.update` · `org.role.create`(meta `after.permissions` 가 정규화된 값), 실패한 `org.role.update`(409) · `org.role.create`(403)도 `statusCode` · `errorCode` 와 함께

셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
```

- [ ] **Step 7: 진행 문서를 고친다**

숫자(N · M)는 저장소 루트에서 `pnpm check` · `pnpm test:db` 를 돌린 결과로 채운다(admin-server 테스트 수 · DB 테스트 수, 워크스페이스 합계).

**`docs/01-phase0.md`**

① §2-3 의 `> **PR 2c 경계 결정 (2026-10-14)** — …` 단락 아래에 빈 줄을 두고 더한다:

```md
> **PR 2d 경계 결정 (2026-10-14)** — 한 스펙 · 두 PR(2d-1 역할 · 판정 → 2d-2 사용자 · 계정). 서버는 코어 옵션 `permissionCatalog` 로 카탈로그를 알고, 함의 표는 카탈로그(`definePermissions({ implies })`)가 든다. 권한 상승은 지배 판정(대상의 현재 · 새 권한을 덮어야 — 남의 세션 끊기 포함), 자기 계정은 퇴사 · 퇴사일 · 초기화 · 잠금 해제만 막는다. 전권자 잔존은 `guardLocks` 장의 센티넬 행, 퇴사일은 날짜를 받아 서버가 기준 시간대(기본 Asia/Seoul)의 다음 날 0시로 효력 시각을 셈한다. 계정 생성은 서버 임시 비밀번호, 재인증은 옵션 하나(기본 끔), 사용자 revision 은 편집 폼 값만, 팀은 하나, 확장 필드는 B, 이름 중복 · 날짜 순서는 필드 검증 오류(새 오류 코드 없음). 근거: `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` §2.
```

② §3-2 표에서 첫 칸이 `` `roles: { extensionSchema? `` 로 시작하는 행을 바꾼다:

```md
| `permissionCatalog`(admin-shared `definePermissions` 결과 — 함의 표 `implies` 포함) · `reauth`(코어, 기본 false)(2d) — `extensionSchema` 는 두지 않는다(B), `revision` · `normalize` · `superAdminSurvival` 은 고정 동작 | revision 필수 · 정규화 · 지배 판정 · 잔존(`guardLocks`) | gise revision, hangang 정규화 · 단조성 |
```

③ §8 표의 `@ssworks/admin-server` 행 상태 칸 끝(`… 다음 2d 사용자 · 역할`)을 이렇게 바꾼다:

```md
… 다음 2d 사용자 · 역할. **PR 2d-1 완료**(`feat/admin-server-users-roles`, 2026-10-14) — `AdminRolesModule`(전량 목록 · 만들기 · 수정 · 이동 · 삭제) · 권한 카탈로그 옵션(`implies` · `normalize`) · 지배 판정 · 전권자 잔존(장 0009) · 세션 끊기 권한 상승 검사. N 테스트 + 실 MariaDB M. 스펙 `docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md` · 플랜 `docs/superpowers/plans/2026-10-14-admin-server-roles.md`. 다음 2d-2 사용자 · 계정
```

④ 표 아래 `다음: Phase 2 PR 2d 사용자 · 역할(…).` 줄을 바꾼다:

```md
다음: Phase 2 PR 2d-2 사용자 · 계정(2d 스펙 §1 · §5-1 · §5-6 — 사용자 10라우트 · 재직 이력 · 임시 비밀번호 · 잠금 해제).
```

**`docs/HANDOFF.md`**

- `@ssworks/admin-server` 행에서 2c 의 숫자 문장(`380 테스트 + 실 MariaDB 134.`)을 지우고, 그 행 끝에 더한다: `**PR 2d-1**(역할 · 판정 — `AdminRolesModule`· 권한 카탈로그 옵션 · 지배 판정 · 전권자 잔존 장 0009 · 세션 끊기 권한 상승 검사, admin-shared`implies`·`normalize`· 역할 감사 액션)은`feat/admin-server-users-roles` 에서 구현 완료(2026-10-14). N 테스트 + 실 MariaDB M.`
- "검증" 행 끝에 더한다: `PR 2d-1 은 Windows 에서 pnpm check · pnpm test:db 초록, 쓰는 쪽 스모크($TEMP/akss — 스텁 9 → 시드 → 기동 → 역할 만들기(정규화) · 수정 · 이동 · 마지막 관리자 409 · 좁은 관리자의 넓은 역할 403 · 삭제 → 감사 행)를 통과했다.`
- "다음 플랜" 행을 바꾼다: `Phase 2 PR 2d-2 사용자 · 계정 — 2d 스펙(docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md)의 [2] 부분으로 플랜부터(새 브랜치 feat/admin-server-users). 직전 PR 2d-1: 플랜 docs/superpowers/plans/2026-10-14-admin-server-roles.md`
- "PR 2b 가 넘긴 것" 의 `2d:` 항목 끝에 `→ 2d 스펙에서 정함(효력 시각 계산 ⑤ Z1 · revision ⑧ V1 · 재인증 ⑦ R1 — 역할은 2d-1 에서 구현, 사용자는 2d-2)` 을, 후속 목록의 `` `users.updateAt` 이 로그인 실패마다 바뀜(2d 의 "수정일" 표시) `` 뒤에 `→ 2d-2(⑧ U1)` 을 붙인다.
- "PR 2c 가 넘긴 것" 의 `2d:` 항목 끝에 `→ **2d-1 에서 닫음**(세션 끊기 검사 · 역할 슬롯 · org.role.* — 사용자 슬롯 · org.user.* 는 2d-2), AuditOptions → AuditDeclaration` 을 붙인다.

**`CLAUDE.md`**

- 패키지 표의 admin-server 행 설명을 `NestJS 12 모듈 (Phase 2 진행 — 2a 기반 · 2b 인증 · 2c 세션 · 감사 · 2d-1 역할 완료)` 로.
- `### @ssworks/admin-server (Phase 2)` 목록 끝에 한 줄을 더한다:

```md
- 역할 · 사용자 쓰기의 권한 상승은 `accounts/account-command.ts` 의 `judgeAccountCommand` 하나로 판정한다(대상을 "덮어야"). 전체 권한 재직자 수를 줄일 수 있는 쓰기는 `withSuperAdminSurvival`(센티넬 잠금이 트랜잭션 첫 문장)로 감싼다. 서버가 아는 권한 카탈로그는 코어 옵션 `permissionCatalog`(함의 표는 카탈로그의 `implies`).
```

- 진행 표에서 `**Phase 2 PR 2d — 사용자 · 역할**` 행을 두 행으로 바꾼다: `Phase 2 PR 2d-1 — 역할 · 판정(`AdminRolesModule` · 권한 카탈로그 옵션 · 지배 판정 · 전권자 잔존 · 세션 끊기 검사)` · `완료` · `스펙 docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md · 플랜 docs/superpowers/plans/2026-10-14-admin-server-roles.md`, 그리고 `**Phase 2 PR 2d-2 — 사용자 · 계정**` · `**다음**` · `2d 스펙 [2](§1 · §5-1 · §5-6)`.

- [ ] **Step 8: 포맷 · 확인 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-roles.md
pnpm exec prettier --write packages/admin-server/README.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md .changeset/admin-server-roles.md
pnpm format:check
pnpm check
pnpm test:db
```

Expected: prettier 두 번째 실행은 `(unchanged)` 뿐, `format:check` · `check` · `test:db` 초록.

```bash
git add packages/admin-server/README.md .changeset/admin-server-roles.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md docs/superpowers/specs/2026-10-14-admin-server-users-roles-design.md
git commit -m "docs: PR 2d-1 역할 · 판정 — README 역할 · 권한 절, changeset, 진행 문서, 다음 플랜은 2d-2" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 스펙 대조표 (자체 검토)

| 스펙(2d-1 몫)                                                                    | Task                 |
| -------------------------------------------------------------------------------- | -------------------- |
| ⓪ S2 한 스펙 · 두 PR — 이 플랜은 [1]                                             | 머리말 · 13          |
| ① C1 `permissionCatalog` · `implies` · `normalize` · 카탈로그 밖 400             | 1 · 3 · 10 · 11      |
| ② E1 지배 판정 · `permissions` 있을 때만(역할 수정) · 세션 끊기                  | 6 · 8 · 9 · 12       |
| ③ SF1 자기 계정 넷 403 · 자기 역할 수정 허용(판정 함수)                          | 6                    |
| ④ G1 `guardLocks` 장 · 센티넬 첫 문장 · 셈 · "있었는데 0"                        | 5 · 7 · 8 · 9 · 11   |
| ⑦ R1 `reauth` 옵션 · 트랜잭션 밖 · 이동 제외                                     | 3 · 8 · 10 · 11      |
| ⑪ L1 슬롯 "하나라도"(역할 목록의 `users.read` 는 2d-2)                           | 3                    |
| ⑫ D1 기본 역할 하나 · 꺼진 역할 revision + 1                                     | 8 · 11               |
| ⑬ K1 새 코드 없음 · 이름 중복 400 필드 오류(B1)                                  | 8 · 11               |
| 공통 1 슬롯 둘 · 공통 2 역할 액션 넷 · 대상 role                                 | 2 · 3 · 10 · 11      |
| 공통 3 전량 목록 · 구간 재번호 · 자르기 · 이동 revision 없음                     | 8 · 9 · 11           |
| 공통 4 제약 이름 판정                                                            | 8 · 11               |
| 공통 10 응답 모양(역할)                                                          | 10 · 11              |
| 공통 11 감사 비밀(재인증)                                                        | 11                   |
| 공통 12 `AuditDeclaration`                                                       | 4                    |
| B4 `AdminPermissionCatalog` · B5 본문 파이프 · B6 저장된 그대로 · B7 판정 순서   | 3 · 8 · 10           |
| B11 삭제도 잔존 잠금 · FK 받침 · B12 슬롯 키 검사 · B13 하나라도 · B14 판정 전부 | 3 · 6 · 9            |
| §9-1 · §9-2 · §9-3 [1] 테스트 계약                                               | 1~12                 |
| §10 README · changeset · 진행 문서 · 스모크(2d-1)                                | 13                   |
| §14 R2~R4(플랜 작성 중 정정)                                                     | 머리말 · 6 · 10 · 12 |

2d-2 몫(⑤ · ⑥ · ⑧ · ⑨ · ⑩ · 공통 5~9 · B2 · B3 · B8~B10 · B15 · B16)은 이 플랜에 없다 — 2d-2 플랜이 가져간다.
