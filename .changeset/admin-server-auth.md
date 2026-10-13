---
'@ssworks/admin-server': minor
---

**쓰는 쪽이 할 일:** `AdminServerModule.forRootAsync` 의 `useFactory` 에 `auth: { jwtSecret }`(32자 이상 — 보통 `ADMIN_JWT_SECRET`)과 선택 `passwordPolicy` 를 더하고 `AdminAuthModule` 을 import 한다. `AdminAuthModule` 은 전역이다 — AppModule 에서 한 번만 import 한다(두 번이면 기동에서 멈춘다). 🔴 인증 · 권한 가드가 **앱 전역**이다 — 관리자가 아닌 컨트롤러(회원 · 공개 · 헬스체크 · 웹훅)에 `@Public()` 을 붙인다(안 붙이면 401). 관리자 라우트는 `@RequirePermissions` · `@RequireAnyPermissions` · `@SelfOnly` 중 하나를 선언한다(없으면 403). `users.resignAt` 은 퇴사 **효력 시각**으로 쓴다.

admin-server 인증(Phase 2 PR 2b): `AdminAuthModule`(+`withRepository`) — `/admin/auth/{login,refresh,logout,me,password}`, argon2id 비밀번호, JWT 액세스(HS256 · 15분) + sha256 저장 refresh 회전(7일), 재사용 탐지(30초 유예창), 계정 잠금(5회 · 15분, 로그인 · 변경 · 재인증이 원자적으로 공용, 잠긴 동안의 로그인은 같은 401), 퇴사 · 강제 변경, fail-closed 권한 가드와 데코레이터(`@Public` · `@SelfOnly` · `@RequirePermissions` · `@RequireAnyPermissions` · `@CurrentAdmin`), `AdminReauthService`, `AUTH_REPOSITORY` · `KyselyAuthRepository`, 선택 주입 `ADMIN_ACCESS_POLICY` · `ADMIN_AUTH_EVENTS`. 러너 진입점에 `hashPassword` · `verifyPassword`. 새 dependencies `@nestjs/jwt` · `@node-rs/argon2`. 아직 `private` 이라 npm 에 나가지 않는다.
