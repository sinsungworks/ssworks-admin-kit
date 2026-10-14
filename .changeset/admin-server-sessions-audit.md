---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 스텁 한 줄을 더한다 — `export { up, down } from '@ssworks/admin-server/migrations/0008_audit_logs'`(🔴 모든 장이 필수다 — 빠지면 `assertAdminMigrationStubs` 가 멈춘다). `AdminServerModule` 옵션에 `permissions: { 'sessions.read', 'sessions.manage', 'auditLogs.read' }`(프로젝트 권한 키)와 선택 `audit: { catalog, secretKeys }` 를 더하고 `AdminAuditModule` · `AdminSessionsModule` 을 import 한다. 프로젝트 감사 액션은 admin-shared `defineAuditCatalog` 로 정의한다 — 카탈로그 밖 액션을 단 `@Audit` 은 기동에서 멈춘다.

admin-server 세션 · 감사(Phase 2 PR 2c): `AdminSessionsModule` — `/admin/sessions` 6라우트(전체 목록 · 내 세션 · 하나 끝내기 · 사용자 전체 · 내 세션 하나 · 다른 세션 모두, 지금 세션 400 · 남의 세션 404 · `{ revokedCount }`). `AdminAuditModule` — `@Audit` · 전역 감사 인터셉터(성공 · 실패, 응답 전에 기다림, 실패는 경고) · `attachAuditTarget` · `attachAuditMeta` · `attachAuditDiff` · 비밀 키 소독 · 인증 이벤트 기록(`ADMIN_AUTH_EVENTS`) · `GET /admin/audit-logs`. 권한 슬롯(`AdminServerOptions.permissions` · `AdminPermissionSlot`), 감사 장 `0008_audit_logs`, LIKE 도우미 `escapeLike` · `likeContains` · `likePrefix`. 예외 필터의 판정을 꺼냈다(동작 같음). 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: 감사 카탈로그(`CoreAuditActions` · `CoreAuditTargets` · 한국어 라벨 · `defineAuditCatalog` · `coreAuditCatalog`), 감사 행 · 조회 스키마(`adminAuditLogSchema` · `adminAuditLogQuerySchema`), 쿼리스트링 bigint 스키마 `queryBigIntSchema`.
