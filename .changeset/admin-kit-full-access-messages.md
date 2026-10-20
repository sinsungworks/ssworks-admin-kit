---
'@ssworks/admin-shared': minor
'@ssworks/admin-server': minor
'@ssworks/admin-ui': minor
---

ringside 둘째 보고 반영(PR 2g — `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md`).

- admin-shared: `definePermissions(…, { fullAccessOnly })` · 카탈로그 `fullAccessOnly` — 전체 권한(`'*'`) 역할만 가질 수 있는 키. 표시 없는 키가 표시된 키를 함의하면 정의할 때 던진다.
- admin-server:
  - 역할 만들기 · 권한 수정에 전권 전용 키가 있고 `'*'` 가 아니면 400 `ERR_COMMON_VALIDATION`(`issues[{ path: ['permissions'] }]`). 이름 · 기본 표시만 고치는 수정 · 사용자 배정은 보지 않는다 — 업그레이드 전에 그 키를 받은 역할은 효력이 그대로다(README 「역할 · 권한」 정리 절차).
  - 🔴 IP 접근 제어(`AdminIpAccessModule`)를 켠 앱은 카탈로그에 `fullAccessOnly: [<ipAccess.manage 키>]` 를 더해야 `AdminRolesModule` 이 기동한다. 그 키를 다른 슬롯이나 앱 기능의 권한으로도 쓰고 있었다면 그것까지 전권 전용이 된다 — IP 관리 전용 키로 나눈다.
  - 🔴 peer `@ssworks/admin-shared` 하한 0.9.0(`>=0.9.0 <1.0.0`) — 카탈로그 모양 검사가 `fullAccessOnly` 를 요구한다.
  - `AdminServerModule` 옵션 `messages` — 서버 오류 문구를 키별로 덮는다(키는 `ADMIN_SERVER_DEFAULT_MESSAGES`, 타입 `AdminServerMessages`). 같은 기본 글자는 함께 바뀌고, 오타 · 같은 글자를 다르게 덮기는 기동에서 멈춘다. 5xx 고정 문구 · 로그 · 감사는 그대로.
- admin-ui: `useRoleEditor({ fullAccessOnly })` — 표시된 칸은 꺼져 있으면 켤 수 없다(켜진 기존 역할은 끌 수 있다). 보통 `catalog.fullAccessOnly` 를 넘긴다.
