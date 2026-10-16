# 템플릿 preset/admin + admin-scaffold 스킬 설계 (Phase 3)

작성일: 2026-10-16 · 상태: 확정(구현 전) · 선행: `docs/00-admin-common-review.md` §3 B · C 층 · §4 Phase 3, `docs/HANDOFF.md` "다음 플랜" · "실서버 확인이 넘긴 것(2026-10-16)", 실서버 확인 스펙 `docs/superpowers/specs/2026-10-16-aksv-real-server-design.md` §9-2 · §14, admin-ui README 「최소 배선」 아래 경로 규약 (가) · (나), admin-server README 「admin-ui 와 맞물리기」

세 패키지가 npm 에 0.4.1 로 공개됐다(2026-10-16, admin-server 는 첫 발행). 이 문서는 패키지를 **쓰는 쪽** 골격 — 00 검토 §3 의 B 층(템플릿)과 C 층(스킬) — 을 정한다. 대상은 형제 저장소 `kim5257-project-template` 의 새 브랜치 `preset/admin` 이다. 이 단계에 한해 그 저장소 쓰기를 허락받았다(브랜치 `preset/admin` 에서만, 로컬 커밋, push 는 사람).

## 1. 목표

끝 상태:

- **`kim5257-project-template` 의 `preset/admin` 브랜치(로컬 커밋)에 세 가지가 있다** — ① npm `@ssworks/*` 0.4.1 을 의존하는 얇은 관리자 앱 골격(shared · backend · frontend), ② `.claude/skills/admin-scaffold`, ③ 그 저장소 `CLAUDE.md` · 루트 `README.md` 의 preset/admin 안내.
- **템플릿에서 만든 새 앱이 돈다** — init → install → lint · typecheck · build · test 초록, 새 DB 에 마이그레이션 12장 → 첫 관리자 시드 → 기동 → 로그인 · 강제 변경 · 주요 화면 · 대표 쓰기. 스킬로 페이지 하나를 더한 뒤에도 같다. Docker 이미지 둘이 빌드되고 backend 컨테이너가 뜬다.
- **검증 기록이 이 저장소에 있다** — `docs/verification/<검증을 마친 날>-template-preset-admin.md`.
- **이 저장소 문서가 다음 단계를 말한다** — HANDOFF(다음 플랜 · 검증) · CLAUDE.md 진행표 · `docs/01-phase0.md` §8.

패키지가 할 일은 템플릿에 복사하지 않는다. 템플릿이 가진 것은 **프로젝트마다 달라야 마땅한 것**(카탈로그 내용 · 메뉴 · 페이지 조립 · 테마 · `main.ts` · `App.vue` · `RouteMeta` 증강 · 배포)뿐이다(CLAUDE.md "패키지 경계" B).

## 2. 결정

### 2-1. 경계 결정 (2026-10-16, 브레인스토밍 — 모두 권장안)

| #           | 확정                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 기준      | **B1 — `preset/db`(881b6e6) 위** + `preset/auth` 의 bcfe24a(frontend 패키지 이름 · init 개선) · c3945e7(Windows EPERM) cherry-pick. `preset/auth` 는 자체 auth · roles · teams · users · 가드 · `001_init`(킷 12장과 다른 테이블) · 레이아웃 컴포넌트 · shared 스키마로 킷과 거의 전부 겹친다. 00 검토 §4 Phase 3 의 "preset/auth 위" 는 admin-server 가 없을 때 쓴 문장이다                                     |
| ② 의존성    | **D1 — 킷으로 대체, swagger 뺌.** Nest 12 · kysely 0.29 · dialect 0.2 · kysely-ctl 0.21 · zod 4(peer). 템플릿 자체 HTTP 층(필터 · 인터셉터 · jsonParser · DatabaseModule · shared 응답/bigint 코드)은 킷 것으로. nestjs-zod(peer Nest ^10 \|\| ^11)와 그 patch · @nestjs/swagger 를 뺀다. 빌드는 `tsc`, 개발은 `tsc-watch` — @nestjs/cli 를 뺀다(cli 12 의 schematics 가 TypeScript ≥6 peer, 킷은 5.9 로 검증)   |
| ③ 문서      | **P1 — 이 저장소 `docs/superpowers` · `docs/verification`.** 템플릿에는 결과물(골격 · 스킬 · CLAUDE.md · README)만. preset/admin 은 새 프로젝트로 통째로 복사되므로 설계 문서가 모든 프로젝트에 남는 것을 피한다                                                                                                                                                                                                 |
| ④ 경로      | **(가) — `baseURL '/api/admin'`.** 킷 경로가 짧고(`'/auth/me'` · `'/users'`) admin-server README 「admin-ui 와 맞물리기」 · admin-ui 「최소 배선」과 글자 그대로 맞는다. 프로젝트의 관리자 라우트도 `admin/` 아래(`@Controller('admin/<이름>')`) — `/api/admin` 이 관리자 표면 전체가 된다. aksv 는 (나)로 검증했다(스펙 §14-1) — 차이는 경로 문자열뿐이고 이번 검증이 (가)를 실제로 돈다                        |
| ⑤ 라우팅    | **R1 — 파일 기반 유지.** vue-router 5 auto-routes · vite-plugin-vue-layouts-next · typed routes. 페이지의 `definePage({ meta })` 하나에 경로 · 메뉴 · 권한이 모인다. 하위 페이지는 점 표기(`users.new.vue` → 최상위 `/users/new`)로 두고 폴더는 중첩 셸(`settings/`)에만 쓴다 — 드로어는 `buildMenu(routes, { groups })`(depth 1, §13-2)                                                                         |
| ⑥ 페이지    | **S1 — 인증 · 본인 + 조직 + 설정.** 로그인 · 403 · 비밀번호 강제 변경 · 내 계정, 사용자(목록 · 추가 · 편집) · 팀 · 전체 세션, 설정 셸 아래 역할 · 약관. IP 접근 제어 · 감사 로그 화면은 넣지 않는다 — admin-ui 에 컴포넌트가 없고, IP 화면은 프로젝트마다 같아야 하니 후속 admin-ui PR(A)이 맞다. 감사 모듈은 기록용으로 켜고, IP 모듈은 끈다                                                                    |
| ⑦ 스킬 단위 | **K1 — 세로 한 줄, DB 는 선택.** shared 카탈로그(권한 키 · 함의 · 감사 액션 · 스키마) → (선택) 테이블 · 마이그레이션 → backend 모듈(`@Controller('admin/<x>')` · `@Require` · `@Audit` · 검증 파이프) → frontend 어댑터 · 페이지(`definePage` meta) → 검사                                                                                                                                                       |
| ⑧ 검증      | **V1 — 공통 + 브라우저 + 스킬 실행 + Docker 빌드.** 생성 앱 init → install → lint · typecheck · build · test → 새 DB → migrate → 시드 → 기동 → API 스모크 → claude-in-chrome 화면 확인 → 서브에이전트가 스킬로 페이지 하나 → 다시 확인 → 이미지 둘 빌드(push 없음) · backend 컨테이너 기동 → DB 삭제                                                                                                             |
| ⑨ 접근      | **A — aksv · akss 포팅.** 실서버 62 항목을 통과한 배선 · 페이지를 템플릿 구조로 옮긴다. 템플릿 메모 셋(역할 매트릭스가 카탈로그 키를 모두 덮고 함의를 서버와 한 벌로 · 사용자 상태는 `resignAt` 에서 셈하고 퇴사는 퇴사일을 묻는다 · 목록 `#no-data` 는 조회 오류를 먼저 본다)이 이미 페이지에 들어 있다. README 에서 새로 쓰면(B) 고친 세부를 다시 밟고, init 때 생성(C)하면 템플릿만 보고 앱 모양을 알 수 없다 |

### 2-2. 공통 결정 (이의 없음)

1. **패키지는 npm 0.4.1 정확 고정.** `@ssworks/admin-shared` · `admin-ui` · `admin-server` 모두 `"0.4.1"`(캐럿 없음) — 킷 README "같은 번호끼리 설치한다". 올릴 때는 `pnpm up "@ssworks/*@x.y.z"` 로 함께. workspace 링크 · 로컬 tarball 을 템플릿에 커밋하지 않는다.
2. **템플릿 쓰기는 `preset/admin` 에서만.** `master` · `preset/db` · `preset/auth` 는 고치지 않는다. 커밋은 로컬, push 는 사람. 템플릿 `CLAUDE.md` 규약(세미콜론 · trailing comma · 100자 · `.js` 확장자 import · `feat:` 꼴 한국어 커밋)을 따른다.
3. **생성 앱은 `%TEMP%\akt`** — 짧은 경로(Windows 긴 경로 os error 3), 포그라운드 명령. 끝나면 DB 를 지우고 컨테이너 · 이미지를 지운다. `pnpm test:db` 와 겹쳐 돌리지 않는다.
4. **서브에이전트는 model 을 명시한다.** `/dev/null` 리디렉션을 쓰지 않는다.
5. **템플릿 원격은 이 세션에서 fetch 하지 않았다**(비공개 · 인증 프롬프트). 로컬 ref 기준 `preset/db` = 881b6e6, `preset/auth` = c3945e7(2026-04-04). 원격이 더 새로우면 사람이 알려 주고, 기준 커밋을 고친다.

## 3. 브랜치 · 루트 · 빌드 · 배포

- **커밋 층**: `git switch -c preset/admin origin/preset/db` → cherry-pick bcfe24a · c3945e7 → 의존성 · HTTP 층 → shared → backend → frontend 배선 → 페이지 → 테스트 → 스킬 → 문서. 층마다 커밋 하나(크면 둘).
- **pnpm**: `packageManager` pnpm 10.33 유지. `pnpm-workspace.yaml` 에서 `patchedDependencies`(nestjs-zod)를 지우고 `patches/` 를 지운다. he-tree 하위 의존 `vue-demi` 의 설치 스크립트를 무시하는 설정을 더한다 — pnpm 10 은 `ignoredBuiltDependencies`(킷 README 의 `allowBuilds` 는 pnpm 11+ 문법). 실제 설치로 확인한다(§11).
- **backend 의존성**: 더함 — `@ssworks/admin-server` · `@ssworks/admin-shared` 0.4.1, Nest 12(`common` · `core` · `platform-express`), `kysely` ^0.29, `@kim5257/kysely-mariadb-dialect` ^0.2, `mariadb` ^3, `zod` ^4, dev `kysely-ctl` ^0.21 · `tsc-watch`. 뺌 — `@nestjs/swagger` · `nestjs-zod` · `@nestjs/cli` · `cookie-parser` · `@types/cookie-parser`(킷이 `configureAdminApp` 에서 건다).
- **frontend 의존성**: 더함 — `@ssworks/admin-ui` · `@ssworks/admin-shared` 0.4.1, admin-ui 필수 peer `@he-tree/vue` · `codemirror` · `@codemirror/state`, `zod` ^4, dev `vitest` · `happy-dom`. 유지 — vue-router 5 · layouts 플러그인 · `vite-plugin-vuetify` 자동 import · `axios` · `pinia` · `@mdi/font`.
- **TZ=UTC**: 킷 `assertUtcTimezone` 이 기동을 막는다. `.env.example` · `.env.backend.example` 에 `TZ=UTC`, `run.sh` 는 `TZ=UTC` 로 실행, `Dockerfile.backend` 런타임에 `ENV TZ=UTC`.
- **산출 경로**: backend `tsconfig.build.json` 의 `rootDir: src` → `dist/main.js`(지금 `dist/src/main`). `run.sh` · `Dockerfile.backend` 를 맞춘다.
- **nginx**: `/api` 프록시 · `X-Real-IP` · `X-Forwarded-Proto` 를 이미 넘긴다 — 그대로. `/docs` 프록시(swagger)는 지운다.
- **지우는 템플릿 파일**: backend `core/filters/api-exception.filter.ts` · `core/json/json-transform.ts` · `core/utils/error.util.ts` · `core/utils/cookie.util.ts` · `core/database/database.module.ts` · `core/database/plugins/` · `core/database/tables/users.table.ts` · `modules/test/` · `app.controller.ts`, shared `schemas/{response,error-codes,test}.schema.ts` · `utils/bigint-json.utils.ts`, frontend `api/test.ts` · `pages/index.vue`(새로 씀), `patches/`.

## 4. shared — 프로젝트 카탈로그

`@project/shared` 는 서버와 화면이 **한 벌로** 봐야 하는 값만 둔다. 새 폴더 `src/admin/` 에 두고 `src/index.ts` 에서 다시 내보낸다.

| 파일                 | 내용                                                                                          | 쓰는 곳                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `permissions.ts`     | `definePermissions(…, { implies: IMPLIES })` · `P` · `Permission`                             | 서버 `permissionCatalog` · 슬롯 맵 · `Require`, 화면 meta · `usePermission` · `useRoleEditor` |
| `audit.ts`           | `auditCatalog = defineAuditCatalog({})` — 처음엔 비어 있고 스킬이 액션 · 대상 · 라벨을 더한다 | 서버 `audit.catalog`, 앞으로 감사 화면 라벨                                                   |
| `errors.ts`          | `projectErrors = defineErrorCodes({}, {})` — 프로젝트 오류 코드 자리                          | 서버 `errorCodes`, 화면 `ApiError.code` 비교                                                  |
| `legal.ts`           | `LEGAL_KINDS = ['TERMS', 'PRIVACY'] as const` · `LegalKind` · 탭 라벨                         | 서버 `legal.kinds`, 약관 화면 `kinds`                                                         |
| `password-policy.ts` | `passwordPolicy = definePasswordPolicy()`(기본 8 · 200)                                       | 서버 `passwordPolicy`, `PasswordChangeForm`                                                   |
| `config.ts`          | `ADMIN_REAUTH = false`                                                                        | 서버 `reauth`, 화면 `useWriteFlow` · `useRoleEditor` 재인증 관문(aksv `lab.reauth` 자리)      |

- **카탈로그 키**(aksv 에서 이 범위로 줄임): `USERS_READ` `org.users:read` · `USERS_WRITE` `org.users:write` · `ROLES_READ` · `ROLES_WRITE`(`org.roles:*`) · `TEAMS_READ` · `TEAMS_WRITE`(`org.teams:*`) · `SESSIONS_READ` · `SESSIONS_WRITE`(`sessions:*`) · `LEGAL_READ` `settings.legal:read` · `LEGAL_PUBLISH` `settings.legal:publish` · `AUDIT_LOG_READ` `settings.auditLog:read`. 함의는 쓰기 → 읽기(publish → read). 감사 모듈의 슬롯 `auditLogs.read` 때문에 감사 키를 둔다.
- **뺀 키**: `org.users:delete`(킷에 사용자 삭제 라우트가 없다) · `settings.site:*` · `settings.security:read`(aksv 자리표시 페이지를 빼서 쓸 곳이 없다) · IP 키(IP 모듈을 끈다 — 켜는 법은 CLAUDE.md).
- **지우는 것** — §3 의 shared 파일. 응답 봉투 · bigint 코덱은 admin-shared, 오류 코드는 `projectErrors`, 클라이언트 오류 타입은 admin-ui `ApiError` 가 대신한다. **남기는 것** — `utils/datetime.utils.ts`(luxon), `types/` · `schemas/` 자리와 README. `import { z } from 'zod/v4'` 는 `'zod'` 로.
- **의존성**: `@ssworks/admin-shared` 0.4.1 · `zod` ^4 · `luxon`. admin-shared 가 두 벌 설치되면 서버 기동 검사(`configureAdminApp` bigint replacer)가 멈춘다 — 검증에서 lockfile 의 인스턴스 수를 본다.

## 5. backend

```
packages/backend/
  kysely.config.ts                  러너(Nest 없음): loadDotEnv → assertUtcTimezone → assertAdminMigrationStubs → createAdminKysely(adminDb())
  .env.example                      PORT · TZ=UTC · DB_*(DB_SSL · DB_SSL_CA · DB_SOCKET_PATH 주석) · ADMIN_JWT_SECRET(32자+)
  src/main.ts                       킷 최소 배선: loadDotEnv · assertUtcTimezone · NestFactory · configureAdminApp · setGlobalPrefix('api') · enableShutdownHooks · listen(PORT ?? 4000)
  src/app.module.ts                 명시 import: AdminServerModule.forRootAsync({ useFactory: adminServerOptions }) + 킷 모듈 일곱 + HealthModule + 프로젝트 모듈
  src/admin/admin-options.ts        adminServerOptions() — 아래
  src/core/auth/require.ts          Require(...p: Permission[]) · RequireAny(...) — 킷 RequirePermissions · RequireAnyPermissions 를 프로젝트 키 타입으로 좁힌다
  src/core/database/admin-db.ts     adminDb() — 앱 · 러너 · 시드 공용 접속 함수(Nest 없음, 코드 TLS 자리 — 킷 README "DB TLS · 소켓")
  src/core/database/database.types.ts   interface Database extends AdminDatabase {}
  src/core/database/tables/         프로젝트 테이블 타입 자리(README)
  src/core/database/migrations/001_admin_roles.migration.ts … 012_admin_ip_access_rules.migration.ts   한 줄 스텁 12
  src/core/database/migrations.md   스텁 · 장 순서 규칙(폴더 밖 — kysely-ctl 비-TS 경고, preset/auth 676497a 와 같은 처리)
  src/health/health.module.ts · health.controller.ts   @Public() GET /api/health → { ok: true }
  src/seed/seed-admin.ts            첫 관리자 시드(러너만)
```

- **`adminServerOptions()`**: `requireEnv(['ADMIN_JWT_SECRET'])` · `db: adminDb()` · `auth: { jwtSecret }` · `permissionCatalog: permissions` · `passwordPolicy` · `reauth: ADMIN_REAUTH` · `legal: { kinds: LEGAL_KINDS }` · `audit: { catalog: auditCatalog }` · `errorCodes: projectErrors` · `timeZone: 'Asia/Seoul'` · `clientIp: 'x-real-ip'`(🔴 주석: 템플릿 nginx 가 X-Real-IP 를 덮어쓴다 — 엣지 없이 노출하면 `'req.ip'` 로) · 슬롯 맵 11개(`users.read` → `P.USERS_READ` … `auditLogs.read` → `P.AUDIT_LOG_READ`, IP 두 슬롯은 모듈을 켤 때 더한다).
- **킷 모듈**: `AdminAuthModule` · `AdminAuditModule` · `AdminSessionsModule` · `AdminRolesModule` · `AdminUsersModule` · `AdminTeamsModule` · `AdminLegalModule`. `AdminIpAccessModule` 은 주석으로 두고 켜는 법(키 둘 · 슬롯 둘 · import 한 줄)을 CLAUDE.md 에 적는다. 장 0012 스텁은 둔다(킷이 모든 장을 요구한다 — 테이블과 global 허용 두 행만 생긴다).
- **명시 import**: 템플릿의 글롭 자동 로더(`loadModules`)를 버린다. `forRootAsync` · 킷 모듈은 어차피 명시해야 하고, 가드가 앱 전역이라 새 모듈의 권한 선언을 사람이 보게 하는 편이 낫다. 스킬이 import 한 줄을 더한다.
- **프로젝트 관리자 라우트**: `@Controller('admin/<이름>')` — 경로 규약 (가)로 화면의 `api.get('/<이름>')` 이 닿는다. 관리자 밖 컨트롤러는 `@Public()`.
- **CORS 끔**: 개발은 vite 프록시, 배포는 nginx 로 같은 출처다. 템플릿의 `enableCors({ origin: ['http://localhost:4000'] })` 를 지운다.
- **첫 관리자 시드** `pnpm --filter @project/backend seed:admin <userId> <userName>`: users 가 비어 있지 않으면 멈춘다 → 역할이 없으면 `최고 관리자`(`['*']`)를 만든다 → 16자 임시 비밀번호를 만들어 `hashPassword`(runner) 해시로 넣고 `isPasswordChangeRequired = true` → 비밀번호를 콘솔에 한 번만 찍는다. env 에 비밀번호를 두지 않는다. 재직 이력은 넣지 않는다(킷이 첫 퇴사 때 `joinAt` 으로 치유 — admin-server README "사용자 · 계정").
- **스크립트**: `build` = `tsc -p tsconfig.build.json` · `dev` = `tsc-watch -p tsconfig.build.json --onSuccess "node dist/main.js"` · `start` = `node dist/main.js` · `typecheck` · `migrate` = `kysely migrate:latest` · `migrate:make` = `kysely migrate:make` · `seed:admin`(빌드 산출 `dist/seed/seed-admin.js` 실행). 프로젝트 마이그레이션은 `migrate:make` 의 타임스탬프 이름이라 코어 스텁 `001`~`012` 뒤로 정렬된다.
- **README**: `modules/README.md` 를 "관리자 모듈 하나 만들기"(컨트롤러 경로 · `Require` · `@Audit` · `ZodValidationPipe` · `ParseBigIntPipe` · `runQuery` · `runWriteTransaction` · `BusinessError` · `@Public`)로, `migrations.md` 를 스텁 · 장 순서 · 프로젝트 장 작성 규칙(`Kysely<unknown>` · 제약 이름 snake_case · NOT NULL 확장 컬럼은 DEFAULT)으로 다시 쓴다.

## 6. frontend

### 6-1. 배선 — 킷 README 「최소 배선」의 (가) 판

| 파일                                                     | 내용                                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config.ts`                                          | `SITE_NAME`(프로젝트가 바꾸는 값)                                                                                                                                                                                                                                |
| `src/plugins/vuetify.ts`                                 | `vuetify/styles` · `@mdi/font` + `createAdminVuetify()`. 브랜드 색 자리 주석                                                                                                                                                                                     |
| `src/plugins/toast.ts` · `confirm.ts`                    | `createToast()` · `createConfirm()`                                                                                                                                                                                                                              |
| `src/plugins/index.ts`                                   | `registerPlugins`: pinia · router · vuetify · toast · confirm · `createAdminUi({ siteName, user, logout, ipBlocked })`                                                                                                                                           |
| `src/state/ip-block.ts`                                  | README 그대로 — IP 모듈을 켜도 화면 쪽은 고칠 것이 없다                                                                                                                                                                                                          |
| `src/api/client.ts`                                      | `createApiClient({ baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/admin', refreshPath: '/auth/refresh', noRetryPaths: ['/auth/login'], onError })` — 🔴 라우터 · 스토어 import 없음                                                                         |
| `src/api/{users,roles,teams,sessions,legal}.ts`          | 킷 headless 훅 어댑터(`RoleEditorApi` · `useTeamTree` · `useSessions` · `useLegalDocuments` · 사용자 목록 · 쓰기). 페이지는 `api` 를 직접 부르지 않는다 — 스킬의 틀                                                                                              |
| `src/stores/app.ts` · `src/composables/usePermission.ts` | `createAppStore`(`/auth/me` · `/auth/login` · `/auth/logout`, IP 플래그 비우기) · `createUsePermission<Permission>`                                                                                                                                              |
| `src/router/index.ts`                                    | `createRouter({ routes: setupLayouts(routes) })` + `createAdminGuard({ ensureInitialized, isAuthorized, isPermissionDenied, isPasswordChangeRequired, check, paths: { passwordChange: '/password' } })` · `createTitleGuard(SITE_NAME)` · `installChunkRecovery` |
| `src/main.ts`                                            | `registerPlugins` · `'@ssworks/admin-ui/style.css'` · `client.onAuthFailure`(START_LOCATION · `/login` 은 건너뜀) · mount                                                                                                                                        |
| `src/App.vue`                                            | `VApp` > `RouterView` + `AdminToast` · `AdminConfirm` · `IpBlockedDialog`                                                                                                                                                                                        |
| `src/layouts/default.vue` · `auth.vue`                   | `AdminShell`(`buildMenu(routes, { groups: MENU_GROUPS })` — `vue-router/auto-routes` 의 날 라우트 · depth 1, `showTeamRole`, 앱바 메뉴 "내 계정") · `AuthShell`(`#brand` 에 `SITE_NAME`)                                                                         |
| `env.d.ts`                                               | `RouteMeta extends AdminRouteMeta<Permission>` 증강 + layouts 클라이언트 타입                                                                                                                                                                                    |

### 6-2. 페이지 — 모두 `definePage({ meta })`

| 파일 → 경로                                                                                                                     | meta                                                                  | aksv 원본에서 바꾸는 것                                          |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `index.vue` → `/`                                                                                                               | selfOnly · 메뉴 "홈"                                                  | 새로 — 짧은 환영 카드(aksv HomePage 는 프리미티브 전시라 버린다) |
| `login.vue` → `/login`                                                                                                          | `layout: 'auth'` · isPublic · needNonAuth                             | 돌아갈 곳 디버그 문구 · 기본 아이디 `'admin'` 삭제               |
| `password.vue` → `/password`                                                                                                    | auth · selfOnly                                                       | 그대로(강제 변경 `PasswordChangeForm`)                           |
| `403.vue` → `/403`                                                                                                              | auth · selfOnly                                                       | 그대로                                                           |
| `account.vue` → `/account`                                                                                                      | selfOnly · 메뉴 없음(앱바)                                            | 그대로(내 세션 · 비밀번호 변경)                                  |
| `users.vue` · `users.new.vue` · `users.[userNo].vue`(점 표기 — 중첩 없는 최상위, 폼은 `components/users/UserEditForm.vue` 하나) | USERS_READ(메뉴 조직 0) / USERS_WRITE / USERS_READ                    | `lab.reauth` → `ADMIN_REAUTH`, 호출은 `api/users.ts`             |
| `teams.vue` → `/teams`                                                                                                          | TEAMS_READ · 조직 1                                                   | 시드 상수 `TEAM` 의존 제거                                       |
| `sessions.vue` → `/sessions`                                                                                                    | SESSIONS_READ · 조직 2                                                | 그대로                                                           |
| `settings.vue` + `settings/roles.vue` · `settings/legal.vue`                                                                    | 부모 `anyPermissions: [ROLES_READ, LEGAL_READ]` · 메뉴 / 자식 각 READ | `lab.reauth` → `ADMIN_REAUTH`, 약관 탭은 `LEGAL_KINDS` 라벨      |
| `[...path].vue`                                                                                                                 | selfOnly                                                              | 새로 — "페이지를 찾을 수 없습니다"(aksv 의 `/` 리다이렉트 대신)  |

- **빼는 것**: LabPanel · `state/lab` · `fixtures` · LayoutsPage · HomePage 전시 · 깨진 청크 라우트 · `/__lab` 플러그인 · 요청 기록 어댑터.
- 포팅한 코드는 템플릿 prettier(세미콜론) · `eslint-config-vuetify` 로 맞춘다. 정본 주석은 "정본: aksv(실서버 확인 2026-10-16) <파일>" 과 바꾼 점을 적는다.

### 6-3. 테스트

frontend 에 vitest + happy-dom. `src/router/routes.test.ts` 가 `vue-router/auto-routes` 를 vite 설정 그대로 읽어 잰다:

1. `assertParentAnyPermissionsCoverChildren(routes)` 가 통과한다.
2. 페이지 컴포넌트를 가진 모든 레코드가 `isPublic` · `selfOnly` · `permissions` · `anyPermissions` 중 하나를 선언한다 — 선언을 빠뜨린 새 페이지를 잡는 스킬의 안전망.
3. `buildMenu(routes, { groups: MENU_GROUPS })` 이 기대한 메뉴 id 를 낸다(설정 자식은 드로어에 없다).

루트 `package.json` 에 `test` = `pnpm -r test`. CI(`.github/workflows/ci.yml`)에 Test 단계를 더한다.

## 7. admin-scaffold 스킬

`.claude/skills/admin-scaffold/SKILL.md` 한 장. 00 검토 §2 대로 **스킬은 코드의 출처가 아니라 절차**다 — 화면 쪽 본보기는 템플릿에 실제로 있는 파일을 가리킨다(목록 `pages/sessions.vue` · `pages/users.vue`, 어댑터 `api/sessions.ts`, 쓰기 · 재인증 `components/users/UserEditForm.vue`, 설정 하위 `pages/settings/legal.vue`). 템플릿에 본보기가 없는 백엔드 프로젝트 모듈만 짧은 골격(모듈 · 컨트롤러 · 서비스 각 20~30줄)을 스킬 안에 둔다.

- **입력**(요청에서 읽고, 없으면 묻는다): ① 자원 이름(`notices`) · 화면 제목(`공지`) ② 권한 키 · 함의(`board.notices:read` · `:write` → read) ③ 자리 — 메뉴 그룹 · 아이콘 · 순서 / 설정 하위 / 메뉴 없음(상세 · 편집) ④ 쓰기 여부(목록만 / 만들기 · 수정 · 삭제) ⑤ 테이블 필요 여부.
- **절차**:
  1. shared — `admin/permissions.ts` 키 · IMPLIES, 쓰기면 `admin/audit.ts` 액션 · 대상 · 라벨, `schemas/<x>.schema.ts`(zod 목록 쿼리 · 본문 · 행) → shared 빌드.
  2. DB(선택) — `tables/<x>.table.ts` · `Database` 확장 → `migrate:make` → 장 작성.
  3. backend — `modules/<x>/{x.module,x.controller,x.service}.ts`. 컨트롤러 `@Controller('admin/<x>')`, 핸들러마다 `@Require(P.…)`(선언 없으면 403), 쓰기 `@Audit({ action, targetType })` + `attachAuditTarget` · `attachAuditDiff`, `@Body(new ZodValidationPipe(…))` · `ParseBigIntPipe`, 수정 · 삭제 `revision`. 서비스 `@Inject(KYSELY) db: Kysely<Database>` · `runQuery` · `runWriteTransaction` · `BusinessError`. `app.module.ts` 에 import.
  4. frontend — `api/<x>.ts` 어댑터, `pages/<x>.vue`(또는 `<x>/index.vue` · `[<x>No].vue`) `definePage` meta, 목록 `useServerTable`, 쓰기 `useWriteFlow`, 버튼 `hasPermission(P.X_WRITE)`. 설정 하위면 부모 `settings.vue` 의 `anyPermissions` 에 새 키.
  5. 역할 — 새 키는 기존 역할에 없다(`'*'` 관리자만 보인다). 역할 화면에서 주라고 알린다. 함의를 바꿨으면 "전체 권한 관리자가 그 역할을 다시 저장"(admin-server README "사용자 · 계정").
  6. 검사 — shared build → `pnpm typecheck` · `pnpm lint` · `pnpm test`, DB 가 있으면 `migrate` → 기동 → 미인증 `/api/admin/<x>` 401.
  7. 보고 — 만든 파일 · 키 · 경로 · 메뉴 위치 · 사람이 할 일.
- **주의점 절**: 경로 규약 (가)(화면 경로에 `/admin` 없음 · 컨트롤러에는 꼭), 전역 가드 · `@Public`, argon2 는 트랜잭션 밖, 날짜 `'YYYY-MM-DD'`, `console.log` 대신 Nest `Logger`, Windows `/dev/null` 금지.
- `.md` 라 init.mjs 가 스킬 안의 `@project/` 도 새 scope 로 바꾼다(00 검토 §4 Phase 3 요구).
- **킷 올리기**는 자주 쓰는 절차가 아니라 스킬로 만들지 않고 CLAUDE.md 한 절로 둔다 — `pnpm up "@ssworks/*@x.y.z"`, changeset 이 알린 새 장 스텁 한 줄, `assertAdminMigrationStubs` 가 빠진 장을 잡는다.
- **시험**: 생성 앱에서 서브에이전트(sonnet)에게 스킬만 주고 "공지 관리 페이지 — 목록 · 작성 · 수정 · 삭제, 테이블 포함" 을 시킨다. 결과를 절차 · 주의점으로 대조하고 검사 · 기동 · 화면을 본다. 빠뜨린 단계가 나오면 스킬 문구를 고치고 다시 돌린다.

## 8. 문서

- **템플릿 `CLAUDE.md`**: 맨 위 「프로젝트 초기 설정」 절은 그대로(init.mjs 가 지운다). 기술 스택(NestJS 12 · admin kit 0.4.1), 「템플릿 변형」 표에 `preset/admin`(현재) 행, 「구조」에 `shared/src/admin` · `backend/src/admin`, 새 절 「관리자 규약」(경로 (가) · 전역 가드 · `@Public` · 카탈로그 한 벌 · 페이지 추가는 `admin-scaffold`), 「데이터베이스」(`KYSELY` 는 킷에서 · `Database extends AdminDatabase` · 코어 스텁), 「첫 실행」(.env · TZ · migrate · `seed:admin` · dev), 「킷 올리기」, 「IP 접근 제어 켜기」.
- **루트 `README.md`(새로 — 어느 브랜치에도 없다)**: 사람용 짧은 안내 — 이 프리셋이 무엇인지 · 빠른 시작 · 들어 있는 화면 · Docker 배포 메모 · 킷 npm 링크.
- **패키지 README**: frontend `pages/` · `api/` · `stores/` README, backend `modules/README.md` · `migrations.md`.
- **이 저장소**: 이 스펙 · 플랜 `docs/superpowers/plans/2026-10-16-template-preset-admin.md` · 검증 기록 `docs/verification/<검증을 마친 날>-template-preset-admin.md`(명령 · 결과 · 판정 표) · 끝에 HANDOFF · CLAUDE.md 진행표 · `docs/01-phase0.md` §8.

## 9. 검증

생성 앱 `%TEMP%\akt`, 포그라운드.

1. **생성 · 정적 검사** — 로컬 템플릿 저장소에서 `git clone --branch preset/admin` → `node scripts/init.mjs akt` → `pnpm lint` · `pnpm typecheck` · `pnpm build` · `pnpm test`. lockfile 에 `@ssworks/admin-shared` 가 한 벌인지 본다.
2. **DB** — admin-kit-test-db(33306)에 새 DB → `pnpm --filter @akt/backend migrate`(12장) → `seed:admin`(임시 비밀번호).
3. **API 스모크**(node 스크립트) — `/api/health` 200 · 미인증 `/api/admin/auth/me` 401 · 로그인 → `/auth/me` 강제 변경 플래그 → 비밀번호 변경 → 사용자 · 역할 · 팀 · 세션 · 약관 조회와 쓰기 하나씩 → `/audit-logs` 에 그 행.
4. **브라우저**(claude-in-chrome) — 로그인 → 강제 변경 → 메뉴(홈 · 조직 셋 · 설정) → 페이지마다 첫 화면과 대표 쓰기 하나(사용자 만들기 · 임시 비밀번호 창, 역할 저장, 팀 만들기, 다른 세션 끊기, 약관 발행) · 설정 셸 첫 자식 리다이렉트 · 좁은 역할 계정의 403 · 없는 경로 화면 · 로그아웃.
5. **스킬** — §7 시험 → 다시 1 · 3 · 4 의 해당 부분.
6. **Docker** — `Dockerfile.backend` · `Dockerfile.nginx` 를 push 없이 빌드 → backend 컨테이너를 테스트 DB(`host.docker.internal:33306`)에 붙여 `/api/health` 200 · 로그인.
7. **정리** — 서버 정지 · DB DROP · 컨테이너 · 이미지 삭제. `%TEMP%\akt` 는 기록이 끝날 때까지 둔다.

## 10. 결함 처리

- **템플릿 결함** — `preset/admin` 에서 고친다.
- **킷 결함** — 멈추고 이 저장소에서 크기에 맞는 superpowers 흐름(작으면 bounded + TDD)으로 고친다 · changeset patch. 생성 앱은 그동안만 로컬 tarball 을 pnpm `overrides` 로 끼워 검증을 잇는다 — 템플릿에 커밋하지 않는다. 템플릿은 0.4.1 핀 그대로 두고 HANDOFF 에 "다음 발행 뒤 템플릿 핀을 올린다" 를 적는다(패키지가 공개되기 전에는 템플릿이 고친 버전을 가리킬 수 없다). 템플릿에서 우회하지 않는다.

## 11. 플랜에서 먼저 확인할 위험

1. **`definePage` meta 의 import 상수** — `P.USERS_READ` 처럼 import 한 값을 `definePage` 에서 쓸 수 있는지(vue-router 5 의 매크로 추출). → **확인됨**(§13-1).
2. **파일 기반 + 킷** — `setupLayouts` 래퍼 아래의 `SettingsShell`(첫 자식 리다이렉트 · 좌측 메뉴) · 가드의 meta 병합. 어긋나면 킷 결함(§10). `buildMenu depth: 'all'` 은 쓰지 않는다(§13-2).
3. **shared dist 순서** — backend · frontend 가 `@project/shared` 를 `dist` 로 읽는다. 새 체크아웃 · CI 에서 `pnpm typecheck` 가 빌드보다 먼저면 "Cannot find module" 이다(이 저장소 HANDOFF 첫 세션 결함과 같다) — 루트 `prepare` 로 shared 를 빌드할지 확인한다.
4. **pnpm 10.33** — `ignoredBuiltDependencies` 문법, 전역 pnpm 12 가 `packageManager` 로 10.33 을 내려받아 도는지(`manage-package-manager-versions`), 공개 경과 시간 정책이 오늘 공개된 0.4.1 을 막는지. → 전역 pnpm 12.8.1 이 템플릿 안에서 10.33.0 으로 바뀌어 돈다(확인).
5. **kysely-ctl 0.21 의 TS 로더** — `kysely.config.ts` 가 `./src/core/database/admin-db.js`(실제 `.ts`)를 import 할 때 풀리는지. → **확인됨**(jiti 2.7 이 `.js` → `.ts` 를 푼다).
6. **`loadDotEnv` 와 `--env-file`** — Docker 는 `run.sh` 의 `--env-file /run/secrets/backend_env` 로 env 를 싣는다. `loadDotEnv(../.env)` 가 파일이 없을 때 조용한지, 이미 있는 변수를 덮지 않는지.
7. **`Dockerfile.*` 의 `COPY .npmrc`** — `preset/db` 에 `.npmrc` 가 없다. 이미지 빌드가 여기서 실패할 것으로 본다 — 템플릿 결함으로 고친다. pnpm 10 의 `pnpm deploy` 는 `inject-workspace-packages` 없이 `--legacy` 가 필요하고, 루트 `prepare` 가 소스 복사 전 설치에서 돌지 않게 `--ignore-scripts` 를 단다(§13-4).
8. **Vuetify 스타일 순서** — 템플릿 `styles/settings.scss`(sass `configFile`)와 `@ssworks/admin-ui/style.css` · `vuetify/styles` 의 순서 · 중복.
9. **`tsc-watch` · `node --watch`** — Windows 에서 재시작 · 종료 신호(`enableShutdownHooks`)가 풀을 닫는지.
10. **eslint-config-vuetify** — 포팅한 코드(킷 스타일 · 4칸 들여쓴 script)가 규칙에 걸리는 범위.

## 12. 비범위

- IP 접근 제어 · 감사 로그 화면(후속 admin-ui PR 후보 — HANDOFF 에 적는다).
- 실서버 확인이 넘긴 결함 둘(기본 정렬 열 오름차순 · 조회 실패 직후 빈 상태)과 `ERR_DUPLICATE_USER_ID` 주석.
- 회원용 화면 · 공개 API(약관 공개 조회 예제는 킷 README 몫).
- 템플릿 원격 push, `master` · `preset/db` · `preset/auth` 변경, `docs/ux-guidelines.md`(preset/auth 의 것 — 킷 README 가 대신한다).

## 13. 구현 중 정정

플랜 작성 중(2026-10-16) — 버리는 시험(`%TEMP%dpp` vite 8 + vue-router 5.4 · akss 의 jiti)과 코드 읽기로 정한 것:

1. **`definePage` 의 import 상수는 된다.** 빌드 결과에 `?definePage` 가상 모듈이 `P.USERS_READ` 와 그 import 를 그대로 싣는다.
2. **드로어는 depth 1 · 하위 페이지는 점 표기.** `buildMenu` 는 `meta.menu` 가 있는 레코드만 항목으로 만든다. `depth: 'all'` 이면 `settings/roles.vue` 처럼 설정 셸 자식이 좌측 메뉴용 `meta.menu`(아이콘 · 순서)를 가질 때 드로어에도 올라간다. 폴더(`teams/index.vue`)는 컴포넌트 없는 부모 + `path: ''` 자식을 만들어 depth 1 로는 안 보인다. 그래서 하위 페이지는 점 표기(`users.new.vue` · `users.[userNo].vue` → 최상위 `/users/new` · `/users/:userNo`)로 두고, 폴더는 중첩 셸(`settings/`)에만 쓴다. 드로어는 날 `routes` 를 depth 1 로 본다. admin-ui README 「파일 기반 라우팅이면 `depth: 'all'`」에 이 중복을 알리는 문장을 더한다(문서만 — 2391d33 처럼 changeset 없음).
3. **사용자 추가 · 편집 폼은 컴포넌트 하나** — `components/users/UserEditForm.vue` 를 `users.new.vue` · `users.[userNo].vue` 가 감싼다(aksv 는 한 컴포넌트를 두 라우트에 걸었다).
4. **Docker** — pnpm 10 의 `pnpm deploy` 는 `--legacy`(또는 `inject-workspace-packages`)가 필요하다. 루트 `prepare`(shared 빌드)가 package.json 만 복사한 설치 단계에서 돌면 실패하므로 Dockerfile 의 설치는 `--ignore-scripts` 다.
5. **frontend `typecheck`** — 루트 `pnpm typecheck`(`pnpm -r typecheck`)는 frontend 의 `type-check` 를 부르지 않는다. frontend 에 `typecheck` 를 더한다.

구현 · 검증 중(2026-10-16, 플랜 Task 1~11 — 근거는 `docs/verification/2026-10-16-template-preset-admin.md`):

6. **카탈로그 테스트에 `'*'`** — `permissions.ALL_PERMISSION_VALUES` 는 킷이 넣는 전체 권한 `'*'` 를 함께 담는다. 테스트 기대는 `['*', ...EXPECTED_KEYS]` 이고, 제목에 키 개수를 적지 않는다(스킬이 키를 더할 때마다 고치던 곳).
7. **backend `tsconfig.build.json` 의 `incremental: false`** — base 의 incremental 이 tsbuildinfo 를 dist 밖에 남겨 dist 를 지운 뒤 빌드가 아무것도 내지 않았다.
8. **`.dockerignore` 는 어느 깊이에서나 막는 패턴** — `**/node_modules` · `**/dist` · `**/*.tsbuildinfo` · `**/.env*`. 루트 패턴만이면 `packages/*/node_modules` 가 이미지 설치를 덮고 `packages/backend/.env`(비밀값)가 이미지에 들 수 있다.
9. **frontend 모양은 eslint-config-vuetify** — prettier(속성 한 줄)와 vuetify stylistic(속성마다 줄 · 함수 괄호 앞 공백)이 부딪혀 `.prettierignore` 에 `packages/frontend/`. 검사는 `pnpm format`(backend · shared · 문서) + `pnpm lint:fix`(frontend). 머리 주석 뒤에는 빈 줄 하나 — 붙어 있으면 `lint:fix` 의 import 정렬이 주석을 끌고 간다.
10. **결과 없는 쓰기 어댑터는 `.then(() => undefined)`** — 킷 훅(`useSessions` 의 revoke 등)이 `Promise<void>` 를 받는다(TS2322).
11. **개발 서버 사전 번들** — `optimizeDeps.exclude: ['vuetify']`(자동 import 가 페이지마다 새 컴포넌트를 찾아 첫 방문마다 다시 묶고 새로 고쳤다 — create-vuetify 기본과 같다), `include` 에 `@ssworks/admin-shared` · `<scope>/shared > luxon` · `<scope>/shared > zod` · `vue-router/experimental`(workspace shared 와 파일 기반 라우트 런타임이 늦게 드러나 첫 로드에 한 번 더 새로 고쳤다 — zod 는 스킬이 shared 에 스키마를 더한 뒤에야 드러난다).
12. **admin-scaffold 검사 순서는 `test` → `typecheck`** — 새 `[param]` 페이지의 `typed-router.d.ts` 를 vitest 가 확정적으로 다시 만든다(frontend `build` 는 type-check 와 vite build 를 병렬로 돌려 경합). 스킬에는 장 파일을 통째로 바꿔 쓸 것, `reversible: false` 문구를 message 에 되풀이하지 않을 것도 적었다.
13. **`pnpm-workspace.yaml` 의 `ignoredBuiltDependencies` 에 `@parcel/watcher`** — 미리 빌드된 바이너리라 설치 경고만 없앤다.
