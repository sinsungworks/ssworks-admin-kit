# admin-server 인증 설계 (Phase 2 PR 2b)

작성일: 2026-10-13 · 상태: 확정(구현 전) · 선행: 2a 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1(Phase 2 지도 · §1-3 의 2b 행 · §1-4 공통 결정), `docs/01-phase0.md` §4 #4 · #5 · #6 · §3-2, `docs/phase0-reports/be-core-auth.md` §1-3 · §1-4 · §1-5 · §2 · §3 · §4, 셸 스펙 §3-4 ~ §3-6(가드 · API 클라이언트 · 스토어), 3c 스펙 §4-3 · §4-4 · §9(서버 계약)

이 문서는 2b 의 범위만 쓴다. Phase 2 전체 지도 · 순서 · 공통 결정(라우트 자리 · 응답 봉투 · 오류 · 데이터 접근 · 시간 · changeset)은 2a 스펙 §1 이 그대로 유효하다.

## 1. 목표

2a 스펙 §1-3 의 2b 행:

> `password.util`(argon2id) · `password-recheck` · `cookie.util` · login/refresh 정책 · `AUTH_REPOSITORY` + Kysely 구현 · `AuthService` · `AuthGuard` · `PermissionGuard` · 데코레이터 · `AuthController`(login · refresh · logout · me · password) · 강제 변경. IP · 감사는 선택 주입 자리만.

끝 상태 — 실 MariaDB 의 HTTP 계약으로 증명한다:

- 로그인 → 쿠키 → `/me` → 회전 → 옛 refresh 재제시 시 그 사용자의 살아 있는 세션 전부 폐기 + 401 `ERR_REFRESH_REUSED`
- 잠긴 계정의 로그인은 비밀번호가 맞아도 401 `ERR_LOGIN_FAILED`(판정 오라클 방지 — §14 R7), 비밀번호 변경 · 재인증의 잠김은 423 `ERR_ACCOUNT_LOCKED`, 자격 불일치 401 `ERR_LOGIN_FAILED`, 액세스 토큰 만료 401 `ERR_EXPIRED_TOKEN`
- 권한 표시 없는 라우트 403(fail-closed), 강제 변경 계정은 `/me` · 비밀번호 변경만
- 틀린 현재 비밀번호 = 400 `ERR_COMMON_VALIDATION` + `details.issues[{ path: ['currentPassword'] }]`(3c W1)

쓰는 쪽은 이 PR 이 끝나면 `AdminServerModule.forRootAsync` 의 `auth` 옵션 한 줄과 `AdminAuthModule` import 한 줄로, admin-ui `createApiClient` · `createAppStore` · `createAdminGuard` 가 그대로 붙는 관리자 인증을 갖는다.

## 2. 결정

### 2-1. 경계 결정 (2026-10-09, 결정 문서 HTML — 모두 권장안)

| #            | 확정                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① JWT        | **J1** — `@nestjs/jwt` 를 `dependencies` 에. 결정 ⑤ E1 의 기준("쓰는 쪽과 인스턴스 · 타입을 공유하는가")대로 — 인증 모듈이 자기 `JwtService` 를 만들고 공개 타입에 jwt 타입이 나가지 않는다. 2a §7 의 "`@nestjs/jwt` 는 2b"(peer 목록) 메모를 이 결정이 고친다(§13) |
| ② 가드 범위  | **G1** — 앱 전역. `AdminAuthModule` 을 import 하면 `APP_GUARD` 둘이 앱의 모든 라우트에 걸린다. 회원 · 공개 · 헬스체크 컨트롤러는 `@Public()` 으로 뺀다. 잊으면 401 로 드러난다(구멍이 아니라 고장)                                                                  |
| ③ 유예창     | **W1** — `refreshGraceMs` 기본 30 000(gise), `0` 이면 끈다. 동시 회전 0행은 행을 다시 읽어 같은 판정. 끄면 0행은 401 `ERR_INVALID_TOKEN` 만(hangang)                                                                                                                |
| ④ 퇴사       | **R1** — `users.resignAt` 은 **효력 시각**이다. 인증은 `resignAt ≤ now` 만 본다. "퇴사일 당일까지 근무" · 기준 시간대 변환은 2d 가 쓸 때 한다                                                                                                                       |
| ⑤ 교체 지점  | **A1** — `AUTH_REPOSITORY` 는 사용자 쪽 다섯 메서드. 세션은 패키지 내부 `AdminSessionStore`(교체 대상 아님)                                                                                                                                                         |
| ⑥ 옵션 자리  | **O1** — 값은 코어 `AdminServerOptions.auth` · `passwordPolicy`(env 를 읽는 곳이 하나, 정책은 2d 와 나눈다). 리포지토리 교체만 `AdminAuthModule.withRepository(Repo, { imports })`                                                                                  |
| ⑦ 이름       | **N1** — `@Public()` · `@SelfOnly()` · `@RequirePermissions()` · `@RequireAnyPermissions()` · `@CurrentAdmin()` → `AdminPrincipal`(`req.admin`). 메타 키는 `admin-kit:` 접두                                                                                        |
| ⑧ 2c·2f 자리 | **H1** — 선택 주입 토큰 둘: `ADMIN_ACCESS_POLICY`(2f) · `ADMIN_AUTH_EVENTS`(2c). 없으면 아무것도 안 한다                                                                                                                                                            |
| ⑨ 쿠키       | **C1** — `admin_at` · `admin_rt`, 둘 다 `Path=/`, `SameSite=Lax`, httpOnly, Secure `'auto'`                                                                                                                                                                         |
| ⑩ 분할       | **S1** — 한 PR                                                                                                                                                                                                                                                      |

### 2-2. 공통 결정 (정본이 같거나 계약이 정한 것 — 이의 없음)

1. **토큰.** 토큰은 httpOnly 쿠키로만 나간다 — 본문에 싣지 않는다(gise). 액세스 = JWT HS256 `{ userNo, sessionNo }`(`"BigInt(n)"` 래퍼 문자열), 15분. refresh = 512비트 난수, DB 에는 sha256 hex 만, 7일(회전마다 새 행이 7일을 다시 받는다). `jwtSecret` 필수 · 32자 미만이면 기동 거부(axion).
2. **로그인 판정 순서.** 비밀번호 검증이 먼저다 — 존재 · 잠김 · 퇴사는 비밀번호를 아는 사람에게만 드러난다(gise · hangang). 잠금 5회 · 15분, 잠긴 동안 연장 없음, 잠금이 끝난 뒤 첫 실패는 1부터(두 정본 같은 알고리즘). 잠긴 동안의 로그인은 맞은 비밀번호도 같은 401(§14 R7).
3. **매 요청.** 권한은 토큰에 싣지 않고 매 요청 DB 에서 읽는다. 세션 행의 `userNo` 를 토큰과 대조한다(axion). `lastAccessAt` 은 요청마다 쓰지 않는다 — 15분마다 회전이 새 행을 지금 시각으로 만든다.
4. **회전 · 재사용.** 재사용 탐지는 살아 있는 세션만 `'reuse_detected'` 로 바꾼다(hangang R34). `'terminated'` · `'reuse_detected'` 의 재제시는 401 `ERR_INVALID_TOKEN` 만. 잠김 계정의 회전은 막지 않는다(잠금은 비밀번호 대입 방어다).
5. **강제 변경 · 비밀번호 변경 · 로그아웃 · 재인증.** §5-4.
6. **그 밖.** `/me` 모양(§4-5) · argon2id m=64MiB t=3 p=4 · `j:` 쿠키는 없음으로 · 응답 `data: null` · 로그인 실패 401(hangang 404 아님) · `req.ip` · 컬럼 폭으로 자름 · 시계 경계(§5-5) · 마이그레이션 없음.

### 2-3. 설계 결정 (설계안 승인 2026-10-10)

| #   | 결정                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | 리포지토리 다섯 메서드 중 하나는 `findCredentialByNo` 다(결정 문서의 `findPasswordHash` 를 다듬음) — 비밀번호 변경 · 재인증도 잠금 상태 · 카운터를 봐야 한다                                                                                                                                                          |
| B2  | 🔴 **비밀번호를 확인하는 세 자리(로그인 · 변경 · 재인증)가 실패 카운터 하나를 쓴다.** 변경 · 재인증의 실패도 센다 — gise 는 변경만 셌다. 세션을 쥔 사람이 재인증 붙은 쓰기를 비밀번호 대입 경로로 쓰지 못하게 한다. 대가: 재인증을 5번 틀리면 15분 동안 로그인 · 변경 · 재인증이 막힌다(이미 연 세션 · 회전은 그대로) |
| B3  | 🔴 **회전은 한 트랜잭션이다**(옛 행 조건부 폐기 · 새 행 INSERT · 링크). 정본 둘은 세 문장을 따로 보내 INSERT 가 죽으면 그 기기가 되돌릴 수 없이 로그아웃됐다(hangang A6). 경합은 InnoDB 잠금 읽기가 가른다 — 진 쪽 UPDATE 는 이긴 쪽 커밋을 기다렸다가 0행을 받는다                                                   |
| B4  | 🔴 `'rotated'` 행의 `replacedBySessionNo` 가 null 이면 후계가 없는 것 — 재사용으로 본다(fail-closed). 우리 회전은 같은 트랜잭션에서 링크하므로 null 은 이상 상태다. gise 는 두 문장 사이 구간 때문에 null 에 유예를 줬다                                                                                              |
| B5  | 러너 진입점(`./runner`)이 `hashPassword` · `verifyPassword` 를 낸다 — 시드 스크립트(B)가 Nest 없이 계정을 만든다. argon2 는 Nest 무의존이다                                                                                                                                                                           |
| B6  | 리포지토리 교체는 내부 토큰 `CUSTOM_AUTH_REPOSITORY` + `AUTH_REPOSITORY` 팩토리(있으면 그것, 없으면 `KyselyAuthRepository`)로 한다 — 같은 토큰을 정적 · 동적 메타데이터에 두 번 두고 덮어쓰기 순서에 기대지 않는다                                                                                                    |
| B7  | IP 정책은 `boolean` 만 돌려준다. 403 `ERR_IP_NOT_ALLOWED` + `details.clientIp` 는 패키지가 던진다 — admin-ui README 배선이 읽는 계약을 2b 가 지킨다                                                                                                                                                                   |
| B8  | 인증 이벤트 기록이 실패해도 인증을 막지 않는다 — `Logger.warn` 만(hangang 감사 `record` 와 같다). 비밀번호 변경 이벤트는 커밋 뒤에 낸다. 같은 트랜잭션 감사는 2c 가 정한다                                                                                                                                            |
| B9  | 2b 는 `users.revision` 을 건드리지 않는다 — 비밀번호 변경이 사용자 편집 폼의 충돌 대상인지는 2d 가 정한다                                                                                                                                                                                                             |

## 3. 정본과 흡수 목록

| 산출물                                             | 정본                                                                                                      | 흡수할 것                                                                                             | 버릴 것                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `password.ts`                                      | gise `core/auth/password.util.ts` · hangang `core/utils/password.util.ts`(넷 다 m=65536 · t=3 · p=4)      | 매개변수 고정 · "낮추지 말 것" 주석 · 더미 해시                                                       | —                                                                                                 |
| `refresh-token.ts`                                 | gise · hangang `token.util.ts`                                                                            | 64바이트 난수 · sha256(argon2 가 아닌 이유 주석)                                                      | hangang 의 UNIQUE 충돌 재시도 3회(512비트라 일어나지 않는다)                                      |
| `login-policy.ts`                                  | gise `login-policy.ts` = hangang(필드 이름만 다름)                                                        | `isLocked` · `nextLoginState`(만료 뒤 0부터 · 잠긴 동안 연장 없음)                                    | 상수 고정(→ 옵션, 기본값 같음)                                                                    |
| `refresh-policy.ts`                                | gise `refresh-policy.ts` · `auth.service.ts` `isWithinGrace`                                              | 유예창 · 시계 오차 하한 5초(상수) · 후계 생존 · 같은 사용자 불변식                                    | 링크 전 구간의 null 유예(B4)                                                                      |
| `cookies.ts`                                       | hangang `core/utils/cookie.util.ts` · gise `core/auth/cookies.ts`                                         | set/clear 가 옵션 함수 하나를 공유 · 호출 시점 평가 · Secure fail-secure(proto ‖ NODE_ENV)            | 고정 이름(→ 옵션)                                                                                 |
| `auth.repository.ts` · `kysely-auth.repository.ts` | gise `auth.repository.ts`(인터페이스 · `AUTH_REPOSITORY`) · hangang `primaryTeamQuery`(R34)               | 토큰 + 인터페이스 + Kysely 기본 구현, 기대 해시 조건부 비밀번호 교체, 대표 팀 `teamNo` 오름차순       | 세션 메서드(→ `AdminSessionStore`, A1), `touchLastLogin`(코어 컬럼 없음)                          |
| `session.store.ts`                                 | gise 리포지토리 세션 메서드 · hangang `auth.service.ts` `issueSession` · 폐기 조건절(R34)                 | 조건부 폐기(`isRevoked = false`) · 호출부가 주는 `revokedAt` · 살아 있는 행만 일괄 폐기 · 메타 자르기 | 세 문장 분리(→ 한 트랜잭션, B3)                                                                   |
| `auth.service.ts`                                  | gise `auth.service.ts`(로그인 · 회전 · 유예 · 재사용) + hangang 로그인 순서(퇴사 → IP → 잠김) · 가드 조회 | 더미 해시 · 비밀번호 먼저 · P1/P2 한 판정 · 재조회 · `logoutByRefreshToken` 멱등 · 퇴사 차단          | gise `isActive`(→ `resignAt`, R1), hangang 사이트 시간대(→ 2d), 감사 직접 호출(→ 이벤트 자리, H1) |
| 비밀번호 변경                                      | gise `admin-password.service.ts`                                                                          | 잠김 먼저 · 틀리면 카운터 · 필드 오류 · 기대 해시 조건부 · 다른 세션 폐기 한 트랜잭션                 | `ERR_WRONG_PASSWORD`(hangang — 3c W1 이 필드 오류로 정함)                                         |
| `reauth.service.ts`                                | hangang `core/utils/password-recheck.ts`                                                                  | "트랜잭션 안에서 부르지 마라" · 403 `ERR_REAUTH_REQUIRED` · 유효창 없음                               | 카운터를 세지 않음(→ B2)                                                                          |
| `auth.guard.ts`                                    | hangang `core/guards/auth.guard.ts` + gise payload 검사 + axion 소유 대조                                 | JWT 예외 매핑(만료 · 위조) · 세션 → 사용자 → 퇴사 → IP 순서 · IP 거부는 가드가 기록(I4)               | apiKey 경로 · 사이트 시간대                                                                       |
| `permission.guard.ts`                              | hangang `core/guards/permission.guard.ts`                                                                 | fail-closed · `@SelfOnly` 명시 통과 · AND/OR · `'*'` 정확 일치(admin-shared `hasPermission`)          | `PERMISSIONS.ALL` 직접 비교(→ admin-shared 판정 함수)                                             |
| 데코레이터                                         | hangang `core/decorators/*`                                                                               | 이름 넷 · "부재가 아니라 선언이 통과" 주석                                                            | `@CurrentUser`(→ `@CurrentAdmin`, N1), `@Cookies`(컨트롤러가 직접 읽는다)                         |
| `auth.controller.ts`                               | gise `auth.controller.ts` · hangang `auth.controller.ts`                                                  | `@Public` 로그인 · 갱신 · 로그아웃, `@HttpCode(200)`, 쿠키는 늘 지움                                  | `{ ok: true }` 본문(→ `data: null`), hangang `@SelfOnly` 로그아웃                                 |

## 4. 공개 API

### 4-1. 옵션 (`src/options.ts` 에 더한다)

```ts
export interface AdminServerOptions {
  db: AdminDbConnection
  errorCodes?: Pick<ErrorCodeTable<Record<string, string>>, 'httpStatusFor'>
  /** `AdminAuthModule` 을 쓰면 필수. 없으면 기동에서 멈춘다 */
  auth?: AdminAuthOptions
  /** admin-shared `definePasswordPolicy()` 결과. 없으면 기본 정책(8 · 200). 인증(변경)과 2d 가 함께 읽는다 */
  passwordPolicy?: PasswordPolicy
}

export interface AdminAuthOptions {
  /** HS256 비밀키. 🔴 32자 이상 — 짧으면 기동 거부. 값은 어떤 오류 메시지에도 싣지 않는다 */
  jwtSecret: string
  /** 액세스 토큰 · 쿠키 수명(ms). 기본 900 000(15분). JWT `exp` 는 초 단위로 올림 */
  accessTtlMs?: number
  /** refresh 세션 수명(ms). 기본 604 800 000(7일). 회전마다 새 행이 다시 받는다 */
  refreshTtlMs?: number
  /** 회전된 토큰을 다른 탭이 늦게 내도 받아 주는 창(ms). 기본 30 000, 0 이면 끈다. accessTtlMs 미만 */
  refreshGraceMs?: number
  /** 기본 5회 · 900 000ms */
  lockout?: { maxFailures?: number; lockMs?: number }
  cookies?: AdminAuthCookieOptions
  /** 🔴 기본 true. false 면 권한 선언 없는 라우트가 인증만으로 통과한다(crm · axion 이식 과도기). 기동 때 경고 한 줄 */
  failClosed?: boolean
}

export interface AdminAuthCookieOptions {
  accessName?: string // 기본 'admin_at'
  refreshName?: string // 기본 'admin_rt'
  /** refresh 쿠키 경로. 기본 '/'. 좁히려면 브라우저가 보는 경로(전역 prefix 포함)를 적는다 */
  refreshPath?: string
  sameSite?: 'lax' | 'strict' // 기본 'lax'
  /** 기본 'auto' = req.secure ‖ X-Forwarded-Proto 첫 값이 https ‖ NODE_ENV === 'production'(부를 때마다 계산) */
  secure?: 'auto' | boolean
  domain?: string
}
```

- 해석은 `resolveAuthOptions(auth)` 한 함수(순수, 단위 테스트)가 한다. 던지는 경우: `auth` 없음 · `jwtSecret` 이 문자열이 아니거나 32자 미만 · TTL 이 양의 정수가 아님 · `refreshGraceMs` 가 0 미만 정수가 아니거나 `accessTtlMs` 이상 · 잠금 값이 양의 정수가 아님 · 쿠키 이름이 빈 문자열 · 두 쿠키 이름이 같음. 메시지는 한국어로 **옵션 이름만** 담는다.
- 🔴 시계 오차 하한 `CLOCK_SKEW_TOLERANCE_MS = 5000` 은 옵션이 아니다 — 배포자가 조용히 넓히면 시계가 앞선 서버가 쓴 행에서 재사용 탐지가 꺼진다(gise 픽스 라운드 2).

### 4-2. 모듈 (`src/auth/admin-auth.module.ts`)

```ts
@Module(/* 기본 배선 — KyselyAuthRepository */)
export class AdminAuthModule {
  static withRepository(
    repository: Type<AdminAuthRepository>,
    options?: { imports?: ModuleMetadata['imports'] },
  ): DynamicModule
}
```

- 제공: 내부 설정 토큰(해석된 인증 옵션 + 비밀번호 정책) · `AdminAccessTokenService` · `AUTH_REPOSITORY`(B6) · `AdminSessionStore` · `AdminAuthService` · `AdminReauthService` · `APP_GUARD` `AdminAuthGuard` → `APP_GUARD` `AdminPermissionGuard`(등록 순서 = 실행 순서). 컨트롤러 `AdminAuthController`. 내보냄: `AdminReauthService` · `AUTH_REPOSITORY`.
- 🔴 이 파일은 `admin-server.module.ts` 를 import 하지 않는다 — 토큰은 `tokens.ts`(2a F3). 코어의 `ADMIN_ROUTE_MODULES` 가 `[AdminAuthModule]` 이 되어 `/admin/auth/*` 가 된다.
- `ADMIN_SERVER_OPTIONS` 은 코어 전역 모듈이 내보내므로 주입된다. 코어 없이 이 모듈만 쓰면 기동에서 멈춘다(Nest 의 해석 오류).
- `ADMIN_ACCESS_POLICY` · `ADMIN_AUTH_EVENTS` 는 `@Optional()` 로 받는다 — 제공하는 모듈(2c · 2f · 쓰는 쪽)은 전역으로 내보낸다.

### 4-3. 리포지토리 (`src/auth/auth.repository.ts`)

```ts
export const AUTH_REPOSITORY: unique symbol // tokens.ts

export interface AdminCredential {
  userNo: bigint
  passwordHash: string
  /** 🔴 효력 시각(R1). 이 시각부터 로그인 · 요청이 막힌다. null = 재직 */
  resignAt: Date | null
  loginFailCount: number
  lockUntil: Date | null
  isPasswordChangeRequired: boolean
}

export interface AdminPrincipalRecord {
  userNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  /** 대표 팀 — teamNo 오름차순 첫 행. 팀이 없으면 null */
  teamNo: bigint | null
  teamName: string | null
  /** 역할 권한(검증 전 문자열). 강제 변경 계정이어도 그대로 — 비우는 것은 서비스다 */
  permissions: string[]
  isPasswordChangeRequired: boolean
  resignAt: Date | null
}

export interface AdminLoginState {
  loginFailCount: number
  lockUntil: Date | null
}

export interface AdminAuthRepository {
  findCredentialByUserId(userId: string): Promise<AdminCredential | null>
  findCredentialByNo(userNo: bigint): Promise<AdminCredential | null>
  findPrincipal(userNo: bigint): Promise<AdminPrincipalRecord | null>
  // 🔴 원자적 — 행 잠금(SELECT … FOR UPDATE)으로 현재 값을 읽어 next 의 결과를 쓰고 돌려준다(§14 R8)
  updateLoginState(
    userNo: bigint,
    next: (current: AdminLoginState) => AdminLoginState,
  ): Promise<AdminLoginState>
  /**
   * 🔴 기대 해시(`expectedHash`)가 그대로일 때만 바꾼다 — 바꿀 때 `isPasswordChangeRequired = false`,
   * `loginFailCount = 0`, `lockUntil = null` 을 함께 쓴다. 바뀐 행 수(0 = 검증 뒤 다른 쓰기가 먼저 커밋).
   * 받은 트랜잭션 위에서만 쓴다.
   */
  changePassword(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    expectedHash: string,
    newHash: string,
  ): Promise<number>
}

export class KyselyAuthRepository implements AdminAuthRepository {
  constructor(@Inject(KYSELY) db: Kysely<AdminDatabase>)
}
```

- 기본 구현은 코어 테이블 이름(`users.userId` · `password` · `userName` · `roleNo` · `resignAt` · `loginFailCount` · `lockUntil` · `isPasswordChangeRequired`, `roles.roleName` · `permissions`, `teamUserMap` · `teams`)을 쓴다. 모든 쿼리는 2a `runQuery` 로 감싼다(드라이버 오류 → 503 · 504).
- `findPrincipal` 의 권한: `readJsonColumn` → 배열이면 문자열 원소만, 배열이 아니면 `[]` + `Logger.warn`(역할 번호만, 값 없음). 🔴 fail-closed — 깨진 JSON 이 500 으로 그 역할 전원을 막거나 이상한 권한을 주지 않는다.
- 쓰는 쪽 교체 구현(gise 형 컬럼)은 `isActive` 를 `resignAt: isActive ? null : new Date(0)` 으로 옮긴다(README).
- 🔴 사용자 테이블이 아닌 것(세션)은 여기 없다(A1).

### 4-4. 주체 · 데코레이터 (`src/auth/principal.ts` · `decorators.ts`)

```ts
export interface AdminPrincipal {
  userNo: bigint
  sessionNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  teamNo: bigint | null
  teamName: string | null
  /** 🔴 강제 변경 계정은 [](gise) — 권한 라우트가 저절로 403 이 된다 */
  permissions: readonly string[]
  isPasswordChangeRequired: boolean
}

export function getAdminPrincipal(req: Request): AdminPrincipal | undefined // 2c 인터셉터 · 쓰는 쪽용

export function Public(): CustomDecorator // 'admin-kit:public' — 인증 · 권한 가드를 모두 건너뛴다
export function SelfOnly(): CustomDecorator // 'admin-kit:self-only' — 인증만 요구한다는 명시 선언
export function RequirePermissions(...permissions: string[]): CustomDecorator // AND
export function RequireAnyPermissions(...permissions: string[]): CustomDecorator // OR
export const CurrentAdmin: () => ParameterDecorator // AdminPrincipal. 🔴 없으면 401(방어)
```

- 주체는 `req.admin` 에 둔다(회원 인증 passport 의 `req.user` 와 갈린다). Express `Request` 타입을 전역 증강하지 않는다 — `getAdminPrincipal` · `@CurrentAdmin` 으로 꺼낸다.
- 강제 변경 중 허용 표시(`'admin-kit:allow-password-change'`)는 내부 메타다 — 공개하지 않고 `me` · `password` 에만 붙인다.
- 데코레이터 인자 타입은 `string` 이다. 프로젝트 권한 유니온으로 좁히려면 쓰는 쪽이 감싼다(`(...p: Permission[]) => RequirePermissions(...p)`, README).

### 4-5. `/me` 응답

```ts
// AdminPrincipal 에서 sessionNo 를 뺀다. teamNo · teamName 이 null 이면 키를 뺀다(AdminUserInfo 의 `?:`)
{ userNo, userId, userName, roleNo, roleName, teamNo?, teamName?, permissions, isPasswordChangeRequired }
```

admin-ui `AdminUserInfo { userId, userName, permissions, teamName?, roleName?, isPasswordChangeRequired? }` 의 상위 집합이다. 프로젝트 필드를 더하는 옵션은 두지 않는다 — 쓰는 쪽 자기 라우트(B).

### 4-6. 2c · 2f 자리 (`src/auth/hooks.ts`)

```ts
export const ADMIN_ACCESS_POLICY: unique symbol // tokens.ts
export interface AdminAccessPolicy {
  /** 거부면 false — 403 ERR_IP_NOT_ALLOWED + details.clientIp 는 패키지가 던진다(B7) */
  allows(context: {
    clientIp: string | null
    userNo: bigint
    teamNos: readonly bigint[]
  }): Promise<boolean>
}

export const ADMIN_AUTH_EVENTS: unique symbol // tokens.ts
export interface AdminAuthEventSink {
  /** 🔴 던져도 인증은 계속된다 — 패키지가 잡아 Logger.warn(B8) */
  record(event: AdminAuthEvent, req: Request): Promise<void>
}

export type AdminAuthEvent =
  | { type: 'login.success'; userNo: bigint; sessionNo: bigint }
  | { type: 'login.fail'; userId: string; userNo: bigint | null; loginFailCount: number | null }
  | { type: 'login.blocked'; reason: 'resigned' | 'ip' | 'locked'; userId: string; userNo: bigint }
  | {
      type: 'token.refresh'
      userNo: bigint
      sessionNo: bigint
      rotatedFrom: bigint
      grace: boolean
    }
  | { type: 'token.reuse'; userNo: bigint; sessionNo: bigint; revokedCount: number }
  | { type: 'logout'; userNo: bigint; sessionNo: bigint }
  | { type: 'password.change'; userNo: bigint; sessionNo: bigint; revokedCount: number }
  | { type: 'access.blocked'; reason: 'ip'; userNo: bigint; sessionNo: bigint }
```

- 이벤트에 비밀번호 · 토큰 · 해시를 싣지 않는다. `login.fail` 의 `userNo` 는 계정이 없으면 null(hangang 익명 주체), `loginFailCount` 는 계정이 있을 때 갱신 뒤 값.
- 2b 는 상태를 바꾸지 않는 거부(토큰 없음 · 위조 · 만료 · 경합 0행 · 폐기 세션)를 이벤트로 내지 않는다 — 15분마다 도는 갱신의 정상 잡음이다(hangang).

### 4-7. 서비스 (`src/auth/reauth.service.ts`)

```ts
@Injectable()
export class AdminReauthService {
  /**
   * 행위자 본인의 비밀번호를 다시 확인한다. 잠김 423 · 틀리면 카운터 +1 → 403 ERR_REAUTH_REQUIRED.
   * 🔴 트랜잭션 안에서 부르지 않는다 — argon2 수백 ms 동안 잡은 행 잠금을 쥔다(hangang password-recheck).
   *    권한 가드가 이미 통과시킨 뒤, 서비스 진입부에서 부른다(권한 없는 사람에게 비밀번호를 묻지 않는다).
   */
  verify(principal: AdminPrincipal, password: string): Promise<void>
}
```

`AdminAuthService`(로그인 · 회전 · 로그아웃 · 인증 · 비밀번호 변경) · `AdminSessionStore` · `AdminAccessTokenService` 는 내보내지 않는다(2c 가 패키지 안에서 쓴다).

### 4-8. 러너 (`./runner` 에 더한다)

```ts
export function hashPassword(password: string): Promise<string> // argon2id m=65536 · t=3 · p=4
export function verifyPassword(passwordHash: string, password: string): Promise<boolean>
```

🔴 `runner` 의 import 그래프에 `@nestjs/` 가 없다는 2a 테스트(`runner-graph.test.ts`)가 그대로 지킨다.

### 4-9. 라우트 (`AdminAuthController`, `@Controller('auth')` → `/{전역 prefix}/admin/auth/…`)

| 라우트           | 표시                         | 본문                                                                  | 성공                          |
| ---------------- | ---------------------------- | --------------------------------------------------------------------- | ----------------------------- |
| `POST login`     | `@Public` · `@HttpCode(200)` | `{ userId: string(1..64), password: string(1..max(정책 최대, 256)) }` | 쿠키 둘 · `data: null`        |
| `POST refresh`   | `@Public` · `@HttpCode(200)` | 없음(refresh 쿠키)                                                    | 쿠키 둘 · `data: null`        |
| `POST logout`    | `@Public` · `@HttpCode(200)` | 없음(refresh 쿠키)                                                    | 쿠키 지움 · `data: null` — 늘 |
| `GET me`         | `@SelfOnly` · 강제 변경 허용 | —                                                                     | §4-5                          |
| `PATCH password` | `@SelfOnly` · 강제 변경 허용 | 정책의 `changePasswordSchema`                                         | `data: null`                  |

본문 검증은 2a `ZodValidationPipe` 를 감싼 주입형 파이프(`LoginBodyPipe` · `ChangePasswordBodyPipe`)가 한다 — 스키마가 런타임 정책에 달려 있어 데코레이터 인자로 고정할 수 없다. 실패는 400 `ERR_COMMON_VALIDATION`(2a F8).

## 5. 흐름

### 5-1. 로그인 (`AdminAuthService.login(userId, password, req)`)

```
cred = findCredentialByUserId(userId)
├ null ─────────────────── verifyPassword(DUMMY) · login.fail(userNo null) → 401 ERR_LOGIN_FAILED
├ 비밀번호 틀림 ────────── updateLoginState(nextLoginState FAIL — 원자적) · login.fail → 401 ERR_LOGIN_FAILED
│                            🔴 잠김 · 퇴사 계정이어도 같은 응답 · 같은 비용(argon2 1회)
└ 비밀번호 맞음
   ├ updateLoginState(잠겨 있으면 그대로, 아니면 SUCCESS) → 방금 잠근 행이 잠김
   │     ── login.blocked(locked) → 401 ERR_LOGIN_FAILED   (잠긴 동안은 맞든 틀리든 같은 401 — §14 R7)
   ├ isResigned(resignAt, now) ── login.blocked(resigned) → 403 ERR_RESIGNED_USER
   ├ ADMIN_ACCESS_POLICY 있음 → principal = findPrincipal(userNo) → allows({ clientIp, userNo, teamNos })
   │     false ── login.blocked(ip) → 403 ERR_IP_NOT_ALLOWED { clientIp }
   └ 성공 ── 세션 INSERT(loginAt = lastAccessAt = now) · 액세스 서명
             · login.success → 쿠키 둘 → 200
```

메시지: 실패 · 잠김(로그인 — 같은 401) `아이디 또는 비밀번호가 올바르지 않거나, 로그인 실패가 반복되어 잠시 잠겼습니다.` · 퇴사 `퇴사한 계정입니다.` · IP `허용되지 않은 접속 위치입니다.` · 잠김(비밀번호 변경 · 재인증의 423) `로그인 실패가 반복되어 계정이 잠겼습니다. 잠시 후 다시 시도해 주세요.`

### 5-2. 매 요청 (`AdminAuthGuard` → `AdminAuthService.authenticate`)

```
@Public ────────────────────────────────────────── 통과
access 쿠키(문자열 · 비어 있지 않음) 없음 ──────── 401 ERR_COMMON_UNAUTHORIZED  인증이 필요합니다.
JWT 검증(HS256 만, clockTimestamp = now)
  TokenExpiredError ────────────────────────────── 401 ERR_EXPIRED_TOKEN        접근 토큰이 만료되었습니다.
  그 밖 · 클레임이 bigint 래퍼가 아님 ──────────── 401 ERR_INVALID_TOKEN        유효하지 않은 접근 토큰입니다.
세션 = findByNo(sessionNo)
  없음 · 폐기 · userNo 불일치 ──────────────────── 401 ERR_INVALID_TOKEN        세션이 유효하지 않습니다.
  isSessionExpired(expireAt, now) ──────────────── 401 ERR_SESSION_EXPIRED      세션이 만료되었습니다.
principal = findPrincipal(userNo)
  null ─────────────────────────────────────────── 401 ERR_INVALID_TOKEN
  퇴사 ─────────────────────────────────────────── 403 ERR_RESIGNED_USER
  정책 거부 ──── access.blocked(ip) ────────────── 403 ERR_IP_NOT_ALLOWED { clientIp }
req.admin = { …principal, sessionNo, permissions: 강제 변경이면 [] }
```

`AdminPermissionGuard`(순서는 §14 R3 — 권한 선언이 `@SelfOnly` 보다 먼저):

```
rpc · ws 컨텍스트 ─────────────────────── 통과 · 그 밖의 비HTTP ── 401(§14 R10 — AdminAuthGuard 도 같다)
@Public ──────────────────────────────── 통과
req.admin 없음 ───────────────────────── 401 ERR_COMMON_UNAUTHORIZED
강제 변경 계정 · 허용 표시 없음 ──────── 403 ERR_PASSWORD_CHANGE_REQUIRED  비밀번호를 바꾼 뒤 이용할 수 있습니다.
권한 선언 있음
   @RequirePermissions 실패 · @RequireAnyPermissions 실패 ── 403 ERR_COMMON_FORBIDDEN  권한이 없습니다.
   (둘 다 선언되면 둘 다 통과해야 한다. '*' 는 정확 일치 — admin-shared 판정 함수) · 통과
@SelfOnly ────────────────────────────── 통과
선언 없음 ────────────────────────────── failClosed ? 403 ERR_COMMON_FORBIDDEN { reason: 'no-permission-declared' } : 통과
```

DB 왕복 둘(세션 · 주체). `lastAccessAt` 은 쓰지 않는다.

### 5-3. 회전 (`AdminAuthService.refresh(token, req)`)

```
token(문자열 · 비어 있지 않음) 없음 ─── 401 ERR_COMMON_UNAUTHORIZED  갱신 토큰이 없습니다.
row = findByRefreshHash(sha256(token))       ← 트랜잭션 밖
├ null ──────────────────────────────── 401 ERR_INVALID_TOKEN  유효하지 않은 갱신 토큰입니다.
├ row.isRevoked
│   ├ 'rotated' ── reuseOfRotated(row)                                     (P2)
│   └ 그 밖 ────────────────────────── 401 ERR_INVALID_TOKEN  세션이 종료되었습니다. 다시 로그인해 주세요.
├ isSessionExpired ──────────────────── 401 ERR_SESSION_EXPIRED  갱신 토큰이 만료되었습니다.
├ assertActive(userNo) — cred null → 401 ERR_INVALID_TOKEN, 퇴사 → 403 ERR_RESIGNED_USER
└ newNo = store.rotate(row, meta, now)  ← runWriteTransaction (B3)
    ├ null(조건부 UPDATE 0행 — 다른 요청이 먼저 회전)                      (P1)
    │   ├ graceMs = 0 ── 401 ERR_INVALID_TOKEN  이미 갱신된 토큰입니다. 잠시 후 다시 시도해 주세요.
    │   └ 그 밖 ──────── row' = findByNo(row.sessionNo)  🔴 트랜잭션 밖에서 다시 읽는다 → reuseOfRotated(row')
    └ 성공 ── 액세스 서명 · token.refresh(grace false) → 쿠키 둘 → 200

reuseOfRotated(row):
  successor = row.replacedBySessionNo == null ? null : findByNo(row.replacedBySessionNo)
  judgeRotatedReuse(row, successor, now, graceMs)
  ├ 'grace' ── assertActive · 새 세션 INSERT(loginAt = row.loginAt, 링크 없음) · token.refresh(grace true) → 200
  │            🔴 이긴 탭의 세션은 건드리지 않는다 — 원문을 저장하지 않으니 같은 쿠키를 줄 수 없다(gise)
  └ 'reuse' ── revokeAllOfUser(userNo, 'reuse_detected', 살아 있는 행만) · token.reuse
               → 401 ERR_REFRESH_REUSED  이미 사용된 갱신 토큰입니다. 다시 로그인해 주세요.
```

`store.rotate` 한 트랜잭션:

```sql
UPDATE sessions SET is_revoked = 1, revoked_reason = 'rotated', revoked_at = :now
 WHERE session_no = :old AND is_revoked = 0                  -- 0행이면 null 을 돌려주고 끝(커밋할 쓰기 없음)
INSERT INTO sessions (user_no, refresh_token_hash, user_agent, ip_address, login_at, last_access_at, expire_at)
     VALUES (:userNo, :hash, :ua, :ip, :oldLoginAt, :now, :now + refreshTtl)
UPDATE sessions SET replaced_by_session_no = :new WHERE session_no = :old AND replaced_by_session_no IS NULL
```

- 🔴 InnoDB 의 UPDATE 는 잠금 읽기라 REPEATABLE READ 에서도 최신 커밋 버전을 본다 — 진 쪽은 이긴 쪽 커밋까지 기다렸다가 `is_revoked = 0` 이 거짓이 되어 0행을 받는다.
- 🔴 P1 의 재조회는 트랜잭션이 끝난 뒤다. 트랜잭션 안의 평범한 SELECT 는 스냅숏이라 회전 전 버전(`revokedAt` null)을 본다.
- `judgeRotatedReuse` 가 `'grace'` 인 조건(모두): `graceMs > 0` · `revokedAt` 기준 경과가 `-CLOCK_SKEW_TOLERANCE_MS` 이상 `graceMs` 이하 · 후계 있음 · 후계 `userNo` 가 같음 · 후계 살아 있음 · 후계 만료 전. `replacedBySessionNo` null → 후계 없음(B4).
- `revokeAllOfUser` 는 `WHERE user_no = ? AND is_revoked = 0` — 이미 폐기된 행의 사유를 덮지 않는다(hangang R34).

### 5-4. 비밀번호 변경 · 재인증 · 로그아웃

**비밀번호 변경** (`AdminAuthService.changePassword(principal, body, req)`, 본문은 이미 정책 스키마를 지났다 — 길이 · 새 = 현재는 400 `ERR_COMMON_VALIDATION` 이 저절로):

```
cred = findCredentialByNo(userNo) — null → 401 ERR_COMMON_UNAUTHORIZED
isLocked ── 423 ERR_ACCOUNT_LOCKED
verifyPassword(cred.passwordHash, currentPassword) 거짓
   ── updateLoginState(FAIL) → validationError([{ path: ['currentPassword'], code: 'custom',
                                                message: '현재 비밀번호가 올바르지 않습니다.' }])   (3c W1)
newHash = hashPassword(newPassword)                     ← 트랜잭션 밖
runWriteTransaction:
   changePassword(trx, userNo, cred.passwordHash, newHash) = 0 → 409 ERR_COMMON_CONFLICT
                                                               동시 요청이 충돌했습니다. 다시 시도해 주세요.
   revoked = revokeAllOfUser(userNo, 'terminated', { exceptSessionNo: principal.sessionNo, trx })
password.change { revokedCount } → 200          현재 세션 · 쿠키는 그대로
```

**재인증** (`AdminReauthService.verify`): `findCredentialByNo` → null 401 → 잠김 423 → 틀리면 `updateLoginState(FAIL)` · 403 `ERR_REAUTH_REQUIRED` `비밀번호가 올바르지 않습니다.` → 맞으면 카운터 · 잠금이 남아 있을 때만 `updateLoginState(SUCCESS)`. 이벤트는 내지 않는다(감사는 그 쓰기의 `@Audit` 몫 — 2c).

**로그아웃**: refresh 쿠키가 문자열이면 `findByRefreshHash` → 살아 있으면 `revoke(sessionNo, 'terminated')` · `logout` 이벤트. 🔴 이미 폐기된 행의 사유를 덮지 않는다(그 행이 `'rotated'` 면 재사용 탐지가 무력화된다, gise). 모르는 토큰 · 쿠키 없음도 200. 쿠키는 늘 지운다.

**강제 변경**: 로그인은 성공한다. `/me` 는 200 + `isPasswordChangeRequired: true` · `permissions: []`. 가드가 허용 표시 없는 인증 라우트를 403 `ERR_PASSWORD_CHANGE_REQUIRED` 로 막는다. refresh · logout 은 `@Public` 이라 그대로 된다. 비밀번호를 바꾸면 플래그가 풀리고 화면이 `appStore.refresh()` 로 `/me` 를 다시 읽는다(admin-ui README).

### 5-5. 시계 경계

판정 함수는 모두 `now: Date` 를 인자로 받는다. 서비스는 요청마다 `new Date()` 하나를 만들어 넘긴다.

| 판정                   | 참인 조건                                             | 같은 순간 |
| ---------------------- | ----------------------------------------------------- | --------- |
| `isLocked`             | `lockUntil != null && lockUntil > now`                | 풀림      |
| `isSessionExpired`     | `expireAt <= now`                                     | 만료      |
| `isResigned`           | `resignAt != null && resignAt <= now`                 | 퇴사      |
| `isWithinRefreshGrace` | `-5000 <= now - revokedAt <= graceMs` (`graceMs > 0`) | 창 안     |
| JWT 만료(jsonwebtoken) | `floor(now / 1000) >= exp`                            | 만료      |

`nextLoginState(state, 'FAIL', now, lockout)`: 잠금이 끝났으면(`lockUntil != null && !isLocked`) 0부터, `+1`, 잠긴 동안은 `lockUntil` 그대로, 아니면 `maxFailures` 에 닿을 때 `now + lockMs`. `'SUCCESS'` 는 `{ 0, null }`.

### 5-6. 쿠키 (`src/auth/cookies.ts`)

- `baseCookieOptions(req, cookies)` = `{ httpOnly: true, sameSite, secure, path, domain }` — 🔴 set 과 clear 가 이 함수 하나를 쓴다(path 가 어긋난 `clearCookie` 를 브라우저는 무시한다, crm 사고). `secure: 'auto'` 는 부를 때마다 `req.secure ‖ X-Forwarded-Proto 첫 값(쉼표 앞, 소문자) === 'https' ‖ process.env.NODE_ENV === 'production'` — 모듈 최상위에서 읽으면 `loadDotEnv()` 보다 먼저 굳는다(hangang A9-2). 헤더만 믿으면 클라이언트가 Secure 를 벗길 수 있어 NODE_ENV 를 OR 로 둔다(hangang 08편).
- 액세스 쿠키 `Path=/` · `maxAge = accessTtlMs`, refresh 쿠키 `Path = refreshPath ?? '/'` · `maxAge = refreshTtlMs`.
- `readCookie(req, name)`: `typeof value === 'string' && value.length > 0` 일 때만 값. 🔴 cookie-parser 는 `j:` 로 시작하는 값을 JSON 으로 풀어 객체를 줄 수 있다(2a 최종 리뷰) — 객체 · 배열 · 숫자는 "없음".
- 세션 메타: `clientIp = req.ip ?? null`(trust proxy 는 쓰는 쪽 — 2f 가 다시 본다), `userAgent = 헤더가 문자열이면 그 값`. INSERT 전에 `userAgent` 512 · `ipAddress` 45 로 자른다 — 자르지 않으면 회전 중 INSERT 가 죽는다(B3 으로 옛 행은 살아남지만 그 기기는 갱신을 못 한다).

## 6. 오류 표

| 상황                                            | 상태 | 코드                           | 자리                 |
| ----------------------------------------------- | ---- | ------------------------------ | -------------------- |
| 본문 검증 실패 · 틀린 현재 비밀번호             | 400  | `ERR_COMMON_VALIDATION`        | 파이프 · 변경        |
| 쿠키 없음 · `req.admin` 없음                    | 401  | `ERR_COMMON_UNAUTHORIZED`      | 가드 · 회전          |
| 아이디 · 비밀번호 불일치 · 잠긴 계정의 로그인   | 401  | `ERR_LOGIN_FAILED`             | 로그인               |
| 액세스 토큰 만료                                | 401  | `ERR_EXPIRED_TOKEN`            | 가드                 |
| 위조 · 형식 오류 · 폐기 · 모르는 refresh · 경합 | 401  | `ERR_INVALID_TOKEN`            | 가드 · 회전          |
| 세션 만료                                       | 401  | `ERR_SESSION_EXPIRED`          | 가드 · 회전          |
| 회전된 refresh 재제시(창 밖)                    | 401  | `ERR_REFRESH_REUSED`           | 회전                 |
| 권한 없음 · 선언 없음                           | 403  | `ERR_COMMON_FORBIDDEN`         | 권한 가드            |
| 퇴사                                            | 403  | `ERR_RESIGNED_USER`            | 로그인 · 가드 · 회전 |
| IP 거부                                         | 403  | `ERR_IP_NOT_ALLOWED`           | 로그인 · 가드        |
| 강제 변경 계정의 다른 라우트                    | 403  | `ERR_PASSWORD_CHANGE_REQUIRED` | 권한 가드            |
| 재인증 실패                                     | 403  | `ERR_REAUTH_REQUIRED`          | 재인증               |
| 비밀번호 동시 변경                              | 409  | `ERR_COMMON_CONFLICT`          | 변경                 |
| 잠김                                            | 423  | `ERR_ACCOUNT_LOCKED`           | 변경 · 재인증        |

모두 admin-shared `COMMON_ERROR_STATUS` 에 이미 있다 — 새 코드는 없다. 🔴 갱신해도 풀리지 않는 거부(잠김 · 퇴사 · IP · 강제 변경)가 401 이 아닌 것은 admin-ui 클라이언트의 갱신 루프를 막기 위해서다(admin-shared 표 주석).

## 7. 의존성

- `dependencies` 추가: `@nestjs/jwt` `^12.0.2`(J1 — 내부 `jsonwebtoken` 9.0.3, `@types/jsonwebtoken` 동반), `@node-rs/argon2` `^2.2.2`(E1 — 2.2.2 의 optionalDependencies 에 win32-x64-msvc · linux-x64-gnu · linux-x64-musl · darwin 프리빌드). 기존 `cookie-parser` 유지.
- peer · dev 변화 없음. admin-shared 변화 없음(새 코드 · 스키마 없음 — dist 재빌드 불필요).

## 8. 파일

| 파일 (`packages/admin-server/src/…`)                                                   | 내용                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `auth/password.ts`                                                                     | `hashPassword` · `verifyPassword` · `DUMMY_PASSWORD_HASH`(→ runner)                   |
| `auth/refresh-token.ts`                                                                | `createRefreshToken` · `hashRefreshToken`                                             |
| `auth/login-policy.ts` · `refresh-policy.ts` · `account-policy.ts`                     | §5-5 순수 함수 · `judgeRotatedReuse`                                                  |
| `auth/options.ts`                                                                      | `resolveAuthOptions` · 해석된 설정 타입 · 내부 토큰                                   |
| `auth/cookies.ts`                                                                      | §5-6                                                                                  |
| `auth/access-token.service.ts`                                                         | `AdminAccessTokenService` — `sign(userNo, sessionNo)` · `verify(token, now)`          |
| `auth/auth.repository.ts` · `kysely-auth.repository.ts`                                | §4-3                                                                                  |
| `auth/session.store.ts`                                                                | `create` · `findByRefreshHash` · `findByNo` · `rotate` · `revoke` · `revokeAllOfUser` |
| `auth/hooks.ts` · `principal.ts` · `decorators.ts`                                     | §4-4 · §4-6                                                                           |
| `auth/auth.service.ts` · `reauth.service.ts`                                           | §5                                                                                    |
| `auth/auth.guard.ts` · `permission.guard.ts`                                           | §5-2                                                                                  |
| `auth/auth.controller.ts` · `auth.pipes.ts`                                            | §4-9                                                                                  |
| `auth/admin-auth.module.ts`                                                            | §4-2                                                                                  |
| `tokens.ts` · `options.ts` · `admin-server.module.ts` · `index.ts` · `runner.ts`       | 토큰 · 메타 키 · 옵션 타입 · `ADMIN_ROUTE_MODULES` · export                           |
| `database/tables/users.ts` · `database/migrations/0002_users.ts`                       | `resignAt` 주석(R1, §13)                                                              |
| `test-support/auth.ts`                                                                 | 계정 시드(미리 해시) · 쿠키 에이전트 · 잠금 연결 · 가짜 정책 · 이벤트                 |
| `*.test.ts`(옆에) · `*.db.test.ts`                                                     | §9                                                                                    |
| `packages/admin-server/package.json` · `README.md` · `.changeset/admin-server-auth.md` | §7 · §10                                                                              |
| `docs/01-phase0.md` · `docs/HANDOFF.md` · `CLAUDE.md` · 2a 스펙                        | §10 · §13                                                                             |

정본에서 가져온 파일은 머리 주석에 정본 · 바꾼 점 · 🔴(지우면 사고가 나는 이유)를 적는다(/port 규약).

## 9. 테스트 계약

TDD — 실패하는 테스트부터. 세 층(2a D1).

### 9-1. 단위 (`pnpm check`)

- **비밀번호**: 인코딩이 `$argon2id$v=19$m=65536,t=3,p=4$`, 같은 입력 검증 참 · 다른 입력 거짓, `DUMMY_PASSWORD_HASH` 는 같은 매개변수이고 빈 문자열 · 임의 입력 모두 거짓.
- **refresh 토큰**: 128자 소문자 hex, 두 번 다름, sha256 64자 hex · 결정적.
- **정책**: §5-5 의 모든 판정을 같은 순간 · 1ms 전 · 1ms 후로. `nextLoginState` — 실패 1~4 잠금 없음 · 5회째 `now + lockMs` · 잠긴 동안 실패해도 `lockUntil` 그대로(카운트는 오름) · 잠금 만료 뒤 첫 실패 1 · 성공 `{0, null}` · 사용자 `lockout` 값. `isWithinRefreshGrace` — −5000 참 · −5001 거짓 · graceMs 참 · graceMs+1 거짓 · `revokedAt` null 거짓 · graceMs 0 거짓. `judgeRotatedReuse` — 후계 없음 · 다른 userNo · 후계 폐기 · 후계 만료 · `replacedBySessionNo` null 은 `'reuse'`, 모두 만족이면 `'grace'`.
- **옵션 해석**: 기본값 표, §4-1 의 던지는 경우 각각, 메시지에 비밀키 값이 없음.
- **쿠키**: `secure: 'auto'` 경우의 수(req.secure · `X-Forwarded-Proto: https` · `'https, http'` 첫 값 · `HTTP` 대문자 · NODE_ENV) · `true` · `false`, set 과 clear 의 속성이 같음, `refreshPath` · `domain` 반영, `readCookie` — 문자열 · 빈 문자열 · 객체(`j:`) · 배열 · 없음.
- **액세스 토큰**: `sign` → `verify` 가 bigint 둘을 돌려줌, `exp` 경계(`clockTimestamp` = exp−1 통과 · exp 만료), 다른 비밀키 · `alg: none` · HS512 · 잘린 토큰 → 위조, 클레임이 숫자 · 없음 → 위조.
- **권한 가드**(Reflector + 가짜 `ExecutionContext`): §5-2 표의 모든 행, 클래스 · 핸들러 메타 우선순위(`getAllAndOverride`), `failClosed: false`.
- **`/me` 투영**: `sessionNo` 없음, null 팀은 키 없음, 강제 변경 계정 `permissions: []`.
- **기존 테스트**: 🔴 `runner` 그래프(`hashPassword` 를 더해도 `@nestjs/` 없음), 2a 데코레이터 메타데이터 테스트에 새 서비스 생성자 주입.

### 9-2. DB 없는 HTTP (`pnpm check`, `AdminServerModule` + `AdminAuthModule` + 프로브 컨트롤러, 닿지 않는 DB 주소)

DB 에 닿기 전에 끝나는 경로만: 라우트가 `/admin/auth/*` 에 있음 · 프로브 `@Public` 200 · 표시 없는 프로브는 쿠키 없이 401 · `j:` 쿠키 401 `ERR_COMMON_UNAUTHORIZED` · 위조 JWT 401 `ERR_INVALID_TOKEN` · 만료 JWT 401 `ERR_EXPIRED_TOKEN` · 로그인 본문 400(`issues` 경로 배열) · 쿠키 없는 refresh 401 · 쿠키 없는 logout 200 + 두 쿠키를 지우는 `Set-Cookie`(같은 Path). 기동 검사: `auth` 없음 · 짧은 비밀키 · 같은 쿠키 이름은 `init()` 이 던짐, `failClosed: false` 는 경고 로그.

### 9-3. 실 MariaDB (`pnpm test:db`, 파일마다 새 데이터베이스)

- **리포지토리**: 대표 팀(두 팀 소속이면 작은 teamNo · 팀 없으면 null), 권한 JSON 이 객체 · 숫자 원소면 `[]` · 문자열만, `changePassword` 기대 해시 불일치 0행 · 일치 1행 + 플래그 · 카운터 · 잠금 초기화, userId 대소문자(ci) 조회.
- **세션 저장소**: `rotate` 성공(옛 행 rotated · revokedAt · 링크, 새 행 loginAt 이 옛 값) · 원자성(INSERT 가 실패하게 만들면 옛 행이 살아 있음) · 🔴 잠금 경합(별도 연결이 옛 행을 커밋 전 rotated 로 바꾼 채 `rotate` 를 부르면 기다렸다가 null) · `revokeAllOfUser` 는 살아 있는 행만(rotated · terminated 사유 보존) · `exceptSessionNo`.
- **서비스**: 로그인 다섯 갈래와 순서(가짜 정책 · 이벤트가 "어느 갈래에서 몇 번" — 비밀번호 틀린 퇴사 계정은 정책을 부르지 않음, 잠긴 계정의 맞은 비밀번호는 정책을 부르지 않고 401, 동시 틀린 비밀번호 N건은 N 으로 센다), 회전 · 유예 · 재사용, 🔴 P1 결정적 재현(별도 연결이 옛 행을 커밋 전 `'rotated'` + 살아 있는 후계로 바꾼 채 refresh → 기다렸다가 0행 → 다시 읽어 `'grace'` 로 200, graceMs 0 이면 401 `ERR_INVALID_TOKEN` 이고 `reuse_detected` 행 없음), P2(앞 회전 뒤 옛 토큰: 창 안 + 후계 생존 → 200 · 창 밖 → 전량 폐기), 후계를 로그아웃한 뒤 창 안 재제시 → 재사용, 변경 · 재인증 · 카운터 공유(B2).
- **HTTP 계약(끝 상태)**: 로그인 → 쿠키 속성(HttpOnly · `Path=/` · `SameSite=Lax` · http 에서 Secure 없음 · `X-Forwarded-Proto: https` 면 Secure) → `/me` 모양 → refresh 가 새 쿠키 둘 → 옛 refresh(창 밖) `ERR_REFRESH_REUSED` + 다른 기기 세션도 401 → Promise.all 동시 refresh 둘 다 200. 틀림 401 · 5회째 잠김 · 맞은 비밀번호도 401 · `lockUntil` 을 과거로 바꾸면 성공. 퇴사 계정 로그인 · 가드 · refresh 403. 세션 `expireAt` 을 과거로 → `ERR_SESSION_EXPIRED`. 선언 없는 프로브 403 · `'*'` 역할 통과 · AND/OR. 강제 변경 계정 `/me` 200 + `permissions: []` · 다른 `@SelfOnly` 403 `ERR_PASSWORD_CHANGE_REQUIRED` · refresh 200. 비밀번호 변경 — 틀린 현재 400 `issues[0].path = ['currentPassword']` + 카운터 증가 · 새 = 현재 400 `newPassword` · 잠김 423 · 성공 200 → 플래그 해제 · 다른 기기 refresh `ERR_INVALID_TOKEN` · 현재 세션 유지 · 새 비밀번호로 로그인. 로그아웃 — 두 쿠키 지움 · 그 뒤 옛 refresh `ERR_INVALID_TOKEN`(재사용 아님 · 다른 세션 살아 있음). IP 자리 — 가짜 정책 거부 시 로그인(비밀번호 맞은 뒤) · 가드에서 403 `details.clientIp`. 응답 본문이 모두 admin-shared `errorRespSchema` 로 파싱.
- **시계**: HTTP 층에서는 DB 값을 지금 ±2초로 넣는다. 같은 순간은 9-1 이 맡는다.

### 9-4. 리뷰 초점 (플랜 · 리뷰어에게 넘긴다)

1. 만료 직전 · 직후의 시계 경계 — 같은 순간의 판정이 §5-5 표와 같은가, `now` 하나를 요청 내내 쓰는가.
2. 동시 refresh 두 건 — P1 · P2 가 같은 판정을 쓰는가, 재조회가 트랜잭션 밖인가, 유예 0 에서 전량 폐기가 일어나지 않는가.
3. 위조 쿠키와 객체 쿠키 — 문자열 검사가 두 쿠키 · 세 라우트 모두에 있는가, `alg` 고정.
4. 잠금 해제 시각의 경계 — 만료 뒤 첫 실패가 1부터인가, 잠긴 동안 연장이 없는가, 세 자리가 같은 카운터를 쓰는가.
5. 퇴사 · 강제 변경 계정의 refresh — 퇴사는 회전 전에 막고 유예 경로에서도 막는가, 강제 변경은 회전되는가.

## 10. 릴리스 · 문서

- **changeset**(`.changeset/admin-server-auth.md`, admin-server **minor**). 첫 줄은 쓰는 쪽이 할 일: `AdminServerModule.forRootAsync` 의 `useFactory` 에 `auth: { jwtSecret }`(32자 이상, 보통 `ADMIN_JWT_SECRET`)과 선택 `passwordPolicy` 를 더하고 `AdminAuthModule` 을 import 한다. 🔴 관리자가 아닌 컨트롤러(회원 · 공개 · 헬스체크)에 `@Public()` 을 붙인다 — 안 붙이면 401. 이어서 새 API 요약. 미발행이라 npm 에는 나가지 않는다(2a §1-4 #7).
- **admin-server README** "인증" 절: 배선(`app.module.ts` · env), 라우트 표와 admin-ui 배선(`baseURL: '/api/admin'` · `refreshPath` · `noRetryPaths`), 쿠키 옵션과 Secure 판정(프록시 · http 개발 서버에서 쿠키가 안 앉는 이유 — admin-ui `SessionNotEstablishedError`), 데코레이터(회원 라우트 `@Public` 안내 · 권한 유니온으로 감싸기), 강제 변경 흐름, 재인증, `withRepository`(gise 형 컬럼 예시 · `isActive` → `resignAt`), IP · 이벤트 자리, 로그인 시도 제한은 edge(nginx) · throttler(B) 몫, 시드에 `hashPassword`(runner).
- **`docs/01-phase0.md`**: §3-2 표의 `auth` · `cookies` · `permissions` 행을 실제 옵션(§4-1)으로 고친다(`repository` → `withRepository`, `principalMapper` · `refreshMode` · `reusePolicy` · `loginFailure` · `checkSessionOwnership` · `logoutRequiresAuth` 는 고정 동작으로, `catalog` · `selfOnlyKey` · `extraGuards` 는 2b 범위 밖), §2-3 아래 "PR 2b 경계 결정(2026-10-09)" 한 단락(이 스펙 §2-1 로 연결), §8 admin-server 행(2b 진행 · 테스트 수).
- **`docs/HANDOFF.md` · `CLAUDE.md`**: 진행 표에 2b 완료, 다음 플랜은 2c 세션 · 감사(2a 스펙 §1-3 의 2c 행 + 이 스펙 §4-6 · §11). HANDOFF "알려진 미확인" 의 2b 항목 둘을 닫는다(`j:` 쿠키 — §5-6, 스텁 정규식 — 2b 는 장을 더하지 않아 해당 없음, 숫자 든 장을 더하는 PR 로 넘긴다).

## 11. 비범위 · 보류

- 세션 목록 · 끊기 6라우트 · 감사(`@Audit` · 인터셉터 · `auditLogs`) · 인증 이벤트를 감사 행으로 쓰는 것 → 2c. 2c 는 `AdminSessionStore` 에 목록 메서드를 더하고 `ADMIN_AUTH_EVENTS` 를 제공한다.
- IP 평가 · `request-ip.util`(X-Real-IP 우선 · IPv6) · trust proxy → 2f. 2f 는 `ADMIN_ACCESS_POLICY` 를 제공하고 `clientIp` 출처를 다시 본다.
- 사용자 생성 · 퇴사(효력 시각 계산) · 비밀번호 초기화(임시 비밀번호 · 세션 폐기) · 잠금 해제 · `revision` 사용 → 2d.
- 로그인 시도 제한(IP 단위 throttler) → B(edge · `@nestjs/throttler`). 계정 단위 잠금과 argon2 비용이 패키지 몫이다(gise).
- refresh 의 절대 수명(최초 로그인 기준 상한) — 정본에 없다. 회전마다 7일이 다시 시작된다.
- `lastLoginAt` · `lastLoginIp`(gise) — 코어 컬럼이 아니다. 쓰는 쪽은 `login.success` 이벤트로 남긴다.
- 만료 세션 행 청소 스케줄러(hangang `CleanupScheduleModule`) → B.
- 다중 팀 IP 평가 — 대표 팀 하나만(hangang R34).
- 프로젝트 `/me` 필드 확장 옵션 · Swagger · 회원 인증.

## 12. 플랜에서 먼저 확인할 위험

플랜을 쓰기 전에 스크래치(`%TEMP%` 짧은 경로)와 실 MariaDB 11.4 에서 확인하고 결과를 §14 에 적는다.

1. **`@nestjs/jwt` 12 를 ESM(NodeNext)에서 import 하는가.** `JwtService` 생성자에 옵션을 직접 넘겨 쓸 수 있는가, `TokenExpiredError` 를 `instanceof` 로 가를 수 있는가(내부 `jsonwebtoken` 은 CJS), `verify` 의 `clockTimestamp` · `algorithms` 가 그대로 넘어가는가.
2. **`@node-rs/argon2` 2.2.2 프리빌드.** 이 저장소(pnpm 12 · Windows)와 Linux(CI)에서 설치되는가, 해시 · 검증 한 번이 몇 ms 인가 — DB 테스트의 시간 제한과 계정 시드 방식(미리 해시)을 정한다.
3. **같은 클래스의 동적 모듈(`withRepository`)에 `RouterModule` prefix 가 붙는가**, 기능 모듈이 등록한 `APP_GUARD` 가 앱의 다른 모듈 라우트에도 걸리는가(Nest 12.1.2).
4. **MariaDB 11.4 잠금 경합.** 별도 연결이 커밋 전 UPDATE 로 행을 잡은 동안 같은 행의 조건부 UPDATE 가 기다렸다가 커밋 뒤 0행을 받는가(`innodb_lock_wait_timeout` 기본 50초 안에서) — P1 재현 방법.
5. **supertest 쿠키.** `request.agent` 가 `Path=/` 쿠키를 다시 싣는가, `Set-Cookie` 의 지우기(`Expires` 과거)를 읽을 수 있는가.

## 13. 선행 문서 정정

- **2a 스펙 §7** "`@nestjs/jwt` 는 2b"(peer 목록) → `dependencies`(① J1). 2a 스펙 본문은 고치지 않고 이 절이 이긴다 — 2a §1-2 ⑤ E1 의 기준을 적용한 결과다.
- **`users.resignAt` 의 뜻**(④ R1): 2a 타입 주석 "NULL 이 아니면 퇴사" 와 0002 장의 컬럼 주석을 "퇴사 효력 시각 — 이 시각부터 로그인 · 요청이 막힌다. NULL = 재직" 으로 고친다(미발행 — 2a 결정 ⑥ V1 이 장 수정을 허용한다. DDL 식별자는 바뀌지 않는다).
- **Phase 0 §3-2 표**: §10 대로.

## 14. 구현 중 정정

- **R1 — §12 위험 1~5 실측(2026-10-13, 플랜 전, `%TEMP%\ak2b` · MariaDB 11.4).**
  1. `@nestjs/jwt` 12.0.2 는 ESM 으로 import 된다. `new JwtService({ secret, signOptions, verifyOptions })` 를 직접 만들어 쓴다. `verify(token, { clockTimestamp })` 는 기본 `verifyOptions`(`algorithms: ['HS256']`)와 합쳐진다 — `clockTimestamp = exp` 면 `TokenExpiredError`(`instanceof` 로 가른다), `exp − 1` 은 통과. 다른 비밀키 · 잘린 토큰은 `JsonWebTokenError`, HS512 는 `invalid algorithm`, `alg: none` 은 `jwt signature is required`.
  2. `@node-rs/argon2` 2.2.2 는 Windows 에서 프리빌드로 설치되고 m=64MiB · t=3 · p=4 해시 · 검증이 각 약 15ms 다 — DB 테스트는 시드마다 그냥 해시한다(미리 해시한 상수 불필요). 깨진 해시의 `verify` 는 `Decoding failed` 로 던진다 → 500(마스킹). `Algorithm` 은 const enum 이라 `isolatedModules` 에서 값으로 못 쓴다 — 숫자 `2` 를 쓴다(gise 와 같다).
  3. `RouterModule.register([{ path: 'admin', module: AdminAuthModule }])` 는 정적 import 와 같은 클래스의 동적 모듈(`withRepository`) 모두에 prefix 를 붙인다. 기능 모듈이 등록한 `APP_GUARD` 는 다른 모듈의 라우트에도 걸린다. `inject: [{ token, optional: true }]` 팩토리로 기본 · 교체 리포지토리를 가른다.
  4. MariaDB 11.4(REPEATABLE READ): 별도 연결이 커밋 전 UPDATE 로 행을 잡은 동안 autocommit SELECT 는 옛 버전을 보고(막히지 않는다), 같은 행의 조건부 UPDATE 는 상대 커밋까지 기다렸다가(≈0.5초) 0행을 받는다 — P1 을 결정적으로 재현할 수 있다.
  5. supertest `request.agent` 는 `Path=/` 쿠키를 다시 싣는다. Express 5 `clearCookie` 는 `maxAge` 를 무시하고 `Expires=Thu, 01 Jan 1970` 을 낸다. cookie-parser 는 `j:{"a":1}` · `j:[1]` 을 객체 · 배열로 푼다. trust proxy 없이는 `X-Forwarded-Proto: https` 가 `req.secure` 를 바꾸지 않는다 — `'auto'` 가 헤더를 직접 읽는 이유다.
- **R2 — §5-3 의 "트랜잭션 안의 평범한 SELECT 는 회전 전 버전을 본다" 는 부정확하다(R1-4 실측).** 트랜잭션의 첫 문장이 잠금 읽기(UPDATE)면 아직 읽기 뷰가 없어, 그 뒤의 SELECT 는 커밋된 최신 값을 본다. P1 재조회를 트랜잭션 밖에 두는 결정은 그대로다 — 읽기 뷰가 만들어지는 시점에 기대지 않는다.
- **R3 — 권한 가드는 권한 선언을 `@SelfOnly` 보다 먼저 본다(§5-2 순서 정정, 플랜).** hangang 은 `@SelfOnly` 면 곧바로 통과시켜, 클래스에 `@SelfOnly` · 메서드에 `@RequirePermissions` 가 함께 있으면 권한 검사 없이 열렸다(`getAllAndOverride` 가 클래스 값을 돌려준다). 이제 순서는 `@Public` → 주체 → 강제 변경 → **권한 선언이 있으면 그것을 판정** → 없고 `@SelfOnly` 면 통과 → 둘 다 없으면 fail-closed. 선언한 권한은 늘 지켜진다.
- **R4 — HTTP 가 아닌 실행 컨텍스트(마이크로서비스 · WebSocket)는 두 가드 모두 통과시킨다(플랜).** 가드가 앱 전역(G1)이라 쓰는 쪽 RPC 핸들러에도 걸리는데, 쿠키 인증을 할 수 없는 자리를 막으면 그 핸들러가 전부 깨진다. 관리자 인증은 HTTP 만 지킨다(2a F4 봉투와 같은 규칙).
- **R5 — 시각 컬럼 `datetime` · `timestamp` 는 초 단위로 잘려 저장된다(MariaDB 기본, gise 실측).** `revokedAt` · `expireAt` · `lockUntil` 은 앱이 넣은 시각보다 1초 미만 이를 수 있다 — 유예창 경과가 그만큼 길게, 잠금이 그만큼 일찍 풀린다. 경계의 같은 순간은 단위 층(§9-1)이 재고, DB 층은 ±2초로 잰다(§9-3).
- **R6 — 작은 파일 셋을 더한다(§8 보강).** `auth/password-check.ts`(비밀번호 확인 세 자리의 카운터 공용 함수 — B2) · `auth/request-meta.ts`(`clientIp` · `userAgent` 를 요청에서 꺼낸다) · `auth/errors.ts`(§5 의 문구 표 `AUTH_MESSAGES` — 서비스 · 가드 · 테스트가 같은 문구를 쓴다). 테스트 하네스는 `test-support/auth.ts`(DB 시드 · 서비스 조립 · 잠금 연결 · 가짜 정책 · 이벤트)와 `test-support/auth-probe.ts`(프로브 컨트롤러 · 앱 부트)로 나눈다.
- **R7 — 잠김은 맞은 비밀번호 바로 다음, 퇴사 · IP 보다 먼저 보고, 잠긴 동안의 로그인은 같은 401 이다(최종 리뷰 Critical, 사용자 결정 2026-10-13).** 잠긴 동안 틀린 비밀번호는 401 · 맞은 비밀번호는 423 이면 잠금 중에도 대입을 계속해 정답을 알아낸다(판정 오라클). 그래서 로그인은 잠긴 동안 맞든 틀리든 같은 401 `ERR_LOGIN_FAILED` 이고 문구는 `아이디 또는 비밀번호가 올바르지 않거나, 로그인 실패가 반복되어 잠시 잠겼습니다.` 하나다. 423 은 이미 인증된 본인의 비밀번호 변경 · 재인증에만 남는다. 정본 gise · hangang 은 423 이었다.
- **R8 — 실패 카운터는 원자적이다(최종 리뷰 F2).** `saveLoginState(userNo, state)` 를 `updateLoginState(userNo, next)` 로 바꿨다 — 행을 잠그고(`FOR UPDATE`) 현재 값에서 다음 상태를 셈한다. 검증 전 스냅숏으로 셈하면 병렬 틀린 비밀번호가 덜 센다. 맞은 비밀번호도 방금 잠근 행으로 잠김을 판정한다. `next` 가 값을 바꾸지 않으면 UPDATE 를 건너뛴다 — 카운터가 이미 { 0, null } 인 정상 로그인이 매번 쓰기를 치르지 않는다(최종 리뷰 후속, 2026-10-14).
- **R9 — `AdminAuthModule` 은 전역이고 한 번만 등록한다(최종 리뷰 F3).** 두 번째 import 는 가드 · 라우트를 둘로 만들고 하나는 기본 리포지토리로 돈다. `@Global()` 로 다른 모듈이 import 없이 `AdminReauthService` 를 주입받고, 두 번 등록되면 기동에서 던진다.
- **R10 — 가드는 rpc · ws 만 통과시킨다(R4 정정, 최종 리뷰 F4).** GraphQL 은 HTTP 위에서 쿠키를 싣고 오는데도 `getType()` 이 `'graphql'` 이라 통과했다. 그 밖의 비HTTP 컨텍스트는 401 이다. 전역 가드가 쓰는 쪽 가드보다 먼저, `@Public()` 을 읽기 전에 막으므로 같은 앱에서는 GraphQL 을 열 수 없다 — GraphQL 은 관리자 API 와 다른 앱(프로세스)에 둔다.
- **R(2f-1) — IP 접근 제어(2026-10-15, docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md).** refresh · 유예 발급이 퇴사 뒤 · 회전 전에 IP 를 본다(P11 — §5 refresh 흐름 "퇴사 → 회전" 이 "퇴사 → IP → 회전"). 세션 메타 clientIp 는 코어 옵션 clientIp 출처의 정규화 값이다(P10 — "req.ip ?? null" 대신). §11 "IP 평가 · request-ip.util · trust proxy → 2f" 를 그 문서가 닫는다.
