# 템플릿 preset/admin + admin-scaffold 스킬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 형제 저장소 `kim5257-project-template` 에 npm `@ssworks/*` 0.4.1 을 의존하는 얇은 관리자 앱 골격(브랜치 `preset/admin`)과 `.claude/skills/admin-scaffold` 를 만들고, 템플릿에서 새 앱을 만들어 실제로 돌려 검증한다.

**Architecture:** `preset/db` 위에 브랜치를 따서 템플릿 자체 HTTP 층 · DB 모듈 · shared 응답 코드를 킷 것으로 바꾼다. shared 는 서버 · 화면이 한 벌로 보는 카탈로그(권한 · 함의 · 감사 · 오류 · 약관 종류 · 비밀번호 정책 · 재인증)만 갖는다. backend 는 `AdminServerModule.forRootAsync` + 킷 모듈 일곱, frontend 는 파일 기반 라우팅(`definePage` meta) 위에 킷 셸 · 가드 · 스토어를 잇고 aksv(실서버 62 항목 통과)의 페이지를 옮긴다. 스킬은 절차이고 코드의 본보기는 템플릿에 실제로 있는 파일을 가리킨다.

**Tech Stack:** pnpm 10.33 워크스페이스 · Node 24 · TypeScript 5.9 · NestJS 12 · Kysely 0.29 · `@kim5257/kysely-mariadb-dialect` 0.2 · kysely-ctl 0.21 · zod 4 · Vue 3.5 · Vuetify 4 · vue-router 5(파일 기반) · vite-plugin-vue-layouts-next · Vite 8 · vitest 4 · MariaDB 11.4(Docker `admin-kit-test-db`)

**Spec:** `docs/superpowers/specs/2026-10-16-template-preset-admin-design.md` (§13 의 플랜 작성 중 정정 포함)

## Global Constraints

- 템플릿 저장소는 `C:\Users\kim52\workspace\kim5257-project-template`(bash `/c/Users/kim52/workspace/kim5257-project-template`, 이하 **T**). 쓰기는 브랜치 `preset/admin` 에서만, 커밋은 로컬. `master` · `preset/db` · `preset/auth` 를 고치지 않는다. `git push` · `git fetch` 하지 않는다(비공개 원격 · 인증 프롬프트에서 멈춘다).
- 킷 저장소는 `C:\Users\kim52\workspace\ssworks-admin-kit`(이하 **K**), 브랜치 `chore/template-preset-admin`. 이 저장소의 기록 · 킷 문서 고침만 여기 커밋한다.
- 세션 스크래치패드는 `C:\Users\kim52\AppData\Local\Temp\claude\c--Users-kim52-workspace-ssworks-admin-kit\16e35d0e-99b9-43e3-afea-5b20333f2d4e\scratchpad`(이하 **S**). aksv 원본 스냅숏은 **S**`\src-aksv\src\`, akss 는 **S**`\src-akss\`.
- 패키지 버전은 세 개 모두 정확히 `"0.4.1"`(캐럿 없음): `@ssworks/admin-shared` · `@ssworks/admin-ui` · `@ssworks/admin-server`. workspace 링크 · tarball 을 템플릿에 커밋하지 않는다.
- 다른 의존성 범위: `@nestjs/common` · `@nestjs/core` · `@nestjs/platform-express` `^12.1.2`, `kysely` `^0.29.6`, `@kim5257/kysely-mariadb-dialect` `^0.2.0`, `kysely-ctl` `^0.21.0`, `mariadb` `^3.5.4`, `zod` `^4.3.5`, `tsc-watch` `^7.2.1`, `vitest` `^4.1.10`, `happy-dom` `^20.0.0`, `@he-tree/vue` `^2.10.5`, `codemirror` `^6.0.2`, `@codemirror/state` `^6.7.6`. TypeScript 는 템플릿 그대로(5.9). pnpm 은 템플릿 `packageManager` 그대로(10.33 — 전역 pnpm 12 가 자동으로 바꿔 돈다).
- 경로 규약 **(가)**: 화면 `baseURL` 은 `'/api/admin'`, 화면 코드의 경로에 `'/admin'` 을 붙이지 않는다. 백엔드 프로젝트 관리자 컨트롤러는 `@Controller('admin/<이름>')`.
- 템플릿 코드 스타일: 세미콜론 · single quote · trailing comma `all` · 100자 · 2칸(`.prettierrc`). backend · shared 의 상대 import 는 `.js` 확장자, frontend 는 확장자 없이 `@/` 별칭. `.vue` 의 `<script setup>` 은 들여쓰지 않는다(템플릿 prettier · `vue/script-indent` 2).
- 🔴 **이 플랜의 코드 블록은 킷 저장소 prettier 가 다듬은 모양이다**(세미콜론 없음 · `.vue` script 4칸 들여쓰기). 내용은 그대로 옮기고 모양은 템플릿 도구가 정한다 — 코드 파일은 각 Task 의 `pnpm format` · `pnpm lint:fix`(T 루트), 마크다운(SKILL.md · CLAUDE.md · README.md)은 T 에서 `pnpm exec prettier --write <파일>` 을 두 번 돌린 뒤 `--check`. 세미콜론을 손으로 하나씩 달지 않는다.
- 커밋 메시지: 템플릿은 `feat:` · `fix:` · `chore:` · `docs:` 꼴 한국어(템플릿 CLAUDE.md), 킷은 `docs:` · `fix(admin-ui):` 꼴. 둘 다 끝 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 옮긴 파일은 머리 주석에 `// 정본: aksv src/pages/UsersPage.vue(실서버 확인 2026-10-16)` 처럼 출처와 바꾼 점을 적는다. `🔴` 주석은 지우지 않는다.
- 셸: `> /dev/null` · `2>/dev/null` 를 쓰지 않는다. 파일 · 폴더 삭제는 `git rm` 또는 `node -e "require('node:fs').rmSync(…, { recursive: true, force: true })"`.
- DB: `admin-kit-test-db`(127.0.0.1:33306, `root` / `admin-kit-test`, TLS 켬). 개발 DB `tpl_dev`(Task 3~7), 생성 앱 DB `akt`(Task 10~11). 만들 때 `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`. 끝나면 `DROP DATABASE`. `pnpm test:db`(킷)와 겹쳐 돌리지 않는다. 컨테이너가 꺼져 있으면 `docker start admin-kit-test-db` 후 `docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "select 1"`.
- 킷 결함이 나오면 멈추고 보고한다 — 고치는 것은 K 에서 크기에 맞는 superpowers 흐름(작으면 TDD + changeset patch)이고, 생성 앱만 로컬 tarball 을 pnpm `overrides` 로 끼워 잇는다(템플릿에 커밋하지 않는다). 템플릿에서 우회하지 않는다.
- 서브에이전트 디스패치는 model 을 명시한다(구현 `sonnet`, 단일 파일 `haiku`, 최종 리뷰 `opus`).

## Review Focus

1. **토큰 갱신 경로** — (가) 규약에서 `refreshPath` 가 어긋나면 갱신만 404 라 15분마다 로그인 화면으로 튕기고 개발 중에는 안 보인다. → Task 4 스모크 `admin` 단계가 `/api/admin/auth/refresh` 200 · refresh 쿠키 회전을 단언하고, Task 10 브라우저 B13 이 화면 쪽 갱신(backend JWT 비밀키를 바꿔 액세스 토큰만 무효로 만든 뒤 401 → 갱신 → 재시도)을 본다.
2. **새 체크아웃의 shared dist** — backend · frontend 가 `@project/shared` 를 `dist` 로 읽어, 빌드 전 `typecheck` 가 "Cannot find module" 로 깨진다(킷 HANDOFF 첫 세션 결함과 같은 꼴). → Task 1 의 루트 `prepare`, Task 10 이 새 clone 에서 `lint` · `typecheck` 를 `build` 보다 먼저 돌려 확인한다.
3. **선언 없는 새 페이지** — 스킬 · 사람이 `definePage` meta 에 권한 선언을 빠뜨리면 가드가 fail-closed 로 막거나(의도와 다름) 메뉴가 엉뚱해진다. → Task 5 라우트 테스트가 모든 페이지 레코드의 선언을 단언하고, Task 11 스킬 시험이 그 테스트를 다시 돈다.
4. **init 뒤 남은 `@project/`** — init.mjs 는 `.ts` · `.mts` · `.vue` · `.json` · `.md` · `Dockerfile.*` 만 바꾼다. 새 파일 종류(`.yml` · `.sh` · `.yaml`)에 scope 가 들어가면 생성 앱이 깨진다. → Task 10 Step 2 가 init 뒤 `@project/` 잔존 0 을 단언한다.
5. **컨테이너 안의 기동** — TZ · env 파일 경로 · `dist/main.js` 경로 · `pnpm deploy` 산출이 맞지 않으면 이미지는 빌드돼도 뜨지 않는다. → Task 4 가 backend 이미지를 빌드하고, Task 10 Step 9 가 컨테이너를 띄워 스모크 `anon` · `admin` 단계를 돈다.

---

## 파일 지도 (T 기준, preset/admin 끝 상태)

```
package.json                     prepare · test · lint(+frontend) 스크립트          Task 1, 5
pnpm-workspace.yaml              patch 제거 · ignoredBuiltDependencies              Task 1
eslint.config.js                 packages/frontend/** 는 frontend 설정이 맡는다     Task 5
.github/workflows/ci.yml         Test 단계                                          Task 1
Dockerfile.backend · Dockerfile.nginx · run.sh · nginx/default.conf · .env.backend.example   Task 4, 5
CLAUDE.md · README.md                                                               Task 9
.claude/skills/admin-scaffold/SKILL.md                                              Task 8
packages/shared/  src/admin/{permissions,audit,errors,legal,password-policy,config,index}.ts · catalog.test.ts   Task 2
packages/backend/ kysely.config.ts · .env.example · src/{main,app.module}.ts · src/admin/admin-options.ts
                  src/core/auth/require.ts · src/core/database/{admin-db,database.types}.ts · migrations/(스텁 12) · migrations.md
                  src/health/* · src/seed/seed-admin.ts · src/modules/README.md      Task 3, 4
packages/frontend/ vite.config.mts · env.d.ts · package.json · src/{config,main}.ts · App.vue · admin/menu.ts
                  plugins/* · state/ip-block.ts · api/{client,auth,sessions}.ts · stores/app.ts · composables/usePermission.ts
                  router/index.ts · router/routes.test.ts · layouts/{default,auth}.vue
                  pages/{index,login,password,403,account,[...path]}.vue               Task 5
                  api/{users,teams}.ts · components/users/UserEditForm.vue
                  pages/{users,users.new,users.[userNo],teams,sessions}.vue            Task 6
                  api/{roles,legal}.ts · admin/permission-matrix.ts
                  pages/settings.vue · pages/settings/{roles,legal}.vue                Task 7
```

---

### Task 1: preset/admin 브랜치 · 루트 도구

**Files:**

- Branch: T `preset/admin` ← `origin/preset/db`(881b6e6) + cherry-pick `bcfe24a` · `c3945e7`
- Modify: T `package.json`, T `pnpm-workspace.yaml`, T `.github/workflows/ci.yml`
- Delete: T `patches/nestjs-zod.patch`

**Interfaces:**

- Produces: 루트 스크립트 `prepare`(= `pnpm --filter @project/shared build`) · `test`(= `pnpm -r --if-present test`). 이후 Task 들이 `pnpm test` · `pnpm typecheck` 를 루트에서 부른다.

- [ ] **Step 1: 시작 상태 확인**

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
git status --short
git branch -a
git rev-parse origin/preset/db origin/preset/auth
```

Expected: 작업 트리 깨끗, `origin/preset/db` = `881b6e6…`, `origin/preset/auth` = `c3945e7…`. 다르면 멈추고 보고한다(원격이 더 새로울 수 있다 — 스펙 §2-2 ⑤).

- [ ] **Step 2: 브랜치를 따고 init 고침 둘을 가져온다**

```bash
git switch --no-track -c preset/admin origin/preset/db
git cherry-pick -x bcfe24a c3945e7
git log --oneline -3
```

Expected: 충돌 없음. 위 둘이 `881b6e6` 위에 쌓인다. `packages/frontend/package.json` 의 `"name"` 이 `@project/frontend` 다. `--no-track` 은 이 브랜치가 `preset/db` 를 upstream 으로 잡지 않게 한다(push 는 사람이 정한다).

- [ ] **Step 3: 루트 스크립트**

T `package.json` 의 `scripts` 를 아래로 바꾼다(나머지 필드는 그대로).

```json
  "scripts": {
    "prepare": "pnpm --filter @project/shared build",
    "build": "pnpm -r build",
    "dev": "pnpm -r --parallel dev",
    "lint": "eslint packages/",
    "lint:fix": "eslint packages/ --fix",
    "format": "prettier --write packages/",
    "format:check": "prettier --check packages/",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r --if-present test"
  },
```

`prepare` 는 `pnpm install` 직후 shared 를 빌드한다 — backend · frontend 가 shared 를 `dist` 로 읽어, 새 체크아웃 · CI 에서 빌드 전 `typecheck` 가 깨지지 않게 한다(Review Focus 2).

- [ ] **Step 4: nestjs-zod patch 를 걷고 빌드 스크립트 무시 설정**

`patches/nestjs-zod.patch` 를 지운다.

```bash
git rm -q patches/nestjs-zod.patch
```

T `pnpm-workspace.yaml` 전체:

```yaml
packages:
  - 'packages/*'

# @ssworks/admin-ui 필수 peer 인 @he-tree/vue 의 하위 의존 vue-demi 가 postinstall 을 단다 — Vue 3 에서는 할 일이
# 없다(@ssworks/admin-ui README "Peer 의존"). pnpm 10 은 무시 목록에 두면 경고 없이 건너뛴다.
ignoredBuiltDependencies:
  - vue-demi
```

- [ ] **Step 5: CI 에 테스트 단계**

T `.github/workflows/ci.yml` 의 `Type Check` 단계와 `Build` 단계 사이에 넣는다:

```yaml
- name: Test
  run: pnpm test
```

- [ ] **Step 6: 설치 · 검사 — 아직 옛 코드다**

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

Expected: `pnpm install` 은 nestjs-zod 를 patch 없이 설치하고 `prepare` 가 shared 를 빌드한다. `typecheck` · `build` 초록. `pnpm test` 는 테스트 스크립트가 아직 없어 아무것도 돌지 않고 0 으로 끝난다. 실패하면 Step 3~5 의 바꾼 줄을 먼저 의심한다(옛 코드는 손대지 않았다).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "chore: preset/admin 시작 — 루트 prepare · test 스크립트 · nestjs-zod patch 제거 · CI 테스트 단계

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`patches/` 삭제는 Step 4 의 `git rm` 으로 이미 스테이지됐다.)

---

### Task 2: shared — 프로젝트 카탈로그

**Files:**

- Create: T `packages/shared/src/admin/permissions.ts` · `audit.ts` · `errors.ts` · `legal.ts` · `password-policy.ts` · `config.ts` · `index.ts` · `catalog.test.ts`
- Modify: T `packages/shared/package.json`, T `packages/shared/tsconfig.build.json`, T `packages/shared/src/index.ts`, T `packages/shared/src/schemas/index.ts`, T `packages/shared/src/schemas/README.md`
- Delete: T `packages/shared/src/schemas/{response,error-codes,test}.schema.ts`, T `packages/shared/src/utils/bigint-json.utils.ts`

**Interfaces:**

- Consumes: `@ssworks/admin-shared` 0.4.1 — `definePermissions` · `PermissionOf` · `defineAuditCatalog` · `defineErrorCodes` · `definePasswordPolicy`.
- Produces(`@project/shared` 에서 export):
  - `IMPLIES`(const 객체) · `permissions`(카탈로그 — `.PERMISSIONS` · `.ALL_PERMISSION_VALUES` · `.implies` · `.normalize`) · `P`(= `permissions.PERMISSIONS`) · `type Permission`
  - `auditCatalog`(`.labelOf(action)` · `.AuditActions`)
  - `projectErrors`(`.httpStatusFor(code)` · `.ErrorCodes`)
  - `LEGAL_KINDS` · `type LegalKind` · `LEGAL_KIND_LABELS: Record<LegalKind, string>`
  - `passwordPolicy`
  - `ADMIN_REAUTH: boolean`
- ⚠️ 이 Task 뒤 backend · frontend 는 옛 export(`ErrorCodes` · `parseJSON` · `stringifyJSON` · `ErrorResp`)를 잃어 Task 3 · 5 까지 빨갛다. 이 Task 의 검사는 shared 안에서만 한다.

- [ ] **Step 1: 의존성 · 스크립트**

T `packages/shared/package.json` 의 `scripts` · `dependencies` · `devDependencies` 를 아래로 바꾼다.

```json
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@ssworks/admin-shared": "0.4.1",
    "luxon": "^3.7.2",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@types/luxon": "^3.7.1",
    "typescript": "^5.8.3",
    "vitest": "^4.1.10"
  }
```

T `packages/shared/tsconfig.build.json` 의 `exclude` 에 테스트를 더한다:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts", "**/*.test.ts"]
}
```

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
pnpm install
```

- [ ] **Step 2: 실패하는 테스트**

T `packages/shared/src/admin/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ADMIN_REAUTH,
  IMPLIES,
  LEGAL_KIND_LABELS,
  LEGAL_KINDS,
  P,
  auditCatalog,
  passwordPolicy,
  permissions,
  projectErrors,
} from './index.js'

// 서버 슬롯 맵(backend src/admin/admin-options.ts)과 화면 meta 가 이 키를 쓴다 — 키를 바꾸면 둘 다 바꾼다.
const EXPECTED_KEYS = [
  'org.users:read',
  'org.users:write',
  'org.roles:read',
  'org.roles:write',
  'org.teams:read',
  'org.teams:write',
  'sessions:read',
  'sessions:write',
  'settings.legal:read',
  'settings.legal:publish',
  'settings.auditLog:read',
]

describe('관리자 카탈로그', () => {
  it('권한 키는 정해 둔 열한 개다', () => {
    expect([...permissions.ALL_PERMISSION_VALUES].sort()).toEqual([...EXPECTED_KEYS].sort())
    expect(P.USERS_READ).toBe('org.users:read')
    expect(P.AUDIT_LOG_READ).toBe('settings.auditLog:read')
  })

  it('함의 표의 키 · 값은 모두 카탈로그 안이다', () => {
    const known = new Set<string>(permissions.ALL_PERMISSION_VALUES)
    for (const [key, implied] of Object.entries(IMPLIES)) {
      expect(known.has(key), key).toBe(true)
      for (const value of implied) expect(known.has(value), value).toBe(true)
    }
  })

  it('정규화는 함의를 펼친다', () => {
    expect(permissions.normalize(['org.users:write'])).toEqual([
      'org.users:read',
      'org.users:write',
    ])
  })

  it('약관 종류는 서버 형식(영숫자 · _ 1~32자)이고 라벨이 있다', () => {
    for (const kind of LEGAL_KINDS) {
      expect(kind).toMatch(/^[A-Za-z0-9_]{1,32}$/)
      expect(LEGAL_KIND_LABELS[kind]).toBeTruthy()
    }
  })

  it('감사 · 오류 카탈로그는 코어를 품는다', () => {
    expect(auditCatalog.labelOf('org.user.create')).not.toBe('org.user.create')
    expect(projectErrors.httpStatusFor('ERR_COMMON_NOT_FOUND')).toBe(404)
  })

  it('비밀번호 정책 기본값 · 재인증 기본값', () => {
    expect([passwordPolicy.minLength, passwordPolicy.maxLength]).toEqual([8, 200])
    expect(ADMIN_REAUTH).toBe(false)
  })
})
```

- [ ] **Step 3: 실패를 확인**

Run: `pnpm --filter @project/shared test`
Expected: FAIL — `Cannot find module './index.js'`(또는 `Failed to resolve import "./index.js"`).

- [ ] **Step 4: 카탈로그 구현**

T `packages/shared/src/admin/permissions.ts`:

```ts
import { definePermissions, type PermissionOf } from '@ssworks/admin-shared'

/**
 * 쓰기 → 읽기 함의. 서버 정규화(permissionCatalog)와 역할 편집기(useRoleEditor)가 이 표 하나를 쓴다.
 * 🔴 함의를 더하거나 키를 지우면 전체 권한 관리자가 그 키를 가진 역할을 한 번 다시 저장한다 — 그 전에는 좁은 관리자가
 *    그 역할 · 그 역할의 계정을 다루지 못한다(@ssworks/admin-server README "사용자 · 계정").
 */
export const IMPLIES = {
  'org.users:write': ['org.users:read'],
  'org.roles:write': ['org.roles:read'],
  'org.teams:write': ['org.teams:read'],
  'sessions:write': ['sessions:read'],
  'settings.legal:publish': ['settings.legal:read'],
} as const

/**
 * 프로젝트 권한 카탈로그 — 서버(슬롯 맵 · @Require)와 화면(라우트 meta · 버튼 · 역할 매트릭스)이 같이 쓴다.
 * 키를 더하면 역할 매트릭스(frontend src/admin/permission-matrix.ts)에도 칸을 더한다 — 라우트 테스트가 잡는다.
 */
export const permissions = definePermissions(
  {
    USERS_READ: 'org.users:read',
    USERS_WRITE: 'org.users:write',
    ROLES_READ: 'org.roles:read',
    ROLES_WRITE: 'org.roles:write',
    TEAMS_READ: 'org.teams:read',
    TEAMS_WRITE: 'org.teams:write',
    SESSIONS_READ: 'sessions:read',
    SESSIONS_WRITE: 'sessions:write',
    LEGAL_READ: 'settings.legal:read',
    LEGAL_PUBLISH: 'settings.legal:publish',
    AUDIT_LOG_READ: 'settings.auditLog:read',
  },
  { implies: IMPLIES },
)

export const P = permissions.PERMISSIONS
export type Permission = PermissionOf<typeof permissions>
```

T `packages/shared/src/admin/audit.ts`:

```ts
import { defineAuditCatalog } from '@ssworks/admin-shared'

/**
 * 프로젝트 감사 액션 · 대상. 코어 액션(org.user.* · org.role.* · org.team.* · setting.legal.publish …)은 패키지가 이미
 * 넣는다 — 여기에는 프로젝트 것만 더한다. 쓰기 라우트의 @Audit({ action, targetType }) 은 이 카탈로그 안이어야 한다
 * (밖이면 서버가 기동에서 멈춘다). 라벨이 빠져도 멈춘다.
 *
 * 예: actions: { NOTICE_CREATE: 'board.notice.create' }, targets: { NOTICE: 'notice' },
 *     labels: { 'board.notice.create': '공지 작성' }, targetLabels: { notice: '공지' }
 */
export const auditCatalog = defineAuditCatalog({
  actions: {},
  targets: {},
  labels: {},
  targetLabels: {},
})
```

T `packages/shared/src/admin/errors.ts`:

```ts
import { defineErrorCodes } from '@ssworks/admin-shared'

/**
 * 프로젝트 오류 코드. 첫 인자에 코드, 둘째 인자에 그 코드의 HTTP 상태를 적는다
 * (예: defineErrorCodes({ ERR_NO_NOTICE: 'ERR_NO_NOTICE' }, { ERR_NO_NOTICE: 404 })).
 * 서비스는 admin-shared BusinessError(코드, 문구) 로 던지고, 서버 예외 필터가 이 표로 상태를 고른다.
 */
export const projectErrors = defineErrorCodes({}, {})
```

T `packages/shared/src/admin/legal.ts`:

```ts
/** 약관 종류 — 서버 legal.kinds 와 약관 화면 탭이 이 상수 하나에서 나온다. 영숫자 · _ 1~32자, 대소문자를 가른다. */
export const LEGAL_KINDS = ['TERMS', 'PRIVACY'] as const

export type LegalKind = (typeof LEGAL_KINDS)[number]

export const LEGAL_KIND_LABELS: Record<LegalKind, string> = {
  TERMS: '이용약관',
  PRIVACY: '개인정보처리방침',
}
```

T `packages/shared/src/admin/password-policy.ts`:

```ts
import { definePasswordPolicy } from '@ssworks/admin-shared'

/** 비밀번호 정책 — 서버 본문 검증과 화면(PasswordChangeForm)이 같은 숫자 · 같은 문구를 쓴다. 기본 8 · 200. */
export const passwordPolicy = definePasswordPolicy()
```

T `packages/shared/src/admin/config.ts`:

```ts
/**
 * 민감 작업 재인증 — true 면 서버가 역할 · 사용자 쓰기에 본문 currentPassword 를 요구하고, 화면은 그 쓰기를
 * 재인증 대화상자로 묻는다. 🔴 서버 옵션(reauth)과 화면 관문이 이 값 하나를 본다 — 어긋나면 쓰기가 403 이 된다.
 */
export const ADMIN_REAUTH: boolean = false
```

T `packages/shared/src/admin/index.ts`:

```ts
export * from './audit.js'
export * from './config.js'
export * from './errors.js'
export * from './legal.js'
export * from './password-policy.js'
export * from './permissions.js'
```

- [ ] **Step 5: 옛 응답 · 오류 코드 · bigint 코드 걷기**

```bash
git rm -q packages/shared/src/schemas/response.schema.ts packages/shared/src/schemas/error-codes.schema.ts packages/shared/src/schemas/test.schema.ts packages/shared/src/utils/bigint-json.utils.ts
```

T `packages/shared/src/schemas/index.ts` 전체:

```ts
// 프로젝트 zod 스키마를 여기서 다시 내보낸다(admin-scaffold 스킬이 <자원>.schema.ts 를 더한다).
// 응답 봉투 · bigint 코덱 · 공통 오류 코드는 @ssworks/admin-shared 가 맡는다.
export {}
```

T `packages/shared/src/index.ts` 전체:

```ts
export * from './types/index.js'
export * from './schemas/index.js'
export * from './admin/index.js'
export * from './utils/datetime.utils.js'
```

T `packages/shared/src/schemas/README.md` 를 읽고, `response.schema.ts` · `error-codes.schema.ts` · `createZodDto` · nestjs-zod 를 가리키는 문장을 아래 한 절로 바꾼다(나머지 작성 규칙은 둔다):

```markdown
## 이 폴더에 두는 것

- 프로젝트 자원의 zod 스키마(`<자원>.schema.ts`) — 목록 쿼리(`createQuerySchema`) · 본문 · 행. 서버는 `ZodValidationPipe(스키마)`, 화면은 같은 타입을 쓴다.
- 응답 봉투(`{ success, data }`) · bigint 코덱 · 공통 오류 코드는 `@ssworks/admin-shared` 몫이라 여기 두지 않는다.
- `import { z } from 'zod'`(zod 4).
```

- [ ] **Step 6: 테스트 · 빌드 통과**

```bash
pnpm --filter @project/shared test
pnpm --filter @project/shared typecheck
pnpm --filter @project/shared build
node -e "import('./packages/shared/dist/index.js').then((m) => console.log(m.P.USERS_READ, m.LEGAL_KINDS.join(',')))"
```

Expected: 테스트 6개 PASS, typecheck · build 초록, 마지막 줄 `org.users:read TERMS,PRIVACY`. `dist/admin/catalog.test.js` 가 없어야 한다(`ls packages/shared/dist/admin`).

- [ ] **Step 7: Commit**

```bash
git add -A packages/shared pnpm-lock.yaml
git commit -m "feat: shared 관리자 카탈로그 — 권한 · 함의 · 감사 · 오류 · 약관 종류 · 비밀번호 정책 · 재인증(@ssworks/admin-shared 0.4.1)

옛 응답 봉투 · 오류 코드 · bigint 코드는 admin-shared 가 맡는다 — backend · frontend 는 다음 커밋들에서 따라온다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: backend — 킷 배선 · 마이그레이션 · 기동

**Files:**

- Modify: T `packages/backend/package.json`, `tsconfig.json`, `tsconfig.build.json`, `kysely.config.ts`, `.env.example`, `src/main.ts`, `src/app.module.ts`, `src/core/database/database.types.ts`, `src/modules/README.md`
- Create: T `packages/backend/src/admin/admin-options.ts`, `src/core/auth/require.ts`, `src/core/database/admin-db.ts`, `src/core/database/migrations/001_admin_roles.migration.ts` … `012_admin_ip_access_rules.migration.ts`(12), `src/core/database/migrations.md`, `src/health/health.module.ts`, `src/health/health.controller.ts`
- Delete: T `packages/backend/src/app.controller.ts`, `src/core/filters/`, `src/core/json/`, `src/core/utils/`, `src/core/database/database.module.ts`, `src/core/database/plugins/`, `src/core/database/tables/users.table.ts`, `src/core/database/migrations/README.md`, `src/core/database/migrations/.gitkeep`, `src/modules/test/`
- Create(스크래치): **S**`\tpl\smoke-api.mjs`

**Interfaces:**

- Consumes(Task 2): `@project/shared` 의 `P` · `Permission` · `permissions` · `auditCatalog` · `projectErrors` · `LEGAL_KINDS` · `passwordPolicy` · `ADMIN_REAUTH`.
- Produces:
  - `adminDb(): AdminDbConnection`(`src/core/database/admin-db.ts`) — Task 4 시드가 쓴다.
  - `interface Database extends AdminDatabase`(`src/core/database/database.types.ts`) — Task 4 · 스킬이 쓴다.
  - `Require(...p: Permission[])` · `RequireAny(...p: Permission[])`(`src/core/auth/require.ts`) — 스킬이 쓴다.
  - `adminServerOptions(): AdminServerOptions`(`src/admin/admin-options.ts`).
  - 스모크 `node smoke-api.mjs <base> <stage> [userId] [password] [newPassword]`, stage = `anon` · `first-login` · `admin` — Task 4 · 10 이 쓴다.
  - HTTP: `GET /api/health` → `{ success: true, data: { ok: true } }`, 킷 라우트 `/api/admin/*`.

- [ ] **Step 1: 스모크 스크립트(실패하는 시험)**

**S**`\tpl\smoke-api.mjs`:

```js
// 템플릿 backend API 스모크 — node smoke-api.mjs <base> <stage> [userId] [password] [newPassword]
// base 예: http://127.0.0.1:4000/api · stage: anon | first-login | admin
const [base, stage, userId, password, newPassword] = process.argv.slice(2)
if (!base || !['anon', 'first-login', 'admin'].includes(stage)) {
  console.error(
    '사용법: node smoke-api.mjs <base> <anon|first-login|admin> [userId] [password] [newPassword]',
  )
  process.exit(2)
}
const failures = []
const ok = (cond, label, detail) =>
  cond ? console.log('ok  ', label) : failures.push(`${label} :: ${detail ?? ''}`)

const jar = new Map()
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
function remember(res) {
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(';')[0]
    const at = pair.indexOf('=')
    const name = pair.slice(0, at)
    const value = pair.slice(at + 1)
    if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) jar.delete(name)
    else jar.set(name, value)
  }
}
async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: cookieHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  remember(res)
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, body: json }
}
const short = (v) => JSON.stringify(v).slice(0, 300)

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await fetch(`${base}/health`)).ok) break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}
const health = await call('GET', '/health')
ok(health.status === 200 && health.body?.data?.ok === true, 'GET /health 200 봉투', short(health))

if (stage === 'anon') {
  const me = await call('GET', '/admin/auth/me')
  ok(
    me.status === 401 && me.body?.success === false,
    '로그인 전 /admin/auth/me 401 봉투',
    short(me),
  )
  const users = await call('GET', '/admin/users')
  ok(users.status === 401, '로그인 전 /admin/users 401', short(users))
  const wrongPrefix = await call('GET', '/auth/me')
  ok(wrongPrefix.status === 404, 'admin 없는 /api/auth/me 404 — 경로 규약 (가)', short(wrongPrefix))
}

if (stage === 'first-login') {
  const login = await call('POST', '/admin/auth/login', { userId, password })
  ok(
    login.status === 200 && jar.has('admin_at') && jar.has('admin_rt'),
    '임시 비밀번호 로그인 · 쿠키 둘',
    short(login),
  )
  const me = await call('GET', '/admin/auth/me')
  ok(
    me.status === 200 &&
      me.body.data.isPasswordChangeRequired === true &&
      me.body.data.permissions.length === 0,
    '강제 변경 상태 /auth/me',
    short(me),
  )
  const blocked = await call('GET', '/admin/users')
  ok(
    blocked.status === 403 && blocked.body.code === 'ERR_PASSWORD_CHANGE_REQUIRED',
    '강제 변경 중 다른 라우트 403',
    short(blocked),
  )
  const change = await call('PATCH', '/admin/auth/password', {
    currentPassword: password,
    newPassword,
  })
  ok(change.status === 200, '비밀번호 변경 200', short(change))
  const after = await call('GET', '/admin/auth/me')
  ok(
    after.status === 200 &&
      after.body.data.isPasswordChangeRequired === false &&
      after.body.data.permissions.includes('*'),
    '변경 뒤 /auth/me 전체 권한',
    short(after),
  )
}

if (stage === 'admin') {
  const login = await call('POST', '/admin/auth/login', { userId, password })
  ok(login.status === 200, '로그인 200', short(login))
  const before = jar.get('admin_rt')
  const refresh = await call('POST', '/admin/auth/refresh')
  ok(
    refresh.status === 200 && jar.get('admin_rt') !== before,
    '갱신 200 · refresh 쿠키 회전',
    short(refresh),
  )
  for (const path of [
    '/admin/users',
    '/admin/roles',
    '/admin/teams/tree',
    '/admin/sessions',
    '/admin/sessions/me',
    '/admin/legal-documents/current?kind=TERMS',
    '/admin/audit-logs',
  ]) {
    const r = await call('GET', path)
    ok(r.status === 200 && r.body.success === true, `GET ${path} 200`, short(r))
  }
  const team = await call('POST', '/admin/teams', {
    teamName: `스모크팀-${Date.now()}`,
    parentTeamNo: null,
  })
  ok(team.status === 201, '팀 만들기 201', short(team))
  const audit = await call(
    'GET',
    '/admin/audit-logs?filter[action]=org.team.create&filter[actionMatch]=exact',
  )
  ok(
    audit.status === 200 && audit.body.data.items.length >= 1,
    '감사 행 org.team.create',
    short(audit),
  )
  const logout = await call('POST', '/admin/auth/logout')
  ok(logout.status === 200, '로그아웃 200', short(logout))
}

if (failures.length > 0) {
  console.error(`FAIL ${failures.length}\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else console.log(`smoke ${stage} OK`)
```

Run(옛 서버는 아직 못 뜬다 — 4000 에 아무것도 없다): `node "<S>/tpl/smoke-api.mjs" http://127.0.0.1:4000/api anon`
Expected: 30초 기다린 뒤 FAIL(`fetch failed`) — 시험 자체가 돈다는 확인.

- [ ] **Step 2: 의존성 · 스크립트 · tsconfig**

T `packages/backend/package.json` 전체:

```json
{
  "name": "@project/backend",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "files": ["dist", "run.sh"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc-watch -p tsconfig.build.json --onSuccess \"node dist/main.js\"",
    "start": "node dist/main.js",
    "typecheck": "tsc --noEmit",
    "migrate": "kysely migrate:latest",
    "migrate:make": "kysely migrate:make",
    "seed:admin": "tsc -p tsconfig.build.json && node dist/seed/seed-admin.js"
  },
  "dependencies": {
    "@kim5257/kysely-mariadb-dialect": "^0.2.0",
    "@nestjs/common": "^12.1.2",
    "@nestjs/core": "^12.1.2",
    "@nestjs/platform-express": "^12.1.2",
    "@project/shared": "workspace:*",
    "@ssworks/admin-server": "0.4.1",
    "@ssworks/admin-shared": "0.4.1",
    "express": "^5.1.0",
    "kysely": "^0.29.6",
    "mariadb": "^3.5.4",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.5",
    "@types/node": "^25.5.0",
    "kysely-ctl": "^0.21.0",
    "tsc-watch": "^7.2.1",
    "typescript": "^5.9.3"
  }
}
```

(`seed:admin` 은 Task 4 가 파일을 만든다 — 이 Task 에서는 부르지 않는다.)

T `packages/backend/tsconfig.json` 전체:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "nodenext",
    "outDir": "./dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "kysely.config.ts"]
}
```

T `packages/backend/tsconfig.build.json` 전체:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "declaration": false,
    "declarationMap": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
pnpm install
```

Expected: 설치 성공. `pnpm why @ssworks/admin-shared --filter @project/backend` 에 0.4.1 하나.

- [ ] **Step 3: 옛 HTTP 층 · DB 모듈 · 예제 모듈 걷기**

```bash
git rm -rq packages/backend/src/app.controller.ts packages/backend/src/core/filters packages/backend/src/core/json packages/backend/src/core/utils packages/backend/src/core/database/database.module.ts packages/backend/src/core/database/plugins packages/backend/src/core/database/tables/users.table.ts packages/backend/src/core/database/migrations/README.md packages/backend/src/core/database/migrations/.gitkeep packages/backend/src/modules/test
```

- [ ] **Step 4: DB 접속 · 타입 · 마이그레이션 스텁**

T `packages/backend/src/core/database/admin-db.ts`:

```ts
import { adminDbConnectionFromEnv, type AdminDbConnection } from '@ssworks/admin-server/runner'

/**
 * 앱(AdminServerModule) · 마이그레이션 러너(kysely.config.ts) · 시드(seed-admin.ts)가 같이 부르는 DB 접속.
 * 🔴 함수다 — env 는 부를 때(부팅 뒤) 읽는다. 🔴 Nest 를 import 하지 않는다(러너가 import 한다).
 * env 로 안 되는 TLS(관리형 DB 의 CA 고정 · 호스트 이름)는 여기서 ssl 을 더한다 — 한 곳만 고치면 셋 다 바뀐다
 * (@ssworks/admin-server README "DB TLS · 소켓").
 */
export const adminDb = (): AdminDbConnection => adminDbConnectionFromEnv()
```

T `packages/backend/src/core/database/database.types.ts` 전체:

```ts
import type { AdminDatabase } from '@ssworks/admin-server/runner'

/**
 * DB 스키마 타입. 코어 테이블(roles · users · teams · sessions · audit_logs …)은 AdminDatabase 가 가진다.
 * 프로젝트 테이블은 tables/<이름>.table.ts 에 타입을 두고 여기에 더한다 — 예: notices: NoticesTable;
 * 서비스는 @Inject(KYSELY) db: Kysely<Database> 로 받는다(KYSELY 는 @ssworks/admin-server).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 프로젝트 테이블을 더하는 자리
export interface Database extends AdminDatabase {}
```

마이그레이션 스텁 12개를 만든다 — 파일마다 한 줄. node 로 한 번에 쓴다(LF):

```bash
node -e "
const fs = require('node:fs');
const dir = 'packages/backend/src/core/database/migrations';
fs.mkdirSync(dir, { recursive: true });
const ids = ['0001_roles','0002_users','0003_teams','0004_team_closure','0005_team_user_map','0006_user_employment_periods','0007_sessions','0008_audit_logs','0009_guard_locks','0010_team_tree_lock','0011_legal_documents','0012_ip_access_rules'];
ids.forEach((id, i) => {
  const no = String(i + 1).padStart(3, '0');
  const name = id.slice(5);
  fs.writeFileSync(dir + '/' + no + '_admin_' + name + '.migration.ts', \"export { up, down } from '@ssworks/admin-server/migrations/\" + id + \"';\n\");
});
console.log(fs.readdirSync(dir).join('\n'));
"
```

Expected 출력(12줄): `001_admin_roles.migration.ts` · `002_admin_users.migration.ts` · `003_admin_teams.migration.ts` · `004_admin_team_closure.migration.ts` · `005_admin_team_user_map.migration.ts` · `006_admin_user_employment_periods.migration.ts` · `007_admin_sessions.migration.ts` · `008_admin_audit_logs.migration.ts` · `009_admin_guard_locks.migration.ts` · `010_admin_team_tree_lock.migration.ts` · `011_admin_legal_documents.migration.ts` · `012_admin_ip_access_rules.migration.ts`.

T `packages/backend/src/core/database/migrations.md`(폴더 밖 — kysely-ctl 이 마이그레이션 폴더의 비-TS 파일에 경고한다):

````markdown
# 마이그레이션

## 명령어

```bash
pnpm --filter @project/backend migrate                  # 끝까지 올린다(kysely migrate:latest)
pnpm --filter @project/backend migrate:make <이름>      # 새 프로젝트 장(타임스탬프 이름)
```

## 코어 장 — 한 줄 스텁

`migrations/001_admin_roles.migration.ts` … `012_admin_ip_access_rules.migration.ts` 는 `@ssworks/admin-server` 의 코어 장을 가리키는 한 줄이다.

```ts
export { up, down } from '@ssworks/admin-server/migrations/0001_roles'
```

- 🔴 지우거나 순서를 바꾸지 않는다 — `kysely.config.ts` 의 `assertAdminMigrationStubs` 가 빠진 장 · 어긋난 순서를 시작 전에 막는다.
- 킷을 올릴 때 changeset 이 새 장을 알리면 다음 번호로 스텁 한 줄을 더한다(CLAUDE.md "킷 올리기").
- `012_admin_ip_access_rules` 는 IP 접근 제어 모듈을 켜지 않아도 둔다(킷이 모든 장을 요구한다 — 테이블과 전체 허용 두 행만 생긴다).

## 프로젝트 장

- `migrate:make` 가 `<타임스탬프>_<이름>.ts` 를 만든다 — 코어 스텁(`001`~`012`) 뒤로 정렬된다.
- `up(db: Kysely<unknown>)` · `down` 을 쌍으로 쓴다. 컬럼 · 제약 · 인덱스 이름은 DB 에서 snake_case(`uq_notices_title`) — 코드는 camelCase(`CamelCasePlugin`).
- 🔴 코어 테이블에 컬럼을 더할 때 NOT NULL 이면 DEFAULT 를 둔다 — 패키지 INSERT 는 더한 컬럼을 모른다.
- 타입은 `tables/<이름>.table.ts` 에 두고 `database.types.ts` 의 `Database` 에 더한다.
````

- [ ] **Step 5: 러너 설정 · env 예시**

T `packages/backend/kysely.config.ts` 전체:

```ts
import { defineConfig } from 'kysely-ctl'
import {
  assertAdminMigrationStubs,
  assertUtcTimezone,
  createAdminKysely,
  loadDotEnv,
} from '@ssworks/admin-server/runner'
import { adminDb } from './src/core/database/admin-db.js'

// 마이그레이션 러너 — Nest 를 싣지 않는다. 앱(main.ts)과 같은 접속 함수(adminDb) · 플러그인(createAdminKysely)을 쓴다.
loadDotEnv(new URL('./.env', import.meta.url))
assertUtcTimezone('마이그레이션 러너')
assertAdminMigrationStubs(new URL('./src/core/database/migrations', import.meta.url))

export default defineConfig({
  kysely: () => createAdminKysely(adminDb()),
  migrations: { migrationFolder: 'src/core/database/migrations' },
})
```

T `packages/backend/.env.example` 전체(🔴 값 뒤에 주석을 달지 않는다 — `.env` 파서는 `=` 뒤 전부를 값으로 읽는다):

```dotenv
# 🔴 킷이 기동에서 확인한다 — UTC 가 아니면 앱 · 러너 · 시드가 멈춘다
TZ=UTC
PORT=4000

# Database (MariaDB) — @ssworks/admin-server README "환경 변수"
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=app_db
# TLS 로 검증해 붙는다
# DB_SSL=true
# 그 CA 로 검증(TLS 를 켠다)
# DB_SSL_CA=/run/secrets/db-ca.pem
# 유닉스 소켓 — DB_HOST · DB_PORT · DB_SSL 과 함께 두지 않는다
# DB_SOCKET_PATH=/run/mysqld/mysqld.sock

# 액세스 토큰 서명 키(32자 이상)
# 만들기: node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
ADMIN_JWT_SECRET=change-me-to-a-random-string-of-at-least-32-characters
```

- [ ] **Step 6: 권한 데코레이터 · 서버 옵션 · 헬스**

T `packages/backend/src/core/auth/require.ts`:

```ts
import { RequireAnyPermissions, RequirePermissions } from '@ssworks/admin-server'
import type { Permission } from '@project/shared'

// 킷 데코레이터를 프로젝트 권한 키 타입으로 좁힌다 — 키 오타가 컴파일 오류가 된다(@ssworks/admin-server README "가드").
// 🔴 관리자 라우트는 셋 중 하나를 선언한다 — Require · RequireAny · @SelfOnly(). 없으면 403(fail-closed).

/** 모두 있어야(AND) 통과 */
export const Require = (...permissions: Permission[]) => RequirePermissions(...permissions)

/** 하나라도 있으면(OR) 통과 */
export const RequireAny = (...permissions: Permission[]) => RequireAnyPermissions(...permissions)
```

T `packages/backend/src/admin/admin-options.ts`:

```ts
import { requireEnv, type AdminServerOptions } from '@ssworks/admin-server'
import {
  ADMIN_REAUTH,
  LEGAL_KINDS,
  P,
  auditCatalog,
  passwordPolicy,
  permissions,
  projectErrors,
} from '@project/shared'
import { adminDb } from '../core/database/admin-db.js'

/** 기준 시간대 — 입사일 · 퇴사일("그날까지 근무")을 읽는다. 🔴 바꿔도 이미 저장된 효력 시각 · 날짜는 그대로다. */
const TIME_ZONE = 'Asia/Seoul'

/**
 * AdminServerModule.forRootAsync 의 useFactory. 🔴 부팅 뒤(main.ts 의 loadDotEnv 뒤)에 불린다 — env 는 여기서 읽는다.
 */
export function adminServerOptions(): AdminServerOptions {
  requireEnv(['ADMIN_JWT_SECRET'])
  return {
    db: adminDb(),
    auth: { jwtSecret: process.env.ADMIN_JWT_SECRET as string },
    permissionCatalog: permissions,
    // 패키지 라우트의 권한 슬롯 → 프로젝트 키. 🔴 import 한 모듈의 슬롯이 빠지거나 모르는 슬롯이면 기동에서 멈춘다.
    permissions: {
      'users.read': P.USERS_READ,
      'users.manage': P.USERS_WRITE,
      'roles.read': P.ROLES_READ,
      'roles.manage': P.ROLES_WRITE,
      'teams.read': P.TEAMS_READ,
      'teams.manage': P.TEAMS_WRITE,
      'sessions.read': P.SESSIONS_READ,
      'sessions.manage': P.SESSIONS_WRITE,
      'legal.read': P.LEGAL_READ,
      'legal.publish': P.LEGAL_PUBLISH,
      'auditLogs.read': P.AUDIT_LOG_READ,
      // IP 접근 제어를 켜면 'ipAccess.read' · 'ipAccess.manage' 를 더한다(CLAUDE.md "IP 접근 제어 켜기").
    },
    passwordPolicy,
    reauth: ADMIN_REAUTH,
    timeZone: TIME_ZONE,
    legal: { kinds: LEGAL_KINDS },
    audit: { catalog: auditCatalog },
    errorCodes: projectErrors,
    // 🔴 템플릿 nginx(nginx/default.conf)가 X-Real-IP 를 $remote_addr 로 덮어쓴다 — 그 뒤에서만 맞다. 엣지 없이 API 를
    //    바로 노출하면 'req.ip' 로 바꾼다(헤더 한 줄로 세션 · 감사의 IP 와 IP 접근 제어를 속일 수 있다).
    clientIp: 'x-real-ip',
  }
}
```

T `packages/backend/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common'
import { Public } from '@ssworks/admin-server'

/** 컨테이너 · 로드밸런서 상태 확인. 🔴 가드가 앱 전역이라 관리자 밖 컨트롤러는 @Public() 이다(없으면 401). */
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { ok: true }
  }
}
```

T `packages/backend/src/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { HealthController } from './health.controller.js'

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

- [ ] **Step 7: main · app.module**

T `packages/backend/src/main.ts` 전체:

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { assertUtcTimezone, configureAdminApp, loadDotEnv } from '@ssworks/admin-server'
import { AppModule } from './app.module.js'

// 개발: packages/backend/.env. 운영 컨테이너: run.sh 의 --env-file(Docker secret) — 이미 있는 키는 덮지 않는다.
loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('api')

const app = await NestFactory.create<NestExpressApplication>(AppModule)
configureAdminApp(app) // 🔴 빠뜨리면 기동에서 멈춘다 — 쿠키 · JSON bigint 코덱 · extended 쿼리 파서
app.setGlobalPrefix('api') // 관리자 라우트는 /api/admin/…, 헬스는 /api/health
app.enableShutdownHooks() // 종료 때 DB 풀을 닫는다
await app.listen(Number(process.env.PORT ?? 4000))
```

T `packages/backend/src/app.module.ts` 전체:

```ts
import { Module } from '@nestjs/common'
import {
  AdminAuditModule,
  AdminAuthModule,
  AdminLegalModule,
  AdminRolesModule,
  AdminServerModule,
  AdminSessionsModule,
  AdminTeamsModule,
  AdminUsersModule,
} from '@ssworks/admin-server'
import { adminServerOptions } from './admin/admin-options.js'
import { HealthModule } from './health/health.module.js'

// 모듈은 여기서 명시해 등록한다 — 가드가 앱 전역이라 새 모듈의 권한 선언을 사람이 보게 한다.
@Module({
  imports: [
    // 🔴 forRootAsync — env 를 부팅 뒤에 읽는다(forRoot 인자는 import 평가 때 돌아 loadDotEnv 보다 먼저다).
    AdminServerModule.forRootAsync({ useFactory: adminServerOptions }),
    // 🔴 AdminAuthModule 은 여기서 한 번만 — 앱 전역 인증 · 권한 가드가 켜진다.
    AdminAuthModule,
    AdminAuditModule,
    AdminSessionsModule,
    AdminRolesModule,
    AdminUsersModule,
    AdminTeamsModule,
    AdminLegalModule,
    // AdminIpAccessModule — IP 접근 제어. 켜는 법은 CLAUDE.md "IP 접근 제어 켜기".
    HealthModule,
    // ── 프로젝트 모듈(admin-scaffold 스킬이 아래에 더한다) ──
  ],
})
export class AppModule {}
```

- [ ] **Step 8: 정적 검사**

```bash
pnpm --filter @project/backend typecheck
pnpm --filter @project/backend build
ls packages/backend/dist
pnpm exec eslint packages/backend packages/shared
```

Expected: typecheck · build 초록, `dist/main.js` 가 있다(`dist/src/` 가 아니다). eslint 0 오류.

- [ ] **Step 9: 개발 DB · 마이그레이션**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "DROP DATABASE IF EXISTS tpl_dev; CREATE DATABASE tpl_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
node -e "
const fs = require('node:fs');
const secret = require('node:crypto').randomBytes(48).toString('base64url');
fs.writeFileSync('packages/backend/.env', ['TZ=UTC','PORT=4000','DB_HOST=127.0.0.1','DB_PORT=33306','DB_USER=root','DB_PASSWORD=admin-kit-test','DB_NAME=tpl_dev','DB_SSL=true','ADMIN_JWT_SECRET=' + secret, ''].join('\n'));
"
git check-ignore packages/backend/.env
pnpm --filter @project/backend migrate
```

Expected: `git check-ignore` 가 경로를 찍는다(커밋되지 않는다). `migrate` 가 12장을 모두 `✔`(또는 "Migration … was executed successfully")로 돈다. `docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test tpl_dev -e "show tables"` 에 `roles` · `users` · `teams` · `team_closure` · `team_user_map` · `user_employment_periods` · `sessions` · `audit_logs` · `guard_locks` · `legal_documents` · `ip_access_rules` + kysely 표 둘.

- [ ] **Step 10: 기동 · 스모크 anon**

백그라운드로 띄운다(Bash `run_in_background: true`):

```bash
cd /c/Users/kim52/workspace/kim5257-project-template/packages/backend && node dist/main.js
```

포그라운드로:

```bash
node "C:/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/16e35d0e-99b9-43e3-afea-5b20333f2d4e/scratchpad/tpl/smoke-api.mjs" http://127.0.0.1:4000/api anon
```

Expected: `ok` 넷(health · me 401 · users 401 · `/api/auth/me` 404) + `smoke anon OK`. 끝나면 백그라운드 서버를 멈춘다(TaskStop). 기동 로그에 `Nest application successfully started` · 경고 없음(IP 진단 경고는 IP 모듈을 끄므로 없다).

- [ ] **Step 11: 모듈 가이드 다시 쓰기**

T `packages/backend/src/modules/README.md` 전체:

````markdown
# 관리자 모듈 추가 가이드

관리자 페이지 하나를 더할 때는 **`admin-scaffold` 스킬**을 쓴다 — shared 카탈로그 · 테이블 · 이 모듈 · 화면을 한 줄로 만든다. 이 문서는 모듈 쪽 규칙이다.

## 구조

```
modules/<자원>/
├── <자원>.module.ts
├── <자원>.controller.ts
└── <자원>.service.ts
```

`app.module.ts` 의 `imports` 에 모듈을 더한다(자동 로딩 없음).

## 규칙

- 🔴 **가드는 앱 전역이다.** 관리자 라우트는 `Require(P.…)`(AND) · `RequireAny(P.…)`(OR) · `@SelfOnly()` 중 하나를 선언한다 — 없으면 403. 관리자 밖 컨트롤러(공개 API · 헬스 · 웹훅)는 클래스에 `@Public()`.
- **경로**: 관리자 컨트롤러는 `@Controller('admin/<자원>')` — `/api/admin/<자원>`. 화면은 `api.get('/<자원>')`(baseURL 이 `/api/admin`).
- **검증**: `@Body(new ZodValidationPipe(스키마))` · `@Query(new ZodValidationPipe(목록쿼리스키마))` · `@Param('<자원>No', ParseBigIntPipe)`. 스키마는 `@project/shared` 의 `schemas/<자원>.schema.ts`.
- **응답**: 값만 돌려준다 — 킷이 `{ success: true, data }` 로 감싸고 bigint 는 `"BigInt(n)"` 로 보낸다.
- **오류**: 서비스는 `BusinessError(코드, 문구)`(admin-shared)만 던진다. 프로젝트 코드는 `@project/shared` 의 `projectErrors` 에 상태와 함께 더한다.
- **DB**: `@Inject(KYSELY) private readonly db: Kysely<Database>`(`KYSELY` 는 `@ssworks/admin-server`). 읽기는 `runQuery(() => …)`, 쓰기는 `runWriteTransaction(this.db, (trx) => …)` — 드라이버 오류가 코드 있는 오류(중복 → `ERR_COMMON_DUPLICATED` …)가 된다. 🔴 그 안에서는 `BusinessError` 만 던진다(Nest `NotFoundException` 은 가려진 500 이 된다).
- **감사**: 쓰기 라우트에 `@Audit({ action, targetType })` — 액션 · 대상은 `@project/shared` 의 `auditCatalog` 안이어야 한다(밖이면 기동에서 멈춘다). 대상 번호는 `attachAuditTarget(req, no)`, 바뀐 값은 `attachAuditDiff(req, before, after, ['필드'])`.
- **동시 수정**: 수정 · 삭제 본문은 `revision` 을 받고, 다르면 409 `ERR_COMMON_REVISION_CONFLICT`.
- 🔴 argon2(비밀번호 해시 · 재인증)는 트랜잭션 밖에서만 부른다.
- 로그는 Nest `Logger` — `console.log` 를 쓰지 않는다.
````

- [ ] **Step 12: Commit**

```bash
git add -A packages/backend pnpm-lock.yaml
git status --short
git commit -m "feat: backend 를 @ssworks/admin-server 0.4.1 로 — Nest 12 · 킷 모듈 일곱 · 코어 스텁 12 · 러너 · 헬스

템플릿 자체 예외 필터 · JSON 인터셉터 · DatabaseModule · nestjs-zod · swagger · nest cli 를 걷고 킷 배선으로 바꾼다.
빌드는 tsc(dist/main.js), 개발은 tsc-watch. IP 접근 제어 모듈은 끈다(장 0012 스텁은 둔다).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `git status --short` 에 `.env` 가 없다.

---

### Task 4: backend — 첫 관리자 시드 · Docker 런타임

**Files:**

- Create: T `packages/backend/src/seed/seed-admin.ts`
- Modify: T `Dockerfile.backend`, T `Dockerfile.nginx`, T `packages/backend/run.sh`, T `nginx/default.conf`, T `.env.backend.example`

**Interfaces:**

- Consumes(Task 3): `adminDb()` · `Database` · 스모크 `smoke-api.mjs`.
- Produces: `pnpm --filter @project/backend seed:admin <userId> <userName>` — 성공하면 표준 출력에 `임시 비밀번호(이번 한 번만 보입니다): <16자>` 한 줄, users 가 비어 있지 않으면 종료 코드 1. Docker 이미지 `Dockerfile.backend` 가 `/app/dist/main.js` 를 `TZ=UTC` 로 띄운다.

- [ ] **Step 1: 실패하는 시험**

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
pnpm --filter @project/backend seed:admin admin 관리자
```

Expected: FAIL — `Cannot find module …/dist/seed/seed-admin.js`.

- [ ] **Step 2: 시드 구현**

T `packages/backend/src/seed/seed-admin.ts`:

```ts
import { randomInt } from 'node:crypto'
import {
  assertUtcTimezone,
  createAdminKysely,
  hashPassword,
  loadDotEnv,
  readJsonColumn,
} from '@ssworks/admin-server/runner'
import { adminUserCreateSchema } from '@ssworks/admin-shared'
import { passwordPolicy } from '@project/shared'
import { adminDb } from '../core/database/admin-db.js'
import type { Database } from '../core/database/database.types.js'

// 첫 관리자 시드 — pnpm --filter @project/backend seed:admin <아이디> <이름>
// 🔴 비밀번호를 env · 인자로 받지 않는다 — 임시 비밀번호를 만들어 한 번만 보여 주고, 첫 로그인에서 바꾸게 한다(강제 변경).
// 🔴 users 가 비어 있을 때만 돈다 — 다음 관리자는 화면(사용자 추가)에서 만든다.
// 재직 이력은 넣지 않는다 — 킷이 첫 퇴사 때 users.joinAt 으로 구간을 치유한다(@ssworks/admin-server README "사용자 · 계정").

/** 킷 임시 비밀번호와 같은 56자 — 대소문자 · 숫자에서 혼동 문자(I O l o 0 1)를 뺐다 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const LENGTH = 16
const SUPER_ROLE_NAME = '최고 관리자'

loadDotEnv(new URL('../../.env', import.meta.url))
assertUtcTimezone('seed:admin')

const input = adminUserCreateSchema
  .pick({ userId: true, userName: true })
  .safeParse({ userId: process.argv[2], userName: process.argv[3] })
if (!input.success) {
  console.error('사용법: pnpm --filter @project/backend seed:admin <아이디> <이름>')
  process.exit(1)
}
const { userId, userName } = input.data

let temporaryPassword = ''
for (let i = 0; i < LENGTH; i += 1) temporaryPassword += ALPHABET.charAt(randomInt(ALPHABET.length))
passwordPolicy.passwordSchema.parse(temporaryPassword)
// 🔴 argon2 는 트랜잭션 밖에서 — 해시를 먼저 만든다
const passwordHash = await hashPassword(temporaryPassword)

const db = createAdminKysely<Database>(adminDb())
try {
  const created = await db.transaction().execute(async (trx) => {
    if (await trx.selectFrom('users').select('userNo').limit(1).executeTakeFirst()) return false

    // 전체 권한('*') 역할이 이미 있으면 그것을, 없으면 '최고 관리자' 를 순서 맨 끝에 만든다
    const roles = await trx
      .selectFrom('roles')
      .select(['roleNo', 'permissions', 'displayOrder'])
      .execute()
    let roleNo = roles.find((role) => {
      const value = readJsonColumn(role.permissions)
      return Array.isArray(value) && value.includes('*')
    })?.roleNo
    if (roleNo === undefined) {
      const displayOrder = roles.reduce((max, role) => Math.max(max, role.displayOrder + 1), 0)
      const inserted = await trx
        .insertInto('roles')
        .values({ roleName: SUPER_ROLE_NAME, permissions: JSON.stringify(['*']), displayOrder })
        .executeTakeFirstOrThrow()
      if (inserted.insertId === undefined) throw new Error('새 역할 번호를 받지 못했다')
      roleNo = inserted.insertId
    }

    await trx
      .insertInto('users')
      .values({ userId, userName, password: passwordHash, roleNo, isPasswordChangeRequired: true })
      .execute()
    return true
  })

  if (!created) {
    console.error(
      '이미 사용자가 있습니다 — 첫 관리자 시드는 빈 DB 에서만 돕니다. 다음 관리자는 화면(사용자 추가)에서 만듭니다.',
    )
    process.exitCode = 1
  } else {
    console.log(`첫 관리자를 만들었습니다 — 아이디 ${userId}`)
    console.log(`임시 비밀번호(이번 한 번만 보입니다): ${temporaryPassword}`)
    console.log('첫 로그인에서 새 비밀번호로 바꿉니다.')
  }
} finally {
  await db.destroy()
}
```

- [ ] **Step 3: 시드가 돈다 · 두 번째는 거부한다**

```bash
S="C:/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/16e35d0e-99b9-43e3-afea-5b20333f2d4e/scratchpad"
pnpm --filter @project/backend typecheck
pnpm --filter @project/backend seed:admin admin 관리자 | tee "$S/tpl/seed-tpl-dev.txt"
grep '임시 비밀번호' "$S/tpl/seed-tpl-dev.txt" | sed 's/.*: //' > "$S/tpl/tpl-dev-temp-password.txt"
pnpm --filter @project/backend seed:admin admin2 둘째
echo "exit=$?"
```

Expected: 첫 실행이 `첫 관리자를 만들었습니다 — 아이디 admin` · `임시 비밀번호(이번 한 번만 보입니다): <16자>` 를 찍고, 그 값이 **S**`\tpl\tpl-dev-temp-password.txt` 한 줄로 남는다(다음 Step 이 읽는다). 둘째 실행은 `이미 사용자가 있습니다 …` 와 `exit=1`. DB 확인:

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test tpl_dev -e "select role_no, role_name, permissions from roles; select user_no, user_id, role_no, is_password_change_required from users"
```

→ 역할 `최고 관리자` `["*"]` 하나, 사용자 `admin` 하나(`is_password_change_required` 1).

- [ ] **Step 4: 첫 로그인 · 관리자 스모크**

백그라운드(Bash `run_in_background: true`): `cd /c/Users/kim52/workspace/kim5257-project-template/packages/backend && node dist/main.js`. 포그라운드:

```bash
S="C:/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/16e35d0e-99b9-43e3-afea-5b20333f2d4e/scratchpad"
SMOKE="$S/tpl/smoke-api.mjs"
node "$SMOKE" http://127.0.0.1:4000/api first-login admin "$(cat "$S/tpl/tpl-dev-temp-password.txt")" 'Tpl-admin-2026!'
node "$SMOKE" http://127.0.0.1:4000/api admin admin 'Tpl-admin-2026!'
```

Expected: `smoke first-login OK`(로그인 · 강제 변경 상태 · 다른 라우트 403 · 변경 · 전체 권한)와 `smoke admin OK`(갱신 회전 · GET 일곱 · 팀 만들기 201 · 감사 행 · 로그아웃). 서버를 멈춘다. 개발 DB 의 관리자 비밀번호는 이제 `Tpl-admin-2026!` 다 — Task 5~7 이 쓴다.

- [ ] **Step 5: run.sh · Dockerfile 둘 · nginx · 배포 env 예시**

T `packages/backend/run.sh` 전체(LF 유지):

```sh
#!/bin/sh
# 🔴 @ssworks/admin-server 가 기동에서 확인한다 — UTC 가 아니면 멈춘다
export TZ=UTC
# Docker Secret 을 우선 쓰고, 없으면 config 볼륨으로 폴백한다(이미 있는 env 는 덮지 않는다)
if [ -f /run/secrets/backend_env ]; then
    exec node --env-file /run/secrets/backend_env /app/dist/main.js
elif [ -f /app/config/.env ]; then
    exec node --env-file /app/config/.env /app/dist/main.js
else
    exec node /app/dist/main.js
fi
```

T `Dockerfile.backend` 전체:

```dockerfile
# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:24.11.0 AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /build

# package.json 먼저 복사 (레이어 캐시 활용)
COPY tsconfig.base.json pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json                                     ./packages/shared/
COPY packages/backend/package.json                                    ./packages/backend/

# 🔴 --ignore-scripts — 루트 prepare(shared 빌드)는 소스를 복사하기 전이라 여기서 돌면 실패한다. 빌드는 아래에서 한다.
RUN pnpm install --frozen-lockfile --ignore-scripts

# 소스 복사 후 빌드
COPY packages/shared                 ./packages/shared
COPY packages/backend                ./packages/backend

RUN pnpm --filter @project/shared build && \
    pnpm --filter @project/backend build

# 프로덕션 번들 추출(workspace 의존성 포함). pnpm 10 은 inject-workspace-packages 없이 --legacy 가 필요하다.
RUN pnpm deploy --filter @project/backend --prod --legacy /deploy

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:24.11.0-slim AS runtime

ENV NODE_ENV=production
# 🔴 @ssworks/admin-server 가 기동에서 확인한다 — UTC 가 아니면 멈춘다
ENV TZ=UTC

WORKDIR /app

COPY --from=builder /deploy .

EXPOSE 4000

ENTRYPOINT ["/bin/sh", "run.sh"]
```

T `Dockerfile.nginx` 에서 세 곳을 바꾼다(나머지 그대로):

1. `COPY .npmrc tsconfig.base.json                           ./` 줄을 `COPY tsconfig.base.json                                 ./` 로 — `.npmrc` 는 저장소에 없어 빌드가 여기서 멈췄다.
2. `RUN pnpm install --frozen-lockfile` 를 `RUN pnpm install --frozen-lockfile --ignore-scripts` 로, 그 위에 Dockerfile.backend 와 같은 🔴 주석 한 줄.
3. `pnpm --filter frontend build` 를 `pnpm --filter @project/frontend build` 로.

T `nginx/default.conf` 에서 `# ── Swagger Docs → Backend ──` 주석과 `location /docs { … }` 블록 전체를 지운다(swagger 를 뺐다). `/api` 블록의 `proxy_set_header X-Real-IP $remote_addr;` 는 그대로 두고, `location /api {` 줄 바로 위에 주석 한 줄을 더한다:

```nginx
    # 🔴 X-Real-IP 를 $remote_addr 로 덮어쓴다 — backend 가 이 헤더로 클라이언트 IP 를 읽는다(clientIp: 'x-real-ip')
```

T `.env.backend.example` 전체(Docker secret 으로 넣는 운영 env — 형식은 `packages/backend/.env.example` 과 같다):

```dotenv
# 운영 env — deploy.sh 가 이 형식의 .env.backend 로 Docker secret 을 만든다. 🔴 값 뒤에 주석을 달지 않는다.
TZ=UTC
PORT=4000
DB_HOST=your-db-host
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_password
DB_NAME=app_db
DB_SSL=true
ADMIN_JWT_SECRET=change-me-to-a-random-string-of-at-least-32-characters
```

- [ ] **Step 6: backend 이미지 · 컨테이너 기동**

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
docker build -f Dockerfile.backend -t tpl-backend:dev .
docker run -d --name tpl-backend -p 4100:4000 --env-file packages/backend/.env -e DB_HOST=host.docker.internal tpl-backend:dev
SMOKE="C:/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/16e35d0e-99b9-43e3-afea-5b20333f2d4e/scratchpad/tpl/smoke-api.mjs"
node "$SMOKE" http://127.0.0.1:4100/api anon
node "$SMOKE" http://127.0.0.1:4100/api admin admin 'Tpl-admin-2026!'
docker logs tpl-backend
docker rm -f tpl-backend
```

Expected: 빌드 성공(`pnpm deploy … --legacy` 단계 포함), 스모크 둘 OK, `docker logs` 에 `Nest application successfully started`. DB TLS 가 `host.docker.internal` 에서 실패하면(로그의 TLS · 인증서 오류) `-e DB_SSL=false` 를 더해 한 번 더 돌리고 그 사실을 **S**`\tpl\notes.md` 에 적는다(검증 기록 재료 — 코드는 바꾸지 않는다).

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/seed packages/backend/run.sh Dockerfile.backend Dockerfile.nginx nginx/default.conf .env.backend.example
git commit -m "feat: 첫 관리자 시드(seed:admin — 임시 비밀번호 · 강제 변경) · Docker 런타임을 킷에 맞춤

run.sh · Dockerfile 이 dist/main.js 를 TZ=UTC 로 띄운다. 없는 .npmrc 의 COPY 를 걷고, 설치는 --ignore-scripts(루트 prepare),
pnpm deploy 는 --legacy(pnpm 10). nginx 의 swagger 프록시를 뺐다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: frontend — 배선 · 인증 · 본인 페이지 · 라우트 테스트

**Files:**

- Modify: T `package.json`(lint 스크립트), T `eslint.config.js`, T `packages/frontend/package.json`, `vite.config.mts`, `env.d.ts`, `src/main.ts`, `src/App.vue`, `src/router/index.ts`, `src/plugins/index.ts`, `src/plugins/vuetify.ts`, `src/stores/app.ts`, `src/layouts/default.vue`, `src/api/client.ts`, `src/api/README.md`, `src/stores/README.md`, `src/pages/README.md`, `src/pages/index.vue`, `src/typed-router.d.ts`(생성물)
- Create: T `packages/frontend/src/config.ts`, `src/admin/menu.ts`, `src/plugins/toast.ts`, `src/plugins/confirm.ts`, `src/state/ip-block.ts`, `src/api/auth.ts`, `src/api/sessions.ts`, `src/composables/usePermission.ts`, `src/layouts/auth.vue`, `src/pages/login.vue`, `src/pages/password.vue`, `src/pages/403.vue`, `src/pages/account.vue`, `src/pages/[...path].vue`, `src/router/routes.test.ts`
- Delete: T `packages/frontend/src/api/test.ts`

**Interfaces:**

- Consumes(Task 2): `P` · `Permission` · `passwordPolicy`.
- Produces(Task 6 · 7 · 스킬이 쓴다):
  - `api`(`@/api/client`) — `api.get<T>(path, { params })` · `api.post<T>(path, body?)` · `api.patch<T>(path, body?)` · `api.del<T>(path, body?)`, 봉투를 벗긴 `data` 를 돌려준다. `client.onAuthFailure(fn)`.
  - `toast`(`@/plugins/toast`) — `toast.success(msg)` · `toast.error(msg)`.
  - `usePermission()`(`@/composables/usePermission`) — `hasPermission(...p: Permission[])` · `hasAnyPermission(...)`.
  - `useAppStore()`(`@/stores/app`) — `userInfo` · `refresh()` · `clearSession()` · `logout()`.
  - `MENU_GROUPS`(`@/admin/menu`) — `[{ key: 'org', title: '조직', icon: 'mdi-domain' }]`.
  - `sessionsApi`(`@/api/sessions`) — `mine()` · `revokeMine(sessionNo)` · `revokeOthers()` · `list(params)` · `revoke(sessionNo)` · `revokeUser(userNo)`, `type SessionFilter = { keyword?: string }`.
  - `authApi.changePassword(body: PasswordChange)`(`@/api/auth`).
  - 라우트 테스트 `src/router/routes.test.ts` 의 상수 `EXPECTED_MENU` — Task 6 · 7 이 늘린다.

- [ ] **Step 1: 의존성 · 스크립트 · vitest 설정**

T `packages/frontend/package.json` 의 `scripts` 에 둘을 더한다 — `typecheck` 는 루트 `pnpm -r typecheck` 가 부르는 이름이다(지금은 `type-check` 만 있어 루트 검사에서 frontend 가 빠졌다):

```json
    "typecheck": "vue-tsc --build --force",
    "test": "vitest run",
```

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
pnpm --filter @project/frontend add --save-exact @ssworks/admin-ui@0.4.1 @ssworks/admin-shared@0.4.1
pnpm --filter @project/frontend add @he-tree/vue@^2.10.5 codemirror@^6.0.2 @codemirror/state@^6.7.6 zod@^4.3.5
pnpm --filter @project/frontend add -D vitest@^4.1.10 happy-dom@^20.0.0
```

`packages/frontend/package.json` 에서 `@ssworks/*` 둘이 `"0.4.1"`(캐럿 없음)인지 본다.

T `packages/frontend/vite.config.mts` — 맨 위에 `/// <reference types="vitest/config" />` 한 줄을 더하고, `Vuetify({ … })` 를 아래로, `server` 블록 다음에 `test` 를 더한다(나머지 그대로):

```ts
    Vuetify({
      autoImport: true,
      // 테스트(vitest)는 라우트 · 메뉴만 잰다 — Vuetify sass 를 컴파일하지 않는다
      styles: process.env.VITEST ? 'none' : { configFile: 'src/styles/settings.scss' },
    }),
```

```ts
  server: {
    port: 3000,
    proxy: {
      // 🔴 같은 출처로 붙인다 — 관리자 쿠키(admin_at · admin_rt)가 그대로 간다. 운영은 nginx 가 같은 일을 한다.
      '/api/': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    // 🔴 vuetify/components 가 컴포넌트마다 .css 를 import 한다 — Node ESM 로더가 모르니 Vite 가 받게 inline 으로
    server: { deps: { inline: ['vuetify', '@ssworks/admin-ui'] } },
  },
```

- [ ] **Step 2: 실패하는 라우트 테스트**

T `packages/frontend/src/admin/menu.ts`:

```ts
/** 드로어 메뉴 그룹 — 페이지 meta.menu.group 이 key 를 가리킨다. 그룹 없는 메뉴는 최상위에 놓인다. */
export const MENU_GROUPS = [{ key: 'org', title: '조직', icon: 'mdi-domain' }]
```

T `packages/frontend/src/router/routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import {
  assertParentAnyPermissionsCoverChildren,
  buildMenu,
  type AdminRouteMeta,
} from '@ssworks/admin-ui'
import type { Permission } from '@project/shared'
import { MENU_GROUPS } from '@/admin/menu'

// 드로어 메뉴 — [최상위 항목 id] 또는 [그룹 key, 자식 id …]. 메뉴 페이지를 더하면 여기도 고친다(admin-scaffold 스킬).
const EXPECTED_MENU = [['/']]

/** 파일 기반 라우트를 펴서 전체 경로와 함께 낸다 */
function walk(
  records: readonly RouteRecordRaw[],
  parent = '',
): { path: string; record: RouteRecordRaw }[] {
  return records.flatMap((record) => {
    const path = record.path.startsWith('/')
      ? record.path
      : `${parent.replace(/\/$/, '')}/${record.path}`
    return [{ path, record }, ...walk(record.children ?? [], path)]
  })
}

/** 컴포넌트를 가진 레코드 = 화면 하나 */
const pages = walk(routes).filter(({ record }) => 'component' in record && record.component != null)
const metaOf = (record: RouteRecordRaw) => (record.meta ?? {}) as AdminRouteMeta<Permission>

describe('라우트 meta', () => {
  it('페이지마다 접근 선언이 정확히 하나다 — isPublic · selfOnly · permissions · anyPermissions', () => {
    for (const { path, record } of pages) {
      const meta = metaOf(record)
      const declared = [
        meta.isPublic === true,
        meta.selfOnly === true,
        (meta.permissions?.length ?? 0) > 0,
        (meta.anyPermissions?.length ?? 0) > 0,
      ].filter(Boolean).length
      expect(declared, `${path} 의 접근 선언 수`).toBe(1)
    }
  })

  it('페이지마다 제목이 있다(문서 제목 · 메뉴)', () => {
    for (const { path, record } of pages) expect(metaOf(record).title, path).toBeTruthy()
  })

  it('부모의 anyPermissions 가 자식 권한을 덮는다', () => {
    expect(() => assertParentAnyPermissionsCoverChildren(routes)).not.toThrow()
  })

  it('드로어 메뉴는 정해 둔 모양이다(설정 셸의 자식은 드로어에 없다)', () => {
    const menu = buildMenu<Permission>(routes, { groups: MENU_GROUPS })
    expect(
      menu.map((node) => [node.id, ...(node.children ?? []).map((child) => child.id)]),
    ).toEqual(EXPECTED_MENU)
  })
})
```

Run: `pnpm --filter @project/frontend test`
Expected: FAIL — 지금의 `pages/index.vue`(옛 테스트 화면)에 `definePage` 가 없어 `/ 의 접근 선언 수: expected 0 to be 1`, 메뉴 테스트가 `[]` ≠ `[['/']]`. (테스트가 모듈 해석 오류로 아예 못 돌면 Step 1 의 `test.server.deps.inline` · `styles` 를 먼저 본다.)

- [ ] **Step 3: 설정 · 플러그인 · 상태**

T `packages/frontend/src/config.ts`:

```ts
/** 사이트 이름 — 앱바 · 로그인 화면 · 문서 제목에 쓴다. 프로젝트마다 바꾼다. */
export const SITE_NAME = '관리자'
```

T `packages/frontend/src/plugins/vuetify.ts` 전체:

```ts
/**
 * plugins/vuetify.ts
 *
 * 🔴 전역 CSS(vuetify/styles · @mdi/font)는 여기서 들인다 — @ssworks/admin-ui 는 들이지 않는다.
 * 킷 프리셋: compact density · outlined 필드 · 한국어 · 기본 테마 'system'. 브랜드 색 같은 프로젝트 값은
 * createAdminVuetify(옵션)으로 넘긴다(@ssworks/admin-ui README "Vuetify 프리셋").
 */
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createAdminVuetify } from '@ssworks/admin-ui'

export default createAdminVuetify()
```

T `packages/frontend/src/plugins/toast.ts`:

```ts
import { createToast } from '@ssworks/admin-ui'

/** 앱 하나의 토스트 — App.vue 의 <AdminToast /> 가 그린다 */
export const toast = createToast()
```

T `packages/frontend/src/plugins/confirm.ts`:

```ts
import { createConfirm } from '@ssworks/admin-ui'

/** 앱 하나의 확인 창 — App.vue 의 <AdminConfirm /> 와 한 벌. 이탈 확인(useDirtyGuard)이 이것으로 묻는다 */
export const confirm = createConfirm()
```

T `packages/frontend/src/state/ip-block.ts`:

```ts
// IpBlockedDialog 가 읽는 플래그. 🔴 앱 모듈을 import 하지 않는다(순환 0).
// backend 의 IP 접근 제어 모듈을 켜면 서버가 ERR_IP_NOT_ALLOWED 를 내고 api/client.ts 가 이 플래그를 세운다.
import { reactive } from 'vue'

export const ipBlock = reactive({ blocked: false, ip: '' })

export function resetIpBlock(): void {
  ipBlock.blocked = false
  ipBlock.ip = ''
}
```

- [ ] **Step 4: API 클라이언트 · 어댑터 · 스토어 · 권한 훅**

T `packages/frontend/src/api/client.ts` 전체:

```ts
import { createApiClient } from '@ssworks/admin-ui'
import { toast } from '@/plugins/toast'
import { ipBlock } from '@/state/ip-block'

// 🔴 라우터 · 스토어를 import 하지 않는다 — api → router → store → api 순환이 된다. 401 뒤 이동은 main.ts 의 onAuthFailure.
// 경로 규약 (가): baseURL 이 global prefix 와 관리자 prefix(/api/admin)를 모두 셈한다 — 화면 경로에 '/admin' 을 붙이지
//   않는다. 🔴 섞으면 토큰 갱신만 404 가 되어 15분마다 로그인 화면으로 튕긴다(@ssworks/admin-ui README 「최소 배선」).
export const client = createApiClient({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/admin',
  refreshPath: '/auth/refresh',
  noRetryPaths: ['/auth/login'],
  // 🔴 onError 는 한 매크로태스크 뒤에 불리고, 화면이 직접 보인 오류(error.handled)는 오지 않는다.
  onError: (error) => {
    // IP 차단은 토스트가 아니라 App.vue 의 IpBlockedDialog 가 알린다
    if (error.code === 'ERR_IP_NOT_ALLOWED') {
      ipBlock.blocked = true
      ipBlock.ip = (error.details as { clientIp?: string } | undefined)?.clientIp ?? ''
      return
    }
    // 🔴 401 은 토스트하지 않는다 — 갱신까지 실패한 401 은 "로그인 필요" 라는 정상 경로다
    if (error.status === 401) return
    toast.error(error.message)
  },
})

export const { api } = client
```

T `packages/frontend/src/api/auth.ts`:

```ts
import { api } from './client'

export interface PasswordChange {
  currentPassword: string
  newPassword: string
}

/** 로그인 · 로그아웃 · 내 정보는 stores/app.ts 가 부른다. 여기는 그 밖의 본인 인증 호출. */
export const authApi = {
  /** 본인 비밀번호 변경 — 성공하면 서버가 다른 세션을 끊는다 */
  changePassword: (body: PasswordChange) => api.patch('/auth/password', body),
}
```

T `packages/frontend/src/api/sessions.ts`:

```ts
import type {
  AdminSession,
  AdminSessionListItem,
  AdminSessionRevokeResult,
  Paginated,
} from '@ssworks/admin-shared'
import type { ServerTableParams } from '@ssworks/admin-ui'
import { api } from './client'

/** 전체 세션 목록 필터 — 아이디 · 이름 부분일치 */
export interface SessionFilter {
  keyword?: string
}

/** useSessions 어댑터 — 내 세션(전량)과 관리자 전체 목록(서버 페이징) */
export const sessionsApi = {
  mine: () => api.get<{ items: AdminSession[] }>('/sessions/me').then((r) => r.items),
  revokeMine: (sessionNo: bigint) => api.del(`/sessions/me/${sessionNo}`),
  revokeOthers: () => api.post<AdminSessionRevokeResult>('/sessions/me/revoke-others'),
  list: (params: ServerTableParams<SessionFilter>) =>
    api.get<Paginated<AdminSessionListItem>>('/sessions', { params }),
  revoke: (sessionNo: bigint) => api.del(`/sessions/${sessionNo}`),
  revokeUser: (userNo: bigint) => api.del<AdminSessionRevokeResult>(`/sessions/user/${userNo}`),
}
```

T `packages/frontend/src/stores/app.ts` 전체:

```ts
import { ApiError, createAppStore, type AdminUserInfo } from '@ssworks/admin-ui'
import { api } from '@/api/client'
import { resetIpBlock } from '@/state/ip-block'

export const useAppStore = createAppStore<AdminUserInfo>('app', {
  fetchMe: () => api.get<AdminUserInfo>('/auth/me'),
  // 🔴 IP 차단 플래그는 로그인 · 로그아웃 때 비운다 — 안 비우면 로그인 화면에 차단 대화상자가 남는다.
  //    여전히 막혀 있으면 다음 요청의 onError 가 다시 세운다.
  login: async (credentials) => {
    resetIpBlock()
    await api.post('/auth/login', credentials)
  },
  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      resetIpBlock()
    }
  },
  isForbidden: (error) => error instanceof ApiError && error.status === 403,
})
```

T `packages/frontend/src/composables/usePermission.ts`:

```ts
import { createUsePermission } from '@ssworks/admin-ui'
import type { Permission } from '@project/shared'
import { useAppStore } from '@/stores/app'

/** 권한 판정 — 게터로 읽는다(값을 캐시하면 로그아웃 · 갱신 뒤에도 옛 권한이 남는다) */
export const usePermission = createUsePermission<Permission>(
  () => useAppStore().userInfo?.permissions ?? [],
)
```

```bash
git rm -q packages/frontend/src/api/test.ts
```

- [ ] **Step 5: 라우터 · 플러그인 등록 · main · App · 레이아웃 · env.d.ts**

T `packages/frontend/src/router/index.ts` 전체:

```ts
/**
 * router/index.ts
 *
 * 파일 기반 라우트(src/pages) + 레이아웃(src/layouts, meta.layout) + 킷 가드.
 * 접근 · 메뉴 · 제목은 페이지의 definePage({ meta }) 하나가 정한다 — routes.test.ts 가 선언을 잰다.
 */
import { setupLayouts } from 'virtual:generated-layouts'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import { createAdminGuard, createTitleGuard, installChunkRecovery } from '@ssworks/admin-ui'
import type { Permission } from '@project/shared'
import { usePermission } from '@/composables/usePermission'
import { SITE_NAME } from '@/config'
import { useAppStore } from '@/stores/app'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: setupLayouts(routes),
})

router.beforeEach(
  createAdminGuard<Permission>({
    ensureInitialized: () => useAppStore().initialize(),
    isAuthorized: () => useAppStore().authorized,
    isPermissionDenied: () => useAppStore().permissionDenied,
    isPasswordChangeRequired: () => useAppStore().userInfo?.isPasswordChangeRequired === true,
    check: usePermission(),
    paths: { passwordChange: '/password' },
  }),
)
router.afterEach(createTitleGuard(SITE_NAME))
installChunkRecovery(router)

export default router
```

T `packages/frontend/src/plugins/index.ts` 전체:

```ts
/**
 * plugins/index.ts
 *
 * Automatically included in `./src/main.ts`
 */
import type { App } from 'vue'
import { createPinia } from 'pinia'
import { createAdminUi } from '@ssworks/admin-ui'
import { SITE_NAME } from '@/config'
import router from '@/router'
import { ipBlock } from '@/state/ip-block'
import { useAppStore } from '@/stores/app'
import { confirm } from './confirm'
import { toast } from './toast'
import vuetify from './vuetify'

export function registerPlugins(app: App) {
  app.use(createPinia())
  app.use(router)
  app.use(vuetify)
  app.use(toast)
  app.use(confirm)
  app.use(
    createAdminUi({
      siteName: SITE_NAME,
      user: () => useAppStore().userInfo, // 호출 시점마다 평가된다 — 값을 캐시하지 않는다
      // 🔴 거부하면 안 된다 — createAppStore().logout 은 서버 호출이 실패해도 세션을 비우고 resolve 한다.
      logout: () => useAppStore().logout(),
      ipBlocked: () => ipBlock,
    }),
  )
}
```

T `packages/frontend/src/main.ts` 전체:

```ts
/**
 * main.ts
 *
 * 플러그인을 등록하고 App 을 붙인다. 🔴 import 방향은 main → router → stores → api → (plugins/toast · state/ip-block)
 * 한 줄이다 — 401 뒤 이동(라우터 · 스토어가 필요한 콜백)은 api 가 아니라 여기서 단다.
 */
import { createApp } from 'vue'
import { START_LOCATION } from 'vue-router'
import '@ssworks/admin-ui/style.css'
import 'unfonts.css'
import { client } from '@/api/client'
import { registerPlugins } from '@/plugins'
import router from '@/router'
import { useAppStore } from '@/stores/app'
import App from './App.vue'

const app = createApp(App)

registerPlugins(app)

// 갱신까지 실패 = 로그아웃 상태
client.onAuthFailure(() => {
  useAppStore().clearSession()
  const current = router.currentRoute.value
  // 🔴 첫 내비게이션 중(START_LOCATION)에는 이동하지 않는다 — 가드가 /login 으로 보낸다. 여기서 또 보내면
  //    진행 중인 내비게이션과 엉켜 화면이 백지가 된다. 이미 로그인 화면이면 그대로 둔다.
  if (current === START_LOCATION || current.path === '/login') return
  void router.replace({ path: '/login', query: { redirect: current.fullPath } })
})

app.mount('#app')
```

T `packages/frontend/src/App.vue` 전체:

```vue
<script lang="ts" setup>
  // 🔴 IpBlockedDialog 는 여기(레이아웃 밖) — 로그인 화면에서도 떠야 한다. 토스트 · 확인 창도 앱에 하나씩.
  import { AdminConfirm, AdminToast, IpBlockedDialog } from '@ssworks/admin-ui'
</script>

<template>
  <VApp>
    <RouterView />
    <AdminToast />
    <AdminConfirm />
    <IpBlockedDialog />
  </VApp>
</template>
```

T `packages/frontend/src/layouts/default.vue` 전체:

```vue
<script lang="ts" setup>
  // 로그인 뒤 화면의 껍데기 — 앱바 · 드로어 메뉴 · 본문(RouterView)은 킷 AdminShell 이 그린다.
  // 메뉴는 페이지 meta.menu 에서 파생한다 — 손으로 나열하지 않는다(메뉴와 권한이 갈리면 보이는데 403 이 된다).
  // 🔴 날 routes 를 depth 1 로 본다 — 하위 페이지는 점 표기(users.new.vue)라 최상위이고, 설정 셸의 자식은 드로어에
  //    올리지 않는다(셸의 좌측 메뉴가 그린다). 폴더(users/index.vue)로 두면 메뉴에서 빠진다(pages/README.md).
  import { routes } from 'vue-router/auto-routes'
  import { AdminShell, buildMenu, type AppBarMenuItem } from '@ssworks/admin-ui'
  import type { Permission } from '@project/shared'
  import { MENU_GROUPS } from '@/admin/menu'

  const items = buildMenu<Permission>(routes, { groups: MENU_GROUPS })
  const menuItems: AppBarMenuItem[] = [
    { icon: 'mdi-account-circle-outline', title: '내 계정', to: '/account' },
  ]
</script>

<template>
  <AdminShell :app-bar-props="{ showTeamRole: true, menuItems }" :menu-props="{ items }" />
</template>
```

T `packages/frontend/src/layouts/auth.vue`:

```vue
<script lang="ts" setup>
  // 로그인 전 화면(로그인 · 강제 변경 · 403)의 껍데기 — 앱바 · 메뉴가 없다
  import { AuthShell } from '@ssworks/admin-ui'
  import { SITE_NAME } from '@/config'
</script>

<template>
  <AuthShell>
    <template #brand>
      <div class="text-h6 mb-4">{{ SITE_NAME }}</div>
    </template>
  </AuthShell>
</template>
```

T `packages/frontend/env.d.ts` 전체:

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-vue-layouts-next/client" />

// RouteMeta 증강은 프로젝트 몫이다 — @ssworks/admin-ui 는 증강하지 않는다(README "Peer 의존").
import 'vue-router'
import type { AdminRouteMeta } from '@ssworks/admin-ui'
import type { Permission } from '@project/shared'

declare module 'vue-router' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface RouteMeta extends AdminRouteMeta<Permission> {}
}
```

- [ ] **Step 6: 인증 · 본인 페이지**

T `packages/frontend/src/pages/index.vue` 전체(옛 테스트 화면을 바꾼다):

```vue
<script lang="ts" setup>
  // 로그인 뒤 첫 화면. 프로젝트의 대시보드로 바꿔 쓴다.
  import { CardLayout } from '@ssworks/admin-ui'
  import { SITE_NAME } from '@/config'
  import { useAppStore } from '@/stores/app'

  definePage({ meta: { title: '홈', selfOnly: true, menu: { icon: 'mdi-home-outline' } } })

  const store = useAppStore()
</script>

<template>
  <div class="pa-4">
    <CardLayout>
      <VCardTitle>{{ SITE_NAME }}</VCardTitle>
      <VCardText>
        <p>{{ store.userInfo?.userName }}님, 반갑습니다.</p>
        <p class="text-medium-emphasis">왼쪽 메뉴에서 관리할 항목을 고르세요.</p>
      </VCardText>
    </CardLayout>
  </div>
</template>
```

T `packages/frontend/src/pages/login.vue` — **S**`\src-aksv\src\pages\LoginPage.vue` 를 옮긴다. `<script setup>` 은 아래로 바꾸고, `<template>` · `<style scoped>` 는 원본 그대로 옮기되 `<p class="text-caption text-medium-emphasis">돌아갈 곳: …</p>` 단락 하나를 지운다.

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/LoginPage.vue(실서버 확인 2026-10-16)
  // 바꾼 점: 돌아갈 곳 디버그 문구 · 기본 아이디('admin')를 걷었다. 돌아갈 곳은 safeRedirect 로 고른다(오픈 리다이렉트 방어).
  import { ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import {
    ApiError,
    PasswordField,
    SessionNotEstablishedError,
    safeRedirect,
  } from '@ssworks/admin-ui'
  import { useAppStore } from '@/stores/app'

  definePage({ meta: { title: '로그인', layout: 'auth', isPublic: true, needNonAuth: true } })

  const store = useAppStore()
  const route = useRoute()
  const router = useRouter()

  const userId = ref('')
  const password = ref('')
  const error = ref('')
  const pending = ref(false)

  async function onSubmit() {
    if (pending.value || !userId.value || !password.value) return
    pending.value = true
    error.value = ''
    try {
      await store.login({ userId: userId.value, password: password.value })
      await router.replace(safeRedirect(route.query.redirect))
    } catch (e) {
      if (e instanceof SessionNotEstablishedError) {
        error.value = '로그인은 됐지만 세션이 만들어지지 않았습니다. 관리자에게 문의하세요.'
      } else if (e instanceof ApiError) error.value = e.message
      else throw e
    } finally {
      pending.value = false
    }
  }
</script>
```

T `packages/frontend/src/pages/password.vue` — **S**`\src-aksv\src\pages\PasswordPage.vue` 를 옮긴다. `<script setup>` 은 아래로, `<template>` · `<style scoped>` 는 원본 그대로.

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/PasswordPage.vue(실서버 확인 2026-10-16) — 강제 변경 화면(임시 비밀번호로 로그인한 뒤)
  // 바꾼 점: 호출은 api/auth.ts, 정책은 @project/shared.
  import { computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { PasswordChangeForm, safeRedirect, useAdminUi, useWriteFlow } from '@ssworks/admin-ui'
  import { passwordPolicy } from '@project/shared'
  import { authApi, type PasswordChange } from '@/api/auth'
  import { toast } from '@/plugins/toast'
  import { useAppStore } from '@/stores/app'

  definePage({ meta: { title: '비밀번호 변경', layout: 'auth', selfOnly: true } })

  const store = useAppStore()
  const route = useRoute()
  const router = useRouter()
  const ui = useAdminUi()

  const required = computed(() => store.userInfo?.isPasswordChangeRequired === true)
  const { run, fieldErrors } = useWriteFlow()

  const submit = (body: PasswordChange) =>
    run({
      action: () => authApi.changePassword(body),
      fields: ['currentPassword', 'newPassword'],
      onSuccess: async () => {
        await store.refresh() // 🔴 강제 변경 표시를 서버 값으로 되돌린다
        toast.success('비밀번호를 바꿨습니다.')
        await router.replace(safeRedirect(route.query.redirect))
      },
    })

  async function onLogout() {
    await ui.logout()
    await router.replace('/login')
  }
</script>
```

T `packages/frontend/src/pages/403.vue`:

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/ForbiddenPage.vue(실서버 확인 2026-10-16) — 가드가 권한 없음으로 보내는 곳(기본 paths.forbidden)
  // 바꾼 점: 지금 권한 목록(확인용 디버그 문구)을 걷었다.
  definePage({ meta: { title: '접근 권한 없음', layout: 'auth', selfOnly: true } })
</script>

<template>
  <VCard class="forbidden" variant="outlined">
    <VCardTitle>접근 권한 없음</VCardTitle>
    <VCardText>이 화면을 볼 권한이 없습니다. 권한이 필요하면 관리자에게 요청하세요.</VCardText>
    <VCardActions>
      <VSpacer />
      <VBtn to="/" variant="text">홈으로</VBtn>
    </VCardActions>
  </VCard>
</template>

<style scoped>
  .forbidden {
    width: min(440px, 100%);
  }
</style>
```

T `packages/frontend/src/pages/account.vue` — **S**`\src-aksv\src\pages\AccountPage.vue` 를 옮긴다. `<script setup>` 은 아래로, `<template>` · `<style scoped>` 는 원본 그대로.

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/AccountPage.vue(실서버 확인 2026-10-16) — 내 계정: 비밀번호 변경 + 내 세션
  // 바꾼 점: 호출은 api/auth.ts · api/sessions.ts, 정책은 @project/shared.
  import type { AdminSession } from '@ssworks/admin-shared'
  import {
    CardLayout,
    ConfirmDialog,
    PasswordChangeForm,
    SessionTable,
    useSessions,
    useWriteFlow,
  } from '@ssworks/admin-ui'
  import { passwordPolicy } from '@project/shared'
  import { authApi, type PasswordChange } from '@/api/auth'
  import { sessionsApi } from '@/api/sessions'
  import { toast } from '@/plugins/toast'
  import { useAppStore } from '@/stores/app'

  definePage({ meta: { title: '내 계정', selfOnly: true } })

  const store = useAppStore()

  // 비밀번호 변경 — 🔴 재인증 관문을 쓰지 않는다(본문이 이미 현재 비밀번호를 받는다)
  const { run, fieldErrors } = useWriteFlow()
  const submit = (body: PasswordChange) =>
    run({
      action: () => authApi.changePassword(body),
      fields: ['currentPassword', 'newPassword'],
      onSuccess: async () => {
        await store.refresh()
        toast.success('비밀번호를 바꿨습니다.')
      },
    })

  // 내 세션 — 전량 모드
  const mine = useSessions<AdminSession>({
    list: sessionsApi.mine,
    revoke: (row) => sessionsApi.revokeMine(row.sessionNo),
    revokeOthers: sessionsApi.revokeOthers,
    onRevoked: ({ action, revokedCount }) =>
      toast.success(
        action === 'revokeOthers' && revokedCount != null
          ? `다른 세션 ${revokedCount}개를 끝냈습니다.`
          : '세션을 끝냈습니다.',
      ),
  })
</script>
```

T `packages/frontend/src/pages/[...path].vue`:

```vue
<script lang="ts" setup>
  // 없는 경로. 로그인 뒤 화면이라 selfOnly — 로그인 전이면 가드가 /login 으로 보낸다.
  import { CardLayout } from '@ssworks/admin-ui'

  definePage({ meta: { title: '페이지를 찾을 수 없음', selfOnly: true } })
</script>

<template>
  <div class="pa-4">
    <CardLayout>
      <VCardTitle>페이지를 찾을 수 없습니다</VCardTitle>
      <VCardText>주소가 바뀌었거나 없는 화면입니다.</VCardText>
      <VCardActions>
        <VBtn to="/" variant="text">홈으로</VBtn>
      </VCardActions>
    </CardLayout>
  </div>
</template>
```

- [ ] **Step 7: 테스트 통과 · 형식 · 린트 · 타입 · 빌드**

T `eslint.config.js` 의 `ignores` 블록을 아래로 — frontend 는 자기 `eslint.config.js`(eslint-config-vuetify)가 맡는다:

```js
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs', 'packages/frontend/**'],
  },
```

T 루트 `package.json` 의 `lint` · `lint:fix`:

```json
    "lint": "eslint packages/ && pnpm --filter @project/frontend lint",
    "lint:fix": "eslint packages/ --fix && pnpm --filter @project/frontend lint:fix",
```

```bash
pnpm --filter @project/frontend test
pnpm format
pnpm lint:fix
pnpm lint
pnpm --filter @project/frontend typecheck
pnpm --filter @project/frontend build
```

Expected: 라우트 테스트 4개 PASS. `lint` 0 오류. typecheck · build 초록. `src/typed-router.d.ts` 가 페이지 여섯으로 다시 생성된다.

알려진 함정:

- eslint-config-vuetify 가 페이지 · 레이아웃 파일 이름(`403.vue` · `[...path].vue` · `index.vue` · `default.vue`)에 `vue/multi-word-component-names` 로 걸리면 frontend `eslint.config.js` 끝에 블록을 더한다:

```js
  {
    files: ['src/pages/**/*.vue', 'src/layouts/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
```

- 남은 경고는 지우지 못하면 Step 9 커밋 본문에 규칙 이름과 개수를 적는다.

- [ ] **Step 8: 화면 쪽 배선 확인(개발 서버)**

백그라운드 둘: `cd /c/Users/kim52/workspace/kim5257-project-template/packages/backend && node dist/main.js`, `cd /c/Users/kim52/workspace/kim5257-project-template/packages/frontend && pnpm dev`. 포그라운드:

```bash
curl -s -o /c/Users/kim52/AppData/Local/Temp/tpl-login.html -w "%{http_code}\n" http://localhost:3000/login
curl -s http://localhost:3000/api/health
curl -s -o /c/Users/kim52/AppData/Local/Temp/tpl-me.json -w "%{http_code}\n" http://localhost:3000/api/admin/auth/me
```

Expected: `200`, `{"success":true,"data":{"ok":true}}`, `401` — vite 프록시가 backend 에 닿는다. 둘 다 멈춘다(화면 확인은 Task 10).

- [ ] **Step 9: 문서 · Commit**

T `packages/frontend/src/api/README.md` 전체:

````markdown
# API 모듈

- `client.ts` — `@ssworks/admin-ui` 의 `createApiClient`. 봉투(`{ success, data }`) 벗김 · bigint · 401 → 갱신 → 재시도를 킷이 한다. 🔴 라우터 · 스토어를 import 하지 않는다.
- **경로 규약 (가)**: `baseURL` 이 `/api/admin` 이다 — 경로는 `'/users'` · `'/auth/me'` 처럼 쓰고 `'/admin'` 을 붙이지 않는다. 백엔드 컨트롤러는 `@Controller('admin/<자원>')`.
- `<자원>.ts` — 그 자원의 호출을 모은 어댑터 객체(`usersApi` · `sessionsApi` …). 페이지는 `api` 를 직접 부르지 않고 어댑터를 쓴다. 킷 headless 훅(`useServerTable` · `useSessions` · `useTeamTree` · `useRoleEditor` · `useLegalDocuments`)의 어댑터 모양에 맞춘다.
- 재인증(`ADMIN_REAUTH`)을 켜면 쓰기 본문에 `currentPassword` 가 붙는다 — 어댑터 본문 타입은 `… & Reauth`(`users.ts`).

```ts
export const noticesApi = {
  list: (params: ServerTableParams<NoticeFilter>) =>
    api.get<Paginated<Notice>>('/notices', { params }),
  create: (body: NoticeCreate) => api.post<{ item: Notice }>('/notices', body),
}
```
````

T `packages/frontend/src/stores/README.md` 전체:

```markdown
# Stores

- `app.ts` — 세션 스토어(`@ssworks/admin-ui` 의 `createAppStore`): `userInfo` · `authorized` · `permissionDenied` · `initialize()` · `login()` · `logout()` · `refresh()` · `clearSession()`. 가드 · 셸 · 권한 훅이 이 스토어를 게터로 읽는다.
- 권한 판정은 `composables/usePermission.ts`(`hasPermission(P.X)` · `hasAnyPermission(…)`) — `userInfo.permissions` 를 직접 읽지 않는다.
- 화면 상태는 페이지 안에 둔다. 여러 화면이 나눠 쓸 때만 새 스토어를 만든다.
```

T `packages/frontend/src/pages/README.md` 전체:

````markdown
# 페이지

관리자 페이지 하나를 더할 때는 **`admin-scaffold` 스킬**을 쓴다. 이 문서는 페이지 쪽 규칙이다.

## 파일 → 경로

| 파일                                  | 경로              | 쓰임                                       |
| ------------------------------------- | ----------------- | ------------------------------------------ |
| `users.vue`                           | `/users`          | 목록 — 드로어 메뉴                         |
| `users.new.vue`                       | `/users/new`      | 추가 — 🔴 점 표기: 중첩 없는 최상위 라우트 |
| `users.[userNo].vue`                  | `/users/:userNo`  | 편집                                       |
| `settings.vue` + `settings/roles.vue` | `/settings/roles` | 중첩 셸(설정) — 폴더는 셸에만 쓴다         |

🔴 하위 페이지는 폴더(`users/index.vue`)가 아니라 **점 표기**로 둔다. 폴더는 컴포넌트 없는 부모를 만들어 드로어 메뉴(`buildMenu`, depth 1)에서 빠진다.

## meta — `definePage` 하나

```vue
<script lang="ts" setup>
  import { P } from '@project/shared'

  definePage({
    meta: {
      title: '공지', // 문서 제목 · 메뉴 제목
      permissions: [P.NOTICES_READ], // 접근 — 아래 넷 중 정확히 하나
      menu: { group: 'org', icon: 'mdi-bullhorn-outline', order: 3 }, // 드로어 메뉴(없으면 메뉴에 없다)
    },
  })
</script>
```

- 접근 선언은 **정확히 하나**: `isPublic`(로그인 전) · `selfOnly`(로그인만) · `permissions`(AND) · `anyPermissions`(OR). `src/router/routes.test.ts` 가 잰다.
- 로그인 전 화면은 `layout: 'auth'`.
- 설정 셸 아래(`settings/<x>.vue`)는 `menu: { icon, order }` 가 셸의 좌측 메뉴를 만든다 — 부모 `settings.vue` 의 `anyPermissions` 에 그 권한을 더한다.
- 버튼은 `usePermission().hasPermission(P.X_WRITE)` 로 가린다. 서버가 같은 키로 막는다.
- 목록은 `useServerTable`(+ `#no-data` 는 `error` 먼저), 쓰기는 `useWriteFlow`, 이탈 확인은 페이지 setup 의 `useDirtyGuard` — `@ssworks/admin-ui` README.
````

```bash
git add -A package.json eslint.config.js packages/frontend pnpm-lock.yaml
git commit -m "feat: frontend 를 @ssworks/admin-ui 0.4.1 로 — 셸 · 가드 · 스토어 · 경로 규약 (가) · 인증 · 본인 페이지 · 라우트 테스트

파일 기반 라우팅을 유지하고 접근 · 메뉴 · 제목은 definePage meta 하나로. 라우트 테스트가 페이지마다 접근 선언 하나 ·
부모 anyPermissions · 드로어 메뉴 모양을 잰다. 루트 lint 가 frontend(eslint-config-vuetify)도 돈다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: frontend — 조직 페이지(사용자 · 팀 · 전체 세션)

**Files:**

- Create: T `packages/frontend/src/api/users.ts`, `src/api/teams.ts`, `src/api/roles.ts`, `src/components/users/UserEditForm.vue`, `src/pages/users.vue`, `src/pages/users.new.vue`, `src/pages/users.[userNo].vue`, `src/pages/teams.vue`, `src/pages/sessions.vue`
- Modify: T `packages/frontend/src/router/routes.test.ts`(`EXPECTED_MENU`)

**Interfaces:**

- Consumes(Task 5): `api` · `toast` · `usePermission` · `useAppStore` · `sessionsApi` · `type SessionFilter`.
- Produces:
  - `usersApi`(`@/api/users`) — `list(params)` · `members(q: TeamUserQuery)` · `get(userNo)` · `create(body)` · `update(userNo, body)` · `resign(userNo, body)` · `resetPassword(userNo, body)`, 타입 `Reauth = { currentPassword?: string }` · `UserStatus` · `UserFilter`.
  - `teamsApi`(`@/api/teams`) — `tree()` · `create(body)` · `rename(teamNo, body)` · `remove(teamNo)` · `move(move)`.
  - `rolesApi`(`@/api/roles`) — `RoleEditorApi`(`list` · `create` · `update` · `remove` · `move`). Task 7 의 역할 화면이 쓴다.
  - 스킬이 가리키는 본보기: 목록 `pages/users.vue`, 폼 · 재인증 `components/users/UserEditForm.vue`, 추가 · 편집 페이지 `pages/users.new.vue` · `pages/users.[userNo].vue`.

- [ ] **Step 1: 실패하는 메뉴 기대**

T `packages/frontend/src/router/routes.test.ts` 의 상수를 바꾼다:

```ts
const EXPECTED_MENU = [['/'], ['org', '/users', '/teams', '/sessions']]
```

Run: `pnpm --filter @project/frontend test`
Expected: FAIL — 메뉴 테스트가 `[['/']]` 만 받는다.

- [ ] **Step 2: 어댑터 셋**

T `packages/frontend/src/api/users.ts`:

```ts
import type {
  AdminTemporaryPassword,
  AdminUser,
  AdminUserCreate,
  AdminUserCreateResult,
  AdminUserResign,
  AdminUserUpdate,
  Paginated,
} from '@ssworks/admin-shared'
import type { ServerTableParams, TeamUserQuery } from '@ssworks/admin-ui'
import { api } from './client'

/** 재인증(ADMIN_REAUTH)을 켜면 쓰기 본문에 현재 비밀번호가 붙는다 */
export interface Reauth {
  currentPassword?: string
}

/** 'resigned' 는 퇴사 예정(효력 시각 전)도 포함한다 */
export type UserStatus = 'active' | 'resigned'

export interface UserFilter {
  keyword?: string
  teamNo?: bigint
  status?: UserStatus
}

export const usersApi = {
  list: (params: ServerTableParams<UserFilter>) =>
    api.get<Paginated<AdminUser>>('/users', { params }),
  /** 팀 화면 인원 목록 — 소속 전체 · 하위 팀 포함 · 아이디 · 이름 부분일치(TeamUserList 의 load) */
  members: (q: TeamUserQuery) =>
    api.get<Paginated<AdminUser>>('/users', {
      params: {
        page: q.page,
        itemsPerPage: q.itemsPerPage,
        filter: { teamNo: q.teamNo, recursive: q.recursive, keyword: q.keyword },
      },
    }),
  get: (userNo: bigint) => api.get<{ item: AdminUser }>(`/users/${userNo}`).then((r) => r.item),
  /** 🔴 응답의 temporaryPassword 는 이번 한 번만 보인다 — 서버는 저장하지도 감사에 남기지도 않는다 */
  create: (body: AdminUserCreate & Reauth) => api.post<AdminUserCreateResult>('/users', body),
  update: (userNo: bigint, body: AdminUserUpdate & Reauth) =>
    api.patch<{ item: AdminUser }>(`/users/${userNo}`, body),
  /** 퇴사일 당일까지 근무 — 지금 막으려면 어제 날짜(@ssworks/admin-server README "사용자 · 계정") */
  resign: (userNo: bigint, body: AdminUserResign & Reauth) =>
    api.post<{ item: AdminUser }>(`/users/${userNo}/resign`, body),
  /** 세션을 모두 끊고 잠금도 푼다 */
  resetPassword: (userNo: bigint, body: Reauth) =>
    api.post<AdminTemporaryPassword>(`/users/${userNo}/password-reset`, body),
}
```

T `packages/frontend/src/api/teams.ts`:

```ts
import type {
  AdminTeamCreate,
  AdminTeamMove,
  AdminTeamNode,
  AdminTeamRename,
} from '@ssworks/admin-shared'
import { api } from './client'

/** useTeamTree 어댑터 — 루트가 여럿인 트리(parentTeamNo: null 이 최상위) */
export const teamsApi = {
  tree: () => api.get<{ items: AdminTeamNode[] }>('/teams/tree').then((r) => r.items),
  create: (body: AdminTeamCreate) => api.post<{ teamNo: bigint }>('/teams', body),
  rename: (teamNo: bigint, body: AdminTeamRename) => api.patch(`/teams/${teamNo}`, body),
  /** 하위 팀째 지운다 — 소속 계정이 있으면 409 ERR_TEAM_HAS_MEMBERS */
  remove: (teamNo: bigint) => api.del(`/teams/${teamNo}`),
  /** 기준 형제 앞으로(beforeTeamNo: null = 맨 끝) */
  move: ({ teamNo, ...body }: AdminTeamMove) => api.patch(`/teams/${teamNo}/move`, body),
}
```

T `packages/frontend/src/api/roles.ts`:

```ts
import type { AdminRole } from '@ssworks/admin-shared'
import type { RoleEditorApi } from '@ssworks/admin-ui'
import { api } from './client'

/** useRoleEditor 어댑터 — 쓰기 문맥(ctx: revision · 재인증 비밀번호)을 본문에 합쳐 보낸다. 이동은 문맥이 없다. */
export const rolesApi: RoleEditorApi = {
  list: () => api.get<{ items: AdminRole[] }>('/roles').then((r) => r.items),
  create: (body, ctx) =>
    api.post<{ roleNo: bigint }>('/roles', { ...body, ...ctx }).then((r) => r.roleNo),
  update: (roleNo, body, ctx) =>
    api.patch(`/roles/${roleNo}`, { ...body, ...ctx }).then(() => undefined),
  remove: (roleNo, body, ctx) =>
    api.del(`/roles/${roleNo}`, { ...body, ...ctx }).then(() => undefined),
  move: (roleNo, body) => api.patch(`/roles/${roleNo}/move`, body).then(() => undefined),
}
```

- [ ] **Step 3: 사용자 목록 `pages/users.vue`**

**S**`\src-aksv\src\pages\UsersPage.vue` 를 옮긴다. `<script setup>` 전체:

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/UsersPage.vue(실서버 확인 2026-10-16) — 사용자 목록 · 퇴사 · 비밀번호 초기화
  // 바꾼 점: 호출은 api/users.ts · api/teams.ts, 재인증 관문은 ADMIN_REAUTH(서버 reauth 와 한 벌), #no-data 는 조회 오류를
  //   먼저 본다(@ssworks/admin-ui README "목록 · 쓰기").
  // 실서버 확인에서 정한 것: 상태는 resignAt(효력 시각)에서 셈한다 · 퇴사는 퇴사일을 묻는다.
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    flattenTeamTree,
    indentTeamName,
    type AdminTeamNode,
    type AdminTemporaryPassword,
    type AdminUser,
  } from '@ssworks/admin-shared'
  import {
    ApiError,
    ConfirmDialog,
    DataTablePanel,
    EmptyState,
    ReauthDialog,
    TemporaryPasswordDialog,
    bindQueryCodecs,
    queryCodec,
    useServerTable,
    useWriteFlow,
    withDefault,
    type AdminTableHeader,
  } from '@ssworks/admin-ui'
  import { ADMIN_REAUTH, P } from '@project/shared'
  import { teamsApi } from '@/api/teams'
  import { usersApi, type Reauth, type UserFilter, type UserStatus } from '@/api/users'
  import { usePermission } from '@/composables/usePermission'
  import { toast } from '@/plugins/toast'

  definePage({
    meta: {
      title: '사용자',
      permissions: [P.USERS_READ],
      menu: { group: 'org', icon: 'mdi-account-multiple-outline', order: 0 },
    },
  })

  interface Applied {
    q: string
    teamNo: bigint | undefined
    status: UserStatus | undefined
  }

  const router = useRouter()
  const check = usePermission()
  const canWrite = computed(() => check.hasPermission(P.USERS_WRITE))

  // 팀 선택지
  const teams = ref<AdminTeamNode[]>([])
  teamsApi.tree().then(
    (items) => (teams.value = items),
    (e: unknown) => {
      if (e instanceof ApiError) e.handled = true // 선택지가 비는 것뿐이다
    },
  )
  const teamOptions = computed(() =>
    flattenTeamTree(teams.value).map((row) => ({
      title: indentTeamName(row.teamName, row.depth),
      value: row.teamNo,
    })),
  )
  const statusOptions = [
    { title: '재직', value: 'active' },
    { title: '퇴사 · 퇴사 예정', value: 'resigned' },
  ]

  // 적용값(표와 URL 이 본다) · 입력값(칸)
  const applied = ref<Applied>({ q: '', teamNo: undefined, status: undefined })
  const input = ref<{ q: string; teamNo: bigint | null; status: UserStatus | null }>({
    q: '',
    teamNo: null,
    status: null,
  })
  watch(
    applied,
    (value) => {
      input.value = { q: value.q, teamNo: value.teamNo ?? null, status: value.status ?? null }
    },
    { immediate: true },
  )

  function apply() {
    applied.value = {
      q: input.value.q.trim(),
      teamNo: input.value.teamNo ?? undefined,
      status: input.value.status ?? undefined,
    }
  }

  function clearFilters() {
    applied.value = { q: '', teamNo: undefined, status: undefined }
  }

  const { page, itemsPerPage, sortBy, items, total, loading, error, isFiltered, reload } =
    useServerTable<AdminUser, UserFilter>({
      fetch: usersApi.list,
      // 서버 정렬 열: userId · userName · joinAt · resignAt · createAt · updateAt
      sort: { keys: ['userId', 'userName', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
      // URL 키는 q, 서버 필터는 keyword
      filters: () => ({
        keyword: applied.value.q || undefined,
        teamNo: applied.value.teamNo,
        status: applied.value.status,
      }),
      urlSync: bindQueryCodecs(applied, {
        q: withDefault(queryCodec.string(), ''),
        teamNo: queryCodec.bigint(),
        status: queryCodec.enumOf(['active', 'resigned'] as const),
      }),
    })

  /** 재직 · 퇴사 예정(효력 시각 전) · 퇴사 — 서버는 효력 시각(resignAt)만 준다 */
  function statusOf(user: AdminUser): { label: string; color?: string } {
    if (user.resignAt == null) return { label: '재직', color: 'success' }
    return new Date(user.resignAt).getTime() > Date.now()
      ? { label: '퇴사 예정', color: 'warning' }
      : { label: '퇴사' }
  }

  const headers: AdminTableHeader[] = [
    { title: '번호', key: 'userNo', sortable: false, nowrap: true },
    { title: '아이디', key: 'userId' },
    { title: '이름', key: 'userName' },
    { title: '팀', key: 'teamName', sortable: false },
    { title: '역할', key: 'roleName', sortable: false },
    { title: '입사일', key: 'joinAt', nowrap: true },
    { title: '상태', key: 'status', sortable: false },
    { title: '', key: 'actions', sortable: false, align: 'end' },
  ]

  /** 기준 시간대(KST) 오늘 — 퇴사일 기본값("오늘까지 근무"). 서버 timeZone 을 바꾸면 여기도 바꾼다 */
  const todayKst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)

  // 쓰기 — 확인 관문 · 재인증 관문
  const { run, submitting, confirmDialog, reauthDialog } = useWriteFlow()
  const issued = ref<string | null>(null)
  const target = ref('')
  const resignTarget = ref<AdminUser | null>(null)
  const resignDate = ref(todayKst())

  function askResign(row: AdminUser) {
    resignTarget.value = row
    resignDate.value = todayKst()
  }

  function resign() {
    const row = resignTarget.value
    if (row == null) return
    resignTarget.value = null
    const date = resignDate.value
    const message = `「${row.userName}(${row.userId})」 계정을 ${date} 까지 근무로 퇴사 처리합니다. 효력 시각이 지나면 이 계정으로는 로그인할 수 없습니다.`
    const send = (extra: Reauth) => usersApi.resign(row.userNo, { resignDate: date, ...extra })
    const onSuccess = () => {
      toast.success(`「${row.userName}」을(를) 퇴사 처리했습니다.`)
      void reload()
    }
    void run<unknown>(
      ADMIN_REAUTH
        ? {
            gate: 'reauth',
            title: '퇴사 처리',
            message,
            action: ({ currentPassword }) => send({ currentPassword }),
            onSuccess,
          }
        : {
            gate: 'confirm',
            reversible: false,
            title: '퇴사 처리',
            message,
            confirmLabel: '퇴사 처리',
            action: () => send({}),
            onSuccess,
          },
    )
  }

  function resetPassword(row: AdminUser) {
    target.value = `${row.userName}(${row.userId})`
    const message = `「${row.userName}」의 비밀번호를 임시 비밀번호로 바꾸고 접속 세션을 모두 끊습니다.`
    const send = (extra: Reauth) => usersApi.resetPassword(row.userNo, extra)
    const onSuccess = (r: AdminTemporaryPassword) => {
      issued.value = r.temporaryPassword
      void reload()
    }
    void run<AdminTemporaryPassword>(
      ADMIN_REAUTH
        ? {
            gate: 'reauth',
            message,
            action: ({ currentPassword }) => send({ currentPassword }),
            onSuccess,
          }
        : {
            gate: 'confirm',
            reversible: false,
            title: '비밀번호 초기화',
            message,
            confirmLabel: '초기화',
            action: () => send({}),
            onSuccess,
          },
    )
  }
</script>
```

`<template>` 는 원본을 옮기되 두 곳을 바꾼다. `<style scoped>` 는 원본 그대로.

1. `#no-data` 슬롯 전체를 아래로(조회 오류를 먼저 본다):

```vue
<template #no-data>
  <!-- 🔴 조회 실패면 "아직 없음" 이 아니라 오류와 다시 시도 — 실패 중에 만들기를 권하지 않는다 -->
  <div v-if="error" class="pa-4" role="alert">
    사용자 목록을 불러오지 못했습니다.
    <VBtn variant="text" @click="reload">다시 시도</VBtn>
  </div>
  <EmptyState
    v-else
    :can-create="canWrite"
    create-label="사용자 추가"
    :filtered="isFiltered"
    filtered-title="조건에 맞는 사용자가 없습니다"
    title="아직 사용자가 없습니다"
    @create="router.push('/users/new')"
  />
</template>
```

2. 헤더 제목 `'가입일'` 은 위 `headers` 에서 `'입사일'` 로 이미 바꿨다(템플릿의 `#item.joinAt` 은 그대로 `item.joinDate`).

- [ ] **Step 4: 사용자 폼 컴포넌트 · 추가 · 편집 페이지**

T `packages/frontend/src/components/users/UserEditForm.vue` — **S**`\src-aksv\src\pages\UserEditPage.vue` 에서 만든다. 전체:

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/UserEditPage.vue(실서버 확인 2026-10-16) — 사용자 추가 · 편집 폼
  // 바꾼 점: 페이지에서 컴포넌트로(pages/users.new.vue · users.[userNo].vue 가 감싼다) — 번호는 prop, 🔴 이탈 확인은 페이지
  //   setup 몫이라(useDirtyGuard 제약) isDirty 를 expose 한다. 호출은 api/users.ts · teams.ts · roles.ts, 재인증은 ADMIN_REAUTH,
  //   확인용 안내 문구 · revision 표시를 걷었다.
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    flattenTeamTree,
    indentTeamName,
    type AdminRole,
    type AdminTeamNode,
    type AdminUserCreate,
    type AdminUserCreateResult,
    type AdminUserUpdate,
  } from '@ssworks/admin-shared'
  import {
    ApiError,
    CardLayout,
    ReauthDialog,
    TemporaryPasswordDialog,
    useWriteFlow,
  } from '@ssworks/admin-ui'
  import { ADMIN_REAUTH, P } from '@project/shared'
  import { rolesApi } from '@/api/roles'
  import { teamsApi } from '@/api/teams'
  import { usersApi, type Reauth } from '@/api/users'
  import { usePermission } from '@/composables/usePermission'
  import { toast } from '@/plugins/toast'

  const props = defineProps<{
    /** 없으면 추가, 있으면 그 사용자 편집 */
    userNo?: bigint
  }>()

  interface Form {
    userId: string
    userName: string
    roleNo: bigint | null
    teamNo: bigint | null
    joinDate: string
  }

  const router = useRouter()
  const check = usePermission()
  const canWrite = computed(() => check.hasPermission(P.USERS_WRITE))
  const isNew = computed(() => props.userNo == null)

  const form = ref<Form>({ userId: '', userName: '', roleNo: null, teamNo: null, joinDate: '' })
  const loadedJoinDate = ref('')
  const revision = ref(0)
  const loading = ref(false)
  const conflicted = ref(false)
  const keyOf = (value: Form) =>
    `${value.userId}|${value.userName}|${value.roleNo ?? ''}|${value.teamNo ?? ''}|${value.joinDate}`
  const baseline = ref(keyOf(form.value))
  const isDirty = computed(() => keyOf(form.value) !== baseline.value)

  defineExpose({ isDirty })

  const ignore = (e: unknown) => {
    if (e instanceof ApiError) e.handled = true // 선택지가 비는 것뿐이다
  }
  const teams = ref<AdminTeamNode[]>([])
  teamsApi.tree().then((items) => (teams.value = items), ignore)
  const teamOptions = computed(() =>
    flattenTeamTree(teams.value).map((row) => ({
      title: indentTeamName(row.teamName, row.depth),
      value: row.teamNo,
    })),
  )
  const roles = ref<readonly AdminRole[]>([])
  rolesApi.list().then((items) => {
    roles.value = items
    // 추가는 기본 역할로 시작한다 — 시작값이라 변경으로 세지 않는다
    if (isNew.value && form.value.roleNo == null) {
      form.value.roleNo = items.find((role) => role.isDefault)?.roleNo ?? null
      baseline.value = keyOf(form.value)
    }
  }, ignore)
  const roleOptions = computed(() =>
    roles.value.map((role) => ({ title: role.roleName, value: role.roleNo })),
  )

  async function load() {
    if (props.userNo == null) return
    loading.value = true
    conflicted.value = false
    try {
      const item = await usersApi.get(props.userNo)
      form.value = {
        userId: item.userId,
        userName: item.userName,
        roleNo: item.roleNo,
        teamNo: item.teamNo,
        joinDate: item.joinDate,
      }
      loadedJoinDate.value = item.joinDate
      revision.value = item.revision
      baseline.value = keyOf(form.value)
    } catch {
      // 전역 토스트가 알린다
    } finally {
      loading.value = false
    }
  }
  void load()

  const { run, submitting, fieldErrors, reauthDialog } = useWriteFlow()
  const issued = ref<string | null>(null)
  const createdName = ref('')

  /** 수정은 바뀐 입사일만 보낸다 — 보내면 서버가 입사일 정정으로 다룬다 */
  function send(extra: Reauth): Promise<unknown> {
    const f = form.value
    const roleNo = f.roleNo
    // 저장 버튼이 역할 없이는 꺼져 있다 — 여기 오는 일은 없다
    if (roleNo == null) return Promise.reject(new Error('역할을 고르세요.'))
    if (props.userNo == null) {
      const body: AdminUserCreate = {
        userId: f.userId.trim(),
        userName: f.userName,
        roleNo,
        teamNo: f.teamNo,
        ...(f.joinDate ? { joinDate: f.joinDate } : {}),
      }
      return usersApi.create({ ...body, ...extra })
    }
    const body: AdminUserUpdate = {
      revision: revision.value,
      userName: f.userName,
      roleNo,
      teamNo: f.teamNo,
      ...(f.joinDate !== loadedJoinDate.value ? { joinDate: f.joinDate } : {}),
    }
    return usersApi.update(props.userNo, { ...body, ...extra })
  }

  function save() {
    conflicted.value = false
    const common = {
      // 폼이 그리는 키 — 검증 오류의 키가 전부 여기 있을 때만 칸 옆에 보이고 전역 토스트가 뜨지 않는다
      fields: ['userId', 'userName', 'roleNo', 'teamNo', 'joinDate'],
      onConflict: () => {
        conflicted.value = true
      },
      onSuccess: async (result: unknown) => {
        baseline.value = keyOf(form.value)
        if (isNew.value) {
          createdName.value = `${form.value.userName}(${form.value.userId})`
          issued.value = (result as AdminUserCreateResult).temporaryPassword
          return
        }
        toast.success('저장했습니다.')
        await router.push('/users')
      },
    }
    void run<unknown>(
      ADMIN_REAUTH
        ? {
            ...common,
            gate: 'reauth',
            message: '사용자 정보를 저장합니다.',
            action: ({ currentPassword }) => send({ currentPassword }),
          }
        : { ...common, action: () => send({}) },
    )
  }

  async function onIssuedClosed(value: string | null) {
    issued.value = value
    if (value != null) return
    toast.success('사용자를 추가했습니다.')
    await router.push('/users')
  }
</script>

<template>
  <div class="user-edit pa-4">
    <CardLayout>
      <VCardTitle>{{ isNew ? '사용자 추가' : '사용자 편집' }}</VCardTitle>
      <VProgressLinear v-if="loading" color="primary" indeterminate />
      <VCardText>
        <VAlert v-if="conflicted" class="mb-4" density="compact" type="warning" variant="tonal">
          다른 관리자가 먼저 고쳤습니다. 지금 고친 값은 칸에 남아 있습니다. 최신 값을 보려면 다시
          불러오세요.
          <template #append>
            <VBtn size="small" variant="text" @click="load">다시 불러오기</VBtn>
          </template>
        </VAlert>
        <form class="user-edit__form" @submit.prevent="save">
          <VTextField
            v-model="form.userId"
            autocomplete="off"
            :disabled="!isNew"
            :error-messages="fieldErrors.userId"
            label="아이디"
            name="userId"
          />
          <VTextField
            v-model="form.userName"
            autocomplete="off"
            :error-messages="fieldErrors.userName"
            label="이름"
            name="userName"
          />
          <VSelect
            v-model="form.roleNo"
            :error-messages="fieldErrors.roleNo"
            :items="roleOptions"
            label="역할"
            name="roleNo"
          />
          <VSelect
            v-model="form.teamNo"
            clearable
            :error-messages="fieldErrors.teamNo"
            :items="teamOptions"
            label="팀"
            name="teamNo"
          />
          <VTextField
            v-model="form.joinDate"
            :error-messages="fieldErrors.joinDate"
            :hint="isNew ? '비우면 오늘' : '바꾸면 입사일 정정'"
            label="입사일"
            name="joinDate"
            persistent-hint
            type="date"
          />
          <p v-if="isDirty" class="text-caption text-medium-emphasis">
            저장하지 않은 변경이 있습니다.
          </p>
          <div class="user-edit__actions">
            <VBtn to="/users" variant="text">목록으로</VBtn>
            <VBtn
              :disabled="!canWrite || submitting || !isDirty || form.roleNo == null"
              :loading="submitting"
              type="submit"
            >
              저장
            </VBtn>
          </div>
        </form>
      </VCardText>
    </CardLayout>

    <ReauthDialog v-bind="reauthDialog" />
    <TemporaryPasswordDialog
      :model-value="issued"
      mode="create"
      :target="createdName"
      @update:model-value="onIssuedClosed"
    />
  </div>
</template>

<style scoped>
  .user-edit {
    max-width: 640px;
  }

  .user-edit__form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .user-edit__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
```

T `packages/frontend/src/pages/users.new.vue`:

```vue
<script lang="ts" setup>
  // 사용자 추가 — 폼은 components/users/UserEditForm.vue. 🔴 이탈 확인(useDirtyGuard)은 페이지 setup 에서 부른다(킷 제약).
  import { useTemplateRef } from 'vue'
  import { useDirtyGuard } from '@ssworks/admin-ui'
  import { P } from '@project/shared'
  import UserEditForm from '@/components/users/UserEditForm.vue'

  definePage({ meta: { title: '사용자 추가', permissions: [P.USERS_WRITE] } })

  const form = useTemplateRef<InstanceType<typeof UserEditForm>>('form')
  useDirtyGuard(() => form.value?.isDirty === true)
</script>

<template>
  <UserEditForm ref="form" />
</template>
```

T `packages/frontend/src/pages/users.[userNo].vue`:

```vue
<script lang="ts" setup>
  // 사용자 편집 — 폼은 components/users/UserEditForm.vue. 🔴 이탈 확인(useDirtyGuard)은 페이지 setup 에서 부른다(킷 제약).
  import { computed, useTemplateRef } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDirtyGuard } from '@ssworks/admin-ui'
  import { P } from '@project/shared'
  import UserEditForm from '@/components/users/UserEditForm.vue'

  definePage({ meta: { title: '사용자 편집', permissions: [P.USERS_READ] } })

  const route = useRoute('/users.[userNo]')
  const userNo = computed(() =>
    /^\d+$/.test(route.params.userNo) ? BigInt(route.params.userNo) : null,
  )
  const form = useTemplateRef<InstanceType<typeof UserEditForm>>('form')
  useDirtyGuard(() => form.value?.isDirty === true)
</script>

<template>
  <!-- key — 같은 페이지 안에서 번호만 바뀌면 폼을 새로 만든다(옛 사용자 값이 남지 않게) -->
  <UserEditForm v-if="userNo != null" :key="String(userNo)" ref="form" :user-no="userNo" />
  <div v-else class="pa-4">
    <VAlert type="warning" variant="tonal">잘못된 주소입니다.</VAlert>
    <VBtn class="mt-4" to="/users" variant="text">사용자 목록으로</VBtn>
  </div>
</template>
```

- [ ] **Step 5: 팀 · 전체 세션**

T `packages/frontend/src/pages/teams.vue` — **S**`\src-aksv\src\pages\TeamsPage.vue` 에서 만든다. 전체(`<style scoped>` 는 원본 그대로 붙인다):

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/TeamsPage.vue(실서버 확인 2026-10-16) — 팀 트리 · 인원 목록 · 고른 팀
  // 바꾼 점: 호출은 api/teams.ts · api/users.ts. 확인용 시드 팀(시스템 · 외부 협력사)의 canAct · 표시, ↑↓ 숨김 스위치,
  //   다시 불러오기 버튼, 확인용 안내 문구를 걷었다. 루트 팀을 지키려면 useTeamTree 의 canAct 와 자기 라우트로 막는다
  //   (@ssworks/admin-server README "팀").
  import { computed, ref } from 'vue'
  import {
    ColumnLayout,
    ColumnPane,
    ConfirmDialog,
    TeamMoveDialog,
    TeamTree,
    TeamUserList,
    useTeamTree,
  } from '@ssworks/admin-ui'
  import { P } from '@project/shared'
  import { teamsApi } from '@/api/teams'
  import { usersApi } from '@/api/users'
  import { usePermission } from '@/composables/usePermission'
  import { toast } from '@/plugins/toast'

  definePage({
    meta: {
      title: '팀',
      permissions: [P.TEAMS_READ],
      menu: { group: 'org', icon: 'mdi-file-tree-outline', order: 1 },
    },
  })

  const check = usePermission()
  const canWrite = computed(() => check.hasPermission(P.TEAMS_WRITE))
  const draggable = ref(false)

  const teams = useTeamTree({
    load: teamsApi.tree,
    create: teamsApi.create,
    rename: teamsApi.rename,
    remove: teamsApi.remove,
    move: teamsApi.move,
    canWrite: () => check.hasPermission(P.TEAMS_WRITE),
    topLevel: true,
    onDone: (e) => toast.success(e.message),
  })

  const selectedUserNo = ref<bigint | null>(null)
  const selectedRow = computed(() => teams.selectedRow.value)
</script>

<template>
  <div class="teams">
    <div class="teams__toolbar">
      <span class="text-subtitle-1 font-weight-medium">팀</span>
      <VSwitch
        v-model="draggable"
        color="primary"
        density="compact"
        :disabled="!canWrite"
        hide-details
        label="드래그로 옮기기"
      />
      <VBtn
        :disabled="!canWrite || teams.submitting.value"
        size="small"
        variant="tonal"
        @click="teams.startCreate(null)"
      >
        최상위 팀 추가
      </VBtn>
    </div>
    <div class="teams__cols">
      <ColumnLayout gap="12px">
        <ColumnPane width="400px">
          <TeamTree v-bind="teams.tree.value" :draggable="draggable" />
        </ColumnPane>

        <ColumnPane width="300px">
          <TeamUserList
            v-model="selectedUserNo"
            :load="usersApi.members"
            :team-no="teams.selected.value"
          >
            <template #item="{ item }">
              <VListItemTitle>{{ item.userName }}</VListItemTitle>
              <VListItemSubtitle>{{ item.userId }} · {{ item.teamName }}</VListItemSubtitle>
            </template>
          </TeamUserList>
        </ColumnPane>

        <ColumnPane scrollable>
          <template #top>
            <div class="teams__head">
              <span class="text-subtitle-1 font-weight-medium">고른 팀</span>
            </div>
          </template>
          <div class="teams__info">
            <template v-if="selectedRow">
              <p>
                <strong>{{ selectedRow.teamName }}</strong>
              </p>
              <p>
                상위 팀: {{ selectedRow.parentTeamName ?? '최상위' }} · 하위 팀
                {{ selectedRow.descendantCount }}개
              </p>
            </template>
            <p v-else class="text-medium-emphasis">트리에서 팀을 고르면 여기에 보입니다.</p>
            <div v-if="selectedUserNo != null">
              <VBtn :to="`/users/${selectedUserNo}`" variant="tonal">고른 사람 편집</VBtn>
            </div>
          </div>
        </ColumnPane>
      </ColumnLayout>
    </div>

    <TeamMoveDialog v-bind="teams.moveDialog.value" />
    <ConfirmDialog v-bind="teams.confirmDialog.value" />
  </div>
</template>
```

T `packages/frontend/src/pages/sessions.vue` — **S**`\src-aksv\src\pages\SessionsPage.vue` 를 옮긴다. `<script setup>` 은 아래로, `<template>` · `<style scoped>` 는 원본 그대로.

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/SessionsPage.vue(실서버 확인 2026-10-16) — 관리자 전체 세션(서버 페이징)
  // 바꾼 점: 호출은 api/sessions.ts.
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import type { AdminSessionListItem } from '@ssworks/admin-shared'
  import { CardLayout, ConfirmDialog, SessionTable, useSessions } from '@ssworks/admin-ui'
  import { P } from '@project/shared'
  import { sessionsApi, type SessionFilter } from '@/api/sessions'
  import { usePermission } from '@/composables/usePermission'
  import { toast } from '@/plugins/toast'
  import { useAppStore } from '@/stores/app'

  definePage({
    meta: {
      title: '전체 세션',
      permissions: [P.SESSIONS_READ],
      menu: { group: 'org', icon: 'mdi-monitor-account', order: 2 },
    },
  })

  const store = useAppStore()
  const router = useRouter()
  const check = usePermission()

  const keyword = ref('')
  const applied = ref({ keyword: '' })

  const all = useSessions<AdminSessionListItem, SessionFilter>({
    fetch: sessionsApi.list,
    filters: () => ({ keyword: applied.value.keyword || undefined }),
    revoke: (row) => sessionsApi.revoke(row.sessionNo),
    revokeUser: (row) => sessionsApi.revokeUser(row.userNo),
    canWrite: () => check.hasPermission(P.SESSIONS_WRITE),
    onRevoked: ({ action, revokedCount }) =>
      toast.success(
        action === 'revokeUser' && revokedCount != null
          ? `세션 ${revokedCount}개를 끊었습니다.`
          : '세션을 끝냈습니다.',
      ),
    // 내 계정의 "사용자 전체" 끊기 — 지금 세션까지 끝난다
    onSelfSignedOut: async () => {
      store.clearSession()
      await router.replace('/login')
    },
  })

  const total = computed(() => all.total.value)

  function apply() {
    applied.value = { keyword: keyword.value.trim() }
  }
</script>
```

- [ ] **Step 6: 테스트 · 형식 · 린트 · 타입 · 빌드**

```bash
pnpm --filter @project/frontend test
pnpm format
pnpm lint:fix
pnpm lint
pnpm --filter @project/frontend typecheck
pnpm --filter @project/frontend build
```

Expected: 라우트 테스트 4개 PASS(메뉴 `[['/'], ['org', '/users', '/teams', '/sessions']]`). lint 0 오류, typecheck · build 초록.

알려진 함정:

- `vue-tsc` 가 템플릿 문자열 경로(``:to="`/users/${item.userNo}`"`` · `` `/users/${selectedUserNo}` ``)를 typed route 로 못 받으면 `:to="{ name: '/users.[userNo]', params: { userNo: String(item.userNo) } }"` 로 바꾼다.
- 메뉴의 최상위 순서가 기대와 다르면(파일 이름 정렬) 실제 순서를 찍어 보고, 홈 → 조직 → (설정) 순이 아니면 멈추고 보고한다 — 순서를 테스트에 맞춰 고치지 않는다.

- [ ] **Step 7: Commit**

```bash
git add -A packages/frontend
git commit -m "feat: 조직 페이지 — 사용자 목록 · 추가 · 편집(폼 컴포넌트) · 팀 트리 · 전체 세션(aksv 실서버 배선)

하위 페이지는 점 표기(users.new.vue · users.[userNo].vue)라 드로어 메뉴에 그대로 보인다. 어댑터 api/users · teams · roles.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: frontend — 설정 페이지(역할 · 약관)

**Files:**

- Create: T `packages/frontend/src/admin/permission-matrix.ts`, `src/admin/permission-matrix.test.ts`, `src/api/legal.ts`, `src/pages/settings.vue`, `src/pages/settings/roles.vue`, `src/pages/settings/legal.vue`
- Modify: T `packages/frontend/src/router/routes.test.ts`(`EXPECTED_MENU`)

**Interfaces:**

- Consumes: `rolesApi`(Task 6) · `IMPLIES` · `permissions` · `LEGAL_KINDS` · `LEGAL_KIND_LABELS` · `ADMIN_REAUTH`(Task 2).
- Produces: `PERMISSION_MATRIX: PermissionMatrixCategory[]`(`@/admin/permission-matrix`) — 스킬이 새 키마다 칸을 더한다. `legalApi`(`@/api/legal`) — `current(kind)` · `history(kind)` · `get(no)` · `publish(body)`. 설정 하위 페이지 본보기 `pages/settings/legal.vue`.

- [ ] **Step 1: 실패하는 테스트 둘**

T `packages/frontend/src/admin/permission-matrix.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assertMatrixCoversPermissions } from '@ssworks/admin-ui'
import { permissions } from '@project/shared'
import { PERMISSION_MATRIX } from './permission-matrix'

describe('역할 매트릭스', () => {
  it('카탈로그의 키를 모두 칸으로 덮는다 — 키를 더하고 칸을 안 더하면 여기서 실패한다', () => {
    expect(() =>
      assertMatrixCoversPermissions(PERMISSION_MATRIX, permissions.ALL_PERMISSION_VALUES),
    ).not.toThrow()
  })
})
```

T `packages/frontend/src/router/routes.test.ts` 의 상수:

```ts
const EXPECTED_MENU = [['/'], ['org', '/users', '/teams', '/sessions'], ['/settings']]
```

Run: `pnpm --filter @project/frontend test`
Expected: FAIL — `permission-matrix` 모듈을 못 찾고, 메뉴에 `/settings` 가 없다.

- [ ] **Step 2: 매트릭스 · 약관 어댑터**

T `packages/frontend/src/admin/permission-matrix.ts`:

```ts
import type { PermissionMatrixCategory } from '@ssworks/admin-ui'

/**
 * 역할 화면의 권한 격자 — 자원 행 × 액션 열. 칸의 키는 `${resource}:${action}` 이다.
 * 🔴 카탈로그(@project/shared permissions)에 키를 더하면 여기에도 칸을 더한다 — permission-matrix.test.ts 가 빠진 키를
 *    잡는다. 카탈로그에 없는 칸(예: settings.legal:write)은 비활성으로 보인다.
 */
export const PERMISSION_MATRIX: PermissionMatrixCategory[] = [
  {
    id: 'org',
    label: '조직',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'write', label: '편집' },
    ],
    rows: [
      { resource: 'org.users', label: '사용자' },
      { resource: 'org.roles', label: '역할' },
      { resource: 'org.teams', label: '팀' },
    ],
  },
  {
    id: 'ops',
    label: '운영',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'write', label: '끊기' },
    ],
    rows: [{ resource: 'sessions', label: '세션' }],
  },
  {
    id: 'settings',
    label: '설정',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'publish', label: '발행' },
    ],
    rows: [
      { resource: 'settings.legal', label: '약관' },
      { resource: 'settings.auditLog', label: '감사 기록' },
    ],
  },
]
```

T `packages/frontend/src/api/legal.ts`:

```ts
import type {
  AdminLegalCurrent,
  AdminLegalDocument,
  AdminLegalHistory,
  AdminLegalPublish,
} from '@ssworks/admin-shared'
import { api } from './client'

/** useLegalDocuments 어댑터 — 미발행은 404 가 아니라 { item: null } 이다 */
export const legalApi = {
  current: (kind: string) =>
    api
      .get<AdminLegalCurrent>('/legal-documents/current', { params: { kind } })
      .then((r) => r.item),
  history: (kind: string) =>
    api.get<AdminLegalHistory>('/legal-documents', { params: { kind } }).then((r) => r.items),
  get: (legalDocNo: bigint) => api.get<AdminLegalDocument>(`/legal-documents/${legalDocNo}`),
  /** 기준 판(baseLegalDocNo)이 시행본이 아니면 409 — 화면이 충돌 안내를 띄운다 */
  publish: (body: AdminLegalPublish) => api.post('/legal-documents', body),
}
```

- [ ] **Step 3: 설정 셸 · 역할 · 약관 페이지**

T `packages/frontend/src/pages/settings.vue`:

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/SettingsPage.vue(실서버 확인 2026-10-16) — 설정 셸. 좌측 메뉴는 자식 페이지의 meta.menu 에서 나온다.
  // 🔴 anyPermissions 는 자식 권한의 합집합 이상이다 — 자식을 더하면 여기에도 더한다(routes.test.ts 가 잰다).
  // 🔴 SettingsShell 은 부모가 정한 높이(definite height)를 받아야 한다.
  import { SettingsShell } from '@ssworks/admin-ui'
  import { P } from '@project/shared'

  definePage({
    meta: {
      title: '설정',
      anyPermissions: [P.ROLES_READ, P.LEGAL_READ],
      menu: { icon: 'mdi-cog-outline' },
    },
  })
</script>

<template>
  <div class="settings">
    <SettingsShell />
  </div>
</template>

<style scoped>
  .settings {
    height: calc(100dvh - 64px);
  }
</style>
```

T `packages/frontend/src/pages/settings/roles.vue` — **S**`\src-aksv\src\pages\settings\RolesPage.vue` 를 옮긴다. `<script setup>` 전체:

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/settings/RolesPage.vue(실서버 확인 2026-10-16) — 역할 목록 · 권한 매트릭스 · 순서
  // 바꾼 점: 매트릭스는 admin/permission-matrix.ts(테스트가 카탈로그를 덮는지 잰다), 호출은 api/roles.ts, 재인증은
  //   ADMIN_REAUTH(서버 reauth 와 한 벌), 목록 부제의 순서 · revision(확인용)을 걷었다.
  import { useRouter } from 'vue-router'
  import type { AdminRole } from '@ssworks/admin-shared'
  import {
    ColumnPane,
    ConfirmDialog,
    PermissionMatrix,
    ReauthDialog,
    useDirtyGuard,
    useRoleEditor,
  } from '@ssworks/admin-ui'
  import { ADMIN_REAUTH, IMPLIES, P, permissions, type Permission } from '@project/shared'
  import { PERMISSION_MATRIX } from '@/admin/permission-matrix'
  import { rolesApi } from '@/api/roles'
  import { usePermission } from '@/composables/usePermission'
  import { toast } from '@/plugins/toast'
  import { useAppStore } from '@/stores/app'

  definePage({
    meta: {
      title: '역할',
      permissions: [P.ROLES_READ],
      menu: { icon: 'mdi-account-key-outline', order: 0 },
    },
  })

  const store = useAppStore()
  const router = useRouter()
  const check = usePermission()

  const {
    roles,
    loading,
    loadError,
    selected,
    select,
    startCreate,
    form,
    matrix,
    canToggleAll,
    permissionsLocked,
    isSelfRole,
    isDirty,
    conflicted,
    canSave,
    canRemove,
    save,
    remove,
    move,
    canMove,
    submitting,
    fieldErrors,
    confirmDialog,
    reauthDialog,
  } = useRoleEditor<Permission>({
    api: rolesApi,
    permissions: permissions.ALL_PERMISSION_VALUES,
    canWrite: () => check.hasPermission(P.ROLES_WRITE),
    implies: IMPLIES, // 🔴 서버 정규화와 같은 표
    reauth: ADMIN_REAUTH,
    fields: ['roleName', 'isDefault'],
    onSelfRoleSaved: async () => {
      await store.refresh()
      if (!check.hasPermission(P.ROLES_READ)) await router.replace('/403')
    },
  })

  useDirtyGuard(() => isDirty.value)

  /** 목록 부제 — 기본 역할 · 전체 권한 표시 */
  function roleNote(role: AdminRole): string {
    return [role.isDefault ? '기본' : '', role.permissions.includes('*') ? '전체 권한' : '']
      .filter(Boolean)
      .join(' · ')
  }

  async function onSave() {
    const creating = selected.value == null
    if (await save()) toast.success(creating ? '역할을 만들었습니다.' : '역할을 저장했습니다.')
  }

  async function onRemove() {
    if (await remove()) toast.success('역할을 지웠습니다.')
  }

  async function onMove(role: AdminRole, direction: 'up' | 'down') {
    if (await move(role, direction)) toast.success(`「${role.roleName}」의 순서를 바꿨습니다.`)
  }
</script>
```

`<template>` 는 원본을 옮기되 세 곳을 바꾼다. `<style scoped>` 는 원본 그대로.

1. `<p v-if="reauth" class="roles__note">역할 재인증 켜짐 — 저장 · 삭제에 비밀번호를 묻는다</p>` → `<p v-if="ADMIN_REAUTH" class="roles__note">저장 · 삭제할 때 비밀번호를 묻습니다.</p>`
2. `<VListItemSubtitle>` 블록 전체 → `<VListItemSubtitle v-if="roleNote(role)">{{ roleNote(role) }}</VListItemSubtitle>`
3. `<PermissionMatrix v-bind="matrix" :categories="categories" />` → `<PermissionMatrix v-bind="matrix" :categories="PERMISSION_MATRIX" />`

T `packages/frontend/src/pages/settings/legal.vue` — **S**`\src-aksv\src\pages\settings\LegalPage.vue` 를 옮긴다. `<script setup>` 은 아래로. `<template>` 은 원본을 옮기되 머리 문구 `약관 · 개인정보처리방침` 을 `약관` 으로.

```vue
<script lang="ts" setup>
  // 정본: aksv src/pages/settings/LegalPage.vue(실서버 확인 2026-10-16) — 약관 편집 · 발행 · 이력(설정 셸 자식이라 ColumnPane)
  // 바꾼 점: 종류 탭은 @project/shared 의 LEGAL_KINDS · LEGAL_KIND_LABELS(서버 legal.kinds 와 한 상수), 호출은 api/legal.ts.
  import {
    ColumnPane,
    LegalDocumentEditor,
    useDirtyGuard,
    useLegalDocuments,
  } from '@ssworks/admin-ui'
  import { LEGAL_KIND_LABELS, LEGAL_KINDS, P } from '@project/shared'
  import { legalApi } from '@/api/legal'
  import { usePermission } from '@/composables/usePermission'
  import { toast } from '@/plugins/toast'

  definePage({
    meta: {
      title: '약관',
      permissions: [P.LEGAL_READ],
      menu: { icon: 'mdi-file-document-outline', order: 1 },
    },
  })

  const check = usePermission()

  const legal = useLegalDocuments({
    kinds: LEGAL_KINDS.map((value) => ({ value, label: LEGAL_KIND_LABELS[value] })),
    loadCurrent: legalApi.current,
    loadHistory: legalApi.history,
    loadOne: legalApi.get,
    publish: legalApi.publish,
    canWrite: () => check.hasPermission(P.LEGAL_PUBLISH),
    onDone: (e) => toast.success(e.message),
  })
  useDirtyGuard(() => legal.isDirty.value)
</script>
```

- [ ] **Step 4: 테스트 · 형식 · 린트 · 타입 · 빌드**

```bash
pnpm --filter @project/frontend test
pnpm format
pnpm lint:fix
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected: frontend 테스트 5개(라우트 4 + 매트릭스 1) PASS, 루트 `pnpm test` 는 shared 6 + frontend 5. lint 0 오류, typecheck · build 초록(루트 전체).

- [ ] **Step 5: 화면 한 바퀴(개발 서버 — 짧게)**

백그라운드 둘(backend `node dist/main.js`, frontend `pnpm dev`). claude-in-chrome 으로 `http://localhost:3000/` → `/login` → `admin` / `Tpl-admin-2026!` 로그인 → 드로어에 홈 · 조직(사용자 · 팀 · 전체 세션) · 설정이 보이고 설정 아래 자식이 드로어에 **없다** → 설정 클릭 → `/settings/roles` 로 간다(셸의 첫 자식) → 좌측에 역할 · 약관. 콘솔 오류 0(`read_console_messages`). 깊은 확인은 Task 10. 서버 둘을 멈춘다.

- [ ] **Step 6: Commit**

```bash
git add -A packages/frontend
git commit -m "feat: 설정 페이지 — 설정 셸 · 역할(권한 매트릭스) · 약관(aksv 실서버 배선)

매트릭스는 admin/permission-matrix.ts 하나 — 테스트가 카탈로그 키를 모두 덮는지 잰다. 약관 탭은 LEGAL_KINDS 에서.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: admin-scaffold 스킬

**Files:**

- Create: T `.claude/skills/admin-scaffold/SKILL.md`

**Interfaces:**

- Consumes: Task 2~7 이 만든 파일 이름 · export 이름(아래 본문이 그대로 가리킨다).
- Produces: 프로젝트 스킬 `admin-scaffold`. Task 11 이 서브에이전트로 시험한다.

- [ ] **Step 1: 스킬 본문**

T `.claude/skills/admin-scaffold/SKILL.md` 전체(`@project/` 는 init.mjs 가 새 scope 로 바꾼다 — `.md` 는 치환 대상이다):

````markdown
---
name: admin-scaffold
description: 관리자 화면 하나(메뉴 · 라우트 · 권한 키 · 백엔드 라우트)를 더할 때 쓴다 — "공지 관리 페이지 추가", "OO 목록 화면 만들어줘", "설정에 OO 탭", "관리자에서 OO 를 고칠 수 있게" 같은 요청. shared 카탈로그 → (선택) 테이블 · 마이그레이션 → backend 모듈 → frontend 어댑터 · 페이지 → 검사를 한 줄로 만든다.
---

# admin-scaffold — 관리자 페이지 하나 더하기

이 프로젝트는 `@ssworks/admin-*` 킷 위의 관리자 앱이다. 페이지 하나 = **권한 키 + (테이블) + 백엔드 라우트 + 화면 + 메뉴**가 한 줄로 맞아야 한다. 하나라도 어긋나면 메뉴는 보이는데 403 이 되거나, 서버가 기동에서 멈추거나, 테스트가 빨갛다. 이 스킬은 그 순서와 규칙이다.

🔴 **코드의 본보기는 이 저장소의 파일이다** — 아래 골격보다 그 파일이 우선한다. 골격은 저장소에 본보기가 없는 백엔드 프로젝트 모듈에만 둔다.

## 먼저 읽는다

| 무엇               | 파일                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 카탈로그           | `packages/shared/src/admin/permissions.ts` · `audit.ts` · `errors.ts` · 그 테스트 `catalog.test.ts`                                     |
| 목록 화면          | `packages/frontend/src/pages/users.vue`(작은 본보기는 `pages/sessions.vue`)                                                             |
| 추가 · 편집 폼     | `packages/frontend/src/components/users/UserEditForm.vue` + `pages/users.new.vue` · `pages/users.[userNo].vue`                          |
| 어댑터             | `packages/frontend/src/api/users.ts`                                                                                                    |
| 설정 하위 화면     | `packages/frontend/src/pages/settings/legal.vue` + 부모 `pages/settings.vue`                                                            |
| 역할 매트릭스      | `packages/frontend/src/admin/permission-matrix.ts`                                                                                      |
| 페이지 · 모듈 규칙 | `packages/frontend/src/pages/README.md` · `packages/backend/src/modules/README.md` · `packages/backend/src/core/database/migrations.md` |
| 킷 계약            | `node_modules/@ssworks/admin-ui/README.md` · `node_modules/@ssworks/admin-server/README.md`(frontend · backend 패키지 아래)             |

## 입력 — 요청에서 읽고, 없으면 묻는다

1. 자원 이름(영문 복수 — `notices`)과 화면 제목(`공지`)
2. 권한 키 — 기본은 `<영역>.<자원>:read` · `:write`(예 `board.notices:read` · `board.notices:write`)와 함의 write → read
3. 자리 — 드로어 메뉴(그룹 · 아이콘 · 순서) / 설정 하위 / 메뉴 없음
4. 쓰기 — 목록만 / 만들기 · 수정 · 삭제
5. 테이블 — 새 테이블이 필요한가, 컬럼은 무엇인가

정하지 못한 것이 있으면 사람에게 묻고(추천안을 먼저), 정한 것을 한 단락으로 적은 뒤 시작한다. 아래 예는 "공지(`notices`) — 목록 · 작성 · 수정 · 삭제, 테이블 `notices`(제목 · 본문 · 상단 고정), 메뉴 그룹 `org`" 다.

## 절차

### 1. shared — 카탈로그 · 스키마

`packages/shared/src/admin/permissions.ts`:

```ts
// IMPLIES 에
'board.notices:write': ['board.notices:read'],
// definePermissions 첫 인자에
NOTICES_READ: 'board.notices:read',
NOTICES_WRITE: 'board.notices:write',
```

`packages/shared/src/admin/catalog.test.ts` 의 `EXPECTED_KEYS` 에 두 키를 더한다(키 목록을 고정하는 테스트다).

쓰기가 있으면 `packages/shared/src/admin/audit.ts`:

```ts
export const auditCatalog = defineAuditCatalog({
  actions: {
    NOTICE_CREATE: 'board.notice.create',
    NOTICE_UPDATE: 'board.notice.update',
    NOTICE_DELETE: 'board.notice.delete',
  },
  targets: { NOTICE: 'notice' },
  labels: {
    'board.notice.create': '공지 작성',
    'board.notice.update': '공지 수정',
    'board.notice.delete': '공지 삭제',
  },
  targetLabels: { notice: '공지' },
})
```

`packages/shared/src/schemas/notices.schema.ts`:

```ts
import { createQuerySchema } from '@ssworks/admin-shared'
import { z } from 'zod'

/** 응답 행 — 날짜는 ISO 문자열, 번호는 bigint(킷 코덱) */
export const noticeSchema = z.object({
  noticeNo: z.bigint(),
  title: z.string(),
  body: z.string(),
  isPinned: z.boolean(),
  revision: z.number().int(),
  createAt: z.iso.datetime(),
  updateAt: z.iso.datetime(),
})

export const noticeListQuerySchema = createQuerySchema({
  sortableColumns: ['createAt', 'title'] as const,
  defaultSortColumn: 'createAt',
  filterShape: { keyword: z.string().trim().min(1).max(100) },
})

export const noticeCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000),
  isPinned: z.boolean(),
})

/** 🔴 수정 · 삭제는 revision 이 필수다 — 다르면 409(낡은 화면의 덮어쓰기를 막는다) */
export const noticeUpdateSchema = noticeCreateSchema
  .partial()
  .extend({ revision: z.number().int().nonnegative() })
export const noticeRemoveSchema = z.object({ revision: z.number().int().nonnegative() })

export type Notice = z.infer<typeof noticeSchema>
export type NoticeListQuery = z.infer<typeof noticeListQuerySchema>
export type NoticeCreate = z.infer<typeof noticeCreateSchema>
export type NoticeUpdate = z.infer<typeof noticeUpdateSchema>
export type NoticeRemove = z.infer<typeof noticeRemoveSchema>
export interface NoticeFilter {
  keyword?: string
}
```

`packages/shared/src/schemas/index.ts` 에 `export * from './notices.schema.js';`(파일에 `export {};` 만 있으면 그 줄을 바꾼다). 그리고:

```bash
pnpm --filter @project/shared build
pnpm --filter @project/shared test
```

### 2. DB — 테이블이 필요할 때만

`packages/backend/src/core/database/tables/notices.table.ts`:

```ts
import type { ColumnType, Generated } from 'kysely'

export interface NoticesTable {
  noticeNo: Generated<bigint>
  title: string
  body: string
  isPinned: Generated<boolean>
  revision: Generated<number>
  createAt: ColumnType<Date, never, never>
  updateAt: ColumnType<Date, never, Date>
}
```

`packages/backend/src/core/database/database.types.ts` 의 `Database` 에 `notices: NoticesTable;` 를 더한다(빈 인터페이스용 eslint-disable 주석은 지운다).

```bash
pnpm --filter @project/backend migrate:make notices
```

만들어진 `src/core/database/migrations/<타임스탬프>_notices.ts` 를 아래 꼴로 쓴다 — `Kysely<unknown>`, 이름은 코드에서 camelCase(DB 에는 snake_case 로 간다):

```ts
import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('notices')
    .addColumn('noticeNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('title', 'varchar(200)', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('isPinned', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('revision', 'integer', (col) => col.unsigned().notNull().defaultTo(0))
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updateAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    .execute()
  await db.schema.createIndex('idxNoticesCreateAt').on('notices').column('createAt').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notices').execute()
}
```

- 🔴 코어 테이블(users 등)에 컬럼을 더하는 장이면 NOT NULL 컬럼에 DEFAULT 를 둔다 — 패키지 INSERT 는 그 컬럼을 모른다.
- 🔴 코어 스텁 `001`~`012` 는 건드리지 않는다.

### 3. backend — 모듈

`packages/backend/src/modules/notices/notices.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { sql, type Kysely } from 'kysely'
import { KYSELY, likeContains, runQuery, runWriteTransaction } from '@ssworks/admin-server'
import { BusinessError, CommonErrorCodes, toListQuery } from '@ssworks/admin-shared'
import type { NoticeCreate, NoticeListQuery, NoticeUpdate } from '@project/shared'
import type { Database } from '../../core/database/database.types.js'

const COLUMNS = [
  'noticeNo',
  'title',
  'body',
  'isPinned',
  'revision',
  'createAt',
  'updateAt',
] as const
const notFound = () =>
  new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, '공지를 찾을 수 없습니다.')

@Injectable()
export class NoticesService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  list(query: NoticeListQuery) {
    const { offset, limit, sort } = toListQuery(query)
    const keyword = query.filter?.keyword
    return runQuery(async () => {
      let base = this.db.selectFrom('notices')
      // 🔴 LIKE 이스케이프는 '!' — escape 절은 SQL 정적 텍스트로 쓴다(@ssworks/admin-server like.ts)
      if (keyword)
        base = base.where(
          sql<boolean>`${sql.ref('title')} like ${likeContains(keyword)} escape '!'`,
        )
      const { total } = await base
        .select((eb) => eb.fn.countAll().as('total'))
        .executeTakeFirstOrThrow()
      let rows = base.select(COLUMNS).offset(offset).limit(limit)
      for (const { column, order } of sort) rows = rows.orderBy(column, order)
      return {
        items: await rows.execute(),
        total: BigInt(total),
        page: query.page,
        itemsPerPage: query.itemsPerPage,
      }
    })
  }

  get(noticeNo: bigint) {
    return runQuery(async () => {
      const item = await this.db
        .selectFrom('notices')
        .select(COLUMNS)
        .where('noticeNo', '=', noticeNo)
        .executeTakeFirst()
      if (!item) throw notFound()
      return item
    })
  }

  create(body: NoticeCreate) {
    return runWriteTransaction(this.db, async (trx) => {
      const { insertId } = await trx.insertInto('notices').values(body).executeTakeFirstOrThrow()
      if (insertId === undefined) throw new Error('새 공지 번호를 받지 못했다')
      return trx
        .selectFrom('notices')
        .select(COLUMNS)
        .where('noticeNo', '=', insertId)
        .executeTakeFirstOrThrow()
    })
  }

  update(noticeNo: bigint, { revision, ...changes }: NoticeUpdate) {
    return runWriteTransaction(this.db, async (trx) => {
      const before = await this.lockForWrite(trx, noticeNo, revision)
      await trx
        .updateTable('notices')
        .set({ ...changes, revision: revision + 1, updateAt: sql`CURRENT_TIMESTAMP` })
        .where('noticeNo', '=', noticeNo)
        .execute()
      const after = await trx
        .selectFrom('notices')
        .select(COLUMNS)
        .where('noticeNo', '=', noticeNo)
        .executeTakeFirstOrThrow()
      return { before, after }
    })
  }

  remove(noticeNo: bigint, revision: number) {
    return runWriteTransaction(this.db, async (trx) => {
      const before = await this.lockForWrite(trx, noticeNo, revision)
      await trx.deleteFrom('notices').where('noticeNo', '=', noticeNo).execute()
      return before
    })
  }

  /** 🔴 쓰기 트랜잭션의 첫 읽기는 FOR UPDATE — 그 뒤 revision 을 견준다 */
  private async lockForWrite(trx: Kysely<Database>, noticeNo: bigint, revision: number) {
    const row = await trx
      .selectFrom('notices')
      .select(COLUMNS)
      .where('noticeNo', '=', noticeNo)
      .forUpdate()
      .executeTakeFirst()
    if (!row) throw notFound()
    if (row.revision !== revision) {
      throw new BusinessError(
        CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
        '다른 관리자가 먼저 고쳤습니다. 다시 불러온 뒤 고쳐 주세요.',
      )
    }
    return row
  }
}
```

`packages/backend/src/modules/notices/notices.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import {
  Audit,
  ParseBigIntPipe,
  ZodValidationPipe,
  attachAuditDiff,
  attachAuditTarget,
} from '@ssworks/admin-server'
import {
  P,
  noticeCreateSchema,
  noticeListQuerySchema,
  noticeRemoveSchema,
  noticeUpdateSchema,
  type NoticeCreate,
  type NoticeListQuery,
  type NoticeRemove,
  type NoticeUpdate,
} from '@project/shared'
import { Require } from '../../core/auth/require.js'
import { NoticesService } from './notices.service.js'

/** 감사 meta 에 남길 필드 — 🔴 본문 같은 큰 필드는 넣지 않는다(64 KiB 를 넘으면 잘린다) */
const DIFF_KEYS = ['title', 'isPinned']

// 🔴 경로는 admin/ 아래 — 화면은 api.get('/notices')(baseURL /api/admin). 핸들러마다 권한을 선언한다(없으면 403).
@Controller('admin/notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  @Require(P.NOTICES_READ)
  list(@Query(new ZodValidationPipe(noticeListQuerySchema)) query: NoticeListQuery) {
    return this.notices.list(query)
  }

  @Get(':noticeNo')
  @Require(P.NOTICES_READ)
  async get(@Param('noticeNo', ParseBigIntPipe) noticeNo: bigint) {
    return { item: await this.notices.get(noticeNo) }
  }

  @Post()
  @Require(P.NOTICES_WRITE)
  @Audit({ action: 'board.notice.create', targetType: 'notice' })
  async create(
    @Body(new ZodValidationPipe(noticeCreateSchema)) body: NoticeCreate,
    @Req() req: Request,
  ) {
    const item = await this.notices.create(body)
    attachAuditTarget(req, item.noticeNo)
    attachAuditDiff(req, null, item, DIFF_KEYS)
    return { item }
  }

  @Patch(':noticeNo')
  @Require(P.NOTICES_WRITE)
  @Audit({ action: 'board.notice.update', targetType: 'notice' })
  async update(
    @Param('noticeNo', ParseBigIntPipe) noticeNo: bigint,
    @Body(new ZodValidationPipe(noticeUpdateSchema)) body: NoticeUpdate,
    @Req() req: Request,
  ) {
    const { before, after } = await this.notices.update(noticeNo, body)
    attachAuditDiff(req, before, after, DIFF_KEYS)
    return { item: after }
  }

  @Delete(':noticeNo')
  @Require(P.NOTICES_WRITE)
  @Audit({ action: 'board.notice.delete', targetType: 'notice' })
  async remove(
    @Param('noticeNo', ParseBigIntPipe) noticeNo: bigint,
    @Body(new ZodValidationPipe(noticeRemoveSchema)) body: NoticeRemove,
    @Req() req: Request,
  ) {
    const before = await this.notices.remove(noticeNo, body.revision)
    attachAuditDiff(req, before, null, DIFF_KEYS)
    return {}
  }
}
```

`packages/backend/src/modules/notices/notices.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { NoticesController } from './notices.controller.js'
import { NoticesService } from './notices.service.js'

@Module({ controllers: [NoticesController], providers: [NoticesService] })
export class NoticesModule {}
```

`packages/backend/src/app.module.ts` 의 `// ── 프로젝트 모듈 ──` 아래에 `NoticesModule` 을 더하고 import 한다.

### 4. frontend — 어댑터 · 페이지 · 메뉴

`packages/frontend/src/api/notices.ts`:

```ts
import type { Paginated } from '@ssworks/admin-shared'
import type { ServerTableParams } from '@ssworks/admin-ui'
import type {
  Notice,
  NoticeCreate,
  NoticeFilter,
  NoticeRemove,
  NoticeUpdate,
} from '@project/shared'
import { api } from './client'

// 🔴 경로에 '/admin' 을 붙이지 않는다 — baseURL 이 /api/admin 이다
export const noticesApi = {
  list: (params: ServerTableParams<NoticeFilter>) =>
    api.get<Paginated<Notice>>('/notices', { params }),
  get: (noticeNo: bigint) => api.get<{ item: Notice }>(`/notices/${noticeNo}`).then((r) => r.item),
  create: (body: NoticeCreate) => api.post<{ item: Notice }>('/notices', body),
  update: (noticeNo: bigint, body: NoticeUpdate) =>
    api.patch<{ item: Notice }>(`/notices/${noticeNo}`, body),
  remove: (noticeNo: bigint, body: NoticeRemove) => api.del(`/notices/${noticeNo}`, body),
}
```

페이지 — 하위 페이지는 **점 표기**(폴더 금지 — 드로어 메뉴에서 빠진다):

| 파일                                    | 본보기                                                                                              | meta                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pages/notices.vue`                     | `pages/users.vue`(목록 · `useServerTable` · `#no-data` 오류 먼저 · 삭제는 `useWriteFlow` 확인 관문) | `title: '공지'`, `permissions: [P.NOTICES_READ]`, `menu: { group: 'org', icon: 'mdi-bullhorn-outline', order: 3 }` |
| `components/notices/NoticeEditForm.vue` | `components/users/UserEditForm.vue`(폼 · revision · 충돌 안내 · `defineExpose({ isDirty })`)        | —                                                                                                                  |
| `pages/notices.new.vue`                 | `pages/users.new.vue`(폼을 감싸고 `useDirtyGuard`)                                                  | `title: '공지 작성'`, `permissions: [P.NOTICES_WRITE]`                                                             |
| `pages/notices.[noticeNo].vue`          | `pages/users.[userNo].vue`                                                                          | `title: '공지 편집'`, `permissions: [P.NOTICES_READ]`                                                              |

- 버튼(작성 · 저장 · 삭제)은 `usePermission().hasPermission(P.NOTICES_WRITE)` 로 가린다.
- 🔴 `useDirtyGuard` 는 **페이지** setup 에서 부른다(컴포넌트 안에서 부르지 않는다).
- 설정 하위 화면이면 `pages/settings/<x>.vue`(`pages/settings/legal.vue` 처럼 `ColumnPane` 을 내고 `menu: { icon, order }`) + 부모 `pages/settings.vue` 의 `anyPermissions` 에 그 READ 키를 더한다.
- 재인증(`ADMIN_REAUTH`)이 켜진 프로젝트면 쓰기를 `gate: 'reauth'` 로 묻는다 — `pages/users.vue` 의 `resign()` 이 두 갈래를 다 보여 준다.

메뉴 · 매트릭스 · 테스트:

- `packages/frontend/src/router/routes.test.ts` 의 `EXPECTED_MENU` 에 새 메뉴 id 를 그 자리에 더한다(예: `['org', '/users', '/teams', '/sessions', '/notices']`). 새 그룹이면 `src/admin/menu.ts` 의 `MENU_GROUPS` 에도.
- `packages/frontend/src/admin/permission-matrix.ts` 에 행(또는 열)을 더한다 — 예: `{ id: 'board', label: '게시판', columns: [읽기 · 편집], rows: [{ resource: 'board.notices', label: '공지' }] }`. 빠지면 `permission-matrix.test.ts` 가 실패한다.

### 5. 역할 — 사람이 할 일을 알린다

- 새 키는 기존 역할에 없다 — 전체 권한(`'*'`) 관리자만 새 화면을 본다. 역할 화면(설정 → 역할)에서 필요한 역할에 준다.
- 함의를 더하거나 키를 지웠다면 전체 권한 관리자가 그 키를 가진 역할을 한 번 다시 저장해야 한다(`@ssworks/admin-server` README "사용자 · 계정").

### 6. 검사

```bash
pnpm --filter @project/shared build
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

DB 를 쓸 수 있으면(`packages/backend/.env` 가 있으면):

```bash
pnpm --filter @project/backend migrate
pnpm --filter @project/backend build
# 백그라운드로 node packages/backend/dist/main.js 를 띄운 뒤
curl -s -o notices-anon.json -w "%{http_code}\n" http://127.0.0.1:4000/api/admin/notices
```

Expected: 모두 초록, 기동 로그에 오류 없음(감사 카탈로그 밖 액션 · 빠진 슬롯이면 기동에서 멈춘다), 미인증 요청 `401`. 결과 파일(`notices-anon.json`)은 지운다.

### 7. 보고

- 만든 · 고친 파일 목록(shared · backend · frontend)
- 권한 키 · 함의 · 감사 액션
- 경로: 화면 `/notices` · API `/api/admin/notices`
- 메뉴 자리
- 사람이 할 일: 역할에 새 키 주기, (테이블을 만들었으면) 운영 DB 에 `migrate`

## 주의점

- 🔴 **경로 규약 (가)**: 화면 경로에 `/admin` 을 붙이지 않는다(baseURL `/api/admin`). 백엔드 관리자 컨트롤러에는 꼭 `admin/` 을 붙인다. 섞으면 404.
- 🔴 **가드는 앱 전역이다**: 관리자 라우트는 `Require` · `RequireAny` · `@SelfOnly()` 중 하나, 관리자 밖 컨트롤러(공개 API · 웹훅)는 클래스에 `@Public()`.
- 🔴 **페이지 접근 선언은 정확히 하나**: `isPublic` · `selfOnly` · `permissions` · `anyPermissions` — `routes.test.ts` 가 잰다.
- 서비스는 `BusinessError` 만 던진다(`runQuery` · `runWriteTransaction` 안의 Nest 예외는 가려진 500). 프로젝트 오류 코드는 `packages/shared/src/admin/errors.ts` 의 `projectErrors` 에 상태와 함께.
- argon2(비밀번호 해시 · 재인증)는 트랜잭션 밖에서만 부른다.
- 날짜는 `'YYYY-MM-DD'`(사용자 날짜) 또는 ISO 문자열(응답 시각). 번호는 bigint — 화면은 `String(no)` 로 그린다.
- 로그는 Nest `Logger` — `console.log` 를 쓰지 않는다.
- Windows 에서 셸 출력을 `/dev/null` 로 버리지 않는다(`NUL` 파일이 생긴다).
````

- [ ] **Step 2: 스킬이 가리키는 파일이 모두 있는지**

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
node -e "
const fs = require('node:fs');
const text = fs.readFileSync('.claude/skills/admin-scaffold/SKILL.md', 'utf8');
const paths = [...new Set([...text.matchAll(/\`(packages\/[^\`\s]+?\.(?:ts|vue|md))\`/g)].map((m) => m[1]))];
const missing = paths.filter((p) => !fs.existsSync(p) && !/notices/.test(p));
console.log(paths.length + ' paths, missing: ' + JSON.stringify(missing));
process.exitCode = missing.length ? 1 : 0;
"
```

Expected: `missing: []`(예시 자원 `notices` 파일은 아직 없는 것이 맞아 뺀다). 프런트매터가 `---` 두 줄 사이에 `name` · `description` 둘을 가진다.

템플릿 모양으로 다듬는다(Global Constraints — 플랜의 코드 블록은 킷 prettier 모양이다):

```bash
pnpm exec prettier --write .claude/skills/admin-scaffold/SKILL.md
pnpm exec prettier --write .claude/skills/admin-scaffold/SKILL.md
pnpm exec prettier --check .claude/skills/admin-scaffold/SKILL.md
```

Expected: `--check` 초록, 스킬 안의 `ts` 코드 블록에 세미콜론이 있다.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/admin-scaffold/SKILL.md
git commit -m "feat: admin-scaffold 스킬 — 관리자 페이지 하나(권한 키 · 테이블 · 모듈 · 화면 · 메뉴)를 한 줄로

스킬은 절차다 — 화면 본보기는 템플릿의 실제 파일을 가리키고, 백엔드 프로젝트 모듈만 골격을 둔다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 템플릿 문서 — CLAUDE.md · README.md

**Files:**

- Modify: T `CLAUDE.md`
- Create: T `README.md`

**Interfaces:**

- Consumes: Task 1~8 의 스크립트 이름 · 경로.
- Produces: init.mjs 가 지우는 「프로젝트 초기 설정」 절(`## 프로젝트 초기 설정` … `---` + 빈 줄)이 그대로 맨 앞에 있다.

- [ ] **Step 1: CLAUDE.md**

T `CLAUDE.md` 전체:

````markdown
# Project Guide

## 프로젝트 초기 설정 (템플릿에서 생성 후 1회 실행)

이 프로젝트가 템플릿에서 생성된 경우, `@project` scope를 실제 프로젝트 scope로 변경해야 합니다.

### 방법 1: 스크립트 실행

```bash
node scripts/init.mjs <scope>
# 예시: node scripts/init.mjs myapp
# → @project → @myapp 일괄 치환 + pnpm install + git 히스토리 초기화
```

### 방법 2: Claude Code에게 지시

"이 프로젝트를 `@myapp` scope로 초기화해줘" 라고 지시하면 아래 작업을 수행합니다:

1. `package.json`의 `name`을 `project-template` → `myapp`으로 변경
2. `packages/*/package.json`의 `name`에서 `@project/` → `@myapp/`으로 변경
3. 모든 소스 파일(`.ts` · `.mts` · `.vue` · `.json` · `.md` · `Dockerfile.*`)의 `@project/` → `@myapp/` 일괄 치환 — `.claude/skills/` 포함
4. `pnpm install` 실행 (lockfile 갱신)
5. `scripts/` 디렉토리 삭제
6. 이 섹션("프로젝트 초기 설정") 삭제

---

## 구조

pnpm monorepo. 모든 패키지는 `packages/` 하위에 위치.

| 패키지     | 역할                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared`   | 서버 · 화면 공용. `src/admin/` = 관리자 카탈로그(권한 · 함의 · 감사 액션 · 오류 코드 · 약관 종류 · 비밀번호 정책 · 재인증), `src/schemas/` = 프로젝트 zod 스키마 |
| `backend`  | NestJS 12 API. `@ssworks/admin-server` 가 인증 · 사용자 · 역할 · 팀 · 세션 · 감사 · 약관 라우트를 준다(`/api/admin/*`)                                           |
| `frontend` | Vue 3 + Vuetify 4 관리자 SPA. `@ssworks/admin-ui` 가 셸 · 가드 · 스토어 · 화면 부품을 준다                                                                       |

관리자 공통 코드는 이 저장소에 복사돼 있지 않다 — npm 패키지 `@ssworks/admin-shared` · `@ssworks/admin-ui` · `@ssworks/admin-server`(같은 번호끼리, 지금 0.4.1)를 의존한다. 고칠 일이 생기면 패키지 저장소(`sinsungworks/ssworks-admin-kit`)에서 고치고 여기서는 버전을 올린다.

## 기술 스택

- **런타임**: Node.js 24 / TypeScript 5.9 (ESNext, NodeNext)
- **패키지 매니저**: pnpm workspaces (10.33)
- **백엔드**: NestJS 12 · Kysely 0.29 · MariaDB(`@kim5257/kysely-mariadb-dialect` 0.2)
- **프론트엔드**: Vue 3 + Vuetify 4 + Vite 8, 파일 기반 라우팅(vue-router 5) + 레이아웃
- **관리자 킷**: `@ssworks/admin-shared` · `@ssworks/admin-ui` · `@ssworks/admin-server` 0.4.1
- **배포**: Docker

## 템플릿 변형

| 브랜치         | 포함 기능                                                                          |
| -------------- | ---------------------------------------------------------------------------------- |
| `master`       | NestJS + Vue 3 + Vuetify + shared 타입                                             |
| `preset/db`    | + MariaDB + Kysely ORM                                                             |
| `preset/admin` | + 관리자 킷(`@ssworks/admin-*`) — 로그인 · 사용자 · 역할 · 팀 · 세션 · 약관 (현재) |
| `preset/db-ws` | + WebSocket + EventEmitter                                                         |

## 명령어

```bash
pnpm install          # 의존성 설치(+ shared 빌드)
pnpm build            # 전체 빌드
pnpm dev              # 전체 개발 서버(backend 4000 · frontend 3000)
pnpm lint             # ESLint(루트 + frontend)
pnpm lint:fix         # ESLint 자동 수정
pnpm format           # Prettier 포맷
pnpm typecheck        # TypeScript 타입 체크
pnpm test             # vitest(shared 카탈로그 · frontend 라우트 · 권한 매트릭스)
```

### 첫 실행

1. `packages/backend/.env.example` 을 `packages/backend/.env` 로 복사하고 DB 접속 · `ADMIN_JWT_SECRET`(32자 이상)을 채운다. 🔴 `TZ=UTC` 는 그대로 둔다(킷이 기동에서 확인한다).
2. MariaDB 에 DB 를 만든다 — `CREATE DATABASE app_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`.
3. `pnpm --filter @project/backend migrate` — 코어 12장(+ 프로젝트 장).
4. `pnpm --filter @project/backend seed:admin <아이디> <이름>` — 첫 관리자. 임시 비밀번호가 한 번만 찍힌다.
5. `pnpm dev` → http://localhost:3000 → 그 아이디와 임시 비밀번호로 로그인 → 새 비밀번호로 바꾼다.

### DB 명령어 (backend)

```bash
pnpm --filter @project/backend migrate                 # 마이그레이션 실행(latest)
pnpm --filter @project/backend migrate:make <이름>     # 새 마이그레이션 생성
pnpm --filter @project/backend seed:admin <아이디> <이름>  # 첫 관리자(빈 DB 에서만)
```

## 관리자 규약

- **경로 규약 (가)**: 화면의 API `baseURL` 은 `/api/admin` 이다 — 화면 코드의 경로는 `'/users'` 처럼 쓰고 `'/admin'` 을 붙이지 않는다. 백엔드의 프로젝트 관리자 컨트롤러는 `@Controller('admin/<자원>')`. 🔴 섞으면 토큰 갱신만 404 가 되어 15분마다 로그인 화면으로 튕긴다.
- **가드는 앱 전역이다**: 관리자 라우트는 `Require(P.…)` · `RequireAny(P.…)`(`backend/src/core/auth/require.ts`) · `@SelfOnly()` 중 하나를 선언한다 — 없으면 403. 관리자 밖 컨트롤러(공개 API · 헬스 · 웹훅)는 `@Public()`.
- **카탈로그는 한 벌**: 권한 키 · 함의 · 감사 액션 · 오류 코드 · 약관 종류 · 비밀번호 정책 · 재인증(`ADMIN_REAUTH`)은 `shared/src/admin/` 하나에서 서버와 화면이 같이 읽는다. 서버 슬롯 맵은 `backend/src/admin/admin-options.ts`.
- **페이지 = `definePage` meta 하나**: 경로 · 메뉴 · 접근(정확히 하나 — `isPublic` · `selfOnly` · `permissions` · `anyPermissions`)이 페이지 파일에 있다. 하위 페이지는 점 표기(`users.new.vue`), 폴더는 중첩 셸(`settings/`)에만. `frontend/src/router/routes.test.ts` 가 잰다.
- **관리자 페이지를 더할 때는 `admin-scaffold` 스킬**(`.claude/skills/admin-scaffold`) — 권한 키 · 테이블 · 모듈 · 화면 · 메뉴를 한 줄로 만든다.
- **시간**: 프로세스는 `TZ=UTC`, 사용자 날짜(입사일 · 퇴사일)는 기준 시간대 `Asia/Seoul`(`admin-options.ts` 의 `TIME_ZONE`)로 읽는다.
- **IP 기록**: `clientIp: 'x-real-ip'` — 템플릿 nginx 가 X-Real-IP 를 덮어쓴다는 전제다. 엣지 없이 API 를 노출하면 `'req.ip'` 로 바꾼다.

## 데이터베이스

- DB는 Docker 외부에서 별도 운영 (docker-compose에 DB 서비스 미포함)
- 스키마 변경은 **반드시 Kysely 마이그레이션**(`packages/backend/src/core/database/migrations/`) — 규칙은 `packages/backend/src/core/database/migrations.md`
- 코어 테이블(roles · users · teams · sessions · audit_logs …)은 킷 장을 가리키는 한 줄 스텁 12개다 — 지우거나 순서를 바꾸지 않는다
- `.sql` 파일을 직접 만들거나 raw SQL 로 스키마를 바꾸지 말 것

### DB 연동 패턴

1. **타입**: `packages/backend/src/core/database/tables/<이름>.table.ts` 에 두고 `database.types.ts` 의 `Database`(= `AdminDatabase` 확장)에 더한다
2. **마이그레이션**: `pnpm --filter @project/backend migrate:make <이름>`
3. **서비스**: `KYSELY` 토큰(`@ssworks/admin-server`)으로 받고 `runQuery` · `runWriteTransaction` 으로 감싼다

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Kysely } from 'kysely'
import { KYSELY, runQuery } from '@ssworks/admin-server'
import type { Database } from '../../core/database/database.types.js'

@Injectable()
export class ExampleService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  count() {
    return runQuery(() =>
      this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll().as('n'))
        .executeTakeFirstOrThrow(),
    )
  }
}
```

## 킷 올리기

1. 패키지 저장소의 changeset · CHANGELOG 에서 새 번호와 "쓰는 쪽이 고칠 것"을 읽는다.
2. 세 패키지를 같은 번호로 함께 올린다 — `pnpm -r up "@ssworks/admin-shared@x.y.z" "@ssworks/admin-ui@x.y.z" "@ssworks/admin-server@x.y.z"`. 버전은 캐럿 없이 고정한다.
3. 새 코어 장이 있으면 `packages/backend/src/core/database/migrations/` 에 다음 번호로 스텁 한 줄을 더한다 — 빠지면 `migrate` 가 시작 전에 멈춘다(`assertAdminMigrationStubs`).
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → `migrate` → 기동.

## IP 접근 제어 켜기

1. `shared/src/admin/permissions.ts` 에 키 둘(예 `settings.ipAccess:read` · `settings.ipAccess:write`)과 함의, `frontend/src/admin/permission-matrix.ts` 에 칸.
2. `backend/src/admin/admin-options.ts` 슬롯 맵에 `'ipAccess.read'` · `'ipAccess.manage'`.
3. `backend/src/app.module.ts` 의 `AdminIpAccessModule` 주석을 푼다.
4. 🔴 `clientIp` 출처가 맞는지 먼저 본다 — 주소를 못 읽으면 모두 막힌다. 화면은 아직 킷에 없다(규칙은 API `/api/admin/ip-access`). 잠겼을 때 복구는 `@ssworks/admin-server` README "IP 접근 제어".

## 컨벤션

### 파일 네이밍

- 서비스: `*.service.ts` (kebab-case)
- 컨트롤러: `*.controller.ts`
- 모듈: `*.module.ts`
- 타입: `*.types.ts`, 테이블 타입: `*.table.ts`
- Vue 컴포넌트: `PascalCase.vue`, 페이지: `src/pages/` 파일 기반(점 표기)

### Import

- backend · shared: `.js` 확장자 필수 (ESM, NodeNext)
- frontend: `@/` 별칭, 확장자 없이
- workspace 패키지: `@project/shared`
- 상대 경로 사용, 순환 참조 금지 — frontend 는 `main → router → stores → api` 한 방향(`api/client.ts` 는 라우터 · 스토어를 import 하지 않는다)

### 코드 스타일

- single quote, trailing comma, semicolon
- 2 spaces indent
- 100자 줄 너비 제한

### 커밋 메시지

- `feat:` 새 기능
- `fix:` 버그 수정
- `refactor:` 리팩토링
- `docs:` 문서
- `chore:` 빌드/설정 변경

## 확장 가이드 (Claude Code)

### 관리자 페이지 추가

`admin-scaffold` 스킬을 쓴다 — "공지 관리 페이지 추가해줘" 처럼 요청하면 권한 키 · (테이블 · 마이그레이션) · 백엔드 모듈 · 화면 · 메뉴 · 검사까지 한 줄로 만든다.

### 관리자 밖 엔티티(공개 API 등) 추가 체크리스트

1. `shared/src/schemas/` — Zod 스키마
2. `backend` — module, controller(`@Public()` — 가드가 앱 전역이다), service 생성 후 `app.module.ts` 에 등록
3. `backend/src/core/database/tables/` · `database.types.ts` — 테이블 타입
4. `backend/src/core/database/migrations/` — 마이그레이션 생성
````

- [ ] **Step 2: 루트 README.md**

T `README.md`(새로):

````markdown
# project-template · preset/admin

신규 웹 서비스의 **관리자 앱** 골격이다. 로그인 · 사용자 · 역할(권한 매트릭스) · 팀 · 세션 · 약관 화면과 API 가 든 채로 뜬다. 공통 코드는 복사하지 않고 npm 패키지로 의존한다.

- [`@ssworks/admin-ui`](https://www.npmjs.com/package/@ssworks/admin-ui) — Vue 3 + Vuetify 4 셸 · 가드 · 화면 부품
- [`@ssworks/admin-server`](https://www.npmjs.com/package/@ssworks/admin-server) — NestJS 12 인증 · 사용자 · 역할 · 팀 · 세션 · 감사 · 약관 모듈
- [`@ssworks/admin-shared`](https://www.npmjs.com/package/@ssworks/admin-shared) — 권한 · 응답 · 스키마 공용

## 빠른 시작

```bash
git clone --branch preset/admin <템플릿 저장소 URL> myapp
cd myapp
node scripts/init.mjs myapp        # @project → @myapp, 설치, git 히스토리 초기화
cp packages/backend/.env.example packages/backend/.env   # DB 접속 · ADMIN_JWT_SECRET(32자+) · TZ=UTC
pnpm --filter @myapp/backend migrate
pnpm --filter @myapp/backend seed:admin admin 관리자      # 임시 비밀번호가 한 번 찍힌다
pnpm dev                                                  # http://localhost:3000
```

임시 비밀번호로 로그인하면 새 비밀번호를 정하는 화면이 먼저 나온다. 자세한 것은 `CLAUDE.md`.

## 들어 있는 화면

| 화면                      | 경로                                       | 권한                               |
| ------------------------- | ------------------------------------------ | ---------------------------------- |
| 로그인 · 비밀번호 변경    | `/login` · `/password`                     | —                                  |
| 홈                        | `/`                                        | 로그인                             |
| 사용자 목록 · 추가 · 편집 | `/users` · `/users/new` · `/users/:userNo` | `org.users:read` / `:write`        |
| 팀                        | `/teams`                                   | `org.teams:read` / `:write`        |
| 전체 세션                 | `/sessions`                                | `sessions:read` / `:write`         |
| 설정 → 역할               | `/settings/roles`                          | `org.roles:read` / `:write`        |
| 설정 → 약관               | `/settings/legal`                          | `settings.legal:read` / `:publish` |
| 내 계정                   | `/account`                                 | 로그인                             |

권한 키는 `packages/shared/src/admin/permissions.ts` 에서 프로젝트가 정한다.

## 페이지 더하기

Claude Code 에서 "공지 관리 페이지 추가해줘" 처럼 요청하면 `admin-scaffold` 스킬이 권한 키 · 테이블 · 백엔드 모듈 · 화면 · 메뉴를 한 줄로 만든다(`.claude/skills/admin-scaffold/SKILL.md`).

## 배포

- `build.sh` — backend · nginx(프론트 포함) 이미지 빌드 · push. `deploy.sh <suffix>` — `.env.backend` 로 Docker secret 을 만들고 스택 배포(형식은 `.env.backend.example`).
- nginx 가 `/api` 를 backend 로 넘기며 `X-Real-IP` 를 덮어쓴다 — backend 가 이 헤더로 클라이언트 IP 를 읽는다.
- 마이그레이션은 이미지 밖에서 돌린다(`pnpm --filter @project/backend migrate` 를 운영 DB env 로).
````

- [ ] **Step 3: init.mjs 와 맞는지 · 경로가 있는지**

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
node -e "
const fs = require('node:fs');
const md = fs.readFileSync('CLAUDE.md', 'utf8');
const stripped = md.replace(/## 프로젝트 초기 설정[^]*?---\n\n/, '');
console.log(stripped.split('\n').slice(0, 3).join(' | '));
for (const file of ['CLAUDE.md', 'README.md']) {
  const text = fs.readFileSync(file, 'utf8');
  const paths = [...new Set([...text.matchAll(/\`((?:packages|\.claude)\/[^\`\s]+?\.(?:ts|vue|md))\`/g)].map((m) => m[1]))];
  const missing = paths.filter((p) => !fs.existsSync(p));
  console.log(file, paths.length, 'paths, missing', JSON.stringify(missing));
}
"
pnpm exec prettier --check CLAUDE.md README.md .claude/skills/admin-scaffold/SKILL.md
```

Expected: 첫 줄이 `# Project Guide |  | ## 구조`(초기 설정 절이 통째로 빠진다), 두 파일 모두 `missing []`. prettier 가 바꿀 것이 있으면 `pnpm exec prettier --write` 를 두 번 돌리고(긴 마크다운은 한 번에 수렴하지 않는다) `--check` 초록.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md .claude/skills/admin-scaffold/SKILL.md
git commit -m "docs: preset/admin 안내 — CLAUDE.md(관리자 규약 · 첫 실행 · 킷 올리기 · IP 켜기) · README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 검증 ① — 템플릿에서 새 앱(`%TEMP%\akt`)

**Files:**

- Create(저장소 밖): `C:\Users\kim52\AppData\Local\Temp\akt`(bash `$LOCALAPPDATA/Temp/akt`, 이하 **A**), **S**`\tpl\results-task10.md`(판정 기록 — Task 12 가 저장소 기록으로 옮긴다)

**Interfaces:**

- Consumes: T `preset/admin` 의 마지막 커밋(Task 9). 스모크 `smoke-api.mjs`.
- Produces: 판정 기록(항목 · 판정 통과/실패/해당 없음 · 근거). 실패는 고친 뒤 다시 판정하고 둘 다 남긴다. **A** 와 DB `akt` 는 Task 11 이 이어 쓴다.

판정 규칙: 기대와 다르면 멈추고 원인을 본다(superpowers:systematic-debugging). 템플릿 결함은 T 에서 고쳐 커밋하고 **A** 를 새로 만든다(Step 1 부터). 킷 결함은 Global Constraints 의 결함 처리대로.

- [ ] **Step 1: 템플릿 상태 · 생성 앱 만들기(포그라운드)**

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
git status --short
git log --oneline origin/preset/db..preset/admin
node -e "require('node:fs').rmSync(process.env.LOCALAPPDATA + '/Temp/akt', { recursive: true, force: true })"
git clone --branch preset/admin /c/Users/kim52/workspace/kim5257-project-template "$LOCALAPPDATA/Temp/akt"
cd "$LOCALAPPDATA/Temp/akt"
node scripts/init.mjs akt
cmd //c "dir %LOCALAPPDATA%\Temp\akt"
```

Expected: 템플릿 작업 트리 깨끗, 커밋 열 개 안팎. init 이 치환 · `pnpm install`(+ `prepare` 의 shared 빌드) · git 초기화 · 초기 커밋을 하고 `초기화 완료! scope: @akt` 를 찍는다. `dir` 에 `packages` · `.claude` · `CLAUDE.md` 가 보인다(포그라운드로 만든 폴더가 디스크에 있는지).

- [ ] **Step 2: init 결과 — scope 잔존 · 초기 설정 절**

```bash
cd "$LOCALAPPDATA/Temp/akt"
git grep -n "@project/" -- . ":(exclude)pnpm-lock.yaml"
echo "grep-exit=$?"
head -5 CLAUDE.md
grep -c "@akt/" .claude/skills/admin-scaffold/SKILL.md
git log --oneline
```

Expected: `git grep` 이 아무것도 못 찾고 `grep-exit=1`(Review Focus 4). `CLAUDE.md` 가 `# Project Guide` 다음 바로 `## 구조`(초기 설정 절이 지워졌다). 스킬 안의 `@akt/` 가 1 이상. 커밋 하나(`chore: 프로젝트 초기화 (@akt)`). `scripts/` 는 지워졌거나(리눅스) 잠시 뒤 지워진다(Windows 지연 삭제) — 남아 있으면 기록만 한다.

- [ ] **Step 3: 정적 검사 — 빌드보다 먼저**

```bash
cd "$LOCALAPPDATA/Temp/akt"
pnpm lint
pnpm typecheck
pnpm test
pnpm build
ls node_modules/.pnpm | grep -c "@ssworks+admin-shared@"
```

Expected: 넷 모두 초록(`typecheck` 가 `build` 보다 먼저 돌아도 `prepare` 가 만든 shared dist 로 통과 — Review Focus 2). 테스트 shared 6 + frontend 5. 마지막 줄 `1`(admin-shared 한 벌).

- [ ] **Step 4: DB · 마이그레이션 · 첫 관리자**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "DROP DATABASE IF EXISTS akt; CREATE DATABASE akt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
cd "$LOCALAPPDATA/Temp/akt"
node -e "
const fs = require('node:fs');
const secret = require('node:crypto').randomBytes(48).toString('base64url');
fs.writeFileSync('packages/backend/.env', ['TZ=UTC','PORT=4000','DB_HOST=127.0.0.1','DB_PORT=33306','DB_USER=root','DB_PASSWORD=admin-kit-test','DB_NAME=akt','DB_SSL=true','ADMIN_JWT_SECRET=' + secret, ''].join('\n'));
"
pnpm --filter @akt/backend migrate
S="C:/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/16e35d0e-99b9-43e3-afea-5b20333f2d4e/scratchpad"
pnpm --filter @akt/backend seed:admin admin 관리자 | tee "$S/tpl/seed-akt.txt"
grep '임시 비밀번호' "$S/tpl/seed-akt.txt" | sed 's/.*: //' > "$S/tpl/akt-temp-password.txt"
cat "$S/tpl/akt-temp-password.txt"
```

Expected: 12장 실행, 시드가 임시 비밀번호를 찍고 **S**`\tpl\akt-temp-password.txt` 에 16자 한 줄이 남는다(B2 가 쓴다).

- [ ] **Step 5: 기동 · API 스모크(로그인 전)**

백그라운드 둘: `cd "$LOCALAPPDATA/Temp/akt/packages/backend" && node dist/main.js` · `cd "$LOCALAPPDATA/Temp/akt/packages/frontend" && pnpm dev`. 포그라운드:

```bash
SMOKE="C:/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/16e35d0e-99b9-43e3-afea-5b20333f2d4e/scratchpad/tpl/smoke-api.mjs"
node "$SMOKE" http://127.0.0.1:4000/api anon
node "$SMOKE" http://localhost:3000/api anon
```

Expected: 둘 다 `smoke anon OK` — 두 번째는 vite 프록시를 지난다.

- [ ] **Step 6: 브라우저 확인(claude-in-chrome)**

먼저 `anthropic-skills:chrome-browser` 스킬을 읽고, 도구를 한 번에 싣는다: `ToolSearch` `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__read_network_requests`. 새 탭에서 한다.

지난 확인의 도구 한계(킷 HANDOFF "실서버 확인이 넘긴 것"): `form_input` · 타이핑이 Vue `v-model` 에 닿지 않으면 `javascript_tool` 로 네이티브 value setter + `input` 이벤트를 쏜다 —

```js
const el = document.querySelector('input[name="userId"]')
Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'admin')
el.dispatchEvent(new Event('input', { bubbles: true }))
```

쿼리 문자열 든 URL 꼴 출력이 막히면 `?` · `&` · `=` 를 바꿔 읽는다.

항목마다 판정 · 근거(URL · 문구 · 요청 상태)를 **S**`\tpl\results-task10.md` 에 적는다.

| #   | 할 일                                                                                                                                               | 기대                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `http://localhost:3000/` 을 연다                                                                                                                    | `/login?redirect=/` 로 간다. 브랜드 "관리자". 401 토스트가 뜨지 않는다                                                                                                              |
| B2  | `admin` + 임시 비밀번호(**S**`\tpl\akt-temp-password.txt`)로 로그인                                                                                 | `/password` — "임시 비밀번호로 로그인했습니다" 안내. 새 비밀번호 `Akt-admin-2026!` 로 바꾸면 토스트 · 홈(`/`), "관리자님, 반갑습니다."                                              |
| B3  | 드로어 메뉴를 본다                                                                                                                                  | 홈 · 조직(사용자 · 팀 · 전체 세션) · 설정. 역할 · 약관은 드로어에 **없다**. 앱바 사용자 메뉴에 "내 계정"                                                                            |
| B4  | 설정 → 역할 화면에서 새 역할 `조회 전용`(사용자 읽기 · 팀 읽기만) 저장                                                                              | 설정 클릭 시 `/settings/roles`(첫 자식). 좌측에 역할 · 약관. 저장 토스트, 목록에 `조회 전용`. 매트릭스에 사용자 · 역할 · 팀 · 세션 · 약관 · 감사 기록 행                            |
| B5  | 사용자 → 사용자 추가: `staff1` · `직원1` · 역할 `조회 전용` · 팀 없음 → 저장                                                                        | 임시 비밀번호 창(값 · 복사 버튼) — 값을 적어 둔다. 닫으면 토스트 · `/users` 목록에 `staff1` 상태 `재직`                                                                             |
| B6  | `staff1` 편집: 이름을 `직원 하나` 로 바꾼 뒤 저장 전에 드로어의 "팀" 을 누른다 → 머물기 → 저장                                                      | 킷 확인 창("화면 떠나기" · 머물기/떠나기). 머물면 그대로, 저장하면 `/users` 에 바뀐 이름                                                                                            |
| B7  | 팀: 최상위 팀 `영업본부` 추가 → 그 아래 `영업1팀` 추가 → `영업1팀` 을 고른다                                                                        | 트리에 둘. 인원 목록은 비었다는 문구. "고른 팀" 칸에 상위 팀 `영업본부`                                                                                                             |
| B8  | 설정 → 약관: 이용약관 본문을 쓰고 발행 → 개인정보처리방침 탭으로 전환                                                                               | 발행 확인 → 토스트 · 이력 1건. 탭 전환이 된다(이용약관 · 개인정보처리방침 라벨)                                                                                                     |
| B9  | 아래 `curl` 로 같은 계정을 한 번 더 로그인(세션 하나 더) → 내 계정 → 새로 고침 → "다른 세션 모두 끝내기"                                            | 내 세션 표에 현재 세션(끝내기 버튼 없음) + 다른 세션 1. 확인 뒤 토스트 "다른 세션 1개를 끝냈습니다." · 표에 하나                                                                    |
| B10 | 조직 → 전체 세션                                                                                                                                    | 목록 · 총 개수 · 검색이 된다                                                                                                                                                        |
| B11 | `http://localhost:3000/nope`                                                                                                                        | "페이지를 찾을 수 없습니다" · 홈으로                                                                                                                                                |
| B12 | 로그아웃 → `staff1` + B5 임시 비밀번호로 로그인 → 새 비밀번호 → 드로어 · `/users` · `/settings/roles` · `/sessions` 를 차례로                       | 강제 변경 뒤 홈. 드로어에 홈 · 조직(사용자 · 팀)만. `/users` 에 "사용자 추가" 버튼 없음 · 행 버튼 꺼짐. `/settings/roles` 와 `/sessions` 는 `/403`                                  |
| B13 | 토큰 갱신: `admin` 으로 다시 로그인 → backend 를 멈추고 `packages/backend/.env` 의 `ADMIN_JWT_SECRET` 을 새 값으로 바꿔 다시 띄운다 → 조직 → 사용자 | 액세스 토큰 서명이 맞지 않아 `GET /api/admin/users` 401 → `POST /api/admin/auth/refresh` 200 → 같은 요청 200(`read_network_requests`). 로그인 화면으로 가지 않는다 (Review Focus 1) |
| B14 | 위 전 구간의 콘솔                                                                                                                                   | `read_console_messages` 에 오류 0(경고는 적는다)                                                                                                                                    |

B9 의 두 번째 세션은 로그인만 하는 요청으로 만든다:

```bash
curl -s -o /c/Users/kim52/AppData/Local/Temp/akt-login.json -w "%{http_code}\n" -H "content-type: application/json" -d "{\"userId\":\"admin\",\"password\":\"Akt-admin-2026!\"}" http://127.0.0.1:4000/api/admin/auth/login
```

Expected: `200`.

- [ ] **Step 7: API 스모크(관리자) · 감사 행**

```bash
node "$SMOKE" http://127.0.0.1:4000/api admin admin 'Akt-admin-2026!'
```

Expected: `smoke admin OK`. 화면에서 한 쓰기(B4 · B5 · B6 · B7 · B8)도 감사 행이 됐는지 본다:

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akt -e "select action, target_type, status_code from audit_logs order by audit_log_no"
```

Expected: `org.role.create` · `org.user.create` · `org.user.update` · `org.team.create`(2) · `setting.legal.publish` · 인증 이벤트들. 열 이름이 다르면 `show columns from audit_logs` 로 보고 맞춘다.

- [ ] **Step 8: 서버를 멈춘다**

백그라운드 둘(backend · frontend dev)을 멈춘다(TaskStop).

- [ ] **Step 9: Docker — 이미지 둘 · backend 컨테이너**

```bash
cd "$LOCALAPPDATA/Temp/akt"
docker build -f Dockerfile.backend -t akt-backend:verify .
docker build -f Dockerfile.nginx -t akt-nginx:verify .
docker run -d --name akt-backend -p 4100:4000 --env-file packages/backend/.env -e DB_HOST=host.docker.internal akt-backend:verify
node "$SMOKE" http://127.0.0.1:4100/api anon
node "$SMOKE" http://127.0.0.1:4100/api admin admin 'Akt-admin-2026!'
docker logs akt-backend
docker rm -f akt-backend
```

Expected: 두 이미지 빌드 성공(nginx 이미지는 frontend 빌드 — `type-check` 포함 — 를 안에서 돈다), 컨테이너 스모크 둘 OK, 로그에 오류 없음 (Review Focus 5). TLS 가 `host.docker.internal` 에서 실패하면 Task 4 Step 6 과 같이 `-e DB_SSL=false` 로 다시 보고 기록한다.

- [ ] **Step 10: 기록 정리**

**S**`\tpl\results-task10.md` 에 Step 1~9 의 판정 표(항목 · 판정 · 근거), 실패와 고친 커밋, 도구 우회를 모은다. 이 Task 는 저장소에 커밋하지 않는다(T 에서 고친 것은 그 자리에서 커밋됐다).

---

### Task 11: 검증 ② — admin-scaffold 스킬 시험

**Files:**

- 생성 앱 **A** 안에서만 바뀐다(커밋은 **A** 의 git — 템플릿과 무관). 스킬 문구를 고치면 T `.claude/skills/admin-scaffold/SKILL.md`.
- Create(저장소 밖): **S**`\tpl\results-task11.md`

**Interfaces:**

- Consumes: **A**(Task 10 끝 상태, DB `akt`, 관리자 `admin` / `Akt-admin-2026!`), SKILL.md.
- Produces: 스킬이 만든 "공지" 한 줄의 판정 기록, 스킬 고침(있으면).

- [ ] **Step 1: 시작점 고정**

```bash
cd "$LOCALAPPDATA/Temp/akt"
git status --short
git add -A && git commit -q -m "chore: Task 10 검증 상태" || true
git rev-parse HEAD
```

이 커밋을 **S**`\tpl\results-task11.md` 첫 줄에 적는다(다시 돌릴 때 `git reset --hard <커밋> && git clean -fd` 로 돌아온다 — `-x` 를 쓰지 않아 `node_modules` · `.env` 는 남는다).

- [ ] **Step 2: 서브에이전트에게 스킬만 주고 시킨다**

Agent 도구, `subagent_type: general-purpose`, `model: sonnet`, `run_in_background: false`. 프롬프트(그대로):

```
작업 폴더: C:\Users\kim52\AppData\Local\Temp\akt (bash: $LOCALAPPDATA/Temp/akt). 이 폴더 밖의 파일을 고치지 않는다.
이 저장소는 관리자 앱이다. 먼저 .claude/skills/admin-scaffold/SKILL.md 를 읽고 그 절차를 그대로 따른다.

요청: "공지 관리 페이지를 추가해줘. 관리자가 공지 목록을 보고(제목 검색), 공지를 작성 · 수정 · 삭제한다.
공지는 제목 · 본문 · 상단 고정 여부를 가진다. 메뉴는 '조직' 그룹 맨 끝."

정해 둔 답(묻지 말고 쓴다): 자원 notices, 제목 '공지', 권한 키 board.notices:read · board.notices:write(write → read),
테이블 새로 만든다, 드로어 메뉴 그룹 org · 아이콘 mdi-bullhorn-outline · 순서 3.

DB 는 packages/backend/.env 가 가리킨다(이미 있다). 스킬의 검사 단계를 모두 돌리고, 기동 확인은 backend 를 백그라운드로 띄워
미인증 요청 401 을 본 뒤 멈춘다. 셸에서 /dev/null 로 리디렉션하지 않는다. git 커밋은 하지 않는다.
끝나면 스킬 '보고' 형식으로 답하고, 스킬 문구가 모호하거나 틀려서 막힌 곳 · 스스로 판단한 곳을 따로 적는다.
```

- [ ] **Step 3: 결과를 체크리스트로 대조**

```bash
cd "$LOCALAPPDATA/Temp/akt"
git status --short
git diff --stat
```

대조 항목(각각 판정 · 근거를 **S**`\tpl\results-task11.md` 에):

| #   | 확인                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | `permissions.ts` 키 둘 · IMPLIES · `catalog.test.ts` 의 `EXPECTED_KEYS`                                                                            |
| K2  | `audit.ts` 액션 셋 · 대상 · 라벨                                                                                                                   |
| K3  | `schemas/notices.schema.ts` + `schemas/index.ts` export                                                                                            |
| K4  | `tables/notices.table.ts` · `Database` 에 `notices` · 마이그레이션 파일(`Kysely<unknown>`, camelCase)                                              |
| K5  | `modules/notices/*` — `@Controller('admin/notices')`, 핸들러마다 `Require`, 쓰기에 `@Audit`, 검증 파이프, `revision`, `app.module.ts` 등록         |
| K6  | `api/notices.ts` — 경로에 `/admin` 없음                                                                                                            |
| K7  | `pages/notices.vue` · `notices.new.vue` · `notices.[noticeNo].vue`(점 표기) · 폼 컴포넌트 · 페이지 setup 의 `useDirtyGuard` · `#no-data` 오류 먼저 |
| K8  | `routes.test.ts` 의 `EXPECTED_MENU` 에 `/notices` · `permission-matrix.ts` 에 공지 행                                                              |
| K9  | 서브에이전트의 검사 보고가 초록(아래 Step 4 로 다시 잰다)                                                                                          |

- [ ] **Step 4: 다시 잰다 — 정적 · DB · 기동 · 화면**

```bash
cd "$LOCALAPPDATA/Temp/akt"
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @akt/backend migrate
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akt -e "show columns from notices"
```

백그라운드 둘(backend · frontend dev). 브라우저(새 탭):

| #   | 할 일                                                   | 기대                                                            |
| --- | ------------------------------------------------------- | --------------------------------------------------------------- |
| N1  | `admin` 로그인 → 드로어                                 | 조직 그룹 끝에 "공지"                                           |
| N2  | 공지 → 작성: 제목 `점검 안내` · 본문 · 상단 고정 → 저장 | 목록에 한 줄                                                    |
| N3  | 제목 검색 `점검` / `없는말`                             | 한 줄 / 조건에 맞는 항목 없음 문구                              |
| N4  | 편집: 제목 수정 → 저장                                  | 목록에 바뀐 제목                                                |
| N5  | 삭제 → 확인                                             | 목록에서 사라진다                                               |
| N6  | `staff1` 로그인                                         | 드로어에 공지 없음 · `/notices` 직접 → `/403`(키를 받지 않았다) |
| N7  | 콘솔 오류                                               | 0                                                               |

감사 행:

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akt -e "select action, target_type, target_ref_no from audit_logs where action like 'board.notice.%' order by audit_log_no"
```

Expected: `board.notice.create` · `update` · `delete`, 대상 `notice`.

- [ ] **Step 5: 스킬 고침(필요할 때만, 최대 두 바퀴)**

K · N 항목에 실패가 있거나 서브에이전트가 "막힌 곳"을 적었으면:

1. 원인이 스킬 문구면 T 의 `.claude/skills/admin-scaffold/SKILL.md` 를 고치고 커밋한다(`fix: admin-scaffold — <무엇>`). 원인이 템플릿 코드면 그 파일을 고쳐 커밋한다. 원인이 킷이면 결함 처리대로.
2. **A** 를 Step 1 의 커밋으로 되돌리고(`git reset --hard <커밋> && git clean -fd`), 고친 SKILL.md(와 템플릿 파일)를 **A** 에 복사하고, `docker exec … akt -e "drop table if exists notices; delete from kysely_migration where name like '%notices%'"` 로 DB 를 되돌린 뒤 Step 2 부터 다시.
3. 두 바퀴 뒤에도 남으면 멈추고 보고한다.

- [ ] **Step 6: 서버를 멈춘다 · 기록**

백그라운드 둘을 멈춘다. **S**`\tpl\results-task11.md` 에 대조 · 재측정 판정, 서브에이전트가 적은 막힌 곳, 스킬 고침 커밋을 모은다.

---

### Task 12: 정리 · 이 저장소 기록

**Files:**

- Create: K `docs/verification/<YYYY-MM-DD>-template-preset-admin.md`(검증을 마친 날 — `date +%F`)
- Modify: K `docs/HANDOFF.md`, K `CLAUDE.md`(진행표), K `docs/01-phase0.md`(§8), K `docs/superpowers/specs/2026-10-16-template-preset-admin-design.md`(§13), K `packages/admin-ui/README.md`(「파일 기반 라우팅이면 `depth: 'all'`」)

**Interfaces:**

- Consumes: **S**`\tpl\results-task10.md` · `results-task11.md` · `notes.md`, T 의 커밋 목록.
- Produces: 다음 세션이 읽을 HANDOFF.

- [ ] **Step 1: 저장소 밖 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "DROP DATABASE IF EXISTS akt; DROP DATABASE IF EXISTS tpl_dev; SHOW DATABASES"
docker rmi akt-backend:verify akt-nginx:verify tpl-backend:dev
docker ps -a --format "{{.Names}}" | grep -E "^(akt|tpl)-" || echo "컨테이너 없음"
node -e "for (const d of ['akt', 'dpp']) require('node:fs').rmSync(process.env.LOCALAPPDATA + '/Temp/' + d, { recursive: true, force: true })"
cd /c/Users/kim52/workspace/kim5257-project-template && git status --short && node -e "require('node:fs').rmSync('packages/backend/.env', { force: true })" && git status --short --ignored | head -5
```

Expected: `SHOW DATABASES` 에 `akt` · `tpl_dev` 가 없다. 이미지 셋 지워짐, 컨테이너 없음, `%TEMP%\akt` · `%TEMP%\dpp` 없음. 템플릿 작업 트리 깨끗(개발용 `.env` 도 지웠다 — `node_modules` 는 둔다).

- [ ] **Step 2: 검증 기록**

파일은 `docs/verification/$(date +%F)-template-preset-admin.md`(검증을 마친 날)다. 머리에 날짜 · 대상(`kim5257-project-template` `preset/admin` 의 마지막 커밋 해시) · 환경(Windows · Node · pnpm 10.33 · Docker MariaDB 11.4 · `@ssworks/*` 0.4.1 npm). 그 아래 절 넷:

1. 템플릿 커밋 목록(`git -C <T> log --oneline origin/preset/db..preset/admin`).
2. Task 10 판정 표(Step 1~9 · B1~B14 — 항목 · 판정 · 근거).
3. Task 11 판정 표(K1~K9 · N1~N7) · 서브에이전트가 적은 막힌 곳 · 스킬 고침.
4. 발견 · 넘긴 것(킷 결함 · 템플릿 결함 · 도구 우회 · TLS 메모).

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
V="docs/verification/$(date +%F)-template-preset-admin.md"
pnpm exec prettier --write "$V"
pnpm exec prettier --write "$V"
pnpm exec prettier --check "$V"
```

- [ ] **Step 3: 킷 문서 · 스펙 정정**

K `packages/admin-ui/README.md` 「파일 기반 라우팅이면 `depth: 'all'`」 절 끝에 한 단락을 더한다:

```markdown
🔴 `depth: 'all'` 은 **`meta.menu` 를 가진 모든 깊이의 레코드**를 드로어 항목으로 만든다 — 설정 셸(`SettingsShell`)의 자식이 좌측 메뉴용으로 `meta.menu`(아이콘 · 순서)를 가지면 드로어에도 올라간다. 하위 페이지를 폴더(`users/index.vue`) 대신 점 표기(`users.new.vue` · `users.[id].vue` — 중첩 없는 최상위 라우트)로 두면 날 `routes` 를 기본 depth 1 로 넘겨도 된다(템플릿 `kim5257-project-template` `preset/admin` 이 이 갈래다).
```

K 스펙 §13 에 구현 중 정정(Task 1~11 에서 플랜과 달라진 것 — 번호를 6 부터 잇는다)을 더한다.

- [ ] **Step 4: HANDOFF · 진행표 · §8**

K `docs/HANDOFF.md`:

- 「지금 상태」 표의 `다음 플랜` 행 → 다음 단계(00 검토 §4 Phase 4 "첫 신규 프로젝트로 실전 검증 후 1.0") 와 그 전에 사람이 할 일: 템플릿 `preset/admin` push(`git -C ../kim5257-project-template push -u origin preset/admin`), 이 브랜치(`chore/template-preset-admin`) PR.
- 「검증」 행에 이번 검증 한 문장 + 기록 파일 경로.
- 「알려진 미확인 · 보류」 에 「템플릿 preset/admin 이 넘긴 것(검증을 마친 날)」 절: IP 접근 제어 · 감사 로그 화면(후속 admin-ui PR 후보 — 프로젝트마다 같아야 하는 화면), 킷 결함이 있었으면 "다음 발행 뒤 템플릿 핀을 올린다", 템플릿 `preset/auth` 와의 관계(admin 이 auth 의 자리를 대신한다 — 정리는 사람이 정한다), 그 밖 Task 10 · 11 의 발견.

K `CLAUDE.md` 진행표의 템플릿 행을 `완료` 로 바꾸고 문서 칸에 스펙 · 플랜 · 검증 기록 경로를 적는다. 다음 행으로 `Phase 4 — 첫 신규 프로젝트 실전 검증 → 1.0` 을 `**다음**` 으로 더한다.

K `docs/01-phase0.md` §8 표에 같은 내용을 더한다(그 표의 형식을 따른다).

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
pnpm exec prettier --write docs/HANDOFF.md CLAUDE.md docs/01-phase0.md packages/admin-ui/README.md docs/superpowers/specs/2026-10-16-template-preset-admin-design.md
pnpm exec prettier --write docs/HANDOFF.md CLAUDE.md docs/01-phase0.md packages/admin-ui/README.md docs/superpowers/specs/2026-10-16-template-preset-admin-design.md
pnpm format:check
pnpm check
```

Expected: `format:check` · `pnpm check` 초록(README · 문서만 바뀌었다).

- [ ] **Step 5: Commit · 마지막 확인**

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
git status --short
git add docs/verification docs/HANDOFF.md CLAUDE.md docs/01-phase0.md packages/admin-ui/README.md docs/superpowers/specs/2026-10-16-template-preset-admin-design.md
git commit -m "docs: 템플릿 preset/admin + admin-scaffold 완료 — 검증 기록 · HANDOFF · 진행표 · §8 · admin-ui README(depth: 'all' 과 설정 셸)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline main..HEAD
git -C /c/Users/kim52/workspace/kim5257-project-template log --oneline origin/preset/db..preset/admin
git -C /c/Users/kim52/workspace/kim5257-project-template status --short
```

Expected: `.claude/settings.json`(로컬 변경)은 커밋에 들지 않는다. 두 저장소의 커밋 목록을 사람에게 보고하고, push · PR 은 사람이 한다.
