---
'@ssworks/admin-ui': minor
---

PR #3f — 감사 로그 조회 화면.

- **소비자가 할 일:** admin-ui 의 peer `@ssworks/admin-shared` 하한이 `>=0.4.0` 이 됐다(감사 카탈로그를 런타임에 쓴다). 세 패키지를 같은 번호로 설치하면 할 일이 없다.
- admin-ui 새 API: `useAuditLogs` · `AuditLogViewer`, 타입 `UseAuditLogsOptions` · `AuditLogs` · `AuditLogViewerBindings` · `AuditLogDraft` · `AuditLogFilter` · `AuditActorOption` · `AuditActionGroup` · `AuditFilterItem` · `AuditLogMessages`.
  - 입력값/적용값 분리 · 같은 조건 재적용 · 검증 실패면 조회 안 함.
  - 동작 필터 묶음(prefix · 값 끝 점)과 개별(exact).
  - 행위자 서버 검색(`searchActors` + 권한 게터, 없으면 번호 칸) · "이 사람 기록만".
  - 선택 옵션 `urlSync`(`actor` · `action` · `targetType` · `targetRefNo` · `from` · `to`).
  - 펼친 행의 바뀐 항목 diff(가린 값은 이름만) · `fieldLabels`.
- 서버 계약은 그대로다(`GET /admin/audit-logs`). 기존 API 동작은 바뀌지 않는다.
