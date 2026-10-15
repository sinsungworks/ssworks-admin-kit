# 확인용 앱 실서버 확인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확인용 앱(aksv)을 가짜 서버 대신 실서버(akss — admin-server 0.4.0 + Docker MariaDB)에 붙여 체크리스트 3장의 62 항목을 판정하고, 결과 · 결함 · 템플릿 메모를 저장소에 남긴다.

**Architecture:** 저장소 밖 `%TEMP%\akss`(Nest 12 · 모듈 여덟 · LabModule)와 `%TEMP%\aksv`(Vite 8 · admin-ui 0.4.0 · 프록시 + 실험 미들웨어)를 세운다. 실험 미들웨어가 '다른 관리자'(계정 other)로 실서버 API 를 불러 가짜 스위치를 실제 일로 바꾼다. 판정은 claude-in-chrome + 보조 스크립트로 Claude 가 먼저 하고, 결과는 `results.json` → 정적 HTML 로 굽는다.

**Tech Stack:** NestJS 12 · Kysely 0.29 · MariaDB 11.4(Docker `admin-kit-test-db`) · Vite 8 · Vue 3.5 · Vuetify 4 · pnpm 12 · Node 24 · claude-in-chrome

**Spec:** `docs/superpowers/specs/2026-10-16-aksv-real-server-design.md`

## Global Constraints

- 경로 — 이 플랜에서 이름으로 부른다:
  - `AKSS` = `C:\Users\kim52\AppData\Local\Temp\akss` (Git Bash `/c/Users/kim52/AppData/Local/Temp/akss`)
  - `AKSV` = `C:\Users\kim52\AppData\Local\Temp\aksv` (Git Bash `/c/Users/kim52/AppData/Local/Temp/aksv`)
  - `SCRATCH` = `C:\Users\kim52\AppData\Local\Temp\claude\c--Users-kim52-workspace-ssworks-admin-kit\d83be8de-5f0c-4a85-901b-b02dfb3d087b\scratchpad` (Git Bash `/c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad`). 다른 세션이 실행하면 그 세션의 스크래치패드로 `prev/` · `aksv/`(지난 앱 풀어 둔 것) · `review/` 를 복사해 쓴다.
  - `REPO` = `C:\Users\kim52\workspace\ssworks-admin-kit`
- 포트: akss **4100**, aksv **5199**(strictPort). DB: `admin-kit-test-db` 의 **`aksv`**, `DB_SSL=true`, root / `admin-kit-test`.
- 패키지: `@ssworks/admin-shared` · `@ssworks/admin-ui` 는 npm **`0.4.0`**(정확히), `@ssworks/admin-server` 는 `REPO` 에서 pack 한 `ssworks-admin-server-0.4.0.tgz`.
- 계정: `admin` / `admin1234`(userNo `9007199254740993` = 2^53+1, 최고 관리자, 경영지원본부) · `other` / `other1234`(두 번째 `*`, 실험 미들웨어 전용) · `user001`~`user200`(임시 비밀번호 — 필요하면 실험 패널 "비밀번호 초기화").
- akss 명령은 모두 `TZ=UTC`. 서버 · Vite 는 Bash `run_in_background` 로 띄우고 `node SCRATCH/stop-port.mjs <포트>` 로 끈다.
- bigint 는 본문 · 쿼리에서 `"BigInt(n)"` 문자열(admin-shared `stringifyJSON` · `parseJSON`), URL 경로에서는 숫자.
- 앱 경로 규약은 admin-ui README 「Phase 2 서버」 예제를 따른다 — `baseURL: '/api'`, 경로 `'/admin/…'`, `refreshPath: '/admin/auth/refresh'`, `noRetryPaths: ['/admin/auth/login']`(스펙 §6-1 의 `baseURL '/api/admin'` 을 바꿈 — Task 13 이 스펙 §14 에 적는다).
- `/dev/null` 금지 · 폴더는 포그라운드로 만든다 · 파일을 python 으로 다시 쓰지 않는다(LF) · `console.log` 는 저장소 코드에서만 금지(스크립트는 괜찮다).
- `git push` · 발행은 사람. 커밋 메시지 끝 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. 서브에이전트는 model 을 명시한다.
- `pnpm test:db` 를 돌릴 때는 akss 를 먼저 끈다(같은 DB 서버를 겹쳐 쓰지 않는다).

## 사전 확인 결과 (플랜 작성 중 코드로 닫은 스펙 §11 위험)

| 위험                             | 답                                                                                                                                                                                                                                                                                                                   | 근거                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 재인증 끔일 때 `currentPassword` | **조용히 버린다**(400 아님). 켬 + 빠짐 → 400 `ERR_COMMON_VALIDATION`(issues `currentPassword`), 켬 + 틀림 → 403 `ERR_REAUTH_REQUIRED` "비밀번호가 올바르지 않습니다."                                                                                                                                                | `accounts/reauth-body.ts:14-24`                                                       |
| 재인증 실패와 잠금               | **로그인 잠금 카운터에 더해진다**(5회 → 15분). 성공하면 되돌린다                                                                                                                                                                                                                                                     | `auth/reauth.service.ts` `verify`                                                     |
| 재인증을 쓰는 라우트             | 사용자 create · update · resign · resign-date · rehire · password-reset · unlock, 역할 create · update · delete(move 는 아님), IP create · update · delete                                                                                                                                                           | `users.body.ts` · `roles.controller.ts` · `ip-access.body.ts`                         |
| `AdminReauthService` 주입        | `AdminAuthModule` 이 `@Global()` 로 export — 쓰는 쪽 모듈이 그대로 주입                                                                                                                                                                                                                                              | `auth/admin-auth.module.ts:69-81`                                                     |
| 쿠키                             | `admin_at` · `admin_rt` 둘 다 `Path=/` · HttpOnly · SameSite=Lax, Max-Age = accessTtl(900s) · refreshTtl(7일), Secure 는 auto(http 면 없음)                                                                                                                                                                          | `auth/cookies.ts` · `auth/options.ts`                                                 |
| 쓰는 쪽 예외                     | `InternalServerErrorException` → 500 `ERR_COMMON_INTERNAL` "서버 내부 오류가 발생했습니다."(가림), `ForbiddenException('권한이 없습니다.')` → 403 `ERR_COMMON_FORBIDDEN`. 봉투 · 필터는 `APP_*` 라 쓰는 쪽 컨트롤러에도 걸린다                                                                                       | `http/error-response.ts` · `admin-server.module.ts:128-129`                           |
| IP 층                            | 허용 목록, 가까운 층(user → team → global)에 규칙이 있으면 그 층만 본다. admin 에게 user 규칙 `127.0.0.0/8` 이면 203.0.113.9 의 admin 은 403 `ERR_IP_NOT_ALLOWED`(`details.clientIp`), 로그인은 같은 401 `ERR_LOGIN_FAILED`. 자기 잠금 409 는 행위자(other)만 본다. 장 0012 가 global `0.0.0.0/0` · `::/0` 을 넣는다 | `admin-shared/src/ip-access.ts:185-232` · `ip-access.service.ts:141-148`              |
| 직접 넣기 스키마                 | `teams` 에 부모 칸 없음 — `teamClosure`(자기 행 depth 0 + 조상 행). 사용자 팀은 `teamUserMap`, 입사일 원천은 `userEmploymentPeriods.joinAt`(DATE, `recordedTimezone: 'UTC'`), `users.joinAt` 은 기준 시간대 0시 캐시. `roles.permissions` 는 정규화된 JSON 문자열. 가드 행은 장이 넣는다                             | `users/users.service.ts:195-234` · `users/employment.ts` · `teams.service.ts:103-109` |
| 2-R8                             | 이름만 바꾸는 역할 수정은 지배 판정을 하지 않는다(`permissions` 를 보낼 때만) — 화면과 같다                                                                                                                                                                                                                          | `accounts/account-command.ts:70-74`                                                   |
| 강제 변경 계정                   | 로그인은 되고 세션이 생긴다. `/auth/me` 의 `permissions` 는 `[]`, 허용 라우트는 `GET /auth/me` · `PATCH /auth/password` 뿐(쓰는 쪽 `@SelfOnly` 도 403 `ERR_PASSWORD_CHANGE_REQUIRED`)                                                                                                                                | `auth.service.ts:254` · `permission.guard.ts:60-65`                                   |
| 약관                             | `GET current?kind=` → `{item\|null}`, `GET ?kind=` → `{items}`, `GET /:no` → 문서 그대로(래퍼 없음), `POST {kind, body, baseLegalDocNo}` → `{legalDocNo, contentHash}`. 기준 판 다름 409 `ERR_COMMON_REVISION_CONFLICT`, 같은 본문 409 `ERR_COMMON_CONFLICT`                                                         | `legal/legal.controller.ts` · `legal.service.ts`                                      |
| 사용자 목록                      | 필터 `keyword`(아이디 · 이름 부분일치) · `teamNo` · `recursive` · `status`, 정렬 `userId · userName · joinAt · resignAt · createAt · updateAt`, 상태 필터 없으면 퇴사자 포함, `total` 은 bigint                                                                                                                      | `users/users.query.ts`                                                                |
| 잠긴 로그인                      | 맞든 틀리든 같은 401 문구(IP 모듈이 있으면 "…허용되지 않은 접속 위치입니다." 까지). 423 은 비밀번호 변경 · 재인증에서만                                                                                                                                                                                              | `auth.service.ts:116`                                                                 |
| claude-in-chrome                 | Windows 브라우저 한 대 연결됨(2026-10-16 확인)                                                                                                                                                                                                                                                                       | `list_connected_browsers`                                                             |
| pnpm 공개 경과 시간              | 저장소 · 전역에 `minimumReleaseAge` 없음. 그래도 오늘 공개된 0.4.0 이 막히지 않게 AKSS · AKSV 의 `pnpm-workspace.yaml` 에 `minimumReleaseAgeExclude: ['@ssworks/*']` 를 둔다                                                                                                                                         | `pnpm config get`                                                                     |
| 지난 생성기 빈틈                 | `make-app.mjs` 의 37 파일에 `src/plugins/confirm.ts` 가 없다(`main.ts` 는 import) — Task 3 이 README 배선대로 채운다                                                                                                                                                                                                 | `prev/make-app.mjs`                                                                   |
| README 어긋남(발견)              | admin-ui README 최소 배선은 `refreshPath: '/auth/refresh'`, Phase 2 예제는 `'/admin/…'` 경로(baseURL `/api` 가정) — 두 예제를 합치면 갱신 경로가 틀린다. 문서 결함 후보로 Task 4 가 `findings` 에 적는다                                                                                                             | `packages/admin-ui/README.md:195-197 · 719 · 748 · 795-808`                           |

## Review Focus

- **토큰 빼기가 풀리지 않음** — "액세스 토큰 만료" 뒤 갱신이 실패(401)해도 프록시의 빼기 플래그가 꺼져야 한다. 안 꺼지면 다시 로그인해도 모든 요청이 401 이다. Task 3 `check-aksv.mjs` 가 "빼기 → 갱신 실패 → 로그인 → /auth/me 200" 을 잰다.
- **재인증 · 비밀번호 실패가 admin 을 잠금** — 판정 중 틀린 비밀번호가 5번 쌓이면 admin 이 15분 잠긴다. 틀린 시도 뒤에는 바로 맞는 시도로 카운터를 되돌린다. 잠기면 실험 패널 "잠금 해제(admin)" 로 푼다. Task 2 `check-seed.mjs` 가 "재인증 틀림 403 → 맞음 200(카운터 되돌림)" 을 잰다.
- **other 의 쿠키가 만료 · 회전으로 죽음** — 실험 미들웨어의 '다른 관리자' 호출이 401 이면 다시 로그인해 한 번 더 보내고, 그래도 실패하면 상태 · 본문을 패널에 그대로 보인다(조용히 성공처럼 보이지 않는다). Task 3 이 other 쿠키를 지운 뒤 호출해 재로그인을 잰다.
- **화면 재인증 스위치와 서버 재인증이 어긋남** — 어긋나면 판정이 거짓이 된다(끔 서버에 켬 화면이면 틀린 비밀번호도 통과). 패널이 `/api/lab/state` 의 `reauth` 를 보여 주고 어긋나면 경고한다. Task 3 이 표시를 잰다.
- **시드 반쯤 실패** — 사용자 API 시드가 중간에 멈추면 DB 가 반쯤 찬다. 시드는 언제나 `DROP DATABASE` → 새로 만들기부터 다시 한다(덧붙이지 않는다). Task 2 가 그 순서로만 시드를 돈다.

## 파일 지도

저장소 밖(판정 끝나면 `snapshot.mjs` 가 `SCRATCH/make-app.mjs` · `make-server.mjs` 로 묶는다):

| 경로                                                                                        | 책임                                                                               |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `SCRATCH/shared/permissions.ts` · `fixtures.ts`                                             | 권한 카탈로그 · 시드 값(역할 · 팀 · 계정) — AKSS · AKSV 가 같은 파일을 복사해 쓴다 |
| `SCRATCH/snapshot.mjs` · `stop-port.mjs`                                                    | 생성기 스냅숏 · 포트 프로세스 끝내기                                               |
| `SCRATCH/items-real.mjs` · `gen-real.mjs` · `record.mjs` · `results.json` · `findings.json` | 체크리스트 3장 항목 · 생성 · 판정 기록 · 결과 · 발견                               |
| `AKSS/package.json` · `pnpm-workspace.yaml` · `tsconfig.json` · `.env` · `kysely.config.ts` | 쓰는 쪽 앱 틀(2f-2b akss 레시피)                                                   |
| `AKSS/src/migrations/001~012_*.ts`                                                          | 코어 장 스텁 열둘                                                                  |
| `AKSS/src/app.module.ts` · `main.ts` · `permissions.ts` · `fixtures.ts`                     | 모듈 여덟 · 옵션 · 기동                                                            |
| `AKSS/src/lab/lab.module.ts`                                                                | LabState · LabInterceptor · LabController(`/api/lab/*`)                            |
| `AKSS/src/seed.ts` · `seed-api.mjs` · `check-akss.mjs` · `check-seed.mjs`                   | 시드 ①(DB) · ②(API) · 확인                                                         |
| `AKSV/lab/plugin.ts` · `lab/other-admin.ts`                                                 | Vite 프록시 조작 · `/__lab/*` · 다른 관리자                                        |
| `AKSV/src/api/client.ts` · `state/lab.ts` · `components/LabPanel.vue`                       | 실제 어댑터 + 요청 기록 · 실험 상태 · 실험 패널                                    |
| `AKSV/src/pages/**`                                                                         | 실서버 모양으로 옮긴 페이지 + 새 `settings/LegalPage.vue`                          |
| `AKSV/check-aksv.mjs`                                                                       | 프록시 · 미들웨어 확인                                                             |

저장소 안:

| 경로                                                               | 책임                                                |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| `docs/verification/2026-10-16-real-server-check.html`              | 결과를 구운 체크리스트 3장(Task 13)                 |
| `docs/HANDOFF.md` · `CLAUDE.md` · `docs/01-phase0.md` §8           | 검증 행 · 진행표                                    |
| `docs/superpowers/specs/2026-10-16-aksv-real-server-design.md` §14 | 구현 중 정정                                        |
| `packages/**`                                                      | 판정에서 나온 작은 결함 수정(있을 때만 — 아래 절차) |

## 결함 처리 절차 (Task 6~12 공통)

1. **층을 판정한다** — 실패 항목마다 원인이 패키지(admin-shared · admin-ui · admin-server)인지, 앱(AKSV 페이지 · 배선 — B)인지, 장치(미들웨어 · LabModule · 시드 · 생성기)인지. 앱 · 장치면 `%TEMP%` 쪽을 고치고 다시 판정한다. 결함으로 세지 않는다. B층 마찰이면 `node record.mjs --finding template "<제목>" "<내용>"`.
2. **패키지 결함의 크기** — 작음(한두 파일 · 설계 판단 없음)이면 3으로. 설계 판단이 필요하면 `node record.mjs --finding defect "<제목>" "<재현 · 근거 · 첫 발행을 막는가>" deferred <항목ID>` 로 남기고 다음 항목으로 간다.
3. **작은 결함 고치기** — superpowers:systematic-debugging 으로 원인을 확정한 뒤 `REPO` 에서 TDD 로 고친다: 실패하는 테스트 → 실행해 실패 확인 → 최소 수정 → 통과 → `pnpm check`. admin-server 면 akss 를 끄고(`node SCRATCH/stop-port.mjs 4100`) `pnpm test:db` 도 돌린다.
   - admin-server 만 바뀌면 changeset 없이 `packages/admin-server/CHANGELOG.md` 의 `## 0.4.0` 절 맨 아래에 한 줄을 보탠다(미발행이라 0.4.0 을 다시 정의한다).
   - admin-shared · admin-ui 가 바뀌면 `pnpm changeset`(patch — `fixed` 라 셋 다 0.4.1). 문서(README)만이면 changeset 없이 고친다.
4. **바꿔 끼우고 다시 본다** —
   - admin-server: `pnpm --filter @ssworks/admin-server build && pnpm --filter @ssworks/admin-server pack --pack-destination "$AKSS_SH"` → `pnpm --dir "$AKSS_SH" add ./ssworks-admin-server-0.4.0.tgz` → `pnpm --dir "$AKSS_SH" build` → akss 재기동.
   - admin-shared · admin-ui: 그 패키지를 build · pack 해 `AKSV` 에 두고 `package.json` 의 그 의존성을 `file:./ssworks-admin-ui-0.4.0.tgz` 처럼 바꾼 뒤 `pnpm --dir "$AKSV_SH" install` → Vite 를 `pnpm dev --force` 로 재기동. 판정 메모에 "로컬 tarball 로 재확인" 을 적는다.
5. **커밋** — `fix(<패키지>): <무엇> (실서버 확인 <항목ID>)` + 끝 줄 Co-Authored-By. `node record.mjs --finding defect "<제목>" "<무엇을 고쳤나>" fixed <항목ID>`.

---

### Task 1: akss — 실서버 세우기

**Files:**

- Create: `SCRATCH/shared/permissions.ts`, `SCRATCH/shared/fixtures.ts`, `SCRATCH/snapshot.mjs`, `SCRATCH/stop-port.mjs`
- Create: `AKSS/package.json`, `AKSS/pnpm-workspace.yaml`, `AKSS/tsconfig.json`, `AKSS/.env`, `AKSS/kysely.config.ts`, `AKSS/src/migrations/001~012_*.ts`, `AKSS/src/permissions.ts`, `AKSS/src/fixtures.ts`, `AKSS/src/app.module.ts`, `AKSS/src/main.ts`, `AKSS/src/lab/lab.module.ts`, `AKSS/check-akss.mjs`

**Interfaces:**

- Produces: `permissions`(카탈로그) · `P` · `Permission` · `IMPLIES` (`shared/permissions.ts`), `ADMIN_NO` · `ADMIN` · `OTHER` · `TEAM` · `TEAMS` · `ROLES` · `PRESET_ROLE` · `PRESET_LABEL` · `Preset` (`shared/fixtures.ts`)
- Produces: HTTP `GET /api/health`, `GET /api/lab/state` → `{delay, failNext, reauth, accessTtlMs}`, `POST /api/lab/next {delay?: 0|700|3000|'shuffle', failNext?: 500|403|null}`, `POST /api/lab/reauth {currentPassword}`(@SelfOnly), `POST /api/lab/shutdown`
- env: `AKSS_REAUTH=true` → 코어 `reauth: true`, `AKSS_ACCESS_TTL_MS=<ms>` → `auth.accessTtlMs` + `refreshGraceMs: 5000`

- [ ] **Step 1: 공용 파일 둘을 쓴다**

`SCRATCH/shared/permissions.ts`:

```ts
// 확인용 앱 · 서버 공용 권한 카탈로그 — 템플릿(B) 몫을 흉내 낸다. aksv · akss 가 같은 파일을 복사해 쓴다(실서버 확인 스펙 §5-3).
import { definePermissions, type PermissionOf } from '@ssworks/admin-shared'

/** 쓰기 → 읽기 함의. 서버 정규화와 역할 편집기(useRoleEditor)가 같은 표를 쓴다 */
export const IMPLIES = {
  'org.users:write': ['org.users:read'],
  'org.users:delete': ['org.users:write'],
  'org.roles:write': ['org.roles:read'],
  'org.teams:write': ['org.teams:read'],
  'sessions:write': ['sessions:read'],
  'settings.site:write': ['settings.site:read'],
  'settings.legal:publish': ['settings.legal:read'],
  'settings.ipAccess:write': ['settings.ipAccess:read'],
} as const

export const permissions = definePermissions(
  {
    USERS_READ: 'org.users:read',
    USERS_WRITE: 'org.users:write',
    USERS_DELETE: 'org.users:delete',
    ROLES_READ: 'org.roles:read',
    ROLES_WRITE: 'org.roles:write',
    TEAMS_READ: 'org.teams:read',
    TEAMS_WRITE: 'org.teams:write',
    SESSIONS_READ: 'sessions:read',
    SESSIONS_WRITE: 'sessions:write',
    SITE_READ: 'settings.site:read',
    SITE_WRITE: 'settings.site:write',
    SECURITY_READ: 'settings.security:read',
    LEGAL_READ: 'settings.legal:read',
    LEGAL_PUBLISH: 'settings.legal:publish',
    IP_ACCESS_READ: 'settings.ipAccess:read',
    IP_ACCESS_WRITE: 'settings.ipAccess:write',
    AUDIT_LOG_READ: 'settings.auditLog:read',
  },
  { implies: IMPLIES },
)

export const P = permissions.PERMISSIONS
export type Permission = PermissionOf<typeof permissions>
```

`SCRATCH/shared/fixtures.ts`:

```ts
// 확인용 시드 값 — 가짜 서버 시드(fake-data.ts)와 같은 모양. akss 시드 · aksv 실험 미들웨어 · 팀 화면이 함께 쓴다.

/** 2^53 + 1 — 화면에 그대로 보이면 bigint 래퍼 코덱이 실물로 도는 것이다 */
export const ADMIN_NO = 9007199254740993n
export const ADMIN = { userId: 'admin', password: 'admin1234', userName: '김관리' } as const
export const OTHER = { userId: 'other', password: 'other1234', userName: '다른관리' } as const

export const TEAM = {
  HQ: 1n,
  SUPPORT_DIV: 2n,
  SALES_DIV: 3n,
  DEV_DIV: 4n,
  HR: 5n,
  FINANCE: 6n,
  SYSTEM: 7n,
  SALES1: 8n,
  SALES2: 9n,
  SALES_PLAN: 10n,
  DEV1: 11n,
  DEV2: 12n,
  QA: 13n,
  FRONT: 14n,
  BACK: 15n,
  SECURITY: 16n,
  PARTNER: 17n,
  GLOBAL: 18n,
  JAPAN: 19n,
  USA: 20n,
} as const

export interface TeamSeed {
  teamNo: bigint
  teamName: string
  displayOrder: number
  parent: bigint | null
}

/** 부모가 자식보다 먼저. 형제 순서 값에 빈 번호(0 · 5 · 9 …)를 둔다 — 화면은 displayOrder 로 정렬해야 한다 */
export const TEAMS: readonly TeamSeed[] = [
  { teamNo: 18n, teamName: '해외법인', displayOrder: 10, parent: null },
  { teamNo: 20n, teamName: '미국지사', displayOrder: 9, parent: 18n },
  { teamNo: 19n, teamName: '일본지사', displayOrder: 0, parent: 18n },
  { teamNo: 1n, teamName: '본사', displayOrder: 0, parent: null },
  { teamNo: 2n, teamName: '경영지원본부', displayOrder: 0, parent: 1n },
  { teamNo: 5n, teamName: '인사팀', displayOrder: 0, parent: 2n },
  { teamNo: 6n, teamName: '재무팀', displayOrder: 5, parent: 2n },
  { teamNo: 7n, teamName: '시스템', displayOrder: 9, parent: 2n },
  { teamNo: 3n, teamName: '영업본부', displayOrder: 5, parent: 1n },
  { teamNo: 8n, teamName: '영업1팀', displayOrder: 0, parent: 3n },
  { teamNo: 9n, teamName: '영업2팀', displayOrder: 5, parent: 3n },
  { teamNo: 10n, teamName: '영업기획팀', displayOrder: 9, parent: 3n },
  { teamNo: 4n, teamName: '개발본부', displayOrder: 9, parent: 1n },
  { teamNo: 11n, teamName: '개발1팀', displayOrder: 0, parent: 4n },
  { teamNo: 14n, teamName: '프론트엔드', displayOrder: 0, parent: 11n },
  { teamNo: 15n, teamName: '백엔드', displayOrder: 5, parent: 11n },
  { teamNo: 12n, teamName: '개발2팀', displayOrder: 5, parent: 4n },
  { teamNo: 13n, teamName: 'QA팀', displayOrder: 9, parent: 4n },
  { teamNo: 16n, teamName: '보안팀', displayOrder: 12, parent: 1n },
  { teamNo: 17n, teamName: '외부 협력사', displayOrder: 20, parent: 1n },
]

export interface RoleSeed {
  roleNo: bigint
  roleName: string
  displayOrder: number
  isDefault: boolean
  permissions: readonly string[]
}

/** 순서 값에 빈 번호(0 · 5 · 9 · 12 · 20) — API 로는 못 만드는 모양이라 DB 에 직접 넣는다 */
export const ROLES: readonly RoleSeed[] = [
  { roleNo: 1n, roleName: '최고 관리자', displayOrder: 0, isDefault: false, permissions: ['*'] },
  {
    roleNo: 2n,
    roleName: '운영 관리자',
    displayOrder: 5,
    isDefault: false,
    permissions: [
      'org.users:read',
      'org.users:write',
      'org.roles:read',
      'org.roles:write',
      'org.teams:read',
      'org.teams:write',
      'sessions:read',
      'settings.site:read',
    ],
  },
  {
    roleNo: 3n,
    roleName: '조회 전용',
    displayOrder: 9,
    isDefault: true,
    permissions: [
      'org.users:read',
      'org.roles:read',
      'org.teams:read',
      'sessions:read',
      'settings.site:read',
    ],
  },
  { roleNo: 4n, roleName: '권한 없음', displayOrder: 12, isDefault: false, permissions: [] },
  {
    roleNo: 5n,
    roleName: '고객 지원',
    displayOrder: 20,
    isDefault: false,
    permissions: ['org.users:read', 'sessions:read', 'sessions:write'],
  },
]

export const PRESET_ROLE = { all: 1n, ops: 2n, read: 3n, none: 4n } as const
export type Preset = keyof typeof PRESET_ROLE
export const PRESET_LABEL: Record<Preset, string> = {
  all: '전권',
  ops: '제한 관리자',
  read: '읽기 전용',
  none: '권한 없음',
}
```

- [ ] **Step 2: 보조 스크립트 둘을 쓴다**

`SCRATCH/stop-port.mjs`:

```js
// node stop-port.mjs 4100 — 그 포트에서 듣는 프로세스를 끝낸다(Windows netstat · taskkill)
import { execFileSync } from 'node:child_process'

const port = process.argv[2]
if (!/^\d+$/.test(port ?? '')) throw new Error('포트를 숫자로 준다: node stop-port.mjs 4100')
const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' })
const pids = new Set(
  out
    .split(/\r?\n/)
    .filter((line) => /LISTENING/.test(line) && new RegExp(`:${port}\\s`).test(line))
    .map((line) => line.trim().split(/\s+/).pop()),
)
for (const pid of pids) execFileSync('taskkill', ['/F', '/PID', pid])
console.log(pids.size ? `끝냄 ${[...pids].join(' ')}` : `${port} 에서 듣는 프로세스 없음`)
```

`SCRATCH/snapshot.mjs`:

```js
// 확인용 앱 · 서버 생성기 스냅숏 — node snapshot.mjs
// %TEMP%\aksv · akss 를 make-app.mjs · make-server.mjs 로 묶는다. 빈 폴더에서 실행하면 그 자리에 다시 풀린다.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const TEMP = 'C:/Users/kim52/AppData/Local/Temp'
const SKIP_DIRS = new Set(['node_modules', 'dist', '.vite'])
const skipFile = (name) => name.endsWith('.tgz') || name.endsWith('.log')

function walk(root, dir = root, out = {}) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(root, full, out)
    } else if (!skipFile(name)) {
      out[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf8')
    }
  }
  return out
}

for (const [folder, output] of [
  ['aksv', 'make-app.mjs'],
  ['akss', 'make-server.mjs'],
]) {
  if (!existsSync(join(TEMP, folder))) {
    console.log(folder, '없음 — 건너뜀')
    continue
  }
  const files = walk(join(TEMP, folder))
  const maker = [
    `// ${folder} 를 한 번에 만든다: 빈 폴더에서 node ${output} (tarball 은 따로 둔다)`,
    "import { mkdirSync, writeFileSync } from 'node:fs'",
    "import { dirname } from 'node:path'",
    `const files = ${JSON.stringify(files)}`,
    'for (const [path, text] of Object.entries(files)) {',
    '  mkdirSync(dirname(path), { recursive: true })',
    '  writeFileSync(path, text)',
    '}',
    "console.log(Object.keys(files).length + '개 파일')",
    '',
  ].join('\n')
  writeFileSync(new URL(`./${output}`, import.meta.url), maker)
  console.log(output, Object.keys(files).length)
}
```

- [ ] **Step 3: admin-server 를 pack 하고 AKSS 틀을 만든다**

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
AKSS_SH=/c/Users/kim52/AppData/Local/Temp/akss
node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" "$AKSS_SH"
mkdir -p "$AKSS_SH/src/migrations" "$AKSS_SH/src/lab"
pnpm --filter @ssworks/admin-shared build && pnpm --filter @ssworks/admin-server build
pnpm --filter @ssworks/admin-server pack --pack-destination "$AKSS_SH"
ls "$AKSS_SH"
tar -tzf "$AKSS_SH/ssworks-admin-server-0.4.0.tgz" | grep -E "test-support|[.]test[.]js" || echo "테스트 파일 없음"
```

Expected: `ssworks-admin-server-0.4.0.tgz` 하나, 마지막 줄 `테스트 파일 없음`.

- [ ] **Step 4: AKSS 설정 파일을 쓴다**

`AKSS/package.json`:

```json
{
  "name": "akss",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@kim5257/kysely-mariadb-dialect": "^0.2.0",
    "@nestjs/common": "^12.1.2",
    "@nestjs/core": "^12.1.2",
    "@nestjs/platform-express": "^12.1.2",
    "@ssworks/admin-server": "file:./ssworks-admin-server-0.4.0.tgz",
    "@ssworks/admin-shared": "0.4.0",
    "kysely": "^0.29.6",
    "mariadb": "^3.5.4",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^24.0.0",
    "kysely-ctl": "^0.21.0",
    "typescript": "~5.9.2"
  }
}
```

`AKSS/pnpm-workspace.yaml`:

```yaml
# 오늘 공개된 @ssworks 0.4.0 이 공개 경과 시간 정책에 막히지 않게
minimumReleaseAgeExclude:
  - '@ssworks/*'
```

`AKSS/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`AKSS/.env`:

```
DB_HOST=127.0.0.1
DB_PORT=33306
DB_USER=root
DB_PASSWORD=admin-kit-test
DB_NAME=aksv
DB_SSL=true
ADMIN_JWT_SECRET=akss-real-server-check-jwt-secret-0123456789
```

`AKSS/kysely.config.ts`:

```ts
import { defineConfig } from 'kysely-ctl'
import {
  adminDbConnectionFromEnv,
  assertAdminMigrationStubs,
  assertUtcTimezone,
  createAdminKysely,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

loadDotEnv(new URL('./.env', import.meta.url))
assertUtcTimezone('마이그레이션 러너')
assertAdminMigrationStubs('src/migrations')

export default defineConfig({
  kysely: () => createAdminKysely(adminDbConnectionFromEnv()),
  migrations: { migrationFolder: 'src/migrations' },
})
```

스텁 열둘(한 줄짜리):

```bash
cd /c/Users/kim52/AppData/Local/Temp/akss
node -e "
const stubs = [['001_admin_roles','0001_roles'],['002_admin_users','0002_users'],['003_admin_teams','0003_teams'],['004_admin_team_closure','0004_team_closure'],['005_admin_team_user_map','0005_team_user_map'],['006_admin_user_employment_periods','0006_user_employment_periods'],['007_admin_sessions','0007_sessions'],['008_admin_audit_logs','0008_audit_logs'],['009_admin_guard_locks','0009_guard_locks'],['010_admin_team_tree_lock','0010_team_tree_lock'],['011_admin_legal_documents','0011_legal_documents'],['012_admin_ip_access_rules','0012_ip_access_rules']]
for (const [file, id] of stubs) require('fs').writeFileSync('src/migrations/' + file + '.ts', \"export { up, down } from '@ssworks/admin-server/migrations/\" + id + \"'\n\")
console.log(require('fs').readdirSync('src/migrations').length)"
node -e "for (const f of ['permissions.ts','fixtures.ts']) require('fs').copyFileSync(process.argv[1] + '/shared/' + f, 'src/' + f)" "C:/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad"
```

Expected: `12`.

- [ ] **Step 5: LabModule 을 쓴다**

`AKSS/src/lab/lab.module.ts`:

```ts
// 실서버 확인용 실험 장치(쓰는 쪽 B) — 가짜 서버의 "지연 · 다음 요청 실패" 를 실제 Nest 예외로 낸다.
// 예외는 패키지 예외 필터를 지나 실제 봉투가 된다(500 은 문구를 가린다). 스펙 §4.
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  InternalServerErrorException,
  Module,
  Post,
  Req,
  UnauthorizedException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { AdminReauthService, Public, SelfOnly, getAdminPrincipal } from '@ssworks/admin-server'
import type { Request } from 'express'
import { mergeMap, timer, type Observable } from 'rxjs'

export type LabDelay = 0 | 700 | 3000 | 'shuffle'
const DELAYS: readonly LabDelay[] = [0, 700, 3000, 'shuffle']

@Injectable()
export class LabState {
  delay: LabDelay = 0
  failNext: 500 | 403 | null = null

  apply(body: unknown): void {
    const input = (body ?? {}) as Record<string, unknown>
    if ('delay' in input) {
      if (!DELAYS.includes(input.delay as LabDelay)) {
        throw new BadRequestException('delay 는 0 · 700 · 3000 · shuffle 중 하나다.')
      }
      this.delay = input.delay as LabDelay
    }
    if ('failNext' in input) {
      if (input.failNext !== null && input.failNext !== 500 && input.failNext !== 403) {
        throw new BadRequestException('failNext 는 500 · 403 · null 중 하나다.')
      }
      this.failNext = input.failNext
    }
  }

  takeFailure(): 500 | 403 | null {
    const failure = this.failNext
    this.failNext = null
    return failure
  }

  delayMs(): number {
    return this.delay === 'shuffle' ? 200 + Math.floor(Math.random() * 2300) : this.delay
  }

  snapshot() {
    return {
      delay: this.delay,
      failNext: this.failNext,
      reauth: process.env.AKSS_REAUTH === 'true',
      accessTtlMs: Number(process.env.AKSS_ACCESS_TTL_MS ?? 900_000),
    }
  }
}

/** /api/admin/* 에만 — 지연은 모든 요청, 실패는 /auth/* 를 뺀 다음 요청 하나 */
@Injectable()
export class LabInterceptor implements NestInterceptor {
  constructor(private readonly state: LabState) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const path = context.switchToHttp().getRequest<Request>().path
    if (!path.startsWith('/api/admin/')) return next.handle()
    const failure = path.startsWith('/api/admin/auth/') ? null : this.state.takeFailure()
    return timer(this.state.delayMs()).pipe(
      mergeMap(() => {
        if (failure === 500) throw new InternalServerErrorException('aksv 실험 — 다음 요청 500')
        if (failure === 403) throw new ForbiddenException('권한이 없습니다.')
        return next.handle()
      }),
    )
  }
}

@Controller('lab')
export class LabController {
  constructor(
    private readonly state: LabState,
    private readonly reauth: AdminReauthService,
  ) {}

  @Public()
  @Get('state')
  read() {
    return this.state.snapshot()
  }

  @Public()
  @HttpCode(200)
  @Post('next')
  next(@Body() body: unknown) {
    this.state.apply(body)
    return this.state.snapshot()
  }

  /** 끝낼 때 — node stop-port.mjs 대신 쓸 수 있다 */
  @Public()
  @HttpCode(200)
  @Post('shutdown')
  shutdown() {
    setTimeout(() => process.exit(0), 200)
    return {}
  }

  /** 1-P6 시연 — 쓰는 쪽이 패키지 재인증 서비스를 쓰는 모양. 틀리면 403 ERR_REAUTH_REQUIRED(잠금 카운터에 더해진다) */
  @SelfOnly()
  @HttpCode(200)
  @Post('reauth')
  async check(@Req() req: Request, @Body() body: unknown) {
    const principal = getAdminPrincipal(req)
    if (principal === undefined) throw new UnauthorizedException()
    const password = (body as { currentPassword?: unknown } | null)?.currentPassword
    await this.reauth.verify(principal, typeof password === 'string' ? password : '')
    return {}
  }
}

@Module({
  providers: [LabState, { provide: APP_INTERCEPTOR, useClass: LabInterceptor }],
  controllers: [LabController],
})
export class LabModule {}
```

- [ ] **Step 6: app.module · main 을 쓴다**

`AKSS/src/app.module.ts`:

```ts
// 쓰는 쪽 앱(B) — 모듈 여덟 전부 + 실험 장치. 슬롯 → 키는 확인용 앱과 같은 카탈로그(스펙 §5-3).
import { Controller, Get, Module } from '@nestjs/common'
import {
  AdminAuditModule,
  AdminAuthModule,
  AdminIpAccessModule,
  AdminLegalModule,
  AdminRolesModule,
  AdminServerModule,
  AdminSessionsModule,
  AdminTeamsModule,
  AdminUsersModule,
  Public,
  adminDbConnectionFromEnv,
  requireEnv,
} from '@ssworks/admin-server'
import { LabModule } from './lab/lab.module.js'
import { permissions } from './permissions.js'

@Public()
@Controller('health')
class HealthController {
  @Get()
  ok() {
    return { ok: true }
  }
}

const accessTtlMs = process.env.AKSS_ACCESS_TTL_MS
  ? Number(process.env.AKSS_ACCESS_TTL_MS)
  : undefined

@Module({
  imports: [
    AdminServerModule.forRootAsync({
      useFactory: () => {
        requireEnv(['ADMIN_JWT_SECRET'])
        return {
          db: adminDbConnectionFromEnv(),
          auth: {
            jwtSecret: process.env.ADMIN_JWT_SECRET!,
            // 진짜 만료 단계(X10) — 유예는 accessTtlMs 미만이어야 한다
            ...(accessTtlMs ? { accessTtlMs, refreshGraceMs: 5000 } : {}),
          },
          permissionCatalog: permissions,
          permissions: {
            'users.read': 'org.users:read',
            'users.manage': 'org.users:write',
            'roles.read': 'org.roles:read',
            'roles.manage': 'org.roles:write',
            'teams.read': 'org.teams:read',
            'teams.manage': 'org.teams:write',
            'sessions.read': 'sessions:read',
            'sessions.manage': 'sessions:write',
            'legal.read': 'settings.legal:read',
            'legal.publish': 'settings.legal:publish',
            'ipAccess.read': 'settings.ipAccess:read',
            'ipAccess.manage': 'settings.ipAccess:write',
            'auditLogs.read': 'settings.auditLog:read',
          },
          legal: { kinds: ['TERMS', 'PRIVACY'] },
          clientIp: 'x-real-ip',
          reauth: process.env.AKSS_REAUTH === 'true',
        }
      },
    }),
    AdminAuthModule,
    AdminAuditModule,
    AdminSessionsModule,
    AdminRolesModule,
    AdminUsersModule,
    AdminTeamsModule,
    AdminLegalModule,
    AdminIpAccessModule,
    LabModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

`AKSS/src/main.ts`:

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { assertUtcTimezone, configureAdminApp, loadDotEnv } from '@ssworks/admin-server'
import { AppModule } from './app.module.js'

loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('akss')
const app = await NestFactory.create<NestExpressApplication>(AppModule)
configureAdminApp(app)
app.setGlobalPrefix('api')
app.enableShutdownHooks()
await app.listen(4100)
```

- [ ] **Step 7: 설치 · 빌드한다**

```bash
cd /c/Users/kim52/AppData/Local/Temp/akss
pnpm install
node -e "console.log(require('./node_modules/@ssworks/admin-server/package.json').peerDependencies['@ssworks/admin-shared'], require('./node_modules/@ssworks/admin-shared/package.json').version)"
pnpm build
```

Expected: `>=0.4.0 <1.0.0 0.4.0`, `tsc` 오류 0건(`skipLibCheck: false`). 타입 오류가 나면 코드가 아니라 옵션 · 이름 철자(`refreshGraceMs` · 슬롯 키)부터 본다 — 패키지 d.ts 가 정본이다.

- [ ] **Step 8: DB 를 만들고 마이그레이션한다**

```bash
docker ps --filter name=admin-kit-test-db --format "{{.Status}}"
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists aksv; create database aksv"
cd /c/Users/kim52/AppData/Local/Temp/akss
TZ=UTC npx kysely migrate latest
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test aksv -e "select cidr from ip_access_rules; select lock_name from guard_locks"
```

Expected: 컨테이너 `Up …`(아니면 메모리 노트대로 `docker start admin-kit-test-db`), 장 12개 적용, `0.0.0.0/0` · `::/0`, 가드 행 셋(`superAdminSurvival` · `teamTree` · `legalPublish`).

- [ ] **Step 9: 확인 스크립트를 쓰고 띄워 잰다**

`AKSS/check-akss.mjs`:

```js
// akss 기동 확인 — node check-akss.mjs (서버를 띄운 뒤. 20초까지 기다린다)
const base = 'http://127.0.0.1:4100/api'
const failures = []
const expect = (ok, label, detail) =>
  ok ? console.log('ok  ', label) : failures.push(`${label} ${detail ?? ''}`)

for (let i = 0; i < 40; i += 1) {
  try {
    if ((await fetch(`${base}/health`)).status === 200) break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}

const health = await fetch(`${base}/health`)
expect(health.status === 200, 'health 200', health.status)

const state = await (await fetch(`${base}/lab/state`)).json()
expect(
  state.success === true && state.data.delay === 0 && state.data.failNext === null,
  'lab state 봉투',
  JSON.stringify(state),
)
expect(
  state.data.reauth === (process.env.AKSS_REAUTH === 'true'),
  'lab state reauth 가 env 와 같다',
  JSON.stringify(state.data),
)

const me = await fetch(`${base}/admin/auth/me`)
const meBody = await me.json()
expect(
  me.status === 401 && meBody.success === false && typeof meBody.code === 'string',
  '로그인 전 /auth/me 401 봉투',
  `${me.status} ${JSON.stringify(meBody)}`,
)

const bad = await fetch(`${base}/lab/next`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ delay: 5 }),
})
expect(bad.status === 400, 'lab next 잘못된 delay 400', bad.status)

if (failures.length) {
  console.error('FAIL\n' + failures.join('\n'))
  process.exitCode = 1
} else console.log('akss OK')
```

서버를 띄운다(Bash `run_in_background: true`):

```bash
cd /c/Users/kim52/AppData/Local/Temp/akss && TZ=UTC node dist/main.js > server.log 2>&1
```

그다음 포그라운드에서:

```bash
cd /c/Users/kim52/AppData/Local/Temp/akss && node check-akss.mjs; grep -iE "error|warn" server.log | head -5
```

Expected: `ok` 넷과 `akss OK`. `server.log` 에 기동 오류가 없다(IP 진단 경고 "global 층 IP 규칙이 없다" 가 보이면 Step 8 을 다시 본다).

- [ ] **Step 10: 스냅숏**

```bash
cd /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad && node snapshot.mjs
```

Expected: `aksv 없음 — 건너뜀`, `make-server.mjs <파일 수>`.

---

### Task 2: 시드 — DB 직접(①) · API(②) · 확인

**Files:**

- Create: `AKSS/src/seed.ts`, `AKSS/seed-api.mjs`, `AKSS/check-seed.mjs`, `SCRATCH/reseed.sh`

**Interfaces:**

- Consumes: `ROLES` · `TEAMS` · `TEAM` · `ADMIN` · `OTHER` · `ADMIN_NO`(Task 1 `fixtures.ts`), `permissions.normalize`
- Produces: DB `aksv` — 역할 5(번호 1~5) · 팀 20(번호 1~20) · admin(`9007199254740993`) · other(`9007199254740994`) · user001~200(그 뒤 번호) · 퇴사 11(17의 배수, 어제 퇴사) · 세션(admin 4 + 사용자 ~39)
- Produces: `bash SCRATCH/reseed.sh` — akss 끄기 → DB 지우고 새로 → migrate → 시드 ① → akss 띄우기 → 시드 ② → 확인. **시드는 언제나 이 스크립트로 처음부터**(Review Focus 5)

- [ ] **Step 1: 시드 ① 을 쓴다**

`AKSS/src/seed.ts`:

```ts
// 확인용 시드 ① — API 로 못 만드는 모양만 DB 에 직접: 역할 순서 빈 번호 · 팀 closure · 2^53 넘는 사용자 번호(스펙 §5).
// 넣는 모양은 API 의 사용자 만들기(users.service.ts 195-234)와 팀 만들기(teams.service.ts 103-109)를 그대로 따른다.
import {
  adminDbConnectionFromEnv,
  assertUtcTimezone,
  createAdminKysely,
  hashPassword,
  loadDotEnv,
} from '@ssworks/admin-server/runner'
import { ADMIN, ADMIN_NO, OTHER, ROLES, TEAM, TEAMS } from './fixtures.js'
import { permissions } from './permissions.js'

loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('seed')

/** 입사일 2019-01-02 의 기준 시간대(Asia/Seoul) 0시 — users.joinAt 캐시 */
const JOIN_AT = new Date('2019-01-01T15:00:00.000Z')
/** userEmploymentPeriods.joinAt(DATE) */
const JOIN_DATE = new Date('2019-01-02T00:00:00.000Z')

const parentOf = new Map(TEAMS.map((team) => [team.teamNo, team.parent]))
function ancestorsOf(teamNo: bigint): bigint[] {
  const chain: bigint[] = []
  let current = parentOf.get(teamNo) ?? null
  while (current !== null) {
    chain.push(current)
    current = parentOf.get(current) ?? null
  }
  return chain
}

const accounts = [
  {
    userNo: ADMIN_NO,
    ...ADMIN,
    hash: await hashPassword(ADMIN.password),
    teamNo: TEAM.SUPPORT_DIV as bigint | null,
  },
  {
    userNo: ADMIN_NO + 1n,
    ...OTHER,
    hash: await hashPassword(OTHER.password),
    teamNo: null as bigint | null,
  },
]

const db = createAdminKysely(adminDbConnectionFromEnv())
try {
  await db.transaction().execute(async (trx) => {
    for (const role of ROLES) {
      await trx
        .insertInto('roles')
        .values({
          roleNo: role.roleNo,
          roleName: role.roleName,
          permissions: JSON.stringify(permissions.normalize(role.permissions)),
          displayOrder: role.displayOrder,
          isDefault: role.isDefault,
        })
        .execute()
    }
    for (const team of TEAMS) {
      await trx
        .insertInto('teams')
        .values({ teamNo: team.teamNo, teamName: team.teamName, displayOrder: team.displayOrder })
        .execute()
      const closure = [
        { ancestorNo: team.teamNo, descendantNo: team.teamNo, depth: 0 },
        ...ancestorsOf(team.teamNo).map((ancestorNo, index) => ({
          ancestorNo,
          descendantNo: team.teamNo,
          depth: index + 1,
        })),
      ]
      await trx.insertInto('teamClosure').values(closure).execute()
    }
    // 🔴 admin 을 명시 번호로 넣으면 InnoDB 가 AUTO_INCREMENT 를 그 위로 올린다 — 이후 API 가 만든 번호도 2^53 을 넘는다
    for (const account of accounts) {
      await trx
        .insertInto('users')
        .values({
          userNo: account.userNo,
          userId: account.userId,
          password: account.hash,
          userName: account.userName,
          roleNo: 1n,
          joinAt: JOIN_AT,
        })
        .execute()
      if (account.teamNo !== null) {
        await trx
          .insertInto('teamUserMap')
          .values({ teamNo: account.teamNo, userNo: account.userNo })
          .execute()
      }
      await trx
        .insertInto('userEmploymentPeriods')
        .values({
          userNo: account.userNo,
          joinAt: JOIN_DATE,
          resignAt: null,
          reason: null,
          recordedTimezone: 'UTC',
          createdBy: null,
        })
        .execute()
    }
  })
  console.log(`시드 ① 끝 — 역할 ${ROLES.length} · 팀 ${TEAMS.length} · 계정 admin · other`)
} finally {
  await db.destroy()
}
```

- [ ] **Step 2: 빌드해 타입을 맞춘다**

```bash
cd /c/Users/kim52/AppData/Local/Temp/akss && pnpm build
```

Expected: 오류 0건. 칸 이름 오류가 나면 `node_modules/@ssworks/admin-server/dist/database/tables/*.d.ts` 의 칸 이름을 따른다(사전 확인 표의 이름이 정본과 다르면 정본이 이긴다).

- [ ] **Step 3: 시드 ② 를 쓴다**

`AKSS/seed-api.mjs`:

```js
// 확인용 시드 ② — 앞문(API)으로: 사용자 200 · 퇴사 · 세션(스펙 §5-2). akss 가 4100 에 떠 있어야 한다.
// 이름 · 팀 · 역할 · 입사일 공식은 가짜 서버 시드(fake-data.ts)와 같다 — 체크리스트 기대값(130명 · user013 …)이 그대로 산다.
import { parseJSON, stringifyJSON } from '@ssworks/admin-shared'

const base = 'http://127.0.0.1:4100/api/admin'
const SURNAMES = [
  '김',
  '이',
  '박',
  '최',
  '정',
  '강',
  '조',
  '윤',
  '장',
  '임',
  '한',
  '오',
  '서',
  '신',
  '권',
  '황',
  '안',
  '송',
  '류',
  '홍',
]
const GIVEN = [
  '민준',
  '서연',
  '도윤',
  '서윤',
  '예준',
  '지우',
  '하준',
  '하은',
  '주원',
  '지호',
  '지민',
  '수아',
  '은우',
  '지아',
  '건우',
  '윤서',
  '우진',
  '채원',
  '선우',
  '다은',
  '현우',
  '소율',
  '유준',
  '예린',
  '정우',
  '가은',
  '시우',
  '나연',
  '승현',
  '유나',
  '준서',
]
const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  whale:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Whale/3.26.244.21 Safari/537.36',
  chromeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
}
const OTHER_UAS = [UA.chromeWin, UA.edgeWin, UA.firefoxLinux, UA.chromeMac, UA.iphone, UA.samsung]

function teamOf(i) {
  if (i <= 130) return 3n // 영업본부
  if (i <= 142) return 8n // 영업1팀
  if (i <= 150) return 9n // 영업2팀
  if (i <= 158) return 5n // 인사팀
  if (i <= 165) return 6n // 재무팀
  if (i <= 175) return 11n // 개발1팀
  if (i <= 180) return 14n // 프론트엔드
  if (i <= 185) return 15n // 백엔드
  if (i <= 190) return 13n // QA팀
  if (i <= 195) return 16n // 보안팀
  return 12n // 개발2팀
}
const joinDate = (i) =>
  new Date(Date.UTC(2019, 0, 7) + ((i * 97) % 2800) * 86_400_000).toISOString().slice(0, 10)
/** 기준 시간대(KST) 의 오늘 + offset 일 */
const kstDate = (offset) =>
  new Date(Date.now() + 9 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)
const userIdOf = (i) => `user${String(i).padStart(3, '0')}`

async function send(method, path, { body, cookie, ua = 'aksv-seed', ip = '127.0.0.1' } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'user-agent': ua,
      'x-real-ip': ip,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : stringifyJSON(body),
  })
  const text = await res.text()
  return {
    status: res.status,
    json: text ? parseJSON(text) : null,
    cookie: res.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; '),
  }
}
function must(result, label) {
  if (result.status >= 300)
    throw new Error(`${label} ${result.status} ${JSON.stringify(result.json)}`)
  return result.json.data
}
async function login(userId, password, options) {
  const result = await send('POST', '/auth/login', { body: { userId, password }, ...options })
  must(result, `로그인 ${userId}`)
  return result.cookie
}

const started = Date.now()
const other = await login('other', 'other1234')
const created = new Map()
for (let i = 1; i <= 200; i += 1) {
  const data = must(
    await send('POST', '/users', {
      cookie: other,
      body: {
        userId: userIdOf(i),
        userName: `${SURNAMES[i % SURNAMES.length]}${GIVEN[(i * 7) % GIVEN.length]}`,
        roleNo: i % 9 === 0 ? 2n : 3n,
        teamNo: teamOf(i),
        joinDate: joinDate(i),
      },
    }),
    userIdOf(i),
  )
  created.set(i, { userNo: data.item.userNo, password: data.temporaryPassword })
}

// 퇴사 — 어제까지 근무 → 효력 시각(오늘 0시 KST)이 지나 지금 퇴사 상태
let resigned = 0
for (let i = 17; i <= 200; i += 17) {
  must(
    await send('POST', `/users/${created.get(i).userNo}/resign`, {
      cookie: other,
      body: { resignDate: kstDate(-1), reason: 'aksv 시드' },
    }),
    `퇴사 ${userIdOf(i)}`,
  )
  resigned += 1
}

// 세션 — admin 4(기기 · IP 가지가지 — 빈 User-Agent 는 "기기 정보 없음") + 사용자(퇴사자는 로그인이 막혀 건너뛴다)
const ADMIN_SESSIONS = [
  [UA.iphone, '198.51.100.23'],
  [UA.samsung, '198.51.100.77'],
  [UA.whale, '192.0.2.44'],
  ['', '203.0.113.200'],
]
for (const [ua, ip] of ADMIN_SESSIONS) await login('admin', 'admin1234', { ua, ip })
let userSessions = 0
for (let i = 1; i <= 42; i += 1) {
  const index = ((i * 13) % 200) + 1
  if (index % 17 === 0) continue
  await login(userIdOf(index), created.get(index).password, {
    ua: OTHER_UAS[i % OTHER_UAS.length],
    ip: `10.0.${i % 7}.${(i * 11) % 250}`,
  })
  userSessions += 1
}
console.log(
  `시드 ② 끝 — 사용자 200 · 퇴사 ${resigned} · 세션 admin ${ADMIN_SESSIONS.length} + 사용자 ${userSessions} · ${Math.round((Date.now() - started) / 1000)}초`,
)
```

- [ ] **Step 4: 확인 스크립트를 쓴다**

`AKSS/check-seed.mjs`:

```js
// 시드 확인 — node check-seed.mjs (akss 가 떠 있고 시드 ①② 가 끝난 뒤)
import { parseJSON, stringifyJSON } from '@ssworks/admin-shared'

const base = 'http://127.0.0.1:4100/api'
const failures = []
const expect = (ok, label, detail) =>
  ok ? console.log('ok  ', label) : failures.push(`${label} ${detail ?? ''}`)

async function send(method, path, { body, cookie } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '127.0.0.1',
      'user-agent': 'aksv-check',
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : stringifyJSON(body),
  })
  const text = await res.text()
  return {
    status: res.status,
    json: text ? parseJSON(text) : null,
    cookie: res.headers
      .getSetCookie()
      .map((l) => l.split(';')[0])
      .join('; '),
  }
}
async function login(userId, password) {
  const r = await send('POST', '/admin/auth/login', { body: { userId, password } })
  if (r.status !== 200) throw new Error(`로그인 ${userId} ${r.status} ${JSON.stringify(r.json)}`)
  return r.cookie
}
const countNodes = (nodes) => nodes.reduce((n, node) => n + 1 + countNodes(node.children ?? []), 0)

const other = await login('other', 'other1234')
const roles = (await send('GET', '/admin/roles', { cookie: other })).json.data.items
expect(
  JSON.stringify(roles.map((r) => r.displayOrder)) === '[0,5,9,12,20]',
  '역할 순서 값',
  JSON.stringify(roles.map((r) => r.displayOrder)),
)
expect(roles.find((r) => r.isDefault)?.roleName === '조회 전용', '기본 역할 조회 전용')

const tree = (await send('GET', '/admin/teams/tree', { cookie: other })).json.data.items
expect(countNodes(tree) === 20, '팀 20', countNodes(tree))

const all = (await send('GET', '/admin/users?itemsPerPage=1', { cookie: other })).json.data
expect(all.total === 202n, '사용자 202(퇴사 포함)', all.total)
const resigned = (
  await send('GET', '/admin/users?itemsPerPage=1&filter%5Bstatus%5D=resigned', { cookie: other })
).json.data
expect(resigned.total === 11n, '퇴사 11', resigned.total)
const sales = (
  await send('GET', '/admin/users?itemsPerPage=1&filter%5BteamNo%5D=BigInt(3)', { cookie: other })
).json.data
expect(sales.total === 130n, '영업본부 직속 130', sales.total)

const admin = await login('admin', 'admin1234')
const me = (await send('GET', '/admin/auth/me', { cookie: admin })).json.data
expect(
  me.userNo === 9007199254740993n &&
    me.teamName === '경영지원본부' &&
    me.roleName === '최고 관리자',
  'admin /auth/me',
  stringifyJSON(me),
)

const sessions = (await send('GET', '/admin/sessions?itemsPerPage=1', { cookie: other })).json.data
expect(sessions.total >= 40n, '세션 40 이상', sessions.total)

const rules = (await send('GET', '/admin/ip-access', { cookie: other })).json.data.items
expect(
  rules
    .filter((r) => r.scopeType === 'global')
    .map((r) => r.cidr)
    .sort()
    .join(' ') === '0.0.0.0/0 ::/0',
  'global 허용 둘',
  JSON.stringify(rules),
)

// 실험 — 실제 봉투
await send('POST', '/lab/next', { body: { failNext: 500 } })
const r500 = await send('GET', '/admin/roles', { cookie: other })
expect(
  r500.status === 500 &&
    r500.json.code === 'ERR_COMMON_INTERNAL' &&
    r500.json.message === '서버 내부 오류가 발생했습니다.',
  '다음 요청 500 봉투(문구 가림)',
  JSON.stringify(r500.json),
)
await send('POST', '/lab/next', { body: { failNext: 403 } })
const r403 = await send('GET', '/admin/roles', { cookie: other })
expect(
  r403.status === 403 &&
    r403.json.code === 'ERR_COMMON_FORBIDDEN' &&
    r403.json.message === '권한이 없습니다.',
  '다음 요청 403 봉투',
  JSON.stringify(r403.json),
)

// 재인증 시연 라우트 — 틀림 403 → 맞음 200(카운터 되돌림, Review Focus 2)
const wrong = await send('POST', '/lab/reauth', {
  cookie: admin,
  body: { currentPassword: 'wrong-pass-1' },
})
expect(
  wrong.status === 403 && wrong.json.code === 'ERR_REAUTH_REQUIRED',
  'lab reauth 틀림 403',
  JSON.stringify(wrong.json),
)
const right = await send('POST', '/lab/reauth', {
  cookie: admin,
  body: { currentPassword: 'admin1234' },
})
expect(right.status === 200, 'lab reauth 맞음 200', right.status)

if (failures.length) {
  console.error('FAIL\n' + failures.join('\n'))
  process.exitCode = 1
} else console.log('시드 OK')
```

`SCRATCH/reseed.sh`:

```bash
#!/usr/bin/env bash
# 시드는 언제나 처음부터 — akss 끄기 → DB 새로 → migrate → 시드 ① → akss 띄우기(백그라운드) → 시드 ② → 확인
# 쓰는 법: bash reseed.sh   (akss 는 이 스크립트가 띄운 채로 남는다. env AKSS_REAUTH · AKSS_ACCESS_TTL_MS 를 그대로 넘긴다)
set -euo pipefail
SCRATCH="$(cd "$(dirname "$0")" && pwd)"
AKSS=/c/Users/kim52/AppData/Local/Temp/akss
node "$SCRATCH/stop-port.mjs" 4100
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists aksv; create database aksv"
cd "$AKSS"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
(TZ=UTC nohup node dist/main.js > server.log 2>&1 &)
node check-akss.mjs
node seed-api.mjs
node check-seed.mjs
```

- [ ] **Step 5: 시드를 돈다**

```bash
bash /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad/reseed.sh
```

Expected: `akss OK`, `시드 ② 끝 — 사용자 200 · 퇴사 11 · 세션 admin 4 + 사용자 3x · …초`, `ok` 열셋과 `시드 OK`. `nohup … &` 로 띄운 akss 가 셸이 끝난 뒤에도 남는지 `node check-akss.mjs` 로 한 번 더 본다 — 남지 않으면 Task 1 Step 9 처럼 `run_in_background` 로 다시 띄운다(그 경우 reseed.sh 의 띄우기 줄을 지우고 사람이 띄우는 순서로 바꾼다).

- [ ] **Step 6: 스냅숏**

```bash
cd /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad && node snapshot.mjs
```

---

### Task 3: aksv — 실험 장치(프록시 · 미들웨어 · 클라이언트 · 패널)

**Files:**

- Create: `AKSV/**`(SCRATCH/aksv 를 복사), `AKSV/pnpm-workspace.yaml`(덮어씀), `AKSV/src/plugins/confirm.ts`, `AKSV/src/permissions.ts`(덮어씀) · `AKSV/src/fixtures.ts`, `AKSV/lab/plugin.ts`, `AKSV/lab/other-admin.ts`, `AKSV/check-aksv.mjs`
- Modify: `AKSV/package.json`, `AKSV/vite.config.ts`, `AKSV/src/api/client.ts`, `AKSV/src/stores/app.ts`, `AKSV/src/state/lab.ts`, `AKSV/src/components/LabPanel.vue`, `AKSV/src/pages/TeamsPage.vue:16`, `AKSV/src/pages/settings/RolesPage.vue:69`
- Delete: `AKSV/src/api/fake-server.ts`, `AKSV/src/api/fake-data.ts`

**Interfaces:**

- Consumes: Task 1 `/api/lab/*` · 공용 파일, Task 2 계정 · 시드
- Produces: `GET /__lab/state` → `{ip, dropAccess, lastSetCookie[], lastSetCookieUrl, lastSetCookieAt, prevRefresh: '있음'|null, prevRefreshAt, server: {status, body}}`; `POST /__lab/ip {ip}` · `/expire-access` · `/replay-refresh` · `/next {delay?, failNext?}` · `/other-forget` · `/other/<action>` → `{status, body}`; `GET /__lab/audit?action=&limit=`
- Produces: other 동작 — `role-preset {preset}` · `bump-user {userNo}` · `bump-roles` · `reset-password {userId}` · `unlock {userId}` · `revoke-sessions {userId}` · `ip-rule {on}` · `team-ip-rule {teamNo, on}` · `publish-legal {kind}` · `restore-roles`
- Produces: `lab`(state/lab.ts) — `open` · `reauth` · `groupMode` · `log: LabLogEntry[]`(`seq, at, method, path, status, ms, code?, envelope?, refresh, retry`) · 개발 서버에서 `window.__aksvLab`

- [ ] **Step 1: 지난 앱을 복사하고 가짜를 지운다**

```bash
SCRATCH_SH=/c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad
AKSV_SH=/c/Users/kim52/AppData/Local/Temp/aksv
node -e "const fs = require('fs'); fs.rmSync(process.argv[2], { recursive: true, force: true }); fs.cpSync(process.argv[1], process.argv[2], { recursive: true }); for (const f of ['src/api/fake-server.ts', 'src/api/fake-data.ts']) fs.rmSync(process.argv[2] + '/' + f); for (const f of ['permissions.ts', 'fixtures.ts']) fs.copyFileSync(process.argv[3] + '/shared/' + f, process.argv[2] + '/src/' + f)" "$SCRATCH_SH/aksv" "$AKSV_SH" "$SCRATCH_SH"
mkdir -p "$AKSV_SH/lab"
ls "$AKSV_SH/src/api" "$AKSV_SH/src"
```

Expected: `src/api` 에 `client.ts` 만, `src` 에 `fixtures.ts` · `permissions.ts`.

- [ ] **Step 2: 패키지 · 설정을 바꾼다**

`AKSV/package.json` — `name` 과 의존성 두 줄만 바꾼다:

```json
  "name": "aksv",
```

```json
    "@ssworks/admin-shared": "0.4.0",
    "@ssworks/admin-ui": "0.4.0",
```

`AKSV/pnpm-workspace.yaml`(덮어씀):

```yaml
allowBuilds:
  vue-demi: false
# 오늘 공개된 @ssworks 0.4.0 이 공개 경과 시간 정책에 막히지 않게
minimumReleaseAgeExclude:
  - '@ssworks/*'
```

`AKSV/vite.config.ts`(덮어씀):

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'
import { labPlugin } from './lab/plugin'

// 🔴 /api 는 실험 플러그인의 프록시로 akss(4100)에 간다. 포트 5199 고정 — 플러그인이 정한다.
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true }), labPlugin()],
})
```

`AKSV/src/plugins/confirm.ts`(README 최소 배선 — 지난 생성기에서 빠졌던 파일):

```ts
// README 최소 배선 그대로 — 이탈 확인을 킷 확인 창으로(App.vue 의 <AdminConfirm /> 와 한 벌)
import { createConfirm } from '@ssworks/admin-ui'

export const confirm = createConfirm()
```

- [ ] **Step 3: 실험 상태와 클라이언트를 바꾼다**

`AKSV/src/state/lab.ts`(덮어씀):

```ts
// 실험 패널 상태 — 화면 쪽 설정과 요청 기록. 앱 모듈을 import 하지 않는다(순환 0).
import { reactive, watch } from 'vue'

export type DelayMode = 0 | 700 | 3000 | 'shuffle'

export interface LabLogEntry {
  seq: number
  at: string
  method: string
  path: string
  status: number
  ms: number
  code?: string
  /** 오류 응답이 {success:false, code, message} 봉투였나(X9) */
  envelope?: boolean
  refresh: boolean
  retry: boolean
}

interface LabSettings {
  open: boolean
  reauth: boolean
  groupMode: 'subheader' | 'collapsible'
}

const KEY = 'aksv-lab'

function readSettings(): Partial<LabSettings> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Partial<LabSettings>
  } catch {
    return {}
  }
}

const saved = readSettings()

export const lab = reactive({
  open: saved.open ?? true,
  /** 화면 재인증 — akss 의 AKSS_REAUTH 와 맞춘다(패널이 어긋나면 경고한다) */
  reauth: saved.reauth ?? false,
  groupMode: saved.groupMode ?? ('subheader' as 'subheader' | 'collapsible'),
  log: [] as LabLogEntry[],
})

watch(
  () => [lab.open, lab.reauth, lab.groupMode],
  () => {
    try {
      const settings: LabSettings = { open: lab.open, reauth: lab.reauth, groupMode: lab.groupMode }
      sessionStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      // 저장 못 해도 이번 화면에는 영향이 없다
    }
  },
)

let seq = 0

export function nextSeq(): number {
  seq += 1
  return seq
}

export function pushLog(entry: LabLogEntry): void {
  lab.log.unshift(entry)
  if (lab.log.length > 300) lab.log.length = 300
}

// 🔴 자동 확인(claude-in-chrome)이 요청 기록을 읽는 창 — 개발 서버에서만
if (import.meta.env.DEV) (window as unknown as { __aksvLab?: typeof lab }).__aksvLab = lab
```

`AKSV/src/api/client.ts`(덮어씀):

```ts
// README 최소 배선 + 「Phase 2 서버」 예제의 경로 규약(baseURL '/api', 경로 '/admin/…').
// 바꾼 것: 가짜 어댑터 대신 실제 어댑터를 감싸 요청 기록을 남긴다(실험 패널) — 401 · 갱신 · 재시도가 모두 한 줄씩 보인다.
// 🔴 라우터 · 스토어를 import 하지 않는다.
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { createApiClient } from '@ssworks/admin-ui'
import { toast } from '../plugins/toast'
import { ipBlock } from '../state/ip-block'
import { nextSeq, pushLog } from '../state/lab'

const REFRESH_PATH = '/admin/auth/refresh'

export const client = createApiClient({
  baseURL: '/api',
  refreshPath: REFRESH_PATH,
  noRetryPaths: ['/admin/auth/login'],
  // 🔴 onError 는 한 매크로태스크 뒤에 불리고, 호출처가 화면에 직접 보인 오류(`error.handled`)는 오지 않는다.
  onError: (error) => {
    // IP 차단은 토스트가 아니라 App.vue 의 IpBlockedDialog 가 알린다.
    if (error.code === 'ERR_IP_NOT_ALLOWED') {
      ipBlock.blocked = true
      ipBlock.ip = (error.details as { clientIp?: string } | undefined)?.clientIp ?? ''
      return
    }
    // 🔴 401 은 토스트하지 않는다 — 갱신까지 실패한 401 은 "로그인 필요" 라는 정상 경로다.
    if (error.status === 401) return
    toast.error(error.message)
  },
})

/** 어댑터 단계의 응답 본문은 아직 글이다 — 봉투 모양과 code 만 읽는다 */
function envelopeOf(data: unknown): { code?: string; envelope: boolean } {
  if (typeof data !== 'string') return { envelope: false }
  try {
    const body = JSON.parse(data) as Record<string, unknown>
    return {
      code: typeof body.code === 'string' ? body.code : undefined,
      envelope:
        body.success === false && typeof body.code === 'string' && typeof body.message === 'string',
    }
  } catch {
    return { envelope: false }
  }
}

const real: AxiosAdapter = axios.getAdapter(client.axios.defaults.adapter)

client.axios.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
  const seq = nextSeq()
  const started = performance.now()
  const entry = {
    seq,
    at: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
    method: (config.method ?? 'get').toUpperCase(),
    path: client.axios.getUri(config).replace(/^https?:\/\/[^/]+/, ''),
    refresh: config.url === REFRESH_PATH,
    retry: (config as { _retry?: boolean })._retry === true,
  }
  try {
    const response = await real(config)
    pushLog({ ...entry, status: response.status, ms: Math.round(performance.now() - started) })
    return response
  } catch (error) {
    if (error instanceof AxiosError) {
      pushLog({
        ...entry,
        status: error.response?.status ?? 0,
        ms: Math.round(performance.now() - started),
        ...envelopeOf(error.response?.data),
      })
    }
    throw error
  }
}

export const { api } = client
```

`AKSV/src/stores/app.ts` — 경로 셋만 `/admin` 을 붙인다:

```ts
  fetchMe: () => api.get<AdminUserInfo>('/admin/auth/me'),
```

```ts
await api.post('/admin/auth/login', credentials)
```

```ts
await api.post('/admin/auth/logout')
```

`AKSV/src/pages/TeamsPage.vue:16` 한 줄(나머지는 Task 4):

```ts
import { TEAM } from '../fixtures'
```

`AKSV/src/pages/settings/RolesPage.vue:68-69`:

```ts
// 역할 재인증은 화면을 열 때 정한다 — 서버(AKSS_REAUTH)와 맞추고, 바꾸면 역할 화면을 다시 연다(R13)
const reauth = lab.reauth
```

- [ ] **Step 4: 다른 관리자를 쓴다**

`AKSV/lab/other-admin.ts`:

```ts
// '다른 관리자' — 계정 other 로 실서버 API 를 부른다. 브라우저 쿠키와 따로 논다(스펙 §7).
// 🔴 실패를 숨기지 않는다 — { status, body } 를 그대로 돌려 패널이 보인다(Review Focus 3).
import { parseJSON, stringifyJSON } from '@ssworks/admin-shared'
import { ADMIN_NO, OTHER, PRESET_ROLE, ROLES, type Preset } from '../src/fixtures'

export interface LabResult {
  status: number
  body: unknown
}

interface Revisioned {
  revision: number
}
interface UserItem extends Revisioned {
  userNo: bigint
  userId: string
  userName: string
}
interface RoleItem extends Revisioned {
  roleNo: bigint
  roleName: string
}
interface RuleItem extends Revisioned {
  ruleNo: bigint
  scopeType: string
  scopeRefNo: bigint | null
}

const dataOf = <T>(result: LabResult) => (result.body as { data: T }).data
/** 재인증이 꺼진 서버는 currentPassword 를 버린다 — 켜진 단계에서도 그대로 통한다 */
const withReauth = <T extends object>(body: T) => ({ ...body, currentPassword: OTHER.password })
/** revision 을 올리려고 이름 끝 표시를 붙였다 뗀다 */
const toggleMark = (name: string) => (name.endsWith(' ·') ? name.slice(0, -2) : `${name} ·`)

export class OtherAdmin {
  private cookie = ''

  constructor(private readonly base: string) {}

  private async send(method: string, path: string, body?: unknown): Promise<LabResult> {
    const res = await fetch(`${this.base}/api/admin${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-real-ip': '127.0.0.1',
        'user-agent': 'aksv-lab (other)',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : stringifyJSON(body),
    })
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text ? parseJSON(text) : null
    } catch {
      // 봉투가 아니면 글 그대로
    }
    if (path === '/auth/login' && res.status === 200) {
      this.cookie = res.headers
        .getSetCookie()
        .map((line) => line.split(';')[0])
        .join('; ')
    }
    return { status: res.status, body: parsed }
  }

  async login(): Promise<LabResult> {
    this.cookie = ''
    return this.send('POST', '/auth/login', { userId: OTHER.userId, password: OTHER.password })
  }

  /** 401 이면 다시 로그인해 한 번 더 — 그래도 실패면 그 결과 그대로 */
  async call(method: string, path: string, body?: unknown): Promise<LabResult> {
    if (!this.cookie) {
      const logged = await this.login()
      if (logged.status !== 200) return logged
    }
    const first = await this.send(method, path, body)
    if (first.status !== 401) return first
    const logged = await this.login()
    if (logged.status !== 200) return logged
    return this.send(method, path, body)
  }

  forgetCookie(): void {
    this.cookie = ''
  }
}

async function userNoOf(other: OtherAdmin, userId: string): Promise<bigint | LabResult> {
  if (userId === 'admin') return ADMIN_NO
  const found = await other.call(
    'GET',
    `/users?itemsPerPage=5&filter[keyword]=${encodeURIComponent(userId)}`,
  )
  if (found.status !== 200) return found
  const hit = dataOf<{ items: UserItem[] }>(found).items.find((user) => user.userId === userId)
  return hit ? hit.userNo : { status: 404, body: `${userId} 가 없다` }
}

async function patchWithRevision(
  other: OtherAdmin,
  getPath: string,
  patch: (item: never) => object,
  patchPath = getPath,
): Promise<LabResult> {
  const got = await other.call('GET', getPath)
  if (got.status !== 200) return got
  const item = dataOf<{ item: never }>(got).item
  return other.call('PATCH', patchPath, withReauth(patch(item)))
}

export async function runOther(
  other: OtherAdmin,
  action: string,
  input: Record<string, unknown>,
): Promise<LabResult> {
  switch (action) {
    case 'role-preset': {
      const roleNo = PRESET_ROLE[input.preset as Preset]
      if (roleNo === undefined) return { status: 400, body: `없는 프리셋 ${String(input.preset)}` }
      return patchWithRevision(other, `/users/${ADMIN_NO}`, (item: UserItem) => ({
        revision: item.revision,
        roleNo,
      }))
    }
    case 'bump-user': {
      if (input.userNo === undefined)
        return { status: 400, body: '사용자 편집 화면(/users/:userNo)에서 누른다' }
      return patchWithRevision(other, `/users/${String(input.userNo)}`, (item: UserItem) => ({
        revision: item.revision,
        userName: toggleMark(item.userName),
      }))
    }
    case 'bump-roles': {
      const listed = await other.call('GET', '/roles')
      if (listed.status !== 200) return listed
      const results: string[] = []
      for (const role of dataOf<{ items: RoleItem[] }>(listed).items) {
        const done = await other.call(
          'PATCH',
          `/roles/${role.roleNo}`,
          withReauth({ revision: role.revision, roleName: toggleMark(role.roleName) }),
        )
        results.push(`${role.roleName} → ${done.status}`)
      }
      return { status: 200, body: results }
    }
    case 'reset-password':
    case 'unlock': {
      const userNo = await userNoOf(other, String(input.userId ?? ''))
      if (typeof userNo !== 'bigint') return userNo
      return other.call(
        'POST',
        `/users/${userNo}/${action === 'unlock' ? 'unlock' : 'password-reset'}`,
        withReauth({}),
      )
    }
    case 'revoke-sessions': {
      const userNo = await userNoOf(other, String(input.userId ?? 'admin'))
      if (typeof userNo !== 'bigint') return userNo
      return other.call('DELETE', `/sessions/user/${userNo}`)
    }
    case 'ip-rule':
    case 'team-ip-rule': {
      const scopeType = action === 'ip-rule' ? 'user' : 'team'
      const scopeRefNo = action === 'ip-rule' ? ADMIN_NO : BigInt(String(input.teamNo))
      const listed = await other.call('GET', '/ip-access')
      if (listed.status !== 200) return listed
      const found = dataOf<{ items: RuleItem[] }>(listed).items.find(
        (rule) => rule.scopeType === scopeType && rule.scopeRefNo === scopeRefNo,
      )
      if (input.on === true) {
        if (found) return { status: 200, body: '이미 있다' }
        return other.call(
          'POST',
          '/ip-access',
          withReauth({
            scopeType,
            scopeRefNo,
            cidr: action === 'ip-rule' ? '127.0.0.0/8' : '10.0.0.0/8',
            description:
              action === 'ip-rule'
                ? 'aksv 실험 — admin 은 127.0.0.0/8 만'
                : 'aksv 실험 — 팀 삭제 409',
          }),
        )
      }
      if (!found) return { status: 200, body: '없다' }
      return other.call(
        'DELETE',
        `/ip-access/${found.ruleNo}`,
        withReauth({ revision: found.revision }),
      )
    }
    case 'publish-legal': {
      const kind = String(input.kind ?? 'TERMS')
      const current = await other.call('GET', `/legal-documents/current?kind=${kind}`)
      if (current.status !== 200) return current
      const base = dataOf<{ item: { legalDocNo: bigint } | null }>(current).item?.legalDocNo ?? null
      return other.call('POST', '/legal-documents', {
        kind,
        body: `# 다른 관리자가 발행한 판\n\n${new Date().toISOString()}\n`,
        baseLegalDocNo: base,
      })
    }
    case 'restore-roles': {
      const listed = await other.call('GET', '/roles')
      if (listed.status !== 200) return listed
      const items = dataOf<{ items: RoleItem[] }>(listed).items
      const results: string[] = []
      for (const seed of ROLES) {
        const found =
          items.find((role) => role.roleNo === seed.roleNo) ??
          items.find((role) => role.roleName.replace(/ ·$/, '') === seed.roleName)
        const body = {
          roleName: seed.roleName,
          permissions: seed.permissions,
          isDefault: seed.isDefault,
        }
        const done = found
          ? await other.call(
              'PATCH',
              `/roles/${found.roleNo}`,
              withReauth({ ...body, revision: found.revision }),
            )
          : await other.call('POST', '/roles', withReauth(body))
        results.push(`${seed.roleName} → ${done.status}`)
      }
      return { status: 200, body: results }
    }
    default:
      return { status: 404, body: `없는 동작 ${action}` }
  }
}
```

- [ ] **Step 5: 플러그인을 쓴다**

`AKSV/lab/plugin.ts`:

```ts
// 실험 장치(Vite 플러그인) — 프록시 조작 + /__lab/*(스펙 §7). 상태는 Vite 프로세스 메모리에만 있다.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { stringifyJSON } from '@ssworks/admin-shared'
import type { Plugin } from 'vite'
import { OtherAdmin, runOther, type LabResult } from './other-admin'

const AKSS = 'http://127.0.0.1:4100'
const ADMIN_PREFIX = '/api/admin/'
const REFRESH = '/api/admin/auth/refresh'
const LOGIN = '/api/admin/auth/login'

export const labState = {
  /** 프록시가 붙이는 X-Real-IP(nginx 역할) */
  ip: '127.0.0.1',
  /** 다음 갱신 · 로그인 응답까지 admin_at 을 뺀다(쿠키가 만료된 브라우저와 같다) */
  dropAccess: false,
  lastSetCookie: [] as string[],
  lastSetCookieUrl: '',
  lastSetCookieAt: '',
  /** 직전 갱신 요청이 보낸 refresh — 회전으로 옛것이 됐다(X2 재사용 탐지) */
  prevRefresh: null as string | null,
  prevRefreshAt: '',
}

function cookieValue(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(/;\s*/)) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index) === name) return part.slice(index + 1)
  }
  return null
}

const withoutCookie = (header: string, name: string) =>
  header
    .split(/;\s*/)
    .filter((part) => !part.startsWith(`${name}=`))
    .join('; ')

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(stringifyJSON(body))
}

async function akss(
  method: string,
  path: string,
  init: { body?: unknown; cookie?: string } = {},
): Promise<LabResult> {
  const res = await fetch(`${AKSS}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': labState.ip,
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await res.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // 글 그대로
  }
  return { status: res.status, body }
}

export function labPlugin(): Plugin {
  const other = new OtherAdmin(AKSS)

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://lab')
    const path = url.pathname
    if (req.method === 'GET' && path === '/state') {
      const server = await akss('GET', '/api/lab/state').catch((error: unknown) => ({
        status: 0,
        body: String(error),
      }))
      return reply(res, 200, {
        ...labState,
        prevRefresh: labState.prevRefresh ? '있음' : null,
        server,
      })
    }
    if (req.method === 'GET' && path === '/audit') {
      const action = url.searchParams.get('action')
      const limit = url.searchParams.get('limit') ?? '20'
      return reply(
        res,
        200,
        await other.call(
          'GET',
          `/audit-logs?itemsPerPage=${limit}${action ? `&filter[action]=${encodeURIComponent(action)}` : ''}`,
        ),
      )
    }
    if (req.method !== 'POST') return reply(res, 405, { status: 405, body: 'POST 만' })
    const body = await readBody(req)
    switch (path) {
      case '/ip':
        labState.ip = String(body.ip ?? '127.0.0.1')
        return reply(res, 200, { status: 200, body: { ip: labState.ip } })
      case '/expire-access':
        labState.dropAccess = true
        return reply(res, 200, { status: 200, body: { dropAccess: true } })
      case '/replay-refresh':
        if (!labState.prevRefresh) {
          return reply(res, 200, {
            status: 409,
            body: '아직 회전이 없다 — "액세스 토큰 만료" 로 갱신을 한 번 일으킨다',
          })
        }
        return reply(
          res,
          200,
          await akss('POST', REFRESH, { cookie: `admin_rt=${labState.prevRefresh}` }),
        )
      case '/next':
        return reply(res, 200, await akss('POST', '/api/lab/next', { body }))
      case '/other-forget':
        other.forgetCookie()
        return reply(res, 200, { status: 200, body: 'other 쿠키를 지웠다' })
    }
    if (path.startsWith('/other/'))
      return reply(res, 200, await runOther(other, path.slice('/other/'.length), body))
    return reply(res, 404, { status: 404, body: `없는 실험 ${path}` })
  }

  return {
    name: 'aksv-lab',
    config: () => ({
      server: {
        port: 5199,
        strictPort: true,
        proxy: {
          '/api': {
            target: AKSS,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                const url = req.url ?? ''
                proxyReq.setHeader('x-real-ip', labState.ip)
                if (url.startsWith(REFRESH)) {
                  const refresh = cookieValue(req.headers.cookie, 'admin_rt')
                  if (refresh) {
                    labState.prevRefresh = refresh
                    labState.prevRefreshAt = new Date().toISOString()
                  }
                } else if (labState.dropAccess && url.startsWith(ADMIN_PREFIX)) {
                  const cookie = proxyReq.getHeader('cookie')
                  if (typeof cookie === 'string')
                    proxyReq.setHeader('cookie', withoutCookie(cookie, 'admin_at'))
                }
              })
              proxy.on('proxyRes', (proxyRes, req) => {
                const url = req.url ?? ''
                const setCookie = proxyRes.headers['set-cookie']
                if (setCookie?.length) {
                  labState.lastSetCookie = setCookie
                  labState.lastSetCookieUrl = url
                  labState.lastSetCookieAt = new Date().toISOString()
                }
                // 🔴 갱신 · 로그인 응답이면 성공 · 실패와 상관없이 빼기를 끈다 — 안 끄면 다시 로그인해도 모두 401(Review Focus 1)
                if (url.startsWith(REFRESH) || url.startsWith(LOGIN)) labState.dropAccess = false
              })
            },
          },
        },
      },
    }),
    configureServer(server) {
      server.middlewares.use('/__lab', (req, res) => {
        handle(req, res).catch((error: unknown) =>
          reply(res, 500, { status: 500, body: String(error) }),
        )
      })
    },
  }
}
```

- [ ] **Step 6: 실험 패널을 바꾼다**

`AKSV/src/components/LabPanel.vue` — `<style scoped>` 블록(지난 파일 273-358행)은 그대로 두고 `<script setup>` 과 `<template>` 을 아래로 바꾼다. 스타일 끝에 `.lab__pre` 하나를 더한다.

```vue
<script setup lang="ts">
  // 실험 패널(실서버판) — 가짜 스위치 대신 실서버에서 실제로 일을 일으킨다(스펙 §6-3). 킷이 아니라 확인용 앱 몫이다.
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useTheme } from 'vuetify'
  import { api } from '../api/client'
  import { ADMIN, PRESET_LABEL, PRESET_ROLE, ROLES, TEAM, type Preset } from '../fixtures'
  import { lab, type DelayMode } from '../state/lab'
  import { useAppStore } from '../stores/app'

  interface LabResult {
    status: number
    body: unknown
  }
  interface ServerLab {
    delay: DelayMode
    failNext: 500 | 403 | null
    reauth: boolean
    accessTtlMs: number
  }
  interface ProxyLab {
    ip: string
    dropAccess: boolean
    lastSetCookie: string[]
    lastSetCookieUrl: string
    lastSetCookieAt: string
    prevRefresh: string | null
    prevRefreshAt: string
    server: LabResult
  }

  const store = useAppStore()
  const router = useRouter()
  const theme = useTheme()

  const proxy = ref<ProxyLab | null>(null)
  const server = computed<ServerLab | null>(() => {
    const s = proxy.value?.server
    return s && s.status === 200 ? (s.body as { data: ServerLab }).data : null
  })
  const result = ref('')
  const targetUserId = ref('user001')
  const issued = ref('')

  async function readState() {
    proxy.value = (await (await fetch('/__lab/state')).json()) as ProxyLab
  }

  /** 실험 하나 — 결과(상태 · 본문)를 숨기지 않고 패널에 그대로 보인다 */
  async function act(
    label: string,
    path: string,
    body: Record<string, unknown> = {},
  ): Promise<LabResult> {
    const res = await fetch(`/__lab${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const done = (await res.json()) as LabResult
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false })
    result.value = `${time} ${label} → ${done.status}\n${JSON.stringify(done.body, null, 2)}`
    await readState()
    return done
  }

  const themeChoice = ref<'system' | 'light' | 'dark'>('system')
  function onTheme(value: 'system' | 'light' | 'dark') {
    themeChoice.value = value
    theme.change(value)
  }

  /** 권한이 바뀐 뒤 지금 화면의 가드를 다시 돌린다 — 권한이 없어졌으면 /403 · /password 로 */
  async function rerunGuard() {
    const current = router.currentRoute.value
    await router.replace({
      path: current.path,
      query: current.query,
      hash: current.hash,
      force: true,
    })
  }

  const presets = Object.entries(PRESET_LABEL) as [Preset, string][]
  const preset = computed(() => {
    const role = ROLES.find((r) => r.roleName === store.userInfo?.roleName)
    return (
      (Object.entries(PRESET_ROLE) as [Preset, bigint][]).find(
        ([, roleNo]) => roleNo === role?.roleNo,
      )?.[0] ?? null
    )
  })

  async function onPreset(value: Preset | null) {
    if (value == null) return
    const done = await act(`권한 프리셋 ${PRESET_LABEL[value]}`, '/other/role-preset', {
      preset: value,
    })
    if (done.status !== 200) return
    await store.refresh()
    await rerunGuard()
  }

  const delays: { value: DelayMode; title: string }[] = [
    { value: 0, title: '0' },
    { value: 700, title: '0.7초' },
    { value: 3000, title: '3초' },
    { value: 'shuffle', title: '뒤섞기' },
  ]

  async function onConcurrent() {
    result.value = '동시 요청 3개(GET /admin/auth/me)를 보냈습니다'
    await Promise.allSettled([1, 2, 3].map(() => api.get('/admin/auth/me')))
  }

  function editingUserNo(): string | undefined {
    const raw = router.currentRoute.value.params.userNo
    return typeof raw === 'string' && /^\d+$/.test(raw) ? raw : undefined
  }

  async function onReset() {
    const done = await act(`비밀번호 초기화 ${targetUserId.value}`, '/other/reset-password', {
      userId: targetUserId.value,
    })
    issued.value =
      done.status === 200
        ? (done.body as { data: { temporaryPassword: string } }).data.temporaryPassword
        : ''
  }

  const reauthMismatch = computed(() => server.value != null && server.value.reauth !== lab.reauth)

  const statusColor = (status: number) =>
    status >= 500 ? 'error' : status >= 400 ? 'warning' : 'success'

  onMounted(readState)
</script>

<template>
  <VNavigationDrawer
    v-model="lab.open"
    aria-label="실험 패널"
    class="lab"
    location="right"
    width="360"
  >
    <div class="lab__body">
      <div class="lab__head">
        <strong>실험 패널 · 실서버</strong>
        <div>
          <VBtn
            aria-label="실험 상태 새로 읽기"
            icon="mdi-refresh"
            size="small"
            variant="text"
            @click="readState"
          />
          <VBtn
            aria-label="실험 패널 닫기"
            icon="mdi-close"
            size="small"
            variant="text"
            @click="lab.open = false"
          />
        </div>
      </div>

      <p class="lab__state">
        <template v-if="store.authorized">
          {{ store.userInfo?.userName }}({{ store.userInfo?.userId }}) ·
          {{ store.userInfo?.roleName }}
        </template>
        <template v-else>로그아웃 상태</template>
        <br />
        로그인 {{ ADMIN.userId }} · 비밀번호 <code>{{ ADMIN.password }}</code>
        <br />
        <template v-if="server">
          서버 재인증 {{ server.reauth ? '켬' : '끔' }} · 액세스 {{ server.accessTtlMs / 1000 }}초 ·
          지연 {{ server.delay }} · 대기 실패 {{ server.failNext ?? '없음' }}
        </template>
        <template v-else>akss 에 닿지 않습니다(4100)</template>
        <br />
        내 주소 {{ proxy?.ip }} · 토큰 빼기 {{ proxy?.dropAccess ? '켬' : '끔' }}
      </p>

      <section>
        <h3>권한 프리셋(other 가 admin 의 역할을 바꾼다)</h3>
        <VBtnToggle
          class="lab__toggle"
          color="primary"
          density="compact"
          divided
          :model-value="preset"
          variant="outlined"
          @update:model-value="onPreset"
        >
          <VBtn v-for="[value, title] in presets" :key="value" size="small" :value="value">{{
            title
          }}</VBtn>
        </VBtnToggle>
      </section>

      <section>
        <h3>테마 · 메뉴</h3>
        <VBtnToggle
          class="lab__toggle"
          color="primary"
          density="compact"
          divided
          mandatory
          :model-value="themeChoice"
          variant="outlined"
          @update:model-value="onTheme"
        >
          <VBtn size="small" value="system">시스템</VBtn>
          <VBtn size="small" value="light">라이트</VBtn>
          <VBtn size="small" value="dark">다크</VBtn>
        </VBtnToggle>
        <VBtnToggle
          v-model="lab.groupMode"
          class="lab__toggle"
          color="primary"
          density="compact"
          divided
          mandatory
          variant="outlined"
        >
          <VBtn size="small" value="subheader">그룹 머리글</VBtn>
          <VBtn size="small" value="collapsible">접이식 그룹</VBtn>
        </VBtnToggle>
      </section>

      <section>
        <h3>다음 요청(akss)</h3>
        <VBtnToggle
          class="lab__toggle"
          color="primary"
          density="compact"
          divided
          mandatory
          :model-value="server?.delay ?? 0"
          variant="outlined"
          @update:model-value="(delay: DelayMode) => act('지연', '/next', { delay })"
        >
          <VBtn v-for="d in delays" :key="String(d.value)" size="small" :value="d.value">{{
            d.title
          }}</VBtn>
        </VBtnToggle>
        <div class="lab__row">
          <VBtn
            size="small"
            variant="tonal"
            @click="act('다음 요청 500', '/next', { failNext: 500 })"
            >다음 요청 500</VBtn
          >
          <VBtn
            size="small"
            variant="tonal"
            @click="act('다음 요청 403', '/next', { failNext: 403 })"
            >다음 요청 403</VBtn
          >
          <VBtn
            size="small"
            variant="text"
            @click="act('대기 실패 취소', '/next', { failNext: null })"
            >취소</VBtn
          >
        </div>
      </section>

      <section>
        <h3>인증</h3>
        <div class="lab__row">
          <VBtn size="small" variant="tonal" @click="act('액세스 토큰 만료', '/expire-access')"
            >액세스 토큰 만료</VBtn
          >
          <VBtn
            size="small"
            variant="tonal"
            @click="act('내 세션 끊기', '/other/revoke-sessions', { userId: 'admin' })"
          >
            내 세션 끊기
          </VBtn>
          <VBtn size="small" variant="tonal" @click="act('옛 refresh 재사용', '/replay-refresh')"
            >옛 refresh 재사용</VBtn
          >
          <VBtn size="small" variant="tonal" @click="onConcurrent">동시 요청 3개</VBtn>
          <VBtn
            size="small"
            variant="text"
            @click="readState().then(() => (result = (proxy?.lastSetCookie ?? []).join('\n')))"
          >
            쿠키 보기
          </VBtn>
        </div>
        <p v-if="proxy?.prevRefresh" class="lab__pending">
          옛 refresh 있음({{ proxy.prevRefreshAt }}) — 유예 30초 뒤 재사용
        </p>
      </section>

      <section>
        <h3>IP</h3>
        <VBtnToggle
          class="lab__toggle"
          color="primary"
          density="compact"
          divided
          mandatory
          :model-value="proxy?.ip ?? '127.0.0.1'"
          variant="outlined"
          @update:model-value="(ip: string) => act('내 주소', '/ip', { ip })"
        >
          <VBtn size="small" value="127.0.0.1">127.0.0.1</VBtn>
          <VBtn size="small" value="203.0.113.9">203.0.113.9</VBtn>
        </VBtnToggle>
        <div class="lab__row">
          <VBtn
            size="small"
            variant="tonal"
            @click="act('막는 규칙 켜기', '/other/ip-rule', { on: true })"
            >막는 규칙 켜기</VBtn
          >
          <VBtn
            size="small"
            variant="text"
            @click="act('막는 규칙 끄기', '/other/ip-rule', { on: false })"
            >끄기</VBtn
          >
        </div>
      </section>

      <section>
        <h3>다른 관리자(other)</h3>
        <div class="lab__row">
          <VBtn
            size="small"
            variant="tonal"
            @click="act('사용자 수정', '/other/bump-user', { userNo: editingUserNo() })"
          >
            사용자 수정(이 화면)
          </VBtn>
          <VBtn size="small" variant="tonal" @click="act('역할 수정(전부)', '/other/bump-roles')"
            >역할 수정</VBtn
          >
          <VBtn
            size="small"
            variant="tonal"
            @click="act('약관 발행 TERMS', '/other/publish-legal', { kind: 'TERMS' })"
            >약관 발행</VBtn
          >
        </div>
        <VTextField
          v-model="targetUserId"
          class="mt-2"
          density="compact"
          hide-details
          label="대상 아이디"
          name="labUserId"
        />
        <div class="lab__row">
          <VBtn size="small" variant="tonal" @click="onReset">비밀번호 초기화</VBtn>
          <VBtn
            size="small"
            variant="tonal"
            @click="act(`잠금 해제 ${targetUserId}`, '/other/unlock', { userId: targetUserId })"
          >
            잠금 해제
          </VBtn>
          <VBtn
            size="small"
            variant="text"
            @click="act('admin 잠금 해제', '/other/unlock', { userId: 'admin' })"
            >admin 잠금 해제</VBtn
          >
        </div>
        <p v-if="issued" class="lab__pending">
          임시 비밀번호 <code>{{ issued }}</code>
        </p>
        <div class="lab__row">
          <VBtn
            size="small"
            variant="tonal"
            @click="
              act('팀 IP 규칙 켜기(영업기획팀)', '/other/team-ip-rule', {
                teamNo: String(TEAM.SALES_PLAN),
                on: true,
              })
            "
          >
            팀 IP 규칙 켜기
          </VBtn>
          <VBtn
            size="small"
            variant="text"
            @click="
              act('팀 IP 규칙 끄기', '/other/team-ip-rule', {
                teamNo: String(TEAM.SALES_PLAN),
                on: false,
              })
            "
          >
            끄기
          </VBtn>
          <VBtn
            color="error"
            size="small"
            variant="text"
            @click="act('시드 역할 되돌리기', '/other/restore-roles')"
          >
            시드 역할 되돌리기
          </VBtn>
        </div>
      </section>

      <section>
        <h3>재인증</h3>
        <VSwitch
          v-model="lab.reauth"
          color="primary"
          density="compact"
          hide-details
          label="화면 재인증(역할 · 사용자 쓰기)"
        />
        <p v-if="reauthMismatch" class="lab__pending">
          서버 재인증과 다릅니다 — akss 를 AKSS_REAUTH 와 맞춰 다시 띄우거나 스위치를 맞춥니다
        </p>
      </section>

      <section>
        <h3>결과</h3>
        <pre class="lab__pre">{{ result || '아직 없음' }}</pre>
      </section>

      <section class="lab__log">
        <div class="lab__head">
          <h3>요청 기록</h3>
          <VBtn size="x-small" variant="text" @click="lab.log.length = 0">지우기</VBtn>
        </div>
        <ol>
          <li v-for="entry in lab.log" :key="entry.seq">
            <span class="lab__seq">#{{ entry.seq }}</span>
            <span class="lab__method">{{ entry.method }}</span>
            <span class="lab__path">{{ entry.path }}</span>
            <VChip :color="statusColor(entry.status)" label size="x-small" variant="tonal">
              {{ entry.status }}{{ entry.code && entry.status >= 400 ? ` ${entry.code}` : '' }}
            </VChip>
            <VChip v-if="entry.refresh" label size="x-small" variant="outlined">갱신</VChip>
            <VChip v-if="entry.retry" label size="x-small" variant="outlined">재시도</VChip>
            <span class="lab__ms">{{ entry.ms }}ms · {{ entry.at }}</span>
          </li>
        </ol>
      </section>
    </div>
  </VNavigationDrawer>

  <VBtn
    :aria-label="lab.open ? '실험 패널 닫기' : '실험 패널 열기'"
    class="lab-fab"
    color="secondary"
    icon="mdi-flask-outline"
    @click="lab.open = !lab.open"
  />
</template>
```

스타일 끝에 더한다:

```css
.lab__pre {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.6875rem;
}
```

- [ ] **Step 7: 설치 · 타입 검사**

```bash
cd /c/Users/kim52/AppData/Local/Temp/aksv && pnpm install && pnpm exec vue-tsc --noEmit
```

Expected: 설치 성공(`@ssworks/admin-shared 0.4.0` · `@ssworks/admin-ui 0.4.0`), `vue-tsc` 오류 0건. 페이지가 아직 가짜 모양을 쓰지만 자기 인터페이스로 타입을 맞추므로 컴파일된다. `/demo/reauth` · `/teams/members` 같은 경로는 Task 4 가 바꾼다. `lab.roleReauth` 오류가 나면 Step 3 의 RolesPage 한 줄을 다시 본다.

- [ ] **Step 8: 확인 스크립트를 쓴다**

`AKSV/check-aksv.mjs`:

```js
// aksv 실험 장치 확인 — node check-aksv.mjs (akss 4100 · Vite 5199 가 떠 있어야 한다)
const app = 'http://localhost:5199'
const failures = []
const expect = (ok, label, detail) =>
  ok ? console.log('ok  ', label) : failures.push(`${label} ${detail ?? ''}`)
const json = { 'content-type': 'application/json' }
const cookieOf = (res) =>
  res.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ')
const lab = async (path, body) =>
  (
    await fetch(`${app}/__lab${path}`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify(body ?? {}),
    })
  ).json()
const state = async () => (await fetch(`${app}/__lab/state`)).json()
const login = (userId, password) =>
  fetch(`${app}/api/admin/auth/login`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ userId, password }),
  })
const me = (cookie) => fetch(`${app}/api/admin/auth/me`, { headers: cookie ? { cookie } : {} })

for (let i = 0; i < 40; i += 1) {
  try {
    if ((await fetch(`${app}/__lab/state`)).status === 200) break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}

// 1) 프록시로 로그인 · 쿠키 모양(X1 준비)
const first = await login('admin', 'admin1234')
expect(first.status === 200, '프록시 로그인 200', first.status)
let cookie = cookieOf(first)
let s = await state()
const lines = s.lastSetCookie
expect(
  lines.length === 2 &&
    lines.every(
      (l) =>
        /HttpOnly/i.test(l) && /SameSite=Lax/i.test(l) && /Path=\//.test(l) && !/Secure/i.test(l),
    ),
  'Set-Cookie 두 줄 HttpOnly · Lax · Path=/ · Secure 없음',
  JSON.stringify(lines),
)
expect(
  s.server.status === 200 && s.server.body.data.reauth === false,
  'akss 상태가 패널에 닿는다',
  JSON.stringify(s.server),
)

// 2) 토큰 빼기 → 401 → 갱신 200 → 빼기 꺼짐 → 200
await lab('/expire-access')
expect((await me(cookie)).status === 401, '빼기 중 /auth/me 401')
const refreshed = await fetch(`${app}/api/admin/auth/refresh`, {
  method: 'POST',
  headers: { cookie },
})
expect(refreshed.status === 200, '갱신 200', refreshed.status)
cookie = cookieOf(refreshed)
s = await state()
expect(
  s.dropAccess === false && s.prevRefresh === '있음',
  '갱신 뒤 빼기 꺼짐 · 옛 refresh 붙잡음',
  JSON.stringify({ d: s.dropAccess, p: s.prevRefresh }),
)
expect((await me(cookie)).status === 200, '갱신 뒤 /auth/me 200')

// 3) Review Focus 1 — 빼기 → 갱신 실패 → 로그인 → 200
await lab('/expire-access')
const failed = await fetch(`${app}/api/admin/auth/refresh`, { method: 'POST' })
expect(failed.status === 401, '쿠키 없는 갱신 401', failed.status)
expect((await state()).dropAccess === false, '갱신 실패 뒤에도 빼기 꺼짐')
cookie = cookieOf(await login('admin', 'admin1234'))
expect((await me(cookie)).status === 200, '다시 로그인 뒤 /auth/me 200')

// 4) X-Real-IP — 바꾼 주소가 세션에 남는다
await lab('/ip', { ip: '198.51.100.9' })
const viaIp = cookieOf(await login('admin', 'admin1234'))
const mine = (
  await (await fetch(`${app}/api/admin/sessions/me`, { headers: { cookie: viaIp } })).json()
).data.items
expect(
  mine.some((row) => row.ipAddress === '198.51.100.9'),
  '프록시 X-Real-IP 가 세션 IP 가 된다',
  JSON.stringify(mine.map((r) => r.ipAddress)),
)
await lab('/ip', { ip: '127.0.0.1' })

// 5) other — 쿠키를 잊어도 다시 로그인해 동작(Review Focus 3) · 프리셋 왕복
await lab('/other-forget')
const toRead = await lab('/other/role-preset', { preset: 'read' })
expect(toRead.status === 200, '프리셋 읽기 전용 200', JSON.stringify(toRead))
expect((await (await me(cookie)).json()).data.roleName === '조회 전용', 'admin 역할이 조회 전용')
const toAll = await lab('/other/role-preset', { preset: 'all' })
expect(toAll.status === 200, '프리셋 전권 200', JSON.stringify(toAll))
expect(
  (await (await me(cookie)).json()).data.roleName === '최고 관리자',
  'admin 역할이 최고 관리자',
)

// 6) 다음 요청 · 재인증 표시(Review Focus 4)
const next = await lab('/next', { delay: 0 })
expect(next.status === 200 && next.body.data.delay === 0, '다음 요청 지연 0', JSON.stringify(next))

if (failures.length) {
  console.error('FAIL\n' + failures.join('\n'))
  process.exitCode = 1
} else console.log('aksv OK')
```

- [ ] **Step 9: Vite 를 띄워 잰다**

Vite 를 띄운다(Bash `run_in_background: true`):

```bash
cd /c/Users/kim52/AppData/Local/Temp/aksv && pnpm dev --force > vite.log 2>&1
```

포그라운드에서:

```bash
cd /c/Users/kim52/AppData/Local/Temp/aksv && node check-aksv.mjs
```

Expected: `ok` 열여섯과 `aksv OK`. 실패하면 `vite.log` 와 패널 결과를 본다. 프록시가 Set-Cookie 를 고쳐 쓰면(도메인 · 경로) 1) 이 실패한다 — 그때는 플러그인의 프록시 옵션에 `cookieDomainRewrite: ''` 를 두지 말고 원인을 먼저 본다(Vite 기본은 고쳐 쓰지 않는다).

- [ ] **Step 10: 브라우저로 한 번 본다**

claude-in-chrome(`tabs_context_mcp` → `tabs_create_mcp` → `navigate http://localhost:5199/login`)으로 admin / admin1234 로그인 → 실험 패널이 열리고 "서버 재인증 끔 · 액세스 900초" 줄이 보이는지, 권한 프리셋 "읽기 전용" → 메뉴가 줄어드는지 → "전권" 으로 되돌린다. `read_console_messages` 로 Vue 경고가 없는지 본다.

- [ ] **Step 11: 스냅숏**

```bash
cd /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad && node snapshot.mjs
```

---

### Task 4: aksv — 페이지를 실서버 모양으로

**Files:**

- Modify(전체): `AKSV/src/pages/UsersPage.vue`, `AKSV/src/pages/UserEditPage.vue`
- Modify(줄): `AKSV/src/pages/TeamsPage.vue`, `AKSV/src/pages/settings/RolesPage.vue`, `AKSV/src/pages/HomePage.vue:67`, `AKSV/src/pages/AccountPage.vue`, `AKSV/src/pages/SessionsPage.vue`, `AKSV/src/pages/PasswordPage.vue`, `AKSV/src/router/index.ts`
- Create: `AKSV/src/pages/settings/LegalPage.vue`

**Interfaces:**

- Consumes: `lab.reauth`(Task 3) — 사용자 · 역할 쓰기의 재인증 관문을 켜고 끈다. `IMPLIES` · `P`(Task 1)
- Produces: 라우트 `/settings/legal`(권한 `settings.legal:read`, 발행 `settings.legal:publish`)
- 경로 규약: 모든 API 경로는 `'/admin/…'`(baseURL `/api`), 1-P6 시연만 `'/lab/reauth'`

- [ ] **Step 1: 사용자 목록을 바꾼다**

`AKSV/src/pages/UsersPage.vue`(덮어씀):

```vue
<script setup lang="ts">
  // PR #3a 목록 · 쓰기 — README "목록 · 쓰기" 배선을 실서버 모양으로(행 = AdminUser, 필터 keyword · teamNo · status).
  // 실서버 확인에서 바꾼 것: 상태는 resignAt(효력 시각)에서 셈한다 · 퇴사는 퇴사일을 묻는다 · 재인증 관문은 서버 설정(lab.reauth)을 따른다.
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    flattenTeamTree,
    indentTeamName,
    type AdminTeamNode,
    type AdminTemporaryPassword,
    type AdminUser,
    type Paginated,
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
  import { api } from '../api/client'
  import { usePermission } from '../composables/usePermission'
  import { toast } from '../plugins/toast'
  import { P } from '../permissions'
  import { lab } from '../state/lab'

  type Status = 'active' | 'resigned'
  interface Applied {
    q: string
    teamNo: bigint | undefined
    status: Status | undefined
  }

  const router = useRouter()
  const check = usePermission()
  const canWrite = computed(() => check.hasPermission(P.USERS_WRITE))

  // 팀 선택지
  const teams = ref<AdminTeamNode[]>([])
  api.get<{ items: AdminTeamNode[] }>('/admin/teams/tree').then(
    (r) => (teams.value = r.items),
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
  const input = ref<{ q: string; teamNo: bigint | null; status: Status | null }>({
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

  const { page, itemsPerPage, sortBy, items, total, loading, isFiltered, reload } = useServerTable<
    AdminUser,
    { keyword?: string; teamNo?: bigint; status?: Status }
  >({
    fetch: (params) => api.get<Paginated<AdminUser>>('/admin/users', { params }),
    // 서버 정렬 열: userId · userName · joinAt · resignAt · createAt · updateAt
    sort: { keys: ['userId', 'userName', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
    // URL 키는 q 그대로, 서버 필터는 keyword
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
    { title: '가입일', key: 'joinAt', nowrap: true },
    { title: '상태', key: 'status', sortable: false },
    { title: '', key: 'actions', sortable: false, align: 'end' },
  ]

  /** 기준 시간대(KST) 오늘 — 퇴사일 기본값("오늘까지 근무") */
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
    const send = (extra: object) =>
      api.post(`/admin/users/${row.userNo}/resign`, { resignDate: date, ...extra })
    const onSuccess = () => {
      toast.success(`「${row.userName}」을(를) 퇴사 처리했습니다.`)
      void reload()
    }
    void run<unknown>(
      lab.reauth
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
    const send = (body: object) =>
      api.post<AdminTemporaryPassword>(`/admin/users/${row.userNo}/password-reset`, body)
    const onSuccess = (r: AdminTemporaryPassword) => {
      issued.value = r.temporaryPassword
      void reload()
    }
    void run<AdminTemporaryPassword>(
      lab.reauth
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

<template>
  <div class="users pa-4">
    <DataTablePanel
      v-model:items-per-page="itemsPerPage"
      v-model:page="page"
      v-model:sort-by="sortBy"
      :headers="headers"
      :items="items"
      :items-length="total"
      :loading="loading"
      title="사용자"
    >
      <template #header-actions>
        <VBtn prepend-icon="mdi-refresh" variant="text" @click="reload">새로 고침</VBtn>
        <VBtn v-if="canWrite" prepend-icon="mdi-plus" to="/users/new">사용자 추가</VBtn>
      </template>
      <template #filters>
        <form class="users__filters" @submit.prevent="apply">
          <VTextField
            v-model="input.q"
            autocomplete="off"
            clearable
            label="아이디 · 이름"
            name="q"
          />
          <VSelect v-model="input.teamNo" clearable :items="teamOptions" label="팀" name="teamNo" />
          <VSelect
            v-model="input.status"
            clearable
            :items="statusOptions"
            label="상태"
            name="status"
          />
          <VBtn type="submit">적용</VBtn>
          <VBtn variant="text" @click="clearFilters">조건 지우기</VBtn>
        </form>
      </template>
      <template #item.userNo="{ item }">
        <code>{{ String(item.userNo) }}</code>
      </template>
      <template #item.joinAt="{ item }">{{ item.joinDate }}</template>
      <template #item.status="{ item }">
        <VChip :color="statusOf(item).color" label size="small" variant="tonal">{{
          statusOf(item).label
        }}</VChip>
      </template>
      <template #item.actions="{ item }">
        <div class="users__actions">
          <VBtn size="small" :to="`/users/${item.userNo}`" variant="text">편집</VBtn>
          <VBtn
            color="error"
            :disabled="!canWrite || submitting || item.resignAt != null"
            size="small"
            variant="text"
            @click="askResign(item)"
          >
            퇴사 처리
          </VBtn>
          <VBtn
            :disabled="!canWrite || submitting"
            size="small"
            variant="text"
            @click="resetPassword(item)"
          >
            비밀번호 초기화
          </VBtn>
        </div>
      </template>
      <template #no-data>
        <EmptyState
          :can-create="canWrite"
          create-label="사용자 추가"
          :filtered="isFiltered"
          filtered-title="조건에 맞는 사용자가 없습니다"
          title="아직 사용자가 없습니다"
          @create="router.push('/users/new')"
        />
      </template>
    </DataTablePanel>

    <VDialog :model-value="resignTarget != null" max-width="420" persistent>
      <VCard>
        <VCardTitle>퇴사일</VCardTitle>
        <VCardText>
          <p class="mb-3">
            「{{ resignTarget?.userName }}({{ resignTarget?.userId }})」 — 이 날까지 근무합니다.
            다음 날 0시(한국 시간)부터 로그인할 수 없습니다.
          </p>
          <VTextField v-model="resignDate" label="퇴사일" name="resignDate" type="date" />
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="resignTarget = null">취소</VBtn>
          <VBtn :disabled="!resignDate" @click="resign">다음</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    <ConfirmDialog v-bind="confirmDialog" />
    <ReauthDialog v-bind="reauthDialog" />
    <TemporaryPasswordDialog v-model="issued" mode="reset" sessions-revoked :target="target" />
  </div>
</template>

<style scoped>
  .users__filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 820px;
  }

  .users__filters > :deep(.v-input) {
    flex: 1 1 180px;
  }

  .users__actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: nowrap;
  }
</style>
```

- [ ] **Step 2: 사용자 편집을 바꾼다**

`AKSV/src/pages/UserEditPage.vue`(덮어씀):

```vue
<script setup lang="ts">
  // 사용자 추가 · 편집 폼 — 실서버 모양(단건 {item} · 만들기에 역할 · 입사일 · 임시 비밀번호).
  // useWriteFlow 의 fields · onConflict(L11 · L12) 와 useDirtyGuard(S13). 재인증 관문은 서버 설정(lab.reauth)을 따른다.
  import { computed, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import {
    flattenTeamTree,
    indentTeamName,
    type AdminRole,
    type AdminTeamNode,
    type AdminUser,
  } from '@ssworks/admin-shared'
  import {
    ApiError,
    CardLayout,
    ReauthDialog,
    TemporaryPasswordDialog,
    useDirtyGuard,
    useWriteFlow,
  } from '@ssworks/admin-ui'
  import { api } from '../api/client'
  import { usePermission } from '../composables/usePermission'
  import { toast } from '../plugins/toast'
  import { P } from '../permissions'
  import { lab } from '../state/lab'

  interface Form {
    userId: string
    userName: string
    roleNo: bigint | null
    teamNo: bigint | null
    joinDate: string
  }

  const route = useRoute()
  const router = useRouter()
  const check = usePermission()
  const canWrite = computed(() => check.hasPermission(P.USERS_WRITE))

  const userNo = computed(() => {
    const raw = route.params.userNo
    return typeof raw === 'string' && /^\d+$/.test(raw) ? BigInt(raw) : null
  })
  const isNew = computed(() => userNo.value == null)

  const form = ref<Form>({ userId: '', userName: '', roleNo: null, teamNo: null, joinDate: '' })
  const loadedJoinDate = ref('')
  const revision = ref(0)
  const loading = ref(false)
  const conflicted = ref(false)
  const keyOf = (value: Form) =>
    `${value.userId}|${value.userName}|${value.roleNo ?? ''}|${value.teamNo ?? ''}|${value.joinDate}`
  const baseline = ref(keyOf(form.value))
  const isDirty = computed(() => keyOf(form.value) !== baseline.value)

  // 🔴 페이지 setup 에서만(onBeforeRouteLeave 제약)
  useDirtyGuard(() => isDirty.value)

  const ignore = (e: unknown) => {
    if (e instanceof ApiError) e.handled = true // 선택지가 비는 것뿐이다
  }
  const teams = ref<AdminTeamNode[]>([])
  api
    .get<{ items: AdminTeamNode[] }>('/admin/teams/tree')
    .then((r) => (teams.value = r.items), ignore)
  const teamOptions = computed(() =>
    flattenTeamTree(teams.value).map((row) => ({
      title: indentTeamName(row.teamName, row.depth),
      value: row.teamNo,
    })),
  )
  const roles = ref<AdminRole[]>([])
  api.get<{ items: AdminRole[] }>('/admin/roles').then((r) => {
    roles.value = r.items
    // 만들기는 기본 역할로 시작한다 — 시작값이라 변경으로 세지 않는다
    if (isNew.value && form.value.roleNo == null) {
      form.value.roleNo = r.items.find((role) => role.isDefault)?.roleNo ?? null
      baseline.value = keyOf(form.value)
    }
  }, ignore)
  const roleOptions = computed(() =>
    roles.value.map((role) => ({ title: role.roleName, value: role.roleNo })),
  )

  async function load() {
    if (userNo.value == null) return
    loading.value = true
    conflicted.value = false
    try {
      const { item } = await api.get<{ item: AdminUser }>(`/admin/users/${userNo.value}`)
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
  function body(): Record<string, unknown> {
    const f = form.value
    if (isNew.value) {
      return {
        userId: f.userId.trim(),
        userName: f.userName,
        roleNo: f.roleNo,
        teamNo: f.teamNo,
        ...(f.joinDate ? { joinDate: f.joinDate } : {}),
      }
    }
    return {
      revision: revision.value,
      userName: f.userName,
      roleNo: f.roleNo,
      teamNo: f.teamNo,
      ...(f.joinDate !== loadedJoinDate.value ? { joinDate: f.joinDate } : {}),
    }
  }

  function send(extra: object): Promise<unknown> {
    return userNo.value == null
      ? api.post<{ temporaryPassword: string }>('/admin/users', { ...body(), ...extra })
      : api.patch(`/admin/users/${userNo.value}`, { ...body(), ...extra })
  }

  function save() {
    conflicted.value = false
    const common = {
      // 폼이 그리는 키 — 검증 오류의 키가 전부 여기 있을 때만 처리됨(전역 토스트 없음)
      fields: ['userId', 'userName', 'roleNo', 'teamNo', 'joinDate'],
      onConflict: () => {
        conflicted.value = true
      },
      onSuccess: async (result: unknown) => {
        baseline.value = keyOf(form.value)
        if (isNew.value) {
          createdName.value = `${form.value.userName}(${form.value.userId})`
          issued.value = (result as { temporaryPassword: string }).temporaryPassword
          return
        }
        toast.success('저장했습니다.')
        await router.push('/users')
      },
    }
    void run<unknown>(
      lab.reauth
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
            hint="user001 처럼 이미 있는 아이디를 넣으면 서버가 409 ERR_DUPLICATE_USER_ID 를 낸다(L11)."
            label="아이디"
            name="userId"
            persistent-hint
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
          <p class="text-caption text-medium-emphasis">
            {{
              isDirty
                ? '저장하지 않은 변경이 있습니다 — 이 화면을 떠나면 확인창이 뜹니다.'
                : '변경 없음'
            }}
            <template v-if="!isNew"> · revision {{ revision }}</template>
          </p>
          <div class="user-edit__actions">
            <VBtn to="/users" variant="text">목록으로</VBtn>
            <VBtn
              :disabled="!canWrite || submitting || !isDirty || form.roleNo == null"
              :loading="submitting"
              type="submit"
              >저장</VBtn
            >
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

- [ ] **Step 3: 팀 화면 — 인원 목록을 사용자 목록 필터로**

`AKSV/src/pages/TeamsPage.vue`:

- import 줄 `import type { AdminTeamNode, AdminTeamTree } from '@ssworks/admin-shared'` →
  ```ts
  import type { AdminTeamNode, AdminTeamTree, AdminUser, Paginated } from '@ssworks/admin-shared'
  ```
- `interface Member { … }`(21-26행)를 지운다.
- `useTeamTree` 의 다섯 경로에 `/admin` 을 붙인다:
  ```ts
    load: () => api.get<AdminTeamTree>('/admin/teams/tree').then((r) => r.items),
    create: (body) => api.post('/admin/teams', body),
    rename: (teamNo, body) => api.patch(`/admin/teams/${teamNo}`, body),
    remove: (teamNo) => api.del(`/admin/teams/${teamNo}`),
    move: ({ teamNo, ...body }) => api.patch(`/admin/teams/${teamNo}/move`, body),
  ```
- `loadMembers`(54-63행)를 바꾼다 — README 「조직」 예제처럼 사용자 목록 필터:
  ```ts
  // 인원 목록 = 사용자 목록(소속 전체 · 하위 팀 포함 · 아이디 · 이름 부분일치). 실서버에는 /teams/members 가 없다
  const loadMembers = (q: TeamUserQuery) =>
    api.get<Paginated<AdminUser>>('/admin/users', {
      params: {
        page: q.page,
        itemsPerPage: q.itemsPerPage,
        filter: { teamNo: q.teamNo, recursive: q.recursive, keyword: q.keyword },
      },
    })
  ```
- 템플릿의 `<VChip v-else-if="node.teamNo === TEAM.SECURITY" …>403</VChip>` 줄을 지운다(가짜 전용 — 실서버는 "다음 요청 403" 으로 본다).

- [ ] **Step 4: 역할 화면 — 경로 · 새 권한 칸 · 함의 표**

`AKSV/src/pages/settings/RolesPage.vue`:

- import `import { P, permissions, type Permission } from '../../permissions'` → `import { IMPLIES, P, permissions, type Permission } from '../../permissions'`
- `categories` 배열 끝(두 번째 범주 뒤)에 범주 하나를 더한다 — 카탈로그에 더한 다섯 키를 매트릭스가 덮어야 `assertMatrixCoversPermissions` 가 던지지 않는다:
  ```ts
    {
      id: 'admin',
      label: '관리',
      columns: [
        { action: 'read', label: '읽기' },
        { action: 'write', label: '편집' },
        { action: 'publish', label: '발행' },
      ],
      rows: [
        { resource: 'settings.legal', label: '약관' },
        { resource: 'settings.ipAccess', label: 'IP 접근' },
        { resource: 'settings.auditLog', label: '감사 기록' },
      ],
    },
  ```
- `rolesApi` 다섯 경로:
  ```ts
    list: () => api.get<{ items: AdminRole[] }>('/admin/roles').then((r) => r.items),
    create: (body, ctx) => api.post<{ roleNo: bigint }>('/admin/roles', { ...body, ...ctx }).then((r) => r.roleNo),
    update: (roleNo, body, ctx) => api.patch(`/admin/roles/${roleNo}`, { ...body, ...ctx }).then(() => undefined),
    remove: (roleNo, body, ctx) => api.del(`/admin/roles/${roleNo}`, { ...body, ...ctx }).then(() => undefined),
    move: (roleNo, body) => api.patch(`/admin/roles/${roleNo}/move`, body).then(() => undefined),
  ```
- `useRoleEditor` 의 `implies: { … }` 객체를 `implies: IMPLIES,` 로 바꾼다(서버 정규화와 같은 표).

- [ ] **Step 5: 나머지 경로**

| 파일               | 바꿀 것 → 바뀐 것                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HomePage.vue:67`  | `api.post('/demo/reauth', { currentPassword })` → `api.post('/lab/reauth', { currentPassword })`                                                                                                                                                     |
| `AccountPage.vue`  | `'/auth/password'` → `'/admin/auth/password'`, `'/sessions/me'` → `'/admin/sessions/me'`, `` `/sessions/me/${row.sessionNo}` `` → `` `/admin/sessions/me/${row.sessionNo}` ``, `'/sessions/me/revoke-others'` → `'/admin/sessions/me/revoke-others'` |
| `SessionsPage.vue` | `'/sessions'` → `'/admin/sessions'`, `` `/sessions/${row.sessionNo}` `` → `` `/admin/sessions/${row.sessionNo}` ``, `` `/sessions/user/${row.userNo}` `` → `` `/admin/sessions/user/${row.userNo}` ``                                                |
| `PasswordPage.vue` | `'/auth/password'` → `'/admin/auth/password'`                                                                                                                                                                                                        |

`router.push` · `to=` 의 화면 경로(`/users` 등)는 바꾸지 않는다.

```bash
cd /c/Users/kim52/AppData/Local/Temp/aksv && grep -rnE "api\.(get|post|patch|put|del)[^(]*\(\s*['\`]/(auth|sessions|roles|teams|users|demo)" src || echo "남은 옛 경로 없음"
```

Expected: `남은 옛 경로 없음`.

- [ ] **Step 6: 약관 페이지 · 라우트**

`AKSV/src/pages/settings/LegalPage.vue`:

```vue
<script setup lang="ts">
  // 약관 — README 「약관 · Phase 2 서버를 쓰는 새 서비스」 배선 그대로(실서버 확인 X5~X7). 설정 셸 자식이라 ColumnPane 을 낸다.
  import type {
    AdminLegalCurrent,
    AdminLegalDocument,
    AdminLegalHistory,
  } from '@ssworks/admin-shared'
  import {
    ColumnPane,
    LegalDocumentEditor,
    useDirtyGuard,
    useLegalDocuments,
  } from '@ssworks/admin-ui'
  import { api } from '../../api/client'
  import { usePermission } from '../../composables/usePermission'
  import { toast } from '../../plugins/toast'
  import { P } from '../../permissions'

  const check = usePermission()

  const legal = useLegalDocuments({
    kinds: [
      { value: 'TERMS', label: '이용약관' },
      { value: 'PRIVACY', label: '개인정보처리방침' },
    ],
    loadCurrent: (kind) =>
      api
        .get<AdminLegalCurrent>('/admin/legal-documents/current', { params: { kind } })
        .then((r) => r.item),
    loadHistory: (kind) =>
      api
        .get<AdminLegalHistory>('/admin/legal-documents', { params: { kind } })
        .then((r) => r.items),
    loadOne: (legalDocNo) => api.get<AdminLegalDocument>(`/admin/legal-documents/${legalDocNo}`),
    publish: (body) => api.post('/admin/legal-documents', body),
    canWrite: () => check.hasPermission(P.LEGAL_PUBLISH),
    onDone: (e) => toast.success(e.message),
  })
  useDirtyGuard(() => legal.isDirty.value)
</script>

<template>
  <ColumnPane scrollable>
    <template #top>
      <div class="pa-4 text-subtitle-1 font-weight-medium">약관 · 개인정보처리방침</div>
    </template>
    <div class="pa-4">
      <LegalDocumentEditor v-bind="legal.editor.value" />
    </div>
  </ColumnPane>
</template>
```

`AKSV/src/router/index.ts` — `/settings` 의 `anyPermissions` 와 자식:

```ts
      anyPermissions: [P.SITE_READ, P.ROLES_READ, P.SECURITY_READ, P.LEGAL_READ],
```

`security` 자식 뒤에:

```ts
      {
        path: 'legal',
        component: () => import('../pages/settings/LegalPage.vue'),
        meta: { title: '약관', permissions: [P.LEGAL_READ], menu: { icon: 'mdi-file-document-outline', order: 3 } },
      },
```

- [ ] **Step 7: 타입 검사 · 빌드**

```bash
cd /c/Users/kim52/AppData/Local/Temp/aksv && pnpm build
```

Expected: `vue-tsc` 오류 0건, `vite build` 성공. `run<…>` 의 관문 유니온에서 타입 오류가 나면 킷의 `WriteRunOptions` d.ts(`node_modules/@ssworks/admin-ui/dist/…/useWriteFlow.d.ts`)를 보고 관문별 객체를 따로 만든 뒤 넘긴다 — 동작은 그대로 둔다. 이것이 B층 마찰이면 Task 5 의 `findings` 에 적는다.

- [ ] **Step 8: 브라우저로 화면을 한 바퀴 본다**

claude-in-chrome 으로 admin 로그인 뒤 차례로 연다: `/users` → `/users/new` → `/users/9007199254740993` → `/teams`(영업본부를 골라 인원 목록) → `/sessions` → `/settings/roles` → `/settings/legal` → `/account`. 화면마다:

- `javascript_tool` 로 `window.__aksvLab.log.filter((e) => e.status >= 400)` 가 빈 배열인지(예상한 401 갱신 말고).
- `read_console_messages`(pattern `error|warn`)가 비었는지.

막히는 화면은 이 Task 안에서 고치고 다시 연다. 고친 이유가 실서버 모양 · README 배선과의 차이면 메모해 두었다가 Task 5 Step 4 에서 `findings` 의 `template`(B층) · `doc`(README)로 옮긴다.

- [ ] **Step 9: 스냅숏**

```bash
cd /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad && node snapshot.mjs
```

---

### Task 5: 체크리스트 3장 — 항목 · 기록 · 생성

**Files:**

- Create: `SCRATCH/record.mjs`, `SCRATCH/gen-real.mjs`, `SCRATCH/items-real.mjs`, `SCRATCH/results.json`(`{}`), `SCRATCH/findings.json`
- Output: `SCRATCH/phase2-real-server-check.html`

**Interfaces:**

- Produces: `items-real.mjs` — `GROUPS: {key, name, note, items: Item[]}[]`, `ITEMS: Item[]`, `Item = {id, who: 'C'|'H'|'CH', title, how: string[], expect: string, change?: string}`, `finalOf(item, entry): 'pass'|'fail'|'na'|'open'`(순수 함수 — record · gen 이 함께 쓴다)
- Produces: `results.json` — `{ [id]: { claude?: Judgment, human?: Judgment } }`, `Judgment = {verdict: 'pass'|'fail'|'na', note, evidence: string[], at}`
- Produces: `findings.json` — `[{kind: 'defect'|'template'|'doc', title, detail, status: 'open'|'fixed'|'deferred', item?: string, at}]`
- Produces: CLI `node record.mjs <ID> <pass|fail|na> "<메모>" ["근거" …]` · `--import <파일>`(사람 — 줄마다 `ID<TAB>판정<TAB>메모`) · `--finding <kind> "<제목>" "<내용>" [status] [ID]` · `--status`
- 최종 판정: 필요한 쪽(C → claude, H → human, CH → 둘)이 모두 있고 실패가 없으면 통과(전부 해당 없음이면 해당 없음), 하나라도 실패면 실패, 모자라면 미판정

- [ ] **Step 1: 기록 도구를 쓴다**

`SCRATCH/record.mjs`:

```js
// 체크리스트 3장 판정 기록 — Claude 는 항목마다 이 명령으로 적는다(JSON 을 손으로 고치지 않는다).
//   node record.mjs <ID> <pass|fail|na> "<메모>" ["근거" …]        Claude 판정
//   node record.mjs --import human.txt                             사람 판정(페이지의 "기록 복사" 글 — ID<TAB>판정<TAB>메모)
//   node record.mjs --finding <defect|template|doc> "<제목>" "<내용>" [open|fixed|deferred] [ID]
//   node record.mjs --status                                       남은 항목
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ITEMS, finalOf } from './items-real.mjs'

const RESULTS = new URL('./results.json', import.meta.url)
const FINDINGS = new URL('./findings.json', import.meta.url)
const read = (file, empty) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : empty)
const write = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n')

const results = read(RESULTS, {})
const findings = read(FINDINGS, [])
const byId = new Map(ITEMS.map((item) => [item.id, item]))
const VERDICTS = new Set(['pass', 'fail', 'na'])

function put(id, verdict, by, note, evidence) {
  if (!byId.has(id)) throw new Error(`없는 항목 ${id}`)
  if (!VERDICTS.has(verdict)) throw new Error(`판정은 pass · fail · na — ${verdict}`)
  results[id] = { ...results[id], [by]: { verdict, note, evidence, at: new Date().toISOString() } }
}

const [first, ...rest] = process.argv.slice(2)
if (first === '--import') {
  let count = 0
  for (const line of readFileSync(rest[0], 'utf8').split(/\r?\n/)) {
    const m = /^(\S+)\t(pass|fail|na)(?:\t(.*))?$/.exec(line.trim())
    if (m) {
      put(m[1], m[2], 'human', m[3] ?? '', [])
      count += 1
    }
  }
  write(RESULTS, results)
  console.log(`사람 판정 ${count}줄을 합쳤다`)
} else if (first === '--finding') {
  const [kind, title, detail, status = 'open', item] = rest
  if (!['defect', 'template', 'doc'].includes(kind))
    throw new Error('kind 는 defect · template · doc')
  if (item && !byId.has(item)) throw new Error(`없는 항목 ${item}`)
  const existing = findings.find((f) => f.kind === kind && f.title === title)
  const next = {
    kind,
    title,
    detail,
    status,
    ...(item ? { item } : {}),
    at: new Date().toISOString(),
  }
  if (existing) Object.assign(existing, next)
  else findings.push(next)
  write(FINDINGS, findings)
  console.log(`발견 ${findings.length}건(${kind} · ${status}) — ${title}`)
} else if (first === '--status' || first === undefined) {
  const tally = { pass: 0, fail: 0, na: 0, open: 0 }
  const open = []
  for (const item of ITEMS) {
    const final = finalOf(item, results[item.id])
    tally[final] += 1
    if (final === 'open') open.push(`${item.id}(${item.who})`)
  }
  console.log(JSON.stringify(tally), '\n미판정:', open.join(' ') || '없음')
} else {
  const [verdict, note = '', ...evidence] = rest
  put(first, verdict, 'claude', note, evidence)
  write(RESULTS, results)
  console.log(`${first} ${verdict} — 기록 ${Object.keys(results).length}/${ITEMS.length}`)
}
```

`SCRATCH/results.json`: `{}` 한 줄. `SCRATCH/findings.json`: `[]` 한 줄.

- [ ] **Step 2: 생성기를 쓴다**

`SCRATCH/gen-real.mjs`:

```js
// 체크리스트 3장(실서버) 생성 — node gen-real.mjs → phase2-real-server-check.html
// Claude 판정 · 발견은 결과로 구워 넣고, 사람 판정이 필요한 항목에만 판정 버튼(브라우저 저장)과 "기록 복사" 를 둔다.
// 겉모습은 1 · 2장 생성기(prev/gen.mjs)의 CSS 를 그대로 쓴다.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { GROUPS, ITEMS, finalOf } from './items-real.mjs'

const here = (name) => new URL(`./${name}`, import.meta.url)
const results = JSON.parse(readFileSync(here('results.json'), 'utf8'))
const findings = JSON.parse(readFileSync(here('findings.json'), 'utf8'))
const BASE_CSS = /const CSS = `([\s\S]*?)`\n/.exec(readFileSync(here('prev/gen.mjs'), 'utf8'))[1]
const commit = execFileSync(
  'git',
  ['-C', 'C:/Users/kim52/workspace/ssworks-admin-kit', 'log', '-1', '--format=%h %s'],
  { encoding: 'utf8' },
).trim()
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const LABEL = { pass: '통과', fail: '실패', na: '해당 없음', open: '미판정' }
const WHO = { C: 'Claude', H: '사람', CH: 'Claude + 사람' }
const KIND = { defect: '패키지 결함', template: '템플릿 메모(B층)', doc: '문서' }
const STATUS = { open: '열림', fixed: '고침', deferred: '넘김' }

const tally = { pass: 0, fail: 0, na: 0, open: 0 }
for (const item of ITEMS) tally[finalOf(item, results[item.id])] += 1
const humanIds = ITEMS.filter((item) => item.who !== 'C' && !results[item.id]?.human).map(
  (item) => item.id,
)

const judgment = (who, j) =>
  j
    ? `<p class="judge"><span class="chip v-${j.verdict}">${who} · ${LABEL[j.verdict]}</span> ${esc(j.note)}${
        j.evidence.length
          ? `<br><span class="muted">근거: ${j.evidence.map(esc).join(' · ')}</span>`
          : ''
      }</p>`
    : ''

const itemHtml = (item) => {
  const entry = results[item.id]
  const final = finalOf(item, entry)
  return `<article class="item" data-final="${final}" id="i-${item.id}">
    <div class="item-head"><span class="item-id">${item.id}</span><span class="item-title">${esc(item.title)}</span>
      <span class="chip who">${WHO[item.who]}</span><span class="chip v-${final}">${LABEL[final]}</span></div>
    ${item.change ? `<p class="head"><b>실서버에서 바뀜</b> ${esc(item.change)}</p>` : ''}
    <ul>${item.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
    <p class="expect"><b>기대</b> ${esc(item.expect)}</p>
    ${judgment('Claude', entry?.claude)}${judgment('사람', entry?.human)}
    ${item.who !== 'C' && !entry?.human ? `<div class="verdict" data-id="${item.id}"></div>` : ''}
  </article>`
}

const html = `<title>실서버 확인 3장</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<style>${BASE_CSS}
  .item { display: grid; gap: 8px; padding: 16px 0; border-top: 1px solid var(--line); }
  .item-head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }
  .chip.who { background: var(--opt-bg); color: var(--opt); }
  .chip.v-pass { background: var(--pass-bg); color: var(--pass); }
  .chip.v-fail { background: var(--fail-bg); color: var(--fail); }
  .chip.v-na, .chip.v-open { background: var(--skip-bg); color: var(--skip); }
  .judge { margin: 0; font-size: 14px; }
  .tally { display: flex; flex-wrap: wrap; gap: 8px; }
  .finding { border-top: 1px solid var(--line); padding: 10px 0; display: grid; gap: 4px; }
</style>
<div class="page">
  <header>
    <div class="eyebrow">ssworks-admin-kit · Phase 2 끝 · admin-server 첫 발행 전 관문 · 3장</div>
    <h1>실서버 확인 3장</h1>
    <p class="lede">확인용 앱(aksv)을 실서버(akss — admin-server 0.4.0 + MariaDB 11.4, DB_SSL)에 붙여 1 · 2장의 서버 관여 항목 · 가짜 스위치 항목의 실서버판 · 실서버 전용 항목을 봤습니다. 스펙: docs/superpowers/specs/2026-10-16-aksv-real-server-design.md</p>
    <div class="meta">
      <span>기준 커밋 <code>${esc(commit)}</code></span>
      <span>패키지 admin-shared · admin-ui 0.4.0(npm) · admin-server 0.4.0(로컬 pack)</span>
      <span>Vite 8 · Vue 3.5 · Vuetify 4 · Nest 12 · Node 24 · Chrome(claude-in-chrome)</span>
      <span>생성 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
    </div>
    <div class="tally">${Object.entries(tally)
      .map(([k, n]) => `<span class="chip v-${k}">${LABEL[k]} ${n}</span>`)
      .join('')}<span class="muted">/ ${ITEMS.length}</span></div>
  </header>
  ${GROUPS.map(
    (
      g,
    ) => `<section class="block"><div class="block-head"><h2>${esc(g.name)}</h2><p class="muted">${esc(g.note)}</p></div>
    <div class="card">${g.items.map(itemHtml).join('')}</div></section>`,
  ).join('')}
  <section class="block"><div class="block-head"><h2>발견</h2><p class="muted">패키지 결함 · 템플릿 메모(B층) · 문서 — 결함과 템플릿 메모는 따로 셉니다.</p></div>
    <div class="card">${findings.length ? findings.map((f) => `<div class="finding"><div><span class="chip who">${KIND[f.kind]}</span> <span class="chip v-${f.status === 'fixed' ? 'pass' : f.status === 'open' ? 'fail' : 'na'}">${STATUS[f.status]}</span> <b>${esc(f.title)}</b>${f.item ? ` <span class="muted">${f.item}</span>` : ''}</div><div>${esc(f.detail)}</div></div>`).join('') : '<p class="muted">없음</p>'}</div>
  </section>
  ${
    humanIds.length
      ? `<section class="record"><h2>사람 판정 보내기</h2><p class="muted">사람 판정이 남은 항목: ${humanIds.join(' · ')}. 고른 결과는 이 브라우저에만 저장됩니다. 아래 글을 복사해 대화에 붙여 주세요.</p>
    <pre id="out" aria-live="polite"></pre><div class="actions"><button class="btn" id="copy-out" type="button">기록 복사</button><span class="status" id="status" role="status"></span></div></section>`
      : ''
  }
</div>
<script>
  (function () {
    var KEY = 'aksv-real-check-3'
    var LABEL = { pass: '통과', fail: '실패', na: '해당 없음' }
    var state = {}
    try { state = JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) {}
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) {} ; render() }
    function render() {
      var out = document.getElementById('out')
      if (!out) return
      out.textContent = Object.keys(state).filter(function (id) { return state[id].v }).map(function (id) { return id + '\\t' + state[id].v + '\\t' + (state[id].n || '') }).join('\\n') || '(아직 없음)'
      document.querySelectorAll('.verdict button').forEach(function (b) { b.setAttribute('aria-pressed', String((state[b.dataset.id] || {}).v === b.dataset.v)) })
    }
    document.querySelectorAll('.verdict').forEach(function (box) {
      var id = box.dataset.id
      ;['pass', 'fail', 'na'].forEach(function (v) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.dataset.id = id; b.textContent = LABEL[v]
        b.addEventListener('click', function () { state[id] = Object.assign({}, state[id], { v: v }); save() })
        box.appendChild(b)
      })
      var input = document.createElement('input'); input.type = 'text'; input.id = 'note-' + id; input.placeholder = '무엇이 보였나'
      input.setAttribute('aria-label', id + ' 메모'); input.value = (state[id] || {}).n || ''
      input.addEventListener('input', function () { state[id] = Object.assign({}, state[id], { n: input.value }); save() })
      box.appendChild(input)
    })
    var copy = document.getElementById('copy-out')
    if (copy) copy.addEventListener('click', function () {
      var text = document.getElementById('out').textContent
      navigator.clipboard.writeText(text).then(function () { document.getElementById('status').textContent = '복사했습니다' }, function () {
        var range = document.createRange(); range.selectNodeContents(document.getElementById('out'))
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
        document.getElementById('status').textContent = '복사가 막혔습니다 — 선택된 글을 Ctrl+C'
      })
    })
    render()
  })()
</script>
`
writeFileSync(here('phase2-real-server-check.html'), html)
console.log('phase2-real-server-check.html', JSON.stringify(tally))
```

- [ ] **Step 3: 항목을 쓴다(셸 · 인증 · 목록 · 쓰기)**

`SCRATCH/items-real.mjs` 앞부분. 방법 · 기대는 1 · 2장(`prev/items.mjs`)을 실서버 값으로 다시 쓴 것이고, `change` 는 1 · 2장과 달라진 점이다.

```js
// 체크리스트 3장(실서버) 항목 — 스펙 §8 의 62 항목. 원래 장 · ID 를 잇고(1-L12), 새 항목은 X.
// who: C = Claude, H = 사람, CH = 함께. 요청 기록은 실험 패널(또는 window.__aksvLab.log), 감사는 GET /__lab/audit.

const A = {
  key: 'A',
  name: '셸 · 인증',
  note: '쿠키 · 갱신 · 가드 · 권한이 실서버와 맞물리는지. 시작: admin / admin1234 로그인, 프리셋 전권, 지연 0.',
  items: [
    {
      id: '1-S3',
      who: 'C',
      title: '메뉴 권한 필터 · 현재 위치',
      how: [
        '실험 패널 권한 프리셋을 전권 → 제한 관리자 → 읽기 전용 → 권한 없음으로 바꾸며 메뉴를 본다',
        '실험 패널 "그룹 머리글 ↔ 접이식 그룹"',
        '"보고서" 를 누른다',
        '끝나면 프리셋 전권',
      ],
      expect:
        '프리셋마다 새로고침 없이 메뉴가 바뀐다(권한 없음이면 프리미티브 · 레이아웃 · 내 계정 · 깨진 청크 · 보고서만). 지금 화면 항목이 강조되고 "레이아웃" 아래 구분선, "보고서" 는 "준비 중" 칩 · 이동 없음. 요청 기록에 프리셋마다 GET /api/admin/auth/me 200.',
      change:
        '프리셋은 다른 관리자(other)가 admin 의 역할을 실제로 바꾸고, 패널이 앱 스토어 refresh() 를 부른다.',
    },
    {
      id: '1-S4',
      who: 'C',
      title: '앱바 제목 · 사용자 메뉴 · 로그아웃',
      how: [
        '앱바 제목을 본다',
        'Tab 으로 아바타 버튼 → Enter → Esc',
        '다시 열어 "내 계정" → 다시 열어 "로그아웃"',
      ],
      expect:
        '제목이 "확인용 관리자 · 화면 제목" 꼴이다. 메뉴에 김관리 · admin, 경영지원본부 · 최고 관리자, "내 계정". Enter 로 열리고 Esc 로 닫힌다. 로그아웃하면 로그인 화면이고 요청 기록에 POST /api/admin/auth/logout 200.',
    },
    {
      id: '1-S5',
      who: 'C',
      title: '미인증 → 로그인 → 원래 주소',
      how: [
        '로그아웃한 채 주소창에 http://localhost:5199/users?q=김&sort=userName:asc',
        'admin / admin1234 로그인',
      ],
      expect:
        '/login?redirect=… 로 가고, 로그인하면 쿼리 그대로 사용자 목록(검색칸 "김", 이름 오름차순). 로그인 화면 "돌아갈 곳" 줄이 그 주소. 요청 기록 GET /api/admin/users 의 쿼리에 filter[keyword]=김 · sortBy[]=userName · sortOrder[]=asc(인코딩)가 실리고 200.',
    },
    {
      id: '1-S6',
      who: 'C',
      title: '권한 없음 → /403 · 로그인 상태의 /login',
      how: [
        '프리셋 읽기 전용 → 주소창에 /settings/security',
        '로그인한 채 주소창에 /login',
        '끝나면 프리셋 전권',
      ],
      expect: '첫째는 "접근 권한 없음", 둘째는 홈(/). 403 에서 뒤로 가기가 막히지 않는다.',
    },
    {
      id: '1-S9',
      who: 'C',
      title: '401 → 갱신 한 번 → 재시도',
      how: [
        '/users 에서 실험 "액세스 토큰 만료" → 표 "새로 고침"',
        '다시 "액세스 토큰 만료" → "동시 요청 3개"',
        '요청 기록을 본다',
      ],
      expect:
        'GET /api/admin/users 401 → POST /api/admin/auth/refresh 200(갱신) → GET /api/admin/users 200(재시도), 화면 변화 · 토스트 없음. 동시 요청 3개는 401 셋 · 갱신 한 줄 · 재시도 셋.',
      change:
        '토큰 만료는 프록시가 다음 갱신까지 admin_at 쿠키를 빼서 일으킨다(쿠키가 만료된 브라우저와 같다). 진짜 만료는 X10.',
    },
    {
      id: '1-S10',
      who: 'C',
      title: '갱신도 실패 → 로그인',
      how: [
        '/users 에서 실험 "내 세션 끊기"(other 가 admin 의 세션을 모두 끊는다) → 표 "새로 고침"',
        '다시 로그인한다',
      ],
      expect:
        'GET 401 → refresh 401 → /login?redirect=/users… 로 가고 오류 토스트가 없다. 로그인하면 사용자 목록으로 돌아온다.',
      change: '세션 만료 스위치 대신 다른 관리자가 실제로 세션을 끊는다.',
    },
    {
      id: '1-S11',
      who: 'C',
      title: '전역 토스트와 처리됨',
      how: [
        '실험 "다음 요청 500" → 표 "새로 고침"',
        '"다음 요청 403" → "새로 고침"',
        '프리미티브의 ReauthDialog 에서 틀린 비밀번호 한 번 → 맞는 비밀번호(🔴 틀린 뒤 반드시 맞게 — 잠금 카운터)',
      ],
      expect:
        '500 은 "서버 내부 오류가 발생했습니다." 토스트(ERR_COMMON_INTERNAL — 서버가 원문을 가림), 403 은 "권한이 없습니다." 토스트(ERR_COMMON_FORBIDDEN)가 한 번씩. 재인증 실패는 대화상자 안 "비밀번호가 올바르지 않습니다." 뿐이고 토스트가 없다. 맞으면 닫히고 성공 토스트.',
      change: '실패는 akss 인터셉터가 실제 Nest 예외로 낸다 — 패키지 예외 필터를 지난 실제 봉투다.',
    },
    {
      id: '1-S12',
      who: 'C',
      title: 'IpBlockedDialog',
      how: [
        '실험 "막는 규칙 켜기"(other 가 admin 에게 127.0.0.0/8 만 허용) → "내 주소 203.0.113.9" → 표 "새로 고침"',
        '대화상자 바깥 · Esc',
        '대화상자 "로그아웃" → 로그인 화면에서 admin 로그인(주소는 203.0.113.9 그대로)',
        '실험 "내 주소 127.0.0.1" → 로그인 → "막는 규칙 끄기"',
      ],
      expect:
        '403 ERR_IP_NOT_ALLOWED 로 대화상자가 뜨고 접속 IP 203.0.113.9 가 보이며 바깥 · Esc 로 닫히지 않는다. 로그아웃하면 로그인 화면에서는 닫혀 있다. 막힌 주소의 로그인은 로그인 화면 문구 "아이디 또는 비밀번호가 올바르지 않거나, … 허용되지 않은 접속 위치입니다."(401 ERR_LOGIN_FAILED). 주소를 되돌리면 로그인된다.',
      change:
        '1장은 "차단인 채 로그인하면 로그인 화면에서도 대화상자" — 실서버는 막힌 로그인을 비밀번호 틀림과 같은 401 로 답한다(2f-2a 결정, 오라클 없음).',
    },
    {
      id: 'X1',
      who: 'C',
      title: '쿠키 속성',
      how: ['로그아웃 → 로그인 → 실험 "쿠키 보기"', 'javascript_tool 로 document.cookie'],
      expect:
        'admin_at · admin_rt 두 줄 모두 HttpOnly · SameSite=Lax · Path=/ 이고 Secure 가 없다(http). admin_at Max-Age=900, admin_rt Max-Age=604800. document.cookie 에 둘 다 안 보인다.',
    },
    {
      id: 'X2',
      who: 'C',
      title: '회전 · 재사용 탐지',
      how: [
        '실험 "액세스 토큰 만료" → 표 "새로 고침"(회전 한 번 — 패널에 "옛 refresh 있음")',
        '30초 넘게 기다린다(유예)',
        '실험 "옛 refresh 재사용" → 표 "새로 고침"',
        '다시 로그인해 /sessions 에서 admin 세션을 본다',
      ],
      expect:
        '재사용 응답이 401(재사용 탐지)이고, 브라우저의 다음 요청이 401 → 갱신 401 → 로그인 화면(토스트 없음). 다시 로그인한 뒤 그 세션이 목록에 없다.',
    },
    {
      id: 'X3',
      who: 'C',
      title: '로그인 잠김',
      how: [
        '실험 "대상 아이디" user003 → "비밀번호 초기화"(임시 비밀번호를 적어 둔다)',
        '로그아웃 → user003 로 틀린 비밀번호 5번 → 임시 비밀번호(맞음)',
        'admin 쪽 실험 패널은 로그아웃 상태에서도 쓸 수 있다 — "잠금 해제"(user003) → user003 임시 비밀번호로 로그인',
        '끝나면 로그아웃 → admin',
      ],
      expect:
        '다섯 번 모두 같은 401 문구이고, 잠긴 뒤 맞는 비밀번호도 같은 401 이다. 잠금 해제 뒤에는 로그인되고 강제 변경(/password)으로 간다.',
      change: '잠김은 423 이 아니라 비밀번호 틀림과 같은 401 문구다(2b R7 결정).',
    },
  ],
}

const B = {
  key: 'B',
  name: '목록 · 쓰기',
  note: '실제 쿼리 형식 · 봉투 · 쓰기 관문. 시작: 프리셋 전권, 지연 0, 화면 재인증 끔(서버와 같게).',
  items: [
    {
      id: '1-P8',
      who: 'C',
      title: '표 바닥글 · 정렬 라벨',
      how: ['/users 표의 바닥글과 오른쪽 위 정렬 라벨', '쪽 이동 · 쪽당 개수 선택지를 연다'],
      expect:
        '바닥글이 한국어이고 총 202. 쪽당 10 · 20 · 50 · 100 뿐("전체" 없음). "정렬: 가입일 내림차순" 이 열 머리 화살표와 맞는다. 불러오는 동안 진행 막대.',
    },
    {
      id: '1-L1',
      who: 'C',
      title: 'URL ↔ 목록 상태',
      how: [
        '/users 에서 차례로: 다음 쪽(›) → "아이디" 열 머리 → 쪽당 50 → 검색칸 "user1" 적용',
        '조작마다 주소와 요청 기록',
      ],
      expect:
        '주소가 ?page=2 → &sort=userId:asc → size=50(page 사라짐) → q=user1 로 바뀌고 기본값은 주소에 없다. 조작마다 GET /api/admin/users 가 한 번이고 page · itemsPerPage · sortBy[] · sortOrder[] · filter[keyword] 로 실려 200.',
    },
    {
      id: '1-L2',
      who: 'C',
      title: '새로고침 복원',
      how: ['L1 의 주소에서 F5'],
      expect:
        '표 · 검색칸 글자 · 정렬 화살표 · 쪽당 개수가 그대로이고 GET /api/admin/users 가 한 번.',
    },
    {
      id: '1-L3',
      who: 'C',
      title: '다른 화면에 다녀와 복원 · 같은 메뉴로 초기화',
      how: ['L1 상태에서 메뉴 "레이아웃" → 뒤로 가기', '메뉴 "사용자" 를 다시 누른다'],
      expect: '뒤로 가기면 그 상태 그대로, 같은 메뉴를 다시 누르면 기본 상태 · 빈 검색칸.',
    },
    {
      id: '1-L4',
      who: 'CH',
      title: '한글 검색어',
      how: [
        'Claude: 검색칸에 "김" → 적용 → 주소 · F5 · 다른 메뉴 다녀오기',
        '사람: "김" 을 조합 중(밑줄)인 채 Enter',
      ],
      expect:
        '마지막 글자까지 한 번만 적용되고 주소에 인코딩되어 실린다. 결과는 이름에 "김" 이 든 사용자뿐(서버 keyword 부분일치). 돌아와도 검색칸에 "김".',
    },
    {
      id: '1-L5',
      who: 'C',
      title: '늦은 응답을 버림',
      how: [
        '실험 지연 "뒤섞기"(akss 가 0.2~2.5초 무작위)',
        '바닥글 다음 쪽(›)을 빠르게 세 번(1 → 4쪽)',
        '요청 기록의 응답 순서와 표',
        '끝나면 지연 0',
      ],
      expect: '응답이 뒤섞여 와도 표는 4쪽에서 멈추고, 늦게 온 앞 쪽이 잠깐이라도 비치지 않는다.',
      change: '지연은 서버가 실제로 늦게 답한다.',
    },
    {
      id: '1-L6',
      who: 'C',
      title: '정렬 세 번째 클릭',
      how: ['"아이디" 열 머리를 세 번 누른다'],
      expect: '오름 → 내림 → 기본(가입일 내림차순). 화살표 · 정렬 라벨 · 주소가 같은 값.',
    },
    {
      id: '1-L7',
      who: 'C',
      title: '조회 실패에도 쪽 번호 유지',
      how: ['다음 쪽 두 번(3쪽) → 실험 "다음 요청 500" → "새로 고침"', '다시 "새로 고침"'],
      expect:
        '실패하면 표가 비고 토스트 "서버 내부 오류가 발생했습니다." 가 뜨지만 쪽 번호 · 주소의 page=3 은 남는다. 다시 하면 3쪽.',
    },
    {
      id: '1-L8',
      who: 'C',
      title: 'EmptyState',
      how: ['검색칸 "없는이름" 적용', '프리셋 읽기 전용에서도 본다 → 끝나면 전권'],
      expect:
        '"조건에 맞는 사용자가 없습니다" 와 안내, 만들기 버튼 없음. "데이터 0건" 갈래는 실서버에서 사용자를 비울 수 없어 해당 없음(메모로).',
      change: '"사용자 비우기" 스위치가 없다.',
    },
    {
      id: '1-L9',
      who: 'C',
      title: '확인 관문 · 이중 클릭',
      how: [
        '실험 지연 3초',
        'user002 행 "퇴사 처리" → 퇴사일(오늘 그대로) "다음" → 확인창 "퇴사 처리" 를 빠르게 두 번',
        '끝나면 지연 0',
      ],
      expect:
        '빨간 확인 버튼과 "되돌릴 수 없습니다" 안내. 요청 중 버튼이 돌며 잠기고 요청 기록에 POST /api/admin/users/…/resign 이 한 줄. 끝나면 user002 상태 "퇴사 예정"(오늘까지 근무).',
      change: '퇴사가 퇴사일을 먼저 묻는다(실서버는 resignDate 필수).',
    },
    {
      id: '1-L11',
      who: 'C',
      title: '필드 오류',
      how: ['/users/new 에서 아이디 user001 · 이름 · 역할 · 팀 → 저장'],
      expect: '서버 문구가 아이디 칸 아래에만 보이고 토스트가 없다.',
      change:
        '실서버는 아이디 중복을 400 검증 오류가 아니라 409 ERR_DUPLICATE_USER_ID 로 답한다 — useWriteFlow 는 검증 오류만 칸에 놓으므로 토스트로 나오면 실패로 적고 층(킷 · 서버 · 앱)을 판단한다. "폼 밖 필드 오류" 갈래는 실서버에서 일으킬 길이 없어 해당 없음.',
    },
    {
      id: '1-L12',
      who: 'C',
      title: 'revision 충돌',
      how: [
        'user010 "편집" → 이름을 고친다',
        '실험 "사용자 수정(이 화면)"(other 가 같은 사용자를 고친다) → "저장"',
        '"다시 불러오기" → 다시 고쳐 저장',
      ],
      expect:
        '경고 알림 "다른 관리자가 먼저 고쳤습니다…" 가 뜨고 토스트가 없으며 고친 이름이 칸에 남는다(409 ERR_COMMON_REVISION_CONFLICT). 다시 불러오면 other 가 바꾼 이름(끝에 " ·")과 새 revision 이고, 다시 저장하면 된다.',
    },
    {
      id: 'X8',
      who: 'C',
      title: 'bigint 실물',
      how: [
        '/users 를 "가입일" 오름차순으로 — 김관리(admin) 행',
        '번호 칸 · "편집" 주소',
        '이름을 고쳐 저장 → 되돌려 저장',
      ],
      expect:
        '번호 칸 9007199254740993, 주소 /users/9007199254740993, 편집 화면이 그 사람을 열고 저장 200(요청 기록 PATCH /api/admin/users/9007199254740993). 끝자리가 …992 · …000 으로 틀어지지 않는다.',
    },
  ],
}
```

- [ ] **Step 4: 항목을 쓴다(역할 · 세션 · 팀 · 약관 · 재기동 · 횡단) — 같은 파일에 이어 붙인다**

```js
const C = {
  key: 'C',
  name: '역할 · 세션 · 팀',
  note: 'admin-ui 컴포저블이 기대하는 모양과 실서버 응답. 순서가 상태에 기댄다: C1 → C3 → C12(비밀번호 변경이 다른 세션을 끊는다), T5 → T14 · T15 → T1 · T2(QA팀이 옮겨진다), R12 · R14 뒤에는 "시드 역할 되돌리기".',
  items: [
    {
      id: '2-R3',
      who: 'C',
      title: '권한별 설정 메뉴',
      how: [
        '프리셋 전권 → 제한 관리자 → 읽기 전용 → 권한 없음으로 바꾸며 설정을 연다',
        '끝나면 전권',
      ],
      expect:
        '전권은 사이트 · 역할 · 보안 · 약관, 제한 관리자 · 읽기 전용은 사이트 · 역할, 권한 없음은 /403.',
      change: '약관 메뉴가 더해졌다(settings.legal:read).',
    },
    {
      id: '2-R8',
      who: 'C',
      title: '권한 상승 방지',
      how: [
        '프리셋 제한 관리자 → 설정 → 역할',
        '"조회 전용" · "최고 관리자" · "고객 지원" 을 차례로 고른다',
        '"최고 관리자" 이름 끝에 "2" 를 붙여 저장 → 되돌려 저장',
        '끝나면 전권',
      ],
      expect:
        '갖지 않은 칸(직원 삭제 · 세션 편집 · 사이트 설정 편집 · 보안 설정 읽기 · 관리 범주 전부)은 비활성. 최고 관리자 · 고객 지원은 "내 권한보다 넓은 역할…" 안내와 함께 매트릭스가 잠기고 전체 권한 스위치도 잠긴다. 이름만 고친 저장은 200 이다(서버도 permissions 를 보낼 때만 지배를 판정).',
    },
    {
      id: '2-R9',
      who: 'C',
      title: '순서 이동',
      how: ['역할 하나를 고쳐 둔 채 다른 역할의 ↑↓', '맨 위 · 맨 아래 역할의 버튼'],
      expect:
        '순서가 바로 바뀌고 토스트, 맨 위 ↑ · 맨 아래 ↓ 비활성, 고치던 폼과 선택이 그대로(PATCH …/move 200, rev 안 오름).',
    },
    {
      id: '2-R10',
      who: 'C',
      title: '역할 revision 충돌',
      how: [
        '역할 하나를 고치다 실험 "역할 수정"(other 가 모든 역할 이름에 " ·") → 저장',
        '같은 역할을 목록에서 다시 고른다',
        '끝나면 "시드 역할 되돌리기"',
      ],
      expect:
        '경고 배너 · 고친 폼 남음 · 토스트 없음(409). 다시 고르면 최신 값(이름 끝 " ·", rev +1)으로 열리고 배너가 사라진다.',
    },
    {
      id: '2-R11',
      who: 'C',
      title: '저장 버튼 상태',
      how: ['변경 없이 · 이름을 비운 채 저장 버튼', '지연 3초로 저장 → 끝나면 지연 0'],
      expect: '앞 둘은 비활성. 요청 중 돌며 잠기고 성공하면 "역할을 저장했습니다.".',
    },
    {
      id: '2-R12',
      who: 'C',
      title: '내 역할을 저장하면 권한이 바로 바뀜',
      how: [
        '프리셋 제한 관리자 → 설정 → 역할 → "운영 관리자"("지금 로그인한 계정의 역할입니다")',
        '"역할 읽기" 를 끄고(편집도 함께) 저장',
        '끝나면 실험 "시드 역할 되돌리기" → 프리셋 전권',
      ],
      expect:
        '새로고침 없이 설정 메뉴에서 "역할" 이 사라지고 /403. 확인 창이 뜨지 않고 오류 토스트가 깜빡이지 않는다.',
    },
    {
      id: '2-R14',
      who: 'C',
      title: '역할 삭제',
      how: [
        '"고객 지원" 삭제',
        '"조회 전용" 삭제',
        '끝나면 "시드 역할 되돌리기"(고객 지원을 다시 만든다)',
      ],
      expect:
        '고객 지원은 되돌릴 수 없음 확인 뒤 사라지고 첫 역할이 열린다. 조회 전용은 쓰는 계정이 있어 서버 문구 토스트(409)가 뜨고 남는다.',
    },
    {
      id: '2-C1',
      who: 'C',
      title: '기기 문구',
      how: ['/account 의 "내 세션" 표'],
      expect:
        '내 행은 지금 브라우저(예: "Chrome · Windows")와 "이 기기" 칩, 그 아래 원문. 시드가 만든 다른 행에 "Safari · iOS" · "Samsung Internet · Android" · "Whale · macOS" · "기기 정보 없음" 이 있다(확인 스크립트가 남긴 행이 더 있을 수 있다).',
      change: '세션은 시드가 User-Agent · X-Real-IP 를 바꿔 실제로 로그인해 만든 것이다.',
    },
    {
      id: '2-C2',
      who: 'C',
      title: '지금 세션은 끝내기가 없음',
      how: ['내 행과 다른 행의 버튼', '다른 행 하나를 "끝내기"'],
      expect:
        '내 행에는 "이 기기는 로그아웃으로 끝냅니다." 만. 다른 행은 되돌릴 수 없음 확인 뒤 사라지고 "세션을 끝냈습니다.".',
    },
    {
      id: '2-C3',
      who: 'C',
      title: '다른 세션 모두 끝내기',
      how: ['"다른 세션 모두 끝내기" → "모두 끝내기"'],
      expect: '"다른 세션 ○개를 끝냈습니다." 가 뜨고 버튼이 비활성이 된다.',
    },
    {
      id: '2-C4',
      who: 'C',
      title: '관리자 전체 세션 목록',
      how: ['/sessions 에서 쪽을 넘기고 "user0" 검색', '다른 사람 행 "사용자 전체 끊기"'],
      expect:
        '사용자 열 "이름 (아이디)" · 로그인 열, 쪽 이동 · 검색이 된다. 확인 뒤 그 사람의 세션이 사라지고 "세션 ○개를 끊었습니다.".',
    },
    {
      id: '2-C5',
      who: 'C',
      title: '내 계정 전체 끊기',
      how: ['/sessions 의 김관리(admin) 행 "사용자 전체 끊기"', '다시 로그인'],
      expect: '"이 계정은 지금 로그인한 당신 자신입니다…" 1인칭 경고, 확인하면 로그인 화면.',
    },
    {
      id: '2-C7',
      who: 'CH',
      title: '임시 비밀번호 실제 복사',
      how: [
        'Claude: /users 의 user005 "비밀번호 초기화" → 확인 → 임시 비밀번호 대화상자의 값 · 복사 아이콘',
        '사람: 복사 아이콘 → 메모장에 붙여 넣기',
      ],
      expect:
        '값은 16자(서버 TEMPORARY_PASSWORD_LENGTH). 복사하면 값 아래 "임시 비밀번호를 복사했습니다.", 메모장에 같은 16자.',
    },
    {
      id: '2-C12',
      who: 'C',
      title: '틀린 현재 비밀번호',
      how: [
        '/account 비밀번호 변경: 틀린 현재 비밀번호로 제출 → 현재 칸을 고친다 → 맞게 제출(새 비밀번호 admin12345)',
        '🔴 C13 에서 admin1234 로 되돌린다',
      ],
      expect:
        '현재 칸 아래 서버 문구(400 details.issues currentPassword) · 포커스가 그 칸 · 토스트 없음. 고치면 문구가 사라지고, 성공하면 세 칸이 비고 토스트.',
    },
    {
      id: '2-C13',
      who: 'C',
      title: '이중 제출',
      how: [
        '지연 3초 → 비밀번호 변경(현재 admin12345 · 새 admin1234)의 마지막 칸에서 Enter 를 빠르게 여러 번',
        '끝나면 지연 0',
      ],
      expect:
        '요청 기록에 PATCH /api/admin/auth/password 가 한 줄. 요청 중 칸이 readonly 라 글자 · 포커스가 그대로. 비밀번호가 admin1234 로 돌아온다.',
    },
    {
      id: '2-C14',
      who: 'C',
      title: '강제 변경 흐름',
      how: [
        '실험 "대상 아이디" user001 → "비밀번호 초기화"(임시 비밀번호)',
        '로그아웃 → user001 로그인',
        '주소창에 /teams',
        '새 비밀번호 user001-pass-1 로 바꾼다',
        '끝나면 로그아웃 → admin',
      ],
      expect:
        '어느 화면이든 /password?redirect=… 로 가고 "임시 비밀번호로 로그인했습니다" 안내와 로그아웃만 있다. 그 동안 /auth/me 의 permissions 는 비어 있다. 바꾸면 원래 주소(/teams — 조회 전용이라 열린다)로 가고 다시 막히지 않는다.',
      change: '실험 스위치 대신 진짜 임시 비밀번호 로그인이다.',
    },
    {
      id: '2-T5',
      who: 'C',
      title: '↑↓ 버튼과 포커스',
      how: ['/teams 드래그 끔', 'Tab 으로 개발본부 아래 "QA팀" 의 ↑ → Enter 두 번'],
      expect:
        '첫째 ↑ · 막내 ↓ 비활성. 두 번 다 옮겨지고(PATCH /api/admin/teams/13/move 200) 포커스가 QA팀의 ↑ 에 남는다(맨 위가 되면 ↓ 로).',
    },
    {
      id: '2-T9',
      who: 'C',
      title: '입력칸 오류',
      how: [
        '"재무팀" 이름 바꾸기 → "인사팀" Enter',
        '이름을 비우고 Enter, 비운 채 바깥 클릭',
        '65자 붙여 넣고 Enter',
      ],
      expect:
        '중복은 입력칸 아래 서버 문구(409 ERR_DUPLICATE_TEAM_NAME) · 글자 남음 · 토스트 없음. 빈 Enter 는 "팀 이름을 입력하세요.", 빈 채 바깥은 조용히 닫힘. 65자는 "팀 이름은 64자 이하로 정하세요.".',
    },
    {
      id: '2-T13',
      who: 'C',
      title: '팀 삭제',
      how: ['"해외법인" 삭제(인원 없음 · 하위 2)', '"영업1팀" 삭제(인원 있음)'],
      expect:
        '해외법인은 "그 아래 팀 2개를 함께 지웁니다" 확인 뒤 사라진다. 영업1팀은 서버 문구 토스트(409 ERR_TEAM_HAS_MEMBERS)가 뜨고 남는다.',
    },
    {
      id: '2-T14',
      who: 'C',
      title: '인원 저절로 다음 쪽',
      how: [
        '실험 요청 기록 "지우기" → "영업본부" 를 고른다',
        '스크롤 전 /api/admin/users 줄을 센다',
        '인원 목록을 끝까지 스크롤하고 다시 센다',
      ],
      expect:
        '"총 130명". 스크롤 전에는 page=1 · itemsPerPage=100 · filter[teamNo] 한 줄과 100명, 끝 가까이 page=2 가 나가 30명이 붙고 그 사이 "더 불러오기(30명 남음)" 가 돈다. 스크롤바는 인원 칸에 하나.',
      change:
        '인원 목록이 /teams/members 가 아니라 사용자 목록 필터(/admin/users?filter[teamNo]&filter[recursive])다.',
    },
    {
      id: '2-T15',
      who: 'C',
      title: 'ID 검색 · 하위 팀 포함',
      how: ['영업본부에서 "user13" Enter', '"하위 팀 포함" 을 켠다', '다른 팀을 고른다'],
      expect:
        'Enter 로만 검색되어 "총 2명"(user013 · user130). 하위 팀 포함이면 검색어가 남은 채 "총 11명". 팀을 바꾸면 고른 사람이 풀린다.',
      change: '검색은 서버 keyword(아이디 · 이름 부분일치)다.',
    },
    {
      id: '2-T1',
      who: 'CH',
      title: '드래그 · 같은 상위 팀',
      how: [
        '"드래그로 옮기기" 를 켠다',
        '"영업2팀" 을 끌어 "영업1팀" 위에 놓는다(Claude 가 left_click_drag 로 해 보고, 안 되면 사람)',
      ],
      expect:
        '확인 없이 저장되고 "「영업2팀」의 순서를 바꿨습니다." 토스트. 다시 불러와도 그 자리.',
    },
    {
      id: '2-T2',
      who: 'CH',
      title: '드래그 · 다른 상위 팀',
      how: [
        '"QA팀" 을 끌어 "영업본부" 안에 놓는다 → 확인창에서 한 번은 "취소" · Esc, 한 번은 "옮기기"',
      ],
      expect:
        '확인창(되돌릴 수 있음). 취소 · Esc 면 놓기 전 모양이고 요청이 없다. 옮기기면 영업본부 아래로.',
    },
    {
      id: '2-T3',
      who: 'CH',
      title: '드래그 실패 원위치',
      how: ['실험 "다음 요청 500" → 같은 상위 팀 안에서 끌어 놓는다'],
      expect: '놓기 전 모양으로 돌아가고 오류 토스트 "서버 내부 오류가 발생했습니다.".',
    },
    {
      id: '2-T16',
      who: 'C',
      title: '다음 쪽 실패 · 403 팀',
      how: [
        '영업본부를 고르고 첫 쪽이 온 뒤 실험 "다음 요청 500" → 끝까지 스크롤',
        '실험 "다음 요청 403" → 다른 팀(보안팀)을 고른다',
      ],
      expect:
        '끝에 "더 불러오지 못했습니다" 와 다시 시도가 뜨고 저절로 부르기가 멈춘다. 403 은 "이 팀의 인원을 볼 권한이 없습니다…" 이고 토스트가 없다.',
      change: '가짜의 "보안팀은 늘 403" 대신 다음 요청 403.',
    },
    {
      id: 'X4',
      who: 'C',
      title: '팀 삭제와 IP 규칙',
      how: [
        '실험 "팀 IP 규칙 켜기"(영업기획팀)',
        '"영업기획팀" 삭제',
        '실험 "팀 IP 규칙 끄기" → 다시 삭제',
      ],
      expect:
        '첫 삭제는 서버 문구 토스트(409 ERR_TEAM_HAS_IP_RULES)가 뜨고 팀이 남는다. 규칙을 끄면 삭제된다.',
    },
  ],
}

const D = {
  key: 'D',
  name: '약관',
  note: '새 페이지 — LegalDocumentEditor + useLegalDocuments(README 배선 그대로).',
  items: [
    {
      id: 'X5',
      who: 'CH',
      title: '약관 첫 발행',
      how: [
        '설정 → 약관 → 이용약관: 미발행 표시를 본다',
        '편집기에 "# 이용약관\\n\\n제1조 목적" → 발행 확인',
        '시행 정보 · 이력 · 이력 행 원문 보기',
        '개인정보처리방침 탭도 한 번',
        '사람: 편집기 · 미리보기 겉모습(두 테마)',
      ],
      expect:
        '미발행이면 그 안내, 발행 뒤 시행 정보(김관리 · 해시), 이력 한 행, 원문 대화상자에 본문. 요청 기록 POST /api/admin/legal-documents 201 · GET /api/admin/legal-documents/{번호} 200.',
    },
    {
      id: 'X6',
      who: 'C',
      title: '같은 본문 409',
      how: ['같은 본문을 그대로 다시 발행'],
      expect:
        '409 ERR_COMMON_CONFLICT "이전 버전과 내용이 같습니다." 가 화면에 보이고(토스트 또는 편집기 안 — 어느 쪽인지 메모) 초안이 남는다.',
    },
    {
      id: 'X7',
      who: 'C',
      title: '기준 판 충돌',
      how: ['본문을 고치는 중 실험 "약관 발행"(other 가 TERMS 를 먼저 발행) → 내 발행'],
      expect:
        '409 ERR_COMMON_REVISION_CONFLICT → 편집기 충돌 안내 · 초안 남음 · 토스트 없음. 다시 발행하면 그 판을 대체한다.',
    },
  ],
}

const E = {
  key: 'E',
  name: '재기동 단계',
  note: 'akss 를 env 로 다시 띄워 본다 — 재인증(AKSS_REAUTH=true) · 진짜 만료(AKSS_ACCESS_TTL_MS=20000). 세션은 DB 에 있어 로그인이 남는다.',
  items: [
    {
      id: '1-L10',
      who: 'C',
      title: '재인증 관문',
      how: [
        '재인증 단계: akss 를 AKSS_REAUTH=true 로 다시 띄우고 실험 패널 "화면 재인증" 을 켠다',
        '/users 한 행 "비밀번호 초기화" → 틀린 비밀번호 → 맞는 비밀번호',
      ],
      expect:
        '틀리면 대화상자 안 "비밀번호가 올바르지 않습니다."(403 ERR_REAUTH_REQUIRED) · 토스트 없음. 맞으면 닫히고 임시 비밀번호 대화상자.',
      change:
        '재인증은 서버 기동 옵션이라 단계를 나눠 본다. 재인증 실패는 로그인 잠금 카운터에 더해진다.',
    },
    {
      id: '2-R13',
      who: 'C',
      title: '재인증 옵션',
      how: [
        '같은 단계: 설정 → 사이트 → 역할로 다시 연다',
        '저장 · 삭제(고객 지원) · 순서 이동',
        '끝나면 "시드 역할 되돌리기"',
      ],
      expect: '저장 · 삭제는 비밀번호를 묻고, 순서 이동은 묻지 않는다.',
    },
    {
      id: 'X10',
      who: 'C',
      title: '진짜 만료',
      how: [
        'akss 를 AKSS_ACCESS_TTL_MS=20000(재인증 끔)으로 다시 띄우고 실험 패널 "화면 재인증" 끔',
        '로그아웃 → 로그인 → 21초 기다린다',
        '표 "새로 고침" → 21초 → "동시 요청 3개"',
      ],
      expect:
        'S9 와 같은 줄(401 → 갱신 200 → 재시도 200, 동시 셋은 갱신 한 줄)이 프록시 조작 없이 나온다. 화면 변화 · 토스트 없음.',
    },
  ],
}

const F = {
  key: 'F',
  name: '횡단 · 재확인',
  note: '실행 내내 모은 것을 마지막에 판정 + 1장이 남긴 재확인 셋.',
  items: [
    {
      id: 'X9',
      who: 'C',
      title: '오류 봉투',
      how: ['판정 내내 window.__aksvLab.log 의 status >= 400 줄을 모은다'],
      expect:
        '모든 오류 응답이 envelope: true({success:false, code, message})이고 500 은 문구를 가린다.',
    },
    {
      id: 'X11',
      who: 'C',
      title: '감사 행',
      how: [
        '쓰기를 한 항목마다 GET /__lab/audit?limit=5 로 마지막 행을 본다',
        '마지막에 action 별로 훑는다(org.user.* · org.role.* · org.team.* · setting.legal.publish · setting.ipAccess.* · 세션 끊기 · 로그인)',
      ],
      expect:
        '쓰기마다 한 행, 행위자가 admin · other 로 맞다. meta 에 임시 비밀번호 · 약관 본문이 없다. 실패한 쓰기(409 · 403)는 statusCode · errorCode 와 함께 남는다.',
    },
    {
      id: 'X12',
      who: 'C',
      title: '콘솔',
      how: ['판정 내내 read_console_messages 로 모은다'],
      expect: 'Vue 경고 · 예외가 0 이고, 네트워크 오류 줄은 의도한 4xx · 5xx 뿐이다.',
      change: '1 · 2장 G5 는 가짜 서버라 네트워크 줄이 없었다.',
    },
    {
      id: '1-P6',
      who: 'C',
      title: 'ReauthDialog 오류 · 입력',
      how: [
        '/ 에서 "ReauthDialog" — 칸을 누르지 않고 바로 친다',
        '틀린 비밀번호 → Enter',
        'admin1234 → Enter',
        '다시 열어 칸을 본다',
      ],
      expect:
        '열자마자 칠 수 있다(activeElement 가 비밀번호 칸). 틀리면 대화상자 안 빨간 알림 "비밀번호가 올바르지 않습니다." · 닫히지 않음 · 토스트 없음(POST /api/lab/reauth 403). 맞으면 닫히고 성공 토스트(200). 다시 열면 칸이 비고 포커스가 칸에.',
      change: '시연 라우트가 akss 의 쓰는 쪽 라우트(패키지 AdminReauthService)다 — 문구는 서버 것.',
    },
    {
      id: '1-P9',
      who: 'C',
      title: 'AdminToast 바뀜과 표시 시간',
      how: [
        '/ 의 "토스트 표시 시간" 카드에서 성공 · 정보 · 경고 · 오류를 하나씩(마우스는 토스트에서 뗀다)',
        '"오류 두 번(4초 간격)" · "같은 문구 두 번(4초 간격)"',
        '카드 아래 "○초 보임" 줄을 읽는다',
      ],
      expect:
        '3 · 4 · 5 · 6초(±0.3). 새 토스트가 앞 것을 바꾸고(한 번 깜빡임) 두 번째 오류 · 같은 문구도 다시 6초.',
    },
    {
      id: '1-G4',
      who: 'CH',
      title: '오버레이 포커스 가두기와 복귀',
      how: [
        '/ 에서 Tab 으로 "Confirm · 되돌릴 수 있음" → Enter',
        '대화상자에서 Tab 여러 번 → "취소"(Enter)',
        '닫힌 직후 Tab 한 번. 앱바 사용자 메뉴도 같은 식으로',
        'Claude 는 단계마다 document.activeElement 를 재고, 사람은 눈으로',
      ],
      expect:
        '열린 동안 Tab 이 대화상자 안에서만 돈다. 닫으면 포커스가 연 버튼으로 돌아오고 다음 Tab 은 그 옆 버튼.',
    },
  ],
}

export const GROUPS = [A, B, C, D, E, F]
export const ITEMS = GROUPS.flatMap((group) => group.items)

/** 필요한 쪽(C → claude, H → human, CH → 둘)이 모두 있고 실패가 없으면 통과, 하나라도 실패면 실패, 모자라면 미판정 */
export function finalOf(item, entry) {
  const need = item.who === 'C' ? ['claude'] : item.who === 'H' ? ['human'] : ['claude', 'human']
  const got = need.map((key) => entry?.[key]).filter(Boolean)
  if (got.some((j) => j.verdict === 'fail')) return 'fail'
  if (got.length < need.length) return 'open'
  return got.every((j) => j.verdict === 'na') ? 'na' : 'pass'
}
```

- [ ] **Step 5: 수 · 생성 · 첫 발견을 확인한다**

```bash
cd /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad
node -e "import('./items-real.mjs').then(({ GROUPS, ITEMS }) => { const ids = ITEMS.map((i) => i.id); console.log(ITEMS.length, new Set(ids).size, GROUPS.map((g) => g.key + g.items.length).join(' '), ITEMS.filter((i) => i.who !== 'C').map((i) => i.id).join(' ')) })"
node record.mjs --finding doc "README 최소 배선과 Phase 2 예제의 baseURL 가정이 다르다" "최소 배선(195-197행)은 refreshPath '/auth/refresh' · noRetryPaths ['/auth/login'], Phase 2 예제(719 · 748 · 795-808행)는 '/admin/…' 경로 — 두 예제를 합친 앱은 갱신 경로가 틀린다(aksv 는 Phase 2 예제를 따라 refreshPath '/admin/auth/refresh')." open
node record.mjs --status
node gen-real.mjs
```

Expected: `62 62 A11 B13 C26 D3 E3 F6 1-L4 2-C7 2-T1 2-T2 2-T3 X5 1-G4`, 발견 1건, 상태 `{"pass":0,"fail":0,"na":0,"open":62}`, `phase2-real-server-check.html {…}`. Task 4 Step 7 · 8 에서 메모해 둔 B층 · 문서 마찰이 있으면 여기서 `--finding template|doc` 로 더한다. 만든 HTML 을 claude-in-chrome 으로 한 번 열어 항목 · 칩 · 발견 절이 보이는지 본다(`file:///C:/Users/kim52/AppData/Local/Temp/claude/…/scratchpad/phase2-real-server-check.html`).

---

## 판정 절차 (Task 6~11 공통)

1. **준비** — `node AKSS/check-akss.mjs` · `node AKSV/check-aksv.mjs` 가 OK 인지 본다(둘 다 떠 있어야 한다). claude-in-chrome 은 세션에서 한 번 `tabs_context_mcp` → `tabs_create_mcp` 로 탭을 만들고 그 탭을 계속 쓴다. 브라우저 `alert` 를 띄우는 조작은 없다(킷 확인 창).
2. **항목마다** — `items-real.mjs` 의 `how` 를 claude-in-chrome(`navigate` · `find` · `computer` · `form_input` · `javascript_tool` · `get_page_text`)으로 따라 하고 `expect` 와 견준다. 근거는 셋 중 맞는 것:
   - 요청 기록: `javascript_tool` 로 `JSON.stringify(window.__aksvLab.log.slice(0, 8).map((e) => [e.seq, e.method, e.path, e.status, e.code, e.refresh, e.retry]))`
   - 화면 글: `get_page_text` 또는 `find` 결과의 문구
   - 감사(쓰기 항목): `javascript_tool` 로 `fetch('/__lab/audit?limit=3').then((r) => r.json()).then((r) => JSON.stringify(r.body.data.items))` — 행의 칸 이름(행위자 · action · statusCode · errorCode)은 처음 한 번 전체를 보고 맞춘다
3. **기록** — `node SCRATCH/record.mjs <ID> pass|fail|na "<무엇이 보였나>" "<근거 한 줄>" …`. 해당 없음은 이유를 메모에 적는다. 한 항목의 일부만 해당 없음이면(1-L8 · 1-L11) 판정은 나머지로 하고 메모에 적는다.
4. **실패** — 위 「결함 처리 절차」. 앱 · 장치 문제를 고쳤으면 그 항목을 다시 판정한다.
5. **잠금 주의** — 비밀번호를 틀리는 단계 뒤에는 반드시 맞는 시도를 한다(카운터 되돌림). admin 이 잠기면 실험 "admin 잠금 해제".
6. **묶음 끝마다** — 횡단 근거를 `SCRATCH/cross.txt` 에 덧붙인다(Bash heredoc `cat >> … <<'EOF'`):
   - X9: `window.__aksvLab.log.filter((e) => e.status >= 400 && e.envelope !== true)` 결과(빈 배열이어야 한다)
   - X12: `read_console_messages`(pattern `error|warn|Vue`) 요약
   - 그다음 실험 패널 요청 기록 "지우기"(300줄 한도).
     그리고 `node record.mjs --status` → `node gen-real.mjs` → `node snapshot.mjs`.

---

### Task 6: 판정 ① 셸 · 인증 (A — 11 항목)

**Files:**

- Modify: `SCRATCH/results.json` · `findings.json` · `cross.txt`(record.mjs · heredoc 로만)

**Interfaces:**

- Consumes: 판정 절차, Task 3 실험 패널, Task 5 `record.mjs`
- Produces: A 묶음 판정 11개

- [ ] **Step 1: 시작 상태** — admin 로그인, 프리셋 전권, 지연 0, 화면 재인증 끔(패널의 "서버 재인증 끔" 과 같게), 내 주소 127.0.0.1, 막는 규칙 끔.
- [ ] **Step 2: 1-S3 · 1-S4 · 1-S5 · 1-S6** — 판정 절차대로. S4 로그아웃 뒤 S5 는 로그아웃 상태에서 시작한다.
- [ ] **Step 3: 1-S11** — ReauthDialog 틀림 뒤 바로 admin1234.
- [ ] **Step 4: 1-S9** — 갱신 줄에 `refresh` · 재시도 줄에 `retry` 표시가 있는지 요청 기록에서 본다.
- [ ] **Step 5: X1** — 패널 "쿠키 보기" 결과와 `document.cookie`.
- [ ] **Step 6: X2** — 회전 뒤 31초 이상 기다린 다음 재사용(유예 30초). 재사용 응답의 `code` 를 메모한다.
- [ ] **Step 7: 1-S10 · 1-S12** — S12 끝에 반드시 "내 주소 127.0.0.1" → "막는 규칙 끄기". 감사에 `setting.ipAccess.*` 행 둘(other)이 남는지 본다.
- [ ] **Step 8: X3** — user003 로 다섯 번 틀린 뒤 맞는 비밀번호, 실험 "잠금 해제". 끝나면 admin 으로 돌아온다.
- [ ] **Step 9: 묶음 끝** — 판정 절차 6.

---

### Task 7: 판정 ② 목록 · 쓰기 (B — 13 항목)

**Files:**

- Modify: `SCRATCH/results.json` · `findings.json` · `cross.txt`

**Interfaces:**

- Consumes: 판정 절차, Task 4 사용자 페이지
- Produces: B 묶음 판정 13개

- [ ] **Step 1: 시작 상태** — Task 6 Step 1 과 같다.
- [ ] **Step 2: 1-P8 · 1-L1 · 1-L2 · 1-L3 · 1-L6** — L1 은 조작마다 요청 기록의 쿼리 문자열을 근거로 적는다(인코딩된 그대로).
- [ ] **Step 3: 1-L4(Claude 부분)** — 검색칸에 "김" 을 `form_input` 으로 넣고 적용. 결과 행 이름에 모두 "김" 이 드는지 `get_page_text` 로 본다. 조합 중 Enter 는 사람(Task 12).
- [ ] **Step 4: 1-L5 · 1-L7 · 1-L8** — L5 는 끝에 지연 0.
- [ ] **Step 5: 1-L9** — 퇴사 대상은 user002. 감사에 퇴사 행 하나(admin).
- [ ] **Step 6: 1-L11** — 409 `ERR_DUPLICATE_USER_ID` 가 칸 오류로 보이는지 토스트로 보이는지 적는다. 토스트면 실패로 적고 결함 처리 절차 1~2 로 층을 판단한다 — 후보: (a) admin-ui `useWriteFlow` 에 도메인 코드 → 칸 대응이 없다, (b) admin-server 가 중복을 검증 오류 모양으로 내지 않는다, (c) 앱(B)이 코드를 잡아 칸에 놓아야 한다. 설계 판단이라 `--finding defect … deferred 1-L11` 로 넘기는 것이 기본이고, 사람에게 어느 쪽인지 묻는다.
- [ ] **Step 7: 1-L12 · X8** — L12 는 user010. X8 은 이름을 고쳐 저장한 뒤 원래 이름으로 되돌린다.
- [ ] **Step 8: 묶음 끝** — 판정 절차 6.

---

### Task 8: 판정 ③ 역할 · 세션 · 팀 (C — 26 항목)

**Files:**

- Modify: `SCRATCH/results.json` · `findings.json` · `cross.txt`

**Interfaces:**

- Consumes: 판정 절차, Task 3 "시드 역할 되돌리기" · "팀 IP 규칙"
- Produces: C 묶음 판정 26개(사람 몫은 Task 12)

- [ ] **Step 1: 역할 — 2-R3 · 2-R8 · 2-R9 · 2-R10 · 2-R11 · 2-R12 · 2-R14** — R10 · R12 · R14 끝마다 실험 "시드 역할 되돌리기"(결과에 다섯 줄 200 · 201). R12 뒤 프리셋 전권.
- [ ] **Step 2: 세션 — 2-C1 → 2-C2 → 2-C3 → 2-C4 → 2-C5** — 이 순서(C3 이 시드 세션을 끊는다). C5 뒤 다시 로그인.
- [ ] **Step 3: 비밀번호 — 2-C7(Claude 부분) → 2-C12 → 2-C13 → 2-C14** — C12 의 새 비밀번호 admin12345 는 C13 에서 admin1234 로 되돌린다. C14 뒤 admin 으로 돌아온다.
- [ ] **Step 4: 팀 — 2-T5 → 2-T9 → 2-T14 → 2-T15 → 2-T16 → X4 → 2-T13 → 2-T1 → 2-T2 → 2-T3** — T14 · T15 는 QA팀이 옮겨지기 전에. 드래그(T1~T3)는 `computer` 의 `left_click_drag` 로 해 보고, he-tree 가 반응하지 않으면 Claude 판정을 `na`("드래그를 자동으로 낼 수 없음 — 사람 판정이 결과")로 적는다. `finalOf` 는 Claude `na` + 사람 판정이면 사람 쪽을 따른다(Task 12).
- [ ] **Step 5: 묶음 끝** — 판정 절차 6.

---

### Task 9: 판정 ④ 약관 (D — 3 항목)

**Files:**

- Modify: `SCRATCH/results.json` · `findings.json` · `cross.txt`

**Interfaces:**

- Consumes: 판정 절차, Task 4 `LegalPage.vue`, 실험 "약관 발행"
- Produces: D 묶음 판정(X5 는 Claude 부분만)

- [ ] **Step 1: X5(Claude 부분)** — 이용약관 첫 발행 → 시행 정보 · 이력 · 원문 대화상자, 개인정보처리방침 탭 한 번. 요청 기록에 `GET /api/admin/legal-documents/{번호}` 200(래퍼 없는 단건)과 감사 `setting.legal.publish` 한 행 — 행 meta 에 본문이 없는지 본다.
- [ ] **Step 2: X6** — 같은 본문 다시 발행. 화면이 어디에 알리는지(토스트 · 편집기 안) 메모한다. 409 `ERR_COMMON_CONFLICT` 가 전역 토스트로만 나오고 편집기가 그대로라면 기대("화면에 보이고 초안이 남는다")에 맞으면 통과다.
- [ ] **Step 3: X7** — 편집 중 실험 "약관 발행" → 내 발행 → 충돌 안내 → 다시 발행.
- [ ] **Step 4: 묶음 끝** — 판정 절차 6.

---

### Task 10: 판정 ⑤ 재기동 단계 (E — 3 항목)

**Files:**

- Modify: `SCRATCH/results.json` · `findings.json` · `cross.txt`

**Interfaces:**

- Consumes: Task 1 env `AKSS_REAUTH` · `AKSS_ACCESS_TTL_MS`, 실험 패널 "화면 재인증"
- Produces: E 묶음 판정 3개, 끝나면 akss 가 기본 설정으로 다시 떠 있다

- [ ] **Step 1: 재인증 단계로 다시 띄운다**

```bash
node /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad/stop-port.mjs 4100
```

Bash `run_in_background: true`:

```bash
cd /c/Users/kim52/AppData/Local/Temp/akss && AKSS_REAUTH=true TZ=UTC node dist/main.js > server.log 2>&1
```

```bash
cd /c/Users/kim52/AppData/Local/Temp/akss && AKSS_REAUTH=true node check-akss.mjs
```

Expected: `akss OK`(reauth true). 실험 패널 새로 읽기 → "서버 재인증 켬" → "화면 재인증" 스위치를 켠다(어긋남 경고가 사라진다) → 역할 · 사용자 화면을 다시 연다.

- [ ] **Step 2: 1-L10 · 2-R13** — L10 은 틀림 → 맞음 순서. R13 의 삭제 대상은 "고객 지원", 끝나면 "시드 역할 되돌리기".
- [ ] **Step 3: 진짜 만료 단계로 다시 띄운다** — Step 1 의 끄기 → Bash `run_in_background: true` 로 `cd /c/Users/kim52/AppData/Local/Temp/akss && AKSS_ACCESS_TTL_MS=20000 TZ=UTC node dist/main.js > server.log 2>&1` → `node check-akss.mjs`(reauth false). 패널 "화면 재인증" 을 끈다.
- [ ] **Step 4: X10** — 로그아웃 → 로그인 → 21초 → "새로 고침" → 21초 → "동시 요청 3개". 실험 "액세스 토큰 만료" 를 누르지 않는다(프록시 조작이 아니어야 한다 — 패널 "토큰 빼기 끔" 을 근거에 적는다).
- [ ] **Step 5: 기본 설정으로 되돌린다** — 끄기 → Bash `run_in_background: true` 로 `cd /c/Users/kim52/AppData/Local/Temp/akss && TZ=UTC node dist/main.js > server.log 2>&1` → `node check-akss.mjs` → 묶음 끝(판정 절차 6).

---

### Task 11: 판정 ⑥ 횡단 · 재확인 (F — 6 항목)

**Files:**

- Modify: `SCRATCH/results.json` · `findings.json` · `cross.txt`

**Interfaces:**

- Consumes: `cross.txt`(Task 6~10 이 모은 X9 · X12 근거), `/__lab/audit`
- Produces: F 묶음 판정(1-G4 는 Claude 부분만)

- [ ] **Step 1: 1-P6** — 열자마자 `document.activeElement` 가 비밀번호 칸인지(`javascript_tool` 로 `document.activeElement?.getAttribute('type')` · `autocomplete`), 틀림 → 맞음.
- [ ] **Step 2: 1-P9** — 카드 버튼을 차례로 누르고 기다린 뒤 카드 아래 "○초 보임" 줄을 `get_page_text` 로 읽는다(페이지가 스스로 잰 값). 마우스는 토스트 위에 두지 않는다.
- [ ] **Step 3: 1-G4(Claude 부분)** — `computer` 의 `key Tab` · `key Enter` 로 열고 돌고 닫으며 단계마다 `document.activeElement` 의 글자(`textContent`)를 적는다.
- [ ] **Step 4: X9** — `cross.txt` 의 X9 줄이 모두 빈 배열이고, 마지막으로 `window.__aksvLab.log` 도 한 번 더 본다.
- [ ] **Step 5: X11** — `fetch('/__lab/audit?limit=100')` 로 최근 행을 action 별로 세고, 임시 비밀번호 초기화 행 meta 에 `temporaryPassword` 가 없는지 · 약관 발행 행 meta 에 `body` 가 없는지 · 실패한 쓰기 행(409 · 403)에 statusCode · errorCode 가 있는지 본다. 근거에 action 별 개수를 적는다.
- [ ] **Step 6: X12** — `cross.txt` 의 X12 줄 + 마지막 `read_console_messages`. 의도한 4xx · 5xx 말고 Vue 경고 · 예외가 하나라도 있으면 실패로 적고 층을 본다.
- [ ] **Step 7: 묶음 끝** — 판정 절차 6. `node record.mjs --status` 의 미판정이 사람 몫(1-L4 · 2-C7 · 2-T1 · 2-T2 · 2-T3 · X5 · 1-G4)뿐인지 본다.

---

### Task 12: 사람 판정

**Files:**

- Create: `SCRATCH/human.txt`
- Modify: `SCRATCH/results.json`

**Interfaces:**

- Consumes: `phase2-real-server-check.html`(사람 몫에 판정 버튼 · "기록 복사")
- Produces: 사람 판정이 합쳐진 `results.json`

- [ ] **Step 1: 체크리스트를 건넨다** — `node gen-real.mjs` 뒤 `phase2-real-server-check.html` 을 Artifact 로 발행한다(아이콘 `checklist`, 설명 "aksv 실서버 확인 체크리스트 3장 — 사람 판정 남은 항목"). 사람에게 알린다: 앱 주소 `http://localhost:5199`(admin / admin1234), 남은 항목(1-L4 조합 중 Enter · 2-C7 메모장 붙여 넣기 · 2-T1~T3 드래그 · X5 편집기 겉모습 · 1-G4 키보드), 그리고 마지막 동선(로그인 → 사용자 편집 → 역할 저장 → 약관 발행)을 눈으로 한 번. 끝나면 "기록 복사" 글을 대화에 붙여 달라고 한다.
- [ ] **Step 2: 받은 글을 합친다**

받은 글을 `SCRATCH/human.txt` 로 쓰고(Write 도구 — 탭 문자가 그대로인지 `node -e "console.log(JSON.stringify(require('fs').readFileSync(process.argv[1], 'utf8').slice(0, 80)))" human.txt` 로 확인):

```bash
cd /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad
node record.mjs --import human.txt && node record.mjs --status && node gen-real.mjs
```

Expected: 미판정 `없음`. 사람 판정에 실패가 있으면 결함 처리 절차로 간다. 마지막 동선에서 사람이 말한 것은 `--finding template|defect` 로 적는다.

---

### Task 13: 마무리 — 결과 커밋 · 문서 · 정리

**Files:**

- Create: `docs/verification/2026-10-16-real-server-check.html`
- Modify: `docs/HANDOFF.md`, `CLAUDE.md`(진행표), `docs/01-phase0.md` §8, `docs/superpowers/specs/2026-10-16-aksv-real-server-design.md` §14

**Interfaces:**

- Consumes: 최종 `phase2-real-server-check.html` · `findings.json` · `results.json`
- Produces: 커밋 하나(결함 수정 커밋은 그때그때 따로)

- [ ] **Step 1: 결과 HTML 을 저장소에 둔다**

```bash
cd /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad && node gen-real.mjs && node snapshot.mjs
mkdir -p /c/Users/kim52/workspace/ssworks-admin-kit/docs/verification
node -e "require('fs').copyFileSync(process.argv[1], process.argv[2])" phase2-real-server-check.html /c/Users/kim52/workspace/ssworks-admin-kit/docs/verification/2026-10-16-real-server-check.html
cd /c/Users/kim52/workspace/ssworks-admin-kit && pnpm exec prettier --check docs/verification/2026-10-16-real-server-check.html
```

prettier 가 빨가면 생성물을 고쳐 쓰지 않고 `.prettierignore` 에 `docs/verification/` 한 줄(주석 "생성물 — scratchpad 의 gen-real.mjs 가 만든다")을 더한다. claude-in-chrome 으로 저장소의 파일을 한 번 열어 요약 칩 · 발견 절이 보이는지 본다.

- [ ] **Step 2: 스펙 §14 구현 중 정정**

`docs/superpowers/specs/2026-10-16-aksv-real-server-design.md` §14 의 "(구현 중 바뀐 것을 여기에 적는다.)" 를 실제 정정으로 바꾼다 — 최소한:

- 앱 경로 규약: `baseURL '/api'` · 경로 `'/admin/…'` · `refreshPath '/admin/auth/refresh'`(§6-1 의 `'/api/admin'` 대신 — README Phase 2 예제를 따름, README 어긋남은 발견 doc 1)
- 생성기: `make-app.mjs` · `make-server.mjs` 는 `%TEMP%` 작업 폴더의 스냅숏(`snapshot.mjs`), 3장 생성기는 새 `gen-real.mjs`(1 · 2장 CSS 재사용)
- 재기동 단계: 재인증(`AKSS_REAUTH`) · 진짜 만료(`AKSS_ACCESS_TTL_MS`)를 env 로
- 판정 중 바뀐 것(항목 기대 · 장치)을 한 줄씩

- [ ] **Step 3: HANDOFF · 진행표**

- `docs/HANDOFF.md` 지금 상태 표 "검증" 칸 끝에 한 문단: "실서버 확인(2026-10-16, 체크리스트 3장 — `docs/verification/2026-10-16-real-server-check.html`): 62 항목 통과 n · 실패 n · 해당 없음 n, 패키지 결함 고침 n(목록) · 넘김 n(목록), 템플릿 메모 n — admin-shared · admin-ui 0.4.0(npm) + admin-server 0.4.0(로컬 pack) · Docker MariaDB 11.4 DB_SSL." 숫자는 `node record.mjs --status` 와 `findings.json` 에서.
- 같은 표 "다음 플랜" 칸: (사람) 이 브랜치 push · PR · 머지 → admin-server 첫 발행(`private` 해제 · 로컬 2FA · 그 뒤 Trusted Publisher 등록) → 템플릿 `preset/admin`(템플릿 메모가 입력). 넘긴 결함이 첫 발행을 막으면 그것을 먼저 적는다.
- "알려진 미확인 · 보류" 에 "**실서버 확인이 넘긴 것(2026-10-16)**" 절 — `findings.json` 의 deferred 결함 · 템플릿 메모 · 문서 항목을 한 줄씩. 0.4.0 Release 재실행에서 드러난 `stage-release.mjs` 409(이미 스테이징됨) 처리도 여기에 한 줄.
- `CLAUDE.md` 진행표: "Version Packages PR #3(0.4.0) 머지 → 확인용 앱 실서버 확인 → admin-server 첫 발행 | 다음" 행을 둘로 나눈다 — "확인용 앱 실서버 확인(체크리스트 3장) | 완료 | 스펙 · 플랜 경로" 와 "**admin-server 첫 발행** | **다음** | HANDOFF". `docs/01-phase0.md` §8 표도 같게.

- [ ] **Step 4: 정리**

```bash
node /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad/stop-port.mjs 4100
node /c/Users/kim52/AppData/Local/Temp/claude/c--Users-kim52-workspace-ssworks-admin-kit/d83be8de-5f0c-4a85-901b-b02dfb3d087b/scratchpad/stop-port.mjs 5199
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists aksv; show databases like 'aksv'"
```

Expected: 두 포트 프로세스 끝남, `show databases` 빈 결과. `%TEMP%\aksv` · `akss` 는 지우지 않는다(스냅숏이 있지만 첫 발행 전에 다시 볼 수 있다 — 지울지는 사람이 정한다).

- [ ] **Step 5: 형식 · 확인 · 커밋**

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
pnpm exec prettier --write docs/HANDOFF.md CLAUDE.md docs/01-phase0.md docs/superpowers/specs/2026-10-16-aksv-real-server-design.md docs/superpowers/plans/2026-10-16-aksv-real-server.md
pnpm exec prettier --write docs/HANDOFF.md CLAUDE.md docs/01-phase0.md docs/superpowers/specs/2026-10-16-aksv-real-server-design.md docs/superpowers/plans/2026-10-16-aksv-real-server.md
pnpm exec prettier --check docs CLAUDE.md
git status --short
```

패키지 코드를 고친 커밋이 이 브랜치에 있으면 `pnpm check` 도 돌려 초록을 확인한다(admin-server 를 고쳤으면 akss 를 끈 상태에서 `pnpm test:db` 까지).

```bash
git add docs/verification docs/HANDOFF.md CLAUDE.md docs/01-phase0.md docs/superpowers/specs/2026-10-16-aksv-real-server-design.md docs/superpowers/plans/2026-10-16-aksv-real-server.md .prettierignore
git commit -F - <<'EOF'
docs: 확인용 앱 실서버 확인 — 체크리스트 3장 결과 · 스펙 구현 중 정정 · HANDOFF · 진행표

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -5
```

(`.prettierignore` 를 고치지 않았으면 `git add` 에서 뺀다.)

- [ ] **Step 6: 브랜치 마무리** — 패키지 코드를 고쳤으면 최종 whole-branch 리뷰(opus)를 받은 뒤, superpowers:finishing-a-development-branch 로 넘긴다. push · PR · 발행은 사람이 한다.
